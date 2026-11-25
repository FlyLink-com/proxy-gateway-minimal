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
// The phase transition and the coordinator-log entry for that same
// transition ARE one atomic transaction (see transitionWithReceipt):
// if the log write fails, the phase does not move.
// Known limitation, also stated plainly (F6): a C1 approval ref and a
// staged-handover ref are caller-supplied evidence strings. The
// coordinator checks only that they are present and well-formed and
// records them verbatim in the coordinator log, so a real approval can
// be audited against its own record afterwards; it cannot tell a real
// approval ref from a fabricated string by itself.

import { createHash } from "node:crypto";

import {
  WRITER_PHASES,
  readWriterAuthority,
  transitionWriterAuthority,
} from "./single-writer-authority.mjs";
import {
  SCHEDULER_JOBS,
  UNFENCED_WRITER_BASELINE,
  verifyFreezeReadinessBundle,
} from "./d1-stage2-freeze-drain.mjs";
import { verifyFreezeReceipt, buildFreezeReceipt } from "./writer-freeze-receipt.mjs";

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
  const counts = {
    open: entries.filter((e) => e.status === "open").length,
    fenced: entries.filter((e) => e.status === "fenced").length,
    waived: entries.filter((e) => e.status === "waived").length,
    outOfScope: entries.filter((e) => e.status === "out-of-scope").length,
  };
  return sha256Hex(canonicalJson({
    version: FREEZE_DRAIN_COORDINATOR_VERSION,
    type: "writer-coverage-matrix",
    total: entries.length,
    counts,
    entries: entries.map((entry) => ({ id: entry.id, status: entry.status, evidence: entry.evidence })),
  }));
}

function normalizeFencedInput(fenced) {
  // U (PR #906 r4662139139): a fenced claim is evidence, not a bare
  // flag — every fenced id needs a non-empty evidence ref, exactly
  // like waivers need a ref and out-of-scope needs a basis. A bare
  // id string carries no evidence and is refused, never defaulted.
  const refs = new Map();
  const add = (id, ref) => {
    if (typeof id !== "string" || id.length === 0) {
      throw coordinatorError("freeze_coverage_fence_evidence_invalid", "fenced entries require a baseline id");
    }
    if (refs.has(id)) {
      throw coordinatorError("freeze_coverage_conflict", `writer coverage id ${id} has conflicting dispositions (fenced vs fenced)`);
    }
    assertNonEmptyString(ref, `fence evidence ref for ${id}`, "freeze_coverage_fence_evidence_invalid");
    refs.set(id, ref);
  };
  if (Array.isArray(fenced)) {
    for (const entry of fenced) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry) || typeof entry.id !== "string") {
        throw coordinatorError("freeze_coverage_fence_evidence_invalid", "fenced entries must be {id, ref} objects: a bare id carries no fence evidence");
      }
      add(entry.id, entry.ref);
    }
    return refs;
  }
  if (fenced && typeof fenced === "object") {
    for (const [id, ref] of Object.entries(fenced)) add(id, ref);
    return refs;
  }
  throw coordinatorError("freeze_coverage_fence_evidence_invalid", "fenced must be an object mapping baseline id to a fence evidence ref, or an array of {id, ref}");
}

export function buildWriterCoverageMatrix({ fenced = {}, waivers = {}, outOfScope = {} } = {}) {
  const fencedRefs = normalizeFencedInput(fenced);
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
  for (const [id, ref] of fencedRefs) claim(id, "fenced");
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
      evidence = { kind: "fenced", ref: fencedRefs.get(baseline.id) };
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
    fenced: Object.fromEntries(matrix.entries.filter((e) => e.status === "fenced" && e.id !== "U-F17").map((e) => [e.id, e.evidence?.ref ?? ""])),
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
  if (rebuilt.total !== matrix.total
    || JSON.stringify(rebuilt.counts) !== JSON.stringify(matrix.counts)) {
    throw coordinatorError("freeze_coverage_invalid", "writer coverage matrix counts do not match its entries");
  }
  return { valid: true, total: matrix.total, openIds: matrix.openIds, cutoverBlocked: matrix.cutoverBlocked };
}

// ---------------------------------------------------------------------------
// Drain tracker (design §3: drain is complete only when all four hold)
// ---------------------------------------------------------------------------

