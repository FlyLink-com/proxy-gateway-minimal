#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync, chownSync, closeSync, constants as fsConstants, copyFileSync, existsSync, fstatSync, fsyncSync,
  lchownSync, linkSync, lstatSync, mkdirSync, openSync, opendirSync, readFileSync, readSync, readdirSync,
  writeSync,
  readlinkSync, realpathSync, rmSync, statSync, unlinkSync, writeFileSync
} from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyReleaseConfigOverlay } from "./control-plane-release-config-gate.mjs";
import {
  auditDependencyTree,
  DEPENDENCY_ARTIFACT_SCHEMA_VERSION,
  DEPENDENCY_ARTIFACT_TYPE,
  dependencyArtifactPaths,
  prepareDependencyArtifactTree,
  readDependencyArtifactManifest,
  runNativeBetterSqliteSmoke
} from "./control-plane-dependency-artifact.mjs";

export const CANDIDATE_DEPENDENCY_GATE_SCHEMA_VERSION = "1";
export const CANDIDATE_DEPENDENCY_GATE_TYPE = "control_plane_candidate_dependency_gate";
export const DEFAULT_CONTROL_PLANE_DEPLOYMENT_ROOT = "/opt/proxy-gateway-minimal-candidate";
export const CONTROL_PLANE_SERVICE_UNIT = "proxy-gateway-candidate.service";

const UNIT = "control-plane-app";
const LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
const ARTIFACT_RELEASE = /^[A-Za-z0-9._-]{1,160}$/;
const HASH = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const ROOT_LOCK = "/run/control-plane-candidate-dependency-gates";
const STATE_ROOT = "/var/lib/private";
const STATE_PUBLIC_ROOT = "/var/lib";
const WORKER_INPUT_ROOT = "/opt/proxy-gateway-minimal-candidate/dependency-worker-inputs";
const SEALED_ARCHIVE_ROOT = "/opt/proxy-gateway-minimal-candidate/dependency-sealed-archives";
const WORKER_INPUT_BIND_ROOT = "/run/control-plane-candidate-dependency-input";
const SMOKE_BIND_ROOT = "/run/control-plane-candidate-dependency-smoke";
const A3_VALIDATION_ROOT = "/var/lib/control-plane-a3-1";
const A3_SERVICE_SMOKE_BIND_ROOT = "/run/control-plane-a3-service-smoke";
const A3_RUN_LABEL = /^[a-z0-9][a-z0-9-]{0,63}$/;
const A3_SMOKE_PHASES = new Set(["validation", "prepublish", "postpublish", "verify"]);
const A3_PROBE_BYTE_HARD_LIMIT = 1024 * 1024;
const A3_PROBE_INODE_HARD_LIMIT = 64;
const WORKER_NPM = "/usr/bin/npm";
const WORKER_TAR = "/usr/bin/tar";
const SEALED_TREE_LIMITS = Object.freeze({ maxDepth: 64, maxEntries: 250000, maxHashBytes: 2 * 1024 * 1024 * 1024 });
const SEALED_ARCHIVE_MAX_BYTES = 2 * 1024 * 1024 * 1024;
const WORKER_INPUT_LAYOUT = Object.freeze({
  build: Object.freeze([
    Object.freeze({ name: "package.json", type: "file", exactMode: "0444", singleLink: true }),
    Object.freeze({ name: "package-lock.json", type: "file", exactMode: "0444", singleLink: true })
  ]),
  extract: Object.freeze([
    Object.freeze({ name: "sealed-node-modules.tar", type: "file", exactMode: "0444", singleLink: true })
  ]),
  smoke: Object.freeze([
    Object.freeze({ name: "sealed-node-modules-tree", type: "directory", exactMode: null, singleLink: false }),
    Object.freeze({ name: "smoke-fixture.sqlite", type: "file", exactMode: "0444", singleLink: true }),
    Object.freeze({ name: "smoke-metadata.json", type: "file", exactMode: "0444", singleLink: true })
  ])
});
const SAFE = new Set([
  "apply_confirmation_required", "archive_path_invalid", "artifact_stage_receipt_invalid",
  "artifact_stage_receipt_mismatch", "artifact_stage_receipt_missing", "artifact_manifest_invalid",
  "artifact_manifest_missing", "assembly_manifest_invalid",
  "builder_cleanup_failed", "builder_environment_invalid", "builder_files_invalid",
  "candidate_node_modules_present", "candidate_path_invalid", "candidate_tree_invalid",
  "child_cleanup_failed", "dependency_receipt_invalid", "dependency_receipt_missing",
  "dependency_receipt_mismatch", "dependency_receipt_present", "dependency_receipt_publish_failed",
  "dependency_acl_or_capability_invalid", "dependency_archive_cleanup_failed", "dependency_archive_extract_failed",
  "dependency_archive_invalid", "dependency_archive_member_invalid", "dependency_archive_mismatch", "dependency_archive_missing",
  "dependency_artifact_invalid", "dependency_consumer_contract_invalid", "dependency_file_changed", "dependency_file_unreadable",
  "dependency_lock_mismatch", "dependency_package_mismatch", "dependency_release_mismatch", "dependency_runtime_invalid",
  "dependency_runtime_mismatch", "dependency_smoke_invalid", "dependency_source_mismatch", "dependency_tree_invalid",
  "dependency_storage_budget_unavailable", "dependency_tree_mismatch", "dependency_tree_too_large",
  "device_boundary_invalid", "hardlink_provenance_invalid", "invalid_input", "lock_cleanup_failed",
  "lock_unavailable", "mount_boundary_invalid", "native_module_validation_failed",
  "node_modules_publish_failed", "postpublish_cleanup_failed", "postpublish_validation_failed",
  "privilege_invalid", "rename_noreplace_unavailable", "service_identity_changed",
  "service_identity_invalid", "service_state_invalid", "source_identity_mismatch",
  "trusted_layout_invalid", "unsafe_acl_or_capability", "untrusted_system_tool", "unsupported_platform",
  "worker_adapter_unavailable", "worker_cleanup_uncertain", "worker_environment_invalid", "worker_execution_failed",
  "worker_input_custody_invalid", "worker_input_invalid", "worker_private_directory_invalid", "worker_readback_invalid",
  "worker_storage_limit_unavailable", "storage_quota_evidence_invalid", "service_smoke_readback_invalid",
  "service_smoke_runner_unavailable"
]);
const CMD_ENV = Object.freeze({ PATH: "/usr/bin:/bin", LC_ALL: "C", LANG: "C" });
const TRANSIENT_PROPERTIES = Object.freeze([
  "DynamicUser=yes", "KillMode=control-group", "SendSIGKILL=yes", "TimeoutStartSec=300", "TimeoutStopSec=15",
  "TasksMax=128", "MemoryMax=1G", "NoNewPrivileges=yes", "CapabilityBoundingSet=", "ProtectSystem=strict",
  "ProtectHome=yes", "PrivateTmp=yes", "PrivateDevices=yes", "ProtectControlGroups=yes", "Delegate=no", "Slice=system.slice", "StateDirectoryMode=0700"
]);
const PRODUCTION_TRANSIENT_TOOLS = Object.freeze({
  systemdRun: "/usr/bin/systemd-run", systemctl: "/usr/bin/systemctl", env: "/usr/bin/env", node: "/usr/bin/node",
  npm: WORKER_NPM, tar: WORKER_TAR, python: "/usr/bin/python3", getfacl: "/usr/bin/getfacl", getcap: "/usr/sbin/getcap"
});
const A3_PHYSICAL_TOOLS = Object.freeze({
  findmnt: "/usr/bin/findmnt", node: "/usr/bin/node", systemctl: "/usr/bin/systemctl",
  systemdRun: "/usr/bin/systemd-run", xfsIo: "/usr/sbin/xfs_io", xfsQuota: "/usr/sbin/xfs_quota"
});
const RENAME_SCRIPT = String.raw`import ctypes,errno,os,sys
try:r=ctypes.CDLL(None,use_errno=True).renameat2
except (AttributeError,OSError):sys.exit(70)
r.argtypes=[ctypes.c_int,ctypes.c_char_p,ctypes.c_int,ctypes.c_char_p,ctypes.c_uint]
z=r(-100,os.fsencode(sys.argv[1]),-100,os.fsencode(sys.argv[2]),1)
if z==0:sys.exit(0)
e=ctypes.get_errno();sys.exit(70 if e in (errno.ENOSYS,errno.EINVAL) else 17 if e==errno.EEXIST else 71)`;
const RENAME_PROBE = "import ctypes,sys\ntry:getattr(ctypes.CDLL(None),'renameat2')\nexcept (AttributeError,OSError):sys.exit(70)";
const SEALED_SMOKE_TREE_AUDIT = String.raw`import hashlib,json,os,stat,sys
def bad(): raise RuntimeError()
def checked(value,typ):
  if not isinstance(value,typ): bad()
  return value
def mode(value): return stat.S_IMODE(value.st_mode)
def same_node(left,right):
  return left.st_dev==right.st_dev and left.st_ino==right.st_ino and left.st_uid==right.st_uid and left.st_gid==right.st_gid and left.st_mode==right.st_mode and left.st_size==right.st_size and left.st_nlink==right.st_nlink
try:
  request=json.load(sys.stdin)
  if not isinstance(request,dict) or set(request)!={"tree","limits","digest","rootRequired"}: bad()
  tree=checked(request["tree"],str)
  if not tree or "\x00" in tree or not os.path.isabs(tree): bad()
  limits=checked(request["limits"],dict)
  if set(limits)!={"maxDepth","maxEntries","maxHashBytes"}: bad()
  for key in ("maxDepth","maxEntries","maxHashBytes"):
    if type(limits[key]) is not int or limits[key]<=0: bad()
  digest_requested=checked(request["digest"],bool)
  root_required=checked(request["rootRequired"],bool)
  dir_flags=os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC
  file_flags=os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK|os.O_CLOEXEC
  def fd_mount(fd):
    with open("/proc/self/fdinfo/"+str(fd),"r",encoding="ascii",errors="strict") as source:
      for line in source:
        if line.startswith("mnt_id:"):
          value=line.split(":",1)[1].strip()
          if value.isdecimal(): return int(value)
    bad()
  def controlled_directory(value):
    if not stat.S_ISDIR(value.st_mode): bad()
    if root_required and (value.st_uid!=0 or value.st_gid!=0 or mode(value)&0o7022): bad()
  def open_absolute_directory(path):
    if not path.startswith("/") or path=="/": bad()
    parts=path.split("/")[1:]
    if not parts or any(not part or part in (".","..") or "\x00" in part for part in parts): bad()
    current=os.open("/",dir_flags)
    try:
      controlled_directory(os.fstat(current))
      for part in parts:
        expected=os.stat(part,dir_fd=current,follow_symlinks=False)
        if not stat.S_ISDIR(expected.st_mode): bad()
        child=os.open(part,dir_flags,dir_fd=current)
        try:
          observed=os.fstat(child)
          if not same_node(observed,expected): bad()
          controlled_directory(observed)
          os.close(current); current=child; child=None
        finally:
          if child is not None: os.close(child)
      return current
    except Exception:
      os.close(current)
      raise
  root_fd=open_absolute_directory(tree)
  anchor_fd=None
  try:
    root_stat=os.fstat(root_fd)
    if not stat.S_ISDIR(root_stat.st_mode): bad()
    root_dev=root_stat.st_dev
    root_mount=fd_mount(root_fd)
    anchor_fd=os.dup(root_fd)
    state={"entries":0,"bytes":0,"hash":hashlib.sha256() if digest_requested else None}
    component_limit=min(128,limits["maxDepth"])
    def controlled(value,link=False):
      if root_required and (value.st_uid!=0 or value.st_gid!=0): bad()
      if not link and mode(value)&0o7022: bad()
      if value.st_dev!=root_dev: bad()
    def reserve(value):
      if type(value) is not int or value<0 or value>limits["maxHashBytes"]-state["bytes"]: bad()
      state["bytes"]+=value
    def add(relative_path,kind,value,payload=""):
      if state["hash"] is not None:
        state["hash"].update((json.dumps([relative_path,kind,mode(value)&0o777,value.st_uid,value.st_gid,payload],ensure_ascii=False,separators=(",",":"))+"\n").encode("utf-8","strict"))
    def advance():
      state["entries"]+=1
      if state["entries"]>limits["maxEntries"]: bad()
    def names(fd,next_depth):
      result=[]
      with os.scandir(os.dup(fd)) as iterator:
        for entry in iterator:
          name=entry.name
          if not isinstance(name,str) or not name or name in (".",".."): bad()
          try: raw=name.encode("utf-8","strict")
          except UnicodeError: bad()
          if not raw or b"\x00" in raw or b"/" in raw or next_depth>limits["maxDepth"] or state["entries"]+len(result)+1>limits["maxEntries"]: bad()
          result.append((raw,name))
      result.sort(key=lambda item:item[0])
      return result
    def opened(parent_fd,name,flags,expected):
      value=os.open(name,flags,dir_fd=parent_fd)
      try:
        observed=os.fstat(value)
        if not same_node(observed,expected) or fd_mount(value)!=root_mount: bad()
        return value,observed
      except Exception:
        os.close(value)
        raise
    def target(parts,first_link):
      current=os.dup(anchor_fd)
      resolved=[]; pending=list(parts); seen_links={first_link}; hops=1
      try:
        while pending:
          part=pending.pop(0); expected=os.stat(part,dir_fd=current,follow_symlinks=False)
          if stat.S_ISLNK(expected.st_mode):
            controlled(expected,True); target_text=os.readlink(part,dir_fd=current)
            if not same_node(os.stat(part,dir_fd=current,follow_symlinks=False),expected): bad()
            marker=(expected.st_dev,expected.st_ino); hops+=1
            if marker in seen_links or hops>16: bad()
            seen_links.add(marker); replacement=link_parts(resolved,target_text)
            if len(replacement)+len(pending)>component_limit: bad()
            os.close(current); current=os.dup(anchor_fd); resolved=[]; pending=replacement+pending
            continue
          if stat.S_ISDIR(expected.st_mode):
            child,observed=opened(current,part,dir_flags,expected); controlled(observed)
            if not pending:
              try: return observed,resolved+[part]
              finally: os.close(child)
            os.close(current); current=child; resolved.append(part)
            continue
          if stat.S_ISREG(expected.st_mode) and not pending:
            final,observed=opened(current,part,file_flags,expected)
            try: return observed,resolved+[part]
            finally: os.close(final)
          bad()
        value=os.fstat(current)
        if fd_mount(current)!=root_mount: bad()
        return value,resolved
      finally: os.close(current)
    def link_parts(parent,target_text):
      if not isinstance(target_text,str) or not target_text or target_text.startswith("/") or "\x00" in target_text: bad()
      try: target_text.encode("utf-8","strict")
      except UnicodeError: bad()
      result=list(parent)
      for part in target_text.split("/"):
        if not part: bad()
        if part==".": continue
        if part=="..":
          if not result: bad()
          result.pop(); continue
        try: raw=part.encode("utf-8","strict")
        except UnicodeError: bad()
        if not raw or b"\x00" in raw or b"/" in raw: bad()
        result.append(part)
        if len(result)>component_limit: bad()
      return result
    def file_hash(parent_fd,name,expected):
      value,observed=opened(parent_fd,name,file_flags,expected)
      try:
        digest=hashlib.sha256(); remaining=observed.st_size
        while remaining:
          block=os.read(value,min(65536,remaining))
          if not block: bad()
          digest.update(block); remaining-=len(block)
        if not same_node(os.fstat(value),observed): bad()
        return digest.hexdigest()
      finally: os.close(value)
    def scan_directory(fd,components,relative_path,depth,expected):
      try:
        observed=os.fstat(fd)
        if not same_node(observed,expected) or fd_mount(fd)!=root_mount or not stat.S_ISDIR(observed.st_mode): bad()
        controlled(observed); advance(); add(relative_path,"directory",observed)
        for _raw,name in names(fd,depth+1):
          child_relative=name if relative_path=="." else relative_path+"/"+name
          item=os.stat(name,dir_fd=fd,follow_symlinks=False)
          if stat.S_ISDIR(item.st_mode):
            child,child_stat=opened(fd,name,dir_flags,item)
            scan_directory(child,components+[name],child_relative,depth+1,child_stat)
          elif stat.S_ISREG(item.st_mode):
            advance()
            controlled(item)
            if item.st_nlink!=1: bad()
            reserve(item.st_size); add(child_relative,"file",item,str(item.st_size)+":"+(file_hash(fd,name,item) if digest_requested else ""))
          elif stat.S_ISLNK(item.st_mode):
            advance()
            controlled(item,True)
            target_text=os.readlink(name,dir_fd=fd)
            if not same_node(os.stat(name,dir_fd=fd,follow_symlinks=False),item): bad()
            parts=link_parts(components,target_text); target_stat,target_parts=target(parts,(item.st_dev,item.st_ino))
            if not (stat.S_ISDIR(target_stat.st_mode) or stat.S_ISREG(target_stat.st_mode)): bad()
            controlled(target_stat)
            if stat.S_ISREG(target_stat.st_mode) and target_stat.st_nlink!=1: bad()
            reserve(len(target_text.encode("utf-8","strict"))); add(child_relative,"symlink",item,target_text+":"+("/".join(target_parts) or "."))
          else: bad()
        if not same_node(os.fstat(fd),observed): bad()
      finally: os.close(fd)
    scan_directory(root_fd,[],".",0,root_stat); root_fd=None
    payload={"schemaVersion":"1","type":"control_plane_sealed_smoke_tree","mode":"final" if digest_requested else "pre","entryCount":state["entries"]}
    if state["hash"] is not None: payload["digest"]=state["hash"].hexdigest()
    sys.stdout.write(json.dumps(payload,separators=(",",":"))+"\n")
  finally:
    if root_fd is not None: os.close(root_fd)
    if anchor_fd is not None: os.close(anchor_fd)
except Exception:
  sys.exit(1)`;

export class CandidateDependencyGateError extends Error {
  constructor(condition, attentionRequired = false) { super(condition); this.condition = condition; this.attentionRequired = attentionRequired; }
}
const fail = (condition, attentionRequired = false) => { throw new CandidateDependencyGateError(condition, attentionRequired); };
const abs = (value) => resolve(value);
const same = (a, b) => (process.platform === "win32" ? abs(a).toLowerCase() : abs(a)) === (process.platform === "win32" ? abs(b).toLowerCase() : abs(b));
const inside = (root, path) => { const child = relative(root, path); return child !== "" && child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child); };
const within = (root, path) => same(root, path) || inside(root, path);
const mode = (metadata) => metadata.mode & 0o7777;
const inode = (metadata) => `${metadata.dev}:${metadata.ino}`;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const hashFile = (path) => hash(readFileSync(path));
const iso = (value) => { const parsed = new Date(value); return typeof value === "string" && !Number.isNaN(parsed) && parsed.toISOString() === value; };
const now = (runtime) => { const value = runtime.now(); if (!iso(value)) fail("invalid_input"); return value; };

