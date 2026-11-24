// Scheduler-quiescence wiring tests (2026-11-23).
//
// Scope, stated plainly: these tests prove the wiring — the new
// stop/read entries exist, behave as specified, and the drain-tracker
// hooks bracket the write paths. They do NOT prove any scheduler item
// quiesced: quiescence evidence is only produced by the freeze executor
// inside a freeze window, against the live process (plan §2–§3). All
// fixtures are synthetic; no production data, no real credential
// material, no network, no E4/D1 calls.
import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  applyCoinWalletMigrations,
} from "../services/platform/coin-wallet-migrations.mjs";
import { applyPaymentStoreMigrations } from "../services/platform/payment-store-migrations.mjs";
import {
  applyPortalReferralMigration,
  REFERRAL_MIGRATION_ID,
  REFERRAL_DDL_CHECKSUM,
} from "../services/platform/portal-referral-migrations.mjs";
import { createPortalReferralService } from "../services/platform/portal-referral-service.mjs";
import { createPortalRegistrationWelcomeBonusCoordinator } from "../services/platform/portal-registration-welcome-bonus-coordinator.mjs";
import { createCoinCommerceDataPackRotationCoordinator } from "../services/platform/coin-commerce-data-pack-rotation-coordinator.mjs";
import { createTrafficAccountingService } from "../services/platform/traffic-accounting.mjs";
import {
  createDrainTracker,
  createFreezeDrainCoordinator,
} from "../services/platform/d1-card9-freeze-drain-coordinator.mjs";
import { ensureWriterAuthority } from "../services/platform/single-writer-authority.mjs";

const NOW = "2026-09-08T00:00:00.000Z";
const LATER = "2026-09-15T00:00:00.000Z";

// ---------------------------------------------------------------------------
// P-5: referral tick — stopTick() / getTickStatus()
// ---------------------------------------------------------------------------

function referralFixture(t) {
  const db = new Database(":memory:");
  db.pragma("foreign_keys=ON");
  db.exec(`create table platform_accounts(id text primary key,owner_ref text not null,status text not null,
    created_at text not null,updated_at text not null,metadata_json text not null default '{}')`);
  db.prepare("insert into platform_accounts values(?,?,?,?,?,'{}')")
    .run("promoter", "owner_promoter", "active", NOW, NOW);
  applyCoinWalletMigrations({
    database: db,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(NOW),
  });
  applyPaymentStoreMigrations({ database: db, nowFn: () => NOW });
  applyPortalReferralMigration(db, {
    expectedMigrationId: REFERRAL_MIGRATION_ID,
    expectedDdlChecksum: REFERRAL_DDL_CHECKSUM,
  });
  let now = NOW;
  const service = createPortalReferralService({
    database: db,
    nowFn: () => new Date(now),
    rewardsEnabled: true,
  });
  t.after(() => {
    try { service.close(); } catch { /* already closed in the test */ }
    if (db.open) db.close();
  });
  return {
    db,
    service,
    setNow(value) { now = value; },
  };
}

function mockTimers(t) {
  const callbacks = [];
  const timer = { unref() {} };
  t.mock.method(globalThis, "setInterval", (callback) => {
    callbacks.push(callback);
    return timer;
  });
  const cleared = t.mock.method(globalThis, "clearInterval", () => {});
  return { callbacks, cleared };
}

test("P-5 referral tick reports disarmed before start and armed after start", (t) => {
  const f = referralFixture(t);
  mockTimers(t);
  assert.deepEqual(f.service.getTickStatus(), {
    timerArmed: false, tickInFlight: false, lastTickEndedAt: null,
  });
  f.service.start();
  assert.deepEqual(f.service.getTickStatus(), {
    timerArmed: true, tickInFlight: false, lastTickEndedAt: NOW,
  });
});

