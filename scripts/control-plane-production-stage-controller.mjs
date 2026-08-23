#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  rmdirSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, isAbsolute, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

import {
  parseArtifactManifest,
  parseArtifactStageReceipt
} from "./control-plane-candidate-dependency-gate.mjs";
import { parseDependencyArtifactManifest } from "./control-plane-dependency-artifact.mjs";
import { inspectProductionArtifactBoundary } from "../server/services/platform/production-artifact-boundary.mjs";

export const PRODUCTION_STAGE_CONTROLLER_SCHEMA_VERSION = "1";
export const PRODUCTION_STAGE_CONTROLLER_TYPE = "control_plane_production_stage_controller";
export const PRODUCTION_STAGE_ROOT = "/opt/proxy-gateway-minimal-candidate";

const RELEASE_UNIT = "control-plane-app";
const LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const MAX_ARTIFACT_MANIFEST_BYTES = 1024 * 1024;
const MAX_DEPENDENCY_MANIFEST_BYTES = 1024 * 1024;
const MAX_CHECKSUM_BYTES = 4096;
const MAX_LABEL_BYTES = 512;
const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 10_000;
const MAX_ZIP_ENTRY_BYTES = 64 * 1024 * 1024;
const MAX_ZIP_TOTAL_BYTES = 256 * 1024 * 1024;
const MAX_ZIP_PATH_BYTES = 4096;
const ZIP_LOCAL = 0x04034b50;
const ZIP_CENTRAL = 0x02014b50;
const ZIP_END = 0x06054b50;
const TEST_RUNTIME = Symbol("production-stage-controller-test-runtime");
const SAFE_CONDITIONS = new Set([
  "invalid_input",
  "apply_confirmation_required",
  "input_boundary_invalid",
  "input_set_invalid",
  "input_file_invalid",
  "input_changed",
  "artifact_manifest_mismatch",
  "source_artifact_mismatch",
  "artifact_checksum_invalid",
  "dependency_manifest_mismatch",
  "dependency_archive_mismatch",
  "release_binding_mismatch",
  "source_binding_mismatch",
  "package_binding_mismatch",
  "source_archive_invalid",
  "source_archive_path_invalid",
  "source_archive_entry_invalid",
  "source_archive_duplicate",
  "source_archive_overlay_invalid",
  "source_archive_node_modules_invalid",
  "deployment_boundary_invalid",
  "current_release_mismatch",
  "current_release_changed",
  "candidate_present",
  "candidate_publish_failed",
  "receipt_publish_failed",
  "dependency_publish_failed",
  "stage_failed",
  "cleanup_failed"
]);

export class ProductionStageControllerError extends Error {
  constructor(condition, attentionRequired = false) {
    super(condition);
    this.name = "ProductionStageControllerError";
    this.condition = condition;
    this.attentionRequired = attentionRequired;
  }
}

