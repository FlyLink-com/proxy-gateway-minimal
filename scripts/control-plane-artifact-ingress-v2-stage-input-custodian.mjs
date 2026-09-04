#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  rm,
  unlink
} from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { parseArtifactManifest } from "./control-plane-candidate-dependency-gate-lib.mjs";
import { parseDependencyArtifactManifest } from "./control-plane-dependency-artifact-lib.mjs";
import {
  ArtifactIngressV2ContractError,
  parseIngressV2Receipt,
  validateIngressV2Header
} from "./control-plane-artifact-ingress-v2-contract.mjs";

const MAX_AGGREGATE_BYTES = 64 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_CHECKSUM_BYTES = 4096;
const MAX_LABEL_BYTES = 512;
const MAX_RECEIPT_BYTES = 64 * 1024;
const PRODUCTION_STAGE_ROOT = "/opt/proxy-gateway-minimal-candidate";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const HASH = /^[0-9a-f]{64}$/;
const SOURCE_ARCHIVE = /^proxy-gateway-[A-Za-z0-9][A-Za-z0-9._-]{0,159}\.zip$/;
const ARGUMENT_NAMES = Object.freeze([
  "quarantine-root",
  "ingress-receipt-root",
  "stage-input-root",
  "custody-receipt-root",
  "packet-id",
  "expected-source-commit",
  "expected-expires-at",
  "expected-header-sha256",
  "expected-receipt-sha256",
  "expected-replay-claim-sha256",
  "expected-replay-claim-size-bytes",
  "expected-artifact-manifest-sha256",
  "expected-source-artifact-sha256",
  "expected-dependency-manifest-sha256",
  "expected-dependency-archive-sha256"
]);
const OPTION_NAMES = Object.freeze([
  "apply",
  "custodyReceiptRoot",
  "expectedArtifactManifestSha256",
  "expectedDependencyArchiveSha256",
  "expectedDependencyManifestSha256",
  "expectedExpiresAt",
  "expectedHeaderSha256",
  "expectedReceiptSha256",
  "expectedReplayClaimSha256",
  "expectedReplayClaimSizeBytes",
  "expectedSourceArtifactSha256",
  "expectedSourceCommit",
  "ingressReceiptRoot",
  "packetId",
  "quarantineRoot",
  "stageInputRoot"
]);
const TEST_RUNTIMES = new WeakSet();
const RENAME_NOREPLACE = String.raw`import ctypes,errno,os,sys
try:r=ctypes.CDLL(None,use_errno=True).renameat2
except (AttributeError,OSError):sys.exit(70)
r.argtypes=[ctypes.c_int,ctypes.c_char_p,ctypes.c_int,ctypes.c_char_p,ctypes.c_uint]
r.restype=ctypes.c_int
z=r(3,os.fsencode(sys.argv[1]),4,os.fsencode(sys.argv[2]),1)
if z==0:sys.exit(0)
e=ctypes.get_errno();sys.exit(17 if e==errno.EEXIST else 70 if e in (errno.ENOSYS,errno.EINVAL) else 71)`;

export class ArtifactIngressV2StageInputCustodyError extends Error {
  constructor(code) {
    super(code);
    this.name = "ArtifactIngressV2StageInputCustodyError";
    this.code = code;
  }
}

