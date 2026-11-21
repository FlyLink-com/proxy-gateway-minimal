// D1 Card 9 — real Freeze/Drain coordinator (C3-1..C3-7 execution side).
//
// This module is the missing caller the design documents name: it turns
// the four freeze/drain receipts (d1-stage2-freeze-drain.mjs) and the
// durable authority record (single-writer-authority.mjs) into an
// executing state machine. It implements the transition table of
// FREEZE_COORDINATOR_DESIGN.md §1.3 (T1/T2/T3/T5/R1) on a caller-owned
// SQLite handle, gates every transition on positive evidence, and writes
// a hash-chained durable coordinator log. It never touches production,
// never opens a network connection, never reads a real credential, and
// never grants itself an approval: C1 approval, staged-handover
// verification, per-item waivers and rollback triggers are all
// caller-supplied evidence that the coordinator validates and records,
// never fabricates.
//
// State machine (epoch +1 per transition, enforced by the durable
// authority guard in single-writer-authority.mjs — the coordinator
// cannot skip or reuse an epoch even if it tried):
//   T1  BWH_ACTIVE -> FROZEN      (freeze; needs bundle + coverage + drain + receipt)
//   T2  FROZEN -> D1_ACTIVE       (switch; needs delta + verification + C1 + handover)
//   T3  D1_ACTIVE -> RECOVERY     (rollback trigger; one of four triggers)
//   T4  RECOVERY -> BWH_ACTIVE    BLOCKED — intentionally sealed; always refused
//   T5  FROZEN -> BWH_ACTIVE      (unfreeze; epoch goes 2 -> 3, never back to 1)
//   R1  RECOVERY -> D1_ACTIVE     (resume; needs the 15-check verification again)
// Forbidden by construction: BWH_ACTIVE -> D1_ACTIVE (skips FROZEN),
// D1_ACTIVE -> BWH_ACTIVE (skips RECOVERY), FROZEN -> RECOVERY (nothing
// switched yet, so there is nothing to roll back).
//
// The 28-item writer coverage matrix is the 1B inventory baseline:
// U-F1..U-F18 (§15.2) + U-01..U-10 (§12) = 28 items. U-F17 is a roll-up
// of U-01..U-10 and is always derived, never set directly. T1 refuses
// to freeze while any item is open: every item must be fenced, waived
// (with a recorded waiver reference), or out-of-scope (with a recorded
// basis citing the inventory). The coordinator records dispositions; it
// does not fence anything itself and does not grant waivers.
//
// Known limitation, stated plainly: the freeze receipt and the FROZEN
// transition run as two separate immediate transactions. The receipt
// proves quiescence only while its own read lock was held. A write
// landing between the receipt and the transition would not be caught
// here; it is caught later by the T2 verification gate (V-4 scheduler
// still quiet, V-5 HWM matches the freeze receipt), which fails closed
// and leaves the coordinator in FROZEN. The coordinator therefore
// requires drain + scheduler quiescence before the receipt, and never
// treats the receipt as proof that the switch is safe.

import { createHash } from "node:crypto";

import {
  WRITER_PHASES,
  readWriterAuthority,
  transitionWriterAuthority,
} from "./single-writer-authority.mjs";
import {
  UNFENCED_WRITER_BASELINE,
  verifyFreezeReadinessBundle,
} from "./d1-stage2-freeze-drain.mjs";
import { verifyFreezeReceipt } from "./writer-freeze-receipt.mjs";
import { buildFreezeReceipt } from "./writer-freeze-receipt.mjs";

export const FREEZE_DRAIN_COORDINATOR_VERSION = 1;
export const COORDINATOR_RECEIPT_TYPE = "d1_freeze_drain_coordinator_receipt";
export const COORDINATOR_LOG_TABLE = "d1_freeze_drain_coordinator_log";
export const COORDINATOR_LOG_GENESIS_DIGEST = createHash("sha256")
  .update("d1-card9-freeze-drain-coordinator:genesis", "utf8")
  .digest("hex");

// Transition table (FREEZE_COORDINATOR_DESIGN.md §1.3). `gates` names
// the evidence each transition requires; `blocked` transitions are
// refused by this module before the durable guard ever sees them.
export const FREEZE_DRAIN_TRANSITIONS = Object.freeze([
  { id: "T1", from: "BWH_ACTIVE", to: "FROZEN", gates: ["readiness-bundle", "coverage", "drain", "freeze-receipt"] },
  { id: "T2", from: "FROZEN", to: "D1_ACTIVE", gates: ["delta-catchup", "two-sided-verification", "c1-approval", "staged-handover"] },
  { id: "T3", from: "D1_ACTIVE", to: "RECOVERY", gates: ["rollback-trigger"] },
  { id: "T4", from: "RECOVERY", to: "BWH_ACTIVE", gates: ["reverse-reconciliation", "yi-approval"], blocked: true },
  { id: "T5", from: "FROZEN", to: "BWH_ACTIVE", gates: ["unfreeze-receipt"] },
  { id: "R1", from: "RECOVERY", to: "D1_ACTIVE", gates: ["reverification"] },
]);