function fail(condition, attentionRequired = false) {
  throw new ProductionStageControllerError(condition, attentionRequired);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function modeOf(path, metadata, runtime) {
  const supplied = runtime.modeFor?.(path, metadata);
  return Number.isInteger(supplied) ? supplied & 0o7777 : metadata.mode & 0o7777;
}

function identity(metadata) {
  return Object.freeze({
    dev: String(metadata.dev),
    ino: String(metadata.ino),
    size: String(metadata.size),
    nlink: String(metadata.nlink),
    mtimeMs: String(metadata.mtimeMs),
    ctimeMs: String(metadata.ctimeMs)
  });
}

function sameIdentity(left, right) {
  return left && right
    && left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.nlink === right.nlink
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

function sameNode(left, right) {
  return left && right && left.dev === right.dev && left.ino === right.ino;
}

function comparablePath(value) {
  const absolute = resolve(value);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}

function samePath(left, right) {
  return comparablePath(left) === comparablePath(right);
}

function directChild(parent, child) {
  return dirname(child) === parent && relative(parent, child) === basename(child);
}

function containsPath(parent, child) {
  if (samePath(parent, child)) return true;
  const value = relative(comparablePath(parent), comparablePath(child));
  return value !== ""
    && value !== ".."
    && !value.startsWith(`..${sep}`)
    && !isAbsolute(value);
}

function rootControlled(metadata, runtime) {
  return !runtime.enforceOwnership || (metadata.uid === 0 && metadata.gid === 0);
}

function lexists(path) {
  try { lstatSync(path); return true; } catch (error) {
    if (error?.code === "ENOENT") return false;
    fail("deployment_boundary_invalid");
  }
}

function stableDirectory(path, runtime, condition, expectedMode = null) {
  const absolute = resolve(path);
  let metadata;
  let physical;
  try {
    metadata = lstatSync(absolute);
    physical = realpathSync(absolute);
  } catch {
    fail(condition);
  }
  if (metadata.isSymbolicLink() || !metadata.isDirectory() || !samePath(absolute, physical) || !rootControlled(metadata, runtime)
    || runtime.requireRoot && (modeOf(absolute, metadata, runtime) & 0o022) !== 0) fail(condition);
  if (expectedMode !== null && runtime.enforceModes && modeOf(absolute, metadata, runtime) !== expectedMode) fail(condition);
  return Object.freeze({ path: absolute, metadata, identity: identity(metadata) });
}

function stableRegularFile(path, runtime, condition, expectedMode, maximumBytes) {
  const absolute = resolve(path);
  let lexical;
  let descriptor;
  let before;
  try {
    lexical = lstatSync(absolute);
    if (lexical.isSymbolicLink()) fail(condition);
    descriptor = openSync(absolute, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    before = fstatSync(descriptor);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    if (error instanceof ProductionStageControllerError) throw error;
    fail(condition);
  }
  if (!before.isFile() || before.nlink !== 1 || before.size < 0 || before.size > maximumBytes || !rootControlled(before, runtime)
    || !sameNode(identity(lexical), identity(before))) {
    closeSync(descriptor);
    fail(condition);
  }
  if (runtime.enforceModes && modeOf(absolute, before, runtime) !== expectedMode) {
    closeSync(descriptor);
    fail(condition);
  }
  let bytes;
  let after;
  try {
    bytes = readFileSync(descriptor);
    after = fstatSync(descriptor);
  } catch {
    closeSync(descriptor);
    fail(condition);
  }
  closeSync(descriptor);
  const beforeIdentity = identity(before);
  const afterIdentity = identity(after);
  if (!sameIdentity(beforeIdentity, afterIdentity) || bytes.length !== before.size) fail("input_changed");
  return Object.freeze({ path: absolute, bytes, sha256: sha256(bytes), sizeBytes: bytes.length, identity: afterIdentity });
}

function assertStableFile(record, runtime) {
  let descriptor;
  let metadata;
  try {
    descriptor = openSync(record.path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    metadata = fstatSync(descriptor);
  } catch {
    if (descriptor !== undefined) closeSync(descriptor);
    fail("input_changed");
  }
  let bytes;
  try {
    if (!sameIdentity(record.identity, identity(metadata))) fail("input_changed");
    bytes = readFileSync(descriptor);
  } finally { closeSync(descriptor); }
  if (bytes.length !== record.sizeBytes || sha256(bytes) !== record.sha256) fail("input_changed");
}

function assertStableDirectory(record) {
  let metadata;
  try { metadata = lstatSync(record.path); } catch { fail("input_changed"); }
  if (!sameIdentity(record.identity, identity(metadata))) fail("input_changed");
}

function validateOptions(options) {
  if (!options || typeof options !== "object"
    || !isAbsolute(options.inputDirectory || "")
    || !LABEL.test(options.candidateRelease || "")
    || !LABEL.test(options.expectedCurrentRelease || "")
    || options.candidateRelease === options.expectedCurrentRelease
    || !COMMIT.test(options.expectedSourceCommit || "")
    || !LABEL.test(options.expectedArtifactRelease || "")
    || !HASH.test(options.expectedArtifactManifestSha256 || "")
    || !HASH.test(options.expectedSourceArtifactSha256 || "")
    || !HASH.test(options.expectedDependencyManifestSha256 || "")
    || !HASH.test(options.expectedDependencyArchiveSha256 || "")) fail("invalid_input");
  return Object.freeze({ ...options });
}

function productionRenameNoReplace({ source, destination }) {
  const program = String.raw`import ctypes,errno,os,sys
source=os.fsencode(sys.argv[1]); destination=os.fsencode(sys.argv[2])
libc=ctypes.CDLL(None,use_errno=True)
try: renameat2=libc.renameat2
except AttributeError: sys.exit(70)
renameat2.argtypes=[ctypes.c_int,ctypes.c_char_p,ctypes.c_int,ctypes.c_char_p,ctypes.c_uint]
renameat2.restype=ctypes.c_int
if renameat2(-100,source,-100,destination,1)==0: sys.exit(0)
value=ctypes.get_errno()
if value==errno.EEXIST: sys.exit(17)
sys.exit(71)`;
  const result = spawnSync("/usr/bin/python3", ["-c", program, source, destination], {
    cwd: "/",
    env: { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" },
    stdio: "ignore",
    timeout: 15_000,
    windowsHide: true
  });
  if (result.error || ![0, 17].includes(result.status)) fail("candidate_publish_failed");
  return result.status === 0;
}

function productionRenameNoReplaceProbe() {
  const program = "import ctypes,sys\ntry:getattr(ctypes.CDLL(None),'renameat2')\nexcept (AttributeError,OSError):sys.exit(70)";
  const result = spawnSync("/usr/bin/python3", ["-c", program], {
    cwd: "/",
    env: { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" },
    stdio: "ignore",
    timeout: 15_000,
    windowsHide: true
  });
  return !result.error && result.status === 0;
}

function runtime(value = {}) {
  return Object.freeze({
    root: value.root ?? PRODUCTION_STAGE_ROOT,
    requireRoot: value.requireRoot ?? true,
    enforceOwnership: value.enforceOwnership ?? true,
    enforceModes: value.enforceModes ?? true,
    renameNoReplace: value.renameNoReplace ?? productionRenameNoReplace,
    probeRenameNoReplace: value.probeRenameNoReplace ?? productionRenameNoReplaceProbe,
    beforeFirstMutation: value.beforeFirstMutation ?? (() => {}),
    afterPublish: value.afterPublish ?? (() => {}),
    beforeDirectoryIdentityTrusted: value.beforeDirectoryIdentityTrusted ?? (() => {}),
    afterDirectoryRegistered: value.afterDirectoryRegistered ?? (() => {}),
    afterDirectoryCustodyClosed: value.afterDirectoryCustodyClosed ?? (() => {}),
    syncPublishedPath: value.syncPublishedPath ?? ((path, condition) => fsyncPath(path, condition)),
    faultAt: value.faultAt ?? null,
    modeFor: value.modeFor,
    [TEST_RUNTIME]: value[TEST_RUNTIME] === true
  });
}

export function createProductionStageControllerTestRuntime(overrides = {}) {
  return runtime({
    root: overrides.root,
    requireRoot: false,
    enforceOwnership: false,
    enforceModes: process.platform !== "win32",
    probeRenameNoReplace: () => true,
    ...overrides,
    [TEST_RUNTIME]: true
  });
}

function selectedRuntime(supplied) {
  if (supplied !== undefined) {
    if (!supplied?.[TEST_RUNTIME]) fail("invalid_input");
    return supplied;
  }
  const value = runtime();
  if (process.platform !== "linux" || value.requireRoot && process.getuid?.() !== 0 || !samePath(value.root, PRODUCTION_STAGE_ROOT)) fail("deployment_boundary_invalid");
  return value;
}

function readInputSet(options, runtimeValue) {
  const inputDirectory = stableDirectory(options.inputDirectory, runtimeValue, "input_boundary_invalid", 0o700);
  let names;
  try { names = readdirSync(inputDirectory.path).sort(); } catch { fail("input_set_invalid"); }
  if (names.length !== 6 || !names.includes("artifact.json")) fail("input_set_invalid");
  const manifestRecord = stableRegularFile(resolve(inputDirectory.path, "artifact.json"), runtimeValue, "input_file_invalid", 0o600, MAX_ARTIFACT_MANIFEST_BYTES);
  let manifest;
  try { manifest = parseArtifactManifest({ bytes: manifestRecord.bytes }); } catch { fail("artifact_manifest_mismatch"); }
  const artifactName = manifest.value.artifact.fileName;
  if (artifactName !== `proxy-gateway-${manifest.value.release}.zip`) fail("artifact_manifest_mismatch");
  const checksumName = `${artifactName}.sha256`;
  const expectedNames = ["artifact.json", artifactName, checksumName, "dependency-artifact.json", "node-modules.tar", "release-label.txt"].sort();
  if (names.join("\0") !== expectedNames.join("\0")) fail("input_set_invalid");

  const files = new Map([["artifact.json", manifestRecord]]);
  const limits = new Map([
    [artifactName, MAX_ARCHIVE_BYTES],
    [checksumName, MAX_CHECKSUM_BYTES],
    ["dependency-artifact.json", MAX_DEPENDENCY_MANIFEST_BYTES],
    ["node-modules.tar", MAX_ARCHIVE_BYTES],
    ["release-label.txt", MAX_LABEL_BYTES]
  ]);
  for (const [name, maximum] of limits) files.set(name, stableRegularFile(resolve(inputDirectory.path, name), runtimeValue, "input_file_invalid", 0o600, maximum));
  assertStableDirectory(inputDirectory);
  const afterNames = readdirSync(inputDirectory.path).sort();
  if (afterNames.join("\0") !== names.join("\0")) fail("input_changed");

  const sourceArchive = files.get(artifactName);
  const checksum = files.get(checksumName).bytes;
  const dependencyManifestRecord = files.get("dependency-artifact.json");
  const dependencyArchive = files.get("node-modules.tar");
  const releaseLabel = files.get("release-label.txt").bytes;
  if (manifest.sha256 !== options.expectedArtifactManifestSha256) fail("artifact_manifest_mismatch");
  if (manifest.value.sourceCommit !== options.expectedSourceCommit) fail("source_binding_mismatch");
  if (manifest.value.release !== options.expectedArtifactRelease) fail("release_binding_mismatch");
  if (sourceArchive.sha256 !== manifest.value.artifact.sha256
    || sourceArchive.sizeBytes !== manifest.value.artifact.sizeBytes
    || sourceArchive.sha256 !== options.expectedSourceArtifactSha256) fail("source_artifact_mismatch");
  const expectedChecksum = Buffer.from(`${sourceArchive.sha256}  .release-artifacts/${artifactName}\n`);
  if (!checksum.equals(expectedChecksum)) fail("artifact_checksum_invalid");
  if (!releaseLabel.equals(Buffer.from(`${options.expectedArtifactRelease}\n`))) fail("release_binding_mismatch");

  let dependencyManifest;
  try { dependencyManifest = parseDependencyArtifactManifest({ bytes: dependencyManifestRecord.bytes }); } catch { fail("dependency_manifest_mismatch"); }
  if (dependencyManifest.sha256 !== options.expectedDependencyManifestSha256) fail("dependency_manifest_mismatch");
  if (dependencyManifest.value.sourceCommit !== options.expectedSourceCommit) fail("source_binding_mismatch");
  if (dependencyManifest.value.artifactRelease !== options.expectedArtifactRelease) fail("release_binding_mismatch");
  if (dependencyManifest.value.archive.fileName !== "node-modules.tar"
    || dependencyArchive.sha256 !== dependencyManifest.value.archive.sha256
    || dependencyArchive.sizeBytes !== dependencyManifest.value.archive.sizeBytes
    || dependencyArchive.sha256 !== options.expectedDependencyArchiveSha256) fail("dependency_archive_mismatch");

  return Object.freeze({ inputDirectory, files, manifest, dependencyManifest, sourceArchive, dependencyArchive, artifactName });
}

function findEndRecord(bytes) {
  const minimum = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (bytes.readUInt32LE(offset) === ZIP_END) return offset;
  }
  fail("source_archive_invalid");
}

function zipExtraValid(bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    if (offset + 4 > bytes.length) return false;
    const kind = bytes.readUInt16LE(offset);
    const length = bytes.readUInt16LE(offset + 2);
    offset += 4;
    if (kind === 0x0001 || offset + length > bytes.length) return false;
    offset += length;
  }
  return offset === bytes.length;
}

function zipPath(rawName, directory) {
  if ([...rawName].some((byte) => byte > 0x7f)) fail("source_archive_path_invalid");
  let name;
  try {
    name = new TextDecoder("utf-8", { fatal: true }).decode(rawName);
  } catch {
    fail("source_archive_path_invalid");
  }
  if (!name || name.includes("\0") || name.includes("\\") || name.startsWith("/") || /^[A-Za-z]:/u.test(name) || Buffer.byteLength(name) > MAX_ZIP_PATH_BYTES) fail("source_archive_path_invalid");
  if (directory !== name.endsWith("/")) fail("source_archive_entry_invalid");
  const value = directory ? name.slice(0, -1) : name;
  const segments = value.split("/");
  if (!value || segments.some((part) => !part || part === "." || part === ".." || Buffer.byteLength(part) > 255)
    || posix.normalize(value) !== value || value.normalize("NFC") !== value) fail("source_archive_path_invalid");
  const lower = value.toLowerCase();
  if (lower === ".env" || lower === "config/proxy-servers.json") fail("source_archive_overlay_invalid");
  if (segments.some((part) => part.toLowerCase() === "node_modules")) fail("source_archive_node_modules_invalid");
  return value;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = (value >>> 8) ^ CRC_TABLE[(value ^ byte) & 0xff];
  return (value ^ 0xffffffff) >>> 0;
}

function decodedEntry(archive, record) {
  const compressed = archive.subarray(record.dataStart, record.dataEnd);
  let bytes;
  try {
    bytes = record.method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: record.uncompressedSize });
  } catch {
    fail("source_archive_invalid");
  }
  if (bytes.length !== record.uncompressedSize || crc32(bytes) !== record.crc) fail("source_archive_invalid");
  return bytes;
}

function parseSourceArchive(bytes, expectedSourceCommit) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 22 || bytes.length > MAX_ARCHIVE_BYTES) fail("source_archive_invalid");
  const endOffset = findEndRecord(bytes);
  const endCommentLength = bytes.readUInt16LE(endOffset + 20);
  if (endOffset + 22 > bytes.length || endOffset + 22 + endCommentLength !== bytes.length
    || bytes.readUInt16LE(endOffset + 4) !== 0 || bytes.readUInt16LE(endOffset + 6) !== 0) fail("source_archive_invalid");
  const endComment = bytes.subarray(endOffset + 22);
  if (!Buffer.from(expectedSourceCommit, "ascii").equals(endComment)) fail("source_archive_invalid");
  const entriesOnDisk = bytes.readUInt16LE(endOffset + 8);
  const entryCount = bytes.readUInt16LE(endOffset + 10);
  const centralSize = bytes.readUInt32LE(endOffset + 12);
  const centralOffset = bytes.readUInt32LE(endOffset + 16);
  if (entryCount < 1 || entryCount > MAX_ZIP_ENTRIES || entriesOnDisk !== entryCount
    || centralOffset + centralSize !== endOffset || centralOffset >= endOffset) fail("source_archive_invalid");

  const records = [];
  const names = new Set();
  const aliases = new Set();
  const types = new Map();
  let cursor = centralOffset;
  let totalBytes = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > endOffset || bytes.readUInt32LE(cursor) !== ZIP_CENTRAL) fail("source_archive_invalid");
    const madeBy = bytes.readUInt16LE(cursor + 4);
    const needed = bytes.readUInt16LE(cursor + 6);
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const crc = bytes.readUInt32LE(cursor + 16);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const disk = bytes.readUInt16LE(cursor + 34);
    const external = bytes.readUInt32LE(cursor + 38);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const recordEnd = cursor + 46 + nameLength + extraLength + commentLength;
    if (recordEnd > endOffset || needed > 20 || ![0, 0x0800].includes(flags) || ![0, 8].includes(method)
      || disk !== 0 || nameLength < 1 || nameLength > MAX_ZIP_PATH_BYTES || extraLength > 4096 || commentLength > 4096
      || [compressedSize, uncompressedSize, localOffset].includes(0xffffffff)
      || uncompressedSize > MAX_ZIP_ENTRY_BYTES
      || !zipExtraValid(bytes.subarray(cursor + 46 + nameLength, cursor + 46 + nameLength + extraLength))) fail("source_archive_invalid");
    const rawName = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    const trailingSlash = rawName[rawName.length - 1] === 0x2f;
    const legacyGitArchive = madeBy === 0;
    const unixArchive = (madeBy >>> 8) === 3;
    if (!legacyGitArchive && !unixArchive) fail("source_archive_invalid");
    if (legacyGitArchive && external !== (trailingSlash ? 0x10 : 0)) fail("source_archive_entry_invalid");
    const unixMode = external >>> 16;
    const type = unixMode & 0o170000;
    const directory = legacyGitArchive
      ? trailingSlash
      : type === 0o040000;
    if (unixArchive && (
      directory
        ? external !== ((0o040755 << 16) >>> 0)
        : ![
          (0o100644 << 16) >>> 0,
          (0o100755 << 16) >>> 0
        ].includes(external)
    )) fail("source_archive_entry_invalid");
    if (directory && (method !== 0 || crc !== 0 || compressedSize !== 0 || uncompressedSize !== 0)) fail("source_archive_entry_invalid");
    const path = zipPath(rawName, directory);
    const alias = path.toLowerCase();
    if (names.has(path) || aliases.has(alias)) fail("source_archive_duplicate");
    names.add(path);
    aliases.add(alias);
    const prior = types.get(path);
    if (prior && prior !== (directory ? "directory" : "file")) fail("source_archive_duplicate");
    types.set(path, directory ? "directory" : "file");
    const parts = path.split("/");
    for (let part = 1; part < parts.length; part += 1) {
      const parent = parts.slice(0, part).join("/");
      if (types.get(parent) === "file") fail("source_archive_duplicate");
      types.set(parent, "directory");
    }

    if (localOffset + 30 > centralOffset || bytes.readUInt32LE(localOffset) !== ZIP_LOCAL) fail("source_archive_invalid");
    const localFlags = bytes.readUInt16LE(localOffset + 6);
    const localMethod = bytes.readUInt16LE(localOffset + 8);
    const localCrc = bytes.readUInt32LE(localOffset + 14);
    const localCompressed = bytes.readUInt32LE(localOffset + 18);
    const localUncompressed = bytes.readUInt32LE(localOffset + 22);
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const localNameStart = localOffset + 30;
    const localDataStart = localNameStart + localNameLength + localExtraLength;
    const localDataEnd = localDataStart + compressedSize;
    if (localFlags !== flags || localMethod !== method || localCrc !== crc || localCompressed !== compressedSize || localUncompressed !== uncompressedSize
      || localNameLength !== nameLength || localExtraLength > 4096 || localDataEnd > centralOffset
      || !bytes.subarray(localNameStart, localNameStart + localNameLength).equals(rawName)
      || !zipExtraValid(bytes.subarray(localNameStart + localNameLength, localDataStart))) fail("source_archive_invalid");
    totalBytes += uncompressedSize;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_ZIP_TOTAL_BYTES) fail("source_archive_invalid");
    records.push(Object.freeze({ path, directory, method, crc, uncompressedSize, rangeStart: localOffset, dataStart: localDataStart, dataEnd: localDataEnd, mode: directory ? 0o755 : (unixArchive && unixMode === 0o100755 ? 0o755 : 0o644) }));
    cursor = recordEnd;
  }
  if (cursor !== endOffset) fail("source_archive_invalid");
  const ordered = [...records].sort((left, right) => left.rangeStart - right.rangeStart);
  if (ordered[0].rangeStart !== 0 || ordered[ordered.length - 1].dataEnd !== centralOffset) fail("source_archive_invalid");
  for (let index = 1; index < ordered.length; index += 1) if (ordered[index].rangeStart !== ordered[index - 1].dataEnd) fail("source_archive_invalid");
  const packageRecord = records.find(({ path, directory }) => path === "package.json" && !directory);
  const lockRecord = records.find(({ path, directory }) => path === "package-lock.json" && !directory);
  if (!packageRecord || !lockRecord) fail("package_binding_mismatch");
  const packageJson = decodedEntry(bytes, packageRecord);
  const packageLock = decodedEntry(bytes, lockRecord);
  for (const record of records) if (!record.directory && record !== packageRecord && record !== lockRecord) decodedEntry(bytes, record);
  const boundary = inspectProductionArtifactBoundary({ paths: records.map(({ path }) => path) });
  if (boundary.blockers.length !== 0 || boundary.reviewRequired.length !== 0) fail("source_archive_entry_invalid");
  return Object.freeze({ records: Object.freeze(records), packageJson, packageLock, entryCount: records.length, totalBytes });
}

