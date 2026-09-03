import { accessSync, constants, lstatSync, readFileSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCHEMA_VERSION = "1";
const TYPE = "validation_environment_preflight";
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEPENDENCY_NODE_VERSION = "22.23.1";
const DEPENDENCY_NODE_ABI = "127";
const DEPENDENCY_NPM_VERSION = "10.9.8";
const DEPENDENCY_GLIBC_VERSION = "2.39";
const PROFILES = new Set(["source", "dependency-artifact", "privileged-synthetic"]);

const DIRECT_INJECTION_ENVIRONMENT_KEYS = new Set([
  "DYLD_INSERT_LIBRARIES",
  "DYLD_FRAMEWORK_PATH",
  "DYLD_LIBRARY_PATH",
  "LD_AUDIT",
  "LD_LIBRARY_PATH",
  "LD_PRELOAD",
]);

const PROXY_ENVIRONMENT_KEYS = new Set([
  "ALL_PROXY",
  "HTTP_PROXY",
  "HTTPS_PROXY"
]);

const AMBIENT_NETWORK_ENVIRONMENT_KEYS = new Set([
  ...PROXY_ENVIRONMENT_KEYS,
  "NODE_EXTRA_CA_CERTS",
  "NODE_USE_ENV_PROXY"
]);

const REPORTED_ENVIRONMENT_KEYS = new Set([
  ...DIRECT_INJECTION_ENVIRONMENT_KEYS,
  ...AMBIENT_NETWORK_ENVIRONMENT_KEYS,
  "NODE_OPTIONS",
  "NODE_PATH",
  "NODE_TLS_REJECT_UNAUTHORIZED"
]);

const BENIGN_NODE_OPTIONS = Object.freeze([
  /^--max[-_]old[-_]space[-_]size=[0-9]+$/u,
  /^--max[-_]semi[-_]space[-_]size=[0-9]+$/u,
  /^--stack[-_]trace[-_]limit=[0-9]+$/u
]);

const TOOL_PATHS = Object.freeze({
  gcc: "/usr/bin/gcc",
  readelf: "/usr/bin/readelf",
  python3: "/usr/bin/python3",
  tar: "/usr/bin/tar",
  getfacl: "/usr/bin/getfacl",
  getcap: "/usr/sbin/getcap",
  env: "/usr/bin/env",
  timeout: "/usr/bin/timeout",
  bash: "/bin/bash",
  sleep: "/bin/sleep",
  git: "/usr/bin/git",
  cp: "/usr/bin/cp",
  cmp: "/usr/bin/cmp",
  cut: "/usr/bin/cut",
  find: "/usr/bin/find",
  install: "/usr/bin/install",
  mkdir: "/usr/bin/mkdir",
  mv: "/usr/bin/mv",
  rm: "/usr/bin/rm",
  sha256sum: "/usr/bin/sha256sum"
});

const REQUIRED_TOOLS = Object.freeze({
  source: Object.freeze(["node", "npm", "git"]),
  "dependency-artifact": Object.freeze([
    "node",
    "npm",
    "gcc",
    "readelf",
    "python3",
    "tar",
    "getfacl",
    "getcap",
    "git",
    "bash",
    "cp",
    "cmp",
    "cut",
    "find",
    "install",
    "mkdir",
    "mv",
    "rm",
    "sha256sum"
  ]),
  "privileged-synthetic": Object.freeze([
    "node",
    "gcc",
    "env",
    "timeout",
    "bash",
    "sleep",
    "getfacl",
    "getcap"
  ])
});

const REQUIRED_CAPABILITIES = Object.freeze(["kill", "setgid", "setuid", "setpcap"]);
const MAX_WORKSPACE_ANCESTORS = 32;
const WORKSPACE_EXTENDED_CUSTODY_ANCESTOR_REASONS = new Set([
  "getfacl_output_limit",
  "getfacl_spawn_error",
  "getfacl_status_error",
  "getfacl_stderr",
  "getfacl_special_flags",
  "getfacl_finding",
  "getcap_output_limit",
  "getcap_spawn_error",
  "getcap_status_error",
  "getcap_stderr",
  "getcap_finding"
]);
const WORKSPACE_EXTENDED_CUSTODY_GLOBAL_REASONS = new Set([
  "getfacl_unavailable",
  "getcap_unavailable",
  "ancestor_limit"
]);
const WORKSPACE_EXTENDED_CUSTODY_ADVISORY_REASON = "non_leaf_getfacl_finding";

function parseVersion(value) {
  const match = /^([0-9]+)\.([0-9]+)\.([0-9]+)$/u.exec(value || "");
  if (!match) return null;
  return Object.freeze({
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  });
}

function compareVersions(left, right) {
  for (const key of ["major", "minor", "patch"]) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
  }
  return 0;
}

