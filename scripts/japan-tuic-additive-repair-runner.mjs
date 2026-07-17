#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  chownSync,
  closeSync,
  constants,
  copyFileSync,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync
} from "node:fs";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join, posix, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

import {
  JAPAN_TUIC_REPAIR_GATE,
  JAPAN_TUIC_REPAIR_GATE_V3,
  JapanTuicRepairContractError,
  validateArtifactIdentity,
  validateCandidateReport,
  validateExecutionReceipt,
  validateNaturalObservation,
  validatePostApplyIdentity
} from "./japan-tuic-additive-repair-contract.mjs";
import { executionClaimSha256 } from "./japan-tuic-additive-repair-state.mjs";

const BINDING_PATH_KEYS = Object.freeze([
  "authorizedKeys",
  "backupDirectory",
  "currentMap",
  "materialStore",
  "mihomoConfig",
  "naturalObservation",
  "producerStatus",
  "temporaryRoot"
]);

const ALLOWED_ZIP_TYPES = new Set(["-", "d"]);
const REQUIRED_ARCHIVE_ENTRIES = Object.freeze([
  "scripts/mihomo-tuic-usage-map-rebuild.mjs",
  "scripts/traffic-accounting-natural-observation.mjs",
  "server/services/platform/traffic-collector-admin-projection.mjs",
  "server/services/platform/traffic-collector-status-producers.mjs"
]);
const SAFE_ERROR_CODES = new Set([
  "artifact_identity_mismatch",
  "atomic_apply_failed",
  "backup_failed",
  "expected_count_mismatch",
  "host_cleanup_failed",
  "natural_observation_failed",
  "natural_observation_timeout",
  "post_apply_invariant_failed",
  "receipt_validation_failed",
  "restricted_identity_rejected",
  "rollback_verification_failed",
  "stable_snapshot_unavailable",
  "target_identity_mismatch",
  "workflow_identity_mismatch"
]);
const execFileAsync = promisify(execFileCallback);
const MAX_HELPER_OUTPUT_BYTES = 64 * 1024;
const MAX_PROTECTED_OBSERVATION_BYTES = 4 * 1024 * 1024;

