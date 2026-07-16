import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  JAPAN_TUIC_REPAIR_GATE,
  runJapanTuicRepairContractCli,
  validateArtifactIdentity,
  validateCandidateReport,
  validateExecutionReceipt,
  validateNaturalObservation,
  validatePostApplyIdentity
} from "../../scripts/japan-tuic-additive-repair-contract.mjs";

const ARTIFACT_BYTES = "approved-artifact-bytes";

const artifact = (overrides = {}) => ({
  runId: 29495150692,
  fileName: "proxy-gateway-control-plane-cumulative-20260716-003.zip",
  sizeBytes: 4744340,
  sha256: "d6c0663c9a7c82c6e8ffb7d354e2a4c23d26f3339586533df5c268b887b839fd",
  sourceCommit: "47a2a9583fb44cb905e91aade02ae5aa3d635d94",
  ...overrides
});

const candidate = (overrides = {}) => ({
  ok: true,
  candidateReady: true,
  candidate: {
    addCount: 3,
    removeCount: 0,
    deferredRemoveCount: 27,
    deferredChangedCount: 0,
    missingMaterialCount: 0,
    projectedMapCount: 82,
    ready: true,
    ...overrides
  }
});

const identityAfter = (overrides = {}) => ({
  runtimeCount: 55,
  mappedCount: 55,
  missing: 0,
  stale: 27,
  changed: 0,
  missingMaterial: 0,
  retentionState: "pending",
  state: "degraded",
  ...overrides
});

const naturalObservation = (overrides = {}) => ({
  applyBoundary: "2026-07-16T20:00:00.000Z",
  baseline: {
    collectorCount: 5,
    unresolvedTotal: 1,
    timerRestarts: 0,
    serviceRestarts: 0
  },
  current: {
    capturedAt: "2026-07-16T20:05:00.000Z",
    collectorInvocationObserved: true,
    timerActive: true,
    timerEnabled: true,
    timerRestarts: 0,
    serviceRestarts: 0,
    collectorCount: 5,
    unresolvedTotal: 1,
    japanTuicUnresolved: 0,
    omittedCollectorCount: 0,
    omittedProducerCount: 0,
    provenanceConserved: true,
    validatorPassed: true,
    ...overrides
  }
});

test("freezes the reviewed basis, planned execution gate, artifact, and additive counts", () => {
  assert.equal(validateArtifactIdentity(artifact()).ok, true);
  assert.equal(validateCandidateReport(candidate()).candidateReady, true);
  assert.equal(JAPAN_TUIC_REPAIR_GATE.gateBasis, "japan-tuic-identity-additive-repair-20260716-002");
  assert.equal(JAPAN_TUIC_REPAIR_GATE.executionGateId, "github-actions-japan-tuic-additive-repair-20260716-001");
  assert.equal(JAPAN_TUIC_REPAIR_GATE.strategy, "additive_missing_only");
});

test("rejects any artifact drift without echoing supplied values", () => {
  for (const drift of [
    { runId: 29495150693 },
    { fileName: "/protected/value" },
    { sizeBytes: 4744341 },
    { sha256: "f".repeat(64) },
    { sourceCommit: "e".repeat(40) }
  ]) {
    let message = "";
    assert.throws(
      () => validateArtifactIdentity(artifact(drift)),
      (error) => {
        message = error.message;
        return error.code === "artifact_identity_mismatch";
      }
    );
    assert.equal(message, "artifact_identity_mismatch");
    assert.doesNotMatch(message, /protected|value|29495150693/);
  }
});

test("rejects every additive count drift with one fixed safe code", () => {
  for (const [field, value] of [
    ["addCount", 2],
    ["removeCount", 1],
    ["deferredRemoveCount", 26],
    ["deferredChangedCount", 1],
    ["missingMaterialCount", 1],
    ["projectedMapCount", 81],
    ["ready", false]
  ]) {
    assert.throws(
      () => validateCandidateReport(candidate({ [field]: value })),
      (error) => error.code === "expected_count_mismatch" && error.message === "expected_count_mismatch"
    );
  }
});

