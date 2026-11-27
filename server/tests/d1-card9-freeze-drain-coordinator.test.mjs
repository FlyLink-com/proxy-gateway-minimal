// D1 Card 9 — Freeze/Drain coordinator tests.
//
// All fixtures are synthetic (s2s- prefix). No production data, no real
// credential material, no network, no E4/D1 calls. Databases are
// in-memory or temp files; the durable authority guard is the real
// single-writer-authority implementation, so epoch +1 and the blocked
// T4 transition are enforced by the same trigger production would use.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import Database from "better-sqlite3";

import { ensureWriterAuthority, readWriterAuthority } from "../services/platform/single-writer-authority.mjs";
import {
  buildWriteLockReceipt,
  buildSchedulerQuiescenceReceipt,
  buildCallbackDrainReceipt,
  buildHwmCompletenessReceipt,
  buildFreezeReadinessBundle,
  SCHEDULER_JOBS,
  UNFENCED_WRITER_BASELINE,
} from "../services/platform/d1-stage2-freeze-drain.mjs";
import {
  ensureCredentialVersionTracking,
  buildCredentialVersionManifest,
  CREDENTIAL_VERSION_TABLE,
  CREDENTIAL_VERSION_TRIGGERS,
} from "../services/platform/d1-stage2-credential-reconciliation.mjs";
import { SNAPSHOT_FIXTURE_DDL } from "../services/platform/d1-stage2-source-manifest.mjs";
import { readHighWaterMark } from "../services/platform/writer-freeze-receipt.mjs";
import {
  FREEZE_DRAIN_COORDINATOR_VERSION,
  ROLLBACK_TRIGGERS,
  VERIFICATION_CHECK_IDS,
  buildSnapshotGateManifest,
  buildWriterCoverageMatrix,
  verifyWriterCoverageMatrix,
  createDrainTracker,
  buildDeltaCatchupReport,
  verifyDeltaCatchupReport,
  buildTwoSidedVerificationReport,
  verifyTwoSidedVerificationReport,
  createFreezeDrainCoordinator,
  verifyCoordinatorLog,
  verifyCoordinatorReceipt,
  readCoordinatorLog,
  COORDINATOR_LOG_TABLE,
} from "../services/platform/d1-card9-freeze-drain-coordinator.mjs";

const SNAPSHOT = "s2s-card9-freeze-drain-001";
const CHECKPOINT = "s2s-checkpoint-card9-001";

function makeClock(t) {
  let nowMs = Date.parse("2026-11-21T00:00:00.000Z");
  const now = () => new Date(nowMs);
  return {
    now,
    advance(ms) { nowMs += ms; },
  };
}

function makeDb(t) {
  const db = new Database(":memory:");
  t.after(() => { if (db.open) db.close(); });
  db.exec(`create table s2s_items (id integer primary key, value text not null, updated_at text not null);
    create table s2s_notes (id integer primary key, body text not null);`);
  db.prepare("insert into s2s_items (id, value, updated_at) values (1, 'a', '2026-11-21T00:00:00.000Z'), (2, 'b', '2026-11-21T00:01:00.000Z')").run();
  db.prepare("insert into s2s_notes (id, body) values (1, 'n')").run();
  // N5 (PR #932 r4701898636): the T1 freeze re-reads the credential
  // manifest, so the fixture installs credential version tracking
  // with two live rows (the trigger versions every insert). The
  // fixture DDL carries no FK to the access-request table.
  db.exec(SNAPSHOT_FIXTURE_DDL.platform_portal_edge_credentials);
  ensureCredentialVersionTracking(db);
  seedCredentialRow(db, { requestId: "s2s-request-001", channelRef: "s2s-channel-a", credentialRef: "s2s-cred-001" });
  seedCredentialRow(db, { requestId: "s2s-request-002", channelRef: "s2s-channel-a", credentialRef: "s2s-cred-002" });
  ensureWriterAuthority(db);
  return db;
}

// Synthetic credential row. The digest is a fixed placeholder — the
// version logic never depends on credential values.
function seedCredentialRow(db, { requestId, channelRef, credentialRef }) {
  db.prepare(`insert into platform_portal_edge_credentials (request_id, edge_channel_ref, edge_credential_ref, edge_material_digest, ordinal) values (?, ?, ?, ?, ?)`).run(
    requestId, channelRef, credentialRef, "sha256:s2s-synthetic-material", 0,
  );
}

// Model the pre-N1 database shape: no version table, no triggers.
function uninstallCredentialVersionTracking(db) {
  for (const name of CREDENTIAL_VERSION_TRIGGERS) {
    db.prepare(`drop trigger if exists "${name}"`).run();
  }
  db.prepare(`drop table if exists "${CREDENTIAL_VERSION_TABLE}"`).run();
}

function makeCoordinator(t) {
  const clock = makeClock(t);
  const db = makeDb(t);
  const coordinator = createFreezeDrainCoordinator(db, { snapshotId: SNAPSHOT, now: clock.now });
  return { db, coordinator, clock };
}

function buildBundleFor(db, snapshotId, { withCredentialHash = true } = {}) {
  const writeLock = buildWriteLockReceipt(db, { snapshotId, checkpointId: CHECKPOINT, outstandingJobs: [] });
  const schedulerQuiescence = buildSchedulerQuiescenceReceipt({
    snapshotId,
    evidence: Object.fromEntries(SCHEDULER_JOBS.map((job) => [job.id, true])),
  });
  const callbackDrain = buildCallbackDrainReceipt({ snapshotId, callbacks: [] });
  const hwmCompleteness = buildHwmCompletenessReceipt({
    snapshotId,
    highWaterMark: { seq: 7, snapshotId },
    manifestSeq: 7,
    rowCounts: { s2s_items: 2 },
  });
  // N5: the bundle carries the A2/A3 credential manifest hash, read
  // live from the database at bundle time — the baseline T1 re-verifies.
  const credentialManifestHash = withCredentialHash
    ? buildCredentialVersionManifest(db, { snapshotId }).manifestHash
    : undefined;
  return buildFreezeReadinessBundle({ snapshotId, writeLock, schedulerQuiescence, callbackDrain, hwmCompleteness, credentialManifestHash });
}

function buildBundle(db) {
  return buildBundleFor(db, SNAPSHOT);
}

// Recovery-bound verification report (V): a report for the recovery
// that entered RECOVERY at `epoch` via `trigger`.
function recoveryVerification(trigger, epoch, recoveryReceiptDigest, snapshotId = SNAPSHOT) {
  return buildTwoSidedVerificationReport({
    snapshotId,
    checks: Object.fromEntries(VERIFICATION_CHECK_IDS.map((id) => [id, { passed: true, detail: `synthetic ${id}` }])),
    context: { kind: "recovery-resume", epoch, trigger, recoveryReceiptDigest },
  });
}

// All 28 items closed: fence every baseline id except U-F17, which is
// derived from U-01..U-10. U: every fenced claim carries the R7
// disposition record as its evidence ref.
const FENCED_REF = "decisions/D3_28_ITEMS_DISPOSITION_R7_2026-11-24.md (R7-approved writer dispositions)";
function fencedRefMap(ids) {
  return Object.fromEntries(ids.map((id) => [id, FENCED_REF]));
}
function closedCoverage() {
  const fenced = fencedRefMap(UNFENCED_WRITER_BASELINE.map((entry) => entry.id).filter((id) => id !== "U-F17"));
  return buildWriterCoverageMatrix({ fenced });
}

function drainedTracker(clock) {
  const tracker = createDrainTracker({ timeoutMs: 60000, now: clock.now });
  tracker.registerWrite("s2s-tx-1");
  tracker.registerCallback("s2s-cb-1");
  tracker.settleWrite("s2s-tx-1");
  tracker.settleCallback("s2s-cb-1");
  tracker.markSchedulerQuiesced();
  tracker.recordHwmObservation({ rowCounts: { s2s_items: 2 }, maxUpdatedAt: { s2s_items: "2026-11-21T00:01:00.000Z" } });
  tracker.recordHwmObservation({ rowCounts: { s2s_items: 2 }, maxUpdatedAt: { s2s_items: "2026-11-21T00:01:00.000Z" } });
  return tracker;
}

function passingVerification(freezeReceiptDigest, snapshotId = SNAPSHOT, manifestDigest) {
  return buildTwoSidedVerificationReport({
    snapshotId,
    context: freezeReceiptDigest ? { kind: "freeze-switch", freezeReceiptDigest, manifestDigest } : null,
    checks: Object.fromEntries(VERIFICATION_CHECK_IDS.map((id) => [id, { passed: true, detail: `synthetic ${id}` }])),
  });
}

function appliedDelta(freezeReceiptDigest, snapshotId = SNAPSHOT, manifestDigest) {
  return buildDeltaCatchupReport({
    snapshotId,
    freezeReceiptDigest,
    manifestDigest,
    items: [{ table: "s2s_items", pk: "2", disposition: "applied" }],
  });
}

function freezeHappy(t) {
  const { db, coordinator, clock } = makeCoordinator(t);
  const result = coordinator.freeze({
    readinessBundle: buildBundle(db),
    coverageMatrix: closedCoverage(),
    drainTracker: drainedTracker(clock),
    checkpointId: CHECKPOINT,
  });
  return { db, coordinator, clock, result };
}

