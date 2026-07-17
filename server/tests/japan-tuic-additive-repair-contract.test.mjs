import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";

import * as repairContract from "../../scripts/japan-tuic-additive-repair-contract.mjs";

import {
  JAPAN_TUIC_REPAIR_GATE,
  JAPAN_TUIC_REPAIR_GATE_V3,
  buildOperationControl,
  runJapanTuicRepairContractCli,
  validateArtifactIdentity,
  validateCandidateReport,
  validateCloseoutReceipt,
  validateExecuteReceipt,
  validateExecutionReceipt,
  validateInspectReceipt,
  validateNaturalObservation,
  validateOperationControl,
  validatePostApplyIdentity
} from "../../scripts/japan-tuic-additive-repair-contract.mjs";

import { readRepairFrame } from "../../scripts/japan-tuic-additive-repair-frame.mjs";
import { EXPECTED_NONCE_SHA256, executionNonceSha256 } from "../../scripts/japan-tuic-additive-repair-state.mjs";

const ARTIFACT_BYTES = "approved-artifact-bytes";

const approvalBundle = (overrides = {}) => JSON.stringify({
  schemaVersion: "1",
  gateId: "github-actions-japan-tuic-additive-repair-20260716-001",
  repository: "gccwebos-com/proxy-gateway-minimal",
  workflowRef: "gccwebos-com/proxy-gateway-minimal/.github/workflows/japan-runtime-config-additive-repair.yml@refs/heads/master",
  workflowCommit: "a".repeat(40),
  runId: "29510000000",
  runAttempt: "1",
  artifactSha256: "d6c0663c9a7c82c6e8ffb7d354e2a4c23d26f3339586533df5c268b887b839fd",
  target: "vultr-japan-production",
  issuedAt: "2026-07-16T20:00:00.000Z",
  expiresAt: "2026-07-16T20:15:00.000Z",
  ...overrides
});

const currentApprovalRun = (overrides = {}) => ({
  repository: "gccwebos-com/proxy-gateway-minimal",
  workflowRef: "gccwebos-com/proxy-gateway-minimal/.github/workflows/japan-runtime-config-additive-repair.yml@refs/heads/master",
  workflowCommit: "a".repeat(40),
  runId: "29510000000",
  runAttempt: "1",
  ...overrides
});

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

const V3_WORKFLOW_COMMIT = "b".repeat(40);
const V3_OBSERVATION = Object.freeze({
  accepted: true,
  capturedAt: "2026-07-17T20:05:00.000Z",
  collectorCount: 5,
  unresolvedTotal: 1,
  japanTuicUnresolved: 0
});
const CLAIMED_NONTERMINAL_PHASES = Object.freeze([
  "prepared",
  "claimed",
  "backup_ready",
  "apply_intent",
  "applied",
  "observing",
  "rollback_intent"
]);
const INSPECT_BLOCKED_ERRORS = Object.freeze([
  "artifact_identity_mismatch",
  "backup_failed",
  "execution_claim_mismatch",
  "host_lock_busy",
  "natural_observation_failed",
  "natural_observation_timeout",
  "post_apply_invariant_failed",
  "receipt_validation_failed",
  "restricted_identity_rejected",
  "rollback_verification_failed",
  "stable_snapshot_unavailable",
  "target_identity_mismatch",
  "workflow_identity_mismatch"
]);
const EXECUTE_ERRORS = Object.freeze([...INSPECT_BLOCKED_ERRORS, "atomic_apply_failed"]);
const CLOSEOUT_INDETERMINATE_ERRORS = Object.freeze([
  "closeout_receipt_lost",
  "host_cleanup_failed",
  "receipt_validation_failed"
]);
const CLOSEOUT_BLOCKED_ERRORS = Object.freeze([
  "execution_claim_mismatch",
  "host_cleanup_failed",
  "host_lock_busy",
  "receipt_validation_failed",
  "restricted_identity_rejected",
  "workflow_identity_mismatch"
]);

