#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import http from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyArtifactGitTree } from "./artifact-git-tree-verifier.mjs";
import { parseArtifactManifest } from "./control-plane-candidate-dependency-gate.mjs";
import {
  auditDependencyTree,
  parseDependencyArtifactManifest,
  prepareDependencyArtifactTree
} from "./control-plane-dependency-artifact.mjs";
import { serializeControlPlaneReleaseIdentity } from "../server/services/platform/control-plane-release-identity.mjs";

export const CONTROL_PLANE_CLEAN_ROOM_ARTIFACT_SMOKE_SCHEMA_VERSION = "1";
export const CONTROL_PLANE_CLEAN_ROOM_ARTIFACT_SMOKE_TYPE = "control_plane_clean_room_artifact_smoke";

const RELEASE_UNIT = "control-plane-app";
const COMMIT = /^[a-f0-9]{40}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const RELEASE = /^[A-Za-z0-9._-]{1,160}$/u;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_SOURCE_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_DEPENDENCY_ARCHIVE_BYTES = 128 * 1024 * 1024;
const MAX_CHECKSUM_BYTES = 4096;
const MAX_RELEASE_LABEL_BYTES = 512;
const MAX_PACKAGE_BYTES = 8 * 1024 * 1024;
const MAX_HTTP_BODY_BYTES = 64 * 1024;
const HTTP_PROXY_PORT = 18180;
const STARTUP_TIMEOUT_MS = 30_000;
const STARTUP_POLL_MS = 200;
const SHUTDOWN_TIMEOUT_MS = 5_000;
const TEST_RUNTIME = Symbol("control-plane-clean-room-artifact-smoke-test-runtime");

const SAFE_CONDITIONS = new Set([
  "invalid_input",
  "unsupported_platform",
  "input_boundary_invalid",
  "input_set_invalid",
  "input_file_invalid",
  "input_changed",
  "artifact_manifest_mismatch",
  "source_artifact_mismatch",
  "artifact_checksum_invalid",
  "dependency_manifest_mismatch",
  "dependency_archive_mismatch",
  "source_binding_mismatch",
  "release_binding_mismatch",
  "package_binding_mismatch",
  "source_archive_invalid",
  "dependency_artifact_invalid",
  "dependency_tree_mismatch",
  "workspace_invalid",
  "fixed_proxy_port_unavailable",
  "service_start_failed",
  "service_probe_failed",
  "public_health_invalid",
  "status_authentication_invalid",
  "release_identity_mismatch",
  "service_shutdown_failed",
  "port_cleanup_failed",
  "cleanup_failed"
]);

export class ControlPlaneCleanRoomArtifactSmokeError extends Error {
  constructor(condition, attentionRequired = false) {
    super(condition);
    this.name = "ControlPlaneCleanRoomArtifactSmokeError";
    this.condition = condition;
    this.attentionRequired = attentionRequired;
  }
}

function fail(condition, attentionRequired = false) {
  throw new ControlPlaneCleanRoomArtifactSmokeError(condition, attentionRequired);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function mode(metadata) {
  return metadata.mode & 0o7777;
}

function identity(metadata) {
  return Object.freeze({
    dev: String(metadata.dev),
    ino: String(metadata.ino),
    size: String(metadata.size),
    nlink: String(metadata.nlink),
    mode: String(metadata.mode),
    mtimeMs: String(metadata.mtimeMs),
    ctimeMs: String(metadata.ctimeMs)
  });
}

function sameIdentity(left, right) {
  return left && right
    && left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.nlink === right.nlink
    && left.mode === right.mode
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

function sameNode(left, right) {
  return left && right && left.dev === right.dev && left.ino === right.ino;
}

function within(root, child) {
  const value = relative(root, child);
  return value === "" || (value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value));
}

function stableDirectory(path, expectedMode, condition) {
  const absolute = resolve(path);
  let metadata;
  let physical;
  try {
    metadata = lstatSync(absolute);
    physical = realpathSync(absolute);
  } catch {
    fail(condition);
  }
  if (metadata.isSymbolicLink() || !metadata.isDirectory() || physical !== absolute
    || process.platform !== "win32" && mode(metadata) !== expectedMode) fail(condition);
  return Object.freeze({ path: absolute, identity: identity(metadata) });
}

function stableRegularFile(path, maximumBytes, condition = "input_file_invalid") {
  const absolute = resolve(path);
  let descriptor;
  let lexical;
  let opened;
  try {
    lexical = lstatSync(absolute);
    if (lexical.isSymbolicLink()) fail(condition);
    descriptor = openSync(absolute, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.nlink !== 1 || !sameNode(identity(lexical), identity(opened))
      || !Number.isSafeInteger(opened.size) || opened.size < 1 || opened.size > maximumBytes
      || process.platform !== "win32" && mode(opened) !== 0o600) fail(condition);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    const linked = lstatSync(absolute);
    if (bytes.length !== opened.size || !sameIdentity(identity(opened), identity(after))
      || !sameIdentity(identity(opened), identity(linked))) fail("input_changed");
    return Object.freeze({
      path: absolute,
      bytes,
      sha256: sha256(bytes),
      sizeBytes: bytes.length,
      identity: identity(after)
    });
  } catch (error) {
    if (error instanceof ControlPlaneCleanRoomArtifactSmokeError) throw error;
    fail(condition);
  } finally {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* read-only descriptor */ }
    }
  }
}

