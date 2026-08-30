import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import {
  CONTROL_PLANE_CLEAN_ROOM_ARTIFACT_SMOKE_TYPE,
  ControlPlaneCleanRoomArtifactSmokeError,
  createControlPlaneCleanRoomArtifactSmokeTestRuntime,
  runControlPlaneCleanRoomArtifactSmoke,
  runControlPlaneCleanRoomArtifactSmokeCli
} from "../../scripts/control-plane-clean-room-artifact-smoke.mjs";

const SOURCE_COMMIT = "9".repeat(40);
const ARTIFACT_RELEASE = "master-597-clean-room";
const CREATED_AT = "2026-08-30T00:00:00.000Z";
const SECRET = "clean-room-secret-must-not-leak";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const condition = (name) => (error) => error instanceof ControlPlaneCleanRoomArtifactSmokeError && error.condition === name;

const dependencyRuntime = Object.freeze({
  platform: "linux",
  arch: "x64",
  libc: "glibc-2.39",
  nodeVersion: "v22.23.1",
  nodeAbi: "127",
  npmVersion: "v10.9.2",
  betterSqlite3Version: "12.10.0"
});

function writePrivate(path, bytes) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, bytes, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function fixture(t, overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "gccgw-clean-room-smoke-test-"));
  const inputDirectory = join(root, "input");
  mkdirSync(inputDirectory, { mode: 0o700 });
  chmodSync(inputDirectory, 0o700);

  const packageJsonBytes = Buffer.from('{"name":"clean-room-fixture","version":"1.0.0"}\n');
  const packageLockBytes = Buffer.from('{"name":"clean-room-fixture","lockfileVersion":3,"packages":{}}\n');
  const sourceArchiveBytes = Buffer.from(overrides.sourceArchiveBytes ?? "synthetic exact source zip\n");
  const dependencyArchiveBytes = Buffer.from(overrides.dependencyArchiveBytes ?? "synthetic exact dependency tar\n");
  const artifactName = `proxy-gateway-${ARTIFACT_RELEASE}.zip`;
  const artifactManifest = {
    schemaVersion: "1",
    releaseUnit: "control-plane-app",
    sourceCommit: overrides.sourceCommit ?? SOURCE_COMMIT,
    release: overrides.artifactRelease ?? ARTIFACT_RELEASE,
    artifact: {
      fileName: artifactName,
      sha256: hash(sourceArchiveBytes),
      sizeBytes: sourceArchiveBytes.length,
      createdAt: CREATED_AT
    }
  };
  const artifactManifestBytes = Buffer.from(`${JSON.stringify(artifactManifest, null, 2)}\n`);
  const tree = Object.freeze({
    sha256: "7".repeat(64),
    entryCount: 2,
    totalBytes: 31,
    hardlinksBroken: true,
    symlinksInternal: true
  });
  const dependencyManifest = {
    schemaVersion: "2",
    type: "control_plane_dependency_artifact",
    state: "verified",
    releaseUnit: "control-plane-app",
    sourceCommit: overrides.dependencySourceCommit ?? SOURCE_COMMIT,
    artifactRelease: overrides.dependencyArtifactRelease ?? ARTIFACT_RELEASE,
    package: { sha256: hash(packageJsonBytes), sizeBytes: packageJsonBytes.length },
    packageLock: { sha256: hash(packageLockBytes), sizeBytes: packageLockBytes.length },
    archive: {
      fileName: "node-modules.tar",
      sha256: hash(dependencyArchiveBytes),
      sizeBytes: dependencyArchiveBytes.length
    },
    runtime: dependencyRuntime,
    smoke: { betterSqlite3Memory: true, snapshotImport: true },
    tree,
    provenance: {
      builder: "github-actions",
      workflow: "control-plane-dependency-artifact.yml"
    }
  };
  const dependencyManifestBytes = Buffer.from(`${JSON.stringify(dependencyManifest, null, 2)}\n`);

  writePrivate(join(inputDirectory, "artifact.json"), artifactManifestBytes);
  writePrivate(join(inputDirectory, artifactName), sourceArchiveBytes);
  writePrivate(
    join(inputDirectory, `${artifactName}.sha256`),
    Buffer.from(`${hash(sourceArchiveBytes)}  .release-artifacts/${artifactName}\n`)
  );
  writePrivate(join(inputDirectory, "dependency-artifact.json"), dependencyManifestBytes);
  writePrivate(join(inputDirectory, "node-modules.tar"), dependencyArchiveBytes);
  writePrivate(join(inputDirectory, "release-label.txt"), Buffer.from(`${ARTIFACT_RELEASE}\n`));

  const options = {
    inputDirectory,
    repositoryPath: resolve(root, "trusted-repository"),
    expectedSourceCommit: SOURCE_COMMIT,
    expectedArtifactRelease: ARTIFACT_RELEASE,
    expectedArtifactManifestSha256: hash(artifactManifestBytes),
    expectedSourceArtifactSha256: hash(sourceArchiveBytes),
    expectedDependencyManifestSha256: hash(dependencyManifestBytes),
    expectedDependencyArchiveSha256: hash(dependencyArchiveBytes)
  };
  mkdirSync(options.repositoryPath, { mode: 0o700 });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return {
    root,
    inputDirectory,
    artifactName,
    packageJsonBytes,
    packageLockBytes,
    sourceArchiveBytes,
    dependencyArchiveBytes,
    artifactManifest,
    artifactManifestBytes,
    dependencyManifest,
    dependencyManifestBytes,
    tree,
    options
  };
}

