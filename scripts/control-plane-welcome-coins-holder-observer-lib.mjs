import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { posix } from "node:path";

import { inspectControlPlaneDatabaseBoundary } from "./control-plane-db-snapshot-gate-lib.mjs";

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const PID_PATTERN = /^[1-9][0-9]*$/u;
const FD_PATTERN = /^(?:0|[1-9][0-9]*)$/u;
const MAP_FILE_PATTERN = /^[a-f0-9]+-[a-f0-9]+$/u;
const PHASES = new Set(["exclusive_pre_commit", "inactive_pre_custody"]);
const RUNTIME_BRAND = Symbol("welcome-coins-holder-observer-runtime");

class WelcomeCoinsHolderObserverError extends Error {
  constructor(condition) {
    super(condition);
    this.name = "WelcomeCoinsHolderObserverError";
    this.condition = condition;
  }
}

function fail(condition) {
  throw new WelcomeCoinsHolderObserverError(condition);
}

function exactKeySet(value, keys) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function exactSha256(value) {
  return typeof value === "string" && SHA256_PATTERN.test(value) ? value : null;
}

function exactDatabaseBoundary(value, condition = "database_boundary_invalid") {
  const keys = ["logicalSha256", "objectIdentitySha256", "parentIdentitySha256"];
  if (!exactKeySet(value, keys) || !keys.every((key) => exactSha256(value[key]))) {
    fail(condition);
  }
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, value[key]])));
}

function sameDatabaseBoundary(left, right) {
  return left.logicalSha256 === right.logicalSha256
    && left.objectIdentitySha256 === right.objectIdentitySha256
    && left.parentIdentitySha256 === right.parentIdentitySha256;
}

function exactPositiveInteger(value, condition) {
  if (typeof value !== "string" || !PID_PATTERN.test(value)) fail(condition);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) fail(condition);
  return parsed;
}

function exactNonNegativeInteger(value, condition) {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(value)) fail(condition);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) fail(condition);
  return parsed;
}

function metadataInteger(value, condition) {
  if (typeof value === "bigint") {
    if (value < 0n) fail(condition);
    return value.toString(10);
  }
  if (!Number.isSafeInteger(value) || value < 0) fail(condition);
  return String(value);
}

function metadataObjectIdentity(metadata, { kind, condition }) {
  try {
    if (
      !metadata
      || typeof metadata !== "object"
      || (typeof metadata.isSymbolicLink === "function" && metadata.isSymbolicLink())
      || (kind === "file" && (typeof metadata.isFile !== "function" || !metadata.isFile()))
      || (kind === "directory"
        && (typeof metadata.isDirectory !== "function" || !metadata.isDirectory()))
    ) {
      fail(condition);
    }
    return Object.freeze({
      dev: metadataInteger(metadata.dev, condition),
      ino: metadataInteger(metadata.ino, condition)
    });
  } catch (error) {
    if (error instanceof WelcomeCoinsHolderObserverError) throw error;
    fail(condition);
  }
}

function sameObjectIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function optionalFileIdentity(runtime, path) {
  let metadata;
  try {
    metadata = runtime.lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    fail("database_boundary_invalid");
  }
  try {
    const identity = metadataObjectIdentity(metadata, {
      kind: "file",
      condition: "database_boundary_invalid"
    });
    if (runtime.realpath(path) !== path) fail("database_boundary_invalid");
    return identity;
  } catch (error) {
    if (error instanceof WelcomeCoinsHolderObserverError) throw error;
    fail("database_boundary_invalid");
  }
}

function captureFilesystemBoundary(runtime, dbPath) {
  try {
    const parentPath = posix.dirname(dbPath);
    if (runtime.realpath(dbPath) !== dbPath || runtime.realpath(parentPath) !== parentPath) {
      fail("database_boundary_invalid");
    }
    const parent = metadataObjectIdentity(runtime.lstat(parentPath), {
      kind: "directory",
      condition: "database_boundary_invalid"
    });
    const main = metadataObjectIdentity(runtime.lstat(dbPath), {
      kind: "file",
      condition: "database_boundary_invalid"
    });
    return Object.freeze({
      parent,
      main,
      wal: optionalFileIdentity(runtime, `${dbPath}-wal`),
      shm: optionalFileIdentity(runtime, `${dbPath}-shm`)
    });
  } catch (error) {
    if (error instanceof WelcomeCoinsHolderObserverError) throw error;
    fail("database_boundary_invalid");
  }
}

function sameFilesystemBoundary(left, right) {
  return sameObjectIdentity(left.parent, right.parent)
    && sameObjectIdentity(left.main, right.main)
    && ((left.wal === null && right.wal === null)
      || (left.wal !== null && right.wal !== null && sameObjectIdentity(left.wal, right.wal)))
    && ((left.shm === null && right.shm === null)
      || (left.shm !== null && right.shm !== null && sameObjectIdentity(left.shm, right.shm)));
}

