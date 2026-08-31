import { spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  copyFileSync,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";

import Database from "better-sqlite3";

import {
  PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATIONS,
  REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID,
  applyPortalRegistrationWelcomeBonusMigrations,
  dryRunPortalRegistrationWelcomeBonusMigrations,
  validatePortalRegistrationWelcomeBonusSchema
} from "../server/services/platform/portal-registration-welcome-bonus-migrations.mjs";

const SCHEMA_VERSION = "1";
const TYPE = "control_plane_db_snapshot_gate";
const SNAPSHOT_TYPE = "control_plane_db_snapshot";
const SERVICE_UNIT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.@-]{0,127}\.service$/;
const SNAPSHOT_FILE_PATTERN = /^control-plane-db-[a-f0-9-]{36}\.sqlite$/;
const RUNTIME_CONDITION_START_GUARD_IDENTITY_PATTERN =
  /^runtime-condition-v1:(?:0|[1-9][0-9]*):(?:0|[1-9][0-9]*):(?:0|[1-9][0-9]*):(?:0|[1-9][0-9]*)$/;
const MODES = new Set(["guard", "snapshot", "verify", "restore"]);
const SERVICE_STATES = new Set(["active", "inactive"]);
const RUNTIME_START_GUARD_DIRECTORY = "/run/control-plane-db-snapshot-gates";
const RUNTIME_START_GUARD_DROPIN_FILE = "zzzzzz-control-plane-db-snapshot-start-guard.conf";
const SYSTEMCTL_PATH = "/usr/bin/systemctl";
const BUSCTL_PATH = "/usr/bin/busctl";
const SYSTEMD_COMMAND_ENV = Object.freeze({
  PATH: "/usr/bin:/bin",
  LC_ALL: "C",
  LANG: "C"
});
const WELCOME_COINS_SCHEMA_CUSTODY_TYPE = "control_plane_welcome_coins_schema_custody_gate";
const WELCOME_COINS_SCHEMA_CUSTODY_CHILD_TYPE = "control_plane_welcome_coins_schema_custody_child";
const WELCOME_COINS_SCHEMA_SERVICE_UNIT = "proxy-gateway-candidate.service";
const WELCOME_COINS_SCHEMA_EXPECTED_SERVICE_STATE = "inactive";
const WELCOME_COINS_SCHEMA_CUSTODY_CAPABILITY_FD = 3;
const WELCOME_COINS_SCHEMA_CUSTODY_ACQUIRED_FD = 4;
const WELCOME_COINS_SCHEMA_CUSTODY_AUTHORIZATION_FD = 5;
const WELCOME_COINS_SCHEMA_CUSTODY_FRAME_MAX_BYTES = 8192;
const WELCOME_COINS_SCHEMA_MIGRATION_ID = REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID;
const WELCOME_COINS_SCHEMA_DDL_CHECKSUM = PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATIONS.at(-1).ddlChecksum;
const WELCOME_COINS_SCHEMA_MIGRATION_IDS = Object.freeze(
  PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATIONS.map(({ id }) => id)
);
const WELCOME_COINS_SCHEMA_SAFE_CONDITIONS = new Set([
  "applied_schema_incompatible",
  "database_boundary_invalid",
  "database_close_failed",
  "database_custody_failed",
  "database_inspection_failed",
  "database_invalid",
  "database_missing",
  "database_owner_mismatch",
  "database_unavailable",
  "foreign_key_check_failed",
  "invalid_created_at",
  "invalid_database_path",
  "invalid_input",
  "invalid_migration_contract",
  "invalid_temp_root",
  "migration_apply_failed",
  "migration_checksum_mismatch",
  "migration_dependency_missing",
  "migration_id_mismatch",
  "migration_ledger_incompatible",
  "owned_object_incompatible",
  "owned_object_missing",
  "owned_object_without_migration",
  "path_must_be_absolute",
  "quick_check_failed",
  "required_migration_missing",
  "service_state_mismatch",
  "service_state_unavailable",
  "service_start_guard_changed",
  "service_start_guard_missing",
  "service_unit_invalid",
  "snapshot_directory_invalid",
  "snapshot_publish_failed",
  "snapshot_sidecar_present",
  "snapshot_unavailable",
  "source_changed_during_dry_run",
  "temp_root_invalid",
  "unexpected_execution_failure"
]);

const WELCOME_COINS_SCHEMA_DEFAULT_OPERATIONS = Object.freeze({
  applyPortalRegistrationWelcomeBonusMigrations,
  dryRunPortalRegistrationWelcomeBonusMigrations,
  validatePortalRegistrationWelcomeBonusSchema
});
const SYSTEMD_UNIT_SHOW_PROPERTIES = new Set([
  "ActiveState",
  "UnitFileState",
  "LoadState",
  "NeedDaemonReload",
  "DropInPaths"
]);
const SAFE_CONDITIONS = new Set([
  "apply_confirmation_required",
  "database_boundary_invalid",
  "database_close_failed",
  "database_custody_failed",
  "database_integrity_failed",
  "database_missing",
  "database_owner_mismatch",
  "database_quiesce_failed",
  "database_unavailable",
  "execution_envelope_required",
  "execution_envelope_invalid",
  "foreign_key_check_failed",
  "invalid_created_at",
  "invalid_input",
  "manifest_boundary_invalid",
  "manifest_invalid",
  "mode_invalid",
  "path_must_be_absolute",
  "quick_check_failed",
  "restore_cleanup_failed",
  "restore_publish_failed",
  "restore_rollback_failed",
  "restore_service_start_guard_changed",
  "restore_service_state_changed",
  "rollback_directory_invalid",
  "service_state_mismatch",
  "service_principal_identity_invalid",
  "service_state_unavailable",
  "service_start_guard_changed",
  "service_start_guard_missing",
  "service_unit_invalid",
  "snapshot_directory_invalid",
  "snapshot_identity_mismatch",
  "snapshot_publish_failed",
  "snapshot_sidecar_present",
  "snapshot_unavailable",
  "source_wal_not_quiesced",
  "parent_authorization_invalid",
  "unexpected_execution_failure"
]);

export function isWelcomeCoinsSchemaCustodyChildSafeCondition(condition) {
  return SAFE_CONDITIONS.has(condition)
    || WELCOME_COINS_SCHEMA_SAFE_CONDITIONS.has(condition);
}

export class ControlPlaneDatabaseSnapshotGateError extends Error {
  constructor(condition, { mutationPossible = false } = {}) {
    super(condition);
    this.name = "ControlPlaneDatabaseSnapshotGateError";
    this.condition = condition;
    this.mutationPossible = mutationPossible === true;
  }
}

function fail(condition, options) {
  throw new ControlPlaneDatabaseSnapshotGateError(condition, options);
}

function comparablePath(value) {
  const absolute = resolve(value);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}