// Rollback triggers (D1_FAILURE_RECOVERY_MATRIX.md §3; design §8.1).
export const ROLLBACK_TRIGGERS = Object.freeze([
  "final-incremental-reconcile-failed",
  "post-switch-verification-failed",
  "post-switch-mismatch",
  "e4-unavailable",
]);

// Two-sided verification checklist (design §6): U-F18 C-1..C-7 plus
// V-1..V-8. All fifteen must be present and passed before T2 or R1.
export const VERIFICATION_CHECK_IDS = Object.freeze([
  "C-1", "C-2", "C-3", "C-4", "C-5", "C-6", "C-7",
  "V-1", "V-2", "V-3", "V-4", "V-5", "V-6", "V-7", "V-8",
]);

export class FreezeDrainCoordinatorError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = "FreezeDrainCoordinatorError";
    this.code = code;
    if (detail.openIds !== undefined) this.openIds = detail.openIds;
    if (detail.failedIds !== undefined) this.failedIds = detail.failedIds;
    if (detail.from !== undefined) this.from = detail.from;
    if (detail.to !== undefined) this.to = detail.to;
  }
}

export function isFreezeDrainCoordinatorError(error) {
  return error instanceof FreezeDrainCoordinatorError;
}

function coordinatorError(code, message, detail) {
  return new FreezeDrainCoordinatorError(code, message, detail);
}