test("P-5 stopTick clears only the timer, returns the stop evidence, and is idempotent", async (t) => {
  const f = referralFixture(t);
  const { callbacks, cleared } = mockTimers(t);
  f.service.start();
  assert.equal(callbacks.length, 1);
  f.setNow(LATER);
  const stopped = await f.service.stopTick();
  assert.deepEqual(stopped, {
    timerClearedAt: LATER, lastTickEndedAt: NOW, tickInFlight: false,
  });
  assert.equal(cleared.mock.callCount(), 1);
  assert.deepEqual(f.service.getTickStatus(), {
    timerArmed: false, tickInFlight: false, lastTickEndedAt: NOW,
  });
  // A second stop reports the same clearance time and clears nothing new.
  assert.deepEqual(await f.service.stopTick(), stopped);
  assert.equal(cleared.mock.callCount(), 1);
});

test("P-5 stopTick is recoverable: start() re-arms the tick afterwards", async (t) => {
  const f = referralFixture(t);
  const { callbacks } = mockTimers(t);
  f.service.start();
  await f.service.stopTick();
  f.setNow(LATER);
  f.service.start();
  assert.equal(callbacks.length, 2);
  assert.deepEqual(f.service.getTickStatus(), {
    timerArmed: true, tickInFlight: false, lastTickEndedAt: LATER,
  });
  await f.service.stopTick();
  assert.equal(f.service.getTickStatus().timerArmed, false);
});

test("P-5 stopTick does not close the service: reads still work and close() stays terminal", async (t) => {
  const f = referralFixture(t);
  mockTimers(t);
  f.service.start();
  await f.service.stopTick();
  // The wallet and database connection are untouched: a read still works.
  assert.equal(f.service.profile("promoter").eligible, true);
  f.service.close();
  assert.equal(f.service.getTickStatus().timerArmed, false);
  assert.throws(() => f.service.start(), /referral_unavailable/);
});

test("P-5 close() still clears the timer exactly once", (t) => {
  const f = referralFixture(t);
  const { cleared } = mockTimers(t);
  f.service.start();
  f.service.close();
  assert.equal(cleared.mock.callCount(), 1);
  assert.equal(f.service.getTickStatus().timerArmed, false);
});

test("P-5 stopTick before start reports the confirmation time and start() still works", async (t) => {
  const f = referralFixture(t);
  const { callbacks } = mockTimers(t);
  assert.deepEqual(await f.service.stopTick(), {
    timerClearedAt: NOW, lastTickEndedAt: null, tickInFlight: false,
  });
  f.service.start();
  assert.equal(callbacks.length, 1);
  assert.equal(f.service.getTickStatus().timerArmed, true);
});

// ---------------------------------------------------------------------------
// P-3 (W-112): welcome-bonus coordinator — getStatus() for the settled-pass read
// ---------------------------------------------------------------------------

const WELCOME_NOW = "2026-08-13T00:00:00.000Z";
const WELCOME_LATER = "2026-08-20T00:00:00.000Z";
const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);

function welcomeFixture() {
  const controlStore = {
    claimNextPortalRegistrationWelcomeCoinGrant() { return null; },
    completePortalRegistrationWelcomeCoinGrant() {},
    deferPortalRegistrationWelcomeCoinGrant() {},
    markPortalRegistrationWelcomeCoinGrantReconciliationRequired() {},
    expireDuePortalRegistrationWelcomeCoinGrants() { return 0; },
    nextPortalRegistrationWelcomeCoinGrantWakeAt() { return null; },
  };
  const walletStore = {
    creditCoins() {
      return { ok: true, replayed: false, safeResultCode: "credited", resultRef: "lot_welcome_test" };
    },
    expireDuePortalRegistrationWelcomeBonusCoinLots() { return 0; },
  };
  const coordinator = createPortalRegistrationWelcomeBonusCoordinator({
    controlStore,
    walletStore,
    nowFn: () => new Date(WELCOME_NOW),
    batchSize: 5,
    leaseMs: 30_000,
    retryDelayMs: 5_000,
    scheduleFn: () => ({ timer: true }),
    clearScheduleFn: () => {},
  });
  return { coordinator };
}

test("P-3 W-112 getStatus reports lifecycle, timer, and whether the pass settled", async () => {
  const { coordinator } = welcomeFixture();
  assert.deepEqual(coordinator.getStatus(), {
    lifecycle: "idle", timerArmed: false, activePassSettled: true,
  });
  await coordinator.start();
  assert.deepEqual(coordinator.getStatus(), {
    lifecycle: "running", timerArmed: true, activePassSettled: true,
  });
  await coordinator.stop();
  assert.deepEqual(coordinator.getStatus(), {
    lifecycle: "stopped", timerArmed: false, activePassSettled: true,
  });
});