test("requires the exact degraded post-apply Identity Gate", () => {
  assert.equal(validatePostApplyIdentity(identityAfter()).state, "degraded");
  for (const drift of [
    { runtimeCount: 54 },
    { mappedCount: 54 },
    { missing: 1 },
    { stale: 0 },
    { changed: 1 },
    { missingMaterial: 1 },
    { retentionState: "retained_temporarily" },
    { state: "verified" }
  ]) {
    assert.throws(
      () => validatePostApplyIdentity(identityAfter(drift)),
      (error) => error.code === "post_apply_invariant_failed"
    );
  }
});

test("accepts only a later natural observation with no Japan TUIC regression", () => {
  const result = validateNaturalObservation(naturalObservation());
  assert.deepEqual(result, {
    accepted: true,
    capturedAt: "2026-07-16T20:05:00.000Z",
    collectorCount: 5,
    unresolvedTotal: 1,
    japanTuicUnresolved: 0
  });
});

test("rejects each natural-observation regression", () => {
  for (const drift of [
    { capturedAt: "2026-07-16T20:00:00.000Z" },
    { collectorInvocationObserved: false },
    { timerActive: false },
    { timerEnabled: false },
    { timerRestarts: 1 },
    { serviceRestarts: 1 },
    { collectorCount: 4 },
    { unresolvedTotal: 2 },
    { japanTuicUnresolved: 1 },
    { omittedCollectorCount: 1 },
    { omittedProducerCount: 1 },
    { provenanceConserved: false },
    { validatorPassed: false }
  ]) {
    assert.throws(
      () => validateNaturalObservation(naturalObservation(drift)),
      (error) => error.code === "natural_observation_failed"
    );
  }
  assert.throws(
    () => validateNaturalObservation({
      ...naturalObservation(),
      baseline: { collectorCount: -1, unresolvedTotal: -1, timerRestarts: 0, serviceRestarts: 0 },
      current: { ...naturalObservation().current, collectorCount: -1, unresolvedTotal: -1 }
    }),
    (error) => error.code === "natural_observation_failed"
  );
});

test("validates an aggregate receipt without preserving unknown fields", () => {
  const receipt = validateExecutionReceipt({
    schemaVersion: "1",
    type: "japan_tuic_additive_repair_execution",
    productionResult: "applied_validated",
    hostCredentialCleanup: "verified",
    closeout: "github_cleanup_pending",
    candidate: JAPAN_TUIC_REPAIR_GATE.candidate,
    identityAfter: JAPAN_TUIC_REPAIR_GATE.after,
    naturalObservation: {
      accepted: true,
      capturedAt: "2026-07-16T20:05:00.000Z",
      collectorCount: 5,
      unresolvedTotal: 1,
      japanTuicUnresolved: 0
    },
    ignoredProtectedValue: "/must/not/survive"
  });
  assert.equal(receipt.productionResult, "applied_validated");
  assert.equal(receipt.closeout, "github_cleanup_pending");
  assert.equal(JSON.stringify(receipt).includes("must/not/survive"), false);
});