function versionMatchesEngineComparator(version, token) {
  const match = /^(>=|<=|>|<|=)?([0-9]+)(?:\.([0-9]+|x|\*))?(?:\.([0-9]+|x|\*))?$/iu.exec(token);
  if (!match) return false;
  const operator = match[1] || "";
  const major = Number(match[2]);
  const minorWildcard = match[3] === undefined || /^[x*]$/iu.test(match[3]);
  const patchWildcard = match[4] === undefined || /^[x*]$/iu.test(match[4]);
  if (!Number.isSafeInteger(major) || major < 0) return false;
  if (minorWildcard && match[4] !== undefined) return false;
  if (!operator) {
    if (minorWildcard) return version.major === major;
    const minor = Number(match[3]);
    if (!Number.isSafeInteger(minor) || minor < 0) return false;
    if (patchWildcard) return version.major === major && version.minor === minor;
    const patch = Number(match[4]);
    return Number.isSafeInteger(patch)
      && patch >= 0
      && compareVersions(version, { major, minor, patch }) === 0;
  }
  if (/^[x*]$/iu.test(match[3] || "") || /^[x*]$/iu.test(match[4] || "")) return false;
  const target = {
    major,
    minor: match[3] === undefined ? 0 : Number(match[3]),
    patch: match[4] === undefined ? 0 : Number(match[4])
  };
  if (![target.minor, target.patch].every((value) => Number.isSafeInteger(value) && value >= 0)) return false;
  const comparison = compareVersions(version, target);
  if (operator === ">=") return comparison >= 0;
  if (operator === "<=") return comparison <= 0;
  if (operator === ">") return comparison > 0;
  if (operator === "<") return comparison < 0;
  return comparison === 0;
}

function sourceNodeSupported(version, range) {
  if (!version || typeof range !== "string" || range.length < 1 || range.length > 256) return false;
  if (!/^[0-9x*.<>=|\s]+$/iu.test(range)) return false;
  const alternatives = range.split("||").map((value) => value.trim());
  if (alternatives.length === 0 || alternatives.some((alternative) => alternative.length === 0)) return false;
  return alternatives.some((alternative) => {
    const comparators = alternative.split(/\s+/u).filter(Boolean);
    return comparators.length > 0
      && comparators.every((comparator) => versionMatchesEngineComparator(version, comparator));
  });
}

function identityClass(identity) {
  if (!identity || ![identity.uid, identity.gid, identity.euid, identity.egid].every(Number.isSafeInteger)) {
    return "unknown";
  }
  if ([identity.uid, identity.gid, identity.euid, identity.egid].every((value) => value === 0)) {
    return "root";
  }
  if ([identity.uid, identity.gid, identity.euid, identity.egid].every((value) => value > 0)) {
    return "non_root";
  }
  return "mixed";
}

function workspaceCustodyValid(chain, expectedLeafOwner) {
  if (!Array.isArray(chain) || chain.length === 0) return false;
  const leafOwner = chain.at(-1)?.uid;
  if (!Number.isSafeInteger(leafOwner) || leafOwner < 0) return false;
  if (expectedLeafOwner !== undefined && leafOwner !== expectedLeafOwner) return false;
  return chain.every((entry) => (
    entry
    && entry.kind === "directory"
    && Number.isSafeInteger(entry.mode)
    && (entry.mode & 0o022) === 0
    && Number.isSafeInteger(entry.uid)
    && (entry.uid === 0 || entry.uid === leafOwner)
  ));
}

function normalizedWorkspaceExtendedCustody(runtime) {
  const rawOk = runtime.workspaceExtendedCustody === true;
  const rawReason = runtime.workspaceExtendedCustodyReason;
  const rawIndex = runtime.workspaceExtendedCustodyAncestorIndex;
  if (rawOk && rawReason === "none" && rawIndex === null) {
    return Object.freeze({ ok: true, reason: "none", ancestorIndex: null });
  }
  if (rawOk
    && rawReason === WORKSPACE_EXTENDED_CUSTODY_ADVISORY_REASON
    && Number.isSafeInteger(rawIndex)
    && rawIndex > 0
    && rawIndex < MAX_WORKSPACE_ANCESTORS) {
    return Object.freeze({ ok: true, reason: rawReason, ancestorIndex: rawIndex });
  }
  if (!rawOk
    && WORKSPACE_EXTENDED_CUSTODY_GLOBAL_REASONS.has(rawReason)
    && rawIndex === null) {
    return Object.freeze({ ok: false, reason: rawReason, ancestorIndex: null });
  }
  if (!rawOk
    && WORKSPACE_EXTENDED_CUSTODY_ANCESTOR_REASONS.has(rawReason)
    && Number.isSafeInteger(rawIndex)
    && rawIndex >= 0
    && rawIndex < MAX_WORKSPACE_ANCESTORS) {
    return Object.freeze({ ok: false, reason: rawReason, ancestorIndex: rawIndex });
  }
  return Object.freeze({ ok: false, reason: "inspection_invalid", ancestorIndex: null });
}

