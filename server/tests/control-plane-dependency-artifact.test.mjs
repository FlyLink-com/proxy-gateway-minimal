import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, linkSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import assert from "node:assert/strict";

import {
  DEPENDENCY_ARTIFACT_SCHEMA_VERSION,
  DEPENDENCY_ARTIFACT_SMOKE_SCHEMA_VERSION,
  DEPENDENCY_ARTIFACT_TYPE,
  DependencyArtifactError,
  MAX_MANIFEST_BYTES,
  auditDependencyTree,
  buildDependencyArtifactManifest,
  detectDependencyRuntime,
  dependencyArtifactPaths,
  extractDependencyArchive,
  parseDependencyArtifactManifest,
  prepareDependencyArtifactTree,
  readDependencyArtifactManifest,
  readSmokeProcessIdentity,
  runDependencyArtifactCli,
  runNativeBetterSqliteSmoke,
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
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "scripts", "control-plane-db-snapshot-gate.mjs"), "export default true;\n");
  writeFileSync(join(nodeModules, "better-sqlite3", "index.js"), "module.exports = {};\n");
  writeFileSync(join(nodeModules, "better-sqlite3", "package.json"), '{"version":"12.10.0"}\n');
  const archiveBytes = Buffer.from("archive-fixture\n");
  const archivePath = join(root, "node-modules.tar");
  writeFileSync(archivePath, archiveBytes);
  const tree = auditDependencyTree(nodeModules, { enforceOwnership: false, checkAclCapabilities: () => true });
  const manifest = {
    schemaVersion: "2", type: DEPENDENCY_ARTIFACT_TYPE, state: "verified", releaseUnit: "control-plane-app",
    sourceCommit: "a".repeat(40), artifactRelease: "ci-20260819",
    package: { sha256: hash(packageJson), sizeBytes: packageJson.length },
    packageLock: { sha256: hash(packageLock), sizeBytes: packageLock.length },
    archive: { fileName: "node-modules.tar", sha256: hash(archiveBytes), sizeBytes: archiveBytes.length },
    runtime,
    smoke: { betterSqlite3Memory: true, snapshotImport: true },
    tree: { sha256: tree.sha256, entryCount: tree.entryCount, totalBytes: tree.totalBytes, hardlinksBroken: true, symlinksInternal: true },
    provenance: { builder: "github-actions", workflow: "control-plane-dependency-artifact.yml" }
  };
  return { root, nodeModules, packageJson, packageLock, archivePath, archiveBytes, manifest, tree };
}

function cleanup(root) { try { rmSync(root, { recursive: true, force: true }); } catch {} }

test("dependency manifest accepts formatting but rejects duplicate keys", () => {
  const value = {
    schemaVersion: "2", type: DEPENDENCY_ARTIFACT_TYPE, state: "verified", releaseUnit: "control-plane-app", sourceCommit: "a".repeat(40), artifactRelease: "ci",
    package: { sha256: "b".repeat(64), sizeBytes: 1 }, packageLock: { sha256: "c".repeat(64), sizeBytes: 1 },
    archive: { fileName: "node-modules.tar", sha256: "d".repeat(64), sizeBytes: 1 }, runtime,
    smoke: { betterSqlite3Memory: true, snapshotImport: true }, tree: { sha256: "e".repeat(64), entryCount: 1, totalBytes: 1, hardlinksBroken: true, symlinksInternal: true }, provenance: { builder: "github-actions", workflow: "control-plane-dependency-artifact.yml" }
  };
  const parsed = parseDependencyArtifactManifest({ bytes: Buffer.from(`${JSON.stringify(value, null, 2)}\r\n`) });
  assert.equal(parsed.value.type, DEPENDENCY_ARTIFACT_TYPE);
  assert.equal(parsed.value.schemaVersion, "2");
  assert.equal(DEPENDENCY_ARTIFACT_SCHEMA_VERSION, "2");
  assert.throws(() => parseDependencyArtifactManifest({ bytes: Buffer.from(JSON.stringify({ ...value, schemaVersion: "1" })) }), condition("dependency_artifact_invalid"));
  const missingBudget = { ...value, tree: { ...value.tree } };
  delete missingBudget.tree.totalBytes;
  assert.throws(() => parseDependencyArtifactManifest({ bytes: Buffer.from(JSON.stringify(missingBudget)) }), condition("dependency_tree_invalid"));
  assert.throws(() => parseDependencyArtifactManifest({ bytes: Buffer.from('{"schemaVersion":"2","schemaVersion":"2"}') }), condition("dependency_artifact_invalid"));
});

test("dependency manifest applies a bounded pre-parse size gate", () => {
  assert.throws(
    () => parseDependencyArtifactManifest({ bytes: Buffer.alloc(MAX_MANIFEST_BYTES + 1, 0x20) }),
    condition("dependency_artifact_invalid")
  );
  const root = makeRoot("manifest-size");
  const path = join(root, "dependency-artifact.json");
  try {
    writeFileSync(path, Buffer.alloc(MAX_MANIFEST_BYTES + 1, 0x20));
    assert.throws(() => readDependencyArtifactManifest(path), condition("dependency_artifact_invalid"));
  } finally { cleanup(root); }
});

test("production consumer paths are derived from the fixed deployment layout", () => {
  const paths = dependencyArtifactPaths({ deploymentRoot: "/opt/proxy-gateway-minimal-candidate", candidateRelease: "cca5332573d3" });
  assert.equal(paths.manifestPath, resolve("/opt/proxy-gateway-minimal-candidate", "dependency-artifacts", "cca5332573d3", "dependency-artifact.json"));
  assert.equal(paths.releaseLabelPath, resolve("/opt/proxy-gateway-minimal-candidate", "dependency-artifacts", "cca5332573d3", "release-label.txt"));
  assert.throws(() => dependencyArtifactPaths({ deploymentRoot: "/opt/root", candidateRelease: "../escape" }), condition("dependency_path_invalid"));
});