function successfulRuntime(t, value, overrides = {}) {
  const trace = [];
  const workspaceRoot = join(value.root, `workspace-${Math.random().toString(16).slice(2)}`);
  const dependencyRoot = join(value.root, `dependency-${Math.random().toString(16).slice(2)}`);
  let serviceEnv = null;
  let workspaceCleaned = false;
  let dependencyCleaned = false;

  const runtime = createControlPlaneCleanRoomArtifactSmokeTestRuntime({
    randomToken: () => SECRET,
    createWorkspace() {
      trace.push("workspace:create");
      mkdirSync(workspaceRoot, { mode: 0o700 });
      return {
        root: workspaceRoot,
        cleanup() {
          trace.push("workspace:cleanup");
          workspaceCleaned = true;
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      };
    },
    verifyArtifactGitTree(request) {
      trace.push("source:verify");
      assert.equal(request.repositoryPath, value.options.repositoryPath);
      assert.equal(request.expectedCommit, SOURCE_COMMIT);
      assert.deepEqual(request.excludedPaths, ["config/proxy-servers.json"]);
      assert.equal(request.sourceOnlyBoundary, true);
      return { ok: true, type: "artifact_git_tree_identity", fileCount: 4 };
    },
    extractSourceArchive({ destinationRoot, expectedSha256 }) {
      trace.push("source:extract");
      assert.equal(expectedSha256, value.options.expectedSourceArtifactSha256);
      mkdirSync(join(destinationRoot, "server"), { recursive: true });
      writePrivate(join(destinationRoot, "server", "index.mjs"), Buffer.from("// exact entry\n"));
      writePrivate(join(destinationRoot, "package.json"), value.packageJsonBytes);
      writePrivate(join(destinationRoot, "package-lock.json"), value.packageLockBytes);
    },
    prepareDependencyArtifactTree(request) {
      trace.push("dependency:prepare");
      assert.equal(request.expectedSourceCommit, SOURCE_COMMIT);
      assert.equal(request.expectedArtifactRelease, ARTIFACT_RELEASE);
      assert.equal(request.expectedManifestSha256, value.options.expectedDependencyManifestSha256);
      assert.equal(request.expectedArchiveSha256, value.options.expectedDependencyArchiveSha256);
      assert.deepEqual(request.packageJsonBytes, value.packageJsonBytes);
      assert.deepEqual(request.packageLockBytes, value.packageLockBytes);
      const nodeModulesRoot = join(dependencyRoot, "node_modules");
      mkdirSync(join(nodeModulesRoot, "fixture"), { recursive: true });
      writePrivate(join(nodeModulesRoot, "fixture", "index.js"), Buffer.from("export default true;\n"));
      return {
        tree: value.tree,
        extracted: {
          root: dependencyRoot,
          nodeModulesRoot,
          cleanup() {
            trace.push("dependency:cleanup");
            dependencyCleaned = true;
            rmSync(dependencyRoot, { recursive: true, force: true });
          }
        }
      };
    },
    auditDependencyTree(path) {
      trace.push("dependency:audit");
      assert.match(path, /node_modules$/u);
      return value.tree;
    },
    moveNodeModules({ source, destination }) {
      trace.push("dependency:move");
      renameSync(source, destination);
    },
    async assertPortAvailable(port) {
      trace.push(`port:available:${port}`);
      assert.equal(port, 18180);
    },
    async reserveConsolePort() {
      trace.push("port:reserve-console");
      return 45678;
    },
    spawnService({ executable, cwd, argv, env }) {
      trace.push("service:spawn");
      assert.equal(executable, process.execPath);
      assert.equal(cwd, join(workspaceRoot, "source"));
      assert.deepEqual(argv, ["server/index.mjs"]);
      assert.deepEqual(Object.keys(env).sort(), [
        "CONSOLE_PORT",
        "CONSOLE_TOKEN",
        "CONTROL_PLANE_RELEASE_IDENTITY_PATH",
        "DOTENV_CONFIG_QUIET",
        "LANG",
        "LC_ALL",
        "NODE_ENV",
        "PATH",
        "PROXY_SERVERS_CONFIG_PATH",
        "SUBSCRIPTION_CONTROL_DB_PATH",
        "SUBSCRIPTION_DB_PATH",
        "TZ"
      ]);
      assert.equal(env.PATH, "/usr/bin:/bin");
      assert.equal(env.LANG, "C");
      assert.equal(env.LC_ALL, "C");
      assert.equal(env.TZ, "UTC");
      assert.equal(env.NODE_ENV, "production");
      assert.equal(env.DOTENV_CONFIG_QUIET, "true");
      assert.equal(env.CONSOLE_PORT, "45678");
      assert.equal(env.CONSOLE_TOKEN, SECRET);
      assert.equal(readFileSync(env.PROXY_SERVERS_CONFIG_PATH, "utf8"), '{"servers":[]}\n');
      serviceEnv = env;
      return { synthetic: true };
    },
    serviceExited: () => false,
    async request({ path, headers }) {
      trace.push(`request:${path}:${headers?.authorization ? "bearer" : "anonymous"}`);
      if (overrides.request) return overrides.request({ path, headers, serviceEnv });
      if (path === "/api/health") {
        return { statusCode: 200, headers: { "content-type": "application/json" }, body: Buffer.from('{"ok":true,"ts":1,"authRequired":true}') };
      }
      if (path === "/api/status" && !headers?.authorization) {
        return { statusCode: 401, headers: {}, body: Buffer.alloc(0) };
      }
      if (path.startsWith("/api/status?token=")) {
        return { statusCode: 401, headers: {}, body: Buffer.alloc(0) };
      }
      const bytes = readFileSync(serviceEnv.CONTROL_PLANE_RELEASE_IDENTITY_PATH);
      const identity = JSON.parse(bytes);
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: Buffer.from(JSON.stringify({
          ok: true,
          ports: { httpProxy: { ok: true } },
          runtime: { httpProxy: { running: true } },
          releaseIdentity: { ...identity, identitySha256: hash(bytes) }
        }))
      };
    },
    async terminateService() {
      trace.push("service:terminate");
      return true;
    },
    async assertPortReleased(port) {
      trace.push(`port:released:${port}`);
    },
    sleep: async () => {},
    now: (() => {
      let value = 0;
      return () => value++;
    })(),
    ...overrides.runtime
  });

  t.after(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
    rmSync(dependencyRoot, { recursive: true, force: true });
  });
  return {
    runtime,
    trace,
    workspaceRoot,
    dependencyRoot,
    get serviceEnv() { return serviceEnv; },
    get workspaceCleaned() { return workspaceCleaned; },
    get dependencyCleaned() { return dependencyCleaned; }
  };
}