function driveToD1(t) {
  const ctx = freezeHappy(t);
  const { manifestDigest } = bindFrozenSnapshot(ctx);
  const switched = ctx.coordinator.switchToD1({
    deltaReport: appliedDelta(ctx.result.freezeReceipt.receiptDigest, SNAPSHOT, manifestDigest),
    verificationReport: passingVerification(ctx.result.freezeReceipt.receiptDigest, SNAPSHOT, manifestDigest),
    c1ApprovalRef: "s2s-c1-approval-001",
    handover: { verifiedBy: "s2s-reviewer-001", verifiedAt: "2026-11-21T00:05:00.000Z", receiptRef: "s2s-handover-001" },
  });
  return { ...ctx, switched };
}

// U-F10 D-2/D-3: the full snapshot-gate chain for a frozen coordinator —
// issue the run instruction (G1/G2), build a manifest for the snapshot
// taken under it, and bind the manifest to the freeze receipt. T2
// (switchToD1) refuses to run without this binding.
function bindFrozenSnapshot(ctx) {
  const { db, coordinator, result } = ctx;
  const schedulerQuiescence = buildSchedulerQuiescenceReceipt({
    snapshotId: SNAPSHOT,
    evidence: Object.fromEntries(SCHEDULER_JOBS.map((job) => [job.id, true])),
  });
  const callbackDrain = buildCallbackDrainReceipt({ snapshotId: SNAPSHOT, callbacks: [] });
  const instruction = coordinator.issueSnapshotGateInstruction({
    freezeReceipt: result.freezeReceipt,
    schedulerQuiescence,
    callbackDrain,
    operator: "s2s-operator-001",
    windowStart: "2026-11-21T00:05:00.000Z",
    windowEnd: "2026-11-21T00:10:00.000Z",
  });
  const manifest = buildSnapshotGateManifest({
    snapshotId: SNAPSHOT,
    checkpointId: CHECKPOINT,
    freezeReceiptDigest: result.freezeReceipt.receiptDigest,
    basename: "s2s-snapshot.sqlite",
    sha256: "a".repeat(64),
    byteCount: 4096,
    createdAt: "2026-11-21T00:05:00.000Z",
    quickCheck: true,
    foreignKeys: true,
    schemaVersion: 1,
    journalMode: "delete",
  });
  return coordinator.bindSnapshotManifest({
    instruction,
    manifest,
    acceptance: { quickCheck: true, foreignKeys: true },
  });
}

function codeOf(fn) {
  try {
    fn();
  } catch (error) {
    return error.code;
  }
  return null;
}

// --- Coverage matrix: M-1..M-8 --------------------------------------------

test("M-1 baseline matrix lists 28 items, all open, cutover blocked", () => {
  const matrix = buildWriterCoverageMatrix();
  assert.equal(matrix.total, 28);
  assert.equal(matrix.entries.length, 28);
  assert.deepEqual(matrix.counts, { open: 28, fenced: 0, waived: 0, outOfScope: 0 });
  assert.equal(matrix.cutoverBlocked, true);
  assert.equal(matrix.openIds.length, 28);
  assert.ok(matrix.openIds.includes("U-F1") && matrix.openIds.includes("U-F18") && matrix.openIds.includes("U-10"));
  assert.equal(matrix.schemaVersion, FREEZE_DRAIN_COORDINATOR_VERSION);
  assert.match(matrix.matrixDigest, /^[0-9a-f]{64}$/);
  assert.deepEqual(verifyWriterCoverageMatrix(matrix), { valid: true, total: 28, openIds: matrix.openIds, cutoverBlocked: true });
});

test("M-2 fencing all 28 closes the gate; U-F17 is fenced via U-01..U-10", () => {
  const matrix = closedCoverage();
  assert.deepEqual(matrix.counts, { open: 0, fenced: 28, waived: 0, outOfScope: 0 });
  assert.equal(matrix.cutoverBlocked, false);
  assert.deepEqual(matrix.openIds, []);
  assert.equal(matrix.entries.find((e) => e.id === "U-F17").status, "fenced");
  assert.deepEqual(verifyWriterCoverageMatrix(matrix).cutoverBlocked, false);
});

test("M-3 U-F17 is derived: 9 of 10 untraced fenced leaves it open; direct set is refused", () => {
  const fenced = fencedRefMap(UNFENCED_WRITER_BASELINE.map((e) => e.id).filter((id) => id !== "U-F17" && id !== "U-10"));
  const matrix = buildWriterCoverageMatrix({ fenced });
  assert.equal(matrix.entries.find((e) => e.id === "U-F17").status, "open");
  assert.equal(matrix.cutoverBlocked, true);
  assert.equal(codeOf(() => buildWriterCoverageMatrix({ fenced: { "U-F17": FENCED_REF } })), "freeze_coverage_uf17_derived");
  assert.equal(codeOf(() => buildWriterCoverageMatrix({ waivers: { "U-F17": "s2s-waiver-1" } })), "freeze_coverage_uf17_derived");
});

test("M-4 waiver without a ref is refused; with a ref it closes that item", () => {
  assert.equal(codeOf(() => buildWriterCoverageMatrix({ waivers: { "U-F1": "" } })), "freeze_coverage_waiver_invalid");
  const fenced = fencedRefMap(UNFENCED_WRITER_BASELINE.map((e) => e.id).filter((id) => id !== "U-F17" && id !== "U-F1"));
  const matrix = buildWriterCoverageMatrix({ fenced, waivers: { "U-F1": "s2s-yi-waiver-2026-11-21-001" } });
  const entry = matrix.entries.find((e) => e.id === "U-F1");
  assert.equal(entry.status, "waived");
  assert.equal(entry.evidence.ref, "s2s-yi-waiver-2026-11-21-001");
  assert.equal(matrix.counts.waived, 1);
  assert.equal(matrix.cutoverBlocked, false);
});

test("M-5 out-of-scope needs a basis; U-F9/U-F14 close as out-of-scope with inventory citation", () => {
  assert.equal(codeOf(() => buildWriterCoverageMatrix({ outOfScope: { "U-F9": "" } })), "freeze_coverage_basis_invalid");
  const fenced = fencedRefMap(UNFENCED_WRITER_BASELINE.map((e) => e.id).filter((id) => id !== "U-F17" && id !== "U-F9" && id !== "U-F14"));
  const matrix = buildWriterCoverageMatrix({
    fenced,
    outOfScope: {
      "U-F9": "1B inventory §15.2: schema-ensure DDL, out of fence scope by operator discipline",
      "U-F14": "1B inventory §15.2: schema-migration writers, DDL out of scope",
    },
  });
  assert.equal(matrix.counts.outOfScope, 2);
  assert.equal(matrix.cutoverBlocked, false);
  assert.equal(matrix.entries.find((e) => e.id === "U-F9").evidence.kind, "out-of-scope");
});

test("M-6 unknown ids and conflicting dispositions are refused", () => {
  assert.equal(codeOf(() => buildWriterCoverageMatrix({ fenced: { "U-F99": FENCED_REF } })), "freeze_coverage_unknown");
  assert.equal(codeOf(() => buildWriterCoverageMatrix({ fenced: { "U-F1": FENCED_REF }, waivers: { "U-F1": "s2s-w-1" } })), "freeze_coverage_conflict");
  assert.equal(codeOf(() => buildWriterCoverageMatrix({ waivers: { "U-F1": "s2s-w-1" }, outOfScope: { "U-F1": "basis" } })), "freeze_coverage_conflict");
});

test("M-7 tampering with a matrix entry breaks its digest", () => {
  const matrix = buildWriterCoverageMatrix();
  const tampered = { ...matrix, entries: matrix.entries.map((e) => (e.id === "U-F1" ? { ...e, status: "fenced" } : e)) };
  // The forged fenced entry carries no evidence ref, so the rebuild
  // refuses it (U) before the digest comparison is even reached;
  // either way the tampered matrix is rejected, never accepted.
  assert.equal(codeOf(() => verifyWriterCoverageMatrix(tampered)), "freeze_coverage_fence_evidence_invalid");
  // A tamper that keeps the evidence shape intact is caught by the
  // digest comparison itself.
  const tamperedWaived = { ...matrix, entries: matrix.entries.map((e) => (e.id === "U-F1" ? { ...e, status: "waived", evidence: { kind: "waived", ref: "s2s-forged" } } : e)) };
  assert.equal(codeOf(() => verifyWriterCoverageMatrix(tamperedWaived)), "freeze_coverage_digest_mismatch");
});

test("M-8 mixed dispositions count correctly and close the gate", () => {
  const fenced = fencedRefMap(UNFENCED_WRITER_BASELINE.map((e) => e.id).filter((id) => !["U-F17", "U-F1", "U-F9", "U-F14"].includes(id)));
  const matrix = buildWriterCoverageMatrix({
    fenced,
    waivers: { "U-F1": "s2s-yi-waiver-2026-11-21-002" },
    outOfScope: { "U-F9": "DDL, operator discipline", "U-F14": "DDL, operator discipline" },
  });
  assert.deepEqual(matrix.counts, { open: 0, fenced: 25, waived: 1, outOfScope: 2 });
  assert.equal(matrix.cutoverBlocked, false);
});

