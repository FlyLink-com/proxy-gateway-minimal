#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  chownSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, isAbsolute, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RELEASE_UNIT = "control-plane-app";
const RELEASE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
const DEFAULT_RELATIVE_CONFIG = "config/proxy-servers.json";
const SAFE_CONDITIONS = new Set([
  "invalid_input",
  "release_boundary_invalid",
  "relative_config_invalid",
  "config_boundary_invalid",
  "manifest_boundary_invalid",
  "manifest_invalid",
  "config_identity_mismatch",
  "release_config_prepare_failed"
]);

class ReleaseConfigGateError extends Error {
  constructor(condition) {
    super(condition);
    this.condition = condition;
  }
}

function fail(condition) {
  throw new ReleaseConfigGateError(condition);
}

function comparablePath(value) {
  const absolute = resolve(value);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}

function isWithin(root, target) {
  const child = relative(root, target);
  return child !== "" && !child.startsWith("..") && !isAbsolute(child);
}

function releaseDirectory(value, { allowSymlink = false } = {}) {
  if (typeof value !== "string" || !isAbsolute(value)) {
    fail("release_boundary_invalid");
  }

  let lexicalMetadata;
  let realPath;
  try {
    lexicalMetadata = lstatSync(value);
    realPath = realpathSync(value);
  } catch {
    fail("release_boundary_invalid");
  }

  if (
    (!allowSymlink && lexicalMetadata.isSymbolicLink())
    || (!lexicalMetadata.isDirectory() && !lexicalMetadata.isSymbolicLink())
    || !statSync(realPath).isDirectory()
    || !RELEASE_PATTERN.test(basename(realPath))
  ) {
    fail("release_boundary_invalid");
  }

  return { path: realPath, release: basename(realPath) };
}

function normalizedRelativeConfig(value) {
  const raw = String(value ?? "").trim();
  if (
    !raw
    || raw.includes("\\")
    || isAbsolute(raw)
    || raw.startsWith("/")
    || raw === "."
    || raw === ".."
    || raw.startsWith("../")
    || posix.normalize(raw) !== raw
  ) {
    fail("relative_config_invalid");
  }
  return raw;
}

function configFile(releaseRoot, relativeConfig) {
  const path = resolve(releaseRoot.path, ...relativeConfig.split("/"));
  if (!isWithin(releaseRoot.path, path)) fail("config_boundary_invalid");

  let metadata;
  let parentRealPath;
  try {
    metadata = lstatSync(path);
    parentRealPath = realpathSync(dirname(path));
  } catch {
    fail("config_boundary_invalid");
  }

  if (
    metadata.isSymbolicLink()
    || !metadata.isFile()
    || comparablePath(parentRealPath) !== comparablePath(dirname(path))
    || !isWithin(releaseRoot.path, parentRealPath)
  ) {
    fail("config_boundary_invalid");
  }

  return path;
}

function manifestPath(value, { mustExist = false, mustBeAbsent = false } = {}) {
  if (typeof value !== "string" || !isAbsolute(value)) {
    fail("manifest_boundary_invalid");
  }

  const path = resolve(value);
  if (existsSync(path)) {
    const metadata = lstatSync(path);
    if (metadata.isSymbolicLink() || !metadata.isFile() || mustBeAbsent) {
      fail("manifest_boundary_invalid");
    }
  } else if (mustExist) {
    fail("manifest_invalid");
  }
  return path;
}

function modeString(mode) {
  return (mode & 0o777).toString(8).padStart(4, "0");
}

function fileIdentity(path, { includeBytes = false } = {}) {
  const bytes = readFileSync(path);
  const metadata = statSync(path);
  return {
    ...(includeBytes ? { bytes } : {}),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sizeBytes: metadata.size,
    mode: modeString(metadata.mode),
    uid: metadata.uid,
    gid: metadata.gid
  };
}

