import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  cpSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import {
  CANDIDATE_DEPENDENCY_GATE_TYPE,
  CandidateDependencyGateError,
  buildTransientUnitInvocation,
  createCandidateDependencyGateTestRuntime,
  materializeCandidateDependencies,
  invokeCandidateDependencyTransientUnit,
  parseProductionTransientReadback,
  parseArtifactStageReceipt,
  parseSealedSmokeTreeAudit,
  prepareCandidateDependencyWorker,
  preflightCandidateDependencies,
  runCandidateDependencyGateCli,
  runCandidateDependencyWorker,
  sealBuildWorkerArchive,
  seizeWorkerStateTopLevel,
  stageBuildWorkerInputs,
  stateTopologyReadback,
  transientUnitReadback,
  terminalReadbackAfterLaunch,
  validateNodeModulesArchiveListing,
  verifyCandidateDependencyArtifact,
  verifyCandidateDependencies,
  workerInputCustodyReadback
} from "../../scripts/control-plane-candidate-dependency-gate.mjs";
import { createArtifactManifest } from "../../scripts/create-artifact-manifest.mjs";
import { auditDependencyTree, buildDependencyArtifactManifest, extractDependencyArchive } from "../../scripts/control-plane-dependency-artifact.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const isWindows = process.platform === "win32";
const SOURCE_COMMIT = "a".repeat(40);
const ARTIFACT_RELEASE = "artifact-release";
const ARTIFACT = Object.freeze({
  fileName: `proxy-gateway-${ARTIFACT_RELEASE}.zip`,
  sha256: "b".repeat(64),
  sizeBytes: 1234,
  createdAt: "2026-08-16T00:00:00.000Z"
});

function write(path, value, mode = 0o600) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value, { mode });
  chmodSync(path, mode);
}

function mirrorFixtureModes(source, target) {
  const metadata = lstatSync(source);
  if (!metadata.isSymbolicLink()) chmodSync(target, metadata.mode & 0o7777);
  if (!metadata.isDirectory()) return;
  for (const child of readdirSync(source)) mirrorFixtureModes(join(source, child), join(target, child));
}

function artifactManifest({ sourceCommit = SOURCE_COMMIT, release = ARTIFACT_RELEASE, artifact = ARTIFACT, mutate = {} } = {}) {
  return {
    schemaVersion: "1",
    releaseUnit: "control-plane-app",
    sourceCommit,
    release,
    artifact: { ...artifact },
    ...mutate
  };
}

function artifactManifestBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\r\n`);
}

function receipt({ candidate, packageBytes, lockBytes, sourceCommit = SOURCE_COMMIT, artifactRelease = ARTIFACT_RELEASE, artifact = ARTIFACT, artifactManifestSha256, artifactManifestSizeBytes, mutate = {} }) {
  return {
    schemaVersion: "1",
    type: "control_plane_artifact_stage",
    state: "verified",
    releaseUnit: "control-plane-app",
    candidateRelease: candidate,
    sourceCommit,
    artifactRelease,
    artifact: { sha256: artifact.sha256, sizeBytes: artifact.sizeBytes },
    artifactManifestSha256,
    artifactManifestSizeBytes,
    sourceFiles: {
      packageJson: { sha256: hash(packageBytes), sizeBytes: packageBytes.length },
      packageLock: { sha256: hash(lockBytes), sizeBytes: lockBytes.length }
    },
    ...mutate
  };
}

function stageReceipt({ candidate, packageBytes, lockBytes, manifest = artifactManifest(), manifestBytes = artifactManifestBytes(manifest), mutate = {} }) {
  return {
    manifest,
    manifestBytes,
    value: receipt({
      candidate,
      packageBytes,
      lockBytes,
      sourceCommit: manifest.sourceCommit,
      artifactRelease: manifest.release,
      artifact: manifest.artifact,
      artifactManifestSha256: hash(manifestBytes),
      artifactManifestSizeBytes: manifestBytes.length,
      mutate
    })
  };
}

function assembly({ active, candidate, envBytes, proxyBytes }) {
  return {
    schemaVersion: "1",
    type: "control_plane_release_assembly",
    releaseUnit: "control-plane-app",
    activeRelease: active,
    candidateRelease: candidate,
    createdAt: "2026-08-16T00:00:00.000Z",
    protectedOverlays: [
      { relativePath: "config/proxy-servers.json", sha256: hash(proxyBytes), sizeBytes: proxyBytes.length, mode: "0640" },
      { relativePath: ".env", sha256: hash(envBytes), sizeBytes: envBytes.length, mode: "0600" }
    ]
  };
}

function fixture(t, { artifactMutate, artifactManifestMutate, setupNpm, root: fixtureRoot } = {}) {
  const root = fixtureRoot ? resolve(fixtureRoot) : resolve(tmpdir(), `gccgw-dependency-gate-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const active = "active-release";
  const candidate = "candidate-release";
  const activeRoot = join(root, "releases", active);
  const candidateRoot = join(root, "releases", candidate);
  const packageBytes = Buffer.from('{"name":"candidate","version":"1.0.0"}\n');
  const lockBytes = Buffer.from('{"name":"candidate","lockfileVersion":3,"packages":{}}\n');
  const envBytes = Buffer.from("PROTECTED=1\n");
  const proxyBytes = Buffer.from("{}\n");
  mkdirSync(activeRoot, { recursive: true });
  mkdirSync(candidateRoot, { recursive: true });
  write(join(activeRoot, ".env"), envBytes);
  write(join(activeRoot, "config", "proxy-servers.json"), proxyBytes, 0o640);
  write(join(candidateRoot, ".env"), envBytes);
  write(join(candidateRoot, "config", "proxy-servers.json"), proxyBytes, 0o640);
  write(join(candidateRoot, "package.json"), packageBytes);
  write(join(candidateRoot, "package-lock.json"), lockBytes);
  write(join(candidateRoot, "scripts", "control-plane-db-snapshot-gate.mjs"), "export const safeImport = true;\n");
  const assemblyRoot = join(root, "assembly-receipts", candidate);
  write(join(assemblyRoot, "release-assembly.json"), `${JSON.stringify(assembly({ active, candidate, envBytes, proxyBytes }))}\n`);
  const manifest = artifactManifest({ mutate: artifactManifestMutate });
  const manifestBytes = artifactManifestBytes(manifest);
  write(join(assemblyRoot, "artifact-manifest.json"), manifestBytes);
  const staged = stageReceipt({ candidate, packageBytes, lockBytes, manifest, manifestBytes, mutate: artifactMutate });
  const artifactStageBytes = Buffer.from(`${JSON.stringify(staged.value, null, 2)}\r\n`);
  write(join(assemblyRoot, "artifact-stage-receipt.json"), artifactStageBytes);
  const dependencyArtifactRoot = join(root, "dependency-artifacts", candidate);
  mkdirSync(dependencyArtifactRoot, { recursive: true, mode: 0o700 });
  chmodSync(dependencyArtifactRoot, 0o700);
  write(join(dependencyArtifactRoot, "dependency-artifact.json"), "{}\n", 0o400);
  write(join(dependencyArtifactRoot, "node-modules.tar"), "test artifact\n", 0o400);
  write(join(dependencyArtifactRoot, "release-label.txt"), `${ARTIFACT_RELEASE}\n`, 0o400);
  if (!isWindows) symlinkSync(activeRoot, join(root, "current"), "dir");
  const uid = statSync(root).uid;
  const gid = statSync(root).gid;
  let builderPath = null;
  let npmEnv = null;
  const runtime = createCandidateDependencyGateTestRuntime({
    root,
    lockRoot: join(root, "runtime-lock"),
    workerInputRoot: join(root, "worker-inputs"),
    sealedArchiveRoot: join(root, "sealed-archives"),
    now: () => "2026-08-16T00:00:00.000Z",
    readService: () => ({ main: 31, exec: 31, uid, gid, cwd: activeRoot, restarts: 7 }),
    mountInfo: () => "",
    checkAclCapabilities: () => true,
    allowA3PhysicalValidation: true,
    allowSyntheticA3Evidence: true,
    allowTestWorkerStorage: true,
    a3ProjectRoot: root,
    a3ProjectId: 4242,
    collectStorageQuotaEvidence: () => ({
      filesystem: "/dev/test-quota",
      projectId: 4242,
      byteHardLimit: 8 * 1024 * 1024,
      byteCurrent: 4096,
      inodeHardLimit: 65536,
      inodeCurrent: 12,
      headroomBytes: 8 * 1024 * 1024 - 4096,
      headroomInodes: 65536 - 12,
      probe: { expectedErrorCode: "ENOSPC", observedErrorCode: "ENOSPC", exhausted: true }
    }),
    runServiceNativeSmoke: ({ service, fixedNodePath }) => ({
      serviceUid: service.uid,
      serviceGid: service.gid,
      fixedNodePath,
      noNetwork: true,
      capabilityBoundingSet: "",
      protectSystem: "strict",
      protectHome: true,
      privateDevices: true,
      noNewPrivileges: true,
      cgroupEmpty: true,
      terminalActiveState: "inactive",
      terminalSubState: "dead",
      terminalResult: "success",
      betterSqlite3Memory: true,
      snapshotImport: true
    }),
    renameNoReplace: ({ source, destination }) => {
      if (existsSync(destination)) return { published: false };
      renameSync(source, destination);
      return { published: true };
    },
    runNpm: ({ builder, env }) => {
      builderPath = builder;
      npmEnv = env;
      if (typeof setupNpm === "function") return setupNpm({ builder, root });
      write(join(builder, "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node"), "native\n", 0o700);
      write(join(builder, "node_modules", "better-sqlite3", "index.js"), "module.exports = {};\n", 0o644);
      return { status: 0 };
    },
    runTar: ({ args, cwd, encoding }) => {
      const option = (name) => args[args.indexOf(name) + 1];
      if (args.includes("--create")) {
        write(option("--file"), "synthetic-tar\n", 0o600);
        return { status: 0, stdout: "" };
      }
      if (args.includes("--list")) {
        return {
          status: 0,
          stdout: Buffer.from("node_modules/\0node_modules/better-sqlite3/\0node_modules/better-sqlite3/index.js\0node_modules/better-sqlite3/build/\0node_modules/better-sqlite3/build/Release/\0node_modules/better-sqlite3/build/Release/better_sqlite3.node\0")
        };
      }
      if (args.includes("--extract")) {
        cpSync(join(builderPath, "node_modules"), join(option("--directory"), "node_modules"), { recursive: true, dereference: false });
        return { status: 0, stdout: encoding === null ? Buffer.alloc(0) : "" };
      }
      throw new Error("unexpected tar invocation");
    },
    runSmoke: async () => ({ status: 0, sideEffectSafe: true })
  });
  t.after(() => {
    try { chmodSync(join(root, "dependency-staging"), 0o711); } catch {}
    rmSync(root, { recursive: true, force: true });
  });
  return { root, active, candidate, activeRoot, candidateRoot, packageBytes, lockBytes, artifactManifestBytes: manifestBytes, artifactStageBytes, runtime, getBuilder: () => builderPath, getNpmEnv: () => npmEnv };
}

function condition(expected) {
  return (error) => error instanceof CandidateDependencyGateError && error.condition === expected;
}

test("candidate consumer wrapper requires fixed identities, layout, root mode, and ownership", () => {
  const base = {
    deploymentRoot: "/opt/proxy-gateway-minimal-candidate",
    candidateRelease: "candidate-release",
    expectedSourceCommit: SOURCE_COMMIT,
    expectedArtifactRelease: ARTIFACT_RELEASE,
    runtime: { requireRoot: true, enforceOwnership: true }
  };
  assert.throws(() => verifyCandidateDependencyArtifact({ ...base, expectedSourceCommit: undefined }), condition("dependency_consumer_contract_invalid"));
  assert.throws(() => verifyCandidateDependencyArtifact({ ...base, expectedArtifactRelease: undefined }), condition("dependency_consumer_contract_invalid"));
  assert.throws(() => verifyCandidateDependencyArtifact({ ...base, runtime: { requireRoot: true, enforceOwnership: false } }), condition("dependency_consumer_contract_invalid"));
  assert.throws(() => verifyCandidateDependencyArtifact({ ...base, deploymentRoot: "/tmp/candidate" }), condition("dependency_consumer_contract_invalid"));
  assert.throws(() => verifyCandidateDependencyArtifact({ ...base, archivePath: "/tmp/override.tar" }), condition("dependency_consumer_contract_invalid"));
  assert.throws(() => verifyCandidateDependencyArtifact(base), condition("worker_execution_failed"));
});

