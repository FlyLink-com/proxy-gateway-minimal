#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalRepairControl, encodeRepairFrame } from "./japan-tuic-additive-repair-frame.mjs";
import {
  EXPECTED_NONCE_SHA256,
  executionClaimSha256,
  executionNonceSha256
} from "./japan-tuic-additive-repair-state.mjs";

const ARTIFACT_SHA256 = "d6c0663c9a7c82c6e8ffb7d354e2a4c23d26f3339586533df5c268b887b839fd";
const TOOL_SOURCE_COMMIT = "47a2a9583fb44cb905e91aade02ae5aa3d635d94";
const APPROVAL_MAX_TTL_MS = 30 * 60 * 1000;
const EXECUTION_NONCE = "88a2bb9923bb67a0893b2abcd3d30c951c3041a938583026526c78a5d223d00b";
const V3_EXECUTION_GATE_ID = "github-actions-japan-tuic-additive-repair-20260717-001";
const CANONICAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const LOWER_COMMIT = /^[0-9a-f]{40}$/;
const POSITIVE_DECIMAL = /^[1-9][0-9]*$/;
const SSH_STATUS = /^(0|[1-9][0-9]{0,2})$/;
const MAX_RECEIPT_BYTES = 65536;
const UTF8 = new TextDecoder("utf-8", { fatal: true });
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

export const JAPAN_TUIC_REPAIR_GATE_V3 = Object.freeze({
  schemaVersion: "3",
  gateBasis: JAPAN_TUIC_REPAIR_GATE.gateBasis,
  executionGateId: V3_EXECUTION_GATE_ID,
  executionNonce: EXECUTION_NONCE,
  expectedNonceSha256: EXPECTED_NONCE_SHA256,
  releaseUnit: JAPAN_TUIC_REPAIR_GATE.releaseUnit,
  target: JAPAN_TUIC_REPAIR_GATE.target,
  surface: JAPAN_TUIC_REPAIR_GATE.surface,
  strategy: JAPAN_TUIC_REPAIR_GATE.strategy,
  artifact: JAPAN_TUIC_REPAIR_GATE.artifact,
  candidate: JAPAN_TUIC_REPAIR_GATE.candidate,
  before: JAPAN_TUIC_REPAIR_GATE.before,
  after: JAPAN_TUIC_REPAIR_GATE.after
});