function configIdentitiesMatch(left, right) {
  return left.sha256 === right.sha256
    && left.sizeBytes === right.sizeBytes
    && left.mode === right.mode
    && (process.platform === "win32" || (left.uid === right.uid && left.gid === right.gid));
}

function manifestIdentityMatches(identity, overlay) {
  return identity.sha256 === overlay.sha256
    && identity.sizeBytes === overlay.sizeBytes
    && identity.mode === overlay.mode;
}

function createdAtValue(value) {
  const parsed = new Date(value || new Date().toISOString());
  if (Number.isNaN(parsed.getTime())) fail("invalid_input");
  return parsed.toISOString();
}

function releaseContext({
  activeReleasePath,
  candidateReleasePath,
  relativeConfigPath,
  outputManifestPath,
  manifestMustExist = false,
  manifestMustBeAbsent = false
}) {
  const activeRoot = releaseDirectory(activeReleasePath, { allowSymlink: true });
  const candidateRoot = releaseDirectory(candidateReleasePath);
  if (comparablePath(activeRoot.path) === comparablePath(candidateRoot.path)) {
    fail("release_boundary_invalid");
  }

  const relativeConfig = normalizedRelativeConfig(
    relativeConfigPath || DEFAULT_RELATIVE_CONFIG
  );
  const activeConfig = configFile(activeRoot, relativeConfig);
  const candidateConfig = configFile(candidateRoot, relativeConfig);
  const assemblyManifest = manifestPath(outputManifestPath, {
    mustExist: manifestMustExist,
    mustBeAbsent: manifestMustBeAbsent
  });

  if (
    comparablePath(assemblyManifest) === comparablePath(activeConfig)
    || comparablePath(assemblyManifest) === comparablePath(candidateConfig)
    || isWithin(activeRoot.path, assemblyManifest)
    || isWithin(candidateRoot.path, assemblyManifest)
  ) {
    fail("manifest_boundary_invalid");
  }

  return {
    activeRoot,
    candidateRoot,
    activeRelease: activeRoot.release,
    candidateRelease: candidateRoot.release,
    relativeConfig,
    activeConfig,
    candidateConfig,
    manifestPath: assemblyManifest
  };
}

function manifestShape(context, identity, createdAt) {
  return {
    schemaVersion: "1",
    type: "control_plane_release_assembly",
    releaseUnit: RELEASE_UNIT,
    activeRelease: context.activeRelease,
    candidateRelease: context.candidateRelease,
    createdAt,
    protectedOverlays: [{
      relativePath: context.relativeConfig,
      sha256: identity.sha256,
      sizeBytes: identity.sizeBytes,
      mode: identity.mode
    }]
  };
}

function safeReport(context, { state, applied, candidateMatches }) {
  return {
    schemaVersion: "1",
    type: "control_plane_release_config_gate",
    state,
    applied,
    releaseUnit: RELEASE_UNIT,
    activeRelease: context.activeRelease,
    candidateRelease: context.candidateRelease,
    relativeConfig: context.relativeConfig,
    candidateMatches
  };
}

function temporaryPath(path, label) {
  return resolve(dirname(path), `.${basename(path)}.${label}.${process.pid}.${randomUUID()}`);
}

function writeProtectedFile(path, bytes, { mode, uid, gid }) {
  const descriptor = openSync(path, "wx", mode);
  try {
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }

  if (process.platform !== "win32") chownSync(path, uid, gid);
  chmodSync(path, mode);
}

function attemptCleanup(operation) {
  try {
    operation();
    return true;
  } catch {
    return false;
  }
}