function assertStableFile(record) {
  let current;
  try { current = stableRegularFile(record.path, record.sizeBytes); } catch { fail("input_changed"); }
  if (!sameIdentity(record.identity, current.identity)
    || record.sizeBytes !== current.sizeBytes
    || record.sha256 !== current.sha256) fail("input_changed");
}

function assertStableDirectory(record) {
  let metadata;
  try { metadata = lstatSync(record.path); } catch { fail("input_changed"); }
  if (!sameIdentity(record.identity, identity(metadata))) fail("input_changed");
}

function lexists(path) {
  try { lstatSync(path); return true; } catch (error) {
    if (error?.code === "ENOENT") return false;
    fail("workspace_invalid");
  }
}

function compareTree(left, right) {
  return left && right
    && left.sha256 === right.sha256
    && left.entryCount === right.entryCount
    && left.totalBytes === right.totalBytes
    && left.hardlinksBroken === right.hardlinksBroken
    && left.symlinksInternal === right.symlinksInternal;
}

function normalizeOptions(options) {
  if (!options || typeof options !== "object") fail("invalid_input");
  const inputDirectory = resolve(String(options.inputDirectory || ""));
  const repositoryPath = resolve(String(options.repositoryPath || ""));
  const expectedSourceCommit = options.expectedSourceCommit;
  const expectedArtifactRelease = options.expectedArtifactRelease;
  const optionalHashes = [
    "expectedArtifactManifestSha256",
    "expectedSourceArtifactSha256",
    "expectedDependencyManifestSha256",
    "expectedDependencyArchiveSha256"
  ];
  if (!options.inputDirectory || !options.repositoryPath
    || !COMMIT.test(expectedSourceCommit || "")
    || !RELEASE.test(expectedArtifactRelease || "")
    || optionalHashes.some((field) => options[field] !== undefined && !HASH.test(options[field]))) fail("invalid_input");
  return Object.freeze({
    ...options,
    inputDirectory,
    repositoryPath,
    expectedSourceCommit,
    expectedArtifactRelease
  });
}