function inspectStableDatabaseBoundary(runtime, dbPath) {
  const firstFilesystem = captureFilesystemBoundary(runtime, dbPath);
  let databaseBoundary;
  try {
    databaseBoundary = exactDatabaseBoundary(runtime.inspectDatabaseBoundary({ dbPath }));
  } catch (error) {
    if (error instanceof WelcomeCoinsHolderObserverError) throw error;
    fail("database_boundary_invalid");
  }
  const secondFilesystem = captureFilesystemBoundary(runtime, dbPath);
  if (!sameFilesystemBoundary(firstFilesystem, secondFilesystem)) {
    fail("database_boundary_invalid");
  }
  return Object.freeze({
    databaseBoundary,
    filesystemBoundary: secondFilesystem
  });
}

function exactSortedDirectoryEntries(value, pattern) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !pattern.test(entry))) {
    fail("holder_observation_failed");
  }
  const sorted = [...value].sort((left, right) => left.localeCompare(right, "en"));
  if (new Set(sorted).size !== sorted.length) fail("holder_observation_failed");
  return sorted;
}

function listDirectory(runtime, path, pattern) {
  try {
    return exactSortedDirectoryEntries(runtime.listDirectory(path), pattern);
  } catch (error) {
    if (error instanceof WelcomeCoinsHolderObserverError) throw error;
    fail("holder_observation_failed");
  }
}

function listProcPids(runtime) {
  try {
    const entries = runtime.listDirectory("/proc");
    if (
      !Array.isArray(entries)
      || entries.some((entry) => typeof entry !== "string" || entry.includes("\0"))
      || new Set(entries).size !== entries.length
    ) {
      fail("holder_observation_failed");
    }
    return exactSortedDirectoryEntries(
      entries.filter((entry) => PID_PATTERN.test(entry)),
      PID_PATTERN
    );
  } catch (error) {
    if (error instanceof WelcomeCoinsHolderObserverError) throw error;
    fail("holder_observation_failed");
  }
}

function exactProcStatus(text, expectedPid) {
  if (typeof text !== "string" || text.includes("\0")) fail("holder_observation_failed");
  const required = new Set(["Gid", "NSpid", "Pid", "Tgid", "Uid"]);
  const fields = new Map();
  for (const line of text.split("\n")) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const name = line.slice(0, separator);
    if (!required.has(name)) continue;
    if (fields.has(name)) fail("holder_observation_failed");
    fields.set(name, line.slice(separator + 1).trim());
  }
  if ([...required].some((field) => !fields.has(field))) fail("holder_observation_failed");
  if (
    exactPositiveInteger(fields.get("Pid"), "holder_observation_failed") !== expectedPid
    || exactPositiveInteger(fields.get("Tgid"), "holder_observation_failed") !== expectedPid
  ) {
    fail("holder_observation_failed");
  }
  const identifiers = (name) => {
    const parts = fields.get(name).split(/\s+/u);
    if (parts.length !== 4) fail("holder_observation_failed");
    return parts.map((part) => exactNonNegativeInteger(part, "holder_observation_failed"));
  };
  const uidSlots = identifiers("Uid");
  const gidSlots = identifiers("Gid");
  const nspidParts = fields.get("NSpid").split(/\s+/u);
  if (
    nspidParts.length !== 1
    || exactPositiveInteger(nspidParts[0], "holder_observation_failed") !== expectedPid
  ) {
    fail("holder_observation_failed");
  }
  return Object.freeze({ uid: uidSlots[0], gid: gidSlots[0] });
}

function exactProcStartTime(text, expectedPid) {
  if (typeof text !== "string" || text.includes("\0")) fail("holder_observation_failed");
  const prefix = `${expectedPid} (`;
  const close = text.lastIndexOf(")");
  if (!text.startsWith(prefix) || close < prefix.length || text[close + 1] !== " ") {
    fail("holder_observation_failed");
  }
  const fields = text.slice(close + 2).trim().split(/\s+/u);
  if (fields.length < 20 || !PID_PATTERN.test(fields[19] ?? "")) {
    fail("holder_observation_failed");
  }
  return fields[19];
}

function readProcessIdentity(runtime, pid) {
  try {
    const status = exactProcStatus(runtime.readText(`/proc/${pid}/status`), pid);
    return Object.freeze({
      gid: status.gid,
      pid,
      startTimeTicks: exactProcStartTime(runtime.readText(`/proc/${pid}/stat`), pid),
      uid: status.uid
    });
  } catch (error) {
    if (error instanceof WelcomeCoinsHolderObserverError) throw error;
    fail("holder_observation_failed");
  }
}