function normalizedEnvironmentValues(
  environment,
  expectedKey,
  { platform = process.platform, posixAliases = [] } = {}
) {
  if (!environment || typeof environment !== "object" || Array.isArray(environment)) return [];
  const allowed = new Set([expectedKey, ...(platform === "win32" ? [] : posixAliases)]);
  return Object.entries(environment)
    .filter(([key, value]) => (
      typeof key === "string"
      && (platform === "win32" ? key.toUpperCase() === expectedKey : allowed.has(key))
      && typeof value === "string"
    ))
    .map(([, value]) => value);
}

function benignNodeOptions(values) {
  const active = values.map((value) => value.trim()).filter(Boolean);
  if (active.length === 0) return false;
  return active.every((value) => {
    const tokens = value.split(/\s+/u);
    return tokens.length > 0
      && tokens.every((token) => BENIGN_NODE_OPTIONS.some((pattern) => pattern.test(token)));
  });
}

function loaderEnvironmentKeyApplies(key, platform) {
  if (platform === "win32") return false;
  if (platform === "darwin") return key.startsWith("DYLD_");
  return key.startsWith("LD_");
}

export function classifyValidationEnvironmentVariables(
  environment = process.env,
  { platform = process.platform } = {}
) {
  if (!environment || typeof environment !== "object" || Array.isArray(environment)) {
    throw new TypeError("validation_environment_invalid");
  }
  const injectionKeys = [];
  const modulePathKeys = [];
  const ambientNetworkKeys = [];
  const advisoryKeys = [];
  for (const key of DIRECT_INJECTION_ENVIRONMENT_KEYS) {
    if (loaderEnvironmentKeyApplies(key, platform)
      && normalizedEnvironmentValues(environment, key, { platform }).some((value) => value.length > 0)) {
      injectionKeys.push(key);
    }
  }
  const nodeOptions = normalizedEnvironmentValues(environment, "NODE_OPTIONS", { platform });
  if (nodeOptions.some((value) => value.trim().length > 0)) {
    (benignNodeOptions(nodeOptions) ? advisoryKeys : injectionKeys).push("NODE_OPTIONS");
  }
  if (normalizedEnvironmentValues(environment, "NODE_TLS_REJECT_UNAUTHORIZED", { platform }).includes("0")) {
    injectionKeys.push("NODE_TLS_REJECT_UNAUTHORIZED");
  }
  if (normalizedEnvironmentValues(environment, "NODE_PATH", { platform }).some((value) => value.length > 0)) {
    modulePathKeys.push("NODE_PATH");
  }
  for (const key of PROXY_ENVIRONMENT_KEYS) {
    if (normalizedEnvironmentValues(environment, key, {
      platform,
      posixAliases: [key.toLowerCase()]
    }).some((value) => value.length > 0)) {
      ambientNetworkKeys.push(key);
    }
  }
  if (normalizedEnvironmentValues(environment, "NODE_EXTRA_CA_CERTS", { platform }).some((value) => value.length > 0)) {
    ambientNetworkKeys.push("NODE_EXTRA_CA_CERTS");
  }
  if (normalizedEnvironmentValues(environment, "NODE_USE_ENV_PROXY", { platform }).includes("1")) {
    ambientNetworkKeys.push("NODE_USE_ENV_PROXY");
  }
  return Object.freeze({
    injectionKeys: Object.freeze([...new Set(injectionKeys)].sort()),
    modulePathKeys: Object.freeze([...new Set(modulePathKeys)].sort()),
    ambientNetworkKeys: Object.freeze([...new Set(ambientNetworkKeys)].sort()),
    advisoryKeys: Object.freeze([...new Set(advisoryKeys)].sort())
  });
}

