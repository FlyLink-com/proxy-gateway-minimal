// D1 Stage 2 — freeze executor tests.
//
// All fixtures are synthetic. No production data, no live BWH/E4,
// no network. Databases are in-memory (plus one temp file for the
// real purge-CLI spawn test, removed afterwards). The durable
// authority guard is the real single-writer-authority implementation.
import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ensureWriterAuthority, readWriterAuthority } from "../services/platform/single-writer-authority.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createTrafficAccountingService } from "../services/platform/traffic-accounting.mjs";
import { createFreezeDrainCoordinator, buildWriterCoverageMatrix } from "../services/platform/d1-card9-freeze-drain-coordinator.mjs";
import {
  createD1FreezeExecutor,
  defaultRunPurgeCli,
  defaultCheckReferralCliProcess,
  D1_FREEZE_COVERAGE_FENCED,
  D1_FREEZE_COVERAGE_WAIVERS,
  D1_FREEZE_COVERAGE_OUT_OF_SCOPE
} from "../services/platform/d1-freeze-executor.mjs";

const SNAPSHOT = "s2s-d1-freeze-20261124";
const CHECKPOINT = "chk-d1-freeze-20261124";

function makeClock() {
  let nowMs = Date.parse("2026-11-24T12:00:00.000Z");
  const now = () => new Date(nowMs);
  return { now, advance(ms) { nowMs += ms; } };
}

function makeDb(t) {
  const db = new Database(":memory:");
  const controlStore = createSqliteSubscriptionControlStore({ database: db });
  ensureWriterAuthority(db);
  t.after(() => { controlStore.close(); });
  return { db, controlStore };
}

function makeCommerceCoordinator() {
  const state = { lifecycle: "running", timerArmed: true, inFlightSettled: false, stopCalls: 0 };
  return {
    state,
    start() {},
    async stop() {
      state.stopCalls += 1;
      state.lifecycle = "stopped";
      state.timerArmed = false;
      state.inFlightSettled = true;
    },
    getStatus() {
      return Object.freeze({ lifecycle: state.lifecycle, timerArmed: state.timerArmed, inFlightSettled: state.inFlightSettled });
    }
  };
}

function makeWelcomeCoordinator({ settle = true } = {}) {
  const state = { lifecycle: "running", timerArmed: true, activePassSettled: false, stopCalls: 0 };
  return {
    state,
    start() {},
    async stop() {
      state.stopCalls += 1;
      state.lifecycle = "stopped";
      state.timerArmed = false;
      if (settle) state.activePassSettled = true;
    },
    getStatus() {
      return Object.freeze({ lifecycle: state.lifecycle, timerArmed: state.timerArmed, activePassSettled: state.activePassSettled });
    }
  };
}

function makeRotationCoordinator() {
  const state = { running: true, completedBatches: 3, failedBatches: 0, failedIntents: 0, timerArmed: true, stopCalls: 0 };
  return {
    state,
    start() {},
    stop() {
      state.stopCalls += 1;
      state.running = false;
      state.timerArmed = false;
    },
    getStatus() {
      return Object.freeze({ running: state.running, completedBatches: state.completedBatches, failedBatches: state.failedBatches, failedIntents: state.failedIntents, timerArmed: state.timerArmed });
    }
  };
}

function makeDeferredCoordinator() {
  const state = { stopCalls: 0 };
  return {
    state,
    start() {},
    async stop() { state.stopCalls += 1; }
  };
}

function makePortalReferrals() {
  const state = { timerArmed: true, tickInFlight: false, lastTickEndedAt: null, stopTickCalls: 0 };
  return {
    state,
    async stopTick() {
      state.stopTickCalls += 1;
      state.timerArmed = false;
      state.tickInFlight = false;
      return Object.freeze({ timerClearedAt: "2026-11-24T12:00:00.000Z", lastTickEndedAt: state.lastTickEndedAt, tickInFlight: false });
    },
    getTickStatus() {
      return Object.freeze({ timerArmed: state.timerArmed, tickInFlight: state.tickInFlight, lastTickEndedAt: state.lastTickEndedAt });
    }
  };
}

function makeCoinCommerceStore({ queued = 0, discardReturns = null } = {}) {
  let pending = queued;
  return {
    pendingAdsRecoveryEnqueueCount() { return pending; },
    discardAdsRecoveryEnqueues() {
      const discarded = discardReturns ?? pending;
      pending = Math.max(0, pending - discarded);
      return discarded;
    }
  };
}