test("P-3 W-112 getStatus shows the pass in flight until its promise settles", async () => {
  const { coordinator } = welcomeFixture();
  const pass = coordinator.runOnce();
  // runOnce() performs the pass synchronously; the promise's finally that
  // clears activePass only runs as a microtask, so a synchronous read
  // still sees the pass in flight. This is the exact gap stop() alone
  // leaves open, and the read the freeze executor polls after stop().
  assert.equal(coordinator.getStatus().activePassSettled, false);
  await pass;
  assert.equal(coordinator.getStatus().activePassSettled, true);
});

test("P-3 W-112 after stop() the settled read stays settled and runOnce() rejects", async () => {
  const { coordinator } = welcomeFixture();
  await coordinator.start();
  await coordinator.stop();
  assert.equal(coordinator.getStatus().activePassSettled, true);
  assert.equal(coordinator.getStatus().activePassSettled, true);
  await assert.rejects(() => coordinator.runOnce(), (error) => error.code === "welcome_bonus_coordinator_stopped");
});

// ---------------------------------------------------------------------------
// P-3 (W-114): rotation coordinator — getStatus() now exposes the pending wake
// ---------------------------------------------------------------------------

function rotationFixture() {
  const pending = new Map();
  const calls = [];
  let nextId = 0;
  const coordinator = createCoinCommerceDataPackRotationCoordinator({
    rotation: {
      reconcilePending({ limit }) {
        calls.push(limit);
        return { inspected: 1, completed: 1, failed: 0 };
      },
    },
    batchSize: 3,
    intervalMs: 1000,
    scheduleFn(callback, delay) {
      assert.equal(delay, 1000);
      const id = ++nextId;
      pending.set(id, callback);
      return id;
    },
    clearScheduleFn(id) { pending.delete(id); },
  });
  return { coordinator, calls, pending };
}

test("P-3 W-114 getStatus exposes timerArmed: armed while running, clear after stop", () => {
  const f = rotationFixture();
  assert.equal(f.coordinator.getStatus().timerArmed, false);
  f.coordinator.start();
  assert.deepEqual(f.coordinator.getStatus(), {
    running: true, completedBatches: 1, failedBatches: 0, failedIntents: 0, timerArmed: true,
  });
  assert.equal(f.pending.size, 1);
  f.coordinator.stop();
  assert.deepEqual(f.coordinator.getStatus(), {
    running: false, completedBatches: 1, failedBatches: 0, failedIntents: 0, timerArmed: false,
  });
  // No wake remains: nothing is pending, so no further batch can run.
  assert.equal(f.pending.size, 0);
  assert.deepEqual(f.calls, [3]);
});

// ---------------------------------------------------------------------------
// P-2 (a): freeze/drain coordinator holds the scheduler references
// ---------------------------------------------------------------------------

function wiringDb(t) {
  const db = new Database(":memory:");
  t.after(() => { if (db.open) db.close(); });
  ensureWriterAuthority(db);
  return db;
}

function fakeScheduler() {
  return {
    coinCommerceCoordinator: { stop: async () => {}, getStatus: () => ({}) },
    welcomeBonusCoordinator: { stop: async () => {}, getStatus: () => ({}) },
    rotationCoordinator: { stop: () => {}, getStatus: () => ({}) },
    portalReferrals: { stopTick: async () => ({}), getTickStatus: () => ({}) },
  };
}

test("P-2 coordinator without scheduler wiring reports every job absent", (t) => {
  const db = wiringDb(t);
  const coordinator = createFreezeDrainCoordinator(db, { snapshotId: "s2s-wiring-absent-001" });
  assert.equal(coordinator.scheduler, null);
  assert.deepEqual(coordinator.schedulerWiring(), {
    coinCommerceCoordinator: { present: false, hasStop: false, hasGetStatus: false },
    welcomeBonusCoordinator: { present: false, hasStop: false, hasGetStatus: false },
    rotationCoordinator: { present: false, hasStop: false, hasGetStatus: false },
    portalReferrals: { present: false, hasStopTick: false, hasGetTickStatus: false },
  });
});

