#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ARTIFACT_SHA256 = "d6c0663c9a7c82c6e8ffb7d354e2a4c23d26f3339586533df5c268b887b839fd";
const TOOL_SOURCE_COMMIT = "47a2a9583fb44cb905e91aade02ae5aa3d635d94";
const APPROVAL_MAX_TTL_MS = 30 * 60 * 1000;
const SAFE_RECEIPT_ERRORS = new Set([
  "artifact_identity_mismatch",
  "atomic_apply_failed",
  "backup_failed",
  "expected_count_mismatch",
  "host_cleanup_failed",
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

export const JAPAN_TUIC_REPAIR_GATE = Object.freeze({
  schemaVersion: "1",
  gateBasis: "japan-tuic-identity-additive-repair-20260716-002",
  executionGateId: "github-actions-japan-tuic-additive-repair-20260716-001",
  releaseUnit: "japan-runtime-config",
  target: "vultr-japan-production",
  surface: "japan-tuic",
  strategy: "additive_missing_only",
  artifact: Object.freeze({
    runId: 29495150692,
    fileName: "proxy-gateway-control-plane-cumulative-20260716-003.zip",
    sizeBytes: 4744340,
    sha256: ARTIFACT_SHA256,
    sourceCommit: TOOL_SOURCE_COMMIT
  }),
  candidate: Object.freeze({
    addCount: 3,
    removeCount: 0,
    deferredRemoveCount: 27,
    deferredChangedCount: 0,
    missingMaterialCount: 0,
    projectedMapCount: 82
  }),
  before: Object.freeze({
    runtimeCount: 55,
    mappedCount: 52,
    missing: 3,
    stale: 27,
    changed: 0,
    missingMaterial: 0
  }),
  after: Object.freeze({
    runtimeCount: 55,
    mappedCount: 55,
    missing: 0,
    stale: 27,
    changed: 0,
    missingMaterial: 0,
    retentionState: "pending",
    state: "degraded"
  })
});

export class JapanTuicRepairContractError extends Error {
  constructor(code) {
    super(code);
    this.name = "JapanTuicRepairContractError";
    this.code = code;
  }
}

function safeError(code) {
  return new JapanTuicRepairContractError(code);
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function exactInteger(actual, expected, code) {
  if (!Number.isInteger(actual) || actual !== expected) throw safeError(code);
  return actual;
}

function nonNegativeInteger(actual, code) {
  if (!Number.isInteger(actual) || actual < 0) throw safeError(code);
  return actual;
}

function exactText(actual, expected, code) {
  if (actual !== expected) throw safeError(code);
  return actual;
}

function exactBoolean(actual, expected, code) {
  if (actual !== expected) throw safeError(code);
  return actual;
}

function timestamp(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw safeError(code);
  return new Date(value).toISOString();
}

function validateFrozenFields(input, expected, code) {
  const value = record(input);
  const output = {};
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (Number.isInteger(expectedValue)) output[key] = exactInteger(value[key], expectedValue, code);
    else output[key] = exactText(value[key], expectedValue, code);
  }
  return output;
}

export function validateArtifactIdentity(input = {}) {
  const expected = JAPAN_TUIC_REPAIR_GATE.artifact;
  const value = record(input);
  if (value.runId !== expected.runId
    || value.fileName !== expected.fileName
    || value.sizeBytes !== expected.sizeBytes
    || value.sha256 !== expected.sha256
    || value.sourceCommit !== expected.sourceCommit) {
    throw safeError("artifact_identity_mismatch");
  }
  return { ok: true, ...expected };
}

export function validateExecutionApproval({ bundle, current, now = new Date().toISOString() } = {}) {
  let approval;
  try {
    approval = JSON.parse(bundle);
  } catch {
    throw safeError("approval_identity_mismatch");
  }
  const expectedKeys = [
    "artifactSha256",
    "expiresAt",
    "gateId",
    "issuedAt",
    "repository",
    "runAttempt",
    "runId",
    "schemaVersion",
    "target",
    "workflowCommit",
    "workflowRef"
  ];
  if (!approval || typeof approval !== "object" || Array.isArray(approval)
    || Object.keys(approval).sort().join("\n") !== expectedKeys.join("\n")) {
    throw safeError("approval_identity_mismatch");
  }
  const active = record(current);
  const nowMs = Date.parse(now);
  const issuedAtMs = Date.parse(approval.issuedAt);
  const expiresAtMs = Date.parse(approval.expiresAt);
  const validCurrentIdentity = typeof active.repository === "string"
    && typeof active.workflowRef === "string"
    && /^[0-9a-f]{40}$/.test(active.workflowCommit)
    && /^[1-9][0-9]*$/.test(active.runId)
    && /^[1-9][0-9]*$/.test(active.runAttempt);
  const validExpiry = Number.isFinite(nowMs)
    && Number.isFinite(issuedAtMs)
    && Number.isFinite(expiresAtMs)
    && approval.issuedAt === new Date(issuedAtMs).toISOString()
    && approval.expiresAt === new Date(expiresAtMs).toISOString()
    && issuedAtMs <= nowMs
    && expiresAtMs > nowMs
    && expiresAtMs > issuedAtMs
    && expiresAtMs - issuedAtMs <= APPROVAL_MAX_TTL_MS;
  if (!validCurrentIdentity
    || approval.schemaVersion !== "1"
    || approval.gateId !== JAPAN_TUIC_REPAIR_GATE.executionGateId
    || approval.repository !== active.repository
    || approval.workflowRef !== active.workflowRef
    || approval.workflowCommit !== active.workflowCommit
    || approval.runId !== active.runId
    || approval.runAttempt !== active.runAttempt
    || approval.artifactSha256 !== ARTIFACT_SHA256
    || approval.target !== JAPAN_TUIC_REPAIR_GATE.target
    || !validExpiry) {
    throw safeError("approval_identity_mismatch");
  }
  return { ok: true, type: "japan_tuic_execution_approval" };
}

export function validateCandidateReport(report = {}) {
  const value = record(report);
  exactBoolean(value.ok, true, "expected_count_mismatch");
  exactBoolean(value.candidateReady, true, "expected_count_mismatch");
  const candidate = record(value.candidate);
  const validated = validateFrozenFields(
    candidate,
    JAPAN_TUIC_REPAIR_GATE.candidate,
    "expected_count_mismatch"
  );
  exactBoolean(candidate.ready, true, "expected_count_mismatch");
  return {
    ok: true,
    candidateReady: true,
    candidate: { ...validated, ready: true }
  };
}

export function validatePostApplyIdentity(report = {}) {
  return validateFrozenFields(
    report,
    JAPAN_TUIC_REPAIR_GATE.after,
    "post_apply_invariant_failed"
  );
}

export function validateNaturalObservation(input = {}) {
  const value = record(input);
  const baseline = record(value.baseline);
  const current = record(value.current);
  const applyBoundary = timestamp(value.applyBoundary, "natural_observation_failed");
  const capturedAt = timestamp(current.capturedAt, "natural_observation_failed");
  const baselineCollectorCount = nonNegativeInteger(baseline.collectorCount, "natural_observation_failed");
  const baselineUnresolvedTotal = nonNegativeInteger(baseline.unresolvedTotal, "natural_observation_failed");
  const baselineTimerRestarts = nonNegativeInteger(baseline.timerRestarts, "natural_observation_failed");
  const baselineServiceRestarts = nonNegativeInteger(baseline.serviceRestarts, "natural_observation_failed");
  const currentTimerRestarts = nonNegativeInteger(current.timerRestarts, "natural_observation_failed");
  const currentServiceRestarts = nonNegativeInteger(current.serviceRestarts, "natural_observation_failed");
  const currentCollectorCount = nonNegativeInteger(current.collectorCount, "natural_observation_failed");
  const currentUnresolvedTotal = nonNegativeInteger(current.unresolvedTotal, "natural_observation_failed");
  const accepted = Date.parse(capturedAt) > Date.parse(applyBoundary)
    && current.collectorInvocationObserved === true
    && current.timerActive === true
    && current.timerEnabled === true
    && currentTimerRestarts === baselineTimerRestarts
    && currentServiceRestarts === baselineServiceRestarts
    && currentCollectorCount === baselineCollectorCount
    && currentUnresolvedTotal <= baselineUnresolvedTotal
    && current.japanTuicUnresolved === 0
    && current.omittedCollectorCount === 0
    && current.omittedProducerCount === 0
    && current.provenanceConserved === true
    && current.validatorPassed === true;
  if (!accepted) throw safeError("natural_observation_failed");
  return {
    accepted: true,
    capturedAt,
    collectorCount: currentCollectorCount,
    unresolvedTotal: currentUnresolvedTotal,
    japanTuicUnresolved: 0
  };
}

function validateReceiptNaturalObservation(input) {
  const value = record(input);
  exactBoolean(value.accepted, true, "receipt_validation_failed");
  return {
    accepted: true,
    capturedAt: timestamp(value.capturedAt, "receipt_validation_failed"),
    collectorCount: nonNegativeInteger(value.collectorCount, "receipt_validation_failed"),
    unresolvedTotal: nonNegativeInteger(value.unresolvedTotal, "receipt_validation_failed"),
    japanTuicUnresolved: exactInteger(value.japanTuicUnresolved, 0, "receipt_validation_failed")
  };
}

function validateReceiptCandidate(input) {
  const value = validateFrozenFields(input, JAPAN_TUIC_REPAIR_GATE.candidate, "receipt_validation_failed");
  return value;
}

function validateReceiptIdentity(input) {
  return validateFrozenFields(input, JAPAN_TUIC_REPAIR_GATE.after, "receipt_validation_failed");
}

function safeReceiptError(value) {
  if (typeof value !== "string" || !SAFE_RECEIPT_ERRORS.has(value)) {
    throw safeError("receipt_validation_failed");
  }
  return value;
}

export function validateExecutionReceipt(receipt = {}) {
  const value = record(receipt);
  exactText(value.schemaVersion, "1", "receipt_validation_failed");
  exactText(value.type, "japan_tuic_additive_repair_execution", "receipt_validation_failed");
  const productionResults = new Set([
    "applied_validated",
    "rolled_back_validated",
    "stopped_pre_apply",
    "indeterminate"
  ]);
  if (!productionResults.has(value.productionResult)) throw safeError("receipt_validation_failed");
  if (!new Set(["verified", "failed"]).has(value.hostCredentialCleanup)) {
    throw safeError("receipt_validation_failed");
  }
  if (!new Set(["github_cleanup_pending", "incomplete"]).has(value.closeout)) {
    throw safeError("receipt_validation_failed");
  }
  if (value.hostCredentialCleanup === "failed" && value.closeout !== "incomplete") {
    throw safeError("receipt_validation_failed");
  }
  if (value.hostCredentialCleanup === "verified" && value.closeout !== "github_cleanup_pending") {
    throw safeError("receipt_validation_failed");
  }

  const output = {
    schemaVersion: "1",
    type: "japan_tuic_additive_repair_execution",
    productionResult: value.productionResult,
    hostCredentialCleanup: value.hostCredentialCleanup,
    closeout: value.closeout
  };

  if (value.productionResult === "applied_validated") {
    output.candidate = validateReceiptCandidate(value.candidate);
    output.identityAfter = validateReceiptIdentity(value.identityAfter);
    output.naturalObservation = validateReceiptNaturalObservation(value.naturalObservation);
  } else {
    output.error = safeReceiptError(value.error);
    if (value.productionResult === "rolled_back_validated") {
      exactBoolean(value.rollbackVerified, true, "receipt_validation_failed");
      output.rollbackVerified = true;
    }
  }
  return output;
}

function argValue(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : "";
}

function parseJsonFile(path) {
  const stats = statSync(path);
  if (!stats.isFile() || stats.size <= 0 || stats.size > 64 * 1024) throw safeError("receipt_validation_failed");
  return JSON.parse(readFileSync(path, "utf8"));
}

function artifactIdentityFromFiles({ artifactPath, manifestPath, runId }) {
  const stats = statSync(artifactPath);
  const manifest = record(parseJsonFile(manifestPath));
  const manifestArtifact = record(manifest.artifact);
  const sha256 = createHash("sha256").update(readFileSync(artifactPath)).digest("hex");
  if (manifest.schemaVersion !== "1"
    || manifest.releaseUnit !== "control-plane-app"
    || manifestArtifact.fileName !== basename(artifactPath)
    || manifestArtifact.sizeBytes !== stats.size
    || manifestArtifact.sha256 !== sha256) {
    throw safeError("artifact_identity_mismatch");
  }
  return {
    runId,
    fileName: manifestArtifact.fileName,
    sizeBytes: stats.size,
    sha256,
    sourceCommit: manifest.sourceCommit
  };
}

function writeSafeFailure(stderr, error) {
  const code = error instanceof JapanTuicRepairContractError
    ? error.code
    : "receipt_validation_failed";
  stderr.write(`${JSON.stringify({ ok: false, error: code })}\n`);
}

export function runJapanTuicRepairContractCli({
  argv = process.argv.slice(2),
  env = process.env,
  now = new Date().toISOString(),
  stdout = process.stdout,
  stderr = process.stderr
} = {}) {
  try {
    const command = argv[0];
    if (command === "approval") {
      if (argv.length !== 1) throw safeError("approval_identity_mismatch");
      const approval = validateExecutionApproval({
        bundle: env.JAPAN_CI_APPROVAL_BUNDLE,
        current: {
          repository: env.CURRENT_REPOSITORY,
          workflowRef: env.CURRENT_WORKFLOW_REF,
          workflowCommit: env.CURRENT_WORKFLOW_COMMIT,
          runId: env.CURRENT_RUN_ID,
          runAttempt: env.CURRENT_RUN_ATTEMPT
        },
        now
      });
      stdout.write(`${JSON.stringify(approval)}\n`);
      return 0;
    }
    if (command === "receipt") {
      const inputPath = argValue(argv, "--input");
      if (!inputPath || argv.length !== 3) throw safeError("receipt_validation_failed");
      const receipt = validateExecutionReceipt(parseJsonFile(inputPath));
      stdout.write(`${JSON.stringify(receipt)}\n`);
      return 0;
    }
    if (command === "artifact") {
      const manifestPath = argValue(argv, "--manifest");
      const artifactPath = argValue(argv, "--artifact");
      const runIdText = argValue(argv, "--run-id");
      if (!manifestPath || !artifactPath || !/^\d+$/.test(runIdText) || argv.length !== 7) {
        throw safeError("artifact_identity_mismatch");
      }
      validateArtifactIdentity(artifactIdentityFromFiles({
        artifactPath,
        manifestPath,
        runId: Number(runIdText)
      }));
      stdout.write(`${JSON.stringify({ ok: true, type: "japan_tuic_artifact_preflight" })}\n`);
      return 0;
    }
    throw safeError("receipt_validation_failed");
  } catch (error) {
    writeSafeFailure(stderr, error);
    return 1;
  }
}

function isDirectInvocation() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectInvocation()) {
  process.exitCode = runJapanTuicRepairContractCli();
}