function validateManifestShape(manifest, context) {
  const overlay = Array.isArray(manifest?.protectedOverlays)
    && manifest.protectedOverlays.length === 1
    ? manifest.protectedOverlays[0]
    : null;
  const createdAt = typeof manifest?.createdAt === "string"
    ? new Date(manifest.createdAt)
    : null;

  if (
    manifest?.schemaVersion !== "1"
    || manifest?.type !== "control_plane_release_assembly"
    || manifest?.releaseUnit !== RELEASE_UNIT
    || manifest?.activeRelease !== context.activeRelease
    || manifest?.candidateRelease !== context.candidateRelease
    || !createdAt
    || Number.isNaN(createdAt.getTime())
    || createdAt.toISOString() !== manifest.createdAt
    || overlay?.relativePath !== context.relativeConfig
    || !/^[a-f0-9]{64}$/.test(String(overlay?.sha256 ?? ""))
    || !Number.isSafeInteger(overlay?.sizeBytes)
    || overlay.sizeBytes < 0
    || !/^0[0-7]{3}$/.test(String(overlay?.mode ?? ""))
  ) {
    fail("manifest_invalid");
  }
  return overlay;
}

function readAssemblyManifest(path) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    fail("manifest_invalid");
  }
  if (process.platform !== "win32" && (statSync(path).mode & 0o777) !== 0o600) {
    fail("manifest_boundary_invalid");
  }
  return manifest;
}

export function prepareReleaseConfigOverlay({
  activeReleasePath,
  candidateReleasePath,
  relativeConfigPath = DEFAULT_RELATIVE_CONFIG,
  manifestPath: outputManifestPath,
  apply = false,
  createdAt
} = {}) {
  const context = releaseContext({
    activeReleasePath,
    candidateReleasePath,
    relativeConfigPath,
    outputManifestPath,
    manifestMustBeAbsent: apply
  });
  const activeIdentity = fileIdentity(context.activeConfig, { includeBytes: true });
  const candidateIdentity = fileIdentity(context.candidateConfig);

  if (!apply) {
    return safeReport(context, {
      state: "ready",
      applied: false,
      candidateMatches: configIdentitiesMatch(activeIdentity, candidateIdentity)
    });
  }

  const manifest = manifestShape(context, activeIdentity, createdAtValue(createdAt));
  const manifestParent = dirname(context.manifestPath);
  const candidateTemp = temporaryPath(context.candidateConfig, "overlay");
  const candidateBackup = temporaryPath(context.candidateConfig, "original");
  const manifestTemp = temporaryPath(context.manifestPath, "manifest");
  let originalMoved = false;
  let overlayPublished = false;
  let manifestPublished = false;

  mkdirSync(manifestParent, { recursive: true, mode: 0o700 });
  if (comparablePath(realpathSync(manifestParent)) !== comparablePath(manifestParent)) {
    fail("manifest_boundary_invalid");
  }

  try {
    writeProtectedFile(candidateTemp, activeIdentity.bytes, {
      mode: Number.parseInt(activeIdentity.mode, 8),
      uid: activeIdentity.uid,
      gid: activeIdentity.gid
    });
    writeProtectedFile(
      manifestTemp,
      Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
      { mode: 0o600, uid: activeIdentity.uid, gid: activeIdentity.gid }
    );

    renameSync(context.candidateConfig, candidateBackup);
    originalMoved = true;
    renameSync(candidateTemp, context.candidateConfig);
    overlayPublished = true;
    renameSync(manifestTemp, context.manifestPath);
    manifestPublished = true;

    const preparedIdentity = fileIdentity(context.candidateConfig);
    if (!configIdentitiesMatch(activeIdentity, preparedIdentity)) {
      fail("config_identity_mismatch");
    }

    rmSync(candidateBackup, { force: true });
  } catch (error) {
    let rollbackComplete = true;
    if (overlayPublished && existsSync(context.candidateConfig)) {
      rollbackComplete = attemptCleanup(() => {
        rmSync(context.candidateConfig, { force: true });
      }) && rollbackComplete;
    }
    if (originalMoved) {
      rollbackComplete = existsSync(candidateBackup)
        && attemptCleanup(() => {
          renameSync(candidateBackup, context.candidateConfig);
        })
        && rollbackComplete;
    }
    if (manifestPublished) {
      rollbackComplete = attemptCleanup(() => {
        rmSync(context.manifestPath, { force: true });
      }) && rollbackComplete;
    }
    rollbackComplete = attemptCleanup(() => {
      rmSync(candidateTemp, { force: true });
    }) && rollbackComplete;
    rollbackComplete = attemptCleanup(() => {
      rmSync(manifestTemp, { force: true });
    }) && rollbackComplete;
    if (!rollbackComplete) fail("release_config_prepare_failed");
    if (error instanceof ReleaseConfigGateError) throw error;
    fail("release_config_prepare_failed");
  }

  return safeReport(context, {
    state: "prepared",
    applied: true,
    candidateMatches: true
  });
}

