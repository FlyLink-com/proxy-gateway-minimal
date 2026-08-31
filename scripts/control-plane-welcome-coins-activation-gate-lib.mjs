import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import {
  chmodSync,
  chownSync,
  closeSync,
  constants as fsConstants,
  fchmodSync,
  fsyncSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  readSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { createConnection, createServer } from "node:net";
import { parse as parseDotenv } from "dotenv";
import {
  isWelcomeCoinsSchemaCustodyChildSafeCondition,
  readSystemdUnitState,
  runtimeConditionStartGuardPaths
} from "./control-plane-db-snapshot-gate-lib.mjs";
import { inspectWelcomeCoinsExternalHolders } from "./control-plane-welcome-coins-holder-observer-lib.mjs";

const SCHEMA_VERSION = "1";
const TYPE = "control_plane_welcome_coins_activation_gate";
const CURRENT_LINK_NAME = "current";
const PRODUCTION_DEPLOYMENT_ROOT = "/opt/proxy-gateway-minimal-candidate";
const PRODUCTION_CURRENT_LINK = "/opt/proxy-gateway-minimal-candidate/current";
const SERVICE_UNIT = "proxy-gateway-candidate.service";
const RELEASE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const RUNTIME_CONDITION_START_GUARD_IDENTITY_PATTERN =
  /^runtime-condition-v1:(?:0|[1-9][0-9]*):(?:0|[1-9][0-9]*):(?:0|[1-9][0-9]*):(?:0|[1-9][0-9]*)$/;
const TRANSACTION_EXECUTION_ENVELOPE_TYPE =
  "control_plane_welcome_coins_activation_execution_envelope";
const DEACTIVATION_TRANSACTION_EXECUTION_ENVELOPE_TYPE =
  "control_plane_welcome_coins_deactivation_execution_envelope";
const TRANSACTION_CONSUMPTION_TYPE =
  "control_plane_welcome_coins_activation_consumption";
const DEACTIVATION_TRANSACTION_CONSUMPTION_TYPE =
  "control_plane_welcome_coins_deactivation_consumption";
const TRANSACTION_CONSUMPTION_ROOT =
  "/var/lib/proxy-gateway-minimal/approval-consumption/welcome-coins";
const TRANSACTION_EXECUTION_ENVELOPE_FD = 3;
const TRANSACTION_EXECUTION_ENVELOPE_MAX_BYTES = 16 * 1024;
const WELCOME_COINS_NATIVE_MAGIC_BYTES = 40;
const WELCOME_COINS_NATIVE_SETUP_BYTES = 48;
const WELCOME_COINS_NATIVE_READY_BYTES = 76;
const WELCOME_COINS_NATIVE_FRAME_HEADER_BYTES = 44;
const WELCOME_COINS_NATIVE_FRAME_MAX_BYTES = 8192;
const WELCOME_COINS_NATIVE_SETUP_MAGIC = "welcome_coins_native_setup_v1";
const WELCOME_COINS_NATIVE_READY_MAGIC = "welcome_coins_native_ready_v1";
const WELCOME_COINS_NATIVE_AUTHORIZE_MAGIC = "welcome_coins_native_authorize_v1";
const WELCOME_COINS_NATIVE_ACQUIRED_MAGIC = "welcome_coins_native_acquired_v1";
const WELCOME_COINS_NATIVE_COMMIT_MAGIC = "welcome_coins_native_commit_v1";
const WELCOME_COINS_NATIVE_HELD_MAGIC = "welcome_coins_native_held_v1";
const WELCOME_COINS_NATIVE_HEARTBEAT_MAGIC = "welcome_coins_native_heartbeat_v1";
const WELCOME_COINS_NATIVE_HEARTBEAT_ACK_MAGIC =
  "welcome_coins_native_heartbeat_ack_v1";
const WELCOME_COINS_NATIVE_RELEASE_MAGIC = "welcome_coins_native_release_v1";
const WELCOME_COINS_NATIVE_HEARTBEAT_STAGES = Object.freeze([
  "pre_activation",
  "post_activation",
  "post_verify",
  "post_terminal_guard"
]);
const WELCOME_COINS_NATIVE_NODE_PATH = "/usr/bin/node";
const WELCOME_COINS_NATIVE_LAUNCHER_RELATIVE_PATH =
  "node_modules/.gccgw-native/welcome-coins-custody-launcher";
const WELCOME_COINS_NATIVE_TERMINAL_TIMEOUT_MS = 155_000;
const WELCOME_COINS_NATIVE_LAUNCHER_SAFE_CONDITIONS = new Set([
  "capability_delivery_failed",
  "custody_acquired_invalid",
  "custody_child_timeout",
  "custody_held_invalid",
  "invoker_not_root",
  "native_channel_invalid",
  "native_launcher_invalid",
  "native_setup_invalid",
  "native_spawn_failed",
  "parent_authorization_invalid",
  "post_exec_security_invalid",
  "root_authorization_invalid",
  "root_authorization_unavailable",
  "service_principal_identity_invalid"
]);
const WELCOME_COINS_NATIVE_ARTIFACT_SPECS = Object.freeze([
  Object.freeze({
    path: "scripts/control-plane-welcome-coins-activation-transaction-cli.mjs",
    key: "transactionCliSha256",
    mode: "0644",
    kind: "file"
  }),
  Object.freeze({
    path: "scripts/control-plane-welcome-coins-activation-gate-lib.mjs",
    key: "activationLibrarySha256",
    mode: "0644",
    kind: "file"
  }),
  Object.freeze({
    path: "scripts/control-plane-db-snapshot-gate-lib.mjs",
    key: "snapshotLibrarySha256",
    mode: "0644",
    kind: "file"
  }),
  Object.freeze({
    path: "scripts/control-plane-welcome-coins-holder-observer-lib.mjs",
    key: "holderObserverSha256",
    mode: "0644",
    kind: "file"
  }),
  Object.freeze({
    path: "server/services/platform/portal-registration-welcome-bonus-migrations.mjs",
    key: "welcomeBonusMigrationsSha256",
    mode: "0644",
    kind: "file"
  }),
  Object.freeze({
    path: "server/services/platform/coin-wallet-migrations.mjs",
    key: "coinWalletMigrationsSha256",
    mode: "0644",
    kind: "file"
  }),
  Object.freeze({
    path: "scripts/control-plane-welcome-coins-activation-transaction-custody-cli.mjs",
    key: "custodyCliSha256",
    mode: "0644",
    kind: "file"
  }),
  Object.freeze({
    path: "node_modules/.gccgw-native/welcome-coins-activation-outer-wrapper",
    key: "outerWrapperSha256",
    mode: "0755",
    kind: "static-pie"
  }),
  Object.freeze({
    path: WELCOME_COINS_NATIVE_LAUNCHER_RELATIVE_PATH,
    key: "nativeLauncherSha256",
    mode: "0755",
    kind: "pie"
  }),
  Object.freeze({
    path: "node_modules/.gccgw-native/welcome-coins-post-exec-bootstrap.so",
    key: "postExecBootstrapSha256",
    mode: "0644",
    kind: "shared-object"
  }),
  Object.freeze({
    path: "node_modules/.gccgw-native/welcome-coins-outer-post-exec-bootstrap.so",
    key: "outerPostExecBootstrapSha256",
    mode: "0644",
    kind: "shared-object"
  }),
  Object.freeze({
    path: "node_modules/.gccgw-native/welcome-coins-native-build.json",
    key: "nativeBuildReceiptSha256",
    mode: "0644",
    kind: "json"
  })
]);
const WELCOME_COINS_DEPENDENCY_TREE_MAX_ENTRIES = 10_000;
const WELCOME_COINS_DEPENDENCY_TREE_MAX_BYTES = 128 * 1024 * 1024;
const SYSTEMCTL_PATH = "/usr/bin/systemctl";
const SYSTEMD_COMMAND_ENV = Object.freeze({
  PATH: "/usr/bin:/bin",
  LC_ALL: "C",
  LANG: "C"
});
const HOLDER_OBSERVER_CONDITIONS = new Set([
  "holder_observation_invalid",
  "holder_observation_failed",
  "database_boundary_invalid",
  "database_custody_failed"
]);
const TARGET_KEYS = Object.freeze([
  "USER_PORTAL_REGISTRATION_WELCOME_COINS_ENABLED",
  "USER_PORTAL_REGISTRATION_WELCOME_COINS_CANARY_EMAIL_HASHES"
]);
const BASE_PREREQUISITE_KEYS = Object.freeze([
  "USER_PORTAL_ROUTES_ENABLED",
  "COINS_WALLET_ENABLED",
  "COINS_COMMERCE_ENABLED"
]);
const DEFAULT_OFF_KEYS = Object.freeze([
  "USER_PORTAL_WALLET_FIRST_MODEL_ENABLED",
  "COINS_COMMERCE_DEFERRED_TRANSITION_RUNTIME_ENABLED",
  "USER_PORTAL_WALLET_FIRST_SETUP_DELIVERY_ENABLED",
  "COINS_COMMERCE_ACCOUNT_RESOURCE_AUTHORITY_ENABLED"
]);
const SAFE_CONDITIONS = new Set([
  "invalid_input",
  "invoker_not_root",
  "execution_envelope_required",
  "execution_envelope_invalid",
  "execution_envelope_consumed",
  "execution_envelope_consumption_failed",
  "production_runtime_unavailable",
  "stdin_invalid",
  "current_release_mismatch",
  "env_boundary_invalid",
  "env_identity_mismatch",
  "dotenv_semantics_invalid",
  "base_prerequisites_not_ready",
  "safety_flags_not_default_off",
  "target_key_conflict",
  "service_start_guard_invalid",
  "service_start_guard_changed",
  "service_state_mismatch",
  "service_state_unavailable",
  "database_boundary_invalid",
  "database_custody_failed",
  "holder_observation_invalid",
  "holder_observation_failed",
  "activation_publish_failed",
  "deactivation_publish_failed",
  "attention_required"
]);

class WelcomeCoinsActivationGateError extends Error {
  constructor(condition) {
    super(condition);
    this.condition = condition;
  }
}

class WelcomeCoinsActivationAttentionError extends Error {
  constructor(custodyCondition) {
    super("attention_required");
    if (
      WELCOME_COINS_NATIVE_LAUNCHER_SAFE_CONDITIONS.has(custodyCondition)
      || isWelcomeCoinsSchemaCustodyChildSafeCondition(custodyCondition)
    ) {
      this.custodyCondition = custodyCondition;
    }
  }
}

function fail(condition) {
  throw new WelcomeCoinsActivationGateError(condition);
}

function comparablePath(value) {
  const absolute = resolve(value);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}

function isWithinOrSame(root, target) {
  const child = relative(root, target);
  return child === "" || (!child.startsWith("..") && !isAbsolute(child));
}

function modeString(mode) {
  return (mode & 0o777).toString(8).padStart(4, "0");
}

function environmentFlag(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function equalIdentity(left, right) {
  return left.sha256 === right.sha256
    && left.sizeBytes === right.sizeBytes
    && left.mode === right.mode
    && (process.platform === "win32" || (left.uid === right.uid && left.gid === right.gid));
}

function rootOnlyInvoker() {
  if (process.platform !== "linux") return;
  if (typeof process.getuid !== "function" || process.getuid() !== 0) {
    fail("invoker_not_root");
  }
}

function trustedDirectory(path, { enforceLinuxRoot = false } = {}) {
  let metadata;
  let realPath;
  try {
    metadata = lstatSync(path);
    realPath = realpathSync(path);
  } catch {
    fail("current_release_mismatch");
  }
  if (
    metadata.isSymbolicLink()
    || !metadata.isDirectory()
    || comparablePath(realPath) !== comparablePath(path)
    || (process.platform === "linux" && enforceLinuxRoot && (
      metadata.uid !== 0 || (metadata.mode & 0o022) !== 0
    ))
  ) {
    fail("current_release_mismatch");
  }
}

function trustedAncestorChain(path, options) {
  let cursor = resolve(path);
  while (true) {
    trustedDirectory(cursor, options);
    const parent = dirname(cursor);
    if (comparablePath(parent) === comparablePath(cursor)) return;
    cursor = parent;
  }
}

function currentRelease({
  currentLink,
  deploymentRoot,
  expectedRelease,
  enforceLinuxRoot = false
}) {
  if (
    typeof currentLink !== "string"
    || !isAbsolute(currentLink)
    || basename(currentLink) !== CURRENT_LINK_NAME
    || typeof deploymentRoot !== "string"
    || !isAbsolute(deploymentRoot)
    || typeof expectedRelease !== "string"
    || !RELEASE_PATTERN.test(expectedRelease)
  ) {
    fail("current_release_mismatch");
  }

  const linkPath = resolve(currentLink);
  const rootPath = resolve(deploymentRoot);
  const releasesPath = resolve(rootPath, "releases");
  const expectedReleasePath = resolve(releasesPath, expectedRelease);
  let linkMetadata;
  let releasePath;
  try {
    if (
      comparablePath(linkPath) !== comparablePath(resolve(rootPath, CURRENT_LINK_NAME))
      || dirname(expectedReleasePath) !== releasesPath
    ) {
      fail("current_release_mismatch");
    }
    trustedAncestorChain(rootPath, { enforceLinuxRoot });
    trustedDirectory(releasesPath, { enforceLinuxRoot });
    trustedDirectory(expectedReleasePath, { enforceLinuxRoot });
    linkMetadata = lstatSync(linkPath);
    releasePath = realpathSync(linkPath);
  } catch {
    fail("current_release_mismatch");
  }

  if (
    !linkMetadata.isSymbolicLink()
    || (process.platform === "linux" && enforceLinuxRoot && linkMetadata.uid !== 0)
    || comparablePath(releasePath) !== comparablePath(expectedReleasePath)
  ) {
    fail("current_release_mismatch");
  }

  return Object.freeze({
    currentLink: linkPath,
    releasePath,
    release: expectedRelease
  });
}

function readProtectedEnvironment(context, { enforceLinuxRoot = false } = {}) {
  const path = resolve(context.releasePath, ".env");
  if (!isWithinOrSame(context.releasePath, path) || dirname(path) !== context.releasePath) {
    fail("env_boundary_invalid");
  }

  let parentMetadata;
  let parentRealPath;
  let lexicalMetadata;
  let descriptor;
  try {
    parentMetadata = lstatSync(context.releasePath);
    parentRealPath = realpathSync(context.releasePath);
    lexicalMetadata = lstatSync(path);
    if (
      parentMetadata.isSymbolicLink()
      || !parentMetadata.isDirectory()
      || comparablePath(parentRealPath) !== comparablePath(context.releasePath)
      || lexicalMetadata.isSymbolicLink()
      || !lexicalMetadata.isFile()
    ) {
      fail("env_boundary_invalid");
    }

    const flags = process.platform === "linux"
      ? fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW
      : "r";
    descriptor = openSync(path, flags);
    const openedMetadata = fstatSync(descriptor);
    if (
      !openedMetadata.isFile()
      || openedMetadata.dev !== lexicalMetadata.dev
      || openedMetadata.ino !== lexicalMetadata.ino
    ) {
      fail("env_boundary_invalid");
    }
    const bytes = readFileSync(descriptor);
    const identity = {
      sha256: createHash("sha256").update(bytes).digest("hex"),
      sizeBytes: openedMetadata.size,
      mode: modeString(openedMetadata.mode),
      uid: openedMetadata.uid,
      gid: openedMetadata.gid
    };

    if (process.platform === "linux") {
      const expectedOwner = enforceLinuxRoot ? 0 : process.getuid?.();
      if (
        !Number.isInteger(expectedOwner)
        || parentMetadata.uid !== expectedOwner
        || openedMetadata.uid !== expectedOwner
        || (parentMetadata.mode & 0o022) !== 0
        || (openedMetadata.mode & 0o077) !== 0
        || modeString(openedMetadata.mode) !== "0600"
      ) {
        fail("env_boundary_invalid");
      }
    }

    return {
      path,
      bytes,
      identity,
      rootOwned: process.platform !== "linux" || openedMetadata.uid === 0
    };
  } catch (error) {
    if (error instanceof WelcomeCoinsActivationGateError) throw error;
    fail("env_boundary_invalid");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function parseEnvironment(bytes) {
  try {
    return parseDotenv(bytes);
  } catch {
    fail("dotenv_semantics_invalid");
  }
}

function declaredTargetAssignments(bytes) {
  const assignments = new Map(TARGET_KEYS.map((key) => [key, 0]));
  const lines = bytes.toString("utf8").split(/\n/u);
  for (const line of lines) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/u.exec(line);
    if (match && assignments.has(match[1])) {
      assignments.set(match[1], assignments.get(match[1]) + 1);
    }
  }
  return assignments;
}

function withoutTargetKeys(values) {
  return Object.fromEntries(
    Object.entries(values)
      .filter(([key]) => !TARGET_KEYS.includes(key))
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

function hasSameNonTargetEnvironment(before, after) {
  return JSON.stringify(withoutTargetKeys(before)) === JSON.stringify(withoutTargetKeys(after));
}

function evaluateActivationBoundary(environment) {
  const parsed = parseEnvironment(environment.bytes);
  const targetAssignments = declaredTargetAssignments(environment.bytes);
  const targetsAbsent = TARGET_KEYS.every((key) => (
    targetAssignments.get(key) === 0 && !Object.hasOwn(parsed, key)
  ));
  const basePrerequisitesReady = BASE_PREREQUISITE_KEYS.every((key) => environmentFlag(parsed[key]));
  const safetyFlagsDefaultOff = DEFAULT_OFF_KEYS.every((key) => !environmentFlag(parsed[key]));

  return {
    parsed,
    targetAssignments,
    targetsAbsent,
    basePrerequisitesReady,
    safetyFlagsDefaultOff
  };
}

function assertBaseBoundary(boundary) {
  if (!boundary.basePrerequisitesReady) fail("base_prerequisites_not_ready");
  if (!boundary.safetyFlagsDefaultOff) fail("safety_flags_not_default_off");
}

function activeTargetsMatch(boundary, digest) {
  return TARGET_KEYS.every((key) => boundary.targetAssignments.get(key) === 1)
    && boundary.parsed.USER_PORTAL_REGISTRATION_WELCOME_COINS_ENABLED === "true"
    && boundary.parsed.USER_PORTAL_REGISTRATION_WELCOME_COINS_CANARY_EMAIL_HASHES === digest;
}

function bytesEndWith(bytes, suffix) {
  return bytes.length >= suffix.length
    && bytes.subarray(bytes.length - suffix.length).equals(suffix);
}

function buildActivatedEnvironment(before, digest) {
  const beforeParsed = parseEnvironment(before);
  const prefix = Buffer.from(before);
  const endsWithNewline = prefix.length === 0 || prefix[prefix.length - 1] === 0x0a;
  const lineEnding = prefix.includes(Buffer.from("\r\n", "ascii")) ? "\r\n" : "\n";
  const separator = endsWithNewline ? "" : lineEnding;
  const appended = Buffer.from(
    separator
      + TARGET_KEYS[0] + "=true" + lineEnding
      + TARGET_KEYS[1] + "=" + digest + lineEnding,
    "ascii"
  );
  const after = Buffer.concat([prefix, appended]);
  const afterParsed = parseEnvironment(after);

  if (
    !after.subarray(0, prefix.length).equals(prefix)
    || !hasSameNonTargetEnvironment(beforeParsed, afterParsed)
    || afterParsed.USER_PORTAL_REGISTRATION_WELCOME_COINS_ENABLED !== "true"
    || afterParsed.USER_PORTAL_REGISTRATION_WELCOME_COINS_CANARY_EMAIL_HASHES !== digest
  ) {
    fail("dotenv_semantics_invalid");
  }
  return after;
}

function buildDeactivatedEnvironment(before, expectedDisabledEnvSha256) {
  const beforeParsed = parseEnvironment(before);
  const digest = String(
    beforeParsed.USER_PORTAL_REGISTRATION_WELCOME_COINS_CANARY_EMAIL_HASHES ?? ""
  );
  if (!SHA256_PATTERN.test(digest)) fail("target_key_conflict");

  const lineEnding = before.includes(Buffer.from("\r\n", "ascii")) ? "\r\n" : "\n";
  const suffix = Buffer.from(
    TARGET_KEYS[0] + "=true" + lineEnding
      + TARGET_KEYS[1] + "=" + digest + lineEnding,
    "ascii"
  );
  if (!bytesEndWith(before, suffix)) fail("target_key_conflict");

  const prefix = before.subarray(0, before.length - suffix.length);
  const lineEndingBytes = Buffer.from(lineEnding, "ascii");
  const candidates = [Buffer.from(prefix)];
  if (bytesEndWith(prefix, lineEndingBytes)) {
    candidates.push(Buffer.from(prefix.subarray(0, prefix.length - lineEndingBytes.length)));
  }
  const matches = candidates.filter((candidate, index) => (
    candidates.findIndex((other) => other.equals(candidate)) === index
    && createHash("sha256").update(candidate).digest("hex") === expectedDisabledEnvSha256
  ));
  if (matches.length !== 1) fail("env_identity_mismatch");

  const after = matches[0];
  const afterParsed = parseEnvironment(after);
  const afterAssignments = declaredTargetAssignments(after);
  if (
    TARGET_KEYS.some((key) => afterAssignments.get(key) !== 0 || Object.hasOwn(afterParsed, key))
    || !hasSameNonTargetEnvironment(beforeParsed, afterParsed)
  ) {
    fail("dotenv_semantics_invalid");
  }
  return after;
}

function temporaryPath(path) {
  return resolve(
    dirname(path),
    "." + basename(path) + ".welcome-coins." + process.pid + "." + randomUUID()
  );
}

function fsyncDirectory(path) {
  if (process.platform === "win32") return;
  let descriptor;
  try {
    descriptor = openSync(path, fsConstants.O_RDONLY);
    fsyncSync(descriptor);
  } catch {
    throw new WelcomeCoinsActivationAttentionError();
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function publishProtectedEnvironment({ environment, bytes }) {
  const temporary = temporaryPath(environment.path);
  let published = false;
  try {
    const descriptor = openSync(temporary, "wx", Number.parseInt(environment.identity.mode, 8));
    try {
      writeFileSync(descriptor, bytes);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    if (process.platform !== "win32") {
      chownSync(temporary, environment.identity.uid, environment.identity.gid);
    }
    chmodSync(temporary, Number.parseInt(environment.identity.mode, 8));
    renameSync(temporary, environment.path);
    published = true;
    fsyncDirectory(dirname(environment.path));
  } catch (error) {
    if (!published) {
      try {
        unlinkSync(temporary);
      } catch {}
      if (error instanceof WelcomeCoinsActivationGateError) throw error;
      fail("activation_publish_failed");
    }
    if (error instanceof WelcomeCoinsActivationAttentionError) throw error;
    throw new WelcomeCoinsActivationAttentionError();
  }
}

function assertInactiveStartGuard({
  guardReader = readSystemdUnitState,
  expectedIdentity = null
} = {}) {
  let reported;
  try {
    reported = guardReader({ serviceUnit: SERVICE_UNIT });
  } catch {
    fail("service_start_guard_invalid");
  }
  if (
    !reported
    || reported.activeState !== "inactive"
    || reported.loadState !== "loaded"
    || reported.needDaemonReload !== "no"
    || reported.runtimeConditionStartGuard !== true
    || typeof reported.runtimeConditionStartGuardIdentity !== "string"
    || reported.runtimeConditionStartGuardIdentity.length === 0
  ) {
    fail("service_start_guard_invalid");
  }
  if (
    expectedIdentity !== null
    && reported.runtimeConditionStartGuardIdentity !== expectedIdentity
  ) {
    fail("service_start_guard_changed");
  }
  return reported.runtimeConditionStartGuardIdentity;
}

function environmentReport(environment) {
  return {
    sha256: environment.identity.sha256,
    sizeBytes: environment.identity.sizeBytes,
    mode: environment.identity.mode,
    rootOwned: environment.rootOwned === true
  };
}

function safeReport({
  mode,
  state,
  release,
  environment,
  applied,
  canaryDigestAccepted,
  startGuarded = false
}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    type: TYPE,
    mode,
    state,
    applied,
    release,
    currentPointerMatchesExpected: true,
    environment: environmentReport(environment),
    targetKeys: TARGET_KEYS,
    basePrerequisitesReady: true,
    safetyFlagsDefaultOff: true,
    canaryDigestAccepted: canaryDigestAccepted === true,
    ...(startGuarded ? { serviceState: "inactive", startGuarded: true } : {})
  };
}

function inspect({
  currentLink,
  deploymentRoot,
  expectedRelease,
  enforceLinuxRoot = false
} = {}) {
  const context = currentRelease({
    currentLink,
    deploymentRoot,
    expectedRelease,
    enforceLinuxRoot
  });
  const environment = readProtectedEnvironment(context, { enforceLinuxRoot });
  const boundary = evaluateActivationBoundary(environment);
  assertBaseBoundary(boundary);
  return { context, environment, boundary };
}

function preflightWelcomeCoinsActivation(options = {}) {
  const inspected = inspect(options);
  if (!inspected.boundary.targetsAbsent) fail("target_key_conflict");
  return safeReport({
    mode: "preflight",
    state: "ready",
    release: inspected.context.release,
    environment: inspected.environment,
    applied: false,
    canaryDigestAccepted: false
  });
}

function preflightWelcomeCoinsDeactivation({
  currentLink,
  deploymentRoot,
  expectedRelease,
  expectedActiveEnvSha256,
  expectedDisabledEnvSha256,
  enforceLinuxRoot = false
} = {}) {
  if (
    !SHA256_PATTERN.test(expectedActiveEnvSha256 ?? "")
    || !SHA256_PATTERN.test(expectedDisabledEnvSha256 ?? "")
  ) {
    fail("invalid_input");
  }
  const inspected = inspect({
    currentLink,
    deploymentRoot,
    expectedRelease,
    enforceLinuxRoot
  });
  const currentSha256 = inspected.environment.identity.sha256;
  if (inspected.boundary.targetsAbsent) {
    if (
      currentSha256 !== expectedDisabledEnvSha256
      || expectedActiveEnvSha256 !== expectedDisabledEnvSha256
    ) {
      fail("env_identity_mismatch");
    }
    return Object.freeze({
      state: "already_disabled",
      environmentSha256: currentSha256,
      disabledEnvironmentSha256: expectedDisabledEnvSha256
    });
  }
  if (currentSha256 !== expectedActiveEnvSha256) fail("env_identity_mismatch");
  const digest = String(
    inspected.boundary.parsed.USER_PORTAL_REGISTRATION_WELCOME_COINS_CANARY_EMAIL_HASHES ?? ""
  );
  if (!SHA256_PATTERN.test(digest) || !activeTargetsMatch(inspected.boundary, digest)) {
    fail("target_key_conflict");
  }
  const disabledBytes = buildDeactivatedEnvironment(
    inspected.environment.bytes,
    expectedDisabledEnvSha256
  );
  try {
    return Object.freeze({
      state: "deactivation_ready",
      environmentSha256: currentSha256,
      disabledEnvironmentSha256: expectedDisabledEnvSha256
    });
  } finally {
    disabledBytes.fill(0);
  }
}

function activateWelcomeCoins({
  currentLink,
  deploymentRoot,
  expectedRelease,
  expectedEnvSha256,
  canaryDigest,
  apply = false,
  enforceLinuxRoot = false,
  guardReader
} = {}) {
  if (!apply || typeof canaryDigest !== "string" || !SHA256_PATTERN.test(canaryDigest)) {
    fail("invalid_input");
  }
  if (typeof expectedEnvSha256 !== "string" || !SHA256_PATTERN.test(expectedEnvSha256)) {
    fail("invalid_input");
  }

  const inspected = inspect({ currentLink, deploymentRoot, expectedRelease, enforceLinuxRoot });
  if (inspected.environment.identity.sha256 !== expectedEnvSha256) fail("env_identity_mismatch");
  const guardIdentity = assertInactiveStartGuard({ guardReader });
  if (activeTargetsMatch(inspected.boundary, canaryDigest)) {
    return safeReport({
      mode: "activate",
      state: "already_active",
      release: inspected.context.release,
      environment: inspected.environment,
      applied: false,
      canaryDigestAccepted: true,
      startGuarded: true
    });
  }
  if (!inspected.boundary.targetsAbsent) fail("target_key_conflict");

  const replacement = buildActivatedEnvironment(inspected.environment.bytes, canaryDigest);
  const beforeIdentity = inspected.environment.identity;
  let published = false;
  try {
    const currentBeforePublish = currentRelease({
      currentLink,
      deploymentRoot,
      expectedRelease,
      enforceLinuxRoot
    });
    if (comparablePath(currentBeforePublish.releasePath) !== comparablePath(inspected.context.releasePath)) {
      fail("current_release_mismatch");
    }
    const environmentBeforePublish = readProtectedEnvironment(currentBeforePublish, { enforceLinuxRoot });
    if (!equalIdentity(beforeIdentity, environmentBeforePublish.identity)) {
      fail("env_identity_mismatch");
    }
    assertInactiveStartGuard({ guardReader, expectedIdentity: guardIdentity });
    publishProtectedEnvironment({ environment: environmentBeforePublish, bytes: replacement });
    published = true;

    const currentAfterPublish = currentRelease({
      currentLink,
      deploymentRoot,
      expectedRelease,
      enforceLinuxRoot
    });
    if (comparablePath(currentAfterPublish.releasePath) !== comparablePath(inspected.context.releasePath)) {
      throw new WelcomeCoinsActivationAttentionError();
    }
    const activatedEnvironment = readProtectedEnvironment(currentAfterPublish, { enforceLinuxRoot });
    const activatedBoundary = evaluateActivationBoundary(activatedEnvironment);
    assertBaseBoundary(activatedBoundary);
    if (!activeTargetsMatch(activatedBoundary, canaryDigest)) {
      throw new WelcomeCoinsActivationAttentionError();
    }
    assertInactiveStartGuard({ guardReader, expectedIdentity: guardIdentity });
    return safeReport({
      mode: "activate",
      state: "activated",
      release: currentAfterPublish.release,
      environment: activatedEnvironment,
      applied: true,
      canaryDigestAccepted: true,
      startGuarded: true
    });
  } catch (error) {
    if (published && !(error instanceof WelcomeCoinsActivationAttentionError)) {
      throw new WelcomeCoinsActivationAttentionError();
    }
    throw error;
  } finally {
    replacement.fill(0);
  }
}

function verifyWelcomeCoinsActivation({
  currentLink,
  deploymentRoot,
  expectedRelease,
  expectedEnvSha256,
  enforceLinuxRoot = false,
  guardReader
} = {}) {
  if (typeof expectedEnvSha256 !== "string" || !SHA256_PATTERN.test(expectedEnvSha256)) {
    fail("invalid_input");
  }
  const inspected = inspect({ currentLink, deploymentRoot, expectedRelease, enforceLinuxRoot });
  const digest = String(
    inspected.boundary.parsed.USER_PORTAL_REGISTRATION_WELCOME_COINS_CANARY_EMAIL_HASHES ?? ""
  );
  if (!SHA256_PATTERN.test(digest) || !activeTargetsMatch(inspected.boundary, digest)) {
    fail("target_key_conflict");
  }
  if (inspected.environment.identity.sha256 !== expectedEnvSha256) fail("env_identity_mismatch");
  assertInactiveStartGuard({ guardReader });
  return safeReport({
    mode: "verify",
    state: "verified",
    release: inspected.context.release,
    environment: inspected.environment,
    applied: false,
    canaryDigestAccepted: true,
    startGuarded: true
  });
}

function deactivateWelcomeCoins({
  currentLink,
  deploymentRoot,
  expectedRelease,
  expectedEnvSha256,
  expectedDisabledEnvSha256,
  apply = false,
  enforceLinuxRoot = false,
  guardReader
} = {}) {
  if (
    !apply
    || typeof expectedEnvSha256 !== "string"
    || !SHA256_PATTERN.test(expectedEnvSha256)
    || typeof expectedDisabledEnvSha256 !== "string"
    || !SHA256_PATTERN.test(expectedDisabledEnvSha256)
  ) {
    fail("invalid_input");
  }

  const inspected = inspect({ currentLink, deploymentRoot, expectedRelease, enforceLinuxRoot });
  if (inspected.environment.identity.sha256 !== expectedEnvSha256) fail("env_identity_mismatch");
  const guardIdentity = assertInactiveStartGuard({ guardReader });
  if (inspected.boundary.targetsAbsent) {
    if (inspected.environment.identity.sha256 !== expectedDisabledEnvSha256) {
      fail("env_identity_mismatch");
    }
    return safeReport({
      mode: "deactivate",
      state: "already_disabled",
      release: inspected.context.release,
      environment: inspected.environment,
      applied: false,
      canaryDigestAccepted: false,
      startGuarded: true
    });
  }

  const digest = String(
    inspected.boundary.parsed.USER_PORTAL_REGISTRATION_WELCOME_COINS_CANARY_EMAIL_HASHES ?? ""
  );
  if (!SHA256_PATTERN.test(digest) || !activeTargetsMatch(inspected.boundary, digest)) {
    fail("target_key_conflict");
  }
  const replacement = buildDeactivatedEnvironment(
    inspected.environment.bytes,
    expectedDisabledEnvSha256
  );
  const beforeIdentity = inspected.environment.identity;
  let published = false;
  try {
    const currentBeforePublish = currentRelease({
      currentLink,
      deploymentRoot,
      expectedRelease,
      enforceLinuxRoot
    });
    if (comparablePath(currentBeforePublish.releasePath) !== comparablePath(inspected.context.releasePath)) {
      fail("current_release_mismatch");
    }
    const environmentBeforePublish = readProtectedEnvironment(currentBeforePublish, { enforceLinuxRoot });
    if (!equalIdentity(beforeIdentity, environmentBeforePublish.identity)) {
      fail("env_identity_mismatch");
    }
    assertInactiveStartGuard({ guardReader, expectedIdentity: guardIdentity });
    publishProtectedEnvironment({ environment: environmentBeforePublish, bytes: replacement });
    published = true;

    const currentAfterPublish = currentRelease({
      currentLink,
      deploymentRoot,
      expectedRelease,
      enforceLinuxRoot
    });
    if (comparablePath(currentAfterPublish.releasePath) !== comparablePath(inspected.context.releasePath)) {
      throw new WelcomeCoinsActivationAttentionError();
    }
    const disabledEnvironment = readProtectedEnvironment(currentAfterPublish, { enforceLinuxRoot });
    const disabledBoundary = evaluateActivationBoundary(disabledEnvironment);
    assertBaseBoundary(disabledBoundary);
    if (
      !disabledBoundary.targetsAbsent
      || disabledEnvironment.identity.sha256 !== expectedDisabledEnvSha256
    ) {
      throw new WelcomeCoinsActivationAttentionError();
    }
    assertInactiveStartGuard({ guardReader, expectedIdentity: guardIdentity });
    return safeReport({
      mode: "deactivate",
      state: "deactivated",
      release: currentAfterPublish.release,
      environment: disabledEnvironment,
      applied: true,
      canaryDigestAccepted: false,
      startGuarded: true
    });
  } catch (error) {
    if (published && !(error instanceof WelcomeCoinsActivationAttentionError)) {
      throw new WelcomeCoinsActivationAttentionError();
    }
    if (
      !published
      && error instanceof WelcomeCoinsActivationGateError
      && error.condition === "activation_publish_failed"
    ) {
      fail("deactivation_publish_failed");
    }
    throw error;
  } finally {
    replacement.fill(0);
  }
}

function verifyWelcomeCoinsDeactivation({
  currentLink,
  deploymentRoot,
  expectedRelease,
  expectedEnvSha256,
  enforceLinuxRoot = false,
  guardReader
} = {}) {
  if (typeof expectedEnvSha256 !== "string" || !SHA256_PATTERN.test(expectedEnvSha256)) {
    fail("invalid_input");
  }
  const inspected = inspect({ currentLink, deploymentRoot, expectedRelease, enforceLinuxRoot });
  if (!inspected.boundary.targetsAbsent) fail("target_key_conflict");
  if (inspected.environment.identity.sha256 !== expectedEnvSha256) fail("env_identity_mismatch");
  assertInactiveStartGuard({ guardReader });
  return safeReport({
    mode: "verify-disabled",
    state: "disabled_verified",
    release: inspected.context.release,
    environment: inspected.environment,
    applied: false,
    canaryDigestAccepted: false,
    startGuarded: true
  });
}

const TRANSACTION_TYPE = "control_plane_welcome_coins_activation_transaction";
const TRANSACTION_SCOPE = "welcome-coins-activation-transaction";
const DEACTIVATION_TRANSACTION_TYPE = "control_plane_welcome_coins_deactivation_transaction";
const DEACTIVATION_TRANSACTION_SCOPE = "welcome-coins-deactivation-transaction";

function exactObjectKeys(value, expectedKeys) {
  return value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).sort().join("\0") === [...expectedKeys].sort().join("\0");
}

function exactOrderedObjectKeys(value, expectedKeys) {
  return value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).join("\0") === expectedKeys.join("\0");
}

function exactLinuxAbsolutePath(value) {
  if (
    typeof value !== "string"
    || value.length < 2
    || !value.startsWith("/")
    || value.endsWith("/")
    || value.includes("\0")
  ) {
    return null;
  }
  const segments = value.slice(1).split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    return null;
  }
  return value;
}

function joinExactLinuxPath(root, relativePath) {
  if (exactLinuxAbsolutePath(root) === null || typeof relativePath !== "string") {
    return null;
  }
  const combined = `${root}/${relativePath}`;
  return exactLinuxAbsolutePath(combined);
}

function exactWelcomeCoinsActivationExecutionEnvelope(
  value,
  { canaryDigest, nowMs = Date.now() } = {}
) {
  const topLevelKeys = [
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
  ];
  const artifactKeys = [
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
  ];
  const custodyKeys = ["dbPath", "snapshotDirectory", "tempRoot"];
  const expiry = typeof value?.expiresAt === "string" ? new Date(value.expiresAt) : null;
  const expectedCanaryCommitment = typeof canaryDigest === "string"
    && SHA256_PATTERN.test(canaryDigest)
    ? createHash("sha256").update(canaryDigest, "ascii").digest("hex")
    : null;
  if (
    !exactOrderedObjectKeys(value, topLevelKeys)
    || value.schemaVersion !== SCHEMA_VERSION
    || value.type !== TRANSACTION_EXECUTION_ENVELOPE_TYPE
    || value.scope !== TRANSACTION_SCOPE
    || value.serviceUnit !== SERVICE_UNIT
    || value.retry !== false
    || !SHA256_PATTERN.test(value.approvalDigestSha256 ?? "")
    || !SHA256_PATTERN.test(value.expectedEnvironmentSha256 ?? "")
    || !RELEASE_PATTERN.test(value.expectedRelease ?? "")
    || !expiry
    || Number.isNaN(expiry.getTime())
    || expiry.toISOString() !== value.expiresAt
    || !Number.isFinite(nowMs)
    || expiry.getTime() <= nowMs
    || value.canaryDigestCommitmentSha256 !== expectedCanaryCommitment
    || !exactOrderedObjectKeys(value.servicePrincipal, ["uid", "gid"])
    || !Number.isSafeInteger(value.servicePrincipal.uid)
    || value.servicePrincipal.uid <= 0
    || !Number.isSafeInteger(value.servicePrincipal.gid)
    || value.servicePrincipal.gid <= 0
    || !exactOrderedObjectKeys(value.artifacts, artifactKeys)
    || !artifactKeys.every((key) => SHA256_PATTERN.test(value.artifacts[key] ?? ""))
    || !exactOrderedObjectKeys(value.custody, custodyKeys)
    || !custodyKeys.every((key) => exactLinuxAbsolutePath(value.custody[key]) !== null)
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

function exactWelcomeCoinsDeactivationExecutionEnvelope(
  value,
  { nowMs = Date.now() } = {}
) {
  const topLevelKeys = [
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
  ];
  const artifactKeys = [
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
  ];
  const expiry = typeof value?.expiresAt === "string" ? new Date(value.expiresAt) : null;
  if (
    !exactOrderedObjectKeys(value, topLevelKeys)
    || value.schemaVersion !== SCHEMA_VERSION
    || value.type !== DEACTIVATION_TRANSACTION_EXECUTION_ENVELOPE_TYPE
    || value.scope !== DEACTIVATION_TRANSACTION_SCOPE
    || value.serviceUnit !== SERVICE_UNIT
    || value.retry !== false
    || !SHA256_PATTERN.test(value.approvalDigestSha256 ?? "")
    || !SHA256_PATTERN.test(value.expectedActiveEnvironmentSha256 ?? "")
    || !SHA256_PATTERN.test(value.expectedDisabledEnvironmentSha256 ?? "")
    || !RELEASE_PATTERN.test(value.expectedRelease ?? "")
    || !expiry
    || Number.isNaN(expiry.getTime())
    || expiry.toISOString() !== value.expiresAt
    || !Number.isFinite(nowMs)
    || expiry.getTime() <= nowMs
    || !exactOrderedObjectKeys(value.servicePrincipal, ["uid", "gid"])
    || !Number.isSafeInteger(value.servicePrincipal.uid)
    || value.servicePrincipal.uid <= 0
    || !Number.isSafeInteger(value.servicePrincipal.gid)
    || value.servicePrincipal.gid <= 0
    || !exactOrderedObjectKeys(value.artifacts, artifactKeys)
    || !artifactKeys.every((key) => SHA256_PATTERN.test(value.artifacts[key] ?? ""))
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

function safeConsumptionMarker(envelope, envelopeSha256) {
  if (!SHA256_PATTERN.test(envelopeSha256 ?? "")) fail("execution_envelope_invalid");
  const consumptionType = envelope?.type === TRANSACTION_EXECUTION_ENVELOPE_TYPE
    && envelope?.scope === TRANSACTION_SCOPE
    ? TRANSACTION_CONSUMPTION_TYPE
    : envelope?.type === DEACTIVATION_TRANSACTION_EXECUTION_ENVELOPE_TYPE
      && envelope?.scope === DEACTIVATION_TRANSACTION_SCOPE
      ? DEACTIVATION_TRANSACTION_CONSUMPTION_TYPE
      : null;
  if (consumptionType === null) fail("execution_envelope_invalid");
  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    type: consumptionType,
    scope: envelope.scope,
    approvalDigestSha256: envelope.approvalDigestSha256,
    executionEnvelopeSha256: envelopeSha256,
    retry: false,
    consumed: true
  });
}

function validateRootOnlyDirectory(path, expectedMode) {
  try {
    const metadata = lstatSync(path);
    if (
      metadata.isSymbolicLink()
      || !metadata.isDirectory()
      || realpathSync(path) !== path
      || metadata.uid !== 0
      || metadata.gid !== 0
      || (metadata.mode & 0o777) !== expectedMode
    ) {
      fail("execution_envelope_consumption_failed");
    }
    return path;
  } catch (error) {
    if (error instanceof WelcomeCoinsActivationGateError) throw error;
    fail("execution_envelope_consumption_failed");
  }
}

const WELCOME_COINS_CONSUMPTION_RUNTIME = Object.freeze({
  validateConsumptionRoot(root) {
    if (process.platform !== "linux" || root !== TRANSACTION_CONSUMPTION_ROOT) {
      fail("execution_envelope_consumption_failed");
    }
    return validateRootOnlyDirectory(root, 0o700);
  },
  writeMarkerExclusive({ path, bytes }) {
    let descriptor;
    try {
      descriptor = openSync(
        path,
        fsConstants.O_WRONLY
          | fsConstants.O_CREAT
          | fsConstants.O_EXCL
          | (fsConstants.O_NOFOLLOW ?? 0),
        0o600
      );
      fchmodSync(descriptor, 0o600);
      const metadata = fstatSync(descriptor);
      if (
        !metadata.isFile()
        || metadata.uid !== 0
        || metadata.gid !== 0
        || metadata.nlink !== 1
        || (metadata.mode & 0o777) !== 0o600
      ) {
        fail("execution_envelope_consumption_failed");
      }
      let offset = 0;
      while (offset < bytes.length) {
        const count = writeSync(descriptor, bytes, offset, bytes.length - offset);
        if (count <= 0) fail("execution_envelope_consumption_failed");
        offset += count;
      }
      return descriptor;
    } catch (error) {
      if (descriptor !== undefined) {
        try { closeSync(descriptor); } catch {}
      }
      throw error;
    }
  },
  fsyncMarker({ descriptor }) {
    try {
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
  },
  fsyncConsumptionRoot({ root }) {
    const descriptor = openSync(
      root,
      fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0) | (fsConstants.O_NOFOLLOW ?? 0)
    );
    try {
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
  },
  readMarker({ path }) {
    const descriptor = openSync(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    try {
      const metadata = fstatSync(descriptor);
      if (
        !metadata.isFile()
        || metadata.uid !== 0
        || metadata.gid !== 0
        || metadata.nlink !== 1
        || (metadata.mode & 0o777) !== 0o600
        || metadata.size <= 0
        || metadata.size > 1024
      ) {
        fail("execution_envelope_consumption_failed");
      }
      return readFileSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
  }
});

function consumeWelcomeCoinsExecutionEnvelope({
  envelope,
  envelopeSha256,
  runtime = WELCOME_COINS_CONSUMPTION_RUNTIME,
  onMarkerAttempted
} = {}) {
  const assertFresh = () => {
    const expiry = typeof envelope?.expiresAt === "string" ? new Date(envelope.expiresAt) : null;
    if (
      !expiry
      || Number.isNaN(expiry.getTime())
      || expiry.toISOString() !== envelope.expiresAt
      || expiry.getTime() <= Date.now()
    ) {
      fail("execution_envelope_invalid");
    }
  };
  if (onMarkerAttempted !== undefined && typeof onMarkerAttempted !== "function") {
    fail("execution_envelope_invalid");
  }
  assertFresh();
  const marker = safeConsumptionMarker(envelope, envelopeSha256);
  const bytes = Buffer.from(`${JSON.stringify(marker)}\n`, "utf8");
  try {
    const root = runtime.validateConsumptionRoot(TRANSACTION_CONSUMPTION_ROOT);
    const path = join(root, `${envelope.approvalDigestSha256}.consumed.json`);
    assertFresh();
    onMarkerAttempted?.();
    const descriptor = runtime.writeMarkerExclusive({ path, bytes });
    runtime.fsyncMarker({ descriptor, path });
    runtime.fsyncConsumptionRoot({ root });
    const readback = runtime.readMarker({ path });
    if (!Buffer.isBuffer(readback) || !readback.equals(bytes)) {
      fail("execution_envelope_consumption_failed");
    }
    return Object.freeze({
      consumed: true,
      approvalDigestSha256: envelope.approvalDigestSha256
    });
  } catch (error) {
    if (error instanceof WelcomeCoinsActivationGateError) throw error;
    if (error?.code === "EEXIST") fail("execution_envelope_consumed");
    fail("execution_envelope_consumption_failed");
  } finally {
    bytes.fill(0);
  }
}

function consumeWelcomeCoinsActivationExecutionEnvelope(options = {}) {
  return consumeWelcomeCoinsExecutionEnvelope(options);
}

function exactWelcomeCoinsTransactionGuardedState(
  value,
  { activeState, expectedIdentity } = {}
) {
  const mainPidValid = activeState === "active"
    ? Number.isSafeInteger(value?.mainPid) && value.mainPid > 0
    : value?.mainPid === 0;
  if (
    !value
    || value.unit !== SERVICE_UNIT
    || value.activeState !== activeState
    || value.loadState !== "loaded"
    || value.needDaemonReload !== "no"
    || value.runtimeConditionStartGuard !== true
    || !RUNTIME_CONDITION_START_GUARD_IDENTITY_PATTERN.test(
      value.runtimeConditionStartGuardIdentity ?? ""
    )
    || !mainPidValid
  ) {
    fail(activeState === "active" ? "service_start_guard_invalid" : "service_state_mismatch");
  }
  if (
    expectedIdentity !== undefined
    && value.runtimeConditionStartGuardIdentity !== expectedIdentity
  ) {
    fail("service_start_guard_changed");
  }
  return value;
}

function writeAllExclusiveRootFile(path, bytes, mode) {
  let descriptor;
  try {
    descriptor = openSync(
      path,
      fsConstants.O_WRONLY
        | fsConstants.O_CREAT
        | fsConstants.O_EXCL
        | (fsConstants.O_NOFOLLOW ?? 0),
      mode
    );
    fchmodSync(descriptor, mode);
    let offset = 0;
    while (offset < bytes.length) {
      const count = writeSync(descriptor, bytes, offset, bytes.length - offset);
      if (count <= 0) fail("service_start_guard_invalid");
      offset += count;
    }
    return descriptor;
  } catch (error) {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch {}
    }
    throw error;
  }
}

function ensureExactRootDirectory(path, mode) {
  try {
    try {
      mkdirSync(path, { mode });
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
    const metadata = lstatSync(path);
    if (
      metadata.isSymbolicLink()
      || !metadata.isDirectory()
      || realpathSync(path) !== path
      || metadata.uid !== 0
      || metadata.gid !== 0
      || (metadata.mode & 0o777) !== mode
    ) {
      fail("service_start_guard_invalid");
    }
  } catch (error) {
    if (error instanceof WelcomeCoinsActivationGateError) throw error;
    fail("service_start_guard_invalid");
  }
}

function runFixedSystemctl(args) {
  const result = spawnSync(SYSTEMCTL_PATH, args, {
    encoding: "utf8",
    env: SYSTEMD_COMMAND_ENV,
    timeout: 15_000,
    windowsHide: true
  });
  if (
    !result
    || result.error
    || result.signal
    || result.status !== 0
    || result.stdout !== ""
    || result.stderr !== ""
  ) {
    fail("service_state_unavailable");
  }
}

function readFixedMainPid() {
  const result = spawnSync(SYSTEMCTL_PATH, [
    "show",
    "--property=MainPID",
    "--value",
    "--",
    SERVICE_UNIT
  ], {
    encoding: "utf8",
    env: SYSTEMD_COMMAND_ENV,
    timeout: 15_000,
    windowsHide: true
  });
  if (result?.error || result?.signal || result?.status !== 0 || result.stderr !== "") {
    fail("service_state_unavailable");
  }
  const text = String(result.stdout ?? "").trim();
  if (!/^(?:0|[1-9][0-9]*)$/u.test(text)) fail("service_state_unavailable");
  const mainPid = Number(text);
  if (!Number.isSafeInteger(mainPid)) fail("service_state_unavailable");
  return mainPid;
}

function readFixedGuardedServiceState() {
  const state = readSystemdUnitState({ serviceUnit: SERVICE_UNIT });
  return Object.freeze({
    unit: SERVICE_UNIT,
    activeState: state.activeState,
    loadState: state.loadState,
    needDaemonReload: state.needDaemonReload,
    mainPid: readFixedMainPid(),
    runtimeConditionStartGuard: state.runtimeConditionStartGuard,
    runtimeConditionStartGuardIdentity: state.runtimeConditionStartGuardIdentity
  });
}

const WELCOME_COINS_START_GUARD_RUNTIME = Object.freeze({
  createBlockExclusive() {
    const paths = runtimeConditionStartGuardPaths({ serviceUnit: SERVICE_UNIT });
    ensureExactRootDirectory(paths.blockDirectory, 0o711);
    return writeAllExclusiveRootFile(paths.blockPath, Buffer.alloc(0), 0o600);
  },
  fsyncBlock({ descriptor }) {
    try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
  },
  createDropInExclusive() {
    const paths = runtimeConditionStartGuardPaths({ serviceUnit: SERVICE_UNIT });
    ensureExactRootDirectory(paths.dropInDirectory, 0o755);
    return writeAllExclusiveRootFile(
      paths.dropInPath,
      Buffer.from(`[Unit]\nConditionPathExists=!${paths.blockPath}\n`, "utf8"),
      0o644
    );
  },
  fsyncDropIn({ descriptor }) {
    try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
  },
  fsyncGuardDirectories() {
    const paths = runtimeConditionStartGuardPaths({ serviceUnit: SERVICE_UNIT });
    for (const path of [paths.blockDirectory, paths.dropInDirectory]) {
      const descriptor = openSync(
        path,
        fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0) | (fsConstants.O_NOFOLLOW ?? 0)
      );
      try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
    }
  },
  daemonReload() {
    runFixedSystemctl(["daemon-reload"]);
  },
  readGuardedServiceState: readFixedGuardedServiceState,
  stopService() {
    runFixedSystemctl(["stop", "--", SERVICE_UNIT]);
  },
  readStoppedGuardedServiceState: readFixedGuardedServiceState
});

function establishWelcomeCoinsActivationStartGuard({
  runtime = WELCOME_COINS_START_GUARD_RUNTIME
} = {}) {
  try {
    const blockDescriptor = runtime.createBlockExclusive();
    runtime.fsyncBlock({ descriptor: blockDescriptor });
    const dropInDescriptor = runtime.createDropInExclusive();
    runtime.fsyncDropIn({ descriptor: dropInDescriptor });
    runtime.fsyncGuardDirectories();
    runtime.daemonReload();
    return exactWelcomeCoinsTransactionGuardedState(
      runtime.readGuardedServiceState(),
      { activeState: "active" }
    );
  } catch (error) {
    if (error instanceof WelcomeCoinsActivationGateError) throw error;
    fail("service_start_guard_invalid");
  }
}

function stopWelcomeCoinsActivationService({
  expectedGuardIdentity,
  runtime = WELCOME_COINS_START_GUARD_RUNTIME
} = {}) {
  try {
    runtime.stopService();
    exactWelcomeCoinsTransactionGuardedState(
      runtime.readStoppedGuardedServiceState(),
      { activeState: "inactive", expectedIdentity: expectedGuardIdentity }
    );
    return Object.freeze({ stopped: true });
  } catch (error) {
    if (error instanceof WelcomeCoinsActivationGateError) throw error;
    fail("service_state_mismatch");
  }
}

function transactionOperation(operations, name) {
  const candidate = operations?.[name];
  if (typeof candidate !== "function") fail("invalid_input");
  return candidate;
}

function exactSha256(value) {
  return typeof value === "string" && SHA256_PATTERN.test(value) ? value : null;
}

function exactDatabaseBoundary(value) {
  const keys = ["logicalSha256", "objectIdentitySha256", "parentIdentitySha256"];
  if (
    !value
    || typeof value !== "object"
    || Object.keys(value).sort().join("\0") !== [...keys].sort().join("\0")
    || !keys.every((key) => exactSha256(value[key]))
  ) {
    fail("database_boundary_invalid");
  }
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, value[key]])));
}

function sameDatabaseBoundary(left, right) {
  return left.logicalSha256 === right.logicalSha256
    && left.objectIdentitySha256 === right.objectIdentitySha256
    && left.parentIdentitySha256 === right.parentIdentitySha256;
}

function exactServicePrincipal(value) {
  if (
    !value
    || typeof value !== "object"
    || !Number.isSafeInteger(value.uid)
    || value.uid <= 0
    || !Number.isSafeInteger(value.gid)
    || value.gid <= 0
  ) {
    fail("service_principal_invalid");
  }
  return Object.freeze({ uid: value.uid, gid: value.gid });
}

function exactGuardedServiceState(value, { activeState, expectedIdentity } = {}) {
  try {
    return exactWelcomeCoinsTransactionGuardedState(value, {
      activeState,
      expectedIdentity
    }).runtimeConditionStartGuardIdentity;
  } catch (error) {
    if (
      error instanceof WelcomeCoinsActivationGateError
      && error.condition === "service_state_mismatch"
      && expectedIdentity !== undefined
    ) {
      fail("service_start_guard_changed");
    }
    throw error;
  }
}

function exactZeroHolderObservation(value, expectedDatabaseBoundary) {
  if (!value || typeof value !== "object" || value.externalHolderCount !== 0) {
    fail("database_custody_failed");
  }
  const boundary = exactDatabaseBoundary(value.databaseBoundary);
  if (expectedDatabaseBoundary && !sameDatabaseBoundary(boundary, expectedDatabaseBoundary)) {
    fail("database_boundary_invalid");
  }
  return boundary;
}

function exactCustodyChildClaim(value, expectedServicePrincipal) {
  const keys = [
    "exclusiveCustodyHeld",
    "processIdentitySha256",
    "channelBindingSha256",
    "uid",
    "gid"
  ];
  if (
    !value
    || typeof value !== "object"
    || Object.keys(value).sort().join("\0") !== [...keys].sort().join("\0")
    || value.exclusiveCustodyHeld !== true
    || !exactSha256(value.processIdentitySha256)
    || !exactSha256(value.channelBindingSha256)
    || value.uid !== expectedServicePrincipal.uid
    || value.gid !== expectedServicePrincipal.gid
  ) {
    fail("database_custody_failed");
  }
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, value[key]])));
}

