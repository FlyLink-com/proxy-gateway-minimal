// D1 Stage 2 — freeze execution and drain (task 6).
//
// One BEGIN IMMEDIATE read receipt proves no concurrent write lock
// during that read only. It does NOT prove the scheduler is quiet,
// async callbacks have finished, the durable high-water mark is
// complete, or a cross-system freeze is safe. This module therefore
// builds FOUR separate positive receipts and bundles them — and the
// bundle explicitly never transitions phase. The FROZEN transition
// itself is a separate coordinator decision with its own receipt;
// nothing here performs it.
//
// The four receipts:
// 1. write-lock — the 1B freeze receipt (buildFreezeReceipt): one
//    BEGIN IMMEDIATE transaction holding the lock while the authority
//    row and the high-water mark are read. Proves no concurrent write
//    lock during that read, nothing more.
// 2. scheduler-quiescence — positive evidence for every known
//    scheduler job (1B inventory §7, W-111..W-120 plus metering).
//    The caller supplies per-job evidence; the receipt fails closed
//    on any missing or false entry. It does not independently observe
//    the production scheduler.
// 3. callback-drain — every outstanding callback settled, deduplicated
//    by id. A duplicate id with conflicting states is an error.
// 4. hwm-completeness — the durable high-water mark's seq matches the
//    latest incremental manifest's seq and the row counts are
//    recorded. A gap is an error.
//
// The unfenced-writer coverage report (U-F1..U-F18, U-01..U-10) is
// the 1B inventory §15/§12 baseline, carried here as data so the
// coordinator can track what is still open. U-F18 stays open until
// the credential detector is independently reviewed.

import { createHash } from "node:crypto";

import { buildFreezeReceipt, verifyFreezeReceipt } from "./writer-freeze-receipt.mjs";

export const FREEZE_DRAIN_SCHEMA_VERSION = 1;

// Scheduler jobs from the 1B write inventory §7. `evidence` is what
// a positive receipt needs for that job: the caller must supply it
// per job; the receipt never assumes a job is quiet.
export const SCHEDULER_JOBS = Object.freeze([
  { id: "W-111", name: "coin-commerce coordinator (boot setTimeout)", evidence: "coordinator promise settled, no pending wake" },
  { id: "W-112", name: "welcome-bonus coordinator (boot setTimeout)", evidence: "coordinator promise settled, no pending wake" },
  { id: "W-113", name: "deferred-transition coordinator (boot setTimeout)", evidence: "coordinator promise settled, no pending wake" },
  { id: "W-114", name: "data-pack rotation coordinator (boot setTimeout)", evidence: "coordinator promise settled, no pending wake" },
  { id: "W-115", name: "referral 30 s tick", evidence: "tick timer cleared and no tick in flight" },
  { id: "W-116", name: "usage collection + snapshot-gate quiesce", evidence: "no collection in flight; snapshot gate reports idle" },
  { id: "W-117", name: "recordUsageSample", evidence: "no sample write in flight" },
  { id: "W-118", name: "recordCumulativeUsageSample", evidence: "no sample write in flight" },
  { id: "W-119", name: "lead purge CLI", evidence: "CLI process exited" },
  { id: "W-120", name: "referral policy CLI", evidence: "CLI process exited" },
  { id: "METERING", name: "metering (no standalone timer; follows business calls)", evidence: "no business call in flight" },
]);

