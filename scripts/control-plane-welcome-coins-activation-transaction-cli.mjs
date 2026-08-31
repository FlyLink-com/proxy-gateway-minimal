import { createHash } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  readSync,
  realpathSync,
  statSync
} from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";

const EXECUTION_ENVELOPE_FD = 3;
const EXECUTION_ENVELOPE_MAX_BYTES = 16 * 1024;
const MAX_ARTIFACT_BYTES = 128 * 1024 * 1024;
const MAX_TREE_ENTRIES = 10_000;
const MAX_TREE_BYTES = 128 * 1024 * 1024;
const NODE_PATH = "/usr/bin/node";
const SERVICE_UNIT = "proxy-gateway-candidate.service";
const TRANSACTION_SCOPE = "welcome-coins-activation-transaction";
const DEACTIVATION_TRANSACTION_SCOPE = "welcome-coins-deactivation-transaction";
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const RELEASE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/u;
const BOOTSTRAP_MARKER = "verified-v1";

const ARTIFACT_KEYS = Object.freeze([
  "candidateRootSha256",
  "transactionCliSha256",
  "activationLibrarySha256",
  "snapshotLibrarySha256",
  "holderObserverSha256",
  "welcomeBonusMigrationsSha256",
  "coinWalletMigrationsSha256",
  "custodyCliSha256",
  "outerWrapperSha256",
  "nativeLauncherSha256",
  "postExecBootstrapSha256",
  "outerPostExecBootstrapSha256",
  "nativeBuildReceiptSha256",
  "nodeModulesTreeSha256",
  "nodeSha256"
]);

const FILE_SPECS = Object.freeze([
  Object.freeze({ path: "scripts/control-plane-welcome-coins-activation-transaction-cli.mjs", key: "transactionCliSha256", mode: "0644", kind: "file" }),
  Object.freeze({ path: "scripts/control-plane-welcome-coins-activation-gate-lib.mjs", key: "activationLibrarySha256", mode: "0644", kind: "file" }),
  Object.freeze({ path: "scripts/control-plane-db-snapshot-gate-lib.mjs", key: "snapshotLibrarySha256", mode: "0644", kind: "file" }),
  Object.freeze({ path: "scripts/control-plane-welcome-coins-holder-observer-lib.mjs", key: "holderObserverSha256", mode: "0644", kind: "file" }),
  Object.freeze({ path: "server/services/platform/portal-registration-welcome-bonus-migrations.mjs", key: "welcomeBonusMigrationsSha256", mode: "0644", kind: "file" }),
  Object.freeze({ path: "server/services/platform/coin-wallet-migrations.mjs", key: "coinWalletMigrationsSha256", mode: "0644", kind: "file" }),
  Object.freeze({ path: "scripts/control-plane-welcome-coins-activation-transaction-custody-cli.mjs", key: "custodyCliSha256", mode: "0644", kind: "file" }),
  Object.freeze({ path: "node_modules/.gccgw-native/welcome-coins-activation-outer-wrapper", key: "outerWrapperSha256", mode: "0755", kind: "static-pie" }),
  Object.freeze({ path: "node_modules/.gccgw-native/welcome-coins-custody-launcher", key: "nativeLauncherSha256", mode: "0755", kind: "pie" }),
  Object.freeze({ path: "node_modules/.gccgw-native/welcome-coins-post-exec-bootstrap.so", key: "postExecBootstrapSha256", mode: "0644", kind: "shared-object" }),
  Object.freeze({ path: "node_modules/.gccgw-native/welcome-coins-outer-post-exec-bootstrap.so", key: "outerPostExecBootstrapSha256", mode: "0644", kind: "shared-object" }),
  Object.freeze({ path: "node_modules/.gccgw-native/welcome-coins-native-build.json", key: "nativeBuildReceiptSha256", mode: "0644", kind: "json" })
]);

const ENVELOPE_TOP_LEVEL_KEYS = Object.freeze([
  "schemaVersion",
  "type",
  "scope",
  "approvalDigestSha256",
  "expiresAt",
  "retry",
  "serviceUnit",
  "expectedRelease",
  "expectedEnvironmentSha256",
  "canaryDigestCommitmentSha256",
  "servicePrincipal",
  "artifacts",
  "custody"
]);
const DEACTIVATION_ENVELOPE_TOP_LEVEL_KEYS = Object.freeze([
  "schemaVersion",
  "type",
  "scope",
  "approvalDigestSha256",
  "expiresAt",
  "retry",
  "serviceUnit",
  "expectedRelease",
  "expectedActiveEnvironmentSha256",
  "expectedDisabledEnvironmentSha256",
  "servicePrincipal",
  "artifacts"
]);

