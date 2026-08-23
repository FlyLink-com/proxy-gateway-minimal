import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
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
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createReleaseConfigGateTestRuntime,
  prepareReleaseConfigOverlay,
  runReleaseConfigGateCli,
  verifyReleaseConfigOverlay
} from "../../scripts/control-plane-release-config-gate.mjs";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT_PATH = resolve(REPOSITORY_ROOT, "scripts/control-plane-release-config-gate.mjs");
const RELATIVE_CONFIG = "config/proxy-servers.json";
const PROTECTED_RELATIVE_PATHS = [RELATIVE_CONFIG, ".env"];

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "gccgw-release-config-gate-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const activeRelease = join(root, "release-active");
  const candidateRelease = join(root, "release-candidate");
  const activeConfig = join(activeRelease, "config", "proxy-servers.json");
  const candidateConfig = join(candidateRelease, "config", "proxy-servers.json");
  const activeEnv = join(activeRelease, ".env");
  const candidateEnv = join(candidateRelease, ".env");
  const manifestPath = join(root, "protected", "release-assembly.json");

  mkdirSync(dirname(activeConfig), { recursive: true });
  mkdirSync(dirname(candidateConfig), { recursive: true });
  writeFileSync(activeConfig, "protected-production-config\n", { mode: 0o640 });
  writeFileSync(activeEnv, "protected-production-environment\n", { mode: 0o600 });
  chmodSync(activeConfig, 0o640);
  chmodSync(activeEnv, 0o600);

  return {
    root,
    activeRelease,
    candidateRelease,
    activeConfig,
    candidateConfig,
    activeEnv,
    candidateEnv,
    manifestPath
  };
}

function runCli(args) {
  let stdout = "";
  let stderr = "";
  const status = runReleaseConfigGateCli({
    argv: args,
    runtime: createReleaseConfigGateTestRuntime(),
    stdout: { write: (value) => { stdout += value; } },
    stderr: { write: (value) => { stderr += value; } }
  });
  return { status, stdout, stderr };
}

function runProductionCli(args) {
  return spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8"
  });
}

function baseArgs(paths, mode) {
  return [
    "--mode", mode,
    "--active-release", paths.activeRelease,
    "--candidate-release", paths.candidateRelease,
    "--relative-config", RELATIVE_CONFIG,
    "--manifest", paths.manifestPath
  ];
}

function applyOverlay(paths) {
  return runCli([
    ...baseArgs(paths, "prepare"),
    "--apply",
    "--created-at", "2026-07-11T10:00:00Z"
  ]);
}

function directApplyOptions(paths, runtime) {
  return {
    activeReleasePath: paths.activeRelease,
    candidateReleasePath: paths.candidateRelease,
    relativeConfigPath: RELATIVE_CONFIG,
    manifestPath: paths.manifestPath,
    apply: true,
    createdAt: "2026-07-11T10:00:00Z",
    runtime
  };
}

function condition(expected) {
  return (error) => error?.condition === expected;
}