function exactApprovedCustodyChildHolderObservation(
  value,
  expectedDatabaseBoundary,
  expectedCustodyChild
) {
  const boundary = exactZeroHolderObservation(value, expectedDatabaseBoundary);
  if (
    value.approvedCustodyChildHolderCount !== 1
    || !exactSha256(value.approvedCustodyChildProcessIdentitySha256)
    || value.approvedCustodyChildProcessIdentitySha256
      !== expectedCustodyChild.processIdentitySha256
    || !exactSha256(value.approvedCustodyChildChannelBindingSha256)
    || value.approvedCustodyChildChannelBindingSha256
      !== expectedCustodyChild.channelBindingSha256
  ) {
    fail("database_custody_failed");
  }
  return boundary;
}

function exactSchemaCustodyResult(value) {
  if (
    !value
    || typeof value !== "object"
    || value.state !== "schema_ready"
    || value.schemaState !== "ready"
    || value.schemaExact !== true
    || value.snapshotCreated !== true
  ) {
    fail("database_custody_failed");
  }
  return value;
}

function exactActivationResult(value, state) {
  if (
    !value
    || typeof value !== "object"
    || value.state !== state
    || !exactSha256(value.environmentSha256)
  ) {
    fail("activation_publish_failed");
  }
  return value;
}