function sameProcessIdentity(left, right) {
  return left.gid === right.gid
    && left.pid === right.pid
    && left.startTimeTicks === right.startTimeTicks
    && left.uid === right.uid;
}

function processIdentityKey(identity) {
  return [identity.pid, identity.startTimeTicks, identity.uid, identity.gid].join("\0");
}

function processIdentitySha256(identity) {
  return createHash("sha256").update(JSON.stringify({
    gid: identity.gid,
    pid: identity.pid,
    startTimeTicks: identity.startTimeTicks,
    uid: identity.uid
  }), "utf8").digest("hex");
}

function targetIdentitySet(filesystemBoundary) {
  return new Set([filesystemBoundary.main, filesystemBoundary.wal, filesystemBoundary.shm]
    .filter((value) => value !== null)
    .map((value) => `${value.dev}:${value.ino}`));
}

function readDescriptorIdentity(runtime, path) {
  try {
    const metadata = runtime.stat(path);
    if (!metadata || typeof metadata.isFile !== "function") fail("holder_observation_failed");
    const regularFile = metadata.isFile();
    if (typeof regularFile !== "boolean") fail("holder_observation_failed");
    return Object.freeze({
      dev: metadataInteger(metadata.dev, "holder_observation_failed"),
      ino: metadataInteger(metadata.ino, "holder_observation_failed"),
      regularFile
    });
  } catch (error) {
    if (error instanceof WelcomeCoinsHolderObserverError) throw error;
    fail("holder_observation_failed");
  }
}

function sameDescriptorIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.regularFile === right.regularFile;
}

function scanProcessDirectory(runtime, pid, directory, pattern, targets) {
  const path = `/proc/${pid}/${directory}`;
  const before = listDirectory(runtime, path, pattern);
  const identitiesBefore = new Map(before.map((entry) => [
    entry,
    readDescriptorIdentity(runtime, `${path}/${entry}`)
  ]));
  const after = listDirectory(runtime, path, pattern);
  if (before.join("\0") !== after.join("\0")) fail("holder_observation_failed");
  const identitiesAfter = new Map(after.map((entry) => [
    entry,
    readDescriptorIdentity(runtime, `${path}/${entry}`)
  ]));
  for (const entry of before) {
    if (!sameDescriptorIdentity(identitiesBefore.get(entry), identitiesAfter.get(entry))) {
      fail("holder_observation_failed");
    }
  }
  return [...identitiesBefore.values()].some((identity) => identity.regularFile
    && targets.has(`${identity.dev}:${identity.ino}`));
}

function scanProcHoldersPass(runtime, filesystemBoundary) {
  const pidNamesBefore = listProcPids(runtime);
  const targets = targetIdentitySet(filesystemBoundary);
  const holders = new Map();
  for (const pidName of pidNamesBefore) {
    const pid = exactPositiveInteger(pidName, "holder_observation_failed");
    const before = readProcessIdentity(runtime, pid);
    const fdMatch = scanProcessDirectory(runtime, pid, "fd", FD_PATTERN, targets);
    const mapMatch = scanProcessDirectory(runtime, pid, "map_files", MAP_FILE_PATTERN, targets);
    const after = readProcessIdentity(runtime, pid);
    if (!sameProcessIdentity(before, after)) fail("holder_observation_failed");
    if (fdMatch || mapMatch) {
      holders.set(processIdentityKey(before), processIdentitySha256(before));
    }
  }
  const pidNamesAfter = listProcPids(runtime);
  if (pidNamesBefore.join("\0") !== pidNamesAfter.join("\0")) {
    fail("holder_observation_failed");
  }
  return Object.freeze([...holders.values()].sort());
}

function scanProcHolders(runtime, filesystemBoundary) {
  // Two complete, independently stable passes close the concrete "PID already
  // scanned, then opens a target before the proc-root readback" race.  This is
  // deliberately still observation evidence, not the mutation boundary: the
  // continuous SQLite EXCLUSIVE connection held by the custody child supplies
  // that boundary through activation verification.
  const first = scanProcHoldersPass(runtime, filesystemBoundary);
  const second = scanProcHoldersPass(runtime, filesystemBoundary);
  if (first.join("\0") !== second.join("\0")) fail("database_custody_failed");
  return second;
}

