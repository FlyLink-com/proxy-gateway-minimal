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
import { execFile as execFileCallback, spawnSync } from "node:child_process";
import { promisify, types } from "node:util";
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
  let bytes;
  try {
    bytes = Buffer.from(value, "utf8");
    if (bytes.toString("utf8") !== value) restricted();
    return bytes.toString("hex");
  } finally {
    if (Buffer.isBuffer(bytes)) bytes.fill(0);
  }
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
const TOOL_ROLES = Object.freeze(["dash", "env", "flock", "getent", "id", "node", "sudo", "systemctl", "unzip", "visudo"]);
const TOOL_PATHS = Object.freeze({
  dash: "/usr/bin/dash",
  env: "/usr/bin/env",
  flock: "/usr/bin/flock",
  getent: "/usr/bin/getent",
  id: "/usr/bin/id",
  node: "/usr/bin/node",
  sudo: "/usr/bin/sudo",
  systemctl: "/usr/bin/systemctl",
  unzip: "/usr/bin/unzip",
  visudo: "/usr/sbin/visudo"
});
const ACCOUNT_CORE_KEYS = Object.freeze([
  "username", "uid", "homeDirectory", "loginShell", "passwordLocked", "primaryGroupId", "groupIds", "groupNames"
]);
const ACCOUNT_GROUP_NAME = /^[a-z0-9_][a-z0-9_.-]{0,63}$/;
const MAX_ACCOUNT_GROUPS = 256;
const ACCOUNT_PROCESS_ENV = Object.freeze({
  LANG: "C.UTF-8",
  LC_ALL: "C.UTF-8",
  PATH: "/usr/bin:/bin"
});
const ACCOUNT_PROCESS_STDIO = Object.freeze(["ignore", "pipe", "pipe"]);
const PROJECTED_ACCOUNT_CORE_BRAND = new WeakSet();
const NATIVE_ACCOUNT_CORE_BRAND = new WeakSet();
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
const AUTHORIZATION_SOURCE_SNAPSHOT_BRAND = new WeakSet();
const AUTHORIZATION_SOURCE_GRAPH_BRAND = new WeakSet();
const AUTHORIZATION_SOURCE_MAX_FILE_BYTES = 1048576;
const AUTHORIZATION_SOURCE_MAX_GRAPH_BYTES = 16777216;
const AUTHORIZATION_SOURCE_MAX_FILES = 256;
const AUTHORIZATION_SOURCE_MAX_DEPTH = 32;
const AUTHORIZATION_SOURCE_MAX_LINE_BYTES = 16384;
const AUTHORIZATION_SOURCE_MAX_DIRECTORY_NAMES = 4096;
const AUTHORIZATION_SOURCE_MAX_GRAPH_DIRECTORY_NAMES = 65536;
const AUTHORIZATION_SOURCE_MAX_FIXED_ENVELOPES = 32;
const AUTHORIZATION_SOURCE_MAX_SEMANTIC_NODES = 131072;
const AUTHORIZATION_PATH_OPERATION_KEYS = Object.freeze(["lstat", "open", "fstat", "read", "close"]);
const AUTHORIZATION_SOURCE_OPERATION_KEYS = Object.freeze(["readDirectory", "validateSudoers"]);
const AUTHORIZATION_STANDARD_OBJECT_PROTOTYPE_KEYS = Object.freeze([
  "__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__", "__proto__", "constructor",
  "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable", "toLocaleString", "toString", "valueOf"
]);

function restricted() {
  throw safeError(RESTRICTED_CODE);
}

function exactPrivateOperationRecord(input, expected) {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || Object.getOwnPropertySymbols(input).length !== 0) restricted();
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== null) {
    const prototypeNames = Object.getOwnPropertyNames(prototype).sort();
    const standardNames = [...AUTHORIZATION_STANDARD_OBJECT_PROTOTYPE_KEYS].sort();
    if (Object.getPrototypeOf(prototype) !== null || Object.getOwnPropertySymbols(prototype).length !== 0
      || prototypeNames.length !== standardNames.length || prototypeNames.some((name, index) => name !== standardNames[index])) restricted();
  }
  const names = Object.getOwnPropertyNames(input).sort();
  const sortedExpected = [...expected].sort();
  if (names.length !== sortedExpected.length || names.some((name, index) => name !== sortedExpected[index])) restricted();
  for (const name of expected) {
    const descriptor = Object.getOwnPropertyDescriptor(input, name);
    if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true
      || typeof descriptor.value !== "function" || descriptor.get !== undefined || descriptor.set !== undefined) restricted();
    for (let prototype = Object.getPrototypeOf(input); prototype; prototype = Object.getPrototypeOf(prototype)) {
      if (Object.hasOwn(prototype, name)) restricted();
    }
  }
  return input;
}

function failAuthorizationSourceGraph(graph) {
  if (graph && AUTHORIZATION_SOURCE_GRAPH_BRAND.has(graph)) {
    graph.failed = true;
    graph.snapshot.failed = true;
  }
}

function requireAuthorizationSourceGraph(graph) {
  if (!graph || !AUTHORIZATION_SOURCE_GRAPH_BRAND.has(graph)
    || !AUTHORIZATION_SOURCE_SNAPSHOT_BRAND.has(graph.snapshot)
    || graph.failed || graph.snapshot.failed) restricted();
  return graph;
}

// C2B_EXACT_BLOCK_BEGIN
const AUTHORIZATION_SHARED_SEMANTIC_LIMITS = Object.freeze({
  fixedEnvelope: 32,
  sourceFile: 256,
  authorizationEntry: 1
});

const AUTHORIZATION_SSH_SEMANTIC_LIMITS = Object.freeze({
  sshPhysicalDirective: 131072,
  sshIncludePattern: 131072,
  sshSelectedInsertion: 65536,
  sshMatchBranch: 4096,
  sshMatchCondition: 131072,
  sshMatchPattern: 131072,
  sshAssignment: 131072,
  sshAcceptEnvName: 131072
});

