import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import Database from "better-sqlite3";
import {
  createSqliteSubscriptionControlStore
} from "./subscription-control-db.mjs";

export const PLATFORM_LEAD_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
export const PLATFORM_LEAD_BACKUP_PRUNE_SAFETY_MS = 2 * 60 * 60 * 1000;
export const PLATFORM_LEAD_BACKUP_MANIFEST_DOMAIN =
  "PLATFORM_LEAD_BACKUP_MANIFEST:v1\0";

const MANIFEST_INPUT_KEYS = [
  "file",
  "createdAt",
  "privacyCutoff",
  "pruneAt",
  "retentionBasis",
  "size",
  "sha256",
  "quickCheck",
  "leadTablePresent",
  "leadRowCount"
];
const MANIFEST_KEYS = [
  "schemaVersion",
  "artifactKind",
  ...MANIFEST_INPUT_KEYS,
  "manifestDigest"
];
const RESULT_KEYS = [
  "schemaVersion",
  "command",
  "mode",
  "status",
  "mutationState",
  "counts",
  "reasonCodes"
];
const ALLOWED_COUNT_KEYS = new Set([
  "backupEligibleCount",
  "blockedEntryCount",
  "candidatePairCount",
  "createdBackupCount",
  "deletedLeadCount",
  "deletedPairCount",
  "duePairCount",
  "eligibleLeadCount",
  "futurePairCount",
  "leadRowCount",
  "orphanEntryCount",
  "unknownEntryCount"
]);
const SAFE_BACKUP_BASENAME = /^control-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8,64}\.sqlite$/;
const SAFE_MANIFEST_BASENAME = /^control-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8,64}\.sqlite\.manifest\.json$/;
const SAFE_REASON_CODE = /^[a-z][a-z0-9_]{0,63}$/;
const MAX_MANIFEST_BYTES = 16 * 1024;
const LEAD_SCHEMA_COLUMNS = [
  ["id", "text", 0, 1],
  ["status", "text", 1, 0],
  ["organization", "text", 1, 0],
  ["email", "text", 1, 0],
  ["direction", "text", 1, 0],
  ["stage", "text", 1, 0],
  ["message", "text", 1, 0],
  ["source", "text", 1, 0],
  ["created_at", "text", 1, 0],
  ["updated_at", "text", 1, 0],
  ["expires_at", "text", 1, 0]
];

function retentionError(reasonCode) {
  const error = new Error(reasonCode);
  error.code = "lead_retention_operation_error";
  error.reasonCode = reasonCode;
  return error;
}

function exactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function canonicalTimestamp(value) {
  if (typeof value !== "string" || !value) {
    throw retentionError("invalid_timestamp");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    throw retentionError("invalid_timestamp");
  }
  return value;
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  return `{${Object.keys(value).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  )).join(",")}}`;
}

function sha256DomainObject(domain, value) {
  return createHash("sha256")
    .update(domain, "utf8")
    .update(canonicalJson(value), "utf8")
    .digest("hex");
}

function validateBackupBasename(value) {
  if (
    typeof value !== "string"
    || basename(value) !== value
    || !SAFE_BACKUP_BASENAME.test(value)
  ) {
    throw retentionError("invalid_backup_basename");
  }
  return value;
}

export function calculateLeadBackupRetention({ createdAt, leadExpiresAt = [] } = {}) {
  const normalizedCreatedAt = canonicalTimestamp(createdAt);
  if (!Array.isArray(leadExpiresAt)) {
    throw retentionError("invalid_timestamp");
  }
  const createdTime = Date.parse(normalizedCreatedAt);
  const defaultCutoffTime = createdTime + PLATFORM_LEAD_RETENTION_MS;
  const expiryTimes = leadExpiresAt.map((value) => {
    canonicalTimestamp(value);
    return Date.parse(value);
  });
  const earliestExpiryTime = expiryTimes.length > 0
    ? Math.min(...expiryTimes)
    : null;
  const usesLeadExpiry = earliestExpiryTime !== null
    && earliestExpiryTime < defaultCutoffTime;
  const privacyCutoffTime = usesLeadExpiry ? earliestExpiryTime : defaultCutoffTime;
  const pruneTime = privacyCutoffTime - PLATFORM_LEAD_BACKUP_PRUNE_SAFETY_MS;
  if (pruneTime <= createdTime) {
    throw retentionError("backup_safety_window_unavailable");
  }
  return {
    createdAt: normalizedCreatedAt,
    privacyCutoff: new Date(privacyCutoffTime).toISOString(),
    pruneAt: new Date(pruneTime).toISOString(),
    retentionBasis: usesLeadExpiry
      ? "earliest_lead_expiry"
      : "created_at_plus_90d"
  };
}