function stat(path, condition) { try { return lstatSync(path); } catch { fail(condition); } }
function physical(path, condition) { try { return realpathSync(path); } catch { fail(condition); } }
function ancestors(path) { const result = []; for (let cursor = abs(path); ; cursor = dirname(cursor)) { result.push(cursor); if (same(cursor, dirname(cursor))) return result.reverse(); } }
function owned(metadata, runtime, condition) {
  if (runtime.enforceOwnership && (metadata.uid !== 0 || (mode(metadata) & 0o022) !== 0)) fail(condition);
}
function directory(path, runtime, condition) {
  const lexical = abs(path), metadata = stat(lexical, condition), real = physical(lexical, condition);
  if (metadata.isSymbolicLink() || !metadata.isDirectory() || !same(lexical, real)) fail(condition);
  owned(stat(real, condition), runtime, condition); return real;
}
function trusted(path, runtime, condition = "trusted_layout_invalid") { for (const segment of ancestors(path)) directory(segment, runtime, condition); return abs(path); }
function regular(path, runtime, condition, exactMode = null, singleLink = false) {
  const lexical = abs(path), metadata = stat(lexical, condition), real = physical(lexical, condition);
  if (metadata.isSymbolicLink() || !metadata.isFile() || !same(lexical, real)) fail(condition);
  const final = stat(real, condition); owned(final, runtime, condition);
  if (exactMode !== null && (mode(final) & 0o777) !== exactMode) fail(condition);
  if (singleLink && final.nlink !== 1) fail(condition);
  return { path: real, metadata: final };
}
function fileIn(root, name, runtime, condition) {
  const path = abs(resolve(root, ...name.split("/"))); if (!inside(root, path)) fail(condition);
  const parent = directory(dirname(path), runtime, condition); if (!within(root, parent)) fail(condition);
  return regular(path, runtime, condition);
}
function json(path, condition, canonical = false) { try { const raw = readFileSync(path, "utf8"), value = JSON.parse(raw); if (!value || typeof value !== "object" || Array.isArray(value) || canonical && raw !== JSON.stringify(value)) fail(condition); return value; } catch (error) { if (error instanceof CandidateDependencyGateError) throw error; fail(condition); } }
function strictJsonObject(bytes, condition) {
  try {
    if (!Buffer.isBuffer(bytes)) fail(condition);
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    let cursor = 0;
    const invalid = () => { throw new SyntaxError("invalid JSON"); };
    const whitespace = () => { while (cursor < raw.length && " \t\r\n".includes(raw[cursor])) cursor += 1; };
    const string = () => {
      if (raw[cursor] !== '"') invalid();
      const start = cursor; cursor += 1;
      while (cursor < raw.length) {
        const character = raw[cursor]; cursor += 1;
        if (character === '"') return JSON.parse(raw.slice(start, cursor));
        if (character === "\\") {
          if (cursor >= raw.length) invalid();
          const escape = raw[cursor]; cursor += 1;
          if (escape === "u") {
            if (!/^[0-9a-fA-F]{4}$/.test(raw.slice(cursor, cursor + 4))) invalid();
            cursor += 4;
          } else if (!'"\\/bfnrt'.includes(escape)) invalid();
        } else if (character.charCodeAt(0) < 0x20) invalid();
      }
      invalid();
    };
    const literal = (value) => { if (!raw.startsWith(value, cursor)) invalid(); cursor += value.length; };
    const number = () => {
      const match = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(raw.slice(cursor));
      if (!match) invalid(); cursor += match[0].length;
    };
    const value = (depth) => {
      if (depth > 16) invalid(); whitespace();
      if (raw[cursor] === '"') { string(); return; }
      if (raw[cursor] === "{") { object(depth + 1); return; }
      if (raw[cursor] === "[") { array(depth + 1); return; }
      if (raw.startsWith("true", cursor)) { literal("true"); return; }
      if (raw.startsWith("false", cursor)) { literal("false"); return; }
      if (raw.startsWith("null", cursor)) { literal("null"); return; }
      number();
    };
    const object = (depth) => {
      cursor += 1; whitespace();
      const properties = new Set();
      if (raw[cursor] === "}") { cursor += 1; return; }
      while (true) {
        whitespace(); const property = string();
        if (properties.has(property)) invalid(); properties.add(property);
        whitespace(); if (raw[cursor] !== ":") invalid(); cursor += 1; value(depth); whitespace();
        if (raw[cursor] === "}") { cursor += 1; return; }
        if (raw[cursor] !== ",") invalid(); cursor += 1;
      }
    };
    const array = (depth) => {
      cursor += 1; whitespace();
      if (raw[cursor] === "]") { cursor += 1; return; }
      while (true) {
        value(depth); whitespace();
        if (raw[cursor] === "]") { cursor += 1; return; }
        if (raw[cursor] !== ",") invalid(); cursor += 1;
      }
    };
    value(0); whitespace(); if (cursor !== raw.length) invalid();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) invalid();
    return parsed;
  } catch (error) { if (error instanceof CandidateDependencyGateError) throw error; fail(condition); }
}
function keys(value, expected) { const actual = Object.keys(value || {}).sort(), wanted = [...expected].sort(); return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]); }
function label(value) { if (typeof value !== "string" || !LABEL.test(value)) fail("invalid_input"); return value; }
function runtime(overrides = {}) {
  return {
    root: DEFAULT_CONTROL_PLANE_DEPLOYMENT_ROOT, platform: process.platform,
    requireRoot: true, enforceOwnership: process.platform === "linux",
    getuid: () => process.getuid?.(), getgid: () => process.getgid?.(), now: () => new Date().toISOString(),
    lockRoot: ROOT_LOCK, stateRoot: STATE_ROOT, statePublicRoot: STATE_PUBLIC_ROOT, workerInputRoot: WORKER_INPUT_ROOT, sealedArchiveRoot: SEALED_ARCHIVE_ROOT,
    tools: { systemctl: "/usr/bin/systemctl", systemdRun: "/usr/bin/systemd-run", env: "/usr/bin/env", npm: "/usr/bin/npm", node: "/usr/bin/node", tar: "/usr/bin/tar", python: "/usr/bin/python3", getfacl: "/usr/bin/getfacl", getcap: "/usr/sbin/getcap" },
    ...overrides
  };
}
// A3-0: storage-quota and service-smoke boundary contracts.
// These hooks are runtime-injected ONLY. Production never receives them via
// `runtime()`; the production materialize/verify/preflight entrypoints still
// fail-closed with `worker_storage_limit_unavailable` until a privileged
// disposable Linux run proves both boundaries and a separate PR removes the
// guard. The collector/runner shapes below define the readback evidence each
// boundary must publish; the production materializer never bypasses the guard
// through test-only injection.
const STORAGE_QUOTA_EVIDENCE_KEYS = Object.freeze([
  "filesystem", "projectId", "byteHardLimit", "byteCurrent", "inodeHardLimit", "inodeCurrent",
  "headroomBytes", "headroomInodes", "probe"
]);
const STORAGE_QUOTA_PROBE_KEYS = Object.freeze(["expectedErrorCode", "observedErrorCode", "exhausted"]);
const SERVICE_SMOKE_READBACK_KEYS = Object.freeze([
  "serviceUid", "serviceGid", "fixedNodePath", "noNetwork", "capabilityBoundingSet",
  "protectSystem", "protectHome", "privateDevices", "noNewPrivileges",
  "cgroupEmpty", "terminalActiveState", "terminalSubState", "terminalResult",
  "betterSqlite3Memory", "snapshotImport"
]);
export function parseStorageQuotaEvidence(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("storage_quota_evidence_invalid");
  const actual = Object.keys(value).sort();
  const wanted = [...STORAGE_QUOTA_EVIDENCE_KEYS].sort();
  if (actual.length !== wanted.length || !actual.every((key, index) => key === wanted[index])) fail("storage_quota_evidence_invalid");
  if (typeof value.filesystem !== "string" || !value.filesystem || value.filesystem.includes("\0")) fail("storage_quota_evidence_invalid");
  if (!Number.isSafeInteger(value.projectId) || value.projectId <= 0) fail("storage_quota_evidence_invalid");
  if (!Number.isSafeInteger(value.byteHardLimit) || value.byteHardLimit <= 0) fail("storage_quota_evidence_invalid");
  if (!Number.isSafeInteger(value.byteCurrent) || value.byteCurrent < 0 || value.byteCurrent > value.byteHardLimit) fail("storage_quota_evidence_invalid");
  if (!Number.isSafeInteger(value.inodeHardLimit) || value.inodeHardLimit <= 0) fail("storage_quota_evidence_invalid");
  if (!Number.isSafeInteger(value.inodeCurrent) || value.inodeCurrent < 0 || value.inodeCurrent > value.inodeHardLimit) fail("storage_quota_evidence_invalid");
  if (!Number.isSafeInteger(value.headroomBytes) || value.headroomBytes !== value.byteHardLimit - value.byteCurrent) fail("storage_quota_evidence_invalid");
  if (!Number.isSafeInteger(value.headroomInodes) || value.headroomInodes !== value.inodeHardLimit - value.inodeCurrent) fail("storage_quota_evidence_invalid");
  const probe = value.probe;
  if (!probe || typeof probe !== "object" || Array.isArray(probe)) fail("storage_quota_evidence_invalid");
  const probeActual = Object.keys(probe).sort();
  const probeWanted = [...STORAGE_QUOTA_PROBE_KEYS].sort();
  if (probeActual.length !== probeWanted.length || !probeActual.every((key, index) => key === probeWanted[index])) fail("storage_quota_evidence_invalid");
  if (probe.expectedErrorCode !== "EDQUOT") fail("storage_quota_evidence_invalid");
  if (probe.observedErrorCode !== "EDQUOT") fail("storage_quota_evidence_invalid");
  if (probe.exhausted !== true) fail("storage_quota_evidence_invalid");
  return Object.freeze({
    filesystem: value.filesystem,
    projectId: value.projectId,
    byteHardLimit: value.byteHardLimit,
    byteCurrent: value.byteCurrent,
    inodeHardLimit: value.inodeHardLimit,
    inodeCurrent: value.inodeCurrent,
    headroomBytes: value.headroomBytes,
    headroomInodes: value.headroomInodes,
    probe: Object.freeze({ expectedErrorCode: probe.expectedErrorCode, observedErrorCode: probe.observedErrorCode, exhausted: probe.exhausted === true })
  });
}
export function parseServiceSmokeReadback(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("service_smoke_readback_invalid");
  const actual = Object.keys(value).sort();
  const wanted = [...SERVICE_SMOKE_READBACK_KEYS].sort();
  if (actual.length !== wanted.length || !actual.every((key, index) => key === wanted[index])) fail("service_smoke_readback_invalid");
  if (!Number.isSafeInteger(value.serviceUid) || value.serviceUid <= 0) fail("service_smoke_readback_invalid");
  if (!Number.isSafeInteger(value.serviceGid) || value.serviceGid <= 0) fail("service_smoke_readback_invalid");
  if (typeof value.fixedNodePath !== "string" || !value.fixedNodePath || value.fixedNodePath.includes("\0")) fail("service_smoke_readback_invalid");
  if (value.noNetwork !== true) fail("service_smoke_readback_invalid");
  if (value.capabilityBoundingSet !== "") fail("service_smoke_readback_invalid");
  if (value.protectSystem !== "strict") fail("service_smoke_readback_invalid");
  if (value.protectHome !== true) fail("service_smoke_readback_invalid");
  if (value.privateDevices !== true) fail("service_smoke_readback_invalid");
  if (value.noNewPrivileges !== true) fail("service_smoke_readback_invalid");
  if (value.cgroupEmpty !== true) fail("service_smoke_readback_invalid");
  if (value.terminalActiveState !== "inactive") fail("service_smoke_readback_invalid");
  if (value.terminalSubState !== "dead") fail("service_smoke_readback_invalid");
  if (value.terminalResult !== "success") fail("service_smoke_readback_invalid");
  if (value.betterSqlite3Memory !== true || value.snapshotImport !== true) fail("service_smoke_readback_invalid");
  return Object.freeze({
    serviceUid: value.serviceUid,
    serviceGid: value.serviceGid,
    fixedNodePath: value.fixedNodePath,
    noNetwork: true,
    capabilityBoundingSet: "",
    protectSystem: "strict",
    protectHome: true,
    privateDevices: true,
    noNewPrivileges: true,
    cgroupEmpty: true,
    terminalActiveState: value.terminalActiveState,
    terminalSubState: value.terminalSubState,
    terminalResult: value.terminalResult,
    betterSqlite3Memory: true,
    snapshotImport: true
  });
}

function a3PhysicalContext(runLabel, supplied, smokePhase = "validation") {
  if (supplied?.platform !== "linux" || supplied?.requireRoot !== true || supplied?.allowA3PhysicalValidation !== true
    || typeof supplied.getuid !== "function" || supplied.getuid() !== 0 || typeof runLabel !== "string" || !A3_RUN_LABEL.test(runLabel)
    || !A3_SMOKE_PHASES.has(smokePhase)) fail("invalid_input");
  const tools = supplied.tools;
  if (!tools || typeof tools !== "object") fail("invalid_input");
  for (const [name, expected] of Object.entries(A3_PHYSICAL_TOOLS)) if (tools[name] !== expected) fail("invalid_input");
  const probeRoot = `${A3_VALIDATION_ROOT}/${runLabel}/probe`;
  const projectRoot = `${probeRoot}/project`;
  const deploymentRoot = `${projectRoot}/deployment`;
  const unit = `control-plane-a3-service-smoke-${runLabel}-${smokePhase}`;
  const visibleRoot = `${A3_SERVICE_SMOKE_BIND_ROOT}/${unit}/project`;
  return Object.freeze({ tools, probeRoot, projectRoot, deploymentRoot, unit, visibleRoot });
}

function executeA3Physical(command, args, supplied, condition, attentionRequired = false) {
  let observer = null;
  try {
    if (!Object.values(A3_PHYSICAL_TOOLS).includes(command) || !Array.isArray(args) || !args.every((value) => typeof value === "string" && !value.includes("\0"))) fail(condition, attentionRequired);
    if (supplied && typeof supplied.observePhysicalCommand === "function") {
      observer = supplied.observePhysicalCommand;
    }
    const execute = typeof supplied.executePhysicalCommand === "function"
      ? supplied.executePhysicalCommand
      : (path, argv) => {
          const trusted = tool(path, supplied);
          const result = spawnSync(trusted, argv, { env: CMD_ENV, encoding: "utf8", windowsHide: true, timeout: 15000, maxBuffer: 64 * 1024 });
          return { status: result.status, stdout: result.stdout, stderr: result.stderr, error: result.error };
        };
    const frozenArgs = Object.freeze([...args]);
        const startNs = observer ? process.hrtime.bigint() : null;
        const result = execute(command, frozenArgs);
        if (observer) {
          const elapsedMs = startNs !== null
            ? Number((process.hrtime.bigint() - startNs) / 1_000_000n)
            : null;
          try {
            observer({
              command,
              args: frozenArgs,
              status: result && typeof result.status === "number" ? result.status : null,
              stdout: result && typeof result.stdout === "string" ? result.stdout : "",
              stderr: result && typeof result.stderr === "string" ? result.stderr : "",
              error: result && result.error ? result.error : null,
              condition,
              elapsedMs
            });
          } catch {
            // observer is read-only; exceptions must not influence collector semantics
          }
        }
    if (!result || result.error || result.status !== 0 || typeof result.stdout !== "string" || typeof result.stderr !== "string"
      || Buffer.byteLength(result.stdout) > 64 * 1024 || Buffer.byteLength(result.stderr) > 64 * 1024) fail(condition, attentionRequired);
    return result.stdout;
  } catch (error) { if (error instanceof CandidateDependencyGateError) throw error; fail(condition, attentionRequired); }
}

function parseFindmntEvidence(bytes, expectedTarget) {
  const value = strictJsonObject(Buffer.from(bytes, "utf8"), "storage_quota_evidence_invalid");
  if (!keys(value, ["filesystems"]) || !Array.isArray(value.filesystems) || value.filesystems.length !== 1) fail("storage_quota_evidence_invalid");
  const filesystem = value.filesystems[0];
  if (!keys(filesystem, ["target", "source", "fstype", "options"]) || filesystem.target !== expectedTarget || filesystem.fstype !== "xfs"
    || typeof filesystem.source !== "string" || !/^\/dev\/loop[0-9]+$/.test(filesystem.source) || filesystem.source.includes("\0") || typeof filesystem.options !== "string"
    || !filesystem.options.split(",").some((option) => option === "pquota" || option === "prjquota")) fail("storage_quota_evidence_invalid");
  return filesystem.source;
}

function parseXfsQuotaReport(output, projectId, scale) {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length !== 1) fail("storage_quota_evidence_invalid");
  const fields = lines[0].split(/\s+/);
  const id = fields[0]?.replace(/^#/, "");
  if (fields.length < 4 || id !== String(projectId) || !fields.slice(1, 4).every((value) => /^[0-9]+$/.test(value))) fail("storage_quota_evidence_invalid");
  const current = Number(fields[1]), hard = Number(fields[3]);
  if (!Number.isSafeInteger(current) || !Number.isSafeInteger(hard) || hard <= 0 || current < 0 || current > hard
    || !Number.isSafeInteger(current * scale) || !Number.isSafeInteger(hard * scale)) fail("storage_quota_evidence_invalid");
  return Object.freeze({ current: current * scale, hard: hard * scale });
}

function localEdquotProbe(probeRoot, byteHardLimit) {
  if (!Number.isSafeInteger(byteHardLimit) || byteHardLimit <= 0 || byteHardLimit > 2 * 1024 * 1024) fail("storage_quota_evidence_invalid");
  const path = resolve(probeRoot, ".a3-edquot-probe");
  let descriptor;
  let created = false;
  let observedErrorCode = null;
  let cleanupFailed = false;
  try {
    descriptor = openSync(path, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW | fsConstants.O_CLOEXEC, 0o600);
    created = true;
    const chunk = Buffer.alloc(64 * 1024);
    for (let written = 0; written <= byteHardLimit + chunk.length; written += chunk.length) writeSync(descriptor, chunk);
  } catch (error) { observedErrorCode = error?.code || null; }
  finally {
    if (descriptor !== undefined) try { closeSync(descriptor); } catch { cleanupFailed = true; }
    if (created) try { unlinkSync(path); } catch { cleanupFailed = true; }
  }
  if (cleanupFailed) fail("storage_quota_evidence_invalid", true);
  return { expectedErrorCode: "EDQUOT", observedErrorCode, exhausted: observedErrorCode === "EDQUOT" };
}

export function collectStorageQuotaEvidence({ runLabel, projectId, runtime: supplied = runtime() } = {}) {
  const context = a3PhysicalContext(runLabel, supplied);
  if (!Number.isSafeInteger(projectId) || projectId <= 0) fail("storage_quota_evidence_invalid");
  const findmnt = executeA3Physical(context.tools.findmnt, ["--json", "--target", context.probeRoot, "--output", "TARGET,SOURCE,FSTYPE,OPTIONS"], supplied, "storage_quota_evidence_invalid");
  const filesystem = parseFindmntEvidence(findmnt, context.probeRoot);
  const project = executeA3Physical(context.tools.xfsIo, ["-c", "lsproj", context.probeRoot], supplied, "storage_quota_evidence_invalid");
  if (project.trim() !== `projid = ${projectId}`) fail("storage_quota_evidence_invalid");
  const projectCheck = executeA3Physical(context.tools.xfsQuota, ["-x", "-c", `project -c -p ${context.probeRoot} ${projectId}`, context.probeRoot], supplied, "storage_quota_evidence_invalid");
  if (projectCheck.trim() !== "") fail("storage_quota_evidence_invalid");
  const state = executeA3Physical(context.tools.xfsQuota, ["-x", "-c", "state -p", context.probeRoot], supplied, "storage_quota_evidence_invalid");
  if (!/^\s*Accounting:\s+ON\s*$/m.test(state) || !/^\s*Enforcement:\s+ON\s*$/m.test(state)) fail("storage_quota_evidence_invalid");
  const blockCommand = `report -p -b -n -N -L ${projectId} -U ${projectId}`;
  const inodeCommand = `report -p -i -n -N -L ${projectId} -U ${projectId}`;
  const blocks = parseXfsQuotaReport(executeA3Physical(context.tools.xfsQuota, ["-x", "-c", blockCommand, context.probeRoot], supplied, "storage_quota_evidence_invalid"), projectId, 1024);
  const inodes = parseXfsQuotaReport(executeA3Physical(context.tools.xfsQuota, ["-x", "-c", inodeCommand, context.probeRoot], supplied, "storage_quota_evidence_invalid"), projectId, 1);
  if (blocks.hard !== A3_PROBE_BYTE_HARD_LIMIT || inodes.hard !== A3_PROBE_INODE_HARD_LIMIT) fail("storage_quota_evidence_invalid");
  let probe;
  try {
    probe = typeof supplied.runEdquotProbe === "function"
      ? supplied.runEdquotProbe({ probeRoot: context.probeRoot, projectId, byteHardLimit: blocks.hard, inodeHardLimit: inodes.hard })
      : localEdquotProbe(context.probeRoot, blocks.hard);
  } catch { fail("storage_quota_evidence_invalid"); }
  return parseStorageQuotaEvidence({
    filesystem, projectId, byteHardLimit: blocks.hard, byteCurrent: blocks.current,
    inodeHardLimit: inodes.hard, inodeCurrent: inodes.current,
    headroomBytes: blocks.hard - blocks.current, headroomInodes: inodes.hard - inodes.current, probe
  });
}

export function buildServiceNativeSmokeInvocation({ runLabel, smokePhase = "validation", root, service, runtime: supplied = runtime() } = {}) {
  const context = a3PhysicalContext(runLabel, supplied, smokePhase);
  const allowedRoot = root === context.projectRoot || typeof root === "string" && root.startsWith(`${context.deploymentRoot}/`)
    && !root.includes("//") && !root.includes("/../") && !root.includes("/./") && !root.endsWith("/..") && !root.endsWith("/.") && !root.includes(":") && !root.includes("\0");
  if (!allowedRoot || !service || !Number.isSafeInteger(service.uid) || service.uid <= 0
    || !Number.isSafeInteger(service.gid) || service.gid <= 0) fail("invalid_input");
  const worker = fileURLToPath(new URL("./control-plane-dependency-artifact.mjs", import.meta.url));
  const visibleWorker = `${A3_SERVICE_SMOKE_BIND_ROOT}/${context.unit}/control-plane-dependency-artifact.mjs`;
  const bindReadOnlyPaths = [`${root}:${context.visibleRoot}:norbind`, `${worker}:${visibleWorker}:norbind`];
  const properties = [
    `User=${service.uid}`, `Group=${service.gid}`, "PrivateNetwork=yes", "RestrictAddressFamilies=AF_UNIX",
    "CapabilityBoundingSet=", "NoNewPrivileges=yes", "ProtectSystem=strict", "ProtectHome=yes",
    "PrivateDevices=yes", "PrivateTmp=yes", "ProtectControlGroups=yes", "Delegate=no", "Slice=system.slice",
    `BindReadOnlyPaths=${bindReadOnlyPaths.join(" ")}`, `WorkingDirectory=${context.visibleRoot}`
  ];
  return Object.freeze({
    command: context.tools.systemdRun,
    args: Object.freeze([`--unit=${context.unit}`, "--wait", "--pipe", "--quiet", "--service-type=exec", ...properties.map((value) => `--property=${value}`), "--", context.tools.node, visibleWorker, "--mode", "smoke", "--root", context.visibleRoot, "--snapshot", "scripts/control-plane-db-snapshot-gate.mjs"]),
    worker, visibleWorker, bindReadOnlyPaths: Object.freeze(bindReadOnlyPaths), unit: context.unit, visibleRoot: context.visibleRoot
  });
}

