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
import { createFreezeDrainCoordinator, buildWriterCoverageMatrix, readCoordinatorLog, COORDINATOR_LOG_TABLE } from "../services/platform/d1-card9-freeze-drain-coordinator.mjs";
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
  D1_FREEZE_COVERAGE_FENCED_REF,
  D1_FREEZE_COVERAGE_FENCED_REFS,
  D1_FREEZE_COVERAGE_WAIVERS,
  D1_FREEZE_COVERAGE_WAIVER_AUTHORIZATION_IDS,
  D1_FREEZE_COVERAGE_OUT_OF_SCOPE
} from "../services/platform/d1-freeze-executor.mjs";
import {
  ensureCredentialVersionTracking,
  backfillCredentialVersions,
  CREDENTIAL_VERSION_TABLE,
  CREDENTIAL_VERSION_TRIGGERS,
} from "../services/platform/d1-stage2-credential-reconciliation.mjs";

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
  // N1 (PR #927 r4697535888): the freeze gate requires credential
  // version tracking installed, so the harness installs it — the
  // default fixture is the producible pre-freeze state (tracking
  // installed, zero credential rows). Tests for the refusal paths
  // uninstall it explicitly with uninstallCredentialVersionTracking.
  ensureCredentialVersionTracking(db);
  t.after(() => { controlStore.close(); });
  return { db, controlStore };
}

// N1 helpers. seedCredentialRow inserts a synthetic credential row
// (parent access-request row first: the control store enforces the
// FK). The digest is a fixed synthetic placeholder — the version
// logic never depends on credential values.
function seedCredentialRow(db, { requestId, channelRef, credentialRef, ordinal = 0 }) {
  db.prepare(`insert into platform_portal_access_requests (id, portal_user_ref, plan, client_target, duration_days, quantity, status, next_action, prior_trial_state, submitted_at, updated_at) values (?, ?, 'monthly', 'clash', 30, 1, 'issued', 'none', 'none', '2026-11-24T12:00:00.000Z', '2026-11-24T12:00:00.000Z')`)
    .run(requestId, `s2s-user-${requestId}`);
  db.prepare(`insert into platform_portal_edge_credentials (request_id, edge_channel_ref, edge_credential_ref, edge_material_digest, ordinal) values (?, ?, ?, ?, ?)`)
    .run(requestId, channelRef, credentialRef, "sha256:s2s-synthetic-material", ordinal);
}