function optionalPublicationRoot(path, root, runtimeValue) {
  if (!lexists(path)) return Object.freeze({ path, absent: true, metadata: null, identity: null });
  const value = stableDirectory(path, runtimeValue, "deployment_boundary_invalid", 0o700);
  if (String(value.metadata.dev) !== String(root.metadata.dev)) fail("deployment_boundary_invalid");
  return Object.freeze({ ...value, absent: false });
}

function deploymentContext(options, runtimeValue, published = false) {
  const root = stableDirectory(runtimeValue.root, runtimeValue, "deployment_boundary_invalid");
  if (runtimeValue.requireRoot && !samePath(root.path, PRODUCTION_STAGE_ROOT)) fail("deployment_boundary_invalid");
  if (runtimeValue.requireRoot) {
    const opt = stableDirectory(dirname(root.path), runtimeValue, "deployment_boundary_invalid");
    if (!samePath(opt.path, "/opt")) fail("deployment_boundary_invalid");
  }
  const releases = stableDirectory(resolve(root.path, "releases"), runtimeValue, "deployment_boundary_invalid");
  const assemblyReceipts = optionalPublicationRoot(resolve(root.path, "assembly-receipts"), root, runtimeValue);
  const dependencyArtifacts = optionalPublicationRoot(resolve(root.path, "dependency-artifacts"), root, runtimeValue);
  if (String(releases.metadata.dev) !== String(root.metadata.dev)) fail("deployment_boundary_invalid");
  const currentPath = resolve(root.path, "current");
  let pointer;
  let target;
  let link;
  try {
    pointer = lstatSync(currentPath);
    link = readlinkSync(currentPath);
    target = realpathSync(currentPath);
  } catch {
    fail("deployment_boundary_invalid");
  }
  if (!pointer.isSymbolicLink() || !directChild(releases.path, target) || basename(target) !== options.expectedCurrentRelease) fail("current_release_mismatch");
  const active = stableDirectory(target, runtimeValue, "deployment_boundary_invalid");
  const candidatePath = resolve(releases.path, options.candidateRelease);
  const assemblyPath = resolve(assemblyReceipts.path, options.candidateRelease);
  const dependencyPath = resolve(dependencyArtifacts.path, options.candidateRelease);
  if (!directChild(releases.path, candidatePath) || !directChild(assemblyReceipts.path, assemblyPath) || !directChild(dependencyArtifacts.path, dependencyPath)) fail("deployment_boundary_invalid");
  if (!published && [candidatePath, assemblyPath, dependencyPath].some((path) => lexists(path))) fail("candidate_present");
  if (published && (assemblyReceipts.absent || dependencyArtifacts.absent || [candidatePath, assemblyPath, dependencyPath].some((path) => !lexists(path)))) fail("candidate_present");
  return Object.freeze({ root, releases, assemblyReceipts, dependencyArtifacts, currentPath, active, candidatePath, assemblyPath, dependencyPath, current: Object.freeze({ pointer: identity(pointer), target: active.identity, link }) });
}