function nativeDirectorySync(path) {
  if (process.platform === "win32") return;
  const descriptor = openSync(path, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function productionFixture(t) {
  const temporary = mkdtempSync(join(tmpdir(), "gccgw-release-config-production-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const deploymentRoot = join(temporary, "deployment-root");
  const releases = join(deploymentRoot, "releases");
  const activeRelease = join(releases, "release-active");
  const candidateRelease = join(releases, "release-candidate");
  const current = join(deploymentRoot, "current");
  const activeConfig = join(activeRelease, "config", "proxy-servers.json");
  const candidateConfig = join(candidateRelease, "config", "proxy-servers.json");
  const activeEnv = join(activeRelease, ".env");
  const candidateEnv = join(candidateRelease, ".env");
  const assemblyRoot = join(deploymentRoot, "assembly-receipts");
  const candidateAssembly = join(assemblyRoot, "release-candidate");
  const manifestPath = join(candidateAssembly, "release-assembly.json");
  mkdirSync(dirname(activeConfig), { recursive: true, mode: 0o755 });
  mkdirSync(dirname(candidateConfig), { recursive: true, mode: 0o755 });
  mkdirSync(candidateAssembly, { recursive: true, mode: 0o700 });
  for (const [path, mode] of [
    [deploymentRoot, 0o755],
    [releases, 0o755],
    [activeRelease, 0o755],
    [candidateRelease, 0o755],
    [dirname(activeConfig), 0o755],
    [dirname(candidateConfig), 0o755],
    [assemblyRoot, 0o700],
    [candidateAssembly, 0o700]
  ]) chmodSync(path, mode);
  writeFileSync(activeConfig, "protected-production-config\n", { mode: 0o640 });
  writeFileSync(activeEnv, "protected-production-environment\n", { mode: 0o600 });
  chmodSync(activeConfig, 0o640);
  chmodSync(activeEnv, 0o600);
  try {
    symlinkSync(activeRelease, current, process.platform === "win32" ? "junction" : "dir");
  } catch {
    return null;
  }
  return {
    temporary,
    deploymentRoot,
    releases,
    activeRelease,
    candidateRelease,
    current,
    activeConfig,
    candidateConfig,
    activeEnv,
    candidateEnv,
    assemblyRoot,
    candidateAssembly,
    manifestPath
  };
}

function productionLikeRuntime(paths, {
  modeOverrides = new Map(),
  ownerOverrides = new Map(),
  modeHook = () => {}
} = {}) {
  const expectedModes = new Map([
    [resolve(paths.deploymentRoot), 0o755],
    [resolve(paths.releases), 0o755],
    [resolve(paths.activeRelease), 0o755],
    [resolve(paths.candidateRelease), 0o755],
    [resolve(dirname(paths.activeConfig)), 0o755],
    [resolve(dirname(paths.candidateConfig)), 0o755],
    [resolve(paths.activeConfig), 0o640],
    [resolve(paths.candidateConfig), 0o640],
    [resolve(paths.activeEnv), 0o600],
    [resolve(paths.candidateEnv), 0o600],
    [resolve(paths.assemblyRoot), 0o700],
    [resolve(paths.candidateAssembly), 0o700]
  ]);
  return createReleaseConfigGateTestRuntime({
    root: paths.deploymentRoot,
    enforceProductionTopology: true,
    enforceModes: true,
    enforceOwnership: true,
    modeFor(path, metadata) {
      modeHook(resolve(path));
      return modeOverrides.get(resolve(path))
        ?? expectedModes.get(resolve(path))
        ?? (metadata.mode & 0o7777);
    },
    ownerFor(path, metadata) {
      return ownerOverrides.get(resolve(path)) ?? { uid: 0, gid: 0 };
    }
  });
}

test("production topology accepts the exact current pointer and fixed assembly receipt path", (t) => {
  const paths = productionFixture(t);
  if (!paths) {
    t.skip("directory symlink creation is unavailable");
    return;
  }

  const result = prepareReleaseConfigOverlay({
    activeReleasePath: paths.current,
    candidateReleasePath: paths.candidateRelease,
    manifestPath: paths.manifestPath,
    runtime: productionLikeRuntime(paths)
  });

  assert.equal(result.state, "ready");
  assert.equal(result.activeRelease, "release-active");
  assert.equal(result.candidateRelease, "release-candidate");
  assert.equal(existsSync(paths.candidateConfig), false);
  assert.equal(existsSync(paths.candidateEnv), false);
  assert.equal(existsSync(paths.manifestPath), false);
});

test("production topology accepts the protected service group without forcing gid zero", (t) => {
  const paths = productionFixture(t);
  if (!paths) {
    t.skip("directory symlink creation is unavailable");
    return;
  }
  const ownerOverrides = new Map([
    [resolve(paths.activeConfig), { uid: 0, gid: 988 }],
    [resolve(paths.activeEnv), { uid: 0, gid: 988 }]
  ]);

  const result = prepareReleaseConfigOverlay({
    activeReleasePath: paths.current,
    candidateReleasePath: paths.candidateRelease,
    manifestPath: paths.manifestPath,
    runtime: productionLikeRuntime(paths, { ownerOverrides })
  });

  assert.equal(result.state, "ready");
  assert.equal(existsSync(paths.candidateConfig), false);
  assert.equal(existsSync(paths.candidateEnv), false);
  assert.equal(existsSync(paths.manifestPath), false);
});

test("production topology rejects active protected-file policy drift before overlay writes", async (t) => {
  for (const { name, modeOverrides = new Map(), ownerOverrides = new Map() } of [
    {
      name: "config mode is 0644",
      modeOverrides: new Map([["activeConfig", 0o644]])
    },
    {
      name: "environment mode is 0640",
      modeOverrides: new Map([["activeEnv", 0o640]])
    },
    {
      name: "config owner is not root",
      ownerOverrides: new Map([["activeConfig", { uid: 1000, gid: 988 }]])
    },
    {
      name: "environment owner is not root",
      ownerOverrides: new Map([["activeEnv", { uid: 1000, gid: 988 }]])
    }
  ]) {
    await t.test(name, (t) => {
      const paths = productionFixture(t);
      if (!paths) {
        t.skip("directory symlink creation is unavailable");
        return;
      }
      const resolvedModes = new Map(
        [...modeOverrides].map(([key, value]) => [resolve(paths[key]), value])
      );
      const resolvedOwners = new Map(
        [...ownerOverrides].map(([key, value]) => [resolve(paths[key]), value])
      );

      assert.throws(
        () => prepareReleaseConfigOverlay({
          activeReleasePath: paths.current,
          candidateReleasePath: paths.candidateRelease,
          manifestPath: paths.manifestPath,
          apply: true,
          createdAt: "2026-07-11T10:00:00Z",
          runtime: productionLikeRuntime(paths, {
            modeOverrides: resolvedModes,
            ownerOverrides: resolvedOwners
          })
        }),
        condition("config_boundary_invalid")
      );
      assert.equal(existsSync(paths.candidateConfig), false);
      assert.equal(existsSync(paths.candidateEnv), false);
      assert.equal(existsSync(paths.manifestPath), false);
    });
  }
});

test("production verify rejects candidate protected-file policy drift", async (t) => {
  for (const { name, modeOverrides = new Map(), ownerOverrides = new Map() } of [
    {
      name: "config mode is 0644",
      modeOverrides: new Map([["candidateConfig", 0o644]])
    },
    {
      name: "environment mode is 0640",
      modeOverrides: new Map([["candidateEnv", 0o640]])
    },
    {
      name: "config owner is not root",
      ownerOverrides: new Map([["candidateConfig", { uid: 1000, gid: 988 }]])
    },
    {
      name: "environment owner is not root",
      ownerOverrides: new Map([["candidateEnv", { uid: 1000, gid: 988 }]])
    },
    {
      name: "config group differs from the active service group",
      ownerOverrides: new Map([
        ["activeConfig", { uid: 0, gid: 988 }],
        ["candidateConfig", { uid: 0, gid: 989 }]
      ])
    }
  ]) {
    await t.test(name, (t) => {
      const paths = productionFixture(t);
      if (!paths) {
        t.skip("directory symlink creation is unavailable");
        return;
      }
      prepareReleaseConfigOverlay({
        activeReleasePath: paths.current,
        candidateReleasePath: paths.candidateRelease,
        manifestPath: paths.manifestPath,
        apply: true,
        createdAt: "2026-07-11T10:00:00Z",
        runtime: createReleaseConfigGateTestRuntime()
      });
      const resolvedModes = new Map(
        [...modeOverrides].map(([key, value]) => [resolve(paths[key]), value])
      );
      const resolvedOwners = new Map(
        [...ownerOverrides].map(([key, value]) => [resolve(paths[key]), value])
      );

      assert.throws(
        () => verifyReleaseConfigOverlay({
          activeReleasePath: paths.current,
          candidateReleasePath: paths.candidateRelease,
          manifestPath: paths.manifestPath,
          runtime: productionLikeRuntime(paths, {
            modeOverrides: resolvedModes,
            ownerOverrides: resolvedOwners
          })
        }),
        condition("config_boundary_invalid")
      );
    });
  }
});

test("production topology fails closed when current changes after its initial CAS snapshot", (t) => {
  const paths = productionFixture(t);
  if (!paths) {
    t.skip("directory symlink creation is unavailable");
    return;
  }
  const replacement = join(paths.releases, "release-replacement");
  mkdirSync(replacement, { mode: 0o755 });
  chmodSync(replacement, 0o755);
  let switched = false;
  const runtime = productionLikeRuntime(paths, {
    modeHook(path) {
      if (!switched && path === resolve(paths.candidateAssembly)) {
        switched = true;
        rmSync(paths.current);
        symlinkSync(replacement, paths.current, process.platform === "win32" ? "junction" : "dir");
      }
    }
  });

  assert.throws(
    () => prepareReleaseConfigOverlay({
      activeReleasePath: paths.current,
      candidateReleasePath: paths.candidateRelease,
      manifestPath: paths.manifestPath,
      runtime
    }),
    condition("release_boundary_invalid")
  );
  assert.equal(switched, true);
  assert.equal(existsSync(paths.candidateConfig), false);
  assert.equal(existsSync(paths.candidateEnv), false);
  assert.equal(existsSync(paths.manifestPath), false);
});

test("prepare dry-run accepts a source-only candidate without writing protected files or a manifest", (t) => {
  const paths = fixture(t);

  const result = runCli([
    ...baseArgs(paths, "prepare"),
    "--created-at", "2026-07-11T10:00:00Z"
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), {
    schemaVersion: "1",
    type: "control_plane_release_config_gate",
    state: "ready",
    applied: false,
    releaseUnit: "control-plane-app",
    activeRelease: "release-active",
    candidateRelease: "release-candidate",
    relativeConfig: RELATIVE_CONFIG,
    protectedRelativePaths: PROTECTED_RELATIVE_PATHS,
    candidateMatches: false,
    candidateFilesPresent: false
  });
  assert.equal(existsSync(paths.candidateConfig), false);
  assert.equal(existsSync(paths.candidateEnv), false);
  assert.equal(existsSync(paths.manifestPath), false);
  assert.equal(result.stdout.includes(paths.root), false);
  assert.doesNotMatch(result.stdout, /protected-production-config|protected-production-environment/);
});

test("prepare apply atomically creates both protected overlays and emits a portable manifest", (t) => {
  const paths = fixture(t);
  const activeIdentities = PROTECTED_RELATIVE_PATHS.map((relativePath) => {
    const path = relativePath === RELATIVE_CONFIG ? paths.activeConfig : paths.activeEnv;
    const sourceBytes = readFileSync(path);
    return {
      relativePath,
      sourceBytes,
      sha256: createHash("sha256").update(sourceBytes).digest("hex"),
      sizeBytes: sourceBytes.length,
      mode: (statSync(path).mode & 0o777).toString(8).padStart(4, "0")
    };
  });

  const result = applyOverlay(paths);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), {
    schemaVersion: "1",
    type: "control_plane_release_config_gate",
    state: "prepared",
    applied: true,
    releaseUnit: "control-plane-app",
    activeRelease: "release-active",
    candidateRelease: "release-candidate",
    relativeConfig: RELATIVE_CONFIG,
    protectedRelativePaths: PROTECTED_RELATIVE_PATHS,
    candidateMatches: true,
    candidateFilesPresent: true
  });
  assert.deepEqual(readFileSync(paths.candidateConfig), activeIdentities[0].sourceBytes);
  assert.deepEqual(readFileSync(paths.candidateEnv), activeIdentities[1].sourceBytes);

  const manifestRaw = readFileSync(paths.manifestPath, "utf8");
  assert.deepEqual(JSON.parse(manifestRaw), {
    schemaVersion: "1",
    type: "control_plane_release_assembly",
    releaseUnit: "control-plane-app",
    activeRelease: "release-active",
    candidateRelease: "release-candidate",
    createdAt: "2026-07-11T10:00:00.000Z",
    protectedOverlays: activeIdentities.map(({ relativePath, sha256, sizeBytes, mode }) => ({
      relativePath,
      sha256,
      sizeBytes,
      mode
    }))
  });
  assert.equal(manifestRaw.includes(paths.root), false);
  assert.doesNotMatch(manifestRaw, /protected-production-config|protected-production-environment/);
  assert.equal(result.stdout.includes(activeIdentities[0].sha256), false);
  assert.equal(result.stdout.includes(activeIdentities[1].sha256), false);
  assert.equal(result.stdout.includes(paths.root), false);

  if (process.platform !== "win32") {
    assert.equal(statSync(paths.candidateConfig).mode & 0o777, 0o640);
    assert.equal(statSync(paths.candidateEnv).mode & 0o777, 0o600);
    assert.equal(statSync(paths.manifestPath).mode & 0o777, 0o600);
  }
});

test("default CLI and production topology reject unbounded roots before protected overlay writes", async (t) => {
  await t.test("default CLI rejects the arbitrary temporary fixture", (t) => {
    const paths = fixture(t);
    const result = runProductionCli(baseArgs(paths, "prepare"));
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stderr).condition, "release_boundary_invalid");
    assert.equal(existsSync(paths.candidateConfig), false);
    assert.equal(existsSync(paths.candidateEnv), false);
    assert.equal(existsSync(paths.manifestPath), false);
  });

  for (const name of [
    "active is not the current pointer",
    "candidate has a different releases parent",
    "manifest is not the fixed candidate assembly receipt",
    "releases parent is world writable",
    "candidate is not root controlled"
  ]) {
    await t.test(name, (t) => {
      const paths = productionFixture(t);
      if (!paths) {
        t.skip("directory symlink creation is unavailable");
        return;
      }
      const modeOverrides = new Map();
      const ownerOverrides = new Map();
      let activeReleasePath = paths.current;
      let candidateReleasePath = paths.candidateRelease;
      let outputManifestPath = paths.manifestPath;
      let expected = "release_boundary_invalid";
      if (name === "active is not the current pointer") activeReleasePath = paths.activeRelease;
      if (name === "candidate has a different releases parent") {
        candidateReleasePath = join(paths.temporary, "other", "release-candidate");
        mkdirSync(join(candidateReleasePath, "config"), { recursive: true });
      }
      if (name === "manifest is not the fixed candidate assembly receipt") {
        outputManifestPath = join(paths.deploymentRoot, "other", "release-assembly.json");
        mkdirSync(dirname(outputManifestPath), { recursive: true });
        expected = "manifest_boundary_invalid";
      }
      if (name === "releases parent is world writable") modeOverrides.set(resolve(paths.releases), 0o777);
      if (name === "candidate is not root controlled") ownerOverrides.set(resolve(paths.candidateRelease), { uid: 1000, gid: 1000 });
      const runtime = productionLikeRuntime(paths, { modeOverrides, ownerOverrides });

      assert.throws(
        () => prepareReleaseConfigOverlay({
          activeReleasePath,
          candidateReleasePath,
          manifestPath: outputManifestPath,
          runtime
        }),
        condition(expected)
      );
      assert.equal(existsSync(paths.candidateConfig), false);
      assert.equal(existsSync(paths.candidateEnv), false);
      assert.equal(existsSync(paths.manifestPath), false);
    });
  }
});