function safeError(code) {
  return new JapanTuicRepairContractError(code);
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function exactKeys(value, expected) {
  const keys = Object.keys(record(value)).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function utf8PathIdentity(value) {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.toString("utf8") !== value) restricted();
  return bytes.toString("hex");
}

function safeAbsolutePath(value) {
  const structurallySafe = typeof value === "string"
    && value.length > 1
    && value.length <= 4096
    && !value.includes("\0")
    && !value.includes("\\")
    && posix.isAbsolute(value)
    && posix.normalize(value) === value;
  if (!structurallySafe) return false;
  try {
    utf8PathIdentity(value);
    return true;
  } catch {
    return false;
  }
}

function validateLegacyRunnerBindingForLocalTest(input = {}) {
  const value = record(input);
  if (!exactKeys(value, ["authorizationMarker", "gateId", "paths", "schemaVersion", "units"])
    || value.schemaVersion !== "1"
    || value.gateId !== JAPAN_TUIC_REPAIR_GATE.executionGateId) {
    throw safeError("target_identity_mismatch");
  }
  const paths = record(value.paths);
  if (!exactKeys(paths, [...BINDING_PATH_KEYS].sort())) throw safeError("target_identity_mismatch");
  const pathValues = BINDING_PATH_KEYS.map((key) => paths[key]);
  if (pathValues.some((path) => !safeAbsolutePath(path))
    || new Set(pathValues.map(utf8PathIdentity)).size !== pathValues.length) {
    throw safeError("target_identity_mismatch");
  }
  const units = record(value.units);
  if (!exactKeys(units, ["service", "timer"])
    || units.timer !== "gccgw-traffic-usage-collect.timer"
    || units.service !== "gccgw-traffic-usage-collect.service"
    || typeof value.authorizationMarker !== "string"
    || !/^[A-Za-z0-9._:-]{16,160}$/.test(value.authorizationMarker)) {
    throw safeError("target_identity_mismatch");
  }
  return {
    schemaVersion: "1",
    gateId: JAPAN_TUIC_REPAIR_GATE.executionGateId,
    paths: Object.fromEntries(BINDING_PATH_KEYS.map((key) => [key, paths[key]])),
    units: { timer: units.timer, service: units.service },
    authorizationMarker: value.authorizationMarker
  };
}

const RESTRICTED_CODE = "restricted_identity_rejected";
const LOWER_SHA256 = /^[0-9a-f]{64}$/;
const LOWER_COMMIT = /^[0-9a-f]{40}$/;
const EMPTY_SHA256 = createHash("sha256").update(Buffer.alloc(0)).digest("hex");
const BINDING_PATH = "/etc/gccgw/japan-tuic-additive-repair-binding.json";
const BOOTSTRAP_PATH = "/usr/local/libexec/gccgw/japan-tuic-additive-repair-bootstrap.mjs";
const ENTRYPOINT_PATH = "/usr/local/libexec/gccgw/japan-tuic-additive-repair-entrypoint";
const AUTHORIZED_KEYS_PATH = "/etc/ssh/authorized_keys/gccgw-japan-repair-ci";
const ACCOUNT_HOME_PATH = "/var/lib/gccgw-japan-repair-ci";
const SUDOERS_PATH = "/etc/sudoers.d/gccgw-japan-repair-ci";
const ACCOUNT_USERNAME = "gccgw-japan-repair-ci";
const SECURE_PATH = "/usr/sbin:/usr/bin:/sbin:/bin";
const TOP_LEVEL_KEYS = Object.freeze([
  "schemaVersion", "gateId", "expectedEuid", "expectedWorkflowCommit",
  "expectedNonceSha256", "expectedClaimSha256", "codeManifest", "toolManifest",
  "sshAuthorization", "sudoAuthorization", "paths", "pathPolicies", "units",
  "writerFreeze", "authorizationMarker"
]);
const CODE_ROLES = Object.freeze(["bootstrap", "contract", "entrypoint", "frame", "runner", "state"]);
const CODE_PATHS = Object.freeze({
  bootstrap: BOOTSTRAP_PATH,
  contract: "/usr/local/libexec/gccgw/japan-tuic-additive-repair-contract.mjs",
  entrypoint: ENTRYPOINT_PATH,
  frame: "/usr/local/libexec/gccgw/japan-tuic-additive-repair-frame.mjs",
  runner: "/usr/local/libexec/gccgw/japan-tuic-additive-repair-runner.mjs",
  state: "/usr/local/libexec/gccgw/japan-tuic-additive-repair-state.mjs"
});
const TOOL_ROLES = Object.freeze(["dash", "env", "flock", "node", "sudo", "systemctl", "unzip", "visudo"]);
const TOOL_PATHS = Object.freeze({
  dash: "/usr/bin/dash",
  env: "/usr/bin/env",
  flock: "/usr/bin/flock",
  node: "/usr/bin/node",
  sudo: "/usr/bin/sudo",
  systemctl: "/usr/bin/systemctl",
  unzip: "/usr/bin/unzip",
  visudo: "/usr/sbin/visudo"
});
const PATH_ROLES = Object.freeze([
  "authorizedKeys", "backupDirectory", "currentMap", "lockFile", "materialStore",
  "mihomoConfig", "naturalObservation", "producerStatus", "stateDirectory",
  "sudoersFile", "temporaryRoot"
]);
const FIXED_PATHS = Object.freeze({
  authorizedKeys: AUTHORIZED_KEYS_PATH,
  backupDirectory: "/var/lib/gccgw/japan-tuic-additive-repair/backups",
  lockFile: "/var/lib/gccgw/japan-tuic-additive-repair/repair.lock",
  stateDirectory: "/var/lib/gccgw/japan-tuic-additive-repair",
  sudoersFile: SUDOERS_PATH,
  temporaryRoot: "/var/lib/gccgw/japan-tuic-additive-repair/tmp"
});
const SOURCE_FILE_KEYS = Object.freeze(["ordinal", "path", "sha256", "uid", "gid", "mode", "nlink"]);
const POLICY_KEYS = Object.freeze(["type", "uid", "gid", "mode", "nlink"]);
const AUDITED_LINUX_OPEN_CONSTANTS = Object.freeze({
  O_RDONLY: 0x00000,
  O_DIRECTORY: 0x10000,
  O_NOFOLLOW: 0x20000,
  O_CLOEXEC: 0x80000
});
const AUDITED_FILE_OPEN_FLAGS = 0xA0000;
const AUDITED_DIRECTORY_OPEN_FLAGS = 0xB0000;

function restricted() {
  throw safeError(RESTRICTED_CODE);
}

function hasKeys(value, keys) {
  return exactKeys(value, [...keys].sort());
}

function canonicalObject(value, keys) {
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}

function nonNegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function positiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function lowerSha256(value) {
  return typeof value === "string" && LOWER_SHA256.test(value);
}

function hashCanonical(value) {
  return createHash("sha256").update(`${JSON.stringify(value)}\n`, "utf8").digest("hex");
}

function canonicalManifestEntry(input, { path, mode, maximum, tool = false } = {}) {
  const keys = tool
    ? ["path", "sizeBytes", "sha256", "type", "uid", "gid", "mode", "nlink", "capabilitySha256"]
    : ["path", "sizeBytes", "sha256", "type", "uid", "gid", "mode", "nlink"];
  const value = record(input);
  if (!hasKeys(value, keys)
    || value.path !== path
    || !positiveSafeInteger(value.sizeBytes)
    || value.sizeBytes > maximum
    || !lowerSha256(value.sha256)
    || value.type !== "file"
    || value.uid !== 0
    || value.gid !== 0
    || value.mode !== mode
    || value.nlink !== 1
    || (tool && value.capabilitySha256 !== EMPTY_SHA256)) restricted();
  return canonicalObject(value, keys);
}

function canonicalPathPolicy(input) {
  const value = record(input);
  if (!hasKeys(value, POLICY_KEYS)
    || !new Set(["file", "directory"]).has(value.type)
    || !nonNegativeSafeInteger(value.uid)
    || !nonNegativeSafeInteger(value.gid)
    || !nonNegativeSafeInteger(value.mode)
    || value.mode > 0o777
    || (value.mode & 0o022) !== 0
    || (value.type === "file" ? value.nlink !== 1 : value.nlink !== null)) restricted();
  return canonicalObject(value, POLICY_KEYS);
}

function requireFixedPathPolicies(paths, policies) {
  const fixed = {
    authorizedKeys: ["file", 0, 0, 0o600, 1],
    backupDirectory: ["directory", 0, 0, 0o700, null],
    lockFile: ["file", 0, 0, 0o600, 1],
    stateDirectory: ["directory", 0, 0, 0o700, null],
    sudoersFile: ["file", 0, 0, 0o440, 1],
    temporaryRoot: ["directory", 0, 0, 0o700, null]
  };
  for (const [role, expected] of Object.entries(fixed)) {
    const policy = policies[role];
    if (paths[role] !== FIXED_PATHS[role]
      || [policy.type, policy.uid, policy.gid, policy.mode, policy.nlink]
        .some((item, index) => item !== expected[index])) restricted();
  }
  if (policies.currentMap.type !== "file" || policies.currentMap.mode !== 0o600) restricted();
  for (const role of ["materialStore", "mihomoConfig", "naturalObservation", "producerStatus"]) {
    if (policies[role].type !== "file" || !new Set([0o400, 0o600]).has(policies[role].mode)) restricted();
  }
}

function canonicalSshAuthorization(input, paths, tools) {
  const keys = [
    "algorithm", "authorizedKeysFile", "authorizedKeysLineSha256", "effectiveConfigSha256",
    "homeDirectory", "homeDirectoryPolicy", "loginShell", "loginShellPolicy",
    "publicKeyBlobSha256", "uid", "username"
  ];
  const value = record(input);
  if (!hasKeys(value, keys)
    || value.algorithm !== "ssh-ed25519"
    || value.authorizedKeysFile !== paths.authorizedKeys
    || !lowerSha256(value.authorizedKeysLineSha256)
    || !lowerSha256(value.effectiveConfigSha256)
    || value.homeDirectory !== ACCOUNT_HOME_PATH
    || value.loginShell !== tools.dash.path
    || !lowerSha256(value.publicKeyBlobSha256)
    || !positiveSafeInteger(value.uid)
    || value.username !== ACCOUNT_USERNAME) restricted();
  const homePolicy = canonicalPathPolicy(value.homeDirectoryPolicy);
  if (homePolicy.type !== "directory" || homePolicy.uid !== 0 || homePolicy.gid !== 0
    || homePolicy.mode !== 0o755 || homePolicy.nlink !== null) restricted();
  const shellKeys = ["type", "uid", "gid", "mode", "nlink", "sha256"];
  const shell = record(value.loginShellPolicy);
  if (!hasKeys(shell, shellKeys)
    || shell.type !== tools.dash.type
    || shell.uid !== tools.dash.uid
    || shell.gid !== tools.dash.gid
    || shell.mode !== tools.dash.mode
    || shell.nlink !== tools.dash.nlink
    || shell.sha256 !== tools.dash.sha256) restricted();
  return {
    algorithm: value.algorithm,
    authorizedKeysFile: value.authorizedKeysFile,
    authorizedKeysLineSha256: value.authorizedKeysLineSha256,
    effectiveConfigSha256: value.effectiveConfigSha256,
    homeDirectory: value.homeDirectory,
    homeDirectoryPolicy: homePolicy,
    loginShell: value.loginShell,
    loginShellPolicy: canonicalObject(shell, shellKeys),
    publicKeyBlobSha256: value.publicKeyBlobSha256,
    uid: value.uid,
    username: value.username
  };
}

function canonicalSudoAuthorization(input, ssh, paths) {
  const keys = [
    "schemaVersion", "type", "username", "uid", "sudoersFile", "sudoersFileSha256",
    "command", "commandArguments", "runAsUid", "runAsGid", "nonInteractive",
    "nopasswd", "envReset", "setenvAllowed", "securePath", "otherRuleCount",
    "sourceClosureSha256", "effectivePolicySha256"
  ];
  const value = record(input);
  if (!hasKeys(value, keys)
    || value.schemaVersion !== "1"
    || value.type !== "japan_ci_sudo_authorization"
    || value.username !== ssh.username
    || value.uid !== ssh.uid
    || value.sudoersFile !== paths.sudoersFile
    || !lowerSha256(value.sudoersFileSha256)
    || value.command !== ENTRYPOINT_PATH
    || !Array.isArray(value.commandArguments) || value.commandArguments.length !== 0
    || value.runAsUid !== 0 || value.runAsGid !== 0
    || value.nonInteractive !== true || value.nopasswd !== true || value.envReset !== true
    || value.setenvAllowed !== false || value.securePath !== SECURE_PATH
    || value.otherRuleCount !== 0
    || !lowerSha256(value.sourceClosureSha256)
    || !lowerSha256(value.effectivePolicySha256)) restricted();
  return canonicalObject(value, keys);
}

export function buildCanonicalRunnerBinding(input = {}) {
  const value = record(input);
  if (!hasKeys(value, TOP_LEVEL_KEYS)
    || value.schemaVersion !== "3"
    || value.gateId !== JAPAN_TUIC_REPAIR_GATE_V3.executionGateId
    || value.expectedEuid !== 0
    || typeof value.expectedWorkflowCommit !== "string"
    || !LOWER_COMMIT.test(value.expectedWorkflowCommit)
    || value.expectedNonceSha256 !== JAPAN_TUIC_REPAIR_GATE_V3.expectedNonceSha256) restricted();
  const expectedClaim = executionClaimSha256({
    artifactSha256: JAPAN_TUIC_REPAIR_GATE_V3.artifact.sha256,
    executionGateId: JAPAN_TUIC_REPAIR_GATE_V3.executionGateId,
    executionNonce: JAPAN_TUIC_REPAIR_GATE_V3.executionNonce,
    releaseUnit: JAPAN_TUIC_REPAIR_GATE_V3.releaseUnit,
    strategy: JAPAN_TUIC_REPAIR_GATE_V3.strategy,
    surface: JAPAN_TUIC_REPAIR_GATE_V3.surface,
    target: JAPAN_TUIC_REPAIR_GATE_V3.target,
    workflowCommit: value.expectedWorkflowCommit
  });
  if (value.expectedClaimSha256 !== expectedClaim) restricted();

  const codeInput = record(value.codeManifest);
  if (!hasKeys(codeInput, CODE_ROLES)) restricted();
  const codeManifest = {};
  for (const role of CODE_ROLES) {
    codeManifest[role] = canonicalManifestEntry(codeInput[role], {
      path: CODE_PATHS[role],
      mode: role === "entrypoint" ? 0o755 : 0o644,
      maximum: role === "entrypoint" ? 16384 : role === "bootstrap" ? 65536 : 1048576
    });
  }
  const toolInput = record(value.toolManifest);
  if (!hasKeys(toolInput, TOOL_ROLES)) restricted();
  const toolManifest = {};
  for (const role of TOOL_ROLES) {
    toolManifest[role] = canonicalManifestEntry(toolInput[role], {
      path: TOOL_PATHS[role],
      mode: role === "sudo" ? 0o4755 : 0o755,
      maximum: 268435456,
      tool: true
    });
  }

  const pathInput = record(value.paths);
  if (!hasKeys(pathInput, PATH_ROLES)) restricted();
  const paths = canonicalObject(pathInput, PATH_ROLES);
  if (Object.values(paths).some((path) => !safeAbsolutePath(path))
    || new Set(Object.values(paths).map(utf8PathIdentity)).size !== PATH_ROLES.length) restricted();
  const policyInput = record(value.pathPolicies);
  if (!hasKeys(policyInput, PATH_ROLES)) restricted();
  const pathPolicies = Object.fromEntries(PATH_ROLES.map((role) => [role, canonicalPathPolicy(policyInput[role])]));
  requireFixedPathPolicies(paths, pathPolicies);

  const sshAuthorization = canonicalSshAuthorization(value.sshAuthorization, paths, toolManifest);
  const sudoAuthorization = canonicalSudoAuthorization(value.sudoAuthorization, sshAuthorization, paths);
  const units = record(value.units);
  if (!hasKeys(units, ["service", "timer"])
    || units.service !== "gccgw-traffic-usage-collect.service"
    || units.timer !== "gccgw-traffic-usage-collect.timer") restricted();
  const writer = record(value.writerFreeze);
  if (!hasKeys(writer, ["knownWriterCount", "evidenceSha256", "residualRisk"])
    || writer.knownWriterCount !== 0
    || !lowerSha256(writer.evidenceSha256)
    || writer.residualRisk !== "bound_writer_concurrency_not_machine_proven"
    || value.authorizationMarker !== JAPAN_TUIC_REPAIR_GATE_V3.executionGateId) restricted();

  return {
    schemaVersion: "3",
    gateId: value.gateId,
    expectedEuid: 0,
    expectedWorkflowCommit: value.expectedWorkflowCommit,
    expectedNonceSha256: value.expectedNonceSha256,
    expectedClaimSha256: value.expectedClaimSha256,
    codeManifest,
    toolManifest,
    sshAuthorization,
    sudoAuthorization,
    paths,
    pathPolicies,
    units: { service: units.service, timer: units.timer },
    writerFreeze: {
      knownWriterCount: 0,
      evidenceSha256: writer.evidenceSha256,
      residualRisk: writer.residualRisk
    },
    authorizationMarker: value.authorizationMarker
  };
}

function buildCanonicalSourceClosure(input, { type, rootConfig }) {
  const value = record(input);
  if (!hasKeys(value, ["schemaVersion", "type", "rootConfig", "files"])
    || value.schemaVersion !== "1" || value.type !== type || value.rootConfig !== rootConfig
    || !Array.isArray(value.files) || value.files.length === 0) restricted();
  const seen = new Set();
  const files = value.files.map((inputFile, index) => {
    const file = record(inputFile);
    const pathIdentity = safeAbsolutePath(file.path) ? utf8PathIdentity(file.path) : null;
    if (!hasKeys(file, SOURCE_FILE_KEYS)
      || file.ordinal !== index
      || pathIdentity === null
      || seen.has(pathIdentity)
      || !lowerSha256(file.sha256)
      || file.uid !== 0 || file.gid !== 0
      || !nonNegativeSafeInteger(file.mode) || file.mode > 0o777
      || (file.mode & 0o022) !== 0 || file.nlink !== 1) restricted();
    seen.add(pathIdentity);
    return canonicalObject(file, SOURCE_FILE_KEYS);
  });
  if (files[0].path !== rootConfig) restricted();
  return { schemaVersion: "1", type, rootConfig, files };
}

export function buildCanonicalSshIncludeClosure(input = {}) {
  return buildCanonicalSourceClosure(input, {
    type: "japan_ci_sshd_source_closure",
    rootConfig: "/etc/ssh/sshd_config"
  });
}

export function buildCanonicalSudoSourceClosure(input = {}) {
  return buildCanonicalSourceClosure(input, {
    type: "japan_ci_sudo_source_closure",
    rootConfig: "/etc/sudoers"
  });
}

const MATCH_NAMES = new Set(["user", "group", "host", "address", "localaddress", "localport", "rdomain", "localnetwork", "all"]);
const VARIABLE_DIMENSIONS = Object.freeze(["host", "address", "localaddress", "localport", "rdomain", "localnetwork"]);
const MATCH_TOKEN = /^[\x21-\x7e]+$/;

function canonicalMatchCondition(input) {
  const value = record(input);
  if (!hasKeys(value, ["name", "patterns"])
    || !MATCH_NAMES.has(value.name)
    || !Array.isArray(value.patterns)) restricted();
  if (value.name === "all") {
    if (value.patterns.length !== 0) restricted();
    return { name: "all", patterns: [] };
  }
  if (value.patterns.length === 0) restricted();
  const seen = new Set();
  const patterns = value.patterns.map((inputPattern) => {
    const pattern = record(inputPattern);
    if (!hasKeys(pattern, ["negated", "value"])
      || typeof pattern.negated !== "boolean"
      || typeof pattern.value !== "string"
      || !MATCH_TOKEN.test(pattern.value)
      || /[\s,\\[\]]/.test(pattern.value)
      || pattern.value.startsWith("!")
      || pattern.value.normalize("NFC") !== pattern.value) restricted();
    const identity = `${pattern.negated ? "!" : "+"}${pattern.value}`;
    if (seen.has(identity)) restricted();
    seen.add(identity);
    return { negated: pattern.negated, value: pattern.value };
  });
  return { name: value.name, patterns };
}

export function buildCanonicalSshMatchCoverage(input = {}) {
  const value = record(input);
  if (!hasKeys(value, ["schemaVersion", "type", "username", "groupIds", "branches"])
    || value.schemaVersion !== "1"
    || value.type !== "japan_ci_sshd_match_coverage"
    || value.username !== ACCOUNT_USERNAME
    || !Array.isArray(value.groupIds)
    || !value.groupIds.every(nonNegativeSafeInteger)
    || value.groupIds.some((groupId, index) => index > 0 && groupId <= value.groupIds[index - 1])
    || !Array.isArray(value.branches)) restricted();
  const branches = value.branches.map((inputBranch, index) => {
    const branch = record(inputBranch);
    const keys = ["ordinal", "sourceOrdinal", "lineNumber", "conditions", "accountDisposition", "variableDimensions"];
    if (!hasKeys(branch, keys)
      || branch.ordinal !== index
      || !nonNegativeSafeInteger(branch.sourceOrdinal)
      || !positiveSafeInteger(branch.lineNumber)
      || !Array.isArray(branch.conditions) || branch.conditions.length === 0
      || !new Set(["disjoint", "exact_user"]).has(branch.accountDisposition)
      || !Array.isArray(branch.variableDimensions)) restricted();
    const conditions = branch.conditions.map(canonicalMatchCondition);
    const names = conditions.map((condition) => condition.name);
    if (new Set(names).size !== names.length) restricted();
    if (names.includes("all")
      && (conditions.length !== 1 || branch.accountDisposition !== "exact_user")) restricted();
    const derivedDimensions = VARIABLE_DIMENSIONS.filter((dimension) => names.includes(dimension));
    if (branch.variableDimensions.length !== derivedDimensions.length
      || branch.variableDimensions.some((dimension, dimensionIndex) => dimension !== derivedDimensions[dimensionIndex])
      || (branch.accountDisposition === "exact_user" && derivedDimensions.length !== 0)) restricted();
    return {
      ordinal: branch.ordinal,
      sourceOrdinal: branch.sourceOrdinal,
      lineNumber: branch.lineNumber,
      conditions,
      accountDisposition: branch.accountDisposition,
      variableDimensions: [...branch.variableDimensions]
    };
  });
  return {
    schemaVersion: "1",
    type: "japan_ci_sshd_match_coverage",
    username: ACCOUNT_USERNAME,
    groupIds: [...value.groupIds],
    branches
  };
}

export function buildCanonicalSshTopology(input = {}) {
  const outputKeys = [
    "schemaVersion", "type", "username", "uid", "homeDirectory", "loginShell",
    "passwordLocked", "authenticationMethods", "pubkeyAuthentication",
    "passwordAuthentication", "keyboardInteractiveAuthentication", "hostbasedAuthentication",
    "gssapiAuthentication", "kerberosAuthentication", "permitUserEnvironment",
    "acceptedEnvironmentNames", "forceCommand", "chrootDirectory", "disableForwarding",
    "permitTunnel", "authorizedKeysFiles", "authorizedKeysCommand", "authorizedPrincipalsFiles",
    "authorizedPrincipalsCommand", "trustedUserCAKeys", "activeAuthorizationEntryCount",
    "targetKeyOccurrenceCount", "addressDependentAuthorizationBranchCount",
    "includeClosureSha256", "matchCoverageSha256"
  ];
  const inputKeys = [...outputKeys.slice(0, -2), "includeClosure", "matchCoverage"];
  const value = record(input);
  if (!hasKeys(value, inputKeys)
    || value.schemaVersion !== "1" || value.type !== "japan_ci_ssh_authorization_topology"
    || value.username !== ACCOUNT_USERNAME || !positiveSafeInteger(value.uid)
    || value.homeDirectory !== ACCOUNT_HOME_PATH || value.loginShell !== "/usr/bin/dash"
    || value.passwordLocked !== true
    || !Array.isArray(value.authenticationMethods)
    || value.authenticationMethods.length !== 1 || value.authenticationMethods[0] !== "publickey"
    || value.pubkeyAuthentication !== true
    || value.passwordAuthentication !== false
    || value.keyboardInteractiveAuthentication !== false
    || value.hostbasedAuthentication !== false
    || value.gssapiAuthentication !== false
    || value.kerberosAuthentication !== false
    || value.permitUserEnvironment !== false
    || !Array.isArray(value.acceptedEnvironmentNames) || value.acceptedEnvironmentNames.length !== 0
    || value.forceCommand !== "none" || value.chrootDirectory !== "none"
    || value.disableForwarding !== true || value.permitTunnel !== false
    || !Array.isArray(value.authorizedKeysFiles)
    || value.authorizedKeysFiles.length !== 1 || value.authorizedKeysFiles[0] !== AUTHORIZED_KEYS_PATH
    || value.authorizedKeysCommand !== "none"
    || !Array.isArray(value.authorizedPrincipalsFiles) || value.authorizedPrincipalsFiles.length !== 0
    || value.authorizedPrincipalsCommand !== "none"
    || !Array.isArray(value.trustedUserCAKeys) || value.trustedUserCAKeys.length !== 0
    || value.activeAuthorizationEntryCount !== 1 || value.targetKeyOccurrenceCount !== 1
    || value.addressDependentAuthorizationBranchCount !== 0) restricted();
  const includeClosure = buildCanonicalSshIncludeClosure(value.includeClosure);
  const matchCoverage = buildCanonicalSshMatchCoverage(value.matchCoverage);
  const output = canonicalObject(value, outputKeys.slice(0, -2));
  output.includeClosureSha256 = hashCanonical(includeClosure);
  output.matchCoverageSha256 = hashCanonical(matchCoverage);
  return output;
}

export function buildCanonicalSudoEffectivePolicy(input = {}) {
  const outputKeys = [
    "schemaVersion", "type", "username", "uid", "command", "commandArguments",
    "runAsUid", "runAsGid", "nonInteractive", "nopasswd", "envReset", "setenvAllowed",
    "securePath", "matchedRuleCount", "otherRuleCount", "sourceClosureSha256"
  ];
  const inputKeys = [...outputKeys.slice(0, -1), "sourceClosure"];
  const value = record(input);
  if (!hasKeys(value, inputKeys)
    || value.schemaVersion !== "1" || value.type !== "japan_ci_sudo_effective_policy"
    || value.username !== ACCOUNT_USERNAME || !positiveSafeInteger(value.uid)
    || value.command !== ENTRYPOINT_PATH
    || !Array.isArray(value.commandArguments) || value.commandArguments.length !== 0
    || value.runAsUid !== 0 || value.runAsGid !== 0
    || value.nonInteractive !== true || value.nopasswd !== true || value.envReset !== true
    || value.setenvAllowed !== false || value.securePath !== SECURE_PATH
    || value.matchedRuleCount !== 1 || value.otherRuleCount !== 0) restricted();
  const sourceClosure = buildCanonicalSudoSourceClosure(value.sourceClosure);
  const output = canonicalObject(value, outputKeys.slice(0, -1));
  output.sourceClosureSha256 = hashCanonical(sourceClosure);
  return output;
}

export function parseCanonicalAuthorizedKeyLine(input) {
  try {
    const bytes = Buffer.isBuffer(input) ? Buffer.from(input) : Buffer.from(input, "utf8");
    if (bytes.length === 0 || bytes.length > 16385 || bytes.includes(0) || bytes.includes(13)) restricted();
    let lineBytes = bytes;
    if (bytes.at(-1) === 10) lineBytes = bytes.subarray(0, -1);
    if (lineBytes.includes(10) || lineBytes.length === 0 || lineBytes.length > 16384
      || [...lineBytes].some((byte) => byte < 0x20 || byte > 0x7e)) restricted();
    const line = lineBytes.toString("ascii");
    const options = `restrict,no-pty,no-agent-forwarding,no-port-forwarding,no-X11-forwarding,command="/usr/bin/sudo -n -- ${ENTRYPOINT_PATH}"`;
    const prefix = `${options} ssh-ed25519 `;
    const suffix = ` ${JAPAN_TUIC_REPAIR_GATE_V3.executionGateId}`;
    if (!line.startsWith(prefix) || !line.endsWith(suffix)) restricted();
    const encoded = line.slice(prefix.length, -suffix.length);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) restricted();
    const blob = Buffer.from(encoded, "base64");
    if (blob.toString("base64") !== encoded || blob.length !== 4 + 11 + 4 + 32) restricted();
    const algorithmLength = blob.readUInt32BE(0);
    if (algorithmLength !== 11 || blob.subarray(4, 15).toString("ascii") !== "ssh-ed25519") restricted();
    const keyLength = blob.readUInt32BE(15);
    if (keyLength !== 32 || 19 + keyLength !== blob.length) restricted();
    return {
      algorithm: "ssh-ed25519",
      authorizationMarker: JAPAN_TUIC_REPAIR_GATE_V3.executionGateId,
      authorizedKeysLine: line,
      authorizedKeysLineSha256: createHash("sha256").update(lineBytes).digest("hex"),
      publicKeyBlobSha256: createHash("sha256").update(blob).digest("hex")
    };
  } catch (error) {
    if (error instanceof JapanTuicRepairContractError) throw error;
    restricted();
  }
}