// Faithful stub of the real purge CLI: dry-run always plans 0/0, the
// first apply completes 0/0, the second apply (post-freeze) is
// blocked with writer_authority_not_bwh, exit 20.
function makePurgeStub() {
  let applyCalls = 0;
  return async ({ apply = false } = {}) => {
    if (!apply) {
      return { command: "stub purge", apply: false, exitCode: 0, stdout: JSON.stringify({ schemaVersion: "1", command: "purge", mode: "dry-run", status: "planned", mutationState: "none", counts: { deletedLeadCount: 0, eligibleLeadCount: 0 }, reasonCodes: [] }), stderr: "", timedOut: false };
    }
    applyCalls += 1;
    if (applyCalls === 1) {
      return { command: "stub purge --apply", apply: true, exitCode: 0, stdout: JSON.stringify({ schemaVersion: "1", command: "purge", mode: "apply", status: "completed", mutationState: "completed", counts: { deletedLeadCount: 0, eligibleLeadCount: 0 }, reasonCodes: [] }), stderr: "", timedOut: false };
    }
    return { command: "stub purge --apply", apply: true, exitCode: 20, stdout: JSON.stringify({ schemaVersion: "1", command: "purge", mode: "apply", status: "blocked", mutationState: "none", counts: {}, reasonCodes: ["writer_authority_not_bwh"] }), stderr: "", timedOut: false };
  };
}

async function stubCheckReferralCliProcess() {
  return { command: "ps -eo pid,args", found: false, matches: [] };
}

function makeExecutor(t, overrides = {}, shared = null) {
  // `shared` reuses the durable database of an earlier round (same db,
  // control store and clock) with fresh in-memory schedulers and a fresh
  // coordinator — the shape of a new process after the post-unfreeze
  // restart. `makeDb` (and its t.after close) runs only for the first
  // round, so the shared handle is closed exactly once.
  const clock = shared?.clock ?? makeClock();
  const { db, controlStore } = shared ?? makeDb(t);
  const commerce = makeCommerceCoordinator();
  const welcome = makeWelcomeCoordinator(overrides.welcome ?? {});
  const rotation = overrides.rotation === null ? null : makeRotationCoordinator();
  const deferred = makeDeferredCoordinator();
  const portal = makePortalReferrals();
  const trafficAccounting = overrides.trafficAccounting ?? createTrafficAccountingService({ controlStore, nowFn: clock.now });
  const coinCommerceStore = overrides.coinCommerceStore ?? makeCoinCommerceStore();
  const scheduler = {
    coinCommerceCoordinator: commerce,
    rotationCoordinator: rotation,
    welcomeBonusCoordinator: welcome,
    portalReferrals: portal
  };
  const coordinator = createFreezeDrainCoordinator(db, {
    snapshotId: SNAPSHOT,
    now: clock.now,
    scheduler
  });
  const executor = createD1FreezeExecutor({
    db,
    coordinator,
    deferredSnapshot: deferred,
    trafficAccounting,
    coinCommerceStore,
    dbPath: "s2s-test-control.sqlite",
    schedulerEnabled: {
      coinCommerce: true,
      welcomeBonus: true,
      rotation: rotation !== null,
      deferred: true,
      portalReferrals: true
    },
    rotationCreation: {
      coinsCommerceEnabled: true,
      dataPackMaterialEscrowPresent: rotation !== null,
      platformFieldPresent: rotation !== null
    },
    now: clock.now,
    sleep: async (ms) => { clock.advance(ms); },
    runPurgeCli: makePurgeStub(),
    checkReferralCliProcess: stubCheckReferralCliProcess,
    ...overrides.executor
  });
  return { db, controlStore, clock, commerce, welcome, rotation, deferred, portal, trafficAccounting, coinCommerceStore, coordinator, executor };
}