test("prepare apply fsyncs final file metadata and both link publication directory mutations", (t) => {
  const paths = fixture(t);
  const events = [];
  const runtime = createReleaseConfigGateTestRuntime({
    applyOwnership: true,
    chownFile: () => {},
    observe: (event) => events.push(event)
  });

  const result = prepareReleaseConfigOverlay(directApplyOptions(paths, runtime));

  assert.equal(result.state, "prepared");
  const configTemporary = events.find((event) => (
    event.type === "file_data_fsync"
    && event.path.includes(".proxy-servers.json.overlay.")
  ))?.path;
  assert.ok(configTemporary);
  assert.deepEqual(
    events
      .filter((event) => event.path === configTemporary)
      .map((event) => event.type),
    ["file_data_fsync", "chown", "chmod", "file_final_fsync", "link", "unlink"]
  );

  const linkIndex = events.findIndex((event) => (
    event.type === "link" && event.destination === paths.candidateConfig
  ));
  assert.ok(linkIndex >= 0);
  assert.deepEqual(
    events.slice(linkIndex, linkIndex + 4).map((event) => [event.type, event.path]),
    [
      ["link", configTemporary],
      ["directory_fsync", dirname(paths.candidateConfig)],
      ["unlink", configTemporary],
      ["directory_fsync", dirname(configTemporary)]
    ]
  );

  const manifestParent = dirname(paths.manifestPath);
  const mkdirIndex = events.findIndex((event) => event.type === "mkdir" && event.path === manifestParent);
  assert.ok(mkdirIndex >= 0);
  assert.ok(events.slice(mkdirIndex + 1).some((event) => (
    event.type === "directory_fsync" && event.path === manifestParent
  )));
  assert.ok(events.slice(mkdirIndex + 1).some((event) => (
    event.type === "directory_fsync" && event.path === dirname(manifestParent)
  )));
});