function exactOptions(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("holder_observation_invalid");
  }
  const phase = value.phase;
  if (!PHASES.has(phase)) fail("holder_observation_invalid");
  const keys = phase === "inactive_pre_custody"
    ? ["dbPath", "phase"]
    : [
      "dbPath",
      "expectedCustodyChildChannelBindingSha256",
      "expectedCustodyChildProcessIdentitySha256",
      "expectedDatabaseBoundary",
      "phase"
    ];
  if (
    !exactKeySet(value, keys)
    || typeof value.dbPath !== "string"
    || value.dbPath.includes("\0")
    || !posix.isAbsolute(value.dbPath)
    || posix.normalize(value.dbPath) !== value.dbPath
    || value.dbPath === "/"
  ) {
    fail("holder_observation_invalid");
  }
  if (phase === "inactive_pre_custody") {
    return Object.freeze({ dbPath: value.dbPath, phase });
  }
  if (
    !exactSha256(value.expectedCustodyChildProcessIdentitySha256)
    || !exactSha256(value.expectedCustodyChildChannelBindingSha256)
  ) {
    fail("holder_observation_invalid");
  }
  return Object.freeze({
    dbPath: value.dbPath,
    phase,
    expectedDatabaseBoundary: exactDatabaseBoundary(value.expectedDatabaseBoundary),
    expectedCustodyChildProcessIdentitySha256:
      value.expectedCustodyChildProcessIdentitySha256,
    expectedCustodyChildChannelBindingSha256:
      value.expectedCustodyChildChannelBindingSha256
  });
}

function createWelcomeCoinsHolderObserverRuntime(value) {
  const functionKeys = [
    "getpid",
    "getuid",
    "inspectDatabaseBoundary",
    "listDirectory",
    "lstat",
    "readText",
    "realpath",
    "stat"
  ];
  if (
    !value
    || typeof value !== "object"
    || typeof value.platform !== "string"
    || functionKeys.some((key) => typeof value[key] !== "function")
  ) {
    fail("holder_observation_invalid");
  }
  return Object.freeze({
    [RUNTIME_BRAND]: true,
    platform: value.platform,
    getpid: value.getpid,
    getuid: value.getuid,
    inspectDatabaseBoundary: value.inspectDatabaseBoundary,
    listDirectory: value.listDirectory,
    lstat: value.lstat,
    readText: value.readText,
    realpath: value.realpath,
    stat: value.stat
  });
}

const DEFAULT_RUNTIME = createWelcomeCoinsHolderObserverRuntime({
  platform: process.platform,
  getpid: () => process.pid,
  getuid: () => process.getuid?.(),
  inspectDatabaseBoundary: inspectControlPlaneDatabaseBoundary,
  listDirectory: (path) => readdirSync(path, { encoding: "utf8" }),
  lstat: (path) => lstatSync(path, { bigint: true }),
  readText: (path) => readFileSync(path, "utf8"),
  realpath: (path) => realpathSync(path),
  stat: (path) => statSync(path, { bigint: true })
});

function inspectWelcomeCoinsExternalHoldersCore(options, runtime) {
  if (!runtime || runtime[RUNTIME_BRAND] !== true) fail("holder_observation_invalid");
  const exact = exactOptions(options);
  if (
    runtime.platform !== "linux"
    || runtime.getuid() !== 0
    || !Number.isSafeInteger(runtime.getpid())
    || runtime.getpid() <= 0
  ) {
    fail("holder_observation_failed");
  }

  const before = inspectStableDatabaseBoundary(runtime, exact.dbPath);
  if (
    exact.phase === "exclusive_pre_commit"
    && !sameDatabaseBoundary(before.databaseBoundary, exact.expectedDatabaseBoundary)
  ) {
    fail("database_boundary_invalid");
  }

  const holderProcessIdentityHashes = scanProcHolders(runtime, before.filesystemBoundary);
  const after = inspectStableDatabaseBoundary(runtime, exact.dbPath);
  if (
    !sameFilesystemBoundary(before.filesystemBoundary, after.filesystemBoundary)
    || !sameDatabaseBoundary(before.databaseBoundary, after.databaseBoundary)
  ) {
    fail("database_boundary_invalid");
  }

  if (exact.phase === "inactive_pre_custody") {
    if (holderProcessIdentityHashes.length !== 0) fail("database_custody_failed");
    return Object.freeze({
      externalHolderCount: 0,
      databaseBoundary: before.databaseBoundary
    });
  }

  const approvedCustodyChildHolderCount = holderProcessIdentityHashes
    .filter((value) => value === exact.expectedCustodyChildProcessIdentitySha256)
    .length;
  const externalHolderCount = holderProcessIdentityHashes.length
    - approvedCustodyChildHolderCount;
  if (externalHolderCount !== 0 || approvedCustodyChildHolderCount !== 1) {
    fail("database_custody_failed");
  }
  return Object.freeze({
    externalHolderCount: 0,
    approvedCustodyChildHolderCount: 1,
    approvedCustodyChildProcessIdentitySha256:
      exact.expectedCustodyChildProcessIdentitySha256,
    approvedCustodyChildChannelBindingSha256:
      exact.expectedCustodyChildChannelBindingSha256,
    databaseBoundary: before.databaseBoundary
  });
}

export function inspectWelcomeCoinsExternalHolders(options) {
  return inspectWelcomeCoinsExternalHoldersCore(options, DEFAULT_RUNTIME);
}