class OuterRuntimeError extends Error {
  constructor(condition = "outer_runtime_invalid") {
    super(condition);
    this.name = "OuterRuntimeError";
    this.condition = condition;
  }
}

const fail = (condition) => {
  throw new OuterRuntimeError(condition);
};
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const exactOrderedKeys = (value, keys) => Boolean(
  value
  && typeof value === "object"
  && !Array.isArray(value)
  && Object.keys(value).join("\0") === keys.join("\0")
);
const safeLinuxAbsolutePath = (value) => {
  if (
    typeof value !== "string"
    || !value.startsWith("/")
    || value.includes("\\")
    || /[\0\r\n]/u.test(value)
  ) {
    return false;
  }
  const segments = value.slice(1).split("/");
  return segments.every((segment) => segment && segment !== "." && segment !== "..");
};

function sameMetadata(left, right) {
  return ["dev", "ino", "size", "mode", "uid", "gid", "nlink", "mtimeNs", "ctimeNs"]
    .every((key) => left?.[key] === right?.[key]);
}

function validateTrustedAncestorChain(path) {
  if (!safeLinuxAbsolutePath(path)) fail();
  const segments = path.slice(1).split("/");
  let cursor = "/";
  for (const segment of segments) {
    cursor = resolve(cursor, segment);
    const metadata = lstatSync(cursor, { bigint: true });
    if (
      metadata.isSymbolicLink()
      || !metadata.isDirectory()
      || metadata.uid !== 0n
      || metadata.gid !== 0n
      || (metadata.mode & 0o7022n) !== 0n
      || realpathSync(cursor) !== cursor
    ) {
      fail();
    }
  }
}

function exactActivationEnvelope(value, candidateRoot) {
  const expiry = typeof value?.expiresAt === "string" ? new Date(value.expiresAt) : null;
  if (
    !exactOrderedKeys(value, ENVELOPE_TOP_LEVEL_KEYS)
    || value.schemaVersion !== "1"
    || value.type !== "control_plane_welcome_coins_activation_execution_envelope"
    || value.scope !== TRANSACTION_SCOPE
    || value.retry !== false
    || value.serviceUnit !== SERVICE_UNIT
    || !SHA256_PATTERN.test(value.approvalDigestSha256 ?? "")
    || !RELEASE_PATTERN.test(value.expectedRelease ?? "")
    || basename(candidateRoot) !== value.expectedRelease
    || !SHA256_PATTERN.test(value.expectedEnvironmentSha256 ?? "")
    || !SHA256_PATTERN.test(value.canaryDigestCommitmentSha256 ?? "")
    || !expiry
    || Number.isNaN(expiry.getTime())
    || expiry.toISOString() !== value.expiresAt
    || expiry.getTime() <= Date.now()
    || !exactOrderedKeys(value.servicePrincipal, ["uid", "gid"])
    || !Number.isSafeInteger(value.servicePrincipal.uid)
    || value.servicePrincipal.uid <= 0
    || !Number.isSafeInteger(value.servicePrincipal.gid)
    || value.servicePrincipal.gid <= 0
    || !exactOrderedKeys(value.artifacts, ARTIFACT_KEYS)
    || !ARTIFACT_KEYS.every((key) => SHA256_PATTERN.test(value.artifacts[key] ?? ""))
    || !exactOrderedKeys(value.custody, ["dbPath", "snapshotDirectory", "tempRoot"])
    || !Object.values(value.custody).every(safeLinuxAbsolutePath)
  ) {
    fail("execution_envelope_invalid");
  }
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    type: value.type,
    scope: value.scope,
    approvalDigestSha256: value.approvalDigestSha256,
    expiresAt: value.expiresAt,
    retry: false,
    serviceUnit: value.serviceUnit,
    expectedRelease: value.expectedRelease,
    expectedEnvironmentSha256: value.expectedEnvironmentSha256,
    canaryDigestCommitmentSha256: value.canaryDigestCommitmentSha256,
    servicePrincipal: Object.freeze({ ...value.servicePrincipal }),
    artifacts: Object.freeze({ ...value.artifacts }),
    custody: Object.freeze({ ...value.custody })
  });
}

