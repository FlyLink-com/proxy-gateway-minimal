#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, closeSync, constants as fsConstants, copyFileSync, existsSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readlinkSync, readSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

// v2 adds tree.totalBytes.  Keep this a distinct schema rather than silently
// treating older manifests as if they carried a bounded extraction budget.
export const DEPENDENCY_ARTIFACT_SCHEMA_VERSION = "2";
export const DEPENDENCY_ARTIFACT_TYPE = "control_plane_dependency_artifact";
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
const MAX_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024;
export const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_TREE_ENTRIES = 250000;
const MAX_TREE_BYTES = 2 * 1024 * 1024 * 1024;
const CHUNK = 64 * 1024;
const EXTRACTION_RESERVE_BYTES = 512 * 1024 * 1024;
const EXTRACTION_RESERVE_INODES = 4096;
const SNAPSHOT_MODULE = "scripts/control-plane-db-snapshot-gate.mjs";
const CLEAN_ENV = Object.freeze({ PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" });
const ARCHIVE_LIST = String.raw`import os,sys,tarfile
with tarfile.open(sys.argv[1],"r:*") as archive:
  for member in archive.getmembers():
    sys.stdout.buffer.write(os.fsencode(member.name)+b"\0")`;
const ARCHIVE_EXTRACT = String.raw`import os,posixpath,sys,tarfile
MAX_ENTRIES=250000
MAX_BYTES=2*1024*1024*1024
RESERVE_BYTES=int(sys.argv[3])
RESERVE_INODES=int(sys.argv[4])
def unexpected(exc_type,exc,tb):
  print('{"error":"archive_extract_failed"}')
sys.excepthook=unexpected
def reject():
  print('{"error":"archive_member_rejected"}')
  raise SystemExit(2)
def clean_name(value):
  if not isinstance(value,str) or not value or value.startswith('/') or '\\' in value or '\x00' in value:
    reject()
  value=value.rstrip('/')
  parts=value.split('/')
  if not value or parts[0] != 'node_modules' or any((not part or part in ('.','..')) for part in parts):
    reject()
  return '/'.join(parts)
def safe_target(name,target):
  if not isinstance(target,str) or not target or target.startswith('/') or '\\' in target or '\x00' in target:
    reject()
  resolved=posixpath.normpath(posixpath.join(posixpath.dirname(name),target))
  if resolved != 'node_modules' and not resolved.startswith('node_modules/'):
    reject()
  return target
archive_path=sys.argv[1]
destination=os.path.abspath(sys.argv[2])
with tarfile.open(archive_path,'r:*') as archive:
  members=archive.getmembers()
  records={}
  total=0
  if len(members)>MAX_ENTRIES:
    reject()
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
  try:
    volume=os.statvfs(os.path.dirname(destination))
    available_bytes=volume.f_bavail*volume.f_frsize
    available_inodes=volume.f_ffree
  except OSError:
    print('{"error":"storage_budget_unavailable"}')
    raise SystemExit(3)
  if available_bytes < total+RESERVE_BYTES or available_inodes < len(records)+RESERVE_INODES:
    print('{"error":"storage_budget_unavailable"}')
    raise SystemExit(3)
  os.mkdir(destination,0o700)
  tree=os.path.join(destination,'node_modules')
  os.mkdir(tree,0o700)
  dirs=sorted((name for name,(kind,_,_) in records.items() if kind=='d'),key=lambda value:(value.count('/'),value))
  for name in dirs:
    path=os.path.join(destination,*name.split('/'))
    if name=='node_modules':
      continue
    parent='/'.join(name.split('/')[:-1])
    if parent not in records or records[parent][0] != 'd':
      reject()
    os.mkdir(path,0o700)
  files=sorted((name for name,(kind,_,_) in records.items() if kind=='f') )
  for name in files:
    parent='/'.join(name.split('/')[:-1])
    if parent not in records or records[parent][0] != 'd':
      reject()
    member=records[name][1]
    source=archive.extractfile(member)
    if source is None:
      reject()
    path=os.path.join(destination,*name.split('/'))
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    written=0
    try:
      while True:
        chunk=source.read(65536)
        if not chunk:
          break
        written+=len(chunk)
        if written>member.size or written>MAX_BYTES:
          reject()
        offset=0
        while offset<len(chunk):
          offset+=os.write(fd,chunk[offset:])
      if written!=member.size:
        reject()
      os.fsync(fd)
    finally:
      os.close(fd)
  for name in sorted((name for name,(kind,_,_) in records.items() if kind=='l')):
    parent='/'.join(name.split('/')[:-1])
    if parent not in records or records[parent][0] != 'd':
      reject()
    path=os.path.join(destination,*name.split('/'))
    os.symlink(records[name][2],path)
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
const sha256File = (path, maximum = MAX_TREE_BYTES) => {
  let descriptor;
  let total = 0;
  const digest = createHash("sha256");
  try {
    const before = lstatSync(path);
    descriptor = openSync(path, fsConstants.O_RDONLY | (process.platform === "linux" ? fsConstants.O_NOFOLLOW : 0));
    const opened = fstatSync(descriptor);
    if (!before.isFile() || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size || opened.nlink !== before.nlink || mode(opened) !== mode(before)) fail("dependency_file_changed");
    const buffer = Buffer.allocUnsafe(CHUNK);
    while (true) {
      const count = readSync(descriptor, buffer, 0, buffer.length, null);
      if (!count) break;
      total += count;
      if (total > maximum) fail("dependency_tree_too_large");
      digest.update(buffer.subarray(0, count));
    }
    const after = fstatSync(descriptor);
    if (after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size || after.nlink !== opened.nlink || mode(after) !== mode(opened)) fail("dependency_file_changed");
    return { sha256: digest.digest("hex"), sizeBytes: total };
  } catch (error) {
    if (error instanceof DependencyArtifactError) throw error;
    fail("dependency_file_unreadable");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
};

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

export function parseDependencyArtifactManifest({ bytes } = {}) {
  const value = parseStrictJson(bytes, "dependency_artifact_invalid");
  const expected = ["schemaVersion", "type", "state", "releaseUnit", "sourceCommit", "artifactRelease", "package", "packageLock", "archive", "runtime", "smoke", "tree", "provenance"];
  if (!keys(value, expected) || value.schemaVersion !== DEPENDENCY_ARTIFACT_SCHEMA_VERSION || value.type !== DEPENDENCY_ARTIFACT_TYPE
    || value.state !== "verified" || value.releaseUnit !== DEPENDENCY_ARTIFACT_RELEASE_UNIT || !COMMIT.test(value.sourceCommit || "") || !RELEASE.test(value.artifactRelease || "")) fail("dependency_artifact_invalid");
  checkDigest(value.package, "dependency_artifact_invalid");
  checkDigest(value.packageLock, "dependency_artifact_invalid");
  checkArchive(value.archive);
  checkRuntime(value.runtime);
  if (!value.smoke || !keys(value.smoke, ["betterSqlite3Memory", "snapshotImport"]) || value.smoke.betterSqlite3Memory !== true || value.smoke.snapshotImport !== true) fail("dependency_smoke_invalid");
  checkTree(value.tree);
  if (!value.provenance || !keys(value.provenance, ["builder", "workflow"]) || value.provenance.builder !== PROVENANCE.builder || value.provenance.workflow !== PROVENANCE.workflow) fail("dependency_provenance_invalid");
  return Object.freeze({ value, sha256: hashBytes(bytes), sizeBytes: bytes.length });
}

function detectLibc() {
  try {
    const value = process.report?.getReport?.().header?.glibcVersionRuntime;
    return value ? `glibc-${value}` : "musl";
  } catch { return "musl"; }
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
  if (typeof root !== "string" || typeof snapshotModule !== "string" || !snapshotModule) fail("dependency_smoke_invalid");
  const rootPath = resolve(root);
  let rootMetadata; try { rootMetadata = lstatSync(rootPath); } catch { fail("dependency_smoke_invalid"); }
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) fail("dependency_smoke_invalid");
  const requested = isAbsolute(snapshotModule) ? resolve(snapshotModule) : resolve(rootPath, snapshotModule);
  if (!within(rootPath, requested)) fail("dependency_smoke_invalid");
  const relativePath = relative(rootPath, requested);
  const normalized = relativePath.split(/[\\/]+/).filter(Boolean).join("/");
  if (normalized !== SNAPSHOT_MODULE) fail("dependency_smoke_invalid");
  let current = rootPath;
  const parts = normalized.split("/");
  for (let index = 0; index < parts.length; index += 1) {
    current = join(current, parts[index]);
    let metadata; try { metadata = lstatSync(current); } catch { fail("dependency_smoke_invalid"); }
    if (metadata.isSymbolicLink() || (index < parts.length - 1 ? !metadata.isDirectory() : (!metadata.isFile() || metadata.nlink !== 1))) fail("dependency_smoke_invalid");
  }
  return current;
}

function extractedSnapshotModule({ sourceRoot, extractedRoot, snapshotModule } = {}) {
  const source = safeSnapshotPath(sourceRoot, snapshotModule);
  let extractedMetadata; try { extractedMetadata = lstatSync(resolve(extractedRoot)); } catch { fail("dependency_smoke_invalid"); }
  if (!extractedMetadata.isDirectory() || extractedMetadata.isSymbolicLink()) fail("dependency_smoke_invalid");
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

export function extractDependencyArchive(archivePath, runtime = {}) {
  if (typeof runtime.extractArchive === "function") {
    const value = runtime.extractArchive(archivePath, { destinationRoot: runtime.destinationRoot });
    if (!value || typeof value.root !== "string" || typeof value.nodeModulesRoot !== "string" || typeof value.cleanup !== "function") fail("dependency_archive_invalid");
    return value;
  }
  const requestedRoot = runtime.destinationRoot;
  if (requestedRoot !== undefined && (typeof requestedRoot !== "string" || !isAbsolute(requestedRoot))) fail("dependency_archive_invalid");
  if (requestedRoot !== undefined) assertControlledDestinationParent(resolve(requestedRoot), runtime);
  const parent = requestedRoot === undefined ? mkdtempSync(join(tmpdir(), "control-plane-dependency-artifact-")) : dirname(resolve(requestedRoot));
  const root = requestedRoot === undefined ? join(parent, "project") : resolve(requestedRoot);
  if (root === dirname(root) || existsSync(root)) fail("dependency_archive_invalid");
  const cleanupRoot = requestedRoot === undefined ? parent : root;
  try {
    const result = spawnSync(runtime.pythonPath || "/usr/bin/python3", ["-I", "-S", "-c", ARCHIVE_EXTRACT, archivePath, root, String(EXTRACTION_RESERVE_BYTES), String(EXTRACTION_RESERVE_INODES)], {
      cwd: "/", env: CLEAN_ENV, encoding: "utf8", timeout: 30000, maxBuffer: 64 * 1024, windowsHide: true
    });
    const output = String(result.stdout || "").trim();
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
    try { rmSync(cleanupRoot, { recursive: true, force: true }); } catch { throw new DependencyArtifactError("dependency_archive_cleanup_failed", true); }
    if (error instanceof DependencyArtifactError) throw error;
    fail("dependency_archive_invalid");
  }
}

function archiveMetadata(path, manifest, supplied) {
  let metadata; try { metadata = lstatSync(path); } catch { fail("dependency_archive_missing"); }
  if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.nlink !== 1 || metadata.size > MAX_ARCHIVE_BYTES) fail("dependency_archive_invalid");
  if (supplied.enforceOwnership && (metadata.uid !== 0 || metadata.gid !== 0 || (mode(metadata) & 0o022) !== 0)) fail("dependency_archive_invalid");
  const digest = sha256File(path, MAX_ARCHIVE_BYTES);
  if (digest.sha256 !== manifest.value.archive.sha256 || digest.sizeBytes !== manifest.value.archive.sizeBytes || digest.sizeBytes !== metadata.size) fail("dependency_archive_mismatch");
  const listing = typeof supplied.listArchive === "function" ? supplied.listArchive(path) : (() => {
    const result = spawnSync(supplied.pythonPath || "/usr/bin/python3", ["-I", "-S", "-c", ARCHIVE_LIST, path], { env: CLEAN_ENV, encoding: null, maxBuffer: 32 * 1024 * 1024 });
    if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout)) fail("dependency_archive_invalid");
    return result.stdout;
  })();
  validateDependencyArchiveEntries(listing);
  return Object.freeze({ path, sha256: digest.sha256, sizeBytes: digest.sizeBytes });
}

const NATIVE_SMOKE = `import Database from "better-sqlite3"; const d=new Database(":memory:"); d.exec("CREATE TABLE t(v INTEGER)"); d.prepare("INSERT INTO t VALUES(?)").run(7); if(d.prepare("SELECT v FROM t").get().v!==7) process.exit(42); d.close(); await import(new URL(process.argv[1], "file:"));`;
export function runNativeBetterSqliteSmoke({ root, snapshotModule = "scripts/control-plane-db-snapshot-gate.mjs", runtime = {} } = {}) {
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
  const archive = archiveMetadata(archivePath, manifest, { ...runtime, enforceOwnership: runtime.enforceOwnership ?? false });
  if (expectedArchiveSha256 !== undefined && (!HASH.test(expectedArchiveSha256) || archive.sha256 !== expectedArchiveSha256)) fail("dependency_file_changed");
  const extracted = extractDependencyArchive(archivePath, { ...runtime, ...(destinationRoot === undefined ? {} : { destinationRoot }) });
  let tree; let actualRuntime;
  try {
    tree = auditDependencyTree(extracted.nodeModulesRoot, runtime);
    if (tree.sha256 !== manifest.value.tree.sha256 || tree.entryCount !== manifest.value.tree.entryCount || tree.totalBytes !== manifest.value.tree.totalBytes
      || extracted.entryCount !== undefined && extracted.entryCount !== tree.entryCount || extracted.totalBytes !== undefined && extracted.totalBytes !== tree.totalBytes
      || tree.hardlinksBroken !== manifest.value.tree.hardlinksBroken || tree.symlinksInternal !== manifest.value.tree.symlinksInternal) fail("dependency_tree_mismatch");
    actualRuntime = runtime.detect ? runtime.detect({ root: extracted.root }) : detectDependencyRuntime({ root: extracted.root, npmVersion: runtime.npmVersion, npmPath: runtime.npmPath, nodePath: runtime.nodePath });
    compareRuntime(manifest.value.runtime, actualRuntime);
    return Object.freeze({ manifest, archive, tree, runtime: actualRuntime, extracted });
  } catch (error) {
    try { extracted.cleanup(); } catch (cleanupError) { throw cleanupError; }
    throw error;
  }
}

export function verifyDependencyArtifact({ manifestBytes, archivePath, packageJsonBytes, packageLockBytes, expectedSourceCommit, expectedArtifactRelease, projectRoot, nodeModulesRoot, snapshotModule = "scripts/control-plane-db-snapshot-gate.mjs", runtime = {} } = {}) {
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
  return Object.freeze({ schemaVersion: DEPENDENCY_ARTIFACT_SCHEMA_VERSION, type: DEPENDENCY_ARTIFACT_TYPE, state: "verified", releaseUnit: DEPENDENCY_ARTIFACT_RELEASE_UNIT, sourceCommit: prepared.manifest.value.sourceCommit, artifactRelease: prepared.manifest.value.artifactRelease, manifestSha256: prepared.manifest.sha256, manifestSizeBytes: prepared.manifest.sizeBytes, archive: prepared.archive, tree: prepared.tree, smoke });
}

export function buildDependencyArtifactManifest({ sourceCommit, artifactRelease, packageJsonBytes, packageLockBytes, archivePath, root, snapshotModule = "scripts/control-plane-db-snapshot-gate.mjs", runtime = {} } = {}) {
  if (process.platform !== "linux") fail("unsupported_platform");
  if (!COMMIT.test(sourceCommit || "") || !RELEASE.test(artifactRelease || "")) fail("dependency_artifact_invalid");
  const packageDigest = { sha256: hashBytes(packageJsonBytes), sizeBytes: packageJsonBytes?.length };
  const lockDigest = { sha256: hashBytes(packageLockBytes), sizeBytes: packageLockBytes?.length };
  if (!safeInteger(packageDigest.sizeBytes, 1) || !safeInteger(lockDigest.sizeBytes, 1)) fail("dependency_artifact_invalid");
  const archiveDigest = sha256File(archivePath, MAX_ARCHIVE_BYTES);
  const archive = archiveMetadata(archivePath, { value: { archive: { fileName: basename(archivePath), sha256: archiveDigest.sha256, sizeBytes: archiveDigest.sizeBytes } } }, { ...runtime, enforceOwnership: false });
  const projectRoot = resolve(root);
  const extracted = extractDependencyArchive(archivePath, runtime);
  let tree; let smoke; let actualRuntime;
  try {
    const extractedSnapshot = typeof runtime.nativeSmoke === "function" ? snapshotModule : extractedSnapshotModule({ sourceRoot: projectRoot, extractedRoot: extracted.root, snapshotModule });
    tree = auditDependencyTree(extracted.nodeModulesRoot, runtime);
    actualRuntime = runtime.detect ? runtime.detect({ root: extracted.root }) : detectDependencyRuntime({ root: extracted.root, npmVersion: runtime.npmVersion, npmPath: runtime.npmPath, nodePath: runtime.nodePath });
    smoke = runNativeBetterSqliteSmoke({ root: extracted.root, snapshotModule: extractedSnapshot, runtime });
  } finally {
    extracted.cleanup();
  }
  const value = { schemaVersion: DEPENDENCY_ARTIFACT_SCHEMA_VERSION, type: DEPENDENCY_ARTIFACT_TYPE, state: "verified", releaseUnit: DEPENDENCY_ARTIFACT_RELEASE_UNIT, sourceCommit, artifactRelease, package: packageDigest, packageLock: lockDigest, archive: { fileName: basename(archive.path), sha256: archive.sha256, sizeBytes: archive.sizeBytes }, runtime: actualRuntime, smoke, tree: { sha256: tree.sha256, entryCount: tree.entryCount, totalBytes: tree.totalBytes, hardlinksBroken: tree.hardlinksBroken, symlinksInternal: tree.symlinksInternal }, provenance: PROVENANCE };
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
    if (mode === "smoke") { const smoke = runNativeBetterSqliteSmoke({ root, snapshotModule: value.snapshot || "scripts/control-plane-db-snapshot-gate.mjs" }); stdout.write(`${JSON.stringify({ schemaVersion: DEPENDENCY_ARTIFACT_SCHEMA_VERSION, type: DEPENDENCY_ARTIFACT_TYPE, mode, state: "verified", smoke })}\n`); return 0; }
    if (!value.archive) fail("dependency_cli_invalid");
    if (mode === "build") { if (!value.output || !value.sourceCommit || !value.release) fail("dependency_cli_invalid"); const result = buildDependencyArtifactManifest({ sourceCommit: value.sourceCommit, artifactRelease: value.release, packageJsonBytes, packageLockBytes, archivePath: resolve(value.archive), root, snapshotModule: value.snapshot, runtime }); writeFileSync(resolve(value.output), result.bytes, { mode: 0o600, flag: "wx" }); stdout.write(`${JSON.stringify({ schemaVersion: DEPENDENCY_ARTIFACT_SCHEMA_VERSION, type: DEPENDENCY_ARTIFACT_TYPE, mode, state: "verified", manifestSha256: result.sha256, manifestSizeBytes: result.sizeBytes })}\n`); return 0; }
    if (!value.manifest || !value.sourceCommit || !value.release) fail("dependency_cli_invalid"); const result = verifyDependencyArtifact({ manifestBytes: readDependencyArtifactManifest(resolve(value.manifest)), archivePath: resolve(value.archive), packageJsonBytes, packageLockBytes, expectedSourceCommit: value.sourceCommit, expectedArtifactRelease: value.release, projectRoot: root, snapshotModule: value.snapshot, runtime }); stdout.write(`${JSON.stringify({ schemaVersion: DEPENDENCY_ARTIFACT_SCHEMA_VERSION, type: DEPENDENCY_ARTIFACT_TYPE, mode, state: "verified", manifestSha256: result.manifestSha256, archive: result.archive, tree: result.tree, smoke: result.smoke })}\n`); return 0;
  } catch (error) { const condition = error instanceof DependencyArtifactError ? error.condition : "dependency_artifact_invalid"; stderr.write(`${JSON.stringify({ schemaVersion: DEPENDENCY_ARTIFACT_SCHEMA_VERSION, type: DEPENDENCY_ARTIFACT_TYPE, mode, state: error?.attentionRequired ? "attention_required" : "blocked", condition })}\n`); return 1; }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) process.exitCode = await runDependencyArtifactCli();