function nativePathOperations() {
  validateNativeLinuxOpenFlags({ platform: process.platform, constants });
  return {
    lstat: (path) => lstatSync(path, { bigint: true }),
    open: (path, flags) => openSync(path, flags),
    fstat: (fd) => fstatSync(fd, { bigint: true }),
    read: (fd, buffer, offset, length, position) => readSync(fd, buffer, offset, length, position),
    close: (fd) => closeSync(fd)
  };
}

export function validateNativeLinuxOpenFlags(input = {}) {
  try {
    const value = record(input);
    const provided = record(value.constants);
    if (!hasKeys(value, ["platform", "constants"]) || value.platform !== "linux") restricted();
    for (const [name, expected] of Object.entries(AUDITED_LINUX_OPEN_CONSTANTS)) {
      if (!Object.hasOwn(provided, name)
        || typeof provided[name] !== "number"
        || !Number.isInteger(provided[name])
        || provided[name] !== expected) restricted();
    }
    return {
      fileFlags: AUDITED_FILE_OPEN_FLAGS,
      directoryFlags: AUDITED_DIRECTORY_OPEN_FLAGS
    };
  } catch (error) {
    if (error instanceof JapanTuicRepairContractError) throw error;
    restricted();
  }
}

function validatePathOperations(input) {
  const value = record(input);
  if (!hasKeys(value, ["lstat", "open", "fstat", "read", "close"])
    || ![value.lstat, value.open, value.fstat, value.read, value.close]
      .every((operation) => typeof operation === "function")) restricted();
  return value;
}