function parseArtifactReceipt({ value, candidate, packageBytes, lockBytes, bytes = null, artifactManifestBytes: manifestBytes }) {
  return parseArtifactStageReceipt({
    bytes: bytes ?? Buffer.from(JSON.stringify(value)),
    candidateRelease: candidate,
    packageJson: packageBytes,
    packageLock: lockBytes,
    artifactManifestBytes: manifestBytes
  });
}

test("artifact-stage receipt accepts standard JSON whitespace and binds the original receipt bytes", () => {
  const packageBytes = Buffer.from('{"name":"candidate","version":"1.0.0"}\n');
  const lockBytes = Buffer.from('{"name":"candidate","lockfileVersion":3,"packages":{}}\n');
  const candidate = "candidate-release";
  const staged = stageReceipt({ candidate, packageBytes, lockBytes });
  const value = staged.value;
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\r\n`);

  const parsed = parseArtifactReceipt({ value, candidate, packageBytes, lockBytes, bytes, artifactManifestBytes: staged.manifestBytes });
  assert.deepEqual(parsed.value, value);
  assert.equal(parsed.sha256, hash(bytes));
  assert.equal(parsed.sizeBytes, bytes.length);
  assert.notEqual(parsed.sha256, hash(Buffer.from(JSON.stringify(value))));
});

test("artifact-stage receipt rejects duplicate JSON keys before schema binding", () => {
  const packageBytes = Buffer.from('{"name":"candidate","version":"1.0.0"}\n');
  const lockBytes = Buffer.from('{"name":"candidate","lockfileVersion":3,"packages":{}}\n');
  const candidate = "candidate-release";
  const staged = stageReceipt({ candidate, packageBytes, lockBytes });
  const value = staged.value;
  const compact = JSON.stringify(value);
  const duplicatedTopLevel = compact.replace('"schemaVersion":"1",', '"schemaVersion":"1","schemaVersion":"1",');
  const packageJson = JSON.stringify(value.sourceFiles.packageJson);
  const duplicatedNested = compact.replace(`"packageJson":${packageJson},`, `"packageJson":${packageJson},"packageJson":${packageJson},`);

  for (const bytes of [Buffer.from(duplicatedTopLevel), Buffer.from(duplicatedNested)]) {
    assert.throws(() => parseArtifactReceipt({ value, candidate, packageBytes, lockBytes, bytes, artifactManifestBytes: staged.manifestBytes }), condition("artifact_stage_receipt_invalid"));
  }
});

test("artifact-stage receipt binds the raw protected artifact manifest and rejects duplicate manifest keys", () => {
  const packageBytes = Buffer.from('{"name":"candidate","version":"1.0.0"}\n');
  const lockBytes = Buffer.from('{"name":"candidate","lockfileVersion":3,"packages":{}}\n');
  const candidate = "candidate-release";
  const staged = stageReceipt({ candidate, packageBytes, lockBytes });

  const parsed = parseArtifactReceipt({ value: staged.value, candidate, packageBytes, lockBytes, artifactManifestBytes: staged.manifestBytes });
  assert.equal(parsed.artifactManifestSha256, hash(staged.manifestBytes));
  assert.equal(parsed.artifactManifestSizeBytes, staged.manifestBytes.length);
  const duplicateManifest = Buffer.from(staged.manifestBytes.toString("utf8").replace('"schemaVersion": "1",', '"schemaVersion": "1","schemaVersion": "1",'));
  assert.throws(() => parseArtifactReceipt({ value: staged.value, candidate, packageBytes, lockBytes, artifactManifestBytes: duplicateManifest }), condition("artifact_manifest_invalid"));
});

test("artifact-stage receipt accepts real artifact-manifest producer output with an independent candidate label", (t) => {
  const root = resolve(tmpdir(), `gccgw-artifact-manifest-producer-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const artifactPath = join(root, "arbitrary-output.bin");
  write(artifactPath, "artifact bytes\n");
  const manifest = createArtifactManifest({
    releaseUnit: "control-plane-app",
    sourceCommit: SOURCE_COMMIT,
    release: "-release",
    artifactPath,
    createdAt: "2026-08-16T00:00:00.000Z"
  });
  const manifestBytes = artifactManifestBytes(manifest);
  const packageBytes = Buffer.from('{"name":"candidate","version":"1.0.0"}\n');
  const lockBytes = Buffer.from('{"name":"candidate","lockfileVersion":3,"packages":{}}\n');
  const candidate = "candidate-stage-suffix";
  const staged = stageReceipt({ candidate, packageBytes, lockBytes, manifest, manifestBytes });

  const parsed = parseArtifactReceipt({ value: staged.value, candidate, packageBytes, lockBytes, artifactManifestBytes: manifestBytes });
  assert.notEqual(candidate, manifest.release);
  assert.equal(manifest.release, "-release");
  assert.equal(manifest.artifact.fileName, "arbitrary-output.bin");
  assert.equal(parsed.value.artifactRelease, manifest.release);
  t.after(() => rmSync(root, { recursive: true, force: true }));
});

test("artifact-stage receipt binds candidate package metadata, candidate, artifact-manifest source commit, and release unit", () => {
  const packageBytes = Buffer.from('{"name":"candidate","version":"1.0.0"}\n');
  const lockBytes = Buffer.from('{"name":"candidate","lockfileVersion":3,"packages":{}}\n');
  const candidate = "candidate-release";
  const staged = stageReceipt({ candidate, packageBytes, lockBytes });
  const base = staged.value;
  const invalid = [
    { ...base, candidateRelease: "other-candidate" },
    { ...base, sourceCommit: "A".repeat(40) },
    { ...base, sourceCommit: "e".repeat(40) },
    { ...base, releaseUnit: "portal-static" },
    { ...base, sourceFiles: { ...base.sourceFiles, packageJson: { ...base.sourceFiles.packageJson, sha256: "f".repeat(64) } } },
    { ...base, sourceFiles: { ...base.sourceFiles, packageLock: { ...base.sourceFiles.packageLock, sizeBytes: base.sourceFiles.packageLock.sizeBytes + 1 } } }
  ];

  for (const value of invalid) {
    assert.throws(() => parseArtifactReceipt({ value, candidate, packageBytes, lockBytes, artifactManifestBytes: staged.manifestBytes }), condition("artifact_stage_receipt_invalid"));
  }
});

function dynamicRuntime(overrides = {}) {
  const statePublicRoot = resolve("dynamic-worker-state-public");
  return createCandidateDependencyGateTestRuntime({
    stateRoot: resolve(statePublicRoot, "private"),
    statePublicRoot,
    workerInputRoot: resolve("dynamic-worker-input"),
    ...overrides
  });
}

test("DynamicUser transient workers use the fixed fail-closed command contract", () => {
  const runtime = dynamicRuntime();
  const unit = "control-plane-candidate-dependency-build-test";
  const workerInputDirectory = resolve(runtime.workerInputRoot, unit);
  const workerVisibleInputDirectory = resolve("/run/control-plane-candidate-dependency-input", unit);
  const publicStateDirectory = resolve(runtime.statePublicRoot, unit);
  const hostStateDirectory = resolve(runtime.stateRoot, unit);
  const invocation = buildTransientUnitInvocation({
    kind: "build",
    unit,
    input: [resolve(workerInputDirectory, "package.json"), resolve(workerInputDirectory, "package-lock.json")],
    runtime
  });
  assert.equal(invocation.command, "/usr/bin/systemd-run");
  for (const property of [
    "DynamicUser=yes", "KillMode=control-group", "SendSIGKILL=yes", "NoNewPrivileges=yes",
    "CapabilityBoundingSet=", "ProtectSystem=strict", "ProtectHome=yes", "PrivateTmp=yes",
    "PrivateDevices=yes", "ProtectControlGroups=yes", "Delegate=no", "Slice=system.slice", "StateDirectory=control-plane-candidate-dependency-build-test",
    "StateDirectoryMode=0700", "TimeoutStartSec=300", "TimeoutStopSec=15", "TasksMax=128", "MemoryMax=1G"
  ]) assert.ok(invocation.args.includes(`--property=${property}`), property);
  const separator = invocation.args.indexOf("--");
  assert.ok(separator > 0);
  assert.deepEqual(invocation.args.slice(separator + 1, separator + 3), ["/usr/bin/env", "-i"]);
  assert.ok(invocation.args.includes("PATH=/usr/bin:/bin"));
  assert.ok(invocation.args.includes("npm_config_globalconfig=/dev/null"));
  assert.ok(invocation.args.includes(`STATE_DIRECTORY=${publicStateDirectory}`));
  assert.ok(invocation.args.includes(`HOME=${resolve(publicStateDirectory, "home")}`));
  assert.equal(invocation.args.some((part) => /^NODE_OPTIONS=|^https?_proxy=|^npm_config_userconfig=/.test(part)), false);
  assert.ok(invocation.args.includes(`--property=BindReadOnlyPaths=${workerInputDirectory}:${workerVisibleInputDirectory}:norbind`));
  const packageIndex = invocation.args.indexOf("--package-json");
  const lockIndex = invocation.args.indexOf("--package-lock");
  assert.equal(invocation.args[packageIndex + 1], resolve(workerVisibleInputDirectory, "package.json"));
  assert.equal(invocation.args[lockIndex + 1], resolve(workerVisibleInputDirectory, "package-lock.json"));
  assert.deepEqual(invocation.contract, {
    paths: {
      hostStateDirectory,
      publicStateDirectory,
      workerInputDirectory,
      privateNpmDirectories: {
        home: resolve(publicStateDirectory, "home"),
        cache: resolve(publicStateDirectory, "cache"),
        prefix: resolve(publicStateDirectory, "prefix"),
        tmp: resolve(publicStateDirectory, "tmp")
      }
    },
    prelaunchInputCustody: {
      phase: "before_launch",
      trustedParentChain: true,
      rootOwned: true,
      noGroupOtherWrite: true,
      inputs: [
        { path: resolve(workerInputDirectory, "package.json"), type: "file", nlink: 1 },
        { path: resolve(workerInputDirectory, "package-lock.json"), type: "file", nlink: 1 }
      ]
    },
    workerInputBindReadOnly: {
      source: workerInputDirectory,
      target: workerVisibleInputDirectory,
      property: `BindReadOnlyPaths=${workerInputDirectory}:${workerVisibleInputDirectory}:norbind`
    },
    smokeBindReadOnly: null,
    stateTopology: {
      publicMustResolveToHost: true,
      privateParent: runtime.stateRoot
    },
    cgroupReadback: {
      serviceUnit: `${unit}.service`,
      controlGroup: `/system.slice/${unit}.service`,
      activeState: "inactive",
      subState: "dead",
      result: "success",
      execMainStatus: 0,
      controlGroupRequired: true,
      cgroupEventsPopulated: 0,
      cgroupProcsEmpty: true
    },
    seize: {
      hostPath: hostStateDirectory,
      afterCgroupEmpty: true,
      owner: 0,
      gid: 0,
      mode: "0700",
      noSymlink: true,
      beforeRecursiveAudit: true
    },
    workerPostcondition: {
      stateDirectoryEnvironment: "STATE_DIRECTORY",
      privateRuntimeMode: "0700",
      rootOwnedAfterSeize: true,
      privateNpmDirectories: {
        home: resolve(publicStateDirectory, "home"),
        cache: resolve(publicStateDirectory, "cache"),
        prefix: resolve(publicStateDirectory, "prefix"),
        tmp: resolve(publicStateDirectory, "tmp")
      }
    }
  });
});