function assertCurrent(context) {
  let pointer;
  let target;
  let link;
  try {
    pointer = lstatSync(context.currentPath);
    link = readlinkSync(context.currentPath);
    target = lstatSync(realpathSync(context.currentPath));
  } catch {
    fail("current_release_changed");
  }
  if (!pointer.isSymbolicLink() || link !== context.current.link || !sameIdentity(context.current.pointer, identity(pointer)) || !sameIdentity(context.current.target, identity(target))) fail("current_release_changed");
}

function collect(options, published = false) {
  const normalized = validateOptions(options);
  const runtimeValue = selectedRuntime(normalized.runtime);
  if (runtimeValue.probeRenameNoReplace() !== true) fail("deployment_boundary_invalid");
  const deployment = deploymentContext(normalized, runtimeValue, published);
  const input = readInputSet(normalized, runtimeValue);
  const archive = parseSourceArchive(input.sourceArchive.bytes, normalized.expectedSourceCommit);
  if (sha256(archive.packageJson) !== input.dependencyManifest.value.package.sha256
    || archive.packageJson.length !== input.dependencyManifest.value.package.sizeBytes
    || sha256(archive.packageLock) !== input.dependencyManifest.value.packageLock.sha256
    || archive.packageLock.length !== input.dependencyManifest.value.packageLock.sizeBytes) fail("package_binding_mismatch");
  return Object.freeze({ options: normalized, runtime: runtimeValue, deployment, input, archive });
}