test("freeze executor runs A0→A3→B and returns the T1 receipt", async (t) => {
  const { db, executor } = makeExecutor(t);
  const beforeEpoch = readWriterAuthority(db).epoch;
  const result = await executor.executeFreeze({});
  assert.equal(result.schemaVersion, "d1-freeze-execution/v1");
  assert.equal(result.snapshotId, SNAPSHOT);
  assert.equal(result.checkpointId, CHECKPOINT);
  assert.equal(result.transitionId, "T1");
  assert.equal(result.authority.phase, "FROZEN");
  assert.equal(result.authority.epoch, beforeEpoch + 1);
  assert.equal(result.freezeReceipt.snapshotId, SNAPSHOT);
  assert.equal(typeof result.freezeReceipt.receiptDigest, "string");
  assert.equal(result.freezeReceipt.receiptDigest.length, 64);
  assert.equal(typeof result.coordinatorReceipt, "object");
  assert.deepEqual(result.coverageMatrix.counts, { open: 0, fenced: 25, waived: 1, outOfScope: 2 });
  assert.equal(result.coverageMatrix.cutoverBlocked, false);
  assert.equal(typeof result.readinessBundleHash, "string");
  assert.deepEqual(result.measurementDrain, { queueLengthBefore: 0, discardedMeasurementEnqueues: 0, storeAbsent: false });
  assert.equal(result.postFreezeAnomaly, false);
  assert.equal(readWriterAuthority(db).phase, "FROZEN");
  const evidence = result.executionEvidence;
  assert.equal(evidence.steps.a0Authority.phase, "BWH_ACTIVE");
  assert.equal(evidence.steps.a0Authority.epoch, beforeEpoch);
  assert.equal(evidence.steps.a1SchedulerJobs["W-111"].post.inFlightSettled, true);
  assert.equal(evidence.steps.a1SchedulerJobs["W-112"].post.activePassSettled, true);
  assert.equal(evidence.steps.a1SchedulerJobs["W-113"].stopCalledAt.length, 24);
  assert.equal(evidence.steps.a1SchedulerJobs["W-114"].post.running, false);
  assert.equal(evidence.steps.a1SchedulerJobs["W-115"].post.timerArmed, false);
  assert.equal(evidence.steps.a1SchedulerJobs["W-119"].stepC.leadRows, 0);
  assert.equal(evidence.steps.a1SchedulerJobs["W-120"].found, false);
  assert.equal(evidence.steps.a2Inflight.reads.at(-1).quiesced, true);
  assert.equal(evidence.steps.a2Hwm.trackerStatus.hwmStable, true);
  assert.equal(evidence.steps.a3Receipts.schedulerJobs, 11);
  assert.equal(evidence.steps.bPostFreeze.anomaly, false);
});

test("second freeze confirms the live epoch and writes confirmed epoch + 1", async (t) => {
  // Regression: the A0 authority check used to demand a single fixed
  // epoch, so the second freeze of a round (production: BWH_ACTIVE
  // after the first freeze + unfreeze) was refused with 409
  // freeze_authority_mismatch. A0 now only confirms the live state
  // (BWH / BWH_ACTIVE) and records the confirmed epoch; the freeze
  // writes confirmed epoch + 1 via the coordinator, whose durable
  // guard enforces +1. No epoch value is hardcoded anywhere here —
  // every epoch asserted below is derived from the confirmed value.
  const first = makeExecutor(t);
  const firstBefore = readWriterAuthority(first.db).epoch;
  const firstResult = await first.executor.executeFreeze({});
  assert.equal(firstResult.authority.epoch, firstBefore + 1);
  assert.equal(firstResult.executionEvidence.steps.a0Authority.epoch, firstBefore);
  assert.equal(readWriterAuthority(first.db).phase, "FROZEN");
  const unfrozen = first.coordinator.unfreeze({
    reason: "synthetic verification failure",
    voidedFreezeReceiptRef: firstResult.freezeReceipt.receiptDigest
  });
  const confirmedEpoch = readWriterAuthority(first.db).epoch;
  assert.deepEqual([unfrozen.authority.phase, unfrozen.authority.epoch], ["BWH_ACTIVE", confirmedEpoch]);
  // Second round: fresh process shape (new schedulers, new coordinator,
  // same durable database) — as after the post-unfreeze restart.
  const second = makeExecutor(t, {}, { db: first.db, controlStore: first.controlStore, clock: first.clock });
  const secondResult = await second.executor.executeFreeze({});
  assert.equal(secondResult.transitionId, "T1");
  assert.equal(secondResult.executionEvidence.steps.a0Authority.epoch, confirmedEpoch);
  assert.equal(secondResult.authority.epoch, confirmedEpoch + 1);
  assert.equal(readWriterAuthority(first.db).phase, "FROZEN");
  assert.equal(readWriterAuthority(first.db).epoch, confirmedEpoch + 1);
});

