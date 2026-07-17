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
import { promisify } from "node:util";
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
  ["node:util", synthetic(["promisify"], { promisify })],
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
const nativeRegExp = RegExp;
const nativeTextEncoder = TextEncoder;
const nativeJSON = JSON;
let allocationActive = false;
const allocationCounts = {
  objectCall: 0, objectCreate: 0, array: 0, map: 0, set: 0, weakMap: 0, weakSet: 0, proxy: 0,
  bufferConstructor: 0, bufferAlloc: 0, bufferAllocUnsafe: 0, bufferConcat: 0, bufferFrom: 0, bufferOf: 0,
  createHash: 0, regexp: 0,
  textEncoder: 0, textEncode: 0, jsonStringify: 0, jsonParse: 0
};

function instrumentedObject(value) {
  if (allocationActive) allocationCounts.objectCall += 1;
  return nativeObject(value);
}
instrumentedObject.prototype = nativeObject.prototype;
nativeObject.setPrototypeOf(instrumentedObject, nativeObject);
instrumentedObject.create = (...arguments_) => {
  if (allocationActive) allocationCounts.objectCreate += 1;
  return nativeObject.create(...arguments_);
};
function instrumentedArray(...arguments_) {
  if (allocationActive) allocationCounts.array += 1;
  return new nativeArray(...arguments_);
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
  return new nativeWeakMap(iterable);
}
instrumentedWeakMap.prototype = nativeWeakMap.prototype;
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
  return nativeBuffer.alloc(...arguments_);
};
const instrumentedBufferFrom = (...arguments_) => {
  if (allocationActive) allocationCounts.bufferFrom += 1;
  return nativeBuffer.from(...arguments_);
};
const instrumentedBufferAllocUnsafe = (...arguments_) => {
  if (allocationActive) allocationCounts.bufferAllocUnsafe += 1;
  return nativeBuffer.allocUnsafe(...arguments_);
};
const instrumentedBufferAllocUnsafeSlow = (...arguments_) => {
  if (allocationActive) allocationCounts.bufferAllocUnsafe += 1;
  return nativeBuffer.allocUnsafeSlow(...arguments_);
};
const instrumentedBufferConcat = (...arguments_) => {
  if (allocationActive) allocationCounts.bufferConcat += 1;
  return nativeBuffer.concat(...arguments_);
};
const instrumentedBufferOf = (...arguments_) => {
  if (allocationActive) allocationCounts.bufferOf += 1;
  return nativeBuffer.of(...arguments_);
};
const instrumentedBuffer = new Proxy(nativeBuffer, {
  apply(target, thisArgument, arguments_) {
    if (allocationActive) allocationCounts.bufferConstructor += 1;
    return Reflect.apply(target, thisArgument, arguments_);
  },
  construct(target, arguments_, newTarget) {
    if (allocationActive) allocationCounts.bufferConstructor += 1;
    return Reflect.construct(target, arguments_, newTarget);
  },
  get(target, property) {
    if (property === "alloc") return instrumentedBufferAlloc;
    if (property === "allocUnsafe") return instrumentedBufferAllocUnsafe;
    if (property === "allocUnsafeSlow") return instrumentedBufferAllocUnsafeSlow;
    if (property === "concat") return instrumentedBufferConcat;
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
    return super.encode(...arguments_);
  }
  encodeInto(...arguments_) {
    if (allocationActive) allocationCounts.textEncode += 1;
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
  return crypto.createHash(...arguments_);
};

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
  ["node:util", synthetic(["promisify"], { promisify })],
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
  "  __test_c2bArities, __test_c2bCreateState, __test_c2bPolicy, __test_c2bProxyInstrumentation, __test_c2bReserveSource, __test_c2bReserveSourceWithSemanticTrace, __test_c2bTerminalSourceOperation,",
  "  __test_consumeTrustedAuthorizationSource, __test_createAuthorizationSourceGraph, __test_createAuthorizationSourceSnapshot,",
  "  __test_c2bFixedShape, __test_inspectAuthorizationBudgetState, __test_reserveAuthorizationSourceFile,",
  "  __test_matchAuthorizationWildcard, __test_missingC2BSymbols, __test_nextAuthorizationBudgetValue, __test_reserveAuthorizationSemanticNode,",
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
