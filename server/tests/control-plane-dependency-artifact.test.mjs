import { createHash } from "node:crypto";
import { chmodSync, linkSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import assert from "node:assert/strict";

import {
  DEPENDENCY_ARTIFACT_TYPE,
  DependencyArtifactError,
  auditDependencyTree,
  dependencyArtifactPaths,
  parseDependencyArtifactManifest,
  validateDependencyArchiveEntries,
  verifyDependencyArtifact
} from "../../scripts/control-plane-dependency-artifact.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const condition = (name) => (error) => error instanceof DependencyArtifactError && error.condition === name;
const makeRoot = (name) => {
  const root = resolve(tmpdir(), `gccgw-dependency-artifact-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });
  return root;
};
const runtime = Object.freeze({
  platform: "linux", arch: "x64", libc: "glibc-2.39", nodeVersion: "v22.23.1", nodeAbi: "127", npmVersion: "v10.9.2", betterSqlite3Version: "12.10.0"
});
function fixture(name = "happy") {
  const root = makeRoot(name);
  const nodeModules = join(root, "node_modules");
  mkdirSync(join(nodeModules, "better-sqlite3"), { recursive: true });
  const packageJson = Buffer.from('{"name":"fixture","version":"1.0.0"}\n');
  const packageLock = Buffer.from('{"name":"fixture","lockfileVersion":3,"packages":{}}\n');
  writeFileSync(join(root, "package.json"), packageJson);
  writeFileSync(join(root, "package-lock.json"), packageLock);
  writeFileSync(join(nodeModules, "better-sqlite3", "index.js"), "module.exports = {};\n");
  writeFileSync(join(nodeModules, "better-sqlite3", "package.json"), '{"version":"12.10.0"}\n');
  const archiveBytes = Buffer.from("archive-fixture\n");
  const archivePath = join(root, "node-modules.tar");
  writeFileSync(archivePath, archiveBytes);
  const tree = auditDependencyTree(nodeModules, { enforceOwnership: false, checkAclCapabilities: () => true });
  const manifest = {
    schemaVersion: "1", type: DEPENDENCY_ARTIFACT_TYPE, state: "verified", releaseUnit: "control-plane-app",
    sourceCommit: "a".repeat(40), artifactRelease: "ci-20260819",
    package: { sha256: hash(packageJson), sizeBytes: packageJson.length },
    packageLock: { sha256: hash(packageLock), sizeBytes: packageLock.length },
    archive: { fileName: "node-modules.tar", sha256: hash(archiveBytes), sizeBytes: archiveBytes.length },
    runtime,
    smoke: { betterSqlite3Memory: true, snapshotImport: true },
    tree: { sha256: tree.sha256, entryCount: tree.entryCount, hardlinksBroken: true, symlinksInternal: true },
    provenance: { builder: "github-actions", workflow: "control-plane-dependency-artifact.yml" }
  };
  return { root, nodeModules, packageJson, packageLock, archivePath, archiveBytes, manifest, tree };
}

function cleanup(root) { try { rmSync(root, { recursive: true, force: true }); } catch {} }

test("dependency manifest accepts formatting but rejects duplicate keys", () => {
  const value = {
    schemaVersion: "1", type: DEPENDENCY_ARTIFACT_TYPE, state: "verified", releaseUnit: "control-plane-app", sourceCommit: "a".repeat(40), artifactRelease: "ci",
    package: { sha256: "b".repeat(64), sizeBytes: 1 }, packageLock: { sha256: "c".repeat(64), sizeBytes: 1 },
    archive: { fileName: "node-modules.tar", sha256: "d".repeat(64), sizeBytes: 1 }, runtime,
    smoke: { betterSqlite3Memory: true, snapshotImport: true }, tree: { sha256: "e".repeat(64), entryCount: 1, hardlinksBroken: true, symlinksInternal: true }, provenance: { builder: "github-actions", workflow: "control-plane-dependency-artifact.yml" }
  };
  const parsed = parseDependencyArtifactManifest({ bytes: Buffer.from(`${JSON.stringify(value, null, 2)}\r\n`) });
  assert.equal(parsed.value.type, DEPENDENCY_ARTIFACT_TYPE);
  assert.throws(() => parseDependencyArtifactManifest({ bytes: Buffer.from('{"schemaVersion":"1","schemaVersion":"1"}') }), condition("dependency_artifact_invalid"));
});

test("production consumer paths are derived from the fixed deployment layout", () => {
  const paths = dependencyArtifactPaths({ deploymentRoot: "/opt/proxy-gateway-minimal-candidate", candidateRelease: "cca5332573d3" });
  assert.equal(paths.manifestPath, resolve("/opt/proxy-gateway-minimal-candidate", "dependency-artifacts", "cca5332573d3", "dependency-artifact.json"));
  assert.throws(() => dependencyArtifactPaths({ deploymentRoot: "/opt/root", candidateRelease: "../escape" }), condition("dependency_path_invalid"));
});

test("consumer verifies package-lock, runtime, archive, tree and native smoke together", () => {
  const value = fixture();
  try {
    const result = verifyDependencyArtifact({
      manifestBytes: Buffer.from(`${JSON.stringify(value.manifest, null, 2)}\n`), archivePath: value.archivePath,
      packageJsonBytes: value.packageJson, packageLockBytes: value.packageLock, expectedSourceCommit: "a".repeat(40),
      nodeModulesRoot: value.nodeModules,
      runtime: { enforceOwnership: false, detect: () => runtime, listArchive: () => Buffer.from("node_modules\0node_modules/better-sqlite3/\0node_modules/better-sqlite3/index.js\0node_modules/better-sqlite3/package.json\0"), checkAclCapabilities: () => true, nativeSmoke: () => true }
    });
    assert.equal(result.state, "verified");
    assert.equal(result.tree.entryCount, value.tree.entryCount);
    assert.equal(result.smoke.betterSqlite3Memory, true);
  } finally { cleanup(value.root); }
});

test("consumer rejects lock drift and runtime ABI drift", () => {
  const value = fixture("mismatch");
  const args = {
    manifestBytes: Buffer.from(JSON.stringify(value.manifest)), archivePath: value.archivePath, packageJsonBytes: value.packageJson, packageLockBytes: value.packageLock,
    runtime: { enforceOwnership: false, detect: () => runtime, listArchive: () => Buffer.from("node_modules\0"), checkAclCapabilities: () => true }
  };
  try {
    assert.throws(() => verifyDependencyArtifact({ ...args, expectedSourceCommit: "b".repeat(40) }), condition("dependency_source_mismatch"));
    assert.throws(() => verifyDependencyArtifact({ ...args, packageLockBytes: Buffer.from("drift") }), condition("dependency_lock_mismatch"));
    assert.throws(() => verifyDependencyArtifact({ ...args, runtime: { ...args.runtime, detect: () => ({ ...runtime, nodeAbi: "999" }) } }), condition("dependency_runtime_mismatch"));
    writeFileSync(value.archivePath, "tampered\n");
    assert.throws(() => verifyDependencyArtifact({ ...args, runtime: { ...args.runtime, nativeSmoke: () => true } }), condition("dependency_archive_mismatch"));
  } finally { cleanup(value.root); }
});

test("consumer rejects archive traversal and unsafe tree links", () => {
  assert.throws(() => validateDependencyArchiveEntries(Buffer.from("node_modules\0node_modules/../escape\0")), condition("dependency_archive_invalid"));
  const value = fixture("links");
  try {
    symlinkSync("/tmp", join(value.nodeModules, "external-link"));
    assert.throws(() => auditDependencyTree(value.nodeModules, { enforceOwnership: false, checkAclCapabilities: () => true }), condition("dependency_tree_invalid"));
  } finally { cleanup(value.root); }
});

test("consumer rejects hardlinks and ACL/capability failures before native smoke", () => {
  const value = fixture("hardlink");
  try {
    linkSync(join(value.nodeModules, "better-sqlite3", "index.js"), join(value.nodeModules, "better-sqlite3", "index-copy.js"));
    assert.throws(() => auditDependencyTree(value.nodeModules, { enforceOwnership: false, checkAclCapabilities: () => true }), condition("dependency_tree_invalid"));
    const clean = fixture("acl");
    try { assert.throws(() => auditDependencyTree(clean.nodeModules, { enforceOwnership: false, checkAclCapabilities: () => false }), condition("dependency_acl_or_capability_invalid")); } finally { cleanup(clean.root); }
  } finally { cleanup(value.root); }
});

test("consumer fails closed when the native smoke runner fails", () => {
  const value = fixture("smoke-failure");
  try {
    assert.throws(() => verifyDependencyArtifact({
      manifestBytes: Buffer.from(JSON.stringify(value.manifest)), archivePath: value.archivePath,
      packageJsonBytes: value.packageJson, packageLockBytes: value.packageLock, nodeModulesRoot: value.nodeModules,
      runtime: { enforceOwnership: false, detect: () => runtime, listArchive: () => Buffer.from("node_modules\0node_modules/better-sqlite3/\0node_modules/better-sqlite3/index.js\0node_modules/better-sqlite3/package.json\0"), checkAclCapabilities: () => true, nativeSmoke: () => false }
    }), condition("native_module_validation_failed"));
  } finally { cleanup(value.root); }
});

test("Ubuntu workflow is a CI artifact producer, not a production builder", () => {
  const workflow = readFileSync(resolve(".github/workflows/control-plane-dependency-artifact.yml"), "utf8");
  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.match(workflow, /node-version: 22\.23\.1/);
  assert.match(workflow, /npm ci --omit=dev --no-audit --no-fund/);
  assert.match(workflow, /--mode smoke/);
  assert.match(workflow, /--mode build/);
  assert.match(workflow, /--mode verify/);
  assert.match(workflow, /--hard-dereference/);
  assert.match(workflow, /actions\/upload-artifact@v7/);
  assert.doesNotMatch(workflow, /\b(?:ssh|scp|rsync|systemctl|systemd-run)\b/i);
  assert.doesNotMatch(workflow, /\.env|CONSOLE_TOKEN|SS_PASSWORD|subscription/i);
});
