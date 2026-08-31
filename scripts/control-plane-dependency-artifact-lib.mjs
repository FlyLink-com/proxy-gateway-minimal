import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, closeSync, constants as fsConstants, copyFileSync, existsSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readlinkSync, readSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import {
  WELCOME_COINS_NATIVE_BUILD_PROFILE as WELCOME_COINS_NATIVE_BUILD_CONTRACT,
  WELCOME_COINS_NATIVE_OUTPUTS,
  WELCOME_COINS_NATIVE_SOURCE_PATHS
} from "./control-plane-welcome-coins-native-contract.mjs";

// v4 adds an explicit, fixed-path native custody bundle.  Version 3 is already
// used by the distinct smoke envelope, so the published manifest stays
// unambiguously versioned.  The tree digest still
// binds every archive byte, while this record prevents the reviewed outer
// wrapper, both post-exec bootstraps, and custody launcher from being treated
// as anonymous node_modules files.
export const DEPENDENCY_ARTIFACT_SCHEMA_VERSION = "4";
// v3 applies only to the runDependencyArtifactCli --mode smoke envelope. The
// smoke and published-manifest schemas remain independently validated; smoke adds
// the worker-observed process identity (process.getuid/getgid) for the
// restricted service-native smoke boundary without leaking it into the
// artifact-manifest smoke block.
export const DEPENDENCY_ARTIFACT_SMOKE_SCHEMA_VERSION = "3";
export const DEPENDENCY_ARTIFACT_TYPE = "control_plane_dependency_artifact";
export const WELCOME_COINS_NATIVE_RECEIPT_PATH = WELCOME_COINS_NATIVE_OUTPUTS.receipt;
export const WELCOME_COINS_NATIVE_OUTER_WRAPPER_PATH = WELCOME_COINS_NATIVE_OUTPUTS.outerWrapper;
export const WELCOME_COINS_OUTER_POST_EXEC_BOOTSTRAP_PATH = WELCOME_COINS_NATIVE_OUTPUTS.outerPostExecBootstrap;
export const WELCOME_COINS_NATIVE_LAUNCHER_PATH = WELCOME_COINS_NATIVE_OUTPUTS.launcher;
export const WELCOME_COINS_POST_EXEC_BOOTSTRAP_PATH = WELCOME_COINS_NATIVE_OUTPUTS.postExecBootstrap;
export const DEPENDENCY_ARTIFACT_RELEASE_UNIT = "control-plane-app";
export const DEPENDENCY_ARTIFACT_RUNTIME = Object.freeze({
  platform: "linux",
  archiveFileName: "node-modules.tar"
});
const PROVENANCE = Object.freeze({ builder: "github-actions", workflow: "control-plane-dependency-artifact.yml" });