async function runWelcomeCoinsActivationTransactionCore({
  executionEnvelope,
  canaryDigest,
  operations
} = {}) {
  if (!executionEnvelope || typeof executionEnvelope !== "object") fail("invalid_input");
  if (executionEnvelope.scope !== TRANSACTION_SCOPE) fail("invalid_input");
  if (executionEnvelope.serviceUnit !== SERVICE_UNIT) fail("service_unit_invalid");
  if (!exactSha256(executionEnvelope.expectedEnvironmentSha256)) {
    fail("env_identity_mismatch");
  }
  if (!exactSha256(canaryDigest)) fail("invalid_input");

  const readEffectiveUid = transactionOperation(operations, "readEffectiveUid");
  const validateExecutionEnvelope = transactionOperation(operations, "validateExecutionEnvelope");
  const runFreshPreflight = transactionOperation(operations, "runFreshPreflight");
  const resolveServicePrincipal = transactionOperation(operations, "resolveServicePrincipal");
  const consumeExecutionEnvelope = transactionOperation(operations, "consumeExecutionEnvelope");
  const establishStartGuard = transactionOperation(operations, "establishStartGuard");
  const readGuardedServiceState = transactionOperation(operations, "readGuardedServiceState");
  const stopService = transactionOperation(operations, "stopService");
  const inspectExternalHolders = transactionOperation(operations, "inspectExternalHolders");
  const runSchemaCustody = transactionOperation(operations, "runSchemaCustody");
  const activate = transactionOperation(operations, "activate");
  const verify = transactionOperation(operations, "verify");

  if (readEffectiveUid() !== 0) fail("invoker_not_root");
  const validatedEnvelope = await validateExecutionEnvelope(executionEnvelope);
  if (
    !validatedEnvelope
    || validatedEnvelope.valid !== true
    || validatedEnvelope.serviceUnit !== SERVICE_UNIT
    || !exactSha256(validatedEnvelope.approvalDigestSha256)
  ) {
    fail("execution_envelope_required");
  }
  const preflight = await runFreshPreflight({
    expectedEnvironmentSha256: executionEnvelope.expectedEnvironmentSha256,
    serviceUnit: SERVICE_UNIT
  });
  if (
    !preflight
    || preflight.state !== "ready"
    || preflight.environmentSha256 !== executionEnvelope.expectedEnvironmentSha256
  ) {
    fail("env_identity_mismatch");
  }
  const servicePrincipal = exactServicePrincipal(await resolveServicePrincipal({
    serviceUnit: SERVICE_UNIT
  }));

  const consumed = await consumeExecutionEnvelope({
    executionEnvelope,
    validatedEnvelope,
    servicePrincipal
  });
  if (!consumed || consumed.consumed !== true) fail("execution_envelope_required");

  const establishedGuard = await establishStartGuard({ serviceUnit: SERVICE_UNIT });
  const guardIdentity = exactGuardedServiceState(establishedGuard, { activeState: "active" });
  exactGuardedServiceState(await readGuardedServiceState({
    phase: "active",
    serviceUnit: SERVICE_UNIT
  }), {
    activeState: "active",
    expectedIdentity: guardIdentity
  });

  const stopped = await stopService({ serviceUnit: SERVICE_UNIT });
  if (!stopped || stopped.stopped !== true) fail("service_state_mismatch");
  exactGuardedServiceState(await readGuardedServiceState({
    phase: "inactive",
    serviceUnit: SERVICE_UNIT
  }), {
    activeState: "inactive",
    expectedIdentity: guardIdentity
  });

  const databaseBoundary = exactZeroHolderObservation(await inspectExternalHolders({
    phase: "inactive_pre_custody",
    serviceUnit: SERVICE_UNIT
  }));
  let commitAuthorizationStarted = false;
  let commitAuthorized = false;
  const authorizeCommit = async (custodyChildClaim) => {
    if (commitAuthorizationStarted) fail("database_custody_failed");
    commitAuthorizationStarted = true;
    const approvedCustodyChild = exactCustodyChildClaim(
      custodyChildClaim,
      servicePrincipal
    );
    exactGuardedServiceState(await readGuardedServiceState({
      phase: "exclusive_pre_commit",
      serviceUnit: SERVICE_UNIT
    }), {
      activeState: "inactive",
      expectedIdentity: guardIdentity
    });
    const observed = await inspectExternalHolders({
      phase: "exclusive_pre_commit",
      serviceUnit: SERVICE_UNIT,
      expectedDatabaseBoundary: databaseBoundary,
      expectedCustodyChildProcessIdentitySha256:
        approvedCustodyChild.processIdentitySha256,
      expectedCustodyChildChannelBindingSha256:
        approvedCustodyChild.channelBindingSha256
    });
    const rebound = exactApprovedCustodyChildHolderObservation(
      observed,
      databaseBoundary,
      approvedCustodyChild
    );
    if (!sameDatabaseBoundary(rebound, databaseBoundary)) fail("database_boundary_invalid");
    commitAuthorized = true;
    return true;
  };
  let schema;
  let activated;
  let verified;
  let custodyActivationStarted = false;
  let custodyActivationCompleted = false;
  const runWhileCustodyHeld = async (schemaResult, assertCustodyHeld) => {
    if (
      custodyActivationStarted
      || !commitAuthorized
      || typeof assertCustodyHeld !== "function"
    ) {
      fail("database_custody_failed");
    }
    custodyActivationStarted = true;
    schema = exactSchemaCustodyResult(schemaResult);
    try {
      if (await assertCustodyHeld("pre_activation") !== true) {
        throw new WelcomeCoinsActivationAttentionError();
      }
      exactGuardedServiceState(await readGuardedServiceState({
        phase: "pre_activation",
        serviceUnit: SERVICE_UNIT
      }), {
        activeState: "inactive",
        expectedIdentity: guardIdentity
      });
      activated = exactActivationResult(await activate({
        expectedEnvironmentSha256: executionEnvelope.expectedEnvironmentSha256,
        expectedGuardIdentity: guardIdentity,
        canaryDigest,
        serviceUnit: SERVICE_UNIT
      }), "activated");
      if (await assertCustodyHeld("post_activation") !== true) {
        throw new WelcomeCoinsActivationAttentionError();
      }
      verified = exactActivationResult(await verify({
        expectedEnvironmentSha256: activated.environmentSha256,
        expectedGuardIdentity: guardIdentity,
        serviceUnit: SERVICE_UNIT
      }), "verified");
      if (await assertCustodyHeld("post_verify") !== true) {
        throw new WelcomeCoinsActivationAttentionError();
      }
      exactGuardedServiceState(await readGuardedServiceState({
        phase: "terminal",
        serviceUnit: SERVICE_UNIT
      }), {
        activeState: "inactive",
        expectedIdentity: guardIdentity
      });
      if (await assertCustodyHeld("post_terminal_guard") !== true) {
        throw new WelcomeCoinsActivationAttentionError();
      }
      custodyActivationCompleted = true;
      return true;
    } catch (error) {
      if (error instanceof WelcomeCoinsActivationAttentionError) throw error;
      throw new WelcomeCoinsActivationAttentionError();
    }
  };
  try {
    const schemaResult = await runSchemaCustody({
      servicePrincipal,
      expectedDatabaseBoundary: databaseBoundary,
      expectedGuardIdentity: guardIdentity,
      authorizeCommit,
      runWhileCustodyHeld
    });
    if (
      !commitAuthorized
      || !custodyActivationStarted
      || !custodyActivationCompleted
      || !schema
      || !activated
      || !verified
    ) {
      fail("database_custody_failed");
    }
    const terminalSchema = exactSchemaCustodyResult(schemaResult);
    if (JSON.stringify(terminalSchema) !== JSON.stringify(schema)) {
      throw new WelcomeCoinsActivationAttentionError();
    }
  } catch (error) {
    if (error instanceof WelcomeCoinsActivationAttentionError) throw error;
    if (commitAuthorized) throw new WelcomeCoinsActivationAttentionError();
    throw error;
  }

  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    type: TRANSACTION_TYPE,
    state: "activation_verified_guarded",
    approvalConsumed: true,
    service: Object.freeze({
      unit: SERVICE_UNIT,
      activeState: "inactive",
      runtimeConditionStartGuard: true
    }),
    database: Object.freeze({
      exclusiveCustodyHeldThroughActivationVerification: true,
      holderObservationPhases: 2,
      identityBound: true
    }),
    schema: Object.freeze({
      state: schema.schemaState,
      exact: schema.schemaExact,
      snapshotCreated: schema.snapshotCreated
    }),
    activation: Object.freeze({
      state: verified.state,
      environmentSha256: verified.environmentSha256
    })
  });
}