const AUTHORIZATION_SUDO_SEMANTIC_LIMITS = Object.freeze({
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

const AUTHORIZATION_PARSER_LOCAL_LIMITS = Object.freeze({
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

const AUTHORIZATION_WORK_LIMITS = Object.freeze({
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

function nextAuthorizationBudgetValue(current, amount, maximum) {
  if (!Number.isSafeInteger(current) || current < 0
    || !Number.isSafeInteger(amount) || amount <= 0
    || !Number.isSafeInteger(maximum) || maximum <= 0) {
    restricted();
  }
  const next = current + amount;
  if (!Number.isSafeInteger(next) || next > maximum) restricted();
  return next;
}

function reserveAuthorizationSemanticNode(graph, kind) {
  let active;
  let counter;
  let maximum;
  let workCounter;
  let workMaximum;
  let counterNext;
  let graphNext;
  let snapshotNext;
  let workNext;
  try {
    active = requireAuthorizationSourceGraph(graph);
    switch (kind) {
      case "sourceFile":
        counter = "sourceFileCount";
        maximum = AUTHORIZATION_SHARED_SEMANTIC_LIMITS.sourceFile;
        break;
      case "sshPhysicalDirective":
        if (active.kind !== "ssh") restricted();
        counter = "sshPhysicalDirectiveCount";
        maximum = AUTHORIZATION_SSH_SEMANTIC_LIMITS.sshPhysicalDirective;
        break;
      case "sshIncludePattern":
        if (active.kind !== "ssh") restricted();
        counter = "sshIncludePatternCount";
        maximum = AUTHORIZATION_SSH_SEMANTIC_LIMITS.sshIncludePattern;
        break;
      case "sshSelectedInsertion":
        if (active.kind !== "ssh") restricted();
        counter = "sshSelectedInsertionCount";
        maximum = AUTHORIZATION_SSH_SEMANTIC_LIMITS.sshSelectedInsertion;
        break;
      case "sshMatchBranch":
        if (active.kind !== "ssh") restricted();
        counter = "sshMatchBranchCount";
        maximum = AUTHORIZATION_SSH_SEMANTIC_LIMITS.sshMatchBranch;
        break;
      case "sshMatchCondition":
        if (active.kind !== "ssh") restricted();
        counter = "sshMatchConditionCount";
        maximum = AUTHORIZATION_SSH_SEMANTIC_LIMITS.sshMatchCondition;
        break;
      case "sshMatchPattern":
        if (active.kind !== "ssh") restricted();
        counter = "sshMatchPatternCount";
        maximum = AUTHORIZATION_SSH_SEMANTIC_LIMITS.sshMatchPattern;
        break;
      case "sshAssignment":
        if (active.kind !== "ssh") restricted();
        counter = "sshAssignmentCount";
        maximum = AUTHORIZATION_SSH_SEMANTIC_LIMITS.sshAssignment;
        break;
      case "sshAcceptEnvName":
        if (active.kind !== "ssh") restricted();
        counter = "sshAcceptEnvNameCount";
        maximum = AUTHORIZATION_SSH_SEMANTIC_LIMITS.sshAcceptEnvName;
        break;
      case "sudoStatement":
        if (active.kind !== "sudo") restricted();
        counter = "sudoStatementCount";
        maximum = AUTHORIZATION_SUDO_SEMANTIC_LIMITS.sudoStatement;
        break;
      case "sudoInclude":
        if (active.kind !== "sudo") restricted();
        counter = "sudoIncludeCount";
        maximum = AUTHORIZATION_SUDO_SEMANTIC_LIMITS.sudoInclude;
        break;
      case "sudoSelectedInsertion":
        if (active.kind !== "sudo") restricted();
        counter = "sudoSelectedInsertionCount";
        maximum = AUTHORIZATION_SUDO_SEMANTIC_LIMITS.sudoSelectedInsertion;
        break;
      case "sudoAliasDefinition":
        if (active.kind !== "sudo") restricted();
        counter = "sudoAliasDefinitionCount";
        maximum = AUTHORIZATION_SUDO_SEMANTIC_LIMITS.sudoAliasDefinition;
        break;
      case "sudoAliasMember":
        if (active.kind !== "sudo") restricted();
        counter = "sudoAliasMemberCount";
        maximum = AUTHORIZATION_SUDO_SEMANTIC_LIMITS.sudoAliasMember;
        break;
      case "sudoDefaultsItem":
        if (active.kind !== "sudo") restricted();
        counter = "sudoDefaultsItemCount";
        maximum = AUTHORIZATION_SUDO_SEMANTIC_LIMITS.sudoDefaultsItem;
        break;
      case "sudoUserSpec":
        if (active.kind !== "sudo") restricted();
        counter = "sudoUserSpecCount";
        maximum = AUTHORIZATION_SUDO_SEMANTIC_LIMITS.sudoUserSpec;
        break;
      case "sudoUserHostRunasMember":
        if (active.kind !== "sudo") restricted();
        counter = "sudoUserHostRunasMemberCount";
        maximum = AUTHORIZATION_SUDO_SEMANTIC_LIMITS.sudoUserHostRunasMember;
        break;
      case "sudoTagTransition":
        if (active.kind !== "sudo") restricted();
        counter = "sudoTagTransitionCount";
        maximum = AUTHORIZATION_SUDO_SEMANTIC_LIMITS.sudoTagTransition;
        break;
      case "sudoCommandSpec":
        if (active.kind !== "sudo") restricted();
        counter = "sudoCommandSpecCount";
        maximum = AUTHORIZATION_SUDO_SEMANTIC_LIMITS.sudoCommandSpec;
        workCounter = "commandWorkCount";
        workMaximum = AUTHORIZATION_WORK_LIMITS.sudoCommand;
        break;
      case "sudoArgumentToken":
        if (active.kind !== "sudo") restricted();
        counter = "sudoArgumentTokenCount";
        maximum = AUTHORIZATION_SUDO_SEMANTIC_LIMITS.sudoArgumentToken;
        break;
      case "sudoAliasEdge":
        if (active.kind !== "sudo") restricted();
        counter = "sudoAliasEdgeCount";
        maximum = AUTHORIZATION_SUDO_SEMANTIC_LIMITS.sudoAliasEdge;
        workCounter = "aliasEdgeWorkCount";
        workMaximum = AUTHORIZATION_WORK_LIMITS.sudoAliasEdge;
        break;
      case "sudoAliasMemoEntry":
        if (active.kind !== "sudo") restricted();
        counter = "sudoAliasMemoEntryCount";
        maximum = AUTHORIZATION_SUDO_SEMANTIC_LIMITS.sudoAliasMemoEntry;
        break;
      default:
        restricted();
    }
    counterNext = nextAuthorizationBudgetValue(active[counter], 1, maximum);
    graphNext = nextAuthorizationBudgetValue(
      active.semanticNodeCount,
      1,
      AUTHORIZATION_SOURCE_MAX_SEMANTIC_NODES
    );
    snapshotNext = nextAuthorizationBudgetValue(
      active.snapshot.semanticNodeCount,
      1,
      AUTHORIZATION_SOURCE_MAX_SEMANTIC_NODES
    );
    if (workCounter !== undefined) {
      workNext = nextAuthorizationBudgetValue(active[workCounter], 1, workMaximum);
    }
    active[counter] = counterNext;
    active.semanticNodeCount = graphNext;
    active.snapshot.semanticNodeCount = snapshotNext;
    if (workCounter !== undefined) active[workCounter] = workNext;
  } catch {
    failAuthorizationSourceGraph(graph);
    restricted();
  }
}

function reserveAuthorizationWorkUnit(graph, kind) {
  let active;
  let graphCounter;
  let graphMaximum;
  let snapshotCounter;
  let snapshotMaximum;
  let graphNext;
  let snapshotNext;
  let invocationNext;
  try {
    active = requireAuthorizationSourceGraph(graph);
    switch (kind) {
      case "glob":
        graphCounter = "globComparisonCount";
        graphMaximum = AUTHORIZATION_WORK_LIMITS.globComparisons;
        snapshotCounter = "wildcardInvocationCount";
        snapshotMaximum = AUTHORIZATION_WORK_LIMITS.wildcardInvocations;
        break;
      case "sshMatch":
        if (active.kind !== "ssh") restricted();
        snapshotCounter = "sshMatchComparisonCount";
        snapshotMaximum = AUTHORIZATION_WORK_LIMITS.sshMatchComparisons;
        break;
      case "sudoSelector":
        if (active.kind !== "sudo") restricted();
        snapshotCounter = "sudoSelectorComparisonCount";
        snapshotMaximum = AUTHORIZATION_WORK_LIMITS.sudoSelectorComparisons;
        break;
      case "sudoCommand":
        if (active.kind !== "sudo") restricted();
        graphCounter = "commandWorkCount";
        graphMaximum = AUTHORIZATION_WORK_LIMITS.sudoCommand;
        break;
      case "sudoAliasEdge":
        if (active.kind !== "sudo") restricted();
        graphCounter = "aliasEdgeWorkCount";
        graphMaximum = AUTHORIZATION_WORK_LIMITS.sudoAliasEdge;
        break;
      case "sudoAliasVisit":
        if (active.kind !== "sudo") restricted();
        snapshotCounter = "sudoAliasVisitCount";
        snapshotMaximum = AUTHORIZATION_WORK_LIMITS.sudoAliasVisit;
        break;
      default:
        restricted();
    }
    if (graphCounter !== undefined) {
      graphNext = nextAuthorizationBudgetValue(active[graphCounter], 1, graphMaximum);
    }
    if (snapshotCounter !== undefined) {
      snapshotNext = nextAuthorizationBudgetValue(active.snapshot[snapshotCounter], 1, snapshotMaximum);
    }
    if (kind === "sshMatch" || kind === "sudoSelector") {
      invocationNext = nextAuthorizationBudgetValue(
        active.snapshot.wildcardInvocationCount,
        1,
        AUTHORIZATION_WORK_LIMITS.wildcardInvocations
      );
    }
    if (graphCounter !== undefined) active[graphCounter] = graphNext;
    if (snapshotCounter !== undefined) active.snapshot[snapshotCounter] = snapshotNext;
    if (kind === "sshMatch" || kind === "sudoSelector") {
      active.snapshot.wildcardInvocationCount = invocationNext;
    }
  } catch {
    failAuthorizationSourceGraph(graph);
    restricted();
  }
}

function reservePreimageBytes(snapshot, length) {
  if (!snapshot || !AUTHORIZATION_SOURCE_SNAPSHOT_BRAND.has(snapshot)) restricted();
  if (snapshot.failed) restricted();
  if (!Number.isSafeInteger(length) || length <= 0
    || length > AUTHORIZATION_WORK_LIMITS.preimageBytes) {
    snapshot.failed = true;
    restricted();
  }
  let next;
  try {
    next = nextAuthorizationBudgetValue(
      snapshot.retainedPreimageBytes,
      length,
      AUTHORIZATION_WORK_LIMITS.retainedPreimageBytes
    );
  } catch {
    snapshot.failed = true;
    restricted();
  }
  snapshot.retainedPreimageBytes = next;
}

function scanAuthorizationWildcardPattern(graph, pattern) {
  let active;
  try {
    active = requireAuthorizationSourceGraph(graph);
    if (!Buffer.isBuffer(pattern)) restricted();
    let starIndex = -1;
    for (let index = 0; index < pattern.length; index += 1) {
      const next = nextAuthorizationBudgetValue(
        active.snapshot.wildcardPatternByteCount,
        1,
        AUTHORIZATION_WORK_LIMITS.wildcardPatternBytes
      );
      active.snapshot.wildcardPatternByteCount = next;
      const byte = pattern[index];
      if (byte === 0x2a) {
        if (starIndex !== -1) restricted();
        starIndex = index;
      }
    }
    return starIndex;
  } catch {
    failAuthorizationSourceGraph(graph);
    restricted();
  }
}

function matchAuthorizationWildcard(graph, domain, pattern, target, starIndex) {
  let active;
  try {
    active = requireAuthorizationSourceGraph(graph);
    if (!Buffer.isBuffer(pattern) || !Buffer.isBuffer(target)
      || typeof starIndex !== "number" || starIndex % 1 !== 0
      || starIndex < -1 || starIndex >= pattern.length) {
      restricted();
    }
    reserveAuthorizationWorkUnit(active, domain);
    if (starIndex === -1) {
      if (pattern.length !== target.length) return false;
      for (let index = 0; index < pattern.length; index += 1) {
        const next = nextAuthorizationBudgetValue(
          active.snapshot.wildcardAlignedComparisonCount,
          1,
          AUTHORIZATION_WORK_LIMITS.wildcardAlignedComparisons
        );
        active.snapshot.wildcardAlignedComparisonCount = next;
        const patternByte = pattern[index];
        const targetByte = target[index];
        if (patternByte !== 0x3f && patternByte !== targetByte) return false;
      }
      return true;
    }
    const prefixLength = starIndex;
    const suffixLength = pattern.length - starIndex - 1;
    if (target.length < prefixLength + suffixLength) return false;
    for (let prefixIndex = 0; prefixIndex < prefixLength; prefixIndex += 1) {
      const next = nextAuthorizationBudgetValue(
        active.snapshot.wildcardAlignedComparisonCount,
        1,
        AUTHORIZATION_WORK_LIMITS.wildcardAlignedComparisons
      );
      active.snapshot.wildcardAlignedComparisonCount = next;
      const patternByte = pattern[prefixIndex];
      const targetByte = target[prefixIndex];
      if (patternByte !== 0x3f && patternByte !== targetByte) return false;
    }
    for (let suffixOffset = 0; suffixOffset < suffixLength; suffixOffset += 1) {
      const patternIndex = pattern.length - suffixOffset - 1;
      const targetIndex = target.length - suffixOffset - 1;
      const next = nextAuthorizationBudgetValue(
        active.snapshot.wildcardAlignedComparisonCount,
        1,
        AUTHORIZATION_WORK_LIMITS.wildcardAlignedComparisons
      );
      active.snapshot.wildcardAlignedComparisonCount = next;
      const patternByte = pattern[patternIndex];
      const targetByte = target[targetIndex];
      if (patternByte !== 0x3f && patternByte !== targetByte) return false;
    }
    return true;
  } catch {
    failAuthorizationSourceGraph(graph);
    restricted();
  }
}
// C2B_EXACT_BLOCK_END

function reserveAuthorizationSourceRead(graph, size) {
  const active = requireAuthorizationSourceGraph(graph);
  if (!Number.isSafeInteger(size) || size < 0 || size > AUTHORIZATION_SOURCE_MAX_FILE_BYTES
    || active.fileCount + 1 > AUTHORIZATION_SOURCE_MAX_FILES
    || active.totalBytes + size > AUTHORIZATION_SOURCE_MAX_GRAPH_BYTES) {
    failAuthorizationSourceGraph(active);
    restricted();
  }
  active.fileCount += 1;
  active.totalBytes += size;
}

function reserveAuthorizationSourceNode(graph) {
  reserveAuthorizationSemanticNode(graph, "sourceFile");
}

function reserveAuthorizationDirectoryNames(graph, count) {
  const active = requireAuthorizationSourceGraph(graph);
  if (!Number.isSafeInteger(count) || count < 0 || count > AUTHORIZATION_SOURCE_MAX_DIRECTORY_NAMES
    || active.directoryNameCount + count > AUTHORIZATION_SOURCE_MAX_GRAPH_DIRECTORY_NAMES) {
    failAuthorizationSourceGraph(active);
    restricted();
  }
  active.directoryNameCount += count;
}

function createAuthorizationSourceSnapshot() {
  let fixedEnvelopeCount = 0;
  let semanticNodeCount = 0;
  if (fixedEnvelopeCount + 1 > AUTHORIZATION_SOURCE_MAX_FIXED_ENVELOPES) restricted();
  fixedEnvelopeCount += 1;
  semanticNodeCount += 1;
  const snapshot = Object.create(null, {
    fixedEnvelopeCount: { value: fixedEnvelopeCount, writable: true, enumerable: true },
    semanticNodeCount: { value: semanticNodeCount, writable: true, enumerable: true },
    failed: { value: false, writable: true, enumerable: true },
    sshGraph: { value: undefined, writable: true, enumerable: true },
    sudoGraph: { value: undefined, writable: true, enumerable: true }
  });
  Object.defineProperties(snapshot, {
    authorizationEntryCount: { value: 0, writable: true, enumerable: true },
    wildcardPatternByteCount: { value: 0, writable: true, enumerable: true },
    wildcardInvocationCount: { value: 0, writable: true, enumerable: true },
    wildcardAlignedComparisonCount: { value: 0, writable: true, enumerable: true },
    sshMatchComparisonCount: { value: 0, writable: true, enumerable: true },
    sudoSelectorComparisonCount: { value: 0, writable: true, enumerable: true },
    sudoAliasVisitCount: { value: 0, writable: true, enumerable: true },
    retainedPreimageBytes: { value: 0, writable: true, enumerable: true }
  });
  AUTHORIZATION_SOURCE_SNAPSHOT_BRAND.add(snapshot);
  return snapshot;
}

function createAuthorizationSourceGraph(snapshot, kind) {
  if (!snapshot || !AUTHORIZATION_SOURCE_SNAPSHOT_BRAND.has(snapshot)) restricted();
  try {
    const graphSlot = kind === "ssh" ? "sshGraph" : kind === "sudo" ? "sudoGraph" : undefined;
    if (snapshot.failed || !graphSlot || snapshot[graphSlot]
      || snapshot.fixedEnvelopeCount + 2 > AUTHORIZATION_SOURCE_MAX_FIXED_ENVELOPES
      || snapshot.semanticNodeCount + 2 > AUTHORIZATION_SOURCE_MAX_SEMANTIC_NODES) restricted();
    snapshot.fixedEnvelopeCount += 2;
    snapshot.semanticNodeCount += 2;
    const graph = Object.create(null, {
      snapshot: { value: snapshot, enumerable: true },
      kind: { value: kind, enumerable: true },
      fixedEnvelopeCount: { value: 2, enumerable: true },
      semanticNodeCount: { value: 2, writable: true, enumerable: true },
      fileCount: { value: 0, writable: true, enumerable: true },
      sourceFileCount: { value: 0, writable: true, enumerable: true },
      totalBytes: { value: 0, writable: true, enumerable: true },
      directoryNameCount: { value: 0, writable: true, enumerable: true },
      depth: { value: 0, writable: true, enumerable: true },
      nextOrdinal: { value: 0, writable: true, enumerable: true },
      sshPhysicalDirectiveCount: { value: 0, writable: true, enumerable: true },
      sshIncludePatternCount: { value: 0, writable: true, enumerable: true },
      sshSelectedInsertionCount: { value: 0, writable: true, enumerable: true },
      sshMatchBranchCount: { value: 0, writable: true, enumerable: true },
      sshMatchConditionCount: { value: 0, writable: true, enumerable: true },
      sshMatchPatternCount: { value: 0, writable: true, enumerable: true },
      sshAssignmentCount: { value: 0, writable: true, enumerable: true },
      sshAcceptEnvNameCount: { value: 0, writable: true, enumerable: true },
      sudoStatementCount: { value: 0, writable: true, enumerable: true },
      sudoIncludeCount: { value: 0, writable: true, enumerable: true },
      sudoSelectedInsertionCount: { value: 0, writable: true, enumerable: true },
      sudoAliasDefinitionCount: { value: 0, writable: true, enumerable: true },
      sudoAliasMemberCount: { value: 0, writable: true, enumerable: true },
      sudoDefaultsItemCount: { value: 0, writable: true, enumerable: true },
      sudoUserSpecCount: { value: 0, writable: true, enumerable: true },
      sudoUserHostRunasMemberCount: { value: 0, writable: true, enumerable: true },
      sudoTagTransitionCount: { value: 0, writable: true, enumerable: true },
      sudoCommandSpecCount: { value: 0, writable: true, enumerable: true },
      sudoArgumentTokenCount: { value: 0, writable: true, enumerable: true },
      sudoAliasEdgeCount: { value: 0, writable: true, enumerable: true },
      sudoAliasMemoEntryCount: { value: 0, writable: true, enumerable: true },
      globComparisonCount: { value: 0, writable: true, enumerable: true },
      commandWorkCount: { value: 0, writable: true, enumerable: true },
      aliasEdgeWorkCount: { value: 0, writable: true, enumerable: true },
      failed: { value: false, writable: true, enumerable: true },
      cleanupStack: { value: undefined, writable: true, enumerable: true }
    });
    graph.cleanupStack = new Array();
    AUTHORIZATION_SOURCE_GRAPH_BRAND.add(graph);
    snapshot[graphSlot] = graph;
    return graph;
  } catch (error) {
    snapshot.failed = true;
    restricted();
  }
}

function enterAuthorizationSourceDepth(graph) {
  const active = requireAuthorizationSourceGraph(graph);
  if (active.depth + 1 > AUTHORIZATION_SOURCE_MAX_DEPTH) {
    failAuthorizationSourceGraph(active);
    restricted();
  }
  active.depth += 1;
}

function leaveAuthorizationSourceDepth(graph) {
  const active = requireAuthorizationSourceGraph(graph);
  if (active.depth <= 0) {
    failAuthorizationSourceGraph(active);
    restricted();
  }
  active.depth -= 1;
}

function reserveAuthorizationSourceFile(graph, size) {
  reserveAuthorizationSourceRead(graph, size);
  reserveAuthorizationSourceNode(graph);
}

function authorizationPathIsCanonical(path) {
  if (typeof path !== "string" || path.length < 2 || path[0] !== "/"
    || path.at(-1) === "/" || path.includes("\\") || path.includes("\0")) return false;
  let componentStart = 1;
  for (let index = 0; index < path.length; index += 1) {
    const code = path.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = path.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) return false;
    if (path[index] !== "/") continue;
    if (index !== 0) {
      if (index === componentStart || (index - componentStart === 1 && path[componentStart] === ".")
        || (index - componentStart === 2 && path.slice(componentStart, index) === "..")) return false;
      componentStart = index + 1;
    }
  }
  return componentStart < path.length
    && !(path.length - componentStart === 1 && path[componentStart] === ".")
    && !(path.length - componentStart === 2 && path.slice(componentStart) === "..");
}

function validateAuthorizationAncestor(stats) {
  if (!stats || typeof stats !== "object" || typeof stats.uid !== "bigint" || typeof stats.mode !== "bigint"
    || typeof stats.isDirectory !== "function" || typeof stats.isSymbolicLink !== "function"
    || stats.uid !== 0n || !stats.isDirectory() || stats.isSymbolicLink() || (stats.mode & 0o022n) !== 0n) restricted();
}

function validateAuthorizationFinalStat(stats, type) {
  if (!stats || typeof stats !== "object"
    || !["uid", "gid", "mode", "nlink", "dev", "ino", "size"].every((key) => typeof stats[key] === "bigint")
    || typeof stats.isDirectory !== "function" || typeof stats.isFile !== "function" || typeof stats.isSymbolicLink !== "function"
    || stats.uid !== 0n || stats.gid !== 0n || stats.isSymbolicLink()
    || (stats.mode & 0o7000n) !== 0n || (stats.mode & 0o022n) !== 0n) restricted();
  if (type === "file") {
    if (!stats.isFile() || stats.isDirectory() || stats.nlink !== 1n) restricted();
  } else if (type === "directory") {
    if (!stats.isDirectory() || stats.isFile() || stats.nlink <= 0n) restricted();
  } else {
    restricted();
  }
}

function sameAuthorizationFinalStat(left, right, type) {
  validateAuthorizationFinalStat(left, type);
  validateAuthorizationFinalStat(right, type);
  if (left.uid !== right.uid || left.gid !== right.gid
    || (left.mode & 0o777n) !== (right.mode & 0o777n)
    || (left.mode & 0o7000n) !== (right.mode & 0o7000n)
    || left.dev !== right.dev || left.ino !== right.ino || left.size !== right.size
    || left.nlink !== right.nlink) restricted();
}

function lstatAuthorizationPathChain(path, operations, type) {
  if (!authorizationPathIsCanonical(path)) restricted();
  // This is a path-based residual check only: a hostile parent may replace and
  // restore a component between lstat calls, so it is deliberately not claimed
  // to provide race-free same-fd directory enumeration.
  validateAuthorizationAncestor(operations.lstat("/"));
  let current = "";
  let start = 1;
  for (let index = 1; index <= path.length; index += 1) {
    if (index !== path.length && path[index] !== "/") continue;
    current += `/${path.slice(start, index)}`;
    const stats = operations.lstat(current);
    if (index === path.length) {
      validateAuthorizationFinalStat(stats, type);
      return stats;
    }
    validateAuthorizationAncestor(stats);
    start = index + 1;
  }
  restricted();
}

function withTrustedAuthorizationSourcePath(graph, path, type, inputOperations, consume) {
  let operations;
  let fd;
  let opened = false;
  let result;
  let failure;
  try {
    requireAuthorizationSourceGraph(graph);
    operations = exactPrivateOperationRecord(inputOperations, AUTHORIZATION_PATH_OPERATION_KEYS);
    if (typeof consume !== "function") restricted();
    const finalLstat = lstatAuthorizationPathChain(path, operations, type);
    fd = operations.open(path, type === "directory" ? 0xB0000 : 0xA0000);
    if (!Number.isInteger(fd) || fd < 0) restricted();
    opened = true;
    const initial = operations.fstat(fd);
    sameAuthorizationFinalStat(finalLstat, initial, type);
    try {
      result = consume(fd, initial, operations);
    } catch (error) {
      failure = error;
    }
    try {
      const after = operations.fstat(fd);
      sameAuthorizationFinalStat(initial, after, type);
    } catch (error) {
      if (!failure) failure = error;
    }
    requireAuthorizationSourceGraph(graph);
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

function registerAuthorizationBuffer(graph, buffer) {
  if (!Buffer.isBuffer(buffer)) restricted();
  try {
    requireAuthorizationSourceGraph(graph).cleanupStack.push(buffer);
    return buffer;
  } catch (error) {
    buffer.fill(0);
    failAuthorizationSourceGraph(graph);
    restricted();
  }
}

function allocateAuthorizationBuffer(graph, size) {
  let buffer;
  try {
    buffer = Buffer.alloc(size);
    return registerAuthorizationBuffer(graph, buffer);
  } catch (error) {
    if (Buffer.isBuffer(buffer)) buffer.fill(0);
    failAuthorizationSourceGraph(graph);
    restricted();
  }
}

function encodeAuthorizationBasename(graph, text) {
  let buffer;
  try {
    buffer = Buffer.from(text, "utf8");
    return registerAuthorizationBuffer(graph, buffer);
  } catch (error) {
    if (Buffer.isBuffer(buffer)) buffer.fill(0);
    failAuthorizationSourceGraph(graph);
    restricted();
  }
}

function zeroAuthorizationBuffersTo(graph, checkpoint) {
  while (graph.cleanupStack.length > checkpoint) {
    const buffer = graph.cleanupStack.pop();
    if (Buffer.isBuffer(buffer)) buffer.fill(0);
  }
}

function readAuthorizationSourceBytes(graph, fd, stats, operations) {
  if (stats.size < 0n || stats.size > BigInt(Number.MAX_SAFE_INTEGER)) restricted();
  const size = Number(stats.size);
  reserveAuthorizationSourceRead(graph, size);
  const bytes = allocateAuthorizationBuffer(graph, size);
  let offset = 0;
  while (offset < size) {
    let count;
    try {
      count = operations.read(fd, bytes, offset, size - offset, offset);
    } catch (error) {
      if (error && error.code === "EINTR") continue;
      restricted();
    }
    if (!Number.isInteger(count) || count <= 0 || count > size - offset) restricted();
    offset += count;
  }
  const eof = allocateAuthorizationBuffer(graph, 1);
  while (true) {
    try {
      const count = operations.read(fd, eof, 0, 1, size);
      if (!Number.isInteger(count) || count !== 0) restricted();
      break;
    } catch (error) {
      if (error && error.code === "EINTR") continue;
      restricted();
    }
  }
  return bytes;
}

function validateAuthorizationPhysicalLines(bytes) {
  let lineBytes = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] === 0x0a) {
      lineBytes = 0;
    } else {
      lineBytes += 1;
      if (lineBytes > AUTHORIZATION_SOURCE_MAX_LINE_BYTES) restricted();
    }
  }
}

function consumeTrustedAuthorizationSource(graph, path, inputOperations, callback) {
  const active = requireAuthorizationSourceGraph(graph);
  const checkpoint = active.cleanupStack.length;
  let entered = false;
  try {
    if (typeof callback !== "function") restricted();
    enterAuthorizationSourceDepth(active);
    entered = true;
    let bytes;
    let stats;
    withTrustedAuthorizationSourcePath(active, path, "file", inputOperations, (fd, openedStats, operations) => {
      bytes = readAuthorizationSourceBytes(active, fd, openedStats, operations);
      stats = openedStats;
    });
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    reserveAuthorizationSourceNode(active);
    const ordinal = active.nextOrdinal;
    active.nextOrdinal += 1;
    validateAuthorizationPhysicalLines(bytes);
    const sourceFile = Object.freeze(Object.create(null, {
      ordinal: { value: ordinal, enumerable: true },
      path: { value: path, enumerable: true },
      sha256: { value: sha256, enumerable: true },
      uid: { value: Number(stats.uid), enumerable: true },
      gid: { value: Number(stats.gid), enumerable: true },
      mode: { value: Number(stats.mode & 0o777n), enumerable: true },
      nlink: { value: Number(stats.nlink), enumerable: true }
    }));
    const result = callback(bytes, sourceFile);
    requireAuthorizationSourceGraph(active);
    return result;
  } catch (error) {
    failAuthorizationSourceGraph(active);
    restricted();
  } finally {
    try {
      if (entered && active.depth > 0) active.depth -= 1;
    } finally {
      zeroAuthorizationBuffersTo(active, checkpoint);
    }
  }
}

function cleanupOnlyAuthorizationDirectoryArray(value, length) {
  if (!value || (typeof value !== "object" && typeof value !== "function")) return;
  let indexes;
  try {
    indexes = Object.getOwnPropertyNames(value)
      .filter((name) => /^(0|[1-9][0-9]*)$/.test(name) && Number(name) < 4294967295)
      .map(Number)
      .sort((left, right) => right - left);
  } catch {
    return;
  }
  for (const index of indexes) {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor && Object.hasOwn(descriptor, "value") && Buffer.isBuffer(descriptor.value)) descriptor.value.fill(0);
    } catch {
      // Cleanup-only handling must not turn a hostile descriptor into further work.
    }
  }
}

function validateAuthorizationDirectoryArray(graph, value) {
  if (!Array.isArray(value)) {
    cleanupOnlyAuthorizationDirectoryArray(value);
    restricted();
  }
  let lengthDescriptor;
  try {
    lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  } catch {
    cleanupOnlyAuthorizationDirectoryArray(value);
    restricted();
  }
  if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, "value") || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0 || lengthDescriptor.enumerable !== false || lengthDescriptor.configurable !== false) {
    cleanupOnlyAuthorizationDirectoryArray(value);
    restricted();
  }
  const length = lengthDescriptor.value;
  try {
    reserveAuthorizationDirectoryNames(graph, length);
  } catch (error) {
    cleanupOnlyAuthorizationDirectoryArray(value);
    throw error;
  }
  const checkpoint = graph.cleanupStack.length;
  let valid = true;
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.get !== undefined || descriptor.set !== undefined) {
      valid = false;
      continue;
    }
    if (!Buffer.isBuffer(descriptor.value)) {
      valid = false;
      continue;
    }
    registerAuthorizationBuffer(graph, descriptor.value);
  }
  if (!valid) restricted();
  for (let index = 0; index < length; index += 1) {
    const basename = graph.cleanupStack[checkpoint + index];
    if (basename.length < 1 || basename.length > 255 || basename.includes(0) || basename.includes(0x2f)
      || (basename.length === 1 && basename[0] === 0x2e)
      || (basename.length === 2 && basename[0] === 0x2e && basename[1] === 0x2e)) restricted();
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(basename);
    } catch {
      restricted();
    }
    const encoded = encodeAuthorizationBasename(graph, text);
    if (Buffer.compare(encoded, basename) !== 0) restricted();
  }
  for (let left = 0; left < length; left += 1) {
    for (let right = left + 1; right < length; right += 1) {
      if (Buffer.compare(graph.cleanupStack[checkpoint + left], graph.cleanupStack[checkpoint + right]) === 0) restricted();
    }
  }
  return checkpoint;
}

function consumeTrustedAuthorizationDirectory(graph, path, inputPathOperations, inputSourceOperations, callback) {
  const active = requireAuthorizationSourceGraph(graph);
  const checkpoint = active.cleanupStack.length;
  try {
    if (typeof callback !== "function") restricted();
    const sourceOperations = exactPrivateOperationRecord(inputSourceOperations, AUTHORIZATION_SOURCE_OPERATION_KEYS);
    return withTrustedAuthorizationSourcePath(active, path, "directory", inputPathOperations, () => {
      const values = sourceOperations.readDirectory(path);
      validateAuthorizationDirectoryArray(active, values);
      return callback(values);
    });
  } catch (error) {
    failAuthorizationSourceGraph(active);
    restricted();
  } finally {
    zeroAuthorizationBuffersTo(active, checkpoint);
  }
}

function inspectAuthorizationSourceBudget(snapshot, ssh, sudo) {
  if (!AUTHORIZATION_SOURCE_SNAPSHOT_BRAND.has(snapshot)
    || !AUTHORIZATION_SOURCE_GRAPH_BRAND.has(ssh) || !AUTHORIZATION_SOURCE_GRAPH_BRAND.has(sudo)
    || ssh.snapshot !== snapshot || sudo.snapshot !== snapshot) restricted();
  return {
    snapshotFixedEnvelopeCount: snapshot.fixedEnvelopeCount,
    snapshotSemanticNodeCount: snapshot.semanticNodeCount,
    sshFixedEnvelopeCount: 2,
    sudoFixedEnvelopeCount: 2,
    sshSourceFileCount: ssh.sourceFileCount,
    sudoSourceFileCount: sudo.sourceFileCount,
    sshDepth: ssh.depth,
    sudoDepth: sudo.depth,
    failed: snapshot.failed
  };
}

// C3_SSH_SOURCE_BLOCK_BEGIN
const AUTHORIZATION_SSH_ROOT_CONFIG = "/etc/ssh/sshd_config";
const AUTHORIZATION_SSH_RELATIVE_BASE = "/etc/ssh";
const AUTHORIZATION_SSH_PROVENANCE = new WeakMap();
const AUTHORIZATION_SSH_AUTHORITY_NAMES = "authenticationmethods pubkeyauthentication passwordauthentication kbdinteractiveauthentication challengeresponseauthentication hostbasedauthentication gssapiauthentication kerberosauthentication permituserenvironment acceptenv forcecommand chrootdirectory disableforwarding permittunnel authorizedkeysfile authorizedkeyscommand authorizedprincipalsfile authorizedprincipalscommand trustedusercakeys";
const AUTHORIZATION_SSH_BOOLEAN_NAMES = "pubkeyauthentication passwordauthentication kbdinteractiveauthentication challengeresponseauthentication hostbasedauthentication gssapiauthentication kerberosauthentication permituserenvironment disableforwarding";
const AUTHORIZATION_SSH_OPAQUE_NAMES = "addressfamily allowagentforwarding allowgroups allowstreamlocalforwarding allowtcpforwarding allowusers banner casignaturealgorithms channeltimeout ciphers clientalivecountmax clientaliveinterval compression denygroups denyusers exposeauthinfo fingerprinthash gatewayports gssapicleanupcredentials gssapistrictacceptorcheck hostbasedacceptedalgorithms hostbasedusesnamefrompacketonly hostcertificate hostkey hostkeyagent hostkeyalgorithms ignorerhosts ipqos kerberosgetafstoken kerberosorlocalpasswd kerberosticketcleanup listenaddress logingracetime loglevel logverbose macs maxauthtries maxsessions maxstartups modulifile persourcemaxstartups persourcenetblocksize permitemptypasswords permitlisten permitopen permitrootlogin permittty permituserrc pidfile port printlastlog printmotd pubkeyacceptedalgorithms pubkeyauthoptions rekeylimit requiredrsasize revokedkeys rdomain securitykeyprovider setenv streamlocalbindmask streamlocalbindunlink strictmodes subsystem syslogfacility tcpkeepalive usedns usepam versionaddendum x11displayoffset x11forwarding x11uselocalhost xauthlocation unusedconnectiontimeout";
const AUTHORIZATION_SSH_MATCH_NAMES = "user group host address localaddress localport rdomain localnetwork all";
const AUTHORIZATION_SSH_JSON_HEX = "0123456789abcdef";

