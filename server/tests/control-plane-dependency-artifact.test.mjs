import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, linkSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

import {
  canonicalDependencyArtifactNativeCustodyMode,
  DEPENDENCY_ARTIFACT_SCHEMA_VERSION,
  DEPENDENCY_ARTIFACT_SMOKE_SCHEMA_VERSION,
  DEPENDENCY_ARTIFACT_TYPE,
  DependencyArtifactError,
  MAX_MANIFEST_BYTES,
  auditDependencyTree,
  buildDependencyArtifactManifest,
  calculateDependencyStorageBudget,
  detectDependencyRuntime,
  dependencyArtifactPaths,
  extractDependencyArchive,
  inspectWelcomeCoinsNativeCustodyBundle,
  parseDependencyArtifactManifest,
  prepareDependencyArtifactTree,
  readDependencyArtifactManifest,
  readSmokeProcessIdentity,
  runDependencyArtifactCli,
  runNativeBetterSqliteSmoke,
  validateDependencyArchiveEntries,
  verifyDependencyArtifact
} from "../../scripts/control-plane-dependency-artifact-lib.mjs";
import {
  canonicalWelcomeCoinsNativeBuildReceipt,
  WELCOME_COINS_NATIVE_BUILD_PROFILE,
  WELCOME_COINS_NATIVE_OUTPUTS
} from "../../scripts/control-plane-welcome-coins-native-build-lib.mjs";

const DEPENDENCY_LIBRARY_PATH = resolve("scripts/control-plane-dependency-artifact-lib.mjs");
const DEPENDENCY_CLI_PATH = resolve("scripts/control-plane-dependency-artifact-cli.mjs");
const DEPENDENCY_COMPATIBILITY_PATH = resolve("scripts/control-plane-dependency-artifact.mjs");