function pollutedEnvironment(runtime, profile) {
  const safeKeys = (value) => Array.isArray(value)
    ? [...new Set(value.filter((key) => REPORTED_ENVIRONMENT_KEYS.has(key)))].sort()
    : [];
  const injection = safeKeys(runtime.environmentSignals?.injectionKeys);
  const modulePath = safeKeys(runtime.environmentSignals?.modulePathKeys);
  const ambientNetwork = safeKeys(runtime.environmentSignals?.ambientNetworkKeys);
  const advisory = safeKeys(runtime.environmentSignals?.advisoryKeys);
  const hard = profile === "source"
    ? injection
    : profile === "dependency-artifact"
      ? [...new Set([...injection, ...modulePath])].sort()
      : [...new Set([...injection, ...modulePath, ...ambientNetwork])].sort();
  const warning = profile === "source"
    ? [...new Set([...modulePath, ...ambientNetwork, ...advisory])].sort()
    : profile === "dependency-artifact"
      ? [...new Set([...ambientNetwork, ...advisory])].sort()
      : advisory;
  return Object.freeze({
    detectedKeys: [...new Set([...injection, ...modulePath, ...ambientNetwork, ...advisory])].sort(),
    hardKeys: hard,
    warningKeys: warning
  });
}

function makeBlocker(blockers, code) {
  if (!blockers.some((blocker) => blocker.code === code)) blockers.push(Object.freeze({ code }));
}

function nodeRuntimeCheck(profile, runtime) {
  const parsed = parseVersion(runtime.nodeVersion);
  if (profile === "source") {
    const ok = sourceNodeSupported(parsed, runtime.sourceNodeRange);
    return Object.freeze({
      required: true,
      ok,
      policy: "package_engines",
      version: typeof runtime.nodeVersion === "string" ? runtime.nodeVersion : "unknown"
    });
  }
  if (profile === "dependency-artifact") {
    const ok = runtime.nodeVersion === DEPENDENCY_NODE_VERSION
      && runtime.nodeModulesAbi === DEPENDENCY_NODE_ABI
      && runtime.npmVersion === DEPENDENCY_NPM_VERSION
      && runtime.npmTrusted === true
      && runtime.glibcVersion === DEPENDENCY_GLIBC_VERSION;
    return Object.freeze({
      required: true,
      ok,
      policy: "exact_dependency_runtime",
      version: typeof runtime.nodeVersion === "string" ? runtime.nodeVersion : "unknown",
      abi: typeof runtime.nodeModulesAbi === "string" ? runtime.nodeModulesAbi : "unknown"
    });
  }
  return Object.freeze({
    required: true,
    ok: parsed?.major === 22,
    policy: "node_22_line",
    version: typeof runtime.nodeVersion === "string" ? runtime.nodeVersion : "unknown"
  });
}

function platformCheck(profile, runtime) {
  const required = profile !== "source";
  const ok = required ? runtime.platform === "linux" && runtime.arch === "x64" : true;
  return Object.freeze({
    required,
    ok,
    platform: typeof runtime.platform === "string" ? runtime.platform : "unknown",
    arch: typeof runtime.arch === "string" ? runtime.arch : "unknown"
  });
}

function processIdentityCheck(profile, runtime) {
  const identity = identityClass(runtime.identity);
  const required = profile !== "source";
  const ok = profile === "source"
    ? true
    : profile === "dependency-artifact"
      ? identity === "non_root"
      : identity === "root";
  return Object.freeze({ required, ok, identity });
}

function requiredToolsCheck(profile, runtime) {
  const required = REQUIRED_TOOLS[profile];
  const missing = required.filter((name) => runtime.tools?.[name] !== true);
  return Object.freeze({ required: true, ok: missing.length === 0, missing });
}

function capabilityCheck(profile, runtime) {
  const required = profile === "privileged-synthetic";
  const missing = required
    ? REQUIRED_CAPABILITIES.filter((name) => (
      runtime.capabilities?.effective?.[name] !== true
      || runtime.capabilities?.bounding?.[name] !== true
    ))
    : [];
  return Object.freeze({ required, ok: !required || missing.length === 0, missing });
}

function pidNamespaceCheck(profile, runtime) {
  const required = profile === "privileged-synthetic";
  const topology = runtime.pidNamespaceDepth === 1
    ? "single"
    : Number.isSafeInteger(runtime.pidNamespaceDepth) && runtime.pidNamespaceDepth > 1
      ? "nested"
      : "unavailable";
  return Object.freeze({ required, ok: !required || topology === "single", topology });
}