const HASH = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const RELEASE = /^[A-Za-z0-9._-]{1,160}$/;
const CANDIDATE_LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
const SEMVER = /^v?[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/;
const ABI = /^[0-9]+$/;
const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
export const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_TREE_ENTRIES = 10000;
const MAX_TREE_BYTES = 128 * 1024 * 1024;
const MAX_NATIVE_FILE_BYTES = 4 * 1024 * 1024;
const CHUNK = 64 * 1024;
const EXTRACTION_RESERVE_BYTES = 512 * 1024 * 1024;
const EXTRACTION_RESERVE_INODES = 4096;
const ARCHIVE_PIN_TOKEN = Symbol("archive-pin-token");
const SNAPSHOT_MODULE = "scripts/control-plane-db-snapshot-gate-lib.mjs";
const CLEAN_ENV = Object.freeze({ PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" });
const ARCHIVE_LIST = String.raw`import os,sys,tarfile
MAX_ENTRIES=int(sys.argv[1])
def identity(value):
  return (value.st_dev,value.st_ino,value.st_size,value.st_nlink,value.st_mode,value.st_mtime_ns,value.st_ctime_ns)
archive_file=os.fdopen(os.dup(3),'rb',closefd=True)
with archive_file:
  before=identity(os.fstat(archive_file.fileno()))
  with tarfile.open(fileobj=archive_file,mode='r:') as archive:
    count=0
    for member in archive:
      count+=1
      if count>MAX_ENTRIES:
        raise RuntimeError('too_many_entries')
      sys.stdout.buffer.write(os.fsencode(member.name)+b"\0")
  if identity(os.fstat(archive_file.fileno())) != before:
    raise RuntimeError('archive_changed')`;
const ARCHIVE_EXTRACT = String.raw`import errno,os,posixpath,stat,sys,tarfile
RESERVE_BYTES=int(sys.argv[1])
RESERVE_INODES=int(sys.argv[2])
MAX_ENTRIES=int(sys.argv[3])
MAX_BYTES=int(sys.argv[4])
BLOCK_MIN=512
BLOCK_MAX=1024*1024
CHUNK=64*1024
STORAGE_ERRNOS=(errno.ENOSPC,getattr(errno,'EDQUOT',122))
def emit(code,status):
  print('{"error":"%s"}' % code)
  raise SystemExit(status)
def storage_fail():
  emit('storage_budget_unavailable',3)
def unexpected(exc_type,exc,tb):
  if isinstance(exc,OSError) and exc.errno in STORAGE_ERRNOS:
    print('{"error":"storage_budget_unavailable"}')
  else:
    print('{"error":"archive_extract_failed"}')
sys.excepthook=unexpected
def reject():
  emit('archive_member_rejected',2)
def identity(value):
  return (value.st_dev,value.st_ino,value.st_size,value.st_nlink,value.st_mode,value.st_mtime_ns,value.st_ctime_ns)
def clean_name(value):
  if not isinstance(value,str) or not value or value.startswith('/') or '\\' in value or '\x00' in value:
    reject()
  value=value.rstrip('/')
  parts=value.split('/')
  if not value or parts[0] != 'node_modules' or any((not part or part in ('.','..') or len(os.fsencode(part))>255) for part in parts):
    reject()
  return '/'.join(parts)
def safe_target(name,target):
  if not isinstance(target,str) or not target or target.startswith('/') or '\\' in target or '\x00' in target:
    reject()
  resolved=posixpath.normpath(posixpath.join(posixpath.dirname(name),target))
  if resolved != 'node_modules' and not resolved.startswith('node_modules/'):
    reject()
  return target
def allocation_budget(logical_bytes,entry_count,block_size):
  if logical_bytes<0 or entry_count<0 or block_size<BLOCK_MIN or block_size>BLOCK_MAX or block_size&(block_size-1):
    storage_fail()
  if logical_bytes==0 and entry_count==0:
    return 0
  if entry_count==0:
    storage_fail()
  return logical_bytes+entry_count*(block_size-1)+2*(entry_count+2)*block_size
destination=os.path.abspath(sys.argv[5])
parent=os.path.dirname(destination)
try:
  parent_metadata=os.stat(parent,follow_symlinks=False)
except OSError as exc:
  if exc.errno in STORAGE_ERRNOS:
    storage_fail()
  raise
if not stat.S_ISDIR(parent_metadata.st_mode):
  reject()
device=parent_metadata.st_dev
def capacity(path,remaining_bytes,remaining_entries):
  try:
    metadata=os.stat(path,follow_symlinks=False)
    if not stat.S_ISDIR(metadata.st_mode) or metadata.st_dev!=device:
      reject()
    volume=os.statvfs(path)
    block_size=volume.f_frsize
    available_bytes=volume.f_bavail*block_size
    available_inodes=volume.f_favail
    required_bytes=allocation_budget(remaining_bytes,remaining_entries,block_size)+RESERVE_BYTES
    required_inodes=remaining_entries+(0 if remaining_bytes==0 and remaining_entries==0 else 2)+RESERVE_INODES
  except OSError as exc:
    if exc.errno in STORAGE_ERRNOS:
      storage_fail()
    raise
  if available_bytes<required_bytes or available_inodes<required_inodes:
    storage_fail()
def same_device_path(path,kind):
  metadata=os.lstat(path)
  if metadata.st_dev!=device or (kind=='d' and not stat.S_ISDIR(metadata.st_mode)) or (kind=='f' and not stat.S_ISREG(metadata.st_mode)) or (kind=='l' and not stat.S_ISLNK(metadata.st_mode)):
    reject()
def fsync_dir(path):
  descriptor=os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
  try:
    if os.fstat(descriptor).st_dev!=device:
      reject()
    os.fsync(descriptor)
  finally:
    os.close(descriptor)
archive_file=os.fdopen(os.dup(3),'rb',closefd=True)
with archive_file:
  archive_before=identity(os.fstat(archive_file.fileno()))
  with tarfile.open(fileobj=archive_file,mode='r:') as archive:
    members=[]
    for member in archive:
      members.append(member)
      if len(members)>MAX_ENTRIES:
        reject()
    records={}
    total=0
    for member in members:
      name=clean_name(member.name)
      if name in records:
        reject()
      if member.isdir():
        records[name]=('d',member,None)
      elif member.isreg():
        total+=member.size
        if member.size<0 or total>MAX_BYTES:
          reject()
        records[name]=('f',member,None)
      elif member.issym():
        records[name]=('l',member,safe_target(name,member.linkname))
      else:
        reject()
    if records.get('node_modules',(None,None,None))[0] != 'd':
      reject()
    remaining_bytes=total
    remaining_entries=len(records)
    capacity(parent,remaining_bytes,remaining_entries)
    os.mkdir(destination,0o700)
    same_device_path(destination,'d')
    capacity(destination,remaining_bytes,remaining_entries)
    tree=os.path.join(destination,'node_modules')
    os.mkdir(tree,0o700)
    same_device_path(tree,'d')
    remaining_entries-=1
    capacity(destination,remaining_bytes,remaining_entries)
    dirs=sorted((name for name,(kind,_,_) in records.items() if kind=='d'),key=lambda value:(value.count('/'),value))
    for name in dirs:
      if name=='node_modules':
        continue
      parent_name='/'.join(name.split('/')[:-1])
      if parent_name not in records or records[parent_name][0] != 'd':
        reject()
      capacity(destination,remaining_bytes,remaining_entries)
      path=os.path.join(destination,*name.split('/'))
      os.mkdir(path,0o700)
      same_device_path(path,'d')
      remaining_entries-=1
      capacity(destination,remaining_bytes,remaining_entries)
    files=sorted((name for name,(kind,_,_) in records.items() if kind=='f'))
    for name in files:
      parent_name='/'.join(name.split('/')[:-1])
      if parent_name not in records or records[parent_name][0] != 'd':
        reject()
      member=records[name][1]
      source=archive.extractfile(member)
      if source is None:
        reject()
      path=os.path.join(destination,*name.split('/'))
      capacity(destination,remaining_bytes,remaining_entries)
      fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
      written=0
      try:
        if os.fstat(fd).st_dev!=device:
          reject()
        while True:
          capacity(destination,remaining_bytes,remaining_entries)
          chunk=source.read(CHUNK)
          if not chunk:
            break
          written+=len(chunk)
          if written>member.size or written>MAX_BYTES:
            reject()
          offset=0
          while offset<len(chunk):
            offset+=os.write(fd,chunk[offset:])
          remaining_bytes-=len(chunk)
        if written!=member.size:
          reject()
        os.fsync(fd)
      finally:
        source.close()
        os.close(fd)
      same_device_path(path,'f')
      remaining_entries-=1
      capacity(destination,remaining_bytes,remaining_entries)
    for name in sorted((name for name,(kind,_,_) in records.items() if kind=='l')):
      parent_name='/'.join(name.split('/')[:-1])
      if parent_name not in records or records[parent_name][0] != 'd':
        reject()
      capacity(destination,remaining_bytes,remaining_entries)
      path=os.path.join(destination,*name.split('/'))
      os.symlink(records[name][2],path)
      same_device_path(path,'l')
      remaining_entries-=1
      capacity(destination,remaining_bytes,remaining_entries)
    if remaining_bytes!=0 or remaining_entries!=0:
      reject()
    for path in sorted((os.path.join(destination,*name.split('/')) for name,(kind,_,_) in records.items() if kind=='d'),key=lambda value:value.count(os.sep),reverse=True):
      fsync_dir(path)
    fsync_dir(destination)
    fsync_dir(parent)
    capacity(destination,0,0)
  if identity(os.fstat(archive_file.fileno())) != archive_before:
    raise RuntimeError('archive_changed')
print('{"entryCount":%d,"totalBytes":%d}' % (len(records),total))`;

export class DependencyArtifactError extends Error {
  constructor(condition, attentionRequired = false) {
    super(condition);
    this.name = "DependencyArtifactError";
    this.condition = condition;
    this.attentionRequired = attentionRequired;
  }
}

const fail = (condition, attentionRequired = false) => { throw new DependencyArtifactError(condition, attentionRequired); };
const hashBytes = (bytes) => createHash("sha256").update(bytes).digest("hex");
const safeInteger = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;
const BLOCK_SIZE_MIN = 512;
const BLOCK_SIZE_MAX = 1024 * 1024;
const safeStorageResult = (value) => value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : fail("dependency_storage_budget_unavailable");

export function calculateDependencyStorageBudget({ totalBytes, entryCount, blockSize } = {}) {
  if (!safeInteger(totalBytes) || !safeInteger(entryCount) || (entryCount === 0 && totalBytes !== 0) || !safeInteger(blockSize, BLOCK_SIZE_MIN)
    || blockSize > BLOCK_SIZE_MAX || (blockSize & (blockSize - 1)) !== 0) fail("dependency_storage_budget_unavailable");
  const logical = BigInt(totalBytes);
  const entries = BigInt(entryCount);
  const block = BigInt(blockSize);
  // Each entry may consume a final partially filled data block.  The second
  // term budgets two metadata/dirent blocks per tree entry plus the staging
  // root and its node_modules root.  This is deliberately conservative: the
  // extractor re-reads statvfs before every mutation and preserves the fixed
  // emergency reserve throughout the run.
  const empty = totalBytes === 0 && entryCount === 0;
  const allocation = empty ? 0n : logical + entries * (block - 1n) + 2n * (entries + 2n) * block;
  const required = allocation + BigInt(EXTRACTION_RESERVE_BYTES);
  const requiredInodes = (empty ? 0n : entries + 2n) + BigInt(EXTRACTION_RESERVE_INODES);
  return Object.freeze({
    blockSize,
    logicalBytes: totalBytes,
    entryCount,
    allocationUpperBoundBytes: safeStorageResult(allocation),
    reserveBytes: EXTRACTION_RESERVE_BYTES,
    requiredBytes: safeStorageResult(required),
    reserveInodes: EXTRACTION_RESERVE_INODES,
    requiredInodes: safeStorageResult(requiredInodes)
  });
}

const keys = (value, expected) => {
  const actual = Object.keys(value || {}).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((entry, index) => entry === wanted[index]);
};
const within = (root, path) => {
  const child = relative(root, path);
  return child === "" || (child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child));
};

export function dependencyArtifactPaths({ deploymentRoot, candidateRelease } = {}) {
  if (typeof deploymentRoot !== "string" || !isAbsolute(deploymentRoot) || typeof candidateRelease !== "string" || !CANDIDATE_LABEL.test(candidateRelease)) fail("dependency_path_invalid");
  const root = resolve(deploymentRoot);
  const artifactRoot = resolve(root, "dependency-artifacts", candidateRelease);
  const candidateRoot = resolve(root, "releases", candidateRelease);
  if (dirname(artifactRoot) !== resolve(root, "dependency-artifacts") || dirname(candidateRoot) !== resolve(root, "releases")) fail("dependency_path_invalid");
  return Object.freeze({ artifactRoot, manifestPath: resolve(artifactRoot, "dependency-artifact.json"), archivePath: resolve(artifactRoot, "node-modules.tar"), releaseLabelPath: resolve(artifactRoot, "release-label.txt"), nodeModulesRoot: resolve(candidateRoot, "node_modules") });
}
const mode = (metadata) => metadata.mode & 0o7777;
const fileIdentity = (metadata) => Object.freeze({
  dev: String(metadata.dev),
  ino: String(metadata.ino),
  size: String(metadata.size),
  nlink: String(metadata.nlink),
  mode: String(metadata.mode),
  mtimeNs: String(metadata.mtimeNs),
  ctimeNs: String(metadata.ctimeNs)
});
const sameFileIdentity = (left, right) => left && right && ["dev", "ino", "size", "nlink", "mode", "mtimeNs", "ctimeNs"].every((key) => left[key] === right[key]);
const pathIdentity = (path) => fileIdentity(lstatSync(path, { bigint: true }));
const descriptorIdentity = (descriptor) => fileIdentity(fstatSync(descriptor, { bigint: true }));

const sha256File = (path, maximum = MAX_TREE_BYTES) => {
  let descriptor;
  let total = 0;
  const digest = createHash("sha256");
  try {
    const before = lstatSync(path);
    const beforeIdentity = pathIdentity(path);
    descriptor = openSync(path, fsConstants.O_RDONLY | (process.platform === "linux" ? fsConstants.O_NOFOLLOW : 0));
    const opened = fstatSync(descriptor);
    const openedIdentity = descriptorIdentity(descriptor);
    if (!before.isFile() || !sameFileIdentity(beforeIdentity, openedIdentity)
      || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size || opened.nlink !== before.nlink || mode(opened) !== mode(before)) fail("dependency_file_changed");
    const buffer = Buffer.allocUnsafe(CHUNK);
    while (true) {
      const count = readSync(descriptor, buffer, 0, buffer.length, null);
      if (!count) break;
      total += count;
      if (total > maximum) fail("dependency_tree_too_large");
      digest.update(buffer.subarray(0, count));
    }
    const after = fstatSync(descriptor);
    const afterIdentity = descriptorIdentity(descriptor);
    if (after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size || after.nlink !== opened.nlink || mode(after) !== mode(opened)
      || !sameFileIdentity(openedIdentity, afterIdentity) || !sameFileIdentity(afterIdentity, pathIdentity(path))) fail("dependency_file_changed");
    return Object.freeze({ sha256: digest.digest("hex"), sizeBytes: total, identity: openedIdentity });
  } catch (error) {
    if (error instanceof DependencyArtifactError) throw error;
    fail("dependency_file_unreadable");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
};

function withPinnedArchiveDescriptor(path, expectedIdentity, operation) {
  let descriptor;
  let result;
  let operationError;
  try {
    let openedIdentity;
    try {
      if (!sameFileIdentity(pathIdentity(path), expectedIdentity)) fail("dependency_file_changed");
      descriptor = openSync(path, fsConstants.O_RDONLY | (process.platform === "linux" ? fsConstants.O_NOFOLLOW : 0));
      openedIdentity = descriptorIdentity(descriptor);
      if (!sameFileIdentity(openedIdentity, expectedIdentity) || !sameFileIdentity(pathIdentity(path), openedIdentity)) fail("dependency_file_changed");
    } catch (error) {
      if (error instanceof DependencyArtifactError) throw error;
      fail("dependency_file_changed");
    }
    try { result = operation(descriptor); } catch (error) { operationError = error; }
    try {
      if (!sameFileIdentity(descriptorIdentity(descriptor), openedIdentity) || !sameFileIdentity(pathIdentity(path), openedIdentity)) fail("dependency_file_changed");
    } catch (error) {
      if (error instanceof DependencyArtifactError) throw error;
      fail("dependency_file_changed");
    }
    if (operationError) throw operationError;
    return result;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function runPinnedArchiveProcess({ path, identity, pythonPath, script, args = [], encoding, timeout, maxBuffer }) {
  return withPinnedArchiveDescriptor(path, identity, (descriptor) => spawnSync(pythonPath || "/usr/bin/python3", ["-I", "-S", "-c", script, ...args], {
    cwd: "/", env: CLEAN_ENV, encoding, timeout, maxBuffer, windowsHide: true,
    stdio: ["ignore", "pipe", "pipe", descriptor]
  }));
}

function parseStrictJson(bytes, condition) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_MANIFEST_BYTES) fail(condition);
  let raw;
  try { raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { fail(condition); }
  let cursor = 0;
  const invalid = () => { throw new SyntaxError("invalid_json"); };
  const whitespace = () => { while (cursor < raw.length && " \t\r\n".includes(raw[cursor])) cursor += 1; };
  const string = () => {
    if (raw[cursor] !== '"') invalid();
    const start = cursor++;
    while (cursor < raw.length) {
      const character = raw[cursor++];
      if (character === '"') return JSON.parse(raw.slice(start, cursor));
      if (character === "\\") {
        if (cursor >= raw.length) invalid();
        const escape = raw[cursor++];
        if (escape === "u") { if (!/^[0-9a-fA-F]{4}$/.test(raw.slice(cursor, cursor + 4))) invalid(); cursor += 4; }
        else if (!'"\\/bfnrt'.includes(escape)) invalid();
      } else if (character.charCodeAt(0) < 0x20) invalid();
    }
    invalid();
  };
  const literal = (value) => { if (!raw.startsWith(value, cursor)) invalid(); cursor += value.length; };
  const number = () => { const match = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(raw.slice(cursor)); if (!match) invalid(); cursor += match[0].length; };
  const value = (depth) => {
    if (depth > 16) invalid();
    whitespace();
    if (raw[cursor] === '"') { string(); return; }
    if (raw[cursor] === "{") { object(depth + 1); return; }
    if (raw[cursor] === "[") { array(depth + 1); return; }
    if (raw.startsWith("true", cursor)) { literal("true"); return; }
    if (raw.startsWith("false", cursor)) { literal("false"); return; }
    if (raw.startsWith("null", cursor)) { literal("null"); return; }
    number();
  };
  const object = (depth) => {
    cursor += 1; whitespace(); const properties = new Set();
    if (raw[cursor] === "}") { cursor += 1; return; }
    while (true) {
      whitespace(); const property = string();
      if (properties.has(property)) invalid();
      properties.add(property); whitespace(); if (raw[cursor] !== ":") invalid(); cursor += 1; value(depth); whitespace();
      if (raw[cursor] === "}") { cursor += 1; return; }
      if (raw[cursor] !== ",") invalid(); cursor += 1;
    }
  };
  const array = (depth) => {
    cursor += 1; whitespace(); if (raw[cursor] === "]") { cursor += 1; return; }
    while (true) { value(depth); whitespace(); if (raw[cursor] === "]") { cursor += 1; return; } if (raw[cursor] !== ",") invalid(); cursor += 1; }
  };
  try { value(0); whitespace(); if (cursor !== raw.length) invalid(); } catch { fail(condition); }
  let parsed;
  try { parsed = JSON.parse(raw); } catch { fail(condition); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) fail(condition);
  return parsed;
}

export function readDependencyArtifactManifest(path) {
  let metadata;
  try { metadata = lstatSync(path); } catch { fail("dependency_artifact_invalid"); }
  if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.nlink !== 1 || metadata.size > MAX_MANIFEST_BYTES) fail("dependency_artifact_invalid");
  let bytes;
  try { bytes = readFileSync(path); } catch { fail("dependency_artifact_invalid"); }
  if (bytes.length !== metadata.size || bytes.length > MAX_MANIFEST_BYTES) fail("dependency_artifact_invalid");
  return bytes;
}

function checkDigest(value, condition) {
  if (!value || !keys(value, ["sha256", "sizeBytes"]) || !HASH.test(value.sha256 || "") || !safeInteger(value.sizeBytes, 1)) fail(condition);
}

function checkRuntime(value) {
  const expected = ["platform", "arch", "libc", "nodeVersion", "nodeAbi", "npmVersion", "betterSqlite3Version"];
  if (!value || !keys(value, expected) || value.platform !== "linux" || typeof value.arch !== "string" || !/^[a-z0-9._-]{1,32}$/.test(value.arch)
    || typeof value.libc !== "string" || !/^(glibc|musl)(-[0-9.]+)?$/.test(value.libc)
    || typeof value.nodeVersion !== "string" || !SEMVER.test(value.nodeVersion)
    || typeof value.nodeAbi !== "string" || !ABI.test(value.nodeAbi)
    || typeof value.npmVersion !== "string" || !SEMVER.test(value.npmVersion)
    || typeof value.betterSqlite3Version !== "string" || !SEMVER.test(value.betterSqlite3Version)) fail("dependency_runtime_invalid");
}

function checkArchive(value) {
  if (!value || !keys(value, ["fileName", "sha256", "sizeBytes"]) || typeof value.fileName !== "string" || !value.fileName
    || basename(value.fileName) !== value.fileName || value.fileName.includes("\0") || !HASH.test(value.sha256 || "")
    || !safeInteger(value.sizeBytes, 1) || value.sizeBytes > MAX_ARCHIVE_BYTES) fail("dependency_artifact_invalid");
}

function checkTree(value) {
  if (!value || !keys(value, ["sha256", "entryCount", "totalBytes", "hardlinksBroken", "symlinksInternal"]) || !HASH.test(value.sha256 || "")
    || !safeInteger(value.entryCount, 1) || value.entryCount > MAX_TREE_ENTRIES || !safeInteger(value.totalBytes) || value.totalBytes > MAX_TREE_BYTES || value.hardlinksBroken !== true || typeof value.symlinksInternal !== "boolean") fail("dependency_tree_invalid");
}

const WELCOME_COINS_NATIVE_BUNDLE_TYPE = "control_plane_welcome_coins_native_custody_bundle";
const WELCOME_COINS_NATIVE_BUILD_TYPE = "welcome_coins_native_build";
const WELCOME_COINS_NATIVE_BUILD_PROFILE = WELCOME_COINS_NATIVE_BUILD_CONTRACT.id;
const WELCOME_COINS_NATIVE_KEYS = Object.freeze([
  "outerWrapper",
  "outerPostExecBootstrap",
  "launcher",
  "postExecBootstrap"
]);
const WELCOME_COINS_NATIVE_FILE_SPECS = Object.freeze({
  receipt: Object.freeze({ path: WELCOME_COINS_NATIVE_RECEIPT_PATH, mode: "0644" }),
  outerWrapper: Object.freeze({ path: WELCOME_COINS_NATIVE_OUTER_WRAPPER_PATH, mode: "0755", kind: "static-pie" }),
  outerPostExecBootstrap: Object.freeze({ path: WELCOME_COINS_OUTER_POST_EXEC_BOOTSTRAP_PATH, mode: "0644", kind: "shared-object" }),
  launcher: Object.freeze({ path: WELCOME_COINS_NATIVE_LAUNCHER_PATH, mode: "0755", kind: "pie" }),
  postExecBootstrap: Object.freeze({ path: WELCOME_COINS_POST_EXEC_BOOTSTRAP_PATH, mode: "0644", kind: "shared-object" })
});

export function canonicalDependencyArtifactNativeCustodyMode(options = {}) {
  if (!keys(options, ["platform", "observedMode", "expectedMode", "enforceModes"])
    || typeof options.platform !== "string" || !/^[a-z0-9_-]{1,16}$/.test(options.platform)
    || !/^0[0-7]{3}$/.test(options.observedMode || "") || !/^0[0-7]{3}$/.test(options.expectedMode || "")
    || typeof options.enforceModes !== "boolean") fail("dependency_native_custody_invalid");
  if (options.platform === "linux" && options.enforceModes && options.observedMode !== options.expectedMode) {
    fail("dependency_native_custody_invalid");
  }
  return options.expectedMode;
}
const nativeFlagDigest = (flags) => hashBytes(Buffer.from(JSON.stringify(flags)));
const WELCOME_COINS_NATIVE_FLAG_DIGESTS = Object.freeze({
  outerWrapperSha256: nativeFlagDigest([
    ...WELCOME_COINS_NATIVE_BUILD_CONTRACT.commonFlags,
    ...WELCOME_COINS_NATIVE_BUILD_CONTRACT.outerWrapperFlags
  ]),
  outerPostExecBootstrapSha256: nativeFlagDigest([
    ...WELCOME_COINS_NATIVE_BUILD_CONTRACT.commonFlags,
    ...WELCOME_COINS_NATIVE_BUILD_CONTRACT.outerPostExecBootstrapFlags
  ]),
  launcherSha256: nativeFlagDigest([
    ...WELCOME_COINS_NATIVE_BUILD_CONTRACT.commonFlags,
    ...WELCOME_COINS_NATIVE_BUILD_CONTRACT.launcherFlags
  ]),
  postExecBootstrapSha256: nativeFlagDigest([
    ...WELCOME_COINS_NATIVE_BUILD_CONTRACT.commonFlags,
    ...WELCOME_COINS_NATIVE_BUILD_CONTRACT.postExecBootstrapFlags
  ])
});
const orderedKeys = (value, expected) => Boolean(
  value
  && typeof value === "object"
  && !Array.isArray(value)
  && Object.keys(value).length === expected.length
  && Object.keys(value).every((entry, index) => entry === expected[index])
);

function checkNativeFileRecord(value, expected, includeKind = true) {
  const expectedKeys = includeKind ? ["path", "sha256", "sizeBytes", "mode", "kind"] : ["path", "sha256", "sizeBytes", "mode"];
  if (!orderedKeys(value, expectedKeys) || value.path !== expected.path || value.mode !== expected.mode
    || !HASH.test(value.sha256 || "") || !safeInteger(value.sizeBytes, 1)
    || includeKind && value.kind !== expected.kind) fail("dependency_native_custody_invalid");
}

function checkNativeCustody(value) {
  if (!orderedKeys(value, [
    "schemaVersion",
    "type",
    "buildProfile",
    "receipt",
    "outerWrapper",
    "outerPostExecBootstrap",
    "launcher",
    "postExecBootstrap"
  ])
    || value.schemaVersion !== "1" || value.type !== WELCOME_COINS_NATIVE_BUNDLE_TYPE
    || value.buildProfile !== WELCOME_COINS_NATIVE_BUILD_PROFILE) fail("dependency_native_custody_invalid");
  checkNativeFileRecord(value.receipt, WELCOME_COINS_NATIVE_FILE_SPECS.receipt, false);
  for (const key of WELCOME_COINS_NATIVE_KEYS) {
    checkNativeFileRecord(value[key], WELCOME_COINS_NATIVE_FILE_SPECS[key]);
  }
}

export function validateWelcomeCoinsNativeCustodyBundle(value) {
  checkNativeCustody(value);
  return value;
}

function parseNativeBuildReceipt(bytes) {
  const value = parseStrictJson(bytes, "dependency_native_custody_invalid");
  if (!Buffer.isBuffer(bytes) || !bytes.equals(Buffer.from(`${JSON.stringify(value)}\n`))) fail("dependency_native_custody_invalid");
  if (!orderedKeys(value, ["schemaVersion", "type", "profile", "sources", "compiler", "flags", "outputs"])
    || value.schemaVersion !== "1" || value.type !== WELCOME_COINS_NATIVE_BUILD_TYPE || value.profile !== WELCOME_COINS_NATIVE_BUILD_PROFILE
    || !orderedKeys(value.sources, WELCOME_COINS_NATIVE_KEYS)
    || !orderedKeys(value.compiler, ["identitySha256"]) || !HASH.test(value.compiler.identitySha256 || "")
    || !orderedKeys(value.flags, [
      "outerWrapperSha256",
      "outerPostExecBootstrapSha256",
      "launcherSha256",
      "postExecBootstrapSha256"
    ])
    || !Object.entries(WELCOME_COINS_NATIVE_FLAG_DIGESTS).every(([key, expected]) => value.flags[key] === expected)
    || !orderedKeys(value.outputs, WELCOME_COINS_NATIVE_KEYS)) fail("dependency_native_custody_invalid");
  for (const key of WELCOME_COINS_NATIVE_KEYS) {
    const source = value.sources[key];
    if (!orderedKeys(source, ["path", "sha256", "sizeBytes"]) || source.path !== WELCOME_COINS_NATIVE_SOURCE_PATHS[key]
      || !HASH.test(source.sha256 || "") || !safeInteger(source.sizeBytes, 1)) fail("dependency_native_custody_invalid");
    const output = value.outputs[key], expected = WELCOME_COINS_NATIVE_FILE_SPECS[key];
    checkNativeFileRecord(output, expected);
  }
  return value;
}

function readPinnedNativeFile(path) {
  let descriptor;
  try {
    const before = lstatSync(path, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
      || before.size < 1n || before.size > BigInt(MAX_NATIVE_FILE_BYTES)) {
      fail("dependency_native_custody_invalid");
    }
    descriptor = openSync(
      path,
      fsConstants.O_RDONLY | (process.platform === "linux" ? fsConstants.O_NOFOLLOW : 0)
    );
    const opened = fstatSync(descriptor, { bigint: true });
    if (!sameFileIdentity(fileIdentity(before), fileIdentity(opened))) {
      fail("dependency_native_custody_invalid");
    }
    const size = Number(opened.size);
    const bytes = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const count = readSync(descriptor, bytes, offset, size - offset, offset);
      if (count <= 0) fail("dependency_native_custody_invalid");
      offset += count;
    }
    const after = fstatSync(descriptor, { bigint: true });
    const current = lstatSync(path, { bigint: true });
    if (!sameFileIdentity(fileIdentity(opened), fileIdentity(after))
      || !sameFileIdentity(fileIdentity(after), fileIdentity(current))) {
      fail("dependency_native_custody_invalid");
    }
    return Object.freeze({
      bytes,
      sha256: hashBytes(bytes),
      sizeBytes: bytes.length,
      mode: Number(opened.mode & 0o7777n).toString(8).padStart(4, "0"),
      identity: fileIdentity(opened)
    });
  } catch (error) {
    if (error instanceof DependencyArtifactError) throw error;
    fail("dependency_native_custody_invalid");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function validateNativeElf(bytes, kind) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 64
    || !bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))
    || bytes[4] !== 2 || bytes[5] !== 1 || bytes[6] !== 1
    || bytes.readUInt16LE(16) !== 3 || bytes.readUInt16LE(18) !== 62
    || bytes.readUInt32LE(20) !== 1) fail("dependency_native_custody_invalid");
  const programHeaderOffset = bytes.readBigUInt64LE(32);
  const programHeaderSize = bytes.readUInt16LE(54);
  const programHeaderCount = bytes.readUInt16LE(56);
  if (programHeaderOffset < 64n || programHeaderOffset > BigInt(Number.MAX_SAFE_INTEGER)
    || programHeaderSize !== 56 || programHeaderCount < 1 || programHeaderCount > 128
    || programHeaderOffset + BigInt(programHeaderSize * programHeaderCount) > BigInt(bytes.length)) {
    fail("dependency_native_custody_invalid");
  }
  let hasInterpreter = false;
  const offset = Number(programHeaderOffset);
  for (let index = 0; index < programHeaderCount; index += 1) {
    if (bytes.readUInt32LE(offset + index * programHeaderSize) === 3) hasInterpreter = true;
  }
  if ((kind === "pie" && !hasInterpreter)
    || (["static-pie", "shared-object"].includes(kind) && hasInterpreter)
    || !["pie", "static-pie", "shared-object"].includes(kind)) fail("dependency_native_custody_invalid");
}