function exactDeactivationTransactionResult(value, allowedStates) {
  if (
    !value
    || typeof value !== "object"
    || !allowedStates.has(value.state)
    || !exactSha256(value.environmentSha256)
  ) {
    fail("deactivation_publish_failed");
  }
  return Object.freeze({
    state: value.state,
    environmentSha256: value.environmentSha256
  });
}

async function runWelcomeCoinsDeactivationTransactionCore({
  executionEnvelope,
  operations
} = {}) {
  if (
    !executionEnvelope
    || typeof executionEnvelope !== "object"
    || executionEnvelope.type !== DEACTIVATION_TRANSACTION_EXECUTION_ENVELOPE_TYPE
    || executionEnvelope.scope !== DEACTIVATION_TRANSACTION_SCOPE
    || executionEnvelope.serviceUnit !== SERVICE_UNIT
    || !exactSha256(executionEnvelope.approvalDigestSha256)
    || !exactSha256(executionEnvelope.expectedActiveEnvironmentSha256)
    || !exactSha256(executionEnvelope.expectedDisabledEnvironmentSha256)
  ) {
    fail("invalid_input");
  }

  const readEffectiveUid = transactionOperation(operations, "readEffectiveUid");
  const validateExecutionEnvelope = transactionOperation(operations, "validateExecutionEnvelope");
  const runFreshPreflight = transactionOperation(operations, "runFreshPreflight");
  const resolveServicePrincipal = transactionOperation(operations, "resolveServicePrincipal");
  const consumeExecutionEnvelope = transactionOperation(operations, "consumeExecutionEnvelope");
  const establishStartGuard = transactionOperation(operations, "establishStartGuard");
  const readGuardedServiceState = transactionOperation(operations, "readGuardedServiceState");
  const stopService = transactionOperation(operations, "stopService");
  const revalidateMutationBoundary = transactionOperation(
    operations,
    "revalidateMutationBoundary"
  );
  const deactivate = transactionOperation(operations, "deactivate");
  const verifyDisabled = transactionOperation(operations, "verifyDisabled");

  if (readEffectiveUid() !== 0) fail("invoker_not_root");
  const validatedEnvelope = await validateExecutionEnvelope(executionEnvelope);
  if (
    !validatedEnvelope
    || validatedEnvelope.valid !== true
    || validatedEnvelope.serviceUnit !== SERVICE_UNIT
    || validatedEnvelope.approvalDigestSha256 !== executionEnvelope.approvalDigestSha256
  ) {
    fail("execution_envelope_required");
  }
  const preflight = await runFreshPreflight({
    expectedActiveEnvironmentSha256: executionEnvelope.expectedActiveEnvironmentSha256,
    expectedDisabledEnvironmentSha256: executionEnvelope.expectedDisabledEnvironmentSha256,
    serviceUnit: SERVICE_UNIT
  });
  const alreadyDisabled = preflight?.state === "already_disabled";
  if (
    !new Set(["deactivation_ready", "already_disabled"]).has(preflight?.state)
    || !exactSha256(preflight.environmentSha256)
    || preflight.disabledEnvironmentSha256
      !== executionEnvelope.expectedDisabledEnvironmentSha256
    || (alreadyDisabled
      ? preflight.environmentSha256 !== executionEnvelope.expectedDisabledEnvironmentSha256
        || executionEnvelope.expectedActiveEnvironmentSha256
          !== executionEnvelope.expectedDisabledEnvironmentSha256
      : preflight.environmentSha256
        !== executionEnvelope.expectedActiveEnvironmentSha256)
  ) {
    fail("env_identity_mismatch");
  }
  const servicePrincipal = exactServicePrincipal(await resolveServicePrincipal({
    serviceUnit: SERVICE_UNIT
  }));
  if (
    servicePrincipal.uid !== executionEnvelope.servicePrincipal?.uid
    || servicePrincipal.gid !== executionEnvelope.servicePrincipal?.gid
  ) {
    fail("execution_envelope_invalid");
  }

  const consumed = await consumeExecutionEnvelope({
    executionEnvelope,
    validatedEnvelope,
    servicePrincipal
  });
  if (!consumed || consumed.consumed !== true) fail("execution_envelope_required");

  const establishedGuard = await establishStartGuard({ serviceUnit: SERVICE_UNIT });
  const guardIdentity = exactGuardedServiceState(establishedGuard, { activeState: "active" });
  exactGuardedServiceState(await readGuardedServiceState({
    phase: "active",
    serviceUnit: SERVICE_UNIT
  }), {
    activeState: "active",
    expectedIdentity: guardIdentity
  });
  const stopped = await stopService({ serviceUnit: SERVICE_UNIT });
  if (!stopped || stopped.stopped !== true) fail("service_state_mismatch");
  exactGuardedServiceState(await readGuardedServiceState({
    phase: "inactive",
    serviceUnit: SERVICE_UNIT
  }), {
    activeState: "inactive",
    expectedIdentity: guardIdentity
  });

  const boundary = await revalidateMutationBoundary({
    expectedCurrentEnvironmentSha256: preflight.environmentSha256,
    expectedDisabledEnvironmentSha256: executionEnvelope.expectedDisabledEnvironmentSha256,
    expectedGuardIdentity: guardIdentity,
    serviceUnit: SERVICE_UNIT
  });
  if (
    !boundary
    || boundary.valid !== true
    || boundary.environmentSha256 !== preflight.environmentSha256
    || boundary.disabledEnvironmentSha256
      !== executionEnvelope.expectedDisabledEnvironmentSha256
  ) {
    fail("env_identity_mismatch");
  }

  let deactivated;
  try {
    deactivated = exactDeactivationTransactionResult(await deactivate({
      expectedEnvironmentSha256: preflight.environmentSha256,
      expectedDisabledEnvironmentSha256: executionEnvelope.expectedDisabledEnvironmentSha256,
      expectedGuardIdentity: guardIdentity,
      serviceUnit: SERVICE_UNIT
    }), new Set(["deactivated", "already_disabled"]));
  } catch (error) {
    if (
      error instanceof WelcomeCoinsActivationGateError
      || error instanceof WelcomeCoinsActivationAttentionError
    ) {
      throw error;
    }
    throw new WelcomeCoinsActivationAttentionError();
  }
  if (deactivated.state !== (alreadyDisabled ? "already_disabled" : "deactivated")) {
    if (deactivated.state === "deactivated") throw new WelcomeCoinsActivationAttentionError();
    fail("deactivation_publish_failed");
  }
  if (deactivated.environmentSha256 !== executionEnvelope.expectedDisabledEnvironmentSha256) {
    if (deactivated.state === "deactivated") throw new WelcomeCoinsActivationAttentionError();
    fail("env_identity_mismatch");
  }

  let verified;
  try {
    verified = exactDeactivationTransactionResult(await verifyDisabled({
      expectedEnvironmentSha256: executionEnvelope.expectedDisabledEnvironmentSha256,
      expectedGuardIdentity: guardIdentity,
      serviceUnit: SERVICE_UNIT
    }), new Set(["disabled_verified"]));
    if (verified.environmentSha256 !== executionEnvelope.expectedDisabledEnvironmentSha256) {
      fail("env_identity_mismatch");
    }
    exactGuardedServiceState(await readGuardedServiceState({
      phase: "terminal",
      serviceUnit: SERVICE_UNIT
    }), {
      activeState: "inactive",
      expectedIdentity: guardIdentity
    });
  } catch (error) {
    if (deactivated.state === "deactivated") {
      throw error instanceof WelcomeCoinsActivationAttentionError
        ? error
        : new WelcomeCoinsActivationAttentionError();
    }
    throw error;
  }

  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    type: DEACTIVATION_TRANSACTION_TYPE,
    state: "deactivation_verified_guarded",
    approvalConsumed: true,
    service: Object.freeze({
      unit: SERVICE_UNIT,
      activeState: "inactive",
      runtimeConditionStartGuard: true
    }),
    deactivation: Object.freeze({
      state: deactivated.state,
      environmentSha256: verified.environmentSha256
    })
  });
}

function readWelcomeCoinsActivationExecutionEnvelope() {
  const chunks = [];
  let total = 0;
  let descriptorOpen = false;
  try {
    let metadata;
    try {
      metadata = fstatSync(TRANSACTION_EXECUTION_ENVELOPE_FD);
      descriptorOpen = true;
    } catch (error) {
      if (error?.code === "EBADF" || error?.code === "EINVAL") {
        fail("execution_envelope_required");
      }
      fail("execution_envelope_invalid");
    }
    if (
      !metadata.isFile()
      || metadata.size < 3
      || metadata.size > TRANSACTION_EXECUTION_ENVELOPE_MAX_BYTES
      || (process.platform === "linux" && (
        metadata.uid !== 0
        || metadata.gid !== 0
        || (metadata.mode & 0o777) !== 0o400
        || !new Set([0, 1]).has(metadata.nlink)
      ))
    ) {
      fail("execution_envelope_invalid");
    }
    if (process.platform === "linux") {
      const fdInfo = readFileSync(
        `/proc/self/fdinfo/${TRANSACTION_EXECUTION_ENVELOPE_FD}`,
        "utf8"
      );
      const flags = /^flags:\s*([0-7]+)$/mu.exec(fdInfo);
      const position = /^pos:\s*([0-9]+)$/mu.exec(fdInfo);
      if (
        !flags
        || (Number.parseInt(flags[1], 8) & 0o3) !== fsConstants.O_RDONLY
        || !position
        || position[1] !== "0"
      ) {
        fail("execution_envelope_invalid");
      }
    }
    while (total <= TRANSACTION_EXECUTION_ENVELOPE_MAX_BYTES) {
      const chunk = Buffer.allocUnsafe(1024);
      const count = readSync(
        TRANSACTION_EXECUTION_ENVELOPE_FD,
        chunk,
        0,
        chunk.length,
        null
      );
      if (count === 0) {
        chunk.fill(0);
        break;
      }
      chunks.push(chunk.subarray(0, count));
      total += count;
    }
    if (
      total < 3
      || total > TRANSACTION_EXECUTION_ENVELOPE_MAX_BYTES
      || total !== metadata.size
    ) {
      fail("execution_envelope_invalid");
    }
    const bytes = Buffer.concat(chunks, total);
    try {
      if (bytes.at(-1) !== 0x0a) fail("execution_envelope_invalid");
      const payload = bytes.subarray(0, -1);
      const text = payload.toString("utf8");
      const roundTrip = Buffer.from(text, "utf8");
      try {
        if (!roundTrip.equals(payload)) fail("execution_envelope_invalid");
      } finally {
        roundTrip.fill(0);
      }
      if (text.includes("\n") || text.includes("\r")) fail("execution_envelope_invalid");
      const value = JSON.parse(text);
      if (JSON.stringify(value) !== text) fail("execution_envelope_invalid");
      return Object.freeze({
        value,
        envelopeSha256: createHash("sha256").update(bytes).digest("hex")
      });
    } catch (error) {
      if (error instanceof WelcomeCoinsActivationGateError) throw error;
      fail("execution_envelope_invalid");
    } finally {
      bytes.fill(0);
    }
  } finally {
    for (const chunk of chunks) chunk.fill(0);
    if (descriptorOpen) {
      try { closeSync(TRANSACTION_EXECUTION_ENVELOPE_FD); } catch {
        fail("execution_envelope_invalid");
      }
    }
  }
}

function sha256CanonicalJson(value) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function exactWelcomeCoinsNativeMagic(bytes, expected, condition = "database_custody_failed") {
  if (!Buffer.isBuffer(bytes) || bytes.length !== WELCOME_COINS_NATIVE_MAGIC_BYTES) {
    fail(condition);
  }
  const expectedBytes = Buffer.from(expected, "ascii");
  if (
    expectedBytes.length >= WELCOME_COINS_NATIVE_MAGIC_BYTES
    || !bytes.subarray(0, expectedBytes.length).equals(expectedBytes)
    || bytes[expectedBytes.length] !== 0
    || bytes.subarray(expectedBytes.length + 1).some((value) => value !== 0)
  ) {
    fail(condition);
  }
}

function welcomeCoinsNativeMagicField(value) {
  const field = Buffer.alloc(WELCOME_COINS_NATIVE_MAGIC_BYTES);
  const bytes = Buffer.from(value, "ascii");
  if (bytes.length >= field.length) fail("database_custody_failed");
  bytes.copy(field);
  return field;
}

function encodeWelcomeCoinsNativeSetup(servicePrincipal) {
  const principal = exactServicePrincipal(servicePrincipal);
  const bytes = Buffer.alloc(WELCOME_COINS_NATIVE_SETUP_BYTES);
  welcomeCoinsNativeMagicField(WELCOME_COINS_NATIVE_SETUP_MAGIC).copy(bytes, 0);
  bytes.writeUInt32BE(principal.uid, WELCOME_COINS_NATIVE_MAGIC_BYTES);
  bytes.writeUInt32BE(principal.gid, WELCOME_COINS_NATIVE_MAGIC_BYTES + 4);
  return bytes;
}

function encodeWelcomeCoinsNativeFrame(magic, value) {
  const text = JSON.stringify(value);
  if (typeof text !== "string" || text.includes("\n") || text.includes("\r")) {
    fail("database_custody_failed");
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail("database_custody_failed");
  }
  if (JSON.stringify(parsed) !== text) fail("database_custody_failed");
  const payload = Buffer.from(`${text}\n`, "utf8");
  if (payload.length < 2 || payload.length > WELCOME_COINS_NATIVE_FRAME_MAX_BYTES) {
    fail("database_custody_failed");
  }
  const frame = Buffer.alloc(WELCOME_COINS_NATIVE_FRAME_HEADER_BYTES + payload.length);
  welcomeCoinsNativeMagicField(magic).copy(frame, 0);
  frame.writeUInt32BE(payload.length, WELCOME_COINS_NATIVE_MAGIC_BYTES);
  payload.copy(frame, WELCOME_COINS_NATIVE_FRAME_HEADER_BYTES);
  payload.fill(0);
  return frame;
}

function decodeWelcomeCoinsNativeReady(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length !== WELCOME_COINS_NATIVE_READY_BYTES) {
    fail("database_custody_failed");
  }
  exactWelcomeCoinsNativeMagic(
    bytes.subarray(0, WELCOME_COINS_NATIVE_MAGIC_BYTES),
    WELCOME_COINS_NATIVE_READY_MAGIC
  );
  const childPid = bytes.readUInt32BE(40);
  const values = [44, 52, 60, 68].map((offset) => bytes.readBigUInt64BE(offset));
  if (childPid <= 1 || values.some((value) => value === 0n)) {
    fail("database_custody_failed");
  }
  return Object.freeze({
    childPid,
    acquiredDev: values[0].toString(10),
    acquiredIno: values[1].toString(10),
    authorizationDev: values[2].toString(10),
    authorizationIno: values[3].toString(10)
  });
}

function decodeWelcomeCoinsNativeFrame(bytes, expectedMagic) {
  if (
    !Buffer.isBuffer(bytes)
    || bytes.length < WELCOME_COINS_NATIVE_FRAME_HEADER_BYTES + 2
    || bytes.length > WELCOME_COINS_NATIVE_FRAME_HEADER_BYTES
      + WELCOME_COINS_NATIVE_FRAME_MAX_BYTES
  ) {
    fail("database_custody_failed");
  }
  exactWelcomeCoinsNativeMagic(
    bytes.subarray(0, WELCOME_COINS_NATIVE_MAGIC_BYTES),
    expectedMagic
  );
  const size = bytes.readUInt32BE(WELCOME_COINS_NATIVE_MAGIC_BYTES);
  if (
    size < 2
    || size > WELCOME_COINS_NATIVE_FRAME_MAX_BYTES
    || bytes.length !== WELCOME_COINS_NATIVE_FRAME_HEADER_BYTES + size
  ) {
    fail("database_custody_failed");
  }
  const payload = bytes.subarray(WELCOME_COINS_NATIVE_FRAME_HEADER_BYTES);
  if (
    payload.at(-1) !== 0x0a
    || payload.subarray(0, -1).includes(0x0a)
    || payload.includes(0x0d)
  ) {
    fail("database_custody_failed");
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(payload.subarray(0, -1));
    const value = JSON.parse(text);
    if (JSON.stringify(value) !== text) fail("database_custody_failed");
    return value;
  } catch (error) {
    if (error instanceof WelcomeCoinsActivationGateError) throw error;
    fail("database_custody_failed");
  }
}

function exactWelcomeCoinsNativeProcessIdentity(value, { root = false } = {}) {
  const keys = ["gid", "pid", "startTimeTicks", "uid"];
  if (
    !exactObjectKeys(value, keys)
    || !Number.isSafeInteger(value.pid)
    || value.pid <= 1
    || !/^[1-9][0-9]*$/u.test(value.startTimeTicks ?? "")
    || !Number.isSafeInteger(value.uid)
    || !Number.isSafeInteger(value.gid)
    || (root
      ? value.uid !== 0 || value.gid !== 0
      : value.uid <= 0 || value.gid <= 0)
  ) {
    fail("database_custody_failed");
  }
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, value[key]])));
}

function sameWelcomeCoinsNativeProcessIdentity(left, right) {
  return left.pid === right.pid
    && left.startTimeTicks === right.startTimeTicks
    && left.uid === right.uid
    && left.gid === right.gid;
}

function welcomeCoinsNativeChannelIdentity(accessMode, dev, ino) {
  if (![0, 1].includes(accessMode) || !/^[1-9][0-9]*$/u.test(dev) || !/^[1-9][0-9]*$/u.test(ino)) {
    fail("database_custody_failed");
  }
  const objectIdentitySha256 = sha256CanonicalJson({ dev, ino });
  return sha256CanonicalJson({ accessMode, objectIdentitySha256 });
}

function exactWelcomeCoinsNativeArtifactRecord(value, spec) {
  const keys = [
    "fileIdentitySha256",
    "kind",
    "mode",
    "path",
    "sha256",
    "sizeBytes"
  ];
  if (
    !exactObjectKeys(value, keys)
    || value.path !== spec.path
    || value.mode !== spec.mode
    || value.kind !== spec.kind
    || !SHA256_PATTERN.test(value.fileIdentitySha256 ?? "")
    || !SHA256_PATTERN.test(value.sha256 ?? "")
    || !Number.isSafeInteger(value.sizeBytes)
    || value.sizeBytes <= 0
  ) {
    fail("execution_envelope_invalid");
  }
  return Object.freeze({
    path: value.path,
    sha256: value.sha256,
    fileIdentitySha256: value.fileIdentitySha256,
    sizeBytes: value.sizeBytes,
    mode: value.mode,
    kind: value.kind
  });
}

function welcomeCoinsNativePublicArtifactRecord(value) {
  return Object.freeze({
    path: value.path,
    sha256: value.sha256,
    sizeBytes: value.sizeBytes,
    mode: value.mode,
    kind: value.kind
  });
}

function exactWelcomeCoinsDependencyTreeRecord(value) {
  if (
    !exactObjectKeys(value, [
      "sha256",
      "entryCount",
      "totalBytes",
      "hardlinksBroken",
      "symlinksInternal"
    ])
    || !SHA256_PATTERN.test(value.sha256 ?? "")
    || !Number.isSafeInteger(value.entryCount)
    || value.entryCount < 1
    || value.entryCount > WELCOME_COINS_DEPENDENCY_TREE_MAX_ENTRIES
    || !Number.isSafeInteger(value.totalBytes)
    || value.totalBytes < 0
    || value.totalBytes > WELCOME_COINS_DEPENDENCY_TREE_MAX_BYTES
    || value.hardlinksBroken !== true
    || value.symlinksInternal !== true
  ) {
    fail("execution_envelope_invalid");
  }
  return Object.freeze({
    sha256: value.sha256,
    entryCount: value.entryCount,
    totalBytes: value.totalBytes,
    hardlinksBroken: true,
    symlinksInternal: true
  });
}