function reserveAuthorizationFixedEnvelope(graph) {
  let active;
  let snapshotFixedNext;
  let graphSemanticNext;
  let snapshotSemanticNext;
  try {
    active = requireAuthorizationSourceGraph(graph);
    snapshotFixedNext = nextAuthorizationBudgetValue(
      active.snapshot.fixedEnvelopeCount,
      1,
      AUTHORIZATION_SOURCE_MAX_FIXED_ENVELOPES
    );
    graphSemanticNext = nextAuthorizationBudgetValue(
      active.semanticNodeCount,
      1,
      AUTHORIZATION_SOURCE_MAX_SEMANTIC_NODES
    );
    snapshotSemanticNext = nextAuthorizationBudgetValue(
      active.snapshot.semanticNodeCount,
      1,
      AUTHORIZATION_SOURCE_MAX_SEMANTIC_NODES
    );
    active.snapshot.fixedEnvelopeCount = snapshotFixedNext;
    active.semanticNodeCount = graphSemanticNext;
    active.snapshot.semanticNodeCount = snapshotSemanticNext;
  } catch {
    failAuthorizationSourceGraph(graph);
    restricted();
  }
}

function authorizationSshNativeEmptyArray(value) {
  if (!Array.isArray(value) || types.isProxy(value)
    || Object.getPrototypeOf(value) !== Array.prototype
    || types.isProxy(Object.getPrototypeOf(value))) return false;
  const length = Object.getOwnPropertyDescriptor(value, "length");
  return !!length && Object.hasOwn(length, "value") && length.value === 0
    && length.writable === true && length.enumerable === false && length.configurable === false
    && length.get === undefined && length.set === undefined
    && value.push === Array.prototype.push && value.pop === Array.prototype.pop;
}

function authorizationSshFreshGraphCounters(candidate) {
  return candidate.fileCount === 0 && candidate.sourceFileCount === 0 && candidate.totalBytes === 0
    && candidate.directoryNameCount === 0 && candidate.depth === 0 && candidate.nextOrdinal === 0
    && candidate.sshPhysicalDirectiveCount === 0 && candidate.sshIncludePatternCount === 0
    && candidate.sshSelectedInsertionCount === 0 && candidate.sshMatchBranchCount === 0
    && candidate.sshMatchConditionCount === 0 && candidate.sshMatchPatternCount === 0
    && candidate.sshAssignmentCount === 0 && candidate.sshAcceptEnvNameCount === 0
    && candidate.sudoStatementCount === 0 && candidate.sudoIncludeCount === 0
    && candidate.sudoSelectedInsertionCount === 0 && candidate.sudoAliasDefinitionCount === 0
    && candidate.sudoAliasMemberCount === 0 && candidate.sudoDefaultsItemCount === 0
    && candidate.sudoUserSpecCount === 0 && candidate.sudoUserHostRunasMemberCount === 0
    && candidate.sudoTagTransitionCount === 0 && candidate.sudoCommandSpecCount === 0
    && candidate.sudoArgumentTokenCount === 0 && candidate.sudoAliasEdgeCount === 0
    && candidate.sudoAliasMemoEntryCount === 0 && candidate.globComparisonCount === 0
    && candidate.commandWorkCount === 0 && candidate.aliasEdgeWorkCount === 0;
}

function requireFreshAuthorizationSshGraph(graph) {
  const active = requireAuthorizationSourceGraph(graph);
  const snapshot = active.snapshot;
  const sudo = snapshot.sudoGraph;
  if (active.kind !== "ssh" || snapshot.sshGraph !== active
    || !AUTHORIZATION_SOURCE_SNAPSHOT_BRAND.has(snapshot)
    || !sudo || !AUTHORIZATION_SOURCE_GRAPH_BRAND.has(sudo)
    || sudo.kind !== "sudo" || sudo.snapshot !== snapshot || sudo === active
    || snapshot.fixedEnvelopeCount !== 5 || snapshot.failed
    || active.fixedEnvelopeCount !== 2 || active.semanticNodeCount !== 2 || active.failed
    || sudo.fixedEnvelopeCount !== 2 || sudo.semanticNodeCount !== 2 || sudo.failed
    || active.cleanupStack === sudo.cleanupStack
    || !authorizationSshNativeEmptyArray(active.cleanupStack)
    || !authorizationSshNativeEmptyArray(sudo.cleanupStack)
    || snapshot.wildcardPatternByteCount !== 0 || snapshot.wildcardInvocationCount !== 0
    || snapshot.wildcardAlignedComparisonCount !== 0 || snapshot.sshMatchComparisonCount !== 0
    || snapshot.sudoSelectorComparisonCount !== 0 || snapshot.sudoAliasVisitCount !== 0
    || snapshot.retainedPreimageBytes !== 0) restricted();
  const zeroEntry = snapshot.authorizationEntryCount === 0
    && snapshot.semanticNodeCount === 5
    && !AUTHORIZATION_SSH_PROVENANCE.has(snapshot);
  const oneEntry = snapshot.authorizationEntryCount === 1
    && snapshot.semanticNodeCount === 6
    && AUTHORIZATION_SSH_PROVENANCE.get(snapshot) === active;
  if (!zeroEntry && !oneEntry) restricted();
  if (!authorizationSshFreshGraphCounters(active) || !authorizationSshFreshGraphCounters(sudo)) restricted();
  return active;
}

function authorizationSshAsciiEquals(bytes, start, end, constant) {
  if (end - start !== constant.length) return false;
  for (let index = 0; index < constant.length; index += 1) {
    let byte = bytes[start + index];
    if (byte >= 0x41 && byte <= 0x5a) byte += 0x20;
    if (byte !== constant.charCodeAt(index)) return false;
  }
  return true;
}

function authorizationSshAsciiExact(bytes, start, end, constant) {
  if (end - start !== constant.length) return false;
  for (let index = 0; index < constant.length; index += 1) {
    if (bytes[start + index] !== constant.charCodeAt(index)) return false;
  }
  return true;
}

function authorizationSshReviewedName(bytes, start, end, names) {
  let wordStart = 0;
  while (wordStart < names.length) {
    let wordEnd = wordStart;
    while (wordEnd < names.length && names.charCodeAt(wordEnd) !== 0x20) wordEnd += 1;
    if (end - start === wordEnd - wordStart) {
      let equal = true;
      for (let index = 0; index < wordEnd - wordStart; index += 1) {
        let byte = bytes[start + index];
        if (byte >= 0x41 && byte <= 0x5a) byte += 0x20;
        if (byte !== names.charCodeAt(wordStart + index)) {
          equal = false;
          break;
        }
      }
      if (equal) {
        if (names === AUTHORIZATION_SSH_AUTHORITY_NAMES) {
          switch (wordStart) {
            case 0: return "authenticationmethods";
            case 22: return "pubkeyauthentication";
            case 43: return "passwordauthentication";
            case 66: return "kbdinteractiveauthentication";
            case 95: return "challengeresponseauthentication";
            case 127: return "hostbasedauthentication";
            case 151: return "gssapiauthentication";
            case 172: return "kerberosauthentication";
            case 195: return "permituserenvironment";
            case 217: return "acceptenv";
            case 227: return "forcecommand";
            case 240: return "chrootdirectory";
            case 256: return "disableforwarding";
            case 274: return "permittunnel";
            case 287: return "authorizedkeysfile";
            case 306: return "authorizedkeyscommand";
            case 328: return "authorizedprincipalsfile";
            case 353: return "authorizedprincipalscommand";
            case 381: return "trustedusercakeys";
            default: restricted();
          }
        }
        if (names === AUTHORIZATION_SSH_OPAQUE_NAMES) {
          switch (wordStart) {
            case 0: return "addressfamily";
            case 14: return "allowagentforwarding";
            case 35: return "allowgroups";
            case 47: return "allowstreamlocalforwarding";
            case 74: return "allowtcpforwarding";
            case 93: return "allowusers";
            case 104: return "banner";
            case 111: return "casignaturealgorithms";
            case 133: return "channeltimeout";
            case 148: return "ciphers";
            case 156: return "clientalivecountmax";
            case 176: return "clientaliveinterval";
            case 196: return "compression";
            case 208: return "denygroups";
            case 219: return "denyusers";
            case 229: return "exposeauthinfo";
            case 244: return "fingerprinthash";
            case 260: return "gatewayports";
            case 273: return "gssapicleanupcredentials";
            case 298: return "gssapistrictacceptorcheck";
            case 324: return "hostbasedacceptedalgorithms";
            case 352: return "hostbasedusesnamefrompacketonly";
            case 384: return "hostcertificate";
            case 400: return "hostkey";
            case 408: return "hostkeyagent";
            case 421: return "hostkeyalgorithms";
            case 439: return "ignorerhosts";
            case 452: return "ipqos";
            case 458: return "kerberosgetafstoken";
            case 478: return "kerberosorlocalpasswd";
            case 500: return "kerberosticketcleanup";
            case 522: return "listenaddress";
            case 536: return "logingracetime";
            case 551: return "loglevel";
            case 560: return "logverbose";
            case 571: return "macs";
            case 576: return "maxauthtries";
            case 589: return "maxsessions";
            case 601: return "maxstartups";
            case 613: return "modulifile";
            case 624: return "persourcemaxstartups";
            case 645: return "persourcenetblocksize";
            case 667: return "permitemptypasswords";
            case 688: return "permitlisten";
            case 701: return "permitopen";
            case 712: return "permitrootlogin";
            case 728: return "permittty";
            case 738: return "permituserrc";
            case 751: return "pidfile";
            case 759: return "port";
            case 764: return "printlastlog";
            case 777: return "printmotd";
            case 787: return "pubkeyacceptedalgorithms";
            case 812: return "pubkeyauthoptions";
            case 830: return "rekeylimit";
            case 841: return "requiredrsasize";
            case 857: return "revokedkeys";
            case 869: return "rdomain";
            case 877: return "securitykeyprovider";
            case 897: return "setenv";
            case 904: return "streamlocalbindmask";
            case 924: return "streamlocalbindunlink";
            case 946: return "strictmodes";
            case 958: return "subsystem";
            case 968: return "syslogfacility";
            case 983: return "tcpkeepalive";
            case 996: return "usedns";
            case 1003: return "usepam";
            case 1010: return "versionaddendum";
            case 1026: return "x11displayoffset";
            case 1043: return "x11forwarding";
            case 1057: return "x11uselocalhost";
            case 1073: return "xauthlocation";
            case 1087: return "unusedconnectiontimeout";
            default: restricted();
          }
        }
        if (names === AUTHORIZATION_SSH_MATCH_NAMES) {
          switch (wordStart) {
            case 0: return "user";
            case 5: return "group";
            case 11: return "host";
            case 16: return "address";
            case 24: return "localaddress";
            case 37: return "localport";
            case 47: return "rdomain";
            case 55: return "localnetwork";
            case 68: return "all";
            default: restricted();
          }
        }
        restricted();
      }
    }
    wordStart = wordEnd + 1;
  }
  return undefined;
}

function authorizationSshNameInList(name, names) {
  let wordStart = 0;
  while (wordStart < names.length) {
    let wordEnd = wordStart;
    while (wordEnd < names.length && names.charCodeAt(wordEnd) !== 0x20) wordEnd += 1;
    if (name.length === wordEnd - wordStart) {
      let equal = true;
      for (let index = 0; index < name.length; index += 1) {
        if (name.charCodeAt(index) !== names.charCodeAt(wordStart + index)) {
          equal = false;
          break;
        }
      }
      if (equal) return true;
    }
    wordStart = wordEnd + 1;
  }
  return false;
}

function authorizationSshDirective(bytes, start, end) {
  if (authorizationSshAsciiEquals(bytes, start, end, "include")) return "include";
  if (authorizationSshAsciiEquals(bytes, start, end, "match")) return "match";
  const authority = authorizationSshReviewedName(bytes, start, end, AUTHORIZATION_SSH_AUTHORITY_NAMES);
  if (authority !== undefined) return authority;
  const opaque = authorizationSshReviewedName(bytes, start, end, AUTHORIZATION_SSH_OPAQUE_NAMES);
  return opaque === undefined ? "unknown" : opaque;
}

function authorizationSshMatchName(bytes, start, end) {
  return authorizationSshReviewedName(bytes, start, end, AUTHORIZATION_SSH_MATCH_NAMES);
}

function authorizationSshSkipSeparators(bytes, start, end) {
  let index = start;
  while (index < end && (bytes[index] === 0x20 || bytes[index] === 0x09)) index += 1;
  return index;
}

function authorizationSshTokenEnd(bytes, start, end) {
  let index = start;
  while (index < end && bytes[index] !== 0x20 && bytes[index] !== 0x09) index += 1;
  return index;
}

function authorizationSshValidateSourceBytes(bytes) {
  for (let index = 0; index < bytes.length;) {
    const first = bytes[index];
    if (first <= 0x7f) {
      if (first === 0 || first === 0x0d || first === 0x7f
        || (first < 0x20 && first !== 0x09 && first !== 0x0a)) restricted();
      index += 1;
      continue;
    }
    let scalar;
    let length;
    if (first >= 0xc2 && first <= 0xdf) {
      length = 2;
      if (index + length > bytes.length || bytes[index + 1] < 0x80 || bytes[index + 1] > 0xbf) restricted();
      scalar = ((first & 0x1f) << 6) | (bytes[index + 1] & 0x3f);
    } else if (first >= 0xe0 && first <= 0xef) {
      length = 3;
      if (index + length > bytes.length
        || bytes[index + 1] < (first === 0xe0 ? 0xa0 : 0x80)
        || bytes[index + 1] > (first === 0xed ? 0x9f : 0xbf)
        || bytes[index + 2] < 0x80 || bytes[index + 2] > 0xbf) restricted();
      scalar = ((first & 0x0f) << 12) | ((bytes[index + 1] & 0x3f) << 6) | (bytes[index + 2] & 0x3f);
    } else if (first >= 0xf0 && first <= 0xf4) {
      length = 4;
      if (index + length > bytes.length
        || bytes[index + 1] < (first === 0xf0 ? 0x90 : 0x80)
        || bytes[index + 1] > (first === 0xf4 ? 0x8f : 0xbf)
        || bytes[index + 2] < 0x80 || bytes[index + 2] > 0xbf
        || bytes[index + 3] < 0x80 || bytes[index + 3] > 0xbf) restricted();
      scalar = ((first & 0x07) << 18) | ((bytes[index + 1] & 0x3f) << 12)
        | ((bytes[index + 2] & 0x3f) << 6) | (bytes[index + 3] & 0x3f);
    } else {
      restricted();
    }
    if (scalar === 0xfeff || scalar === 0x0085 || scalar === 0x00a0 || scalar === 0x1680
      || (scalar >= 0x2000 && scalar <= 0x200a) || scalar === 0x2028 || scalar === 0x2029
      || scalar === 0x202f || scalar === 0x205f || scalar === 0x3000) restricted();
    index += length;
  }
}

function authorizationSshEvent(events, kind, sourceOrdinal, lineNumber, first, second, third, fourth, fifth, sixth, seventh) {
  const event = Object.create(null);
  const eventOrdinal = events.length;
  if (kind === "physicalDirective") {
    event.kind = kind;
    event.eventOrdinal = eventOrdinal;
    event.sourceOrdinal = sourceOrdinal;
    event.lineNumber = lineNumber;
    event.directive = first;
    event.scope = second;
    event.branchOrdinal = third;
  } else if (kind === "includePattern") {
    event.kind = kind;
    event.eventOrdinal = eventOrdinal;
    event.sourceOrdinal = sourceOrdinal;
    event.lineNumber = lineNumber;
    event.physicalEventOrdinal = first;
    event.argumentOrdinal = second;
    event.starIndex = third;
    event.selectedCount = fourth;
  } else if (kind === "selectedInsertion") {
    event.kind = kind;
    event.eventOrdinal = eventOrdinal;
    event.sourceOrdinal = sourceOrdinal;
    event.lineNumber = lineNumber;
    event.includePatternEventOrdinal = first;
    event.selectionOrdinal = second;
    event.path = third;
  } else if (kind === "matchBranch") {
    event.kind = kind;
    event.eventOrdinal = eventOrdinal;
    event.sourceOrdinal = sourceOrdinal;
    event.lineNumber = lineNumber;
    event.physicalEventOrdinal = first;
    event.branchOrdinal = second;
    event.conditionStartEventOrdinal = third;
    event.conditionCount = fourth;
    event.patternCount = fifth;
  } else if (kind === "matchCondition") {
    event.kind = kind;
    event.eventOrdinal = eventOrdinal;
    event.sourceOrdinal = sourceOrdinal;
    event.lineNumber = lineNumber;
    event.physicalEventOrdinal = first;
    event.branchOrdinal = second;
    event.conditionOrdinal = third;
    event.name = fourth;
    event.patternStartEventOrdinal = fifth;
    event.patternCount = sixth;
  } else if (kind === "matchPattern") {
    event.kind = kind;
    event.eventOrdinal = eventOrdinal;
    event.sourceOrdinal = sourceOrdinal;
    event.lineNumber = lineNumber;
    event.physicalEventOrdinal = first;
    event.branchOrdinal = second;
    event.conditionOrdinal = third;
    event.patternOrdinal = fourth;
    event.negated = fifth;
    event.valueBytes = sixth;
    event.starIndex = seventh;
  } else if (kind === "assignment") {
    event.kind = kind;
    event.eventOrdinal = eventOrdinal;
    event.sourceOrdinal = sourceOrdinal;
    event.lineNumber = lineNumber;
    event.physicalEventOrdinal = first;
    event.scope = second;
    event.branchOrdinal = third;
    event.name = fourth;
    event.argumentCount = fifth;
    event.valueBytes = sixth;
  } else if (kind === "acceptEnvName") {
    event.kind = kind;
    event.eventOrdinal = eventOrdinal;
    event.sourceOrdinal = sourceOrdinal;
    event.lineNumber = lineNumber;
    event.physicalEventOrdinal = first;
    event.scope = second;
    event.branchOrdinal = third;
    event.assignmentEventOrdinal = fourth;
    event.nameOrdinal = fifth;
    event.valueBytes = sixth;
  } else {
    restricted();
  }
  Object.freeze(event);
  events.push(event);
  return eventOrdinal;
}

function authorizationSshZeroEventBuffer(event) {
  if (!event || typeof event !== "object") return;
  if (event.kind === "matchPattern" || event.kind === "acceptEnvName") {
    if (Buffer.isBuffer(event.valueBytes)) event.valueBytes.fill(0);
  } else if (event.kind === "assignment" && Buffer.isBuffer(event.valueBytes)) {
    event.valueBytes.fill(0);
  }
}

function cleanupAuthorizationSshSyntax(graph, owner, deleteOwnerBinding) {
  let cleanupFailed = false;
  if (deleteOwnerBinding) {
    try {
      if (!AUTHORIZATION_SSH_PROVENANCE.delete(owner)) cleanupFailed = true;
    } catch {
      cleanupFailed = true;
    }
  }
  if (owner && Array.isArray(owner.events)) {
    for (let index = owner.events.length - 1; index >= 0; index -= 1) {
      try {
        authorizationSshZeroEventBuffer(owner.events[index]);
      } catch {
        cleanupFailed = true;
      }
    }
    try {
      owner.events.length = 0;
    } catch {
      cleanupFailed = true;
    }
  }
  if (owner && owner.closure && Array.isArray(owner.closure.files)) {
    try {
      owner.closure.files.length = 0;
    } catch {
      cleanupFailed = true;
    }
  }
  if (owner && Array.isArray(owner.activePaths)) {
    try {
      owner.activePaths.length = 0;
    } catch {
      cleanupFailed = true;
    }
  }
  if (owner) {
    try {
      owner.closure = undefined;
    } catch {
      cleanupFailed = true;
    }
    try {
      owner.disposed = true;
    } catch {
      cleanupFailed = true;
    }
  }
  if (cleanupFailed) failAuthorizationSourceGraph(graph);
  return !cleanupFailed;
}

function authorizationSshJsonStringLength(value) {
  if (typeof value !== "string") restricted();
  let length = 2;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      if (low < 0xdc00 || low > 0xdfff) restricted();
      length += 4;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      restricted();
    } else if (code === 0x22 || code === 0x5c || code === 0x08 || code === 0x0c
      || code === 0x0a || code === 0x0d || code === 0x09) {
      length += 2;
    } else if (code <= 0x1f) {
      length += 6;
    } else if (code <= 0x7f) {
      length += 1;
    } else if (code <= 0x7ff) {
      length += 2;
    } else {
      length += 3;
    }
  }
  return length;
}

function authorizationSshIntegerLength(value) {
  if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) restricted();
  if (value === 0) return 1;
  let digits = 0;
  for (let remaining = value; remaining > 0; remaining = Math.floor(remaining / 10)) digits += 1;
  return digits;
}

function authorizationSshWriteAscii(buffer, offset, value) {
  for (let index = 0; index < value.length; index += 1) buffer[offset++] = value.charCodeAt(index);
  return offset;
}