function inspectNativeFile(root, spec, includeKind = true, enforceModes = true) {
  const path = resolve(root, spec.path);
  if (!within(resolve(root), path)) fail("dependency_native_custody_invalid");
  const pinned = readPinnedNativeFile(path);
  const canonicalMode = canonicalDependencyArtifactNativeCustodyMode({
    platform: process.platform,
    observedMode: pinned.mode,
    expectedMode: spec.mode,
    enforceModes
  });
  if (includeKind) validateNativeElf(pinned.bytes, spec.kind);
  return Object.freeze({
    record: Object.freeze({
      path: spec.path,
      sha256: pinned.sha256,
      sizeBytes: pinned.sizeBytes,
      mode: canonicalMode,
      ...(includeKind ? { kind: spec.kind } : {})
    }),
    bytes: pinned.bytes,
    absolutePath: path,
    identity: pinned.identity
  });
}

function assertNativeFileStillPinned(file) {
  try {
    if (!sameFileIdentity(file.identity, pathIdentity(file.absolutePath))) {
      fail("dependency_native_custody_invalid");
    }
  } catch (error) {
    if (error instanceof DependencyArtifactError) throw error;
    fail("dependency_native_custody_invalid");
  }
}

export function inspectWelcomeCoinsNativeCustodyBundle(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) fail("dependency_native_custody_invalid");
  const optionKeys = Reflect.ownKeys(options);
  if (optionKeys.some((key) => typeof key !== "string" || !["root", "enforceModes"].includes(key))
    || !Object.hasOwn(options, "root") || optionKeys.length !== (Object.hasOwn(options, "enforceModes") ? 2 : 1)) {
    fail("dependency_native_custody_invalid");
  }
  const root = options.root;
  const enforceModes = Object.hasOwn(options, "enforceModes") ? options.enforceModes : true;
  if (typeof root !== "string" || !isAbsolute(resolve(root)) || typeof enforceModes !== "boolean") fail("dependency_native_custody_invalid");
  const receiptFile = inspectNativeFile(root, WELCOME_COINS_NATIVE_FILE_SPECS.receipt, false, enforceModes);
  const build = parseNativeBuildReceipt(receiptFile.bytes);
  const nativeFiles = Object.fromEntries(WELCOME_COINS_NATIVE_KEYS.map((key) => [
    key,
    inspectNativeFile(root, WELCOME_COINS_NATIVE_FILE_SPECS[key], true, enforceModes)
  ]));
  const receipt = receiptFile.record;
  for (const key of WELCOME_COINS_NATIVE_KEYS) {
    const output = build.outputs[key];
    const record = nativeFiles[key].record;
    if (output.sha256 !== record.sha256 || output.sizeBytes !== record.sizeBytes) {
      fail("dependency_native_custody_invalid");
    }
  }
  assertNativeFileStillPinned(receiptFile);
  for (const key of WELCOME_COINS_NATIVE_KEYS) assertNativeFileStillPinned(nativeFiles[key]);
  const value = Object.freeze({
    schemaVersion: "1", type: WELCOME_COINS_NATIVE_BUNDLE_TYPE, buildProfile: build.profile,
    receipt,
    outerWrapper: nativeFiles.outerWrapper.record,
    outerPostExecBootstrap: nativeFiles.outerPostExecBootstrap.record,
    launcher: nativeFiles.launcher.record,
    postExecBootstrap: nativeFiles.postExecBootstrap.record
  });
  checkNativeCustody(value);
  return value;
}