function validateBigintStatIdentity(stats, policy) {
  if (!stats || typeof stats !== "object"
    || !["uid", "gid", "mode", "nlink", "dev", "ino", "size"]
      .every((key) => typeof stats[key] === "bigint")
    || typeof stats.isDirectory !== "function"
    || typeof stats.isFile !== "function"
    || typeof stats.isSymbolicLink !== "function"
    || stats.isSymbolicLink()
    || stats.uid !== BigInt(policy.uid)
    || stats.gid !== BigInt(policy.gid)) restricted();
  if (policy.type === "file") {
    if (policy.nlink !== 1 || !stats.isFile() || stats.isDirectory() || stats.nlink !== 1n) restricted();
  } else if (policy.type === "directory") {
    if (policy.nlink !== null || !stats.isDirectory() || stats.isFile() || stats.nlink <= 0n) restricted();
  } else {
    restricted();
  }
}

function validateRuntimePathStat(stats, policy) {
  validateBigintStatIdentity(stats, policy);
  if ((stats.mode & 0o7000n) !== 0n
    || (stats.mode & 0o777n) !== BigInt(policy.mode)) restricted();
}

function validateManifestStat(stats, policy) {
  validateBigintStatIdentity(stats, policy);
  if ((stats.mode & 0o7777n) !== BigInt(policy.mode)) restricted();
}