function isFullyQualifiedPath(value) {
  if (typeof value !== "string" || !isAbsolute(value)) return false;
  if (process.platform !== "win32") return true;
  if (/^[A-Za-z]:[\\/]/.test(value)) return true;
  const unc = /^[\\/]{2}([^\\/]+)[\\/]([^\\/]+)(?:[\\/]|$)/.exec(value);
  if (!unc) return false;
  const [, server, share] = unc;
  return ![".", "..", "?"].includes(server)
    && ![".", ".."].includes(share)
    && !/[<>:"|?*]/.test(server)
    && !/[<>:"|?*]/.test(share);
}

function existingPath(value, { kind, condition }) {
  if (!isFullyQualifiedPath(value)) fail("path_must_be_absolute");
  const lexical = resolve(value);
  let metadata;
  let real;
  try {
    metadata = lstatSync(lexical);
    real = realpathSync(lexical);
  } catch {
    fail(condition);
  }
  if (
    metadata.isSymbolicLink()
    || comparablePath(lexical) !== comparablePath(real)
    || (kind === "file" && !metadata.isFile())
    || (kind === "directory" && !metadata.isDirectory())
  ) {
    fail(condition);
  }
  return real;
}

function protectedDirectory(value, condition) {
  const path = existingPath(value, { kind: "directory", condition });
  if (process.platform !== "win32") {
    const metadata = statSync(path);
    const uid = typeof process.getuid === "function" ? process.getuid() : null;
    if (
      !Number.isSafeInteger(uid)
      || metadata.uid !== uid
      || (metadata.mode & 0o077) !== 0
    ) {
      fail(condition);
    }
  }
  return path;
}

function safeServiceUnit(value) {
  if (typeof value !== "string" || !SERVICE_UNIT_PATTERN.test(value)) {
    fail("service_unit_invalid");
  }
  return value;
}

export function runtimeConditionStartGuardPaths({ serviceUnit } = {}) {
  const unit = safeServiceUnit(serviceUnit);
  const dropInDirectory = `/run/systemd/system/${unit}.d`;
  return Object.freeze({
    blockDirectory: RUNTIME_START_GUARD_DIRECTORY,
    blockPath: `${RUNTIME_START_GUARD_DIRECTORY}/${unit}.block`,
    dropInDirectory,
    dropInPath: `${dropInDirectory}/${RUNTIME_START_GUARD_DROPIN_FILE}`
  });
}

function expectedRuntimeConditionStartGuardText(blockPath) {
  return `[Unit]\nConditionPathExists=!${blockPath}\n`;
}

function protectedRootOwnedPath(value, { kind, condition, ownerOnly = false }) {
  const path = existingPath(value, { kind, condition });
  if (process.platform !== "linux") return path;
  const metadata = statSync(path);
  if (
    metadata.uid !== 0
    || (metadata.mode & (ownerOnly ? 0o077 : 0o022)) !== 0
  ) {
    fail(condition);
  }
  return path;
}

function guardFileIdentity(metadata) {
  if (
    !metadata
    || !Number.isInteger(metadata.dev)
    || !Number.isInteger(metadata.ino)
    || metadata.dev < 0
    || metadata.ino < 0
  ) {
    return null;
  }
  return `${metadata.dev}:${metadata.ino}`;
}

function systemdUnitObjectPath(unit) {
  const escaped = [...unit].map((character) => (
    /[A-Za-z0-9]/.test(character)
      ? character
      : `_${character.codePointAt(0).toString(16).padStart(2, "0")}`
  )).join("");
  return `/org/freedesktop/systemd1/unit/${escaped}`;
}

function readSystemdConditions({ serviceUnit }) {
  const result = withoutOutput(BUSCTL_PATH, [
    "--json=short",
    "get-property",
    "org.freedesktop.systemd1",
    systemdUnitObjectPath(serviceUnit),
    "org.freedesktop.systemd1.Unit",
    "Conditions"
  ]);
  if (!result || result.error || result.status !== 0) return null;
  try {
    const parsed = JSON.parse(String(result.stdout || ""));
    return Array.isArray(parsed?.data) ? parsed.data : null;
  } catch {
    return null;
  }
}

function hasRuntimeConditionStartGuard({ serviceUnit, dropInPaths }) {
  const paths = runtimeConditionStartGuardPaths({ serviceUnit });
  if (!dropInPaths.includes(paths.dropInPath)) return null;
  try {
    protectedRootOwnedPath(paths.dropInDirectory, {
      kind: "directory",
      condition: "service_start_guard_missing"
    });
    protectedRootOwnedPath(paths.blockDirectory, {
      kind: "directory",
      condition: "service_start_guard_missing"
    });
    const dropInPath = protectedRootOwnedPath(paths.dropInPath, {
      kind: "file",
      condition: "service_start_guard_missing"
    });
    const blockPath = protectedRootOwnedPath(paths.blockPath, {
      kind: "file",
      condition: "service_start_guard_missing",
      ownerOnly: true
    });
    const dropInMetadata = statSync(dropInPath);
    const blockMetadata = statSync(blockPath);
    if (blockMetadata.size !== 0) return null;
    if (readFileSync(dropInPath, "utf8") !== expectedRuntimeConditionStartGuardText(paths.blockPath)) {
      return null;
    }
    const conditions = readSystemdConditions({ serviceUnit });
    if (!Array.isArray(conditions) || !conditions.some((condition) => (
      Array.isArray(condition)
      && condition.length === 5
      && condition[0] === "ConditionPathExists"
      && condition[1] === false
      && condition[2] === true
      && condition[3] === paths.blockPath
      && Number.isInteger(condition[4])
      && condition[4] <= 0
    ))) {
      return null;
    }
    const dropInIdentity = guardFileIdentity(dropInMetadata);
    const blockIdentity = guardFileIdentity(blockMetadata);
    return dropInIdentity && blockIdentity
      ? `runtime-condition-v1:${dropInIdentity}:${blockIdentity}`
      : null;
  } catch {
    return null;
  }
}

function safeExpectedServiceState(value) {
  if (!SERVICE_STATES.has(value)) fail("invalid_input");
  return value;
}

function exactCreatedAt(value) {
  const parsed = new Date(value ?? new Date().toISOString());
  if (Number.isNaN(parsed.getTime())) fail("invalid_created_at");
  return parsed.toISOString();
}

function fileMode(path) {
  return (statSync(path).mode & 0o777).toString(8).padStart(4, "0");
}

function fsyncFile(path) {
  let descriptor;
  try {
    descriptor = openSync(path, "r+");
    fsyncSync(descriptor);
  } catch {
    fail("snapshot_publish_failed");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function fsyncDirectory(path, condition = "snapshot_publish_failed") {
  if (process.platform === "win32") return;
  let descriptor;
  try {
    descriptor = openSync(path, "r");
    fsyncSync(descriptor);
  } catch {
    fail(condition);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function sha256File(path) {
  let descriptor;
  try {
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(64 * 1024);
    descriptor = openSync(path, "r");
    let bytesRead;
    do {
      bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
    return hash.digest("hex");
  } catch {
    fail("snapshot_unavailable");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function expectedSnapshotPath(directory, snapshotFile) {
  const path = resolve(directory, snapshotFile);
  if (dirname(path) !== directory || basename(path) !== snapshotFile) {
    fail("manifest_invalid");
  }
  return path;
}

function companionPaths(dbPath) {
  return [`${dbPath}-wal`, `${dbPath}-shm`];
}

function assertSafeCompanionFiles(dbPath, condition) {
  for (const path of companionPaths(dbPath)) {
    if (!existsSync(path)) continue;
    let metadata;
    try {
      metadata = lstatSync(path);
    } catch {
      fail(condition);
    }
    if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.nlink !== 1) {
      fail(condition);
    }
  }
}

function assertNoCompanionFiles(dbPath, condition) {
  assertSafeCompanionFiles(dbPath, condition);
  if (companionPaths(dbPath).some(existsSync)) fail(condition);
}

function assertDatabaseOwner(dbPath) {
  if (process.platform !== "linux") return;
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  if (!Number.isSafeInteger(uid) || statSync(dbPath).uid !== uid) {
    fail("database_owner_mismatch");
  }
}

function databaseHealth(path, { expectedHash, expectedSizeBytes } = {}) {
  assertNoCompanionFiles(path, "snapshot_sidecar_present");
  let database;
  try {
    database = new Database(path, { readonly: true, fileMustExist: true });
    database.pragma("query_only = ON");
    const quick = database.pragma("quick_check");
    const quickCheck = quick.length === 1 && quick[0]?.quick_check === "ok";
    if (!quickCheck) fail("quick_check_failed");
    const foreignKeyViolations = database.pragma("foreign_key_check").length;
    if (foreignKeyViolations !== 0) fail("foreign_key_check_failed");
    const sizeBytes = statSync(path).size;
    const sha256 = sha256File(path);
    if (
      (expectedHash && sha256 !== expectedHash)
      || (expectedSizeBytes !== undefined && sizeBytes !== expectedSizeBytes)
    ) {
      fail("snapshot_identity_mismatch");
    }
    const identity = {
      sha256,
      sizeBytes,
      quickCheck: true,
      foreignKeys: true,
      schemaVersion: database.pragma("schema_version", { simple: true }),
      journalMode: String(database.pragma("journal_mode", { simple: true }) || "unknown")
    };
    if (identity.journalMode.toLowerCase() !== "delete") {
      fail("snapshot_sidecar_present");
    }
    return identity;
  } catch (error) {
    if (error instanceof ControlPlaneDatabaseSnapshotGateError) throw error;
    fail(existsSync(path) ? "database_unavailable" : "database_missing");
  } finally {
    try {
      database?.close();
    } catch {
      fail("database_close_failed");
    }
    assertNoCompanionFiles(path, "snapshot_sidecar_present");
  }
}

function snapshotManifest({ snapshotFile, identity, createdAt, serviceState }) {
  return {
    schemaVersion: SCHEMA_VERSION,
    type: SNAPSHOT_TYPE,
    createdAt,
    serviceState,
    snapshotFile,
    snapshot: {
      sha256: identity.sha256,
      sizeBytes: identity.sizeBytes,
      quickCheck: true,
      foreignKeys: true,
      schemaVersion: identity.schemaVersion,
      journalMode: identity.journalMode
    }
  };
}

function readSnapshotManifest(manifestPath, snapshotPath) {
  const manifest = (() => {
    try {
      return JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch {
      fail("manifest_invalid");
    }
  })();
  const snapshot = manifest?.snapshot;
  const createdAt = typeof manifest?.createdAt === "string" ? new Date(manifest.createdAt) : null;
  if (
    manifest?.schemaVersion !== SCHEMA_VERSION
    || manifest?.type !== SNAPSHOT_TYPE
    || !createdAt
    || Number.isNaN(createdAt.getTime())
    || createdAt.toISOString() !== manifest.createdAt
    || !SERVICE_STATES.has(manifest?.serviceState)
    || !SNAPSHOT_FILE_PATTERN.test(String(manifest?.snapshotFile ?? ""))
    || basename(snapshotPath) !== manifest.snapshotFile
    || !/^[a-f0-9]{64}$/.test(String(snapshot?.sha256 ?? ""))
    || !Number.isSafeInteger(snapshot?.sizeBytes)
    || snapshot.sizeBytes <= 0
    || snapshot?.quickCheck !== true
    || snapshot?.foreignKeys !== true
    || !Number.isSafeInteger(snapshot?.schemaVersion)
    || snapshot.schemaVersion < 0
    || typeof snapshot?.journalMode !== "string"
    || snapshot.journalMode.length === 0
  ) {
    fail("manifest_invalid");
  }
  if (process.platform !== "win32" && fileMode(manifestPath) !== "0600") {
    fail("manifest_boundary_invalid");
  }
  return manifest;
}

function writeManifest(manifestPath, manifest) {
  const parent = dirname(manifestPath);
  const temporary = resolve(parent, `.${basename(manifestPath)}.${randomUUID()}.tmp`);
  let descriptor;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, `${JSON.stringify(manifest)}\n`);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    chmodSync(temporary, 0o600);
    renameSync(temporary, manifestPath);
    fsyncDirectory(parent);
  } catch (error) {
    try {
      if (descriptor !== undefined) closeSync(descriptor);
    } catch {}
    try {
      rmSync(temporary, { force: true });
    } catch {}
    if (error instanceof ControlPlaneDatabaseSnapshotGateError) throw error;
    fail("snapshot_publish_failed");
  }
}

function withoutOutput(command, args) {
  if (command !== SYSTEMCTL_PATH && command !== BUSCTL_PATH) return null;
  try {
    return spawnSync(command, args, {
      encoding: "utf8",
      timeout: 5_000,
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
      env: SYSTEMD_COMMAND_ENV
    });
  } catch {
    return null;
  }
}

export function parseSystemdUnitShowProperties(stdout) {
  const values = new Map();
  for (const line of String(stdout ?? "").trim().split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator <= 0) fail("service_state_unavailable");
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (
      !SYSTEMD_UNIT_SHOW_PROPERTIES.has(key)
      || values.has(key)
      || (key !== "DropInPaths" && !/^[a-z-]+$/.test(value))
    ) {
      fail("service_state_unavailable");
    }
    values.set(key, value);
  }
  if (values.size !== SYSTEMD_UNIT_SHOW_PROPERTIES.size) fail("service_state_unavailable");
  const dropInPathsValue = values.get("DropInPaths");
  if (typeof dropInPathsValue !== "string") fail("service_state_unavailable");
  return Object.freeze({
    activeState: values.get("ActiveState"),
    unitFileState: values.get("UnitFileState"),
    loadState: values.get("LoadState"),
    needDaemonReload: values.get("NeedDaemonReload"),
    dropInPaths: Object.freeze(dropInPathsValue.trim().split(/\s+/).filter(Boolean))
  });
}

export function readSystemdUnitState({ serviceUnit } = {}) {
  const unit = safeServiceUnit(serviceUnit);
  if (process.platform !== "linux") fail("service_state_unavailable");
  const result = withoutOutput(SYSTEMCTL_PATH, [
    "show",
    "--property=ActiveState",
    "--property=UnitFileState",
    "--property=LoadState",
    "--property=NeedDaemonReload",
    "--property=DropInPaths",
    "--",
    unit
  ]);
  if (!result || result.error || result.status !== 0) fail("service_state_unavailable");
  const reported = parseSystemdUnitShowProperties(result.stdout);
  const runtimeConditionStartGuardIdentity = reported.loadState === "loaded"
    && reported.needDaemonReload === "no"
    && hasRuntimeConditionStartGuard({
      serviceUnit: unit,
      dropInPaths: reported.dropInPaths
    })
      || null;
  return Object.freeze({
    activeState: reported.activeState,
    unitFileState: reported.unitFileState,
    loadState: reported.loadState,
    needDaemonReload: reported.needDaemonReload,
    runtimeConditionStartGuard: runtimeConditionStartGuardIdentity !== null,
    runtimeConditionStartGuardIdentity
  });
}

export function readSystemdServiceState({ serviceUnit } = {}) {
  return readSystemdUnitState({ serviceUnit }).activeState;
}

function readUnitState({ serviceUnit, unitStateReader }) {
  const unit = safeServiceUnit(serviceUnit);
  let reported;
  try {
    reported = (unitStateReader ?? readSystemdUnitState)({ serviceUnit: unit });
  } catch (error) {
    if (error instanceof ControlPlaneDatabaseSnapshotGateError) throw error;
    fail("service_state_unavailable");
  }
  if (
    !reported
    || typeof reported !== "object"
    || !/^[a-z]+$/.test(reported.activeState)
    || !/^[a-z-]+$/.test(reported.unitFileState)
  ) {
    fail("service_state_unavailable");
  }
  if (
    typeof reported.runtimeConditionStartGuard !== "boolean"
    || (
      reported.runtimeConditionStartGuard === true
      && (typeof reported.runtimeConditionStartGuardIdentity !== "string"
        || reported.runtimeConditionStartGuardIdentity.length === 0)
    )
  ) {
    fail("service_state_unavailable");
  }
  return Object.freeze({
    activeState: reported.activeState,
    unitFileState: reported.unitFileState,
    runtimeConditionStartGuard: reported.runtimeConditionStartGuard,
    runtimeConditionStartGuardIdentity: reported.runtimeConditionStartGuardIdentity ?? null
  });
}

function assertServiceStartGuard({
  serviceUnit,
  expectedServiceState,
  unitStateReader,
  phase,
  expectedRuntimeConditionStartGuardIdentity = null
}) {
  const expected = safeExpectedServiceState(expectedServiceState);
  const actual = readUnitState({ serviceUnit, unitStateReader });
  if (!SERVICE_STATES.has(actual.activeState)) fail("service_state_unavailable");
  if (actual.activeState !== expected) {
    if (phase === "entry") fail("service_state_mismatch");
    fail("service_start_guard_changed");
  }
  if (actual.runtimeConditionStartGuard !== true) {
    if (phase === "entry") fail("service_start_guard_missing");
    fail("service_start_guard_changed");
  }
  if (
    expectedRuntimeConditionStartGuardIdentity !== null
    && actual.runtimeConditionStartGuardIdentity !== expectedRuntimeConditionStartGuardIdentity
  ) {
    fail("service_start_guard_changed");
  }
  return actual;
}

function closeQuiesceDatabase(database) {
  try {
    database?.close();
  } catch {
    fail("database_close_failed");
  }
}

function removeQuiescedSourceCompanions(sourcePath) {
  const [walPath, shmPath] = companionPaths(sourcePath);
  assertSafeCompanionFiles(sourcePath, "database_quiesce_failed");
  try {
    if (existsSync(walPath)) {
      if (statSync(walPath).size !== 0) fail("source_wal_not_quiesced");
      rmSync(walPath);
    }
    if (existsSync(shmPath)) rmSync(shmPath);
    fsyncDirectory(dirname(sourcePath), "database_quiesce_failed");
    assertNoCompanionFiles(sourcePath, "source_wal_not_quiesced");
  } catch (error) {
    if (error instanceof ControlPlaneDatabaseSnapshotGateError) throw error;
    fail("database_quiesce_failed");
  }
}

function quiesceAndCopySource({ sourcePath, temporarySnapshotPath }) {
  assertDatabaseOwner(sourcePath);
  assertSafeCompanionFiles(sourcePath, "database_boundary_invalid");
  let source;
  let transactionOpen = false;
  let checkpointComplete = false;
  let sourceClosed = false;
  try {
    source = new Database(sourcePath, { fileMustExist: true });
    source.pragma("busy_timeout = 0");
    const checkpoint = source.pragma("wal_checkpoint(TRUNCATE)");
    if (
      !Array.isArray(checkpoint)
      || checkpoint.length !== 1
      || checkpoint[0]?.busy !== 0
    ) {
      fail("database_quiesce_failed");
    }
    checkpointComplete = true;
    source.exec("BEGIN EXCLUSIVE");
    transactionOpen = true;
    copyFileSync(sourcePath, temporarySnapshotPath, fsConstants.COPYFILE_EXCL);
    chmodSync(temporarySnapshotPath, 0o600);
    fsyncFile(temporarySnapshotPath);
    source.exec("ROLLBACK");
    transactionOpen = false;
    closeQuiesceDatabase(source);
    source = null;
    sourceClosed = true;
    removeQuiescedSourceCompanions(sourcePath);
  } catch (error) {
    try {
      if (transactionOpen) source?.exec("ROLLBACK");
    } catch {}
    try {
      closeQuiesceDatabase(source);
      source = null;
      sourceClosed = true;
    } catch {}
    if (checkpointComplete && sourceClosed) {
      try {
        removeQuiescedSourceCompanions(sourcePath);
      } catch (cleanupError) {
        if (cleanupError instanceof ControlPlaneDatabaseSnapshotGateError) throw cleanupError;
        fail("database_quiesce_failed");
      }
    }
    if (error instanceof ControlPlaneDatabaseSnapshotGateError) throw error;
    fail("database_quiesce_failed");
  }
}

function normalizeStandaloneSnapshot(path) {
  let snapshot;
  try {
    snapshot = new Database(path, { fileMustExist: true });
    snapshot.pragma("busy_timeout = 0");
    const journalMode = String(snapshot.pragma("journal_mode = DELETE", { simple: true }) || "");
    if (journalMode.toLowerCase() !== "delete") fail("snapshot_sidecar_present");
  } catch (error) {
    if (error instanceof ControlPlaneDatabaseSnapshotGateError) throw error;
    fail("snapshot_unavailable");
  } finally {
    try {
      snapshot?.close();
    } catch {
      fail("database_close_failed");
    }
  }
  assertNoCompanionFiles(path, "snapshot_sidecar_present");
}

function removeSnapshotArtifact({ temporarySnapshotPath, finalSnapshotPath, manifestPath, snapshotPublished }) {
  for (const path of [
    ...(temporarySnapshotPath ? [
      temporarySnapshotPath,
      `${temporarySnapshotPath}-wal`,
      `${temporarySnapshotPath}-shm`
    ] : []),
    ...(snapshotPublished ? [finalSnapshotPath, `${finalSnapshotPath}-wal`, `${finalSnapshotPath}-shm`] : []),
    manifestPath
  ]) {
    try {
      rmSync(path, { force: true });
    } catch {}
  }
}

function createSnapshotArtifact({
  dbPath,
  snapshotDirectory,
  serviceState,
  createdAt,
  assertStartGuard
} = {}) {
  const sourcePath = existingPath(dbPath, { kind: "file", condition: "database_boundary_invalid" });
  const directory = protectedDirectory(snapshotDirectory, "snapshot_directory_invalid");
  const snapshotFile = `control-plane-db-${randomUUID()}.sqlite`;
  const finalSnapshotPath = expectedSnapshotPath(directory, snapshotFile);
  const manifestPath = `${finalSnapshotPath}.json`;
  const temporarySnapshotPath = resolve(directory, `.${snapshotFile}.${randomUUID()}.tmp`);
  if (existsSync(finalSnapshotPath) || existsSync(manifestPath) || existsSync(temporarySnapshotPath)) {
    fail("snapshot_publish_failed");
  }

  let snapshotPublished = false;
  try {
    assertStartGuard?.();
    quiesceAndCopySource({ sourcePath, temporarySnapshotPath });

    const temporaryPath = existingPath(temporarySnapshotPath, {
      kind: "file",
      condition: "snapshot_unavailable"
    });
    if (comparablePath(temporaryPath) !== comparablePath(temporarySnapshotPath)) {
      fail("snapshot_sidecar_present");
    }
    chmodSync(temporarySnapshotPath, 0o600);
    fsyncFile(temporarySnapshotPath);
    normalizeStandaloneSnapshot(temporarySnapshotPath);
    const identity = databaseHealth(temporarySnapshotPath);
    assertStartGuard?.();
    renameSync(temporarySnapshotPath, finalSnapshotPath);
    snapshotPublished = true;
    fsyncDirectory(directory);

    const manifest = snapshotManifest({
      snapshotFile,
      identity,
      createdAt: exactCreatedAt(createdAt),
      serviceState
    });
    writeManifest(manifestPath, manifest);
    assertStartGuard?.();
    return {
      snapshotPath: finalSnapshotPath,
      manifestPath,
      manifest,
      identity
    };
  } catch (error) {
    removeSnapshotArtifact({
      temporarySnapshotPath,
      finalSnapshotPath,
      manifestPath,
      snapshotPublished
    });
    if (error instanceof ControlPlaneDatabaseSnapshotGateError) throw error;
    fail("snapshot_unavailable");
  }
}

function captureCompanionBoundary(dbPath, condition) {
  assertSafeCompanionFiles(dbPath, condition);
  return new Map(companionPaths(dbPath).flatMap((path) => {
    if (!existsSync(path)) return [];
    try {
      const metadata = lstatSync(path, { bigint: true });
      if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.nlink !== 1n) {
        fail(condition);
      }
      return [[path, exactObjectIdentity(metadata, { requireSingleLink: true })]];
    } catch (error) {
      if (error instanceof ControlPlaneDatabaseSnapshotGateError) throw error;
      fail(condition);
    }
  }));
}

function assertNoNewCompanionFiles(dbPath, expected, condition) {
  assertSafeCompanionFiles(dbPath, condition);
  for (const path of companionPaths(dbPath)) {
    if (!existsSync(path)) continue;
    let identity;
    try {
      identity = exactObjectIdentity(lstatSync(path, { bigint: true }), {
        requireSingleLink: true
      });
    } catch (error) {
      if (error instanceof ControlPlaneDatabaseSnapshotGateError) throw error;
      fail(condition);
    }
    if (expected.get(path) !== identity) fail(condition);
  }
}

function copyDescriptorToExclusiveFile(sourceDescriptor, destinationPath) {
  let destinationDescriptor;
  const buffer = Buffer.allocUnsafe(64 * 1024);
  try {
    destinationDescriptor = openSync(destinationPath, "wx", 0o600);
    let offset = 0;
    let bytesRead;
    do {
      bytesRead = readSync(sourceDescriptor, buffer, 0, buffer.length, offset);
      if (bytesRead > 0) {
        let written = 0;
        while (written < bytesRead) {
          const bytesWritten = writeSync(
            destinationDescriptor,
            buffer,
            written,
            bytesRead - written,
            offset + written
          );
          if (bytesWritten <= 0) fail("snapshot_unavailable");
          written += bytesWritten;
        }
        offset += bytesRead;
      }
    } while (bytesRead > 0);
    fsyncSync(destinationDescriptor);
  } catch (error) {
    if (error instanceof ControlPlaneDatabaseSnapshotGateError) throw error;
    fail("snapshot_unavailable");
  } finally {
    buffer.fill(0);
    if (destinationDescriptor !== undefined) closeSync(destinationDescriptor);
  }
}

function retainedDirectoryAccessPath(directory, descriptor) {
  return process.platform === "linux" ? `/proc/self/fd/${descriptor}` : directory;
}

function fsyncRetainedDirectory(directory, descriptor, condition) {
  try {
    if (process.platform === "win32") {
      fsyncDirectory(directory, condition);
    } else {
      fsyncSync(descriptor);
    }
  } catch (error) {
    if (error instanceof ControlPlaneDatabaseSnapshotGateError) throw error;
    fail(condition);
  }
}

function removeSnapshotArtifactStrict({
  temporarySnapshotPath,
  finalSnapshotPath,
  manifestPath,
  snapshotPublished,
  directory,
  directoryDescriptor
}) {
  const paths = [
    ...(temporarySnapshotPath ? [
      temporarySnapshotPath,
      `${temporarySnapshotPath}-wal`,
      `${temporarySnapshotPath}-shm`
    ] : []),
    ...(snapshotPublished ? [
      finalSnapshotPath,
      `${finalSnapshotPath}-wal`,
      `${finalSnapshotPath}-shm`
    ] : []),
    manifestPath
  ].filter((path) => typeof path === "string" && path.length > 0);
  try {
    for (const path of paths) rmSync(path, { force: true });
    if (paths.some((path) => existsSync(path))) fail("database_custody_failed");
    fsyncRetainedDirectory(directory, directoryDescriptor, "database_custody_failed");
  } catch (error) {
    if (error instanceof ControlPlaneDatabaseSnapshotGateError) throw error;
    fail("database_custody_failed");
  }
}

function createSnapshotArtifactUnderExclusiveCustody({
  sourceDescriptor,
  snapshotDirectory,
  serviceState,
  createdAt,
  assertStartGuard
} = {}) {
  const directory = protectedDirectory(snapshotDirectory, "snapshot_directory_invalid");
  const directoryIdentity = directoryObjectIdentity(directory);
  const snapshotFile = `control-plane-db-${randomUUID()}.sqlite`;
  const finalSnapshotPath = expectedSnapshotPath(directory, snapshotFile);
  const manifestPath = `${finalSnapshotPath}.json`;
  let snapshotPublished = false;
  const custodyDescriptors = [];
  let directoryDescriptor;
  let storageDirectory;
  let storageFinalSnapshotPath;
  let storageManifestPath;
  let temporarySnapshotPath;
  try {
    const noFollow = fsConstants.O_NOFOLLOW ?? 0;
    directoryDescriptor = openSync(
      directory,
      fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0) | noFollow
    );
    custodyDescriptors.push(directoryDescriptor);
    if (exactObjectIdentity(fstatSync(directoryDescriptor, { bigint: true })) !== directoryIdentity) {
      fail("snapshot_directory_invalid");
    }
    storageDirectory = retainedDirectoryAccessPath(directory, directoryDescriptor);
    if (readdirSync(storageDirectory).length !== 0) fail("snapshot_directory_invalid");
    storageFinalSnapshotPath = resolve(storageDirectory, snapshotFile);
    storageManifestPath = `${storageFinalSnapshotPath}.json`;
    temporarySnapshotPath = resolve(storageDirectory, `.${snapshotFile}.${randomUUID()}.tmp`);
    assertStartGuard?.();
    copyDescriptorToExclusiveFile(sourceDescriptor, temporarySnapshotPath);
    chmodSync(temporarySnapshotPath, 0o600);
    normalizeStandaloneSnapshot(temporarySnapshotPath);
    const identity = databaseHealth(temporarySnapshotPath);
    assertStartGuard?.();
    renameSync(temporarySnapshotPath, storageFinalSnapshotPath);
    snapshotPublished = true;
    fsyncRetainedDirectory(directory, directoryDescriptor, "snapshot_publish_failed");
    const manifest = snapshotManifest({
      snapshotFile,
      identity,
      createdAt: exactCreatedAt(createdAt),
      serviceState
    });
    writeManifest(storageManifestPath, manifest);
    assertStartGuard?.();
    const snapshotDescriptor = openSync(storageFinalSnapshotPath, fsConstants.O_RDONLY | noFollow);
    custodyDescriptors.push(snapshotDescriptor);
    const manifestDescriptor = openSync(storageManifestPath, fsConstants.O_RDONLY | noFollow);
    custodyDescriptors.push(manifestDescriptor);
    return {
      snapshotPath: finalSnapshotPath,
      manifestPath,
      storageDirectory,
      storageSnapshotPath: storageFinalSnapshotPath,
      storageManifestPath,
      manifest,
      identity,
      custodyDescriptors,
      boundary: Object.freeze({
        directoryIdentity,
        snapshotIdentity: databaseObjectIdentity(storageFinalSnapshotPath),
        manifestIdentity: databaseObjectIdentity(storageManifestPath),
        manifestSha256: sha256File(storageManifestPath)
      })
    };
  } catch (error) {
    let cleanupFailed = false;
    const removePublishedArtifact = () => {
      if (directoryDescriptor === undefined) return;
      try {
        removeSnapshotArtifactStrict({
          temporarySnapshotPath,
          finalSnapshotPath: storageFinalSnapshotPath,
          manifestPath: storageManifestPath,
          snapshotPublished,
          directory,
          directoryDescriptor
        });
      } catch {
        cleanupFailed = true;
      }
    };
    const closeArtifactDescriptors = () => {
      try {
        closeSnapshotArtifactCustody({ custodyDescriptors });
      } catch {
        cleanupFailed = true;
      }
    };
    if (process.platform === "win32") {
      closeArtifactDescriptors();
      removePublishedArtifact();
    } else {
      removePublishedArtifact();
      closeArtifactDescriptors();
    }
    if (custodyDescriptors.length > 0) closeArtifactDescriptors();
    if (cleanupFailed) fail("database_custody_failed");
    if (error instanceof ControlPlaneDatabaseSnapshotGateError) throw error;
    fail("snapshot_unavailable");
  }
}

function snapshotIdentityMatches(expected, actual) {
  return expected.sha256 === actual.sha256
    && expected.sizeBytes === actual.sizeBytes
    && expected.quickCheck === actual.quickCheck
    && expected.foreignKeys === actual.foreignKeys
    && expected.schemaVersion === actual.schemaVersion
    && expected.journalMode === actual.journalMode;
}

function assertRetainedSnapshotArtifact(artifact) {
  const directory = dirname(artifact.snapshotPath);
  if (directoryObjectIdentity(directory) !== artifact.boundary.directoryIdentity) {
    fail("snapshot_directory_invalid");
  }
  const verified = verifiedSnapshot({
    snapshotPath: artifact.snapshotPath,
    manifestPath: artifact.manifestPath
  });
  if (!snapshotIdentityMatches(artifact.identity, verified.identity)) {
    fail("snapshot_unavailable");
  }
  const expectedEntries = [
    basename(artifact.snapshotPath),
    basename(artifact.manifestPath)
  ].sort();
  if (readdirSync(artifact.storageDirectory).sort().join("\0") !== expectedEntries.join("\0")) {
    fail("snapshot_directory_invalid");
  }
  if (
    databaseObjectIdentity(artifact.snapshotPath) !== artifact.boundary.snapshotIdentity
    || databaseObjectIdentity(artifact.storageSnapshotPath) !== artifact.boundary.snapshotIdentity
  ) {
    fail("snapshot_unavailable");
  }
  if (
    databaseObjectIdentity(artifact.manifestPath) !== artifact.boundary.manifestIdentity
    || databaseObjectIdentity(artifact.storageManifestPath) !== artifact.boundary.manifestIdentity
  ) {
    fail("manifest_boundary_invalid");
  }
  if (sha256File(artifact.storageManifestPath) !== artifact.boundary.manifestSha256) {
    fail("manifest_boundary_invalid");
  }
  const [directoryDescriptor, snapshotDescriptor, manifestDescriptor] = artifact.custodyDescriptors;
  if (
    exactObjectIdentity(fstatSync(snapshotDescriptor, { bigint: true }), {
      requireSingleLink: true
    }) !== artifact.boundary.snapshotIdentity
    || exactObjectIdentity(fstatSync(manifestDescriptor, { bigint: true }), {
      requireSingleLink: true
    }) !== artifact.boundary.manifestIdentity
    || exactObjectIdentity(fstatSync(directoryDescriptor, { bigint: true }))
      !== artifact.boundary.directoryIdentity
  ) {
    fail("snapshot_unavailable");
  }
}

function retainedSnapshotAccessPath(artifact) {
  if (process.platform !== "linux") return artifact.storageSnapshotPath;
  const snapshotDescriptor = artifact.custodyDescriptors[1];
  try {
    if (
      !Number.isInteger(snapshotDescriptor)
      || exactObjectIdentity(fstatSync(snapshotDescriptor, { bigint: true }), {
        requireSingleLink: true
      }) !== artifact.boundary.snapshotIdentity
    ) {
      fail("snapshot_unavailable");
    }
    return `/proc/self/fd/${snapshotDescriptor}`;
  } catch (error) {
    if (error instanceof ControlPlaneDatabaseSnapshotGateError) throw error;
    fail("snapshot_unavailable");
  }
}

function closeSnapshotArtifactCustody(artifact) {
  if (!artifact) return;
  const descriptors = [...artifact.custodyDescriptors];
  artifact.custodyDescriptors.length = 0;
  for (const descriptor of descriptors) {
    try {
      closeSync(descriptor);
    } catch {
      try {
        fstatSync(descriptor);
        artifact.custodyDescriptors.push(descriptor);
      } catch (error) {
        if (error?.code !== "EBADF") artifact.custodyDescriptors.push(descriptor);
      }
    }
  }
  if (artifact.custodyDescriptors.length > 0) {
    fail("database_custody_failed", { mutationPossible: true });
  }
}

function checkpointIsComplete(database) {
  const checkpoint = database.pragma("wal_checkpoint(TRUNCATE)");
  return Array.isArray(checkpoint)
    && checkpoint.length === 1
    && checkpoint[0]?.busy === 0;
}

function exactObjectIdentity(metadata, { requireSingleLink = false } = {}) {
  if (
    typeof metadata.dev !== "bigint"
    || typeof metadata.ino !== "bigint"
    || (requireSingleLink && metadata.nlink !== 1n)
    || metadata.dev < 0n
    || metadata.ino < 0n
  ) {
    fail("database_boundary_invalid");
  }
  return `${metadata.dev}:${metadata.ino}`;
}

function databaseObjectIdentity(path) {
  const metadata = lstatSync(path, { bigint: true });
  if (metadata.isSymbolicLink() || !metadata.isFile()) fail("database_boundary_invalid");
  return exactObjectIdentity(metadata, { requireSingleLink: true });
}

function directoryObjectIdentity(path) {
  const metadata = lstatSync(path, { bigint: true });
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) fail("database_boundary_invalid");
  return exactObjectIdentity(metadata);
}

function objectIdentitySha256(identity) {
  return createHash("sha256").update(identity).digest("hex");
}

function hashFramedValue(hash, value) {
  let tag;
  let bytes;
  if (value === null) {
    tag = "null";
    bytes = Buffer.alloc(0);
  } else if (typeof value === "bigint") {
    tag = "integer";
    bytes = Buffer.from(value.toString(10), "utf8");
  } else if (typeof value === "number" && Number.isFinite(value)) {
    tag = "real";
    bytes = Buffer.allocUnsafe(8);
    bytes.writeDoubleBE(value);
  } else if (typeof value === "string") {
    tag = "text";
    bytes = Buffer.from(value, "utf8");
  } else if (Buffer.isBuffer(value)) {
    tag = "blob";
    bytes = value;
  } else {
    fail("database_boundary_invalid");
  }
  const length = Buffer.allocUnsafe(8);
  length.writeBigUInt64BE(BigInt(bytes.length));
  hash.update(tag).update("\0").update(length).update(bytes);
}

function quotedSqliteIdentifier(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    fail("database_boundary_invalid");
  }
  return `"${value.replaceAll('"', '""')}"`;
}

function tableLogicalRowIdentity(database, tableName) {
  const table = database.prepare(`
    select type, wr
      from pragma_table_list
     where schema = 'main'
       and name = ?
  `).get(tableName);
  if (
    !table
    || !["table", "virtual", "shadow"].includes(table.type)
    || ![0, 1].includes(table.wr)
  ) {
    fail("database_boundary_invalid");
  }
  if (table.wr === 1) {
    return Object.freeze({ mode: "without-rowid", alias: null });
  }
  const declaredColumns = new Set(database.prepare(`
    select lower(name)
      from pragma_table_xinfo(?)
  `).pluck(true).all(tableName));
  const alias = ["_rowid_", "rowid", "oid"].find((candidate) => !declaredColumns.has(candidate));
  if (!alias) fail("database_boundary_invalid");
  return Object.freeze({ mode: "rowid", alias });
}

function databaseLogicalSha256(database) {
  try {
    const hash = createHash("sha256");
    hash.update("control-plane-logical-sqlite-v2\0");
    for (const pragma of ["application_id", "user_version", "schema_version"]) {
      hash.update(`pragma:${pragma}\0`);
      hashFramedValue(hash, BigInt(database.pragma(pragma, { simple: true })));
    }
    const journalMode = String(database.pragma("journal_mode", { simple: true }) || "")
      .toLowerCase();
    if (!["delete", "truncate", "persist", "memory", "wal", "off"].includes(journalMode)) {
      fail("database_boundary_invalid");
    }
    hash.update("pragma:journal_mode\0");
    hashFramedValue(hash, journalMode);
    const schemaRows = database.prepare(`
      select type, name, tbl_name, sql
        from sqlite_schema
       order by type asc, name asc, tbl_name asc
    `).raw(true).all();
    for (const row of schemaRows) {
      hash.update("schema\0");
      for (const value of row) hashFramedValue(hash, value);
    }
    const tableNames = database.prepare(`
      select name
        from sqlite_schema
       where type = 'table'
       order by name asc
    `).pluck(true).all();
    for (const tableName of tableNames) {
      hash.update("table\0");
      hashFramedValue(hash, tableName);
      const rowIdentity = tableLogicalRowIdentity(database, tableName);
      hash.update("row-identity\0");
      hashFramedValue(hash, rowIdentity.mode);
      hashFramedValue(hash, rowIdentity.alias);
      const rowIdentitySelection = rowIdentity.alias === null
        ? ""
        : `${quotedSqliteIdentifier(rowIdentity.alias)}, `;
      const statement = database.prepare(
        `select ${rowIdentitySelection}* from ${quotedSqliteIdentifier(tableName)}`
      )
        .raw(true)
        .safeIntegers(true);
      const columns = statement.columns().map(({ name }) => name);
      for (const column of columns) hashFramedValue(hash, column);
      const rowHashes = [];
      for (const row of statement.iterate()) {
        const rowHash = createHash("sha256");
        rowHash.update("row\0");
        for (const value of row) hashFramedValue(rowHash, value);
        rowHashes.push(rowHash.digest("hex"));
      }
      rowHashes.sort();
      hashFramedValue(hash, BigInt(rowHashes.length));
      for (const rowHash of rowHashes) hash.update(rowHash).update("\0");
    }
    return hash.digest("hex");
  } catch (error) {
    if (error instanceof ControlPlaneDatabaseSnapshotGateError) throw error;
    fail("database_boundary_invalid");
  }
}

function exactDatabaseBoundary(value) {
  const keys = ["logicalSha256", "objectIdentitySha256", "parentIdentitySha256"];
  if (
    !value
    || typeof value !== "object"
    || Object.keys(value).sort().join("\0") !== [...keys].sort().join("\0")
    || !keys.every((key) => /^[a-f0-9]{64}$/.test(value[key]))
  ) {
    fail("database_boundary_invalid");
  }
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, value[key]])));
}