function manifestProjection(manifest) {
  const { manifestDigest: _manifestDigest, ...projection } = manifest;
  return projection;
}

function validateManifestFields(manifest) {
  if (!exactKeys(manifest, MANIFEST_KEYS)) {
    throw retentionError("invalid_manifest");
  }
  if (
    manifest.schemaVersion !== "1"
    || manifest.artifactKind !== "subscription-control-sqlite"
  ) {
    throw retentionError("invalid_manifest");
  }
  validateBackupBasename(manifest.file);
  canonicalTimestamp(manifest.createdAt);
  canonicalTimestamp(manifest.privacyCutoff);
  canonicalTimestamp(manifest.pruneAt);
  if (!new Set(["created_at_plus_90d", "earliest_lead_expiry"]).has(manifest.retentionBasis)) {
    throw retentionError("invalid_manifest");
  }
  if (!Number.isSafeInteger(manifest.size) || manifest.size <= 0) {
    throw retentionError("invalid_manifest");
  }
  if (typeof manifest.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(manifest.sha256)) {
    throw retentionError("invalid_manifest");
  }
  if (manifest.quickCheck !== "ok" || typeof manifest.leadTablePresent !== "boolean") {
    throw retentionError("invalid_manifest");
  }
  if (!Number.isSafeInteger(manifest.leadRowCount) || manifest.leadRowCount < 0) {
    throw retentionError("invalid_manifest");
  }
  if (!manifest.leadTablePresent && manifest.leadRowCount !== 0) {
    throw retentionError("invalid_manifest");
  }
  if (manifest.retentionBasis === "earliest_lead_expiry"
    && (!manifest.leadTablePresent || manifest.leadRowCount === 0)) {
    throw retentionError("invalid_manifest");
  }
  const createdTime = Date.parse(manifest.createdAt);
  const pruneTime = Date.parse(manifest.pruneAt);
  const cutoffTime = Date.parse(manifest.privacyCutoff);
  if (!(createdTime < pruneTime && pruneTime < cutoffTime)
    || pruneTime !== cutoffTime - PLATFORM_LEAD_BACKUP_PRUNE_SAFETY_MS) {
    throw retentionError("invalid_manifest");
  }
  if (manifest.retentionBasis === "created_at_plus_90d"
    && cutoffTime !== createdTime + PLATFORM_LEAD_RETENTION_MS) {
    throw retentionError("invalid_manifest");
  }
  if (manifest.retentionBasis === "earliest_lead_expiry"
    && cutoffTime >= createdTime + PLATFORM_LEAD_RETENTION_MS) {
    throw retentionError("invalid_manifest");
  }
}

export function createLeadBackupManifest(input = {}) {
  if (!exactKeys(input, MANIFEST_INPUT_KEYS)) {
    throw retentionError("invalid_manifest");
  }
  const manifest = {
    schemaVersion: "1",
    artifactKind: "subscription-control-sqlite",
    file: input.file,
    createdAt: input.createdAt,
    privacyCutoff: input.privacyCutoff,
    pruneAt: input.pruneAt,
    retentionBasis: input.retentionBasis,
    size: input.size,
    sha256: input.sha256,
    quickCheck: input.quickCheck,
    leadTablePresent: input.leadTablePresent,
    leadRowCount: input.leadRowCount,
    manifestDigest: ""
  };
  validateManifestFields({ ...manifest, manifestDigest: "0".repeat(64) });
  manifest.manifestDigest = sha256DomainObject(
    PLATFORM_LEAD_BACKUP_MANIFEST_DOMAIN,
    manifestProjection(manifest)
  );
  return manifest;
}

