import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as runnerModule from "../../scripts/japan-tuic-additive-repair-runner.mjs";

import {
  JAPAN_TUIC_REPAIR_GATE,
  JAPAN_TUIC_REPAIR_GATE_V3
} from "../../scripts/japan-tuic-additive-repair-contract.mjs";
import { executionClaimSha256 } from "../../scripts/japan-tuic-additive-repair-state.mjs";
import {
  buildCanonicalRunnerBinding,
  buildCanonicalSudoEffectivePolicy,
  buildCanonicalSudoSourceClosure,
  createHostOperations,
  deriveWaitBudget,
  executeJapanTuicAdditiveRepair,
  loadRootOwnedBinding,
  parseCanonicalAuthorizedKeyLine,
  runJapanTuicAdditiveRepairCli,
  validateArchiveEntries,
  validateRunnerBinding,
  validateTrustedPathChain
} from "../../scripts/japan-tuic-additive-repair-runner.mjs";

const EMPTY_SHA256 = createHash("sha256").update(Buffer.alloc(0)).digest("hex");
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHA_C = "c".repeat(64);
const WORKFLOW_COMMIT = "d".repeat(40);
const AUTHORIZATION_MARKER = JAPAN_TUIC_REPAIR_GATE_V3.executionGateId;
const BOOTSTRAP_PATH = "/usr/local/libexec/gccgw/japan-tuic-additive-repair-bootstrap.mjs";
const ENTRYPOINT_PATH = "/usr/local/libexec/gccgw/japan-tuic-additive-repair-entrypoint";
const BINDING_PATH = "/etc/gccgw/japan-tuic-additive-repair-binding.json";
const AUTHORIZED_KEYS_PATH = "/etc/ssh/authorized_keys/gccgw-japan-repair-ci";
const HOME_PATH = "/var/lib/gccgw-japan-repair-ci";
const SUDOERS_PATH = "/etc/sudoers.d/gccgw-japan-repair-ci";

function v3Paths() {
  return {
    authorizedKeys: AUTHORIZED_KEYS_PATH,
    backupDirectory: "/var/lib/gccgw/japan-tuic-additive-repair/backups",
    currentMap: "/protected/japan-tuic-map.json",
    lockFile: "/var/lib/gccgw/japan-tuic-additive-repair/repair.lock",
    materialStore: "/protected/material-store.json",
    mihomoConfig: "/protected/mihomo-config.yaml",
    naturalObservation: "/protected/natural-observation.json",
    producerStatus: "/protected/producer-status.json",
    stateDirectory: "/var/lib/gccgw/japan-tuic-additive-repair",
    sudoersFile: SUDOERS_PATH,
    temporaryRoot: "/var/lib/gccgw/japan-tuic-additive-repair/tmp"
  };
}

function v3PathPolicies() {
  return {
    authorizedKeys: { type: "file", uid: 0, gid: 0, mode: 0o600, nlink: 1 },
    backupDirectory: { type: "directory", uid: 0, gid: 0, mode: 0o700, nlink: null },
    currentMap: { type: "file", uid: 1000, gid: 1000, mode: 0o600, nlink: 1 },
    lockFile: { type: "file", uid: 0, gid: 0, mode: 0o600, nlink: 1 },
    materialStore: { type: "file", uid: 1000, gid: 1000, mode: 0o400, nlink: 1 },
    mihomoConfig: { type: "file", uid: 1000, gid: 1000, mode: 0o600, nlink: 1 },
    naturalObservation: { type: "file", uid: 1000, gid: 1000, mode: 0o400, nlink: 1 },
    producerStatus: { type: "file", uid: 1000, gid: 1000, mode: 0o600, nlink: 1 },
    stateDirectory: { type: "directory", uid: 0, gid: 0, mode: 0o700, nlink: null },
    sudoersFile: { type: "file", uid: 0, gid: 0, mode: 0o440, nlink: 1 },
    temporaryRoot: { type: "directory", uid: 0, gid: 0, mode: 0o700, nlink: null }
  };
}

function codeEntry(path, mode, overrides = {}) {
  return {
    path,
    sizeBytes: 1024,
    sha256: SHA_A,
    type: "file",
    uid: 0,
    gid: 0,
    mode,
    nlink: 1,
    ...overrides
  };
}

function v3CodeManifest() {
  return {
    bootstrap: codeEntry(BOOTSTRAP_PATH, 0o644),
    contract: codeEntry("/usr/local/libexec/gccgw/japan-tuic-additive-repair-contract.mjs", 0o644),
    entrypoint: codeEntry(ENTRYPOINT_PATH, 0o755),
    frame: codeEntry("/usr/local/libexec/gccgw/japan-tuic-additive-repair-frame.mjs", 0o644),
    runner: codeEntry("/usr/local/libexec/gccgw/japan-tuic-additive-repair-runner.mjs", 0o644),
    state: codeEntry("/usr/local/libexec/gccgw/japan-tuic-additive-repair-state.mjs", 0o644)
  };
}

function toolEntry(path, mode, overrides = {}) {
  return {
    path,
    sizeBytes: 4096,
    sha256: SHA_B,
    type: "file",
    uid: 0,
    gid: 0,
    mode,
    nlink: 1,
    capabilitySha256: EMPTY_SHA256,
    ...overrides
  };
}

function v3EightToolManifest() {
  return {
    dash: toolEntry("/usr/bin/dash", 0o755),
    env: toolEntry("/usr/bin/env", 0o755),
    flock: toolEntry("/usr/bin/flock", 0o755),
    node: toolEntry("/usr/bin/node", 0o755),
    sudo: toolEntry("/usr/bin/sudo", 0o4755),
    systemctl: toolEntry("/usr/bin/systemctl", 0o755),
    unzip: toolEntry("/usr/bin/unzip", 0o755),
    visudo: toolEntry("/usr/sbin/visudo", 0o755)
  };
}

function v3ToolManifest() {
  const legacy = v3EightToolManifest();
  return {
    dash: legacy.dash,
    env: legacy.env,
    flock: legacy.flock,
    getent: toolEntry("/usr/bin/getent", 0o755),
    id: toolEntry("/usr/bin/id", 0o755),
    node: legacy.node,
    sudo: legacy.sudo,
    systemctl: legacy.systemctl,
    unzip: legacy.unzip,
    visudo: legacy.visudo
  };
}

function v3TenToolManifest() {
  return v3ToolManifest();
}

function v3SshAuthorization() {
  return {
    algorithm: "ssh-ed25519",
    authorizedKeysFile: AUTHORIZED_KEYS_PATH,
    authorizedKeysLineSha256: SHA_A,
    effectiveConfigSha256: SHA_B,
    homeDirectory: HOME_PATH,
    homeDirectoryPolicy: { type: "directory", uid: 0, gid: 0, mode: 0o755, nlink: null },
    loginShell: "/usr/bin/dash",
    loginShellPolicy: { type: "file", uid: 0, gid: 0, mode: 0o755, nlink: 1, sha256: SHA_B },
    publicKeyBlobSha256: SHA_C,
    uid: 975,
    username: "gccgw-japan-repair-ci"
  };
}

function v3SudoAuthorization() {
  return {
    schemaVersion: "1",
    type: "japan_ci_sudo_authorization",
    username: "gccgw-japan-repair-ci",
    uid: 975,
    sudoersFile: SUDOERS_PATH,
    sudoersFileSha256: SHA_C,
    command: ENTRYPOINT_PATH,
    commandArguments: [],
    runAsUid: 0,
    runAsGid: 0,
    nonInteractive: true,
    nopasswd: true,
    envReset: true,
    setenvAllowed: false,
    securePath: "/usr/sbin:/usr/bin:/sbin:/bin",
    otherRuleCount: 0,
    sourceClosureSha256: SHA_A,
    effectivePolicySha256: SHA_B
  };
}

function v3Binding(overrides = {}) {
  const expectedClaimSha256 = executionClaimSha256({
    artifactSha256: JAPAN_TUIC_REPAIR_GATE_V3.artifact.sha256,
    executionGateId: JAPAN_TUIC_REPAIR_GATE_V3.executionGateId,
    executionNonce: JAPAN_TUIC_REPAIR_GATE_V3.executionNonce,
    releaseUnit: JAPAN_TUIC_REPAIR_GATE_V3.releaseUnit,
    strategy: JAPAN_TUIC_REPAIR_GATE_V3.strategy,
    surface: JAPAN_TUIC_REPAIR_GATE_V3.surface,
    target: JAPAN_TUIC_REPAIR_GATE_V3.target,
    workflowCommit: WORKFLOW_COMMIT
  });
  return {
    schemaVersion: "3",
    gateId: JAPAN_TUIC_REPAIR_GATE_V3.executionGateId,
    expectedEuid: 0,
    expectedWorkflowCommit: WORKFLOW_COMMIT,
    expectedNonceSha256: JAPAN_TUIC_REPAIR_GATE_V3.expectedNonceSha256,
    expectedClaimSha256,
    codeManifest: v3CodeManifest(),
    toolManifest: v3ToolManifest(),
    sshAuthorization: v3SshAuthorization(),
    sudoAuthorization: v3SudoAuthorization(),
    paths: v3Paths(),
    pathPolicies: v3PathPolicies(),
    units: {
      service: "gccgw-traffic-usage-collect.service",
      timer: "gccgw-traffic-usage-collect.timer"
    },
    writerFreeze: {
      knownWriterCount: 0,
      evidenceSha256: SHA_C,
      residualRisk: "bound_writer_concurrency_not_machine_proven"
    },
    authorizationMarker: AUTHORIZATION_MARKER,
    ...overrides
  };
}

function accountCore(overrides = {}) {
  return {
    username: "gccgw-japan-repair-ci",
    uid: 975,
    homeDirectory: HOME_PATH,
    loginShell: "/usr/bin/dash",
    passwordLocked: true,
    primaryGroupId: 975,
    groupIds: [1100, 975],
    groupNames: ["repair", "ops"],
    ...overrides
  };
}

function accountOperations(reads, calls = []) {
  let index = 0;
  return {
    readAccount(username) {
      calls.push(username);
      const value = reads[Math.min(index, reads.length - 1)];
      index += 1;
      return value;
    }
  };
}

function nativeAccountBinding() {
  const binding = v3Binding({ toolManifest: v3TenToolManifest() });
  const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const getentBytes = Buffer.from("native-getent", "ascii");
  const idBytes = Buffer.from("native-id", "ascii");
  return {
    ...binding,
    toolManifest: {
      ...binding.toolManifest,
      getent: {
        ...binding.toolManifest.getent,
        sizeBytes: getentBytes.length,
        sha256: digest(getentBytes)
      },
      id: {
        ...binding.toolManifest.id,
        sizeBytes: idBytes.length,
        sha256: digest(idBytes)
      }
    }
  };
}

function nativeAccountOutputs(overrides = {}) {
  const encode = (value) => Buffer.from(value, "utf8").toString("base64");
  const records = [
    "gccgw-japan-repair-ci:x:975:975:SENSITIVE_SENTINEL:/var/lib/gccgw-japan-repair-ci:/usr/bin/dash\n",
    "gccgw-japan-repair-ci:!SENSITIVE_SENTINEL:1:2:3:4:5:6:7\n",
    "975\n",
    "975\n",
    "1100 975\n",
    "repair ops\n"
  ];
  return records.map((stdout, index) => ({
    stdout: encode(stdout),
    status: 0,
    signal: null,
    ...overrides[index]
  }));
}

function nativeAccountVmProbe({ binding, outputs }) {
  const directory = mkdtempSync(join(tmpdir(), "japan-account-vm-"));
  const harnessPath = join(directory, "harness.mjs");
  const payloadPath = join(directory, "payload.json");
  const runnerPath = fileURLToPath(new URL("../../scripts/japan-tuic-additive-repair-runner.mjs", import.meta.url));
  const harness = String.raw`
import { readFileSync } from "node:fs";
import * as crypto from "node:crypto";
import * as nodePath from "node:path";
import * as nodeUrl from "node:url";
import { promisify, types } from "node:util";
import vm from "node:vm";

const [runnerPath, payloadPath] = process.argv.slice(2);
const payload = JSON.parse(readFileSync(payloadPath, "utf8"));
const calls = [];
const captures = [];
const descriptors = new Map();
let nextFd = 70;
let outputIndex = 0;

const directoryStat = () => ({
  uid: 0n, gid: 0n, mode: 0o755n, nlink: 2n, dev: 1n, ino: 1n, size: 4096n,
  isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false
});
const toolBytes = new Map([
  ["/usr/bin/getent", Buffer.from("native-getent", "ascii")],
  ["/usr/bin/id", Buffer.from("native-id", "ascii")]
]);
const toolStat = (path) => {
  const bytes = toolBytes.get(path);
  return {
    uid: 0n, gid: 0n, mode: 0o755n, nlink: 1n, dev: 1n,
    ino: path.endsWith("getent") ? 2n : 3n, size: BigInt(bytes.length),
    isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false
  };
};
const unused = () => { throw new Error("unused synthetic builtin"); };
const fs = {
  chmodSync: unused, chownSync: unused, copyFileSync: unused, existsSync: unused,
  mkdirSync: unused, mkdtempSync: unused, readFileSync: unused, realpathSync: unused,
  renameSync: unused, rmSync: unused, statSync: unused, writeFileSync: unused, writeSync: unused,
  constants: { O_RDONLY: 0, O_DIRECTORY: 0x10000, O_NOFOLLOW: 0x20000, O_CLOEXEC: 0x80000 },
  lstatSync(path) {
    calls.push(["lstat", path]);
    return toolBytes.has(path) ? toolStat(path) : directoryStat();
  },
  openSync(path, flags) {
    calls.push(["open", path, flags]);
    if (!toolBytes.has(path)) throw new Error("unexpected open");
    const fd = nextFd++;
    descriptors.set(fd, path);
    return fd;
  },
  fstatSync(fd) {
    calls.push(["fstat", fd]);
    const path = descriptors.get(fd);
    if (!path) throw new Error("unexpected fd");
    return toolStat(path);
  },
  readSync(fd, buffer, offset, length, position) {
    calls.push(["read", fd, offset, length, position]);
    const bytes = toolBytes.get(descriptors.get(fd));
    if (!bytes || position >= bytes.length) return 0;
    const count = Math.min(length, bytes.length - position);
    bytes.copy(buffer, offset, position, position + count);
    return count;
  },
  closeSync(fd) {
    calls.push(["close", fd]);
    if (!descriptors.delete(fd)) throw new Error("unexpected close");
  }
};
const spawnSync = (executable, arguments_, options) => {
  calls.push(["spawn", executable, arguments_, {
    shell: options.shell,
    cwd: options.cwd,
    envKeys: Object.keys(options.env),
    env: options.env,
    encoding: options.encoding,
    timeout: options.timeout,
    maxBuffer: options.maxBuffer,
    windowsHide: options.windowsHide,
    stdio: options.stdio
  }]);
  const output = payload.outputs[outputIndex++];
  if (!output) throw new Error("unexpected spawn");
  const stdout = Buffer.from(output.stdout, "base64");
  const stderr = Buffer.from(output.stderr || "", "base64");
  captures.push(stdout, stderr);
  return { error: output.error ? new Error("synthetic") : undefined, status: output.status, signal: output.signal, stdout, stderr };
};
const context = vm.createContext({
  Buffer,
  TextDecoder,
  process: { argv: [], env: {}, platform: "linux", stdin: {}, stdout: { write() {} }, stderr: { write() {} } }
});
const synthetic = (names, values) => new vm.SyntheticModule(names, function () {
  for (const name of names) this.setExport(name, values[name]);
}, { context });
const contractError = class JapanTuicRepairContractError extends Error {
  constructor(code) { super(code); this.code = code; }
};
const modules = new Map([
  ["node:crypto", synthetic(["createHash", "randomUUID"], crypto)],
  ["node:fs", synthetic(Object.keys(fs), fs)],
  ["node:child_process", synthetic(["execFile", "spawnSync"], { execFile: unused, spawnSync })],
  ["node:util", synthetic(["promisify", "types"], { promisify, types })],
  ["node:path", synthetic(["dirname", "join", "posix", "resolve"], nodePath)],
  ["node:url", synthetic(["pathToFileURL", "fileURLToPath"], nodeUrl)],
  ["./japan-tuic-additive-repair-contract.mjs", synthetic([
    "JAPAN_TUIC_REPAIR_GATE", "JAPAN_TUIC_REPAIR_GATE_V3", "JapanTuicRepairContractError",
    "validateArtifactIdentity", "validateCandidateReport", "validateExecutionReceipt", "validateNaturalObservation", "validatePostApplyIdentity"
  ], {
    JAPAN_TUIC_REPAIR_GATE: {},
    JAPAN_TUIC_REPAIR_GATE_V3: {
      executionGateId: payload.binding.gateId,
      expectedNonceSha256: payload.binding.expectedNonceSha256,
      artifact: { sha256: "f".repeat(64) }, releaseUnit: "unit", strategy: "strategy", surface: "surface", target: "target"
    },
    JapanTuicRepairContractError: contractError,
    validateArtifactIdentity: unused, validateCandidateReport: unused, validateExecutionReceipt: unused,
    validateNaturalObservation: unused, validatePostApplyIdentity: unused
  })],
  ["./japan-tuic-additive-repair-state.mjs", synthetic(["executionClaimSha256"], {
    executionClaimSha256: () => payload.binding.expectedClaimSha256
  })]
]);
const source = readFileSync(runnerPath, "utf8") + "\nexport { createNativeAccountOperations as __test_createNativeAccountOperations };\n";
const module = new vm.SourceTextModule(source, { context, identifier: runnerPath });
await module.link((specifier) => {
  const linked = modules.get(specifier);
  if (!linked) throw new Error("unexpected import:" + specifier);
  return linked;
});
await module.evaluate();
const sentinel = Buffer.from("SENSITIVE_SENTINEL", "ascii");
const originalToString = Buffer.prototype.toString;
const originalBufferFrom = Buffer.from;
const accountAsciiCopies = [];
let account;
let error;
try {
  const nativeOperations = module.namespace.__test_createNativeAccountOperations(payload.binding);
  Buffer.from = function (value, encoding, ...arguments_) {
    const copy = originalBufferFrom.call(Buffer, value, encoding, ...arguments_);
    if (typeof value === "string" && encoding === "ascii") accountAsciiCopies.push(copy);
    return copy;
  };
  Buffer.prototype.toString = function (...arguments_) {
    if (this.includes(sentinel)) throw new Error("whole_sensitive_decode");
    return originalToString.apply(this, arguments_);
  };
  account = nativeOperations.readAccount();
} catch (caught) {
  error = caught && caught.code ? caught.code : "unexpected";
} finally {
  Buffer.from = originalBufferFrom;
  Buffer.prototype.toString = originalToString;
}
process.stdout.write(JSON.stringify({
  account: account && {
    username: account.username,
    uid: account.uid,
    homeDirectory: account.homeDirectory,
    loginShell: account.loginShell,
    passwordLocked: account.passwordLocked,
    primaryGroupId: account.primaryGroupId,
    groupIds: account.groupIds,
    groupNameCount: account.groupNames.length,
    groupNamesAreCanonical: account.groupNames.length === 2
      ? account.groupNames[0] === "ops" && account.groupNames[1] === "repair"
      : account.groupNames.every((name, index, values) => index === 0 || Buffer.compare(
        Buffer.from(values[index - 1], "ascii"), Buffer.from(name, "ascii")
      ) < 0)
  },
  error,
  calls,
  outputCount: outputIndex,
  zeroized: captures.every((buffer) => buffer.every((byte) => byte === 0)),
  accountAsciiCopyCount: accountAsciiCopies.length,
  accountAsciiCopiesZeroized: accountAsciiCopies.every((buffer) => buffer.every((byte) => byte === 0))
}));
`;
  writeFileSync(harnessPath, harness, "utf8");
  writeFileSync(payloadPath, JSON.stringify({ binding, outputs }), "utf8");
  try {
    const result = spawnSync(process.execPath, ["--experimental-vm-modules", harnessPath, runnerPath, payloadPath], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function sudoClosure(overrides = {}) {
  return {
    schemaVersion: "1",
    type: "japan_ci_sudo_source_closure",
    rootConfig: "/etc/sudoers",
    files: [
      { ordinal: 0, path: "/etc/sudoers", sha256: SHA_A, uid: 0, gid: 0, mode: 0o440, nlink: 1 },
      { ordinal: 1, path: SUDOERS_PATH, sha256: SHA_C, uid: 0, gid: 0, mode: 0o440, nlink: 1 }
    ],
    ...overrides
  };
}

function sudoPolicyInput(overrides = {}) {
  return {
    schemaVersion: "1",
    type: "japan_ci_sudo_effective_policy",
    username: "gccgw-japan-repair-ci",
    uid: 975,
    command: ENTRYPOINT_PATH,
    commandArguments: [],
    runAsUid: 0,
    runAsGid: 0,
    nonInteractive: true,
    nopasswd: true,
    envReset: true,
    setenvAllowed: false,
    securePath: "/usr/sbin:/usr/bin:/sbin:/bin",
    matchedRuleCount: 1,
    otherRuleCount: 0,
    sourceClosure: sudoClosure(),
    ...overrides
  };
}

function validBinding(overrides = {}) {
  return {
    schemaVersion: "1",
    gateId: JAPAN_TUIC_REPAIR_GATE.executionGateId,
    paths: {
      currentMap: "/protected/japan-tuic-map.json",
      mihomoConfig: "/protected/mihomo-config.yaml",
      materialStore: "/protected/material-store.json",
      producerStatus: "/protected/producer-status.json",
      naturalObservation: "/protected/natural-observation.json",
      backupDirectory: "/protected/backups",
      temporaryRoot: "/protected/temporary",
      authorizedKeys: "/protected/authorized_keys"
    },
    units: {
      timer: "gccgw-traffic-usage-collect.timer",
      service: "gccgw-traffic-usage-collect.service"
    },
    authorizationMarker: "github-actions-japan-tuic-additive-repair-20260716-001",
    ...overrides
  };
}

function candidateReport(overrides = {}) {
  return {
    ok: true,
    candidateReady: true,
    candidate: {
      addCount: 3,
      removeCount: 0,
      deferredRemoveCount: 27,
      deferredChangedCount: 0,
      missingMaterialCount: 0,
      projectedMapCount: 82,
      ready: true,
      ...overrides
    }
  };
}

function postCandidateReport(overrides = {}) {
  return {
    ok: true,
    candidateReady: true,
    candidate: {
      addCount: 0,
      removeCount: 0,
      deferredRemoveCount: 27,
      deferredChangedCount: 0,
      missingMaterialCount: 0,
      projectedMapCount: 82,
      ready: true,
      ...overrides
    }
  };
}

function identityBefore(overrides = {}) {
  return { ...JAPAN_TUIC_REPAIR_GATE.before, ...overrides };
}

function identityAfter(overrides = {}) {
  return { ...JAPAN_TUIC_REPAIR_GATE.after, ...overrides };
}

function timerState(overrides = {}) {
  return {
    active: true,
    enabled: true,
    timerRestarts: 0,
    serviceRestarts: 0,
    intervalSeconds: 300,
    ...overrides
  };
}

function observationBaseline(overrides = {}) {
  return {
    capturedAt: "2026-07-16T19:55:00.000Z",
    collectorCount: 5,
    unresolvedTotal: 1,
    ...overrides
  };
}

function observationCurrent(overrides = {}) {
  return {
    capturedAt: "2026-07-16T20:05:00.000Z",
    collectorInvocationObserved: true,
    collectorCount: 5,
    unresolvedTotal: 1,
    japanTuicUnresolved: 0,
    omittedCollectorCount: 0,
    omittedProducerCount: 0,
    provenanceConserved: true,
    validatorPassed: true,
    ...overrides
  };
}

function createOperations({
  firstCandidate = candidateReport(),
  secondCandidate = candidateReport(),
  beforeOne = identityBefore(),
  beforeTwo = identityBefore(),
  applied = { ...candidateReport(), applied: true, finalMode: "600" },
  postCandidate = postCandidateReport(),
  afterIdentity = identityAfter(),
  metadataBefore = { mode: 0o600, uid: 1000, gid: 1000 },
  metadataAfter = { mode: 0o600, uid: 1000, gid: 1000 },
  timerBefore = timerState(),
  timerAfter = timerState(),
  timerCurrent = timerAfter,
  baseline = observationBaseline(),
  current = observationCurrent(),
  currentSequence = null,
  restoreError = null,
  rollbackCandidate = candidateReport(),
  rollbackIdentity = identityBefore(),
  rollbackMetadata = { mode: 0o600, uid: 1000, gid: 1000 },
  removeTemporary = true,
  revokeAuthorization = true
} = {}) {
  const calls = [];
  let dryRunCount = 0;
  let identityCount = 0;
  let metadataCount = 0;
  let timerCount = 0;
  let observationCount = 0;
  const operations = {
    async receiveArtifact() {
      calls.push("receiveArtifact");
      return {
        path: "/gate/artifact.zip",
        sizeBytes: JAPAN_TUIC_REPAIR_GATE.artifact.sizeBytes,
        sha256: JAPAN_TUIC_REPAIR_GATE.artifact.sha256
      };
    },
    async listArchiveEntries() {
      calls.push("listArchiveEntries");
      return [
        "scripts/mihomo-tuic-usage-map-rebuild.mjs",
        "scripts/traffic-accounting-natural-observation.mjs",
        "server/services/platform/traffic-collector-admin-projection.mjs",
        "server/services/platform/traffic-collector-status-producers.mjs"
      ];
    },
    async extractArtifact() {
      calls.push("extractArtifact");
      return { root: "/gate/source" };
    },
    async runMapHelper({ apply }) {
      calls.push(`runMapHelper:${apply ? "apply" : "dry"}`);
      if (apply) return applied;
      dryRunCount += 1;
      if (dryRunCount === 1) return firstCandidate;
      if (dryRunCount === 2) return secondCandidate;
      if (dryRunCount === 3) return postCandidate;
      return rollbackCandidate;
    },
    async readIdentityGate() {
      identityCount += 1;
      const phase = identityCount <= 2 ? "before" : identityCount === 3 ? "after" : "rollback";
      calls.push(`readIdentityGate:${phase}`);
      if (identityCount === 1) return beforeOne;
      if (identityCount === 2) return beforeTwo;
      if (identityCount === 3) return afterIdentity;
      return rollbackIdentity;
    },
    async readFileMetadata() {
      metadataCount += 1;
      const phase = metadataCount === 1 ? "before" : metadataCount === 2 ? "after" : "rollback";
      calls.push(`readFileMetadata:${phase}`);
      if (metadataCount === 1) return metadataBefore;
      if (metadataCount === 2) return metadataAfter;
      return rollbackMetadata;
    },
    async createBackup() {
      calls.push("createBackup");
      return { ref: "bound-backup" };
    },
    async restoreBackup() {
      calls.push("restoreBackup");
      if (restoreError) throw restoreError;
    },
    async readTimerState() {
      timerCount += 1;
      const phase = timerCount === 1 ? "before" : timerCount === 2 ? "after" : "current";
      calls.push(`readTimerState:${phase}`);
      if (timerCount === 1) return timerBefore;
      if (timerCount === 2) return timerAfter;
      return timerCurrent;
    },
    async readNaturalObservation() {
      observationCount += 1;
      calls.push(`readNaturalObservation:${observationCount === 1 ? "baseline" : "current"}`);
      if (observationCount === 1) return baseline;
      if (!Array.isArray(currentSequence)) return current;
      const index = Math.min(observationCount - 2, currentSequence.length - 1);
      return currentSequence[index];
    },
    async sleep(milliseconds) {
      calls.push(`sleep:${milliseconds}`);
    },
    async removeTemporaryMaterial() {
      calls.push("removeTemporaryMaterial");
      return removeTemporary;
    },
    async revokeOwnAuthorization() {
      calls.push("revokeOwnAuthorization");
      return revokeAuthorization;
    }
  };
  return { calls, operations };
}

test("schema-3 binding builder emits every recursive key in the frozen order", () => {
  const binding = buildCanonicalRunnerBinding(v3Binding());
  assert.deepEqual(Object.keys(binding), [
    "schemaVersion", "gateId", "expectedEuid", "expectedWorkflowCommit",
    "expectedNonceSha256", "expectedClaimSha256", "codeManifest", "toolManifest",
    "sshAuthorization", "sudoAuthorization", "paths", "pathPolicies", "units",
    "writerFreeze", "authorizationMarker"
  ]);
  assert.deepEqual(Object.keys(binding.codeManifest), ["bootstrap", "contract", "entrypoint", "frame", "runner", "state"]);
  assert.deepEqual(binding.codeManifest.bootstrap, codeEntry(BOOTSTRAP_PATH, 0o644));
  assert.deepEqual(Object.keys(binding.toolManifest), ["dash", "env", "flock", "getent", "id", "node", "sudo", "systemctl", "unzip", "visudo"]);
  assert.deepEqual(Object.keys(binding.paths), [
    "authorizedKeys", "backupDirectory", "currentMap", "lockFile", "materialStore",
    "mihomoConfig", "naturalObservation", "producerStatus", "stateDirectory",
    "sudoersFile", "temporaryRoot"
  ]);
  assert.equal(`${JSON.stringify(binding)}\n`, `${JSON.stringify(v3Binding())}\n`);
});

test("schema 3 binds exact getent and id tool roles", () => {
  const binding = v3Binding({ toolManifest: v3TenToolManifest() });
  const canonical = buildCanonicalRunnerBinding(binding);
  assert.deepEqual(Object.keys(canonical.toolManifest), [
    "dash", "env", "flock", "getent", "id", "node", "sudo", "systemctl", "unzip", "visudo"
  ]);
  assert.equal(canonical.toolManifest.getent.path, "/usr/bin/getent");
  assert.equal(canonical.toolManifest.id.path, "/usr/bin/id");
  assert.equal(canonical.toolManifest.getent.mode, 0o755);
  assert.equal(canonical.toolManifest.id.mode, 0o755);
  const missing = { ...binding.toolManifest };
  delete missing.id;
  for (const toolManifest of [
    v3EightToolManifest(),
    missing,
    { ...binding.toolManifest, getent: { ...binding.toolManifest.getent, path: "/bin/getent" } },
    { ...binding.toolManifest, id: { ...binding.toolManifest.id, mode: 0o4755 } },
    { ...binding.toolManifest, id: { ...binding.toolManifest.id, capabilitySha256: SHA_A } }
  ]) {
    assert.throws(
      () => buildCanonicalRunnerBinding({ ...binding, toolManifest }),
      (error) => error.code === "restricted_identity_rejected"
    );
  }
});

test("account evidence uses only two exact projection reads and a frozen canonical core", () => {
  assert.equal(typeof runnerModule.collectBoundAccountEvidence, "function");
  const calls = [];
  const evidence = runnerModule.collectBoundAccountEvidence(
    v3Binding({ toolManifest: v3TenToolManifest() }),
    {
      accountOperations: accountOperations([
        accountCore(),
        accountCore({ groupIds: [975, 1100], groupNames: ["ops", "repair"] })
      ], calls)
    }
  );
  assert.deepEqual(calls, ["gccgw-japan-repair-ci", "gccgw-japan-repair-ci"]);
  assert.deepEqual(evidence, {
    username: "gccgw-japan-repair-ci",
    uid: 975,
    homeDirectory: HOME_PATH,
    loginShell: "/usr/bin/dash",
    passwordLocked: true,
    primaryGroupId: 975,
    groupIds: [975, 1100],
    groupNames: ["ops", "repair"]
  });
  assert.equal(Object.isFrozen(evidence), true);
  assert.equal(Object.isFrozen(evidence.groupIds), true);
  assert.equal(Object.isFrozen(evidence.groupNames), true);

  const rejectedCalls = [];
  const operations = accountOperations([accountCore()], rejectedCalls);
  assert.throws(
    () => runnerModule.collectBoundAccountEvidence(
      v3Binding({ toolManifest: v3TenToolManifest() }),
      { accountOperations: operations, extra: true }
    ),
    (error) => error.code === "restricted_identity_rejected"
  );
  assert.throws(
    () => runnerModule.collectBoundAccountEvidence(
      v3Binding({ toolManifest: v3TenToolManifest() }),
      { accountOperations: operations },
      "overload"
    ),
    (error) => error.code === "restricted_identity_rejected"
  );
  assert.deepEqual(rejectedCalls, []);
});

test("account evidence rejects uid home shell lock group and second-read drift", () => {
  assert.equal(typeof runnerModule.collectBoundAccountEvidence, "function");
  const binding = v3Binding({ toolManifest: v3TenToolManifest() });
  const failures = [
    accountCore({ uid: 0 }),
    accountCore({ homeDirectory: "/other" }),
    accountCore({ loginShell: "/bin/sh" }),
    accountCore({ passwordLocked: false }),
    accountCore({ primaryGroupId: 1001 }),
    accountCore({ groupIds: [975, 975] }),
    accountCore({ groupIds: [1100] }),
    accountCore({ groupNames: ["ops", "ops"] }),
    accountCore({ groupIds: Array.from({ length: 257 }, (_, index) => index + 1), groupNames: Array.from({ length: 257 }, (_, index) => `g${index}`) })
  ];
  for (const first of failures) {
    assert.throws(
      () => runnerModule.collectBoundAccountEvidence(binding, { accountOperations: accountOperations([first]) }),
      (error) => error.code === "restricted_identity_rejected"
    );
  }
  assert.throws(
    () => runnerModule.collectBoundAccountEvidence(binding, {
      accountOperations: accountOperations([accountCore(), accountCore({ groupNames: ["ops", "other"] })])
    }),
    (error) => error.code === "restricted_identity_rejected"
  );
});

test("account buffers are delimiter parsed by the actual private native source and zeroized", () => {
  const source = readFileSync(fileURLToPath(new URL("../../scripts/japan-tuic-additive-repair-runner.mjs", import.meta.url)), "utf8");
  assert.match(source, /function createNativeAccountOperations\(/);
  const encode = (value) => Buffer.from(value, "utf8").toString("base64");
  const probe = nativeAccountVmProbe({
    binding: nativeAccountBinding(),
    outputs: [
      { stdout: encode("gccgw-japan-repair-ci:x:975:975:SENSITIVE_SENTINEL:/var/lib/gccgw-japan-repair-ci:/usr/bin/dash\n"), status: 0, signal: null },
      { stdout: encode("gccgw-japan-repair-ci:!SENSITIVE_SENTINEL:1:2:3:4:5:6:7\n"), status: 0, signal: null },
      { stdout: encode("975\n"), status: 0, signal: null },
      { stdout: encode("975\n"), status: 0, signal: null },
      { stdout: encode("1100 975\n"), status: 0, signal: null },
      { stdout: encode("repair ops\n"), status: 0, signal: null }
    ]
  });
  assert.equal(probe.error, undefined);
  assert.equal(probe.outputCount, 6);
  assert.equal(probe.zeroized, true);
  assert.deepEqual(probe.account, {
    username: "gccgw-japan-repair-ci",
    uid: 975,
    homeDirectory: HOME_PATH,
    loginShell: "/usr/bin/dash",
    passwordLocked: true,
    primaryGroupId: 975,
    groupIds: [975, 1100],
    groupNameCount: 2,
    groupNamesAreCanonical: true
  });
  const trace = probe.calls.filter(([name]) => name === "open" || name === "spawn");
  assert.deepEqual(trace.map(([name, path]) => [name, path]), [
    ["open", "/usr/bin/getent"], ["spawn", "/usr/bin/getent"],
    ["open", "/usr/bin/getent"], ["spawn", "/usr/bin/getent"],
    ["open", "/usr/bin/id"], ["spawn", "/usr/bin/id"],
    ["open", "/usr/bin/id"], ["spawn", "/usr/bin/id"],
    ["open", "/usr/bin/id"], ["spawn", "/usr/bin/id"],
    ["open", "/usr/bin/id"], ["spawn", "/usr/bin/id"]
  ]);
  const spawns = probe.calls.filter(([name]) => name === "spawn");
  assert.deepEqual(spawns.map(([, executable, arguments_]) => [executable, arguments_]), [
    ["/usr/bin/getent", ["passwd", "gccgw-japan-repair-ci"]],
    ["/usr/bin/getent", ["shadow", "gccgw-japan-repair-ci"]],
    ["/usr/bin/id", ["-u", "--", "gccgw-japan-repair-ci"]],
    ["/usr/bin/id", ["-g", "--", "gccgw-japan-repair-ci"]],
    ["/usr/bin/id", ["-G", "--", "gccgw-japan-repair-ci"]],
    ["/usr/bin/id", ["-G", "-n", "--", "gccgw-japan-repair-ci"]]
  ]);
  for (const [, , , options] of spawns) {
    assert.deepEqual(options, {
      shell: false,
      cwd: "/",
      envKeys: ["LANG", "LC_ALL", "PATH"],
      env: { LANG: "C.UTF-8", LC_ALL: "C.UTF-8", PATH: "/usr/bin:/bin" },
      encoding: null,
      timeout: 5000,
      maxBuffer: 65536,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
  }
});

test("private native account source zeroizes every account-derived ASCII copy on success and rejection", () => {
  const encode = (value) => Buffer.from(value, "utf8").toString("base64");
  const probes = [
    {
      name: "success",
      outputs: nativeAccountOutputs(),
      error: undefined
    },
    {
      name: "duplicate group name",
      outputs: nativeAccountOutputs({ 5: { stdout: encode("ops ops\n") } }),
      error: "restricted_identity_rejected"
    },
    {
      name: "bound home comparison failure",
      outputs: nativeAccountOutputs({
        0: { stdout: encode("gccgw-japan-repair-ci:x:975:975:SENSITIVE_SENTINEL:/other:/usr/bin/dash\n") }
      }),
      error: "restricted_identity_rejected"
    }
  ];
  for (const expected of probes) {
    const probe = nativeAccountVmProbe({ binding: nativeAccountBinding(), outputs: expected.outputs });
    assert.equal(probe.error, expected.error, expected.name);
    assert.equal(probe.accountAsciiCopyCount, 0, expected.name);
    assert.equal(probe.accountAsciiCopiesZeroized, true, expected.name);
  }
});

test("private native account source rejects every fixed-process and Buffer grammar failure with zeroized captures", () => {
  const encode = (value) => Buffer.from(value, "utf8").toString("base64");
  const mutate = (index, replacement) => {
    const outputs = nativeAccountOutputs();
    outputs[index] = { ...outputs[index], ...replacement };
    return outputs;
  };
  const failures = [
    { name: "spawn error", outputs: mutate(0, { error: true }) },
    { name: "nonzero status", outputs: mutate(0, { status: 1 }) },
    { name: "signal", outputs: mutate(0, { signal: "SIGTERM" }) },
    { name: "stderr", outputs: mutate(0, { stderr: encode("SENSITIVE_SENTINEL") }) },
    { name: "oversize stdout", outputs: mutate(0, { stdout: encode("x".repeat(65537)) }) },
    { name: "passwd CR", outputs: mutate(0, { stdout: encode("gccgw-japan-repair-ci:x:975:975:SENSITIVE_SENTINEL:/var/lib/gccgw-japan-repair-ci:/usr/bin/dash\r\n") }) },
    { name: "shadow NUL", outputs: mutate(1, { stdout: encode("gccgw-japan-repair-ci:!SENSITIVE_SENTINEL\0:1:2:3:4:5:6:7\n") }) },
    { name: "shadow field count", outputs: mutate(1, { stdout: encode("gccgw-japan-repair-ci:!SENSITIVE_SENTINEL:1:2:3:4:5:6\n") }) },
    { name: "id second line", outputs: mutate(2, { stdout: encode("975\n976\n") }) },
    { name: "passwd field count", outputs: mutate(0, { stdout: encode("gccgw-japan-repair-ci:x:975:975:SENSITIVE_SENTINEL:/var/lib/gccgw-japan-repair-ci\n") }) },
    { name: "home mismatch", outputs: mutate(0, { stdout: encode("gccgw-japan-repair-ci:x:975:975:SENSITIVE_SENTINEL:/other:/usr/bin/dash\n") }) },
    { name: "shell mismatch", outputs: mutate(0, { stdout: encode("gccgw-japan-repair-ci:x:975:975:SENSITIVE_SENTINEL:/var/lib/gccgw-japan-repair-ci:/bin/sh\n") }) },
    { name: "unlocked shadow", outputs: mutate(1, { stdout: encode("gccgw-japan-repair-ci:x:1:2:3:4:5:6:7\n") }) },
    { name: "uid mismatch", outputs: mutate(2, { stdout: encode("976\n") }) },
    { name: "gid mismatch", outputs: mutate(3, { stdout: encode("976\n") }) },
    { name: "duplicate primary group", outputs: mutate(4, { stdout: encode("975 975\n") }) },
    { name: "missing primary group", outputs: mutate(4, { stdout: encode("1100 1200\n") }) },
    { name: "duplicate group name", outputs: mutate(5, { stdout: encode("ops ops\n") }) },
    { name: "group count mismatch", outputs: mutate(5, { stdout: encode("ops\n") }) },
    { name: "group name grammar", outputs: mutate(5, { stdout: encode("repair Ops\n") }) },
    {
      name: "257 groups",
      outputs: mutate(4, { stdout: encode(`${Array.from({ length: 257 }, (_, index) => index + 1).join(" ")}\n`) })
    }
  ];
  for (const failure of failures) {
    const probe = nativeAccountVmProbe({ binding: nativeAccountBinding(), outputs: failure.outputs });
    assert.equal(probe.error, "restricted_identity_rejected", failure.name);
    assert.equal(probe.zeroized, true, failure.name);
    assert.ok(probe.outputCount === 1 || probe.outputCount === 6, failure.name);
  }

  const driftedBinding = nativeAccountBinding();
  driftedBinding.toolManifest.getent = { ...driftedBinding.toolManifest.getent, sha256: SHA_A };
  const drifted = nativeAccountVmProbe({ binding: driftedBinding, outputs: nativeAccountOutputs() });
  assert.equal(drifted.error, "restricted_identity_rejected");
  assert.equal(drifted.outputCount, 0);
  assert.equal(drifted.zeroized, true);
  assert.equal(drifted.calls.some(([name]) => name === "spawn"), false);

  const maximumGroups = [975, ...Array.from({ length: 255 }, (_, index) => index + 1)];
  const maximumNames = Array.from({ length: 256 }, (_, index) => `g${index}`);
  const maximum = nativeAccountVmProbe({
    binding: nativeAccountBinding(),
    outputs: nativeAccountOutputs({
      4: { stdout: encode(`${maximumGroups.join(" ")}\n`) },
      5: { stdout: encode(`${maximumNames.join(" ")}\n`) }
    })
  });
  assert.equal(maximum.error, undefined);
  assert.equal(maximum.account.groupIds.length, 256);
  assert.equal(maximum.account.groupNameCount, 256);
  assert.equal(maximum.account.groupNamesAreCanonical, true);
  assert.equal(maximum.zeroized, true);
});

test("exported binding validator is schema-3-only and requires the exact root context", () => {
  const legacy = validBinding();
  assert.throws(
    () => validateRunnerBinding(legacy, { effectiveUid: 0, pathOperations: {} }),
    (error) => error.code === "restricted_identity_rejected"
  );
  assert.throws(
    () => validateRunnerBinding(v3Binding(), { effectiveUid: 0 }),
    (error) => error.code === "restricted_identity_rejected"
  );
  assert.throws(
    () => validateRunnerBinding(v3Binding(), { effectiveUid: 1, pathOperations: {} }),
    (error) => error.code === "restricted_identity_rejected"
  );
});

test("binding rejects relaxed fixed roles, alias paths, drifted claim, and manifest boundaries", () => {
  const binding = v3Binding();
  const failures = [
    { ...binding, gateId: "another-gate" },
    { ...binding, expectedClaimSha256: SHA_A },
    { ...binding, expectedWorkflowCommit: WORKFLOW_COMMIT.toUpperCase() },
    { ...binding, paths: { ...binding.paths, currentMap: binding.paths.mihomoConfig } },
    { ...binding, pathPolicies: { ...binding.pathPolicies, currentMap: { ...binding.pathPolicies.currentMap, mode: 0o644 } } },
    { ...binding, codeManifest: { ...binding.codeManifest, bootstrap: { ...binding.codeManifest.bootstrap, sizeBytes: 65537 } } },
    { ...binding, codeManifest: { ...binding.codeManifest, entrypoint: { ...binding.codeManifest.entrypoint, sizeBytes: 16385 } } },
    { ...binding, codeManifest: { ...binding.codeManifest, runner: { ...binding.codeManifest.runner, sizeBytes: 1048577 } } },
    { ...binding, toolManifest: { ...binding.toolManifest, node: { ...binding.toolManifest.node, sizeBytes: 268435457 } } },
    { ...binding, toolManifest: { ...binding.toolManifest, sudo: { ...binding.toolManifest.sudo, mode: 0o755 } } },
    { ...binding, toolManifest: { ...binding.toolManifest, node: { ...binding.toolManifest.node, mode: 0o4755 } } },
    { ...binding, toolManifest: { ...binding.toolManifest, dash: { ...binding.toolManifest.dash, capabilitySha256: SHA_A } } },
    { ...binding, sshAuthorization: { ...binding.sshAuthorization, loginShellPolicy: { ...binding.sshAuthorization.loginShellPolicy, sha256: SHA_A } } },
    { ...binding, writerFreeze: { ...binding.writerFreeze, residualRisk: "root_only_final_owner_not_machine_proven" } }
  ];
  for (const value of failures) {
    assert.throws(
      () => buildCanonicalRunnerBinding(value),
      (error) => error.code === "restricted_identity_rejected"
    );
  }
  assert.equal(buildCanonicalRunnerBinding({
    ...binding,
    codeManifest: {
      ...binding.codeManifest,
      bootstrap: { ...binding.codeManifest.bootstrap, sizeBytes: 65536 },
      entrypoint: { ...binding.codeManifest.entrypoint, sizeBytes: 16384 },
      runner: { ...binding.codeManifest.runner, sizeBytes: 1048576 }
    },
    toolManifest: {
      ...binding.toolManifest,
      node: { ...binding.toolManifest.node, sizeBytes: 268435456 }
    }
  }).schemaVersion, "3");
});

test("binding rejects relative, missing, and extra path fields", () => {
  const binding = v3Binding();
  assert.throws(
    () => buildCanonicalRunnerBinding({
      ...binding,
      paths: { ...binding.paths, currentMap: "relative.json" }
    }),
    (error) => error.code === "restricted_identity_rejected"
  );
  const { naturalObservation: _removed, ...missingPath } = binding.paths;
  assert.throws(
    () => buildCanonicalRunnerBinding({ ...binding, paths: missingPath }),
    (error) => error.code === "restricted_identity_rejected"
  );
  assert.throws(
    () => buildCanonicalRunnerBinding({ ...binding, paths: { ...binding.paths, unexpected: "/protected/extra" } }),
    (error) => error.code === "restricted_identity_rejected"
  );
});

test("canonical paths reject unpaired-surrogate UTF-8 aliases", () => {
  const first = "/protected/\ud800";
  const second = "/protected/\ud801";
  assert.notEqual(first, second);
  assert.equal(Buffer.from(first, "utf8").equals(Buffer.from(second, "utf8")), true);

  for (const path of [first, second]) {
    const binding = v3Binding();
    assert.throws(
      () => buildCanonicalRunnerBinding({
        ...binding,
        paths: { ...binding.paths, currentMap: path }
      }),
      (error) => error.code === "restricted_identity_rejected"
    );
  }

  const binding = v3Binding();
  assert.throws(
    () => buildCanonicalRunnerBinding({
      ...binding,
      paths: {
        ...binding.paths,
        currentMap: first,
        materialStore: second
      }
    }),
    (error) => error.code === "restricted_identity_rejected"
  );
});

test("canonical paths preserve distinct valid non-ASCII scalar identities", () => {
  const first = "/protected/é.json";
  const second = "/protected/日本.json";
  for (const path of [first, second]) {
    assert.equal(Buffer.from(path, "utf8").toString("utf8"), path);
  }
  assert.equal(Buffer.from(first, "utf8").equals(Buffer.from(second, "utf8")), false);

  const binding = v3Binding();
  const canonical = buildCanonicalRunnerBinding({
    ...binding,
    paths: {
      ...binding.paths,
      currentMap: first,
      materialStore: second
    }
  });
  assert.equal(canonical.paths.currentMap, first);
  assert.equal(canonical.paths.materialStore, second);

});

test("archive inspection requires reviewed helpers and rejects unsafe paths", () => {
  const requiredEntries = [
    "scripts/mihomo-tuic-usage-map-rebuild.mjs",
    "scripts/traffic-accounting-natural-observation.mjs",
    "server/services/platform/traffic-collector-admin-projection.mjs",
    "server/services/platform/traffic-collector-status-producers.mjs"
  ];
  assert.deepEqual(validateArchiveEntries(requiredEntries), { safe: true, entryCount: 4 });
  for (const entries of [
    ["../escape", ...requiredEntries],
    ["/absolute", ...requiredEntries],
    ["C:/windows", ...requiredEntries],
    requiredEntries.slice(1),
    [...requiredEntries, requiredEntries[0]]
  ]) {
    assert.throws(
      () => validateArchiveEntries(entries),
      (error) => error.code === "artifact_identity_mismatch"
    );
  }
});

test("wait budget uses two live intervals plus sixty seconds and caps at twelve minutes", () => {
  assert.equal(deriveWaitBudget({ intervalSeconds: 300 }), 660000);
  assert.equal(deriveWaitBudget({ intervalSeconds: 600 }), 720000);
  assert.throws(
    () => deriveWaitBudget({ intervalSeconds: 0 }),
    (error) => error.code === "stable_snapshot_unavailable"
  );
});

test("executes the exact successful state-machine order and returns an aggregate receipt", async () => {
  const { calls, operations } = createOperations();
  const receipt = await executeJapanTuicAdditiveRepair({
    binding: validBinding(),
    artifactStream: {},
    operations,
    now: () => new Date("2026-07-16T20:00:00.000Z")
  });
  assert.deepEqual(calls, [
    "receiveArtifact",
    "listArchiveEntries",
    "extractArtifact",
    "runMapHelper:dry",
    "readIdentityGate:before",
    "runMapHelper:dry",
    "readIdentityGate:before",
    "readFileMetadata:before",
    "readTimerState:before",
    "readNaturalObservation:baseline",
    "createBackup",
    "runMapHelper:apply",
    "runMapHelper:dry",
    "readIdentityGate:after",
    "readFileMetadata:after",
    "readTimerState:after",
    "readNaturalObservation:current",
    "readTimerState:current",
    "removeTemporaryMaterial",
    "revokeOwnAuthorization"
  ]);
  assert.equal(receipt.productionResult, "applied_validated");
  assert.equal(receipt.hostCredentialCleanup, "verified");
  assert.equal(receipt.closeout, "github_cleanup_pending");
  assert.deepEqual(receipt.identityAfter, JAPAN_TUIC_REPAIR_GATE.after);
});

test("stops before backup when a stable candidate count drifts", async () => {
  const { calls, operations } = createOperations({
    secondCandidate: candidateReport({ addCount: 2 })
  });
  const receipt = await executeJapanTuicAdditiveRepair({
    binding: validBinding(),
    artifactStream: {},
    operations,
    now: () => new Date("2026-07-16T20:00:00.000Z")
  });
  assert.equal(receipt.productionResult, "stopped_pre_apply");
  assert.equal(receipt.error, "expected_count_mismatch");
  assert.equal(calls.includes("createBackup"), false);
  assert.equal(calls.includes("runMapHelper:apply"), false);
  assert.equal(calls.includes("restoreBackup"), false);
  assert.deepEqual(calls.slice(-2), ["removeTemporaryMaterial", "revokeOwnAuthorization"]);
});

test("restores and verifies the backup after a post-apply observation failure", async () => {
  const { calls, operations } = createOperations({
    current: observationCurrent({ japanTuicUnresolved: 1 })
  });
  const receipt = await executeJapanTuicAdditiveRepair({
    binding: validBinding(),
    artifactStream: {},
    operations,
    now: () => new Date("2026-07-16T20:00:00.000Z")
  });
  assert.equal(receipt.productionResult, "rolled_back_validated");
  assert.equal(receipt.error, "natural_observation_failed");
  assert.equal(receipt.rollbackVerified, true);
  assert.ok(calls.indexOf("restoreBackup") > calls.indexOf("runMapHelper:apply"));
  assert.deepEqual(calls.slice(calls.indexOf("restoreBackup"), -2), [
    "restoreBackup",
    "runMapHelper:dry",
    "readIdentityGate:rollback",
    "readFileMetadata:rollback"
  ]);
});

test("rolls back when timer or service state changes during the natural observation window", async () => {
  const { calls, operations } = createOperations({
    timerCurrent: timerState({ timerRestarts: 1 })
  });
  const receipt = await executeJapanTuicAdditiveRepair({
    binding: validBinding(),
    artifactStream: {},
    operations,
    now: () => new Date("2026-07-16T20:00:00.000Z")
  });
  assert.equal(receipt.productionResult, "rolled_back_validated");
  assert.equal(receipt.error, "natural_observation_failed");
  assert.equal(receipt.rollbackVerified, true);
  assert.ok(calls.indexOf("readTimerState:current") > calls.indexOf("readNaturalObservation:current"));
  assert.ok(calls.indexOf("restoreBackup") > calls.indexOf("readTimerState:current"));
});

test("waits for a genuinely post-apply natural observation", async () => {
  const { calls, operations } = createOperations({
    currentSequence: [
      observationCurrent({ capturedAt: "2026-07-16T19:59:59.000Z" }),
      observationCurrent()
    ]
  });
  const receipt = await executeJapanTuicAdditiveRepair({
    binding: validBinding(),
    artifactStream: {},
    operations,
    now: () => new Date("2026-07-16T20:00:00.000Z")
  });
  assert.equal(receipt.productionResult, "applied_validated");
  assert.equal(calls.filter((call) => call === "readNaturalObservation:current").length, 2);
  assert.equal(calls.filter((call) => call.startsWith("sleep:")).length, 1);
});

test("rolls back when no post-apply observation arrives before the bounded attempts", async () => {
  const { calls, operations } = createOperations({
    timerBefore: timerState({ intervalSeconds: 1 }),
    timerAfter: timerState({ intervalSeconds: 1 }),
    currentSequence: [observationCurrent({ capturedAt: "2026-07-16T19:59:59.000Z" })]
  });
  const receipt = await executeJapanTuicAdditiveRepair({
    binding: validBinding(),
    artifactStream: {},
    operations,
    now: () => new Date("2026-07-16T20:00:00.000Z")
  });
  assert.equal(receipt.productionResult, "rolled_back_validated");
  assert.equal(receipt.error, "natural_observation_timeout");
  assert.equal(calls.includes("restoreBackup"), true);
  assert.ok(calls.filter((call) => call.startsWith("sleep:")).length > 0);
});

test("reports indeterminate when rollback cannot be verified", async () => {
  const { operations } = createOperations({
    current: observationCurrent({ japanTuicUnresolved: 1 }),
    restoreError: new Error("/protected/rollback-error")
  });
  const receipt = await executeJapanTuicAdditiveRepair({
    binding: validBinding(),
    artifactStream: {},
    operations,
    now: () => new Date("2026-07-16T20:00:00.000Z")
  });
  assert.equal(receipt.productionResult, "indeterminate");
  assert.equal(receipt.error, "rollback_verification_failed");
  assert.equal(JSON.stringify(receipt).includes("protected"), false);
});

test("marks closeout incomplete when host cleanup is not fully verified", async () => {
  const { calls, operations } = createOperations({ revokeAuthorization: false });
  const receipt = await executeJapanTuicAdditiveRepair({
    binding: validBinding(),
    artifactStream: {},
    operations,
    now: () => new Date("2026-07-16T20:00:00.000Z")
  });
  assert.equal(receipt.productionResult, "applied_validated");
  assert.equal(receipt.hostCredentialCleanup, "failed");
  assert.equal(receipt.closeout, "incomplete");
  assert.deepEqual(calls.slice(-2), ["removeTemporaryMaterial", "revokeOwnAuthorization"]);
});

test("host adapter receives a bounded artifact with mode 0600 and exact digest", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "gccgw-japan-host-artifact-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const bytes = Buffer.from("approved-small-artifact");
  const digest = createHash("sha256").update(bytes).digest("hex");
  const binding = validBinding({
    paths: { ...validBinding().paths, temporaryRoot: directory }
  });
  const operations = createHostOperations({
    binding,
    expectedArtifact: { sizeBytes: bytes.length, sha256: digest },
    execFileFn: async () => ({ stdout: "", stderr: "" })
  });
  const received = await operations.receiveArtifact(Readable.from([bytes]));
  assert.equal(received.sizeBytes, bytes.length);
  assert.equal(received.sha256, digest);
  if (process.platform !== "win32") {
    assert.equal(statSync(received.path).mode & 0o777, 0o600);
  }
  await assert.rejects(
    () => createHostOperations({
      binding,
      expectedArtifact: { sizeBytes: bytes.length - 1, sha256: digest },
      execFileFn: async () => ({ stdout: "", stderr: "" })
    }).receiveArtifact(Readable.from([bytes])),
    (error) => error.code === "artifact_identity_mismatch"
  );
});

test("host adapter inspects ZIP names and types before fixed extraction", async () => {
  const calls = [];
  const requiredEntries = [
    "scripts/mihomo-tuic-usage-map-rebuild.mjs",
    "scripts/traffic-accounting-natural-observation.mjs",
    "server/services/platform/traffic-collector-admin-projection.mjs",
    "server/services/platform/traffic-collector-status-producers.mjs"
  ];
  const operations = createHostOperations({
    binding: validBinding(),
    execFileFn: async (file, args) => {
      calls.push([file, args]);
      if (args[0] === "-Z1") return { stdout: `${requiredEntries.join("\n")}\n`, stderr: "" };
      if (args[0] === "-ZTs") {
        return { stdout: requiredEntries.map((entry) => `-rw-r--r--  3.0 unx 1 tx ${entry}`).join("\n"), stderr: "" };
      }
      return { stdout: "", stderr: "" };
    },
    makeTemporaryDirectoryFn: () => "/gate/temporary/source"
  });
  assert.deepEqual(await operations.listArchiveEntries("/gate/artifact.zip"), requiredEntries);
  assert.deepEqual(await operations.extractArtifact("/gate/artifact.zip"), { root: "/gate/temporary/source" });
  assert.deepEqual(calls, [
    ["/usr/bin/unzip", ["-Z1", "/gate/artifact.zip"]],
    ["/usr/bin/unzip", ["-ZTs", "/gate/artifact.zip"]],
    ["/usr/bin/unzip", ["-qq", "/gate/artifact.zip", "-d", "/gate/temporary/source"]]
  ]);
});

test("host adapter rejects a ZIP symlink before extraction", async () => {
  const operations = createHostOperations({
    binding: validBinding(),
    execFileFn: async (_file, args) => {
      if (args[0] === "-Z1") {
        return { stdout: "scripts/mihomo-tuic-usage-map-rebuild.mjs\nscripts/traffic-accounting-natural-observation.mjs\nserver/services/platform/traffic-collector-admin-projection.mjs\nserver/services/platform/traffic-collector-status-producers.mjs\n", stderr: "" };
      }
      return { stdout: "lrwxrwxrwx  3.0 unx 1 tx scripts/mihomo-tuic-usage-map-rebuild.mjs", stderr: "" };
    }
  });
  await assert.rejects(
    () => operations.listArchiveEntries("/gate/artifact.zip"),
    (error) => error.code === "artifact_identity_mismatch"
  );
});

test("host adapter invokes only the fixed additive helper arguments and derives identity", async () => {
  const calls = [];
  const report = {
    ...candidateReport(),
    currentMapCount: 79,
    rebuiltMapCount: 55
  };
  const operations = createHostOperations({
    binding: validBinding(),
    execFileFn: async (file, args, options) => {
      calls.push([file, args, options]);
      return { stdout: `${JSON.stringify(report)}\n`, stderr: "/protected/stderr" };
    }
  });
  assert.deepEqual(await operations.runMapHelper({
    root: "/gate/source",
    binding: validBinding(),
    apply: false
  }), report);
  assert.deepEqual(await operations.runMapHelper({
    root: "/gate/source",
    binding: validBinding(),
    apply: true
  }), report);
  assert.deepEqual(await operations.readIdentityGate({ phase: "before" }), identityBefore());
  assert.equal(calls[0][0], "/usr/bin/node");
  assert.deepEqual(calls[0][1].slice(-14), [
    "--strategy", "additive_missing_only",
    "--expected-add", "3",
    "--expected-remove", "0",
    "--expected-deferred-remove", "27",
    "--expected-changed", "0",
    "--expected-missing-material", "0",
    "--expected-projected-map-count", "82"
  ]);
  assert.equal(calls[0][1].includes("--apply"), false);
  assert.equal(calls[1][1].includes("--apply"), true);
  for (const [, args] of calls) {
    assert.equal(args.includes("--status-path"), false);
    assert.equal(args.includes(validBinding().paths.producerStatus), false);
  }
  assert.equal(calls[0][2].shell, false);
});

test("host adapter queries fixed read-only systemd properties and derives interval", async () => {
  const calls = [];
  const operations = createHostOperations({
    binding: validBinding(),
    execFileFn: async (file, args) => {
      calls.push([file, args]);
      if (args.includes("gccgw-traffic-usage-collect.timer")) {
        return {
          stdout: [
            "ActiveState=active",
            "UnitFileState=enabled",
            "NRestarts=0",
            "LastTriggerUSec=2026-07-16T20:00:00.000Z",
            "NextElapseUSecRealtime=2026-07-16T20:05:00.000Z"
          ].join("\n"),
          stderr: ""
        };
      }
      return { stdout: "NRestarts=0\n", stderr: "" };
    }
  });
  assert.deepEqual(await operations.readTimerState(validBinding()), timerState());
  assert.equal(calls.length, 2);
  assert.ok(calls.every(([file, args]) => file === "/usr/bin/systemctl" && args[0] === "show"));
  assert.ok(calls.every(([, args]) => !args.some((arg) => new Set(["start", "restart", "enable", "disable"]).has(arg))));
});

test("host adapter backs up, restores, and removes only its marked authorization", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "gccgw-japan-host-files-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const backupDirectory = join(directory, "backups");
  const temporaryRoot = join(directory, "temporary");
  mkdirSync(backupDirectory);
  mkdirSync(temporaryRoot);
  const currentMap = join(directory, "map.json");
  const authorizedKeys = join(directory, "authorized_keys");
  writeFileSync(currentMap, "before-map", { mode: 0o600 });
  chmodSync(currentMap, 0o600);
  const marker = validBinding().authorizationMarker;
  writeFileSync(authorizedKeys, `ssh-ed25519 AAAA first-key\nssh-ed25519 BBBB ${marker}\n`, { mode: 0o600 });
  const binding = validBinding({
    paths: {
      ...validBinding().paths,
      currentMap,
      backupDirectory,
      temporaryRoot,
      authorizedKeys
    }
  });
  const operations = createHostOperations({
    binding,
    execFileFn: async () => ({ stdout: "", stderr: "" })
  });
  const backup = await operations.createBackup(binding);
  writeFileSync(currentMap, "changed-map");
  await operations.restoreBackup(binding, backup);
  assert.equal(readFileSync(currentMap, "utf8"), "before-map");
  assert.equal(await operations.revokeOwnAuthorization(binding), true);
  assert.equal(readFileSync(authorizedKeys, "utf8"), "ssh-ed25519 AAAA first-key\n");
});

test("host adapter validates a protected natural observation and returns aggregates only", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "gccgw-japan-natural-observation-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const observationPath = join(directory, "natural-observation.json");
  writeFileSync(observationPath, JSON.stringify({
    protectedFixture: "/must/not/return",
    projection: {
      collectors: [
        { channelRef: "channel-vultr-a-tuic", unresolvedCount: 0 },
        { channelRef: "channel-unrelated", unresolvedCount: 1 }
      ]
    }
  }));
  const binding = validBinding({
    paths: { ...validBinding().paths, naturalObservation: observationPath }
  });
  const operations = createHostOperations({
    binding,
    execFileFn: async () => ({ stdout: "", stderr: "" }),
    naturalObservationBuilder: () => ({
      capturedAt: "2026-07-16T20:05:00.000Z",
      collectorInvocationObserved: true,
      projection: {
        collectorCount: 5,
        unresolvedTotal: 1,
        omittedCollectors: 0,
        omittedProducers: 0,
        provenanceConserved: true
      },
      passed: true
    })
  });
  const summary = await operations.readNaturalObservation({ root: "/gate/source", binding });
  assert.deepEqual(summary, observationCurrent());
  assert.equal(JSON.stringify(summary).includes("must/not/return"), false);
});

test("host adapter rejects natural evidence without the fixed Japan TUIC channel", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "gccgw-japan-natural-missing-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const observationPath = join(directory, "natural-observation.json");
  writeFileSync(observationPath, JSON.stringify({
    projection: { collectors: [{ channelRef: "channel-unrelated", unresolvedCount: 0 }] }
  }));
  const binding = validBinding({
    paths: { ...validBinding().paths, naturalObservation: observationPath }
  });
  const operations = createHostOperations({
    binding,
    execFileFn: async () => ({ stdout: "", stderr: "" }),
    naturalObservationBuilder: () => ({
      capturedAt: "2026-07-16T20:05:00.000Z",
      collectorInvocationObserved: true,
      projection: {
        collectorCount: 1,
        unresolvedTotal: 0,
        omittedCollectors: 0,
        omittedProducers: 0,
        provenanceConserved: true
      },
      passed: true
    })
  });
  await assert.rejects(
    () => operations.readNaturalObservation({ root: "/gate/source", binding }),
    (error) => error.code === "natural_observation_failed"
  );
});

test("sudo closure and effective policy bind one no-argument root rule", () => {
  const closure = buildCanonicalSudoSourceClosure(sudoClosure());
  const policy = buildCanonicalSudoEffectivePolicy(sudoPolicyInput());
  assert.deepEqual(Object.keys(policy), [
    "schemaVersion", "type", "username", "uid", "command", "commandArguments",
    "runAsUid", "runAsGid", "nonInteractive", "nopasswd", "envReset",
    "setenvAllowed", "securePath", "matchedRuleCount", "otherRuleCount",
    "sourceClosureSha256"
  ]);
  assert.equal(
    policy.sourceClosureSha256,
    createHash("sha256").update(`${JSON.stringify(closure)}\n`).digest("hex")
  );
  for (const value of [
    sudoPolicyInput({ commandArguments: ["*"] }),
    sudoPolicyInput({ runAsUid: 1000 }),
    sudoPolicyInput({ matchedRuleCount: 2 }),
    sudoPolicyInput({ otherRuleCount: 1 }),
    sudoPolicyInput({ setenvAllowed: true }),
    sudoPolicyInput({ securePath: "/usr/local/bin:/usr/bin" })
  ]) {
    assert.throws(
      () => buildCanonicalSudoEffectivePolicy(value),
      (error) => error.code === "restricted_identity_rejected"
    );
  }
});

test("authorized key parser accepts only the exact ASCII option sequence and Ed25519 wire blob", () => {
  const algorithm = Buffer.from("ssh-ed25519", "ascii");
  const key = Buffer.alloc(32, 0x42);
  const blob = Buffer.alloc(4 + algorithm.length + 4 + key.length);
  blob.writeUInt32BE(algorithm.length, 0);
  algorithm.copy(blob, 4);
  blob.writeUInt32BE(key.length, 4 + algorithm.length);
  key.copy(blob, 8 + algorithm.length);
  const options = "restrict,no-pty,no-agent-forwarding,no-port-forwarding,no-X11-forwarding,command=\"/usr/bin/sudo -n -- /usr/local/libexec/gccgw/japan-tuic-additive-repair-entrypoint\"";
  const line = `${options} ssh-ed25519 ${blob.toString("base64")} ${AUTHORIZATION_MARKER}`;
  const parsed = parseCanonicalAuthorizedKeyLine(`${line}\n`);
  assert.equal(parsed.algorithm, "ssh-ed25519");
  assert.equal(parsed.authorizationMarker, AUTHORIZATION_MARKER);
  assert.equal(parsed.authorizedKeysLineSha256, createHash("sha256").update(line, "ascii").digest("hex"));
  assert.equal(parsed.publicKeyBlobSha256, createHash("sha256").update(blob).digest("hex"));
  for (const value of [
    line.replace("restrict,", ""),
    line.replace("ssh-ed25519", "ssh-rsa"),
    line.replace(AUTHORIZATION_MARKER, `${AUTHORIZATION_MARKER} extra`),
    `${line}\r\n`,
    `${line}\n${line}\n`,
    line.replace(blob.toString("base64"), `${blob.toString("base64")}=`),
    `${line}\0`
  ]) {
    assert.throws(
      () => parseCanonicalAuthorizedKeyLine(value),
      (error) => error.code === "restricted_identity_rejected"
    );
  }
});

function bigintStat({
  type = "file",
  uid = 0n,
  gid = 0n,
  mode = type === "directory" ? 0o755n : 0o600n,
  nlink = type === "directory" ? 2n : 1n,
  dev = 1n,
  ino = 2n,
  size = 10n
} = {}) {
  const typeBits = type === "directory" ? 0o040000n : 0o100000n;
  return {
    uid,
    gid,
    mode: typeBits | mode,
    nlink,
    dev,
    ino,
    size,
    isDirectory: () => type === "directory",
    isFile: () => type === "file",
    isSymbolicLink: () => false
  };
}

function trustedOperations(bytes, {
  finalPath = BINDING_PATH,
  finalStat = bigintStat({ size: BigInt(bytes.length) }),
  openedStat = finalStat,
  postStat = openedStat,
  readPlan = null,
  closeError = null
} = {}) {
  const calls = [];
  let fstatCount = 0;
  let readCount = 0;
  const operations = {
    lstat(path) {
      calls.push(["lstat", path]);
      if (path === finalPath) return finalStat;
      return bigintStat({ type: "directory", uid: 0n, gid: 0n, mode: 0o755n, nlink: 2n, ino: BigInt(path.length + 10), size: 4096n });
    },
    open(path, flags) {
      calls.push(["open", path, flags]);
      return 41;
    },
    fstat(fd) {
      calls.push(["fstat", fd]);
      fstatCount += 1;
      return fstatCount === 1 ? openedStat : postStat;
    },
    read(fd, buffer, offset, length, position) {
      calls.push(["read", fd, offset, length, position]);
      const planned = readPlan?.[readCount];
      readCount += 1;
      if (planned instanceof Error) throw planned;
      if (planned !== undefined) {
        if (planned > 0) bytes.copy(buffer, offset, position, position + planned);
        return planned;
      }
      if (position >= bytes.length) return 0;
      const count = Math.min(length, bytes.length - position);
      bytes.copy(buffer, offset, position, position + count);
      return count;
    },
    close(fd) {
      calls.push(["close", fd]);
      if (closeError) throw closeError;
    }
  };
  return { calls, operations };
}

function manifestValidationFixture() {
  const source = v3Binding();
  const bytesByPath = new Map();
  const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const codeManifest = Object.fromEntries(Object.entries(source.codeManifest).map(([role, entry]) => {
    const bytes = role === "entrypoint"
      ? Buffer.from("#!/usr/bin/dash\n", "ascii")
      : Buffer.from(`code:${role}`, "utf8");
    bytesByPath.set(entry.path, bytes);
    return [role, { ...entry, sizeBytes: bytes.length, sha256: digest(bytes) }];
  }));
  const toolManifest = Object.fromEntries(Object.entries(source.toolManifest).map(([role, entry]) => {
    const bytes = Buffer.from(`tool:${role}`, "utf8");
    bytesByPath.set(entry.path, bytes);
    return [role, { ...entry, sizeBytes: bytes.length, sha256: digest(bytes) }];
  }));

  const algorithm = Buffer.from("ssh-ed25519", "ascii");
  const key = Buffer.alloc(32, 0x42);
  const blob = Buffer.alloc(4 + algorithm.length + 4 + key.length);
  blob.writeUInt32BE(algorithm.length, 0);
  algorithm.copy(blob, 4);
  blob.writeUInt32BE(key.length, 4 + algorithm.length);
  key.copy(blob, 8 + algorithm.length);
  const options = "restrict,no-pty,no-agent-forwarding,no-port-forwarding,no-X11-forwarding,command=\"/usr/bin/sudo -n -- /usr/local/libexec/gccgw/japan-tuic-additive-repair-entrypoint\"";
  const authorizedKeyBytes = Buffer.from(`${options} ssh-ed25519 ${blob.toString("base64")} ${AUTHORIZATION_MARKER}\n`, "ascii");
  const parsedKey = parseCanonicalAuthorizedKeyLine(authorizedKeyBytes);
  const sudoersBytes = Buffer.from("gccgw-japan-repair-ci ALL=(root:root) NOPASSWD: /usr/local/libexec/gccgw/japan-tuic-additive-repair-entrypoint \"\"\n", "ascii");
  bytesByPath.set(AUTHORIZED_KEYS_PATH, authorizedKeyBytes);
  bytesByPath.set(SUDOERS_PATH, sudoersBytes);

  const binding = buildCanonicalRunnerBinding({
    ...source,
    codeManifest,
    toolManifest,
    sshAuthorization: {
      ...source.sshAuthorization,
      authorizedKeysLineSha256: parsedKey.authorizedKeysLineSha256,
      publicKeyBlobSha256: parsedKey.publicKeyBlobSha256,
      loginShellPolicy: {
        ...source.sshAuthorization.loginShellPolicy,
        sha256: toolManifest.dash.sha256
      }
    },
    sudoAuthorization: {
      ...source.sudoAuthorization,
      sudoersFileSha256: digest(sudoersBytes)
    }
  });

  const entries = new Map();
  let nextIno = 100n;
  const addEntry = (path, { type, uid, gid, mode, nlink }, bytes = Buffer.alloc(0)) => {
    entries.set(path, {
      type,
      uid,
      gid,
      mode,
      nlink: type === "directory" ? 2 : nlink,
      bytes,
      ino: nextIno
    });
    nextIno += 1n;
  };
  for (const entry of Object.values(binding.codeManifest)) addEntry(entry.path, entry, bytesByPath.get(entry.path));
  for (const entry of Object.values(binding.toolManifest)) addEntry(entry.path, entry, bytesByPath.get(entry.path));
  for (const role of Object.keys(binding.paths)) {
    const path = binding.paths[role];
    const policy = binding.pathPolicies[role];
    addEntry(path, policy, bytesByPath.get(path));
  }
  addEntry(binding.sshAuthorization.homeDirectory, binding.sshAuthorization.homeDirectoryPolicy);

  const calls = [];
  const descriptors = new Map();
  let nextFd = 50;
  const asStat = (entry) => bigintStat({
    type: entry.type,
    uid: BigInt(entry.uid),
    gid: BigInt(entry.gid),
    mode: BigInt(entry.mode),
    nlink: BigInt(entry.nlink),
    ino: entry.ino,
    size: entry.type === "directory" ? 4096n : BigInt(entry.bytes.length)
  });
  const operations = {
    lstat(path) {
      calls.push(["lstat", path]);
      const entry = entries.get(path);
      if (entry) return asStat(entry);
      return bigintStat({
        type: "directory",
        uid: 0n,
        gid: 0n,
        mode: 0o755n,
        nlink: 2n,
        ino: BigInt(10000 + path.length),
        size: 4096n
      });
    },
    open(path, flags) {
      calls.push(["open", path, flags]);
      assert.equal(entries.has(path), true);
      const fd = nextFd;
      nextFd += 1;
      descriptors.set(fd, entries.get(path));
      return fd;
    },
    fstat(fd) {
      calls.push(["fstat", fd]);
      assert.equal(descriptors.has(fd), true);
      return asStat(descriptors.get(fd));
    },
    read(fd, buffer, offset, length, position) {
      calls.push(["read", fd, offset, length, position]);
      assert.equal(descriptors.has(fd), true);
      const bytes = descriptors.get(fd).bytes;
      if (position >= bytes.length) return 0;
      const count = Math.min(length, bytes.length - position);
      bytes.copy(buffer, offset, position, position + count);
      return count;
    },
    close(fd) {
      calls.push(["close", fd]);
      assert.equal(descriptors.delete(fd), true);
    }
  };
  return { binding, calls, operations };
}

test("manifest trusted reads keep the low-twelve sudo exception separate", () => {
  const fixture = manifestValidationFixture();
  const validated = validateRunnerBinding(fixture.binding, {
    effectiveUid: 0,
    pathOperations: fixture.operations
  });
  assert.equal(validated.codeManifest.entrypoint.mode, 0o755);
  for (const role of ["bootstrap", "contract", "frame", "runner", "state"]) {
    assert.equal(validated.codeManifest[role].mode, 0o644);
  }
  assert.equal(validated.toolManifest.sudo.mode, 0o4755);
  for (const role of ["dash", "env", "flock", "getent", "id", "node", "systemctl", "unzip", "visudo"]) {
    assert.equal(validated.toolManifest[role].mode, 0o755);
  }
  assert.equal(fixture.calls.filter(([name]) => name === "close").length, fixture.calls.filter(([name]) => name === "open").length);

  for (const toolManifest of [
    { ...fixture.binding.toolManifest, sudo: { ...fixture.binding.toolManifest.sudo, mode: 0o755 } },
    { ...fixture.binding.toolManifest, node: { ...fixture.binding.toolManifest.node, mode: 0o4755 } }
  ]) {
    assert.throws(
      () => buildCanonicalRunnerBinding({ ...fixture.binding, toolManifest }),
      (error) => error.code === "restricted_identity_rejected"
    );
  }
});

test("trusted path validation uses one descriptor, bigint identity, post-consumption policy, and one close", () => {
  const bytes = Buffer.from("bound-bytes");
  const policy = { type: "file", uid: 0, gid: 0, mode: 0o600, nlink: 1 };
  const { calls, operations } = trustedOperations(bytes, {
    finalPath: "/etc/gccgw/bound",
    finalStat: bigintStat({ size: BigInt(bytes.length) })
  });
  const result = validateTrustedPathChain(
    "/etc/gccgw/bound",
    policy,
    operations,
    (fd, stats) => ({ fd, size: stats.size })
  );
  assert.deepEqual(result, { fd: 41, size: BigInt(bytes.length) });
  assert.deepEqual(calls.filter(([name]) => name === "lstat").map(([, path]) => path), ["/", "/etc", "/etc/gccgw", "/etc/gccgw/bound"]);
  assert.equal(calls.filter(([name]) => name === "fstat").length, 2);
  assert.equal(calls.filter(([name]) => name === "close").length, 1);
  assert.equal(calls.find(([name]) => name === "open")[2], 0xA0000);
  assert.ok(calls.filter(([name]) => name === "fstat" || name === "close").every(([, fd]) => fd === 41));
});

test("directory nlink is a positive observed sentinel and drift fails closed", () => {
  const policy = { type: "directory", uid: 0, gid: 0, mode: 0o700, nlink: null };
  const good = bigintStat({ type: "directory", mode: 0o700n, nlink: 2n, size: 4096n });
  const goodOps = trustedOperations(Buffer.alloc(0), { finalPath: "/state", finalStat: good });
  validateTrustedPathChain("/state", policy, goodOps.operations);
  assert.equal(goodOps.calls.find(([name]) => name === "open")[2], 0xB0000);
  for (const [candidatePolicy, first, after] of [
    [{ ...policy, nlink: 1 }, good, good],
    [policy, { ...good, nlink: 0n }, { ...good, nlink: 0n }],
    [policy, good, { ...good, nlink: 3n }],
    [{ type: "file", uid: 0, gid: 0, mode: 0o600, nlink: null }, bigintStat(), bigintStat()]
  ]) {
    const fixture = trustedOperations(Buffer.alloc(0), { finalPath: "/state", finalStat: first, postStat: after });
    assert.throws(
      () => validateTrustedPathChain("/state", candidatePolicy, fixture.operations),
      (error) => error.code === "restricted_identity_rejected"
    );
    assert.ok(fixture.calls.filter(([name]) => name === "close").length <= 1);
  }
});

test("runtime trusted paths reject writable and special policy modes before open", () => {
  for (const mode of [0o666, 0o4755, 0o2755, 0o1755]) {
    const stats = bigintStat({ mode: BigInt(mode) });
    const fixture = trustedOperations(Buffer.alloc(0), {
      finalPath: "/runtime",
      finalStat: stats
    });
    assert.throws(
      () => validateTrustedPathChain(
        "/runtime",
        { type: "file", uid: 0, gid: 0, mode, nlink: 1 },
        fixture.operations
      ),
      (error) => error.code === "restricted_identity_rejected"
    );
    assert.equal(fixture.calls.filter(([name]) => name === "open").length, 0);
    assert.equal(fixture.calls.filter(([name]) => name === "close").length, 0);
  }
});

test("runtime trusted paths reject writable and special bits at every observed stat", () => {
  const policy = { type: "file", uid: 0, gid: 0, mode: 0o755, nlink: 1 };
  const clean = bigintStat({ mode: 0o755n });
  for (const mode of [0o666, 0o4755, 0o2755, 0o1755]) {
    const drift = bigintStat({ mode: BigInt(mode) });
    for (const [phase, finalStat, openedStat, postStat, expectedCloses] of [
      ["lstat", drift, drift, drift, 0],
      ["initial-fstat", clean, drift, drift, 1],
      ["post-consumption-fstat", clean, clean, drift, 1]
    ]) {
      const fixture = trustedOperations(Buffer.alloc(0), {
        finalPath: "/runtime",
        finalStat,
        openedStat,
        postStat
      });
      assert.throws(
        () => validateTrustedPathChain("/runtime", policy, fixture.operations, () => phase),
        (error) => error.code === "restricted_identity_rejected",
        `${phase} accepted ${mode.toString(8)}`
      );
      assert.equal(fixture.calls.filter(([name]) => name === "close").length, expectedCloses);
    }
  }
});

test("native Linux flag support is audited independently of host constants", async () => {
  const runner = await import("../../scripts/japan-tuic-additive-repair-runner.mjs");
  assert.equal(typeof runner.validateNativeLinuxOpenFlags, "function");
  if (typeof runner.validateNativeLinuxOpenFlags !== "function") return;

  const audited = {
    O_RDONLY: 0x00000,
    O_DIRECTORY: 0x10000,
    O_NOFOLLOW: 0x20000,
    O_CLOEXEC: 0x80000
  };
  assert.deepEqual(
    runner.validateNativeLinuxOpenFlags({ platform: "linux", constants: audited }),
    { fileFlags: 0xA0000, directoryFlags: 0xB0000 }
  );

  const failures = [{ platform: "win32", constants: audited }];
  for (const key of Object.keys(audited)) {
    const missing = { ...audited };
    delete missing[key];
    failures.push({ platform: "linux", constants: missing });
    failures.push({ platform: "linux", constants: { ...audited, [key]: audited[key] ^ 1 } });
    failures.push({ platform: "linux", constants: { ...audited, [key]: String(audited[key]) } });
  }
  for (const input of failures) {
    assert.throws(
      () => runner.validateNativeLinuxOpenFlags(input),
      (error) => error.code === "restricted_identity_rejected"
    );
  }
});

test("trusted descriptor failures are sanitized and close exactly once", () => {
  const bytes = Buffer.from("bound-bytes");
  const policy = { type: "file", uid: 0, gid: 0, mode: 0o600, nlink: 1 };
  const cases = [
    trustedOperations(bytes, { finalPath: "/bound", postStat: bigintStat({ size: BigInt(bytes.length), ino: 3n }) }),
    trustedOperations(bytes, { finalPath: "/bound", postStat: bigintStat({ size: BigInt(bytes.length + 1) }) }),
    trustedOperations(bytes, { finalPath: "/bound", closeError: new Error("protected-close") })
  ];
  for (const fixture of cases) {
    assert.throws(
      () => validateTrustedPathChain("/bound", policy, fixture.operations, () => true),
      (error) => error.code === "restricted_identity_rejected" && !error.message.includes("protected")
    );
    assert.equal(fixture.calls.filter(([name]) => name === "close").length, 1);
  }
  const consumerFailure = trustedOperations(bytes, { finalPath: "/bound" });
  assert.throws(
    () => validateTrustedPathChain("/bound", policy, consumerFailure.operations, () => { throw new Error("protected-consumer"); }),
    (error) => error.code === "restricted_identity_rejected"
  );
  assert.equal(consumerFailure.calls.filter(([name]) => name === "close").length, 1);
});

test("root-owned binding loader performs bounded same-fd reads and exact canonical byte comparison", () => {
  const canonical = buildCanonicalRunnerBinding(v3Binding());
  const bytes = Buffer.from(`${JSON.stringify(canonical)}\n`);
  const fixture = trustedOperations(bytes, { readPlan: [7, 13, bytes.length - 20, 0] });
  assert.deepEqual(loadRootOwnedBinding({
    path: BINDING_PATH,
    effectiveUid: 0,
    pathOperations: fixture.operations
  }), canonical);
  assert.ok(fixture.calls.filter(([name]) => name === "read").every(([, fd]) => fd === 41));
  assert.equal(fixture.calls.filter(([name]) => name === "close").length, 1);

  const variants = [
    Buffer.from(JSON.stringify(canonical)),
    Buffer.from(`${JSON.stringify(canonical)}\r\n`),
    Buffer.from(`\ufeff${JSON.stringify(canonical)}\n`),
    Buffer.from(`${JSON.stringify({ type: "extra", ...canonical })}\n`),
    Buffer.concat([bytes, Buffer.from("x")])
  ];
  for (const value of variants) {
    const broken = trustedOperations(value);
    assert.throws(
      () => loadRootOwnedBinding({ path: BINDING_PATH, effectiveUid: 0, pathOperations: broken.operations }),
      (error) => error.code === "restricted_identity_rejected"
    );
    assert.equal(broken.calls.filter(([name]) => name === "close").length, 1);
  }
  const oversized = Buffer.alloc(65537, 0x20);
  const tooLarge = trustedOperations(oversized);
  assert.throws(
    () => loadRootOwnedBinding({ path: BINDING_PATH, effectiveUid: 0, pathOperations: tooLarge.operations }),
    (error) => error.code === "restricted_identity_rejected"
  );
});

test("binding reader retries only EINTR and rejects early EOF, trailing bytes, and invalid counts", () => {
  const canonical = buildCanonicalRunnerBinding(v3Binding());
  const bytes = Buffer.from(`${JSON.stringify(canonical)}\n`);
  const interrupted = new Error("interrupted");
  interrupted.code = "EINTR";
  const retry = trustedOperations(bytes, { readPlan: [interrupted, 5, bytes.length - 5, 0] });
  assert.equal(loadRootOwnedBinding({ path: BINDING_PATH, effectiveUid: 0, pathOperations: retry.operations }).schemaVersion, "3");
  const failures = [
    trustedOperations(bytes, { readPlan: [5, 0] }),
    trustedOperations(bytes, { readPlan: [bytes.length + 1] }),
    trustedOperations(bytes, { readPlan: [bytes.length, 1] }),
    trustedOperations(bytes, { readPlan: [new Error("not-eintr")] })
  ];
  for (const fixture of failures) {
    assert.throws(
      () => loadRootOwnedBinding({ path: BINDING_PATH, effectiveUid: 0, pathOperations: fixture.operations }),
      (error) => error.code === "restricted_identity_rejected"
    );
    assert.equal(fixture.calls.filter(([name]) => name === "close").length, 1);
  }
});

test("forced-command CLI is mechanically pre-migration and calls no authority surface", async () => {
  const expected = "{\"schemaVersion\":\"3\",\"type\":\"japan_tuic_additive_repair_pre_migration\",\"error\":\"restricted_identity_rejected\"}\n";
  for (const env of [
    {},
    { NODE_OPTIONS: "" },
    { NODE_PATH: "" },
    { SSH_ORIGINAL_COMMAND: " " },
    { SSH_ORIGINAL_COMMAND: "/protected/do-not-run" }
  ]) {
    let stdout = "";
    let stderr = "";
    const calls = [];
    const exitCode = await runJapanTuicAdditiveRepairCli({
      argv: ["--binding", BINDING_PATH],
      stdin: { read: () => { calls.push("stdin"); } },
      stdout: { write: (value) => { stdout += value; calls.push("stdout"); } },
      stderr: { write: (value) => { stderr += value; } },
      env,
      platform: "linux",
      loadBindingFn: () => { calls.push("load"); },
      operationsFactory: () => { calls.push("operations"); },
      executeFn: () => { calls.push("execute"); }
    });
    assert.equal(exitCode, 1);
    assert.equal(stdout, "");
    assert.equal(stderr, expected);
    assert.deepEqual(calls, []);
  }
});

test("direct runner invocation emits only the exact pre-migration record", () => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("../../scripts/japan-tuic-additive-repair-runner.mjs", import.meta.url)), "--binding", BINDING_PATH],
    {
      encoding: "utf8",
      env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !new Set(["NODE_OPTIONS", "NODE_PATH", "SSH_ORIGINAL_COMMAND"]).has(key)))
    }
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(
    result.stderr,
    "{\"schemaVersion\":\"3\",\"type\":\"japan_tuic_additive_repair_pre_migration\",\"error\":\"restricted_identity_rejected\"}\n"
  );
});

function sourceReaderVmProbe(payload) {
  const directory = mkdtempSync(join(tmpdir(), "japan-source-reader-vm-"));
  const harnessPath = join(directory, "harness.mjs");
  const payloadPath = join(directory, "payload.json");
  const runnerPath = fileURLToPath(new URL("../../scripts/japan-tuic-additive-repair-runner.mjs", import.meta.url));
  const harness = String.raw`
import { readFileSync } from "node:fs";
import * as crypto from "node:crypto";
import * as nodePath from "node:path";
import * as nodeUrl from "node:url";
import { promisify, types } from "node:util";
import vm from "node:vm";

const [runnerPath, payloadPath] = process.argv.slice(2);
const payload = JSON.parse(readFileSync(payloadPath, "utf8"));
const events = [];
const allocationEvents = [];
const trace = [];
const traceEvent = (...values) => trace.push([trace.length + 1, ...values]);
const ownedBuffers = [];
const ownedBufferIds = new WeakMap();
const nativeObject = Object;
const nativeArray = Array;
const nativeBuffer = Buffer;
const sourceFileObjects = new WeakSet();
const faultHits = { allocation: 0, register: 0, freeze: 0 };
const operationCalls = { lstat: 0, open: 0, fstat: 0, read: 0, close: 0, readDirectory: 0, validateSudoers: 0 };
let sourceReaderOperationPhase = false;
let mutationTargetCount = 0;
let getterReads = 0;
let allocationCount = 0;
let registerPushCount = 0;
function classifyFixedObject(descriptors) {
  const names = descriptors ? nativeObject.keys(descriptors).sort() : [];
  if (names.join(",") === "failed,fixedEnvelopeCount,semanticNodeCount,sshGraph,sudoGraph") {
    return ["snapshot", descriptors.fixedEnvelopeCount.value];
  }
  if (descriptors && descriptors.snapshot && descriptors.cleanupStack && descriptors.kind) {
    return ["graph", descriptors.snapshot.value.fixedEnvelopeCount, descriptors.fixedEnvelopeCount.value];
  }
  if (names.join(",") === "gid,mode,nlink,ordinal,path,sha256,uid") return ["source-file"];
  return null;
}
function instrumentedObject(value) { return nativeObject(value); }
instrumentedObject.prototype = nativeObject.prototype;
nativeObject.setPrototypeOf(instrumentedObject, nativeObject);
function instrumentGraphOrdinal(descriptors) {
  if (!payload.instrument || !descriptors || !descriptors.snapshot || !descriptors.cleanupStack || !descriptors.kind) return;
  const descriptor = descriptors.nextOrdinal;
  if (!descriptor || !nativeObject.hasOwn(descriptor, "value") || descriptor.value !== 0
    || descriptor.writable !== true || descriptor.enumerable !== true || descriptor.configurable === true) {
    throw new Error("unexpected ordinal descriptor");
  }
  const graphKind = descriptors.kind.value;
  if (graphKind !== "ssh" && graphKind !== "sudo") throw new Error("unexpected graph kind");
  let current = descriptor.value;
  descriptors.nextOrdinal = {
    enumerable: true,
    configurable: false,
    get() {
      traceEvent("ordinal-read", graphKind, current);
      return current;
    },
    set(next) {
      const previous = current;
      current = next;
      traceEvent("ordinal-write", graphKind, previous, current);
    }
  };
}
instrumentedObject.create = (prototype, descriptors) => {
  instrumentGraphOrdinal(descriptors);
  const value = nativeObject.create(prototype, descriptors);
  if (payload.instrument) {
    const kind = classifyFixedObject(descriptors);
    if (kind) {
      allocationEvents.push(["object", ...kind]);
      traceEvent("object", ...kind);
      if (kind[0] === "source-file") sourceFileObjects.add(value);
    }
  }
  return value;
};
instrumentedObject.freeze = (value) => {
  if (payload.instrument && sourceFileObjects.has(value)) {
    allocationEvents.push(["freeze", "source-file"]);
    traceEvent("freeze", "source-file");
    if (payload.freezeFailure && sourceReaderOperationPhase) {
      faultHits.freeze += 1;
      throw new Error("freeze failure");
    }
  }
  return nativeObject.freeze(value);
};
function instrumentedArray(...arguments_) {
  const value = new nativeArray(...arguments_);
  if (payload.instrument && new.target) {
    allocationEvents.push(["array", arguments_.length]);
    traceEvent("array", arguments_.length);
  }
  if (payload.instrument && new.target && arguments_.length === 0
    && Number.isSafeInteger(payload.registerPushFailureAt) && payload.registerPushFailureAt > 0) {
    const push = value.push;
    nativeObject.defineProperty(value, "push", {
      configurable: true,
      value(...items) {
        registerPushCount += 1;
        if (registerPushCount === payload.registerPushFailureAt) {
          faultHits.register += 1;
          throw new Error("register push failure");
        }
        return push.apply(this, items);
      }
    });
  }
  return value;
}
instrumentedArray.prototype = nativeArray.prototype;
nativeObject.setPrototypeOf(instrumentedArray, nativeArray);
function trackOwnedBuffer(kind, buffer) {
  if (!payload.instrument) return buffer;
  if (ownedBufferIds.has(buffer)) return buffer;
  const id = ownedBuffers.length + 1;
  const fill = buffer.fill;
  nativeObject.defineProperty(buffer, "fill", {
    configurable: true,
    value(...arguments_) {
      allocationEvents.push(["zero", id]);
      traceEvent("zero", id, buffer.some((byte) => byte !== 0));
      return fill.apply(this, arguments_);
    }
  });
  ownedBuffers.push({ id, kind, buffer });
  ownedBufferIds.set(buffer, id);
  allocationEvents.push(["buffer", kind, id, buffer.length]);
  traceEvent("buffer", kind, id, buffer.length);
  return buffer;
}
function trackDirectoryRawBuffers(value) {
  if (!payload.instrument || !value || (typeof value !== "object" && typeof value !== "function")) return;
  let names;
  try {
    names = nativeObject.getOwnPropertyNames(value)
      .filter((name) => /^(0|[1-9][0-9]*)$/.test(name) && Number(name) < 4294967295)
      .map(Number)
      .sort((left, right) => left - right);
  } catch {
    return;
  }
  for (const index of names) {
    try {
      const descriptor = nativeObject.getOwnPropertyDescriptor(value, String(index));
      if (descriptor && nativeObject.hasOwn(descriptor, "value") && nativeBuffer.isBuffer(descriptor.value)) trackOwnedBuffer("raw", descriptor.value);
    } catch {
      // Instrumentation observes only own raw Buffer references and never reads bytes.
    }
  }
}
const instrumentedBuffer = nativeObject.create(nativeBuffer);
instrumentedBuffer.alloc = (...arguments_) => {
  if (sourceReaderOperationPhase) {
    allocationCount += 1;
    if (allocationCount === payload.allocationFailureAt) {
      faultHits.allocation += 1;
      throw new Error("allocation failure");
    }
  }
  return trackOwnedBuffer("alloc", nativeBuffer.alloc(...arguments_));
};
instrumentedBuffer.from = (...arguments_) => trackOwnedBuffer("from", nativeBuffer.from(...arguments_));
const unused = () => { throw new Error("unused synthetic builtin"); };
const createHash = (...arguments_) => {
  const hash = crypto.createHash(...arguments_);
  const wrapper = {
    update(...updateArguments) {
      hash.update(...updateArguments);
      return wrapper;
    },
    digest(...digestArguments) {
      events.push(["hash"]);
      if (payload.instrument) { allocationEvents.push(["hash"]); traceEvent("hash"); }
      if (payload.hashFailure && sourceReaderOperationPhase) throw new Error("hash failure");
      return hash.digest(...digestArguments);
    }
  };
  return wrapper;
};
const fs = {
  chmodSync: unused, chownSync: unused, closeSync: unused, copyFileSync: unused,
  existsSync: unused, fstatSync: unused, lstatSync: unused, mkdirSync: unused,
  mkdtempSync: unused, openSync: unused, readFileSync: unused, readSync: unused,
  realpathSync: unused, renameSync: unused, rmSync: unused, statSync: unused,
  writeFileSync: unused, writeSync: unused,
  constants: { O_RDONLY: 0, O_DIRECTORY: 0x10000, O_NOFOLLOW: 0x20000, O_CLOEXEC: 0x80000 }
};
const contractError = class JapanTuicRepairContractError extends Error {
  constructor(code) { super(code); this.code = code; }
};
const context = vm.createContext({
  Array: instrumentedArray,
  Buffer: instrumentedBuffer,
  Object: instrumentedObject,
  TextDecoder,
  __sourceReaderSpyEvents: allocationEvents,
  __sourceReaderTraceEvent: traceEvent,
  __sourceReaderBufferId: (buffer) => ownedBufferIds.get(buffer) || 0,
  __sourceReaderSpyGraph: undefined,
  process: { argv: [], env: {}, platform: "linux", stdin: {}, stdout: { write() {} }, stderr: { write() {} } },
  setTimeout,
  clearTimeout
});
const synthetic = (names, values) => new vm.SyntheticModule(names, function () {
  for (const name of names) this.setExport(name, values[name]);
}, { context });
const modules = new Map([
  ["node:crypto", synthetic(["createHash", "randomUUID"], { createHash, randomUUID: () => "test-uuid" })],
  ["node:fs", synthetic(Object.keys(fs), fs)],
  ["node:child_process", synthetic(["execFile", "spawnSync"], { execFile: unused, spawnSync: unused })],
  ["node:util", synthetic(["promisify", "types"], { promisify, types })],
  ["node:path", synthetic(["dirname", "join", "posix", "resolve"], nodePath)],
  ["node:url", synthetic(["pathToFileURL", "fileURLToPath"], nodeUrl)],
  ["./japan-tuic-additive-repair-contract.mjs", synthetic([
    "JAPAN_TUIC_REPAIR_GATE", "JAPAN_TUIC_REPAIR_GATE_V3", "JapanTuicRepairContractError",
    "validateArtifactIdentity", "validateCandidateReport", "validateExecutionReceipt", "validateNaturalObservation", "validatePostApplyIdentity"
  ], {
    JAPAN_TUIC_REPAIR_GATE: {},
    JAPAN_TUIC_REPAIR_GATE_V3: {
      executionGateId: "test-gate", expectedNonceSha256: "a".repeat(64),
      artifact: { sha256: "b".repeat(64) }, releaseUnit: "unit", strategy: "strategy", surface: "surface", target: "target"
    },
    JapanTuicRepairContractError: contractError,
    validateArtifactIdentity: unused, validateCandidateReport: unused, validateExecutionReceipt: unused,
    validateNaturalObservation: unused, validatePostApplyIdentity: unused
  })],
  ["./japan-tuic-additive-repair-state.mjs", synthetic(["executionClaimSha256"], { executionClaimSha256: () => "c".repeat(64) })]
]);

function stat({ type = "file", mode = 0o644, size = 0, nlink = type === "directory" ? 2 : 1, ino = 2, dev = 1, uid = 0, gid = 0, symbolicLink = false } = {}) {
  const typeBits = type === "directory" ? 0o040000n : 0o100000n;
  return {
    uid: BigInt(uid),
    gid: BigInt(gid),
    mode: typeBits | BigInt(mode),
    nlink: BigInt(nlink),
    dev: BigInt(dev),
    ino: BigInt(ino),
    size: BigInt(size),
    isDirectory: () => type === "directory",
    isFile: () => type === "file",
    isSymbolicLink: () => symbolicLink
  };
}

function mutateStat(entry, stage, fallbackType, statFault) {
  let type = entry ? entry.type : fallbackType;
  let mode = entry ? entry.mode : 0o755;
  let size = entry ? entry.bytes.length : 4096;
  let nlink = type === "directory" ? 2 : 1;
  let ino = entry ? entry.ino : 100;
  let dev = 1;
  let uid = 0;
  let gid = 0;
  let symbolicLink = false;
  if (statFault && statFault.stage === stage) {
    if (statFault.field === "type") type = type === "file" ? "directory" : "file";
    if (statFault.field === "uid") uid = 1;
    if (statFault.field === "gid") gid = 1;
    if (statFault.field === "mode") mode = 0o646;
    if (statFault.field === "special") mode |= 0o4000;
    if (statFault.field === "group-write") mode |= 0o020;
    if (statFault.field === "other-write") mode |= 0o002;
    if (statFault.field === "setuid") mode |= 0o4000;
    if (statFault.field === "setgid") mode |= 0o2000;
    if (statFault.field === "sticky") mode |= 0o1000;
    if (statFault.field === "dev") dev = 2;
    if (statFault.field === "ino") ino += 1;
    if (statFault.field === "size") size += 1;
    if (statFault.field === "nlink") nlink = type === "directory" ? 3 : 2;
    if (statFault.field === "symlink") symbolicLink = true;
  }
  return stat({ type, mode, size, nlink, ino, dev, uid, gid, symbolicLink });
}

function shapeOperationRecord(record, firstName, shape) {
  if (!shape) return record;
  if (shape === "missing") delete record[firstName];
  if (shape === "extra") record.unexpected = () => {};
  if (shape === "symbol") nativeObject.defineProperty(record, Symbol("unexpected"), { value: () => {}, enumerable: true });
  if (shape === "non-enumerable") nativeObject.defineProperty(record, firstName, { value: record[firstName], enumerable: false });
  if (shape === "accessor") {
    const operation = record[firstName];
    nativeObject.defineProperty(record, firstName, {
      get() {
        getterReads += 1;
        return operation;
      },
      enumerable: true,
      configurable: true
    });
  }
  if (shape === "nonfunction") record[firstName] = 0;
  if (shape === "inherited") nativeObject.setPrototypeOf(record, { [firstName]() { throw new Error("inherited operation must be rejected"); } });
  if (shape === "custom-prototype") nativeObject.setPrototypeOf(record, { unexpectedOperation() {} });
  if (shape === "null-prototype") nativeObject.setPrototypeOf(record, null);
  return record;
}

function expectedPathRoles(path, directory, childPath) {
  const roles = new Map([["/", "ancestor-0"]]);
  const components = path.slice(1).split("/");
  let current = "";
  for (let index = 0; index < components.length; index += 1) {
    current += "/" + components[index];
    roles.set(current, index === components.length - 1
      ? (directory ? "parent" : "final")
      : "ancestor-" + (index + 1));
  }
  if (childPath) roles.set(childPath, "child");
  return roles;
}

function createPathOperations({ path, bytes, mode = 0o644, directory = false, childPath, childBytes, postDrift = false, statFault, readFault, closeFault = false, openFault = false, fstatFault, operationShape } = {}) {
  let nextFd = 40;
  const descriptors = new Map();
  const readBuffers = [];
  let bodyEintr = false;
  let eofEintr = false;
  const entries = new Map([
    [path, { type: directory ? "directory" : "file", bytes: directory ? Buffer.alloc(0) : Buffer.from(bytes || "", "base64"), mode, ino: 20 }]
  ]);
  if (childPath) entries.set(childPath, { type: "file", bytes: Buffer.from(childBytes || "", "base64"), mode: 0o600, ino: 21 });
  const pathRoles = expectedPathRoles(path, directory, childPath);
  const pathRole = (value) => pathRoles.get(value) || "unexpected";
  const operations = {
    lstat(value) {
      operationCalls.lstat += 1;
      events.push(["lstat", pathRole(value)]);
      const entry = entries.get(value);
      if (entry) return mutateStat(entry, "final-lstat", entry.type, statFault);
      return mutateStat(null, "ancestor", "directory", statFault);
    },
    open(value, flags) {
      operationCalls.open += 1;
      const entry = entries.get(value);
      if (openFault) throw new Error("open failure");
      if (!entry) throw new Error("unexpected open");
      const fd = nextFd++;
      descriptors.set(fd, { entry, fstats: 0 });
      events.push(["open", pathRole(value), flags, fd]);
      return fd;
    },
    fstat(fd) {
      operationCalls.fstat += 1;
      events.push(["fstat", fd]);
      const descriptor = descriptors.get(fd);
      if (!descriptor) throw new Error("unexpected fd");
      descriptor.fstats += 1;
      const entry = descriptor.entry;
      const stage = descriptor.fstats === 1 ? "initial" : "post";
      if (fstatFault === stage) throw new Error(stage + " fstat failure");
      return mutateStat(entry, postDrift && stage === "post" ? "mode-drift" : stage, entry.type,
        postDrift && stage === "post" ? { stage: "mode-drift", field: "mode" } : statFault);
    },
    read(fd, buffer, offset, length, position) {
      operationCalls.read += 1;
      events.push(["read", fd, offset, length, position]);
      if (!readBuffers.includes(buffer)) readBuffers.push(buffer);
      const descriptor = descriptors.get(fd);
      if (!descriptor || descriptor.entry.type !== "file") throw new Error("unexpected read");
      const source = descriptor.entry.bytes;
      if (readFault === "wrong-fd") throw Object.assign(new Error("wrong fd"), { code: "EBADF" });
      if (position < source.length) {
        if (readFault === "body-eintr" && !bodyEintr) { bodyEintr = true; throw Object.assign(new Error("interrupted"), { code: "EINTR" }); }
        if (readFault === "body-early") return 0;
        if (readFault === "body-invalid-count") return length + 1;
        if (readFault === "body-non-eintr") throw Object.assign(new Error("io"), { code: "EIO" });
      } else {
        if (readFault === "eof-eintr" && !eofEintr) { eofEintr = true; throw Object.assign(new Error("interrupted"), { code: "EINTR" }); }
        if (readFault === "eof-trailing") return 1;
        if (readFault === "eof-invalid-count") return -1;
        if (readFault === "eof-non-eintr") throw Object.assign(new Error("io"), { code: "EIO" });
      }
      if (position >= source.length) {
        buffer[0] = 0x7a;
        return 0;
      }
      const count = readFault === "body-short" ? Math.min(1, length, source.length - position) : Math.min(length, source.length - position);
      source.copy(buffer, offset, position, position + count);
      return count;
    },
    close(fd) {
      operationCalls.close += 1;
      events.push(["close", fd]);
      if (payload.instrument) { allocationEvents.push(["close"]); traceEvent("close"); }
      if (!descriptors.delete(fd)) throw new Error("unexpected close");
      if (closeFault) throw new Error("close failure");
    }
  };
  return { operations: shapeOperationRecord(operations, "lstat", operationShape), descriptors, readBuffers };
}

function makeNames(count, variant) {
  const names = Array.from({ length: count }, (_, index) => Buffer.from("n" + index.toString(16), "ascii"));
  if (variant === "accessor") Object.defineProperty(names, "0", { get() { throw new Error("getter"); }, configurable: true, enumerable: true });
  if (variant === "hole") delete names[0];
  if (variant === "nonbuffer") names[0] = "not-a-buffer";
  if (variant === "extra") Object.defineProperty(names, "extra", { get() { throw new Error("extra must remain unobserved"); }, enumerable: true });
  if (variant === "symbol") Object.defineProperty(names, Symbol("extra"), { get() { throw new Error("symbol must remain unobserved"); }, enumerable: true });
  if (variant === "inherited") {
    const prototype = Object.create(Array.prototype);
    Object.defineProperty(prototype, "inherited", { get() { throw new Error("inherited must remain unobserved"); }, enumerable: true });
    Object.setPrototypeOf(names, prototype);
  }
  if (variant === "invalid-utf8") names[0] = Buffer.from([0xc3]);
  if (variant === "low-surrogate") names[0] = Buffer.from([0xed, 0xb0, 0x80]);
  if (variant === "nul") names[0] = Buffer.from([0x6e, 0, 0x30]);
  if (variant === "slash") names[0] = Buffer.from("a/b");
  if (variant === "dot") names[0] = Buffer.from(".");
  if (variant === "dotdot") names[0] = Buffer.from("..");
  if (variant === "bom") names[0] = Buffer.from([0xef, 0xbb, 0xbf, 0x61]);
  if (variant === "early-nul") names[0] = Buffer.from([0x6e, 0, 0x30]);
  if (variant === "duplicate" && names.length > 1) names[1] = Buffer.from(names[0]);
  return names;
}

function malformedDirectoryValue(kind) {
  const rawBuffers = [Buffer.from("first"), Buffer.from("second")];
  if (kind === "non-array") {
    const value = Object.create(null);
    Object.defineProperty(value, "0", { value: rawBuffers[0], writable: true, enumerable: true, configurable: true });
    Object.defineProperty(value, "1", { value: rawBuffers[1], writable: true, enumerable: true, configurable: true });
    Object.defineProperty(value, "length", { value: 2, writable: true, enumerable: false, configurable: false });
    return { value, rawBuffers };
  }
  if (kind === "invalid-array-length") {
    const target = [rawBuffers[0], rawBuffers[1]];
    const value = new Proxy(target, {
      getOwnPropertyDescriptor(inner, key) {
        if (key === "length") return { value: -1, writable: true, enumerable: false, configurable: false };
        return Reflect.getOwnPropertyDescriptor(inner, key);
      }
    });
    return { value, rawBuffers };
  }
  if (kind === "sparse-huge") {
    const value = [];
    value.length = 4294967295;
    value[3] = rawBuffers[0];
    value[17] = rawBuffers[1];
    return { value, rawBuffers };
  }
  throw new Error("unknown malformed directory value");
}

function sourceOperations(buffers, shape, readDirectoryFault) {
  const operations = {
    readDirectory() {
      operationCalls.readDirectory += 1;
      events.push(["readDirectory"]);
      if (readDirectoryFault) throw new Error("readDirectory failure");
      trackDirectoryRawBuffers(buffers);
      return buffers;
    },
    validateSudoers() {
      operationCalls.validateSudoers += 1;
      events.push(["validateSudoers"]);
      throw new Error("C2A must not call validateSudoers");
    }
  };
  return shapeOperationRecord(operations, "readDirectory", shape);
}

function summarizeBuffers(buffers) {
  if (!buffers || typeof buffers !== "object") return false;
  return Object.getOwnPropertyNames(buffers).every((name) => {
    if (!/^(0|[1-9][0-9]*)$/.test(name)) return true;
    const descriptor = Object.getOwnPropertyDescriptor(buffers, name);
    return !descriptor || !Object.hasOwn(descriptor, "value") || !Buffer.isBuffer(descriptor.value)
      || descriptor.value.every((byte) => byte === 0);
  });
}

try {
  const instrumentation = payload.instrument ? [
    "const __sourceReaderRealReserveRead = reserveAuthorizationSourceRead;",
    "reserveAuthorizationSourceRead = function (graph, size) {",
    "  const result = __sourceReaderRealReserveRead(graph, size);",
    "  globalThis.__sourceReaderTraceEvent(\"source-read-reserve\", graph.fileCount, graph.totalBytes);",
    "  return result;",
    "};",
    "const __sourceReaderRealRegisterBuffer = registerAuthorizationBuffer;",
    "registerAuthorizationBuffer = function (graph, buffer) {",
    "  const result = __sourceReaderRealRegisterBuffer(graph, buffer);",
    "  globalThis.__sourceReaderTraceEvent(\"buffer-register\", globalThis.__sourceReaderBufferId(buffer));",
    "  return result;",
    "};",
    "const __sourceReaderRealReserveNode = reserveAuthorizationSourceNode;",
    "reserveAuthorizationSourceNode = function (graph) {",
    "  const result = __sourceReaderRealReserveNode(graph);",
    "  globalThis.__sourceReaderTraceEvent(\"source-node-reserve\", graph.sourceFileCount, graph.snapshot.semanticNodeCount);",
    "  return result;",
    "};",
    "const __sourceReaderRealValidateLines = validateAuthorizationPhysicalLines;",
    "validateAuthorizationPhysicalLines = function (bytes) {",
    "  globalThis.__sourceReaderTraceEvent(\"line\");",
    "  return __sourceReaderRealValidateLines(bytes);",
    "};",
    "const __sourceReaderRealConsumeSource = consumeTrustedAuthorizationSource;",
    "consumeTrustedAuthorizationSource = function (graph, ...arguments_) {",
    "  globalThis.__sourceReaderSpyGraph = graph;",
    "  return __sourceReaderRealConsumeSource(graph, ...arguments_);",
    "};"
  ].join("\n") : "";
  let runnerSource = readFileSync(runnerPath, "utf8");
  const mutations = {
    "move-ordinal-update-before-source-close": [
      [
        "    let bytes;",
        "    let stats;",
        "    withTrustedAuthorizationSourcePath(active, path, \"file\", inputOperations, (fd, openedStats, operations) => {",
        "      bytes = readAuthorizationSourceBytes(active, fd, openedStats, operations);",
        "      stats = openedStats;",
        "    });",
        "    const sha256 = createHash(\"sha256\").update(bytes).digest(\"hex\");",
        "    reserveAuthorizationSourceNode(active);",
        "    const ordinal = active.nextOrdinal;",
        "    active.nextOrdinal += 1;"
      ].join("\n"),
      [
        "    const ordinal = active.nextOrdinal;",
        "    active.nextOrdinal += 1;",
        "    let bytes;",
        "    let stats;",
        "    withTrustedAuthorizationSourcePath(active, path, \"file\", inputOperations, (fd, openedStats, operations) => {",
        "      bytes = readAuthorizationSourceBytes(active, fd, openedStats, operations);",
        "      stats = openedStats;",
        "    });",
        "    const sha256 = createHash(\"sha256\").update(bytes).digest(\"hex\");",
        "    reserveAuthorizationSourceNode(active);"
      ].join("\n")
    ],
    "delete-reserve-read": [
      [
        "function readAuthorizationSourceBytes(graph, fd, stats, operations) {",
        "  if (stats.size < 0n || stats.size > BigInt(Number.MAX_SAFE_INTEGER)) restricted();",
        "  const size = Number(stats.size);",
        "  reserveAuthorizationSourceRead(graph, size);",
        "  const bytes = allocateAuthorizationBuffer(graph, size);"
      ].join("\n"),
      [
        "function readAuthorizationSourceBytes(graph, fd, stats, operations) {",
        "  if (stats.size < 0n || stats.size > BigInt(Number.MAX_SAFE_INTEGER)) restricted();",
        "  const size = Number(stats.size);",
        "  const bytes = allocateAuthorizationBuffer(graph, size);"
      ].join("\n")
    ],
    "delete-dev-compare": [
      "    || left.dev !== right.dev || left.ino !== right.ino || left.size !== right.size",
      "    || left.ino !== right.ino || left.size !== right.size"
    ],
    "delete-nul-reject": ["basename.includes(0) || ", ""],
    "eof-unregistered": ["const eof = allocateAuthorizationBuffer(graph, 1);", "const eof = Buffer.alloc(1);"],
    "repeat-root-skip-first-ancestor": [
      "    const stats = operations.lstat(current);",
      "    const stats = current === path.slice(0, path.indexOf(\"/\", 1)) ? operations.lstat(\"/\") : operations.lstat(current);"
    ],
    "drift-source-file-path": [
      "      path: { value: path, enumerable: true },",
      "      path: { value: path + \".drift\", enumerable: true },"
    ]
  };
  if (payload.mutation) {
    const mutation = mutations[payload.mutation];
    if (!mutation) throw new Error("unknown mutation");
    mutationTargetCount = runnerSource.split(mutation[0]).length - 1;
    if (mutationTargetCount !== 1) throw new Error("mutation target count");
    runnerSource = runnerSource.replace(mutation[0], mutation[1]);
  }
  const source = runnerSource + instrumentation + "\nexport {\n"
    + "  createAuthorizationSourceSnapshot as __test_createAuthorizationSourceSnapshot,\n"
    + "  createAuthorizationSourceGraph as __test_createAuthorizationSourceGraph,\n"
    + "  consumeTrustedAuthorizationSource as __test_consumeTrustedAuthorizationSource,\n"
    + "  consumeTrustedAuthorizationDirectory as __test_consumeTrustedAuthorizationDirectory,\n"
    + "  enterAuthorizationSourceDepth as __test_enterAuthorizationSourceDepth,\n"
    + "  leaveAuthorizationSourceDepth as __test_leaveAuthorizationSourceDepth,\n"
    + "  reserveAuthorizationSourceFile as __test_reserveAuthorizationSourceFile,\n"
    + "  reserveAuthorizationDirectoryNames as __test_reserveAuthorizationDirectoryNames,\n"
    + "  inspectAuthorizationSourceBudget as __test_inspectAuthorizationSourceBudget\n"
    + "};\n";
  const module = new vm.SourceTextModule(source, { context, identifier: runnerPath });
  await module.link((specifier) => {
    const linked = modules.get(specifier);
    if (!linked) throw new Error("unexpected import:" + specifier);
    return linked;
  });
  await module.evaluate();
  if (payload.instrument) {
    // Module initialization can allocate unrelated Buffers; source-reader ownership starts after this boundary.
    ownedBuffers.length = 0;
    allocationEvents.push(["phase", "after-module"]);
    traceEvent("phase", "after-module");
  }
  sourceReaderOperationPhase = true;
  const api = module.namespace;
  const snapshot = api.__test_createAuthorizationSourceSnapshot();
  const ssh = api.__test_createAuthorizationSourceGraph(snapshot, "ssh");
  const sudo = api.__test_createAuthorizationSourceGraph(snapshot, "sudo");
  if (payload.instrument) traceEvent("phase", "before-operation");
  const sourcePath = payload.path || "/etc/ssh/sshd_config";
  if (payload.kind === "source") {
    const fixture = createPathOperations({ path: sourcePath, bytes: payload.bytes, mode: payload.mode, postDrift: payload.postDrift === true, statFault: payload.statFault, readFault: payload.readFault, closeFault: payload.closeFault === true, openFault: payload.openFault === true, fstatFault: payload.fstatFault, operationShape: payload.operationShape });
    let callback;
    let callbackBytes;
    let callbackBufferNonzero = false;
    try {
      api.__test_consumeTrustedAuthorizationSource(ssh, sourcePath, fixture.operations, (bytes, sourceFile) => {
        events.push(["callback"]);
        if (payload.instrument) { allocationEvents.push(["callback"]); traceEvent("callback"); }
        callbackBufferNonzero = bytes.some((byte) => byte !== 0);
        callbackBytes = bytes;
        callback = {
          keys: Object.keys(sourceFile),
          frozen: Object.isFrozen(sourceFile),
          hasBufferValue: Object.values(sourceFile).some((value) => Buffer.isBuffer(value)),
          ordinal: sourceFile.ordinal,
          uid: sourceFile.uid,
          gid: sourceFile.gid,
          mode: sourceFile.mode,
          nlink: sourceFile.nlink,
          pathBound: sourceFile.path === sourcePath,
          sha256Bound: sourceFile.sha256 === crypto.createHash("sha256").update(bytes).digest("hex")
        };
        if (payload.callbackFailure) throw new Error("callback failure");
      });
      if (payload.readBothGraphs) {
        api.__test_consumeTrustedAuthorizationSource(sudo, sourcePath, fixture.operations, () => {
          events.push(["callback"]);
          if (payload.instrument) { allocationEvents.push(["callback"]); traceEvent("callback"); }
        });
      }
      process.stdout.write(JSON.stringify({
        error: null,
        mutationTargetCount,
        getterReads,
        faultHits,
        operationCalls,
        callback,
        callbackBufferNonzero,
        events,
        readBuffersZeroized: summarizeBuffers(fixture.readBuffers),
        callbackBytesZeroized: callbackBytes ? callbackBytes.every((byte) => byte === 0) : false,
        budget: api.__test_inspectAuthorizationSourceBudget(snapshot, ssh, sudo),
        allocationEvents,
        trace,
        ownedBuffers: ownedBuffers.map(({ id, kind, buffer }) => [id, kind, buffer.length, buffer.every((byte) => byte === 0)])
      }));
    } catch (error) {
      let followUpError = null;
      const beforeFollowUp = events.length;
      if (payload.tripTerminal) {
        try {
          api.__test_consumeTrustedAuthorizationSource(sudo, sourcePath, fixture.operations, () => {});
        } catch (followUp) {
          followUpError = followUp && followUp.code ? followUp.code : String(followUp && followUp.name);
        }
      }
      process.stdout.write(JSON.stringify({
        error: error && error.code ? error.code : String(error && error.name),
        mutationTargetCount,
        getterReads,
        faultHits,
        operationCalls,
        events,
        followUpError,
        followUpOperations: events.length - beforeFollowUp,
        readBuffersZeroized: summarizeBuffers(fixture.readBuffers),
        callbackBytesZeroized: callbackBytes ? callbackBytes.every((byte) => byte === 0) : false,
        budget: api.__test_inspectAuthorizationSourceBudget(snapshot, ssh, sudo),
        allocationEvents,
        trace,
        ownedBuffers: ownedBuffers.map(({ id, kind, buffer }) => [id, kind, buffer.length, buffer.every((byte) => byte === 0)])
      }));
    }
  } else if (payload.kind === "directory") {
    const directoryPath = payload.path || "/etc/sudoers.d";
    const childPath = directoryPath + "/n0";
    const malformed = payload.malformed ? malformedDirectoryValue(payload.malformed) : null;
    const buffers = malformed ? malformed.value : makeNames(payload.count === undefined ? 1 : payload.count, payload.variant);
    if (!malformed && payload.basenameLength !== undefined && buffers.length > 0) buffers[0] = Buffer.alloc(payload.basenameLength, 0x61);
    const rawBuffers = malformed ? malformed.rawBuffers : buffers;
    const fixture = createPathOperations({
      path: directoryPath,
      directory: true,
      mode: 0o755,
      childPath: payload.readChild ? childPath : undefined,
      childBytes: Buffer.from("child", "utf8").toString("base64"),
      statFault: payload.statFault,
      closeFault: payload.closeFault === true,
      openFault: payload.openFault === true,
      fstatFault: payload.fstatFault,
      operationShape: payload.operationShape
    });
    let callbackCount = 0;
    try {
      api.__test_consumeTrustedAuthorizationDirectory(ssh, directoryPath, fixture.operations, sourceOperations(buffers, payload.sourceOperationShape, payload.readDirectoryFault === true), (names) => {
        callbackCount += 1;
        events.push(["directory-callback"]);
        if (payload.instrument) { allocationEvents.push(["directory-callback"]); traceEvent("directory-callback"); }
        if (payload.readChild) {
          api.__test_consumeTrustedAuthorizationSource(ssh, childPath, fixture.operations, () => {});
        }
        if (payload.tripTerminal) {
          try { api.__test_reserveAuthorizationSourceFile(ssh, -1); } catch {}
        }
        if (payload.callbackFailure) throw new Error("directory callback failure");
        return names.length;
      });
      process.stdout.write(JSON.stringify({
        error: null,
        mutationTargetCount,
        getterReads,
        faultHits,
        operationCalls,
        callbackCount,
        events,
        namesZeroized: summarizeBuffers(rawBuffers),
        budget: api.__test_inspectAuthorizationSourceBudget(snapshot, ssh, sudo),
        allocationEvents,
        trace,
        ownedBuffers: ownedBuffers.map(({ id, kind, buffer }) => [id, kind, buffer.length, buffer.every((byte) => byte === 0)])
      }));
    } catch (error) {
      let followUpError = null;
      const beforeFollowUp = events.length;
      if (payload.tripTerminal) {
        try { api.__test_consumeTrustedAuthorizationSource(sudo, childPath, fixture.operations, () => {}); } catch (error) { followUpError = error && error.code ? error.code : String(error && error.name); }
      }
      process.stdout.write(JSON.stringify({
        error: error && error.code ? error.code : String(error && error.name),
        mutationTargetCount,
        getterReads,
        faultHits,
        operationCalls,
        callbackCount,
        events,
        namesZeroized: summarizeBuffers(rawBuffers),
        followUpError,
        followUpOperations: events.length - beforeFollowUp,
        budget: api.__test_inspectAuthorizationSourceBudget(snapshot, ssh, sudo),
        allocationEvents,
        trace,
        ownedBuffers: ownedBuffers.map(({ id, kind, buffer }) => [id, kind, buffer.length, buffer.every((byte) => byte === 0)])
      }));
    }
  } else if (payload.kind === "bounds") {
    let failure = null;
    try {
      for (const size of payload.sizes || []) api.__test_reserveAuthorizationSourceFile(ssh, size);
      for (const count of payload.directoryCounts || []) api.__test_reserveAuthorizationDirectoryNames(ssh, count);
      for (let index = 0; index < (payload.depth || 0); index += 1) api.__test_enterAuthorizationSourceDepth(ssh);
    } catch (error) {
      failure = error && error.code ? error.code : String(error && error.name);
    } finally {
      for (let index = 0; index < (payload.depth || 0); index += 1) {
        try { api.__test_leaveAuthorizationSourceDepth(ssh); } catch {}
      }
    }
    process.stdout.write(JSON.stringify({ error: failure, budget: api.__test_inspectAuthorizationSourceBudget(snapshot, ssh, sudo), allocationEvents, trace }));
  } else if (payload.kind === "graph") {
    let error = null;
    try { api.__test_createAuthorizationSourceGraph(snapshot, payload.graphKind || "ssh"); } catch (caught) { error = caught && caught.code ? caught.code : String(caught && caught.name); }
    let later = null;
    try { api.__test_reserveAuthorizationSourceFile(sudo, 0); } catch (caught) { later = caught && caught.code ? caught.code : String(caught && caught.name); }
    process.stdout.write(JSON.stringify({ error, later, budget: api.__test_inspectAuthorizationSourceBudget(snapshot, ssh, sudo) }));
  } else {
    throw new Error("unknown probe kind");
  }
} catch (error) {
  process.stdout.write(JSON.stringify({
    error: error && error.code ? error.code : String(error && error.message || error),
    mutationTargetCount,
    getterReads,
    faultHits,
    operationCalls
  }));
}
`;
  writeFileSync(harnessPath, harness, "utf8");
  writeFileSync(payloadPath, JSON.stringify(payload), "utf8");
  try {
    const result = spawnSync(process.execPath, ["--experimental-vm-modules", harnessPath, runnerPath, payloadPath], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      timeout: payload.expectTimeout ? 800 : undefined
    });
    if (payload.expectTimeout) return { timedOut: result.error && result.error.code, status: result.status, stdout: result.stdout };
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("authorization source files use one trusted fd through EOF drift and close", () => {
  for (const mode of [0o400, 0o440, 0o600, 0o640, 0o644]) {
    const probe = sourceReaderVmProbe({
      kind: "source",
      mode,
      bytes: Buffer.from("line-one\nline-two", "utf8").toString("base64")
    });
    assert.equal(probe.error, null);
    assert.equal(probe.callback.ordinal, 0);
    assert.equal(probe.callback.mode, mode);
    assert.deepEqual(probe.callback.keys, ["ordinal", "path", "sha256", "uid", "gid", "mode", "nlink"]);
    assert.equal(probe.callback.frozen, true);
    assert.equal(probe.callback.hasBufferValue, false);
    assert.equal(probe.callback.pathBound, true);
    assert.equal(probe.callback.sha256Bound, true);
    assert.equal(probe.callbackBufferNonzero, true);
    assert.equal(probe.readBuffersZeroized, true);
    assert.equal(probe.callbackBytesZeroized, true);
    assert.deepEqual(probe.events.filter(([name]) => name === "lstat" || name === "open").map(([name, role]) => [name, role]), [
      ["lstat", "ancestor-0"],
      ["lstat", "ancestor-1"],
      ["lstat", "ancestor-2"],
      ["lstat", "final"],
      ["open", "final"]
    ]);
    const fd = probe.events.find(([name]) => name === "open")[3];
    assert.equal(probe.events.find(([name]) => name === "open")[1], "final");
    assert.equal(probe.events.find(([name]) => name === "open")[2], 0xA0000);
    assert.ok(probe.events.filter(([name]) => name === "fstat" || name === "read" || name === "close")
      .every(([, observedFd]) => observedFd === fd));
    assert.ok(probe.events.findIndex(([name]) => name === "close") < probe.events.findLastIndex(([name]) => name === "hash"));
  }
  for (const payload of [
    { bytes: "", mode: 0o600 },
    { bytes: Buffer.concat(Array.from({ length: 64 }, () => Buffer.concat([Buffer.alloc(16383, 0x61), Buffer.from("\n")]))).toString("base64"), mode: 0o600 },
    { bytes: Buffer.alloc(1048577, 0x61).toString("base64"), mode: 0o600 },
    { bytes: Buffer.from("body", "utf8").toString("base64"), mode: 0o600, postDrift: true },
    { bytes: Buffer.from("body", "utf8").toString("base64"), mode: 0o600, callbackFailure: true }
  ]) {
    const probe = sourceReaderVmProbe({ kind: "source", ...payload });
    if (Buffer.from(payload.bytes, "base64").length <= 1048576 && !payload.postDrift && !payload.callbackFailure) {
      assert.equal(probe.error, null, `accepted source length=${Buffer.from(payload.bytes, "base64").length}`);
    } else {
      assert.equal(probe.error, "restricted_identity_rejected");
      assert.equal(probe.events.filter(([name]) => name === "close").length, 1);
    }
  }
  for (const readFault of ["body-eintr", "body-short", "eof-eintr"]) {
    const probe = sourceReaderVmProbe({ kind: "source", mode: 0o600, readFault, bytes: Buffer.from("body", "utf8").toString("base64") });
    assert.equal(probe.error, null, readFault);
    assert.equal(probe.readBuffersZeroized, true);
  }
  for (const readFault of ["body-early", "body-invalid-count", "body-non-eintr", "eof-trailing", "eof-invalid-count", "eof-non-eintr", "wrong-fd"]) {
    const probe = sourceReaderVmProbe({ kind: "source", mode: 0o600, readFault, bytes: Buffer.from("body", "utf8").toString("base64") });
    assert.equal(probe.error, "restricted_identity_rejected", readFault);
    assert.equal(probe.events.filter(([name]) => name === "close").length, 1);
    assert.equal(probe.readBuffersZeroized, true);
  }
  const closeFailure = sourceReaderVmProbe({ kind: "source", mode: 0o600, closeFault: true, bytes: Buffer.from("body", "utf8").toString("base64") });
  assert.equal(closeFailure.error, "restricted_identity_rejected");
  assert.equal(closeFailure.events.filter(([name]) => name === "close").length, 1);
  const inheritedOperation = sourceReaderVmProbe({ kind: "source", mode: 0o600, operationShape: "inherited", bytes: Buffer.from("body", "utf8").toString("base64") });
  assert.equal(inheritedOperation.error, "restricted_identity_rejected");
  assert.equal(inheritedOperation.events.some(([name]) => name === "open"), false);
  for (const path of ["relative", "/etc//ssh", "/etc/./ssh", "/etc/../ssh", "/etc/ssh/", "/etc/\uD800ssh", "/etc/\uDC00ssh"]) {
    const probe = sourceReaderVmProbe({ kind: "source", path, mode: 0o600, bytes: Buffer.from("body", "utf8").toString("base64") });
    assert.equal(probe.error, "restricted_identity_rejected", path);
    assert.equal(probe.events.some(([name]) => name === "open"), false);
  }
});

test("authorization source graphs enforce shared depth file byte line and directory bounds", () => {
  const initial = sourceReaderVmProbe({ kind: "bounds" });
  assert.equal(initial.error, null);
  assert.deepEqual(initial.budget, {
    snapshotFixedEnvelopeCount: 5,
    snapshotSemanticNodeCount: 5,
    sshFixedEnvelopeCount: 2,
    sudoFixedEnvelopeCount: 2,
    sshSourceFileCount: 0,
    sudoSourceFileCount: 0,
    sshDepth: 0,
    sudoDepth: 0,
    failed: false
  });
  assert.equal(sourceReaderVmProbe({ kind: "bounds", sizes: Array.from({ length: 256 }, () => 0) }).error, null);
  assert.equal(sourceReaderVmProbe({ kind: "bounds", sizes: Array.from({ length: 257 }, () => 0) }).error, "restricted_identity_rejected");
  const maximumTotal = Array.from({ length: 16 }, () => 1048576);
  assert.equal(sourceReaderVmProbe({ kind: "bounds", sizes: maximumTotal }).error, null);
  assert.equal(sourceReaderVmProbe({ kind: "bounds", sizes: [...maximumTotal, 1] }).error, "restricted_identity_rejected");
  assert.equal(sourceReaderVmProbe({ kind: "bounds", directoryCounts: Array.from({ length: 16 }, () => 4096) }).error, null);
  assert.equal(sourceReaderVmProbe({ kind: "bounds", directoryCounts: [...Array.from({ length: 16 }, () => 4096), 1] }).error, "restricted_identity_rejected");
  assert.equal(sourceReaderVmProbe({ kind: "bounds", depth: 32 }).error, null);
  assert.equal(sourceReaderVmProbe({ kind: "bounds", depth: 33 }).error, "restricted_identity_rejected");
  const duplicateGraph = sourceReaderVmProbe({ kind: "graph", graphKind: "ssh" });
  assert.equal(duplicateGraph.error, "restricted_identity_rejected");
  assert.equal(duplicateGraph.later, "restricted_identity_rejected");
  assert.equal(duplicateGraph.budget.failed, true);
  const maximumLine = sourceReaderVmProbe({
    kind: "source",
    mode: 0o600,
    bytes: Buffer.alloc(16384, 0x61).toString("base64")
  });
  assert.equal(maximumLine.error, null);
  const overLine = sourceReaderVmProbe({
    kind: "source",
    mode: 0o600,
    bytes: Buffer.alloc(16385, 0x61).toString("base64")
  });
  assert.equal(overLine.error, "restricted_identity_rejected");
});

test("directory enumeration remains bounded root-controlled and candidate-validated", () => {
  const lifecycle = sourceReaderVmProbe({ kind: "directory", count: 1, readChild: true });
  assert.equal(lifecycle.error, null);
  assert.deepEqual(lifecycle.events.filter(([name]) => name === "lstat" || name === "open").map(([name, role]) => [name, role]), [
    ["lstat", "ancestor-0"],
    ["lstat", "ancestor-1"],
    ["lstat", "parent"],
    ["open", "parent"],
    ["lstat", "ancestor-0"],
    ["lstat", "ancestor-1"],
    ["lstat", "parent"],
    ["lstat", "child"],
    ["open", "child"]
  ]);
  assert.equal(lifecycle.callbackCount, 1);
  assert.equal(lifecycle.events.filter(([name]) => name === "readDirectory").length, 1);
  assert.equal(lifecycle.events.some(([name]) => name === "validateSudoers"), false);
  const directoryOpen = lifecycle.events.findIndex(([name, role]) => name === "open" && role === "parent");
  const directoryClose = lifecycle.events.findIndex(([name, fd]) => name === "close" && fd === 40);
  const childOpen = lifecycle.events.findIndex(([name, role]) => name === "open" && role === "child");
  assert.ok(directoryOpen < lifecycle.events.findIndex(([name]) => name === "readDirectory"));
  assert.ok(lifecycle.events.findIndex(([name]) => name === "readDirectory") < childOpen);
  assert.ok(childOpen < directoryClose);
  assert.equal(sourceReaderVmProbe({ kind: "directory", count: 4096 }).error, null);
  assert.equal(sourceReaderVmProbe({ kind: "directory", count: 0 }).error, null);
  const perDirectory = sourceReaderVmProbe({ kind: "directory", count: 4097, instrument: true });
  assert.equal(perDirectory.error, "restricted_identity_rejected");
  assert.equal(perDirectory.callbackCount, 0);
  assert.equal(perDirectory.ownedBuffers.length, 4097);
  assert.ok(perDirectory.ownedBuffers.every(([, kind, , zeroed]) => kind === "raw" && zeroed));
  const perDirectoryZeroIds = perDirectory.trace
    .map(([, ...event]) => event)
    .filter(([name]) => name === "zero")
    .map(([, id]) => id);
  assert.equal(perDirectoryZeroIds.length, 4097);
  for (let index = 0; index < perDirectoryZeroIds.length; index += 1) {
    assert.equal(perDirectoryZeroIds[index], 4097 - index);
  }
  assert.equal(perDirectory.namesZeroized, true);
  for (const variant of ["accessor", "hole", "nonbuffer", "invalid-utf8", "slash", "dot", "duplicate"]) {
    const probe = sourceReaderVmProbe({ kind: "directory", count: variant === "duplicate" ? 2 : 1, variant });
    assert.equal(probe.error, "restricted_identity_rejected", variant);
    assert.equal(probe.callbackCount, 0, variant);
    assert.equal(probe.namesZeroized, true, variant);
  }
  for (const variant of ["extra", "symbol", "inherited"]) {
    const probe = sourceReaderVmProbe({ kind: "directory", count: 1, variant });
    assert.equal(probe.error, null, variant);
    assert.equal(probe.callbackCount, 1, variant);
    assert.equal(probe.namesZeroized, true, variant);
  }
  const terminal = sourceReaderVmProbe({ kind: "directory", count: 1, tripTerminal: true });
  assert.equal(terminal.error, "restricted_identity_rejected");
  assert.equal(terminal.followUpError, "restricted_identity_rejected");
  assert.equal(terminal.followUpOperations, 0);
  assert.equal(terminal.budget.failed, true);
});

test("authorization source and basename buffers are zeroized on every path", () => {
  const success = sourceReaderVmProbe({
    kind: "directory",
    count: 2,
    readChild: true
  });
  assert.equal(success.error, null);
  assert.equal(success.namesZeroized, true);
  const failure = sourceReaderVmProbe({ kind: "directory", count: 4097 });
  assert.equal(failure.error, "restricted_identity_rejected");
  assert.equal(failure.namesZeroized, true);
  const callbackFailure = sourceReaderVmProbe({
    kind: "source",
    mode: 0o600,
    bytes: Buffer.from("callback-source", "utf8").toString("base64"),
    callbackFailure: true
  });
  assert.equal(callbackFailure.error, "restricted_identity_rejected");
  assert.equal(callbackFailure.events.filter(([name]) => name === "close").length, 1);
});

test("authorization source directory malformed cleanup is sparse-bounded and operation records have no custom prototype", () => {
  const sparse = sourceReaderVmProbe({ kind: "directory", malformed: "sparse-huge", expectTimeout: true, instrument: true });
  assert.equal(sparse.timedOut, undefined, `directory cleanup must not scan an untrusted length: ${JSON.stringify(sparse)}`);
  assert.equal(sparse.status, 0);
  const sparseResult = JSON.parse(sparse.stdout);
  assert.equal(sparseResult.error, "restricted_identity_rejected");
  assert.equal(sparseResult.namesZeroized, true);
  assert.deepEqual(sparseResult.ownedBuffers, [[1, "raw", 5, true], [2, "raw", 6, true]]);
  assert.deepEqual(sparseResult.trace.map(([, ...event]) => event).filter(([name]) => name === "zero"), [
    ["zero", 2, true],
    ["zero", 1, true]
  ]);
  for (const malformed of ["non-array", "invalid-array-length"]) {
    const probe = sourceReaderVmProbe({ kind: "directory", malformed, instrument: true });
    assert.equal(probe.error, "restricted_identity_rejected", malformed);
    assert.equal(probe.callbackCount, 0, malformed);
    assert.equal(probe.namesZeroized, true, malformed);
    assert.deepEqual(probe.ownedBuffers, [[1, "raw", 5, true], [2, "raw", 6, true]], malformed);
    assert.deepEqual(probe.trace.map(([, ...event]) => event).filter(([name]) => name === "zero"), [
      ["zero", 2, true],
      ["zero", 1, true]
    ], malformed);
  }
  const customPrototype = sourceReaderVmProbe({
    kind: "source",
    operationShape: "custom-prototype",
    mode: 0o600,
    bytes: Buffer.from("body", "utf8").toString("base64")
  });
  assert.equal(customPrototype.error, "restricted_identity_rejected");
  const nullPrototype = sourceReaderVmProbe({
    kind: "source",
    operationShape: "null-prototype",
    mode: 0o600,
    bytes: Buffer.from("body", "utf8").toString("base64")
  });
  assert.equal(nullPrototype.error, null);
});

test("authorization source reserves real containers and source-file state before ordinal object and callback", () => {
  const initial = sourceReaderVmProbe({ kind: "bounds", instrument: true });
  assert.equal(initial.error, null);
  const traceEvents = (probe) => probe.trace.map(([, ...event]) => event);
  const operationTrace = (probe) => {
    const events = traceEvents(probe);
    return events.slice(events.findIndex((event) => event[0] === "phase" && event[1] === "before-operation") + 1);
  };
  assert.deepEqual(traceEvents(initial).filter(([name]) => name === "object" || name === "array"), [
    ["object", "snapshot", 1],
    ["object", "graph", 3, 2],
    ["array", 0],
    ["object", "graph", 5, 2],
    ["array", 0]
  ]);

  const success = sourceReaderVmProbe({
    kind: "source",
    instrument: true,
    mode: 0o600,
    bytes: Buffer.from("one\ntwo", "utf8").toString("base64")
  });
  assert.equal(success.error, null);
  assert.equal(Object.hasOwn(success.callback, "path"), false);
  assert.equal(Object.hasOwn(success.callback, "sha256"), false);
  assert.equal(JSON.stringify(success).includes("/etc/"), false);
  assert.equal(JSON.stringify(success).includes(createHash("sha256").update("one\ntwo").digest("hex")), false);
  assert.deepEqual(operationTrace(success).filter(([name]) => [
    "close", "hash", "source-node-reserve", "ordinal-read", "ordinal-write", "line", "object", "freeze", "callback"
  ].includes(name)), [
    ["close"],
    ["hash"],
    ["source-node-reserve", 1, 6],
    ["ordinal-read", "ssh", 0],
    ["ordinal-read", "ssh", 0],
    ["ordinal-write", "ssh", 0, 1],
    ["line"],
    ["object", "source-file"],
    ["freeze", "source-file"],
    ["callback"]
  ]);
  assert.equal(success.budget.sshSourceFileCount, 1);
  const crossGraph = sourceReaderVmProbe({
    kind: "source",
    instrument: true,
    readBothGraphs: true,
    mode: 0o600,
    bytes: Buffer.from("cross-graph", "utf8").toString("base64")
  });
  assert.equal(crossGraph.error, null);
  assert.equal(crossGraph.budget.sshSourceFileCount, 1);
  assert.equal(crossGraph.budget.sudoSourceFileCount, 1);
  assert.equal(crossGraph.budget.snapshotSemanticNodeCount, 7);
  assert.deepEqual(operationTrace(crossGraph).filter(([name]) => name === "source-node-reserve"), [
    ["source-node-reserve", 1, 6],
    ["source-node-reserve", 1, 7]
  ]);
  assert.deepEqual(operationTrace(crossGraph).filter(([name]) => name === "ordinal-write"), [
    ["ordinal-write", "ssh", 0, 1],
    ["ordinal-write", "sudo", 0, 1]
  ]);

  const lineFailure = sourceReaderVmProbe({
    kind: "source",
    instrument: true,
    mode: 0o600,
    bytes: Buffer.alloc(16385, 0x61).toString("base64")
  });
  assert.equal(lineFailure.error, "restricted_identity_rejected");
  assert.deepEqual(operationTrace(lineFailure).filter(([name]) => [
    "source-node-reserve", "ordinal-read", "ordinal-write", "line", "object", "freeze", "callback"
  ].includes(name)), [
    ["source-node-reserve", 1, 6],
    ["ordinal-read", "ssh", 0],
    ["ordinal-read", "ssh", 0],
    ["ordinal-write", "ssh", 0, 1],
    ["line"]
  ]);
  assert.equal(lineFailure.budget.sshSourceFileCount, 1);
  assert.equal(lineFailure.budget.snapshotSemanticNodeCount, 6);
});

test("authorization source rejects complete trusted-stat drift and operation-record matrix", () => {
  const base = {
    kind: "source",
    mode: 0o600,
    bytes: Buffer.from("stat-matrix", "utf8").toString("base64")
  };
  const sourceStages = {
    ancestor: ["type", "uid", "group-write", "other-write", "symlink"],
    "final-lstat": ["type", "uid", "gid", "group-write", "other-write", "setuid", "setgid", "sticky", "dev", "ino", "size", "nlink", "symlink"],
    initial: ["type", "uid", "gid", "group-write", "other-write", "setuid", "setgid", "sticky", "dev", "ino", "size", "nlink", "symlink"],
    post: ["type", "uid", "gid", "group-write", "other-write", "setuid", "setgid", "sticky", "dev", "ino", "size", "nlink", "symlink"]
  };
  for (const [stage, fields] of Object.entries(sourceStages)) {
    for (const field of fields) {
      const probe = sourceReaderVmProbe({ ...base, statFault: { stage, field } });
      assert.equal(probe.error, "restricted_identity_rejected", `${stage}:${field}`);
      const reachesSourceOpen = stage !== "ancestor" && (stage !== "final-lstat" || ["dev", "ino", "size"].includes(field));
      assert.equal(probe.events.filter(([name]) => name === "close").length, reachesSourceOpen ? 1 : 0, `${stage}:${field}`);
    }
  }
  for (const [stage, fields] of Object.entries({
    "final-lstat": ["type", "uid", "gid", "group-write", "other-write", "setuid", "setgid", "sticky", "dev", "ino", "size", "nlink", "symlink"],
    initial: ["type", "uid", "gid", "group-write", "other-write", "setuid", "setgid", "sticky", "dev", "ino", "size", "nlink", "symlink"],
    post: ["type", "uid", "gid", "group-write", "other-write", "setuid", "setgid", "sticky", "dev", "ino", "size", "nlink", "symlink"]
  })) {
    for (const field of fields) {
      const probe = sourceReaderVmProbe({ kind: "directory", count: 1, statFault: { stage, field } });
      assert.equal(probe.error, "restricted_identity_rejected", `directory:${stage}:${field}`);
      const reachesDirectoryOpen = stage !== "final-lstat" || ["dev", "ino", "size", "nlink"].includes(field);
      assert.equal(probe.events.filter(([name]) => name === "close").length, reachesDirectoryOpen ? 1 : 0, `directory:${stage}:${field}`);
    }
  }
  for (const payload of [
    { openFault: true, closes: 0 },
    { fstatFault: "initial", closes: 1 },
    { fstatFault: "post", closes: 1 },
    { closeFault: true, closes: 1 }
  ]) {
    const probe = sourceReaderVmProbe({ ...base, ...payload });
    assert.equal(probe.error, "restricted_identity_rejected");
    assert.equal(probe.events.filter(([name]) => name === "close").length, payload.closes);
  }
  const operationEvents = (probe) => probe.events.filter(([name]) => [
    "lstat", "open", "fstat", "read", "close", "readDirectory", "validateSudoers"
  ].includes(name));
  const noOperationCalls = {
    lstat: 0,
    open: 0,
    fstat: 0,
    read: 0,
    close: 0,
    readDirectory: 0,
    validateSudoers: 0
  };
  for (const operationShape of ["missing", "extra", "symbol", "non-enumerable", "accessor", "nonfunction", "inherited", "custom-prototype"]) {
    const probe = sourceReaderVmProbe({ ...base, operationShape });
    assert.equal(probe.error, "restricted_identity_rejected", operationShape);
    assert.equal(probe.getterReads, 0, operationShape);
    assert.deepEqual(probe.operationCalls, noOperationCalls, operationShape);
    assert.deepEqual(operationEvents(probe), [], operationShape);
  }
  for (const operationShape of [undefined, "null-prototype"]) {
    assert.equal(sourceReaderVmProbe({ ...base, operationShape }).error, null, String(operationShape));
  }
  for (const sourceOperationShape of ["missing", "extra", "symbol", "non-enumerable", "accessor", "nonfunction", "inherited", "custom-prototype"]) {
    const probe = sourceReaderVmProbe({ kind: "directory", count: 1, sourceOperationShape });
    assert.equal(probe.error, "restricted_identity_rejected", sourceOperationShape);
    assert.equal(probe.getterReads, 0, sourceOperationShape);
    assert.deepEqual(probe.operationCalls, noOperationCalls, sourceOperationShape);
    assert.deepEqual(operationEvents(probe), [], sourceOperationShape);
  }
  for (const sourceOperationShape of [undefined, "null-prototype"]) {
    assert.equal(sourceReaderVmProbe({ kind: "directory", count: 1, sourceOperationShape }).error, null, String(sourceOperationShape));
  }
});

test("authorization directory validates raw basename matrix and parent-child lifecycle", () => {
  for (const basenameLength of [1, 255]) {
    const probe = sourceReaderVmProbe({ kind: "directory", count: 1, basenameLength });
    assert.equal(probe.error, null, `basename length ${basenameLength}`);
    assert.equal(probe.namesZeroized, true, `basename length ${basenameLength}`);
  }
  for (const basenameLength of [256]) {
    const probe = sourceReaderVmProbe({ kind: "directory", count: 1, basenameLength });
    assert.equal(probe.error, "restricted_identity_rejected", `basename length ${basenameLength}`);
    assert.equal(probe.callbackCount, 0);
    assert.equal(probe.namesZeroized, true);
  }
  for (const variant of ["nul", "slash", "dot", "dotdot", "bom", "invalid-utf8", "low-surrogate", "duplicate"]) {
    const probe = sourceReaderVmProbe({ kind: "directory", count: variant === "duplicate" ? 2 : 1, variant });
    assert.equal(probe.error, "restricted_identity_rejected", variant);
    assert.equal(probe.callbackCount, 0, variant);
    assert.equal(probe.namesZeroized, true, variant);
  }
  const earlyInvalid = sourceReaderVmProbe({ kind: "directory", count: 3, variant: "early-nul" });
  assert.equal(earlyInvalid.error, "restricted_identity_rejected");
  assert.equal(earlyInvalid.callbackCount, 0);
  assert.equal(earlyInvalid.namesZeroized, true, "later basename buffers must be registered before validation");

  for (const payload of [
    { readDirectoryFault: true },
    { callbackFailure: true },
    { statFault: { stage: "post", field: "dev" } },
    { closeFault: true }
  ]) {
    const probe = sourceReaderVmProbe({ kind: "directory", count: 1, ...payload });
    assert.equal(probe.error, "restricted_identity_rejected", JSON.stringify(payload));
    assert.equal(probe.events.filter(([name]) => name === "close").length, 1, JSON.stringify(payload));
  }

  const lifecycle = sourceReaderVmProbe({ kind: "directory", count: 1, readChild: true });
  assert.equal(lifecycle.error, null);
  const parentFd = lifecycle.events.find(([name, role]) => name === "open" && role === "parent")[3];
  const childFd = lifecycle.events.find(([name, role]) => name === "open" && role === "child")[3];
  const first = (predicate) => lifecycle.events.findIndex(predicate);
  const last = (predicate) => lifecycle.events.findLastIndex(predicate);
  const parentInitial = first(([name, fd]) => name === "fstat" && fd === parentFd);
  const readDirectory = first(([name]) => name === "readDirectory");
  const childInitial = first(([name, fd]) => name === "fstat" && fd === childFd);
  const childEof = last(([name, fd, , length]) => name === "read" && fd === childFd && length === 1);
  const childPost = last(([name, fd]) => name === "fstat" && fd === childFd);
  const childClose = first(([name, fd]) => name === "close" && fd === childFd);
  const parentPost = last(([name, fd]) => name === "fstat" && fd === parentFd);
  const parentClose = first(([name, fd]) => name === "close" && fd === parentFd);
  assert.ok(parentInitial < readDirectory && readDirectory < childInitial);
  assert.ok(childInitial < childEof && childEof < childPost && childPost < childClose);
  assert.ok(childClose < parentPost && parentPost < parentClose);
});

test("authorization source and directory owning buffers zeroize through every reader failure", () => {
  const traceEvents = (probe) => probe.trace.map(([, ...event]) => event);
  const operationTrace = (probe) => {
    const events = traceEvents(probe);
    return events.slice(events.findIndex((event) => event[0] === "phase" && event[1] === "before-operation") + 1);
  };
  const sourceBytes = Buffer.from("zero-path", "utf8");
  const sourceProbe = (extra = {}) => sourceReaderVmProbe({
    kind: "source",
    instrument: true,
    mode: 0o600,
    bytes: sourceBytes.toString("base64"),
    ...extra
  });
  const assertSourceOwnership = (probe, label) => {
    assert.deepEqual(probe.ownedBuffers, [
      [1, "alloc", sourceBytes.length, true],
      [2, "alloc", 1, true]
    ], label);
    assert.deepEqual(operationTrace(probe).filter(([name]) => ["buffer", "buffer-register", "zero"].includes(name)), [
      ["buffer", "alloc", 1, sourceBytes.length],
      ["buffer-register", 1],
      ["buffer", "alloc", 2, 1],
      ["buffer-register", 2],
      ["zero", 2, true],
      ["zero", 1, true]
    ], label);
  };
  const success = sourceProbe();
  assert.equal(success.error, null);
  assertSourceOwnership(success, "success");
  for (const [label, extra] of [
    ["hash", { hashFailure: true }],
    ["line", { bytes: Buffer.alloc(16385, 0x61).toString("base64") }],
    ["callback", { callbackFailure: true }],
    ["post", { statFault: { stage: "post", field: "dev" } }],
    ["close", { closeFault: true }]
  ]) {
    const probe = sourceProbe(extra);
    assert.equal(probe.error, "restricted_identity_rejected", label);
    if (label === "line") {
      assert.deepEqual(probe.ownedBuffers.map(([id, kind, size, zeroed]) => [id, kind, size, zeroed]), [
        [1, "alloc", 16385, true],
        [2, "alloc", 1, true]
      ], label);
      assert.deepEqual(operationTrace(probe).filter(([name]) => name === "zero"), [["zero", 2, true], ["zero", 1, true]], label);
    } else {
      assertSourceOwnership(probe, label);
    }
  }

  const directorySuccess = sourceReaderVmProbe({ kind: "directory", count: 2, instrument: true });
  assert.equal(directorySuccess.error, null);
  assert.equal(directorySuccess.namesZeroized, true);
  assert.deepEqual(directorySuccess.ownedBuffers, [
    [1, "raw", 2, true],
    [2, "raw", 2, true],
    [3, "from", 2, true],
    [4, "from", 2, true]
  ]);
  assert.deepEqual(operationTrace(directorySuccess).filter(([name]) => ["buffer", "buffer-register", "zero"].includes(name)), [
    ["buffer", "raw", 1, 2],
    ["buffer", "raw", 2, 2],
    ["buffer-register", 1],
    ["buffer-register", 2],
    ["buffer", "from", 3, 2],
    ["buffer-register", 3],
    ["buffer", "from", 4, 2],
    ["buffer-register", 4],
    ["zero", 4, true],
    ["zero", 3, true],
    ["zero", 2, true],
    ["zero", 1, true]
  ]);
  const directoryFailure = sourceReaderVmProbe({ kind: "directory", count: 1, variant: "bom", instrument: true });
  assert.equal(directoryFailure.error, "restricted_identity_rejected");
  assert.equal(directoryFailure.namesZeroized, true);
  assert.deepEqual(directoryFailure.ownedBuffers, [[1, "raw", 4, true], [2, "from", 1, true]]);
  assert.deepEqual(operationTrace(directoryFailure).filter(([name]) => name === "zero"), [["zero", 2, true], ["zero", 1, true]]);
  for (const [label, payload] of [
    ["directory callback", { callbackFailure: true }],
    ["directory post", { statFault: { stage: "post", field: "dev" } }],
    ["directory close", { closeFault: true }]
  ]) {
    const probe = sourceReaderVmProbe({ kind: "directory", count: 1, instrument: true, ...payload });
    assert.equal(probe.error, "restricted_identity_rejected", label);
    assert.equal(probe.namesZeroized, true, label);
    assert.deepEqual(probe.ownedBuffers, [[1, "raw", 2, true], [2, "from", 2, true]], label);
    assert.deepEqual(operationTrace(probe).filter(([name]) => name === "zero"), [["zero", 2, true], ["zero", 1, true]], label);
  }
  const readDirectoryFailure = sourceReaderVmProbe({ kind: "directory", count: 1, instrument: true, readDirectoryFault: true });
  assert.equal(readDirectoryFailure.error, "restricted_identity_rejected");
  assert.deepEqual(readDirectoryFailure.ownedBuffers, []);
  assert.equal(readDirectoryFailure.events.filter(([name]) => name === "close").length, 1);
});

test("authorization source instrumentation failures preserve terminal cleanup", () => {
  const payload = {
    kind: "source",
    instrument: true,
    mode: 0o600,
    bytes: Buffer.from("terminal-cleanup", "utf8").toString("base64")
  };
  const operationTrace = (probe) => {
    const events = probe.trace.map(([, ...event]) => event);
    return events.slice(events.findIndex((event) => event[0] === "phase" && event[1] === "before-operation") + 1);
  };
  const allocationFailure = sourceReaderVmProbe({ ...payload, allocationFailureAt: 2, tripTerminal: true });
  assert.equal(allocationFailure.error, "restricted_identity_rejected");
  assert.equal(allocationFailure.budget.failed, true);
  assert.deepEqual(allocationFailure.faultHits, { allocation: 1, register: 0, freeze: 0 });
  assert.equal(allocationFailure.followUpError, "restricted_identity_rejected");
  assert.equal(allocationFailure.followUpOperations, 0);
  assert.deepEqual(allocationFailure.ownedBuffers, [
    [1, "alloc", Buffer.byteLength("terminal-cleanup"), true]
  ]);
  assert.deepEqual(operationTrace(allocationFailure).filter(([name]) => name === "zero"), [
    ["zero", 1, true]
  ]);

  const registerFailure = sourceReaderVmProbe({ ...payload, registerPushFailureAt: 2, tripTerminal: true });
  assert.equal(registerFailure.error, "restricted_identity_rejected");
  assert.equal(registerFailure.budget.failed, true);
  assert.deepEqual(registerFailure.faultHits, { allocation: 0, register: 1, freeze: 0 });
  assert.equal(registerFailure.followUpError, "restricted_identity_rejected");
  assert.equal(registerFailure.followUpOperations, 0);
  assert.deepEqual(registerFailure.ownedBuffers, [
    [1, "alloc", Buffer.byteLength("terminal-cleanup"), true],
    [2, "alloc", 1, true]
  ]);
  assert.deepEqual(operationTrace(registerFailure).filter(([name]) => name === "buffer-register"), [
    ["buffer-register", 1]
  ]);
  assert.deepEqual(operationTrace(registerFailure).filter(([name]) => name === "zero"), [
    ["zero", 2, false],
    ["zero", 2, false],
    ["zero", 1, true]
  ]);

  const freezeFailure = sourceReaderVmProbe({ ...payload, freezeFailure: true, tripTerminal: true });
  assert.equal(freezeFailure.error, "restricted_identity_rejected");
  assert.equal(freezeFailure.budget.failed, true);
  assert.deepEqual(freezeFailure.faultHits, { allocation: 0, register: 0, freeze: 1 });
  assert.equal(freezeFailure.followUpError, "restricted_identity_rejected");
  assert.equal(freezeFailure.followUpOperations, 0);
  assert.deepEqual(freezeFailure.ownedBuffers, [
    [1, "alloc", Buffer.byteLength("terminal-cleanup"), true],
    [2, "alloc", 1, true]
  ]);
  assert.deepEqual(operationTrace(freezeFailure).filter(([name]) => name === "zero"), [
    ["zero", 2, true],
    ["zero", 1, true]
  ]);
});

test("authorization source matrix contract checkers independently detect exact in-memory mutations", () => {
  const traceEvents = (probe) => probe.trace.map(([, ...event]) => event);
  const operationTrace = (probe) => {
    const events = traceEvents(probe);
    return events.slice(events.findIndex((event) => event[0] === "phase" && event[1] === "before-operation") + 1);
  };
  const requireOrdinalOrder = (probe) => {
    assert.equal(probe.error, null);
    assert.deepEqual(operationTrace(probe).filter(([name]) => [
      "close", "hash", "source-node-reserve", "ordinal-read", "ordinal-write", "line"
    ].includes(name)), [
      ["close"],
      ["hash"],
      ["source-node-reserve", 1, 6],
      ["ordinal-read", "ssh", 0],
      ["ordinal-read", "ssh", 0],
      ["ordinal-write", "ssh", 0, 1],
      ["line"]
    ]);
  };
  const sourcePayload = {
    kind: "source",
    instrument: true,
    mode: 0o600,
    bytes: Buffer.from("mutation-witness", "utf8").toString("base64")
  };
  const expectedSourcePathEvents = [
    ["lstat", "ancestor-0"],
    ["lstat", "ancestor-1"],
    ["lstat", "ancestor-2"],
    ["lstat", "final"],
    ["open", "final"]
  ];
  const requireSourcePathSequence = (probe) => {
    assert.equal(probe.error, null);
    assert.deepEqual(
      probe.events.filter(([name]) => name === "lstat" || name === "open").map(([name, role]) => [name, role]),
      expectedSourcePathEvents
    );
  };
  const requireSourceBinding = (probe) => {
    assert.equal(probe.error, null);
    assert.equal(probe.callback.pathBound, true);
    assert.equal(probe.callback.sha256Bound, true);
  };
  assert.doesNotThrow(() => requireSourcePathSequence(sourceReaderVmProbe(sourcePayload)));
  const pathChainMutation = sourceReaderVmProbe({ ...sourcePayload, mutation: "repeat-root-skip-first-ancestor" });
  assert.equal(pathChainMutation.mutationTargetCount, 1);
  assert.equal(pathChainMutation.error, null);
  assert.deepEqual(
    pathChainMutation.events.filter(([name]) => name === "lstat" || name === "open").map(([name, role]) => [name, role]),
    [
      ["lstat", "ancestor-0"],
      ["lstat", "ancestor-0"],
      ["lstat", "ancestor-2"],
      ["lstat", "final"],
      ["open", "final"]
    ]
  );
  assert.throws(() => requireSourcePathSequence(pathChainMutation));
  assert.doesNotThrow(() => requireSourceBinding(sourceReaderVmProbe(sourcePayload)));
  const bindingMutation = sourceReaderVmProbe({ ...sourcePayload, mutation: "drift-source-file-path" });
  assert.equal(bindingMutation.mutationTargetCount, 1);
  assert.equal(bindingMutation.error, null);
  assert.equal(bindingMutation.callback.pathBound, false);
  assert.equal(bindingMutation.callback.sha256Bound, true);
  assert.throws(() => requireSourceBinding(bindingMutation));
  assert.doesNotThrow(() => requireOrdinalOrder(sourceReaderVmProbe(sourcePayload)));
  const ordinalMutation = sourceReaderVmProbe({ ...sourcePayload, mutation: "move-ordinal-update-before-source-close" });
  assert.equal(ordinalMutation.error, null);
  assert.equal(ordinalMutation.mutationTargetCount, 1);
  assert.deepEqual(operationTrace(ordinalMutation).filter(([name]) => [
    "close", "hash", "source-node-reserve", "ordinal-read", "ordinal-write", "line"
  ].includes(name)), [
    ["ordinal-read", "ssh", 0],
    ["ordinal-read", "ssh", 0],
    ["ordinal-write", "ssh", 0, 1],
    ["close"],
    ["hash"],
    ["source-node-reserve", 1, 6],
    ["line"]
  ]);
  assert.throws(() => requireOrdinalOrder(ordinalMutation));
  const requireReadReservation = (probe) => {
    assert.equal(probe.error, null);
    assert.deepEqual(operationTrace(probe).filter(([name]) => ["source-read-reserve", "buffer", "buffer-register"].includes(name)).slice(0, 5), [
      ["source-read-reserve", 1, Buffer.byteLength("mutation-witness")],
      ["buffer", "alloc", 1, Buffer.byteLength("mutation-witness")],
      ["buffer-register", 1],
      ["buffer", "alloc", 2, 1],
      ["buffer-register", 2]
    ]);
  };
  const readBaseline = sourceReaderVmProbe(sourcePayload);
  assert.doesNotThrow(() => requireReadReservation(readBaseline));
  const readMutation = sourceReaderVmProbe({ ...sourcePayload, mutation: "delete-reserve-read" });
  assert.equal(readMutation.error, null);
  assert.equal(readMutation.mutationTargetCount, 1);
  assert.equal(operationTrace(readMutation).some(([name]) => name === "source-read-reserve"), false);
  assert.throws(() => requireReadReservation(readMutation));

  const requireDevDriftRejected = (probe) => assert.equal(probe.error, "restricted_identity_rejected");
  const devBaseline = sourceReaderVmProbe({ ...sourcePayload, statFault: { stage: "post", field: "dev" } });
  assert.doesNotThrow(() => requireDevDriftRejected(devBaseline));
  const devMutation = sourceReaderVmProbe({ ...sourcePayload, statFault: { stage: "post", field: "dev" }, mutation: "delete-dev-compare" });
  assert.equal(devMutation.error, null);
  assert.equal(devMutation.mutationTargetCount, 1);
  assert.equal(devMutation.events.filter(([name]) => name === "callback").length, 1);
  assert.throws(() => requireDevDriftRejected(devMutation));

  const requireNulRejected = (probe) => {
    assert.equal(probe.error, "restricted_identity_rejected");
    assert.equal(probe.callbackCount, 0);
    assert.equal(probe.namesZeroized, true);
  };
  const nulPayload = { kind: "directory", count: 1, variant: "nul" };
  assert.doesNotThrow(() => requireNulRejected(sourceReaderVmProbe(nulPayload)));
  const nulMutation = sourceReaderVmProbe({ ...nulPayload, mutation: "delete-nul-reject" });
  assert.equal(nulMutation.error, null);
  assert.equal(nulMutation.mutationTargetCount, 1);
  assert.equal(nulMutation.callbackCount, 1);
  assert.equal(nulMutation.namesZeroized, true);
  assert.throws(() => requireNulRejected(nulMutation));

  const requireEofOwnership = (probe) => {
    assert.equal(probe.error, null);
    assert.deepEqual(probe.ownedBuffers, [
      [1, "alloc", Buffer.byteLength("mutation-witness"), true],
      [2, "alloc", 1, true]
    ]);
    assert.deepEqual(operationTrace(probe).filter(([name]) => name === "buffer-register"), [["buffer-register", 1], ["buffer-register", 2]]);
    assert.deepEqual(operationTrace(probe).filter(([name]) => name === "zero"), [["zero", 2, true], ["zero", 1, true]]);
  };
  assert.doesNotThrow(() => requireEofOwnership(sourceReaderVmProbe(sourcePayload)));
  const eofMutation = sourceReaderVmProbe({ ...sourcePayload, mutation: "eof-unregistered" });
  assert.equal(eofMutation.error, null);
  assert.equal(eofMutation.mutationTargetCount, 1);
  assert.deepEqual(eofMutation.ownedBuffers, [
    [1, "alloc", Buffer.byteLength("mutation-witness"), true],
    [2, "alloc", 1, false]
  ]);
  assert.equal(eofMutation.readBuffersZeroized, false);
  assert.deepEqual(operationTrace(eofMutation).filter(([name]) => name === "buffer-register"), [["buffer-register", 1]]);
  assert.deepEqual(operationTrace(eofMutation).filter(([name]) => name === "zero"), [["zero", 1, true]]);
  assert.throws(() => requireEofOwnership(eofMutation));
});

function c2bBudgetHarnessPrefix() {
  return String.raw`
import { readFileSync } from "node:fs";
import * as crypto from "node:crypto";
import * as nodePath from "node:path";
import * as nodeUrl from "node:url";
import { promisify, types } from "node:util";
import vm from "node:vm";

const [runnerPath, scenario] = process.argv.slice(2);
const nativeObject = Object;
const nativeArray = Array;
const nativeMap = Map;
const nativeSet = Set;
const nativeWeakMap = WeakMap;
const nativeWeakSet = WeakSet;
const nativeProxy = Proxy;
const nativeBuffer = Buffer;
const nativeUint8Array = Uint8Array;
const nativeRegExp = RegExp;
const nativeTextEncoder = TextEncoder;
const nativeTextDecoder = TextDecoder;
const nativeJSON = JSON;
const nativeWeakMapGet = nativeWeakMap.prototype.get;
const nativeWeakMapHas = nativeWeakMap.prototype.has;
const nativeWeakMapSet = nativeWeakMap.prototype.set;
const nativeWeakMapDelete = nativeWeakMap.prototype.delete;
const nativeArrayPush = nativeArray.prototype.push;
const nativeBufferFill = nativeBuffer.prototype.fill;
const nativeBufferCopy = nativeBuffer.prototype.copy;
const nativeBufferToString = nativeBuffer.prototype.toString;
const nativeBufferCompare = nativeBuffer.compare;
const nativeUint8ArrayFill = nativeUint8Array.prototype.fill;
let allocationActive = false;
const allocationCounts = {
  objectCall: 0, objectCreate: 0, array: 0, map: 0, set: 0, weakMap: 0, weakSet: 0, proxy: 0,
  bufferConstructor: 0, bufferAlloc: 0, bufferAllocUnsafe: 0, bufferConcat: 0, bufferFrom: 0, bufferOf: 0,
  createHash: 0, regexp: 0,
  textEncoder: 0, textEncode: 0, jsonStringify: 0, jsonParse: 0
};
let c3LifecycleCurrent = null;
const C3_OWNER_KEY_NAMES = "activePaths,closure,closureSha256,disposed,events";
const C3_SNAPSHOT_KEY_NAMES = "authorizationEntryCount,failed,fixedEnvelopeCount,retainedPreimageBytes,semanticNodeCount,sshGraph,sshMatchComparisonCount,sudoAliasVisitCount,sudoGraph,sudoSelectorComparisonCount,wildcardAlignedComparisonCount,wildcardInvocationCount,wildcardPatternByteCount";

function c3LifecycleKeyShape(key) {
  if ((typeof key !== "object" && typeof key !== "function") || key === null) return "primitive";
  if (types.isProxy(key)) return "proxy";
  try {
    const names = nativeObject.getOwnPropertyNames(key).sort().join(",");
    if (nativeObject.getPrototypeOf(key) === null && names === C3_OWNER_KEY_NAMES) return "owner";
    if (nativeObject.getPrototypeOf(key) === null && names === C3_SNAPSHOT_KEY_NAMES) return "snapshot";
  } catch {}
  return "other";
}

function c3LifecycleOwnerComplete(owner, graph) {
  try {
    if (c3LifecycleKeyShape(owner) !== "owner") return false;
    const closure = nativeObject.getOwnPropertyDescriptor(owner, "closure");
    const closureSha256 = nativeObject.getOwnPropertyDescriptor(owner, "closureSha256");
    const events = nativeObject.getOwnPropertyDescriptor(owner, "events");
    const activePaths = nativeObject.getOwnPropertyDescriptor(owner, "activePaths");
    const disposed = nativeObject.getOwnPropertyDescriptor(owner, "disposed");
    if (![closure, closureSha256, events, activePaths, disposed].every((descriptor) => descriptor && nativeObject.hasOwn(descriptor, "value"))) return false;
    return nativeObject.getPrototypeOf(closure.value) === null
      && nativeObject.isFrozen(closure.value)
      && nativeArray.isArray(closure.value.files)
      && nativeArray.isArray(events.value)
      && nativeArray.isArray(activePaths.value)
      && activePaths.value.length === 0
      && disposed.value === false
      && typeof closureSha256.value === "string"
      && closureSha256.value.length === 64
      && graph && graph.failed === false && graph.snapshot && graph.snapshot.failed === false;
  } catch {
    return false;
  }
}

function c3LifecycleRegistryIdentity(current, method, key, value, registry) {
  const references = current && current.tracker && current.tracker.c4RawReferences;
  if (!references) return null;
  let identity = null;
  if (key === references.syntax) identity = "syntax";
  else if (key === references.snapshot) identity = "snapshot";
  else if (references.policy !== null && key === references.policy) identity = "policy";
  else if (method === "set" && value === references.graph
    && key !== references.syntax && key !== references.snapshot) {
    if (references.policy === null) references.policy = key;
    if (key === references.policy) identity = "policy";
  }
  if (identity !== null) {
    if (references.registry === null) references.registry = registry;
    else if (references.registry !== registry) references.registryStable = false;
  }
  return identity;
}

function c3LifecycleProgressStamp(current) {
  if (!current) return null;
  return {
    action: current.actionOrdinal,
    allocations: current.allocationOrdinal,
    hashes: current.hashOrdinal,
    fills: current.fillOrdinal,
    copies: current.copyOrdinal,
    pushes: current.pushOrdinal,
    fixedReserves: current.fixedReserves.length,
    semanticReserves: current.semanticReserveOrdinal,
    preimageReserves: current.preimageReserveOrdinal,
    workAttempts: current.workAttemptCount,
    matcherAttempts: current.matcherAttemptCount,
    ...(current.c4Audit === true ? {
      forwardWork: current.forwardWorkOrdinal,
      projectionFreezes: current.projectionFreezeOrdinal
    } : {}),
    registryEvents: current.registry.length,
    operationCalls: typeof current.operationCount === "function"
      ? current.operationCount()
      : current.finalStamp && Number.isSafeInteger(current.finalStamp.operationCalls)
        ? current.finalStamp.operationCalls
        : 0
  };
}

function c3LifecycleRecordForwardWork(kind) {
  const current = c3LifecycleCurrent;
  if (!current || !current.tracker || !current.tracker.c4RawReferences) return;
  current.forwardWorkOrdinal += 1;
  current.forwardWorkKinds[kind] = (current.forwardWorkKinds[kind] || 0) + 1;
}

function c3LifecycleRecordFault(current) {
  if (!current || current.faultTriggered) return;
  current.faultTriggered = true;
  current.faultTriggerCount += 1;
  current.faultStamp = c3LifecycleProgressStamp(current);
}

function c3LifecycleRegistryEvent(method, key, value, result, registry) {
  const current = c3LifecycleCurrent;
  if (!current) return;
  const keyShape = c3LifecycleKeyShape(key);
  const keyIdentity = c3LifecycleRegistryIdentity(current, method, key, value, registry);
  const references = current.tracker.c4RawReferences;
  const trackedGraph = references && references.graph;
  const trackedSnapshot = references && references.snapshot;
  const comparisonGraph = references ? trackedGraph : current.graph;
  const sameGraph = comparisonGraph !== null && comparisonGraph !== undefined
    && (method === "set" ? value === comparisonGraph : result === comparisonGraph);
  const ordinal = current.registry.length + 1;
  current.registry.push({
    ordinal,
    method,
    rawKey: key,
    rawRegistry: registry,
    rawValue: value,
    rawResult: result,
    c4Audit: !!references,
    keyShape,
    keyIdentity,
    provenanceRegistry: !!references && references.registry === registry,
    sameGraph,
    graphFailed: trackedGraph && typeof trackedGraph.failed === "boolean" ? trackedGraph.failed : null,
    snapshotFailed: trackedSnapshot && typeof trackedSnapshot.failed === "boolean" ? trackedSnapshot.failed : null,
    authorizationEntryCount: trackedSnapshot && Number.isSafeInteger(trackedSnapshot.authorizationEntryCount)
      ? trackedSnapshot.authorizationEntryCount
      : null,
    result: typeof result === "boolean" ? result : undefined,
    ownerComplete: method === "set" && keyShape === "owner"
      ? c3LifecycleOwnerComplete(key, current.graph)
      : undefined,
    stamp: method === "set" ? {
      allocations: current.allocationOrdinal,
      hashes: current.hashOrdinal,
      copies: current.copyOrdinal,
      pushes: current.pushOrdinal,
      operationCalls: current.operationCount()
    } : undefined
  });
}

const instrumentedWeakMapPrototype = nativeObject.create(nativeWeakMap.prototype);
nativeObject.defineProperties(instrumentedWeakMapPrototype, {
  constructor: { value: null, writable: true, configurable: true },
  get: {
    value(key) {
      const result = Reflect.apply(nativeWeakMapGet, this, [key]);
      c3LifecycleRegistryEvent("get", key, undefined, result, this);
      return result;
    }, writable: true, configurable: true
  },
  has: {
    value(key) {
      const result = Reflect.apply(nativeWeakMapHas, this, [key]);
      const value = result ? Reflect.apply(nativeWeakMapGet, this, [key]) : undefined;
      c3LifecycleRegistryEvent("has", key, undefined, value, this);
      return result;
    }, writable: true, configurable: true
  },
  set: {
    value(key, value) {
      const result = Reflect.apply(nativeWeakMapSet, this, [key, value]);
      c3LifecycleRegistryEvent("set", key, value, result, this);
      return result;
    }, writable: true, configurable: true
  },
  delete: {
    value(key) {
      const previous = Reflect.apply(nativeWeakMapGet, this, [key]);
      const result = Reflect.apply(nativeWeakMapDelete, this, [key]);
      c3LifecycleRegistryEvent("delete", key, undefined, previous, this);
      const current = c3LifecycleCurrent;
      const identity = current
        ? c3LifecycleRegistryIdentity(current, "delete", key, undefined, this)
        : null;
      if (current && current.fault && current.fault.kind === "registryDeleteAfter"
        && current.fault.identity === identity && !current.faultTriggered) {
        c3LifecycleRecordFault(current);
        throw new Error("synthetic registry delete completion failure");
      }
      return result;
    }, writable: true, configurable: true
  }
});

function c3CreateLifecycleTracker() {
  return {
    byteRecords: new nativeWeakMap(), byteEntries: new nativeArray(), nextByteId: 1,
    arrayRecords: new nativeWeakMap(), arrayEntries: new nativeArray(), nextArrayId: 1,
    objectEntries: new nativeArray(),
    phases: new nativeArray(), pendingByteRole: null, pendingFixedRole: null,
    pendingSemanticRoles: new nativeArray()
  };
}

function c3LifecycleBegin(tracker, name, graph, operationCount = () => 0, fault = null) {
  if (c3LifecycleCurrent) throw new Error("nested C3 lifecycle phase");
  const phase = {
    name, graph, operationCount, allocationOrdinal: 0, hashOrdinal: 0,
    fillOrdinal: 0, copyOrdinal: 0, pushOrdinal: 0, attachedOrdinal: 0, fixedOrdinal: 0,
    roleAllocationOrdinals: nativeObject.create(null), roleFillOrdinals: nativeObject.create(null),
    registry: new nativeArray(), fills: new nativeArray(), copies: new nativeArray(), pushes: new nativeArray(),
    objects: new nativeArray(), allocationKinds: nativeObject.create(null), hashes: new nativeArray(),
    fixedAllocations: new nativeArray(), roleAllocations: new nativeArray(), roleFills: new nativeArray(),
    fixedReserves: new nativeArray(), fixedCompletions: new nativeArray(),
    semanticReserveOrdinal: 0, semanticBatchOrdinal: 0, currentSemanticBatch: 0,
    preimageReserveOrdinal: 0, preimageReserves: new nativeArray(), pendingPreimageReserve: null,
    workAttemptCount: 0, workReservationCount: 0, workCompletionCount: 0, workThrowCount: 0,
    workInFlight: 0, workOrderingValid: true,
    lastWorkAttemptStamp: null, lastWorkCompletionStamp: null,
    matcherAttemptCount: 0, matcherCompletionCount: 0, matcherThrowCount: 0,
    matcherInFlight: 0, matcherOrderingValid: true,
    captureMatcherLedger: tracker.captureMatcherLedger === true,
    matcherLedgerOrdinal: 0, matcherLedger: new nativeArray(),
    eventBatchByOrdinal: new nativeMap(), retentions: new nativeArray(), actionOrdinal: 0, lastEventPushAction: 0,
    allocationActions: new nativeArray(), objectAllocationRecords: new nativeWeakMap(),
    objectAllocationEntries: new nativeArray(), byteAllocationActions: new nativeArray(), copyActions: new nativeArray(),
    rawDirectoryOccurrences: new nativeArray(), rawDirectoryCursor: 0, rawDirectoryFailed: false,
    publicStage: null, fault, faultTriggered: false, faultTriggerCount: 0, faultStamp: null,
    c4Audit: !!tracker.c4RawReferences,
    forwardWorkOrdinal: 0, forwardWorkKinds: nativeObject.create(null), projectionFreezeOrdinal: 0
  };
  tracker.phases.push(phase);
  c3LifecycleCurrent = phase;
  phase.tracker = tracker;
  nativeArray.prototype.push = c3LifecycleInstrumentedArrayPush;
  nativeBuffer.prototype.fill = c3LifecycleInstrumentedBufferFill;
  nativeBuffer.prototype.copy = c3LifecycleInstrumentedBufferCopy;
  nativeUint8Array.prototype.fill = c3LifecycleInstrumentedUint8ArrayFill;
  return phase;
}

function c3LifecycleEnd() {
  const phase = c3LifecycleCurrent;
  c3LifecycleCurrent = null;
  try {
    if (!phase) return phase;
    phase.finalStamp = {
      allocations: phase.allocationOrdinal,
      hashes: phase.hashOrdinal,
      copies: phase.copyOrdinal,
      pushes: phase.pushOrdinal,
      operationCalls: phase.operationCount()
    };
    phase.workOrderingValid = phase.workOrderingValid
      && phase.workCompletionCount + phase.workThrowCount === phase.workAttemptCount
      && phase.workReservationCount === phase.workAttemptCount
      && phase.workInFlight === 0;
    phase.matcherOrderingValid = phase.matcherOrderingValid
      && phase.matcherCompletionCount + phase.matcherThrowCount === phase.matcherAttemptCount
      && phase.matcherInFlight === 0;
    phase.preimagePendingCount = phase.pendingPreimageReserve === null ? 0 : 1;
    phase.rawDirectoryState = {
      rawCount: phase.rawDirectoryOccurrences.length,
      matchedCount: phase.rawDirectoryCursor,
      failed: phase.rawDirectoryFailed
    };
    phase.rawDirectoryOccurrences.length = 0;
    phase.rawDirectoryOccurrences = null;
    phase.rawDirectoryCursor = 0;
    phase.rawDirectoryFailed = false;
    phase.byteState = phase.tracker.byteEntries.map((record) => ({
      id: record.id,
      roles: [...record.roles].sort(),
      zero: record.value.every((byte) => byte === 0)
    }));
    phase.arrayState = phase.tracker.arrayEntries.map((record) => ({
      id: record.id, role: record.role, length: record.value.length
    }));
    const ownerRecord = phase.objects.find((record) => record.role === "owner");
    const closureRecord = phase.objects.find((record) => record.role === "closure");
    let ownerLinksClosure = null;
    if (ownerRecord && closureRecord) {
      const descriptor = nativeObject.getOwnPropertyDescriptor(ownerRecord.value, "closure");
      ownerLinksClosure = !!descriptor && nativeObject.hasOwn(descriptor, "value") && descriptor.value === closureRecord.value;
    }
    phase.objectState = {
      roles: phase.objects.map((record) => record.role),
      ownerLinksClosure
    };
    phase.graph = null;
    phase.operationCount = null;
    phase.fault = null;
    phase.pendingPreimageReserve = null;
    phase.tracker.pendingByteRole = null;
    phase.tracker.pendingFixedRole = null;
    phase.tracker.pendingSemanticRoles.length = 0;
    phase.tracker = null;
    return phase;
  } finally {
    nativeArray.prototype.push = nativeArrayPush;
    nativeBuffer.prototype.fill = nativeBufferFill;
    nativeBuffer.prototype.copy = nativeBufferCopy;
    nativeUint8Array.prototype.fill = nativeUint8ArrayFill;
  }
}

function c3LifecycleInstrumentedArrayPush(value) {
  const current = c3LifecycleCurrent;
  if (current) {
    const arrayRecord = current.tracker.arrayRecords.get(this);
    if (arrayRecord) {
      current.pushOrdinal += 1;
      current.actionOrdinal += 1;
      const pushAction = current.actionOrdinal;
      const bufferIds = new nativeArray();
      let eventKind = null;
      let eventDirective = null;
      let eventKeys = null;
      let eventSymbolCount = null;
      let eventProxy = null;
      let eventNullPrototype = null;
      let eventFrozen = null;
      let eventOrdinal = null;
      let eventSourceOrdinal = null;
      let eventLineNumber = null;
      let eventScope = null;
      let eventBranchOrdinal = null;
      let eventDescriptorsExact = null;
      if (arrayRecord.role === "events") {
        for (let index = 0; index < arguments.length; index += 1) {
          const event = arguments[index];
          if (!event || (typeof event !== "object" && typeof event !== "function") || types.isProxy(event)) continue;
          if (arguments.length === 1) {
            eventKind = typeof event.kind === "string" ? event.kind : null;
            eventDirective = typeof event.directive === "string" ? event.directive : null;
            eventKeys = nativeObject.getOwnPropertyNames(event);
            eventSymbolCount = nativeObject.getOwnPropertySymbols(event).length;
            eventProxy = types.isProxy(event);
            eventNullPrototype = nativeObject.getPrototypeOf(event) === null;
            eventFrozen = nativeObject.isFrozen(event);
            eventOrdinal = event.eventOrdinal;
            eventSourceOrdinal = event.sourceOrdinal;
            eventLineNumber = event.lineNumber;
            eventScope = event.scope;
            eventBranchOrdinal = event.branchOrdinal;
            eventDescriptorsExact = true;
            for (const key of eventKeys) {
              const descriptor = nativeObject.getOwnPropertyDescriptor(event, key);
              if (!descriptor || !nativeObject.hasOwn(descriptor, "value")
                || descriptor.writable !== false || descriptor.enumerable !== true
                || descriptor.configurable !== false || descriptor.get !== undefined
                || descriptor.set !== undefined) eventDescriptorsExact = false;
            }
          }
          for (const name of nativeObject.getOwnPropertyNames(event)) {
            const descriptor = nativeObject.getOwnPropertyDescriptor(event, name);
            if (!descriptor || !nativeObject.hasOwn(descriptor, "value") || !nativeBuffer.isBuffer(descriptor.value)) continue;
            const byteRecord = c3LifecycleByteRecord(descriptor.value, "external");
            if (!byteRecord) continue;
            byteRecord.roles.add("retainedEvent");
            if (byteRecord.attachedOrdinal === undefined) {
              byteRecord.attachedOrdinal = current.attachedOrdinal;
              current.attachedOrdinal += 1;
            }
            byteRecord.eventOrdinal = event.eventOrdinal;
            Reflect.apply(nativeArrayPush, bufferIds, [byteRecord.id]);
          }
        }
      }
      Reflect.apply(nativeArrayPush, current.pushes, [{
        ordinal: current.pushOrdinal,
        arrayRole: arrayRecord.role,
        valueCount: arguments.length,
        eventKind,
        eventDirective,
        eventKeys,
        eventSymbolCount,
        eventProxy,
        eventNullPrototype,
        eventFrozen,
        eventOrdinal,
        eventSourceOrdinal,
        eventLineNumber,
        eventScope,
        eventBranchOrdinal,
        eventDescriptorsExact,
        bufferIds
      }]);
      if (arrayRecord.role === "files") {
        for (let index = 0; index < arguments.length; index += 1) {
          const record = current.objectAllocationRecords.get(arguments[index]);
          if (record && record.classification === null) record.classification = "sourceFile";
        }
      }
      if (arrayRecord.role === "events" && arguments.length === 1) {
        const event = arguments[0];
        const role = c3LifecycleSemanticRoleForEvent(event);
        let expectedBatch = null;
        if (role !== "sshPhysicalDirective" && role !== "sshSelectedInsertion") {
          expectedBatch = current.eventBatchByOrdinal.get(event.physicalEventOrdinal);
        } else if (role === "sshSelectedInsertion") {
          expectedBatch = current.eventBatchByOrdinal.get(event.includePatternEventOrdinal);
        }
        let reserveIndex = -1;
        const includeRole = role === "sshIncludePattern" || role === "sshSelectedInsertion";
        const start = includeRole ? current.tracker.pendingSemanticRoles.length - 1 : 0;
        const step = includeRole ? -1 : 1;
        for (let index = start; index >= 0 && index < current.tracker.pendingSemanticRoles.length; index += step) {
          const candidate = current.tracker.pendingSemanticRoles[index];
          if (candidate.role === role
            && (role === "sshPhysicalDirective" || includeRole || candidate.batch === expectedBatch)) {
            reserveIndex = index;
            break;
          }
        }
        if (reserveIndex >= 0) {
          const reserve = current.tracker.pendingSemanticRoles[reserveIndex];
          for (let index = reserveIndex; index + 1 < current.tracker.pendingSemanticRoles.length; index += 1) {
            current.tracker.pendingSemanticRoles[index] = current.tracker.pendingSemanticRoles[index + 1];
          }
          current.tracker.pendingSemanticRoles.length -= 1;
          const lowerAction = Math.max(reserve.reserveStamp.action, current.lastEventPushAction);
          const allocations = current.allocationActions.filter((entry) => entry.action > lowerAction && entry.action < pushAction);
          const objects = current.objectAllocationEntries.filter((entry) => entry.action > lowerAction && entry.action < pushAction);
          const byteAllocations = current.byteAllocationActions.filter((entry) => bufferIds.includes(entry.byteId)
            && entry.action > reserve.reserveStamp.action && entry.action < pushAction);
          const copies = current.copyActions.filter((entry) => bufferIds.includes(entry.targetId)
            && entry.action > reserve.reserveStamp.action && entry.action < pushAction);
          const objectRecord = current.objectAllocationRecords.get(event);
          if (objectRecord && objectRecord.classification === null) objectRecord.classification = "event";
          Reflect.apply(nativeArrayPush, current.retentions, [{
            role,
            reserveOrdinal: reserve.reserveOrdinal,
            reserveStamp: reserve.reserveStamp,
            allocationKinds: allocations.map((entry) => entry.kind),
            objectCreateOrdinals: objects.map((entry) => entry.ordinal),
            objectCreateActions: objects.map((entry) => entry.action),
            byteAllocationOrdinals: byteAllocations.map((entry) => entry.ordinal),
            byteAllocationActions: byteAllocations.map((entry) => entry.action),
            copyOrdinals: copies.map((entry) => entry.ordinal),
            copyActions: copies.map((entry) => entry.action),
            objectCreateCount: objects.length,
            objectIdentityMatches: !!objectRecord && objectRecord.classification === "event"
              && objectRecord.action > lowerAction && objectRecord.action < pushAction
              && objects.filter((entry) => entry.classification === null || entry.classification === "event").length === 1,
            pushOrdinal: current.pushOrdinal,
            pushAction,
            pushOperationCalls: current.operationCount(),
            eventOrdinal: Number.isSafeInteger(event.eventOrdinal) ? event.eventOrdinal : null
          }]);
          current.eventBatchByOrdinal.set(event.eventOrdinal,
            role === "sshPhysicalDirective" ? reserve.batch : expectedBatch === undefined ? reserve.batch : expectedBatch);
        }
        current.lastEventPushAction = pushAction;
      }
    }
  }
  return Reflect.apply(nativeArrayPush, this, arguments);
}

function c3LifecycleSemanticRoleForEvent(event) {
  if (!event || (typeof event !== "object" && typeof event !== "function") || types.isProxy(event)) return "unexpected";
  switch (event.kind) {
    case "physicalDirective": return "sshPhysicalDirective";
    case "includePattern": return "sshIncludePattern";
    case "selectedInsertion": return "sshSelectedInsertion";
    case "matchBranch": return "sshMatchBranch";
    case "matchCondition": return "sshMatchCondition";
    case "matchPattern": return "sshMatchPattern";
    case "assignment": return "sshAssignment";
    case "acceptEnvName": return "sshAcceptEnvName";
    default: return "unexpected";
  }
}

function c3LifecycleSignal(kind, value) {
  const current = c3LifecycleCurrent;
  if (!current) return;
  if (kind === "publicStage") current.publicStage = value;
  if (kind === "c4Reference" && current.tracker.c4RawReferences
    && value && (value.identity === "graph" || value.identity === "snapshot"
      || value.identity === "syntax" || value.identity === "policy")) {
    const references = current.tracker.c4RawReferences;
    if (value.identity === "syntax" && references.policy === value.owner) references.policy = null;
    references[value.identity] = value.owner;
    if (value.identity === "graph") {
      for (const entry of current.registry) {
        const candidate = entry.method === "set" ? entry.rawValue : entry.rawResult;
        entry.sameGraph = candidate === value.owner;
      }
    }
    if (value.identity !== "graph") {
      for (const entry of current.registry) {
        if (entry.rawKey === value.owner) {
          entry.keyIdentity = value.identity;
          const candidate = entry.method === "set" ? entry.rawValue : entry.rawResult;
          entry.sameGraph = references.graph !== null && candidate === references.graph;
          if (references.registry === null) references.registry = entry.rawRegistry;
          else if (references.registry !== entry.rawRegistry) references.registryStable = false;
        }
      }
      if (references.registry !== null) {
        for (const entry of current.registry) {
          if (entry.rawRegistry === references.registry) entry.provenanceRegistry = true;
        }
      }
    }
  }
  if (kind === "preimage") {
    current.preimageReserveOrdinal += 1;
    current.actionOrdinal += 1;
    const reserve = {
      ordinal: current.preimageReserveOrdinal,
      reservedLength: value,
      action: current.actionOrdinal,
      allocations: current.allocationOrdinal,
      hashes: current.hashOrdinal,
      fills: current.fillOrdinal,
      pushes: current.pushOrdinal,
      allocationOrdinal: null,
      allocationAction: null,
      allocationKind: null,
      requestedLength: null,
      actualLength: null,
      byteId: null,
      ...(current.publicStage === null ? {} : { publicStage: current.publicStage })
    };
    current.pendingPreimageReserve = reserve;
    Reflect.apply(nativeArrayPush, current.preimageReserves, [reserve]);
  }
  if (kind === "fixed") {
    current.fixedOrdinal += 1;
    current.actionOrdinal += 1;
    current.tracker.pendingFixedRole = ["owner", "closure", "files", "events", "activePaths"][current.fixedOrdinal - 1] || "unexpectedFixed";
    Reflect.apply(nativeArrayPush, current.fixedReserves, [{
      ordinal: current.fixedOrdinal,
      action: current.actionOrdinal,
      allocations: current.allocationOrdinal,
      ...(current.publicStage === null ? {} : { publicStage: current.publicStage })
    }]);
  }
  if (kind === "workAttempt") {
    current.workAttemptCount += 1;
    current.workReservationCount += 1;
    current.workInFlight += 1;
    current.workOrderingValid = current.workOrderingValid
      && current.workCompletionCount < current.workAttemptCount;
    current.lastWorkAttemptStamp = {
      kind: value,
      attempts: current.workAttemptCount,
      reservations: current.workReservationCount,
      completions: current.workCompletionCount,
      allocations: current.allocationOrdinal,
      pushes: current.pushOrdinal,
      preimages: current.preimageReserveOrdinal,
      hashes: current.hashOrdinal,
      fills: current.fillOrdinal
    };
    if (current.captureMatcherLedger) {
      current.matcherLedgerOrdinal += 1;
      Reflect.apply(nativeArrayPush, current.matcherLedger, [{
        sequence: current.matcherLedgerOrdinal,
        phase: "reserveAttempt",
        kind: value,
        attempts: current.workAttemptCount,
        reservations: current.workReservationCount,
        completions: current.workCompletionCount
      }]);
    }
  }
  if (kind === "workComplete") {
    current.workOrderingValid = current.workOrderingValid && current.workInFlight === 1;
    current.workCompletionCount += 1;
    current.workInFlight -= 1;
    current.lastWorkCompletionStamp = {
      kind: value,
      attempts: current.workAttemptCount,
      reservations: current.workReservationCount,
      completions: current.workCompletionCount,
      allocations: current.allocationOrdinal,
      pushes: current.pushOrdinal,
      preimages: current.preimageReserveOrdinal,
      hashes: current.hashOrdinal,
      fills: current.fillOrdinal
    };
    if (current.captureMatcherLedger) {
      current.matcherLedgerOrdinal += 1;
      Reflect.apply(nativeArrayPush, current.matcherLedger, [{
        sequence: current.matcherLedgerOrdinal,
        phase: "reserveComplete",
        kind: value,
        attempts: current.workAttemptCount,
        reservations: current.workReservationCount,
        completions: current.workCompletionCount
      }]);
    }
  }
  if (kind === "workThrow") {
    current.workOrderingValid = current.workOrderingValid && current.workInFlight === 1;
    current.workThrowCount += 1;
    current.workInFlight -= 1;
  }
  if (kind === "matcherAttempt") {
    current.matcherAttemptCount += 1;
    current.matcherInFlight += 1;
    current.matcherOrderingValid = current.matcherOrderingValid
      && current.matcherCompletionCount + current.matcherThrowCount < current.matcherAttemptCount;
    if (current.captureMatcherLedger) {
      current.matcherLedgerOrdinal += 1;
      Reflect.apply(nativeArrayPush, current.matcherLedger, [{
        sequence: current.matcherLedgerOrdinal,
        phase: "matcherAttempt",
        kind: value,
        attempts: current.matcherAttemptCount,
        completions: current.matcherCompletionCount
      }]);
    }
  }
  if (kind === "matcherComplete") {
    current.matcherOrderingValid = current.matcherOrderingValid && current.matcherInFlight === 1;
    current.matcherCompletionCount += 1;
    current.matcherInFlight -= 1;
    if (current.captureMatcherLedger) {
      current.matcherLedgerOrdinal += 1;
      Reflect.apply(nativeArrayPush, current.matcherLedger, [{
        sequence: current.matcherLedgerOrdinal,
        phase: "matcherComplete",
        kind: value,
        attempts: current.matcherAttemptCount,
        completions: current.matcherCompletionCount
      }]);
    }
  }
  if (kind === "matcherThrow") {
    current.matcherOrderingValid = current.matcherOrderingValid && current.matcherInFlight === 1;
    current.matcherThrowCount += 1;
    current.matcherInFlight -= 1;
  }
  if (kind === "semantic" && (value === "sshPhysicalDirective" || value === "sshIncludePattern"
    || value === "sshSelectedInsertion" || value === "sshMatchBranch" || value === "sshMatchCondition"
    || value === "sshMatchPattern" || value === "sshAssignment" || value === "sshAcceptEnvName")) {
    current.semanticReserveOrdinal += 1;
    current.actionOrdinal += 1;
    if (value === "sshPhysicalDirective") {
      current.semanticBatchOrdinal += 1;
      current.currentSemanticBatch = current.semanticBatchOrdinal;
    }
    Reflect.apply(nativeArrayPush, current.tracker.pendingSemanticRoles, [{
      role: value,
      batch: current.currentSemanticBatch,
      reserveOrdinal: current.semanticReserveOrdinal,
      reserveStamp: {
        action: current.actionOrdinal,
        allocations: current.allocationOrdinal,
        copies: current.copyOrdinal,
        pushes: current.pushOrdinal
      }
    }]);
  }
}

function c3LifecycleBeforeAllocation(kind, requestedLength) {
  const current = c3LifecycleCurrent;
  if (!current) return;
  current.allocationOrdinal += 1;
  current.actionOrdinal += 1;
  current.allocationKinds[kind] = (current.allocationKinds[kind] || 0) + 1;
  const allocationAction = {
    ordinal: current.allocationOrdinal,
    action: current.actionOrdinal,
    kind,
    requestedLength: Number.isSafeInteger(requestedLength) ? requestedLength : null,
    preimageReserveOrdinal: null,
    ...(current.c4Audit === true ? {
      operationCalls: current.operationCount(),
      projectionFreezes: current.projectionFreezeOrdinal
    } : {}),
    ...(current.publicStage === null ? {} : { publicStage: current.publicStage })
  };
  const pendingPreimage = current.pendingPreimageReserve;
  if (pendingPreimage !== null) {
    pendingPreimage.allocationOrdinal = current.allocationOrdinal;
    pendingPreimage.allocationAction = current.actionOrdinal;
    pendingPreimage.allocationKind = kind;
    pendingPreimage.requestedLength = allocationAction.requestedLength;
    allocationAction.preimageReserveOrdinal = pendingPreimage.ordinal;
    current.pendingPreimageReserve = null;
  }
  Reflect.apply(nativeArrayPush, current.allocationActions, [allocationAction]);
  if (kind.startsWith("buffer") || kind === "textEncoderOutput") {
    Reflect.apply(nativeArrayPush, current.byteAllocationActions, [{
      ordinal: current.allocationOrdinal,
      action: current.actionOrdinal,
      kind,
      requestedLength: allocationAction.requestedLength,
      byteId: null,
      preimageReserveOrdinal: allocationAction.preimageReserveOrdinal,
      ...(current.c4Audit === true ? {
        operationCalls: current.operationCount(),
        projectionFreezes: current.projectionFreezeOrdinal
      } : {}),
      ...(current.publicStage === null ? {} : { publicStage: current.publicStage })
    }]);
  }
  if (current.fault && current.fault.kind === "allocationOrdinal"
    && current.fault.ordinal === current.allocationOrdinal && !current.faultTriggered) {
    c3LifecycleRecordFault(current);
    throw new Error("synthetic allocation ordinal failure");
  }
  const pendingFixedRole = current.tracker.pendingFixedRole;
  if (pendingFixedRole) {
    const expectedKind = pendingFixedRole === "owner" || pendingFixedRole === "closure" ? "objectCreate" : "array";
    Reflect.apply(nativeArrayPush, current.fixedAllocations, [{
      role: pendingFixedRole,
      ordinal: current.fixedOrdinal,
      kind,
      expectedKind: kind === expectedKind,
      ...(current.c4Audit === true ? {
        action: current.actionOrdinal,
        operationCalls: current.operationCount(),
        projectionFreezes: current.projectionFreezeOrdinal
      } : {}),
      ...(current.publicStage === null ? {} : { publicStage: current.publicStage })
    }]);
    if (current.fault && current.fault.kind === "fixedAllocation"
      && current.fault.role === pendingFixedRole && current.fault.ordinal === current.fixedOrdinal
      && kind === expectedKind && !current.faultTriggered) {
      c3LifecycleRecordFault(current);
      throw new Error("synthetic C3 fixed allocation failure");
    }
    if (current.fault && current.fault.kind === "fixedOrdinal"
      && current.fault.ordinal === current.fixedOrdinal && !current.faultTriggered) {
      c3LifecycleRecordFault(current);
      throw new Error("synthetic fixed allocation ordinal failure");
    }
  }
  const pendingRole = pendingPreimage === null ? null : "preimage";
  if (pendingRole && kind === "bufferAlloc" && requestedLength === pendingPreimage.reservedLength) {
    current.roleAllocationOrdinals[pendingRole] = (current.roleAllocationOrdinals[pendingRole] || 0) + 1;
    Reflect.apply(nativeArrayPush, current.roleAllocations, [{
      role: pendingRole,
      ordinal: current.roleAllocationOrdinals[pendingRole],
      kind,
      lengthMatches: true,
      ...(current.c4Audit === true ? {
        action: current.actionOrdinal,
        operationCalls: current.operationCount(),
        projectionFreezes: current.projectionFreezeOrdinal
      } : {}),
      ...(current.publicStage === null ? {} : { publicStage: current.publicStage })
    }]);
    if (current.fault && current.fault.kind === "allocationRole" && current.fault.role === pendingRole
      && current.fault.ordinal === current.roleAllocationOrdinals[pendingRole] && !current.faultTriggered) {
      c3LifecycleRecordFault(current);
      throw new Error("synthetic C3 role allocation failure");
    }
  }
}

function c3LifecycleByteRecord(value, creationKind) {
  const current = c3LifecycleCurrent;
  if (!current || !(nativeBuffer.isBuffer(value) || value instanceof nativeUint8Array)) return null;
  const tracker = current.tracker;
  let record = tracker.byteRecords.get(value);
  if (!record) {
    record = { value, id: tracker.nextByteId, creationKind, roles: new nativeSet(), fills: new nativeArray() };
    tracker.nextByteId += 1;
    tracker.byteRecords.set(value, record);
    tracker.byteEntries.push(record);
  }
  const pending = tracker.pendingByteRole;
  if (pending && creationKind === "bufferAlloc" && pending.length === value.length) {
    record.roles.add(pending.role);
    tracker.pendingByteRole = null;
  }
  return record;
}

function c3LifecycleMarkByte(value, role) {
  const record = c3LifecycleByteRecord(value, "external");
  if (record) record.roles.add(role);
  const current = c3LifecycleCurrent;
  if (current && role === "rawDirectory") {
    Reflect.apply(nativeArrayPush, current.rawDirectoryOccurrences, [{ value, length: value.length }]);
  }
  return record ? record.id : null;
}

function c3LifecycleMarkOwner(owner) {
  const current = c3LifecycleCurrent;
  if (!current || !owner || !nativeArray.isArray(owner.events)) return new nativeArray();
  const attached = new nativeArray();
  for (let eventOrdinal = 0; eventOrdinal < owner.events.length; eventOrdinal += 1) {
    const event = owner.events[eventOrdinal];
    for (const name of nativeObject.getOwnPropertyNames(event)) {
      const descriptor = nativeObject.getOwnPropertyDescriptor(event, name);
      if (!descriptor || !nativeObject.hasOwn(descriptor, "value") || !nativeBuffer.isBuffer(descriptor.value)) continue;
      const record = c3LifecycleByteRecord(descriptor.value, "external");
      if (!record) continue;
      record.roles.add("retainedEvent");
      if (record.attachedOrdinal === undefined) record.attachedOrdinal = attached.length;
      record.eventOrdinal = eventOrdinal;
      attached.push(record.id);
    }
  }
  return attached;
}

function c3LifecycleArrayRecord(value) {
  const current = c3LifecycleCurrent;
  if (!current || !nativeArray.isArray(value)) return null;
  const tracker = current.tracker;
  let record = tracker.arrayRecords.get(value);
  if (!record) {
    record = { value, id: tracker.nextArrayId, role: tracker.pendingFixedRole };
    tracker.nextArrayId += 1;
    tracker.arrayRecords.set(value, record);
    tracker.arrayEntries.push(record);
  }
  tracker.pendingFixedRole = null;
  return record;
}

function c3LifecycleObjectRecord(value, role) {
  const current = c3LifecycleCurrent;
  if (!current || (role !== "owner" && role !== "closure")) return;
  const record = { value, role };
  current.tracker.objectEntries.push(record);
  current.objects.push(record);
}

function c3TrackAllocation(kind, value) {
  const fixedCurrent = c3LifecycleCurrent;
  const pendingFixedRole = fixedCurrent && fixedCurrent.tracker.pendingFixedRole;
  const pendingFixedOrdinal = fixedCurrent && fixedCurrent.fixedOrdinal;
  if (allocationActive && Array.isArray(globalThis.__c3AllocationTrace)) {
    globalThis.__c3AllocationTrace.push([kind]);
  }
  if (allocationActive && kind === "array" && Array.isArray(globalThis.__c3TrackedArrays)) {
    globalThis.__c3TrackedArrays.push(value);
  }
  if (allocationActive && kind.startsWith("buffer") && Array.isArray(globalThis.__c3TrackedBuffers)) {
    globalThis.__c3TrackedBuffers.push(value);
  }
  if (kind === "array") c3LifecycleArrayRecord(value);
  if (kind === "objectCreate" && c3LifecycleCurrent) {
    const entry = {
      ordinal: c3LifecycleCurrent.allocationOrdinal,
      action: c3LifecycleCurrent.actionOrdinal,
      classification: c3LifecycleCurrent.tracker.pendingFixedRole === "owner"
        || c3LifecycleCurrent.tracker.pendingFixedRole === "closure"
        ? c3LifecycleCurrent.tracker.pendingFixedRole : null
    };
    c3LifecycleCurrent.objectAllocationRecords.set(value, entry);
    Reflect.apply(nativeArrayPush, c3LifecycleCurrent.objectAllocationEntries, [entry]);
  }
  if (kind === "objectCreate" && c3LifecycleCurrent
    && (c3LifecycleCurrent.tracker.pendingFixedRole === "owner" || c3LifecycleCurrent.tracker.pendingFixedRole === "closure")) {
    c3LifecycleObjectRecord(value, c3LifecycleCurrent.tracker.pendingFixedRole);
    c3LifecycleCurrent.tracker.pendingFixedRole = null;
  }
  if (fixedCurrent && pendingFixedRole !== null) {
    Reflect.apply(nativeArrayPush, fixedCurrent.fixedCompletions, [{
      ordinal: pendingFixedOrdinal,
      action: fixedCurrent.actionOrdinal,
      allocationOrdinal: fixedCurrent.allocationOrdinal,
      kind,
      ...(fixedCurrent.publicStage === null ? {} : { publicStage: fixedCurrent.publicStage })
    }]);
    if (fixedCurrent.tracker.pendingFixedRole === pendingFixedRole) {
      fixedCurrent.tracker.pendingFixedRole = null;
    }
  }
  if (kind.startsWith("buffer") || kind === "textEncoderOutput") {
    const byteRecord = c3LifecycleByteRecord(value, kind);
    const allocation = c3LifecycleCurrent && c3LifecycleCurrent.byteAllocationActions.at(-1);
    if (byteRecord && allocation && allocation.byteId === null
      && allocation.kind === kind
      && allocation.ordinal === c3LifecycleCurrent.allocationOrdinal
      && allocation.action === c3LifecycleCurrent.actionOrdinal) {
      allocation.byteId = byteRecord.id;
      allocation.actualLength = value.length;
      byteRecord.allocationOrdinal = allocation.ordinal;
      byteRecord.allocationAction = allocation.action;
      byteRecord.allocationKind = allocation.kind;
    }
    if (byteRecord && allocation && allocation.preimageReserveOrdinal !== null) {
      const reserve = c3LifecycleCurrent.preimageReserves.find((entry) =>
        entry.ordinal === allocation.preimageReserveOrdinal);
      if (reserve) {
        byteRecord.roles.add("preimage");
        reserve.actualLength = value.length;
        reserve.byteId = byteRecord.id;
      }
    }
  }
  return value;
}

function instrumentedObject(value) {
  if (allocationActive) allocationCounts.objectCall += 1;
  c3LifecycleRecordForwardWork("objectCall");
  return nativeObject(value);
}
instrumentedObject.prototype = nativeObject.prototype;
nativeObject.setPrototypeOf(instrumentedObject, nativeObject);
function c4ProjectionRawShapeAudit(value) {
  const pending = [{ value, path: "$" }];
  const seenValues = new nativeArray();
  const seenPaths = new nativeArray();
  const nodes = new nativeArray();
  const repeatedReferences = new nativeArray();
  while (pending.length > 0) {
    const entry = pending.pop();
    const current = entry.value;
    if (current === null || typeof current !== "object") continue;
    let prior = -1;
    for (let index = 0; index < seenValues.length; index += 1) {
      if (seenValues[index] === current) {
        prior = index;
        break;
      }
    }
    if (prior !== -1) {
      repeatedReferences.push({ path: entry.path, firstPath: seenPaths[prior] });
      continue;
    }
    seenValues.push(current);
    seenPaths.push(entry.path);
    const proxy = types.isProxy(current);
    if (proxy) {
      nodes.push({
        path: entry.path, proxy: true, prototypeKind: null, frozen: false,
        extensible: null, ownNames: [], ownSymbolCount: null, descriptors: []
      });
      continue;
    }
    const prototype = nativeObject.getPrototypeOf(current);
    const ownNames = nativeObject.getOwnPropertyNames(current);
    const descriptors = new nativeArray();
    for (let index = 0; index < ownNames.length; index += 1) {
      const name = ownNames[index];
      const descriptor = nativeObject.getOwnPropertyDescriptor(current, name);
      const data = !!descriptor && nativeObject.hasOwn(descriptor, "value")
        && descriptor.get === undefined && descriptor.set === undefined;
      const child = data && descriptor.value !== null && typeof descriptor.value === "object";
      const childPath = child ? entry.path + "/" + nativeJSON.stringify(name) : null;
      descriptors.push({
        name,
        data,
        valueKind: !data ? null : nativeArray.isArray(descriptor.value) ? "Array"
          : descriptor.value === null ? "null" : typeof descriptor.value === "object" ? "Object"
            : typeof descriptor.value,
        writable: !!descriptor && descriptor.writable === true,
        enumerable: !!descriptor && descriptor.enumerable === true,
        configurable: !!descriptor && descriptor.configurable === true,
        hasGetter: !!descriptor && descriptor.get !== undefined,
        hasSetter: !!descriptor && descriptor.set !== undefined,
        childPath
      });
      if (child) pending.push({ value: descriptor.value, path: childPath });
    }
    nodes.push({
      path: entry.path,
      proxy: false,
      prototypeKind: prototype === null ? "null" : prototype === nativeArray.prototype ? "Array" : "other",
      frozen: nativeObject.isFrozen(current),
      extensible: nativeObject.isExtensible(current),
      ownNames,
      ownSymbolCount: nativeObject.getOwnPropertySymbols(current).length,
      descriptors
    });
  }
  nodes.sort((left, right) => left.path.localeCompare(right.path));
  repeatedReferences.sort((left, right) => left.path.localeCompare(right.path));
  return { nodes, repeatedReferences };
}
function c4ProjectionRootShapeAudit(value) {
  const audit = c4ProjectionRawShapeAudit(value);
  return { root: audit.nodes.find((entry) => entry.path === "$") || null };
}
instrumentedObject.create = (...arguments_) => {
  if (allocationActive) allocationCounts.objectCreate += 1;
  c3LifecycleRecordForwardWork("objectCreate");
  c3LifecycleBeforeAllocation("objectCreate");
  return c3TrackAllocation("objectCreate", nativeObject.create(...arguments_));
};
instrumentedObject.freeze = (value) => {
  c3LifecycleRecordForwardWork("objectFreeze");
  const audit = context && context.__c4PublicAudit;
  let projectionEvent = null;
  if (audit && value && typeof value === "object") {
    const rootProxy = types.isProxy(value);
    const typeDescriptor = rootProxy ? undefined : nativeObject.getOwnPropertyDescriptor(value, "type");
    const projectionType = typeDescriptor && nativeObject.hasOwn(typeDescriptor, "value")
      ? typeDescriptor.value : null;
    let projectionKind = null;
    if (projectionType === "japan_ci_sshd_source_closure") {
      projectionKind = "include";
      audit.projectionFreezeCounts.include += 1;
    }
    if (projectionType === "japan_ci_sshd_match_coverage") {
      projectionKind = "coverage";
      audit.projectionFreezeCounts.coverage += 1;
    }
    if (projectionType === "japan_ci_ssh_authorization_topology") {
      projectionKind = "topology";
      audit.projectionFreezeCounts.topology += 1;
      audit.topologyFreezeCount += 1;
    }
    if (projectionKind !== null && nativeArray.isArray(audit.projectionFreezeEvents)) {
      const current = c3LifecycleCurrent;
      if (current) current.projectionFreezeOrdinal += 1;
      projectionEvent = {
        ordinal: audit.projectionFreezeEvents.length + 1,
        kind: projectionKind,
        publicStage: current ? current.publicStage : null,
        registryEvents: current ? current.registry.length : 0,
        action: current ? current.actionOrdinal : 0,
        forwardWork: current ? current.forwardWorkOrdinal : 0,
        rootProxy,
        rootSymbolCount: rootProxy ? null : nativeObject.getOwnPropertySymbols(value).length,
        typeDescriptorExact: !!typeDescriptor && typeDescriptor.get === undefined
          && typeDescriptor.set === undefined && typeDescriptor.enumerable === true,
        returnedRoot: false,
        frozenAfter: false,
        contentJson: null,
        rawShape: null
      };
      Reflect.apply(nativeArrayPush, audit.projectionFreezeEvents, [projectionEvent]);
      if (nativeArray.isArray(c4ProjectionFreezeReferences)) {
        Reflect.apply(nativeArrayPush, c4ProjectionFreezeReferences, [value]);
      }
    }
  }
  const frozen = nativeObject.freeze(value);
  if (projectionEvent !== null) {
    projectionEvent.frozenAfter = nativeObject.isFrozen(value);
    projectionEvent.contentJson = nativeJSON.stringify(value);
    projectionEvent.rawShape = c4ProjectionRootShapeAudit(value);
  }
  return frozen;
};
function instrumentedArray(...arguments_) {
  if (allocationActive) allocationCounts.array += 1;
  c3LifecycleRecordForwardWork("array");
  c3LifecycleBeforeAllocation("array");
  return c3TrackAllocation("array", new nativeArray(...arguments_));
}
instrumentedArray.prototype = nativeArray.prototype;
nativeObject.setPrototypeOf(instrumentedArray, nativeArray);
function instrumentedMap(iterable) {
  c3LifecycleRecordForwardWork("map");
  if (!new.target) return Reflect.apply(nativeMap, undefined, [iterable]);
  if (allocationActive && new.target) allocationCounts.map += 1;
  return new nativeMap(iterable);
}
instrumentedMap.prototype = nativeMap.prototype;
nativeObject.setPrototypeOf(instrumentedMap, nativeMap);
function instrumentedSet(iterable) {
  c3LifecycleRecordForwardWork("set");
  if (!new.target) return Reflect.apply(nativeSet, undefined, [iterable]);
  if (allocationActive && new.target) allocationCounts.set += 1;
  return new nativeSet(iterable);
}
instrumentedSet.prototype = nativeSet.prototype;
nativeObject.setPrototypeOf(instrumentedSet, nativeSet);
function instrumentedWeakMap(iterable) {
  c3LifecycleRecordForwardWork("weakMap");
  if (!new.target) return Reflect.apply(nativeWeakMap, undefined, [iterable]);
  if (allocationActive && new.target) allocationCounts.weakMap += 1;
  return Reflect.construct(nativeWeakMap, [iterable], new.target);
}
instrumentedWeakMap.prototype = instrumentedWeakMapPrototype;
nativeObject.defineProperty(instrumentedWeakMapPrototype, "constructor", {
  value: instrumentedWeakMap, writable: true, configurable: true
});
nativeObject.setPrototypeOf(instrumentedWeakMap, nativeWeakMap);
function instrumentedWeakSet(iterable) {
  c3LifecycleRecordForwardWork("weakSet");
  if (!new.target) return Reflect.apply(nativeWeakSet, undefined, [iterable]);
  if (allocationActive && new.target) allocationCounts.weakSet += 1;
  return new nativeWeakSet(iterable);
}
instrumentedWeakSet.prototype = nativeWeakSet.prototype;
nativeObject.setPrototypeOf(instrumentedWeakSet, nativeWeakSet);
function instrumentedProxy(target, handler) {
  c3LifecycleRecordForwardWork("proxy");
  if (allocationActive) allocationCounts.proxy += 1;
  if (!new.target) return Reflect.apply(nativeProxy, undefined, [target, handler]);
  return new nativeProxy(target, handler);
}
instrumentedProxy.revocable = (target, handler) => {
  c3LifecycleRecordForwardWork("proxyRevocable");
  if (allocationActive) allocationCounts.proxy += 1;
  return nativeProxy.revocable(target, handler);
};
const instrumentedBufferAlloc = (...arguments_) => {
  if (allocationActive) allocationCounts.bufferAlloc += 1;
  c3LifecycleRecordForwardWork("bufferAlloc");
  c3LifecycleBeforeAllocation("bufferAlloc", arguments_[0]);
  return c3TrackAllocation("bufferAlloc", nativeBuffer.alloc(...arguments_));
};
const instrumentedBufferFrom = (...arguments_) => {
  if (allocationActive) allocationCounts.bufferFrom += 1;
  c3LifecycleRecordForwardWork("bufferFrom");
  c3LifecycleBeforeAllocation("bufferFrom");
  const result = c3TrackAllocation("bufferFrom", nativeBuffer.from(...arguments_));
  const current = c3LifecycleCurrent;
  if (current && current.rawDirectoryCursor < current.rawDirectoryOccurrences.length) {
    try {
      const occurrence = current.rawDirectoryOccurrences[current.rawDirectoryCursor];
      if (arguments_.length !== 2 || typeof arguments_[0] !== "string" || arguments_[1] !== "utf8"
        || result.length !== occurrence.length
        || Reflect.apply(nativeBufferCompare, nativeBuffer, [result, occurrence.value]) !== 0) {
        current.rawDirectoryFailed = true;
      } else {
        const resultRecord = current.tracker.byteRecords.get(result);
        if (!resultRecord) {
          current.rawDirectoryFailed = true;
        } else {
          resultRecord.roles.add("directoryReencode");
          current.rawDirectoryCursor += 1;
        }
      }
    } catch {
      current.rawDirectoryFailed = true;
    }
  }
  return result;
};
const instrumentedBufferAllocUnsafe = (...arguments_) => {
  if (allocationActive) allocationCounts.bufferAllocUnsafe += 1;
  c3LifecycleRecordForwardWork("bufferAllocUnsafe");
  c3LifecycleBeforeAllocation("bufferAllocUnsafe");
  return c3TrackAllocation("bufferAllocUnsafe", nativeBuffer.allocUnsafe(...arguments_));
};
const instrumentedBufferAllocUnsafeSlow = (...arguments_) => {
  if (allocationActive) allocationCounts.bufferAllocUnsafe += 1;
  c3LifecycleRecordForwardWork("bufferAllocUnsafeSlow");
  c3LifecycleBeforeAllocation("bufferAllocUnsafe");
  return c3TrackAllocation("bufferAllocUnsafe", nativeBuffer.allocUnsafeSlow(...arguments_));
};
const instrumentedBufferConcat = (...arguments_) => {
  if (allocationActive) allocationCounts.bufferConcat += 1;
  c3LifecycleRecordForwardWork("bufferConcat");
  c3LifecycleBeforeAllocation("bufferConcat");
  return c3TrackAllocation("bufferConcat", nativeBuffer.concat(...arguments_));
};
const instrumentedBufferOf = (...arguments_) => {
  if (allocationActive) allocationCounts.bufferOf += 1;
  c3LifecycleRecordForwardWork("bufferOf");
  c3LifecycleBeforeAllocation("bufferOf");
  return c3TrackAllocation("bufferOf", nativeBuffer.of(...arguments_));
};
const instrumentedBufferCompare = (...arguments_) => {
  c3LifecycleRecordForwardWork("bufferCompare");
  if (Number.isSafeInteger(globalThis.__c3BufferCompareCount)) globalThis.__c3BufferCompareCount += 1;
  return nativeBuffer.compare(...arguments_);
};
const instrumentedBuffer = new Proxy(nativeBuffer, {
  apply(target, thisArgument, arguments_) {
    if (allocationActive) allocationCounts.bufferConstructor += 1;
    c3LifecycleRecordForwardWork("bufferConstructor");
    c3LifecycleBeforeAllocation("bufferConstructor");
    return c3TrackAllocation("bufferConstructor", Reflect.apply(target, thisArgument, arguments_));
  },
  construct(target, arguments_, newTarget) {
    if (allocationActive) allocationCounts.bufferConstructor += 1;
    c3LifecycleRecordForwardWork("bufferConstructor");
    c3LifecycleBeforeAllocation("bufferConstructor");
    return c3TrackAllocation("bufferConstructor", Reflect.construct(target, arguments_, newTarget));
  },
  get(target, property) {
    if (property === "alloc") return instrumentedBufferAlloc;
    if (property === "allocUnsafe") return instrumentedBufferAllocUnsafe;
    if (property === "allocUnsafeSlow") return instrumentedBufferAllocUnsafeSlow;
    if (property === "concat") return instrumentedBufferConcat;
    if (property === "compare") return instrumentedBufferCompare;
    if (property === "from") return instrumentedBufferFrom;
    if (property === "of") return instrumentedBufferOf;
    return Reflect.get(target, property, target);
  }
});
function instrumentedRegExp(...arguments_) {
  if (allocationActive) allocationCounts.regexp += 1;
  c3LifecycleRecordForwardWork("regexp");
  if (new.target) return Reflect.construct(nativeRegExp, arguments_);
  return Reflect.apply(nativeRegExp, undefined, arguments_);
}
instrumentedRegExp.prototype = nativeRegExp.prototype;
nativeObject.setPrototypeOf(instrumentedRegExp, nativeRegExp);
class InstrumentedTextEncoder extends nativeTextEncoder {
  constructor(...arguments_) {
    if (allocationActive) allocationCounts.textEncoder += 1;
    c3LifecycleRecordForwardWork("textEncoder");
    super(...arguments_);
  }
  encode(...arguments_) {
    if (allocationActive) allocationCounts.textEncode += 1;
    c3LifecycleRecordForwardWork("textEncode");
    c3LifecycleBeforeAllocation("textEncoderOutput");
    return c3TrackAllocation("textEncoderOutput", super.encode(...arguments_));
  }
  encodeInto(...arguments_) {
    if (allocationActive) allocationCounts.textEncode += 1;
    c3LifecycleRecordForwardWork("textEncodeInto");
    if (arguments_.length > 1) c3LifecycleMarkByte(arguments_[1], "textEncoderDestination");
    return super.encodeInto(...arguments_);
  }
}
const instrumentedJSONStringify = (...arguments_) => {
  if (allocationActive) allocationCounts.jsonStringify += 1;
  c3LifecycleRecordForwardWork("jsonStringify");
  return nativeJSON.stringify(...arguments_);
};
const instrumentedJSONParse = (...arguments_) => {
  if (allocationActive) allocationCounts.jsonParse += 1;
  c3LifecycleRecordForwardWork("jsonParse");
  return nativeJSON.parse(...arguments_);
};
const instrumentedJSON = new Proxy(nativeJSON, {
  get(target, property) {
    if (property === "stringify") return instrumentedJSONStringify;
    if (property === "parse") return instrumentedJSONParse;
    return Reflect.get(target, property, target);
  }
});
const instrumentedCreateHash = (...arguments_) => {
  if (allocationActive) allocationCounts.createHash += 1;
  c3LifecycleRecordForwardWork("createHash");
  if (allocationActive && Array.isArray(globalThis.__c3AllocationTrace)) globalThis.__c3AllocationTrace.push(["createHash"]);
  const current = c3LifecycleCurrent;
  const authorizationAudit = context && context.__c4AuthorizationVerifyActive === true
    && context.__c4PublicAudit && nativeArray.isArray(context.__c4PublicAudit.authorizationHashInputs)
    ? { algorithm: arguments_[0], updateCount: 0, totalLength: 0, inputSha256: null }
    : null;
  const authorizationInputHash = authorizationAudit === null ? null : crypto.createHash("sha256");
  let hashEntry = null;
  if (current) {
    current.hashOrdinal += 1;
    current.actionOrdinal += 1;
    hashEntry = {
      ordinal: current.hashOrdinal,
      action: current.actionOrdinal,
      ...(current.c4Audit === true ? {
        operationCalls: current.operationCount(),
        projectionFreezes: current.projectionFreezeOrdinal
      } : {}),
      ...(current.publicStage === null ? {} : { publicStage: current.publicStage }),
      updateByteIds: new nativeArray(),
      updateActions: new nativeArray(),
      updateLengths: new nativeArray(),
      updateSha256s: new nativeArray()
    };
    current.hashes.push(hashEntry);
    if (current.fault && current.fault.kind === "hash"
      && current.fault.ordinal === current.hashOrdinal && !current.faultTriggered) {
      c3LifecycleRecordFault(current);
      throw new Error("synthetic C3 hash failure");
    }
  }
  const hash = crypto.createHash(...arguments_);
  if (!current && authorizationAudit === null) return hash;
  const nativeUpdate = hash.update;
  const nativeDigest = hash.digest;
  nativeObject.defineProperties(hash, {
    update: {
      value(...updateArguments) {
        c3LifecycleRecordForwardWork("hashUpdate");
        if (current && updateArguments.length > 0) {
          const byteId = c3LifecycleMarkByte(updateArguments[0], "hashInput");
          current.actionOrdinal += 1;
          Reflect.apply(nativeArrayPush, hashEntry.updateByteIds, [byteId]);
          Reflect.apply(nativeArrayPush, hashEntry.updateActions, [current.actionOrdinal]);
          const input = updateArguments[0];
          const length = typeof input === "string"
            ? nativeBuffer.byteLength(input, updateArguments[1])
            : input && Number.isSafeInteger(input.byteLength) ? input.byteLength : null;
          Reflect.apply(nativeArrayPush, hashEntry.updateLengths, [length]);
          const inputSha256 = crypto.createHash("sha256");
          Reflect.apply(inputSha256.update, inputSha256, updateArguments);
          Reflect.apply(nativeArrayPush, hashEntry.updateSha256s, [inputSha256.digest("hex")]);
        }
        if (authorizationAudit !== null && updateArguments.length > 0) {
          const input = updateArguments[0];
          const length = typeof input === "string"
            ? nativeBuffer.byteLength(input, updateArguments[1])
            : input && Number.isSafeInteger(input.byteLength) ? input.byteLength : null;
          authorizationAudit.updateCount += 1;
          authorizationAudit.totalLength += length === null ? 0 : length;
          Reflect.apply(authorizationInputHash.update, authorizationInputHash, updateArguments);
        }
        Reflect.apply(nativeUpdate, hash, updateArguments);
        return hash;
      }, configurable: true
    },
    digest: {
      value(...digestArguments) {
        c3LifecycleRecordForwardWork("hashDigest");
        const c4BufferDigestAllocation = current && current.c4Audit === true
          && arguments_[0] === "sha256" && digestArguments[0] === undefined;
        if (c4BufferDigestAllocation) {
          c3LifecycleBeforeAllocation("bufferHashDigest", 32);
        }
        const result = Reflect.apply(nativeDigest, hash, digestArguments);
        if (authorizationAudit !== null) {
          authorizationAudit.inputSha256 = authorizationInputHash.digest("hex");
          Reflect.apply(nativeArrayPush, context.__c4PublicAudit.authorizationHashInputs, [{ ...authorizationAudit }]);
        }
        return current && (nativeBuffer.isBuffer(result) || result instanceof nativeUint8Array)
          ? c3TrackAllocation("bufferHashDigest", result)
          : result;
      }, configurable: true
    }
  });
  return hash;
};

function c3LifecycleInstrumentedBufferFill(...arguments_) {
  const current = c3LifecycleCurrent;
  let shouldFail = false;
  let roleShouldFail = false;
  if (current) {
    const record = c3LifecycleByteRecord(this, "external");
    current.fillOrdinal += 1;
    current.actionOrdinal += 1;
    const entry = {
      ordinal: current.fillOrdinal,
      action: current.actionOrdinal,
      ...(current.c4Audit === true ? {
        operationCalls: current.operationCount(),
        projectionFreezes: current.projectionFreezeOrdinal
      } : {}),
      byteId: record ? record.id : null,
      zero: arguments_[0] === 0,
      ...(current.publicStage === null ? {} : { publicStage: current.publicStage })
    };
    current.fills.push(entry);
    if (record) record.fills.push({ phase: current.name, ordinal: current.fillOrdinal, zero: entry.zero });
    shouldFail = current.fault && current.fault.kind === "fill"
      && current.fault.ordinal === current.fillOrdinal && !current.faultTriggered;
    if (record && record.roles.has("preimage") && arguments_[0] === 0) {
      current.roleFillOrdinals.preimage = (current.roleFillOrdinals.preimage || 0) + 1;
      Reflect.apply(nativeArrayPush, current.roleFills, [{
        role: "preimage",
        ordinal: current.roleFillOrdinals.preimage,
        byteId: record.id,
        zero: true,
        ...(current.publicStage === null ? {} : { publicStage: current.publicStage })
      }]);
      roleShouldFail = current.fault && current.fault.kind === "fillRole"
        && current.fault.role === "preimage"
        && current.fault.ordinal === current.roleFillOrdinals.preimage && !current.faultTriggered;
    }
  }
  const result = Reflect.apply(nativeBufferFill, this, arguments_);
  if (shouldFail || roleShouldFail) {
    c3LifecycleRecordFault(current);
    throw new Error("synthetic C3 fill failure");
  }
  return result;
}
function c3LifecycleInstrumentedBufferCopy(target, ...arguments_) {
  const current = c3LifecycleCurrent;
  if (current) {
    const sourceRecord = c3LifecycleByteRecord(this, "external");
    const targetRecord = c3LifecycleByteRecord(target, "external");
    current.copyOrdinal += 1;
    current.actionOrdinal += 1;
    current.copies.push({ ordinal: current.copyOrdinal, sourceId: sourceRecord ? sourceRecord.id : null, targetId: targetRecord ? targetRecord.id : null });
    Reflect.apply(nativeArrayPush, current.copyActions, [{
      ordinal: current.copyOrdinal,
      action: current.actionOrdinal,
      sourceId: sourceRecord ? sourceRecord.id : null,
      targetId: targetRecord ? targetRecord.id : null
    }]);
  }
  return Reflect.apply(nativeBufferCopy, this, [target, ...arguments_]);
}
function c3LifecycleInstrumentedUint8ArrayFill(...arguments_) {
  const current = c3LifecycleCurrent;
  let shouldFail = false;
  if (current && !nativeBuffer.isBuffer(this)) {
    const record = c3LifecycleByteRecord(this, "external");
    current.fillOrdinal += 1;
    current.actionOrdinal += 1;
    const entry = {
      ordinal: current.fillOrdinal,
      action: current.actionOrdinal,
      ...(current.c4Audit === true ? {
        operationCalls: current.operationCount(),
        projectionFreezes: current.projectionFreezeOrdinal
      } : {}),
      byteId: record ? record.id : null,
      zero: arguments_[0] === 0,
      ...(current.publicStage === null ? {} : { publicStage: current.publicStage })
    };
    current.fills.push(entry);
    if (record) record.fills.push({ phase: current.name, ordinal: current.fillOrdinal, zero: entry.zero });
    shouldFail = current.fault && current.fault.kind === "fill"
      && current.fault.ordinal === current.fillOrdinal && !current.faultTriggered;
  }
  const result = Reflect.apply(nativeUint8ArrayFill, this, arguments_);
  if (shouldFail) {
    c3LifecycleRecordFault(current);
    throw new Error("synthetic C3 fill failure");
  }
  return result;
}

const unused = () => { throw new Error("unused synthetic builtin"); };
function c4IsWholeAuthorizationRecordLength(length) {
  return context && Number.isSafeInteger(context.__c4AuthorizationRecordLength)
    && (length === context.__c4AuthorizationRecordLength
      || length + 1 === context.__c4AuthorizationRecordLength);
}
function c4BufferStringSpanIndex(value, fallback, length) {
  if (value === undefined) return fallback;
  const numeric = Number(value);
  if (Number.isNaN(numeric) || numeric <= 0) return 0;
  if (numeric === Infinity || numeric >= length) return length;
  return Math.trunc(numeric);
}
function c4InstrumentedBufferToString(...arguments_) {
  c3LifecycleRecordForwardWork("bufferToString");
  const audit = context && context.__c4PublicAudit;
  const start = c4BufferStringSpanIndex(arguments_[1], 0, this.length);
  const end = c4BufferStringSpanIndex(arguments_[2], this.length, this.length);
  const spanLength = end > start ? end - start : 0;
  if (context && context.__c4AuthorizationVerifyActive === true && audit) {
    const encoding = arguments_[0] === "utf8" ? "utf8"
      : arguments_[0] === "hex" ? "hex" : "other";
    const operationCalls = c3LifecycleCurrent && typeof c3LifecycleCurrent.operationCount === "function"
      ? c3LifecycleCurrent.operationCount()
      : null;
    audit.verifierBufferToStringCount += 1;
    audit.verifierBufferToStringSpans.push({
      sourceLength: this.length,
      start,
      end,
      spanLength,
      encoding,
      operationCalls
    });
    if (c4IsWholeAuthorizationRecordLength(spanLength)) {
      audit.wholeRecordBufferToStringCount += 1;
    }
  }
  return Reflect.apply(nativeBufferToString, this, arguments_);
}
class C4InstrumentedTextDecoder extends nativeTextDecoder {
  constructor(...arguments_) {
    c3LifecycleRecordForwardWork("textDecoder");
    const audit = context && context.__c4PublicAudit;
    if (context && context.__c4AuthorizationVerifyActive === true && audit) {
      audit.verifierTextDecoderConstructionCount += 1;
    }
    super(...arguments_);
  }
  decode(input, ...arguments_) {
    c3LifecycleRecordForwardWork("textDecode");
    const audit = context && context.__c4PublicAudit;
    if (context && context.__c4AuthorizationVerifyActive === true && audit) {
      const inputLength = input && typeof input.byteLength === "number" ? input.byteLength : null;
      audit.verifierTextDecoderDecodeCount += 1;
      audit.verifierTextDecoderInputLengths.push(inputLength);
      if (inputLength !== null && c4IsWholeAuthorizationRecordLength(inputLength)) {
        audit.wholeRecordTextDecoderCount += 1;
      }
    }
    return super.decode(input, ...arguments_);
  }
}
let c4NativeBuiltinHost = null;
let c4ContractErrorReferences = null;
let c4ProjectionFreezeReferences = null;
function c4NativeBuiltin(name, arguments_) {
  if (!c4NativeBuiltinHost || typeof c4NativeBuiltinHost[name] !== "function") return unused();
  return c4NativeBuiltinHost[name](...arguments_);
}
const fs = {
  chmodSync: unused, chownSync: unused, closeSync(...arguments_) { return c4NativeBuiltin("closeSync", arguments_); }, copyFileSync: unused,
  existsSync: unused, fstatSync(...arguments_) { return c4NativeBuiltin("fstatSync", arguments_); }, lstatSync(...arguments_) { return c4NativeBuiltin("lstatSync", arguments_); }, mkdirSync: unused,
  mkdtempSync: unused, openSync(...arguments_) { return c4NativeBuiltin("openSync", arguments_); }, readFileSync: unused, readSync(...arguments_) { return c4NativeBuiltin("readSync", arguments_); },
  realpathSync: unused, renameSync: unused, rmSync: unused, statSync: unused,
  writeFileSync: unused, writeSync: unused,
  constants: { O_RDONLY: 0, O_DIRECTORY: 0x10000, O_NOFOLLOW: 0x20000, O_CLOEXEC: 0x80000 }
};
const contractError = class JapanTuicRepairContractError extends Error {
  constructor(code) {
    super(code);
    const stack = this.stack;
    nativeObject.defineProperty(this, "stack", {
      value: stack,
      writable: true,
      enumerable: false,
      configurable: true
    });
    this.code = code;
    const audit = typeof context === "object" && context && context.__c4PublicAudit;
    if (audit && nativeArray.isArray(audit.contractErrorEvents)
      && nativeArray.isArray(c4ContractErrorReferences)) {
      const ordinal = c4ContractErrorReferences.length + 1;
      Reflect.apply(nativeArrayPush, c4ContractErrorReferences, [this]);
      Reflect.apply(nativeArrayPush, audit.contractErrorEvents, [{
        ordinal,
        codeExact: code === "restricted_identity_rejected",
        publicStage: c3LifecycleCurrent ? c3LifecycleCurrent.publicStage : null,
        registryEvents: c3LifecycleCurrent ? c3LifecycleCurrent.registry.length : 0,
        action: c3LifecycleCurrent ? c3LifecycleCurrent.actionOrdinal : 0
      }]);
    }
  }
};
const context = vm.createContext({
  Array: instrumentedArray,
  Buffer: instrumentedBuffer,
  JSON: instrumentedJSON,
  Map: instrumentedMap,
  Object: instrumentedObject,
  Proxy: instrumentedProxy,
  RegExp: instrumentedRegExp,
  Set: instrumentedSet,
  TextEncoder: InstrumentedTextEncoder,
  WeakMap: instrumentedWeakMap,
  WeakSet: instrumentedWeakSet,
  TextDecoder: C4InstrumentedTextDecoder,
  __testIsProxy: types.isProxy,
  process: { argv: [], env: {}, platform: "linux", stdin: {}, stdout: { write() {} }, stderr: { write() {} } },
  setTimeout,
  clearTimeout
});
const synthetic = (names, values) => new vm.SyntheticModule(names, function () {
  for (const name of names) this.setExport(name, values[name]);
}, { context });
const modules = new Map([
  ["node:crypto", synthetic(["createHash", "randomUUID"], { createHash: instrumentedCreateHash, randomUUID: () => "test-uuid" })],
  ["node:fs", synthetic(Object.keys(fs), fs)],
  ["node:child_process", synthetic(["execFile", "spawnSync"], { execFile: unused, spawnSync: (...arguments_) => c4NativeBuiltin("spawnSync", arguments_) })],
  ["node:util", synthetic(["promisify", "types"], { promisify, types })],
  ["node:path", synthetic(["dirname", "join", "posix", "resolve"], nodePath)],
  ["node:url", synthetic(["pathToFileURL", "fileURLToPath"], nodeUrl)],
  ["./japan-tuic-additive-repair-contract.mjs", synthetic([
    "JAPAN_TUIC_REPAIR_GATE", "JAPAN_TUIC_REPAIR_GATE_V3", "JapanTuicRepairContractError",
    "validateArtifactIdentity", "validateCandidateReport", "validateExecutionReceipt", "validateNaturalObservation", "validatePostApplyIdentity"
  ], {
    JAPAN_TUIC_REPAIR_GATE: {},
    JAPAN_TUIC_REPAIR_GATE_V3: {
      executionGateId: "test-gate", expectedNonceSha256: "a".repeat(64),
      artifact: { sha256: "b".repeat(64) }, releaseUnit: "unit", strategy: "strategy", surface: "surface", target: "target"
    },
    JapanTuicRepairContractError: contractError,
    validateArtifactIdentity: unused, validateCandidateReport: unused, validateExecutionReceipt: unused,
    validateNaturalObservation: unused, validatePostApplyIdentity: unused
  })],
  ["./japan-tuic-additive-repair-state.mjs", synthetic(["executionClaimSha256"], { executionClaimSha256: () => "c".repeat(64) })]
]);

const append = [
  "const __test_createAuthorizationSourceSnapshot = createAuthorizationSourceSnapshot;",
  "const __test_createAuthorizationSourceGraph = createAuthorizationSourceGraph;",
  "const __test_reserveAuthorizationSourceFile = reserveAuthorizationSourceFile;",
  "const __test_consumeTrustedAuthorizationSource = consumeTrustedAuthorizationSource;",
  "function __test_c2bCreateState() {",
  "  const snapshot = createAuthorizationSourceSnapshot();",
  "  const ssh = createAuthorizationSourceGraph(snapshot, 'ssh');",
  "  const sudo = createAuthorizationSourceGraph(snapshot, 'sudo');",
  "  return { snapshot, ssh, sudo };",
  "}",
  "const __test_AUTHORIZATION_SHARED_SEMANTIC_LIMITS = typeof AUTHORIZATION_SHARED_SEMANTIC_LIMITS === 'object' ? AUTHORIZATION_SHARED_SEMANTIC_LIMITS : undefined;",
  "const __test_AUTHORIZATION_SSH_SEMANTIC_LIMITS = typeof AUTHORIZATION_SSH_SEMANTIC_LIMITS === 'object' ? AUTHORIZATION_SSH_SEMANTIC_LIMITS : undefined;",
  "const __test_AUTHORIZATION_SUDO_SEMANTIC_LIMITS = typeof AUTHORIZATION_SUDO_SEMANTIC_LIMITS === 'object' ? AUTHORIZATION_SUDO_SEMANTIC_LIMITS : undefined;",
  "const __test_AUTHORIZATION_PARSER_LOCAL_LIMITS = typeof AUTHORIZATION_PARSER_LOCAL_LIMITS === 'object' ? AUTHORIZATION_PARSER_LOCAL_LIMITS : undefined;",
  "const __test_AUTHORIZATION_WORK_LIMITS = typeof AUTHORIZATION_WORK_LIMITS === 'object' ? AUTHORIZATION_WORK_LIMITS : undefined;",
  "function __test_c2bPolicy() {",
  "  return {",
  "    shared: { ...__test_AUTHORIZATION_SHARED_SEMANTIC_LIMITS },",
  "    ssh: { ...__test_AUTHORIZATION_SSH_SEMANTIC_LIMITS },",
  "    sudo: { ...__test_AUTHORIZATION_SUDO_SEMANTIC_LIMITS },",
  "    local: { ...__test_AUTHORIZATION_PARSER_LOCAL_LIMITS },",
  "    work: { ...__test_AUTHORIZATION_WORK_LIMITS },",
  "    frozen: [__test_AUTHORIZATION_SHARED_SEMANTIC_LIMITS, __test_AUTHORIZATION_SSH_SEMANTIC_LIMITS, __test_AUTHORIZATION_SUDO_SEMANTIC_LIMITS, __test_AUTHORIZATION_PARSER_LOCAL_LIMITS, __test_AUTHORIZATION_WORK_LIMITS].every(Object.isFrozen)",
  "  };",
  "}",
  "const __test_reserveAuthorizationSemanticNode = typeof reserveAuthorizationSemanticNode === 'function' ? reserveAuthorizationSemanticNode : undefined;",
  "function __test_c2bReserveSource(graph, size) { return reserveAuthorizationSourceFile(graph, size); }",
  "let __test_c2bSemanticTraceOriginal;",
  "let __test_c2bSemanticTraceGraph;",
  "let __test_c2bSemanticTraceCalls;",
  "let __test_c2bSemanticTraceKind;",
  "let __test_c2bSemanticTraceSameGraph;",
  "function __test_c2bSemanticTraceDelegate(graph, kind) {",
  "  __test_c2bSemanticTraceCalls += 1;",
  "  __test_c2bSemanticTraceKind = kind;",
  "  __test_c2bSemanticTraceSameGraph = __test_c2bSemanticTraceSameGraph && graph === __test_c2bSemanticTraceGraph;",
  "  return __test_c2bSemanticTraceOriginal(graph, kind);",
  "}",
  "function __test_c2bReserveSourceWithSemanticTrace(graph, size) {",
  "  __test_c2bSemanticTraceOriginal = reserveAuthorizationSemanticNode;",
  "  __test_c2bSemanticTraceGraph = graph;",
  "  __test_c2bSemanticTraceCalls = 0;",
  "  __test_c2bSemanticTraceKind = undefined;",
  "  __test_c2bSemanticTraceSameGraph = true;",
  "  reserveAuthorizationSemanticNode = __test_c2bSemanticTraceDelegate;",
  "  try { reserveAuthorizationSourceFile(graph, size); }",
  "  finally { reserveAuthorizationSemanticNode = __test_c2bSemanticTraceOriginal; }",
  "  return { calls: __test_c2bSemanticTraceCalls, kind: __test_c2bSemanticTraceKind, sameGraph: __test_c2bSemanticTraceSameGraph };",
  "}",
  "const __test_reserveAuthorizationWorkUnit = typeof reserveAuthorizationWorkUnit === 'function' ? reserveAuthorizationWorkUnit : undefined;",
  "const __test_reservePreimageBytes = typeof reservePreimageBytes === 'function' ? reservePreimageBytes : undefined;",
  "const __test_nextAuthorizationBudgetValue = typeof nextAuthorizationBudgetValue === 'function' ? nextAuthorizationBudgetValue : undefined;",
  "const __test_scanAuthorizationWildcardPattern = typeof scanAuthorizationWildcardPattern === 'function' ? scanAuthorizationWildcardPattern : undefined;",
  "const __test_matchAuthorizationWildcard = typeof matchAuthorizationWildcard === 'function' ? matchAuthorizationWildcard : undefined;",
  "const __test_reserveAuthorizationFixedEnvelope = typeof reserveAuthorizationFixedEnvelope === 'function' ? reserveAuthorizationFixedEnvelope : undefined;",
  "const __test_deriveAuthorizationSshSyntax = typeof deriveAuthorizationSshSyntax === 'function' ? deriveAuthorizationSshSyntax : undefined;",
  "const __test_disposeAuthorizationSshSyntax = typeof disposeAuthorizationSshSyntax === 'function' ? disposeAuthorizationSshSyntax : undefined;",
  "const __test_deriveAuthorizationSshPolicy = typeof deriveAuthorizationSshPolicy === 'function' ? deriveAuthorizationSshPolicy : undefined;",
  "const __test_disposeAuthorizationSshPolicy = typeof disposeAuthorizationSshPolicy === 'function' ? disposeAuthorizationSshPolicy : undefined;",
  "const __test_verifyProjectedSshAuthorization = typeof verifyProjectedSshAuthorization === 'function' ? verifyProjectedSshAuthorization : undefined;",
  "const __test_createNativeAccountOperations = createNativeAccountOperations;",
  "function __test_c3Trace(...values) { if (Array.isArray(globalThis.__c3AllocationTrace)) globalThis.__c3AllocationTrace.push(values); }",
  "if (typeof __test_reserveAuthorizationFixedEnvelope === 'function' && typeof __test_deriveAuthorizationSshSyntax === 'function' && typeof __test_disposeAuthorizationSshSyntax === 'function') {",
  "  const __test_c3RealReserveFixed = reserveAuthorizationFixedEnvelope;",
  "  reserveAuthorizationFixedEnvelope = function (graph) { __test_c3Trace('reserve-fixed'); const value = __test_c3RealReserveFixed(graph); if (typeof globalThis.__c4LedgerSignal === 'function') globalThis.__c4LedgerSignal('fixed', graph); if (typeof globalThis.__c3LifecycleSignal === 'function') globalThis.__c3LifecycleSignal('fixed'); return value; };",
  "  const __test_c3RealReserveSemantic = reserveAuthorizationSemanticNode;",
  "  reserveAuthorizationSemanticNode = function (graph, kind) { __test_c3Trace('reserve-semantic', kind); const value = __test_c3RealReserveSemantic(graph, kind); if (typeof globalThis.__c4LedgerSignal === 'function') globalThis.__c4LedgerSignal('semantic', graph, kind); if (typeof globalThis.__c3LifecycleSignal === 'function') globalThis.__c3LifecycleSignal('semantic', kind); return value; };",
  "  const __test_c3RealReserveWork = reserveAuthorizationWorkUnit;",
  "  reserveAuthorizationWorkUnit = function (graph, kind) { __test_c3Trace('reserve-work', kind); if (typeof globalThis.__c3LifecycleSignal === 'function') globalThis.__c3LifecycleSignal('workAttempt', kind); try { const value = __test_c3RealReserveWork(graph, kind); if (typeof globalThis.__c4LedgerSignal === 'function') globalThis.__c4LedgerSignal('work', graph, kind); if (typeof globalThis.__c3LifecycleSignal === 'function') globalThis.__c3LifecycleSignal('workComplete', kind); return value; } catch (error) { if (typeof globalThis.__c3LifecycleSignal === 'function') globalThis.__c3LifecycleSignal('workThrow', kind); throw error; } };",
  "  const __test_c3RealReservePreimage = reservePreimageBytes;",
  "  reservePreimageBytes = function (snapshot, length) { __test_c3Trace('reserve-preimage', length); const value = __test_c3RealReservePreimage(snapshot, length); const audit = globalThis.__c4PublicAudit; if (audit && Array.isArray(audit.preimageReserveLengths)) { audit.preimageReserveLengths.push(length); audit.preimageReserveTotal += length; } if (typeof globalThis.__c4LedgerSignal === 'function') globalThis.__c4LedgerSignal('preimage', snapshot, length); if (typeof globalThis.__c3LifecycleSignal === 'function') globalThis.__c3LifecycleSignal('preimage', length); return value; };",
  "  const __test_c3RealScanWildcard = scanAuthorizationWildcardPattern;",
  "  scanAuthorizationWildcardPattern = function (graph, pattern) { __test_c3Trace('scan-wildcard', pattern.length); const value = __test_c3RealScanWildcard(graph, pattern); if (typeof globalThis.__c4LedgerSignal === 'function') globalThis.__c4LedgerSignal('scan', graph, pattern.length); return value; };",
  "  function __test_c4WildcardAlignedCount(pattern, target, starIndex) {",
  "    if (starIndex === -1) { if (pattern.length !== target.length) return 0; for (let index = 0; index < pattern.length; index += 1) { if (pattern[index] !== 0x3f && pattern[index] !== target[index]) return index + 1; } return pattern.length; }",
  "    const prefixLength = starIndex; const suffixLength = pattern.length - starIndex - 1; if (target.length < prefixLength + suffixLength) return 0; let count = 0;",
  "    for (let index = 0; index < prefixLength; index += 1) { count += 1; if (pattern[index] !== 0x3f && pattern[index] !== target[index]) return count; }",
  "    for (let offset = 0; offset < suffixLength; offset += 1) { const patternIndex = pattern.length - offset - 1; const targetIndex = target.length - offset - 1; count += 1; if (pattern[patternIndex] !== 0x3f && pattern[patternIndex] !== target[targetIndex]) return count; } return count;",
  "  }",
  "  const __test_c3RealMatchWildcard = matchAuthorizationWildcard;",
  "  matchAuthorizationWildcard = function (graph, domain, pattern, target, starIndex) { __test_c3Trace('match-wildcard', domain, pattern.length, target.length, starIndex); if (typeof globalThis.__c3LifecycleSignal === 'function') globalThis.__c3LifecycleSignal('matcherAttempt', domain); try { const value = __test_c3RealMatchWildcard(graph, domain, pattern, target, starIndex); if (typeof globalThis.__c4LedgerSignal === 'function') globalThis.__c4LedgerSignal('match', graph, __test_c4WildcardAlignedCount(pattern, target, starIndex)); if (typeof globalThis.__c3LifecycleSignal === 'function') globalThis.__c3LifecycleSignal('matcherComplete', domain); return value; } catch (error) { if (typeof globalThis.__c3LifecycleSignal === 'function') globalThis.__c3LifecycleSignal('matcherThrow', domain); throw error; } };",
  "  const __test_c4RealReserveSourceRead = reserveAuthorizationSourceRead;",
  "  reserveAuthorizationSourceRead = function (graph, size) { const value = __test_c4RealReserveSourceRead(graph, size); if (typeof globalThis.__c4LedgerSignal === 'function') globalThis.__c4LedgerSignal('sourceRead', graph, size); return value; };",
  "  const __test_c4RealReserveSourceNode = reserveAuthorizationSourceNode;",
  "  reserveAuthorizationSourceNode = function (graph) { const value = __test_c4RealReserveSourceNode(graph); if (typeof globalThis.__c4LedgerSignal === 'function') globalThis.__c4LedgerSignal('sourceNode', graph, 1); return value; };",
  "  const __test_c4RealReserveDirectoryNames = reserveAuthorizationDirectoryNames;",
  "  reserveAuthorizationDirectoryNames = function (graph, count) { const value = __test_c4RealReserveDirectoryNames(graph, count); if (typeof globalThis.__c4LedgerSignal === 'function') globalThis.__c4LedgerSignal('directoryNames', graph, count); return value; };",
  "  const __test_c4RealEnterSourceDepth = enterAuthorizationSourceDepth;",
  "  enterAuthorizationSourceDepth = function (graph) { const value = __test_c4RealEnterSourceDepth(graph); if (typeof globalThis.__c4LedgerSignal === 'function') globalThis.__c4LedgerSignal('depth', graph, 1); return value; };",
  "  const __test_c4RealLeaveSourceDepth = leaveAuthorizationSourceDepth;",
  "  leaveAuthorizationSourceDepth = function (graph) { const value = __test_c4RealLeaveSourceDepth(graph); if (typeof globalThis.__c4LedgerSignal === 'function') globalThis.__c4LedgerSignal('depth', graph, -1); return value; };",
  "}",
  "function __test_c4PublicStage(name) { if (typeof globalThis.__c3LifecycleSignal === 'function') globalThis.__c3LifecycleSignal('publicStage', name); }",
  "function __test_c4PublicReference(identity, owner) { if (typeof globalThis.__c3LifecycleSignal === 'function') globalThis.__c3LifecycleSignal('c4Reference', { identity, owner }); }",
  "function __test_c4PublicTrace(name) { __test_c4PublicStage(name); if (Array.isArray(globalThis.__c4PublicCallTrace)) globalThis.__c4PublicCallTrace.push(name); }",
  "if (typeof __test_deriveAuthorizationSshPolicy === 'function' && typeof __test_disposeAuthorizationSshPolicy === 'function') {",
  "  const __test_c4RealLegacyLineParser = parseCanonicalAuthorizedKeyLine;",
  "  parseCanonicalAuthorizedKeyLine = function (value) { const audit = globalThis.__c4PublicAudit; if (audit) audit.legacyLineParserCallCount += 1; return __test_c4RealLegacyLineParser(value); };",
  "  const __test_c4RealCreateSnapshot = createAuthorizationSourceSnapshot;",
  "  createAuthorizationSourceSnapshot = function () { __test_c4PublicTrace('snapshot'); const value = __test_c4RealCreateSnapshot(); globalThis.__c4LastSnapshot = value; __test_c4PublicReference('snapshot', value); if (typeof globalThis.__c4CaptureInitialBoundary === 'function') globalThis.__c4CaptureInitialBoundary('snapshot', value, null, null); return value; };",
  "  const __test_c4RealCreateGraph = createAuthorizationSourceGraph;",
  "  createAuthorizationSourceGraph = function (snapshot, kind) { const value = __test_c4RealCreateGraph(snapshot, kind); __test_c4PublicTrace('graph:' + kind); if (kind === 'ssh') { globalThis.__c4LastSshGraph = value; __test_c4PublicReference('graph', value); if (typeof globalThis.__c4CaptureInitialBoundary === 'function') globalThis.__c4CaptureInitialBoundary('ssh', snapshot, value, null); } if (kind === 'sudo') { globalThis.__c4LastSudoGraph = value; if (typeof globalThis.__c4CaptureInitialBoundary === 'function') globalThis.__c4CaptureInitialBoundary('sudo', snapshot, globalThis.__c4LastSshGraph, value); } return value; };",
  "  const __test_c4RealDeriveSyntax = deriveAuthorizationSshSyntax;",
  "  deriveAuthorizationSshSyntax = function (graph, pathOperations, sourceOperations) { __test_c4PublicTrace('deriveSyntax'); try { const value = __test_c4RealDeriveSyntax(graph, pathOperations, sourceOperations); __test_c4PublicReference('syntax', value); return value; } finally { __test_c4PublicStage('deriveSyntax:complete'); } };",
  "  const __test_c4RealDisposeSyntax = disposeAuthorizationSshSyntax;",
  "  disposeAuthorizationSshSyntax = function (graph, syntax) { __test_c4PublicTrace('disposeSyntax'); return __test_c4RealDisposeSyntax(graph, syntax); };",
  "  const __test_c4RealDerivePolicy = deriveAuthorizationSshPolicy;",
  "  deriveAuthorizationSshPolicy = function (graph, syntax, accountCore) { __test_c4PublicTrace('derivePolicy'); try { const value = __test_c4RealDerivePolicy(graph, syntax, accountCore); __test_c4PublicReference('policy', value); return value; } finally { __test_c4PublicStage('derivePolicy:complete'); } };",
  "  const __test_c4RealDisposePolicy = disposeAuthorizationSshPolicy;",
  "  disposeAuthorizationSshPolicy = function (graph, policy) { __test_c4PublicTrace('disposePolicy'); return __test_c4RealDisposePolicy(graph, policy); };",
  "  if (typeof verifyProjectedSshAuthorization === 'function') {",
  "    const __test_c4RealVerifyAuthorization = verifyProjectedSshAuthorization;",
  "    verifyProjectedSshAuthorization = function (binding, pathOperations) { const audit = globalThis.__c4PublicAudit; __test_c4PublicTrace('verify'); if (audit) audit.verifyAttempts += 1; globalThis.__c4AuthorizationVerifyActive = true; try { const value = __test_c4RealVerifyAuthorization(binding, pathOperations); if (audit) { audit.verifySuccesses += 1; if (value === undefined) audit.verifyUndefinedReturns += 1; else audit.verifyNonUndefinedReturns += 1; } return value; } catch (error) { if (audit) audit.verifyFailures += 1; throw error; } finally { delete globalThis.__c4AuthorizationVerifyActive; __test_c4PublicStage('verify:complete'); } };",
  "  }",
  "  function __test_c4FinalizePublicSnapshotAudit() {",
  "    const snapshot = globalThis.__c4LastSnapshot;",
  "    const audit = globalThis.__c4PublicAudit;",
  "    if (audit && snapshot) { audit.authorizationEntryCount = snapshot.authorizationEntryCount; audit.snapshotFailed = snapshot.failed; }",
  "    delete globalThis.__c4LastSnapshot;",
  "  }",
  "  const __test_c4RealBuildInclude = buildCanonicalSshIncludeClosure;",
  "  buildCanonicalSshIncludeClosure = function (input) { __test_c4PublicTrace('include'); try { return Reflect.apply(__test_c4RealBuildInclude, this, arguments); } finally { __test_c4FinalizePublicSnapshotAudit(); } };",
  "  const __test_c4RealBuildCoverage = buildCanonicalSshMatchCoverage;",
  "  buildCanonicalSshMatchCoverage = function (projectedAccountCore, input) { __test_c4PublicTrace('coverage'); try { return Reflect.apply(__test_c4RealBuildCoverage, this, arguments); } finally { __test_c4FinalizePublicSnapshotAudit(); } };",
  "  const __test_c4RealBuildTopology = buildCanonicalSshTopology;",
  "  buildCanonicalSshTopology = function (projectedAccountCore, binding, input) {",
  "    __test_c4PublicTrace('topology');",
  "    try { return Reflect.apply(__test_c4RealBuildTopology, this, arguments); }",
  "    finally { __test_c4FinalizePublicSnapshotAudit(); }",
  "  };",
  "}",
  "function __test_missingC2BSymbols() {",
  "  return [",
  "    ['nextAuthorizationBudgetValue', __test_nextAuthorizationBudgetValue, 'function'],",
  "    ['reserveAuthorizationSemanticNode', __test_reserveAuthorizationSemanticNode, 'function'],",
  "    ['reserveAuthorizationWorkUnit', __test_reserveAuthorizationWorkUnit, 'function'],",
  "    ['reservePreimageBytes', __test_reservePreimageBytes, 'function'],",
  "    ['scanAuthorizationWildcardPattern', __test_scanAuthorizationWildcardPattern, 'function'],",
  "    ['matchAuthorizationWildcard', __test_matchAuthorizationWildcard, 'function'],",
  "    ['AUTHORIZATION_SHARED_SEMANTIC_LIMITS', __test_AUTHORIZATION_SHARED_SEMANTIC_LIMITS, 'object'],",
  "    ['AUTHORIZATION_SSH_SEMANTIC_LIMITS', __test_AUTHORIZATION_SSH_SEMANTIC_LIMITS, 'object'],",
  "    ['AUTHORIZATION_SUDO_SEMANTIC_LIMITS', __test_AUTHORIZATION_SUDO_SEMANTIC_LIMITS, 'object'],",
  "    ['AUTHORIZATION_PARSER_LOCAL_LIMITS', __test_AUTHORIZATION_PARSER_LOCAL_LIMITS, 'object'],",
  "    ['AUTHORIZATION_WORK_LIMITS', __test_AUTHORIZATION_WORK_LIMITS, 'object']",
  "  ].filter(([, value, expectedType]) => typeof value !== expectedType || (expectedType === 'object' && value === null)).map(([name]) => name);",
  "}",
  "function __test_missingC3Symbols() {",
  "  return [",
  "    ['reserveAuthorizationFixedEnvelope', __test_reserveAuthorizationFixedEnvelope],",
  "    ['deriveAuthorizationSshSyntax', __test_deriveAuthorizationSshSyntax],",
  "    ['disposeAuthorizationSshSyntax', __test_disposeAuthorizationSshSyntax]",
  "  ].filter(([, value]) => typeof value !== 'function').map(([name]) => name);",
  "}",
  "function __test_missingC4Symbols() {",
  "  return [",
  "    ['deriveAuthorizationSshPolicy', __test_deriveAuthorizationSshPolicy],",
  "    ['disposeAuthorizationSshPolicy', __test_disposeAuthorizationSshPolicy]",
  "  ].filter(([, value]) => typeof value !== 'function').map(([name]) => name);",
  "}",
  "function __test_c3Arities() { return {",
  "  reserveAuthorizationFixedEnvelope: typeof __test_reserveAuthorizationFixedEnvelope === 'function' ? __test_reserveAuthorizationFixedEnvelope.length : null,",
  "  deriveAuthorizationSshSyntax: typeof __test_deriveAuthorizationSshSyntax === 'function' ? __test_deriveAuthorizationSshSyntax.length : null,",
  "  disposeAuthorizationSshSyntax: typeof __test_disposeAuthorizationSshSyntax === 'function' ? __test_disposeAuthorizationSshSyntax.length : null",
  "}; }",
  "function __test_c4Arities() { return {",
  "  deriveAuthorizationSshPolicy: typeof __test_deriveAuthorizationSshPolicy === 'function' ? __test_deriveAuthorizationSshPolicy.length : null,",
  "  disposeAuthorizationSshPolicy: typeof __test_disposeAuthorizationSshPolicy === 'function' ? __test_disposeAuthorizationSshPolicy.length : null,",
  "  verifyProjectedSshAuthorization: typeof __test_verifyProjectedSshAuthorization === 'function' ? __test_verifyProjectedSshAuthorization.length : null",
  "}; }",
  "function __test_c2bArities() { return {",
  "  nextAuthorizationBudgetValue: nextAuthorizationBudgetValue.length,",
  "  reserveAuthorizationSemanticNode: reserveAuthorizationSemanticNode.length,",
  "  reserveAuthorizationWorkUnit: reserveAuthorizationWorkUnit.length,",
  "  reservePreimageBytes: reservePreimageBytes.length,",
  "  scanAuthorizationWildcardPattern: scanAuthorizationWildcardPattern.length,",
  "  matchAuthorizationWildcard: matchAuthorizationWildcard.length",
  "}; }",
  "function __test_c2bProxyInstrumentation(state) {",
  "  const direct = new Proxy(state.snapshot, state.ssh);",
  "  const revocable = Proxy.revocable(state.snapshot, state.sudo);",
  "  const result = __testIsProxy(direct) && __testIsProxy(revocable.proxy);",
  "  revocable.revoke();",
  "  return result;",
  "}",
  "function __test_inspectAuthorizationBudgetState(state) {",
  "  const inspectGraph = (graph) => ({",
  "    kind: graph.kind, failed: graph.failed, fixedEnvelopeCount: graph.fixedEnvelopeCount,",
  "    semanticNodeCount: graph.semanticNodeCount, fileCount: graph.fileCount, sourceFileCount: graph.sourceFileCount,",
  "    totalBytes: graph.totalBytes, directoryNameCount: graph.directoryNameCount, depth: graph.depth, nextOrdinal: graph.nextOrdinal,",
  "    sshPhysicalDirectiveCount: graph.sshPhysicalDirectiveCount,",
  "    sshIncludePatternCount: graph.sshIncludePatternCount, sshSelectedInsertionCount: graph.sshSelectedInsertionCount,",
  "    sshMatchBranchCount: graph.sshMatchBranchCount, sshMatchConditionCount: graph.sshMatchConditionCount,",
  "    sshMatchPatternCount: graph.sshMatchPatternCount, sshAssignmentCount: graph.sshAssignmentCount,",
  "    sshAcceptEnvNameCount: graph.sshAcceptEnvNameCount, sudoStatementCount: graph.sudoStatementCount,",
  "    sudoIncludeCount: graph.sudoIncludeCount, sudoSelectedInsertionCount: graph.sudoSelectedInsertionCount,",
  "    sudoAliasDefinitionCount: graph.sudoAliasDefinitionCount, sudoAliasMemberCount: graph.sudoAliasMemberCount,",
  "    sudoDefaultsItemCount: graph.sudoDefaultsItemCount, sudoUserSpecCount: graph.sudoUserSpecCount,",
  "    sudoUserHostRunasMemberCount: graph.sudoUserHostRunasMemberCount, sudoTagTransitionCount: graph.sudoTagTransitionCount,",
  "    sudoCommandSpecCount: graph.sudoCommandSpecCount, sudoArgumentTokenCount: graph.sudoArgumentTokenCount,",
  "    sudoAliasEdgeCount: graph.sudoAliasEdgeCount, sudoAliasMemoEntryCount: graph.sudoAliasMemoEntryCount,",
  "    globComparisonCount: graph.globComparisonCount, commandWorkCount: graph.commandWorkCount, aliasEdgeWorkCount: graph.aliasEdgeWorkCount",
  "  });",
  "  const inspectCleanup = (value) => {",
  "    const descriptor = Object.getOwnPropertyDescriptor(value, 'length');",
  "    const prototype = Object.getPrototypeOf(value);",
  "    return {",
  "      isArray: Array.isArray(value), isProxy: __testIsProxy(value),",
  "      prototypeIsNative: prototype === Array.prototype, prototypeIsProxy: __testIsProxy(prototype),",
  "      length: value.length, ownNames: Object.getOwnPropertyNames(value).sort(),",
  "      symbolCount: Object.getOwnPropertySymbols(value).length,",
  "      lengthDescriptor: {",
  "        value: descriptor.value, writable: descriptor.writable, enumerable: descriptor.enumerable,",
  "        configurable: descriptor.configurable, hasGetter: descriptor.get !== undefined, hasSetter: descriptor.set !== undefined",
  "      }",
  "    };",
  "  };",
  "  return {",
  "    snapshot: {",
  "      failed: state.snapshot.failed, fixedEnvelopeCount: state.snapshot.fixedEnvelopeCount, semanticNodeCount: state.snapshot.semanticNodeCount,",
  "      authorizationEntryCount: state.snapshot.authorizationEntryCount, wildcardPatternByteCount: state.snapshot.wildcardPatternByteCount,",
  "      wildcardInvocationCount: state.snapshot.wildcardInvocationCount, wildcardAlignedComparisonCount: state.snapshot.wildcardAlignedComparisonCount,",
  "      sshMatchComparisonCount: state.snapshot.sshMatchComparisonCount, sudoSelectorComparisonCount: state.snapshot.sudoSelectorComparisonCount,",
  "      sudoAliasVisitCount: state.snapshot.sudoAliasVisitCount, retainedPreimageBytes: state.snapshot.retainedPreimageBytes",
  "    },",
  "    ssh: inspectGraph(state.ssh), sudo: inspectGraph(state.sudo),",
  "    identity: {",
  "      snapshotSshGraph: state.snapshot.sshGraph === state.ssh, snapshotSudoGraph: state.snapshot.sudoGraph === state.sudo,",
  "      sshSnapshot: state.ssh.snapshot === state.snapshot, sudoSnapshot: state.sudo.snapshot === state.snapshot,",
  "      graphsDistinct: state.ssh !== state.sudo, cleanupDistinct: state.ssh.cleanupStack !== state.sudo.cleanupStack,",
  "      sshCleanup: inspectCleanup(state.ssh.cleanupStack), sudoCleanup: inspectCleanup(state.sudo.cleanupStack)",
  "    }",
  "  };",
  "}",
  "function __test_c2bFixedShape(state) {",
  "  const valueKind = (value) => {",
  "    if (Array.isArray(value)) return 'Array';",
  "    if (value instanceof Map) return 'Map';",
  "    if (value instanceof Set) return 'Set';",
  "    if (value instanceof WeakMap) return 'WeakMap';",
  "    if (value instanceof WeakSet) return 'WeakSet';",
  "    return value !== null && typeof value === 'object' ? 'Object' : typeof value;",
  "  };",
  "  const describe = (value) => ({",
  "    nullPrototype: Object.getPrototypeOf(value) === null,",
  "    symbolCount: Object.getOwnPropertySymbols(value).length,",
  "    fields: Object.getOwnPropertyNames(value).sort().map((name) => {",
  "      const descriptor = Object.getOwnPropertyDescriptor(value, name);",
  "      return { name, writable: descriptor.writable, enumerable: descriptor.enumerable, configurable: descriptor.configurable, valueKind: valueKind(descriptor.value) };",
  "    })",
  "  });",
  "  return { snapshot: describe(state.snapshot), ssh: describe(state.ssh), sudo: describe(state.sudo) };",
  "}",
  "function __test_c2bTerminalSourceOperation(graph) {",
  "  let calls = 0;",
  "  const operation = () => { calls += 1; throw new Error('operation must not run'); };",
  "  const operations = { lstat: operation, open: operation, fstat: operation, read: operation, close: operation };",
  "  let error = null;",
  "  try { consumeTrustedAuthorizationSource(graph, '/etc/ssh/sshd_config', operations, operation); }",
  "  catch (caught) { error = caught && caught.code ? caught.code : caught.name; }",
  "  return { error, calls };",
  "}",
  "export {",
  "  __test_c2bArities, __test_c2bCreateState, __test_c2bPolicy, __test_c2bProxyInstrumentation, __test_c2bReserveSource, __test_c2bReserveSourceWithSemanticTrace, __test_c2bTerminalSourceOperation, __test_c3Arities, __test_c4Arities,",
  "  __test_consumeTrustedAuthorizationSource, __test_createAuthorizationSourceGraph, __test_createAuthorizationSourceSnapshot,",
  "  __test_c2bFixedShape, __test_inspectAuthorizationBudgetState, __test_reserveAuthorizationSourceFile,",
  "  __test_deriveAuthorizationSshSyntax, __test_disposeAuthorizationSshSyntax, __test_deriveAuthorizationSshPolicy, __test_disposeAuthorizationSshPolicy, __test_createNativeAccountOperations, __test_matchAuthorizationWildcard, __test_missingC2BSymbols, __test_missingC3Symbols, __test_missingC4Symbols, __test_nextAuthorizationBudgetValue, __test_reserveAuthorizationFixedEnvelope, __test_reserveAuthorizationSemanticNode,",
  "  __test_reserveAuthorizationWorkUnit, __test_reservePreimageBytes, __test_scanAuthorizationWildcardPattern",
  "};"
].join("\n");
const source = readFileSync(runnerPath, "utf8") + "\n" + append + "\n";
const module = new vm.SourceTextModule(source, { context, identifier: runnerPath });
await module.link((specifier) => {
  const linked = modules.get(specifier);
  if (!linked) throw new Error("unexpected import:" + specifier);
  return linked;
});
for (const name of nativeObject.keys(allocationCounts)) allocationCounts[name] = 0;
allocationActive = true;
nativeBuffer.prototype.toString = c4InstrumentedBufferToString;
try { await module.evaluate(); }
finally {
  nativeBuffer.prototype.toString = nativeBufferToString;
  allocationActive = false;
}
const moduleAllocationCounts = { ...allocationCounts };
const api = module.namespace;

function errorCode(error) {
  return error && error.code ? error.code : error && error.name ? error.name : "unexpected";
}
function safe(operation) {
  try { return { ok: true, value: operation() }; }
  catch (error) { return { ok: false, error: errorCode(error) }; }
}
function fresh() { return api.__test_c2bCreateState(); }
function inspect(state) { return api.__test_inspectAuthorizationBudgetState(state); }
function withAllocations(operation) {
  for (const name of nativeObject.keys(allocationCounts)) allocationCounts[name] = 0;
  allocationActive = true;
  try {
    const value = operation();
    return { value, counts: { ...allocationCounts } };
  } finally {
    allocationActive = false;
  }
}
`;
}

const C2B_ZERO_ALLOCATIONS = Object.freeze({
  objectCall: 0,
  objectCreate: 0,
  array: 0,
  map: 0,
  set: 0,
  weakMap: 0,
  weakSet: 0,
  proxy: 0,
  bufferConstructor: 0,
  bufferAlloc: 0,
  bufferAllocUnsafe: 0,
  bufferConcat: 0,
  bufferFrom: 0,
  bufferOf: 0,
  createHash: 0,
  regexp: 0,
  textEncoder: 0,
  textEncode: 0,
  jsonStringify: 0,
  jsonParse: 0
});
const C2B_FRESH_ALLOCATIONS = Object.freeze({ ...C2B_ZERO_ALLOCATIONS, objectCreate: 3, array: 2 });
const C2B_NATIVE_EXPORTS = Object.freeze([
  "buildCanonicalRunnerBinding",
  "buildCanonicalSshIncludeClosure",
  "buildCanonicalSshMatchCoverage",
  "buildCanonicalSshTopology",
  "buildCanonicalSudoEffectivePolicy",
  "buildCanonicalSudoSourceClosure",
  "collectBoundAccountEvidence",
  "createHostOperations",
  "deriveWaitBudget",
  "executeJapanTuicAdditiveRepair",
  "loadRootOwnedBinding",
  "parseCanonicalAuthorizedKeyLine",
  "runJapanTuicAdditiveRepairCli",
  "validateArchiveEntries",
  "validateNativeLinuxOpenFlags",
  "validateRunnerBinding",
  "validateTrustedPathChain"
]);
const C2B_EXACT_BLOCK_BEGIN = "// C2B_EXACT_BLOCK_BEGIN";
const C2B_EXACT_BLOCK_END = "// C2B_EXACT_BLOCK_END";
const C2B_EXACT_BLOCK_SIZE = 14319;
const C2B_EXACT_BLOCK_SHA256 = "398b8af65d4fd80cf00f130b2b0044d9232a2d266d947e334b36346af148ed48";
const C2B_EXPECTED_ARITIES = Object.freeze({
  nextAuthorizationBudgetValue: 3,
  reserveAuthorizationSemanticNode: 2,
  reserveAuthorizationWorkUnit: 2,
  reservePreimageBytes: 2,
  scanAuthorizationWildcardPattern: 2,
  matchAuthorizationWildcard: 5
});
const C2B_EXPECTED_TOP_LEVEL_ADDITIONS = Object.freeze([
  "const AUTHORIZATION_PARSER_LOCAL_LIMITS",
  "const AUTHORIZATION_SHARED_SEMANTIC_LIMITS",
  "const AUTHORIZATION_SSH_SEMANTIC_LIMITS",
  "const AUTHORIZATION_SUDO_SEMANTIC_LIMITS",
  "const AUTHORIZATION_WORK_LIMITS",
  "function matchAuthorizationWildcard",
  "function nextAuthorizationBudgetValue",
  "function reserveAuthorizationSemanticNode",
  "function reserveAuthorizationWorkUnit",
  "function reservePreimageBytes",
  "function scanAuthorizationWildcardPattern"
]);
function c2bNumericState(state) {
  return structuredClone(state);
}

function c2bExpectedGraphFailure(state, family) {
  const expected = c2bNumericState(state);
  expected.snapshot.failed = true;
  expected[family].failed = true;
  return expected;
}

function c2bExpectedSnapshotFailure(state) {
  const expected = c2bNumericState(state);
  expected.snapshot.failed = true;
  return expected;
}

function c2bExpectedInitialGraph(kind) {
  return {
    kind,
    failed: false,
    fixedEnvelopeCount: 2,
    semanticNodeCount: 2,
    fileCount: 0,
    sourceFileCount: 0,
    totalBytes: 0,
    directoryNameCount: 0,
    depth: 0,
    nextOrdinal: 0,
    sshPhysicalDirectiveCount: 0,
    sshIncludePatternCount: 0,
    sshSelectedInsertionCount: 0,
    sshMatchBranchCount: 0,
    sshMatchConditionCount: 0,
    sshMatchPatternCount: 0,
    sshAssignmentCount: 0,
    sshAcceptEnvNameCount: 0,
    sudoStatementCount: 0,
    sudoIncludeCount: 0,
    sudoSelectedInsertionCount: 0,
    sudoAliasDefinitionCount: 0,
    sudoAliasMemberCount: 0,
    sudoDefaultsItemCount: 0,
    sudoUserSpecCount: 0,
    sudoUserHostRunasMemberCount: 0,
    sudoTagTransitionCount: 0,
    sudoCommandSpecCount: 0,
    sudoArgumentTokenCount: 0,
    sudoAliasEdgeCount: 0,
    sudoAliasMemoEntryCount: 0,
    globComparisonCount: 0,
    commandWorkCount: 0,
    aliasEdgeWorkCount: 0
  };
}

const C2B_EXPECTED_EMPTY_CLEANUP = Object.freeze({
  isArray: true,
  isProxy: false,
  prototypeIsNative: true,
  prototypeIsProxy: false,
  length: 0,
  ownNames: Object.freeze(["length"]),
  symbolCount: 0,
  lengthDescriptor: Object.freeze({
    value: 0,
    writable: true,
    enumerable: false,
    configurable: false,
    hasGetter: false,
    hasSetter: false
  })
});

function c2bHeaderIdentifierEnd(source, start) {
  if (!/[A-Za-z_$]/.test(source[start] || "")) return -1;
  let index = start + 1;
  while (/[A-Za-z0-9_$]/.test(source[index] || "")) index += 1;
  return index;
}

function c2bHeaderQuotedEnd(source, start, quote) {
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === "\\") {
      index += 2;
      continue;
    }
    if (source[index] === quote) return index + 1;
    if (source[index] === "\n" || source[index] === "\r") throw new Error("unterminated_header_string");
    index += 1;
  }
  throw new Error("unterminated_header_string");
}

function c2bHeaderLineCommentEnd(source, start) {
  let index = start + 2;
  while (index < source.length && source[index] !== "\n") index += 1;
  return index;
}

function c2bHeaderBlockCommentEnd(source, start) {
  const end = source.indexOf("*/", start + 2);
  if (end < 0) throw new Error("unterminated_header_comment");
  return end + 2;
}

function c2bHeaderRegexEnd(source, start) {
  let index = start + 1;
  let escaped = false;
  let inClass = false;
  while (index < source.length) {
    const byte = source[index];
    if (byte === "\n" || byte === "\r") throw new Error("unterminated_header_regex");
    if (escaped) escaped = false;
    else if (byte === "\\") escaped = true;
    else if (byte === "[") inClass = true;
    else if (byte === "]") inClass = false;
    else if (byte === "/" && !inClass) {
      index += 1;
      while (/[A-Za-z]/.test(source[index] || "")) index += 1;
      return index;
    }
    index += 1;
  }
  throw new Error("unterminated_header_regex");
}

function c2bHeaderRegexAllowedAfter(token) {
  return token === "" || /^(?:await|case|delete|do|else|in|instanceof|new|of|return|throw|typeof|void|yield)$/.test(token)
    || /^[([{,:;=!?&|+*%^~<>-]$/.test(token);
}

function c2bHeaderTemplateExpressionEnd(source, start) {
  let index = start;
  let depth = 1;
  let previousToken = "";
  while (index < source.length) {
    const byte = source[index];
    if (/\s/.test(byte)) {
      index += 1;
      continue;
    }
    if (byte === "'" || byte === '"') {
      index = c2bHeaderQuotedEnd(source, index, byte);
      previousToken = "literal";
      continue;
    }
    if (source.charCodeAt(index) === 96) {
      index = c2bHeaderTemplateEnd(source, index);
      previousToken = "literal";
      continue;
    }
    if (byte === "/" && source[index + 1] === "/") {
      index = c2bHeaderLineCommentEnd(source, index);
      continue;
    }
    if (byte === "/" && source[index + 1] === "*") {
      index = c2bHeaderBlockCommentEnd(source, index);
      continue;
    }
    if (byte === "/" && c2bHeaderRegexAllowedAfter(previousToken)) {
      index = c2bHeaderRegexEnd(source, index);
      previousToken = "literal";
      continue;
    }
    const identifierEnd = c2bHeaderIdentifierEnd(source, index);
    if (identifierEnd >= 0) {
      previousToken = source.slice(index, identifierEnd);
      index = identifierEnd;
      continue;
    }
    if (byte === "{") {
      depth += 1;
      previousToken = byte;
      index += 1;
      continue;
    }
    if (byte === "}") {
      depth -= 1;
      index += 1;
      if (depth === 0) return index;
      previousToken = byte;
      continue;
    }
    previousToken = byte;
    index += 1;
  }
  throw new Error("unterminated_header_template_expression");
}

function c2bHeaderTemplateEnd(source, start) {
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === "\\") {
      index += 2;
      continue;
    }
    if (source.charCodeAt(index) === 96) return index + 1;
    if (source[index] === "$" && source[index + 1] === "{") {
      index = c2bHeaderTemplateExpressionEnd(source, index + 2);
      continue;
    }
    index += 1;
  }
  throw new Error("unterminated_header_template");
}

function c2bHeaderMaskRange(masked, source, start, end) {
  for (let index = start; index < end; index += 1) {
    if (source[index] !== "\n" && source[index] !== "\r") masked[index] = " ";
  }
}

function c2bHeaderCodeMask(source) {
  const masked = [...source];
  let index = 0;
  let previousToken = "";
  while (index < source.length) {
    const byte = source[index];
    if (index === 0 && byte === "#" && source[index + 1] === "!") {
      const end = c2bHeaderLineCommentEnd(source, index);
      c2bHeaderMaskRange(masked, source, index, end);
      index = end;
      continue;
    }
    if (/\s/.test(byte)) {
      index += 1;
      continue;
    }
    let end = -1;
    if (byte === "'" || byte === '"') end = c2bHeaderQuotedEnd(source, index, byte);
    else if (source.charCodeAt(index) === 96) end = c2bHeaderTemplateEnd(source, index);
    else if (byte === "/" && source[index + 1] === "/") end = c2bHeaderLineCommentEnd(source, index);
    else if (byte === "/" && source[index + 1] === "*") end = c2bHeaderBlockCommentEnd(source, index);
    else if (byte === "/" && c2bHeaderRegexAllowedAfter(previousToken)) end = c2bHeaderRegexEnd(source, index);
    if (end >= 0) {
      c2bHeaderMaskRange(masked, source, index, end);
      if (!(byte === "/" && (source[index + 1] === "/" || source[index + 1] === "*"))) previousToken = "literal";
      index = end;
      continue;
    }
    const identifierEnd = c2bHeaderIdentifierEnd(source, index);
    if (identifierEnd >= 0) {
      previousToken = source.slice(index, identifierEnd);
      index = identifierEnd;
      continue;
    }
    previousToken = byte;
    index += 1;
  }
  return masked.join("");
}

function c2bParseTopLevelVariable(masked, start, prefix, kind) {
  const headers = [];
  let index = start;
  let brace = 0;
  let paren = 0;
  let bracket = 0;
  while (index < masked.length) {
    while (/\s/.test(masked[index] || "")) index += 1;
    const identifierEnd = c2bHeaderIdentifierEnd(masked, index);
    if (identifierEnd < 0) throw new Error("unsupported_top_level_binding");
    headers.push(prefix + kind + " " + masked.slice(index, identifierEnd));
    index = identifierEnd;
    while (index < masked.length) {
      const byte = masked[index];
      if (byte === "{") brace += 1;
      else if (byte === "}") {
        if (brace === 0) throw new Error("unbalanced_top_level_variable");
        brace -= 1;
      } else if (byte === "(") paren += 1;
      else if (byte === ")") {
        if (paren === 0) throw new Error("unbalanced_top_level_variable");
        paren -= 1;
      } else if (byte === "[") bracket += 1;
      else if (byte === "]") {
        if (bracket === 0) throw new Error("unbalanced_top_level_variable");
        bracket -= 1;
      } else if (brace === 0 && paren === 0 && bracket === 0 && byte === ",") {
        index += 1;
        break;
      } else if (brace === 0 && paren === 0 && bracket === 0 && byte === ";") {
        return { headers, next: index + 1 };
      }
      index += 1;
    }
  }
  throw new Error("unterminated_top_level_variable");
}

function c2bParseTopLevelDeclaration(masked, start) {
  const match = /^(?:(export)\s+)?(?:(default)\s+)?(?:(async)\s+)?(function|class|const|let|var)\b/.exec(masked.slice(start));
  if (!match) return null;
  const exported = match[1] ? "export " : "";
  const defaulted = match[2] ? "default " : "";
  const asynchronous = match[3] ? "async " : "";
  const kind = match[4];
  let index = start + match[0].length;
  const prefix = exported + defaulted + asynchronous;
  if (kind === "const" || kind === "let" || kind === "var") {
    if (defaulted || asynchronous) throw new Error("invalid_top_level_variable_modifier");
    const parsed = c2bParseTopLevelVariable(masked, index, prefix, kind);
    return { ...parsed, complete: true };
  }
  while (/\s/.test(masked[index] || "")) index += 1;
  let generator = "";
  if (kind === "function" && masked[index] === "*") {
    generator = "*";
    index += 1;
    while (/\s/.test(masked[index] || "")) index += 1;
  }
  const identifierEnd = c2bHeaderIdentifierEnd(masked, index);
  if (identifierEnd < 0) throw new Error("anonymous_top_level_declaration");
  return {
    headers: [prefix + kind + generator + " " + masked.slice(index, identifierEnd)],
    next: identifierEnd,
    complete: false
  };
}

function c2bTopLevelHeaders(source) {
  const masked = c2bHeaderCodeMask(source);
  const headers = [];
  let index = 0;
  let brace = 0;
  let paren = 0;
  let bracket = 0;
  let statementStart = true;
  while (index < masked.length) {
    const byte = masked[index];
    if (/\s/.test(byte)) {
      index += 1;
      continue;
    }
    if (brace === 0 && paren === 0 && bracket === 0 && statementStart) {
      const declaration = c2bParseTopLevelDeclaration(masked, index);
      if (declaration) {
        headers.push(...declaration.headers);
        index = declaration.next;
        statementStart = declaration.complete;
        continue;
      }
      statementStart = false;
    }
    if (byte === "{") brace += 1;
    else if (byte === "}") {
      if (brace === 0) throw new Error("unbalanced_top_level_brace");
      brace -= 1;
      if (brace === 0 && paren === 0 && bracket === 0) statementStart = true;
    } else if (byte === "(") paren += 1;
    else if (byte === ")") {
      if (paren === 0) throw new Error("unbalanced_top_level_paren");
      paren -= 1;
    } else if (byte === "[") bracket += 1;
    else if (byte === "]") {
      if (bracket === 0) throw new Error("unbalanced_top_level_bracket");
      bracket -= 1;
    } else if (byte === ";" && brace === 0 && paren === 0 && bracket === 0) {
      statementStart = true;
    }
    index += 1;
  }
  if (brace !== 0 || paren !== 0 || bracket !== 0) throw new Error("unbalanced_top_level_source");
  return headers.sort();
}

function c2bExactSourceBlock(source) {
  const normalized = source.replace(/\r\n/g, "\n");
  assert.doesNotMatch(normalized, /\r/);
  assert.equal(normalized.split(C2B_EXACT_BLOCK_BEGIN).length - 1, 1);
  assert.equal(normalized.split(C2B_EXACT_BLOCK_END).length - 1, 1);
  const beginNeedle = C2B_EXACT_BLOCK_BEGIN + "\n";
  const endNeedle = C2B_EXACT_BLOCK_END + "\n";
  const begin = normalized.indexOf(beginNeedle);
  const endStart = normalized.indexOf(endNeedle);
  assert.ok(begin >= 0 && endStart > begin);
  assert.ok(begin === 0 || normalized[begin - 1] === "\n");
  return {
    normalized,
    block: normalized.slice(begin, endStart + endNeedle.length)
  };
}
test("authorization semantic reserve kernel freezes exact ontology and atomic maxima", () => {
  const probe = c2bBudgetVmProbe("semantic");
  assert.equal(probe.error, null);
  assert.equal(Object.hasOwn(probe, "value"), true);
  assert.deepEqual(probe.value.missingSymbols, []);
  const value = probe.value;
  const declarationFixture = [
    "const alpha = 1, beta = { nested: [1, 2] };",
    "let gamma, delta = () => 1;",
    "var epsilon = /[,;]/, zeta = 'class FakeZeta {}';",
    "export const eta = 1, theta = 2;"
  ].join("\n");
  assert.deepEqual(c2bTopLevelHeaders(declarationFixture), [
    "const alpha", "const beta", "export const eta", "export const theta",
    "let delta", "let gamma", "var epsilon", "var zeta"
  ]);
  assert.deepEqual(c2bTopLevelHeaders([
    "function outer() { const hidden = 1; function nested() {} }",
    "class VisibleClass { method() { let hiddenToo = 2; } }",
    "const visible = 1;"
  ].join("\n")), ["class VisibleClass", "const visible", "function outer"]);
  const tick = String.fromCharCode(96);
  const maskedFixture = [
    "// const commentFake = 1;",
    "const single = 'function singleFake() {}';",
    "const double = \"class DoubleFake {}\";",
    "const regex = /const regexFake = 1;[{}]/;",
    "const template = " + tick + "const templateFake = 1; ${'class NestedFake {}'}" + tick + ";",
    "const visible = 1;"
  ].join("\n");
  assert.deepEqual(c2bTopLevelHeaders(maskedFixture), [
    "const double", "const regex", "const single", "const template", "const visible"
  ]);
  assert.throws(() => c2bTopLevelHeaders("const { hidden } = value;\n"), /unsupported_top_level_binding/);
  assert.throws(() => c2bTopLevelHeaders("export default function () {}\n"), /anonymous_top_level_declaration/);
  assert.throws(() => c2bTopLevelHeaders("const visible = 1; /*"), /unterminated_header_comment/);
  assert.deepEqual(Object.keys(runnerModule).sort(), C2B_NATIVE_EXPORTS);
  const runnerSource = readFileSync(fileURLToPath(new URL("../../scripts/japan-tuic-additive-repair-runner.mjs", import.meta.url)), "utf8");
  const sourceLock = c2bExactSourceBlock(runnerSource);
  assert.equal(Buffer.byteLength(sourceLock.block, "utf8"), C2B_EXACT_BLOCK_SIZE);
  assert.equal(createHash("sha256").update(sourceLock.block, "utf8").digest("hex"), C2B_EXACT_BLOCK_SHA256);
  assert.deepEqual(c2bTopLevelHeaders(sourceLock.block), C2B_EXPECTED_TOP_LEVEL_ADDITIONS);
  assert.deepEqual(value.arities, C2B_EXPECTED_ARITIES);
  assert.equal(value.proxyInstrumentation, true);
  assert.deepEqual(value.proxyInstrumentationAllocations, { ...C2B_ZERO_ALLOCATIONS, proxy: 2 });
  assert.equal(value.policy.frozen, true);
  assert.deepEqual(value.policy.shared, { fixedEnvelope: 32, sourceFile: 256, authorizationEntry: 1 });
  assert.deepEqual(value.policy.ssh, {
    sshPhysicalDirective: 131072,
    sshIncludePattern: 131072,
    sshSelectedInsertion: 65536,
    sshMatchBranch: 4096,
    sshMatchCondition: 131072,
    sshMatchPattern: 131072,
    sshAssignment: 131072,
    sshAcceptEnvName: 131072
  });
  assert.deepEqual(value.policy.sudo, {
    sudoStatement: 131072,
    sudoInclude: 131072,
    sudoSelectedInsertion: 65536,
    sudoAliasDefinition: 256,
    sudoAliasMember: 65536,
    sudoDefaultsItem: 131072,
    sudoUserSpec: 4096,
    sudoUserHostRunasMember: 131072,
    sudoTagTransition: 131072,
    sudoCommandSpec: 16384,
    sudoArgumentToken: 131072,
    sudoAliasEdge: 16384,
    sudoAliasMemoEntry: 256
  });
  assert.deepEqual(value.policy.local, {
    tokensPerPhysicalLine: 256,
    generalTokenBytes: 4096,
    sshIncludeOperands: 64,
    sshMatchBranches: 4096,
    sshMatchConditionsPerBranch: 9,
    sshMatchPatternsPerCondition: 64,
    sshMatchPatternBytes: 255,
    sudoAliasDefinitions: 256,
    sudoAliasMembersPerAlias: 256,
    sudoAliasExpansionNodes: 4096,
    sudoUserSpecs: 4096,
    sudoUserListMembersPerSpec: 256,
    sudoCommandSpecsPerSpec: 256,
    sudoDefaultsItemsPerStatement: 64,
    accountGroups: 256
  });
  assert.deepEqual(value.policy.work, {
    globComparisons: 65536,
    wildcardPatternBytes: 4194304,
    wildcardInvocations: 131072,
    wildcardAlignedComparisons: 16777216,
    sshMatchComparisons: 131072,
    sudoSelectorComparisons: 65536,
    sudoCommand: 16384,
    sudoAliasEdge: 16384,
    sudoAliasVisit: 32768,
    preimageBytes: 4194304,
    retainedPreimageBytes: 8388608
  });
  assert.deepEqual(value.initial.snapshot, {
    failed: false,
    fixedEnvelopeCount: 5,
    semanticNodeCount: 5,
    authorizationEntryCount: 0,
    wildcardPatternByteCount: 0,
    wildcardInvocationCount: 0,
    wildcardAlignedComparisonCount: 0,
    sshMatchComparisonCount: 0,
    sudoSelectorComparisonCount: 0,
    sudoAliasVisitCount: 0,
    retainedPreimageBytes: 0
  });
  assert.deepEqual(value.initial.ssh, c2bExpectedInitialGraph("ssh"));
  assert.deepEqual(value.initial.sudo, c2bExpectedInitialGraph("sudo"));
  assert.deepEqual(value.initial.identity, {
    snapshotSshGraph: true,
    snapshotSudoGraph: true,
    sshSnapshot: true,
    sudoSnapshot: true,
    graphsDistinct: true,
    cleanupDistinct: true,
    sshCleanup: C2B_EXPECTED_EMPTY_CLEANUP,
    sudoCleanup: C2B_EXPECTED_EMPTY_CLEANUP
  });
  assert.deepEqual(value.initialCreationAllocations, C2B_FRESH_ALLOCATIONS);
  const snapshotKeys = [
    "authorizationEntryCount", "failed", "fixedEnvelopeCount", "retainedPreimageBytes", "semanticNodeCount",
    "sshGraph", "sshMatchComparisonCount", "sudoAliasVisitCount", "sudoGraph", "sudoSelectorComparisonCount",
    "wildcardAlignedComparisonCount", "wildcardInvocationCount", "wildcardPatternByteCount"
  ].sort();
  const graphKeys = [
    "aliasEdgeWorkCount", "cleanupStack", "commandWorkCount", "depth", "directoryNameCount", "failed", "fileCount",
    "fixedEnvelopeCount", "globComparisonCount", "kind", "nextOrdinal", "semanticNodeCount", "snapshot", "sourceFileCount",
    "sshAcceptEnvNameCount", "sshAssignmentCount", "sshIncludePatternCount", "sshMatchBranchCount", "sshMatchConditionCount",
    "sshMatchPatternCount", "sshPhysicalDirectiveCount", "sshSelectedInsertionCount", "sudoAliasDefinitionCount",
    "sudoAliasEdgeCount", "sudoAliasMemberCount", "sudoAliasMemoEntryCount", "sudoArgumentTokenCount", "sudoCommandSpecCount",
    "sudoDefaultsItemCount", "sudoIncludeCount", "sudoSelectedInsertionCount", "sudoStatementCount", "sudoTagTransitionCount",
    "sudoUserHostRunasMemberCount", "sudoUserSpecCount", "totalBytes"
  ].sort();
  const expectedFields = (keys, readOnly, kinds) => keys.map((name) => ({
    name,
    writable: !readOnly.has(name),
    enumerable: true,
    configurable: false,
    valueKind: kinds[name] || "number"
  }));
  assert.deepEqual(value.fixedShape.snapshot, {
    nullPrototype: true,
    symbolCount: 0,
    fields: expectedFields(snapshotKeys, new Set(), { failed: "boolean", sshGraph: "Object", sudoGraph: "Object" })
  });
  for (const family of ["ssh", "sudo"]) {
    assert.deepEqual(value.fixedShape[family], {
      nullPrototype: true,
      symbolCount: 0,
      fields: expectedFields(graphKeys, new Set(["fixedEnvelopeCount", "kind", "snapshot"]), {
        cleanupStack: "Array", failed: "boolean", kind: "string", snapshot: "Object"
      })
    }, family);
  }
  assert.equal(value.sourceOnly.before.snapshot.semanticNodeCount, 5);
  assert.equal(value.sourceOnly.after.snapshot.semanticNodeCount, 6);
  assert.equal(value.sourceOnly.after.ssh.semanticNodeCount, 3);
  assert.equal(value.sourceOnly.after.ssh.sourceFileCount, 1);
  assert.equal(value.sourceOnly.after.ssh.fileCount, 1);
  assert.equal(value.sourceOnly.after.sudo.semanticNodeCount, 2);
  assert.deepEqual(value.sourceOnly.trace, { calls: 1, kind: "sourceFile", sameGraph: true });
  const expectedSourceOnly = c2bNumericState(value.sourceOnly.before);
  expectedSourceOnly.snapshot.semanticNodeCount += 1;
  expectedSourceOnly.ssh.semanticNodeCount += 1;
  expectedSourceOnly.ssh.fileCount += 1;
  expectedSourceOnly.ssh.sourceFileCount += 1;
  assert.deepEqual(c2bNumericState(value.sourceOnly.after), expectedSourceOnly);
  assert.deepEqual(value.sourceOnly.allocations, C2B_ZERO_ALLOCATIONS);
  for (const route of value.sourceRoutes) {
    const expectedRoute = c2bNumericState(route.before);
    expectedRoute.snapshot.semanticNodeCount += 1;
    expectedRoute[route.family].semanticNodeCount += 1;
    expectedRoute[route.family].fileCount += 1;
    expectedRoute[route.family].sourceFileCount += 1;
    assert.deepEqual(route.trace, { calls: 1, kind: "sourceFile", sameGraph: true }, route.family);
    assert.deepEqual(c2bNumericState(route.after), expectedRoute, route.family);
    assert.deepEqual(route.allocations, C2B_ZERO_ALLOCATIONS, route.family);
  }
  const futureKindNames = [...Object.keys(value.policy.ssh), ...Object.keys(value.policy.sudo)];
  assert.deepEqual(value.futureKinds.map(({ kind }) => kind), futureKindNames);
  for (const witness of value.futureKinds) {
    const graph = witness.after[witness.family];
    const other = witness.after[witness.family === "ssh" ? "sudo" : "ssh"];
    assert.equal(witness.before.snapshot.semanticNodeCount, 5, witness.kind);
    assert.equal(witness.after.snapshot.semanticNodeCount, 6, witness.kind);
    assert.equal(graph.semanticNodeCount, 3, witness.kind);
    assert.equal(graph[`${witness.kind}Count`], 1, witness.kind);
    assert.equal(other.semanticNodeCount, 2, witness.kind);
    assert.equal(graph.commandWorkCount, witness.kind === "sudoCommandSpec" ? 1 : 0, witness.kind);
    assert.equal(graph.aliasEdgeWorkCount, witness.kind === "sudoAliasEdge" ? 1 : 0, witness.kind);
    const expectedAfter = c2bNumericState(witness.before);
    expectedAfter.snapshot.semanticNodeCount += 1;
    expectedAfter[witness.family].semanticNodeCount += 1;
    expectedAfter[witness.family][`${witness.kind}Count`] += 1;
    if (witness.kind === "sudoCommandSpec") expectedAfter.sudo.commandWorkCount += 1;
    if (witness.kind === "sudoAliasEdge") expectedAfter.sudo.aliasEdgeWorkCount += 1;
    assert.deepEqual(c2bNumericState(witness.after), expectedAfter, witness.kind);
    assert.deepEqual(witness.allocations, C2B_ZERO_ALLOCATIONS, witness.kind);
  }
  for (const boundary of value.boundaries) {
    const expectedAtMaximum = c2bNumericState(value.initial);
    expectedAtMaximum.snapshot.semanticNodeCount += boundary.maximum;
    expectedAtMaximum[boundary.family].semanticNodeCount += boundary.maximum;
    expectedAtMaximum[boundary.family][boundary.counter] = boundary.maximum;
    if (boundary.kind === "sudoCommandSpec") expectedAtMaximum.sudo.commandWorkCount = boundary.maximum;
    if (boundary.kind === "sudoAliasEdge") expectedAtMaximum.sudo.aliasEdgeWorkCount = boundary.maximum;
    assert.deepEqual(c2bNumericState(boundary.atMaximum), expectedAtMaximum, boundary.kind);
    assert.equal(boundary.countAtMaximum, boundary.maximum, boundary.kind);
    assert.equal(boundary.countAfter, boundary.maximum, boundary.kind);
    assert.equal(boundary.graphSemanticAfter, boundary.graphSemanticAtMaximum, boundary.kind);
    assert.equal(boundary.snapshotSemanticAfter, boundary.snapshotSemanticAtMaximum, boundary.kind);
    assert.deepEqual(boundary.rejected, { ok: false, error: "restricted_identity_rejected" }, boundary.kind);
    assert.equal(boundary.terminal, true, boundary.kind);
    assert.deepEqual(c2bNumericState(boundary.after), c2bExpectedGraphFailure(boundary.atMaximum, boundary.family), boundary.kind);
    assert.deepEqual(boundary.allocations, C2B_ZERO_ALLOCATIONS, boundary.kind);
    assert.deepEqual(boundary.rejectionAllocations, C2B_ZERO_ALLOCATIONS, boundary.kind);
  }
  for (const local of value.localMaxima) {
    assert.equal(local.accepted, local.maximum, local.name);
    assert.deepEqual(local.rejected, { ok: false, error: "restricted_identity_rejected" }, local.name);
    assert.deepEqual(local.acceptedAllocations, C2B_ZERO_ALLOCATIONS, local.name);
    assert.deepEqual(local.rejectedAllocations, C2B_ZERO_ALLOCATIONS, local.name);
  }
  assert.ok(value.invalidNext.every(({ outcome }) => !outcome.ok && outcome.error === "restricted_identity_rejected"));
  for (const invalid of value.invalidNext) assert.deepEqual(invalid.allocations, C2B_ZERO_ALLOCATIONS, invalid.name);
  for (const rejected of value.rejected) {
    assert.deepEqual(rejected.outcome, { ok: false, error: "restricted_identity_rejected" }, rejected.kind);
    assert.deepEqual(c2bNumericState(rejected.after), c2bExpectedGraphFailure(rejected.before, rejected.family), rejected.kind);
    assert.equal(rejected.after.snapshot.failed, true, rejected.kind);
    assert.equal(rejected.after[rejected.family].failed, true, rejected.kind);
    assert.deepEqual(rejected.allocations, C2B_ZERO_ALLOCATIONS, rejected.kind);
  }
  assert.deepEqual(value.unbranded.outcome, { ok: false, error: "restricted_identity_rejected" });
  assert.deepEqual(c2bNumericState(value.unbranded.after), c2bNumericState(value.unbranded.before));
  assert.deepEqual(value.unbranded.rawAfter, value.unbranded.rawBefore);
  assert.deepEqual(value.unbranded.allocations, C2B_ZERO_ALLOCATIONS);
  for (const coupling of [value.commandCoupling, value.edgeCoupling]) {
    assert.deepEqual(coupling.outcome, { ok: false, error: "restricted_identity_rejected" });
    assert.deepEqual(c2bNumericState(coupling.after), c2bExpectedGraphFailure(coupling.before, "sudo"));
    assert.equal(coupling.after.snapshot.failed, true);
    assert.equal(coupling.after.sudo.failed, true);
    assert.deepEqual(coupling.preparationAllocations, C2B_ZERO_ALLOCATIONS);
    assert.deepEqual(coupling.rejectionAllocations, C2B_ZERO_ALLOCATIONS);
  }
  assert.equal(value.commandCoupling.before.sudo.commandWorkCount, 16384);
  assert.equal(value.commandCoupling.before.sudo.sudoCommandSpecCount, 0);
  assert.equal(value.edgeCoupling.before.sudo.aliasEdgeWorkCount, 16384);
  assert.equal(value.edgeCoupling.before.sudo.sudoAliasEdgeCount, 0);
});

test("one snapshot rejects before semantic node 131073 across both graphs", () => {
  const probe = c2bBudgetVmProbe("aggregate");
  assert.equal(probe.error, null);
  assert.equal(Object.hasOwn(probe, "value"), true);
  assert.deepEqual(probe.value.missingSymbols, []);
  const value = probe.value;
  assert.equal(value.initial.snapshot.semanticNodeCount, 5);
  assert.equal(value.atMaximum.snapshot.semanticNodeCount, 131072);
  assert.equal(value.atMaximum.ssh.semanticNodeCount, 65536);
  assert.equal(value.atMaximum.ssh.sshPhysicalDirectiveCount, 65534);
  assert.equal(value.atMaximum.sudo.semanticNodeCount, 65535);
  assert.equal(value.atMaximum.sudo.sudoStatementCount, 65533);
  const expectedAggregateMaximum = c2bNumericState(value.initial);
  expectedAggregateMaximum.snapshot.semanticNodeCount = 131072;
  expectedAggregateMaximum.ssh.semanticNodeCount = 65536;
  expectedAggregateMaximum.ssh.sshPhysicalDirectiveCount = 65534;
  expectedAggregateMaximum.sudo.semanticNodeCount = 65535;
  expectedAggregateMaximum.sudo.sudoStatementCount = 65533;
  assert.deepEqual(c2bNumericState(value.atMaximum), expectedAggregateMaximum);
  assert.deepEqual(value.rejected, { ok: false, error: "restricted_identity_rejected" });
  assert.deepEqual(value.rejectionAllocations, C2B_ZERO_ALLOCATIONS);
  assert.deepEqual(c2bNumericState(value.after), c2bExpectedGraphFailure(value.atMaximum, "ssh"));
  assert.equal(value.after.snapshot.failed, true);
  assert.equal(value.after.ssh.failed, true);
  for (const outcome of [value.terminalSemantic, value.terminalWork, value.terminalPreimage, value.terminalC2A]) {
    assert.deepEqual(outcome, { ok: false, error: "restricted_identity_rejected" });
  }
  for (const allocations of [
    value.terminalSemanticAllocations,
    value.terminalWorkAllocations,
    value.terminalPreimageAllocations,
    value.terminalC2AAllocations,
    value.terminalSourceAllocations
  ]) assert.deepEqual(allocations, C2B_ZERO_ALLOCATIONS);
  assert.deepEqual(value.terminalSource, { error: "restricted_identity_rejected", calls: 0 });
  const expectedTerminalFinal = c2bNumericState(value.after);
  expectedTerminalFinal.sudo.failed = true;
  assert.deepEqual(c2bNumericState(value.terminalFinal), expectedTerminalFinal);
  assert.deepEqual(c2bNumericState(value.reset), c2bNumericState(value.initial));
  assert.equal(value.reset.snapshot.semanticNodeCount, 5);
  assert.equal(value.reset.snapshot.failed, false);
  assert.equal(value.reset.ssh.sshPhysicalDirectiveCount, 0);
  assert.equal(value.reset.sudo.sudoStatementCount, 0);
  assert.equal(value.graphDefense.accepted, 131072);
  assert.deepEqual(value.graphDefense.rejected, { ok: false, error: "restricted_identity_rejected" });
  assert.deepEqual(value.graphDefense.acceptedAllocations, C2B_ZERO_ALLOCATIONS);
  assert.deepEqual(value.graphDefense.rejectedAllocations, C2B_ZERO_ALLOCATIONS);
  assert.deepEqual(value.allocations, C2B_ZERO_ALLOCATIONS);
});

test("authorization work and preimage reserves are atomic terminal and nondecrementing", () => {
  const probe = c2bBudgetVmProbe("work");
  assert.equal(probe.error, null);
  assert.equal(Object.hasOwn(probe, "value"), true);
  assert.deepEqual(probe.value.missingSymbols, []);
  const value = probe.value;
  assert.deepEqual(value.policy, {
    globComparisons: 65536,
    wildcardPatternBytes: 4194304,
    wildcardInvocations: 131072,
    wildcardAlignedComparisons: 16777216,
    sshMatchComparisons: 131072,
    sudoSelectorComparisons: 65536,
    sudoCommand: 16384,
    sudoAliasEdge: 16384,
    sudoAliasVisit: 32768,
    preimageBytes: 4194304,
    retainedPreimageBytes: 8388608
  });
  for (const boundary of value.boundaries) {
    const expectedAtMaximum = c2bNumericState(boundary.initial);
    if (boundary.kind === "glob") {
      expectedAtMaximum[boundary.family].globComparisonCount = boundary.maximum;
      expectedAtMaximum.snapshot.wildcardInvocationCount = boundary.maximum;
    } else if (boundary.kind === "sshMatch") {
      expectedAtMaximum.snapshot.sshMatchComparisonCount = boundary.maximum;
      expectedAtMaximum.snapshot.wildcardInvocationCount = boundary.maximum;
    } else if (boundary.kind === "sudoSelector") {
      expectedAtMaximum.snapshot.sudoSelectorComparisonCount = boundary.maximum;
      expectedAtMaximum.snapshot.wildcardInvocationCount = boundary.maximum;
    } else if (boundary.kind === "sudoCommand") {
      expectedAtMaximum.sudo.commandWorkCount = boundary.maximum;
    } else if (boundary.kind === "sudoAliasEdge") {
      expectedAtMaximum.sudo.aliasEdgeWorkCount = boundary.maximum;
    } else if (boundary.kind === "sudoAliasVisit") {
      expectedAtMaximum.snapshot.sudoAliasVisitCount = boundary.maximum;
    } else {
      assert.fail(`unexpected work kind: ${boundary.kind}`);
    }
    assert.deepEqual(c2bNumericState(boundary.atMaximum), expectedAtMaximum, boundary.kind);
    assert.deepEqual(boundary.rejected, { ok: false, error: "restricted_identity_rejected" }, boundary.kind);
    assert.deepEqual(c2bNumericState(boundary.after), c2bExpectedGraphFailure(boundary.atMaximum, boundary.family), boundary.kind);
    assert.equal(boundary.after.snapshot.failed, true, boundary.kind);
    assert.equal(boundary.after[boundary.family].failed, true, boundary.kind);
    assert.equal(boundary.atMaximum.snapshot.semanticNodeCount, 5, boundary.kind);
    assert.deepEqual(boundary.allocations, C2B_ZERO_ALLOCATIONS, boundary.kind);
    assert.deepEqual(boundary.rejectionAllocations, C2B_ZERO_ALLOCATIONS, boundary.kind);
  }
  assert.equal(value.invocationAtomic.before.snapshot.wildcardInvocationCount, 131072);
  assert.equal(value.invocationAtomic.before.snapshot.sshMatchComparisonCount, 0);
  const expectedInvocationAtomic = c2bNumericState(value.initial);
  expectedInvocationAtomic.ssh.globComparisonCount = 65536;
  expectedInvocationAtomic.snapshot.sudoSelectorComparisonCount = 65536;
  expectedInvocationAtomic.snapshot.wildcardInvocationCount = 131072;
  assert.deepEqual(c2bNumericState(value.invocationAtomic.before), expectedInvocationAtomic);
  assert.deepEqual(value.invocationAtomic.rejected, { ok: false, error: "restricted_identity_rejected" });
  assert.deepEqual(c2bNumericState(value.invocationAtomic.after), c2bExpectedGraphFailure(value.invocationAtomic.before, "ssh"));
  assert.equal(value.invocationAtomic.after.snapshot.failed, true);
  assert.equal(value.invocationAtomic.after.ssh.failed, true);
  assert.deepEqual(value.invocationAtomic.rejectionAllocations, C2B_ZERO_ALLOCATIONS);
  assert.deepEqual(value.preimage.returnTypes, ["undefined", "undefined"]);
  const expectedPreimageMaximum = c2bNumericState(value.preimage.initial);
  expectedPreimageMaximum.snapshot.retainedPreimageBytes = 8388608;
  assert.deepEqual(c2bNumericState(value.preimage.atMaximum), expectedPreimageMaximum);
  assert.equal(value.preimage.before.snapshot.retainedPreimageBytes, 8388608);
  assert.deepEqual(value.preimage.rejected, { ok: false, error: "restricted_identity_rejected" });
  assert.equal(value.preimage.after.snapshot.retainedPreimageBytes, 8388608);
  assert.deepEqual(c2bNumericState(value.preimage.after), c2bExpectedSnapshotFailure(expectedPreimageMaximum));
  assert.equal(value.preimage.after.snapshot.failed, true);
  assert.deepEqual(value.preimage.allocations, C2B_ZERO_ALLOCATIONS);
  assert.deepEqual(value.preimage.rejectionAllocations, C2B_ZERO_ALLOCATIONS);
  for (const witness of value.invalidPreimage) {
    assert.deepEqual(witness.outcome, { ok: false, error: "restricted_identity_rejected" }, witness.name);
    assert.deepEqual(c2bNumericState(witness.after), c2bExpectedSnapshotFailure(witness.before), witness.name);
    assert.equal(witness.after.snapshot.retainedPreimageBytes, 0, witness.name);
    assert.equal(witness.after.snapshot.failed, true, witness.name);
    assert.deepEqual(witness.allocations, C2B_ZERO_ALLOCATIONS, witness.name);
  }
  assert.deepEqual(value.unbranded.outcome, { ok: false, error: "restricted_identity_rejected" });
  assert.deepEqual(c2bNumericState(value.unbranded.after), c2bNumericState(value.unbranded.before));
  assert.deepEqual(value.unbranded.rawAfter, value.unbranded.rawBefore);
  assert.deepEqual(value.unbranded.allocations, C2B_ZERO_ALLOCATIONS);
  assert.deepEqual(value.failedSnapshot.first, { ok: false, error: "restricted_identity_rejected" });
  assert.deepEqual(value.failedSnapshot.second, { ok: false, error: "restricted_identity_rejected" });
  assert.deepEqual(c2bNumericState(value.failedSnapshot.after), c2bNumericState(value.failedSnapshot.before));
  assert.deepEqual(value.failedSnapshot.firstAllocations, C2B_ZERO_ALLOCATIONS);
  assert.deepEqual(value.failedSnapshot.secondAllocations, C2B_ZERO_ALLOCATIONS);
  for (const witness of value.rejectedWork) {
    assert.deepEqual(witness.outcome, { ok: false, error: "restricted_identity_rejected" }, witness.kind);
    assert.deepEqual(c2bNumericState(witness.after), c2bExpectedGraphFailure(witness.before, witness.family), witness.kind);
    assert.equal(witness.after.snapshot.failed, true, witness.kind);
    assert.equal(witness.after[witness.family].failed, true, witness.kind);
    assert.deepEqual(witness.allocations, C2B_ZERO_ALLOCATIONS, witness.kind);
  }
  assert.deepEqual(value.unbrandedWork.outcome, { ok: false, error: "restricted_identity_rejected" });
  assert.deepEqual(c2bNumericState(value.unbrandedWork.after), c2bNumericState(value.unbrandedWork.before));
  assert.deepEqual(value.unbrandedWork.rawAfter, value.unbrandedWork.rawBefore);
  assert.deepEqual(value.unbrandedWork.allocations, C2B_ZERO_ALLOCATIONS);
});

test("wildcard permits zero or one star and scans prefix suffix bytes once", () => {
  const probe = c2bBudgetVmProbe("wildcard");
  assert.equal(probe.error, null);
  assert.equal(Object.hasOwn(probe, "value"), true);
  assert.deepEqual(probe.value.missingSymbols, []);
  const value = probe.value;
  assert.deepEqual(value.cases.map(({ name, result, starIndex, alignedDelta }) => [name, result, starIndex, alignedDelta]), [
    ["no-star-equal", true, -1, 3],
    ["literal-mismatch", false, -1, 3],
    ["unequal-length", false, -1, 0],
    ["question", true, -1, 3],
    ["star-start", true, 0, 1],
    ["star-end", true, 1, 1],
    ["star-middle-empty", true, 1, 2],
    ["star-middle-nonempty", true, 1, 2],
    ["star-too-short", false, 2, 0],
    ["sudo-glob", true, 1, 2]
  ]);
  for (const witness of value.cases) {
    const expectedAfter = c2bNumericState(witness.before);
    expectedAfter.snapshot.wildcardPatternByteCount += witness.patternLength;
    expectedAfter.snapshot.wildcardInvocationCount += 1;
    expectedAfter.snapshot.wildcardAlignedComparisonCount += witness.alignedDelta;
    if (witness.domain === "sshMatch") expectedAfter.snapshot.sshMatchComparisonCount += 1;
    else if (witness.domain === "sudoSelector") expectedAfter.snapshot.sudoSelectorComparisonCount += 1;
    else expectedAfter[witness.family].globComparisonCount += 1;
    assert.deepEqual(c2bNumericState(witness.after), expectedAfter, witness.name);
    assert.equal(witness.patternDelta, witness.patternLength, witness.name);
    assert.equal(witness.invocationDelta, 1, witness.name);
    assert.deepEqual(witness.scanAllocations, C2B_ZERO_ALLOCATIONS, witness.name);
    assert.deepEqual(witness.matchAllocations, C2B_ZERO_ALLOCATIONS, witness.name);
  }
  assert.deepEqual(value.cases[0].scanTrace, [["pattern", 0], ["pattern", 1], ["pattern", 2]]);
  assert.deepEqual(value.cases[0].matchTrace, [
    ["pattern", 0], ["target", 0], ["pattern", 1], ["target", 1], ["pattern", 2], ["target", 2]
  ]);
  assert.deepEqual(value.cases[1].scanTrace, [["pattern", 0], ["pattern", 1], ["pattern", 2]]);
  assert.deepEqual(value.cases[1].matchTrace, [
    ["pattern", 0], ["target", 0], ["pattern", 1], ["target", 1], ["pattern", 2], ["target", 2]
  ]);
  assert.deepEqual(value.cases[2].scanTrace, [["pattern", 0], ["pattern", 1], ["pattern", 2]]);
  assert.deepEqual(value.cases[2].matchTrace, []);
  assert.deepEqual(value.cases.at(-1).scanTrace, [["pattern", 0], ["pattern", 1], ["pattern", 2]]);
  assert.deepEqual(value.cases.at(-1).matchTrace, [
    ["pattern", 0], ["target", 0], ["pattern", 2], ["target", 4]
  ]);
  assert.deepEqual(value.longTrace.scanTrace, [
    ["pattern", 0], ["pattern", 1], ["pattern", 2], ["pattern", 3],
    ["pattern", 4], ["pattern", 5], ["pattern", 6]
  ]);
  assert.equal(value.longTrace.result, true);
  const expectedLong = c2bNumericState(value.longTrace.before);
  expectedLong.snapshot.wildcardPatternByteCount += 7;
  expectedLong.snapshot.wildcardInvocationCount += 1;
  expectedLong.snapshot.wildcardAlignedComparisonCount += 6;
  expectedLong.ssh.globComparisonCount += 1;
  assert.deepEqual(c2bNumericState(value.longTrace.after), expectedLong);
  assert.equal(value.longTrace.patternDelta, 7);
  assert.equal(value.longTrace.invocationDelta, 1);
  assert.equal(value.longTrace.alignedDelta, 6);
  assert.deepEqual(value.longTrace.scanAllocations, C2B_ZERO_ALLOCATIONS);
  assert.deepEqual(value.longTrace.matchAllocations, C2B_ZERO_ALLOCATIONS);
  assert.deepEqual(value.longTrace.matchTrace, [
    ["pattern", 0], ["target", 0], ["pattern", 1], ["target", 1], ["pattern", 2], ["target", 2],
    ["pattern", 6], ["target", 9], ["pattern", 5], ["target", 8], ["pattern", 4], ["target", 7]
  ]);
  assert.equal(new Set(value.longTrace.matchTrace.filter(([role]) => role === "target").map(([, index]) => index)).size, 6);
  assert.equal(value.earlyPrefix.result, false);
  const expectedEarlyPrefix = c2bNumericState(value.earlyPrefix.before);
  expectedEarlyPrefix.snapshot.wildcardPatternByteCount += 5;
  expectedEarlyPrefix.snapshot.wildcardInvocationCount += 1;
  expectedEarlyPrefix.snapshot.wildcardAlignedComparisonCount += 2;
  expectedEarlyPrefix.ssh.globComparisonCount += 1;
  assert.deepEqual(c2bNumericState(value.earlyPrefix.after), expectedEarlyPrefix);
  assert.equal(value.earlyPrefix.patternDelta, 5);
  assert.equal(value.earlyPrefix.invocationDelta, 1);
  assert.equal(value.earlyPrefix.alignedDelta, 2);
  assert.deepEqual(value.earlyPrefix.scanAllocations, C2B_ZERO_ALLOCATIONS);
  assert.deepEqual(value.earlyPrefix.matchAllocations, C2B_ZERO_ALLOCATIONS);
  assert.deepEqual(value.earlyPrefix.trace, [["pattern", 0], ["target", 0], ["pattern", 1], ["target", 1]]);
  assert.equal(value.earlySuffix.result, false);
  const expectedEarlySuffix = c2bNumericState(value.earlySuffix.before);
  expectedEarlySuffix.snapshot.wildcardPatternByteCount += 5;
  expectedEarlySuffix.snapshot.wildcardInvocationCount += 1;
  expectedEarlySuffix.snapshot.wildcardAlignedComparisonCount += 3;
  expectedEarlySuffix.ssh.globComparisonCount += 1;
  assert.deepEqual(c2bNumericState(value.earlySuffix.after), expectedEarlySuffix);
  assert.equal(value.earlySuffix.patternDelta, 5);
  assert.equal(value.earlySuffix.invocationDelta, 1);
  assert.equal(value.earlySuffix.alignedDelta, 3);
  assert.deepEqual(value.earlySuffix.scanAllocations, C2B_ZERO_ALLOCATIONS);
  assert.deepEqual(value.earlySuffix.matchAllocations, C2B_ZERO_ALLOCATIONS);
  assert.deepEqual(value.earlySuffix.trace, [
    ["pattern", 0], ["target", 0], ["pattern", 1], ["target", 1], ["pattern", 4], ["target", 6]
  ]);
  assert.deepEqual(value.secondStars[0].outcome, { ok: false, error: "restricted_identity_rejected" });
  assert.deepEqual(value.secondStars[0].trace, [["pattern", 0], ["pattern", 1], ["pattern", 2], ["pattern", 3]]);
  assert.deepEqual(value.secondStars[1].outcome, { ok: false, error: "restricted_identity_rejected" });
  assert.deepEqual(value.secondStars[1].trace, [["pattern", 0], ["pattern", 1]]);
  for (const witness of value.secondStars) {
    const expectedAfter = c2bExpectedGraphFailure(witness.before, "ssh");
    expectedAfter.snapshot.wildcardPatternByteCount += witness.trace.length;
    assert.deepEqual(c2bNumericState(witness.after), expectedAfter);
    assert.equal(witness.after.snapshot.failed, true);
    assert.deepEqual(witness.allocations, C2B_ZERO_ALLOCATIONS);
  }
  assert.equal(value.patternBoundary.atMaximum.snapshot.wildcardPatternByteCount, 4194304);
  const expectedPatternMaximum = c2bNumericState(value.patternBoundary.initial);
  expectedPatternMaximum.snapshot.wildcardPatternByteCount = 4194304;
  assert.deepEqual(c2bNumericState(value.patternBoundary.atMaximum), expectedPatternMaximum);
  assert.deepEqual(value.patternBoundary.rejected, { ok: false, error: "restricted_identity_rejected" });
  assert.equal(value.patternBoundary.after.snapshot.wildcardPatternByteCount, 4194304);
  assert.deepEqual(c2bNumericState(value.patternBoundary.after), c2bExpectedGraphFailure(expectedPatternMaximum, "ssh"));
  assert.equal(value.patternBoundary.after.snapshot.failed, true);
  assert.deepEqual(value.patternBoundary.trace, []);
  assert.deepEqual(value.patternBoundary.allocations, C2B_ZERO_ALLOCATIONS);
  assert.deepEqual(value.patternBoundary.rejectionAllocations, C2B_ZERO_ALLOCATIONS);
  assert.equal(value.alignedBoundary.atMaximum.snapshot.wildcardAlignedComparisonCount, 16777216);
  const expectedAlignedMaximum = c2bNumericState(value.alignedBoundary.initial);
  expectedAlignedMaximum.snapshot.wildcardPatternByteCount = 4096;
  expectedAlignedMaximum.snapshot.wildcardInvocationCount = 4096;
  expectedAlignedMaximum.snapshot.wildcardAlignedComparisonCount = 16777216;
  expectedAlignedMaximum.ssh.globComparisonCount = 4096;
  assert.deepEqual(c2bNumericState(value.alignedBoundary.atMaximum), expectedAlignedMaximum);
  assert.deepEqual(value.alignedBoundary.rejected, { ok: false, error: "restricted_identity_rejected" });
  assert.equal(value.alignedBoundary.after.snapshot.wildcardAlignedComparisonCount, 16777216);
  assert.equal(value.alignedBoundary.after.snapshot.wildcardInvocationCount, 4097);
  assert.equal(value.alignedBoundary.after.ssh.globComparisonCount, 4097);
  const expectedAlignedAfter = c2bNumericState(expectedAlignedMaximum);
  expectedAlignedAfter.snapshot.wildcardInvocationCount += 1;
  expectedAlignedAfter.ssh.globComparisonCount += 1;
  assert.deepEqual(c2bNumericState(value.alignedBoundary.after), c2bExpectedGraphFailure(expectedAlignedAfter, "ssh"));
  assert.equal(value.alignedBoundary.after.snapshot.failed, true);
  assert.deepEqual(value.alignedBoundary.trace, []);
  assert.deepEqual(value.alignedBoundary.scanAllocations, C2B_ZERO_ALLOCATIONS);
  assert.deepEqual(value.alignedBoundary.allocations, C2B_ZERO_ALLOCATIONS);
  assert.deepEqual(value.alignedBoundary.rejectionAllocations, C2B_ZERO_ALLOCATIONS);
  for (const boundary of value.domains) {
    const expectedAtMaximum = c2bNumericState(boundary.initial);
    if (boundary.domain === "glob") {
      expectedAtMaximum[boundary.family].globComparisonCount = boundary.maximum;
      expectedAtMaximum.snapshot.wildcardInvocationCount = boundary.maximum;
    } else if (boundary.domain === "sshMatch") {
      expectedAtMaximum.snapshot.sshMatchComparisonCount = boundary.maximum;
      expectedAtMaximum.snapshot.wildcardInvocationCount = boundary.maximum;
    } else if (boundary.domain === "sudoSelector") {
      expectedAtMaximum.snapshot.sudoSelectorComparisonCount = boundary.maximum;
      expectedAtMaximum.snapshot.wildcardInvocationCount = boundary.maximum;
    } else {
      assert.fail(`unexpected wildcard domain: ${boundary.domain}`);
    }
    assert.deepEqual(c2bNumericState(boundary.atMaximum), expectedAtMaximum, boundary.domain);
    assert.deepEqual(boundary.rejected, { ok: false, error: "restricted_identity_rejected" }, boundary.domain);
    assert.deepEqual(boundary.trace, [], boundary.domain);
    assert.deepEqual(c2bNumericState(boundary.after), c2bExpectedGraphFailure(boundary.atMaximum, boundary.family), boundary.domain);
    assert.equal(boundary.after.snapshot.failed, true, boundary.domain);
    assert.equal(boundary.after[boundary.family].failed, true, boundary.domain);
    assert.deepEqual(boundary.allocations, C2B_ZERO_ALLOCATIONS, boundary.domain);
    assert.deepEqual(boundary.rejectionAllocations, C2B_ZERO_ALLOCATIONS, boundary.domain);
  }
  for (const witness of value.wrongDomains) {
    assert.deepEqual(witness.outcome, { ok: false, error: "restricted_identity_rejected" }, witness.domain);
    assert.deepEqual(witness.trace, [], witness.domain);
    assert.deepEqual(c2bNumericState(witness.after), c2bExpectedGraphFailure(witness.before, witness.family), witness.domain);
    assert.equal(witness.after.snapshot.failed, true, witness.domain);
    assert.equal(witness.after[witness.family].failed, true, witness.domain);
    assert.deepEqual(witness.allocations, C2B_ZERO_ALLOCATIONS, witness.domain);
  }
  assert.deepEqual(value.invalidScanSubjects.raw, { ok: false, error: "restricted_identity_rejected" });
  assert.deepEqual(value.invalidScanSubjects.rawTrace, []);
  assert.deepEqual(value.invalidScanSubjects.rawAfter, value.invalidScanSubjects.rawBefore);
  assert.deepEqual(value.invalidScanSubjects.rawAllocations, C2B_ZERO_ALLOCATIONS);
  assert.deepEqual(value.invalidScanSubjects.failedPreparation, { ok: false, error: "restricted_identity_rejected" });
  assert.deepEqual(value.invalidScanSubjects.failedPreparationAllocations, C2B_ZERO_ALLOCATIONS);
  assert.deepEqual(value.invalidScanSubjects.failed, { ok: false, error: "restricted_identity_rejected" });
  assert.deepEqual(value.invalidScanSubjects.failedTrace, []);
  const expectedFailedScan = c2bNumericState(value.invalidScanSubjects.failedBefore);
  expectedFailedScan.sudo.failed = true;
  assert.deepEqual(c2bNumericState(value.invalidScanSubjects.failedAfter), expectedFailedScan);
  assert.deepEqual(value.invalidScanSubjects.failedAllocations, C2B_ZERO_ALLOCATIONS);
  assert.equal(value.invalidScanSubjects.failedAfter.sudo.failed, true);
  assert.deepEqual(value.invalidScanSubjects.nonBuffer, { ok: false, error: "restricted_identity_rejected" });
  assert.deepEqual(c2bNumericState(value.invalidScanSubjects.nonBufferAfter), c2bExpectedGraphFailure(value.invalidScanSubjects.nonBufferBefore, "ssh"));
  assert.equal(value.invalidScanSubjects.nonBufferAfter.snapshot.failed, true);
  assert.equal(value.invalidScanSubjects.nonBufferAfter.ssh.failed, true);
  assert.deepEqual(value.invalidScanSubjects.nonBufferAllocations, C2B_ZERO_ALLOCATIONS);
  assert.deepEqual(value.invalidMatchGraphs.raw, { ok: false, error: "restricted_identity_rejected" });
  assert.deepEqual(value.invalidMatchGraphs.rawTrace, []);
  assert.deepEqual(value.invalidMatchGraphs.rawAfter, value.invalidMatchGraphs.rawBefore);
  assert.deepEqual(c2bNumericState(value.invalidMatchGraphs.rawBudgetAfter), c2bNumericState(value.invalidMatchGraphs.rawBudgetBefore));
  assert.deepEqual(value.invalidMatchGraphs.rawAllocations, C2B_ZERO_ALLOCATIONS);
  assert.deepEqual(value.invalidMatchGraphs.failedPreparation, { ok: false, error: "restricted_identity_rejected" });
  assert.deepEqual(value.invalidMatchGraphs.failedPreparationAllocations, C2B_ZERO_ALLOCATIONS);
  assert.deepEqual(value.invalidMatchGraphs.failed, { ok: false, error: "restricted_identity_rejected" });
  assert.deepEqual(value.invalidMatchGraphs.failedTrace, []);
  const expectedFailedMatch = c2bNumericState(value.invalidMatchGraphs.failedBefore);
  expectedFailedMatch.sudo.failed = true;
  assert.deepEqual(c2bNumericState(value.invalidMatchGraphs.failedAfter), expectedFailedMatch);
  assert.equal(value.invalidMatchGraphs.failedAfter.snapshot.failed, true);
  assert.equal(value.invalidMatchGraphs.failedAfter.sudo.failed, true);
  assert.deepEqual(value.invalidMatchGraphs.failedAllocations, C2B_ZERO_ALLOCATIONS);
  for (const witness of value.invalidMatches) {
    assert.deepEqual(witness.outcome, { ok: false, error: "restricted_identity_rejected" }, witness.name);
    assert.deepEqual(witness.trace, [], witness.name);
    assert.deepEqual(c2bNumericState(witness.after), c2bExpectedGraphFailure(witness.before, "ssh"), witness.name);
    assert.equal(witness.after.snapshot.failed, true, witness.name);
    assert.equal(witness.after.ssh.failed, true, witness.name);
    assert.deepEqual(witness.allocations, C2B_ZERO_ALLOCATIONS, witness.name);
  }
});

const C2B_BUDGET_HARNESS_SUFFIX = String.raw`
function semanticBoundary(kind, family, maximum, counter) {
  const state = fresh();
  const graph = family === "ssh" ? state.ssh : state.sudo;
  const allocation = withAllocations(() => {
    for (let index = 0; index < maximum; index += 1) api.__test_reserveAuthorizationSemanticNode(graph, kind);
  });
  const atMaximum = inspect(state);
  const rejection = withAllocations(() => safe(() => api.__test_reserveAuthorizationSemanticNode(graph, kind)));
  const after = inspect(state);
  return {
    kind, family, maximum, counter, rejected: rejection.value, rejectionAllocations: rejection.counts,
    atMaximum, after,
    countAtMaximum: atMaximum[family][counter],
    countAfter: after[family][counter],
    graphSemanticAtMaximum: atMaximum[family].semanticNodeCount,
    graphSemanticAfter: after[family].semanticNodeCount,
    snapshotSemanticAtMaximum: atMaximum.snapshot.semanticNodeCount,
    snapshotSemanticAfter: after.snapshot.semanticNodeCount,
    terminal: after.snapshot.failed,
    allocations: allocation.counts
  };
}
function rejectedSemantic(kind, family) {
  const state = fresh();
  const graph = family === "ssh" ? state.ssh : state.sudo;
  const before = inspect(state);
  const allocation = withAllocations(() => safe(() => api.__test_reserveAuthorizationSemanticNode(graph, kind)));
  return { kind, family, before, outcome: allocation.value, after: inspect(state), allocations: allocation.counts };
}
function oneSemantic(kind, family) {
  const state = fresh();
  const graph = family === "ssh" ? state.ssh : state.sudo;
  const before = inspect(state);
  const allocation = withAllocations(() => api.__test_reserveAuthorizationSemanticNode(graph, kind));
  return { kind, family, before, after: inspect(state), allocations: allocation.counts };
}
function runSemantic() {
  const policy = api.__test_c2bPolicy();
  const initialCreation = withAllocations(() => api.__test_c2bCreateState());
  const initial = inspect(initialCreation.value);
  const arities = api.__test_c2bArities();
  const proxyInstrumentation = withAllocations(() => api.__test_c2bProxyInstrumentation(initialCreation.value));
  const fixedShape = api.__test_c2bFixedShape(initialCreation.value);
  const sshKinds = [
    "sshPhysicalDirective", "sshIncludePattern", "sshSelectedInsertion", "sshMatchBranch",
    "sshMatchCondition", "sshMatchPattern", "sshAssignment", "sshAcceptEnvName"
  ];
  const sudoKinds = [
    "sudoStatement", "sudoInclude", "sudoSelectedInsertion", "sudoAliasDefinition", "sudoAliasMember",
    "sudoDefaultsItem", "sudoUserSpec", "sudoUserHostRunasMember", "sudoTagTransition", "sudoCommandSpec",
    "sudoArgumentToken", "sudoAliasEdge", "sudoAliasMemoEntry"
  ];
  const sourceRoute = (family) => {
    const state = fresh();
    const before = inspect(state);
    const graph = family === "ssh" ? state.ssh : state.sudo;
    const allocation = withAllocations(() => api.__test_c2bReserveSourceWithSemanticTrace(graph, 0));
    return { family, before, after: inspect(state), trace: allocation.value, allocations: allocation.counts };
  };
  const sourceRoutes = [sourceRoute("ssh"), sourceRoute("sudo")];
  const sourceOnly = sourceRoutes[0];
  const futureKinds = [
    ...sshKinds.map((kind) => oneSemantic(kind, "ssh")),
    ...sudoKinds.map((kind) => oneSemantic(kind, "sudo"))
  ];
  const boundaries = [
    semanticBoundary("sshSelectedInsertion", "ssh", 65536, "sshSelectedInsertionCount"),
    semanticBoundary("sshMatchBranch", "ssh", 4096, "sshMatchBranchCount"),
    semanticBoundary("sudoSelectedInsertion", "sudo", 65536, "sudoSelectedInsertionCount"),
    semanticBoundary("sudoAliasDefinition", "sudo", 256, "sudoAliasDefinitionCount"),
    semanticBoundary("sudoAliasMember", "sudo", 65536, "sudoAliasMemberCount"),
    semanticBoundary("sudoUserSpec", "sudo", 4096, "sudoUserSpecCount"),
    semanticBoundary("sudoCommandSpec", "sudo", 16384, "sudoCommandSpecCount"),
    semanticBoundary("sudoAliasEdge", "sudo", 16384, "sudoAliasEdgeCount"),
    semanticBoundary("sudoAliasMemoEntry", "sudo", 256, "sudoAliasMemoEntryCount")
  ];
  const localMaxima = [
    ["tokensPerPhysicalLine", 256], ["generalTokenBytes", 4096], ["sshIncludeOperands", 64],
    ["sshMatchBranches", 4096], ["sshMatchConditionsPerBranch", 9], ["sshMatchPatternsPerCondition", 64],
    ["sshMatchPatternBytes", 255], ["sudoAliasDefinitions", 256], ["sudoAliasMembersPerAlias", 256],
    ["sudoAliasExpansionNodes", 4096], ["sudoUserSpecs", 4096], ["sudoUserListMembersPerSpec", 256],
    ["sudoCommandSpecsPerSpec", 256], ["sudoDefaultsItemsPerStatement", 64], ["accountGroups", 256]
  ].map(([name, maximum]) => {
    const accepted = withAllocations(() => api.__test_nextAuthorizationBudgetValue(maximum - 1, 1, maximum));
    const rejected = withAllocations(() => safe(() => api.__test_nextAuthorizationBudgetValue(maximum, 1, maximum)));
    return {
      name, maximum, accepted: accepted.value, rejected: rejected.value,
      acceptedAllocations: accepted.counts, rejectedAllocations: rejected.counts
    };
  });
  const invalidNext = [
    ["negative-current", -1, 1, 10], ["negative-amount", 0, -1, 10], ["zero-amount", 0, 0, 10],
    ["fraction", 0, 1.5, 10], ["unsafe", Number.MAX_SAFE_INTEGER, 1, Number.MAX_SAFE_INTEGER],
    ["string", 0, "1", 10], ["bigint", 0, 1n, 10], ["bad-maximum", 0, 1, 0]
  ].map(([name, current, amount, maximum]) => {
    const allocation = withAllocations(() => safe(() => api.__test_nextAuthorizationBudgetValue(current, amount, maximum)));
    return { name, outcome: allocation.value, allocations: allocation.counts };
  });
  const commandCoupling = (() => {
    const coupled = fresh();
    const preparation = withAllocations(() => {
      for (let index = 0; index < 16384; index += 1) api.__test_reserveAuthorizationWorkUnit(coupled.sudo, "sudoCommand");
    });
    const before = inspect(coupled);
    const rejection = withAllocations(() => safe(() => api.__test_reserveAuthorizationSemanticNode(coupled.sudo, "sudoCommandSpec")));
    return { before, outcome: rejection.value, after: inspect(coupled), preparationAllocations: preparation.counts, rejectionAllocations: rejection.counts };
  })();
  const edgeCoupling = (() => {
    const coupled = fresh();
    const preparation = withAllocations(() => {
      for (let index = 0; index < 16384; index += 1) api.__test_reserveAuthorizationWorkUnit(coupled.sudo, "sudoAliasEdge");
    });
    const before = inspect(coupled);
    const rejection = withAllocations(() => safe(() => api.__test_reserveAuthorizationSemanticNode(coupled.sudo, "sudoAliasEdge")));
    return { before, outcome: rejection.value, after: inspect(coupled), preparationAllocations: preparation.counts, rejectionAllocations: rejection.counts };
  })();
  return {
    policy, arities, proxyInstrumentation: proxyInstrumentation.value,
    proxyInstrumentationAllocations: proxyInstrumentation.counts,
    initial, initialCreationAllocations: initialCreation.counts, fixedShape,
    sourceOnly, futureKinds, boundaries, localMaxima, invalidNext,
    rejected: [
      rejectedSemantic("unknownKind", "ssh"), rejectedSemantic("unknownKind", "sudo"),
      rejectedSemantic("SshMatchBranch", "ssh"), rejectedSemantic("SudoStatement", "sudo"),
      ...sshKinds.map((kind) => rejectedSemantic(kind, "sudo")),
      ...sudoKinds.map((kind) => rejectedSemantic(kind, "ssh")),
      rejectedSemantic("fixedEnvelope", "ssh"), rejectedSemantic("fixedEnvelope", "sudo"),
      rejectedSemantic("authorizationEntry", "ssh"), rejectedSemantic("authorizationEntry", "sudo")
    ],
    unbranded: (() => {
      const state = fresh();
      const raw = { failed: false, semanticNodeCount: 0, kind: "ssh" };
      const before = inspect(state);
      const rawBefore = { ...raw };
      const allocation = withAllocations(() => safe(() => api.__test_reserveAuthorizationSemanticNode(raw, "sshPhysicalDirective")));
      return { before, rawBefore, outcome: allocation.value, after: inspect(state), rawAfter: { ...raw }, allocations: allocation.counts };
    })(),
    sourceRoutes, commandCoupling, edgeCoupling
  };
}
function runAggregate() {
  const state = fresh();
  const initial = inspect(state);
  const allocation = withAllocations(() => {
    for (let index = 0; index < 65534; index += 1) api.__test_reserveAuthorizationSemanticNode(state.ssh, "sshPhysicalDirective");
    for (let index = 0; index < 65533; index += 1) api.__test_reserveAuthorizationSemanticNode(state.sudo, "sudoStatement");
  });
  const atMaximum = inspect(state);
  const rejection = withAllocations(() => safe(() => api.__test_reserveAuthorizationSemanticNode(state.ssh, "sshPhysicalDirective")));
  const after = inspect(state);
  const terminalSemantic = withAllocations(() => safe(() => api.__test_reserveAuthorizationSemanticNode(state.sudo, "sudoStatement")));
  const terminalWork = withAllocations(() => safe(() => api.__test_reserveAuthorizationWorkUnit(state.sudo, "sudoSelector")));
  const terminalPreimage = withAllocations(() => safe(() => api.__test_reservePreimageBytes(state.snapshot, 1)));
  const terminalC2A = withAllocations(() => safe(() => api.__test_c2bReserveSource(state.sudo, 0)));
  const terminalSource = withAllocations(() => api.__test_c2bTerminalSourceOperation(state.sudo));
  const terminalFinal = inspect(state);
  const reset = inspect(fresh());
  return {
    initial, atMaximum, rejected: rejection.value, after,
    rejectionAllocations: rejection.counts,
    terminalSemantic: terminalSemantic.value, terminalSemanticAllocations: terminalSemantic.counts,
    terminalWork: terminalWork.value, terminalWorkAllocations: terminalWork.counts,
    terminalPreimage: terminalPreimage.value, terminalPreimageAllocations: terminalPreimage.counts,
    terminalC2A: terminalC2A.value, terminalC2AAllocations: terminalC2A.counts,
    terminalSource: terminalSource.value, terminalSourceAllocations: terminalSource.counts,
    terminalFinal, reset, allocations: allocation.counts,
    graphDefense: (() => {
      const accepted = withAllocations(() => api.__test_nextAuthorizationBudgetValue(131071, 1, 131072));
      const rejected = withAllocations(() => safe(() => api.__test_nextAuthorizationBudgetValue(131072, 1, 131072)));
      return {
        accepted: accepted.value, rejected: rejected.value,
        acceptedAllocations: accepted.counts, rejectedAllocations: rejected.counts
      };
    })()
  };
}
function workBoundary(kind, family, maximum) {
  const state = fresh();
  const graph = family === "ssh" ? state.ssh : state.sudo;
  const initial = inspect(state);
  const allocation = withAllocations(() => {
    for (let index = 0; index < maximum; index += 1) api.__test_reserveAuthorizationWorkUnit(graph, kind);
  });
  const atMaximum = inspect(state);
  const rejection = withAllocations(() => safe(() => api.__test_reserveAuthorizationWorkUnit(graph, kind)));
  return {
    kind, family, maximum, initial, atMaximum, rejected: rejection.value, after: inspect(state),
    allocations: allocation.counts, rejectionAllocations: rejection.counts
  };
}
function invalidWork(kind, family) {
  const state = fresh();
  const graph = family === "ssh" ? state.ssh : state.sudo;
  const before = inspect(state);
  const allocation = withAllocations(() => safe(() => api.__test_reserveAuthorizationWorkUnit(graph, kind)));
  return { kind, family, before, outcome: allocation.value, after: inspect(state), allocations: allocation.counts };
}
function runWork() {
  const initial = inspect(fresh());
  const boundaries = [
    workBoundary("glob", "ssh", 65536), workBoundary("glob", "sudo", 65536), workBoundary("sshMatch", "ssh", 131072),
    workBoundary("sudoSelector", "sudo", 65536), workBoundary("sudoCommand", "sudo", 16384),
    workBoundary("sudoAliasEdge", "sudo", 16384), workBoundary("sudoAliasVisit", "sudo", 32768)
  ];
  const invocationAtomic = (() => {
    const state = fresh();
    for (let index = 0; index < 65536; index += 1) api.__test_reserveAuthorizationWorkUnit(state.ssh, "glob");
    for (let index = 0; index < 65536; index += 1) api.__test_reserveAuthorizationWorkUnit(state.sudo, "sudoSelector");
    const before = inspect(state);
    const rejection = withAllocations(() => safe(() => api.__test_reserveAuthorizationWorkUnit(state.ssh, "sshMatch")));
    return { before, rejected: rejection.value, after: inspect(state), rejectionAllocations: rejection.counts };
  })();
  const preimage = (() => {
    const state = fresh();
    const initial = inspect(state);
    const allocation = withAllocations(() => [
      api.__test_reservePreimageBytes(state.snapshot, 4194304),
      api.__test_reservePreimageBytes(state.snapshot, 4194304)
    ]);
    const atMaximum = inspect(state);
    const rejection = withAllocations(() => safe(() => api.__test_reservePreimageBytes(state.snapshot, 1)));
    return {
      returnTypes: allocation.value.map((value) => typeof value), allocations: allocation.counts,
      initial, atMaximum, before: atMaximum, rejected: rejection.value, rejectionAllocations: rejection.counts, after: inspect(state)
    };
  })();
  const invalidPreimage = [
    ["too-large", 4194305], ["zero", 0], ["negative", -1], ["fraction", 1.5],
    ["unsafe", Number.MAX_SAFE_INTEGER + 1], ["string", "1"], ["bigint", 1n], ["missing", undefined]
  ].map(([name, length]) => {
    const state = fresh();
    const before = inspect(state);
    const allocation = withAllocations(() => safe(() => api.__test_reservePreimageBytes(state.snapshot, length)));
    return { name, before, outcome: allocation.value, after: inspect(state), allocations: allocation.counts };
  });
  const unbranded = (() => {
    const state = fresh();
    const raw = { failed: false, retainedPreimageBytes: 0 };
    const before = inspect(state);
    const rawBefore = { ...raw };
    const allocation = withAllocations(() => safe(() => api.__test_reservePreimageBytes(raw, 1)));
    return { before, rawBefore, outcome: allocation.value, after: inspect(state), rawAfter: { ...raw }, allocations: allocation.counts };
  })();
  const failedSnapshot = (() => {
    const state = fresh();
    const firstAllocation = withAllocations(() => safe(() => api.__test_reserveAuthorizationWorkUnit(state.ssh, "unknown")));
    const before = inspect(state);
    const secondAllocation = withAllocations(() => safe(() => api.__test_reservePreimageBytes(state.snapshot, 1)));
    return {
      first: firstAllocation.value, firstAllocations: firstAllocation.counts, before,
      second: secondAllocation.value, secondAllocations: secondAllocation.counts, after: inspect(state)
    };
  })();
  const rejectedWork = [
    ["unknown", "ssh"], ["unknown", "sudo"], ["Glob", "ssh"], ["Glob", "sudo"],
    ["sshMatch", "sudo"], ["sudoSelector", "ssh"], ["sudoCommand", "ssh"],
    ["sudoAliasEdge", "ssh"], ["sudoAliasVisit", "ssh"]
  ].map(([kind, family]) => invalidWork(kind, family));
  const unbrandedWork = (() => {
    const state = fresh();
    const raw = { failed: false, globComparisonCount: 0, kind: "ssh" };
    const before = inspect(state);
    const rawBefore = { ...raw };
    const allocation = withAllocations(() => safe(() => api.__test_reserveAuthorizationWorkUnit(raw, "glob")));
    return { before, rawBefore, outcome: allocation.value, after: inspect(state), rawAfter: { ...raw }, allocations: allocation.counts };
  })();
  return {
    policy: api.__test_c2bPolicy().work, initial, boundaries, invocationAtomic, preimage,
    invalidPreimage, unbranded, failedSnapshot, rejectedWork, unbrandedWork
  };
}
function traceBuffer(bytes, role, trace) {
  const buffer = Buffer.from(bytes);
  return new Proxy(buffer, {
    get(target, property) {
      if (typeof property === "string" && /^(0|[1-9][0-9]*)$/.test(property)) trace.push([role, Number(property)]);
      return Reflect.get(target, property, target);
    }
  });
}
function matchCase(state, family, domain, pattern, target) {
  const graph = family === "ssh" ? state.ssh : state.sudo;
  const before = inspect(state);
  const trace = [];
  const tracedPattern = traceBuffer(pattern, "pattern", trace);
  const tracedTarget = traceBuffer(target, "target", trace);
  const allocation = withAllocations(() => {
    const starIndex = api.__test_scanAuthorizationWildcardPattern(graph, tracedPattern);
    return { starIndex };
  });
  const scanTrace = trace.splice(0);
  const matchAllocation = withAllocations(() => api.__test_matchAuthorizationWildcard(
    graph, domain, tracedPattern, tracedTarget, allocation.value.starIndex
  ));
  const after = inspect(state);
  return {
    family, domain, result: matchAllocation.value, starIndex: allocation.value.starIndex, patternLength: pattern.length,
    before, after, scanTrace, matchTrace: trace,
    patternDelta: after.snapshot.wildcardPatternByteCount - before.snapshot.wildcardPatternByteCount,
    invocationDelta: after.snapshot.wildcardInvocationCount - before.snapshot.wildcardInvocationCount,
    alignedDelta: after.snapshot.wildcardAlignedComparisonCount - before.snapshot.wildcardAlignedComparisonCount,
    scanAllocations: allocation.counts, matchAllocations: matchAllocation.counts
  };
}
function wildcardDomainBoundary(domain, family, maximum) {
  const state = fresh();
  const graph = family === "ssh" ? state.ssh : state.sudo;
  const initial = inspect(state);
  const empty = Buffer.alloc(0);
  const allocation = withAllocations(() => {
    for (let index = 0; index < maximum; index += 1) api.__test_matchAuthorizationWildcard(graph, domain, empty, empty, -1);
  });
  const atMaximum = inspect(state);
  const trace = [];
  const pattern = traceBuffer(Buffer.from([0x61]), "pattern", trace);
  const target = traceBuffer(Buffer.from([0x61]), "target", trace);
  const rejection = withAllocations(() => safe(() => api.__test_matchAuthorizationWildcard(graph, domain, pattern, target, -1)));
  return {
    domain, family, maximum, initial, atMaximum, rejected: rejection.value, after: inspect(state), trace,
    allocations: allocation.counts, rejectionAllocations: rejection.counts
  };
}
function secondStar(pattern) {
  const state = fresh();
  const before = inspect(state);
  const trace = [];
  const subject = traceBuffer(pattern, "pattern", trace);
  const allocation = withAllocations(() => safe(() => api.__test_scanAuthorizationWildcardPattern(state.ssh, subject)));
  return { before, outcome: allocation.value, trace, after: inspect(state), allocations: allocation.counts };
}
function invalidWildcardMatch(name, patternKind, targetKind, starIndex, omitStarIndex = false) {
  const state = fresh();
  const trace = [];
  const pattern = patternKind === "buffer" ? traceBuffer(Buffer.from([0x61]), "pattern", trace) : "a";
  const target = targetKind === "buffer" ? traceBuffer(Buffer.from([0x61]), "target", trace) : "a";
  const before = inspect(state);
  const allocation = withAllocations(() => safe(() => omitStarIndex
    ? api.__test_matchAuthorizationWildcard(state.ssh, "glob", pattern, target)
    : api.__test_matchAuthorizationWildcard(state.ssh, "glob", pattern, target, starIndex)));
  return { name, before, outcome: allocation.value, trace, after: inspect(state), allocations: allocation.counts };
}
function runWildcard() {
  const casesState = fresh();
  const cases = [
    ["no-star-equal", "ssh", "glob", "abc", "abc"],
    ["literal-mismatch", "ssh", "glob", "abc", "abd"],
    ["unequal-length", "ssh", "glob", "abc", "ab"],
    ["question", "ssh", "sshMatch", "a?c", "abc"],
    ["star-start", "ssh", "glob", "*c", "abc"],
    ["star-end", "ssh", "glob", "a*", "abc"],
    ["star-middle-empty", "sudo", "sudoSelector", "a*c", "ac"],
    ["star-middle-nonempty", "sudo", "sudoSelector", "a*c", "abbbc"],
    ["star-too-short", "ssh", "glob", "ab*cd", "abc"],
    ["sudo-glob", "sudo", "glob", "a*c", "abbbc"]
  ].map(([name, family, domain, pattern, target]) => ({
    name,
    ...matchCase(casesState, family, domain, Buffer.from(pattern, "ascii"), Buffer.from(target, "ascii"))
  }));
  const longTrace = (() => {
    const state = fresh();
    const before = inspect(state);
    const trace = [];
    const pattern = traceBuffer(Buffer.from("ab?*x?z", "ascii"), "pattern", trace);
    const target = traceBuffer(Buffer.from("abQmidXxYz", "ascii"), "target", trace);
    const scanAllocation = withAllocations(() => api.__test_scanAuthorizationWildcardPattern(state.ssh, pattern));
    const starIndex = scanAllocation.value;
    const scanTrace = trace.splice(0);
    const matchAllocation = withAllocations(() => api.__test_matchAuthorizationWildcard(state.ssh, "glob", pattern, target, starIndex));
    const after = inspect(state);
    return {
      starIndex, result: matchAllocation.value, scanTrace, matchTrace: trace, before, after,
      patternDelta: after.snapshot.wildcardPatternByteCount - before.snapshot.wildcardPatternByteCount,
      invocationDelta: after.snapshot.wildcardInvocationCount - before.snapshot.wildcardInvocationCount,
      alignedDelta: after.snapshot.wildcardAlignedComparisonCount - before.snapshot.wildcardAlignedComparisonCount,
      scanAllocations: scanAllocation.counts, matchAllocations: matchAllocation.counts
    };
  })();
  const earlyPrefix = (() => {
    const state = fresh();
    const before = inspect(state);
    const trace = [];
    const pattern = traceBuffer(Buffer.from("ab*cd", "ascii"), "pattern", trace);
    const target = traceBuffer(Buffer.from("axMIDcd", "ascii"), "target", trace);
    const scanAllocation = withAllocations(() => api.__test_scanAuthorizationWildcardPattern(state.ssh, pattern));
    const starIndex = scanAllocation.value;
    trace.length = 0;
    const matchAllocation = withAllocations(() => api.__test_matchAuthorizationWildcard(state.ssh, "glob", pattern, target, starIndex));
    const after = inspect(state);
    return {
      result: matchAllocation.value, trace, before, after,
      patternDelta: after.snapshot.wildcardPatternByteCount - before.snapshot.wildcardPatternByteCount,
      invocationDelta: after.snapshot.wildcardInvocationCount - before.snapshot.wildcardInvocationCount,
      alignedDelta: after.snapshot.wildcardAlignedComparisonCount - before.snapshot.wildcardAlignedComparisonCount,
      scanAllocations: scanAllocation.counts, matchAllocations: matchAllocation.counts
    };
  })();
  const earlySuffix = (() => {
    const state = fresh();
    const before = inspect(state);
    const trace = [];
    const pattern = traceBuffer(Buffer.from("ab*cd", "ascii"), "pattern", trace);
    const target = traceBuffer(Buffer.from("abMIDcx", "ascii"), "target", trace);
    const scanAllocation = withAllocations(() => api.__test_scanAuthorizationWildcardPattern(state.ssh, pattern));
    const starIndex = scanAllocation.value;
    trace.length = 0;
    const matchAllocation = withAllocations(() => api.__test_matchAuthorizationWildcard(state.ssh, "glob", pattern, target, starIndex));
    const after = inspect(state);
    return {
      result: matchAllocation.value, trace, before, after,
      patternDelta: after.snapshot.wildcardPatternByteCount - before.snapshot.wildcardPatternByteCount,
      invocationDelta: after.snapshot.wildcardInvocationCount - before.snapshot.wildcardInvocationCount,
      alignedDelta: after.snapshot.wildcardAlignedComparisonCount - before.snapshot.wildcardAlignedComparisonCount,
      scanAllocations: scanAllocation.counts, matchAllocations: matchAllocation.counts
    };
  })();
  const patternBoundary = (() => {
    const state = fresh();
    const initial = inspect(state);
    const pattern = Buffer.alloc(4096, 0x61);
    const allocation = withAllocations(() => {
      for (let index = 0; index < 1024; index += 1) api.__test_scanAuthorizationWildcardPattern(state.ssh, pattern);
    });
    const atMaximum = inspect(state);
    const trace = [];
    const subject = traceBuffer(Buffer.from([0x61]), "pattern", trace);
    const rejection = withAllocations(() => safe(() => api.__test_scanAuthorizationWildcardPattern(state.ssh, subject)));
    return {
      initial, atMaximum, rejected: rejection.value, after: inspect(state), trace,
      allocations: allocation.counts, rejectionAllocations: rejection.counts
    };
  })();
  const alignedBoundary = (() => {
    const state = fresh();
    const initial = inspect(state);
    const pattern = Buffer.alloc(4096, 0x61);
    const target = Buffer.alloc(4096, 0x61);
    const scanAllocation = withAllocations(() => api.__test_scanAuthorizationWildcardPattern(state.ssh, pattern));
    const starIndex = scanAllocation.value;
    const afterScan = inspect(state);
    const allocation = withAllocations(() => {
      for (let index = 0; index < 4096; index += 1) api.__test_matchAuthorizationWildcard(state.ssh, "glob", pattern, target, starIndex);
    });
    const atMaximum = inspect(state);
    const trace = [];
    const rejection = withAllocations(() => safe(() => api.__test_matchAuthorizationWildcard(
      state.ssh,
      "glob",
      traceBuffer(pattern, "pattern", trace),
      traceBuffer(target, "target", trace),
      starIndex
    )));
    return {
      initial, afterScan, atMaximum, rejected: rejection.value, after: inspect(state), trace,
      scanAllocations: scanAllocation.counts, allocations: allocation.counts, rejectionAllocations: rejection.counts
    };
  })();
  const wrongDomains = [
    ["sudoSelector", "ssh"], ["sshMatch", "sudo"],
    ["unknown", "ssh"], ["unknown", "sudo"], ["Glob", "ssh"], ["Glob", "sudo"]
  ].map(([domain, family]) => {
    const state = fresh();
    const graph = family === "ssh" ? state.ssh : state.sudo;
    const before = inspect(state);
    const trace = [];
    const pattern = traceBuffer(Buffer.from([0x61]), "pattern", trace);
    const target = traceBuffer(Buffer.from([0x61]), "target", trace);
    const allocation = withAllocations(() => safe(() => api.__test_matchAuthorizationWildcard(
      graph,
      domain,
      pattern,
      target,
      -1
    )));
    return { domain, family, before, outcome: allocation.value, trace, after: inspect(state), allocations: allocation.counts };
  });
  const invalidScanSubjects = (() => {
    const rawGraph = { failed: false, wildcardPatternByteCount: 0 };
    const rawBefore = { ...rawGraph };
    const rawTrace = [];
    const rawSubject = traceBuffer(Buffer.from([0x61]), "pattern", rawTrace);
    const rawAllocation = withAllocations(() => safe(() => api.__test_scanAuthorizationWildcardPattern(rawGraph, rawSubject)));
    const state = fresh();
    const failedPreparation = withAllocations(() => safe(() => api.__test_reserveAuthorizationWorkUnit(state.ssh, "unknown")));
    const failedBefore = inspect(state);
    const failedTrace = [];
    const failedSubject = traceBuffer(Buffer.from([0x61]), "pattern", failedTrace);
    const failedAllocation = withAllocations(() => safe(() => api.__test_scanAuthorizationWildcardPattern(
      state.sudo,
      failedSubject
    )));
    const nonBufferState = fresh();
    const nonBufferBefore = inspect(nonBufferState);
    const nonBufferAllocation = withAllocations(() => safe(() => api.__test_scanAuthorizationWildcardPattern(nonBufferState.ssh, "a")));
    return {
      raw: rawAllocation.value, rawBefore, rawAfter: { ...rawGraph }, rawTrace, rawAllocations: rawAllocation.counts,
      failedPreparation: failedPreparation.value, failedPreparationAllocations: failedPreparation.counts,
      failed: failedAllocation.value, failedTrace, failedBefore, failedAfter: inspect(state), failedAllocations: failedAllocation.counts,
      nonBuffer: nonBufferAllocation.value, nonBufferBefore, nonBufferAfter: inspect(nonBufferState), nonBufferAllocations: nonBufferAllocation.counts
    };
  })();
  const invalidMatchGraphs = (() => {
    const rawState = fresh();
    const raw = { failed: false, globComparisonCount: 0, kind: "ssh" };
    const rawBefore = { ...raw };
    const rawBudgetBefore = inspect(rawState);
    const rawTrace = [];
    const rawPattern = traceBuffer(Buffer.from([0x61]), "pattern", rawTrace);
    const rawTarget = traceBuffer(Buffer.from([0x61]), "target", rawTrace);
    const rawAllocation = withAllocations(() => safe(() => api.__test_matchAuthorizationWildcard(raw, "glob", rawPattern, rawTarget, -1)));
    const failedState = fresh();
    const failedPreparation = withAllocations(() => safe(() => api.__test_reserveAuthorizationWorkUnit(failedState.ssh, "unknown")));
    const failedBefore = inspect(failedState);
    const failedTrace = [];
    const failedPattern = traceBuffer(Buffer.from([0x61]), "pattern", failedTrace);
    const failedTarget = traceBuffer(Buffer.from([0x61]), "target", failedTrace);
    const failedAllocation = withAllocations(() => safe(() => api.__test_matchAuthorizationWildcard(
      failedState.sudo, "glob", failedPattern, failedTarget, -1
    )));
    return {
      raw: rawAllocation.value, rawBefore, rawAfter: { ...raw }, rawBudgetBefore, rawBudgetAfter: inspect(rawState),
      rawTrace, rawAllocations: rawAllocation.counts,
      failedPreparation: failedPreparation.value, failedPreparationAllocations: failedPreparation.counts,
      failed: failedAllocation.value, failedBefore, failedAfter: inspect(failedState),
      failedTrace, failedAllocations: failedAllocation.counts
    };
  })();
  return {
    cases, longTrace, earlyPrefix, earlySuffix,
    secondStars: [secondStar(Buffer.from("a*b*c", "ascii")), secondStar(Buffer.from("**x", "ascii"))],
    patternBoundary, alignedBoundary, wrongDomains, invalidScanSubjects, invalidMatchGraphs,
    invalidMatches: [
      invalidWildcardMatch("non-buffer-pattern", "raw", "buffer", -1),
      invalidWildcardMatch("non-buffer-target", "buffer", "raw", -1),
      invalidWildcardMatch("negative-non-sentinel", "buffer", "buffer", -2),
      invalidWildcardMatch("out-of-range", "buffer", "buffer", 1),
      invalidWildcardMatch("fraction", "buffer", "buffer", 0.5),
      invalidWildcardMatch("string", "buffer", "buffer", "0"),
      invalidWildcardMatch("bigint", "buffer", "buffer", 0n),
      invalidWildcardMatch("missing", "buffer", "buffer", undefined, true)
    ],
    domains: [
      wildcardDomainBoundary("glob", "ssh", 65536),
      wildcardDomainBoundary("glob", "sudo", 65536),
      wildcardDomainBoundary("sshMatch", "ssh", 131072),
      wildcardDomainBoundary("sudoSelector", "sudo", 65536)
    ]
  };
}

try {
  const missingSymbols = api.__test_missingC2BSymbols();
  if (missingSymbols.length !== 0) {
    process.stdout.write(JSON.stringify({ error: null, value: { missingSymbols, moduleAllocationCounts } }));
  } else {
    let value;
    if (scenario === "semantic") value = runSemantic();
    else if (scenario === "aggregate") value = runAggregate();
    else if (scenario === "work") value = runWork();
    else if (scenario === "wildcard") value = runWildcard();
    else throw new Error("unknown scenario");
    process.stdout.write(JSON.stringify({ error: null, value: { missingSymbols, moduleAllocationCounts, ...value } }));
  }
} catch (error) {
  const message = String(error && error.message || "");
  const identifier = message.match(/[A-Za-z_$][A-Za-z0-9_$]*/);
  process.stdout.write(JSON.stringify({ error: errorCode(error), missing: identifier ? identifier[0] : null }));
}
`;

function c2bBudgetVmProbe(scenario) {
  const directory = mkdtempSync(join(tmpdir(), "japan-c2b-budget-vm-"));
  const harnessPath = join(directory, "harness.mjs");
  const runnerPath = fileURLToPath(new URL("../../scripts/japan-tuic-additive-repair-runner.mjs", import.meta.url));
  const harness = c2bBudgetHarnessPrefix() + C2B_BUDGET_HARNESS_SUFFIX;
  writeFileSync(harnessPath, harness, "utf8");
  try {
    const result = spawnSync(process.execPath, ["--experimental-vm-modules", harnessPath, runnerPath, scenario], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      timeout: 120000
    });
    assert.equal(result.status, 0, result.stderr || String(result.error));
    return JSON.parse(result.stdout);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const C3_EXPECTED_MISSING_SYMBOLS = Object.freeze([
  "reserveAuthorizationFixedEnvelope",
  "deriveAuthorizationSshSyntax",
  "disposeAuthorizationSshSyntax"
]);
const C4_EXPECTED_MISSING_SYMBOLS = Object.freeze([
  "deriveAuthorizationSshPolicy",
  "disposeAuthorizationSshPolicy"
]);
const C3_EXACT_BLOCK_BEGIN = "// C3_SSH_SOURCE_BLOCK_BEGIN";
const C3_EXACT_BLOCK_END = "// C3_SSH_SOURCE_BLOCK_END";
const C3_EXACT_BLOCK_SIZE = 61980;
const C3_EXACT_BLOCK_LINES = 1482;
const C3_EXACT_BLOCK_SHA256 = "cf93a44d95dc99ff305eaf465509ccf2fcdb54f92988fa8cba7294503bb2e740";
const C4_EXACT_RUNNER_SIZE = 224784;
const C4_EXACT_RUNNER_LINES = 5551;
const C4_EXACT_RUNNER_SHA256 = "f982a32670158768fe960459fde48ea6d6ef9d7dba9123fd91333b47db00c777";
const C4_EXACT_BLOCK_BEGIN = "// C4_SSH_POLICY_BLOCK_BEGIN";
const C4_EXACT_BLOCK_END = "// C4_SSH_POLICY_BLOCK_END";
const C4_EXACT_BLOCK_SIZE = 48834;
const C4_EXACT_BLOCK_LINES = 1043;
const C4_EXACT_BLOCK_SHA256 = "e530ca3154dbd9ab0db3849bf78936e75774c6bcc6d7e3b60913719c04990b25";
const C4_EXACT_TOKEN_COUNT = 8181;
const C4_EXACT_TOKEN_SHA256 = "0be5bd35a49ce7b01fbcae90ea0740d1c4a52f9328833ec2b31c5f8c48294129";
const C4_EXPECTED_TOP_LEVEL_DECLARATIONS = Object.freeze([
  "const AUTHORIZATION_SSH_C4_AUTHORIZED_PREFIX",
  "const AUTHORIZATION_SSH_C4_BINDING_NAMES",
  "const AUTHORIZATION_SSH_C4_BINDING_PATH_NAMES",
  "const AUTHORIZATION_SSH_C4_BINDING_SSH_NAMES",
  "const AUTHORIZATION_SSH_C4_OPERATION_INPUT_NAMES",
  "const AUTHORIZATION_SSH_C4_PATH_OPERATION_NAMES",
  "const AUTHORIZATION_SSH_C4_PATH_POLICY_NAMES",
  "const AUTHORIZATION_SSH_C4_SOURCE_OPERATION_NAMES",
  "const AUTHORIZATION_SSH_C4_TOPOLOGY_MIDDLE",
  "const AUTHORIZATION_SSH_C4_TOPOLOGY_TAIL",
  "const AUTHORIZATION_SSH_C4_VALUE_SLOTS",
  "function authorizationSshC4AdoptCanonicalBindingShape",
  "function authorizationSshC4AsciiText",
  "function authorizationSshC4AssignmentSlot",
  "function authorizationSshC4Base64Value",
  "function authorizationSshC4BindingShape",
  "function authorizationSshC4Boolean",
  "function authorizationSshC4BuildTopology",
  "function authorizationSshC4CleanupPolicy",
  "function authorizationSshC4CloneClosure",
  "function authorizationSshC4CompleteProjection",
  "function authorizationSshC4CreateValueTable",
  "function authorizationSshC4DecodeLine",
  "function authorizationSshC4DigestMatches",
  "function authorizationSshC4EffectiveIsSafe",
  "function authorizationSshC4ExactRecord",
  "function authorizationSshC4First",
  "function authorizationSshC4FixedArray",
  "function authorizationSshC4FixedObject",
  "function authorizationSshC4FreezeCoverage",
  "function authorizationSshC4OperationInput",
  "function authorizationSshC4PatternListMatches",
  "function authorizationSshC4ReadAuthorization",
  "function authorizationSshC4ReadEof",
  "function authorizationSshC4SameFinal",
  "function authorizationSshC4TableAssignment",
  "function authorizationSshC4ValidateAncestor",
  "function authorizationSshC4ValidateFinal",
  "function authorizationSshC4WriteAsciiTarget",
  "function authorizationSshC4ZeroBuffersTo",
  "function deriveAuthorizationSshPolicy",
  "function disposeAuthorizationSshPolicy",
  "function emitAuthorizationSshCoverage",
  "function emitAuthorizationSshTopology",
  "function measureAuthorizationSshCoverage",
  "function measureAuthorizationSshTopology",
  "function verifyProjectedSshAuthorization"
]);
const C4_EXPECTED_TOP_LEVEL_ARITIES = Object.freeze([
  "authorizationSshC4AdoptCanonicalBindingShape/2",
  "authorizationSshC4AsciiText/1",
  "authorizationSshC4AssignmentSlot/1",
  "authorizationSshC4Base64Value/1",
  "authorizationSshC4BindingShape/1",
  "authorizationSshC4Boolean/2",
  "authorizationSshC4BuildTopology/5",
  "authorizationSshC4CleanupPolicy/3",
  "authorizationSshC4CloneClosure/2",
  "authorizationSshC4CompleteProjection/4",
  "authorizationSshC4CreateValueTable/1",
  "authorizationSshC4DecodeLine/2",
  "authorizationSshC4DigestMatches/2",
  "authorizationSshC4EffectiveIsSafe/1",
  "authorizationSshC4ExactRecord/3",
  "authorizationSshC4First/4",
  "authorizationSshC4FixedArray/2",
  "authorizationSshC4FixedObject/1",
  "authorizationSshC4FreezeCoverage/1",
  "authorizationSshC4OperationInput/1",
  "authorizationSshC4PatternListMatches/6",
  "authorizationSshC4ReadAuthorization/3",
  "authorizationSshC4ReadEof/3",
  "authorizationSshC4SameFinal/2",
  "authorizationSshC4TableAssignment/2",
  "authorizationSshC4ValidateAncestor/1",
  "authorizationSshC4ValidateFinal/1",
  "authorizationSshC4WriteAsciiTarget/2",
  "authorizationSshC4ZeroBuffersTo/2",
  "deriveAuthorizationSshPolicy/3",
  "disposeAuthorizationSshPolicy/2",
  "emitAuthorizationSshCoverage/2",
  "emitAuthorizationSshTopology/2",
  "measureAuthorizationSshCoverage/1",
  "measureAuthorizationSshTopology/1",
  "verifyProjectedSshAuthorization/2"
]);
const C3_EXPECTED_TOP_LEVEL_ADDITIONS = Object.freeze([
  "const AUTHORIZATION_SSH_AUTHORITY_NAMES",
  "const AUTHORIZATION_SSH_BOOLEAN_NAMES",
  "const AUTHORIZATION_SSH_JSON_HEX",
  "const AUTHORIZATION_SSH_MATCH_NAMES",
  "const AUTHORIZATION_SSH_OPAQUE_NAMES",
  "const AUTHORIZATION_SSH_PROVENANCE",
  "const AUTHORIZATION_SSH_RELATIVE_BASE",
  "const AUTHORIZATION_SSH_ROOT_CONFIG",
  "function authorizationSshAsciiEquals",
  "function authorizationSshAsciiExact",
  "function authorizationSshAsciiTokensWithoutEquals",
  "function authorizationSshCanonicalArguments",
  "function authorizationSshChildPath",
  "function authorizationSshDirective",
  "function authorizationSshDirectoryArray",
  "function authorizationSshEvent",
  "function authorizationSshFreshGraphCounters",
  "function authorizationSshHeapSort",
  "function authorizationSshIncludeFinalStart",
  "function authorizationSshIncludeParent",
  "function authorizationSshIntegerLength",
  "function authorizationSshJsonStringLength",
  "function authorizationSshMatchName",
  "function authorizationSshNameInList",
  "function authorizationSshNativeEmptyArray",
  "function authorizationSshReviewedName",
  "function authorizationSshSkipSeparators",
  "function authorizationSshTokenEnd",
  "function authorizationSshValidatePhysicalLine",
  "function authorizationSshValidateSourceBytes",
  "function authorizationSshWriteAscii",
  "function authorizationSshWriteInteger",
  "function authorizationSshWriteJsonString",
  "function authorizationSshZeroEventBuffer",
  "function cleanupAuthorizationSshSyntax",
  "function deriveAuthorizationSshSyntax",
  "function disposeAuthorizationSshSyntax",
  "function emitAuthorizationSshClosure",
  "function measureAuthorizationSshClosure",
  "function requireFreshAuthorizationSshGraph",
  "function reserveAuthorizationFixedEnvelope"
]);
const C3_EXPECTED_TOP_LEVEL_ARITIES = Object.freeze([
  "authorizationSshAsciiEquals/4",
  "authorizationSshAsciiExact/4",
  "authorizationSshAsciiTokensWithoutEquals/3",
  "authorizationSshCanonicalArguments/5",
  "authorizationSshChildPath/2",
  "authorizationSshDirective/3",
  "authorizationSshDirectoryArray/4",
  "authorizationSshEvent/11",
  "authorizationSshFreshGraphCounters/1",
  "authorizationSshHeapSort/1",
  "authorizationSshIncludeFinalStart/3",
  "authorizationSshIncludeParent/3",
  "authorizationSshIntegerLength/1",
  "authorizationSshJsonStringLength/1",
  "authorizationSshMatchName/3",
  "authorizationSshNameInList/2",
  "authorizationSshNativeEmptyArray/1",
  "authorizationSshReviewedName/4",
  "authorizationSshSkipSeparators/3",
  "authorizationSshTokenEnd/3",
  "authorizationSshValidatePhysicalLine/3",
  "authorizationSshValidateSourceBytes/1",
  "authorizationSshWriteAscii/3",
  "authorizationSshWriteInteger/3",
  "authorizationSshWriteJsonString/3",
  "authorizationSshZeroEventBuffer/1",
  "cleanupAuthorizationSshSyntax/3",
  "deriveAuthorizationSshSyntax/3",
  "disposeAuthorizationSshSyntax/2",
  "emitAuthorizationSshClosure/2",
  "measureAuthorizationSshClosure/1",
  "requireFreshAuthorizationSshGraph/1",
  "reserveAuthorizationFixedEnvelope/1"
]);
const C3_EVENT_SCHEMAS = Object.freeze({
  physicalDirective: Object.freeze(["kind", "eventOrdinal", "sourceOrdinal", "lineNumber", "directive", "scope", "branchOrdinal"]),
  includePattern: Object.freeze(["kind", "eventOrdinal", "sourceOrdinal", "lineNumber", "physicalEventOrdinal", "argumentOrdinal", "starIndex", "selectedCount"]),
  selectedInsertion: Object.freeze(["kind", "eventOrdinal", "sourceOrdinal", "lineNumber", "includePatternEventOrdinal", "selectionOrdinal", "path"]),
  matchBranch: Object.freeze(["kind", "eventOrdinal", "sourceOrdinal", "lineNumber", "physicalEventOrdinal", "branchOrdinal", "conditionStartEventOrdinal", "conditionCount", "patternCount"]),
  matchCondition: Object.freeze(["kind", "eventOrdinal", "sourceOrdinal", "lineNumber", "physicalEventOrdinal", "branchOrdinal", "conditionOrdinal", "name", "patternStartEventOrdinal", "patternCount"]),
  matchPattern: Object.freeze(["kind", "eventOrdinal", "sourceOrdinal", "lineNumber", "physicalEventOrdinal", "branchOrdinal", "conditionOrdinal", "patternOrdinal", "negated", "valueBytes", "starIndex"]),
  assignment: Object.freeze(["kind", "eventOrdinal", "sourceOrdinal", "lineNumber", "physicalEventOrdinal", "scope", "branchOrdinal", "name", "argumentCount", "valueBytes"]),
  acceptEnvName: Object.freeze(["kind", "eventOrdinal", "sourceOrdinal", "lineNumber", "physicalEventOrdinal", "scope", "branchOrdinal", "assignmentEventOrdinal", "nameOrdinal", "valueBytes"])
});
const C3_EVENT_ROLE_BY_KIND = Object.freeze({
  physicalDirective: "sshPhysicalDirective",
  includePattern: "sshIncludePattern",
  selectedInsertion: "sshSelectedInsertion",
  matchBranch: "sshMatchBranch",
  matchCondition: "sshMatchCondition",
  matchPattern: "sshMatchPattern",
  assignment: "sshAssignment",
  acceptEnvName: "sshAcceptEnvName"
});
const C3_OPAQUE_DIRECTIVES = Object.freeze(`addressfamily allowagentforwarding allowgroups allowstreamlocalforwarding
allowtcpforwarding allowusers banner casignaturealgorithms channeltimeout
ciphers clientalivecountmax clientaliveinterval compression denygroups
denyusers exposeauthinfo fingerprinthash gatewayports gssapicleanupcredentials
gssapistrictacceptorcheck hostbasedacceptedalgorithms
hostbasedusesnamefrompacketonly hostcertificate hostkey hostkeyagent
hostkeyalgorithms ignorerhosts ipqos kerberosgetafstoken
kerberosorlocalpasswd kerberosticketcleanup listenaddress logingracetime
loglevel logverbose macs maxauthtries maxsessions maxstartups modulifile
persourcemaxstartups persourcenetblocksize permitemptypasswords permitlisten
permitopen permitrootlogin permittty permituserrc pidfile port printlastlog
printmotd pubkeyacceptedalgorithms pubkeyauthoptions rekeylimit requiredrsasize
revokedkeys rdomain securitykeyprovider setenv streamlocalbindmask
streamlocalbindunlink strictmodes subsystem syslogfacility tcpkeepalive usedns
usepam versionaddendum x11displayoffset x11forwarding x11uselocalhost
xauthlocation unusedconnectiontimeout`.split(/\s+/));
const C3_AUTHORITY_DIRECTIVES = Object.freeze([
  "authenticationmethods", "pubkeyauthentication", "passwordauthentication",
  "kbdinteractiveauthentication", "challengeresponseauthentication",
  "hostbasedauthentication", "gssapiauthentication", "kerberosauthentication",
  "permituserenvironment", "acceptenv", "forcecommand", "chrootdirectory",
  "disableforwarding", "permittunnel", "authorizedkeysfile", "authorizedkeyscommand",
  "authorizedprincipalsfile", "authorizedprincipalscommand", "trustedusercakeys"
]);
const C3_MATCH_CONDITION_NAMES = Object.freeze([
  "user", "group", "host", "address", "localaddress", "localport", "rdomain", "localnetwork", "all"
]);
const C3_INCLUDE_ROOT_ONLY_INVALID_NAMES = Object.freeze([
  "dot", "dotdot", "repeated-slash", "trailing-slash", "escape", "wild-parent",
  "double-star", "bracket", "backslash", "brace", "tilde", "percent", "invalid-utf8"
]);
const C3_FORBIDDEN_ALLOCATION_KEYS = Object.freeze([
  "objectCall", "map", "set", "weakMap", "weakSet", "proxy", "bufferConstructor",
  "bufferAllocUnsafe", "bufferConcat", "bufferOf", "regexp", "textEncoder", "textEncode",
  "jsonStringify", "jsonParse"
]);

function c3PayloadOracle(value) {
  const bytes = Buffer.from(value, "ascii");
  return {
    byteLength: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    knownBytes: {
      lang: value === "LANG",
      lcAll: value === "LC_ALL"
    }
  };
}

const C3_VM_HARNESS_SUFFIX = String.raw`
const C3_ROOT = "/etc/ssh/sshd_config";
const C3_BASE = "/etc/ssh";
const C4_SCENARIOS = ["c4-match", "c4-variable", "c4-effective", "c4-topology"];
let c4ScenarioInvocationCount = 0;
let c4AccountReadCount = 0;
let c4InjectedOperationCount = 0;

function c3A1FileOperations(...readStages) {
  return [
    ["lstat", "ancestor-0"],
    ["lstat", "ancestor-1"],
    ["lstat", "ancestor-2"],
    ["lstat", "file-0"],
    ["open", "file-0", "file"],
    ["fstat", "file-0", "pre"],
    ...readStages.map((stage) => ["read", "file-0", stage]),
    ["fstat", "file-0", "post"],
    ["close", "file-0"]
  ];
}

function c4ExpectedTopologyPathOperations(authReadStages = ["body", "eof"]) {
  return [
    ...c3A1FileOperations("body", "eof"),
    ["lstat", "ancestor-0"],
    ["lstat", "ancestor-1"],
    ["lstat", "ancestor-2"],
    ["lstat", "ancestor-3"],
    ["lstat", "file-1"],
    ["open", "file-1", "file"],
    ["fstat", "file-1", "pre"],
    ...authReadStages.map((stage) => ["read", "file-1", stage]),
    ["fstat", "file-1", "post"],
    ["close", "file-1"]
  ];
}

function c3Stat(entry, overrides = {}) {
  const type = overrides.type || entry.type;
  const directory = type === "directory";
  const file = type === "file";
  const typeBits = directory ? 0o040000n : file ? 0o100000n : 0n;
  return {
    uid: BigInt(overrides.uid === undefined ? (entry.uid === undefined ? 0 : entry.uid) : overrides.uid),
    gid: BigInt(overrides.gid === undefined ? (entry.gid === undefined ? 0 : entry.gid) : overrides.gid),
    mode: typeBits | BigInt(overrides.mode === undefined ? entry.mode : overrides.mode),
    nlink: BigInt(overrides.nlink === undefined ? (entry.nlink === undefined ? (directory ? 2 : 1) : entry.nlink) : overrides.nlink),
    dev: BigInt(overrides.dev === undefined ? 7 : overrides.dev),
    ino: BigInt(overrides.ino === undefined ? entry.ino : overrides.ino),
    size: BigInt(overrides.size === undefined ? (directory ? 4096 : entry.bytes.length) : overrides.size),
    isDirectory: () => directory,
    isFile: () => file,
    isSymbolicLink: () => false
  };
}

function c3Environment(fileSpecs, directorySpecs, options = {}) {
  const entries = new nativeMap();
  const ancestors = new nativeMap();
  const directoryValues = new nativeMap();
  const calls = new nativeArray();
  const pathRoles = new nativeMap();
  let ordinal = 100;
  for (let index = 0; index < fileSpecs.length; index += 1) {
    const [path, input, metadata = {}] = fileSpecs[index];
    const bytes = nativeBuffer.isBuffer(input) ? nativeBuffer.from(input) : nativeBuffer.from(input, "utf8");
    const role = "file-" + index;
    pathRoles.set(path, role);
    entries.set(path, {
      type: "file",
      mode: metadata.mode === undefined ? 0o644 : metadata.mode,
      uid: metadata.uid === undefined ? 0 : metadata.uid,
      gid: metadata.gid === undefined ? 0 : metadata.gid,
      nlink: metadata.nlink === undefined ? 1 : metadata.nlink,
      bytes,
      ino: ordinal,
      role
    });
    ordinal += 1;
  }
  for (let index = 0; index < directorySpecs.length; index += 1) {
    const [path, names] = directorySpecs[index];
    const role = "directory-" + index;
    pathRoles.set(path, role);
    entries.set(path, { type: "directory", mode: 0o755, bytes: nativeBuffer.alloc(0), ino: ordinal, role });
    ordinal += 1;
    const values = new nativeArray();
    for (const name of names) values.push(nativeBuffer.from(name, "utf8"));
    directoryValues.set(path, values);
  }
  let ancestorOrdinal = 0;
  function registerAncestor(path) {
    if (entries.has(path) || ancestors.has(path)) return;
    const role = "ancestor-" + ancestorOrdinal;
    ancestorOrdinal += 1;
    const entry = { type: "directory", mode: 0o755, bytes: nativeBuffer.alloc(0), ino: ordinal, role };
    ordinal += 1;
    ancestors.set(path, entry);
    pathRoles.set(path, role);
  }
  registerAncestor("/");
  for (const path of entries.keys()) {
    let current = "";
    const components = path.slice(1).split("/");
    for (let index = 0; index + 1 < components.length; index += 1) {
      current += "/" + components[index];
      registerAncestor(current);
    }
  }
  const fault = options.fault || null;
  const directoryProxyCounters = options.directoryProxyCounters || null;
  function faultMatches(kind, role) {
    return fault && fault.kind === kind
      && (fault.role === undefined || fault.role === role)
      && (fault.verificationOnly !== true || context.__c4AuthorizationVerifyActive === true);
  }
  function operationFailure(defaultCode = "EIO") {
    const error = new Error("synthetic operation failure");
    error.code = fault && typeof fault.code === "string" ? fault.code : defaultCode;
    throw error;
  }
  function entryForPath(path) {
    return entries.get(path) || ancestors.get(path);
  }
  const descriptors = new nativeMap();
  const openedRoles = new nativeSet();
  const successfulOpenCounts = new nativeMap();
  const closeAttemptCounts = new nativeMap();
  const directoryReadCounts = new nativeMap();
  let nextFd = 300;
  const pathOperations = {
    lstat(path) {
      const role = pathRoles.get(path) || "unrecognized-path";
      calls.push(["lstat", role]);
      if (faultMatches("lstat-failure", role)) operationFailure();
      const entry = entryForPath(path);
      if (!entry) operationFailure("ENOENT");
      if (faultMatches("nonregular", role)) return c3Stat(entry, { type: "other" });
      if (faultMatches("stat-override", role)) return c3Stat(entry, fault.overrides || {});
      return c3Stat(entry);
    },
    open(path, flags) {
      const role = pathRoles.get(path) || "unrecognized-path";
      const entry = entries.get(path);
      const kind = entry && entry.type === "directory" ? "directory" : "file";
      calls.push(["open", role, kind]);
      if (faultMatches("open-failure", role)) operationFailure();
      if (!entry || openedRoles.has(role)) operationFailure();
      const expectedFlags = entry.type === "directory" ? 0xB0000 : 0xA0000;
      if (flags !== expectedFlags) operationFailure();
      const fd = nextFd;
      nextFd += 1;
      openedRoles.add(role);
      successfulOpenCounts.set(role, (successfulOpenCounts.get(role) || 0) + 1);
      descriptors.set(fd, {
        entry,
        fstatCount: 0,
        readOffset: 0,
        eofConfirmed: false,
        partialBody: false,
        bodyEintr: false,
        eofEintr: false
      });
      return fd;
    },
    fstat(fd) {
      const descriptor = descriptors.get(fd);
      const role = descriptor ? descriptor.entry.role : "unrecognized-fd";
      const stage = descriptor && descriptor.fstatCount === 0 ? "pre" : "post";
      calls.push(["fstat", role, stage]);
      if (!descriptor || descriptor.fstatCount > 1) operationFailure();
      descriptor.fstatCount += 1;
      if (faultMatches("fstat-failure", role) && fault.stage === stage) operationFailure();
      if (faultMatches("post-fstat-drift", role) && stage === "post") {
        return c3Stat(descriptor.entry, { ino: descriptor.entry.ino + 1 });
      }
      return c3Stat(descriptor.entry);
    },
    read(fd, buffer, offset, length, position) {
      const descriptor = descriptors.get(fd);
      const role = descriptor ? descriptor.entry.role : "unrecognized-fd";
      const entry = descriptor && descriptor.entry;
      c3LifecycleMarkByte(buffer, "rawSource");
      if (entry && entry.bytes) c3LifecycleMarkByte(entry.bytes, "sourceFixture");
      if (!descriptor || entry.type !== "file" || descriptor.fstatCount !== 1 || !nativeBuffer.isBuffer(buffer)) {
        calls.push(["read", role, "invalid"]);
        operationFailure();
      }
      const body = position < entry.bytes.length;
      const stage = body ? "body" : "eof";
      if (body) {
        if (offset !== position || position !== descriptor.readOffset
          || length !== entry.bytes.length - position || buffer.length !== entry.bytes.length) {
          calls.push(["read", role, "invalid"]);
          operationFailure();
        }
        if (faultMatches("body-eintr", role) && !descriptor.bodyEintr) {
          descriptor.bodyEintr = true;
          calls.push(["read", role, "body-eintr"]);
          operationFailure("EINTR");
        }
        if (faultMatches("early-eof", role)) {
          calls.push(["read", role, "body-early-eof"]);
          return 0;
        }
        if (faultMatches("body-invalid-count", role)) {
          calls.push(["read", role, "body-invalid-count"]);
          return length + 1;
        }
        if (faultMatches("read-failure", role)) {
          calls.push(["read", role, "body-failure"]);
          operationFailure();
        }
      } else {
        if (position !== entry.bytes.length || descriptor.readOffset !== entry.bytes.length
          || offset !== 0 || length !== 1 || buffer.length !== 1 || descriptor.eofConfirmed) {
          calls.push(["read", role, "invalid"]);
          operationFailure();
        }
        if (faultMatches("eof-eintr", role) && !descriptor.eofEintr) {
          descriptor.eofEintr = true;
          calls.push(["read", role, "eof-eintr"]);
          operationFailure("EINTR");
        }
        if (faultMatches("trailing-byte", role)) {
          calls.push(["read", role, "eof-trailing-byte"]);
          buffer[0] = 0x78;
          return 1;
        }
        if (faultMatches("eof-invalid-count", role)) {
          calls.push(["read", role, "eof-invalid-count"]);
          return -1;
        }
      }
      calls.push(["read", role, stage]);
      if (!body) {
        descriptor.eofConfirmed = true;
        return 0;
      }
      let count = entry.bytes.length - position;
      if (faultMatches("body-partial", role) && !descriptor.partialBody && count > 1) {
        descriptor.partialBody = true;
        count = Math.max(1, Math.floor(count / 2));
      }
      entry.bytes.copy(buffer, offset, position, position + count);
      descriptor.readOffset += count;
      return count;
    },
    close(fd) {
      const descriptor = descriptors.get(fd);
      const role = descriptor ? descriptor.entry.role : "unrecognized-fd";
      calls.push(["close", role]);
      closeAttemptCounts.set(role, (closeAttemptCounts.get(role) || 0) + 1);
      if (!descriptors.delete(fd)) operationFailure();
      if (faultMatches("close-failure", role)) operationFailure();
    }
  };
  const sourceOperations = {
    readDirectory(path) {
      const role = pathRoles.get(path) || "unrecognized-path";
      const entry = entries.get(path);
      const live = new nativeArray();
      for (const descriptor of descriptors.values()) {
        if (descriptor.entry === entry && descriptor.fstatCount === 1) live.push(descriptor);
      }
      calls.push(["readDirectory", role, live.length === 1 ? "live" : "invalid"]);
      const count = directoryReadCounts.get(role) || 0;
      directoryReadCounts.set(role, count + 1);
      if (!entry || entry.type !== "directory" || live.length !== 1 || count !== 0) operationFailure();
      if (faultMatches("read-directory-failure", role)) operationFailure();
      const values = directoryValues.get(path);
      if (!values) operationFailure();
      for (const value of values) c3LifecycleMarkByte(value, "rawDirectory");
      if (!directoryProxyCounters) return values;
      return new nativeProxy(values, {
        get(target, property, receiver) {
          directoryProxyCounters.get += 1;
          if (property === "length") directoryProxyCounters.getLength += 1;
          else directoryProxyCounters.getOther += 1;
          return Reflect.get(target, property, receiver);
        },
        getOwnPropertyDescriptor(target, property) {
          directoryProxyCounters.getOwnPropertyDescriptor += 1;
          return Reflect.getOwnPropertyDescriptor(target, property);
        },
        getPrototypeOf(target) {
          directoryProxyCounters.getPrototypeOf += 1;
          return Reflect.getPrototypeOf(target);
        },
        ownKeys(target) {
          directoryProxyCounters.ownKeys += 1;
          return Reflect.ownKeys(target);
        }
      });
    },
    validateSudoers() {
      calls.push(["validateSudoers"]);
      operationFailure();
    }
  };
  function fdAudit() {
    const ordered = (counts) => [...counts.entries()].sort(([left], [right]) => left.localeCompare(right));
    return {
      successfulOpens: ordered(successfulOpenCounts),
      closeAttempts: ordered(closeAttemptCounts),
      liveDescriptorCount: descriptors.size
    };
  }
  return { calls, pathOperations, sourceOperations, pathRoles, fdAudit };
}

function c3KnownAscii(value, text) {
  if (value.length !== text.length) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== text.charCodeAt(index)) return false;
  }
  return true;
}

function c3Value(key, value, pathRoles) {
  if (nativeBuffer.isBuffer(value)) {
    return {
      byteLength: value.length,
      sha256: crypto.createHash("sha256").update(value).digest("hex"),
      knownBytes: {
        lang: c3KnownAscii(value, "LANG"),
        lcAll: c3KnownAscii(value, "LC_ALL")
      }
    };
  }
  if (typeof value === "string" && pathRoles.has(value)) return { pathRole: pathRoles.get(value) };
  if (typeof value === "string" && !["kind", "directive", "scope", "name", "schemaVersion", "type"].includes(key)) {
    return { utf8Length: nativeBuffer.byteLength(value, "utf8"), sha256: crypto.createHash("sha256").update(value, "utf8").digest("hex") };
  }
  return value;
}

function c3EventView(event, pathRoles) {
  const keys = nativeObject.getOwnPropertyNames(event);
  const values = {};
  const descriptors = {};
  for (const key of keys) {
    const descriptor = nativeObject.getOwnPropertyDescriptor(event, key);
    descriptors[key] = {
      enumerable: descriptor.enumerable,
      configurable: descriptor.configurable,
      writable: descriptor.writable,
      data: nativeObject.hasOwn(descriptor, "value")
    };
    values[key] = c3Value(key, event[key], pathRoles);
  }
  return {
    keys,
    symbolCount: nativeObject.getOwnPropertySymbols(event).length,
    proxy: types.isProxy(event),
    descriptors,
    nullPrototype: nativeObject.getPrototypeOf(event) === null,
    frozen: nativeObject.isFrozen(event),
    values
  };
}

function c3OwnerView(owner, pathRoles, includeEvents = true) {
  const ownerKeys = nativeObject.getOwnPropertyNames(owner);
  const closureKeys = nativeObject.getOwnPropertyNames(owner.closure);
  const files = owner.closure.files.map((file) => ({
    keys: nativeObject.getOwnPropertyNames(file),
    symbolCount: nativeObject.getOwnPropertySymbols(file).length,
    proxy: types.isProxy(file),
    nullPrototype: nativeObject.getPrototypeOf(file) === null,
    frozen: nativeObject.isFrozen(file),
    ordinal: file.ordinal,
    pathRole: pathRoles.get(file.path) || "unrecognized-path",
    sha256: file.sha256,
    uid: file.uid,
    gid: file.gid,
    mode: file.mode,
    nlink: file.nlink
  }));
  const canonicalBytes = nativeBuffer.from(nativeJSON.stringify(owner.closure) + "\n", "utf8");
  const canonicalSha256 = crypto.createHash("sha256").update(canonicalBytes).digest("hex");
  canonicalBytes.fill(0);
  return {
    ownerKeys,
    ownerSymbolCount: nativeObject.getOwnPropertySymbols(owner).length,
    ownerProxy: types.isProxy(owner),
    ownerNullPrototype: nativeObject.getPrototypeOf(owner) === null,
    closureKeys,
    closureSymbolCount: nativeObject.getOwnPropertySymbols(owner.closure).length,
    closureProxy: types.isProxy(owner.closure),
    closureNullPrototype: nativeObject.getPrototypeOf(owner.closure) === null,
    closureFrozen: nativeObject.isFrozen(owner.closure),
    schemaVersion: owner.closure.schemaVersion,
    type: owner.closure.type,
    rootConfigRole: pathRoles.get(owner.closure.rootConfig) || "unrecognized-path",
    files,
    closureSha256: owner.closureSha256,
    canonicalSha256,
    eventCount: owner.events.length,
    events: includeEvents ? owner.events.map((event) => c3EventView(event, pathRoles)) : [],
    activePathRoles: owner.activePaths.map((path) => pathRoles.get(path) || "unrecognized-path"),
    disposed: owner.disposed
  };
}

function c3TrackedSummary(arrays, buffers) {
  return {
    arrays: arrays.map((value) => ({ length: value.length, native: nativeArray.isArray(value), prototype: nativeObject.getPrototypeOf(value) === nativeArray.prototype })),
    buffers: buffers.map((value) => ({ length: value.length, zero: value.every((byte) => byte === 0) }))
  };
}

function c3LifecycleSummary(tracker) {
  if (!tracker) return null;
  return {
    bytes: tracker.byteEntries.map((record) => ({
      id: record.id,
      creationKind: record.creationKind,
      roles: [...record.roles].sort(),
      length: record.value.length,
      zero: record.value.every((byte) => byte === 0),
      allocationOrdinal: record.allocationOrdinal === undefined ? null : record.allocationOrdinal,
      allocationAction: record.allocationAction === undefined ? null : record.allocationAction,
      attachedOrdinal: record.attachedOrdinal === undefined ? null : record.attachedOrdinal,
      eventOrdinal: record.eventOrdinal === undefined ? null : record.eventOrdinal,
      fills: record.fills.map((fill) => ({ ...fill }))
    })),
    arrays: tracker.arrayEntries.map((record) => ({
      id: record.id,
      role: record.role,
      length: record.value.length,
      native: nativeArray.isArray(record.value),
      prototype: nativeObject.getPrototypeOf(record.value) === nativeArray.prototype
    })),
    phases: tracker.phases.map((phase) => ({
      name: phase.name,
      allocations: phase.allocationOrdinal,
      allocationKinds: { ...phase.allocationKinds },
      hashes: phase.hashOrdinal,
      hashActions: phase.hashes.map((entry) => ({
        ordinal: entry.ordinal,
        action: entry.action,
        operationCalls: entry.operationCalls,
        projectionFreezes: entry.projectionFreezes,
        ...(entry.publicStage === undefined ? {} : { publicStage: entry.publicStage }),
        updateByteIds: [...entry.updateByteIds],
        updateActions: [...entry.updateActions],
        updateLengths: [...entry.updateLengths],
        updateSha256s: [...entry.updateSha256s]
      })),
      objectAllocations: phase.objectAllocationEntries.map((entry) => ({
        ordinal: entry.ordinal,
        classification: entry.classification
      })),
      allocationActions: phase.allocationActions.map((entry) => ({ ...entry })),
      byteAllocationActions: phase.byteAllocationActions.map((entry) => ({ ...entry })),
      fixedAllocations: phase.fixedAllocations.map((entry) => ({ ...entry })),
      fixedReserves: phase.fixedReserves.map((entry) => ({ ...entry })),
      fixedCompletions: phase.fixedCompletions.map((entry) => ({ ...entry })),
      roleAllocations: phase.roleAllocations.map((entry) => ({ ...entry })),
      roleFills: phase.roleFills.map((entry) => ({ ...entry })),
      preimageReserves: phase.preimageReserves.map((entry) => ({ ...entry })),
      work: {
        attempts: phase.workAttemptCount,
        reservations: phase.workReservationCount,
        completions: phase.workCompletionCount,
        throws: phase.workThrowCount,
        inFlight: phase.workInFlight,
        orderingValid: phase.workOrderingValid,
        lastAttemptStamp: phase.lastWorkAttemptStamp === null ? null : { ...phase.lastWorkAttemptStamp },
        lastCompletionStamp: phase.lastWorkCompletionStamp === null ? null : { ...phase.lastWorkCompletionStamp }
      },
      matcher: {
        attempts: phase.matcherAttemptCount,
        completions: phase.matcherCompletionCount,
        throws: phase.matcherThrowCount,
        inFlight: phase.matcherInFlight,
        orderingValid: phase.matcherOrderingValid
      },
      ...(phase.captureMatcherLedger ? {
        matcherLedger: phase.matcherLedger.map((entry) => ({ ...entry }))
      } : {}),
      preimagePendingCount: phase.preimagePendingCount,
      retentions: phase.retentions.map((entry) => ({
        role: entry.role,
        reserveOrdinal: entry.reserveOrdinal,
        reserveStamp: { ...entry.reserveStamp },
        allocationKinds: [...entry.allocationKinds],
        objectCreateOrdinals: [...entry.objectCreateOrdinals],
        objectCreateActions: [...entry.objectCreateActions],
        byteAllocationOrdinals: [...entry.byteAllocationOrdinals],
        byteAllocationActions: [...entry.byteAllocationActions],
        copyOrdinals: [...entry.copyOrdinals],
        copyActions: [...entry.copyActions],
        objectCreateCount: entry.objectCreateCount,
        objectIdentityMatches: entry.objectIdentityMatches,
        pushOrdinal: entry.pushOrdinal,
        pushAction: entry.pushAction,
        pushOperationCalls: entry.pushOperationCalls,
        eventOrdinal: entry.eventOrdinal
      })),
      fills: phase.fills.map((fill) => ({ ...fill })),
      copies: phase.copies.map((copy) => ({ ...copy })),
      pushes: phase.pushes.map((push) => ({
        ordinal: push.ordinal,
        arrayRole: push.arrayRole,
        valueCount: push.valueCount,
        eventKind: push.eventKind,
        eventDirective: push.eventDirective,
        eventKeys: push.eventKeys === null ? null : [...push.eventKeys],
        eventSymbolCount: push.eventSymbolCount,
        eventProxy: push.eventProxy,
        eventNullPrototype: push.eventNullPrototype,
        eventFrozen: push.eventFrozen,
        eventOrdinal: push.eventOrdinal,
        eventSourceOrdinal: push.eventSourceOrdinal,
        eventLineNumber: push.eventLineNumber,
        eventScope: push.eventScope,
        eventBranchOrdinal: push.eventBranchOrdinal,
        eventDescriptorsExact: push.eventDescriptorsExact,
        bufferIds: [...push.bufferIds]
      })),
      faultTriggered: phase.faultTriggered,
      faultTriggerCount: phase.faultTriggerCount,
      faultStamp: phase.faultStamp === null ? null : { ...phase.faultStamp },
      progress: c3LifecycleProgressStamp(phase),
      registry: phase.registry.map((entry) => ({
        method: entry.method,
        keyShape: entry.keyShape,
        ...(entry.keyIdentity === null ? {} : { keyIdentity: entry.keyIdentity }),
        sameGraph: entry.sameGraph,
        ...(entry.c4Audit ? {
          ordinal: entry.ordinal,
          provenanceRegistry: entry.provenanceRegistry,
          graphFailed: entry.graphFailed,
          snapshotFailed: entry.snapshotFailed,
          authorizationEntryCount: entry.authorizationEntryCount
        } : {}),
        ...(entry.result === undefined ? {} : { result: entry.result }),
        ...(entry.ownerComplete === undefined ? {} : { ownerComplete: entry.ownerComplete }),
        ...(entry.stamp === undefined ? {} : { stamp: { ...entry.stamp } })
      })),
      byteState: phase.byteState.map((entry) => ({ id: entry.id, roles: [...entry.roles], zero: entry.zero })),
      arrayState: phase.arrayState.map((entry) => ({ ...entry })),
      objectState: { roles: [...phase.objectState.roles], ownerLinksClosure: phase.objectState.ownerLinksClosure },
      rawDirectory: { ...phase.rawDirectoryState },
      finalStamp: { ...phase.finalStamp }
    }))
  };
}

function c3LifecyclePhase(tracker, name, graph, calls, operation, fault = null) {
  context.__c3LifecycleSignal = c3LifecycleSignal;
  c3LifecycleBegin(tracker, name, graph, () => calls.length, fault);
  try {
    return operation();
  } finally {
    try {
      c3LifecycleEnd();
    } finally {
      delete context.__c3LifecycleSignal;
    }
  }
}

function c3Run(fileSpecs, directorySpecs = [], options = {}) {
  const state = fresh();
  const environment = c3Environment(fileSpecs, directorySpecs, options.operations || {});
  const lifecycleTracker = options.lifecycle === true ? c3CreateLifecycleTracker() : null;
  const before = inspect(state);
  const shapeBefore = api.__test_c2bFixedShape(state);
  const trace = new nativeArray();
  const trackedArrays = new nativeArray();
  const trackedBuffers = new nativeArray();
  globalThis.__c3AllocationTrace = trace;
  globalThis.__c3TrackedArrays = trackedArrays;
  globalThis.__c3TrackedBuffers = trackedBuffers;
  globalThis.__c3BufferCompareCount = 0;
  context.__c3AllocationTrace = trace;
  let attachedBufferIds = new nativeArray();
  const deriveOperation = () => {
    const result = withAllocations(() => safe(() => api.__test_deriveAuthorizationSshSyntax(
      state.ssh,
      environment.pathOperations,
      environment.sourceOperations
    )));
    if (result.value.ok) attachedBufferIds = c3LifecycleMarkOwner(result.value.value);
    return result;
  };
  const derived = lifecycleTracker
    ? c3LifecyclePhase(lifecycleTracker, "derive", state.ssh, environment.calls, deriveOperation, options.deriveFault || null)
    : deriveOperation();
  const compareCount = globalThis.__c3BufferCompareCount;
  const afterDerive = inspect(state);
  const shapeAfterDerive = api.__test_c2bFixedShape(state);
  let owner = null;
  let ownerBeforeDispose = null;
  let dispose = null;
  let ownerAfterDispose = null;
  let secondDerive = null;
  let secondDeriveCalls = null;
  let terminalSecondDerive = null;
  let terminalSecondDeriveCalls = null;
  let terminalSecondDeriveAllocations = null;
  let disposeAllocations = null;
  if (derived.value.ok) {
    owner = derived.value.value;
    ownerBeforeDispose = c3OwnerView(owner, environment.pathRoles, options.includeEvents !== false);
    if (options.secondDerive === true) {
      const secondEnvironment = c3Environment(fileSpecs, directorySpecs);
      secondDerive = safe(() => api.__test_deriveAuthorizationSshSyntax(
        state.ssh,
        secondEnvironment.pathOperations,
        secondEnvironment.sourceOperations
      ));
      secondDeriveCalls = secondEnvironment.calls.slice();
    }
    if (options.dispose !== false) {
      const bufferWitnesses = trackedBuffers.slice();
      const closureReference = owner.closure;
      const disposeOperation = () => withAllocations(() => safe(() => api.__test_disposeAuthorizationSshSyntax(state.ssh, owner)));
      const disposed = lifecycleTracker
        ? c3LifecyclePhase(lifecycleTracker, "dispose", state.ssh, environment.calls, disposeOperation, options.disposeFault || null)
        : disposeOperation();
      dispose = disposed.value;
      disposeAllocations = disposed.counts;
      ownerAfterDispose = {
        disposed: owner.disposed,
        closureReferenceDropped: owner.closure !== closureReference,
        fileLength: closureReference.files.length,
        eventLength: owner.events.length,
        activeLength: owner.activePaths.length,
        allBuffersZero: bufferWitnesses.every((buffer) => buffer.every((byte) => byte === 0))
      };
      if (!dispose.ok && options.terminalAfterDispose === true) {
        const terminalEnvironment = c3Environment(fileSpecs, directorySpecs);
        const terminalOperation = () => withAllocations(() => safe(() => api.__test_deriveAuthorizationSshSyntax(
          state.ssh,
          terminalEnvironment.pathOperations,
          terminalEnvironment.sourceOperations
        )));
        const terminal = lifecycleTracker
          ? c3LifecyclePhase(lifecycleTracker, "terminalAfterDispose", state.ssh, terminalEnvironment.calls, terminalOperation)
          : terminalOperation();
        terminalSecondDerive = terminal.value;
        terminalSecondDeriveAllocations = terminal.counts;
        terminalSecondDeriveCalls = terminalEnvironment.calls.slice();
      }
    }
  } else if (options.terminalSecondCall === true) {
    const terminalEnvironment = c3Environment(fileSpecs, directorySpecs);
    const terminalOperation = () => withAllocations(() => safe(() => api.__test_deriveAuthorizationSshSyntax(
      state.ssh,
      terminalEnvironment.pathOperations,
      terminalEnvironment.sourceOperations
    )));
    const terminal = lifecycleTracker
      ? c3LifecyclePhase(lifecycleTracker, "terminal", state.ssh, terminalEnvironment.calls, terminalOperation)
      : terminalOperation();
    terminalSecondDerive = terminal.value;
    terminalSecondDeriveAllocations = terminal.counts;
    terminalSecondDeriveCalls = terminalEnvironment.calls.slice();
  }
  const after = inspect(state);
  const tracked = c3TrackedSummary(trackedArrays, trackedBuffers);
  delete globalThis.__c3AllocationTrace;
  delete globalThis.__c3TrackedArrays;
  delete globalThis.__c3TrackedBuffers;
  delete globalThis.__c3BufferCompareCount;
  delete context.__c3AllocationTrace;
  return {
    outcome: derived.value.ok ? { ok: true } : derived.value,
    before,
    shapeBefore,
    afterDerive,
    shapeAfterDerive,
    after,
    allocations: derived.counts,
    trace,
    compareCount,
    calls: environment.calls,
    ownerBeforeDispose,
    dispose,
    disposeAllocations,
    ownerAfterDispose,
    tracked,
    lifecycle: c3LifecycleSummary(lifecycleTracker),
    attachedBufferIds,
    secondDerive,
    secondDeriveCalls,
    terminalSecondDerive,
    terminalSecondDeriveAllocations,
    terminalSecondDeriveCalls
  };
}

function c3MeasuredAllocationCount(counts) {
  let total = 0;
  for (const name of nativeObject.keys(counts)) {
    if (name !== "createHash") total += counts[name];
  }
  return total;
}

function c3ForwardingOperationProxy(target, counters) {
  return new nativeProxy(target, {
    getOwnPropertyDescriptor(value, property) {
      counters.getOwnPropertyDescriptor += 1;
      return Reflect.getOwnPropertyDescriptor(value, property);
    },
    getPrototypeOf(value) {
      counters.getPrototypeOf += 1;
      return Reflect.getPrototypeOf(value);
    },
    ownKeys(value) {
      counters.ownKeys += 1;
      return Reflect.ownKeys(value);
    }
  });
}

function c3TrapTotal(counters) {
  return counters.getOwnPropertyDescriptor + counters.getPrototypeOf + counters.ownKeys;
}

function c3FreshBeforeReflectionScenario() {
  const state = fresh();
  api.__test_reserveAuthorizationFixedEnvelope(state.ssh);
  const environment = c3Environment([[C3_ROOT, "Banner unreachable\n"]], []);
  const pathCounters = { getOwnPropertyDescriptor: 0, getPrototypeOf: 0, ownKeys: 0 };
  const sourceCounters = { getOwnPropertyDescriptor: 0, getPrototypeOf: 0, ownKeys: 0 };
  const pathProxy = c3ForwardingOperationProxy(environment.pathOperations, pathCounters);
  const sourceProxy = c3ForwardingOperationProxy(environment.sourceOperations, sourceCounters);
  const tracker = c3CreateLifecycleTracker();
  const firstExecution = c3LifecyclePhase(tracker, "formalNonfresh", state.ssh, environment.calls,
    () => withAllocations(() => safe(() => api.__test_deriveAuthorizationSshSyntax(
      state.ssh, pathProxy, sourceProxy
    ))));
  const firstCalls = environment.calls.slice();
  const firstPathTrapTotal = c3TrapTotal(pathCounters);
  const firstSourceTrapTotal = c3TrapTotal(sourceCounters);
  const afterFirst = inspect(state);
  const terminalExecution = c3LifecyclePhase(tracker, "formalTerminal", state.ssh, environment.calls,
    () => withAllocations(() => safe(() => api.__test_deriveAuthorizationSshSyntax(
      state.ssh, pathProxy, sourceProxy
    ))));
  const terminalCalls = environment.calls.slice(firstCalls.length);
  const terminalPathTrapTotal = c3TrapTotal(pathCounters) - firstPathTrapTotal;
  const terminalSourceTrapTotal = c3TrapTotal(sourceCounters) - firstSourceTrapTotal;
  return {
    first: {
      outcome: firstExecution.value,
      pathTrapTotal: firstPathTrapTotal,
      sourceTrapTotal: firstSourceTrapTotal,
      allocationCount: c3MeasuredAllocationCount(firstExecution.counts),
      hashCount: firstExecution.counts.createHash,
      copyCount: tracker.phases[0].copies.length,
      pushCount: tracker.phases[0].pushes.length,
      pathOperationCalls: firstCalls.filter(([name]) => ["lstat", "open", "fstat", "read", "close"].includes(name)).length,
      sourceOperationCalls: firstCalls.filter(([name]) => ["readDirectory", "validateSudoers"].includes(name)).length,
      graphTerminal: afterFirst.ssh.failed,
      snapshotTerminal: afterFirst.snapshot.failed
    },
    terminal: {
      outcome: terminalExecution.value,
      pathTrapTotal: terminalPathTrapTotal,
      sourceTrapTotal: terminalSourceTrapTotal,
      allocationCount: c3MeasuredAllocationCount(terminalExecution.counts),
      hashCount: terminalExecution.counts.createHash,
      copyCount: tracker.phases[1].copies.length,
      pushCount: tracker.phases[1].pushes.length,
      pathOperationCalls: terminalCalls.filter(([name]) => ["lstat", "open", "fstat", "read", "close"].includes(name)).length,
      sourceOperationCalls: terminalCalls.filter(([name]) => ["readDirectory", "validateSudoers"].includes(name)).length
    }
  };
}

function c3A1FileRun(fault, terminalSecondCall = false) {
  return c3Run([[C3_ROOT, "Banner operation\n"]], [], {
    includeEvents: false,
    terminalSecondCall,
    operations: fault ? { fault } : {}
  });
}

function c3A1DirectoryRun(fault, terminalSecondCall = false) {
  return c3Run([
    [C3_ROOT, "Include conf.d/selected*.conf\n"],
    ["/etc/ssh/conf.d/selected.conf", "Banner selected\n"]
  ], [["/etc/ssh/conf.d", ["ignored.txt", "selected.conf"]]], {
    includeEvents: false,
    terminalSecondCall,
    operations: fault ? { fault } : {}
  });
}

function c3OwnerIsolationSnapshot(owner) {
  const closure = owner.closure;
  const files = closure.files;
  const events = owner.events;
  const activePaths = owner.activePaths;
  const buffers = new nativeArray();
  for (const event of events) {
    for (const name of nativeObject.getOwnPropertyNames(event)) {
      const descriptor = nativeObject.getOwnPropertyDescriptor(event, name);
      if (descriptor && nativeObject.hasOwn(descriptor, "value") && nativeBuffer.isBuffer(descriptor.value)) {
        const value = descriptor.value;
        Reflect.apply(nativeArrayPush, buffers, [{
          value,
          length: value.length,
          nonzero: value.reduce((count, byte) => count + (byte === 0 ? 0 : 1), 0),
          sha256: crypto.createHash("sha256").update(value).digest("hex")
        }]);
      }
    }
  }
  return {
    owner, closure, files, events, activePaths, buffers,
    disposed: owner.disposed,
    fileLength: files.length,
    eventLength: events.length,
    activeLength: activePaths.length
  };
}

function c3OwnerIsolationComparison(snapshot) {
  const current = c3OwnerIsolationSnapshot(snapshot.owner);
  return {
    ownerIdentity: current.owner === snapshot.owner,
    closureIdentity: current.closure === snapshot.closure,
    filesIdentity: current.files === snapshot.files,
    eventsIdentity: current.events === snapshot.events,
    activePathsIdentity: current.activePaths === snapshot.activePaths,
    disposedUnchanged: current.disposed === snapshot.disposed,
    fileLengthUnchanged: current.fileLength === snapshot.fileLength,
    eventLengthUnchanged: current.eventLength === snapshot.eventLength,
    activeLengthUnchanged: current.activeLength === snapshot.activeLength,
    bufferCount: current.buffers.length,
    bufferCountUnchanged: current.buffers.length === snapshot.buffers.length,
    bufferIdentitiesUnchanged: current.buffers.length === snapshot.buffers.length
      && current.buffers.every((entry, index) => entry.value === snapshot.buffers[index].value),
    bufferLengthsUnchanged: current.buffers.length === snapshot.buffers.length
      && current.buffers.every((entry, index) => entry.length === snapshot.buffers[index].length),
    bufferNonzeroUnchanged: current.buffers.length === snapshot.buffers.length
      && current.buffers.every((entry, index) => entry.nonzero === snapshot.buffers[index].nonzero),
    bufferBytesUnchanged: current.buffers.length === snapshot.buffers.length
      && current.buffers.every((entry, index) => entry.sha256 === snapshot.buffers[index].sha256)
  };
}

function c3RegistryLifecycleScenario() {
  const tracker = c3CreateLifecycleTracker();

  function derive(name, source, existingState) {
    const state = existingState || fresh();
    const environment = c3Environment([[C3_ROOT, source]], []);
    let attached = new nativeArray();
    const execution = c3LifecyclePhase(tracker, name, state.ssh, environment.calls, () => {
      const result = withAllocations(() => safe(() => api.__test_deriveAuthorizationSshSyntax(
        state.ssh, environment.pathOperations, environment.sourceOperations
      )));
      if (result.value.ok) attached = c3LifecycleMarkOwner(result.value.value);
      return result;
    });
    return {
      state,
      owner: execution.value.ok ? execution.value.value : null,
      outcome: execution.value.ok ? { ok: true } : execution.value,
      allocations: execution.counts,
      calls: environment.calls.slice(),
      attached
    };
  }

  function dispose(name, state, owner) {
    const calls = new nativeArray();
    const execution = c3LifecyclePhase(tracker, name, state.ssh, calls,
      () => withAllocations(() => safe(() => api.__test_disposeAuthorizationSshSyntax(state.ssh, owner))));
    return { outcome: execution.value.ok ? { ok: true } : execution.value, allocations: execution.counts };
  }

  const failed = derive("failedDerive", "UnknownDirective opaque\n");
  const a = derive("deriveA", "AcceptEnv LANG\n");
  const b = derive("deriveB", "Match User alice Group ops\n");
  const aIsolationBefore = c3OwnerIsolationSnapshot(a.owner);
  const bIsolationBefore = c3OwnerIsolationSnapshot(b.owner);
  const bClosure = b.owner.closure;
  const bFiles = bClosure.files;
  const bEvents = b.owner.events;
  const bActivePaths = b.owner.activePaths;
  const bLengths = [bFiles.length, bEvents.length, bActivePaths.length];
  const foreign = dispose("foreignDispose", b.state, a.owner);
  const foreignOwnerIsolation = c3OwnerIsolationComparison(aIsolationBefore);
  const liveOwnerIsolation = c3OwnerIsolationComparison(bIsolationBefore);
  const foreignOwnerStateHealthy = !a.state.snapshot.failed && !a.state.ssh.failed;
  const terminal = derive("terminalFollowup", "AcceptEnv LANG\n", b.state);
  const terminalUnchanged = b.owner.closure === bClosure
    && bClosure.files === bFiles && b.owner.events === bEvents && b.owner.activePaths === bActivePaths
    && bFiles.length === bLengths[0] && bEvents.length === bLengths[1] && bActivePaths.length === bLengths[2];
  const disposeA = dispose("disposeA", a.state, a.owner);
  const disposeACleanup = {
    disposed: a.owner.disposed,
    closureDropped: a.owner.closure !== aIsolationBefore.closure,
    filesCleared: aIsolationBefore.files.length === 0,
    eventsCleared: aIsolationBefore.events.length === 0,
    activePathsCleared: aIsolationBefore.activePaths.length === 0,
    buffersZero: aIsolationBefore.buffers.every((entry) => entry.value.every((byte) => byte === 0))
  };
  const disposeB = dispose("disposeB", b.state, b.owner);

  const c = derive("deriveC", "AcceptEnv LC_ALL\n");
  const snapshotAsOwner = dispose("snapshotAsOwner", c.state, c.state.snapshot);
  const disposeC = dispose("disposeC", c.state, c.owner);

  const d = derive("deriveD", "Match User delta\n");
  const e = derive("deriveE", "Match Group echo\n");
  const eIsolationBefore = c3OwnerIsolationSnapshot(e.owner);
  const disposeD = dispose("disposeD", d.state, d.owner);
  const reuseD = dispose("reuseD", d.state, d.owner);
  const reuseLiveOwnerIsolation = c3OwnerIsolationComparison(eIsolationBefore);
  const reuseLiveOwnerStateHealthy = !e.state.snapshot.failed && !e.state.ssh.failed;
  const disposeE = dispose("disposeE", e.state, e.owner);

  return {
    failed: { outcome: failed.outcome, terminal: failed.state.snapshot.failed && failed.state.ssh.failed },
    foreign: {
      outcome: foreign.outcome,
      terminal: b.state.snapshot.failed && b.state.ssh.failed,
      foreignOwnerStateHealthy,
      foreignOwnerIsolation,
      liveOwnerIsolation,
      disposeACleanup
    },
    terminal: {
      outcome: terminal.outcome,
      allocations: terminal.allocations,
      calls: terminal.calls,
      unchanged: terminalUnchanged
    },
    snapshotAsOwner: { outcome: snapshotAsOwner.outcome },
    reuse: { outcome: reuseD.outcome, reuseLiveOwnerIsolation, reuseLiveOwnerStateHealthy },
    correctDisposals: [disposeA.outcome, disposeB.outcome, disposeC.outcome, disposeD.outcome, disposeE.outcome],
    lifecycle: c3LifecycleSummary(tracker)
  };
}

function c3LifecycleScenario() {
  const success = c3Run([
    [C3_ROOT, "Include conf.d/*.conf\nMatch User alice Group ops\nAcceptEnv LANG LC_ALL\n"],
    ["/etc/ssh/conf.d/selected.conf", "Banner selected\n"]
  ], [["/etc/ssh/conf.d", ["ignored.txt", "selected.conf"]]], { lifecycle: true });
  const failure = c3Run([[C3_ROOT, "AcceptEnv LANG\nMatch User abc,abc\n"]], [], {
    lifecycle: true,
    includeEvents: false,
    terminalSecondCall: true
  });
  const fixedAllocationFailures = ["owner", "closure", "files", "events", "activePaths"].map((role, index) => ({
    role,
    result: c3Run([[C3_ROOT, "AcceptEnv LANG\n"]], [], {
      lifecycle: true,
      includeEvents: false,
      terminalSecondCall: true,
      deriveFault: { kind: "fixedAllocation", role, ordinal: index + 1 }
    })
  }));
  const hashFailure = c3Run([[C3_ROOT, "AcceptEnv LANG\n"]], [], {
    lifecycle: true,
    includeEvents: false,
    terminalSecondCall: true,
    deriveFault: { kind: "hash", ordinal: 2 }
  });
  const preimageAllocationFailure = c3Run([[C3_ROOT, "AcceptEnv LANG LC_ALL\n"]], [], {
    lifecycle: true,
    includeEvents: false,
    terminalSecondCall: true,
    deriveFault: { kind: "allocationRole", role: "preimage", ordinal: 1 }
  });
  const preimageFillFailure = c3Run([[C3_ROOT, "AcceptEnv LANG LC_ALL\n"]], [], {
    lifecycle: true,
    includeEvents: false,
    terminalSecondCall: true,
    deriveFault: { kind: "fillRole", role: "preimage", ordinal: 1 }
  });
  const disposeFailure = c3Run([[C3_ROOT, "Match User alice Group ops\nAcceptEnv LANG LC_ALL\n"]], [], {
    lifecycle: true,
    includeEvents: false,
    disposeFault: { kind: "fill", ordinal: 1 },
    terminalAfterDispose: true
  });
  const cycleFailure = c3Run([[C3_ROOT, "Include sshd_config\n"]], [], {
    lifecycle: true,
    includeEvents: true,
    terminalSecondCall: true
  });
  const seenFailure = c3Run([
    [C3_ROOT, "Include child.conf child.conf\n"],
    ["/etc/ssh/child.conf", "Banner child\n"]
  ], [], {
    lifecycle: true,
    includeEvents: true,
    terminalSecondCall: true
  });
  return {
    moduleWeakMapCount: moduleAllocationCounts.weakMap,
    success,
    failure,
    fixedAllocationFailures,
    hashFailure,
    preimageAllocationFailure,
    preimageFillFailure,
    disposeFailure,
    cycleFailure,
    seenFailure,
    registry: c3RegistryLifecycleScenario(),
    prototypesRestored: nativeArray.prototype.push === nativeArrayPush
      && nativeBuffer.prototype.fill === nativeBufferFill
      && nativeBuffer.prototype.copy === nativeBufferCopy
      && nativeUint8Array.prototype.fill === nativeUint8ArrayFill
  };
}

function c3DepthScenario() {
  const root = [
    "# root comment",
    "Include conf.d/*.conf literal.conf",
    "PubkeyAuthentication yes",
    "Match all",
    "PasswordAuthentication no",
    ""
  ].join("\n");
  const files = [
    [C3_ROOT, root],
    ["/etc/ssh/conf.d/10-child.conf", "AuthenticationMethods publickey\nInclude nested.conf\n"],
    ["/etc/ssh/nested.conf", "DisableForwarding yes\n"],
    ["/etc/ssh/conf.d/20-child.conf", "AuthorizedKeysFile /etc/ssh/authorized_keys/gccgw-japan-repair-ci\n"],
    ["/etc/ssh/literal.conf", "PermitTunnel no\n"]
  ];
  const directories = [["/etc/ssh/conf.d", ["20-child.conf", ".hidden.conf", "10-child.conf"]]];
  const success = c3Run(files, directories, { secondDerive: true });
  const failure = c3Run([[C3_ROOT, "UnknownDirective secret-value\n"]]);
  const operationSuccess = c3A1FileRun();
  const operationFailures = [
    ["lstat", { kind: "lstat-failure", role: "file-0", code: "EINTR" }],
    ["nonregular", { kind: "nonregular", role: "file-0" }],
    ["open", { kind: "open-failure", role: "file-0", code: "EINTR" }]
  ].map(([name, fault]) => ({ name, result: c3A1FileRun(fault, true) }));
  const formalNulRetention = c3Run([[C3_ROOT, nativeBuffer.from([0x00])]], [], {
    lifecycle: true,
    includeEvents: false,
    terminalSecondCall: true
  });
  return { success, failure, operationSuccess, operationFailures, formalNulRetention, lifecycle: c3LifecycleScenario() };
}

function c3CoordinateScenario() {
  const coordinate = c3Run([
    [C3_ROOT, "Include child.conf\nMatch User later\nPasswordAuthentication no\n"],
    ["/etc/ssh/child.conf", "\n# line two\n\n\nMatch Group ops\nPubkeyAuthentication yes\n"]
  ]);
  const duplicateCases = [
    ["negation", "Match User a,!a\n", true, 0],
    ["length", "Match User a,bb\n", true, 0],
    ["first-byte", "Match User a,b\n", true, 1],
    ["later-byte", "Match User abc,abd\n", true, 3],
    ["duplicate", "Match User abc,abc\n", false, 3]
  ].map(([name, source, ok, aligned]) => ({ name, ok, aligned, result: c3Run([[C3_ROOT, source]], [], { includeEvents: false }) }));

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
  const lines = new nativeArray();
  const common62 = "a".repeat(62);
  for (let line = 0; line < 132; line += 1) {
    const patterns = new nativeArray();
    for (let index = 0; index < 64; index += 1) patterns.push(common62 + alphabet[index]);
    lines.push("Match User " + patterns.join(","));
  }
  const common63 = "b".repeat(63);
  const tail = new nativeArray();
  for (let index = 0; index < 20; index += 1) tail.push(common63 + alphabet[index]);
  lines.push("Match User " + tail.join(","));
  const exactAlignedSource = lines.join("\n") + "\n";
  const alignedMaximum = c3Run([[C3_ROOT, exactAlignedSource]], [], { includeEvents: false });
  const alignedOverflow = c3Run([[C3_ROOT, exactAlignedSource + "Match User aa,ab\n"]], [], { includeEvents: false });

  const branchesMaximum = c3Run([[C3_ROOT, "Match all\n".repeat(4096)]], [], { includeEvents: false });
  const branchesOverflow = c3Run([[C3_ROOT, "Match all\n".repeat(4097)]], [], { includeEvents: false });
  const patternValues = alphabet.split("").map((value) => "p" + value);
  const patternsMaximum = c3Run([[C3_ROOT, "Match User " + patternValues.join(",") + "\n"]], [], { includeEvents: false });
  const patternsOverflow = c3Run([[C3_ROOT, "Match User " + patternValues.concat(["overflow"]).join(",") + "\n"]], [], { includeEvents: false });
  const valueMaximum = c3Run([[C3_ROOT, "Match User " + "v".repeat(255) + "\n"]], [], { includeEvents: false });
  const valueOverflow = c3Run([[C3_ROOT, "Match User " + "v".repeat(256) + "\n"]], [], { includeEvents: false });
  const negatedMaximum = c3Run([[C3_ROOT, "Match User !" + "v".repeat(255) + "\n"]], [], { includeEvents: false });
  const negatedOverflow = c3Run([[C3_ROOT, "Match User !" + "v".repeat(256) + "\n"]], [], { includeEvents: false });
  const readEintr = [
    ["body", { kind: "body-eintr", role: "file-0" }],
    ["eof", { kind: "eof-eintr", role: "file-0" }]
  ].map(([name, fault]) => ({ name, result: c3A1FileRun(fault) }));
  const readFailures = [
    ["early-eof", { kind: "early-eof", role: "file-0" }],
    ["trailing-byte", { kind: "trailing-byte", role: "file-0" }],
    ["body-invalid-count", { kind: "body-invalid-count", role: "file-0" }],
    ["eof-invalid-count", { kind: "eof-invalid-count", role: "file-0" }]
  ].map(([name, fault]) => ({ name, result: c3A1FileRun(fault, true) }));
  return {
    coordinate,
    duplicateCases,
    alignedMaximum,
    alignedOverflow,
    branchesMaximum,
    branchesOverflow,
    patternsMaximum,
    patternsOverflow,
    valueMaximum,
    valueOverflow,
    negatedMaximum,
    negatedOverflow,
    readEintr,
    readFailures,
    conditionCalculator: {
      maximum: api.__test_nextAuthorizationBudgetValue(8, 1, 9),
      overflow: safe(() => api.__test_nextAuthorizationBudgetValue(9, 1, 9))
    },
    formalFreshBeforeReflection: c3FreshBeforeReflectionScenario()
  };
}

function c3ChainFiles(count) {
  const files = new nativeArray();
  for (let index = 0; index < count; index += 1) {
    const path = index === 0 ? C3_ROOT : C3_BASE + "/depth-" + index + ".conf";
    const next = index + 1 < count ? "Include depth-" + (index + 1) + ".conf\n" : "Banner done\n";
    files.push([path, next]);
  }
  return files;
}

function c3ManyIncludedFiles(childCount) {
  const files = new nativeArray();
  const rootLines = new nativeArray();
  for (let offset = 0; offset < childCount; offset += 64) {
    const names = new nativeArray();
    for (let index = offset; index < Math.min(childCount, offset + 64); index += 1) {
      const name = "file-" + index + ".conf";
      names.push(name);
      files.push([C3_BASE + "/" + name, "Banner child\n"]);
    }
    rootLines.push("Include " + names.join(" "));
  }
  files.unshift([C3_ROOT, rootLines.join("\n") + "\n"]);
  return files;
}

function c3VmTimedStep(timeout, operation) {
  context.__c3VmTimedStepOperation = operation;
  try {
    return vm.runInContext("__c3VmTimedStepOperation()", context, { timeout });
  } finally {
    delete context.__c3VmTimedStepOperation;
  }
}

function c3IncludeScenario() {
  const relative = c3Run([
    [C3_ROOT, "Include sub/child.conf\n"],
    ["/etc/ssh/sub/child.conf", "Include sibling.conf\n"],
    ["/etc/ssh/sibling.conf", "Banner sibling\n"]
  ]);
  const glob = c3Run([
    [C3_ROOT, "Include conf.d/*.conf\n"],
    ["/etc/ssh/conf.d/10.conf", "Banner ten\n"],
    ["/etc/ssh/conf.d/20.conf", "Banner twenty\n"]
  ], [["/etc/ssh/conf.d", ["20.conf", ".hidden.conf", "10.conf"]]]);
  const invalidSources = [
    ["dot", "Include .\n"], ["dotdot", "Include ..\n"],
    ["repeated-slash", "Include conf.d//x\n"], ["trailing-slash", "Include conf.d/\n"],
    ["escape", "Include ../escape\n"], ["wild-parent", "Include conf*/x.conf\n"],
    ["double-star", "Include conf.d/**.conf\n"], ["bracket", "Include conf.d/[a].conf\n"],
    ["backslash", "Include conf.d/x\\y\n"], ["brace", "Include conf.d/{a}.conf\n"],
    ["tilde", "Include ~/x\n"], ["percent", "Include %h/x\n"],
    ["missing", "Include missing.conf\n"], ["zero-glob", "Include conf.d/zero*.conf\n"]
  ].map(([name, source]) => ({
    name,
    result: c3Run([[C3_ROOT, source]], [["/etc/ssh/conf.d", ["one.conf"]]], { includeEvents: false })
  }));
  invalidSources.push({
    name: "selected-directory",
    result: c3Run([[C3_ROOT, "Include child.conf\n"]], [["/etc/ssh/child.conf", []]], { includeEvents: false })
  });
  invalidSources.push({
    name: "cycle",
    result: c3Run([[C3_ROOT, "Include cycle.conf\n"], ["/etc/ssh/cycle.conf", "Include sshd_config\n"]], [], { includeEvents: false })
  });
  invalidSources.push({
    name: "duplicate",
    result: c3Run([[C3_ROOT, "Include same.conf same.conf\n"], ["/etc/ssh/same.conf", "Banner same\n"]], [], { includeEvents: false })
  });
  invalidSources.push({
    name: "child-match-scope",
    result: c3Run([
      [C3_ROOT, "Include child.conf\nInclude later.conf\n"],
      ["/etc/ssh/child.conf", "Match all\n"],
      ["/etc/ssh/later.conf", "Banner later\n"]
    ], [], { includeEvents: false })
  });
  const invalidUtf8 = nativeBuffer.concat([nativeBuffer.from("Include ", "ascii"), nativeBuffer.from([0xc3]), nativeBuffer.from("\n")]);
  invalidSources.push({ name: "invalid-utf8", result: c3Run([[C3_ROOT, invalidUtf8]], [], { includeEvents: false }) });

  const names4096 = new nativeArray();
  for (let index = 4094; index >= 0; index -= 1) names4096.push("n" + String(index).padStart(4, "0") + ".txt");
  names4096.unshift("target.conf");
  const directory4096 = c3VmTimedStep(30000, () => c3Run([
    [C3_ROOT, "Include huge/target*.conf\n"],
    ["/etc/ssh/huge/target.conf", "Banner selected\n"]
  ], [["/etc/ssh/huge", names4096]], { includeEvents: false }));
  const names4097 = names4096.concat(["overflow.txt"]);
  const directory4097 = c3Run([[C3_ROOT, "Include huge/*.conf\n"]], [["/etc/ssh/huge", names4097]], { includeEvents: false });

  const include64Files = new nativeArray();
  const include64Names = new nativeArray();
  for (let index = 0; index < 64; index += 1) {
    const name = "operand-" + index + ".conf";
    include64Names.push(name);
    include64Files.push([C3_BASE + "/" + name, "Banner operand\n"]);
  }
  include64Files.unshift([C3_ROOT, "Include " + include64Names.join(" ") + "\n"]);
  const operands64 = c3Run(include64Files, [], { includeEvents: false });
  const operands65 = c3Run([[C3_ROOT, "Include " + include64Names.concat(["overflow.conf"]).join(" ") + "\n"]], [], { includeEvents: false });
  const depth32 = c3Run(c3ChainFiles(32), [], { includeEvents: false });
  const depth33 = c3Run(c3ChainFiles(33), [], { includeEvents: false });
  const files256 = c3Run(c3ManyIncludedFiles(255), [], { includeEvents: false });
  const files257 = c3Run(c3ManyIncludedFiles(256), [], { includeEvents: false });
  const operationDirectory = c3A1DirectoryRun();
  const readDirectoryFailure = c3A1DirectoryRun({
    kind: "read-directory-failure",
    role: "directory-0",
    code: "EINTR"
  }, true);
  const directoryProxyCounters = {
    get: 0,
    getLength: 0,
    getOther: 0,
    getOwnPropertyDescriptor: 0,
    getPrototypeOf: 0,
    ownKeys: 0
  };
  const formalDirectoryProxy = c3Run([
    [C3_ROOT, "Include conf.d/*.conf\n"],
    ["/etc/ssh/conf.d/selected.conf", "Banner selected\n"]
  ], [["/etc/ssh/conf.d", ["selected.conf"]]], {
    lifecycle: true,
    includeEvents: false,
    terminalSecondCall: true,
    operations: { directoryProxyCounters }
  });
  const formalSameLineMatch = c3Run([
    [C3_ROOT, "Include child.conf later.conf\n"],
    ["/etc/ssh/child.conf", "Match all\n"],
    ["/etc/ssh/later.conf", "PasswordAuthentication no\n"]
  ], [], { lifecycle: true, terminalSecondCall: true });
  const formalSameGlobMatch = c3Run([
    [C3_ROOT, "Include conf.d/*.conf\n"],
    ["/etc/ssh/conf.d/01-match.conf", "Match all\n"],
    ["/etc/ssh/conf.d/02-later.conf", "PasswordAuthentication no\n"]
  ], [["/etc/ssh/conf.d", ["01-match.conf", "02-later.conf"]]], {
    lifecycle: true,
    terminalSecondCall: true
  });
  const formalWildcardDecisions = [
    {
      name: "literal",
      result: c3Run([
        [C3_ROOT, "Include literal.conf\n"],
        ["/etc/ssh/literal.conf", "Banner literal\n"]
      ], [], { includeEvents: false })
    },
    {
      name: "question",
      result: c3Run([
        [C3_ROOT, "Include conf.d/0?.conf\n"],
        ["/etc/ssh/conf.d/01.conf", "Banner question\n"]
      ], [["/etc/ssh/conf.d", ["01.conf"]]], { includeEvents: false })
    },
    {
      name: "star",
      result: c3Run([
        [C3_ROOT, "Include conf.d/*.conf\n"],
        ["/etc/ssh/conf.d/01.conf", "Banner star\n"]
      ], [["/etc/ssh/conf.d", ["01.conf"]]], { includeEvents: false })
    }
  ];
  return {
    relative,
    glob,
    invalidSources,
    directory4096,
    directory4097,
    operands64,
    operands65,
    depth32,
    depth33,
    files256,
    files257,
    operationDirectory,
    readDirectoryFailure,
    formalDirectoryProxy: { result: formalDirectoryProxy, counters: directoryProxyCounters },
    formalSameLineMatch,
    formalSameGlobMatch,
    formalWildcardDecisions,
    selectedCalculator: {
      maximum: api.__test_nextAuthorizationBudgetValue(65535, 1, 65536),
      overflow: safe(() => api.__test_nextAuthorizationBudgetValue(65536, 1, 65536))
    },
    directoryCalculator: {
      perDirectorySort: 4 * 4096 * Math.ceil(Math.log2(4096)),
      aggregateSort: 4 * 65536 * Math.ceil(Math.log2(65536)),
      inheritedAggregate: 65536 * 4095 / 2 + 65536,
      completeCeiling: 137396224
    }
  };
}

function c3LineOfLength(length) {
  const prefix = "ForceCommand ";
  const tokenCount = 4;
  const separatorBytes = tokenCount - 1;
  const content = length - prefix.length - separatorBytes;
  const base = Math.floor(content / tokenCount);
  let remainder = content % tokenCount;
  const tokens = new nativeArray();
  for (let index = 0; index < tokenCount; index += 1) {
    const size = base + (remainder > 0 ? 1 : 0);
    remainder -= remainder > 0 ? 1 : 0;
    tokens.push("x".repeat(size));
  }
  return prefix + tokens.join(" ");
}

function c3LexerScenario() {
  const authorityLines = [
    "AuthenticationMethods publickey", "PubkeyAuthentication YES", "PasswordAuthentication no",
    "KbdInteractiveAuthentication No", "ChallengeResponseAuthentication no", "HostbasedAuthentication no",
    "GSSAPIAuthentication no", "KerberosAuthentication no", "PermitUserEnvironment no",
    "AcceptEnv LANG LC_ALL", "ForceCommand none extra", "ChrootDirectory none",
    "DisableForwarding yes", "PermitTunnel no",
    "AuthorizedKeysFile /etc/ssh/authorized_keys/gccgw-japan-repair-ci",
    "AuthorizedKeysCommand none extra", "AuthorizedPrincipalsFile none",
    "AuthorizedPrincipalsCommand none extra", "TrustedUserCAKeys none"
  ];
  const opaqueLines = ${JSON.stringify(C3_OPAQUE_DIRECTIVES)}.map((name) => name + " value=kept");
  const successSource = ["", "   # comment", ...opaqueLines, ...authorityLines,
    "Match User alice,!blocked Group ops,admins", "PubkeyAuthentication yes", "Match all", "PasswordAuthentication no", ""].join("\n");
  const success = c3Run([[C3_ROOT, successSource]]);
  const ignoredOnly = c3Run([[C3_ROOT, "\n \t\n# root comment\n\t # indented comment\n"]]);
  const payloadOracle = c3Run([
    [C3_ROOT, "Include conf.d/*.conf\nMatch User alice,!blocked,a*e? Group ops\nForceCommand   none   extra\n"],
    ["/etc/ssh/conf.d/selected.conf", "Banner selected\n"]
  ], [["/etc/ssh/conf.d", ["selected.conf"]]]);
  const namedMatchConditions = c3Run([[C3_ROOT,
    "Match User user Group group Host host Address address LocalAddress localaddress LocalPort 22 RDomain rdomain LocalNetwork localnetwork\n"]]);
  const allMatchCondition = c3Run([[C3_ROOT, "Match all\n"]]);
  const unknownMatchCondition = c3Run([[C3_ROOT, "Match Principal principal\n"]], [], { includeEvents: false });
  const allPrecharge = c3Run([[C3_ROOT, "Match all\n"]], [], { lifecycle: true });
  const unknownDirective = c3Run([[C3_ROOT, "UnknownDirective value\n"]], [], {
    lifecycle: true,
    includeEvents: false,
    terminalSecondCall: true
  });
  const invalidByteSources = [
    ["bom-start", nativeBuffer.concat([nativeBuffer.from([0xef, 0xbb, 0xbf]), nativeBuffer.from("Banner x\n")])],
    ["bom-middle", nativeBuffer.concat([nativeBuffer.from("Banner x", "ascii"), nativeBuffer.from([0xef, 0xbb, 0xbf]), nativeBuffer.from("\n")])],
    ["cr", nativeBuffer.from("Banner x\r\n")], ["nul", nativeBuffer.from([0x42, 0x61, 0x6e, 0x6e, 0x65, 0x72, 0x20, 0, 0x0a])],
    ["invalid-utf8", nativeBuffer.from([0x42, 0x61, 0x6e, 0x6e, 0x65, 0x72, 0x20, 0xc3, 0x0a])]
  ];
  const invalidTextSources = [
    ["inline-comment", "Banner x # no\n"], ["double-quote", "Banner \"x\"\n"],
    ["single-quote", "Banner 'x'\n"], ["backslash", "Banner x\\y\n"],
    ["control", "Banner x" + String.fromCharCode(1) + "y\n"], ["delete", "Banner x" + String.fromCharCode(0x7f) + "y\n"],
    ["directive-equals", "Banner=x\n"], ["include-equals", "Include x=y\n"],
    ["match-equals", "Match User=x\n"], ["authority-equals", "ForceCommand x=y\n"],
    ["unknown", "UnknownDirective x\n"], ["missing-argument", "Banner\n"],
    ["non-ascii-directive", "Bännér x\n"], ["non-ascii-include", "Include tänk.conf\n"],
    ["non-ascii-match", "Match User å\n"], ["non-ascii-authority", "ForceCommand å\n"],
    ["opaque-in-match", "Match all\nBanner x\n"], ["include-in-match", "Match all\nInclude child.conf\n"],
    ["repeated-condition", "Match User a User b\n"], ["all-not-sole", "Match all User a\n"],
    ["empty-pattern", "Match User a,,b\n"], ["double-negation", "Match User !!a\n"],
    ["pattern-bracket", "Match User [a]\n"], ["pattern-backslash", "Match User a\\b\n"],
    ["permittunnel-case", "PermitTunnel NO\n"], ["bad-boolean", "PasswordAuthentication maybe\n"]
  ];
  const unicodeWhitespace = [0x0085, 0x00a0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000];
  for (const scalar of unicodeWhitespace) invalidTextSources.push(["unicode-whitespace-" + scalar.toString(16), "Banner x" + String.fromCodePoint(scalar) + "y\n"]);
  const invalid = [
    ...invalidByteSources.map(([name, bytes]) => ({ name, result: c3Run([[C3_ROOT, bytes]], [], { includeEvents: false }) })),
    ...invalidTextSources.map(([name, source]) => ({ name, result: c3Run([[C3_ROOT, source]], [], { includeEvents: false }) }))
  ];

  const line16384 = c3Run([[C3_ROOT, c3LineOfLength(16384) + "\n"]], [], { includeEvents: false });
  const line16385 = c3Run([[C3_ROOT, c3LineOfLength(16385) + "\n"]], [], { includeEvents: false });
  const token4096 = c3Run([[C3_ROOT, "Banner " + "x".repeat(4096) + "\n"]], [], { includeEvents: false });
  const token4097 = c3Run([[C3_ROOT, "Banner " + "x".repeat(4097) + "\n"]], [], { includeEvents: false });
  const arguments255 = new nativeArray();
  for (let index = 0; index < 255; index += 1) arguments255.push("n" + index);
  const tokens256 = c3Run([[C3_ROOT, "ForceCommand " + arguments255.join(" ") + "\n"]], [], { includeEvents: false });
  const tokens257 = c3Run([[C3_ROOT, "ForceCommand " + arguments255.concat(["overflow"]).join(" ") + "\n"]], [], { includeEvents: false });
  const acceptEnv255 = c3Run([[C3_ROOT, "AcceptEnv " + arguments255.join(" ") + "\n"]], [], { includeEvents: false });
  const acceptEnv256 = c3Run([[C3_ROOT, "AcceptEnv " + arguments255.concat(["overflow"]).join(" ") + "\n"]], [], { includeEvents: false });

  const precharge = c3Run([
    [C3_ROOT, "Include child.conf\nMatch User aa,ab Group ops\nAcceptEnv LANG LC_ALL\n"],
    ["/etc/ssh/child.conf", "Banner child\n"]
  ]);
  const operationFailures = [
    ["post-fstat-drift", { kind: "post-fstat-drift", role: "file-0" }],
    ["read", { kind: "read-failure", role: "file-0" }],
    ["close", { kind: "close-failure", role: "file-0", code: "EINTR" }]
  ].map(([name, fault]) => ({ name, result: c3A1FileRun(fault, true) }));

  return {
    success,
    ignoredOnly,
    payloadOracle,
    namedMatchConditions,
    allMatchCondition,
    unknownMatchCondition,
    allPrecharge,
    unknownDirective,
    invalid,
    line16384,
    line16385,
    token4096,
    token4097,
    tokens256,
    tokens257,
    acceptEnv255,
    acceptEnv256,
    precharge,
    operationFailures
  };
}

function c4Binding(overrides = {}) {
  const binding = ${JSON.stringify(v3Binding({
    gateId: "test-gate",
    expectedNonceSha256: "a".repeat(64),
    expectedClaimSha256: "c".repeat(64),
    authorizationMarker: "test-gate"
  }))};
  const sshAuthorization = overrides.sshAuthorization === undefined
    ? binding.sshAuthorization
    : { ...binding.sshAuthorization, ...overrides.sshAuthorization };
  return { ...binding, ...overrides, sshAuthorization };
}

function c4AccountRecord(overrides = {}) {
  return {
    username: "gccgw-japan-repair-ci",
    uid: 975,
    homeDirectory: "/var/lib/gccgw-japan-repair-ci",
    loginShell: "/usr/bin/dash",
    passwordLocked: true,
    primaryGroupId: 975,
    groupIds: [1100, 975],
    groupNames: ["repair", "ops"],
    ...overrides
  };
}

function c4FrozenAccountLookalike(account) {
  const groupIds = nativeObject.freeze([...account.groupIds]);
  const groupNames = nativeObject.freeze([...account.groupNames]);
  return nativeObject.freeze({
    username: account.username,
    uid: account.uid,
    homeDirectory: account.homeDirectory,
    loginShell: account.loginShell,
    passwordLocked: account.passwordLocked,
    primaryGroupId: account.primaryGroupId,
    groupIds,
    groupNames
  });
}

function c4ProjectedAccount(binding, firstOverrides = {}, secondOverrides = firstOverrides) {
  const reads = new nativeArray();
  const first = c4AccountRecord(firstOverrides);
  const second = c4AccountRecord(secondOverrides);
  const accountOperations = {
    readAccount(username) {
      c4AccountReadCount += 1;
      reads.push(username);
      return reads.length === 1 ? first : second;
    }
  };
  const core = api.collectBoundAccountEvidence(binding, { accountOperations });
  if (reads.length !== 2) throw new Error("C4 projected account did not use exactly two reads");
  return { core, reads };
}

function c4NativeAccountCore(groupNamesOutput = "repair ops\n") {
  const getentBytes = nativeBuffer.from("c4-native-getent", "ascii");
  const idBytes = nativeBuffer.from("c4-native-id", "ascii");
  const base = c4Binding();
  const binding = c4Binding({
    toolManifest: {
      ...base.toolManifest,
      getent: {
        ...base.toolManifest.getent,
        sizeBytes: getentBytes.length,
        sha256: crypto.createHash("sha256").update(getentBytes).digest("hex")
      },
      id: {
        ...base.toolManifest.id,
        sizeBytes: idBytes.length,
        sha256: crypto.createHash("sha256").update(idBytes).digest("hex")
      }
    }
  });
  const calls = new nativeArray();
  const descriptors = new nativeMap();
  let nextFd = 900;
  let outputIndex = 0;
  const outputTexts = [
    "gccgw-japan-repair-ci:x:975:975:projection:/var/lib/gccgw-japan-repair-ci:/usr/bin/dash\n",
    "gccgw-japan-repair-ci:!locked:1:2:3:4:5:6:7\n",
    "975\n",
    "975\n",
    "1100 975\n",
    groupNamesOutput
  ];
  const outputBuffers = outputTexts.map((value) => nativeBuffer.from(value, "ascii"));
  const stderrBuffers = outputTexts.map(() => nativeBuffer.alloc(0));
  function directoryStat() {
    return {
      uid: 0n, gid: 0n, mode: 0o040755n, nlink: 2n, dev: 31n, ino: 1n, size: 4096n,
      isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false
    };
  }
  function bytesFor(path) {
    if (path === "/usr/bin/getent") return getentBytes;
    if (path === "/usr/bin/id") return idBytes;
    return null;
  }
  function fileStat(path) {
    const bytes = bytesFor(path);
    return {
      uid: 0n, gid: 0n, mode: 0o100755n, nlink: 1n, dev: 31n,
      ino: path.endsWith("getent") ? 2n : 3n, size: BigInt(bytes.length),
      isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false
    };
  }
  const host = {
    lstatSync(path) {
      calls.push(["lstat", path]);
      return bytesFor(path) ? fileStat(path) : directoryStat();
    },
    openSync(path, flags) {
      calls.push(["open", path, flags]);
      const bytes = bytesFor(path);
      if (!bytes || flags !== 0xA0000) throw new Error("unexpected C4 native open");
      const fd = nextFd;
      nextFd += 1;
      descriptors.set(fd, { path, bytes, fstatCount: 0, offset: 0 });
      return fd;
    },
    fstatSync(fd) {
      const descriptor = descriptors.get(fd);
      calls.push(["fstat", fd]);
      if (!descriptor || descriptor.fstatCount > 1) throw new Error("unexpected C4 native fstat");
      descriptor.fstatCount += 1;
      return fileStat(descriptor.path);
    },
    readSync(fd, buffer, offset, length, position) {
      const descriptor = descriptors.get(fd);
      calls.push(["read", fd, position]);
      if (!descriptor || descriptor.fstatCount !== 1 || position !== descriptor.offset) {
        throw new Error("unexpected C4 native read");
      }
      if (position === descriptor.bytes.length) return 0;
      const count = descriptor.bytes.length - position;
      if (offset !== position || length !== count || buffer.length !== descriptor.bytes.length) {
        throw new Error("unexpected C4 native read envelope");
      }
      descriptor.bytes.copy(buffer, offset);
      descriptor.offset += count;
      return count;
    },
    closeSync(fd) {
      calls.push(["close", fd]);
      if (!descriptors.delete(fd)) throw new Error("unexpected C4 native close");
    },
    spawnSync(executable, arguments_, options) {
      calls.push(["spawn", executable, [...arguments_], options && options.shell]);
      if (outputIndex >= outputBuffers.length) throw new Error("unexpected C4 native spawn");
      const result = {
        stdout: outputBuffers[outputIndex],
        stderr: stderrBuffers[outputIndex],
        status: 0,
        signal: null
      };
      outputIndex += 1;
      return result;
    }
  };
  let core;
  c4NativeBuiltinHost = host;
  try {
    core = api.__test_createNativeAccountOperations(binding).readAccount();
  } finally {
    c4NativeBuiltinHost = null;
    getentBytes.fill(0);
    idBytes.fill(0);
  }
  return {
    core,
    binding,
    calls,
    outputCount: outputIndex,
    outputZeroized: outputBuffers.every((value) => value.every((byte) => byte === 0))
      && stderrBuffers.every((value) => value.length === 0)
  };
}

function c4NativePolicyPositive(groupNamesOutput = "repair ops\n", matchGroup = "ops") {
  const nativeAccount = c4NativeAccountCore(groupNamesOutput);
  const state = fresh();
  const source = c4SafeLines() + "Match User gccgw-japan-repair-ci Group " + matchGroup + "\n";
  const environment = c3Environment([[C3_ROOT, source]], []);
  const input = c4OperationInput(environment);
  const syntax = safe(() => api.__test_deriveAuthorizationSshSyntax(
    state.ssh,
    input.pathOperations,
    input.sourceOperations
  ));
  if (!syntax.ok) return { syntax: { ok: false, error: syntax.error }, nativeAccount };
  const policy = c4AllocatedCall(() => api.__test_deriveAuthorizationSshPolicy(
    state.ssh,
    syntax.value,
    nativeAccount.core
  ));
  const afterPolicy = inspect(state);
  const disposePolicy = policy.result.ok
    ? safe(() => api.__test_disposeAuthorizationSshPolicy(state.ssh, policy.result.value))
    : null;
  const disposeSyntax = safe(() => api.__test_disposeAuthorizationSshSyntax(state.ssh, syntax.value));
  return {
    syntax: { ok: true },
    policy: { ok: policy.result.ok, error: policy.result.error || null },
    disposePolicy: disposePolicy && { ok: disposePolicy.ok, error: disposePolicy.error || null },
    disposeSyntax: { ok: disposeSyntax.ok, error: disposeSyntax.error || null },
    authorizationEntryCount: afterPolicy.snapshot.authorizationEntryCount,
    terminal: afterPolicy.snapshot.failed,
    nativeAccount: {
      outputCount: nativeAccount.outputCount,
      outputZeroized: nativeAccount.outputZeroized,
      openCount: nativeAccount.calls.filter(([name]) => name === "open").length,
      spawnCount: nativeAccount.calls.filter(([name]) => name === "spawn").length
    }
  };
}

function c4OperationInput(
  environment,
  mutation = null,
  verificationScopes = null,
  beforeFirstSourcePathOperation = null
) {
  let pendingSourcePathHook = beforeFirstSourcePathOperation;
  function recordVerificationScope(operation, role) {
    if (verificationScopes !== null && (role.startsWith("ancestor-") || role === "file-1")) {
      verificationScopes.push([operation, role, context.__c4AuthorizationVerifyActive === true]);
    }
  }
  const call = (operation) => (...arguments_) => {
    c4InjectedOperationCount += 1;
    return operation(...arguments_);
  };
  let authorizationFd = null;
  const pathOperations = {
    lstat(path) {
      c4InjectedOperationCount += 1;
      const role = environment.pathRoles.get(path) || "unrecognized-path";
      if (pendingSourcePathHook !== null && role === "ancestor-0"
        && context.__c4AuthorizationVerifyActive !== true) {
        const hook = pendingSourcePathHook;
        pendingSourcePathHook = null;
        hook();
      }
      recordVerificationScope("lstat", role);
      return environment.pathOperations.lstat(path);
    },
    open(path, flags) {
      c4InjectedOperationCount += 1;
      const role = environment.pathRoles.get(path) || "unrecognized-path";
      recordVerificationScope("open", role);
      const fd = environment.pathOperations.open(path, flags);
      if (path === "/etc/ssh/authorized_keys/gccgw-japan-repair-ci") authorizationFd = fd;
      return fd;
    },
    fstat(fd) {
      c4InjectedOperationCount += 1;
      if (fd === authorizationFd) recordVerificationScope("fstat", "file-1");
      return mutation === "wrong-fd" && fd === authorizationFd
        ? environment.pathOperations.fstat(fd + 10000)
        : environment.pathOperations.fstat(fd);
    },
    read(fd, buffer, offset, length, position) {
      c4InjectedOperationCount += 1;
      if (fd === authorizationFd) recordVerificationScope("read", "file-1");
      return environment.pathOperations.read(fd, buffer, offset, length, position);
    },
    close(fd) {
      c4InjectedOperationCount += 1;
      if (fd === authorizationFd) recordVerificationScope("close", "file-1");
      return environment.pathOperations.close(fd);
    }
  };
  const sourceOperations = {
    readDirectory: call(environment.sourceOperations.readDirectory),
    validateSudoers: call(environment.sourceOperations.validateSudoers)
  };
  return { pathOperations, sourceOperations };
}

function c4FixedShapeValueKind(value) {
  if (value !== null && (typeof value === "object" || typeof value === "function") && types.isProxy(value)) {
    return "Proxy";
  }
  if (nativeArray.isArray(value)) return "Array";
  if (value instanceof nativeMap) return "Map";
  if (value instanceof nativeSet) return "Set";
  if (value instanceof nativeWeakMap) return "WeakMap";
  if (value instanceof nativeWeakSet) return "WeakSet";
  return value === null ? "null" : typeof value === "object" ? "Object" : typeof value;
}

function c4FixedShapeObject(value) {
  const objectLike = value !== null && (typeof value === "object" || typeof value === "function");
  const proxy = objectLike && types.isProxy(value);
  if (!objectLike || proxy) return { objectLike, proxy, prototypeKind: null, symbolCount: null, fields: [] };
  const prototype = nativeObject.getPrototypeOf(value);
  return {
    objectLike: true,
    proxy: false,
    prototypeKind: prototype === null ? "null" : prototype === nativeArray.prototype ? "Array" : "other",
    symbolCount: nativeObject.getOwnPropertySymbols(value).length,
    fields: nativeObject.getOwnPropertyNames(value).sort().map((name) => {
      const descriptor = nativeObject.getOwnPropertyDescriptor(value, name);
      return {
        name,
        hasValue: nativeObject.hasOwn(descriptor, "value"),
        valueKind: nativeObject.hasOwn(descriptor, "value") ? c4FixedShapeValueKind(descriptor.value) : null,
        writable: descriptor.writable === true,
        enumerable: descriptor.enumerable === true,
        configurable: descriptor.configurable === true,
        hasGetter: descriptor.get !== undefined,
        hasSetter: descriptor.set !== undefined
      };
    })
  };
}

function c4FixedShapeAudit(snapshot, ssh, sudo) {
  return {
    snapshot: c4FixedShapeObject(snapshot),
    ssh: c4FixedShapeObject(ssh),
    sudo: c4FixedShapeObject(sudo),
    sshCleanup: c4FixedShapeObject(ssh && ssh.cleanupStack),
    sudoCleanup: c4FixedShapeObject(sudo && sudo.cleanupStack)
  };
}

const C4_SNAPSHOT_NUMERIC_BUDGET_KEYS = [
  "fixedEnvelopeCount", "semanticNodeCount", "authorizationEntryCount", "wildcardPatternByteCount",
  "wildcardInvocationCount", "wildcardAlignedComparisonCount", "sshMatchComparisonCount",
  "sudoSelectorComparisonCount", "sudoAliasVisitCount", "retainedPreimageBytes"
];
const C4_GRAPH_NUMERIC_BUDGET_KEYS = [
  "fixedEnvelopeCount", "semanticNodeCount", "fileCount", "sourceFileCount", "totalBytes",
  "directoryNameCount", "depth", "nextOrdinal", "sshPhysicalDirectiveCount", "sshIncludePatternCount",
  "sshSelectedInsertionCount", "sshMatchBranchCount", "sshMatchConditionCount", "sshMatchPatternCount",
  "sshAssignmentCount", "sshAcceptEnvNameCount", "sudoStatementCount", "sudoIncludeCount",
  "sudoSelectedInsertionCount", "sudoAliasDefinitionCount", "sudoAliasMemberCount", "sudoDefaultsItemCount",
  "sudoUserSpecCount", "sudoUserHostRunasMemberCount", "sudoTagTransitionCount", "sudoCommandSpecCount",
  "sudoArgumentTokenCount", "sudoAliasEdgeCount", "sudoAliasMemoEntryCount", "globComparisonCount",
  "commandWorkCount", "aliasEdgeWorkCount"
];

function c4CreateIndependentBudgetLedger() {
  const snapshot = {};
  for (const key of C4_SNAPSHOT_NUMERIC_BUDGET_KEYS) snapshot[key] = 0;
  snapshot.fixedEnvelopeCount = 5;
  snapshot.semanticNodeCount = 5;
  snapshot.failed = false;
  function graph(kind) {
    const value = { kind, failed: false };
    for (const key of C4_GRAPH_NUMERIC_BUDGET_KEYS) value[key] = 0;
    value.fixedEnvelopeCount = 2;
    value.semanticNodeCount = 2;
    return value;
  }
  return {
    budget: {
      snapshot,
      ssh: graph("ssh"),
      sudo: graph("sudo"),
      identity: {
        snapshotSshGraph: true,
        snapshotSudoGraph: true,
        sshSnapshot: true,
        sudoSnapshot: true,
        graphsDistinct: true,
        cleanupDistinct: true
      }
    },
    signalCount: 0,
    signals: {
      fixed: 0,
      semantic: 0,
      work: 0,
      preimage: 0,
      scan: 0,
      match: 0,
      sourceRead: 0,
      sourceNode: 0,
      directoryNames: 0,
      depth: 0
    }
  };
}

function c4ApplyIndependentBudgetSignal(ledger, references, kind, subject, value) {
  if (ledger === null) throw new Error("C4 budget ledger was not initialized");
  ledger.signalCount += 1;
  if (!nativeObject.hasOwn(ledger.signals, kind)) throw new Error("C4 unknown budget ledger signal");
  ledger.signals[kind] += 1;
  const budget = ledger.budget;
  if (kind === "preimage") {
    if (subject !== references.snapshot || !Number.isSafeInteger(value) || value <= 0) {
      throw new Error("C4 invalid preimage ledger signal");
    }
    budget.snapshot.retainedPreimageBytes += value;
    return;
  }
  const graph = subject === references.ssh ? budget.ssh
    : subject === references.sudo ? budget.sudo : null;
  if (graph === null) throw new Error("C4 budget ledger graph identity mismatch");
  if (kind === "fixed") {
    budget.snapshot.fixedEnvelopeCount += 1;
    budget.snapshot.semanticNodeCount += 1;
    graph.semanticNodeCount += 1;
    return;
  }
  if (kind === "semantic") {
    const counter = String(value) + "Count";
    if (!nativeObject.hasOwn(graph, counter)) throw new Error("C4 semantic ledger kind mismatch");
    budget.snapshot.semanticNodeCount += 1;
    graph.semanticNodeCount += 1;
    graph[counter] += 1;
    if (value === "sudoCommandSpec") graph.commandWorkCount += 1;
    if (value === "sudoAliasEdge") graph.aliasEdgeWorkCount += 1;
    return;
  }
  if (kind === "work") {
    if (value === "glob") {
      graph.globComparisonCount += 1;
      budget.snapshot.wildcardInvocationCount += 1;
    } else if (value === "sshMatch") {
      budget.snapshot.sshMatchComparisonCount += 1;
      budget.snapshot.wildcardInvocationCount += 1;
    } else if (value === "sudoSelector") {
      budget.snapshot.sudoSelectorComparisonCount += 1;
      budget.snapshot.wildcardInvocationCount += 1;
    } else if (value === "sudoCommand") {
      graph.commandWorkCount += 1;
    } else if (value === "sudoAliasEdge") {
      graph.aliasEdgeWorkCount += 1;
    } else if (value === "sudoAliasVisit") {
      budget.snapshot.sudoAliasVisitCount += 1;
    } else {
      throw new Error("C4 work ledger kind mismatch");
    }
    return;
  }
  if (!Number.isSafeInteger(value)) throw new Error("C4 numeric ledger signal mismatch");
  if (kind === "scan") budget.snapshot.wildcardPatternByteCount += value;
  else if (kind === "match") budget.snapshot.wildcardAlignedComparisonCount += value;
  else if (kind === "sourceRead") {
    graph.fileCount += 1;
    graph.totalBytes += value;
  } else if (kind === "sourceNode") {
    if (value !== 1) throw new Error("C4 source-node ledger value mismatch");
    graph.nextOrdinal += 1;
  }
  else if (kind === "directoryNames") graph.directoryNameCount += value;
  else if (kind === "depth") graph.depth += value;
  else throw new Error("C4 unhandled budget ledger signal");
}

function c4InitialBudgetAudit(snapshot, ssh, sudo) {
  const snapshotBudget = {};
  for (const key of C4_SNAPSHOT_NUMERIC_BUDGET_KEYS) snapshotBudget[key] = snapshot[key];
  snapshotBudget.failed = snapshot.failed;
  snapshotBudget.sshGraphIdentity = snapshot.sshGraph === ssh;
  snapshotBudget.sudoGraphIdentity = snapshot.sudoGraph === sudo;
  function graphBudget(graph, kind) {
    const budget = { kindExact: graph.kind === kind, snapshotIdentity: graph.snapshot === snapshot };
    for (const key of C4_GRAPH_NUMERIC_BUDGET_KEYS) budget[key] = graph[key];
    budget.failed = graph.failed;
    budget.cleanupLength = graph.cleanupStack.length;
    return budget;
  }
  return {
    snapshot: snapshotBudget,
    ssh: graphBudget(ssh, "ssh"),
    sudo: graphBudget(sudo, "sudo")
  };
}

function c4InitialBoundaryAudit(kind, snapshot, ssh, sudo) {
  const snapshotBudget = {};
  for (const key of C4_SNAPSHOT_NUMERIC_BUDGET_KEYS) snapshotBudget[key] = snapshot[key];
  snapshotBudget.failed = snapshot.failed;
  snapshotBudget.sshGraphAbsent = snapshot.sshGraph === undefined;
  snapshotBudget.sudoGraphAbsent = snapshot.sudoGraph === undefined;
  snapshotBudget.sshGraphIdentity = ssh !== null && snapshot.sshGraph === ssh;
  snapshotBudget.sudoGraphIdentity = sudo !== null && snapshot.sudoGraph === sudo;
  function graphBudget(graph, expectedKind) {
    if (graph === null) return null;
    const budget = { kindExact: graph.kind === expectedKind, snapshotIdentity: graph.snapshot === snapshot };
    for (const key of C4_GRAPH_NUMERIC_BUDGET_KEYS) budget[key] = graph[key];
    budget.failed = graph.failed;
    budget.cleanupLength = graph.cleanupStack.length;
    return budget;
  }
  return {
    kind,
    fixedShape: c4FixedShapeAudit(snapshot, ssh, sudo),
    budget: {
      snapshot: snapshotBudget,
      ssh: graphBudget(ssh, "ssh"),
      sudo: graphBudget(sudo, "sudo")
    }
  };
}

function c4RawErrorDescriptor(descriptor, expectedValue) {
  return {
    present: descriptor !== undefined,
    data: !!descriptor && nativeObject.hasOwn(descriptor, "value")
      && descriptor.get === undefined && descriptor.set === undefined,
    valueExact: !!descriptor && nativeObject.hasOwn(descriptor, "value")
      && (expectedValue === "<string>" ? typeof descriptor.value === "string" : descriptor.value === expectedValue),
    writable: !!descriptor && descriptor.writable === true,
    enumerable: !!descriptor && descriptor.enumerable === true,
    configurable: !!descriptor && descriptor.configurable === true
  };
}

function c4RawContractErrorAudit(error) {
  const objectLike = error !== null && (typeof error === "object" || typeof error === "function");
  const proxy = objectLike && types.isProxy(error);
  let contractErrorOrdinal = null;
  if (nativeArray.isArray(c4ContractErrorReferences)) {
    for (let index = 0; index < c4ContractErrorReferences.length; index += 1) {
      if (c4ContractErrorReferences[index] === error) contractErrorOrdinal = index + 1;
    }
  }
  if (!objectLike || proxy) {
    return {
      contractError: false, contractErrorOrdinal, proxy, prototypeExact: false,
      contractErrorPrototypeParentExact: false, contractErrorPrototypeOwnNames: [],
      contractErrorPrototypeOwnSymbolCount: null, contractErrorPrototypeConstructorExact: false,
      contractErrorPrototypeConstructorDescriptor: c4RawErrorDescriptor(undefined, contractError),
      contractErrorParentOwnNames: [], contractErrorParentOwnSymbolCount: null,
      codeExact: false, messageExact: false, nameExact: false,
      enumerableOwnKeys: [], ownNames: [], ownSymbolCount: null,
      codeDescriptor: c4RawErrorDescriptor(undefined, "restricted_identity_rejected"),
      messageDescriptor: c4RawErrorDescriptor(undefined, "restricted_identity_rejected"),
      stackDescriptor: c4RawErrorDescriptor(undefined, "<string>"),
      forbiddenOwnFieldPresent: false, syntheticMessageVisible: false, syntheticStackVisible: false
    };
  }
  const codeDescriptor = nativeObject.getOwnPropertyDescriptor(error, "code");
  const messageDescriptor = nativeObject.getOwnPropertyDescriptor(error, "message");
  const stackDescriptor = nativeObject.getOwnPropertyDescriptor(error, "stack");
  const prototypeConstructorDescriptor = nativeObject.getOwnPropertyDescriptor(
    contractError.prototype, "constructor");
  const message = messageDescriptor && typeof messageDescriptor.value === "string" ? messageDescriptor.value : "";
  const stack = stackDescriptor && typeof stackDescriptor.value === "string" ? stackDescriptor.value : "";
  return {
    contractError: error instanceof contractError,
    contractErrorOrdinal,
    proxy: false,
    prototypeExact: nativeObject.getPrototypeOf(error) === contractError.prototype,
    contractErrorPrototypeParentExact: nativeObject.getPrototypeOf(contractError.prototype) === Error.prototype,
    contractErrorPrototypeOwnNames: nativeObject.getOwnPropertyNames(contractError.prototype).sort(),
    contractErrorPrototypeOwnSymbolCount: nativeObject.getOwnPropertySymbols(contractError.prototype).length,
    contractErrorPrototypeConstructorExact:
      prototypeConstructorDescriptor?.value === contractError,
    contractErrorPrototypeConstructorDescriptor:
      c4RawErrorDescriptor(prototypeConstructorDescriptor, contractError),
    contractErrorParentOwnNames: nativeObject.getOwnPropertyNames(Error.prototype).sort(),
    contractErrorParentOwnSymbolCount: nativeObject.getOwnPropertySymbols(Error.prototype).length,
    codeExact: !!codeDescriptor && codeDescriptor.value === "restricted_identity_rejected",
    messageExact: message === "restricted_identity_rejected",
    nameExact: error.name === "Error",
    enumerableOwnKeys: nativeObject.keys(error).sort(),
    ownNames: nativeObject.getOwnPropertyNames(error).sort(),
    ownSymbolCount: nativeObject.getOwnPropertySymbols(error).length,
    codeDescriptor: c4RawErrorDescriptor(codeDescriptor, "restricted_identity_rejected"),
    messageDescriptor: c4RawErrorDescriptor(messageDescriptor, "restricted_identity_rejected"),
    stackDescriptor: c4RawErrorDescriptor(stackDescriptor, "<string>"),
    forbiddenOwnFieldPresent: ["cause", "value", "error", "raw", "originalError"]
      .some((name) => nativeObject.hasOwn(error, name)),
    syntheticMessageVisible: message.toLowerCase().includes("synthetic"),
    syntheticStackVisible: stack.toLowerCase().includes("synthetic")
  };
}

function c4TerminalBudgetState(graph) {
  const snapshot = graph && graph.snapshot;
  if (!snapshot || !snapshot.sudoGraph) return null;
  return {
    budget: api.__test_inspectAuthorizationBudgetState({ snapshot, ssh: graph, sudo: snapshot.sudoGraph }),
    fixedShape: c4FixedShapeAudit(snapshot, graph, snapshot.sudoGraph)
  };
}

function c4AllocatedCall(operation, captureTrace = true) {
  const trace = captureTrace ? new nativeArray() : null;
  const trackedArrays = new nativeArray();
  const trackedBuffers = new nativeArray();
  if (trace !== null) globalThis.__c3AllocationTrace = trace;
  globalThis.__c3TrackedArrays = trackedArrays;
  globalThis.__c3TrackedBuffers = trackedBuffers;
  if (trace !== null) context.__c3AllocationTrace = trace;
  try {
    const result = withAllocations(() => safe(operation));
    return {
      result: result.value,
      allocations: result.counts,
      trace: trace === null ? [] : trace,
      trackedArrayLengths: trackedArrays.map((value) => value.length),
      trackedBuffersZero: trackedBuffers.every((value) => value.every((byte) => byte === 0)),
      trackedBufferCount: trackedBuffers.length
    };
  } finally {
    delete globalThis.__c3AllocationTrace;
    delete globalThis.__c3TrackedArrays;
    delete globalThis.__c3TrackedBuffers;
    delete context.__c3AllocationTrace;
  }
}

function c4AllocatedRawCall(operation, captureTrace = true) {
  let rawErrorAudit = null;
  const call = c4AllocatedCall(() => {
    try {
      return operation();
    } catch (error) {
      rawErrorAudit = c4RawContractErrorAudit(error);
      throw error;
    }
  }, captureTrace);
  return { ...call, rawErrorAudit };
}

function c4AllocatedPublicCall(operation) {
  const publicCalls = new nativeArray();
  const publicAudit = {
    legacyLineParserCallCount: 0,
    wholeRecordBufferToStringCount: 0,
    wholeRecordTextDecoderCount: 0,
    verifierBufferToStringCount: 0,
    verifierBufferToStringSpans: new nativeArray(),
    verifierTextDecoderConstructionCount: 0,
    verifierTextDecoderDecodeCount: 0,
    verifierTextDecoderInputLengths: new nativeArray(),
    topologyFreezeCount: 0,
    projectionFreezeCounts: { include: 0, coverage: 0, topology: 0 },
    projectionFreezeEvents: new nativeArray(),
    contractErrorEvents: new nativeArray(),
    initialBoundaryCaptureCount: 0,
    initialBoundaryAudits: new nativeArray(),
    initialShapeCaptureCount: 0,
    initialFixedShape: null,
    initialBudgetAudit: null,
    verifyAttempts: 0,
    verifySuccesses: 0,
    verifyFailures: 0,
    verifyUndefinedReturns: 0,
    verifyNonUndefinedReturns: 0,
    authorizationHashInputs: new nativeArray(),
    preimageReserveLengths: new nativeArray(),
    preimageReserveTotal: 0,
    budgetLedger: null,
    authorizationEntryCount: null,
    snapshotFailed: null
  };
  const contractErrorReferences = new nativeArray();
  const projectionFreezeReferences = new nativeArray();
  const budgetLedgerReferences = { snapshot: null, ssh: null, sudo: null };
  delete context.__c4LastSshGraph;
  delete context.__c4LastSudoGraph;
  delete context.__c4LastSnapshot;
  context.__c4PublicCallTrace = publicCalls;
  context.__c4PublicAudit = publicAudit;
  context.__c4CaptureInitialBoundary = (kind, snapshot, ssh, sudo) => {
    publicAudit.initialBoundaryCaptureCount += 1;
    const boundary = c4InitialBoundaryAudit(kind, snapshot, ssh, sudo);
    publicAudit.initialBoundaryAudits.push(boundary);
    budgetLedgerReferences.snapshot = snapshot;
    if (ssh !== null) budgetLedgerReferences.ssh = ssh;
    if (sudo !== null) budgetLedgerReferences.sudo = sudo;
    if (kind === "sudo" && publicAudit.initialFixedShape === null) {
      publicAudit.initialShapeCaptureCount += 1;
      publicAudit.initialFixedShape = c4FixedShapeAudit(snapshot, ssh, sudo);
      publicAudit.initialBudgetAudit = c4InitialBudgetAudit(snapshot, ssh, sudo);
      publicAudit.budgetLedger = c4CreateIndependentBudgetLedger();
    }
  };
  context.__c4LedgerSignal = (kind, subject, value) =>
    c4ApplyIndependentBudgetSignal(publicAudit.budgetLedger, budgetLedgerReferences,
      kind, subject, value);
  c4ContractErrorReferences = contractErrorReferences;
  c4ProjectionFreezeReferences = projectionFreezeReferences;
  nativeBuffer.prototype.toString = c4InstrumentedBufferToString;
  try {
    let rawErrorAudit = null;
    const call = c4AllocatedCall(() => {
      try {
        return operation();
      } catch (error) {
        rawErrorAudit = c4RawContractErrorAudit(error);
        throw error;
      }
    });
    for (let index = 0; index < publicAudit.projectionFreezeEvents.length; index += 1) {
      publicAudit.projectionFreezeEvents[index].returnedRoot = call.result.ok
        && projectionFreezeReferences[index] === call.result.value;
    }
    c4ContractErrorReferences = null;
    c4ProjectionFreezeReferences = null;
    const mainPublicCalls = [...publicCalls];
    let terminalFollowUp = null;
    if (!call.result.ok && ["include", "coverage", "topology"].includes(mainPublicCalls[0])
      && context.__c4LastSshGraph) {
      const trapCalls = new nativeArray();
      const trapInput = c4TrapInput("exact", trapCalls);
      const beforeState = c4TerminalBudgetState(context.__c4LastSshGraph);
      const beforeLifecycle = c3LifecycleProgressStamp(c3LifecycleCurrent);
      delete context.__c4PublicCallTrace;
      const followUp = c4AllocatedCall(() => api.__test_deriveAuthorizationSshSyntax(
        context.__c4LastSshGraph,
        trapInput.pathOperations,
        trapInput.sourceOperations
      ));
      const afterState = c4TerminalBudgetState(context.__c4LastSshGraph);
      const afterLifecycle = c3LifecycleProgressStamp(c3LifecycleCurrent);
      terminalFollowUp = {
        ok: followUp.result.ok,
        error: followUp.result.error || null,
        allocations: followUp.allocations,
        operationCalls: trapCalls.length,
        trackedBuffersZero: followUp.trackedBuffersZero,
        beforeLifecycle,
        afterLifecycle,
        beforeState,
        afterState
      };
    }
    return { ...call, publicCalls: mainPublicCalls, publicAudit, rawErrorAudit, terminalFollowUp };
  } finally {
    c4ContractErrorReferences = null;
    c4ProjectionFreezeReferences = null;
    nativeBuffer.prototype.toString = nativeBufferToString;
    delete context.__c4PublicCallTrace;
    delete context.__c4PublicAudit;
    delete context.__c4CaptureInitialBoundary;
    delete context.__c4LedgerSignal;
    delete context.__c4LastSshGraph;
    delete context.__c4LastSudoGraph;
    delete context.__c4LastSnapshot;
  }
}

function c4OrdinaryPublicCall(operation, operationCalls) {
  const tracker = c3CreateLifecycleTracker();
  tracker.c4RawReferences = {
    graph: null,
    syntax: null,
    policy: null,
    snapshot: null,
    registry: null,
    registryStable: true
  };
  const call = c3LifecyclePhase(tracker, "c4OrdinaryPublic", null, operationCalls,
    () => c4AllocatedPublicCall(operation));
  const lifecycle = c3LifecycleSummary(tracker);
  const phase = lifecycle.phases.find((entry) => entry.name === "c4OrdinaryPublic");
  const registryAudit = c4PublicRegistryAudit(phase);
  const verifyAllocationAudit = c4VerifyAllocationAudit(phase);
  tracker.c4RawReferences.graph = null;
  tracker.c4RawReferences.syntax = null;
  tracker.c4RawReferences.policy = null;
  tracker.c4RawReferences.snapshot = null;
  tracker.c4RawReferences.registry = null;
  return { ...call, registryAudit, verifyAllocationAudit };
}

function c4CoverageFreezeAudit(coverage) {
  const branches = new nativeArray();
  for (const branch of coverage.branches) {
    const conditions = new nativeArray();
    for (const condition of branch.conditions) {
      const patterns = new nativeArray();
      for (const pattern of condition.patterns) {
        patterns.push({
          frozen: nativeObject.isFrozen(pattern),
          keys: nativeObject.keys(pattern)
        });
      }
      conditions.push({
        frozen: nativeObject.isFrozen(condition),
        keys: nativeObject.keys(condition),
        patternsFrozen: nativeObject.isFrozen(condition.patterns),
        patterns
      });
    }
    branches.push({
      frozen: nativeObject.isFrozen(branch),
      keys: nativeObject.keys(branch),
      conditionsFrozen: nativeObject.isFrozen(branch.conditions),
      variableDimensionsFrozen: nativeObject.isFrozen(branch.variableDimensions),
      conditions
    });
  }
  return {
    rootFrozen: nativeObject.isFrozen(coverage),
    rootKeys: nativeObject.keys(coverage),
    groupIdsFrozen: nativeObject.isFrozen(coverage.groupIds),
    branchesFrozen: nativeObject.isFrozen(coverage.branches),
    recursive: c4RecursiveFreezeAudit(coverage),
    branches
  };
}

function c4Coverage(source, accountOverrides = {}, environmentOptions = {}) {
  const binding = c4Binding();
  const account = c4ProjectedAccount(binding, accountOverrides);
  const environment = c3Environment([[C3_ROOT, source]], [], environmentOptions);
  const input = c4OperationInput(environment);
  const call = c4OrdinaryPublicCall(() => api.buildCanonicalSshMatchCoverage(account.core, input), environment.calls);
  const freezeAudit = call.result.ok ? c4CoverageFreezeAudit(call.result.value) : null;
  return { ...call, calls: environment.calls, fdAudit: environment.fdAudit(), accountReads: account.reads, freezeAudit };
}

function c4CoverageFromFiles(fileSpecs, directorySpecs, accountOverrides = {}) {
  const binding = c4Binding();
  const account = c4ProjectedAccount(binding, accountOverrides);
  const environment = c3Environment(fileSpecs, directorySpecs);
  const input = c4OperationInput(environment);
  const call = c4OrdinaryPublicCall(() => api.buildCanonicalSshMatchCoverage(account.core, input), environment.calls);
  const freezeAudit = call.result.ok ? c4CoverageFreezeAudit(call.result.value) : null;
  return { ...call, calls: environment.calls, fdAudit: environment.fdAudit(), accountReads: account.reads, freezeAudit };
}

function c4Include(source, environmentOptions = {}) {
  const environment = c3Environment([[C3_ROOT, source]], [], environmentOptions);
  const input = c4OperationInput(environment);
  const call = c4OrdinaryPublicCall(() => api.buildCanonicalSshIncludeClosure(input), environment.calls);
  return {
    ...call,
    expected: c4ExpectedClosure(source),
    freezeAudit: call.result.ok ? c4RecursiveFreezeAudit(call.result.value) : null,
    calls: environment.calls,
    fdAudit: environment.fdAudit()
  };
}

function c4HashCanonical(value) {
  return crypto.createHash("sha256").update(nativeJSON.stringify(value) + "\n", "utf8").digest("hex");
}

function c4CanonicalPreimageOracle(value) {
  const jsonLf = nativeJSON.stringify(value) + "\n";
  return {
    length: nativeBuffer.byteLength(jsonLf, "utf8"),
    sha256: crypto.createHash("sha256").update(jsonLf, "utf8").digest("hex")
  };
}

function c4ExpectedClosure(source) {
  return {
    schemaVersion: "1",
    type: "japan_ci_sshd_source_closure",
    rootConfig: C3_ROOT,
    files: [{
      ordinal: 0,
      path: C3_ROOT,
      sha256: crypto.createHash("sha256").update(source, "utf8").digest("hex"),
      uid: 0,
      gid: 0,
      mode: 0o644,
      nlink: 1
    }]
  };
}

function c4ExpectedBranch(ordinal, lineNumber, conditions, accountDisposition, variableDimensions = []) {
  return { ordinal, sourceOrdinal: 0, lineNumber, conditions, accountDisposition, variableDimensions };
}

function c4ExpectedCoverage(branches = [], accountOverrides = {}) {
  const account = c4AccountRecord(accountOverrides);
  const groupIds = [...account.groupIds].sort((left, right) => left - right);
  return {
    schemaVersion: "1",
    type: "japan_ci_sshd_match_coverage",
    username: "gccgw-japan-repair-ci",
    groupIds,
    branches
  };
}

function c4AuthorizationFixture(keyByte = 7, marker = "test-gate") {
  const algorithm = nativeBuffer.from("ssh-ed25519", "ascii");
  const key = nativeBuffer.alloc(32, keyByte);
  const blob = nativeBuffer.alloc(4 + algorithm.length + 4 + key.length);
  blob.writeUInt32BE(algorithm.length, 0);
  algorithm.copy(blob, 4);
  blob.writeUInt32BE(key.length, 4 + algorithm.length);
  key.copy(blob, 8 + algorithm.length);
  const options = "restrict,no-pty,no-agent-forwarding,no-port-forwarding,no-X11-forwarding,command=\"/usr/bin/sudo -n -- /usr/local/libexec/gccgw/japan-tuic-additive-repair-entrypoint\"";
  const lineText = options + " ssh-ed25519 " + blob.toString("base64") + " " + marker;
  const line = nativeBuffer.from(lineText, "ascii");
  const file = nativeBuffer.alloc(line.length + 1);
  line.copy(file, 0);
  file[file.length - 1] = 10;
  return { algorithm, key, blob, line, file, lineText };
}

function c4LineForBinding(file) {
  return file.length > 0 && file[file.length - 1] === 10 ? file.subarray(0, file.length - 1) : file;
}

function c4AuthorizationFileFromBlob(blob, algorithm = "ssh-ed25519", marker = "test-gate", extraToken = "") {
  const options = "restrict,no-pty,no-agent-forwarding,no-port-forwarding,no-X11-forwarding,command=\"/usr/bin/sudo -n -- /usr/local/libexec/gccgw/japan-tuic-additive-repair-entrypoint\"";
  const extra = extraToken === "" ? "" : " " + extraToken;
  return nativeBuffer.from(options + " " + algorithm + " " + blob.toString("base64") + extra + " " + marker + "\n", "ascii");
}

function c4ExpectedTopology(closure, coverage, overrides = {}) {
  return {
    schemaVersion: "1",
    type: "japan_ci_ssh_authorization_topology",
    username: "gccgw-japan-repair-ci",
    uid: 975,
    homeDirectory: "/var/lib/gccgw-japan-repair-ci",
    loginShell: "/usr/bin/dash",
    passwordLocked: true,
    authenticationMethods: ["publickey"],
    pubkeyAuthentication: true,
    passwordAuthentication: false,
    keyboardInteractiveAuthentication: false,
    hostbasedAuthentication: false,
    gssapiAuthentication: false,
    kerberosAuthentication: false,
    permitUserEnvironment: false,
    acceptedEnvironmentNames: [],
    forceCommand: "none",
    chrootDirectory: "none",
    disableForwarding: true,
    permitTunnel: false,
    authorizedKeysFiles: ["/etc/ssh/authorized_keys/gccgw-japan-repair-ci"],
    authorizedKeysCommand: "none",
    authorizedPrincipalsFiles: [],
    authorizedPrincipalsCommand: "none",
    trustedUserCAKeys: [],
    activeAuthorizationEntryCount: 1,
    targetKeyOccurrenceCount: 1,
    addressDependentAuthorizationBranchCount: 0,
    includeClosureSha256: c4HashCanonical(closure),
    matchCoverageSha256: c4HashCanonical(coverage),
    ...overrides
  };
}

function c4RecursiveFreezeAudit(value) {
  const pending = [value];
  let containerCount = 0;
  let allFrozen = true;
  let proxyCount = 0;
  let symbolCount = 0;
  let accessorCount = 0;
  let unexpectedNonEnumerableCount = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === null || typeof current !== "object") continue;
    containerCount += 1;
    if (types.isProxy(current)) {
      proxyCount += 1;
      allFrozen = false;
      continue;
    }
    if (!nativeObject.isFrozen(current)) allFrozen = false;
    symbolCount += nativeObject.getOwnPropertySymbols(current).length;
    for (const name of nativeObject.getOwnPropertyNames(current)) {
      const descriptor = nativeObject.getOwnPropertyDescriptor(current, name);
      const data = !!descriptor && nativeObject.hasOwn(descriptor, "value")
        && descriptor.get === undefined && descriptor.set === undefined;
      if (!data) accessorCount += 1;
      if (descriptor && descriptor.enumerable !== true
        && !(nativeArray.isArray(current) && name === "length")) {
        unexpectedNonEnumerableCount += 1;
      }
      if (data) pending.push(descriptor.value);
    }
  }
  return {
    rootFrozen: value !== null && typeof value === "object" && nativeObject.isFrozen(value),
    allFrozen,
    containerCount,
    proxyCount,
    symbolCount,
    accessorCount,
    unexpectedNonEnumerableCount,
    rawShape: c4ProjectionRawShapeAudit(value)
  };
}

function c4Topology(source, options = {}) {
  const fixture = options.fixture || c4AuthorizationFixture();
  const expectedClosure = c4ExpectedClosure(source);
  const expectedCoverage = options.expectedCoverage || c4ExpectedCoverage([], options.accountOverrides || {});
  const expected = c4ExpectedTopology(expectedClosure, expectedCoverage, options.expectedOverrides || {});
  const canonicalLine = options.canonicalLine || fixture.line;
  const canonicalBlob = options.canonicalBlob || fixture.blob;
  const boundLineSha256 = options.bindingDrift === "line"
    ? "0".repeat(64)
    : crypto.createHash("sha256").update(canonicalLine).digest("hex");
  const boundBlobSha256 = options.bindingDrift === "blob"
    ? "0".repeat(64)
    : crypto.createHash("sha256").update(canonicalBlob).digest("hex");
  const boundEffectiveSha256 = options.bindingDrift === "effective"
    ? "0".repeat(64)
    : c4HashCanonical(expected);
  const binding = c4Binding({
    sshAuthorization: {
      authorizedKeysLineSha256: boundLineSha256,
      publicKeyBlobSha256: boundBlobSha256,
      effectiveConfigSha256: boundEffectiveSha256
    }
  });
  const initialBindingDigests = {
    line: binding.sshAuthorization.authorizedKeysLineSha256,
    blob: binding.sshAuthorization.publicKeyBlobSha256,
    effective: binding.sshAuthorization.effectiveConfigSha256
  };
  const account = c4ProjectedAccount(binding, options.accountOverrides || {});
  const authFile = options.authFile === undefined ? fixture.file : options.authFile;
  const environment = c3Environment([
    [C3_ROOT, source],
    ["/etc/ssh/authorized_keys/gccgw-japan-repair-ci", authFile, options.authMetadata || { mode: 0o600 }]
  ], [], options.environmentOptions || {});
  const verificationScopes = new nativeArray();
  let bindingMutationCount = 0;
  const bindingMutation = options.bindingMutationDigests === undefined ? null : () => {
    binding.sshAuthorization.authorizedKeysLineSha256 = options.bindingMutationDigests.line;
    binding.sshAuthorization.publicKeyBlobSha256 = options.bindingMutationDigests.blob;
    bindingMutationCount += 1;
  };
  const input = c4OperationInput(
    environment,
    options.operationMutation || null,
    verificationScopes,
    bindingMutation
  );
  context.__c4AuthorizationRecordLength = authFile.length;
  let topology;
  try {
    topology = c4OrdinaryPublicCall(() => api.buildCanonicalSshTopology(account.core, binding, input), environment.calls);
  } finally {
    delete context.__c4AuthorizationRecordLength;
  }
  const freezeAudit = topology.result.ok ? c4RecursiveFreezeAudit(topology.result.value) : null;
  const authorizationHashOracle = {
    line: {
      length: canonicalLine.length,
      sha256: crypto.createHash("sha256").update(canonicalLine).digest("hex")
    },
    blob: {
      length: canonicalBlob.length,
      sha256: crypto.createHash("sha256").update(canonicalBlob).digest("hex")
    },
    legacyWholeFile: {
      length: authFile.length,
      sha256: crypto.createHash("sha256").update(authFile).digest("hex")
    }
  };
  fixture.algorithm.fill(0);
  fixture.key.fill(0);
  fixture.blob.fill(0);
  fixture.line.fill(0);
  fixture.file.fill(0);
  return {
    expectedClosure,
    expectedCoverage,
    topology,
    freezeAudit,
    expected,
    calls: environment.calls,
    verificationScopes,
    authorizationHashOracle,
    fdAudit: environment.fdAudit(),
    accountReads: account.reads,
    bindingMutationCount,
    initialBindingDigests,
    bindingDigests: {
      line: binding.sshAuthorization.authorizedKeysLineSha256,
      blob: binding.sshAuthorization.publicKeyBlobSha256,
      effective: binding.sshAuthorization.effectiveConfigSha256
    }
  };
}

function c4PublicPostFaultAudit(phase, operationCalls) {
  const stamp = phase.faultStamp;
  if (stamp === null) return null;
  const progress = phase.progress;
  const postFaultFills = phase.fills.filter((entry) => entry.action > stamp.action);
  const postFaultRegistry = phase.registry.slice(stamp.registryEvents);
  const postFaultOperations = operationCalls.slice(stamp.operationCalls).map((entry) => [...entry]);
  return {
    allocations: progress.allocations - stamp.allocations,
    hashes: progress.hashes - stamp.hashes,
    copies: progress.copies - stamp.copies,
    pushes: progress.pushes - stamp.pushes,
    fixedReserves: progress.fixedReserves - stamp.fixedReserves,
    semanticReserves: progress.semanticReserves - stamp.semanticReserves,
    preimageReserves: progress.preimageReserves - stamp.preimageReserves,
    workAttempts: progress.workAttempts - stamp.workAttempts,
    matcherAttempts: progress.matcherAttempts - stamp.matcherAttempts,
    forwardWork: progress.forwardWork - stamp.forwardWork,
    projectionFreezes: progress.projectionFreezes - stamp.projectionFreezes,
    fillCount: postFaultFills.length,
    nonzeroFillCount: postFaultFills.filter((entry) => entry.zero !== true).length,
    operationCalls: postFaultOperations,
    nonCloseOperationCount: postFaultOperations.filter((entry) => entry[0] !== "close").length,
    registryEvents: postFaultRegistry.map((entry) => ({
      ordinal: entry.ordinal,
      method: entry.method,
      keyIdentity: entry.keyIdentity ?? null,
      provenanceRegistry: entry.provenanceRegistry,
      sameGraph: entry.sameGraph,
      graphFailed: entry.graphFailed,
      snapshotFailed: entry.snapshotFailed,
      authorizationEntryCount: entry.authorizationEntryCount,
      result: entry.result === undefined ? null : entry.result
    }))
  };
}

function c4PublicRegistryAudit(phase) {
  const allEvents = phase.registry.filter((entry) => Number.isSafeInteger(entry.ordinal)).map((entry) => ({
    ordinal: entry.ordinal,
    method: entry.method,
    keyIdentity: entry.keyIdentity ?? null,
    keyShape: entry.keyShape,
    provenanceRegistry: entry.provenanceRegistry,
    sameGraph: entry.sameGraph,
    graphFailed: entry.graphFailed,
    snapshotFailed: entry.snapshotFailed,
    authorizationEntryCount: entry.authorizationEntryCount,
    result: entry.result === undefined ? null : entry.result
  }));
  const provenanceEvents = allEvents.filter((entry) => entry.provenanceRegistry === true);
  return {
    allEvents,
    provenanceEvents,
    foreignRegistryEvents: allEvents.filter((entry) => entry.provenanceRegistry !== true),
    snapshotEvents: allEvents.filter((entry) => entry.keyIdentity === "snapshot"),
    unknownEvents: allEvents.filter((entry) => !["snapshot", "syntax", "policy"].includes(entry.keyIdentity))
  };
}

const C4_VERIFY_CONTAINER_ALLOCATION_KINDS = nativeObject.freeze([
  "array", "map", "objectCall", "objectCreate", "proxy", "set", "weakMap", "weakSet"
]);

function c4VerifyAllocationAudit(phase) {
  const allocations = phase.allocationActions.filter((entry) => entry.publicStage === "verify");
  const byteAllocations = phase.byteAllocationActions.filter((entry) => entry.publicStage === "verify");
  const containerAllocations = allocations.filter((entry) =>
    C4_VERIFY_CONTAINER_ALLOCATION_KINDS.includes(entry.kind));
  const allocationKinds = nativeObject.create(null);
  for (const entry of allocations) {
    allocationKinds[entry.kind] = (allocationKinds[entry.kind] || 0) + 1;
  }
  return {
    allocationCount: allocations.length,
    allocationKinds: { ...allocationKinds },
    allocationOrdinals: allocations.map((entry) => entry.ordinal),
    byteAllocationCount: byteAllocations.length,
    byteAllocationKinds: byteAllocations.map((entry) => entry.kind),
    byteAllocationOrdinals: byteAllocations.map((entry) => entry.ordinal),
    byteAllocationRequestedLengths: byteAllocations.map((entry) => entry.requestedLength),
    byteAllocationActualLengths: byteAllocations.map((entry) => entry.actualLength ?? null),
    byteAllocationOperationCalls: byteAllocations.map((entry) => entry.operationCalls ?? null),
    fixedReserveCount: phase.fixedReserves.filter((entry) => entry.publicStage === "verify").length,
    fixedAllocationCount: phase.fixedAllocations.filter((entry) => entry.publicStage === "verify").length,
    preimageReserveCount: phase.preimageReserves.filter((entry) => entry.publicStage === "verify").length,
    preimageAllocationCount: phase.roleAllocations.filter((entry) =>
      entry.publicStage === "verify" && entry.role === "preimage").length,
    containerAllocationCount: containerAllocations.length,
    containerAllocationKinds: containerAllocations.map((entry) => entry.kind)
  };
}

function c4PublicPreimageWitness(kind, failEffectiveDigest = false, fault = null) {
  const source = c4SafeLines() + "Match User gccgw-japan-repair-ci Group ops\n";
  const expectedClosure = c4ExpectedClosure(source);
  const expectedCoverage = c4ExpectedCoverage([
    c4ExpectedBranch(0, 12, [{
      name: "user",
      patterns: [{ negated: false, value: "gccgw-japan-repair-ci" }]
    }, {
      name: "group",
      patterns: [{ negated: false, value: "ops" }]
    }], "exact_user")
  ]);
  const fixture = c4AuthorizationFixture();
  const expectedTopology = c4ExpectedTopology(expectedClosure, expectedCoverage);
  const binding = c4Binding({
    sshAuthorization: {
      authorizedKeysLineSha256: crypto.createHash("sha256").update(fixture.line).digest("hex"),
      publicKeyBlobSha256: crypto.createHash("sha256").update(fixture.blob).digest("hex"),
      effectiveConfigSha256: failEffectiveDigest ? "0".repeat(64) : c4HashCanonical(expectedTopology)
    }
  });
  const account = kind === "include" ? null : c4ProjectedAccount(binding).core;
  const specs = kind === "topology"
    ? [[C3_ROOT, source], ["/etc/ssh/authorized_keys/gccgw-japan-repair-ci", fixture.file, { mode: 0o600 }]]
    : kind === "coverage" || kind === "include"
    ? [[C3_ROOT, source]]
    : [];
  const environment = c3Environment(specs, []);
  const input = c4OperationInput(environment);
  const stateCalls = environment.calls;
  const tracker = c3CreateLifecycleTracker();
  tracker.c4RawReferences = {
    graph: null,
    syntax: null,
    policy: null,
    snapshot: null,
    registry: null,
    registryStable: true
  };
  const phaseName = kind === "include"
    ? "c4PublicInclude"
    : kind === "coverage" ? "c4PublicCoverage" : "c4PublicTopology";
  if (kind === "topology") context.__c4AuthorizationRecordLength = fixture.file.length;
  let call;
  try {
    call = c3LifecyclePhase(tracker, phaseName, null, stateCalls,
      () => c4AllocatedPublicCall(() => kind === "coverage"
        ? api.buildCanonicalSshMatchCoverage(account, input)
        : kind === "include"
          ? api.buildCanonicalSshIncludeClosure(input)
          : api.buildCanonicalSshTopology(account, binding, input)), fault);
  } finally {
    delete context.__c4AuthorizationRecordLength;
  }
  const lifecycle = c3LifecycleSummary(tracker);
  const preimages = c4LifecyclePreimageAudit(lifecycle, phaseName);
  const preimagePhase = lifecycle.phases.find((entry) => entry.name === phaseName);
  const postFaultAudit = c4PublicPostFaultAudit(preimagePhase, environment.calls);
  const registryAudit = c4PublicRegistryAudit(preimagePhase);
  const references = tracker.c4RawReferences;
  const provenance = references.graph === null ? null : c4RawProvenanceState(
    tracker,
    references.graph,
    references.policy
  );
  const finalState = references.graph === null || references.snapshot === null ? null : {
    graphFailed: references.graph.failed,
    snapshotFailed: references.snapshot.failed,
    authorizationEntryCount: references.snapshot.authorizationEntryCount
  };
  tracker.c4RawReferences.graph = null;
  tracker.c4RawReferences.syntax = null;
  tracker.c4RawReferences.policy = null;
  tracker.c4RawReferences.snapshot = null;
  tracker.c4RawReferences.registry = null;
  tracker.c4RawReferences = null;
  fixture.algorithm.fill(0);
  fixture.key.fill(0);
  fixture.blob.fill(0);
  fixture.line.fill(0);
  fixture.file.fill(0);
  return {
    kind,
    failEffectiveDigest,
    fault: fault === null ? null : { ...fault },
    faultTriggered: preimagePhase.faultTriggered,
    faultTriggerCount: preimagePhase.faultTriggerCount,
    faultStamp: preimagePhase.faultStamp,
    postFaultAudit,
    registryAudit,
    result: { ok: call.result.ok, error: call.result.error || null },
    preimages,
    preimagePendingCount: preimagePhase.preimagePendingCount,
    oraclePreimages: kind === "include"
      ? [c4CanonicalPreimageOracle(expectedClosure)]
      : kind === "coverage"
        ? [c4CanonicalPreimageOracle(expectedClosure), c4CanonicalPreimageOracle(expectedCoverage)]
        : [
            c4CanonicalPreimageOracle(expectedClosure),
            c4CanonicalPreimageOracle(expectedCoverage),
            c4CanonicalPreimageOracle(expectedTopology)
          ],
    trackedBuffersZero: call.trackedBuffersZero,
    lifecycle,
    phaseName,
    provenance,
    finalState,
    buffersZero: c4RunnerOwnedLifecycleBytesZero(lifecycle),
    verifyAllocationAudit: c4VerifyAllocationAudit(preimagePhase),
    fdAudit: environment.fdAudit(),
    operationAudit: {
      rootOpenCount: environment.calls.filter((entry) => entry[0] === "open" && entry[1] === "file-0").length,
      authorizationOpenCount: environment.calls.filter((entry) => entry[0] === "open" && entry[1] === "file-1").length,
      readDirectoryCount: environment.calls.filter((entry) => entry[0] === "readDirectory").length,
      validateSudoersCount: environment.calls.filter((entry) => entry[0] === "validateSudoers").length,
      calls: environment.calls.map((entry) => [...entry])
    },
    publicCalls: call.publicCalls,
    publicAudit: call.publicAudit,
    rawErrorAudit: call.rawErrorAudit,
    terminalFollowUp: call.terminalFollowUp
  };
}

function c4RunnerOwnedLifecycleBytesZero(lifecycle) {
  return lifecycle.bytes
    .filter((entry) => !(entry.roles.length === 1 && entry.roles[0] === "sourceFixture"))
    .every((entry) => entry.zero === true);
}

function c4PublicOwnedStages(kind) {
  if (kind === "include") return ["deriveSyntax:complete"];
  if (kind === "coverage") return ["derivePolicy", "derivePolicy:complete"];
  return ["derivePolicy", "derivePolicy:complete", "verify", "verify:complete"];
}

const C4_PUBLIC_FAULT_EXPECTATION_TABLE = nativeObject.freeze({
  "include|deriveSyntax:complete|fixed-envelope": nativeObject.freeze({
    faultKind: "fixedOrdinal", freezeTrace: nativeObject.freeze(["include@deriveSyntax"]),
    topologyFreezeCount: 0
  }),
  "coverage|derivePolicy|fixed-envelope": nativeObject.freeze({
    faultKind: "fixedOrdinal", freezeTrace: nativeObject.freeze(["include@deriveSyntax"]),
    topologyFreezeCount: 0
  }),
  "coverage|derivePolicy|preimage-allocation": nativeObject.freeze({
    faultKind: "allocationRole",
    freezeTrace: nativeObject.freeze(["include@deriveSyntax", "coverage@derivePolicy"]),
    topologyFreezeCount: 0
  }),
  "coverage|derivePolicy|preimage-hash": nativeObject.freeze({
    faultKind: "hash",
    freezeTrace: nativeObject.freeze(["include@deriveSyntax", "coverage@derivePolicy"]),
    topologyFreezeCount: 0
  }),
  "coverage|derivePolicy|preimage-fill": nativeObject.freeze({
    faultKind: "fill",
    freezeTrace: nativeObject.freeze(["include@deriveSyntax", "coverage@derivePolicy"]),
    topologyFreezeCount: 0
  }),
  "topology|derivePolicy|fixed-envelope": nativeObject.freeze({
    faultKind: "fixedOrdinal", freezeTrace: nativeObject.freeze(["include@deriveSyntax"]),
    topologyFreezeCount: 0
  }),
  "topology|derivePolicy|preimage-allocation": nativeObject.freeze({
    faultKind: "allocationRole",
    freezeTrace: nativeObject.freeze(["include@deriveSyntax", "coverage@derivePolicy"]),
    topologyFreezeCount: 0
  }),
  "topology|derivePolicy|preimage-hash": nativeObject.freeze({
    faultKind: "hash",
    freezeTrace: nativeObject.freeze(["include@deriveSyntax", "coverage@derivePolicy"]),
    topologyFreezeCount: 0
  }),
  "topology|derivePolicy|preimage-fill": nativeObject.freeze({
    faultKind: "fill",
    freezeTrace: nativeObject.freeze(["include@deriveSyntax", "coverage@derivePolicy"]),
    topologyFreezeCount: 0
  }),
  "topology|verify|authorization-transient-cleanup": nativeObject.freeze({
    faultKind: "fill",
    freezeTrace: nativeObject.freeze(["include@deriveSyntax", "coverage@derivePolicy"]),
    topologyFreezeCount: 0
  }),
  "topology|verify|authorization-verify-byte-allocation": nativeObject.freeze({
    faultKind: "allocationOrdinal",
    freezeTrace: nativeObject.freeze(["include@deriveSyntax", "coverage@derivePolicy"]),
    topologyFreezeCount: 0
  }),
  "topology|verify|authorization-verify-hash": nativeObject.freeze({
    faultKind: "hash",
    freezeTrace: nativeObject.freeze(["include@deriveSyntax", "coverage@derivePolicy"]),
    topologyFreezeCount: 0
  }),
  "topology|verify:complete|fixed-envelope": nativeObject.freeze({
    faultKind: "fixedOrdinal",
    freezeTrace: nativeObject.freeze(["include@deriveSyntax", "coverage@derivePolicy"]),
    topologyFreezeCount: 0
  }),
  "topology|verify:complete|preimage-allocation": nativeObject.freeze({
    faultKind: "allocationRole",
    freezeTrace: nativeObject.freeze([
      "include@deriveSyntax", "coverage@derivePolicy", "topology@verify:complete"
    ]),
    topologyFreezeCount: 1
  }),
  "topology|verify:complete|preimage-hash": nativeObject.freeze({
    faultKind: "hash",
    freezeTrace: nativeObject.freeze([
      "include@deriveSyntax", "coverage@derivePolicy", "topology@verify:complete"
    ]),
    topologyFreezeCount: 1
  }),
  "topology|verify:complete|preimage-fill": nativeObject.freeze({
    faultKind: "fill",
    freezeTrace: nativeObject.freeze([
      "include@deriveSyntax", "coverage@derivePolicy", "topology@verify:complete"
    ]),
    topologyFreezeCount: 1
  })
});

function c4PublicFaultSpecifications(calibration) {
  const phase = calibration.lifecycle.phases.find((entry) => entry.name === calibration.phaseName);
  const allowedStages = c4PublicOwnedStages(calibration.kind);
  const specifications = new nativeArray();
  const seen = new nativeSet();
  function add(site, publicStage, fault, calibrationPoint) {
    const key = nativeJSON.stringify(fault);
    if (seen.has(key)) return;
    if (!calibrationPoint
      || !Number.isSafeInteger(calibrationPoint.action)
      || !Number.isSafeInteger(calibrationPoint.operationCalls)
      || !Number.isSafeInteger(calibrationPoint.projectionFreezes)) {
      throw new Error("missing C4 calibration point: " + calibration.kind + ":" + site + ":" + publicStage);
    }
    seen.add(key);
    specifications.push({
      site,
      publicStage,
      fault,
      expectedAction: calibrationPoint.action,
      expectedProjectionFreezeCount: calibrationPoint.projectionFreezes,
      expectedOperationCalls: calibration.operationAudit.calls
        .slice(0, calibrationPoint.operationCalls).map((entry) => [...entry])
    });
  }
  for (const allocation of phase.fixedAllocations) {
    if (allowedStages.includes(allocation.publicStage)) {
      add("fixed-envelope", allocation.publicStage,
        { kind: "fixedOrdinal", ordinal: allocation.ordinal }, allocation);
    }
  }
  const preimageFillOrdinals = new nativeSet();
  const preimageHashOrdinals = new nativeSet();
  for (const preimage of calibration.preimages) {
    if (!allowedStages.includes(preimage.publicStage)) continue;
    const allocation = phase.roleAllocations.find((entry) =>
      entry.role === "preimage" && entry.ordinal === preimage.ordinal);
    add("preimage-allocation", preimage.publicStage, {
      kind: "allocationRole", role: "preimage", ordinal: preimage.ordinal
    }, allocation);
    for (const span of preimage.hashSpans) {
      preimageHashOrdinals.add(span.hashOrdinal);
      const hash = phase.hashActions.find((entry) => entry.ordinal === span.hashOrdinal);
      add("preimage-hash", span.publicStage,
        { kind: "hash", ordinal: span.hashOrdinal }, hash);
    }
    for (const ordinal of preimage.fillOrdinals) {
      preimageFillOrdinals.add(ordinal);
      const fill = phase.fills.find((entry) => entry.ordinal === ordinal);
      add("preimage-fill", preimage.publicStage, { kind: "fill", ordinal }, fill);
    }
  }
  if (calibration.kind === "topology") {
    const sourceFixtureIds = new nativeSet(calibration.lifecycle.bytes
      .filter((entry) => entry.roles.includes("sourceFixture"))
      .map((entry) => entry.id));
    const verifyByteAllocations = phase.byteAllocationActions.filter((entry) =>
      entry.publicStage === "verify"
        && entry.preimageReserveOrdinal === null
        && !sourceFixtureIds.has(entry.byteId));
    if (verifyByteAllocations.length === 0) {
      throw new Error("missing C4 verify non-preimage byte allocation calibration");
    }
    for (const allocation of verifyByteAllocations) {
      add("authorization-verify-byte-allocation", allocation.publicStage,
        { kind: "allocationOrdinal", ordinal: allocation.ordinal }, allocation);
    }
    const verifyHashes = phase.hashActions.filter((entry) =>
      entry.publicStage === "verify" && !preimageHashOrdinals.has(entry.ordinal));
    if (verifyHashes.length !== 2) {
      throw new Error("unexpected C4 verify hash calibration count");
    }
    for (const hash of verifyHashes) {
      add("authorization-verify-hash", hash.publicStage,
        { kind: "hash", ordinal: hash.ordinal }, hash);
    }
    for (const fill of phase.fills) {
      if (fill.publicStage === "verify" && fill.zero === true && !preimageFillOrdinals.has(fill.ordinal)) {
        add("authorization-transient-cleanup", fill.publicStage,
          { kind: "fill", ordinal: fill.ordinal }, fill);
      }
    }
  }
  return specifications;
}

function c4CompactPublicFailure(witness) {
  return {
    fault: witness.fault,
    faultTriggered: witness.faultTriggered,
    faultTriggerCount: witness.faultTriggerCount,
    faultStamp: witness.faultStamp,
    postFaultAudit: witness.postFaultAudit,
    registryAudit: witness.registryAudit,
    result: witness.result,
    trackedBuffersZero: witness.trackedBuffersZero,
    buffersZero: witness.buffersZero,
    preimagePendingCount: witness.preimagePendingCount,
    preimages: witness.preimages.map((entry) => ({
      publicStage: entry.publicStage,
      zero: entry.zero,
      orphan: entry.orphan,
      fillOrdinals: entry.fillOrdinals
    })),
    publicCalls: witness.publicCalls,
    publicAudit: witness.publicAudit,
    rawErrorAudit: witness.rawErrorAudit,
    provenance: witness.provenance,
    finalState: witness.finalState,
    fdAudit: witness.fdAudit,
    operationAudit: witness.operationAudit,
    verifyAllocationAudit: witness.verifyAllocationAudit,
    terminalFollowUp: witness.terminalFollowUp
  };
}

function c4PublicFaultMatrix(kind, calibration) {
  return c4PublicFaultSpecifications(calibration).map((specification) => {
    const witness = c4PublicPreimageWitness(kind, false, specification.fault);
    return { ...specification, witness: c4CompactPublicFailure(witness) };
  });
}

function c4PublicDisposerMatrix() {
  return [
    ["include-syntax-delete-after", "include", "syntax"],
    ["coverage-policy-delete-after", "coverage", "policy"],
    ["coverage-syntax-delete-after", "coverage", "syntax"],
    ["topology-policy-delete-after", "topology", "policy"],
    ["topology-syntax-delete-after", "topology", "syntax"]
  ].map(([name, kind, identity]) => {
    const witness = c4PublicPreimageWitness(kind, false, { kind: "registryDeleteAfter", identity });
    return { name, kind, identity, witness: c4CompactPublicFailure(witness) };
  });
}

function c4SafeLines(overrides = {}) {
  const values = {
    authenticationmethods: "publickey",
    pubkeyauthentication: "yes",
    passwordauthentication: "no",
    kbdinteractiveauthentication: "no",
    hostbasedauthentication: "no",
    gssapiauthentication: "no",
    kerberosauthentication: "no",
    permituserenvironment: "no",
    disableforwarding: "yes",
    permittunnel: "no",
    authorizedkeysfile: "/etc/ssh/authorized_keys/gccgw-japan-repair-ci",
    ...overrides
  };
  const lines = new nativeArray();
  for (const name of nativeObject.keys(values)) {
    if (values[name] !== null) lines.push(name + " " + values[name]);
  }
  return lines.join("\n") + "\n";
}

function c4PrivateAttempt(kind) {
  const binding = c4Binding();
  const account = c4ProjectedAccount(binding).core;
  const firstState = fresh();
  const source = c4SafeLines() + "Match User gccgw-japan-repair-ci\n";
  const firstEnvironment = c3Environment([[C3_ROOT, source]], []);
  const firstInput = c4OperationInput(firstEnvironment);
  const syntaxResult = safe(() => api.__test_deriveAuthorizationSshSyntax(
    firstState.ssh,
    firstInput.pathOperations,
    firstInput.sourceOperations
  ));
  if (!syntaxResult.ok) return { syntaxResult };
  const syntax = syntaxResult.value;
  let activeState = firstState;
  let graph = firstState.ssh;
  let owner = syntax;
  let candidate = account;
  let foreignState = null;
  let foreignOwner = null;
  if (kind === "plain") candidate = { ...account, groupIds: [...account.groupIds], groupNames: [...account.groupNames] };
  if (kind === "clone") candidate = nativeJSON.parse(nativeJSON.stringify(account));
  if (kind === "frozen-lookalike") candidate = c4FrozenAccountLookalike(account);
  if (kind === "proxy") candidate = new nativeProxy(account, {});
  if (kind === "wrong-graph") {
    activeState = fresh();
    graph = activeState.ssh;
  }
  if (kind === "foreign-syntax") {
    foreignState = fresh();
    const foreignEnvironment = c3Environment([[C3_ROOT, source]], []);
    const foreignInput = c4OperationInput(foreignEnvironment);
    const foreign = safe(() => api.__test_deriveAuthorizationSshSyntax(
      foreignState.ssh,
      foreignInput.pathOperations,
      foreignInput.sourceOperations
    ));
    foreignOwner = foreign.ok ? foreign.value : null;
    owner = foreignOwner;
  }
  if (kind === "disposed-syntax") {
    safe(() => api.__test_disposeAuthorizationSshSyntax(firstState.ssh, syntax));
  }
  let setupPolicy = null;
  let setupPolicyDispose = null;
  if (kind === "live-policy-as-syntax" || kind === "disposed-policy-as-syntax") {
    setupPolicy = c4AllocatedCall(() => api.__test_deriveAuthorizationSshPolicy(
      firstState.ssh,
      syntax,
      account
    ));
    if (!setupPolicy.result.ok) {
      return {
        kind,
        setupPolicy: { ok: false, error: setupPolicy.result.error || null }
      };
    }
    owner = setupPolicy.result.value;
    if (kind === "disposed-policy-as-syntax") {
      setupPolicyDispose = safe(() => api.__test_disposeAuthorizationSshPolicy(firstState.ssh, owner));
    }
  }
  const before = inspect(activeState);
  const beforeCalls = firstEnvironment.calls.length;
  const attempted = c4AllocatedRawCall(() => api.__test_deriveAuthorizationSshPolicy(graph, owner, candidate));
  const afterAttempt = inspect(activeState);
  let reused = null;
  let reusedComparisonDelta = null;
  let reusedOperationDelta = null;
  let disposePolicy = null;
  let failedOwnerDispose = null;
  if (attempted.result.ok) {
    if (kind === "reused-owner") {
      const beforeReuse = inspect(firstState).snapshot.sshMatchComparisonCount;
      const beforeReuseCalls = firstEnvironment.calls.length;
      reused = c4AllocatedRawCall(() => api.__test_deriveAuthorizationSshPolicy(firstState.ssh, syntax, account));
      reusedComparisonDelta = inspect(firstState).snapshot.sshMatchComparisonCount - beforeReuse;
      reusedOperationDelta = firstEnvironment.calls.length - beforeReuseCalls;
    }
    disposePolicy = safe(() => api.__test_disposeAuthorizationSshPolicy(firstState.ssh, attempted.result.value));
  } else if (kind === "live-policy-as-syntax") {
    failedOwnerDispose = safe(() => api.__test_disposeAuthorizationSshPolicy(firstState.ssh, owner));
  }
  const disposeSyntax = safe(() => api.__test_disposeAuthorizationSshSyntax(firstState.ssh, syntax));
  const disposeForeign = foreignOwner
    ? safe(() => api.__test_disposeAuthorizationSshSyntax(foreignState.ssh, foreignOwner))
    : null;
  const after = inspect(activeState);
  let terminalFollowUp = null;
  if (!attempted.result.ok || (reused && !reused.result.ok)) {
    const terminalEnvironment = c3Environment([[C3_ROOT, source]], []);
    const terminalInput = c4OperationInput(terminalEnvironment);
    const terminal = c4AllocatedCall(() => api.__test_deriveAuthorizationSshSyntax(
      activeState.ssh,
      terminalInput.pathOperations,
      terminalInput.sourceOperations
    ));
    terminalFollowUp = {
      ok: terminal.result.ok,
      error: terminal.result.error || null,
      allocations: terminal.allocations,
      calls: terminalEnvironment.calls.length
    };
  }
  return {
    kind,
    attempted: { ok: attempted.result.ok, error: attempted.result.error || null },
    setupPolicy: setupPolicy && { ok: setupPolicy.result.ok, error: setupPolicy.result.error || null },
    setupPolicyDispose: setupPolicyDispose && { ok: setupPolicyDispose.ok, error: setupPolicyDispose.error || null },
    allocations: attempted.allocations,
    trackedBuffersZero: attempted.trackedBuffersZero,
    rawErrorAudit: attempted.rawErrorAudit,
    reused: reused && {
      ok: reused.result.ok,
      error: reused.result.error || null,
      allocations: reused.allocations,
      rawErrorAudit: reused.rawErrorAudit
    },
    reusedComparisonDelta,
    reusedOperationDelta,
    disposePolicy: disposePolicy && { ok: disposePolicy.ok, error: disposePolicy.error || null },
    failedOwnerDispose: failedOwnerDispose && { ok: failedOwnerDispose.ok, error: failedOwnerDispose.error || null },
    disposeSyntax: { ok: disposeSyntax.ok, error: disposeSyntax.error || null },
    disposeForeign: disposeForeign && { ok: disposeForeign.ok, error: disposeForeign.error || null },
    injectedOperationDelta: firstEnvironment.calls.length - beforeCalls,
    comparisonBefore: before.snapshot.sshMatchComparisonCount,
    comparisonAfterAttempt: afterAttempt.snapshot.sshMatchComparisonCount,
    comparisonDelta: afterAttempt.snapshot.sshMatchComparisonCount - before.snapshot.sshMatchComparisonCount,
    comparisonAfter: after.snapshot.sshMatchComparisonCount,
    terminal: after.snapshot.failed,
    terminalFollowUp
  };
}

function c4RawProvenanceState(tracker, graph, returnedPolicy) {
  const references = tracker.c4RawReferences;
  const registry = references && references.registry;
  function stateFor(value) {
    const present = !!registry && value !== null
      && Reflect.apply(nativeWeakMapHas, registry, [value]);
    return {
      present,
      sameGraph: present && Reflect.apply(nativeWeakMapGet, registry, [value]) === graph
    };
  }
  return {
    registryObserved: !!registry,
    registryStable: !!references && references.registryStable,
    policyIdentified: !!references && references.policy !== null,
    syntaxPolicyDistinct: !!references && references.policy !== null
      && references.syntax !== references.policy,
    returnedPolicyIdentity: returnedPolicy === null
      ? null
      : !!references && returnedPolicy === references.policy,
    syntax: stateFor(references && references.syntax),
    policy: stateFor(references && references.policy),
    snapshot: stateFor(references && references.snapshot)
  };
}

function c4ForbiddenAllocationView(allocations) {
  return {
    map: allocations.map,
    set: allocations.set,
    weakMap: allocations.weakMap,
    weakSet: allocations.weakSet,
    bufferFrom: allocations.bufferFrom,
    textEncoder: allocations.textEncoder,
    textEncode: allocations.textEncode,
    jsonStringify: allocations.jsonStringify,
    jsonParse: allocations.jsonParse
  };
}

function c4LifecyclePreimageAudit(lifecycle, phaseName) {
  const phase = lifecycle.phases.find((entry) => entry.name === phaseName);
  if (!phase) return [];
  return phase.preimageReserves.map((reserve) => {
    const buffer = reserve.byteId === null
      ? null
      : lifecycle.bytes.find((entry) => entry.id === reserve.byteId);
    const hashSpans = reserve.byteId === null ? [] : phase.hashActions.flatMap((entry) =>
      entry.updateByteIds.map((byteId, index) => ({
        hashOrdinal: entry.ordinal,
        publicStage: entry.publicStage,
        operationCalls: entry.operationCalls,
        projectionFreezes: entry.projectionFreezes,
        byteId,
        length: entry.updateLengths[index],
        sha256: entry.updateSha256s[index],
        action: entry.updateActions[index]
      })).filter((entry) => entry.byteId === reserve.byteId));
    const zeroFills = reserve.byteId === null ? [] : phase.fills.filter((entry) =>
      entry.byteId === reserve.byteId && entry.zero === true);
    const firstHashSpan = hashSpans[0] || null;
    const firstZeroFill = zeroFills[0] || null;
    return {
      ordinal: reserve.ordinal,
      publicStage: reserve.publicStage,
      reservedLength: reserve.reservedLength,
      requestedLength: reserve.requestedLength,
      actualLength: reserve.actualLength,
      byteId: reserve.byteId,
      reserveAction: reserve.action,
      allocationOrdinal: reserve.allocationOrdinal,
      allocationAction: reserve.allocationAction,
      allocationKind: reserve.allocationKind,
      firstAllocationAfterReserve: reserve.allocationOrdinal === reserve.allocations + 1,
      hashAction: firstHashSpan === null ? null : firstHashSpan.action,
      hashSpans,
      fullSpanHashCount: hashSpans.filter((entry) =>
        entry.length === reserve.actualLength).length,
      fillAction: firstZeroFill === null ? null : firstZeroFill.action,
      fillOrdinals: zeroFills.map((entry) => entry.ordinal),
      zeroFillCount: zeroFills.length,
      zero: buffer === null || buffer.zero,
      orphan: buffer === null,
      claimedAsPreimage: buffer !== null && buffer.roles.includes("preimage")
    };
  });
}

function c4PolicyFaultWitness(fault) {
  const binding = c4Binding();
  const account = c4ProjectedAccount(binding).core;
  const state = fresh();
  const source = c4SafeLines() + "Match User gccgw-japan-repair-ci Group ops\n";
  const environment = c3Environment([[C3_ROOT, source]], []);
  const input = c4OperationInput(environment);
  const syntax = c4AllocatedCall(() => api.__test_deriveAuthorizationSshSyntax(
    state.ssh,
    input.pathOperations,
    input.sourceOperations
  ));
  if (!syntax.result.ok) return { setupFailed: true, fault };
  const tracker = c3CreateLifecycleTracker();
  tracker.c4RawReferences = {
    graph: state.ssh,
    syntax: syntax.result.value,
    policy: null,
    snapshot: state.snapshot,
    registry: null,
    registryStable: true
  };
  const derive = c3LifecyclePhase(tracker, "c4FaultDerive", state.ssh, environment.calls,
    () => c4AllocatedRawCall(() => api.__test_deriveAuthorizationSshPolicy(
      state.ssh,
      syntax.result.value,
      account
    )), fault);
  const afterDerive = inspect(state);
  const provenance = c4RawProvenanceState(
    tracker,
    state.ssh,
    derive.result.ok ? derive.result.value : null
  );
  const syntaxCleanup = c3LifecyclePhase(tracker, "c4FaultSyntaxCleanup", state.ssh, environment.calls,
    () => c4AllocatedCall(() => api.__test_disposeAuthorizationSshSyntax(state.ssh, syntax.result.value)));
  const afterCleanup = inspect(state);
  const terminalCalls = new nativeArray();
  const terminalInput = c4TrapInput("exact", terminalCalls);
  const followUp = c4AllocatedCall(() => api.__test_deriveAuthorizationSshSyntax(
    state.ssh,
    terminalInput.pathOperations,
    terminalInput.sourceOperations
  ));
  const lifecycle = c3LifecycleSummary(tracker);
  tracker.c4RawReferences.syntax = null;
  tracker.c4RawReferences.policy = null;
  tracker.c4RawReferences.snapshot = null;
  tracker.c4RawReferences.registry = null;
  tracker.c4RawReferences = null;
  const derivePhase = lifecycle.phases.find((entry) => entry.name === "c4FaultDerive");
  return {
    setupFailed: false,
    fault: { ...fault },
    faultTriggered: derivePhase.faultTriggered,
    result: { ok: derive.result.ok, error: derive.result.error || null },
    rawErrorAudit: derive.rawErrorAudit,
    forbiddenAllocations: c4ForbiddenAllocationView(derive.allocations),
    trackedBuffersZero: derive.trackedBuffersZero,
    provenance,
    syntaxCleanup: {
      ok: syntaxCleanup.result.ok,
      error: syntaxCleanup.result.error || null,
      trackedBuffersZero: syntaxCleanup.trackedBuffersZero
    },
    graphFailed: afterDerive.ssh.failed && afterCleanup.ssh.failed,
    snapshotFailed: afterDerive.snapshot.failed && afterCleanup.snapshot.failed,
    authorizationEntryCount: afterCleanup.snapshot.authorizationEntryCount,
    preimages: c4LifecyclePreimageAudit(lifecycle, "c4FaultDerive"),
    preimagePendingCount: derivePhase.preimagePendingCount,
    buffersZero: c4RunnerOwnedLifecycleBytesZero(lifecycle),
    followUp: {
      ok: followUp.result.ok,
      error: followUp.result.error || null,
      allocations: followUp.allocations,
      calls: terminalCalls.length,
      trackedBuffersZero: followUp.trackedBuffersZero
    }
  };
}

function c4PolicyFaultMatrix(calibrationLifecycle) {
  const phase = calibrationLifecycle.phases.find((entry) => entry.name === "derivePolicy");
  const faults = new nativeArray();
  for (const reserve of phase.fixedReserves) faults.push({ kind: "fixedOrdinal", ordinal: reserve.ordinal });
  for (const allocation of phase.roleAllocations) {
    if (allocation.role === "preimage") {
      faults.push({ kind: "allocationRole", role: "preimage", ordinal: allocation.ordinal });
    }
  }
  for (let ordinal = 1; ordinal <= phase.hashes; ordinal += 1) faults.push({ kind: "hash", ordinal });
  for (let ordinal = 1; ordinal <= phase.fills.length; ordinal += 1) faults.push({ kind: "fill", ordinal });
  return faults.map((fault) => c4PolicyFaultWitness(fault));
}

function c4PolicyLifecycle() {
  const source = c4SafeLines() + "Match User gccgw-japan-repair-ci Group ops\n";
  const coverageOracle = c4CanonicalPreimageOracle(c4ExpectedCoverage([
    c4ExpectedBranch(0, 12, [{
      name: "user",
      patterns: [{ negated: false, value: "gccgw-japan-repair-ci" }]
    }, {
      name: "group",
      patterns: [{ negated: false, value: "ops" }]
    }], "exact_user")
  ]));
  const binding = c4Binding();
  const account = c4ProjectedAccount(binding).core;
  const state = fresh();
  const environment = c3Environment([[C3_ROOT, source]], []);
  const input = c4OperationInput(environment);
  const syntaxCall = c4AllocatedCall(() => api.__test_deriveAuthorizationSshSyntax(
    state.ssh,
    input.pathOperations,
    input.sourceOperations
  ));
  if (!syntaxCall.result.ok) return { syntaxCall };
  const syntax = syntaxCall.result.value;
  const tracker = c3CreateLifecycleTracker();
  tracker.c4RawReferences = {
    graph: state.ssh,
    syntax,
    policy: null,
    snapshot: state.snapshot,
    registry: null,
    registryStable: true
  };
  const derive = c3LifecyclePhase(tracker, "derivePolicy", state.ssh, environment.calls,
    () => c4AllocatedCall(() => api.__test_deriveAuthorizationSshPolicy(state.ssh, syntax, account)));
  const afterDerive = inspect(state);
  const afterDeriveProvenance = c4RawProvenanceState(
    tracker,
    state.ssh,
    derive.result.ok ? derive.result.value : null
  );
  let disposePolicy = null;
  if (derive.result.ok) {
    disposePolicy = c3LifecyclePhase(tracker, "disposePolicy", state.ssh, environment.calls,
      () => c4AllocatedCall(() => api.__test_disposeAuthorizationSshPolicy(state.ssh, derive.result.value)));
  }
  const afterPolicyDisposeProvenance = c4RawProvenanceState(
    tracker,
    state.ssh,
    derive.result.ok ? derive.result.value : null
  );
  const disposeSyntax = c3LifecyclePhase(tracker, "disposeSyntax", state.ssh, environment.calls,
    () => c4AllocatedCall(() => api.__test_disposeAuthorizationSshSyntax(state.ssh, syntax)));
  const afterDispose = inspect(state);
  const afterDisposeProvenance = c4RawProvenanceState(
    tracker,
    state.ssh,
    derive.result.ok ? derive.result.value : null
  );
  const lifecycle = c3LifecycleSummary(tracker);
  tracker.c4RawReferences.syntax = null;
  tracker.c4RawReferences.policy = null;
  tracker.c4RawReferences.snapshot = null;
  tracker.c4RawReferences.registry = null;
  tracker.c4RawReferences = null;
  return {
    syntax: { ok: syntaxCall.result.ok, trackedBuffersZero: syntaxCall.trackedBuffersZero },
    derive: {
      ok: derive.result.ok,
      error: derive.result.error || null,
      trackedBuffersZero: derive.trackedBuffersZero,
      trackedBufferCount: derive.trackedBufferCount,
      forbiddenAllocations: c4ForbiddenAllocationView(derive.allocations)
    },
    disposePolicy: disposePolicy && {
      ok: disposePolicy.result.ok,
      error: disposePolicy.result.error || null,
      trackedBuffersZero: disposePolicy.trackedBuffersZero
    },
    disposeSyntax: {
      ok: disposeSyntax.result.ok,
      error: disposeSyntax.result.error || null,
      trackedBuffersZero: disposeSyntax.trackedBuffersZero
    },
    afterDerive,
    afterDispose,
    provenance: {
      afterDerive: afterDeriveProvenance,
      afterPolicyDispose: afterPolicyDisposeProvenance,
      afterDispose: afterDisposeProvenance
    },
    lifecycle,
    coverageOracle
  };
}

function c4PolicyDisposeAmbiguity() {
  const fixture = c4PolicyFixture();
  if (!fixture.syntax.result.ok || !fixture.policy || !fixture.policy.result.ok) {
    return { setupFailed: true };
  }
  const tracker = c3CreateLifecycleTracker();
  tracker.c4RawReferences = {
    graph: fixture.state.ssh,
    syntax: fixture.syntax.result.value,
    policy: fixture.policy.result.value,
    snapshot: fixture.state.snapshot,
    registry: null,
    registryStable: true
  };
  const dispose = c3LifecyclePhase(tracker, "c4DisposeAmbiguity", fixture.state.ssh,
    fixture.environment.calls, () => c4AllocatedRawCall(() => api.__test_disposeAuthorizationSshPolicy(
      fixture.state.ssh,
      fixture.policy.result.value
    )), { kind: "registryDeleteAfter", identity: "policy" });
  const provenanceAfterDelete = c4RawProvenanceState(
    tracker,
    fixture.state.ssh,
    fixture.policy.result.value
  );
  const afterDelete = inspect(fixture.state);
  fixture.policyDisposed = provenanceAfterDelete.policy.present === false;
  const syntaxCleanup = c3LifecyclePhase(tracker, "c4DisposeAmbiguitySyntaxCleanup", fixture.state.ssh,
    fixture.environment.calls, () => c4AllocatedCall(() => api.__test_disposeAuthorizationSshSyntax(
      fixture.state.ssh,
      fixture.syntax.result.value
    )));
  const afterCleanup = inspect(fixture.state);
  const provenanceAfterCleanup = c4RawProvenanceState(
    tracker,
    fixture.state.ssh,
    fixture.policy.result.value
  );
  const terminalCalls = new nativeArray();
  const terminalInput = c4TrapInput("exact", terminalCalls);
  const followUp = c4AllocatedCall(() => api.__test_deriveAuthorizationSshSyntax(
    fixture.state.ssh,
    terminalInput.pathOperations,
    terminalInput.sourceOperations
  ));
  const lifecycle = c3LifecycleSummary(tracker);
  tracker.c4RawReferences.syntax = null;
  tracker.c4RawReferences.policy = null;
  tracker.c4RawReferences.snapshot = null;
  tracker.c4RawReferences.registry = null;
  tracker.c4RawReferences = null;
  const disposePhase = lifecycle.phases.find((entry) => entry.name === "c4DisposeAmbiguity");
  return {
    setupFailed: false,
    result: { ok: dispose.result.ok, error: dispose.result.error || null },
    rawErrorAudit: dispose.rawErrorAudit,
    faultTriggered: disposePhase.faultTriggered,
    provenanceAfterDelete,
    provenanceAfterCleanup,
    syntaxCleanup: {
      ok: syntaxCleanup.result.ok,
      error: syntaxCleanup.result.error || null,
      trackedBuffersZero: syntaxCleanup.trackedBuffersZero
    },
    graphFailed: afterDelete.ssh.failed && afterCleanup.ssh.failed,
    snapshotFailed: afterDelete.snapshot.failed && afterCleanup.snapshot.failed,
    authorizationEntryCount: afterCleanup.snapshot.authorizationEntryCount,
    buffersZero: c4RunnerOwnedLifecycleBytesZero(lifecycle),
    followUp: {
      ok: followUp.result.ok,
      error: followUp.result.error || null,
      allocations: followUp.allocations,
      calls: terminalCalls.length,
      trackedBuffersZero: followUp.trackedBuffersZero
    }
  };
}

function c4PolicyFixture() {
  const binding = c4Binding();
  const account = c4ProjectedAccount(binding).core;
  const state = fresh();
  const source = c4SafeLines() + "Match User gccgw-japan-repair-ci Group ops\n";
  const environment = c3Environment([[C3_ROOT, source]], []);
  const input = c4OperationInput(environment);
  const syntax = c4AllocatedCall(() => api.__test_deriveAuthorizationSshSyntax(
    state.ssh,
    input.pathOperations,
    input.sourceOperations
  ));
  const policy = syntax.result.ok
    ? c4AllocatedCall(() => api.__test_deriveAuthorizationSshPolicy(state.ssh, syntax.result.value, account))
    : null;
  return { state, environment, syntax, policy, policyDisposed: false };
}

function c4PolicyDisposeCleanup(fixture, label) {
  const outcomes = new nativeArray();
  if (fixture.policy && fixture.policy.result.ok && fixture.policyDisposed === false) {
    const disposed = safe(() => api.__test_disposeAuthorizationSshPolicy(
      fixture.state.ssh,
      fixture.policy.result.value
    ));
    fixture.policyDisposed = disposed.ok;
    outcomes.push({ label: label + "-policy", ok: disposed.ok, error: disposed.error || null });
  }
  if (fixture.syntax.result.ok) {
    const disposed = safe(() => api.__test_disposeAuthorizationSshSyntax(
      fixture.state.ssh,
      fixture.syntax.result.value
    ));
    outcomes.push({ label: label + "-syntax", ok: disposed.ok, error: disposed.error || null });
  }
  return outcomes;
}

function c4PolicyDisposeWitness(kind) {
  const first = c4PolicyFixture();
  const needsSecond = kind === "wrong-graph" || kind === "foreign" || kind === "disposed";
  const second = needsSecond ? c4PolicyFixture() : null;
  if (!first.syntax.result.ok || !first.policy || !first.policy.result.ok
    || (second && (!second.syntax.result.ok || !second.policy || !second.policy.result.ok))) {
    return { kind, setupFailed: true };
  }
  let target = first;
  let candidate = first.policy.result.value;
  let preDispose = null;
  if (kind === "plain") candidate = {};
  if (kind === "clone") candidate = nativeObject.assign(
    nativeObject.create(nativeObject.getPrototypeOf(first.policy.result.value)),
    first.policy.result.value
  );
  if (kind === "proxy") candidate = new nativeProxy(first.policy.result.value, {});
  if (kind === "syntax-as-policy") candidate = first.syntax.result.value;
  if (kind === "wrong-graph") {
    target = second;
    candidate = first.policy.result.value;
  }
  if (kind === "foreign") candidate = second.policy.result.value;
  if (kind === "disposed" || kind === "double") {
    const disposed = safe(() => api.__test_disposeAuthorizationSshPolicy(
      first.state.ssh,
      first.policy.result.value
    ));
    first.policyDisposed = disposed.ok;
    preDispose = { ok: disposed.ok, error: disposed.error || null };
    if (kind === "disposed") target = second;
  }
  const callsBefore = target.environment.calls.length;
  const attempted = c4AllocatedRawCall(() => api.__test_disposeAuthorizationSshPolicy(
    target.state.ssh,
    candidate
  ));
  const terminalEnvironment = c3Environment([[C3_ROOT, c4SafeLines()]], []);
  const terminalInput = c4OperationInput(terminalEnvironment);
  const followUp = c4AllocatedCall(() => api.__test_deriveAuthorizationSshSyntax(
    target.state.ssh,
    terminalInput.pathOperations,
    terminalInput.sourceOperations
  ));
  const cleanup = c4PolicyDisposeCleanup(first, "first");
  if (second) cleanup.push(...c4PolicyDisposeCleanup(second, "second"));
  return {
    kind,
    setupFailed: false,
    preDispose,
    attempted: { ok: attempted.result.ok, error: attempted.result.error || null },
    rawErrorAudit: attempted.rawErrorAudit,
    allocations: attempted.allocations,
    trackedBuffersZero: attempted.trackedBuffersZero,
    operationDelta: target.environment.calls.length - callsBefore,
    terminal: inspect(target.state).snapshot.failed,
    followUp: {
      ok: followUp.result.ok,
      error: followUp.result.error || null,
      allocations: followUp.allocations,
      calls: terminalEnvironment.calls.length
    },
    cleanup
  };
}

function c4PolicyDisposeMatrix() {
  return [
    "plain", "clone", "proxy", "syntax-as-policy",
    "wrong-graph", "foreign", "disposed", "double"
  ].map((kind) => c4PolicyDisposeWitness(kind));
}

function c4PrivateBudget(source, accountOverrides, captureMatcherLedger = false) {
  const binding = c4Binding();
  const account = c4ProjectedAccount(binding, accountOverrides).core;
  const state = fresh();
  const environment = c3Environment([[C3_ROOT, source]], []);
  const input = c4OperationInput(environment);
  const syntax = safe(() => api.__test_deriveAuthorizationSshSyntax(
    state.ssh,
    input.pathOperations,
    input.sourceOperations
  ));
  if (!syntax.ok) return { syntax: { ok: false, error: syntax.error } };
  const tracker = c3CreateLifecycleTracker();
  tracker.captureMatcherLedger = captureMatcherLedger;
  const policy = c3LifecyclePhase(tracker, "c4BudgetDerive", state.ssh, environment.calls,
    () => c4AllocatedCall(() => api.__test_deriveAuthorizationSshPolicy(
      state.ssh,
      syntax.value,
      account
    ), false));
  const afterPolicy = inspect(state);
  if (policy.result.ok) safe(() => api.__test_disposeAuthorizationSshPolicy(state.ssh, policy.result.value));
  safe(() => api.__test_disposeAuthorizationSshSyntax(state.ssh, syntax.value));
  const lifecycle = c3LifecycleSummary(tracker);
  const phase = lifecycle.phases.find((entry) => entry.name === "c4BudgetDerive");
  const terminalEnvironment = c3Environment([[C3_ROOT, "Match all\n"]], []);
  const terminalInput = c4OperationInput(terminalEnvironment);
  const followUp = policy.result.ok ? null : c4AllocatedCall(() => api.__test_deriveAuthorizationSshSyntax(
    state.ssh,
    terminalInput.pathOperations,
    terminalInput.sourceOperations
  ));
  return {
    syntax: { ok: true },
    policy: { ok: policy.result.ok, error: policy.result.error || null },
    fixedEnvelopes: afterPolicy.snapshot.fixedEnvelopeCount,
    semanticReserves: phase.progress.semanticReserves,
    comparisons: afterPolicy.snapshot.sshMatchComparisonCount,
    attempts: phase.work.attempts,
    reservations: phase.work.reservations,
    completions: phase.work.completions,
    reserveThrows: phase.work.throws,
    reserveBeforeComplete: phase.work.orderingValid,
    matcherAttempts: phase.matcher.attempts,
    matcherCompletions: phase.matcher.completions,
    matcherThrows: phase.matcher.throws,
    matcherOrderingValid: phase.matcher.orderingValid,
    matcherLedger: phase.matcherLedger || null,
    wildcardInvocations: afterPolicy.snapshot.wildcardInvocationCount,
    wildcardAlignedComparisons: afterPolicy.snapshot.wildcardAlignedComparisonCount,
    lastAttemptStamp: phase.work.lastAttemptStamp,
    lastCompletionStamp: phase.work.lastCompletionStamp,
    finalStamp: phase.finalStamp,
    traceLength: policy.trace.length,
    terminal: afterPolicy.snapshot.failed,
    followUp: followUp && {
      ok: followUp.result.ok,
      error: followUp.result.error || null,
      allocations: followUp.allocations,
      calls: terminalEnvironment.calls.length
    }
  };
}

function c4TrapInput(shape = "exact", calls = []) {
  const operation = (name) => () => {
    c4InjectedOperationCount += 1;
    calls.push(name);
    throw new Error("C4 rejected input performed an operation");
  };
  const pathOperations = {
    lstat: operation("lstat"),
    open: operation("open"),
    fstat: operation("fstat"),
    read: operation("read"),
    close: operation("close")
  };
  const sourceOperations = {
    readDirectory: operation("readDirectory"),
    validateSudoers: operation("validateSudoers")
  };
  if (shape === "path-extra") pathOperations.extra = operation("extra");
  if (shape === "source-extra") sourceOperations.extra = operation("extra");
  if (shape === "top-missing") return { pathOperations };
  if (shape === "top-extra") return { pathOperations, sourceOperations, extra: true };
  return { pathOperations, sourceOperations };
}

function c4ProxyCounters() {
  return { get: 0, ownKeys: 0, getOwnPropertyDescriptor: 0, getPrototypeOf: 0 };
}

function c4UnobservedProxy(value, counters) {
  return new nativeProxy(value, {
    get(target, property, receiver) {
      counters.get += 1;
      return Reflect.get(target, property, receiver);
    },
    ownKeys(target) {
      counters.ownKeys += 1;
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(target, property) {
      counters.getOwnPropertyDescriptor += 1;
      return Reflect.getOwnPropertyDescriptor(target, property);
    },
    getPrototypeOf(target) {
      counters.getPrototypeOf += 1;
      return Reflect.getPrototypeOf(target);
    }
  });
}

function c4ShapeWitness(name, operation, calls, proxyCounters = null) {
  const result = c4AllocatedPublicCall(operation);
  return {
    name,
    ok: result.result.ok,
    error: result.result.error || null,
    allocations: result.allocations,
    calls: calls.length,
    publicCalls: result.publicCalls,
    rawErrorAudit: result.rawErrorAudit,
    contractErrorEvents: result.publicAudit.contractErrorEvents,
    proxyCounters: proxyCounters === null ? null : { ...proxyCounters }
  };
}

function c4PublicShapeMatrix() {
  const binding = c4Binding();
  const branded = c4ProjectedAccount(binding).core;
  const plain = c4AccountRecord();
  const clone = nativeJSON.parse(nativeJSON.stringify(branded));
  const frozen = c4FrozenAccountLookalike(branded);
  const proxy = new nativeProxy(branded, {});
  const nativeAccount = c4NativeAccountCore().core;
  const legacyClosure = {
    schemaVersion: "1", type: "japan_ci_sshd_source_closure", rootConfig: C3_ROOT, files: []
  };
  const legacyCoverage = {
    schemaVersion: "1", type: "japan_ci_sshd_match_coverage",
    username: "gccgw-japan-repair-ci", groupIds: [], branches: []
  };
  const legacyTopology = {
    schemaVersion: "1", type: "japan_ci_ssh_authorization_topology"
  };
  const witnesses = new nativeArray();
  function add(name, operation, calls, proxyCounters = null) {
    witnesses.push(c4ShapeWitness(name, operation, calls, proxyCounters));
  }
  let calls = [];
  add("include-old-caller-record", () => api.buildCanonicalSshIncludeClosure(legacyClosure), calls);
  calls = [];
  add("include-missing-input", () => api.buildCanonicalSshIncludeClosure(), calls);
  calls = [];
  add("include-top-missing", () => api.buildCanonicalSshIncludeClosure(c4TrapInput("top-missing", calls)), calls);
  calls = [];
  add("include-top-extra", () => api.buildCanonicalSshIncludeClosure(c4TrapInput("top-extra", calls)), calls);
  calls = [];
  add("include-path-extra", () => api.buildCanonicalSshIncludeClosure(c4TrapInput("path-extra", calls)), calls);
  calls = [];
  add("include-source-extra", () => api.buildCanonicalSshIncludeClosure(c4TrapInput("source-extra", calls)), calls);
  calls = [];
  add("include-overload", () => api.buildCanonicalSshIncludeClosure(c4TrapInput("exact", calls), "overload"), calls);
  for (const [label, account] of [
    ["plain", plain],
    ["clone", clone],
    ["frozen-lookalike", frozen],
    ["proxy", proxy],
    ["native", nativeAccount]
  ]) {
    const accountLabel = label === "native"
      ? "native-account"
      : label === "frozen-lookalike"
        ? "frozen-lookalike"
        : "unbranded-" + label;
    calls = [];
    add("coverage-" + accountLabel,
      () => api.buildCanonicalSshMatchCoverage(account, c4TrapInput("exact", calls)), calls);
    calls = [];
    add("topology-" + accountLabel,
      () => api.buildCanonicalSshTopology(account, binding, c4TrapInput("exact", calls)), calls);
  }
  calls = [];
  add("coverage-missing-input", () => api.buildCanonicalSshMatchCoverage(branded), calls);
  calls = [];
  add("coverage-swapped", () => api.buildCanonicalSshMatchCoverage(c4TrapInput("exact", calls), branded), calls);
  calls = [];
  add("coverage-binding-in-input", () => api.buildCanonicalSshMatchCoverage(branded, binding), calls);
  calls = [];
  add("coverage-old-caller-record-in-input",
    () => api.buildCanonicalSshMatchCoverage(branded, legacyCoverage), calls);
  calls = [];
  add("coverage-top-missing", () => api.buildCanonicalSshMatchCoverage(branded, c4TrapInput("top-missing", calls)), calls);
  calls = [];
  add("coverage-top-extra", () => api.buildCanonicalSshMatchCoverage(branded, c4TrapInput("top-extra", calls)), calls);
  calls = [];
  add("coverage-path-extra", () => api.buildCanonicalSshMatchCoverage(branded, c4TrapInput("path-extra", calls)), calls);
  calls = [];
  add("coverage-source-extra", () => api.buildCanonicalSshMatchCoverage(branded, c4TrapInput("source-extra", calls)), calls);
  calls = [];
  add("coverage-overload", () => api.buildCanonicalSshMatchCoverage(branded, c4TrapInput("exact", calls), "overload"), calls);
  calls = [];
  add("topology-missing-binding", () => api.buildCanonicalSshTopology(branded), calls);
  calls = [];
  add("topology-missing-input", () => api.buildCanonicalSshTopology(branded, binding), calls);
  calls = [];
  add("topology-input-in-binding",
    () => api.buildCanonicalSshTopology(branded, c4TrapInput("exact", calls)), calls);
  calls = [];
  add("topology-binding-in-input", () => api.buildCanonicalSshTopology(branded, binding, binding), calls);
  calls = [];
  add("topology-binding-input-swapped",
    () => api.buildCanonicalSshTopology(branded, c4TrapInput("exact", calls), binding), calls);
  calls = [];
  add("topology-old-binding-record",
    () => api.buildCanonicalSshTopology(branded, legacyTopology, c4TrapInput("exact", calls)), calls);
  calls = [];
  add("topology-old-caller-record-in-input",
    () => api.buildCanonicalSshTopology(branded, binding, legacyTopology), calls);
  calls = [];
  add("topology-top-extra", () => api.buildCanonicalSshTopology(branded, binding, c4TrapInput("top-extra", calls)), calls);
  calls = [];
  add("topology-path-extra", () => api.buildCanonicalSshTopology(branded, binding, c4TrapInput("path-extra", calls)), calls);
  calls = [];
  add("topology-source-extra", () => api.buildCanonicalSshTopology(branded, binding, c4TrapInput("source-extra", calls)), calls);
  calls = [];
  add("topology-overload", () => api.buildCanonicalSshTopology(branded, binding, c4TrapInput("exact", calls), "overload"), calls);

  const bindingShapes = new nativeArray();
  bindingShapes.push(["null", null, null]);
  const missingAuthorization = { ...binding };
  delete missingAuthorization.sshAuthorization;
  bindingShapes.push(["missing-authorization", missingAuthorization, null]);
  const missingNested = { ...binding.sshAuthorization };
  delete missingNested.effectiveConfigSha256;
  bindingShapes.push(["missing-nested", { ...binding, sshAuthorization: missingNested }, null]);
  bindingShapes.push(["top-extra", { ...binding, extra: true }, null]);
  bindingShapes.push(["nested-extra", {
    ...binding,
    sshAuthorization: { ...binding.sshAuthorization, extra: true }
  }, null]);
  const topProxyCounters = c4ProxyCounters();
  bindingShapes.push(["top-proxy", c4UnobservedProxy(binding, topProxyCounters), topProxyCounters]);
  const nestedProxyCounters = c4ProxyCounters();
  bindingShapes.push(["nested-proxy", {
    ...binding,
    sshAuthorization: c4UnobservedProxy(binding.sshAuthorization, nestedProxyCounters)
  }, nestedProxyCounters]);
  for (const [label, candidateBinding, proxyCounters] of bindingShapes) {
    calls = [];
    add("topology-binding-" + label,
      () => api.buildCanonicalSshTopology(branded, candidateBinding, c4TrapInput("exact", calls)),
      calls,
      proxyCounters);
  }
  return witnesses;
}

function c4CanonicalBindingValueDriftMatrix() {
  const binding = c4Binding();
  const account = c4ProjectedAccount(binding).core;
  const alternatePath = "/etc/ssh/authorized_keys/gccgw-japan-repair-ci-alternate";
  const cases = [
    ["expected-euid", { ...binding, expectedEuid: 1 }],
    ["ssh-algorithm", {
      ...binding,
      sshAuthorization: { ...binding.sshAuthorization, algorithm: "ssh-rsa" }
    }],
    ["ssh-authorized-keys-file", {
      ...binding,
      sshAuthorization: { ...binding.sshAuthorization, authorizedKeysFile: alternatePath }
    }],
    ["paths-authorized-keys", {
      ...binding,
      paths: { ...binding.paths, authorizedKeys: alternatePath }
    }],
    ["synchronized-authorized-keys-path", {
      ...binding,
      paths: { ...binding.paths, authorizedKeys: alternatePath },
      sshAuthorization: { ...binding.sshAuthorization, authorizedKeysFile: alternatePath }
    }],
    ["authorized-keys-policy-mode", {
      ...binding,
      pathPolicies: {
        ...binding.pathPolicies,
        authorizedKeys: { ...binding.pathPolicies.authorizedKeys, mode: 0o400 }
      }
    }],
    ["authorized-keys-policy-uid", {
      ...binding,
      pathPolicies: {
        ...binding.pathPolicies,
        authorizedKeys: { ...binding.pathPolicies.authorizedKeys, uid: 1 }
      }
    }],
    ["authorized-keys-policy-gid", {
      ...binding,
      pathPolicies: {
        ...binding.pathPolicies,
        authorizedKeys: { ...binding.pathPolicies.authorizedKeys, gid: 1 }
      }
    }],
    ["authorized-keys-policy-nlink", {
      ...binding,
      pathPolicies: {
        ...binding.pathPolicies,
        authorizedKeys: { ...binding.pathPolicies.authorizedKeys, nlink: 2 }
      }
    }],
    ["authorization-marker", { ...binding, authorizationMarker: "wrong-marker" }]
  ];
  return cases.map(([name, candidate]) => {
    const calls = new nativeArray();
    const call = c4AllocatedPublicCall(() => api.buildCanonicalSshTopology(
      account,
      candidate,
      c4TrapInput("exact", calls)
    ));
    return {
      name,
      result: { ok: call.result.ok, error: call.result.error || null },
      allocations: call.allocations,
      calls: calls.length,
      sourceTraversalCount: calls.filter((name) =>
        name === "readDirectory" || name === "validateSudoers").length,
      publicCalls: call.publicCalls,
      trackedBuffersZero: call.trackedBuffersZero,
      rawErrorAudit: call.rawErrorAudit,
      contractErrorEvents: call.publicAudit.contractErrorEvents,
      initialBoundaryCaptureCount: call.publicAudit.initialBoundaryCaptureCount,
      initialShapeCaptureCount: call.publicAudit.initialShapeCaptureCount,
      authorizationEntryCount: call.publicAudit.authorizationEntryCount,
      snapshotFailed: call.publicAudit.snapshotFailed
    };
  });
}

function c4MatchScenario() {
  c4ScenarioInvocationCount += 1;
  const source = [
    "Match User gccgw-japan-repair-ci",
    "Match User gccgw-japan-*-ci",
    "Match User *,!root",
    "Match User !root",
    "Match User *,!gccgw-japan-repair-ci",
    "Match Group ops",
    "Match Group o?s,!wheel",
    "Match Group *,!wheel",
    "Match Group !wheel",
    "Match Group *,!ops",
    "Match Group !ops",
    "Match User gccgw-japan-repair-ci Group ops",
    "Match all",
    "Match User root",
    "Match Group wheel",
    "Match User gccgw-japan-repair-ci Group wheel",
    "Match Group 975"
  ].join("\n") + "\n";
  const coverage = c4Coverage(source);
  const independent = c4Coverage("Match Group ops\n", { groupIds: [2200, 975], groupNames: ["repair", "ops"] });
  const numericName = c4Coverage("Match Group 975\n", { groupIds: [2200, 975], groupNames: ["ops", "975"] });
  const nestedIncludeOracle = {
    schemaVersion: "1",
    type: "japan_ci_sshd_match_coverage",
    username: "gccgw-japan-repair-ci",
    groupIds: [975, 1100],
    branches: [
      {
        ordinal: 0,
        sourceOrdinal: 2,
        lineNumber: 1,
        conditions: [{ name: "all", patterns: [] }],
        accountDisposition: "exact_user",
        variableDimensions: []
      },
      {
        ordinal: 1,
        sourceOrdinal: 2,
        lineNumber: 2,
        conditions: [{ name: "group", patterns: [{ negated: false, value: "ops" }] }],
        accountDisposition: "exact_user",
        variableDimensions: []
      },
      {
        ordinal: 2,
        sourceOrdinal: 1,
        lineNumber: 2,
        conditions: [{ name: "user", patterns: [{ negated: false, value: "gccgw-japan-repair-ci" }] }],
        accountDisposition: "exact_user",
        variableDimensions: []
      },
      {
        ordinal: 3,
        sourceOrdinal: 1,
        lineNumber: 3,
        conditions: [{ name: "group", patterns: [{ negated: false, value: "wheel" }] }],
        accountDisposition: "disjoint",
        variableDimensions: []
      },
      {
        ordinal: 4,
        sourceOrdinal: 0,
        lineNumber: 2,
        conditions: [{ name: "user", patterns: [{ negated: false, value: "root" }] }],
        accountDisposition: "disjoint",
        variableDimensions: []
      }
    ]
  };
  const nestedIncludeCoverage = c4CoverageFromFiles([
    [C3_ROOT, "Include child.conf\nMatch User root\n"],
    ["/etc/ssh/child.conf", "Include nested.conf\nMatch User gccgw-japan-repair-ci\nMatch Group wheel\n"],
    ["/etc/ssh/nested.conf", "Match all\nMatch Group ops\n"]
  ], []);
  const privateAttempts = [
    "plain", "clone", "frozen-lookalike", "proxy",
    "wrong-graph", "foreign-syntax", "disposed-syntax", "live-policy-as-syntax",
    "disposed-policy-as-syntax", "reused-owner"
  ]
    .map((kind) => c4PrivateAttempt(kind));
  const groupIds = [975];
  const groupNames = ["g00"];
  for (let index = 1; index < 32; index += 1) {
    groupIds.push(1000 + index);
    groupNames.push("g" + String(index).padStart(2, "0"));
  }
  const branch = "Match Group g31\n";
  const finalPatterns = new nativeArray();
  for (let index = 0; index < 32; index += 1) finalPatterns.push("x" + String(index).padStart(2, "0"));
  finalPatterns.push("g00");
  const budgetAccount = { groupIds, groupNames };
  const maximum = c4PrivateBudget(c4SafeLines() + branch.repeat(4096), budgetAccount);
  const overflow = c4PrivateBudget(c4SafeLines() + branch.repeat(4095)
    + "Match Group " + finalPatterns.join(",") + "\n", budgetAccount);
  const userOrdering = c4PrivateBudget(c4SafeLines()
    + "Match User gccgw-japan-repair-ci,!x00\n", {}, true);
  const lifecycle = c4PolicyLifecycle();
  const lifecyclePhase = lifecycle.lifecycle.phases.find((entry) => entry.name === "derivePolicy");
  return {
    scenario: "match",
    publicArities: {
      include: api.buildCanonicalSshIncludeClosure.length,
      coverage: api.buildCanonicalSshMatchCoverage.length,
      topology: api.buildCanonicalSshTopology.length
    },
    coverage,
    includeSnapshotSuccess: c4Include(c4SafeLines()),
    includeSnapshotFailure: c4Include("UnknownDirective x\n"),
    coverageSnapshotFailure: c4Coverage("UnknownDirective x\n"),
    independent,
    numericName,
    nestedInclude: {
      coverage: nestedIncludeCoverage,
      oracle: nestedIncludeOracle,
      oracleSha256: "19e389d5b7fddc56308b0440c8859311147da47d7169cf2026278c79b443d4e9",
      actualSha256: nestedIncludeCoverage.result.ok
        ? c4HashCanonical(nestedIncludeCoverage.result.value)
        : null
    },
    privateAttempts,
    nativePolicy: c4NativePolicyPositive(),
    nativeNumericPolicy: c4NativePolicyPositive("975ops ops\n", "975ops"),
    lifecycle,
    lifecycleCalibration: {
      fixedReserves: lifecyclePhase.fixedReserves,
      fixedCompletions: lifecyclePhase.fixedCompletions,
      semanticReserves: lifecyclePhase.progress.semanticReserves,
      preimages: c4LifecyclePreimageAudit(lifecycle.lifecycle, "derivePolicy"),
      preimagePendingCount: lifecyclePhase.preimagePendingCount,
      coverageOracle: lifecycle.coverageOracle,
      hashes: lifecyclePhase.hashes,
      fills: lifecyclePhase.fills.length
    },
    faultMatrix: c4PolicyFaultMatrix(lifecycle.lifecycle),
    disposeMatrix: c4PolicyDisposeMatrix(),
    disposeAmbiguity: c4PolicyDisposeAmbiguity(),
    shapeWitnesses: c4PublicShapeMatrix(),
    budget: {
      userOrdering,
      maximum: {
        ok: maximum.policy && maximum.policy.ok,
        error: maximum.policy && maximum.policy.error,
        comparisons: maximum.comparisons,
        attempts: maximum.attempts,
        reservations: maximum.reservations,
        completions: maximum.completions,
        reserveThrows: maximum.reserveThrows,
        reserveBeforeComplete: maximum.reserveBeforeComplete,
        matcherAttempts: maximum.matcherAttempts,
        matcherCompletions: maximum.matcherCompletions,
        matcherThrows: maximum.matcherThrows,
        matcherOrderingValid: maximum.matcherOrderingValid,
        wildcardInvocations: maximum.wildcardInvocations,
        wildcardAlignedComparisons: maximum.wildcardAlignedComparisons,
        fixedEnvelopes: maximum.fixedEnvelopes,
        semanticReserves: maximum.semanticReserves,
        traceLength: maximum.traceLength,
        terminal: maximum.terminal
      },
      overflow: {
        ok: overflow.policy && overflow.policy.ok,
        error: overflow.policy && overflow.policy.error,
        comparisons: overflow.comparisons,
        attempts: overflow.attempts,
        reservations: overflow.reservations,
        completions: overflow.completions,
        reserveThrows: overflow.reserveThrows,
        reserveBeforeComplete: overflow.reserveBeforeComplete,
        matcherAttempts: overflow.matcherAttempts,
        matcherCompletions: overflow.matcherCompletions,
        matcherThrows: overflow.matcherThrows,
        matcherOrderingValid: overflow.matcherOrderingValid,
        wildcardInvocations: overflow.wildcardInvocations,
        wildcardAlignedComparisons: overflow.wildcardAlignedComparisons,
        semanticReserves: overflow.semanticReserves,
        lastAttemptStamp: overflow.lastAttemptStamp,
        finalStamp: overflow.finalStamp,
        traceLength: overflow.traceLength,
        terminal: overflow.terminal,
        followUp: overflow.followUp
      }
    }
  };
}

function c4VariableScenario() {
  c4ScenarioInvocationCount += 1;
  const dimensions = ["Host", "Address", "LocalAddress", "LocalPort", "RDomain", "LocalNetwork"];
  const values = ["*", "192.0.2.1", "192.0.2.2", "22", "repair", "192.0.2.0/24"];
  const reversedConditions = dimensions.map((name, index) => [name, values[index]]).reverse();
  const disjointSource = "Match User root " + reversedConditions.map(([name, value]) => name + " " + value).join(" ") + "\n";
  const matchingSource = "Match User gccgw-japan-repair-ci " + reversedConditions.map(([name, value]) => name + " " + value).join(" ") + "\n";
  const individual = dimensions.map((name, index) => ({
    name: name.toLowerCase(),
    result: c4Coverage("Match User gccgw-japan-repair-ci " + name + " " + values[index] + "\n"),
    disjoint: c4Coverage("Match User root " + name + " " + values[index] + "\n"),
    privateMatching: c4PrivateBudget(c4SafeLines() + "Match User gccgw-japan-repair-ci " + name + " " + values[index] + "\n", {}),
    privateDisjoint: c4PrivateBudget(c4SafeLines() + "Match User root " + name + " " + values[index] + "\n", {})
  }));
  return {
    scenario: "variable",
    fixedOrder: ["host", "address", "localaddress", "localport", "rdomain", "localnetwork"],
    disjoint: c4Coverage(disjointSource),
    matching: c4Coverage(matchingSource),
    variableOnly: c4Coverage("Match Host *\n"),
    privateDisjoint: c4PrivateBudget(c4SafeLines() + disjointSource, {}),
    privateMatching: c4PrivateBudget(c4SafeLines() + matchingSource, {}),
    privateVariableOnly: c4PrivateBudget(c4SafeLines() + "Match Host *\n", {}),
    individual
  };
}

function c4EffectiveScenario() {
  c4ScenarioInvocationCount += 1;
  const safe = c4SafeLines();
  const unsafe = c4SafeLines({
    authenticationmethods: "password",
    pubkeyauthentication: "no",
    passwordauthentication: "yes",
    kbdinteractiveauthentication: "yes",
    disableforwarding: "no",
    permittunnel: "yes",
    authorizedkeysfile: "/alternate"
  });
  const exactUserCondition = [{
    name: "user",
    patterns: [{ negated: false, value: "gccgw-japan-repair-ci" }]
  }];
  const wildcardUserCondition = [{
    name: "user",
    patterns: [{ negated: false, value: "gccgw-japan-*-ci" }]
  }];
  const rootUserCondition = [{ name: "user", patterns: [{ negated: false, value: "root" }] }];
  const repeatedGlobal = c4Topology(safe + unsafe);
  const matchWins = c4Topology(unsafe + "Match User gccgw-japan-repair-ci\n" + safe, {
    expectedCoverage: c4ExpectedCoverage([
      c4ExpectedBranch(0, 12, exactUserCondition, "exact_user")
    ])
  });
  const multipleMatch = c4Topology("Match User gccgw-japan-repair-ci\n" + safe
    + "Match User gccgw-japan-*-ci\n" + unsafe, {
    expectedCoverage: c4ExpectedCoverage([
      c4ExpectedBranch(0, 1, exactUserCondition, "exact_user"),
      c4ExpectedBranch(1, 13, wildcardUserCondition, "exact_user")
    ])
  });
  const fallback = c4Topology(safe + "Match User gccgw-japan-repair-ci\n", {
    expectedCoverage: c4ExpectedCoverage([
      c4ExpectedBranch(0, 12, exactUserCondition, "exact_user")
    ])
  });
  const defaults = c4Topology(c4SafeLines({
    pubkeyauthentication: null,
    hostbasedauthentication: null,
    gssapiauthentication: null,
    kerberosauthentication: null,
    permituserenvironment: null,
    permittunnel: null
  }));
  const disjointIgnoreSource = safe + "Match User root\n" + unsafe;
  const disjointIgnore = c4Topology(disjointIgnoreSource, {
    expectedCoverage: c4ExpectedCoverage([
      c4ExpectedBranch(0, 12, rootUserCondition, "disjoint")
    ])
  });
  const firstValueBase = c4SafeLines({ passwordauthentication: null });
  const disjointThenExactSafeSource = firstValueBase
    + "Match User root\nPasswordAuthentication yes\n"
    + "Match User gccgw-japan-repair-ci\nPasswordAuthentication no\n";
  const disjointThenExactUnsafeSource = firstValueBase
    + "Match User root\nPasswordAuthentication no\n"
    + "Match User gccgw-japan-repair-ci\nPasswordAuthentication yes\n";
  const twoBranchCoverage = c4ExpectedCoverage([
    c4ExpectedBranch(0, 11, rootUserCondition, "disjoint"),
    c4ExpectedBranch(1, 13, exactUserCondition, "exact_user")
  ]);
  const disjointThenExactSafe = c4Topology(disjointThenExactSafeSource, {
    expectedCoverage: twoBranchCoverage
  });
  const disjointThenExactUnsafe = c4Topology(disjointThenExactUnsafeSource, {
    expectedCoverage: twoBranchCoverage
  });
  const sameExactSafeFirst = c4Topology(firstValueBase
    + "Match User gccgw-japan-repair-ci\n"
    + "PasswordAuthentication no\nPasswordAuthentication yes\n", {
    expectedCoverage: c4ExpectedCoverage([
      c4ExpectedBranch(0, 11, exactUserCondition, "exact_user")
    ])
  });
  const matchAllSource = "Match all\n" + safe;
  const matchAll = c4Topology(matchAllSource, {
    expectedCoverage: c4ExpectedCoverage([
      c4ExpectedBranch(0, 1, [{ name: "all", patterns: [] }], "exact_user")
    ])
  });
  const kbdAlias = c4Topology(c4SafeLines({ kbdinteractiveauthentication: null })
    + "KbdInteractiveAuthentication no\nChallengeResponseAuthentication yes\n");
  const kbdAliasReject = c4Topology(c4SafeLines({ kbdinteractiveauthentication: null })
    + "ChallengeResponseAuthentication yes\nKbdInteractiveAuthentication no\n");
  const acceptEnv = [
    c4Topology(safe + "AcceptEnv LANG\n"),
    c4Topology(safe + "Match User gccgw-japan-repair-ci\nAcceptEnv LANG\n", {
      expectedCoverage: c4ExpectedCoverage([
        c4ExpectedBranch(0, 12, exactUserCondition, "exact_user")
      ])
    }),
    c4Topology(safe + "Match User root\nAcceptEnv LANG\n", {
      expectedCoverage: c4ExpectedCoverage([
        c4ExpectedBranch(0, 12, rootUserCondition, "disjoint")
      ])
    })
  ];
  return {
    scenario: "effective",
    sourceFailureAudit: c4TopologyFailureAudit("source-effective", "not-called"),
    repeatedGlobal,
    matchWins,
    multipleMatch,
    fallback,
    defaults,
    disjointIgnore,
    disjointThenExactSafe,
    disjointThenExactUnsafe,
    sameExactSafeFirst,
    disjointIgnoreCoverage: c4Coverage(disjointIgnoreSource),
    matchAll,
    matchAllCoverage: c4Coverage(matchAllSource),
    kbdAlias,
    kbdAliasReject,
    acceptEnv
  };
}

function c4AuthorizationAncestorOperations() {
  return [
    ...c3A1FileOperations("body", "eof"),
    ["lstat", "ancestor-0"],
    ["lstat", "ancestor-1"],
    ["lstat", "ancestor-2"],
    ["lstat", "ancestor-3"]
  ];
}

function c4AuthorizationAncestorOperationsThrough(role) {
  const roles = ["ancestor-0", "ancestor-1", "ancestor-2", "ancestor-3"];
  const index = roles.indexOf(role);
  if (index === -1) throw new Error("unknown authorization ancestor role");
  return [
    ...c3A1FileOperations("body", "eof"),
    ...roles.slice(0, index + 1).map((ancestorRole) => ["lstat", ancestorRole])
  ];
}

function c4AuthorizationFileLstatOperations() {
  return [...c4AuthorizationAncestorOperations(), ["lstat", "file-1"]];
}

function c4AuthorizationOperationFailureCalls(name) {
  const throughLstat = c4AuthorizationFileLstatOperations();
  const throughOpen = [...throughLstat, ["open", "file-1", "file"]];
  const throughPreStat = [...throughOpen, ["fstat", "file-1", "pre"]];
  const post = ["fstat", "file-1", "post"];
  const close = ["close", "file-1"];
  switch (name) {
    case "auth-lstat-failure":
    case "auth-nonregular": return throughLstat;
    case "auth-open-failure": return throughOpen;
    case "auth-pre-fstat-failure": return [...throughPreStat, close];
    case "auth-read-failure": return [...throughPreStat, ["read", "file-1", "body-failure"], post, close];
    case "auth-body-invalid-count": return [
      ...throughPreStat, ["read", "file-1", "body-invalid-count"], post, close
    ];
    case "auth-eof-invalid-count": return [
      ...throughPreStat, ["read", "file-1", "body"], ["read", "file-1", "eof-invalid-count"], post, close
    ];
    case "post-fstat-drift": return [
      ...throughPreStat, ["read", "file-1", "body"], ["read", "file-1", "eof"],
      ["fstat", "file-1", "post"], close
    ];
    case "early-eof": return [...throughPreStat, ["read", "file-1", "body-early-eof"], post, close];
    case "trailing-byte": return [
      ...throughPreStat, ["read", "file-1", "body"], ["read", "file-1", "eof-trailing-byte"], post, close
    ];
    case "close-failure": return c4ExpectedTopologyPathOperations();
    case "wrong-fd": return [...throughOpen, ["fstat", "unrecognized-fd", "post"], close];
    default: throw new Error("unknown authorization operation failure: " + name);
  }
}

function c4TopologyFailureAudit(stage, verifyOutcome, authorizationOpenExpected = null, expectedCalls = null) {
  const publicCalls = [
    "topology", "snapshot", "graph:ssh", "graph:sudo", "deriveSyntax"
  ];
  if (stage !== "source-syntax") {
    publicCalls.push("derivePolicy");
    if (verifyOutcome !== "not-called") publicCalls.push("verify");
    publicCalls.push("disposePolicy", "disposeSyntax");
  }
  const expectAuthorizationOpen = authorizationOpenExpected === null
    ? stage !== "source-syntax" && stage !== "source-effective" && stage !== "authorization-metadata"
    : authorizationOpenExpected;
  const exactCalls = expectedCalls !== null
    ? expectedCalls
    : stage === "source-syntax" || stage === "source-effective"
      ? c3A1FileOperations("body", "eof")
      : stage === "authorization-metadata"
        ? c4AuthorizationFileLstatOperations()
        : stage === "authorization-ancestor" || stage === "authorization-operation"
          ? null
          : c4ExpectedTopologyPathOperations();
  return {
    stage,
    publicCalls,
    successfulOpenRoles: expectAuthorizationOpen ? ["file-0", "file-1"] : ["file-0"],
    expectedCalls: exactCalls,
    verifyAttempts: verifyOutcome === "not-called" ? 0 : 1,
    verifySuccesses: verifyOutcome === "success" ? 1 : 0,
    verifyFailures: verifyOutcome === "failure" ? 1 : 0
  };
}

function c4TopologyScenario() {
  c4ScenarioInvocationCount += 1;
  const unsafe = [
    ["authenticationmethods", "password"],
    ["pubkeyauthentication", "no"],
    ["passwordauthentication", "yes"],
    ["kbdinteractiveauthentication", "yes"],
    ["hostbasedauthentication", "yes"],
    ["gssapiauthentication", "yes"],
    ["kerberosauthentication", "yes"],
    ["permituserenvironment", "yes"],
    ["acceptenv", "LANG"],
    ["forcecommand", "/bin/true"],
    ["chrootdirectory", "/srv/chroot"],
    ["disableforwarding", "no"],
    ["permittunnel", "yes"],
    ["authorizedkeysfile", "/alternate"],
    ["authorizedkeyscommand", "/usr/bin/lookup"],
    ["authorizedprincipalsfile", "/etc/ssh/principals"],
    ["authorizedprincipalscommand", "/usr/bin/principals"],
    ["trustedusercakeys", "/etc/ssh/ca.pub"]
  ];
  const sourceFailures = unsafe.map(([name, value]) => {
    const overrides = {};
    overrides[name] = value;
    return {
      name,
      failureAudit: c4TopologyFailureAudit("source-effective", "not-called"),
      probe: c4Topology(c4SafeLines(overrides))
    };
  });
  for (const [name, overrides] of [
    ["missing-authentication-methods", { authenticationmethods: null }],
    ["authenticationmethods-publickey-password", { authenticationmethods: "publickey,password" }],
    ["authenticationmethods-publickey-keyboard", { authenticationmethods: "publickey,keyboard-interactive" }],
    ["authenticationmethods-multiple-alternatives", { authenticationmethods: "publickey,password publickey" }],
    ["authenticationmethods-password-keyboard", { authenticationmethods: "password,keyboard-interactive" }],
    ["missing-password-authentication", { passwordauthentication: null }],
    ["missing-keyboard-interactive", { kbdinteractiveauthentication: null }],
    ["challenge-response-authentication", {
      kbdinteractiveauthentication: null,
      challengeresponseauthentication: "yes"
    }]
  ]) sourceFailures.push({
    name,
    failureAudit: c4TopologyFailureAudit(
      name === "authenticationmethods-multiple-alternatives" ? "source-syntax" : "source-effective",
      "not-called"
    ),
    probe: c4Topology(c4SafeLines(overrides))
  });
  sourceFailures.push({
    name: "missing-disable-forwarding",
    failureAudit: c4TopologyFailureAudit("source-effective", "not-called"),
    probe: c4Topology(c4SafeLines({ disableforwarding: null }))
  });
  sourceFailures.push({
    name: "missing-authorized-keys",
    failureAudit: c4TopologyFailureAudit("source-effective", "not-called"),
    probe: c4Topology(c4SafeLines({ authorizedkeysfile: null }))
  });
  sourceFailures.push({
    name: "two-authorized-keys",
    failureAudit: c4TopologyFailureAudit("source-effective", "not-called"),
    probe: c4Topology(c4SafeLines({ authorizedkeysfile: "/etc/ssh/authorized_keys/gccgw-japan-repair-ci /alternate" }))
  });

  const safe = c4SafeLines();
  const exactUserCoverage = c4ExpectedCoverage([
    c4ExpectedBranch(0, 12, [{
      name: "user",
      patterns: [{ negated: false, value: "gccgw-japan-repair-ci" }]
    }], "exact_user")
  ]);
  const disjointCoverage = c4ExpectedCoverage([
    c4ExpectedBranch(0, 12, [{
      name: "user",
      patterns: [{ negated: false, value: "root" }]
    }], "disjoint")
  ]);
  const directiveMatchMatrix = unsafe.map(([name, value]) => {
    const applicableSource = safe + "Match User gccgw-japan-repair-ci\n" + name + " " + value + "\n";
    const disjointSource = safe + "Match User root\n" + name + " " + value + "\n";
    return {
      name,
      applicable: {
        coverage: c4Coverage(applicableSource),
        failureAudit: c4TopologyFailureAudit("source-effective", "not-called"),
        probe: c4Topology(applicableSource, { expectedCoverage: exactUserCoverage })
      },
      disjoint: {
        coverage: c4Coverage(disjointSource),
        probe: c4Topology(disjointSource, { expectedCoverage: disjointCoverage })
      }
    };
  });
  const canonical = c4AuthorizationFixture();
  const alternate = c4AuthorizationFixture(9);
  const badOption = nativeBuffer.from(canonical.lineText.replace("restrict,no-pty", "no-pty,restrict") + "\n", "ascii");
  const unknownOption = nativeBuffer.from("unknown," + canonical.lineText + "\n", "ascii");
  const escapeDrift = nativeBuffer.from(canonical.lineText.replace("command=\"", "command=\"\\") + "\n", "ascii");
  const missingLf = nativeBuffer.from(canonical.lineText, "ascii");
  const secondLine = nativeBuffer.concat([canonical.file, alternate.file]);
  const duplicateLine = nativeBuffer.concat([canonical.file, canonical.file]);
  const blankPrefix = nativeBuffer.concat([nativeBuffer.from("\n", "ascii"), canonical.file]);
  const blankSuffix = nativeBuffer.concat([canonical.file, nativeBuffer.from("\n", "ascii")]);
  const commentPrefix = nativeBuffer.concat([nativeBuffer.from("# comment\n", "ascii"), canonical.file]);
  const commentSuffix = nativeBuffer.concat([canonical.file, nativeBuffer.from("# comment\n", "ascii")]);
  const folded = nativeBuffer.from(canonical.lineText.slice(0, 20) + "\n" + canonical.lineText.slice(20) + "\n", "ascii");
  const cr = nativeBuffer.from(canonical.lineText + "\r\n", "ascii");
  const nul = nativeBuffer.concat([canonical.line, nativeBuffer.from([0]), nativeBuffer.from("\n", "ascii")]);
  const unicode = nativeBuffer.concat([canonical.line, nativeBuffer.from([0xc3, 0xa9, 10])]);
  const encodedStart = canonical.lineText.indexOf(" ssh-ed25519 ") + " ssh-ed25519 ".length;
  const encodedEnd = canonical.lineText.lastIndexOf(" test-gate");
  const invalidBase64Alphabet = nativeBuffer.from(
    canonical.lineText.slice(0, encodedStart)
      + "!" + canonical.lineText.slice(encodedStart + 1) + "\n", "ascii");
  const noncanonicalBase64 = nativeBuffer.from(
    canonical.lineText.slice(0, encodedEnd) + "=" + canonical.lineText.slice(encodedEnd) + "\n", "ascii");
  const alignedExtraPadding = nativeBuffer.from(
    canonical.lineText.slice(0, encodedEnd) + "====" + canonical.lineText.slice(encodedEnd) + "\n", "ascii");
  function c4WireFixture(algorithmText, keyLength, trailingByte = false) {
    const algorithm = nativeBuffer.from(algorithmText, "ascii");
    const key = nativeBuffer.alloc(keyLength, 7);
    const blob = nativeBuffer.alloc(4 + algorithm.length + 4 + key.length + (trailingByte ? 1 : 0));
    blob.writeUInt32BE(algorithm.length, 0);
    algorithm.copy(blob, 4);
    blob.writeUInt32BE(key.length, 4 + algorithm.length);
    key.copy(blob, 8 + algorithm.length);
    if (trailingByte) blob[blob.length - 1] = 1;
    algorithm.fill(0);
    key.fill(0);
    return blob;
  }
  const wrongWireAlgorithm = c4WireFixture("ssh-ed25518", 32);
  const wrongWireLength = c4WireFixture("ssh-ed25519", 31);
  const trailingWire = c4WireFixture("ssh-ed25519", 32, true);
  const wrongWireAlgorithmLengthSameTotal = nativeBuffer.from(canonical.blob);
  wrongWireAlgorithmLengthSameTotal.writeUInt32BE(canonical.algorithm.length - 1, 0);
  const canonicalKeyLengthOffset = 4 + canonical.algorithm.length;
  const wrongWireKeyLength31SameTotal = nativeBuffer.from(canonical.blob);
  wrongWireKeyLength31SameTotal.writeUInt32BE(31, canonicalKeyLengthOffset);
  const wrongWireAlgorithmFile = c4AuthorizationFileFromBlob(wrongWireAlgorithm);
  const wrongWireLengthFile = c4AuthorizationFileFromBlob(wrongWireLength);
  const trailingWireFile = c4AuthorizationFileFromBlob(trailingWire);
  const wrongWireAlgorithmLengthSameTotalFile = c4AuthorizationFileFromBlob(
    wrongWireAlgorithmLengthSameTotal);
  const wrongWireKeyLength31SameTotalFile = c4AuthorizationFileFromBlob(
    wrongWireKeyLength31SameTotal);
  const wrongLineAlgorithm = c4AuthorizationFileFromBlob(canonical.blob, "ssh-rsa");
  const extraToken = c4AuthorizationFileFromBlob(canonical.blob, "ssh-ed25519", "test-gate", "extra");
  const wrongMarker = c4AuthorizationFileFromBlob(canonical.blob, "ssh-ed25519", "wrong-marker");
  const markerPrefixDrift = c4AuthorizationFileFromBlob(
    canonical.blob, "ssh-ed25519", "test-gate-suffix");
  const markerSuffixDrift = c4AuthorizationFileFromBlob(
    canonical.blob, "ssh-ed25519", "second-test-gate");
  const tabSeparator = nativeBuffer.from(
    canonical.lineText.replace(" ssh-ed25519 ", "\tssh-ed25519 ") + "\n", "ascii");
  const unitSeparator = nativeBuffer.from(
    canonical.lineText.replace(" ssh-ed25519 ", "\x1fssh-ed25519 ") + "\n", "latin1");
  const deleteSeparator = nativeBuffer.from(
    canonical.lineText.replace(" ssh-ed25519 ", "\x7fssh-ed25519 ") + "\n", "latin1");
  const canonicalOptionTokens = [
    "restrict",
    "no-pty",
    "no-agent-forwarding",
    "no-port-forwarding",
    "no-X11-forwarding",
    "command=\"/usr/bin/sudo -n -- /usr/local/libexec/gccgw/japan-tuic-additive-repair-entrypoint\""
  ];
  const canonicalOptionNames = [
    "restrict", "no-pty", "no-agent-forwarding", "no-port-forwarding", "no-x11-forwarding", "command"
  ];
  const canonicalTail = canonical.lineText.slice(canonical.lineText.indexOf(" ssh-ed25519 "));
  function c4AuthorizationFileWithOptions(optionTokens) {
    return nativeBuffer.from(optionTokens.join(",") + canonicalTail + "\n", "ascii");
  }
  const commandSingleQuoteTokens = canonicalOptionTokens.slice();
  commandSingleQuoteTokens[commandSingleQuoteTokens.length - 1]
    = "command='/usr/bin/sudo -n -- /usr/local/libexec/gccgw/japan-tuic-additive-repair-entrypoint'";
  const commandSingleQuoteDrift = c4AuthorizationFileWithOptions(commandSingleQuoteTokens);
  const requiredOptionFailures = new nativeArray();
  for (let index = 0; index < canonicalOptionTokens.length; index += 1) {
    const omitted = canonicalOptionTokens.slice();
    omitted.splice(index, 1);
    requiredOptionFailures.push([
      "option-omitted-" + canonicalOptionNames[index],
      c4AuthorizationFileWithOptions(omitted),
      canonical.blob,
      true
    ]);
    const duplicated = canonicalOptionTokens.slice();
    duplicated.splice(index, 0, canonicalOptionTokens[index]);
    requiredOptionFailures.push([
      "option-duplicated-" + canonicalOptionNames[index],
      c4AuthorizationFileWithOptions(duplicated),
      canonical.blob,
      true
    ]);
  }
  const commandDriftTokens = canonicalOptionTokens.slice();
  commandDriftTokens[commandDriftTokens.length - 1]
    = "command=\"/usr/bin/sudo -n -- /usr/local/libexec/gccgw/japan-tuic-additive-repair-entrypoint-drift\"";
  const commandValueDrift = c4AuthorizationFileWithOptions(commandDriftTokens);
  function c4LateCommandBoundaryFile(lineLength) {
    const prefix = canonicalOptionTokens.slice(0, -1).join(",") + ",command=\"";
    const command = "/usr/bin/sudo -n -- /usr/local/libexec/gccgw/japan-tuic-additive-repair-entrypoint";
    const suffix = "\"" + canonicalTail;
    const paddingLength = lineLength - nativeBuffer.byteLength(prefix + command + suffix, "ascii");
    if (paddingLength < 1) throw new Error("invalid C4 late-command boundary fixture");
    const line = prefix + command + "x".repeat(paddingLength) + suffix;
    if (nativeBuffer.byteLength(line, "ascii") !== lineLength) throw new Error("invalid C4 boundary length");
    return nativeBuffer.from(line + "\n", "ascii");
  }
  const maximumLine = c4LateCommandBoundaryFile(16384);
  const overflowLine = c4LateCommandBoundaryFile(16385);
  const authFailureSpecs = [
    ["empty", nativeBuffer.alloc(0), null, true, []],
    ["blank", nativeBuffer.from("\n", "ascii"), null, true, []],
    ["comment", nativeBuffer.from("# comment\n", "ascii"), null, true],
    ["blank-prefix", blankPrefix, null, true],
    ["blank-suffix", blankSuffix, null, true],
    ["comment-prefix", commentPrefix, null, true],
    ["comment-suffix", commentSuffix, null, true],
    ["missing-lf", missingLf, null, true],
    ["folded", folded, null, true],
    ["second-active", secondLine, null, true],
    ["duplicate-target", duplicateLine, null, true],
    ["alternate-key", alternate.file, null, false],
    ["bad-option-order", badOption, null, true],
    ["unknown-option", unknownOption, null, true],
    ["escape-drift", escapeDrift, null, true],
    ["noncanonical-base64", noncanonicalBase64, canonical.blob, true],
    ["base64-aligned-extra-padding", alignedExtraPadding, canonical.blob, true],
    ["wrong-line-algorithm", wrongLineAlgorithm, canonical.blob, true],
    ["wrong-wire-algorithm", wrongWireAlgorithmFile, wrongWireAlgorithm, true],
    ["wrong-wire-key-length", wrongWireLengthFile, wrongWireLength, true],
    ["trailing-wire-byte", trailingWireFile, trailingWire, true],
    ["wrong-wire-algorithm-length-field-same-total", wrongWireAlgorithmLengthSameTotalFile,
      wrongWireAlgorithmLengthSameTotal, true],
    ["wrong-wire-key-length-31-same-total", wrongWireKeyLength31SameTotalFile,
      wrongWireKeyLength31SameTotal, true],
    ["extra-token", extraToken, canonical.blob, true],
    ["wrong-marker", wrongMarker, canonical.blob, true],
    ["marker-prefix-drift", markerPrefixDrift, canonical.blob, true],
    ["marker-suffix-drift-second-test-gate", markerSuffixDrift, canonical.blob, true],
    ["tab-separator", tabSeparator, canonical.blob, true],
    ["unit-separator-0x1f", unitSeparator, canonical.blob, true],
    ["delete-separator-0x7f", deleteSeparator, canonical.blob, true],
    ["base64-invalid-alphabet", invalidBase64Alphabet, canonical.blob, true],
    ...requiredOptionFailures,
    ["command-single-quote-drift", commandSingleQuoteDrift, canonical.blob, true],
    ["command-value-drift", commandValueDrift, canonical.blob, true],
    ["cr", cr, null, true],
    ["nul", nul, null, true],
    ["unicode", unicode, null, true],
    ["line-16384", maximumLine, canonical.blob, true, ["body", "eof"]],
    ["line-16385", overflowLine, canonical.blob, true, []]
  ];
  const canonicalSelectionNames = [
    "empty", "blank", "comment", "blank-prefix", "blank-suffix", "comment-prefix", "comment-suffix",
    "folded", "second-active", "duplicate-target"
  ];
  const authFailures = authFailureSpecs.map(([name, authFile, canonicalBlob, bindActualLine, expectedAuthReadStages]) => {
    const canonicalSelection = canonicalSelectionNames.includes(name);
    const actualLine = canonicalSelection
      ? canonical.line
      : bindActualLine ? c4LineForBinding(authFile) : null;
    const selectedBlob = canonicalSelection ? canonical.blob : canonicalBlob;
    const legacyWholeFileLine = c4LineForBinding(authFile);
    const legacyWholeFileLineSha256 = crypto.createHash("sha256")
      .update(legacyWholeFileLine).digest("hex");
    return {
      name,
      failureAudit: expectedAuthReadStages === undefined
        ? c4TopologyFailureAudit("authorization-grammar-or-digest", "failure")
        : c4TopologyFailureAudit("authorization-grammar-or-digest", "failure", true,
          c4ExpectedTopologyPathOperations(expectedAuthReadStages)),
      expectedAuthReadStages: expectedAuthReadStages === undefined ? null : expectedAuthReadStages,
      canonicalSelection,
      expectedLineSha256: actualLine
        ? crypto.createHash("sha256").update(actualLine).digest("hex")
        : null,
      selectedLineSha256: actualLine
        ? crypto.createHash("sha256").update(actualLine).digest("hex")
        : null,
      expectedBlobSha256: selectedBlob
        ? crypto.createHash("sha256").update(selectedBlob).digest("hex")
        : null,
      legacyWholeFileLineLength: legacyWholeFileLine.length,
      legacyWholeFileLineSha256,
      probe: c4Topology(safe, {
        authFile,
        ...(actualLine ? { canonicalLine: actualLine } : {}),
        ...(selectedBlob ? { canonicalBlob: selectedBlob } : {})
      })
    };
  });
  const metadataFailures = [
    ["uid", { mode: 0o600, uid: 1000 }],
    ["gid", { mode: 0o600, gid: 1000 }],
    ["mode-0400", { mode: 0o400 }],
    ["mode-0601", { mode: 0o601 }],
    ["mode-0644", { mode: 0o644 }],
    ["mode-0700", { mode: 0o700 }],
    ["nlink", { mode: 0o600, nlink: 2 }]
  ].map(([name, authMetadata]) => ({
    name,
    expectedCalls: c4AuthorizationFileLstatOperations(),
    failureAudit: c4TopologyFailureAudit("authorization-metadata", "failure"),
    probe: c4Topology(safe, { authMetadata })
  }));
  const ancestorFailures = ["ancestor-0", "ancestor-1", "ancestor-2", "ancestor-3"]
    .flatMap((role) => [
      ["non-directory", { kind: "nonregular", role }],
      ["non-root-uid", { kind: "stat-override", role, overrides: { uid: 1000 } }],
      ["non-root-gid", { kind: "stat-override", role, overrides: { gid: 1000 } }],
      ["group-writable-mode", { kind: "stat-override", role, overrides: { mode: 0o775 } }],
      ["other-writable-mode", { kind: "stat-override", role, overrides: { mode: 0o757 } }]
    ].map(([name, fault]) => ({
      name: role + "-" + name,
      role,
      operationWitness: ["lstat", role],
      expectedCalls: c4AuthorizationAncestorOperationsThrough(role),
      failureAudit: c4TopologyFailureAudit(
        "authorization-ancestor", "failure", false, c4AuthorizationAncestorOperationsThrough(role)),
      probe: c4Topology(safe, { environmentOptions: { fault: { ...fault, verificationOnly: true } } })
    })));
  const operationFailures = [
    ["auth-lstat-failure", { fault: { kind: "lstat-failure", role: "file-1" } }, false, ["lstat", "file-1"]],
    ["auth-nonregular", { fault: { kind: "nonregular", role: "file-1" } }, false, ["lstat", "file-1"]],
    ["auth-open-failure", { fault: { kind: "open-failure", role: "file-1" } }, false, ["open", "file-1", "file"]],
    ["auth-pre-fstat-failure", { fault: { kind: "fstat-failure", role: "file-1", stage: "pre" } }, true, ["fstat", "file-1", "pre"]],
    ["auth-read-failure", { fault: { kind: "read-failure", role: "file-1" } }, true, ["read", "file-1", "body-failure"]],
    ["auth-body-invalid-count", { fault: { kind: "body-invalid-count", role: "file-1" } }, true, ["read", "file-1", "body-invalid-count"]],
    ["auth-eof-invalid-count", { fault: { kind: "eof-invalid-count", role: "file-1" } }, true, ["read", "file-1", "eof-invalid-count"]],
    ["post-fstat-drift", { fault: { kind: "post-fstat-drift", role: "file-1" } }, true, ["fstat", "file-1", "post"]],
    ["early-eof", { fault: { kind: "early-eof", role: "file-1" } }, true, ["read", "file-1", "body-early-eof"]],
    ["trailing-byte", { fault: { kind: "trailing-byte", role: "file-1" } }, true, ["read", "file-1", "eof-trailing-byte"]],
    ["close-failure", { fault: { kind: "close-failure", role: "file-1" } }, true, ["close", "file-1"]]
  ].map(([name, environmentOptions, authorizationOpenExpected, operationWitness]) => ({
    name,
    failureAudit: c4TopologyFailureAudit(
      "authorization-operation", "failure", authorizationOpenExpected,
      c4AuthorizationOperationFailureCalls(name)),
    operationWitness,
    probe: c4Topology(safe, {
      environmentOptions: {
        ...environmentOptions,
        fault: { ...environmentOptions.fault, verificationOnly: true }
      }
    })
  }));
  operationFailures.push({
    name: "wrong-fd",
    failureAudit: c4TopologyFailureAudit(
      "authorization-operation", "failure", true, c4AuthorizationOperationFailureCalls("wrong-fd")),
    operationWitness: ["fstat", "unrecognized-fd", "post"],
    probe: c4Topology(safe, { operationMutation: "wrong-fd" })
  });
  const streamingSuccesses = [
    ["body-partial", { fault: { kind: "body-partial", role: "file-1" } }, ["body", "body", "eof"]],
    ["body-eintr", { fault: { kind: "body-eintr", role: "file-1" } }, ["body-eintr", "body", "eof"]],
    ["eof-eintr", { fault: { kind: "eof-eintr", role: "file-1" } }, ["body", "eof-eintr", "eof"]]
  ].map(([name, environmentOptions, expectedAuthReadStages]) => ({
    name,
    expectedAuthReadStages,
    probe: c4Topology(safe, {
      environmentOptions: {
        ...environmentOptions,
        fault: { ...environmentOptions.fault, verificationOnly: true }
      }
    })
  }));
  const bindingDrifts = ["line", "blob", "effective"].map((name) => ({
    name,
    failureAudit: c4TopologyFailureAudit(
      name === "effective" ? "binding-effective-digest" : "binding-authorization-digest",
      name === "effective" ? "success" : "failure"
    ),
    probe: c4Topology(safe, { bindingDrift: name })
  }));
  const snapshotFixture = c4AuthorizationFixture(7, "test-gate");
  const laterFixture = c4AuthorizationFixture(23, "test-gate");
  const bindingSnapshotMutation = {
    failureAudit: c4TopologyFailureAudit("binding-authorization-digest", "failure"),
    probe: c4Topology(safe, {
      fixture: snapshotFixture,
      canonicalLine: snapshotFixture.line,
      canonicalBlob: snapshotFixture.blob,
      authFile: laterFixture.file,
      bindingMutationDigests: {
        line: crypto.createHash("sha256").update(laterFixture.line).digest("hex"),
        blob: crypto.createHash("sha256").update(laterFixture.blob).digest("hex")
      }
    })
  };
  snapshotFixture.algorithm.fill(0);
  snapshotFixture.key.fill(0);
  snapshotFixture.blob.fill(0);
  snapshotFixture.line.fill(0);
  snapshotFixture.file.fill(0);
  laterFixture.algorithm.fill(0);
  laterFixture.key.fill(0);
  laterFixture.blob.fill(0);
  laterFixture.line.fill(0);
  laterFixture.file.fill(0);
  const bindingValueDrifts = c4CanonicalBindingValueDriftMatrix();
  const positive = c4Topology(safe);
  const secondPositive = c4Topology(safe, {
    fixture: c4AuthorizationFixture(23)
  });
  const preimageAudits = {
    includeSuccess: c4PublicPreimageWitness("include"),
    coverageSuccess: c4PublicPreimageWitness("coverage"),
    topologySuccess: c4PublicPreimageWitness("topology"),
    topologyFailure: c4PublicPreimageWitness("topology", true)
  };
  const publicFaultMatrices = {
    include: c4PublicFaultMatrix("include", preimageAudits.includeSuccess),
    coverage: c4PublicFaultMatrix("coverage", preimageAudits.coverageSuccess),
    topology: c4PublicFaultMatrix("topology", preimageAudits.topologySuccess)
  };
  const publicDisposerMatrix = c4PublicDisposerMatrix();
  const lateEffectiveDigestAndPolicyDeleteFailure = c4CompactPublicFailure(
    c4PublicPreimageWitness("topology", true, { kind: "registryDeleteAfter", identity: "policy" })
  );
  const privatePolicyLifecycle = c4PolicyLifecycle();
  const privatePolicyPhase = privatePolicyLifecycle.lifecycle.phases.find((entry) =>
    entry.name === "derivePolicy");
  const privatePolicyPreimage = {
    result: {
      ok: privatePolicyLifecycle.derive.ok,
      error: privatePolicyLifecycle.derive.error
    },
    preimages: c4LifecyclePreimageAudit(privatePolicyLifecycle.lifecycle, "derivePolicy"),
    preimagePendingCount: privatePolicyPhase.preimagePendingCount,
    coverageOracle: privatePolicyLifecycle.coverageOracle
  };
  canonical.algorithm.fill(0);
  canonical.key.fill(0);
  canonical.blob.fill(0);
  canonical.line.fill(0);
  canonical.file.fill(0);
  alternate.algorithm.fill(0);
  alternate.key.fill(0);
  alternate.blob.fill(0);
  alternate.line.fill(0);
  alternate.file.fill(0);
  for (const buffer of [
    badOption, unknownOption, escapeDrift, missingLf, secondLine, duplicateLine, blankPrefix, blankSuffix,
    commentPrefix, commentSuffix, folded, cr, nul, unicode, noncanonicalBase64, alignedExtraPadding,
    wrongWireAlgorithm, wrongWireLength, trailingWire, wrongWireAlgorithmLengthSameTotal,
    wrongWireKeyLength31SameTotal, wrongWireAlgorithmFile,
    wrongWireLengthFile, trailingWireFile, wrongWireAlgorithmLengthSameTotalFile,
    wrongWireKeyLength31SameTotalFile,
    wrongLineAlgorithm, extraToken, wrongMarker,
    markerPrefixDrift, markerSuffixDrift, tabSeparator, unitSeparator, deleteSeparator,
    invalidBase64Alphabet, commandSingleQuoteDrift, commandValueDrift,
    ...requiredOptionFailures.map(([, value]) => value), maximumLine, overflowLine
  ]) buffer.fill(0);
  return {
    scenario: "topology",
    encodedTokenLength: encodedEnd - encodedStart,
    positive,
    secondPositive,
    sourceFailures,
    directiveMatchMatrix,
    authFailures,
    canonicalSelectionNames,
    metadataFailures,
    ancestorFailures,
    operationFailures,
    streamingSuccesses,
    bindingDrifts,
    bindingSnapshotMutation,
    bindingValueDrifts,
    preimageAudits,
    publicFaultExpectations: nativeObject.keys(C4_PUBLIC_FAULT_EXPECTATION_TABLE).sort().map((key) => ({
      key,
      faultKind: C4_PUBLIC_FAULT_EXPECTATION_TABLE[key].faultKind,
      freezeTrace: [...C4_PUBLIC_FAULT_EXPECTATION_TABLE[key].freezeTrace],
      topologyFreezeCount: C4_PUBLIC_FAULT_EXPECTATION_TABLE[key].topologyFreezeCount
    })),
    publicFaultMatrices,
    publicDisposerMatrix,
    lateEffectiveDigestAndPolicyDeleteFailure,
    privatePolicyPreimage
  };
}

function c3FixtureProof(name) {
  const state = fresh();
  return {
    scenarioKnown: ["depth", "coordinates", "include", "lexer", ...C4_SCENARIOS].includes(name),
    linked: module.status === "linked" || module.status === "evaluated",
    evaluated: module.status === "evaluated",
    nativeTypes: api.__test_c2bProxyInstrumentation(state),
    c3Arities: api.__test_c3Arities(),
    c4Arities: api.__test_c4Arities(),
    freshState: inspect(state)
  };
}

function c3UnknownScenario() {
  throw new Error("unknown C3 scenario");
}

try {
  const fixture = c3FixtureProof(scenario);
  const c3MissingSymbols = api.__test_missingC3Symbols();
  const c4Scenario = C4_SCENARIOS.includes(scenario);
  const missingSymbols = c4Scenario ? api.__test_missingC4Symbols() : c3MissingSymbols;
  const scenarioValue = c3MissingSymbols.length !== 0 || missingSymbols.length !== 0
    ? undefined
    : scenario === "depth"
      ? c3DepthScenario()
      : scenario === "coordinates"
        ? c3CoordinateScenario()
        : scenario === "include"
          ? c3IncludeScenario()
          : scenario === "lexer"
            ? c3LexerScenario()
            : scenario === "c4-match"
              ? c4MatchScenario()
              : scenario === "c4-variable"
                ? c4VariableScenario()
                : scenario === "c4-effective"
                  ? c4EffectiveScenario()
                  : scenario === "c4-topology"
                    ? c4TopologyScenario()
            : c3UnknownScenario();
  process.stdout.write(JSON.stringify({
    error: null,
    value: {
      fixture,
      c3MissingSymbols,
      missingSymbols,
      moduleAllocationCounts,
      c4RedGuard: { scenarioInvocationCount: c4ScenarioInvocationCount, accountReadCount: c4AccountReadCount, injectedOperationCount: c4InjectedOperationCount },
      scenarioValue
    }
  }));
} catch (error) {
  process.stdout.write(JSON.stringify({ error: errorCode(error) }));
}
`;

const C4_HOST_SNAPSHOT_KEY_NAMES = Object.freeze(
  "authorizationEntryCount,failed,fixedEnvelopeCount,retainedPreimageBytes,semanticNodeCount,sshGraph,sshMatchComparisonCount,sudoAliasVisitCount,sudoGraph,sudoSelectorComparisonCount,wildcardAlignedComparisonCount,wildcardInvocationCount,wildcardPatternByteCount".split(",")
);
const C4_HOST_SNAPSHOT_NUMERIC_BUDGET_KEYS = Object.freeze([
  "fixedEnvelopeCount", "semanticNodeCount", "authorizationEntryCount", "wildcardPatternByteCount",
  "wildcardInvocationCount", "wildcardAlignedComparisonCount", "sshMatchComparisonCount",
  "sudoSelectorComparisonCount", "sudoAliasVisitCount", "retainedPreimageBytes"
]);
const C4_HOST_GRAPH_NUMERIC_BUDGET_KEYS = Object.freeze([
  "fixedEnvelopeCount", "semanticNodeCount", "fileCount", "sourceFileCount", "totalBytes",
  "directoryNameCount", "depth", "nextOrdinal", "sshPhysicalDirectiveCount", "sshIncludePatternCount",
  "sshSelectedInsertionCount", "sshMatchBranchCount", "sshMatchConditionCount", "sshMatchPatternCount",
  "sshAssignmentCount", "sshAcceptEnvNameCount", "sudoStatementCount", "sudoIncludeCount",
  "sudoSelectedInsertionCount", "sudoAliasDefinitionCount", "sudoAliasMemberCount", "sudoDefaultsItemCount",
  "sudoUserSpecCount", "sudoUserHostRunasMemberCount", "sudoTagTransitionCount", "sudoCommandSpecCount",
  "sudoArgumentTokenCount", "sudoAliasEdgeCount", "sudoAliasMemoEntryCount", "globComparisonCount",
  "commandWorkCount", "aliasEdgeWorkCount"
]);
const C4_HOST_VERIFIER_CANONICAL_PATH_BYTE_LENGTHS = Object.freeze([
  46, 49, 30, 53, 30, 29, 35, 31, 41, 36, 45
]);

function c3VmProbe(scenario, timeout = 120000) {
  const directory = mkdtempSync(join(tmpdir(), "japan-c3-ssh-vm-"));
  const harnessPath = join(directory, "harness.mjs");
  const runnerPath = fileURLToPath(new URL("../../scripts/japan-tuic-additive-repair-runner.mjs", import.meta.url));
  writeFileSync(harnessPath, c2bBudgetHarnessPrefix() + C3_VM_HARNESS_SUFFIX, "utf8");
  try {
    const result = spawnSync(process.execPath, ["--experimental-vm-modules", harnessPath, runnerPath, scenario], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout
    });
    assert.equal(result.status, 0, result.stderr || String(result.error));
    return JSON.parse(result.stdout);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function c3FormalMarkerBlock() {
  const runnerPath = fileURLToPath(new URL("../../scripts/japan-tuic-additive-repair-runner.mjs", import.meta.url));
  const source = readFileSync(runnerPath, "utf8").replaceAll("\r\n", "\n");
  const begin = source.indexOf(C3_EXACT_BLOCK_BEGIN);
  const end = source.indexOf(C3_EXACT_BLOCK_END, begin < 0 ? 0 : begin + C3_EXACT_BLOCK_BEGIN.length);
  const endAfter = end < 0 ? -1 : end + C3_EXACT_BLOCK_END.length;
  return {
    normalized: source,
    block: begin >= 0 && endAfter >= 0 ? source.slice(begin, endAfter) : "",
    blockThroughEndLf: begin >= 0 && endAfter >= 0 && source[endAfter] === "\n"
      ? source.slice(begin, endAfter + 1)
      : ""
  };
}

function c3FormalSourceTruth() {
  const { block } = c3FormalMarkerBlock();
  const helperStart = block.indexOf("function authorizationSshIncludeFinalStart(");
  const helperEnd = block.indexOf("\nfunction ", helperStart < 0 ? 0 : helperStart + 1);
  const helper = helperStart >= 0 && helperEnd > helperStart ? block.slice(helperStart, helperEnd) : "";
  const scannerText = "scanAuthorizationWildcardPattern(active, pattern)";
  const scannerIndex = block.indexOf(scannerText);
  const branchIndex = block.indexOf("if (!hasWildcard)", scannerIndex < 0 ? 0 : scannerIndex + scannerText.length);
  const scannerSegment = scannerIndex >= 0 && branchIndex > scannerIndex
    ? block.slice(scannerIndex + scannerText.length, branchIndex)
    : "";
  const scannerCalls = block.match(/\bscanAuthorizationWildcardPattern\s*\(\s*active\s*,\s*pattern\s*\)/g) || [];
  const namesSubstringCalls = block.match(/\bnames\.(?:slice|substring|substr)\s*\(/g) || [];
  return {
    namesSubstringCallCount: namesSubstringCalls.length,
    wildcard: {
      signedFinalStart: /return\s+componentWildcard\s*\?\s*-\s*\(\s*finalStart\s*\+\s*1\s*\)\s*:\s*finalStart\s*;/.test(helper),
      singleScalarDecode: /const\s+encodedFinalStart\s*=\s*authorizationSshIncludeFinalStart\s*\([^;]+;[\s\S]*?const\s+hasWildcard\s*=\s*encodedFinalStart\s*<\s*0\s*;[\s\S]*?const\s+finalStart\s*=\s*hasWildcard\s*\?\s*-\s*encodedFinalStart\s*-\s*1\s*:\s*encodedFinalStart\s*;/.test(block),
      scannerCallCount: scannerCalls.length,
      noPostScannerRescan: scannerSegment.length > 0
        && !/\b(?:for|while)\s*\(/.test(scannerSegment)
        && !/\bpattern\s*\[[^\]]+\]/.test(scannerSegment)
    }
  };
}

function c3SourceCount(source, needle) {
  return source.split(needle).length - 1;
}

function c3SourceRegion(source, beginNeedle, endNeedle) {
  const begin = source.indexOf(beginNeedle);
  const end = source.indexOf(endNeedle, begin < 0 ? 0 : begin + beginNeedle.length);
  assert.ok(begin >= 0 && end > begin, `${beginNeedle} -> ${endNeedle}`);
  return source.slice(begin, end);
}

function c3AssertOrderedSource(source, needles) {
  let offset = 0;
  for (const needle of needles) {
    const index = source.indexOf(needle, offset);
    assert.ok(index >= offset, needle);
    offset = index + needle.length;
  }
}

function c4TokenizeSource(source) {
  const tokens = [];
  const punctuators = ["===", "!==", ">>>", "**=", "&&=", "||=", "??=", "=>", "==", "!=", "<=", ">=", "++", "--", "&&", "||", "??", "?.", "**", "<<", ">>", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "..."];
  let index = 0;
  while (index < source.length) {
    const code = source.charCodeAt(index);
    if (code === 0x09 || code === 0x0a || code === 0x0d || code === 0x20) {
      index += 1;
      continue;
    }
    if (source[index] === "/" && source[index + 1] === "/") {
      index += 2;
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }
    if (source[index] === "/" && source[index + 1] === "*") {
      index += 2;
      while (index + 1 < source.length && !(source[index] === "*" && source[index + 1] === "/")) index += 1;
      assert.ok(index + 1 < source.length, "unterminated block comment");
      index += 2;
      continue;
    }
    if (source[index] === "\"" || source[index] === "'" || source[index] === "`") {
      const start = index;
      const quote = source[index++];
      let escaped = false;
      while (index < source.length) {
        const character = source[index++];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (character === "\\") {
          escaped = true;
          continue;
        }
        if (character === quote) break;
        if (quote !== "`" && (character === "\n" || character === "\r")) assert.fail("newline in string literal");
      }
      assert.equal(source[index - 1], quote, "unterminated string or template literal");
      tokens.push({ type: quote === "`" ? "template" : "string", value: source.slice(start, index) });
      continue;
    }
    const identifierStart = (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)
      || code === 0x5f || code === 0x24;
    if (identifierStart) {
      const start = index++;
      while (index < source.length) {
        const next = source.charCodeAt(index);
        if (!((next >= 0x41 && next <= 0x5a) || (next >= 0x61 && next <= 0x7a)
          || (next >= 0x30 && next <= 0x39) || next === 0x5f || next === 0x24)) break;
        index += 1;
      }
      tokens.push({ type: "identifier", value: source.slice(start, index) });
      continue;
    }
    if (code >= 0x30 && code <= 0x39) {
      const start = index++;
      while (index < source.length && /[A-Za-z0-9_.]/.test(source[index])) index += 1;
      tokens.push({ type: "number", value: source.slice(start, index) });
      continue;
    }
    const punctuator = punctuators.find((value) => source.startsWith(value, index));
    if (punctuator) {
      tokens.push({ type: "punctuator", value: punctuator });
      index += punctuator.length;
      continue;
    }
    tokens.push({ type: "punctuator", value: source[index++] });
  }
  return tokens;
}

function c4TokenSequenceCount(tokens, values) {
  let count = 0;
  for (let index = 0; index <= tokens.length - values.length; index += 1) {
    let matches = true;
    for (let offset = 0; offset < values.length; offset += 1) {
      if (tokens[index + offset].value !== values[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) count += 1;
  }
  return count;
}

function c4TokenIdentitySha256(tokens) {
  const hash = createHash("sha256");
  for (const token of tokens) {
    hash.update(token.type);
    hash.update("\0");
    hash.update(String(Buffer.byteLength(token.value, "utf8")));
    hash.update(":");
    hash.update(token.value);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function c4TopLevelDeclarations(tokens) {
  const declarations = [];
  const arities = [];
  let braceDepth = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (braceDepth === 0 && token.value === "const" && tokens[index + 1]?.type === "identifier") {
      declarations.push(`const ${tokens[index + 1].value}`);
    }
    if (braceDepth === 0 && token.value === "function" && tokens[index + 1]?.type === "identifier"
      && tokens[index + 2]?.value === "(") {
      const name = tokens[index + 1].value;
      declarations.push(`function ${name}`);
      let parameterDepth = 1;
      let parameterCount = tokens[index + 3]?.value === ")" ? 0 : 1;
      for (let cursor = index + 3; cursor < tokens.length && parameterDepth > 0; cursor += 1) {
        if (tokens[cursor].value === "(") parameterDepth += 1;
        else if (tokens[cursor].value === ")") parameterDepth -= 1;
        else if (tokens[cursor].value === "," && parameterDepth === 1) parameterCount += 1;
      }
      arities.push(`${name}/${parameterCount}`);
    }
    if (token.value === "{") braceDepth += 1;
    else if (token.value === "}") braceDepth -= 1;
    assert.ok(braceDepth >= 0, "C4 token brace depth");
  }
  assert.equal(braceDepth, 0, "C4 token brace balance");
  return { declarations: declarations.sort(), arities: arities.sort() };
}

function c4LiteralContainerCounts(tokens) {
  const expressionPunctuators = new Set([
    "=", "(", "[", "{", ";", ",", ":", "?", "=>", "!", "~", "+", "-", "*", "/", "%", "**",
    "<", ">", "<=", ">=", "==", "===", "!=", "!==", "&", "|", "^", "<<", ">>", ">>>",
    "&&", "||", "??", "+=", "-=", "*=", "/=", "%=", "**=", "&&=", "||=", "??=", "&=", "|=", "^="
  ]);
  const expressionKeywords = new Set([
    "return", "yield", "throw", "const", "let", "var", "void", "typeof", "delete", "await",
    "of", "in", "instanceof", "case"
  ]);
  let object = 0;
  let array = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    const current = tokens[index].value;
    if (current !== "{" && current !== "[") continue;
    const previous = tokens[index - 1];
    const expressionStart = !previous || expressionPunctuators.has(previous.value)
      || (previous.type === "identifier" && expressionKeywords.has(previous.value));
    if (!expressionStart) continue;
    if (current === "{") object += 1;
    else array += 1;
  }
  return { object, array };
}

function c4ContainsOrdered(source, needles) {
  let offset = 0;
  for (const needle of needles) {
    const index = source.indexOf(needle, offset);
    if (index < offset) return false;
    offset = index + needle.length;
  }
  return true;
}

function c4StaticStringValue(tokens, start, end, bindings) {
  let value = "";
  let operand = false;
  let expectOperand = true;
  for (let index = start; index < end; index += 1) {
    const token = tokens[index];
    if (token.value === "(" || token.value === ")") continue;
    if (expectOperand) {
      if (token.type === "string" && !token.value.includes("\\")) {
        value += token.value.slice(1, -1);
      } else if (token.type === "identifier" && bindings.has(token.value)) {
        value += bindings.get(token.value);
      } else {
        return undefined;
      }
      operand = true;
      expectOperand = false;
    } else if (token.value === "+") {
      expectOperand = true;
    } else {
      return undefined;
    }
  }
  return operand && !expectOperand ? value : undefined;
}

function c4StaticStringBindings(tokens) {
  const bindings = new Map();
  for (let index = 0; index < tokens.length - 4; index += 1) {
    if (!["const", "let"].includes(tokens[index].value)
      || tokens[index + 1].type !== "identifier" || tokens[index + 2].value !== "=") continue;
    let end = index + 3;
    while (end < tokens.length && tokens[end].value !== ";") end += 1;
    if (end >= tokens.length) continue;
    const value = c4StaticStringValue(tokens, index + 3, end, bindings);
    if (value !== undefined) bindings.set(tokens[index + 1].value, value);
  }
  return bindings;
}

function c4ComputedPropertyNames(tokens, bindings) {
  const names = [];
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index].value !== "[") continue;
    let depth = 1;
    let end = index + 1;
    while (end < tokens.length && depth > 0) {
      if (tokens[end].value === "[") depth += 1;
      else if (tokens[end].value === "]") depth -= 1;
      if (depth > 0) end += 1;
    }
    if (depth !== 0) continue;
    const value = c4StaticStringValue(tokens, index + 1, end, bindings);
    if (value !== undefined) names.push(value);
  }
  return names;
}

function c4FunctionArity(tokens, name) {
  for (let index = 0; index < tokens.length - 3; index += 1) {
    if (tokens[index].value !== "function" || tokens[index + 1].value !== name || tokens[index + 2].value !== "(") continue;
    let depth = 1;
    let count = tokens[index + 3].value === ")" ? 0 : 1;
    for (let cursor = index + 3; cursor < tokens.length && depth > 0; cursor += 1) {
      if (tokens[cursor].value === "(") depth += 1;
      else if (tokens[cursor].value === ")") depth -= 1;
      else if (tokens[cursor].value === "," && depth === 1) count += 1;
    }
    return count;
  }
  return -1;
}

function c4SourceLockFailures(rawSource) {
  const failures = new Set();
  const normalized = rawSource.replaceAll("\r\n", "\n");
  if (rawSource.includes("\r")
    || Buffer.byteLength(normalized, "utf8") !== C4_EXACT_RUNNER_SIZE
    || normalized.split("\n").length - 1 !== C4_EXACT_RUNNER_LINES
    || createHash("sha256").update(normalized, "utf8").digest("hex") !== C4_EXACT_RUNNER_SHA256) {
    failures.add("runner-identity");
  }
  const beginCount = c3SourceCount(normalized, C4_EXACT_BLOCK_BEGIN);
  const endCount = c3SourceCount(normalized, C4_EXACT_BLOCK_END);
  if (beginCount !== 1 || endCount !== 1) {
    failures.add("c4-block-identity");
    return [...failures];
  }
  const begin = normalized.indexOf(C4_EXACT_BLOCK_BEGIN);
  const end = normalized.indexOf(C4_EXACT_BLOCK_END, begin + C4_EXACT_BLOCK_BEGIN.length);
  const endAfter = end + C4_EXACT_BLOCK_END.length;
  const block = normalized.slice(begin, endAfter);
  const blockThroughEndLf = normalized[endAfter] === "\n" ? normalized.slice(begin, endAfter + 1) : "";
  if (Buffer.byteLength(blockThroughEndLf, "utf8") !== C4_EXACT_BLOCK_SIZE
    || blockThroughEndLf.split("\n").length - 1 !== C4_EXACT_BLOCK_LINES
    || createHash("sha256").update(blockThroughEndLf, "utf8").digest("hex") !== C4_EXACT_BLOCK_SHA256) {
    failures.add("c4-block-identity");
  }

  const tokens = c4TokenizeSource(block);
  if (tokens.length !== C4_EXACT_TOKEN_COUNT
    || c4TokenIdentitySha256(tokens) !== C4_EXACT_TOKEN_SHA256) failures.add("c4-token-identity");
  const headers = c4TopLevelDeclarations(tokens);
  if (JSON.stringify(headers.declarations) !== JSON.stringify(C4_EXPECTED_TOP_LEVEL_DECLARATIONS)) {
    failures.add("declarations");
  }
  if (JSON.stringify(headers.arities) !== JSON.stringify(C4_EXPECTED_TOP_LEVEL_ARITIES)) {
    failures.add("private-signatures");
  }
  const literals = c4LiteralContainerCounts(tokens);
  const tokenValues = tokens.map((token) => token.value);
  const staticStringBindings = c4StaticStringBindings(tokens);
  const computedPropertyNames = c4ComputedPropertyNames(tokens, staticStringBindings);
  let computedDepth = 0;
  let escapedComputedProperty = false;
  for (const token of tokens) {
    if (token.value === "[") computedDepth += 1;
    else if (token.value === "]") computedDepth -= 1;
    else if (computedDepth > 0 && token.type === "string" && token.value.includes("\\")) {
      escapedComputedProperty = true;
    }
  }
  const forbiddenContainers = new Set(["Map", "Set", "WeakMap", "WeakSet"]);
  const allowedObjectMembers = new Set([
    "create", "freeze", "getOwnPropertyDescriptor", "getOwnPropertyNames",
    "getOwnPropertySymbols", "getPrototypeOf", "hasOwn", "prototype", "setPrototypeOf"
  ]);
  let genericConstructorAccess = false;
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index].value === "Object"
      && (tokens[index + 1]?.value !== "." || !allowedObjectMembers.has(tokens[index + 2]?.value))) {
      genericConstructorAccess = true;
    }
    if (tokens[index].value === "Array") {
      const approvedAllocation = tokens[index - 1]?.value === "new";
      const approvedInspection = tokens[index + 1]?.value === "." && tokens[index + 2]?.value === "isArray";
      if (!approvedAllocation && !approvedInspection) genericConstructorAccess = true;
    }
  }
  if (literals.object !== 0 || literals.array !== 0
    || tokenValues.some((value) => forbiddenContainers.has(value))
    || tokenValues.filter((value) => value === "new").length !== 5
    || c4TokenSequenceCount(tokens, ["new", "Array"]) !== 5
    || c4TokenSequenceCount(tokens, ["Object", ".", "create", "(", "null", ")"]) !== 4
    || c4TokenSequenceCount(tokens, ["Buffer", ".", "alloc", "("]) !== 5
    || c4TokenSequenceCount(tokens, ["Buffer", ".", "allocUnsafe", "("]) !== 0
    || tokenValues.includes("...")
    || c4TokenSequenceCount(tokens, ["Array", ".", "from"]) !== 0
    || c4TokenSequenceCount(tokens, ["Object", ".", "fromEntries"]) !== 0
    || c4TokenSequenceCount(tokens, ["Reflect", ".", "construct"]) !== 0
    || genericConstructorAccess) {
    failures.add("container-token");
  }
  const forbiddenDynamic = new Set([
    "eval", "Function", "AsyncFunction", "GeneratorFunction", "globalThis",
    "WebAssembly", "compileFunction", "runInNewContext", "runInThisContext", "import",
    "Proxy", "RegExp", "constructor", "__proto__", "caller", "callee", "callerEvidence",
    "setTimeout", "setInterval", "require", "module", "process", "Reflect"
  ]);
  const dynamicStrings = new Set([
    "\"eval\"", "'eval'", "\"Function\"", "'Function'", "\"constructor\"", "'constructor'",
    "\"__proto__\"", "'__proto__'"
  ]);
  if (tokenValues.some((value) => forbiddenDynamic.has(value))
    || tokenValues.includes("\\")
    || tokenValues.includes("=>")
    || tokenValues.filter((value) => value === "function").length !== headers.arities.length
    || computedPropertyNames.some((name) => ["constructor", "eval", "Function", "caller", "callee", "callerEvidence"].includes(name))
    || [...staticStringBindings.values()].some((name) => [
      "constructor", "eval", "Function", "caller", "callee", "callerEvidence"
    ].includes(name))
    || escapedComputedProperty
    || tokens.some((token) => token.type === "string" && dynamicStrings.has(token.value))) {
    failures.add("dynamic-token");
  }
  const templates = tokens.filter((token) => token.type === "template").map((token) => token.value);
  if (templates.length !== 1
    || templates[0] !== "`restrict,no-pty,no-agent-forwarding,no-port-forwarding,no-X11-forwarding,command=\"/usr/bin/sudo -n -- ${ENTRYPOINT_PATH}\" ssh-ed25519 `") {
    failures.add("dynamic-token");
  }
  const forbiddenWholeRecord = [
    ["JSON", ".", "stringify"], ["JSON", ".", "parse"], ["Buffer", ".", "from"],
    ["TextEncoder"], ["TextDecoder"], ["structuredClone"], ["parseCanonicalAuthorizedKeyLine"],
    [".", "toString", "("], ["?.", "toString", "("], [".", "split", "("],
    ["?.", "split", "("], [".", "filter", "("],
    [".", "map", "("], [".", "reduce", "("], [".", "match", "("],
    [".", "matchAll", "("], [".", "exec", "("], [".", "search", "("],
    [".", "replace", "("], [".", "replaceAll", "("], [".", "test", "("]
  ];
  const forbiddenWholeRecordMembers = new Set([
    "toString", "split", "filter", "map", "reduce", "match", "matchAll",
    "exec", "search", "replace", "replaceAll", "test", "join"
  ]);
  const forbiddenWholeRecordMemberAccess = tokens.some((token, index) => (token.value === "." || token.value === "?.")
    && forbiddenWholeRecordMembers.has(tokens[index + 1]?.value));
  const computedWholeRecordProperty = computedPropertyNames.some((name) => forbiddenWholeRecordMembers.has(name));
  if (forbiddenWholeRecord.some((sequence) => c4TokenSequenceCount(tokens, sequence) !== 0)
    || forbiddenWholeRecordMemberAccess || computedWholeRecordProperty || tokenValues.includes("/")
    || tokenValues.filter((value) => value === "String").length !== 1
    || c4TokenSequenceCount(tokens, ["String", ".", "fromCharCode", "("]) !== 1) {
    failures.add("whole-record-bypass");
  }

  const provenanceCalls = [];
  for (let index = 0; index < tokens.length - 5; index += 1) {
    if (tokens[index].value !== "AUTHORIZATION_SSH_PROVENANCE" || tokens[index + 1].value !== "."
      || !["get", "set", "delete"].includes(tokens[index + 2].value)
      || tokens[index + 3].value !== "(" || tokens[index + 4].type !== "identifier") continue;
    provenanceCalls.push(`${tokens[index + 2].value}/${tokens[index + 4].value}`);
  }
  if (tokenValues.filter((value) => value === "AUTHORIZATION_SSH_PROVENANCE").length !== 8
    || c4TokenSequenceCount(tokens, [
      "AUTHORIZATION_SSH_PROVENANCE", ".", "set", "(", "policy", ",", "active", ")"
    ]) !== 1
    || JSON.stringify(provenanceCalls) !== JSON.stringify([
    "delete/policy", "get/syntax", "set/policy", "get/policy",
    "delete/policy", "get/policy", "delete/policy", "get/policy"
  ])) failures.add("provenance-sites");
  if (tokenValues.includes("reserveAuthorizationSemanticNode")
    || tokenValues.includes("authorizationEntryCount")
    || computedPropertyNames.includes("authorizationEntryCount")
    || computedPropertyNames.includes("authorizationEntry")
    || [...staticStringBindings.values()].includes("authorizationEntryCount")
    || [...staticStringBindings.values()].includes("authorizationEntry")
    || block.includes('"authorizationEntry"')) failures.add("semantic-delta");

  const fixedObject = c3SourceRegion(block, "function authorizationSshC4FixedObject(", "\nfunction authorizationSshC4FixedArray(");
  const fixedArray = c3SourceRegion(block, "function authorizationSshC4FixedArray(", "\nfunction authorizationSshC4AsciiText(");
  const asciiText = c3SourceRegion(block, "function authorizationSshC4AsciiText(", "\nfunction authorizationSshC4WriteAsciiTarget(");
  if (c3SourceCount(block, "String.fromCharCode(") !== 1
    || c3SourceCount(asciiText, "String.fromCharCode(") !== 1
    || c4TokenSequenceCount(tokens, ["authorizationSshC4AsciiText", "("]) !== 3
    || c4TokenSequenceCount(tokens, [
      "authorizationSshC4AsciiText", "(", "event", ".", "valueBytes", ")"
    ]) !== 1
    || c4TokenSequenceCount(tokens, [
      "authorizationSshC4AsciiText", "(", "sourcePattern", ".", "valueBytes", ")"
    ]) !== 1
    || !c4ContainsOrdered(asciiText, [
      "if (!Buffer.isBuffer(bytes)) restricted();",
      "for (let index = 0; index < bytes.length; index += 1)",
      "if (byte < 0x20 || byte > 0x7e) restricted();",
      "value += String.fromCharCode(byte);"
    ])) failures.add("bounded-ascii-conversion");
  if (!c4ContainsOrdered(fixedObject, ["reserveAuthorizationFixedEnvelope(graph);", "return Object.create(null);"])
    || !c4ContainsOrdered(fixedArray, [
      "reserveAuthorizationFixedEnvelope(graph);",
      "return length === undefined ? new Array() : new Array(length);"
    ])) failures.add("fixed-allocation-order");

  const derive = c3SourceRegion(block, "function deriveAuthorizationSshPolicy(", "\nconst AUTHORIZATION_SSH_C4_OPERATION_INPUT_NAMES");
  const verifier = c3SourceRegion(block, "function verifyProjectedSshAuthorization(", "\nfunction authorizationSshC4CloneClosure(");
  const clone = c3SourceRegion(block, "function authorizationSshC4CloneClosure(", "\nfunction authorizationSshC4EffectiveIsSafe(");
  const topology = c3SourceRegion(block, "function authorizationSshC4BuildTopology(", "\nfunction disposeAuthorizationSshPolicy(");
  const patternList = c3SourceRegion(block, "function authorizationSshC4PatternListMatches(", "\nfunction authorizationSshC4CreateValueTable(");
  const firstValue = c3SourceRegion(block, "function authorizationSshC4First(", "\nfunction authorizationSshC4FreezeCoverage(");
  const assignmentSlot = c3SourceRegion(block, "function authorizationSshC4AssignmentSlot(", "\nfunction authorizationSshC4TableAssignment(");
  const adoption = c3SourceRegion(block, "function authorizationSshC4AdoptCanonicalBindingShape(", "\nfunction authorizationSshC4ValidateAncestor(");
  const cleanup = c3SourceRegion(block, "function authorizationSshC4CleanupPolicy(", "\nfunction authorizationSshC4ZeroBuffersTo(");
  const coverageMeasure = c3SourceRegion(block, "function measureAuthorizationSshCoverage(", "\nfunction emitAuthorizationSshCoverage(");
  const coverageEmit = c3SourceRegion(block, "function emitAuthorizationSshCoverage(", "\nfunction authorizationSshC4CleanupPolicy(");
  const topologyMeasure = c3SourceRegion(block, "function measureAuthorizationSshTopology(", "\nfunction emitAuthorizationSshTopology(");
  const topologyEmit = c3SourceRegion(block, "function emitAuthorizationSshTopology(", "\nfunction authorizationSshC4BuildTopology(");
  if (!c4ContainsOrdered(derive, [
    "AUTHORIZATION_SOURCE_GRAPH_BRAND.has(graph)",
    "AUTHORIZATION_SOURCE_SNAPSHOT_BRAND.has(graph.snapshot)",
    "PROJECTED_ACCOUNT_CORE_BRAND.has(accountCore)",
    "NATIVE_ACCOUNT_CORE_BRAND.has(accountCore)",
    "AUTHORIZATION_SSH_PROVENANCE.get(syntax) !== active",
    "checkpoint = active.cleanupStack.length;",
    "allocateAuthorizationBuffer(active, accountCore.username.length)"
  ])) failures.add("brand-before-allocation");
  if (!c4ContainsOrdered(verifier, [
    "if (arguments.length !== 2) restricted();",
    "authorizationSshC4BindingShape(binding);",
    "const canonical = buildCanonicalRunnerBinding(binding);",
    "operations = authorizationSshC4ExactRecord(",
    "authorizationSshC4ValidateAncestor(operations.lstat(\"/\"));"
  ])) failures.add("verifier-canonicalize-first");
  if (c3SourceCount(clone, "authorizationSshC4FixedObject(") !== 1
    || c3SourceCount(clone, "authorizationSshC4FixedArray(") !== 1
    || c3SourceCount(derive, "authorizationSshC4FixedObject(") !== 3
    || c3SourceCount(derive, "authorizationSshC4FixedArray(") !== 2
    || c3SourceCount(derive, "authorizationSshC4CreateValueTable(") !== 2
    || c3SourceCount(topology, "authorizationSshC4FixedObject(") !== 1
    || c3SourceCount(topology, "authorizationSshC4FixedArray(") !== 5
    || JSON.stringify({ include: 5 + 5 + 2, coverage: 5 + 5 + 7, topology: 5 + 5 + 7 + 6 })
      !== JSON.stringify({ include: 12, coverage: 17, topology: 23 })) failures.add("fixed-deltas");
  if (!c4ContainsOrdered(firstValue, [
    "if (matchTable[slot] !== undefined) return matchTable[slot];",
    "if (globalTable[slot] !== undefined) return globalTable[slot];",
    "return fallback;"
  ]) || !assignmentSlot.includes(
    'name === "kbdinteractiveauthentication" || name === "challengeresponseauthentication"'
  ) || !derive.includes("const globalTable = authorizationSshC4CreateValueTable(active);")
    || !derive.includes("const matchTable = authorizationSshC4CreateValueTable(active);")) {
    failures.add("first-value-tables");
  }
  const coverageOrder = [
    '\\"schemaVersion\\"', '\\"type\\"', '\\"username\\"', '\\"groupIds\\"', '\\"branches\\"',
    '\\"ordinal\\"', '\\"sourceOrdinal\\"', '\\"lineNumber\\"', '\\"conditions\\"',
    '\\"name\\"', '\\"patterns\\"', '\\"negated\\"', '\\"value\\"',
    '\\"accountDisposition\\"', '\\"variableDimensions\\"'
  ];
  const topologyOrder = [
    '\\"schemaVersion\\"', '\\"type\\"', '\\"username\\"', '\\"uid\\"', '\\"homeDirectory\\"',
    '\\"loginShell\\"', "AUTHORIZATION_SSH_C4_TOPOLOGY_MIDDLE",
    "AUTHORIZATION_SSH_C4_TOPOLOGY_TAIL", '\\"targetKeyOccurrenceCount\\"',
    '\\"addressDependentAuthorizationBranchCount\\"', '\\"includeClosureSha256\\"',
    '\\"matchCoverageSha256\\"'
  ];
  if (!c4ContainsOrdered(coverageMeasure, coverageOrder)
    || !c4ContainsOrdered(coverageEmit, coverageOrder)
    || !c4ContainsOrdered(topologyMeasure, topologyOrder)
    || !c4ContainsOrdered(topologyEmit, topologyOrder)
    || !block.includes(
      'const AUTHORIZATION_SSH_C4_VALUE_SLOTS = "authenticationMethods pubkeyAuthentication passwordAuthentication keyboardInteractiveAuthentication hostbasedAuthentication gssapiAuthentication kerberosAuthentication permitUserEnvironment forceCommand chrootDirectory disableForwarding permitTunnel authorizedKeysFile authorizedKeysCommand authorizedPrincipalsFile authorizedPrincipalsCommand trustedUserCAKeys";'
    )) failures.add("canonical-field-order");
  if (c3SourceCount(patternList, "matchAuthorizationWildcard(") !== 1
    || !c4ContainsOrdered(patternList, [
      "let positiveMatched = false;",
      "matchAuthorizationWildcard(",
      '"sshMatch"',
      "if (matched && pattern.negated) return false;",
      "return positiveMatched;"
    ]) || patternList.includes("hasPositive")) failures.add("pattern-budget-semantics");
  if (c3SourceCount(adoption, "Object.setPrototypeOf(") !== 5
    || c3SourceCount(adoption, "Object.getPrototypeOf(") !== 5
    || !c4ContainsOrdered(adoption, [
      "Object.setPrototypeOf(canonical, Object.getPrototypeOf(source));",
      "Object.setPrototypeOf(canonical.sshAuthorization, Object.getPrototypeOf(source.sshAuthorization));",
      "Object.setPrototypeOf(canonical.paths, Object.getPrototypeOf(source.paths));",
      "Object.setPrototypeOf(canonical.pathPolicies, Object.getPrototypeOf(source.pathPolicies));",
      "canonical.pathPolicies.authorizedKeys,",
      "Object.getPrototypeOf(source.pathPolicies.authorizedKeys)",
      "return canonical;"
    ])) failures.add("prototype-adoption");
  if (!c4ContainsOrdered(cleanup, [
    "AUTHORIZATION_SSH_PROVENANCE.delete(policy)",
    "policy.coverage = undefined",
    "policy.effective = undefined",
    "policy.disposed = true",
    "if (cleanupFailed) failAuthorizationSourceGraph(graph);"
  ])) failures.add("cleanup-order");
  if (!c4ContainsOrdered(derive, [
    "authorizationSshC4FreezeCoverage(coverage);",
    "const preimageLength = measureAuthorizationSshCoverage(coverage);",
    "reservePreimageBytes(active.snapshot, preimageLength);",
    "preimage = Buffer.alloc(preimageLength);",
    "emitAuthorizationSshCoverage(coverage, preimage)",
    'createHash("sha256").update(preimage).digest("hex")',
    "if (Buffer.isBuffer(preimage)) preimage.fill(0);"
  ]) || !c4ContainsOrdered(topology, [
    "Object.freeze(topology);",
    "const length = measureAuthorizationSshTopology(topology);",
    "reservePreimageBytes(graph.snapshot, length);",
    "preimage = Buffer.alloc(length);",
    "emitAuthorizationSshTopology(topology, preimage)",
    'createHash("sha256").update(preimage).digest("hex")',
    "if (Buffer.isBuffer(preimage)) preimage.fill(0);"
  ])) failures.add("preimage-lifecycle");

  const includePublic = c3SourceRegion(normalized, "export function buildCanonicalSshIncludeClosure(", "\nexport function buildCanonicalSudoSourceClosure(");
  const coveragePublic = c3SourceRegion(normalized, "export function buildCanonicalSshMatchCoverage(", "\nexport function buildCanonicalSshTopology(");
  const topologyPublic = c3SourceRegion(normalized, "export function buildCanonicalSshTopology(", "\nexport function buildCanonicalSudoEffectivePolicy(");
  if (c4FunctionArity(c4TokenizeSource(includePublic), "buildCanonicalSshIncludeClosure") !== 1
    || c4FunctionArity(c4TokenizeSource(coveragePublic), "buildCanonicalSshMatchCoverage") !== 2
    || c4FunctionArity(c4TokenizeSource(topologyPublic), "buildCanonicalSshTopology") !== 3
    || c3SourceCount(normalized, "buildCanonicalSshIncludeClosure") !== 1
    || c3SourceCount(normalized, "buildCanonicalSshMatchCoverage") !== 1
    || c3SourceCount(normalized, "buildCanonicalSshTopology") !== 1) failures.add("public-signatures");
  if (!c4ContainsOrdered(includePublic, [
    "if (arguments.length !== 1) restricted();",
    "const operations = authorizationSshC4OperationInput(input);",
    "const snapshot = createAuthorizationSourceSnapshot();",
    "syntax = deriveAuthorizationSshSyntax(",
    "result = authorizationSshC4CloneClosure(graph, syntax.closure);",
    "authorizationSshC4CompleteProjection(graph, undefined, syntax, failure);"
  ]) || !c4ContainsOrdered(coveragePublic, [
    "arguments.length !== 2 || !PROJECTED_ACCOUNT_CORE_BRAND.has(projectedAccountCore)",
    "const operations = authorizationSshC4OperationInput(input);",
    "const snapshot = createAuthorizationSourceSnapshot();",
    "syntax = deriveAuthorizationSshSyntax(",
    "policy = deriveAuthorizationSshPolicy(graph, syntax, projectedAccountCore);",
    "result = policy.coverage;",
    "authorizationSshC4CompleteProjection(graph, policy, syntax, failure);"
  ]) || !c4ContainsOrdered(topologyPublic, [
    "arguments.length !== 3 || !PROJECTED_ACCOUNT_CORE_BRAND.has(projectedAccountCore)",
    "const operations = authorizationSshC4OperationInput(input);",
    "authorizationSshC4BindingShape(binding);",
    "const canonicalBinding = authorizationSshC4AdoptCanonicalBindingShape(",
    "buildCanonicalRunnerBinding(binding)",
    "const snapshot = createAuthorizationSourceSnapshot();",
    "syntax = deriveAuthorizationSshSyntax(",
    "policy = deriveAuthorizationSshPolicy(graph, syntax, projectedAccountCore);",
    "authorizationSshC4EffectiveIsSafe(policy.effective)",
    "verifyProjectedSshAuthorization(canonicalBinding, operations.pathOperations);",
    "authorizationSshC4BuildTopology(",
    "canonicalBinding",
    "authorizationSshC4CompleteProjection(graph, policy, syntax, failure);"
  ])) failures.add("public-operation-shapes");
  const includePublicTokens = c4TokenizeSource(includePublic);
  const coveragePublicTokens = c4TokenizeSource(coveragePublic);
  const topologyPublicTokens = c4TokenizeSource(topologyPublic);
  if (includePublicTokens.filter((token) => token.value === "input").length !== 2
    || includePublicTokens.filter((token) => token.value === "arguments").length !== 1
    || includePublicTokens.filter((token) => token.value === "operations").length !== 3
    || coveragePublicTokens.filter((token) => token.value === "input").length !== 2
    || coveragePublicTokens.filter((token) => token.value === "arguments").length !== 1
    || coveragePublicTokens.filter((token) => token.value === "operations").length !== 3
    || coveragePublicTokens.filter((token) => token.value === "projectedAccountCore").length !== 3
    || topologyPublicTokens.filter((token) => token.value === "input").length !== 2
    || topologyPublicTokens.filter((token) => token.value === "arguments").length !== 1
    || topologyPublicTokens.filter((token) => token.value === "operations").length !== 4
    || topologyPublicTokens.filter((token) => token.value === "binding").length !== 4
    || topologyPublicTokens.filter((token) => token.value === "projectedAccountCore").length !== 9
    || topologyPublicTokens.filter((token) => token.value === "canonicalBinding").length !== 7) {
    failures.add("public-input-use");
  }
  if (!block.includes(
    'const AUTHORIZATION_SSH_C4_OPERATION_INPUT_NAMES = "pathOperations sourceOperations";'
  ) || !block.includes(
    'const AUTHORIZATION_SSH_C4_PATH_OPERATION_NAMES = "lstat open fstat read close";'
  ) || !block.includes(
    'const AUTHORIZATION_SSH_C4_SOURCE_OPERATION_NAMES = "readDirectory validateSudoers";'
  )) failures.add("operation-key-shapes");

  const nativeGroup = c3SourceRegion(normalized, "function nativeGroupNames(", "\nfunction revalidateNativeAccountTool(");
  if (!nativeGroup.includes(
    "const initial = byte === 0x5f || (byte >= 0x61 && byte <= 0x7a)\n        || (byte >= 0x30 && byte <= 0x39);"
  )) failures.add("numeric-group-alignment");
  return [...failures];
}

function c3AssertExactSourceLock() {
  const { normalized, block, blockThroughEndLf } = c3FormalMarkerBlock();
  assert.doesNotMatch(normalized, /\r/);
  assert.equal(c3SourceCount(normalized, C3_EXACT_BLOCK_BEGIN), 1);
  assert.equal(c3SourceCount(normalized, C3_EXACT_BLOCK_END), 1);
  assert.equal(Buffer.byteLength(blockThroughEndLf, "utf8"), C3_EXACT_BLOCK_SIZE);
  assert.equal(blockThroughEndLf.split("\n").length - 1, C3_EXACT_BLOCK_LINES);
  assert.equal(createHash("sha256").update(blockThroughEndLf, "utf8").digest("hex"), C3_EXACT_BLOCK_SHA256);

  const declarations = [...block.matchAll(/^(const|function) ([A-Za-z_$][A-Za-z0-9_$]*)/gm)]
    .map((match) => `${match[1]} ${match[2]}`)
    .sort();
  const arities = [...block.matchAll(/^function ([A-Za-z_$][A-Za-z0-9_$]*)\(([^)]*)\) \{/gm)]
    .map((match) => `${match[1]}/${match[2].trim() === "" ? 0 : match[2].split(",").length}`)
    .sort();
  assert.deepEqual(declarations, C3_EXPECTED_TOP_LEVEL_ADDITIONS);
  assert.deepEqual(arities, C3_EXPECTED_TOP_LEVEL_ARITIES);

  const nodeUtilImports = normalized.match(
    /^[ \t]*import(?:[ \t\r\n]+[^;]*?[ \t\r\n]+from)?[ \t\r\n]*["']node:util["'][ \t]*;[ \t]*$/gm
  ) || [];
  assert.equal(nodeUtilImports.length, 1);
  assert.equal((normalized.match(/["']node:util["']/g) || []).length, 1);
  assert.equal(c3SourceCount(normalized, 'import { promisify, types } from "node:util";'), 1);
  assert.deepEqual(Object.keys(runnerModule).sort(), C2B_NATIVE_EXPORTS);
  const c2bLock = c2bExactSourceBlock(normalized);
  assert.equal(Buffer.byteLength(c2bLock.block, "utf8"), C2B_EXACT_BLOCK_SIZE);
  assert.equal(createHash("sha256").update(c2bLock.block, "utf8").digest("hex"), C2B_EXACT_BLOCK_SHA256);
  assert.deepEqual(c2bTopLevelHeaders(c2bLock.block), C2B_EXPECTED_TOP_LEVEL_ADDITIONS);

  assert.equal(c3SourceCount(block, "new WeakMap()"), 1);
  assert.equal(c3SourceCount(block, "new Map("), 0);
  assert.equal(c3SourceCount(block, "new Set("), 0);
  assert.equal(c3SourceCount(block, "new WeakSet("), 0);
  assert.equal(c3SourceCount(block, "new Array("), 3);
  assert.equal(c3SourceCount(block, "Object.create(null)"), 3);
  assert.equal(c3SourceCount(block, ".split("), 0);
  assert.equal(c3SourceCount(block, "JSON.stringify("), 0);
  assert.equal(c3SourceCount(block, "JSON.parse("), 0);
  assert.equal(c3SourceCount(block, "AUTHORIZATION_SSH_PROVENANCE.set("), 1);
  assert.equal(c3SourceCount(block, "AUTHORIZATION_SSH_PROVENANCE.delete("), 1);
  assert.equal(c3SourceCount(block, "AUTHORIZATION_SSH_PROVENANCE.has("), 1);
  assert.equal(c3SourceCount(block, "AUTHORIZATION_SSH_PROVENANCE.get("), 2);
  assert.equal(c3SourceCount(block, "AUTHORIZATION_SSH_PROVENANCE.set(snapshot"), 0);
  assert.equal(c3SourceCount(block, "AUTHORIZATION_SSH_PROVENANCE.delete(snapshot"), 0);
  assert.equal(c3SourceCount(block, "const AUTHORIZATION_SSH_PROVENANCE = new WeakMap();"), 1);
  assert.equal(c3SourceCount(block, "AUTHORIZATION_SSH_PROVENANCE.has(snapshot)"), 1);
  assert.equal(c3SourceCount(block, "AUTHORIZATION_SSH_PROVENANCE.get(snapshot)"), 1);
  assert.equal(c3SourceCount(block, "AUTHORIZATION_SSH_PROVENANCE.get(syntax)"), 1);
  assert.equal(c3SourceCount(block, "AUTHORIZATION_SSH_PROVENANCE.set(owner, active)"), 1);
  assert.equal(c3SourceCount(block, "AUTHORIZATION_SSH_PROVENANCE.delete(owner)"), 1);

  const derive = c3SourceRegion(block, "function deriveAuthorizationSshSyntax(", "\nfunction disposeAuthorizationSshSyntax(");
  const selected = c3SourceRegion(derive, "    function consumeSelected(", "\n    function parseInclude(");
  const include = c3SourceRegion(derive, "    function parseInclude(", "\n    function parseMatch(");
  const parseSource = c3SourceRegion(derive, "    function parseSource(", "\n    function consumeSource(");
  const directory = c3SourceRegion(block, "function authorizationSshDirectoryArray(", "\nfunction authorizationSshHeapSort(");
  const reviewedName = c3SourceRegion(block, "function authorizationSshReviewedName(", "\nfunction authorizationSshNameInList(");
  const cleanup = c3SourceRegion(block, "function cleanupAuthorizationSshSyntax(", "\nfunction authorizationSshJsonStringLength(");
  const dispose = c3SourceRegion(block, "function disposeAuthorizationSshSyntax(", `\n${C3_EXACT_BLOCK_END}`);

  assert.equal(c3SourceCount(derive, "reserveAuthorizationFixedEnvelope(active);"), 5);
  c3AssertOrderedSource(derive, [
    "active = requireAuthorizationSourceGraph(graph);",
    "active = requireFreshAuthorizationSshGraph(active);",
    "trustedPathOperations = exactPrivateOperationRecord(pathOperations, AUTHORIZATION_PATH_OPERATION_KEYS);",
    "trustedSourceOperations = exactPrivateOperationRecord(sourceOperations, AUTHORIZATION_SOURCE_OPERATION_KEYS);",
    "reserveAuthorizationFixedEnvelope(active);",
    "owner = Object.create(null);",
    "reserveAuthorizationFixedEnvelope(active);",
    "closure = Object.create(null);",
    "reserveAuthorizationFixedEnvelope(active);",
    "files = new Array();",
    "reserveAuthorizationFixedEnvelope(active);",
    "events = new Array();",
    "reserveAuthorizationFixedEnvelope(active);",
    "activePaths = new Array(AUTHORIZATION_SSH_ROOT_CONFIG);"
  ]);

  c3AssertOrderedSource(directory, [
    "types.isProxy(values)",
    "Array.isArray(values)",
    "values.length",
    "Object.getPrototypeOf(values)",
    "Object.getOwnPropertyDescriptor(values, \"length\")"
  ]);
  c3AssertOrderedSource(parseSource, ["files.push(sourceFile);", "authorizationSshValidateSourceBytes(bytes);"]);
  assert.equal(c3SourceCount(block, "if (currentBranchOrdinal !== -1) restricted();"), 3);
  c3AssertOrderedSource(selected, [
    "if (currentBranchOrdinal !== -1) restricted();",
    'reserveAuthorizationSemanticNode(active, "sshSelectedInsertion");',
    "const childPath = authorizationSshChildPath(parent, basename);",
    '"selectedInsertion"',
    "for (let index = 0; index < activePaths.length; index += 1)",
    "for (let index = 0; index < files.length; index += 1)",
    "activePaths.push(childPath);",
    "consumeSource(childPath);",
    "activePaths.pop()"
  ]);
  assert.equal(c3SourceCount(include, "if (currentBranchOrdinal !== -1) restricted();"), 2);
  c3AssertOrderedSource(include, [
    "function parseInclude(",
    "if (currentBranchOrdinal !== -1) restricted();",
    "for (let argumentOrdinal = 0; argumentOrdinal < operandCount; argumentOrdinal += 1)",
    "if (currentBranchOrdinal !== -1) restricted();",
    "const encodedFinalStart = authorizationSshIncludeFinalStart(",
    "const hasWildcard = encodedFinalStart < 0;",
    "const finalStart = hasWildcard ? -encodedFinalStart - 1 : encodedFinalStart;",
    "const pattern = allocateAuthorizationBuffer(",
    "const starIndex = scanAuthorizationWildcardPattern(active, pattern);",
    "if (!hasWildcard)"
  ]);

  assert.equal(c3SourceCount(reviewedName, "switch (wordStart)"), 3);
  assert.equal(c3SourceCount(reviewedName, ".slice("), 0);
  assert.equal(c3SourceCount(reviewedName, ".substring("), 0);
  assert.equal(c3SourceCount(reviewedName, ".substr("), 0);
  const reviewedLiterals = [...reviewedName.matchAll(/case \d+: return "([a-z0-9]+)";/g)]
    .map((match) => match[1])
    .sort();
  assert.deepEqual(reviewedLiterals, [
    ...C3_AUTHORITY_DIRECTIVES,
    ...C3_OPAQUE_DIRECTIVES,
    ...C3_MATCH_CONDITION_NAMES
  ].sort());
  assert.deepEqual(c3FormalSourceTruth(), {
    namesSubstringCallCount: 0,
    wildcard: {
      signedFinalStart: true,
      singleScalarDecode: true,
      scannerCallCount: 1,
      noPostScannerRescan: true
    }
  });

  c3AssertOrderedSource(cleanup, [
    "AUTHORIZATION_SSH_PROVENANCE.delete(owner)",
    "for (let index = owner.events.length - 1; index >= 0; index -= 1)",
    "authorizationSshZeroEventBuffer(owner.events[index]);",
    "owner.events.length = 0;",
    "owner.closure.files.length = 0;",
    "owner.activePaths.length = 0;",
    "owner.closure = undefined;",
    "owner.disposed = true;",
    "if (cleanupFailed) failAuthorizationSourceGraph(graph);"
  ]);
  c3AssertOrderedSource(derive, [
    "Object.freeze(closure);",
    "const preimageLength = measureAuthorizationSshClosure(closure);",
    "reservePreimageBytes(active.snapshot, preimageLength);",
    "preimage = Buffer.alloc(preimageLength);",
    "emitAuthorizationSshClosure(closure, preimage)",
    'createHash("sha256").update(preimage).digest("hex")',
    "if (Buffer.isBuffer(preimage)) preimage.fill(0);",
    "owner.closureSha256 = closureSha256;",
    "AUTHORIZATION_SSH_PROVENANCE.set(owner, active);",
    "return owner;",
    "cleanupAuthorizationSshSyntax(active, owner, false);",
    "failAuthorizationSourceGraph(active || graph);",
    "restricted();"
  ]);
  c3AssertOrderedSource(dispose, [
    "AUTHORIZATION_SSH_PROVENANCE.get(syntax) !== active",
    "cleanupAuthorizationSshSyntax(active, syntax, true)",
    "failAuthorizationSourceGraph(active || graph);",
    "restricted();"
  ]);
  assert.equal(normalized.includes(`${C3_EXACT_BLOCK_END}\nfunction hasKeys(value, keys) {`), true);
}

function c3AssertFreshGraph(graph, kind) {
  assert.equal(graph.kind, kind);
  assert.equal(graph.failed, false);
  assert.equal(graph.fixedEnvelopeCount, 2);
  assert.equal(graph.semanticNodeCount, 2);
  for (const [name, count] of Object.entries(graph)) {
    if (["kind", "failed", "fixedEnvelopeCount", "semanticNodeCount"].includes(name)) continue;
    assert.equal(count, 0, `${kind}.${name}`);
  }
}

function c3AssertFixture(value) {
  const fixture = value.fixture;
  assert.equal(fixture.scenarioKnown, true);
  assert.equal(fixture.linked, true);
  assert.equal(fixture.evaluated, true);
  assert.equal(fixture.nativeTypes, true);
  assert.deepEqual(fixture.freshState.snapshot, {
    failed: false,
    fixedEnvelopeCount: 5,
    semanticNodeCount: 5,
    authorizationEntryCount: 0,
    wildcardPatternByteCount: 0,
    wildcardInvocationCount: 0,
    wildcardAlignedComparisonCount: 0,
    sshMatchComparisonCount: 0,
    sudoSelectorComparisonCount: 0,
    sudoAliasVisitCount: 0,
    retainedPreimageBytes: 0
  });
  c3AssertFreshGraph(fixture.freshState.ssh, "ssh");
  c3AssertFreshGraph(fixture.freshState.sudo, "sudo");
  assert.deepEqual({
    snapshotSshGraph: fixture.freshState.identity.snapshotSshGraph,
    snapshotSudoGraph: fixture.freshState.identity.snapshotSudoGraph,
    sshSnapshot: fixture.freshState.identity.sshSnapshot,
    sudoSnapshot: fixture.freshState.identity.sudoSnapshot,
    graphsDistinct: fixture.freshState.identity.graphsDistinct,
    cleanupDistinct: fixture.freshState.identity.cleanupDistinct
  }, {
    snapshotSshGraph: true,
    snapshotSudoGraph: true,
    sshSnapshot: true,
    sudoSnapshot: true,
    graphsDistinct: true,
    cleanupDistinct: true
  });
  for (const cleanup of [fixture.freshState.identity.sshCleanup, fixture.freshState.identity.sudoCleanup]) {
    assert.equal(cleanup.isArray, true);
    assert.equal(cleanup.isProxy, false);
    assert.equal(cleanup.prototypeIsNative, true);
    assert.equal(cleanup.prototypeIsProxy, false);
    assert.equal(cleanup.length, 0);
  }
}

function requireC3Symbols(probe) {
  assert.equal(probe.error, null);
  assert.equal(Object.hasOwn(probe, "value"), true);
  c3AssertFixture(probe.value);
  const missing = probe.value.missingSymbols;
  assert.deepEqual(missing.length === 0 ? C3_EXPECTED_MISSING_SYMBOLS : missing, C3_EXPECTED_MISSING_SYMBOLS);
  if (missing.length === 0) {
    assert.deepEqual(probe.value.fixture.c3Arities, {
      reserveAuthorizationFixedEnvelope: 1,
      deriveAuthorizationSshSyntax: 3,
      disposeAuthorizationSshSyntax: 2
    });
  }
  assert.deepEqual(missing, [], `missing C3 private symbols: ${missing.join(",")}`);
  return probe.value.scenarioValue;
}

function requireC4Symbols(probe) {
  assert.equal(probe.error, null);
  assert.equal(Object.hasOwn(probe, "value"), true);
  c3AssertFixture(probe.value);
  assert.deepEqual(probe.value.c3MissingSymbols, []);
  const missing = probe.value.missingSymbols;
  if (missing.length !== 0) {
    assert.deepEqual(probe.value.c4RedGuard, {
      scenarioInvocationCount: 0,
      accountReadCount: 0,
      injectedOperationCount: 0
    });
  }
  assert.deepEqual(missing.length === 0 ? C4_EXPECTED_MISSING_SYMBOLS : missing, C4_EXPECTED_MISSING_SYMBOLS);
  if (missing.length === 0) {
    assert.deepEqual(probe.value.fixture.c4Arities, {
      deriveAuthorizationSshPolicy: 3,
      disposeAuthorizationSshPolicy: 2,
      verifyProjectedSshAuthorization: 2
    });
  }
  assert.deepEqual(missing, [], `missing C4 private symbols: ${missing.join(",")}`);
  return probe.value.scenarioValue;
}

const C4_TOPOLOGY_KEYS = Object.freeze([
  "schemaVersion", "type", "username", "uid", "homeDirectory", "loginShell",
  "passwordLocked", "authenticationMethods", "pubkeyAuthentication",
  "passwordAuthentication", "keyboardInteractiveAuthentication",
  "hostbasedAuthentication", "gssapiAuthentication", "kerberosAuthentication",
  "permitUserEnvironment", "acceptedEnvironmentNames", "forceCommand",
  "chrootDirectory", "disableForwarding", "permitTunnel", "authorizedKeysFiles",
  "authorizedKeysCommand", "authorizedPrincipalsFiles", "authorizedPrincipalsCommand",
  "trustedUserCAKeys", "activeAuthorizationEntryCount", "targetKeyOccurrenceCount",
  "addressDependentAuthorizationBranchCount", "includeClosureSha256", "matchCoverageSha256"
]);

function c4ExpectedTopologyPathOperations(authReadStages = ["body", "eof"]) {
  return [
    ...c3A1FileOperations("body", "eof"),
    ["lstat", "ancestor-0"],
    ["lstat", "ancestor-1"],
    ["lstat", "ancestor-2"],
    ["lstat", "ancestor-3"],
    ["lstat", "file-1"],
    ["open", "file-1", "file"],
    ["fstat", "file-1", "pre"],
    ...authReadStages.map((stage) => ["read", "file-1", stage]),
    ["fstat", "file-1", "post"],
    ["close", "file-1"]
  ];
}

function c4AssertDerivedCallSuccess(call) {
  assert.equal(call.result.ok, true, call.result.error);
  assert.equal(call.trackedBuffersZero, true);
  assert.ok(call.trackedBufferCount > 0);
  assert.equal(call.publicAudit.authorizationEntryCount, 0);
  assert.equal(call.publicAudit.snapshotFailed, false);
  c4AssertInitialPublicState(call.publicAudit);
  const kind = call.publicCalls[0];
  assert.equal(call.publicAudit.budgetLedger.budget.snapshot.fixedEnvelopeCount, {
    include: 12,
    coverage: 17,
    topology: 23
  }[kind], kind);
  const expectedFreezes = kind === "include"
    ? { include: 2, coverage: 0, topology: 0 }
    : kind === "coverage"
      ? { include: 1, coverage: 1, topology: 0 }
      : { include: 1, coverage: 1, topology: 1 };
  c4AssertProjectionFreezeAudit(call.publicAudit, expectedFreezes);
  c4AssertPublicRegistrySuccess(call.registryAudit, kind);
  assert.equal(call.publicAudit.projectionFreezeEvents.filter((entry) =>
    entry.kind === kind && entry.returnedRoot === true).length, 1);
  assert.equal(call.publicAudit.projectionFreezeEvents.filter((entry) =>
    entry.kind !== kind && entry.returnedRoot === true).length, 0);
  if (kind === "include") {
    assert.deepEqual(call.result.value, call.expected);
    assert.deepEqual(call.publicAudit.projectionFreezeEvents.map((entry) => ({
      kind: entry.kind,
      publicStage: entry.publicStage,
      returnedRoot: entry.returnedRoot,
      contentJson: entry.contentJson
    })), [
      {
        kind: "include", publicStage: "deriveSyntax", returnedRoot: false,
        contentJson: JSON.stringify(call.expected)
      },
      {
        kind: "include", publicStage: "deriveSyntax:complete", returnedRoot: true,
        contentJson: JSON.stringify(call.expected)
      }
    ]);
    assert.deepEqual(call.freezeAudit && {
      rootFrozen: call.freezeAudit.rootFrozen,
      allFrozen: call.freezeAudit.allFrozen,
      proxyCount: call.freezeAudit.proxyCount,
      symbolCount: call.freezeAudit.symbolCount,
      accessorCount: call.freezeAudit.accessorCount,
      unexpectedNonEnumerableCount: call.freezeAudit.unexpectedNonEnumerableCount,
      rawShape: call.freezeAudit.rawShape
    }, {
      rootFrozen: true,
      allFrozen: true,
      proxyCount: 0,
      symbolCount: 0,
      accessorCount: 0,
      unexpectedNonEnumerableCount: 0,
      rawShape: c4ExpectedProjectionRawShape(call.expected)
    });
  }
}

function c4AssertDerivedCallFailure(call) {
  assert.equal(call.result.ok, false);
  assert.equal(call.result.error, "restricted_identity_rejected");
  assert.equal(call.trackedBuffersZero, true);
  assert.equal(call.publicAudit.authorizationEntryCount, 0);
  assert.equal(call.publicAudit.snapshotFailed, true);
  c4AssertInitialPublicState(call.publicAudit);
  c4AssertProjectionFreezeAudit(call.publicAudit, call.publicAudit.projectionFreezeCounts);
  assert.equal(call.publicAudit.projectionFreezeEvents.every((entry) => entry.returnedRoot === false), true);
  assert.equal(call.publicAudit.contractErrorEvents.length >= 1, true);
  const boundaryEvent = call.publicAudit.contractErrorEvents.at(-1);
  assert.equal(call.rawErrorAudit.contractErrorOrdinal, boundaryEvent.ordinal);
  assert.deepEqual(call.rawErrorAudit,
    c4ExpectedRestrictedRawErrorAudit(boundaryEvent.ordinal));
  const registryBoundaryCount = boundaryEvent.registryEvents;
  assert.equal(Number.isSafeInteger(registryBoundaryCount) && registryBoundaryCount >= 1, true);
  c4AssertPublicRegistryFailure(call.registryAudit, call.publicCalls[0], registryBoundaryCount);
  if (call.terminalFollowUp !== null) {
    const { beforeLifecycle, afterLifecycle, beforeState, afterState, ...terminalFollowUp } =
      call.terminalFollowUp;
    assert.deepEqual(terminalFollowUp, {
      ok: false,
      error: "restricted_identity_rejected",
      allocations: C2B_ZERO_ALLOCATIONS,
      operationCalls: 0,
      trackedBuffersZero: true
    });
    assert.deepEqual(afterLifecycle, beforeLifecycle);
    assert.deepEqual(afterState, beforeState);
    c4AssertTerminalBudgetState(beforeState, call.publicAudit.initialFixedShape,
      call.publicAudit.budgetLedger, call.publicAudit.preimageReserveTotal);
  }
}

function c4ExpectedPublicTrace(kind) {
  const calls = [kind, "snapshot", "graph:ssh", "graph:sudo", "deriveSyntax"];
  if (kind !== "include") calls.push("derivePolicy");
  if (kind === "topology") calls.push("verify");
  if (kind !== "include") calls.push("disposePolicy");
  calls.push("disposeSyntax");
  return calls;
}

function c4ExpectedRestrictedRawErrorAudit(contractErrorOrdinal = 1) {
  return {
    contractError: true,
    contractErrorOrdinal,
    proxy: false,
    prototypeExact: true,
    contractErrorPrototypeParentExact: true,
    contractErrorPrototypeOwnNames: ["constructor"],
    contractErrorPrototypeOwnSymbolCount: 0,
    contractErrorPrototypeConstructorExact: true,
    contractErrorPrototypeConstructorDescriptor: {
      present: true, data: true, valueExact: true,
      writable: true, enumerable: false, configurable: true
    },
    contractErrorParentOwnNames: ["constructor", "message", "name", "toString"],
    contractErrorParentOwnSymbolCount: 0,
    codeExact: true,
    messageExact: true,
    nameExact: true,
    enumerableOwnKeys: ["code"],
    ownNames: ["code", "message", "stack"],
    ownSymbolCount: 0,
    codeDescriptor: {
      present: true, data: true, valueExact: true,
      writable: true, enumerable: true, configurable: true
    },
    messageDescriptor: {
      present: true, data: true, valueExact: true,
      writable: true, enumerable: false, configurable: true
    },
    stackDescriptor: {
      present: true, data: true, valueExact: true,
      writable: true, enumerable: false, configurable: true
    },
    forbiddenOwnFieldPresent: false,
    syntheticMessageVisible: false,
    syntheticStackVisible: false
  };
}

function c4ExpectedPublicFaultTrace(kind, publicStage) {
  const calls = [kind, "snapshot", "graph:ssh", "graph:sudo", "deriveSyntax"];
  if (kind === "include" || publicStage === "deriveSyntax") return [...calls, "disposeSyntax"];
  calls.push("derivePolicy");
  if (publicStage === "derivePolicy") return [...calls, "disposeSyntax"];
  if (kind === "coverage") return [...calls, "disposePolicy", "disposeSyntax"];
  if (publicStage === "derivePolicy:complete") return [...calls, "disposePolicy", "disposeSyntax"];
  calls.push("verify", "disposePolicy", "disposeSyntax");
  return calls;
}

function c4ExpectedProjectionFreezeKinds(counts) {
  return [
    ...new Array(counts.include).fill("include"),
    ...new Array(counts.coverage).fill("coverage"),
    ...new Array(counts.topology).fill("topology")
  ];
}

function c4ExpectedProjectionRawShape(value) {
  const pending = [{ value, path: "$" }];
  const nodes = [];
  while (pending.length > 0) {
    const entry = pending.pop();
    const current = entry.value;
    if (current === null || typeof current !== "object") continue;
    const ownNames = Object.getOwnPropertyNames(current);
    const descriptors = ownNames.map((name) => {
      const propertyValue = current[name];
      const child = propertyValue !== null && typeof propertyValue === "object";
      const childPath = child ? entry.path + "/" + JSON.stringify(name) : null;
      if (child) pending.push({ value: propertyValue, path: childPath });
      return {
        name,
        data: true,
        valueKind: Array.isArray(propertyValue) ? "Array"
          : propertyValue === null ? "null" : typeof propertyValue === "object" ? "Object"
            : typeof propertyValue,
        writable: false,
        enumerable: !(Array.isArray(current) && name === "length"),
        configurable: false,
        hasGetter: false,
        hasSetter: false,
        childPath
      };
    });
    nodes.push({
      path: entry.path,
      proxy: false,
      prototypeKind: Array.isArray(current) ? "Array" : "null",
      frozen: true,
      extensible: false,
      ownNames,
      ownSymbolCount: 0,
      descriptors
    });
  }
  nodes.sort((left, right) => left.path.localeCompare(right.path));
  return { nodes, repeatedReferences: [] };
}

function c4ExpectedProjectionRootShape(value) {
  const audit = c4ExpectedProjectionRawShape(value);
  return { root: audit.nodes.find((entry) => entry.path === "$") || null };
}

function c4AssertProjectionRawShapeEvent(event) {
  assert.equal(typeof event.contentJson, "string");
  const canonical = JSON.parse(event.contentJson);
  const expected = c4ExpectedProjectionRootShape(canonical);
  assert.deepEqual(event.rawShape, expected, event.kind);
}

function c4AssertInitialPublicState(publicAudit) {
  assert.equal(publicAudit.initialBoundaryCaptureCount, 3);
  assert.deepEqual(publicAudit.initialBoundaryAudits.map((entry) => entry.kind), [
    "snapshot", "ssh", "sudo"
  ]);
  assert.equal(publicAudit.initialShapeCaptureCount, 1);
  assert.notEqual(publicAudit.initialFixedShape, null);
  assert.notEqual(publicAudit.initialBudgetAudit, null);
  assert.notEqual(publicAudit.budgetLedger, null);
  function assertRoot(root, expectedNames, valueKind, writable) {
    assert.deepEqual({
      objectLike: root.objectLike,
      proxy: root.proxy,
      prototypeKind: root.prototypeKind,
      symbolCount: root.symbolCount
    }, { objectLike: true, proxy: false, prototypeKind: "null", symbolCount: 0 });
    assert.deepEqual(root.fields.map((entry) => entry.name), [...expectedNames].sort());
    for (const field of root.fields) {
      assert.deepEqual(field, {
        name: field.name,
        hasValue: true,
        valueKind: valueKind(field.name),
        writable: writable(field.name),
        enumerable: true,
        configurable: false,
        hasGetter: false,
        hasSetter: false
      });
    }
  }
  const snapshotNames = C4_HOST_SNAPSHOT_KEY_NAMES;
  assertRoot(publicAudit.initialFixedShape.snapshot, snapshotNames,
    (name) => name === "failed" ? "boolean" : name === "sshGraph" || name === "sudoGraph" ? "Object" : "number",
    () => true);
  const graphNames = ["snapshot", "kind", ...C4_HOST_GRAPH_NUMERIC_BUDGET_KEYS, "failed", "cleanupStack"];
  for (const kind of ["ssh", "sudo"]) {
    assertRoot(publicAudit.initialFixedShape[kind], graphNames,
      (name) => name === "snapshot" ? "Object"
        : name === "kind" ? "string" : name === "failed" ? "boolean"
          : name === "cleanupStack" ? "Array" : "number",
      (name) => !["snapshot", "kind", "fixedEnvelopeCount"].includes(name));
    const cleanup = publicAudit.initialFixedShape[`${kind}Cleanup`];
    assert.deepEqual(cleanup, {
      objectLike: true,
      proxy: false,
      prototypeKind: "Array",
      symbolCount: 0,
      fields: [{
        name: "length", hasValue: true, valueKind: "number", writable: true,
        enumerable: false, configurable: false, hasGetter: false, hasSetter: false
      }]
    });
  }
  const expectedSnapshot = {};
  for (const key of C4_HOST_SNAPSHOT_NUMERIC_BUDGET_KEYS) expectedSnapshot[key] = 0;
  expectedSnapshot.fixedEnvelopeCount = 5;
  expectedSnapshot.semanticNodeCount = 5;
  expectedSnapshot.failed = false;
  expectedSnapshot.sshGraphIdentity = true;
  expectedSnapshot.sudoGraphIdentity = true;
  function expectedGraph() {
    const value = { kindExact: true, snapshotIdentity: true };
    for (const key of C4_HOST_GRAPH_NUMERIC_BUDGET_KEYS) value[key] = 0;
    value.fixedEnvelopeCount = 2;
    value.semanticNodeCount = 2;
    value.failed = false;
    value.cleanupLength = 0;
    return value;
  }
  assert.deepEqual(publicAudit.initialBudgetAudit, {
    snapshot: expectedSnapshot,
    ssh: expectedGraph(),
    sudo: expectedGraph()
  });
  function expectedBoundarySnapshot(fixedEnvelopeCount, semanticNodeCount, sshPresent, sudoPresent) {
    const value = {};
    for (const key of C4_HOST_SNAPSHOT_NUMERIC_BUDGET_KEYS) value[key] = 0;
    value.fixedEnvelopeCount = fixedEnvelopeCount;
    value.semanticNodeCount = semanticNodeCount;
    value.failed = false;
    value.sshGraphAbsent = !sshPresent;
    value.sudoGraphAbsent = !sudoPresent;
    value.sshGraphIdentity = sshPresent;
    value.sudoGraphIdentity = sudoPresent;
    return value;
  }
  assert.deepEqual(publicAudit.initialBoundaryAudits.map((entry) => entry.budget), [
    {
      snapshot: expectedBoundarySnapshot(1, 1, false, false),
      ssh: null,
      sudo: null
    },
    {
      snapshot: expectedBoundarySnapshot(3, 3, true, false),
      ssh: expectedGraph(),
      sudo: null
    },
    {
      snapshot: expectedBoundarySnapshot(5, 5, true, true),
      ssh: expectedGraph(),
      sudo: expectedGraph()
    }
  ]);
  const absentShape = {
    objectLike: false, proxy: false, prototypeKind: null, symbolCount: null, fields: []
  };
  assert.deepEqual(publicAudit.initialBoundaryAudits[0].fixedShape.ssh, absentShape);
  assert.deepEqual(publicAudit.initialBoundaryAudits[0].fixedShape.sudo, absentShape);
  assert.deepEqual(publicAudit.initialBoundaryAudits[1].fixedShape.sudo, absentShape);
  assert.deepEqual(publicAudit.initialBoundaryAudits[2].fixedShape, publicAudit.initialFixedShape);
  for (let index = 0; index < publicAudit.initialBoundaryAudits.length; index += 1) {
    const boundary = publicAudit.initialBoundaryAudits[index];
    assertRoot(boundary.fixedShape.snapshot, snapshotNames,
      (name) => name === "failed" ? "boolean"
        : name === "sshGraph" ? index === 0 ? "undefined" : "Object"
          : name === "sudoGraph" ? index < 2 ? "undefined" : "Object" : "number",
      () => true);
  }
  assertRoot(publicAudit.initialBoundaryAudits[1].fixedShape.ssh, graphNames,
    (name) => name === "snapshot" ? "Object"
      : name === "kind" ? "string" : name === "failed" ? "boolean"
        : name === "cleanupStack" ? "Array" : "number",
    (name) => !["snapshot", "kind", "fixedEnvelopeCount"].includes(name));
}

function c4AssertProjectionFreezeAudit(publicAudit, expectedCounts) {
  assert.deepEqual(publicAudit.projectionFreezeCounts, expectedCounts);
  const expectedKinds = c4ExpectedProjectionFreezeKinds(expectedCounts);
  assert.deepEqual(publicAudit.projectionFreezeEvents.map((entry) => entry.kind), expectedKinds);
  assert.deepEqual(publicAudit.projectionFreezeEvents.map((entry) => entry.ordinal),
    expectedKinds.map((_, index) => index + 1));
  let includeOrdinal = 0;
  assert.deepEqual(publicAudit.projectionFreezeEvents.map((entry) => {
    if (entry.kind === "include") {
      includeOrdinal += 1;
      return includeOrdinal === 1 ? "deriveSyntax" : "deriveSyntax:complete";
    }
    return entry.kind === "coverage" ? "derivePolicy" : "verify:complete";
  }), publicAudit.projectionFreezeEvents.map((entry) => entry.publicStage));
  assert.equal(publicAudit.projectionFreezeEvents.every((entry) =>
    Number.isSafeInteger(entry.registryEvents) && entry.registryEvents >= 0
      && Number.isSafeInteger(entry.action) && entry.action >= 0
      && Number.isSafeInteger(entry.forwardWork) && entry.forwardWork > 0
      && entry.rootProxy === false && entry.rootSymbolCount === 0
      && entry.typeDescriptorExact === true && typeof entry.returnedRoot === "boolean"
      && entry.frozenAfter === true), true);
  for (const event of publicAudit.projectionFreezeEvents) c4AssertProjectionRawShapeEvent(event);
}

function c4ExpectedPublicRegistrySequence(kind) {
  const sequence = [
    ["has", "snapshot"],
    ["set", "syntax"]
  ];
  if (kind !== "include") sequence.push(["get", "syntax"], ["set", "policy"]);
  if (kind !== "include") sequence.push(["get", "policy"], ["delete", "policy"]);
  sequence.push(["get", "syntax"], ["delete", "syntax"]);
  return sequence;
}

function c4RegistryCore(events) {
  return events.map((entry) => [entry.method, entry.keyIdentity]);
}

function c4ExpectedPostFaultRegistryCleanup(allEvents, boundaryCount) {
  const live = { syntax: false, policy: false };
  for (const event of allEvents.slice(0, boundaryCount)) {
    if (event.keyIdentity !== "syntax" && event.keyIdentity !== "policy") continue;
    if (event.method === "set") live[event.keyIdentity] = true;
    if (event.method === "delete") live[event.keyIdentity] = false;
  }
  const expected = [];
  for (const identity of ["policy", "syntax"]) {
    if (live[identity]) expected.push(["get", identity], ["delete", identity]);
  }
  return expected;
}

function c4AssertRegistryEventPolicy(events) {
  assert.equal(events.length >= 1, true);
  assert.deepEqual(c4RegistryCore(events.slice(0, 1)), [["has", "snapshot"]]);
  assert.equal(events[0].provenanceRegistry, true);
  assert.equal(events[0].sameGraph, false);
  assert.equal(events.filter((entry) => entry.keyIdentity === "snapshot").length, 1);
  assert.equal(events.some((entry) => entry.keyIdentity === "snapshot" && entry.method !== "has"), false);
  assert.equal(events.every((entry) => ["has", "get", "set", "delete"].includes(entry.method)), true);
  assert.equal(events.slice(1).every((entry) => entry.provenanceRegistry === true
    && entry.sameGraph === true), true);
}

function c4AssertPublicRegistrySuccess(audit, kind) {
  c4AssertRegistryEventPolicy(audit.allEvents);
  assert.deepEqual(c4RegistryCore(audit.allEvents), c4ExpectedPublicRegistrySequence(kind));
  assert.deepEqual(audit.snapshotEvents, [audit.allEvents[0]]);
  assert.deepEqual(audit.unknownEvents, []);
  assert.deepEqual(audit.foreignRegistryEvents, []);
}

function c4AssertPublicRegistryFailure(audit, kind, boundaryCount, postFaultEvents = null, label = kind) {
  c4AssertRegistryEventPolicy(audit.allEvents);
  const prefix = audit.allEvents.slice(0, boundaryCount);
  assert.deepEqual(c4RegistryCore(prefix),
    c4ExpectedPublicRegistrySequence(kind).slice(0, prefix.length),
    `${label}:${JSON.stringify(prefix.map((entry) => ({
      method: entry.method,
      keyIdentity: entry.keyIdentity,
      keyShape: entry.keyShape,
      provenanceRegistry: entry.provenanceRegistry,
      sameGraph: entry.sameGraph
    })))}`);
  const expectedCleanup = c4ExpectedPostFaultRegistryCleanup(audit.allEvents, boundaryCount);
  const actualCleanup = audit.allEvents.slice(boundaryCount);
  assert.deepEqual(c4RegistryCore(actualCleanup), expectedCleanup);
  if (postFaultEvents !== null) assert.deepEqual(c4RegistryCore(postFaultEvents), expectedCleanup);
  assert.deepEqual(audit.snapshotEvents, [audit.allEvents[0]]);
  assert.deepEqual(audit.unknownEvents, []);
  assert.deepEqual(audit.foreignRegistryEvents, []);
}

function c4AssertTerminalBudgetState(state, initialFixedShape, independentLedger, preimageReserveTotal) {
  assert.notEqual(state, null);
  assert.notEqual(independentLedger, null);
  assert.deepEqual(state.fixedShape, initialFixedShape);
  const expectedCleanup = {
    isArray: true,
    isProxy: false,
    prototypeIsNative: true,
    prototypeIsProxy: false,
    length: 0,
    ownNames: ["length"],
    symbolCount: 0,
    lengthDescriptor: {
      value: 0, writable: true, enumerable: false, configurable: false,
      hasGetter: false, hasSetter: false
    }
  };
  assert.equal(independentLedger.signalCount,
    Object.values(independentLedger.signals).reduce((total, count) => total + count, 0));
  assert.equal(independentLedger.budget.snapshot.retainedPreimageBytes, preimageReserveTotal);
  const expectedBudget = JSON.parse(JSON.stringify(independentLedger.budget));
  expectedBudget.snapshot.failed = true;
  expectedBudget.snapshot.authorizationEntryCount = 0;
  expectedBudget.ssh.failed = true;
  expectedBudget.sudo.failed = false;
  expectedBudget.ssh.depth = 0;
  expectedBudget.sudo.depth = 0;
  expectedBudget.identity.sshCleanup = expectedCleanup;
  expectedBudget.identity.sudoCleanup = expectedCleanup;
  assert.deepEqual(state.budget, expectedBudget);
  assert.equal(state.budget.snapshot.retainedPreimageBytes, preimageReserveTotal);
}

function c4AssertVerifyAllocationAudit(audit, { requireByteAllocation = false } = {}) {
  assert.deepEqual(Object.keys(audit), [
    "allocationCount", "allocationKinds", "allocationOrdinals", "byteAllocationCount",
    "byteAllocationKinds", "byteAllocationOrdinals", "byteAllocationRequestedLengths",
    "byteAllocationActualLengths", "byteAllocationOperationCalls", "fixedReserveCount",
    "fixedAllocationCount", "preimageReserveCount", "preimageAllocationCount",
    "containerAllocationCount", "containerAllocationKinds"
  ]);
  assert.equal(Number.isSafeInteger(audit.allocationCount), true);
  assert.equal(Number.isSafeInteger(audit.byteAllocationCount), true);
  assert.equal(audit.allocationCount, audit.byteAllocationCount);
  assert.equal(Object.values(audit.allocationKinds)
    .reduce((total, count) => total + count, 0), audit.allocationCount);
  const allocationKindKeys = Object.keys(audit.allocationKinds).sort();
  assert.equal(allocationKindKeys.every((kind) =>
    kind === "bufferAlloc" || kind === "bufferFrom" || kind === "bufferHashDigest"), true);
  assert.deepEqual(allocationKindKeys, [...new Set(audit.byteAllocationKinds)].sort());
  for (const kind of allocationKindKeys) {
    assert.equal(audit.allocationKinds[kind],
      audit.byteAllocationKinds.filter((entry) => entry === kind).length);
  }
  assert.equal(audit.allocationOrdinals.length, audit.allocationCount);
  assert.equal(audit.byteAllocationKinds.length, audit.byteAllocationCount);
  assert.equal(audit.byteAllocationOrdinals.length, audit.byteAllocationCount);
  assert.equal(audit.byteAllocationRequestedLengths.length, audit.byteAllocationCount);
  assert.equal(audit.byteAllocationActualLengths.length, audit.byteAllocationCount);
  assert.equal(audit.byteAllocationOperationCalls.length, audit.byteAllocationCount);
  assert.equal(audit.allocationOrdinals.every((ordinal, index) =>
    Number.isSafeInteger(ordinal) && ordinal > 0
      && (index === 0 || ordinal > audit.allocationOrdinals[index - 1])), true);
  assert.equal(audit.byteAllocationOrdinals.every((ordinal, index) =>
    Number.isSafeInteger(ordinal) && audit.allocationOrdinals.includes(ordinal)
      && (index === 0 || ordinal > audit.byteAllocationOrdinals[index - 1])), true);
  assert.equal(audit.byteAllocationRequestedLengths.every((length, index) =>
    audit.byteAllocationKinds[index] === "bufferFrom"
      ? length === null
      : Number.isSafeInteger(length)
        && (audit.byteAllocationKinds[index] === "bufferHashDigest"
          ? length === 32
          : audit.byteAllocationKinds[index] === "bufferAlloc" && length >= 0 && length <= 16385)), true);
  assert.equal(audit.byteAllocationActualLengths.every((length) =>
    length === null || (Number.isSafeInteger(length) && length >= 0 && length <= 16385)), true);
  assert.equal(audit.byteAllocationOperationCalls.every((count) =>
    Number.isSafeInteger(count) && count >= 0), true);
  assert.deepEqual({
    fixedReserveCount: audit.fixedReserveCount,
    fixedAllocationCount: audit.fixedAllocationCount,
    preimageReserveCount: audit.preimageReserveCount,
    preimageAllocationCount: audit.preimageAllocationCount,
    containerAllocationCount: audit.containerAllocationCount,
    containerAllocationKinds: audit.containerAllocationKinds
  }, {
    fixedReserveCount: 0,
    fixedAllocationCount: 0,
    preimageReserveCount: 0,
    preimageAllocationCount: 0,
    containerAllocationCount: 0,
    containerAllocationKinds: []
  });
  if (requireByteAllocation) {
    assert.equal(audit.allocationCount, 27);
    assert.equal(audit.byteAllocationCount, 27);
    assert.deepEqual(audit.allocationKinds, {
      bufferFrom: 22,
      bufferAlloc: 3,
      bufferHashDigest: 2
    });
    assert.deepEqual(audit.byteAllocationKinds, [
      ...new Array(22).fill("bufferFrom"),
      "bufferAlloc", "bufferAlloc", "bufferAlloc",
      "bufferHashDigest", "bufferHashDigest"
    ]);
    assert.deepEqual(audit.byteAllocationRequestedLengths, [
      ...new Array(22).fill(null),
      257, 1, 51, 32, 32
    ]);
    assert.deepEqual(audit.byteAllocationActualLengths, [
      ...C4_HOST_VERIFIER_CANONICAL_PATH_BYTE_LENGTHS,
      ...C4_HOST_VERIFIER_CANONICAL_PATH_BYTE_LENGTHS,
      257, 1, 51, 32, 32
    ]);
    assert.deepEqual(audit.byteAllocationOperationCalls.slice(0, 22),
      new Array(22).fill(c3A1FileOperations("body", "eof").length));
  }
}

function c4ExpectedVerifierCanonicalPathStringSpans(attempts) {
  assert.equal(Number.isSafeInteger(attempts) && attempts >= 0 && attempts <= 1, true);
  const spans = [];
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    for (let pass = 0; pass < 2; pass += 1) {
      for (const length of C4_HOST_VERIFIER_CANONICAL_PATH_BYTE_LENGTHS) {
        const span = {
          sourceLength: length,
          start: 0,
          end: length,
          spanLength: length,
          operationCalls: c3A1FileOperations("body", "eof").length
        };
        spans.push(
          { ...span, encoding: "utf8" },
          { ...span, encoding: "hex" }
        );
      }
    }
  }
  return spans;
}

function c4AssertVerifierCanonicalPathStringAudit(count, spans, attempts) {
  const expected = c4ExpectedVerifierCanonicalPathStringSpans(attempts);
  assert.equal(count, expected.length);
  assert.deepEqual(spans, expected);
}

function c4AssertPublicTerminalFailure(witness, kind, {
  expectedTopologyFreezeCount = 0,
  expectedAuthorizationOpenCount = null,
  expectedOperationCalls = null,
  expectedPostFaultOperationCalls = [],
  expectedRawErrorEvent = "terminal",
  label = kind
} = {}) {
  assert.deepEqual(witness.result, { ok: false, error: "restricted_identity_rejected" });
  assert.equal(witness.faultTriggered, true);
  assert.equal(witness.faultTriggerCount, 1);
  assert.equal(witness.trackedBuffersZero, true);
  assert.equal(witness.buffersZero, true);
  assert.equal(witness.preimagePendingCount, 0);
  assert.ok(witness.preimages.every((entry) => entry.zero === true));
  assert.deepEqual(witness.finalState, {
    graphFailed: true,
    snapshotFailed: true,
    authorizationEntryCount: 0
  });
  assert.equal(witness.publicAudit.authorizationEntryCount, 0);
  assert.equal(witness.publicAudit.snapshotFailed, true);
  assert.equal(witness.publicAudit.topologyFreezeCount, expectedTopologyFreezeCount);
  c4AssertVerifyAllocationAudit(witness.verifyAllocationAudit);
  c4AssertInitialPublicState(witness.publicAudit);
  assert.equal(witness.publicAudit.projectionFreezeEvents.every((entry) => entry.returnedRoot === false), true);
  assert.ok(witness.publicAudit.contractErrorEvents.length >= 1);
  assert.deepEqual(witness.publicAudit.contractErrorEvents.map((entry) => entry.ordinal),
    witness.publicAudit.contractErrorEvents.map((_, index) => index + 1));
  assert.equal(witness.publicAudit.contractErrorEvents.every((entry) => entry.codeExact === true), true);
  assert.notEqual(witness.faultStamp, null);
  assert.equal(witness.publicAudit.projectionFreezeEvents.length,
    witness.faultStamp.projectionFreezes);
  const terminalEvent = witness.publicAudit.contractErrorEvents.at(-1);
  assert.ok(terminalEvent.action >= witness.faultStamp.action, label);
  const rawErrorEvent = expectedRawErrorEvent === "primary"
    ? witness.publicAudit.contractErrorEvents[0]
    : terminalEvent;
  assert.equal(witness.rawErrorAudit.contractErrorOrdinal, rawErrorEvent.ordinal, label);
  assert.deepEqual(witness.rawErrorAudit,
    c4ExpectedRestrictedRawErrorAudit(witness.rawErrorAudit.contractErrorOrdinal));
  assert.notEqual(witness.postFaultAudit, null);
  for (const field of [
    "allocations", "hashes", "copies", "pushes", "fixedReserves", "semanticReserves",
    "preimageReserves", "workAttempts", "matcherAttempts", "forwardWork", "projectionFreezes",
    "nonzeroFillCount"
  ]) assert.equal(witness.postFaultAudit[field], 0, field);
  assert.deepEqual(witness.postFaultAudit.operationCalls, expectedPostFaultOperationCalls, label);
  assert.equal(witness.postFaultAudit.nonCloseOperationCount,
    expectedPostFaultOperationCalls.filter((entry) => entry[0] !== "close").length);
  assert.equal(witness.postFaultAudit.operationCalls.filter((entry) => entry[0] === "close").length,
    expectedPostFaultOperationCalls.filter((entry) => entry[0] === "close").length);
  c4AssertPublicRegistryFailure(witness.registryAudit, kind,
    witness.faultStamp.registryEvents, witness.postFaultAudit.registryEvents, label);
  assert.equal(witness.provenance.registryObserved, true);
  assert.equal(witness.provenance.registryStable, true);
  assert.deepEqual(witness.provenance.syntax, { present: false, sameGraph: false });
  assert.deepEqual(witness.provenance.policy, { present: false, sameGraph: false });
  assert.deepEqual(witness.provenance.snapshot, { present: false, sameGraph: false });
  assert.equal(witness.publicCalls[0], kind);
  for (const name of ["snapshot", "graph:ssh", "graph:sudo", "deriveSyntax"]) {
    assert.equal(witness.publicCalls.filter((entry) => entry === name).length, 1, name);
  }
  assert.equal(witness.operationAudit.rootOpenCount, 1);
  assert.equal(witness.operationAudit.readDirectoryCount, 0);
  assert.equal(witness.operationAudit.validateSudoersCount, 0);
  if (expectedAuthorizationOpenCount !== null) {
    assert.equal(witness.operationAudit.authorizationOpenCount, expectedAuthorizationOpenCount);
  }
  if (expectedOperationCalls !== null) {
    assert.deepEqual(witness.operationAudit.calls, expectedOperationCalls);
  }
  assert.equal(witness.fdAudit.liveDescriptorCount, 0);
  assert.deepEqual(witness.fdAudit.closeAttempts, witness.fdAudit.successfulOpens);
  const { beforeLifecycle, afterLifecycle, beforeState, afterState, ...terminalFollowUp } = witness.terminalFollowUp;
  assert.deepEqual(terminalFollowUp, {
    ok: false,
    error: "restricted_identity_rejected",
    allocations: C2B_ZERO_ALLOCATIONS,
    operationCalls: 0,
    trackedBuffersZero: true
  });
  assert.deepEqual(afterLifecycle, beforeLifecycle);
  assert.deepEqual(afterState, beforeState);
  c4AssertTerminalBudgetState(beforeState, witness.publicAudit.initialFixedShape,
    witness.publicAudit.budgetLedger, witness.publicAudit.preimageReserveTotal);
}

function c4AssertSingleSshTraversal(call) {
  assert.deepEqual(call.calls.filter(([name]) => name === "open").map(([, role]) => role), ["file-0"]);
  assert.deepEqual(call.calls.filter(([name]) => name === "close").map(([, role]) => role), ["file-0"]);
  assert.equal(call.calls.filter(([name]) => name === "readDirectory").length, 0);
  assert.equal(call.calls.filter(([name]) => name === "validateSudoers").length, 0);
  assert.deepEqual(call.fdAudit, {
    successfulOpens: [["file-0", 1]],
    closeAttempts: [["file-0", 1]],
    liveDescriptorCount: 0
  });
}

function c4AssertCoverageFreezeAudit(call) {
  const audit = call.freezeAudit;
  assert.notEqual(audit, null);
  assert.equal(audit.rootFrozen, true);
  assert.deepEqual(audit.rootKeys, ["schemaVersion", "type", "username", "groupIds", "branches"]);
  assert.equal(audit.groupIdsFrozen, true);
  assert.equal(audit.branchesFrozen, true);
  assert.equal(audit.branches.length, call.result.value.branches.length);
  const { rawShape, ...recursive } = audit.recursive;
  assert.deepEqual(recursive, {
    rootFrozen: true,
    allFrozen: true,
    containerCount: recursive.containerCount,
    proxyCount: 0,
    symbolCount: 0,
    accessorCount: 0,
    unexpectedNonEnumerableCount: 0
  });
  assert.deepEqual(rawShape, c4ExpectedProjectionRawShape(call.result.value));
  for (const branch of audit.branches) {
    assert.equal(branch.frozen, true);
    assert.deepEqual(branch.keys, [
      "ordinal", "sourceOrdinal", "lineNumber", "conditions", "accountDisposition", "variableDimensions"
    ]);
    assert.equal(branch.conditionsFrozen, true);
    assert.equal(branch.variableDimensionsFrozen, true);
    for (const condition of branch.conditions) {
      assert.equal(condition.frozen, true);
      assert.deepEqual(condition.keys, ["name", "patterns"]);
      assert.equal(condition.patternsFrozen, true);
      for (const pattern of condition.patterns) {
        assert.equal(pattern.frozen, true);
        assert.deepEqual(pattern.keys, ["negated", "value"]);
      }
    }
  }
}

function c4AssertTopologySuccess(probe, { strictReads = true, expectedAuthReadStages = null } = {}) {
  c4AssertDerivedCallSuccess(probe.topology);
  assert.deepEqual(probe.topology.publicCalls, [
    "topology", "snapshot", "graph:ssh", "graph:sudo", "deriveSyntax", "derivePolicy",
    "verify", "disposePolicy", "disposeSyntax"
  ]);
  c4AssertVerifyAllocationAudit(probe.topology.verifyAllocationAudit, {
    requireByteAllocation: true
  });
  c4AssertProjectionFreezeAudit(probe.topology.publicAudit, { include: 1, coverage: 1, topology: 1 });
  const {
    authorizationHashInputs, projectionFreezeCounts, projectionFreezeEvents, contractErrorEvents,
    verifierBufferToStringCount, verifierBufferToStringSpans,
    initialBoundaryCaptureCount, initialBoundaryAudits,
    initialShapeCaptureCount, initialFixedShape, initialBudgetAudit, budgetLedger,
    preimageReserveLengths, preimageReserveTotal, ...publicAudit
  } =
    probe.topology.publicAudit;
  assert.deepEqual(projectionFreezeCounts, { include: 1, coverage: 1, topology: 1 });
  assert.ok(projectionFreezeEvents.length > 0);
  assert.deepEqual(contractErrorEvents, []);
  assert.equal(initialShapeCaptureCount, 1);
  assert.equal(initialBoundaryCaptureCount, 3);
  assert.equal(initialBoundaryAudits.length, 3);
  assert.notEqual(initialFixedShape, null);
  assert.notEqual(initialBudgetAudit, null);
  assert.notEqual(budgetLedger, null);
  c4AssertVerifierCanonicalPathStringAudit(
    verifierBufferToStringCount,
    verifierBufferToStringSpans,
    1
  );
  assert.deepEqual(preimageReserveTotal,
    preimageReserveLengths.reduce((total, length) => total + length, 0));
  assert.deepEqual(publicAudit, {
    legacyLineParserCallCount: 0,
    wholeRecordBufferToStringCount: 0,
    wholeRecordTextDecoderCount: 0,
    verifierTextDecoderConstructionCount: 0,
    verifierTextDecoderDecodeCount: 0,
    verifierTextDecoderInputLengths: [],
    topologyFreezeCount: 1,
    verifyAttempts: 1,
    verifySuccesses: 1,
    verifyFailures: 0,
    verifyUndefinedReturns: 1,
    verifyNonUndefinedReturns: 0,
    authorizationEntryCount: 0,
    snapshotFailed: false
  });
  assert.ok(authorizationHashInputs.every((entry) => entry.updateCount >= 1));
  assert.deepEqual(authorizationHashInputs.map(({ algorithm, totalLength, inputSha256 }) => ({
    algorithm,
    totalLength,
    inputSha256
  })).sort((left, right) => left.totalLength - right.totalLength), [
    {
      algorithm: "sha256",
      totalLength: probe.authorizationHashOracle.blob.length,
      inputSha256: probe.authorizationHashOracle.blob.sha256
    },
    {
      algorithm: "sha256",
      totalLength: probe.authorizationHashOracle.line.length,
      inputSha256: probe.authorizationHashOracle.line.sha256
    }
  ].sort((left, right) => left.totalLength - right.totalLength));
  assert.equal(authorizationHashInputs.some((entry) =>
    entry.totalLength === probe.authorizationHashOracle.legacyWholeFile.length
      && entry.inputSha256 === probe.authorizationHashOracle.legacyWholeFile.sha256), false);
  assert.equal(probe.topology.terminalFollowUp, null);
  assert.deepEqual(probe.topology.result.value, probe.expected);
  const { rawShape: topologyRawShape, ...topologyFreezeAudit } = probe.freezeAudit;
  assert.deepEqual(topologyFreezeAudit, {
    rootFrozen: true,
    allFrozen: true,
    containerCount: 6,
    proxyCount: 0,
    symbolCount: 0,
    accessorCount: 0,
    unexpectedNonEnumerableCount: 0
  });
  assert.deepEqual(topologyRawShape, c4ExpectedProjectionRawShape(probe.expected));
  assert.deepEqual(Object.keys(probe.topology.result.value), C4_TOPOLOGY_KEYS);
  assert.equal(probe.topology.result.value.activeAuthorizationEntryCount, 1);
  assert.equal(probe.topology.result.value.targetKeyOccurrenceCount, 1);
  assert.equal(probe.topology.result.value.addressDependentAuthorizationBranchCount, 0);
  assert.equal(probe.bindingDigests.effective,
    createHash("sha256").update(`${JSON.stringify(probe.expected)}\n`).digest("hex"));
  assert.deepEqual(probe.accountReads, ["gccgw-japan-repair-ci", "gccgw-japan-repair-ci"]);
  assert.deepEqual(probe.calls.filter(([name]) => name === "open").map(([, role]) => role), ["file-0", "file-1"]);
  assert.deepEqual(probe.calls.filter(([name]) => name === "close").map(([, role]) => role), ["file-0", "file-1"]);
  const reads = probe.calls.filter(([name]) => name === "read").map(([, role, stage]) => [role, stage]);
  if (strictReads) {
    assert.deepEqual(probe.calls, c4ExpectedTopologyPathOperations());
  } else if (expectedAuthReadStages !== null) {
    assert.deepEqual(probe.calls, c4ExpectedTopologyPathOperations(expectedAuthReadStages));
  } else {
    assert.deepEqual(reads.filter(([role, stage]) => role === "file-0" && ["body", "eof"].includes(stage)), [
      ["file-0", "body"], ["file-0", "eof"]
    ]);
    assert.ok(reads.some(([role, stage]) => role === "file-1" && stage.startsWith("body")));
    assert.ok(reads.some(([role, stage]) => role === "file-1" && stage.startsWith("eof")));
  }
  assert.equal(probe.calls.filter(([name]) => name === "readDirectory").length, 0);
  assert.equal(probe.calls.filter(([name]) => name === "validateSudoers").length, 0);
  assert.deepEqual(probe.fdAudit, {
    successfulOpens: [["file-0", 1], ["file-1", 1]],
    closeAttempts: [["file-0", 1], ["file-1", 1]],
    liveDescriptorCount: 0
  });
  assert.deepEqual(probe.verificationScopes.filter(([operation, role, active]) =>
    role === "file-1" && ["lstat", "open", "fstat", "read", "close"].includes(operation) && active !== true), []);
}

function c4AssertTopologyFailure(probe, failureAudit, label = failureAudit.stage) {
  assert.ok([
    "source-syntax",
    "source-effective",
    "authorization-grammar-or-digest",
    "authorization-metadata",
    "authorization-ancestor",
    "authorization-operation",
    "binding-authorization-digest",
    "binding-effective-digest"
  ].includes(failureAudit.stage), failureAudit.stage);
  const expectedTopologyFreezeCount = failureAudit.stage === "binding-effective-digest" ? 1 : 0;
  assert.notEqual(probe.topology, null, "C4 topology fixture must exercise the standalone topology failure path");
  c4AssertInitialPublicState(probe.topology.publicAudit);
  assert.equal(probe.topology.result.ok, false);
  assert.equal(probe.topology.result.error, "restricted_identity_rejected");
  assert.equal(Object.hasOwn(probe.topology.result, "value"), false);
  assert.equal(Number.isSafeInteger(probe.topology.rawErrorAudit.contractErrorOrdinal), true);
  assert.deepEqual(probe.topology.rawErrorAudit,
    c4ExpectedRestrictedRawErrorAudit(probe.topology.publicAudit.contractErrorEvents.at(-1).ordinal));
  assert.equal(probe.freezeAudit, null);
  assert.equal(probe.topology.trackedBuffersZero, true);
  assert.deepEqual(probe.topology.publicCalls, failureAudit.publicCalls, label);
  c4AssertVerifyAllocationAudit(probe.topology.verifyAllocationAudit);
  const expectsPolicyCleanup = failureAudit.stage !== "source-syntax";
  assert.deepEqual(probe.topology.publicCalls.slice(expectsPolicyCleanup ? -2 : -1),
    expectsPolicyCleanup ? ["disposePolicy", "disposeSyntax"] : ["deriveSyntax"]);
  assert.equal(probe.topology.publicCalls.filter((name) => name === "disposePolicy").length,
    expectsPolicyCleanup ? 1 : 0);
  assert.equal(probe.topology.publicCalls.filter((name) => name === "disposeSyntax").length,
    expectsPolicyCleanup ? 1 : 0);
  c4AssertPublicRegistryFailure(
    probe.topology.registryAudit,
    "topology",
    probe.topology.publicAudit.contractErrorEvents[0].registryEvents
  );
  c4AssertProjectionFreezeAudit(probe.topology.publicAudit, probe.topology.publicAudit.projectionFreezeCounts);
  assert.equal(probe.topology.publicAudit.projectionFreezeEvents.every((entry) => entry.returnedRoot === false), true);
  const {
    authorizationHashInputs, projectionFreezeCounts, projectionFreezeEvents, contractErrorEvents,
    verifierBufferToStringCount, verifierBufferToStringSpans,
    initialBoundaryCaptureCount, initialBoundaryAudits,
    initialShapeCaptureCount, initialFixedShape, initialBudgetAudit, budgetLedger,
    preimageReserveLengths, preimageReserveTotal, ...publicAudit
  } =
    probe.topology.publicAudit;
  assert.equal(projectionFreezeCounts.topology, expectedTopologyFreezeCount);
  assert.equal(projectionFreezeEvents.length > 0, expectsPolicyCleanup);
  assert.ok(contractErrorEvents.length >= 1);
  assert.deepEqual(contractErrorEvents.map((entry) => entry.ordinal),
    contractErrorEvents.map((_, index) => index + 1));
  assert.equal(contractErrorEvents.every((entry) => entry.codeExact === true), true);
  assert.equal(probe.topology.rawErrorAudit.contractErrorOrdinal, contractErrorEvents.at(-1).ordinal);
  assert.equal(initialShapeCaptureCount, 1);
  assert.equal(initialBoundaryCaptureCount, 3);
  assert.equal(initialBoundaryAudits.length, 3);
  assert.notEqual(initialFixedShape, null);
  assert.notEqual(initialBudgetAudit, null);
  assert.notEqual(budgetLedger, null);
  c4AssertVerifierCanonicalPathStringAudit(
    verifierBufferToStringCount,
    verifierBufferToStringSpans,
    failureAudit.verifyAttempts
  );
  assert.deepEqual(preimageReserveTotal,
    preimageReserveLengths.reduce((total, length) => total + length, 0));
  assert.deepEqual(publicAudit, {
    legacyLineParserCallCount: 0,
    wholeRecordBufferToStringCount: 0,
    wholeRecordTextDecoderCount: 0,
    verifierTextDecoderConstructionCount: 0,
    verifierTextDecoderDecodeCount: 0,
    verifierTextDecoderInputLengths: [],
    topologyFreezeCount: expectedTopologyFreezeCount,
    verifyAttempts: failureAudit.verifyAttempts,
    verifySuccesses: failureAudit.verifySuccesses,
    verifyFailures: failureAudit.verifyFailures,
    verifyUndefinedReturns: failureAudit.verifySuccesses,
    verifyNonUndefinedReturns: 0,
    authorizationEntryCount: 0,
    snapshotFailed: true
  });
  assert.equal(Array.isArray(authorizationHashInputs), true);
  assert.notEqual(failureAudit.expectedCalls, null);
  assert.deepEqual(probe.calls, failureAudit.expectedCalls, label);
  assert.deepEqual(probe.verificationScopes.filter(([operation, role, active]) =>
    role === "file-1" && ["lstat", "open", "fstat", "read", "close"].includes(operation) && active !== true), []);
  assert.equal(probe.topology.publicCalls.filter((name) => name === "verify").length,
    failureAudit.verifyAttempts);
  const { beforeLifecycle, afterLifecycle, beforeState, afterState, ...terminalFollowUp } =
    probe.topology.terminalFollowUp;
  assert.deepEqual(terminalFollowUp, {
    ok: false,
    error: "restricted_identity_rejected",
    allocations: C2B_ZERO_ALLOCATIONS,
    operationCalls: 0,
    trackedBuffersZero: true
  });
  assert.deepEqual(afterLifecycle, beforeLifecycle);
  assert.deepEqual(afterState, beforeState);
  c4AssertTerminalBudgetState(beforeState, initialFixedShape,
    probe.topology.publicAudit.budgetLedger, preimageReserveTotal);
  assert.deepEqual(probe.fdAudit.successfulOpens,
    failureAudit.successfulOpenRoles.map((role) => [role, 1]));
  assert.deepEqual(probe.fdAudit.closeAttempts, probe.fdAudit.successfulOpens);
  assert.equal(probe.fdAudit.liveDescriptorCount, 0);
  for (const [, count] of probe.fdAudit.successfulOpens) assert.equal(count, 1);
  for (const [, count] of probe.fdAudit.closeAttempts) assert.equal(count, 1);
}

function c3AssertAllocationPolicy(result) {
  assert.deepEqual(Object.keys(result.allocations).sort(), Object.keys(C2B_ZERO_ALLOCATIONS).sort());
  for (const key of C3_FORBIDDEN_ALLOCATION_KEYS) assert.equal(result.allocations[key], 0, key);
  const hashIndexes = result.trace
    .map(([name], index) => name === "createHash" ? index : -1)
    .filter((index) => index >= 0);
  const preimageIndexes = result.trace
    .map(([name], index) => name === "reserve-preimage" ? index : -1)
    .filter((index) => index >= 0);
  assert.equal(result.allocations.createHash, hashIndexes.length);
  assert.ok(preimageIndexes.length <= 1);
  assert.ok(result.allocations.createHash >= preimageIndexes.length);
  if (preimageIndexes.length === 1) {
    const sourceHashAttempts = hashIndexes.filter((index) => index < preimageIndexes[0]).length;
    const closureHashAttempts = hashIndexes.filter((index) => index > preimageIndexes[0]).length;
    assert.ok(closureHashAttempts <= 1);
    if (result.outcome.ok) {
      assert.equal(sourceHashAttempts, result.ownerBeforeDispose.files.length);
      assert.equal(closureHashAttempts, 1);
      assert.equal(result.allocations.createHash, result.ownerBeforeDispose.files.length + 1);
    }
  } else {
    assert.equal(result.outcome.ok, false);
  }
}

function c3AssertSuccess(result) {
  c3AssertAllocationPolicy(result);
  assert.deepEqual(result.outcome, { ok: true });
  assert.deepEqual(result.dispose, { ok: true });
  assert.equal(result.ownerAfterDispose.disposed, true);
  assert.equal(result.ownerAfterDispose.closureReferenceDropped, true);
  assert.equal(result.ownerAfterDispose.eventLength, 0);
  assert.equal(result.ownerAfterDispose.activeLength, 0);
  assert.equal(result.ownerAfterDispose.allBuffersZero, true);
  assert.ok(result.tracked.arrays.every((entry) => entry.native && entry.prototype && entry.length === 0));
  assert.ok(result.tracked.buffers.every((entry) => entry.zero));
  assert.equal(result.calls.some(([name]) => name === "validateSudoers"), false);
}

function c3AssertFailure(result) {
  c3AssertAllocationPolicy(result);
  assert.deepEqual(result.outcome, { ok: false, error: "restricted_identity_rejected" });
  assert.equal(result.after.snapshot.failed, true);
  assert.equal(result.after.ssh.failed, true);
  assert.ok(result.tracked.arrays.every((entry) => entry.length === 0));
  assert.ok(result.tracked.buffers.every((entry) => entry.zero));
}

function c3LifecycleNamedPhase(lifecycle, name) {
  const matches = lifecycle.phases.filter((phase) => phase.name === name);
  assert.equal(matches.length, 1, name);
  return matches[0];
}

function c3AssertEventSchemas(owner) {
  const events = owner.events;
  const fileOrdinals = new Set(owner.files.map((file) => file.ordinal));
  assert.deepEqual([...new Set(events.map((event) => event.values.kind))].sort(), Object.keys(C3_EVENT_SCHEMAS).sort());
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const values = event.values;
    const schema = C3_EVENT_SCHEMAS[values.kind];
    assert.ok(schema, values.kind);
    assert.deepEqual(event.keys, schema, values.kind);
    assert.equal(event.symbolCount, 0, values.kind);
    assert.equal(event.proxy, false, values.kind);
    assert.equal(event.nullPrototype, true, values.kind);
    assert.equal(event.frozen, true, values.kind);
    assert.deepEqual(Object.keys(event.descriptors), schema, values.kind);
    for (const key of schema) {
      assert.deepEqual(event.descriptors[key], {
        enumerable: true,
        configurable: false,
        writable: false,
        data: true
      }, `${values.kind}.${key}`);
    }
    assert.equal(values.eventOrdinal, index, values.kind);
    assert.equal(Number.isSafeInteger(values.sourceOrdinal), true, values.kind);
    assert.equal(fileOrdinals.has(values.sourceOrdinal), true, values.kind);
    assert.equal(Number.isSafeInteger(values.lineNumber) && values.lineNumber >= 1, true, values.kind);
  }

  const at = (ordinal, kind) => {
    assert.equal(Number.isSafeInteger(ordinal) && ordinal >= 0 && ordinal < events.length, true, kind);
    const event = events[ordinal];
    assert.equal(event.values.kind, kind);
    return event.values;
  };
  const sameCoordinate = (child, parent) => {
    assert.equal(child.sourceOrdinal, parent.sourceOrdinal);
    assert.equal(child.lineNumber, parent.lineNumber);
  };
  const grouped = (kind, parentField, parentOrdinal) => events
    .filter((event) => event.values.kind === kind && event.values[parentField] === parentOrdinal)
    .map((event) => event.values);

  const branchByOrdinal = new Map();
  for (const event of events) {
    const value = event.values;
    if (value.kind === "physicalDirective") {
      assert.equal(value.scope === "global" || value.scope === "match", true);
      assert.equal(value.scope === "global" ? value.branchOrdinal === -1 : value.branchOrdinal >= 0, true);
      continue;
    }
    if (value.kind === "includePattern") {
      const physical = at(value.physicalEventOrdinal, "physicalDirective");
      assert.ok(value.physicalEventOrdinal < value.eventOrdinal);
      sameCoordinate(value, physical);
      assert.equal(physical.directive, "include");
      const siblings = grouped("includePattern", "physicalEventOrdinal", value.physicalEventOrdinal);
      assert.deepEqual(siblings.map((entry) => entry.argumentOrdinal), siblings.map((_, index) => index));
      const selections = grouped("selectedInsertion", "includePatternEventOrdinal", value.eventOrdinal);
      assert.equal(value.selectedCount, selections.length);
      continue;
    }
    if (value.kind === "selectedInsertion") {
      const pattern = at(value.includePatternEventOrdinal, "includePattern");
      assert.ok(value.includePatternEventOrdinal < value.eventOrdinal);
      sameCoordinate(value, pattern);
      const siblings = grouped("selectedInsertion", "includePatternEventOrdinal", value.includePatternEventOrdinal);
      assert.deepEqual(siblings.map((entry) => entry.selectionOrdinal), siblings.map((_, index) => index));
      assert.equal(typeof value.path === "object" && typeof value.path.pathRole === "string", true);
      continue;
    }
    if (value.kind === "matchBranch") {
      const physical = at(value.physicalEventOrdinal, "physicalDirective");
      assert.equal(value.eventOrdinal, value.physicalEventOrdinal + 1);
      sameCoordinate(value, physical);
      assert.equal(physical.directive, "match");
      assert.equal(branchByOrdinal.has(value.branchOrdinal), false);
      branchByOrdinal.set(value.branchOrdinal, value);
      const conditions = events.filter((candidate) => candidate.values.kind === "matchCondition"
        && candidate.values.physicalEventOrdinal === value.physicalEventOrdinal
        && candidate.values.branchOrdinal === value.branchOrdinal).map((candidate) => candidate.values);
      assert.equal(value.conditionCount, conditions.length);
      assert.equal(value.conditionStartEventOrdinal, value.eventOrdinal + 1);
      assert.equal(value.conditionStartEventOrdinal, conditions[0].eventOrdinal);
      assert.equal(value.patternCount, conditions.reduce((count, condition) => count + condition.patternCount, 0));
      continue;
    }
    if (value.kind === "matchCondition") {
      const physical = at(value.physicalEventOrdinal, "physicalDirective");
      sameCoordinate(value, physical);
      assert.ok(branchByOrdinal.has(value.branchOrdinal));
      const conditions = events.filter((candidate) => candidate.values.kind === "matchCondition"
        && candidate.values.physicalEventOrdinal === value.physicalEventOrdinal
        && candidate.values.branchOrdinal === value.branchOrdinal).map((candidate) => candidate.values);
      assert.deepEqual(conditions.map((entry) => entry.conditionOrdinal), conditions.map((_, index) => index));
      const patterns = events.filter((candidate) => candidate.values.kind === "matchPattern"
        && candidate.values.physicalEventOrdinal === value.physicalEventOrdinal
        && candidate.values.branchOrdinal === value.branchOrdinal
        && candidate.values.conditionOrdinal === value.conditionOrdinal).map((candidate) => candidate.values);
      assert.equal(value.patternCount, patterns.length);
      assert.equal(value.patternStartEventOrdinal, patterns.length === 0 ? -1 : patterns[0].eventOrdinal);
      assert.equal(value.name === "all", patterns.length === 0);
      continue;
    }
    if (value.kind === "matchPattern") {
      const physical = at(value.physicalEventOrdinal, "physicalDirective");
      sameCoordinate(value, physical);
      const conditions = events.filter((candidate) => candidate.values.kind === "matchCondition"
        && candidate.values.physicalEventOrdinal === value.physicalEventOrdinal
        && candidate.values.branchOrdinal === value.branchOrdinal
        && candidate.values.conditionOrdinal === value.conditionOrdinal);
      assert.equal(conditions.length, 1);
      const patterns = events.filter((candidate) => candidate.values.kind === "matchPattern"
        && candidate.values.physicalEventOrdinal === value.physicalEventOrdinal
        && candidate.values.branchOrdinal === value.branchOrdinal
        && candidate.values.conditionOrdinal === value.conditionOrdinal).map((candidate) => candidate.values);
      assert.deepEqual(patterns.map((entry) => entry.patternOrdinal), patterns.map((_, index) => index));
      assert.equal(value.eventOrdinal, conditions[0].values.patternStartEventOrdinal + value.patternOrdinal);
      continue;
    }
    if (value.kind === "assignment") {
      const physical = at(value.physicalEventOrdinal, "physicalDirective");
      sameCoordinate(value, physical);
      assert.equal(value.eventOrdinal, value.physicalEventOrdinal + 1);
      assert.equal(value.scope, physical.scope);
      assert.equal(value.branchOrdinal, physical.branchOrdinal);
      assert.equal(value.name, physical.directive);
      const names = grouped("acceptEnvName", "assignmentEventOrdinal", value.eventOrdinal);
      assert.equal(value.name === "acceptenv" ? value.argumentCount === names.length && value.valueBytes === null : names.length === 0, true);
      continue;
    }
    if (value.kind === "acceptEnvName") {
      const physical = at(value.physicalEventOrdinal, "physicalDirective");
      const assignment = at(value.assignmentEventOrdinal, "assignment");
      sameCoordinate(value, physical);
      sameCoordinate(value, assignment);
      assert.equal(value.eventOrdinal, value.assignmentEventOrdinal + 1 + value.nameOrdinal);
      assert.equal(value.scope, assignment.scope);
      assert.equal(value.branchOrdinal, assignment.branchOrdinal);
      const names = grouped("acceptEnvName", "assignmentEventOrdinal", value.assignmentEventOrdinal);
      assert.deepEqual(names.map((entry) => entry.nameOrdinal), names.map((_, index) => index));
    }
  }
  assert.deepEqual([...branchByOrdinal.keys()], [...branchByOrdinal.keys()].map((_, index) => index));
}

function c3AssertTerminalLifecyclePhase(phase) {
  assert.deepEqual(phase.finalStamp, { allocations: 0, hashes: 0, copies: 0, pushes: 0, operationCalls: 0 });
  assert.deepEqual(phase.allocationKinds, {});
  assert.deepEqual(phase.objectAllocations, []);
  assert.deepEqual(phase.fixedAllocations, []);
  assert.deepEqual(phase.roleAllocations, []);
  assert.deepEqual(phase.roleFills, []);
  assert.deepEqual(phase.retentions, []);
  assert.deepEqual(phase.registry, []);
  assert.deepEqual(phase.fills, []);
  assert.deepEqual(phase.copies, []);
  assert.deepEqual(phase.pushes, []);
}

function c3AssertA2Lifecycle(value) {
  assert.equal(value.moduleWeakMapCount, 1);
  assert.equal(value.prototypesRestored, true);
  const success = value.success;
  c3AssertSuccess(success);
  assert.equal(success.ownerAfterDispose.fileLength, 0);
  assert.deepEqual(success.disposeAllocations, C2B_ZERO_ALLOCATIONS);
  const derive = c3LifecycleNamedPhase(success.lifecycle, "derive");
  const dispose = c3LifecycleNamedPhase(success.lifecycle, "dispose");
  const ownerSets = derive.registry.filter((entry) => entry.method === "set" && entry.keyShape === "owner");
  assert.deepEqual(derive.objectState, { roles: ["owner", "closure"], ownerLinksClosure: true });
  assert.deepEqual(derive.fixedAllocations, [
    { role: "owner", ordinal: 1, kind: "objectCreate", expectedKind: true },
    { role: "closure", ordinal: 2, kind: "objectCreate", expectedKind: true },
    { role: "files", ordinal: 3, kind: "array", expectedKind: true },
    { role: "events", ordinal: 4, kind: "array", expectedKind: true },
    { role: "activePaths", ordinal: 5, kind: "array", expectedKind: true }
  ]);
  assert.equal(ownerSets.length, 1);
  assert.deepEqual(ownerSets[0], {
    method: "set",
    keyShape: "owner",
    sameGraph: true,
    ownerComplete: true,
    stamp: derive.finalStamp
  });
  assert.equal(success.lifecycle.phases.flatMap((phase) => phase.registry)
    .some((entry) => entry.keyShape === "snapshot" && (entry.method === "set" || entry.method === "delete")), false);
  const ownerDeletes = dispose.registry.filter((entry) => entry.method === "delete" && entry.keyShape === "owner");
  assert.equal(ownerDeletes.length, 1);
  assert.equal(ownerDeletes[0].sameGraph, true);
  const attached = success.lifecycle.bytes.filter((entry) => entry.roles.includes("retainedEvent"));
  assert.ok(attached.length > 0);
  assert.equal(new Set(attached.map((entry) => entry.id)).size, attached.length);
  assert.ok(attached.every((entry) => entry.creationKind === "bufferAlloc"
    && !entry.roles.some((role) => ["rawSource", "rawDirectory", "preimage", "sourceFixture"].includes(role))));
  const deriveBytes = new Map(derive.byteState.map((entry) => [entry.id, entry]));
  assert.ok(attached.every((entry) => deriveBytes.get(entry.id).zero === false && entry.zero === true));
  assert.deepEqual(dispose.fills.map((entry) => entry.byteId), success.attachedBufferIds.slice().reverse());
  assert.ok(dispose.fills.every((entry) => entry.zero));
  const preimages = success.lifecycle.bytes.filter((entry) => entry.roles.includes("preimage"));
  assert.equal(preimages.length, 1);
  assert.equal(preimages[0].creationKind, "bufferAlloc");
  assert.equal(preimages[0].roles.includes("hashInput"), true);
  assert.equal(deriveBytes.get(preimages[0].id).zero, true);
  for (const role of ["rawSource", "rawDirectory"]) {
    const records = success.lifecycle.bytes.filter((entry) => entry.roles.includes(role));
    assert.ok(records.length > 0, role);
    assert.ok(records.every((entry) => deriveBytes.get(entry.id).zero), role);
  }
  const directoryReencodes = success.lifecycle.bytes.filter((entry) => entry.roles.includes("directoryReencode"));
  assert.ok(derive.rawDirectory.rawCount > 0);
  assert.equal(!derive.rawDirectory.failed
    && derive.rawDirectory.matchedCount === derive.rawDirectory.rawCount, true);
  assert.equal(directoryReencodes.length, derive.rawDirectory.rawCount);
  assert.ok(directoryReencodes.every((entry) => entry.creationKind === "bufferFrom"
    && !entry.roles.includes("retainedEvent")
    && deriveBytes.get(entry.id).zero));
  assert.deepEqual(success.lifecycle.arrays.map((entry) => entry.role).sort(), ["activePaths", "events", "files"]);
  assert.ok(success.lifecycle.arrays.every((entry) => entry.native && entry.prototype && entry.length === 0));
  const ownerView = success.ownerBeforeDispose;
  assert.deepEqual(ownerView.ownerKeys, ["closure", "closureSha256", "events", "activePaths", "disposed"]);
  assert.equal(ownerView.ownerSymbolCount, 0);
  assert.equal(ownerView.ownerProxy, false);
  assert.deepEqual(ownerView.closureKeys, ["schemaVersion", "type", "rootConfig", "files"]);
  assert.equal(ownerView.closureSymbolCount, 0);
  assert.equal(ownerView.closureProxy, false);
  assert.ok(ownerView.files.every((file) => file.symbolCount === 0 && file.proxy === false));
  c3AssertEventSchemas(ownerView);
  assert.deepEqual(success.shapeAfterDerive, success.shapeBefore);
  assert.equal(success.afterDerive.snapshot.fixedEnvelopeCount - success.before.snapshot.fixedEnvelopeCount, 5);
  assert.equal(success.afterDerive.snapshot.semanticNodeCount - success.before.snapshot.semanticNodeCount,
    5 + ownerView.files.length + ownerView.events.length);
  assert.equal(success.afterDerive.ssh.semanticNodeCount - success.before.ssh.semanticNodeCount,
    5 + ownerView.files.length + ownerView.events.length);
  const eventKindCounts = Object.fromEntries(Object.keys(C3_EVENT_SCHEMAS).map((kind) => [kind,
    ownerView.events.filter((event) => event.values.kind === kind).length]));
  assert.equal(success.afterDerive.ssh.sourceFileCount, ownerView.files.length);
  assert.equal(success.afterDerive.ssh.sshPhysicalDirectiveCount, eventKindCounts.physicalDirective);
  assert.equal(success.afterDerive.ssh.sshIncludePatternCount, eventKindCounts.includePattern);
  assert.equal(success.afterDerive.ssh.sshSelectedInsertionCount, eventKindCounts.selectedInsertion);
  assert.equal(success.afterDerive.ssh.sshMatchBranchCount, eventKindCounts.matchBranch);
  assert.equal(success.afterDerive.ssh.sshMatchConditionCount, eventKindCounts.matchCondition);
  assert.equal(success.afterDerive.ssh.sshMatchPatternCount, eventKindCounts.matchPattern);
  assert.equal(success.afterDerive.ssh.sshAssignmentCount, eventKindCounts.assignment);
  assert.equal(success.afterDerive.ssh.sshAcceptEnvNameCount, eventKindCounts.acceptEnvName);
  assert.deepEqual(derive.objectAllocations.reduce((counts, entry) => {
    counts[entry.classification === null ? "unmatched" : entry.classification] += 1;
    return counts;
  }, { owner: 0, closure: 0, sourceFile: 0, event: 0, unmatched: 0 }), {
    owner: 1,
    closure: 1,
    sourceFile: ownerView.files.length,
    event: ownerView.events.length,
    unmatched: 0
  });
  assert.equal(derive.retentions.length, ownerView.events.length);
  assert.deepEqual(derive.retentions.map((entry) => entry.eventOrdinal), ownerView.events.map((_, index) => index));
  for (const retention of derive.retentions) {
    const event = ownerView.events[retention.eventOrdinal];
    assert.equal(retention.role, C3_EVENT_ROLE_BY_KIND[event.values.kind]);
    assert.equal(retention.objectIdentityMatches, true);
    assert.equal(retention.objectCreateActions.length, 1);
    assert.ok(retention.objectCreateActions.every((action) => retention.reserveStamp.action < action && action < retention.pushAction));
    assert.ok(retention.byteAllocationActions.every((action) => retention.reserveStamp.action < action && action < retention.pushAction));
    assert.ok(retention.copyActions.every((action) => retention.reserveStamp.action < action && action < retention.pushAction));
    const ownsBytes = event.values.kind === "matchPattern" || event.values.kind === "acceptEnvName"
      || (event.values.kind === "assignment" && event.values.valueBytes !== null);
    assert.equal(retention.byteAllocationActions.length, ownsBytes ? 1 : 0, `${event.values.kind}.bufferAlloc`);
    assert.equal(retention.copyActions.length, ownsBytes ? 1 : 0, `${event.values.kind}.copy`);
  }
  for (const directive of ["match", "acceptenv"]) {
    const physical = ownerView.events.find((event) => event.values.kind === "physicalDirective" && event.values.directive === directive);
    assert.ok(physical, directive);
    const ordinals = new Set([physical.values.eventOrdinal]);
    for (const event of ownerView.events) {
      if (event.values.physicalEventOrdinal === physical.values.eventOrdinal) ordinals.add(event.values.eventOrdinal);
    }
    const groupedRetentions = derive.retentions.filter((entry) => ordinals.has(entry.eventOrdinal));
    assert.equal(groupedRetentions.length, ordinals.size);
    const firstAllocationAction = Math.min(...groupedRetentions.flatMap((entry) => [
      ...entry.objectCreateActions, ...entry.byteAllocationActions
    ]));
    assert.ok(groupedRetentions.every((entry) => entry.reserveStamp.action < firstAllocationAction), directive);
    assert.equal(new Set(groupedRetentions.map((entry) => JSON.stringify({
      allocations: entry.reserveStamp.allocations,
      copies: entry.reserveStamp.copies,
      pushes: entry.reserveStamp.pushes
    }))).size, 1, directive);
  }
  const selectedRetentions = derive.retentions.filter((entry) => entry.role === "sshSelectedInsertion");
  assert.ok(selectedRetentions.length > 0);
  for (const retention of selectedRetentions) {
    const event = ownerView.events[retention.eventOrdinal].values;
    const selectedOpen = success.calls.findIndex(([name, role]) => name === "open" && role === event.path.pathRole);
    assert.ok(selectedOpen >= retention.pushOperationCalls);
  }

  const failure = value.failure;
  c3AssertFailure(failure);
  assert.deepEqual(failure.terminalSecondDerive, { ok: false, error: "restricted_identity_rejected" });
  assert.deepEqual(failure.terminalSecondDeriveAllocations, C2B_ZERO_ALLOCATIONS);
  assert.deepEqual(failure.terminalSecondDeriveCalls, []);
  assert.equal(failure.lifecycle.phases.flatMap((phase) => phase.registry)
    .some((entry) => entry.method === "set" && entry.keyShape === "owner"), false);
  assert.ok(failure.lifecycle.arrays.every((entry) => entry.length === 0));
  assert.ok(failure.lifecycle.bytes
    .filter((entry) => !entry.roles.includes("sourceFixture"))
    .every((entry) => entry.zero));
  const failedAttached = failure.lifecycle.bytes.filter((entry) => entry.roles.includes("retainedEvent"));
  const failedUnattached = failure.lifecycle.bytes.filter((entry) => entry.creationKind === "bufferAlloc"
    && entry.fills.some((fill) => fill.phase === "derive" && fill.zero)
    && !entry.roles.some((role) => ["retainedEvent", "rawSource", "rawDirectory", "preimage", "sourceFixture", "hashInput"].includes(role)));
  assert.ok(failedAttached.length > 0);
  assert.equal(failedUnattached.length, 1);
  const failedEventIds = new Set([...failedAttached, ...failedUnattached].map((entry) => entry.id));
  const failedDerive = c3LifecycleNamedPhase(failure.lifecycle, "derive");
  assert.deepEqual(failedDerive.objectState, { roles: ["owner", "closure"], ownerLinksClosure: false });
  assert.deepEqual(failedDerive.fills.filter((fill) => failedEventIds.has(fill.byteId)).map((fill) => fill.byteId), [
    failedUnattached[0].id,
    ...failedAttached.sort((left, right) => right.attachedOrdinal - left.attachedOrdinal).map((entry) => entry.id)
  ]);
  const failureTerminal = c3LifecycleNamedPhase(failure.lifecycle, "terminal");
  c3AssertTerminalLifecyclePhase(failureTerminal);

  const fixedRoles = ["owner", "closure", "files", "events", "activePaths"];
  assert.deepEqual(value.fixedAllocationFailures.map((entry) => entry.role), fixedRoles);
  for (let index = 0; index < value.fixedAllocationFailures.length; index += 1) {
    const witness = value.fixedAllocationFailures[index];
    const result = witness.result;
    c3AssertFailure(result);
    const phase = c3LifecycleNamedPhase(result.lifecycle, "derive");
    assert.equal(phase.faultTriggered, true, witness.role);
    const fixedAttempt = phase.fixedAllocations.at(-1);
    assert.deepEqual(fixedAttempt, {
      role: witness.role,
      ordinal: index + 1,
      kind: index < 2 ? "objectCreate" : "array",
      expectedKind: true
    }, witness.role);
    assert.deepEqual(phase.fixedAllocations.map((entry) => entry.role), fixedRoles.slice(0, index + 1), witness.role);
    assert.deepEqual(phase.finalStamp, {
      allocations: index + 1,
      hashes: 0,
      copies: 0,
      pushes: 0,
      operationCalls: 0
    }, witness.role);
    assert.deepEqual(phase.fills, [], witness.role);
    assert.deepEqual(phase.copies, [], witness.role);
    assert.deepEqual(phase.pushes, [], witness.role);
    assert.deepEqual(phase.objectState.roles, fixedRoles.slice(0, Math.min(index, 2)), witness.role);
    assert.equal(phase.objectState.ownerLinksClosure, index >= 2 ? false : null, witness.role);
    assert.deepEqual(result.lifecycle.arrays.map((entry) => entry.role), fixedRoles.slice(2, index), witness.role);
    assert.ok(result.lifecycle.arrays.every((entry) => entry.length === 0), witness.role);
    assert.ok(result.lifecycle.bytes.filter((entry) => !entry.roles.includes("sourceFixture")).every((entry) => entry.zero), witness.role);
    assert.equal(phase.registry.some((entry) => entry.method === "set"), false, witness.role);
    assert.deepEqual(result.terminalSecondDeriveAllocations, C2B_ZERO_ALLOCATIONS, witness.role);
    assert.deepEqual(result.terminalSecondDeriveCalls, [], witness.role);
    c3AssertTerminalLifecyclePhase(c3LifecycleNamedPhase(result.lifecycle, "terminal"));
  }

  const hashFailure = value.hashFailure;
  c3AssertFailure(hashFailure);
  const hashDerive = c3LifecycleNamedPhase(hashFailure.lifecycle, "derive");
  assert.equal(hashDerive.faultTriggered, true);
  assert.deepEqual(hashDerive.objectState, { roles: ["owner", "closure"], ownerLinksClosure: false });
  assert.equal(hashDerive.hashes, 2);
  const failedPreimages = hashFailure.lifecycle.bytes.filter((entry) => entry.roles.includes("preimage"));
  assert.equal(failedPreimages.length, 1);
  assert.equal(hashDerive.byteState.find((entry) => entry.id === failedPreimages[0].id).zero, true);
  assert.ok(hashFailure.lifecycle.arrays.every((entry) => entry.length === 0));
  assert.equal(hashDerive.registry.some((entry) => entry.method === "set"), false);
  assert.deepEqual(hashFailure.terminalSecondDeriveAllocations, C2B_ZERO_ALLOCATIONS);
  assert.deepEqual(hashFailure.terminalSecondDeriveCalls, []);
  c3AssertTerminalLifecyclePhase(c3LifecycleNamedPhase(hashFailure.lifecycle, "terminal"));

  const preimageAllocationFailure = value.preimageAllocationFailure;
  c3AssertFailure(preimageAllocationFailure);
  const preimageAllocationDerive = c3LifecycleNamedPhase(preimageAllocationFailure.lifecycle, "derive");
  assert.equal(preimageAllocationDerive.faultTriggered, true);
  assert.deepEqual(preimageAllocationDerive.roleAllocations, [{
    role: "preimage", ordinal: 1, kind: "bufferAlloc", lengthMatches: true
  }]);
  assert.deepEqual(preimageAllocationDerive.objectState, { roles: ["owner", "closure"], ownerLinksClosure: false });
  assert.equal(preimageAllocationFailure.lifecycle.bytes.some((entry) => entry.roles.includes("preimage")), false);
  assert.equal(preimageAllocationDerive.hashes, 1);
  assert.ok(preimageAllocationFailure.lifecycle.arrays.every((entry) => entry.length === 0));
  assert.ok(preimageAllocationFailure.lifecycle.bytes
    .filter((entry) => !entry.roles.includes("sourceFixture"))
    .every((entry) => entry.zero));
  assert.equal(preimageAllocationDerive.registry.some((entry) => entry.method === "set"), false);
  assert.deepEqual(preimageAllocationFailure.terminalSecondDeriveAllocations, C2B_ZERO_ALLOCATIONS);
  assert.deepEqual(preimageAllocationFailure.terminalSecondDeriveCalls, []);
  c3AssertTerminalLifecyclePhase(c3LifecycleNamedPhase(preimageAllocationFailure.lifecycle, "terminal"));

  const preimageFillFailure = value.preimageFillFailure;
  c3AssertFailure(preimageFillFailure);
  const preimageFillDerive = c3LifecycleNamedPhase(preimageFillFailure.lifecycle, "derive");
  assert.equal(preimageFillDerive.faultTriggered, true);
  assert.equal(preimageFillDerive.roleFills.length, 1);
  assert.deepEqual({
    role: preimageFillDerive.roleFills[0].role,
    ordinal: preimageFillDerive.roleFills[0].ordinal,
    zero: preimageFillDerive.roleFills[0].zero
  }, { role: "preimage", ordinal: 1, zero: true });
  const fillFailedPreimages = preimageFillFailure.lifecycle.bytes.filter((entry) => entry.roles.includes("preimage"));
  assert.equal(fillFailedPreimages.length, 1);
  assert.equal(preimageFillDerive.roleFills[0].byteId, fillFailedPreimages[0].id);
  assert.equal(preimageFillDerive.byteState.find((entry) => entry.id === fillFailedPreimages[0].id).zero, true);
  const fillFailedAttached = preimageFillFailure.lifecycle.bytes.filter((entry) => entry.roles.includes("retainedEvent"));
  assert.ok(fillFailedAttached.length > 0);
  const preimageFillIndex = preimageFillDerive.fills.findIndex((entry) => entry.byteId === fillFailedPreimages[0].id);
  assert.ok(preimageFillIndex >= 0);
  assert.deepEqual(preimageFillDerive.fills.slice(preimageFillIndex + 1)
    .filter((entry) => fillFailedAttached.some((buffer) => buffer.id === entry.byteId)).map((entry) => entry.byteId),
  fillFailedAttached.slice().sort((left, right) => right.attachedOrdinal - left.attachedOrdinal).map((entry) => entry.id));
  assert.deepEqual(preimageFillDerive.objectState, { roles: ["owner", "closure"], ownerLinksClosure: false });
  assert.ok(preimageFillFailure.lifecycle.arrays.every((entry) => entry.length === 0));
  assert.ok(preimageFillFailure.lifecycle.bytes.filter((entry) => !entry.roles.includes("sourceFixture")).every((entry) => entry.zero));
  assert.equal(preimageFillDerive.registry.some((entry) => entry.method === "set"), false);
  assert.deepEqual(preimageFillFailure.terminalSecondDeriveAllocations, C2B_ZERO_ALLOCATIONS);
  assert.deepEqual(preimageFillFailure.terminalSecondDeriveCalls, []);
  c3AssertTerminalLifecyclePhase(c3LifecycleNamedPhase(preimageFillFailure.lifecycle, "terminal"));

  const disposeFailure = value.disposeFailure;
  c3AssertAllocationPolicy(disposeFailure);
  assert.deepEqual(disposeFailure.outcome, { ok: true });
  assert.deepEqual(disposeFailure.dispose, { ok: false, error: "restricted_identity_rejected" });
  assert.deepEqual(disposeFailure.disposeAllocations, C2B_ZERO_ALLOCATIONS);
  assert.equal(disposeFailure.after.snapshot.failed, true);
  assert.equal(disposeFailure.after.ssh.failed, true);
  assert.equal(disposeFailure.ownerAfterDispose.disposed, true);
  assert.equal(disposeFailure.ownerAfterDispose.closureReferenceDropped, true);
  assert.equal(disposeFailure.ownerAfterDispose.fileLength, 0);
  assert.equal(disposeFailure.ownerAfterDispose.eventLength, 0);
  assert.equal(disposeFailure.ownerAfterDispose.activeLength, 0);
  assert.equal(disposeFailure.ownerAfterDispose.allBuffersZero, true);
  const failedDisposePhase = c3LifecycleNamedPhase(disposeFailure.lifecycle, "dispose");
  assert.equal(failedDisposePhase.faultTriggered, true);
  const failedDisposeDeletes = failedDisposePhase.registry.filter((entry) => entry.method === "delete" && entry.keyShape === "owner");
  assert.equal(failedDisposeDeletes.length, 1);
  assert.equal(failedDisposeDeletes[0].sameGraph, true);
  assert.deepEqual(failedDisposePhase.fills.map((entry) => entry.byteId), disposeFailure.attachedBufferIds.slice().reverse());
  assert.ok(failedDisposePhase.fills.every((entry) => entry.zero));
  assert.ok(disposeFailure.lifecycle.arrays.every((entry) => entry.length === 0));
  assert.ok(disposeFailure.lifecycle.bytes
    .filter((entry) => !entry.roles.includes("sourceFixture"))
    .every((entry) => entry.zero));
  assert.deepEqual(disposeFailure.terminalSecondDerive, { ok: false, error: "restricted_identity_rejected" });
  assert.deepEqual(disposeFailure.terminalSecondDeriveAllocations, C2B_ZERO_ALLOCATIONS);
  assert.deepEqual(disposeFailure.terminalSecondDeriveCalls, []);
  const disposeTerminal = c3LifecycleNamedPhase(disposeFailure.lifecycle, "terminalAfterDispose");
  c3AssertTerminalLifecyclePhase(disposeTerminal);

  for (const [name, result, expectedSelections] of [
    ["cycle", value.cycleFailure, 1],
    ["seen", value.seenFailure, 2]
  ]) {
    c3AssertFailure(result);
    const phase = c3LifecycleNamedPhase(result.lifecycle, "derive");
    const selected = phase.retentions.filter((entry) => entry.role === "sshSelectedInsertion");
    assert.equal(selected.length, expectedSelections, name);
    assert.equal(selected.at(-1).pushOperationCalls, result.calls.length, name);
    assert.equal(phase.registry.some((entry) => entry.method === "set"), false, name);
    assert.deepEqual(result.terminalSecondDeriveAllocations, C2B_ZERO_ALLOCATIONS, name);
    assert.deepEqual(result.terminalSecondDeriveCalls, [], name);
    c3AssertTerminalLifecyclePhase(c3LifecycleNamedPhase(result.lifecycle, "terminal"));
  }

  const registry = value.registry;
  assert.deepEqual(registry.failed.outcome, { ok: false, error: "restricted_identity_rejected" });
  assert.equal(registry.failed.terminal, true);
  assert.deepEqual(registry.foreign.outcome, { ok: false, error: "restricted_identity_rejected" });
  assert.equal(registry.foreign.terminal, true);
  assert.equal(registry.foreign.foreignOwnerStateHealthy, true);
  for (const isolation of [registry.foreign.foreignOwnerIsolation, registry.foreign.liveOwnerIsolation]) {
    assert.ok(isolation.bufferCount > 0);
    for (const [name, unchanged] of Object.entries(isolation)) {
      if (name === "bufferCount") continue;
      assert.equal(unchanged, true, name);
    }
  }
  assert.deepEqual(registry.foreign.disposeACleanup, {
    disposed: true,
    closureDropped: true,
    filesCleared: true,
    eventsCleared: true,
    activePathsCleared: true,
    buffersZero: true
  });
  assert.deepEqual(registry.snapshotAsOwner.outcome, { ok: false, error: "restricted_identity_rejected" });
  assert.deepEqual(registry.reuse.outcome, { ok: false, error: "restricted_identity_rejected" });
  assert.equal(registry.reuse.reuseLiveOwnerStateHealthy, true);
  assert.ok(registry.reuse.reuseLiveOwnerIsolation.bufferCount > 0);
  for (const [name, unchanged] of Object.entries(registry.reuse.reuseLiveOwnerIsolation)) {
    if (name === "bufferCount") continue;
    assert.equal(unchanged, true, `reuse.${name}`);
  }
  assert.ok(registry.correctDisposals.every((outcome) => outcome.ok === true));
  assert.deepEqual(registry.terminal.outcome, { ok: false, error: "restricted_identity_rejected" });
  assert.deepEqual(registry.terminal.allocations, C2B_ZERO_ALLOCATIONS);
  assert.deepEqual(registry.terminal.calls, []);
  assert.equal(registry.terminal.unchanged, true);
  const phases = registry.lifecycle.phases;
  const registryEvents = phases.flatMap((phase) => phase.registry);
  assert.equal(registryEvents.filter((entry) => entry.method === "set").length, 5);
  assert.ok(registryEvents.filter((entry) => entry.method === "set")
    .every((entry) => entry.keyShape === "owner" && entry.sameGraph && entry.ownerComplete));
  assert.equal(registryEvents.filter((entry) => entry.method === "delete").length, 5);
  assert.ok(registryEvents.filter((entry) => entry.method === "delete")
    .every((entry) => entry.keyShape === "owner" && entry.sameGraph));
  assert.equal(registryEvents.some((entry) => entry.keyShape === "snapshot"
    && (entry.method === "set" || entry.method === "delete")), false);
  for (const name of ["failedDerive", "foreignDispose", "snapshotAsOwner", "reuseD", "terminalFollowup"]) {
    assert.equal(c3LifecycleNamedPhase(registry.lifecycle, name).registry
      .some((entry) => entry.method === "set" || entry.method === "delete"), false, name);
  }
  assert.ok(c3LifecycleNamedPhase(registry.lifecycle, "foreignDispose").registry
    .some((entry) => entry.method === "get" && entry.keyShape === "owner" && !entry.sameGraph));
  const foreignPhase = c3LifecycleNamedPhase(registry.lifecycle, "foreignDispose");
  assert.deepEqual(foreignPhase.finalStamp, { allocations: 0, hashes: 0, copies: 0, pushes: 0, operationCalls: 0 });
  assert.deepEqual(foreignPhase.allocationKinds, {});
  assert.deepEqual(foreignPhase.objectAllocations, []);
  assert.deepEqual(foreignPhase.fixedAllocations, []);
  assert.deepEqual(foreignPhase.roleAllocations, []);
  assert.deepEqual(foreignPhase.roleFills, []);
  assert.deepEqual(foreignPhase.retentions, []);
  assert.deepEqual(foreignPhase.fills, []);
  assert.deepEqual(foreignPhase.copies, []);
  assert.deepEqual(foreignPhase.pushes, []);
  assert.ok(foreignPhase.registry.length > 0);
  assert.ok(foreignPhase.registry.every((entry) => (entry.method === "get" || entry.method === "has")
    && entry.keyShape === "owner" && entry.method !== "set" && entry.method !== "delete"));
  assert.ok(c3LifecycleNamedPhase(registry.lifecycle, "snapshotAsOwner").registry
    .some((entry) => entry.method === "get" && entry.keyShape === "snapshot" && !entry.sameGraph));
  assert.ok(c3LifecycleNamedPhase(registry.lifecycle, "reuseD").registry
    .some((entry) => entry.method === "get" && entry.keyShape === "owner" && !entry.sameGraph));
  const terminalFollowup = c3LifecycleNamedPhase(registry.lifecycle, "terminalFollowup");
  c3AssertTerminalLifecyclePhase(terminalFollowup);
  for (const phase of phases.filter((entry) => entry.name.startsWith("derive") && entry.name !== "failedDerive")) {
    const sets = phase.registry.filter((entry) => entry.method === "set" && entry.keyShape === "owner");
    assert.equal(sets.length, 1, phase.name);
    assert.deepEqual(sets[0].stamp, phase.finalStamp, phase.name);
  }
}

function c3A1FileOperations(...readStages) {
  return [
    ["lstat", "ancestor-0"],
    ["lstat", "ancestor-1"],
    ["lstat", "ancestor-2"],
    ["lstat", "file-0"],
    ["open", "file-0", "file"],
    ["fstat", "file-0", "pre"],
    ...readStages.map((stage) => ["read", "file-0", stage]),
    ["fstat", "file-0", "post"],
    ["close", "file-0"]
  ];
}

const C3_A1_DIRECTORY_OPERATIONS = Object.freeze([
  ["lstat", "ancestor-0"],
  ["lstat", "ancestor-1"],
  ["lstat", "ancestor-2"],
  ["lstat", "file-0"],
  ["open", "file-0", "file"],
  ["fstat", "file-0", "pre"],
  ["read", "file-0", "body"],
  ["read", "file-0", "eof"],
  ["fstat", "file-0", "post"],
  ["close", "file-0"],
  ["lstat", "ancestor-0"],
  ["lstat", "ancestor-1"],
  ["lstat", "ancestor-2"],
  ["lstat", "directory-0"],
  ["open", "directory-0", "directory"],
  ["fstat", "directory-0", "pre"],
  ["readDirectory", "directory-0", "live"],
  ["lstat", "ancestor-0"],
  ["lstat", "ancestor-1"],
  ["lstat", "ancestor-2"],
  ["lstat", "directory-0"],
  ["lstat", "file-1"],
  ["open", "file-1", "file"],
  ["fstat", "file-1", "pre"],
  ["read", "file-1", "body"],
  ["read", "file-1", "eof"],
  ["fstat", "file-1", "post"],
  ["close", "file-1"],
  ["fstat", "directory-0", "post"],
  ["close", "directory-0"]
]);

const C3_A1_DIRECTORY_FAILURE_OPERATIONS = Object.freeze([
  ...C3_A1_DIRECTORY_OPERATIONS.slice(0, 17),
  ["fstat", "directory-0", "post"],
  ["close", "directory-0"]
]);

function c3AssertA1Protocol(result) {
  assert.equal(result.calls.some(([name]) => name === "validateSudoers"), false);
  const opened = result.calls.filter(([name]) => name === "open");
  assert.equal(new Set(opened.map(([, role]) => role)).size, opened.length);
  for (const [, role, kind] of opened) {
    assert.equal(result.calls.filter(([name, candidate]) => name === "close" && candidate === role).length, 1, role);
    assert.deepEqual(result.calls
      .filter(([name, candidate]) => name === "fstat" && candidate === role)
      .map(([, , stage]) => stage), ["pre", "post"], role);
    if (kind === "file") {
      assert.equal(result.calls.some(([name, candidate, stage]) => name === "read" && candidate === role && stage === "body"), true, role);
      assert.equal(result.calls.some(([name, candidate, stage]) => name === "read" && candidate === role && stage === "eof"), true, role);
    } else {
      assert.deepEqual(result.calls
        .filter(([name, candidate]) => name === "readDirectory" && candidate === role),
      [["readDirectory", role, "live"]], role);
    }
  }
}

function c3AssertA1Success(result, expectedCalls) {
  c3AssertSuccess(result);
  assert.deepEqual(result.calls, expectedCalls);
  c3AssertA1Protocol(result);
}

function c3AssertA1TerminalFailure(witness, expectedCalls) {
  c3AssertFailure(witness.result);
  assert.deepEqual(witness.result.calls, expectedCalls, witness.name);
  assert.equal(witness.result.calls.some(([name]) => name === "validateSudoers"), false, witness.name);
  assert.deepEqual(witness.result.terminalSecondDerive,
    { ok: false, error: "restricted_identity_rejected" }, witness.name);
  assert.deepEqual(witness.result.terminalSecondDeriveAllocations, C2B_ZERO_ALLOCATIONS, witness.name);
  assert.deepEqual(witness.result.terminalSecondDeriveCalls, [], witness.name);
}

test("SSH source closure derives depth first Include encounter order", () => {
  const value = requireC3Symbols(c3VmProbe("depth"));
  c3AssertSuccess(value.success);
  const owner = value.success.ownerBeforeDispose;
  assert.deepEqual(owner.ownerKeys, ["closure", "closureSha256", "events", "activePaths", "disposed"]);
  assert.equal(owner.ownerSymbolCount, 0);
  assert.equal(owner.ownerProxy, false);
  assert.equal(owner.ownerNullPrototype, true);
  assert.deepEqual(owner.closureKeys, ["schemaVersion", "type", "rootConfig", "files"]);
  assert.equal(owner.closureSymbolCount, 0);
  assert.equal(owner.closureProxy, false);
  assert.equal(owner.closureNullPrototype, true);
  assert.equal(owner.closureFrozen, true);
  assert.equal(owner.schemaVersion, "1");
  assert.equal(owner.type, "japan_ci_sshd_source_closure");
  assert.equal(owner.rootConfigRole, "file-0");
  assert.deepEqual(owner.files.map(({ ordinal, pathRole }) => [ordinal, pathRole]), [
    [0, "file-0"],
    [1, "file-1"],
    [2, "file-2"],
    [3, "file-3"],
    [4, "file-4"]
  ]);
  assert.ok(owner.files.every((file) => file.nullPrototype && file.frozen && file.symbolCount === 0 && file.proxy === false
    && file.keys.join(",") === "ordinal,path,sha256,uid,gid,mode,nlink"));
  assert.equal(owner.closureSha256, owner.canonicalSha256);
  assert.equal(owner.eventCount, 24);
  assert.deepEqual(owner.events.map((event) => event.values.kind), [
    "physicalDirective", "includePattern", "selectedInsertion",
    "physicalDirective", "assignment", "physicalDirective", "includePattern", "selectedInsertion",
    "physicalDirective", "assignment", "selectedInsertion", "physicalDirective", "assignment",
    "includePattern", "selectedInsertion", "physicalDirective", "assignment",
    "physicalDirective", "assignment", "physicalDirective", "matchBranch", "matchCondition",
    "physicalDirective", "assignment"
  ]);
  assert.ok(owner.events.every((event, index) => event.nullPrototype && event.frozen
    && event.values.eventOrdinal === index));
  assert.deepEqual(owner.activePathRoles, []);
  assert.equal(value.success.afterDerive.snapshot.fixedEnvelopeCount, 10);
  assert.equal(value.success.afterDerive.ssh.fixedEnvelopeCount, 2);
  assert.equal(value.success.afterDerive.sudo.fixedEnvelopeCount, 2);
  assert.deepEqual(value.success.secondDerive, { ok: false, error: "restricted_identity_rejected" });
  assert.deepEqual(value.success.secondDeriveCalls, []);
  const preimageIndex = value.success.trace.findIndex(([name]) => name === "reserve-preimage");
  const laterBufferIndex = value.success.trace.findIndex(([name], index) => index > preimageIndex && name.startsWith("buffer"));
  assert.ok(preimageIndex >= 0 && laterBufferIndex > preimageIndex);
  c3AssertFailure(value.failure);
  c3AssertA1Success(value.operationSuccess, c3A1FileOperations("body", "eof"));
  const operationFailureCalls = {
    lstat: c3A1FileOperations().slice(0, 4),
    nonregular: c3A1FileOperations().slice(0, 4),
    open: c3A1FileOperations().slice(0, 5)
  };
  for (const witness of value.operationFailures) {
    c3AssertA1TerminalFailure(witness, operationFailureCalls[witness.name]);
  }
  c3AssertA2Lifecycle(value.lifecycle);
  const formalNul = value.formalNulRetention;
  const formalNulPhase = c3LifecycleNamedPhase(formalNul.lifecycle, "derive");
  const formalNulFilesPushes = formalNulPhase.pushes.filter((entry) => entry.arrayRole === "files");
  const formalNulRawSources = formalNul.lifecycle.bytes.filter((entry) => entry.roles.includes("rawSource"));
  const formalNulArrayLength = (role) => formalNulPhase.arrayState.find((entry) => entry.role === role)?.length ?? -1;
  const formalNulRecord = {
    result: formalNul.outcome,
    filesRolePushCount: formalNulFilesPushes.length,
    filesPushValueCount: formalNulFilesPushes.reduce((count, entry) => count + entry.valueCount, 0),
    sourceFileIdentityCount: formalNulPhase.objectAllocations.filter((entry) => entry.classification === "sourceFile").length,
    eventsRolePushCount: formalNulPhase.pushes.filter((entry) => entry.arrayRole === "events").length,
    ownerProvenanceSetCount: formalNulPhase.registry.filter((entry) => entry.method === "set" && entry.keyShape === "owner").length,
    closurePreimageCount: formalNul.trace.filter(([name]) => name === "reserve-preimage").length,
    closureHashCount: formalNul.allocations.createHash - formalNul.after.ssh.sourceFileCount,
    graphTerminal: formalNul.after.ssh.failed,
    snapshotTerminal: formalNul.after.snapshot.failed,
    finalFilesLength: formalNulArrayLength("files"),
    finalEventsLength: formalNulArrayLength("events"),
    finalActiveLength: formalNulArrayLength("activePaths"),
    rawSourceZeroized: formalNulRawSources.length > 0 && formalNulRawSources.every((entry) => entry.zero),
    terminalOutcome: formalNul.terminalSecondDerive,
    terminalAllocationCount: Object.values(formalNul.terminalSecondDeriveAllocations)
      .reduce((count, value_) => count + value_, 0),
    terminalCallCount: formalNul.terminalSecondDeriveCalls.length
  };
  assert.deepEqual(formalNulRecord, {
    result: { ok: false, error: "restricted_identity_rejected" },
    filesRolePushCount: 1,
    filesPushValueCount: 1,
    sourceFileIdentityCount: 1,
    eventsRolePushCount: 0,
    ownerProvenanceSetCount: 0,
    closurePreimageCount: 0,
    closureHashCount: 0,
    graphTerminal: true,
    snapshotTerminal: true,
    finalFilesLength: 0,
    finalEventsLength: 0,
    finalActiveLength: 0,
    rawSourceZeroized: true,
    terminalOutcome: { ok: false, error: "restricted_identity_rejected" },
    terminalAllocationCount: 0,
    terminalCallCount: 0
  });
  c3AssertExactSourceLock();
});

test("C4 SSH policy source identity rejects allocation container dynamic provenance arity and identity evasions", () => {
  const runnerPath = fileURLToPath(new URL("../../scripts/japan-tuic-additive-repair-runner.mjs", import.meta.url));
  const source = readFileSync(runnerPath, "utf8");
  c3AssertExactSourceLock();
  assert.deepEqual(c4SourceLockFailures(source), []);
  assert.equal(Object.keys(runnerModule).length, 17);
  assert.deepEqual(Object.keys(runnerModule).sort(), C2B_NATIVE_EXPORTS);
  assert.equal(runnerModule.buildCanonicalSshIncludeClosure.length, 1);
  assert.equal(runnerModule.buildCanonicalSshMatchCoverage.length, 2);
  assert.equal(runnerModule.buildCanonicalSshTopology.length, 3);

  function replaceOnce(needle, replacement) {
    assert.equal(c3SourceCount(source, needle), 1, needle);
    return source.replace(needle, replacement);
  }

  const afterMarker = `${C4_EXACT_BLOCK_BEGIN}\n`;
  const mutations = [
    {
      name: "allocation-before-reserve",
      expected: "fixed-allocation-order",
      source: replaceOnce(
        "function authorizationSshC4FixedObject(graph) {\n  reserveAuthorizationFixedEnvelope(graph);\n  return Object.create(null);",
        "function authorizationSshC4FixedObject(graph) {\n  return Object.create(null);"
      )
    },
    {
      name: "generic-container",
      expected: "container-token",
      source: replaceOnce(afterMarker, `${afterMarker}const c4ContainerEvasion = new Map();\n`)
    },
    {
      name: "array-literal-container",
      expected: "container-token",
      source: replaceOnce(afterMarker, `${afterMarker}const c4ArrayEvasion = [];\n`)
    },
    {
      name: "object-literal-container",
      expected: "container-token",
      source: replaceOnce(afterMarker, `${afterMarker}const c4ObjectEvasion = {};\n`)
    },
    {
      name: "for-of-array-literal-container",
      expected: "container-token",
      source: replaceOnce(
        "function authorizationSshC4AsciiText(bytes) {",
        "function authorizationSshC4AsciiText(bytes) {\n  for (const value of []) void value;"
      )
    },
    {
      name: "exponent-object-literal-container",
      expected: "container-token",
      source: replaceOnce(
        "function authorizationSshC4AsciiText(bytes) {",
        "function authorizationSshC4AsciiText(bytes) {\n  void (0 ** {});"
      )
    },
    {
      name: "compound-assignment-object-literal-container",
      expected: "container-token",
      source: replaceOnce(
        "function authorizationSshC4AsciiText(bytes) {",
        "function authorizationSshC4AsciiText(bytes) {\n  let value = 0;\n  value += {};"
      )
    },
    {
      name: "case-array-literal-container",
      expected: "container-token",
      source: replaceOnce(
        "function authorizationSshC4AsciiText(bytes) {",
        "function authorizationSshC4AsciiText(bytes) {\n  switch (bytes) { case []: break; }"
      )
    },
    {
      name: "instanceof-object-literal-container",
      expected: "container-token",
      source: replaceOnce(
        "function authorizationSshC4AsciiText(bytes) {",
        "function authorizationSshC4AsciiText(bytes) {\n  void (bytes instanceof {});"
      )
    },
    {
      name: "statement-array-literal-container",
      expected: "container-token",
      source: replaceOnce(
        "function authorizationSshC4AsciiText(bytes) {",
        "function authorizationSshC4AsciiText(bytes) {\n  [];"
      )
    },
    {
      name: "extra-buffer-allocation",
      expected: "container-token",
      source: replaceOnce(
        "function authorizationSshC4AsciiText(bytes) {",
        "function authorizationSshC4AsciiText(bytes) {\n  Buffer.alloc(1);"
      )
    },
    {
      name: "unsafe-buffer-allocation",
      expected: "container-token",
      source: replaceOnce(
        "function authorizationSshC4AsciiText(bytes) {",
        "function authorizationSshC4AsciiText(bytes) {\n  Buffer.allocUnsafe(1);"
      )
    },
    {
      name: "dynamic-code",
      expected: "dynamic-token",
      source: replaceOnce(
        "function authorizationSshC4AsciiText(bytes) {",
        "function authorizationSshC4AsciiText(bytes) {\n  eval(\"0\");"
      )
    },
    {
      name: "provenance-set-owner",
      expected: "provenance-sites",
      source: replaceOnce(
        "AUTHORIZATION_SSH_PROVENANCE.set(policy, active);",
        "AUTHORIZATION_SSH_PROVENANCE.set(syntax, active);"
      )
    },
    {
      name: "provenance-get-owner",
      expected: "provenance-sites",
      source: replaceOnce(
        "if (AUTHORIZATION_SSH_PROVENANCE.get(syntax) !== active\n      || !syntax || syntax.disposed !== false || syntax.c4PolicyConsumed === true",
        "if (AUTHORIZATION_SSH_PROVENANCE.get(policy) !== active\n      || !syntax || syntax.disposed !== false || syntax.c4PolicyConsumed === true"
      )
    },
    {
      name: "provenance-delete-owner",
      expected: "provenance-sites",
      source: replaceOnce(
        "if (!AUTHORIZATION_SSH_PROVENANCE.delete(policy)) cleanupFailed = true;",
        "if (!AUTHORIZATION_SSH_PROVENANCE.delete(syntax)) cleanupFailed = true;"
      )
    },
    {
      name: "provenance-computed-snapshot",
      expected: "provenance-sites",
      source: replaceOnce(
        "AUTHORIZATION_SSH_PROVENANCE.set(policy, active);",
        'AUTHORIZATION_SSH_PROVENANCE["set"](graph.snapshot, active);'
      )
    },
    {
      name: "provenance-set-value",
      expected: "provenance-sites",
      source: replaceOnce(
        "AUTHORIZATION_SSH_PROVENANCE.set(policy, active);",
        "AUTHORIZATION_SSH_PROVENANCE.set(policy, graph.snapshot);"
      )
    },
    {
      name: "unicode-escaped-dynamic-code",
      expected: "dynamic-token",
      source: replaceOnce(
        "function authorizationSshC4AsciiText(bytes) {",
        "function authorizationSshC4AsciiText(bytes) {\n  \\u0065val(\"0\");"
      )
    },
    {
      name: "optional-chain-whole-record",
      expected: "whole-record-bypass",
      source: replaceOnce(
        "function authorizationSshC4AsciiText(bytes) {",
        "function authorizationSshC4AsciiText(bytes) {\n  bytes?.toString(\"ascii\");"
      )
    },
    {
      name: "computed-whole-record",
      expected: "whole-record-bypass",
      source: replaceOnce(
        "function authorizationSshC4AsciiText(bytes) {",
        'function authorizationSshC4AsciiText(bytes) {\n  bytes["toString"]("ascii");'
      )
    },
    {
      name: "optional-property-whole-record",
      expected: "whole-record-bypass",
      source: replaceOnce(
        "function authorizationSshC4AsciiText(bytes) {",
        "function authorizationSshC4AsciiText(bytes) {\n  const mapper = bytes?.map;\n  void mapper;"
      )
    },
    {
      name: "aliased-property-whole-record",
      expected: "whole-record-bypass",
      source: replaceOnce(
        "function authorizationSshC4AsciiText(bytes) {",
        "function authorizationSshC4AsciiText(bytes) {\n  const mapper = bytes.map;\n  void mapper;"
      )
    },
    {
      name: "concatenated-constructor-dynamic",
      expected: "dynamic-token",
      source: replaceOnce(
        "function authorizationSshC4AsciiText(bytes) {",
        'function authorizationSshC4AsciiText(bytes) {\n  (function(){})["con" + "structor"]("return 0")();'
      )
    },
    {
      name: "escaped-computed-dynamic",
      expected: "dynamic-token",
      source: replaceOnce(
        "function authorizationSshC4AsciiText(bytes) {",
        'function authorizationSshC4AsciiText(bytes) {\n  bytes["con\\u0073tructor"];'
      )
    },
    {
      name: "variable-computed-constructor-dynamic",
      expected: "dynamic-token",
      source: replaceOnce(
        "function authorizationSshC4AsciiText(bytes) {",
        'function authorizationSshC4AsciiText(bytes) {\n  const key = "con" + "structor";\n  authorizationSshC4AsciiText[key]("return 0");'
      )
    },
    {
      name: "parenthesized-computed-constructor-dynamic",
      expected: "dynamic-token",
      source: replaceOnce(
        "function authorizationSshC4AsciiText(bytes) {",
        'function authorizationSshC4AsciiText(bytes) {\n  authorizationSshC4AsciiText[("con" + "structor")]("return 0");'
      )
    },
    {
      name: "authorization-source-ascii-conversion",
      expected: "bounded-ascii-conversion",
      source: replaceOnce(
        "source = authorizationSshC4ReadAuthorization(fd, size, operations);",
        "source = authorizationSshC4ReadAuthorization(fd, size, operations);\n        authorizationSshC4AsciiText(source);"
      )
    },
    {
      name: "authorization-source-string-conversion",
      expected: "whole-record-bypass",
      source: replaceOnce(
        "source = authorizationSshC4ReadAuthorization(fd, size, operations);",
        "source = authorizationSshC4ReadAuthorization(fd, size, operations);\n        String(source);"
      )
    },
    {
      name: "authorization-source-join",
      expected: "whole-record-bypass",
      source: replaceOnce(
        "source = authorizationSshC4ReadAuthorization(fd, size, operations);",
        'source = authorizationSshC4ReadAuthorization(fd, size, operations);\n        source.join("");'
      )
    },
    {
      name: "regex-literal-scan",
      expected: "whole-record-bypass",
      source: replaceOnce(
        "function authorizationSshC4AsciiText(bytes) {",
        "function authorizationSshC4AsciiText(bytes) {\n  const scan = /a/;"
      )
    },
    {
      name: "private-arity",
      expected: "private-signatures",
      source: replaceOnce(
        "function deriveAuthorizationSshPolicy(graph, syntax, accountCore) {",
        "function deriveAuthorizationSshPolicy(graph, syntax, accountCore, callerEvidence) {"
      )
    },
    {
      name: "public-arity",
      expected: "public-signatures",
      source: replaceOnce(
        "export function buildCanonicalSshTopology(projectedAccountCore, binding, input) {",
        "export function buildCanonicalSshTopology(projectedAccountCore, binding, input, callerEvidence) {"
      )
    },
    {
      name: "caller-operation-key",
      expected: "operation-key-shapes",
      source: replaceOnce(
        'const AUTHORIZATION_SSH_C4_OPERATION_INPUT_NAMES = "pathOperations sourceOperations";',
        'const AUTHORIZATION_SSH_C4_OPERATION_INPUT_NAMES = "pathOperations sourceOperations coverage";'
      )
    },
    {
      name: "public-caller-evidence",
      expected: "public-input-use",
      source: replaceOnce(
        "if (arguments.length !== 1) restricted();\n    const operations = authorizationSshC4OperationInput(input);\n    const snapshot = createAuthorizationSourceSnapshot();",
        "if (arguments.length !== 1) restricted();\n    const operations = authorizationSshC4OperationInput(input);\n    void input.callerEvidence;\n    const snapshot = createAuthorizationSourceSnapshot();"
      )
    },
    {
      name: "public-computed-caller-evidence",
      expected: "public-input-use",
      source: replaceOnce(
        "const operations = authorizationSshC4OperationInput(input);\n    authorizationSshC4BindingShape(binding);",
        'const operations = authorizationSshC4OperationInput(input);\n    void input["callerEvidence"];\n    authorizationSshC4BindingShape(binding);'
      )
    },
    {
      name: "public-arguments-caller-evidence",
      expected: "public-input-use",
      source: replaceOnce(
        "if (arguments.length !== 1) restricted();",
        "if (arguments.length !== 1) restricted();\n    void arguments[0].callerEvidence;"
      )
    },
    {
      name: "public-binding-caller-evidence",
      expected: "public-input-use",
      source: replaceOnce(
        "authorizationSshC4BindingShape(binding);\n    const canonicalBinding",
        "authorizationSshC4BindingShape(binding);\n    void binding.callerEvidence;\n    const canonicalBinding"
      )
    },
    {
      name: "semantic-computed-count",
      expected: "semantic-delta",
      source: replaceOnce(
        "function authorizationSshC4AsciiText(bytes) {",
        'function authorizationSshC4AsciiText(bytes) {\n  graph.snapshot["authorization" + "EntryCount"] = 1;'
      )
    },
    {
      name: "semantic-variable-count",
      expected: "semantic-delta",
      source: replaceOnce(
        "function authorizationSshC4AsciiText(bytes) {",
        'function authorizationSshC4AsciiText(bytes) {\n  const key = "authorization" + "EntryCount";\n  graph.snapshot[key] = 1;'
      )
    },
    {
      name: "semantic-reflect-count",
      expected: "semantic-delta",
      source: replaceOnce(
        "function authorizationSshC4AsciiText(bytes) {",
        'function authorizationSshC4AsciiText(bytes) {\n  const key = "authorization" + "EntryCount";\n  Reflect.set(graph.snapshot, key, 1);'
      )
    },
    {
      name: "whole-runner-identity",
      expected: "runner-identity",
      source: `${source} `
    }
  ];
  const outsideC4Mutations = new Set([
    "public-arity", "public-caller-evidence", "public-computed-caller-evidence",
    "public-arguments-caller-evidence", "public-binding-caller-evidence", "whole-runner-identity"
  ]);
  for (const mutation of mutations) {
    const failures = c4SourceLockFailures(mutation.source);
    assert.ok(failures.includes(mutation.expected), `${mutation.name}: ${failures.join(",")}`);
    assert.ok(failures.includes("runner-identity"), `${mutation.name}:runner-identity`);
    if (!outsideC4Mutations.has(mutation.name)) {
      assert.ok(failures.includes("c4-block-identity"), `${mutation.name}:c4-block-identity`);
      assert.ok(failures.includes("c4-token-identity"), `${mutation.name}:c4-token-identity`);
    }
  }
});

test("SSH branch ordinal is total while source coordinates are provenance", () => {
  const value = requireC3Symbols(c3VmProbe("coordinates"));
  c3AssertSuccess(value.coordinate);
  const branches = value.coordinate.ownerBeforeDispose.events
    .filter((event) => event.values.kind === "matchBranch")
    .map((event) => [event.values.branchOrdinal, event.values.sourceOrdinal, event.values.lineNumber]);
  assert.deepEqual(branches, [[0, 1, 5], [1, 0, 2]]);
  const physicalMatches = value.coordinate.ownerBeforeDispose.events
    .filter((event) => event.values.kind === "physicalDirective" && event.values.directive === "match")
    .map((event) => [event.values.scope, event.values.branchOrdinal]);
  assert.deepEqual(physicalMatches, [["global", -1], ["match", 0]]);
  for (const witness of value.duplicateCases) {
    if (witness.ok) c3AssertSuccess(witness.result);
    else c3AssertFailure(witness.result);
    assert.equal(witness.result.after.snapshot.wildcardAlignedComparisonCount, witness.aligned, witness.name);
  }
  c3AssertSuccess(value.alignedMaximum);
  assert.equal(value.alignedMaximum.afterDerive.snapshot.wildcardAlignedComparisonCount, 16777216);
  c3AssertFailure(value.alignedOverflow);
  assert.equal(value.alignedOverflow.after.snapshot.wildcardAlignedComparisonCount, 16777216);
  c3AssertSuccess(value.branchesMaximum);
  assert.equal(value.branchesMaximum.afterDerive.ssh.sshMatchBranchCount, 4096);
  c3AssertFailure(value.branchesOverflow);
  c3AssertSuccess(value.patternsMaximum);
  c3AssertFailure(value.patternsOverflow);
  c3AssertSuccess(value.valueMaximum);
  c3AssertFailure(value.valueOverflow);
  c3AssertSuccess(value.negatedMaximum);
  c3AssertFailure(value.negatedOverflow);
  assert.equal(value.conditionCalculator.maximum, 9);
  assert.deepEqual(value.conditionCalculator.overflow, { ok: false, error: "restricted_identity_rejected" });
  const eintrCalls = {
    body: c3A1FileOperations("body-eintr", "body", "eof"),
    eof: c3A1FileOperations("body", "eof-eintr", "eof")
  };
  for (const witness of value.readEintr) c3AssertA1Success(witness.result, eintrCalls[witness.name]);
  const readFailureCalls = {
    "early-eof": c3A1FileOperations("body-early-eof"),
    "trailing-byte": c3A1FileOperations("body", "eof-trailing-byte"),
    "body-invalid-count": c3A1FileOperations("body-invalid-count"),
    "eof-invalid-count": c3A1FileOperations("body", "eof-invalid-count")
  };
  for (const witness of value.readFailures) {
    c3AssertA1TerminalFailure(witness, readFailureCalls[witness.name]);
  }
  assert.deepEqual(value.formalFreshBeforeReflection, {
    first: {
      outcome: { ok: false, error: "restricted_identity_rejected" },
      pathTrapTotal: 0,
      sourceTrapTotal: 0,
      allocationCount: 0,
      hashCount: 0,
      copyCount: 0,
      pushCount: 0,
      pathOperationCalls: 0,
      sourceOperationCalls: 0,
      graphTerminal: true,
      snapshotTerminal: true
    },
    terminal: {
      outcome: { ok: false, error: "restricted_identity_rejected" },
      pathTrapTotal: 0,
      sourceTrapTotal: 0,
      allocationCount: 0,
      hashCount: 0,
      copyCount: 0,
      pushCount: 0,
      pathOperationCalls: 0,
      sourceOperationCalls: 0
    }
  });
});

test("SSH Include freezes relative base final glob and Match scope", { timeout: 120000 }, () => {
  const value = requireC3Symbols(c3VmProbe("include", 60000));
  c3AssertSuccess(value.relative);
  assert.deepEqual(value.relative.ownerBeforeDispose.files.map((file) => file.pathRole), ["file-0", "file-1", "file-2"]);
  c3AssertSuccess(value.glob);
  assert.deepEqual(value.glob.ownerBeforeDispose.files.map((file) => file.pathRole), ["file-0", "file-1", "file-2"]);
  const globPattern = value.glob.ownerBeforeDispose.events
    .filter((event) => event.values.kind === "includePattern").map((event) => event.values);
  assert.deepEqual(globPattern.map(({ starIndex, selectedCount }) => ({ starIndex, selectedCount })), [
    { starIndex: 0, selectedCount: 2 }
  ]);
  assert.deepEqual(value.glob.trace.filter(([name]) => name === "reserve-work"), [
    ["reserve-work", "glob"],
    ["reserve-work", "glob"],
    ["reserve-work", "glob"]
  ]);
  assert.deepEqual(value.glob.trace.filter(([name]) => name === "match-wildcard"), [
    ["match-wildcard", "glob", 6, 7, 0],
    ["match-wildcard", "glob", 6, 7, 0]
  ]);
  assert.equal(value.glob.afterDerive.ssh.globComparisonCount, 3);
  assert.equal(value.glob.afterDerive.snapshot.wildcardInvocationCount, 3);
  assert.equal(value.glob.afterDerive.snapshot.wildcardPatternByteCount, 6);
  for (const witness of value.invalidSources) c3AssertFailure(witness.result);
  for (const name of C3_INCLUDE_ROOT_ONLY_INVALID_NAMES) {
    const witness = value.invalidSources.find((entry) => entry.name === name);
    assert.ok(witness, name);
    assert.deepEqual(witness.result.calls, c3A1FileOperations("body", "eof"), name);
  }
  c3AssertSuccess(value.directory4096);
  assert.ok(value.directory4096.compareCount >= 8390656);
  assert.ok(value.directory4096.compareCount <= 8390656 + 196608);
  c3AssertFailure(value.directory4097);
  assert.equal(value.directory4097.compareCount, 0);
  c3AssertSuccess(value.operands64);
  c3AssertFailure(value.operands65);
  assert.deepEqual(value.operands65.calls, c3A1FileOperations("body", "eof"));
  c3AssertSuccess(value.depth32);
  c3AssertFailure(value.depth33);
  c3AssertSuccess(value.files256);
  c3AssertFailure(value.files257);
  assert.equal(value.selectedCalculator.maximum, 65536);
  assert.deepEqual(value.selectedCalculator.overflow, { ok: false, error: "restricted_identity_rejected" });
  assert.deepEqual(value.directoryCalculator, {
    perDirectorySort: 196608,
    aggregateSort: 4194304,
    inheritedAggregate: 134250496,
    completeCeiling: 137396224
  });
  c3AssertA1Success(value.operationDirectory, C3_A1_DIRECTORY_OPERATIONS);
  c3AssertA1TerminalFailure({ name: "readDirectory", result: value.readDirectoryFailure },
    C3_A1_DIRECTORY_FAILURE_OPERATIONS);
  const formalDirectoryProxy = value.formalDirectoryProxy.result;
  const formalDirectoryPhase = c3LifecycleNamedPhase(formalDirectoryProxy.lifecycle, "derive");
  const formalRawDirectory = formalDirectoryProxy.lifecycle.bytes
    .filter((entry) => entry.roles.includes("rawDirectory"));
  const formalDirectoryReencode = formalDirectoryProxy.lifecycle.bytes
    .filter((entry) => entry.roles.includes("directoryReencode"));
  const formalDirectoryArrayLength = (role) => formalDirectoryPhase.arrayState
    .find((entry) => entry.role === role)?.length ?? -1;
  const summarizeMatchBoundary = (result) => {
    const phase = c3LifecycleNamedPhase(result.lifecycle, "derive");
    const terminalAllocationCount = result.terminalSecondDeriveAllocations === null
      ? null
      : Object.values(result.terminalSecondDeriveAllocations).reduce((count, value_) => count + value_, 0);
    return {
      result: result.outcome,
      file2OperationCalls: result.calls.filter(([, role]) => role === "file-2").length,
      scanWildcardCalls: result.trace.filter(([name]) => name === "scan-wildcard").length,
      selectedInsertionReserves: result.trace.filter(([name, role]) => name === "reserve-semantic"
        && role === "sshSelectedInsertion").length,
      includePatternReserves: result.trace.filter(([name, role]) => name === "reserve-semantic"
        && role === "sshIncludePattern").length,
      selectedInsertionEvents: phase.pushes.filter((entry) => entry.arrayRole === "events"
        && entry.eventKind === "selectedInsertion").length,
      ownerProvenanceSetCount: phase.registry.filter((entry) => entry.method === "set"
        && entry.keyShape === "owner").length,
      terminalFollowupExecuted: result.terminalSecondDerive !== null,
      terminalFollowupWork: terminalAllocationCount === null
        ? null
        : terminalAllocationCount + result.terminalSecondDeriveCalls.length,
      graphTerminal: result.after.ssh.failed,
      snapshotTerminal: result.after.snapshot.failed,
      cleanupComplete: result.tracked.arrays.every((entry) => entry.length === 0)
        && result.tracked.buffers.every((entry) => entry.zero)
    };
  };
  const formalSourceTruth = c3FormalSourceTruth();
  const formalIncludeRecord = {
    directoryProxy: {
      result: formalDirectoryProxy.outcome,
      descriptorTrapPositive: value.formalDirectoryProxy.counters.getOwnPropertyDescriptor > 0,
      getTrapCount: value.formalDirectoryProxy.counters.get,
      getLengthTrapCount: value.formalDirectoryProxy.counters.getLength,
      getOtherTrapCount: value.formalDirectoryProxy.counters.getOther,
      globWorkCount: formalDirectoryProxy.trace.filter(([name, role]) => name === "reserve-work" && role === "glob").length,
      selectedChildOpens: formalDirectoryProxy.calls.filter(([name, role]) => name === "open" && role === "file-1").length,
      rawDirectoryZeroized: formalRawDirectory.length > 0 && formalRawDirectory.every((entry) => entry.zero),
      directoryReencodeZeroized: formalDirectoryReencode.length > 0 && formalDirectoryReencode.every((entry) => entry.zero),
      finalFilesLength: formalDirectoryArrayLength("files"),
      finalEventsLength: formalDirectoryArrayLength("events"),
      finalActiveLength: formalDirectoryArrayLength("activePaths"),
      graphTerminal: formalDirectoryProxy.after.ssh.failed,
      snapshotTerminal: formalDirectoryProxy.after.snapshot.failed,
      terminalOutcome: formalDirectoryProxy.terminalSecondDerive,
      terminalAllocationCount: Object.values(formalDirectoryProxy.terminalSecondDeriveAllocations)
        .reduce((count, value_) => count + value_, 0),
      terminalCallCount: formalDirectoryProxy.terminalSecondDeriveCalls.length
    },
    sameLine: summarizeMatchBoundary(value.formalSameLineMatch),
    sameGlob: summarizeMatchBoundary(value.formalSameGlobMatch),
    wildcardSource: formalSourceTruth.wildcard,
    wildcardDynamic: value.formalWildcardDecisions.map(({ name, result }) => ({
      name,
      result: result.outcome,
      scanTrace: result.trace.filter(([entry]) => entry === "scan-wildcard"),
      cleanupComplete: result.tracked.arrays.every((entry) => entry.length === 0)
        && result.tracked.buffers.every((entry) => entry.zero)
    }))
  };
  assert.deepEqual(formalIncludeRecord, {
    directoryProxy: {
      result: { ok: false, error: "restricted_identity_rejected" },
      descriptorTrapPositive: true,
      getTrapCount: 0,
      getLengthTrapCount: 0,
      getOtherTrapCount: 0,
      globWorkCount: 0,
      selectedChildOpens: 0,
      rawDirectoryZeroized: true,
      directoryReencodeZeroized: true,
      finalFilesLength: 0,
      finalEventsLength: 0,
      finalActiveLength: 0,
      graphTerminal: true,
      snapshotTerminal: true,
      terminalOutcome: { ok: false, error: "restricted_identity_rejected" },
      terminalAllocationCount: 0,
      terminalCallCount: 0
    },
    sameLine: {
      result: { ok: false, error: "restricted_identity_rejected" },
      file2OperationCalls: 0,
      scanWildcardCalls: 1,
      selectedInsertionReserves: 1,
      includePatternReserves: 2,
      selectedInsertionEvents: 1,
      ownerProvenanceSetCount: 0,
      terminalFollowupExecuted: true,
      terminalFollowupWork: 0,
      graphTerminal: true,
      snapshotTerminal: true,
      cleanupComplete: true
    },
    sameGlob: {
      result: { ok: false, error: "restricted_identity_rejected" },
      file2OperationCalls: 0,
      scanWildcardCalls: 1,
      selectedInsertionReserves: 1,
      includePatternReserves: 1,
      selectedInsertionEvents: 1,
      ownerProvenanceSetCount: 0,
      terminalFollowupExecuted: true,
      terminalFollowupWork: 0,
      graphTerminal: true,
      snapshotTerminal: true,
      cleanupComplete: true
    },
    wildcardSource: {
      signedFinalStart: true,
      singleScalarDecode: true,
      scannerCallCount: 1,
      noPostScannerRescan: true
    },
    wildcardDynamic: [
      { name: "literal", result: { ok: true }, scanTrace: [["scan-wildcard", 12]], cleanupComplete: true },
      { name: "question", result: { ok: true }, scanTrace: [["scan-wildcard", 7]], cleanupComplete: true },
      { name: "star", result: { ok: true }, scanTrace: [["scan-wildcard", 6]], cleanupComplete: true }
    ]
  });
});

test("SSH lexer accepts only the global and Match closed subsets", () => {
  const value = requireC3Symbols(c3VmProbe("lexer"));
  c3AssertSuccess(value.success);
  const assignments = value.success.ownerBeforeDispose.events
    .filter((event) => event.values.kind === "assignment")
    .map((event) => event.values.name);
  assert.deepEqual([...new Set(assignments)].sort(), [...C3_AUTHORITY_DIRECTIVES].sort());
  const physical = value.success.ownerBeforeDispose.events
    .filter((event) => event.values.kind === "physicalDirective")
    .map((event) => event.values.directive);
  for (const directive of C3_OPAQUE_DIRECTIVES) assert.ok(physical.includes(directive), directive);
  const accept = value.success.ownerBeforeDispose.events.filter((event) => event.values.kind === "acceptEnvName");
  assert.deepEqual(accept.map((event) => event.values.valueBytes.knownBytes), [
    { lang: true, lcAll: false },
    { lang: false, lcAll: true }
  ]);
  const payloadOracle = value.payloadOracle;
  c3AssertSuccess(payloadOracle);
  const payloadEvents = payloadOracle.ownerBeforeDispose.events.map((event) => event.values);
  assert.deepEqual(payloadEvents.filter((event) => event.kind === "includePattern")
    .map(({ starIndex, selectedCount }) => ({ starIndex, selectedCount })), [
    { starIndex: 0, selectedCount: 1 }
  ]);
  assert.deepEqual(payloadEvents.filter((event) => event.kind === "matchPattern")
    .map(({ negated, valueBytes, starIndex }) => ({ negated, valueBytes, starIndex })), [
    { negated: false, valueBytes: c3PayloadOracle("alice"), starIndex: -1 },
    { negated: true, valueBytes: c3PayloadOracle("blocked"), starIndex: -1 },
    { negated: false, valueBytes: c3PayloadOracle("a*e?"), starIndex: 1 },
    { negated: false, valueBytes: c3PayloadOracle("ops"), starIndex: -1 }
  ]);
  const forceCommand = payloadEvents.filter((event) => event.kind === "assignment" && event.name === "forcecommand");
  assert.deepEqual(forceCommand.map(({ argumentCount, valueBytes }) => ({ argumentCount, valueBytes })), [
    { argumentCount: 2, valueBytes: c3PayloadOracle("none extra") }
  ]);

  c3AssertSuccess(value.namedMatchConditions);
  c3AssertSuccess(value.allMatchCondition);
  const namedConditions = value.namedMatchConditions.ownerBeforeDispose.events
    .filter((event) => event.values.kind === "matchCondition").map((event) => event.values.name);
  const allConditions = value.allMatchCondition.ownerBeforeDispose.events
    .filter((event) => event.values.kind === "matchCondition").map((event) => event.values.name);
  assert.deepEqual([...namedConditions, ...allConditions], C3_MATCH_CONDITION_NAMES);
  c3AssertFailure(value.unknownMatchCondition);
  assert.deepEqual(value.unknownMatchCondition.calls, c3A1FileOperations("body", "eof"));

  c3AssertSuccess(value.allPrecharge);
  const allPrechargeEvents = value.allPrecharge.ownerBeforeDispose.events.map((event) => event.values);
  assert.deepEqual(allPrechargeEvents.map(({ kind }) => kind), [
    "physicalDirective", "matchBranch", "matchCondition"
  ]);
  assert.deepEqual(allPrechargeEvents.filter(({ kind }) => kind === "matchCondition")
    .map(({ name, patternCount, patternStartEventOrdinal }) => ({ name, patternCount, patternStartEventOrdinal })), [
    { name: "all", patternCount: 0, patternStartEventOrdinal: -1 }
  ]);
  const allPrechargeDerive = c3LifecycleNamedPhase(value.allPrecharge.lifecycle, "derive");
  assert.deepEqual(value.allPrecharge.trace.filter(([name]) => name === "reserve-semantic"), [
    ["reserve-semantic", "sourceFile"],
    ["reserve-semantic", "sshPhysicalDirective"],
    ["reserve-semantic", "sshMatchBranch"],
    ["reserve-semantic", "sshMatchCondition"]
  ]);
  assert.deepEqual(allPrechargeDerive.retentions.map(({ role, reserveOrdinal }) => ({ role, reserveOrdinal })), [
    { role: "sshPhysicalDirective", reserveOrdinal: 1 },
    { role: "sshMatchBranch", reserveOrdinal: 2 },
    { role: "sshMatchCondition", reserveOrdinal: 3 }
  ]);
  const allFirstAllocation = Math.min(...allPrechargeDerive.retentions
    .flatMap((entry) => entry.objectCreateActions));
  assert.ok(allPrechargeDerive.retentions
    .every((entry) => entry.reserveStamp.action < allFirstAllocation));
  assert.equal(new Set(allPrechargeDerive.retentions.map((entry) => JSON.stringify({
    allocations: entry.reserveStamp.allocations,
    copies: entry.reserveStamp.copies,
    pushes: entry.reserveStamp.pushes
  }))).size, 1);

  c3AssertFailure(value.unknownDirective);
  assert.deepEqual(value.unknownDirective.calls, c3A1FileOperations("body", "eof"));
  assert.deepEqual(value.unknownDirective.trace.filter(([name]) => name === "reserve-semantic"), [
    ["reserve-semantic", "sourceFile"],
    ["reserve-semantic", "sshPhysicalDirective"]
  ]);
  const unknownDerive = c3LifecycleNamedPhase(value.unknownDirective.lifecycle, "derive");
  assert.deepEqual(unknownDerive.pushes.filter((entry) => entry.arrayRole === "events")
    .map(({ valueCount, eventKind, eventDirective, eventKeys, eventSymbolCount, eventProxy,
      eventNullPrototype, eventFrozen, eventOrdinal, eventSourceOrdinal, eventLineNumber,
      eventScope, eventBranchOrdinal, eventDescriptorsExact, bufferIds }) => ({
      valueCount,
      eventKind,
      eventDirective,
      eventKeys,
      eventSymbolCount,
      eventProxy,
      eventNullPrototype,
      eventFrozen,
      eventOrdinal,
      eventSourceOrdinal,
      eventLineNumber,
      eventScope,
      eventBranchOrdinal,
      eventDescriptorsExact,
      bufferIds
    })), [
    {
      valueCount: 1,
      eventKind: "physicalDirective",
      eventDirective: "unknown",
      eventKeys: C3_EVENT_SCHEMAS.physicalDirective,
      eventSymbolCount: 0,
      eventProxy: false,
      eventNullPrototype: true,
      eventFrozen: true,
      eventOrdinal: 0,
      eventSourceOrdinal: 0,
      eventLineNumber: 1,
      eventScope: "global",
      eventBranchOrdinal: -1,
      eventDescriptorsExact: true,
      bufferIds: []
    }
  ]);
  assert.deepEqual(unknownDerive.retentions.map((entry) => entry.role), ["sshPhysicalDirective"]);
  assert.deepEqual(value.unknownDirective.terminalSecondDerive,
    { ok: false, error: "restricted_identity_rejected" });
  assert.deepEqual(value.unknownDirective.terminalSecondDeriveAllocations, C2B_ZERO_ALLOCATIONS);
  assert.deepEqual(value.unknownDirective.terminalSecondDeriveCalls, []);
  const ignoredOnly = value.ignoredOnly;
  assert.deepEqual(ignoredOnly.calls, c3A1FileOperations("body", "eof"));
  assert.equal(ignoredOnly.afterDerive.snapshot.fixedEnvelopeCount, 10);
  assert.equal(ignoredOnly.afterDerive.snapshot.semanticNodeCount, 11);
  assert.equal(ignoredOnly.afterDerive.ssh.fixedEnvelopeCount, 2);
  assert.equal(ignoredOnly.afterDerive.ssh.semanticNodeCount, 8);
  assert.equal(ignoredOnly.afterDerive.ssh.sourceFileCount, 1);
  assert.deepEqual({
    physicalDirective: ignoredOnly.afterDerive.ssh.sshPhysicalDirectiveCount,
    includePattern: ignoredOnly.afterDerive.ssh.sshIncludePatternCount,
    selectedInsertion: ignoredOnly.afterDerive.ssh.sshSelectedInsertionCount,
    matchBranch: ignoredOnly.afterDerive.ssh.sshMatchBranchCount,
    matchCondition: ignoredOnly.afterDerive.ssh.sshMatchConditionCount,
    matchPattern: ignoredOnly.afterDerive.ssh.sshMatchPatternCount,
    assignment: ignoredOnly.afterDerive.ssh.sshAssignmentCount,
    acceptEnvName: ignoredOnly.afterDerive.ssh.sshAcceptEnvNameCount
  }, {
    physicalDirective: 0,
    includePattern: 0,
    selectedInsertion: 0,
    matchBranch: 0,
    matchCondition: 0,
    matchPattern: 0,
    assignment: 0,
    acceptEnvName: 0
  });
  assert.equal(ignoredOnly.trace.filter(([name]) => name === "reserve-preimage").length, 1);
  assert.equal(ignoredOnly.trace.filter(([name]) => name === "createHash").length, 2);
  assert.ok(ignoredOnly.tracked.arrays.every((entry) => entry.length === 0));
  assert.ok(ignoredOnly.tracked.buffers.every((entry) => entry.zero));
  c3AssertSuccess(ignoredOnly);
  assert.equal(ignoredOnly.ownerBeforeDispose.files.length, 1);
  assert.equal(ignoredOnly.ownerBeforeDispose.eventCount, 0);
  assert.deepEqual(ignoredOnly.ownerBeforeDispose.activePathRoles, []);
  assert.equal(ignoredOnly.ownerBeforeDispose.closureSha256, ignoredOnly.ownerBeforeDispose.canonicalSha256);
  assert.equal(ignoredOnly.ownerAfterDispose.fileLength, 0);
  assert.equal(ignoredOnly.ownerAfterDispose.eventLength, 0);
  assert.equal(ignoredOnly.ownerAfterDispose.activeLength, 0);
  assert.equal(ignoredOnly.ownerAfterDispose.allBuffersZero, true);
  for (const witness of value.invalid) c3AssertFailure(witness.result);
  c3AssertSuccess(value.line16384);
  c3AssertFailure(value.line16385);
  c3AssertSuccess(value.token4096);
  c3AssertFailure(value.token4097);
  c3AssertSuccess(value.tokens256);
  c3AssertFailure(value.tokens257);
  c3AssertSuccess(value.acceptEnv255);
  c3AssertFailure(value.acceptEnv256);
  c3AssertSuccess(value.precharge);
  const semanticTrace = value.precharge.trace.filter(([name]) => name === "reserve-semantic").map(([, kind]) => kind);
  assert.deepEqual(semanticTrace, [
    "sourceFile",
    "sshPhysicalDirective", "sshIncludePattern", "sshSelectedInsertion",
    "sourceFile", "sshPhysicalDirective",
    "sshPhysicalDirective", "sshMatchBranch", "sshMatchCondition", "sshMatchCondition",
    "sshMatchPattern", "sshMatchPattern", "sshMatchPattern",
    "sshPhysicalDirective", "sshAssignment", "sshAcceptEnvName", "sshAcceptEnvName"
  ]);
  const operationFailureCalls = {
    "post-fstat-drift": c3A1FileOperations("body", "eof"),
    read: c3A1FileOperations("body-failure"),
    close: c3A1FileOperations("body", "eof")
  };
  for (const witness of value.operationFailures) {
    c3AssertA1TerminalFailure(witness, operationFailureCalls[witness.name]);
  }
  assert.deepEqual(Object.keys(runnerModule).sort(), C2B_NATIVE_EXPORTS);
  const formalNameTruth = c3FormalSourceTruth();
  const formalReviewedNameRecord = {
    namesSubstringCallCount: formalNameTruth.namesSubstringCallCount,
    assignmentNamesFixedLowercase: assignments.length > 0
      && assignments.every((name) => name === name.toLowerCase()),
    opaqueDirectiveNamesFixedLowercase: C3_OPAQUE_DIRECTIVES.every((name) => physical.includes(name))
      && physical.every((name) => name === name.toLowerCase()),
    unknownDirectiveValues: unknownDerive.pushes
      .filter((entry) => entry.arrayRole === "events" && entry.eventKind === "physicalDirective")
      .map((entry) => entry.eventDirective)
  };
  assert.deepEqual(formalReviewedNameRecord, {
    namesSubstringCallCount: 0,
    assignmentNamesFixedLowercase: true,
    opaqueDirectiveNamesFixedLowercase: true,
    unknownDirectiveValues: ["unknown"]
  });
});

test("SSH Match derives User Group disposition from shared branded account evidence", () => {
  const value = requireC4Symbols(c3VmProbe("c4-match"));
  assert.equal(value.scenario, "match");
  assert.deepEqual(value.publicArities, { include: 1, coverage: 2, topology: 3 });
  c4AssertDerivedCallSuccess(value.coverage);
  c4AssertCoverageFreezeAudit(value.coverage);
  assert.deepEqual(value.coverage.publicCalls, [
    "coverage", "snapshot", "graph:ssh", "graph:sudo", "deriveSyntax", "derivePolicy",
    "disposePolicy", "disposeSyntax"
  ]);
  c4AssertSingleSshTraversal(value.coverage);
  const coverage = value.coverage.result.value;
  assert.deepEqual(Object.keys(coverage), ["schemaVersion", "type", "username", "groupIds", "branches"]);
  assert.deepEqual(coverage.groupIds, [975, 1100]);
  assert.equal(coverage.branches.length, 17);
  assert.deepEqual(coverage.branches.map((branch) => branch.ordinal), Array.from({ length: 17 }, (_, index) => index));
  assert.deepEqual(coverage.branches.map((branch) => branch.lineNumber), Array.from({ length: 17 }, (_, index) => index + 1));
  assert.deepEqual(coverage.branches.map((branch) => branch.accountDisposition), [
    "exact_user", "exact_user", "exact_user", "disjoint", "disjoint",
    "exact_user", "exact_user", "exact_user", "disjoint", "disjoint",
    "disjoint", "exact_user", "exact_user", "disjoint", "disjoint",
    "disjoint", "disjoint"
  ]);
  for (const branch of coverage.branches) {
    assert.deepEqual(Object.keys(branch), [
      "ordinal", "sourceOrdinal", "lineNumber", "conditions", "accountDisposition", "variableDimensions"
    ]);
    assert.deepEqual(branch.variableDimensions, []);
  }
  assert.deepEqual(coverage.branches[0].conditions, [
    { name: "user", patterns: [{ negated: false, value: "gccgw-japan-repair-ci" }] }
  ]);
  assert.deepEqual(coverage.branches[4].conditions[0].patterns, [
    { negated: false, value: "*" },
    { negated: true, value: "gccgw-japan-repair-ci" }
  ]);
  assert.deepEqual(coverage.branches[3].conditions, [{
    name: "user",
    patterns: [{ negated: true, value: "root" }]
  }]);
  assert.equal(coverage.branches[3].accountDisposition, "disjoint");
  assert.deepEqual(coverage.branches[8].conditions, [{
    name: "group",
    patterns: [{ negated: true, value: "wheel" }]
  }]);
  assert.equal(coverage.branches[8].accountDisposition, "disjoint");
  assert.deepEqual(coverage.branches[9].conditions, [{
    name: "group",
    patterns: [{ negated: false, value: "*" }, { negated: true, value: "ops" }]
  }]);
  assert.deepEqual(coverage.branches[10].conditions, [{
    name: "group",
    patterns: [{ negated: true, value: "ops" }]
  }]);
  assert.equal(coverage.branches[9].accountDisposition, "disjoint");
  assert.equal(coverage.branches[10].accountDisposition, "disjoint");
  assert.deepEqual(coverage.branches[11].conditions.map((condition) => condition.name), ["user", "group"]);
  assert.deepEqual(coverage.branches[12].conditions, [{ name: "all", patterns: [] }]);
  assert.deepEqual(value.coverage.freezeAudit.branches[12].conditions, [{
    frozen: true,
    keys: ["name", "patterns"],
    patternsFrozen: true,
    patterns: []
  }]);
  c4AssertDerivedCallSuccess(value.includeSnapshotSuccess);
  assert.deepEqual(value.includeSnapshotSuccess.publicCalls, [
    "include", "snapshot", "graph:ssh", "graph:sudo", "deriveSyntax", "disposeSyntax"
  ]);
  c4AssertSingleSshTraversal(value.includeSnapshotSuccess);
  c4AssertDerivedCallFailure(value.includeSnapshotFailure);
  assert.deepEqual(value.includeSnapshotFailure.publicCalls, [
    "include", "snapshot", "graph:ssh", "graph:sudo", "deriveSyntax"
  ]);
  const {
    beforeLifecycle: includeBeforeLifecycle, afterLifecycle: includeAfterLifecycle,
    beforeState: includeBeforeState, afterState: includeAfterState, ...includeTerminalFollowUp
  } = value.includeSnapshotFailure.terminalFollowUp;
  assert.deepEqual(includeTerminalFollowUp, {
    ok: false,
    error: "restricted_identity_rejected",
    allocations: C2B_ZERO_ALLOCATIONS,
    operationCalls: 0,
    trackedBuffersZero: true
  });
  assert.deepEqual(includeAfterLifecycle, includeBeforeLifecycle);
  assert.deepEqual(includeAfterState, includeBeforeState);
  c4AssertSingleSshTraversal(value.includeSnapshotFailure);
  c4AssertDerivedCallFailure(value.coverageSnapshotFailure);
  assert.deepEqual(value.coverageSnapshotFailure.publicCalls, [
    "coverage", "snapshot", "graph:ssh", "graph:sudo", "deriveSyntax"
  ]);
  const {
    beforeLifecycle: coverageBeforeLifecycle, afterLifecycle: coverageAfterLifecycle,
    beforeState: coverageBeforeState, afterState: coverageAfterState, ...coverageTerminalFollowUp
  } = value.coverageSnapshotFailure.terminalFollowUp;
  assert.deepEqual(coverageTerminalFollowUp, {
    ok: false,
    error: "restricted_identity_rejected",
    allocations: C2B_ZERO_ALLOCATIONS,
    operationCalls: 0,
    trackedBuffersZero: true
  });
  assert.deepEqual(coverageAfterLifecycle, coverageBeforeLifecycle);
  assert.deepEqual(coverageAfterState, coverageBeforeState);
  c4AssertSingleSshTraversal(value.coverageSnapshotFailure);
  c4AssertDerivedCallSuccess(value.independent);
  assert.deepEqual(value.independent.result.value.groupIds, [975, 2200]);
  assert.equal(value.independent.result.value.branches[0].accountDisposition, "exact_user");
  c4AssertDerivedCallSuccess(value.numericName);
  assert.deepEqual(value.numericName.result.value.groupIds, [975, 2200]);
  assert.equal(value.numericName.result.value.branches[0].accountDisposition, "exact_user");
  c4AssertDerivedCallSuccess(value.nestedInclude.coverage);
  c4AssertCoverageFreezeAudit(value.nestedInclude.coverage);
  assert.deepEqual(value.nestedInclude.coverage.result.value, value.nestedInclude.oracle);
  assert.equal(value.nestedInclude.actualSha256, value.nestedInclude.oracleSha256);
  assert.deepEqual(value.nestedInclude.coverage.result.value.branches.map((branch) => branch.ordinal), [0, 1, 2, 3, 4]);
  assert.deepEqual(value.nestedInclude.coverage.result.value.branches.map((branch) => branch.sourceOrdinal), [2, 2, 1, 1, 0]);
  assert.deepEqual(value.nestedInclude.coverage.result.value.branches.map((branch) => branch.lineNumber), [1, 2, 2, 3, 2]);
  assert.deepEqual(value.nestedInclude.coverage.result.value.branches.map((branch) => branch.accountDisposition), [
    "exact_user", "exact_user", "exact_user", "disjoint", "disjoint"
  ]);
  assert.deepEqual(value.nestedInclude.coverage.calls.filter(([name]) => name === "open").map(([, role]) => role), [
    "file-0", "file-1", "file-2"
  ]);
  assert.equal(value.nestedInclude.coverage.calls.filter(([name]) => name === "readDirectory").length, 0);
  assert.equal(value.nestedInclude.coverage.calls.filter(([name]) => name === "validateSudoers").length, 0);
  assert.deepEqual(value.nestedInclude.coverage.accountReads, ["gccgw-japan-repair-ci", "gccgw-japan-repair-ci"]);
  for (const attempt of value.privateAttempts) {
    assert.equal(attempt.injectedOperationDelta, 0, attempt.kind);
    assert.equal(attempt.trackedBuffersZero, true, attempt.kind);
    const policyAsSyntax = attempt.kind === "live-policy-as-syntax"
      || attempt.kind === "disposed-policy-as-syntax";
    if (policyAsSyntax) {
      assert.deepEqual(attempt.setupPolicy, { ok: true, error: null }, attempt.kind);
      assert.ok(attempt.comparisonBefore > 0, attempt.kind);
      assert.deepEqual(attempt.setupPolicyDispose, attempt.kind === "disposed-policy-as-syntax"
        ? { ok: true, error: null }
        : null, attempt.kind);
    } else {
      assert.equal(attempt.comparisonBefore, 0, attempt.kind);
    }
    if (attempt.kind === "reused-owner") {
      assert.equal(attempt.attempted.ok, true);
      assert.equal(attempt.rawErrorAudit, null);
      assert.deepEqual(attempt.reused && { ok: attempt.reused.ok, error: attempt.reused.error },
        { ok: false, error: "restricted_identity_rejected" });
      assert.deepEqual(attempt.reused.rawErrorAudit,
        c4ExpectedRestrictedRawErrorAudit(null));
      assert.deepEqual(attempt.reused.allocations, C2B_ZERO_ALLOCATIONS);
      assert.equal(attempt.reusedComparisonDelta, 0);
      assert.equal(attempt.reusedOperationDelta, 0);
      assert.equal(attempt.terminal, true);
      assert.deepEqual(attempt.terminalFollowUp, {
        ok: false,
        error: "restricted_identity_rejected",
        allocations: C2B_ZERO_ALLOCATIONS,
        calls: 0
      });
    } else {
      assert.deepEqual({ ok: attempt.attempted.ok, error: attempt.attempted.error },
        { ok: false, error: "restricted_identity_rejected" }, attempt.kind);
      assert.deepEqual(attempt.rawErrorAudit,
        c4ExpectedRestrictedRawErrorAudit(null), attempt.kind);
      assert.deepEqual(attempt.allocations, C2B_ZERO_ALLOCATIONS, attempt.kind);
      assert.equal(attempt.comparisonDelta, 0, attempt.kind);
      assert.equal(attempt.comparisonAfterAttempt, attempt.comparisonBefore, attempt.kind);
      assert.equal(attempt.comparisonAfter, attempt.comparisonBefore, attempt.kind);
      assert.deepEqual(attempt.terminalFollowUp, {
        ok: false,
        error: "restricted_identity_rejected",
        allocations: C2B_ZERO_ALLOCATIONS,
        calls: 0
      }, attempt.kind);
    }
  }
  assert.deepEqual(value.nativePolicy.syntax, { ok: true });
  assert.deepEqual(value.nativePolicy.policy, { ok: true, error: null });
  assert.deepEqual(value.nativePolicy.disposePolicy, { ok: true, error: null });
  assert.deepEqual(value.nativePolicy.disposeSyntax, { ok: true, error: null });
  assert.equal(value.nativePolicy.authorizationEntryCount, 0);
  assert.equal(value.nativePolicy.terminal, false);
  assert.deepEqual(value.nativePolicy.nativeAccount, {
    outputCount: 6,
    outputZeroized: true,
    openCount: 6,
    spawnCount: 6
  });
  assert.deepEqual(value.nativeNumericPolicy.syntax, { ok: true });
  assert.deepEqual(value.nativeNumericPolicy.policy, { ok: true, error: null });
  assert.deepEqual(value.nativeNumericPolicy.disposePolicy, { ok: true, error: null });
  assert.deepEqual(value.nativeNumericPolicy.disposeSyntax, { ok: true, error: null });
  assert.equal(value.nativeNumericPolicy.authorizationEntryCount, 0);
  assert.equal(value.nativeNumericPolicy.terminal, false);
  assert.deepEqual(value.nativeNumericPolicy.nativeAccount, {
    outputCount: 6,
    outputZeroized: true,
    openCount: 6,
    spawnCount: 6
  });
  assert.deepEqual(value.shapeWitnesses.map((witness) => witness.name), [
    "include-old-caller-record",
    "include-missing-input",
    "include-top-missing",
    "include-top-extra",
    "include-path-extra",
    "include-source-extra",
    "include-overload",
    "coverage-unbranded-plain",
    "topology-unbranded-plain",
    "coverage-unbranded-clone",
    "topology-unbranded-clone",
    "coverage-frozen-lookalike",
    "topology-frozen-lookalike",
    "coverage-unbranded-proxy",
    "topology-unbranded-proxy",
    "coverage-native-account",
    "topology-native-account",
    "coverage-missing-input",
    "coverage-swapped",
    "coverage-binding-in-input",
    "coverage-old-caller-record-in-input",
    "coverage-top-missing",
    "coverage-top-extra",
    "coverage-path-extra",
    "coverage-source-extra",
    "coverage-overload",
    "topology-missing-binding",
    "topology-missing-input",
    "topology-input-in-binding",
    "topology-binding-in-input",
    "topology-binding-input-swapped",
    "topology-old-binding-record",
    "topology-old-caller-record-in-input",
    "topology-top-extra",
    "topology-path-extra",
    "topology-source-extra",
    "topology-overload",
    "topology-binding-null",
    "topology-binding-missing-authorization",
    "topology-binding-missing-nested",
    "topology-binding-top-extra",
    "topology-binding-nested-extra",
    "topology-binding-top-proxy",
    "topology-binding-nested-proxy"
  ]);
  for (const witness of value.shapeWitnesses) {
    assert.deepEqual({ ok: witness.ok, error: witness.error, calls: witness.calls }, {
      ok: false,
      error: "restricted_identity_rejected",
      calls: 0
    }, witness.name);
    assert.deepEqual(witness.allocations, C2B_ZERO_ALLOCATIONS, witness.name);
    const expectedPublicCall = witness.name.startsWith("include-")
      ? "include"
      : witness.name.startsWith("coverage-")
        ? "coverage"
        : "topology";
    assert.deepEqual(witness.publicCalls, [expectedPublicCall], witness.name);
    assert.equal(witness.contractErrorEvents.length >= 1, true, witness.name);
    assert.equal(witness.rawErrorAudit.contractErrorOrdinal,
      witness.contractErrorEvents.at(-1).ordinal, witness.name);
    assert.deepEqual(witness.rawErrorAudit,
      c4ExpectedRestrictedRawErrorAudit(witness.contractErrorEvents.at(-1).ordinal), witness.name);
    if (witness.proxyCounters !== null) {
      assert.deepEqual(witness.proxyCounters, {
        get: 0,
        ownKeys: 0,
        getOwnPropertyDescriptor: 0,
        getPrototypeOf: 0
      }, witness.name);
    }
  }
  assert.equal(value.lifecycle.syntax.ok, true);
  assert.equal(value.lifecycle.derive.ok, true);
  assert.deepEqual(value.lifecycle.disposePolicy && {
    ok: value.lifecycle.disposePolicy.ok,
    error: value.lifecycle.disposePolicy.error
  }, { ok: true, error: null });
  assert.deepEqual({ ok: value.lifecycle.disposeSyntax.ok, error: value.lifecycle.disposeSyntax.error },
    { ok: true, error: null });
  assert.equal(value.lifecycle.afterDerive.snapshot.authorizationEntryCount, 0);
  assert.equal(value.lifecycle.afterDerive.snapshot.failed, false);
  assert.equal(value.lifecycle.afterDispose.snapshot.authorizationEntryCount, 0);
  assert.equal(value.lifecycle.afterDispose.snapshot.failed, false);
  assert.deepEqual(value.lifecycle.provenance, {
    afterDerive: {
      registryObserved: true,
      registryStable: true,
      policyIdentified: true,
      syntaxPolicyDistinct: true,
      returnedPolicyIdentity: true,
      syntax: { present: true, sameGraph: true },
      policy: { present: true, sameGraph: true },
      snapshot: { present: false, sameGraph: false }
    },
    afterPolicyDispose: {
      registryObserved: true,
      registryStable: true,
      policyIdentified: true,
      syntaxPolicyDistinct: true,
      returnedPolicyIdentity: true,
      syntax: { present: true, sameGraph: true },
      policy: { present: false, sameGraph: false },
      snapshot: { present: false, sameGraph: false }
    },
    afterDispose: {
      registryObserved: true,
      registryStable: true,
      policyIdentified: true,
      syntaxPolicyDistinct: true,
      returnedPolicyIdentity: true,
      syntax: { present: false, sameGraph: false },
      policy: { present: false, sameGraph: false },
      snapshot: { present: false, sameGraph: false }
    }
  });
  assert.deepEqual(value.lifecycle.lifecycle.phases.map((phase) => phase.name), [
    "derivePolicy", "disposePolicy", "disposeSyntax"
  ]);
  const lifecycleRegistry = value.lifecycle.lifecycle.phases.flatMap((phase) =>
    phase.registry
      .filter((entry) => entry.keyIdentity !== undefined)
      .map((entry) => [phase.name, entry.method, entry.keyIdentity, entry.sameGraph]));
  assert.deepEqual(lifecycleRegistry, [
    ["derivePolicy", "get", "syntax", true],
    ["derivePolicy", "set", "policy", true],
    ["disposePolicy", "get", "policy", true],
    ["disposePolicy", "delete", "policy", true],
    ["disposeSyntax", "get", "syntax", true],
    ["disposeSyntax", "delete", "syntax", true]
  ]);
  assert.equal(lifecycleRegistry.filter(([, method]) => method === "get").length, 3);
  assert.equal(lifecycleRegistry.filter(([, method]) => method === "set").length, 1);
  assert.equal(lifecycleRegistry.filter(([, method]) => method === "delete").length, 2);
  assert.equal(lifecycleRegistry.some(([, , identity]) => identity === "snapshot"), false);
  assert.deepEqual(value.lifecycle.derive.forbiddenAllocations, {
    map: 0,
    set: 0,
    weakMap: 0,
    weakSet: 0,
    bufferFrom: 0,
    textEncoder: 0,
    textEncode: 0,
    jsonStringify: 0,
    jsonParse: 0
  });
  assert.ok(value.lifecycle.derive.trackedBufferCount > 0);
  const calibration = value.lifecycleCalibration;
  assert.equal(calibration.fixedReserves.length, 7);
  assert.equal(calibration.fixedCompletions.length, calibration.fixedReserves.length);
  assert.deepEqual(calibration.fixedReserves.map((entry) => entry.ordinal),
    Array.from({ length: calibration.fixedReserves.length }, (_, index) => index + 1));
  assert.deepEqual(calibration.fixedCompletions.map((entry) => entry.ordinal),
    calibration.fixedReserves.map((entry) => entry.ordinal));
  assert.deepEqual(calibration.fixedCompletions.map((entry) => entry.kind), [
    "objectCreate", "objectCreate", "array", "array",
    "objectCreate", "objectCreate", "objectCreate"
  ]);
  assert.equal(calibration.semanticReserves, 0);
  for (let index = 0; index < calibration.fixedReserves.length; index += 1) {
    const reserve = calibration.fixedReserves[index];
    const completion = calibration.fixedCompletions[index];
    assert.ok(reserve.action < completion.action, `fixed envelope ${reserve.ordinal}`);
    assert.ok(completion.allocationOrdinal > 0, `fixed envelope ${reserve.ordinal}`);
    assert.ok(["objectCreate", "array"].includes(completion.kind), `fixed envelope ${reserve.ordinal}`);
  }
  assert.equal(calibration.preimages.length, 1);
  assert.equal(calibration.preimagePendingCount, 0);
  for (const preimage of calibration.preimages) {
    assert.equal(preimage.reservedLength, calibration.coverageOracle.length);
    assert.equal(preimage.requestedLength, calibration.coverageOracle.length);
    assert.equal(preimage.actualLength, calibration.coverageOracle.length);
    assert.equal(Number.isSafeInteger(preimage.byteId), true);
    assert.equal(preimage.allocationKind, "bufferAlloc");
    assert.equal(preimage.firstAllocationAfterReserve, true);
    assert.equal(preimage.claimedAsPreimage, true);
    assert.equal(preimage.orphan, false);
    assert.ok(preimage.reserveAction < preimage.allocationAction);
    assert.ok(preimage.allocationAction < preimage.hashAction);
    assert.ok(preimage.hashAction < preimage.fillAction);
    assert.equal(preimage.fullSpanHashCount, 1);
    assert.deepEqual(preimage.hashSpans.map(({ byteId, length, sha256 }) => ({ byteId, length, sha256 })), [{
      byteId: preimage.byteId,
      length: calibration.coverageOracle.length,
      sha256: calibration.coverageOracle.sha256
    }]);
    assert.equal(preimage.zeroFillCount, 1);
    assert.equal(preimage.zero, true);
  }
  assert.ok(calibration.hashes > 0);
  assert.ok(calibration.fills > 0);
  assert.ok(value.faultMatrix.length >= calibration.fixedReserves.length + 3);
  for (const witness of value.faultMatrix) {
    assert.equal(witness.setupFailed, false, JSON.stringify(witness.fault));
    assert.equal(witness.faultTriggered, true, JSON.stringify(witness.fault));
    assert.deepEqual(witness.result, {
      ok: false,
      error: "restricted_identity_rejected"
    }, JSON.stringify(witness.fault));
    assert.deepEqual(witness.rawErrorAudit,
      c4ExpectedRestrictedRawErrorAudit(null), JSON.stringify(witness.fault));
    assert.deepEqual(witness.forbiddenAllocations, {
      map: 0,
      set: 0,
      weakMap: 0,
      weakSet: 0,
      bufferFrom: 0,
      textEncoder: 0,
      textEncode: 0,
      jsonStringify: 0,
      jsonParse: 0
    }, JSON.stringify(witness.fault));
    assert.equal(witness.provenance.policy.present, false, JSON.stringify(witness.fault));
    assert.deepEqual(witness.syntaxCleanup, {
      ok: true,
      error: null,
      trackedBuffersZero: true
    }, JSON.stringify(witness.fault));
    assert.equal(witness.graphFailed, true, JSON.stringify(witness.fault));
    assert.equal(witness.snapshotFailed, true, JSON.stringify(witness.fault));
    assert.equal(witness.authorizationEntryCount, 0, JSON.stringify(witness.fault));
    assert.equal(witness.trackedBuffersZero, true, JSON.stringify(witness.fault));
    assert.equal(witness.buffersZero, true, JSON.stringify(witness.fault));
    assert.equal(witness.preimagePendingCount, 0, JSON.stringify(witness.fault));
    for (const preimage of witness.preimages) {
      assert.equal(preimage.zero, true, JSON.stringify(witness.fault));
      if (preimage.hashAction !== null && preimage.fillAction !== null) {
        assert.ok(preimage.reserveAction < preimage.allocationAction, JSON.stringify(witness.fault));
        assert.ok(preimage.allocationAction < preimage.hashAction, JSON.stringify(witness.fault));
        assert.ok(preimage.hashAction < preimage.fillAction, JSON.stringify(witness.fault));
      }
    }
    assert.deepEqual(witness.followUp, {
      ok: false,
      error: "restricted_identity_rejected",
      allocations: C2B_ZERO_ALLOCATIONS,
      calls: 0,
      trackedBuffersZero: true
    }, JSON.stringify(witness.fault));
  }
  const ambiguity = value.disposeAmbiguity;
  assert.equal(ambiguity.setupFailed, false);
  assert.equal(ambiguity.faultTriggered, true);
  assert.deepEqual(ambiguity.result, { ok: false, error: "restricted_identity_rejected" });
  assert.deepEqual(ambiguity.rawErrorAudit, c4ExpectedRestrictedRawErrorAudit(null));
  assert.deepEqual(ambiguity.provenanceAfterDelete.policy, { present: false, sameGraph: false });
  assert.deepEqual(ambiguity.provenanceAfterDelete.syntax, { present: true, sameGraph: true });
  assert.deepEqual(ambiguity.provenanceAfterCleanup.policy, { present: false, sameGraph: false });
  assert.deepEqual(ambiguity.provenanceAfterCleanup.syntax, { present: false, sameGraph: false });
  assert.deepEqual(ambiguity.syntaxCleanup, { ok: true, error: null, trackedBuffersZero: true });
  assert.equal(ambiguity.graphFailed, true);
  assert.equal(ambiguity.snapshotFailed, true);
  assert.equal(ambiguity.authorizationEntryCount, 0);
  assert.equal(ambiguity.buffersZero, true);
  assert.deepEqual(ambiguity.followUp, {
    ok: false,
    error: "restricted_identity_rejected",
    allocations: C2B_ZERO_ALLOCATIONS,
    calls: 0,
    trackedBuffersZero: true
  });
  assert.deepEqual(value.disposeMatrix.map((entry) => entry.kind), [
    "plain", "clone", "proxy", "syntax-as-policy",
    "wrong-graph", "foreign", "disposed", "double"
  ]);
  for (const witness of value.disposeMatrix) {
    assert.equal(witness.setupFailed, false, witness.kind);
    if (witness.kind === "disposed" || witness.kind === "double") {
      assert.deepEqual(witness.preDispose, { ok: true, error: null }, witness.kind);
    } else {
      assert.equal(witness.preDispose, null, witness.kind);
    }
    assert.deepEqual(witness.attempted,
      { ok: false, error: "restricted_identity_rejected" }, witness.kind);
    assert.deepEqual(witness.rawErrorAudit,
      c4ExpectedRestrictedRawErrorAudit(null), witness.kind);
    assert.deepEqual(witness.allocations, C2B_ZERO_ALLOCATIONS, witness.kind);
    assert.equal(witness.trackedBuffersZero, true, witness.kind);
    assert.equal(witness.operationDelta, 0, witness.kind);
    assert.equal(witness.terminal, true, witness.kind);
    assert.deepEqual(witness.followUp, {
      ok: false,
      error: "restricted_identity_rejected",
      allocations: C2B_ZERO_ALLOCATIONS,
      calls: 0
    }, witness.kind);
    assert.ok(witness.cleanup.length >= 1, witness.kind);
    assert.ok(witness.cleanup.every((entry) => entry.ok === true && entry.error === null), witness.kind);
  }
  assert.deepEqual({
    ok: value.budget.userOrdering.policy.ok,
    error: value.budget.userOrdering.policy.error,
    comparisons: value.budget.userOrdering.comparisons,
    attempts: value.budget.userOrdering.attempts,
    reservations: value.budget.userOrdering.reservations,
    completions: value.budget.userOrdering.completions,
    reserveThrows: value.budget.userOrdering.reserveThrows,
    reserveBeforeComplete: value.budget.userOrdering.reserveBeforeComplete,
    matcherAttempts: value.budget.userOrdering.matcherAttempts,
    matcherCompletions: value.budget.userOrdering.matcherCompletions,
    matcherThrows: value.budget.userOrdering.matcherThrows,
    matcherOrderingValid: value.budget.userOrdering.matcherOrderingValid,
    wildcardInvocations: value.budget.userOrdering.wildcardInvocations,
    terminal: value.budget.userOrdering.terminal
  }, {
    ok: true,
    error: null,
    comparisons: 2,
    attempts: 2,
    reservations: 2,
    completions: 2,
    reserveThrows: 0,
    reserveBeforeComplete: true,
    matcherAttempts: 2,
    matcherCompletions: 2,
    matcherThrows: 0,
    matcherOrderingValid: true,
    wildcardInvocations: 2,
    terminal: false
  });
  assert.deepEqual(value.budget.userOrdering.matcherLedger, [
    { sequence: 1, phase: "matcherAttempt", kind: "sshMatch", attempts: 1, completions: 0 },
    { sequence: 2, phase: "reserveAttempt", kind: "sshMatch", attempts: 1, reservations: 1, completions: 0 },
    { sequence: 3, phase: "reserveComplete", kind: "sshMatch", attempts: 1, reservations: 1, completions: 1 },
    { sequence: 4, phase: "matcherComplete", kind: "sshMatch", attempts: 1, completions: 1 },
    { sequence: 5, phase: "matcherAttempt", kind: "sshMatch", attempts: 2, completions: 1 },
    { sequence: 6, phase: "reserveAttempt", kind: "sshMatch", attempts: 2, reservations: 2, completions: 1 },
    { sequence: 7, phase: "reserveComplete", kind: "sshMatch", attempts: 2, reservations: 2, completions: 2 },
    { sequence: 8, phase: "matcherComplete", kind: "sshMatch", attempts: 2, completions: 2 }
  ]);
  assert.deepEqual(value.budget.maximum, {
    ok: true,
    error: null,
    comparisons: 131072,
    attempts: 131072,
    reservations: 131072,
    completions: 131072,
    reserveThrows: 0,
    reserveBeforeComplete: true,
    matcherAttempts: 131072,
    matcherCompletions: 131072,
    matcherThrows: 0,
    matcherOrderingValid: true,
    wildcardInvocations: 131072,
    wildcardAlignedComparisons: 270336,
    fixedEnvelopes: 17,
    semanticReserves: 0,
    traceLength: 0,
    terminal: false
  });
  assert.deepEqual({
    ok: value.budget.overflow.ok,
    error: value.budget.overflow.error,
    comparisons: value.budget.overflow.comparisons,
    attempts: value.budget.overflow.attempts,
    reservations: value.budget.overflow.reservations,
    completions: value.budget.overflow.completions,
    reserveThrows: value.budget.overflow.reserveThrows,
    reserveBeforeComplete: value.budget.overflow.reserveBeforeComplete,
    matcherAttempts: value.budget.overflow.matcherAttempts,
    matcherCompletions: value.budget.overflow.matcherCompletions,
    matcherThrows: value.budget.overflow.matcherThrows,
    matcherOrderingValid: value.budget.overflow.matcherOrderingValid,
    wildcardInvocations: value.budget.overflow.wildcardInvocations,
    wildcardAlignedComparisons: value.budget.overflow.wildcardAlignedComparisons,
    semanticReserves: value.budget.overflow.semanticReserves,
    traceLength: value.budget.overflow.traceLength,
    terminal: value.budget.overflow.terminal,
    followUp: value.budget.overflow.followUp
  }, {
    ok: false,
    error: "restricted_identity_rejected",
    comparisons: 131072,
    attempts: 131073,
    reservations: 131073,
    completions: 131072,
    reserveThrows: 1,
    reserveBeforeComplete: true,
    matcherAttempts: 131073,
    matcherCompletions: 131072,
    matcherThrows: 1,
    matcherOrderingValid: true,
    wildcardInvocations: 131072,
    wildcardAlignedComparisons: 271462,
    semanticReserves: 0,
    traceLength: 0,
    terminal: true,
    followUp: {
      ok: false,
      error: "restricted_identity_rejected",
      allocations: C2B_ZERO_ALLOCATIONS,
      calls: 0
    }
  });
  assert.deepEqual({
    attempts: value.budget.overflow.lastAttemptStamp.attempts,
    reservations: value.budget.overflow.lastAttemptStamp.reservations,
    completions: value.budget.overflow.lastAttemptStamp.completions
  }, { attempts: 131073, reservations: 131073, completions: 131072 });
  assert.deepEqual({
    allocations: value.budget.overflow.lastAttemptStamp.allocations,
    pushes: value.budget.overflow.lastAttemptStamp.pushes,
    preimages: value.budget.overflow.lastAttemptStamp.preimages,
    hashes: value.budget.overflow.lastAttemptStamp.hashes
  }, {
    allocations: value.budget.overflow.finalStamp.allocations,
    pushes: value.budget.overflow.finalStamp.pushes,
    preimages: 0,
    hashes: value.budget.overflow.finalStamp.hashes
  });
});

test("SSH Match rejects potentially applicable variable dimensions", () => {
  const value = requireC4Symbols(c3VmProbe("c4-variable"));
  assert.equal(value.scenario, "variable");
  c4AssertDerivedCallSuccess(value.disjoint);
  const branch = value.disjoint.result.value.branches[0];
  assert.equal(branch.accountDisposition, "disjoint");
  assert.deepEqual(branch.variableDimensions, value.fixedOrder);
  assert.deepEqual(branch.conditions.map((condition) => condition.name), [
    "user", "localnetwork", "rdomain", "localport", "localaddress", "address", "host"
  ]);
  for (const result of [value.matching, value.variableOnly, ...value.individual.map((entry) => entry.result)]) {
    c4AssertDerivedCallFailure(result);
  }
  assert.deepEqual(value.individual.map((entry) => entry.name), value.fixedOrder);
  assert.equal(value.privateDisjoint.policy.ok, true);
  assert.equal(value.privateDisjoint.terminal, false);
  for (const result of [
    value.privateMatching,
    value.privateVariableOnly,
    ...value.individual.map((entry) => entry.privateMatching)
  ]) {
    assert.deepEqual(result.policy, { ok: false, error: "restricted_identity_rejected" });
    assert.equal(result.terminal, true);
    assert.equal(result.comparisons <= 131072, true);
    assert.deepEqual(result.followUp, {
      ok: false,
      error: "restricted_identity_rejected",
      allocations: C2B_ZERO_ALLOCATIONS,
      calls: 0
    });
  }
  for (const entry of value.individual) {
    c4AssertDerivedCallSuccess(entry.disjoint);
    assert.equal(entry.disjoint.result.value.branches[0].accountDisposition, "disjoint");
    assert.deepEqual(entry.disjoint.result.value.branches[0].variableDimensions, [entry.name]);
    assert.equal(entry.privateDisjoint.policy.ok, true);
    assert.equal(entry.privateDisjoint.terminal, false);
  }
});

test("SSH effective values use Match first then global then frozen default", () => {
  const value = requireC4Symbols(c3VmProbe("c4-effective"));
  assert.equal(value.scenario, "effective");
  for (const probe of [
    value.repeatedGlobal,
    value.matchWins,
    value.multipleMatch,
    value.fallback,
    value.defaults,
    value.disjointIgnore,
    value.disjointThenExactSafe,
    value.sameExactSafeFirst,
    value.matchAll,
    value.kbdAlias
  ]) c4AssertTopologySuccess(probe);
  c4AssertTopologyFailure(value.kbdAliasReject, value.sourceFailureAudit);
  c4AssertTopologyFailure(value.disjointThenExactUnsafe, value.sourceFailureAudit);
  c4AssertTopologyFailure(value.acceptEnv[0], value.sourceFailureAudit);
  c4AssertTopologyFailure(value.acceptEnv[1], value.sourceFailureAudit);
  c4AssertTopologySuccess(value.acceptEnv[2]);
  assert.deepEqual(value.defaults.topology.result.value, {
    ...value.defaults.expected,
    pubkeyAuthentication: true,
    hostbasedAuthentication: false,
    gssapiAuthentication: false,
    kerberosAuthentication: false,
    permitUserEnvironment: false,
    permitTunnel: false
  });
  assert.equal(value.kbdAlias.topology.result.value.keyboardInteractiveAuthentication, false);
  assert.deepEqual(value.disjointThenExactSafe.topology.result.value.passwordAuthentication, false);
  assert.deepEqual(value.sameExactSafeFirst.topology.result.value.passwordAuthentication, false);
  c4AssertDerivedCallSuccess(value.disjointIgnoreCoverage);
  c4AssertDerivedCallSuccess(value.matchAllCoverage);
  assert.deepEqual(value.disjointIgnoreCoverage.result.value.branches.map((entry) => entry.accountDisposition), ["disjoint"]);
  assert.deepEqual(value.matchAllCoverage.result.value.branches[0].conditions, [{ name: "all", patterns: [] }]);
});

test("SSH topology rejects alternate authentication environment command chroot forwarding tunnel and key sources", () => {
  const value = requireC4Symbols(c3VmProbe("c4-topology"));
  assert.equal(value.scenario, "topology");
  c4AssertTopologySuccess(value.positive);
  c4AssertTopologySuccess(value.secondPositive);
  assert.notEqual(value.secondPositive.bindingDigests.line, value.positive.bindingDigests.line);
  assert.notEqual(value.secondPositive.bindingDigests.blob, value.positive.bindingDigests.blob);
  assert.equal(value.secondPositive.bindingDigests.effective, value.positive.bindingDigests.effective);
  assert.deepEqual(value.secondPositive.topology.result.value, value.positive.topology.result.value);
  assert.deepEqual(Object.keys(value.positive.topology.result.value), C4_TOPOLOGY_KEYS);
  assert.deepEqual(value.directiveMatchMatrix.map((entry) => entry.name), value.sourceFailures.slice(0, 18)
    .map((entry) => entry.name));
  for (const witness of value.directiveMatchMatrix) {
    c4AssertDerivedCallSuccess(witness.applicable.coverage);
    c4AssertCoverageFreezeAudit(witness.applicable.coverage);
    assert.equal(witness.applicable.coverage.result.value.branches.length, 1, witness.name);
    assert.equal(witness.applicable.coverage.result.value.branches[0].accountDisposition, "exact_user", witness.name);
    assert.deepEqual(witness.applicable.coverage.result.value.branches[0].conditions, [{
      name: "user",
      patterns: [{ negated: false, value: "gccgw-japan-repair-ci" }]
    }], witness.name);
    c4AssertTopologyFailure(witness.applicable.probe, witness.applicable.failureAudit);
    assert.equal(witness.applicable.probe.topology.publicAudit.verifyAttempts, 0, witness.name);
    assert.equal(witness.applicable.probe.topology.publicCalls.includes("verify"), false, witness.name);

    c4AssertDerivedCallSuccess(witness.disjoint.coverage);
    c4AssertCoverageFreezeAudit(witness.disjoint.coverage);
    assert.equal(witness.disjoint.coverage.result.value.branches.length, 1, witness.name);
    assert.equal(witness.disjoint.coverage.result.value.branches[0].accountDisposition, "disjoint", witness.name);
    assert.deepEqual(witness.disjoint.coverage.result.value.branches[0].conditions, [{
      name: "user",
      patterns: [{ negated: false, value: "root" }]
    }], witness.name);
    c4AssertTopologySuccess(witness.disjoint.probe);
    assert.equal(witness.disjoint.probe.topology.publicAudit.verifyAttempts, 1, witness.name);
    assert.equal(witness.disjoint.probe.topology.publicAudit.verifySuccesses, 1, witness.name);
  }
  for (const witness of [
    ...value.sourceFailures,
    ...value.authFailures,
    ...value.metadataFailures,
    ...value.ancestorFailures,
    ...value.operationFailures,
    ...value.bindingDrifts
  ]) c4AssertTopologyFailure(witness.probe, witness.failureAudit, witness.name);
  const snapshotMutation = value.bindingSnapshotMutation;
  assert.equal(snapshotMutation.probe.bindingMutationCount, 1);
  assert.notEqual(snapshotMutation.probe.initialBindingDigests.line,
    snapshotMutation.probe.bindingDigests.line);
  assert.notEqual(snapshotMutation.probe.initialBindingDigests.blob,
    snapshotMutation.probe.bindingDigests.blob);
  assert.equal(snapshotMutation.probe.initialBindingDigests.effective,
    snapshotMutation.probe.bindingDigests.effective);
  c4AssertTopologyFailure(
    snapshotMutation.probe,
    snapshotMutation.failureAudit,
    "binding-snapshot-mutation"
  );
  for (const witness of value.streamingSuccesses) c4AssertTopologySuccess(witness.probe, {
    strictReads: false,
    expectedAuthReadStages: witness.expectedAuthReadStages
  });
  assert.deepEqual(value.sourceFailures.map((entry) => entry.name), [
    "authenticationmethods", "pubkeyauthentication", "passwordauthentication",
    "kbdinteractiveauthentication", "hostbasedauthentication", "gssapiauthentication",
    "kerberosauthentication", "permituserenvironment", "acceptenv", "forcecommand",
    "chrootdirectory", "disableforwarding", "permittunnel", "authorizedkeysfile",
    "authorizedkeyscommand", "authorizedprincipalsfile", "authorizedprincipalscommand",
    "trustedusercakeys", "missing-authentication-methods", "authenticationmethods-publickey-password",
    "authenticationmethods-publickey-keyboard", "authenticationmethods-multiple-alternatives",
    "authenticationmethods-password-keyboard", "missing-password-authentication",
    "missing-keyboard-interactive", "challenge-response-authentication",
    "missing-disable-forwarding", "missing-authorized-keys", "two-authorized-keys"
  ]);
  assert.deepEqual(value.authFailures.map((entry) => entry.name), [
    "empty", "blank", "comment", "blank-prefix", "blank-suffix", "comment-prefix", "comment-suffix",
    "missing-lf", "folded", "second-active", "duplicate-target", "alternate-key",
    "bad-option-order", "unknown-option", "escape-drift", "noncanonical-base64",
    "base64-aligned-extra-padding", "wrong-line-algorithm", "wrong-wire-algorithm",
    "wrong-wire-key-length", "trailing-wire-byte",
    "wrong-wire-algorithm-length-field-same-total", "wrong-wire-key-length-31-same-total",
    "extra-token", "wrong-marker", "marker-prefix-drift", "marker-suffix-drift-second-test-gate",
    "tab-separator", "unit-separator-0x1f", "delete-separator-0x7f", "base64-invalid-alphabet",
    "option-omitted-restrict", "option-duplicated-restrict",
    "option-omitted-no-pty", "option-duplicated-no-pty",
    "option-omitted-no-agent-forwarding", "option-duplicated-no-agent-forwarding",
    "option-omitted-no-port-forwarding", "option-duplicated-no-port-forwarding",
    "option-omitted-no-x11-forwarding", "option-duplicated-no-x11-forwarding",
    "option-omitted-command", "option-duplicated-command",
    "command-single-quote-drift", "command-value-drift",
    "cr", "nul", "unicode", "line-16384", "line-16385"
  ]);
  assert.deepEqual(value.metadataFailures.map((entry) => entry.name), [
    "uid", "gid", "mode-0400", "mode-0601", "mode-0644", "mode-0700", "nlink"
  ]);
  assert.deepEqual(value.ancestorFailures.map((entry) => entry.name),
    ["ancestor-0", "ancestor-1", "ancestor-2", "ancestor-3"].flatMap((role) => [
      "non-directory", "non-root-uid", "non-root-gid", "group-writable-mode", "other-writable-mode"
    ].map((name) => `${role}-${name}`)));
  assert.deepEqual(value.operationFailures.map((entry) => entry.name), [
    "auth-lstat-failure", "auth-nonregular", "auth-open-failure", "auth-pre-fstat-failure",
    "auth-read-failure", "auth-body-invalid-count", "auth-eof-invalid-count",
    "post-fstat-drift", "early-eof", "trailing-byte", "close-failure", "wrong-fd"
  ]);
  assert.deepEqual(value.streamingSuccesses.map((entry) => entry.name), ["body-partial", "body-eintr", "eof-eintr"]);
  assert.deepEqual(value.streamingSuccesses.map((entry) => entry.expectedAuthReadStages), [
    ["body", "body", "eof"],
    ["body-eintr", "body", "eof"],
    ["body", "eof-eintr", "eof"]
  ]);
  assert.deepEqual(value.bindingDrifts.map((entry) => entry.name), ["line", "blob", "effective"]);
  assert.deepEqual(value.bindingValueDrifts.map((entry) => entry.name), [
    "expected-euid",
    "ssh-algorithm",
    "ssh-authorized-keys-file",
    "paths-authorized-keys",
    "synchronized-authorized-keys-path",
    "authorized-keys-policy-mode",
    "authorized-keys-policy-uid",
    "authorized-keys-policy-gid",
    "authorized-keys-policy-nlink",
    "authorization-marker"
  ]);
  for (const witness of value.bindingValueDrifts) {
    assert.deepEqual(witness.result, { ok: false, error: "restricted_identity_rejected" }, witness.name);
    assert.equal(witness.calls, 0, witness.name);
    assert.equal(witness.sourceTraversalCount, 0, witness.name);
    assert.deepEqual(witness.publicCalls, ["topology"], witness.name);
    assert.equal(witness.trackedBuffersZero, true, witness.name);
    assert.equal(witness.initialBoundaryCaptureCount, 0, witness.name);
    assert.equal(witness.initialShapeCaptureCount, 0, witness.name);
    assert.equal(witness.authorizationEntryCount, null, witness.name);
    assert.equal(witness.snapshotFailed, null, witness.name);
    assert.equal(witness.contractErrorEvents.length >= 1, true, witness.name);
    assert.deepEqual(witness.contractErrorEvents.map((entry) => entry.ordinal),
      witness.contractErrorEvents.map((_, index) => index + 1), witness.name);
    assert.equal(witness.rawErrorAudit.contractErrorOrdinal,
      witness.contractErrorEvents.at(-1).ordinal, witness.name);
    assert.deepEqual(witness.rawErrorAudit,
      c4ExpectedRestrictedRawErrorAudit(witness.contractErrorEvents.at(-1).ordinal), witness.name);
  }
  assert.deepEqual([...new Set(value.sourceFailures.map((entry) => entry.failureAudit.stage))],
    ["source-effective", "source-syntax"]);
  assert.deepEqual([...new Set(value.authFailures.map((entry) => entry.failureAudit.stage))],
    ["authorization-grammar-or-digest"]);
  assert.deepEqual([...new Set(value.metadataFailures.map((entry) => entry.failureAudit.stage))],
    ["authorization-metadata"]);
  assert.deepEqual([...new Set(value.ancestorFailures.map((entry) => entry.failureAudit.stage))],
    ["authorization-ancestor"]);
  assert.deepEqual([...new Set(value.operationFailures.map((entry) => entry.failureAudit.stage))],
    ["authorization-operation"]);
  assert.deepEqual(value.bindingDrifts.map((entry) => entry.failureAudit.stage), [
    "binding-authorization-digest", "binding-authorization-digest", "binding-effective-digest"
  ]);
  assert.deepEqual(value.preimageAudits.includeSuccess.result, { ok: true, error: null });
  assert.deepEqual(value.preimageAudits.coverageSuccess.result, { ok: true, error: null });
  assert.deepEqual(value.preimageAudits.topologySuccess.result, { ok: true, error: null });
  assert.deepEqual(value.preimageAudits.topologyFailure.result, {
    ok: false,
    error: "restricted_identity_rejected"
  });
  assert.deepEqual(value.preimageAudits.includeSuccess.publicCalls, c4ExpectedPublicTrace("include"));
  assert.deepEqual(value.preimageAudits.coverageSuccess.publicCalls, c4ExpectedPublicTrace("coverage"));
  assert.deepEqual(value.preimageAudits.topologySuccess.publicCalls, c4ExpectedPublicTrace("topology"));
  assert.equal(value.preimageAudits.includeSuccess.rawErrorAudit, null);
  assert.equal(value.preimageAudits.coverageSuccess.rawErrorAudit, null);
  assert.equal(value.preimageAudits.topologySuccess.rawErrorAudit, null);
  assert.deepEqual(value.preimageAudits.topologyFailure.rawErrorAudit,
    c4ExpectedRestrictedRawErrorAudit(
      value.preimageAudits.topologyFailure.rawErrorAudit.contractErrorOrdinal));
  assert.deepEqual(value.preimageAudits.includeSuccess.publicAudit.projectionFreezeCounts,
    { include: 2, coverage: 0, topology: 0 });
  assert.deepEqual(value.preimageAudits.coverageSuccess.publicAudit.projectionFreezeCounts,
    { include: 1, coverage: 1, topology: 0 });
  assert.deepEqual(value.preimageAudits.topologySuccess.publicAudit.projectionFreezeCounts,
    { include: 1, coverage: 1, topology: 1 });
  assert.deepEqual(value.preimageAudits.topologyFailure.publicAudit.projectionFreezeCounts,
    { include: 1, coverage: 1, topology: 1 });
  c4AssertProjectionFreezeAudit(value.preimageAudits.includeSuccess.publicAudit,
    { include: 2, coverage: 0, topology: 0 });
  c4AssertProjectionFreezeAudit(value.preimageAudits.coverageSuccess.publicAudit,
    { include: 1, coverage: 1, topology: 0 });
  c4AssertProjectionFreezeAudit(value.preimageAudits.topologySuccess.publicAudit,
    { include: 1, coverage: 1, topology: 1 });
  c4AssertProjectionFreezeAudit(value.preimageAudits.topologyFailure.publicAudit,
    { include: 1, coverage: 1, topology: 1 });
  assert.equal(value.preimageAudits.includeSuccess.preimages.length, 1);
  assert.equal(value.preimageAudits.coverageSuccess.preimages.length, 2);
  assert.equal(value.preimageAudits.topologySuccess.preimages.length, 3);
  assert.equal(value.preimageAudits.topologyFailure.preimages.length, 3);
  assert.deepEqual(value.preimageAudits.includeSuccess.preimages.map((entry) => entry.publicStage),
    ["deriveSyntax"]);
  assert.deepEqual(value.preimageAudits.coverageSuccess.preimages.map((entry) => entry.publicStage),
    ["deriveSyntax", "derivePolicy"]);
  assert.deepEqual(value.preimageAudits.topologySuccess.preimages.map((entry) => entry.publicStage),
    ["deriveSyntax", "derivePolicy", "verify:complete"]);
  assert.deepEqual(value.preimageAudits.topologyFailure.preimages.map((entry) => entry.publicStage),
    ["deriveSyntax", "derivePolicy", "verify:complete"]);
  for (const witness of Object.values(value.preimageAudits)) {
    c4AssertInitialPublicState(witness.publicAudit);
    assert.equal(witness.publicAudit.budgetLedger.budget.snapshot.fixedEnvelopeCount, {
      include: 12,
      coverage: 17,
      topology: 23
    }[witness.kind], witness.kind);
    const publicPhase = c3LifecycleNamedPhase(witness.lifecycle, witness.phaseName);
    const c4FixedStages = new Set(["deriveSyntax:complete", "derivePolicy", "verify:complete"]);
    assert.deepEqual(publicPhase.fixedCompletions
      .filter((entry) => c4FixedStages.has(entry.publicStage))
      .map((entry) => [entry.publicStage, entry.kind]), {
      include: [
        ["deriveSyntax:complete", "objectCreate"],
        ["deriveSyntax:complete", "array"]
      ],
      coverage: [
        ["derivePolicy", "objectCreate"], ["derivePolicy", "objectCreate"],
        ["derivePolicy", "array"], ["derivePolicy", "array"],
        ["derivePolicy", "objectCreate"], ["derivePolicy", "objectCreate"],
        ["derivePolicy", "objectCreate"]
      ],
      topology: [
        ["derivePolicy", "objectCreate"], ["derivePolicy", "objectCreate"],
        ["derivePolicy", "array"], ["derivePolicy", "array"],
        ["derivePolicy", "objectCreate"], ["derivePolicy", "objectCreate"],
        ["derivePolicy", "objectCreate"], ["verify:complete", "objectCreate"],
        ["verify:complete", "array"], ["verify:complete", "array"],
        ["verify:complete", "array"], ["verify:complete", "array"],
        ["verify:complete", "array"]
      ]
    }[witness.kind], witness.kind);
    c4AssertVerifyAllocationAudit(witness.verifyAllocationAudit, {
      requireByteAllocation: witness.kind === "topology" && witness.result.ok
    });
    assert.equal(witness.publicAudit.projectionFreezeEvents.filter((entry) => entry.returnedRoot === true).length,
      witness.result.ok ? 1 : 0, witness.kind);
    if (witness.result.ok) {
      assert.equal(witness.publicAudit.projectionFreezeEvents.some((entry) =>
        entry.kind === witness.kind && entry.returnedRoot === true), true, witness.kind);
    }
    assert.equal(witness.trackedBuffersZero, true, witness.kind);
    assert.equal(witness.publicAudit.legacyLineParserCallCount, 0, witness.kind);
    assert.equal(witness.publicAudit.wholeRecordBufferToStringCount, 0, witness.kind);
    assert.equal(witness.publicAudit.wholeRecordTextDecoderCount, 0, witness.kind);
    c4AssertVerifierCanonicalPathStringAudit(
      witness.publicAudit.verifierBufferToStringCount,
      witness.publicAudit.verifierBufferToStringSpans,
      witness.publicAudit.verifyAttempts
    );
    assert.equal(witness.publicAudit.verifierTextDecoderConstructionCount, 0, witness.kind);
    assert.equal(witness.publicAudit.verifierTextDecoderDecodeCount, 0, witness.kind);
    assert.deepEqual(witness.publicAudit.verifierTextDecoderInputLengths, [], witness.kind);
    assert.equal(witness.preimagePendingCount, 0, witness.kind);
    if (witness.result.ok) {
      c4AssertPublicRegistrySuccess(witness.registryAudit, witness.kind);
    } else {
      const primary = witness.publicAudit.contractErrorEvents[0];
      c4AssertPublicRegistryFailure(witness.registryAudit, witness.kind,
        primary.registryEvents);
    }
    assert.deepEqual(witness.provenance.syntax, { present: false, sameGraph: false }, witness.kind);
    assert.deepEqual(witness.provenance.policy, { present: false, sameGraph: false }, witness.kind);
    assert.deepEqual(witness.provenance.snapshot, { present: false, sameGraph: false }, witness.kind);
    assert.deepEqual(witness.preimages.map((entry) => entry.reservedLength),
      witness.oraclePreimages.map((entry) => entry.length), witness.kind);
    for (let index = 0; index < witness.preimages.length; index += 1) {
      const preimage = witness.preimages[index];
      const oracle = witness.oraclePreimages[index];
      assert.equal(preimage.reservedLength, oracle.length, witness.kind);
      assert.equal(preimage.requestedLength, oracle.length, witness.kind);
      assert.equal(preimage.actualLength, oracle.length, witness.kind);
      assert.equal(Number.isSafeInteger(preimage.byteId), true, witness.kind);
      assert.equal(preimage.allocationKind, "bufferAlloc", witness.kind);
      assert.equal(preimage.firstAllocationAfterReserve, true, witness.kind);
      assert.equal(preimage.claimedAsPreimage, true, witness.kind);
      assert.equal(preimage.orphan, false, witness.kind);
      assert.ok(preimage.reserveAction < preimage.allocationAction, witness.kind);
      assert.ok(preimage.allocationAction < preimage.hashAction, witness.kind);
      assert.ok(preimage.hashAction < preimage.fillAction, witness.kind);
      assert.equal(preimage.fullSpanHashCount, 1, witness.kind);
      assert.deepEqual(preimage.hashSpans.map(({ byteId, length, sha256 }) => ({ byteId, length, sha256 })), [{
        byteId: preimage.byteId,
        length: oracle.length,
        sha256: oracle.sha256
      }], witness.kind);
      assert.equal(preimage.zeroFillCount, 1, witness.kind);
      assert.equal(preimage.zero, true, witness.kind);
    }
  }
  assert.deepEqual(value.privatePolicyPreimage.result, { ok: true, error: null });
  assert.equal(value.privatePolicyPreimage.preimagePendingCount, 0);
  assert.equal(value.privatePolicyPreimage.preimages.length, 1);
  const privateCoveragePreimage = value.privatePolicyPreimage.preimages[0];
  const publicCoveragePreimage = value.preimageAudits.coverageSuccess.preimages[1];
  const topologyCoveragePreimage = value.preimageAudits.topologySuccess.preimages[1];
  assert.deepEqual([
    privateCoveragePreimage.reservedLength,
    publicCoveragePreimage.reservedLength,
    topologyCoveragePreimage.reservedLength
  ], [
    value.privatePolicyPreimage.coverageOracle.length,
    value.preimageAudits.coverageSuccess.oraclePreimages[1].length,
    value.preimageAudits.topologySuccess.oraclePreimages[1].length
  ]);
  assert.equal(new Set([
    privateCoveragePreimage.reservedLength,
    publicCoveragePreimage.reservedLength,
    topologyCoveragePreimage.reservedLength
  ]).size, 1);
  assert.equal(new Set([
    value.privatePolicyPreimage.coverageOracle.sha256,
    value.preimageAudits.coverageSuccess.oraclePreimages[1].sha256,
    value.preimageAudits.topologySuccess.oraclePreimages[1].sha256
  ]).size, 1);
  assert.deepEqual([
    value.preimageAudits.includeSuccess.preimages[0].reservedLength,
    value.preimageAudits.coverageSuccess.preimages[0].reservedLength,
    value.preimageAudits.topologySuccess.preimages[0].reservedLength
  ], Array(3).fill(value.preimageAudits.includeSuccess.oraclePreimages[0].length));
  assert.equal(value.preimageAudits.topologyFailure.publicAudit.authorizationEntryCount, 0);
  assert.equal(value.preimageAudits.topologyFailure.publicAudit.snapshotFailed, true);
  const {
    beforeLifecycle: topologyFailureBeforeLifecycle,
    afterLifecycle: topologyFailureAfterLifecycle,
    beforeState: topologyFailureBeforeState,
    afterState: topologyFailureAfterState,
    ...topologyFailureFollowUp
  } = value.preimageAudits.topologyFailure.terminalFollowUp;
  assert.deepEqual(topologyFailureFollowUp, {
    ok: false,
    error: "restricted_identity_rejected",
    allocations: C2B_ZERO_ALLOCATIONS,
    operationCalls: 0,
    trackedBuffersZero: true
  });
  assert.deepEqual(topologyFailureAfterLifecycle, topologyFailureBeforeLifecycle);
  assert.deepEqual(topologyFailureAfterState, topologyFailureBeforeState);
  const topologyFailurePrimary = value.preimageAudits.topologyFailure.publicAudit.contractErrorEvents.at(-1);
  assert.equal(value.preimageAudits.topologyFailure.rawErrorAudit.contractErrorOrdinal,
    topologyFailurePrimary.ordinal);
  c4AssertTerminalBudgetState(topologyFailureBeforeState,
    value.preimageAudits.topologyFailure.publicAudit.initialFixedShape,
    value.preimageAudits.topologyFailure.publicAudit.budgetLedger,
    value.preimageAudits.topologyFailure.publicAudit.preimageReserveTotal);
  const publicFaultExpectationByKey = new Map(value.publicFaultExpectations.map((entry) => [entry.key, entry]));
  for (const kind of ["include", "coverage", "topology"]) {
    const matrix = value.publicFaultMatrices[kind];
    assert.ok(matrix.length > 0, `${kind} public C4 fault calibration must be nonempty`);
    const expectedCombinationKeys = value.publicFaultExpectations.map((entry) => entry.key)
      .filter((key) => key.startsWith(kind + "|")).sort();
    const actualCombinationKeys = [...new Set(matrix.map((entry) =>
      kind + "|" + entry.publicStage + "|" + entry.site))].sort();
    assert.deepEqual(actualCombinationKeys, expectedCombinationKeys,
      `${kind}:independent-public-fault-combinations`);
    for (const combinationKey of actualCombinationKeys) {
      const actions = matrix.filter((entry) =>
        kind + "|" + entry.publicStage + "|" + entry.site === combinationKey)
        .map((entry) => entry.expectedAction);
      assert.equal(actions.length >= 1, true, combinationKey);
      assert.equal(new Set(actions).size, actions.length, combinationKey);
      assert.equal(actions.every((action) => Number.isSafeInteger(action) && action > 0), true,
        combinationKey);
    }
    const requiredSites = kind === "include"
      ? ["fixed-envelope"]
      : ["fixed-envelope", "preimage-allocation", "preimage-hash", "preimage-fill"];
    for (const site of requiredSites) {
      assert.ok(matrix.some((entry) => entry.site === site), `${kind}:${site}`);
    }
    if (kind === "topology") {
      assert.ok(matrix.some((entry) => entry.site === "authorization-transient-cleanup"));
      assert.ok(matrix.some((entry) => entry.site === "authorization-verify-byte-allocation"));
      assert.equal(matrix.filter((entry) => entry.site === "authorization-verify-hash").length, 2);
    }
    const allowedStages = kind === "include"
      ? ["deriveSyntax:complete"]
      : kind === "coverage"
        ? ["derivePolicy", "derivePolicy:complete"]
        : ["derivePolicy", "derivePolicy:complete", "verify", "verify:complete"];
    for (const entry of matrix) {
      assert.ok(allowedStages.includes(entry.publicStage), `${kind}:${entry.site}:${entry.publicStage}`);
      const independentFaultExpectation = publicFaultExpectationByKey.get(
        kind + "|" + entry.publicStage + "|" + entry.site);
      assert.notEqual(independentFaultExpectation, undefined,
        `${kind}:${entry.site}:${entry.publicStage}`);
      assert.equal(entry.fault.kind, independentFaultExpectation.faultKind,
        `${kind}:${entry.site}:${entry.publicStage}`);
      assert.equal(entry.witness.faultStamp.action,
        entry.expectedAction, `${kind}:${entry.site}:${entry.publicStage}`);
      assert.equal(entry.expectedProjectionFreezeCount,
        independentFaultExpectation.freezeTrace.length,
        `${kind}:${entry.site}:${entry.publicStage}`);
      assert.equal(entry.witness.faultStamp.projectionFreezes,
        independentFaultExpectation.freezeTrace.length,
        `${kind}:${entry.site}:${entry.publicStage}`);
      assert.deepEqual(entry.witness.publicAudit.projectionFreezeEvents
        .slice(0, entry.witness.faultStamp.projectionFreezes)
        .map((event) => event.kind + "@" + event.publicStage),
      independentFaultExpectation.freezeTrace,
      `${kind}:${entry.site}:${entry.publicStage}`);
      assert.equal(entry.witness.publicAudit.projectionFreezeEvents
        .slice(0, entry.witness.faultStamp.projectionFreezes)
        .every((event) => event.action < entry.witness.faultStamp.action), true,
      `${kind}:${entry.site}:${entry.publicStage}`);
      assert.notEqual(entry.publicStage, "snapshot");
      assert.notEqual(entry.publicStage, "graph:ssh");
      assert.notEqual(entry.publicStage, "graph:sudo");
      assert.notEqual(entry.publicStage, "deriveSyntax");
      const verifierFault = entry.site === "authorization-transient-cleanup"
        || entry.site === "authorization-verify-byte-allocation"
        || entry.site === "authorization-verify-hash";
      const verifierHasOpenFile = entry.expectedOperationCalls.some((operation) =>
        operation[0] === "open" && operation[1] === "file-1");
      const verifierRequiresFdCleanup = verifierFault && verifierHasOpenFile;
      const verifierCleanupSuffix = [["fstat", "file-1", "post"], ["close", "file-1"]];
      const expectedOperationCalls = verifierRequiresFdCleanup
        ? [...entry.expectedOperationCalls, ...verifierCleanupSuffix]
        : entry.expectedOperationCalls;
      const expectedPostFaultOperationCalls = verifierRequiresFdCleanup
        ? verifierCleanupSuffix
        : [];
      const expectedAuthorizationOpenCount = expectedOperationCalls.filter((entry) =>
        entry[0] === "open" && entry[1] === "file-1").length;
      c4AssertPublicTerminalFailure(entry.witness, kind, {
        expectedTopologyFreezeCount: independentFaultExpectation.topologyFreezeCount,
        expectedAuthorizationOpenCount,
        expectedOperationCalls,
        expectedPostFaultOperationCalls,
        label: `${kind}:${entry.site}:${entry.publicStage}`
      });
      c4AssertProjectionFreezeAudit(entry.witness.publicAudit,
        entry.witness.publicAudit.projectionFreezeCounts);
      assert.deepEqual(entry.witness.publicCalls,
        c4ExpectedPublicFaultTrace(kind, entry.publicStage), `${kind}:${entry.site}:${entry.publicStage}`);
    }
  }
  assert.deepEqual(value.publicDisposerMatrix.map((entry) => entry.name), [
    "include-syntax-delete-after",
    "coverage-policy-delete-after",
    "coverage-syntax-delete-after",
    "topology-policy-delete-after",
    "topology-syntax-delete-after"
  ]);
  for (const entry of value.publicDisposerMatrix) {
    c4AssertPublicTerminalFailure(entry.witness, entry.kind, {
      expectedTopologyFreezeCount: entry.kind === "topology" ? 1 : 0,
      expectedAuthorizationOpenCount: entry.kind === "topology" ? 1 : 0,
      expectedOperationCalls: entry.kind === "topology"
        ? c4ExpectedTopologyPathOperations()
        : c3A1FileOperations("body", "eof")
    });
    const expectedProjectionFreezes = entry.kind === "include"
      ? { include: 2, coverage: 0, topology: 0 }
      : entry.kind === "coverage"
        ? { include: 1, coverage: 1, topology: 0 }
        : { include: 1, coverage: 1, topology: 1 };
    assert.deepEqual(entry.witness.publicAudit.projectionFreezeCounts, expectedProjectionFreezes, entry.name);
    c4AssertProjectionFreezeAudit(entry.witness.publicAudit, expectedProjectionFreezes);
    const targetedDeletes = entry.witness.registryAudit.provenanceEvents.filter((event) =>
      event.method === "delete" && event.keyIdentity === entry.identity);
    assert.equal(targetedDeletes.length, 1, entry.name);
    assert.equal(targetedDeletes[0].sameGraph, true, entry.name);
    assert.ok(entry.witness.publicAudit.projectionFreezeEvents.every((event) =>
      event.registryEvents < targetedDeletes[0].ordinal), entry.name);
    assert.deepEqual({
      graphFailed: targetedDeletes[0].graphFailed,
      snapshotFailed: targetedDeletes[0].snapshotFailed,
      authorizationEntryCount: targetedDeletes[0].authorizationEntryCount
    }, { graphFailed: false, snapshotFailed: false, authorizationEntryCount: 0 }, entry.name);
    assert.deepEqual(entry.witness.publicCalls, c4ExpectedPublicTrace(entry.kind), entry.name);
    assert.equal(entry.witness.publicCalls.filter((name) => name === "disposeSyntax").length, 1, entry.name);
    assert.equal(entry.witness.publicCalls.filter((name) => name === "disposePolicy").length,
      entry.kind === "include" ? 0 : 1, entry.name);
    if (entry.identity === "policy") {
      assert.ok(entry.witness.publicCalls.indexOf("disposePolicy")
        < entry.witness.publicCalls.indexOf("disposeSyntax"), entry.name);
    }
  }
  const dualFailure = value.lateEffectiveDigestAndPolicyDeleteFailure;
  c4AssertPublicTerminalFailure(dualFailure, "topology", {
    expectedAuthorizationOpenCount: 1,
    expectedOperationCalls: c4ExpectedTopologyPathOperations(),
    expectedTopologyFreezeCount: 1,
    expectedRawErrorEvent: "primary",
    label: "late-effective-digest-and-policy-delete-failure"
  });
  assert.deepEqual(dualFailure.result, { ok: false, error: "restricted_identity_rejected" });
  assert.deepEqual(Object.keys(dualFailure.result), ["ok", "error"]);
  assert.equal(dualFailure.publicAudit.topologyFreezeCount, 1);
  assert.equal(dualFailure.publicAudit.verifyAttempts, 1);
  assert.equal(dualFailure.publicAudit.verifySuccesses, 1);
  assert.equal(dualFailure.publicAudit.verifyFailures, 0);
  assert.deepEqual(dualFailure.publicAudit.projectionFreezeCounts,
    { include: 1, coverage: 1, topology: 1 });
  c4AssertProjectionFreezeAudit(dualFailure.publicAudit, { include: 1, coverage: 1, topology: 1 });
  const dualPolicyDeletes = dualFailure.registryAudit.provenanceEvents.filter((event) =>
    event.method === "delete" && event.keyIdentity === "policy");
  assert.equal(dualPolicyDeletes.length, 1);
  assert.equal(dualPolicyDeletes[0].sameGraph, true);
  assert.equal(dualPolicyDeletes[0].authorizationEntryCount, 0);
  const primaryErrorsBeforeCleanup = dualFailure.publicAudit.contractErrorEvents.filter((entry) =>
    entry.codeExact === true && entry.publicStage === "verify:complete"
      && entry.registryEvents < dualPolicyDeletes[0].ordinal);
  assert.equal(primaryErrorsBeforeCleanup.length, 1);
  assert.equal(dualFailure.rawErrorAudit.contractErrorOrdinal, primaryErrorsBeforeCleanup[0].ordinal);
  assert.deepEqual(dualFailure.publicCalls, c4ExpectedPublicTrace("topology"));
  assert.deepEqual(dualFailure.publicCalls.filter((name) =>
    name === "verify" || name === "disposePolicy" || name === "disposeSyntax"), [
    "verify", "disposePolicy", "disposeSyntax"
  ]);
  assert.ok(dualFailure.publicCalls.indexOf("verify")
    < dualFailure.publicCalls.indexOf("disposePolicy"));
  assert.ok(dualFailure.publicCalls.indexOf("disposePolicy")
    < dualFailure.publicCalls.indexOf("disposeSyntax"));
  for (const witness of value.metadataFailures) {
    assert.equal(witness.probe.calls.filter((entry) => entry.length === 2
      && entry[0] === "lstat" && entry[1] === "file-1").length, 1, witness.name);
    assert.deepEqual(witness.probe.calls, witness.expectedCalls, witness.name);
    assert.equal(witness.probe.calls.some(([operation, role]) => operation === "open" && role === "file-1"),
      false, witness.name);
  }
  for (const witness of value.ancestorFailures) {
    assert.equal(witness.probe.calls.filter((entry) => entry.length === witness.operationWitness.length
      && entry.every((value, index) => value === witness.operationWitness[index])).length,
    witness.role === "ancestor-3" ? 1 : 2, witness.name);
    assert.equal(witness.probe.topology.publicAudit.verifyAttempts, 1, witness.name);
    assert.equal(witness.probe.topology.publicAudit.verifyFailures, 1, witness.name);
    const sourceAncestorScopes = c3A1FileOperations("body", "eof")
      .filter(([operation, role]) => operation === "lstat" && role.startsWith("ancestor-"))
      .map(([operation, role]) => [operation, role, false]);
    const authorizationAncestorScopes = witness.expectedCalls
      .slice(c3A1FileOperations("body", "eof").length)
      .filter(([operation, role]) => operation === "lstat" && role.startsWith("ancestor-"))
      .map(([operation, role]) => [operation, role, true]);
    assert.deepEqual(witness.probe.verificationScopes,
      [...sourceAncestorScopes, ...authorizationAncestorScopes], witness.name);
    assert.deepEqual(witness.probe.calls, witness.expectedCalls, witness.name);
    assert.deepEqual(witness.probe.calls.slice(-1), [["lstat", witness.role]], witness.name);
    assert.equal(witness.probe.calls.some(([, role]) => role === "file-1"), false, witness.name);
  }
  for (const witness of value.operationFailures) {
    assert.equal(witness.probe.calls.filter((entry) => entry.length === witness.operationWitness.length
      && entry.every((value, index) => value === witness.operationWitness[index])).length, 1, witness.name);
  }
  assert.equal(value.encodedTokenLength, 68);
  for (const witness of [...value.authFailures, ...value.bindingDrifts]) {
    assert.equal(witness.probe.topology.publicCalls.filter((name) => name === "verify").length, 1, witness.name);
    assert.deepEqual(witness.probe.calls.filter(([name]) => name === "open").map(([, role]) => role),
      ["file-0", "file-1"], witness.name);
  }
  for (const witness of value.authFailures) {
    if (witness.expectedLineSha256 !== null) {
      assert.equal(witness.probe.bindingDigests.line, witness.expectedLineSha256, witness.name);
    }
    if (witness.expectedBlobSha256 !== null) {
      assert.equal(witness.probe.bindingDigests.blob, witness.expectedBlobSha256, witness.name);
    }
  }
  assert.deepEqual(value.canonicalSelectionNames, [
    "empty", "blank", "comment", "blank-prefix", "blank-suffix", "comment-prefix", "comment-suffix",
    "folded", "second-active", "duplicate-target"
  ]);
  for (const name of value.canonicalSelectionNames) {
    const witness = value.authFailures.find((entry) => entry.name === name);
    assert.equal(witness.canonicalSelection, true, name);
    assert.equal(witness.selectedLineSha256, witness.expectedLineSha256, name);
    assert.equal(witness.probe.bindingDigests.line, witness.selectedLineSha256, name);
    assert.equal(witness.probe.bindingDigests.blob, witness.expectedBlobSha256, name);
    assert.match(witness.selectedLineSha256, /^[0-9a-f]{64}$/u, name);
    assert.match(witness.legacyWholeFileLineSha256, /^[0-9a-f]{64}$/u, name);
    assert.notEqual(witness.selectedLineSha256, witness.legacyWholeFileLineSha256, name);
    assert.equal(witness.probe.topology.publicAudit.verifyAttempts, 1, name);
    assert.equal(witness.probe.topology.publicAudit.verifyFailures, 1, name);
    assert.equal(witness.probe.topology.publicCalls.includes("verify"), true, name);
    assert.equal(witness.probe.topology.publicAudit.authorizationHashInputs.some((entry) =>
      entry.totalLength === witness.probe.authorizationHashOracle.legacyWholeFile.length
        && entry.inputSha256 === witness.probe.authorizationHashOracle.legacyWholeFile.sha256), false, name);
    assert.equal(witness.probe.topology.publicAudit.authorizationHashInputs.some((entry) =>
      entry.totalLength === witness.legacyWholeFileLineLength
        && entry.inputSha256 === witness.legacyWholeFileLineSha256), false, name);
  }
  for (const witness of value.bindingDrifts) {
    assert.deepEqual(witness.probe.calls.filter(([name]) => name === "close").map(([, role]) => role),
      ["file-0", "file-1"], witness.name);
  }
  for (const name of ["empty", "line-16384", "line-16385"]) {
    const witness = value.authFailures.find((entry) => entry.name === name);
    assert.deepEqual(witness.probe.calls
      .filter(([operation, role]) => operation === "read" && role === "file-1")
      .map(([, , stage]) => stage), witness.expectedAuthReadStages, name);
  }
  const wrongFd = value.operationFailures.find((entry) => entry.name === "wrong-fd").probe;
  assert.deepEqual(wrongFd.calls.filter(([name]) => name === "open").map(([, role]) => role), ["file-0", "file-1"]);
  assert.deepEqual(wrongFd.calls.filter(([name, role]) => name === "read" && role === "file-0")
    .map(([, role, stage]) => [role, stage]), [["file-0", "body"], ["file-0", "eof"]]);
  assert.equal(value.positive.topology.trackedBuffersZero, true);
  assert.ok(value.positive.topology.trackedBufferCount > 0);
});