function canonicalManifestPathPolicy(input) {
  const policy = record(input);
  if (!hasKeys(policy, POLICY_KEYS)
    || !new Set(["file", "directory"]).has(policy.type)
    || !nonNegativeSafeInteger(policy.uid)
    || !nonNegativeSafeInteger(policy.gid)
    || !nonNegativeSafeInteger(policy.mode)
    || policy.mode > 0o7777
    || (policy.type === "file" ? policy.nlink !== 1 : policy.nlink !== null)) restricted();
  return canonicalObject(policy, POLICY_KEYS);
}

function pathComponents(path) {
  const parts = path.split("/").filter(Boolean);
  const output = ["/"];
  let current = "";
  for (const part of parts) {
    current += `/${part}`;
    output.push(current);
  }
  return output;
}

function validateTrustedPathChainByAuthority(path, inputPolicy, inputOperations, consumeOpened, authority) {
  let fd;
  let opened = false;
  let result;
  let failure;
  let operations;
  try {
    if (!safeAbsolutePath(path) || path === "/" || (consumeOpened !== undefined && typeof consumeOpened !== "function")) {
      restricted();
    }
    const policy = authority === "manifest"
      ? canonicalManifestPathPolicy(inputPolicy)
      : canonicalPathPolicy(inputPolicy);
    const validateFinalStat = authority === "manifest" ? validateManifestStat : validateRuntimePathStat;
    operations = validatePathOperations(inputOperations);
    const components = pathComponents(path);
    const stats = components.map((component) => operations.lstat(component));
    for (const ancestor of stats.slice(0, -1)) {
      if (!ancestor || typeof ancestor !== "object"
        || typeof ancestor.uid !== "bigint" || typeof ancestor.mode !== "bigint"
        || typeof ancestor.isDirectory !== "function" || typeof ancestor.isSymbolicLink !== "function"
        || ancestor.uid !== 0n || !ancestor.isDirectory() || ancestor.isSymbolicLink()
        || (ancestor.mode & 0o022n) !== 0n) restricted();
    }
    const finalLstat = stats.at(-1);
    validateFinalStat(finalLstat, policy);
    const flags = policy.type === "directory" ? AUDITED_DIRECTORY_OPEN_FLAGS : AUDITED_FILE_OPEN_FLAGS;
    fd = operations.open(path, flags);
    if (!Number.isInteger(fd) || fd < 0) restricted();
    opened = true;
    const before = operations.fstat(fd);
    validateFinalStat(before, policy);
    if (before.dev !== finalLstat.dev || before.ino !== finalLstat.ino
      || (policy.type === "directory" && before.nlink !== finalLstat.nlink)) restricted();
    if (consumeOpened) result = consumeOpened(fd, before);
    const after = operations.fstat(fd);
    validateFinalStat(after, policy);
    if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size
      || (policy.type === "directory" && after.nlink !== before.nlink)) restricted();
  } catch (error) {
    failure = error;
  } finally {
    if (opened) {
      try {
        operations.close(fd);
      } catch (error) {
        failure = error;
      }
    }
  }
  if (failure) restricted();
  return result;
}

export function validateTrustedPathChain(path, inputPolicy, inputOperations, consumeOpened) {
  return validateTrustedPathChainByAuthority(path, inputPolicy, inputOperations, consumeOpened, "runtime");
}

function validateManifestPathChain(path, policy, operations, consumeOpened) {
  return validateTrustedPathChainByAuthority(path, policy, operations, consumeOpened, "manifest");
}

function readExactOpenedFile(fd, stats, operations, maximum) {
  if (stats.size <= 0n || stats.size > BigInt(maximum) || stats.size > BigInt(Number.MAX_SAFE_INTEGER)) restricted();
  const size = Number(stats.size);
  const bytes = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    let count;
    try {
      count = operations.read(fd, bytes, offset, size - offset, offset);
    } catch (error) {
      if (error && error.code === "EINTR") continue;
      restricted();
    }
    if (!Number.isInteger(count) || count < 0 || count > size - offset || count === 0) restricted();
    offset += count;
  }
  let eof;
  try {
    eof = operations.read(fd, Buffer.alloc(1), 0, 1, size);
  } catch (error) {
    if (error && error.code === "EINTR") return readConfirmedEof(fd, operations, size, bytes);
    restricted();
  }
  if (eof !== 0) restricted();
  return bytes;
}

function readConfirmedEof(fd, operations, position, bytes) {
  while (true) {
    try {
      const count = operations.read(fd, Buffer.alloc(1), 0, 1, position);
      if (count !== 0) restricted();
      return bytes;
    } catch (error) {
      if (!error || error.code !== "EINTR") restricted();
    }
  }
}

export function loadRootOwnedBinding(input = {}) {
  try {
    const value = record(input);
    if (!hasKeys(value, ["path", "effectiveUid", "pathOperations"])
      || value.path !== BINDING_PATH || value.effectiveUid !== 0) restricted();
    const operations = validatePathOperations(value.pathOperations);
    return validateTrustedPathChain(
      value.path,
      { type: "file", uid: 0, gid: 0, mode: 0o600, nlink: 1 },
      operations,
      (fd, stats) => {
        const bytes = readExactOpenedFile(fd, stats, operations, 65536);
        if (bytes.includes(13) || (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)) restricted();
        let text;
        try {
          text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        } catch {
          restricted();
        }
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch {
          restricted();
        }
        const canonical = buildCanonicalRunnerBinding(parsed);
        if (text !== `${JSON.stringify(canonical)}\n`) restricted();
        return canonical;
      }
    );
  } catch (error) {
    if (error instanceof JapanTuicRepairContractError) throw error;
    restricted();
  }
}

function readBoundManifestFile(path, manifest, operations, maximum) {
  return validateManifestPathChain(
    path,
    { type: "file", uid: manifest.uid, gid: manifest.gid, mode: manifest.mode, nlink: 1 },
    operations,
    (fd, stats) => {
      if (stats.size !== BigInt(manifest.sizeBytes)) restricted();
      const bytes = readExactOpenedFile(fd, stats, operations, maximum);
      if (createHash("sha256").update(bytes).digest("hex") !== manifest.sha256) restricted();
      return bytes;
    }
  );
}

export function validateRunnerBinding(input = {}, context = {}) {
  try {
    const contextValue = record(context);
    if (!hasKeys(contextValue, ["effectiveUid", "pathOperations"])
      || contextValue.effectiveUid !== 0) restricted();
    const operations = validatePathOperations(contextValue.pathOperations);
    const binding = buildCanonicalRunnerBinding(input);
    if (binding.expectedEuid !== contextValue.effectiveUid) restricted();
    for (const role of CODE_ROLES) {
      const entry = binding.codeManifest[role];
      const maximum = role === "entrypoint" ? 16384 : role === "bootstrap" ? 65536 : 1048576;
      const bytes = readBoundManifestFile(entry.path, entry, operations, maximum);
      if (role === "entrypoint" && !bytes.subarray(0, 16).equals(Buffer.from("#!/usr/bin/dash\n", "ascii"))) restricted();
    }
    for (const role of TOOL_ROLES) {
      const entry = binding.toolManifest[role];
      readBoundManifestFile(entry.path, entry, operations, 268435456);
    }
    for (const role of PATH_ROLES) {
      validateTrustedPathChain(binding.paths[role], binding.pathPolicies[role], operations);
    }
    validateTrustedPathChain(binding.sshAuthorization.homeDirectory, binding.sshAuthorization.homeDirectoryPolicy, operations);
    validateTrustedPathChain(binding.sshAuthorization.loginShell, {
      type: "file",
      uid: binding.sshAuthorization.loginShellPolicy.uid,
      gid: binding.sshAuthorization.loginShellPolicy.gid,
      mode: binding.sshAuthorization.loginShellPolicy.mode,
      nlink: 1
    }, operations);
    validateTrustedPathChain(binding.paths.authorizedKeys, binding.pathPolicies.authorizedKeys, operations, (fd, stats) => {
      const bytes = readExactOpenedFile(fd, stats, operations, 16385);
      const parsed = parseCanonicalAuthorizedKeyLine(bytes);
      if (parsed.authorizedKeysLineSha256 !== binding.sshAuthorization.authorizedKeysLineSha256
        || parsed.publicKeyBlobSha256 !== binding.sshAuthorization.publicKeyBlobSha256) restricted();
    });
    validateTrustedPathChain(binding.paths.sudoersFile, binding.pathPolicies.sudoersFile, operations, (fd, stats) => {
      const bytes = readExactOpenedFile(fd, stats, operations, 1048576);
      if (createHash("sha256").update(bytes).digest("hex") !== binding.sudoAuthorization.sudoersFileSha256) restricted();
    });
    return binding;
  } catch (error) {
    if (error instanceof JapanTuicRepairContractError) throw error;
    restricted();
  }
}