// Unfenced-writer baseline from the 1B inventory §15.2 (U-F1..U-F18)
// and §12 (U-01..U-10). One line each; the inventory document is the
// authority for the full wording, except U-F18, whose note was updated
// here to point at the Stage 2 credential detector (status still open).
export const UNFENCED_WRITER_BASELINE = Object.freeze([
  { id: "U-F1", note: "standalone wallet connection (coin-wallet-store.mjs): direct wallet transactions unfenced" },
  { id: "U-F2", note: "payment store (own connection): no fence installed" },
  { id: "U-F3", note: "ads-consent store (own connection): recordConsent runs its own unfenced transaction" },
  { id: "U-F4", note: "referral service (own connection) + 30 s tick: non-HTTP writer" },
  { id: "U-F5", note: "deferred-transition store (own connection, via runtime): boot-started coordinator path" },
  { id: "U-F6", note: "admin user-commerce service (per-call connection): no fence installed" },
  { id: "U-F7", note: "lead-retention operations (per-operation connection): CLI-driven, no fence" },
  { id: "U-F8", note: "boot coordinators' direct store calls: bypass the fence where they do not go through runInTransaction or a fenced commerce transaction" },
  { id: "U-F9", note: "server-startup writes other than bootstrap: schema-ensure DDL, out of fence scope by operator discipline" },
  { id: "U-F10", note: "snapshot-gate quiesce (W-116): operator script with direct file access; needs coordinator-level handling" },
  { id: "U-F11", note: "measurement flush flushAdsRecoveryEnqueues: deliberately non-transactional; freeze-drain decision needed" },
  { id: "U-F12", note: "CLI families: fenced only where the called service method itself is fenced" },
  { id: "U-F13", note: "per-call-site verification for central-store single-statement methods: unverified sites stay open" },
  { id: "U-F14", note: "schema-migration writers (W-125..W-143): DDL, out of scope; must not run against a frozen / D1-active database" },
  { id: "U-F15", note: "LATENT writers (15 entries): no fence needed until/unless activated; re-check at activation" },
  { id: "U-F16", note: "agent transport epoch forwarding (W-124): forwarding exists but defaults OFF; production transport stays disabled" },
  { id: "U-F17", note: "UNTRACED items U-01..U-10: still open; no coverage claim" },
  { id: "U-F18", note: "post-freeze credential-only reconciliation: detector implemented in d1-stage2-credential-reconciliation.mjs; remains a cutover blocker until independently reviewed" },
  { id: "U-01", note: "live caller of lead-review-queue.purgeExpiredLeads() untraced" },
  { id: "U-02", note: "live trigger of wallet expireCoinHold / expireCoinLot untraced" },
  { id: "U-03", note: "live trigger of referral confirm / applyRefund untraced" },
  { id: "U-04", note: "live caller of initial-confirmation prepare/execute untraced" },
  { id: "U-05", note: "live caller of createWalletFirstSetupDeliveryHandoff untraced" },
  { id: "U-06", note: "production entry point of PortalIdentityDeletionService untraced" },
  { id: "U-07", note: "exact live trigger of insertEdgeRegisteredNodeIfAbsent untraced" },
  { id: "U-08", note: "schema-creation path for the ads-conversion tables untraced" },
  { id: "U-09", note: "completeScheduledPlanSwitch full upstream trigger untraced" },
  { id: "U-10", note: "whether any external caller passes { guarded: true } / writerEpoch to runInTransaction" },
]);

export class FreezeDrainError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "FreezeDrainError";
    this.code = code;
  }
}

function freezeDrainError(code, message) {
  return new FreezeDrainError(code, message);
}

export function isFreezeDrainError(error) {
  return error instanceof FreezeDrainError;
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
    throw freezeDrainError("freeze_snapshot_invalid", "freeze receipts require a synthetic snapshot id (s2s-...)");
  }
  return snapshotId;
}

// Receipt 1 — write lock. Reuses the 1B freeze receipt verbatim.
// What it proves: no concurrent write lock was held while the
// authority row and the high-water mark were read inside one BEGIN
// IMMEDIATE transaction. What it does NOT prove: scheduler
// quiescence, completed async callbacks, durable HWM completeness,
// or safe cross-system freeze. Those are receipts 2–4.
export function buildWriteLockReceipt(db, { snapshotId, checkpointId, outstandingJobs = [], now = () => new Date() } = {}) {
  assertSnapshotId(snapshotId);
  if (typeof checkpointId !== "string" || checkpointId.length === 0) {
    throw freezeDrainError("freeze_checkpoint_invalid", "write-lock receipt requires a non-empty checkpoint id");
  }
  const receipt = buildFreezeReceipt(db, { snapshotId, checkpointId, outstandingJobs, now });
  return {
    kind: "write-lock",
    snapshotId,
    receipt,
    doesNotProve: [
      "scheduler quiescence",
      "completed async callbacks",
      "durable high-water mark completeness",
      "safe cross-system freeze",
    ],
  };
}