function sameNativeCustody(expected, actual) {
  checkNativeCustody(expected); checkNativeCustody(actual);
  if (JSON.stringify(expected) !== JSON.stringify(actual)) fail("dependency_native_custody_mismatch");
}

export function parseDependencyArtifactManifest({ bytes } = {}) {
  const value = parseStrictJson(bytes, "dependency_artifact_invalid");
  if (!Object.prototype.hasOwnProperty.call(value || {}, "nativeCustody")) fail("dependency_native_custody_invalid");
  const expected = ["schemaVersion", "type", "state", "releaseUnit", "sourceCommit", "artifactRelease", "package", "packageLock", "archive", "runtime", "smoke", "tree", "nativeCustody", "provenance"];
  if (!keys(value, expected) || value.schemaVersion !== DEPENDENCY_ARTIFACT_SCHEMA_VERSION || value.type !== DEPENDENCY_ARTIFACT_TYPE
    || value.state !== "verified" || value.releaseUnit !== DEPENDENCY_ARTIFACT_RELEASE_UNIT || !COMMIT.test(value.sourceCommit || "") || !RELEASE.test(value.artifactRelease || "")) fail("dependency_artifact_invalid");
  checkDigest(value.package, "dependency_artifact_invalid");
  checkDigest(value.packageLock, "dependency_artifact_invalid");
  checkArchive(value.archive);
  checkRuntime(value.runtime);
  if (!value.smoke || !keys(value.smoke, ["betterSqlite3Memory", "snapshotImport"]) || value.smoke.betterSqlite3Memory !== true || value.smoke.snapshotImport !== true) fail("dependency_smoke_invalid");
  checkTree(value.tree);
  checkNativeCustody(value.nativeCustody);
  if (!value.provenance || !keys(value.provenance, ["builder", "workflow"]) || value.provenance.builder !== PROVENANCE.builder || value.provenance.workflow !== PROVENANCE.workflow) fail("dependency_provenance_invalid");
  return Object.freeze({ value, sha256: hashBytes(bytes), sizeBytes: bytes.length });
}