test("prepare apply fails closed and durably removes a temporary file when final inode fsync fails", (t) => {
  const paths = fixture(t);
  const events = [];
  let failed = false;
  const runtime = createReleaseConfigGateTestRuntime({
    observe: (event) => events.push(event),
    fsyncFile(descriptor, { phase, path }) {
      if (!failed && phase === "final" && path.includes(".proxy-servers.json.overlay.")) {
        failed = true;
        throw new Error("injected final inode fsync failure");
      }
      fsyncSync(descriptor);
    }
  });

  assert.throws(
    () => prepareReleaseConfigOverlay(directApplyOptions(paths, runtime)),
    condition("release_config_prepare_failed")
  );
  assert.equal(failed, true);
  assert.equal(existsSync(paths.candidateConfig), false);
  assert.equal(existsSync(paths.candidateEnv), false);
  assert.equal(existsSync(paths.manifestPath), false);
  assert.deepEqual(readdirSync(dirname(paths.candidateConfig)), []);
  const cleanupIndex = events.findIndex((event) => (
    event.type === "cleanup_unlink" && event.path.includes(".proxy-servers.json.overlay.")
  ));
  assert.ok(cleanupIndex >= 0);
  assert.deepEqual(
    events.slice(cleanupIndex, cleanupIndex + 2).map((event) => event.type),
    ["cleanup_unlink", "directory_fsync"]
  );
});