export function inspectControlPlaneDatabaseBoundary({ dbPath } = {}) {
  const sourcePath = existingPath(dbPath, {
    kind: "file",
    condition: "database_boundary_invalid"
  });
  assertDatabaseOwner(sourcePath);
  assertSafeCompanionFiles(sourcePath, "database_boundary_invalid");
  const objectIdentity = databaseObjectIdentity(sourcePath);
  const parentIdentity = directoryObjectIdentity(dirname(sourcePath));
  let database;
  try {
    database = new Database(sourcePath, { readonly: true, fileMustExist: true });
    database.pragma("query_only = ON");
    return Object.freeze({
      objectIdentitySha256: objectIdentitySha256(objectIdentity),
      parentIdentitySha256: objectIdentitySha256(parentIdentity),
      logicalSha256: databaseLogicalSha256(database)
    });
  } catch (error) {
    if (error instanceof ControlPlaneDatabaseSnapshotGateError) throw error;
    fail("database_boundary_invalid");
  } finally {
    try {
      database?.close();
    } catch {
      fail("database_close_failed");
    }
  }
}

function databaseBoundaryMatches({ sourcePath, database, expected }) {
  return databasePathBoundaryMatches({ sourcePath, expected })
    && databaseLogicalSha256(database) === expected.logicalSha256;
}

function databasePathBoundaryMatches({ sourcePath, expected }) {
  return objectIdentitySha256(databaseObjectIdentity(sourcePath)) === expected.objectIdentitySha256
    && objectIdentitySha256(directoryObjectIdentity(dirname(sourcePath))) === expected.parentIdentitySha256;
}

function reconcileTerminalDatabaseConnection({
  database,
  connectionDescriptor,
  transactionOpen
}) {
  let failureObserved = false;
  if (database?.open === true && (transactionOpen || database.inTransaction === true)) {
    try {
      database.exec("ROLLBACK");
    } catch {
      failureObserved = true;
    }
  }
  const rollbackConfirmed = !database
    || database.open !== true
    || database.inTransaction === false;
  let closeConfirmed = !database || database.open !== true;
  for (let attempt = 0; database?.open === true && attempt < 2; attempt += 1) {
    try {
      database.close();
    } catch {
      failureObserved = true;
    }
    closeConfirmed = database.open !== true;
  }
  let descriptorCloseConfirmed = process.platform !== "linux"
    || !Number.isInteger(connectionDescriptor);
  if (closeConfirmed) {
    try {
      assertLinuxConnectionDescriptorClosed(connectionDescriptor);
      descriptorCloseConfirmed = true;
    } catch {
      failureObserved = true;
      descriptorCloseConfirmed = false;
    }
  }
  return Object.freeze({
    rollbackConfirmed,
    closeConfirmed,
    descriptorCloseConfirmed,
    failureObserved
  });
}

