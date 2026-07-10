import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ARTIFACT_RELEASE_UNITS,
  createArtifactManifest,
  runArtifactManifestCli
} from "../../scripts/create-artifact-manifest.mjs";

const EXPECTED_RELEASE_UNITS = [
  "control-plane-app",
  "company-site-static",
  "portal-static",
  "admin-static",
  "japan-runtime-config",
  "sgp-runtime-config",
  "subscription-rendering",
  "attribution-appsflyer"
];

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("creates a minimal portable artifact manifest", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "gccgw-artifact-manifest-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const artifactPath = join(directory, "proxy-gateway-runtime.zip");
  writeFileSync(artifactPath, "artifact-bytes");

  const manifest = createArtifactManifest({
    releaseUnit: "control-plane-app",
    sourceCommit: "a".repeat(40),
    release: "traffic-usage-xray-idle-observable-20260709-001",
    artifactPath,
    createdAt: "2026-07-10T10:00:00Z"
  });

  assert.deepEqual(manifest, {
    schemaVersion: "1",
    releaseUnit: "control-plane-app",
    sourceCommit: "a".repeat(40),
    release: "traffic-usage-xray-idle-observable-20260709-001",
    artifact: {
      fileName: "proxy-gateway-runtime.zip",
      sha256: "6521df166eb07efaf36eba5b6bedefd9d6a252e9c80bab1c99653700ec71473c",
      sizeBytes: 14,
      createdAt: "2026-07-10T10:00:00.000Z"
    }
  });
  assert.equal(JSON.stringify(manifest).includes(directory), false);
});

test("accepts only the eight frozen release units", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "gccgw-artifact-manifest-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const artifactPath = join(directory, "artifact.zip");
  writeFileSync(artifactPath, "artifact-bytes");

  assert.deepEqual([...ARTIFACT_RELEASE_UNITS], EXPECTED_RELEASE_UNITS);
  assert.throws(
    () => createArtifactManifest({
      releaseUnit: "unregistered-release-unit",
      sourceCommit: "a".repeat(40),
      release: "release-2026-07-10-test",
      artifactPath,
      createdAt: "2026-07-10T10:00:00Z"
    }),
    /artifact_manifest_release_unit_invalid/
  );
});

test("rejects non-portable source, release, and timestamp metadata", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "gccgw-artifact-manifest-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const artifactPath = join(directory, "artifact.zip");
  writeFileSync(artifactPath, "artifact-bytes");
  const baseInput = {
    releaseUnit: "control-plane-app",
    sourceCommit: "a".repeat(40),
    release: "release-2026-07-10-test",
    artifactPath,
    createdAt: "2026-07-10T10:00:00Z"
  };

  assert.throws(
    () => createArtifactManifest({ ...baseInput, sourceCommit: directory }),
    /artifact_manifest_source_commit_invalid/
  );
  assert.throws(
    () => createArtifactManifest({ ...baseInput, release: "../local-release" }),
    /artifact_manifest_release_invalid/
  );
  assert.throws(
    () => createArtifactManifest({ ...baseInput, createdAt: "not-a-timestamp" }),
    /artifact_manifest_created_at_invalid/
  );
});

