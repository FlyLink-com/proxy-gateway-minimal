import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync
} from "node:fs";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";

const RESTRICTED_CODE = "restricted_identity_rejected";
const BINDING_PATH = "/etc/gccgw/japan-tuic-additive-repair-binding.json";
const BOOTSTRAP_PATH = "/usr/local/libexec/gccgw/japan-tuic-additive-repair-bootstrap.mjs";
const RUNNER_PATH = "/usr/local/libexec/gccgw/japan-tuic-additive-repair-runner.mjs";
const ENTRYPOINT_PATH = "/usr/local/libexec/gccgw/japan-tuic-additive-repair-entrypoint";
const CODE_ROLES = Object.freeze(["bootstrap", "contract", "entrypoint", "frame", "runner", "state"]);
const APPLICATION_ROLES = Object.freeze(["contract", "frame", "runner", "state"]);
const CODE_PATHS = Object.freeze({
  bootstrap: BOOTSTRAP_PATH,
  contract: "/usr/local/libexec/gccgw/japan-tuic-additive-repair-contract.mjs",
  entrypoint: ENTRYPOINT_PATH,
  frame: "/usr/local/libexec/gccgw/japan-tuic-additive-repair-frame.mjs",
  runner: RUNNER_PATH,
  state: "/usr/local/libexec/gccgw/japan-tuic-additive-repair-state.mjs"
});
const TOP_LEVEL_KEYS = Object.freeze([
  "schemaVersion", "gateId", "expectedEuid", "expectedWorkflowCommit",
  "expectedNonceSha256", "expectedClaimSha256", "codeManifest", "toolManifest",
  "sshAuthorization", "sudoAuthorization", "paths", "pathPolicies", "units",
  "writerFreeze", "authorizationMarker"
]);
const MANIFEST_KEYS = Object.freeze([
  "path", "sizeBytes", "sha256", "type", "uid", "gid", "mode", "nlink"
]);
const LOWER_SHA256 = /^[0-9a-f]{64}$/;
const FAILURE = Object.freeze({});

function fail() {
  throw FAILURE;
}

function restricted() {
  const error = new Error(RESTRICTED_CODE);
  error.code = RESTRICTED_CODE;
  error.stack = RESTRICTED_CODE;
  throw error;
}

function record(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  return value;
}

function hasExactKeys(value, keys) {
  const actual = Object.keys(record(value));
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function maximumForRole(role) {
  if (role === "entrypoint") return 16384;
  if (role === "bootstrap") return 65536;
  return 1048576;
}

function validateInvocation() {
  if (process.platform !== "linux"
    || typeof process.geteuid !== "function"
    || process.geteuid() !== 0
    || process.execPath !== "/usr/bin/node"
    || fileURLToPath(import.meta.url) !== BOOTSTRAP_PATH
    || !Array.isArray(process.argv)
    || process.argv.length !== 4
    || process.argv[0] !== "/usr/bin/node"
    || process.argv[1] !== RUNNER_PATH
    || process.argv[2] !== "--binding"
    || process.argv[3] !== BINDING_PATH) fail();
  const environment = record(process.env);
  if (Object.prototype.hasOwnProperty.call(environment, "NODE_OPTIONS")
    || Object.prototype.hasOwnProperty.call(environment, "NODE_PATH")
    || (Object.prototype.hasOwnProperty.call(environment, "SSH_ORIGINAL_COMMAND")
      && environment.SSH_ORIGINAL_COMMAND !== "")) fail();
}

function validateOpenFlags() {
  if (constants.O_RDONLY !== 0x00000
    || constants.O_DIRECTORY !== 0x10000
    || constants.O_NOFOLLOW !== 0x20000
    || constants.O_CLOEXEC !== 0x80000) fail();
  return constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_CLOEXEC;
}

function canonicalAbsolutePath(path) {
  return typeof path === "string"
    && path.length > 1
    && path.length <= 4096
    && !path.includes("\0")
    && !path.includes("\\")
    && posix.isAbsolute(path)
    && posix.normalize(path) === path;
}

function validateAncestor(stats) {
  if (!stats
    || typeof stats.isDirectory !== "function"
    || !stats.isDirectory()
    || (typeof stats.isSymbolicLink === "function" && stats.isSymbolicLink())
    || stats.uid !== 0n
    || (stats.mode & 0o022n) !== 0n) fail();
}

function validateFileStats(stats, policy) {
  if (!stats
    || typeof stats.isFile !== "function"
    || !stats.isFile()
    || (typeof stats.isSymbolicLink === "function" && stats.isSymbolicLink())
    || stats.uid !== BigInt(policy.uid)
    || stats.gid !== BigInt(policy.gid)
    || (stats.mode & 0o7777n) !== BigInt(policy.mode)
    || stats.nlink !== 1n
    || typeof stats.dev !== "bigint"
    || typeof stats.ino !== "bigint"
    || typeof stats.size !== "bigint") fail();
}

function validatePathChain(path, policy) {
  if (!canonicalAbsolutePath(path)) fail();
  const components = path.split("/").filter(Boolean);
  validateAncestor(lstatSync("/", { bigint: true }));
  let current = "";
  for (let index = 0; index < components.length - 1; index += 1) {
    current += "/" + components[index];
    validateAncestor(lstatSync(current, { bigint: true }));
  }
  const finalStats = lstatSync(path, { bigint: true });
  validateFileStats(finalStats, policy);
  return finalStats;
}

function readOpenedFile(fd, stats, maximum, expectedSize) {
  if (stats.size < 1n
    || stats.size > BigInt(maximum)
    || (expectedSize !== null && stats.size !== BigInt(expectedSize))) fail();
  const size = Number(stats.size);
  const bytes = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    let count;
    try {
      count = readSync(fd, bytes, offset, size - offset, offset);
    } catch (error) {
      if (error && error.code === "EINTR") continue;
      fail();
    }
    if (!Number.isInteger(count) || count <= 0 || count > size - offset) fail();
    offset += count;
  }
  while (true) {
    try {
      const count = readSync(fd, Buffer.alloc(1), 0, 1, size);
      if (count !== 0) fail();
      break;
    } catch (error) {
      if (!error || error.code !== "EINTR") fail();
    }
  }
  return bytes;
}