function fail(code) {
  throw new ArtifactIngressV2StageInputCustodyError(code);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function mode(metadata) {
  return metadata.mode & 0o777;
}

function sameNode(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function stableFileIdentity(left, right) {
  return sameNode(left, right)
    && left.size === right.size
    && left.nlink === right.nlink
    && left.uid === right.uid
    && left.gid === right.gid
    && left.mode === right.mode
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

function stableDirectoryIdentity(left, right) {
  return sameNode(left, right)
    && left.nlink === right.nlink
    && left.uid === right.uid
    && left.gid === right.gid
    && left.mode === right.mode
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

function canonicalIso(value) {
  return typeof value === "string"
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function normalizeRoot(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 4096
    || value.includes("\0") || !isAbsolute(value)) {
    fail("artifact_ingress_stage_custody_arguments_invalid");
  }
  const normalized = resolve(value);
  if (normalized !== value) fail("artifact_ingress_stage_custody_root_invalid");
  return normalized;
}

function contains(parent, child) {
  const value = relative(parent, child);
  return value !== "" && value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value);
}

function validateRoots(values) {
  const roots = [
    values.quarantineRoot,
    values.ingressReceiptRoot,
    values.stageInputRoot,
    values.custodyReceiptRoot
  ].map(normalizeRoot);
  for (let left = 0; left < roots.length; left += 1) {
    for (let right = left + 1; right < roots.length; right += 1) {
      if (roots[left] === roots[right] || contains(roots[left], roots[right]) || contains(roots[right], roots[left])) {
        fail("artifact_ingress_stage_custody_root_invalid");
      }
    }
  }
  const deploymentRoot = resolve(PRODUCTION_STAGE_ROOT);
  if (roots[2] === deploymentRoot || contains(roots[2], deploymentRoot) || contains(deploymentRoot, roots[2])) {
    fail("artifact_ingress_stage_custody_root_invalid");
  }
  return Object.freeze({
    quarantineRoot: roots[0],
    ingressReceiptRoot: roots[1],
    stageInputRoot: roots[2],
    custodyReceiptRoot: roots[3]
  });
}

function productionRenameNoReplace({ sourceRoot, sourceName, destinationRoot, destinationName }) {
  const result = spawnSync("/usr/bin/python3", ["-c", RENAME_NOREPLACE, sourceName, destinationName], {
    cwd: "/",
    env: { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" },
    stdio: ["ignore", "ignore", "ignore", sourceRoot.handle.fd, destinationRoot.handle.fd],
    timeout: 15_000,
    windowsHide: true
  });
  if (result.error || result.status === 70) fail("artifact_ingress_stage_custody_noreplace_unavailable");
  if (result.status === 17) return false;
  if (result.status !== 0) fail("artifact_ingress_stage_custody_publish_failed");
  return true;
}

async function productionOpenDirectory(path) {
  return open(path, fsConstants.O_RDONLY
    | (fsConstants.O_DIRECTORY ?? 0)
    | (fsConstants.O_NOFOLLOW ?? 0)
    | (fsConstants.O_CLOEXEC ?? 0));
}

async function syncDirectory(path) {
  const handle = await productionOpenDirectory(path);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function productionRuntime() {
  if (process.platform !== "linux" || process.getuid?.() !== 0) {
    fail("artifact_ingress_stage_custody_root_required");
  }
  return Object.freeze({
    platform: process.platform,
    now: () => new Date().toISOString(),
    lstat,
    realpath,
    openDirectory: productionOpenDirectory,
    openFile: open,
    mkdir,
    readdir,
    rmTree: (path) => rm(path, { recursive: true, force: true }),
    unlink,
    anchoredChild: (directory, name) => `/proc/self/fd/${directory.handle.fd}/${name}`,
    anchoredDirectory: (directory) => `/proc/self/fd/${directory.handle.fd}`,
    ownerOf: (_path, metadata) => ({ uid: metadata.uid, gid: metadata.gid }),
    modeOf: (_path, metadata) => mode(metadata),
    setDirectoryCustody: async (directory) => {
      await directory.handle.chown(0, 0);
      await directory.handle.chmod(0o700);
    },
    setFileCustody: async (file) => {
      await file.handle.chown(0, 0);
      await file.handle.chmod(0o600);
    },
    syncDirectory: (directory) => directory.handle.sync(),
    syncPathDirectory: syncDirectory,
    renameNoReplace: productionRenameNoReplace,
    temporaryId: randomUUID,
    faultAt: async () => {}
  });
}

export function createArtifactIngressV2StageInputCustodianTestRuntime(overrides = {}) {
  const runtime = {
    platform: overrides.platform ?? process.platform,
    now: overrides.now ?? (() => new Date().toISOString()),
    lstat: overrides.lstat ?? lstat,
    realpath: overrides.realpath ?? realpath,
    openDirectory: overrides.openDirectory ?? (async (path) => ({
      fd: -1,
      stat: () => lstat(path),
      sync: async () => {},
      close: async () => {}
    })),
    openFile: overrides.openFile ?? open,
    mkdir: overrides.mkdir ?? mkdir,
    readdir: overrides.readdir ?? readdir,
    rmTree: overrides.rmTree ?? ((path) => rm(path, { recursive: true, force: true })),
    unlink: overrides.unlink ?? unlink,
    anchoredChild: overrides.anchoredChild ?? ((directory, name) => join(directory.path, name)),
    anchoredDirectory: overrides.anchoredDirectory ?? ((directory) => directory.path),
    ownerOf: overrides.ownerOf ?? ((_path, metadata) => ({ uid: metadata.uid, gid: metadata.gid })),
    modeOf: overrides.modeOf ?? ((_path, metadata) => mode(metadata)),
    setDirectoryCustody: overrides.setDirectoryCustody ?? (async (directory) => chmod(directory.path, 0o700)),
    setFileCustody: overrides.setFileCustody ?? (async (file) => chmod(file.path, 0o600)),
    syncDirectory: overrides.syncDirectory ?? (async () => {}),
    syncPathDirectory: overrides.syncPathDirectory ?? (async () => {}),
    renameNoReplace: overrides.renameNoReplace ?? (async ({ source, destination }) => {
      try {
        await lstat(destination);
        return false;
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
      await rename(source, destination);
      return true;
    }),
    temporaryId: overrides.temporaryId ?? randomUUID,
    faultAt: overrides.faultAt ?? (async () => {})
  };
  TEST_RUNTIMES.add(runtime);
  return Object.freeze(runtime);
}

function selectedRuntime(supplied) {
  if (supplied === undefined) return productionRuntime();
  if (!TEST_RUNTIMES.has(supplied)) fail("artifact_ingress_stage_custody_runtime_invalid");
  return supplied;
}

async function checkpoint(runtime, phase) {
  await runtime.faultAt(phase);
}

function owner(record, runtime) {
  const value = runtime.ownerOf(record.path, record.metadata);
  if (!value || !Number.isInteger(value.uid) || !Number.isInteger(value.gid) || value.uid < 0 || value.gid < 0) {
    fail("artifact_ingress_stage_custody_storage_invalid");
  }
  return value;
}

function observedMode(record, runtime) {
  const value = runtime.modeOf(record.path, record.metadata);
  if (!Number.isInteger(value) || value < 0 || value > 0o7777) fail("artifact_ingress_stage_custody_storage_invalid");
  return value & 0o777;
}

async function openDirectoryRecord(path, runtime, code) {
  let lexical;
  let handle;
  try {
    lexical = await runtime.lstat(path);
    if (lexical.isSymbolicLink() || !lexical.isDirectory()) fail(code);
    handle = await runtime.openDirectory(path);
    const held = await handle.stat();
    if (!held.isDirectory() || !sameNode(lexical, held)) fail(code);
    return { path, handle, metadata: held };
  } catch (error) {
    await handle?.close().catch(() => {});
    if (error instanceof ArtifactIngressV2StageInputCustodyError) throw error;
    fail(code);
  }
}

async function requireCanonicalRootPath(path, runtime) {
  let physical;
  try {
    physical = await runtime.realpath(path);
  } catch {
    fail("artifact_ingress_stage_custody_root_invalid");
  }
  if (resolve(physical) !== path) fail("artifact_ingress_stage_custody_root_invalid");
}

function requireRootBoundary(record, runtime, { exactMode = null, code }) {
  const value = owner(record, runtime);
  const currentMode = observedMode(record, runtime);
  if (value.uid !== 0 || value.gid !== 0 || (exactMode === null ? (currentMode & 0o002) !== 0 : currentMode !== exactMode)) {
    fail(code);
  }
}

function requireIngressDirectory(record, runtime) {
  const value = owner(record, runtime);
  if (value.uid === 0 || observedMode(record, runtime) !== 0o700) {
    fail("artifact_ingress_stage_custody_source_invalid");
  }
  return value;
}

async function openFileRecord(path, maximumBytes, runtime, code) {
  let lexical;
  let handle;
  try {
    lexical = await runtime.lstat(path);
    if (lexical.isSymbolicLink() || !lexical.isFile()) fail(code);
    handle = await runtime.openFile(path, fsConstants.O_RDONLY
      | (fsConstants.O_NOFOLLOW ?? 0)
      | (fsConstants.O_NONBLOCK ?? 0)
      | (fsConstants.O_CLOEXEC ?? 0));
    const held = await handle.stat();
    if (!held.isFile() || held.nlink !== 1 || held.size < 0 || held.size > maximumBytes
      || !Number.isSafeInteger(held.size) || !sameNode(lexical, held)) {
      fail(code);
    }
    return { path, handle, lexical, metadata: held };
  } catch (error) {
    await handle?.close().catch(() => {});
    if (error instanceof ArtifactIngressV2StageInputCustodyError) throw error;
    fail(code);
  }
}

function requireIngressFile(record, ingressOwner, runtime) {
  const value = owner(record, runtime);
  if (value.uid !== ingressOwner.uid || value.gid !== ingressOwner.gid
    || observedMode(record, runtime) !== 0o600) {
    fail("artifact_ingress_stage_custody_source_invalid");
  }
}

async function positionalRead(handle, size, write) {
  let position = 0;
  while (position < size) {
    const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, size - position));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
    if (!Number.isInteger(bytesRead) || bytesRead <= 0) fail("artifact_ingress_stage_custody_source_changed");
    await write(buffer.subarray(0, bytesRead));
    position += bytesRead;
  }
  const extra = Buffer.alloc(1);
  const { bytesRead } = await handle.read(extra, 0, 1, size);
  if (bytesRead !== 0) fail("artifact_ingress_stage_custody_source_changed");
}

async function assertFileStable(record, runtime) {
  let after;
  let lexicalAfter;
  try {
    after = await record.handle.stat();
    lexicalAfter = await runtime.lstat(record.path);
  } catch {
    fail("artifact_ingress_stage_custody_source_changed");
  }
  if (!stableFileIdentity(record.metadata, after) || !stableFileIdentity(record.lexical, lexicalAfter)
    || !sameNode(after, lexicalAfter)) {
    fail("artifact_ingress_stage_custody_source_changed");
  }
}

async function assertDirectoryStable(record, runtime, code = "artifact_ingress_stage_custody_source_changed") {
  let held;
  let lexical;
  try {
    held = await record.handle.stat();
    lexical = await runtime.lstat(record.path);
  } catch {
    fail(code);
  }
  if (!held.isDirectory() || !lexical.isDirectory() || lexical.isSymbolicLink()
    || !stableDirectoryIdentity(record.metadata, held)
    || !stableDirectoryIdentity(held, lexical)) {
    fail(code);
  }
}

async function assertOutputRootStable(record, runtime) {
  let held;
  let lexical;
  try {
    held = await record.handle.stat();
    lexical = await runtime.lstat(record.path);
  } catch {
    fail("artifact_ingress_stage_custody_root_changed");
  }
  const current = { path: record.path, metadata: held };
  const currentOwner = owner(current, runtime);
  if (!held.isDirectory() || !lexical.isDirectory() || lexical.isSymbolicLink()
    || !sameNode(record.metadata, held) || !sameNode(held, lexical)
    || currentOwner.uid !== 0 || currentOwner.gid !== 0
    || observedMode(current, runtime) !== 0o700) {
    fail("artifact_ingress_stage_custody_root_changed");
  }
}

async function readStableFile(record, runtime) {
  const parts = [];
  await positionalRead(record.handle, record.metadata.size, async (bytes) => { parts.push(Buffer.from(bytes)); });
  await assertFileStable(record, runtime);
  return Buffer.concat(parts, record.metadata.size);
}

function parseReplayClaim(bytes, { packetId, sourceCommit, expiresAt, headerSha256, now }) {
  let value;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    fail("artifact_ingress_stage_custody_claim_invalid");
  }
  if (!exactKeys(value, [
    "claimedAt", "expiresAt", "headerSha256", "issuedAt", "packetId", "schemaVersion", "sourceCommit", "type"
  ])
    || value.schemaVersion !== "1"
    || value.type !== "control_plane_artifact_ingress_replay_claim"
    || value.packetId !== packetId
    || value.sourceCommit !== sourceCommit
    || value.expiresAt !== expiresAt
    || value.headerSha256 !== headerSha256
    || !canonicalIso(value.issuedAt)
    || !canonicalIso(value.claimedAt)
    || Date.parse(value.issuedAt) > Date.parse(value.claimedAt)
    || Date.parse(value.claimedAt) > Date.parse(now)
    || Date.parse(value.claimedAt) >= Date.parse(value.expiresAt)
    || !bytes.equals(Buffer.from(`${JSON.stringify(value)}\n`, "utf8"))) {
    fail("artifact_ingress_stage_custody_claim_invalid");
  }
  return value;
}

async function createRootFile(path, runtime) {
  let handle;
  try {
    handle = await runtime.openFile(path, fsConstants.O_WRONLY
      | fsConstants.O_CREAT
      | fsConstants.O_EXCL
      | (fsConstants.O_NOFOLLOW ?? 0)
      | (fsConstants.O_CLOEXEC ?? 0), 0o600);
    const record = { path, handle, metadata: await handle.stat() };
    await runtime.setFileCustody(record);
    record.metadata = await handle.stat();
    requireRootBoundary(record, runtime, { exactMode: 0o600, code: "artifact_ingress_stage_custody_storage_invalid" });
    return record;
  } catch (error) {
    await handle?.close().catch(() => {});
    if (error instanceof ArtifactIngressV2StageInputCustodyError) throw error;
    if (error?.code === "EEXIST") fail("artifact_ingress_stage_custody_exists");
    fail("artifact_ingress_stage_custody_storage_invalid");
  }
}

async function writeAll(handle, bytes, position = null) {
  let offset = 0;
  while (offset < bytes.length) {
    const at = position === null ? null : position + offset;
    const { bytesWritten } = await handle.write(bytes, offset, bytes.length - offset, at);
    if (!Number.isInteger(bytesWritten) || bytesWritten <= 0) fail("artifact_ingress_stage_custody_write_failed");
    offset += bytesWritten;
  }
}

async function copySourceFile({ source, destinationPath, entry, runtime, capture }) {
  if (source.metadata.size !== entry.sizeBytes) fail("artifact_ingress_stage_custody_digest_mismatch");
  const destination = await createRootFile(destinationPath, runtime);
  const hash = createHash("sha256");
  const captured = [];
  let position = 0;
  try {
    await positionalRead(source.handle, source.metadata.size, async (bytes) => {
      hash.update(bytes);
      if (capture) captured.push(Buffer.from(bytes));
      await writeAll(destination.handle, bytes, position);
      position += bytes.length;
    });
    await destination.handle.sync();
    const after = await destination.handle.stat();
    destination.metadata = after;
    requireRootBoundary(destination, runtime, {
      exactMode: 0o600,
      code: "artifact_ingress_stage_custody_destination_invalid"
    });
    if (!after.isFile() || after.nlink !== 1 || after.size !== entry.sizeBytes
      || hash.digest("hex") !== entry.sha256) {
      fail("artifact_ingress_stage_custody_digest_mismatch");
    }
    await assertFileStable(source, runtime);
    return Object.freeze({
      path: destinationPath,
      sha256: entry.sha256,
      sizeBytes: entry.sizeBytes,
      ...(capture ? { bytes: Buffer.concat(captured, entry.sizeBytes) } : {})
    });
  } finally {
    await destination.handle.close().catch(() => {});
  }
}

function validateSemanticBindings({ header, copied, expected }) {
  let manifest;
  let dependencyManifest;
  try {
    manifest = parseArtifactManifest({ bytes: copied[0].bytes });
    dependencyManifest = parseDependencyArtifactManifest({ bytes: copied[3].bytes });
  } catch {
    fail("artifact_ingress_stage_custody_manifest_invalid");
  }
  const archiveName = manifest.value.artifact.fileName;
  if (!SOURCE_ARCHIVE.test(archiveName)
    || header.entries[1].name !== archiveName
    || header.entries[2].name !== `${archiveName}.sha256`
    || manifest.sha256 !== expected.artifactManifestSha256
    || manifest.value.sourceCommit !== expected.sourceCommit
    || manifest.value.artifact.sha256 !== expected.sourceArtifactSha256
    || manifest.value.artifact.sha256 !== copied[1].sha256
    || manifest.value.artifact.sizeBytes !== copied[1].sizeBytes) {
    fail("artifact_ingress_stage_custody_source_binding_mismatch");
  }
  const checksum = Buffer.from(`${copied[1].sha256}  .release-artifacts/${archiveName}\n`, "utf8");
  if (!copied[2].bytes.equals(checksum)
    || !copied[5].bytes.equals(Buffer.from(`${manifest.value.release}\n`, "utf8"))) {
    fail("artifact_ingress_stage_custody_source_binding_mismatch");
  }
  if (dependencyManifest.sha256 !== expected.dependencyManifestSha256
    || dependencyManifest.value.sourceCommit !== expected.sourceCommit
    || dependencyManifest.value.artifactRelease !== manifest.value.release
    || dependencyManifest.value.archive.fileName !== "node-modules.tar"
    || dependencyManifest.value.archive.sha256 !== expected.dependencyArchiveSha256
    || dependencyManifest.value.archive.sha256 !== copied[4].sha256
    || dependencyManifest.value.archive.sizeBytes !== copied[4].sizeBytes) {
    fail("artifact_ingress_stage_custody_dependency_binding_mismatch");
  }
  return Object.freeze({ artifactRelease: manifest.value.release, archiveName });
}

function validateExpected(options) {
  if (!UUID_V4.test(options.packetId || "")
    || !COMMIT.test(options.expectedSourceCommit || "")
    || !canonicalIso(options.expectedExpiresAt)
    || !HASH.test(options.expectedHeaderSha256 || "")
    || !HASH.test(options.expectedReceiptSha256 || "")
    || !HASH.test(options.expectedReplayClaimSha256 || "")
    || !Number.isSafeInteger(options.expectedReplayClaimSizeBytes)
    || options.expectedReplayClaimSizeBytes <= 0
    || options.expectedReplayClaimSizeBytes > MAX_RECEIPT_BYTES
    || !HASH.test(options.expectedArtifactManifestSha256 || "")
    || !HASH.test(options.expectedSourceArtifactSha256 || "")
    || !HASH.test(options.expectedDependencyManifestSha256 || "")
    || !HASH.test(options.expectedDependencyArchiveSha256 || "")) {
    fail("artifact_ingress_stage_custody_arguments_invalid");
  }
  return Object.freeze({
    packetId: options.packetId,
    sourceCommit: options.expectedSourceCommit,
    expiresAt: options.expectedExpiresAt,
    headerSha256: options.expectedHeaderSha256,
    receiptSha256: options.expectedReceiptSha256,
    replayClaimSha256: options.expectedReplayClaimSha256,
    replayClaimSizeBytes: options.expectedReplayClaimSizeBytes,
    artifactManifestSha256: options.expectedArtifactManifestSha256,
    sourceArtifactSha256: options.expectedSourceArtifactSha256,
    dependencyManifestSha256: options.expectedDependencyManifestSha256,
    dependencyArchiveSha256: options.expectedDependencyArchiveSha256
  });
}

function rootSetSha256(roots) {
  return sha256(Buffer.from(JSON.stringify([
    roots.quarantineRoot,
    roots.ingressReceiptRoot,
    roots.stageInputRoot,
    roots.custodyReceiptRoot
  ]), "utf8"));
}

async function ensureMissing(path, runtime) {
  try {
    await runtime.lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    fail("artifact_ingress_stage_custody_storage_invalid");
  }
  fail("artifact_ingress_stage_custody_exists");
}

async function optionalMetadata(path, runtime) {
  try {
    return await runtime.lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    fail("artifact_ingress_stage_custody_storage_invalid");
  }
}

async function verifiedNoReplace({
  sourceRoot,
  sourceName,
  destinationRoot,
  destinationName,
  sourceMetadata,
  runtime
}) {
  const source = runtime.anchoredChild(sourceRoot, sourceName);
  const destination = runtime.anchoredChild(destinationRoot, destinationName);
  let outcome;
  let thrown;
  try {
    outcome = await runtime.renameNoReplace({
      sourceRoot,
      sourceName,
      destinationRoot,
      destinationName,
      source,
      destination
    });
  } catch (error) {
    thrown = error;
  }
  const sourceAfter = await optionalMetadata(source, runtime);
  const destinationAfter = await optionalMetadata(destination, runtime);
  const sourceRetained = sourceAfter && sameNode(sourceMetadata, sourceAfter);
  const destinationPublished = destinationAfter && sameNode(sourceMetadata, destinationAfter);
  if (!sourceAfter && destinationPublished) {
    return Object.freeze({ state: "published", uncertain: Boolean(thrown) || outcome !== true });
  }
  if (sourceRetained && destinationAfter && !destinationPublished && outcome === false && !thrown) {
    return Object.freeze({ state: "collision", uncertain: false });
  }
  if (sourceRetained && !destinationAfter && thrown) throw thrown;
  return Object.freeze({ state: "unknown", uncertain: true });
}

async function removePublishedDestinationIfOwned({ root, name, expectedMetadata, runtime }) {
  await assertOutputRootStable(root, runtime);
  const destination = runtime.anchoredChild(root, name);
  const observed = await optionalMetadata(destination, runtime);
  if (!observed || !sameNode(observed, expectedMetadata)) return false;
  try {
    await runtime.rmTree(destination);
  } catch {
    fail("artifact_ingress_stage_custody_cleanup_failed");
  }
  if (await optionalMetadata(destination, runtime)) fail("artifact_ingress_stage_custody_cleanup_failed");
  await runtime.syncDirectory(root);
  return true;
}

async function closeAll(records) {
  for (const record of [...records].reverse()) await record.handle?.close().catch(() => {});
}

export async function custodyArtifactIngressV2StageInput(options = {}) {
  const optionKeys = Object.keys(options).sort();
  const expectedOptionKeys = Object.hasOwn(options, "runtime") ? [...OPTION_NAMES, "runtime"].sort() : OPTION_NAMES;
  if (optionKeys.length !== expectedOptionKeys.length
    || optionKeys.some((key, index) => key !== expectedOptionKeys[index])) {
    fail("artifact_ingress_stage_custody_arguments_invalid");
  }
  if (options.apply !== true) fail("artifact_ingress_stage_custody_apply_confirmation_required");
  const runtime = selectedRuntime(options.runtime);
  const roots = validateRoots(options);
  const expected = validateExpected(options);
  const now = runtime.now();
  if (!canonicalIso(now)) fail("artifact_ingress_stage_custody_clock_invalid");

  const opened = [];
  const sourceFiles = [];
  let stageInputRoot;
  let custodyReceiptRoot;
  let custodyClaim;
  let custodyClaimName;
  let temporaryPath;
  let temporaryName;
  let terminalTemporaryPath;
  let terminalTemporaryName;
  let publishedMetadata;
  let published = false;
  let terminalPublished = false;
  let preserveClaim = false;
  let pendingError;
  let result;
  try {
    await Promise.all(Object.values(roots).map((path) => requireCanonicalRootPath(path, runtime)));
    const quarantineRoot = await openDirectoryRecord(roots.quarantineRoot, runtime, "artifact_ingress_stage_custody_root_invalid");
    opened.push(quarantineRoot);
    requireRootBoundary(quarantineRoot, runtime, { code: "artifact_ingress_stage_custody_root_invalid" });
    const ingressReceiptRoot = await openDirectoryRecord(roots.ingressReceiptRoot, runtime, "artifact_ingress_stage_custody_root_invalid");
    opened.push(ingressReceiptRoot);
    requireRootBoundary(ingressReceiptRoot, runtime, { code: "artifact_ingress_stage_custody_root_invalid" });
    stageInputRoot = await openDirectoryRecord(roots.stageInputRoot, runtime, "artifact_ingress_stage_custody_root_invalid");
    opened.push(stageInputRoot);
    requireRootBoundary(stageInputRoot, runtime, { exactMode: 0o700, code: "artifact_ingress_stage_custody_root_invalid" });
    custodyReceiptRoot = await openDirectoryRecord(roots.custodyReceiptRoot, runtime, "artifact_ingress_stage_custody_root_invalid");
    opened.push(custodyReceiptRoot);
    requireRootBoundary(custodyReceiptRoot, runtime, { exactMode: 0o700, code: "artifact_ingress_stage_custody_root_invalid" });

    await assertOutputRootStable(stageInputRoot, runtime);
    await assertOutputRootStable(custodyReceiptRoot, runtime);
    const destinationPath = runtime.anchoredChild(stageInputRoot, expected.packetId);
    const terminalReceiptPath = runtime.anchoredChild(custodyReceiptRoot, `${expected.packetId}.json`);
    await ensureMissing(destinationPath, runtime);
    await ensureMissing(terminalReceiptPath, runtime);

    const candidate = await openDirectoryRecord(
      runtime.anchoredChild(quarantineRoot, expected.packetId),
      runtime,
      "artifact_ingress_stage_custody_source_invalid"
    );
    opened.push(candidate);
    const ingressOwner = requireIngressDirectory(candidate, runtime);

    const claimPath = runtime.anchoredChild(ingressReceiptRoot, `.replay-${expected.packetId}.json`);
    const replayClaim = await openFileRecord(claimPath, MAX_RECEIPT_BYTES, runtime, "artifact_ingress_stage_custody_claim_invalid");
    opened.push(replayClaim);
    requireIngressFile(replayClaim, ingressOwner, runtime);
    const receiptPath = runtime.anchoredChild(ingressReceiptRoot, `${expected.packetId}.json`);
    const ingressReceipt = await openFileRecord(receiptPath, MAX_RECEIPT_BYTES, runtime, "artifact_ingress_stage_custody_receipt_invalid");
    opened.push(ingressReceipt);
    requireIngressFile(ingressReceipt, ingressOwner, runtime);

    const receiptBytes = await readStableFile(ingressReceipt, runtime);
    if (sha256(receiptBytes) !== expected.receiptSha256) fail("artifact_ingress_stage_custody_receipt_mismatch");
    let parsed;
    try {
      parsed = parseIngressV2Receipt({ bytes: receiptBytes, now });
    } catch (error) {
      if (error instanceof ArtifactIngressV2ContractError) fail("artifact_ingress_stage_custody_receipt_invalid");
      throw error;
    }
    const headerBytes = Buffer.from(JSON.stringify(parsed.header), "utf8");
    if (parsed.header.packetId !== expected.packetId
      || parsed.header.sourceCommit !== expected.sourceCommit
      || parsed.header.expiresAt !== expected.expiresAt
      || sha256(headerBytes) !== expected.headerSha256) {
      fail("artifact_ingress_stage_custody_header_mismatch");
    }
    const replayClaimBytes = await readStableFile(replayClaim, runtime);
    if (replayClaimBytes.length !== expected.replayClaimSizeBytes
      || sha256(replayClaimBytes) !== expected.replayClaimSha256) {
      fail("artifact_ingress_stage_custody_claim_mismatch");
    }
    parseReplayClaim(replayClaimBytes, {
      packetId: expected.packetId,
      sourceCommit: expected.sourceCommit,
      expiresAt: expected.expiresAt,
      headerSha256: expected.headerSha256,
      now
    });
    if (parsed.header.entries[0].sha256 !== expected.artifactManifestSha256
      || parsed.header.entries[1].sha256 !== expected.sourceArtifactSha256
      || parsed.header.entries[3].sha256 !== expected.dependencyManifestSha256
      || parsed.header.entries[4].sha256 !== expected.dependencyArchiveSha256) {
      fail("artifact_ingress_stage_custody_digest_mismatch");
    }

    const names = (await runtime.readdir(runtime.anchoredDirectory(candidate))).sort();
    const expectedNames = parsed.header.entries.map(({ name }) => name).sort();
    if (names.length !== 6 || names.join("\0") !== expectedNames.join("\0")) {
      fail("artifact_ingress_stage_custody_source_invalid");
    }
    const maximums = [MAX_MANIFEST_BYTES, MAX_AGGREGATE_BYTES, MAX_CHECKSUM_BYTES, MAX_MANIFEST_BYTES, MAX_AGGREGATE_BYTES, MAX_LABEL_BYTES];
    for (let index = 0; index < parsed.header.entries.length; index += 1) {
      const entry = parsed.header.entries[index];
      const record = await openFileRecord(
        runtime.anchoredChild(candidate, entry.name),
        maximums[index],
        runtime,
        "artifact_ingress_stage_custody_source_invalid"
      );
      requireIngressFile(record, ingressOwner, runtime);
      opened.push(record);
      sourceFiles.push(record);
    }
    await checkpoint(runtime, "source_verified");

    custodyClaimName = `.claim-${expected.packetId}.json`;
    const custodyClaimPath = runtime.anchoredChild(custodyReceiptRoot, custodyClaimName);
    custodyClaim = await createRootFile(custodyClaimPath, runtime);
    opened.push(custodyClaim);
    await writeAll(custodyClaim.handle, Buffer.from(`${JSON.stringify({
      schemaVersion: "1",
      type: "control_plane_artifact_ingress_v2_stage_input_custody_claim",
      packetId: expected.packetId,
      sourceCommit: expected.sourceCommit,
      expiresAt: expected.expiresAt,
      headerSha256: expected.headerSha256,
      receiptSha256: expected.receiptSha256,
      replayClaimSha256: expected.replayClaimSha256,
      replayClaimSizeBytes: expected.replayClaimSizeBytes,
      rootSetSha256: rootSetSha256(roots)
    })}\n`, "utf8"));
    await custodyClaim.handle.sync();
    await runtime.syncDirectory(custodyReceiptRoot);
    await checkpoint(runtime, "claim_persisted");
    await assertOutputRootStable(stageInputRoot, runtime);
    await assertOutputRootStable(custodyReceiptRoot, runtime);

    temporaryName = `.importing-${expected.packetId}-${runtime.temporaryId()}`;
    const proposedTemporaryPath = runtime.anchoredChild(stageInputRoot, temporaryName);
    try {
      await runtime.mkdir(proposedTemporaryPath, { mode: 0o700 });
    } catch (error) {
      if (error?.code === "EEXIST") fail("artifact_ingress_stage_custody_exists");
      fail("artifact_ingress_stage_custody_storage_invalid");
    }
    temporaryPath = proposedTemporaryPath;
    const temporary = await openDirectoryRecord(temporaryPath, runtime, "artifact_ingress_stage_custody_storage_invalid");
    opened.push(temporary);
    await runtime.setDirectoryCustody(temporary);
    temporary.metadata = await temporary.handle.stat();
    requireRootBoundary(temporary, runtime, { exactMode: 0o700, code: "artifact_ingress_stage_custody_destination_invalid" });

    const copied = [];
    for (let index = 0; index < parsed.header.entries.length; index += 1) {
      copied.push(await copySourceFile({
        source: sourceFiles[index],
        destinationPath: runtime.anchoredChild(temporary, parsed.header.entries[index].name),
        entry: parsed.header.entries[index],
        runtime,
        capture: [0, 2, 3, 5].includes(index)
      }));
      await checkpoint(runtime, `file_${index}_copied`);
    }
    validateSemanticBindings({ header: parsed.header, copied, expected });
    const temporaryNames = (await runtime.readdir(runtime.anchoredDirectory(temporary))).sort();
    if (temporaryNames.length !== 6 || temporaryNames.join("\0") !== expectedNames.join("\0")) {
      fail("artifact_ingress_stage_custody_destination_invalid");
    }
    temporary.metadata = await temporary.handle.stat();
    const afterNames = (await runtime.readdir(runtime.anchoredDirectory(candidate))).sort();
    if (afterNames.join("\0") !== names.join("\0")) fail("artifact_ingress_stage_custody_source_changed");
    await assertDirectoryStable(candidate, runtime);
    await assertDirectoryStable(temporary, runtime, "artifact_ingress_stage_custody_destination_invalid");
    await assertFileStable(replayClaim, runtime);
    await assertFileStable(ingressReceipt, runtime);
    for (const record of sourceFiles) await assertFileStable(record, runtime);
    const beforePublishAt = runtime.now();
    validateIngressV2Header(parsed.header, { now: beforePublishAt });
    await runtime.syncDirectory(temporary);
    await checkpoint(runtime, "before_publish");
    await assertOutputRootStable(stageInputRoot, runtime);
    const publication = await verifiedNoReplace({
      sourceRoot: stageInputRoot,
      sourceName: temporaryName,
      destinationRoot: stageInputRoot,
      destinationName: expected.packetId,
      sourceMetadata: temporary.metadata,
      runtime
    });
    if (publication.state === "collision") fail("artifact_ingress_stage_custody_exists");
    if (publication.state !== "published") {
      preserveClaim = true;
      fail("artifact_ingress_stage_custody_incomplete");
    }
    publishedMetadata = temporary.metadata;
    published = true;
    if (publication.uncertain) fail("artifact_ingress_stage_custody_incomplete");
    await runtime.syncDirectory(stageInputRoot);
    const importedAt = runtime.now();
    validateIngressV2Header(parsed.header, { now: importedAt });
    await checkpoint(runtime, "after_publish");
    await assertOutputRootStable(stageInputRoot, runtime);
    await assertOutputRootStable(custodyReceiptRoot, runtime);

    result = Object.freeze({
      schemaVersion: "1",
      type: "control_plane_artifact_ingress_v2_stage_input_custody_receipt",
      state: "stage_input_custodied",
      packetId: expected.packetId,
      sourceCommit: expected.sourceCommit,
      importedAt,
      expiresAt: expected.expiresAt,
      headerSha256: expected.headerSha256,
      ingressReceiptSha256: expected.receiptSha256,
      replayClaimSha256: expected.replayClaimSha256,
      replayClaimSizeBytes: expected.replayClaimSizeBytes,
      rootSetSha256: rootSetSha256(roots),
      aggregateSizeBytes: parsed.header.aggregateSizeBytes,
      entries: parsed.header.entries.map(({ name, sizeBytes, sha256: digest }) => ({ name, sizeBytes, sha256: digest }))
    });
    terminalTemporaryName = `.receipt-${expected.packetId}-${runtime.temporaryId()}`;
    const proposedTerminalTemporaryPath = runtime.anchoredChild(custodyReceiptRoot, terminalTemporaryName);
    const terminal = await createRootFile(proposedTerminalTemporaryPath, runtime);
    terminalTemporaryPath = proposedTerminalTemporaryPath;
    opened.push(terminal);
    await writeAll(terminal.handle, Buffer.from(`${JSON.stringify(result)}\n`, "utf8"));
    await terminal.handle.sync();
    await checkpoint(runtime, "before_terminal_receipt");
    await terminal.handle.close();
    await assertOutputRootStable(custodyReceiptRoot, runtime);
    const terminalPublication = await verifiedNoReplace({
      sourceRoot: custodyReceiptRoot,
      sourceName: terminalTemporaryName,
      destinationRoot: custodyReceiptRoot,
      destinationName: `${expected.packetId}.json`,
      sourceMetadata: terminal.metadata,
      runtime
    });
    if (terminalPublication.state !== "published") {
      preserveClaim = true;
      fail("artifact_ingress_stage_custody_incomplete");
    }
    terminalPublished = true;
    if (terminalPublication.uncertain) fail("artifact_ingress_stage_custody_incomplete");
    await runtime.syncDirectory(custodyReceiptRoot);
    await checkpoint(runtime, "terminal_receipt_persisted");
    await assertOutputRootStable(stageInputRoot, runtime);
    await assertOutputRootStable(custodyReceiptRoot, runtime);
  } catch (error) {
    if (error instanceof ArtifactIngressV2StageInputCustodyError
      && error.code === "artifact_ingress_stage_custody_root_changed") {
      preserveClaim = true;
    }
    pendingError = error instanceof ArtifactIngressV2StageInputCustodyError
      ? error
      : error instanceof ArtifactIngressV2ContractError
        ? new ArtifactIngressV2StageInputCustodyError("artifact_ingress_stage_custody_contract_invalid")
        : new ArtifactIngressV2StageInputCustodyError(
          published ? "artifact_ingress_stage_custody_incomplete" : "artifact_ingress_stage_custody_failed"
        );
  } finally {
    await closeAll(opened.filter((record) => record !== stageInputRoot && record !== custodyReceiptRoot));
    if (terminalTemporaryPath && !terminalPublished) {
      await runtime.rmTree(terminalTemporaryPath).catch(() => {
        pendingError = new ArtifactIngressV2StageInputCustodyError("artifact_ingress_stage_custody_cleanup_failed");
      });
    }
    if (temporaryPath && !published) {
      await runtime.rmTree(temporaryPath).catch(() => {
        pendingError = new ArtifactIngressV2StageInputCustodyError("artifact_ingress_stage_custody_cleanup_failed");
      });
    }
    if (pendingError && published && !terminalPublished && publishedMetadata && stageInputRoot) {
      await removePublishedDestinationIfOwned({
        root: stageInputRoot,
        name: expected.packetId,
        expectedMetadata: publishedMetadata,
        runtime
      }).catch(() => {
        pendingError = new ArtifactIngressV2StageInputCustodyError("artifact_ingress_stage_custody_cleanup_failed");
      });
    }
    if (custodyClaim && !published && !preserveClaim) {
      const currentClaimPath = runtime.anchoredChild(custodyReceiptRoot, custodyClaimName);
      await runtime.unlink(currentClaimPath).catch(() => {
        pendingError = new ArtifactIngressV2StageInputCustodyError("artifact_ingress_stage_custody_cleanup_failed");
      });
      await runtime.syncDirectory(custodyReceiptRoot).catch(() => {
        pendingError = new ArtifactIngressV2StageInputCustodyError("artifact_ingress_stage_custody_cleanup_failed");
      });
    }
    await closeAll([custodyReceiptRoot, stageInputRoot].filter(Boolean));
  }
  if (pendingError) throw pendingError;
  if (!published || !terminalPublished || !result) fail("artifact_ingress_stage_custody_incomplete");
  return result;
}

function parseArguments(argv) {
  if (!Array.isArray(argv)
    || argv.length !== 3 + ARGUMENT_NAMES.length * 2
    || argv[0] !== "--mode"
    || argv[1] !== "import"
    || argv[2] !== "--apply") {
    fail("artifact_ingress_stage_custody_arguments_invalid");
  }
  const values = {};
  for (let index = 0; index < ARGUMENT_NAMES.length; index += 1) {
    const name = ARGUMENT_NAMES[index];
    const flag = argv[3 + index * 2];
    const value = argv[3 + index * 2 + 1];
    if (flag !== `--${name}` || typeof value !== "string" || value.length === 0) {
      fail("artifact_ingress_stage_custody_arguments_invalid");
    }
    values[name] = value;
  }
  return values;
}

export async function runArtifactIngressV2StageInputCustodianCli({
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr,
  runtime
} = {}) {
  try {
    const value = parseArguments(argv);
    const receipt = await custodyArtifactIngressV2StageInput({
      apply: true,
      quarantineRoot: value["quarantine-root"],
      ingressReceiptRoot: value["ingress-receipt-root"],
      stageInputRoot: value["stage-input-root"],
      custodyReceiptRoot: value["custody-receipt-root"],
      packetId: value["packet-id"],
      expectedSourceCommit: value["expected-source-commit"],
      expectedExpiresAt: value["expected-expires-at"],
      expectedHeaderSha256: value["expected-header-sha256"],
      expectedReceiptSha256: value["expected-receipt-sha256"],
      expectedReplayClaimSha256: value["expected-replay-claim-sha256"],
      expectedReplayClaimSizeBytes: Number(value["expected-replay-claim-size-bytes"]),
      expectedArtifactManifestSha256: value["expected-artifact-manifest-sha256"],
      expectedSourceArtifactSha256: value["expected-source-artifact-sha256"],
      expectedDependencyManifestSha256: value["expected-dependency-manifest-sha256"],
      expectedDependencyArchiveSha256: value["expected-dependency-archive-sha256"],
      runtime
    });
    stdout.write(`${JSON.stringify(receipt)}\n`);
    return 0;
  } catch (error) {
    const code = error instanceof ArtifactIngressV2StageInputCustodyError
      ? error.code
      : "artifact_ingress_stage_custody_failed";
    stderr.write(`${code}\n`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const exitCode = await runArtifactIngressV2StageInputCustodianCli();
  if (exitCode !== 0) process.exitCode = exitCode;
}