function parseServiceSmokeProcessOutput(stdout) {
  if (Buffer.byteLength(stdout) > 4096) fail("service_smoke_readback_invalid");
  const value = strictJsonObject(Buffer.from(stdout, "utf8"), "service_smoke_readback_invalid");
  if (!keys(value, ["schemaVersion", "type", "mode", "state", "smoke"]) || value.schemaVersion !== DEPENDENCY_ARTIFACT_SCHEMA_VERSION
    || value.type !== DEPENDENCY_ARTIFACT_TYPE || value.mode !== "smoke" || value.state !== "verified" || !keys(value.smoke, ["betterSqlite3Memory", "snapshotImport"])
    || value.smoke.betterSqlite3Memory !== true || value.smoke.snapshotImport !== true) fail("service_smoke_readback_invalid");
  return value.smoke;
}

export function collectServiceNativeSmokeEvidence({ runLabel, smokePhase = "validation", root, service, runtime: supplied = runtime() } = {}) {
  const context = a3PhysicalContext(runLabel, supplied, smokePhase);
  const invocation = buildServiceNativeSmokeInvocation({ runLabel, smokePhase, root, service, runtime: supplied });
  if (typeof supplied.executePhysicalCommand !== "function") {
    trusted(dirname(invocation.worker), supplied, "service_smoke_readback_invalid");
    regular(invocation.worker, supplied, "service_smoke_readback_invalid", null, true);
  }
  const smoke = parseServiceSmokeProcessOutput(executeA3Physical(invocation.command, invocation.args, supplied, "service_smoke_readback_invalid"));
  const terminalProperties = ["ActiveState", "SubState", "Result", "ExecMainStatus", "ControlGroup", "User", "Group", "PrivateNetwork", "CapabilityBoundingSet", "ProtectSystem", "ProtectHome", "PrivateDevices", "NoNewPrivileges", "BindReadOnlyPaths"];
  const terminal = executeA3Physical(context.tools.systemctl, ["show", `${context.unit}.service`, `--property=${terminalProperties.join(",")}`, "--no-page"], supplied, "worker_cleanup_uncertain", true);
  const values = {};
  for (const line of terminal.split(/\r?\n/).filter(Boolean)) {
    const index = line.indexOf("="); const name = index > 0 ? line.slice(0, index) : "";
    if (!terminalProperties.includes(name) || Object.prototype.hasOwnProperty.call(values, name)) fail("worker_cleanup_uncertain", true);
    values[name] = line.slice(index + 1);
  }
  const serviceUnit = `${context.unit}.service`, controlGroup = `/system.slice/${serviceUnit}`;
  const expectedBind = invocation.bindReadOnlyPaths.join(" ");
  if (!keys(values, terminalProperties) || values.ActiveState !== "inactive" || values.SubState !== "dead" || values.Result !== "success"
    || values.ExecMainStatus !== "0" || values.ControlGroup !== controlGroup || values.User !== String(service.uid) || values.Group !== String(service.gid)
    || values.PrivateNetwork !== "yes" || values.CapabilityBoundingSet !== "" || values.ProtectSystem !== "strict" || values.ProtectHome !== "yes"
    || values.PrivateDevices !== "yes" || values.NoNewPrivileges !== "yes" || values.BindReadOnlyPaths !== expectedBind) fail("worker_cleanup_uncertain", true);
  const read = typeof supplied.readPhysicalFile === "function" ? supplied.readPhysicalFile : (path) => readFileSync(path, "utf8");
  let events, procs;
  try {
    const cgroupRoot = `/sys/fs/cgroup/system.slice/${serviceUnit}`;
    events = read(`${cgroupRoot}/cgroup.events`); procs = read(`${cgroupRoot}/cgroup.procs`);
  } catch { fail("worker_cleanup_uncertain", true); }
  if (typeof events !== "string" || typeof procs !== "string" || !/(?:^|\n)populated 0(?:\n|$)/.test(events) || procs.trim() !== "") fail("worker_cleanup_uncertain", true);
  return parseServiceSmokeReadback({
    serviceUid: service.uid, serviceGid: service.gid, fixedNodePath: context.tools.node,
    noNetwork: true, capabilityBoundingSet: "", protectSystem: "strict", protectHome: true,
    privateDevices: true, noNewPrivileges: true, cgroupEmpty: true,
    terminalActiveState: values.ActiveState, terminalSubState: values.SubState, terminalResult: values.Result,
    betterSqlite3Memory: smoke.betterSqlite3Memory, snapshotImport: smoke.snapshotImport
  });
}

function runServiceNativeSmoke({ root, service, snapshotModule, runtime: supplied }) {
  if (supplied.requireRoot) fail("worker_storage_limit_unavailable");
  if (supplied.allowTestWorkerStorage !== true || typeof supplied.runServiceNativeSmoke !== "function") fail("service_smoke_runner_unavailable");
  const raw = supplied.runServiceNativeSmoke({ root, service, snapshotModule, fixedNodePath: supplied.tools.node });
  const readback = parseServiceSmokeReadback(raw);
  if (readback.serviceUid !== service.uid || readback.serviceGid !== service.gid) fail("service_smoke_readback_invalid");
  if (readback.fixedNodePath !== supplied.tools.node) fail("service_smoke_readback_invalid");
  return readback;
}
export function createCandidateDependencyGateTestRuntime(overrides = {}) { return runtime({ platform: "linux", requireRoot: false, enforceOwnership: false, ...overrides }); }
export function createCandidateDependencyGateA3PhysicalValidationRuntime({ runLabel, projectId, overrides = {} } = {}) {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) fail("invalid_input");
  const physical = runtime({
    ...overrides,
    platform: "linux",
    requireRoot: true,
    enforceOwnership: true,
    allowA3PhysicalValidation: true,
    tools: { ...PRODUCTION_TRANSIENT_TOOLS, ...A3_PHYSICAL_TOOLS }
  });
  const context = a3PhysicalContext(runLabel, physical);
  if (!Number.isSafeInteger(projectId) || projectId <= 0) fail("invalid_input");
  let publishedSmokeCount = 0;
  return runtime({
    ...overrides,
    root: context.deploymentRoot,
    platform: "linux",
    requireRoot: false,
    enforceOwnership: true,
    allowA3PhysicalValidation: true,
    allowSyntheticA3Evidence: false,
    allowTestWorkerStorage: true,
    a3ProjectRoot: context.projectRoot,
    a3ProjectId: projectId,
    tools: { ...PRODUCTION_TRANSIENT_TOOLS },
    collectStorageQuotaEvidence: () => collectStorageQuotaEvidence({ runLabel, projectId, runtime: physical }),
    runServiceNativeSmoke: ({ root, service }) => {
      const smokePhase = root.includes("/dependency-staging/") ? "prepublish" : publishedSmokeCount++ === 0 ? "postpublish" : "verify";
      return collectServiceNativeSmokeEvidence({ runLabel, smokePhase, root, service, runtime: physical });
    }
  });
}
export function runCandidateDependencyA3PhysicalValidation({ mode, runLabel, projectId, serviceUid, serviceGid, overrides = {} } = {}) {
  if (!new Set(["quota", "smoke"]).has(mode)) fail("invalid_input");
  const validation = createCandidateDependencyGateA3PhysicalValidationRuntime({ runLabel, projectId, overrides });
  if (mode === "quota") return Object.freeze({ mode, evidence: validation.collectStorageQuotaEvidence() });
  if (!Number.isSafeInteger(serviceUid) || serviceUid <= 0 || !Number.isSafeInteger(serviceGid) || serviceGid <= 0) fail("invalid_input");
  return Object.freeze({
    mode,
    evidence: validation.runServiceNativeSmoke({
      root: validation.a3ProjectRoot,
      service: Object.freeze({ uid: serviceUid, gid: serviceGid })
    })
  });
}
function requireRoot(runtime) { if (runtime.platform !== "linux") fail("unsupported_platform"); if (runtime.requireRoot && runtime.getuid() !== 0) fail("privilege_invalid"); }
function transientTools(supplied) {
  const tools = supplied?.tools;
  if (!tools || typeof tools !== "object") fail("invalid_input");
  for (const [name, trustedPath] of Object.entries(PRODUCTION_TRANSIENT_TOOLS)) {
    if (!supplied.requireRoot && !(name in tools)) continue;
    if (typeof tools[name] !== "string" || supplied.requireRoot && tools[name] !== trustedPath) fail("invalid_input");
  }
  return tools;
}

function unitKind(unit) {
  if (typeof unit !== "string") fail("invalid_input");
  for (const kind of Object.keys(WORKER_INPUT_LAYOUT)) if ((new RegExp(`^control-plane-candidate-dependency-${kind}-[a-z0-9][a-z0-9-]{0,180}$`)).test(unit)) return kind;
  fail("invalid_input");
}
function transientRoots(supplied) {
  const roots = { stateRoot: supplied.stateRoot, statePublicRoot: supplied.statePublicRoot, workerInputRoot: supplied.workerInputRoot };
  if (!Object.values(roots).every((path) => typeof path === "string" && isAbsolute(path))) fail("invalid_input");
  if (supplied.requireRoot && (!same(roots.stateRoot, STATE_ROOT) || !same(roots.statePublicRoot, STATE_PUBLIC_ROOT) || !same(roots.workerInputRoot, WORKER_INPUT_ROOT))) fail("invalid_input");
  const result = Object.fromEntries(Object.entries(roots).map(([name, path]) => [name, abs(path)]));
  if (dirname(result.stateRoot) !== result.statePublicRoot || basename(result.stateRoot) !== "private" || within(result.statePublicRoot, result.workerInputRoot) || within(result.workerInputRoot, result.statePublicRoot)) fail("invalid_input");
  return Object.freeze(result);
}
function transientPaths(kind, unit, supplied) {
  if (unitKind(unit) !== kind) fail("invalid_input"); const roots = transientRoots(supplied);
  const hostStateDirectory = resolve(roots.stateRoot, unit), publicStateDirectory = resolve(roots.statePublicRoot, unit), workerInputDirectory = resolve(roots.workerInputRoot, unit);
  if (![hostStateDirectory, publicStateDirectory, workerInputDirectory].every((path, index) => inside([roots.stateRoot, roots.statePublicRoot, roots.workerInputRoot][index], path) && dirname(path) === [roots.stateRoot, roots.statePublicRoot, roots.workerInputRoot][index])) fail("invalid_input");
  return Object.freeze({ roots, hostStateDirectory, publicStateDirectory, workerInputDirectory });
}
function expectedWorkerInput(kind, unit, supplied) {
  const paths = transientPaths(kind, unit, supplied), layout = WORKER_INPUT_LAYOUT[kind];
  if (!layout) fail("invalid_input");
  const entries = Object.freeze(layout.map((entry) => Object.freeze({ ...entry, path: resolve(paths.workerInputDirectory, entry.name) })));
  return Object.freeze({ ...paths, entries, files: Object.freeze(entries.map((entry) => entry.path)) });
}

function smokeBindReadOnly(kind, unit, input) {
  if (kind !== "smoke") return null;
  const source = input[0], target = resolve(SMOKE_BIND_ROOT, unit, "sealed-node-modules-tree");
  if (!inside(SMOKE_BIND_ROOT, target) || dirname(target) !== resolve(SMOKE_BIND_ROOT, unit)) fail("invalid_input");
  return Object.freeze({ source, target, property: `BindReadOnlyPaths=${source}:${target}` });
}

function workerInputBindReadOnly(kind, unit, supplied) {
  const { workerInputDirectory } = transientPaths(kind, unit, supplied);
  const target = resolve(WORKER_INPUT_BIND_ROOT, unit);
  if (!inside(WORKER_INPUT_BIND_ROOT, target) || dirname(target) !== abs(WORKER_INPUT_BIND_ROOT)) fail("invalid_input");
  return Object.freeze({ source: workerInputDirectory, target, property: `BindReadOnlyPaths=${workerInputDirectory}:${target}:norbind` });
}

export function buildTransientUnitInvocation(request = {}) {
  const { kind, unit, input, runtime: supplied = runtime() } = request;
  if (!request || typeof request !== "object" || Object.prototype.hasOwnProperty.call(request, "stateDirectory") || !Object.prototype.hasOwnProperty.call(WORKER_INPUT_LAYOUT, kind) || !Array.isArray(input)) fail("invalid_input");
  const tools = transientTools(supplied);
  const { hostStateDirectory, publicStateDirectory, workerInputDirectory, roots, entries, files: expectedInput } = expectedWorkerInput(kind, unit, supplied);
  if (input.length !== expectedInput.length || new Set(input).size !== input.length || !input.every((path, index) => typeof path === "string" && isAbsolute(path) && same(path, expectedInput[index]))) fail("invalid_input");
  const inputBinding = workerInputBindReadOnly(kind, unit, supplied);
  const visibleInput = Object.freeze(entries.map((entry) => resolve(inputBinding.target, entry.name)));
  const smokeBinding = smokeBindReadOnly(kind, unit, input);
  const workerArgs = kind === "build" ? ["--mode", "build", "--package-json", visibleInput[0], "--package-lock", visibleInput[1]] : kind === "extract" ? ["--mode", "extract", "--archive", visibleInput[0]] : ["--mode", "smoke", "--sealed-tree", smokeBinding.target, "--sqlite-fixture", visibleInput[1], "--metadata", visibleInput[2]];
  const environment = [
    "PATH=/usr/bin:/bin", "LC_ALL=C", "LANG=C", `STATE_DIRECTORY=${publicStateDirectory}`,
    `HOME=${resolve(publicStateDirectory, "home")}`, `npm_config_cache=${resolve(publicStateDirectory, "cache")}`, `npm_config_prefix=${resolve(publicStateDirectory, "prefix")}`,
    `TMPDIR=${resolve(publicStateDirectory, "tmp")}`, "npm_config_globalconfig=/dev/null"
  ];
  const privateNpmDirectories = Object.freeze({
    home: resolve(publicStateDirectory, "home"), cache: resolve(publicStateDirectory, "cache"),
    prefix: resolve(publicStateDirectory, "prefix"), tmp: resolve(publicStateDirectory, "tmp")
  });
  if (!Object.values(privateNpmDirectories).every((path) => inside(publicStateDirectory, path))) fail("invalid_input");
  return {
    command: tools.systemdRun,
    args: [`--unit=${unit}`, "--wait", "--quiet", "--service-type=exec", ...TRANSIENT_PROPERTIES.map((property) => `--property=${property}`), `--property=${inputBinding.property}`, ...(smokeBinding ? [`--property=${smokeBinding.property}`] : []), `--property=StateDirectory=${unit}`, "--", tools.env, "-i", ...environment, tools.node, fileURLToPath(import.meta.url), "--worker", ...workerArgs],
    contract: Object.freeze({
      paths: Object.freeze({ hostStateDirectory, publicStateDirectory, workerInputDirectory, privateNpmDirectories }),
      prelaunchInputCustody: Object.freeze({ phase: "before_launch", trustedParentChain: true, rootOwned: true, noGroupOtherWrite: true, inputs: Object.freeze(entries.map((entry) => Object.freeze({ path: entry.path, type: entry.type, nlink: entry.singleLink ? 1 : null }))), ...(kind === "smoke" ? { sealedTreeEvidence: Object.freeze({ algorithm: "sha256", recursiveNoFollow: true, noMountCrossing: true, requirePriorSeize: true }) } : {}) }),
      workerInputBindReadOnly: inputBinding,
      smokeBindReadOnly: smokeBinding,
      stateTopology: Object.freeze({ publicMustResolveToHost: true, privateParent: roots.stateRoot }),
      cgroupReadback: Object.freeze({ serviceUnit: `${unit}.service`, controlGroup: `/system.slice/${unit}.service`, activeState: "inactive", subState: "dead", result: "success", execMainStatus: 0, controlGroupRequired: true, cgroupEventsPopulated: 0, cgroupProcsEmpty: true }),
      seize: Object.freeze({ hostPath: hostStateDirectory, afterCgroupEmpty: true, owner: 0, gid: 0, mode: "0700", noSymlink: true, beforeRecursiveAudit: true }),
      workerPostcondition: Object.freeze({ stateDirectoryEnvironment: "STATE_DIRECTORY", privateRuntimeMode: "0700", rootOwnedAfterSeize: true, privateNpmDirectories })
    })
  };
}

const matchesPath = (actual, expected) => typeof actual === "string" && same(actual, expected);
const exactPathType = (value, path, type) => Boolean(value && typeof value === "object" && matchesPath(value.path, path) && matchesPath(value.realpath, path) && value.type === type);
function exactCustody(value, path, type, file = false, exactMode = null, owner = null) {
  return Boolean(exactPathType(value, path, type) && (!owner || value.uid === owner.uid && value.gid === owner.gid) && typeof value.mode === "string" && /^0[0-7]{3}$/.test(value.mode) && (Number.parseInt(value.mode, 8) & 0o022) === 0 && (exactMode === null || value.mode === exactMode) && (!file || value.nlink === 1));
}
const evidenceOwner = (supplied) => supplied.requireRoot ? { uid: 0, gid: 0 } : null;
export function stateTopologyReadback({ unit, runtime: supplied = runtime(), observed } = {}) {
  const kind = unitKind(unit), { hostStateDirectory, publicStateDirectory, roots } = transientPaths(kind, unit, supplied);
  if (!observed || typeof observed !== "object" || !observed.public || !matchesPath(observed.public.path, publicStateDirectory) || !matchesPath(observed.public.realpath, hostStateDirectory) || observed.public.type !== "symbolicLink" || !exactPathType(observed.host, hostStateDirectory, "directory") || !exactCustody(observed.privateParent, roots.stateRoot, "directory", false, "0700", evidenceOwner(supplied))) fail("worker_readback_invalid");
  return Object.freeze({ hostStateDirectory, publicStateDirectory, privateParent: roots.stateRoot });
}
export function workerInputCustodyReadback({ kind, unit, runtime: supplied = runtime(), observed } = {}) {
  const { roots, workerInputDirectory, entries, files } = expectedWorkerInput(kind, unit, supplied);
  const owner = evidenceOwner(supplied);
  if (!observed || typeof observed !== "object" || !exactCustody(observed.root, roots.workerInputRoot, "directory", false, "0700", owner) || !exactCustody(observed.directory, workerInputDirectory, "directory", false, "0711", owner) || !Array.isArray(observed.files) || observed.files.length !== files.length || !observed.files.every((entry, index) => exactCustody(entry, entries[index].path, entries[index].type, entries[index].singleLink, entries[index].exactMode, owner))) fail("worker_input_custody_invalid");
  const sealedTreeEvidence = kind === "smoke" ? validSealedTreeEvidence(entries[0].path, observed.sealedTreeEvidence) : null;
  return Object.freeze({ workerInputDirectory, files, ...(sealedTreeEvidence ? { sealedTreeEvidence } : {}) });
}
export function transientUnitReadback({ unit, observed } = {}) {
  unitKind(unit); const serviceUnit = `${unit}.service`;
  if (!observed || typeof observed !== "object" || observed.serviceUnit !== serviceUnit || observed.activeState !== "inactive" || observed.subState !== "dead" || typeof observed.result !== "string" || !Number.isSafeInteger(observed.execMainStatus) || observed.execMainStatus < 0 || observed.controlGroup !== `/system.slice/${serviceUnit}` || observed.cgroupEventsPopulated !== 0 || !Array.isArray(observed.cgroupProcs) || observed.cgroupProcs.length !== 0) fail("worker_cleanup_uncertain", true);
  return Object.freeze({ succeeded: observed.result === "success" && observed.execMainStatus === 0, cleanupAllowed: true });
}
export function terminalReadbackAfterLaunch({ unit, read } = {}) {
  unitKind(unit);
  try {
    if (typeof read !== "function") fail("worker_cleanup_uncertain", true);
    return transientUnitReadback({ unit, observed: read() });
  } catch { fail("worker_cleanup_uncertain", true); }
}
function systemctlTerminalFields(unit, output) {
  const expected = ["ActiveState", "SubState", "Result", "ExecMainStatus", "ControlGroup"], values = {};
  if (typeof output !== "string") fail("worker_adapter_unavailable");
  for (const line of output.split(/\r?\n/)) {
    if (!line) continue; const index = line.indexOf("="), name = index > 0 ? line.slice(0, index) : "";
    if (!expected.includes(name) || Object.prototype.hasOwnProperty.call(values, name)) fail("worker_adapter_unavailable");
    values[name] = line.slice(index + 1);
  }
  if (!keys(values, expected) || !/^\d+$/.test(values.ExecMainStatus) || !Number.isSafeInteger(Number(values.ExecMainStatus)) || values.ControlGroup !== `/system.slice/${unit}.service`) fail("worker_adapter_unavailable");
  return values;
}
export function parseProductionTransientReadback({ unit, systemctlOutput, cgroupEvents, cgroupProcs } = {}) {
  unitKind(unit); const values = systemctlTerminalFields(unit, systemctlOutput);
  if (typeof cgroupEvents !== "string" || typeof cgroupProcs !== "string") fail("worker_adapter_unavailable");
  const populated = cgroupEvents.split(/\r?\n/).filter(Boolean).map((line) => /^populated ([01])$/.exec(line)).filter(Boolean);
  if (populated.length !== 1) fail("worker_adapter_unavailable");
  const procs = cgroupProcs.split(/\r?\n/).filter(Boolean); if (!procs.every((pid) => /^[1-9][0-9]*$/.test(pid))) fail("worker_adapter_unavailable");
  return Object.freeze({ serviceUnit: `${unit}.service`, activeState: values.ActiveState, subState: values.SubState, result: values.Result, execMainStatus: Number(values.ExecMainStatus), controlGroup: values.ControlGroup, cgroupEventsPopulated: Number(populated[0][1]), cgroupProcs: Object.freeze(procs) });
}
function productionTransientLaunch(invocation, supplied) {
  try {
    const tools = transientTools(supplied);
    tool(tools.env, supplied); tool(tools.node, supplied); tool(tools.npm, supplied); tool(tools.tar, supplied);
    const command = tool(tools.systemdRun, supplied), result = spawnSync(command, invocation.args, { env: CMD_ENV, encoding: "utf8", windowsHide: true });
    if (result.error || !Number.isSafeInteger(result.status) || result.status < 0) fail("worker_adapter_unavailable"); return { status: result.status };
  } catch { fail("worker_adapter_unavailable"); }
}
function productionTransientReadback(unit, supplied) {
  try {
    const command = tool(transientTools(supplied).systemctl, supplied), result = spawnSync(command, ["show", `${unit}.service`, "--property=ActiveState,SubState,Result,ExecMainStatus,ControlGroup", "--no-page"], { env: CMD_ENV, encoding: "utf8", windowsHide: true });
    if (result.error || result.status !== 0) fail("worker_adapter_unavailable"); systemctlTerminalFields(unit, result.stdout);
    const cgroup = resolve("/sys/fs/cgroup", "system.slice", `${unit}.service`), events = readFileSync(resolve(cgroup, "cgroup.events"), "utf8"), procs = readFileSync(resolve(cgroup, "cgroup.procs"), "utf8");
    return parseProductionTransientReadback({ unit, systemctlOutput: result.stdout, cgroupEvents: events, cgroupProcs: procs });
  } catch { fail("worker_adapter_unavailable"); }
}

