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
  buildCanonicalSshIncludeClosure,
  buildCanonicalSshMatchCoverage,
  buildCanonicalSshTopology,
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

function sshClosure(overrides = {}) {
  return {
    schemaVersion: "1",
    type: "japan_ci_sshd_source_closure",
    rootConfig: "/etc/ssh/sshd_config",
    files: [
      { ordinal: 0, path: "/etc/ssh/sshd_config", sha256: SHA_A, uid: 0, gid: 0, mode: 0o644, nlink: 1 },
      { ordinal: 1, path: "/etc/ssh/sshd_config.d/repair.conf", sha256: SHA_B, uid: 0, gid: 0, mode: 0o600, nlink: 1 }
    ],
    ...overrides
  };
}

function matchCoverage(overrides = {}) {
  return {
    schemaVersion: "1",
    type: "japan_ci_sshd_match_coverage",
    username: "gccgw-japan-repair-ci",
    groupIds: [975, 1001],
    branches: [
      {
        ordinal: 0,
        sourceOrdinal: 1,
        lineNumber: 12,
        conditions: [{ name: "user", patterns: [{ negated: false, value: "gccgw-japan-repair-ci" }] }],
        accountDisposition: "exact_user",
        variableDimensions: []
      },
      {
        ordinal: 1,
        sourceOrdinal: 1,
        lineNumber: 24,
        conditions: [{ name: "all", patterns: [] }],
        accountDisposition: "exact_user",
        variableDimensions: []
      }
    ],
    ...overrides
  };
}