function assertTerminalDatabaseBoundary({ sourcePath, expected, companionBoundary }) {
  let database;
  let connectionDescriptor;
  let terminalFailure = false;
  let transactionOpen = false;
  try {
    const terminalSourceIdentity = databaseObjectIdentity(sourcePath);
    if (
      objectIdentitySha256(terminalSourceIdentity) !== expected.objectIdentitySha256
      || objectIdentitySha256(directoryObjectIdentity(dirname(sourcePath)))
        !== expected.parentIdentitySha256
    ) {
      fail("database_custody_failed", { mutationPossible: true });
    }
    const beforeConnectionDescriptors = linuxDescriptorIdentityMap();
    database = new Database(sourcePath, { fileMustExist: true });
    connectionDescriptor = linuxNewConnectionDescriptor({
      beforeConnectionDescriptors,
      expectedIdentity: terminalSourceIdentity
    });
    assertLinuxConnectionDescriptor(connectionDescriptor, terminalSourceIdentity);
    database.pragma("busy_timeout = 0");
    const lockingMode = String(database.pragma("locking_mode = EXCLUSIVE", { simple: true }) || "");
    if (lockingMode.toLowerCase() !== "exclusive") {
      fail("database_custody_failed", { mutationPossible: true });
    }
    database.exec("BEGIN EXCLUSIVE");
    transactionOpen = true;
    if (
      !database.inTransaction
      || !databasePathBoundaryMatches({ sourcePath, expected })
      || databaseLogicalSha256(database) !== expected.logicalSha256
    ) {
      fail("database_custody_failed", { mutationPossible: true });
    }
    assertLinuxConnectionDescriptor(connectionDescriptor, terminalSourceIdentity);
    database.exec("ROLLBACK");
    transactionOpen = false;
    if (database.inTransaction) fail("database_custody_failed", { mutationPossible: true });
  } catch {
    terminalFailure = true;
  }
  const reconciliation = reconcileTerminalDatabaseConnection({
    database,
    connectionDescriptor,
    transactionOpen
  });
  if (
    terminalFailure
    || reconciliation.failureObserved
    || !reconciliation.rollbackConfirmed
    || !reconciliation.closeConfirmed
    || !reconciliation.descriptorCloseConfirmed
  ) {
    fail("database_custody_failed", { mutationPossible: true });
  }
  database = null;
  try {
    if (!databasePathBoundaryMatches({ sourcePath, expected })) {
      fail("database_custody_failed", { mutationPossible: true });
    }
    assertNoNewCompanionFiles(sourcePath, companionBoundary, "database_custody_failed");
  } catch {
    fail("database_custody_failed", { mutationPossible: true });
  }
}

function linuxDescriptorIdentityMap() {
  if (process.platform !== "linux") return null;
  try {
    const identities = new Map();
    for (const entry of readdirSync("/proc/self/fd")) {
      if (!/^\d+$/.test(entry)) continue;
      const descriptor = Number(entry);
      try {
        identities.set(
          descriptor,
          exactObjectIdentity(fstatSync(descriptor, { bigint: true }))
        );
      } catch {}
    }
    return identities;
  } catch {
    fail("database_boundary_invalid");
  }
}

function newMatchingDescriptorNumbers({
  beforeConnectionDescriptors,
  currentConnectionDescriptors,
  expectedIdentity
}) {
  return [...currentConnectionDescriptors].flatMap(([descriptor, identity]) => {
    if (beforeConnectionDescriptors.get(descriptor) === identity) return [];
    return identity === expectedIdentity ? [descriptor] : [];
  });
}

function linuxNewConnectionDescriptor({ beforeConnectionDescriptors, expectedIdentity }) {
  if (process.platform !== "linux") return null;
  try {
    const matches = newMatchingDescriptorNumbers({
      beforeConnectionDescriptors,
      currentConnectionDescriptors: linuxDescriptorIdentityMap(),
      expectedIdentity
    });
    if (matches.length !== 1) fail("database_boundary_invalid");
    return matches[0];
  } catch {
    fail("database_boundary_invalid");
  }
}

function assertLinuxConnectionDescriptor(connectionDescriptor, expectedIdentity) {
  if (process.platform !== "linux") return;
  try {
    if (
      !Number.isInteger(connectionDescriptor)
      || exactObjectIdentity(fstatSync(connectionDescriptor, { bigint: true })) !== expectedIdentity
    ) {
      fail("database_boundary_invalid");
    }
  } catch (error) {
    if (error instanceof ControlPlaneDatabaseSnapshotGateError) throw error;
    fail("database_boundary_invalid");
  }
}

function assertLinuxConnectionDescriptorClosed(connectionDescriptor) {
  if (process.platform !== "linux" || !Number.isInteger(connectionDescriptor)) return;
  try {
    fstatSync(connectionDescriptor);
  } catch (error) {
    if (error?.code === "EBADF") return;
    fail("database_custody_failed", { mutationPossible: true });
  }
  fail("database_custody_failed", { mutationPossible: true });
}

class WelcomeCoinsSchemaCustodyGateError extends Error {
  constructor(condition, { mutationPossible = false } = {}) {
    super(condition);
    this.name = "WelcomeCoinsSchemaCustodyGateError";
    this.condition = condition;
    this.mutationPossible = mutationPossible === true;
  }
}

function failWelcomeCoinsSchema(condition, options) {
  throw new WelcomeCoinsSchemaCustodyGateError(condition, options);
}

function welcomeCoinsSchemaOperationFrom(operations, name) {
  const candidate = operations?.[name] ?? WELCOME_COINS_SCHEMA_DEFAULT_OPERATIONS[name];
  if (typeof candidate !== "function") failWelcomeCoinsSchema("invalid_input");
  return candidate;
}

function exactStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : null;
}

function exactWelcomeCoinsSchemaChecks(value) {
  if (!value || typeof value !== "object") return null;
  const keys = ["foundationDependency", "schemaExact", "quickCheck", "foreignKeys"];
  if (Object.keys(value).sort().join("\0") !== [...keys].sort().join("\0")) return null;
  if (!keys.every((key) => typeof value[key] === "boolean")) return null;
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, value[key]])));
}

function normalizedWelcomeCoinsSchemaInspection(value) {
  const checks = exactWelcomeCoinsSchemaChecks(value?.checks);
  const reasonCodes = exactStringArray(value?.reasonCodes);
  const pendingMigrationIds = exactStringArray(value?.pendingMigrationIds);
  if (
    !value
    || typeof value !== "object"
    || typeof value.ok !== "boolean"
    || !new Set(["ready", "pending", "blocked"]).has(value.schemaState)
    || value.requiredMigrationId !== WELCOME_COINS_SCHEMA_MIGRATION_ID
    || !checks
    || !reasonCodes
    || !pendingMigrationIds
  ) {
    failWelcomeCoinsSchema("database_inspection_failed");
  }
  return Object.freeze({
    ok: value.ok,
    schemaState: value.schemaState,
    checks,
    reasonCodes: Object.freeze([...reasonCodes]),
    pendingMigrationIds: Object.freeze([...pendingMigrationIds])
  });
}

function exactArraysEqual(left, right) {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function welcomeCoinsSchemaIsReady(value) {
  return value.ok
    && value.schemaState === "ready"
    && value.checks.foundationDependency
    && value.checks.schemaExact
    && value.checks.quickCheck
    && value.checks.foreignKeys
    && value.reasonCodes.length === 0
    && value.pendingMigrationIds.length === 0;
}

function welcomeCoinsSchemaIsExactPending(value) {
  return !value.ok
    && value.schemaState === "pending"
    && value.checks.foundationDependency
    && !value.checks.schemaExact
    && value.checks.quickCheck
    && value.checks.foreignKeys
    && exactArraysEqual(value.reasonCodes, ["required_migration_missing"])
    && value.pendingMigrationIds.length > 0
    && exactArraysEqual(
      value.pendingMigrationIds,
      WELCOME_COINS_SCHEMA_MIGRATION_IDS.slice(
        WELCOME_COINS_SCHEMA_MIGRATION_IDS.length - value.pendingMigrationIds.length
      )
    );
}

function normalizedWelcomeCoinsSchemaApply(value, expectedPendingMigrationIds) {
  const inspection = normalizedWelcomeCoinsSchemaInspection(value);
  const appliedMigrationIds = exactStringArray(value?.appliedMigrationIds);
  if (
    !welcomeCoinsSchemaIsReady(inspection)
    || typeof value?.sourceChanged !== "boolean"
    || !appliedMigrationIds
    || value.sourceChanged !== (expectedPendingMigrationIds.length > 0)
    || !exactArraysEqual(appliedMigrationIds, expectedPendingMigrationIds)
  ) {
    failWelcomeCoinsSchema("applied_schema_incompatible", { mutationPossible: true });
  }
  return Object.freeze({
    sourceChanged: value.sourceChanged,
    appliedMigrationIds: Object.freeze([...appliedMigrationIds])
  });
}

function assertWelcomeCoinsSchemaDryRun(value, expectedPendingMigrationIds) {
  const inspection = normalizedWelcomeCoinsSchemaInspection(value);
  const appliedMigrationIds = exactStringArray(value?.appliedMigrationIds);
  if (
    !inspection.ok
    || inspection.schemaState !== "ready"
    || !inspection.checks.foundationDependency
    || !inspection.checks.schemaExact
    || !inspection.checks.quickCheck
    || !inspection.checks.foreignKeys
    || inspection.reasonCodes.length !== 0
    || value?.mode !== "dry-run"
    || value?.sourceChanged !== false
    || !appliedMigrationIds
    || !exactArraysEqual(appliedMigrationIds, expectedPendingMigrationIds)
    || !exactArraysEqual(inspection.pendingMigrationIds, expectedPendingMigrationIds)
  ) {
    failWelcomeCoinsSchema("applied_schema_incompatible");
  }
}

function exactWelcomeCoinsMigrationContract({
  serviceUnit,
  expectedServiceState,
  expectedMigrationId,
  expectedDdlChecksum,
  operations
}) {
  if (serviceUnit !== WELCOME_COINS_SCHEMA_SERVICE_UNIT) {
    failWelcomeCoinsSchema("service_unit_invalid");
  }
  if (expectedServiceState !== WELCOME_COINS_SCHEMA_EXPECTED_SERVICE_STATE) {
    failWelcomeCoinsSchema("service_state_mismatch");
  }
  if (expectedMigrationId !== WELCOME_COINS_SCHEMA_MIGRATION_ID) {
    failWelcomeCoinsSchema("migration_id_mismatch");
  }
  if (expectedDdlChecksum !== WELCOME_COINS_SCHEMA_DDL_CHECKSUM) {
    failWelcomeCoinsSchema("migration_checksum_mismatch");
  }
  welcomeCoinsSchemaOperationFrom(
    operations,
    "validatePortalRegistrationWelcomeBonusSchema"
  );
  welcomeCoinsSchemaOperationFrom(
    operations,
    "dryRunPortalRegistrationWelcomeBonusMigrations"
  );
  welcomeCoinsSchemaOperationFrom(
    operations,
    "applyPortalRegistrationWelcomeBonusMigrations"
  );
}

function exactWelcomeCoinsSchemaExecutionInputs({
  dbPath,
  snapshotDirectory,
  tempRoot,
  createdAt
}) {
  if (![dbPath, snapshotDirectory, tempRoot].every(isFullyQualifiedPath)) {
    failWelcomeCoinsSchema("path_must_be_absolute");
  }
  const parsed = typeof createdAt === "string" ? new Date(createdAt) : null;
  if (
    !parsed
    || Number.isNaN(parsed.getTime())
    || parsed.toISOString() !== createdAt
  ) {
    failWelcomeCoinsSchema("invalid_created_at");
  }
}

function protectedWelcomeCoinsSchemaDirectory(path, condition, { empty = false } = {}) {
  try {
    const metadata = lstatSync(path);
    const real = realpathSync(path);
    if (
      metadata.isSymbolicLink()
      || !metadata.isDirectory()
      || comparablePath(path) !== comparablePath(real)
    ) {
      failWelcomeCoinsSchema(condition);
    }
    if (process.platform === "linux") {
      const resolvedMetadata = statSync(real);
      const uid = typeof process.getuid === "function" ? process.getuid() : null;
      if (
        !Number.isSafeInteger(uid)
        || resolvedMetadata.uid !== uid
        || (resolvedMetadata.mode & 0o077) !== 0
      ) {
        failWelcomeCoinsSchema(condition);
      }
    }
    if (empty && readdirSync(real).length !== 0) failWelcomeCoinsSchema(condition);
    return real;
  } catch (error) {
    if (error instanceof WelcomeCoinsSchemaCustodyGateError) throw error;
    failWelcomeCoinsSchema(condition);
  }
}

function retainedDirectoryIdentity(metadata, condition) {
  if (
    typeof metadata.dev !== "bigint"
    || typeof metadata.ino !== "bigint"
    || metadata.dev < 0n
    || metadata.ino < 0n
  ) {
    failWelcomeCoinsSchema(condition);
  }
  return `${metadata.dev}:${metadata.ino}`;
}

function retainProtectedDirectory(path, condition) {
  const real = protectedWelcomeCoinsSchemaDirectory(path, condition);
  let descriptor;
  try {
    const expectedIdentity = retainedDirectoryIdentity(
      lstatSync(real, { bigint: true }),
      condition
    );
    descriptor = openSync(
      real,
      fsConstants.O_RDONLY
        | (fsConstants.O_DIRECTORY ?? 0)
        | (fsConstants.O_NOFOLLOW ?? 0)
    );
    if (
      retainedDirectoryIdentity(fstatSync(descriptor, { bigint: true }), condition)
      !== expectedIdentity
    ) {
      failWelcomeCoinsSchema(condition);
    }
    return {
      descriptor,
      path: real,
      accessPath: process.platform === "linux" ? `/proc/self/fd/${descriptor}` : real,
      expectedIdentity
    };
  } catch (error) {
    try {
      if (descriptor !== undefined) closeSync(descriptor);
    } catch {}
    if (error instanceof WelcomeCoinsSchemaCustodyGateError) throw error;
    failWelcomeCoinsSchema(condition);
  }
}

function assertRetainedDirectory(custody, condition) {
  try {
    protectedWelcomeCoinsSchemaDirectory(custody.path, condition);
    if (
      retainedDirectoryIdentity(lstatSync(custody.path, { bigint: true }), condition)
        !== custody.expectedIdentity
      || retainedDirectoryIdentity(fstatSync(custody.descriptor, { bigint: true }), condition)
        !== custody.expectedIdentity
    ) {
      failWelcomeCoinsSchema(condition);
    }
  } catch (error) {
    if (error instanceof WelcomeCoinsSchemaCustodyGateError) throw error;
    failWelcomeCoinsSchema(condition);
  }
}

function closeRetainedDirectory(custody, { mutationPossible = false } = {}) {
  if (!custody || custody.descriptor === undefined) return;
  try {
    closeSync(custody.descriptor);
    custody.descriptor = undefined;
  } catch {
    failWelcomeCoinsSchema("database_custody_failed", { mutationPossible });
  }
}

function safeWelcomeCoinsSchemaReport({ inspection, sourceChanged, appliedMigrationIds }) {
  return Object.freeze({
    state: inspection.schemaState,
    sourceChanged: sourceChanged === true,
    checks: Object.freeze({ ...inspection.checks }),
    reasonCodes: Object.freeze([...inspection.reasonCodes]),
    appliedMigrationIds: Object.freeze([...appliedMigrationIds]),
    pendingMigrationIds: Object.freeze([...inspection.pendingMigrationIds])
  });
}

function exactWelcomeCoinsSchemaReadyCustodyResult(value) {
  const topLevelKeys = [
    "databaseCustody",
    "guardIdentitySha256",
    "schema",
    "schemaVersion",
    "snapshot",
    "state",
    "type"
  ];
  const snapshotKeys = ["foreignKeys", "id", "quickCheck", "schemaVersion", "sizeBytes"];
  const schemaKeys = [
    "appliedMigrationIds",
    "checks",
    "pendingMigrationIds",
    "reasonCodes",
    "sourceChanged",
    "state"
  ];
  const checks = exactWelcomeCoinsSchemaChecks(value?.schema?.checks);
  const appliedMigrationIds = exactStringArray(value?.schema?.appliedMigrationIds);
  const pendingMigrationIds = exactStringArray(value?.schema?.pendingMigrationIds);
  const reasonCodes = exactStringArray(value?.schema?.reasonCodes);
  if (
    !exactKeySet(value, topLevelKeys)
    || value.schemaVersion !== SCHEMA_VERSION
    || value.type !== WELCOME_COINS_SCHEMA_CUSTODY_TYPE
    || value.state !== "schema_ready"
    || value.databaseCustody !== "exclusive"
    || !/^[a-f0-9]{64}$/u.test(value.guardIdentitySha256 ?? "")
    || !exactKeySet(value.snapshot, snapshotKeys)
    || !/^[a-f0-9]{64}$/u.test(value.snapshot.id ?? "")
    || !Number.isSafeInteger(value.snapshot.sizeBytes)
    || value.snapshot.sizeBytes <= 0
    || value.snapshot.quickCheck !== true
    || value.snapshot.foreignKeys !== true
    || !Number.isSafeInteger(value.snapshot.schemaVersion)
    || value.snapshot.schemaVersion < 0
    || !exactKeySet(value.schema, schemaKeys)
    || value.schema.state !== "ready"
    || typeof value.schema.sourceChanged !== "boolean"
    || !checks
    || !Object.values(checks).every((item) => item === true)
    || !appliedMigrationIds
    || !pendingMigrationIds
    || !reasonCodes
    || pendingMigrationIds.length !== 0
    || reasonCodes.length !== 0
    || value.schema.sourceChanged !== (appliedMigrationIds.length > 0)
    || !exactArraysEqual(
      appliedMigrationIds,
      WELCOME_COINS_SCHEMA_MIGRATION_IDS.slice(
        WELCOME_COINS_SCHEMA_MIGRATION_IDS.length - appliedMigrationIds.length
      )
    )
  ) {
    fail("database_custody_failed", { mutationPossible: true });
  }
  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    type: WELCOME_COINS_SCHEMA_CUSTODY_TYPE,
    state: "schema_ready",
    databaseCustody: "exclusive",
    guardIdentitySha256: value.guardIdentitySha256,
    snapshot: Object.freeze({
      id: value.snapshot.id,
      sizeBytes: value.snapshot.sizeBytes,
      quickCheck: true,
      foreignKeys: true,
      schemaVersion: value.snapshot.schemaVersion
    }),
    schema: Object.freeze({
      state: "ready",
      sourceChanged: value.schema.sourceChanged,
      checks,
      reasonCodes: Object.freeze([]),
      appliedMigrationIds: Object.freeze([...appliedMigrationIds]),
      pendingMigrationIds: Object.freeze([])
    })
  });
}