function safeReport(mode, state, value, applied) {
  return Object.freeze({
    schemaVersion: PRODUCTION_STAGE_CONTROLLER_SCHEMA_VERSION,
    type: PRODUCTION_STAGE_CONTROLLER_TYPE,
    mode,
    state,
    applied,
    releaseUnit: RELEASE_UNIT,
    currentRelease: value.options.expectedCurrentRelease,
    candidateRelease: value.options.candidateRelease,
    sourceCommit: value.options.expectedSourceCommit,
    artifactRelease: value.options.expectedArtifactRelease,
    inputFileCount: 6,
    binding: Object.freeze({
      artifactManifestSha256: value.input.manifest.sha256,
      sourceArtifactSha256: value.input.sourceArchive.sha256,
      dependencyManifestSha256: value.input.dependencyManifest.sha256,
      dependencyArchiveSha256: value.input.dependencyArchive.sha256
    }),
    sourceArchive: Object.freeze({ entryCount: value.archive.entryCount, totalBytes: value.archive.totalBytes, bounded: true })
  });
}

export function preflightProductionCandidateStage(options = {}) {
  const value = collect(options);
  assertCurrent(value.deployment);
  for (const file of value.input.files.values()) assertStableFile(file, value.runtime);
  assertStableDirectory(value.input.inputDirectory);
  return safeReport("preflight", "ready", value, false);
}

function fsyncPath(path, condition) {
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

function holdDirectoryCustody(path, metadata, condition) {
  if (process.platform === "win32") return undefined;
  let descriptor;
  try {
    descriptor = openSync(
      path,
      fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW
    );
    const opened = fstatSync(descriptor);
    if (!opened.isDirectory() || !sameNode(identity(metadata), identity(opened))) {
      throw new Error("directory identity changed");
    }
    return descriptor;
  } catch {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* attention-required below */ }
    }
    fail(condition, true);
  }
}

function registerCreatedDirectory({ path, parent, parentMetadata, runtimeValue, owned, condition, point, shallow = false }) {
  const record = {
    path,
    parent,
    identity: null,
    descriptor: undefined,
    custodyPoint: point,
    afterDirectoryCustodyClosed: runtimeValue.afterDirectoryCustodyClosed,
    trusted: false,
    shallow
  };
  owned.push(record);
  let metadata;
  try {
    metadata = lstatSync(path);
  } catch {
    fail(condition, true);
  }
  record.identity = identity(metadata);
  if (metadata.isSymbolicLink() || !metadata.isDirectory() || !rootControlled(metadata, runtimeValue)
    || String(metadata.dev) !== String(parentMetadata.dev)) fail(condition, true);
  fault(runtimeValue, `after_${point}_mkdir_before_identity`, condition, true);
  record.descriptor = holdDirectoryCustody(path, metadata, condition);
  runtimeValue.beforeDirectoryIdentityTrusted(point, path);
  let current;
  let held;
  try {
    current = lstatSync(path);
    held = record.descriptor === undefined ? null : fstatSync(record.descriptor);
  } catch {
    fail(condition, true);
  }
  if (current.isSymbolicLink() || !current.isDirectory() || !rootControlled(current, runtimeValue)
    || !sameNode(record.identity, identity(current))
    || String(current.dev) !== String(parentMetadata.dev)
    || held && (!held.isDirectory() || !sameNode(record.identity, identity(held)) || !sameNode(identity(current), identity(held)))) fail(condition, true);
  record.trusted = true;
  runtimeValue.afterDirectoryRegistered(point, path);
  fault(runtimeValue, `after_${point}_registered`, condition);
  return record;
}

function mkdirChecked(path, mode, parent, parentMetadata, condition, runtimeValue, owned) {
  try { mkdirSync(path, { mode }); } catch { fail(condition); }
  const record = registerCreatedDirectory({
    path,
    parent,
    parentMetadata,
    runtimeValue,
    owned,
    condition,
    point: "temporary_child"
  });
  chmodSync(path, mode);
  fsyncPath(parent, condition);
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink() || !metadata.isDirectory() || !sameNode(record.identity, identity(metadata))
    || String(metadata.dev) !== String(parentMetadata.dev)) fail(condition);
  return record;
}

function temporaryNamespace(parentRecord, prefix, finalName, condition, runtimeValue, owned) {
  let attemptRoot;
  try {
    attemptRoot = mkdtempSync(resolve(parentRecord.path, prefix));
  } catch {
    fail(condition);
  }
  const attempt = registerCreatedDirectory({
    path: attemptRoot,
    parent: parentRecord.path,
    parentMetadata: parentRecord.metadata,
    runtimeValue,
    owned,
    condition,
    point: "temporary_namespace"
  });
  chmodSync(attemptRoot, 0o700);
  fsyncPath(parentRecord.path, condition);
  const attemptMetadata = lstatSync(attemptRoot);
  if (attemptMetadata.isSymbolicLink() || !attemptMetadata.isDirectory()
    || !sameNode(attempt.identity, identity(attemptMetadata))) fail(condition);
  const child = mkdirChecked(
    resolve(attemptRoot, finalName),
    0o700,
    attemptRoot,
    attemptMetadata,
    condition,
    runtimeValue,
    owned
  );
  return { attempt, child };
}

function ensurePublicationRoot(value, deploymentRoot, runtimeValue, owned) {
  if (!value.absent) return value;
  try {
    mkdirSync(value.path, { mode: 0o700 });
  } catch {
    fail("stage_failed");
  }
  const record = registerCreatedDirectory({
    path: value.path,
    parent: deploymentRoot.path,
    parentMetadata: deploymentRoot.metadata,
    runtimeValue,
    owned,
    condition: "stage_failed",
    point: "publication_root",
    shallow: true
  });
  chmodSync(value.path, 0o700);
  fsyncPath(deploymentRoot.path, "stage_failed");
  fsyncPath(value.path, "stage_failed");
  const metadata = lstatSync(value.path);
  if (metadata.isSymbolicLink() || !metadata.isDirectory() || !rootControlled(metadata, runtimeValue)
    || runtimeValue.enforceModes && modeOf(value.path, metadata, runtimeValue) !== 0o700
    || !sameNode(record.identity, identity(metadata))
    || String(metadata.dev) !== String(deploymentRoot.metadata.dev)) fail("stage_failed");
  return Object.freeze({ path: value.path, absent: false, metadata, identity: identity(metadata) });
}