// --- Drain tracker: D-1..D-5 ----------------------------------------------

test("D-1 drain stays pending until writes, callbacks, scheduler and HWM all settle", (t) => {
  const { now } = makeClock(t);
  const tracker = createDrainTracker({ timeoutMs: 60000, now });
  tracker.registerWrite("s2s-tx-1");
  tracker.registerCallback("s2s-cb-1");
  assert.equal(codeOf(() => tracker.assertDrained()), "freeze_drain_pending");
  tracker.settleWrite("s2s-tx-1");
  tracker.settleCallback("s2s-cb-1");
  assert.equal(codeOf(() => tracker.assertDrained()), "freeze_drain_pending");
  tracker.markSchedulerQuiesced();
  assert.equal(codeOf(() => tracker.assertDrained()), "freeze_drain_pending");
  tracker.recordHwmObservation({ rowCounts: { s2s_items: 2 } });
  assert.equal(codeOf(() => tracker.assertDrained()), "freeze_drain_pending");
  tracker.recordHwmObservation({ rowCounts: { s2s_items: 2 } });
  assert.equal(tracker.assertDrained().drained, true);
});

test("D-2 a single HWM observation is not stability; two identical ones are", (t) => {
  const { now } = makeClock(t);
  const tracker = createDrainTracker({ timeoutMs: 60000, now });
  tracker.markSchedulerQuiesced();
  tracker.recordHwmObservation({ rowCounts: { s2s_items: 2 } });
  assert.equal(tracker.status().hwmStable, false);
  tracker.recordHwmObservation({ rowCounts: { s2s_items: 2 } });
  assert.equal(tracker.status().hwmStable, true);
  assert.equal(tracker.status().drained, true);
});

test("D-3 a changed second HWM observation is not stable", (t) => {
  const { now } = makeClock(t);
  const tracker = createDrainTracker({ timeoutMs: 60000, now });
  tracker.markSchedulerQuiesced();
  tracker.recordHwmObservation({ rowCounts: { s2s_items: 2 } });
  tracker.recordHwmObservation({ rowCounts: { s2s_items: 3 } });
  assert.equal(tracker.status().hwmStable, false);
  assert.equal(tracker.status().drained, false);
});

test("D-4 drain timeout stops the freeze instead of waiting silently", (t) => {
  const clock = makeClock(t);
  const tracker = createDrainTracker({ timeoutMs: 1000, now: clock.now });
  tracker.registerWrite("s2s-tx-stuck");
  tracker.markSchedulerQuiesced();
  assert.equal(codeOf(() => tracker.assertDrained()), "freeze_drain_pending");
  clock.advance(1001);
  assert.equal(tracker.status().timedOut, true);
  assert.equal(codeOf(() => tracker.assertDrained()), "freeze_drain_timeout");
});

test("D-5 settling an unknown id and double-registering are refused", (t) => {
  const { now } = makeClock(t);
  const tracker = createDrainTracker({ timeoutMs: 60000, now });
  assert.equal(codeOf(() => tracker.settleWrite("s2s-nope")), "freeze_drain_unknown");
  tracker.registerCallback("s2s-cb-1");
  assert.equal(codeOf(() => tracker.registerCallback("s2s-cb-1")), "freeze_drain_duplicate");
});

// --- Delta + verification reports: V-1..V-4 ------------------------------

test("V-1 empty delta needs explicit confirmation; undispositioned items are refused", () => {
  assert.equal(codeOf(() => buildDeltaCatchupReport({ snapshotId: SNAPSHOT, items: [] })), "freeze_delta_empty_unconfirmed");
  const empty = buildDeltaCatchupReport({ snapshotId: SNAPSHOT, items: [], confirmedEmpty: true });
  assert.equal(empty.confirmedEmpty, true);
  assert.equal(codeOf(() => buildDeltaCatchupReport({ snapshotId: SNAPSHOT, items: [{ table: "s2s_items", pk: "1", disposition: "applied" }], confirmedEmpty: true })), "freeze_delta_invalid");
  assert.equal(codeOf(() => buildDeltaCatchupReport({ snapshotId: SNAPSHOT, items: [{ table: "s2s_items", pk: "1" }] })), "freeze_delta_undispositioned");
  assert.deepEqual(verifyDeltaCatchupReport(empty), { valid: true });
});

test("V-2 verification report requires all fifteen checks", () => {
  const partial = Object.fromEntries(VERIFICATION_CHECK_IDS.slice(0, 14).map((id) => [id, { passed: true }]));
  assert.equal(VERIFICATION_CHECK_IDS.length, 15);
  assert.equal(codeOf(() => buildTwoSidedVerificationReport({ snapshotId: SNAPSHOT, checks: partial })), "freeze_verification_incomplete");
  assert.equal(codeOf(() => buildTwoSidedVerificationReport({ snapshotId: SNAPSHOT, checks: { ...partial, "V-8": { passed: "yes" } } })), "freeze_verification_invalid");
});

test("V-3 one failed check fails the verdict and blocks the switch gate", () => {
  const checks = Object.fromEntries(VERIFICATION_CHECK_IDS.map((id) => [id, { passed: id !== "C-3" }]));
  const report = buildTwoSidedVerificationReport({ snapshotId: SNAPSHOT, checks });
  assert.equal(report.verdict, "fail");
  assert.deepEqual(report.failedIds, ["C-3"]);
  assert.deepEqual(verifyTwoSidedVerificationReport(report), { valid: true, verdict: "fail", failedIds: ["C-3"], context: null });
});

test("V-4 tampering with either report breaks its digest", () => {
  const delta = appliedDelta();
  assert.equal(codeOf(() => verifyDeltaCatchupReport({ ...delta, items: [{ table: "s2s_items", pk: "9", disposition: "applied" }] })), "freeze_delta_digest_mismatch");
  const verification = passingVerification();
  const tampered = { ...verification, checks: { ...verification.checks, "C-1": { passed: false, detail: "" } } };
  // Tampering with the checks changes the recomputed verdict, so the
  // verdict check (C1) fires before the digest check; the report is
  // still rejected.
  assert.equal(codeOf(() => verifyTwoSidedVerificationReport(tampered)), "freeze_verification_verdict_mismatch");
  // Tampering with only the digest (checks/verdict untouched) is
  // caught by the digest check itself.
  assert.equal(codeOf(() => verifyTwoSidedVerificationReport({ ...verification, reportDigest: "0".repeat(64) })), "freeze_verification_digest_mismatch");
});

// --- S (PR #906 r4662139130): the verifier re-validates build-time
// invariants, so a forged delta report with a recomputed digest is
// still refused.

function forgedDeltaReport({ snapshotId, items, confirmedEmpty, allDispositioned = true, extraTopLevel = {} }) {
  const reportDigest = createHash("sha256").update(testCanonicalJson({
    version: FREEZE_DRAIN_COORDINATOR_VERSION,
    type: "delta-catchup-report",
    snapshotId,
    payload: { items, confirmedEmpty },
  }), "utf8").digest("hex");
  return {
    type: "delta-catchup-report",
    schemaVersion: FREEZE_DRAIN_COORDINATOR_VERSION,
    snapshotId,
    items,
    confirmedEmpty,
    allDispositioned,
    timestamp: "2026-11-21T00:00:00.000Z",
    reportDigest,
    ...extraTopLevel,
  };
}

test("V-7 forged delta reports (digest recomputed over non-conforming content) are still refused (S)", () => {
  // Empty items + confirmedEmpty false: the digest is valid for the
  // content, but the content is not a conclusion.
  assert.equal(codeOf(() => verifyDeltaCatchupReport(forgedDeltaReport({ snapshotId: SNAPSHOT, items: [], confirmedEmpty: false }))), "freeze_delta_empty_unconfirmed");
  // Illegal disposition.
  assert.equal(codeOf(() => verifyDeltaCatchupReport(forgedDeltaReport({ snapshotId: SNAPSHOT, items: [{ table: "s2s_items", pk: "1", disposition: "pending" }], confirmedEmpty: false }))), "freeze_delta_undispositioned");
  // Duplicate table:pk.
  assert.equal(codeOf(() => verifyDeltaCatchupReport(forgedDeltaReport({
    snapshotId: SNAPSHOT,
    items: [
      { table: "s2s_items", pk: "1", disposition: "applied" },
      { table: "s2s_items", pk: "1", disposition: "applied" },
    ],
    confirmedEmpty: false,
  }))), "freeze_delta_duplicate");
  // Non-empty items + confirmedEmpty true contradict each other.
  assert.equal(codeOf(() => verifyDeltaCatchupReport(forgedDeltaReport({ snapshotId: SNAPSHOT, items: [{ table: "s2s_items", pk: "1", disposition: "applied" }], confirmedEmpty: true }))), "freeze_delta_invalid");
  // allDispositioned false is not a complete report.
  assert.equal(codeOf(() => verifyDeltaCatchupReport(forgedDeltaReport({ snapshotId: SNAPSHOT, items: [{ table: "s2s_items", pk: "1", disposition: "applied" }], confirmedEmpty: false, allDispositioned: false }))), "freeze_delta_invalid");
  // An extra field on an item: the verifier normalizes the items
  // before recomputing the digest, so the forged digest (over the
  // un-normalized items) no longer matches.
  assert.equal(codeOf(() => verifyDeltaCatchupReport(forgedDeltaReport({ snapshotId: SNAPSHOT, items: [{ table: "s2s_items", pk: "1", disposition: "applied", note: "s2s-extra" }], confirmedEmpty: false }))), "freeze_delta_digest_mismatch");
  // An unknown top-level field is refused even with a recomputed digest.
  assert.equal(codeOf(() => verifyDeltaCatchupReport(forgedDeltaReport({ snapshotId: SNAPSHOT, items: [], confirmedEmpty: true, extraTopLevel: { reviewer: "s2s-reviewer-001" } }))), "freeze_delta_invalid");
  // The conforming forged shape still verifies (the helper itself is sound).
  assert.deepEqual(verifyDeltaCatchupReport(forgedDeltaReport({ snapshotId: SNAPSHOT, items: [{ table: "s2s_items", pk: "1", disposition: "applied" }], confirmedEmpty: false })), { valid: true });
});