function exactWelcomeCoinsProductionArtifactBinding(value) {
  if (
    !exactObjectKeys(value, [
      "artifacts",
      "candidateRoot",
      "candidateRootSha256",
      "dependencyTree",
      "expectedRelease",
      "node",
      "schemaVersion",
      "type"
    ])
    || value.schemaVersion !== SCHEMA_VERSION
    || value.type !== "welcome_coins_activation_artifact_binding"
    || !RELEASE_PATTERN.test(value.expectedRelease ?? "")
    || exactLinuxAbsolutePath(value.candidateRoot) === null
    || basename(value.candidateRoot) !== value.expectedRelease
    || !SHA256_PATTERN.test(value.candidateRootSha256 ?? "")
    || !Array.isArray(value.artifacts)
    || value.artifacts.length !== WELCOME_COINS_NATIVE_ARTIFACT_SPECS.length
  ) {
    fail("execution_envelope_invalid");
  }
  const artifacts = WELCOME_COINS_NATIVE_ARTIFACT_SPECS.map((spec, index) => (
    exactWelcomeCoinsNativeArtifactRecord(value.artifacts[index], spec)
  ));
  const node = exactWelcomeCoinsNativeArtifactRecord(value.node, {
    path: WELCOME_COINS_NATIVE_NODE_PATH,
    mode: "0755",
    kind: "elf"
  });
  const dependencyTree = exactWelcomeCoinsDependencyTreeRecord(value.dependencyTree);
  const candidateRootSha256 = sha256CanonicalJson({
    schemaVersion: SCHEMA_VERSION,
    type: "welcome_coins_activation_candidate_control_surface",
    expectedRelease: value.expectedRelease,
    files: artifacts.map(welcomeCoinsNativePublicArtifactRecord),
    dependencyTree
  });
  if (candidateRootSha256 !== value.candidateRootSha256) {
    fail("execution_envelope_invalid");
  }
  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    type: "welcome_coins_activation_artifact_binding",
    candidateRoot: value.candidateRoot,
    expectedRelease: value.expectedRelease,
    candidateRootSha256,
    artifacts: Object.freeze(artifacts),
    dependencyTree,
    node
  });
}

function validateWelcomeCoinsProductionArtifacts({
  executionEnvelope,
  candidateRoot,
  nodePath = WELCOME_COINS_NATIVE_NODE_PATH,
  runtime
} = {}) {
  if (
    !executionEnvelope
    || !RELEASE_PATTERN.test(executionEnvelope.expectedRelease ?? "")
    || !exactLinuxAbsolutePath(candidateRoot)
    || basename(candidateRoot) !== executionEnvelope.expectedRelease
    || nodePath !== WELCOME_COINS_NATIVE_NODE_PATH
    || typeof runtime?.inspectArtifact !== "function"
    || typeof runtime?.inspectDependencyTree !== "function"
  ) {
    fail("execution_envelope_invalid");
  }
  const records = WELCOME_COINS_NATIVE_ARTIFACT_SPECS.map((spec) => {
    const absolutePath = joinExactLinuxPath(candidateRoot, spec.path);
    if (absolutePath === null) fail("execution_envelope_invalid");
    const record = exactWelcomeCoinsNativeArtifactRecord(
      runtime.inspectArtifact({
        path: absolutePath,
        logicalPath: spec.path,
        mode: spec.mode,
        kind: spec.kind
      }),
      { path: spec.path, mode: spec.mode, kind: spec.kind }
    );
    if (record.sha256 !== executionEnvelope.artifacts?.[spec.key]) {
      fail("execution_envelope_invalid");
    }
    return record;
  });
  const dependencyTree = exactWelcomeCoinsDependencyTreeRecord(
    runtime.inspectDependencyTree({
      path: joinExactLinuxPath(candidateRoot, "node_modules")
    })
  );
  if (dependencyTree.sha256 !== executionEnvelope.artifacts?.nodeModulesTreeSha256) {
    fail("execution_envelope_invalid");
  }
  const nodeRecord = exactWelcomeCoinsNativeArtifactRecord(
    runtime.inspectArtifact({ path: nodePath, mode: "0755", kind: "elf" }),
    { path: nodePath, mode: "0755", kind: "elf" }
  );
  if (nodeRecord.sha256 !== executionEnvelope.artifacts?.nodeSha256) {
    fail("execution_envelope_invalid");
  }
  const candidateRootSha256 = sha256CanonicalJson({
    schemaVersion: SCHEMA_VERSION,
    type: "welcome_coins_activation_candidate_control_surface",
    expectedRelease: executionEnvelope.expectedRelease,
    files: records.map(welcomeCoinsNativePublicArtifactRecord),
    dependencyTree
  });
  if (candidateRootSha256 !== executionEnvelope.artifacts?.candidateRootSha256) {
    fail("execution_envelope_invalid");
  }
  return exactWelcomeCoinsProductionArtifactBinding({
    schemaVersion: SCHEMA_VERSION,
    type: "welcome_coins_activation_artifact_binding",
    candidateRoot,
    expectedRelease: executionEnvelope.expectedRelease,
    candidateRootSha256,
    artifacts: records,
    dependencyTree,
    node: nodeRecord
  });
}

function revalidateWelcomeCoinsProductionArtifacts({ binding, runtime } = {}) {
  const expected = exactWelcomeCoinsProductionArtifactBinding(binding);
  if (
    typeof runtime?.inspectArtifact !== "function"
    || typeof runtime?.inspectDependencyTree !== "function"
  ) {
    fail("execution_envelope_invalid");
  }
  for (let index = 0; index < WELCOME_COINS_NATIVE_ARTIFACT_SPECS.length; index += 1) {
    const spec = WELCOME_COINS_NATIVE_ARTIFACT_SPECS[index];
    const absolutePath = joinExactLinuxPath(expected.candidateRoot, spec.path);
    const observed = exactWelcomeCoinsNativeArtifactRecord(runtime.inspectArtifact({
      path: absolutePath,
      logicalPath: spec.path,
      mode: spec.mode,
      kind: spec.kind
    }), spec);
    if (sha256CanonicalJson(observed) !== sha256CanonicalJson(expected.artifacts[index])) {
      fail("execution_envelope_invalid");
    }
  }
  const observedDependencyTree = exactWelcomeCoinsDependencyTreeRecord(
    runtime.inspectDependencyTree({
      path: joinExactLinuxPath(expected.candidateRoot, "node_modules")
    })
  );
  if (
    sha256CanonicalJson(observedDependencyTree)
      !== sha256CanonicalJson(expected.dependencyTree)
  ) {
    fail("execution_envelope_invalid");
  }
  const observedNode = exactWelcomeCoinsNativeArtifactRecord(runtime.inspectArtifact({
    path: WELCOME_COINS_NATIVE_NODE_PATH,
    mode: "0755",
    kind: "elf"
  }), {
    path: WELCOME_COINS_NATIVE_NODE_PATH,
    mode: "0755",
    kind: "elf"
  });
  if (sha256CanonicalJson(observedNode) !== sha256CanonicalJson(expected.node)) {
    fail("execution_envelope_invalid");
  }
  return binding;
}

async function runWelcomeCoinsNativeSchemaCustody({
  candidateRoot,
  validatedArtifactBinding,
  servicePrincipal,
  expectedDatabaseBoundary,
  expectedRuntimeConditionStartGuardIdentity,
  dbPath,
  snapshotDirectory,
  tempRoot,
  authorizeCommit,
  runWhileCustodyHeld,
  runtime
} = {}) {
  const principal = exactServicePrincipal(servicePrincipal);
  const boundary = exactDatabaseBoundary(expectedDatabaseBoundary);
  if (
    !exactLinuxAbsolutePath(candidateRoot)
    || !RUNTIME_CONDITION_START_GUARD_IDENTITY_PATTERN.test(
      expectedRuntimeConditionStartGuardIdentity ?? ""
    )
    || ![dbPath, snapshotDirectory, tempRoot].every(
      (value) => exactLinuxAbsolutePath(value) !== null
    )
    || typeof authorizeCommit !== "function"
    || typeof runWhileCustodyHeld !== "function"
    || typeof runtime?.openController !== "function"
    || typeof runtime?.revalidateArtifacts !== "function"
    || typeof runtime?.readRootProcessIdentity !== "function"
    || typeof runtime?.readHardenedChildIdentity !== "function"
    || typeof runtime?.now !== "function"
    || typeof runtime?.randomBytes !== "function"
  ) {
    fail("database_custody_failed");
  }

  let session;
  let authorizationGranted = false;
  let commitStarted = false;
  let heldFrame;
  let releaseTransmissionStarted = false;
  let challenge;
  try {
    const artifactBinding = exactWelcomeCoinsProductionArtifactBinding(
      validatedArtifactBinding
    );
    if (artifactBinding.candidateRoot !== candidateRoot) {
      fail("database_custody_failed");
    }
    const revalidateArtifacts = () => {
      if (runtime.revalidateArtifacts(validatedArtifactBinding) !== validatedArtifactBinding) {
        fail("database_custody_failed");
      }
    };
    revalidateArtifacts();
    const launcherArtifact = artifactBinding.artifacts.find(
      (record) => record.path === WELCOME_COINS_NATIVE_LAUNCHER_RELATIVE_PATH
    );
    if (!launcherArtifact) fail("database_custody_failed");
    session = await runtime.openController({
      launcherPath: joinExactLinuxPath(
        candidateRoot,
        WELCOME_COINS_NATIVE_LAUNCHER_RELATIVE_PATH
      ),
      candidateRoot,
      launcherArtifact,
      nodeArtifact: artifactBinding.node
    });
    const sessionLauncherIdentity = exactWelcomeCoinsNativeProcessIdentity(
      session?.launcherIdentity,
      { root: true }
    );
    if (
      !session
      || !Number.isSafeInteger(session.launcherPid)
      || session.launcherPid <= 1
      || sessionLauncherIdentity.pid !== session.launcherPid
    ) {
      fail("database_custody_failed");
    }
    for (const name of [
      "sendSetup",
      "receiveReady",
      "sendAuthorizationEnvelope",
      "receiveAcquired",
      "sendCommitAuthorization",
      "receiveCustodyHeld",
      "exchangeCustodyHeartbeat",
      "sendCustodyRelease",
      "waitForTerminal",
      "close"
    ]) {
      if (typeof session[name] !== "function") fail("database_custody_failed");
    }
    await session.sendSetup(principal);
    const ready = await session.receiveReady();
    if (
      !ready
      || !Number.isSafeInteger(ready.childPid)
      || ready.childPid <= 1
      || ![ready.acquiredDev, ready.acquiredIno, ready.authorizationDev, ready.authorizationIno]
        .every((value) => /^[1-9][0-9]*$/u.test(value ?? ""))
    ) {
      fail("database_custody_failed");
    }
    const parentIdentity = exactWelcomeCoinsNativeProcessIdentity(
      runtime.readRootProcessIdentity({
        pid: session.launcherPid,
        expectedParentPid: process.pid,
        expectedExecutable: joinExactLinuxPath(
          candidateRoot,
          WELCOME_COINS_NATIVE_LAUNCHER_RELATIVE_PATH
        ),
        expectedExecutableArtifact: launcherArtifact
      }),
      { root: true }
    );
    if (!sameWelcomeCoinsNativeProcessIdentity(parentIdentity, sessionLauncherIdentity)) {
      fail("database_custody_failed");
    }
    const childIdentity = exactWelcomeCoinsNativeProcessIdentity(
      runtime.readHardenedChildIdentity({
        pid: ready.childPid,
        expectedParentPid: parentIdentity.pid,
        servicePrincipal: principal,
        expectedExecutable: WELCOME_COINS_NATIVE_NODE_PATH,
        expectedExecutableArtifact: artifactBinding.node
      })
    );
    revalidateArtifacts();
    const channelBinding = Object.freeze({
      parentIdentity,
      childIdentity,
      acquiredChannelIdentitySha256: welcomeCoinsNativeChannelIdentity(
        1,
        ready.acquiredDev,
        ready.acquiredIno
      ),
      authorizationChannelIdentitySha256: welcomeCoinsNativeChannelIdentity(
        0,
        ready.authorizationDev,
        ready.authorizationIno
      )
    });
    if (
      channelBinding.acquiredChannelIdentitySha256
        === channelBinding.authorizationChannelIdentitySha256
    ) {
      fail("database_custody_failed");
    }
    const createdAt = runtime.now();
    const createdAtDate = typeof createdAt === "string" ? new Date(createdAt) : null;
    if (
      !createdAtDate
      || Number.isNaN(createdAtDate.getTime())
      || createdAtDate.toISOString() !== createdAt
    ) {
      fail("database_custody_failed");
    }
    challenge = Buffer.from(runtime.randomBytes(32));
    if (challenge.length !== 32) fail("database_custody_failed");
    const executionEnvelope = Object.freeze({
      type: "control_plane_welcome_coins_schema_custody_child",
      schemaVersion: SCHEMA_VERSION,
      serviceUid: principal.uid,
      serviceGid: principal.gid,
      initialExternalHolderCount: 0,
      authorizationChallengeSha256: createHash("sha256").update(challenge).digest("hex"),
      parentIdentity,
      childIdentity,
      acquiredChannelIdentitySha256: channelBinding.acquiredChannelIdentitySha256,
      authorizationChannelIdentitySha256: channelBinding.authorizationChannelIdentitySha256,
      custody: Object.freeze({
        serviceUnit: SERVICE_UNIT,
        expectedServiceState: "inactive",
        expectedRuntimeConditionStartGuardIdentity,
        dbPath,
        snapshotDirectory,
        tempRoot,
        createdAt,
        expectedDatabaseBoundary: boundary
      })
    });
    await session.sendAuthorizationEnvelope(executionEnvelope);
    const acquired = await session.receiveAcquired();
    if (
      !exactObjectKeys(acquired, [
        "acquisitionProofSha256",
        "channelBinding",
        "childIdentity",
        "type"
      ])
      || acquired.type !== "welcome_coins_schema_custody_acquired"
      || !SHA256_PATTERN.test(acquired.acquisitionProofSha256 ?? "")
      || !sameWelcomeCoinsNativeProcessIdentity(
        exactWelcomeCoinsNativeProcessIdentity(acquired.childIdentity),
        childIdentity
      )
      || sha256CanonicalJson(acquired.channelBinding) !== sha256CanonicalJson(channelBinding)
    ) {
      fail("database_custody_failed");
    }
    revalidateArtifacts();
    const claim = Object.freeze({
      exclusiveCustodyHeld: true,
      processIdentitySha256: sha256CanonicalJson(childIdentity),
      channelBindingSha256: sha256CanonicalJson(channelBinding),
      uid: principal.uid,
      gid: principal.gid
    });
    if (await authorizeCommit(claim) !== true) fail("database_custody_failed");
    authorizationGranted = true;
    const commit = Object.freeze({
      type: "authorize_schema_apply",
      authorizationChallenge: challenge.toString("hex"),
      acquiredFrameSha256: sha256CanonicalJson(acquired)
    });
    commitStarted = true;
    await session.sendCommitAuthorization(commit);
    const expectedGuardIdentitySha256 = createHash("sha256")
      .update(expectedRuntimeConditionStartGuardIdentity, "utf8")
      .digest("hex");
    heldFrame = await session.receiveCustodyHeld();
    const held = exactWelcomeCoinsProductionCustodyHeldFrame(
      heldFrame,
      childIdentity,
      channelBinding,
      expectedGuardIdentitySha256
    );
    const heldFrameSha256 = sha256CanonicalJson(heldFrame);
    let heartbeatCount = 0;
    const assertCustodyHeld = async (stage) => {
      const expectedStage = WELCOME_COINS_NATIVE_HEARTBEAT_STAGES[heartbeatCount];
      if (stage !== expectedStage) throw new WelcomeCoinsActivationAttentionError();
      let heartbeatChallenge;
      try {
        heartbeatChallenge = Buffer.from(runtime.randomBytes(32));
        if (heartbeatChallenge.length !== 32) {
          throw new WelcomeCoinsActivationAttentionError();
        }
        const request = Object.freeze({
          type: "assert_custody_held",
          heldFrameSha256,
          sequence: heartbeatCount + 1,
          stage,
          challengeSha256: createHash("sha256").update(heartbeatChallenge).digest("hex")
        });
        const acknowledged = await session.exchangeCustodyHeartbeat(request);
        if (
          !exactObjectKeys(acknowledged, [
            "challengeSha256",
            "heldFrameSha256",
            "sequence",
            "stage",
            "type"
          ])
          || sha256CanonicalJson(acknowledged) !== sha256CanonicalJson(request)
        ) {
          throw new WelcomeCoinsActivationAttentionError();
        }
        heartbeatCount += 1;
        return true;
      } finally {
        heartbeatChallenge?.fill(0);
      }
    };
    revalidateArtifacts();
    if (await runWhileCustodyHeld(held.schemaResult, assertCustodyHeld) !== true) {
      throw new WelcomeCoinsActivationAttentionError();
    }
    if (heartbeatCount !== WELCOME_COINS_NATIVE_HEARTBEAT_STAGES.length) {
      throw new WelcomeCoinsActivationAttentionError();
    }
    revalidateArtifacts();
    releaseTransmissionStarted = true;
    await session.sendCustodyRelease(Object.freeze({
      type: "release_after_activation_verified",
      heldFrameSha256
    }));
    const terminal = await session.waitForTerminal();
    if (
      sha256CanonicalJson(terminal) !== sha256CanonicalJson(heldFrame.schemaResult)
    ) {
      throw new WelcomeCoinsActivationAttentionError();
    }
    exactProductionSchemaCustodyFrame(terminal, expectedGuardIdentitySha256);
    return terminal;
  } catch (error) {
    if (heldFrame !== undefined && !releaseTransmissionStarted) {
      releaseTransmissionStarted = true;
      try {
        await session.sendCustodyRelease(Object.freeze({
          type: "release_after_attention",
          heldFrameSha256: sha256CanonicalJson(heldFrame)
        }));
        await session.waitForTerminal();
      } catch {}
    }
    if (error instanceof WelcomeCoinsActivationAttentionError) throw error;
    if (authorizationGranted || commitStarted) {
      throw new WelcomeCoinsActivationAttentionError();
    }
    if (error instanceof WelcomeCoinsActivationGateError) throw error;
    fail("database_custody_failed");
  } finally {
    if (challenge) challenge.fill(0);
    if (session && typeof session.close === "function") {
      try {
        await session.close({
          commitMayHaveStarted: authorizationGranted || commitStarted
        });
      } catch {
        if (authorizationGranted || commitStarted) {
          throw new WelcomeCoinsActivationAttentionError();
        }
        fail("database_custody_failed");
      }
    }
  }
}

function exactProductionSchemaCustodyFrame(value, expectedGuardIdentitySha256) {
  if (value?.state === "attention_required" && value.mutationPossible === true) {
    throw new WelcomeCoinsActivationAttentionError();
  }
  const checks = value?.schema?.checks;
  const appliedMigrationIds = value?.schema?.appliedMigrationIds;
  const pendingMigrationIds = value?.schema?.pendingMigrationIds;
  const reasonCodes = value?.schema?.reasonCodes;
  if (
    !exactObjectKeys(value, [
      "databaseCustody",
      "guardIdentitySha256",
      "schema",
      "schemaVersion",
      "snapshot",
      "state",
      "type"
    ])
    || value.schemaVersion !== SCHEMA_VERSION
    || value.type !== "control_plane_welcome_coins_schema_custody_gate"
    || value.state !== "schema_ready"
    || value.databaseCustody !== "exclusive"
    || !exactObjectKeys(value.snapshot, [
      "foreignKeys",
      "id",
      "quickCheck",
      "schemaVersion",
      "sizeBytes"
    ])
    || !exactSha256(value.snapshot.id)
    || !Number.isSafeInteger(value.snapshot.sizeBytes)
    || value.snapshot.sizeBytes <= 0
    || value.snapshot.quickCheck !== true
    || value.snapshot?.foreignKeys !== true
    || !Number.isSafeInteger(value.snapshot.schemaVersion)
    || value.snapshot.schemaVersion < 0
    || !exactObjectKeys(value.schema, [
      "appliedMigrationIds",
      "checks",
      "pendingMigrationIds",
      "reasonCodes",
      "sourceChanged",
      "state"
    ])
    || value.schema?.state !== "ready"
    || typeof value.schema.sourceChanged !== "boolean"
    || !exactObjectKeys(checks, [
      "foundationDependency",
      "foreignKeys",
      "quickCheck",
      "schemaExact"
    ])
    || !Object.values(checks).every((item) => item === true)
    || !Array.isArray(appliedMigrationIds)
    || !appliedMigrationIds.every((item) => typeof item === "string" && item.length > 0)
    || new Set(appliedMigrationIds).size !== appliedMigrationIds.length
    || !Array.isArray(pendingMigrationIds)
    || pendingMigrationIds.length !== 0
    || !Array.isArray(reasonCodes)
    || reasonCodes.length !== 0
    || value.schema.sourceChanged !== (appliedMigrationIds.length > 0)
  ) {
    fail("database_custody_failed");
  }
  if (
    !exactSha256(expectedGuardIdentitySha256)
    || value.guardIdentitySha256 !== expectedGuardIdentitySha256
  ) {
    throw new WelcomeCoinsActivationAttentionError();
  }
  return value;
}

function exactProductionSchemaCustodyResult(value, expectedGuardIdentitySha256) {
  exactProductionSchemaCustodyFrame(value, expectedGuardIdentitySha256);
  return Object.freeze({
    state: "schema_ready",
    schemaState: "ready",
    schemaExact: true,
    snapshotCreated: true
  });
}

function exactWelcomeCoinsProductionCustodyHeldFrame(
  value,
  expectedChildIdentity,
  expectedChannelBinding,
  expectedGuardIdentitySha256
) {
  if (
    !exactObjectKeys(value, ["channelBinding", "childIdentity", "schemaResult", "type"])
    || value.type !== "schema_ready_custody_held"
    || !sameWelcomeCoinsNativeProcessIdentity(
      exactWelcomeCoinsNativeProcessIdentity(value.childIdentity),
      expectedChildIdentity
    )
    || sha256CanonicalJson(value.channelBinding) !== sha256CanonicalJson(expectedChannelBinding)
  ) {
    fail("database_custody_failed");
  }
  const schemaFrame = exactProductionSchemaCustodyFrame(
    value.schemaResult,
    expectedGuardIdentitySha256
  );
  return Object.freeze({
    schemaFrame,
    schemaResult: exactProductionSchemaCustodyResult(
      schemaFrame,
      expectedGuardIdentitySha256
    )
  });
}