function sshTopologyInput(overrides = {}) {
  return {
    schemaVersion: "1",
    type: "japan_ci_ssh_authorization_topology",
    username: "gccgw-japan-repair-ci",
    uid: 975,
    homeDirectory: HOME_PATH,
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
    authorizedKeysFiles: [AUTHORIZED_KEYS_PATH],
    authorizedKeysCommand: "none",
    authorizedPrincipalsFiles: [],
    authorizedPrincipalsCommand: "none",
    trustedUserCAKeys: [],
    activeAuthorizationEntryCount: 1,
    targetKeyOccurrenceCount: 1,
    addressDependentAuthorizationBranchCount: 0,
    includeClosure: sshClosure(),
    matchCoverage: matchCoverage(),
    ...overrides
  };
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
    assert.throws(
      () => buildCanonicalSshIncludeClosure(sshClosure({
        files: [
          sshClosure().files[0],
          { ...sshClosure().files[1], path }
        ]
      })),
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

  const included = buildCanonicalSshIncludeClosure(sshClosure({
    files: [
      sshClosure().files[0],
      { ...sshClosure().files[1], path: "/etc/ssh/sshd_config.d/日本.conf" }
    ]
  }));
  assert.equal(included.files[1].path, "/etc/ssh/sshd_config.d/日本.conf");
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

test("SSH source closure and Match coverage are canonical and hash their preimages", () => {
  const closure = buildCanonicalSshIncludeClosure(sshClosure());
  assert.deepEqual(Object.keys(closure), ["schemaVersion", "type", "rootConfig", "files"]);
  assert.deepEqual(Object.keys(closure.files[0]), ["ordinal", "path", "sha256", "uid", "gid", "mode", "nlink"]);
  const coverage = buildCanonicalSshMatchCoverage(matchCoverage());
  assert.deepEqual(Object.keys(coverage), ["schemaVersion", "type", "username", "groupIds", "branches"]);
  assert.equal(JSON.stringify(coverage.branches[1].conditions[0]), "{\"name\":\"all\",\"patterns\":[]}");
  const topology = buildCanonicalSshTopology(sshTopologyInput());
  assert.deepEqual(Object.keys(topology), [
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
  assert.equal(
    topology.includeClosureSha256,
    createHash("sha256").update(`${JSON.stringify(closure)}\n`).digest("hex")
  );
  assert.equal(
    topology.matchCoverageSha256,
    createHash("sha256").update(`${JSON.stringify(coverage)}\n`).digest("hex")
  );
});

test("SSH policy blocks alternate authorization, command, chroot, forwarding, tunnel, and unresolved conditions", () => {
  const failures = [
    sshTopologyInput({ authenticationMethods: ["publickey", "password"] }),
    sshTopologyInput({ passwordAuthentication: true }),
    sshTopologyInput({ authorizedKeysFiles: [AUTHORIZED_KEYS_PATH, "/alternate"] }),
    sshTopologyInput({ authorizedKeysCommand: "/usr/bin/lookup" }),
    sshTopologyInput({ trustedUserCAKeys: ["/etc/ssh/ca.pub"] }),
    sshTopologyInput({ forceCommand: "/bin/true" }),
    sshTopologyInput({ chrootDirectory: "/srv/chroot" }),
    sshTopologyInput({ disableForwarding: false }),
    sshTopologyInput({ permitTunnel: true }),
    sshTopologyInput({ addressDependentAuthorizationBranchCount: 1 })
  ];
  for (const value of failures) {
    assert.throws(
      () => buildCanonicalSshTopology(value),
      (error) => error.code === "restricted_identity_rejected"
    );
  }
  const coverageFailures = [
    matchCoverage({ groupIds: [1001, 975] }),
    matchCoverage({ groupIds: [975, 975] }),
    matchCoverage({ branches: [{ ...matchCoverage().branches[0], variableDimensions: ["host"] }] }),
    matchCoverage({ branches: [{ ...matchCoverage().branches[0], conditions: [{ name: "all", patterns: [{ negated: false, value: "*" }] }] }] }),
    matchCoverage({ branches: [{ ...matchCoverage().branches[0], conditions: [{ name: "host", patterns: [{ negated: false, value: "*.example" }] }], accountDisposition: "exact_user", variableDimensions: [] }] }),
    matchCoverage({ branches: [{ ...matchCoverage().branches[0], conditions: [{ name: "user", patterns: [{ negated: false, value: "!root" }] }] }] })
  ];
  for (const value of coverageFailures) {
    assert.throws(
      () => buildCanonicalSshMatchCoverage(value),
      (error) => error.code === "restricted_identity_rejected"
    );
  }
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
    "delete-dev-compare": ["left.dev !== right.dev || ", ""],
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
const nativeJSON = JSON;
const nativeWeakMapGet = nativeWeakMap.prototype.get;
const nativeWeakMapHas = nativeWeakMap.prototype.has;
const nativeWeakMapSet = nativeWeakMap.prototype.set;
const nativeWeakMapDelete = nativeWeakMap.prototype.delete;
const nativeArrayPush = nativeArray.prototype.push;
const nativeBufferFill = nativeBuffer.prototype.fill;
const nativeBufferCopy = nativeBuffer.prototype.copy;
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

function c3LifecycleRegistryEvent(method, key, value, result) {
  const current = c3LifecycleCurrent;
  if (!current) return;
  const keyShape = c3LifecycleKeyShape(key);
  const sameGraph = method === "set"
    ? value === current.graph
    : result === current.graph;
  current.registry.push({
    method,
    keyShape,
    sameGraph,
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
      c3LifecycleRegistryEvent("get", key, undefined, result);
      return result;
    }, writable: true, configurable: true
  },
  has: {
    value(key) {
      const result = Reflect.apply(nativeWeakMapHas, this, [key]);
      const value = result ? Reflect.apply(nativeWeakMapGet, this, [key]) : undefined;
      c3LifecycleRegistryEvent("has", key, undefined, value);
      return result;
    }, writable: true, configurable: true
  },
  set: {
    value(key, value) {
      const result = Reflect.apply(nativeWeakMapSet, this, [key, value]);
      c3LifecycleRegistryEvent("set", key, value, result);
      return result;
    }, writable: true, configurable: true
  },
  delete: {
    value(key) {
      const previous = Reflect.apply(nativeWeakMapGet, this, [key]);
      const result = Reflect.apply(nativeWeakMapDelete, this, [key]);
      c3LifecycleRegistryEvent("delete", key, undefined, previous);
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
    semanticReserveOrdinal: 0, semanticBatchOrdinal: 0, currentSemanticBatch: 0,
    eventBatchByOrdinal: new nativeMap(), retentions: new nativeArray(), actionOrdinal: 0, lastEventPushAction: 0,
    allocationActions: new nativeArray(), objectAllocationRecords: new nativeWeakMap(),
    objectAllocationEntries: new nativeArray(), byteAllocationActions: new nativeArray(), copyActions: new nativeArray(),
    rawDirectoryOccurrences: new nativeArray(), rawDirectoryCursor: 0, rawDirectoryFailed: false,
    fault, faultTriggered: false
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
  if (kind === "preimage") current.tracker.pendingByteRole = { role: "preimage", length: value };
  if (kind === "fixed") {
    current.fixedOrdinal += 1;
    current.tracker.pendingFixedRole = ["owner", "closure", "files", "events", "activePaths"][current.fixedOrdinal - 1] || "unexpectedFixed";
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
  Reflect.apply(nativeArrayPush, current.allocationActions, [{
    ordinal: current.allocationOrdinal,
    action: current.actionOrdinal,
    kind
  }]);
  if (kind.startsWith("buffer") || kind === "textEncoderOutput") {
    Reflect.apply(nativeArrayPush, current.byteAllocationActions, [{
      ordinal: current.allocationOrdinal,
      action: current.actionOrdinal,
      kind,
      byteId: null
    }]);
  }
  const pendingFixedRole = current.tracker.pendingFixedRole;
  if (pendingFixedRole) {
    const expectedKind = pendingFixedRole === "owner" || pendingFixedRole === "closure" ? "objectCreate" : "array";
    Reflect.apply(nativeArrayPush, current.fixedAllocations, [{
      role: pendingFixedRole,
      ordinal: current.fixedOrdinal,
      kind,
      expectedKind: kind === expectedKind
    }]);
    if (current.fault && current.fault.kind === "fixedAllocation"
      && current.fault.role === pendingFixedRole && current.fault.ordinal === current.fixedOrdinal
      && kind === expectedKind && !current.faultTriggered) {
      current.faultTriggered = true;
      throw new Error("synthetic C3 fixed allocation failure");
    }
  }
  const pending = current.tracker.pendingByteRole;
  const pendingRole = pending && pending.role;
  if (pendingRole && kind === "bufferAlloc" && requestedLength === pending.length) {
    current.roleAllocationOrdinals[pendingRole] = (current.roleAllocationOrdinals[pendingRole] || 0) + 1;
    Reflect.apply(nativeArrayPush, current.roleAllocations, [{
      role: pendingRole,
      ordinal: current.roleAllocationOrdinals[pendingRole],
      kind,
      lengthMatches: true
    }]);
    if (current.fault && current.fault.kind === "allocationRole" && current.fault.role === pendingRole
      && current.fault.ordinal === current.roleAllocationOrdinals[pendingRole] && !current.faultTriggered) {
      current.faultTriggered = true;
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
  if (kind.startsWith("buffer") || kind === "textEncoderOutput") {
    const byteRecord = c3LifecycleByteRecord(value, kind);
    const allocation = c3LifecycleCurrent && c3LifecycleCurrent.byteAllocationActions.at(-1);
    if (byteRecord && allocation && allocation.byteId === null
      && allocation.kind === kind
      && allocation.ordinal === c3LifecycleCurrent.allocationOrdinal
      && allocation.action === c3LifecycleCurrent.actionOrdinal) {
      allocation.byteId = byteRecord.id;
      byteRecord.allocationOrdinal = allocation.ordinal;
      byteRecord.allocationAction = allocation.action;
      byteRecord.allocationKind = allocation.kind;
    }
  }
  return value;
}

function instrumentedObject(value) {
  if (allocationActive) allocationCounts.objectCall += 1;
  return nativeObject(value);
}
instrumentedObject.prototype = nativeObject.prototype;
nativeObject.setPrototypeOf(instrumentedObject, nativeObject);
instrumentedObject.create = (...arguments_) => {
  if (allocationActive) allocationCounts.objectCreate += 1;
  c3LifecycleBeforeAllocation("objectCreate");
  return c3TrackAllocation("objectCreate", nativeObject.create(...arguments_));
};
function instrumentedArray(...arguments_) {
  if (allocationActive) allocationCounts.array += 1;
  c3LifecycleBeforeAllocation("array");
  return c3TrackAllocation("array", new nativeArray(...arguments_));
}
instrumentedArray.prototype = nativeArray.prototype;
nativeObject.setPrototypeOf(instrumentedArray, nativeArray);
function instrumentedMap(iterable) {
  if (!new.target) return Reflect.apply(nativeMap, undefined, [iterable]);
  if (allocationActive && new.target) allocationCounts.map += 1;
  return new nativeMap(iterable);
}
instrumentedMap.prototype = nativeMap.prototype;
nativeObject.setPrototypeOf(instrumentedMap, nativeMap);
function instrumentedSet(iterable) {
  if (!new.target) return Reflect.apply(nativeSet, undefined, [iterable]);
  if (allocationActive && new.target) allocationCounts.set += 1;
  return new nativeSet(iterable);
}
instrumentedSet.prototype = nativeSet.prototype;
nativeObject.setPrototypeOf(instrumentedSet, nativeSet);
function instrumentedWeakMap(iterable) {
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
  if (!new.target) return Reflect.apply(nativeWeakSet, undefined, [iterable]);
  if (allocationActive && new.target) allocationCounts.weakSet += 1;
  return new nativeWeakSet(iterable);
}
instrumentedWeakSet.prototype = nativeWeakSet.prototype;
nativeObject.setPrototypeOf(instrumentedWeakSet, nativeWeakSet);
function instrumentedProxy(target, handler) {
  if (allocationActive) allocationCounts.proxy += 1;
  if (!new.target) return Reflect.apply(nativeProxy, undefined, [target, handler]);
  return new nativeProxy(target, handler);
}
instrumentedProxy.revocable = (target, handler) => {
  if (allocationActive) allocationCounts.proxy += 1;
  return nativeProxy.revocable(target, handler);
};
const instrumentedBufferAlloc = (...arguments_) => {
  if (allocationActive) allocationCounts.bufferAlloc += 1;
  c3LifecycleBeforeAllocation("bufferAlloc", arguments_[0]);
  return c3TrackAllocation("bufferAlloc", nativeBuffer.alloc(...arguments_));
};
const instrumentedBufferFrom = (...arguments_) => {
  if (allocationActive) allocationCounts.bufferFrom += 1;
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
  c3LifecycleBeforeAllocation("bufferAllocUnsafe");
  return c3TrackAllocation("bufferAllocUnsafe", nativeBuffer.allocUnsafe(...arguments_));
};
const instrumentedBufferAllocUnsafeSlow = (...arguments_) => {
  if (allocationActive) allocationCounts.bufferAllocUnsafe += 1;
  c3LifecycleBeforeAllocation("bufferAllocUnsafe");
  return c3TrackAllocation("bufferAllocUnsafe", nativeBuffer.allocUnsafeSlow(...arguments_));
};
const instrumentedBufferConcat = (...arguments_) => {
  if (allocationActive) allocationCounts.bufferConcat += 1;
  c3LifecycleBeforeAllocation("bufferConcat");
  return c3TrackAllocation("bufferConcat", nativeBuffer.concat(...arguments_));
};
const instrumentedBufferOf = (...arguments_) => {
  if (allocationActive) allocationCounts.bufferOf += 1;
  c3LifecycleBeforeAllocation("bufferOf");
  return c3TrackAllocation("bufferOf", nativeBuffer.of(...arguments_));
};
const instrumentedBufferCompare = (...arguments_) => {
  if (Number.isSafeInteger(globalThis.__c3BufferCompareCount)) globalThis.__c3BufferCompareCount += 1;
  return nativeBuffer.compare(...arguments_);
};
const instrumentedBuffer = new Proxy(nativeBuffer, {
  apply(target, thisArgument, arguments_) {
    if (allocationActive) allocationCounts.bufferConstructor += 1;
    c3LifecycleBeforeAllocation("bufferConstructor");
    return c3TrackAllocation("bufferConstructor", Reflect.apply(target, thisArgument, arguments_));
  },
  construct(target, arguments_, newTarget) {
    if (allocationActive) allocationCounts.bufferConstructor += 1;
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
  if (new.target) return Reflect.construct(nativeRegExp, arguments_);
  return Reflect.apply(nativeRegExp, undefined, arguments_);
}
instrumentedRegExp.prototype = nativeRegExp.prototype;
nativeObject.setPrototypeOf(instrumentedRegExp, nativeRegExp);
class InstrumentedTextEncoder extends nativeTextEncoder {
  constructor(...arguments_) {
    if (allocationActive) allocationCounts.textEncoder += 1;
    super(...arguments_);
  }
  encode(...arguments_) {
    if (allocationActive) allocationCounts.textEncode += 1;
    c3LifecycleBeforeAllocation("textEncoderOutput");
    return c3TrackAllocation("textEncoderOutput", super.encode(...arguments_));
  }
  encodeInto(...arguments_) {
    if (allocationActive) allocationCounts.textEncode += 1;
    if (arguments_.length > 1) c3LifecycleMarkByte(arguments_[1], "textEncoderDestination");
    return super.encodeInto(...arguments_);
  }
}
const instrumentedJSONStringify = (...arguments_) => {
  if (allocationActive) allocationCounts.jsonStringify += 1;
  return nativeJSON.stringify(...arguments_);
};
const instrumentedJSONParse = (...arguments_) => {
  if (allocationActive) allocationCounts.jsonParse += 1;
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
  if (allocationActive && Array.isArray(globalThis.__c3AllocationTrace)) globalThis.__c3AllocationTrace.push(["createHash"]);
  const current = c3LifecycleCurrent;
  if (current) {
    current.hashOrdinal += 1;
    current.hashes.push({ ordinal: current.hashOrdinal });
    if (current.fault && current.fault.kind === "hash"
      && current.fault.ordinal === current.hashOrdinal && !current.faultTriggered) {
      current.faultTriggered = true;
      throw new Error("synthetic C3 hash failure");
    }
  }
  const hash = crypto.createHash(...arguments_);
  if (!current) return hash;
  const nativeUpdate = hash.update;
  const nativeDigest = hash.digest;
  nativeObject.defineProperties(hash, {
    update: {
      value(...updateArguments) {
        if (updateArguments.length > 0) c3LifecycleMarkByte(updateArguments[0], "hashInput");
        Reflect.apply(nativeUpdate, hash, updateArguments);
        return hash;
      }, configurable: true
    },
    digest: {
      value(...digestArguments) {
        const result = Reflect.apply(nativeDigest, hash, digestArguments);
        return nativeBuffer.isBuffer(result) || result instanceof nativeUint8Array
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
    const entry = { ordinal: current.fillOrdinal, byteId: record ? record.id : null, zero: arguments_[0] === 0 };
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
        zero: true
      }]);
      roleShouldFail = current.fault && current.fault.kind === "fillRole"
        && current.fault.role === "preimage"
        && current.fault.ordinal === current.roleFillOrdinals.preimage && !current.faultTriggered;
    }
  }
  const result = Reflect.apply(nativeBufferFill, this, arguments_);
  if (shouldFail || roleShouldFail) {
    current.faultTriggered = true;
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
    const entry = { ordinal: current.fillOrdinal, byteId: record ? record.id : null, zero: arguments_[0] === 0 };
    current.fills.push(entry);
    if (record) record.fills.push({ phase: current.name, ordinal: current.fillOrdinal, zero: entry.zero });
    shouldFail = current.fault && current.fault.kind === "fill"
      && current.fault.ordinal === current.fillOrdinal && !current.faultTriggered;
  }
  const result = Reflect.apply(nativeUint8ArrayFill, this, arguments_);
  if (shouldFail) {
    current.faultTriggered = true;
    throw new Error("synthetic C3 fill failure");
  }
  return result;
}

const unused = () => { throw new Error("unused synthetic builtin"); };
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
  JSON: instrumentedJSON,
  Map: instrumentedMap,
  Object: instrumentedObject,
  Proxy: instrumentedProxy,
  RegExp: instrumentedRegExp,
  Set: instrumentedSet,
  TextEncoder: InstrumentedTextEncoder,
  WeakMap: instrumentedWeakMap,
  WeakSet: instrumentedWeakSet,
  TextDecoder,
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
  "function __test_c3Trace(...values) { if (Array.isArray(globalThis.__c3AllocationTrace)) globalThis.__c3AllocationTrace.push(values); }",
  "if (typeof __test_reserveAuthorizationFixedEnvelope === 'function' && typeof __test_deriveAuthorizationSshSyntax === 'function' && typeof __test_disposeAuthorizationSshSyntax === 'function') {",
  "  const __test_c3RealReserveFixed = reserveAuthorizationFixedEnvelope;",
  "  reserveAuthorizationFixedEnvelope = function (graph) { __test_c3Trace('reserve-fixed'); const value = __test_c3RealReserveFixed(graph); if (typeof globalThis.__c3LifecycleSignal === 'function') globalThis.__c3LifecycleSignal('fixed'); return value; };",
  "  const __test_c3RealReserveSemantic = reserveAuthorizationSemanticNode;",
  "  reserveAuthorizationSemanticNode = function (graph, kind) { __test_c3Trace('reserve-semantic', kind); const value = __test_c3RealReserveSemantic(graph, kind); if (typeof globalThis.__c3LifecycleSignal === 'function') globalThis.__c3LifecycleSignal('semantic', kind); return value; };",
  "  const __test_c3RealReserveWork = reserveAuthorizationWorkUnit;",
  "  reserveAuthorizationWorkUnit = function (graph, kind) { __test_c3Trace('reserve-work', kind); return __test_c3RealReserveWork(graph, kind); };",
  "  const __test_c3RealReservePreimage = reservePreimageBytes;",
  "  reservePreimageBytes = function (snapshot, length) { __test_c3Trace('reserve-preimage', length); const value = __test_c3RealReservePreimage(snapshot, length); if (typeof globalThis.__c3LifecycleSignal === 'function') globalThis.__c3LifecycleSignal('preimage', length); return value; };",
  "  const __test_c3RealScanWildcard = scanAuthorizationWildcardPattern;",
  "  scanAuthorizationWildcardPattern = function (graph, pattern) { __test_c3Trace('scan-wildcard', pattern.length); return __test_c3RealScanWildcard(graph, pattern); };",
  "  const __test_c3RealMatchWildcard = matchAuthorizationWildcard;",
  "  matchAuthorizationWildcard = function (graph, domain, pattern, target, starIndex) { __test_c3Trace('match-wildcard', domain, pattern.length, target.length, starIndex); return __test_c3RealMatchWildcard(graph, domain, pattern, target, starIndex); };",
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
  "function __test_c3Arities() { return {",
  "  reserveAuthorizationFixedEnvelope: typeof __test_reserveAuthorizationFixedEnvelope === 'function' ? __test_reserveAuthorizationFixedEnvelope.length : null,",
  "  deriveAuthorizationSshSyntax: typeof __test_deriveAuthorizationSshSyntax === 'function' ? __test_deriveAuthorizationSshSyntax.length : null,",
  "  disposeAuthorizationSshSyntax: typeof __test_disposeAuthorizationSshSyntax === 'function' ? __test_disposeAuthorizationSshSyntax.length : null",
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
  "  __test_c2bArities, __test_c2bCreateState, __test_c2bPolicy, __test_c2bProxyInstrumentation, __test_c2bReserveSource, __test_c2bReserveSourceWithSemanticTrace, __test_c2bTerminalSourceOperation, __test_c3Arities,",
  "  __test_consumeTrustedAuthorizationSource, __test_createAuthorizationSourceGraph, __test_createAuthorizationSourceSnapshot,",
  "  __test_c2bFixedShape, __test_inspectAuthorizationBudgetState, __test_reserveAuthorizationSourceFile,",
  "  __test_deriveAuthorizationSshSyntax, __test_disposeAuthorizationSshSyntax, __test_matchAuthorizationWildcard, __test_missingC2BSymbols, __test_missingC3Symbols, __test_nextAuthorizationBudgetValue, __test_reserveAuthorizationFixedEnvelope, __test_reserveAuthorizationSemanticNode,",
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
try { await module.evaluate(); }
finally { allocationActive = false; }
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
const C3_EXACT_BLOCK_BEGIN = "// C3_SSH_SOURCE_BLOCK_BEGIN";
const C3_EXACT_BLOCK_END = "// C3_SSH_SOURCE_BLOCK_END";
const C3_EXACT_BLOCK_SIZE = 61980;
const C3_EXACT_BLOCK_LINES = 1482;
const C3_EXACT_BLOCK_SHA256 = "cf93a44d95dc99ff305eaf465509ccf2fcdb54f92988fa8cba7294503bb2e740";
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

function c3Stat(entry, overrides = {}) {
  const type = overrides.type || entry.type;
  const directory = type === "directory";
  const file = type === "file";
  const typeBits = directory ? 0o040000n : file ? 0o100000n : 0n;
  return {
    uid: BigInt(overrides.uid === undefined ? 0 : overrides.uid),
    gid: BigInt(overrides.gid === undefined ? 0 : overrides.gid),
    mode: typeBits | BigInt(overrides.mode === undefined ? entry.mode : overrides.mode),
    nlink: BigInt(overrides.nlink === undefined ? (directory ? 2 : 1) : overrides.nlink),
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
    const [path, input] = fileSpecs[index];
    const bytes = nativeBuffer.isBuffer(input) ? nativeBuffer.from(input) : nativeBuffer.from(input, "utf8");
    const role = "file-" + index;
    pathRoles.set(path, role);
    entries.set(path, { type: "file", mode: 0o644, bytes, ino: ordinal, role });
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
    return fault && fault.kind === kind && (fault.role === undefined || fault.role === role);
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
      descriptors.set(fd, {
        entry,
        fstatCount: 0,
        readOffset: 0,
        eofConfirmed: false,
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
      const count = entry.bytes.length - position;
      entry.bytes.copy(buffer, offset, position, position + count);
      descriptor.readOffset += count;
      return count;
    },
    close(fd) {
      const descriptor = descriptors.get(fd);
      const role = descriptor ? descriptor.entry.role : "unrecognized-fd";
      calls.push(["close", role]);
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
  return { calls, pathOperations, sourceOperations, pathRoles };
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
      objectAllocations: phase.objectAllocationEntries.map((entry) => ({
        ordinal: entry.ordinal,
        classification: entry.classification
      })),
      fixedAllocations: phase.fixedAllocations.map((entry) => ({ ...entry })),
      roleAllocations: phase.roleAllocations.map((entry) => ({ ...entry })),
      roleFills: phase.roleFills.map((entry) => ({ ...entry })),
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
      registry: phase.registry.map((entry) => ({
        method: entry.method,
        keyShape: entry.keyShape,
        sameGraph: entry.sameGraph,
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

function c3FixtureProof(name) {
  const state = fresh();
  return {
    scenarioKnown: ["depth", "coordinates", "include", "lexer"].includes(name),
    linked: module.status === "linked" || module.status === "evaluated",
    evaluated: module.status === "evaluated",
    nativeTypes: api.__test_c2bProxyInstrumentation(state),
    c3Arities: api.__test_c3Arities(),
    freshState: inspect(state)
  };
}

function c3UnknownScenario() {
  throw new Error("unknown C3 scenario");
}

try {
  const fixture = c3FixtureProof(scenario);
  const missingSymbols = api.__test_missingC3Symbols();
  const scenarioValue = missingSymbols.length !== 0
    ? undefined
    : scenario === "depth"
      ? c3DepthScenario()
      : scenario === "coordinates"
        ? c3CoordinateScenario()
        : scenario === "include"
          ? c3IncludeScenario()
          : scenario === "lexer"
            ? c3LexerScenario()
            : c3UnknownScenario();
  process.stdout.write(JSON.stringify({ error: null, value: { fixture, missingSymbols, moduleAllocationCounts, scenarioValue } }));
} catch (error) {
  process.stdout.write(JSON.stringify({ error: errorCode(error) }));
}
`;

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