function sha256Hex(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function assertSnapshotId(snapshotId) {
  if (typeof snapshotId !== "string" || !/^s2s-[a-z0-9-]{3,80}$/.test(snapshotId)) {
    throw coordinatorError("freeze_coordinator_snapshot_invalid", "coordinator requires a synthetic snapshot id (s2s-...)");
  }
  return snapshotId;
}

function assertNonEmptyString(value, field, code) {
  if (typeof value !== "string" || value.length === 0) {
    throw coordinatorError(code, `${field} must be a non-empty string`);
  }
  return value;
}

function assertDbHandle(db) {
  if (!db || typeof db.prepare !== "function" || typeof db.transaction !== "function") {
    throw coordinatorError("freeze_coordinator_db_invalid", "coordinator requires a database handle");
  }
  return db;
}

// ---------------------------------------------------------------------------
// 28-item writer coverage matrix (U-F1..U-F18 + U-01..U-10)
// ---------------------------------------------------------------------------

const BASELINE_BY_ID = new Map(UNFENCED_WRITER_BASELINE.map((entry) => [entry.id, entry]));
const UNTRACED_IDS = Object.freeze(["U-01", "U-02", "U-03", "U-04", "U-05", "U-06", "U-07", "U-08", "U-09", "U-10"]);

// U-F17 is a roll-up of U-01..U-10: it is fenced only when all ten are
// fenced; waived when all ten are closed and at least one is waived;
// out-of-scope when all ten are closed and none is waived; open
// otherwise. It can never be set directly.
function deriveUf17Status(subEntries) {
  if (subEntries.some((entry) => entry.status === "open")) return "open";
  if (subEntries.every((entry) => entry.status === "fenced")) return "fenced";
  if (subEntries.some((entry) => entry.status === "waived")) return "waived";
  return "out-of-scope";
}

function coverageMatrixDigest(entries) {
  return sha256Hex(canonicalJson({
    version: FREEZE_DRAIN_COORDINATOR_VERSION,
    type: "writer-coverage-matrix",
    entries: entries.map((entry) => ({ id: entry.id, status: entry.status, evidence: entry.evidence })),
  }));
}

export function buildWriterCoverageMatrix({ fenced = [], waivers = {}, outOfScope = {} } = {}) {
  if (!Array.isArray(fenced)) {
    throw coordinatorError("freeze_coverage_invalid", "fenced must be an array of baseline ids");
  }
  for (const group of [waivers, outOfScope]) {
    if (!group || typeof group !== "object" || Array.isArray(group)) {
      throw coordinatorError("freeze_coverage_invalid", "waivers and outOfScope must be objects keyed by baseline id");
    }
  }
  const seen = new Map();
  const claim = (id, disposition) => {
    if (!BASELINE_BY_ID.has(id)) {
      throw coordinatorError("freeze_coverage_unknown", `unknown writer coverage id: ${id}`);
    }
    if (id === "U-F17") {
      throw coordinatorError("freeze_coverage_uf17_derived", "U-F17 is derived from U-01..U-10 and cannot be set directly");
    }
    if (seen.has(id)) {
      throw coordinatorError("freeze_coverage_conflict", `writer coverage id ${id} has conflicting dispositions (${seen.get(id)} vs ${disposition})`);
    }
    seen.set(id, disposition);
  };
  for (const id of fenced) claim(id, "fenced");
  for (const [id, ref] of Object.entries(waivers)) {
    claim(id, "waived");
    assertNonEmptyString(ref, `waiver ref for ${id}`, "freeze_coverage_waiver_invalid");
  }
  for (const [id, basis] of Object.entries(outOfScope)) {
    claim(id, "out-of-scope");
    assertNonEmptyString(basis, `out-of-scope basis for ${id}`, "freeze_coverage_basis_invalid");
  }
  const entries = UNFENCED_WRITER_BASELINE.map((baseline) => {
    if (baseline.id === "U-F17") return null; // derived below
    const disposition = seen.get(baseline.id);
    let status = "open";
    let evidence = null;
    if (disposition === "fenced") {
      status = "fenced";
      evidence = { kind: "fenced" };
    } else if (disposition === "waived") {
      status = "waived";
      evidence = { kind: "waiver", ref: waivers[baseline.id] };
    } else if (disposition === "out-of-scope") {
      status = "out-of-scope";
      evidence = { kind: "out-of-scope", basis: outOfScope[baseline.id] };
    }
    return { id: baseline.id, note: baseline.note, status, evidence };
  }).filter(Boolean);
  const subEntries = entries.filter((entry) => UNTRACED_IDS.includes(entry.id));
  const uf17Status = deriveUf17Status(subEntries);
  entries.push({
    id: "U-F17",
    note: BASELINE_BY_ID.get("U-F17").note,
    status: uf17Status,
    evidence: { kind: "derived", from: UNTRACED_IDS, subStatuses: Object.fromEntries(subEntries.map((entry) => [entry.id, entry.status])) },
  });
  // Keep baseline order (U-F1..U-F18, then U-01..U-10).
  entries.sort((a, b) => UNFENCED_WRITER_BASELINE.findIndex((e) => e.id === a.id) - UNFENCED_WRITER_BASELINE.findIndex((e) => e.id === b.id));
  const counts = {
    open: entries.filter((e) => e.status === "open").length,
    fenced: entries.filter((e) => e.status === "fenced").length,
    waived: entries.filter((e) => e.status === "waived").length,
    outOfScope: entries.filter((e) => e.status === "out-of-scope").length,
  };
  const openIds = entries.filter((e) => e.status === "open").map((e) => e.id);
  return {
    schemaVersion: FREEZE_DRAIN_COORDINATOR_VERSION,
    type: "writer-coverage-matrix",
    total: entries.length,
    counts,
    openIds,
    cutoverBlocked: openIds.length > 0,
    entries,
    matrixDigest: coverageMatrixDigest(entries),
  };
}

export function verifyWriterCoverageMatrix(matrix) {
  if (!matrix || typeof matrix !== "object" || Array.isArray(matrix)
    || matrix.type !== "writer-coverage-matrix"
    || matrix.schemaVersion !== FREEZE_DRAIN_COORDINATOR_VERSION
    || !Array.isArray(matrix.entries) || matrix.entries.length !== UNFENCED_WRITER_BASELINE.length
    || typeof matrix.matrixDigest !== "string") {
    throw coordinatorError("freeze_coverage_invalid", "writer coverage matrix is malformed");
  }
  const rebuilt = buildWriterCoverageMatrix({
    fenced: matrix.entries.filter((e) => e.status === "fenced" && e.id !== "U-F17").map((e) => e.id),
    waivers: Object.fromEntries(matrix.entries.filter((e) => e.status === "waived" && e.id !== "U-F17").map((e) => [e.id, e.evidence?.ref ?? ""])),
    outOfScope: Object.fromEntries(matrix.entries.filter((e) => e.status === "out-of-scope" && e.id !== "U-F17").map((e) => [e.id, e.evidence?.basis ?? ""])),
  });
  if (rebuilt.matrixDigest !== matrix.matrixDigest) {
    throw coordinatorError("freeze_coverage_digest_mismatch", "writer coverage matrix digest does not match its entries");
  }
  if (JSON.stringify(rebuilt.openIds) !== JSON.stringify(matrix.openIds)
    || rebuilt.cutoverBlocked !== matrix.cutoverBlocked) {
    throw coordinatorError("freeze_coverage_invalid", "writer coverage matrix gate fields do not match its entries");
  }
  return { valid: true, total: matrix.total, openIds: matrix.openIds, cutoverBlocked: matrix.cutoverBlocked };
}

// ---------------------------------------------------------------------------
// Drain tracker (design §3: drain is complete only when all four hold)
// ---------------------------------------------------------------------------

export function createDrainTracker({ timeoutMs = 60000, now = () => new Date() } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw coordinatorError("freeze_drain_timeout_invalid", "drain timeout must be a positive integer (ms)");
  }
  const startedAtMs = now().getTime();
  const writes = new Map();
  const callbacks = new Map();
  let schedulerQuiesced = false;
  const hwmObservations = [];
  const elapsedMs = () => now().getTime() - startedAtMs;

  function register(map, kind, id) {
    assertNonEmptyString(id, `${kind} id`, "freeze_drain_id_invalid");
    if (map.has(id)) {
      throw coordinatorError("freeze_drain_duplicate", `${kind} already registered in this drain: ${id}`);
    }
    map.set(id, { settled: false });
  }

  function settle(map, kind, id) {
    if (!map.has(id)) {
      throw coordinatorError("freeze_drain_unknown", `cannot settle unregistered ${kind}: ${id}`);
    }
    map.get(id).settled = true;
  }

  function pendingIds(map) {
    return [...map.entries()].filter(([, v]) => !v.settled).map(([id]) => id);
  }

  function status() {
    const inflightWrites = pendingIds(writes);
    const inflightCallbacks = pendingIds(callbacks);
    const hwmStable = hwmObservations.length >= 2
      && hwmObservations[hwmObservations.length - 1] === hwmObservations[hwmObservations.length - 2];
    const timedOut = elapsedMs() > timeoutMs;
    const drained = inflightWrites.length === 0 && inflightCallbacks.length === 0
      && schedulerQuiesced && hwmStable;
    return {
      inflightWrites, inflightCallbacks,
      schedulerQuiesced, hwmObservations: hwmObservations.length, hwmStable,
      elapsedMs: elapsedMs(), timeoutMs, timedOut, drained,
    };
  }

  return {
    registerWrite(id, kind = "transaction") {
      register(writes, `write (${kind})`, id);
      return status();
    },
    registerCallback(id) {
      register(callbacks, "callback", id);
      return status();
    },
    settleWrite(id) {
      settle(writes, "write", id);
      return status();
    },
    settleCallback(id) {
      settle(callbacks, "callback", id);
      return status();
    },
    markSchedulerQuiesced() {
      schedulerQuiesced = true;
      return status();
    },
    recordHwmObservation(observation) {
      if (!observation || typeof observation !== "object" || Array.isArray(observation)) {
        throw coordinatorError("freeze_drain_hwm_invalid", "HWM observation must be an object (row counts / max updated_at)");
      }
      hwmObservations.push(canonicalJson(observation));
      return status();
    },
    status,
    assertDrained() {
      const current = status();
      if (current.drained) return current;
      const detail = {
        inflightWrites: current.inflightWrites,
        inflightCallbacks: current.inflightCallbacks,
        schedulerQuiesced: current.schedulerQuiesced,
        hwmStable: current.hwmStable,
      };
      if (current.timedOut) {
        throw coordinatorError("freeze_drain_timeout", `drain timed out after ${current.elapsedMs} ms (limit ${timeoutMs} ms) with work still in flight`, detail);
      }
      throw coordinatorError("freeze_drain_pending", "drain is not complete", detail);
    },
  };
}