test("final fsync failure never removes a replacement that is not the opened attempt inode", (t) => {
  const paths = fixture(t);
  const replacement = Buffer.from("preserve-non-attempt-replacement\n");
  let temporary;
  let ownedOriginal;
  const runtime = createReleaseConfigGateTestRuntime({
    fsyncFile(descriptor, { phase, path }) {
      if (!temporary && phase === "final" && path.includes(".proxy-servers.json.overlay.")) {
        temporary = path;
        ownedOriginal = `${path}.owned-original`;
        renameSync(path, ownedOriginal);
        writeFileSync(path, replacement);
        throw new Error("injected replacement before final fsync failure");
      }
      fsyncSync(descriptor);
    }
  });

  assert.throws(
    () => prepareReleaseConfigOverlay(directApplyOptions(paths, runtime)),
    condition("release_config_prepare_failed")
  );
  assert.ok(temporary);
  assert.deepEqual(readFileSync(temporary), replacement);
  assert.equal(existsSync(ownedOriginal), true);
  assert.equal(existsSync(paths.candidateConfig), false);
  assert.equal(existsSync(paths.candidateEnv), false);
  assert.equal(existsSync(paths.manifestPath), false);
});

test("prepare apply rolls back and fsyncs both parents when publication directory fsync fails", (t) => {
  const paths = fixture(t);
  const events = [];
  let configLinked = false;
  let failed = false;
  const runtime = createReleaseConfigGateTestRuntime({
    observe(event) {
      events.push(event);
      if (event.type === "link" && event.destination === paths.candidateConfig) configLinked = true;
    },
    fsyncDirectory(path) {
      if (configLinked && !failed && path === dirname(paths.candidateConfig)) {
        failed = true;
        throw new Error("injected publication directory fsync failure");
      }
      nativeDirectorySync(path);
    }
  });

  assert.throws(
    () => prepareReleaseConfigOverlay(directApplyOptions(paths, runtime)),
    condition("release_config_prepare_failed")
  );
  assert.equal(failed, true);
  assert.equal(existsSync(paths.candidateConfig), false);
  assert.equal(existsSync(paths.candidateEnv), false);
  assert.equal(existsSync(paths.manifestPath), false);
  const cleanupIndex = events.findIndex((event) => (
    event.type === "cleanup_unlink" && event.path === paths.candidateConfig
  ));
  assert.ok(cleanupIndex >= 0);
  assert.deepEqual(
    events.slice(cleanupIndex, cleanupIndex + 2).map((event) => event.type),
    ["cleanup_unlink", "directory_fsync"]
  );
});