const hash = (value) => createHash("sha256").update(value).digest("hex");
const condition = (name) => (error) => error instanceof DependencyArtifactError && error.condition === name;
const NATIVE_PATHS = Object.freeze({
  receipt: "node_modules/.gccgw-native/welcome-coins-native-build.json",
  outerWrapper: "node_modules/.gccgw-native/welcome-coins-activation-outer-wrapper",
  outerPostExecBootstrap: "node_modules/.gccgw-native/welcome-coins-outer-post-exec-bootstrap.so",
  launcher: "node_modules/.gccgw-native/welcome-coins-custody-launcher",
  postExecBootstrap: "node_modules/.gccgw-native/welcome-coins-post-exec-bootstrap.so"
});
function nativeCustodyRecord({
  receiptBytes = Buffer.from("r"),
  outerWrapperBytes = Buffer.from("o"),
  outerPostExecBootstrapBytes = Buffer.from("p"),
  launcherBytes = Buffer.from("l"),
  postExecBootstrapBytes = Buffer.from("b")
} = {}) {
  return {
    schemaVersion: "1", type: "control_plane_welcome_coins_native_custody_bundle", buildProfile: WELCOME_COINS_NATIVE_BUILD_PROFILE.id,
    receipt: { path: NATIVE_PATHS.receipt, sha256: hash(receiptBytes), sizeBytes: receiptBytes.length, mode: "0644" },
    outerWrapper: { path: NATIVE_PATHS.outerWrapper, sha256: hash(outerWrapperBytes), sizeBytes: outerWrapperBytes.length, mode: "0755", kind: "static-pie" },
    outerPostExecBootstrap: { path: NATIVE_PATHS.outerPostExecBootstrap, sha256: hash(outerPostExecBootstrapBytes), sizeBytes: outerPostExecBootstrapBytes.length, mode: "0644", kind: "shared-object" },
    launcher: { path: NATIVE_PATHS.launcher, sha256: hash(launcherBytes), sizeBytes: launcherBytes.length, mode: "0755", kind: "pie" },
    postExecBootstrap: { path: NATIVE_PATHS.postExecBootstrap, sha256: hash(postExecBootstrapBytes), sizeBytes: postExecBootstrapBytes.length, mode: "0644", kind: "shared-object" }
  };
}
function stageNativeCustodyFixture(root, {
  outerWrapperMachine = 62,
  outerWrapperInterpreter = false,
  outerPostExecBootstrapMachine = 62,
  outerPostExecBootstrapInterpreter = false,
  launcherMachine = 62,
  launcherInterpreter = true,
  postExecBootstrapMachine = 62,
  postExecBootstrapInterpreter = false
} = {}) {
  const nativeRoot = join(root, "node_modules", ".gccgw-native");
  mkdirSync(nativeRoot, { recursive: true });
  const elf = ({ interpreter, machine, label }) => {
    const value = Buffer.alloc(128);
    value.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0], 0);
    value.writeUInt16LE(3, 16);
    value.writeUInt16LE(machine, 18);
    value.writeUInt32LE(1, 20);
    value.writeBigUInt64LE(64n, 32);
    value.writeUInt16LE(64, 52);
    value.writeUInt16LE(56, 54);
    value.writeUInt16LE(1, 56);
    value.writeUInt32LE(interpreter ? 3 : 1, 64);
    value.write(label, 120, "ascii");
    return value;
  };
  const bytes = Object.freeze({
    outerWrapper: elf({ interpreter: outerWrapperInterpreter, machine: outerWrapperMachine, label: "outer-wrapper" }),
    outerPostExecBootstrap: elf({ interpreter: outerPostExecBootstrapInterpreter, machine: outerPostExecBootstrapMachine, label: "outer-bootstrap" }),
    launcher: elf({ interpreter: launcherInterpreter, machine: launcherMachine, label: "launcher" }),
    postExecBootstrap: elf({ interpreter: postExecBootstrapInterpreter, machine: postExecBootstrapMachine, label: "bootstrap" })
  });
  const source = (path, marker) => ({ path, sha256: marker.repeat(64), sizeBytes: 1 });
  const output = (key, mode, kind) => ({
    path: WELCOME_COINS_NATIVE_OUTPUTS[key],
    sha256: hash(bytes[key]),
    sizeBytes: bytes[key].length,
    mode,
    kind
  });
  const flagDigest = (flags) => hash(Buffer.from(JSON.stringify(flags)));
  const commonFlags = [...WELCOME_COINS_NATIVE_BUILD_PROFILE.commonFlags];
  const receiptValue = {
    schemaVersion: "1", type: "welcome_coins_native_build", profile: WELCOME_COINS_NATIVE_BUILD_PROFILE.id,
    sources: {
      outerWrapper: source("scripts/native/welcome-coins-activation-outer-wrapper.c", "1"),
      outerPostExecBootstrap: source("scripts/native/welcome-coins-outer-post-exec-bootstrap.c", "2"),
      launcher: source("scripts/native/welcome-coins-custody-launcher.c", "3"),
      postExecBootstrap: source("scripts/native/welcome-coins-post-exec-bootstrap.c", "4")
    },
    compiler: { identitySha256: "5".repeat(64) },
    flags: {
      outerWrapperSha256: flagDigest([...commonFlags, ...WELCOME_COINS_NATIVE_BUILD_PROFILE.outerWrapperFlags]),
      outerPostExecBootstrapSha256: flagDigest([...commonFlags, ...WELCOME_COINS_NATIVE_BUILD_PROFILE.outerPostExecBootstrapFlags]),
      launcherSha256: flagDigest([...commonFlags, ...WELCOME_COINS_NATIVE_BUILD_PROFILE.launcherFlags]),
      postExecBootstrapSha256: flagDigest([...commonFlags, ...WELCOME_COINS_NATIVE_BUILD_PROFILE.postExecBootstrapFlags])
    },
    outputs: {
      outerWrapper: output("outerWrapper", "0755", "static-pie"),
      outerPostExecBootstrap: output("outerPostExecBootstrap", "0644", "shared-object"),
      launcher: output("launcher", "0755", "pie"),
      postExecBootstrap: output("postExecBootstrap", "0644", "shared-object")
    }
  };
  const receiptBytes = canonicalWelcomeCoinsNativeBuildReceipt(receiptValue);
  for (const [key, mode] of [
    ["outerWrapper", 0o755],
    ["outerPostExecBootstrap", 0o644],
    ["launcher", 0o755],
    ["postExecBootstrap", 0o644]
  ]) {
    writeFileSync(join(root, NATIVE_PATHS[key]), bytes[key], { mode });
    if (process.platform !== "win32") chmodSync(join(root, NATIVE_PATHS[key]), mode);
  }
  writeFileSync(join(root, NATIVE_PATHS.receipt), receiptBytes, { mode: 0o644 });
  if (process.platform !== "win32") chmodSync(join(root, NATIVE_PATHS.receipt), 0o644);
  return nativeCustodyRecord({
    receiptBytes,
    outerWrapperBytes: bytes.outerWrapper,
    outerPostExecBootstrapBytes: bytes.outerPostExecBootstrap,
    launcherBytes: bytes.launcher,
    postExecBootstrapBytes: bytes.postExecBootstrap
  });
}

function replaceNativeReceipt(root, mutate) {
  const path = join(root, NATIVE_PATHS.receipt);
  const value = JSON.parse(readFileSync(path, "utf8"));
  mutate(value);
  writeFileSync(path, `${JSON.stringify(value)}\n`, { mode: 0o644 });
  if (process.platform !== "win32") chmodSync(path, 0o644);
}

test("dependency artifact accepts canonical gcc-v2 four-output native receipt", () => {
  const root = makeRoot("native-v2");
  try {
    stageNativeCustodyFixture(root);
    const custody = inspectWelcomeCoinsNativeCustodyBundle({ root, enforceModes: true });
    assert.deepEqual(Object.keys(custody), [
      "schemaVersion",
      "type",
      "buildProfile",
      "receipt",
      "outerWrapper",
      "outerPostExecBootstrap",
      "launcher",
      "postExecBootstrap"
    ]);
    assert.equal(custody.buildProfile, WELCOME_COINS_NATIVE_BUILD_PROFILE.id);
    assert.equal(custody.outerWrapper.kind, "static-pie");
    assert.equal(custody.outerPostExecBootstrap.kind, "shared-object");
  } finally {
    cleanup(root);
  }
});