function ensureDirectory(root, relativePath, directories) {
  const parts = relativePath.split("/");
  let current = root;
  for (const part of parts) {
    current = resolve(current, part);
    if (!existsSync(current)) {
      mkdirSync(current, { mode: 0o755 });
      chmodSync(current, 0o755);
    }
    const metadata = lstatSync(current);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) fail("stage_failed");
    directories.add(current);
  }
}

function writeExtractedFile(path, bytes, mode) {
  writeFileSync(path, bytes, { flag: "wx", mode });
  chmodSync(path, mode);
  fsyncPath(path, "stage_failed");
}

function extractSourceArchive(value, destination) {
  const directories = new Set([destination]);
  for (const record of value.archive.records) {
    const parent = dirname(resolve(destination, ...record.path.split("/")));
    const parentRelative = relative(destination, parent).split(/[\\/]/u).filter(Boolean).join("/");
    if (parentRelative) ensureDirectory(destination, parentRelative, directories);
    const target = resolve(destination, ...record.path.split("/"));
    if (record.directory) ensureDirectory(destination, record.path, directories);
    else writeExtractedFile(target, decodedEntry(value.input.sourceArchive.bytes, record), record.mode);
  }
  chmodSync(destination, 0o755);
  for (const path of [...directories].sort((left, right) => right.length - left.length)) fsyncPath(path, "stage_failed");
}

function writeExclusive(path, bytes, mode, condition) {
  try {
    writeFileSync(path, bytes, { flag: "wx", mode });
    chmodSync(path, mode);
    fsyncPath(path, condition);
    fsyncPath(dirname(path), condition);
  } catch (error) {
    if (error instanceof ProductionStageControllerError) throw error;
    fail(condition);
  }
}

function publish(record, destination, runtimeValue, condition) {
  const source = record.path;
  const sourceParent = record.parent;
  const destinationParent = dirname(destination);
  let published;
  let renameError;
  try {
    published = runtimeValue.renameNoReplace({ source, destination });
  } catch (error) {
    renameError = error;
  }

  let sourceMetadata = null;
  let destinationMetadata = null;
  try {
    sourceMetadata = lstatSync(source);
  } catch (error) {
    if (error?.code !== "ENOENT") fail(condition, true);
  }
  try {
    destinationMetadata = lstatSync(destination);
  } catch (error) {
    if (error?.code !== "ENOENT") fail(condition, true);
  }
  const sourceOwned = sourceMetadata?.isDirectory()
    && !sourceMetadata.isSymbolicLink()
    && sameNode(record.identity, identity(sourceMetadata));
  const destinationOwned = destinationMetadata?.isDirectory()
    && !destinationMetadata.isSymbolicLink()
    && sameNode(record.identity, identity(destinationMetadata));

  if (destinationOwned && !sourceOwned) {
    record.path = destination;
    record.parent = destinationParent;
    record.identity = identity(destinationMetadata);
  } else if (!sourceOwned || destinationOwned) {
    fail(condition, true);
  }

  if (renameError) fail(condition);
  if (published !== true) fail(condition);
  if (record.path !== destination) fail(condition, true);

  runtimeValue.syncPublishedPath(sourceParent, condition);
  runtimeValue.syncPublishedPath(destinationParent, condition);
  let metadata;
  try {
    metadata = lstatSync(destination);
  } catch {
    fail(condition);
  }
  if (metadata.isSymbolicLink() || !metadata.isDirectory() || !sameNode(record.identity, identity(metadata))) fail(condition);
  record.identity = identity(metadata);
}

function removeOwned(record) {
  if (!record) return true;
  if (record.trusted !== true || !record.identity) {
    closeCustody(record);
    return false;
  }
  let metadata;
  let descriptorMetadata;
  try {
    metadata = lstatSync(record.path);
    descriptorMetadata = record.descriptor === undefined ? null : fstatSync(record.descriptor);
  } catch (error) {
    const absent = error?.code === "ENOENT";
    closeCustody(record);
    return absent;
  }
  if (
    metadata.isSymbolicLink()
    || !metadata.isDirectory()
    || !sameNode(record.identity, identity(metadata))
    || descriptorMetadata && (
      !descriptorMetadata.isDirectory()
      || !sameNode(record.identity, identity(descriptorMetadata))
      || !sameNode(identity(metadata), identity(descriptorMetadata))
    )
  ) {
    closeCustody(record);
    return false;
  }
  try {
    if (record.shallow) rmdirSync(record.path);
    else rmSync(record.path, { recursive: true, force: false, maxRetries: 0 });
    fsyncPath(record.parent, "cleanup_failed");
    const removed = !lexists(record.path);
    return closeCustody(record) && removed;
  } catch {
    closeCustody(record);
    return false;
  }
}

function closeCustody(record) {
  if (!record || record.descriptor === undefined) return true;
  const descriptor = record.descriptor;
  record.descriptor = undefined;
  try {
    closeSync(descriptor);
    record.afterDirectoryCustodyClosed(record.custodyPoint, record.path);
    return true;
  } catch {
    return false;
  }
}

function releaseCustody(records) {
  let complete = true;
  for (const record of records) complete = closeCustody(record) && complete;
  return complete;
}

function cleanup(records) {
  let complete = true;
  const untrustedPaths = [];
  for (const record of [...records].reverse()) {
    if (untrustedPaths.some((path) => containsPath(record.path, path))) {
      complete = false;
      closeCustody(record);
      untrustedPaths.push(record.path);
      continue;
    }
    if (!removeOwned(record)) {
      complete = false;
      untrustedPaths.push(record.path);
    }
  }
  return complete;
}

function stageReceipt(value) {
  return Object.freeze({
    schemaVersion: "1",
    type: "control_plane_artifact_stage",
    state: "verified",
    releaseUnit: RELEASE_UNIT,
    candidateRelease: value.options.candidateRelease,
    sourceCommit: value.input.manifest.value.sourceCommit,
    artifactRelease: value.input.manifest.value.release,
    artifact: Object.freeze({ sha256: value.input.sourceArchive.sha256, sizeBytes: value.input.sourceArchive.sizeBytes }),
    artifactManifestSha256: value.input.manifest.sha256,
    artifactManifestSizeBytes: value.input.manifest.sizeBytes,
    sourceFiles: Object.freeze({
      packageJson: Object.freeze({ sha256: sha256(value.archive.packageJson), sizeBytes: value.archive.packageJson.length }),
      packageLock: Object.freeze({ sha256: sha256(value.archive.packageLock), sizeBytes: value.archive.packageLock.length })
    })
  });
}