function collectInputSet(options) {
  const directory = stableDirectory(options.inputDirectory, 0o700, "input_boundary_invalid");
  let names;
  try { names = readdirSync(directory.path).sort(); } catch { fail("input_set_invalid"); }
  if (names.length !== 6 || !names.includes("artifact.json")) fail("input_set_invalid");

  const artifactManifestRecord = stableRegularFile(join(directory.path, "artifact.json"), MAX_MANIFEST_BYTES);
  let artifactManifest;
  try { artifactManifest = parseArtifactManifest({ bytes: artifactManifestRecord.bytes }); } catch { fail("artifact_manifest_mismatch"); }
  const artifactName = artifactManifest.value.artifact.fileName;
  if (artifactName !== `proxy-gateway-${artifactManifest.value.release}.zip`) fail("artifact_manifest_mismatch");
  const checksumName = `${artifactName}.sha256`;
  const expectedNames = [
    "artifact.json",
    artifactName,
    checksumName,
    "dependency-artifact.json",
    "node-modules.tar",
    "release-label.txt"
  ].sort();
  if (names.join("\0") !== expectedNames.join("\0")) fail("input_set_invalid");

  const files = new Map([["artifact.json", artifactManifestRecord]]);
  for (const [name, maximum] of [
    [artifactName, MAX_SOURCE_ARCHIVE_BYTES],
    [checksumName, MAX_CHECKSUM_BYTES],
    ["dependency-artifact.json", MAX_MANIFEST_BYTES],
    ["node-modules.tar", MAX_DEPENDENCY_ARCHIVE_BYTES],
    ["release-label.txt", MAX_RELEASE_LABEL_BYTES]
  ]) files.set(name, stableRegularFile(join(directory.path, name), maximum));
  assertStableDirectory(directory);
  let afterNames;
  try { afterNames = readdirSync(directory.path).sort(); } catch { fail("input_changed"); }
  if (afterNames.join("\0") !== names.join("\0")) fail("input_changed");

  const sourceArchive = files.get(artifactName);
  const dependencyManifestRecord = files.get("dependency-artifact.json");
  const dependencyArchive = files.get("node-modules.tar");
  if (options.expectedArtifactManifestSha256 !== undefined
    && artifactManifest.sha256 !== options.expectedArtifactManifestSha256) fail("artifact_manifest_mismatch");
  if (artifactManifest.value.sourceCommit !== options.expectedSourceCommit) fail("source_binding_mismatch");
  if (artifactManifest.value.release !== options.expectedArtifactRelease) fail("release_binding_mismatch");
  if (sourceArchive.sha256 !== artifactManifest.value.artifact.sha256
    || sourceArchive.sizeBytes !== artifactManifest.value.artifact.sizeBytes
    || options.expectedSourceArtifactSha256 !== undefined
      && sourceArchive.sha256 !== options.expectedSourceArtifactSha256) fail("source_artifact_mismatch");
  if (!files.get(checksumName).bytes.equals(Buffer.from(
    `${sourceArchive.sha256}  .release-artifacts/${artifactName}\n`
  ))) fail("artifact_checksum_invalid");
  if (!files.get("release-label.txt").bytes.equals(Buffer.from(`${options.expectedArtifactRelease}\n`))) fail("release_binding_mismatch");

  let dependencyManifest;
  try { dependencyManifest = parseDependencyArtifactManifest({ bytes: dependencyManifestRecord.bytes }); } catch { fail("dependency_manifest_mismatch"); }
  if (options.expectedDependencyManifestSha256 !== undefined
    && dependencyManifest.sha256 !== options.expectedDependencyManifestSha256) fail("dependency_manifest_mismatch");
  if (dependencyManifest.value.sourceCommit !== options.expectedSourceCommit) fail("source_binding_mismatch");
  if (dependencyManifest.value.artifactRelease !== options.expectedArtifactRelease) fail("release_binding_mismatch");
  if (dependencyManifest.value.archive.fileName !== "node-modules.tar"
    || dependencyArchive.sha256 !== dependencyManifest.value.archive.sha256
    || dependencyArchive.sizeBytes !== dependencyManifest.value.archive.sizeBytes
    || options.expectedDependencyArchiveSha256 !== undefined
      && dependencyArchive.sha256 !== options.expectedDependencyArchiveSha256) fail("dependency_archive_mismatch");

  return Object.freeze({
    directory,
    files,
    artifactName,
    artifactManifest,
    sourceArchive,
    dependencyManifest,
    dependencyArchive,
    binding: Object.freeze({
      artifactManifestSha256: artifactManifest.sha256,
      sourceArtifactSha256: sourceArchive.sha256,
      dependencyArtifactManifestSha256: dependencyManifest.sha256,
      dependencyArchiveSha256: dependencyArchive.sha256
    })
  });
}

function createWorkspace() {
  let root;
  try {
    root = mkdtempSync(join(tmpdir(), "control-plane-clean-room-"));
    chmodSync(root, 0o700);
    const metadata = lstatSync(root);
    const physical = realpathSync(root);
    if (metadata.isSymbolicLink() || !metadata.isDirectory() || physical !== root || mode(metadata) !== 0o700) fail("workspace_invalid");
    const rootIdentity = identity(metadata);
    const rootOwner = Object.freeze({ uid: metadata.uid, gid: metadata.gid });
    return Object.freeze({
      root,
      cleanup() {
        try {
          const current = lstatSync(root);
          const tempRoot = realpathSync(tmpdir());
          if (current.isSymbolicLink() || !current.isDirectory()
            || !sameNode(rootIdentity, identity(current))
            || current.uid !== rootOwner.uid || current.gid !== rootOwner.gid
            || mode(current) !== 0o700 || realpathSync(root) !== root
            || dirname(root) !== tempRoot
            || !basename(root).startsWith("control-plane-clean-room-")) fail("cleanup_failed", true);
          rmSync(root, { recursive: true, force: true });
        } catch (error) {
          if (error instanceof ControlPlaneCleanRoomArtifactSmokeError) throw error;
          fail("cleanup_failed", true);
        }
      }
    });
  } catch (error) {
    if (root) {
      try { rmSync(root, { recursive: true, force: true }); } catch { /* best effort before ownership is returned */ }
    }
    if (error instanceof ControlPlaneCleanRoomArtifactSmokeError) throw error;
    fail("workspace_invalid");
  }
}