function authorizationSshWriteJsonString(buffer, offset, value) {
  buffer[offset++] = 0x22;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      if (low < 0xdc00 || low > 0xdfff) restricted();
      const scalar = 0x10000 + ((code - 0xd800) << 10) + low - 0xdc00;
      buffer[offset++] = 0xf0 | (scalar >> 18);
      buffer[offset++] = 0x80 | ((scalar >> 12) & 0x3f);
      buffer[offset++] = 0x80 | ((scalar >> 6) & 0x3f);
      buffer[offset++] = 0x80 | (scalar & 0x3f);
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      restricted();
    } else if (code === 0x22 || code === 0x5c) {
      buffer[offset++] = 0x5c;
      buffer[offset++] = code;
    } else if (code === 0x08 || code === 0x0c || code === 0x0a || code === 0x0d || code === 0x09) {
      buffer[offset++] = 0x5c;
      buffer[offset++] = code === 0x08 ? 0x62 : code === 0x0c ? 0x66
        : code === 0x0a ? 0x6e : code === 0x0d ? 0x72 : 0x74;
    } else if (code <= 0x1f) {
      buffer[offset++] = 0x5c;
      buffer[offset++] = 0x75;
      buffer[offset++] = 0x30;
      buffer[offset++] = 0x30;
      buffer[offset++] = AUTHORIZATION_SSH_JSON_HEX.charCodeAt(code >> 4);
      buffer[offset++] = AUTHORIZATION_SSH_JSON_HEX.charCodeAt(code & 0x0f);
    } else if (code <= 0x7f) {
      buffer[offset++] = code;
    } else if (code <= 0x7ff) {
      buffer[offset++] = 0xc0 | (code >> 6);
      buffer[offset++] = 0x80 | (code & 0x3f);
    } else {
      buffer[offset++] = 0xe0 | (code >> 12);
      buffer[offset++] = 0x80 | ((code >> 6) & 0x3f);
      buffer[offset++] = 0x80 | (code & 0x3f);
    }
  }
  buffer[offset++] = 0x22;
  return offset;
}

function authorizationSshWriteInteger(buffer, offset, value) {
  const digits = authorizationSshIntegerLength(value);
  let cursor = offset + digits - 1;
  let remaining = value;
  do {
    buffer[cursor--] = 0x30 + (remaining % 10);
    remaining = Math.floor(remaining / 10);
  } while (remaining > 0);
  return offset + digits;
}

function measureAuthorizationSshClosure(closure) {
  let length = "{\"schemaVersion\":\"1\",\"type\":\"japan_ci_sshd_source_closure\",\"rootConfig\":".length;
  length += authorizationSshJsonStringLength(closure.rootConfig);
  length += ",\"files\":[".length;
  for (let index = 0; index < closure.files.length; index += 1) {
    const file = closure.files[index];
    if (index > 0) length += 1;
    length += "{\"ordinal\":".length + authorizationSshIntegerLength(file.ordinal);
    length += ",\"path\":".length + authorizationSshJsonStringLength(file.path);
    length += ",\"sha256\":".length + authorizationSshJsonStringLength(file.sha256);
    length += ",\"uid\":".length + authorizationSshIntegerLength(file.uid);
    length += ",\"gid\":".length + authorizationSshIntegerLength(file.gid);
    length += ",\"mode\":".length + authorizationSshIntegerLength(file.mode);
    length += ",\"nlink\":".length + authorizationSshIntegerLength(file.nlink) + 1;
    if (!Number.isSafeInteger(length)) restricted();
  }
  return length + 3;
}

function emitAuthorizationSshClosure(closure, buffer) {
  let offset = authorizationSshWriteAscii(
    buffer,
    0,
    "{\"schemaVersion\":\"1\",\"type\":\"japan_ci_sshd_source_closure\",\"rootConfig\":"
  );
  offset = authorizationSshWriteJsonString(buffer, offset, closure.rootConfig);
  offset = authorizationSshWriteAscii(buffer, offset, ",\"files\":[");
  for (let index = 0; index < closure.files.length; index += 1) {
    const file = closure.files[index];
    if (index > 0) buffer[offset++] = 0x2c;
    offset = authorizationSshWriteAscii(buffer, offset, "{\"ordinal\":");
    offset = authorizationSshWriteInteger(buffer, offset, file.ordinal);
    offset = authorizationSshWriteAscii(buffer, offset, ",\"path\":");
    offset = authorizationSshWriteJsonString(buffer, offset, file.path);
    offset = authorizationSshWriteAscii(buffer, offset, ",\"sha256\":");
    offset = authorizationSshWriteJsonString(buffer, offset, file.sha256);
    offset = authorizationSshWriteAscii(buffer, offset, ",\"uid\":");
    offset = authorizationSshWriteInteger(buffer, offset, file.uid);
    offset = authorizationSshWriteAscii(buffer, offset, ",\"gid\":");
    offset = authorizationSshWriteInteger(buffer, offset, file.gid);
    offset = authorizationSshWriteAscii(buffer, offset, ",\"mode\":");
    offset = authorizationSshWriteInteger(buffer, offset, file.mode);
    offset = authorizationSshWriteAscii(buffer, offset, ",\"nlink\":");
    offset = authorizationSshWriteInteger(buffer, offset, file.nlink);
    buffer[offset++] = 0x7d;
  }
  buffer[offset++] = 0x5d;
  buffer[offset++] = 0x7d;
  buffer[offset++] = 0x0a;
  return offset;
}

function authorizationSshDirectoryArray(graph, values, cleanupCheckpoint, directoryNameCountBefore) {
  if (types.isProxy(values) || !Array.isArray(values)) restricted();
  const length = graph.directoryNameCount - directoryNameCountBefore;
  if (!Number.isSafeInteger(length) || length < 0 || values.length !== length
    || graph.cleanupStack.length !== cleanupCheckpoint + 2 * length
    || Object.getPrototypeOf(values) !== Array.prototype
    || types.isProxy(Object.getPrototypeOf(values))) restricted();
  const lengthDescriptor = Object.getOwnPropertyDescriptor(values, "length");
  if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, "value") || lengthDescriptor.value !== length
    || lengthDescriptor.writable !== true || lengthDescriptor.enumerable !== false
    || lengthDescriptor.configurable !== false || lengthDescriptor.get !== undefined
    || lengthDescriptor.set !== undefined) restricted();
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(values, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.value !== graph.cleanupStack[cleanupCheckpoint + index]
      || !Buffer.isBuffer(descriptor.value) || descriptor.writable !== true || descriptor.enumerable !== true
      || descriptor.configurable !== true || descriptor.get !== undefined || descriptor.set !== undefined) restricted();
  }
  return length;
}

function authorizationSshHeapSort(values) {
  const length = values.length;
  for (let start = Math.floor(length / 2) - 1; start >= 0; start -= 1) {
    let root = start;
    while (root * 2 + 1 < length) {
      let child = root * 2 + 1;
      if (child + 1 < length && Buffer.compare(values[child], values[child + 1]) < 0) child += 1;
      if (Buffer.compare(values[root], values[child]) >= 0) break;
      const swap = values[root];
      values[root] = values[child];
      values[child] = swap;
      root = child;
    }
  }
  for (let end = length - 1; end > 0; end -= 1) {
    const swap = values[0];
    values[0] = values[end];
    values[end] = swap;
    let root = 0;
    while (root * 2 + 1 < end) {
      let child = root * 2 + 1;
      if (child + 1 < end && Buffer.compare(values[child], values[child + 1]) < 0) child += 1;
      if (Buffer.compare(values[root], values[child]) >= 0) break;
      const childSwap = values[root];
      values[root] = values[child];
      values[child] = childSwap;
      root = child;
    }
  }
}

function authorizationSshValidatePhysicalLine(bytes, start, end) {
  let cursor = authorizationSshSkipSeparators(bytes, start, end);
  if (cursor === end || bytes[cursor] === 0x23) return 0;
  const directiveStart = cursor;
  const directiveEnd = authorizationSshTokenEnd(bytes, cursor, end);
  if (directiveEnd - directiveStart > AUTHORIZATION_PARSER_LOCAL_LIMITS.generalTokenBytes
    || directiveEnd === end || (bytes[directiveEnd] !== 0x20 && bytes[directiveEnd] !== 0x09)
    || !((bytes[directiveStart] >= 0x41 && bytes[directiveStart] <= 0x5a)
      || (bytes[directiveStart] >= 0x61 && bytes[directiveStart] <= 0x7a))) restricted();
  for (let index = directiveStart + 1; index < directiveEnd; index += 1) {
    const byte = bytes[index];
    if (!((byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a)
      || (byte >= 0x30 && byte <= 0x39))) restricted();
  }
  let tokenCount = 1;
  cursor = authorizationSshSkipSeparators(bytes, directiveEnd, end);
  if (cursor === end) restricted();
  while (cursor < end) {
    const tokenEnd = authorizationSshTokenEnd(bytes, cursor, end);
    if (tokenEnd === cursor || tokenEnd - cursor > AUTHORIZATION_PARSER_LOCAL_LIMITS.generalTokenBytes) restricted();
    for (let index = cursor; index < tokenEnd; index += 1) {
      const byte = bytes[index];
      if (byte === 0x22 || byte === 0x27 || byte === 0x5c || byte === 0x23
        || byte < 0x20 || byte === 0x7f) restricted();
    }
    tokenCount += 1;
    if (tokenCount > AUTHORIZATION_PARSER_LOCAL_LIMITS.tokensPerPhysicalLine) restricted();
    cursor = authorizationSshSkipSeparators(bytes, tokenEnd, end);
  }
  return tokenCount;
}

function authorizationSshAsciiTokensWithoutEquals(bytes, start, end) {
  for (let index = start; index < end; index += 1) {
    const byte = bytes[index];
    if (byte === 0x20 || byte === 0x09) continue;
    if (byte < 0x21 || byte > 0x7e || byte === 0x3d) restricted();
  }
}

function authorizationSshIncludeFinalStart(bytes, start, end) {
  if (start >= end) restricted();
  const absolute = bytes[start] === 0x2f;
  let componentStart = absolute ? start + 1 : start;
  if (componentStart === end) restricted();
  let finalStart = componentStart;
  let componentWildcard = false;
  let starCount = 0;
  for (let index = componentStart; index <= end; index += 1) {
    if (index === end || bytes[index] === 0x2f) {
      if (index === componentStart
        || (index - componentStart === 1 && bytes[componentStart] === 0x2e)
        || (index - componentStart === 2 && bytes[componentStart] === 0x2e && bytes[componentStart + 1] === 0x2e)
        || (index < end && componentWildcard)) restricted();
      finalStart = componentStart;
      componentStart = index + 1;
      if (index < end) componentWildcard = false;
      continue;
    }
    const byte = bytes[index];
    if (byte < 0x21 || byte > 0x7e || byte === 0x3d || byte === 0x5b || byte === 0x5d
      || byte === 0x5c || byte === 0x7b || byte === 0x7d || byte === 0x7e || byte === 0x25) restricted();
    if (byte === 0x2a) {
      starCount += 1;
      componentWildcard = true;
      if (starCount > 1) restricted();
    } else if (byte === 0x3f) {
      componentWildcard = true;
    }
  }
  if (componentStart !== end + 1 || finalStart >= end) restricted();
  return componentWildcard ? -(finalStart + 1) : finalStart;
}

function authorizationSshIncludeParent(bytes, start, finalStart) {
  if (bytes[start] === 0x2f) {
    return finalStart === start + 1 ? "/" : bytes.toString("ascii", start, finalStart - 1);
  }
  return finalStart === start
    ? AUTHORIZATION_SSH_RELATIVE_BASE
    : `${AUTHORIZATION_SSH_RELATIVE_BASE}/${bytes.toString("ascii", start, finalStart - 1)}`;
}

function authorizationSshChildPath(parent, basename) {
  const path = parent === "/" ? `/${basename}` : `${parent}/${basename}`;
  if (!authorizationPathIsCanonical(path)) restricted();
  return path;
}

function authorizationSshCanonicalArguments(source, start, end, name, argumentCount) {
  let length = argumentCount - 1;
  let cursor = start;
  for (let ordinal = 0; ordinal < argumentCount; ordinal += 1) {
    cursor = authorizationSshSkipSeparators(source, cursor, end);
    const tokenEnd = authorizationSshTokenEnd(source, cursor, end);
    length += tokenEnd - cursor;
    cursor = tokenEnd;
  }
  let output;
  let complete = false;
  try {
    output = Buffer.alloc(length);
    cursor = start;
    let offset = 0;
    for (let ordinal = 0; ordinal < argumentCount; ordinal += 1) {
      cursor = authorizationSshSkipSeparators(source, cursor, end);
      const tokenEnd = authorizationSshTokenEnd(source, cursor, end);
      if (ordinal === 0) {
        source.copy(output, offset, cursor, tokenEnd);
        offset += tokenEnd - cursor;
      } else {
        output[offset++] = 0x20;
        for (let index = cursor; index < tokenEnd; index += 1) output[offset++] = source[index];
      }
      cursor = tokenEnd;
    }
    if (offset !== length) restricted();
    if (authorizationSshNameInList(name, AUTHORIZATION_SSH_BOOLEAN_NAMES)) {
      for (let index = 0; index < output.length; index += 1) {
        if (output[index] >= 0x41 && output[index] <= 0x5a) output[index] += 0x20;
      }
    }
    complete = true;
    return output;
  } finally {
    if (!complete && Buffer.isBuffer(output)) output.fill(0);
  }
}