// Receipt 2 — scheduler quiescence. evidence maps every scheduler
// job id to true (quiesced with positive evidence) or false. Any
// missing or false entry fails closed.
export function buildSchedulerQuiescenceReceipt({ evidence, snapshotId, now = () => new Date() } = {}) {
  assertSnapshotId(snapshotId);
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    throw freezeDrainError("freeze_scheduler_evidence_invalid", "scheduler quiescence requires per-job evidence");
  }
  const jobs = [];
  for (const job of SCHEDULER_JOBS) {
    if (evidence[job.id] !== true) {
      throw freezeDrainError(
        "freeze_scheduler_not_quiesced",
        `scheduler job is not proven quiesced: ${job.id} (${job.name})`,
      );
    }
    jobs.push({ id: job.id, name: job.name, quiesced: true, evidence: job.evidence });
  }
  return {
    kind: "scheduler-quiescence",
    snapshotId,
    jobs,
    timestamp: now().toISOString(),
    limitations: "positive evidence supplied by the caller; this receipt does not independently observe the production scheduler",
  };
}

// Receipt 3 — callback drain. callbacks is a list of {id,
// description, settled}. Every callback must be settled; duplicate
// ids with conflicting states are an error, not a dedupe.
export function buildCallbackDrainReceipt({ callbacks, snapshotId, now = () => new Date() } = {}) {
  assertSnapshotId(snapshotId);
  if (!Array.isArray(callbacks)) {
    throw freezeDrainError("freeze_callbacks_invalid", "callback drain requires a callback list");
  }
  const seen = new Map();
  for (const callback of callbacks) {
    if (!callback || typeof callback !== "object" || typeof callback.id !== "string" || callback.id.length === 0) {
      throw freezeDrainError("freeze_callbacks_invalid", "each callback requires a non-empty id");
    }
    if (seen.has(callback.id) && seen.get(callback.id) !== callback.settled) {
      throw freezeDrainError("freeze_callback_conflict", `callback ${callback.id} has conflicting settled states`);
    }
    seen.set(callback.id, callback.settled);
    if (callback.settled !== true) {
      throw freezeDrainError("freeze_callback_pending", `callback is not drained: ${callback.id}`);
    }
  }
  return {
    kind: "callback-drain",
    snapshotId,
    drained: seen.size,
    pending: [],
    timestamp: now().toISOString(),
  };
}

// Receipt 4 — high-water mark completeness. The durable HWM seq must
// equal the latest incremental manifest's seq, and the row counts
// must be recorded. A mismatch is a gap, not a warning.
export function buildHwmCompletenessReceipt({ highWaterMark, manifestSeq, rowCounts, snapshotId, now = () => new Date() } = {}) {
  assertSnapshotId(snapshotId);
  if (!highWaterMark || typeof highWaterMark !== "object"
    || !Number.isInteger(highWaterMark.seq) || highWaterMark.seq < 0
    || highWaterMark.snapshotId !== snapshotId) {
    throw freezeDrainError("freeze_hwm_invalid", "HWM completeness requires a high-water mark for this snapshot");
  }
  if (!Number.isInteger(manifestSeq) || manifestSeq < 0 || manifestSeq !== highWaterMark.seq) {
    throw freezeDrainError("freeze_hwm_gap", `HWM seq ${highWaterMark.seq} does not match latest manifest seq ${manifestSeq}`);
  }
  if (!rowCounts || typeof rowCounts !== "object" || Array.isArray(rowCounts)
    || Object.keys(rowCounts).length === 0
    || Object.values(rowCounts).some((n) => !Number.isInteger(n) || n < 0)) {
    throw freezeDrainError("freeze_hwm_invalid", "HWM completeness requires recorded non-negative row counts");
  }
  return {
    kind: "hwm-completeness",
    snapshotId,
    seq: highWaterMark.seq,
    rowCounts: { ...rowCounts },
    timestamp: now().toISOString(),
  };
}