export function validateLeadBackupManifest(manifest) {
  validateManifestFields(manifest);
  if (typeof manifest.manifestDigest !== "string" || !/^[a-f0-9]{64}$/.test(manifest.manifestDigest)) {
    throw retentionError("invalid_manifest");
  }
  const expected = sha256DomainObject(
    PLATFORM_LEAD_BACKUP_MANIFEST_DOMAIN,
    manifestProjection(manifest)
  );
  if (manifest.manifestDigest !== expected) {
    throw retentionError("manifest_digest_mismatch");
  }
  return manifest;
}

function validateResultTuple({ command, mode, status, mutationState }) {
  if (!["purge", "backup", "prune"].includes(command)) return false;
  if (!["dry-run", "apply"].includes(mode)) return false;
  if (!["planned", "completed", "blocked", "reconciliation_required", "internal_error"].includes(status)) {
    return false;
  }
  if (!["none", "completed", "unknown"].includes(mutationState)) return false;
  if (status === "planned") return mode === "dry-run" && mutationState === "none";
  if (status === "completed") return mode === "apply" && mutationState === "completed";
  if (status === "blocked" || status === "internal_error") return mutationState === "none";
  return status === "reconciliation_required" && mode === "apply" && mutationState === "unknown";
}

export function buildLeadRetentionCommandResult({
  command,
  mode,
  status,
  mutationState,
  counts = {},
  reasonCodes = []
} = {}) {
  if (!validateResultTuple({ command, mode, status, mutationState })) {
    throw retentionError("invalid_command_result");
  }
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) {
    throw retentionError("invalid_command_result");
  }
  const normalizedCounts = {};
  for (const key of Object.keys(counts).sort()) {
    if (!ALLOWED_COUNT_KEYS.has(key)
      || !Number.isSafeInteger(counts[key])
      || counts[key] < 0) {
      throw retentionError("invalid_command_result");
    }
    normalizedCounts[key] = counts[key];
  }
  if (!Array.isArray(reasonCodes)
    || reasonCodes.some((code) => typeof code !== "string" || !SAFE_REASON_CODE.test(code))) {
    throw retentionError("invalid_command_result");
  }
  return {
    schemaVersion: "1",
    command,
    mode,
    status,
    mutationState,
    counts: normalizedCounts,
    reasonCodes: [...new Set(reasonCodes)].sort()
  };
}

export function serializeLeadRetentionCommandResult(result) {
  if (!exactKeys(result, RESULT_KEYS)) {
    throw retentionError("invalid_command_result");
  }
  const normalized = buildLeadRetentionCommandResult(result);
  if (JSON.stringify(normalized) !== JSON.stringify(result)) {
    throw retentionError("invalid_command_result");
  }
  return `${JSON.stringify(result)}\n`;
}

function commandMode(apply) {
  return apply ? "apply" : "dry-run";
}

function blockedCommandResult(command, apply, reasonCode) {
  return buildLeadRetentionCommandResult({
    command,
    mode: commandMode(apply),
    status: "blocked",
    mutationState: "none",
    counts: {},
    reasonCodes: [reasonCode]
  });
}

function normalizedNow(nowFn) {
  if (typeof nowFn !== "function") throw retentionError("invalid_timestamp");
  const value = nowFn();
  const timestamp = value instanceof Date ? value.toISOString() : value;
  return canonicalTimestamp(timestamp);
}

function quickCheckOk(database) {
  const rows = database.pragma("quick_check");
  return Array.isArray(rows)
    && rows.length === 1
    && rows[0]?.quick_check === "ok";
}

function inspectLeadTable(database) {
  const table = database.prepare(`
    select name from sqlite_master
    where type = 'table' and name = 'platform_leads'
  `).get();
  if (!table) return { present: false };
  const columns = database.pragma("table_info(platform_leads)");
  const compatible = columns.length === LEAD_SCHEMA_COLUMNS.length
    && columns.every((column, index) => {
      const [name, type, notnull, pk] = LEAD_SCHEMA_COLUMNS[index];
      return column.name === name
        && String(column.type).toLowerCase() === type
        && column.notnull === notnull
        && column.pk === pk;
    });
  return { present: true, compatible };
}