export function validateArchiveEntries(entries = []) {
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > 100000) {
    throw safeError("artifact_identity_mismatch");
  }
  const seen = new Set();
  for (const entry of entries) {
    if (typeof entry !== "string"
      || entry.length === 0
      || entry.length > 4096
      || entry.includes("\0")
      || entry.includes("\\")
      || entry.startsWith("/")
      || /^[A-Za-z]:/.test(entry)
      || posix.normalize(entry) !== entry
      || entry === ".."
      || entry.startsWith("../")
      || seen.has(entry)) {
      throw safeError("artifact_identity_mismatch");
    }
    seen.add(entry);
  }
  if (REQUIRED_ARCHIVE_ENTRIES.some((entry) => !seen.has(entry))) {
    throw safeError("artifact_identity_mismatch");
  }
  return { safe: true, entryCount: entries.length };
}

export function deriveWaitBudget({ intervalSeconds } = {}) {
  if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
    throw safeError("stable_snapshot_unavailable");
  }
  return Math.min(720000, (intervalSeconds * 2 + 60) * 1000);
}

function validateFrozenIdentity(input, expected, code) {
  const value = record(input);
  const output = {};
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (value[key] !== expectedValue) throw safeError(code);
    output[key] = expectedValue;
  }
  return output;
}

function validateBeforeIdentity(input) {
  return validateFrozenIdentity(input, JAPAN_TUIC_REPAIR_GATE.before, "expected_count_mismatch");
}

function validateAppliedReport(input) {
  const value = record(input);
  if (value.applied !== true || value.finalMode !== "600") throw safeError("post_apply_invariant_failed");
  return validateCandidateReport(value);
}

function validatePostApplyCandidate(input) {
  const value = record(input);
  const candidate = record(value.candidate);
  const expected = {
    addCount: 0,
    removeCount: 0,
    deferredRemoveCount: 27,
    deferredChangedCount: 0,
    missingMaterialCount: 0,
    projectedMapCount: 82,
    ready: true
  };
  if (value.ok !== true || value.candidateReady !== true) throw safeError("post_apply_invariant_failed");
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (candidate[key] !== expectedValue) throw safeError("post_apply_invariant_failed");
  }
  return { ok: true, candidateReady: true, candidate: expected };
}

function stableJson(value) {
  return JSON.stringify(value, Object.keys(record(value)).sort());
}

function assertStableAggregate(first, second, beforeOne, beforeTwo) {
  if (stableJson(first) !== stableJson(second) || stableJson(beforeOne) !== stableJson(beforeTwo)) {
    throw safeError("stable_snapshot_unavailable");
  }
}

function validateMetadata(value, code) {
  const metadata = record(value);
  if (!Number.isInteger(metadata.mode)
    || metadata.mode !== 0o600
    || !Number.isInteger(metadata.uid)
    || metadata.uid < 0
    || !Number.isInteger(metadata.gid)
    || metadata.gid < 0) {
    throw safeError(code);
  }
  return { mode: metadata.mode, uid: metadata.uid, gid: metadata.gid };
}

function assertMetadataPreserved(before, after) {
  const left = validateMetadata(before, "post_apply_invariant_failed");
  const right = validateMetadata(after, "post_apply_invariant_failed");
  if (left.mode !== right.mode || left.uid !== right.uid || left.gid !== right.gid) {
    throw safeError("post_apply_invariant_failed");
  }
}

function validateTimerState(value, code) {
  const timer = record(value);
  if (timer.active !== true
    || timer.enabled !== true
    || !Number.isInteger(timer.timerRestarts)
    || timer.timerRestarts < 0
    || !Number.isInteger(timer.serviceRestarts)
    || timer.serviceRestarts < 0) {
    throw safeError(code);
  }
  deriveWaitBudget(timer);
  return {
    active: true,
    enabled: true,
    timerRestarts: timer.timerRestarts,
    serviceRestarts: timer.serviceRestarts,
    intervalSeconds: timer.intervalSeconds
  };
}

function validateObservationBaseline(value) {
  const baseline = record(value);
  if (!Number.isInteger(baseline.collectorCount)
    || baseline.collectorCount < 0
    || !Number.isInteger(baseline.unresolvedTotal)
    || baseline.unresolvedTotal < 0) {
    throw safeError("stable_snapshot_unavailable");
  }
  return {
    collectorCount: baseline.collectorCount,
    unresolvedTotal: baseline.unresolvedTotal
  };
}

async function waitForNaturalObservation({
  operations,
  extracted,
  binding,
  applyBoundary,
  observationBefore,
  timerBefore
}) {
  const waitBudget = deriveWaitBudget(timerBefore);
  const pollMilliseconds = Math.min(
    5000,
    Math.max(1000, Math.floor(timerBefore.intervalSeconds * 250))
  );
  const maxAttempts = Math.max(1, Math.ceil(waitBudget / pollMilliseconds));
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const currentObservation = record(await operations.readNaturalObservation({
      root: extracted.root,
      binding,
      phase: "current"
    }));
    const captured = typeof currentObservation.capturedAt === "string"
      ? Date.parse(currentObservation.capturedAt)
      : Number.NaN;
    if (!Number.isFinite(captured)) throw safeError("natural_observation_failed");
    if (captured > Date.parse(applyBoundary)) {
      const timerCurrent = validateTimerState(
        await operations.readTimerState(binding),
        "natural_observation_failed"
      );
      return validateNaturalObservation({
        applyBoundary,
        baseline: {
          ...observationBefore,
          timerRestarts: timerBefore.timerRestarts,
          serviceRestarts: timerBefore.serviceRestarts
        },
        current: {
          ...currentObservation,
          timerActive: timerCurrent.active,
          timerEnabled: timerCurrent.enabled,
          timerRestarts: timerCurrent.timerRestarts,
          serviceRestarts: timerCurrent.serviceRestarts
        }
      });
    }
    if (attempt + 1 < maxAttempts) await operations.sleep(pollMilliseconds);
  }
  throw safeError("natural_observation_timeout");
}

function safeCode(error, fallback) {
  return error instanceof JapanTuicRepairContractError && SAFE_ERROR_CODES.has(error.code)
    ? error.code
    : fallback;
}

function baseReceipt({ productionResult, error, rollbackVerified = false }) {
  const receipt = {
    schemaVersion: "1",
    type: "japan_tuic_additive_repair_execution",
    productionResult,
    hostCredentialCleanup: "failed",
    closeout: "incomplete"
  };
  if (error) receipt.error = error;
  if (rollbackVerified) receipt.rollbackVerified = true;
  return receipt;
}

async function verifyRollback({ operations, binding, extracted, metadataBefore }) {
  validateCandidateReport(await operations.runMapHelper({ root: extracted.root, binding, apply: false }));
  validateBeforeIdentity(await operations.readIdentityGate({ root: extracted.root, binding, phase: "rollback" }));
  assertMetadataPreserved(metadataBefore, await operations.readFileMetadata(binding.paths.currentMap));
}

async function cleanupHost({ operations, binding }) {
  let temporaryRemoved = false;
  let authorizationRevoked = false;
  try {
    temporaryRemoved = await operations.removeTemporaryMaterial(binding) === true;
  } catch {
    temporaryRemoved = false;
  }
  try {
    authorizationRevoked = await operations.revokeOwnAuthorization(binding) === true;
  } catch {
    authorizationRevoked = false;
  }
  return temporaryRemoved && authorizationRevoked;
}