function welcomeCoinsSchemaReadyCustodyResult(custody) {
  return exactWelcomeCoinsSchemaReadyCustodyResult({
    schemaVersion: SCHEMA_VERSION,
    type: WELCOME_COINS_SCHEMA_CUSTODY_TYPE,
    state: "schema_ready",
    databaseCustody: "exclusive",
    guardIdentitySha256: custody.guardIdentitySha256,
    snapshot: {
      id: custody.snapshot.sha256,
      sizeBytes: custody.snapshot.sizeBytes,
      quickCheck: custody.snapshot.quickCheck === true,
      foreignKeys: custody.snapshot.foreignKeys === true,
      schemaVersion: custody.snapshot.schemaVersion
    },
    schema: custody.operationResult
  });
}

async function applyWelcomeCoinsSchemaUnderCustodyCore({
  dbPath,
  snapshotDirectory,
  tempRoot,
  serviceUnit,
  expectedServiceState,
  expectedMigrationId,
  expectedDdlChecksum,
  createdAt,
  expectedDatabaseBoundary,
  expectedRuntimeConditionStartGuardIdentity,
  authorizeOperation,
  postCommitCustody,
  nowFn,
  unitStateReader,
  operations = WELCOME_COINS_SCHEMA_DEFAULT_OPERATIONS
} = {}) {
  exactWelcomeCoinsMigrationContract({
    serviceUnit,
    expectedServiceState,
    expectedMigrationId,
    expectedDdlChecksum,
    operations
  });
  exactWelcomeCoinsSchemaExecutionInputs({ dbPath, snapshotDirectory, tempRoot, createdAt });
  if (nowFn !== undefined && typeof nowFn !== "function") {
    failWelcomeCoinsSchema("invalid_input");
  }
  if (typeof postCommitCustody !== "function") {
    failWelcomeCoinsSchema("invalid_input");
  }
  protectedWelcomeCoinsSchemaDirectory(tempRoot, "temp_root_invalid");
  protectedWelcomeCoinsSchemaDirectory(
    snapshotDirectory,
    "snapshot_directory_invalid",
    { empty: true }
  );
  const validate = welcomeCoinsSchemaOperationFrom(
    operations,
    "validatePortalRegistrationWelcomeBonusSchema"
  );
  const dryRun = welcomeCoinsSchemaOperationFrom(
    operations,
    "dryRunPortalRegistrationWelcomeBonusMigrations"
  );
  const apply = welcomeCoinsSchemaOperationFrom(
    operations,
    "applyPortalRegistrationWelcomeBonusMigrations"
  );
  const tempRootCustody = retainProtectedDirectory(tempRoot, "temp_root_invalid");

  let schemaMutationCommitted = false;
  try {
    const custody = await withControlPlaneDatabaseExclusiveCustody({
      dbPath,
      snapshotDirectory,
      serviceUnit,
      expectedServiceState,
      createdAt,
      expectedDatabaseBoundary,
      expectedRuntimeConditionStartGuardIdentity,
      authorizeOperation,
      postCommitCustody: async (custodyHeld) => {
        await postCommitCustody(welcomeCoinsSchemaReadyCustodyResult(custodyHeld));
      },
      unitStateReader,
      operation: async ({ database, snapshotPath }) => {
        assertRetainedDirectory(tempRootCustody, "temp_root_invalid");
        const before = normalizedWelcomeCoinsSchemaInspection(await validate({ database }));
        if (welcomeCoinsSchemaIsReady(before)) {
          return safeWelcomeCoinsSchemaReport({
            inspection: before,
            sourceChanged: false,
            appliedMigrationIds: []
          });
        }
        if (!welcomeCoinsSchemaIsExactPending(before)) {
          const condition = before.reasonCodes.length === 1
            ? before.reasonCodes[0]
            : "database_inspection_failed";
          failWelcomeCoinsSchema(
            WELCOME_COINS_SCHEMA_SAFE_CONDITIONS.has(condition)
              ? condition
              : "database_inspection_failed"
          );
        }
        const pendingMigrationIds = [...before.pendingMigrationIds];
        assertWelcomeCoinsSchemaDryRun(await dryRun({
          dbPath: snapshotPath,
          tempRoot: tempRootCustody.accessPath
        }), pendingMigrationIds);
        assertRetainedDirectory(tempRootCustody, "temp_root_invalid");
        const applied = normalizedWelcomeCoinsSchemaApply(await apply({
          database,
          expectedMigrationId,
          expectedDdlChecksum,
          nowFn
        }), pendingMigrationIds);
        const after = normalizedWelcomeCoinsSchemaInspection(await validate({ database }));
        if (!welcomeCoinsSchemaIsReady(after)) {
          failWelcomeCoinsSchema("applied_schema_incompatible", { mutationPossible: true });
        }
        return safeWelcomeCoinsSchemaReport({
          inspection: after,
          sourceChanged: applied.sourceChanged,
          appliedMigrationIds: applied.appliedMigrationIds
        });
      }
    });
    schemaMutationCommitted = custody.operationResult.sourceChanged;
    assertRetainedDirectory(tempRootCustody, "temp_root_invalid");
    closeRetainedDirectory(tempRootCustody, { mutationPossible: schemaMutationCommitted });
    return welcomeCoinsSchemaReadyCustodyResult(custody);
  } catch (error) {
    closeRetainedDirectory(tempRootCustody, {
      mutationPossible: schemaMutationCommitted || error?.mutationPossible === true
    });
    if (error instanceof WelcomeCoinsSchemaCustodyGateError) {
      if (schemaMutationCommitted && !error.mutationPossible) {
        throw new WelcomeCoinsSchemaCustodyGateError(error.condition, {
          mutationPossible: true
        });
      }
      throw error;
    }
    if (error instanceof ControlPlaneDatabaseSnapshotGateError) {
      throw new WelcomeCoinsSchemaCustodyGateError(error.condition, {
        mutationPossible: schemaMutationCommitted || error.mutationPossible
      });
    }
    const code = typeof error?.code === "string" ? error.code : null;
    if (/^SQLITE_(?:BUSY|LOCKED)(?:_|$)/.test(code ?? "")) {
      failWelcomeCoinsSchema("database_custody_failed");
    }
    if (WELCOME_COINS_SCHEMA_SAFE_CONDITIONS.has(code)) failWelcomeCoinsSchema(code);
    failWelcomeCoinsSchema("unexpected_execution_failure");
  }
}

function exactKeySet(value, keys) {
  return value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function sha256CanonicalJson(value) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function exactProcessIdentity(value, { root = false } = {}) {
  const keys = ["gid", "pid", "startTimeTicks", "uid"];
  if (
    !exactKeySet(value, keys)
    || !Number.isSafeInteger(value.pid)
    || value.pid <= 0
    || typeof value.startTimeTicks !== "string"
    || !/^[1-9][0-9]*$/u.test(value.startTimeTicks)
    || !Number.isSafeInteger(value.uid)
    || !Number.isSafeInteger(value.gid)
    || (root ? value.uid !== 0 || value.gid !== 0 : value.uid <= 0 || value.gid <= 0)
  ) {
    fail("service_principal_identity_invalid");
  }
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, value[key]])));
}

function sameProcessIdentity(left, right) {
  return left.pid === right.pid
    && left.startTimeTicks === right.startTimeTicks
    && left.uid === right.uid
    && left.gid === right.gid;
}

function parseExactLinuxProcStatus(text) {
  if (typeof text !== "string" || text.includes("\0")) {
    fail("service_principal_identity_invalid");
  }
  const required = new Set([
    "CapAmb",
    "CapBnd",
    "CapEff",
    "CapInh",
    "CapPrm",
    "Gid",
    "Groups",
    "NoNewPrivs",
    "PPid",
    "TracerPid",
    "Uid"
  ]);
  const fields = new Map();
  for (const line of text.split("\n")) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const name = line.slice(0, separator);
    if (!required.has(name)) continue;
    if (fields.has(name)) fail("service_principal_identity_invalid");
    fields.set(name, line.slice(separator + 1).trim());
  }
  if ([...required].some((name) => !fields.has(name))) {
    fail("service_principal_identity_invalid");
  }
  const ids = (name) => {
    const parts = fields.get(name).split(/\s+/u);
    if (parts.length !== 4 || parts.some((part) => !/^(?:0|[1-9][0-9]*)$/u.test(part))) {
      fail("service_principal_identity_invalid");
    }
    const values = parts.map(Number);
    if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
      fail("service_principal_identity_invalid");
    }
    return values;
  };
  const integer = (name) => {
    const value = fields.get(name);
    if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) fail("service_principal_identity_invalid");
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0) fail("service_principal_identity_invalid");
    return parsed;
  };
  const capability = (name) => {
    const value = fields.get(name);
    if (!/^[a-fA-F0-9]{16}$/u.test(value)) fail("service_principal_identity_invalid");
    return value.toLowerCase();
  };
  const groupsText = fields.get("Groups");
  const groups = groupsText.length === 0
    ? []
    : groupsText.split(/\s+/u).map((part) => {
      if (!/^(?:0|[1-9][0-9]*)$/u.test(part)) fail("service_principal_identity_invalid");
      const value = Number(part);
      if (!Number.isSafeInteger(value) || value < 0) fail("service_principal_identity_invalid");
      return value;
    });
  return Object.freeze({
    uidSlots: Object.freeze(ids("Uid")),
    gidSlots: Object.freeze(ids("Gid")),
    groups: Object.freeze([...new Set(groups)].sort((left, right) => left - right)),
    capInh: capability("CapInh"),
    capPrm: capability("CapPrm"),
    capEff: capability("CapEff"),
    capBnd: capability("CapBnd"),
    capAmb: capability("CapAmb"),
    noNewPrivs: integer("NoNewPrivs"),
    tracerPid: integer("TracerPid"),
    parentPid: integer("PPid")
  });
}

function parseExactLinuxProcStatStartTime(text, expectedPid) {
  if (typeof text !== "string" || text.includes("\0")) {
    fail("service_principal_identity_invalid");
  }
  const close = text.lastIndexOf(")");
  const prefix = `${expectedPid} (`;
  if (!text.startsWith(prefix) || close < prefix.length || text[close + 1] !== " ") {
    fail("service_principal_identity_invalid");
  }
  const fields = text.slice(close + 2).trim().split(/\s+/u);
  const startTimeTicks = fields[19];
  if (fields.length < 20 || typeof startTimeTicks !== "string" || !/^[1-9][0-9]*$/u.test(startTimeTicks)) {
    fail("service_principal_identity_invalid");
  }
  return startTimeTicks;
}

function readWelcomeCoinsSchemaCustodyChildProcessSecurityContext() {
  try {
    if (
      process.platform !== "linux"
      || typeof process.getuid !== "function"
      || typeof process.geteuid !== "function"
      || typeof process.getgid !== "function"
      || typeof process.getegid !== "function"
      || typeof process.getgroups !== "function"
    ) {
      fail("service_principal_identity_invalid");
    }
    const uid = process.getuid();
    const euid = process.geteuid();
    const gid = process.getgid();
    const egid = process.getegid();
    const childStatus = parseExactLinuxProcStatus(readFileSync("/proc/self/status", "utf8"));
    const [statusUid, statusEuid, suid, fsuid] = childStatus.uidSlots;
    const [statusGid, statusEgid, sgid, fsgid] = childStatus.gidSlots;
    if (
      uid !== statusUid
      || euid !== statusEuid
      || gid !== statusGid
      || egid !== statusEgid
      || process.ppid !== childStatus.parentPid
    ) {
      fail("service_principal_identity_invalid");
    }
    const supplementaryGids = Object.freeze([
      ...new Set([...process.getgroups(), egid])
    ].sort((left, right) => left - right));
    const statusGroups = [...new Set([...childStatus.groups, egid])]
      .sort((left, right) => left - right);
    if (supplementaryGids.join("\0") !== statusGroups.join("\0")) {
      fail("service_principal_identity_invalid");
    }
    const procSelf = statSync("/proc/self");
    const childStartTimeTicks = parseExactLinuxProcStatStartTime(
      readFileSync("/proc/self/stat", "utf8"),
      process.pid
    );
    const parentStatus = parseExactLinuxProcStatus(
      readFileSync(`/proc/${process.ppid}/status`, "utf8")
    );
    if (
      parentStatus.uidSlots.some((value) => value !== 0)
      || parentStatus.gidSlots.some((value) => value !== 0)
    ) {
      fail("service_principal_identity_invalid");
    }
    const parentStartTimeTicks = parseExactLinuxProcStatStartTime(
      readFileSync(`/proc/${process.ppid}/stat`, "utf8"),
      process.ppid
    );
    return Object.freeze({
      pid: process.pid,
      startTimeTicks: childStartTimeTicks,
      uid,
      euid,
      suid,
      fsuid,
      gid,
      egid,
      sgid,
      fsgid,
      supplementaryGids,
      capInh: childStatus.capInh,
      capPrm: childStatus.capPrm,
      capEff: childStatus.capEff,
      capBnd: childStatus.capBnd,
      capAmb: childStatus.capAmb,
      noNewPrivs: childStatus.noNewPrivs,
      tracerPid: childStatus.tracerPid,
      procSelfOwnerUid: procSelf.uid,
      procSelfOwnerGid: procSelf.gid,
      parentIdentity: Object.freeze({
        pid: process.ppid,
        startTimeTicks: parentStartTimeTicks,
        uid: 0,
        gid: 0
      })
    });
  } catch (error) {
    if (error instanceof ControlPlaneDatabaseSnapshotGateError) throw error;
    fail("service_principal_identity_invalid");
  }
}

function assertWelcomeCoinsSchemaCustodyChildProcessSecurityContext(value, envelope) {
  const keys = [
    "capAmb",
    "capBnd",
    "capEff",
    "capInh",
    "capPrm",
    "egid",
    "euid",
    "fsgid",
    "fsuid",
    "gid",
    "noNewPrivs",
    "parentIdentity",
    "pid",
    "procSelfOwnerGid",
    "procSelfOwnerUid",
    "sgid",
    "startTimeTicks",
    "suid",
    "supplementaryGids",
    "tracerPid",
    "uid"
  ];
  const childIdentity = exactProcessIdentity({
    pid: value?.pid,
    startTimeTicks: value?.startTimeTicks,
    uid: value?.uid,
    gid: value?.gid
  });
  const parentIdentity = exactProcessIdentity(value?.parentIdentity, { root: true });
  const zeroCapability = "0000000000000000";
  if (
    !exactKeySet(value, keys)
    || childIdentity.uid !== envelope.serviceUid
    || childIdentity.gid !== envelope.serviceGid
    || value.euid !== envelope.serviceUid
    || value.suid !== envelope.serviceUid
    || value.fsuid !== envelope.serviceUid
    || value.egid !== envelope.serviceGid
    || value.sgid !== envelope.serviceGid
    || value.fsgid !== envelope.serviceGid
    || !Array.isArray(value.supplementaryGids)
    || value.supplementaryGids.length !== 1
    || value.supplementaryGids[0] !== envelope.serviceGid
    || value.capInh !== zeroCapability
    || value.capPrm !== zeroCapability
    || value.capEff !== zeroCapability
    || value.capBnd !== zeroCapability
    || value.capAmb !== zeroCapability
    || value.noNewPrivs !== 1
    || value.tracerPid !== 0
    || value.procSelfOwnerUid !== 0
    || value.procSelfOwnerGid !== 0
    || !sameProcessIdentity(childIdentity, envelope.childIdentity)
    || !sameProcessIdentity(parentIdentity, envelope.parentIdentity)
  ) {
    fail("service_principal_identity_invalid");
  }
  return Object.freeze({ childIdentity, parentIdentity });
}