const inspectReceiptV3 = (overrides = {}) => ({
  schemaVersion: "3",
  type: "japan_tuic_additive_repair_inspection",
  inspectionResult: "ready_unclaimed_revalidation_required",
  journalPhase: null,
  terminalResult: null,
  candidate: JAPAN_TUIC_REPAIR_GATE_V3.candidate,
  identity: JAPAN_TUIC_REPAIR_GATE_V3.before,
  error: null,
  ...overrides
});

const executeReceiptV3 = (overrides = {}) => ({
  schemaVersion: "3",
  type: "japan_tuic_additive_repair_execution",
  productionResult: "applied_validated",
  journalPhase: "applied_validated",
  terminalResult: "applied_validated",
  closeoutEligible: true,
  rollbackVerified: false,
  candidate: JAPAN_TUIC_REPAIR_GATE_V3.candidate,
  identity: JAPAN_TUIC_REPAIR_GATE_V3.after,
  naturalObservation: V3_OBSERVATION,
  error: null,
  ...overrides
});

const closeoutReceiptV3 = (overrides = {}) => ({
  schemaVersion: "3",
  type: "japan_tuic_additive_repair_closeout",
  closeoutResult: "authorization_removed",
  terminalResult: "applied_validated",
  hostAuthorizationCleanup: "verified",
  githubCleanup: "pending",
  error: null,
  ...overrides
});

function captureCli(argv) {
  const stdout = [];
  let stderr = "";
  const exitCode = runJapanTuicRepairContractCli({
    argv,
    stdout: { write: (value) => { stdout.push(Buffer.from(value)); } },
    stderr: { write: (value) => { stderr += value; } }
  });
  return { exitCode, stdout: Buffer.concat(stdout), stderr };
}

test("freezes the reviewed basis, planned execution gate, artifact, and additive counts", () => {
  assert.equal(validateArtifactIdentity(artifact()).ok, true);
  assert.equal(validateCandidateReport(candidate()).candidateReady, true);
  assert.equal(JAPAN_TUIC_REPAIR_GATE.gateBasis, "japan-tuic-identity-additive-repair-20260716-002");
  assert.equal(JAPAN_TUIC_REPAIR_GATE.executionGateId, "github-actions-japan-tuic-additive-repair-20260716-001");
  assert.equal(JAPAN_TUIC_REPAIR_GATE.target, "vultr-japan-production");
  assert.equal(JAPAN_TUIC_REPAIR_GATE.strategy, "additive_missing_only");
});