test("native custody inspector rejects every option outside its production contract", () => {
  const root = makeRoot("native-v2-inspector-extra-option");
  try {
    stageNativeCustodyFixture(root);
    const symbolOption = { root, enforceModes: false };
    symbolOption[Symbol("runtime")] = {};
    for (const options of [
      { root, enforceModes: false, unexpectedRuntime: {} },
      { root, enforceModes: false, runtime: { platform: "linux", modeFor: () => "0600" } },
      symbolOption
    ]) {
      assert.throws(
        () => inspectWelcomeCoinsNativeCustodyBundle(options),
        condition("dependency_native_custody_invalid")
      );
    }
  } finally {
    cleanup(root);
  }
});

test("temporary extraction native custody skips only physical modes and keeps canonical evidence", () => {
  assert.equal(canonicalDependencyArtifactNativeCustodyMode({
    platform: "linux", observedMode: "0600", expectedMode: "0755", enforceModes: false
  }), "0755");
  assert.throws(
    () => canonicalDependencyArtifactNativeCustodyMode({
      platform: "linux", observedMode: "0600", expectedMode: "0755", enforceModes: true
    }),
    condition("dependency_native_custody_invalid")
  );
  assert.equal(canonicalDependencyArtifactNativeCustodyMode({
    platform: "linux", observedMode: "0755", expectedMode: "0755", enforceModes: true
  }), "0755");
  const root = makeRoot("native-v2-temporary-modes");
  try {
    stageNativeCustodyFixture(root);
    if (process.platform !== "win32") {
      for (const path of Object.values(NATIVE_PATHS)) chmodSync(join(root, path), 0o600);
    }
    const custody = inspectWelcomeCoinsNativeCustodyBundle({ root, enforceModes: false });
    assert.deepEqual({
      receipt: custody.receipt.mode,
      outerWrapper: custody.outerWrapper.mode,
      outerPostExecBootstrap: custody.outerPostExecBootstrap.mode,
      launcher: custody.launcher.mode,
      postExecBootstrap: custody.postExecBootstrap.mode
    }, {
      receipt: "0644",
      outerWrapper: "0755",
      outerPostExecBootstrap: "0644",
      launcher: "0755",
      postExecBootstrap: "0644"
    });
  } finally {
    cleanup(root);
  }

  for (const [name, arrange] of [
    ["digest", (fixtureRoot) => replaceNativeReceipt(fixtureRoot, (value) => {
      value.outputs.outerWrapper.sha256 = "f".repeat(64);
    })],
    ["size", (fixtureRoot) => replaceNativeReceipt(fixtureRoot, (value) => {
      value.outputs.outerWrapper.sizeBytes += 1;
    })],
    ["elf", (fixtureRoot) => stageNativeCustodyFixture(fixtureRoot, { launcherMachine: 183 })],
    ["identity", (fixtureRoot) => {
      stageNativeCustodyFixture(fixtureRoot);
      linkSync(join(fixtureRoot, NATIVE_PATHS.launcher), join(fixtureRoot, NATIVE_PATHS.launcher + ".hardlink"));
    }]
  ]) {
    const fixtureRoot = makeRoot(`native-v2-temporary-modes-${name}`);
    try {
      if (name !== "elf" && name !== "identity") stageNativeCustodyFixture(fixtureRoot);
      arrange(fixtureRoot);
      assert.throws(
        () => inspectWelcomeCoinsNativeCustodyBundle({ root: fixtureRoot, enforceModes: false }),
        condition("dependency_native_custody_invalid"),
        name
      );
    } finally {
      cleanup(fixtureRoot);
    }
  }
});