// Receipt validators are shared by bundle construction and verification.
// They enforce positive state independently of the unkeyed bundle digest.
function assertSchedulerQuiescenceReceipt(receipt, snapshotId) {
  if (!receipt || receipt.kind !== "scheduler-quiescence" || receipt.snapshotId !== snapshotId
    || !Array.isArray(receipt.jobs) || receipt.jobs.length !== SCHEDULER_JOBS.length) {
    throw freezeDrainError("freeze_scheduler_not_quiesced", "scheduler receipt must cover every known job for this snapshot");
  }
  const expected = new Map(SCHEDULER_JOBS.map((job) => [job.id, job]));
  const seen = new Set();
  for (const job of receipt.jobs) {
    if (!job || typeof job !== "object" || Array.isArray(job) || typeof job.id !== "string"
      || seen.has(job.id)) {
      throw freezeDrainError("freeze_scheduler_not_quiesced", "scheduler receipt contains a malformed or duplicate job");
    }
    const definition = expected.get(job.id);
    if (!definition || job.quiesced !== true || job.name !== definition.name
      || job.evidence !== definition.evidence
      || Object.keys(job).sort().join(",") !== "evidence,id,name,quiesced") {
      throw freezeDrainError("freeze_scheduler_not_quiesced", "every known scheduler job must carry its positive quiesced evidence");
    }
    seen.add(job.id);
  }
  if (seen.size !== SCHEDULER_JOBS.length) {
    throw freezeDrainError("freeze_scheduler_not_quiesced", "scheduler receipt is missing one or more known jobs");
  }
}

function assertCallbackDrainReceipt(receipt, snapshotId) {
  if (!receipt || receipt.kind !== "callback-drain" || receipt.snapshotId !== snapshotId
    || !Number.isInteger(receipt.drained) || receipt.drained < 0
    || !Array.isArray(receipt.pending)) {
    throw freezeDrainError("freeze_callbacks_invalid", "callback-drain receipt is malformed");
  }
  if (receipt.pending.length !== 0) {
    throw freezeDrainError("freeze_callback_pending", "callback-drain receipt still contains pending callbacks");
  }
}

function assertHwmCompletenessReceipt(receipt, snapshotId) {
  if (!receipt || receipt.kind !== "hwm-completeness" || receipt.snapshotId !== snapshotId
    || !Number.isInteger(receipt.seq) || receipt.seq < 0
    || !receipt.rowCounts || typeof receipt.rowCounts !== "object" || Array.isArray(receipt.rowCounts)) {
    throw freezeDrainError("freeze_hwm_invalid", "HWM completeness receipt is malformed");
  }
  const counts = Object.entries(receipt.rowCounts);
  if (counts.length === 0 || counts.some(([table, count]) =>
    !/^[A-Za-z_][A-Za-z0-9_]*$/.test(table) || !Number.isInteger(count) || count < 0)) {
    throw freezeDrainError("freeze_hwm_invalid", "HWM row counts must be named, non-negative integers");
  }
}

function computeFreezeBundleHash(bundle) {
  const { bundleHash: _bundleHash, ...unsigned } = bundle;
  return sha256Hex(canonicalJson(unsigned));
}

// Bundle the four receipts. Verifies each receipt before bundling.
// The bundle explicitly never transitions phase: phaseTransition is
// always "none". The FROZEN transition is a separate coordinator
// decision with its own receipt.
//
// N5 (PR #932 r4701898636): the bundle optionally carries the A2/A3
// credential manifest hash (credentialManifestHash). When present it
// is part of the digest-covered bundle, so the coordinator's T1
// freeze can re-read the live credential manifest and refuse the
// freeze when the manifest moved after A3 — an in-place credential
// rotation is invisible to the row-count/updated_at high-water mark.
// The field is optional here (older bundles still verify); the T1
// gate itself is fail-closed and refuses a bundle that does not
// carry it.
function assertCredentialManifestHash(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw freezeDrainError("freeze_bundle_invalid", "credential manifest hash must be a SHA-256 hex digest");
  }
  return value;
}