test("accepts only an exact unexpired Environment-issued approval for this run attempt", () => {
  assert.equal(typeof repairContract.validateExecutionApproval, "function");
  assert.deepEqual(repairContract.validateExecutionApproval({
    bundle: approvalBundle(),
    current: currentApprovalRun(),
    now: "2026-07-16T20:00:00.000Z"
  }), {
    ok: true,
    type: "japan_tuic_execution_approval"
  });

  for (const [bundleOverrides, currentOverrides, now] of [
    [{ extraField: "not-allowed" }, {}, "2026-07-16T20:00:00.000Z"],
    [{ gateId: "replayable-public-text" }, {}, "2026-07-16T20:00:00.000Z"],
    [{ repository: "other/repository" }, {}, "2026-07-16T20:00:00.000Z"],
    [{ workflowRef: "other/workflow@refs/heads/master" }, {}, "2026-07-16T20:00:00.000Z"],
    [{ workflowCommit: "b".repeat(40) }, {}, "2026-07-16T20:00:00.000Z"],
    [{ runId: "29510000001" }, {}, "2026-07-16T20:00:00.000Z"],
    [{ runAttempt: "2" }, {}, "2026-07-16T20:00:00.000Z"],
    [{ artifactSha256: "f".repeat(64) }, {}, "2026-07-16T20:00:00.000Z"],
    [{ target: "control-plane-app" }, {}, "2026-07-16T20:00:00.000Z"],
    [{ issuedAt: "2026-07-16T20:00:00Z" }, {}, "2026-07-16T20:00:00.000Z"],
    [{ issuedAt: "2026-07-16T20:00:00.001Z" }, {}, "2026-07-16T20:00:00.000Z"],
    [{ issuedAt: "2026-07-15T20:15:00.000Z" }, {}, "2026-07-16T20:00:00.000Z"],
    [{ issuedAt: "2026-07-16T19:44:59.999Z" }, {}, "2026-07-16T20:00:00.000Z"],
    [{ issuedAt: "2026-07-16T20:10:00.000Z", expiresAt: "2026-07-16T20:05:00.000Z" }, {}, "2026-07-16T20:00:00.000Z"],
    [{ expiresAt: "2026-07-16T19:59:59.000Z" }, {}, "2026-07-16T20:00:00.000Z"],
    [{ expiresAt: "2026-07-16T20:30:00.001Z" }, {}, "2026-07-16T20:00:00.000Z"],
    [{}, { runAttempt: "2" }, "2026-07-16T20:00:00.000Z"]
  ]) {
    assert.throws(
      () => repairContract.validateExecutionApproval({
        bundle: approvalBundle(bundleOverrides),
        current: currentApprovalRun(currentOverrides),
        now
      }),
      (error) => error.code === "approval_identity_mismatch"
    );
  }

  const missingIssuedAt = JSON.parse(approvalBundle());
  delete missingIssuedAt.issuedAt;
  assert.throws(
    () => repairContract.validateExecutionApproval({
      bundle: JSON.stringify(missingIssuedAt),
      current: currentApprovalRun(),
      now: "2026-07-16T20:00:00.000Z"
    }),
    (error) => error.code === "approval_identity_mismatch"
  );

  for (const bundle of [undefined, "", "not-json", "[]", "null"]) {
    assert.throws(
      () => repairContract.validateExecutionApproval({
        bundle,
        current: currentApprovalRun(),
        now: "2026-07-16T20:00:00.000Z"
      }),
      (error) => error.code === "approval_identity_mismatch"
        && error.message === "approval_identity_mismatch"
    );
  }
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

test("receipt CLI emits only the validated whitelist", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "gccgw-japan-receipt-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
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

test("artifact CLI fails safely without exposing a mismatched manifest or path", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "gccgw-japan-artifact-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
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

test("freezes the Mode 1 gate and builds only canonical operation controls", () => {
  assert.equal(JAPAN_TUIC_REPAIR_GATE_V3.schemaVersion, "3");
  assert.equal(
    JAPAN_TUIC_REPAIR_GATE_V3.executionGateId,
    "github-actions-japan-tuic-additive-repair-20260717-001"
  );
  assert.equal(executionNonceSha256(JAPAN_TUIC_REPAIR_GATE_V3.executionNonce), EXPECTED_NONCE_SHA256);
  assert.equal(JAPAN_TUIC_REPAIR_GATE_V3.expectedNonceSha256, EXPECTED_NONCE_SHA256);

  assert.deepEqual(buildOperationControl({
    operation: "execute",
    workflowCommit: V3_WORKFLOW_COMMIT,
    runAttempt: "1"
  }), {
    executionGateId: "github-actions-japan-tuic-additive-repair-20260717-001",
    executionNonce: "88a2bb9923bb67a0893b2abcd3d30c951c3041a938583026526c78a5d223d00b",
    operation: "execute",
    runAttempt: "1",
    schemaVersion: "3",
    workflowCommit: V3_WORKFLOW_COMMIT
  });
  assert.deepEqual(buildOperationControl({
    operation: "inspect",
    workflowCommit: V3_WORKFLOW_COMMIT,
    runAttempt: "27"
  }), {
    operation: "inspect",
    runAttempt: "27",
    schemaVersion: "3",
    workflowCommit: V3_WORKFLOW_COMMIT
  });
  assert.equal(buildOperationControl({
    operation: "closeout",
    workflowCommit: V3_WORKFLOW_COMMIT,
    runAttempt: "1"
  }).operation, "closeout");

  for (const operation of ["execute", "closeout"]) {
    assert.throws(
      () => buildOperationControl({ operation, workflowCommit: V3_WORKFLOW_COMMIT, runAttempt: "2" }),
      { code: "workflow_identity_mismatch" }
    );
  }
  for (const input of [
    { operation: "inspect", workflowCommit: V3_WORKFLOW_COMMIT, runAttempt: "0" },
    { operation: "inspect", workflowCommit: V3_WORKFLOW_COMMIT, runAttempt: "01" },
    { operation: "inspect", workflowCommit: V3_WORKFLOW_COMMIT.toUpperCase(), runAttempt: "1" },
    { operation: "other", workflowCommit: V3_WORKFLOW_COMMIT, runAttempt: "1" }
  ]) {
    assert.throws(() => buildOperationControl(input), { code: "workflow_identity_mismatch" });
  }

  const execute = buildOperationControl({
    operation: "execute",
    workflowCommit: V3_WORKFLOW_COMMIT,
    runAttempt: "1"
  });
  assert.deepEqual(validateOperationControl(execute), execute);
  assert.throws(
    () => validateOperationControl({ ...execute, executionNonce: "f".repeat(64) }),
    { code: "execution_claim_mismatch" }
  );
  assert.throws(
    () => validateOperationControl({ ...execute, endpoint: "example.invalid:22" }),
    (error) => error.code === "workflow_identity_mismatch"
      && !error.message.includes("example.invalid")
  );
});

test("validates every exact Mode 1 inspect receipt row", () => {
  for (const journalPhase of [null, "prepared"]) {
    const receipt = inspectReceiptV3({ journalPhase });
    assert.deepEqual(validateInspectReceipt(receipt), receipt);
  }
  for (const journalPhase of CLAIMED_NONTERMINAL_PHASES) {
    const receipt = inspectReceiptV3({
      inspectionResult: "claimed_nonterminal",
      journalPhase,
      candidate: null,
      identity: null
    });
    assert.deepEqual(validateInspectReceipt(receipt), receipt);
  }
  for (const [journalPhase, identity] of [
    ["applied_validated", JAPAN_TUIC_REPAIR_GATE_V3.after],
    ["rolled_back_validated", JAPAN_TUIC_REPAIR_GATE_V3.before]
  ]) {
    const receipt = inspectReceiptV3({
      inspectionResult: "terminal_reconciled",
      journalPhase,
      terminalResult: journalPhase,
      candidate: null,
      identity
    });
    assert.deepEqual(validateInspectReceipt(receipt), receipt);
  }
  for (const error of [null, "stable_snapshot_unavailable"]) {
    const receipt = inspectReceiptV3({
      inspectionResult: "indeterminate_reconciled",
      journalPhase: "indeterminate",
      terminalResult: "indeterminate",
      candidate: null,
      identity: null,
      error
    });
    assert.deepEqual(validateInspectReceipt(receipt), receipt);
  }
  for (const error of INSPECT_BLOCKED_ERRORS) {
    const receipt = inspectReceiptV3({
      inspectionResult: "inspection_blocked",
      candidate: null,
      identity: null,
      error
    });
    assert.deepEqual(validateInspectReceipt(receipt), receipt);
  }
});

test("rejects non-matrix inspect receipts and unsafe primitive or aggregate values", () => {
  const invalid = [
    { ...inspectReceiptV3(), unknown: true },
    { ...inspectReceiptV3(), executionNonce: JAPAN_TUIC_REPAIR_GATE_V3.executionNonce },
    inspectReceiptV3({ journalPhase: "claimed" }),
    inspectReceiptV3({ inspectionResult: "claimed_nonterminal", journalPhase: "indeterminate", candidate: null, identity: null }),
    inspectReceiptV3({ inspectionResult: "terminal_reconciled", journalPhase: "applied_validated", terminalResult: "rolled_back_validated", candidate: null, identity: JAPAN_TUIC_REPAIR_GATE_V3.after }),
    inspectReceiptV3({ inspectionResult: "inspection_blocked", candidate: null, identity: null, error: null }),
    inspectReceiptV3({ inspectionResult: "inspection_blocked", candidate: null, identity: null, error: "atomic_apply_failed" }),
    inspectReceiptV3({ inspectionResult: "inspection_blocked", candidate: null, identity: null, error: "/protected/path" }),
    inspectReceiptV3({ inspectionResult: "inspection_blocked", candidate: null, identity: null, error: "https://endpoint.invalid" }),
    inspectReceiptV3({ inspectionResult: "inspection_blocked", candidate: null, identity: null, error: "line1\nline2" }),
    inspectReceiptV3({ candidate: { ...JAPAN_TUIC_REPAIR_GATE_V3.candidate, extra: 1 } }),
    inspectReceiptV3({ identity: { ...JAPAN_TUIC_REPAIR_GATE_V3.before, mappedCount: "52" } })
  ];
  for (const receipt of invalid) {
    assert.throws(
      () => validateInspectReceipt(receipt),
      (error) => error.code === "receipt_validation_failed"
        && !/protected|endpoint\.invalid|line1/.test(error.message)
    );
  }
});

test("validates every exact Mode 1 execute receipt result and phase row", () => {
  assert.deepEqual(validateExecuteReceipt(executeReceiptV3()), executeReceiptV3());

  for (const error of EXECUTE_ERRORS) {
    const rolledBack = executeReceiptV3({
      productionResult: "rolled_back_validated",
      journalPhase: "rolled_back_validated",
      terminalResult: "rolled_back_validated",
      rollbackVerified: true,
      identity: JAPAN_TUIC_REPAIR_GATE_V3.before,
      naturalObservation: null,
      error
    });
    assert.deepEqual(validateExecuteReceipt(rolledBack), rolledBack);
  }
  for (const journalPhase of [null, "prepared"]) {
    const stopped = executeReceiptV3({
      productionResult: "stopped_pre_claim",
      journalPhase,
      terminalResult: null,
      closeoutEligible: false,
      candidate: null,
      identity: null,
      naturalObservation: null,
      error: "stable_snapshot_unavailable"
    });
    assert.deepEqual(validateExecuteReceipt(stopped), stopped);
  }
  for (const journalPhase of CLAIMED_NONTERMINAL_PHASES) {
    const replay = executeReceiptV3({
      productionResult: "replay_reconciled",
      journalPhase,
      terminalResult: null,
      closeoutEligible: false,
      candidate: null,
      identity: null,
      naturalObservation: null
    });
    assert.deepEqual(validateExecuteReceipt(replay), replay);

    const indeterminate = executeReceiptV3({
      productionResult: "indeterminate",
      journalPhase,
      terminalResult: null,
      closeoutEligible: false,
      candidate: null,
      identity: null,
      naturalObservation: null,
      error: "receipt_validation_failed"
    });
    assert.deepEqual(validateExecuteReceipt(indeterminate), indeterminate);
  }
  for (const [journalPhase, rollbackVerified, identity] of [
    ["applied_validated", false, JAPAN_TUIC_REPAIR_GATE_V3.after],
    ["rolled_back_validated", true, JAPAN_TUIC_REPAIR_GATE_V3.before]
  ]) {
    const replay = executeReceiptV3({
      productionResult: "replay_reconciled",
      journalPhase,
      terminalResult: journalPhase,
      rollbackVerified,
      candidate: null,
      identity,
      naturalObservation: null
    });
    assert.deepEqual(validateExecuteReceipt(replay), replay);
  }
  const nullPhaseIndeterminate = executeReceiptV3({
    productionResult: "indeterminate",
    journalPhase: null,
    terminalResult: null,
    closeoutEligible: false,
    candidate: null,
    identity: null,
    naturalObservation: null,
    error: "receipt_validation_failed"
  });
  assert.deepEqual(validateExecuteReceipt(nullPhaseIndeterminate), nullPhaseIndeterminate);
  for (const error of [null, "atomic_apply_failed"]) {
    const durableIndeterminate = executeReceiptV3({
      productionResult: "indeterminate",
      journalPhase: "indeterminate",
      terminalResult: "indeterminate",
      closeoutEligible: false,
      candidate: null,
      identity: null,
      naturalObservation: null,
      error
    });
    assert.deepEqual(validateExecuteReceipt(durableIndeterminate), durableIndeterminate);
  }
});

test("rejects contradictory execute profiles, noncanonical time, and operation-unsafe errors", () => {
  const invalid = [
    { ...executeReceiptV3(), unknown: true },
    executeReceiptV3({ closeoutEligible: false }),
    executeReceiptV3({ rollbackVerified: true }),
    executeReceiptV3({ naturalObservation: { ...V3_OBSERVATION, capturedAt: "2026-07-17T20:05:00Z" } }),
    executeReceiptV3({ naturalObservation: { ...V3_OBSERVATION, capturedAt: "2026-07-17T20:05:00.000+00:00" } }),
    executeReceiptV3({ naturalObservation: { ...V3_OBSERVATION, capturedAt: "2026-02-30T20:05:00.000Z" } }),
    executeReceiptV3({ productionResult: "replay_reconciled", journalPhase: "applied_validated", terminalResult: "applied_validated", candidate: null, naturalObservation: null, error: "receipt_validation_failed" }),
    executeReceiptV3({ productionResult: "replay_reconciled", journalPhase: "indeterminate", terminalResult: "indeterminate", closeoutEligible: false, candidate: null, identity: null, naturalObservation: null }),
    executeReceiptV3({ productionResult: "indeterminate", journalPhase: null, terminalResult: null, closeoutEligible: false, candidate: null, identity: null, naturalObservation: null, error: null }),
    executeReceiptV3({ productionResult: "indeterminate", journalPhase: "applied_validated", terminalResult: "applied_validated", closeoutEligible: false, candidate: null, identity: null, naturalObservation: null, error: "post_apply_invariant_failed" }),
    executeReceiptV3({ productionResult: "rolled_back_validated", journalPhase: "rolled_back_validated", terminalResult: "rolled_back_validated", rollbackVerified: true, identity: JAPAN_TUIC_REPAIR_GATE_V3.before, naturalObservation: null, error: "host_cleanup_failed" }),
    executeReceiptV3({ productionResult: "stopped_pre_claim", journalPhase: null, terminalResult: null, closeoutEligible: false, candidate: null, identity: null, naturalObservation: null, error: "closeout_receipt_lost" })
  ];
  for (const receipt of invalid) {
    assert.throws(() => validateExecuteReceipt(receipt), { code: "receipt_validation_failed" });
  }
});

test("validates every exact Mode 1 closeout receipt row and safe subset", () => {
  for (const terminalResult of ["applied_validated", "rolled_back_validated"]) {
    const removed = closeoutReceiptV3({ terminalResult });
    assert.deepEqual(validateCloseoutReceipt(removed), removed);
  }
  for (const terminalResult of [null, "applied_validated", "rolled_back_validated"]) {
    for (const error of CLOSEOUT_INDETERMINATE_ERRORS) {
      const indeterminate = closeoutReceiptV3({
        closeoutResult: "cleanup_indeterminate",
        terminalResult,
        hostAuthorizationCleanup: "unknown",
        error
      });
      assert.deepEqual(validateCloseoutReceipt(indeterminate), indeterminate);
    }
  }
  for (const terminalResult of [null, "applied_validated", "rolled_back_validated", "indeterminate"]) {
    for (const error of CLOSEOUT_BLOCKED_ERRORS) {
      const blocked = closeoutReceiptV3({
        closeoutResult: "closeout_blocked",
        terminalResult,
        hostAuthorizationCleanup: "retained",
        error
      });
      assert.deepEqual(validateCloseoutReceipt(blocked), blocked);
    }
  }
});

test("rejects contradictory closeout cleanup evidence and unsafe errors", () => {
  const invalid = [
    { ...closeoutReceiptV3(), unknown: true },
    closeoutReceiptV3({ terminalResult: null }),
    closeoutReceiptV3({ hostAuthorizationCleanup: "retained" }),
    closeoutReceiptV3({ githubCleanup: "complete" }),
    closeoutReceiptV3({ error: "host_cleanup_failed" }),
    closeoutReceiptV3({ closeoutResult: "cleanup_indeterminate", hostAuthorizationCleanup: "unknown", error: "host_lock_busy" }),
    closeoutReceiptV3({ closeoutResult: "closeout_blocked", hostAuthorizationCleanup: "retained", error: "closeout_receipt_lost" }),
    closeoutReceiptV3({ closeoutResult: "closeout_blocked", terminalResult: "prepared", hostAuthorizationCleanup: "retained", error: "host_lock_busy" }),
    closeoutReceiptV3({ closeoutResult: "cleanup_indeterminate", hostAuthorizationCleanup: "unknown", error: "/protected/path" })
  ];
  for (const receipt of invalid) {
    assert.throws(() => validateCloseoutReceipt(receipt), { code: "receipt_validation_failed" });
  }
});

test("Mode 1 frame CLI emits Task 1 binary frames and fails without exposing artifact paths", async (t) => {
  const closeout = captureCli([
    "frame",
    "--operation", "closeout",
    "--workflow-commit", V3_WORKFLOW_COMMIT,
    "--run-attempt", "1"
  ]);
  assert.equal(closeout.exitCode, 0);
  assert.equal(closeout.stderr, "");
  const decoded = await readRepairFrame(Readable.from([closeout.stdout]), { expectedArtifactSize: 0 });
  assert.deepEqual(decoded.control, buildOperationControl({
    operation: "closeout",
    workflowCommit: V3_WORKFLOW_COMMIT,
    runAttempt: "1"
  }));
  assert.equal(decoded.artifact.length, 0);

  const directory = mkdtempSync(join(tmpdir(), "gccgw-japan-frame-v3-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const protectedPath = join(directory, "protected-artifact.zip");
  writeFileSync(protectedPath, "wrong artifact");
  for (const argv of [
    ["frame", "--operation", "inspect", "--workflow-commit", V3_WORKFLOW_COMMIT, "--run-attempt", "2", "--artifact", protectedPath],
    ["frame", "--operation", "execute", "--workflow-commit", V3_WORKFLOW_COMMIT, "--run-attempt", "1", "--artifact", protectedPath],
    ["frame", "--operation", "inspect", "--workflow-commit", V3_WORKFLOW_COMMIT, "--run-attempt", "2"]
  ]) {
    const result = captureCli(argv);
    assert.equal(result.exitCode, 1);
    assert.equal(result.stdout.length, 0);
    assert.match(result.stderr, /artifact_identity_mismatch/);
    assert.doesNotMatch(result.stderr, /protected-artifact|gccgw-japan-frame/);
  }
});

test("Mode 1 receipt CLI synthesizes exact fail-closed transport evidence without reading input", () => {
  const protectedMissingPath = join(tmpdir(), "must-not-be-opened-protected-receipt.json");
  const cases = [
    ["inspect", "75", inspectReceiptV3({ inspectionResult: "inspection_blocked", candidate: null, identity: null, error: "host_lock_busy" })],
    ["execute", "75", executeReceiptV3({ productionResult: "indeterminate", journalPhase: null, terminalResult: null, closeoutEligible: false, candidate: null, identity: null, naturalObservation: null, error: "host_lock_busy" })],
    ["closeout", "75", closeoutReceiptV3({ closeoutResult: "closeout_blocked", terminalResult: null, hostAuthorizationCleanup: "retained", error: "host_lock_busy" })],
    ["inspect", "1", inspectReceiptV3({ inspectionResult: "inspection_blocked", candidate: null, identity: null, error: "receipt_validation_failed" })],
    ["execute", "255", executeReceiptV3({ productionResult: "indeterminate", journalPhase: null, terminalResult: null, closeoutEligible: false, candidate: null, identity: null, naturalObservation: null, error: "receipt_validation_failed" })],
    ["closeout", "2", closeoutReceiptV3({ closeoutResult: "cleanup_indeterminate", terminalResult: null, hostAuthorizationCleanup: "unknown", error: "closeout_receipt_lost" })]
  ];
  for (const [operation, status, expected] of cases) {
    const result = captureCli([
      "receipt",
      "--operation", operation,
      "--input", protectedMissingPath,
      "--ssh-status", status
    ]);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout.toString("utf8"), `${JSON.stringify(expected)}\n`);
    assert.doesNotMatch(result.stdout.toString("utf8"), /must-not-be-opened|protected-receipt/);
  }
});

test("Mode 1 receipt CLI accepts only one canonical bounded UTF-8 JSON line", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "gccgw-japan-receipt-v3-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const validPath = join(directory, "valid.json");
  const validLine = `${JSON.stringify(inspectReceiptV3())}\n`;
  writeFileSync(validPath, validLine);
  const valid = captureCli([
    "receipt",
    "--operation", "inspect",
    "--input", validPath,
    "--ssh-status", "0"
  ]);
  assert.equal(valid.exitCode, 0);
  assert.equal(valid.stderr, "");
  assert.equal(valid.stdout.toString("utf8"), validLine);

  const invalidInputs = [
    ["empty.json", ""],
    ["bom.json", Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(validLine, "utf8")
    ])],
    ["invalid-utf8.json", Buffer.from([0xc3, 0x28, 0x0a])],
    ["no-lf.json", JSON.stringify(inspectReceiptV3())],
    ["crlf.json", `${JSON.stringify(inspectReceiptV3())}\r\n`],
    ["two-lines.json", `${JSON.stringify(inspectReceiptV3())}\n${JSON.stringify(inspectReceiptV3())}\n`],
    ["pretty.json", `${JSON.stringify(inspectReceiptV3(), null, 2)}\n`],
    ["trailing.json", `${JSON.stringify(inspectReceiptV3())}\nextra`],
    ["reordered.json", `${JSON.stringify({ type: inspectReceiptV3().type, schemaVersion: "3", inspectionResult: "ready_unclaimed_revalidation_required", journalPhase: null, terminalResult: null, candidate: JAPAN_TUIC_REPAIR_GATE_V3.candidate, identity: JAPAN_TUIC_REPAIR_GATE_V3.before, error: null })}\n`],
    ["multiline-error.json", `${JSON.stringify(inspectReceiptV3({ inspectionResult: "inspection_blocked", candidate: null, identity: null, error: "raw\nerror" }))}\n`],
    ["oversized.json", "x".repeat(65537)]
  ];
  const expected = inspectReceiptV3({
    inspectionResult: "inspection_blocked",
    candidate: null,
    identity: null,
    error: "receipt_validation_failed"
  });
  for (const [name, contents] of invalidInputs) {
    const inputPath = join(directory, name);
    writeFileSync(inputPath, contents);
    const result = captureCli([
      "receipt",
      "--operation", "inspect",
      "--input", inputPath,
      "--ssh-status", "0"
    ]);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout.toString("utf8"), `${JSON.stringify(expected)}\n`);
    assert.doesNotMatch(result.stdout.toString("utf8"), /raw|oversized|gccgw-japan-receipt-v3/);
  }
});

test("Mode 1 receipt CLI rejects noncanonical status and argument shapes with one safe failure", () => {
  for (const argv of [
    ["receipt", "--operation", "inspect", "--input", "protected", "--ssh-status", ""],
    ["receipt", "--operation", "inspect", "--input", "protected", "--ssh-status", "01"],
    ["receipt", "--operation", "inspect", "--input", "protected", "--ssh-status", "-1"],
    ["receipt", "--operation", "inspect", "--input", "protected", "--ssh-status", "256"],
    ["receipt", "--operation", "other", "--input", "protected", "--ssh-status", "0"],
    ["receipt", "--operation", "inspect", "--input", "protected", "--ssh-status", "0", "--extra", "endpoint.invalid"]
  ]) {
    const result = captureCli(argv);
    assert.equal(result.exitCode, 1);
    assert.equal(result.stdout.length, 0);
    assert.equal(result.stderr, `${JSON.stringify({ ok: false, error: "receipt_validation_failed" })}\n`);
    assert.doesNotMatch(result.stderr, /protected|endpoint\.invalid/);
  }
});