test("dependency artifact rejects legacy, reordered, drifted or incomplete native v2 receipts", () => {
  const cases = [
    ["legacy-profile", (value) => { value.profile = "hardened-linux-x86_64-gcc-v1"; }],
    ["missing-source", (value) => { delete value.sources.outerWrapper; }],
    ["source-order", (value) => {
      value.sources = {
        launcher: value.sources.launcher,
        outerWrapper: value.sources.outerWrapper,
        outerPostExecBootstrap: value.sources.outerPostExecBootstrap,
        postExecBootstrap: value.sources.postExecBootstrap
      };
    }],
    ["source-path", (value) => { value.sources.outerWrapper.path = "scripts/native/other.c"; }],
    ["source-size", (value) => { value.sources.outerWrapper.sizeBytes = 0; }],
    ["flags", (value) => { value.flags.outerWrapperSha256 = "f".repeat(64); }],
    ["flags-order", (value) => {
      value.flags = {
        launcherSha256: value.flags.launcherSha256,
        outerWrapperSha256: value.flags.outerWrapperSha256,
        outerPostExecBootstrapSha256: value.flags.outerPostExecBootstrapSha256,
        postExecBootstrapSha256: value.flags.postExecBootstrapSha256
      };
    }],
    ["output-digest", (value) => { value.outputs.outerWrapper.sha256 = "f".repeat(64); }],
    ["output-size", (value) => { value.outputs.outerWrapper.sizeBytes += 1; }],
    ["output-mode", (value) => { value.outputs.outerWrapper.mode = "0644"; }],
    ["output-kind", (value) => { value.outputs.outerWrapper.kind = "pie"; }],
    ["output-shape", (value) => {
      const output = value.outputs.outerWrapper;
      value.outputs.outerWrapper = {
        sha256: output.sha256,
        path: output.path,
        sizeBytes: output.sizeBytes,
        mode: output.mode,
        kind: output.kind
      };
    }]
  ];
  for (const [name, mutate] of cases) {
    const root = makeRoot(`native-v2-${name}`);
    try {
      stageNativeCustodyFixture(root);
      replaceNativeReceipt(root, mutate);
      assert.throws(
        () => inspectWelcomeCoinsNativeCustodyBundle({ root, enforceModes: true }),
        condition("dependency_native_custody_invalid"),
        name
      );
    } finally {
      cleanup(root);
    }
  }
});

test("dependency artifact requires every native v2 output to remain pinned and readable", () => {
  for (const key of ["outerWrapper", "outerPostExecBootstrap", "launcher", "postExecBootstrap"]) {
    const root = makeRoot(`native-v2-missing-${key}`);
    try {
      stageNativeCustodyFixture(root);
      unlinkSync(join(root, NATIVE_PATHS[key]));
      assert.throws(
        () => inspectWelcomeCoinsNativeCustodyBundle({ root, enforceModes: true }),
        condition("dependency_native_custody_invalid"),
        key
      );
    } finally {
      cleanup(root);
    }
  }
});

test("native custody readback rejects wrong ELF machine or swapped executable kinds", () => {
  for (const [name, options] of [
    ["wrong-machine", { launcherMachine: 183 }],
    ["swapped-kinds", {
      launcherInterpreter: false,
      postExecBootstrapInterpreter: true
    }]
  ]) {
    const root = makeRoot(`native-${name}`);
    try {
      mkdirSync(join(root, "node_modules"), { recursive: true });
      stageNativeCustodyFixture(root, options);
      assert.throws(
        () => inspectWelcomeCoinsNativeCustodyBundle({ root, enforceModes: true }),
        condition("dependency_native_custody_invalid")
      );
    } finally {
      cleanup(root);
    }
  }
});
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
  writeFileSync(join(root, "scripts", "control-plane-db-snapshot-gate-lib.mjs"), "export default true;\n");
  writeFileSync(join(nodeModules, "better-sqlite3", "index.js"), "module.exports = {};\n");
  writeFileSync(join(nodeModules, "better-sqlite3", "package.json"), '{"version":"12.10.0"}\n');
  const nativeCustody = stageNativeCustodyFixture(root);
  const archiveBytes = Buffer.from("archive-fixture\n");
  const archivePath = join(root, "node-modules.tar");
  writeFileSync(archivePath, archiveBytes);
  const tree = auditDependencyTree(nodeModules, { enforceOwnership: false, checkAclCapabilities: () => true });
  const manifest = {
    schemaVersion: "4", type: DEPENDENCY_ARTIFACT_TYPE, state: "verified", releaseUnit: "control-plane-app",
    sourceCommit: "a".repeat(40), artifactRelease: "ci-20260819",
    package: { sha256: hash(packageJson), sizeBytes: packageJson.length },
    packageLock: { sha256: hash(packageLock), sizeBytes: packageLock.length },
    archive: { fileName: "node-modules.tar", sha256: hash(archiveBytes), sizeBytes: archiveBytes.length },
    runtime,
    smoke: { betterSqlite3Memory: true, snapshotImport: true },
    tree: { sha256: tree.sha256, entryCount: tree.entryCount, totalBytes: tree.totalBytes, hardlinksBroken: true, symlinksInternal: true },
    nativeCustody,
    provenance: { builder: "github-actions", workflow: "control-plane-dependency-artifact.yml" }
  };
  return { root, nodeModules, packageJson, packageLock, archivePath, archiveBytes, manifest, tree };
}

function cleanup(root) { try { rmSync(root, { recursive: true, force: true }); } catch {} }