// --- U (PR #906 r4662139139): a fenced claim needs an evidence ref.

test("V-8 fenced claims without an evidence ref are refused; with a ref they verify (U)", () => {
  assert.equal(codeOf(() => buildWriterCoverageMatrix({ fenced: ["U-F1"] })), "freeze_coverage_fence_evidence_invalid");
  assert.equal(codeOf(() => buildWriterCoverageMatrix({ fenced: [{ id: "U-F1" }] })), "freeze_coverage_fence_evidence_invalid");
  assert.equal(codeOf(() => buildWriterCoverageMatrix({ fenced: { "U-F1": "" } })), "freeze_coverage_fence_evidence_invalid");
  assert.equal(codeOf(() => buildWriterCoverageMatrix({ fenced: [{ id: "U-F1", ref: "" }] })), "freeze_coverage_fence_evidence_invalid");
  const viaMap = buildWriterCoverageMatrix({ fenced: { "U-F1": FENCED_REF } });
  assert.equal(viaMap.entries.find((e) => e.id === "U-F1").status, "fenced");
  assert.deepEqual(viaMap.entries.find((e) => e.id === "U-F1").evidence, { kind: "fenced", ref: FENCED_REF });
  const viaArray = buildWriterCoverageMatrix({ fenced: [{ id: "U-F1", ref: FENCED_REF }] });
  assert.deepEqual(viaArray.entries.find((e) => e.id === "U-F1").evidence, { kind: "fenced", ref: FENCED_REF });
  // A matrix built the old way (fenced entries with no ref, digest
  // recomputed over that shape) fails verification: the rebuild
  // refuses the missing ref before any digest comparison.
  const stripped = closedCoverage();
  stripped.entries = stripped.entries.map((e) => (e.status === "fenced" && e.id !== "U-F17" ? { ...e, evidence: { kind: "fenced" } } : e));
  const counts = {
    open: stripped.entries.filter((e) => e.status === "open").length,
    fenced: stripped.entries.filter((e) => e.status === "fenced").length,
    waived: stripped.entries.filter((e) => e.status === "waived").length,
    outOfScope: stripped.entries.filter((e) => e.status === "out-of-scope").length,
  };
  stripped.matrixDigest = createHash("sha256").update(testCanonicalJson({
    version: FREEZE_DRAIN_COORDINATOR_VERSION,
    type: "writer-coverage-matrix",
    total: stripped.entries.length,
    counts,
    entries: stripped.entries.map((e) => ({ id: e.id, status: e.status, evidence: e.evidence })),
  }), "utf8").digest("hex");
  assert.equal(codeOf(() => verifyWriterCoverageMatrix(stripped)), "freeze_coverage_fence_evidence_invalid");
});

// --- T (PR #906 r4662139137): freeze binds the readiness bundle to
// this coordinator's snapshot.

test("T-1 freeze refuses a readiness bundle built for a different snapshot (T)", (t) => {
  const { db, coordinator, clock } = makeCoordinator(t);
  const foreignBundle = buildBundleFor(db, "s2s-other-snapshot-001");
  assert.equal(codeOf(() => coordinator.freeze({
    readinessBundle: foreignBundle,
    coverageMatrix: closedCoverage(),
    drainTracker: drainedTracker(clock),
    checkpointId: CHECKPOINT,
  })), "freeze_readiness_bundle_snapshot_mismatch");
  assert.equal(readWriterAuthority(db).phase, "BWH_ACTIVE");
});

// --- N5 (PR #932 r4701898636): T1 re-verifies the credential
// manifest against the A2/A3 bundle baseline. The window under test
// is A3 -> T1: a rotation landing after the bundle is built must
// refuse the freeze, even though the HWM cannot see it. Assertions
// compare derived values (live manifest hash, live HWM, phase);
// no epoch / snapshot / hash value is hardcoded as a pass criterion.

function n5FreezeArgs(db, clock, bundle) {
  return {
    readinessBundle: bundle,
    coverageMatrix: closedCoverage(),
    drainTracker: drainedTracker(clock),
    checkpointId: CHECKPOINT,
  };
}

test("N5-a credential rotation between A3 and T1 refuses the freeze (insert / delete)", (t) => {
  const cases = [
    {
      name: "insert",
      mutate(db) {
        seedCredentialRow(db, { requestId: "s2s-request-003", channelRef: "s2s-channel-a", credentialRef: "s2s-cred-003" });
      },
    },
    {
      name: "delete",
      mutate(db) {
        db.prepare("delete from platform_portal_edge_credentials where request_id = ? and edge_channel_ref = ?").run("s2s-request-002", "s2s-channel-a");
      },
    },
  ];
  for (const { name, mutate } of cases) {
    const { db, coordinator, clock } = makeCoordinator(t);
    const bundle = buildBundle(db);
    mutate(db);
    assert.equal(codeOf(() => coordinator.freeze(n5FreezeArgs(db, clock, bundle))), "freeze_credential_version_moved", name);
    assert.deepEqual([readWriterAuthority(db).phase, readWriterAuthority(db).epoch], ["BWH_ACTIVE", 1], name);
    assert.equal(coordinator.readLog().length, 0, name);
  }
});

test("N5-b no rotation: freeze proceeds and the T1 receipt binds the bundle manifest hash", (t) => {
  const { db, coordinator, clock } = makeCoordinator(t);
  const bundle = buildBundle(db);
  const result = coordinator.freeze(n5FreezeArgs(db, clock, bundle));
  assert.equal(result.authority.phase, "FROZEN");
  // Derived, not hardcoded: the T1 gate ref must equal the hash the
  // bundle carried and the live manifest still reads at T1.
  assert.equal(result.coordinatorReceipt.gateRefs.credentialManifestHash, bundle.credentialManifestHash);
  assert.equal(
    result.coordinatorReceipt.gateRefs.credentialManifestHash,
    buildCredentialVersionManifest(db, { snapshotId: SNAPSHOT }).manifestHash,
  );
});

test("N5-c missing credential tracking at T1 refuses the freeze (fail-closed)", (t) => {
  const { db, coordinator, clock } = makeCoordinator(t);
  const bundle = buildBundle(db);
  uninstallCredentialVersionTracking(db);
  assert.equal(codeOf(() => coordinator.freeze(n5FreezeArgs(db, clock, bundle))), "freeze_credential_tracking_missing");
  assert.deepEqual([readWriterAuthority(db).phase, readWriterAuthority(db).epoch], ["BWH_ACTIVE", 1]);
  assert.equal(coordinator.readLog().length, 0);
});

test("N5-d in-place rotation refuses even though the credential table's HWM entry does not move", (t) => {
  const { db, coordinator, clock } = makeCoordinator(t);
  const bundle = buildBundle(db);
  const credentialMark = (hwm) => hwm.tables.find((entry) => entry.table === "platform_portal_edge_credentials");
  const markBefore = credentialMark(readHighWaterMark(db));
  db.prepare("update platform_portal_edge_credentials set edge_credential_ref = ?, edge_material_digest = ? where request_id = ? and edge_channel_ref = ?").run(
    "s2s-cred-001-rotated", "sha256:s2s-rotated-material", "s2s-request-001", "s2s-channel-a",
  );
  // The rotation is invisible to the HWM for the credentials table
  // itself: same row count, and the table carries no updated_at.
  // (Only the version table's trigger timestamp can move, which is
  // the tracking working — not the HWM seeing the rotation.)
  assert.deepEqual(credentialMark(readHighWaterMark(db)), markBefore);
  assert.deepEqual(credentialMark(readHighWaterMark(db)), credentialMark(bundle.receipts.writeLock.receipt.highWaterMark));
  assert.equal(codeOf(() => coordinator.freeze(n5FreezeArgs(db, clock, bundle))), "freeze_credential_version_moved");
  assert.equal(readWriterAuthority(db).phase, "BWH_ACTIVE");
  assert.equal(coordinator.readLog().length, 0);
});