test("producer emits a v2 manifest with bounded tree evidence", { skip: process.platform !== "linux" }, () => {
  const value = fixture("schema-v2-producer-source");
  const extracted = fixture("schema-v2-producer-extracted");
  try {
    symlinkSync("index.js", join(extracted.nodeModules, "better-sqlite3", "internal-bin"));
    const expectedTree = auditDependencyTree(extracted.nodeModules, { enforceOwnership: false, checkAclCapabilities: () => true });
    const result = buildDependencyArtifactManifest({
      sourceCommit: value.manifest.sourceCommit,
      artifactRelease: value.manifest.artifactRelease,
      packageJsonBytes: value.packageJson,
      packageLockBytes: value.packageLock,
      archivePath: value.archivePath,
      root: value.root,
      runtime: {
        enforceOwnership: false,
        detect: ({ root }) => { assert.equal(root, extracted.root); return runtime; },
        listArchive: () => Buffer.from("node_modules\0node_modules/better-sqlite3/\0node_modules/better-sqlite3/index.js\0node_modules/better-sqlite3/package.json\0"),
        extractArchive: () => ({ root: extracted.root, nodeModulesRoot: extracted.nodeModules, cleanup: () => {} }),
        checkAclCapabilities: () => true,
        nativeSmoke: () => true
      }
    });
    assert.equal(result.value.schemaVersion, DEPENDENCY_ARTIFACT_SCHEMA_VERSION);
    assert.equal(result.value.tree.totalBytes, expectedTree.totalBytes);
    assert.equal(result.value.tree.entryCount, expectedTree.entryCount);
    assert.equal(parseDependencyArtifactManifest({ bytes: result.bytes }).value.schemaVersion, "2");
  } finally {
    cleanup(extracted.root);
    cleanup(value.root);
  }
});

test("consumer verifies package-lock, runtime, archive, tree and native smoke together", () => {
  const value = fixture();
  try {
    const result = verifyDependencyArtifact({
      manifestBytes: Buffer.from(`${JSON.stringify(value.manifest, null, 2)}\n`), archivePath: value.archivePath,
      packageJsonBytes: value.packageJson, packageLockBytes: value.packageLock, expectedSourceCommit: "a".repeat(40),
      nodeModulesRoot: value.nodeModules,
      runtime: { enforceOwnership: false, detect: () => runtime, listArchive: () => Buffer.from("node_modules\0node_modules/better-sqlite3/\0node_modules/better-sqlite3/index.js\0node_modules/better-sqlite3/package.json\0"), extractArchive: () => ({ root: value.root, nodeModulesRoot: value.nodeModules, cleanup: () => {} }), checkAclCapabilities: () => true, nativeSmoke: () => true }
    });
    assert.equal(result.state, "verified");
    assert.equal(result.tree.entryCount, value.tree.entryCount);
    assert.equal(result.smoke.betterSqlite3Memory, true);
  } finally { cleanup(value.root); }
});

test("clean consumer derives dependency runtime from the extracted artifact tree", () => {
  const value = fixture("clean-consumer-artifact");
  const sourceRoot = makeRoot("clean-consumer-source");
  writeFileSync(join(sourceRoot, "package.json"), value.packageJson);
  writeFileSync(join(sourceRoot, "package-lock.json"), value.packageLock);
  let detectedRoot = null;
  const trace = [];
  try {
    assert.equal(existsSync(join(sourceRoot, "node_modules")), false);
    const result = verifyDependencyArtifact({
      manifestBytes: Buffer.from(`${JSON.stringify(value.manifest, null, 2)}\n`), archivePath: value.archivePath,
      packageJsonBytes: value.packageJson, packageLockBytes: value.packageLock,
      expectedSourceCommit: value.manifest.sourceCommit, expectedArtifactRelease: value.manifest.artifactRelease,
      projectRoot: sourceRoot,
      runtime: {
        enforceOwnership: false,
        detect: ({ root }) => { trace.push("detect"); detectedRoot = root; return runtime; },
        listArchive: () => { trace.push("list"); return Buffer.from("node_modules\0node_modules/better-sqlite3/\0node_modules/better-sqlite3/index.js\0node_modules/better-sqlite3/package.json\0"); },
        extractArchive: () => { trace.push("extract"); return { root: value.root, nodeModulesRoot: value.nodeModules, cleanup: () => trace.push("cleanup") }; },
        checkAclCapabilities: () => { trace.push("audit"); return true; },
        nativeSmoke: () => { trace.push("smoke"); return true; }
      }
    });
    assert.equal(result.state, "verified");
    assert.equal(detectedRoot, value.root);
    assert.deepEqual(trace, ["list", "extract", "audit", "detect", "smoke", "cleanup"]);

    const mismatchTrace = [];
    assert.throws(() => verifyDependencyArtifact({
      manifestBytes: Buffer.from(`${JSON.stringify(value.manifest, null, 2)}\n`), archivePath: value.archivePath,
      packageJsonBytes: value.packageJson, packageLockBytes: value.packageLock,
      expectedSourceCommit: value.manifest.sourceCommit, expectedArtifactRelease: value.manifest.artifactRelease,
      projectRoot: sourceRoot,
      runtime: {
        enforceOwnership: false,
        detect: () => { mismatchTrace.push("detect"); return { ...runtime, nodeAbi: "999" }; },
        listArchive: () => { mismatchTrace.push("list"); return Buffer.from("node_modules\0node_modules/better-sqlite3/\0node_modules/better-sqlite3/index.js\0node_modules/better-sqlite3/package.json\0"); },
        extractArchive: () => { mismatchTrace.push("extract"); return { root: value.root, nodeModulesRoot: value.nodeModules, cleanup: () => mismatchTrace.push("cleanup") }; },
        checkAclCapabilities: () => { mismatchTrace.push("audit"); return true; },
        nativeSmoke: () => { mismatchTrace.push("smoke"); return true; }
      }
    }), condition("dependency_runtime_mismatch"));
    assert.deepEqual(mismatchTrace, ["list", "extract", "audit", "detect", "cleanup"]);
  } finally {
    cleanup(sourceRoot);
    cleanup(value.root);
  }
});