function databaseFailureReason(error) {
  const code = String(error?.code || "");
  if (code === "SQLITE_BUSY" || code === "SQLITE_LOCKED") return "database_busy";
  if (code === "SQLITE_CANTOPEN") return "database_missing";
  if (code.startsWith("SQLITE_NOTADB") || /not a database/i.test(String(error?.message || ""))) {
    return "database_invalid";
  }
  return "database_unavailable";
}

export function runLeadPurge({
  dbPath,
  apply = false,
  nowFn = () => new Date()
} = {}) {
  if (typeof apply !== "boolean") {
    return blockedCommandResult("purge", false, "invalid_command_contract");
  }
  if (typeof dbPath !== "string" || !isAbsolute(dbPath)) {
    return blockedCommandResult("purge", apply, "invalid_database_path");
  }
  if (!existsSync(dbPath)) {
    return blockedCommandResult("purge", apply, "database_missing");
  }

  let now;
  try {
    now = normalizedNow(nowFn);
  } catch {
    return blockedCommandResult("purge", apply, "invalid_timestamp");
  }

  let database;
  try {
    database = new Database(dbPath, {
      readonly: !apply,
      fileMustExist: true
    });
    database.pragma("busy_timeout = 2000");
    if (!quickCheckOk(database)) {
      return blockedCommandResult("purge", apply, "database_integrity_failed");
    }
    const schema = inspectLeadTable(database);
    if (!schema.present) {
      return buildLeadRetentionCommandResult({
        command: "purge",
        mode: commandMode(apply),
        status: apply ? "completed" : "planned",
        mutationState: apply ? "completed" : "none",
        counts: {
          deletedLeadCount: 0,
          eligibleLeadCount: 0
        },
        reasonCodes: []
      });
    }
    if (!schema.compatible) {
      return blockedCommandResult("purge", apply, "lead_schema_incompatible");
    }

    const countEligible = () => database.prepare(`
      select count(*) as count from platform_leads where expires_at <= ?
    `).get(now).count;
    if (!apply) {
      return buildLeadRetentionCommandResult({
        command: "purge",
        mode: "dry-run",
        status: "planned",
        mutationState: "none",
        counts: {
          deletedLeadCount: 0,
          eligibleLeadCount: countEligible()
        },
        reasonCodes: []
      });
    }

    const store = createSqliteSubscriptionControlStore({
      database,
      initializeSchema: false
    });
    const outcome = database.transaction(() => {
      const eligibleLeadCount = countEligible();
      const deletedLeadCount = store.purgeExpiredLeads({ now });
      if (!quickCheckOk(database)) {
        throw retentionError("database_integrity_failed");
      }
      return { deletedLeadCount, eligibleLeadCount };
    })();
    store.close();
    return buildLeadRetentionCommandResult({
      command: "purge",
      mode: "apply",
      status: "completed",
      mutationState: "completed",
      counts: outcome,
      reasonCodes: []
    });
  } catch (error) {
    return blockedCommandResult(
      "purge",
      apply,
      error?.reasonCode || databaseFailureReason(error)
    );
  } finally {
    database?.close();
  }
}

function validateBackupDirectory(backupDir) {
  if (typeof backupDir !== "string" || !isAbsolute(backupDir) || !existsSync(backupDir)) {
    throw retentionError("backup_directory_invalid");
  }
  const status = lstatSync(backupDir);
  if (!status.isDirectory() || status.isSymbolicLink()) {
    throw retentionError("backup_directory_invalid");
  }
  return realpathSync(backupDir);
}

function containedPath(root, name) {
  if (typeof name !== "string" || basename(name) !== name) {
    throw retentionError("backup_path_escape");
  }
  const path = resolve(root, name);
  if (dirname(path) !== root) {
    throw retentionError("backup_path_escape");
  }
  return path;
}