test("P-2 coordinator with scheduler wiring holds the live references and reports capability", (t) => {
  const db = wiringDb(t);
  const scheduler = fakeScheduler();
  const coordinator = createFreezeDrainCoordinator(db, {
    snapshotId: "s2s-wiring-present-001",
    scheduler,
  });
  assert.equal(coordinator.scheduler.coinCommerceCoordinator, scheduler.coinCommerceCoordinator);
  assert.equal(coordinator.scheduler.portalReferrals, scheduler.portalReferrals);
  assert.deepEqual(coordinator.schedulerWiring(), {
    coinCommerceCoordinator: { present: true, hasStop: true, hasGetStatus: true },
    welcomeBonusCoordinator: { present: true, hasStop: true, hasGetStatus: true },
    rotationCoordinator: { present: true, hasStop: true, hasGetStatus: true },
    portalReferrals: { present: true, hasStopTick: true, hasGetTickStatus: true },
  });
});

test("P-2 coordinator wiring allows null references for jobs not created in this process", (t) => {
  const db = wiringDb(t);
  // Rotation coordinator is null when no data-pack material escrow is in
  // place (state.mjs creates it only then); referrals are absent when
  // referrals are disabled. Null means "not created", not an error.
  const scheduler = fakeScheduler();
  scheduler.rotationCoordinator = null;
  delete scheduler.portalReferrals;
  const coordinator = createFreezeDrainCoordinator(db, {
    snapshotId: "s2s-wiring-partial-001",
    scheduler,
  });
  const wiring = coordinator.schedulerWiring();
  assert.equal(wiring.rotationCoordinator.present, false);
  assert.equal(wiring.portalReferrals.present, false);
  assert.equal(wiring.coinCommerceCoordinator.present, true);
  assert.equal(wiring.welcomeBonusCoordinator.present, true);
});

test("P-2 coordinator wiring fails closed on a reference without its required methods", (t) => {
  const db = wiringDb(t);
  const missingStop = fakeScheduler();
  delete missingStop.coinCommerceCoordinator.stop;
  assert.throws(
    () => createFreezeDrainCoordinator(db, { snapshotId: "s2s-wiring-bad-001", scheduler: missingStop }),
    (error) => error.code === "freeze_drain_scheduler_invalid",
  );
  assert.throws(
    () => createFreezeDrainCoordinator(db, {
      snapshotId: "s2s-wiring-bad-002",
      scheduler: { unknownJob: {} },
    }),
    (error) => error.code === "freeze_drain_scheduler_invalid",
  );
  assert.throws(
    () => createFreezeDrainCoordinator(db, { snapshotId: "s2s-wiring-bad-003", scheduler: "not-an-object" }),
    (error) => error.code === "freeze_drain_scheduler_invalid",
  );
});

// ---------------------------------------------------------------------------
// P-2 (b): traffic-accounting write path registers with the drain tracker
// ---------------------------------------------------------------------------

const OBSERVED_AT = "2026-06-06T00:00:00.000Z";

function trafficStore({ failSample = null } = {}) {
  const calls = [];
  return {
    calls,
    findIssuedSubscriptionBindingByEdgeCredentialRef() {
      return {
        accountId: "acct_usage_service_1",
        entitlementId: "ent_usage_service_1",
        requestId: "pareq_usage_service_1",
        nodeId: "channel-a",
        trafficLimitBytes: 1000,
        portalUserRef: "portal_user_usage_service_1",
      };
    },
    recordUsageSample(record) {
      calls.push(["sample", record.id]);
      if (failSample) throw failSample;
      return { inserted: true, sample: { id: record.id }, rollup: { uploadBytes: 10, downloadBytes: 20, totalBytes: 30 } };
    },
    recordCumulativeUsageSample(record) {
      calls.push(["cumulative", record]);
      if (failSample) throw failSample;
      return { inserted: true, sample: null, rollup: { uploadBytes: 10, downloadBytes: 20, totalBytes: 30 } };
    },
  };
}

