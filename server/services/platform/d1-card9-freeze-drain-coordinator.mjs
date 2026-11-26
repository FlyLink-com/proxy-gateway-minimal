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
//
// N5 (PR #932 r4701898636): the A3 -> T1 window IS guarded at the
// receipt, not only at T2. freeze() re-reads the credential manifest
// under the same immediate transaction that builds the T1 freeze
// receipt and refuses when it moved away from the bundle's
// credentialManifestHash (an in-place rotation is invisible to the
// HWM), and refuses when the fresh receipt's HWM moved away from the
// bundle's write-lock receipt HWM. The residual gap is receipt ->
// transition only (synchronous, in-process, no await in between);
// a write landing there is still caught by the T2 verification gate.
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
import {
  assertCredentialVersionTrackingInstalled,
  buildCredentialVersionManifest,
  isCredentialReconciliationError,
} from "./d1-stage2-credential-reconciliation.mjs";
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

function normalizeFreezeReceiptDigest(value, code) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw coordinatorError(code, "freeze receipt digest must be a SHA-256 hex digest");
  }
  return value;
}

function optionalManifestBinding(value, code) {
  if (value === undefined) return {};
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw coordinatorError(code, "snapshot manifest digest must be a SHA-256 hex digest");
  }
  return { manifestDigest: value };
}

function deltaFreezeBinding(value, manifestDigest) {
  // Historical reports remain readable, but do not satisfy the T2 gate.
  return {
    ...(value === undefined ? {} : { freezeReceiptDigest: normalizeFreezeReceiptDigest(value, "freeze_delta_invalid") }),
    ...optionalManifestBinding(manifestDigest, "freeze_delta_invalid"),
  };
}