// ---------------------------------------------------------------------------
// Delta catch-up report (design §5) and two-sided verification (design §6)
// ---------------------------------------------------------------------------

function reportDigest(type, snapshotId, payload) {
  return sha256Hex(canonicalJson({ version: FREEZE_DRAIN_COORDINATOR_VERSION, type, snapshotId, payload }));
}

export function buildDeltaCatchupReport({ snapshotId, items = [], confirmedEmpty = false, now = () => new Date() } = {}) {
  assertSnapshotId(snapshotId);
  if (!Array.isArray(items)) {
    throw coordinatorError("freeze_delta_invalid", "delta catch-up report requires an items array");
  }
  if (items.length === 0 && confirmedEmpty !== true) {
    throw coordinatorError("freeze_delta_empty_unconfirmed", "an empty delta is not a default conclusion: run the enumeration and confirm it, or list the deltas");
  }
  if (items.length > 0 && confirmedEmpty === true) {
    throw coordinatorError("freeze_delta_invalid", "delta report cannot list items and claim confirmed-empty at the same time");
  }
  const seen = new Set();
  const normalized = items.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw coordinatorError("freeze_delta_invalid", `delta item ${index} must be an object`);
    }
    assertNonEmptyString(item.table, `delta item ${index} table`, "freeze_delta_invalid");
    assertNonEmptyString(item.pk, `delta item ${index} pk`, "freeze_delta_invalid");
    if (item.disposition !== "applied" && item.disposition !== "confirmed-none") {
      throw coordinatorError("freeze_delta_undispositioned", `delta item ${index} (${item.table}:${item.pk}) has no disposition (applied / confirmed-none)`);
    }
    const key = `${item.table}:${item.pk}`;
    if (seen.has(key)) {
      throw coordinatorError("freeze_delta_duplicate", `duplicate delta item: ${key}`);
    }
    seen.add(key);
    return { table: item.table, pk: item.pk, disposition: item.disposition };
  });
  return {
    type: "delta-catchup-report",
    schemaVersion: FREEZE_DRAIN_COORDINATOR_VERSION,
    snapshotId,
    items: normalized,
    confirmedEmpty,
    allDispositioned: true,
    timestamp: now().toISOString(),
    reportDigest: reportDigest("delta-catchup-report", snapshotId, { items: normalized, confirmedEmpty }),
  };
}