function extractSourceArchive({ archivePath, destinationRoot }) {
  try {
    if (lexists(destinationRoot)) fail("workspace_invalid");
    mkdirSync(destinationRoot, { mode: 0o700 });
    chmodSync(destinationRoot, 0o700);
    const result = spawnSync("/usr/bin/unzip", ["-q", archivePath, "-d", destinationRoot], {
      cwd: "/",
      env: { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" },
      stdio: "ignore",
      timeout: 120_000,
      windowsHide: true
    });
    if (result.error || result.status !== 0) fail("source_archive_invalid");
  } catch (error) {
    if (error instanceof ControlPlaneCleanRoomArtifactSmokeError) throw error;
    fail("source_archive_invalid");
  }
}

function readExtractedRegularFile(root, path, maximumBytes) {
  const target = resolve(root, path);
  if (!within(root, target)) fail("source_archive_invalid");
  let metadata;
  let physical;
  try {
    metadata = lstatSync(target);
    physical = realpathSync(target);
  } catch { fail("source_archive_invalid"); }
  if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.nlink !== 1
    || !within(root, physical) || metadata.size < 1 || metadata.size > maximumBytes) fail("source_archive_invalid");
  let bytes;
  try { bytes = readFileSync(target); } catch { fail("source_archive_invalid"); }
  if (bytes.length !== metadata.size) fail("source_archive_invalid");
  return bytes;
}

function moveNodeModules({ source, destination }) {
  if (lexists(destination)) fail("source_archive_invalid");
  let sourceMetadata;
  try { sourceMetadata = lstatSync(source); } catch { fail("dependency_artifact_invalid"); }
  if (sourceMetadata.isSymbolicLink() || !sourceMetadata.isDirectory()) fail("dependency_artifact_invalid");
  try { renameSync(source, destination); } catch { fail("dependency_artifact_invalid"); }
}

function writePrivateFile(path, bytes) {
  const temporaryPath = `${path}.partial`;
  try {
    if (lexists(path) || lexists(temporaryPath)) fail("workspace_invalid");
    writeFileSync(temporaryPath, bytes, { flag: "wx", mode: 0o600 });
    chmodSync(temporaryPath, 0o600);
    renameSync(temporaryPath, path);
  } catch {
    try { rmSync(temporaryPath, { force: true }); } catch { /* owned private path */ }
    fail("workspace_invalid");
  }
}

function bindAndRelease(port) {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = net.createServer();
    let settled = false;
    const reject = () => {
      if (settled) return;
      settled = true;
      try { server.close(); } catch { /* never exposed */ }
      rejectPromise(new Error("port_unavailable"));
    };
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port, exclusive: true }, () => {
      let address;
      try { address = server.address(); } catch { reject(); return; }
      server.close((error) => {
        if (settled) return;
        settled = true;
        if (error || !address || typeof address === "string" || !Number.isSafeInteger(address.port)) {
          rejectPromise(new Error("port_unavailable"));
          return;
        }
        resolvePromise(address.port);
      });
    });
  });
}

async function assertPortAvailable(port) {
  await bindAndRelease(port);
}

async function reserveConsolePort() {
  const port = await bindAndRelease(0);
  if (port === HTTP_PROXY_PORT) return reserveConsolePort();
  return port;
}

function spawnService({ executable, cwd, argv, env }) {
  let child;
  try {
    if (executable !== process.execPath) fail("service_start_failed");
    child = spawn(executable, argv, {
      cwd,
      env,
      stdio: "ignore",
      windowsHide: true
    });
  } catch { fail("service_start_failed"); }
  let exited = false;
  let exitResolve;
  const exitPromise = new Promise((resolvePromise) => { exitResolve = resolvePromise; });
  const settle = () => {
    if (exited) return;
    exited = true;
    exitResolve();
  };
  child.once("error", settle);
  child.once("exit", settle);
  return Object.freeze({ child, exitPromise, exited: () => exited });
}

function request({ port, path, headers = {} }) {
  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    const finishReject = () => {
      if (settled) return;
      settled = true;
      rejectPromise(new Error("request_unavailable"));
    };
    const requestValue = http.request({
      hostname: "127.0.0.1",
      port,
      path,
      method: "GET",
      headers,
      timeout: 2_000
    }, (response) => {
      const chunks = [];
      let total = 0;
      response.on("data", (chunk) => {
        total += chunk.length;
        if (total > MAX_HTTP_BODY_BYTES) {
          response.destroy();
          finishReject();
          return;
        }
        chunks.push(chunk);
      });
      response.once("error", finishReject);
      response.once("end", () => {
        if (settled) return;
        settled = true;
        resolvePromise(Object.freeze({
          statusCode: response.statusCode,
          headers: response.headers,
          body: Buffer.concat(chunks)
        }));
      });
    });
    requestValue.once("timeout", () => { requestValue.destroy(); finishReject(); });
    requestValue.once("error", finishReject);
    requestValue.end();
  });
}