test("rejects contradictory or unknown receipt states", () => {
  for (const receipt of [
    { productionResult: "unknown" },
    { productionResult: "applied_validated", hostCredentialCleanup: "failed", closeout: "complete" },
    { productionResult: "applied_validated", hostCredentialCleanup: "verified", closeout: "complete" }
  ]) {
    assert.throws(
      () => validateExecutionReceipt({
        schemaVersion: "1",
        type: "japan_tuic_additive_repair_execution",
        candidate: JAPAN_TUIC_REPAIR_GATE.candidate,
        identityAfter: JAPAN_TUIC_REPAIR_GATE.after,
        naturalObservation: { accepted: true, capturedAt: "2026-07-16T20:05:00.000Z", collectorCount: 5, unresolvedTotal: 1, japanTuicUnresolved: 0 },
        ...receipt
      }),
      (error) => error.code === "receipt_validation_failed"
    );
  }
  assert.throws(
    () => validateExecutionReceipt({
      schemaVersion: "1",
      type: "japan_tuic_additive_repair_execution",
      productionResult: "rolled_back_validated",
      hostCredentialCleanup: "verified",
      closeout: "github_cleanup_pending",
      error: "natural_observation_failed"
    }),
    (error) => error.code === "receipt_validation_failed"
  );
  assert.throws(
    () => validateExecutionReceipt({
      schemaVersion: "1",
      type: "japan_tuic_additive_repair_execution",
      productionResult: "applied_validated",
      hostCredentialCleanup: "verified",
      closeout: "github_cleanup_pending",
      candidate: JAPAN_TUIC_REPAIR_GATE.candidate,
      identityAfter: JAPAN_TUIC_REPAIR_GATE.after,
      naturalObservation: {
        accepted: true,
        capturedAt: "2026-07-16T20:05:00.000Z",
        collectorCount: -1,
        unresolvedTotal: -1,
        japanTuicUnresolved: 0
      }
    }),
    (error) => error.code === "receipt_validation_failed"
  );
});

test("receipt CLI emits only the validated whitelist", () => {
  const directory = mkdtempSync(join(tmpdir(), "gccgw-japan-receipt-"));
  test.after(() => rmSync(directory, { recursive: true, force: true }));
  const inputPath = join(directory, "receipt.json");
  writeFileSync(inputPath, JSON.stringify({
    schemaVersion: "1",
    type: "japan_tuic_additive_repair_execution",
    productionResult: "stopped_pre_apply",
    hostCredentialCleanup: "verified",
    closeout: "github_cleanup_pending",
    error: "expected_count_mismatch",
    protected: "/hidden/path"
  }));
  let stdout = "";
  let stderr = "";
  const exitCode = runJapanTuicRepairContractCli({
    argv: ["receipt", "--input", inputPath],
    stdout: { write: (value) => { stdout += value; } },
    stderr: { write: (value) => { stderr += value; } }
  });
  assert.equal(exitCode, 0);
  assert.equal(stderr, "");
  assert.equal(JSON.parse(stdout).productionResult, "stopped_pre_apply");
  assert.equal(stdout.includes("hidden"), false);
});

test("artifact CLI fails safely without exposing a mismatched manifest or path", () => {
  const directory = mkdtempSync(join(tmpdir(), "gccgw-japan-artifact-"));
  test.after(() => rmSync(directory, { recursive: true, force: true }));
  const artifactPath = join(directory, "artifact.zip");
  const manifestPath = join(directory, "artifact.json");
  writeFileSync(artifactPath, ARTIFACT_BYTES);
  writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: "1",
    releaseUnit: "control-plane-app",
    sourceCommit: "protected-source-value",
    artifact: {
      fileName: "protected-file-value",
      sha256: "protected-digest-value",
      sizeBytes: Buffer.byteLength(ARTIFACT_BYTES)
    }
  }));
  let stdout = "";
  let stderr = "";
  const exitCode = runJapanTuicRepairContractCli({
    argv: ["artifact", "--manifest", manifestPath, "--artifact", artifactPath, "--run-id", "29495150692"],
    stdout: { write: (value) => { stdout += value; } },
    stderr: { write: (value) => { stderr += value; } }
  });
  assert.equal(exitCode, 1);
  assert.equal(stdout, "");
  assert.equal(JSON.parse(stderr).error, "artifact_identity_mismatch");
  assert.doesNotMatch(stderr, /protected|artifact\.zip|gccgw-japan/);
  assert.equal(readFileSync(artifactPath, "utf8"), ARTIFACT_BYTES);
});