test("consumer rejects an archive manifest size-field drift", () => {
  const value = fixture("archive-size-drift");
  try {
    const manifest = { ...value.manifest, archive: { ...value.manifest.archive, sizeBytes: value.archiveBytes.length + 1 } };
    assert.throws(() => verifyDependencyArtifact({
      manifestBytes: Buffer.from(JSON.stringify(manifest)), archivePath: value.archivePath,
      packageJsonBytes: value.packageJson, packageLockBytes: value.packageLock,
      expectedSourceCommit: manifest.sourceCommit, expectedArtifactRelease: manifest.artifactRelease,
      projectRoot: value.root, nodeModulesRoot: value.nodeModules,
      runtime: { enforceOwnership: false, detect: () => runtime, listArchive: () => Buffer.from("node_modules\0"), extractArchive: () => ({ root: value.root, nodeModulesRoot: value.nodeModules, cleanup: () => {} }), checkAclCapabilities: () => true, nativeSmoke: () => true }
    }), condition("dependency_archive_mismatch"));
  } finally { cleanup(value.root); }
});

test("native smoke rejects snapshot paths outside the fixed repository path before execution", () => {
  const value = fixture("snapshot-boundary"); let calls = 0;
  try {
    assert.throws(() => runNativeBetterSqliteSmoke({ root: value.root, snapshotModule: "../escape.mjs", runtime: { nativeSmoke: () => { calls += 1; return true; } } }), condition("dependency_smoke_invalid"));
    assert.throws(() => runNativeBetterSqliteSmoke({ root: value.root, snapshotModule: join(value.root, "outside.mjs"), runtime: { nativeSmoke: () => { calls += 1; return true; } } }), condition("dependency_smoke_invalid"));
    assert.throws(() => runNativeBetterSqliteSmoke({ root: value.root, snapshotModule: "scripts/other.mjs", runtime: { nativeSmoke: () => { calls += 1; return true; } } }), condition("dependency_smoke_invalid"));
    assert.equal(calls, 0);
  } finally { cleanup(value.root); }
});

test("native smoke rejects a fixed snapshot path implemented as an escaping symlink", { skip: process.platform !== "linux" }, () => {
  const value = fixture("snapshot-symlink"); let calls = 0;
  try {
    writeFileSync(join(value.root, "outside.mjs"), "export default false;\n");
    unlinkSync(join(value.root, "scripts", "control-plane-db-snapshot-gate.mjs"));
    symlinkSync(join(value.root, "outside.mjs"), join(value.root, "scripts", "control-plane-db-snapshot-gate.mjs"));
    assert.throws(() => runNativeBetterSqliteSmoke({ root: value.root, runtime: { nativeSmoke: () => { calls += 1; return true; } } }), condition("dependency_smoke_invalid"));
    assert.equal(calls, 0);
  } finally { cleanup(value.root); }
});

test("verify CLI requires and enforces source commit and release identity", async () => {
  const value = fixture("cli-identity");
  const manifestPath = join(value.root, "dependency-artifact.json");
  writeFileSync(manifestPath, `${JSON.stringify(value.manifest)}\n`);
  const runtimeFixture = { detect: () => runtime, listArchive: () => Buffer.from("node_modules\0"), checkAclCapabilities: () => true, extractArchive: () => ({ root: value.root, nodeModulesRoot: value.nodeModules, cleanup: () => {} }), nativeSmoke: () => true };
  const invoke = async (args) => {
    const output = []; const errors = [];
    const code = await runDependencyArtifactCli({ argv: args, stdout: { write: (chunk) => output.push(String(chunk)) }, stderr: { write: (chunk) => errors.push(String(chunk)) }, runtime: runtimeFixture });
    return { code, stdout: output.join(""), stderr: errors.join("") };
  };
  try {
    const base = ["--mode", "verify", "--root", value.root, "--archive", value.archivePath, "--manifest", manifestPath];
    assert.equal((await invoke(base)).stderr.includes("dependency_cli_invalid"), true);
    const wrongSource = await invoke([...base, "--source-commit", "b".repeat(40), "--release", value.manifest.artifactRelease]);
    assert.equal(wrongSource.code, 1); assert.match(wrongSource.stderr, /dependency_source_mismatch/);
    const wrongRelease = await invoke([...base, "--source-commit", value.manifest.sourceCommit, "--release", "wrong-release"]);
    assert.equal(wrongRelease.code, 1); assert.match(wrongRelease.stderr, /dependency_release_mismatch/);
  } finally { cleanup(value.root); }
});