function serviceExited(handle) {
  return handle?.exited?.() === true;
}

function wait(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function terminateService(handle) {
  if (!handle || serviceExited(handle)) return true;
  const waitForExit = (milliseconds) => new Promise((resolvePromise) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolvePromise(false);
    }, milliseconds);
    handle.exitPromise.then(() => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise(true);
    });
  });
  try { handle.child.kill("SIGTERM"); } catch { /* fall through to bounded wait */ }
  if (await waitForExit(SHUTDOWN_TIMEOUT_MS)) return true;
  try { handle.child.kill("SIGKILL"); } catch { /* final bounded wait */ }
  return waitForExit(SHUTDOWN_TIMEOUT_MS);
}

function baseRuntime(value = {}) {
  return Object.freeze({
    verifyArtifactGitTree: value.verifyArtifactGitTree ?? verifyArtifactGitTree,
    createWorkspace: value.createWorkspace ?? createWorkspace,
    extractSourceArchive: value.extractSourceArchive ?? extractSourceArchive,
    prepareDependencyArtifactTree: value.prepareDependencyArtifactTree ?? prepareDependencyArtifactTree,
    auditDependencyTree: value.auditDependencyTree ?? auditDependencyTree,
    moveNodeModules: value.moveNodeModules ?? moveNodeModules,
    assertPortAvailable: value.assertPortAvailable ?? assertPortAvailable,
    reserveConsolePort: value.reserveConsolePort ?? reserveConsolePort,
    spawnService: value.spawnService ?? spawnService,
    serviceExited: value.serviceExited ?? serviceExited,
    request: value.request ?? request,
    terminateService: value.terminateService ?? terminateService,
    assertPortReleased: value.assertPortReleased ?? assertPortAvailable,
    sleep: value.sleep ?? wait,
    now: value.now ?? Date.now,
    randomToken: value.randomToken ?? (() => randomBytes(32).toString("base64url")),
    [TEST_RUNTIME]: value[TEST_RUNTIME] === true
  });
}

export function createControlPlaneCleanRoomArtifactSmokeTestRuntime(overrides = {}) {
  return baseRuntime({ ...overrides, [TEST_RUNTIME]: true });
}

function selectedRuntime(supplied) {
  if (supplied !== undefined) {
    if (!supplied?.[TEST_RUNTIME]) fail("invalid_input");
    return supplied;
  }
  if (process.platform !== "linux" || !isAbsolute(process.execPath)) fail("unsupported_platform");
  return baseRuntime();
}

function normalizeDependencyError(error) {
  if (error instanceof ControlPlaneCleanRoomArtifactSmokeError) return error;
  if (error?.condition === "dependency_source_mismatch") return new ControlPlaneCleanRoomArtifactSmokeError("source_binding_mismatch");
  if (error?.condition === "dependency_release_mismatch") return new ControlPlaneCleanRoomArtifactSmokeError("release_binding_mismatch");
  if (["dependency_package_mismatch", "dependency_lock_mismatch"].includes(error?.condition)) {
    return new ControlPlaneCleanRoomArtifactSmokeError("package_binding_mismatch");
  }
  if (error?.condition === "dependency_tree_mismatch") return new ControlPlaneCleanRoomArtifactSmokeError("dependency_tree_mismatch");
  if (error?.condition === "dependency_file_changed") return new ControlPlaneCleanRoomArtifactSmokeError("input_changed");
  return new ControlPlaneCleanRoomArtifactSmokeError("dependency_artifact_invalid");
}

function parseJsonResponse(response, condition) {
  if (!response || !Buffer.isBuffer(response.body) || response.body.length > MAX_HTTP_BODY_BYTES) fail(condition);
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(response.body)); } catch { fail(condition); }
}

function validatePublicHealth(response) {
  if (response?.statusCode !== 200) fail("public_health_invalid");
  const value = parseJsonResponse(response, "public_health_invalid");
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join("\0") !== ["authRequired", "ok", "ts"].join("\0")
    || value.ok !== true || value.authRequired !== true
    || !Number.isSafeInteger(value.ts) || value.ts < 0) fail("public_health_invalid");
}