function exactDeactivationEnvelope(value, candidateRoot) {
  const expiry = typeof value?.expiresAt === "string" ? new Date(value.expiresAt) : null;
  if (
    !exactOrderedKeys(value, DEACTIVATION_ENVELOPE_TOP_LEVEL_KEYS)
    || value.schemaVersion !== "1"
    || value.type !== "control_plane_welcome_coins_deactivation_execution_envelope"
    || value.scope !== DEACTIVATION_TRANSACTION_SCOPE
    || value.retry !== false
    || value.serviceUnit !== SERVICE_UNIT
    || !SHA256_PATTERN.test(value.approvalDigestSha256 ?? "")
    || !RELEASE_PATTERN.test(value.expectedRelease ?? "")
    || basename(candidateRoot) !== value.expectedRelease
    || !SHA256_PATTERN.test(value.expectedActiveEnvironmentSha256 ?? "")
    || !SHA256_PATTERN.test(value.expectedDisabledEnvironmentSha256 ?? "")
    || !expiry
    || Number.isNaN(expiry.getTime())
    || expiry.toISOString() !== value.expiresAt
    || expiry.getTime() <= Date.now()
    || !exactOrderedKeys(value.servicePrincipal, ["uid", "gid"])
    || !Number.isSafeInteger(value.servicePrincipal.uid)
    || value.servicePrincipal.uid <= 0
    || !Number.isSafeInteger(value.servicePrincipal.gid)
    || value.servicePrincipal.gid <= 0
    || !exactOrderedKeys(value.artifacts, ARTIFACT_KEYS)
    || !ARTIFACT_KEYS.every((key) => SHA256_PATTERN.test(value.artifacts[key] ?? ""))
  ) {
    fail("execution_envelope_invalid");
  }
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    type: value.type,
    scope: value.scope,
    approvalDigestSha256: value.approvalDigestSha256,
    expiresAt: value.expiresAt,
    retry: false,
    serviceUnit: value.serviceUnit,
    expectedRelease: value.expectedRelease,
    expectedActiveEnvironmentSha256: value.expectedActiveEnvironmentSha256,
    expectedDisabledEnvironmentSha256: value.expectedDisabledEnvironmentSha256,
    servicePrincipal: Object.freeze({ ...value.servicePrincipal }),
    artifacts: Object.freeze({ ...value.artifacts })
  });
}

function exactEnvelope(value, candidateRoot) {
  if (
    value?.type === "control_plane_welcome_coins_activation_execution_envelope"
    && value?.scope === TRANSACTION_SCOPE
  ) {
    return exactActivationEnvelope(value, candidateRoot);
  }
  if (
    value?.type === "control_plane_welcome_coins_deactivation_execution_envelope"
    && value?.scope === DEACTIVATION_TRANSACTION_SCOPE
  ) {
    return exactDeactivationEnvelope(value, candidateRoot);
  }
  fail("execution_envelope_invalid");
}

function validateFd3PositionInfo(info) {
  const flags = /^flags:\s*([0-7]+)$/mu.exec(info);
  const position = /^pos:\s*([0-9]+)$/mu.exec(info);
  if (
    !flags
    || (Number.parseInt(flags[1], 8) & 0o3) !== fsConstants.O_RDONLY
    || !position
    || position[1] !== "0"
  ) {
    fail("execution_envelope_invalid");
  }
}

function requireFd3PositionZero() {
  validateFd3PositionInfo(
    readFileSync(`/proc/self/fdinfo/${EXECUTION_ENVELOPE_FD}`, "utf8")
  );
}

function decodeExecutionEnvelopeBytes(bytes, candidateRoot) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 3 || bytes.at(-1) !== 0x0a) {
    fail("execution_envelope_invalid");
  }
  try {
    const payload = bytes.subarray(0, -1);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(payload);
    if (text.includes("\n") || text.includes("\r")) fail("execution_envelope_invalid");
    const value = JSON.parse(text);
    if (JSON.stringify(value) !== text) fail("execution_envelope_invalid");
    return Object.freeze({
      value: exactEnvelope(value, candidateRoot),
      envelopeSha256: sha256(bytes)
    });
  } catch (error) {
    if (error instanceof OuterRuntimeError) throw error;
    fail("execution_envelope_invalid");
  }
}