export function buildFreezeReadinessBundle({
  snapshotId,
  writeLock,
  schedulerQuiescence,
  callbackDrain,
  hwmCompleteness,
  credentialManifestHash,
  now = () => new Date(),
} = {}) {
  assertSnapshotId(snapshotId);
  if (!writeLock || writeLock.kind !== "write-lock" || writeLock.snapshotId !== snapshotId) {
    throw freezeDrainError("freeze_bundle_incomplete", "freeze readiness bundle requires a write-lock receipt for this snapshot");
  }
  verifyFreezeReceipt(writeLock.receipt);
  for (const [receipt, kind] of [
    [schedulerQuiescence, "scheduler-quiescence"],
    [callbackDrain, "callback-drain"],
    [hwmCompleteness, "hwm-completeness"],
  ]) {
    if (!receipt || receipt.kind !== kind || receipt.snapshotId !== snapshotId) {
      throw freezeDrainError("freeze_bundle_incomplete", "freeze readiness bundle requires a " + kind + " receipt for this snapshot");
    }
  }
  assertSchedulerQuiescenceReceipt(schedulerQuiescence, snapshotId);
  assertCallbackDrainReceipt(callbackDrain, snapshotId);
  assertHwmCompletenessReceipt(hwmCompleteness, snapshotId);
  const bundle = {
    schemaVersion: FREEZE_DRAIN_SCHEMA_VERSION,
    snapshotId,
    receipts: { writeLock, schedulerQuiescence, callbackDrain, hwmCompleteness },
    phaseTransition: "none",
    ...(credentialManifestHash === undefined
      ? {}
      : { credentialManifestHash: assertCredentialManifestHash(credentialManifestHash) }),
    timestamp: now().toISOString(),
  };
  bundle.bundleHash = computeFreezeBundleHash(bundle);
  return bundle;
}

// Recompute the digest over the complete bundle, including every field
// of all four receipts. Positive scheduler, callback and HWM conditions
// are revalidated before accepting the digest.
export function verifyFreezeReadinessBundle(bundle) {
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)
    || bundle.schemaVersion !== FREEZE_DRAIN_SCHEMA_VERSION
    || typeof bundle.snapshotId !== "string"
    || bundle.phaseTransition !== "none"
    || typeof bundle.bundleHash !== "string"
    || !bundle.receipts || typeof bundle.receipts !== "object" || Array.isArray(bundle.receipts)) {
    throw freezeDrainError("freeze_bundle_invalid", "freeze readiness bundle is malformed");
  }
  assertSnapshotId(bundle.snapshotId);
  const { writeLock, schedulerQuiescence, callbackDrain, hwmCompleteness } = bundle.receipts;
  if (!writeLock || writeLock.kind !== "write-lock" || writeLock.snapshotId !== bundle.snapshotId) {
    throw freezeDrainError("freeze_bundle_invalid", "freeze readiness bundle is missing its write-lock receipt");
  }
  verifyFreezeReceipt(writeLock.receipt);
  for (const [receipt, kind] of [
    [schedulerQuiescence, "scheduler-quiescence"],
    [callbackDrain, "callback-drain"],
    [hwmCompleteness, "hwm-completeness"],
  ]) {
    if (!receipt || receipt.kind !== kind || receipt.snapshotId !== bundle.snapshotId) {
      throw freezeDrainError("freeze_bundle_invalid", "freeze readiness bundle is missing its " + kind + " receipt");
    }
  }
  assertSchedulerQuiescenceReceipt(schedulerQuiescence, bundle.snapshotId);
  assertCallbackDrainReceipt(callbackDrain, bundle.snapshotId);
  assertHwmCompletenessReceipt(hwmCompleteness, bundle.snapshotId);
  if (bundle.credentialManifestHash !== undefined) {
    assertCredentialManifestHash(bundle.credentialManifestHash);
  }
  const expected = computeFreezeBundleHash(bundle);
  if (expected !== bundle.bundleHash) {
    throw freezeDrainError("freeze_bundle_hash_mismatch", "freeze readiness bundle hash does not match its complete contents");
  }
  return { valid: true };
}

// Coverage report over the unfenced-writer baseline. fencedIds lists
// the baseline ids fenced since the 1B inventory; everything else
// stays open. Unknown ids are an error, not ignored.
export function buildUnfencedWriterCoverage({ fencedIds = [] } = {}) {
  const known = new Set(UNFENCED_WRITER_BASELINE.map((entry) => entry.id));
  for (const id of fencedIds) {
    if (!known.has(id)) {
      throw freezeDrainError("freeze_coverage_unknown", `unknown unfenced-writer id: ${id}`);
    }
  }
  const fenced = new Set(fencedIds);
  const entries = UNFENCED_WRITER_BASELINE.map((entry) => ({
    id: entry.id,
    note: entry.note,
    status: fenced.has(entry.id) ? "fenced" : "open",
  }));
  return {
    total: entries.length,
    fencedCount: entries.filter((entry) => entry.status === "fenced").length,
    openCount: entries.filter((entry) => entry.status === "open").length,
    entries,
  };
}