function readTrustedFile(path, policy, maximum, expectedSize = null) {
  const lstat = validatePathChain(path, policy);
  let fd;
  let opened = false;
  let result;
  let failure = null;
  try {
    fd = openSync(path, validateOpenFlags());
    opened = true;
    const initial = fstatSync(fd, { bigint: true });
    validateFileStats(initial, policy);
    if (initial.dev !== lstat.dev || initial.ino !== lstat.ino) fail();
    result = readOpenedFile(fd, initial, maximum, expectedSize);
    const after = fstatSync(fd, { bigint: true });
    validateFileStats(after, policy);
    if (after.dev !== initial.dev || after.ino !== initial.ino || after.size !== initial.size) fail();
  } catch (error) {
    failure = error;
  }
  if (opened) {
    try {
      closeSync(fd);
    } catch (error) {
      failure = error;
    }
  }
  if (failure) fail();
  return result;
}

function validateManifestEntry(role, input) {
  const value = record(input);
  const maximum = maximumForRole(role);
  const mode = role === "entrypoint" ? 0o755 : 0o644;
  if (!hasExactKeys(value, MANIFEST_KEYS)
    || value.path !== CODE_PATHS[role]
    || !Number.isSafeInteger(value.sizeBytes)
    || value.sizeBytes <= 0
    || value.sizeBytes > maximum
    || typeof value.sha256 !== "string"
    || !LOWER_SHA256.test(value.sha256)
    || value.type !== "file"
    || value.uid !== 0
    || value.gid !== 0
    || value.mode !== mode
    || value.nlink !== 1) fail();
  return value;
}

function loadBinding() {
  const bytes = readTrustedFile(
    BINDING_PATH,
    { uid: 0, gid: 0, mode: 0o600 },
    65536
  );
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) fail();
  let text;
  let parsed;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    parsed = JSON.parse(text);
  } catch (error) {
    fail();
  }
  const binding = record(parsed);
  if (text !== JSON.stringify(binding) + "\n"
    || !hasExactKeys(binding, TOP_LEVEL_KEYS)
    || binding.schemaVersion !== "3"
    || binding.expectedEuid !== 0) fail();
  const codeManifest = record(binding.codeManifest);
  if (!hasExactKeys(codeManifest, CODE_ROLES)) fail();
  for (const role of CODE_ROLES) validateManifestEntry(role, codeManifest[role]);
  return binding;
}

function enforceBootstrap() {
  validateInvocation();
  validateOpenFlags();
  const binding = loadBinding();
  for (const role of APPLICATION_ROLES) {
    const entry = binding.codeManifest[role];
    const bytes = readTrustedFile(
      entry.path,
      { uid: entry.uid, gid: entry.gid, mode: entry.mode },
      maximumForRole(role),
      entry.sizeBytes
    );
    if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256) fail();
  }
  // Entrypoint/bootstrap runtime envelope checks are defense in depth only.
  // Installation readback authorizes the already executing TCB bytes.
}

try {
  enforceBootstrap();
} catch (error) {
  restricted();
}