function workerEnvironment(env) {
  if (!env || typeof env !== "object" || Array.isArray(env)) fail("worker_environment_invalid");
  const stateDirectory = env.STATE_DIRECTORY, allowed = ["PATH", "LC_ALL", "LANG", "STATE_DIRECTORY", "HOME", "npm_config_cache", "npm_config_prefix", "TMPDIR", "npm_config_globalconfig"];
  if (Object.keys(env).length !== allowed.length || Object.keys(env).some((name) => !allowed.includes(name)) || typeof stateDirectory !== "string" || !isAbsolute(stateDirectory)) fail("worker_environment_invalid");
  const privateNpmDirectories = Object.freeze({ home: resolve(stateDirectory, "home"), cache: resolve(stateDirectory, "cache"), prefix: resolve(stateDirectory, "prefix"), tmp: resolve(stateDirectory, "tmp") });
  if (env.PATH !== "/usr/bin:/bin" || env.LC_ALL !== "C" || env.LANG !== "C" || env.HOME !== privateNpmDirectories.home || env.npm_config_cache !== privateNpmDirectories.cache || env.npm_config_prefix !== privateNpmDirectories.prefix || env.TMPDIR !== privateNpmDirectories.tmp || env.npm_config_globalconfig !== "/dev/null" || !Object.values(privateNpmDirectories).every((path) => inside(stateDirectory, path))) fail("worker_environment_invalid");
  return Object.freeze({ stateDirectory, privateNpmDirectories });
}

function workerUnitIs(kind, unit) {
  try { return unitKind(unit) === kind; } catch { return false; }
}

export function parseCandidateDependencyWorker({ argv, env } = {}) {
  const environment = workerEnvironment(env);
  if (!Array.isArray(argv) || !argv.every((item) => typeof item === "string")) fail("worker_input_invalid");
  let mode, input;
  if (argv.length === 6 && argv[0] === "--mode" && argv[1] === "build" && argv[2] === "--package-json" && argv[4] === "--package-lock") {
    const [packageJson, packageLock] = [argv[3], argv[5]];
    const unit = basename(dirname(packageJson)), inputDirectory = resolve(WORKER_INPUT_BIND_ROOT, unit);
    if (!isAbsolute(packageJson) || !isAbsolute(packageLock) || !workerUnitIs("build", unit) || basename(environment.stateDirectory) !== unit || !same(dirname(packageJson), inputDirectory) || basename(packageJson) !== "package.json" || basename(packageLock) !== "package-lock.json" || !same(dirname(packageJson), dirname(packageLock)) || same(packageJson, packageLock)) fail("worker_input_invalid");
    mode = "build"; input = Object.freeze({ packageJson, packageLock });
  } else if (argv.length === 4 && argv[0] === "--mode" && argv[1] === "extract" && argv[2] === "--archive") {
    const archive = argv[3], unit = basename(dirname(archive)); if (!isAbsolute(archive) || !workerUnitIs("extract", unit) || basename(environment.stateDirectory) !== unit || !same(dirname(archive), resolve(WORKER_INPUT_BIND_ROOT, unit)) || basename(archive) !== WORKER_INPUT_LAYOUT.extract[0].name) fail("worker_input_invalid"); mode = "extract"; input = Object.freeze({ archive });
  } else if (argv.length === 8 && argv[0] === "--mode" && argv[1] === "smoke" && argv[2] === "--sealed-tree" && argv[4] === "--sqlite-fixture" && argv[6] === "--metadata") {
    const [sealedTree, sqliteFixture, metadata] = [argv[3], argv[5], argv[7]], [tree, fixture, manifest] = WORKER_INPUT_LAYOUT.smoke;
    const smokeUnit = basename(dirname(sealedTree)), inputDirectory = resolve(WORKER_INPUT_BIND_ROOT, smokeUnit);
    if (![sealedTree, sqliteFixture, metadata].every(isAbsolute) || !workerUnitIs("smoke", smokeUnit) || basename(environment.stateDirectory) !== smokeUnit || !same(sealedTree, resolve(SMOKE_BIND_ROOT, smokeUnit, tree.name)) || basename(sqliteFixture) !== fixture.name || basename(metadata) !== manifest.name || !same(dirname(sqliteFixture), dirname(metadata)) || !same(dirname(sqliteFixture), inputDirectory) || new Set([sealedTree, sqliteFixture, metadata]).size !== 3) fail("worker_input_invalid");
    mode = "smoke"; input = Object.freeze({ sealedTree, sqliteFixture, metadata });
  } else fail("worker_input_invalid");
  return Object.freeze({ mode, input, ...environment });
}
function localWorkerOperations() {
  return {
    getuid: () => process.getuid?.(), getgid: () => process.getgid?.(),
    mkdir: (path) => mkdirSync(path, { mode: 0o700 }), chmod: (path, value) => chmodSync(path, value),
    fsync: (path) => fsync(path, "worker_execution_failed"),
    lstat: (path) => { const metadata = lstatSync(path); return { type: metadata.isDirectory() ? "directory" : metadata.isSymbolicLink() ? "symbolicLink" : metadata.isFile() ? "file" : "other", mode: (mode(metadata) & 0o777).toString(8).padStart(4, "0") }; },
    copyFile: (source, destination) => copyFileSync(source, destination),
    run: (command, args, options) => {
      const result = spawnSync(command, args, { ...options, stdio: "ignore", windowsHide: true });
      return { status: result.status, error: Boolean(result.error) };
    }
  };
}
export function prepareCandidateDependencyWorker({ argv, env, operations = localWorkerOperations() } = {}) {
  const parsed = parseCandidateDependencyWorker({ argv, env });
  if (!operations || typeof operations.mkdir !== "function" || typeof operations.chmod !== "function" || typeof operations.lstat !== "function") fail("worker_private_directory_invalid");
  const privateDirectories = Object.freeze([...Object.values(parsed.privateNpmDirectories), resolve(parsed.stateDirectory, parsed.mode === "build" ? "work" : parsed.mode === "extract" ? "extract" : "smoke")]);
  try {
    for (const path of privateDirectories) {
      operations.mkdir(path); operations.chmod(path, 0o700); const observed = operations.lstat(path);
      if (!observed || observed.type !== "directory" || observed.mode !== "0700") fail("worker_private_directory_invalid");
    }
  } catch (error) { if (error instanceof CandidateDependencyGateError) throw error; fail("worker_private_directory_invalid"); }
  return Object.freeze({ mode: parsed.mode, input: parsed.input, stateDirectory: parsed.stateDirectory, privateDirectories });
}

function assertUnprivilegedWorker(operations) {
  const uid = typeof operations?.getuid === "function" ? operations.getuid() : undefined;
  const gid = typeof operations?.getgid === "function" ? operations.getgid() : undefined;
  if (!Number.isSafeInteger(uid) || !Number.isSafeInteger(gid) || uid <= 0 || gid <= 0) fail("worker_execution_failed");
}

export function runCandidateDependencyWorker({ argv = process.argv.slice(3), env = process.env, operations = localWorkerOperations() } = {}) {
  assertUnprivilegedWorker(operations);
  const parsed = parseCandidateDependencyWorker({ argv, env });
  if (parsed.mode !== "build") fail("worker_execution_failed");
  // A DynamicUser StateDirectory has no hard aggregate storage limit in the
  // currently supported host contract. Do not execute npm lifecycle code until
  // a separately verified quota-backed worker storage boundary is integrated.
  fail("worker_storage_limit_unavailable");
}
function physicalObservation(path, condition) {
  try {
    const metadata = lstatSync(path), realpath = realpathSync(path), type = metadata.isSymbolicLink() ? "symbolicLink" : metadata.isDirectory() ? "directory" : metadata.isFile() ? "file" : "other";
    return Object.freeze({ path, realpath, type, uid: metadata.uid, gid: metadata.gid, mode: (mode(metadata) & 0o777).toString(8).padStart(4, "0"), nlink: metadata.nlink });
  } catch { fail(condition); }
}
function sealedNodeControlled(metadata, supplied, condition, symlink = false) {
  if (!metadata || (supplied.requireRoot && (metadata.uid !== 0 || metadata.gid !== 0)) || !symlink && ((mode(metadata) & 0o7022) !== 0)) fail(condition);
}
function sealedRecord(digest, relativePath, type, metadata, payload = "") {
  digest.update(JSON.stringify([relativePath, type, mode(metadata) & 0o777, metadata.uid, metadata.gid, payload]));
  digest.update("\n");
}
function validSealedTreeEvidence(treePath, evidence) {
  if (!evidence || typeof evidence !== "object" || !same(evidence.treeRoot, treePath) || !HASH.test(evidence.digest || "") || !Number.isSafeInteger(evidence.entryCount) || evidence.entryCount < 1) fail("worker_input_custody_invalid");
  return Object.freeze({ treeRoot: abs(treePath), digest: evidence.digest, entryCount: evidence.entryCount });
}
function sealedTreeLimits(supplied) {
  const value = supplied.requireRoot ? SEALED_TREE_LIMITS : supplied.sealedTreeLimits || SEALED_TREE_LIMITS;
  if (!value || typeof value !== "object" || !["maxDepth", "maxEntries", "maxHashBytes"].every((key) => Number.isSafeInteger(value[key]) && value[key] > 0)) fail("worker_input_custody_invalid");
  return value;
}
function sealedAclCapabilities(root, supplied, recursive = false, condition = "worker_input_custody_invalid") {
  try {
    if (!supplied.requireRoot && typeof supplied.checkAclCapabilities === "function") {
      if (supplied.checkAclCapabilities({ root, recursive }) !== true) fail(condition);
      return;
    }
    if (supplied.requireRoot) transientTools(supplied);
    const aclArgs = ["--physical", "--absolute-names", "--omit-header", ...(recursive ? ["--recursive"] : []), "--", root];
    const acl = spawnSync(tool(supplied.tools.getfacl, supplied), aclArgs, { env: CMD_ENV, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, windowsHide: true });
    if (acl.error || acl.status !== 0 || !String(acl.stdout || "").split(/\r?\n/).every((line) => !line || /^(?:user::|group::|other::)[rwx-]{3}(?:\s+#effective:[rwx-]{3})?$/.test(line))) fail(condition);
    const cap = spawnSync(tool(supplied.tools.getcap, supplied), [...(recursive ? ["-r"] : []), "--", root], { env: CMD_ENV, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, windowsHide: true });
    if (cap.error || cap.status !== 0 || String(cap.stdout || "").trim()) fail(condition);
  } catch (error) { if (error instanceof CandidateDependencyGateError) throw error; fail(condition); }
}
function sealedInputAclCapabilities(roots, workerInputDirectory, entries, supplied) {
  for (const path of ancestors(roots.workerInputRoot)) sealedAclCapabilities(path, supplied);
  sealedAclCapabilities(workerInputDirectory, supplied);
  for (const entry of entries) sealedAclCapabilities(entry.path, supplied, entry.type === "directory");
}
function trustedAclAncestorChain(path, supplied, condition) {
  for (const segment of ancestors(path)) {
    directory(segment, supplied, condition);
    sealedAclCapabilities(segment, supplied, false, condition);
  }
}
function sealedTreeNames(path, state, limits, childDepth) {
  let directory;
  const names = [];
  try {
    directory = opendirSync(path, { encoding: "buffer", bufferSize: 64 });
    for (;;) {
      const entry = directory.readSync();
      if (entry === null) break;
      if (childDepth > limits.maxDepth || state.entryCount + state.pendingCount + names.length + 1 > limits.maxEntries) fail("worker_input_custody_invalid");
      const bytes = entry.name;
      if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.includes(0)) fail("worker_input_custody_invalid");
      const name = bytes.toString("utf8");
      if (!Buffer.from(name, "utf8").equals(bytes) || name === "." || name === ".." || basename(name) !== name) fail("worker_input_custody_invalid");
      names.push(Object.freeze({ name, bytes }));
    }
  } catch (error) { if (error instanceof CandidateDependencyGateError) throw error; fail("worker_input_custody_invalid"); }
  finally { if (directory) try { directory.closeSync(); } catch { fail("worker_input_custody_invalid"); } }
  return names.sort((left, right) => Buffer.compare(left.bytes, right.bytes));
}
function reserveSealedBytes(state, value, limits) {
  if (!Number.isSafeInteger(value) || value < 0 || value > limits.maxHashBytes - state.hashBytes) fail("worker_input_custody_invalid");
  state.hashBytes += value;
}
function sealedFileHash(path, metadata) {
  let descriptor;
  try {
    descriptor = openSync(path, "r");
    const digest = createHash("sha256"), buffer = Buffer.allocUnsafe(Math.min(64 * 1024, Math.max(1, metadata.size)));
    let offset = 0;
    while (offset < metadata.size) {
      const count = readSync(descriptor, buffer, 0, Math.min(buffer.length, metadata.size - offset), offset);
      if (!Number.isSafeInteger(count) || count <= 0) fail("worker_input_custody_invalid");
      digest.update(buffer.subarray(0, count)); offset += count;
    }
    const final = lstatSync(path);
    if (final.isSymbolicLink() || !final.isFile() || final.dev !== metadata.dev || final.ino !== metadata.ino || final.size !== metadata.size || final.nlink !== metadata.nlink) fail("worker_input_custody_invalid");
    return digest.digest("hex");
  } catch (error) { if (error instanceof CandidateDependencyGateError) throw error; fail("worker_input_custody_invalid"); }
  finally { if (descriptor !== undefined) closeSync(descriptor); }
}
function scanSealedSmokeTree(treePath, supplied, includeDigest) {
  try {
    const root = abs(treePath), rootMetadata = lstatSync(root), treeRoot = realpathSync(root);
    if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory() || !same(root, treeRoot)) fail("worker_input_custody_invalid");
    mounts([treeRoot], supplied);
    const rootDev = rootMetadata.dev, digest = includeDigest ? createHash("sha256") : null, limits = sealedTreeLimits(supplied), state = { entryCount: 0, pendingCount: 1, hashBytes: 0 };
    const todo = [{ path: root, relativePath: ".", depth: 0 }];
    while (todo.length) {
      const { path, relativePath, depth } = todo.pop();
      state.pendingCount -= 1;
      const metadata = lstatSync(path), isLink = metadata.isSymbolicLink();
      if (metadata.dev !== rootDev) fail("worker_input_custody_invalid");
      sealedNodeControlled(metadata, supplied, "worker_input_custody_invalid", isLink);
      if (++state.entryCount > limits.maxEntries || depth > limits.maxDepth) fail("worker_input_custody_invalid");
      if (metadata.isDirectory() && !isLink) {
        if (digest) sealedRecord(digest, relativePath, "directory", metadata);
        const names = sealedTreeNames(path, state, limits, depth + 1);
        for (const entry of names.reverse()) {
          const child = resolve(path, entry.name); if (!inside(treeRoot, child)) fail("worker_input_custody_invalid");
          todo.push({ path: child, relativePath: relativePath === "." ? entry.name : `${relativePath}/${entry.name}`, depth: depth + 1 }); state.pendingCount += 1;
        }
      } else if (metadata.isFile() && !isLink) {
        if (metadata.nlink !== 1) fail("worker_input_custody_invalid");
        reserveSealedBytes(state, metadata.size, limits);
        if (digest) sealedRecord(digest, relativePath, "file", metadata, `${metadata.size}:${sealedFileHash(path, metadata)}`);
      } else if (isLink) {
        const target = readlinkSync(path), targetRoot = realpathSync(path), targetMetadata = lstatSync(targetRoot);
        if (!within(treeRoot, targetRoot) || targetMetadata.dev !== rootDev || (!targetMetadata.isDirectory() && !targetMetadata.isFile()) || targetMetadata.isFile() && targetMetadata.nlink !== 1) fail("worker_input_custody_invalid");
        sealedNodeControlled(targetMetadata, supplied, "worker_input_custody_invalid");
        reserveSealedBytes(state, Buffer.byteLength(target), limits);
        if (digest) sealedRecord(digest, relativePath, "symlink", metadata, `${target}:${relative(treeRoot, targetRoot)}`);
      } else fail("worker_input_custody_invalid");
    }
    return Object.freeze({ treeRoot: root, ...(digest ? { digest: digest.digest("hex") } : {}), entryCount: state.entryCount });
  } catch (error) { if (error instanceof CandidateDependencyGateError) throw error; fail("worker_input_custody_invalid"); }
}
export function parseSealedSmokeTreeAudit(bytes, treePath, includeDigest) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 4096 || bytes[bytes.length - 1] !== 0x0a || bytes.subarray(0, bytes.length - 1).includes(0x0a)) fail("worker_input_custody_invalid");
  const value = strictJsonObject(bytes, "worker_input_custody_invalid"), expected = includeDigest ? ["schemaVersion", "type", "mode", "entryCount", "digest"] : ["schemaVersion", "type", "mode", "entryCount"];
  if (!keys(value, expected) || value.schemaVersion !== "1" || value.type !== "control_plane_sealed_smoke_tree" || value.mode !== (includeDigest ? "final" : "pre") || !Number.isSafeInteger(value.entryCount) || value.entryCount < 1 || includeDigest && !HASH.test(value.digest || "")) fail("worker_input_custody_invalid");
  return Object.freeze({ treeRoot: abs(treePath), ...(includeDigest ? { digest: value.digest } : {}), entryCount: value.entryCount });
}
function fdSealedSmokeTreeAudit(treePath, supplied, includeDigest) {
  try {
    const command = tool(supplied.tools.python, supplied), request = Buffer.from(JSON.stringify({ tree: abs(treePath), limits: sealedTreeLimits(supplied), digest: includeDigest, rootRequired: supplied.requireRoot === true }));
    const result = spawnSync(command, ["-I", "-S", "-c", SEALED_SMOKE_TREE_AUDIT], { cwd: "/", input: request, env: CMD_ENV, maxBuffer: 4096, timeout: 15000, killSignal: "SIGKILL", windowsHide: true });
    const stdout = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.alloc(0), stderr = Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.alloc(0);
    if (result.error || result.signal || result.status !== 0 || stderr.length) fail("worker_input_custody_invalid");
    return parseSealedSmokeTreeAudit(stdout, treePath, includeDigest);
  } catch (error) { if (error instanceof CandidateDependencyGateError) throw error; fail("worker_input_custody_invalid"); }
}
function usesFdSealedSmokeTreeAudit(supplied) { return supplied.requireRoot === true || supplied.requireRoot === false && supplied.useFdSealedSmokeTreeAudit === true; }
function preflightSealedSmokeTree(treePath, supplied) { return usesFdSealedSmokeTreeAudit(supplied) ? fdSealedSmokeTreeAudit(treePath, supplied, false) : scanSealedSmokeTree(treePath, supplied, false); }
function auditSealedSmokeTree(treePath, supplied) { return usesFdSealedSmokeTreeAudit(supplied) ? fdSealedSmokeTreeAudit(treePath, supplied, true) : scanSealedSmokeTree(treePath, supplied, true); }
function collectStateTopologyReadback(kind, unit, supplied) {
  const { hostStateDirectory, publicStateDirectory, roots } = transientPaths(kind, unit, supplied);
  return Object.freeze({ public: physicalObservation(publicStateDirectory, "worker_readback_invalid"), host: physicalObservation(hostStateDirectory, "worker_readback_invalid"), privateParent: physicalObservation(roots.stateRoot, "worker_readback_invalid") });
}
function collectWorkerInputCustodyReadback(kind, unit, supplied) {
  const { roots, workerInputDirectory, entries } = expectedWorkerInput(kind, unit, supplied);
  trusted(roots.workerInputRoot, supplied, "worker_input_custody_invalid");
  directory(workerInputDirectory, supplied, "worker_input_custody_invalid");
  for (const entry of entries) {
    if (entry.type === "directory") directory(entry.path, supplied, "worker_input_custody_invalid");
    else regular(entry.path, supplied, "worker_input_custody_invalid", Number.parseInt(entry.exactMode, 8), entry.singleLink);
  }
  let sealedTreeEvidence = null;
  if (kind === "smoke") {
    sealedInputAclCapabilities(roots, workerInputDirectory, entries.slice(1), supplied);
    sealedAclCapabilities(entries[0].path, supplied);
    preflightSealedSmokeTree(entries[0].path, supplied);
    sealedAclCapabilities(entries[0].path, supplied, true);
    sealedTreeEvidence = auditSealedSmokeTree(entries[0].path, supplied);
  } else sealedInputAclCapabilities(roots, workerInputDirectory, entries, supplied);
  return Object.freeze({ root: physicalObservation(roots.workerInputRoot, "worker_input_custody_invalid"), directory: physicalObservation(workerInputDirectory, "worker_input_custody_invalid"), files: Object.freeze(entries.map((entry) => physicalObservation(entry.path, "worker_input_custody_invalid"))), ...(sealedTreeEvidence ? { sealedTreeEvidence } : {}) });
}
export function invokeCandidateDependencyTransientUnit({ kind, unit, input, runtime: supplied = runtime() } = {}) {
  if (supplied.requireRoot) fail("worker_storage_limit_unavailable");
  const invocation = buildTransientUnitInvocation({ kind, unit, input, runtime: supplied });
  const testing = supplied.requireRoot === false;
  if (!testing) requireRoot(supplied);
  if (testing && (typeof supplied.launchTransientUnit !== "function" || typeof supplied.readTransientUnit !== "function")) fail("worker_adapter_unavailable");
  let custodyObserved;
  try {
    custodyObserved = testing && typeof supplied.readWorkerInputCustody === "function" ? supplied.readWorkerInputCustody({ kind, unit, input, invocation }) : collectWorkerInputCustodyReadback(kind, unit, supplied);
  } catch (error) { if (error instanceof CandidateDependencyGateError) throw error; fail("worker_adapter_unavailable"); }
  const prelaunchInputCustody = workerInputCustodyReadback({ kind, unit, runtime: supplied, observed: custodyObserved });
  let launched;
  try { launched = testing ? supplied.launchTransientUnit({ kind, unit, input, invocation, prelaunchInputCustody }) : productionTransientLaunch(invocation, supplied); } catch { fail("worker_adapter_unavailable"); }
  if (!launched || !Number.isSafeInteger(launched.status) || launched.status < 0) fail("worker_adapter_unavailable");
  let terminal;
  if (testing) {
    let terminalObserved;
    try { terminalObserved = supplied.readTransientUnit({ kind, unit, invocation }); } catch { fail("worker_adapter_unavailable"); }
    terminal = transientUnitReadback({ unit, observed: terminalObserved });
  } else terminal = terminalReadbackAfterLaunch({ unit, read: () => productionTransientReadback(unit, supplied) });
  let topologyObserved;
  try {
    topologyObserved = testing && typeof supplied.readStateTopology === "function" ? supplied.readStateTopology({ kind, unit, invocation }) : collectStateTopologyReadback(kind, unit, supplied);
  } catch (error) { if (error instanceof CandidateDependencyGateError) throw error; fail("worker_adapter_unavailable"); }
  stateTopologyReadback({ unit, runtime: supplied, observed: topologyObserved });
  return Object.freeze({ succeeded: launched.status === 0 && terminal.succeeded, cleanupAllowed: terminal.cleanupAllowed, ...(prelaunchInputCustody.sealedTreeEvidence ? { sealedTreeEvidence: prelaunchInputCustody.sealedTreeEvidence } : {}) });
}