const NODE_RUNTIME_PROBE = "const h=process.report?.getReport?.().header||{}; process.stdout.write(JSON.stringify({platform:process.platform,arch:process.arch,nodeVersion:process.version,nodeAbi:process.versions.modules,libc:h.glibcVersionRuntime?`glibc-${h.glibcVersionRuntime}`:'musl'}));";

function probeNodeRuntime(nodePath) {
  const result = spawnSync(nodePath, ["--eval", NODE_RUNTIME_PROBE], {
    cwd: "/", env: CLEAN_ENV, encoding: "utf8", timeout: 15000, maxBuffer: 64 * 1024
  });
  if (result.error || result.status !== 0 || String(result.stderr || "").trim()) fail("dependency_runtime_invalid");
  let value;
  try { value = JSON.parse(String(result.stdout || "")); } catch { fail("dependency_runtime_invalid"); }
  if (!keys(value, ["platform", "arch", "nodeVersion", "nodeAbi", "libc"])
    || value.platform !== "linux" || typeof value.arch !== "string" || !/^[a-z0-9._-]{1,32}$/.test(value.arch)
    || typeof value.nodeVersion !== "string" || !SEMVER.test(value.nodeVersion)
    || typeof value.nodeAbi !== "string" || !ABI.test(value.nodeAbi)
    || typeof value.libc !== "string" || !/^(glibc|musl)(-[0-9.]+)?$/.test(value.libc)) fail("dependency_runtime_invalid");
  return value;
}

function readPackageVersion(root) {
  try { return JSON.parse(readFileSync(resolve(root, "node_modules", "better-sqlite3", "package.json"), "utf8")).version; } catch { fail("native_module_validation_failed"); }
}

export function detectDependencyRuntime({ root = process.cwd(), npmVersion = null, npmPath = null, nodePath = process.execPath } = {}) {
  if (process.platform !== "linux") fail("unsupported_platform");
  if (typeof nodePath !== "string" || !isAbsolute(nodePath)) fail("dependency_runtime_invalid");
  const npmExecutable = npmPath ?? resolve(dirname(nodePath), "npm");
  if (typeof npmExecutable !== "string" || !isAbsolute(npmExecutable)) fail("dependency_runtime_invalid");
  const npm = String(npmVersion || String(spawnSync(npmExecutable, ["--version"], { env: { ...CLEAN_ENV, PATH: `${dirname(nodePath)}:/usr/bin:/bin`, HOME: "/tmp" }, encoding: "utf8", maxBuffer: 64 * 1024 }).stdout || "").trim());
  const npmSemver = npm.startsWith("v") ? npm : `v${npm}`;
  if (!SEMVER.test(npmSemver)) fail("dependency_runtime_invalid");
  const node = probeNodeRuntime(nodePath);
  return Object.freeze({
    platform: node.platform, arch: node.arch, libc: node.libc, nodeVersion: node.nodeVersion,
    nodeAbi: node.nodeAbi, npmVersion: npmSemver, betterSqlite3Version: readPackageVersion(root)
  });
}

function compareRuntime(expected, actual) {
  for (const key of ["platform", "arch", "libc", "nodeVersion", "nodeAbi", "npmVersion", "betterSqlite3Version"]) if (expected[key] !== actual[key]) fail("dependency_runtime_mismatch");
}