function deriveAuthorizationSshSyntax(graph, pathOperations, sourceOperations) {
  let active;
  let owner;
  let closure;
  let files;
  let events;
  let activePaths;
  let trustedPathOperations;
  let trustedSourceOperations;
  let currentBranchOrdinal = -1;
  try {
    active = requireAuthorizationSourceGraph(graph);
    active = requireFreshAuthorizationSshGraph(active);
    trustedPathOperations = exactPrivateOperationRecord(pathOperations, AUTHORIZATION_PATH_OPERATION_KEYS);
    trustedSourceOperations = exactPrivateOperationRecord(sourceOperations, AUTHORIZATION_SOURCE_OPERATION_KEYS);

    reserveAuthorizationFixedEnvelope(active);
    owner = Object.create(null);
    owner.closure = undefined;
    owner.closureSha256 = undefined;
    owner.events = undefined;
    owner.activePaths = undefined;
    owner.disposed = false;

    reserveAuthorizationFixedEnvelope(active);
    closure = Object.create(null);
    closure.schemaVersion = "1";
    closure.type = "japan_ci_sshd_source_closure";
    closure.rootConfig = AUTHORIZATION_SSH_ROOT_CONFIG;
    closure.files = undefined;

    reserveAuthorizationFixedEnvelope(active);
    files = new Array();
    reserveAuthorizationFixedEnvelope(active);
    events = new Array();
    reserveAuthorizationFixedEnvelope(active);
    activePaths = new Array(AUTHORIZATION_SSH_ROOT_CONFIG);

    closure.files = files;
    owner.closure = closure;
    owner.events = events;
    owner.activePaths = activePaths;

    function consumeSelected(parent, basenameBytes, basenameStart, basenameEnd, utf8,
      includePatternEventOrdinal, selectionOrdinal, sourceOrdinal, lineNumber) {
      if (currentBranchOrdinal !== -1) restricted();
      reserveAuthorizationSemanticNode(active, "sshSelectedInsertion");
      const basename = basenameBytes.toString(utf8 ? "utf8" : "ascii", basenameStart, basenameEnd);
      const childPath = authorizationSshChildPath(parent, basename);
      authorizationSshEvent(
        events,
        "selectedInsertion",
        sourceOrdinal,
        lineNumber,
        includePatternEventOrdinal,
        selectionOrdinal,
        childPath
      );
      for (let index = 0; index < activePaths.length; index += 1) {
        if (activePaths[index] === childPath) restricted();
      }
      for (let index = 0; index < files.length; index += 1) {
        if (files[index].path === childPath) restricted();
      }
      activePaths.push(childPath);
      try {
        consumeSource(childPath);
      } finally {
        const removed = activePaths.pop();
        if (removed !== childPath) restricted();
      }
    }

    function parseInclude(bytes, sourceFile, lineNumber, argumentStart, lineEnd, physicalScope) {
      if (currentBranchOrdinal !== -1) restricted();
      authorizationSshAsciiTokensWithoutEquals(bytes, argumentStart, lineEnd);
      let operandCount = 0;
      let cursor = argumentStart;
      while (cursor < lineEnd) {
        cursor = authorizationSshSkipSeparators(bytes, cursor, lineEnd);
        if (cursor === lineEnd) break;
        const operandEnd = authorizationSshTokenEnd(bytes, cursor, lineEnd);
        authorizationSshIncludeFinalStart(bytes, cursor, operandEnd);
        operandCount += 1;
        if (operandCount > AUTHORIZATION_PARSER_LOCAL_LIMITS.sshIncludeOperands) restricted();
        cursor = operandEnd;
      }
      for (let index = 0; index < operandCount; index += 1) {
        reserveAuthorizationSemanticNode(active, "sshIncludePattern");
      }
      const physicalEventOrdinal = authorizationSshEvent(
        events,
        "physicalDirective",
        sourceFile.ordinal,
        lineNumber,
        "include",
        physicalScope,
        currentBranchOrdinal
      );
      cursor = argumentStart;
      for (let argumentOrdinal = 0; argumentOrdinal < operandCount; argumentOrdinal += 1) {
        if (currentBranchOrdinal !== -1) restricted();
        cursor = authorizationSshSkipSeparators(bytes, cursor, lineEnd);
        const operandStart = cursor;
        const operandEnd = authorizationSshTokenEnd(bytes, operandStart, lineEnd);
        const encodedFinalStart = authorizationSshIncludeFinalStart(bytes, operandStart, operandEnd);
        const hasWildcard = encodedFinalStart < 0;
        const finalStart = hasWildcard ? -encodedFinalStart - 1 : encodedFinalStart;
        const parent = authorizationSshIncludeParent(bytes, operandStart, finalStart);
        if (!authorizationPathIsCanonical(parent)) restricted();
        const pattern = allocateAuthorizationBuffer(active, operandEnd - finalStart);
        bytes.copy(pattern, 0, finalStart, operandEnd);
        const starIndex = scanAuthorizationWildcardPattern(active, pattern);
        if (!hasWildcard) {
          const includePatternEventOrdinal = authorizationSshEvent(
            events,
            "includePattern",
            sourceFile.ordinal,
            lineNumber,
            physicalEventOrdinal,
            argumentOrdinal,
            starIndex,
            1
          );
          consumeSelected(
            parent,
            bytes,
            finalStart,
            operandEnd,
            false,
            includePatternEventOrdinal,
            0,
            sourceFile.ordinal,
            lineNumber
          );
        } else {
          const cleanupCheckpoint = active.cleanupStack.length;
          const directoryNameCountBefore = active.directoryNameCount;
          consumeTrustedAuthorizationDirectory(
            active,
            parent,
            trustedPathOperations,
            trustedSourceOperations,
            (values) => {
              const nameCount = authorizationSshDirectoryArray(
                active,
                values,
                cleanupCheckpoint,
                directoryNameCountBefore
              );
              authorizationSshHeapSort(values);
              const patternStartsDot = pattern[0] === 0x2e;
              let selectedCount = 0;
              for (let index = 0; index < nameCount; index += 1) {
                const basename = values[index];
                let selected;
                if (basename[0] === 0x2e && !patternStartsDot) {
                  reserveAuthorizationWorkUnit(active, "glob");
                  selected = false;
                } else {
                  selected = matchAuthorizationWildcard(active, "glob", pattern, basename, starIndex);
                }
                if (selected) {
                  if (selectedCount !== index) {
                    const swap = values[selectedCount];
                    values[selectedCount] = values[index];
                    values[index] = swap;
                  }
                  selectedCount += 1;
                }
              }
              if (selectedCount === 0) restricted();
              const includePatternEventOrdinal = authorizationSshEvent(
                events,
                "includePattern",
                sourceFile.ordinal,
                lineNumber,
                physicalEventOrdinal,
                argumentOrdinal,
                starIndex,
                selectedCount
              );
              for (let selectionOrdinal = 0; selectionOrdinal < selectedCount; selectionOrdinal += 1) {
                const basename = values[selectionOrdinal];
                consumeSelected(
                  parent,
                  basename,
                  0,
                  basename.length,
                  true,
                  includePatternEventOrdinal,
                  selectionOrdinal,
                  sourceFile.ordinal,
                  lineNumber
                );
              }
            }
          );
        }
        cursor = operandEnd;
      }
    }

    function parseMatch(bytes, sourceFile, lineNumber, argumentStart, lineEnd, physicalScope) {
      authorizationSshAsciiTokensWithoutEquals(bytes, argumentStart, lineEnd);
      let userPatternCount = -1;
      let groupPatternCount = -1;
      let hostPatternCount = -1;
      let addressPatternCount = -1;
      let localAddressPatternCount = -1;
      let localPortPatternCount = -1;
      let rdomainPatternCount = -1;
      let localNetworkPatternCount = -1;
      let allPatternCount = -1;
      let conditionCount = 0;
      let totalPatternCount = 0;
      let cursor = authorizationSshSkipSeparators(bytes, argumentStart, lineEnd);
      const firstNameEnd = authorizationSshTokenEnd(bytes, cursor, lineEnd);
      const firstName = authorizationSshMatchName(bytes, cursor, firstNameEnd);
      if (firstName === "all") {
        if (authorizationSshSkipSeparators(bytes, firstNameEnd, lineEnd) !== lineEnd) restricted();
        allPatternCount = 0;
        conditionCount = 1;
      } else {
        while (cursor < lineEnd) {
          const nameStart = cursor;
          const nameEnd = authorizationSshTokenEnd(bytes, nameStart, lineEnd);
          const name = authorizationSshMatchName(bytes, nameStart, nameEnd);
          if (name === undefined || name === "all") restricted();
          cursor = authorizationSshSkipSeparators(bytes, nameEnd, lineEnd);
          if (cursor === lineEnd) restricted();
          const patternsStart = cursor;
          const patternsEnd = authorizationSshTokenEnd(bytes, patternsStart, lineEnd);
          let memberStart = patternsStart;
          let patternCount = 0;
          for (let index = patternsStart; index <= patternsEnd; index += 1) {
            if (index !== patternsEnd && bytes[index] !== 0x2c) continue;
            if (index === memberStart) restricted();
            let valueStart = memberStart;
            if (bytes[valueStart] === 0x21) {
              valueStart += 1;
              if (valueStart === index || bytes[valueStart] === 0x21) restricted();
            }
            const valueLength = index - valueStart;
            if (valueLength < 1 || valueLength > AUTHORIZATION_PARSER_LOCAL_LIMITS.sshMatchPatternBytes) restricted();
            for (let valueIndex = valueStart; valueIndex < index; valueIndex += 1) {
              const byte = bytes[valueIndex];
              if (byte < 0x21 || byte > 0x7e || byte === 0x2c || byte === 0x3d
                || byte === 0x5b || byte === 0x5d || byte === 0x5c) restricted();
            }
            patternCount += 1;
            if (patternCount > AUTHORIZATION_PARSER_LOCAL_LIMITS.sshMatchPatternsPerCondition) restricted();
            memberStart = index + 1;
          }
          if (name === "user") {
            if (userPatternCount !== -1) restricted();
            userPatternCount = patternCount;
          } else if (name === "group") {
            if (groupPatternCount !== -1) restricted();
            groupPatternCount = patternCount;
          } else if (name === "host") {
            if (hostPatternCount !== -1) restricted();
            hostPatternCount = patternCount;
          } else if (name === "address") {
            if (addressPatternCount !== -1) restricted();
            addressPatternCount = patternCount;
          } else if (name === "localaddress") {
            if (localAddressPatternCount !== -1) restricted();
            localAddressPatternCount = patternCount;
          } else if (name === "localport") {
            if (localPortPatternCount !== -1) restricted();
            localPortPatternCount = patternCount;
          } else if (name === "rdomain") {
            if (rdomainPatternCount !== -1) restricted();
            rdomainPatternCount = patternCount;
          } else if (name === "localnetwork") {
            if (localNetworkPatternCount !== -1) restricted();
            localNetworkPatternCount = patternCount;
          } else {
            restricted();
          }
          conditionCount += 1;
          totalPatternCount += patternCount;
          cursor = authorizationSshSkipSeparators(bytes, patternsEnd, lineEnd);
        }
      }
      if (conditionCount < 1 || conditionCount > AUTHORIZATION_PARSER_LOCAL_LIMITS.sshMatchConditionsPerBranch) restricted();
      reserveAuthorizationSemanticNode(active, "sshMatchBranch");
      for (let index = 0; index < conditionCount; index += 1) {
        reserveAuthorizationSemanticNode(active, "sshMatchCondition");
      }
      for (let index = 0; index < totalPatternCount; index += 1) {
        reserveAuthorizationSemanticNode(active, "sshMatchPattern");
      }
      const physicalEventOrdinal = authorizationSshEvent(
        events,
        "physicalDirective",
        sourceFile.ordinal,
        lineNumber,
        "match",
        physicalScope,
        currentBranchOrdinal
      );
      const branchOrdinal = currentBranchOrdinal + 1;
      authorizationSshEvent(
        events,
        "matchBranch",
        sourceFile.ordinal,
        lineNumber,
        physicalEventOrdinal,
        branchOrdinal,
        physicalEventOrdinal + 2,
        conditionCount,
        totalPatternCount
      );
      cursor = authorizationSshSkipSeparators(bytes, argumentStart, lineEnd);
      if (allPatternCount === 0) {
        authorizationSshEvent(
          events,
          "matchCondition",
          sourceFile.ordinal,
          lineNumber,
          physicalEventOrdinal,
          branchOrdinal,
          0,
          "all",
          -1,
          0
        );
      } else {
        for (let conditionOrdinal = 0; conditionOrdinal < conditionCount; conditionOrdinal += 1) {
          const nameStart = cursor;
          const nameEnd = authorizationSshTokenEnd(bytes, nameStart, lineEnd);
          const name = authorizationSshMatchName(bytes, nameStart, nameEnd);
          cursor = authorizationSshSkipSeparators(bytes, nameEnd, lineEnd);
          const patternsStart = cursor;
          const patternsEnd = authorizationSshTokenEnd(bytes, patternsStart, lineEnd);
          const expectedPatternCount = name === "user" ? userPatternCount
            : name === "group" ? groupPatternCount
              : name === "host" ? hostPatternCount
                : name === "address" ? addressPatternCount
                  : name === "localaddress" ? localAddressPatternCount
                    : name === "localport" ? localPortPatternCount
                      : name === "rdomain" ? rdomainPatternCount
                        : name === "localnetwork" ? localNetworkPatternCount : -1;
          if (expectedPatternCount < 1) restricted();
          const conditionEventOrdinal = events.length;
          authorizationSshEvent(
            events,
            "matchCondition",
            sourceFile.ordinal,
            lineNumber,
            physicalEventOrdinal,
            branchOrdinal,
            conditionOrdinal,
            name,
            conditionEventOrdinal + 1,
            expectedPatternCount
          );
          const firstPatternEventIndex = events.length;
          let emittedPatternCount = 0;
          let memberStart = patternsStart;
          for (let index = patternsStart; index <= patternsEnd; index += 1) {
            if (index !== patternsEnd && bytes[index] !== 0x2c) continue;
            let valueStart = memberStart;
            let negated = false;
            if (bytes[valueStart] === 0x21) {
              negated = true;
              valueStart += 1;
            }
            let valueBytes;
            let attached = false;
            try {
              valueBytes = Buffer.alloc(index - valueStart);
              bytes.copy(valueBytes, 0, valueStart, index);
              const starIndex = scanAuthorizationWildcardPattern(active, valueBytes);
              if (emittedPatternCount < 0 || emittedPatternCount > 63
                || events.length !== firstPatternEventIndex + emittedPatternCount) restricted();
              for (let previousOffset = 0; previousOffset < emittedPatternCount; previousOffset += 1) {
                const previous = events[firstPatternEventIndex + previousOffset];
                if (!previous || previous.kind !== "matchPattern"
                  || previous.physicalEventOrdinal !== physicalEventOrdinal
                  || previous.branchOrdinal !== branchOrdinal
                  || previous.conditionOrdinal !== conditionOrdinal
                  || previous.patternOrdinal !== previousOffset) restricted();
                if (previous.negated !== negated || previous.valueBytes.length !== valueBytes.length) continue;
                let equal = true;
                for (let byteIndex = 0; byteIndex < valueBytes.length; byteIndex += 1) {
                  const next = nextAuthorizationBudgetValue(
                    active.snapshot.wildcardAlignedComparisonCount,
                    1,
                    AUTHORIZATION_WORK_LIMITS.wildcardAlignedComparisons
                  );
                  active.snapshot.wildcardAlignedComparisonCount = next;
                  if (previous.valueBytes[byteIndex] !== valueBytes[byteIndex]) {
                    equal = false;
                    break;
                  }
                }
                if (equal) restricted();
              }
              authorizationSshEvent(
                events,
                "matchPattern",
                sourceFile.ordinal,
                lineNumber,
                physicalEventOrdinal,
                branchOrdinal,
                conditionOrdinal,
                emittedPatternCount,
                negated,
                valueBytes,
                starIndex
              );
              attached = true;
              emittedPatternCount += 1;
            } finally {
              if (!attached && Buffer.isBuffer(valueBytes)) valueBytes.fill(0);
            }
            memberStart = index + 1;
          }
          if (emittedPatternCount !== expectedPatternCount) restricted();
          cursor = authorizationSshSkipSeparators(bytes, patternsEnd, lineEnd);
        }
      }
      currentBranchOrdinal = branchOrdinal;
    }

    function parseAuthority(bytes, sourceFile, lineNumber, directive, argumentStart, lineEnd,
      argumentCount, physicalScope) {
      authorizationSshAsciiTokensWithoutEquals(bytes, argumentStart, lineEnd);
      if (directive === "acceptenv") {
        if (argumentCount < 1 || argumentCount > 255) restricted();
      } else if (directive === "forcecommand" || directive === "authorizedkeyscommand"
        || directive === "authorizedprincipalscommand" || directive === "authorizedkeysfile") {
        if (argumentCount < 1 || argumentCount > 255) restricted();
      } else if (argumentCount !== 1) {
        restricted();
      }
      const firstStart = authorizationSshSkipSeparators(bytes, argumentStart, lineEnd);
      const firstEnd = authorizationSshTokenEnd(bytes, firstStart, lineEnd);
      if (authorizationSshNameInList(directive, AUTHORIZATION_SSH_BOOLEAN_NAMES)) {
        if (!authorizationSshAsciiEquals(bytes, firstStart, firstEnd, "yes")
          && !authorizationSshAsciiEquals(bytes, firstStart, firstEnd, "no")) restricted();
      } else if (directive === "permittunnel") {
        if (!authorizationSshAsciiExact(bytes, firstStart, firstEnd, "yes")
          && !authorizationSshAsciiExact(bytes, firstStart, firstEnd, "no")
          && !authorizationSshAsciiExact(bytes, firstStart, firstEnd, "point-to-point")
          && !authorizationSshAsciiExact(bytes, firstStart, firstEnd, "ethernet")) restricted();
      }
      reserveAuthorizationSemanticNode(active, "sshAssignment");
      if (directive === "acceptenv") {
        for (let index = 0; index < argumentCount; index += 1) {
          reserveAuthorizationSemanticNode(active, "sshAcceptEnvName");
        }
      }
      const physicalEventOrdinal = authorizationSshEvent(
        events,
        "physicalDirective",
        sourceFile.ordinal,
        lineNumber,
        directive,
        physicalScope,
        currentBranchOrdinal
      );
      if (directive === "acceptenv") {
        const assignmentEventOrdinal = authorizationSshEvent(
          events,
          "assignment",
          sourceFile.ordinal,
          lineNumber,
          physicalEventOrdinal,
          physicalScope,
          currentBranchOrdinal,
          directive,
          argumentCount,
          null
        );
        let cursor = argumentStart;
        for (let nameOrdinal = 0; nameOrdinal < argumentCount; nameOrdinal += 1) {
          cursor = authorizationSshSkipSeparators(bytes, cursor, lineEnd);
          const tokenEnd = authorizationSshTokenEnd(bytes, cursor, lineEnd);
          let valueBytes;
          let attached = false;
          try {
            valueBytes = Buffer.alloc(tokenEnd - cursor);
            bytes.copy(valueBytes, 0, cursor, tokenEnd);
            authorizationSshEvent(
              events,
              "acceptEnvName",
              sourceFile.ordinal,
              lineNumber,
              physicalEventOrdinal,
              physicalScope,
              currentBranchOrdinal,
              assignmentEventOrdinal,
              nameOrdinal,
              valueBytes
            );
            attached = true;
          } finally {
            if (!attached && Buffer.isBuffer(valueBytes)) valueBytes.fill(0);
          }
          cursor = tokenEnd;
        }
      } else {
        let valueBytes;
        let attached = false;
        try {
          valueBytes = authorizationSshCanonicalArguments(
            bytes,
            argumentStart,
            lineEnd,
            directive,
            argumentCount
          );
          authorizationSshEvent(
            events,
            "assignment",
            sourceFile.ordinal,
            lineNumber,
            physicalEventOrdinal,
            physicalScope,
            currentBranchOrdinal,
            directive,
            argumentCount,
            valueBytes
          );
          attached = true;
        } finally {
          if (!attached && Buffer.isBuffer(valueBytes)) valueBytes.fill(0);
        }
      }
    }

    function parsePhysicalLine(bytes, sourceFile, lineNumber, lineStart, lineEnd) {
      const tokenCount = authorizationSshValidatePhysicalLine(bytes, lineStart, lineEnd);
      if (tokenCount === 0) return;
      const directiveStart = authorizationSshSkipSeparators(bytes, lineStart, lineEnd);
      const directiveEnd = authorizationSshTokenEnd(bytes, directiveStart, lineEnd);
      const argumentStart = authorizationSshSkipSeparators(bytes, directiveEnd, lineEnd);
      reserveAuthorizationSemanticNode(active, "sshPhysicalDirective");
      const directive = authorizationSshDirective(bytes, directiveStart, directiveEnd);
      const physicalScope = currentBranchOrdinal === -1 ? "global" : "match";
      if (directive === "unknown") {
        authorizationSshEvent(
          events,
          "physicalDirective",
          sourceFile.ordinal,
          lineNumber,
          "unknown",
          physicalScope,
          currentBranchOrdinal
        );
        restricted();
      }
      if (directive === "include") {
        parseInclude(bytes, sourceFile, lineNumber, argumentStart, lineEnd, physicalScope);
      } else if (directive === "match") {
        parseMatch(bytes, sourceFile, lineNumber, argumentStart, lineEnd, physicalScope);
      } else if (authorizationSshNameInList(directive, AUTHORIZATION_SSH_AUTHORITY_NAMES)) {
        parseAuthority(
          bytes,
          sourceFile,
          lineNumber,
          directive,
          argumentStart,
          lineEnd,
          tokenCount - 1,
          physicalScope
        );
      } else {
        if (currentBranchOrdinal !== -1
          || !authorizationSshNameInList(directive, AUTHORIZATION_SSH_OPAQUE_NAMES)) restricted();
        authorizationSshEvent(
          events,
          "physicalDirective",
          sourceFile.ordinal,
          lineNumber,
          directive,
          physicalScope,
          currentBranchOrdinal
        );
      }
    }

    function parseSource(bytes, sourceFile) {
      files.push(sourceFile);
      authorizationSshValidateSourceBytes(bytes);
      let lineStart = 0;
      let lineNumber = 1;
      for (let index = 0; index <= bytes.length; index += 1) {
        if (index !== bytes.length && bytes[index] !== 0x0a) continue;
        if (index > lineStart) parsePhysicalLine(bytes, sourceFile, lineNumber, lineStart, index);
        if (index === bytes.length) break;
        lineStart = index + 1;
        lineNumber += 1;
      }
    }

    function consumeSource(path) {
      consumeTrustedAuthorizationSource(active, path, trustedPathOperations, (bytes, sourceFile) => {
        parseSource(bytes, sourceFile);
      });
    }

    try {
      consumeSource(AUTHORIZATION_SSH_ROOT_CONFIG);
    } finally {
      const root = activePaths.pop();
      if (root !== AUTHORIZATION_SSH_ROOT_CONFIG) restricted();
    }
    if (activePaths.length !== 0) restricted();
    Object.freeze(closure);
    const preimageLength = measureAuthorizationSshClosure(closure);
    reservePreimageBytes(active.snapshot, preimageLength);
    let preimage;
    let closureSha256;
    try {
      preimage = Buffer.alloc(preimageLength);
      if (emitAuthorizationSshClosure(closure, preimage) !== preimageLength) restricted();
      closureSha256 = createHash("sha256").update(preimage).digest("hex");
    } finally {
      if (Buffer.isBuffer(preimage)) preimage.fill(0);
    }
    if (typeof closureSha256 !== "string" || !LOWER_SHA256.test(closureSha256)) restricted();
    owner.closureSha256 = closureSha256;
    if (owner.disposed !== false || activePaths.length !== 0 || files.length < 1
      || active.failed || active.snapshot.failed || Object.isFrozen(closure) !== true) restricted();
    AUTHORIZATION_SSH_PROVENANCE.set(owner, active);
    return owner;
  } catch {
    cleanupAuthorizationSshSyntax(active, owner, false);
    failAuthorizationSourceGraph(active || graph);
    restricted();
  }
}

function disposeAuthorizationSshSyntax(graph, syntax) {
  let active;
  try {
    if (!graph || !AUTHORIZATION_SOURCE_GRAPH_BRAND.has(graph)
      || !AUTHORIZATION_SOURCE_SNAPSHOT_BRAND.has(graph.snapshot)
      || graph.kind !== "ssh" || graph.snapshot.sshGraph !== graph) restricted();
    active = graph;
    if (AUTHORIZATION_SSH_PROVENANCE.get(syntax) !== active
      || !syntax || syntax.disposed !== false
      || !Array.isArray(syntax.events) || !Array.isArray(syntax.activePaths)
      || !syntax.closure || !Array.isArray(syntax.closure.files)) restricted();
    if (!cleanupAuthorizationSshSyntax(active, syntax, true)) restricted();
  } catch {
    failAuthorizationSourceGraph(active || graph);
    restricted();
  }
}

// C3_SSH_SOURCE_BLOCK_END
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

function recursivelyFreezeAccountCore({
  username,
  uid,
  homeDirectory,
  loginShell,
  passwordLocked,
  primaryGroupId,
  groupIds,
  groupNames
}) {
  return Object.freeze({
    username,
    uid,
    homeDirectory,
    loginShell,
    passwordLocked,
    primaryGroupId,
    groupIds: Object.freeze([...groupIds]),
    groupNames: Object.freeze([...groupNames])
  });
}

function canonicalAccountGroupNames(groupNames) {
  if (!Array.isArray(groupNames) || groupNames.length === 0 || groupNames.length > MAX_ACCOUNT_GROUPS) restricted();
  const values = groupNames.map((name) => {
    if (typeof name !== "string" || !ACCOUNT_GROUP_NAME.test(name)) restricted();
    return name;
  });
  values.sort((left, right) => {
    const length = Math.min(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      const difference = left.charCodeAt(index) - right.charCodeAt(index);
      if (difference !== 0) return difference;
    }
    return left.length - right.length;
  });
  for (let index = 1; index < values.length; index += 1) {
    if (values[index - 1] === values[index]) restricted();
  }
  return values;
}

function canonicalAccountGroupIds(groupIds, primaryGroupId) {
  if (!Array.isArray(groupIds) || groupIds.length === 0 || groupIds.length > MAX_ACCOUNT_GROUPS) restricted();
  if (!groupIds.every(positiveSafeInteger)) restricted();
  const canonical = [...groupIds].sort((left, right) => left - right);
  for (let index = 1; index < canonical.length; index += 1) {
    if (canonical[index - 1] === canonical[index]) restricted();
  }
  if (canonical.filter((groupId) => groupId === primaryGroupId).length !== 1) restricted();
  return canonical;
}

function canonicalAccountCore(input, binding) {
  const value = record(input);
  if (!hasKeys(value, ACCOUNT_CORE_KEYS)
    || value.username !== binding.sshAuthorization.username
    || value.uid !== binding.sshAuthorization.uid
    || value.homeDirectory !== binding.sshAuthorization.homeDirectory
    || value.loginShell !== binding.sshAuthorization.loginShell
    || value.passwordLocked !== true
    || !positiveSafeInteger(value.primaryGroupId)) restricted();
  const groupIds = canonicalAccountGroupIds(value.groupIds, value.primaryGroupId);
  const groupNames = canonicalAccountGroupNames(value.groupNames);
  if (groupIds.length !== groupNames.length) restricted();
  return recursivelyFreezeAccountCore({
    username: value.username,
    uid: value.uid,
    homeDirectory: value.homeDirectory,
    loginShell: value.loginShell,
    passwordLocked: true,
    primaryGroupId: value.primaryGroupId,
    groupIds,
    groupNames
  });
}

function sameAccountCore(left, right) {
  return left.username === right.username
    && left.uid === right.uid
    && left.homeDirectory === right.homeDirectory
    && left.loginShell === right.loginShell
    && left.passwordLocked === right.passwordLocked
    && left.primaryGroupId === right.primaryGroupId
    && left.groupIds.length === right.groupIds.length
    && left.groupNames.length === right.groupNames.length
    && left.groupIds.every((value, index) => value === right.groupIds[index])
    && left.groupNames.every((value, index) => value === right.groupNames[index]);
}

function validateAccountOperations(input) {
  const value = record(input);
  if (!hasKeys(value, ["readAccount"]) || typeof value.readAccount !== "function") restricted();
  return value;
}

export function collectBoundAccountEvidence(binding, input) {
  try {
    if (arguments.length !== 2) restricted();
    const canonicalBinding = buildCanonicalRunnerBinding(binding);
    const projection = record(input);
    if (!hasKeys(projection, ["accountOperations"])) restricted();
    const operations = validateAccountOperations(projection.accountOperations);
    const first = canonicalAccountCore(operations.readAccount(ACCOUNT_USERNAME), canonicalBinding);
    const second = canonicalAccountCore(operations.readAccount(ACCOUNT_USERNAME), canonicalBinding);
    if (!sameAccountCore(first, second)) restricted();
    PROJECTED_ACCOUNT_CORE_BRAND.add(first);
    return first;
  } catch (error) {
    if (error instanceof JapanTuicRepairContractError) throw error;
    restricted();
  }
}