function readExecutionEnvelope(candidateRoot) {
  let bytes;
  const metadata = fstatSync(EXECUTION_ENVELOPE_FD, { bigint: true });
  if (
    !metadata.isFile()
    || metadata.uid !== 0n
    || metadata.gid !== 0n
    || metadata.nlink !== 1n
    || (metadata.mode & 0o7777n) !== 0o400n
    || metadata.size < 3n
    || metadata.size > BigInt(EXECUTION_ENVELOPE_MAX_BYTES)
  ) {
    fail("execution_envelope_invalid");
  }
  requireFd3PositionZero();
  bytes = Buffer.alloc(Number(metadata.size));
  let offset = 0;
  try {
    while (offset < bytes.length) {
      const count = readSync(
        EXECUTION_ENVELOPE_FD,
        bytes,
        offset,
        bytes.length - offset,
        offset
      );
      if (count <= 0) fail("execution_envelope_invalid");
      offset += count;
    }
    const after = fstatSync(EXECUTION_ENVELOPE_FD, { bigint: true });
    requireFd3PositionZero();
    if (!sameMetadata(metadata, after)) {
      fail("execution_envelope_invalid");
    }
    return decodeExecutionEnvelopeBytes(bytes, candidateRoot);
  } catch (error) {
    if (error instanceof OuterRuntimeError) throw error;
    fail("execution_envelope_invalid");
  } finally {
    bytes?.fill(0);
  }
}

function elfKind(bytes) {
  if (
    !Buffer.isBuffer(bytes)
    || bytes.length < 64
    || !bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))
    || bytes[4] !== 2
    || bytes[5] !== 1
    || bytes[6] !== 1
    || bytes.readUInt16LE(18) !== 62
  ) {
    return null;
  }
  const elfType = bytes.readUInt16LE(16);
  const programHeaderOffset = bytes.readBigUInt64LE(32);
  const entrySize = bytes.readUInt16LE(54);
  const entryCount = bytes.readUInt16LE(56);
  if (programHeaderOffset > BigInt(Number.MAX_SAFE_INTEGER) || entrySize < 56 || entryCount === 0) {
    return null;
  }
  const tableStart = Number(programHeaderOffset);
  const tableBytes = entrySize * entryCount;
  if (!Number.isSafeInteger(tableBytes) || tableStart + tableBytes > bytes.length) return null;
  const entryPoint = bytes.readBigUInt64LE(24);
  let hasInterpreter = false;
  for (let index = 0; index < entryCount; index += 1) {
    if (bytes.readUInt32LE(tableStart + index * entrySize) === 3) hasInterpreter = true;
  }
  if (elfType === 3 && hasInterpreter) return "pie";
  if (elfType === 3 && !hasInterpreter && entryPoint !== 0n) return "static-pie";
  if (elfType === 3 && !hasInterpreter && entryPoint === 0n) return "shared-object";
  if (elfType === 2 && hasInterpreter) return "elf";
  return null;
}

function readStableFile(path, { mode, kind, logicalPath = path } = {}) {
  let descriptor;
  let bytes;
  try {
    validateTrustedAncestorChain(dirname(path));
    const lexical = lstatSync(path, { bigint: true });
    if (
      lexical.isSymbolicLink()
      || !lexical.isFile()
      || realpathSync(path) !== path
      || lexical.uid !== 0n
      || lexical.gid !== 0n
      || lexical.nlink !== 1n
      || Number(lexical.mode & 0o7777n).toString(8).padStart(4, "0") !== mode
      || lexical.size <= 0n
      || lexical.size > BigInt(MAX_ARTIFACT_BYTES)
    ) {
      fail();
    }
    descriptor = openSync(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (!sameMetadata(lexical, before)) fail();
    bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const pathAfter = lstatSync(path, { bigint: true });
    if (!sameMetadata(before, after) || !sameMetadata(after, pathAfter) || bytes.length !== Number(after.size)) {
      fail();
    }
    const observedKind = ["elf", "pie", "static-pie", "shared-object"].includes(kind)
      ? elfKind(bytes)
      : null;
    if (
      kind === "pie" && observedKind !== "pie"
      || kind === "static-pie" && observedKind !== "static-pie"
      || kind === "shared-object" && observedKind !== "shared-object"
      || kind === "elf" && !["elf", "pie"].includes(observedKind)
    ) {
      fail();
    }
    if (kind === "json") {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) fail();
    }
    return Object.freeze({ path: logicalPath, sha256: sha256(bytes), sizeBytes: bytes.length, mode, kind });
  } catch (error) {
    if (error instanceof OuterRuntimeError) throw error;
    fail();
  } finally {
    bytes?.fill(0);
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { fail(); }
    }
  }
}