const CONTROL_INPUT_KEYS = Object.freeze(["operation", "workflowCommit", "runAttempt"]);
const INSPECT_RECEIPT_KEYS = Object.freeze([
  "schemaVersion",
  "type",
  "inspectionResult",
  "journalPhase",
  "terminalResult",
  "candidate",
  "identity",
  "error"
]);
const EXECUTE_RECEIPT_KEYS = Object.freeze([
  "schemaVersion",
  "type",
  "productionResult",
  "journalPhase",
  "terminalResult",
  "closeoutEligible",
  "rollbackVerified",
  "candidate",
  "identity",
  "naturalObservation",
  "error"
]);
const CLOSEOUT_RECEIPT_KEYS = Object.freeze([
  "schemaVersion",
  "type",
  "closeoutResult",
  "terminalResult",
  "hostAuthorizationCleanup",
  "githubCleanup",
  "error"
]);
const CLAIMED_NONTERMINAL_PHASES = new Set([
  "prepared",
  "claimed",
  "backup_ready",
  "apply_intent",
  "applied",
  "observing",
  "rollback_intent"
]);
const V3_SAFE_ERRORS = new Set([
  "artifact_identity_mismatch",
  "atomic_apply_failed",
  "backup_failed",
  "closeout_receipt_lost",
  "execution_claim_mismatch",
  "host_cleanup_failed",
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
const INSPECT_BLOCKED_ERRORS = new Set([
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
const EXECUTE_ERRORS = new Set([...INSPECT_BLOCKED_ERRORS, "atomic_apply_failed"]);
const CLOSEOUT_INDETERMINATE_ERRORS = new Set([
  "closeout_receipt_lost",
  "host_cleanup_failed",
  "receipt_validation_failed"
]);
const CLOSEOUT_BLOCKED_ERRORS = new Set([
  "execution_claim_mismatch",
  "host_cleanup_failed",
  "host_lock_busy",
  "receipt_validation_failed",
  "restricted_identity_rejected",
  "workflow_identity_mismatch"
]);

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

function hasExactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
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

function canonicalTimestamp(value, code) {
  if (typeof value !== "string" || !CANONICAL_TIMESTAMP.test(value)) throw safeError(code);
  const instant = Date.parse(value);
  if (!Number.isFinite(instant) || new Date(value).toISOString() !== value) throw safeError(code);
  return value;
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

function validateExactFrozenFields(input, expected, code = "receipt_validation_failed") {
  const keys = Object.keys(expected);
  if (!hasExactKeys(input, keys)) throw safeError(code);
  return validateFrozenFields(input, expected, code);
}

function validateExactIdentity(input, expected) {
  return validateExactFrozenFields(input, expected);
}

function validateReceiptObservationV3(input) {
  const keys = ["accepted", "capturedAt", "collectorCount", "unresolvedTotal", "japanTuicUnresolved"];
  if (!hasExactKeys(input, keys)) throw safeError("receipt_validation_failed");
  const value = record(input);
  return {
    accepted: exactBoolean(value.accepted, true, "receipt_validation_failed"),
    capturedAt: canonicalTimestamp(value.capturedAt, "receipt_validation_failed"),
    collectorCount: nonNegativeInteger(value.collectorCount, "receipt_validation_failed"),
    unresolvedTotal: nonNegativeInteger(value.unresolvedTotal, "receipt_validation_failed"),
    japanTuicUnresolved: exactInteger(value.japanTuicUnresolved, 0, "receipt_validation_failed")
  };
}

function validateNullableError(value, allowed) {
  if (value === null) return null;
  if (typeof value !== "string" || !allowed.has(value)) throw safeError("receipt_validation_failed");
  return value;
}

function validateRequiredError(value, allowed) {
  const error = validateNullableError(value, allowed);
  if (error === null) throw safeError("receipt_validation_failed");
  return error;
}

function canonicalClaimInput(control) {
  return {
    artifactSha256: JAPAN_TUIC_REPAIR_GATE_V3.artifact.sha256,
    executionGateId: JAPAN_TUIC_REPAIR_GATE_V3.executionGateId,
    executionNonce: JAPAN_TUIC_REPAIR_GATE_V3.executionNonce,
    releaseUnit: JAPAN_TUIC_REPAIR_GATE_V3.releaseUnit,
    strategy: JAPAN_TUIC_REPAIR_GATE_V3.strategy,
    surface: JAPAN_TUIC_REPAIR_GATE_V3.surface,
    target: JAPAN_TUIC_REPAIR_GATE_V3.target,
    workflowCommit: control.workflowCommit
  };
}

export function validateOperationControl(input) {
  let control;
  try {
    control = JSON.parse(canonicalRepairControl(input).toString("utf8"));
  } catch {
    throw safeError("workflow_identity_mismatch");
  }
  if ((control.operation === "execute" || control.operation === "closeout")
    && control.runAttempt !== "1") {
    throw safeError("workflow_identity_mismatch");
  }
  if (control.operation === "execute" || control.operation === "closeout") {
    if (control.executionGateId !== JAPAN_TUIC_REPAIR_GATE_V3.executionGateId
      || control.executionNonce !== JAPAN_TUIC_REPAIR_GATE_V3.executionNonce) {
      throw safeError("execution_claim_mismatch");
    }
    try {
      if (executionNonceSha256(control.executionNonce) !== JAPAN_TUIC_REPAIR_GATE_V3.expectedNonceSha256) {
        throw safeError("execution_claim_mismatch");
      }
      executionClaimSha256(canonicalClaimInput(control));
    } catch {
      throw safeError("execution_claim_mismatch");
    }
  }
  return control;
}

export function buildOperationControl(input = {}) {
  if (!hasExactKeys(input, CONTROL_INPUT_KEYS)
    || typeof input.operation !== "string"
    || typeof input.workflowCommit !== "string"
    || !LOWER_COMMIT.test(input.workflowCommit)
    || typeof input.runAttempt !== "string"
    || !POSITIVE_DECIMAL.test(input.runAttempt)) {
    throw safeError("workflow_identity_mismatch");
  }
  const control = input.operation === "inspect"
    ? {
        operation: input.operation,
        runAttempt: input.runAttempt,
        schemaVersion: JAPAN_TUIC_REPAIR_GATE_V3.schemaVersion,
        workflowCommit: input.workflowCommit
      }
    : {
        executionGateId: JAPAN_TUIC_REPAIR_GATE_V3.executionGateId,
        executionNonce: JAPAN_TUIC_REPAIR_GATE_V3.executionNonce,
        operation: input.operation,
        runAttempt: input.runAttempt,
        schemaVersion: JAPAN_TUIC_REPAIR_GATE_V3.schemaVersion,
        workflowCommit: input.workflowCommit
      };
  return validateOperationControl(control);
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

export function validateInspectReceipt(input = {}) {
  if (!hasExactKeys(input, INSPECT_RECEIPT_KEYS)) throw safeError("receipt_validation_failed");
  const value = record(input);
  exactText(value.schemaVersion, "3", "receipt_validation_failed");
  exactText(value.type, "japan_tuic_additive_repair_inspection", "receipt_validation_failed");

  let candidate;
  let identity;
  let error;
  if (value.inspectionResult === "ready_unclaimed_revalidation_required") {
    if ((value.journalPhase !== null && value.journalPhase !== "prepared")
      || value.terminalResult !== null || value.error !== null) {
      throw safeError("receipt_validation_failed");
    }
    candidate = validateExactFrozenFields(value.candidate, JAPAN_TUIC_REPAIR_GATE_V3.candidate);
    identity = validateExactIdentity(value.identity, JAPAN_TUIC_REPAIR_GATE_V3.before);
    error = null;
  } else if (value.inspectionResult === "claimed_nonterminal") {
    if (!CLAIMED_NONTERMINAL_PHASES.has(value.journalPhase)
      || value.terminalResult !== null
      || value.candidate !== null
      || value.identity !== null
      || value.error !== null) {
      throw safeError("receipt_validation_failed");
    }
    candidate = null;
    identity = null;
    error = null;
  } else if (value.inspectionResult === "terminal_reconciled") {
    if (value.candidate !== null || value.error !== null
      || value.journalPhase !== value.terminalResult
      || (value.terminalResult !== "applied_validated"
        && value.terminalResult !== "rolled_back_validated")) {
      throw safeError("receipt_validation_failed");
    }
    candidate = null;
    identity = validateExactIdentity(
      value.identity,
      value.terminalResult === "applied_validated"
        ? JAPAN_TUIC_REPAIR_GATE_V3.after
        : JAPAN_TUIC_REPAIR_GATE_V3.before
    );
    error = null;
  } else if (value.inspectionResult === "indeterminate_reconciled") {
    if (value.journalPhase !== "indeterminate"
      || value.terminalResult !== "indeterminate"
      || value.candidate !== null
      || value.identity !== null) {
      throw safeError("receipt_validation_failed");
    }
    candidate = null;
    identity = null;
    error = validateNullableError(value.error, V3_SAFE_ERRORS);
  } else if (value.inspectionResult === "inspection_blocked") {
    if (value.journalPhase !== null
      || value.terminalResult !== null
      || value.candidate !== null
      || value.identity !== null) {
      throw safeError("receipt_validation_failed");
    }
    candidate = null;
    identity = null;
    error = validateRequiredError(value.error, INSPECT_BLOCKED_ERRORS);
  } else {
    throw safeError("receipt_validation_failed");
  }

  return {
    schemaVersion: "3",
    type: "japan_tuic_additive_repair_inspection",
    inspectionResult: value.inspectionResult,
    journalPhase: value.journalPhase,
    terminalResult: value.terminalResult,
    candidate,
    identity,
    error
  };
}

function validateExecuteFlags(value, closeoutEligible, rollbackVerified) {
  exactBoolean(value.closeoutEligible, closeoutEligible, "receipt_validation_failed");
  exactBoolean(value.rollbackVerified, rollbackVerified, "receipt_validation_failed");
}

export function validateExecuteReceipt(input = {}) {
  if (!hasExactKeys(input, EXECUTE_RECEIPT_KEYS)) throw safeError("receipt_validation_failed");
  const value = record(input);
  exactText(value.schemaVersion, "3", "receipt_validation_failed");
  exactText(value.type, "japan_tuic_additive_repair_execution", "receipt_validation_failed");

  let candidate;
  let identity;
  let naturalObservation;
  let error;
  if (value.productionResult === "applied_validated") {
    if (value.journalPhase !== "applied_validated"
      || value.terminalResult !== "applied_validated"
      || value.error !== null) {
      throw safeError("receipt_validation_failed");
    }
    validateExecuteFlags(value, true, false);
    candidate = validateExactFrozenFields(value.candidate, JAPAN_TUIC_REPAIR_GATE_V3.candidate);
    identity = validateExactIdentity(value.identity, JAPAN_TUIC_REPAIR_GATE_V3.after);
    naturalObservation = validateReceiptObservationV3(value.naturalObservation);
    error = null;
  } else if (value.productionResult === "rolled_back_validated") {
    if (value.journalPhase !== "rolled_back_validated"
      || value.terminalResult !== "rolled_back_validated"
      || value.naturalObservation !== null) {
      throw safeError("receipt_validation_failed");
    }
    validateExecuteFlags(value, true, true);
    candidate = validateExactFrozenFields(value.candidate, JAPAN_TUIC_REPAIR_GATE_V3.candidate);
    identity = validateExactIdentity(value.identity, JAPAN_TUIC_REPAIR_GATE_V3.before);
    naturalObservation = null;
    error = validateRequiredError(value.error, EXECUTE_ERRORS);
  } else if (value.productionResult === "stopped_pre_claim") {
    if ((value.journalPhase !== null && value.journalPhase !== "prepared")
      || value.terminalResult !== null
      || value.candidate !== null
      || value.identity !== null
      || value.naturalObservation !== null) {
      throw safeError("receipt_validation_failed");
    }
    validateExecuteFlags(value, false, false);
    candidate = null;
    identity = null;
    naturalObservation = null;
    error = validateRequiredError(value.error, EXECUTE_ERRORS);
  } else if (value.productionResult === "replay_reconciled") {
    if (value.candidate !== null || value.naturalObservation !== null || value.error !== null) {
      throw safeError("receipt_validation_failed");
    }
    candidate = null;
    naturalObservation = null;
    error = null;
    if (CLAIMED_NONTERMINAL_PHASES.has(value.journalPhase) && value.terminalResult === null) {
      validateExecuteFlags(value, false, false);
      if (value.identity !== null) throw safeError("receipt_validation_failed");
      identity = null;
    } else if (value.journalPhase === "applied_validated"
      && value.terminalResult === "applied_validated") {
      validateExecuteFlags(value, true, false);
      identity = validateExactIdentity(value.identity, JAPAN_TUIC_REPAIR_GATE_V3.after);
    } else if (value.journalPhase === "rolled_back_validated"
      && value.terminalResult === "rolled_back_validated") {
      validateExecuteFlags(value, true, true);
      identity = validateExactIdentity(value.identity, JAPAN_TUIC_REPAIR_GATE_V3.before);
    } else {
      throw safeError("receipt_validation_failed");
    }
  } else if (value.productionResult === "indeterminate") {
    if (value.candidate !== null || value.identity !== null || value.naturalObservation !== null) {
      throw safeError("receipt_validation_failed");
    }
    validateExecuteFlags(value, false, false);
    candidate = null;
    identity = null;
    naturalObservation = null;
    if (value.journalPhase === "indeterminate" && value.terminalResult === "indeterminate") {
      error = validateNullableError(value.error, EXECUTE_ERRORS);
    } else if ((value.journalPhase === null || CLAIMED_NONTERMINAL_PHASES.has(value.journalPhase))
      && value.terminalResult === null) {
      error = validateRequiredError(value.error, EXECUTE_ERRORS);
    } else {
      throw safeError("receipt_validation_failed");
    }
  } else {
    throw safeError("receipt_validation_failed");
  }

  return {
    schemaVersion: "3",
    type: "japan_tuic_additive_repair_execution",
    productionResult: value.productionResult,
    journalPhase: value.journalPhase,
    terminalResult: value.terminalResult,
    closeoutEligible: value.closeoutEligible,
    rollbackVerified: value.rollbackVerified,
    candidate,
    identity,
    naturalObservation,
    error
  };
}

export function validateCloseoutReceipt(input = {}) {
  if (!hasExactKeys(input, CLOSEOUT_RECEIPT_KEYS)) throw safeError("receipt_validation_failed");
  const value = record(input);
  exactText(value.schemaVersion, "3", "receipt_validation_failed");
  exactText(value.type, "japan_tuic_additive_repair_closeout", "receipt_validation_failed");

  let error;
  if (value.closeoutResult === "authorization_removed") {
    if ((value.terminalResult !== "applied_validated" && value.terminalResult !== "rolled_back_validated")
      || value.hostAuthorizationCleanup !== "verified"
      || value.githubCleanup !== "pending"
      || value.error !== null) {
      throw safeError("receipt_validation_failed");
    }
    error = null;
  } else if (value.closeoutResult === "cleanup_indeterminate") {
    if (![null, "applied_validated", "rolled_back_validated"].includes(value.terminalResult)
      || value.hostAuthorizationCleanup !== "unknown"
      || value.githubCleanup !== "pending") {
      throw safeError("receipt_validation_failed");
    }
    error = validateRequiredError(value.error, CLOSEOUT_INDETERMINATE_ERRORS);
  } else if (value.closeoutResult === "closeout_blocked") {
    if (![null, "applied_validated", "rolled_back_validated", "indeterminate"].includes(value.terminalResult)
      || value.hostAuthorizationCleanup !== "retained"
      || value.githubCleanup !== "pending") {
      throw safeError("receipt_validation_failed");
    }
    error = validateRequiredError(value.error, CLOSEOUT_BLOCKED_ERRORS);
  } else {
    throw safeError("receipt_validation_failed");
  }

  return {
    schemaVersion: "3",
    type: "japan_tuic_additive_repair_closeout",
    closeoutResult: value.closeoutResult,
    terminalResult: value.terminalResult,
    hostAuthorizationCleanup: value.hostAuthorizationCleanup,
    githubCleanup: value.githubCleanup,
    error
  };
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

function artifactBytesForFrame(artifactPath) {
  try {
    const expected = JAPAN_TUIC_REPAIR_GATE_V3.artifact;
    const stats = statSync(artifactPath);
    if (!stats.isFile()
      || basename(artifactPath) !== expected.fileName
      || stats.size !== expected.sizeBytes) {
      throw safeError("artifact_identity_mismatch");
    }
    const bytes = readFileSync(artifactPath);
    if (createHash("sha256").update(bytes).digest("hex") !== expected.sha256) {
      throw safeError("artifact_identity_mismatch");
    }
    return bytes;
  } catch {
    throw safeError("artifact_identity_mismatch");
  }
}

function validateReceiptForOperation(operation, input) {
  if (operation === "inspect") return validateInspectReceipt(input);
  if (operation === "execute") return validateExecuteReceipt(input);
  if (operation === "closeout") return validateCloseoutReceipt(input);
  throw safeError("receipt_validation_failed");
}

function parseCanonicalReceiptFile(inputPath, operation) {
  try {
    const stats = statSync(inputPath);
    if (!stats.isFile() || stats.size <= 0 || stats.size > MAX_RECEIPT_BYTES) {
      throw safeError("receipt_validation_failed");
    }
    const bytes = readFileSync(inputPath);
    const text = UTF8.decode(bytes);
    if (!text.endsWith("\n") || text.includes("\r")) throw safeError("receipt_validation_failed");
    const input = JSON.parse(text.slice(0, -1));
    const receipt = validateReceiptForOperation(operation, input);
    const canonicalBytes = Buffer.from(`${JSON.stringify(receipt)}\n`, "utf8");
    if (!bytes.equals(canonicalBytes)) throw safeError("receipt_validation_failed");
    return receipt;
  } catch {
    throw safeError("receipt_validation_failed");
  }
}

function synthesizeTransportReceipt(operation, locked) {
  if (operation === "inspect") {
    return validateInspectReceipt({
      schemaVersion: "3",
      type: "japan_tuic_additive_repair_inspection",
      inspectionResult: "inspection_blocked",
      journalPhase: null,
      terminalResult: null,
      candidate: null,
      identity: null,
      error: locked ? "host_lock_busy" : "receipt_validation_failed"
    });
  }
  if (operation === "execute") {
    return validateExecuteReceipt({
      schemaVersion: "3",
      type: "japan_tuic_additive_repair_execution",
      productionResult: "indeterminate",
      journalPhase: null,
      terminalResult: null,
      closeoutEligible: false,
      rollbackVerified: false,
      candidate: null,
      identity: null,
      naturalObservation: null,
      error: locked ? "host_lock_busy" : "receipt_validation_failed"
    });
  }
  if (operation === "closeout") {
    return validateCloseoutReceipt({
      schemaVersion: "3",
      type: "japan_tuic_additive_repair_closeout",
      closeoutResult: locked ? "closeout_blocked" : "cleanup_indeterminate",
      terminalResult: null,
      hostAuthorizationCleanup: locked ? "retained" : "unknown",
      githubCleanup: "pending",
      error: locked ? "host_lock_busy" : "closeout_receipt_lost"
    });
  }
  throw safeError("receipt_validation_failed");
}

function runFrameCli(argv, stdout) {
  if (argv[1] !== "--operation"
    || argv[3] !== "--workflow-commit"
    || argv[5] !== "--run-attempt") {
    throw safeError("workflow_identity_mismatch");
  }
  const operation = argv[2];
  const withArtifact = operation === "inspect" || operation === "execute";
  if ((withArtifact && (argv.length !== 9 || argv[7] !== "--artifact" || !argv[8]))
    || (!withArtifact && argv.length !== 7)) {
    throw safeError(withArtifact ? "artifact_identity_mismatch" : "workflow_identity_mismatch");
  }
  const control = buildOperationControl({
    operation,
    workflowCommit: argv[4],
    runAttempt: argv[6]
  });
  const artifact = withArtifact ? artifactBytesForFrame(argv[8]) : undefined;
  stdout.write(encodeRepairFrame({ control, artifact }));
  return 0;
}

function runReceiptCliV3(argv, stdout) {
  if (argv.length !== 7
    || argv[1] !== "--operation"
    || argv[3] !== "--input"
    || argv[5] !== "--ssh-status"
    || !argv[4]
    || typeof argv[6] !== "string"
    || !SSH_STATUS.test(argv[6])) {
    throw safeError("receipt_validation_failed");
  }
  const operation = argv[2];
  if (!new Set(["inspect", "execute", "closeout"]).has(operation)) {
    throw safeError("receipt_validation_failed");
  }
  const status = Number(argv[6]);
  if (!Number.isSafeInteger(status) || status < 0 || status > 255) {
    throw safeError("receipt_validation_failed");
  }

  let receipt;
  if (status !== 0) {
    receipt = synthesizeTransportReceipt(operation, status === 75);
  } else {
    try {
      receipt = parseCanonicalReceiptFile(argv[4], operation);
    } catch {
      receipt = synthesizeTransportReceipt(operation, false);
    }
  }
  stdout.write(`${JSON.stringify(receipt)}\n`);
  return 0;
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
    if (command === "frame") {
      return runFrameCli(argv, stdout);
    }
    if (command === "receipt" && argv.length !== 3) {
      return runReceiptCliV3(argv, stdout);
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