// C4_SSH_POLICY_BLOCK_BEGIN
const AUTHORIZATION_SSH_C4_VALUE_SLOTS = "authenticationMethods pubkeyAuthentication passwordAuthentication keyboardInteractiveAuthentication hostbasedAuthentication gssapiAuthentication kerberosAuthentication permitUserEnvironment forceCommand chrootDirectory disableForwarding permitTunnel authorizedKeysFile authorizedKeysCommand authorizedPrincipalsFile authorizedPrincipalsCommand trustedUserCAKeys";

function authorizationSshC4FixedObject(graph) {
  reserveAuthorizationFixedEnvelope(graph);
  return Object.create(null);
}

function authorizationSshC4FixedArray(graph, length) {
  reserveAuthorizationFixedEnvelope(graph);
  return length === undefined ? new Array() : new Array(length);
}

function authorizationSshC4AsciiText(bytes) {
  if (!Buffer.isBuffer(bytes)) restricted();
  let value = "";
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    if (byte < 0x20 || byte > 0x7e) restricted();
    value += String.fromCharCode(byte);
  }
  return value;
}

function authorizationSshC4WriteAsciiTarget(buffer, value) {
  if (!Buffer.isBuffer(buffer) || typeof value !== "string" || value.length > buffer.length) restricted();
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code > 0x7f) restricted();
    buffer[index] = code;
  }
  return buffer.subarray(0, value.length);
}

function authorizationSshC4PatternListMatches(graph, events, condition, usernameTarget, groupScratch, groupNames) {
  if (!condition || condition.kind !== "matchCondition" || condition.patternCount < 1) restricted();
  let hasNegative = false;
  for (let offset = 0; offset < condition.patternCount; offset += 1) {
    const pattern = events[condition.patternStartEventOrdinal + offset];
    if (!pattern || pattern.kind !== "matchPattern" || pattern.conditionOrdinal !== condition.conditionOrdinal
      || pattern.branchOrdinal !== condition.branchOrdinal || pattern.patternOrdinal !== offset) restricted();
    if (pattern.negated) hasNegative = true;
  }
  let positiveMatched = false;
  const targetCount = condition.name === "user" ? 1 : groupNames.length;
  for (let targetOrdinal = 0; targetOrdinal < targetCount; targetOrdinal += 1) {
    const target = condition.name === "user"
      ? usernameTarget
      : authorizationSshC4WriteAsciiTarget(groupScratch, groupNames[targetOrdinal]);
    for (let offset = 0; offset < condition.patternCount; offset += 1) {
      const pattern = events[condition.patternStartEventOrdinal + offset];
      const matched = matchAuthorizationWildcard(
        graph,
        "sshMatch",
        pattern.valueBytes,
        target,
        pattern.starIndex
      );
      if (matched && pattern.negated) return false;
      if (matched && !pattern.negated) {
        positiveMatched = true;
        if (!hasNegative) return true;
      }
    }
  }
  return positiveMatched;
}

function authorizationSshC4CreateValueTable(graph) {
  const table = authorizationSshC4FixedObject(graph);
  let start = 0;
  while (start < AUTHORIZATION_SSH_C4_VALUE_SLOTS.length) {
    let end = start;
    while (end < AUTHORIZATION_SSH_C4_VALUE_SLOTS.length
      && AUTHORIZATION_SSH_C4_VALUE_SLOTS.charCodeAt(end) !== 0x20) end += 1;
    table[AUTHORIZATION_SSH_C4_VALUE_SLOTS.slice(start, end)] = undefined;
    start = end + 1;
  }
  table.acceptEnv = false;
  return table;
}

function authorizationSshC4AssignmentSlot(name) {
  if (name === "authenticationmethods") return "authenticationMethods";
  if (name === "pubkeyauthentication") return "pubkeyAuthentication";
  if (name === "passwordauthentication") return "passwordAuthentication";
  if (name === "kbdinteractiveauthentication" || name === "challengeresponseauthentication") {
    return "keyboardInteractiveAuthentication";
  }
  if (name === "hostbasedauthentication") return "hostbasedAuthentication";
  if (name === "gssapiauthentication") return "gssapiAuthentication";
  if (name === "kerberosauthentication") return "kerberosAuthentication";
  if (name === "permituserenvironment") return "permitUserEnvironment";
  if (name === "forcecommand") return "forceCommand";
  if (name === "chrootdirectory") return "chrootDirectory";
  if (name === "disableforwarding") return "disableForwarding";
  if (name === "permittunnel") return "permitTunnel";
  if (name === "authorizedkeysfile") return "authorizedKeysFile";
  if (name === "authorizedkeyscommand") return "authorizedKeysCommand";
  if (name === "authorizedprincipalsfile") return "authorizedPrincipalsFile";
  if (name === "authorizedprincipalscommand") return "authorizedPrincipalsCommand";
  if (name === "trustedusercakeys") return "trustedUserCAKeys";
  return undefined;
}

function authorizationSshC4TableAssignment(table, event) {
  if (event.name === "acceptenv") {
    table.acceptEnv = true;
    return;
  }
  const slot = authorizationSshC4AssignmentSlot(event.name);
  if (slot === undefined || table[slot] !== undefined || !Buffer.isBuffer(event.valueBytes)) return;
  table[slot] = authorizationSshC4AsciiText(event.valueBytes);
}

function authorizationSshC4Boolean(value, fallback) {
  const selected = value === undefined ? fallback : value;
  if (selected === "yes" || selected === true) return true;
  if (selected === "no" || selected === false) return false;
  restricted();
}

function authorizationSshC4First(matchTable, globalTable, slot, fallback) {
  if (matchTable[slot] !== undefined) return matchTable[slot];
  if (globalTable[slot] !== undefined) return globalTable[slot];
  return fallback;
}

function authorizationSshC4FreezeCoverage(coverage) {
  for (let branchIndex = 0; branchIndex < coverage.branches.length; branchIndex += 1) {
    const branch = coverage.branches[branchIndex];
    for (let conditionIndex = 0; conditionIndex < branch.conditions.length; conditionIndex += 1) {
      const condition = branch.conditions[conditionIndex];
      for (let patternIndex = 0; patternIndex < condition.patterns.length; patternIndex += 1) {
        Object.freeze(condition.patterns[patternIndex]);
      }
      Object.freeze(condition.patterns);
      Object.freeze(condition);
    }
    Object.freeze(branch.conditions);
    Object.freeze(branch.variableDimensions);
    Object.freeze(branch);
  }
  Object.freeze(coverage.groupIds);
  Object.freeze(coverage.branches);
  return Object.freeze(coverage);
}

function measureAuthorizationSshCoverage(coverage) {
  let length = "{\"schemaVersion\":\"1\",\"type\":\"japan_ci_sshd_match_coverage\",\"username\":".length;
  length += authorizationSshJsonStringLength(coverage.username);
  length += ",\"groupIds\":[".length;
  for (let index = 0; index < coverage.groupIds.length; index += 1) {
    if (index > 0) length += 1;
    length += authorizationSshIntegerLength(coverage.groupIds[index]);
  }
  length += "],\"branches\":[".length;
  for (let branchIndex = 0; branchIndex < coverage.branches.length; branchIndex += 1) {
    const branch = coverage.branches[branchIndex];
    if (branchIndex > 0) length += 1;
    length += "{\"ordinal\":".length + authorizationSshIntegerLength(branch.ordinal);
    length += ",\"sourceOrdinal\":".length + authorizationSshIntegerLength(branch.sourceOrdinal);
    length += ",\"lineNumber\":".length + authorizationSshIntegerLength(branch.lineNumber);
    length += ",\"conditions\":[".length;
    for (let conditionIndex = 0; conditionIndex < branch.conditions.length; conditionIndex += 1) {
      const condition = branch.conditions[conditionIndex];
      if (conditionIndex > 0) length += 1;
      length += "{\"name\":".length + authorizationSshJsonStringLength(condition.name);
      length += ",\"patterns\":[".length;
      for (let patternIndex = 0; patternIndex < condition.patterns.length; patternIndex += 1) {
        const pattern = condition.patterns[patternIndex];
        if (patternIndex > 0) length += 1;
        length += pattern.negated ? "{\"negated\":true,\"value\":".length
          : "{\"negated\":false,\"value\":".length;
        length += authorizationSshJsonStringLength(pattern.value) + 1;
      }
      length += "]}".length;
    }
    length += "],\"accountDisposition\":".length
      + authorizationSshJsonStringLength(branch.accountDisposition);
    length += ",\"variableDimensions\":[".length;
    for (let index = 0; index < branch.variableDimensions.length; index += 1) {
      if (index > 0) length += 1;
      length += authorizationSshJsonStringLength(branch.variableDimensions[index]);
    }
    length += "]}".length;
    if (!Number.isSafeInteger(length)) restricted();
  }
  return length + 3;
}

function emitAuthorizationSshCoverage(coverage, buffer) {
  let offset = authorizationSshWriteAscii(
    buffer,
    0,
    "{\"schemaVersion\":\"1\",\"type\":\"japan_ci_sshd_match_coverage\",\"username\":"
  );
  offset = authorizationSshWriteJsonString(buffer, offset, coverage.username);
  offset = authorizationSshWriteAscii(buffer, offset, ",\"groupIds\":[");
  for (let index = 0; index < coverage.groupIds.length; index += 1) {
    if (index > 0) buffer[offset++] = 0x2c;
    offset = authorizationSshWriteInteger(buffer, offset, coverage.groupIds[index]);
  }
  offset = authorizationSshWriteAscii(buffer, offset, "],\"branches\":[");
  for (let branchIndex = 0; branchIndex < coverage.branches.length; branchIndex += 1) {
    const branch = coverage.branches[branchIndex];
    if (branchIndex > 0) buffer[offset++] = 0x2c;
    offset = authorizationSshWriteAscii(buffer, offset, "{\"ordinal\":");
    offset = authorizationSshWriteInteger(buffer, offset, branch.ordinal);
    offset = authorizationSshWriteAscii(buffer, offset, ",\"sourceOrdinal\":");
    offset = authorizationSshWriteInteger(buffer, offset, branch.sourceOrdinal);
    offset = authorizationSshWriteAscii(buffer, offset, ",\"lineNumber\":");
    offset = authorizationSshWriteInteger(buffer, offset, branch.lineNumber);
    offset = authorizationSshWriteAscii(buffer, offset, ",\"conditions\":[");
    for (let conditionIndex = 0; conditionIndex < branch.conditions.length; conditionIndex += 1) {
      const condition = branch.conditions[conditionIndex];
      if (conditionIndex > 0) buffer[offset++] = 0x2c;
      offset = authorizationSshWriteAscii(buffer, offset, "{\"name\":");
      offset = authorizationSshWriteJsonString(buffer, offset, condition.name);
      offset = authorizationSshWriteAscii(buffer, offset, ",\"patterns\":[");
      for (let patternIndex = 0; patternIndex < condition.patterns.length; patternIndex += 1) {
        const pattern = condition.patterns[patternIndex];
        if (patternIndex > 0) buffer[offset++] = 0x2c;
        offset = authorizationSshWriteAscii(
          buffer,
          offset,
          pattern.negated ? "{\"negated\":true,\"value\":" : "{\"negated\":false,\"value\":"
        );
        offset = authorizationSshWriteJsonString(buffer, offset, pattern.value);
        buffer[offset++] = 0x7d;
      }
      offset = authorizationSshWriteAscii(buffer, offset, "]}");
    }
    offset = authorizationSshWriteAscii(buffer, offset, "],\"accountDisposition\":");
    offset = authorizationSshWriteJsonString(buffer, offset, branch.accountDisposition);
    offset = authorizationSshWriteAscii(buffer, offset, ",\"variableDimensions\":[");
    for (let index = 0; index < branch.variableDimensions.length; index += 1) {
      if (index > 0) buffer[offset++] = 0x2c;
      offset = authorizationSshWriteJsonString(buffer, offset, branch.variableDimensions[index]);
    }
    offset = authorizationSshWriteAscii(buffer, offset, "]}");
  }
  offset = authorizationSshWriteAscii(buffer, offset, "]}\n");
  return offset;
}

function authorizationSshC4CleanupPolicy(graph, policy, deleteOwnerBinding) {
  let cleanupFailed = false;
  if (deleteOwnerBinding) {
    try {
      if (!AUTHORIZATION_SSH_PROVENANCE.delete(policy)) cleanupFailed = true;
    } catch {
      cleanupFailed = true;
    }
  }
  if (policy) {
    try { policy.coverage = undefined; } catch { cleanupFailed = true; }
    try { policy.effective = undefined; } catch { cleanupFailed = true; }
    try { policy.disposed = true; } catch { cleanupFailed = true; }
  }
  if (cleanupFailed) failAuthorizationSourceGraph(graph);
  return !cleanupFailed;
}

function authorizationSshC4ZeroBuffersTo(graph, checkpoint) {
  let cleanupFailed = false;
  if (!graph || !Array.isArray(graph.cleanupStack)
    || !Number.isSafeInteger(checkpoint) || checkpoint < 0 || checkpoint > graph.cleanupStack.length) {
    return false;
  }
  while (graph.cleanupStack.length > checkpoint) {
    let buffer;
    try {
      buffer = graph.cleanupStack.pop();
    } catch {
      cleanupFailed = true;
      break;
    }
    try {
      if (Buffer.isBuffer(buffer)) buffer.fill(0);
    } catch {
      cleanupFailed = true;
    }
  }
  return !cleanupFailed;
}

function deriveAuthorizationSshPolicy(graph, syntax, accountCore) {
  let active;
  let policy;
  let registered = false;
  let preimage;
  let checkpoint = 0;
  try {
    if (!graph || !AUTHORIZATION_SOURCE_GRAPH_BRAND.has(graph)
      || !AUTHORIZATION_SOURCE_SNAPSHOT_BRAND.has(graph.snapshot)
      || graph.kind !== "ssh" || graph.snapshot.sshGraph !== graph
      || graph.failed || graph.snapshot.failed
      || (!PROJECTED_ACCOUNT_CORE_BRAND.has(accountCore) && !NATIVE_ACCOUNT_CORE_BRAND.has(accountCore))) restricted();
    active = graph;
    if (AUTHORIZATION_SSH_PROVENANCE.get(syntax) !== active
      || !syntax || syntax.disposed !== false || syntax.c4PolicyConsumed === true
      || !syntax.closure || !Array.isArray(syntax.closure.files)
      || !Array.isArray(syntax.events) || !Array.isArray(syntax.activePaths)
      || syntax.activePaths.length !== 0) restricted();
    checkpoint = active.cleanupStack.length;
    const usernameTarget = allocateAuthorizationBuffer(active, accountCore.username.length);
    authorizationSshC4WriteAsciiTarget(usernameTarget, accountCore.username);
    const groupScratch = allocateAuthorizationBuffer(active, 64);

    policy = authorizationSshC4FixedObject(active);
    policy.coverage = undefined;
    policy.coverageSha256 = undefined;
    policy.effective = undefined;
    policy.disposed = false;

    const coverage = authorizationSshC4FixedObject(active);
    coverage.schemaVersion = "1";
    coverage.type = "japan_ci_sshd_match_coverage";
    coverage.username = accountCore.username;
    const groupIds = authorizationSshC4FixedArray(active, accountCore.groupIds.length);
    for (let index = 0; index < groupIds.length; index += 1) groupIds[index] = accountCore.groupIds[index];
    coverage.groupIds = groupIds;
    const branches = authorizationSshC4FixedArray(active, active.sshMatchBranchCount);
    coverage.branches = branches;

    let emittedBranches = 0;
    for (let eventIndex = 0; eventIndex < syntax.events.length; eventIndex += 1) {
      const branchEvent = syntax.events[eventIndex];
      if (!branchEvent || branchEvent.kind !== "matchBranch") continue;
      if (branchEvent.branchOrdinal !== emittedBranches || branchEvent.conditionCount < 1) restricted();
      const branch = Object.create(null);
      branch.ordinal = branchEvent.branchOrdinal;
      branch.sourceOrdinal = branchEvent.sourceOrdinal;
      branch.lineNumber = branchEvent.lineNumber;
      const conditions = new Array(branchEvent.conditionCount);
      branch.conditions = conditions;
      let accountMatches = true;
      let hasAccountCondition = false;
      let host = false;
      let address = false;
      let localaddress = false;
      let localport = false;
      let rdomain = false;
      let localnetwork = false;
      let conditionEventIndex = branchEvent.conditionStartEventOrdinal;
      for (let conditionOrdinal = 0; conditionOrdinal < branchEvent.conditionCount; conditionOrdinal += 1) {
        const sourceCondition = syntax.events[conditionEventIndex];
        if (!sourceCondition || sourceCondition.kind !== "matchCondition"
          || sourceCondition.branchOrdinal !== branchEvent.branchOrdinal
          || sourceCondition.conditionOrdinal !== conditionOrdinal) restricted();
        const condition = Object.create(null);
        condition.name = sourceCondition.name;
        const patterns = new Array(sourceCondition.patternCount);
        condition.patterns = patterns;
        for (let patternOrdinal = 0; patternOrdinal < sourceCondition.patternCount; patternOrdinal += 1) {
          const sourcePattern = syntax.events[sourceCondition.patternStartEventOrdinal + patternOrdinal];
          if (!sourcePattern || sourcePattern.kind !== "matchPattern"
            || sourcePattern.branchOrdinal !== branchEvent.branchOrdinal
            || sourcePattern.conditionOrdinal !== conditionOrdinal
            || sourcePattern.patternOrdinal !== patternOrdinal) restricted();
          const pattern = Object.create(null);
          pattern.negated = sourcePattern.negated;
          pattern.value = authorizationSshC4AsciiText(sourcePattern.valueBytes);
          patterns[patternOrdinal] = pattern;
        }
        conditions[conditionOrdinal] = condition;
        if (sourceCondition.name === "all") {
          if (branchEvent.conditionCount !== 1 || sourceCondition.patternCount !== 0) restricted();
          hasAccountCondition = true;
        } else if (sourceCondition.name === "user" || sourceCondition.name === "group") {
          hasAccountCondition = true;
          if (accountMatches && !authorizationSshC4PatternListMatches(
            active,
            syntax.events,
            sourceCondition,
            usernameTarget,
            groupScratch,
            accountCore.groupNames
          )) accountMatches = false;
        } else if (sourceCondition.name === "host") host = true;
        else if (sourceCondition.name === "address") address = true;
        else if (sourceCondition.name === "localaddress") localaddress = true;
        else if (sourceCondition.name === "localport") localport = true;
        else if (sourceCondition.name === "rdomain") rdomain = true;
        else if (sourceCondition.name === "localnetwork") localnetwork = true;
        else restricted();
        conditionEventIndex = sourceCondition.patternCount === 0
          ? sourceCondition.eventOrdinal + 1
          : sourceCondition.patternStartEventOrdinal + sourceCondition.patternCount;
      }
      let dimensionCount = 0;
      if (host) dimensionCount += 1;
      if (address) dimensionCount += 1;
      if (localaddress) dimensionCount += 1;
      if (localport) dimensionCount += 1;
      if (rdomain) dimensionCount += 1;
      if (localnetwork) dimensionCount += 1;
      const variableDimensions = new Array(dimensionCount);
      let dimensionIndex = 0;
      if (host) variableDimensions[dimensionIndex++] = "host";
      if (address) variableDimensions[dimensionIndex++] = "address";
      if (localaddress) variableDimensions[dimensionIndex++] = "localaddress";
      if (localport) variableDimensions[dimensionIndex++] = "localport";
      if (rdomain) variableDimensions[dimensionIndex++] = "rdomain";
      if (localnetwork) variableDimensions[dimensionIndex++] = "localnetwork";
      if (accountMatches && dimensionCount > 0) restricted();
      branch.accountDisposition = accountMatches && hasAccountCondition ? "exact_user" : "disjoint";
      branch.variableDimensions = variableDimensions;
      branches[emittedBranches++] = branch;
    }
    if (emittedBranches !== branches.length) restricted();

    const globalTable = authorizationSshC4CreateValueTable(active);
    const matchTable = authorizationSshC4CreateValueTable(active);
    for (let eventIndex = 0; eventIndex < syntax.events.length; eventIndex += 1) {
      const event = syntax.events[eventIndex];
      if (!event || event.kind !== "assignment") continue;
      if (event.scope === "global") {
        authorizationSshC4TableAssignment(globalTable, event);
      } else if (event.scope === "match") {
        const branch = branches[event.branchOrdinal];
        if (!branch) restricted();
        if (branch.accountDisposition === "exact_user") authorizationSshC4TableAssignment(matchTable, event);
      } else {
        restricted();
      }
    }

    const effective = authorizationSshC4FixedObject(active);
    effective.authenticationMethods = authorizationSshC4First(matchTable, globalTable, "authenticationMethods", "any");
    effective.pubkeyAuthentication = authorizationSshC4Boolean(
      authorizationSshC4First(matchTable, globalTable, "pubkeyAuthentication", true), true
    );
    effective.passwordAuthentication = authorizationSshC4Boolean(
      authorizationSshC4First(matchTable, globalTable, "passwordAuthentication", true), true
    );
    effective.keyboardInteractiveAuthentication = authorizationSshC4Boolean(
      authorizationSshC4First(matchTable, globalTable, "keyboardInteractiveAuthentication", true), true
    );
    effective.hostbasedAuthentication = authorizationSshC4Boolean(
      authorizationSshC4First(matchTable, globalTable, "hostbasedAuthentication", false), false
    );
    effective.gssapiAuthentication = authorizationSshC4Boolean(
      authorizationSshC4First(matchTable, globalTable, "gssapiAuthentication", false), false
    );
    effective.kerberosAuthentication = authorizationSshC4Boolean(
      authorizationSshC4First(matchTable, globalTable, "kerberosAuthentication", false), false
    );
    effective.permitUserEnvironment = authorizationSshC4Boolean(
      authorizationSshC4First(matchTable, globalTable, "permitUserEnvironment", false), false
    );
    effective.acceptEnv = matchTable.acceptEnv || globalTable.acceptEnv;
    effective.forceCommand = authorizationSshC4First(matchTable, globalTable, "forceCommand", "none");
    effective.chrootDirectory = authorizationSshC4First(matchTable, globalTable, "chrootDirectory", "none");
    effective.disableForwarding = authorizationSshC4Boolean(
      authorizationSshC4First(matchTable, globalTable, "disableForwarding", false), false
    );
    effective.permitTunnel = authorizationSshC4First(matchTable, globalTable, "permitTunnel", "no");
    effective.authorizedKeysFile = authorizationSshC4First(matchTable, globalTable, "authorizedKeysFile", undefined);
    effective.authorizedKeysCommand = authorizationSshC4First(matchTable, globalTable, "authorizedKeysCommand", "none");
    effective.authorizedPrincipalsFile = authorizationSshC4First(matchTable, globalTable, "authorizedPrincipalsFile", "none");
    effective.authorizedPrincipalsCommand = authorizationSshC4First(matchTable, globalTable, "authorizedPrincipalsCommand", "none");
    effective.trustedUserCAKeys = authorizationSshC4First(matchTable, globalTable, "trustedUserCAKeys", "none");

    authorizationSshC4FreezeCoverage(coverage);
    const preimageLength = measureAuthorizationSshCoverage(coverage);
    reservePreimageBytes(active.snapshot, preimageLength);
    preimage = Buffer.alloc(preimageLength);
    if (emitAuthorizationSshCoverage(coverage, preimage) !== preimageLength) restricted();
    const coverageSha256 = createHash("sha256").update(preimage).digest("hex");
    if (coverageSha256.length !== 64) restricted();
    for (let index = 0; index < coverageSha256.length; index += 1) {
      const code = coverageSha256.charCodeAt(index);
      if (!((code >= 0x30 && code <= 0x39) || (code >= 0x61 && code <= 0x66))) restricted();
    }
    policy.coverage = coverage;
    policy.coverageSha256 = coverageSha256;
    policy.effective = effective;
    syntax.c4PolicyConsumed = true;
    AUTHORIZATION_SSH_PROVENANCE.set(policy, active);
    registered = true;
    return policy;
  } catch (error) {
    if (registered && policy) {
      try {
        if (AUTHORIZATION_SSH_PROVENANCE.get(policy) === active) AUTHORIZATION_SSH_PROVENANCE.delete(policy);
      } catch {
        // The graph is terminal below; cleanup cannot restore trust.
      }
    }
    authorizationSshC4CleanupPolicy(active, policy, false);
    failAuthorizationSourceGraph(active || graph);
    if (error instanceof JapanTuicRepairContractError) throw error;
    restricted();
  } finally {
    let cleanupFailed = false;
    try {
      if (Buffer.isBuffer(preimage)) preimage.fill(0);
    } catch {
      cleanupFailed = true;
    }
    if (active && !authorizationSshC4ZeroBuffersTo(active, checkpoint)) cleanupFailed = true;
    if (cleanupFailed) {
      if (registered && policy) {
        try {
          if (AUTHORIZATION_SSH_PROVENANCE.get(policy) === active) {
            AUTHORIZATION_SSH_PROVENANCE.delete(policy);
          }
        } catch {
          // The graph is terminal below; cleanup cannot restore trust.
        }
      }
      authorizationSshC4CleanupPolicy(active, policy, false);
      failAuthorizationSourceGraph(active || graph);
      restricted();
    }
  }
}