test("clean-room smoke binds both artifacts, starts the exact entry in a synthetic environment, and cleans up", async (t) => {
  const value = fixture(t);
  const harness = successfulRuntime(t, value);
  const result = await runControlPlaneCleanRoomArtifactSmoke({ ...value.options, runtime: harness.runtime });

  assert.deepEqual(result, {
    schemaVersion: "1",
    type: CONTROL_PLANE_CLEAN_ROOM_ARTIFACT_SMOKE_TYPE,
    state: "verified",
    releaseUnit: "control-plane-app",
    sourceCommit: SOURCE_COMMIT,
    artifactRelease: ARTIFACT_RELEASE,
    binding: {
      artifactManifestSha256: value.options.expectedArtifactManifestSha256,
      sourceArtifactSha256: value.options.expectedSourceArtifactSha256,
      dependencyArtifactManifestSha256: value.options.expectedDependencyManifestSha256,
      dependencyArchiveSha256: value.options.expectedDependencyArchiveSha256
    },
    assembly: {
      sourceTree: "verified",
      dependencyTree: "verified",
      entry: "server/index.mjs"
    },
    probes: {
      publicHealth: "passed",
      protectedStatus: "passed",
      releaseIdentity: "matched"
    }
  });
  assert.deepEqual(harness.trace, [
    "source:verify",
    "workspace:create",
    "source:extract",
    "dependency:prepare",
    "dependency:audit",
    "dependency:move",
    "dependency:audit",
    "port:available:18180",
    "port:reserve-console",
    "service:spawn",
    "request:/api/health:anonymous",
    "request:/api/status:anonymous",
    `request:/api/status?token=${encodeURIComponent(SECRET)}:anonymous`,
    "request:/api/status:bearer",
    "service:terminate",
    "port:released:45678",
    "port:released:18180",
    "dependency:cleanup",
    "workspace:cleanup"
  ]);
  assert.equal(harness.workspaceCleaned, true);
  assert.equal(harness.dependencyCleaned, true);
  assert.equal(existsSync(harness.workspaceRoot), false);
  assert.equal(existsSync(harness.dependencyRoot), false);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(SECRET), false);
  assert.equal(serialized.includes(value.root), false);
});