function checkAssembly(value, candidate) {
  if (!keys(value, ["schemaVersion", "type", "releaseUnit", "activeRelease", "candidateRelease", "createdAt", "protectedOverlays"])
    || value.schemaVersion !== "1" || value.type !== "control_plane_release_assembly" || value.releaseUnit !== UNIT
    || !LABEL.test(value.activeRelease || "") || value.candidateRelease !== candidate || !iso(value.createdAt)
    || !Array.isArray(value.protectedOverlays) || value.protectedOverlays.length !== 2) fail("assembly_manifest_invalid");
  for (const [index, item] of value.protectedOverlays.entries()) {
    if (!keys(item, ["relativePath", "sha256", "sizeBytes", "mode"])
      || item.relativePath !== ["config/proxy-servers.json", ".env"][index] || !HASH.test(item.sha256 || "")
      || !Number.isSafeInteger(item.sizeBytes) || item.sizeBytes < 0 || !/^0[0-7]{3}$/.test(item.mode || "")) fail("assembly_manifest_invalid");
  }
}
function checkArtifactManifest(value) {
  if (!keys(value, ["schemaVersion", "releaseUnit", "sourceCommit", "release", "artifact"])
    || value.schemaVersion !== "1" || value.releaseUnit !== UNIT || !COMMIT.test(value.sourceCommit || "") || !ARTIFACT_RELEASE.test(value.release || "")
    || !keys(value.artifact, ["fileName", "sha256", "sizeBytes", "createdAt"])
    || typeof value.artifact.fileName !== "string" || !value.artifact.fileName || value.artifact.fileName.includes("\0") || basename(value.artifact.fileName) !== value.artifact.fileName || !HASH.test(value.artifact.sha256 || "")
    || !Number.isSafeInteger(value.artifact.sizeBytes) || value.artifact.sizeBytes <= 0 || !iso(value.artifact.createdAt)) fail("artifact_manifest_invalid");
}
export function parseArtifactManifest({ bytes } = {}) {
  const value = strictJsonObject(bytes, "artifact_manifest_invalid");
  checkArtifactManifest(value);
  return Object.freeze({ value, sha256: hash(bytes), sizeBytes: bytes.length });
}
function checkArtifact(value, candidate, input, manifest) {
  const sourceFile = (entry, digest, size) => keys(entry, ["sha256", "sizeBytes"])
    && HASH.test(entry.sha256 || "") && entry.sha256 === digest
    && Number.isSafeInteger(entry.sizeBytes) && entry.sizeBytes === size;
  if (!manifest || !HASH.test(manifest.sha256 || "") || !Number.isSafeInteger(manifest.sizeBytes) || manifest.sizeBytes <= 0
    || !keys(value, ["schemaVersion", "type", "state", "releaseUnit", "candidateRelease", "sourceCommit", "artifactRelease", "artifact", "artifactManifestSha256", "artifactManifestSizeBytes", "sourceFiles"])
    || value.schemaVersion !== "1" || value.type !== "control_plane_artifact_stage" || value.state !== "verified" || value.releaseUnit !== UNIT || value.candidateRelease !== candidate || value.sourceCommit !== manifest.value.sourceCommit || value.artifactRelease !== manifest.value.release || !keys(value.artifact, ["sha256", "sizeBytes"]) || value.artifact.sha256 !== manifest.value.artifact.sha256 || value.artifact.sizeBytes !== manifest.value.artifact.sizeBytes || value.artifactManifestSha256 !== manifest.sha256 || value.artifactManifestSizeBytes !== manifest.sizeBytes || !keys(value.sourceFiles, ["packageJson", "packageLock"]) || !sourceFile(value.sourceFiles.packageJson, input.package, input.packageSize) || !sourceFile(value.sourceFiles.packageLock, input.lock, input.lockSize)) fail("artifact_stage_receipt_invalid");
}
export function parseArtifactStageReceipt({ bytes, candidateRelease, packageJson, packageLock, artifactManifestBytes } = {}) {
  if (!Buffer.isBuffer(packageJson) || !Buffer.isBuffer(packageLock)) fail("artifact_stage_receipt_invalid");
  const manifest = parseArtifactManifest({ bytes: artifactManifestBytes });
  const value = strictJsonObject(bytes, "artifact_stage_receipt_invalid");
  checkArtifact(value, candidateRelease, {
    package: hash(packageJson), packageSize: packageJson.length,
    lock: hash(packageLock), lockSize: packageLock.length
  }, manifest);
  return Object.freeze({ value, sha256: hash(bytes), sizeBytes: bytes.length, artifactManifestSha256: manifest.sha256, artifactManifestSizeBytes: manifest.sizeBytes });
}
function context(candidate, current, runtime) {
  if (runtime.requireRoot && !same(runtime.root, DEFAULT_CONTROL_PLANE_DEPLOYMENT_ROOT)) fail("invalid_input");
  trusted(runtime.root, runtime); const root = abs(runtime.root), releases = directory(resolve(root, "releases"), runtime, "trusted_layout_invalid");
  const candidateRoot = directory(resolve(releases, candidate), runtime, "candidate_path_invalid");
  if (!inside(releases, candidateRoot) || dirname(candidateRoot) !== releases || basename(candidateRoot) !== candidate) fail("candidate_path_invalid");
  const pointer = resolve(root, "current"), pointerMetadata = stat(pointer, "trusted_layout_invalid");
  if (!pointerMetadata.isSymbolicLink()) fail("trusted_layout_invalid");
  const currentRoot = physical(pointer, "trusted_layout_invalid");
  if (!inside(releases, currentRoot) || dirname(currentRoot) !== releases || !LABEL.test(basename(currentRoot))) fail("trusted_layout_invalid");
  directory(currentRoot, runtime, "trusted_layout_invalid");
  if (basename(currentRoot) !== current || same(currentRoot, candidateRoot)) fail("service_identity_invalid");
  const assemblyRoot = trusted(resolve(root, "assembly-receipts", candidate), runtime, "assembly_manifest_invalid");
  if (!inside(resolve(root, "assembly-receipts"), assemblyRoot)) fail("assembly_manifest_invalid");
  const assembly = regular(resolve(assemblyRoot, "release-assembly.json"), runtime, "assembly_manifest_invalid", 0o600, true);
  const artifactManifest = regular(resolve(assemblyRoot, "artifact-manifest.json"), runtime, "artifact_manifest_missing", 0o600, true);
  const artifact = regular(resolve(assemblyRoot, "artifact-stage-receipt.json"), runtime, "artifact_stage_receipt_missing", 0o600, true);
  return { root, releases, candidate, current, candidateRoot, currentRoot, assembly: assembly.path, artifactManifest: artifactManifest.path, artifact: artifact.path, builder: resolve(root, "dependency-builders"), staging: resolve(root, "dependency-staging"), receipts: resolve(root, "dependency-receipts"), receipt: resolve(root, "dependency-receipts", candidate, "node-modules-materialization.json") };
}
function inputs(context, runtime, absent = true) {
  const packageFile = fileIn(context.candidateRoot, "package.json", runtime, "candidate_path_invalid");
  const lockFile = fileIn(context.candidateRoot, "package-lock.json", runtime, "candidate_path_invalid");
  const nodeModules = resolve(context.candidateRoot, "node_modules"); if (absent) requireAbsent(nodeModules, "candidate_node_modules_present");
  const packageBytes = readFileSync(packageFile.path), lockBytes = readFileSync(lockFile.path);
  checkAssembly(json(context.assembly, "assembly_manifest_invalid"), context.candidate);
  const artifactStage = parseArtifactStageReceipt({
    bytes: readFileSync(context.artifact), candidateRelease: context.candidate,
    packageJson: packageBytes, packageLock: lockBytes, artifactManifestBytes: readFileSync(context.artifactManifest)
  });
  const input = { package: hash(packageBytes), lock: hash(lockBytes), packageSize: packageBytes.length, lockSize: lockBytes.length, assembly: hashFile(context.assembly), artifact: artifactStage.sha256, artifactStageReceiptSizeBytes: artifactStage.sizeBytes, artifactManifest: artifactStage.artifactManifestSha256, artifactManifestSizeBytes: artifactStage.artifactManifestSizeBytes, packageBytes, lockBytes, source: artifactStage.value };
  try { verifyReleaseConfigOverlay({ activeReleasePath: context.currentRoot, candidateReleasePath: context.candidateRoot, manifestPath: context.assembly }); } catch { fail("assembly_manifest_invalid"); }
  return input;
}

function tool(path, runtime) {
  if (!isAbsolute(path)) fail("untrusted_system_tool"); const real = physical(path, "untrusted_system_tool"), metadata = stat(real, "untrusted_system_tool");
  if (!metadata.isFile() || !(mode(metadata) & 0o111)) fail("untrusted_system_tool");
  for (const segment of ancestors(real)) { const item = stat(segment, "untrusted_system_tool"); if (item.isSymbolicLink() || (!item.isDirectory() && !same(segment, real))) fail("untrusted_system_tool"); owned(item, runtime, "untrusted_system_tool"); }
  return real;
}
function parseService(stdout) {
  const values = Object.fromEntries(String(stdout || "").trim().split(/\r?\n/).filter(Boolean).map((line) => { const index = line.indexOf("="); return index < 1 ? ["", ""] : [line.slice(0, index), line.slice(index + 1)]; }));
  if (values.ActiveState !== "active" || values.SubState !== "running" || values.Result !== "success") fail("service_state_invalid");
  const numeric = (name, zero = false) => /^[0-9]+$/.test(values[name] || "") && Number.isSafeInteger(Number(values[name])) && (zero || Number(values[name]) > 0) ? Number(values[name]) : null;
  const main = numeric("MainPID"), exec = numeric("ExecMainPID"), restarts = numeric("NRestarts", true); if (!main || main !== exec || restarts === null) fail("service_identity_invalid"); return { main, exec, restarts };
}
function proc(pid) {
  try {
    const text = readFileSync(`/proc/${pid}/status`, "utf8"), uid = /^Uid:\s+(\d+)\s+\1\s+\1\s+\1$/m.exec(text), gid = /^Gid:\s+(\d+)\s+\1\s+\1\s+\1$/m.exec(text);
    const metadata = statSync(`/proc/${pid}`), cwd = realpathSync(`/proc/${pid}/cwd`); if (!uid || !gid || metadata.uid !== Number(uid[1]) || metadata.gid !== Number(gid[1])) return null;
    return { uid: Number(uid[1]), gid: Number(gid[1]), cwd };
  } catch { return null; }
}
function service(context, runtime) {
  if (typeof runtime.readService === "function") return validService(runtime.readService({ context }), context);
  const command = tool(runtime.tools.systemctl, runtime), result = spawnSync(command, ["show", CONTROL_PLANE_SERVICE_UNIT, "--property=ActiveState,SubState,Result,MainPID,ExecMainPID,NRestarts", "--no-page"], { env: CMD_ENV, encoding: "utf8", windowsHide: true });
  if (result.error || result.status !== 0) fail("service_state_invalid"); const state = parseService(result.stdout), principal = proc(state.main); if (!principal) fail("service_identity_invalid"); return validService({ ...state, ...principal }, context);
}
function validService(value, context) {
  if (!value || !Number.isSafeInteger(value.main) || value.main <= 0 || value.main !== value.exec || !Number.isSafeInteger(value.uid) || value.uid < 0 || !Number.isSafeInteger(value.gid) || value.gid < 0 || !Number.isSafeInteger(value.restarts) || value.restarts < 0 || typeof value.cwd !== "string" || !same(value.cwd, context.currentRoot)) fail("service_identity_invalid");
  return Object.freeze({ main: value.main, exec: value.exec, uid: value.uid, gid: value.gid, cwd: abs(value.cwd), restarts: value.restarts });
}
function sameService(left, right) { if (left.main !== right.main || left.exec !== right.exec || left.uid !== right.uid || left.gid !== right.gid || left.restarts !== right.restarts || !same(left.cwd, right.cwd)) fail("service_identity_changed"); }
function environment(path, runtime) { const item = fileIn(dirname(path), basename(path), runtime, "postpublish_validation_failed"), metadata = item.metadata; return `${inode(metadata)}:${hashFile(item.path)}:${metadata.size}:${mode(metadata)}:${metadata.uid}:${metadata.gid}`; }
function protectedState(context, runtime) { return { current: context.currentRoot, activeEnv: environment(resolve(context.currentRoot, ".env"), runtime), candidateEnv: environment(resolve(context.candidateRoot, ".env"), runtime) }; }
function sameProtected(left, right) { if (!same(left.current, right.current) || left.activeEnv !== right.activeEnv || left.candidateEnv !== right.candidateEnv) fail("postpublish_validation_failed"); }
function state(candidate, current, runtime, absent = true) { requireRoot(runtime); const c = context(label(candidate), label(current), runtime); return { c, input: inputs(c, runtime, absent), service: service(c, runtime), protected: protectedState(c, runtime) }; }
function steady(old, runtime, absent = true) { const fresh = state(old.c.candidate, old.c.current, runtime, absent); if (!same(old.c.candidateRoot, fresh.c.candidateRoot) || !same(old.c.currentRoot, fresh.c.currentRoot) || old.input.package !== fresh.input.package || old.input.lock !== fresh.input.lock || old.input.assembly !== fresh.input.assembly || old.input.artifact !== fresh.input.artifact || old.input.artifactStageReceiptSizeBytes !== fresh.input.artifactStageReceiptSizeBytes || old.input.artifactManifest !== fresh.input.artifactManifest || old.input.artifactManifestSizeBytes !== fresh.input.artifactManifestSizeBytes) fail("source_identity_mismatch"); sameService(old.service, fresh.service); sameProtected(old.protected, fresh.protected); return fresh; }

function fsync(path, condition) { let descriptor; try { descriptor = openSync(path, "r"); fsyncSync(descriptor); } catch { fail(condition); } finally { if (descriptor !== undefined) closeSync(descriptor); } }
function base(path, runtime, condition) {
  const parent = directory(dirname(path), runtime, condition); if (!existsSync(path)) { try { mkdirSync(path, { mode: 0o711 }); if (runtime.enforceOwnership) chownSync(path, 0, 0); chmodSync(path, 0o711); fsync(parent, condition); } catch { fail(condition); } }
  const real = directory(path, runtime, condition); if ((mode(stat(real, condition)) & 0o777) !== 0o711) fail(condition); return real;
}
function make(path, parent, uid, gid, valueMode, condition) {
  try { mkdirSync(path, { mode: valueMode }); if (process.platform !== "win32") chownSync(path, uid, gid); chmodSync(path, valueMode); const metadata = stat(path, condition); if (metadata.isSymbolicLink() || !metadata.isDirectory() || metadata.uid !== uid || metadata.gid !== gid || (mode(metadata) & 0o777) !== valueMode) fail(condition); fsync(parent, condition); return { path, parent, identity: inode(metadata) }; } catch (error) { if (error instanceof CandidateDependencyGateError) throw error; fail(condition); }
}

function rootWorkerOwner(supplied) {
  const uid = supplied.requireRoot ? 0 : supplied.getuid(), gid = supplied.requireRoot ? 0 : supplied.getgid();
  if (!Number.isSafeInteger(uid) || uid < 0 || !Number.isSafeInteger(gid) || gid < 0) fail("worker_input_custody_invalid");
  return Object.freeze({ uid, gid });
}

function rootControlledDirectory(path, parent, owner, valueMode, condition) {
  if (!same(dirname(path), parent)) fail(condition);
  if (!existsSync(path)) return make(path, parent, owner.uid, owner.gid, valueMode, condition);
  const metadata = stat(path, condition), real = physical(path, condition);
  if (metadata.isSymbolicLink() || !metadata.isDirectory() || !same(path, real) || metadata.uid !== owner.uid || metadata.gid !== owner.gid || (mode(metadata) & 0o777) !== valueMode) fail(condition);
  return { path: real, parent, identity: inode(metadata) };
}

function rootWorkerDirectory(path, parent, owner) {
  return rootControlledDirectory(path, parent, owner, 0o700, "worker_input_custody_invalid");
}

function sealedBuildInputFile(directoryValue, name, bytes, digest, owner, supplied) {
  const path = resolve(directoryValue.path, name);
  if (!same(dirname(path), directoryValue.path) || existsSync(path)) fail("worker_input_custody_invalid");
  try {
    writeFileSync(path, bytes, { mode: 0o444, flag: "wx" });
    if (process.platform !== "win32") chownSync(path, owner.uid, owner.gid);
    chmodSync(path, 0o444); fsync(path, "worker_input_custody_invalid");
    const metadata = stat(path, "worker_input_custody_invalid");
    if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.uid !== owner.uid || metadata.gid !== owner.gid || (mode(metadata) & 0o777) !== 0o444 || metadata.nlink !== 1 || hashFile(path) !== digest) fail("worker_input_custody_invalid");
    sealedAclCapabilities(path, supplied, false, "worker_input_custody_invalid");
    return Object.freeze({ path, identity: inode(metadata), sha256: digest, sizeBytes: bytes.length });
  } catch (error) { if (error instanceof CandidateDependencyGateError) throw error; fail("worker_input_custody_invalid"); }
}