// Model the pre-N1 database shape: no version table, no triggers.
function uninstallCredentialVersionTracking(db) {
  for (const name of CREDENTIAL_VERSION_TRIGGERS) {
    db.prepare(`drop trigger if exists "${name}"`).run();
  }
  db.prepare(`drop table if exists "${CREDENTIAL_VERSION_TABLE}"`).run();
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

// Advance the synthetic database through valid rounds, keeping the
// coordinator history and authority consistent across process restarts.
async function makeExecutorAtEpoch(t, epoch) {
  const { db, controlStore } = makeDb(t);
  const clock = makeClock();
  while (readWriterAuthority(db).epoch < epoch) {
    const snapshotId = `${SNAPSHOT}-prior-${readWriterAuthority(db).epoch}`;
    const { executor } = makeExecutor(t, { snapshotId }, { db, controlStore, clock });
    const round = await executor.executeFreeze({});
    if (round.authority.epoch === epoch) break;
    unfreezeRound(db, round);
  }
  return makeExecutor(t, {}, { db, controlStore, clock });
}

function unfreezeRound(db, round) {
  return createFreezeDrainCoordinator(db, { snapshotId: round.snapshotId }).unfreeze({
    reason: "synthetic test fixture",
    voidedFreezeReceiptRef: round.freezeReceipt.receiptDigest,
  });
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

test("AB: the A2 write lock is built before the drain and its HWM is in the evidence", async (t) => {
  const { db, executor } = makeExecutor(t);
  const result = await executor.executeFreeze({});
  const a2WriteLock = result.executionEvidence.steps.a2WriteLock;
  assert.equal(typeof a2WriteLock, "object");
  assert.match(a2WriteLock.receiptDigest, /^[0-9a-f]{64}$/);
  assert.equal(typeof a2WriteLock.highWaterMark, "object");
  assert.equal(a2WriteLock.highWaterMark.totalRows, result.executionEvidence.steps.a2Hwm.first.totalRows);
  assert.deepEqual(result.executionEvidence.steps.a2Hwm.first, a2WriteLock.highWaterMark);
  assert.deepEqual(result.executionEvidence.steps.a2Hwm.second, a2WriteLock.highWaterMark);
  assert.equal(readWriterAuthority(db).phase, "FROZEN");
});

test("AB: a write landing during the A2 drain fails the freeze with freeze_write_lock_hwm_moved and the phase stays BWH_ACTIVE", async (t) => {
  // Sleep call order in the happy path: the W-115 observation sleep
  // is the 1st call (A1, before the A2 lock is built), the HWM
  // interval sleep is the 2nd (A2, between the two HWM observations).
  // The injected write lands exactly in that window: after the lock
  // receipt and the first observation, before the second.
  let sleepCalls = 0;
  let injected = false;
  const { db, clock, executor } = makeExecutor(t, {
    executor: {
      sleep: async (ms) => {
        sleepCalls += 1;
        if (sleepCalls === 2) {
          db.prepare("insert into platform_audit_events (id, entity_type, entity_ref, action, actor_ref, created_at, metadata_json) values (?, ?, ?, ?, ?, ?, ?)")
            .run("s2s-ab-write-001", "synthetic", "s2s-ab", "synthetic-write", "s2s-test", "2026-11-24T12:01:00.000Z", "{}");
          injected = true;
        }
        clock.advance(ms);
      },
    },
  });
  await assert.rejects(
    () => executor.executeFreeze({}),
    (error) => {
      assert.equal(error.code, "freeze_write_lock_hwm_moved");
      assert.equal(typeof error.executionEvidence.steps.a2WriteLock, "object");
      assert.match(error.executionEvidence.steps.a2WriteLock.receiptDigest, /^[0-9a-f]{64}$/);
      assert.notDeepEqual(error.executionEvidence.steps.a2Hwm.second, error.executionEvidence.steps.a2WriteLock.highWaterMark);
      return true;
    }
  );
  assert.equal(injected, true, "the write must have landed during the HWM interval");
  assert.equal(readWriterAuthority(db).phase, "BWH_ACTIVE");
});

// N1 (PR #927 r4697535888): A2 must not accept HWM stability unless
// credential version tracking is installed and verified. The
// credentials table has no updated_at column, so an in-place rotation
// (same PK, same row count) is invisible to the HWM — only the
// credential version manifest can see it.
test("N1: freeze refuses with freeze_credential_tracking_missing when credential version tracking is not installed", async (t) => {
  const { db, executor } = makeExecutor(t);
  uninstallCredentialVersionTracking(db);
  await assert.rejects(
    () => executor.executeFreeze({}),
    (error) => {
      assert.equal(error.code, "freeze_credential_tracking_missing");
      assert.equal(typeof error.executionEvidence.steps.a2CredentialLock, "undefined");
      return true;
    }
  );
  assert.equal(readWriterAuthority(db).phase, "BWH_ACTIVE");
});

test("N1: an in-place credential rotation during the A2 drain fails the freeze with freeze_credential_version_moved", async (t) => {
  // Same injection point as the AB write test: the 2nd sleep is the
  // HWM interval. The rotation updates only `ordinal` on the same PK:
  // same row count, and the credentials table has no updated_at, so
  // the per-table HWM signal on that table cannot see it — only the
  // credential version manifest (version 1 -> 2) can.
  let sleepCalls = 0;
  let injected = false;
  const { db, clock, executor } = makeExecutor(t, {
    executor: {
      sleep: async (ms) => {
        sleepCalls += 1;
        if (sleepCalls === 2) {
          db.prepare(`update platform_portal_edge_credentials set ordinal = 1 where request_id = 's2s-request-001' and edge_channel_ref = 's2s-channel-a'`).run();
          injected = true;
        }
        clock.advance(ms);
      },
    },
  });
  seedCredentialRow(db, { requestId: "s2s-request-001", channelRef: "s2s-channel-a", credentialRef: "s2s-cred-001" });
  await assert.rejects(
    () => executor.executeFreeze({}),
    (error) => {
      assert.equal(error.code, "freeze_credential_version_moved");
      const lockHash = error.executionEvidence.steps.a2CredentialLock.manifestHash;
      assert.match(lockHash, /^[0-9a-f]{64}$/);
      assert.equal(error.executionEvidence.steps.a2Hwm.credentialManifestHashes.lock, lockHash);
      assert.equal(error.executionEvidence.steps.a2Hwm.credentialManifestHashes.first, lockHash);
      assert.notEqual(error.executionEvidence.steps.a2Hwm.credentialManifestHashes.second, lockHash);
      return true;
    }
  );
  assert.equal(injected, true, "the rotation must have landed during the HWM interval");
  assert.equal(readWriterAuthority(db).phase, "BWH_ACTIVE");
});

test("N1: freeze passes with credential version tracking installed and seeded credential rows", async (t) => {
  const { db, executor } = makeExecutor(t);
  seedCredentialRow(db, { requestId: "s2s-request-001", channelRef: "s2s-channel-a", credentialRef: "s2s-cred-001" });
  seedCredentialRow(db, { requestId: "s2s-request-002", channelRef: "s2s-channel-a", credentialRef: "s2s-cred-002" });
  const beforeEpoch = readWriterAuthority(db).epoch;
  const result = await executor.executeFreeze({});
  assert.equal(result.authority.phase, "FROZEN");
  assert.equal(result.authority.epoch, beforeEpoch + 1);
  const lock = result.executionEvidence.steps.a2CredentialLock;
  assert.equal(lock.liveRowCount, 2);
  assert.equal(lock.tombstoneCount, 0);
  assert.equal(lock.backfilledCount, 0);
  assert.match(lock.manifestHash, /^[0-9a-f]{64}$/);
  assert.equal(result.executionEvidence.steps.a2Hwm.credentialManifestHashes.first, lock.manifestHash);
  assert.equal(result.executionEvidence.steps.a2Hwm.credentialManifestHashes.second, lock.manifestHash);
  assert.equal(result.executionEvidence.steps.a3Receipts.credentialManifestHash, lock.manifestHash);
  assert.equal(readWriterAuthority(db).phase, "FROZEN");
});

test("N1: credential rows that predate tracking are refused until backfilled, then the freeze passes with the weak baseline flagged", async (t) => {
  const { db, controlStore, clock, executor } = makeExecutor(t);
  // Rows predate tracking: uninstall, seed, reinstall without
  // backfill — the live row has no version entry, so the manifest
  // cannot be built and the freeze must refuse.
  uninstallCredentialVersionTracking(db);
  seedCredentialRow(db, { requestId: "s2s-request-001", channelRef: "s2s-channel-a", credentialRef: "s2s-cred-001" });
  ensureCredentialVersionTracking(db);
  await assert.rejects(
    () => executor.executeFreeze({}),
    (error) => {
      assert.equal(error.code, "freeze_credential_tracking_missing");
      return true;
    }
  );
  assert.equal(readWriterAuthority(db).phase, "BWH_ACTIVE");
  // Operator path: backfill the pre-existing row, then retry as a
  // fresh process would (fresh schedulers/coordinator on the same
  // durable database — a failed freeze needs a restart before retry;
  // the refused round wrote no T1 entry, so the snapshot id is free).
  const backfilled = backfillCredentialVersions(db, { now: () => new Date("2026-11-24T12:00:00.000Z") });
  assert.equal(backfilled.backfilled, 1);
  const retry = makeExecutor(t, {}, { db, controlStore, clock });
  const beforeEpoch = readWriterAuthority(db).epoch;
  const result = await retry.executor.executeFreeze({});
  assert.equal(result.authority.phase, "FROZEN");
  assert.equal(result.authority.epoch, beforeEpoch + 1);
  assert.equal(result.executionEvidence.steps.a2CredentialLock.liveRowCount, 1);
  assert.equal(result.executionEvidence.steps.a2CredentialLock.backfilledCount, 1);
  assert.equal(readWriterAuthority(db).phase, "FROZEN");
});

// The freeze rule, parameterized: for any BWH_ACTIVE epoch the freeze
// succeeds and lands on confirmed epoch + 1; while FROZEN at any epoch
// it is refused with 409. Every epoch asserted is derived from the
// confirmed value read back from the database — no specific number
// pair is written anywhere, so no single constant can pass.
for (const epoch of [1, 3, 7, 41]) {
  test(`freeze from BWH_ACTIVE epoch ${epoch} lands on confirmed epoch + 1`, async (t) => {
    const { db, executor } = await makeExecutorAtEpoch(t, epoch);
    const confirmed = readWriterAuthority(db).epoch;
    const result = await executor.executeFreeze({});
    assert.equal(result.transitionId, "T1");
    assert.equal(result.executionEvidence.steps.a0Authority.epoch, confirmed);
    assert.equal(result.authority.phase, "FROZEN");
    assert.equal(result.authority.epoch, confirmed + 1);
    assert.equal(readWriterAuthority(db).epoch, confirmed + 1);
  });
}

for (const epoch of [2, 4, 8, 42]) {
  test(`freeze while FROZEN at epoch ${epoch} is refused with 409`, async (t) => {
    const { db, executor, commerce, welcome, deferred, portal } = await makeExecutorAtEpoch(t, epoch);
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
    fenced: Object.fromEntries(D1_FREEZE_COVERAGE_FENCED.filter((id) => id !== "U-F1").map((id) => [id, D1_FREEZE_COVERAGE_FENCED_REFS[id]])),
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
  unfreezeRound(first.db, round1);
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
  const round1 = await first.executor.executeFreeze({});
  unfreezeRound(first.db, round1);
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
    fenced: { ...D1_FREEZE_COVERAGE_FENCED_REFS, "U-F9": D1_FREEZE_COVERAGE_FENCED_REF },
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
    fenced: { ...D1_FREEZE_COVERAGE_FENCED_REFS },
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

test("A0 refuses an inconsistent coordinator history before stopping any scheduler", async (t) => {
  const ctx = await makeExecutorAtEpoch(t, 3);
  ctx.db.exec(`delete from ${COORDINATOR_LOG_TABLE}`);
  await assert.rejects(() => ctx.executor.executeFreeze({}), { code: "freeze_coordinator_log_authority_mismatch" });
  assert.deepEqual([ctx.commerce.state.stopCalls, ctx.welcome.state.stopCalls, ctx.portal.state.stopTickCalls], [0, 0, 0]);
  assert.deepEqual([readWriterAuthority(ctx.db).phase, readWriterAuthority(ctx.db).epoch], ["BWH_ACTIVE", 3]);
});