function auditAcl(root, supplied, recursive = true) {
  if (typeof supplied.checkAclCapabilities === "function") { if (supplied.checkAclCapabilities(root) !== true) fail("dependency_acl_or_capability_invalid"); return; }
  const getfacl = supplied.getfaclPath || "/usr/bin/getfacl";
  const getcap = supplied.getcapPath || "/usr/sbin/getcap";
  const acl = spawnSync(getfacl, ["--physical", "--absolute-names", "--omit-header", ...(recursive ? ["--recursive"] : []), "--", root], { env: CLEAN_ENV, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (acl.error || acl.status !== 0 || /^(?:default:|user:[^:]+:|group:[^:]+:)/m.test(String(acl.stdout || ""))) fail("dependency_acl_or_capability_invalid");
  const cap = spawnSync(getcap, [...(recursive ? ["-r"] : []), "--", root], { env: CLEAN_ENV, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (cap.error || cap.status !== 0 || String(cap.stdout || "").trim()) fail("dependency_acl_or_capability_invalid");
}

export function auditDependencyTree(root, supplied = {}) {
  const runtime = { enforceOwnership: supplied.enforceOwnership ?? false, ...supplied };
  let rootMeta;
  try { rootMeta = lstatSync(root); } catch { fail("dependency_tree_invalid"); }
  if (!rootMeta.isDirectory() || rootMeta.isSymbolicLink()) fail("dependency_tree_invalid");
  const rootReal = realpathSync(root);
  if (runtime.enforceOwnership && (rootMeta.uid !== 0 || rootMeta.gid !== 0 || (mode(rootMeta) & 0o022) !== 0)) fail("dependency_tree_invalid");
  auditAcl(rootReal, runtime);
  const lines = [];
  let entries = 0; let bytes = 0; let hardlinksBroken = true; let symlinksInternal = true;
  const visit = (path, relativePath, depth) => {
    if (depth > 64) fail("dependency_tree_invalid");
    let metadata; try { metadata = lstatSync(path); } catch { fail("dependency_tree_invalid"); }
    // Linux reports symlinks as lstat 0777; those permission bits are not an
    // access-control surface.  Keep ownership and containment checks for a
    // link, while retaining strict mode/set-id checks for physical nodes.
    if (runtime.enforceOwnership && (metadata.uid !== 0 || metadata.gid !== 0
      || !metadata.isSymbolicLink() && ((mode(metadata) & 0o022) !== 0 || (mode(metadata) & 0o6000) !== 0))) fail("dependency_tree_invalid");
    entries += 1; if (entries > MAX_TREE_ENTRIES) fail("dependency_tree_too_large");
    if (metadata.isDirectory()) {
      lines.push(`d:${relativePath}:${mode(metadata).toString(8)}`);
      let children; try { children = readdirSync(path).sort(); } catch { fail("dependency_tree_invalid"); }
      for (const child of children) visit(resolve(path, child), `${relativePath}/${child}`, depth + 1);
      return;
    }
    if (metadata.isSymbolicLink()) {
      let target;
      try { target = (supplied.readlinkSync || readlinkSync)(path); } catch { fail("dependency_tree_invalid"); }
      if (isAbsolute(target) || target.includes("\0")) fail("dependency_tree_invalid");
      let targetReal; try { targetReal = realpathSync(path); } catch { fail("dependency_tree_invalid"); }
      if (!within(rootReal, targetReal)) fail("dependency_tree_invalid");
      lines.push(`l:${relativePath}:${target}`); return;
    }
    if (!metadata.isFile() || metadata.nlink !== 1) { hardlinksBroken = false; fail("dependency_tree_invalid"); }
    const digest = sha256File(path); bytes += digest.sizeBytes; if (bytes > MAX_TREE_BYTES) fail("dependency_tree_too_large");
    lines.push(`f:${relativePath}:${mode(metadata).toString(8)}:${digest.sizeBytes}:${digest.sha256}`);
  };
  visit(rootReal, ".", 0);
  const treeDigest = hashBytes(Buffer.from(lines.sort().join("\n") + "\n"));
  return Object.freeze({ sha256: treeDigest, entryCount: entries, hardlinksBroken, symlinksInternal, totalBytes: bytes });
}

export function validateDependencyArchiveEntries(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 32 * 1024 * 1024 || bytes.at(-1) !== 0) fail("dependency_archive_invalid");
  const names = []; const seen = new Set(); let start = 0;
  for (let index = 0; index < bytes.length; index += 1) if (bytes[index] === 0) {
    const value = bytes.subarray(start, index); start = index + 1;
    let name; try { name = new TextDecoder("utf-8", { fatal: true }).decode(value); } catch { fail("dependency_archive_invalid"); }
    if (!name || name.startsWith("/") || name.includes("\\") || name.includes("\0")) fail("dependency_archive_invalid");
    const clean = name.endsWith("/") ? name.slice(0, -1) : name;
    const parts = clean.split("/");
    if (!clean || parts[0] !== "node_modules" || parts.some((part) => !part || part === "." || part === ".." || Buffer.byteLength(part) > 255) || seen.has(clean)) fail("dependency_archive_invalid");
    seen.add(clean); names.push(clean);
  }
  if (!seen.has("node_modules")) fail("dependency_archive_invalid");
  return Object.freeze(names);
}

function safeSnapshotPath(root, snapshotModule) {
  if (typeof root !== "string" || typeof snapshotModule !== "string" || !snapshotModule) fail("dependency_smoke_snapshot_invalid");
  const rootPath = resolve(root);
  let rootMetadata; try { rootMetadata = lstatSync(rootPath); } catch { fail("dependency_smoke_snapshot_invalid"); }
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) fail("dependency_smoke_snapshot_invalid");
  const requested = isAbsolute(snapshotModule) ? resolve(snapshotModule) : resolve(rootPath, snapshotModule);
  if (!within(rootPath, requested)) fail("dependency_smoke_snapshot_invalid");
  const relativePath = relative(rootPath, requested);
  const normalized = relativePath.split(/[\\/]+/).filter(Boolean).join("/");
  if (normalized !== SNAPSHOT_MODULE) fail("dependency_smoke_snapshot_invalid");
  let current = rootPath;
  const parts = normalized.split("/");
  for (let index = 0; index < parts.length; index += 1) {
    current = join(current, parts[index]);
    let metadata; try { metadata = lstatSync(current); } catch { fail("dependency_smoke_snapshot_invalid"); }
    if (metadata.isSymbolicLink() || (index < parts.length - 1 ? !metadata.isDirectory() : (!metadata.isFile() || metadata.nlink !== 1))) fail("dependency_smoke_snapshot_invalid");
  }
  return current;
}

function extractedSnapshotModule({ sourceRoot, extractedRoot, snapshotModule } = {}) {
  const source = safeSnapshotPath(sourceRoot, snapshotModule);
  let extractedMetadata; try { extractedMetadata = lstatSync(resolve(extractedRoot)); } catch { fail("dependency_smoke_snapshot_invalid"); }
  if (!extractedMetadata.isDirectory() || extractedMetadata.isSymbolicLink()) fail("dependency_smoke_snapshot_invalid");
  const target = resolve(extractedRoot, SNAPSHOT_MODULE);
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  copyFileSync(source, target);
  chmodSync(target, 0o400);
  return safeSnapshotPath(extractedRoot, target);
}

function assertControlledDestinationParent(root, runtime) {
  let current = dirname(root);
  for (;;) {
    let metadata;
    try { metadata = lstatSync(current); } catch { fail("dependency_archive_invalid"); }
    if (metadata.isSymbolicLink() || !metadata.isDirectory() || (mode(metadata) & 0o022) !== 0) fail("dependency_archive_invalid");
    if (runtime.enforceOwnership && (metadata.uid !== 0 || metadata.gid !== 0)) fail("dependency_archive_invalid");
    auditAcl(current, runtime, false);
    if (current === dirname(current)) break;
    current = dirname(current);
  }
}

export function extractDependencyArchive(archivePath, runtime = {}, archivePin = null) {
  if (typeof runtime.extractArchive === "function") {
    const value = runtime.extractArchive(archivePath, { destinationRoot: runtime.destinationRoot });
    if (!value || typeof value.root !== "string" || typeof value.nodeModulesRoot !== "string" || typeof value.cleanup !== "function") fail("dependency_archive_invalid");
    return value;
  }
  const requestedRoot = runtime.destinationRoot;
  if (requestedRoot !== undefined && (typeof requestedRoot !== "string" || !isAbsolute(requestedRoot))) fail("dependency_archive_invalid");
  if (requestedRoot !== undefined) assertControlledDestinationParent(resolve(requestedRoot), runtime);
  const archiveIdentity = archivePin?.token === ARCHIVE_PIN_TOKEN && archivePin.identity
    ? archivePin.identity
    : sha256File(archivePath, MAX_ARCHIVE_BYTES).identity;
  let parent;
  let root;
  let cleanupRoot;
  try {
    if (typeof runtime.beforeArchiveMutation === "function") runtime.beforeArchiveMutation(Object.freeze({ archivePath, destinationRoot: requestedRoot }));
    const result = withPinnedArchiveDescriptor(archivePath, archiveIdentity, (descriptor) => {
      parent = requestedRoot === undefined ? mkdtempSync(join(tmpdir(), "control-plane-dependency-artifact-")) : dirname(resolve(requestedRoot));
      root = requestedRoot === undefined ? join(parent, "project") : resolve(requestedRoot);
      cleanupRoot = requestedRoot === undefined ? parent : root;
      if (root === dirname(root) || existsSync(root)) fail("dependency_archive_invalid");
      return spawnSync(runtime.pythonPath || "/usr/bin/python3", ["-I", "-S", "-c", ARCHIVE_EXTRACT,
        String(EXTRACTION_RESERVE_BYTES), String(EXTRACTION_RESERVE_INODES), String(MAX_TREE_ENTRIES), String(MAX_TREE_BYTES), root], {
        cwd: "/", env: CLEAN_ENV, encoding: "utf8", timeout: 120000, maxBuffer: 64 * 1024, windowsHide: true,
        stdio: ["ignore", "pipe", "pipe", descriptor]
      });
    });
    const output = String(result.stdout || "").trim();
    if (["ENOSPC", "EDQUOT"].includes(result.error?.code)) fail("dependency_storage_budget_unavailable");
    if (result.error || String(result.stderr || "").trim()) fail("dependency_archive_invalid");
    if (result.status !== 0) {
      if (output === '{"error":"archive_member_rejected"}') fail("dependency_archive_member_invalid");
      if (output === '{"error":"archive_extract_failed"}') fail("dependency_archive_extract_failed");
      if (output === '{"error":"storage_budget_unavailable"}') fail("dependency_storage_budget_unavailable");
      fail("dependency_archive_invalid");
    }
    const summary = /^\{"entryCount":([0-9]+),"totalBytes":([0-9]+)\}$/.exec(output);
    if (!summary || !safeInteger(Number(summary[1]), 1) || !safeInteger(Number(summary[2])) || Number(summary[1]) > MAX_TREE_ENTRIES || Number(summary[2]) > MAX_TREE_BYTES) fail("dependency_archive_invalid");
    const rootMetadata = lstatSync(root);
    if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) fail("dependency_archive_invalid");
    const rootIdentity = `${rootMetadata.dev}:${rootMetadata.ino}`;
    return Object.freeze({
      root,
      nodeModulesRoot: join(root, "node_modules"),
      entryCount: Number(summary[1]),
      totalBytes: Number(summary[2]),
      cleanup: () => {
        try {
          if (requestedRoot !== undefined) {
            const current = lstatSync(root);
            if (current.isSymbolicLink() || !current.isDirectory() || `${current.dev}:${current.ino}` !== rootIdentity) fail("dependency_archive_cleanup_failed", true);
            rmSync(root, { recursive: true, force: true });
          } else rmSync(cleanupRoot, { recursive: true, force: true });
        } catch (error) {
          if (error instanceof DependencyArtifactError) throw error;
          fail("dependency_archive_cleanup_failed", true);
        }
      }
    });
  } catch (error) {
    try { if (cleanupRoot) rmSync(cleanupRoot, { recursive: true, force: true }); } catch { throw new DependencyArtifactError("dependency_archive_cleanup_failed", true); }
    if (error instanceof DependencyArtifactError) throw error;
    if (["ENOSPC", "EDQUOT"].includes(error?.code)) fail("dependency_storage_budget_unavailable");
    fail("dependency_archive_invalid");
  }
}

function archiveMetadata(path, manifest, supplied) {
  let metadata; try { metadata = lstatSync(path); } catch { fail("dependency_archive_missing"); }
  if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.nlink !== 1 || metadata.size > MAX_ARCHIVE_BYTES) fail("dependency_archive_invalid");
  if (supplied.enforceOwnership && (metadata.uid !== 0 || metadata.gid !== 0 || (mode(metadata) & 0o022) !== 0)) fail("dependency_archive_invalid");
  const digest = sha256File(path, MAX_ARCHIVE_BYTES);
  if (digest.sha256 !== manifest.value.archive.sha256 || digest.sizeBytes !== manifest.value.archive.sizeBytes || digest.sizeBytes !== metadata.size) fail("dependency_archive_mismatch");
  const listing = typeof supplied.listArchive === "function" ? withPinnedArchiveDescriptor(path, digest.identity, () => supplied.listArchive(path)) : (() => {
    const result = runPinnedArchiveProcess({ path, identity: digest.identity, pythonPath: supplied.pythonPath, script: ARCHIVE_LIST,
      args: [String(MAX_TREE_ENTRIES)],
      encoding: null, timeout: 30000, maxBuffer: 32 * 1024 * 1024 });
    if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout)) fail("dependency_archive_invalid");
    return result.stdout;
  })();
  validateDependencyArchiveEntries(listing);
  return Object.freeze({
    value: Object.freeze({ path, sha256: digest.sha256, sizeBytes: digest.sizeBytes }),
    identity: digest.identity
  });
}