// Default drain timeout is 10 minutes, matching R1 §2.4 / DET-01 §1.6.
// Callers may still pass an explicit shorter timeout for tests.
export function createDrainTracker({ timeoutMs = 600000, now = () => new Date() } = {}) {
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
  // Re-validate the build-time shape / disposition invariants, not
  // just digest consistency (PR #906 r4662139130): a caller that
  // recomputes the digest over a non-conforming report must still be
  // refused. The builder's rules, re-run here over the normalized
  // items: exact top-level shape, an items array of {table, pk,
  // disposition} with disposition applied / confirmed-none, no
  // duplicate table:pk, empty items only with confirmedEmpty true,
  // non-empty items only with confirmedEmpty false, and
  // allDispositioned true.
  const expectedKeys = ["type", "schemaVersion", "snapshotId", "items", "confirmedEmpty", "allDispositioned", "timestamp", "reportDigest"];
  const extraKeys = Object.keys(report).filter((key) => !expectedKeys.includes(key));
  if (extraKeys.length > 0) {
    throw coordinatorError("freeze_delta_invalid", `delta catch-up report carries unknown fields: ${extraKeys.join(", ")}`);
  }
  if (!Array.isArray(report.items)) {
    throw coordinatorError("freeze_delta_invalid", "delta catch-up report requires an items array");
  }
  if (typeof report.confirmedEmpty !== "boolean") {
    throw coordinatorError("freeze_delta_invalid", "delta catch-up report requires a boolean confirmedEmpty");
  }
  if (report.allDispositioned !== true) {
    throw coordinatorError("freeze_delta_invalid", "delta catch-up report requires allDispositioned true");
  }
  if (typeof report.timestamp !== "string" || Number.isNaN(Date.parse(report.timestamp))) {
    throw coordinatorError("freeze_delta_invalid", "delta catch-up report requires an ISO timestamp");
  }
  if (report.items.length === 0 && report.confirmedEmpty !== true) {
    throw coordinatorError("freeze_delta_empty_unconfirmed", "an empty delta is not a default conclusion: run the enumeration and confirm it, or list the deltas");
  }
  if (report.items.length > 0 && report.confirmedEmpty === true) {
    throw coordinatorError("freeze_delta_invalid", "delta report cannot list items and claim confirmed-empty at the same time");
  }
  const seen = new Set();
  const normalized = report.items.map((item, index) => {
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
  const expected = reportDigest("delta-catchup-report", report.snapshotId, { items: normalized, confirmedEmpty: report.confirmedEmpty });
  if (expected !== report.reportDigest) {
    throw coordinatorError("freeze_delta_digest_mismatch", "delta catch-up report digest does not match its contents");
  }
  return { valid: true };
}

// Recompute the verdict from the checks themselves. The verdict and
// failedIds a caller claims are never trusted: verify() recomputes
// them here and rejects any report whose claimed values differ, even
// if its digest was recomputed over the tampered values (C1 / F1).
function deriveVerificationVerdict(checks) {
  const failedIds = VERIFICATION_CHECK_IDS.filter((id) => !checks[id] || checks[id].passed !== true);
  return { verdict: failedIds.length === 0 ? "pass" : "fail", failedIds };
}

export function buildTwoSidedVerificationReport({ snapshotId, checks = {}, context = null, now = () => new Date() } = {}) {
  assertSnapshotId(snapshotId);
  if (!checks || typeof checks !== "object" || Array.isArray(checks)) {
    throw coordinatorError("freeze_verification_invalid", "two-sided verification requires a checks object");
  }
  // V: an optional recovery context binds the report to one specific
  // recovery (R1). When present it must name the recovery-resume
  // purpose, the RECOVERY epoch, and the rollback trigger that
  // entered it — and it is covered by the report digest, so it cannot
  // be rewritten afterwards. A report without a context is a plain
  // switch-time (T2) report and can never satisfy resumeToD1.
  const normalizedContext = normalizeVerificationContext(context);
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
  const verdict = failedIds.length === 0 ? "pass" : "fail";
  return {
    type: "two-sided-verification-report",
    schemaVersion: FREEZE_DRAIN_COORDINATOR_VERSION,
    snapshotId,
    checks: normalized,
    verdict,
    failedIds,
    context: normalizedContext,
    timestamp: now().toISOString(),
    reportDigest: reportDigest("two-sided-verification-report", snapshotId, { checks: normalized, verdict, failedIds, context: normalizedContext }),
  };
}

function normalizeVerificationContext(context) {
  if (context === null || context === undefined) return null;
  if (typeof context !== "object" || Array.isArray(context) || context.kind !== "recovery-resume") {
    throw coordinatorError("freeze_verification_invalid", "verification context must be null or {kind: \"recovery-resume\", epoch, trigger}");
  }
  if (!Number.isInteger(context.epoch) || context.epoch < 1) {
    throw coordinatorError("freeze_verification_invalid", "recovery verification context requires a positive integer epoch");
  }
  if (!ROLLBACK_TRIGGERS.includes(context.trigger)) {
    throw coordinatorError("freeze_verification_invalid", `recovery verification context requires a known rollback trigger (expected one of ${ROLLBACK_TRIGGERS.join(", ")})`);
  }
  return { kind: "recovery-resume", epoch: context.epoch, trigger: context.trigger };
}

export function verifyTwoSidedVerificationReport(report) {
  if (!report || typeof report !== "object" || Array.isArray(report)
    || report.type !== "two-sided-verification-report"
    || report.schemaVersion !== FREEZE_DRAIN_COORDINATOR_VERSION
    || typeof report.reportDigest !== "string") {
    throw coordinatorError("freeze_verification_invalid", "two-sided verification report is malformed");
  }
  assertSnapshotId(report.snapshotId);
  if (!report.checks || typeof report.checks !== "object" || Array.isArray(report.checks)
    || VERIFICATION_CHECK_IDS.some((id) => !report.checks[id] || typeof report.checks[id].passed !== "boolean")) {
    throw coordinatorError("freeze_verification_invalid", "two-sided verification report checks are malformed");
  }
  if ((report.verdict !== "pass" && report.verdict !== "fail") || !Array.isArray(report.failedIds)) {
    throw coordinatorError("freeze_verification_invalid", "two-sided verification report verdict / failedIds are malformed");
  }
  // The context is part of the verified shape: a report that never
  // carried one verifies with context null, and a context that does
  // not match the recovery-resume shape is refused even if its digest
  // was recomputed over it.
  const normalizedContext = normalizeVerificationContext(report.context ?? null);
  const recomputed = deriveVerificationVerdict(report.checks);
  if (recomputed.verdict !== report.verdict || JSON.stringify(recomputed.failedIds) !== JSON.stringify(report.failedIds)) {
    throw coordinatorError("freeze_verification_verdict_mismatch", "two-sided verification report verdict / failedIds do not match its checks");
  }
  const expected = reportDigest("two-sided-verification-report", report.snapshotId, { checks: report.checks, verdict: recomputed.verdict, failedIds: recomputed.failedIds, context: normalizedContext });
  if (expected !== report.reportDigest) {
    throw coordinatorError("freeze_verification_digest_mismatch", "two-sided verification report digest does not match its contents");
  }
  return { valid: true, verdict: recomputed.verdict, failedIds: recomputed.failedIds, context: normalizedContext };
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

// Read-only: this never creates the coordinator log table. A caller
// that only reads (verifyLog / verifyCoordinatorReceipt / readLog on a
// fresh database) must not mutate the schema (F4). Writers call
// ensureCoordinatorLog explicitly (coordinator construction and
// issueCoordinatorReceipt).
export function readCoordinatorLog(db) {
  assertDbHandle(db);
  const exists = db.prepare("select name from main.sqlite_schema where type = 'table' and name = ?").get(COORDINATOR_LOG_TABLE);
  if (!exists) return [];
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
// Snapshot-gate log + manifest (U-F10 D-2/D-3).
//
// The snapshot-gate script opens the live database file directly, so no
// store fence can cover it. The coordinator therefore gates it in two
// places: it issues a written run instruction only after the freeze
// (G1) and drain (G2) gates hold, and T2 refuses to switch until the
// snapshot manifest produced under that instruction is bound to the
// freeze receipt (D-3). Every issue / refusal / binding / void is an
// append-only, hash-chained log entry in d1_snapshot_gate_log, in the
// same style as the coordinator transition log. The log never runs a
// snapshot and never touches a database file: it only records the
// instruction, the binding, and the refusal.
// ---------------------------------------------------------------------------

export const SNAPSHOT_GATE_LOG_TABLE = "d1_snapshot_gate_log";
export const SNAPSHOT_GATE_LOG_GENESIS_DIGEST = createHash("sha256")
  .update("d1-card9-snapshot-gate-log:genesis", "utf8")
  .digest("hex");
export const SNAPSHOT_GATE_LOG_KINDS = Object.freeze(["instruction", "refusal", "binding", "void"]);
export const SNAPSHOT_GATE_MANIFEST_TYPE = "snapshot-gate-manifest";

function snapshotGateLogDigest({ seq, kind, snapshotId, checkpointId, freezeReceiptDigest, gateRefs, operatorRef, windowStart, windowEnd, createdAt, previousDigest }) {
  return sha256Hex(canonicalJson({
    version: FREEZE_DRAIN_COORDINATOR_VERSION,
    type: "snapshot-gate-log-entry",
    seq, kind, snapshotId, checkpointId, freezeReceiptDigest, gateRefs, operatorRef, windowStart, windowEnd, createdAt, previousDigest,
  }));
}

export function ensureSnapshotGateLog(db) {
  assertDbHandle(db);
  db.exec(`create table if not exists ${SNAPSHOT_GATE_LOG_TABLE} (
    seq integer primary key,
    kind text not null,
    snapshot_id text not null,
    checkpoint_id text not null,
    freeze_receipt_digest text not null,
    gate_refs text not null,
    operator_ref text not null,
    window_start text not null,
    window_end text not null,
    created_at text not null,
    previous_digest text not null,
    receipt_digest text not null
  )`);
  return true;
}

// Read-only: this never creates the snapshot-gate log table.
export function readSnapshotGateLog(db) {
  assertDbHandle(db);
  const exists = db.prepare("select name from main.sqlite_schema where type = 'table' and name = ?").get(SNAPSHOT_GATE_LOG_TABLE);
  if (!exists) return [];
  return db.prepare(`select * from ${SNAPSHOT_GATE_LOG_TABLE} order by seq asc`).all().map((row) => ({
    seq: row.seq,
    kind: row.kind,
    snapshotId: row.snapshot_id,
    checkpointId: row.checkpoint_id,
    freezeReceiptDigest: row.freeze_receipt_digest,
    gateRefs: JSON.parse(row.gate_refs),
    operatorRef: row.operator_ref,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    createdAt: row.created_at,
    previousDigest: row.previous_digest,
    receiptDigest: row.receipt_digest,
  }));
}

export function issueSnapshotGateLogEntry(db, { kind, snapshotId, checkpointId = "", freezeReceiptDigest = "", gateRefs = {}, operatorRef = "", windowStart = "", windowEnd = "", now = () => new Date() } = {}) {
  assertDbHandle(db);
  assertSnapshotId(snapshotId);
  if (!SNAPSHOT_GATE_LOG_KINDS.includes(kind)) {
    throw coordinatorError("freeze_snapshot_gate_log_invalid", `unknown snapshot-gate log kind: ${String(kind)}`);
  }
  ensureSnapshotGateLog(db);
  const existing = readSnapshotGateLog(db);
  const seq = existing.length === 0 ? 1 : existing[existing.length - 1].seq + 1;
  const previousDigest = existing.length === 0 ? SNAPSHOT_GATE_LOG_GENESIS_DIGEST : existing[existing.length - 1].receiptDigest;
  const createdAt = now().toISOString();
  const receiptDigest = snapshotGateLogDigest({ seq, kind, snapshotId, checkpointId, freezeReceiptDigest, gateRefs, operatorRef, windowStart, windowEnd, createdAt, previousDigest });
  db.prepare(`insert into ${SNAPSHOT_GATE_LOG_TABLE}
    (seq, kind, snapshot_id, checkpoint_id, freeze_receipt_digest, gate_refs, operator_ref, window_start, window_end, created_at, previous_digest, receipt_digest)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    seq, kind, snapshotId, checkpointId, freezeReceiptDigest, JSON.stringify(gateRefs), operatorRef, windowStart, windowEnd, createdAt, previousDigest, receiptDigest,
  );
  return {
    seq, kind, snapshotId, checkpointId, freezeReceiptDigest, gateRefs, operatorRef, windowStart, windowEnd, createdAt, previousDigest, receiptDigest,
  };
}

export function verifySnapshotGateLog(db) {
  const entries = readSnapshotGateLog(db);
  let previousDigest = SNAPSHOT_GATE_LOG_GENESIS_DIGEST;
  for (const entry of entries) {
    if (entry.previousDigest !== previousDigest) {
      throw coordinatorError("freeze_snapshot_gate_log_broken", `snapshot-gate log chain is broken at seq ${entry.seq}`);
    }
    const expected = snapshotGateLogDigest({
      seq: entry.seq, kind: entry.kind, snapshotId: entry.snapshotId, checkpointId: entry.checkpointId,
      freezeReceiptDigest: entry.freezeReceiptDigest, gateRefs: entry.gateRefs, operatorRef: entry.operatorRef,
      windowStart: entry.windowStart, windowEnd: entry.windowEnd, createdAt: entry.createdAt,
      previousDigest: entry.previousDigest,
    });
    if (expected !== entry.receiptDigest) {
      throw coordinatorError("freeze_snapshot_gate_log_broken", `snapshot-gate log receipt digest mismatch at seq ${entry.seq}`);
    }
    previousDigest = entry.receiptDigest;
  }
  return { valid: true, entries: entries.length };
}

// A snapshot manifest binds one snapshot file to one freeze receipt.
// quickCheck / foreignKeys must both be true: a snapshot that failed
// acceptance cannot be given a legal manifest at all (U-F10 A6).
export function buildSnapshotGateManifest({ snapshotId, checkpointId, freezeReceiptDigest, basename, sha256, byteCount, createdAt, quickCheck, foreignKeys, schemaVersion, journalMode } = {}) {
  assertSnapshotId(snapshotId);
  assertNonEmptyString(checkpointId, "checkpoint id", "freeze_snapshot_manifest_invalid");
  if (typeof freezeReceiptDigest !== "string" || !/^[0-9a-f]{64}$/.test(freezeReceiptDigest)) {
    throw coordinatorError("freeze_snapshot_manifest_invalid", "snapshot manifest requires a 64-hex freeze receipt digest");
  }
  assertNonEmptyString(basename, "snapshot basename", "freeze_snapshot_manifest_invalid");
  if (typeof sha256 !== "string" || !/^[0-9a-f]{64}$/.test(sha256)) {
    throw coordinatorError("freeze_snapshot_manifest_invalid", "snapshot manifest requires a 64-hex snapshot SHA-256");
  }
  if (!Number.isInteger(byteCount) || byteCount <= 0) {
    throw coordinatorError("freeze_snapshot_manifest_invalid", "snapshot manifest requires a positive integer byte count");
  }
  if (typeof createdAt !== "string" || Number.isNaN(Date.parse(createdAt))) {
    throw coordinatorError("freeze_snapshot_manifest_invalid", "snapshot manifest requires an ISO createdAt timestamp");
  }
  if (quickCheck !== true || foreignKeys !== true) {
    throw coordinatorError("freeze_snapshot_manifest_invalid", "snapshot manifest requires quickCheck and foreignKeys both true (a failed snapshot cannot be manifested)");
  }
  if ((!Number.isInteger(schemaVersion) && (typeof schemaVersion !== "string" || schemaVersion.length === 0))
    || (typeof schemaVersion === "string" && schemaVersion.length === 0)) {
    throw coordinatorError("freeze_snapshot_manifest_invalid", "snapshot manifest requires a schema version (integer or non-empty string)");
  }
  assertNonEmptyString(journalMode, "journal mode", "freeze_snapshot_manifest_invalid");
  const unsigned = {
    type: SNAPSHOT_GATE_MANIFEST_TYPE,
    version: FREEZE_DRAIN_COORDINATOR_VERSION,
    snapshotId, checkpointId, freezeReceiptDigest, basename, sha256, byteCount, createdAt,
    quickCheck, foreignKeys, schemaVersion, journalMode,
  };
  return { ...unsigned, manifestDigest: sha256Hex(canonicalJson(unsigned)) };
}

export function verifySnapshotGateManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)
    || manifest.type !== SNAPSHOT_GATE_MANIFEST_TYPE
    || manifest.version !== FREEZE_DRAIN_COORDINATOR_VERSION
    || typeof manifest.manifestDigest !== "string") {
    throw coordinatorError("freeze_snapshot_manifest_invalid", "snapshot-gate manifest is malformed");
  }
  // Re-run the builder's shape checks (including the A6 acceptance
  // rule) and then the digest, so a hand-built manifest with a
  // recomputed digest over failing acceptance is still refused.
  const rebuilt = buildSnapshotGateManifest({
    snapshotId: manifest.snapshotId,
    checkpointId: manifest.checkpointId,
    freezeReceiptDigest: manifest.freezeReceiptDigest,
    basename: manifest.basename,
    sha256: manifest.sha256,
    byteCount: manifest.byteCount,
    createdAt: manifest.createdAt,
    quickCheck: manifest.quickCheck,
    foreignKeys: manifest.foreignKeys,
    schemaVersion: manifest.schemaVersion,
    journalMode: manifest.journalMode,
  });
  if (rebuilt.manifestDigest !== manifest.manifestDigest) {
    throw coordinatorError("freeze_snapshot_manifest_digest_mismatch", "snapshot-gate manifest digest does not match its contents");
  }
  return { valid: true, manifestDigest: manifest.manifestDigest };
}

// ---------------------------------------------------------------------------
// Coordinator
// ---------------------------------------------------------------------------

// One atomic transaction for a phase transition plus its coordinator
// log entry (C3 / F2). better-sqlite3 nests the inner db.transaction
// calls of transitionWriterAuthority / issueCoordinatorReceipt as
// savepoints, so a failure in the log write rolls the phase move back
// as well: the phase never moves without its log entry, and the log
// never gains an entry for a phase that did not move.
function transitionWithReceipt(db, { transitionId, from, to, fromEpoch, snapshotId, receiptRef, gateRefs, now }) {
  return db.transaction(() => {
    const next = transitionWriterAuthority(db, { to, expectedEpoch: fromEpoch, receiptRef, now });
    const coordinatorReceipt = issueCoordinatorReceipt(db, {
      transitionId, from, to, fromEpoch, toEpoch: next.epoch, snapshotId, receiptRef, gateRefs, now,
    });
    return { next, coordinatorReceipt };
  })();
}

// Scheduler wiring contract (P-2): which live-process references the
// freeze executor needs per scheduler job, and which methods it calls.
//   W-111 coin-commerce coordinator: stop() (waits for the pass in flight)
//         + getStatus() (lifecycle / timerArmed / inFlightSettled read)
//   W-112 welcome-bonus coordinator: stop() + getStatus() (stop does not
//         wait for the pass in flight; getStatus reports whether it settled)
//   W-114 data-pack rotation coordinator: stop() + getStatus()
//   W-115 portal referrals: stopTick() + getTickStatus()
// Holding the references here does not stop, start, or observe anything:
// the freeze executor still performs each §3 step in the window and
// records the evidence; the wiring only makes the references available
// in-process. This module never calls stop()/stopTick() itself.
const SCHEDULER_WIRING = Object.freeze({
  coinCommerceCoordinator: Object.freeze({ methods: ["stop", "getStatus"], statusFields: ["hasStop", "hasGetStatus"] }),
  welcomeBonusCoordinator: Object.freeze({ methods: ["stop", "getStatus"], statusFields: ["hasStop", "hasGetStatus"] }),
  rotationCoordinator: Object.freeze({ methods: ["stop", "getStatus"], statusFields: ["hasStop", "hasGetStatus"] }),
  portalReferrals: Object.freeze({ methods: ["stopTick", "getTickStatus"], statusFields: ["hasStopTick", "hasGetTickStatus"] }),
});

function validateSchedulerWiring(scheduler) {
  if (scheduler === null || scheduler === undefined) return null;
  if (typeof scheduler !== "object" || Array.isArray(scheduler)) {
    throw coordinatorError("freeze_drain_scheduler_invalid", "scheduler wiring must be an object of live-process scheduler references or null");
  }
  const refs = {};
  for (const key of Reflect.ownKeys(scheduler)) {
    if (typeof key !== "string" || !Object.hasOwn(SCHEDULER_WIRING, key)) {
      throw coordinatorError("freeze_drain_scheduler_invalid", `unknown scheduler wiring reference: ${String(key)}`);
    }
    const ref = scheduler[key];
    if (ref === null || ref === undefined) continue;
    if (typeof ref !== "object" && typeof ref !== "function") {
      throw coordinatorError("freeze_drain_scheduler_invalid", `scheduler wiring reference ${key} must be an object or null`);
    }
    for (const method of SCHEDULER_WIRING[key].methods) {
      if (typeof ref[method] !== "function") {
        throw coordinatorError("freeze_drain_scheduler_invalid", `scheduler wiring reference ${key} must expose ${method}()`);
      }
    }
    refs[key] = ref;
  }
  return Object.freeze(refs);
}

function describeSchedulerWiring(schedulerRefs) {
  const description = {};
  for (const [key, contract] of Object.entries(SCHEDULER_WIRING)) {
    const ref = schedulerRefs?.[key] ?? null;
    const entry = { present: ref !== null };
    for (let index = 0; index < contract.methods.length; index += 1) {
      entry[contract.statusFields[index]] = ref !== null && typeof ref[contract.methods[index]] === "function";
    }
    description[key] = Object.freeze(entry);
  }
  return Object.freeze(description);
}

export function createFreezeDrainCoordinator(db, { snapshotId, now = () => new Date(), scheduler = null } = {}) {
  assertDbHandle(db);
  assertSnapshotId(snapshotId);
  ensureCoordinatorLog(db);
  ensureSnapshotGateLog(db);
  // Scheduler wiring (P-2, scheduler-quiescence wiring, 2026-11-23):
  // the freeze-time caller must hold the live process's scheduler
  // references, because the coordinator itself cannot observe the
  // scheduler (plan §1). The wiring is optional at construction so
  // existing callers keep working, and fail-closed when supplied: a
  // present reference must expose the methods the freeze executor needs
  // for that job. A null reference means "not created in this process"
  // (e.g. rotation coordinator when no data-pack material escrow is in
  // place; portal referrals when referrals are disabled) and is allowed.
  const schedulerRefs = validateSchedulerWiring(scheduler);

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
    // Live-process scheduler references supplied at construction (P-2),
    // or null when no wiring was supplied. The freeze executor calls
    // each reference's stop()/read methods in the window; this module
    // never calls them. See describeSchedulerWiring for the per-job
    // presence/capability report.
    scheduler: schedulerRefs,
    schedulerWiring() {
      return describeSchedulerWiring(schedulerRefs);
    },

    freeze({ readinessBundle, coverageMatrix, drainTracker, checkpointId, outstandingJobs = [], measurementDrain } = {}) {
      const current = requirePhase(WRITER_PHASES.BWH_ACTIVE, "freeze (T1)");
      verifyFreezeReadinessBundle(readinessBundle);
      // T: the bundle's own snapshot must be this coordinator's
      // snapshot. verifyFreezeReadinessBundle only proves the bundle
      // is internally consistent; without this binding a bundle built
      // for a different freeze (different snapshot, different HWM)
      // would pass the gate and freeze the wrong round.
      if (readinessBundle.snapshotId !== snapshotId) {
        throw coordinatorError("freeze_readiness_bundle_snapshot_mismatch", `readiness bundle snapshotId ${readinessBundle.snapshotId} does not match coordinator snapshotId ${snapshotId}`);
      }
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
      // U-F11 J2/J5: when the caller supplies the measurement drain
      // counts, they must be equal non-negative integers (the queue
      // length before freeze and the number discarded at freeze). A
      // mismatch refuses the freeze; omitting the counts keeps the
      // existing T1 signature compatible and records nothing.
      let measurementGateRefs = {};
      if (measurementDrain !== undefined) {
        const { queueLengthBefore, discardedMeasurementEnqueues } = measurementDrain ?? {};
        if (!Number.isInteger(queueLengthBefore) || queueLengthBefore < 0
          || !Number.isInteger(discardedMeasurementEnqueues) || discardedMeasurementEnqueues < 0
          || queueLengthBefore !== discardedMeasurementEnqueues) {
          throw coordinatorError("freeze_measurement_drain_mismatch", "freeze (T1) measurement drain counts must be equal non-negative integers (queueLengthBefore === discardedMeasurementEnqueues)");
        }
        measurementGateRefs = { measurementQueueLengthBefore: queueLengthBefore, discardedMeasurementEnqueues };
      }
      const gateRefs = {
        bundleHash: readinessBundle.bundleHash,
        coverageDigest: coverageMatrix.matrixDigest,
        freezeReceiptDigest: freezeReceipt.receiptDigest,
        drain: { inflightWrites: drainStatus.inflightWrites, inflightCallbacks: drainStatus.inflightCallbacks, hwmStable: drainStatus.hwmStable },
        ...measurementGateRefs,
      };
      const receiptRef = transitionReceiptRef("T1", gateRefs);
      const { next, coordinatorReceipt } = transitionWithReceipt(db, {
        transitionId: "T1", from: current.phase, to: WRITER_PHASES.FROZEN,
        fromEpoch: current.epoch, snapshotId, receiptRef, gateRefs, now,
      });
      return { transitionId: "T1", authority: next, freezeReceipt, coordinatorReceipt };
    },

    // U-F10 D-2: issue a snapshot-gate run instruction. G1 requires
    // phase FROZEN, a valid freeze receipt, and a T1 log entry for
    // this snapshot whose freezeReceiptDigest matches the receipt. G2
    // requires a scheduler-quiescence receipt with every job (W-116
    // included) proven quiesced and a callback-drain receipt with no
    // pending callbacks. Any gate failure is written to the
    // snapshot-gate log as a `refusal` entry and then thrown as
    // freeze_snapshot_gate_refused. A malformed operator / window is a
    // caller error (freeze_snapshot_gate_invalid) and is not logged as
    // a refusal. Issuing an instruction never runs a snapshot.
    issueSnapshotGateInstruction({ freezeReceipt, schedulerQuiescence, callbackDrain, operator, windowStart, windowEnd } = {}) {
      assertNonEmptyString(operator, "snapshot-gate operator", "freeze_snapshot_gate_invalid");
      if (typeof windowStart !== "string" || Number.isNaN(Date.parse(windowStart))
        || typeof windowEnd !== "string" || Number.isNaN(Date.parse(windowEnd))
        || Date.parse(windowEnd) <= Date.parse(windowStart)) {
        throw coordinatorError("freeze_snapshot_gate_invalid", "snapshot-gate instruction requires a valid window (windowStart / windowEnd ISO timestamps, end after start)");
      }
      const checkpointId = typeof freezeReceipt?.checkpointId === "string" ? freezeReceipt.checkpointId : "";
      const receiptDigest = typeof freezeReceipt?.receiptDigest === "string" ? freezeReceipt.receiptDigest : "";
      const refuse = (gate, reason) => {
        issueSnapshotGateLogEntry(db, {
          kind: "refusal", snapshotId, checkpointId, freezeReceiptDigest: receiptDigest,
          gateRefs: { gate, reason }, operatorRef: operator, windowStart, windowEnd, now,
        });
        throw coordinatorError("freeze_snapshot_gate_refused", `snapshot-gate instruction refused (${gate}): ${reason}`);
      };
      const current = (() => {
        try {
          return readWriterAuthority(db);
        } catch {
          return null;
        }
      })();
      if (!current || current.phase !== WRITER_PHASES.FROZEN) {
        return refuse("G1", `phase must be FROZEN to run snapshot-gate, current phase is ${current?.phase ?? "unknown"}`);
      }
      try {
        verifyFreezeReceipt(freezeReceipt);
      } catch {
        return refuse("G1", "freeze receipt failed verification");
      }
      const t1Entries = readCoordinatorLog(db).filter((entry) => entry.transitionId === "T1" && entry.snapshotId === snapshotId);
      const latestT1 = t1Entries[t1Entries.length - 1];
      if (!latestT1 || latestT1.gateRefs?.freezeReceiptDigest !== freezeReceipt.receiptDigest) {
        return refuse("G1", "no T1 freeze entry for this snapshot matches the freeze receipt digest");
      }
      const schedulerOk = schedulerQuiescence
        && schedulerQuiescence.kind === "scheduler-quiescence"
        && schedulerQuiescence.snapshotId === snapshotId
        && Array.isArray(schedulerQuiescence.jobs)
        && schedulerQuiescence.jobs.length === SCHEDULER_JOBS.length
        && schedulerQuiescence.jobs.every((job) => job && job.quiesced === true
          && SCHEDULER_JOBS.some((known) => known.id === job.id && known.name === job.name && known.evidence === job.evidence))
        && schedulerQuiescence.jobs.some((job) => job.id === "W-116" && job.quiesced === true);
      if (!schedulerOk) {
        return refuse("G2", "scheduler quiescence is not proven for every job (W-116 included)");
      }
      const drainOk = callbackDrain
        && callbackDrain.kind === "callback-drain"
        && callbackDrain.snapshotId === snapshotId
        && Number.isInteger(callbackDrain.drained) && callbackDrain.drained >= 0
        && Array.isArray(callbackDrain.pending) && callbackDrain.pending.length === 0;
      if (!drainOk) {
        return refuse("G2", "callback drain is not complete (pending callbacks remain)");
      }
      const entry = issueSnapshotGateLogEntry(db, {
        kind: "instruction", snapshotId, checkpointId, freezeReceiptDigest: receiptDigest,
        gateRefs: { freezeReceiptDigest: receiptDigest },
        operatorRef: operator, windowStart, windowEnd, now,
      });
      return {
        snapshotId, checkpointId, freezeReceiptDigest: receiptDigest,
        operator, windowStart, windowEnd,
        instructionDigest: entry.receiptDigest,
      };
    },

    // U-F10 D-3 (bind half): bind a snapshot manifest to an issued
    // instruction. The manifest must verify (digest + shapes,
    // including the A6 rule that quickCheck/foreignKeys are both
    // true) and match the instruction field for field; the
    // instruction must exist in the snapshot-gate log and its
    // manifest must not have been voided. A failed acceptance writes
    // a `void` entry (the snapshot is dead) and throws
    // freeze_snapshot_acceptance_failed; any other mismatch throws
    // freeze_snapshot_bind_refused and writes no binding entry.
    bindSnapshotManifest({ instruction, manifest, acceptance } = {}) {
      if (!instruction || typeof instruction !== "object" || Array.isArray(instruction)
        || typeof instruction.instructionDigest !== "string"
        || instruction.snapshotId !== snapshotId) {
        throw coordinatorError("freeze_snapshot_bind_refused", "snapshot manifest binding requires an instruction issued by this coordinator");
      }
      const issued = readSnapshotGateLog(db).find((entry) => entry.kind === "instruction"
        && entry.snapshotId === snapshotId
        && entry.receiptDigest === instruction.instructionDigest);
      if (!issued) {
        throw coordinatorError("freeze_snapshot_bind_refused", "snapshot manifest binding requires an instruction recorded in the snapshot-gate log");
      }
      try {
        verifySnapshotGateManifest(manifest);
      } catch (error) {
        throw coordinatorError("freeze_snapshot_bind_refused", `snapshot manifest failed verification: ${error?.message ?? "invalid manifest"}`);
      }
      if (manifest.snapshotId !== instruction.snapshotId
        || manifest.checkpointId !== instruction.checkpointId
        || manifest.freezeReceiptDigest !== instruction.freezeReceiptDigest) {
        throw coordinatorError("freeze_snapshot_bind_refused", "snapshot manifest does not match the instruction (snapshotId / checkpointId / freezeReceiptDigest)");
      }
      const voided = readSnapshotGateLog(db).some((entry) => entry.kind === "void"
        && entry.snapshotId === snapshotId
        && entry.gateRefs?.manifestDigest === manifest.manifestDigest);
      if (voided) {
        throw coordinatorError("freeze_snapshot_bind_refused", "snapshot manifest has been voided and cannot be bound");
      }
      if (!acceptance || acceptance.quickCheck !== true || acceptance.foreignKeys !== true) {
        issueSnapshotGateLogEntry(db, {
          kind: "void", snapshotId, checkpointId: manifest.checkpointId,
          freezeReceiptDigest: manifest.freezeReceiptDigest,
          gateRefs: { manifestDigest: manifest.manifestDigest, reason: "snapshot acceptance failed (quickCheck / foreignKeys)" },
          operatorRef: instruction.operator ?? "", windowStart: instruction.windowStart ?? "", windowEnd: instruction.windowEnd ?? "", now,
        });
        throw coordinatorError("freeze_snapshot_acceptance_failed", "snapshot acceptance failed (quickCheck / foreignKeys not both true); the snapshot is voided and cannot be used");
      }
      const entry = issueSnapshotGateLogEntry(db, {
        kind: "binding", snapshotId, checkpointId: manifest.checkpointId,
        freezeReceiptDigest: manifest.freezeReceiptDigest,
        gateRefs: {
          manifestDigest: manifest.manifestDigest,
          freezeReceiptDigest: manifest.freezeReceiptDigest,
          instructionDigest: instruction.instructionDigest,
          acceptance: { quickCheck: true, foreignKeys: true },
        },
        operatorRef: instruction.operator ?? "", windowStart: instruction.windowStart ?? "", windowEnd: instruction.windowEnd ?? "", now,
      });
      return {
        snapshotId, manifestDigest: manifest.manifestDigest,
        freezeReceiptDigest: manifest.freezeReceiptDigest,
        bindingDigest: entry.receiptDigest,
      };
    },

    // Void a snapshot manifest by digest. A voided manifest can never
    // be bound afterwards, and a T2 switch that only has a voided
    // binding is refused by the D-3 gate.
    voidSnapshotManifest({ snapshotId: voidSnapshotId, manifestDigest, reason } = {}) {
      if (voidSnapshotId !== snapshotId) {
        throw coordinatorError("freeze_snapshot_void_invalid", "void requires this coordinator's snapshot id");
      }
      if (typeof manifestDigest !== "string" || !/^[0-9a-f]{64}$/.test(manifestDigest)) {
        throw coordinatorError("freeze_snapshot_void_invalid", "void requires a 64-hex manifest digest");
      }
      assertNonEmptyString(reason, "void reason", "freeze_snapshot_void_invalid");
      const entry = issueSnapshotGateLogEntry(db, {
        kind: "void", snapshotId, checkpointId: "",
        freezeReceiptDigest: "",
        gateRefs: { manifestDigest, reason },
        operatorRef: "", windowStart: "", windowEnd: "", now,
      });
      return { snapshotId, manifestDigest, voidDigest: entry.receiptDigest };
    },

    readSnapshotGateLog() {
      return readSnapshotGateLog(db);
    },

    verifySnapshotGateLog() {
      return verifySnapshotGateLog(db);
    },

    switchToD1({ deltaReport, verificationReport, c1ApprovalRef, handover = {} } = {}) {
      const current = requirePhase(WRITER_PHASES.FROZEN, "switch to D1 (T2)");
      verifyDeltaCatchupReport(deltaReport);
      // Gate on the verdict recomputed from the checks by verify(),
      // never on the verdict string the report itself carries (C1).
      const verification = verifyTwoSidedVerificationReport(verificationReport);
      if (verification.verdict !== "pass") {
        throw coordinatorError("freeze_verification_failed", `two-sided verification failed: ${verification.failedIds.join(", ")}; staying in FROZEN`, { failedIds: verification.failedIds });
      }
      // F6 (recorded limitation): these refs are checked only for
      // presence / form and are recorded verbatim in the coordinator
      // log, so a real approval can be audited against its own record
      // afterwards. The coordinator cannot tell a real ref from a
      // fabricated string by itself and never grants an approval.
      assertNonEmptyString(c1ApprovalRef, "C1 approval ref", "freeze_c1_approval_missing");
      assertNonEmptyString(handover.verifiedBy, "staged handover verifiedBy", "freeze_handover_unverified");
      assertNonEmptyString(handover.receiptRef, "staged handover receiptRef", "freeze_handover_unverified");
      if (typeof handover.verifiedAt !== "string" || Number.isNaN(Date.parse(handover.verifiedAt))) {
        throw coordinatorError("freeze_handover_unverified", "staged handover requires a verifiedAt ISO timestamp");
      }
      // U-F10 D-3: T2 must not start until the snapshot taken under
      // this freeze is bound to the freeze receipt. The binding gate
      // runs after the other T2 gates so their refusal codes are
      // preserved; a missing or voided binding refuses the switch
      // here, still in FROZEN, before any phase move.
      const t1Entries = readCoordinatorLog(db).filter((entry) => entry.transitionId === "T1" && entry.snapshotId === snapshotId);
      const latestT1 = t1Entries[t1Entries.length - 1];
      const boundFreezeDigest = latestT1?.gateRefs?.freezeReceiptDigest;
      const gateLog = readSnapshotGateLog(db);
      const voidedManifests = new Set(gateLog
        .filter((entry) => entry.kind === "void" && entry.snapshotId === snapshotId)
        .map((entry) => entry.gateRefs?.manifestDigest));
      const binding = gateLog.find((entry) => entry.kind === "binding"
        && entry.snapshotId === snapshotId
        && entry.freezeReceiptDigest === boundFreezeDigest
        && typeof entry.gateRefs?.manifestDigest === "string"
        && !voidedManifests.has(entry.gateRefs.manifestDigest));
      if (!binding) {
        throw coordinatorError("freeze_snapshot_unbound", "switch to D1 (T2) requires a snapshot manifest bound to this freeze receipt; no live binding exists, staying in FROZEN");
      }
      const gateRefs = {
        deltaDigest: deltaReport.reportDigest,
        verificationDigest: verificationReport.reportDigest,
        snapshotBindingDigest: binding.receiptDigest,
        snapshotManifestDigest: binding.gateRefs.manifestDigest,
        c1ApprovalRef,
        handover: { verifiedBy: handover.verifiedBy, verifiedAt: handover.verifiedAt, receiptRef: handover.receiptRef },
      };
      const receiptRef = transitionReceiptRef("T2", gateRefs);
      const { next, coordinatorReceipt } = transitionWithReceipt(db, {
        transitionId: "T2", from: current.phase, to: WRITER_PHASES.D1_ACTIVE,
        fromEpoch: current.epoch, snapshotId, receiptRef, gateRefs, now,
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
      const { next, coordinatorReceipt } = transitionWithReceipt(db, {
        transitionId: "T3", from: current.phase, to: WRITER_PHASES.RECOVERY,
        fromEpoch: current.epoch, snapshotId, receiptRef, gateRefs, now,
      });
      return { transitionId: "T3", authority: next, coordinatorReceipt };
    },

    unfreeze({ reason, voidedFreezeReceiptRef } = {}) {
      const current = requirePhase(WRITER_PHASES.FROZEN, "unfreeze (T5)");
      assertNonEmptyString(reason, "unfreeze reason", "freeze_unfreeze_reason_missing");
      assertNonEmptyString(voidedFreezeReceiptRef, "voided freeze receipt ref", "freeze_unfreeze_receipt_missing");
      // F5: the voided ref must be a freeze receipt this coordinator
      // actually issued (a T1 log entry's freezeReceiptDigest), not
      // any non-empty string, so the log can later show which freeze
      // receipt was voided.
      const issuedFreezeReceipts = readCoordinatorLog(db)
        .filter((entry) => entry.transitionId === "T1")
        .map((entry) => entry.gateRefs?.freezeReceiptDigest);
      if (!issuedFreezeReceipts.includes(voidedFreezeReceiptRef)) {
        throw coordinatorError("freeze_unfreeze_receipt_invalid", "voided freeze receipt ref does not match any freeze receipt issued by this coordinator");
      }
      const gateRefs = { reason, voidedFreezeReceiptRef };
      const receiptRef = transitionReceiptRef("T5", gateRefs);
      const { next, coordinatorReceipt } = transitionWithReceipt(db, {
        transitionId: "T5", from: current.phase, to: WRITER_PHASES.BWH_ACTIVE,
        fromEpoch: current.epoch, snapshotId, receiptRef, gateRefs, now,
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
      // Gate on the verdict recomputed from the checks by verify(),
      // never on the verdict string the report itself carries (C1).
      const reverification = verifyTwoSidedVerificationReport(reverificationReport);
      if (reverification.verdict !== "pass") {
        throw coordinatorError("freeze_verification_failed", `reverification failed: ${reverification.failedIds.join(", ")}; staying in RECOVERY`, { failedIds: reverification.failedIds });
      }
      // V (PR #906 r4662139149): the re-verification must be bound to
      // THIS recovery. The expected (epoch, trigger) come from the
      // latest T3 log entry for this snapshot — the recovery this
      // resume is answering. A switch-time (T2) report carries no
      // context at all, and a report built for a different recovery
      // (different epoch or trigger) is refused, even with a passing
      // verdict and a valid digest. No T3 entry means there is no
      // recovery to resume from.
      const recoveryEntries = readCoordinatorLog(db).filter((entry) => entry.transitionId === "T3" && entry.snapshotId === snapshotId);
      const recoveryEntry = recoveryEntries[recoveryEntries.length - 1];
      if (!recoveryEntry) {
        throw coordinatorError("freeze_recovery_context_missing", "resumeToD1 (R1) requires a recorded recovery (T3) to bind the re-verification to");
      }
      const expectedEpoch = recoveryEntry.toEpoch;
      const expectedTrigger = recoveryEntry.gateRefs?.trigger;
      const context = reverification.context;
      if (!context || context.kind !== "recovery-resume" || context.epoch !== expectedEpoch || context.trigger !== expectedTrigger) {
        throw coordinatorError("freeze_reverification_context_mismatch", `re-verification report context does not match the recorded recovery (expected epoch ${expectedEpoch}, trigger ${expectedTrigger})`);
      }
      const gateRefs = { reverificationDigest: reverificationReport.reportDigest, recoveryEpoch: expectedEpoch, trigger: expectedTrigger };
      const receiptRef = transitionReceiptRef("R1", gateRefs);
      const { next, coordinatorReceipt } = transitionWithReceipt(db, {
        transitionId: "R1", from: current.phase, to: WRITER_PHASES.D1_ACTIVE,
        fromEpoch: current.epoch, snapshotId, receiptRef, gateRefs, now,
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