export function verifyDeltaCatchupReport(report) {
  if (!report || typeof report !== "object" || Array.isArray(report)
    || report.type !== "delta-catchup-report"
    || report.schemaVersion !== FREEZE_DRAIN_COORDINATOR_VERSION
    || typeof report.reportDigest !== "string") {
    throw coordinatorError("freeze_delta_invalid", "delta catch-up report is malformed");
  }
  assertSnapshotId(report.snapshotId);
  const expected = reportDigest("delta-catchup-report", report.snapshotId, { items: report.items, confirmedEmpty: report.confirmedEmpty });
  if (expected !== report.reportDigest) {
    throw coordinatorError("freeze_delta_digest_mismatch", "delta catch-up report digest does not match its contents");
  }
  return { valid: true };
}

export function buildTwoSidedVerificationReport({ snapshotId, checks = {}, now = () => new Date() } = {}) {
  assertSnapshotId(snapshotId);
  if (!checks || typeof checks !== "object" || Array.isArray(checks)) {
    throw coordinatorError("freeze_verification_invalid", "two-sided verification requires a checks object");
  }
  const missing = VERIFICATION_CHECK_IDS.filter((id) => checks[id] === undefined);
  if (missing.length > 0) {
    throw coordinatorError("freeze_verification_incomplete", `two-sided verification is missing checks: ${missing.join(", ")}`, { failedIds: missing });
  }
  const normalized = {};
  for (const id of VERIFICATION_CHECK_IDS) {
    const check = checks[id];
    if (!check || typeof check !== "object" || typeof check.passed !== "boolean") {
      throw coordinatorError("freeze_verification_invalid", `verification check ${id} must be an object with a boolean passed field`);
    }
    normalized[id] = { passed: check.passed, detail: typeof check.detail === "string" ? check.detail : "" };
  }
  const failedIds = VERIFICATION_CHECK_IDS.filter((id) => !normalized[id].passed);
  return {
    type: "two-sided-verification-report",
    schemaVersion: FREEZE_DRAIN_COORDINATOR_VERSION,
    snapshotId,
    checks: normalized,
    verdict: failedIds.length === 0 ? "pass" : "fail",
    failedIds,
    timestamp: now().toISOString(),
    reportDigest: reportDigest("two-sided-verification-report", snapshotId, { checks: normalized }),
  };
}

export function verifyTwoSidedVerificationReport(report) {
  if (!report || typeof report !== "object" || Array.isArray(report)
    || report.type !== "two-sided-verification-report"
    || report.schemaVersion !== FREEZE_DRAIN_COORDINATOR_VERSION
    || typeof report.reportDigest !== "string") {
    throw coordinatorError("freeze_verification_invalid", "two-sided verification report is malformed");
  }
  assertSnapshotId(report.snapshotId);
  const expected = reportDigest("two-sided-verification-report", report.snapshotId, { checks: report.checks });
  if (expected !== report.reportDigest) {
    throw coordinatorError("freeze_verification_digest_mismatch", "two-sided verification report digest does not match its contents");
  }
  return { valid: true, verdict: report.verdict, failedIds: report.failedIds };
}

// ---------------------------------------------------------------------------
// Durable coordinator log (hash-chained transition receipts)
// ---------------------------------------------------------------------------

export function ensureCoordinatorLog(db) {
  assertDbHandle(db);
  db.exec(`create table if not exists ${COORDINATOR_LOG_TABLE} (
    seq integer primary key,
    transition_id text not null,
    from_phase text not null,
    to_phase text not null,
    from_epoch integer not null,
    to_epoch integer not null,
    snapshot_id text not null,
    receipt_ref text not null,
    gate_refs text not null,
    created_at text not null,
    previous_digest text not null,
    receipt_digest text not null
  )`);
  return true;
}

export function readCoordinatorLog(db) {
  assertDbHandle(db);
  ensureCoordinatorLog(db);
  return db.prepare(`select * from ${COORDINATOR_LOG_TABLE} order by seq asc`).all().map((row) => ({
    seq: row.seq,
    transitionId: row.transition_id,
    from: row.from_phase,
    to: row.to_phase,
    fromEpoch: row.from_epoch,
    toEpoch: row.to_epoch,
    snapshotId: row.snapshot_id,
    receiptRef: row.receipt_ref,
    gateRefs: JSON.parse(row.gate_refs),
    createdAt: row.created_at,
    previousDigest: row.previous_digest,
    receiptDigest: row.receipt_digest,
  }));
}