const AUTHORIZATION_SSH_C4_OPERATION_INPUT_NAMES = "pathOperations sourceOperations";
const AUTHORIZATION_SSH_C4_PATH_OPERATION_NAMES = "lstat open fstat read close";
const AUTHORIZATION_SSH_C4_SOURCE_OPERATION_NAMES = "readDirectory validateSudoers";
const AUTHORIZATION_SSH_C4_BINDING_NAMES = "schemaVersion gateId expectedEuid expectedWorkflowCommit expectedNonceSha256 expectedClaimSha256 codeManifest toolManifest sshAuthorization sudoAuthorization paths pathPolicies units writerFreeze authorizationMarker";
const AUTHORIZATION_SSH_C4_BINDING_SSH_NAMES = "algorithm authorizedKeysFile authorizedKeysLineSha256 effectiveConfigSha256 homeDirectory homeDirectoryPolicy loginShell loginShellPolicy publicKeyBlobSha256 uid username";
const AUTHORIZATION_SSH_C4_BINDING_PATH_NAMES = "authorizedKeys backupDirectory currentMap lockFile materialStore mihomoConfig naturalObservation producerStatus stateDirectory sudoersFile temporaryRoot";
const AUTHORIZATION_SSH_C4_PATH_POLICY_NAMES = "type uid gid mode nlink";
const AUTHORIZATION_SSH_C4_AUTHORIZED_PREFIX = `restrict,no-pty,no-agent-forwarding,no-port-forwarding,no-X11-forwarding,command="/usr/bin/sudo -n -- ${ENTRYPOINT_PATH}" ssh-ed25519 `;

function authorizationSshC4ExactRecord(input, expectedNames, functionsOnly) {
  if (!input || typeof input !== "object" || Array.isArray(input) || types.isProxy(input)) restricted();
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== null && prototype !== Object.prototype) restricted();
  if (Object.getOwnPropertySymbols(input).length !== 0) restricted();
  let expectedCount = 0;
  let start = 0;
  while (start < expectedNames.length) {
    let end = start;
    while (end < expectedNames.length && expectedNames.charCodeAt(end) !== 0x20) end += 1;
    const name = expectedNames.slice(start, end);
    const descriptor = Object.getOwnPropertyDescriptor(input, name);
    if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true
      || descriptor.get !== undefined || descriptor.set !== undefined
      || (functionsOnly && typeof descriptor.value !== "function")) restricted();
    expectedCount += 1;
    start = end + 1;
  }
  if (Object.getOwnPropertyNames(input).length !== expectedCount) restricted();
  return input;
}

function authorizationSshC4OperationInput(input) {
  const value = authorizationSshC4ExactRecord(
    input,
    AUTHORIZATION_SSH_C4_OPERATION_INPUT_NAMES,
    false
  );
  authorizationSshC4ExactRecord(
    value.pathOperations,
    AUTHORIZATION_SSH_C4_PATH_OPERATION_NAMES,
    true
  );
  authorizationSshC4ExactRecord(
    value.sourceOperations,
    AUTHORIZATION_SSH_C4_SOURCE_OPERATION_NAMES,
    true
  );
  return value;
}

function authorizationSshC4BindingShape(input) {
  const value = authorizationSshC4ExactRecord(input, AUTHORIZATION_SSH_C4_BINDING_NAMES, false);
  const ssh = authorizationSshC4ExactRecord(
    value.sshAuthorization,
    AUTHORIZATION_SSH_C4_BINDING_SSH_NAMES,
    false
  );
  const paths = authorizationSshC4ExactRecord(
    value.paths,
    AUTHORIZATION_SSH_C4_BINDING_PATH_NAMES,
    false
  );
  const pathPolicies = authorizationSshC4ExactRecord(
    value.pathPolicies,
    AUTHORIZATION_SSH_C4_BINDING_PATH_NAMES,
    false
  );
  const authorizedPolicy = authorizationSshC4ExactRecord(
    pathPolicies.authorizedKeys,
    AUTHORIZATION_SSH_C4_PATH_POLICY_NAMES,
    false
  );
  if (value.expectedEuid !== 0 || ssh.algorithm !== "ssh-ed25519"
    || ssh.authorizedKeysFile !== AUTHORIZED_KEYS_PATH || paths.authorizedKeys !== AUTHORIZED_KEYS_PATH
    || authorizedPolicy.type !== "file" || authorizedPolicy.uid !== 0 || authorizedPolicy.gid !== 0
    || authorizedPolicy.mode !== 0o600 || authorizedPolicy.nlink !== 1
    || value.authorizationMarker !== value.gateId) restricted();
  return value;
}

function authorizationSshC4AdoptCanonicalBindingShape(canonical, source) {
  Object.setPrototypeOf(canonical, Object.getPrototypeOf(source));
  Object.setPrototypeOf(canonical.sshAuthorization, Object.getPrototypeOf(source.sshAuthorization));
  Object.setPrototypeOf(canonical.paths, Object.getPrototypeOf(source.paths));
  Object.setPrototypeOf(canonical.pathPolicies, Object.getPrototypeOf(source.pathPolicies));
  Object.setPrototypeOf(
    canonical.pathPolicies.authorizedKeys,
    Object.getPrototypeOf(source.pathPolicies.authorizedKeys)
  );
  return canonical;
}

function authorizationSshC4ValidateAncestor(stats) {
  if (!stats || typeof stats !== "object" || types.isProxy(stats)
    || typeof stats.uid !== "bigint" || typeof stats.gid !== "bigint" || typeof stats.mode !== "bigint"
    || typeof stats.isDirectory !== "function" || typeof stats.isSymbolicLink !== "function"
    || stats.uid !== 0n || stats.gid !== 0n || !stats.isDirectory() || stats.isSymbolicLink()
    || (stats.mode & 0o022n) !== 0n) restricted();
}

function authorizationSshC4ValidateFinal(stats) {
  if (!stats || typeof stats !== "object" || types.isProxy(stats)
    || typeof stats.uid !== "bigint" || typeof stats.gid !== "bigint"
    || typeof stats.mode !== "bigint" || typeof stats.nlink !== "bigint"
    || typeof stats.dev !== "bigint" || typeof stats.ino !== "bigint" || typeof stats.size !== "bigint"
    || typeof stats.isDirectory !== "function" || typeof stats.isFile !== "function"
    || typeof stats.isSymbolicLink !== "function" || stats.uid !== 0n || stats.gid !== 0n
    || !stats.isFile() || stats.isDirectory() || stats.isSymbolicLink() || stats.nlink !== 1n
    || (stats.mode & 0o7000n) !== 0n || (stats.mode & 0o777n) !== 0o600n) restricted();
}

function authorizationSshC4SameFinal(left, right) {
  authorizationSshC4ValidateFinal(left);
  authorizationSshC4ValidateFinal(right);
  if (left.uid !== right.uid || left.gid !== right.gid || left.mode !== right.mode
    || left.nlink !== right.nlink || left.dev !== right.dev || left.ino !== right.ino
    || left.size !== right.size) restricted();
}

function authorizationSshC4Base64Value(byte) {
  if (byte >= 0x41 && byte <= 0x5a) return byte - 0x41;
  if (byte >= 0x61 && byte <= 0x7a) return byte - 0x61 + 26;
  if (byte >= 0x30 && byte <= 0x39) return byte - 0x30 + 52;
  if (byte === 0x2b) return 62;
  if (byte === 0x2f) return 63;
  restricted();
}

function authorizationSshC4DigestMatches(digest, expected) {
  if (!Buffer.isBuffer(digest) || digest.length !== 32
    || typeof expected !== "string" || expected.length !== 64) restricted();
  let difference = 0;
  for (let index = 0; index < 32; index += 1) {
    const highCode = expected.charCodeAt(index * 2);
    const lowCode = expected.charCodeAt(index * 2 + 1);
    const high = highCode >= 0x30 && highCode <= 0x39 ? highCode - 0x30
      : highCode >= 0x61 && highCode <= 0x66 ? highCode - 0x61 + 10 : -1;
    const low = lowCode >= 0x30 && lowCode <= 0x39 ? lowCode - 0x30
      : lowCode >= 0x61 && lowCode <= 0x66 ? lowCode - 0x61 + 10 : -1;
    if (high < 0 || low < 0) restricted();
    difference |= digest[index] ^ ((high << 4) | low);
  }
  return difference === 0;
}

function authorizationSshC4ReadAuthorization(fd, size, operations) {
  let source;
  let complete = false;
  try {
    source = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      let count;
      try {
        count = operations.read(fd, source, offset, size - offset, offset);
      } catch (error) {
        if (error && error.code === "EINTR") continue;
        throw error;
      }
      if (!Number.isInteger(count) || count <= 0 || count > size - offset) restricted();
      offset += count;
    }
    complete = true;
    return source;
  } finally {
    if (!complete && Buffer.isBuffer(source)) source.fill(0);
  }
}

function authorizationSshC4ReadEof(fd, size, operations) {
  let scratch;
  let complete = false;
  try {
    scratch = Buffer.alloc(1);
    while (true) {
      try {
        const count = operations.read(fd, scratch, 0, 1, size);
        if (!Number.isInteger(count) || count !== 0) restricted();
        complete = true;
        return scratch;
      } catch (error) {
        if (error && error.code === "EINTR") continue;
        throw error;
      }
    }
  } finally {
    if (!complete && Buffer.isBuffer(scratch)) scratch.fill(0);
  }
}

function authorizationSshC4DecodeLine(source, marker) {
  const lineLength = source.length - 1;
  if (source.length < 2 || source.length > 16385 || source[lineLength] !== 0x0a) restricted();
  for (let index = 0; index < lineLength; index += 1) {
    if (source[index] < 0x20 || source[index] > 0x7e) restricted();
  }
  const expectedLength = AUTHORIZATION_SSH_C4_AUTHORIZED_PREFIX.length + 68 + 1 + marker.length;
  if (lineLength !== expectedLength) restricted();
  for (let index = 0; index < AUTHORIZATION_SSH_C4_AUTHORIZED_PREFIX.length; index += 1) {
    if (source[index] !== AUTHORIZATION_SSH_C4_AUTHORIZED_PREFIX.charCodeAt(index)) restricted();
  }
  const markerStart = AUTHORIZATION_SSH_C4_AUTHORIZED_PREFIX.length + 69;
  if (source[markerStart - 1] !== 0x20) restricted();
  for (let index = 0; index < marker.length; index += 1) {
    const code = marker.charCodeAt(index);
    if (code < 0x21 || code > 0x7e || source[markerStart + index] !== code) restricted();
  }
  let blob;
  let complete = false;
  try {
    blob = Buffer.alloc(51);
    let output = 0;
    const base64Start = AUTHORIZATION_SSH_C4_AUTHORIZED_PREFIX.length;
    for (let index = 0; index < 68; index += 4) {
      const first = authorizationSshC4Base64Value(source[base64Start + index]);
      const second = authorizationSshC4Base64Value(source[base64Start + index + 1]);
      const third = authorizationSshC4Base64Value(source[base64Start + index + 2]);
      const fourth = authorizationSshC4Base64Value(source[base64Start + index + 3]);
      blob[output++] = (first << 2) | (second >> 4);
      blob[output++] = ((second & 15) << 4) | (third >> 2);
      blob[output++] = ((third & 3) << 6) | fourth;
    }
    if (output !== 51 || blob[0] !== 0 || blob[1] !== 0 || blob[2] !== 0 || blob[3] !== 11
      || blob[15] !== 0 || blob[16] !== 0 || blob[17] !== 0 || blob[18] !== 32) restricted();
    const algorithm = "ssh-ed25519";
    for (let index = 0; index < algorithm.length; index += 1) {
      if (blob[index + 4] !== algorithm.charCodeAt(index)) restricted();
    }
    complete = true;
    return blob;
  } finally {
    if (!complete && Buffer.isBuffer(blob)) blob.fill(0);
  }
}

function verifyProjectedSshAuthorization(binding, pathOperations) {
  let operations;
  let fd;
  let opened = false;
  let failure;
  let cleanupFailed = false;
  let source;
  let scratch;
  let blob;
  let lineDigest;
  let blobDigest;
  try {
    if (arguments.length !== 2) restricted();
    authorizationSshC4BindingShape(binding);
    const canonical = buildCanonicalRunnerBinding(binding);
    operations = authorizationSshC4ExactRecord(
      pathOperations,
      AUTHORIZATION_SSH_C4_PATH_OPERATION_NAMES,
      true
    );
    if (canonical.schemaVersion !== "3" || canonical.expectedEuid !== 0
      || canonical.sshAuthorization.algorithm !== "ssh-ed25519"
      || canonical.sshAuthorization.authorizedKeysFile !== AUTHORIZED_KEYS_PATH
      || canonical.paths.authorizedKeys !== AUTHORIZED_KEYS_PATH
      || canonical.authorizationMarker !== canonical.gateId) restricted();
    const policy = canonical.pathPolicies.authorizedKeys;
    if (!policy || policy.type !== "file" || policy.uid !== 0 || policy.gid !== 0
      || policy.mode !== 0o600 || policy.nlink !== 1) restricted();
    authorizationSshC4ValidateAncestor(operations.lstat("/"));
    authorizationSshC4ValidateAncestor(operations.lstat("/etc"));
    authorizationSshC4ValidateAncestor(operations.lstat("/etc/ssh"));
    authorizationSshC4ValidateAncestor(operations.lstat("/etc/ssh/authorized_keys"));
    const finalLstat = operations.lstat(AUTHORIZED_KEYS_PATH);
    authorizationSshC4ValidateFinal(finalLstat);
    fd = operations.open(AUTHORIZED_KEYS_PATH, 0xA0000);
    if (!Number.isInteger(fd) || fd < 0) restricted();
    opened = true;
    const initial = operations.fstat(fd);
    authorizationSshC4SameFinal(finalLstat, initial);
    try {
      try {
        if (initial.size < 2n || initial.size > 16385n) restricted();
        const size = Number(initial.size);
        source = authorizationSshC4ReadAuthorization(fd, size, operations);
        scratch = authorizationSshC4ReadEof(fd, size, operations);
        blob = authorizationSshC4DecodeLine(source, canonical.authorizationMarker);
        lineDigest = createHash("sha256").update(source.subarray(0, source.length - 1)).digest();
        blobDigest = createHash("sha256").update(blob).digest();
        if (!authorizationSshC4DigestMatches(
          lineDigest,
          canonical.sshAuthorization.authorizedKeysLineSha256
        ) || !authorizationSshC4DigestMatches(
          blobDigest,
          canonical.sshAuthorization.publicKeyBlobSha256
        )) restricted();
      } catch (error) {
        failure = error;
      } finally {
        try { if (Buffer.isBuffer(source)) source.fill(0); } catch { cleanupFailed = true; }
        try { if (Buffer.isBuffer(blob)) blob.fill(0); } catch { cleanupFailed = true; }
        try { if (Buffer.isBuffer(lineDigest)) lineDigest.fill(0); } catch { cleanupFailed = true; }
        try { if (Buffer.isBuffer(blobDigest)) blobDigest.fill(0); } catch { cleanupFailed = true; }
        try { if (Buffer.isBuffer(scratch)) scratch.fill(0); } catch { cleanupFailed = true; }
      }
      try {
        const after = operations.fstat(fd);
        authorizationSshC4SameFinal(initial, after);
      } catch (error) {
        if (!failure) failure = error;
      }
    } catch (error) {
      if (!failure) failure = error;
    }
  } catch (error) {
    if (!failure) failure = error;
  } finally {
    if (opened) {
      try {
        operations.close(fd);
      } catch (error) {
        if (!failure) failure = error;
        else cleanupFailed = true;
      }
    }
  }
  if (failure || cleanupFailed) restricted();
}

function authorizationSshC4CloneClosure(graph, closure) {
  if (!closure || closure.schemaVersion !== "1"
    || closure.type !== "japan_ci_sshd_source_closure"
    || closure.rootConfig !== AUTHORIZATION_SSH_ROOT_CONFIG
    || !Array.isArray(closure.files) || closure.files.length < 1) restricted();
  const output = authorizationSshC4FixedObject(graph);
  output.schemaVersion = "1";
  output.type = "japan_ci_sshd_source_closure";
  output.rootConfig = AUTHORIZATION_SSH_ROOT_CONFIG;
  const files = authorizationSshC4FixedArray(graph, closure.files.length);
  for (let index = 0; index < files.length; index += 1) files[index] = closure.files[index];
  output.files = Object.freeze(files);
  return Object.freeze(output);
}

function authorizationSshC4EffectiveIsSafe(effective) {
  return !!effective
    && effective.authenticationMethods === "publickey"
    && effective.pubkeyAuthentication === true
    && effective.passwordAuthentication === false
    && effective.keyboardInteractiveAuthentication === false
    && effective.hostbasedAuthentication === false
    && effective.gssapiAuthentication === false
    && effective.kerberosAuthentication === false
    && effective.permitUserEnvironment === false
    && effective.acceptEnv === false
    && effective.forceCommand === "none"
    && effective.chrootDirectory === "none"
    && effective.disableForwarding === true
    && effective.permitTunnel === "no"
    && effective.authorizedKeysFile === AUTHORIZED_KEYS_PATH
    && effective.authorizedKeysCommand === "none"
    && effective.authorizedPrincipalsFile === "none"
    && effective.authorizedPrincipalsCommand === "none"
    && effective.trustedUserCAKeys === "none";
}