function readWelcomeCoinsSchemaCustodyPipeEndpoint(descriptor, expectedAccessMode) {
  try {
    const metadata = fstatSync(descriptor, { bigint: true });
    const fdInfo = readFileSync(`/proc/self/fdinfo/${descriptor}`, "utf8");
    const flagsMatch = /^flags:\s*([0-7]+)$/mu.exec(fdInfo);
    if (!metadata.isFIFO() || !flagsMatch) fail("parent_authorization_invalid");
    const flags = BigInt(`0o${flagsMatch[1]}`);
    if (Number(flags & 0o3n) !== expectedAccessMode) fail("parent_authorization_invalid");
    const objectIdentitySha256 = sha256CanonicalJson({
      dev: metadata.dev.toString(10),
      ino: metadata.ino.toString(10)
    });
    return Object.freeze({
      objectIdentitySha256,
      channelIdentitySha256: sha256CanonicalJson({
        accessMode: expectedAccessMode,
        objectIdentitySha256
      })
    });
  } catch (error) {
    if (error instanceof ControlPlaneDatabaseSnapshotGateError) throw error;
    fail("parent_authorization_invalid");
  }
}

function createWelcomeCoinsSchemaCustodyChildChannel() {
  let capabilityOpen = true;
  let acquiredOpen = true;
  let authorizationOpen = true;
  let boundChannelIdentity = null;
  let channelIdentityRead = false;
  let acquiredFramesWritten = 0;
  let authorizationFramesRead = 0;

  const readCanonicalFrame = (descriptor, condition) => {
    const bytes = Buffer.alloc(WELCOME_COINS_SCHEMA_CUSTODY_FRAME_MAX_BYTES + 1);
    let total = 0;
    try {
      while (total <= WELCOME_COINS_SCHEMA_CUSTODY_FRAME_MAX_BYTES) {
        const count = readSync(descriptor, bytes, total, 1, null);
        if (count === 0) fail(condition);
        total += count;
        if (bytes[total - 1] === 0x0a) break;
      }
      if (
        total < 2
        || total > WELCOME_COINS_SCHEMA_CUSTODY_FRAME_MAX_BYTES
        || bytes[total - 1] !== 0x0a
      ) {
        fail(condition);
      }
      const text = bytes.subarray(0, total - 1).toString("utf8");
      if (text.includes("\n") || text.includes("\r")) fail(condition);
      const parsed = JSON.parse(text);
      if (JSON.stringify(parsed) !== text) fail(condition);
      return parsed;
    } catch (error) {
      if (error instanceof ControlPlaneDatabaseSnapshotGateError) throw error;
      fail(condition);
    } finally {
      bytes.fill(0);
    }
  };

  const assertCanonicalChannelEof = (descriptor, condition) => {
    const byte = Buffer.alloc(1);
    try {
      if (readSync(descriptor, byte, 0, 1, null) !== 0) fail(condition);
    } catch (error) {
      if (error instanceof ControlPlaneDatabaseSnapshotGateError) throw error;
      fail(condition);
    } finally {
      byte.fill(0);
    }
  };

  const writeCanonicalFrame = (descriptor, frame, condition) => {
    const text = JSON.stringify(frame);
    const bytes = Buffer.from(`${text}\n`, "utf8");
    try {
      if (
        bytes.length < 2
        || bytes.length > WELCOME_COINS_SCHEMA_CUSTODY_FRAME_MAX_BYTES
        || text.includes("\n")
        || text.includes("\r")
      ) {
        fail(condition);
      }
      let offset = 0;
      while (offset < bytes.length) {
        const count = writeSync(descriptor, bytes, offset, bytes.length - offset);
        if (count <= 0) fail(condition);
        offset += count;
      }
    } catch (error) {
      if (error instanceof ControlPlaneDatabaseSnapshotGateError) throw error;
      fail(condition);
    } finally {
      bytes.fill(0);
    }
  };

  return Object.freeze({
    async readExecutionEnvelope() {
      if (!capabilityOpen || process.platform !== "linux") {
        fail("execution_envelope_required");
      }
      let capabilityDescriptorOwned = false;
      try {
        let metadata;
        let fdInfo;
        try {
          metadata = fstatSync(WELCOME_COINS_SCHEMA_CUSTODY_CAPABILITY_FD);
          fdInfo = readFileSync(
            `/proc/self/fdinfo/${WELCOME_COINS_SCHEMA_CUSTODY_CAPABILITY_FD}`,
            "utf8"
          );
        } catch {
          fail("execution_envelope_required");
        }
        const flags = /^flags:\s*([0-7]+)$/mu.exec(fdInfo);
        if (
          !metadata.isFile()
          || metadata.uid !== 0
          || metadata.gid !== 0
          || metadata.nlink !== 0
          || (metadata.mode & 0o777) !== 0o400
          || (metadata.mode & 0o077) !== 0
          || !flags
          || (Number.parseInt(flags[1], 8) & 0o3) !== 0
        ) {
          fail("execution_envelope_required");
        }
        capabilityDescriptorOwned = true;
        return readCanonicalFrame(
          WELCOME_COINS_SCHEMA_CUSTODY_CAPABILITY_FD,
          "execution_envelope_invalid"
        );
      } finally {
        capabilityOpen = false;
        if (capabilityDescriptorOwned) {
          try {
            closeSync(WELCOME_COINS_SCHEMA_CUSTODY_CAPABILITY_FD);
          } catch {
            fail("execution_envelope_invalid");
          }
        }
      }
    },
    async readBoundChannelIdentity() {
      if (channelIdentityRead || !acquiredOpen || !authorizationOpen) {
        fail("parent_authorization_invalid");
      }
      const acquired = readWelcomeCoinsSchemaCustodyPipeEndpoint(
        WELCOME_COINS_SCHEMA_CUSTODY_ACQUIRED_FD,
        fsConstants.O_WRONLY
      );
      const authorization = readWelcomeCoinsSchemaCustodyPipeEndpoint(
        WELCOME_COINS_SCHEMA_CUSTODY_AUTHORIZATION_FD,
        fsConstants.O_RDONLY
      );
      if (acquired.objectIdentitySha256 === authorization.objectIdentitySha256) {
        fail("parent_authorization_invalid");
      }
      const processSecurityContext = readWelcomeCoinsSchemaCustodyChildProcessSecurityContext();
      boundChannelIdentity = Object.freeze({
        parentIdentity: processSecurityContext.parentIdentity,
        childIdentity: Object.freeze({
          pid: processSecurityContext.pid,
          startTimeTicks: processSecurityContext.startTimeTicks,
          uid: processSecurityContext.uid,
          gid: processSecurityContext.gid
        }),
        acquiredChannelIdentitySha256: acquired.channelIdentitySha256,
        authorizationChannelIdentitySha256: authorization.channelIdentitySha256
      });
      channelIdentityRead = true;
      return boundChannelIdentity;
    },
    async writeCustodyAcquired(frame) {
      if (
        !acquiredOpen
        || !channelIdentityRead
        || !boundChannelIdentity
        || acquiredFramesWritten !== 0
        || authorizationFramesRead !== 0
      ) {
        fail("parent_authorization_invalid");
      }
      const endpoint = readWelcomeCoinsSchemaCustodyPipeEndpoint(
        WELCOME_COINS_SCHEMA_CUSTODY_ACQUIRED_FD,
        fsConstants.O_WRONLY
      );
      if (endpoint.channelIdentitySha256 !== boundChannelIdentity.acquiredChannelIdentitySha256) {
        fail("parent_authorization_invalid");
      }
      writeCanonicalFrame(
        WELCOME_COINS_SCHEMA_CUSTODY_ACQUIRED_FD,
        frame,
        "parent_authorization_invalid"
      );
      acquiredFramesWritten = 1;
    },
    async readParentAuthorization() {
      if (
        !authorizationOpen
        || !channelIdentityRead
        || !boundChannelIdentity
        || acquiredFramesWritten !== 1
        || authorizationFramesRead !== 0
      ) {
        fail("parent_authorization_invalid");
      }
      const endpoint = readWelcomeCoinsSchemaCustodyPipeEndpoint(
        WELCOME_COINS_SCHEMA_CUSTODY_AUTHORIZATION_FD,
        fsConstants.O_RDONLY
      );
      if (endpoint.channelIdentitySha256 !== boundChannelIdentity.authorizationChannelIdentitySha256) {
        fail("parent_authorization_invalid");
      }
      const frame = readCanonicalFrame(
        WELCOME_COINS_SCHEMA_CUSTODY_AUTHORIZATION_FD,
        "parent_authorization_invalid"
      );
      authorizationFramesRead = 1;
      return frame;
    },
    async writeSchemaReadyCustodyHeld(frame) {
      if (
        !acquiredOpen
        || !channelIdentityRead
        || !boundChannelIdentity
        || acquiredFramesWritten !== 1
        || authorizationFramesRead !== 1
      ) {
        fail("parent_authorization_invalid", { mutationPossible: true });
      }
      try {
        const endpoint = readWelcomeCoinsSchemaCustodyPipeEndpoint(
          WELCOME_COINS_SCHEMA_CUSTODY_ACQUIRED_FD,
          fsConstants.O_WRONLY
        );
        if (endpoint.channelIdentitySha256 !== boundChannelIdentity.acquiredChannelIdentitySha256) {
          fail("parent_authorization_invalid", { mutationPossible: true });
        }
        writeCanonicalFrame(
          WELCOME_COINS_SCHEMA_CUSTODY_ACQUIRED_FD,
          frame,
          "parent_authorization_invalid"
        );
        acquiredFramesWritten = 2;
      } catch (error) {
        if (error instanceof ControlPlaneDatabaseSnapshotGateError && error.mutationPossible) {
          throw error;
        }
        fail("parent_authorization_invalid", { mutationPossible: true });
      } finally {
        try {
          closeSync(WELCOME_COINS_SCHEMA_CUSTODY_ACQUIRED_FD);
        } catch {
          fail("parent_authorization_invalid", { mutationPossible: true });
        }
        acquiredOpen = false;
      }
    },
    async readParentRelease() {
      if (
        !authorizationOpen
        || !channelIdentityRead
        || !boundChannelIdentity
        || acquiredFramesWritten !== 2
        || authorizationFramesRead !== 1
      ) {
        fail("parent_authorization_invalid", { mutationPossible: true });
      }
      try {
        const endpoint = readWelcomeCoinsSchemaCustodyPipeEndpoint(
          WELCOME_COINS_SCHEMA_CUSTODY_AUTHORIZATION_FD,
          fsConstants.O_RDONLY
        );
        if (endpoint.channelIdentitySha256 !== boundChannelIdentity.authorizationChannelIdentitySha256) {
          fail("parent_authorization_invalid", { mutationPossible: true });
        }
        const frame = readCanonicalFrame(
          WELCOME_COINS_SCHEMA_CUSTODY_AUTHORIZATION_FD,
          "parent_authorization_invalid"
        );
        authorizationFramesRead = 2;
        assertCanonicalChannelEof(
          WELCOME_COINS_SCHEMA_CUSTODY_AUTHORIZATION_FD,
          "parent_authorization_invalid"
        );
        return frame;
      } catch (error) {
        if (error instanceof ControlPlaneDatabaseSnapshotGateError && error.mutationPossible) {
          throw error;
        }
        fail("parent_authorization_invalid", { mutationPossible: true });
      } finally {
        try {
          closeSync(WELCOME_COINS_SCHEMA_CUSTODY_AUTHORIZATION_FD);
        } catch {
          fail("parent_authorization_invalid", { mutationPossible: true });
        }
        authorizationOpen = false;
      }
    }
  });
}

function exactWelcomeCoinsSchemaCustodyBoundChannelIdentity(value) {
  const keys = [
    "acquiredChannelIdentitySha256",
    "authorizationChannelIdentitySha256",
    "childIdentity",
    "parentIdentity"
  ];
  if (
    !exactKeySet(value, keys)
    || !/^[a-f0-9]{64}$/u.test(value.acquiredChannelIdentitySha256 ?? "")
    || !/^[a-f0-9]{64}$/u.test(value.authorizationChannelIdentitySha256 ?? "")
    || value.acquiredChannelIdentitySha256 === value.authorizationChannelIdentitySha256
  ) {
    fail("execution_envelope_invalid");
  }
  return Object.freeze({
    parentIdentity: exactProcessIdentity(value.parentIdentity, { root: true }),
    childIdentity: exactProcessIdentity(value.childIdentity),
    acquiredChannelIdentitySha256: value.acquiredChannelIdentitySha256,
    authorizationChannelIdentitySha256: value.authorizationChannelIdentitySha256
  });
}

function sameWelcomeCoinsSchemaCustodyBoundChannelIdentity(left, right) {
  return sameProcessIdentity(left.parentIdentity, right.parentIdentity)
    && sameProcessIdentity(left.childIdentity, right.childIdentity)
    && left.acquiredChannelIdentitySha256 === right.acquiredChannelIdentitySha256
    && left.authorizationChannelIdentitySha256 === right.authorizationChannelIdentitySha256;
}

function exactWelcomeCoinsSchemaCustodyChildEnvelope(value) {
  const topLevelKeys = [
    "acquiredChannelIdentitySha256",
    "authorizationChallengeSha256",
    "authorizationChannelIdentitySha256",
    "childIdentity",
    "custody",
    "initialExternalHolderCount",
    "parentIdentity",
    "schemaVersion",
    "serviceGid",
    "serviceUid",
    "type"
  ];
  const custodyKeys = [
    "createdAt",
    "dbPath",
    "expectedDatabaseBoundary",
    "expectedRuntimeConditionStartGuardIdentity",
    "expectedServiceState",
    "serviceUnit",
    "snapshotDirectory",
    "tempRoot"
  ];
  if (
    !value
    || typeof value !== "object"
    || Object.keys(value).sort().join("\0") !== [...topLevelKeys].sort().join("\0")
    || value.type !== WELCOME_COINS_SCHEMA_CUSTODY_CHILD_TYPE
    || value.schemaVersion !== SCHEMA_VERSION
    || !Number.isSafeInteger(value.serviceUid)
    || value.serviceUid <= 0
    || !Number.isSafeInteger(value.serviceGid)
    || value.serviceGid <= 0
    || value.initialExternalHolderCount !== 0
    || typeof value.authorizationChallengeSha256 !== "string"
    || !/^[a-f0-9]{64}$/u.test(value.authorizationChallengeSha256)
    || !value.custody
    || typeof value.custody !== "object"
    || Object.keys(value.custody).sort().join("\0") !== [...custodyKeys].sort().join("\0")
    || value.custody.serviceUnit !== WELCOME_COINS_SCHEMA_SERVICE_UNIT
    || value.custody.expectedServiceState !== WELCOME_COINS_SCHEMA_EXPECTED_SERVICE_STATE
    || !RUNTIME_CONDITION_START_GUARD_IDENTITY_PATTERN.test(
      value.custody.expectedRuntimeConditionStartGuardIdentity ?? ""
    )
    || ![value.custody.dbPath, value.custody.snapshotDirectory, value.custody.tempRoot]
      .every((path) => typeof path === "string" && path.startsWith("/") && !path.includes("\0"))
    || typeof value.custody.createdAt !== "string"
    || !Number.isFinite(Date.parse(value.custody.createdAt))
  ) {
    fail("execution_envelope_invalid");
  }
  try {
    const binding = exactWelcomeCoinsSchemaCustodyBoundChannelIdentity({
      parentIdentity: value.parentIdentity,
      childIdentity: value.childIdentity,
      acquiredChannelIdentitySha256: value.acquiredChannelIdentitySha256,
      authorizationChannelIdentitySha256: value.authorizationChannelIdentitySha256
    });
    if (binding.childIdentity.uid !== value.serviceUid || binding.childIdentity.gid !== value.serviceGid) {
      fail("execution_envelope_invalid");
    }
    exactDatabaseBoundary(value.custody.expectedDatabaseBoundary);
  } catch {
    fail("execution_envelope_invalid");
  }
  return value;
}

