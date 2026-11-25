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

import { ensureWriterAuthority, readWriterAuthority, WRITER_AUTHORITY_TABLE } from "../services/platform/single-writer-authority.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createTrafficAccountingService } from "../services/platform/traffic-accounting.mjs";
import { createFreezeDrainCoordinator, buildWriterCoverageMatrix, readCoordinatorLog } from "../services/platform/d1-card9-freeze-drain-coordinator.mjs";
import { appendDeltaEntries } from "../services/platform/d1-card8-delta-journal.mjs";
import {
  createD1FreezeExecutor,
  defaultRunPurgeCli,
  defaultCheckReferralCliProcess,
  collectUsedFreezeSnapshotIds,
  deriveFreezeCheckpointId,
  deriveFreezeCoverageExpectedCounts,
  deriveFreezeSnapshotId,
  resolveFreezeSnapshotId,
  D1_FREEZE_COVERAGE_EXPECTED_COUNTS,
  D1_FREEZE_COVERAGE_FENCED,
  D1_FREEZE_COVERAGE_WAIVERS,
  D1_FREEZE_COVERAGE_WAIVER_AUTHORIZATION_IDS,
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
    snapshotId: overrides.snapshotId ?? SNAPSHOT,
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

// Test-only seeding: place the durable authority at an arbitrary
// (authority, phase, epoch). Production can only reach BWH_ACTIVE on
// odd epochs (each freeze/unfreeze round adds two), so a value like a
// large even epoch can never occur there — but the freeze rule must
// not depend on the value, and a test that only exercises one value
// could be passed by hardcoding that value. The durable guards are
// dropped only to place the fixture and are reinstalled via
// ensureWriterAuthority before the system under test runs; the helper
// asserts they are back, so the freeze itself always runs under the
// real guard (which still enforces epoch +1).
const AUTHORITY_GUARD_OBJECTS = [
  "platform_writer_authority_installed",
  "platform_writer_authority_insert_guard",
  "platform_writer_authority_delete_guard",
  "platform_writer_authority_transition_guard",
];

function seedAuthority(db, { authority, phase, epoch }) {
  for (const name of AUTHORITY_GUARD_OBJECTS) {
    const row = db.prepare("select type from main.sqlite_schema where name = ?").get(name);
    if (row?.type === "trigger") db.prepare(`drop trigger main."${name}"`).run();
    else if (row?.type === "view") db.prepare(`drop view main."${name}"`).run();
  }
  db.prepare(`update main.${WRITER_AUTHORITY_TABLE} set authority = ?, phase = ?, epoch = ?, updated_at = ?, receipt_ref = '' where id = 1`)
    .run(authority, phase, epoch, new Date().toISOString());
  ensureWriterAuthority(db);
  const installed = db.prepare(
    "select count(*) as n from main.sqlite_schema where name in (?, ?, ?, ?)"
  ).get(...AUTHORITY_GUARD_OBJECTS).n;
  assert.equal(installed, AUTHORITY_GUARD_OBJECTS.length, "durable authority guards must be reinstalled before the freeze runs");
  return readWriterAuthority(db);
}

function makeExecutorAtState(t, state) {
  const { db, controlStore } = makeDb(t);
  seedAuthority(db, state);
  return makeExecutor(t, {}, { db, controlStore, clock: makeClock() });
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

// The freeze rule, parameterized: for any BWH_ACTIVE epoch the freeze
// succeeds and lands on confirmed epoch + 1; while FROZEN at any epoch
// it is refused with 409. Every epoch asserted is derived from the
// confirmed value read back from the database — no specific number
// pair is written anywhere, so no single constant can pass.
for (const epoch of [1, 3, 7, 42]) {
  test(`freeze from BWH_ACTIVE epoch ${epoch} lands on confirmed epoch + 1`, async (t) => {
    const { db, executor } = makeExecutorAtState(t, { authority: "BWH", phase: "BWH_ACTIVE", epoch });
    const confirmed = readWriterAuthority(db).epoch;
    const result = await executor.executeFreeze({});
    assert.equal(result.transitionId, "T1");
    assert.equal(result.executionEvidence.steps.a0Authority.epoch, confirmed);
    assert.equal(result.authority.phase, "FROZEN");
    assert.equal(result.authority.epoch, confirmed + 1);
    assert.equal(readWriterAuthority(db).epoch, confirmed + 1);
  });
}

for (const epoch of [2, 4, 8, 43]) {
  test(`freeze while FROZEN at epoch ${epoch} is refused with 409`, async (t) => {
    const { db, executor, commerce, welcome, deferred, portal } = makeExecutorAtState(t, { authority: "BWH", phase: "FROZEN", epoch });
    const confirmed = readWriterAuthority(db).epoch;
    await assert.rejects(
      () => executor.executeFreeze({}),
      (error) => {
        assert.equal(error.code, "freeze_authority_mismatch");
        return true;
      }
    );
    // Refused at A0, before any scheduler is touched or anything is written.
    assert.equal(commerce.state.stopCalls, 0);
    assert.equal(welcome.state.stopCalls, 0);
    assert.equal(deferred.state.stopCalls, 0);
    assert.equal(portal.state.stopTickCalls, 0);
    assert.deepEqual(
      [readWriterAuthority(db).phase, readWriterAuthority(db).epoch],
      ["FROZEN", confirmed]
    );
  });
}

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

// ---- F18: the A3 HWM gate is a dynamic journal-head == manifest-seq
// comparison (same invariant buildHwmCompletenessReceipt enforces) ----

function seedJournalEntries(db, snapshotId, count) {
  const entries = Array.from({ length: count }, (_, i) => ({
    seq: null,
    table: "platform_coin_ledger_entries",
    pk: `f18-test-pk-${i + 1}`,
    kind: "insert",
    fingerprint: "a".repeat(64)
  }));
  return appendDeltaEntries(db, { snapshotId, entries });
}

for (const { journal, manifest } of [
  { journal: 0, manifest: 0 },
  { journal: 1, manifest: 1 },
  { journal: 3, manifest: 3 }
]) {
  test(`F18: freeze passes when journal head seq ${journal} equals manifest seq ${manifest}`, async (t) => {
    const { db, executor } = makeExecutor(t, {
      executor: { manifestSeqProvider: () => manifest }
    });
    if (journal > 0) seedJournalEntries(db, SNAPSHOT, journal);
    const result = await executor.executeFreeze({});
    assert.equal(result.transitionId, "T1");
    assert.deepEqual(
      [result.executionEvidence.steps.a3Journal.headSeq, result.executionEvidence.steps.a3Journal.manifestSeq],
      [journal, manifest]
    );
  });
}

for (const { journal, manifest } of [
  { journal: 0, manifest: 5 },
  { journal: 3, manifest: 0 },
  { journal: 3, manifest: 2 }
]) {
  test(`F18: freeze refuses with freeze_hwm_gap when journal head seq ${journal} != manifest seq ${manifest}`, async (t) => {
    const { db, executor, commerce } = makeExecutor(t, {
      executor: { manifestSeqProvider: () => manifest }
    });
    if (journal > 0) seedJournalEntries(db, SNAPSHOT, journal);
    await assert.rejects(
      () => executor.executeFreeze({}),
      (error) => {
        assert.equal(error.code, "freeze_hwm_gap");
        assert.deepEqual(
          [error.executionEvidence.steps.a3Journal.headSeq, error.executionEvidence.steps.a3Journal.manifestSeq],
          [journal, manifest]
        );
        return true;
      }
    );
    // The gap is only found at A3, after A1 stopped the schedulers,
    // so the freeze never ran (phase still BWH_ACTIVE) and a retry
    // needs a process restart. The gate can only trip on a real gap.
    assert.equal(readWriterAuthority(db).phase, "BWH_ACTIVE");
    assert.equal(commerce.state.stopCalls, 1);
  });
}

test("F18: with no manifest provider wired (production shape), a non-empty journal fails closed", async (t) => {
  const { db, executor } = makeExecutor(t);
  seedJournalEntries(db, SNAPSHOT, 2);
  await assert.rejects(
    () => executor.executeFreeze({}),
    (error) => {
      assert.equal(error.code, "freeze_hwm_gap");
      assert.equal(error.executionEvidence.steps.a3Journal.manifestSeq, 0);
      assert.equal(error.executionEvidence.steps.a3Journal.headSeq, 2);
      return true;
    }
  );
  assert.equal(readWriterAuthority(db).phase, "BWH_ACTIVE");
});

// ---- F19: snapshot ids are unique per freeze, no manual suffix ----

test("F19: deriveFreezeSnapshotId still derives the boot-date base id", () => {
  assert.equal(deriveFreezeSnapshotId(new Date("2026-11-25T06:00:00.000Z")), "s2s-d1-freeze-20261125");
  assert.equal(deriveFreezeSnapshotId(new Date("2026-11-24T12:00:00.000Z")), "s2s-d1-freeze-20261124");
});

for (const { base, used, expected } of [
  { base: "s2s-d1-freeze-20261125", used: [], expected: "s2s-d1-freeze-20261125" },
  { base: "s2s-d1-freeze-20261125", used: ["s2s-d1-freeze-20261125"], expected: "s2s-d1-freeze-20261125-r2" },
  { base: "s2s-d1-freeze-20261125", used: ["s2s-d1-freeze-20261125", "s2s-d1-freeze-20261125-r2"], expected: "s2s-d1-freeze-20261125-r3" },
  { base: "s2s-d1-freeze-20261125-r2", used: ["s2s-d1-freeze-20261125-r2"], expected: "s2s-d1-freeze-20261125-r3" }
]) {
  test(`F19: resolveFreezeSnapshotId(${base}, used=${JSON.stringify(used)}) -> ${expected}`, () => {
    assert.equal(resolveFreezeSnapshotId(base, used), expected);
  });
}

test("F19: the r2 id shape stays valid and its checkpoint derives from the date digits", () => {
  assert.equal(resolveFreezeSnapshotId("s2s-d1-freeze-20261125-r2", []), "s2s-d1-freeze-20261125-r2");
  assert.equal(deriveFreezeCheckpointId("s2s-d1-freeze-20261125-r2"), "chk-d1-freeze-20261125");
  assert.equal(deriveFreezeCheckpointId("s2s-d1-freeze-20261124-r2"), "chk-d1-freeze-20261124");
});

test("F19: same-day second freeze on a shared database gets a distinct id with no manual suffix", async (t) => {
  const first = makeExecutor(t);
  const round1 = await first.executor.executeFreeze({});
  assert.equal(round1.snapshotId, SNAPSHOT);
  assert.equal(round1.freezeReceipt.snapshotId, SNAPSHOT);
  // Simulate the unfreeze + process restart between rounds: authority
  // back to BWH_ACTIVE at the next epoch, same boot date.
  seedAuthority(first.db, { authority: "BWH", phase: "BWH_ACTIVE", epoch: readWriterAuthority(first.db).epoch + 1 });
  const used = collectUsedFreezeSnapshotIds(first.db);
  assert.deepEqual(used, [SNAPSHOT]);
  const resolved = resolveFreezeSnapshotId(deriveFreezeSnapshotId(new Date("2026-11-24T12:00:00.000Z")), used);
  assert.equal(resolved, `${SNAPSHOT}-r2`);
  const second = makeExecutor(t, { snapshotId: resolved }, { db: first.db, controlStore: first.controlStore, clock: first.clock });
  const round2 = await second.executor.executeFreeze({});
  assert.equal(round2.snapshotId, `${SNAPSHOT}-r2`);
  assert.equal(round2.checkpointId, CHECKPOINT);
  assert.equal(round2.freezeReceipt.snapshotId, `${SNAPSHOT}-r2`);
  assert.equal(round2.freezeReceipt.checkpointId, CHECKPOINT);
  const t1Entries = readCoordinatorLog(first.db).filter((entry) => entry.transitionId === "T1");
  assert.deepEqual(t1Entries.map((entry) => entry.snapshotId), [SNAPSHOT, `${SNAPSHOT}-r2`]);
});

test("F19: an explicitly supplied already-used snapshot id is refused before any scheduler stops", async (t) => {
  const first = makeExecutor(t);
  await first.executor.executeFreeze({});
  seedAuthority(first.db, { authority: "BWH", phase: "BWH_ACTIVE", epoch: readWriterAuthority(first.db).epoch + 1 });
  const second = makeExecutor(t, { snapshotId: `${SNAPSHOT}-r2` }, { db: first.db, controlStore: first.controlStore, clock: first.clock });
  await assert.rejects(
    () => second.executor.executeFreeze({ snapshotId: SNAPSHOT }),
    (error) => {
      assert.equal(error.code, "freeze_snapshot_id_conflict");
      return true;
    }
  );
  assert.equal(second.commerce.state.stopCalls, 0);
  assert.equal(second.welcome.state.stopCalls, 0);
  assert.equal(second.deferred.state.stopCalls, 0);
  assert.equal(second.portal.state.stopTickCalls, 0);
  assert.equal(readWriterAuthority(first.db).phase, "BWH_ACTIVE");
});

// ---- F20: coverage expected counts derive from the approved inputs ----

test("F20: expected counts derive from the R7 inputs (24 explicit fenced + derived U-F17 = 25)", () => {
  assert.equal(D1_FREEZE_COVERAGE_FENCED.length, 24);
  assert.deepEqual(deriveFreezeCoverageExpectedCounts(), { open: 0, fenced: 25, waived: 1, outOfScope: 2 });
  assert.deepEqual(D1_FREEZE_COVERAGE_EXPECTED_COUNTS, { open: 0, fenced: 25, waived: 1, outOfScope: 2 });
  assert.equal(D1_FREEZE_COVERAGE_WAIVERS["U-F15"], D1_FREEZE_COVERAGE_WAIVER_AUTHORIZATION_IDS[0]);
});

test("F20: a matrix with a different disposition is refused against the derived expectation", async (t) => {
  const { commerce, welcome, deferred, portal, executor } = makeExecutor(t);
  const movedMatrix = buildWriterCoverageMatrix({
    fenced: [...D1_FREEZE_COVERAGE_FENCED, "U-F9"],
    waivers: { ...D1_FREEZE_COVERAGE_WAIVERS },
    outOfScope: { "U-F14": D1_FREEZE_COVERAGE_OUT_OF_SCOPE["U-F14"] }
  });
  assert.deepEqual(movedMatrix.counts, { open: 0, fenced: 26, waived: 1, outOfScope: 1 });
  await assert.rejects(
    () => executor.executeFreeze({ coverageMatrix: movedMatrix }),
    (error) => {
      assert.equal(error.code, "freeze_coverage_open");
      assert.deepEqual(error.executionEvidence.steps.a0Coverage.counts, { open: 0, fenced: 26, waived: 1, outOfScope: 1 });
      assert.deepEqual(error.executionEvidence.steps.a0Coverage.expectedCounts, { open: 0, fenced: 25, waived: 1, outOfScope: 2 });
      return true;
    }
  );
  assert.equal(commerce.state.stopCalls, 0);
  assert.equal(welcome.state.stopCalls, 0);
  assert.equal(deferred.state.stopCalls, 0);
  assert.equal(portal.state.stopTickCalls, 0);
});

test("F20: a waiver citing an unknown authorization is refused fail-closed", async (t) => {
  const { commerce, welcome, deferred, portal, executor } = makeExecutor(t);
  const staleMatrix = buildWriterCoverageMatrix({
    fenced: [...D1_FREEZE_COVERAGE_FENCED],
    waivers: { "U-F15": "yi-2026-11-24-0000-cst-d1-landing-authorization-v2" },
    outOfScope: { ...D1_FREEZE_COVERAGE_OUT_OF_SCOPE }
  });
  await assert.rejects(
    () => executor.executeFreeze({ coverageMatrix: staleMatrix }),
    (error) => {
      assert.equal(error.code, "freeze_coverage_waiver_unknown");
      return true;
    }
  );
  assert.equal(commerce.state.stopCalls, 0);
  assert.equal(welcome.state.stopCalls, 0);
  assert.equal(deferred.state.stopCalls, 0);
  assert.equal(portal.state.stopTickCalls, 0);
});

// ---- r2-shaped round: the current round still passes end to end ----
test("r2-shaped round still passes: s2s-d1-freeze-20261125-r2, empty journal, manifest 0, coverage 0/25/1/2", async (t) => {
  const snapshotId = "s2s-d1-freeze-20261125-r2";
  const { executor } = makeExecutor(t, { snapshotId });
  const result = await executor.executeFreeze({});
  assert.equal(result.transitionId, "T1");
  assert.equal(result.snapshotId, snapshotId);
  assert.equal(result.checkpointId, "chk-d1-freeze-20261125");
  assert.equal(result.freezeReceipt.snapshotId, snapshotId);
  assert.equal(result.freezeReceipt.checkpointId, "chk-d1-freeze-20261125");
  assert.deepEqual(result.coverageMatrix.counts, { open: 0, fenced: 25, waived: 1, outOfScope: 2 });
  assert.deepEqual(
    [result.executionEvidence.steps.a3Journal.headSeq, result.executionEvidence.steps.a3Journal.manifestSeq],
    [0, 0]
  );
});
