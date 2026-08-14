#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  copyFileSync,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

const SCHEMA_VERSION = "1";
const TYPE = "control_plane_db_snapshot_gate";
const SNAPSHOT_TYPE = "control_plane_db_snapshot";
const SERVICE_UNIT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.@-]{0,127}\.service$/;
const SNAPSHOT_FILE_PATTERN = /^control-plane-db-[a-f0-9-]{36}\.sqlite$/;
const MODES = new Set(["snapshot", "verify", "restore"]);
const SERVICE_STATES = new Set(["active", "inactive"]);
const RUNTIME_MASKED_UNIT_FILE_STATE = "masked-runtime";
const SAFE_CONDITIONS = new Set([
  "apply_confirmation_required",
  "database_boundary_invalid",
  "database_close_failed",
  "database_integrity_failed",
  "database_missing",
  "database_owner_mismatch",
  "database_quiesce_failed",
  "database_unavailable",
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
  "unexpected_execution_failure"
]);

export class ControlPlaneDatabaseSnapshotGateError extends Error {
  constructor(condition) {
    super(condition);
    this.name = "ControlPlaneDatabaseSnapshotGateError";
    this.condition = condition;
  }
}

function fail(condition) {
  throw new ControlPlaneDatabaseSnapshotGateError(condition);
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
  if (process.platform !== "win32" && (statSync(path).mode & 0o077) !== 0) {
    fail(condition);
  }
  return path;
}

function safeServiceUnit(value) {
  if (typeof value !== "string" || !SERVICE_UNIT_PATTERN.test(value)) {
    fail("service_unit_invalid");
  }
  return value;
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
    if (metadata.isSymbolicLink() || !metadata.isFile()) fail(condition);
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
  try {
    return spawnSync(command, args, {
      encoding: "utf8",
      timeout: 5_000,
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    return null;
  }
}

export function readSystemdUnitState({ serviceUnit } = {}) {
  const unit = safeServiceUnit(serviceUnit);
  if (process.platform !== "linux") fail("service_state_unavailable");
  const result = withoutOutput("systemctl", [
    "show",
    "--property=ActiveState",
    "--property=UnitFileState",
    "--",
    unit
  ]);
  if (!result || result.error || result.status !== 0) fail("service_state_unavailable");
  const values = new Map();
  for (const line of String(result.stdout || "").trim().split(/\r?\n/)) {
    const match = /^(ActiveState|UnitFileState)=([a-z-]+)$/.exec(line);
    if (!match || values.has(match[1])) fail("service_state_unavailable");
    values.set(match[1], match[2]);
  }
  if (values.size !== 2) fail("service_state_unavailable");
  return Object.freeze({
    activeState: values.get("ActiveState"),
    unitFileState: values.get("UnitFileState")
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
  return Object.freeze({
    activeState: reported.activeState,
    unitFileState: reported.unitFileState
  });
}

function assertServiceStartGuard({
  serviceUnit,
  expectedServiceState,
  unitStateReader,
  phase
}) {
  const expected = safeExpectedServiceState(expectedServiceState);
  const actual = readUnitState({ serviceUnit, unitStateReader });
  if (!SERVICE_STATES.has(actual.activeState)) fail("service_state_unavailable");
  if (actual.activeState !== expected) {
    if (phase === "entry") fail("service_state_mismatch");
    fail("service_start_guard_changed");
  }
  if (actual.unitFileState !== RUNTIME_MASKED_UNIT_FILE_STATE) {
    if (phase === "entry") fail("service_start_guard_missing");
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

export async function snapshotControlPlaneDatabase({
  dbPath,
  snapshotDirectory,
  serviceUnit,
  expectedServiceState,
  createdAt,
  unitStateReader
} = {}) {
  if (expectedServiceState !== "inactive") fail("service_state_mismatch");
  const serviceState = assertServiceStartGuard({
    serviceUnit,
    expectedServiceState,
    unitStateReader,
    phase: "entry"
  }).activeState;
  const assertStartGuard = () => assertServiceStartGuard({
    serviceUnit,
    expectedServiceState,
    unitStateReader,
    phase: "boundary"
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

export async function restoreControlPlaneDatabase({
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
  const serviceState = assertServiceStartGuard({
    serviceUnit,
    expectedServiceState,
    unitStateReader,
    phase: "entry"
  }).activeState;
  const assertStartGuard = () => assertServiceStartGuard({
    serviceUnit,
    expectedServiceState,
    unitStateReader,
    phase: "boundary"
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
  const required = mode === "snapshot"
    ? ["--db-path", "--snapshot-dir", "--service-unit", "--expected-service-state"]
    : mode === "verify"
      ? ["--snapshot-path", "--manifest-path"]
      : ["--db-path", "--snapshot-path", "--manifest-path", "--rollback-dir", "--service-unit", "--expected-service-state"];
  if (required.some((flag) => !values.has(flag))) fail("invalid_input");
  const allowed = new Set(["--mode", ...required]);
  if ([...values.keys()].some((flag) => !allowed.has(flag))) fail("invalid_input");
  if ((mode === "snapshot" || mode === "restore") !== apply) fail("apply_confirmation_required");
  if (mode === "verify" && apply) fail("invalid_input");
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
    const result = options.mode === "snapshot"
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

function isDirectInvocation() {
  return process.argv[1]
    && comparablePath(process.argv[1]) === comparablePath(fileURLToPath(import.meta.url));
}

if (isDirectInvocation()) {
  process.exitCode = await runControlPlaneDatabaseSnapshotGateCli();
}