const NATIVE_SMOKE = `import Database from "better-sqlite3"; const d=new Database(":memory:"); d.exec("CREATE TABLE t(v INTEGER)"); d.prepare("INSERT INTO t VALUES(?)").run(7); if(d.prepare("SELECT v FROM t").get().v!==7) process.exit(42); d.close(); await import(new URL(process.argv[1], "file:"));`;

// Read the worker process's effective identity for the --mode smoke envelope.
//
// The function distinguishes three cases using own-property checks via
// Object.hasOwn so an explicit injection cannot be confused with prototype
// inheritance or accidental fallback:
//
//   Case A — neither getuid nor getgid is supplied as an own property of
//     runtime. Read the identity from the host process via process.getuid /
//     process.getgid. If either host function is unavailable, throws, or
//     returns an invalid / root value, fail with
//     dependency_smoke_identity_invalid.
//
//   Case B — both getuid and getgid are supplied as own properties. Both must
//     be functions; both are called and their results validated as positive
//     safe integers. Exceptions or invalid results fail with
//     dependency_smoke_identity_invalid.
//
//   Case C — only one of getuid / getgid is supplied as an own property.
//     Fail with dependency_smoke_identity_invalid. Never mix one injected
//     getter with the host getter, and never silently fall back.
//
//   Case D — either supplied hook is not a function. Fail with
//     dependency_smoke_identity_invalid.
export function readSmokeProcessIdentity(runtime = {}) {
  const hasUidHook = Object.hasOwn(runtime, "getuid");
  const hasGidHook = Object.hasOwn(runtime, "getgid");
  let uid, gid;
  try {
    if (hasUidHook || hasGidHook) {
      // Symmetric injection: if either hook is supplied, both must be supplied
      // and both must be functions. Never mix with the host fallback.
      if (hasUidHook !== hasGidHook) fail("dependency_smoke_identity_invalid");
      if (typeof runtime.getuid !== "function" || typeof runtime.getgid !== "function") fail("dependency_smoke_identity_invalid");
      uid = runtime.getuid();
      gid = runtime.getgid();
    } else {
      // No injection: fall back to the host process identity.
      if (typeof process.getuid !== "function" || typeof process.getgid !== "function") fail("dependency_smoke_identity_invalid");
      uid = process.getuid();
      gid = process.getgid();
    }
  } catch { fail("dependency_smoke_identity_invalid"); }
  if (!Number.isSafeInteger(uid) || !Number.isSafeInteger(gid) || uid <= 0 || gid <= 0) fail("dependency_smoke_identity_invalid");
  return Object.freeze({ uid, gid });
}

export function runNativeBetterSqliteSmoke({ root, snapshotModule = "scripts/control-plane-db-snapshot-gate-lib.mjs", runtime = {} } = {}) {
  const entry = safeSnapshotPath(root, snapshotModule);
  const identity = runtime.uid === undefined && runtime.gid === undefined ? {} : safeInteger(runtime.uid) && safeInteger(runtime.gid) ? { uid: runtime.uid, gid: runtime.gid } : fail("native_module_validation_failed");
  if (typeof runtime.nativeSmoke === "function") { if (runtime.nativeSmoke({ root, snapshotModule: entry, ...identity }) !== true) fail("native_module_validation_failed"); return Object.freeze({ betterSqlite3Memory: true, snapshotImport: true }); }
  const result = spawnSync(runtime.nodePath || process.execPath, ["--input-type=module", "--eval", NATIVE_SMOKE, pathToFileURL(entry).href], { cwd: root, env: CLEAN_ENV, encoding: "utf8", timeout: 15000, maxBuffer: 64 * 1024, windowsHide: true, ...identity });
  if (result.error || result.status !== 0 || String(result.stderr || "").trim()) fail("native_module_validation_failed");
  return Object.freeze({ betterSqlite3Memory: true, snapshotImport: true });
}

function compareInputDigest(value, bytes, condition) {
  const digest = { sha256: hashBytes(bytes), sizeBytes: bytes.length };
  if (value.sha256 !== digest.sha256 || value.sizeBytes !== digest.sizeBytes) fail(condition);
  return digest;
}

export function prepareDependencyArtifactTree({ manifestBytes, archivePath, packageJsonBytes, packageLockBytes, expectedSourceCommit, expectedArtifactRelease, expectedManifestSha256, expectedArchiveSha256, destinationRoot, runtime = {} } = {}) {
  const manifest = parseDependencyArtifactManifest({ bytes: manifestBytes });
  if (expectedManifestSha256 !== undefined && (!HASH.test(expectedManifestSha256) || manifest.sha256 !== expectedManifestSha256)) fail("dependency_file_changed");
  if (expectedSourceCommit && manifest.value.sourceCommit !== expectedSourceCommit) fail("dependency_source_mismatch");
  if (expectedArtifactRelease && manifest.value.artifactRelease !== expectedArtifactRelease) fail("dependency_release_mismatch");
  compareInputDigest(manifest.value.package, packageJsonBytes, "dependency_package_mismatch");
  compareInputDigest(manifest.value.packageLock, packageLockBytes, "dependency_lock_mismatch");
  if (!archivePath || basename(archivePath) !== manifest.value.archive.fileName) fail("dependency_archive_invalid");
  const archiveRecord = archiveMetadata(archivePath, manifest, { ...runtime, enforceOwnership: runtime.enforceOwnership ?? false });
  const archive = archiveRecord.value;
  if (expectedArchiveSha256 !== undefined && (!HASH.test(expectedArchiveSha256) || archive.sha256 !== expectedArchiveSha256)) fail("dependency_file_changed");
  const extracted = extractDependencyArchive(archivePath, { ...runtime, ...(destinationRoot === undefined ? {} : { destinationRoot }) }, { token: ARCHIVE_PIN_TOKEN, identity: archiveRecord.identity });
  let tree; let actualRuntime; let nativeCustody;
  try {
    tree = auditDependencyTree(extracted.nodeModulesRoot, runtime);
    if (tree.sha256 !== manifest.value.tree.sha256 || tree.entryCount !== manifest.value.tree.entryCount || tree.totalBytes !== manifest.value.tree.totalBytes
      || extracted.entryCount !== undefined && extracted.entryCount !== tree.entryCount || extracted.totalBytes !== undefined && extracted.totalBytes !== tree.totalBytes
      || tree.hardlinksBroken !== manifest.value.tree.hardlinksBroken || tree.symlinksInternal !== manifest.value.tree.symlinksInternal) fail("dependency_tree_mismatch");
    nativeCustody = inspectWelcomeCoinsNativeCustodyBundle({ root: extracted.root, enforceModes: false });
    sameNativeCustody(manifest.value.nativeCustody, nativeCustody);
    actualRuntime = runtime.detect ? runtime.detect({ root: extracted.root }) : detectDependencyRuntime({ root: extracted.root, npmVersion: runtime.npmVersion, npmPath: runtime.npmPath, nodePath: runtime.nodePath });
    compareRuntime(manifest.value.runtime, actualRuntime);
    return Object.freeze({ manifest, archive, tree, nativeCustody, runtime: actualRuntime, extracted });
  } catch (error) {
    try { extracted.cleanup(); } catch (cleanupError) { throw cleanupError; }
    throw error;
  }
}