function fault(runtimeValue, point, condition = "stage_failed", attentionRequired = false) {
  if (runtimeValue.faultAt === point) fail(condition, attentionRequired);
}

function stagedFile(path, expectedBytes, expectedMode, value, condition) {
  let metadata;
  let bytes;
  try {
    metadata = lstatSync(path);
    bytes = readFileSync(path);
  } catch {
    fail(condition);
  }
  if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.nlink !== 1 || !rootControlled(metadata, value.runtime)
    || value.runtime.enforceModes && modeOf(path, metadata, value.runtime) !== expectedMode
    || !bytes.equals(expectedBytes)) fail(condition);
  return bytes;
}

function expectedSourceTree(value) {
  const files = new Map();
  const directories = new Set();
  for (const record of value.archive.records) {
    const parts = record.path.split("/");
    for (let index = 1; index < parts.length; index += 1) directories.add(parts.slice(0, index).join("/"));
    if (record.directory) directories.add(record.path);
    else files.set(record.path, Object.freeze({ bytes: decodedEntry(value.input.sourceArchive.bytes, record), mode: record.mode }));
  }
  return { files, directories };
}

function verifyCandidateTree(value) {
  const root = value.deployment.candidatePath;
  const rootMetadata = lstatSync(root);
  if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory() || !rootControlled(rootMetadata, value.runtime)
    || value.runtime.enforceModes && modeOf(root, rootMetadata, value.runtime) !== 0o755) fail("candidate_publish_failed");
  const expected = expectedSourceTree(value);
  const seenFiles = new Set();
  const seenDirectories = new Set();
  function walk(directory, relativeDirectory = "") {
    for (const name of readdirSync(directory).sort()) {
      const path = resolve(directory, name);
      const relativePath = relativeDirectory ? `${relativeDirectory}/${name}` : name;
      const metadata = lstatSync(path);
      if (metadata.isSymbolicLink() || !rootControlled(metadata, value.runtime)) fail("candidate_publish_failed");
      if (metadata.isDirectory()) {
        if (!expected.directories.has(relativePath) || value.runtime.enforceModes && modeOf(path, metadata, value.runtime) !== 0o755) fail("candidate_publish_failed");
        seenDirectories.add(relativePath);
        walk(path, relativePath);
      } else if (metadata.isFile() && metadata.nlink === 1) {
        const item = expected.files.get(relativePath);
        if (!item || value.runtime.enforceModes && modeOf(path, metadata, value.runtime) !== item.mode || !readFileSync(path).equals(item.bytes)) fail("candidate_publish_failed");
        seenFiles.add(relativePath);
      } else fail("candidate_publish_failed");
    }
  }
  walk(root);
  if (seenFiles.size !== expected.files.size || seenDirectories.size !== expected.directories.size) fail("candidate_publish_failed");
}

function verifyPublished(value) {
  assertCurrent(value.deployment);
  verifyCandidateTree(value);
  const assemblyMetadata = lstatSync(value.deployment.assemblyPath);
  const dependencyMetadata = lstatSync(value.deployment.dependencyPath);
  if (assemblyMetadata.isSymbolicLink() || !assemblyMetadata.isDirectory() || dependencyMetadata.isSymbolicLink() || !dependencyMetadata.isDirectory()
    || !rootControlled(assemblyMetadata, value.runtime) || !rootControlled(dependencyMetadata, value.runtime)
    || value.runtime.enforceModes && (modeOf(value.deployment.assemblyPath, assemblyMetadata, value.runtime) !== 0o700 || modeOf(value.deployment.dependencyPath, dependencyMetadata, value.runtime) !== 0o700)) fail("receipt_publish_failed");
  const assemblyNames = readdirSync(value.deployment.assemblyPath).sort();
  if (assemblyNames.join("\0") !== "artifact-manifest.json\0artifact-stage-receipt.json") fail("receipt_publish_failed");
  const manifestBytes = stagedFile(resolve(value.deployment.assemblyPath, "artifact-manifest.json"), value.input.files.get("artifact.json").bytes, 0o600, value, "receipt_publish_failed");
  const receiptPath = resolve(value.deployment.assemblyPath, "artifact-stage-receipt.json");
  let receiptBytes;
  let receiptMetadata;
  try {
    receiptMetadata = lstatSync(receiptPath);
    receiptBytes = readFileSync(receiptPath);
  } catch { fail("receipt_publish_failed"); }
  if (receiptMetadata.isSymbolicLink() || !receiptMetadata.isFile() || receiptMetadata.nlink !== 1 || !rootControlled(receiptMetadata, value.runtime)
    || value.runtime.enforceModes && modeOf(receiptPath, receiptMetadata, value.runtime) !== 0o600) fail("receipt_publish_failed");
  try {
    parseArtifactStageReceipt({
      bytes: receiptBytes,
      candidateRelease: value.options.candidateRelease,
      packageJson: value.archive.packageJson,
      packageLock: value.archive.packageLock,
      artifactManifestBytes: manifestBytes
    });
  } catch { fail("receipt_publish_failed"); }
  const dependencyNames = readdirSync(value.deployment.dependencyPath).sort();
  if (dependencyNames.join("\0") !== "dependency-artifact.json\0node-modules.tar\0release-label.txt") fail("dependency_publish_failed");
  stagedFile(resolve(value.deployment.dependencyPath, "dependency-artifact.json"), value.input.files.get("dependency-artifact.json").bytes, 0o400, value, "dependency_publish_failed");
  stagedFile(resolve(value.deployment.dependencyPath, "node-modules.tar"), value.input.files.get("node-modules.tar").bytes, 0o400, value, "dependency_publish_failed");
  stagedFile(resolve(value.deployment.dependencyPath, "release-label.txt"), value.input.files.get("release-label.txt").bytes, 0o400, value, "dependency_publish_failed");
}

export function verifyProductionCandidateStage(options = {}) {
  const value = collect(options, true);
  verifyPublished(value);
  return safeReport("verify", "verified", value, false);
}