function coordinatorReceiptDigest({ seq, transitionId, from, to, fromEpoch, toEpoch, snapshotId, receiptRef, gateRefs, createdAt, previousDigest }) {
  return sha256Hex(canonicalJson({
    version: FREEZE_DRAIN_COORDINATOR_VERSION,
    type: COORDINATOR_RECEIPT_TYPE,
    seq, transitionId, from, to, fromEpoch, toEpoch, snapshotId, receiptRef, gateRefs, createdAt, previousDigest,
  }));
}

export function issueCoordinatorReceipt(db, { transitionId, from, to, fromEpoch, toEpoch, snapshotId, receiptRef, gateRefs = {}, now = () => new Date() } = {}) {
  assertDbHandle(db);
  assertSnapshotId(snapshotId);
  assertNonEmptyString(transitionId, "transition id", "freeze_coordinator_receipt_invalid");
  assertNonEmptyString(receiptRef, "receipt ref", "freeze_coordinator_receipt_invalid");
  ensureCoordinatorLog(db);
  const existing = readCoordinatorLog(db);
  const seq = existing.length === 0 ? 1 : existing[existing.length - 1].seq + 1;
  const previousDigest = existing.length === 0 ? COORDINATOR_LOG_GENESIS_DIGEST : existing[existing.length - 1].receiptDigest;
  const createdAt = now().toISOString();
  const receiptDigest = coordinatorReceiptDigest({ seq, transitionId, from, to, fromEpoch, toEpoch, snapshotId, receiptRef, gateRefs, createdAt, previousDigest });
  db.prepare(`insert into ${COORDINATOR_LOG_TABLE}
    (seq, transition_id, from_phase, to_phase, from_epoch, to_epoch, snapshot_id, receipt_ref, gate_refs, created_at, previous_digest, receipt_digest)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    seq, transitionId, from, to, fromEpoch, toEpoch, snapshotId, receiptRef, JSON.stringify(gateRefs), createdAt, previousDigest, receiptDigest,
  );
  return {
    type: COORDINATOR_RECEIPT_TYPE,
    schemaVersion: FREEZE_DRAIN_COORDINATOR_VERSION,
    seq, transitionId, from, to, fromEpoch, toEpoch, snapshotId, receiptRef, gateRefs, createdAt, previousDigest, receiptDigest,
  };
}

export function verifyCoordinatorLog(db) {
  const entries = readCoordinatorLog(db);
  let previousDigest = COORDINATOR_LOG_GENESIS_DIGEST;
  for (const entry of entries) {
    if (entry.previousDigest !== previousDigest) {
      throw coordinatorError("freeze_coordinator_log_broken", `coordinator log chain is broken at seq ${entry.seq}`);
    }
    const expected = coordinatorReceiptDigest({
      seq: entry.seq, transitionId: entry.transitionId, from: entry.from, to: entry.to,
      fromEpoch: entry.fromEpoch, toEpoch: entry.toEpoch, snapshotId: entry.snapshotId,
      receiptRef: entry.receiptRef, gateRefs: entry.gateRefs, createdAt: entry.createdAt,
      previousDigest: entry.previousDigest,
    });
    if (expected !== entry.receiptDigest) {
      throw coordinatorError("freeze_coordinator_log_broken", `coordinator log receipt digest mismatch at seq ${entry.seq}`);
    }
    previousDigest = entry.receiptDigest;
  }
  return { valid: true, entries: entries.length };
}

export function verifyCoordinatorReceipt(db, receipt) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)
    || receipt.type !== COORDINATOR_RECEIPT_TYPE
    || receipt.schemaVersion !== FREEZE_DRAIN_COORDINATOR_VERSION
    || !Number.isInteger(receipt.seq) || receipt.seq < 1
    || typeof receipt.receiptDigest !== "string") {
    throw coordinatorError("freeze_coordinator_receipt_invalid", "coordinator receipt is malformed");
  }
  const entries = readCoordinatorLog(db);
  const stored = entries.find((entry) => entry.seq === receipt.seq);
  if (!stored) {
    throw coordinatorError("freeze_coordinator_receipt_invalid", `no coordinator log entry at seq ${receipt.seq}`);
  }
  for (const key of ["transitionId", "from", "to", "fromEpoch", "toEpoch", "snapshotId", "receiptRef", "createdAt", "previousDigest", "receiptDigest"]) {
    if (JSON.stringify(stored[key]) !== JSON.stringify(receipt[key])) {
      throw coordinatorError("freeze_coordinator_receipt_invalid", `coordinator receipt field ${key} does not match the durable log`);
    }
  }
  if (JSON.stringify(stored.gateRefs) !== JSON.stringify(receipt.gateRefs)) {
    throw coordinatorError("freeze_coordinator_receipt_invalid", "coordinator receipt gate refs do not match the durable log");
  }
  verifyCoordinatorLog(db);
  return { valid: true, seq: receipt.seq };
}

// ---------------------------------------------------------------------------
// Coordinator
// ---------------------------------------------------------------------------

export function createFreezeDrainCoordinator(db, { snapshotId, now = () => new Date() } = {}) {
  assertDbHandle(db);
  assertSnapshotId(snapshotId);
  ensureCoordinatorLog(db);

  function currentAuthority() {
    const current = readWriterAuthority(db);
    if (!current) {
      throw coordinatorError("freeze_coordinator_no_authority", "writer authority record is missing; the coordinator never installs one");
    }
    return current;
  }

  function requirePhase(expected, action) {
    const current = currentAuthority();
    if (current.phase !== expected) {
      throw coordinatorError("freeze_coordinator_wrong_state", `${action} requires phase ${expected}, current phase is ${current.phase} (epoch ${current.epoch})`, { from: current.phase, to: expected });
    }
    return current;
  }

  function transitionReceiptRef(transitionId, gateRefs) {
    return sha256Hex(canonicalJson({ version: FREEZE_DRAIN_COORDINATOR_VERSION, transition: transitionId, snapshotId, gateRefs }));
  }

  return {
    snapshotId,
    currentAuthority,

    freeze({ readinessBundle, coverageMatrix, drainTracker, checkpointId, outstandingJobs = [] } = {}) {
      const current = requirePhase(WRITER_PHASES.BWH_ACTIVE, "freeze (T1)");
      verifyFreezeReadinessBundle(readinessBundle);
      verifyWriterCoverageMatrix(coverageMatrix);
      if (coverageMatrix.cutoverBlocked) {
        throw coordinatorError("freeze_coverage_open", `cannot freeze: ${coverageMatrix.openIds.length} writer coverage items still open: ${coverageMatrix.openIds.join(", ")}`, { openIds: coverageMatrix.openIds });
      }
      if (!drainTracker || typeof drainTracker.assertDrained !== "function") {
        throw coordinatorError("freeze_coordinator_drain_missing", "freeze (T1) requires a drain tracker");
      }
      const drainStatus = drainTracker.assertDrained();
      assertNonEmptyString(checkpointId, "checkpoint id", "freeze_coordinator_checkpoint_invalid");
      const freezeReceipt = buildFreezeReceipt(db, { snapshotId, checkpointId, outstandingJobs });
      verifyFreezeReceipt(freezeReceipt);
      const gateRefs = {
        bundleHash: readinessBundle.bundleHash,
        coverageDigest: coverageMatrix.matrixDigest,
        freezeReceiptDigest: freezeReceipt.receiptDigest,
        drain: { inflightWrites: drainStatus.inflightWrites, inflightCallbacks: drainStatus.inflightCallbacks, hwmStable: drainStatus.hwmStable },
      };
      const receiptRef = transitionReceiptRef("T1", gateRefs);
      const next = transitionWriterAuthority(db, { to: WRITER_PHASES.FROZEN, expectedEpoch: current.epoch, receiptRef, now });
      const coordinatorReceipt = issueCoordinatorReceipt(db, {
        transitionId: "T1", from: current.phase, to: next.phase,
        fromEpoch: current.epoch, toEpoch: next.epoch, snapshotId, receiptRef, gateRefs, now,
      });
      return { transitionId: "T1", authority: next, freezeReceipt, coordinatorReceipt };
    },

    switchToD1({ deltaReport, verificationReport, c1ApprovalRef, handover = {} } = {}) {
      const current = requirePhase(WRITER_PHASES.FROZEN, "switch to D1 (T2)");
      verifyDeltaCatchupReport(deltaReport);
      verifyTwoSidedVerificationReport(verificationReport);
      if (verificationReport.verdict !== "pass") {
        throw coordinatorError("freeze_verification_failed", `two-sided verification failed: ${verificationReport.failedIds.join(", ")}; staying in FROZEN`, { failedIds: verificationReport.failedIds });
      }
      assertNonEmptyString(c1ApprovalRef, "C1 approval ref", "freeze_c1_approval_missing");
      assertNonEmptyString(handover.verifiedBy, "staged handover verifiedBy", "freeze_handover_unverified");
      assertNonEmptyString(handover.receiptRef, "staged handover receiptRef", "freeze_handover_unverified");
      if (typeof handover.verifiedAt !== "string" || Number.isNaN(Date.parse(handover.verifiedAt))) {
        throw coordinatorError("freeze_handover_unverified", "staged handover requires a verifiedAt ISO timestamp");
      }
      const gateRefs = {
        deltaDigest: deltaReport.reportDigest,
        verificationDigest: verificationReport.reportDigest,
        c1ApprovalRef,
        handover: { verifiedBy: handover.verifiedBy, verifiedAt: handover.verifiedAt, receiptRef: handover.receiptRef },
      };
      const receiptRef = transitionReceiptRef("T2", gateRefs);
      const next = transitionWriterAuthority(db, { to: WRITER_PHASES.D1_ACTIVE, expectedEpoch: current.epoch, receiptRef, now });
      const coordinatorReceipt = issueCoordinatorReceipt(db, {
        transitionId: "T2", from: current.phase, to: next.phase,
        fromEpoch: current.epoch, toEpoch: next.epoch, snapshotId, receiptRef, gateRefs, now,
      });
      return { transitionId: "T2", authority: next, coordinatorReceipt };
    },

    enterRecovery({ trigger, detail = "" } = {}) {
      const current = requirePhase(WRITER_PHASES.D1_ACTIVE, "enter recovery (T3)");
      if (!ROLLBACK_TRIGGERS.includes(trigger)) {
        throw coordinatorError("freeze_rollback_trigger_invalid", `unknown rollback trigger: ${String(trigger)} (expected one of ${ROLLBACK_TRIGGERS.join(", ")})`);
      }
      const gateRefs = { trigger, detail };
      const receiptRef = transitionReceiptRef("T3", gateRefs);
      const next = transitionWriterAuthority(db, { to: WRITER_PHASES.RECOVERY, expectedEpoch: current.epoch, receiptRef, now });
      const coordinatorReceipt = issueCoordinatorReceipt(db, {
        transitionId: "T3", from: current.phase, to: next.phase,
        fromEpoch: current.epoch, toEpoch: next.epoch, snapshotId, receiptRef, gateRefs, now,
      });
      return { transitionId: "T3", authority: next, coordinatorReceipt };
    },

    unfreeze({ reason, voidedFreezeReceiptRef } = {}) {
      const current = requirePhase(WRITER_PHASES.FROZEN, "unfreeze (T5)");
      assertNonEmptyString(reason, "unfreeze reason", "freeze_unfreeze_reason_missing");
      assertNonEmptyString(voidedFreezeReceiptRef, "voided freeze receipt ref", "freeze_unfreeze_receipt_missing");
      const gateRefs = { reason, voidedFreezeReceiptRef };
      const receiptRef = transitionReceiptRef("T5", gateRefs);
      const next = transitionWriterAuthority(db, { to: WRITER_PHASES.BWH_ACTIVE, expectedEpoch: current.epoch, receiptRef, now });
      const coordinatorReceipt = issueCoordinatorReceipt(db, {
        transitionId: "T5", from: current.phase, to: next.phase,
        fromEpoch: current.epoch, toEpoch: next.epoch, snapshotId, receiptRef, gateRefs, now,
      });
      return {
        transitionId: "T5",
        authority: next,
        coordinatorReceipt,
        // The durable guard enforces epoch +1, so unfreeze lands on
        // epoch 3, never back on epoch 1 (design §1.3 T5 "未核实" —
        // answered by the guard: NEW.epoch must equal OLD.epoch + 1).
        epochNote: `epoch incremented by exactly one (${current.epoch} -> ${next.epoch}); the durable guard forbids returning to epoch 1`,
      };
    },

    resumeToD1({ reverificationReport } = {}) {
      const current = requirePhase(WRITER_PHASES.RECOVERY, "resume to D1 (R1)");
      verifyTwoSidedVerificationReport(reverificationReport);
      if (reverificationReport.verdict !== "pass") {
        throw coordinatorError("freeze_verification_failed", `reverification failed: ${reverificationReport.failedIds.join(", ")}; staying in RECOVERY`, { failedIds: reverificationReport.failedIds });
      }
      const gateRefs = { reverificationDigest: reverificationReport.reportDigest };
      const receiptRef = transitionReceiptRef("R1", gateRefs);
      const next = transitionWriterAuthority(db, { to: WRITER_PHASES.D1_ACTIVE, expectedEpoch: current.epoch, receiptRef, now });
      const coordinatorReceipt = issueCoordinatorReceipt(db, {
        transitionId: "R1", from: current.phase, to: next.phase,
        fromEpoch: current.epoch, toEpoch: next.epoch, snapshotId, receiptRef, gateRefs, now,
      });
      return { transitionId: "R1", authority: next, coordinatorReceipt };
    },

    // T4 is intentionally sealed: RECOVERY -> BWH_ACTIVE is blocked
    // until reverse reconciliation is implemented and verified. This
    // method always refuses, from any state, so no caller can mistake
    // it for a working path.
    returnToBwh() {
      const current = readWriterAuthority(db);
      throw coordinatorError(
        "freeze_return_blocked",
        `RECOVERY -> BWH_ACTIVE (T4) is intentionally sealed until reverse reconciliation is proven and Yi approves separately; current phase is ${current?.phase ?? "unknown"}`,
        { from: current?.phase, to: "BWH_ACTIVE" },
      );
    },

    readLog() {
      return readCoordinatorLog(db);
    },

    verifyLog() {
      return verifyCoordinatorLog(db);
    },
  };
}