test("DynamicUser worker contract rejects free paths, kind-unit drift, and noncanonical inputs", () => {
  const runtime = dynamicRuntime();
  const buildUnit = "control-plane-candidate-dependency-build-test";
  const buildInput = [resolve(runtime.workerInputRoot, buildUnit, "package.json"), resolve(runtime.workerInputRoot, buildUnit, "package-lock.json")];
  const extractUnit = "control-plane-candidate-dependency-extract-test";
  const extractInput = [resolve(runtime.workerInputRoot, extractUnit, "sealed-node-modules.tar")];
  for (const request of [
    { kind: "build", unit: buildUnit, stateDirectory: resolve("attacker-state"), input: buildInput },
    { kind: "extract", unit: buildUnit, input: buildInput },
    { kind: "build", unit: extractUnit, input: buildInput },
    { kind: "build", unit: buildUnit, input: [buildInput[1], buildInput[0]] },
    { kind: "build", unit: buildUnit, input: [buildInput[0], buildInput[0]] },
    { kind: "extract", unit: extractUnit, input: [...extractInput, extractInput[0]] }
  ]) assert.throws(() => buildTransientUnitInvocation({ ...request, runtime }), condition("invalid_input"));
});

test("DynamicUser smoke contract fixes sealed inputs and the only read-only bind shape", () => {
  const runtime = dynamicRuntime();
  const unit = "control-plane-candidate-dependency-smoke-test";
  const inputDirectory = resolve(runtime.workerInputRoot, unit);
  const input = [
    resolve(inputDirectory, "sealed-node-modules-tree"),
    resolve(inputDirectory, "smoke-fixture.sqlite"),
    resolve(inputDirectory, "smoke-metadata.json")
  ];
  const invocation = buildTransientUnitInvocation({ kind: "smoke", unit, input, runtime });
  const expectedTarget = resolve("/run/control-plane-candidate-dependency-smoke", unit, "sealed-node-modules-tree");
  assert.ok(invocation.args.includes(`--property=BindReadOnlyPaths=${input[0]}:${expectedTarget}`));
  const sealedTreeIndex = invocation.args.indexOf("--sealed-tree");
  assert.equal(invocation.args[sealedTreeIndex + 1], expectedTarget);
  assert.deepEqual(invocation.contract.smokeBindReadOnly, {
    source: input[0], target: expectedTarget, property: `BindReadOnlyPaths=${input[0]}:${expectedTarget}`
  });
  for (const invalidInput of [
    [resolve("attacker-tree"), input[1], input[2]],
    [input[0], resolve("attacker-fixture.sqlite"), input[2]],
    [input[0], input[2], input[1]],
    [...input, input[2]]
  ]) assert.throws(() => buildTransientUnitInvocation({ kind: "smoke", unit, input: invalidInput, runtime }), condition("invalid_input"));
});

test("DynamicUser contract fixes production roots and keeps mutable roots disjoint", () => {
  const unit = "control-plane-candidate-dependency-build-test";
  const custom = dynamicRuntime();
  const input = [resolve(custom.workerInputRoot, unit, "package.json"), resolve(custom.workerInputRoot, unit, "package-lock.json")];
  assert.doesNotThrow(() => buildTransientUnitInvocation({ kind: "build", unit, input, runtime: custom }));
  assert.throws(
    () => buildTransientUnitInvocation({ kind: "build", unit, input, runtime: dynamicRuntime({ requireRoot: true }) }),
    condition("invalid_input")
  );
  assert.throws(
    () => buildTransientUnitInvocation({ kind: "build", unit, input: [resolve(custom.stateRoot, unit, "package.json"), resolve(custom.stateRoot, unit, "package-lock.json")], runtime: dynamicRuntime({ workerInputRoot: resolve("dynamic-worker-state-public", "private", "input") }) }),
    condition("invalid_input")
  );
});

test("DynamicUser readback requires exact StateDirectory topology, unit cgroup, and root custody", () => {
  const runtime = dynamicRuntime();
  const unit = "control-plane-candidate-dependency-build-test";
  const workerInputDirectory = resolve(runtime.workerInputRoot, unit);
  const hostStateDirectory = resolve(runtime.stateRoot, unit);
  const publicStateDirectory = resolve(runtime.statePublicRoot, unit);
  const topology = {
    public: { path: publicStateDirectory, realpath: hostStateDirectory, type: "symbolicLink" },
    host: { path: hostStateDirectory, realpath: hostStateDirectory, type: "directory" },
    privateParent: { path: runtime.stateRoot, realpath: runtime.stateRoot, type: "directory", uid: 0, gid: 0, mode: "0700" }
  };
  const custody = {
    root: { path: runtime.workerInputRoot, realpath: runtime.workerInputRoot, type: "directory", uid: 0, gid: 0, mode: "0700" },
    directory: { path: workerInputDirectory, realpath: workerInputDirectory, type: "directory", uid: 0, gid: 0, mode: "0711" },
    files: [
      { path: resolve(workerInputDirectory, "package.json"), realpath: resolve(workerInputDirectory, "package.json"), type: "file", uid: 0, gid: 0, mode: "0444", nlink: 1 },
      { path: resolve(workerInputDirectory, "package-lock.json"), realpath: resolve(workerInputDirectory, "package-lock.json"), type: "file", uid: 0, gid: 0, mode: "0444", nlink: 1 }
    ]
  };
  assert.doesNotThrow(() => stateTopologyReadback({ unit, runtime, observed: topology }));
  assert.doesNotThrow(() => workerInputCustodyReadback({ kind: "build", unit, runtime, observed: custody }));
  assert.deepEqual(
    transientUnitReadback({ unit, observed: { serviceUnit: `${unit}.service`, activeState: "inactive", subState: "dead", result: "exit-code", execMainStatus: 70, controlGroup: `/system.slice/${unit}.service`, cgroupEventsPopulated: 0, cgroupProcs: [] } }),
    { succeeded: false, cleanupAllowed: true }
  );
  for (const observed of [
    { ...topology, public: { ...topology.public, realpath: publicStateDirectory } },
    { ...topology, privateParent: { ...topology.privateParent, mode: "0755" } },
    { ...topology, public: { ...topology.public, path: undefined } }
  ]) assert.throws(() => stateTopologyReadback({ unit, runtime, observed }), condition("worker_readback_invalid"));
  for (const observed of [
    { ...custody, root: { ...custody.root, mode: "0755" } },
    { ...custody, directory: { ...custody.directory, mode: "0700" } },
    { ...custody, files: [{ ...custody.files[0], nlink: 2 }, custody.files[1]] }
  ]) assert.throws(() => workerInputCustodyReadback({ kind: "build", unit, runtime, observed }), condition("worker_input_custody_invalid"));
  for (const observed of [
    { serviceUnit: `${unit}.service`, activeState: "inactive", subState: "dead", result: "success", execMainStatus: 0, controlGroup: `/system.slice/${unit}.service`, cgroupEventsPopulated: 1, cgroupProcs: [] },
    { serviceUnit: `${unit}.service`, activeState: "inactive", subState: "dead", result: "success", execMainStatus: 0, controlGroup: `/other.slice/${unit}.service`, cgroupEventsPopulated: 0, cgroupProcs: [] }
  ]) assert.throws(() => transientUnitReadback({ unit, observed }), condition("worker_cleanup_uncertain"));
});

function strictWorkerEnvironment(stateDirectory) {
  return {
    PATH: "/usr/bin:/bin", LC_ALL: "C", LANG: "C", STATE_DIRECTORY: stateDirectory,
    HOME: resolve(stateDirectory, "home"), npm_config_cache: resolve(stateDirectory, "cache"),
    npm_config_prefix: resolve(stateDirectory, "prefix"), TMPDIR: resolve(stateDirectory, "tmp"),
    npm_config_globalconfig: "/dev/null"
  };
}

function mockedWorkerOperations() {
  const entries = new Map();
  return {
    entries,
    getuid() { return 65534; },
    getgid() { return 65534; },
    mkdir(path) { entries.set(path, { type: "directory", mode: "0700" }); },
    chmod(path, mode) { const value = entries.get(path); entries.set(path, { ...value, mode: mode.toString(8).padStart(4, "0") }); },
    fsync() {},
    lstat(path) { return entries.get(path); }
  };
}

test("core-only DynamicUser worker parses fixed modes, strips ambient env, and proves private directories", () => {
  const stateDirectory = resolve("dynamic-worker-public-state", "control-plane-candidate-dependency-build-test");
  const buildInputDirectory = resolve("/run/control-plane-candidate-dependency-input", "control-plane-candidate-dependency-build-test");
  const operations = mockedWorkerOperations();
  const build = prepareCandidateDependencyWorker({
    argv: ["--mode", "build", "--package-json", resolve(buildInputDirectory, "package.json"), "--package-lock", resolve(buildInputDirectory, "package-lock.json")],
    env: strictWorkerEnvironment(stateDirectory), operations
  });
  assert.equal(build.mode, "build");
  assert.deepEqual(build.privateDirectories, [resolve(stateDirectory, "home"), resolve(stateDirectory, "cache"), resolve(stateDirectory, "prefix"), resolve(stateDirectory, "tmp"), resolve(stateDirectory, "work")]);
  for (const path of build.privateDirectories) assert.deepEqual(operations.entries.get(path), { type: "directory", mode: "0700" });
  const extractInputDirectory = resolve("/run/control-plane-candidate-dependency-input", "control-plane-candidate-dependency-extract-test");
  assert.throws(() => prepareCandidateDependencyWorker({ argv: ["--mode", "extract", "--archive", resolve(extractInputDirectory, "sealed-node-modules.tar")], env: { ...strictWorkerEnvironment(stateDirectory), NODE_OPTIONS: "--inspect" }, operations: mockedWorkerOperations() }), condition("worker_environment_invalid"));
  assert.throws(() => prepareCandidateDependencyWorker({ argv: ["--mode", "build", "--package-json", resolve(buildInputDirectory, "package-lock.json"), "--package-lock", resolve(buildInputDirectory, "package.json")], env: strictWorkerEnvironment(stateDirectory), operations: mockedWorkerOperations() }), condition("worker_input_invalid"));
  assert.throws(() => prepareCandidateDependencyWorker({ argv: ["--mode", "extract", "--archive", resolve(extractInputDirectory, "sealed-node-modules.tar")], env: strictWorkerEnvironment(resolve("dynamic-worker-public-state", "control-plane-candidate-dependency-extract-test")), operations: { ...mockedWorkerOperations(), lstat: () => ({ type: "symbolicLink", mode: "0700" }) } }), condition("worker_private_directory_invalid"));
  const smokeUnit = "control-plane-candidate-dependency-smoke-test";
  const smokeTarget = resolve("/run/control-plane-candidate-dependency-smoke", smokeUnit, "sealed-node-modules-tree");
  const smokeInputDirectory = resolve("/run/control-plane-candidate-dependency-input", smokeUnit);
  const smoke = prepareCandidateDependencyWorker({
    argv: ["--mode", "smoke", "--sealed-tree", smokeTarget, "--sqlite-fixture", resolve(smokeInputDirectory, "smoke-fixture.sqlite"), "--metadata", resolve(smokeInputDirectory, "smoke-metadata.json")],
    env: strictWorkerEnvironment(resolve("dynamic-worker-public-state", smokeUnit)), operations: mockedWorkerOperations()
  });
  assert.equal(smoke.mode, "smoke");
  assert.equal(smoke.input.sealedTree, smokeTarget);
  assert.throws(() => prepareCandidateDependencyWorker({
    argv: ["--mode", "smoke", "--sealed-tree", resolve(smokeInputDirectory, "sealed-node-modules-tree"), "--sqlite-fixture", resolve(smokeInputDirectory, "smoke-fixture.sqlite"), "--metadata", resolve(smokeInputDirectory, "smoke-metadata.json")],
    env: strictWorkerEnvironment(stateDirectory), operations: mockedWorkerOperations()
  }), condition("worker_input_invalid"));
});