function nobodyCheck(profile, runtime) {
  const required = profile === "privileged-synthetic";
  const value = runtime.nobodyIdentity;
  const ok = !required || Boolean(
    value
    && Number.isSafeInteger(value.uid)
    && value.uid > 0
    && Number.isSafeInteger(value.gid)
    && value.gid > 0
  );
  return Object.freeze({ required, ok, available: ok && required });
}

export function inspectValidationEnvironment({ profile, runtime } = {}) {
  if (!PROFILES.has(profile) || !runtime || typeof runtime !== "object") {
    throw new TypeError("validation_profile_invalid");
  }

  const blockers = [];
  const platform = platformCheck(profile, runtime);
  if (platform.required && !platform.ok) makeBlocker(blockers, "unsupported_platform");

  const nodeRuntime = nodeRuntimeCheck(profile, runtime);
  if (!nodeRuntime.ok) makeBlocker(blockers, "node_runtime_mismatch");

  const polluted = pollutedEnvironment(runtime, profile);
  const nodeEnvironment = Object.freeze({
    required: true,
    ok: polluted.hardKeys.length === 0,
    detectedKeys: polluted.detectedKeys,
    warningKeys: polluted.warningKeys
  });
  if (!nodeEnvironment.ok) makeBlocker(blockers, "node_environment_polluted");

  const processIdentity = processIdentityCheck(profile, runtime);
  if (processIdentity.required && !processIdentity.ok) makeBlocker(blockers, "service_identity_invalid");

  const workspaceRequired = profile !== "source";
  const expectedLeafOwner = profile === "dependency-artifact"
    ? runtime.identity?.euid
    : undefined;
  const workspaceOwnerBound = profile !== "dependency-artifact" || Boolean(
    Number.isSafeInteger(expectedLeafOwner)
    && runtime.workspaceChain?.at(-1)?.uid === expectedLeafOwner
  );
  const workspaceModeOwnerOk = workspaceCustodyValid(runtime.workspaceChain, expectedLeafOwner);
  const normalizedWorkspaceExtended = normalizedWorkspaceExtendedCustody(runtime);
  const workspaceExtended = normalizedWorkspaceExtended.reason === WORKSPACE_EXTENDED_CUSTODY_ADVISORY_REASON
    && !workspaceModeOwnerOk
    ? Object.freeze({ ok: false, reason: "inspection_invalid", ancestorIndex: null })
    : normalizedWorkspaceExtended;
  const workspaceExtendedOk = workspaceExtended.ok;
  const workspaceOk = workspaceModeOwnerOk && workspaceExtendedOk;
  const workspaceCustody = Object.freeze({
    required: workspaceRequired,
    ok: workspaceOk,
    secure: workspaceOk,
    ownerBound: workspaceOwnerBound,
    modeOwner: workspaceModeOwnerOk,
    aclCapabilities: workspaceExtendedOk,
    aclCapabilitiesReason: workspaceExtended.reason,
    aclCapabilitiesAncestorIndex: workspaceExtended.ancestorIndex
  });
  if (workspaceRequired && !workspaceOk) makeBlocker(blockers, "workspace_custody_invalid");

  const requiredTools = requiredToolsCheck(profile, runtime);
  if (!requiredTools.ok) makeBlocker(blockers, "required_tool_missing");

  const privilegedCapabilities = capabilityCheck(profile, runtime);
  if (privilegedCapabilities.required && !privilegedCapabilities.ok) {
    makeBlocker(blockers, "privileged_capability_invalid");
  }

  const pidNamespace = pidNamespaceCheck(profile, runtime);
  if (pidNamespace.required && !pidNamespace.ok) makeBlocker(blockers, "pid_namespace_invalid");

  const servicePrincipal = nobodyCheck(profile, runtime);
  if (servicePrincipal.required && !servicePrincipal.ok) makeBlocker(blockers, "service_identity_invalid");

  const sourceFixture = Object.freeze({
    required: profile === "source",
    ok: profile !== "source" || runtime.sourceFixturePresent === true,
    present: runtime.sourceFixturePresent === true
  });
  if (sourceFixture.required && !sourceFixture.ok) makeBlocker(blockers, "source_fixture_missing");

  const protectedConfig = Object.freeze({
    required: false,
    ok: true,
    present: runtime.protectedConfigPresent === true
  });

  const ok = blockers.length === 0;
  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    type: TYPE,
    profile,
    state: ok ? "ready" : "blocked",
    ok,
    productionAuthority: false,
    mutation: false,
    checks: Object.freeze({
      platform,
      nodeRuntime,
      nodeEnvironment,
      processIdentity,
      workspaceCustody,
      requiredTools,
      privilegedCapabilities,
      pidNamespace,
      servicePrincipal,
      sourceFixture,
      protectedConfig
    }),
    blockers: Object.freeze(blockers)
  });
}