test("N5-e a bundle without a credential manifest hash refuses the freeze (fail-closed)", (t) => {
  const { db, coordinator, clock } = makeCoordinator(t);
  const bundle = buildBundleFor(db, SNAPSHOT, { withCredentialHash: false });
  assert.equal(bundle.credentialManifestHash, undefined);
  assert.equal(codeOf(() => coordinator.freeze(n5FreezeArgs(db, clock, bundle))), "freeze_readiness_bundle_credential_manifest_missing");
  assert.equal(readWriterAuthority(db).phase, "BWH_ACTIVE");
  assert.equal(coordinator.readLog().length, 0);
});

test("N5-f a non-credential write between A3 and T1 refuses the freeze (HWM belt-and-braces)", (t) => {
  const { db, coordinator, clock } = makeCoordinator(t);
  const bundle = buildBundle(db);
  db.prepare("insert into s2s_notes (id, body) values (2, 'late')").run();
  // The manifest is untouched, so the manifest gate passes and the
  // HWM comparison is what refuses.
  assert.equal(buildCredentialVersionManifest(db, { snapshotId: SNAPSHOT }).manifestHash, bundle.credentialManifestHash);
  assert.equal(codeOf(() => coordinator.freeze(n5FreezeArgs(db, clock, bundle))), "freeze_t1_hwm_moved");
  assert.equal(readWriterAuthority(db).phase, "BWH_ACTIVE");
  assert.equal(coordinator.readLog().length, 0);
});

// --- Coordinator state machine: S-1..S-16 ---------------------------------

test("S-1 freeze happy path: BWH_ACTIVE epoch 1 -> FROZEN epoch 2 with chained receipts", (t) => {
  const { db, coordinator, clock } = makeCoordinator(t);
  const result = coordinator.freeze({
    readinessBundle: buildBundle(db),
    coverageMatrix: closedCoverage(),
    drainTracker: drainedTracker(clock),
    checkpointId: CHECKPOINT,
  });
  assert.equal(result.transitionId, "T1");
  assert.deepEqual([result.authority.phase, result.authority.epoch], ["FROZEN", 2]);
  assert.equal(result.freezeReceipt.phase, "BWH_ACTIVE");
  assert.equal(result.freezeReceipt.epoch, 1);
  assert.equal(result.coordinatorReceipt.seq, 1);
  assert.equal(result.coordinatorReceipt.transitionId, "T1");
  assert.equal(result.coordinatorReceipt.fromEpoch, 1);
  assert.equal(result.coordinatorReceipt.toEpoch, 2);
  assert.equal(readWriterAuthority(db).phase, "FROZEN");
  assert.deepEqual(verifyCoordinatorLog(db), { valid: true, entries: 1 });
  assert.deepEqual(verifyCoordinatorReceipt(db, result.coordinatorReceipt), { valid: true, seq: 1 });
});

test("S-2 freeze with open coverage is refused and the phase does not move", (t) => {
  const { db, coordinator, clock } = makeCoordinator(t);
  const openMatrix = buildWriterCoverageMatrix();
  assert.equal(openMatrix.openIds.length, 28);
  assert.equal(codeOf(() => coordinator.freeze({
    readinessBundle: buildBundle(db),
    coverageMatrix: openMatrix,
    drainTracker: drainedTracker(clock),
    checkpointId: CHECKPOINT,
  })), "freeze_coverage_open");
  assert.deepEqual([readWriterAuthority(db).phase, readWriterAuthority(db).epoch], ["BWH_ACTIVE", 1]);
  assert.equal(coordinator.readLog().length, 0);
});

test("S-3 freeze with a tampered readiness bundle is refused and the phase does not move", (t) => {
  const { db, coordinator, clock } = makeCoordinator(t);
  const bundle = buildBundle(db);
  const tampered = { ...bundle, bundleHash: "0".repeat(64) };
  assert.equal(codeOf(() => coordinator.freeze({
    readinessBundle: tampered,
    coverageMatrix: closedCoverage(),
    drainTracker: drainedTracker(clock),
    checkpointId: CHECKPOINT,
  })), "freeze_bundle_hash_mismatch");
  assert.equal(readWriterAuthority(db).phase, "BWH_ACTIVE");
});

test("S-4 freeze with a pending drain is refused and the phase does not move", (t) => {
  const { db, coordinator, clock } = makeCoordinator(t);
  const tracker = createDrainTracker({ timeoutMs: 60000, now: clock.now });
  tracker.registerWrite("s2s-tx-stuck");
  assert.equal(codeOf(() => coordinator.freeze({
    readinessBundle: buildBundle(db),
    coverageMatrix: closedCoverage(),
    drainTracker: tracker,
    checkpointId: CHECKPOINT,
  })), "freeze_drain_pending");
  assert.equal(readWriterAuthority(db).phase, "BWH_ACTIVE");
});

test("S-5 a second freeze from FROZEN is refused", (t) => {
  // The bundle must be built while still BWH_ACTIVE: the write-lock
  // receipt itself requires BWH_ACTIVE, so a bundle built after the
  // first freeze would fail before the coordinator ever sees it.
  const { db, coordinator, clock } = makeCoordinator(t);
  const bundle = buildBundle(db);
  coordinator.freeze({
    readinessBundle: bundle,
    coverageMatrix: closedCoverage(),
    drainTracker: drainedTracker(clock),
    checkpointId: CHECKPOINT,
  });
  assert.equal(codeOf(() => coordinator.freeze({
    readinessBundle: bundle,
    coverageMatrix: closedCoverage(),
    drainTracker: drainedTracker(clock),
    checkpointId: CHECKPOINT,
  })), "freeze_coordinator_wrong_state");
  assert.equal(readWriterAuthority(db).phase, "FROZEN");
});

test("S-6 switching straight from BWH_ACTIVE to D1_ACTIVE is refused (FROZEN must come first)", (t) => {
  const { coordinator } = makeCoordinator(t);
  assert.equal(codeOf(() => coordinator.switchToD1({
    deltaReport: appliedDelta(),
    verificationReport: passingVerification(),
    c1ApprovalRef: "s2s-c1-approval-001",
    handover: { verifiedBy: "s2s-reviewer-001", verifiedAt: "2026-11-21T00:05:00.000Z", receiptRef: "s2s-handover-001" },
  })), "freeze_coordinator_wrong_state");
});

test("S-7 full path freeze -> switch: FROZEN epoch 2 -> D1_ACTIVE epoch 3, log chain holds", (t) => {
  const { db, coordinator, switched } = driveToD1(t);
  assert.equal(switched.transitionId, "T2");
  assert.deepEqual([switched.authority.phase, switched.authority.epoch], ["D1_ACTIVE", 3]);
  assert.equal(switched.coordinatorReceipt.seq, 2);
  assert.deepEqual(verifyCoordinatorLog(db), { valid: true, entries: 2 });
  assert.deepEqual(verifyCoordinatorReceipt(db, switched.coordinatorReceipt), { valid: true, seq: 2 });
  assert.equal(coordinator.readLog()[1].transitionId, "T2");
});

test("S-8 switch with a failed verification check stays in FROZEN", (t) => {
  const ctx = freezeHappy(t);
  const checks = Object.fromEntries(VERIFICATION_CHECK_IDS.map((id) => [id, { passed: id !== "V-1" }]));
  const report = buildTwoSidedVerificationReport({
    snapshotId: SNAPSHOT, checks,
    context: { kind: "freeze-switch", freezeReceiptDigest: ctx.result.freezeReceipt.receiptDigest },
  });
  assert.equal(codeOf(() => ctx.coordinator.switchToD1({
    deltaReport: appliedDelta(ctx.result.freezeReceipt.receiptDigest),
    verificationReport: report,
    c1ApprovalRef: "s2s-c1-approval-001",
    handover: { verifiedBy: "s2s-reviewer-001", verifiedAt: "2026-11-21T00:05:00.000Z", receiptRef: "s2s-handover-001" },
  })), "freeze_verification_failed");
  assert.deepEqual([readWriterAuthority(ctx.db).phase, readWriterAuthority(ctx.db).epoch], ["FROZEN", 2]);
});

test("S-9 switch without a C1 approval ref is refused (the coordinator never self-approves)", (t) => {
  const ctx = freezeHappy(t);
  assert.equal(codeOf(() => ctx.coordinator.switchToD1({
    deltaReport: appliedDelta(ctx.result.freezeReceipt.receiptDigest),
    verificationReport: passingVerification(ctx.result.freezeReceipt.receiptDigest),
    c1ApprovalRef: "",
    handover: { verifiedBy: "s2s-reviewer-001", verifiedAt: "2026-11-21T00:05:00.000Z", receiptRef: "s2s-handover-001" },
  })), "freeze_c1_approval_missing");
  assert.equal(readWriterAuthority(ctx.db).phase, "FROZEN");
});

test("S-10 switch without a staged-handover verification is refused", (t) => {
  const ctx = freezeHappy(t);
  assert.equal(codeOf(() => ctx.coordinator.switchToD1({
    deltaReport: appliedDelta(ctx.result.freezeReceipt.receiptDigest),
    verificationReport: passingVerification(ctx.result.freezeReceipt.receiptDigest),
    c1ApprovalRef: "s2s-c1-approval-001",
    handover: { verifiedBy: "", verifiedAt: "2026-11-21T00:05:00.000Z", receiptRef: "s2s-handover-001" },
  })), "freeze_handover_unverified");
  assert.equal(readWriterAuthority(ctx.db).phase, "FROZEN");
});