function isWithinOrSame(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}/`);
}

function inspectDependencyTree(path) {
  validateTrustedAncestorChain(path);
  const rootMetadata = lstatSync(path, { bigint: true });
  const rootRealPath = realpathSync(path);
  if (
    rootMetadata.isSymbolicLink()
    || !rootMetadata.isDirectory()
    || rootRealPath !== path
    || rootMetadata.uid !== 0n
    || rootMetadata.gid !== 0n
    || (rootMetadata.mode & 0o7022n) !== 0n
  ) {
    fail();
  }

  const lines = [];
  let entryCount = 0;
  let totalBytes = 0;
  const visit = (entryPath, logicalPath, depth) => {
    if (depth > 64 || /[:\uFFFD\0\r\n]/u.test(logicalPath)) fail();
    const metadata = lstatSync(entryPath, { bigint: true });
    if (
      metadata.uid !== 0n
      || metadata.gid !== 0n
      || !metadata.isSymbolicLink() && (metadata.mode & 0o7022n) !== 0n
    ) {
      fail();
    }
    entryCount += 1;
    if (entryCount > MAX_TREE_ENTRIES) fail();
    const mode = Number(metadata.mode & 0o7777n).toString(8);

    if (metadata.isDirectory()) {
      lines.push(`d:${logicalPath}:${mode}`);
      const children = readdirSync(entryPath).sort();
      for (const child of children) {
        if (!child || child === "." || child === ".." || /[:\uFFFD\0\r\n]/u.test(child)) fail();
        visit(resolve(entryPath, child), `${logicalPath}/${child}`, depth + 1);
      }
      const after = lstatSync(entryPath, { bigint: true });
      if (!sameMetadata(metadata, after) || readdirSync(entryPath).sort().join("\0") !== children.join("\0")) {
        fail();
      }
      return;
    }

    if (metadata.isSymbolicLink()) {
      const target = readlinkSync(entryPath);
      const targetRealPath = realpathSync(entryPath);
      const after = lstatSync(entryPath, { bigint: true });
      if (
        isAbsolute(target)
        || /[:\uFFFD\0\r\n]/u.test(target)
        || !isWithinOrSame(rootRealPath, targetRealPath)
        || !sameMetadata(metadata, after)
      ) {
        fail();
      }
      lines.push(`l:${logicalPath}:${target}`);
      return;
    }

    if (
      !metadata.isFile()
      || metadata.nlink !== 1n
      || metadata.size < 0n
      || metadata.size > BigInt(MAX_TREE_BYTES - totalBytes)
    ) {
      fail();
    }
    let descriptor;
    let bytes;
    try {
      descriptor = openSync(entryPath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
      const before = fstatSync(descriptor, { bigint: true });
      if (!sameMetadata(metadata, before)) fail();
      bytes = readFileSync(descriptor);
      const after = fstatSync(descriptor, { bigint: true });
      const pathAfter = lstatSync(entryPath, { bigint: true });
      if (!sameMetadata(before, after) || !sameMetadata(after, pathAfter) || bytes.length !== Number(after.size)) {
        fail();
      }
      totalBytes += bytes.length;
      lines.push(`f:${logicalPath}:${mode}:${bytes.length}:${sha256(bytes)}`);
    } finally {
      bytes?.fill(0);
      if (descriptor !== undefined) closeSync(descriptor);
    }
  };

  visit(rootRealPath, ".", 0);
  return Object.freeze({
    sha256: sha256(Buffer.from(`${lines.sort().join("\n")}\n`, "utf8")),
    entryCount,
    totalBytes,
    hardlinksBroken: true,
    symlinksInternal: true
  });
}

function exactOuterEnvironment() {
  const expected = [
    "LANG",
    "LC_ALL",
    "PATH",
    "WELCOME_COINS_CANDIDATE_ROOT",
    "WELCOME_COINS_OUTER_BOOTSTRAPPED",
    "WELCOME_COINS_OUTER_WRAPPER"
  ];
  if (
    Object.keys(process.env).sort().join("\0") !== expected.join("\0")
    || process.env.PATH !== "/usr/bin:/bin"
    || process.env.LANG !== "C"
    || process.env.LC_ALL !== "C"
    || process.env.WELCOME_COINS_OUTER_BOOTSTRAPPED !== BOOTSTRAP_MARKER
    || !safeLinuxAbsolutePath(process.env.WELCOME_COINS_CANDIDATE_ROOT)
    || !safeLinuxAbsolutePath(process.env.WELCOME_COINS_OUTER_WRAPPER)
  ) {
    fail();
  }
  const candidateRoot = process.env.WELCOME_COINS_CANDIDATE_ROOT;
  const expectedWrapper = resolve(candidateRoot, "node_modules/.gccgw-native/welcome-coins-activation-outer-wrapper");
  if (process.env.WELCOME_COINS_OUTER_WRAPPER !== expectedWrapper) fail();
  if (process.cwd() !== candidateRoot) fail();
  return candidateRoot;
}

function requireRootNodeRuntime() {
  if (
    process.platform !== "linux"
    || typeof process.getuid !== "function"
    || typeof process.geteuid !== "function"
    || typeof process.getgid !== "function"
    || typeof process.getegid !== "function"
    || process.getuid() !== 0
    || process.geteuid() !== 0
    || process.getgid() !== 0
    || process.getegid() !== 0
  ) {
    fail("invoker_not_root");
  }
  const status = readFileSync("/proc/self/status", "utf8");
  if (
    !/^Uid:\s+0\s+0\s+0\s+0$/mu.test(status)
    || !/^Gid:\s+0\s+0\s+0\s+0$/mu.test(status)
    || !/^Groups:\s*$/mu.test(status)
    || !/^NoNewPrivs:\s+1$/mu.test(status)
  ) {
    fail();
  }
}

export async function verifyWelcomeCoinsOuterRuntimeBeforeImport() {
  requireRootNodeRuntime();
  if (process.argv.length !== 1) fail();
  const candidateRoot = exactOuterEnvironment();
  validateTrustedAncestorChain(candidateRoot);
  const encodedExecutionEnvelope = readExecutionEnvelope(candidateRoot);
  const envelope = encodedExecutionEnvelope.value;
  const records = FILE_SPECS.map((spec) => {
    const path = resolve(candidateRoot, spec.path);
    if (!path.startsWith(`${candidateRoot}/`)) fail();
    const record = readStableFile(path, { ...spec, logicalPath: spec.path });
    if (record.sha256 !== envelope.artifacts[spec.key]) fail("execution_envelope_invalid");
    return record;
  });
  const dependencyTree = inspectDependencyTree(resolve(candidateRoot, "node_modules"));
  if (dependencyTree.sha256 !== envelope.artifacts.nodeModulesTreeSha256) {
    fail("execution_envelope_invalid");
  }
  const nodeRecord = readStableFile(NODE_PATH, { logicalPath: NODE_PATH, mode: "0755", kind: "elf" });
  const nodeExecutable = statSync("/proc/self/exe", { bigint: true });
  const nodePath = lstatSync(NODE_PATH, { bigint: true });
  if (!sameMetadata(nodeExecutable, nodePath) || nodeRecord.sha256 !== envelope.artifacts.nodeSha256) {
    fail("execution_envelope_invalid");
  }
  const candidateRootSha256 = sha256(Buffer.from(JSON.stringify({
    schemaVersion: "1",
    type: "welcome_coins_activation_candidate_control_surface",
    expectedRelease: envelope.expectedRelease,
    files: records,
    dependencyTree
  }), "utf8"));
  if (candidateRootSha256 !== envelope.artifacts.candidateRootSha256) {
    fail("execution_envelope_invalid");
  }
  requireFd3PositionZero();
  return Object.freeze({ encodedExecutionEnvelope, candidateRoot });
}

async function main() {
  try {
    const verified = await verifyWelcomeCoinsOuterRuntimeBeforeImport();
    const {
      runWelcomeCoinsActivationTransactionCli,
      runWelcomeCoinsDeactivationTransactionCli
    } = await import(
      "./scripts/control-plane-welcome-coins-activation-gate-lib.mjs"
    );
    const runner = verified.encodedExecutionEnvelope.value.type
      === "control_plane_welcome_coins_activation_execution_envelope"
      ? runWelcomeCoinsActivationTransactionCli
      : runWelcomeCoinsDeactivationTransactionCli;
    return await runner({
      encodedExecutionEnvelope: verified.encodedExecutionEnvelope
    });
  } catch (error) {
    const condition = error instanceof OuterRuntimeError
      && ["invoker_not_root", "execution_envelope_invalid"].includes(error.condition)
      ? error.condition
      : "outer_runtime_invalid";
    process.stderr.write(`${JSON.stringify({
      schemaVersion: "1",
      type: "control_plane_welcome_coins_production_transaction",
      state: "blocked",
      condition
    })}\n`);
    return 1;
  }
}

process.exitCode = await main();
