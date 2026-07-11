import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT_PATH = resolve(REPOSITORY_ROOT, "scripts/control-plane-release-config-gate.mjs");
const RELATIVE_CONFIG = "config/proxy-servers.json";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "gccgw-release-config-gate-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const activeRelease = join(root, "release-active");
  const candidateRelease = join(root, "release-candidate");
  const activeConfig = join(activeRelease, "config", "proxy-servers.json");
  const candidateConfig = join(candidateRelease, "config", "proxy-servers.json");
  const manifestPath = join(root, "protected", "release-assembly.json");

  mkdirSync(dirname(activeConfig), { recursive: true });
  mkdirSync(dirname(candidateConfig), { recursive: true });
  writeFileSync(activeConfig, "protected-production-config\n", { mode: 0o640 });
  writeFileSync(candidateConfig, "artifact-default-config\n", { mode: 0o644 });
  chmodSync(activeConfig, 0o640);
  chmodSync(candidateConfig, 0o644);

  return {
    root,
    activeRelease,
    candidateRelease,
    activeConfig,
    candidateConfig,
    manifestPath
  };
}

function runCli(args) {
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

test("prepare dry-run reports drift without writing candidate or manifest", (t) => {
  const paths = fixture(t);
  const before = readFileSync(paths.candidateConfig, "utf8");

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
    candidateMatches: false
  });
  assert.equal(readFileSync(paths.candidateConfig, "utf8"), before);
  assert.equal(existsSync(paths.manifestPath), false);
  assert.equal(result.stdout.includes(paths.root), false);
  assert.doesNotMatch(result.stdout, /protected-production-config|artifact-default-config/);
});

test("prepare apply atomically overlays config and emits a portable protected manifest", (t) => {
  const paths = fixture(t);
  const sourceBytes = readFileSync(paths.activeConfig);
  const expectedHash = createHash("sha256").update(sourceBytes).digest("hex");
  const expectedMode = (statSync(paths.activeConfig).mode & 0o777)
    .toString(8)
    .padStart(4, "0");

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
    candidateMatches: true
  });
  assert.deepEqual(readFileSync(paths.candidateConfig), sourceBytes);

  const manifestRaw = readFileSync(paths.manifestPath, "utf8");
  assert.deepEqual(JSON.parse(manifestRaw), {
    schemaVersion: "1",
    type: "control_plane_release_assembly",
    releaseUnit: "control-plane-app",
    activeRelease: "release-active",
    candidateRelease: "release-candidate",
    createdAt: "2026-07-11T10:00:00.000Z",
    protectedOverlays: [{
      relativePath: RELATIVE_CONFIG,
      sha256: expectedHash,
      sizeBytes: sourceBytes.length,
      mode: expectedMode
    }]
  });
  assert.equal(manifestRaw.includes(paths.root), false);
  assert.doesNotMatch(manifestRaw, /protected-production-config|artifact-default-config/);
  assert.equal(result.stdout.includes(expectedHash), false);
  assert.equal(result.stdout.includes(paths.root), false);

  if (process.platform !== "win32") {
    assert.equal(statSync(paths.candidateConfig).mode & 0o777, 0o640);
    assert.equal(statSync(paths.manifestPath).mode & 0o777, 0o600);
  }
});

test("verify accepts the prepared assembly without writing files", (t) => {
  const paths = fixture(t);
  const prepared = applyOverlay(paths);
  assert.equal(prepared.status, 0, prepared.stderr);
  const configBefore = readFileSync(paths.candidateConfig);
  const manifestBefore = readFileSync(paths.manifestPath);
  const configMtimeBefore = statSync(paths.candidateConfig).mtimeMs;
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
    candidateMatches: true
  });
  assert.deepEqual(readFileSync(paths.candidateConfig), configBefore);
  assert.deepEqual(readFileSync(paths.manifestPath), manifestBefore);
  assert.equal(statSync(paths.candidateConfig).mtimeMs, configMtimeBefore);
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
    const candidateBefore = readFileSync(boundaryPaths.candidateConfig);

    const result = applyOverlay(boundaryPaths);

    assert.equal(result.status, 1, name);
    assert.equal(result.stdout, "", name);
    assert.equal(JSON.parse(result.stderr).condition, "manifest_boundary_invalid", name);
    assert.deepEqual(readFileSync(boundaryPaths.candidateConfig), candidateBefore, name);
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

test("prepare apply refuses an existing manifest before changing the candidate", (t) => {
  const paths = fixture(t);
  const candidateBefore = readFileSync(paths.candidateConfig);
  mkdirSync(dirname(paths.manifestPath), { recursive: true });
  writeFileSync(paths.manifestPath, "existing-protected-manifest\n");

  const result = applyOverlay(paths);

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(JSON.parse(result.stderr).condition, "manifest_boundary_invalid");
  assert.deepEqual(readFileSync(paths.candidateConfig), candidateBefore);
  assert.equal(readFileSync(paths.manifestPath, "utf8"), "existing-protected-manifest\n");
  assert.equal(result.stderr.includes(paths.root), false);
});

test("gate rejects symlinked config inputs", {
  skip: process.platform === "win32" ? "symlink creation is not portable on Windows" : false
}, (t) => {
  const paths = fixture(t);
  const external = join(paths.root, "external-config.json");
  writeFileSync(external, "external-sensitive-config\n");
  rmSync(paths.candidateConfig);
  symlinkSync(external, paths.candidateConfig);
  assert.equal(lstatSync(paths.candidateConfig).isSymbolicLink(), true);

  const result = applyOverlay(paths);

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(JSON.parse(result.stderr).condition, "config_boundary_invalid");
  assert.equal(readFileSync(external, "utf8"), "external-sensitive-config\n");
  assert.equal(existsSync(paths.manifestPath), false);
});

test("package and runbook place config identity before the health gate", () => {
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
  const identityIndex = runbook.indexOf("### Protected Release Config Identity Gate");
  const healthIndex = runbook.indexOf("### Condition-Driven Promotion Health Window");

  assert.ok(identityIndex >= 0);
  assert.ok(healthIndex > identityIndex);
  assert.match(runbook, /production config.*must not be packaged in the GitHub source artifact/is);
  assert.match(runbook, /verify.*before.*current.*switch/is);
});
