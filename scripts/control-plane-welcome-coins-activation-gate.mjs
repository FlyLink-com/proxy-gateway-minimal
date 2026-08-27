#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  chownSync,
  closeSync,
  constants as fsConstants,
  fsyncSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { parse as parseDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { readSystemdUnitState } from "./control-plane-db-snapshot-gate.mjs";

const SCHEMA_VERSION = "1";
const TYPE = "control_plane_welcome_coins_activation_gate";
const CURRENT_LINK_NAME = "current";
const PRODUCTION_DEPLOYMENT_ROOT = "/opt/proxy-gateway-minimal-candidate";
const PRODUCTION_CURRENT_LINK = "/opt/proxy-gateway-minimal-candidate/current";
const SERVICE_UNIT = "proxy-gateway-candidate.service";
const RELEASE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
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
  "activation_publish_failed",
  "attention_required"
]);

class WelcomeCoinsActivationGateError extends Error {
  constructor(condition) {
    super(condition);
    this.condition = condition;
  }
}

class WelcomeCoinsActivationAttentionError extends Error {
  constructor() {
    super("attention_required");
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

export function preflightWelcomeCoinsActivation(options = {}) {
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

export function activateWelcomeCoins({
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

export function verifyWelcomeCoinsActivation({
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

export function deactivateWelcomeCoins({
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
    throw error;
  } finally {
    replacement.fill(0);
  }
}

export function verifyWelcomeCoinsDeactivation({
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

function isDirectInvocation() {
  return process.argv[1]
    && comparablePath(process.argv[1]) === comparablePath(fileURLToPath(import.meta.url));
}

if (isDirectInvocation()) {
  process.exitCode = runWelcomeCoinsActivationGateCli();
}