test("dependency storage budget is block-aware and preserves an emergency reserve", () => {
  const allocationUpperBoundBytes = 4097 + 3 * (4096 - 1) + 2 * (3 + 2) * 4096;
  assert.deepEqual(calculateDependencyStorageBudget({
    totalBytes: 4097,
    entryCount: 3,
    blockSize: 4096
  }), {
    blockSize: 4096,
    logicalBytes: 4097,
    entryCount: 3,
    allocationUpperBoundBytes,
    reserveBytes: 512 * 1024 * 1024,
    requiredBytes: allocationUpperBoundBytes + 512 * 1024 * 1024,
    reserveInodes: 4096,
    requiredInodes: 3 + 2 + 4096
  });
  assert.deepEqual(calculateDependencyStorageBudget({ totalBytes: 0, entryCount: 0, blockSize: 4096 }), {
    blockSize: 4096,
    logicalBytes: 0,
    entryCount: 0,
    allocationUpperBoundBytes: 0,
    reserveBytes: 512 * 1024 * 1024,
    requiredBytes: 512 * 1024 * 1024,
    reserveInodes: 4096,
    requiredInodes: 4096
  });

  for (const value of [
    { totalBytes: -1, entryCount: 3, blockSize: 4096 },
    { totalBytes: 1, entryCount: 0, blockSize: 4096 },
    { totalBytes: 1, entryCount: 3, blockSize: 0 },
    { totalBytes: 1, entryCount: 3, blockSize: 513 },
    { totalBytes: 1, entryCount: 3, blockSize: 4095 },
    { totalBytes: 1, entryCount: 3, blockSize: 2 * 1024 * 1024 },
    { totalBytes: Number.MAX_SAFE_INTEGER, entryCount: 3, blockSize: 4096 }
  ]) assert.throws(() => calculateDependencyStorageBudget(value), condition("dependency_storage_budget_unavailable"));
});

test("dependency manifest accepts formatting but rejects duplicate keys", () => {
  const value = {
    schemaVersion: "4", type: DEPENDENCY_ARTIFACT_TYPE, state: "verified", releaseUnit: "control-plane-app", sourceCommit: "a".repeat(40), artifactRelease: "ci",
    package: { sha256: "b".repeat(64), sizeBytes: 1 }, packageLock: { sha256: "c".repeat(64), sizeBytes: 1 },
    archive: { fileName: "node-modules.tar", sha256: "d".repeat(64), sizeBytes: 1 }, runtime,
    smoke: { betterSqlite3Memory: true, snapshotImport: true }, tree: { sha256: "e".repeat(64), entryCount: 1, totalBytes: 1, hardlinksBroken: true, symlinksInternal: true }, nativeCustody: nativeCustodyRecord(), provenance: { builder: "github-actions", workflow: "control-plane-dependency-artifact.yml" }
  };
  const parsed = parseDependencyArtifactManifest({ bytes: Buffer.from(`${JSON.stringify(value, null, 2)}\r\n`) });
  assert.equal(parsed.value.type, DEPENDENCY_ARTIFACT_TYPE);
  assert.equal(parsed.value.schemaVersion, "4");
  assert.equal(DEPENDENCY_ARTIFACT_SCHEMA_VERSION, "4");
  assert.throws(() => parseDependencyArtifactManifest({ bytes: Buffer.from(JSON.stringify({ ...value, schemaVersion: "1" })) }), condition("dependency_artifact_invalid"));
  const missingBudget = { ...value, tree: { ...value.tree } };
  delete missingBudget.tree.totalBytes;
  assert.throws(() => parseDependencyArtifactManifest({ bytes: Buffer.from(JSON.stringify(missingBudget)) }), condition("dependency_tree_invalid"));
  assert.doesNotThrow(() => parseDependencyArtifactManifest({ bytes: Buffer.from(JSON.stringify({ ...value, archive: { ...value.archive, sizeBytes: 128 * 1024 * 1024 }, tree: { ...value.tree, entryCount: 10000, totalBytes: 128 * 1024 * 1024 } })) }));
  assert.throws(() => parseDependencyArtifactManifest({ bytes: Buffer.from(JSON.stringify({ ...value, archive: { ...value.archive, sizeBytes: 128 * 1024 * 1024 + 1 } })) }), condition("dependency_artifact_invalid"));
  assert.throws(() => parseDependencyArtifactManifest({ bytes: Buffer.from(JSON.stringify({ ...value, tree: { ...value.tree, entryCount: 10001 } })) }), condition("dependency_tree_invalid"));
  assert.throws(() => parseDependencyArtifactManifest({ bytes: Buffer.from(JSON.stringify({ ...value, tree: { ...value.tree, totalBytes: 128 * 1024 * 1024 + 1 } })) }), condition("dependency_tree_invalid"));
  assert.throws(() => parseDependencyArtifactManifest({ bytes: Buffer.from('{"schemaVersion":"4","schemaVersion":"4"}') }), condition("dependency_artifact_invalid"));
});