test("build worker fails closed before package lifecycle without an enforced aggregate storage boundary", () => {
  const unit = "control-plane-candidate-dependency-build-test";
  const stateDirectory = resolve("dynamic-worker-public-state", unit);
  const inputDirectory = resolve("/run/control-plane-candidate-dependency-input", unit);
  const operations = mockedWorkerOperations();
  const calls = [];
  operations.mkdir = (...args) => { calls.push({ kind: "mkdir", args }); };
  operations.chmod = (...args) => { calls.push({ kind: "chmod", args }); };
  operations.copyFile = (source, destination) => {
    calls.push({ kind: "copy", source, destination });
    operations.entries.set(destination, { type: "file", mode: "0600" });
  };
  operations.run = (command, args, options) => {
    calls.push({ kind: "run", command, args, options });
    if (command === "/usr/bin/tar") operations.entries.set(args[args.indexOf("--file") + 1], { type: "file", mode: "0600" });
    return { status: 0, error: false };
  };
  operations.fsync = (path) => { calls.push({ kind: "fsync", path }); };
  assert.throws(
    () => runCandidateDependencyWorker({
      argv: ["--mode", "build", "--package-json", resolve(inputDirectory, "package.json"), "--package-lock", resolve(inputDirectory, "package-lock.json")],
      env: strictWorkerEnvironment(stateDirectory),
      operations
    }),
    condition("worker_storage_limit_unavailable")
  );
  assert.deepEqual(calls, []);
  assert.throws(
    () => runCandidateDependencyWorker({
      argv: ["--mode", "build", "--package-json", resolve("attacker", "package.json"), "--package-lock", resolve("attacker", "package-lock.json")],
      env: strictWorkerEnvironment(stateDirectory),
      operations: mockedWorkerOperations()
    }),
    condition("worker_input_invalid")
  );
  for (const [name, value] of [["getuid", 0], ["getgid", 0]]) {
    let mkdirCalls = 0;
    const privileged = { ...mockedWorkerOperations(), [name]() { return value; }, mkdir() { mkdirCalls += 1; } };
    assert.throws(
      () => runCandidateDependencyWorker({
        argv: ["--mode", "build", "--package-json", resolve(inputDirectory, "package.json"), "--package-lock", resolve(inputDirectory, "package-lock.json")],
        env: strictWorkerEnvironment(stateDirectory), operations: privileged
      }),
      condition("worker_execution_failed")
    );
    assert.equal(mkdirCalls, 0);
  }
});

test("Linux build input staging seals exact candidate package bytes without touching the candidate", { skip: isWindows }, (t) => {
  const value = fixture(t);
  const unit = "control-plane-candidate-dependency-build-test";
  const staged = stageBuildWorkerInputs({ candidateRelease: value.candidate, expectedCurrentRelease: value.active, unit, runtime: value.runtime });
  const inputDirectory = join(value.root, "worker-inputs", unit);
  assert.equal(staged.directory.path, inputDirectory);
  assert.deepEqual(staged.files.map((entry) => entry.path), [join(inputDirectory, "package.json"), join(inputDirectory, "package-lock.json")]);
  assert.deepEqual(staged.files.map((entry) => entry.sha256), [hash(value.packageBytes), hash(value.lockBytes)]);
  assert.equal(lstatSync(join(value.root, "worker-inputs")).mode & 0o777, 0o700);
  assert.equal(lstatSync(inputDirectory).mode & 0o777, 0o711);
  for (const entry of staged.files) {
    const metadata = lstatSync(entry.path);
    assert.equal(metadata.isSymbolicLink(), false);
    assert.equal(metadata.nlink, 1);
    assert.equal(metadata.mode & 0o777, 0o444);
  }
  assert.equal(existsSync(join(value.candidateRoot, "node_modules")), false);
  assert.throws(
    () => stageBuildWorkerInputs({ candidateRelease: value.candidate, expectedCurrentRelease: value.active, unit, runtime: value.runtime }),
    condition("worker_input_custody_invalid")
  );
});

test("top-level StateDirectory seize requires completed cgroup cleanup and never recurses", () => {
  const runtime = dynamicRuntime({ getuid: () => 47, getgid: () => 53 });
  const unit = "control-plane-candidate-dependency-build-test";
  const path = resolve(runtime.stateRoot, unit);
  const trace = [];
  let value = { type: "directory", dev: 9, ino: 12, uid: 65534, gid: 65534, mode: 0o700 };
  const operations = {
    lstat(target) { trace.push(["lstat", target]); return { ...value }; },
    chown(target, uid, gid) { trace.push(["chown", target, uid, gid]); value = { ...value, uid, gid }; },
    chmod(target, mode) { trace.push(["chmod", target, mode]); value = { ...value, mode }; },
    readdir() { throw new Error("recursive traversal is forbidden"); },
    remove() { throw new Error("cleanup is forbidden before an explicit cleanup stage"); }
  };
  assert.deepEqual(
    seizeWorkerStateTopLevel({ kind: "build", unit, terminal: { succeeded: true, cleanupAllowed: true }, runtime, operations }),
    { path, identity: "9:12" }
  );
  assert.deepEqual(trace, [
    ["lstat", path], ["chown", path, 47, 53], ["chmod", path, 0o700], ["lstat", path]
  ]);
  const untouched = [];
  assert.throws(
    () => seizeWorkerStateTopLevel({ kind: "build", unit, terminal: { succeeded: false, cleanupAllowed: true }, runtime, operations: { lstat() { untouched.push("lstat"); } } }),
    (error) => error instanceof CandidateDependencyGateError && error.condition === "worker_cleanup_uncertain" && error.attentionRequired === true
  );
  assert.deepEqual(untouched, []);

  let injectedOperationCalls = 0;
  const productionLike = dynamicRuntime({ requireRoot: true, getuid: () => 0 });
  assert.throws(
    () => seizeWorkerStateTopLevel({ kind: "build", unit, terminal: { succeeded: true, cleanupAllowed: true }, runtime: productionLike, operations: { lstat() { injectedOperationCalls += 1; }, chown() { injectedOperationCalls += 1; }, chmod() { injectedOperationCalls += 1; } } }),
    condition("worker_storage_limit_unavailable")
  );
  assert.equal(injectedOperationCalls, 0);
});

