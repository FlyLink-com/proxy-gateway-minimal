// D1 Stage 2 — freeze execution harness (D6).
//
// The in-process executor for the R10 §5 freeze procedure
// (decisions/D4_SCHEDULER_7ITEMS_DISPOSITION_R10_2026-11-24.md §5):
// A0 (assign ids, verify authority, build coverage matrix) → A1 (T-2:
// stop the schedulers, run the lead-purge CLI steps A–C, check no
// referral-policy CLI process runs) → A2 (T-3: build the freeze
// write-lock receipt FIRST, then the drain proof —
// getInFlightStatus() reads 0 plus two equal high-water-mark
// observations 60 s apart, each required to equal the lock receipt's
// HWM) → A3 (T-4: markSchedulerQuiesced() plus the four receipts and
// the readiness bundle; the bundle's write-lock receipt is built
// fresh and its HWM must still equal the A2 lock receipt's HWM) → B
// (T1: measurement drain, then coordinator.freeze(), then post-freeze
// purge-CLI steps D–E as fence verification).
//
// Everything the procedure needs is built live inside this process
// from the startup-held wiring (the control-database handle, the
// scheduler references, the traffic-accounting service, the
// coin-commerce store). The executor never accepts a
// caller-fabricated bundle, matrix or receipt: the write-lock receipt
// and the scheduler evidence can only be built live. Phase C (the
// D-2 snapshot instruction) is out of scope for this module; the
// operator issues it separately after the freeze, using the receipts
// this executor returns.
//
// Fail-closed throughout: any check that does not match its expected
// value stops the execution immediately with a coded error and the
// evidence collected so far attached to the error
// (error.executionEvidence). Scheduler stops are terminal in-process
// (a stopped coordinator cannot be re-armed), so a failed freeze
// needs a process restart before any retry — the error says so.
//
// The two long waits (the W-115 ≥60 s tick observation and the A2
// 60 s HWM interval) are real sleeps by default; tests inject a fake
// `sleep`. The purge-CLI runner and the referral-CLI process check
// are injectable for the same reason; their defaults run the real
// `scripts/platform-lead-retention.mjs` CLI and the real `ps`.

import { execFile, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  buildWriterCoverageMatrix,
  createDrainTracker,
  readCoordinatorLog,
  verifyCoordinatorLog,
  readSnapshotGateLog
} from "./d1-card9-freeze-drain-coordinator.mjs";
import {
  buildCallbackDrainReceipt,
  buildFreezeReadinessBundle,
  buildHwmCompletenessReceipt,
  buildSchedulerQuiescenceReceipt,
  buildWriteLockReceipt,
  SCHEDULER_JOBS
} from "./d1-stage2-freeze-drain.mjs";
import { ensureDeltaJournal, readJournalEntries } from "./d1-card8-delta-journal.mjs";
import { readHighWaterMark } from "./writer-freeze-receipt.mjs";
import {
  assertCredentialVersionTrackingInstalled,
  buildCredentialVersionManifest,
  detectCredentialRotations,
  isCredentialReconciliationError,
} from "./d1-stage2-credential-reconciliation.mjs";

export const D1_FREEZE_EXECUTION_SCHEMA_VERSION = "d1-freeze-execution/v1";

// R7-approved coverage inputs, verbatim
// (decisions/D3_28_ITEMS_DISPOSITION_R7_2026-11-24.md). U-F17 is
// fenced by derivation (all U-01..U-10 fenced), never set directly.
export const D1_FREEZE_COVERAGE_FENCED = Object.freeze([
  "U-F1", "U-F2", "U-F3", "U-F4", "U-F5", "U-F6", "U-F7", "U-F8",
  "U-F10", "U-F11", "U-F12", "U-F13", "U-F16", "U-F18",
  "U-01", "U-02", "U-03", "U-04", "U-05", "U-06", "U-07", "U-08",
  "U-09", "U-10"
]);
// U (PR #906 r4662139139): every fenced claim needs an evidence
// ref. The single ref for all 24 R7-fenced ids is the R7 disposition
// record itself — the same record that already authorizes the
// disposition (the record lives in the workspace decisions folder,
// not in the repo, like the waiver authorization id below).
export const D1_FREEZE_COVERAGE_FENCED_REF =
  "decisions/D3_28_ITEMS_DISPOSITION_R7_2026-11-24.md (R7-approved writer dispositions)";
export const D1_FREEZE_COVERAGE_FENCED_REFS = Object.freeze(
  Object.fromEntries(D1_FREEZE_COVERAGE_FENCED.map((id) => [id, D1_FREEZE_COVERAGE_FENCED_REF])),
);
// Approved waiver-authorization allowlist (single source of truth
// for the U-F15 waiver ref below). There is no live authorization
// record store in-process to check against, so this allowlist IS the
// check: the A0 gate refuses any waiver ref that is not on it
// (fail-closed). When the authorization is superseded, replace the
// entry here — in this one place — and the waiver below follows it;
// a supersede that forgets this update fails the freeze loudly
// instead of silently waiving on a stale record. Residual limitation:
// the allowlist cannot itself detect a supersede; that stays an
// operator step (update this list when Yi issues a new authorization).
export const D1_FREEZE_COVERAGE_WAIVER_AUTHORIZATION_IDS = Object.freeze([
  "yi-2026-11-23-0943-cst-d1-landing-authorization"
]);
export const D1_FREEZE_COVERAGE_WAIVERS = Object.freeze({
  "U-F15": D1_FREEZE_COVERAGE_WAIVER_AUTHORIZATION_IDS[0]
});
export const D1_FREEZE_COVERAGE_OUT_OF_SCOPE = Object.freeze({
  "U-F9": "Schema-ensure DDL (W-139…W-143) is DDL, not business writes — explicitly out of fence scope; it must run while BWH_ACTIVE by operator discipline.",
  "U-F14": "DDL, not business writes; explicitly out of scope. Migrations run offline by operator and must not run against a frozen / D1-active database — operator discipline until the follow-up defines migration gating."
});
// Expected matrix counts, derived from the same approved inputs
// above — never literals. The matrix builder counts the derived
// U-F17 entry, so for the current disposition the fenced count is 24
// explicit entries + 1 derived = 25. Any disposition change moves
// the expectation with it; the A0 gate compares the live matrix
// against this derivation, so the counts cannot go stale while the
// inputs stay current.
export function deriveFreezeCoverageExpectedCounts() {
  return buildWriterCoverageMatrix({
    fenced: { ...D1_FREEZE_COVERAGE_FENCED_REFS },
    waivers: { ...D1_FREEZE_COVERAGE_WAIVERS },
    outOfScope: { ...D1_FREEZE_COVERAGE_OUT_OF_SCOPE }
  }).counts;
}
export const D1_FREEZE_COVERAGE_EXPECTED_COUNTS = Object.freeze(deriveFreezeCoverageExpectedCounts());