test("CLI writes artifact.json that matches the artifact bytes", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "gccgw-artifact-manifest-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const artifactPath = join(directory, "proxy-gateway-release.zip");
  const outputPath = join(directory, "artifact.json");
  writeFileSync(artifactPath, "artifact-bytes");
  let stdout = "";
  let stderr = "";

  const exitCode = runArtifactManifestCli({
    argv: [
      "--release-unit", "control-plane-app",
      "--source-commit", "b".repeat(40),
      "--release", "release-2026-07-10-control-plane",
      "--artifact", artifactPath,
      "--output", outputPath,
      "--created-at", "2026-07-10T11:00:00Z"
    ],
    stdout: { write: (value) => { stdout += value; } },
    stderr: { write: (value) => { stderr += value; } }
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr, "");
  assert.deepEqual(JSON.parse(readFileSync(outputPath, "utf8")), {
    schemaVersion: "1",
    releaseUnit: "control-plane-app",
    sourceCommit: "b".repeat(40),
    release: "release-2026-07-10-control-plane",
    artifact: {
      fileName: "proxy-gateway-release.zip",
      sha256: "6521df166eb07efaf36eba5b6bedefd9d6a252e9c80bab1c99653700ec71473c",
      sizeBytes: 14,
      createdAt: "2026-07-10T11:00:00.000Z"
    }
  });
  assert.match(stdout, /"ok":true/);
  assert.equal(stdout.includes(directory), false);
});

test("CLI never overwrites the artifact with artifact.json", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "gccgw-artifact-manifest-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const artifactPath = join(directory, "proxy-gateway-release.zip");
  writeFileSync(artifactPath, "artifact-bytes");
  let stderr = "";

  const exitCode = runArtifactManifestCli({
    argv: [
      "--release-unit", "control-plane-app",
      "--source-commit", "b".repeat(40),
      "--release", "release-2026-07-10-control-plane",
      "--artifact", artifactPath,
      "--output", artifactPath,
      "--created-at", "2026-07-10T11:00:00Z"
    ],
    stdout: { write: () => {} },
    stderr: { write: (value) => { stderr += value; } }
  });

  assert.equal(exitCode, 1);
  assert.equal(readFileSync(artifactPath, "utf8"), "artifact-bytes");
  assert.match(stderr, /"ok":false/);
  assert.equal(stderr.includes(directory), false);
});

test("ZIP workflows generate artifact.json before upload", () => {
  const workflowCases = [
    {
      path: ".github/workflows/release-artifact.yml",
      buildMarker: "- name: Create source zip",
      uploadMarker: "- name: Upload artifact",
      uploadPath: ".release-artifacts/artifact.json"
    },
    {
      path: ".github/workflows/production-deploy-dry-run.yml",
      buildMarker: "- name: Create deploy packet",
      uploadMarker: "- name: Upload dry-run packet",
      uploadPath: ".release-artifacts/artifact.json"
    }
  ];

  for (const workflowCase of workflowCases) {
    const workflow = readFileSync(resolve(REPOSITORY_ROOT, workflowCase.path), "utf8");
    const buildIndex = workflow.indexOf(workflowCase.buildMarker);
    const manifestIndex = workflow.indexOf("- name: Create artifact manifest");
    const uploadIndex = workflow.indexOf(workflowCase.uploadMarker);

    assert.ok(buildIndex >= 0, `${workflowCase.path} must build the ZIP`);
    assert.ok(manifestIndex > buildIndex, `${workflowCase.path} must generate the manifest after the ZIP`);
    assert.ok(uploadIndex > manifestIndex, `${workflowCase.path} must upload after manifest generation`);
    assert.match(workflow, /node scripts\/create-artifact-manifest\.mjs/);
    assert.match(workflow, /--release-unit control-plane-app/);
    assert.match(workflow, /--source-commit "\$GITHUB_SHA"/);
    assert.match(workflow, /--artifact "\$artifact"/);
    assert.match(workflow, /--output \.release-artifacts\/artifact\.json/);
    assert.ok(workflow.includes(workflowCase.uploadPath));
  }
});