test("prepare rejects an ordinary caller supplied runtime before creating overlays", (t) => {
  const paths = fixture(t);

  assert.throws(
    () => prepareReleaseConfigOverlay(directApplyOptions(paths, {})),
    condition("invalid_input")
  );
  assert.equal(existsSync(paths.candidateConfig), false);
  assert.equal(existsSync(paths.candidateEnv), false);
  assert.equal(existsSync(paths.manifestPath), false);
});

test("verify accepts the prepared assembly without writing files", (t) => {
  const paths = fixture(t);
  const prepared = applyOverlay(paths);
  assert.equal(prepared.status, 0, prepared.stderr);
  const configBefore = readFileSync(paths.candidateConfig);
  const envBefore = readFileSync(paths.candidateEnv);
  const manifestBefore = readFileSync(paths.manifestPath);
  const configMtimeBefore = statSync(paths.candidateConfig).mtimeMs;
  const envMtimeBefore = statSync(paths.candidateEnv).mtimeMs;
  const manifestMtimeBefore = statSync(paths.manifestPath).mtimeMs;

  const result = runCli(baseArgs(paths, "verify"));

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), {
    schemaVersion: "1",
    type: "control_plane_release_config_gate",
    state: "verified",
    applied: false,
    releaseUnit: "control-plane-app",
    activeRelease: "release-active",
    candidateRelease: "release-candidate",
    relativeConfig: RELATIVE_CONFIG,
    protectedRelativePaths: PROTECTED_RELATIVE_PATHS,
    candidateMatches: true,
    candidateFilesPresent: true
  });
  assert.deepEqual(readFileSync(paths.candidateConfig), configBefore);
  assert.deepEqual(readFileSync(paths.candidateEnv), envBefore);
  assert.deepEqual(readFileSync(paths.manifestPath), manifestBefore);
  assert.equal(statSync(paths.candidateConfig).mtimeMs, configMtimeBefore);
  assert.equal(statSync(paths.candidateEnv).mtimeMs, envMtimeBefore);
  assert.equal(statSync(paths.manifestPath).mtimeMs, manifestMtimeBefore);
});

test("verify blocks candidate drift without echoing paths or config", (t) => {
  const paths = fixture(t);
  const prepared = applyOverlay(paths);
  assert.equal(prepared.status, 0, prepared.stderr);
  writeFileSync(paths.candidateConfig, "drifted-sensitive-config\n");

  const result = runCli(baseArgs(paths, "verify"));

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.deepEqual(JSON.parse(result.stderr), {
    schemaVersion: "1",
    type: "control_plane_release_config_gate",
    state: "blocked",
    condition: "config_identity_mismatch"
  });
  assert.equal(result.stderr.includes(paths.root), false);
  assert.doesNotMatch(result.stderr, /drifted-sensitive-config|protected-production-config/);
  assert.equal(readFileSync(paths.candidateConfig, "utf8"), "drifted-sensitive-config\n");
});