const SNAPSHOT_ID_PATTERN = /^s2s-[a-z0-9-]{3,80}$/;
const OBSERVATION_INTERVAL_MS = 60000;
const DRAIN_TIMEOUT_MS = 600000;
const INFLIGHT_POLL_INTERVAL_MS = 2000;
const INFLIGHT_POLL_TIMEOUT_MS = 60000;
const WELCOME_SETTLE_POLL_INTERVAL_MS = 1000;
const PURGE_CLI_TIMEOUT_MS = 60000;
const PS_TIMEOUT_MS = 30000;
const PURGE_CLI_SCRIPT = "scripts/platform-lead-retention.mjs";
const REFERRAL_POLICY_CLI_NAME = "platform-portal-referral-policy";

export class FreezeExecutorError extends Error {
  constructor(code, message, executionEvidence) {
    super(message);
    this.name = "FreezeExecutorError";
    this.code = code;
    if (executionEvidence !== undefined) {
      this.executionEvidence = executionEvidence;
    }
  }
}

function freezeExecutorError(code, message, executionEvidence) {
  return new FreezeExecutorError(code, message, executionEvidence);
}

// Both high-water marks come from the same readHighWaterMark()
// builder, so their JSON serializations are deterministic and
// comparable field by field.
function sameHighWaterMark(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// N1 (PR #927 r4697535888): credential version tracking gate.
//
// platform_portal_edge_credentials has no updated_at column, so an
// in-place rotation (same PK, same row count) is invisible to the
// per-table (rowCount, max(updated_at)) high-water mark. Before A2
// accepts HWM stability it must prove tracking is installed and
// verified, and the credential version manifest — the complete
// fingerprint over (pk, version, deleted, origin) — must be
// identical at the lock and at every drain observation.
//
// readCredentialManifest is verify-only: it never installs tracking.
// Installing the triggers is a schema change the operator performs
// before the round (with backfillCredentialVersions for rows that
// predate tracking). Any failure — missing version table, missing
// trigger, untracked live row, orphaned version — refuses the freeze
// with freeze_credential_tracking_missing instead of freezing on a
// blind HWM. A backfilled baseline is accepted (its weak-baseline
// flag is recorded in the evidence as backfilledCount): rotations
// before tracking stay invisible, rotations during the drain are not.
function readCredentialManifest(db, snapshotId, evidence) {
  try {
    assertCredentialVersionTrackingInstalled(db);
    return buildCredentialVersionManifest(db, { snapshotId });
  } catch (error) {
    if (isCredentialReconciliationError(error)) {
      // Only the inner error code enters the message: the inner
      // message may name a credential row, and this message is
      // surfaced verbatim into the freeze refusal response.
      throw freezeExecutorError(
        "freeze_credential_tracking_missing",
        `credential version tracking is not installed or not verifiable (${error.code}) — install credential version tracking and backfill pre-existing credential rows before freezing; do not freeze on a high-water mark that cannot see in-place credential rotations`,
        evidence
      );
    }
    throw error;
  }
}

// The manifest comparison for one drain observation. Only counts are
// reported (rotated/added/deleted); no credential PK or value ever
// enters the message.
function assertSameCredentialManifest(lockManifest, observedManifest, evidence) {
  if (observedManifest.manifestHash === lockManifest.manifestHash) return;
  let diffSummary = "";
  try {
    const diff = detectCredentialRotations(lockManifest, observedManifest);
    diffSummary = `, rotated ${diff.rotated.length}, added ${diff.added.length}, deleted ${diff.deleted.length}`;
  } catch {
    diffSummary = "";
  }
  throw freezeExecutorError(
    "freeze_credential_version_moved",
    `credential versions moved during the A2 drain (manifest hash ${lockManifest.manifestHash.slice(0, 12)}… -> ${observedManifest.manifestHash.slice(0, 12)}…${diffSummary}) — an in-place credential rotation is invisible to the row-count/updated_at high-water mark, so the freeze is refused; stop and report, do not freeze on a moved credential manifest`,
    evidence
  );
}

// Boot-date snapshot id (R10 §5 A0 step 1): the deployment restart
// happens on execution day, so the boot date is the execution date.
// This is only the BASE id: a second freeze the same day no longer
// needs a human to hand-append -<n> — see resolveFreezeSnapshotId,
// which mints the next free -r<n> suffix from the live durable logs
// at boot (start.mjs), and the executor's freeze_snapshot_id_conflict
// guard, which refuses an explicitly supplied id that is already used.
export function deriveFreezeSnapshotId(date = new Date()) {
  const stamp = date.toISOString().slice(0, 10).replaceAll("-", "");
  return `s2s-d1-freeze-${stamp}`;
}

// Snapshot ids already used by an earlier freeze, read live from the
// durable logs (coordinator log T1 entries + snapshot-gate log).
// Read-only: neither reader creates its table on a fresh database.
export function collectUsedFreezeSnapshotIds(db) {
  const used = new Set();
  for (const entry of readCoordinatorLog(db)) {
    if (typeof entry?.snapshotId === "string") used.add(entry.snapshotId);
  }
  for (const entry of readSnapshotGateLog(db)) {
    if (typeof entry?.snapshotId === "string") used.add(entry.snapshotId);
  }
  return [...used];
}

// Mint a free snapshot id from a base id: the base itself when unused,
// otherwise the next free -r<n> suffix (an already-suffixed base
// continues its own numbering: X-r2 taken -> X-r3). The result always
// matches s2s-[a-z0-9-]{3,80}, so checkpoint derivation and the route
// pattern keep working unchanged.
export function resolveFreezeSnapshotId(snapshotId, usedSnapshotIds = []) {
  if (typeof snapshotId !== "string" || !SNAPSHOT_ID_PATTERN.test(snapshotId)) {
    throw freezeExecutorError("freeze_validation_error", `snapshotId must match s2s-[a-z0-9-]{3,80}, got ${JSON.stringify(snapshotId)}`);
  }
  const used = new Set(usedSnapshotIds);
  if (!used.has(snapshotId)) return snapshotId;
  const stemMatch = snapshotId.match(/^(.*?)-r(\d+)$/);
  const stem = stemMatch ? stemMatch[1] : snapshotId;
  let n = stemMatch ? Number(stemMatch[2]) + 1 : 2;
  let candidate = `${stem}-r${n}`;
  while (used.has(candidate)) {
    n += 1;
    candidate = `${stem}-r${n}`;
  }
  if (!SNAPSHOT_ID_PATTERN.test(candidate)) {
    throw freezeExecutorError("freeze_validation_error", `no free snapshot id derivable from ${JSON.stringify(snapshotId)} within s2s-[a-z0-9-]{3,80}`);
  }
  return candidate;
}

// Checkpoint id derives from the date digits embedded in the
// snapshot id, so a suffixed id (s2s-d1-freeze-20261125-r2) keeps the
// same checkpoint as its base (chk-d1-freeze-20261125).
export function deriveFreezeCheckpointId(snapshotId, date = new Date()) {
  const match = typeof snapshotId === "string" ? snapshotId.match(/(\d{8})/) : null;
  const stamp = match ? match[1] : date.toISOString().slice(0, 10).replaceAll("-", "");
  return `chk-d1-freeze-${stamp}`;
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runProcess(command, args, { env = {}, timeoutMs }) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      timeout: timeoutMs,
      killSignal: "SIGKILL"
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (error) => {
      resolve({ exitCode: null, stdout, stderr: `${stderr}${String(error?.message || error)}`, timedOut });
    });
    child.on("close", (code) => {
      resolve({ exitCode: code, stdout, stderr, timedOut });
    });
    if (timeoutMs) {
      setTimeout(() => {
        timedOut = true;
        try { child.kill("SIGKILL"); } catch { /* already gone */ }
      }, timeoutMs).unref?.();
    }
  });
}

