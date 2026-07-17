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
import { promisify } from "node:util";
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
  ["node:util", synthetic(["promisify"], { promisify })],
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
let account;
let error;
try {
  Buffer.prototype.toString = function (...arguments_) {
    if (this.includes(sentinel)) throw new Error("whole_sensitive_decode");
    return originalToString.apply(this, arguments_);
  };
  account = module.namespace.__test_createNativeAccountOperations(payload.binding).readAccount();
} catch (caught) {
  error = caught && caught.code ? caught.code : "unexpected";
} finally {
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
  zeroized: captures.every((buffer) => buffer.every((byte) => byte === 0))
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