export function verifyReleaseConfigOverlay({
  activeReleasePath,
  candidateReleasePath,
  relativeConfigPath = DEFAULT_RELATIVE_CONFIG,
  manifestPath: outputManifestPath
} = {}) {
  const context = releaseContext({
    activeReleasePath,
    candidateReleasePath,
    relativeConfigPath,
    outputManifestPath,
    manifestMustExist: true
  });
  const manifest = readAssemblyManifest(context.manifestPath);
  const overlay = validateManifestShape(manifest, context);
  const activeIdentity = fileIdentity(context.activeConfig);
  const candidateIdentity = fileIdentity(context.candidateConfig);

  if (
    !configIdentitiesMatch(activeIdentity, candidateIdentity)
    || !manifestIdentityMatches(activeIdentity, overlay)
  ) {
    fail("config_identity_mismatch");
  }

  return safeReport(context, {
    state: "verified",
    applied: false,
    candidateMatches: true
  });
}

function parseCliArgs(argv) {
  const values = new Map();
  let apply = false;
  const valueOptions = new Set([
    "--mode",
    "--active-release",
    "--candidate-release",
    "--relative-config",
    "--manifest",
    "--created-at"
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--apply") {
      if (apply) fail("invalid_input");
      apply = true;
      continue;
    }

    const equalsIndex = item.indexOf("=");
    const option = equalsIndex >= 0 ? item.slice(0, equalsIndex) : item;
    if (!valueOptions.has(option)) fail("invalid_input");
    const value = equalsIndex >= 0 ? item.slice(equalsIndex + 1) : argv[++index];
    if (typeof value !== "string" || !value || value.startsWith("--")) {
      fail("invalid_input");
    }
    values.set(option, value);
  }

  const mode = values.get("--mode");
  if (!mode || !values.get("--active-release") || !values.get("--candidate-release") || !values.get("--manifest")) {
    fail("invalid_input");
  }
  if (!values.has("--relative-config")) values.set("--relative-config", DEFAULT_RELATIVE_CONFIG);
  if ((mode !== "prepare" && mode !== "verify") || (mode === "verify" && (apply || values.has("--created-at")))) {
    fail("invalid_input");
  }

  return {
    mode,
    apply,
    activeReleasePath: values.get("--active-release"),
    candidateReleasePath: values.get("--candidate-release"),
    relativeConfigPath: values.get("--relative-config"),
    manifestPath: values.get("--manifest"),
    createdAt: values.get("--created-at")
  };
}

export function runReleaseConfigGateCli({
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr
} = {}) {
  try {
    const options = parseCliArgs(argv);
    const report = options.mode === "prepare"
      ? prepareReleaseConfigOverlay(options)
      : verifyReleaseConfigOverlay(options);
    stdout.write(`${JSON.stringify(report)}\n`);
    return 0;
  } catch (error) {
    const condition = error instanceof ReleaseConfigGateError
      && SAFE_CONDITIONS.has(error.condition)
      ? error.condition
      : "release_config_gate_failed";
    stderr.write(`${JSON.stringify({
      schemaVersion: "1",
      type: "control_plane_release_config_gate",
      state: "blocked",
      condition
    })}\n`);
    return 1;
  }
}

function isDirectInvocation() {
  if (!process.argv[1]) return false;
  return comparablePath(process.argv[1]) === comparablePath(fileURLToPath(import.meta.url));
}

if (isDirectInvocation()) {
  process.exitCode = runReleaseConfigGateCli();
}