function sameWelcomeCoinsNativeFileMetadata(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mode === right.mode
    && left.uid === right.uid
    && left.gid === right.gid
    && left.nlink === right.nlink
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function welcomeCoinsNativeFileIdentitySha256(metadata) {
  if (!metadata || typeof metadata !== "object") fail("execution_envelope_invalid");
  return sha256CanonicalJson({
    dev: String(metadata.dev),
    ino: String(metadata.ino),
    size: String(metadata.size),
    mode: String(metadata.mode),
    uid: String(metadata.uid),
    gid: String(metadata.gid),
    nlink: String(metadata.nlink),
    mtimeNs: String(metadata.mtimeNs),
    ctimeNs: String(metadata.ctimeNs)
  });
}

function welcomeCoinsNativeElfKind(bytes) {
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
  if (
    programHeaderOffset > BigInt(Number.MAX_SAFE_INTEGER)
    || entrySize < 56
    || entryCount === 0
  ) {
    return null;
  }
  const tableStart = Number(programHeaderOffset);
  const tableBytes = entrySize * entryCount;
  if (!Number.isSafeInteger(tableBytes) || tableStart + tableBytes > bytes.length) return null;
  const entryPoint = bytes.readBigUInt64LE(24);
  let hasInterpreter = false;
  for (let index = 0; index < entryCount; index += 1) {
    const offset = tableStart + index * entrySize;
    if (bytes.readUInt32LE(offset) === 3) hasInterpreter = true;
  }
  if (elfType === 3 && hasInterpreter) return "pie";
  if (elfType === 3 && !hasInterpreter && entryPoint !== 0n) return "static-pie";
  if (elfType === 3 && !hasInterpreter && entryPoint === 0n) return "shared-object";
  if (elfType === 2 && hasInterpreter) return "elf";
  return null;
}

function inspectWelcomeCoinsProductionArtifact({ path, logicalPath = path, mode, kind } = {}) {
  let descriptor;
  let bytes;
  try {
    if (
      process.platform !== "linux"
      || exactLinuxAbsolutePath(path) === null
      || typeof logicalPath !== "string"
      || !/^(?:file|json|elf|pie|static-pie|shared-object)$/u.test(kind ?? "")
      || !/^0[0-7]{3}$/u.test(mode ?? "")
    ) {
      fail("execution_envelope_invalid");
    }
    trustedAncestorChain(dirname(path), { enforceLinuxRoot: true });
    const lexical = lstatSync(path, { bigint: true });
    if (
      lexical.isSymbolicLink()
      || !lexical.isFile()
      || realpathSync(path) !== path
      || lexical.uid !== 0n
      || lexical.gid !== 0n
      || lexical.nlink !== 1n
      || Number(lexical.mode & 0o7777n).toString(8).padStart(4, "0") !== mode
    ) {
      fail("execution_envelope_invalid");
    }
    descriptor = openSync(
      path,
      fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0)
    );
    const before = fstatSync(descriptor, { bigint: true });
    if (!sameWelcomeCoinsNativeFileMetadata(lexical, before)) {
      fail("execution_envelope_invalid");
    }
    bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const pathAfter = lstatSync(path, { bigint: true });
    if (
      !sameWelcomeCoinsNativeFileMetadata(before, after)
      || !sameWelcomeCoinsNativeFileMetadata(after, pathAfter)
      || bytes.length !== Number(after.size)
    ) {
      fail("execution_envelope_invalid");
    }
    const observedElfKind = ["elf", "pie", "static-pie", "shared-object"].includes(kind)
      ? welcomeCoinsNativeElfKind(bytes)
      : null;
    if (
      (kind === "pie" && observedElfKind !== "pie")
      || (kind === "static-pie" && observedElfKind !== "static-pie")
      || (kind === "shared-object" && observedElfKind !== "shared-object")
      || (kind === "elf" && !["elf", "pie"].includes(observedElfKind))
    ) {
      fail("execution_envelope_invalid");
    }
    if (kind === "json") {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const value = JSON.parse(text);
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        fail("execution_envelope_invalid");
      }
    }
    return Object.freeze({
      path: logicalPath,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      fileIdentitySha256: welcomeCoinsNativeFileIdentitySha256(after),
      sizeBytes: bytes.length,
      mode,
      kind
    });
  } catch (error) {
    if (error instanceof WelcomeCoinsActivationGateError) throw error;
    fail("execution_envelope_invalid");
  } finally {
    bytes?.fill(0);
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch {}
    }
  }
}

function inspectWelcomeCoinsProductionDependencyTree({ path } = {}) {
  try {
    if (
      process.platform !== "linux"
      || exactLinuxAbsolutePath(path) === null
      || basename(path) !== "node_modules"
    ) {
      fail("execution_envelope_invalid");
    }
    trustedAncestorChain(path, { enforceLinuxRoot: true });
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
      fail("execution_envelope_invalid");
    }

    const lines = [];
    let entryCount = 0;
    let totalBytes = 0;
    const visit = (entryPath, logicalPath, depth) => {
      if (
        depth > 64
        || /[:\uFFFD\0\r\n]/u.test(logicalPath)
      ) {
        fail("execution_envelope_invalid");
      }
      const metadata = lstatSync(entryPath, { bigint: true });
      if (
        metadata.uid !== 0n
        || metadata.gid !== 0n
        || !metadata.isSymbolicLink() && (metadata.mode & 0o7022n) !== 0n
      ) {
        fail("execution_envelope_invalid");
      }
      entryCount += 1;
      if (entryCount > WELCOME_COINS_DEPENDENCY_TREE_MAX_ENTRIES) {
        fail("execution_envelope_invalid");
      }
      const mode = Number(metadata.mode & 0o7777n).toString(8);

      if (metadata.isDirectory()) {
        lines.push(`d:${logicalPath}:${mode}`);
        const children = readdirSync(entryPath).sort();
        for (const child of children) {
          if (!child || child === "." || child === ".." || /[:\uFFFD\0\r\n]/u.test(child)) {
            fail("execution_envelope_invalid");
          }
          visit(resolve(entryPath, child), `${logicalPath}/${child}`, depth + 1);
        }
        const after = lstatSync(entryPath, { bigint: true });
        if (
          !sameWelcomeCoinsNativeFileMetadata(metadata, after)
          || readdirSync(entryPath).sort().join("\0") !== children.join("\0")
        ) {
          fail("execution_envelope_invalid");
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
          || !sameWelcomeCoinsNativeFileMetadata(metadata, after)
        ) {
          fail("execution_envelope_invalid");
        }
        lines.push(`l:${logicalPath}:${target}`);
        return;
      }

      if (
        !metadata.isFile()
        || metadata.nlink !== 1n
        || metadata.size < 0n
        || metadata.size > BigInt(WELCOME_COINS_DEPENDENCY_TREE_MAX_BYTES - totalBytes)
      ) {
        fail("execution_envelope_invalid");
      }
      let descriptor;
      let bytes;
      try {
        descriptor = openSync(
          entryPath,
          fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0)
        );
        const before = fstatSync(descriptor, { bigint: true });
        if (!sameWelcomeCoinsNativeFileMetadata(metadata, before)) {
          fail("execution_envelope_invalid");
        }
        bytes = readFileSync(descriptor);
        const after = fstatSync(descriptor, { bigint: true });
        const pathAfter = lstatSync(entryPath, { bigint: true });
        if (
          !sameWelcomeCoinsNativeFileMetadata(before, after)
          || !sameWelcomeCoinsNativeFileMetadata(after, pathAfter)
          || bytes.length !== Number(after.size)
        ) {
          fail("execution_envelope_invalid");
        }
        totalBytes += bytes.length;
        lines.push(
          `f:${logicalPath}:${mode}:${bytes.length}:${createHash("sha256").update(bytes).digest("hex")}`
        );
      } finally {
        bytes?.fill(0);
        if (descriptor !== undefined) {
          try { closeSync(descriptor); } catch {
            fail("execution_envelope_invalid");
          }
        }
      }
    };

    visit(rootRealPath, ".", 0);
    return exactWelcomeCoinsDependencyTreeRecord({
      sha256: createHash("sha256")
        .update(Buffer.from(`${lines.sort().join("\n")}\n`, "utf8"))
        .digest("hex"),
      entryCount,
      totalBytes,
      hardlinksBroken: true,
      symlinksInternal: true
    });
  } catch (error) {
    if (
      error instanceof WelcomeCoinsActivationGateError
      && error.condition === "execution_envelope_invalid"
    ) {
      throw error;
    }
    fail("execution_envelope_invalid");
  }
}

function welcomeCoinsNativeProcFields(text) {
  if (typeof text !== "string" || text.includes("\0")) fail("database_custody_failed");
  const fields = new Map();
  for (const line of text.split("\n")) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const key = line.slice(0, separator);
    if (fields.has(key)) fail("database_custody_failed");
    fields.set(key, line.slice(separator + 1).trim());
  }
  return fields;
}

function welcomeCoinsNativeProcInteger(value, { positive = false } = {}) {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value ?? "")) fail("database_custody_failed");
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < (positive ? 1 : 0)) {
    fail("database_custody_failed");
  }
  return result;
}

function welcomeCoinsNativeProcIds(value) {
  const parts = String(value ?? "").split(/\s+/u);
  if (parts.length !== 4) fail("database_custody_failed");
  return parts.map((part) => welcomeCoinsNativeProcInteger(part));
}

function welcomeCoinsNativeProcStartTime(text, pid) {
  const prefix = `${pid} (`;
  const close = String(text ?? "").lastIndexOf(")");
  if (!String(text ?? "").startsWith(prefix) || close < prefix.length) {
    fail("database_custody_failed");
  }
  const fields = text.slice(close + 2).trim().split(/\s+/u);
  if (fields.length < 20 || !/^[1-9][0-9]*$/u.test(fields[19] ?? "")) {
    fail("database_custody_failed");
  }
  return fields[19];
}

function verifyWelcomeCoinsNativeExecutableArtifact({
  pid,
  expectedPath,
  expectedArtifact
} = {}) {
  let descriptor;
  let bytes;
  try {
    if (
      !Number.isSafeInteger(pid)
      || pid <= 1
      || exactLinuxAbsolutePath(expectedPath) === null
      || !expectedArtifact
      || !SHA256_PATTERN.test(expectedArtifact.sha256 ?? "")
      || !SHA256_PATTERN.test(expectedArtifact.fileIdentitySha256 ?? "")
      || !Number.isSafeInteger(expectedArtifact.sizeBytes)
      || expectedArtifact.sizeBytes <= 0
      || !/^0[0-7]{3}$/u.test(expectedArtifact.mode ?? "")
      || readlinkSync(`/proc/${pid}/exe`) !== expectedPath
    ) {
      fail("database_custody_failed");
    }
    descriptor = openSync(`/proc/${pid}/exe`, fsConstants.O_RDONLY);
    const before = fstatSync(descriptor, { bigint: true });
    bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (
      !sameWelcomeCoinsNativeFileMetadata(before, after)
      || !after.isFile()
      || after.uid !== 0n
      || after.gid !== 0n
      || after.nlink !== 1n
      || Number(after.mode & 0o777n).toString(8).padStart(4, "0")
        !== expectedArtifact.mode
      || bytes.length !== expectedArtifact.sizeBytes
      || welcomeCoinsNativeFileIdentitySha256(after)
        !== expectedArtifact.fileIdentitySha256
      || createHash("sha256").update(bytes).digest("hex")
        !== expectedArtifact.sha256
    ) {
      fail("database_custody_failed");
    }
  } catch (error) {
    if (error instanceof WelcomeCoinsActivationGateError
      && error.condition === "database_custody_failed") {
      throw error;
    }
    fail("database_custody_failed");
  } finally {
    bytes?.fill(0);
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch {}
    }
  }
}

function readWelcomeCoinsNativeProcess({
  pid,
  expectedParentPid,
  expectedUid,
  expectedGid,
  root = false,
  hardenedStopped = false,
  expectedExecutable,
  expectedExecutableArtifact
} = {}) {
  try {
    if (process.platform !== "linux" || !Number.isSafeInteger(pid) || pid <= 1) {
      fail("database_custody_failed");
    }
    const procPath = `/proc/${pid}`;
    const readSnapshot = () => {
      const statusText = readFileSync(`${procPath}/status`, "utf8");
      const statText = readFileSync(`${procPath}/stat`, "utf8");
      const fields = welcomeCoinsNativeProcFields(statusText);
      const uidSlots = welcomeCoinsNativeProcIds(fields.get("Uid"));
      const gidSlots = welcomeCoinsNativeProcIds(fields.get("Gid"));
      const parentPid = welcomeCoinsNativeProcInteger(fields.get("PPid"));
      const startTimeTicks = welcomeCoinsNativeProcStartTime(statText, pid);
      const namespacePids = String(fields.get("NSpid") ?? "").split(/\s+/u);
      const procMetadata = statSync(procPath);
      if (
        namespacePids.length !== 1
        || welcomeCoinsNativeProcInteger(namespacePids[0], { positive: true }) !== pid
        || (expectedParentPid !== undefined && parentPid !== expectedParentPid)
        || (expectedUid !== undefined && uidSlots.some((value) => value !== expectedUid))
        || (expectedGid !== undefined && gidSlots.some((value) => value !== expectedGid))
        || (root && (uidSlots.some((value) => value !== 0) || gidSlots.some((value) => value !== 0)))
        || ((root || hardenedStopped) && (procMetadata.uid !== 0 || procMetadata.gid !== 0))
      ) {
        fail("database_custody_failed");
      }
      if (hardenedStopped) {
        const groups = String(fields.get("Groups") ?? "").split(/\s+/u);
        const zeroCapability = "0000000000000000";
        if (
          groups.length !== 1
          || welcomeCoinsNativeProcInteger(groups[0]) !== expectedGid
          || !["CapInh", "CapPrm", "CapEff", "CapBnd", "CapAmb"]
            .every((name) => fields.get(name) === zeroCapability)
          || fields.get("NoNewPrivs") !== "1"
          || fields.get("TracerPid") !== "0"
          || !/^[Tt]\b/u.test(fields.get("State") ?? "")
        ) {
          fail("database_custody_failed");
        }
      }
      if (
        expectedExecutable !== undefined
        && expectedExecutableArtifact === undefined
      ) {
        fail("database_custody_failed");
      }
      if (expectedExecutable !== undefined) {
        verifyWelcomeCoinsNativeExecutableArtifact({
          pid,
          expectedPath: expectedExecutable,
          expectedArtifact: expectedExecutableArtifact
        });
      }
      return Object.freeze({
        gid: gidSlots[0],
        pid,
        startTimeTicks,
        uid: uidSlots[0]
      });
    };
    const first = readSnapshot();
    const second = readSnapshot();
    if (!sameWelcomeCoinsNativeProcessIdentity(first, second)) {
      fail("database_custody_failed");
    }
    return first;
  } catch (error) {
    if (error instanceof WelcomeCoinsActivationGateError) throw error;
    fail("database_custody_failed");
  }
}

function welcomeCoinsNativeDeadline(timeoutMs) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) fail("database_custody_failed");
  return process.hrtime.bigint() + BigInt(timeoutMs) * 1_000_000n;
}

async function waitWelcomeCoinsNativeDeadline(promise, deadline) {
  const remainingNs = deadline - process.hrtime.bigint();
  if (remainingNs <= 0n) fail("database_custody_failed");
  const remainingMs = Number((remainingNs + 999_999n) / 1_000_000n);
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new WelcomeCoinsActivationGateError("database_custody_failed")),
          remainingMs
        );
        timeout.unref?.();
      })
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function createWelcomeCoinsNativeSocketReader(socket) {
  let pending = Buffer.alloc(0);
  let ended = false;
  let failure = null;
  const waiters = new Set();
  const wake = () => {
    for (const waiter of waiters) waiter();
    waiters.clear();
  };
  socket.on("data", (chunk) => {
    if (failure || ended) return;
    if (!Buffer.isBuffer(chunk) || pending.length + chunk.length > 2 * 8236) {
      failure = new WelcomeCoinsActivationGateError("database_custody_failed");
      socket.destroy();
      wake();
      return;
    }
    const combined = Buffer.concat([pending, chunk], pending.length + chunk.length);
    pending.fill(0);
    pending = combined;
    wake();
  });
  socket.on("end", () => {
    ended = true;
    wake();
  });
  socket.on("close", () => {
    ended = true;
    wake();
  });
  socket.on("error", () => {
    failure = new WelcomeCoinsActivationGateError("database_custody_failed");
    wake();
  });
  socket.resume();
  return Object.freeze({
    async readExact(size, deadline) {
      if (!Number.isSafeInteger(size) || size <= 0 || size > 8236) {
        fail("database_custody_failed");
      }
      while (pending.length < size) {
        if (failure) throw failure;
        if (ended) fail("database_custody_failed");
        await waitWelcomeCoinsNativeDeadline(new Promise((resolvePromise) => {
          waiters.add(resolvePromise);
        }), deadline);
      }
      const result = Buffer.from(pending.subarray(0, size));
      const remaining = Buffer.from(pending.subarray(size));
      pending.fill(0);
      pending = remaining;
      return result;
    },
    close() {
      pending.fill(0);
      pending = Buffer.alloc(0);
      failure = new WelcomeCoinsActivationGateError("database_custody_failed");
      wake();
    }
  });
}

function createWelcomeCoinsNativeOutputCollector(stream, maxBytes) {
  const chunks = [];
  let total = 0;
  let overflow = false;
  stream.on("data", (chunk) => {
    if (!Buffer.isBuffer(chunk) || overflow) return;
    total += chunk.length;
    if (total > maxBytes) {
      overflow = true;
      for (const item of chunks) item.fill(0);
      chunks.length = 0;
      return;
    }
    chunks.push(Buffer.from(chunk));
  });
  return Object.freeze({
    read() {
      if (overflow) fail("database_custody_failed");
      const result = Buffer.concat(chunks, total);
      for (const item of chunks) item.fill(0);
      chunks.length = 0;
      total = 0;
      return result;
    },
    close() {
      for (const item of chunks) item.fill(0);
      chunks.length = 0;
      total = 0;
    }
  });
}

async function writeWelcomeCoinsNativeSocket(socket, bytes, deadline) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) fail("database_custody_failed");
  const ownedBytes = Buffer.from(bytes);
  const writePromise = new Promise((resolvePromise, rejectPromise) => {
    let finished = false;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      if (typeof socket?.off === "function") socket.off("close", onClose);
      ownedBytes.fill(0);
      if (error) rejectPromise(error);
      else resolvePromise();
    };
    const onClose = () => finish(
      new WelcomeCoinsActivationGateError("database_custody_failed")
    );
    try {
      if (typeof socket?.once === "function") socket.once("close", onClose);
      socket.write(ownedBytes, finish);
    } catch (error) {
      finish(error);
    }
  });
  await waitWelcomeCoinsNativeDeadline(writePromise, deadline);
}

function parseWelcomeCoinsNativeCanonicalJsonLine(bytes, { maxBytes }) {
  if (
    !Buffer.isBuffer(bytes)
    || !Number.isSafeInteger(maxBytes)
    || maxBytes < 3
    || bytes.length < 3
    || bytes.length > maxBytes
    || bytes.at(-1) !== 0x0a
    || bytes.subarray(0, -1).includes(0x0a)
    || bytes.includes(0x0d)
  ) {
    fail("database_custody_failed");
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, -1));
    const value = JSON.parse(text);
    if (JSON.stringify(value) !== text) fail("database_custody_failed");
    return value;
  } catch (error) {
    if (error instanceof WelcomeCoinsActivationGateError) throw error;
    fail("database_custody_failed");
  }
}

function parseWelcomeCoinsNativeTerminalResult({ terminal, stdoutBytes, stderrBytes } = {}) {
  if (
    !terminal
    || !exactObjectKeys(terminal, ["code", "error", "signal"])
    || !Buffer.isBuffer(stdoutBytes)
    || !Buffer.isBuffer(stderrBytes)
  ) {
    fail("database_custody_failed");
  }
  if (terminal.error === null && terminal.code === 0 && terminal.signal === null) {
    if (stderrBytes.length !== 0) fail("database_custody_failed");
    return parseWelcomeCoinsNativeCanonicalJsonLine(stdoutBytes, { maxBytes: 16 * 1024 });
  }
  if (
    terminal.error !== null
    || terminal.code !== 1
    || terminal.signal !== null
    || stdoutBytes.length !== 0
  ) {
    fail("database_custody_failed");
  }
  const receipt = parseWelcomeCoinsNativeCanonicalJsonLine(stderrBytes, { maxBytes: 1024 });
  const launcherFailure = exactOrderedObjectKeys(receipt, [
    "schemaVersion",
    "type",
    "state",
    "condition"
  ])
    && receipt.schemaVersion === SCHEMA_VERSION
    && receipt.type === "welcome_coins_native_launcher"
    && receipt.state === "blocked"
    && WELCOME_COINS_NATIVE_LAUNCHER_SAFE_CONDITIONS.has(receipt.condition);
  const childBlocked = exactOrderedObjectKeys(receipt, [
    "schemaVersion",
    "type",
    "state",
    "condition"
  ])
    && receipt.schemaVersion === SCHEMA_VERSION
    && receipt.type === "control_plane_welcome_coins_schema_custody_child"
    && receipt.state === "blocked"
    && isWelcomeCoinsSchemaCustodyChildSafeCondition(receipt.condition);
  const childAttention = exactOrderedObjectKeys(receipt, [
    "schemaVersion",
    "type",
    "state",
    "condition",
    "mutationPossible"
  ])
    && receipt.schemaVersion === SCHEMA_VERSION
    && receipt.type === "control_plane_welcome_coins_schema_custody_child"
    && receipt.state === "attention_required"
    && receipt.mutationPossible === true
    && isWelcomeCoinsSchemaCustodyChildSafeCondition(receipt.condition);
  if (!launcherFailure && !childBlocked && !childAttention) {
    fail("database_custody_failed");
  }
  throw new WelcomeCoinsActivationAttentionError(receipt.condition);
}