function executable(path) {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() && !stat.isSymbolicLink()) return false;
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function samePath(left, right, platform) {
  const normalizedLeft = resolve(left);
  const normalizedRight = resolve(right);
  return platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

export function isExecutableOnPath(
  command,
  { environment = process.env, platform = process.platform } = {}
) {
  if (!/^[a-z0-9_-]+$/iu.test(command || "")) return false;
  const pathValues = normalizedEnvironmentValues(environment, "PATH", { platform });
  if (pathValues.length !== 1) return false;
  const extensions = platform === "win32"
    ? normalizedEnvironmentValues(environment, "PATHEXT", { platform })
        .flatMap((value) => value.split(";"))
        .filter((value) => /^\.[a-z0-9]+$/iu.test(value))
    : [""];
  const candidates = extensions.length > 0 ? extensions : [".EXE", ".CMD", ".BAT", ".COM"];
  const separator = platform === "win32" ? ";" : ":";
  for (const rawDirectory of pathValues[0].split(separator)) {
    const directory = rawDirectory.replace(/^"|"$/gu, "");
    if (!directory) continue;
    for (const extension of candidates) {
      if (executable(resolve(directory, `${command}${extension}`))) return true;
    }
  }
  return false;
}

function workspaceChain(root) {
  const records = [];
  let current = resolve(root);
  while (true) {
    try {
      const stat = lstatSync(current);
      records.push(Object.freeze({
        kind: stat.isDirectory() ? "directory" : stat.isSymbolicLink() ? "symlink" : "other",
        mode: stat.mode & 0o777,
        uid: Number(stat.uid)
      }));
    } catch {
      records.push(Object.freeze({ kind: "missing", mode: -1, uid: -1 }));
      break;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return Object.freeze(records.reverse());
}

function workspaceAncestorPaths(root) {
  const paths = [];
  let current = resolve(root);
  while (true) {
    paths.push(current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return paths.reverse();
}

export function classifySecurityInspectionResult(result, kind) {
  const prefix = kind === "getfacl"
    ? "getfacl"
    : kind === "getcap"
      ? "getcap"
      : null;
  if (!prefix) throw new TypeError("security_inspection_kind_invalid");
  if (result?.error?.code === "ENOBUFS") return `${prefix}_output_limit`;
  if (!result || result.error) return `${prefix}_spawn_error`;
  if (result.status !== 0) return `${prefix}_status_error`;
  let stdout;
  let stderr;
  try {
    stdout = String(result.stdout || "").trim();
    stderr = String(result.stderr || "").trim();
  } catch {
    return `${prefix}_spawn_error`;
  }
  if (stderr) return `${prefix}_stderr`;
  if (!stdout) return "none";
  if (kind === "getfacl" && /^# flags: [s-][s-][t-]$/u.test(stdout)) {
    return "getfacl_special_flags";
  }
  return `${prefix}_finding`;
}

export function nonLeafAclFindingCoveredByModeCustody({
  reason,
  ancestorIndex,
  modeOwnerSecure
} = {}) {
  // Linux exposes an access ACL's effective mask through the group mode bits,
  // which workspaceCustodyValid already requires to be non-writable. A default
  // ACL on an existing ancestor does not propagate through the already-created
  // child chain. The leaf remains strict because it creates validation output.
  return reason === "getfacl_finding"
    && Number.isSafeInteger(ancestorIndex)
    && ancestorIndex > 0
    && ancestorIndex < MAX_WORKSPACE_ANCESTORS
    && modeOwnerSecure === true;
}

function workspaceExtendedCustodyResult(ok, reason, ancestorIndex = null) {
  return Object.freeze({ ok, reason, ancestorIndex });
}

function workspaceExtendedCustody(root, { modeOwnerSecure = false } = {}) {
  if (!executable(TOOL_PATHS.getfacl)) return workspaceExtendedCustodyResult(false, "getfacl_unavailable");
  if (!executable(TOOL_PATHS.getcap)) return workspaceExtendedCustodyResult(false, "getcap_unavailable");
  const environment = Object.freeze({ PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" });
  const paths = workspaceAncestorPaths(root);
  if (paths.length > MAX_WORKSPACE_ANCESTORS) {
    return workspaceExtendedCustodyResult(false, "ancestor_limit");
  }
  let closestCoveredAclIndex = null;
  for (let ancestorIndex = 0; ancestorIndex < paths.length; ancestorIndex += 1) {
    const path = paths[paths.length - ancestorIndex - 1];
    const acl = spawnSync(TOOL_PATHS.getfacl, [
      "--skip-base",
      "--numeric",
      "--no-effective",
      "--absolute-names",
      "--omit-header",
      "--physical",
      "--",
      path
    ], {
      encoding: "utf8",
      env: environment,
      maxBuffer: 64 * 1024,
      windowsHide: true
    });
    const aclReason = classifySecurityInspectionResult(acl, "getfacl");
    const aclCoveredByMode = nonLeafAclFindingCoveredByModeCustody({
      reason: aclReason,
      ancestorIndex,
      modeOwnerSecure
    });
    if (aclReason !== "none" && !aclCoveredByMode) {
      return workspaceExtendedCustodyResult(false, aclReason, ancestorIndex);
    }
    if (aclCoveredByMode && closestCoveredAclIndex === null) closestCoveredAclIndex = ancestorIndex;
    const capabilities = spawnSync(TOOL_PATHS.getcap, ["--", path], {
      encoding: "utf8",
      env: environment,
      maxBuffer: 64 * 1024,
      windowsHide: true
    });
    const capabilityReason = classifySecurityInspectionResult(capabilities, "getcap");
    if (capabilityReason !== "none") {
      return workspaceExtendedCustodyResult(false, capabilityReason, ancestorIndex);
    }
  }
  return closestCoveredAclIndex === null
    ? workspaceExtendedCustodyResult(true, "none")
    : workspaceExtendedCustodyResult(
      true,
      WORKSPACE_EXTENDED_CUSTODY_ADVISORY_REASON,
      closestCoveredAclIndex
    );
}

function filePresent(path) {
  try {
    const stat = lstatSync(path);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function packageNodeRange(root) {
  try {
    const parsed = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
    return parsed?.engines?.node;
  } catch {
    return null;
  }
}

function npmIdentity(environment, execPath, platform) {
  const npmPaths = normalizedEnvironmentValues(environment, "NPM_EXECPATH", {
    platform,
    posixAliases: ["npm_execpath"]
  });
  if (npmPaths.length !== 1 || !filePresent(npmPaths[0])) {
    return Object.freeze({ present: false, trusted: false, version: null });
  }
  let npmPath;
  let nodePath;
  try {
    npmPath = realpathSync(npmPaths[0]);
    nodePath = realpathSync(execPath);
  } catch {
    return Object.freeze({ present: true, trusted: false, version: null });
  }
  const nodeDirectory = dirname(nodePath);
  const expectedPaths = [
    resolve(nodeDirectory, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
    resolve(nodeDirectory, "node_modules", "npm", "bin", "npm-cli.js")
  ];
  if (!expectedPaths.some((expected) => samePath(npmPath, expected, platform))) {
    return Object.freeze({ present: true, trusted: false, version: null });
  }
  const packagePath = resolve(dirname(npmPath), "..", "package.json");
  if (!filePresent(packagePath)) {
    return Object.freeze({ present: true, trusted: false, version: null });
  }
  try {
    const parsed = JSON.parse(readFileSync(packagePath, "utf8"));
    const version = typeof parsed?.version === "string" ? parsed.version : null;
    return Object.freeze({
      present: true,
      trusted: parseVersion(version) !== null,
      version
    });
  } catch {
    return Object.freeze({ present: true, trusted: false, version: null });
  }
}

function glibcVersion() {
  try {
    return process.report?.getReport?.()?.header?.glibcVersionRuntime || null;
  } catch {
    return null;
  }
}

function capabilitySets() {
  let status = "";
  try {
    status = readFileSync("/proc/self/status", "utf8");
  } catch {
    return Object.freeze({
      effective: Object.freeze({ kill: false, setgid: false, setuid: false, setpcap: false }),
      bounding: Object.freeze({ kill: false, setgid: false, setuid: false, setpcap: false })
    });
  }
  const mask = (name) => {
    const match = new RegExp(`^${name}:\\s*([0-9a-f]+)$`, "imu").exec(status);
    return match ? BigInt(`0x${match[1]}`) : 0n;
  };
  const has = (value, bit) => (value & (1n << BigInt(bit))) !== 0n;
  const effective = mask("CapEff");
  const bounding = mask("CapBnd");
  return Object.freeze({
    effective: Object.freeze({
      kill: has(effective, 5),
      setgid: has(effective, 6),
      setuid: has(effective, 7),
      setpcap: has(effective, 8)
    }),
    bounding: Object.freeze({
      kill: has(bounding, 5),
      setgid: has(bounding, 6),
      setuid: has(bounding, 7),
      setpcap: has(bounding, 8)
    })
  });
}

function pidNamespaceDepth() {
  try {
    const status = readFileSync("/proc/self/status", "utf8");
    const match = /^NSpid:[ \t]*([0-9]+(?:[ \t]+[0-9]+)*)[ \t]*$/mu.exec(status);
    if (!match) return null;
    const values = match[1].trim().split(/\s+/u);
    return values.length > 0 && values.every((value) => /^[0-9]+$/u.test(value))
      ? values.length
      : null;
  } catch {
    return null;
  }
}

function nobodyIdentity() {
  try {
    const line = readFileSync("/etc/passwd", "utf8")
      .split(/\r?\n/u)
      .find((entry) => entry.startsWith("nobody:"));
    const fields = line?.split(":");
    const uid = Number(fields?.[2]);
    const gid = Number(fields?.[3]);
    if (!Number.isSafeInteger(uid) || !Number.isSafeInteger(gid)) return null;
    return Object.freeze({ uid, gid });
  } catch {
    return null;
  }
}

export function collectValidationEnvironmentRuntime({ root = REPOSITORY_ROOT } = {}) {
  const environment = { ...process.env };
  const npm = npmIdentity(environment, process.execPath, process.platform);
  const custodyChain = workspaceChain(root);
  const extendedCustody = workspaceExtendedCustody(root, {
    modeOwnerSecure: workspaceCustodyValid(custodyChain)
  });
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  const euid = process.geteuid?.();
  const egid = process.getegid?.();
  return Object.freeze({
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.versions.node,
    nodeModulesAbi: process.versions.modules,
    npmVersion: npm.version,
    npmTrusted: npm.trusted,
    glibcVersion: glibcVersion(),
    sourceNodeRange: packageNodeRange(root),
    identity: Object.freeze({ uid, gid, euid, egid }),
    environmentSignals: classifyValidationEnvironmentVariables(environment, { platform: process.platform }),
    workspaceChain: custodyChain,
    workspaceExtendedCustody: extendedCustody.ok,
    workspaceExtendedCustodyReason: extendedCustody.reason,
    workspaceExtendedCustodyAncestorIndex: extendedCustody.ancestorIndex,
    tools: Object.freeze({
      ...Object.fromEntries(Object.entries(TOOL_PATHS).map(([name, path]) => [name, executable(path)])),
      node: executable(process.execPath),
      npm: npm.present,
      git: executable(TOOL_PATHS.git)
        || isExecutableOnPath("git", { environment, platform: process.platform })
    }),
    capabilities: capabilitySets(),
    pidNamespaceDepth: pidNamespaceDepth(),
    nobodyIdentity: nobodyIdentity(),
    sourceFixturePresent: filePresent(resolve(root, "config/proxy-servers.vultr-multichannel.template.json"))
      && filePresent(resolve(root, "server/tests/fixtures/source-validation-empty.env.fixture")),
    protectedConfigPresent: filePresent(resolve(root, "config/proxy-servers.json"))
  });
}

function usageFailure(stderr) {
  stderr.write(`${JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    type: TYPE,
    state: "blocked",
    condition: "validation_profile_invalid",
    productionAuthority: false,
    mutation: false
  })}\n`);
  return 2;
}

export function runValidationEnvironmentPreflightCli({
  argv = process.argv.slice(2),
  runtime,
  stdout = process.stdout,
  stderr = process.stderr
} = {}) {
  if (!Array.isArray(argv) || argv.length !== 2 || argv[0] !== "--profile" || !PROFILES.has(argv[1])) {
    return usageFailure(stderr);
  }
  try {
    const report = inspectValidationEnvironment({
      profile: argv[1],
      runtime: runtime || collectValidationEnvironmentRuntime()
    });
    const line = `${JSON.stringify(report)}\n`;
    if (report.ok) {
      stdout.write(line);
      return 0;
    }
    stderr.write(line);
    return 1;
  } catch {
    stderr.write(`${JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      type: TYPE,
      state: "blocked",
      condition: "validation_environment_invalid",
      productionAuthority: false,
      mutation: false
    })}\n`);
    return 1;
  }
}

function isDirectExecution() {
  if (typeof process.argv[1] !== "string") return false;
  return pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
}

if (isDirectExecution()) {
  process.exitCode = runValidationEnvironmentPreflightCli();
}