function expectedReleaseIdentity(options, input) {
  const value = {
    schemaVersion: "1",
    type: "control_plane_release_identity",
    state: "verified",
    releaseUnit: RELEASE_UNIT,
    sourceCommit: options.expectedSourceCommit,
    artifactRelease: options.expectedArtifactRelease,
    artifactManifestSha256: input.binding.artifactManifestSha256,
    sourceArtifactSha256: input.binding.sourceArtifactSha256,
    dependencyArtifactManifestSha256: input.binding.dependencyArtifactManifestSha256,
    dependencyArchiveSha256: input.binding.dependencyArchiveSha256
  };
  const bytes = serializeControlPlaneReleaseIdentity(value);
  return Object.freeze({ value: Object.freeze(value), bytes, runtime: Object.freeze({ ...value, identitySha256: sha256(bytes) }) });
}

async function probeReadyHealth({ runtime, handle, consolePort }) {
  const deadline = runtime.now() + STARTUP_TIMEOUT_MS;
  for (;;) {
    if (runtime.serviceExited(handle)) fail("service_start_failed");
    try {
      const response = await runtime.request({ port: consolePort, path: "/api/health" });
      validatePublicHealth(response);
      return deadline;
    } catch (error) {
      if (error instanceof ControlPlaneCleanRoomArtifactSmokeError) throw error;
      if (runtime.serviceExited(handle)) fail("service_start_failed");
      if (runtime.now() >= deadline) fail("service_probe_failed");
      await runtime.sleep(STARTUP_POLL_MS);
    }
  }
}

async function probeProtectedStatus({ runtime, handle, consolePort, token, releaseIdentity, deadline }) {
  let anonymous;
  let query;
  let authorized;
  try { anonymous = await runtime.request({ port: consolePort, path: "/api/status" }); }
  catch { fail("service_probe_failed"); }
  if (anonymous?.statusCode !== 401) fail("status_authentication_invalid");
  try {
    query = await runtime.request({
      port: consolePort,
      path: `/api/status?token=${encodeURIComponent(token)}`
    });
  } catch { fail("service_probe_failed"); }
  if (query?.statusCode !== 401) fail("status_authentication_invalid");
  for (;;) {
    if (runtime.serviceExited(handle)) fail("service_start_failed");
    try {
      authorized = await runtime.request({
        port: consolePort,
        path: "/api/status",
        headers: { authorization: `Bearer ${token}` }
      });
    } catch {
      if (runtime.serviceExited(handle)) fail("service_start_failed");
      if (runtime.now() >= deadline) fail("service_probe_failed");
      await runtime.sleep(STARTUP_POLL_MS);
      continue;
    }
    if (authorized?.statusCode !== 200) fail("release_identity_mismatch");
    const value = parseJsonResponse(authorized, "release_identity_mismatch");
    if (!value || typeof value !== "object" || Array.isArray(value)
      || JSON.stringify(value.releaseIdentity) !== JSON.stringify(releaseIdentity.runtime)) fail("release_identity_mismatch");
    if (value.ok === true
      && value.ports?.httpProxy?.ok === true
      && value.runtime?.httpProxy?.running === true) return;
    if (runtime.now() >= deadline) fail("service_probe_failed");
    await runtime.sleep(STARTUP_POLL_MS);
  }
}

function buildReceipt(options, input) {
  return Object.freeze({
    schemaVersion: CONTROL_PLANE_CLEAN_ROOM_ARTIFACT_SMOKE_SCHEMA_VERSION,
    type: CONTROL_PLANE_CLEAN_ROOM_ARTIFACT_SMOKE_TYPE,
    state: "verified",
    releaseUnit: RELEASE_UNIT,
    sourceCommit: options.expectedSourceCommit,
    artifactRelease: options.expectedArtifactRelease,
    binding: input.binding,
    assembly: Object.freeze({
      sourceTree: "verified",
      dependencyTree: "verified",
      entry: "server/index.mjs"
    }),
    probes: Object.freeze({
      publicHealth: "passed",
      protectedStatus: "passed",
      releaseIdentity: "matched"
    })
  });
}