async function settleWelcomeCoinsNativeControllerProcess({
  commitMayHaveStarted,
  waitForClose,
  isRunning,
  verifyTerminationTarget,
  terminate
} = {}) {
  if (
    typeof commitMayHaveStarted !== "boolean"
    || typeof waitForClose !== "function"
    || typeof isRunning !== "function"
    || typeof verifyTerminationTarget !== "function"
    || typeof terminate !== "function"
  ) {
    fail("database_custody_failed");
  }
  if (commitMayHaveStarted) {
    try {
      await waitForClose(WELCOME_COINS_NATIVE_TERMINAL_TIMEOUT_MS);
      return;
    } catch {}
  }
  if (!isRunning()) return;
  verifyTerminationTarget();
  if (terminate() !== true) fail("database_custody_failed");
  await waitForClose(5_000);
  if (isRunning()) fail("database_custody_failed");
}

function createWelcomeCoinsNativeControllerCloseOnce(operation) {
  if (typeof operation !== "function") fail("database_custody_failed");
  let closePromise;
  return (options) => {
    if (closePromise === undefined) {
      closePromise = Promise.resolve().then(() => operation(options));
    }
    return closePromise;
  };
}

async function settleWelcomeCoinsNativeOpenFailure({
  waitForClose,
  isRunning,
  verifyTerminationTarget,
  terminate
} = {}) {
  if (
    typeof waitForClose !== "function"
    || typeof isRunning !== "function"
    || typeof verifyTerminationTarget !== "function"
    || typeof terminate !== "function"
  ) {
    fail("database_custody_failed");
  }
  try {
    await waitForClose(5_000);
    return;
  } catch {}
  if (!isRunning()) return;
  verifyTerminationTarget();
  if (terminate() !== true) fail("database_custody_failed");
  try {
    await waitForClose(5_000);
  } catch {
    fail("database_custody_failed");
  }
  if (isRunning()) fail("database_custody_failed");
}

async function openWelcomeCoinsNativeController({
  launcherPath,
  candidateRoot,
  launcherArtifact,
  nodeArtifact
} = {}) {
  let server;
  let controllerSocket;
  let passedSocket;
  let child;
  let reader;
  let stdoutCollector;
  let stderrCollector;
  let childClosePromise;
  let launcherIdentity;
  let commitTransmissionStarted = false;
  let exited = false;
  const closeController = createWelcomeCoinsNativeControllerCloseOnce(
    async ({ commitMayHaveStarted = false } = {}) => {
      const mutationUncertain = commitMayHaveStarted || commitTransmissionStarted;
      try {
        await settleWelcomeCoinsNativeControllerProcess({
          commitMayHaveStarted: mutationUncertain,
          waitForClose(timeoutMs) {
            return waitWelcomeCoinsNativeDeadline(
              childClosePromise,
              welcomeCoinsNativeDeadline(timeoutMs)
            );
          },
          isRunning() {
            return child !== undefined
              && !exited
              && child.exitCode === null
              && child.signalCode === null;
          },
          verifyTerminationTarget() {
            const current = readWelcomeCoinsNativeProcess({
              pid: child.pid,
              expectedParentPid: process.pid,
              expectedUid: 0,
              expectedGid: 0,
              expectedExecutable: launcherPath,
              expectedExecutableArtifact: launcherArtifact,
              root: true
            });
            if (!sameWelcomeCoinsNativeProcessIdentity(current, launcherIdentity)) {
              fail("database_custody_failed");
            }
          },
          terminate() {
            return child.kill("SIGKILL");
          }
        });
      } finally {
        reader?.close();
        controllerSocket?.destroy();
        stdoutCollector?.close();
        stderrCollector?.close();
      }
    }
  );
  try {
    if (
      process.platform !== "linux"
      || exactLinuxAbsolutePath(launcherPath) === null
      || exactLinuxAbsolutePath(candidateRoot) === null
      || launcherPath !== joinExactLinuxPath(
        candidateRoot,
        WELCOME_COINS_NATIVE_LAUNCHER_RELATIVE_PATH
      )
      || !launcherArtifact
      || !nodeArtifact
    ) {
      fail("database_custody_failed");
    }
    const deadline = welcomeCoinsNativeDeadline(30_000);
    const socketName = `\0gccgw-wc-${randomUUID().replaceAll("-", "")}`;
    server = createServer({ pauseOnConnect: true });
    let accepted = false;
    const acceptedPromise = new Promise((resolvePromise, rejectPromise) => {
      server.on("connection", (socket) => {
        if (accepted) {
          socket.destroy();
          rejectPromise(new WelcomeCoinsActivationGateError("database_custody_failed"));
          return;
        }
        accepted = true;
        resolvePromise(socket);
      });
      server.once("error", rejectPromise);
    });
    server.listen({ path: socketName });
    await waitWelcomeCoinsNativeDeadline(once(server, "listening"), deadline);
    controllerSocket = createConnection({ path: socketName });
    controllerSocket.on("error", () => {});
    const [acceptedSocket] = await Promise.all([
      waitWelcomeCoinsNativeDeadline(acceptedPromise, deadline),
      waitWelcomeCoinsNativeDeadline(once(controllerSocket, "connect"), deadline)
    ]);
    passedSocket = acceptedSocket;
    passedSocket.on("error", () => {});
    server.close();
    server = undefined;

    child = spawn(launcherPath, [], {
      cwd: candidateRoot,
      env: SYSTEMD_COMMAND_ENV,
      shell: false,
      detached: false,
      windowsHide: true,
      stdio: [
        "ignore",
        "pipe",
        "pipe",
        "ignore",
        "ignore",
        "ignore",
        "ignore",
        passedSocket
      ]
    });
    let childError = null;
    childClosePromise = new Promise((resolvePromise) => {
      child.once("error", (error) => {
        childError = error;
      });
      child.once("exit", () => {
        exited = true;
      });
      child.once("close", (code, signal) => {
        exited = true;
        resolvePromise({ code, signal, error: childError });
      });
    });
    stdoutCollector = createWelcomeCoinsNativeOutputCollector(child.stdout, 16 * 1024);
    stderrCollector = createWelcomeCoinsNativeOutputCollector(child.stderr, 16 * 1024);
    await waitWelcomeCoinsNativeDeadline(once(child, "spawn"), deadline);
    launcherIdentity = readWelcomeCoinsNativeProcess({
      pid: child.pid,
      expectedParentPid: process.pid,
      expectedUid: 0,
      expectedGid: 0,
      expectedExecutable: launcherPath,
      expectedExecutableArtifact: launcherArtifact,
      root: true
    });
    passedSocket.destroy();
    passedSocket = undefined;
    reader = createWelcomeCoinsNativeSocketReader(controllerSocket);

    const receiveFrame = async (magic, timeoutMs = 30_000) => {
      const frameDeadline = welcomeCoinsNativeDeadline(timeoutMs);
      const header = await reader.readExact(WELCOME_COINS_NATIVE_FRAME_HEADER_BYTES, frameDeadline);
      try {
        exactWelcomeCoinsNativeMagic(
          header.subarray(0, WELCOME_COINS_NATIVE_MAGIC_BYTES),
          magic
        );
        const size = header.readUInt32BE(WELCOME_COINS_NATIVE_MAGIC_BYTES);
        if (size < 2 || size > WELCOME_COINS_NATIVE_FRAME_MAX_BYTES) {
          fail("database_custody_failed");
        }
        const payload = await reader.readExact(size, frameDeadline);
        try {
          return decodeWelcomeCoinsNativeFrame(
            Buffer.concat([header, payload], header.length + payload.length),
            magic
          );
        } finally {
          payload.fill(0);
        }
      } finally {
        header.fill(0);
      }
    };

    return Object.freeze({
      launcherPid: child.pid,
      launcherIdentity,
      async sendSetup(principal) {
        const bytes = encodeWelcomeCoinsNativeSetup(principal);
        try {
          await writeWelcomeCoinsNativeSocket(
            controllerSocket,
            bytes,
            welcomeCoinsNativeDeadline(30_000)
          );
        } finally {
          bytes.fill(0);
        }
      },
      async receiveReady() {
        const bytes = await reader.readExact(
          WELCOME_COINS_NATIVE_READY_BYTES,
          welcomeCoinsNativeDeadline(30_000)
        );
        try {
          return decodeWelcomeCoinsNativeReady(bytes);
        } finally {
          bytes.fill(0);
        }
      },
      async sendAuthorizationEnvelope(value) {
        const bytes = encodeWelcomeCoinsNativeFrame(WELCOME_COINS_NATIVE_AUTHORIZE_MAGIC, value);
        try {
          await writeWelcomeCoinsNativeSocket(
            controllerSocket,
            bytes,
            welcomeCoinsNativeDeadline(30_000)
          );
        } finally {
          bytes.fill(0);
        }
      },
      receiveAcquired() {
        return receiveFrame(WELCOME_COINS_NATIVE_ACQUIRED_MAGIC);
      },
      async sendCommitAuthorization(value) {
        commitTransmissionStarted = true;
        const bytes = encodeWelcomeCoinsNativeFrame(WELCOME_COINS_NATIVE_COMMIT_MAGIC, value);
        try {
          await writeWelcomeCoinsNativeSocket(
            controllerSocket,
            bytes,
            welcomeCoinsNativeDeadline(30_000)
          );
        } finally {
          bytes.fill(0);
        }
      },
      receiveCustodyHeld() {
        return receiveFrame(WELCOME_COINS_NATIVE_HELD_MAGIC);
      },
      async exchangeCustodyHeartbeat(value) {
        const bytes = encodeWelcomeCoinsNativeFrame(WELCOME_COINS_NATIVE_HEARTBEAT_MAGIC, value);
        try {
          await writeWelcomeCoinsNativeSocket(
            controllerSocket,
            bytes,
            welcomeCoinsNativeDeadline(30_000)
          );
        } finally {
          bytes.fill(0);
        }
        return receiveFrame(WELCOME_COINS_NATIVE_HEARTBEAT_ACK_MAGIC);
      },
      async sendCustodyRelease(value) {
        commitTransmissionStarted = true;
        const bytes = encodeWelcomeCoinsNativeFrame(WELCOME_COINS_NATIVE_RELEASE_MAGIC, value);
        try {
          await writeWelcomeCoinsNativeSocket(
            controllerSocket,
            bytes,
            welcomeCoinsNativeDeadline(30_000)
          );
        } finally {
          bytes.fill(0);
        }
      },
      async waitForTerminal() {
        const terminal = await waitWelcomeCoinsNativeDeadline(
          childClosePromise,
          welcomeCoinsNativeDeadline(WELCOME_COINS_NATIVE_TERMINAL_TIMEOUT_MS)
        );
        let stdoutBytes;
        let stderrBytes;
        try {
          stdoutBytes = stdoutCollector.read();
          stderrBytes = stderrCollector.read();
          return parseWelcomeCoinsNativeTerminalResult({
            terminal,
            stdoutBytes,
            stderrBytes
          });
        } catch (error) {
          if (
            error instanceof WelcomeCoinsActivationGateError
            || error instanceof WelcomeCoinsActivationAttentionError
          ) {
            throw error;
          }
          fail("database_custody_failed");
        } finally {
          stdoutBytes?.fill(0);
          stderrBytes?.fill(0);
        }
      },
      close(options) {
        return closeController(options);
      }
    });
  } catch (error) {
    reader?.close();
    controllerSocket?.destroy();
    passedSocket?.destroy();
    if (server) {
      try { server.close(); } catch {}
    }
    let cleanupFailed = false;
    if (child) {
      try {
        await settleWelcomeCoinsNativeOpenFailure({
          waitForClose(timeoutMs) {
            if (!childClosePromise) fail("database_custody_failed");
            return waitWelcomeCoinsNativeDeadline(
              childClosePromise,
              welcomeCoinsNativeDeadline(timeoutMs)
            );
          },
          isRunning() {
            return !exited
              && child.exitCode === null
              && child.signalCode === null;
          },
          verifyTerminationTarget() {
            const current = readWelcomeCoinsNativeProcess({
              pid: child.pid,
              expectedParentPid: process.pid,
              expectedUid: 0,
              expectedGid: 0,
              expectedExecutable: launcherPath,
              expectedExecutableArtifact: launcherArtifact,
              root: true
            });
            if (
              launcherIdentity !== undefined
              && !sameWelcomeCoinsNativeProcessIdentity(current, launcherIdentity)
            ) {
              fail("database_custody_failed");
            }
            launcherIdentity ??= current;
          },
          terminate() {
            return child.kill("SIGKILL");
          }
        });
      } catch {
        cleanupFailed = true;
      }
    }
    stdoutCollector?.close();
    stderrCollector?.close();
    if (cleanupFailed) fail("database_custody_failed");
    if (error instanceof WelcomeCoinsActivationGateError) throw error;
    fail("database_custody_failed");
  }
}

const WELCOME_COINS_NATIVE_CONTROLLER_RUNTIME = Object.freeze({
  now() {
    return new Date().toISOString();
  },
  randomBytes(size) {
    if (size !== 32) fail("database_custody_failed");
    return randomBytes(size);
  },
  revalidateArtifacts(binding) {
    return revalidateWelcomeCoinsProductionArtifacts({
      binding,
      runtime: Object.freeze({
        inspectArtifact: inspectWelcomeCoinsProductionArtifact,
        inspectDependencyTree: inspectWelcomeCoinsProductionDependencyTree
      })
    });
  },
  openController: openWelcomeCoinsNativeController,
  readRootProcessIdentity({
    pid,
    expectedParentPid,
    expectedExecutable,
    expectedExecutableArtifact
  }) {
    return readWelcomeCoinsNativeProcess({
      pid,
      expectedParentPid,
      expectedUid: 0,
      expectedGid: 0,
      expectedExecutable,
      expectedExecutableArtifact,
      root: true
    });
  },
  readHardenedChildIdentity({
    pid,
    expectedParentPid,
    servicePrincipal,
    expectedExecutable,
    expectedExecutableArtifact
  }) {
    const principal = exactServicePrincipal(servicePrincipal);
    if (expectedExecutable !== WELCOME_COINS_NATIVE_NODE_PATH) {
      fail("database_custody_failed");
    }
    return readWelcomeCoinsNativeProcess({
      pid,
      expectedParentPid,
      expectedUid: principal.uid,
      expectedGid: principal.gid,
      hardenedStopped: true,
      expectedExecutable,
      expectedExecutableArtifact
    });
  }
});

function resolveWelcomeCoinsProductionServicePrincipal() {
  try {
    const before = readFixedGuardedServiceState();
    if (
      before.unit !== SERVICE_UNIT
      || before.activeState !== "active"
      || before.loadState !== "loaded"
      || !Number.isSafeInteger(before.mainPid)
      || before.mainPid <= 1
    ) {
      fail("execution_envelope_invalid");
    }
    const identity = readWelcomeCoinsNativeProcess({ pid: before.mainPid });
    const after = readFixedGuardedServiceState();
    if (
      after.unit !== SERVICE_UNIT
      || after.activeState !== "active"
      || after.loadState !== "loaded"
      || after.mainPid !== before.mainPid
      || identity.uid <= 0
      || identity.gid <= 0
    ) {
      fail("execution_envelope_invalid");
    }
    return Object.freeze({ uid: identity.uid, gid: identity.gid });
  } catch (error) {
    if (error instanceof WelcomeCoinsActivationGateError
      && error.condition === "execution_envelope_invalid") {
      throw error;
    }
    fail("execution_envelope_invalid");
  }
}

const WELCOME_COINS_PRODUCTION_RUNTIME = Object.freeze({
  readEffectiveUid() {
    return typeof process.geteuid === "function" ? process.geteuid() : null;
  },
  validateArtifacts(executionEnvelope) {
    return validateWelcomeCoinsProductionArtifacts({
      executionEnvelope,
      candidateRoot: `${PRODUCTION_DEPLOYMENT_ROOT}/releases/${executionEnvelope.expectedRelease}`,
      nodePath: WELCOME_COINS_NATIVE_NODE_PATH,
      runtime: Object.freeze({
        inspectArtifact: inspectWelcomeCoinsProductionArtifact,
        inspectDependencyTree: inspectWelcomeCoinsProductionDependencyTree
      })
    });
  },
  resolveServicePrincipal() {
    return resolveWelcomeCoinsProductionServicePrincipal();
  },
  preflightDeactivation(options) {
    return preflightWelcomeCoinsDeactivation(options);
  },
  deactivate(options) {
    return deactivateWelcomeCoins(options);
  },
  verifyDeactivation(options) {
    return verifyWelcomeCoinsDeactivation(options);
  },
  consumptionRuntime: WELCOME_COINS_CONSUMPTION_RUNTIME,
  startGuardRuntime: WELCOME_COINS_START_GUARD_RUNTIME,
  readGuardedServiceState: readFixedGuardedServiceState,
  inspectExternalHolders(options) {
    try {
      if (options?.phase === "inactive_pre_custody") {
        return inspectWelcomeCoinsExternalHolders({
          dbPath: options.dbPath,
          phase: "inactive_pre_custody"
        });
      }
      if (options?.phase === "exclusive_pre_commit") {
        return inspectWelcomeCoinsExternalHolders({
          dbPath: options.dbPath,
          phase: "exclusive_pre_commit",
          expectedDatabaseBoundary: options.expectedDatabaseBoundary,
          expectedCustodyChildProcessIdentitySha256:
            options.expectedCustodyChildProcessIdentitySha256,
          expectedCustodyChildChannelBindingSha256:
            options.expectedCustodyChildChannelBindingSha256
        });
      }
      fail("holder_observation_invalid");
    } catch (error) {
      if (error instanceof WelcomeCoinsActivationGateError) throw error;
      if (HOLDER_OBSERVER_CONDITIONS.has(error?.condition)) fail(error.condition);
      fail("holder_observation_failed");
    }
  },
  runSchemaCustody(options) {
    return runWelcomeCoinsNativeSchemaCustody({
      ...options,
      runtime: WELCOME_COINS_NATIVE_CONTROLLER_RUNTIME
    });
  }
});

async function runWelcomeCoinsActivationProductionTransaction({
  executionEnvelope,
  envelopeSha256,
  canaryDigest,
  productionRuntime = WELCOME_COINS_PRODUCTION_RUNTIME,
  executionState = { approvalConsumed: false, approvalConsumptionState: "not_started" }
} = {}) {
  const requiredRuntimeFunctions = [
    "readEffectiveUid",
    "validateArtifacts",
    "resolveServicePrincipal",
    "readGuardedServiceState",
    "inspectExternalHolders",
    "runSchemaCustody"
  ];
  if (
    !productionRuntime
    || requiredRuntimeFunctions.some((name) => typeof productionRuntime[name] !== "function")
    || !productionRuntime.consumptionRuntime
    || !productionRuntime.startGuardRuntime
  ) {
    fail("production_runtime_unavailable");
  }

  let guardIdentity;
  let validatedArtifactBinding;
  const readPinnedInactiveGuard = () => {
    if (!RUNTIME_CONDITION_START_GUARD_IDENTITY_PATTERN.test(guardIdentity ?? "")) {
      fail("service_start_guard_invalid");
    }
    return exactWelcomeCoinsTransactionGuardedState(
      productionRuntime.readGuardedServiceState({
        phase: "activation_boundary",
        serviceUnit: SERVICE_UNIT
      }),
      { activeState: "inactive", expectedIdentity: guardIdentity }
    );
  };
  const operations = Object.freeze({
    readEffectiveUid: () => productionRuntime.readEffectiveUid(),
    async validateExecutionEnvelope(value) {
      const validated = productionRuntime.validateArtifacts(value);
      if (validated === true) {
        validatedArtifactBinding = undefined;
      } else {
        validatedArtifactBinding = exactWelcomeCoinsProductionArtifactBinding(validated);
      }
      return Object.freeze({
        valid: true,
        serviceUnit: SERVICE_UNIT,
        approvalDigestSha256: value.approvalDigestSha256
      });
    },
    runFreshPreflight({ expectedEnvironmentSha256 }) {
      const result = preflightWelcomeCoinsActivation({
        currentLink: PRODUCTION_CURRENT_LINK,
        deploymentRoot: PRODUCTION_DEPLOYMENT_ROOT,
        expectedRelease: executionEnvelope.expectedRelease,
        enforceLinuxRoot: true
      });
      return Object.freeze({
        state: result.state,
        environmentSha256: result.environment.sha256 === expectedEnvironmentSha256
          ? result.environment.sha256
          : null
      });
    },
    async resolveServicePrincipal() {
      const actual = await productionRuntime.resolveServicePrincipal({ serviceUnit: SERVICE_UNIT });
      if (
        actual?.uid !== executionEnvelope.servicePrincipal.uid
        || actual?.gid !== executionEnvelope.servicePrincipal.gid
      ) {
        fail("execution_envelope_invalid");
      }
      return Object.freeze({ uid: actual.uid, gid: actual.gid });
    },
    consumeExecutionEnvelope() {
      const consumed = consumeWelcomeCoinsActivationExecutionEnvelope({
        envelope: executionEnvelope,
        envelopeSha256,
        runtime: productionRuntime.consumptionRuntime,
        onMarkerAttempted() {
          executionState.approvalConsumptionState = "unknown_or_consumed";
        }
      });
      executionState.approvalConsumed = true;
      executionState.approvalConsumptionState = "consumed";
      return consumed;
    },
    establishStartGuard() {
      const state = establishWelcomeCoinsActivationStartGuard({
        runtime: productionRuntime.startGuardRuntime
      });
      guardIdentity = state.runtimeConditionStartGuardIdentity;
      return state;
    },
    readGuardedServiceState({ phase }) {
      const activeState = phase === "active" ? "active" : "inactive";
      return exactWelcomeCoinsTransactionGuardedState(
        productionRuntime.readGuardedServiceState({ phase, serviceUnit: SERVICE_UNIT }),
        {
          activeState,
          ...(guardIdentity === undefined ? {} : { expectedIdentity: guardIdentity })
        }
      );
    },
    stopService() {
      return stopWelcomeCoinsActivationService({
        expectedGuardIdentity: guardIdentity,
        runtime: productionRuntime.startGuardRuntime
      });
    },
    inspectExternalHolders(options) {
      return productionRuntime.inspectExternalHolders({
        ...options,
        dbPath: executionEnvelope.custody.dbPath
      });
    },
    async runSchemaCustody({ expectedGuardIdentity, ...options }) {
      if (expectedGuardIdentity !== guardIdentity) fail("service_start_guard_changed");
      const expectedGuardIdentitySha256 = createHash("sha256")
        .update(guardIdentity, "utf8")
        .digest("hex");
      try {
        if (validatedArtifactBinding !== undefined) {
          const freshBinding = exactWelcomeCoinsProductionArtifactBinding(
            productionRuntime.validateArtifacts(executionEnvelope)
          );
          if (
            sha256CanonicalJson(freshBinding)
              !== sha256CanonicalJson(validatedArtifactBinding)
          ) {
            fail("execution_envelope_invalid");
          }
        }
        return exactProductionSchemaCustodyResult(await productionRuntime.runSchemaCustody({
          ...options,
          candidateRoot: `${PRODUCTION_DEPLOYMENT_ROOT}/releases/${executionEnvelope.expectedRelease}`,
          validatedArtifactBinding,
          expectedRuntimeConditionStartGuardIdentity: guardIdentity,
          dbPath: executionEnvelope.custody.dbPath,
          snapshotDirectory: executionEnvelope.custody.snapshotDirectory,
          tempRoot: executionEnvelope.custody.tempRoot
        }), expectedGuardIdentitySha256);
      } catch (error) {
        if (error instanceof WelcomeCoinsActivationAttentionError) throw error;
        if (error?.mutationPossible === true || error?.state === "attention_required") {
          throw new WelcomeCoinsActivationAttentionError();
        }
        if (error instanceof WelcomeCoinsActivationGateError) throw error;
        fail("database_custody_failed");
      }
    },
    activate({ expectedEnvironmentSha256, expectedGuardIdentity }) {
      if (expectedGuardIdentity !== guardIdentity) fail("service_start_guard_changed");
      const result = activateWelcomeCoins({
        currentLink: PRODUCTION_CURRENT_LINK,
        deploymentRoot: PRODUCTION_DEPLOYMENT_ROOT,
        expectedRelease: executionEnvelope.expectedRelease,
        expectedEnvSha256: expectedEnvironmentSha256,
        canaryDigest,
        apply: true,
        enforceLinuxRoot: true,
        guardReader: readPinnedInactiveGuard
      });
      if (result.state !== "activated") fail("activation_publish_failed");
      return Object.freeze({
        state: "activated",
        environmentSha256: result.environment.sha256
      });
    },
    verify({ expectedEnvironmentSha256, expectedGuardIdentity }) {
      if (expectedGuardIdentity !== guardIdentity) fail("service_start_guard_changed");
      const result = verifyWelcomeCoinsActivation({
        currentLink: PRODUCTION_CURRENT_LINK,
        deploymentRoot: PRODUCTION_DEPLOYMENT_ROOT,
        expectedRelease: executionEnvelope.expectedRelease,
        expectedEnvSha256: expectedEnvironmentSha256,
        enforceLinuxRoot: true,
        guardReader: readPinnedInactiveGuard
      });
      return Object.freeze({
        state: result.state,
        environmentSha256: result.environment.sha256
      });
    }
  });

  return runWelcomeCoinsActivationTransactionCore({
    executionEnvelope,
    canaryDigest,
    operations
  });
}