test("production build handover fails before staging or launch without a storage boundary", (t) => {
  const root = resolve(tmpdir(), `gccgw-storage-boundary-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  let launches = 0;
  const runtime = createCandidateDependencyGateTestRuntime({
    requireRoot: true,
    getuid: () => 0,
    root,
    stateRoot: join(root, "state", "private"),
    statePublicRoot: join(root, "state"),
    workerInputRoot: join(root, "worker-inputs"),
    sealedArchiveRoot: join(root, "sealed-archives"),
    launchTransientUnit() { launches += 1; return { status: 0 }; }
  });
  t.after(() => rmSync(root, { recursive: true, force: true }));

  assert.throws(
    () => sealBuildWorkerArchive({
      candidateRelease: "candidate-release",
      expectedCurrentRelease: "active-release",
      unit: "control-plane-candidate-dependency-build-test",
      runtime
    }),
    condition("worker_storage_limit_unavailable")
  );
  assert.equal(launches, 0);
  assert.equal(existsSync(runtime.workerInputRoot), false);
  assert.equal(existsSync(runtime.stateRoot), false);
  assert.equal(existsSync(runtime.sealedArchiveRoot), false);
});

test("Linux build handover freezes the exact worker archive only after a successful cgroup proof", { skip: isWindows }, (t) => {
  const value = fixture(t);
  const unit = "control-plane-candidate-dependency-build-test";
  const statePublicRoot = join(value.root, "worker-state-public");
  const stateRoot = join(statePublicRoot, "private");
  const hostStateDirectory = join(stateRoot, unit);
  const publicStateDirectory = join(statePublicRoot, unit);
  const sourceBytes = Buffer.from("sealed archive\n");
  let leakedWorkerArchiveDescriptor;
  t.after(() => { if (leakedWorkerArchiveDescriptor !== undefined) closeSync(leakedWorkerArchiveDescriptor); });
  Object.assign(value.runtime, {
    allowTestWorkerStorage: true,
    stateRoot,
    statePublicRoot,
    launchTransientUnit() {
      mkdirSync(hostStateDirectory, { recursive: true }); chmodSync(stateRoot, 0o700); chmodSync(hostStateDirectory, 0o700); symlinkSync(hostStateDirectory, publicStateDirectory, "dir");
      const workerArchive = join(hostStateDirectory, "sealed-node-modules.tar");
      write(workerArchive, sourceBytes, 0o600); leakedWorkerArchiveDescriptor = openSync(workerArchive, "r+");
      return { status: 0 };
    },
    readTransientUnit() { return { serviceUnit: `${unit}.service`, activeState: "inactive", subState: "dead", result: "success", execMainStatus: 0, controlGroup: `/system.slice/${unit}.service`, cgroupEventsPopulated: 0, cgroupProcs: [] }; },
    readStateTopology() { return { public: { path: publicStateDirectory, realpath: hostStateDirectory, type: "symbolicLink" }, host: { path: hostStateDirectory, realpath: hostStateDirectory, type: "directory" }, privateParent: { path: stateRoot, realpath: stateRoot, type: "directory", uid: statSync(stateRoot).uid, gid: statSync(stateRoot).gid, mode: "0700" } }; }
  });
  const handover = sealBuildWorkerArchive({ candidateRelease: value.candidate, expectedCurrentRelease: value.active, unit, runtime: value.runtime });
  const workerArchive = join(hostStateDirectory, "sealed-node-modules.tar");
  const archive = join(value.root, "sealed-archives", unit, "sealed-node-modules.tar");
  const metadata = lstatSync(archive);
  assert.equal(handover.archive.path, archive);
  assert.equal(handover.archive.sha256, hash(readFileSync(archive)));
  assert.equal(handover.archive.sizeBytes, sourceBytes.length);
  assert.notEqual(`${metadata.dev}:${metadata.ino}`, `${lstatSync(workerArchive).dev}:${lstatSync(workerArchive).ino}`);
  assert.equal(metadata.isSymbolicLink(), false);
  assert.equal(metadata.isFile(), true);
  assert.equal(metadata.nlink, 1);
  assert.equal(metadata.mode & 0o777, 0o400);
  assert.equal(lstatSync(value.runtime.sealedArchiveRoot).mode & 0o777, 0o700);
  assert.equal(lstatSync(dirname(archive)).mode & 0o777, 0o700);
  const sealedBytes = readFileSync(archive);
  assert.notEqual(leakedWorkerArchiveDescriptor, undefined);
  writeSync(leakedWorkerArchiveDescriptor, Buffer.alloc(sourceBytes.length, 0x58), 0, sourceBytes.length, 0);
  fsyncSync(leakedWorkerArchiveDescriptor); closeSync(leakedWorkerArchiveDescriptor); leakedWorkerArchiveDescriptor = undefined;
  assert.deepEqual(readFileSync(archive), sealedBytes);
  assert.equal(handover.archive.sha256, hash(sealedBytes));
  assert.equal(existsSync(join(value.candidateRoot, "node_modules")), false);
});

test("Linux smoke prelaunch audit rejects unsafe sealed trees before launch", { skip: isWindows }, (t) => {
  const base = resolve(tmpdir(), `gccgw-sealed-smoke-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const unit = "control-plane-candidate-dependency-smoke-test";
  const publicRoot = join(base, "public"), stateRoot = join(publicRoot, "private"), inputRoot = join(base, "input");
  const host = join(stateRoot, unit), publicPath = join(publicRoot, unit), inputDirectory = join(inputRoot, unit);
  const tree = join(inputDirectory, "sealed-node-modules-tree");
  const smokeInput = [tree, join(inputDirectory, "smoke-fixture.sqlite"), join(inputDirectory, "smoke-metadata.json")];
  let launches = 0;
  const runtime = createCandidateDependencyGateTestRuntime({
    stateRoot, statePublicRoot: publicRoot, workerInputRoot: inputRoot, useFdSealedSmokeTreeAudit: true,
    checkAclCapabilities() { return true; },
    launchTransientUnit() { launches += 1; return { status: 0 }; },
    readTransientUnit() { return { serviceUnit: `${unit}.service`, activeState: "inactive", subState: "dead", result: "success", execMainStatus: 0, controlGroup: `/system.slice/${unit}.service`, cgroupEventsPopulated: 0, cgroupProcs: [] }; },
    readStateTopology() { return { public: { path: publicPath, realpath: host, type: "symbolicLink" }, host: { path: host, realpath: host, type: "directory" }, privateParent: { path: stateRoot, realpath: stateRoot, type: "directory", uid: 0, gid: 0, mode: "0700" } }; }
  });
  const reset = () => {
    rmSync(base, { recursive: true, force: true });
    mkdirSync(host, { recursive: true }); chmodSync(stateRoot, 0o700); symlinkSync(host, publicPath, "dir");
    mkdirSync(join(tree, "nested"), { recursive: true });
    write(join(tree, "nested", "module.js"), "module.exports = 1;\n", 0o444);
    write(smokeInput[1], "SQLite format 3\u0000fixture", 0o444);
    write(smokeInput[2], "{\"fixture\":\"minimal\"}\n", 0o444);
    chmodSync(inputRoot, 0o700); chmodSync(inputDirectory, 0o711); chmodSync(tree, 0o755); chmodSync(join(tree, "nested"), 0o755);
  };
  const call = () => invokeCandidateDependencyTransientUnit({ kind: "smoke", unit, input: smokeInput, runtime });
  t.after(() => rmSync(base, { recursive: true, force: true }));

  reset(); launches = 0; const valid = call(); assert.equal(launches, 1); assert.match(valid.sealedTreeEvidence.digest, /^[a-f0-9]{64}$/); assert.equal(valid.sealedTreeEvidence.entryCount, 3);
  reset(); symlinkSync("nested/module.js", join(tree, "link-two")); symlinkSync("link-two", join(tree, "link-one")); launches = 0;
  assert.equal(call().sealedTreeEvidence.entryCount, 5); assert.equal(launches, 1);
  reset(); symlinkSync("nested/module.js", join(tree, "hop-1")); for (let index = 2; index <= 17; index += 1) symlinkSync(`hop-${index - 1}`, join(tree, `hop-${index}`)); launches = 0;
  assert.throws(call, condition("worker_input_custody_invalid")); assert.equal(launches, 0);
  runtime.sealedTreeLimits = { maxDepth: 256, maxEntries: 512, maxHashBytes: 1024 * 1024 };
  reset(); let deepPath = tree, targetParts = [];
  for (let index = 0; index < 129; index += 1) { const name = `d${index}`; targetParts.push(name); deepPath = join(deepPath, name); mkdirSync(deepPath); }
  write(join(deepPath, "entry.js"), "module.exports = 3;\n", 0o444); symlinkSync(`${targetParts.join("/")}/entry.js`, join(tree, "too-many-components")); launches = 0;
  assert.throws(call, condition("worker_input_custody_invalid")); assert.equal(launches, 0);
  delete runtime.sealedTreeLimits;
  for (const corrupt of [
    () => chmodSync(join(tree, "nested"), 0o777),
    () => { write(join(base, "outside"), "outside\n", 0o444); symlinkSync(join(base, "outside"), join(tree, "external")); },
    () => symlinkSync(join(tree, "missing"), join(tree, "broken")),
    () => linkSync(join(tree, "nested", "module.js"), join(tree, "nested", "module-copy.js"))
  ]) {
    reset(); corrupt(); launches = 0;
    assert.throws(call, condition("worker_input_custody_invalid"));
    assert.equal(launches, 0);
  }

  reset(); runtime.checkAclCapabilities = () => false; launches = 0;
  assert.throws(call, condition("worker_input_custody_invalid"));
  assert.equal(launches, 0);
  delete runtime.checkAclCapabilities;

  const aclChecks = [];
  runtime.checkAclCapabilities = (value) => { aclChecks.push(value); return true; };
  runtime.sealedTreeLimits = { maxDepth: 2, maxEntries: 64, maxHashBytes: 1024 };
  reset(); mkdirSync(join(tree, "a", "b", "c"), { recursive: true }); launches = 0;
  assert.throws(call, condition("worker_input_custody_invalid"));
  assert.equal(launches, 0);
  assert.equal(aclChecks.some((value) => value.recursive), false);

  runtime.sealedTreeLimits = { maxDepth: 64, maxEntries: 2, maxHashBytes: 1024 };
  reset(); launches = 0;
  assert.throws(call, condition("worker_input_custody_invalid"));
  assert.equal(launches, 0);

  runtime.sealedTreeLimits = { maxDepth: 64, maxEntries: 3, maxHashBytes: 1024 };
  reset(); write(join(tree, "nested", "another.js"), "module.exports = 2;\n", 0o444); launches = 0;
  assert.throws(call, condition("worker_input_custody_invalid"));
  assert.equal(launches, 0);

  runtime.sealedTreeLimits = { maxDepth: 64, maxEntries: 64, maxHashBytes: 4 };
  reset(); write(join(tree, "nested", "large.js"), "12345", 0o444); launches = 0;
  assert.throws(call, condition("worker_input_custody_invalid"));
  assert.equal(launches, 0);
  delete runtime.sealedTreeLimits;
  delete runtime.checkAclCapabilities;
});

test("Linux smoke prelaunch audit rejects named ACLs before launch", { skip: isWindows }, (t) => {
  const setfacl = "/usr/bin/setfacl";
  const getfacl = "/usr/bin/getfacl";
  if (spawnSync(setfacl, ["--version"], { stdio: "ignore" }).status !== 0 || spawnSync(getfacl, ["--version"], { stdio: "ignore" }).status !== 0) {
    t.skip("ACL tools unavailable");
    return;
  }
  const base = resolve(tmpdir(), `gccgw-sealed-smoke-acl-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const unit = "control-plane-candidate-dependency-smoke-test";
  const publicRoot = join(base, "public"), stateRoot = join(publicRoot, "private"), inputRoot = join(base, "input");
  const host = join(stateRoot, unit), publicPath = join(publicRoot, unit), inputDirectory = join(inputRoot, unit);
  const tree = join(inputDirectory, "sealed-node-modules-tree");
  const input = [tree, join(inputDirectory, "smoke-fixture.sqlite"), join(inputDirectory, "smoke-metadata.json")];
  let launches = 0;
  const runtime = createCandidateDependencyGateTestRuntime({
    stateRoot, statePublicRoot: publicRoot, workerInputRoot: inputRoot, useFdSealedSmokeTreeAudit: true,
    launchTransientUnit() { launches += 1; return { status: 0 }; },
    readTransientUnit() { return { serviceUnit: `${unit}.service`, activeState: "inactive", subState: "dead", result: "success", execMainStatus: 0, controlGroup: `/system.slice/${unit}.service`, cgroupEventsPopulated: 0, cgroupProcs: [] }; },
    readStateTopology() { return { public: { path: publicPath, realpath: host, type: "symbolicLink" }, host: { path: host, realpath: host, type: "directory" }, privateParent: { path: stateRoot, realpath: stateRoot, type: "directory", uid: 0, gid: 0, mode: "0700" } }; }
  });
  t.after(() => rmSync(base, { recursive: true, force: true }));
  mkdirSync(host, { recursive: true }); chmodSync(stateRoot, 0o700); symlinkSync(host, publicPath, "dir");
  mkdirSync(join(tree, "nested"), { recursive: true }); write(join(tree, "nested", "module.js"), "module.exports = 1;\n", 0o444);
  write(input[1], "SQLite format 3\u0000fixture", 0o444); write(input[2], "{\"fixture\":\"minimal\"}\n", 0o444);
  chmodSync(inputRoot, 0o700); chmodSync(inputDirectory, 0o711); chmodSync(tree, 0o755); chmodSync(join(tree, "nested"), 0o755);
  const acl = spawnSync(setfacl, ["-m", "u:nobody:rwX", join(tree, "nested")], { encoding: "utf8" });
  if (acl.status !== 0) { t.skip("named ACL unavailable"); return; }
  assert.throws(() => invokeCandidateDependencyTransientUnit({ kind: "smoke", unit, input, runtime }), condition("worker_input_custody_invalid"));
  assert.equal(launches, 0);
});

test("transient adapter reads exact terminal/cgroup and custody before reporting success", () => {
  const runtime = dynamicRuntime();
  const unit = "control-plane-candidate-dependency-build-test";
  const input = [resolve(runtime.workerInputRoot, unit, "package.json"), resolve(runtime.workerInputRoot, unit, "package-lock.json")];
  const host = resolve(runtime.stateRoot, unit), publicPath = resolve(runtime.statePublicRoot, unit), inputDirectory = resolve(runtime.workerInputRoot, unit);
  const trace = [];
  Object.assign(runtime, {
    launchTransientUnit({ invocation }) { trace.push("launch"); assert.ok(invocation.args.includes("--property=Slice=system.slice")); return { status: 0 }; },
    readTransientUnit() { trace.push("terminal"); return { serviceUnit: `${unit}.service`, activeState: "inactive", subState: "dead", result: "success", execMainStatus: 0, controlGroup: `/system.slice/${unit}.service`, cgroupEventsPopulated: 0, cgroupProcs: [] }; },
    readWorkerInputCustody() { trace.push("custody"); return { root: { path: runtime.workerInputRoot, realpath: runtime.workerInputRoot, type: "directory", uid: 0, gid: 0, mode: "0700" }, directory: { path: inputDirectory, realpath: inputDirectory, type: "directory", uid: 0, gid: 0, mode: "0711" }, files: input.map((path) => ({ path, realpath: path, type: "file", uid: 0, gid: 0, mode: "0444", nlink: 1 })) }; },
    readStateTopology() { trace.push("topology"); return { public: { path: publicPath, realpath: host, type: "symbolicLink" }, host: { path: host, realpath: host, type: "directory" }, privateParent: { path: runtime.stateRoot, realpath: runtime.stateRoot, type: "directory", uid: 0, gid: 0, mode: "0700" } }; }
  });
  assert.deepEqual(invokeCandidateDependencyTransientUnit({ kind: "build", unit, input, runtime }), { succeeded: true, cleanupAllowed: true });
  assert.deepEqual(trace, ["custody", "launch", "terminal", "topology"]);

  const untrustedTrace = [];
  const untrusted = dynamicRuntime({
    readWorkerInputCustody() { untrustedTrace.push("custody"); return { root: { path: runtime.workerInputRoot, realpath: runtime.workerInputRoot, type: "directory", uid: 0, gid: 0, mode: "0700" }, directory: { path: inputDirectory, realpath: inputDirectory, type: "directory", uid: 0, gid: 0, mode: "0711" }, files: input.map((path, index) => ({ path, realpath: path, type: "file", uid: 0, gid: 0, mode: "0444", nlink: index === 0 ? 2 : 1 })) }; },
    launchTransientUnit() { untrustedTrace.push("launch"); return { status: 0 }; },
    readTransientUnit() { untrustedTrace.push("terminal"); return null; },
    readStateTopology() { untrustedTrace.push("topology"); return null; }
  });
  const untrustedInput = [resolve(untrusted.workerInputRoot, unit, "package.json"), resolve(untrusted.workerInputRoot, unit, "package-lock.json")];
  assert.throws(() => invokeCandidateDependencyTransientUnit({ kind: "build", unit, input: untrustedInput, runtime: untrusted }), condition("worker_input_custody_invalid"));
  assert.deepEqual(untrustedTrace, ["custody"]);

  const invalidLaunchTrace = [];
  const invalidLaunch = dynamicRuntime({
    launchTransientUnit() { invalidLaunchTrace.push("launch"); return { status: "zero" }; },
    readTransientUnit() { invalidLaunchTrace.push("terminal"); return null; },
    readStateTopology() { invalidLaunchTrace.push("topology"); return null; },
    readWorkerInputCustody() { invalidLaunchTrace.push("custody"); const dir = resolve(invalidLaunch.workerInputRoot, unit); const paths = [resolve(dir, "package.json"), resolve(dir, "package-lock.json")]; return { root: { path: invalidLaunch.workerInputRoot, realpath: invalidLaunch.workerInputRoot, type: "directory", uid: 0, gid: 0, mode: "0700" }, directory: { path: dir, realpath: dir, type: "directory", uid: 0, gid: 0, mode: "0711" }, files: paths.map((path) => ({ path, realpath: path, type: "file", uid: 0, gid: 0, mode: "0444", nlink: 1 })) }; }
  });
  assert.throws(() => invokeCandidateDependencyTransientUnit({ kind: "build", unit, input: [resolve(invalidLaunch.workerInputRoot, unit, "package.json"), resolve(invalidLaunch.workerInputRoot, unit, "package-lock.json")], runtime: invalidLaunch }), condition("worker_adapter_unavailable"));
  assert.deepEqual(invalidLaunchTrace, ["custody", "launch"]);

  const cgroupTrace = [];
  const cgroupInvalid = dynamicRuntime({
    launchTransientUnit() { cgroupTrace.push("launch"); return { status: 70 }; },
    readTransientUnit() { cgroupTrace.push("terminal"); return { serviceUnit: `${unit}.service`, activeState: "inactive", subState: "dead", result: "exit-code", execMainStatus: 70, controlGroup: `/system.slice/${unit}.service`, cgroupEventsPopulated: 1, cgroupProcs: [] }; },
    readStateTopology() { cgroupTrace.push("topology"); return null; },
    readWorkerInputCustody() { cgroupTrace.push("custody"); const dir = resolve(cgroupInvalid.workerInputRoot, unit); const paths = [resolve(dir, "package.json"), resolve(dir, "package-lock.json")]; return { root: { path: cgroupInvalid.workerInputRoot, realpath: cgroupInvalid.workerInputRoot, type: "directory", uid: 0, gid: 0, mode: "0700" }, directory: { path: dir, realpath: dir, type: "directory", uid: 0, gid: 0, mode: "0711" }, files: paths.map((path) => ({ path, realpath: path, type: "file", uid: 0, gid: 0, mode: "0444", nlink: 1 })) }; }
  });
  assert.throws(() => invokeCandidateDependencyTransientUnit({ kind: "build", unit, input: [resolve(cgroupInvalid.workerInputRoot, unit, "package.json"), resolve(cgroupInvalid.workerInputRoot, unit, "package-lock.json")], runtime: cgroupInvalid }), (error) => error instanceof CandidateDependencyGateError && error.condition === "worker_cleanup_uncertain" && error.attentionRequired === true);
  assert.deepEqual(cgroupTrace, ["custody", "launch", "terminal"]);

  const exitTrace = [];
  const exitCode = dynamicRuntime({
    launchTransientUnit() { exitTrace.push("launch"); return { status: 70 }; },
    readTransientUnit() { exitTrace.push("terminal"); return { serviceUnit: `${unit}.service`, activeState: "inactive", subState: "dead", result: "exit-code", execMainStatus: 70, controlGroup: `/system.slice/${unit}.service`, cgroupEventsPopulated: 0, cgroupProcs: [] }; },
    readStateTopology() { exitTrace.push("topology"); return { public: { path: publicPath, realpath: host, type: "symbolicLink" }, host: { path: host, realpath: host, type: "directory" }, privateParent: { path: exitCode.stateRoot, realpath: exitCode.stateRoot, type: "directory", uid: 0, gid: 0, mode: "0700" } }; },
    readWorkerInputCustody() { exitTrace.push("custody"); const dir = resolve(exitCode.workerInputRoot, unit); const paths = [resolve(dir, "package.json"), resolve(dir, "package-lock.json")]; return { root: { path: exitCode.workerInputRoot, realpath: exitCode.workerInputRoot, type: "directory", uid: 0, gid: 0, mode: "0700" }, directory: { path: dir, realpath: dir, type: "directory", uid: 0, gid: 0, mode: "0711" }, files: paths.map((path) => ({ path, realpath: path, type: "file", uid: 0, gid: 0, mode: "0444", nlink: 1 })) }; }
  });
  assert.deepEqual(invokeCandidateDependencyTransientUnit({ kind: "build", unit, input: [resolve(exitCode.workerInputRoot, unit, "package.json"), resolve(exitCode.workerInputRoot, unit, "package-lock.json")], runtime: exitCode }), { succeeded: false, cleanupAllowed: true });
  assert.deepEqual(exitTrace, ["custody", "launch", "terminal", "topology"]);
});

test("production adapter ignores caller launch/read callbacks and internal terminal parser fails closed", () => {
  const unit = "control-plane-candidate-dependency-build-test";
  let callbackCalls = 0;
  const production = createCandidateDependencyGateTestRuntime({
    requireRoot: true,
    getuid: () => 0,
    launchTransientUnit() { callbackCalls += 1; return { status: 0 }; },
    readTransientUnit() { callbackCalls += 1; return { serviceUnit: `${unit}.service`, activeState: "inactive", subState: "dead", result: "success", execMainStatus: 0, controlGroup: `/system.slice/${unit}.service`, cgroupEventsPopulated: 0, cgroupProcs: [] }; }
  });
  const input = [resolve(production.workerInputRoot, unit, "package.json"), resolve(production.workerInputRoot, unit, "package-lock.json")];
  assert.throws(() => invokeCandidateDependencyTransientUnit({ kind: "build", unit, input, runtime: production }), condition("worker_storage_limit_unavailable"));
  assert.equal(callbackCalls, 0);

  const systemctlOutput = [
    "ActiveState=inactive", "SubState=dead", "Result=success", "ExecMainStatus=0", `ControlGroup=/system.slice/${unit}.service`
  ].join("\n");
  assert.deepEqual(
    parseProductionTransientReadback({ unit, systemctlOutput, cgroupEvents: "populated 0\n", cgroupProcs: "" }),
    { serviceUnit: `${unit}.service`, activeState: "inactive", subState: "dead", result: "success", execMainStatus: 0, controlGroup: `/system.slice/${unit}.service`, cgroupEventsPopulated: 0, cgroupProcs: [] }
  );
  assert.throws(() => parseProductionTransientReadback({ unit, systemctlOutput: "ActiveState=inactive\n", cgroupEvents: "populated 0\n", cgroupProcs: "" }), condition("worker_adapter_unavailable"));
  const nonempty = parseProductionTransientReadback({ unit, systemctlOutput, cgroupEvents: "populated 1\n", cgroupProcs: "123\n" });
  assert.throws(() => transientUnitReadback({ unit, observed: nonempty }), (error) => error instanceof CandidateDependencyGateError && error.condition === "worker_cleanup_uncertain" && error.attentionRequired === true);
  for (const read of [
    () => { throw new Error("systemctl read failed"); },
    () => parseProductionTransientReadback({ unit, systemctlOutput: "ActiveState=inactive\n", cgroupEvents: "populated 0\n", cgroupProcs: "" }),
    () => parseProductionTransientReadback({ unit, systemctlOutput, cgroupEvents: "not-a-cgroup-events-record\n", cgroupProcs: "" }),
    () => parseProductionTransientReadback({ unit, systemctlOutput, cgroupEvents: "populated 0\n", cgroupProcs: "not-a-pid\n" })
  ]) assert.throws(() => terminalReadbackAfterLaunch({ unit, read }), (error) => error instanceof CandidateDependencyGateError && error.condition === "worker_cleanup_uncertain" && error.attentionRequired === true);
});

test("production transient contract rejects tool overrides while test runtime remains mockable", () => {
  const unit = "control-plane-candidate-dependency-build-test";
  const production = createCandidateDependencyGateTestRuntime({ requireRoot: true });
  const input = [resolve(production.workerInputRoot, unit, "package.json"), resolve(production.workerInputRoot, unit, "package-lock.json")];
  for (const [name, replacement] of Object.entries({ systemdRun: "/opt/systemd-run", systemctl: "/opt/systemctl", env: "relative-env", node: "/opt/node", npm: "/opt/npm", tar: "/opt/tar", python: "/opt/python3", getfacl: "/opt/getfacl", getcap: "/opt/getcap" })) {
    assert.throws(() => buildTransientUnitInvocation({ kind: "build", unit, input, runtime: { ...production, tools: { ...production.tools, [name]: replacement } } }), condition("invalid_input"));
  }
  const testing = dynamicRuntime({ tools: { systemdRun: "mock-systemd-run", systemctl: "mock-systemctl", env: "mock-env", node: "mock-node" } });
  const testInput = [resolve(testing.workerInputRoot, unit, "package.json"), resolve(testing.workerInputRoot, unit, "package-lock.json")];
  assert.equal(buildTransientUnitInvocation({ kind: "build", unit, input: testInput, runtime: testing }).args.includes("mock-node"), true);
});

test("sealed smoke fd audit receipt accepts only the fixed single-line schema", () => {
  const tree = resolve("sealed-smoke-tree");
  const final = Buffer.from(`{"schemaVersion":"1","type":"control_plane_sealed_smoke_tree","mode":"final","entryCount":3,"digest":"${"a".repeat(64)}"}\n`);
  const pre = Buffer.from('{"schemaVersion":"1","type":"control_plane_sealed_smoke_tree","mode":"pre","entryCount":1}\n');
  assert.deepEqual(parseSealedSmokeTreeAudit(final, tree, true), { treeRoot: tree, digest: "a".repeat(64), entryCount: 3 });
  assert.deepEqual(parseSealedSmokeTreeAudit(pre, tree, false), { treeRoot: tree, entryCount: 1 });
  assert.throws(() => parseSealedSmokeTreeAudit(Buffer.from(`{"schemaVersion":"1","schemaVersion":"1","type":"control_plane_sealed_smoke_tree","mode":"final","entryCount":3,"digest":"${"a".repeat(64)}"}\n`), tree, true), condition("worker_input_custody_invalid"));
  assert.throws(() => parseSealedSmokeTreeAudit(Buffer.from(`{"schemaVersion":"1","type":"control_plane_sealed_smoke_tree","mode":"final","entryCount":3,"digest":"${"a".repeat(64)}"}\n{}\n`), tree, true), condition("worker_input_custody_invalid"));
  assert.throws(() => parseSealedSmokeTreeAudit(Buffer.from('{"schemaVersion":"1","type":"control_plane_sealed_smoke_tree","mode":"pre","entryCount":1,"digest":"x"}\n'), tree, false), condition("worker_input_custody_invalid"));
});

test("Linux physical evidence rejects symlink, type, and hardlink substitutions only after terminal readback", { skip: isWindows }, (t) => {
  const base = resolve(tmpdir(), `gccgw-dynamic-readback-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const unit = "control-plane-candidate-dependency-build-test";
  const publicRoot = join(base, "public");
  const stateRoot = join(publicRoot, "private");
  const inputRoot = join(base, "input");
  const host = join(stateRoot, unit);
  const publicPath = join(publicRoot, unit);
  const inputDirectory = join(inputRoot, unit);
  const buildInput = [join(inputDirectory, "package.json"), join(inputDirectory, "package-lock.json")];
  const runtime = createCandidateDependencyGateTestRuntime({ stateRoot, statePublicRoot: publicRoot, workerInputRoot: inputRoot });
  const terminal = () => ({ serviceUnit: `${unit}.service`, activeState: "inactive", subState: "dead", result: "success", execMainStatus: 0, controlGroup: `/system.slice/${unit}.service`, cgroupEventsPopulated: 0, cgroupProcs: [] });
  const reset = () => {
    rmSync(base, { recursive: true, force: true });
    mkdirSync(host, { recursive: true }); chmodSync(stateRoot, 0o700);
    mkdirSync(inputDirectory, { recursive: true }); chmodSync(inputRoot, 0o700); chmodSync(inputDirectory, 0o711);
    write(buildInput[0], "{}\n", 0o444); write(buildInput[1], "{}\n", 0o444);
    symlinkSync(host, publicPath, "dir");
  };
  const call = () => invokeCandidateDependencyTransientUnit({ kind: "build", unit, input: buildInput, runtime: { ...runtime, launchTransientUnit: () => ({ status: 0 }), readTransientUnit: terminal } });
  reset(); assert.deepEqual(call(), { succeeded: true, cleanupAllowed: true });
  reset(); rmSync(publicPath); mkdirSync(publicPath); assert.throws(call, condition("worker_readback_invalid"));
  reset(); rmSync(host, { recursive: true }); write(host, "not-a-directory\n", 0o600); assert.throws(call, condition("worker_readback_invalid"));
  reset(); rmSync(inputRoot, { recursive: true }); const external = join(base, "external-input"); mkdirSync(join(external, unit), { recursive: true }); write(join(external, unit, "package.json"), "{}\n", 0o444); write(join(external, unit, "package-lock.json"), "{}\n", 0o444); symlinkSync(external, inputRoot, "dir"); assert.throws(call, condition("worker_input_custody_invalid"));
  reset(); linkSync(buildInput[0], join(inputDirectory, "package-copy.json")); assert.throws(call, condition("worker_input_custody_invalid"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
});

test("preflight binds a fixed verified artifact-stage receipt and never writes", { skip: isWindows }, (t) => {
  const value = fixture(t);
  const result = preflightCandidateDependencies({
    candidateRelease: value.candidate,
    expectedCurrentRelease: value.active,
    runtime: value.runtime
  });
  assert.equal(result.state, "ready");
  assert.equal(result.sourceBinding.artifactStageReceiptBound, true);
  assert.equal(existsSync(join(value.candidateRoot, "node_modules")), false);
  assert.equal(existsSync(join(value.root, "dependency-builders")), false);
  assert.equal(existsSync(join(value.root, "dependency-receipts")), false);
  assert.equal(result.binding.packageSha256, hash(value.packageBytes));
  assert.equal(result.binding.artifactManifestSha256, hash(value.artifactManifestBytes));
  assert.equal(result.binding.artifactManifestSizeBytes, value.artifactManifestBytes.length);
  assert.equal(result.binding.artifactStageReceiptSizeBytes, value.artifactStageBytes.length);
});

test("preflight blocks absent, malformed, and package-lock mismatched staged artifact receipts", { skip: isWindows }, (t) => {
  const missing = fixture(t);
  rmSync(join(missing.root, "assembly-receipts", missing.candidate, "artifact-stage-receipt.json"));
  assert.throws(() => preflightCandidateDependencies({ candidateRelease: missing.candidate, expectedCurrentRelease: missing.active, runtime: missing.runtime }), condition("artifact_stage_receipt_missing"));

  const malformed = fixture(t, { artifactMutate: { sourceFiles: { packageJson: { sha256: "z", sizeBytes: 1 } } } });
  assert.throws(() => preflightCandidateDependencies({ candidateRelease: malformed.candidate, expectedCurrentRelease: malformed.active, runtime: malformed.runtime }), condition("artifact_stage_receipt_invalid"));

  const mismatch = fixture(t, { artifactMutate: { sourceFiles: { packageJson: { sha256: "e".repeat(64), sizeBytes: 1 }, packageLock: { sha256: "f".repeat(64), sizeBytes: 1 } } } });
  assert.throws(() => preflightCandidateDependencies({ candidateRelease: mismatch.candidate, expectedCurrentRelease: mismatch.active, runtime: mismatch.runtime }), condition("artifact_stage_receipt_invalid"));

  const sourceCommitMismatch = fixture(t, { artifactMutate: { sourceCommit: "e".repeat(40) } });
  assert.throws(() => preflightCandidateDependencies({ candidateRelease: sourceCommitMismatch.candidate, expectedCurrentRelease: sourceCommitMismatch.active, runtime: sourceCommitMismatch.runtime }), condition("artifact_stage_receipt_invalid"));
});

test("preflight rejects stale current, service CWD mismatch, and protected symlink escape", { skip: isWindows }, (t) => {
  const stale = fixture(t);
  assert.throws(() => preflightCandidateDependencies({ candidateRelease: stale.candidate, expectedCurrentRelease: "wrong-release", runtime: stale.runtime }), condition("service_identity_invalid"));

  const cwd = fixture(t);
  cwd.runtime.readService = () => ({ main: 31, exec: 31, uid: statSync(cwd.root).uid, gid: statSync(cwd.root).gid, cwd: cwd.candidateRoot, restarts: 7 });
  assert.throws(() => preflightCandidateDependencies({ candidateRelease: cwd.candidate, expectedCurrentRelease: cwd.active, runtime: cwd.runtime }), condition("service_identity_invalid"));

  const escaped = fixture(t);
  const external = join(escaped.root, "outside-env");
  write(external, "outside\n");
  rmSync(join(escaped.candidateRoot, ".env"));
  symlinkSync(external, join(escaped.candidateRoot, ".env"));
  assert.throws(() => preflightCandidateDependencies({ candidateRelease: escaped.candidate, expectedCurrentRelease: escaped.active, runtime: escaped.runtime }), condition("assembly_manifest_invalid"));
});

test("archive listing accepts only NUL-safe node_modules components", () => {
  assert.deepEqual(validateNodeModulesArchiveListing(Buffer.from("node_modules/\0node_modules/a/index.js\0")), ["node_modules", "node_modules/a/index.js"]);
  for (const bytes of [
    Buffer.from("../outside\0"),
    Buffer.from("node_modules/../../outside\0"),
    Buffer.from("/node_modules/a\0"),
    Buffer.from("node_modules\\outside\0"),
    Buffer.from("node_modules/a")
  ]) {
    assert.throws(() => validateNodeModulesArchiveListing(bytes), condition("archive_path_invalid"));
  }
});

test("materialize never falls back to the legacy host-side npm pipeline", async () => {
  let legacyCalls = 0;
  const runtime = createCandidateDependencyGateTestRuntime({
    runNpm() { legacyCalls += 1; return { status: 0 }; },
    runTar() { legacyCalls += 1; return { status: 0 }; },
    runSmoke() { legacyCalls += 1; return { status: 0 }; }
  });
  await assert.rejects(materializeCandidateDependencies({ candidateRelease: "candidate-release", expectedCurrentRelease: "active-release", apply: true, runtime }), condition("invalid_input"));
  await assert.rejects(verifyCandidateDependencies({ runtime }), condition("invalid_input"));
  assert.equal(legacyCalls, 0);
});

test("materialize CLI requires the CI artifact identity before any dependency operation", async () => {
  let stdout = "", stderr = "";
  const code = await runCandidateDependencyGateCli({
    argv: ["--mode", "materialize", "--candidate-release", "candidate-release", "--expected-current-release", "active-release", "--apply"],
    stdout: { write(value) { stdout += value; } },
    stderr: { write(value) { stderr += value; } }
  });
  assert.equal(code, 1);
  assert.equal(stdout, "");
  assert.deepEqual(JSON.parse(stderr), {
    schemaVersion: "1", type: CANDIDATE_DEPENDENCY_GATE_TYPE, mode: null, state: "blocked", condition: "invalid_input"
  });
});

test("production artifact materialization and verification remain inert pending storage and smoke isolation", async () => {
  let calls = 0;
  const productionLike = createCandidateDependencyGateTestRuntime({
    requireRoot: true,
    enforceOwnership: true,
    getuid: () => 0,
    verifyArtifact() { calls += 1; return null; },
    extractArtifact() { calls += 1; return null; },
    nativeSmoke() { calls += 1; return true; }
  });
  const request = {
    candidateRelease: "candidate-release",
    expectedCurrentRelease: "active-release",
    expectedSourceCommit: SOURCE_COMMIT,
    expectedArtifactRelease: ARTIFACT_RELEASE,
    expectedDependencyManifestSha256: "c".repeat(64),
    expectedDependencyArchiveSha256: "d".repeat(64),
    runtime: productionLike
  };
  assert.throws(() => preflightCandidateDependencies({ candidateRelease: request.candidateRelease, expectedCurrentRelease: request.expectedCurrentRelease, runtime: productionLike }), condition("worker_storage_limit_unavailable"));
  assert.throws(() => stageBuildWorkerInputs({ candidateRelease: request.candidateRelease, expectedCurrentRelease: request.expectedCurrentRelease, unit: "control-plane-candidate-dependency-build-test", runtime: productionLike }), condition("worker_storage_limit_unavailable"));
  assert.throws(() => invokeCandidateDependencyTransientUnit({ kind: "build", unit: "control-plane-candidate-dependency-build-test", input: [], runtime: productionLike }), condition("worker_storage_limit_unavailable"));
  assert.throws(() => seizeWorkerStateTopLevel({ kind: "build", unit: "control-plane-candidate-dependency-build-test", terminal: { succeeded: true, cleanupAllowed: true }, runtime: productionLike }), condition("worker_storage_limit_unavailable"));
  await assert.rejects(materializeCandidateDependencies({ ...request, apply: true }), condition("worker_storage_limit_unavailable"));
  await assert.rejects(verifyCandidateDependencies(request), condition("worker_storage_limit_unavailable"));
  assert.equal(calls, 0);
});

test("CI artifact materialization never removes a pre-existing lock", { skip: isWindows }, async (t) => {
  const value = fixture(t);
  const lockPath = join(value.runtime.lockRoot, "node-modules-materialization.lock");
  const original = Buffer.from("foreign lock\n");
  mkdirSync(value.runtime.lockRoot, { recursive: true });
  writeFileSync(lockPath, original, { mode: 0o600 });

  await assert.rejects(
    materializeCandidateDependencies({
      candidateRelease: value.candidate,
      expectedCurrentRelease: value.active,
      expectedSourceCommit: SOURCE_COMMIT,
      expectedArtifactRelease: ARTIFACT_RELEASE,
      expectedDependencyManifestSha256: "c".repeat(64),
      expectedDependencyArchiveSha256: "d".repeat(64),
      apply: true,
      runtime: value.runtime
    }),
    condition("lock_unavailable")
  );
  assert.deepEqual(readFileSync(lockPath), original);
});

test("CI artifact materialization binds the uploaded release label before verifier execution", { skip: isWindows }, async (t) => {
  const value = fixture(t);
  const labelPath = join(value.root, "dependency-artifacts", value.candidate, "release-label.txt");
  chmodSync(labelPath, 0o600);
  write(labelPath, "wrong-release\n", 0o400);
  let verifierCalls = 0;
  value.runtime.verifyArtifact = () => { verifierCalls += 1; return null; };

  await assert.rejects(
    materializeCandidateDependencies({
      candidateRelease: value.candidate,
      expectedCurrentRelease: value.active,
      expectedSourceCommit: SOURCE_COMMIT,
      expectedArtifactRelease: ARTIFACT_RELEASE,
      expectedDependencyManifestSha256: "c".repeat(64),
      expectedDependencyArchiveSha256: "d".repeat(64),
      apply: true,
      runtime: value.runtime
    }),
    condition("dependency_consumer_contract_invalid")
  );
  assert.equal(verifierCalls, 0);
});

test("CI artifact materialization uses only the verified artifact extraction and atomically publishes it", { skip: isWindows }, async (t) => {
  const value = fixture(t);
  const extractedSource = join(value.root, "ci-artifact-source");
  const extractedModules = join(extractedSource, "node_modules");
  mkdirSync(join(extractedModules, "better-sqlite3", "build", "Release"), { recursive: true, mode: 0o700 });
  write(join(extractedModules, "better-sqlite3", "index.js"), "module.exports = {};\n", 0o600);
  write(join(extractedModules, "better-sqlite3", "package.json"), '{"version":"12.10.0"}\n', 0o600);
  write(join(extractedModules, "better-sqlite3", "build", "Release", "better_sqlite3.node"), "native\n", 0o600);
  write(join(extractedSource, "scripts", "control-plane-db-snapshot-gate.mjs"), "export const safeImport = true;\n", 0o600);
  const artifactTree = auditDependencyTree(extractedModules, { checkAclCapabilities: () => true });

  let verifyCalls = 0;
  let extractCalls = 0;
  let renameCalls = 0;
  let legacyCalls = 0;
  let cleanupCalls = 0;
  let stagedRoot = null;
  const smokePrincipals = [];
  const service = { ...value.runtime.readService({ context: null }), uid: 4242, gid: 4243 };
  const originalRename = value.runtime.renameNoReplace;
  Object.assign(value.runtime, {
    runNpm() { legacyCalls += 1; return { status: 0 }; },
    runTar() { legacyCalls += 1; return { status: 0 }; },
    runServiceNativeSmoke({ root, service: smokeService, fixedNodePath }) {
      smokePrincipals.push({ root, uid: smokeService.uid, gid: smokeService.gid });
      return {
        serviceUid: smokeService.uid, serviceGid: smokeService.gid, fixedNodePath,
        noNetwork: true, capabilityBoundingSet: "", protectSystem: "strict", protectHome: true,
        privateDevices: true, noNewPrivileges: true, cgroupEmpty: true,
        terminalActiveState: "inactive", terminalSubState: "dead", terminalResult: "success",
        betterSqlite3Memory: true, snapshotImport: true
      };
    },
    readService: () => service,
    verifyArtifact({ expectedSourceCommit, expectedArtifactRelease }) {
      verifyCalls += 1;
      assert.equal(expectedSourceCommit, SOURCE_COMMIT);
      assert.equal(expectedArtifactRelease, ARTIFACT_RELEASE);
      return {
        state: "verified",
        sourceCommit: SOURCE_COMMIT,
        artifactRelease: ARTIFACT_RELEASE,
        manifestSha256: "c".repeat(64),
        manifestSizeBytes: 123,
        archive: { sha256: "d".repeat(64), sizeBytes: 456 },
        tree: artifactTree,
        smoke: { betterSqlite3Memory: true, snapshotImport: true }
      };
    },
    extractArtifact({ destinationRoot }) {
      extractCalls += 1;
      stagedRoot = destinationRoot;
      cpSync(extractedSource, destinationRoot, { recursive: true, dereference: false });
      mirrorFixtureModes(extractedSource, destinationRoot);
      assert.deepEqual(
        auditDependencyTree(join(destinationRoot, "node_modules"), { checkAclCapabilities: () => true }),
        artifactTree
      );
      return {
        root: destinationRoot,
        nodeModulesRoot: join(destinationRoot, "node_modules"),
        cleanup() {
          cleanupCalls += 1;
          rmSync(destinationRoot, { recursive: true, force: true });
        }
      };
    },
    renameNoReplace(request) {
      renameCalls += 1;
      return originalRename(request);
    }
  });

  const result = await materializeCandidateDependencies({
    candidateRelease: value.candidate,
    expectedCurrentRelease: value.active,
    expectedSourceCommit: SOURCE_COMMIT,
    expectedArtifactRelease: ARTIFACT_RELEASE,
    expectedDependencyManifestSha256: "c".repeat(64),
    expectedDependencyArchiveSha256: "d".repeat(64),
    apply: true,
    runtime: value.runtime
  });

  assert.equal(result.state, "materialized");
  assert.equal(verifyCalls, 1);
  assert.equal(extractCalls, 1);
  assert.equal(renameCalls, 1);
  assert.equal(legacyCalls, 0);
  assert.equal(cleanupCalls, 1);
  assert.deepEqual(smokePrincipals, [
    { root: stagedRoot, uid: service.uid, gid: service.gid },
    { root: value.candidateRoot, uid: service.uid, gid: service.gid }
  ]);
  assert.equal(existsSync(join(value.candidateRoot, "node_modules", "better-sqlite3", "index.js")), true);
  assert.equal(existsSync(join(value.root, "dependency-receipts", value.candidate, "node-modules-materialization.json")), true);

  value.runtime.extractArtifact = ({ destinationRoot }) => {
    cpSync(extractedSource, destinationRoot, { recursive: true, dereference: false });
    return {
      root: destinationRoot,
      nodeModulesRoot: join(destinationRoot, "node_modules"),
      cleanup() { throw new Error("forced extraction cleanup failure"); }
    };
  };
  await assert.rejects(
    verifyCandidateDependencies({
      candidateRelease: value.candidate,
      expectedCurrentRelease: value.active,
      expectedSourceCommit: SOURCE_COMMIT,
      expectedArtifactRelease: ARTIFACT_RELEASE,
      expectedDependencyManifestSha256: "c".repeat(64),
      expectedDependencyArchiveSha256: "d".repeat(64),
      runtime: value.runtime
    }),
    condition("postpublish_cleanup_failed")
  );
  assert.deepEqual(readdirSync(join(value.root, "dependency-staging")), []);
});

test("CI artifact materialization rejects an existing candidate tree before artifact or legacy work", { skip: isWindows }, async (t) => {
  const value = fixture(t);
  const target = join(value.candidateRoot, "node_modules");
  write(join(target, "foreign.js"), "foreign\n", 0o600);
  let artifactCalls = 0;
  let legacyCalls = 0;
  Object.assign(value.runtime, {
    verifyArtifact() { artifactCalls += 1; return null; },
    extractArtifact() { artifactCalls += 1; return null; },
    runNpm() { legacyCalls += 1; return { status: 0 }; },
    runTar() { legacyCalls += 1; return { status: 0 }; }
  });

  await assert.rejects(
    materializeCandidateDependencies({
      candidateRelease: value.candidate,
      expectedCurrentRelease: value.active,
      expectedSourceCommit: SOURCE_COMMIT,
      expectedArtifactRelease: ARTIFACT_RELEASE,
      expectedDependencyManifestSha256: "c".repeat(64),
      expectedDependencyArchiveSha256: "d".repeat(64),
      apply: true,
      runtime: value.runtime
    }),
    condition("candidate_node_modules_present")
  );
  assert.equal(artifactCalls, 0);
  assert.equal(legacyCalls, 0);
  assert.equal(readFileSync(join(target, "foreign.js"), "utf8"), "foreign\n");
});

test("CI artifact materialization rejects a dangling candidate node_modules link before artifact work", { skip: isWindows }, async (t) => {
  const value = fixture(t);
  const target = join(value.candidateRoot, "node_modules");
  symlinkSync("missing-node-modules", target, "dir");
  let artifactCalls = 0;
  Object.assign(value.runtime, {
    verifyArtifact() { artifactCalls += 1; return null; },
    extractArtifact() { artifactCalls += 1; return null; }
  });

  await assert.rejects(
    materializeCandidateDependencies({
      candidateRelease: value.candidate,
      expectedCurrentRelease: value.active,
      expectedSourceCommit: SOURCE_COMMIT,
      expectedArtifactRelease: ARTIFACT_RELEASE,
      expectedDependencyManifestSha256: "c".repeat(64),
      expectedDependencyArchiveSha256: "d".repeat(64),
      apply: true,
      runtime: value.runtime
    }),
    condition("candidate_node_modules_present")
  );
  assert.equal(artifactCalls, 0);
  assert.equal(lstatSync(target).isSymbolicLink(), true);
});

test("Linux materialization consumes a real three-file CI artifact and cleans its staging tree", { skip: process.platform !== "linux" }, async (t) => {
  const controlledRoot = mkdtempSync(join(process.cwd(), ".control-plane-materializer-e2e-"));
  const value = fixture(t, { root: controlledRoot });
  const artifactRoot = join(value.root, "dependency-artifacts", value.candidate);
  const sourceRoot = join(value.root, "real-artifact-source");
  const sourceModules = join(sourceRoot, "node_modules");
  const archivePath = join(artifactRoot, "node-modules.tar");
  const runtimeTuple = {
    platform: "linux", arch: "x64", libc: "glibc-2.39", nodeVersion: "v22.23.1", nodeAbi: "127", npmVersion: "v10.9.8", betterSqlite3Version: "12.10.0"
  };
  write(join(sourceModules, "better-sqlite3", "index.js"), "module.exports = {};\n", 0o644);
  write(join(sourceModules, "better-sqlite3", "package.json"), '{"version":"12.10.0"}\n', 0o644);
  write(join(sourceModules, "better-sqlite3", "build", "Release", "better_sqlite3.node"), "fixture native\n", 0o644);
  chmodSync(archivePath, 0o600);
  const tar = spawnSync("/usr/bin/tar", ["--create", "--file", archivePath, "--format=posix", "--sort=name", "--mtime=UTC 1970-01-01", "--owner=0", "--group=0", "--numeric-owner", "--hard-dereference", "--", "node_modules"], { cwd: sourceRoot, encoding: "utf8" });
  assert.equal(tar.status, 0, String(tar.stderr || ""));
  chmodSync(archivePath, 0o400);
  const producerExtractionRoot = join(value.root, "producer-extracted");
  const snapshotSource = join(value.candidateRoot, "scripts", "control-plane-db-snapshot-gate.mjs");
  const manifest = buildDependencyArtifactManifest({
    sourceCommit: SOURCE_COMMIT,
    artifactRelease: ARTIFACT_RELEASE,
    packageJsonBytes: value.packageBytes,
    packageLockBytes: value.lockBytes,
    archivePath,
    root: value.candidateRoot,
    runtime: {
      enforceOwnership: false,
      checkAclCapabilities: () => true,
      detect: () => runtimeTuple,
      extractArchive(archive) {
        const extracted = extractDependencyArchive(archive, {
          destinationRoot: producerExtractionRoot,
          enforceOwnership: false,
          checkAclCapabilities: () => true
        });
        const target = join(extracted.root, "scripts", "control-plane-db-snapshot-gate.mjs");
        mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
        writeFileSync(target, readFileSync(snapshotSource), { mode: 0o400 });
        chmodSync(target, 0o400);
        return extracted;
      },
      nativeSmoke: () => true
    }
  });
  chmodSync(join(artifactRoot, "dependency-artifact.json"), 0o600);
  chmodSync(join(artifactRoot, "release-label.txt"), 0o600);
  write(join(artifactRoot, "dependency-artifact.json"), manifest.bytes, 0o400);
  write(join(artifactRoot, "release-label.txt"), `${ARTIFACT_RELEASE}\n`, 0o400);
  const smokeRoots = [];
  Object.assign(value.runtime, {
    detectArtifact: () => runtimeTuple,
    runServiceNativeSmoke({ root, service, fixedNodePath }) {
      smokeRoots.push({ root, uid: service.uid, gid: service.gid });
      return {
        serviceUid: service.uid, serviceGid: service.gid, fixedNodePath,
        noNetwork: true, capabilityBoundingSet: "", protectSystem: "strict", protectHome: true,
        privateDevices: true, noNewPrivileges: true, cgroupEmpty: true,
        terminalActiveState: "inactive", terminalSubState: "dead", terminalResult: "success",
        betterSqlite3Memory: true, snapshotImport: true
      };
    }
  });

  const result = await materializeCandidateDependencies({
    candidateRelease: value.candidate,
    expectedCurrentRelease: value.active,
    expectedSourceCommit: SOURCE_COMMIT,
    expectedArtifactRelease: ARTIFACT_RELEASE,
    expectedDependencyManifestSha256: manifest.sha256,
    expectedDependencyArchiveSha256: manifest.value.archive.sha256,
    apply: true,
    runtime: value.runtime
  });

  assert.equal(result.state, "materialized");
  assert.equal(existsSync(join(value.candidateRoot, "node_modules", "better-sqlite3", "index.js")), true);
  const receiptPath = join(value.root, "dependency-receipts", value.candidate, "node-modules-materialization.json");
  assert.equal(existsSync(receiptPath), true);
  const materializationReceipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  assert.equal(materializationReceipt.schemaVersion, "2");
  assert.equal(materializationReceipt.materializerSchemaVersion, 2);
  assert.equal(materializationReceipt.storageProjectId, 4242);
  assert.match(materializationReceipt.storageQuotaEvidenceSha256, /^[a-f0-9]{64}$/);
  assert.match(materializationReceipt.serviceSmokeEvidenceSha256, /^[a-f0-9]{64}$/);
  assert.equal(materializationReceipt.safetyEvidenceCapturedAt, "2026-08-16T00:00:00.000Z");
  assert.deepEqual(readdirSync(join(value.root, "dependency-staging")), []);
  assert.equal(smokeRoots.length, 2);
  assert.notEqual(smokeRoots[0].root, value.candidateRoot);
  assert.equal(smokeRoots[1].root, value.candidateRoot);

  writeFileSync(receiptPath, `${JSON.stringify({ ...materializationReceipt, schemaVersion: "1" }, null, 2)}\n`);
  await assert.rejects(verifyCandidateDependencies({
    candidateRelease: value.candidate,
    expectedCurrentRelease: value.active,
    expectedSourceCommit: SOURCE_COMMIT,
    expectedArtifactRelease: ARTIFACT_RELEASE,
    expectedDependencyManifestSha256: manifest.sha256,
    expectedDependencyArchiveSha256: manifest.value.archive.sha256,
    runtime: value.runtime
  }), condition("dependency_receipt_mismatch"));
  assert.deepEqual(readdirSync(join(value.root, "dependency-staging")), []);
});