export function stageBuildWorkerInputs({ candidateRelease, expectedCurrentRelease, unit, runtime: supplied = runtime() } = {}) {
  if (supplied.requireRoot) fail("worker_storage_limit_unavailable");
  requireRoot(supplied); if (unitKind(unit) !== "build") fail("invalid_input");
  const value = state(candidateRelease, expectedCurrentRelease, supplied), owner = rootWorkerOwner(supplied), roots = transientRoots(supplied);
  if (supplied.requireRoot) trustedAclAncestorChain(dirname(roots.workerInputRoot), supplied, "worker_input_custody_invalid");
  const parent = directory(dirname(roots.workerInputRoot), supplied, "worker_input_custody_invalid");
  const root = rootWorkerDirectory(roots.workerInputRoot, parent, owner), expected = expectedWorkerInput("build", unit, supplied);
  if (supplied.requireRoot) sealedAclCapabilities(root.path, supplied, false, "worker_input_custody_invalid");
  if (!same(dirname(expected.workerInputDirectory), root.path) || existsSync(expected.workerInputDirectory)) fail("worker_input_custody_invalid");
  // The root stays private; the per-unit bind source must be traversable by the
  // DynamicUser after systemd mounts it read-only into that unit's namespace.
  const directoryValue = make(expected.workerInputDirectory, root.path, owner.uid, owner.gid, 0o711, "worker_input_custody_invalid");
  if (supplied.requireRoot) sealedAclCapabilities(directoryValue.path, supplied, false, "worker_input_custody_invalid");
  const files = Object.freeze([
    sealedBuildInputFile(directoryValue, "package.json", value.input.packageBytes, value.input.package, owner, supplied),
    sealedBuildInputFile(directoryValue, "package-lock.json", value.input.lockBytes, value.input.lock, owner, supplied)
  ]);
  if (readdirSync(directoryValue.path).sort().join(",") !== "package-lock.json,package.json") fail("worker_input_custody_invalid");
  fsync(directoryValue.path, "worker_input_custody_invalid"); fsync(root.path, "worker_input_custody_invalid");
  const fresh = steady(value, supplied);
  if (files[0].sha256 !== fresh.input.package || files[1].sha256 !== fresh.input.lock || files[0].sizeBytes !== fresh.input.packageSize || files[1].sizeBytes !== fresh.input.lockSize) fail("source_identity_mismatch");
  return Object.freeze({ unit, directory: Object.freeze({ path: directoryValue.path, identity: directoryValue.identity }), files });
}

function localSeizeOperations() {
  return {
    lstat: (path) => { const metadata = lstatSync(path); return { type: metadata.isDirectory() ? "directory" : metadata.isSymbolicLink() ? "symbolicLink" : "other", dev: metadata.dev, ino: metadata.ino, uid: metadata.uid, gid: metadata.gid, mode: mode(metadata) }; },
    chown: (path, uid, gid) => chownSync(path, uid, gid), chmod: (path, value) => chmodSync(path, value)
  };
}

function seizeableStateDirectory(value) {
  return Boolean(value && value.type === "directory" && Number.isSafeInteger(value.dev) && Number.isSafeInteger(value.ino) && Number.isSafeInteger(value.uid) && Number.isSafeInteger(value.gid) && Number.isSafeInteger(value.mode) && (value.mode & 0o777) === 0o700);
}

function seizeTerminalAndTopology(kind, unit, terminal, supplied) {
  if (supplied.requireRoot) {
    const observedTerminal = terminalReadbackAfterLaunch({ unit, read: () => productionTransientReadback(unit, supplied) });
    if (!observedTerminal.succeeded || observedTerminal.cleanupAllowed !== true) fail("worker_cleanup_uncertain", true);
    const observedTopology = collectStateTopologyReadback(kind, unit, supplied);
    stateTopologyReadback({ unit, runtime: supplied, observed: observedTopology });
    return observedTerminal;
  }
  if (!terminal || terminal.succeeded !== true || terminal.cleanupAllowed !== true) fail("worker_cleanup_uncertain", true);
  return terminal;
}

export function seizeWorkerStateTopLevel({ kind, unit, terminal, runtime: supplied = runtime(), operations } = {}) {
  if (supplied.requireRoot) fail("worker_storage_limit_unavailable");
  try {
    requireRoot(supplied); if (supplied.requireRoot && operations !== undefined) fail("worker_cleanup_uncertain", true);
    const activeOperations = operations ?? localSeizeOperations();
    if (unitKind(unit) !== kind || !activeOperations || typeof activeOperations.lstat !== "function" || typeof activeOperations.chown !== "function" || typeof activeOperations.chmod !== "function") fail("worker_cleanup_uncertain", true);
    seizeTerminalAndTopology(kind, unit, terminal, supplied);
    const paths = transientPaths(kind, unit, supplied);
    if (supplied.requireRoot) {
      trustedAclAncestorChain(paths.roots.statePublicRoot, supplied, "worker_cleanup_uncertain");
      trustedAclAncestorChain(paths.roots.stateRoot, supplied, "worker_cleanup_uncertain");
    }
    const { hostStateDirectory } = paths, owner = rootWorkerOwner(supplied), before = activeOperations.lstat(hostStateDirectory);
    if (!seizeableStateDirectory(before)) fail("worker_cleanup_uncertain", true);
    const identity = `${before.dev}:${before.ino}`;
    activeOperations.chown(hostStateDirectory, owner.uid, owner.gid); activeOperations.chmod(hostStateDirectory, 0o700);
    const after = activeOperations.lstat(hostStateDirectory);
    if (!seizeableStateDirectory(after) || `${after.dev}:${after.ino}` !== identity || after.uid !== owner.uid || after.gid !== owner.gid) fail("worker_cleanup_uncertain", true);
    if (supplied.requireRoot) {
      const seized = directory(hostStateDirectory, supplied, "worker_cleanup_uncertain");
      if (!same(seized, hostStateDirectory)) fail("worker_cleanup_uncertain", true);
      sealedAclCapabilities(seized, supplied, false, "worker_cleanup_uncertain");
    }
    return Object.freeze({ path: hostStateDirectory, identity });
  } catch (error) { if (error instanceof CandidateDependencyGateError && error.attentionRequired) throw error; fail("worker_cleanup_uncertain", true); }
}

function requireAbsent(path, condition) {
  try { lstatSync(path); fail(condition); } catch (error) { if (error instanceof CandidateDependencyGateError) throw error; if (error?.code === "ENOENT") return; fail(condition); }
}

function buildArchiveMetadata(path, condition) {
  const metadata = stat(path, condition);
  if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.nlink !== 1 || !Number.isSafeInteger(metadata.size) || metadata.size <= 0 || metadata.size > SEALED_ARCHIVE_MAX_BYTES) fail(condition);
  return metadata;
}

function sameBuildArchiveIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.nlink === right.nlink;
}

function sameBuildArchiveSourceIdentity(left, right) {
  return sameBuildArchiveIdentity(left, right) && left.uid === right.uid && left.gid === right.gid && (mode(left) & 0o777) === (mode(right) & 0o777);
}

function noFollowArchiveFlags(base) {
  if (!Number.isSafeInteger(fsConstants.O_NOFOLLOW)) fail("worker_execution_failed");
  return base | fsConstants.O_NOFOLLOW | (Number.isSafeInteger(fsConstants.O_CLOEXEC) ? fsConstants.O_CLOEXEC : 0);
}

function sealedArchiveAncestorChain(path, supplied) {
  trustedAclAncestorChain(path, supplied, "worker_execution_failed");
}

function boundedBuildArchiveHash(path, expected) {
  let descriptor;
  try {
    descriptor = openSync(path, noFollowArchiveFlags(fsConstants.O_RDONLY));
    const digest = createHash("sha256"), buffer = Buffer.allocUnsafe(64 * 1024);
    let total = 0;
    for (;;) {
      const count = readSync(descriptor, buffer, 0, buffer.length, null);
      if (count === 0) break;
      total += count; if (total > SEALED_ARCHIVE_MAX_BYTES) fail("worker_execution_failed");
      digest.update(buffer.subarray(0, count));
    }
    const after = buildArchiveMetadata(path, "worker_execution_failed");
    if (total !== expected.size || !sameBuildArchiveIdentity(expected, after)) fail("worker_execution_failed");
    return digest.digest("hex");
  } catch (error) { if (error instanceof CandidateDependencyGateError) throw error; fail("worker_execution_failed"); }
  finally { if (descriptor !== undefined) closeSync(descriptor); }
}

function sealedArchiveDestination(context, unit, supplied, owner) {
  if (typeof supplied.sealedArchiveRoot !== "string" || !isAbsolute(supplied.sealedArchiveRoot)) fail("worker_execution_failed");
  const rootPath = abs(supplied.sealedArchiveRoot);
  if (supplied.requireRoot && !same(rootPath, SEALED_ARCHIVE_ROOT)) fail("invalid_input");
  if (!same(dirname(rootPath), context.root)) fail("worker_execution_failed");
  sealedArchiveAncestorChain(context.root, supplied);
  const parent = directory(context.root, supplied, "worker_execution_failed");
  const root = rootControlledDirectory(rootPath, parent, owner, 0o700, "worker_execution_failed");
  sealedAclCapabilities(root.path, supplied);
  const directoryPath = resolve(root.path, unit);
  if (!same(dirname(directoryPath), root.path) || existsSync(directoryPath)) fail("worker_execution_failed");
  const directoryValue = make(directoryPath, root.path, owner.uid, owner.gid, 0o700, "worker_execution_failed");
  sealedAclCapabilities(directoryValue.path, supplied);
  const path = resolve(directoryValue.path, "sealed-node-modules.tar");
  if (!same(dirname(path), directoryValue.path)) fail("worker_execution_failed");
  return Object.freeze({ root, directory: Object.freeze({ path: directoryValue.path, identity: directoryValue.identity }), path });
}

function copyBuildArchiveBarrier(seized, destination, owner, supplied) {
  sealedArchiveAncestorChain(seized.path, supplied);
  const sourcePath = resolve(seized.path, "sealed-node-modules.tar");
  if (!same(dirname(sourcePath), seized.path)) fail("worker_execution_failed");
  const sourceBefore = buildArchiveMetadata(sourcePath, "worker_execution_failed");
  if ((mode(sourceBefore) & 0o777) !== 0o600) fail("worker_execution_failed");
  sealedAclCapabilities(sourcePath, supplied);
  let sourceDescriptor, destinationDescriptor, copiedSha256, copiedSize = 0;
  try {
    sourceDescriptor = openSync(sourcePath, noFollowArchiveFlags(fsConstants.O_RDONLY));
    const sourceOpened = fstatSync(sourceDescriptor);
    if (!sourceOpened.isFile() || !sameBuildArchiveSourceIdentity(sourceBefore, sourceOpened)) fail("worker_execution_failed");
    destinationDescriptor = openSync(destination.path, noFollowArchiveFlags(fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL), 0o600);
    const digest = createHash("sha256"), buffer = Buffer.allocUnsafe(64 * 1024);
    for (;;) {
      const count = readSync(sourceDescriptor, buffer, 0, buffer.length, null);
      if (count === 0) break;
      copiedSize += count; if (copiedSize > SEALED_ARCHIVE_MAX_BYTES) fail("worker_execution_failed");
      digest.update(buffer.subarray(0, count));
      for (let offset = 0; offset < count;) {
        const written = writeSync(destinationDescriptor, buffer, offset, count - offset, null);
        if (!Number.isSafeInteger(written) || written <= 0) fail("worker_execution_failed");
        offset += written;
      }
    }
    const sourceAfter = fstatSync(sourceDescriptor), destinationWritten = fstatSync(destinationDescriptor);
    if (!sourceAfter.isFile() || !sameBuildArchiveSourceIdentity(sourceBefore, sourceAfter) || copiedSize !== sourceBefore.size || !destinationWritten.isFile() || destinationWritten.uid !== owner.uid || destinationWritten.gid !== owner.gid || destinationWritten.nlink !== 1 || destinationWritten.size !== copiedSize || (mode(destinationWritten) & 0o777) !== 0o600) fail("worker_execution_failed");
    copiedSha256 = digest.digest("hex"); fsyncSync(destinationDescriptor);
  } catch (error) { if (error instanceof CandidateDependencyGateError) throw error; fail("worker_execution_failed"); }
  finally {
    if (destinationDescriptor !== undefined) closeSync(destinationDescriptor);
    if (sourceDescriptor !== undefined) closeSync(sourceDescriptor);
  }
  const copied = buildArchiveMetadata(destination.path, "worker_execution_failed");
  if (copied.uid !== owner.uid || copied.gid !== owner.gid || (mode(copied) & 0o777) !== 0o600 || copied.size !== copiedSize || boundedBuildArchiveHash(destination.path, copied) !== copiedSha256) fail("worker_execution_failed");
  try { chownSync(destination.path, owner.uid, owner.gid); chmodSync(destination.path, 0o400); } catch { fail("worker_execution_failed"); }
  const frozen = buildArchiveMetadata(destination.path, "worker_execution_failed");
  if (!sameBuildArchiveIdentity(copied, frozen) || frozen.uid !== owner.uid || frozen.gid !== owner.gid || (mode(frozen) & 0o777) !== 0o400) fail("worker_execution_failed");
  sealedAclCapabilities(destination.root.path, supplied); sealedAclCapabilities(destination.directory.path, supplied); sealedAclCapabilities(destination.path, supplied);
  const sha256 = boundedBuildArchiveHash(destination.path, frozen);
  if (sha256 !== copiedSha256) fail("worker_execution_failed");
  fsync(destination.path, "worker_execution_failed"); fsync(destination.directory.path, "worker_execution_failed"); fsync(destination.root.path, "worker_execution_failed");
  return Object.freeze({ path: destination.path, identity: inode(frozen), sha256, sizeBytes: frozen.size });
}

function rethrowHandoverFailure(error, quarantine) {
  const condition = error instanceof CandidateDependencyGateError ? error.condition : "worker_execution_failed";
  const wrapped = new CandidateDependencyGateError(condition, true);
  Object.defineProperty(wrapped, "quarantine", { value: Object.freeze({ ...quarantine }), enumerable: false });
  throw wrapped;
}

function requireWorkerStorageBoundary(supplied) {
  // Production has no quota-backed StateDirectory contract yet. A non-root
  // explicit test runtime may exercise the handover code, but production may
  // never bypass this guard through runtime injection.
  if (supplied.requireRoot || supplied.allowTestWorkerStorage !== true) fail("worker_storage_limit_unavailable");
}

export function sealBuildWorkerArchive({ candidateRelease, expectedCurrentRelease, unit, runtime: supplied = runtime() } = {}) {
  let quarantine = null;
  try {
    requireRoot(supplied); if (unitKind(unit) !== "build") fail("invalid_input");
    requireWorkerStorageBoundary(supplied);
    const markQuarantine = (phase, fields = {}) => { quarantine = { ...(quarantine || { unit }), phase, ...fields }; };
    const initial = state(candidateRelease, expectedCurrentRelease, supplied), paths = transientPaths("build", unit, supplied);
    requireAbsent(paths.hostStateDirectory, "worker_readback_invalid"); requireAbsent(paths.publicStateDirectory, "worker_readback_invalid");
    markQuarantine("worker_input_staging");
    const staged = stageBuildWorkerInputs({ candidateRelease, expectedCurrentRelease, unit, runtime: supplied });
    markQuarantine("worker_input_staged", { workerInputDirectoryIdentity: staged.directory.identity });
    const worker = invokeCandidateDependencyTransientUnit({ kind: "build", unit, input: staged.files.map((item) => item.path), runtime: supplied });
    if (!worker.succeeded || worker.cleanupAllowed !== true) fail("worker_execution_failed");
    markQuarantine("worker_completed");
    const seized = seizeWorkerStateTopLevel({ kind: "build", unit, terminal: worker, runtime: supplied });
    markQuarantine("worker_state_seized", { stateDirectoryIdentity: seized.identity });
    const destination = sealedArchiveDestination(initial.c, unit, supplied, rootWorkerOwner(supplied));
    markQuarantine("sealed_archive_destination_created", { sealedArchiveDirectoryIdentity: destination.directory.identity });
    const archive = copyBuildArchiveBarrier(seized, destination, rootWorkerOwner(supplied), supplied);
    markQuarantine("sealed_archive_created", { archiveIdentity: archive.identity });
    const fresh = steady(initial, supplied);
    return Object.freeze({ buildUnit: unit, candidateRelease: fresh.c.candidate, currentRelease: fresh.c.current, binding: Object.freeze({ packageSha256: fresh.input.package, packageLockSha256: fresh.input.lock, assemblySha256: fresh.input.assembly, artifactManifestSha256: fresh.input.artifactManifest, artifactManifestSizeBytes: fresh.input.artifactManifestSizeBytes, artifactStageReceiptSha256: fresh.input.artifact, artifactStageReceiptSizeBytes: fresh.input.artifactStageReceiptSizeBytes }), archive });
  } catch (error) { if (quarantine) rethrowHandoverFailure(error, quarantine); if (error instanceof CandidateDependencyGateError) throw error; fail("worker_execution_failed"); }
}

function eraseDirectory(value) { if (!value) return true; try { const metadata = stat(value.path, "builder_cleanup_failed"); if (metadata.isSymbolicLink() || !metadata.isDirectory() || inode(metadata) !== value.identity) return false; rmSync(value.path, { recursive: true, force: false, maxRetries: 0 }); fsync(value.parent, "builder_cleanup_failed"); return !existsSync(value.path); } catch { return false; } }
function eraseFile(value) { if (!value) return true; try { const metadata = stat(value.path, "postpublish_cleanup_failed"); if (metadata.isSymbolicLink() || !metadata.isFile() || inode(metadata) !== value.identity) return false; unlinkSync(value.path); fsync(dirname(value.path), "postpublish_cleanup_failed"); return !existsSync(value.path); } catch { return false; } }
function mounts(roots, runtime) {
  let text; try { text = !runtime.requireRoot && typeof runtime.mountInfo === "function" ? runtime.mountInfo() : readFileSync("/proc/self/mountinfo", "utf8"); } catch { fail("mount_boundary_invalid"); }
  if (typeof text !== "string") fail("mount_boundary_invalid"); for (const line of text.split(/\r?\n/)) { if (!line) continue; const fields = line.split(" "); if (fields.length < 6) fail("mount_boundary_invalid"); const point = fields[4].replace(/\\([0-7]{3})/g, (_all, octal) => String.fromCharCode(Number.parseInt(octal, 8))); if (!isAbsolute(point) || roots.some((root) => same(root, point) || inside(root, point))) fail("mount_boundary_invalid"); }
}
export function validateNodeModulesArchiveListing(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 32 * 1024 * 1024 || bytes.at(-1) !== 0) fail("archive_path_invalid"); const names = [];
  for (let start = 0, index = 0; index < bytes.length; index += 1) if (bytes[index] === 0) { const entry = bytes.subarray(start, index); start = index + 1; if (!entry.length || entry.length > 4096 || entry.includes(0)) fail("archive_path_invalid"); let name; try { name = new TextDecoder("utf-8", { fatal: true }).decode(entry); } catch { fail("archive_path_invalid"); } const clean = name.endsWith("/") ? name.slice(0, -1) : name; if (!clean || name.startsWith("/") || name.includes("\\") || !clean.split("/").every((part) => part && part !== "." && part !== ".." && !part.includes("\0") && Buffer.byteLength(part) <= 255) || clean.split("/")[0] !== "node_modules") fail("archive_path_invalid"); names.push(clean); }
  if (!names.includes("node_modules")) fail("archive_path_invalid"); return Object.freeze(names);
}

function renameSupport(runtime) { if (typeof runtime.renameNoReplace === "function") return; const result = spawnSync(tool(runtime.tools.python, runtime), ["-c", RENAME_PROBE], { env: CMD_ENV, encoding: "utf8", windowsHide: true }); if (result.error || result.status !== 0) fail("rename_noreplace_unavailable"); }
function rename(source, destination, runtime) { if (typeof runtime.renameNoReplace === "function") { const result = runtime.renameNoReplace({ source, destination }); if (!result?.published) fail(result?.unavailable ? "rename_noreplace_unavailable" : "node_modules_publish_failed"); return; } const result = spawnSync(tool(runtime.tools.python, runtime), ["-c", RENAME_SCRIPT, source, destination], { env: CMD_ENV, encoding: "utf8", windowsHide: true }); if (result.error || result.status === 70) fail("rename_noreplace_unavailable"); if (result.status !== 0) fail("node_modules_publish_failed"); }
function lockParent(runtime) {
  if (runtime.requireRoot) trustedAclAncestorChain(dirname(runtime.lockRoot), runtime, "lock_unavailable");
  const owner = rootWorkerOwner(runtime);
  const parent = directory(dirname(runtime.lockRoot), runtime, "lock_unavailable");
  const root = rootControlledDirectory(runtime.lockRoot, parent, owner, 0o700, "lock_unavailable");
  if (runtime.requireRoot) sealedAclCapabilities(root.path, runtime, false, "lock_unavailable");
  return root.path;
}