export function buildDeltaCatchupReport({ snapshotId, freezeReceiptDigest, manifestDigest, items = [], confirmedEmpty = false, now = () => new Date() } = {}) {
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
  const binding = deltaFreezeBinding(freezeReceiptDigest, manifestDigest);
  return {
    type: "delta-catchup-report",
    schemaVersion: FREEZE_DRAIN_COORDINATOR_VERSION,
    snapshotId,
    items: normalized,
    ...binding,
    confirmedEmpty,
    allDispositioned: true,
    timestamp: now().toISOString(),
    reportDigest: reportDigest("delta-catchup-report", snapshotId, { items: normalized, confirmedEmpty, ...binding }),
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
  const expectedKeys = ["type", "schemaVersion", "snapshotId", "items", "freezeReceiptDigest", "manifestDigest", "confirmedEmpty", "allDispositioned", "timestamp", "reportDigest"];
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
  const binding = deltaFreezeBinding(report.freezeReceiptDigest, report.manifestDigest);
  const expected = reportDigest("delta-catchup-report", report.snapshotId, { items: normalized, confirmedEmpty: report.confirmedEmpty, ...binding });
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
  // Digest-covered context distinguishes a specific frozen T1 (T2) from
  // a specific recovery (R1). Legacy null context is readable, not actionable.
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
  if (typeof context !== "object" || Array.isArray(context)) {
    throw coordinatorError("freeze_verification_invalid", "verification context must be an object");
  }
  if (context.kind === "freeze-switch") {
    return {
      kind: "freeze-switch",
      freezeReceiptDigest: normalizeFreezeReceiptDigest(context.freezeReceiptDigest, "freeze_verification_invalid"),
      ...optionalManifestBinding(context.manifestDigest, "freeze_verification_invalid"),
    };
  }
  if (context.kind !== "recovery-resume") {
    throw coordinatorError("freeze_verification_invalid", "verification context requires a known purpose");
  }
  if (!Number.isInteger(context.epoch) || context.epoch < 1) {
    throw coordinatorError("freeze_verification_invalid", "recovery verification context requires a positive integer epoch");
  }
  if (!ROLLBACK_TRIGGERS.includes(context.trigger)) {
    throw coordinatorError("freeze_verification_invalid", `recovery verification context requires a known rollback trigger (expected one of ${ROLLBACK_TRIGGERS.join(", ")})`);
  }
  const receiptDigest = context.recoveryReceiptDigest;
  if (receiptDigest !== undefined && (typeof receiptDigest !== "string" || !/^[0-9a-f]{64}$/.test(receiptDigest))) {
    throw coordinatorError("freeze_verification_invalid", "recovery receipt digest must be a SHA-256 hex digest");
  }
  // Older reports are still readable, but cannot authorize an R1.
  return {
    kind: "recovery-resume", epoch: context.epoch, trigger: context.trigger,
    ...(receiptDigest === undefined ? {} : { recoveryReceiptDigest: receiptDigest }),
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
  if (!report.checks || typeof report.checks !== "object" || Array.isArray(report.checks)
    || VERIFICATION_CHECK_IDS.some((id) => !report.checks[id] || typeof report.checks[id].passed !== "boolean")) {
    throw coordinatorError("freeze_verification_invalid", "two-sided verification report checks are malformed");
  }
  if ((report.verdict !== "pass" && report.verdict !== "fail") || !Array.isArray(report.failedIds)) {
    throw coordinatorError("freeze_verification_invalid", "two-sided verification report verdict / failedIds are malformed");
  }
  // The context is part of the verified shape: a report that never
  // carried one verifies with context null, and a context that does
  // not match the named purpose is refused even if its digest was recomputed.
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
  assertDbHandle(db);
  return db.transaction(() => {
    const entries = readVerifiedCoordinatorLog(db);
    return { valid: true, entries: entries.length };
  })();
}

// Call within a single SQLite transaction so the log and authority come
// from the same read snapshot. A valid hash-chain prefix is not sufficient.
function readVerifiedCoordinatorLog(db) {
  let entries;
  try {
    entries = readCoordinatorLog(db);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw coordinatorError("freeze_coordinator_log_broken", "coordinator log contains invalid gate references");
  }
  let previousDigest = COORDINATOR_LOG_GENESIS_DIGEST;
  let previousPhase = WRITER_PHASES.BWH_ACTIVE;
  let previousEpoch = 1;
  let seq = 0;
  for (const entry of entries) {
    seq += 1;
    if (entry.seq !== seq || entry.previousDigest !== previousDigest
      || entry.from !== previousPhase || entry.fromEpoch !== previousEpoch
      || entry.toEpoch !== previousEpoch + 1
      || !FREEZE_DRAIN_TRANSITIONS.some((step) => !step.blocked && step.id === entry.transitionId
        && step.from === entry.from && step.to === entry.to)) {
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
    previousPhase = entry.to;
    previousEpoch = entry.toEpoch;
  }
  const authority = readWriterAuthority(db);
  const tip = entries.at(-1);
  // No installed authority can be inspected as empty history, but only
  // BWH_ACTIVE epoch 1 with an empty ref is a valid installed bootstrap.
  const matchesAuthority = authority === null
    ? !tip
    : authority.phase === previousPhase && authority.epoch === previousEpoch
      && authority.receiptRef === (tip?.receiptRef ?? "");
  if (!matchesAuthority) {
    throw coordinatorError("freeze_coordinator_log_authority_mismatch", "coordinator log tip does not match durable writer authority");
  }
  return entries;
}

export function verifyCoordinatorReceipt(db, receipt) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)
    || receipt.type !== COORDINATOR_RECEIPT_TYPE
    || receipt.schemaVersion !== FREEZE_DRAIN_COORDINATOR_VERSION
    || !Number.isInteger(receipt.seq) || receipt.seq < 1
    || typeof receipt.receiptDigest !== "string") {
    throw coordinatorError("freeze_coordinator_receipt_invalid", "coordinator receipt is malformed");
  }
  assertDbHandle(db);
  return db.transaction(() => verifyStoredCoordinatorReceipt(db, receipt))();
}