async function runWelcomeCoinsSchemaCustodyChildCore({
  capabilityChannel,
  readProcessSecurityContext,
  createAcquisitionProofSha256,
  exclusiveCustody,
  schemaOperation
} = {}) {
  if (
    !capabilityChannel
    || typeof capabilityChannel.readExecutionEnvelope !== "function"
    || typeof capabilityChannel.readBoundChannelIdentity !== "function"
    || typeof capabilityChannel.writeCustodyAcquired !== "function"
    || typeof capabilityChannel.readParentAuthorization !== "function"
    || typeof capabilityChannel.writeSchemaReadyCustodyHeld !== "function"
    || typeof capabilityChannel.readParentRelease !== "function"
    || typeof readProcessSecurityContext !== "function"
    || typeof createAcquisitionProofSha256 !== "function"
    || (exclusiveCustody !== undefined && typeof exclusiveCustody !== "function")
    || (schemaOperation !== undefined && typeof schemaOperation !== "function")
    || ((exclusiveCustody === undefined) !== (schemaOperation === undefined))
  ) {
    fail("execution_envelope_invalid");
  }
  const envelope = exactWelcomeCoinsSchemaCustodyChildEnvelope(
    await capabilityChannel.readExecutionEnvelope()
  );
  const expectedChannelBinding = exactWelcomeCoinsSchemaCustodyBoundChannelIdentity({
    parentIdentity: envelope.parentIdentity,
    childIdentity: envelope.childIdentity,
    acquiredChannelIdentitySha256: envelope.acquiredChannelIdentitySha256,
    authorizationChannelIdentitySha256: envelope.authorizationChannelIdentitySha256
  });
  const actualChannelBinding = exactWelcomeCoinsSchemaCustodyBoundChannelIdentity(
    await capabilityChannel.readBoundChannelIdentity()
  );
  if (!sameWelcomeCoinsSchemaCustodyBoundChannelIdentity(actualChannelBinding, expectedChannelBinding)) {
    fail("execution_envelope_invalid");
  }
  const assertProcessSecurityContext = () => {
    const identities = assertWelcomeCoinsSchemaCustodyChildProcessSecurityContext(
      readProcessSecurityContext(),
      envelope
    );
    if (
      !sameProcessIdentity(identities.childIdentity, actualChannelBinding.childIdentity)
      || !sameProcessIdentity(identities.parentIdentity, actualChannelBinding.parentIdentity)
    ) {
      fail("service_principal_identity_invalid");
    }
    return identities;
  };
  assertProcessSecurityContext();

  let authorizationRead = false;
  const authorizeSchemaApply = async () => {
    if (authorizationRead) fail("parent_authorization_invalid");
    assertProcessSecurityContext();
    const acquisitionProofSha256 = createAcquisitionProofSha256();
    if (!/^[a-f0-9]{64}$/u.test(acquisitionProofSha256 ?? "")) {
      fail("parent_authorization_invalid");
    }
    const acquiredFrame = Object.freeze({
      type: "welcome_coins_schema_custody_acquired",
      acquisitionProofSha256,
      childIdentity: actualChannelBinding.childIdentity,
      channelBinding: actualChannelBinding
    });
    await capabilityChannel.writeCustodyAcquired(acquiredFrame);
    const authorization = await capabilityChannel.readParentAuthorization();
    const keys = ["acquiredFrameSha256", "authorizationChallenge", "type"];
    if (
      !exactKeySet(authorization, keys)
      || authorization.type !== "authorize_schema_apply"
      || typeof authorization.authorizationChallenge !== "string"
      || !/^[a-f0-9]{64}$/u.test(authorization.authorizationChallenge)
      || authorization.acquiredFrameSha256 !== sha256CanonicalJson(acquiredFrame)
    ) {
      fail("parent_authorization_invalid");
    }
    const challengeBytes = Buffer.from(authorization.authorizationChallenge, "hex");
    try {
      if (
        challengeBytes.length !== 32
        || createHash("sha256").update(challengeBytes).digest("hex")
          !== envelope.authorizationChallengeSha256
      ) {
        fail("parent_authorization_invalid");
      }
    } finally {
      challengeBytes.fill(0);
    }
    assertProcessSecurityContext();
    authorizationRead = true;
  };

  let releaseRead = false;
  const holdSchemaReadyUntilParentRelease = async (schemaResult) => {
    if (!authorizationRead || releaseRead) {
      fail("parent_authorization_invalid", { mutationPossible: true });
    }
    assertProcessSecurityContext();
    const normalizedSchemaResult = exactWelcomeCoinsSchemaReadyCustodyResult(schemaResult);
    const heldFrame = Object.freeze({
      type: "schema_ready_custody_held",
      schemaResult: normalizedSchemaResult,
      childIdentity: actualChannelBinding.childIdentity,
      channelBinding: actualChannelBinding
    });
    await capabilityChannel.writeSchemaReadyCustodyHeld(heldFrame);
    const release = await capabilityChannel.readParentRelease();
    const releaseKeys = ["heldFrameSha256", "type"];
    if (
      !exactKeySet(release, releaseKeys)
      || !new Set([
        "release_after_activation_verified",
        "release_after_attention"
      ]).has(release.type)
      || release.heldFrameSha256 !== sha256CanonicalJson(heldFrame)
    ) {
      fail("parent_authorization_invalid", { mutationPossible: true });
    }
    assertProcessSecurityContext();
    releaseRead = true;
    if (release.type === "release_after_attention") {
      fail("database_custody_failed", { mutationPossible: true });
    }
  };

  if (schemaOperation) {
    const authorizedExclusiveCustody = ({
      operation,
      postCommitCustody: injectedPostCommitCustody,
      ...options
    } = {}) => {
      if (typeof operation !== "function" || injectedPostCommitCustody !== undefined) {
        fail("execution_envelope_invalid");
      }
      return exclusiveCustody({
        ...envelope.custody,
        ...options,
        operation: async (context) => {
          await authorizeSchemaApply();
          return operation(context);
        },
        postCommitCustody: holdSchemaReadyUntilParentRelease
      });
    };
    const result = await schemaOperation({
      exclusiveCustody: authorizedExclusiveCustody,
      expectedDatabaseBoundary: envelope.custody.expectedDatabaseBoundary
    });
    if (!releaseRead) fail("database_custody_failed", { mutationPossible: true });
    return result;
  }

  const result = await applyWelcomeCoinsSchemaUnderCustodyCore({
    ...envelope.custody,
    expectedMigrationId: WELCOME_COINS_SCHEMA_MIGRATION_ID,
    expectedDdlChecksum: WELCOME_COINS_SCHEMA_DDL_CHECKSUM,
    authorizeOperation: authorizeSchemaApply,
    postCommitCustody: holdSchemaReadyUntilParentRelease
  });
  if (!releaseRead) fail("database_custody_failed", { mutationPossible: true });
  return result;
}

function welcomeCoinsSchemaCustodyChildFailureReceipt(error) {
  const condition = error instanceof ControlPlaneDatabaseSnapshotGateError
    && SAFE_CONDITIONS.has(error.condition)
    ? error.condition
    : error instanceof WelcomeCoinsSchemaCustodyGateError
      && WELCOME_COINS_SCHEMA_SAFE_CONDITIONS.has(error.condition)
      ? error.condition
      : "unexpected_execution_failure";
  const mutationPossible = error?.mutationPossible === true;
  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    type: WELCOME_COINS_SCHEMA_CUSTODY_CHILD_TYPE,
    state: mutationPossible ? "attention_required" : "blocked",
    condition,
    ...(mutationPossible ? { mutationPossible: true } : {})
  });
}