async function runWelcomeCoinsDeactivationProductionTransaction({
  executionEnvelope,
  envelopeSha256,
  productionRuntime = WELCOME_COINS_PRODUCTION_RUNTIME,
  executionState = { approvalConsumed: false, approvalConsumptionState: "not_started" }
} = {}) {
  const requiredRuntimeFunctions = [
    "readEffectiveUid",
    "validateArtifacts",
    "resolveServicePrincipal",
    "readGuardedServiceState",
    "preflightDeactivation",
    "deactivate",
    "verifyDeactivation"
  ];
  if (
    !productionRuntime
    || requiredRuntimeFunctions.some((name) => typeof productionRuntime[name] !== "function")
    || !productionRuntime.consumptionRuntime
    || !productionRuntime.startGuardRuntime
  ) {
    fail("production_runtime_unavailable");
  }

  let guardIdentity;
  let validatedArtifactBinding;
  const readPinnedInactiveGuard = () => {
    if (!RUNTIME_CONDITION_START_GUARD_IDENTITY_PATTERN.test(guardIdentity ?? "")) {
      fail("service_start_guard_invalid");
    }
    return exactWelcomeCoinsTransactionGuardedState(
      productionRuntime.readGuardedServiceState({
        phase: "deactivation_boundary",
        serviceUnit: SERVICE_UNIT
      }),
      { activeState: "inactive", expectedIdentity: guardIdentity }
    );
  };
  const validateArtifactBinding = () => {
    const value = productionRuntime.validateArtifacts(executionEnvelope);
    return value === true ? true : exactWelcomeCoinsProductionArtifactBinding(value);
  };
  const sameArtifactBinding = (left, right) => (
    left === true && right === true
      || left !== true
        && right !== true
        && sha256CanonicalJson(left) === sha256CanonicalJson(right)
  );

  const operations = Object.freeze({
    readEffectiveUid: () => productionRuntime.readEffectiveUid(),
    validateExecutionEnvelope(value) {
      validatedArtifactBinding = validateArtifactBinding();
      return Object.freeze({
        valid: true,
        serviceUnit: SERVICE_UNIT,
        approvalDigestSha256: value.approvalDigestSha256
      });
    },
    runFreshPreflight() {
      return productionRuntime.preflightDeactivation({
        currentLink: PRODUCTION_CURRENT_LINK,
        deploymentRoot: PRODUCTION_DEPLOYMENT_ROOT,
        expectedRelease: executionEnvelope.expectedRelease,
        expectedActiveEnvSha256: executionEnvelope.expectedActiveEnvironmentSha256,
        expectedDisabledEnvSha256: executionEnvelope.expectedDisabledEnvironmentSha256,
        enforceLinuxRoot: true
      });
    },
    async resolveServicePrincipal() {
      const actual = await productionRuntime.resolveServicePrincipal({ serviceUnit: SERVICE_UNIT });
      if (
        actual?.uid !== executionEnvelope.servicePrincipal.uid
        || actual?.gid !== executionEnvelope.servicePrincipal.gid
      ) {
        fail("execution_envelope_invalid");
      }
      return Object.freeze({ uid: actual.uid, gid: actual.gid });
    },
    consumeExecutionEnvelope() {
      const consumed = consumeWelcomeCoinsExecutionEnvelope({
        envelope: executionEnvelope,
        envelopeSha256,
        runtime: productionRuntime.consumptionRuntime,
        onMarkerAttempted() {
          executionState.approvalConsumptionState = "unknown_or_consumed";
        }
      });
      executionState.approvalConsumed = true;
      executionState.approvalConsumptionState = "consumed";
      return consumed;
    },
    establishStartGuard() {
      const state = establishWelcomeCoinsActivationStartGuard({
        runtime: productionRuntime.startGuardRuntime
      });
      guardIdentity = state.runtimeConditionStartGuardIdentity;
      return state;
    },
    readGuardedServiceState({ phase }) {
      const activeState = phase === "active" ? "active" : "inactive";
      return exactWelcomeCoinsTransactionGuardedState(
        productionRuntime.readGuardedServiceState({ phase, serviceUnit: SERVICE_UNIT }),
        {
          activeState,
          ...(guardIdentity === undefined ? {} : { expectedIdentity: guardIdentity })
        }
      );
    },
    stopService() {
      return stopWelcomeCoinsActivationService({
        expectedGuardIdentity: guardIdentity,
        runtime: productionRuntime.startGuardRuntime
      });
    },
    revalidateMutationBoundary({
      expectedCurrentEnvironmentSha256,
      expectedDisabledEnvironmentSha256,
      expectedGuardIdentity
    }) {
      if (expectedGuardIdentity !== guardIdentity) fail("service_start_guard_changed");
      const freshBinding = validateArtifactBinding();
      if (!sameArtifactBinding(validatedArtifactBinding, freshBinding)) {
        fail("execution_envelope_invalid");
      }
      readPinnedInactiveGuard();
      const result = productionRuntime.preflightDeactivation({
        currentLink: PRODUCTION_CURRENT_LINK,
        deploymentRoot: PRODUCTION_DEPLOYMENT_ROOT,
        expectedRelease: executionEnvelope.expectedRelease,
        expectedActiveEnvSha256: executionEnvelope.expectedActiveEnvironmentSha256,
        expectedDisabledEnvSha256: executionEnvelope.expectedDisabledEnvironmentSha256,
        enforceLinuxRoot: true
      });
      if (
        result.environmentSha256 !== expectedCurrentEnvironmentSha256
        || result.disabledEnvironmentSha256 !== expectedDisabledEnvironmentSha256
      ) {
        fail("env_identity_mismatch");
      }
      return Object.freeze({
        valid: true,
        environmentSha256: result.environmentSha256,
        disabledEnvironmentSha256: result.disabledEnvironmentSha256
      });
    },
    deactivate({
      expectedEnvironmentSha256,
      expectedDisabledEnvironmentSha256,
      expectedGuardIdentity
    }) {
      if (expectedGuardIdentity !== guardIdentity) fail("service_start_guard_changed");
      const result = productionRuntime.deactivate({
        currentLink: PRODUCTION_CURRENT_LINK,
        deploymentRoot: PRODUCTION_DEPLOYMENT_ROOT,
        expectedRelease: executionEnvelope.expectedRelease,
        expectedEnvSha256: expectedEnvironmentSha256,
        expectedDisabledEnvSha256: expectedDisabledEnvironmentSha256,
        apply: true,
        enforceLinuxRoot: true,
        guardReader: readPinnedInactiveGuard
      });
      return Object.freeze({
        state: result.state,
        environmentSha256: result.environment.sha256
      });
    },
    verifyDisabled({ expectedEnvironmentSha256, expectedGuardIdentity }) {
      if (expectedGuardIdentity !== guardIdentity) fail("service_start_guard_changed");
      const result = productionRuntime.verifyDeactivation({
        currentLink: PRODUCTION_CURRENT_LINK,
        deploymentRoot: PRODUCTION_DEPLOYMENT_ROOT,
        expectedRelease: executionEnvelope.expectedRelease,
        expectedEnvSha256: expectedEnvironmentSha256,
        enforceLinuxRoot: true,
        guardReader: readPinnedInactiveGuard
      });
      return Object.freeze({
        state: result.state,
        environmentSha256: result.environment.sha256
      });
    }
  });

  return runWelcomeCoinsDeactivationTransactionCore({
    executionEnvelope,
    operations
  });
}

function welcomeCoinsActivationTransactionFailureReceipt(error, executionState = {}) {
  const attention = error instanceof WelcomeCoinsActivationAttentionError;
  const condition = error instanceof WelcomeCoinsActivationGateError
    && SAFE_CONDITIONS.has(error.condition)
    ? error.condition
    : attention
      ? "attention_required"
      : "activation_publish_failed";
  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    type: TRANSACTION_TYPE,
    state: attention ? "attention_required" : "blocked",
    condition,
    ...(attention
      && (
        WELCOME_COINS_NATIVE_LAUNCHER_SAFE_CONDITIONS.has(error.custodyCondition)
        || isWelcomeCoinsSchemaCustodyChildSafeCondition(error.custodyCondition)
      )
      ? { custodyCondition: error.custodyCondition }
      : {}),
    ...(executionState.approvalConsumed === true
      ? { approvalConsumed: true }
      : executionState.approvalConsumptionState === "unknown_or_consumed"
        ? { approvalConsumptionState: "unknown_or_consumed" }
        : {})
  });
}

function welcomeCoinsDeactivationTransactionFailureReceipt(error, executionState = {}) {
  const attention = error instanceof WelcomeCoinsActivationAttentionError;
  const condition = error instanceof WelcomeCoinsActivationGateError
    && SAFE_CONDITIONS.has(error.condition)
    ? error.condition
    : attention
      ? "attention_required"
      : "deactivation_publish_failed";
  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    type: DEACTIVATION_TRANSACTION_TYPE,
    state: attention ? "attention_required" : "blocked",
    condition,
    ...(executionState.approvalConsumed === true
      ? { approvalConsumed: true }
      : executionState.approvalConsumptionState === "unknown_or_consumed"
        ? { approvalConsumptionState: "unknown_or_consumed" }
        : {})
  });
}

function writeWelcomeCoinsCompletedTransactionReceipt(stdout, result) {
  try {
    if (typeof stdout?.write !== "function") throw new Error("stdout_unavailable");
    stdout.write(`${JSON.stringify(result)}\n`);
  } catch {
    throw new WelcomeCoinsActivationAttentionError();
  }
}

export async function runWelcomeCoinsActivationTransactionCli({
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr,
  encodedExecutionEnvelope
} = {}) {
  let digestBytes;
  const executionState = {
    approvalConsumed: false,
    approvalConsumptionState: "not_started"
  };
  try {
    if (!Array.isArray(argv) || argv.length !== 0) fail("invalid_input");
    if (
      !exactObjectKeys(encodedExecutionEnvelope, ["envelopeSha256", "value"])
      || !exactSha256(encodedExecutionEnvelope.envelopeSha256)
      || !encodedExecutionEnvelope.value
      || typeof encodedExecutionEnvelope.value !== "object"
      || Array.isArray(encodedExecutionEnvelope.value)
    ) {
      fail("execution_envelope_required");
    }
    rootOnlyInvoker();
    const encoded = readWelcomeCoinsActivationExecutionEnvelope();
    if (
      encoded.envelopeSha256 !== encodedExecutionEnvelope.envelopeSha256
      || sha256CanonicalJson(encoded.value)
        !== sha256CanonicalJson(encodedExecutionEnvelope.value)
    ) {
      fail("execution_envelope_invalid");
    }
    digestBytes = readCanaryDigestFromStdin({ inputDescriptor: 0, stdin: process.stdin });
    const canaryDigest = digestBytes.toString("ascii");
    const executionEnvelope = exactWelcomeCoinsActivationExecutionEnvelope(encoded.value, {
      canaryDigest
    });
    const result = await runWelcomeCoinsActivationProductionTransaction({
      executionEnvelope,
      envelopeSha256: encoded.envelopeSha256,
      canaryDigest,
      executionState
    });
    writeWelcomeCoinsCompletedTransactionReceipt(stdout, result);
    return 0;
  } catch (error) {
    const receipt = welcomeCoinsActivationTransactionFailureReceipt(error, executionState);
    stderr.write(`${JSON.stringify(receipt)}\n`);
    return receipt.state === "attention_required" ? 2 : 1;
  } finally {
    digestBytes?.fill(0);
  }
}

export async function runWelcomeCoinsDeactivationTransactionCli({
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr,
  encodedExecutionEnvelope
} = {}) {
  const executionState = {
    approvalConsumed: false,
    approvalConsumptionState: "not_started"
  };
  try {
    if (!Array.isArray(argv) || argv.length !== 0) fail("invalid_input");
    if (
      !exactObjectKeys(encodedExecutionEnvelope, ["envelopeSha256", "value"])
      || !exactSha256(encodedExecutionEnvelope.envelopeSha256)
      || !encodedExecutionEnvelope.value
      || typeof encodedExecutionEnvelope.value !== "object"
      || Array.isArray(encodedExecutionEnvelope.value)
    ) {
      fail("execution_envelope_required");
    }
    rootOnlyInvoker();
    const encoded = readWelcomeCoinsActivationExecutionEnvelope();
    if (
      encoded.envelopeSha256 !== encodedExecutionEnvelope.envelopeSha256
      || sha256CanonicalJson(encoded.value)
        !== sha256CanonicalJson(encodedExecutionEnvelope.value)
    ) {
      fail("execution_envelope_invalid");
    }
    const executionEnvelope = exactWelcomeCoinsDeactivationExecutionEnvelope(encoded.value);
    requireEmptyDeactivationStdin({ inputDescriptor: 0, stdin: process.stdin });
    const result = await runWelcomeCoinsDeactivationProductionTransaction({
      executionEnvelope,
      envelopeSha256: encoded.envelopeSha256,
      executionState
    });
    writeWelcomeCoinsCompletedTransactionReceipt(stdout, result);
    return 0;
  } catch (error) {
    const receipt = welcomeCoinsDeactivationTransactionFailureReceipt(error, executionState);
    stderr.write(`${JSON.stringify(receipt)}\n`);
    return receipt.state === "attention_required" ? 2 : 1;
  }
}
function parseCliArgs(argv) {
  if (!Array.isArray(argv)) fail("invalid_input");
  const values = new Map();
  let apply = false;
  const allowed = new Set([
    "--mode",
    "--expected-release",
    "--expected-env-sha256",
    "--expected-disabled-env-sha256"
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--apply") {
      if (apply) fail("invalid_input");
      apply = true;
      continue;
    }
    const equals = item.indexOf("=");
    const flag = equals >= 0 ? item.slice(0, equals) : item;
    if (!allowed.has(flag) || values.has(flag)) fail("invalid_input");
    const value = equals >= 0 ? item.slice(equals + 1) : argv[++index];
    if (typeof value !== "string" || value.length === 0 || value.startsWith("--")) {
      fail("invalid_input");
    }
    values.set(flag, value);
  }

  const mode = values.get("--mode");
  if (!new Set(["preflight", "activate", "verify", "deactivate", "verify-disabled"]).has(mode)) {
    fail("invalid_input");
  }
  const required = ["--mode", "--expected-release"];
  if (mode !== "preflight") required.push("--expected-env-sha256");
  if (mode === "deactivate") required.push("--expected-disabled-env-sha256");
  if (required.some((flag) => !values.has(flag))) fail("invalid_input");
  if ([...values.keys()].some((flag) => !required.includes(flag))) fail("invalid_input");
  if (new Set(["activate", "deactivate"]).has(mode) !== apply) fail("invalid_input");
  return {
    mode,
    apply,
    currentLink: PRODUCTION_CURRENT_LINK,
    deploymentRoot: PRODUCTION_DEPLOYMENT_ROOT,
    expectedRelease: values.get("--expected-release"),
    expectedEnvSha256: values.get("--expected-env-sha256"),
    expectedDisabledEnvSha256: values.get("--expected-disabled-env-sha256")
  };
}

function readCanaryDigestFromStdin({ inputDescriptor = 0, stdin = process.stdin } = {}) {
  if (stdin?.isTTY === true) fail("stdin_invalid");
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const chunk = Buffer.allocUnsafe(66);
      const read = readSync(inputDescriptor, chunk, 0, chunk.length, null);
      if (read === 0) {
        chunk.fill(0);
        break;
      }
      chunks.push(chunk.subarray(0, read));
      total += read;
      if (total > 65) fail("stdin_invalid");
    }
    const bytes = Buffer.concat(chunks, total);
    const digestBytes = bytes.length === 65 && bytes[64] === 0x0a
      ? bytes.subarray(0, 64)
      : bytes;
    if (
      digestBytes.length !== 64
      || !digestBytes.every((value) => (
        (value >= 0x30 && value <= 0x39) || (value >= 0x61 && value <= 0x66)
      ))
    ) {
      fail("stdin_invalid");
    }
    return Buffer.from(digestBytes);
  } finally {
    for (const chunk of chunks) chunk.fill(0);
  }
}

function requireEmptyDeactivationStdin({ inputDescriptor = 0, stdin = process.stdin } = {}) {
  if (stdin?.isTTY === true) fail("stdin_invalid");
  const byte = Buffer.alloc(1);
  try {
    if (readSync(inputDescriptor, byte, 0, byte.length, null) !== 0) {
      fail("stdin_invalid");
    }
    return true;
  } catch (error) {
    if (error instanceof WelcomeCoinsActivationGateError) throw error;
    fail("stdin_invalid");
  } finally {
    byte.fill(0);
  }
}

export function runWelcomeCoinsActivationGateCli({
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr,
  stdin = process.stdin,
  inputDescriptor = 0
} = {}) {
  let digestBytes;
  try {
    const options = parseCliArgs(argv);
    if (new Set(["activate", "deactivate"]).has(options.mode)) {
      fail("execution_envelope_required");
    }
    rootOnlyInvoker();
    let result;
    if (options.mode === "preflight") {
      result = preflightWelcomeCoinsActivation({ ...options, enforceLinuxRoot: true });
    } else if (options.mode === "activate") {
      digestBytes = readCanaryDigestFromStdin({ inputDescriptor, stdin });
      result = activateWelcomeCoins({
        ...options,
        canaryDigest: digestBytes.toString("ascii"),
        enforceLinuxRoot: true
      });
    } else if (options.mode === "verify") {
      result = verifyWelcomeCoinsActivation({ ...options, enforceLinuxRoot: true });
    } else if (options.mode === "deactivate") {
      result = deactivateWelcomeCoins({ ...options, enforceLinuxRoot: true });
    } else {
      result = verifyWelcomeCoinsDeactivation({ ...options, enforceLinuxRoot: true });
    }
    stdout.write(JSON.stringify(result) + "\n");
    return 0;
  } catch (error) {
    const attention = error instanceof WelcomeCoinsActivationAttentionError;
    const condition = error instanceof WelcomeCoinsActivationGateError
      && SAFE_CONDITIONS.has(error.condition)
      ? error.condition
      : attention
        ? "attention_required"
        : "activation_publish_failed";
    stderr.write(JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      type: TYPE,
      state: attention ? "attention_required" : "blocked",
      condition
    }) + "\n");
    return attention ? 2 : 1;
  } finally {
    digestBytes?.fill(0);
  }
}