// Default W-119 runner: the real lead-purge CLI (R7 §5 steps A/B/D/E).
// The CLI opens the database by path itself (read-only for dry-run);
// the executor passes the control-database path through the same
// SUBSCRIPTION_CONTROL_DB_PATH variable the service itself uses.
export async function defaultRunPurgeCli({ dbPath, apply = false } = {}) {
  const rootDir = fileURLToPath(new URL("../../../", import.meta.url));
  const script = `${rootDir}${PURGE_CLI_SCRIPT}`;
  const args = [script, "purge"];
  if (apply) args.push("--apply");
  const result = await runProcess(process.execPath, args, {
    env: { SUBSCRIPTION_CONTROL_DB_PATH: dbPath },
    timeoutMs: PURGE_CLI_TIMEOUT_MS
  });
  return {
    command: `${process.execPath} ${args.join(" ")}`,
    apply,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: result.timedOut
  };
}

// Default W-120 check: `ps` must show no referral-policy CLI process
// running. Fails closed when `ps` itself cannot run: absence cannot
// be proven then.
export async function defaultCheckReferralCliProcess() {
  const command = "ps -eo pid,args";
  const output = await new Promise((resolve) => {
    execFile("ps", ["-eo", "pid,args"], { timeout: PS_TIMEOUT_MS }, (error, stdout, stderr) => {
      resolve({ error, stdout: String(stdout || ""), stderr: String(stderr || "") });
    });
  });
  if (output.error) {
    throw freezeExecutorError(
      "freeze_referral_cli_check_failed",
      `cannot prove no referral-policy CLI process is running: ps failed (${output.error?.message || output.error})`
    );
  }
  const matches = output.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.includes(REFERRAL_POLICY_CLI_NAME))
    .map((line) => {
      const [pid, ...rest] = line.split(/\s+/);
      return { pid, args: rest.join(" ") };
    });
  return { command, found: matches.length > 0, matches };
}

function parsePurgeReceipt(run, step) {
  let parsed = null;
  try {
    parsed = JSON.parse(String(run.stdout || "").trim());
  } catch {
    parsed = null;
  }
  return { step, command: run.command, exitCode: run.exitCode, timedOut: run.timedOut, stdout: run.stdout, stderr: run.stderr, parsed };
}

function assertPurgeReceipt(receipt, { mode, status, exitCode }) {
  const parsed = receipt.parsed;
  if (receipt.timedOut || receipt.exitCode !== exitCode || !parsed
    || parsed.command !== "purge" || parsed.mode !== mode || parsed.status !== status) {
    throw freezeExecutorError(
      "freeze_purge_cli_mismatch",
      `lead-purge CLI step ${receipt.step} did not match its expected receipt (mode ${mode}, status ${status}, exit ${exitCode}); got exit ${receipt.exitCode} and stdout ${JSON.stringify(receipt.stdout)}`
    );
  }
  return parsed;
}

function assertNonEmptyString(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    throw freezeExecutorError("freeze_validation_error", `${field} must be a non-empty string`);
  }
  return value;
}

function assertOutstandingJobs(jobs) {
  if (!Array.isArray(jobs)) {
    throw freezeExecutorError("freeze_validation_error", "outstandingJobs must be an array of { ref, kind }");
  }
  for (const [index, job] of jobs.entries()) {
    if (!job || typeof job !== "object" || Array.isArray(job)
      || typeof job.ref !== "string" || job.ref.length === 0
      || typeof job.kind !== "string" || job.kind.length === 0) {
      throw freezeExecutorError("freeze_validation_error", `outstandingJobs[${index}] requires a non-empty ref and kind`);
    }
  }
  return jobs;
}