test("clean-room waits for the full HTTP proxy startup state within the shared deadline", async (t) => {
  const value = fixture(t);
  let authorizedCalls = 0;
  const harness = successfulRuntime(t, value, {
    request({ path, headers, serviceEnv }) {
      if (path === "/api/health") {
        return { statusCode: 200, headers: {}, body: Buffer.from('{"ok":true,"ts":1,"authRequired":true}') };
      }
      if (!headers?.authorization) {
        return { statusCode: 401, headers: {}, body: Buffer.alloc(0) };
      }
      authorizedCalls += 1;
      const bytes = readFileSync(serviceEnv.CONTROL_PLANE_RELEASE_IDENTITY_PATH);
      return {
        statusCode: 200,
        headers: {},
        body: Buffer.from(JSON.stringify({
          ok: true,
          ports: { httpProxy: { ok: authorizedCalls > 1 } },
          runtime: { httpProxy: { running: authorizedCalls > 1 } },
          releaseIdentity: { ...JSON.parse(bytes), identitySha256: hash(bytes) }
        }))
      };
    }
  });

  await runControlPlaneCleanRoomArtifactSmoke({ ...value.options, runtime: harness.runtime });
  assert.equal(authorizedCalls, 2);
  assert.equal(harness.workspaceCleaned, true);
  assert.equal(harness.dependencyCleaned, true);
});

test("source and dependency release bindings fail before extraction or service start", async (t) => {
  for (const [name, overrides, expectedCondition] of [
    ["source", { sourceCommit: "8".repeat(40) }, "source_binding_mismatch"],
    ["dependency", { dependencySourceCommit: "8".repeat(40) }, "source_binding_mismatch"],
    ["dependency-release", { dependencyArtifactRelease: "other-release" }, "release_binding_mismatch"]
  ]) {
    await t.test(name, async (st) => {
      const value = fixture(st, overrides);
      const harness = successfulRuntime(st, value);
      await assert.rejects(
        runControlPlaneCleanRoomArtifactSmoke({ ...value.options, runtime: harness.runtime }),
        condition(expectedCondition)
      );
      assert.equal(harness.trace.some((entry) => entry === "source:extract" || entry === "service:spawn"), false);
    });
  }
});

test("public health and protected status probes fail closed", async (t) => {
  const cases = [
    {
      name: "health identity leak",
      expected: "public_health_invalid",
      request({ path }) {
        if (path === "/api/health") return { statusCode: 200, headers: {}, body: Buffer.from('{"ok":true,"ts":1,"authRequired":true,"sourceCommit":"secret"}') };
        throw new Error("unexpected request");
      }
    },
    {
      name: "anonymous status accepted",
      expected: "status_authentication_invalid",
      request({ path }) {
        if (path === "/api/health") return { statusCode: 200, headers: {}, body: Buffer.from('{"ok":true,"ts":1,"authRequired":true}') };
        if (path === "/api/status") return { statusCode: 200, headers: {}, body: Buffer.from("{}") };
        throw new Error("unexpected request");
      }
    },
    {
      name: "query token accepted",
      expected: "status_authentication_invalid",
      request({ path }) {
        if (path === "/api/health") return { statusCode: 200, headers: {}, body: Buffer.from('{"ok":true,"ts":1,"authRequired":true}') };
        if (path === "/api/status") return { statusCode: 401, headers: {}, body: Buffer.alloc(0) };
        if (path.startsWith("/api/status?token=")) return { statusCode: 200, headers: {}, body: Buffer.from("{}") };
        throw new Error("unexpected request");
      }
    },
    {
      name: "authorized identity mismatch",
      expected: "release_identity_mismatch",
      request({ path, headers }) {
        if (path === "/api/health") return { statusCode: 200, headers: {}, body: Buffer.from('{"ok":true,"ts":1,"authRequired":true}') };
        if (!headers?.authorization) return { statusCode: 401, headers: {}, body: Buffer.alloc(0) };
        return { statusCode: 200, headers: {}, body: Buffer.from('{"releaseIdentity":{"state":"unavailable"}}') };
      }
    }
  ];

  for (const valueCase of cases) {
    await t.test(valueCase.name, async (st) => {
      const value = fixture(st);
      const harness = successfulRuntime(st, value, { request: valueCase.request });
      await assert.rejects(
        runControlPlaneCleanRoomArtifactSmoke({ ...value.options, runtime: harness.runtime }),
        condition(valueCase.expected)
      );
      assert.equal(harness.trace.includes("service:terminate"), true);
      assert.equal(harness.workspaceCleaned, true);
      assert.equal(harness.dependencyCleaned, true);
    });
  }
});