test("Release Artifact workflow packages verified Portal output with its own identity", () => {
  const workflow = readFileSync(
    resolve(REPOSITORY_ROOT, ".github/workflows/release-artifact.yml"),
    "utf8"
  );
  const portalJobIndex = workflow.indexOf("  portal-static:");

  assert.ok(portalJobIndex >= 0, "workflow must define an independent portal-static job");

  const portalJob = workflow.slice(portalJobIndex);
  const buildIndex = portalJob.indexOf("- name: Build Portal static");
  const verifyIndex = portalJob.indexOf("- name: Verify Portal static");
  const zipIndex = portalJob.indexOf("- name: Create Portal static zip");
  const manifestIndex = portalJob.indexOf("- name: Create Portal artifact manifest");
  const uploadIndex = portalJob.indexOf("- name: Upload Portal artifact");

  assert.ok(buildIndex >= 0, "Portal job must build the static bundle");
  assert.ok(verifyIndex > buildIndex, "Portal job must verify the bundle after building it");
  assert.ok(zipIndex > verifyIndex, "Portal job must package only the verified bundle");
  assert.ok(manifestIndex > zipIndex, "Portal job must create identity after packaging");
  assert.ok(uploadIndex > manifestIndex, "Portal job must upload only after identity exists");
  assert.match(portalJob, /npm ci --prefix admin/);
  assert.match(portalJob, /npm run admin:portal:build/);
  assert.match(portalJob, /npm run admin:portal:verify/);
  assert.match(portalJob, /globalcircle-portal-\$\{\{ steps\.release\.outputs\.release \}\}\.zip/);
  assert.match(portalJob, /--release-unit portal-static/);
  assert.match(portalJob, /--source-commit "\$GITHUB_SHA"/);
  assert.match(portalJob, /--artifact "\$artifact"/);
  assert.match(portalJob, /--output \.release-artifacts\/artifact\.json/);
  assert.match(portalJob, /\.release-artifacts\/artifact\.json/);
  assert.match(portalJob, /uses: actions\/upload-artifact@v7/);
  assert.doesNotMatch(portalJob, /\/var\/www\/globalcircle-portal|\b(?:scp|ssh|rsync|nginx)\b/);
});

test("artifact workflows use the supported upload-artifact runtime", () => {
  const workflowsDirectory = resolve(REPOSITORY_ROOT, ".github/workflows");
  const workflowFiles = readdirSync(workflowsDirectory)
    .filter((file) => /\.ya?ml$/i.test(file));
  let uploadStepCount = 0;

  for (const workflowFile of workflowFiles) {
    const workflow = readFileSync(resolve(workflowsDirectory, workflowFile), "utf8");
    const uploadActions = [...workflow.matchAll(/actions\/upload-artifact@(v\d+)/g)];

    uploadStepCount += uploadActions.length;
    assert.doesNotMatch(
      workflow,
      /actions\/upload-artifact@v4/,
      `${workflowFile} must not use the deprecated upload-artifact v4 runtime`
    );
    for (const [, version] of uploadActions) {
      assert.equal(version, "v7", `${workflowFile} must use upload-artifact v7`);
    }
  }

  assert.ok(uploadStepCount > 0, "repository must contain an artifact upload contract");
});

test("production dry-run uploads only the explicit deploy packet files", () => {
  const workflow = readFileSync(
    resolve(REPOSITORY_ROOT, ".github/workflows/production-deploy-dry-run.yml"),
    "utf8"
  );
  const uploadIndex = workflow.indexOf("- name: Upload dry-run packet");

  assert.ok(uploadIndex >= 0, "dry-run workflow must upload its deploy packet");

  const uploadStep = workflow.slice(uploadIndex);
  assert.doesNotMatch(uploadStep, /path: \.release-artifacts\/\s/);
  assert.match(uploadStep, /\.release-artifacts\/proxy-gateway-\$\{\{ steps\.release\.outputs\.release \}\}\.zip/);
  assert.match(uploadStep, /\.release-artifacts\/proxy-gateway-\$\{\{ steps\.release\.outputs\.release \}\}\.zip\.sha256/);
  assert.match(uploadStep, /\.release-artifacts\/deploy-plan\.txt/);
  assert.match(uploadStep, /\.release-artifacts\/artifact\.json/);
  assert.doesNotMatch(uploadStep, /include-hidden-files:\s*true/);
});