export async function executeJapanTuicAdditiveRepair({
  binding: rawBinding,
  artifactStream,
  operations,
  now = () => new Date()
} = {}) {
  const binding = validateLegacyRunnerBindingForLocalTest(rawBinding);
  if (!operations || typeof operations !== "object") throw safeError("restricted_identity_rejected");
  let receipt;
  let extracted = null;
  let backup = null;
  let metadataBefore = null;
  let applyAttempted = false;

  try {
    const received = await operations.receiveArtifact(artifactStream);
    validateArtifactIdentity({
      runId: JAPAN_TUIC_REPAIR_GATE.artifact.runId,
      fileName: JAPAN_TUIC_REPAIR_GATE.artifact.fileName,
      sizeBytes: received.sizeBytes,
      sha256: received.sha256,
      sourceCommit: JAPAN_TUIC_REPAIR_GATE.artifact.sourceCommit
    });
    validateArchiveEntries(await operations.listArchiveEntries(received.path));
    extracted = await operations.extractArtifact(received.path);

    const firstCandidate = validateCandidateReport(
      await operations.runMapHelper({ root: extracted.root, binding, apply: false })
    );
    const beforeOne = validateBeforeIdentity(
      await operations.readIdentityGate({ root: extracted.root, binding, phase: "before" })
    );
    const secondCandidate = validateCandidateReport(
      await operations.runMapHelper({ root: extracted.root, binding, apply: false })
    );
    const beforeTwo = validateBeforeIdentity(
      await operations.readIdentityGate({ root: extracted.root, binding, phase: "before" })
    );
    assertStableAggregate(firstCandidate, secondCandidate, beforeOne, beforeTwo);

    metadataBefore = validateMetadata(
      await operations.readFileMetadata(binding.paths.currentMap),
      "stable_snapshot_unavailable"
    );
    const timerBefore = validateTimerState(
      await operations.readTimerState(binding),
      "stable_snapshot_unavailable"
    );
    const observationBefore = validateObservationBaseline(
      await operations.readNaturalObservation({ root: extracted.root, binding, phase: "baseline" })
    );
    backup = await operations.createBackup(binding);
    if (!backup || typeof backup !== "object" || typeof backup.ref !== "string" || backup.ref.length === 0) {
      throw safeError("backup_failed");
    }

    const applyBoundary = now().toISOString();
    applyAttempted = true;
    validateAppliedReport(await operations.runMapHelper({ root: extracted.root, binding, apply: true }));
    validatePostApplyCandidate(
      await operations.runMapHelper({ root: extracted.root, binding, apply: false })
    );
    const afterIdentity = validatePostApplyIdentity(
      await operations.readIdentityGate({ root: extracted.root, binding, phase: "after" })
    );
    assertMetadataPreserved(
      metadataBefore,
      await operations.readFileMetadata(binding.paths.currentMap)
    );
    validateTimerState(
      await operations.readTimerState(binding),
      "natural_observation_failed"
    );
    const observation = await waitForNaturalObservation({
      operations,
      extracted,
      binding,
      applyBoundary,
      observationBefore,
      timerBefore
    });
    receipt = {
      ...baseReceipt({ productionResult: "applied_validated" }),
      candidate: { ...JAPAN_TUIC_REPAIR_GATE.candidate },
      identityAfter: afterIdentity,
      naturalObservation: observation
    };
  } catch (error) {
    if (applyAttempted && backup && extracted && metadataBefore) {
      try {
        await operations.restoreBackup(binding, backup);
        await verifyRollback({ operations, binding, extracted, metadataBefore });
        receipt = baseReceipt({
          productionResult: "rolled_back_validated",
          error: safeCode(error, "post_apply_invariant_failed"),
          rollbackVerified: true
        });
      } catch {
        receipt = baseReceipt({
          productionResult: "indeterminate",
          error: "rollback_verification_failed"
        });
      }
    } else {
      receipt = baseReceipt({
        productionResult: "stopped_pre_apply",
        error: safeCode(error, "stable_snapshot_unavailable")
      });
    }
  }

  const hostCleanupVerified = await cleanupHost({ operations, binding });
  receipt.hostCredentialCleanup = hostCleanupVerified ? "verified" : "failed";
  receipt.closeout = hostCleanupVerified ? "github_cleanup_pending" : "incomplete";
  return validateExecutionReceipt(receipt);
}

function fileSha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function applyMetadata(path, metadata, platform = process.platform) {
  if (platform === "linux") chownSync(path, metadata.uid, metadata.gid);
  chmodSync(path, metadata.mode);
}