const AUTHORIZATION_SSH_C4_TOPOLOGY_MIDDLE = ",\"passwordLocked\":true,\"authenticationMethods\":[\"publickey\"],\"pubkeyAuthentication\":true,\"passwordAuthentication\":false,\"keyboardInteractiveAuthentication\":false,\"hostbasedAuthentication\":false,\"gssapiAuthentication\":false,\"kerberosAuthentication\":false,\"permitUserEnvironment\":false,\"acceptedEnvironmentNames\":[],\"forceCommand\":\"none\",\"chrootDirectory\":\"none\",\"disableForwarding\":true,\"permitTunnel\":false,\"authorizedKeysFiles\":[";
const AUTHORIZATION_SSH_C4_TOPOLOGY_TAIL = "],\"authorizedKeysCommand\":\"none\",\"authorizedPrincipalsFiles\":[],\"authorizedPrincipalsCommand\":\"none\",\"trustedUserCAKeys\":[],\"activeAuthorizationEntryCount\":";

function measureAuthorizationSshTopology(topology) {
  let length = "{\"schemaVersion\":\"1\",\"type\":\"japan_ci_ssh_authorization_topology\",\"username\":".length;
  length += authorizationSshJsonStringLength(topology.username);
  length += ",\"uid\":".length + authorizationSshIntegerLength(topology.uid);
  length += ",\"homeDirectory\":".length + authorizationSshJsonStringLength(topology.homeDirectory);
  length += ",\"loginShell\":".length + authorizationSshJsonStringLength(topology.loginShell);
  length += AUTHORIZATION_SSH_C4_TOPOLOGY_MIDDLE.length;
  length += authorizationSshJsonStringLength(topology.authorizedKeysFiles[0]);
  length += AUTHORIZATION_SSH_C4_TOPOLOGY_TAIL.length;
  length += authorizationSshIntegerLength(topology.activeAuthorizationEntryCount);
  length += ",\"targetKeyOccurrenceCount\":".length
    + authorizationSshIntegerLength(topology.targetKeyOccurrenceCount);
  length += ",\"addressDependentAuthorizationBranchCount\":".length
    + authorizationSshIntegerLength(topology.addressDependentAuthorizationBranchCount);
  length += ",\"includeClosureSha256\":".length
    + authorizationSshJsonStringLength(topology.includeClosureSha256);
  length += ",\"matchCoverageSha256\":".length
    + authorizationSshJsonStringLength(topology.matchCoverageSha256);
  return length + 2;
}

function emitAuthorizationSshTopology(topology, buffer) {
  let offset = authorizationSshWriteAscii(
    buffer,
    0,
    "{\"schemaVersion\":\"1\",\"type\":\"japan_ci_ssh_authorization_topology\",\"username\":"
  );
  offset = authorizationSshWriteJsonString(buffer, offset, topology.username);
  offset = authorizationSshWriteAscii(buffer, offset, ",\"uid\":");
  offset = authorizationSshWriteInteger(buffer, offset, topology.uid);
  offset = authorizationSshWriteAscii(buffer, offset, ",\"homeDirectory\":");
  offset = authorizationSshWriteJsonString(buffer, offset, topology.homeDirectory);
  offset = authorizationSshWriteAscii(buffer, offset, ",\"loginShell\":");
  offset = authorizationSshWriteJsonString(buffer, offset, topology.loginShell);
  offset = authorizationSshWriteAscii(buffer, offset, AUTHORIZATION_SSH_C4_TOPOLOGY_MIDDLE);
  offset = authorizationSshWriteJsonString(buffer, offset, topology.authorizedKeysFiles[0]);
  offset = authorizationSshWriteAscii(buffer, offset, AUTHORIZATION_SSH_C4_TOPOLOGY_TAIL);
  offset = authorizationSshWriteInteger(buffer, offset, topology.activeAuthorizationEntryCount);
  offset = authorizationSshWriteAscii(buffer, offset, ",\"targetKeyOccurrenceCount\":");
  offset = authorizationSshWriteInteger(buffer, offset, topology.targetKeyOccurrenceCount);
  offset = authorizationSshWriteAscii(buffer, offset, ",\"addressDependentAuthorizationBranchCount\":");
  offset = authorizationSshWriteInteger(buffer, offset, topology.addressDependentAuthorizationBranchCount);
  offset = authorizationSshWriteAscii(buffer, offset, ",\"includeClosureSha256\":");
  offset = authorizationSshWriteJsonString(buffer, offset, topology.includeClosureSha256);
  offset = authorizationSshWriteAscii(buffer, offset, ",\"matchCoverageSha256\":");
  offset = authorizationSshWriteJsonString(buffer, offset, topology.matchCoverageSha256);
  offset = authorizationSshWriteAscii(buffer, offset, "}\n");
  return offset;
}

function authorizationSshC4BuildTopology(graph, accountCore, syntax, policy, binding) {
  let preimage;
  let failure;
  const topology = authorizationSshC4FixedObject(graph);
  topology.schemaVersion = "1";
  topology.type = "japan_ci_ssh_authorization_topology";
  topology.username = accountCore.username;
  topology.uid = accountCore.uid;
  topology.homeDirectory = accountCore.homeDirectory;
  topology.loginShell = accountCore.loginShell;
  topology.passwordLocked = accountCore.passwordLocked;
  const authenticationMethods = authorizationSshC4FixedArray(graph, 1);
  authenticationMethods[0] = "publickey";
  topology.authenticationMethods = Object.freeze(authenticationMethods);
  topology.pubkeyAuthentication = true;
  topology.passwordAuthentication = false;
  topology.keyboardInteractiveAuthentication = false;
  topology.hostbasedAuthentication = false;
  topology.gssapiAuthentication = false;
  topology.kerberosAuthentication = false;
  topology.permitUserEnvironment = false;
  topology.acceptedEnvironmentNames = Object.freeze(authorizationSshC4FixedArray(graph, 0));
  topology.forceCommand = "none";
  topology.chrootDirectory = "none";
  topology.disableForwarding = true;
  topology.permitTunnel = false;
  const authorizedKeysFiles = authorizationSshC4FixedArray(graph, 1);
  authorizedKeysFiles[0] = AUTHORIZED_KEYS_PATH;
  topology.authorizedKeysFiles = Object.freeze(authorizedKeysFiles);
  topology.authorizedKeysCommand = "none";
  topology.authorizedPrincipalsFiles = Object.freeze(authorizationSshC4FixedArray(graph, 0));
  topology.authorizedPrincipalsCommand = "none";
  topology.trustedUserCAKeys = Object.freeze(authorizationSshC4FixedArray(graph, 0));
  topology.activeAuthorizationEntryCount = 1;
  topology.targetKeyOccurrenceCount = 1;
  topology.addressDependentAuthorizationBranchCount = 0;
  topology.includeClosureSha256 = syntax.closureSha256;
  topology.matchCoverageSha256 = policy.coverageSha256;
  Object.freeze(topology);
  try {
    const length = measureAuthorizationSshTopology(topology);
    reservePreimageBytes(graph.snapshot, length);
    preimage = Buffer.alloc(length);
    if (emitAuthorizationSshTopology(topology, preimage) !== length) restricted();
    const digest = createHash("sha256").update(preimage).digest("hex");
    if (digest !== binding.sshAuthorization.effectiveConfigSha256) restricted();
  } catch (error) {
    failure = error;
  } finally {
    try {
      if (Buffer.isBuffer(preimage)) preimage.fill(0);
    } catch (error) {
      if (!failure) failure = error;
    }
  }
  if (failure) {
    if (failure instanceof JapanTuicRepairContractError) throw failure;
    restricted();
  }
  return topology;
}

function disposeAuthorizationSshPolicy(graph, policy) {
  let active;
  let failure;
  let owned = false;
  try {
    if (!graph || !AUTHORIZATION_SOURCE_GRAPH_BRAND.has(graph)
      || !AUTHORIZATION_SOURCE_SNAPSHOT_BRAND.has(graph.snapshot)
      || graph.kind !== "ssh" || graph.snapshot.sshGraph !== graph) restricted();
    active = graph;
    if (AUTHORIZATION_SSH_PROVENANCE.get(policy) !== active
      || !policy || policy.disposed !== false || !policy.coverage || !policy.effective
      || typeof policy.coverageSha256 !== "string") restricted();
    owned = true;
    if (!authorizationSshC4CleanupPolicy(active, policy, true)) restricted();
  } catch (error) {
    failure = error;
    if (owned && policy && policy.disposed === false) authorizationSshC4CleanupPolicy(active, policy, false);
    failAuthorizationSourceGraph(active || graph);
  }
  if (failure) {
    if (failure instanceof JapanTuicRepairContractError) throw failure;
    restricted();
  }
}

function authorizationSshC4CompleteProjection(graph, policy, syntax, primaryFailure) {
  let failure = primaryFailure;
  if (policy) {
    try {
      disposeAuthorizationSshPolicy(graph, policy);
    } catch (error) {
      if (!failure) failure = error;
    }
  }
  if (syntax) {
    try {
      disposeAuthorizationSshSyntax(graph, syntax);
    } catch (error) {
      if (!failure) failure = error;
    }
  }
  if (failure) {
    failAuthorizationSourceGraph(graph);
    if (failure instanceof JapanTuicRepairContractError) throw failure;
    restricted();
  }
}
// C4_SSH_POLICY_BLOCK_END

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

export function buildCanonicalSshIncludeClosure(input) {
  let graph;
  let syntax;
  let result;
  let failure;
  try {
    if (arguments.length !== 1) restricted();
    const operations = authorizationSshC4OperationInput(input);
    const snapshot = createAuthorizationSourceSnapshot();
    graph = createAuthorizationSourceGraph(snapshot, "ssh");
    createAuthorizationSourceGraph(snapshot, "sudo");
    syntax = deriveAuthorizationSshSyntax(
      graph,
      operations.pathOperations,
      operations.sourceOperations
    );
    result = authorizationSshC4CloneClosure(graph, syntax.closure);
  } catch (error) {
    failure = error;
    failAuthorizationSourceGraph(graph);
  }
  authorizationSshC4CompleteProjection(graph, undefined, syntax, failure);
  return result;
}

export function buildCanonicalSudoSourceClosure(input = {}) {
  return buildCanonicalSourceClosure(input, {
    type: "japan_ci_sudo_source_closure",
    rootConfig: "/etc/sudoers"
  });
}

export function buildCanonicalSshMatchCoverage(projectedAccountCore, input) {
  let graph;
  let syntax;
  let policy;
  let result;
  let failure;
  try {
    if (arguments.length !== 2 || !PROJECTED_ACCOUNT_CORE_BRAND.has(projectedAccountCore)) restricted();
    const operations = authorizationSshC4OperationInput(input);
    const snapshot = createAuthorizationSourceSnapshot();
    graph = createAuthorizationSourceGraph(snapshot, "ssh");
    createAuthorizationSourceGraph(snapshot, "sudo");
    syntax = deriveAuthorizationSshSyntax(
      graph,
      operations.pathOperations,
      operations.sourceOperations
    );
    policy = deriveAuthorizationSshPolicy(graph, syntax, projectedAccountCore);
    result = policy.coverage;
  } catch (error) {
    failure = error;
    failAuthorizationSourceGraph(graph);
  }
  authorizationSshC4CompleteProjection(graph, policy, syntax, failure);
  return result;
}

export function buildCanonicalSshTopology(projectedAccountCore, binding, input) {
  let graph;
  let syntax;
  let policy;
  let result;
  let failure;
  try {
    if (arguments.length !== 3 || !PROJECTED_ACCOUNT_CORE_BRAND.has(projectedAccountCore)) restricted();
    const operations = authorizationSshC4OperationInput(input);
    authorizationSshC4BindingShape(binding);
    const canonicalBinding = authorizationSshC4AdoptCanonicalBindingShape(
      buildCanonicalRunnerBinding(binding),
      binding
    );
    if (projectedAccountCore.username !== canonicalBinding.sshAuthorization.username
      || projectedAccountCore.uid !== canonicalBinding.sshAuthorization.uid
      || projectedAccountCore.homeDirectory !== canonicalBinding.sshAuthorization.homeDirectory
      || projectedAccountCore.loginShell !== canonicalBinding.sshAuthorization.loginShell
      || projectedAccountCore.passwordLocked !== true) restricted();
    const snapshot = createAuthorizationSourceSnapshot();
    graph = createAuthorizationSourceGraph(snapshot, "ssh");
    createAuthorizationSourceGraph(snapshot, "sudo");
    syntax = deriveAuthorizationSshSyntax(
      graph,
      operations.pathOperations,
      operations.sourceOperations
    );
    policy = deriveAuthorizationSshPolicy(graph, syntax, projectedAccountCore);
    if (!authorizationSshC4EffectiveIsSafe(policy.effective)) restricted();
    verifyProjectedSshAuthorization(canonicalBinding, operations.pathOperations);
    result = authorizationSshC4BuildTopology(
      graph,
      projectedAccountCore,
      syntax,
      policy,
      canonicalBinding
    );
  } catch (error) {
    failure = error;
    failAuthorizationSourceGraph(graph);
  }
  authorizationSshC4CompleteProjection(graph, policy, syntax, failure);
  return result;
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

function zeroAccountBuffers(buffers) {
  for (let index = buffers.length - 1; index >= 0; index -= 1) {
    buffers[index].fill(0);
  }
}

function accountRecordEnd(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > MAX_HELPER_OUTPUT_BYTES) restricted();
  let end = buffer.length;
  if (buffer[end - 1] === 0x0a) end -= 1;
  if (end === 0) restricted();
  for (let index = 0; index < end; index += 1) {
    if (buffer[index] === 0 || buffer[index] === 0x0a || buffer[index] === 0x0d) restricted();
  }
  return end;
}

function accountDelimitedRanges(buffer, end, delimiter, expectedCount) {
  const ranges = [];
  let start = 0;
  for (let index = 0; index <= end; index += 1) {
    if (index !== end && buffer[index] !== delimiter) continue;
    ranges.push([start, index]);
    start = index + 1;
  }
  if (ranges.length !== expectedCount) restricted();
  return ranges;
}

function accountRangeEqualsAscii(buffer, range, expected) {
  const [start, end] = range;
  if (typeof expected !== "string" || end - start !== expected.length) restricted();
  for (let index = 0; index < expected.length; index += 1) {
    const byte = expected.charCodeAt(index);
    if (byte > 0x7f || buffer[start + index] !== byte) restricted();
  }
}

function accountPositiveDecimal(buffer, range) {
  const [start, end] = range;
  if (start === end || buffer[start] === 0x30) restricted();
  let value = 0;
  for (let index = start; index < end; index += 1) {
    const byte = buffer[index];
    if (byte < 0x30 || byte > 0x39) restricted();
    const digit = byte - 0x30;
    if (value > Math.floor((Number.MAX_SAFE_INTEGER - digit) / 10)) restricted();
    value = (value * 10) + digit;
  }
  if (!positiveSafeInteger(value)) restricted();
  return value;
}

function nativePasswdCore(buffer, binding) {
  const ranges = accountDelimitedRanges(buffer, accountRecordEnd(buffer), 0x3a, 7);
  accountRangeEqualsAscii(buffer, ranges[0], binding.sshAuthorization.username);
  const uid = accountPositiveDecimal(buffer, ranges[2]);
  const primaryGroupId = accountPositiveDecimal(buffer, ranges[3]);
  accountRangeEqualsAscii(buffer, ranges[5], binding.sshAuthorization.homeDirectory);
  accountRangeEqualsAscii(buffer, ranges[6], binding.sshAuthorization.loginShell);
  if (uid !== binding.sshAuthorization.uid) restricted();
  return { uid, primaryGroupId };
}

function nativeShadowLocked(buffer, binding) {
  const ranges = accountDelimitedRanges(buffer, accountRecordEnd(buffer), 0x3a, 9);
  accountRangeEqualsAscii(buffer, ranges[0], binding.sshAuthorization.username);
  const [start, end] = ranges[1];
  if (start === end) restricted();
  return buffer[start] === 0x21 || (end - start === 1 && buffer[start] === 0x2a);
}

function nativeIdTokenRanges(buffer) {
  const end = accountRecordEnd(buffer);
  const ranges = [];
  let start = 0;
  for (let index = 0; index <= end; index += 1) {
    if (index !== end && buffer[index] !== 0x20) continue;
    if (start === index || ranges.length >= MAX_ACCOUNT_GROUPS) restricted();
    ranges.push([start, index]);
    start = index + 1;
  }
  return ranges;
}

function nativeSingleId(buffer) {
  const ranges = nativeIdTokenRanges(buffer);
  if (ranges.length !== 1) restricted();
  return accountPositiveDecimal(buffer, ranges[0]);
}

function nativeGroupIds(buffer, primaryGroupId) {
  const ranges = nativeIdTokenRanges(buffer);
  if (ranges.length === 0) restricted();
  const groupIds = ranges.map((range) => accountPositiveDecimal(buffer, range));
  return canonicalAccountGroupIds(groupIds, primaryGroupId);
}

function nativeGroupNames(buffer) {
  const ranges = nativeIdTokenRanges(buffer);
  if (ranges.length === 0) restricted();
  const names = ranges.map((range) => {
    const [start, end] = range;
    const length = end - start;
    if (length === 0 || length > 64) restricted();
    for (let index = start; index < end; index += 1) {
      const byte = buffer[index];
      const initial = byte === 0x5f || (byte >= 0x61 && byte <= 0x7a)
        || (byte >= 0x30 && byte <= 0x39);
      const continuation = initial || (byte >= 0x30 && byte <= 0x39) || byte === 0x2e || byte === 0x2d;
      if ((index === start && !initial) || (index !== start && !continuation)) restricted();
    }
    return buffer.subarray(start, end).toString("ascii");
  });
  return canonicalAccountGroupNames(names);
}

function revalidateNativeAccountTool(binding, operations, role) {
  let bytes;
  try {
    const entry = binding.toolManifest[role];
    bytes = readBoundManifestFile(entry.path, entry, operations, 268435456);
  } finally {
    if (Buffer.isBuffer(bytes)) bytes.fill(0);
  }
}

function createNativeAccountOperations(binding) {
  const canonicalBinding = buildCanonicalRunnerBinding(binding);
  const pathOperations = nativePathOperations();
  const run = (role, executable, arguments_) => {
    revalidateNativeAccountTool(canonicalBinding, pathOperations, role);
    return spawnSync(executable, arguments_, {
      shell: false,
      cwd: "/",
      env: ACCOUNT_PROCESS_ENV,
      encoding: null,
      timeout: 5000,
      maxBuffer: MAX_HELPER_OUTPUT_BYTES,
      windowsHide: true,
      stdio: ACCOUNT_PROCESS_STDIO
    });
  };
  return Object.freeze({
    readAccount() {
      const buffers = [];
      const capture = (value) => {
        if (Buffer.isBuffer(value)) buffers.push(value);
        return value;
      };
      try {
        const execute = (role, executable, arguments_) => {
          const result = run(role, executable, arguments_);
          if (!result || typeof result !== "object") restricted();
          const stdout = capture(result.stdout);
          const stderr = capture(result.stderr);
          if (result.error !== undefined
            || result.status !== 0
            || result.signal !== null
            || !Buffer.isBuffer(stdout)
            || !Buffer.isBuffer(stderr)
            || stdout.length > MAX_HELPER_OUTPUT_BYTES
            || stderr.length !== 0) restricted();
          return stdout;
        };
        const passwd = execute("getent", "/usr/bin/getent", ["passwd", ACCOUNT_USERNAME]);
        const shadow = execute("getent", "/usr/bin/getent", ["shadow", ACCOUNT_USERNAME]);
        const uid = execute("id", "/usr/bin/id", ["-u", "--", ACCOUNT_USERNAME]);
        const primaryGroup = execute("id", "/usr/bin/id", ["-g", "--", ACCOUNT_USERNAME]);
        const groupIds = execute("id", "/usr/bin/id", ["-G", "--", ACCOUNT_USERNAME]);
        const groupNames = execute("id", "/usr/bin/id", ["-G", "-n", "--", ACCOUNT_USERNAME]);
        const passwdCore = nativePasswdCore(passwd, canonicalBinding);
        const observedUid = nativeSingleId(uid);
        const observedPrimaryGroupId = nativeSingleId(primaryGroup);
        if (!nativeShadowLocked(shadow, canonicalBinding)
          || observedUid !== passwdCore.uid
          || observedPrimaryGroupId !== passwdCore.primaryGroupId) restricted();
        const canonicalGroupIds = nativeGroupIds(groupIds, passwdCore.primaryGroupId);
        const canonicalGroupNames = nativeGroupNames(groupNames);
        if (canonicalGroupIds.length !== canonicalGroupNames.length) restricted();
        const core = recursivelyFreezeAccountCore({
          username: canonicalBinding.sshAuthorization.username,
          uid: passwdCore.uid,
          homeDirectory: canonicalBinding.sshAuthorization.homeDirectory,
          loginShell: canonicalBinding.sshAuthorization.loginShell,
          passwordLocked: true,
          primaryGroupId: passwdCore.primaryGroupId,
          groupIds: canonicalGroupIds,
          groupNames: canonicalGroupNames
        });
        NATIVE_ACCOUNT_CORE_BRAND.add(core);
        return core;
      } catch (error) {
        if (error instanceof JapanTuicRepairContractError) throw error;
        restricted();
      } finally {
        zeroAccountBuffers(buffers);
      }
    }
  });
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