function verifyStoredCoordinatorReceipt(db, receipt) {
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
  readVerifiedCoordinatorLog(db);
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

// N5 (PR #932 r4701898636): re-read the credential manifest at T1
// and compare it with the A2/A3 bundle baseline.
// platform_portal_edge_credentials has no updated_at, so an in-place
// rotation (same PK, same row count) is invisible to the HWM — only
// the version manifest sees it. Fail-closed: missing tracking, an
// unreadable manifest, or a moved hash all refuse the freeze. Only
// hash prefixes enter the message; no credential PK or value ever does.
function assertCredentialManifestUnmoved(db, snapshotId, baselineHash) {
  let observed;
  try {
    assertCredentialVersionTrackingInstalled(db);
    observed = buildCredentialVersionManifest(db, { snapshotId });
  } catch (error) {
    if (isCredentialReconciliationError(error)) {
      throw coordinatorError(
        "freeze_credential_tracking_missing",
        `credential version tracking is not installed or not verifiable at T1 (${error.code}: ${error.message}) — install credential version tracking and backfill pre-existing credential rows before freezing; do not freeze on a high-water mark that cannot see in-place credential rotations`,
      );
    }
    throw coordinatorError(
      "freeze_credential_tracking_missing",
      `credential manifest cannot be re-read at T1 (${error?.message ?? "unknown error"}) — refusing the freeze`,
    );
  }
  if (observed.manifestHash !== baselineHash) {
    throw coordinatorError(
      "freeze_credential_version_moved",
      `credential versions moved between the A3 bundle and the T1 freeze (manifest hash ${baselineHash.slice(0, 12)}… -> ${observed.manifestHash.slice(0, 12)}…) — an in-place credential rotation is invisible to the row-count/updated_at high-water mark, so the freeze is refused; stop and report, do not freeze on a moved credential manifest`,
    );
  }
  return observed.manifestHash;
}

// One atomic transaction for a phase transition plus its coordinator
// log entry (C3 / F2). better-sqlite3 nests the inner db.transaction
// calls of transitionWriterAuthority / issueCoordinatorReceipt as
// savepoints, so a failure in the log write rolls the phase move back
// as well: the phase never moves without its log entry, and the log
// never gains an entry for a phase that did not move.
function transitionWithReceipt(db, { transitionId, from, to, fromEpoch, snapshotId, receiptRef, gateRefs, now }) {
  return db.transaction(() => {
    readVerifiedCoordinatorLog(db);
    const next = transitionWriterAuthority(db, { to, expectedEpoch: fromEpoch, receiptRef, now });
    const coordinatorReceipt = issueCoordinatorReceipt(db, {
      transitionId, from, to, fromEpoch, toEpoch: next.epoch, snapshotId, receiptRef, gateRefs, now,
    });
    return { next, coordinatorReceipt };
  }).immediate();
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

  function requireCurrentFreeze() {
    const tip = readVerifiedCoordinatorLog(db).at(-1);
    const digest = tip?.gateRefs?.freezeReceiptDigest;
    if (tip?.transitionId !== "T1" || tip.snapshotId !== snapshotId
      || typeof digest !== "string" || !/^[0-9a-f]{64}$/.test(digest)) {
      throw coordinatorError("freeze_coordinator_freeze_context_mismatch", "current writer authority has no active T1 for this snapshot");
    }
    return digest;
  }

  function underWriterLock(fn) {
    return db.transaction(fn).immediate;
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
      // N5 (PR #932 r4701898636): the A3 -> T1 window. The bundle
      // must carry the A2/A3 credential manifest hash — without it
      // there is no baseline to re-verify against, so the freeze is
      // refused rather than taken on a blind HWM.
      const baselineCredentialManifestHash = readinessBundle.credentialManifestHash;
      if (typeof baselineCredentialManifestHash !== "string" || !/^[0-9a-f]{64}$/.test(baselineCredentialManifestHash)) {
        throw coordinatorError("freeze_readiness_bundle_credential_manifest_missing", "freeze (T1) requires the readiness bundle to carry the A2/A3 credential manifest hash (credentialManifestHash); a bundle without it cannot prove no credential rotation happened after A3 — refusing the freeze");
      }
      // The manifest re-read, the T1 receipt build and the HWM
      // comparison run under one immediate transaction, so no
      // concurrent writer can land between the re-read and the
      // receipt. Belt-and-braces HWM check: the fresh receipt's HWM
      // must still equal the bundle's write-lock receipt HWM, so a
      // non-credential write landing in the A3 -> T1 window refuses
      // the freeze here instead of leaking into the snapshot.
      const { freezeReceipt, t1CredentialManifestHash } = underWriterLock(() => {
        const observedManifestHash = assertCredentialManifestUnmoved(db, snapshotId, baselineCredentialManifestHash);
        const receipt = buildFreezeReceipt(db, { snapshotId, checkpointId, outstandingJobs });
        verifyFreezeReceipt(receipt);
        const bundleHwm = readinessBundle.receipts.writeLock.receipt.highWaterMark;
        if (JSON.stringify(receipt.highWaterMark) !== JSON.stringify(bundleHwm)) {
          throw coordinatorError("freeze_t1_hwm_moved", "a write landed between the A3 bundle and the T1 freeze: the fresh freeze receipt's high-water mark does not match the bundle's write-lock receipt HWM — stop and report, do not freeze on a moved HWM");
        }
        return { freezeReceipt: receipt, t1CredentialManifestHash: observedManifestHash };
      })();
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
        credentialManifestHash: t1CredentialManifestHash,
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
      if (instruction.checkpointId !== issued.checkpointId || instruction.freezeReceiptDigest !== issued.freezeReceiptDigest) {
        throw coordinatorError("freeze_snapshot_bind_refused", "snapshot instruction fields do not match the recorded instruction");
      }
      try {
        verifySnapshotGateManifest(manifest);
      } catch (error) {
        throw coordinatorError("freeze_snapshot_bind_refused", `snapshot manifest failed verification: ${error?.message ?? "invalid manifest"}`);
      }
      if (manifest.snapshotId !== issued.snapshotId
        || manifest.checkpointId !== issued.checkpointId
        || manifest.freezeReceiptDigest !== issued.freezeReceiptDigest) {
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
          operatorRef: issued.operatorRef, windowStart: issued.windowStart, windowEnd: issued.windowEnd, now,
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
        operatorRef: issued.operatorRef, windowStart: issued.windowStart, windowEnd: issued.windowEnd, now,
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

    switchToD1: underWriterLock(({ deltaReport, verificationReport, c1ApprovalRef, handover = {} } = {}) => {
      const current = requirePhase(WRITER_PHASES.FROZEN, "switch to D1 (T2)");
      verifyDeltaCatchupReport(deltaReport);
      const boundFreezeDigest = requireCurrentFreeze();
      if (deltaReport.snapshotId !== snapshotId || deltaReport.freezeReceiptDigest !== boundFreezeDigest) {
        throw coordinatorError("freeze_delta_context_mismatch", "T2 delta report must match the current snapshot and active T1 freeze receipt");
      }
      // Gate on the verdict recomputed from the checks by verify(),
      // never on the verdict string the report itself carries (C1).
      const verification = verifyTwoSidedVerificationReport(verificationReport);
      if (verificationReport.snapshotId !== snapshotId || verification.context?.kind !== "freeze-switch"
        || verification.context.freezeReceiptDigest !== boundFreezeDigest) {
        throw coordinatorError("freeze_verification_context_mismatch", "T2 verification report must match the current snapshot and active T1 freeze receipt");
      }
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
      const manifestDigest = deltaReport.manifestDigest;
      if (manifestDigest === undefined || verification.context.manifestDigest !== manifestDigest) {
        throw coordinatorError("freeze_snapshot_report_manifest_mismatch", "T2 requires both reports to name the same accepted snapshot manifest digest");
      }
      verifySnapshotGateLog(db);
      const gateLog = readSnapshotGateLog(db);
      const voidedManifests = new Set(gateLog
        .filter((entry) => entry.kind === "void" && entry.snapshotId === snapshotId)
        .map((entry) => entry.gateRefs?.manifestDigest));
      const binding = gateLog.find((entry) => entry.kind === "binding"
        && entry.snapshotId === snapshotId
        && entry.freezeReceiptDigest === boundFreezeDigest
        && entry.gateRefs?.manifestDigest === manifestDigest
        && entry.gateRefs.acceptance?.quickCheck === true
        && entry.gateRefs.acceptance?.foreignKeys === true
        && !voidedManifests.has(manifestDigest));
      if (!binding) {
        throw coordinatorError("freeze_snapshot_unbound", "switch to D1 (T2) requires a live, accepted binding for the reported manifest and this freeze receipt, staying in FROZEN");
      }
      const gateRefs = {
        freezeReceiptDigest: boundFreezeDigest,
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
    }),

    enterRecovery: underWriterLock(({ trigger, detail = "" } = {}) => {
      const current = requirePhase(WRITER_PHASES.D1_ACTIVE, "enter recovery (T3)");
      if (!ROLLBACK_TRIGGERS.includes(trigger)) {
        throw coordinatorError("freeze_rollback_trigger_invalid", `unknown rollback trigger: ${String(trigger)} (expected one of ${ROLLBACK_TRIGGERS.join(", ")})`);
      }
      const active = readVerifiedCoordinatorLog(db).at(-1);
      if (active?.snapshotId !== snapshotId) {
        throw coordinatorError("freeze_recovery_context_mismatch", "T3 must refer to the recorded active D1 snapshot");
      }
      const gateRefs = { trigger, detail };
      const receiptRef = transitionReceiptRef("T3", gateRefs);
      const { next, coordinatorReceipt } = transitionWithReceipt(db, {
        transitionId: "T3", from: current.phase, to: WRITER_PHASES.RECOVERY,
        fromEpoch: current.epoch, snapshotId, receiptRef, gateRefs, now,
      });
      return { transitionId: "T3", authority: next, coordinatorReceipt };
    }),

    unfreeze: underWriterLock(({ reason, voidedFreezeReceiptRef } = {}) => {
      const current = requirePhase(WRITER_PHASES.FROZEN, "unfreeze (T5)");
      assertNonEmptyString(reason, "unfreeze reason", "freeze_unfreeze_reason_missing");
      assertNonEmptyString(voidedFreezeReceiptRef, "voided freeze receipt ref", "freeze_unfreeze_receipt_missing");
      // A verified FROZEN tip must be T1 for this snapshot. An earlier
      // T1 was already consumed by its T2/T5 and cannot void this freeze.
      if (voidedFreezeReceiptRef !== requireCurrentFreeze()) {
        throw coordinatorError("freeze_unfreeze_receipt_invalid", "T5 requires the current, unconsumed T1 freeze receipt");
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
    }),

    resumeToD1: underWriterLock(({ reverificationReport } = {}) => {
      const current = requirePhase(WRITER_PHASES.RECOVERY, "resume to D1 (R1)");
      // Gate on the verdict recomputed from the checks by verify(),
      // never on the verdict string the report itself carries (C1).
      const reverification = verifyTwoSidedVerificationReport(reverificationReport);
      if (reverification.verdict !== "pass") {
        throw coordinatorError("freeze_verification_failed", `reverification failed: ${reverification.failedIds.join(", ")}; staying in RECOVERY`, { failedIds: reverification.failedIds });
      }
      // Only the verified current log tip can authorize R1. Verify its
      // snapshot lineage and bind the report to that exact T3 receipt.
      const entries = readVerifiedCoordinatorLog(db);
      const recoveryEntry = entries.at(-1);
      if (recoveryEntry?.transitionId !== "T3" || recoveryEntry.snapshotId !== snapshotId
        || entries.at(-2)?.snapshotId !== snapshotId) {
        throw coordinatorError("freeze_recovery_context_missing", "R1 requires the current T3 and active D1 history for this snapshot");
      }
      const expectedTrigger = recoveryEntry.gateRefs?.trigger;
      const context = reverification.context;
      if (reverificationReport.snapshotId !== snapshotId || context?.kind !== "recovery-resume"
        || context.epoch !== current.epoch || context.trigger !== expectedTrigger
        || context.recoveryReceiptDigest !== recoveryEntry.receiptDigest) {
        throw coordinatorError("freeze_reverification_context_mismatch", "R1 report does not match the current recovery snapshot, epoch, trigger and T3 receipt");
      }
      const gateRefs = {
        reverificationDigest: reverificationReport.reportDigest,
        recoveryEpoch: current.epoch,
        recoveryReceiptDigest: recoveryEntry.receiptDigest,
        trigger: expectedTrigger,
      };
      const receiptRef = transitionReceiptRef("R1", gateRefs);
      const { next, coordinatorReceipt } = transitionWithReceipt(db, {
        transitionId: "R1", from: current.phase, to: WRITER_PHASES.D1_ACTIVE,
        fromEpoch: current.epoch, snapshotId, receiptRef, gateRefs, now,
      });
      return { transitionId: "R1", authority: next, coordinatorReceipt };
    }),

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