test("S-11 enterRecovery accepts each of the four triggers and refuses unknown ones", (t) => {
  for (const trigger of ROLLBACK_TRIGGERS) {
    const { db, coordinator } = driveToD1(t);
    const result = coordinator.enterRecovery({ trigger, detail: `synthetic ${trigger}` });
    assert.equal(result.transitionId, "T3");
    assert.deepEqual([result.authority.phase, result.authority.epoch], ["RECOVERY", 4]);
    assert.equal(result.coordinatorReceipt.gateRefs.trigger, trigger);
    assert.equal(readWriterAuthority(db).phase, "RECOVERY");
  }
  assert.equal(ROLLBACK_TRIGGERS.length, 4);
  const fresh = driveToD1(t);
  assert.equal(codeOf(() => fresh.coordinator.enterRecovery({ trigger: "operator-felt-like-it" })), "freeze_rollback_trigger_invalid");
  assert.deepEqual([readWriterAuthority(fresh.db).phase, readWriterAuthority(fresh.db).epoch], ["D1_ACTIVE", 3]);
});

test("S-12 return to BWH (T4) is blocked from RECOVERY and from D1_ACTIVE", (t) => {
  const { db, coordinator } = driveToD1(t);
  assert.equal(codeOf(() => coordinator.returnToBwh()), "freeze_return_blocked");
  assert.equal(readWriterAuthority(db).phase, "D1_ACTIVE");
  coordinator.enterRecovery({ trigger: "e4-unavailable" });
  assert.equal(codeOf(() => coordinator.returnToBwh()), "freeze_return_blocked");
  assert.deepEqual([readWriterAuthority(db).phase, readWriterAuthority(db).epoch], ["RECOVERY", 4]);
});

test("S-13 unfreeze (T5): FROZEN -> BWH_ACTIVE lands on epoch 3, never back on epoch 1; re-freeze works", (t) => {
  const ctx = freezeHappy(t);
  const result = ctx.coordinator.unfreeze({ reason: "synthetic verification failure", voidedFreezeReceiptRef: ctx.result.freezeReceipt.receiptDigest });
  assert.equal(result.transitionId, "T5");
  assert.deepEqual([result.authority.phase, result.authority.epoch], ["BWH_ACTIVE", 3]);
  assert.match(result.epochNote, /2 -> 3/);
  const again = ctx.coordinator.freeze({
    readinessBundle: buildBundle(ctx.db),
    coverageMatrix: closedCoverage(),
    drainTracker: drainedTracker(ctx.clock),
    checkpointId: CHECKPOINT,
  });
  assert.deepEqual([again.authority.phase, again.authority.epoch], ["FROZEN", 4]);
  assert.deepEqual(verifyCoordinatorLog(ctx.db), { valid: true, entries: 3 });
});

test("S-14 resume to D1 (R1) needs reverification; with it, RECOVERY -> D1_ACTIVE lands on epoch 5", (t) => {
  const { db, coordinator } = driveToD1(t);
  const { coordinatorReceipt: recovery } = coordinator.enterRecovery({ trigger: "post-switch-mismatch" });
  const failing = buildTwoSidedVerificationReport({
    snapshotId: SNAPSHOT,
    checks: Object.fromEntries(VERIFICATION_CHECK_IDS.map((id) => [id, { passed: id !== "C-1" }])),
  });
  assert.equal(codeOf(() => coordinator.resumeToD1({ reverificationReport: failing })), "freeze_verification_failed");
  assert.equal(readWriterAuthority(db).phase, "RECOVERY");
  // enterRecovery landed on epoch 4 via trigger post-switch-mismatch,
  // so the re-verification must be bound to exactly that recovery.
  const result = coordinator.resumeToD1({ reverificationReport: recoveryVerification("post-switch-mismatch", 4, recovery.receiptDigest) });
  assert.deepEqual([result.authority.phase, result.authority.epoch], ["D1_ACTIVE", 5]);
  assert.equal(result.transitionId, "R1");
  assert.equal(result.coordinatorReceipt.gateRefs.recoveryEpoch, 4);
  assert.equal(result.coordinatorReceipt.gateRefs.recoveryReceiptDigest, recovery.receiptDigest);
  assert.equal(result.coordinatorReceipt.gateRefs.trigger, "post-switch-mismatch");
  assert.match(result.coordinatorReceipt.gateRefs.reverificationDigest, /^[0-9a-f]{64}$/);
});

test("S-21 resume to D1 (R1) refuses a report bound to the wrong recovery (V)", (t) => {
  const { db, coordinator } = driveToD1(t);
  const { coordinatorReceipt: recovery } = coordinator.enterRecovery({ trigger: "post-switch-mismatch" });
  // A switch-time (T2) report carries no recovery context at all.
  assert.equal(codeOf(() => coordinator.resumeToD1({ reverificationReport: passingVerification() })), "freeze_reverification_context_mismatch");
  // A report for a different epoch is refused, even with a valid digest.
  assert.equal(codeOf(() => coordinator.resumeToD1({ reverificationReport: recoveryVerification("post-switch-mismatch", 3, recovery.receiptDigest) })), "freeze_reverification_context_mismatch");
  // A report for a different trigger is refused.
  assert.equal(codeOf(() => coordinator.resumeToD1({ reverificationReport: recoveryVerification("e4-unavailable", 4, recovery.receiptDigest) })), "freeze_reverification_context_mismatch");
  // A forged context (recomputed digest, wrong epoch) is refused too.
  const checks = Object.fromEntries(VERIFICATION_CHECK_IDS.map((id) => [id, { passed: true, detail: `synthetic ${id}` }]));
  const forged = forgedVerificationReport({ snapshotId: SNAPSHOT, checks, verdict: "pass", failedIds: [], context: { kind: "recovery-resume", epoch: 99, trigger: "post-switch-mismatch" } });
  assert.equal(codeOf(() => coordinator.resumeToD1({ reverificationReport: forged })), "freeze_reverification_context_mismatch");
  assert.equal(readWriterAuthority(db).phase, "RECOVERY");
});

test("S-15 entering RECOVERY from FROZEN is refused (nothing has switched yet)", (t) => {
  const ctx = freezeHappy(t);
  assert.equal(codeOf(() => ctx.coordinator.enterRecovery({ trigger: "e4-unavailable" })), "freeze_coordinator_wrong_state");
  assert.equal(readWriterAuthority(ctx.db).phase, "FROZEN");
});

test("S-16 tampering with the durable log or a receipt is detected", (t) => {
  const { db, coordinator, result } = freezeHappy(t);
  db.prepare(`update ${COORDINATOR_LOG_TABLE} set receipt_digest = ? where seq = 1`).run("0".repeat(64));
  assert.equal(codeOf(() => verifyCoordinatorLog(db)), "freeze_coordinator_log_broken");
  assert.equal(codeOf(() => verifyCoordinatorReceipt(db, result.coordinatorReceipt)), "freeze_coordinator_receipt_invalid");
  const tamperedReceipt = { ...result.coordinatorReceipt, toEpoch: 99 };
  // Restore the log first so the receipt-field check (not the chain) is what fails.
  db.prepare(`update ${COORDINATOR_LOG_TABLE} set receipt_digest = ? where seq = 1`).run(result.coordinatorReceipt.receiptDigest);
  assert.deepEqual(verifyCoordinatorLog(db), { valid: true, entries: 1 });
  assert.equal(codeOf(() => verifyCoordinatorReceipt(db, tamperedReceipt)), "freeze_coordinator_receipt_invalid");
});

// --- C1/C3/C4 follow-up tests (PR #906 rereview, 2026-11-23) ------------

// Canonical JSON + digest, replicating the coordinator's reportDigest
// algorithm in the test so a forged report can be built with a
// correctly recomputed digest over its tampered verdict.
function testCanonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(testCanonicalJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${testCanonicalJson(value[key])}`).join(",")}}`;
}

function forgedVerificationReport({ snapshotId, checks, verdict, failedIds, context = null }) {
  const normalized = {};
  for (const id of VERIFICATION_CHECK_IDS) {
    normalized[id] = { passed: checks[id].passed, detail: checks[id].detail ?? "" };
  }
  const reportDigest = createHash("sha256").update(testCanonicalJson({
    version: FREEZE_DRAIN_COORDINATOR_VERSION,
    type: "two-sided-verification-report",
    snapshotId,
    payload: { checks: normalized, verdict, failedIds, context },
  }), "utf8").digest("hex");
  return {
    type: "two-sided-verification-report",
    schemaVersion: FREEZE_DRAIN_COORDINATOR_VERSION,
    snapshotId,
    checks: normalized,
    verdict,
    failedIds,
    context,
    timestamp: "2026-11-21T00:00:00.000Z",
    reportDigest,
  };
}