test("gate rejects unsafe release and relative-path boundaries", (t) => {
  const paths = fixture(t);
  const cases = [
    [
      "same release",
      [
        "--mode", "prepare",
        "--active-release", paths.activeRelease,
        "--candidate-release", paths.activeRelease,
        "--relative-config", RELATIVE_CONFIG,
        "--manifest", paths.manifestPath,
        "--apply"
      ],
      "release_boundary_invalid"
    ],
    [
      "traversal",
      [
        ...baseArgs(paths, "prepare"),
        "--relative-config", "../proxy-servers.json",
        "--apply"
      ],
      "relative_config_invalid"
    ],
    [
      "absolute config",
      [
        ...baseArgs(paths, "prepare"),
        "--relative-config", resolve(paths.root, "proxy-servers.json"),
        "--apply"
      ],
      "relative_config_invalid"
    ],
    [
      "non-fixed protected path",
      [
        ...baseArgs(paths, "prepare"),
        "--relative-config", ".env",
        "--apply"
      ],
      "relative_config_invalid"
    ]
  ];

  for (const [name, args, condition] of cases) {
    const result = runCli(args);
    assert.equal(result.status, 1, name);
    assert.equal(result.stdout, "", name);
    assert.equal(JSON.parse(result.stderr).condition, condition, name);
    assert.equal(result.stderr.includes(paths.root), false, name);
  }

  for (const [name, releaseKey] of [
    ["manifest inside active release", "activeRelease"],
    ["manifest inside candidate release", "candidateRelease"]
  ]) {
    const boundaryPaths = fixture(t);
    boundaryPaths.manifestPath = join(
      boundaryPaths[releaseKey],
      "protected",
      "release-assembly.json"
    );

    const result = applyOverlay(boundaryPaths);

    assert.equal(result.status, 1, name);
    assert.equal(result.stdout, "", name);
    assert.equal(JSON.parse(result.stderr).condition, "manifest_boundary_invalid", name);
    assert.equal(existsSync(boundaryPaths.candidateConfig), false, name);
    assert.equal(existsSync(boundaryPaths.candidateEnv), false, name);
    assert.equal(existsSync(boundaryPaths.manifestPath), false, name);
    assert.equal(result.stderr.includes(boundaryPaths.root), false, name);
  }
});

test("gate resolves the active current link and rejects a linked candidate release", (t) => {
  const paths = fixture(t);
  const activePointer = join(paths.root, "current");
  const candidatePointer = join(paths.root, "candidate-link");
  const linkType = process.platform === "win32" ? "junction" : "dir";
  try {
    symlinkSync(paths.activeRelease, activePointer, linkType);
    symlinkSync(paths.candidateRelease, candidatePointer, linkType);
  } catch {
    t.skip("directory symlink creation is unavailable");
    return;
  }

  const activeResult = runCli(baseArgs({
    ...paths,
    activeRelease: activePointer
  }, "prepare"));
  assert.equal(activeResult.status, 0, activeResult.stderr);
  assert.equal(JSON.parse(activeResult.stdout).activeRelease, "release-active");

  const candidateResult = runCli(baseArgs({
    ...paths,
    candidateRelease: candidatePointer
  }, "prepare"));
  assert.equal(candidateResult.status, 1);
  assert.equal(JSON.parse(candidateResult.stderr).condition, "release_boundary_invalid");
  assert.equal(candidateResult.stderr.includes(paths.root), false);
});