function parseKeyValueOutput(output) {
  const values = {};
  for (const line of String(output || "").split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    values[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return values;
}

function parseNonNegativeInteger(value, code) {
  if (!/^\d+$/.test(String(value ?? ""))) throw safeError(code);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw safeError(code);
  return parsed;
}

function parseJsonOutput(output, code) {
  const text = String(output || "");
  if (Buffer.byteLength(text) === 0 || Buffer.byteLength(text) > MAX_HELPER_OUTPUT_BYTES) {
    throw safeError(code);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw safeError(code);
  }
}

function validateZipTypeListing(output) {
  for (const line of String(output || "").split(/\r?\n/)) {
    const match = line.match(/^\s*([bcdlps-])[rwxStTs-]{9}\s/);
    if (match && !ALLOWED_ZIP_TYPES.has(match[1])) {
      throw safeError("artifact_identity_mismatch");
    }
  }
}

function exactArchiveEntries(output) {
  return String(output || "")
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function readBoundedJson(path, maxBytes, code) {
  try {
    const stats = statSync(path);
    if (!stats.isFile() || stats.size <= 0 || stats.size > maxBytes) throw safeError(code);
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    if (error instanceof JapanTuicRepairContractError) throw error;
    throw safeError(code);
  }
}

function naturalObservationSummary(input, report) {
  const projectionInput = record(record(input).projection);
  const collectors = Array.isArray(projectionInput.collectors) ? projectionInput.collectors : [];
  const japanTuic = collectors.find((collector) => {
    const value = record(collector);
    return value.channelRef === "channel-vultr-a-tuic"
      || value.collectorRef === "channel-vultr-a-tuic";
  });
  if (!japanTuic) throw safeError("natural_observation_failed");
  const projection = record(record(report).projection);
  return {
    capturedAt: report.capturedAt,
    collectorInvocationObserved: report.collectorInvocationObserved,
    collectorCount: projection.collectorCount,
    unresolvedTotal: projection.unresolvedTotal,
    japanTuicUnresolved: record(japanTuic).unresolvedCount,
    omittedCollectorCount: projection.omittedCollectors,
    omittedProducerCount: projection.omittedProducers,
    provenanceConserved: projection.provenanceConserved,
    validatorPassed: report.passed === true
  };
}

export function createHostOperations({
  binding,
  expectedArtifact = JAPAN_TUIC_REPAIR_GATE.artifact,
  execFileFn = execFileAsync,
  makeTemporaryDirectoryFn,
  naturalObservationBuilder,
  platform = process.platform
} = {}) {
  let temporaryDirectory = null;
  let lastMapReport = null;
  const backups = new Map();

  async function runFile(file, args, code, options = {}) {
    try {
      const result = await execFileFn(file, args, {
        encoding: "utf8",
        maxBuffer: MAX_PROTECTED_OBSERVATION_BYTES,
        shell: false,
        windowsHide: true,
        ...options
      });
      return { stdout: String(result?.stdout || ""), stderr: String(result?.stderr || "") };
    } catch {
      throw safeError(code);
    }
  }

  function ensureArtifactDirectory() {
    if (!temporaryDirectory) {
      const rootStats = statSync(binding.paths.temporaryRoot);
      if (!rootStats.isDirectory()) throw safeError("artifact_identity_mismatch");
      temporaryDirectory = mkdtempSync(join(binding.paths.temporaryRoot, "github-japan-tuic-"));
      chmodSync(temporaryDirectory, 0o700);
    }
    return temporaryDirectory;
  }

  return {
    async receiveArtifact(stream) {
      const directory = ensureArtifactDirectory();
      const artifactPath = join(directory, "artifact.zip");
      const handle = openSync(artifactPath, "wx", 0o600);
      const hash = createHash("sha256");
      let sizeBytes = 0;
      try {
        for await (const chunk of stream) {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          sizeBytes += bytes.length;
          if (sizeBytes > expectedArtifact.sizeBytes) throw safeError("artifact_identity_mismatch");
          hash.update(bytes);
          writeSync(handle, bytes);
        }
      } finally {
        closeSync(handle);
      }
      chmodSync(artifactPath, 0o600);
      const sha256 = hash.digest("hex");
      if (sizeBytes !== expectedArtifact.sizeBytes || sha256 !== expectedArtifact.sha256) {
        throw safeError("artifact_identity_mismatch");
      }
      return { path: artifactPath, sizeBytes, sha256 };
    },

    async listArchiveEntries(artifactPath) {
      const names = await runFile(
        "/usr/bin/unzip",
        ["-Z1", artifactPath],
        "artifact_identity_mismatch"
      );
      const types = await runFile(
        "/usr/bin/unzip",
        ["-ZTs", artifactPath],
        "artifact_identity_mismatch"
      );
      validateZipTypeListing(types.stdout);
      return exactArchiveEntries(names.stdout);
    },

    async extractArtifact(artifactPath) {
      const root = makeTemporaryDirectoryFn
        ? makeTemporaryDirectoryFn()
        : join(ensureArtifactDirectory(), "source");
      if (!makeTemporaryDirectoryFn) mkdirSync(root, { recursive: false, mode: 0o700 });
      await runFile(
        "/usr/bin/unzip",
        ["-qq", artifactPath, "-d", root],
        "artifact_identity_mismatch"
      );
      return { root };
    },

    async runMapHelper({ root, binding: activeBinding, apply }) {
      const helperPath = join(root, "scripts", "mihomo-tuic-usage-map-rebuild.mjs");
      const args = [
        helperPath,
        "--current-map", activeBinding.paths.currentMap,
        "--mihomo-config", activeBinding.paths.mihomoConfig,
        "--material-store", activeBinding.paths.materialStore,
        "--strategy", "additive_missing_only",
        "--expected-add", "3",
        "--expected-remove", "0",
        "--expected-deferred-remove", "27",
        "--expected-changed", "0",
        "--expected-missing-material", "0",
        "--expected-projected-map-count", "82"
      ];
      if (apply) args.push("--apply");
      const result = await runFile(
        "/usr/bin/node",
        args,
        apply ? "atomic_apply_failed" : "stable_snapshot_unavailable",
        { maxBuffer: MAX_HELPER_OUTPUT_BYTES }
      );
      lastMapReport = parseJsonOutput(
        result.stdout,
        apply ? "atomic_apply_failed" : "stable_snapshot_unavailable"
      );
      return lastMapReport;
    },

    async readIdentityGate({ phase } = {}) {
      const report = record(lastMapReport);
      const candidate = record(report.candidate);
      const runtimeCount = report.rebuiltMapCount;
      const missing = candidate.addCount;
      if (!Number.isInteger(runtimeCount) || !Number.isInteger(missing)) {
        throw safeError("stable_snapshot_unavailable");
      }
      const identity = {
        runtimeCount,
        mappedCount: runtimeCount - missing,
        missing,
        stale: candidate.deferredRemoveCount,
        changed: candidate.deferredChangedCount,
        missingMaterial: candidate.missingMaterialCount
      };
      if (phase === "after") {
        identity.retentionState = "pending";
        identity.state = "degraded";
      }
      return identity;
    },

    async readFileMetadata(path) {
      try {
        const stats = statSync(path);
        if (!stats.isFile()) throw safeError("stable_snapshot_unavailable");
        return { mode: stats.mode & 0o777, uid: stats.uid, gid: stats.gid };
      } catch (error) {
        if (error instanceof JapanTuicRepairContractError) throw error;
        throw safeError("stable_snapshot_unavailable");
      }
    },

    async createBackup(activeBinding) {
      try {
        const directoryStats = statSync(activeBinding.paths.backupDirectory);
        if (!directoryStats.isDirectory()) throw safeError("backup_failed");
        const sourceStats = statSync(activeBinding.paths.currentMap);
        if (!sourceStats.isFile()) throw safeError("backup_failed");
        const id = randomUUID();
        const path = join(activeBinding.paths.backupDirectory, `.japan-tuic-${id}.bak`);
        copyFileSync(activeBinding.paths.currentMap, path, constants.COPYFILE_EXCL);
        applyMetadata(path, {
          mode: sourceStats.mode & 0o777,
          uid: sourceStats.uid,
          gid: sourceStats.gid
        }, platform);
        if (fileSha256(path) !== fileSha256(activeBinding.paths.currentMap)) {
          throw safeError("backup_failed");
        }
        const ref = `backup-${id}`;
        backups.set(ref, {
          path,
          sha256: fileSha256(path),
          metadata: {
            mode: sourceStats.mode & 0o777,
            uid: sourceStats.uid,
            gid: sourceStats.gid
          }
        });
        return { ref };
      } catch (error) {
        if (error instanceof JapanTuicRepairContractError) throw error;
        throw safeError("backup_failed");
      }
    },

    async restoreBackup(activeBinding, backup) {
      const stored = backups.get(record(backup).ref);
      if (!stored) throw safeError("rollback_verification_failed");
      const temporaryPath = join(
        dirname(activeBinding.paths.currentMap),
        `.japan-tuic-restore-${randomUUID()}.tmp`
      );
      try {
        copyFileSync(stored.path, temporaryPath, constants.COPYFILE_EXCL);
        applyMetadata(temporaryPath, stored.metadata, platform);
        if (fileSha256(temporaryPath) !== stored.sha256) {
          throw safeError("rollback_verification_failed");
        }
        renameSync(temporaryPath, activeBinding.paths.currentMap);
      } catch (error) {
        if (existsSync(temporaryPath)) rmSync(temporaryPath, { force: true });
        if (error instanceof JapanTuicRepairContractError) throw error;
        throw safeError("rollback_verification_failed");
      }
    },

    async readTimerState(activeBinding) {
      const timerResult = await runFile(
        "/usr/bin/systemctl",
        [
          "show",
          activeBinding.units.timer,
          "--property=ActiveState",
          "--property=UnitFileState",
          "--property=NRestarts",
          "--property=LastTriggerUSec",
          "--property=NextElapseUSecRealtime",
          "--no-pager"
        ],
        "stable_snapshot_unavailable"
      );
      const serviceResult = await runFile(
        "/usr/bin/systemctl",
        [
          "show",
          activeBinding.units.service,
          "--property=NRestarts",
          "--no-pager"
        ],
        "stable_snapshot_unavailable"
      );
      const timer = parseKeyValueOutput(timerResult.stdout);
      const service = parseKeyValueOutput(serviceResult.stdout);
      const lastTrigger = Date.parse(timer.LastTriggerUSec);
      const nextTrigger = Date.parse(timer.NextElapseUSecRealtime);
      const intervalSeconds = (nextTrigger - lastTrigger) / 1000;
      if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
        throw safeError("stable_snapshot_unavailable");
      }
      return {
        active: timer.ActiveState === "active",
        enabled: timer.UnitFileState === "enabled",
        timerRestarts: parseNonNegativeInteger(timer.NRestarts, "stable_snapshot_unavailable"),
        serviceRestarts: parseNonNegativeInteger(service.NRestarts, "stable_snapshot_unavailable"),
        intervalSeconds
      };
    },

    async readNaturalObservation({ root, binding: activeBinding }) {
      const input = readBoundedJson(
        activeBinding.paths.naturalObservation,
        MAX_PROTECTED_OBSERVATION_BYTES,
        "natural_observation_failed"
      );
      let builder = naturalObservationBuilder;
      if (!builder) {
        try {
          const module = await import(pathToFileURL(join(
            root,
            "scripts",
            "traffic-accounting-natural-observation.mjs"
          )).href);
          builder = module.buildTrafficAccountingNaturalObservation;
        } catch {
          throw safeError("natural_observation_failed");
        }
      }
      try {
        return naturalObservationSummary(input, builder(input));
      } catch (error) {
        if (error instanceof JapanTuicRepairContractError) throw error;
        throw safeError("natural_observation_failed");
      }
    },

    async sleep(milliseconds) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
    },

    async removeTemporaryMaterial() {
      if (!temporaryDirectory) return true;
      try {
        rmSync(temporaryDirectory, { recursive: true, force: true });
        return !existsSync(temporaryDirectory);
      } catch {
        return false;
      }
    },

    async revokeOwnAuthorization(activeBinding) {
      const path = activeBinding.paths.authorizedKeys;
      const marker = activeBinding.authorizationMarker;
      try {
        const stats = statSync(path);
        if (!stats.isFile() || stats.size <= 0 || stats.size > 1024 * 1024) return false;
        const original = readFileSync(path, "utf8");
        const lines = original.split(/\r?\n/);
        const matches = lines.filter((line) => {
          const fields = line.trim().split(/\s+/).filter(Boolean);
          return fields.at(-1) === marker;
        });
        if (matches.length !== 1) return false;
        const next = lines.filter((line) => line !== matches[0]).join("\n");
        const temporaryPath = join(dirname(path), `.authorized-keys-${randomUUID()}.tmp`);
        writeFileSync(temporaryPath, next, { encoding: "utf8", flag: "wx", mode: stats.mode & 0o777 });
        applyMetadata(temporaryPath, {
          mode: stats.mode & 0o777,
          uid: stats.uid,
          gid: stats.gid
        }, platform);
        renameSync(temporaryPath, path);
        const readback = readFileSync(path, "utf8");
        return !readback.split(/\r?\n/).some((line) => {
          const fields = line.trim().split(/\s+/).filter(Boolean);
          return fields.at(-1) === marker;
        });
      } catch {
        return false;
      }
    }
  };
}

function safeCliFailure() {
  return {
    schemaVersion: "3",
    type: "japan_tuic_additive_repair_pre_migration",
    error: "restricted_identity_rejected"
  };
}

export async function runJapanTuicAdditiveRepairCli({
  argv = process.argv.slice(2),
  stdin = process.stdin,
  stdout = process.stdout,
  stderr = process.stderr,
  env = process.env,
  platform = process.platform,
  loadBindingFn = loadRootOwnedBinding,
  operationsFactory = createHostOperations,
  executeFn = executeJapanTuicAdditiveRepair
} = {}) {
  void argv;
  void stdin;
  void stdout;
  void env;
  void platform;
  void loadBindingFn;
  void operationsFactory;
  void executeFn;
  stderr.write(`${JSON.stringify(safeCliFailure())}\n`);
  return 1;
}

function isDirectInvocation() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectInvocation()) {
  process.exitCode = await runJapanTuicAdditiveRepairCli();
}