test("V-5 a forged verification report (failed check, verdict rewritten to pass, digest recomputed) is still rejected", (t) => {
  const checks = Object.fromEntries(VERIFICATION_CHECK_IDS.map((id) => [id, { passed: id !== "C-3", detail: `synthetic ${id}` }]));
  const forged = forgedVerificationReport({ snapshotId: SNAPSHOT, checks, verdict: "pass", failedIds: [] });
  assert.equal(codeOf(() => verifyTwoSidedVerificationReport(forged)), "freeze_verification_verdict_mismatch");
  // The same forgery must not open the T2 gate either.
  const ctx = freezeHappy(t);
  assert.equal(codeOf(() => ctx.coordinator.switchToD1({
    deltaReport: appliedDelta(ctx.result.freezeReceipt.receiptDigest),
    verificationReport: forged,
    c1ApprovalRef: "s2s-c1-approval-001",
    handover: { verifiedBy: "s2s-reviewer-001", verifiedAt: "2026-11-21T00:05:00.000Z", receiptRef: "s2s-handover-001" },
  })), "freeze_verification_verdict_mismatch");
  assert.deepEqual([readWriterAuthority(ctx.db).phase, readWriterAuthority(ctx.db).epoch], ["FROZEN", 2]);
});

test("V-6 tampering with a matrix counts/total is refused even when entries are untouched", () => {
  const matrix = closedCoverage();
  assert.equal(codeOf(() => verifyWriterCoverageMatrix({ ...matrix, counts: { open: 1, fenced: 27, waived: 0, outOfScope: 0 } })), "freeze_coverage_invalid");
  assert.equal(codeOf(() => verifyWriterCoverageMatrix({ ...matrix, total: 99 })), "freeze_coverage_invalid");
  assert.deepEqual(verifyWriterCoverageMatrix(matrix), { valid: true, total: 28, openIds: [], cutoverBlocked: false });
});

test("D-6 drain tracker defaults to the R1 10-minute timeout", (t) => {
  const { now } = makeClock(t);
  const tracker = createDrainTracker({ now });
  assert.equal(tracker.status().timeoutMs, 600000);
});

test("S-17 transition + coordinator log are atomic: a failing log write leaves the phase unmoved", (t) => {
  const { db, coordinator, clock } = makeCoordinator(t);
  db.exec(`create trigger s2s_fail_receipt before insert on ${COORDINATOR_LOG_TABLE} begin select raise(abort, 's2s-forced-receipt-failure'); end;`);
  let thrown = null;
  try {
    coordinator.freeze({
      readinessBundle: buildBundle(db),
      coverageMatrix: closedCoverage(),
      drainTracker: drainedTracker(clock),
      checkpointId: CHECKPOINT,
    });
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown, "freeze must throw when the coordinator log write fails");
  assert.deepEqual([readWriterAuthority(db).phase, readWriterAuthority(db).epoch], ["BWH_ACTIVE", 1]);
  assert.equal(coordinator.readLog().length, 0);
});

test("S-18 reading the coordinator log never creates its table (read-only path)", (t) => {
  const db = new Database(":memory:");
  t.after(() => { if (db.open) db.close(); });
  ensureWriterAuthority(db);
  const tableBefore = db.prepare("select name from main.sqlite_schema where type = 'table' and name = ?").get(COORDINATOR_LOG_TABLE);
  assert.equal(tableBefore, undefined);
  assert.deepEqual(readCoordinatorLog(db), []);
  assert.deepEqual(verifyCoordinatorLog(db), { valid: true, entries: 0 });
  const tableAfter = db.prepare("select name from main.sqlite_schema where type = 'table' and name = ?").get(COORDINATOR_LOG_TABLE);
  assert.equal(tableAfter, undefined);
});

test("S-19 unfreeze with an arbitrary voided receipt ref is refused; the real receipt still works", (t) => {
  const ctx = freezeHappy(t);
  assert.equal(codeOf(() => ctx.coordinator.unfreeze({ reason: "synthetic", voidedFreezeReceiptRef: "s2s-not-a-real-receipt" })), "freeze_unfreeze_receipt_invalid");
  assert.deepEqual([readWriterAuthority(ctx.db).phase, readWriterAuthority(ctx.db).epoch], ["FROZEN", 2]);
  const result = ctx.coordinator.unfreeze({ reason: "synthetic", voidedFreezeReceiptRef: ctx.result.freezeReceipt.receiptDigest });
  assert.equal(result.transitionId, "T5");
});

test("S-20 the switch records the C1 approval and handover refs verbatim for audit (F6, recorded limitation)", (t) => {
  const { switched } = driveToD1(t);
  assert.equal(switched.coordinatorReceipt.gateRefs.c1ApprovalRef, "s2s-c1-approval-001");
  assert.equal(switched.coordinatorReceipt.gateRefs.handover.receiptRef, "s2s-handover-001");
  assert.equal(switched.coordinatorReceipt.gateRefs.handover.verifiedBy, "s2s-reviewer-001");
});

// --- 28-item dispositions landed on this branch: M-9 / M-10 -------------

// U-F9 / U-F14 out-of-scope bases quote inventory §15.2 verbatim.
// U-F15 waiver ref cites Yi's 2026-11-23 09:43 CST landing
// authorization as recorded in the C-track task ("以上授权，及相关密钥
// 制备由你来完成，阻塞有你来清理"); it is that authorization cited
// as the ref, not a separately issued waiver number. If Yi later
// issues a formal waiverRef it replaces this citation.
const UF9_BASIS = "docs/D1_STAGE1B_BWH_WRITE_INVENTORY_V1.md §15.2 U-F9: \"Schema-ensure DDL (W-139…W-143) is DDL, not business writes — explicitly out of fence scope; it must run while BWH_ACTIVE by operator discipline.\"";
const UF14_BASIS = "docs/D1_STAGE1B_BWH_WRITE_INVENTORY_V1.md §15.2 U-F14: \"DDL, not business writes; explicitly out of scope. Migrations run offline by operator and must not run against a frozen / D1-active database — operator discipline until the follow-up defines migration gating.\"";
const UF15_WAIVER_REF = "yi-2026-11-23-0943-cst-d1-landing-authorization";

test("M-9 U-F9/U-F14 land as out-of-scope and U-F15 as waived; the other 25 items stay open", () => {
  const matrix = buildWriterCoverageMatrix({
    outOfScope: { "U-F9": UF9_BASIS, "U-F14": UF14_BASIS },
    waivers: { "U-F15": UF15_WAIVER_REF },
  });
  assert.equal(matrix.entries.find((e) => e.id === "U-F9").status, "out-of-scope");
  assert.equal(matrix.entries.find((e) => e.id === "U-F9").evidence.basis, UF9_BASIS);
  assert.equal(matrix.entries.find((e) => e.id === "U-F14").status, "out-of-scope");
  assert.equal(matrix.entries.find((e) => e.id === "U-F14").evidence.basis, UF14_BASIS);
  assert.equal(matrix.entries.find((e) => e.id === "U-F15").status, "waived");
  assert.equal(matrix.entries.find((e) => e.id === "U-F15").evidence.ref, UF15_WAIVER_REF);
  assert.deepEqual(matrix.counts, { open: 25, fenced: 0, waived: 1, outOfScope: 2 });
  assert.equal(matrix.cutoverBlocked, true);
  assert.deepEqual(verifyWriterCoverageMatrix(matrix), { valid: true, total: 28, openIds: matrix.openIds, cutoverBlocked: true });
});

test("M-10 U-F16 is locked: agent epoch forwarding defaults OFF and run-once does not enable it", () => {
  const runOnce = readFileSync(new URL("../../agent/g4/run-once.mjs", import.meta.url), "utf8");
  assert.ok(!runOnce.includes("writerEpochForwarding"), "run-once must not enable epoch forwarding");
  assert.ok(!runOnce.includes("epochProvider"), "run-once must not supply an epoch provider");
  const agentClient = readFileSync(new URL("../../agent/g4/agent-client.mjs", import.meta.url), "utf8");
  assert.ok(agentClient.includes("writerEpochForwarding = false"), "forwarding must default OFF in the agent client");
  // Default-OFF is also behaviourally locked by S1B-AGT-1 in
  // server/tests/d1-stage1b-agent-epoch-transport.test.mjs (master).
  // Forwarding can only be turned on by an approved staged handover.
  const matrix = buildWriterCoverageMatrix({ fenced: { "U-F16": FENCED_REF } });
  assert.equal(matrix.entries.find((e) => e.id === "U-F16").status, "fenced");
  assert.equal(matrix.entries.find((e) => e.id === "U-F16").evidence.ref, FENCED_REF);
  assert.equal(matrix.cutoverBlocked, true);
});

function switchEvidence(digest, manifestDigest) {
  return {
    deltaReport: appliedDelta(digest, SNAPSHOT, manifestDigest),
    verificationReport: passingVerification(digest, SNAPSHOT, manifestDigest),
    c1ApprovalRef: "s2s-c1-approval-current",
    handover: { verifiedBy: "s2s-reviewer", verifiedAt: "2026-11-21T00:05:00.000Z", receiptRef: "s2s-handover" },
  };
}