test("prepare apply rejects a candidate beneath a linked ancestor without writes", (t) => {
  const paths = fixture(t);
  const externalRoot = mkdtempSync(join(tmpdir(), "gccgw-release-config-external-"));
  t.after(() => rmSync(externalRoot, { recursive: true, force: true }));

  const linkedParent = join(paths.root, "candidate-parent-link");
  const externalCandidate = join(externalRoot, "release-candidate");
  const linkedCandidate = join(linkedParent, "release-candidate");
  const linkType = process.platform === "win32" ? "junction" : "dir";
  mkdirSync(join(externalCandidate, "config"), { recursive: true });

  try {
    symlinkSync(externalRoot, linkedParent, linkType);
  } catch {
    t.skip("directory symlink creation is unavailable");
    return;
  }

  const result = applyOverlay({
    ...paths,
    candidateRelease: linkedCandidate
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(JSON.parse(result.stderr).condition, "release_boundary_invalid");
  assert.equal(existsSync(join(externalCandidate, "config", "proxy-servers.json")), false);
  assert.equal(existsSync(join(externalCandidate, ".env")), false);
  assert.equal(existsSync(paths.manifestPath), false);
  assert.equal(result.stderr.includes(paths.root), false);
  assert.equal(result.stderr.includes(externalRoot), false);
});

test("prepare apply refuses an existing manifest before changing the candidate", (t) => {
  const paths = fixture(t);
  mkdirSync(dirname(paths.manifestPath), { recursive: true });
  writeFileSync(paths.manifestPath, "existing-protected-manifest\n");

  const result = applyOverlay(paths);

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(JSON.parse(result.stderr).condition, "manifest_boundary_invalid");
  assert.equal(existsSync(paths.candidateConfig), false);
  assert.equal(existsSync(paths.candidateEnv), false);
  assert.equal(readFileSync(paths.manifestPath, "utf8"), "existing-protected-manifest\n");
  assert.equal(result.stderr.includes(paths.root), false);
});

test("prepare refuses a candidate that already contains either protected file", (t) => {
  for (const [name, candidateKey, unexpectedBytes] of [
    ["config", "candidateConfig", "unexpected-artifact-config\n"],
    ["environment", "candidateEnv", "unexpected-artifact-environment\n"]
  ]) {
    const paths = fixture(t);
    writeFileSync(paths[candidateKey], unexpectedBytes);

    const result = runCli(baseArgs(paths, "prepare"));

    assert.equal(result.status, 1, name);
    assert.equal(result.stdout, "", name);
    assert.equal(JSON.parse(result.stderr).condition, "candidate_protected_file_present", name);
    assert.equal(readFileSync(paths[candidateKey], "utf8"), unexpectedBytes, name);
    assert.equal(existsSync(paths.manifestPath), false, name);
    assert.equal(result.stderr.includes(paths.root), false, name);
    assert.equal(result.stderr.includes(unexpectedBytes), false, name);
  }
});

test("gate rejects symlinked candidate files and parent directories", {
  skip: process.platform === "win32" ? "symlink creation is not portable on Windows" : false
}, (t) => {
  const paths = fixture(t);
  const external = join(paths.root, "external-config.json");
  writeFileSync(external, "external-sensitive-config\n");
  symlinkSync(external, paths.candidateConfig);
  assert.equal(lstatSync(paths.candidateConfig).isSymbolicLink(), true);

  const result = applyOverlay(paths);

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(JSON.parse(result.stderr).condition, "config_boundary_invalid");
  assert.equal(readFileSync(external, "utf8"), "external-sensitive-config\n");
  assert.equal(existsSync(paths.manifestPath), false);

  const envPaths = fixture(t);
  const externalEnv = join(envPaths.root, "external-env");
  writeFileSync(externalEnv, "external-sensitive-environment\n");
  symlinkSync(externalEnv, envPaths.candidateEnv);
  const envResult = applyOverlay(envPaths);
  assert.equal(envResult.status, 1);
  assert.equal(envResult.stdout, "");
  assert.equal(JSON.parse(envResult.stderr).condition, "config_boundary_invalid");
  assert.equal(readFileSync(externalEnv, "utf8"), "external-sensitive-environment\n");
  assert.equal(existsSync(envPaths.manifestPath), false);

  const parentPaths = fixture(t);
  const externalDirectory = join(parentPaths.root, "external-config-directory");
  mkdirSync(externalDirectory);
  rmSync(dirname(parentPaths.candidateConfig), { recursive: true });
  symlinkSync(externalDirectory, dirname(parentPaths.candidateConfig), "dir");

  const parentResult = applyOverlay(parentPaths);
  assert.equal(parentResult.status, 1);
  assert.equal(parentResult.stdout, "");
  assert.equal(JSON.parse(parentResult.stderr).condition, "config_boundary_invalid");
  assert.equal(existsSync(join(externalDirectory, "proxy-servers.json")), false);
  assert.equal(existsSync(parentPaths.manifestPath), false);

  const manifestPaths = fixture(t);
  const externalManifestDirectory = join(manifestPaths.root, "external-manifest-directory");
  mkdirSync(externalManifestDirectory);
  symlinkSync(externalManifestDirectory, dirname(manifestPaths.manifestPath), "dir");
  const manifestResult = applyOverlay(manifestPaths);
  assert.equal(manifestResult.status, 1);
  assert.equal(manifestResult.stdout, "");
  assert.equal(JSON.parse(manifestResult.stderr).condition, "manifest_boundary_invalid");
  assert.equal(existsSync(manifestPaths.candidateConfig), false);
  assert.equal(existsSync(manifestPaths.candidateEnv), false);
  assert.equal(existsSync(join(externalManifestDirectory, "release-assembly.json")), false);
});

test("package and runbook place protected overlay identity before the health gate", () => {
  const packageJson = JSON.parse(readFileSync(resolve(REPOSITORY_ROOT, "package.json"), "utf8"));
  const runbook = readFileSync(
    resolve(REPOSITORY_ROOT, "docs/GITHUB_DEPLOYMENT_RUNBOOK.md"),
    "utf8"
  );

  assert.equal(
    packageJson.scripts["release:config:prepare"],
    "node scripts/control-plane-release-config-gate.mjs --mode prepare"
  );
  assert.equal(
    packageJson.scripts["release:config:verify"],
    "node scripts/control-plane-release-config-gate.mjs --mode verify"
  );
  const identityIndex = runbook.indexOf("### Protected Release Overlay Identity Gate");
  const healthIndex = runbook.indexOf("### Condition-Driven Promotion Health Window");

  assert.ok(identityIndex >= 0);
  assert.ok(healthIndex > identityIndex);
  assert.match(runbook, /\.env.*config\/proxy-servers\.json.*explicit source-ZIP exclusions/is);
  assert.match(runbook, /source-only verifier blocks.*\.env.*non-example.*trusted Git tree or ZIP/is);
  assert.match(runbook, /\.env\.example.*not excluded/is);
  assert.match(runbook, /candidate.*must be\s+missing.*\.env.*config\/proxy-servers\.json/is);
  assert.doesNotMatch(runbook, /Roll back automatically if validation fails/);
  assert.match(runbook, /explicit approved rollback decision.*DB.*separate explicit decision/is);
  assert.match(runbook, /verify.*before.*current.*switch/is);
});