export function createD1FreezeExecutor({
  db,
  coordinator,
  deferredSnapshot = null,
  trafficAccounting = null,
  coinCommerceStore = null,
  dbPath = null,
  // Which schedulers the process was configured to run (from state).
  // A ref absent while its flag is true is a wiring defect and fails
  // closed; a ref absent while its flag is false is vacuously
  // quiesced (the job was never created in this process) and is
  // recorded as such.
  schedulerEnabled = {},
  rotationCreation = null,
  now = () => new Date(),
  sleep = defaultSleep,
  runPurgeCli = defaultRunPurgeCli,
  checkReferralCliProcess = defaultCheckReferralCliProcess,
  // Latest incremental manifest seq for this snapshot. The default
  // (no manifest source wired) is 0: the A3 gate then requires an
  // empty journal for this snapshot — the fresh-snapshot shape — and
  // fails closed on any journal entry. Production has no manifest
  // source wired yet; wire one before any round whose journal for
  // that snapshot is non-empty, or the gate will (correctly) refuse.
  manifestSeqProvider = () => 0,
  drainTimeoutMs = DRAIN_TIMEOUT_MS,
  observationIntervalMs = OBSERVATION_INTERVAL_MS,
  inflightPollIntervalMs = INFLIGHT_POLL_INTERVAL_MS,
  inflightPollTimeoutMs = INFLIGHT_POLL_TIMEOUT_MS,
  welcomeSettlePollIntervalMs = WELCOME_SETTLE_POLL_INTERVAL_MS
} = {}) {
  if (!db || typeof db.prepare !== "function" || typeof db.transaction !== "function") {
    throw freezeExecutorError("freeze_validation_error", "freeze executor requires the control-database handle (db.prepare / db.transaction)");
  }
  if (!coordinator || typeof coordinator.freeze !== "function" || typeof coordinator.snapshotId !== "string") {
    throw freezeExecutorError("freeze_validation_error", "freeze executor requires the startup-held freeze coordinator");
  }

  const timestamp = () => now().toISOString();
  const wiring = coordinator.scheduler || {};
  const enabled = {
    coinCommerce: schedulerEnabled.coinCommerce === true,
    welcomeBonus: schedulerEnabled.welcomeBonus === true,
    rotation: schedulerEnabled.rotation === true,
    deferred: schedulerEnabled.deferred === true,
    portalReferrals: schedulerEnabled.portalReferrals === true
  };

  async function executeFreeze(input = {}) {
    const evidence = { steps: {} };
    try {
      return await runFreeze(input, evidence);
    } catch (error) {
      if (error && typeof error === "object" && error.executionEvidence === undefined) {
        error.executionEvidence = evidence;
      }
      throw error;
    }
  }

  async function runFreeze(input, evidence) {
    const snapshotId = input.snapshotId ?? coordinator.snapshotId;
    const checkpointId = input.checkpointId ?? deriveFreezeCheckpointId(snapshotId, now());
    const outstandingJobs = assertOutstandingJobs(input.outstandingJobs ?? []);
    const t0ChecklistLine = typeof input.t0ChecklistLine === "string" && input.t0ChecklistLine.length > 0
      ? input.t0ChecklistLine
      : null;
    if (!SNAPSHOT_ID_PATTERN.test(snapshotId)) {
      throw freezeExecutorError("freeze_validation_error", `snapshotId must match s2s-[a-z0-9-]{3,80}, got ${JSON.stringify(snapshotId)}`, evidence);
    }
    assertNonEmptyString(checkpointId, "checkpointId");
    evidence.snapshotId = snapshotId;
    evidence.checkpointId = checkpointId;
    evidence.outstandingJobs = outstandingJobs;

    // ---- A0: assign ids, verify authority, build coverage matrix ----
    // Confirm-then-write: confirm the live authority state (BWH /
    // BWH_ACTIVE) and record the confirmed epoch value; the freeze
    // itself writes confirmed epoch + 1 via the coordinator, whose
    // durable guard enforces +1. No epoch value is ever assumed here.
    const authority = coordinator.currentAuthority();
    if (authority.authority !== "BWH" || authority.phase !== "BWH_ACTIVE") {
      throw freezeExecutorError(
        "freeze_authority_mismatch",
        `freeze requires authority BWH / phase BWH_ACTIVE (verify only, never install); got ${JSON.stringify({ authority: authority.authority, phase: authority.phase, epoch: authority.epoch })}`,
        evidence
      );
    }
    evidence.steps.a0Authority = { authority: authority.authority, phase: authority.phase, epoch: authority.epoch, at: timestamp() };

    // Refuse a missing/corrupt history before terminal scheduler stops.
    // T1 checks it again in the same transaction as the state change.
    verifyCoordinatorLog(db);

    // An explicitly supplied snapshot id that a previous freeze
    // already used is refused here, before any scheduler is stopped:
    // reusing it would write a second T1 under the same id and break
    // the journal / snapshot-gate binding for the earlier round. The
    // boot path never reaches this — start.mjs resolves a free id
    // first — so this only fires on a stale explicit id (e.g. a route
    // body repeating yesterday's id). A retry after a failed freeze is
    // unaffected: a failed freeze writes no T1 entry, so its id is
    // still free.
    const usedSnapshotIds = collectUsedFreezeSnapshotIds(db);
    evidence.steps.a0SnapshotId = { snapshotId, alreadyUsed: usedSnapshotIds.includes(snapshotId), at: timestamp() };
    if (usedSnapshotIds.includes(snapshotId)) {
      throw freezeExecutorError(
        "freeze_snapshot_id_conflict",
        `snapshotId ${snapshotId} was already used by an earlier freeze (coordinator / snapshot-gate log); retry without an explicit snapshotId so the boot-derived id is used, or supply a fresh id`,
        evidence
      );
    }

    const coverageMatrix = input.coverageMatrix ?? buildWriterCoverageMatrix({
      fenced: { ...D1_FREEZE_COVERAGE_FENCED_REFS },
      waivers: { ...D1_FREEZE_COVERAGE_WAIVERS },
      outOfScope: { ...D1_FREEZE_COVERAGE_OUT_OF_SCOPE }
    });
    const counts = {
      open: coverageMatrix.counts?.open ?? -1,
      fenced: coverageMatrix.counts?.fenced ?? -1,
      waived: coverageMatrix.counts?.waived ?? -1,
      outOfScope: coverageMatrix.counts?.outOfScope ?? -1
    };
    // Expected counts derived from the same approved inputs (F20):
    // never literals, so a disposition change moves the expectation
    // with it. The U-F17 derived entry is counted by the builder, so
    // the current expectation is { open: 0, fenced: 25, waived: 1,
    // outOfScope: 2 } (24 explicit fenced + 1 derived).
    const expectedCounts = deriveFreezeCoverageExpectedCounts();
    evidence.steps.a0Coverage = {
      counts,
      expectedCounts,
      cutoverBlocked: coverageMatrix.cutoverBlocked,
      openIds: coverageMatrix.openIds,
      matrixDigest: coverageMatrix.matrixDigest,
      at: timestamp()
    };
    // Waiver refs must cite an authorization on the approved
    // allowlist: a waiver citing an unknown (superseded, mistyped)
    // authorization record is a fail-closed refusal, never a pass.
    const unknownWaiver = (coverageMatrix.entries ?? []).find(
      (entry) => entry.status === "waived" && !D1_FREEZE_COVERAGE_WAIVER_AUTHORIZATION_IDS.includes(entry.evidence?.ref)
    );
    if (unknownWaiver) {
      throw freezeExecutorError(
        "freeze_coverage_waiver_unknown",
        `writer coverage waiver for ${unknownWaiver.id} cites authorization ${JSON.stringify(unknownWaiver.evidence?.ref)} which is not on the approved waiver-authorization allowlist`,
        evidence
      );
    }
    // Checked BEFORE any scheduler is stopped: stops are terminal
    // in-process, so a coverage refusal must happen while everything
    // is still running.
    if (coverageMatrix.cutoverBlocked
      || counts.open !== expectedCounts.open
      || counts.fenced !== expectedCounts.fenced
      || counts.waived !== expectedCounts.waived
      || counts.outOfScope !== expectedCounts.outOfScope) {
      throw freezeExecutorError(
        "freeze_coverage_open",
        `cannot freeze: writer coverage is not fully fenced (counts ${JSON.stringify(counts)}, expected ${JSON.stringify(expectedCounts)}, cutoverBlocked ${coverageMatrix.cutoverBlocked}, open ${JSON.stringify(coverageMatrix.openIds)})`,
        evidence
      );
    }

    const tracker = createDrainTracker({ timeoutMs: drainTimeoutMs, now });
    const gateEntries = readSnapshotGateLog(db)
      .filter((entry) => entry.kind === "instruction" && entry.snapshotId === snapshotId);
    const snapshotGateIdle = gateEntries.length === 0;
    evidence.steps.a0SnapshotGate = { idle: snapshotGateIdle, instructionsForSnapshot: gateEntries.length, at: timestamp() };
    if (!snapshotGateIdle) {
      throw freezeExecutorError("freeze_snapshot_gate_busy", `snapshot gate already holds an instruction for ${snapshotId}`, evidence);
    }

    const schedulerJobs = {};
    const schedulerEvidence = {};

    function absentJob(jobId, reason) {
      schedulerJobs[jobId] = { created: false, reason, at: timestamp() };
      schedulerEvidence[jobId] = true;
    }
    function requireRef(jobId, ref, flagName) {
      if (ref) return ref;
      if (enabled[flagName]) {
        throw freezeExecutorError(
          "freeze_scheduler_wiring_missing",
          `scheduler job ${jobId} is enabled but its live reference is missing from the freeze wiring`,
          evidence
        );
      }
      return null;
    }

    // ---- A1 (T-2): stop the schedulers, purge CLI A–C, ps check ----
    // W-111 coin-commerce coordinator.
    const commerceRef = requireRef("W-111", wiring.coinCommerceCoordinator ?? null, "coinCommerce");
    if (commerceRef) {
      const pre = commerceRef.getStatus();
      const stopCalledAt = timestamp();
      await commerceRef.stop();
      const stopResolvedAt = timestamp();
      const post = commerceRef.getStatus();
      schedulerJobs["W-111"] = { created: true, pre, stopCalledAt, stopResolvedAt, post };
      if (post.timerArmed !== false || post.inFlightSettled !== true) {
        throw freezeExecutorError("freeze_scheduler_not_quiesced", `W-111 coin-commerce coordinator did not settle after stop(): ${JSON.stringify(post)}`, evidence);
      }
      schedulerEvidence["W-111"] = true;
    } else {
      absentJob("W-111", "coin-commerce coordinator was not created in this process (coinsCommerceEnabled is false)");
    }

    // W-112 welcome-bonus coordinator. stop() alone does not wait for
    // the pass in flight, so poll getStatus() until activePassSettled.
    const welcomeRef = requireRef("W-112", wiring.welcomeBonusCoordinator ?? null, "welcomeBonus");
    if (welcomeRef) {
      const pre = welcomeRef.getStatus();
      const stopCalledAt = timestamp();
      await welcomeRef.stop();
      const stopResolvedAt = timestamp();
      let post = welcomeRef.getStatus();
      let polls = 0;
      while (post.activePassSettled !== true) {
        if (tracker.status().elapsedMs >= drainTimeoutMs) {
          throw freezeExecutorError("freeze_drain_timeout", `W-112 welcome-bonus pass did not settle within the drain timeout (${drainTimeoutMs} ms)`, evidence);
        }
        await sleep(welcomeSettlePollIntervalMs);
        polls += 1;
        post = welcomeRef.getStatus();
      }
      schedulerJobs["W-112"] = { created: true, pre, stopCalledAt, stopResolvedAt, post, settlePolls: polls };
      if (post.timerArmed !== false) {
        throw freezeExecutorError("freeze_scheduler_not_quiesced", `W-112 welcome-bonus timer still armed after stop(): ${JSON.stringify(post)}`, evidence);
      }
      schedulerEvidence["W-112"] = true;
    } else {
      absentJob("W-112", "welcome-bonus coordinator was not created in this process (registrationWelcomeCoinsWorkerEnabled is false)");
    }

    // W-113 deferred-transition coordinator. It has no getStatus; the
    // positive evidence is the stop() call timestamp, the awaited
    // resolve timestamp, and the T-0 checklist line when the operator
    // supplies one.
    const deferredRef = deferredSnapshot ?? null;
    if (deferredRef) {
      if (typeof deferredRef.stop !== "function") {
        throw freezeExecutorError("freeze_scheduler_wiring_missing", "W-113 deferred-transition snapshot does not expose stop()", evidence);
      }
      const stopCalledAt = timestamp();
      await deferredRef.stop();
      const stopResolvedAt = timestamp();
      schedulerJobs["W-113"] = { created: true, stopCalledAt, stopResolvedAt, t0ChecklistLine };
      schedulerEvidence["W-113"] = true;
    } else if (enabled.deferred) {
      throw freezeExecutorError("freeze_scheduler_wiring_missing", "scheduler job W-113 is enabled but its live reference is missing from the freeze wiring", evidence);
    } else {
      absentJob("W-113", "deferred-transition coordinator was not created in this process (walletFirstDeferredRuntimeEnabled is false)");
    }

    // W-114 data-pack rotation coordinator. stop() is synchronous;
    // the quiescence conclusion is an inference (stop timestamp +
    // post-stop getStatus() + completedBatches unchanged over the
    // observation window, checked after the W-115 sleep below).
    const rotationRef = requireRef("W-114", wiring.rotationCoordinator ?? null, "rotation");
    let rotationPreBatches = null;
    if (rotationRef) {
      const pre = rotationRef.getStatus();
      rotationPreBatches = pre.completedBatches;
      const stopCalledAt = timestamp();
      await rotationRef.stop();
      const stopResolvedAt = timestamp();
      const post = rotationRef.getStatus();
      schedulerJobs["W-114"] = { created: true, pre, stopCalledAt, stopResolvedAt, post, inference: "stop() clears the timer and sets running=false; no wake can fire afterwards (schedule() is only re-armed from start() or the recover completion callback, guarded by running)" };
      if (post.running !== false || post.timerArmed !== false) {
        throw freezeExecutorError("freeze_scheduler_not_quiesced", `W-114 rotation coordinator did not stop: ${JSON.stringify(post)}`, evidence);
      }
      schedulerEvidence["W-114"] = true;
    } else {
      schedulerJobs["W-114"] = {
        created: false,
        reason: "rotation coordinator was not created in this process",
        rotationCreation: rotationCreation ?? null,
        wiringReport: coordinator.schedulerWiring().rotationCoordinator,
        at: timestamp()
      };
      schedulerEvidence["W-114"] = true;
    }

    // W-115 portal referrals 30 s tick. stopTick() awaits the tick in
    // flight; the ≥60 s observation window follows, during which no
    // new tick may start.
    const portalRef = requireRef("W-115", wiring.portalReferrals ?? null, "portalReferrals");
    if (portalRef) {
      const pre = portalRef.getTickStatus();
      const stopTickCalledAt = timestamp();
      const stopTickResult = await portalRef.stopTick();
      await sleep(observationIntervalMs);
      const post = portalRef.getTickStatus();
      schedulerJobs["W-115"] = {
        created: true, pre, stopTickCalledAt, stopTickResult,
        observedForMs: observationIntervalMs, post
      };
      if (post.timerArmed !== false || post.tickInFlight !== false) {
        throw freezeExecutorError("freeze_scheduler_not_quiesced", `W-115 referral tick did not stop: ${JSON.stringify(post)}`, evidence);
      }
      schedulerEvidence["W-115"] = true;
    } else {
      absentJob("W-115", "portal referrals were not created in this process (portalReferralsEnabled is false)");
    }

    // W-114 inference, second leg: completedBatches unchanged across
    // the observation window.
    if (rotationRef) {
      const postWindow = rotationRef.getStatus();
      schedulerJobs["W-114"].postObservationWindow = postWindow;
      if (postWindow.completedBatches !== rotationPreBatches) {
        throw freezeExecutorError("freeze_scheduler_not_quiesced", `W-114 rotation completedBatches changed across the observation window (${rotationPreBatches} -> ${postWindow.completedBatches})`, evidence);
      }
    }

    // W-119 lead purge CLI, steps A–C (R7 §5). All three run while
    // phase is still BWH_ACTIVE.
    if (typeof dbPath !== "string" || dbPath.length === 0) {
      throw freezeExecutorError("freeze_purge_cli_dbpath_missing", "W-119 lead-purge CLI steps need the control-database path (SUBSCRIPTION_CONTROL_DB_PATH / CONTROL_DB_PATH)", evidence);
    }
    const purgeA = parsePurgeReceipt(await runPurgeCli({ dbPath, apply: false }), "A");
    const purgeAParsed = assertPurgeReceipt(purgeA, { mode: "dry-run", status: "planned", exitCode: 0 });
    const purgeB = parsePurgeReceipt(await runPurgeCli({ dbPath, apply: true }), "B");
    const purgeBParsed = assertPurgeReceipt(purgeB, { mode: "apply", status: "completed", exitCode: 0 });
    if (purgeBParsed.counts?.deletedLeadCount !== purgeBParsed.counts?.eligibleLeadCount
      || purgeBParsed.counts?.deletedLeadCount !== purgeAParsed.counts?.eligibleLeadCount) {
      throw freezeExecutorError(
        "freeze_purge_cli_mismatch",
        `lead-purge CLI apply counts are inconsistent (dry-run eligible ${purgeAParsed.counts?.eligibleLeadCount}, apply ${JSON.stringify(purgeBParsed.counts)})`,
        evidence
      );
    }
    const leadRows = db.prepare("select count(*) as n from platform_leads").get().n;
    const expiredLeadRows = db.prepare("select count(*) as n from platform_leads where expires_at <= datetime('now')").get().n;
    if (leadRows !== 0 || expiredLeadRows !== 0) {
      throw freezeExecutorError(
        "freeze_purge_cli_mismatch",
        `lead rows remain after purge apply (platform_leads ${leadRows}, expired ${expiredLeadRows})`,
        evidence
      );
    }
    schedulerJobs["W-119"] = { created: true, stepA: purgeA, stepB: purgeB, stepC: { leadRows, expiredLeadRows }, at: timestamp() };
    schedulerEvidence["W-119"] = true;

    // W-120 referral-policy CLI: no related process may be running.
    const referralCli = await checkReferralCliProcess();
    schedulerJobs["W-120"] = { ...referralCli, at: timestamp() };
    if (referralCli.found) {
      throw freezeExecutorError("freeze_scheduler_not_quiesced", `W-120 referral-policy CLI process is still running: ${JSON.stringify(referralCli.matches)}`, evidence);
    }
    schedulerEvidence["W-120"] = true;
    evidence.steps.a1SchedulerJobs = schedulerJobs;

    // ---- A2 (T-3): write lock first, then drain proof ----
    // N1 (PR #927 r4697535888): the credential lock manifest is built
    // just before the write-lock receipt below and re-checked at each
    // drain observation — HWM stability alone cannot see an in-place
    // credential rotation, so it is never accepted without it.
    // AB (PR #920 r4680744197): the freeze write lock is created at
    // the START of A2, before the drain, so the drain happens under
    // the lock instead of after it. The receipt's BEGIN IMMEDIATE is
    // held only for its own build transaction, so the lock alone does
    // not block writers for the whole drain — the durable enforcement
    // is the HWM-equality gate below: any write landing in the window
    // moves the HWM away from the lock receipt's HWM and fails the
    // freeze (freeze_write_lock_hwm_moved) instead of leaking into
    // the snapshot. Holding a BEGIN IMMEDIATE open across the async
    // drain was considered and rejected: it would block every
    // control-DB writer for 60 s+ (up to the 10-minute drain
    // timeout), a behavior change beyond this item's scope.
    // ensureDeltaJournal first, so the table set the receipt scans is
    // stable before the lock is taken.
    ensureDeltaJournal(db);
    // N1 (PR #927 r4697535888): the credential lock manifest is the
    // baseline every drain observation is compared against. It is
    // built before the write-lock receipt so the version table is
    // stable when the receipt's HWM scan runs — a rotation between
    // the manifest and the receipt would otherwise be unobservable.
    // No tracking is installed here (see readCredentialManifest):
    // without it the freeze refuses below instead of accepting an
    // HWM that cannot see in-place credential rotations.
    const credentialLockManifest = readCredentialManifest(db, snapshotId, evidence);
    evidence.steps.a2CredentialLock = {
      manifestHash: credentialLockManifest.manifestHash,
      liveRowCount: credentialLockManifest.liveRowCount,
      tombstoneCount: credentialLockManifest.tombstoneCount,
      backfilledCount: credentialLockManifest.backfilledCount,
      at: timestamp(),
    };
    const a2WriteLock = buildWriteLockReceipt(db, { snapshotId, checkpointId, outstandingJobs });
    const a2LockHighWaterMark = a2WriteLock.receipt.highWaterMark;
    evidence.steps.a2WriteLock = {
      receiptDigest: a2WriteLock.receipt.receiptDigest,
      highWaterMark: a2LockHighWaterMark,
      at: timestamp(),
    };
    if (!trafficAccounting || typeof trafficAccounting.getInFlightStatus !== "function") {
      throw freezeExecutorError("freeze_traffic_accounting_missing", "drain proof needs the live traffic-accounting service (getInFlightStatus)", evidence);
    }
    const inflightReads = [];
    let inflight = trafficAccounting.getInFlightStatus();
    inflightReads.push({ at: timestamp(), ...inflight });
    // The deadline uses the injected clock (now), not the wall clock,
    // so tests with a fake clock fast-forward instead of waiting out
    // the real 60 s.
    const inflightDeadlineMs = now().getTime() + inflightPollTimeoutMs;
    while ((inflight.inFlightObservations !== 0 || inflight.inFlightDeltaSampleWrites !== 0 || inflight.inFlightCumulativeSampleWrites !== 0 || inflight.quiesced !== true)
      && now().getTime() < inflightDeadlineMs) {
      await sleep(inflightPollIntervalMs);
      inflight = trafficAccounting.getInFlightStatus();
      inflightReads.push({ at: timestamp(), ...inflight });
    }
    evidence.steps.a2Inflight = { reads: inflightReads };
    if (inflight.inFlightObservations !== 0 || inflight.inFlightDeltaSampleWrites !== 0 || inflight.inFlightCumulativeSampleWrites !== 0 || inflight.quiesced !== true) {
      throw freezeExecutorError("freeze_drain_pending", `traffic-accounting still has work in flight after ${inflightPollTimeoutMs} ms: ${JSON.stringify(inflight)}`, evidence);
    }
    schedulerEvidence["W-116"] = true;
    schedulerEvidence["W-117"] = true;
    schedulerEvidence["W-118"] = true;
    schedulerEvidence["METERING"] = true;
    schedulerJobs["W-116"] = { created: true, evidence: "no collection in flight (getInFlightStatus() reads 0); snapshot gate reports idle (A0, no instruction for this snapshot)", at: timestamp() };
    schedulerJobs["W-117"] = { created: true, evidence: "no sample write in flight (inFlightDeltaSampleWrites 0)", at: timestamp() };
    schedulerJobs["W-118"] = { created: true, evidence: "no sample write in flight (inFlightCumulativeSampleWrites 0)", at: timestamp() };
    schedulerJobs["METERING"] = { created: true, evidence: "no business call in flight (inFlightObservations 0)", at: timestamp() };

    const hwmFirst = readHighWaterMark(db);
    tracker.recordHwmObservation(hwmFirst);
    // N1: the credential manifest is re-read at each HWM observation
    // and must still equal the lock manifest — a version bump (an
    // in-place rotation) moves the manifest hash even when the HWM
    // does not move. The manifest gate runs before the HWM-equality
    // gate below so a rotation is reported with its own code. The
    // hashes are recorded in the evidence before the comparison, so
    // a refusal still carries them.
    const credentialFirst = readCredentialManifest(db, snapshotId, evidence);
    evidence.steps.a2Hwm = {
      first: hwmFirst,
      credentialManifestHashes: {
        lock: credentialLockManifest.manifestHash,
        first: credentialFirst.manifestHash,
      },
      at: timestamp(),
    };
    assertSameCredentialManifest(credentialLockManifest, credentialFirst, evidence);
    await sleep(observationIntervalMs);
    const hwmSecond = readHighWaterMark(db);
    tracker.recordHwmObservation(hwmSecond);
    const credentialSecond = readCredentialManifest(db, snapshotId, evidence);
    evidence.steps.a2Hwm.second = hwmSecond;
    evidence.steps.a2Hwm.credentialManifestHashes.second = credentialSecond.manifestHash;
    evidence.steps.a2Hwm.trackerStatus = tracker.status();
    assertSameCredentialManifest(credentialLockManifest, credentialSecond, evidence);
    // The two observations must each equal the A2 lock receipt's HWM:
    // a write landing anywhere in the drain window moves the HWM and
    // fails the freeze here, before any receipt or bundle is built.
    if (!sameHighWaterMark(hwmFirst, a2LockHighWaterMark) || !sameHighWaterMark(hwmSecond, a2LockHighWaterMark)) {
      throw freezeExecutorError(
        "freeze_write_lock_hwm_moved",
        "a write landed during the A2 drain: the high-water mark moved away from the A2 write-lock receipt's HWM — stop and report, do not freeze on a moved HWM",
        evidence
      );
    }

    // ---- A3 (T-4): receipts + bundle ----
    tracker.markSchedulerQuiesced();
    evidence.steps.a3Tracker = { status: tracker.status(), at: timestamp() };
    const writeLock = buildWriteLockReceipt(db, { snapshotId, checkpointId, outstandingJobs });
    // The bundle's write-lock receipt is built fresh here (its digest
    // is the one the readiness bundle carries), but it must describe
    // the same frozen state the A2 lock receipt captured: its HWM
    // must still equal the A2 lock receipt's HWM.
    if (!sameHighWaterMark(writeLock.receipt.highWaterMark, a2LockHighWaterMark)) {
      throw freezeExecutorError(
        "freeze_write_lock_hwm_moved",
        "a write landed between the A2 drain and the A3 bundle: the fresh write-lock receipt's HWM does not match the A2 write-lock receipt's HWM — stop and report, do not freeze on a moved HWM",
        evidence
      );
    }
    // N1: the same re-check for the credential manifest — a rotation
    // landing between the A2 drain and the A3 bundle must not leak
    // into the bundle, mirroring the fresh-receipt HWM check above.
    const credentialBundleManifest = readCredentialManifest(db, snapshotId, evidence);
    assertSameCredentialManifest(credentialLockManifest, credentialBundleManifest, evidence);
    const schedulerQuiescence = buildSchedulerQuiescenceReceipt({ snapshotId, evidence: schedulerEvidence });
    const callbackDrain = buildCallbackDrainReceipt({
      snapshotId,
      callbacks: [
        { id: "traffic-accounting-inflight", description: "getInFlightStatus() reads 0 (observations/delta/cumulative)", settled: true },
        { id: "hwm-stable", description: "two high-water-mark observations equal 60 s apart", settled: true }
      ]
    });
    ensureDeltaJournal(db);
    const journalEntries = readJournalEntries(db, { snapshotId });
    const journalHeadSeq = journalEntries.length === 0 ? 0 : Math.max(...journalEntries.map((entry) => entry.seq));
    const manifestSeq = manifestSeqProvider({ snapshotId });
    evidence.steps.a3Journal = { entries: journalEntries.length, headSeq: journalHeadSeq, manifestSeq, at: timestamp() };
    // Dynamic HWM equality — the same invariant
    // buildHwmCompletenessReceipt enforces below: the journal head for
    // this snapshot must equal the latest manifest seq. No round
    // number is assumed: a fresh snapshot (empty journal, manifest 0)
    // passes, a later round with a matching manifest passes, and any
    // gap fails closed. This still runs after A1 stopped the
    // schedulers, so a genuine gap here needs a process restart before
    // retry; the gate can only trip on a real gap, never on a valid
    // round. (Deliberately no A0 pre-check: entries could still land
    // between A0 and A3, so an early check could falsely refuse a
    // round that would pass here.)
    if (!Number.isInteger(manifestSeq) || manifestSeq < 0 || journalHeadSeq !== manifestSeq) {
      throw freezeExecutorError(
        "freeze_hwm_gap",
        `HWM gap for snapshot ${snapshotId}: journal head seq ${journalHeadSeq} does not match latest manifest seq ${manifestSeq} — stop and report, do not build the HWM receipt`,
        evidence
      );
    }
    const rowCounts = Object.fromEntries(
      writeLock.receipt.highWaterMark.tables.map((entry) => [entry.table, entry.rowCount])
    );
    const hwmCompleteness = buildHwmCompletenessReceipt({
      highWaterMark: { seq: journalHeadSeq, snapshotId },
      manifestSeq,
      rowCounts,
      snapshotId
    });
    // N5 (PR #932 r4701898636): the bundle carries the A3 credential
    // manifest hash so the coordinator's T1 freeze can re-read the
    // live manifest and refuse when a rotation landed after A3. The
    // hash is digest-covered by the bundle; without it the T1 gate
    // refuses the freeze (fail-closed).
    const readinessBundle = buildFreezeReadinessBundle({
      snapshotId,
      writeLock,
      schedulerQuiescence,
      callbackDrain,
      hwmCompleteness,
      credentialManifestHash: credentialBundleManifest.manifestHash,
    });
    evidence.steps.a3Receipts = {
      writeLockKind: writeLock.kind,
      schedulerJobs: schedulerQuiescence.jobs.length,
      callbackDrained: callbackDrain.drained,
      hwmSeq: hwmCompleteness.seq,
      credentialManifestHash: credentialBundleManifest.manifestHash,
      bundleHash: readinessBundle.bundleHash,
      at: timestamp()
    };

    // ---- B (T1): measurement drain, then freeze ----
    let queueLengthBefore = 0;
    let discardedMeasurementEnqueues = 0;
    let coinCommerceStoreAbsent = false;
    if (coinCommerceStore
      && typeof coinCommerceStore.pendingAdsRecoveryEnqueueCount === "function"
      && typeof coinCommerceStore.discardAdsRecoveryEnqueues === "function") {
      queueLengthBefore = coinCommerceStore.pendingAdsRecoveryEnqueueCount();
      discardedMeasurementEnqueues = coinCommerceStore.discardAdsRecoveryEnqueues();
      const queueLengthAfter = coinCommerceStore.pendingAdsRecoveryEnqueueCount();
      evidence.steps.bMeasurementDrain = { queueLengthBefore, discardedMeasurementEnqueues, queueLengthAfter, at: timestamp() };
      if (discardedMeasurementEnqueues !== queueLengthBefore || queueLengthAfter !== 0) {
        throw freezeExecutorError(
          "freeze_measurement_drain_mismatch",
          `measurement drain mismatch: queued before ${queueLengthBefore}, discarded ${discardedMeasurementEnqueues}, queued after ${queueLengthAfter}`,
          evidence
        );
      }
    } else {
      coinCommerceStoreAbsent = true;
      evidence.steps.bMeasurementDrain = { queueLengthBefore: 0, discardedMeasurementEnqueues: 0, queueLengthAfter: 0, storeAbsent: true, at: timestamp() };
    }

    const result = coordinator.freeze({
      readinessBundle,
      coverageMatrix,
      drainTracker: tracker,
      checkpointId,
      outstandingJobs,
      measurementDrain: { queueLengthBefore, discardedMeasurementEnqueues }
    });

    // Post-freeze fence verification (R7 §5 steps D–E). The freeze has
    // already happened, so a mismatch here is recorded as a
    // post-freeze anomaly in the receipt, not thrown: the operator
    // must see it, and the phase is already FROZEN.
    const purgeD = parsePurgeReceipt(await runPurgeCli({ dbPath, apply: true }), "D");
    const purgeE = parsePurgeReceipt(await runPurgeCli({ dbPath, apply: false }), "E");
    let postFreezeAnomaly = false;
    const postFreezeChecks = { stepD: purgeD, stepE: purgeE };
    try {
      const parsedD = assertPurgeReceipt(purgeD, { mode: "apply", status: "blocked", exitCode: 20 });
      if (!Array.isArray(parsedD.reasonCodes) || !parsedD.reasonCodes.includes("writer_authority_not_bwh")) {
        throw freezeExecutorError("freeze_purge_cli_mismatch", `lead-purge CLI step D blocked without writer_authority_not_bwh: ${JSON.stringify(parsedD.reasonCodes)}`);
      }
    } catch (error) {
      postFreezeAnomaly = true;
      postFreezeChecks.stepDAnomaly = error.message;
    }
    try {
      assertPurgeReceipt(purgeE, { mode: "dry-run", status: "planned", exitCode: 0 });
    } catch (error) {
      postFreezeAnomaly = true;
      postFreezeChecks.stepEAnomaly = error.message;
    }
    evidence.steps.bPostFreeze = { ...postFreezeChecks, anomaly: postFreezeAnomaly, at: timestamp() };

    return {
      schemaVersion: D1_FREEZE_EXECUTION_SCHEMA_VERSION,
      snapshotId,
      checkpointId,
      transitionId: result.transitionId,
      authority: result.authority,
      freezeReceipt: result.freezeReceipt,
      coordinatorReceipt: result.coordinatorReceipt,
      coverageMatrix: {
        counts,
        cutoverBlocked: coverageMatrix.cutoverBlocked,
        matrixDigest: coverageMatrix.matrixDigest
      },
      readinessBundleHash: readinessBundle.bundleHash,
      measurementDrain: {
        queueLengthBefore,
        discardedMeasurementEnqueues,
        storeAbsent: coinCommerceStoreAbsent
      },
      executionEvidence: evidence,
      postFreezeAnomaly,
      phaseC: "not-run (snapshot is a separate operator step; issue the snapshot-gate instruction with these receipts after the freeze)"
    };
  }

  return { executeFreeze };
}

export { SCHEDULER_JOBS };