test("extractor rejects archive path replacement after hashing and before its first mutation", () => {
  const value = fixture("archive-inode-replacement");
  const replacementPath = join(value.root, "replacement.tar");
  writeFileSync(replacementPath, "replacement archive inode with a different identity\n");
  const trace = [];
  let hookCalls = 0;
  try {
    assert.throws(() => prepareDependencyArtifactTree({
      manifestBytes: Buffer.from(JSON.stringify(value.manifest)),
      archivePath: value.archivePath,
      packageJsonBytes: value.packageJson,
      packageLockBytes: value.packageLock,
      expectedSourceCommit: value.manifest.sourceCommit,
      expectedArtifactRelease: value.manifest.artifactRelease,
      runtime: {
        listArchive: () => { trace.push("list"); return Buffer.from("node_modules\0"); },
        beforeArchiveMutation() {
          trace.push("before-mutation");
          hookCalls += 1;
          unlinkSync(value.archivePath);
          renameSync(replacementPath, value.archivePath);
        },
        pythonPath: join(value.root, "python-must-not-run")
      }
    }), condition("dependency_file_changed"));
    assert.equal(hookCalls, 1);
    assert.deepEqual(trace, ["list", "before-mutation"]);
  } finally { cleanup(value.root); }
});

test("extractor maps ENOSPC and EDQUOT from its mutation boundary to one stable condition", () => {
  const value = fixture("archive-storage-exhaustion");
  try {
    for (const code of ["ENOSPC", "EDQUOT"]) {
      assert.throws(() => extractDependencyArchive(value.archivePath, {
        beforeArchiveMutation() { throw Object.assign(new Error(code), { code }); },
        pythonPath: join(value.root, "python-must-not-run")
      }), condition("dependency_storage_budget_unavailable"), code);
    }
  } finally { cleanup(value.root); }
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

test("producer emits a v4 manifest with bounded tree and native custody evidence", { skip: process.platform !== "linux" }, () => {
  const value = fixture("schema-v4-producer-source");
  const extracted = fixture("schema-v4-producer-extracted");
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
    assert.equal(parseDependencyArtifactManifest({ bytes: result.bytes }).value.schemaVersion, "4");
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
    assert.throws(() => runNativeBetterSqliteSmoke({ root: value.root, snapshotModule: "../escape.mjs", runtime: { nativeSmoke: () => { calls += 1; return true; } } }), condition("dependency_smoke_snapshot_invalid"));
    assert.throws(() => runNativeBetterSqliteSmoke({ root: value.root, snapshotModule: join(value.root, "outside.mjs"), runtime: { nativeSmoke: () => { calls += 1; return true; } } }), condition("dependency_smoke_snapshot_invalid"));
    assert.throws(() => runNativeBetterSqliteSmoke({ root: value.root, snapshotModule: "scripts/other.mjs", runtime: { nativeSmoke: () => { calls += 1; return true; } } }), condition("dependency_smoke_snapshot_invalid"));
    assert.equal(calls, 0);
  } finally { cleanup(value.root); }
});

test("native smoke rejects a fixed snapshot path implemented as an escaping symlink", { skip: process.platform !== "linux" }, () => {
  const value = fixture("snapshot-symlink"); let calls = 0;
  try {
    writeFileSync(join(value.root, "outside.mjs"), "export default false;\n");
    unlinkSync(join(value.root, "scripts", "control-plane-db-snapshot-gate-lib.mjs"));
    symlinkSync(join(value.root, "outside.mjs"), join(value.root, "scripts", "control-plane-db-snapshot-gate-lib.mjs"));
    assert.throws(() => runNativeBetterSqliteSmoke({ root: value.root, runtime: { nativeSmoke: () => { calls += 1; return true; } } }), condition("dependency_smoke_snapshot_invalid"));
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

test("Linux extractor rejects compressed tar input before creating a destination tree", { skip: process.platform !== "linux" }, () => {
  const value = fixture("compressed-archive-rejected");
  const archivePath = join(value.root, "node-modules.tar.gz");
  const destinationRoot = resolve(process.cwd(), `.dependency-compressed-destination-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  try {
    const tar = spawnSync("/usr/bin/tar", ["--create", "--gzip", "--file", archivePath, "--", "node_modules"], { cwd: value.root, encoding: "utf8" });
    assert.equal(tar.status, 0, String(tar.stderr || ""));
    assert.throws(() => extractDependencyArchive(archivePath, {
      destinationRoot,
      enforceOwnership: false,
      checkAclCapabilities: () => true
    }), condition("dependency_archive_extract_failed"));
    assert.equal(existsSync(destinationRoot), false);
  } finally {
    cleanup(destinationRoot);
    cleanup(value.root);
  }
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
  const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
  const uploadIndex = workflow.indexOf("- name: Upload dependency artifact on non-PR refs");
  const uploadStep = workflow.slice(uploadIndex);
  const installCommands = workflow.match(/npm ci --omit=dev --no-audit --no-fund/g) ?? [];
  const snapshotArguments = [...workflow.matchAll(/--snapshot\s+([^\s\\]+)/g)]
    .map((match) => match[1]);
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
  assert.equal((workflow.match(/node scripts\/control-plane-dependency-artifact-cli\.mjs/g) ?? []).length, 4);
  assert.match(workflow, /from "\.\/scripts\/control-plane-dependency-artifact-lib\.mjs"/);
  assert.doesNotMatch(workflow, /node scripts\/control-plane-dependency-artifact\.mjs/);
  assert.doesNotMatch(workflow, /from "\.\/scripts\/control-plane-dependency-artifact\.mjs"/);
  assert.deepEqual(
    snapshotArguments,
    Array(4).fill("scripts/control-plane-db-snapshot-gate-lib.mjs"),
    "every workflow snapshot argument must import the side-effect-free library"
  );
  assert.doesNotMatch(
    workflow,
    /--snapshot\s+scripts\/control-plane-db-snapshot-gate\.mjs\b/,
    "the historical compatibility launcher is not importable smoke input"
  );
  assert.match(workflow, /--hard-dereference/);
  assert.match(workflow, /--pax-option=delete=atime,delete=ctime,delete=SCHILY\.dev,delete=SCHILY\.ino,delete=SCHILY\.nlink/);
  assert.match(workflow, /node-modules-a\.tar/);
  assert.match(workflow, /node-modules-b\.tar/);
  assert.ok(firstArchiveIndex >= 0 && secondInstallIndex > firstArchiveIndex && secondArchiveIndex > secondInstallIndex,
    "the second archive must be created from a fresh second npm ci");
  assert.match(workflow, /cmp --silent/);
  assert.match(workflow, /mv \.dependency-artifacts\/node-modules-b\.tar \.dependency-artifacts\/node-modules\.tar/);
  assert.match(
    workflow,
    /actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a\s+# v7/u
  );
  assert.match(uploadStep, /\.dependency-artifacts\/node-modules\.tar/);
  assert.match(uploadStep, /\.dependency-artifacts\/dependency-artifact\.json/);
  assert.match(uploadStep, /\.dependency-artifacts\/release-label\.txt/);
  assert.match(uploadStep, /include-hidden-files:\s*true/);
  assert.doesNotMatch(uploadStep, /path:\s*\.dependency-artifacts\s*(?:\r?\n|$)/);
  assert.doesNotMatch(workflow, /\b(?:ssh|scp|rsync|systemctl|systemd-run)\b/i);
  assert.doesNotMatch(workflow, /\.env|CONSOLE_TOKEN|SS_PASSWORD|subscription/i);
  assert.equal(packageJson.scripts["control-plane:dependency-artifact"], "node scripts/control-plane-dependency-artifact-cli.mjs");
});

test("dependency artifact direct execution through a directory symlink cannot silently succeed", (t) => {
  const root = makeRoot("cli-directory-symlink");
  const entry = DEPENDENCY_CLI_PATH;
  const alias = join(root, "scripts-alias");
  try {
    try {
      symlinkSync(dirname(entry), alias, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (["EPERM", "EACCES", "ENOSYS"].includes(error?.code)) return t.skip(`directory symlink unavailable: ${error.code}`);
      throw error;
    }
    const result = spawnSync(process.execPath, [join(alias, "control-plane-dependency-artifact-cli.mjs")], { encoding: "utf8" });
    assert.equal(result.status, 1, `stdout=${result.stdout}\nstderr=${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.deepEqual(JSON.parse(result.stderr.trim()), {
      schemaVersion: DEPENDENCY_ARTIFACT_SCHEMA_VERSION,
      type: DEPENDENCY_ARTIFACT_TYPE,
      mode: null,
      state: "blocked",
      condition: "dependency_cli_invalid"
    });
  } finally { cleanup(root); }
});

test("dependency artifact direct execution through a file symlink cannot silently succeed", (t) => {
  const root = makeRoot("cli-file-symlink");
  const entry = DEPENDENCY_CLI_PATH;
  const alias = join(root, "dependency-artifact-alias.mjs");
  try {
    try {
      symlinkSync(entry, alias, "file");
    } catch (error) {
      if (["EPERM", "EACCES", "ENOSYS"].includes(error?.code)) return t.skip(`file symlink unavailable: ${error.code}`);
      throw error;
    }
    const result = spawnSync(process.execPath, [alias], { encoding: "utf8" });
    assert.equal(result.status, 1, `stdout=${result.stdout}\nstderr=${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.deepEqual(JSON.parse(result.stderr.trim()), {
      schemaVersion: DEPENDENCY_ARTIFACT_SCHEMA_VERSION,
      type: DEPENDENCY_ARTIFACT_TYPE,
      mode: null,
      state: "blocked",
      condition: "dependency_cli_invalid"
    });
  } finally { cleanup(root); }
});

test("the historical dependency entry remains a non-silent compatibility launcher", (t) => {
  const root = makeRoot("cli-compatibility-symlink");
  const alias = join(root, "dependency-artifact-compatibility-alias.mjs");
  try {
    try {
      symlinkSync(DEPENDENCY_COMPATIBILITY_PATH, alias, "file");
    } catch (error) {
      if (["EPERM", "EACCES", "ENOSYS"].includes(error?.code)) return t.skip(`file symlink unavailable: ${error.code}`);
      throw error;
    }
    const result = spawnSync(process.execPath, [alias], { encoding: "utf8" });
    assert.equal(result.status, 1, `stdout=${result.stdout}\nstderr=${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.equal(JSON.parse(result.stderr.trim()).condition, "dependency_cli_invalid");
  } finally { cleanup(root); }
});

test("importing the dependency artifact library has no CLI side effects", () => {
  const probe = `await import(${JSON.stringify(pathToFileURL(DEPENDENCY_LIBRARY_PATH).href)}); process.stdout.write("imported\\n");`;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", probe], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "imported\n");
  assert.equal(result.stderr, "");
});

test("smoke CLI exports a dedicated smoke schema version that does not change the artifact manifest version", () => {
  assert.equal(DEPENDENCY_ARTIFACT_SMOKE_SCHEMA_VERSION, "3");
  assert.equal(DEPENDENCY_ARTIFACT_SCHEMA_VERSION, "4");
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
      condition: "dependency_smoke_identity_invalid"
    });
  } finally { cleanup(value.root); }
});

test("smoke CLI exposes snapshot-path failures only through the bounded condition envelope", async () => {
  const value = fixture("smoke-cli-snapshot-failure-envelope");
  const output = []; const errors = [];
  try {
    const code = await runDependencyArtifactCli({
      argv: ["--mode", "smoke", "--root", value.root, "--snapshot", "../escape.mjs"],
      stdout: { write: (chunk) => output.push(String(chunk)) },
      stderr: { write: (chunk) => errors.push(String(chunk)) },
      runtime: { nativeSmoke: () => true, getuid: () => 4711, getgid: () => 4712 }
    });
    assert.equal(code, 1);
    assert.deepEqual(output, []);
    assert.deepEqual(JSON.parse(errors.join("")), {
      schemaVersion: DEPENDENCY_ARTIFACT_SMOKE_SCHEMA_VERSION,
      type: DEPENDENCY_ARTIFACT_TYPE,
      mode: "smoke",
      state: "blocked",
      condition: "dependency_smoke_snapshot_invalid"
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
      assert.match(errors.join(""), /dependency_smoke_identity_invalid/, testCase.name);
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
      assert.match(errors.join(""), /dependency_smoke_identity_invalid/, testCase.name);
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
      condition("dependency_smoke_identity_invalid"),
      "both non-functions"
    );
    assert.throws(
      () => readSmokeProcessIdentity({ getuid: () => 4711, getgid: 4712 }),
      condition("dependency_smoke_identity_invalid"),
      "function + non-function"
    );
    assert.throws(
      () => readSmokeProcessIdentity({ getuid: 4711, getgid: () => 4712 }),
      condition("dependency_smoke_identity_invalid"),
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
      condition("dependency_smoke_identity_invalid"),
      "only getuid"
    );
    assert.throws(
      () => readSmokeProcessIdentity({ getgid: () => 4712 }),
      condition("dependency_smoke_identity_invalid"),
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
    assert.throws(() => readSmokeProcessIdentity({}), condition("dependency_smoke_identity_invalid"), "no hooks and no host");
    assert.throws(() => readSmokeProcessIdentity({ nativeSmoke: () => true }), condition("dependency_smoke_identity_invalid"), "no hooks and no host with nativeSmoke");
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
    assert.throws(() => readSmokeProcessIdentity({}), condition("dependency_smoke_identity_invalid"), "host root");
    // Host functions throw.
    Object.defineProperty(process, "getuid", { value: () => { throw new Error("host getuid failed"); }, configurable: true, writable: true });
    Object.defineProperty(process, "getgid", { value: () => 4712, configurable: true, writable: true });
    assert.throws(() => readSmokeProcessIdentity({}), condition("dependency_smoke_identity_invalid"), "host throws");
    // Host functions return invalid types.
    Object.defineProperty(process, "getuid", { value: () => 1.5, configurable: true, writable: true });
    Object.defineProperty(process, "getgid", { value: () => 4712, configurable: true, writable: true });
    assert.throws(() => readSmokeProcessIdentity({}), condition("dependency_smoke_identity_invalid"), "host float");
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
    condition("dependency_smoke_identity_invalid"),
    "getuid throws"
  );
  assert.throws(
    () => readSmokeProcessIdentity({ getuid: () => 4711, getgid: () => { throw new Error("boom"); } }),
    condition("dependency_smoke_identity_invalid"),
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
      condition("dependency_smoke_identity_invalid"),
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
    assert.match(rootErrors.join(""), /dependency_smoke_identity_invalid/);

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
    assert.match(absentErrors.join(""), /dependency_smoke_identity_invalid/);
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
      assert.match(errors.join(""), /dependency_smoke_identity_invalid/, testCase.name);
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