export function verifyDependencyArtifact({ manifestBytes, archivePath, packageJsonBytes, packageLockBytes, expectedSourceCommit, expectedArtifactRelease, projectRoot, nodeModulesRoot, snapshotModule = "scripts/control-plane-db-snapshot-gate-lib.mjs", runtime = {} } = {}) {
  const sourceRoot = resolve(projectRoot || (nodeModulesRoot ? dirname(nodeModulesRoot) : process.cwd()));
  const prepared = prepareDependencyArtifactTree({
    manifestBytes, archivePath, packageJsonBytes, packageLockBytes, expectedSourceCommit, expectedArtifactRelease, runtime
  });
  let smoke;
  try {
    const extractedSnapshot = typeof runtime.nativeSmoke === "function" ? snapshotModule : extractedSnapshotModule({ sourceRoot, extractedRoot: prepared.extracted.root, snapshotModule });
    smoke = runNativeBetterSqliteSmoke({ root: prepared.extracted.root, snapshotModule: extractedSnapshot, runtime });
  } finally {
    prepared.extracted.cleanup();
  }
  return Object.freeze({ schemaVersion: DEPENDENCY_ARTIFACT_SCHEMA_VERSION, type: DEPENDENCY_ARTIFACT_TYPE, state: "verified", releaseUnit: DEPENDENCY_ARTIFACT_RELEASE_UNIT, sourceCommit: prepared.manifest.value.sourceCommit, artifactRelease: prepared.manifest.value.artifactRelease, manifestSha256: prepared.manifest.sha256, manifestSizeBytes: prepared.manifest.sizeBytes, archive: prepared.archive, tree: prepared.tree, nativeCustody: prepared.nativeCustody, smoke });
}

export function buildDependencyArtifactManifest({ sourceCommit, artifactRelease, packageJsonBytes, packageLockBytes, archivePath, root, snapshotModule = "scripts/control-plane-db-snapshot-gate-lib.mjs", runtime = {} } = {}) {
  if (process.platform !== "linux") fail("unsupported_platform");
  if (!COMMIT.test(sourceCommit || "") || !RELEASE.test(artifactRelease || "")) fail("dependency_artifact_invalid");
  const packageDigest = { sha256: hashBytes(packageJsonBytes), sizeBytes: packageJsonBytes?.length };
  const lockDigest = { sha256: hashBytes(packageLockBytes), sizeBytes: packageLockBytes?.length };
  if (!safeInteger(packageDigest.sizeBytes, 1) || !safeInteger(lockDigest.sizeBytes, 1)) fail("dependency_artifact_invalid");
  const archiveDigest = sha256File(archivePath, MAX_ARCHIVE_BYTES);
  const archiveRecord = archiveMetadata(archivePath, { value: { archive: { fileName: basename(archivePath), sha256: archiveDigest.sha256, sizeBytes: archiveDigest.sizeBytes } } }, { ...runtime, enforceOwnership: false });
  const archive = archiveRecord.value;
  const projectRoot = resolve(root);
  const extracted = extractDependencyArchive(archivePath, runtime, { token: ARCHIVE_PIN_TOKEN, identity: archiveRecord.identity });
  let tree; let smoke; let actualRuntime; let nativeCustody;
  try {
    const extractedSnapshot = typeof runtime.nativeSmoke === "function" ? snapshotModule : extractedSnapshotModule({ sourceRoot: projectRoot, extractedRoot: extracted.root, snapshotModule });
    tree = auditDependencyTree(extracted.nodeModulesRoot, runtime);
    nativeCustody = inspectWelcomeCoinsNativeCustodyBundle({ root: projectRoot, enforceModes: true });
    sameNativeCustody(nativeCustody, inspectWelcomeCoinsNativeCustodyBundle({ root: extracted.root, enforceModes: false }));
    actualRuntime = runtime.detect ? runtime.detect({ root: extracted.root }) : detectDependencyRuntime({ root: extracted.root, npmVersion: runtime.npmVersion, npmPath: runtime.npmPath, nodePath: runtime.nodePath });
    smoke = runNativeBetterSqliteSmoke({ root: extracted.root, snapshotModule: extractedSnapshot, runtime });
  } finally {
    extracted.cleanup();
  }
  const value = { schemaVersion: DEPENDENCY_ARTIFACT_SCHEMA_VERSION, type: DEPENDENCY_ARTIFACT_TYPE, state: "verified", releaseUnit: DEPENDENCY_ARTIFACT_RELEASE_UNIT, sourceCommit, artifactRelease, package: packageDigest, packageLock: lockDigest, archive: { fileName: basename(archive.path), sha256: archive.sha256, sizeBytes: archive.sizeBytes }, runtime: actualRuntime, smoke, tree: { sha256: tree.sha256, entryCount: tree.entryCount, totalBytes: tree.totalBytes, hardlinksBroken: tree.hardlinksBroken, symlinksInternal: tree.symlinksInternal }, nativeCustody, provenance: PROVENANCE };
  checkRuntime(value.runtime); const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`); return Object.freeze({ value, bytes, sha256: hashBytes(bytes), sizeBytes: bytes.length });
}

function parseArgs(argv) {
  const map = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]; const equal = typeof item === "string" ? item.indexOf("=") : -1; const key = equal >= 0 ? item.slice(0, equal) : item;
    if (!["--mode", "--root", "--archive", "--manifest", "--output", "--source-commit", "--release", "--snapshot"].includes(key) || map.has(key)) fail("dependency_cli_invalid");
    const value = equal >= 0 ? item.slice(equal + 1) : argv[++index]; if (typeof value !== "string" || !value || value.startsWith("--")) fail("dependency_cli_invalid"); map.set(key, value);
  }
  const mode = map.get("--mode"); if (!["build", "verify", "smoke"].includes(mode)) fail("dependency_cli_invalid"); return { mode, root: map.get("--root") || process.cwd(), archive: map.get("--archive"), manifest: map.get("--manifest"), output: map.get("--output"), sourceCommit: map.get("--source-commit"), release: map.get("--release"), snapshot: map.get("--snapshot") };
}

export async function runDependencyArtifactCli({ argv = process.argv.slice(2), stdout = process.stdout, stderr = process.stderr, runtime = {} } = {}) {
  let mode = null;
  try {
    const value = parseArgs(argv); mode = value.mode; const root = resolve(value.root); const packageJsonBytes = readFileSync(resolve(root, "package.json")); const packageLockBytes = readFileSync(resolve(root, "package-lock.json"));
    if (mode === "smoke") {
      const processIdentity = readSmokeProcessIdentity(runtime);
      const smoke = runNativeBetterSqliteSmoke({ root, snapshotModule: value.snapshot || "scripts/control-plane-db-snapshot-gate-lib.mjs", runtime });
      stdout.write(`${JSON.stringify({ schemaVersion: DEPENDENCY_ARTIFACT_SMOKE_SCHEMA_VERSION, type: DEPENDENCY_ARTIFACT_TYPE, mode, state: "verified", smoke, processIdentity })}\n`);
      return 0;
    }
    if (!value.archive) fail("dependency_cli_invalid");
    if (mode === "build") { if (!value.output || !value.sourceCommit || !value.release) fail("dependency_cli_invalid"); const result = buildDependencyArtifactManifest({ sourceCommit: value.sourceCommit, artifactRelease: value.release, packageJsonBytes, packageLockBytes, archivePath: resolve(value.archive), root, snapshotModule: value.snapshot, runtime }); writeFileSync(resolve(value.output), result.bytes, { mode: 0o600, flag: "wx" }); stdout.write(`${JSON.stringify({ schemaVersion: DEPENDENCY_ARTIFACT_SCHEMA_VERSION, type: DEPENDENCY_ARTIFACT_TYPE, mode, state: "verified", manifestSha256: result.sha256, manifestSizeBytes: result.sizeBytes })}\n`); return 0; }
    if (!value.manifest || !value.sourceCommit || !value.release) fail("dependency_cli_invalid"); const result = verifyDependencyArtifact({ manifestBytes: readDependencyArtifactManifest(resolve(value.manifest)), archivePath: resolve(value.archive), packageJsonBytes, packageLockBytes, expectedSourceCommit: value.sourceCommit, expectedArtifactRelease: value.release, projectRoot: root, snapshotModule: value.snapshot, runtime }); stdout.write(`${JSON.stringify({ schemaVersion: DEPENDENCY_ARTIFACT_SCHEMA_VERSION, type: DEPENDENCY_ARTIFACT_TYPE, mode, state: "verified", manifestSha256: result.manifestSha256, archive: result.archive, tree: result.tree, nativeCustody: result.nativeCustody, smoke: result.smoke })}\n`); return 0;
  } catch (error) { const condition = error instanceof DependencyArtifactError ? error.condition : "dependency_artifact_invalid"; stderr.write(`${JSON.stringify({ schemaVersion: mode === "smoke" ? DEPENDENCY_ARTIFACT_SMOKE_SCHEMA_VERSION : DEPENDENCY_ARTIFACT_SCHEMA_VERSION, type: DEPENDENCY_ARTIFACT_TYPE, mode, state: error?.attentionRequired ? "attention_required" : "blocked", condition })}\n`); return 1; }
}