export async function runControlPlaneCleanRoomArtifactSmoke(options = {}) {
  const normalized = normalizeOptions(options);
  const runtime = selectedRuntime(normalized.runtime);
  const input = collectInputSet(normalized);

  try {
    runtime.verifyArtifactGitTree({
      artifactPath: input.sourceArchive.path,
      repositoryPath: normalized.repositoryPath,
      expectedCommit: normalized.expectedSourceCommit,
      excludedPaths: ["config/proxy-servers.json"],
      sourceOnlyBoundary: true
    });
  } catch { fail("source_archive_invalid"); }
  assertStableFile(input.sourceArchive);
  assertStableDirectory(input.directory);

  let workspace;
  let prepared;
  let handle;
  let consolePort;
  let primaryError = null;
  let cleanupError = null;
  let receipt;
  try {
    workspace = runtime.createWorkspace();
    if (!workspace || typeof workspace.root !== "string" || typeof workspace.cleanup !== "function") fail("workspace_invalid");
    const sourceRoot = join(workspace.root, "source");
    runtime.extractSourceArchive({
      archivePath: input.sourceArchive.path,
      destinationRoot: sourceRoot,
      expectedSha256: input.sourceArchive.sha256
    });
    assertStableFile(input.sourceArchive);

    const packageJsonBytes = readExtractedRegularFile(sourceRoot, "package.json", MAX_PACKAGE_BYTES);
    const packageLockBytes = readExtractedRegularFile(sourceRoot, "package-lock.json", MAX_PACKAGE_BYTES);
    const serverEntry = resolve(sourceRoot, "server/index.mjs");
    readExtractedRegularFile(sourceRoot, "server/index.mjs", MAX_PACKAGE_BYTES);
    if (sha256(packageJsonBytes) !== input.dependencyManifest.value.package.sha256
      || packageJsonBytes.length !== input.dependencyManifest.value.package.sizeBytes
      || sha256(packageLockBytes) !== input.dependencyManifest.value.packageLock.sha256
      || packageLockBytes.length !== input.dependencyManifest.value.packageLock.sizeBytes) fail("package_binding_mismatch");

    try {
      prepared = runtime.prepareDependencyArtifactTree({
        manifestBytes: input.files.get("dependency-artifact.json").bytes,
        archivePath: input.dependencyArchive.path,
        packageJsonBytes,
        packageLockBytes,
        expectedSourceCommit: normalized.expectedSourceCommit,
        expectedArtifactRelease: normalized.expectedArtifactRelease,
        expectedManifestSha256: input.binding.dependencyArtifactManifestSha256,
        expectedArchiveSha256: input.binding.dependencyArchiveSha256
      });
    } catch (error) { throw normalizeDependencyError(error); }
    if (!prepared?.extracted?.nodeModulesRoot || typeof prepared.extracted.cleanup !== "function"
      || !compareTree(prepared.tree, input.dependencyManifest.value.tree)) fail("dependency_tree_mismatch");
    let beforeMove;
    try { beforeMove = runtime.auditDependencyTree(prepared.extracted.nodeModulesRoot); } catch { fail("dependency_tree_mismatch"); }
    if (!compareTree(beforeMove, input.dependencyManifest.value.tree)) fail("dependency_tree_mismatch");
    const installedNodeModules = resolve(sourceRoot, "node_modules");
    runtime.moveNodeModules({ source: prepared.extracted.nodeModulesRoot, destination: installedNodeModules });
    let afterMove;
    try { afterMove = runtime.auditDependencyTree(installedNodeModules); } catch { fail("dependency_tree_mismatch"); }
    if (!compareTree(afterMove, input.dependencyManifest.value.tree)) fail("dependency_tree_mismatch");

    const runtimeRoot = join(workspace.root, "runtime");
    mkdirSync(runtimeRoot, { mode: 0o700 });
    chmodSync(runtimeRoot, 0o700);
    const proxyConfigPath = join(runtimeRoot, "proxy-servers.json");
    const releaseIdentityPath = join(runtimeRoot, "release-identity.json");
    const subscriptionDbPath = join(runtimeRoot, "subscriptions.sqlite");
    const controlDbPath = join(runtimeRoot, "control.sqlite");
    const releaseIdentity = expectedReleaseIdentity(normalized, input);
    writePrivateFile(proxyConfigPath, Buffer.from('{"servers":[]}\n'));
    writePrivateFile(releaseIdentityPath, releaseIdentity.bytes);

    try { await runtime.assertPortAvailable(HTTP_PROXY_PORT); } catch { fail("fixed_proxy_port_unavailable"); }
    try { consolePort = await runtime.reserveConsolePort(); } catch { fail("service_start_failed"); }
    if (!Number.isSafeInteger(consolePort) || consolePort < 1 || consolePort > 65_535
      || consolePort === HTTP_PROXY_PORT) fail("service_start_failed");
    const token = runtime.randomToken();
    if (typeof token !== "string" || token.length < 16 || token.length > 256) fail("service_start_failed");
    const env = Object.freeze({
      PATH: "/usr/bin:/bin",
      LANG: "C",
      LC_ALL: "C",
      TZ: "UTC",
      NODE_ENV: "production",
      DOTENV_CONFIG_QUIET: "true",
      CONSOLE_PORT: String(consolePort),
      CONSOLE_TOKEN: token,
      PROXY_SERVERS_CONFIG_PATH: proxyConfigPath,
      SUBSCRIPTION_DB_PATH: subscriptionDbPath,
      SUBSCRIPTION_CONTROL_DB_PATH: controlDbPath,
      CONTROL_PLANE_RELEASE_IDENTITY_PATH: releaseIdentityPath
    });
    try {
      handle = runtime.spawnService({
        executable: process.execPath,
        cwd: sourceRoot,
        argv: [relative(sourceRoot, serverEntry).split(sep).join("/")],
        env
      });
    }
    catch (error) {
      if (error instanceof ControlPlaneCleanRoomArtifactSmokeError) throw error;
      fail("service_start_failed");
    }
    if (!handle) fail("service_start_failed");
    const startupDeadline = await probeReadyHealth({ runtime, handle, consolePort });
    await probeProtectedStatus({
      runtime,
      handle,
      consolePort,
      token,
      releaseIdentity,
      deadline: startupDeadline
    });
    for (const record of input.files.values()) assertStableFile(record);
    assertStableDirectory(input.directory);
    receipt = buildReceipt(normalized, input);
  } catch (error) {
    primaryError = error instanceof ControlPlaneCleanRoomArtifactSmokeError
      ? error
      : new ControlPlaneCleanRoomArtifactSmokeError("service_probe_failed");
  } finally {
    if (handle) {
      try {
        if (await runtime.terminateService(handle) !== true) throw new Error("shutdown_incomplete");
      } catch { cleanupError = cleanupError ?? new ControlPlaneCleanRoomArtifactSmokeError("service_shutdown_failed", true); }
      if (consolePort !== undefined) {
        try { await runtime.assertPortReleased(consolePort); }
        catch { cleanupError = cleanupError ?? new ControlPlaneCleanRoomArtifactSmokeError("port_cleanup_failed", true); }
      }
      try { await runtime.assertPortReleased(HTTP_PROXY_PORT); }
      catch { cleanupError = cleanupError ?? new ControlPlaneCleanRoomArtifactSmokeError("port_cleanup_failed", true); }
    }
    if (prepared) {
      try { prepared.extracted.cleanup(); }
      catch { cleanupError = cleanupError ?? new ControlPlaneCleanRoomArtifactSmokeError("cleanup_failed", true); }
    }
    if (workspace) {
      try { workspace.cleanup(); }
      catch { cleanupError = cleanupError ?? new ControlPlaneCleanRoomArtifactSmokeError("cleanup_failed", true); }
    }
  }
  if (cleanupError) throw cleanupError;
  if (primaryError) throw primaryError;
  return receipt;
}