function lock(runtime) {
  const parent = lockParent(runtime);
  const path = resolve(parent, "node-modules-materialization.lock");
  let descriptor;
  let createdIdentity = null;
  try {
    descriptor = openSync(path, "wx", 0o600);
    const created = fstatSync(descriptor);
    if (!created.isFile() || created.nlink !== 1) fail("lock_unavailable");
    createdIdentity = inode(created);
    if (runtime.enforceOwnership) chownSync(path, 0, 0);
    chmodSync(path, 0o600);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    const metadata = stat(path, "lock_unavailable");
    if (metadata.isSymbolicLink() || !metadata.isFile() || inode(metadata) !== createdIdentity || (mode(metadata) & 0o777) !== 0o600 || runtime.enforceOwnership && (metadata.uid !== 0 || metadata.gid !== 0)) fail("lock_unavailable");
    fsync(parent, "lock_unavailable");
    return { path, parent, identity: createdIdentity };
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    if (createdIdentity) {
      try {
        const metadata = lstatSync(path);
        if (!metadata.isSymbolicLink() && metadata.isFile() && inode(metadata) === createdIdentity) unlinkSync(path);
      } catch {}
    }
    if (error instanceof CandidateDependencyGateError) throw error;
    fail("lock_unavailable");
  }
}
function unlock(value) { return eraseFile(value); }
function snapshotSource(context, runtime) { const source = fileIn(context.candidateRoot, "scripts/control-plane-db-snapshot-gate.mjs", runtime, "native_module_validation_failed"); return { path: source.path, digest: hashFile(source.path) }; }

function evidenceHash(value) { return hash(Buffer.from(JSON.stringify(value))); }
function quotaEvidenceForMaterialization(supplied) {
  if (supplied.allowA3PhysicalValidation !== true || typeof supplied.collectStorageQuotaEvidence !== "function"
    || typeof supplied.a3ProjectRoot !== "string" || !supplied.a3ProjectRoot
    || supplied.root !== `${supplied.a3ProjectRoot}/deployment` && supplied.allowSyntheticA3Evidence !== true
    || !Number.isSafeInteger(supplied.a3ProjectId) || supplied.a3ProjectId <= 0) fail("worker_storage_limit_unavailable");
  const evidence = parseStorageQuotaEvidence(supplied.collectStorageQuotaEvidence());
  if (evidence.projectId !== supplied.a3ProjectId) fail("storage_quota_evidence_invalid");
  return evidence;
}
function materializerSafetyEvidence(quota, smoke, supplied, capturedAt = now(supplied)) {
  const readback = parseServiceSmokeReadback(smoke);
  return Object.freeze({
    projectId: quota.projectId,
    quotaEvidenceSha256: evidenceHash(quota),
    serviceSmokeEvidenceSha256: evidenceHash(readback),
    capturedAt
  });
}
function receiptPayload(state, artifact, tree, safety, runtime) { return { schemaVersion: "2", materializerSchemaVersion: 2, type: "control_plane_candidate_dependency_receipt", state: "materialized", releaseUnit: UNIT, currentRelease: state.c.current, candidateRelease: state.c.candidate, sourceCommit: state.input.source.sourceCommit, artifactSha256: state.input.source.artifact.sha256, artifactSizeBytes: state.input.source.artifact.sizeBytes, artifactManifestSha256: state.input.artifactManifest, artifactManifestSizeBytes: state.input.artifactManifestSizeBytes, artifactStageReceiptSha256: state.input.artifact, artifactStageReceiptSizeBytes: state.input.artifactStageReceiptSizeBytes, dependencyArtifactManifestSha256: artifact.manifestSha256, dependencyArtifactManifestSizeBytes: artifact.manifestSizeBytes, dependencyArchiveSha256: artifact.archive.sha256, dependencyArchiveSizeBytes: artifact.archive.sizeBytes, dependencyArtifactTreeSha256: artifact.artifactTree.sha256, dependencyArtifactTreeEntryCount: artifact.artifactTree.entryCount, dependencyArtifactTreeTotalBytes: artifact.artifactTree.totalBytes, assemblySha256: state.input.assembly, packageSha256: state.input.package, packageLockSha256: state.input.lock, nodeModulesTreeSha256: tree.sha256, nodeModulesTreeEntryCount: tree.entryCount, nodeModulesTreeTotalBytes: tree.totalBytes, serviceUid: state.service.uid, serviceGid: state.service.gid, storageProjectId: safety.projectId, storageQuotaEvidenceSha256: safety.quotaEvidenceSha256, serviceSmokeEvidenceSha256: safety.serviceSmokeEvidenceSha256, safetyEvidenceCapturedAt: safety.capturedAt, createdAt: now(runtime) }; }
function checkReceipt(value, state, artifact, tree = null, safety = null) { const expected = ["schemaVersion", "materializerSchemaVersion", "type", "state", "releaseUnit", "currentRelease", "candidateRelease", "sourceCommit", "artifactSha256", "artifactSizeBytes", "artifactManifestSha256", "artifactManifestSizeBytes", "artifactStageReceiptSha256", "artifactStageReceiptSizeBytes", "dependencyArtifactManifestSha256", "dependencyArtifactManifestSizeBytes", "dependencyArchiveSha256", "dependencyArchiveSizeBytes", "dependencyArtifactTreeSha256", "dependencyArtifactTreeEntryCount", "dependencyArtifactTreeTotalBytes", "assemblySha256", "packageSha256", "packageLockSha256", "nodeModulesTreeSha256", "nodeModulesTreeEntryCount", "nodeModulesTreeTotalBytes", "serviceUid", "serviceGid", "storageProjectId", "storageQuotaEvidenceSha256", "serviceSmokeEvidenceSha256", "safetyEvidenceCapturedAt", "createdAt"];
  if (!keys(value, expected) || value.schemaVersion !== "2" || value.materializerSchemaVersion !== 2 || value.type !== "control_plane_candidate_dependency_receipt" || value.state !== "materialized" || value.releaseUnit !== UNIT || value.currentRelease !== state.c.current || value.candidateRelease !== state.c.candidate || value.sourceCommit !== state.input.source.sourceCommit || value.artifactSha256 !== state.input.source.artifact.sha256 || value.artifactSizeBytes !== state.input.source.artifact.sizeBytes || value.artifactManifestSha256 !== state.input.artifactManifest || value.artifactManifestSizeBytes !== state.input.artifactManifestSizeBytes || value.artifactStageReceiptSha256 !== state.input.artifact || value.artifactStageReceiptSizeBytes !== state.input.artifactStageReceiptSizeBytes || value.dependencyArtifactManifestSha256 !== artifact.manifestSha256 || value.dependencyArtifactManifestSizeBytes !== artifact.manifestSizeBytes || value.dependencyArchiveSha256 !== artifact.archive.sha256 || value.dependencyArchiveSizeBytes !== artifact.archive.sizeBytes || value.dependencyArtifactTreeSha256 !== artifact.artifactTree.sha256 || value.dependencyArtifactTreeEntryCount !== artifact.artifactTree.entryCount || value.dependencyArtifactTreeTotalBytes !== artifact.artifactTree.totalBytes || value.assemblySha256 !== state.input.assembly || value.packageSha256 !== state.input.package || value.packageLockSha256 !== state.input.lock || !HASH.test(value.nodeModulesTreeSha256 || "") || !Number.isSafeInteger(value.nodeModulesTreeEntryCount) || value.nodeModulesTreeEntryCount < 1 || !Number.isSafeInteger(value.nodeModulesTreeTotalBytes) || value.nodeModulesTreeTotalBytes < 0 || value.serviceUid !== state.service.uid || value.serviceGid !== state.service.gid || !Number.isSafeInteger(value.storageProjectId) || value.storageProjectId <= 0 || !HASH.test(value.storageQuotaEvidenceSha256 || "") || !HASH.test(value.serviceSmokeEvidenceSha256 || "") || !iso(value.safetyEvidenceCapturedAt) || !iso(value.createdAt) || tree && (value.nodeModulesTreeSha256 !== tree.sha256 || value.nodeModulesTreeEntryCount !== tree.entryCount || value.nodeModulesTreeTotalBytes !== tree.totalBytes) || safety && (value.storageProjectId !== safety.projectId || value.storageQuotaEvidenceSha256 !== safety.quotaEvidenceSha256 || value.serviceSmokeEvidenceSha256 !== safety.serviceSmokeEvidenceSha256 || value.safetyEvidenceCapturedAt !== safety.capturedAt)) fail("dependency_receipt_mismatch"); }