export function stageProductionCandidate(options = {}) {
  if (options?.apply !== true) fail("apply_confirmation_required");
  const value = collect(options);
  const owned = [];
  let candidateNamespace;
  let assemblyNamespace;
  let dependencyNamespace;
  let receiptPublished = false;
  try {
    value.runtime.beforeFirstMutation();
    assertCurrent(value.deployment);
    for (const file of value.input.files.values()) assertStableFile(file, value.runtime);
    assertStableDirectory(value.input.inputDirectory);

    const assemblyReceipts = ensurePublicationRoot(value.deployment.assemblyReceipts, value.deployment.root, value.runtime, owned);
    const dependencyArtifacts = ensurePublicationRoot(value.deployment.dependencyArtifacts, value.deployment.root, value.runtime, owned);

    candidateNamespace = temporaryNamespace(value.deployment.releases, `.stage-${value.options.candidateRelease}-`, value.options.candidateRelease, "stage_failed", value.runtime, owned);
    extractSourceArchive(value, candidateNamespace.child.path);
    assemblyNamespace = temporaryNamespace(assemblyReceipts, `.stage-${value.options.candidateRelease}-`, value.options.candidateRelease, "receipt_publish_failed", value.runtime, owned);
    dependencyNamespace = temporaryNamespace(dependencyArtifacts, `.stage-${value.options.candidateRelease}-`, value.options.candidateRelease, "dependency_publish_failed", value.runtime, owned);

    writeExclusive(resolve(assemblyNamespace.child.path, "artifact-manifest.json"), value.input.files.get("artifact.json").bytes, 0o600, "receipt_publish_failed");
    const receiptBytes = Buffer.from(`${JSON.stringify(stageReceipt(value), null, 2)}\n`);
    writeExclusive(resolve(assemblyNamespace.child.path, "artifact-stage-receipt.json"), receiptBytes, 0o600, "receipt_publish_failed");
    try {
      parseArtifactStageReceipt({
        bytes: receiptBytes,
        candidateRelease: value.options.candidateRelease,
        packageJson: value.archive.packageJson,
        packageLock: value.archive.packageLock,
        artifactManifestBytes: value.input.files.get("artifact.json").bytes
      });
    } catch {
      fail("receipt_publish_failed");
    }
    fsyncPath(assemblyNamespace.child.path, "receipt_publish_failed");

    writeExclusive(resolve(dependencyNamespace.child.path, "dependency-artifact.json"), value.input.files.get("dependency-artifact.json").bytes, 0o400, "dependency_publish_failed");
    writeExclusive(resolve(dependencyNamespace.child.path, "node-modules.tar"), value.input.files.get("node-modules.tar").bytes, 0o400, "dependency_publish_failed");
    writeExclusive(resolve(dependencyNamespace.child.path, "release-label.txt"), value.input.files.get("release-label.txt").bytes, 0o400, "dependency_publish_failed");
    chmodSync(dependencyNamespace.child.path, 0o700);
    fsyncPath(dependencyNamespace.child.path, "dependency_publish_failed");

    assertCurrent(value.deployment);
    for (const file of value.input.files.values()) assertStableFile(file, value.runtime);
    publish(candidateNamespace.child, value.deployment.candidatePath, value.runtime, "candidate_publish_failed");
    value.runtime.afterPublish("candidate");
    fault(value.runtime, "after_candidate_publish");
    assertCurrent(value.deployment);
    publish(dependencyNamespace.child, value.deployment.dependencyPath, value.runtime, "dependency_publish_failed");
    value.runtime.afterPublish("dependency");
    fault(value.runtime, "after_dependency_publish");
    assertCurrent(value.deployment);
    publish(assemblyNamespace.child, value.deployment.assemblyPath, value.runtime, "receipt_publish_failed");
    receiptPublished = true;
    value.runtime.afterPublish("assembly");
    fault(value.runtime, "after_receipt_publish");

    if (!removeOwned(candidateNamespace.attempt) || !removeOwned(assemblyNamespace.attempt) || !removeOwned(dependencyNamespace.attempt)) fail("cleanup_failed", true);
    owned.splice(owned.indexOf(candidateNamespace.attempt), 1);
    owned.splice(owned.indexOf(assemblyNamespace.attempt), 1);
    owned.splice(owned.indexOf(dependencyNamespace.attempt), 1);
    assertCurrent(value.deployment);
    verifyPublished(value);
    if (!releaseCustody(owned)) fail("cleanup_failed", true);
    return safeReport("stage", "staged", value, true);
  } catch (error) {
    if (receiptPublished) {
      const condition = error instanceof ProductionStageControllerError && SAFE_CONDITIONS.has(error.condition) ? error.condition : "stage_failed";
      releaseCustody(owned);
      if (!(error instanceof ProductionStageControllerError) && value.runtime[TEST_RUNTIME]) throw error;
      fail(condition, true);
    }
    if (!cleanup(owned)) fail("cleanup_failed", true);
    if (error instanceof ProductionStageControllerError) throw error;
    fail("stage_failed");
  }
}

function parseArgs(argv) {
  if (!Array.isArray(argv)) fail("invalid_input");
  let apply = false;
  const values = new Map();
  const accepted = new Set([
    "--mode", "--input-directory", "--candidate-release", "--expected-current-release",
    "--expected-source-commit", "--expected-artifact-release", "--expected-artifact-manifest-sha256",
    "--expected-source-artifact-sha256", "--expected-dependency-manifest-sha256",
    "--expected-dependency-archive-sha256"
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--apply") {
      if (apply) fail("invalid_input");
      apply = true;
      continue;
    }
    if (!accepted.has(key) || values.has(key) || index + 1 >= argv.length || argv[index + 1].startsWith("--")) fail("invalid_input");
    values.set(key, argv[index + 1]);
    index += 1;
  }
  const mode = values.get("--mode");
  if (mode === "stage" && !apply) fail("apply_confirmation_required");
  if (!new Set(["preflight", "stage", "verify"]).has(mode) || mode !== "stage" && apply || values.size !== accepted.size) fail("invalid_input");
  return {
    mode,
    apply,
    inputDirectory: values.get("--input-directory"),
    candidateRelease: values.get("--candidate-release"),
    expectedCurrentRelease: values.get("--expected-current-release"),
    expectedSourceCommit: values.get("--expected-source-commit"),
    expectedArtifactRelease: values.get("--expected-artifact-release"),
    expectedArtifactManifestSha256: values.get("--expected-artifact-manifest-sha256"),
    expectedSourceArtifactSha256: values.get("--expected-source-artifact-sha256"),
    expectedDependencyManifestSha256: values.get("--expected-dependency-manifest-sha256"),
    expectedDependencyArchiveSha256: values.get("--expected-dependency-archive-sha256")
  };
}

export function runProductionStageControllerCli({ argv = process.argv.slice(2), stdout = process.stdout, stderr = process.stderr } = {}) {
  let mode = null;
  try {
    const parsed = parseArgs(argv);
    mode = parsed.mode;
    const report = mode === "preflight"
      ? preflightProductionCandidateStage(parsed)
      : mode === "stage"
        ? stageProductionCandidate(parsed)
        : verifyProductionCandidateStage(parsed);
    stdout.write(`${JSON.stringify(report)}\n`);
    return 0;
  } catch (error) {
    if (mode === null) {
      const index = Array.isArray(argv) ? argv.indexOf("--mode") : -1;
      mode = index >= 0 && ["preflight", "stage", "verify"].includes(argv[index + 1]) ? argv[index + 1] : null;
    }
    const gate = error instanceof ProductionStageControllerError ? error : null;
    stderr.write(`${JSON.stringify({
      schemaVersion: PRODUCTION_STAGE_CONTROLLER_SCHEMA_VERSION,
      type: PRODUCTION_STAGE_CONTROLLER_TYPE,
      mode,
      state: gate?.attentionRequired ? "attention_required" : "blocked",
      condition: gate && SAFE_CONDITIONS.has(gate.condition) ? gate.condition : "stage_failed"
    })}\n`);
    return 1;
  }
}

if (process.argv[1] && samePath(process.argv[1], fileURLToPath(import.meta.url))) {
  process.exitCode = runProductionStageControllerCli();
}
