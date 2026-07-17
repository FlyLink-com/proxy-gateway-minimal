import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { open as openFile, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";

export const EXPECTED_NONCE_SHA256 = "af3b8363d75cf920ca5dea15835c1d6e33684997bc05fa48e2da6e7804e33029";

const SCHEMA_VERSION = "3";
const CLAIM_TYPE = "japan_tuic_additive_repair_claim";
const BACKUP_TYPE = "japan_tuic_additive_repair_backup";
const JOURNAL_TYPE = "japan_tuic_additive_repair_journal";
const LOWER_SHA256 = /^[0-9a-f]{64}$/;
const LOWER_COMMIT = /^[0-9a-f]{40}$/;
const CANONICAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SAFE_LITERAL = /^[a-z0-9][a-z0-9_-]{0,127}$/;

const CLAIM_INPUT_KEYS = Object.freeze([
  "artifactSha256",
  "executionGateId",
  "executionNonce",
  "releaseUnit",
  "strategy",
  "surface",
  "target",
  "workflowCommit"
]);
const CLAIM_RECORD_KEYS = Object.freeze([
  "schemaVersion",
  "type",
  "claimSha256",
  "nonceSha256",
  "workflowCommit",
  "claimedAt"
]);
const BACKUP_RECORD_KEYS = Object.freeze([
  "schemaVersion",
  "type",
  "claimSha256",
  "originalMapSha256",
  "backupSha256",
  "mode",
  "uid",
  "gid",
  "createdAt"
]);
const JOURNAL_RECORD_KEYS = Object.freeze([
  "schemaVersion",
  "type",
  "sequence",
  "phase",
  "claimSha256",
  "workflowCommit",
  "artifactSha256",
  "preparedAt",
  "updatedAt",
  "backupSha256",
  "originalMapSha256",
  "applyBoundary",
  "terminalResult",
  "error"
]);

const PHASES = new Set([
  "prepared",
  "claimed",
  "backup_ready",
  "apply_intent",
  "applied",
  "observing",
  "rollback_intent",
  "applied_validated",
  "rolled_back_validated",
  "indeterminate"
]);
const TERMINAL_PHASES = new Set(["applied_validated", "rolled_back_validated", "indeterminate"]);
const PHASE_TRANSITIONS = new Map([
  ["prepared", new Set(["claimed"])],
  ["claimed", new Set(["backup_ready", "indeterminate"])],
  ["backup_ready", new Set(["apply_intent", "indeterminate"])],
  ["apply_intent", new Set(["applied", "rollback_intent", "indeterminate"])],
  ["applied", new Set(["observing", "rollback_intent", "indeterminate"])],
  ["observing", new Set(["applied_validated", "rollback_intent", "indeterminate"])],
  ["rollback_intent", new Set(["rolled_back_validated", "indeterminate"])],
  ["applied_validated", new Set()],
  ["rolled_back_validated", new Set()],
  ["indeterminate", new Set()]
]);
const SAFE_ERRORS = new Set([
  "artifact_identity_mismatch",
  "atomic_apply_failed",
  "backup_failed",
  "closeout_receipt_lost",
  "execution_claim_mismatch",
  "host_cleanup_failed",
  "host_lock_busy",
  "natural_observation_failed",
  "natural_observation_timeout",
  "post_apply_invariant_failed",
  "receipt_validation_failed",
  "restricted_identity_rejected",
  "rollback_verification_failed",
  "stable_snapshot_unavailable",
  "target_identity_mismatch",
  "workflow_identity_mismatch"
]);

const NEW_FILE_FLAGS = fsConstants.O_CREAT
  | fsConstants.O_EXCL
  | fsConstants.O_WRONLY
  | (fsConstants.O_NOFOLLOW ?? 0);
const DIRECTORY_FLAGS = fsConstants.O_RDONLY
  | (fsConstants.O_DIRECTORY ?? 0)
  | (fsConstants.O_NOFOLLOW ?? 0);
const FILE_MODE = 0o600;
const UTF8 = new TextDecoder("utf-8", { fatal: true });

let temporarySequence = 0;

class RepairStateError extends Error {
  constructor(code) {
    super(code);
    this.name = "RepairStateError";
    this.code = code;
  }
}

function stateError(code = "receipt_validation_failed") {
  return new RepairStateError(code);
}

function hasExactKeys(record, keys) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return false;
  const actual = Object.keys(record);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function canonicalObject(record, keys) {
  const output = {};
  for (const key of keys) output[key] = record[key];
  return output;
}

function isCanonicalTimestamp(value) {
  if (typeof value !== "string" || !CANONICAL_TIMESTAMP.test(value)) return false;
  const instant = Date.parse(value);
  return Number.isFinite(instant) && new Date(value).toISOString() === value;
}

function isNullable(value, predicate) {
  return value === null || predicate(value);
}

function isSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isLowerSha256(value) {
  return typeof value === "string" && LOWER_SHA256.test(value);
}

function isLowerCommit(value) {
  return typeof value === "string" && LOWER_COMMIT.test(value);
}

function sameValue(left, right) {
  return left === right;
}

function hashBytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function executionNonceSha256(nonce) {
  if (!isLowerSha256(nonce)) {
    throw stateError("execution_claim_mismatch");
  }
  return hashBytes(nonce);
}

export function executionClaimSha256(control) {
  if (!hasExactKeys(control, CLAIM_INPUT_KEYS)) {
    throw stateError("execution_claim_mismatch");
  }
  if (!isLowerSha256(control.artifactSha256)
    || typeof control.executionGateId !== "string" || !SAFE_LITERAL.test(control.executionGateId)
    || typeof control.executionNonce !== "string" || !LOWER_SHA256.test(control.executionNonce)
    || typeof control.releaseUnit !== "string" || !SAFE_LITERAL.test(control.releaseUnit)
    || typeof control.strategy !== "string" || !SAFE_LITERAL.test(control.strategy)
    || typeof control.surface !== "string" || !SAFE_LITERAL.test(control.surface)
    || typeof control.target !== "string" || !SAFE_LITERAL.test(control.target)
    || !isLowerCommit(control.workflowCommit)) {
    throw stateError("execution_claim_mismatch");
  }
  return hashBytes(JSON.stringify(canonicalObject(control, CLAIM_INPUT_KEYS)));
}

function validateClaim(record) {
  if (!hasExactKeys(record, CLAIM_RECORD_KEYS)
    || record.schemaVersion !== SCHEMA_VERSION
    || record.type !== CLAIM_TYPE
    || !isLowerSha256(record.claimSha256)
    || record.nonceSha256 !== EXPECTED_NONCE_SHA256
    || !isLowerCommit(record.workflowCommit)
    || !isCanonicalTimestamp(record.claimedAt)) {
    throw stateError("execution_claim_mismatch");
  }
  return canonicalObject(record, CLAIM_RECORD_KEYS);
}

function validateBackup(record) {
  if (!hasExactKeys(record, BACKUP_RECORD_KEYS)
    || record.schemaVersion !== SCHEMA_VERSION
    || record.type !== BACKUP_TYPE
    || !isLowerSha256(record.claimSha256)
    || !isLowerSha256(record.originalMapSha256)
    || !isLowerSha256(record.backupSha256)
    || !isSafeInteger(record.mode)
    || !isSafeInteger(record.uid)
    || !isSafeInteger(record.gid)
    || !isCanonicalTimestamp(record.createdAt)) {
    throw stateError("backup_failed");
  }
  return canonicalObject(record, BACKUP_RECORD_KEYS);
}

function hasBackupFields(record) {
  return isLowerSha256(record.backupSha256) && isLowerSha256(record.originalMapSha256);
}

function hasApplyBoundary(record) {
  return typeof record.applyBoundary === "string" && SAFE_LITERAL.test(record.applyBoundary);
}

function validJournalRelationships(record) {
  const hasClaim = isLowerSha256(record.claimSha256);
  const backup = hasBackupFields(record);
  const noBackup = record.backupSha256 === null && record.originalMapSha256 === null;
  const apply = hasApplyBoundary(record);

  if (record.phase === "prepared") return !hasClaim && noBackup && !apply;
  if (!hasClaim) return false;
  if (record.phase === "claimed") return noBackup && !apply;
  if (record.phase === "backup_ready") return backup && !apply;
  if (record.phase === "indeterminate") {
    return (noBackup && !apply)
      || (backup && (record.applyBoundary === null || apply));
  }
  return backup && apply;
}

export function validateJournal(record) {
  if (!hasExactKeys(record, JOURNAL_RECORD_KEYS)
    || record.schemaVersion !== SCHEMA_VERSION
    || record.type !== JOURNAL_TYPE
    || !isSafeInteger(record.sequence)
    || !PHASES.has(record.phase)
    || !isNullable(record.claimSha256, isLowerSha256)
    || !isLowerCommit(record.workflowCommit)
    || !isLowerSha256(record.artifactSha256)
    || !isCanonicalTimestamp(record.preparedAt)
    || !isCanonicalTimestamp(record.updatedAt)
    || !isNullable(record.backupSha256, isLowerSha256)
    || !isNullable(record.originalMapSha256, isLowerSha256)
    || !isNullable(record.applyBoundary, (value) => typeof value === "string" && SAFE_LITERAL.test(value))
    || !isNullable(record.terminalResult, (value) => typeof value === "string" && TERMINAL_PHASES.has(value))
    || !isNullable(record.error, (value) => typeof value === "string" && SAFE_ERRORS.has(value))) {
    throw stateError();
  }

  const terminal = TERMINAL_PHASES.has(record.phase);
  if ((terminal && record.terminalResult !== record.phase)
    || (!terminal && record.terminalResult !== null)
    || !validJournalRelationships(record)) {
    throw stateError();
  }
  return canonicalObject(record, JOURNAL_RECORD_KEYS);
}

export function validateJournalTransition(currentInput, nextInput) {
  const current = validateJournal(currentInput);
  const next = validateJournal(nextInput);
  if (!PHASE_TRANSITIONS.get(current.phase)?.has(next.phase)
    || next.sequence !== current.sequence + 1
    || !sameValue(next.workflowCommit, current.workflowCommit)
    || !sameValue(next.artifactSha256, current.artifactSha256)
    || !sameValue(next.preparedAt, current.preparedAt)) {
    throw stateError();
  }

  const claimIntroduced = current.phase === "prepared" && next.phase === "claimed";
  const backupIntroduced = current.phase === "claimed" && next.phase === "backup_ready";
  const applyIntroduced = current.phase === "backup_ready" && next.phase === "apply_intent";
  if ((!claimIntroduced && !sameValue(next.claimSha256, current.claimSha256))
    || (!backupIntroduced && (!sameValue(next.backupSha256, current.backupSha256)
      || !sameValue(next.originalMapSha256, current.originalMapSha256)))
    || (!applyIntroduced && !sameValue(next.applyBoundary, current.applyBoundary))) {
    throw stateError();
  }
  return next;
}

const defaultIo = {
  now: () => new Date().toISOString(),
  readFile,
  open: openFile,
  async write(handle, bytes) {
    await handle.writeFile(bytes);
  },
  async fsyncFile(handle) {
    await handle.sync();
  },
  rename,
  async fsyncDirectory(directory) {
    const handle = await openFile(directory, DIRECTORY_FLAGS);
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  },
  async close(handle) {
    await handle.close();
  },
  remove: unlink
};

function checkedIo(io) {
  const operations = { ...defaultIo, ...io };
  for (const name of ["now", "readFile", "open", "write", "fsyncFile", "rename", "fsyncDirectory", "close", "remove"]) {
    if (typeof operations[name] !== "function") throw stateError();
  }
  return operations;
}

function checkedPaths(paths) {
  const required = ["claim", "journal", "backupReceipt"];
  if (!hasExactKeys(paths, required)
    || required.some((key) => typeof paths[key] !== "string" || paths[key].length === 0)
    || new Set(required.map((key) => paths[key])).size !== required.length) {
    throw stateError();
  }
  return { claim: paths.claim, journal: paths.journal, backupReceipt: paths.backupReceipt };
}

function recordLine(record) {
  return `${JSON.stringify(record)}\n`;
}

async function closeQuietly(io, handle) {
  if (!handle) return;
  try {
    await io.close(handle);
  } catch {
    // Preserve the first fail-closed error and never emit raw close details.
  }
}

async function exclusiveWrite(io, filePath, bytes) {
  let handle = null;
  try {
    handle = await io.open(filePath, NEW_FILE_FLAGS, FILE_MODE);
    await io.write(handle, bytes);
    await io.fsyncFile(handle);
    const opened = handle;
    handle = null;
    await io.close(opened);
    await io.fsyncDirectory(path.dirname(filePath));
  } catch (error) {
    await closeQuietly(io, handle);
    throw error;
  }
}

function temporaryPath(filePath) {
  temporarySequence += 1;
  return path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${temporarySequence}.tmp`
  );
}

async function atomicReplace(io, filePath, bytes) {
  const temporary = temporaryPath(filePath);
  let handle = null;
  let created = false;
  let renamed = false;
  try {
    handle = await io.open(temporary, NEW_FILE_FLAGS, FILE_MODE);
    created = true;
    await io.write(handle, bytes);
    await io.fsyncFile(handle);
    const opened = handle;
    handle = null;
    await io.close(opened);
    await io.rename(temporary, filePath);
    renamed = true;
    await io.fsyncDirectory(path.dirname(filePath));
  } catch (error) {
    await closeQuietly(io, handle);
    if (created && !renamed) {
      try {
        await io.remove(temporary);
      } catch {
        // Only this invocation's exclusive temporary is cleanup-owned.
      }
    }
    throw error;
  }
}

function parseRecord(raw, validator) {
  try {
    const bytes = typeof raw === "string" ? Buffer.from(raw, "utf8") : Buffer.from(raw);
    const text = UTF8.decode(bytes);
    const parsed = JSON.parse(text);
    const canonical = validator(parsed);
    if (text !== recordLine(canonical)) throw stateError();
    return canonical;
  } catch (error) {
    if (error instanceof RepairStateError) throw error;
    throw stateError();
  }
}

async function readOptional(io, filePath, validator, errorCode) {
  let raw;
  try {
    raw = await io.readFile(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw stateError(errorCode);
  }
  try {
    return parseRecord(raw, validator);
  } catch {
    throw stateError(errorCode);
  }
}

function sameClaim(existing, identity) {
  return existing.claimSha256 === identity.claimSha256
    && existing.nonceSha256 === identity.nonceSha256
    && existing.workflowCommit === identity.workflowCommit;
}

function validateSnapshotRelationships({ claim, journal, backup }) {
  if (!journal) {
    if (claim || backup) throw stateError();
    return { claim, journal, backup };
  }
  if (!claim) {
    if (journal.phase !== "prepared" || backup) throw stateError();
    return { claim, journal, backup };
  }
  if (claim.nonceSha256 !== EXPECTED_NONCE_SHA256
    || claim.workflowCommit !== journal.workflowCommit
    || (journal.phase !== "prepared" && journal.claimSha256 !== claim.claimSha256)) {
    throw stateError();
  }
  if (backup && (journal.phase === "prepared" || backup.claimSha256 !== claim.claimSha256)) {
    throw stateError();
  }
  if (journal.backupSha256 !== null) {
    if (!backup
      || journal.backupSha256 !== backup.backupSha256
      || journal.originalMapSha256 !== backup.originalMapSha256) throw stateError();
  } else if (backup && journal.phase !== "claimed" && journal.phase !== "indeterminate") {
    throw stateError();
  }
  return { claim, journal, backup };
}

function queued(queueState, operation) {
  const result = queueState.tail.then(operation, operation);
  queueState.tail = result.catch(() => undefined);
  return result;
}

export function createRepairStateStore({ paths: inputPaths, io: inputIo } = {}) {
  const paths = checkedPaths(inputPaths);
  const io = checkedIo(inputIo);
  const claimQueue = { tail: Promise.resolve() };
  const journalQueue = { tail: Promise.resolve() };

  async function readClaim() {
    return readOptional(io, paths.claim, validateClaim, "execution_claim_mismatch");
  }

  async function readJournal() {
    return readOptional(io, paths.journal, validateJournal, "receipt_validation_failed");
  }

  async function readBackupReceipt() {
    return readOptional(io, paths.backupReceipt, validateBackup, "backup_failed");
  }

  async function readSnapshot() {
    const claim = await readClaim();
    const journal = await readJournal();
    const backup = await readBackupReceipt();
    return validateSnapshotRelationships({ claim, journal, backup });
  }

  async function writePreparedOperation(record) {
    let canonical;
    try {
      canonical = validateJournal(record);
      if (canonical.phase !== "prepared" || canonical.sequence !== 0) throw stateError();
      const snapshot = await readSnapshot();
      if (snapshot.claim || snapshot.journal || snapshot.backup) throw stateError();
      await exclusiveWrite(io, paths.journal, recordLine(canonical));
      return canonical;
    } catch {
      throw stateError();
    }
  }

  function writePrepared(record) {
    return queued(journalQueue, () => writePreparedOperation(record));
  }

  function claim(control) {
    const nonceSha256 = executionNonceSha256(control?.executionNonce);
    if (nonceSha256 !== EXPECTED_NONCE_SHA256) throw stateError("execution_claim_mismatch");
    const identity = {
      claimSha256: executionClaimSha256(control),
      nonceSha256,
      workflowCommit: control.workflowCommit
    };

    return queued(claimQueue, async () => {
      let snapshot;
      try {
        snapshot = await readSnapshot();
      } catch {
        throw stateError("execution_claim_mismatch");
      }
      if (!snapshot.journal
        || snapshot.journal.phase !== "prepared"
        || snapshot.backup
        || snapshot.journal.workflowCommit !== control.workflowCommit
        || snapshot.journal.artifactSha256 !== control.artifactSha256) {
        throw stateError("execution_claim_mismatch");
      }
      if (snapshot.claim) {
        if (!sameClaim(snapshot.claim, identity)) throw stateError("execution_claim_mismatch");
        return snapshot.claim;
      }

      let record;
      try {
        record = validateClaim({
          schemaVersion: SCHEMA_VERSION,
          type: CLAIM_TYPE,
          claimSha256: identity.claimSha256,
          nonceSha256: identity.nonceSha256,
          workflowCommit: identity.workflowCommit,
          claimedAt: io.now()
        });
        await exclusiveWrite(io, paths.claim, recordLine(record));
        return record;
      } catch (error) {
        if (error?.code === "EEXIST") {
          try {
            const raced = await readSnapshot();
            if (raced.journal?.phase === "prepared"
              && !raced.backup
              && raced.claim
              && sameClaim(raced.claim, identity)) return raced.claim;
          } catch {
            // Fail closed with the fixed claim error below.
          }
        }
        throw stateError("execution_claim_mismatch");
      }
    });
  }

  function transition(expectedSequence, next) {
    return queued(journalQueue, async () => {
      try {
        if (!isSafeInteger(expectedSequence)) throw stateError();
        const snapshot = await readSnapshot();
        const current = snapshot.journal;
        if (!current || current.sequence !== expectedSequence) throw stateError();
        const canonical = validateJournalTransition(current, next);
        validateSnapshotRelationships({ ...snapshot, journal: canonical });
        await atomicReplace(io, paths.journal, recordLine(canonical));
        return canonical;
      } catch {
        throw stateError();
      }
    });
  }

  async function writeBackupReceipt(record) {
    try {
      const canonical = validateBackup(record);
      const snapshot = await readSnapshot();
      if (!snapshot.claim
        || !snapshot.journal
        || snapshot.journal.phase !== "claimed"
        || snapshot.backup
        || canonical.claimSha256 !== snapshot.claim.claimSha256) {
        throw stateError("backup_failed");
      }
      await exclusiveWrite(io, paths.backupReceipt, recordLine(canonical));
      return canonical;
    } catch {
      throw stateError("backup_failed");
    }
  }

  return {
    readSnapshot,
    writePrepared,
    claim,
    transition,
    writeBackupReceipt,
    readBackupReceipt
  };
}