function recordingTracker() {
  const events = [];
  return {
    events,
    registerWrite(id, kind) { events.push(["registerWrite", id, kind]); },
    settleWrite(id) { events.push(["settleWrite", id]); },
    registerCallback(id) { events.push(["registerCallback", id]); },
    settleCallback(id) { events.push(["settleCallback", id]); },
  };
}

function observationInput(overrides = {}) {
  return {
    sourceRef: "src-1",
    channelRef: "channel-a",
    edgeCredentialRef: "edge-1",
    observedAt: OBSERVED_AT,
    intervalStartedAt: OBSERVED_AT,
    intervalEndedAt: OBSERVED_AT,
    uploadBytes: 10,
    downloadBytes: 20,
    ...overrides,
  };
}

test("P-2 traffic delta observation brackets the sample write with the drain tracker", () => {
  const store = trafficStore();
  const tracker = recordingTracker();
  const service = createTrafficAccountingService({ controlStore: store, drainTracker: tracker });
  const result = service.recordUsageObservation(observationInput());
  assert.equal(result.ok, true);
  assert.deepEqual(store.calls, [["sample", result.sample.id]]);
  const kinds = tracker.events.map(([kind]) => kind);
  assert.deepEqual(kinds, ["registerCallback", "registerWrite", "settleWrite", "settleCallback"]);
  const writeId = tracker.events[1][1];
  assert.equal(tracker.events[2][1], writeId);
  assert.match(tracker.events[1][1], /^traffic-usage-\d+-sample-\d+$/);
});

test("P-2 traffic cumulative observation registers the cumulative write (W-118)", () => {
  const store = trafficStore();
  const tracker = recordingTracker();
  const service = createTrafficAccountingService({ controlStore: store, drainTracker: tracker });
  const result = service.recordUsageObservation(observationInput({ accountingMode: "cumulative" }));
  assert.equal(result.ok, true);
  assert.equal(store.calls[0][0], "cumulative");
  const kinds = tracker.events.map(([kind]) => kind);
  assert.deepEqual(kinds, ["registerCallback", "registerWrite", "settleWrite", "settleCallback"]);
});

test("P-2 traffic observation registers with the real drain tracker and leaves nothing in flight", () => {
  const store = trafficStore();
  const tracker = createDrainTracker({ timeoutMs: 60_000 });
  const service = createTrafficAccountingService({ controlStore: store, drainTracker: tracker });
  const result = service.recordUsageObservation(observationInput());
  assert.equal(result.ok, true);
  assert.deepEqual(tracker.status().inflightWrites, []);
  assert.deepEqual(tracker.status().inflightCallbacks, []);
});

test("P-2 traffic observation still settles the tracker when the sample write throws", () => {
  const failure = new Error("sample store unavailable");
  const store = trafficStore({ failSample: failure });
  const tracker = recordingTracker();
  const service = createTrafficAccountingService({ controlStore: store, drainTracker: tracker });
  assert.throws(() => service.recordUsageObservation(observationInput()), (error) => error === failure);
  const kinds = tracker.events.map(([kind]) => kind);
  assert.deepEqual(kinds, ["registerCallback", "registerWrite", "settleWrite", "settleCallback"]);
});

test("P-2 traffic observation without a tracker behaves exactly as before", () => {
  const store = trafficStore();
  const service = createTrafficAccountingService({ controlStore: store });
  const result = service.recordUsageObservation(observationInput());
  assert.equal(result.ok, true);
  assert.equal(result.sampleInserted, true);
  assert.equal(store.calls.length, 1);
});

test("P-2 traffic service rejects a drain tracker without register/settle methods", () => {
  const store = trafficStore();
  assert.throws(
    () => createTrafficAccountingService({ controlStore: store, drainTracker: { registerWrite: () => {} } }),
    /drainTracker with register\/settle methods is required/,
  );
});