function receiptDirectory(context, runtime) { const parent = base(context.receipts, runtime, "dependency_receipt_publish_failed"), path = resolve(parent, context.candidate); if (!existsSync(path)) make(path, parent, runtime.enforceOwnership ? 0 : runtime.getuid(), runtime.enforceOwnership ? 0 : runtime.getgid(), 0o700, "dependency_receipt_publish_failed"); else if (readdirSync(directory(path, runtime, "dependency_receipt_publish_failed")).length) fail("dependency_receipt_present"); return directory(path, runtime, "dependency_receipt_publish_failed"); }
function writeReceipt(state, payload, runtime) {
  const parent = receiptDirectory(state.c, runtime), path = resolve(parent, "node-modules-materialization.json");
  if (!same(path, state.c.receipt) || existsSync(path)) fail("dependency_receipt_present");
  const temporary = resolve(parent, `.node-modules-materialization.${process.pid}.${randomUUID()}`), bytes = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`);
  let descriptor, temporaryIdentity = null, temporaryRemoved = false, final = null;
  try {
    writeFileSync(temporary, bytes, { mode: 0o600, flag: "wx" });
    descriptor = openSync(temporary, fsConstants.O_RDONLY | (process.platform === "linux" ? fsConstants.O_NOFOLLOW : 0));
    const createdMetadata = fstatSync(descriptor);
    if (!createdMetadata.isFile() || createdMetadata.nlink !== 1) fail("dependency_receipt_publish_failed");
    temporaryIdentity = inode(createdMetadata);
    closeSync(descriptor);
    descriptor = undefined;
    const created = regular(temporary, runtime, "dependency_receipt_publish_failed", 0o600, true);
    if (inode(created.metadata) !== temporaryIdentity) fail("dependency_receipt_publish_failed");
    if (runtime.enforceOwnership) chownSync(temporary, 0, 0);
    chmodSync(temporary, 0o600);
    fsync(temporary, "dependency_receipt_publish_failed");
    const source = regular(temporary, runtime, "dependency_receipt_publish_failed", 0o600, true);
    if (inode(source.metadata) !== temporaryIdentity) fail("dependency_receipt_publish_failed");
    linkSync(temporary, path);
    final = { path, identity: temporaryIdentity };
    const linked = stat(path, "dependency_receipt_publish_failed");
    if (linked.isSymbolicLink() || !linked.isFile() || inode(linked) !== temporaryIdentity) fail("dependency_receipt_publish_failed");
    unlinkSync(temporary);
    temporaryRemoved = true;
    fsync(parent, "dependency_receipt_publish_failed");
    const published = regular(path, runtime, "dependency_receipt_publish_failed", 0o600, true);
    if (inode(published.metadata) !== temporaryIdentity || hashFile(published.path) !== hash(bytes)) fail("dependency_receipt_publish_failed");
    return { path: published.path, identity: temporaryIdentity, value: json(published.path, "dependency_receipt_publish_failed") };
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    if (temporaryIdentity === null) {
      try {
        const observed = lstatSync(temporary);
        if (observed.isFile() && !observed.isSymbolicLink() && observed.nlink === 1) temporaryIdentity = inode(observed);
      } catch { /* retain attention-required if the unique temp object cannot be rebound */ }
    }
    const temporaryClean = temporaryRemoved ? !existsSync(temporary) : temporaryIdentity === null ? !existsSync(temporary) : eraseFile({ path: temporary, identity: temporaryIdentity });
    const finalClean = !final || eraseFile(final);
    if (!temporaryClean || !finalClean) fail("dependency_receipt_publish_failed", true);
    if (error instanceof CandidateDependencyGateError) throw error;
    fail("dependency_receipt_publish_failed");
  }
}
function readReceipt(context, runtime) { if (!existsSync(context.receipt)) fail("dependency_receipt_missing"); const file = regular(context.receipt, runtime, "dependency_receipt_invalid", 0o600, true); return { path: file.path, identity: inode(file.metadata), value: json(file.path, "dependency_receipt_invalid") }; }
function report(mode, state, value, tree = null, applied = false, artifact = null) { return { schemaVersion: CANDIDATE_DEPENDENCY_GATE_SCHEMA_VERSION, type: CANDIDATE_DEPENDENCY_GATE_TYPE, mode, state, applied, releaseUnit: UNIT, currentRelease: value.c.current, candidateRelease: value.c.candidate, servicePrincipal: { uid: value.service.uid, gid: value.service.gid }, sourceBinding: { artifactManifestBound: true, artifactStageReceiptBound: true, assemblyManifestBound: true, packageLockBound: true, ...(artifact ? { dependencyArtifactBound: true } : {}) }, ...(tree ? { dependencyTree: { audited: true, nativeBetterSqlite3: true, snapshotImportSafe: true, hardlinksBroken: tree.hardlinksBroken ?? tree.broken } } : {}), ...(["preflight", "verify"].includes(mode) ? { binding: { packageSha256: value.input.package, packageLockSha256: value.input.lock, assemblySha256: value.input.assembly, artifactManifestSha256: value.input.artifactManifest, artifactManifestSizeBytes: value.input.artifactManifestSizeBytes, artifactStageReceiptSha256: value.input.artifact, artifactStageReceiptSizeBytes: value.input.artifactStageReceiptSizeBytes, ...(artifact ? { dependencyArtifactManifestSha256: artifact.manifestSha256, dependencyArchiveSha256: artifact.archive.sha256 } : {}) } } : {}) }; }

export function preflightCandidateDependencies({ candidateRelease, expectedCurrentRelease, runtime: supplied = runtime() } = {}) {
  // A topology-only result must not be reported as production-ready while the
  // storage quota and sandboxed native-smoke gates remain unavailable.
  if (supplied.requireRoot) fail("worker_storage_limit_unavailable");
  const initial = state(candidateRelease, expectedCurrentRelease, supplied);
  renameSupport(supplied);
  return report("preflight", "ready", steady(initial, supplied));
}

function requestedMaterializationIdentity(expectedSourceCommit, expectedArtifactRelease, expectedDependencyManifestSha256, expectedDependencyArchiveSha256) {
  if (!COMMIT.test(expectedSourceCommit || "") || !ARTIFACT_RELEASE.test(expectedArtifactRelease || "") || !HASH.test(expectedDependencyManifestSha256 || "") || !HASH.test(expectedDependencyArchiveSha256 || "")) fail("invalid_input");
  return Object.freeze({ sourceCommit: expectedSourceCommit, artifactRelease: expectedArtifactRelease, manifestSha256: expectedDependencyManifestSha256, archiveSha256: expectedDependencyArchiveSha256 });
}

function materializationIdentity(value, expectedSourceCommit, expectedArtifactRelease, expectedDependencyManifestSha256, expectedDependencyArchiveSha256) {
  const requested = requestedMaterializationIdentity(expectedSourceCommit, expectedArtifactRelease, expectedDependencyManifestSha256, expectedDependencyArchiveSha256);
  if (value.input.source.sourceCommit !== requested.sourceCommit) fail("dependency_source_mismatch");
  if (value.input.source.artifactRelease !== requested.artifactRelease) fail("dependency_release_mismatch");
  return requested;
}

function rootOwnedRegular(path, supplied, condition, exactMode) {
  const value = regular(path, supplied, condition, exactMode, true);
  if (supplied.requireRoot && (value.metadata.uid !== 0 || value.metadata.gid !== 0)) fail(condition);
  sealedAclCapabilities(value.path, supplied, false, condition);
  return value;
}

function materializationArtifactInput(value, identity, supplied) {
  const paths = dependencyArtifactPaths({ deploymentRoot: value.c.root, candidateRelease: value.c.candidate });
  if (!same(paths.nodeModulesRoot, resolve(value.c.candidateRoot, "node_modules")) || !inside(resolve(value.c.root, "dependency-artifacts"), paths.artifactRoot)) fail("dependency_consumer_contract_invalid");
  if (supplied.requireRoot) trustedAclAncestorChain(paths.artifactRoot, supplied, "dependency_consumer_contract_invalid");
  const root = directory(paths.artifactRoot, supplied, "dependency_consumer_contract_invalid");
  const metadata = stat(root, "dependency_consumer_contract_invalid");
  if ((mode(metadata) & 0o777) !== 0o700 || supplied.requireRoot && (metadata.uid !== 0 || metadata.gid !== 0)) fail("dependency_consumer_contract_invalid");
  if (readdirSync(root).sort().join(",") !== "dependency-artifact.json,node-modules.tar,release-label.txt") fail("dependency_consumer_contract_invalid");
  sealedAclCapabilities(root, supplied, true, "dependency_consumer_contract_invalid");
  const releaseLabel = rootOwnedRegular(paths.releaseLabelPath, supplied, "dependency_consumer_contract_invalid", 0o400);
  let releaseBytes;
  try { releaseBytes = readFileSync(releaseLabel.path); } catch { fail("dependency_consumer_contract_invalid"); }
  if (!releaseBytes.equals(Buffer.from(`${identity.artifactRelease}\n`))) fail("dependency_consumer_contract_invalid");
  return Object.freeze({
    paths,
    manifest: rootOwnedRegular(paths.manifestPath, supplied, "dependency_consumer_contract_invalid", 0o400),
    archive: rootOwnedRegular(paths.archivePath, supplied, "dependency_consumer_contract_invalid", 0o400),
    releaseLabel
  });
}

function artifactToolRuntime(supplied, service = null) {
  const identity = service ? { uid: service.uid, gid: service.gid } : {};
  if (supplied.requireRoot || supplied.allowA3PhysicalValidation === true && supplied.allowSyntheticA3Evidence !== true) {
    const tools = transientTools(supplied);
    return Object.freeze({
      enforceOwnership: true,
      pythonPath: tool(tools.python, supplied),
      getfaclPath: tool(tools.getfacl, supplied),
      getcapPath: tool(tools.getcap, supplied),
      nodePath: tool(tools.node, supplied),
      npmPath: tool(tools.npm, supplied),
      ...identity
    });
  }
  return Object.freeze({
    enforceOwnership: supplied.enforceOwnership,
    pythonPath: supplied.tools?.python,
    getfaclPath: supplied.tools?.getfacl,
    getcapPath: supplied.tools?.getcap,
    nodePath: supplied.tools?.node,
    checkAclCapabilities: supplied.checkAclCapabilities,
    listArchive: supplied.listArtifactArchive,
    detect: supplied.detectArtifact,
    nativeSmoke: supplied.nativeSmoke,
    ...identity
  });
}

function artifactEvidence(value, identity) {
  const manifestSha256 = value?.manifestSha256 ?? value?.manifest?.sha256;
  const manifestSizeBytes = value?.manifestSizeBytes ?? value?.manifest?.sizeBytes;
  const archive = value?.archive;
  const tree = value?.tree;
  if (!value || value.state !== "verified" || value.sourceCommit !== identity.sourceCommit || value.artifactRelease !== identity.artifactRelease
    || !HASH.test(manifestSha256 || "") || !Number.isSafeInteger(manifestSizeBytes) || manifestSizeBytes <= 0
    || !archive || !HASH.test(archive.sha256 || "") || !Number.isSafeInteger(archive.sizeBytes) || archive.sizeBytes <= 0
    || !tree || !HASH.test(tree.sha256 || "") || !Number.isSafeInteger(tree.entryCount) || tree.entryCount < 1 || !Number.isSafeInteger(tree.totalBytes) || tree.totalBytes < 0 || tree.hardlinksBroken !== true || typeof tree.symlinksInternal !== "boolean"
    || manifestSha256 !== identity.manifestSha256 || archive.sha256 !== identity.archiveSha256) fail("dependency_artifact_invalid");
  return Object.freeze({ manifestSha256, manifestSizeBytes, archive: Object.freeze({ sha256: archive.sha256, sizeBytes: archive.sizeBytes }), artifactTree: Object.freeze({ sha256: tree.sha256, entryCount: tree.entryCount, totalBytes: tree.totalBytes, hardlinksBroken: tree.hardlinksBroken, symlinksInternal: tree.symlinksInternal }) });
}

function artifactStaging(context, supplied) {
  if (supplied.requireRoot) trustedAclAncestorChain(dirname(context.staging), supplied, "candidate_tree_invalid");
  const owner = rootWorkerOwner(supplied), parent = directory(dirname(context.staging), supplied, "candidate_tree_invalid");
  const root = rootControlledDirectory(context.staging, parent, owner, 0o711, "candidate_tree_invalid");
  if (readdirSync(root.path).length) fail("candidate_tree_invalid");
  if (supplied.requireRoot) sealedAclCapabilities(root.path, supplied, false, "candidate_tree_invalid");
  const stage = make(resolve(root.path, `artifact-${context.candidate}-${process.pid}-${randomUUID()}`), root.path, owner.uid, owner.gid, 0o711, "candidate_tree_invalid");
  if (stat(stage.path, "candidate_tree_invalid").dev !== stat(context.candidateRoot, "candidate_path_invalid").dev) {
    eraseDirectory(stage);
    fail("device_boundary_invalid");
  }
  return stage;
}

function normalizeArtifactTree(root, supplied) {
  const owner = rootWorkerOwner(supplied), todo = [root];
  while (todo.length) {
    const path = todo.pop(), metadata = stat(path, "candidate_tree_invalid");
    try {
      if (metadata.isSymbolicLink()) {
        if (process.platform !== "win32") lchownSync(path, owner.uid, owner.gid);
        continue;
      }
      if (!metadata.isDirectory() && !metadata.isFile()) fail("candidate_tree_invalid");
      if (process.platform !== "win32") chownSync(path, owner.uid, owner.gid);
      chmodSync(path, metadata.isDirectory() || (mode(metadata) & 0o111) ? 0o755 : 0o644);
      if (metadata.isDirectory()) for (const child of readdirSync(path)) todo.push(resolve(path, child));
    } catch (error) { if (error instanceof CandidateDependencyGateError) throw error; fail("candidate_tree_invalid"); }
  }
}

function stageSnapshotModule(extracted, context, supplied) {
  const source = snapshotSource(context, supplied), scripts = resolve(extracted.root, "scripts"), target = resolve(scripts, "control-plane-db-snapshot-gate.mjs"), owner = rootWorkerOwner(supplied);
  try {
    if (!existsSync(scripts)) mkdirSync(scripts, { mode: 0o755 });
    const directoryValue = directory(scripts, supplied, "native_module_validation_failed");
    if (!same(directoryValue, scripts)) fail("native_module_validation_failed");
    if (existsSync(target)) {
      const existing = rootOwnedRegular(target, supplied, "native_module_validation_failed", null);
      if (process.platform !== "win32") unlinkSync(existing.path); else unlinkSync(existing.path);
    }
    writeFileSync(target, readFileSync(source.path), { mode: 0o644, flag: "wx" });
    if (process.platform !== "win32") chownSync(target, owner.uid, owner.gid);
    chmodSync(target, 0o644);
    fsync(target, "native_module_validation_failed");
    if (hashFile(target) !== source.digest || hashFile(source.path) !== source.digest) fail("native_module_validation_failed");
    return target;
  } catch (error) { if (error instanceof CandidateDependencyGateError) throw error; fail("native_module_validation_failed"); }
}

function serviceNativeSmoke(root, service, supplied) {
  if (!service || service.uid <= 0 || service.gid <= 0) fail("service_identity_invalid");
  if (supplied.requireRoot === true) fail("worker_storage_limit_unavailable");
  if (supplied.allowTestWorkerStorage === true && typeof supplied.runServiceNativeSmoke === "function") {
    return runServiceNativeSmoke({ root, service, snapshotModule: "scripts/control-plane-db-snapshot-gate.mjs", runtime: supplied });
  }
  return runNativeBetterSqliteSmoke({
    root,
    snapshotModule: "scripts/control-plane-db-snapshot-gate.mjs",
    runtime: artifactToolRuntime(supplied, service)
  });
}

function prepareArtifactForMaterialization(value, identity, stage, supplied) {
  const input = materializationArtifactInput(value, identity, supplied);
  if (!supplied.requireRoot && typeof supplied.verifyArtifact === "function") {
    const verified = supplied.verifyArtifact({
      candidateRelease: value.c.candidate,
      expectedSourceCommit: identity.sourceCommit,
      expectedArtifactRelease: identity.artifactRelease,
      expectedDependencyManifestSha256: identity.manifestSha256,
      expectedDependencyArchiveSha256: identity.archiveSha256
    });
    return Object.freeze({ evidence: artifactEvidence(verified, identity), extracted: null });
  }
  try {
    const prepared = prepareDependencyArtifactTree({
      manifestBytes: readDependencyArtifactManifest(input.manifest.path),
      archivePath: input.archive.path,
      packageJsonBytes: value.input.packageBytes,
      packageLockBytes: value.input.lockBytes,
      expectedSourceCommit: identity.sourceCommit,
      expectedArtifactRelease: identity.artifactRelease,
      expectedManifestSha256: identity.manifestSha256,
      expectedArchiveSha256: identity.archiveSha256,
      destinationRoot: resolve(stage.path, "project"),
      runtime: artifactToolRuntime(supplied)
    });
    const verified = {
      state: "verified",
      sourceCommit: prepared.manifest.value.sourceCommit,
      artifactRelease: prepared.manifest.value.artifactRelease,
      manifestSha256: prepared.manifest.sha256,
      manifestSizeBytes: prepared.manifest.sizeBytes,
      archive: prepared.archive,
      tree: prepared.tree
    };
    return Object.freeze({ evidence: artifactEvidence(verified, identity), extracted: prepared.extracted });
  } catch (error) {
    if (error?.condition && SAFE.has(error.condition)) fail(error.condition, error.attentionRequired === true);
    fail("dependency_artifact_invalid", error?.attentionRequired === true);
  }
}

function materializationExtraction(prepared, stage, supplied) {
  const extracted = prepared.extracted || (!supplied.requireRoot && typeof supplied.extractArtifact === "function" ? supplied.extractArtifact({ destinationRoot: resolve(stage.path, "project") }) : null);
  if (!extracted || typeof extracted.root !== "string" || typeof extracted.nodeModulesRoot !== "string" || typeof extracted.cleanup !== "function") fail("dependency_archive_invalid");
  const expectedRoot = resolve(stage.path, "project"), expectedNodeModules = resolve(expectedRoot, "node_modules");
  if (!same(extracted.root, expectedRoot) || !same(extracted.nodeModulesRoot, expectedNodeModules)) fail("dependency_archive_invalid");
  return extracted;
}

function sameArtifactTree(tree, expected, condition) {
  if (!tree || tree.sha256 !== expected.sha256 || tree.entryCount !== expected.entryCount || tree.totalBytes !== expected.totalBytes
    || tree.hardlinksBroken !== expected.hardlinksBroken || tree.symlinksInternal !== expected.symlinksInternal) fail(condition);
}

function auditedPublishedTree(root, supplied, condition) {
  mounts([root], supplied);
  let tree;
  try {
    tree = auditDependencyTree(root, artifactToolRuntime(supplied));
  } catch (error) {
    if (error?.condition && SAFE.has(error.condition)) fail(error.condition, error.attentionRequired === true);
    fail(condition, error?.attentionRequired === true);
  }
  if (tree.hardlinksBroken !== true || tree.symlinksInternal !== true) fail(condition);
  return tree;
}

function recheckMaterializationArtifactInput(value, identity, evidence, supplied) {
  const input = materializationArtifactInput(value, identity, supplied);
  if (!supplied.requireRoot && typeof supplied.verifyArtifact === "function") return input;
  const manifestMetadata = stat(input.manifest.path, "dependency_file_changed");
  const archiveMetadata = stat(input.archive.path, "dependency_file_changed");
  if (manifestMetadata.size !== evidence.manifestSizeBytes || archiveMetadata.size !== evidence.archive.sizeBytes
    || hashFile(input.manifest.path) !== identity.manifestSha256 || hashFile(input.archive.path) !== identity.archiveSha256) fail("dependency_file_changed");
  return input;
}

function cleanupExtraction(extracted) {
  if (!extracted) return true;
  try { extracted.cleanup(); return true; } catch { return false; }
}
// Retired Phase A1 compatibility entrypoint. It previously invoked the generic
// artifact verifier as root, which would load an untrusted native addon outside
// the candidate service boundary. Production callers must use the materialize
// or verify entrypoints below, which bind state, custody, and service identity.
export function verifyCandidateDependencyArtifact(options = {}) {
  const expected = ["deploymentRoot", "candidateRelease", "expectedSourceCommit", "expectedArtifactRelease", "runtime"];
  if (!options || !keys(options, expected) || options.deploymentRoot !== DEFAULT_CONTROL_PLANE_DEPLOYMENT_ROOT
    || !LABEL.test(options.candidateRelease || "") || !COMMIT.test(options.expectedSourceCommit || "")
    || !ARTIFACT_RELEASE.test(options.expectedArtifactRelease || "") || !options.runtime
    || options.runtime.requireRoot !== true || options.runtime.enforceOwnership !== true) fail("dependency_consumer_contract_invalid");
  fail("worker_execution_failed");
}
export async function materializeCandidateDependencies({
  candidateRelease,
  expectedCurrentRelease,
  expectedSourceCommit,
  expectedArtifactRelease,
  expectedDependencyManifestSha256,
  expectedDependencyArchiveSha256,
  apply = false,
  runtime: supplied = runtime()
} = {}) {
  if (apply !== true) fail("apply_confirmation_required");
  const requested = requestedMaterializationIdentity(expectedSourceCommit, expectedArtifactRelease, expectedDependencyManifestSha256, expectedDependencyArchiveSha256);
  // The CI artifact removes host-side npm lifecycle execution, but extraction
  // still needs a hard aggregate storage budget and a sandboxed service smoke
  // runner before it can write on a production filesystem. Keep the production
  // route inert until those two independent boundaries are implemented.
  if (supplied.requireRoot) fail("worker_storage_limit_unavailable");
  let key, stage, extracted, published, receipt, evidence, quotaEvidence, safetyEvidence, result, error;
  try {
    let value = state(candidateRelease, expectedCurrentRelease, supplied);
    const identity = materializationIdentity(value, requested.sourceCommit, requested.artifactRelease, requested.manifestSha256, requested.archiveSha256);
    if (existsSync(value.c.receipt)) fail("dependency_receipt_present");
    key = lock(supplied);
    renameSupport(supplied);
    value = steady(value, supplied);
    materializationIdentity(value, identity.sourceCommit, identity.artifactRelease, identity.manifestSha256, identity.archiveSha256);
    if (supplied.requireRoot) trustedAclAncestorChain(value.c.candidateRoot, supplied, "candidate_path_invalid");
    requireAbsent(resolve(value.c.candidateRoot, "node_modules"), "candidate_node_modules_present");
  } catch (caught) {
    error = caught instanceof CandidateDependencyGateError ? caught : new CandidateDependencyGateError("postpublish_validation_failed");
  }

  try {
    if (error) throw error;
    let value = state(candidateRelease, expectedCurrentRelease, supplied);
    const identity = materializationIdentity(value, requested.sourceCommit, requested.artifactRelease, requested.manifestSha256, requested.archiveSha256);
    quotaEvidence = quotaEvidenceForMaterialization(supplied);
    stage = artifactStaging(value.c, supplied);
    const prepared = prepareArtifactForMaterialization(value, identity, stage, supplied);
    evidence = prepared.evidence;
    extracted = materializationExtraction(prepared, stage, supplied);
    const rawTree = auditedPublishedTree(extracted.nodeModulesRoot, supplied, "dependency_tree_invalid");
    sameArtifactTree(rawTree, evidence.artifactTree, "dependency_tree_mismatch");
    normalizeArtifactTree(extracted.root, supplied);
    stageSnapshotModule(extracted, value.c, supplied);
    const normalizedTree = auditedPublishedTree(extracted.nodeModulesRoot, supplied, "candidate_tree_invalid");
    serviceNativeSmoke(extracted.root, value.service, supplied);
    value = steady(value, supplied);
    materializationIdentity(value, identity.sourceCommit, identity.artifactRelease, identity.manifestSha256, identity.archiveSha256);
    recheckMaterializationArtifactInput(value, identity, evidence, supplied);
    const target = resolve(value.c.candidateRoot, "node_modules");
    requireAbsent(target, "candidate_node_modules_present");
    const sourceMetadata = stat(extracted.nodeModulesRoot, "candidate_tree_invalid");
    if (sourceMetadata.isSymbolicLink() || !sourceMetadata.isDirectory() || sourceMetadata.dev !== stat(value.c.candidateRoot, "candidate_path_invalid").dev) fail("device_boundary_invalid");
    rename(extracted.nodeModulesRoot, target, supplied);
    published = { path: target, parent: value.c.candidateRoot, identity: inode(sourceMetadata) };
    fsync(dirname(extracted.nodeModulesRoot), "node_modules_publish_failed");
    fsync(value.c.candidateRoot, "node_modules_publish_failed");
    const targetMetadata = stat(target, "node_modules_publish_failed");
    if (targetMetadata.isSymbolicLink() || !targetMetadata.isDirectory() || inode(targetMetadata) !== inode(sourceMetadata)) fail("node_modules_publish_failed", true);
    const finalTree = auditedPublishedTree(target, supplied, "postpublish_validation_failed");
    if (finalTree.sha256 !== normalizedTree.sha256 || finalTree.entryCount !== normalizedTree.entryCount || finalTree.totalBytes !== normalizedTree.totalBytes) fail("postpublish_validation_failed", true);
    const publishedSmoke = serviceNativeSmoke(value.c.candidateRoot, value.service, supplied);
    safetyEvidence = materializerSafetyEvidence(quotaEvidence, publishedSmoke, supplied);
    value = steady(value, supplied, false);
    materializationIdentity(value, identity.sourceCommit, identity.artifactRelease, identity.manifestSha256, identity.archiveSha256);
    recheckMaterializationArtifactInput(value, identity, evidence, supplied);
    receipt = writeReceipt(value, receiptPayload(value, evidence, finalTree, safetyEvidence, supplied), supplied);
    checkReceipt(receipt.value, value, evidence, finalTree, safetyEvidence);
    if (!cleanupExtraction(extracted)) fail("postpublish_cleanup_failed", true);
    extracted = null;
    if (!eraseDirectory(stage)) fail("postpublish_cleanup_failed", true);
    stage = null;
    value = steady(value, supplied, false);
    materializationIdentity(value, identity.sourceCommit, identity.artifactRelease, identity.manifestSha256, identity.archiveSha256);
    recheckMaterializationArtifactInput(value, identity, evidence, supplied);
    checkReceipt(readReceipt(value.c, supplied).value, value, evidence, finalTree, safetyEvidence);
    result = report("materialize", "materialized", value, finalTree, true, evidence);
  } catch (caught) {
    error = caught instanceof CandidateDependencyGateError ? caught : new CandidateDependencyGateError("postpublish_validation_failed");
    const receiptClean = !published || eraseFile(receipt);
    const publishedClean = !published || eraseDirectory(published);
    const extractedClean = cleanupExtraction(extracted);
    const stageClean = eraseDirectory(stage);
    if (!receiptClean || !publishedClean || !extractedClean || !stageClean) error = new CandidateDependencyGateError("postpublish_cleanup_failed", true);
  } finally {
    if (key && !unlock(key)) error = new CandidateDependencyGateError("lock_cleanup_failed", true);
  }
  if (error) throw error;
  return result;
}

export async function verifyCandidateDependencies({
  candidateRelease,
  expectedCurrentRelease,
  expectedSourceCommit,
  expectedArtifactRelease,
  expectedDependencyManifestSha256,
  expectedDependencyArchiveSha256,
  runtime: supplied = runtime()
} = {}) {
  const requested = requestedMaterializationIdentity(expectedSourceCommit, expectedArtifactRelease, expectedDependencyManifestSha256, expectedDependencyArchiveSha256);
  if (supplied.requireRoot) fail("worker_storage_limit_unavailable");
  let key, stage, extracted, result, error;
  try {
    let value = state(candidateRelease, expectedCurrentRelease, supplied, false);
    const identity = materializationIdentity(value, requested.sourceCommit, requested.artifactRelease, requested.manifestSha256, requested.archiveSha256);
    const target = resolve(value.c.candidateRoot, "node_modules");
    const targetMetadata = stat(target, "candidate_tree_invalid");
    if (targetMetadata.isSymbolicLink() || !targetMetadata.isDirectory()) fail("candidate_tree_invalid");
    key = lock(supplied);
    value = steady(value, supplied, false);
    materializationIdentity(value, identity.sourceCommit, identity.artifactRelease, identity.manifestSha256, identity.archiveSha256);
    if (supplied.requireRoot) trustedAclAncestorChain(value.c.candidateRoot, supplied, "candidate_path_invalid");
    const quotaEvidence = quotaEvidenceForMaterialization(supplied);
    stage = artifactStaging(value.c, supplied);
    const prepared = prepareArtifactForMaterialization(value, identity, stage, supplied);
    const evidence = prepared.evidence;
    extracted = materializationExtraction(prepared, stage, supplied);
    const rawTree = auditedPublishedTree(extracted.nodeModulesRoot, supplied, "dependency_tree_invalid");
    sameArtifactTree(rawTree, evidence.artifactTree, "dependency_tree_mismatch");
    const finalTree = auditedPublishedTree(target, supplied, "postpublish_validation_failed");
    const receipt = readReceipt(value.c, supplied);
    checkReceipt(receipt.value, value, evidence, finalTree);
    const publishedSmoke = serviceNativeSmoke(value.c.candidateRoot, value.service, supplied);
    const safetyEvidence = materializerSafetyEvidence(quotaEvidence, publishedSmoke, supplied, receipt.value.safetyEvidenceCapturedAt);
    checkReceipt(receipt.value, value, evidence, finalTree, safetyEvidence);
    value = steady(value, supplied, false);
    materializationIdentity(value, identity.sourceCommit, identity.artifactRelease, identity.manifestSha256, identity.archiveSha256);
    recheckMaterializationArtifactInput(value, identity, evidence, supplied);
    checkReceipt(readReceipt(value.c, supplied).value, value, evidence, finalTree, safetyEvidence);
    const extractedClean = cleanupExtraction(extracted);
    const stageClean = eraseDirectory(stage);
    if (!extractedClean || !stageClean) fail("postpublish_cleanup_failed", true);
    extracted = stage = null;
    result = report("verify", "verified", value, finalTree, false, evidence);
  } catch (caught) {
    error = caught instanceof CandidateDependencyGateError ? caught : new CandidateDependencyGateError("postpublish_validation_failed");
    const extractedClean = cleanupExtraction(extracted);
    const stageClean = eraseDirectory(stage);
    if (!extractedClean || !stageClean) error = new CandidateDependencyGateError("postpublish_cleanup_failed", true);
  } finally {
    if (key && !unlock(key)) error = new CandidateDependencyGateError("lock_cleanup_failed", true);
  }
  if (error) throw error;
  return result;
}

function args(argv) {
  const values = new Map(); let apply = false;
  const allowed = new Set(["--mode", "--candidate-release", "--expected-current-release", "--expected-source-commit", "--expected-artifact-release", "--expected-dependency-manifest-sha256", "--expected-dependency-archive-sha256"]);
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--apply") { if (apply) fail("invalid_input"); apply = true; continue; }
    const equals = typeof item === "string" ? item.indexOf("=") : -1, key = equals >= 0 ? item.slice(0, equals) : item;
    if (!allowed.has(key) || values.has(key)) fail("invalid_input");
    const value = equals >= 0 ? item.slice(equals + 1) : argv[++index];
    if (typeof value !== "string" || !value || value.startsWith("--")) fail("invalid_input");
    values.set(key, value);
  }
  const mode = values.get("--mode");
  if (!["preflight", "materialize", "verify"].includes(mode) || !values.has("--candidate-release") || !values.has("--expected-current-release") || (mode === "materialize") !== apply) fail(mode === "materialize" || apply ? "apply_confirmation_required" : "invalid_input");
  const result = { mode, candidateRelease: values.get("--candidate-release"), expectedCurrentRelease: values.get("--expected-current-release"), apply };
  if (mode !== "preflight") {
    for (const key of ["--expected-source-commit", "--expected-artifact-release", "--expected-dependency-manifest-sha256", "--expected-dependency-archive-sha256"]) if (!values.has(key)) fail("invalid_input");
    result.expectedSourceCommit = values.get("--expected-source-commit");
    result.expectedArtifactRelease = values.get("--expected-artifact-release");
    result.expectedDependencyManifestSha256 = values.get("--expected-dependency-manifest-sha256");
    result.expectedDependencyArchiveSha256 = values.get("--expected-dependency-archive-sha256");
  } else if (["--expected-source-commit", "--expected-artifact-release", "--expected-dependency-manifest-sha256", "--expected-dependency-archive-sha256"].some((key) => values.has(key))) fail("invalid_input");
  return result;
}
export async function runCandidateDependencyGateCli({ argv = process.argv.slice(2), stdout = process.stdout, stderr = process.stderr } = {}) { let mode = null; try { const value = args(argv); mode = value.mode; const result = mode === "preflight" ? preflightCandidateDependencies(value) : mode === "materialize" ? await materializeCandidateDependencies(value) : await verifyCandidateDependencies(value); stdout.write(`${JSON.stringify(result)}\n`); return 0; } catch (error) { const gate = error instanceof CandidateDependencyGateError ? error : null; stderr.write(`${JSON.stringify({ schemaVersion: CANDIDATE_DEPENDENCY_GATE_SCHEMA_VERSION, type: CANDIDATE_DEPENDENCY_GATE_TYPE, mode, state: gate?.attentionRequired ? "attention_required" : "blocked", condition: gate && SAFE.has(gate.condition) ? gate.condition : "postpublish_validation_failed" })}\n`); return 1; } }
if (process.argv[1] && (() => { try { return same(physical(process.argv[1], "invalid_input"), physical(fileURLToPath(import.meta.url), "invalid_input")); } catch { return false; } })()) {
  if (process.argv[2] === "--worker") {
    try { runCandidateDependencyWorker(); process.exitCode = 0; } catch { process.exitCode = 70; }
  } else process.exitCode = await runCandidateDependencyGateCli();
}
