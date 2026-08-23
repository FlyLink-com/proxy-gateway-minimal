#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fchmodSync,
  fchownSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, isAbsolute, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RELEASE_UNIT = "control-plane-app";
const PRODUCTION_ROOT = "/opt/proxy-gateway-minimal-candidate";
const RELEASE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
const DEFAULT_RELATIVE_CONFIG = "config/proxy-servers.json";
const PROTECTED_RELATIVE_PATHS = Object.freeze([
  DEFAULT_RELATIVE_CONFIG,
  ".env"
]);
const TEST_RUNTIME = Symbol("release-config-gate-test-runtime");
const SAFE_CONDITIONS = new Set([
  "invalid_input",
  "release_boundary_invalid",
  "relative_config_invalid",
  "config_boundary_invalid",
  "manifest_boundary_invalid",
  "manifest_invalid",
  "config_identity_mismatch",
  "candidate_protected_file_present",
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

function isWithinOrSame(root, target) {
  return comparablePath(root) === comparablePath(target) || isWithin(root, target);
}

function releaseDirectory(value, { allowSymlink = false } = {}) {
  if (typeof value !== "string" || !isAbsolute(value)) {
    fail("release_boundary_invalid");
  }

  const lexicalPath = resolve(value);
  let lexicalMetadata;
  let realPath;
  try {
    lexicalMetadata = lstatSync(lexicalPath);
    realPath = realpathSync(lexicalPath);
  } catch {
    fail("release_boundary_invalid");
  }

  if (
    (!allowSymlink && (
      lexicalMetadata.isSymbolicLink()
      || !lexicalMetadata.isDirectory()
      || comparablePath(lexicalPath) !== comparablePath(realPath)
    ))
    || (allowSymlink && !lexicalMetadata.isDirectory() && !lexicalMetadata.isSymbolicLink())
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

function protectedFile(releaseRoot, relativePath, { allowMissing = false } = {}) {
  const path = resolve(releaseRoot.path, ...relativePath.split("/"));
  if (!isWithin(releaseRoot.path, path)) fail("config_boundary_invalid");

  const parentPath = dirname(path);
  let parentMetadata;
  let parentRealPath;
  try {
    parentMetadata = lstatSync(parentPath);
    parentRealPath = realpathSync(parentPath);
  } catch {
    fail("config_boundary_invalid");
  }

  if (
    parentMetadata.isSymbolicLink()
    || !parentMetadata.isDirectory()
    || comparablePath(parentRealPath) !== comparablePath(parentPath)
    || !isWithinOrSame(releaseRoot.path, parentRealPath)
  ) {
    fail("config_boundary_invalid");
  }

  let metadata;
  try {
    metadata = lstatSync(path);
  } catch (error) {
    if (allowMissing && error?.code === "ENOENT") return { path, exists: false };
    fail("config_boundary_invalid");
  }

  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    fail("config_boundary_invalid");
  }

  return { path, exists: true };
}

function manifestPath(value, { mustExist = false, mustBeAbsent = false } = {}) {
  if (typeof value !== "string" || !isAbsolute(value)) {
    fail("manifest_boundary_invalid");
  }

  const path = resolve(value);
  const parentPath = dirname(path);
  if (existsSync(parentPath)) {
    let parentMetadata;
    let parentRealPath;
    try {
      parentMetadata = lstatSync(parentPath);
      parentRealPath = realpathSync(parentPath);
    } catch {
      fail("manifest_boundary_invalid");
    }
    if (
      parentMetadata.isSymbolicLink()
      || !parentMetadata.isDirectory()
      || comparablePath(parentRealPath) !== comparablePath(parentPath)
    ) {
      fail("manifest_boundary_invalid");
    }
  }
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
  runtimeValue,
  manifestMustExist = false,
  manifestMustBeAbsent = false,
  candidateFilesMayBeMissing = false
}) {
  const activeRoot = releaseDirectory(activeReleasePath, { allowSymlink: true });
  const candidateRoot = releaseDirectory(candidateReleasePath);
  if (comparablePath(activeRoot.path) === comparablePath(candidateRoot.path)) {
    fail("release_boundary_invalid");
  }

  const relativeConfig = normalizedRelativeConfig(
    relativeConfigPath || DEFAULT_RELATIVE_CONFIG
  );
  if (relativeConfig !== DEFAULT_RELATIVE_CONFIG) fail("relative_config_invalid");
  const protectedFiles = PROTECTED_RELATIVE_PATHS.map((relativePath) => ({
    relativePath,
    active: protectedFile(activeRoot, relativePath),
    candidate: protectedFile(candidateRoot, relativePath, {
      allowMissing: candidateFilesMayBeMissing
    })
  }));
  const assemblyManifest = manifestPath(outputManifestPath, {
    mustExist: manifestMustExist,
    mustBeAbsent: manifestMustBeAbsent
  });

  if (isWithin(activeRoot.path, assemblyManifest) || isWithin(candidateRoot.path, assemblyManifest)) {
    fail("manifest_boundary_invalid");
  }
  for (const protectedFilePath of protectedFiles) {
    if (
      comparablePath(assemblyManifest) === comparablePath(protectedFilePath.active.path)
      || comparablePath(assemblyManifest) === comparablePath(protectedFilePath.candidate.path)
    ) {
      fail("manifest_boundary_invalid");
    }
  }

  const productionTopology = runtimeValue.enforceProductionTopology
    ? validateProductionTopology({
        activeReleasePath,
        candidateReleasePath,
        outputManifestPath,
        activeRoot,
        candidateRoot,
        protectedFiles
      }, runtimeValue)
    : null;

  return {
    activeRoot,
    candidateRoot,
    activeRelease: activeRoot.release,
    candidateRelease: candidateRoot.release,
    relativeConfig,
    protectedFiles,
    manifestPath: assemblyManifest,
    productionTopology
  };
}

function manifestShape(context, protectedIdentities, createdAt) {
  return {
    schemaVersion: "1",
    type: "control_plane_release_assembly",
    releaseUnit: RELEASE_UNIT,
    activeRelease: context.activeRelease,
    candidateRelease: context.candidateRelease,
    createdAt,
    protectedOverlays: protectedIdentities.map(({ relativePath, activeIdentity }) => ({
      relativePath,
      sha256: activeIdentity.sha256,
      sizeBytes: activeIdentity.sizeBytes,
      mode: activeIdentity.mode
    }))
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
    protectedRelativePaths: context.protectedFiles.map(({ relativePath }) => relativePath),
    candidateMatches,
    candidateFilesPresent: context.protectedFiles.every(({ candidate }) => candidate.exists)
  };
}

function temporaryPath(path, label) {
  return resolve(dirname(path), `.${basename(path)}.${label}.${process.pid}.${randomUUID()}`);
}

function defaultDirectoryFsync(path) {
  if (process.platform === "win32") return;
  const descriptor = openSync(path, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function runtime(value = {}) {
  return Object.freeze({
    root: value.root ?? PRODUCTION_ROOT,
    enforceProductionTopology: value.enforceProductionTopology ?? true,
    enforceOwnership: value.enforceOwnership ?? true,
    enforceModes: value.enforceModes ?? true,
    applyOwnership: value.applyOwnership ?? process.platform !== "win32",
    chownFile: value.chownFile ?? fchownSync,
    fsyncFile: value.fsyncFile ?? ((descriptor) => fsyncSync(descriptor)),
    fsyncDirectory: value.fsyncDirectory ?? defaultDirectoryFsync,
    modeFor: value.modeFor,
    ownerFor: value.ownerFor,
    observe: value.observe ?? (() => {}),
    [TEST_RUNTIME]: value[TEST_RUNTIME] === true
  });
}

export function createReleaseConfigGateTestRuntime(overrides = {}) {
  return runtime({
    enforceProductionTopology: false,
    enforceOwnership: false,
    enforceModes: false,
    applyOwnership: false,
    ...overrides,
    [TEST_RUNTIME]: true
  });
}

function selectedRuntime(supplied) {
  if (supplied === undefined) {
    if (process.platform !== "linux" || process.getuid?.() !== 0) {
      fail("release_boundary_invalid");
    }
    return runtime();
  }
  if (!supplied?.[TEST_RUNTIME]) fail("invalid_input");
  return supplied;
}

function topologyMode(path, metadata, runtimeValue, condition) {
  let value;
  try {
    value = typeof runtimeValue.modeFor === "function"
      ? runtimeValue.modeFor(path, metadata)
      : metadata.mode & 0o7777;
  } catch {
    fail(condition);
  }
  if (!Number.isInteger(value) || value < 0 || value > 0o7777) fail(condition);
  return value;
}

function topologyOwner(path, metadata, runtimeValue, condition) {
  let value;
  try {
    value = typeof runtimeValue.ownerFor === "function"
      ? runtimeValue.ownerFor(path, metadata)
      : { uid: metadata.uid, gid: metadata.gid };
  } catch {
    fail(condition);
  }
  if (!value || !Number.isInteger(value.uid) || !Number.isInteger(value.gid)) fail(condition);
  return value;
}

function topologyDirectory(path, runtimeValue, condition, { exactMode } = {}) {
  const lexical = resolve(path);
  let metadata;
  let physical;
  try {
    metadata = lstatSync(lexical);
    physical = realpathSync(lexical);
  } catch {
    fail(condition);
  }
  if (
    metadata.isSymbolicLink()
    || !metadata.isDirectory()
    || comparablePath(lexical) !== comparablePath(physical)
  ) {
    fail(condition);
  }
  const mode = topologyMode(lexical, metadata, runtimeValue, condition);
  const owner = topologyOwner(lexical, metadata, runtimeValue, condition);
  if (
    (runtimeValue.enforceOwnership && owner.uid !== 0)
    || (runtimeValue.enforceModes && (mode & 0o022) !== 0)
    || (exactMode !== undefined && runtimeValue.enforceModes && (mode & 0o777) !== exactMode)
  ) {
    fail(condition);
  }
  return Object.freeze({ path: physical, identity: nodeIdentity(metadata) });
}

function topologySymlink(path, runtimeValue, condition) {
  const lexical = resolve(path);
  let metadata;
  let targetText;
  let targetPath;
  let targetMetadata;
  try {
    metadata = lstatSync(lexical);
    targetText = readlinkSync(lexical);
    targetPath = realpathSync(lexical);
    targetMetadata = lstatSync(targetPath);
  } catch {
    fail(condition);
  }
  const owner = topologyOwner(lexical, metadata, runtimeValue, condition);
  if (
    !metadata.isSymbolicLink()
    || !targetMetadata.isDirectory()
    || (runtimeValue.enforceOwnership && owner.uid !== 0)
  ) {
    fail(condition);
  }
  return Object.freeze({
    path: lexical,
    identity: nodeIdentity(metadata),
    targetText,
    targetPath,
    targetIdentity: nodeIdentity(targetMetadata)
  });
}

function directChild(parent, child) {
  return dirname(child) === parent && isWithin(parent, child);
}

function validateProductionTopology({
  activeReleasePath,
  candidateReleasePath,
  outputManifestPath,
  activeRoot,
  candidateRoot,
  protectedFiles
}, runtimeValue) {
  if (typeof runtimeValue.root !== "string" || !isAbsolute(runtimeValue.root)) {
    fail("release_boundary_invalid");
  }
  const rootPath = resolve(runtimeValue.root);
  const root = topologyDirectory(rootPath, runtimeValue, "release_boundary_invalid");
  if (comparablePath(root.path) !== comparablePath(rootPath)) fail("release_boundary_invalid");

  if (comparablePath(rootPath) === comparablePath(PRODUCTION_ROOT)) {
    topologyDirectory(dirname(rootPath), runtimeValue, "release_boundary_invalid");
  }

  const releases = topologyDirectory(
    resolve(rootPath, "releases"),
    runtimeValue,
    "release_boundary_invalid"
  );
  const currentPath = resolve(rootPath, "current");
  if (comparablePath(resolve(activeReleasePath)) !== comparablePath(currentPath)) {
    fail("release_boundary_invalid");
  }
  const current = topologySymlink(currentPath, runtimeValue, "release_boundary_invalid");
  if (
    !directChild(releases.path, current.targetPath)
    || comparablePath(current.targetPath) !== comparablePath(activeRoot.path)
  ) {
    fail("release_boundary_invalid");
  }
  const active = topologyDirectory(activeRoot.path, runtimeValue, "release_boundary_invalid");
  if (!sameNode(active.identity, current.targetIdentity)) fail("release_boundary_invalid");

  if (
    comparablePath(resolve(candidateReleasePath)) !== comparablePath(candidateRoot.path)
    || !directChild(releases.path, candidateRoot.path)
  ) {
    fail("release_boundary_invalid");
  }
  const candidate = topologyDirectory(candidateRoot.path, runtimeValue, "release_boundary_invalid");
  for (const item of protectedFiles) {
    topologyDirectory(dirname(item.active.path), runtimeValue, "config_boundary_invalid");
    topologyDirectory(dirname(item.candidate.path), runtimeValue, "config_boundary_invalid");
  }

  const assemblyRoot = topologyDirectory(
    resolve(rootPath, "assembly-receipts"),
    runtimeValue,
    "manifest_boundary_invalid",
    { exactMode: 0o700 }
  );
  const candidateAssembly = topologyDirectory(
    resolve(assemblyRoot.path, candidateRoot.release),
    runtimeValue,
    "manifest_boundary_invalid",
    { exactMode: 0o700 }
  );
  if (!directChild(assemblyRoot.path, candidateAssembly.path)) fail("manifest_boundary_invalid");
  const expectedManifest = resolve(candidateAssembly.path, "release-assembly.json");
  if (comparablePath(resolve(outputManifestPath)) !== comparablePath(expectedManifest)) {
    fail("manifest_boundary_invalid");
  }

  return Object.freeze({ root, releases, active, candidate, assemblyRoot, candidateAssembly, current });
}

function assertCurrentStable(topology, runtimeValue) {
  if (!topology) return;
  const observed = topologySymlink(topology.current.path, runtimeValue, "release_boundary_invalid");
  if (
    !sameNode(topology.current.identity, observed.identity)
    || topology.current.targetText !== observed.targetText
    || comparablePath(topology.current.targetPath) !== comparablePath(observed.targetPath)
    || !sameNode(topology.current.targetIdentity, observed.targetIdentity)
  ) {
    fail("release_boundary_invalid");
  }
  for (const item of [
    topology.root,
    topology.releases,
    topology.active,
    topology.candidate,
    topology.assemblyRoot,
    topology.candidateAssembly
  ]) {
    const observedDirectory = topologyDirectory(item.path, runtimeValue, "release_boundary_invalid");
    if (!sameNode(item.identity, observedDirectory.identity)) fail("release_boundary_invalid");
  }
}

function observe(runtimeValue, event) {
  runtimeValue.observe(Object.freeze(event));
}

function nodeIdentity(metadata) {
  return Object.freeze({ dev: String(metadata.dev), ino: String(metadata.ino) });
}

function sameNode(left, right) {
  return left?.dev === right?.dev && left?.ino === right?.ino;
}

function stableDirectoryIdentity(path, condition) {
  let metadata;
  let physical;
  try {
    metadata = lstatSync(path);
    physical = realpathSync(path);
  } catch {
    fail(condition);
  }
  if (
    metadata.isSymbolicLink()
    || !metadata.isDirectory()
    || comparablePath(path) !== comparablePath(physical)
  ) {
    fail(condition);
  }
  return nodeIdentity(metadata);
}

function syncDirectory(path, runtimeValue, condition) {
  const before = stableDirectoryIdentity(path, condition);
  try {
    runtimeValue.fsyncDirectory(path);
  } catch {
    fail("release_config_prepare_failed");
  }
  const after = stableDirectoryIdentity(path, condition);
  if (!sameNode(before, after)) fail("release_config_prepare_failed");
  observe(runtimeValue, { type: "directory_fsync", path });
}

function ensureDurableDirectory(path, runtimeValue, condition) {
  const missing = [];
  let cursor = path;
  while (true) {
    try {
      stableDirectoryIdentity(cursor, condition);
      break;
    } catch (error) {
      if (!(error instanceof ReleaseConfigGateError) || error.condition !== condition) throw error;
      try {
        lstatSync(cursor);
        throw error;
      } catch (metadataError) {
        if (metadataError?.code !== "ENOENT") throw error;
      }
      missing.push(cursor);
      const parent = dirname(cursor);
      if (comparablePath(parent) === comparablePath(cursor)) fail(condition);
      cursor = parent;
    }
  }

  for (const directory of missing.reverse()) {
    try {
      mkdirSync(directory, { mode: 0o700 });
      chmodSync(directory, 0o700);
    } catch {
      fail("release_config_prepare_failed");
    }
    observe(runtimeValue, { type: "mkdir", path: directory });
    stableDirectoryIdentity(directory, condition);
    syncDirectory(directory, runtimeValue, condition);
    syncDirectory(dirname(directory), runtimeValue, condition);
  }
  syncDirectory(path, runtimeValue, condition);
}

function writeProtectedFile(path, bytes, { mode, uid, gid }, runtimeValue, ownershipRecord) {
  let descriptor;
  let identity;
  try {
    descriptor = openSync(path, "wx", mode);
    const opened = fstatSync(descriptor);
    identity = nodeIdentity(opened);
    ownershipRecord.temporaryIdentity = identity;
    writeFileSync(descriptor, bytes);
    runtimeValue.fsyncFile(descriptor, { phase: "data", path });
    observe(runtimeValue, { type: "file_data_fsync", path });

    if (runtimeValue.applyOwnership) {
      runtimeValue.chownFile(descriptor, uid, gid);
      observe(runtimeValue, { type: "chown", path });
    }
    fchmodSync(descriptor, mode);
    observe(runtimeValue, { type: "chmod", path });

    const lexical = lstatSync(path);
    const finalDescriptor = fstatSync(descriptor);
    if (
      lexical.isSymbolicLink()
      || !lexical.isFile()
      || lexical.nlink !== 1
      || !sameNode(identity, nodeIdentity(lexical))
      || !sameNode(identity, nodeIdentity(finalDescriptor))
      || finalDescriptor.size !== bytes.length
      || (process.platform !== "win32" && (
        (finalDescriptor.mode & 0o777) !== mode
        || finalDescriptor.uid !== uid
        || finalDescriptor.gid !== gid
      ))
    ) {
      fail("release_config_prepare_failed");
    }
    runtimeValue.fsyncFile(descriptor, { phase: "final", path });
    observe(runtimeValue, { type: "file_final_fsync", path });
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }

  return identity;
}

function removeFileDurably(path, parent, runtimeValue, expectedIdentity) {
  let metadata;
  try {
    metadata = lstatSync(path);
  } catch (error) {
    return error?.code === "ENOENT";
  }
  if (!expectedIdentity) return false;
  if (
    metadata.isSymbolicLink()
    || !metadata.isFile()
    || !sameNode(expectedIdentity, nodeIdentity(metadata))
  ) {
    return false;
  }
  try {
    unlinkSync(path);
    observe(runtimeValue, { type: "cleanup_unlink", path });
    syncDirectory(parent, runtimeValue, "release_config_prepare_failed");
  } catch {
    return false;
  }
  try {
    lstatSync(path);
    return false;
  } catch (error) {
    return error?.code === "ENOENT";
  }
}

function publishNewFile(
  temporary,
  destination,
  existsCondition,
  runtimeValue,
  expectedIdentity,
  boundaryCondition
) {
  let linked = false;
  try {
    linkSync(temporary, destination);
    linked = true;
    observe(runtimeValue, { type: "link", path: temporary, destination });
    const linkedMetadata = lstatSync(destination);
    if (!linkedMetadata.isFile() || !sameNode(expectedIdentity, nodeIdentity(linkedMetadata))) {
      fail("release_config_prepare_failed");
    }
    syncDirectory(dirname(destination), runtimeValue, boundaryCondition);
    unlinkSync(temporary);
    observe(runtimeValue, { type: "unlink", path: temporary });
    syncDirectory(dirname(temporary), runtimeValue, boundaryCondition);
    const publishedMetadata = lstatSync(destination);
    if (
      publishedMetadata.isSymbolicLink()
      || !publishedMetadata.isFile()
      || publishedMetadata.nlink !== 1
      || !sameNode(expectedIdentity, nodeIdentity(publishedMetadata))
    ) {
      fail("release_config_prepare_failed");
    }
  } catch (error) {
    if (error?.code === "EEXIST") fail(existsCondition);
    if (linked && !removeFileDurably(
      destination,
      dirname(destination),
      runtimeValue,
      expectedIdentity
    )) {
      fail("release_config_prepare_failed");
    }
    throw error;
  }
}

function validateManifestShape(manifest, context) {
  const overlays = Array.isArray(manifest?.protectedOverlays)
    && manifest.protectedOverlays.length === context.protectedFiles.length
    ? manifest.protectedOverlays
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
    || !overlays
    || !overlays.every((overlay, index) => (
      overlay?.relativePath === context.protectedFiles[index].relativePath
      && /^[a-f0-9]{64}$/.test(String(overlay?.sha256 ?? ""))
      && Number.isSafeInteger(overlay?.sizeBytes)
      && overlay.sizeBytes >= 0
      && /^0[0-7]{3}$/.test(String(overlay?.mode ?? ""))
    ))
  ) {
    fail("manifest_invalid");
  }
  return overlays;
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
  createdAt,
  runtime: suppliedRuntime
} = {}) {
  const runtimeValue = selectedRuntime(suppliedRuntime);
  const context = releaseContext({
    activeReleasePath,
    candidateReleasePath,
    relativeConfigPath,
    outputManifestPath,
    runtimeValue,
    manifestMustBeAbsent: apply,
    candidateFilesMayBeMissing: true
  });
  if (context.protectedFiles.some(({ candidate }) => candidate.exists)) {
    fail("candidate_protected_file_present");
  }
  const protectedIdentities = context.protectedFiles.map(({ relativePath, active }) => ({
    relativePath,
    activeIdentity: fileIdentity(active.path, { includeBytes: apply })
  }));
  assertCurrentStable(context.productionTopology, runtimeValue);

  if (!apply) {
    return safeReport(context, {
      state: "ready",
      applied: false,
      candidateMatches: false
    });
  }

  const manifest = manifestShape(context, protectedIdentities, createdAtValue(createdAt));
  const manifestParent = dirname(context.manifestPath);
  const manifestTemp = temporaryPath(context.manifestPath, "manifest");
  const overlayOperations = context.protectedFiles.map((protectedFilePath, index) => ({
    ...protectedFilePath,
    activeIdentity: protectedIdentities[index].activeIdentity,
    temporary: temporaryPath(protectedFilePath.candidate.path, "overlay"),
    temporaryIdentity: undefined,
    published: false
  }));
  const manifestOperation = {
    temporary: manifestTemp,
    temporaryIdentity: undefined
  };
  let manifestPublished = false;

  try {
    if (context.productionTopology) {
      syncDirectory(manifestParent, runtimeValue, "manifest_boundary_invalid");
    } else {
      ensureDurableDirectory(
        manifestParent,
        runtimeValue,
        "manifest_boundary_invalid"
      );
    }
    for (const parent of new Set(
      overlayOperations.map((operation) => dirname(operation.candidate.path))
    )) {
      syncDirectory(parent, runtimeValue, "config_boundary_invalid");
    }

    for (const operation of overlayOperations) {
      operation.temporaryIdentity = writeProtectedFile(
        operation.temporary,
        operation.activeIdentity.bytes,
        {
          mode: Number.parseInt(operation.activeIdentity.mode, 8),
          uid: operation.activeIdentity.uid,
          gid: operation.activeIdentity.gid
        },
        runtimeValue,
        operation
      );
    }
    writeProtectedFile(
      manifestTemp,
      Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
      {
        mode: 0o600,
        uid: protectedIdentities[0].activeIdentity.uid,
        gid: protectedIdentities[0].activeIdentity.gid
      },
      runtimeValue,
      manifestOperation
    );

    for (const operation of overlayOperations) {
      publishNewFile(
        operation.temporary,
        operation.candidate.path,
        "candidate_protected_file_present",
        runtimeValue,
        operation.temporaryIdentity,
        "config_boundary_invalid"
      );
      operation.published = true;
      operation.candidate.exists = true;
    }
    publishNewFile(
      manifestTemp,
      context.manifestPath,
      "manifest_boundary_invalid",
      runtimeValue,
      manifestOperation.temporaryIdentity,
      "manifest_boundary_invalid"
    );
    manifestPublished = true;

    for (const operation of overlayOperations) {
      const preparedIdentity = fileIdentity(operation.candidate.path);
      if (!configIdentitiesMatch(operation.activeIdentity, preparedIdentity)) {
        fail("config_identity_mismatch");
      }
    }
    assertCurrentStable(context.productionTopology, runtimeValue);
  } catch (error) {
    let rollbackComplete = true;
    for (const operation of [...overlayOperations].reverse()) {
      if (operation.published) {
        rollbackComplete = removeFileDurably(
          operation.candidate.path,
          dirname(operation.candidate.path),
          runtimeValue,
          operation.temporaryIdentity
        ) && rollbackComplete;
      }
      operation.candidate.exists = false;
    }
    if (manifestPublished) {
      rollbackComplete = removeFileDurably(
        context.manifestPath,
        dirname(context.manifestPath),
        runtimeValue,
        manifestOperation.temporaryIdentity
      ) && rollbackComplete;
    }
    for (const operation of overlayOperations) {
      rollbackComplete = removeFileDurably(
        operation.temporary,
        dirname(operation.temporary),
        runtimeValue,
        operation.temporaryIdentity
      ) && rollbackComplete;
    }
    rollbackComplete = removeFileDurably(
      manifestTemp,
      dirname(manifestTemp),
      runtimeValue,
      manifestOperation.temporaryIdentity
    ) && rollbackComplete;
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
  manifestPath: outputManifestPath,
  runtime: suppliedRuntime
} = {}) {
  const runtimeValue = selectedRuntime(suppliedRuntime);
  const context = releaseContext({
    activeReleasePath,
    candidateReleasePath,
    relativeConfigPath,
    outputManifestPath,
    runtimeValue,
    manifestMustExist: true,
    candidateFilesMayBeMissing: false
  });
  assertCurrentStable(context.productionTopology, runtimeValue);
  const manifest = readAssemblyManifest(context.manifestPath);
  const overlays = validateManifestShape(manifest, context);

  for (const [index, protectedFilePath] of context.protectedFiles.entries()) {
    const activeIdentity = fileIdentity(protectedFilePath.active.path);
    const candidateIdentity = fileIdentity(protectedFilePath.candidate.path);
    if (
      !configIdentitiesMatch(activeIdentity, candidateIdentity)
      || !manifestIdentityMatches(activeIdentity, overlays[index])
    ) {
      fail("config_identity_mismatch");
    }
  }
  assertCurrentStable(context.productionTopology, runtimeValue);

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
  stderr = process.stderr,
  runtime: suppliedRuntime
} = {}) {
  try {
    const options = { ...parseCliArgs(argv), runtime: suppliedRuntime };
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