// ---------------------------------------------------------------------------
// W-116 / W-117 / W-118: independent in-flight counters + read-only
// getInFlightStatus() (2026-11-24). The counters count work in this
// service instance with or without a drain tracker; the drain tracker
// (P-2) remains the freeze-time bracketing mechanism. Because the
// writes are synchronous, a counter reads 1 only while a call is
// executing on the stack, so the tests read it re-entrantly from the
// store stub — the same read the freeze executor would take.
// ---------------------------------------------------------------------------

const QUIESCED_STATUS = Object.freeze({
  inFlightObservations: 0,
  inFlightDeltaSampleWrites: 0,
  inFlightCumulativeSampleWrites: 0,
  quiesced: true,
});

test("W-116/W-117 getInFlightStatus counts the delta sample write in flight, then quiesces", () => {
  let service;
  let seenInFlight = null;
  const store = trafficStore();
  store.recordUsageSample = (record) => {
    seenInFlight = service.getInFlightStatus();
    return { inserted: true, sample: { id: record.id }, rollup: { uploadBytes: 10, downloadBytes: 20, totalBytes: 30 } };
  };
  service = createTrafficAccountingService({ controlStore: store });
  assert.deepEqual(service.getInFlightStatus(), QUIESCED_STATUS);
  assert.equal(Object.isFrozen(service.getInFlightStatus()), true);
  const result = service.recordUsageObservation(observationInput());
  assert.equal(result.ok, true);
  assert.deepEqual(seenInFlight, {
    inFlightObservations: 1,
    inFlightDeltaSampleWrites: 1,
    inFlightCumulativeSampleWrites: 0,
    quiesced: false,
  });
  assert.deepEqual(service.getInFlightStatus(), QUIESCED_STATUS);
});

test("W-118 getInFlightStatus counts the cumulative sample write in flight, not the delta one", () => {
  let service;
  let seenInFlight = null;
  const store = trafficStore();
  store.recordCumulativeUsageSample = (record) => {
    seenInFlight = service.getInFlightStatus();
    return { inserted: true, sample: null, rollup: { uploadBytes: 10, downloadBytes: 20, totalBytes: 30 } };
  };
  service = createTrafficAccountingService({ controlStore: store });
  const result = service.recordUsageObservation(observationInput({ accountingMode: "cumulative" }));
  assert.equal(result.ok, true);
  assert.deepEqual(seenInFlight, {
    inFlightObservations: 1,
    inFlightDeltaSampleWrites: 0,
    inFlightCumulativeSampleWrites: 1,
    quiesced: false,
  });
  assert.deepEqual(service.getInFlightStatus(), QUIESCED_STATUS);
});

test("W-116/W-117/W-118 counters return to zero when the sample write throws", () => {
  const failure = new Error("sample store unavailable");
  const store = trafficStore({ failSample: failure });
  const service = createTrafficAccountingService({ controlStore: store });
  assert.throws(() => service.recordUsageObservation(observationInput()), (error) => error === failure);
  assert.deepEqual(service.getInFlightStatus(), QUIESCED_STATUS);
  assert.throws(
    () => service.recordUsageObservation(observationInput({ accountingMode: "cumulative" })),
    (error) => error === failure,
  );
  assert.deepEqual(service.getInFlightStatus(), QUIESCED_STATUS);
});

test("W-116/W-117 counters work with a drain tracker and do not disturb its bracketing", () => {
  let service;
  let seenInFlight = null;
  const store = trafficStore();
  store.recordUsageSample = (record) => {
    seenInFlight = service.getInFlightStatus();
    return { inserted: true, sample: { id: record.id }, rollup: { uploadBytes: 10, downloadBytes: 20, totalBytes: 30 } };
  };
  const tracker = recordingTracker();
  service = createTrafficAccountingService({ controlStore: store, drainTracker: tracker });
  const result = service.recordUsageObservation(observationInput());
  assert.equal(result.ok, true);
  assert.deepEqual(seenInFlight, {
    inFlightObservations: 1,
    inFlightDeltaSampleWrites: 1,
    inFlightCumulativeSampleWrites: 0,
    quiesced: false,
  });
  assert.deepEqual(service.getInFlightStatus(), QUIESCED_STATUS);
  assert.deepEqual(tracker.events.map(([kind]) => kind), ["registerCallback", "registerWrite", "settleWrite", "settleCallback"]);
});