function parseArguments(argv) {
  if (!Array.isArray(argv)) fail("invalid_input");
  const allowed = new Set([
    "--repository",
    "--input-directory",
    "--expected-source-commit",
    "--expected-artifact-release"
  ]);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    const equal = typeof item === "string" ? item.indexOf("=") : -1;
    const key = equal >= 0 ? item.slice(0, equal) : item;
    if (!allowed.has(key) || values.has(key)) fail("invalid_input");
    const value = equal >= 0 ? item.slice(equal + 1) : argv[++index];
    if (typeof value !== "string" || !value || value.startsWith("--")) fail("invalid_input");
    values.set(key, value);
  }
  if (values.size !== allowed.size || [...allowed].some((key) => !values.has(key))) fail("invalid_input");
  return Object.freeze({
    repositoryPath: values.get("--repository"),
    inputDirectory: values.get("--input-directory"),
    expectedSourceCommit: values.get("--expected-source-commit"),
    expectedArtifactRelease: values.get("--expected-artifact-release")
  });
}

function safeFailure(error) {
  const condition = error instanceof ControlPlaneCleanRoomArtifactSmokeError
    && SAFE_CONDITIONS.has(error.condition)
    ? error.condition
    : "service_probe_failed";
  return Object.freeze({
    schemaVersion: CONTROL_PLANE_CLEAN_ROOM_ARTIFACT_SMOKE_SCHEMA_VERSION,
    type: CONTROL_PLANE_CLEAN_ROOM_ARTIFACT_SMOKE_TYPE,
    state: error?.attentionRequired ? "attention_required" : "blocked",
    condition
  });
}

export async function runControlPlaneCleanRoomArtifactSmokeCli({
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr,
  runtime
} = {}) {
  try {
    const options = parseArguments(argv);
    const result = await runControlPlaneCleanRoomArtifactSmoke({ ...options, ...(runtime === undefined ? {} : { runtime }) });
    stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    stderr.write(`${JSON.stringify(safeFailure(error))}\n`);
    return 1;
  }
}

let invokedDirectly = false;
try { invokedDirectly = realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
catch { invokedDirectly = false; }
if (invokedDirectly) process.exitCode = await runControlPlaneCleanRoomArtifactSmokeCli();