test("consumer rejects lock drift and runtime ABI drift", () => {
  const value = fixture("mismatch");
  const args = {
    manifestBytes: Buffer.from(JSON.stringify(value.manifest)), archivePath: value.archivePath, packageJsonBytes: value.packageJson, packageLockBytes: value.packageLock,
    runtime: { enforceOwnership: false, detect: () => runtime, listArchive: () => Buffer.from("node_modules\0"), extractArchive: () => ({ root: value.root, nodeModulesRoot: value.nodeModules, cleanup: () => {} }), checkAclCapabilities: () => true }
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

test("consumer rejects a tree byte-budget drift before native smoke", () => {
  const value = fixture("tree-byte-drift");
  let smokeCalls = 0;
  try {
    const manifest = { ...value.manifest, tree: { ...value.manifest.tree, totalBytes: value.manifest.tree.totalBytes + 1 } };
    assert.throws(() => verifyDependencyArtifact({
      manifestBytes: Buffer.from(JSON.stringify(manifest)), archivePath: value.archivePath,
      packageJsonBytes: value.packageJson, packageLockBytes: value.packageLock,
      expectedSourceCommit: manifest.sourceCommit, expectedArtifactRelease: manifest.artifactRelease,
      projectRoot: value.root, nodeModulesRoot: value.nodeModules,
      runtime: {
        enforceOwnership: false,
        detect: () => runtime,
        listArchive: () => Buffer.from("node_modules\0"),
        extractArchive: () => ({ root: value.root, nodeModulesRoot: value.nodeModules, cleanup: () => {} }),
        checkAclCapabilities: () => true,
        nativeSmoke: () => { smokeCalls += 1; return true; }
      }
    }), condition("dependency_tree_mismatch"));
    assert.equal(smokeCalls, 0);
  } finally { cleanup(value.root); }
});

test("consumer rejects an expected artifact identity before extraction", () => {
  const value = fixture("expected-identity");
  let extractionCalls = 0;
  try {
    assert.throws(
      () => prepareDependencyArtifactTree({
        manifestBytes: Buffer.from(JSON.stringify(value.manifest)),
        archivePath: value.archivePath,
        packageJsonBytes: value.packageJson,
        packageLockBytes: value.packageLock,
        expectedManifestSha256: "f".repeat(64),
        runtime: {
          enforceOwnership: false,
          extractArchive: () => { extractionCalls += 1; return { root: value.root, nodeModulesRoot: value.nodeModules, cleanup: () => {} }; }
        }
      }),
      condition("dependency_file_changed")
    );
    assert.equal(extractionCalls, 0);
  } finally { cleanup(value.root); }
});

test("Linux runtime detection rejects a relative npm executable before invocation", { skip: process.platform !== "linux" }, () => {
  assert.throws(
    () => detectDependencyRuntime({ root: "/", nodePath: "/usr/bin/node", npmPath: "npm" }),
    condition("dependency_runtime_invalid")
  );
});

test("Linux runtime detection records the selected node binary runtime", { skip: process.platform !== "linux" }, () => {
  const value = fixture("runtime-probe");
  try {
    const selectedNode = spawnSync(process.execPath, ["--version"], { encoding: "utf8" }).stdout.trim();
    const detected = detectDependencyRuntime({ root: value.root, nodePath: process.execPath, npmPath: resolve(dirname(process.execPath), "npm"), npmVersion: runtime.npmVersion });
    assert.equal(detected.nodeVersion, selectedNode);
    assert.match(detected.nodeAbi, /^[0-9]+$/);
    assert.match(detected.arch, /^[a-z0-9._-]+$/);
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

test("Linux consumer extracts the archive before auditing the dependency tree", { skip: process.platform !== "linux" }, () => {
  const value = fixture("archive-authoritative");
  const realArchive = join(value.root, "real-node-modules.tar");
  try {
    const tar = spawnSync("tar", ["--create", "--file", realArchive, "--format=posix", "--sort=name", "--mtime=UTC 1970-01-01", "--owner=0", "--group=0", "--numeric-owner", "--hard-dereference", "--", "node_modules"], { cwd: value.root, encoding: "utf8" });
    assert.equal(tar.status, 0, String(tar.stderr || ""));
    const extracted = extractDependencyArchive(realArchive);
    try {
      const extractedTree = auditDependencyTree(extracted.nodeModulesRoot, { enforceOwnership: false, checkAclCapabilities: () => true });
      assert.equal(extractedTree.entryCount, value.tree.entryCount);
      assert.equal(readFileSync(join(extracted.nodeModulesRoot, "better-sqlite3", "package.json"), "utf8"), '{"version":"12.10.0"}\n');
      assert.notEqual(statSync(join(extracted.nodeModulesRoot, "better-sqlite3", "package.json")).ino, statSync(join(value.nodeModules, "better-sqlite3", "package.json")).ino);
    } finally { extracted.cleanup(); }
  } finally { cleanup(value.root); }
});

test("consumer fails closed when the native smoke runner fails", () => {
  const value = fixture("smoke-failure");
  try {
    assert.throws(() => verifyDependencyArtifact({
      manifestBytes: Buffer.from(JSON.stringify(value.manifest)), archivePath: value.archivePath,
      packageJsonBytes: value.packageJson, packageLockBytes: value.packageLock, nodeModulesRoot: value.nodeModules,
      runtime: { enforceOwnership: false, detect: () => runtime, listArchive: () => Buffer.from("node_modules\0node_modules/better-sqlite3/\0node_modules/better-sqlite3/index.js\0node_modules/better-sqlite3/package.json\0"), extractArchive: () => ({ root: value.root, nodeModulesRoot: value.nodeModules, cleanup: () => {} }), checkAclCapabilities: () => true, nativeSmoke: () => false }
    }), condition("native_module_validation_failed"));
  } finally { cleanup(value.root); }
});

test("Ubuntu workflow is a CI artifact producer, not a production builder", () => {
  const workflow = readFileSync(resolve(".github/workflows/control-plane-dependency-artifact.yml"), "utf8");
  const uploadIndex = workflow.indexOf("- name: Upload dependency artifact on non-PR refs");
  const uploadStep = workflow.slice(uploadIndex);
  const installCommands = workflow.match(/npm ci --omit=dev --no-audit --no-fund/g) ?? [];
  const firstArchiveIndex = workflow.indexOf("--file .dependency-artifacts/node-modules-a.tar");
  const secondInstallIndex = workflow.indexOf("npm ci --omit=dev --no-audit --no-fund", firstArchiveIndex);
  const secondArchiveIndex = workflow.indexOf("--file .dependency-artifacts/node-modules-b.tar");

  assert.ok(uploadIndex >= 0, "workflow must define the dependency artifact upload step");
  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.match(workflow, /node-version: 22\.23\.1/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(workflow, /source_commit="\$\(git rev-parse HEAD\)"/);
  assert.match(workflow, /test "\$source_commit" = "\$EXPECTED_SOURCE_COMMIT"/);
  assert.equal(installCommands.length, 2, "workflow must create two independent lockfile installs");
  assert.match(workflow, /--mode smoke/);
  assert.match(workflow, /--mode build/);
  assert.match(workflow, /--mode verify/);
  assert.match(workflow, /--hard-dereference/);
  assert.match(workflow, /--pax-option=delete=atime,delete=ctime,delete=SCHILY\.dev,delete=SCHILY\.ino,delete=SCHILY\.nlink/);
  assert.match(workflow, /node-modules-a\.tar/);
  assert.match(workflow, /node-modules-b\.tar/);
  assert.ok(firstArchiveIndex >= 0 && secondInstallIndex > firstArchiveIndex && secondArchiveIndex > secondInstallIndex,
    "the second archive must be created from a fresh second npm ci");
  assert.match(workflow, /cmp --silent/);
  assert.match(workflow, /mv \.dependency-artifacts\/node-modules-b\.tar \.dependency-artifacts\/node-modules\.tar/);
  assert.match(workflow, /actions\/upload-artifact@v7/);
  assert.match(uploadStep, /\.dependency-artifacts\/node-modules\.tar/);
  assert.match(uploadStep, /\.dependency-artifacts\/dependency-artifact\.json/);
  assert.match(uploadStep, /\.dependency-artifacts\/release-label\.txt/);
  assert.match(uploadStep, /include-hidden-files:\s*true/);
  assert.doesNotMatch(uploadStep, /path:\s*\.dependency-artifacts\s*(?:\r?\n|$)/);
  assert.doesNotMatch(workflow, /\b(?:ssh|scp|rsync|systemctl|systemd-run)\b/i);
  assert.doesNotMatch(workflow, /\.env|CONSOLE_TOKEN|SS_PASSWORD|subscription/i);
});

test("smoke CLI exports a dedicated smoke schema version that does not change the artifact manifest version", () => {
  assert.equal(DEPENDENCY_ARTIFACT_SMOKE_SCHEMA_VERSION, "3");
  assert.equal(DEPENDENCY_ARTIFACT_SCHEMA_VERSION, "2");
  assert.notEqual(DEPENDENCY_ARTIFACT_SMOKE_SCHEMA_VERSION, DEPENDENCY_ARTIFACT_SCHEMA_VERSION);
});

test("smoke CLI emits the exact schema-version-3 envelope using injected getuid/getgid", async () => {
  const value = fixture("smoke-cli-v3-envelope");
  const invoke = async (runtime) => {
    const output = []; const errors = [];
    const code = await runDependencyArtifactCli({
      argv: ["--mode", "smoke", "--root", value.root],
      stdout: { write: (chunk) => output.push(String(chunk)) },
      stderr: { write: (chunk) => errors.push(String(chunk)) },
      runtime
    });
    return { code, stdout: output.join(""), stderr: errors.join("") };
  };
  try {
    const { code, stdout, stderr } = await invoke({ nativeSmoke: () => true, getuid: () => 4711, getgid: () => 4712 });
    assert.equal(code, 0, stderr);
    assert.equal(stderr, "");
    const parsed = JSON.parse(stdout);
    assert.deepEqual(parsed, {
      schemaVersion: DEPENDENCY_ARTIFACT_SMOKE_SCHEMA_VERSION,
      type: DEPENDENCY_ARTIFACT_TYPE,
      mode: "smoke",
      state: "verified",
      smoke: { betterSqlite3Memory: true, snapshotImport: true },
      processIdentity: { uid: 4711, gid: 4712 }
    });
    assert.deepEqual(Object.keys(parsed).sort(), ["mode", "processIdentity", "schemaVersion", "smoke", "state", "type"]);
    assert.deepEqual(Object.keys(parsed.smoke).sort(), ["betterSqlite3Memory", "snapshotImport"]);
    assert.deepEqual(Object.keys(parsed.processIdentity).sort(), ["gid", "uid"]);
  } finally { cleanup(value.root); }
});

test("smoke CLI failure uses the dedicated schema-version-3 envelope", async () => {
  const value = fixture("smoke-cli-v3-failure-envelope");
  const output = []; const errors = [];
  try {
    const code = await runDependencyArtifactCli({
      argv: ["--mode", "smoke", "--root", value.root],
      stdout: { write: (chunk) => output.push(String(chunk)) },
      stderr: { write: (chunk) => errors.push(String(chunk)) },
      runtime: { nativeSmoke: () => true, getuid: () => 0, getgid: () => 4712 }
    });
    assert.equal(code, 1);
    assert.deepEqual(output, []);
    assert.deepEqual(JSON.parse(errors.join("")), {
      schemaVersion: DEPENDENCY_ARTIFACT_SMOKE_SCHEMA_VERSION,
      type: DEPENDENCY_ARTIFACT_TYPE,
      mode: "smoke",
      state: "blocked",
      condition: "dependency_smoke_invalid"
    });
  } finally { cleanup(value.root); }
});

test("native smoke result shape remains exactly two-key regardless of processIdentity", () => {
  const value = fixture("smoke-shape-strict");
  try {
    const result = runNativeBetterSqliteSmoke({ root: value.root, runtime: { nativeSmoke: () => true, getuid: () => 4711, getgid: () => 4712 } });
    assert.deepEqual(result, { betterSqlite3Memory: true, snapshotImport: true });
    assert.deepEqual(Object.keys(result).sort(), ["betterSqlite3Memory", "snapshotImport"]);
  } finally { cleanup(value.root); }
});

test("artifact manifest smoke block remains exactly two-key regardless of producer runtime", () => {
  const value = fixture("manifest-smoke-strict");
  try {
    const result = verifyDependencyArtifact({
      manifestBytes: Buffer.from(`${JSON.stringify(value.manifest, null, 2)}\n`),
      archivePath: value.archivePath,
      packageJsonBytes: value.packageJson,
      packageLockBytes: value.packageLock,
      expectedSourceCommit: value.manifest.sourceCommit,
      expectedArtifactRelease: value.manifest.artifactRelease,
      nodeModulesRoot: value.nodeModules,
      runtime: { enforceOwnership: false, detect: () => runtime, listArchive: () => Buffer.from("node_modules\0"), extractArchive: () => ({ root: value.root, nodeModulesRoot: value.nodeModules, cleanup: () => {} }), checkAclCapabilities: () => true, nativeSmoke: () => true, getuid: () => 4711, getgid: () => 4712 }
    });
    assert.deepEqual(result.smoke, { betterSqlite3Memory: true, snapshotImport: true });
  } finally { cleanup(value.root); }
});

test("smoke CLI rejects zero, negative, float, string, unsafe and null identities", async () => {
  const value = fixture("smoke-cli-bad-id");
  const cases = [
    { getuid: () => 0, getgid: () => 4712, name: "uid=0" },
    { getuid: () => 4711, getgid: () => 0, name: "gid=0" },
    { getuid: () => -1, getgid: () => 4712, name: "uid=-1" },
    { getuid: () => 4711, getgid: () => -2, name: "gid=-2" },
    { getuid: () => 1.5, getgid: () => 4712, name: "uid=1.5" },
    { getuid: () => 4711, getgid: () => 1.5, name: "gid=1.5" },
    { getuid: () => "4711", getgid: () => 4712, name: "uid=string" },
    { getuid: () => 4711, getgid: () => "4712", name: "gid=string" },
    { getuid: () => Number.MAX_SAFE_INTEGER + 2, getgid: () => 4712, name: "uid=unsafe-integer" },
    { getuid: () => null, getgid: () => 4712, name: "uid=null" },
    { getuid: () => 4711, getgid: () => null, name: "gid=null" },
    { getuid: () => undefined, getgid: () => 4712, name: "uid=undefined" }
  ];
  try {
    for (const testCase of cases) {
      const output = []; const errors = [];
      const code = await runDependencyArtifactCli({
        argv: ["--mode", "smoke", "--root", value.root],
        stdout: { write: (chunk) => output.push(String(chunk)) },
        stderr: { write: (chunk) => errors.push(String(chunk)) },
        runtime: { nativeSmoke: () => true, getuid: testCase.getuid, getgid: testCase.getgid }
      });
      assert.equal(code, 1, testCase.name);
      assert.equal(output.length, 0, testCase.name);
      assert.match(errors.join(""), /dependency_smoke_invalid/, testCase.name);
    }
  } finally { cleanup(value.root); }
});

test("smoke CLI rejects partial or non-function identity hooks even when host process.getuid/getgid exist", async () => {
  // Regression: previously the implementation silently fell back to the host
  // process.getuid/getgid whenever a runtime hook was missing or not a
  // function, so partial / non-function runtime inputs were accepted.
  const value = fixture("smoke-cli-partial-id");
  const originalGetuid = Object.getOwnPropertyDescriptor(process, "getuid");
  const originalGetgid = Object.getOwnPropertyDescriptor(process, "getgid");
  const installHostIdentity = () => {
    Object.defineProperty(process, "getuid", { value: () => 4711, configurable: true, writable: true });
    Object.defineProperty(process, "getgid", { value: () => 4712, configurable: true, writable: true });
  };
  const restoreHostIdentity = () => {
    if (originalGetuid) Object.defineProperty(process, "getuid", originalGetuid);
    else delete process.getuid;
    if (originalGetgid) Object.defineProperty(process, "getgid", originalGetgid);
    else delete process.getgid;
  };
  const cases = [
    { name: "no getuid (only getgid as function)", runtime: { nativeSmoke: () => true, getgid: () => 4712 } },
    { name: "no getgid (only getuid as function)", runtime: { nativeSmoke: () => true, getuid: () => 4711 } },
    { name: "both hooks present as non-functions", runtime: { nativeSmoke: () => true, getuid: 4711, getgid: 4712 } },
    { name: "getuid function + getgid non-function", runtime: { nativeSmoke: () => true, getuid: () => 4711, getgid: 4712 } },
    { name: "getuid non-function + getgid function", runtime: { nativeSmoke: () => true, getuid: 4711, getgid: () => 4712 } },
    { name: "both hooks present as null", runtime: { nativeSmoke: () => true, getuid: null, getgid: null } }
  ];
  try {
    installHostIdentity();
    for (const testCase of cases) {
      const output = []; const errors = [];
      const code = await runDependencyArtifactCli({
        argv: ["--mode", "smoke", "--root", value.root],
        stdout: { write: (chunk) => output.push(String(chunk)) },
        stderr: { write: (chunk) => errors.push(String(chunk)) },
        runtime: testCase.runtime
      });
      assert.equal(code, 1, testCase.name);
      assert.equal(output.length, 0, testCase.name);
      assert.match(errors.join(""), /dependency_smoke_invalid/, testCase.name);
    }
  } finally {
    restoreHostIdentity();
    cleanup(value.root);
  }
});

test("readSmokeProcessIdentity rejects both-non-function runtime hooks even with valid host identity", () => {
  // Direct regression on the exported function: both hooks as own properties
  // but neither is a function. Current implementation silently falls back to
  // the host process.getuid/getgid; the fixed implementation must fail.
  const originalGetuid = Object.getOwnPropertyDescriptor(process, "getuid");
  const originalGetgid = Object.getOwnPropertyDescriptor(process, "getgid");
  try {
    Object.defineProperty(process, "getuid", { value: () => 4711, configurable: true, writable: true });
    Object.defineProperty(process, "getgid", { value: () => 4712, configurable: true, writable: true });
    assert.throws(
      () => readSmokeProcessIdentity({ getuid: 4711, getgid: 4712 }),
      condition("dependency_smoke_invalid"),
      "both non-functions"
    );
    assert.throws(
      () => readSmokeProcessIdentity({ getuid: () => 4711, getgid: 4712 }),
      condition("dependency_smoke_invalid"),
      "function + non-function"
    );
    assert.throws(
      () => readSmokeProcessIdentity({ getuid: 4711, getgid: () => 4712 }),
      condition("dependency_smoke_invalid"),
      "non-function + function"
    );
  } finally {
    if (originalGetuid) Object.defineProperty(process, "getuid", originalGetuid);
    else delete process.getuid;
    if (originalGetgid) Object.defineProperty(process, "getgid", originalGetgid);
    else delete process.getgid;
  }
});

test("readSmokeProcessIdentity rejects single-hook runtime even with valid host identity", () => {
  const originalGetuid = Object.getOwnPropertyDescriptor(process, "getuid");
  const originalGetgid = Object.getOwnPropertyDescriptor(process, "getgid");
  try {
    Object.defineProperty(process, "getuid", { value: () => 4711, configurable: true, writable: true });
    Object.defineProperty(process, "getgid", { value: () => 4712, configurable: true, writable: true });
    assert.throws(
      () => readSmokeProcessIdentity({ getuid: () => 4711 }),
      condition("dependency_smoke_invalid"),
      "only getuid"
    );
    assert.throws(
      () => readSmokeProcessIdentity({ getgid: () => 4712 }),
      condition("dependency_smoke_invalid"),
      "only getgid"
    );
  } finally {
    if (originalGetuid) Object.defineProperty(process, "getuid", originalGetuid);
    else delete process.getuid;
    if (originalGetgid) Object.defineProperty(process, "getgid", originalGetgid);
    else delete process.getgid;
  }
});

test("readSmokeProcessIdentity falls back to host process.getuid/getgid when neither hook is supplied", () => {
  const originalGetuid = Object.getOwnPropertyDescriptor(process, "getuid");
  const originalGetgid = Object.getOwnPropertyDescriptor(process, "getgid");
  try {
    Object.defineProperty(process, "getuid", { value: () => 4711, configurable: true, writable: true });
    Object.defineProperty(process, "getgid", { value: () => 4712, configurable: true, writable: true });
    // Neither hook supplied: identity read from host.
    assert.deepEqual(readSmokeProcessIdentity({}), { uid: 4711, gid: 4712 });
    // Same when no runtime argument is given at all (default = {}).
    assert.deepEqual(readSmokeProcessIdentity(), { uid: 4711, gid: 4712 });
    // Unrelated properties on the runtime object do not trigger fallback.
    assert.deepEqual(readSmokeProcessIdentity({ nativeSmoke: () => true }), { uid: 4711, gid: 4712 });
  } finally {
    if (originalGetuid) Object.defineProperty(process, "getuid", originalGetuid);
    else delete process.getuid;
    if (originalGetgid) Object.defineProperty(process, "getgid", originalGetgid);
    else delete process.getgid;
  }
});

test("readSmokeProcessIdentity fails closed when host process.getuid/getgid are unavailable", () => {
  const originalGetuid = Object.getOwnPropertyDescriptor(process, "getuid");
  const originalGetgid = Object.getOwnPropertyDescriptor(process, "getgid");
  try {
    delete process.getuid;
    delete process.getgid;
    assert.throws(() => readSmokeProcessIdentity({}), condition("dependency_smoke_invalid"), "no hooks and no host");
    assert.throws(() => readSmokeProcessIdentity({ nativeSmoke: () => true }), condition("dependency_smoke_invalid"), "no hooks and no host with nativeSmoke");
  } finally {
    if (originalGetuid) Object.defineProperty(process, "getuid", originalGetuid);
    else delete process.getuid;
    if (originalGetgid) Object.defineProperty(process, "getgid", originalGetgid);
    else delete process.getgid;
  }
});

test("readSmokeProcessIdentity fails closed when host identity returns root or invalid value", () => {
  const originalGetuid = Object.getOwnPropertyDescriptor(process, "getuid");
  const originalGetgid = Object.getOwnPropertyDescriptor(process, "getgid");
  try {
    // Root identity on host.
    Object.defineProperty(process, "getuid", { value: () => 0, configurable: true, writable: true });
    Object.defineProperty(process, "getgid", { value: () => 0, configurable: true, writable: true });
    assert.throws(() => readSmokeProcessIdentity({}), condition("dependency_smoke_invalid"), "host root");
    // Host functions throw.
    Object.defineProperty(process, "getuid", { value: () => { throw new Error("host getuid failed"); }, configurable: true, writable: true });
    Object.defineProperty(process, "getgid", { value: () => 4712, configurable: true, writable: true });
    assert.throws(() => readSmokeProcessIdentity({}), condition("dependency_smoke_invalid"), "host throws");
    // Host functions return invalid types.
    Object.defineProperty(process, "getuid", { value: () => 1.5, configurable: true, writable: true });
    Object.defineProperty(process, "getgid", { value: () => 4712, configurable: true, writable: true });
    assert.throws(() => readSmokeProcessIdentity({}), condition("dependency_smoke_invalid"), "host float");
  } finally {
    if (originalGetuid) Object.defineProperty(process, "getuid", originalGetuid);
    else delete process.getuid;
    if (originalGetgid) Object.defineProperty(process, "getgid", originalGetgid);
    else delete process.getgid;
  }
});

test("readSmokeProcessIdentity ignores inherited runtime.getuid/getgid (Object.hasOwn check)", () => {
  const originalGetuid = Object.getOwnPropertyDescriptor(process, "getuid");
  const originalGetgid = Object.getOwnPropertyDescriptor(process, "getgid");
  try {
    Object.defineProperty(process, "getuid", { value: () => 4711, configurable: true, writable: true });
    Object.defineProperty(process, "getgid", { value: () => 4712, configurable: true, writable: true });
    // Inherited functions must NOT count as explicit injection.
    const proto = { getuid: () => 9999, getgid: () => 8888 };
    const runtime = Object.create(proto);
    assert.deepEqual(readSmokeProcessIdentity(runtime), { uid: 4711, gid: 4712 });
  } finally {
    if (originalGetuid) Object.defineProperty(process, "getuid", originalGetuid);
    else delete process.getuid;
    if (originalGetgid) Object.defineProperty(process, "getgid", originalGetgid);
    else delete process.getgid;
  }
});

test("readSmokeProcessIdentity accepts both injected functions with valid positive UID/GID", () => {
  const result = readSmokeProcessIdentity({ getuid: () => 4711, getgid: () => 4712 });
  assert.deepEqual(result, { uid: 4711, gid: 4712 });
});

test("readSmokeProcessIdentity rejects injected getters that throw", () => {
  assert.throws(
    () => readSmokeProcessIdentity({ getuid: () => { throw new Error("boom"); }, getgid: () => 4712 }),
    condition("dependency_smoke_invalid"),
    "getuid throws"
  );
  assert.throws(
    () => readSmokeProcessIdentity({ getuid: () => 4711, getgid: () => { throw new Error("boom"); } }),
    condition("dependency_smoke_invalid"),
    "getgid throws"
  );
});

test("readSmokeProcessIdentity rejects injected getters returning zero, negative, float, string, null, undefined, or unsafe integer", () => {
  const cases = [
    { getuid: () => 0, getgid: () => 4712, name: "uid=0" },
    { getuid: () => 4711, getgid: () => 0, name: "gid=0" },
    { getuid: () => -1, getgid: () => 4712, name: "uid=-1" },
    { getuid: () => 4711, getgid: () => -2, name: "gid=-2" },
    { getuid: () => 1.5, getgid: () => 4712, name: "uid=float" },
    { getuid: () => 4711, getgid: () => 1.5, name: "gid=float" },
    { getuid: () => "4711", getgid: () => 4712, name: "uid=string" },
    { getuid: () => 4711, getgid: () => "4712", name: "gid=string" },
    { getuid: () => null, getgid: () => 4712, name: "uid=null" },
    { getuid: () => 4711, getgid: () => null, name: "gid=null" },
    { getuid: () => undefined, getgid: () => 4712, name: "uid=undefined" },
    { getuid: () => Number.MAX_SAFE_INTEGER + 2, getgid: () => 4712, name: "uid=unsafe" }
  ];
  for (const testCase of cases) {
    assert.throws(
      () => readSmokeProcessIdentity({ getuid: testCase.getuid, getgid: testCase.getgid }),
      condition("dependency_smoke_invalid"),
      testCase.name
    );
  }
});

test("smoke CLI with no runtime identity injection succeeds on a non-root host and fails on a root or absent host", async () => {
  const value = fixture("smoke-cli-host-identity");
  const originalGetuid = Object.getOwnPropertyDescriptor(process, "getuid");
  const originalGetgid = Object.getOwnPropertyDescriptor(process, "getgid");
  try {
    // Simulate a non-root host.
    Object.defineProperty(process, "getuid", { value: () => 4711, configurable: true, writable: true });
    Object.defineProperty(process, "getgid", { value: () => 4712, configurable: true, writable: true });
    const successOutput = []; const successErrors = [];
    const successCode = await runDependencyArtifactCli({
      argv: ["--mode", "smoke", "--root", value.root],
      stdout: { write: (chunk) => successOutput.push(String(chunk)) },
      stderr: { write: (chunk) => successErrors.push(String(chunk)) },
      runtime: { nativeSmoke: () => true }
    });
    assert.equal(successCode, 0, successErrors.join(""));
    const parsed = JSON.parse(successOutput.join(""));
    assert.equal(parsed.processIdentity.uid, 4711);
    assert.equal(parsed.processIdentity.gid, 4712);

    // Now simulate a root host and expect failure.
    Object.defineProperty(process, "getuid", { value: () => 0, configurable: true, writable: true });
    Object.defineProperty(process, "getgid", { value: () => 0, configurable: true, writable: true });
    const rootOutput = []; const rootErrors = [];
    const rootCode = await runDependencyArtifactCli({
      argv: ["--mode", "smoke", "--root", value.root],
      stdout: { write: (chunk) => rootOutput.push(String(chunk)) },
      stderr: { write: (chunk) => rootErrors.push(String(chunk)) },
      runtime: { nativeSmoke: () => true }
    });
    assert.equal(rootCode, 1);
    assert.equal(rootOutput.length, 0);
    assert.match(rootErrors.join(""), /dependency_smoke_invalid/);

    // Now simulate an absent host and expect failure.
    delete process.getuid;
    delete process.getgid;
    const absentOutput = []; const absentErrors = [];
    const absentCode = await runDependencyArtifactCli({
      argv: ["--mode", "smoke", "--root", value.root],
      stdout: { write: (chunk) => absentOutput.push(String(chunk)) },
      stderr: { write: (chunk) => absentErrors.push(String(chunk)) },
      runtime: { nativeSmoke: () => true }
    });
    assert.equal(absentCode, 1);
    assert.equal(absentOutput.length, 0);
    assert.match(absentErrors.join(""), /dependency_smoke_invalid/);
  } finally {
    if (originalGetuid) Object.defineProperty(process, "getuid", originalGetuid);
    else delete process.getuid;
    if (originalGetgid) Object.defineProperty(process, "getgid", originalGetgid);
    else delete process.getgid;
    cleanup(value.root);
  }
});

test("smoke CLI rejects identity getter exceptions", async () => {
  const value = fixture("smoke-cli-throw-getter");
  try {
    const cases = [
      { name: "getuid throws", runtime: { nativeSmoke: () => true, getuid: () => { throw new Error("getuid failed"); }, getgid: () => 4712 } },
      { name: "getgid throws", runtime: { nativeSmoke: () => true, getuid: () => 4711, getgid: () => { throw new Error("getgid failed"); } } }
    ];
    for (const testCase of cases) {
      const output = []; const errors = [];
      const code = await runDependencyArtifactCli({
        argv: ["--mode", "smoke", "--root", value.root],
        stdout: { write: (chunk) => output.push(String(chunk)) },
        stderr: { write: (chunk) => errors.push(String(chunk)) },
        runtime: testCase.runtime
      });
      assert.equal(code, 1, testCase.name);
      assert.equal(output.length, 0, testCase.name);
      assert.match(errors.join(""), /dependency_smoke_invalid/, testCase.name);
    }
  } finally { cleanup(value.root); }
});

test("smoke CLI defaults to process.getuid/getgid when no runtime identity injection is provided", {
  skip: process.platform !== "linux" || typeof process.getuid !== "function" || typeof process.getgid !== "function" || process.getuid() <= 0 || process.getgid() <= 0
}, async () => {
  const value = fixture("smoke-cli-default-identity");
  try {
    const output = []; const errors = [];
    const code = await runDependencyArtifactCli({
      argv: ["--mode", "smoke", "--root", value.root],
      stdout: { write: (chunk) => output.push(String(chunk)) },
      stderr: { write: (chunk) => errors.push(String(chunk)) },
      runtime: { nativeSmoke: () => true }
    });
    assert.equal(code, 0, errors.join(""));
    const parsed = JSON.parse(output.join(""));
    assert.equal(parsed.processIdentity.uid, process.getuid());
    assert.equal(parsed.processIdentity.gid, process.getgid());
  } finally { cleanup(value.root); }
});