function cycleFreeze(ctx) {
  ctx.coordinator.unfreeze({ reason: "synthetic", voidedFreezeReceiptRef: ctx.result.freezeReceipt.receiptDigest });
  const result = ctx.coordinator.freeze({
    readinessBundle: buildBundle(ctx.db),
    coverageMatrix: closedCoverage(),
    drainTracker: drainedTracker(ctx.clock),
    checkpointId: CHECKPOINT,
  });
  return { ...ctx, result };
}

test("T2 independently requires snapshot and T1 binding in both reports", (t) => {
  const first = freezeHappy(t);
  const oldDigest = first.result.freezeReceipt.receiptDigest;
  const ctx = cycleFreeze(first);
  const digest = ctx.result.freezeReceipt.receiptDigest;
  assert.notEqual(digest, oldDigest);
  const { manifestDigest } = bindFrozenSnapshot(ctx);
  const valid = switchEvidence(digest, manifestDigest);
  const other = "s2s-other-snapshot";
  const scenarios = [
    [{ deltaReport: appliedDelta(digest, other) }, "freeze_delta_context_mismatch"],
    [{ deltaReport: appliedDelta(oldDigest) }, "freeze_delta_context_mismatch"],
    [{ deltaReport: appliedDelta() }, "freeze_delta_context_mismatch"],
    [{ verificationReport: passingVerification(digest, other) }, "freeze_verification_context_mismatch"],
    [{ verificationReport: passingVerification(oldDigest) }, "freeze_verification_context_mismatch"],
    [{ verificationReport: passingVerification() }, "freeze_verification_context_mismatch"],
    [{ verificationReport: recoveryVerification("e4-unavailable", 4) }, "freeze_verification_context_mismatch"],
  ];
  for (const [input, refusal] of scenarios) {
    assert.equal(codeOf(() => ctx.coordinator.switchToD1({ ...valid, ...input })), refusal);
    assert.deepEqual([ctx.coordinator.currentAuthority().phase, ctx.coordinator.currentAuthority().epoch], ["FROZEN", 4]);
    assert.equal(ctx.coordinator.readLog().length, 3);
  }
  const switched = ctx.coordinator.switchToD1(valid);
  assert.equal(switched.authority.phase, "D1_ACTIVE");
  assert.equal(switched.coordinatorReceipt.gateRefs.freezeReceiptDigest, digest);
});

test("T5 only consumes the current T1, not a historical or another snapshot's T1", (t) => {
  const first = freezeHappy(t);
  const ctx = cycleFreeze(first);
  const current = ctx.result.freezeReceipt.receiptDigest;
  const unrelated = createFreezeDrainCoordinator(ctx.db, { snapshotId: "s2s-other-snapshot" });
  assert.equal(codeOf(() => unrelated.unfreeze({ reason: "synthetic", voidedFreezeReceiptRef: current })),
    "freeze_coordinator_freeze_context_mismatch");
  assert.equal(codeOf(() => ctx.coordinator.unfreeze({ reason: "synthetic", voidedFreezeReceiptRef: first.result.freezeReceipt.receiptDigest })),
    "freeze_unfreeze_receipt_invalid");
  assert.equal(ctx.coordinator.currentAuthority().epoch, 4);
  assert.equal(ctx.coordinator.readLog().length, 3);
  assert.equal(ctx.coordinator.unfreeze({ reason: "synthetic", voidedFreezeReceiptRef: current }).authority.epoch, 5);
});

test("log verification and subsequent transitions require the durable authority tip", (t) => {
  const { db, coordinator, result, switched } = driveToD1(t);
  // A synthetic storage-loss fixture: leave only a valid prefix.
  db.prepare(`delete from ${COORDINATOR_LOG_TABLE} where seq = ?`).run(switched.coordinatorReceipt.seq);
  assert.equal(codeOf(() => verifyCoordinatorLog(db)), "freeze_coordinator_log_authority_mismatch");
  assert.equal(codeOf(() => verifyCoordinatorReceipt(db, result.coordinatorReceipt)), "freeze_coordinator_log_authority_mismatch");
  assert.equal(codeOf(() => coordinator.enterRecovery({ trigger: "e4-unavailable" })), "freeze_coordinator_log_authority_mismatch");
  assert.deepEqual([coordinator.currentAuthority().phase, coordinator.currentAuthority().epoch], ["D1_ACTIVE", 3]);
  assert.equal(coordinator.readLog().length, 1);
});

test("an empty log is not a valid bootstrap once durable authority has advanced", (t) => {
  const { db, coordinator, result } = freezeHappy(t);
  db.exec(`delete from ${COORDINATOR_LOG_TABLE}`);
  assert.equal(codeOf(() => verifyCoordinatorLog(db)), "freeze_coordinator_log_authority_mismatch");
  assert.equal(codeOf(() => coordinator.unfreeze({ reason: "synthetic", voidedFreezeReceiptRef: result.freezeReceipt.receiptDigest })),
    "freeze_coordinator_log_authority_mismatch");
  assert.equal(coordinator.currentAuthority().epoch, 2);
  assert.equal(coordinator.readLog().length, 0);
});

test("freeze binding participates in both report digests", () => {
  const original = "a".repeat(64);
  const other = "b".repeat(64);
  const delta = appliedDelta(original);
  const report = passingVerification(original);
  assert.equal(codeOf(() => verifyDeltaCatchupReport({ ...delta, freezeReceiptDigest: other })), "freeze_delta_digest_mismatch");
  assert.equal(codeOf(() => verifyTwoSidedVerificationReport({
    ...report, context: { ...report.context, freezeReceiptDigest: other },
  })), "freeze_verification_digest_mismatch");
});

test("the exact snapshot manifest digest is covered by both report digests", () => {
  const freezeDigest = "a".repeat(64);
  const manifest = "b".repeat(64);
  const otherManifest = "c".repeat(64);
  const delta = appliedDelta(freezeDigest, SNAPSHOT, manifest);
  const report = passingVerification(freezeDigest, SNAPSHOT, manifest);
  assert.equal(codeOf(() => verifyDeltaCatchupReport({ ...delta, manifestDigest: otherManifest })), "freeze_delta_digest_mismatch");
  assert.equal(codeOf(() => verifyTwoSidedVerificationReport({
    ...report, context: { ...report.context, manifestDigest: otherManifest },
  })), "freeze_verification_digest_mismatch");
});

test("T3 and R1 stay bound to the recorded snapshot and the current recovery", (t) => {
  const { db, coordinator } = driveToD1(t);
  const foreignSnapshot = "s2s-other-snapshot";
  const otherCoordinator = createFreezeDrainCoordinator(db, { snapshotId: foreignSnapshot });
  const trigger = "post-switch-mismatch";
  assert.equal(codeOf(() => otherCoordinator.enterRecovery({ trigger })), "freeze_recovery_context_mismatch");
  assert.equal(coordinator.readLog().length, 2);

  const first = coordinator.enterRecovery({ trigger }).coordinatorReceipt;
  const reportForFirst = recoveryVerification(trigger, first.toEpoch, first.receiptDigest);
  for (const report of [
    recoveryVerification(trigger, first.toEpoch),
    recoveryVerification(trigger, first.toEpoch, first.receiptDigest, foreignSnapshot),
  ]) {
    assert.equal(codeOf(() => coordinator.resumeToD1({ reverificationReport: report })), "freeze_reverification_context_mismatch");
    assert.deepEqual([coordinator.currentAuthority().phase, coordinator.currentAuthority().epoch], ["RECOVERY", first.toEpoch]);
    assert.equal(coordinator.readLog().length, 3);
  }
  assert.equal(codeOf(() => otherCoordinator.resumeToD1({ reverificationReport: reportForFirst })), "freeze_recovery_context_missing");
  assert.equal(coordinator.resumeToD1({ reverificationReport: reportForFirst }).authority.phase, "D1_ACTIVE");

  const second = coordinator.enterRecovery({ trigger }).coordinatorReceipt;
  const reportWithOldReceipt = recoveryVerification(trigger, second.toEpoch, first.receiptDigest);
  assert.equal(codeOf(() => coordinator.resumeToD1({ reverificationReport: reportWithOldReceipt })), "freeze_reverification_context_mismatch");
  assert.deepEqual([coordinator.currentAuthority().phase, coordinator.currentAuthority().epoch], ["RECOVERY", second.toEpoch]);
  assert.equal(coordinator.readLog().length, 5);

  const reportForSecond = recoveryVerification(trigger, second.toEpoch, second.receiptDigest);
  const resumed = coordinator.resumeToD1({ reverificationReport: reportForSecond });
  assert.equal(resumed.authority.phase, "D1_ACTIVE");
  assert.equal(resumed.coordinatorReceipt.gateRefs.recoveryReceiptDigest, second.receiptDigest);
  assert.deepEqual(verifyCoordinatorLog(db), { valid: true, entries: 6 });
});

test("R1 reverification digest covers the T3 receipt identity", () => {
  const original = recoveryVerification("post-switch-mismatch", 4, "a".repeat(64));
  assert.equal(verifyTwoSidedVerificationReport(original).valid, true);
  assert.equal(codeOf(() => verifyTwoSidedVerificationReport({
    ...original,
    context: { ...original.context, recoveryReceiptDigest: "b".repeat(64) },
  })), "freeze_verification_digest_mismatch");
});
