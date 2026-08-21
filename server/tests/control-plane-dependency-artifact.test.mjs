import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, linkSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import assert from "node:assert/strict";

import {
  DEPENDENCY_ARTIFACT_SCHEMA_VERSION,
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
    const selectedNode = spawnSync("/usr/bin/node", ["--version"], { encoding: "utf8" }).stdout.trim();
    const detected = detectDependencyRuntime({ root: value.root, nodePath: "/usr/bin/node", npmPath: "/usr/bin/npm", npmVersion: runtime.npmVersion });
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