test("dependency audit mismatch blocks before service start and still cleans every owned tree", async (t) => {
  const value = fixture(t);
  let auditCalls = 0;
  const harness = successfulRuntime(t, value, {
    runtime: {
      auditDependencyTree() {
        harness.trace.push("dependency:audit");
        auditCalls += 1;
        return auditCalls === 1 ? value.tree : { ...value.tree, sha256: "6".repeat(64) };
      }
    }
  });
  await assert.rejects(
    runControlPlaneCleanRoomArtifactSmoke({ ...value.options, runtime: harness.runtime }),
    condition("dependency_tree_mismatch")
  );
  assert.equal(harness.trace.includes("service:spawn"), false);
  assert.equal(harness.workspaceCleaned, true);
  assert.equal(harness.dependencyCleaned, true);
});

test("CLI emits one bounded error envelope without token, path, PID, or raw exception text", async (t) => {
  const value = fixture(t);
  const harness = successfulRuntime(t, value, {
    request() {
      throw new Error(`${SECRET} ${value.root} pid=424242 raw-provider-output`);
    },
    runtime: {
      now: (() => {
        let current = 0;
        return () => { current += 20_000; return current; };
      })()
    }
  });
  const args = [
    "--repository", value.options.repositoryPath,
    "--input-directory", value.options.inputDirectory,
    "--expected-source-commit", value.options.expectedSourceCommit,
    "--expected-artifact-release", value.options.expectedArtifactRelease
  ];
  let stdout = "";
  let stderr = "";
  const exitCode = await runControlPlaneCleanRoomArtifactSmokeCli({
    argv: args,
    runtime: harness.runtime,
    stdout: { write: (chunk) => { stdout += chunk; } },
    stderr: { write: (chunk) => { stderr += chunk; } }
  });
  assert.equal(exitCode, 1);
  assert.equal(stdout, "");
  assert.deepEqual(JSON.parse(stderr), {
    schemaVersion: "1",
    type: CONTROL_PLANE_CLEAN_ROOM_ARTIFACT_SMOKE_TYPE,
    state: "blocked",
    condition: "service_probe_failed"
  });
  assert.equal(stderr.includes(SECRET), false);
  assert.equal(stderr.includes(value.root), false);
  assert.equal(stderr.includes("424242"), false);
  assert.equal(stderr.includes("raw-provider-output"), false);
  assert.equal(harness.workspaceCleaned, true);
  assert.equal(harness.dependencyCleaned, true);
});

test("CLI rejects duplicate and unknown arguments without reaching artifact operations", async () => {
  for (const argv of [
    ["--input-directory", "/tmp/a", "--input-directory", "/tmp/b"],
    ["--unknown", "value"],
    ["--source-commit"]
  ]) {
    let stderr = "";
    const exitCode = await runControlPlaneCleanRoomArtifactSmokeCli({
      argv,
      stdout: { write() { assert.fail("invalid CLI must not write stdout"); } },
      stderr: { write: (chunk) => { stderr += chunk; } }
    });
    assert.equal(exitCode, 1);
    assert.deepEqual(JSON.parse(stderr), {
      schemaVersion: "1",
      type: CONTROL_PLANE_CLEAN_ROOM_ARTIFACT_SMOKE_TYPE,
      state: "blocked",
      condition: "invalid_input"
    });
  }
});