export async function runWelcomeCoinsSchemaCustodyChildCli() {
  try {
    const result = await runWelcomeCoinsSchemaCustodyChildCore({
      capabilityChannel: createWelcomeCoinsSchemaCustodyChildChannel(),
      readProcessSecurityContext: readWelcomeCoinsSchemaCustodyChildProcessSecurityContext,
      createAcquisitionProofSha256: () => createHash("sha256")
        .update(randomBytes(32))
        .digest("hex")
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${JSON.stringify(welcomeCoinsSchemaCustodyChildFailureReceipt(error))}\n`);
    return 1;
  }
}

/**
 * Retains one SQLite EXCLUSIVE locking-mode connection from the verified
 * pre-migration snapshot through the caller-owned operation, its commit, and
 * one post-commit read-only hold. Point-in-time holder scans remain supporting
 * evidence only; this retained SQLite connection is the custody primitive.
 * The callbacks are in-process composition seams, not CLI extension points.
 */
async function withControlPlaneDatabaseExclusiveCustody({
  dbPath,
  snapshotDirectory,
  serviceUnit,
  expectedServiceState,
  createdAt,
  expectedDatabaseBoundary,
  expectedRuntimeConditionStartGuardIdentity,
  authorizeOperation,
  postCommitCustody,
  unitStateReader,
  operation
} = {}) {
  if (expectedServiceState !== "inactive") fail("service_state_mismatch");
  if (typeof operation !== "function") fail("invalid_input");
  if (authorizeOperation !== undefined && typeof authorizeOperation !== "function") {
    fail("invalid_input");
  }
  if (typeof postCommitCustody !== "function") fail("invalid_input");
  const expectedBoundary = exactDatabaseBoundary(expectedDatabaseBoundary);
  const entryGuard = assertServiceStartGuard({
    serviceUnit,
    expectedServiceState,
    unitStateReader,
    phase: "entry"
  });
  if (
    !RUNTIME_CONDITION_START_GUARD_IDENTITY_PATTERN.test(
      expectedRuntimeConditionStartGuardIdentity ?? ""
    )
    || entryGuard.runtimeConditionStartGuardIdentity !== expectedRuntimeConditionStartGuardIdentity
  ) {
    fail("service_start_guard_changed");
  }
  const guardIdentity = entryGuard.runtimeConditionStartGuardIdentity;
  const assertStartGuard = () => assertServiceStartGuard({
    serviceUnit,
    expectedServiceState,
    unitStateReader,
    phase: "boundary",
    expectedRuntimeConditionStartGuardIdentity: guardIdentity
  });
  const sourcePath = existingPath(dbPath, {
    kind: "file",
    condition: "database_boundary_invalid"
  });
  const sourceIdentity = databaseObjectIdentity(sourcePath);
  const parentIdentity = directoryObjectIdentity(dirname(sourcePath));
  if (
    objectIdentitySha256(sourceIdentity) !== expectedBoundary.objectIdentitySha256
    || objectIdentitySha256(parentIdentity) !== expectedBoundary.parentIdentitySha256
  ) {
    fail("database_boundary_invalid");
  }
  assertDatabaseOwner(sourcePath);
  assertSafeCompanionFiles(sourcePath, "database_boundary_invalid");

  let database;
  let sourceDescriptor;
  let parentDescriptor;
  let connectionDescriptor;
  let transactionOpen = false;
  let checkpointComplete = false;
  let mutationCommitted = false;
  let artifact = null;
  let companionBoundary = new Map();
  let operationFailure = null;
  let artifactFinalVerified = false;
  const closeBoundaryDescriptors = () => {
    let closeConfirmed = true;
    if (sourceDescriptor !== undefined) {
      try {
        closeSync(sourceDescriptor);
        sourceDescriptor = undefined;
      } catch {
        closeConfirmed = false;
      }
    }
    if (parentDescriptor !== undefined) {
      try {
        closeSync(parentDescriptor);
        parentDescriptor = undefined;
      } catch {
        closeConfirmed = false;
      }
    }
    return closeConfirmed;
  };
  try {
    const noFollow = fsConstants.O_NOFOLLOW ?? 0;
    sourceDescriptor = openSync(sourcePath, fsConstants.O_RDONLY | noFollow);
    if (exactObjectIdentity(fstatSync(sourceDescriptor, { bigint: true }), {
      requireSingleLink: true
    }) !== sourceIdentity) {
      fail("database_boundary_invalid");
    }
    if (process.platform === "linux") {
      parentDescriptor = openSync(
        dirname(sourcePath),
        fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0) | noFollow
      );
      if (exactObjectIdentity(fstatSync(parentDescriptor, { bigint: true })) !== parentIdentity) {
        fail("database_boundary_invalid");
      }
    }
    const beforeConnectionDescriptors = linuxDescriptorIdentityMap();
    database = new Database(sourcePath, { fileMustExist: true });
    connectionDescriptor = linuxNewConnectionDescriptor({
      beforeConnectionDescriptors,
      expectedIdentity: sourceIdentity
    });
    assertLinuxConnectionDescriptor(connectionDescriptor, sourceIdentity);
    database.pragma("busy_timeout = 0");
    database.pragma("foreign_keys = ON");
    if (database.pragma("foreign_keys", { simple: true }) !== 1) {
      fail("database_custody_failed");
    }
    const lockingMode = String(database.pragma("locking_mode = EXCLUSIVE", { simple: true }) || "");
    if (lockingMode.toLowerCase() !== "exclusive") fail("database_custody_failed");
    assertLinuxConnectionDescriptor(connectionDescriptor, sourceIdentity);
    if (!databaseBoundaryMatches({
      sourcePath,
      database,
      expected: expectedBoundary
    })) {
      fail("database_boundary_invalid");
    }
    checkpointComplete = checkpointIsComplete(database);
    if (!checkpointComplete) fail("database_custody_failed");
    database.exec("BEGIN EXCLUSIVE");
    transactionOpen = true;
    if (!database.inTransaction) fail("database_custody_failed");
    if (
      !databaseBoundaryMatches({ sourcePath, database, expected: expectedBoundary })
      || exactObjectIdentity(fstatSync(sourceDescriptor, { bigint: true }), {
        requireSingleLink: true
      }) !== sourceIdentity
    ) {
      fail("database_boundary_invalid", { mutationPossible: true });
    }
    assertLinuxConnectionDescriptor(connectionDescriptor, sourceIdentity);
    assertStartGuard();
    if (authorizeOperation) {
      await authorizeOperation();
      assertLinuxConnectionDescriptor(connectionDescriptor, sourceIdentity);
      assertStartGuard();
    }

    artifact = createSnapshotArtifactUnderExclusiveCustody({
      sourceDescriptor,
      snapshotDirectory,
      serviceState: entryGuard.activeState,
      createdAt,
      assertStartGuard
    });
    assertRetainedSnapshotArtifact(artifact);
    assertStartGuard();
    if (!databasePathBoundaryMatches({ sourcePath, expected: expectedBoundary })) {
      fail("database_boundary_invalid");
    }
    let operationResult;
    try {
      operationResult = await operation(Object.freeze({
        database,
        snapshotPath: retainedSnapshotAccessPath(artifact),
        manifestPath: artifact.manifestPath,
        snapshotIdentity: Object.freeze({ ...artifact.identity })
      }));
    } catch (error) {
      operationFailure = error;
      throw error;
    }
    if (!database.open || !database.inTransaction) {
      fail("database_custody_failed", { mutationPossible: true });
    }
    assertRetainedSnapshotArtifact(artifact);
    assertStartGuard();
    if (!databasePathBoundaryMatches({ sourcePath, expected: expectedBoundary })) {
      fail("database_boundary_invalid");
    }
    database.exec("COMMIT");
    transactionOpen = false;
    mutationCommitted = true;
    assertRetainedSnapshotArtifact(artifact);
    if (!databasePathBoundaryMatches({ sourcePath, expected: expectedBoundary })) {
      fail("database_boundary_invalid", { mutationPossible: true });
    }
    if (!checkpointIsComplete(database)) {
      fail("database_custody_failed", { mutationPossible: true });
    }
    // EXCLUSIVE locking mode retains custody across COMMIT/checkpoint. Open the
    // read-only hold on the same connection before any external phase can run.
    database.exec("BEGIN EXCLUSIVE");
    transactionOpen = true;
    if (!database.inTransaction) {
      fail("database_custody_failed", { mutationPossible: true });
    }
    const heldLockingMode = String(
      database.pragma("locking_mode = EXCLUSIVE", { simple: true }) || ""
    );
    if (heldLockingMode.toLowerCase() !== "exclusive") {
      fail("database_custody_failed", { mutationPossible: true });
    }
    assertLinuxConnectionDescriptor(connectionDescriptor, sourceIdentity);
    assertStartGuard();
    if (!databasePathBoundaryMatches({ sourcePath, expected: expectedBoundary })) {
      fail("database_boundary_invalid", { mutationPossible: true });
    }
    const committedBoundary = Object.freeze({
      objectIdentitySha256: expectedBoundary.objectIdentitySha256,
      parentIdentitySha256: expectedBoundary.parentIdentitySha256,
      logicalSha256: databaseLogicalSha256(database)
    });
    companionBoundary = captureCompanionBoundary(sourcePath, "database_custody_failed");
    if (
      !databaseBoundaryMatches({ sourcePath, database, expected: committedBoundary })
      || exactObjectIdentity(fstatSync(sourceDescriptor, { bigint: true }), {
        requireSingleLink: true
      }) !== sourceIdentity
    ) {
      fail("database_boundary_invalid", { mutationPossible: true });
    }
    assertLinuxConnectionDescriptor(connectionDescriptor, sourceIdentity);
    assertStartGuard();
    assertRetainedSnapshotArtifact(artifact);
    await postCommitCustody(Object.freeze({
      guardIdentitySha256: createHash("sha256").update(guardIdentity).digest("hex"),
      snapshot: Object.freeze({ ...artifact.identity }),
      operationResult
    }));
    if (
      !database.open
      || !database.inTransaction
      || !databaseBoundaryMatches({ sourcePath, database, expected: committedBoundary })
      || exactObjectIdentity(fstatSync(sourceDescriptor, { bigint: true }), {
        requireSingleLink: true
      }) !== sourceIdentity
    ) {
      fail("database_custody_failed", { mutationPossible: true });
    }
    assertLinuxConnectionDescriptor(connectionDescriptor, sourceIdentity);
    assertStartGuard();
    assertRetainedSnapshotArtifact(artifact);
    assertNoNewCompanionFiles(sourcePath, companionBoundary, "database_custody_failed");
    database.exec("ROLLBACK");
    transactionOpen = false;
    if (database.inTransaction) {
      fail("database_custody_failed", { mutationPossible: true });
    }
    closeQuiesceDatabase(database);
    database = null;
    assertLinuxConnectionDescriptorClosed(connectionDescriptor);
    if (!databasePathBoundaryMatches({ sourcePath, expected: expectedBoundary })) {
      fail("database_boundary_invalid", { mutationPossible: true });
    }
    assertNoNewCompanionFiles(
      sourcePath,
      companionBoundary,
      "database_custody_failed"
    );
    assertStartGuard();
    assertRetainedSnapshotArtifact(artifact);
    artifactFinalVerified = true;
    closeSnapshotArtifactCustody(artifact);
    if (!closeBoundaryDescriptors()) {
      fail("database_custody_failed", { mutationPossible: true });
    }
    assertTerminalDatabaseBoundary({
      sourcePath,
      expected: committedBoundary,
      companionBoundary
    });
    return Object.freeze({
      guardIdentitySha256: createHash("sha256").update(guardIdentity).digest("hex"),
      snapshot: Object.freeze({ ...artifact.identity }),
      operationResult
    });
  } catch (error) {
    const custodyTransactionLost = transactionOpen
      && (!database?.open || database.inTransaction !== true);
    let rollbackConfirmed = !transactionOpen;
    let closeConfirmed = !database || database.open !== true;
    let connectionCloseConfirmed = process.platform !== "linux"
      || !Number.isInteger(connectionDescriptor);
    let boundaryCloseConfirmed = true;
    let artifactCloseConfirmed = true;
    let artifactEvidenceFailure = null;
    try {
      if (transactionOpen) {
        database?.exec("ROLLBACK");
        rollbackConfirmed = database?.inTransaction === false;
      }
    } catch {}
    try {
      if (database) closeQuiesceDatabase(database);
      closeConfirmed = !database || database.open !== true;
      database = null;
    } catch {}
    if (closeConfirmed) {
      try {
        assertLinuxConnectionDescriptorClosed(connectionDescriptor);
        connectionCloseConfirmed = true;
      } catch {
        connectionCloseConfirmed = false;
      }
    }
    if (artifact && !artifactFinalVerified) {
      try {
        assertRetainedSnapshotArtifact(artifact);
      } catch (artifactError) {
        artifactEvidenceFailure = artifactError;
      }
    }
    try {
      closeSnapshotArtifactCustody(artifact);
    } catch {
      artifactCloseConfirmed = false;
    }
    boundaryCloseConfirmed = closeBoundaryDescriptors();
    if (
      custodyTransactionLost
      || !rollbackConfirmed
      || !closeConfirmed
      || !connectionCloseConfirmed
      || !artifactCloseConfirmed
      || !boundaryCloseConfirmed
    ) {
      fail("database_custody_failed", { mutationPossible: true });
    }
    if (artifactEvidenceFailure instanceof ControlPlaneDatabaseSnapshotGateError) {
      if (mutationCommitted && !artifactEvidenceFailure.mutationPossible) {
        throw new ControlPlaneDatabaseSnapshotGateError(
          artifactEvidenceFailure.condition,
          { mutationPossible: true }
        );
      }
      throw artifactEvidenceFailure;
    }
    if (artifactEvidenceFailure) {
      fail("snapshot_unavailable", { mutationPossible: mutationCommitted });
    }
    if (error instanceof ControlPlaneDatabaseSnapshotGateError) {
      if (mutationCommitted && !error.mutationPossible) {
        throw new ControlPlaneDatabaseSnapshotGateError(error.condition, { mutationPossible: true });
      }
      throw error;
    }
    if (error === operationFailure) throw error;
    fail("database_custody_failed", { mutationPossible: mutationCommitted });
  }
}

function safeReport({
  mode,
  state,
  serviceState = null,
  snapshot = null,
  preRestoreSnapshot = null,
  databaseQuiesced = false,
  condition = null
}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    type: TYPE,
    mode,
    state,
    serviceState,
    databaseQuiesced: databaseQuiesced === true,
    snapshot: snapshot && {
      id: snapshot.sha256,
      sizeBytes: snapshot.sizeBytes,
      quickCheck: true,
      foreignKeys: true
    },
    preRestoreSnapshot: preRestoreSnapshot && {
      id: preRestoreSnapshot.sha256,
      sizeBytes: preRestoreSnapshot.sizeBytes,
      quickCheck: true,
      foreignKeys: true
    },
    ...(condition ? { condition } : {})
  };
}

async function snapshotControlPlaneDatabase({
  dbPath,
  snapshotDirectory,
  serviceUnit,
  expectedServiceState,
  createdAt,
  unitStateReader
} = {}) {
  if (expectedServiceState !== "inactive") fail("service_state_mismatch");
  const entryGuard = assertServiceStartGuard({
    serviceUnit,
    expectedServiceState,
    unitStateReader,
    phase: "entry"
  });
  const serviceState = entryGuard.activeState;
  const runtimeConditionStartGuardIdentity = entryGuard.runtimeConditionStartGuardIdentity;
  const assertStartGuard = () => assertServiceStartGuard({
    serviceUnit,
    expectedServiceState,
    unitStateReader,
    phase: "boundary",
    expectedRuntimeConditionStartGuardIdentity: runtimeConditionStartGuardIdentity
  });
  const artifact = await createSnapshotArtifact({
    dbPath,
    snapshotDirectory,
    serviceState,
    createdAt,
    assertStartGuard
  });
  return safeReport({
    mode: "snapshot",
    state: "snapshotted",
    serviceState,
    snapshot: artifact.identity,
    databaseQuiesced: true
  });
}

function verifiedSnapshot({ snapshotPath, manifestPath }) {
  const snapshot = existingPath(snapshotPath, { kind: "file", condition: "snapshot_unavailable" });
  const manifest = existingPath(manifestPath, { kind: "file", condition: "manifest_boundary_invalid" });
  const snapshotDirectory = dirname(snapshot);
  const manifestDirectory = dirname(manifest);
  if (comparablePath(snapshotDirectory) !== comparablePath(manifestDirectory)) {
    fail("manifest_boundary_invalid");
  }
  protectedDirectory(snapshotDirectory, "snapshot_directory_invalid");
  if (process.platform !== "win32" && fileMode(snapshot) !== "0600") {
    fail("snapshot_unavailable");
  }
  const parsed = readSnapshotManifest(manifest, snapshot);
  const identity = databaseHealth(snapshot, {
    expectedHash: parsed.snapshot.sha256,
    expectedSizeBytes: parsed.snapshot.sizeBytes
  });
  return { snapshotPath: snapshot, manifestPath: manifest, manifest: parsed, identity };
}

export function verifyControlPlaneDatabaseSnapshot({ snapshotPath, manifestPath } = {}) {
  const verified = verifiedSnapshot({ snapshotPath, manifestPath });
  return safeReport({ mode: "verify", state: "verified", snapshot: verified.identity });
}

function verifyControlPlaneDatabaseStartGuardCore({
  serviceUnit,
  expectedServiceState,
  unitStateReader
} = {}) {
  const state = assertServiceStartGuard({
    serviceUnit,
    expectedServiceState,
    unitStateReader,
    phase: "entry"
  });
  return safeReport({
    mode: "guard",
    state: "guarded",
    serviceState: state.activeState
  });
}

export function verifyControlPlaneDatabaseStartGuard({
  serviceUnit,
  expectedServiceState,
  unitStateReader
} = {}) {
  if (unitStateReader !== undefined) fail("execution_envelope_required");
  return verifyControlPlaneDatabaseStartGuardCore({
    serviceUnit,
    expectedServiceState,
    unitStateReader: readSystemdUnitState
  });
}

function inspectCompanions(dbPath) {
  return companionPaths(dbPath).map((path) => {
    if (!existsSync(path)) return null;
    const metadata = lstatSync(path);
    if (metadata.isSymbolicLink() || !metadata.isFile()) fail("database_boundary_invalid");
    return path;
  });
}

function temporarySibling(path, label) {
  return resolve(dirname(path), `.${basename(path)}.${label}.${randomUUID()}`);
}

function copyVerifiedSnapshot(snapshotPath, destinationPath, expectedHash) {
  try {
    copyFileSync(snapshotPath, destinationPath, fsConstants.COPYFILE_EXCL);
    chmodSync(destinationPath, 0o600);
    fsyncFile(destinationPath);
    if (sha256File(destinationPath) !== expectedHash) fail("snapshot_identity_mismatch");
  } catch (error) {
    try {
      rmSync(destinationPath, { force: true });
    } catch {}
    if (error instanceof ControlPlaneDatabaseSnapshotGateError) throw error;
    fail("restore_publish_failed");
  }
}

function restoreSnapshotFile({ dbPath, snapshotPath, expectedHash, assertStartGuard }) {
  const parent = dirname(dbPath);
  const replacement = temporarySibling(dbPath, "restore");
  const original = temporarySibling(dbPath, "pre-restore");
  const companions = inspectCompanions(dbPath);
  const quarantined = companions.map((path) => path && temporarySibling(path, "pre-restore"));
  let originalMoved = false;
  let replacementPublished = false;
  const movedCompanions = [];
  try {
    copyVerifiedSnapshot(snapshotPath, replacement, expectedHash);
    assertStartGuard();
    renameSync(dbPath, original);
    originalMoved = true;
    for (let index = 0; index < companions.length; index += 1) {
      if (!companions[index]) continue;
      renameSync(companions[index], quarantined[index]);
      movedCompanions.push(index);
    }
    renameSync(replacement, dbPath);
    replacementPublished = true;
    fsyncDirectory(parent, "restore_publish_failed");
    const restored = databaseHealth(dbPath, { expectedHash });
    let cleanupComplete = true;
    try {
      for (const path of [...movedCompanions.map((index) => quarantined[index]), original]) {
        rmSync(path, { force: true });
      }
      fsyncDirectory(parent, "restore_cleanup_failed");
    } catch {
      cleanupComplete = false;
    }
    return { identity: restored, cleanupComplete };
  } catch (error) {
    let rollbackComplete = true;
    if (replacementPublished && existsSync(dbPath)) {
      try {
        rmSync(dbPath, { force: true });
      } catch {
        rollbackComplete = false;
      }
    }
    if (originalMoved && existsSync(original) && !existsSync(dbPath)) {
      try {
        renameSync(original, dbPath);
      } catch {
        rollbackComplete = false;
      }
    }
    for (const index of movedCompanions.reverse()) {
      if (!existsSync(quarantined[index]) || existsSync(companions[index])) continue;
      try {
        renameSync(quarantined[index], companions[index]);
      } catch {
        rollbackComplete = false;
      }
    }
    try {
      rmSync(replacement, { force: true });
    } catch {
      rollbackComplete = false;
    }
    if (!rollbackComplete) fail("restore_rollback_failed");
    if (error instanceof ControlPlaneDatabaseSnapshotGateError) throw error;
    fail("restore_publish_failed");
  }
}

async function restoreControlPlaneDatabase({
  dbPath,
  snapshotPath,
  manifestPath,
  rollbackDirectory,
  serviceUnit,
  expectedServiceState,
  createdAt,
  unitStateReader
} = {}) {
  if (expectedServiceState !== "inactive") fail("service_state_mismatch");
  const entryGuard = assertServiceStartGuard({
    serviceUnit,
    expectedServiceState,
    unitStateReader,
    phase: "entry"
  });
  const serviceState = entryGuard.activeState;
  const runtimeConditionStartGuardIdentity = entryGuard.runtimeConditionStartGuardIdentity;
  const assertStartGuard = () => assertServiceStartGuard({
    serviceUnit,
    expectedServiceState,
    unitStateReader,
    phase: "boundary",
    expectedRuntimeConditionStartGuardIdentity: runtimeConditionStartGuardIdentity
  });
  const targetPath = existingPath(dbPath, { kind: "file", condition: "database_boundary_invalid" });
  const rollbackDirectoryPath = protectedDirectory(rollbackDirectory, "rollback_directory_invalid");
  const source = verifiedSnapshot({ snapshotPath, manifestPath });
  if (comparablePath(targetPath) === comparablePath(source.snapshotPath)) {
    fail("database_boundary_invalid");
  }
  const preRestoreArtifact = await createSnapshotArtifact({
    dbPath: targetPath,
    snapshotDirectory: rollbackDirectoryPath,
    serviceState,
    createdAt,
    assertStartGuard
  });
  assertStartGuard();
  const restoreOutcome = restoreSnapshotFile({
    dbPath: targetPath,
    snapshotPath: source.snapshotPath,
    expectedHash: source.identity.sha256,
    assertStartGuard
  });
  try {
    assertStartGuard();
  } catch (error) {
    if (error instanceof ControlPlaneDatabaseSnapshotGateError) {
      return safeReport({
        mode: "restore",
        state: "attention_required",
        serviceState,
        snapshot: restoreOutcome.identity,
        preRestoreSnapshot: preRestoreArtifact.identity,
        condition: "restore_service_start_guard_changed"
      });
    }
    throw error;
  }
  if (!restoreOutcome.cleanupComplete) {
    return safeReport({
      mode: "restore",
      state: "attention_required",
      serviceState,
      snapshot: restoreOutcome.identity,
      preRestoreSnapshot: preRestoreArtifact.identity,
      condition: "restore_cleanup_failed"
    });
  }
  return safeReport({
    mode: "restore",
    state: "restored",
    serviceState,
    snapshot: restoreOutcome.identity,
    preRestoreSnapshot: preRestoreArtifact.identity
  });
}

function parseCliArguments(argv) {
  if (!Array.isArray(argv)) fail("invalid_input");
  const values = new Map();
  let apply = false;
  const flags = new Set([
    "--mode",
    "--db-path",
    "--snapshot-dir",
    "--snapshot-path",
    "--manifest-path",
    "--rollback-dir",
    "--service-unit",
    "--expected-service-state"
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--apply") {
      if (apply) fail("invalid_input");
      apply = true;
      continue;
    }
    const equals = item.indexOf("=");
    const flag = equals >= 0 ? item.slice(0, equals) : item;
    if (!flags.has(flag) || values.has(flag)) fail("invalid_input");
    const value = equals >= 0 ? item.slice(equals + 1) : argv[++index];
    if (typeof value !== "string" || value.length === 0 || value.startsWith("--")) {
      fail("invalid_input");
    }
    values.set(flag, value);
  }
  const mode = values.get("--mode");
  if (!MODES.has(mode)) fail("mode_invalid");
  const required = mode === "guard"
    ? ["--service-unit", "--expected-service-state"]
    : mode === "snapshot"
    ? ["--db-path", "--snapshot-dir", "--service-unit", "--expected-service-state"]
    : mode === "verify"
      ? ["--snapshot-path", "--manifest-path"]
      : ["--db-path", "--snapshot-path", "--manifest-path", "--rollback-dir", "--service-unit", "--expected-service-state"];
  if (required.some((flag) => !values.has(flag))) fail("invalid_input");
  const allowed = new Set(["--mode", ...required]);
  if ([...values.keys()].some((flag) => !allowed.has(flag))) fail("invalid_input");
  if ((mode === "snapshot" || mode === "restore") !== apply) fail("apply_confirmation_required");
  if ((mode === "verify" || mode === "guard") && apply) fail("invalid_input");
  if (
    (mode === "snapshot" || mode === "restore")
    && values.get("--expected-service-state") !== "inactive"
  ) {
    fail("service_state_mismatch");
  }
  return {
    mode,
    apply,
    dbPath: values.get("--db-path"),
    snapshotDirectory: values.get("--snapshot-dir"),
    snapshotPath: values.get("--snapshot-path"),
    manifestPath: values.get("--manifest-path"),
    rollbackDirectory: values.get("--rollback-dir"),
    serviceUnit: values.get("--service-unit"),
    expectedServiceState: values.get("--expected-service-state")
  };
}

export async function runControlPlaneDatabaseSnapshotGateCli({
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr
} = {}) {
  let mode = null;
  try {
    const options = parseCliArguments(argv);
    mode = options.mode;
    const result = options.mode === "guard"
      ? verifyControlPlaneDatabaseStartGuard(options)
      : options.mode === "snapshot"
      ? await snapshotControlPlaneDatabase(options)
      : options.mode === "verify"
        ? verifyControlPlaneDatabaseSnapshot(options)
        : await restoreControlPlaneDatabase(options);
    if (result.state === "attention_required") {
      stderr.write(`${JSON.stringify(result)}\n`);
      return 1;
    }
    stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    const condition = error instanceof ControlPlaneDatabaseSnapshotGateError
      && SAFE_CONDITIONS.has(error.condition)
      ? error.condition
      : "unexpected_execution_failure";
    stderr.write(`${JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      type: TYPE,
      mode,
      state: "blocked",
      condition
    })}\n`);
    return 1;
  }
}