test("coverage open refuses the freeze before any scheduler is stopped", async (t) => {
  const { commerce, welcome, deferred, portal, executor } = makeExecutor(t);
  const openMatrix = buildWriterCoverageMatrix({
    fenced: D1_FREEZE_COVERAGE_FENCED.filter((id) => id !== "U-F1"),
    waivers: { ...D1_FREEZE_COVERAGE_WAIVERS },
    outOfScope: { ...D1_FREEZE_COVERAGE_OUT_OF_SCOPE }
  });
  await assert.rejects(
    () => executor.executeFreeze({ coverageMatrix: openMatrix }),
    (error) => {
      assert.equal(error.code, "freeze_coverage_open");
      assert.deepEqual(error.executionEvidence.steps.a0Coverage.counts, { open: 1, fenced: 24, waived: 1, outOfScope: 2 });
      return true;
    }
  );
  assert.equal(commerce.state.stopCalls, 0);
  assert.equal(welcome.state.stopCalls, 0);
  assert.equal(deferred.state.stopCalls, 0);
  assert.equal(portal.state.stopTickCalls, 0);
});

test("missing writer authority refuses the freeze", async (t) => {
  const clock = makeClock();
  const db = new Database(":memory:");
  t.after(() => { if (db.open) db.close(); });
  const coordinator = createFreezeDrainCoordinator(db, { snapshotId: SNAPSHOT, now: clock.now, scheduler: null });
  const executor = createD1FreezeExecutor({
    db,
    coordinator,
    now: clock.now,
    sleep: async (ms) => { clock.advance(ms); }
  });
  await assert.rejects(
    () => executor.executeFreeze({}),
    (error) => {
      assert.equal(error.code, "freeze_coordinator_no_authority");
      return true;
    }
  );
});

test("measurement drain mismatch refuses the freeze and leaves phase BWH_ACTIVE", async (t) => {
  const { db, executor } = makeExecutor(t, {
    coinCommerceStore: makeCoinCommerceStore({ queued: 2, discardReturns: 1 })
  });
  await assert.rejects(
    () => executor.executeFreeze({}),
    (error) => {
      assert.equal(error.code, "freeze_measurement_drain_mismatch");
      return true;
    }
  );
  assert.equal(readWriterAuthority(db).phase, "BWH_ACTIVE");
});

test("welcome pass that never settles times out the drain", async (t) => {
  const { executor } = makeExecutor(t, { welcome: { settle: false } });
  await assert.rejects(
    () => executor.executeFreeze({}),
    (error) => {
      assert.equal(error.code, "freeze_drain_timeout");
      return true;
    }
  );
});

test("in-flight traffic-accounting writes refuse the freeze", async (t) => {
  const { executor } = makeExecutor(t, {
    trafficAccounting: {
      getInFlightStatus: () => Object.freeze({
        inFlightObservations: 1,
        inFlightDeltaSampleWrites: 0,
        inFlightCumulativeSampleWrites: 0,
        quiesced: false
      })
    }
  });
  await assert.rejects(
    () => executor.executeFreeze({}),
    (error) => {
      assert.equal(error.code, "freeze_drain_pending");
      return true;
    }
  );
});

test("rotation coordinator not created is recorded and the freeze still succeeds", async (t) => {
  const { executor } = makeExecutor(t, { rotation: null });
  const result = await executor.executeFreeze({});
  assert.equal(result.transitionId, "T1");
  const w114 = result.executionEvidence.steps.a1SchedulerJobs["W-114"];
  assert.equal(w114.created, false);
  assert.equal(w114.rotationCreation.coinsCommerceEnabled, true);
  assert.equal(w114.rotationCreation.dataPackMaterialEscrowPresent, false);
  assert.equal(w114.rotationCreation.platformFieldPresent, false);
  assert.equal(w114.wiringReport.present, false);
});

test("default purge-CLI runner works against a temp-file database", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "d1-freeze-"));
  t.after(() => { rmSync(dir, { recursive: true, force: true }); });
  const dbPath = join(dir, "control.sqlite");
  const db = new Database(dbPath);
  const controlStore = createSqliteSubscriptionControlStore({ database: db });
  ensureWriterAuthority(db);
  controlStore.close();
  const dryRun = await defaultRunPurgeCli({ dbPath, apply: false });
  assert.equal(dryRun.exitCode, 0);
  assert.equal(JSON.parse(dryRun.stdout).status, "planned");
  assert.deepEqual(JSON.parse(dryRun.stdout).counts, { deletedLeadCount: 0, eligibleLeadCount: 0 });
  const apply = await defaultRunPurgeCli({ dbPath, apply: true });
  assert.equal(apply.exitCode, 0);
  assert.equal(JSON.parse(apply.stdout).status, "completed");
});

test("default referral-CLI process check finds no process running", async () => {
  const result = await defaultCheckReferralCliProcess();
  assert.equal(result.command, "ps -eo pid,args");
  assert.equal(result.found, false);
  assert.deepEqual(result.matches, []);
});