function inspectBackupSnapshot(database, createdAt) {
  if (!quickCheckOk(database)) {
    throw retentionError("database_integrity_failed");
  }
  const schema = inspectLeadTable(database);
  if (!schema.present) {
    return {
      leadTablePresent: false,
      leadRowCount: 0,
      retention: calculateLeadBackupRetention({ createdAt, leadExpiresAt: [] })
    };
  }
  if (!schema.compatible) {
    throw retentionError("lead_schema_incompatible");
  }
  const expiryRows = database.prepare(`
    select expires_at from platform_leads order by expires_at asc
  `).all();
  const leadExpiresAt = expiryRows.map((row) => canonicalTimestamp(row.expires_at));
  if (leadExpiresAt.some((expiresAt) => Date.parse(expiresAt) <= Date.parse(createdAt))) {
    throw retentionError("expired_lead_present");
  }
  return {
    leadTablePresent: true,
    leadRowCount: leadExpiresAt.length,
    retention: calculateLeadBackupRetention({ createdAt, leadExpiresAt })
  };
}

function syncFile(path) {
  const descriptor = openSync(path, "r+");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function sha256File(path) {
  const hash = createHash("sha256");
  const descriptor = openSync(path, "r");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  try {
    let bytesRead;
    do {
      bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    closeSync(descriptor);
  }
  return hash.digest("hex");
}

function generatedBackupBasename(createdAt, randomBytesFn) {
  const timestamp = createdAt
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[-:]/g, "");
  const suffixBytes = randomBytesFn(8);
  if (!Buffer.isBuffer(suffixBytes) || suffixBytes.length !== 8) {
    throw retentionError("invalid_random_source");
  }
  return validateBackupBasename(`control-${timestamp}-${suffixBytes.toString("hex")}.sqlite`);
}

function backupResult({ apply, status, mutationState, counts, reasonCodes = [] }) {
  return buildLeadRetentionCommandResult({
    command: "backup",
    mode: commandMode(apply),
    status,
    mutationState,
    counts,
    reasonCodes
  });
}

function backupFailureReason(error) {
  if (error?.reasonCode) return error.reasonCode;
  if (error?.code === "EEXIST") return "backup_collision";
  if (error?.code === "ENOENT") return "backup_directory_invalid";
  if (["EACCES", "EPERM", "ENOSPC", "EIO", "EROFS"].includes(error?.code)) {
    return "backup_io_failed";
  }
  return databaseFailureReason(error);
}

export async function runLeadBackup({
  dbPath,
  backupDir,
  apply = false,
  nowFn = () => new Date(),
  randomBytesFn = randomBytes,
  linkFn = linkSync,
  unlinkFn = unlinkSync
} = {}) {
  if (typeof apply !== "boolean"
    || typeof linkFn !== "function"
    || typeof unlinkFn !== "function") {
    return backupResult({
      apply: false,
      status: "blocked",
      mutationState: "none",
      counts: {},
      reasonCodes: ["invalid_command_contract"]
    });
  }
  if (typeof dbPath !== "string" || !isAbsolute(dbPath) || !existsSync(dbPath)) {
    return backupResult({
      apply,
      status: "blocked",
      mutationState: "none",
      counts: {},
      reasonCodes: [typeof dbPath === "string" && isAbsolute(dbPath)
        ? "database_missing"
        : "invalid_database_path"]
    });
  }

  let createdAt;
  let root;
  try {
    createdAt = normalizedNow(nowFn);
    root = validateBackupDirectory(backupDir);
  } catch (error) {
    return backupResult({
      apply,
      status: "blocked",
      mutationState: "none",
      counts: {},
      reasonCodes: [error?.reasonCode || "backup_directory_invalid"]
    });
  }

  let source;
  let tempBackupPath;
  let tempManifestPath;
  let sqlitePublished = false;
  let manifestPublished = false;
  let tempBackupOwned = false;
  let tempManifestOwned = false;
  try {
    source = new Database(dbPath, { readonly: true, fileMustExist: true });
    source.pragma("busy_timeout = 2000");
    const sourceInspection = inspectBackupSnapshot(source, createdAt);
    if (!apply) {
      return backupResult({
        apply: false,
        status: "planned",
        mutationState: "none",
        counts: {
          backupEligibleCount: 1,
          createdBackupCount: 0,
          leadRowCount: sourceInspection.leadRowCount
        }
      });
    }

    const file = generatedBackupBasename(createdAt, randomBytesFn);
    const manifestFile = `${file}.manifest.json`;
    const backupPath = containedPath(root, file);
    const manifestPath = containedPath(root, manifestFile);
    tempBackupPath = containedPath(root, `.${file}.tmp`);
    tempManifestPath = containedPath(root, `.${manifestFile}.tmp`);
    if ([backupPath, manifestPath, tempBackupPath, tempManifestPath].some(existsSync)) {
      throw retentionError("backup_collision");
    }

    tempBackupOwned = true;
    await source.backup(tempBackupPath);
    source.close();
    source = null;

    const snapshotStatus = lstatSync(tempBackupPath);
    if (!snapshotStatus.isFile() || snapshotStatus.isSymbolicLink()) {
      throw retentionError("unsafe_backup_file");
    }
    const snapshot = new Database(tempBackupPath, { readonly: true, fileMustExist: true });
    let inspection;
    try {
      inspection = inspectBackupSnapshot(snapshot, createdAt);
    } finally {
      snapshot.close();
    }
    chmodSync(tempBackupPath, 0o600);
    syncFile(tempBackupPath);
    const backupStatus = statSync(tempBackupPath);
    const manifest = createLeadBackupManifest({
      file,
      ...inspection.retention,
      size: backupStatus.size,
      sha256: sha256File(tempBackupPath),
      quickCheck: "ok",
      leadTablePresent: inspection.leadTablePresent,
      leadRowCount: inspection.leadRowCount
    });

    linkFn(tempBackupPath, backupPath);
    sqlitePublished = true;
    unlinkFn(tempBackupPath);
    tempBackupOwned = false;
    chmodSync(backupPath, 0o600);

    writeFileSync(tempManifestPath, `${JSON.stringify(manifest)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600
    });
    tempManifestOwned = true;
    chmodSync(tempManifestPath, 0o600);
    syncFile(tempManifestPath);
    linkFn(tempManifestPath, manifestPath);
    manifestPublished = true;
    unlinkFn(tempManifestPath);
    tempManifestOwned = false;
    chmodSync(manifestPath, 0o600);

    return backupResult({
      apply: true,
      status: "completed",
      mutationState: "completed",
      counts: {
        backupEligibleCount: 1,
        createdBackupCount: 1,
        leadRowCount: inspection.leadRowCount
      }
    });
  } catch (error) {
    const reasonCode = backupFailureReason(error);
    let cleanupFailed = false;
    if (tempBackupOwned && tempBackupPath && existsSync(tempBackupPath)) {
      try {
        unlinkFn(tempBackupPath);
        tempBackupOwned = false;
      } catch {
        cleanupFailed = true;
      }
    }
    if (tempManifestOwned && tempManifestPath && existsSync(tempManifestPath)) {
      try {
        unlinkFn(tempManifestPath);
        tempManifestOwned = false;
      } catch {
        cleanupFailed = true;
      }
    }
    if (sqlitePublished || manifestPublished) {
      return backupResult({
        apply: true,
        status: "reconciliation_required",
        mutationState: "unknown",
        counts: {},
        reasonCodes: ["partial_backup_publication"]
      });
    }
    if (cleanupFailed) {
      return backupResult({
        apply: true,
        status: "reconciliation_required",
        mutationState: "unknown",
        counts: {},
        reasonCodes: ["partial_backup_cleanup"]
      });
    }
    return backupResult({
      apply,
      status: "blocked",
      mutationState: "none",
      counts: {},
      reasonCodes: [reasonCode]
    });
  } finally {
    source?.close();
  }
}

function pruneResult({ apply, status, mutationState, counts, reasonCodes = [] }) {
  return buildLeadRetentionCommandResult({
    command: "prune",
    mode: commandMode(apply),
    status,
    mutationState,
    counts,
    reasonCodes
  });
}

function safeEntryStatus(path) {
  const status = lstatSync(path);
  return status.isFile() && !status.isSymbolicLink() ? status : null;
}

export function runLeadPrune({
  backupDir,
  apply = false,
  nowFn = () => new Date(),
  unlinkFn = unlinkSync,
  readdirFn = readdirSync
} = {}) {
  if (typeof apply !== "boolean"
    || typeof unlinkFn !== "function"
    || typeof readdirFn !== "function") {
    return pruneResult({
      apply: false,
      status: "blocked",
      mutationState: "none",
      counts: {},
      reasonCodes: ["invalid_command_contract"]
    });
  }
  let root;
  let now;
  try {
    root = validateBackupDirectory(backupDir);
    now = normalizedNow(nowFn);
  } catch (error) {
    return pruneResult({
      apply,
      status: "blocked",
      mutationState: "none",
      counts: {},
      reasonCodes: [error?.reasonCode || "backup_directory_invalid"]
    });
  }

  let names;
  try {
    names = readdirFn(root);
    if (!Array.isArray(names) || names.some((name) => typeof name !== "string")) {
      throw retentionError("backup_directory_unavailable");
    }
    names = [...names].sort();
  } catch {
    return pruneResult({
      apply,
      status: "blocked",
      mutationState: "none",
      counts: {},
      reasonCodes: ["backup_directory_unavailable"]
    });
  }
  const nameSet = new Set(names);
  const recognized = new Set();
  const blockedEntries = new Set();
  const reasonCodes = new Set();
  const pairs = [];

  for (const manifestName of names.filter((name) => SAFE_MANIFEST_BASENAME.test(name))) {
    recognized.add(manifestName);
    const manifestPath = containedPath(root, manifestName);
    try {
      const manifestStatus = safeEntryStatus(manifestPath);
      if (!manifestStatus || manifestStatus.size <= 0 || manifestStatus.size > MAX_MANIFEST_BYTES) {
        throw retentionError("unsafe_entry");
      }
      const manifest = validateLeadBackupManifest(
        JSON.parse(readFileSync(manifestPath, "utf8"))
      );
      if (`${manifest.file}.manifest.json` !== manifestName) {
        throw retentionError("invalid_manifest");
      }
      const backupPath = containedPath(root, manifest.file);
      if (!nameSet.has(manifest.file)) {
        throw retentionError("orphan_entry");
      }
      recognized.add(manifest.file);
      const backupStatus = safeEntryStatus(backupPath);
      if (!backupStatus) throw retentionError("unsafe_entry");
      if (backupStatus.size !== manifest.size || sha256File(backupPath) !== manifest.sha256) {
        throw retentionError("backup_integrity_mismatch");
      }
      pairs.push({
        backupPath,
        manifestPath,
        due: Date.parse(manifest.pruneAt) <= Date.parse(now)
      });
    } catch (error) {
      blockedEntries.add(manifestName);
      reasonCodes.add(error?.reasonCode || "invalid_manifest");
    }
  }

  for (const name of names) {
    if (!recognized.has(name)) {
      blockedEntries.add(name);
      reasonCodes.add(SAFE_BACKUP_BASENAME.test(name) ? "orphan_entry" : "unsafe_entry");
    }
  }

  const duePairs = pairs.filter((pair) => pair.due);
  const counts = {
    blockedEntryCount: blockedEntries.size,
    candidatePairCount: pairs.length,
    deletedPairCount: 0,
    duePairCount: duePairs.length,
    futurePairCount: pairs.length - duePairs.length
  };
  if (blockedEntries.size > 0) {
    return pruneResult({
      apply,
      status: "blocked",
      mutationState: "none",
      counts,
      reasonCodes: [...reasonCodes]
    });
  }
  if (!apply) {
    return pruneResult({
      apply: false,
      status: "planned",
      mutationState: "none",
      counts
    });
  }

  let deletionStarted = false;
  try {
    for (const pair of duePairs) {
      unlinkFn(pair.backupPath);
      deletionStarted = true;
      unlinkFn(pair.manifestPath);
      counts.deletedPairCount += 1;
    }
    return pruneResult({
      apply: true,
      status: "completed",
      mutationState: "completed",
      counts
    });
  } catch {
    if (deletionStarted) {
      return pruneResult({
        apply: true,
        status: "reconciliation_required",
        mutationState: "unknown",
        counts,
        reasonCodes: ["partial_pair_deletion"]
      });
    }
    return pruneResult({
      apply: true,
      status: "blocked",
      mutationState: "none",
      counts,
      reasonCodes: ["backup_delete_failed"]
    });
  }
}
