#!/usr/bin/env node
import { posix } from "node:path";

import {
  JAPAN_TUIC_REPAIR_GATE,
  JapanTuicRepairContractError,
  validateArtifactIdentity,
  validateCandidateReport,
  validateExecutionReceipt,
  validateNaturalObservation,
  validatePostApplyIdentity
} from "./japan-tuic-additive-repair-contract.mjs";

const BINDING_PATH_KEYS = Object.freeze([
  "authorizedKeys",
  "backupDirectory",
  "currentMap",
  "materialStore",
  "mihomoConfig",
  "naturalObservation",
  "producerStatus",
  "temporaryRoot"
]);
const REQUIRED_ARCHIVE_ENTRIES = Object.freeze([
  "scripts/mihomo-tuic-usage-map-rebuild.mjs",
  "scripts/traffic-accounting-natural-observation.mjs",
  "server/services/platform/traffic-collector-admin-projection.mjs",
  "server/services/platform/traffic-collector-status-producers.mjs"
]);
const SAFE_ERROR_CODES = new Set([
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

function safeError(code) {
  return new JapanTuicRepairContractError(code);
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function exactKeys(value, expected) {
  const keys = Object.keys(record(value)).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function safeAbsolutePath(value) {
  return typeof value === "string"
    && value.length > 1
    && value.length <= 4096
    && !value.includes("\0")
    && !value.includes("\\")
    && posix.isAbsolute(value)
    && posix.normalize(value) === value;
}

export function validateRunnerBinding(input = {}) {
  const value = record(input);
  if (!exactKeys(value, ["authorizationMarker", "gateId", "paths", "schemaVersion", "units"])
    || value.schemaVersion !== "1"
    || value.gateId !== JAPAN_TUIC_REPAIR_GATE.executionGateId) {
    throw safeError("target_identity_mismatch");
  }
  const paths = record(value.paths);
  if (!exactKeys(paths, [...BINDING_PATH_KEYS].sort())) throw safeError("target_identity_mismatch");
  const pathValues = BINDING_PATH_KEYS.map((key) => paths[key]);
  if (pathValues.some((path) => !safeAbsolutePath(path))
    || new Set(pathValues).size !== pathValues.length) {
    throw safeError("target_identity_mismatch");
  }
  const units = record(value.units);
  if (!exactKeys(units, ["service", "timer"])
    || units.timer !== "gccgw-traffic-usage-collect.timer"
    || units.service !== "gccgw-traffic-usage-collect.service"
    || typeof value.authorizationMarker !== "string"
    || !/^[A-Za-z0-9._:-]{16,160}$/.test(value.authorizationMarker)) {
    throw safeError("target_identity_mismatch");
  }
  return {
    schemaVersion: "1",
    gateId: JAPAN_TUIC_REPAIR_GATE.executionGateId,
    paths: Object.fromEntries(BINDING_PATH_KEYS.map((key) => [key, paths[key]])),
    units: { timer: units.timer, service: units.service },
    authorizationMarker: value.authorizationMarker
  };
}

export function validateArchiveEntries(entries = []) {
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > 100000) {
    throw safeError("artifact_identity_mismatch");
  }
  const seen = new Set();
  for (const entry of entries) {
    if (typeof entry !== "string"
      || entry.length === 0
      || entry.length > 4096
      || entry.includes("\0")
      || entry.includes("\\")
      || entry.startsWith("/")
      || /^[A-Za-z]:/.test(entry)
      || posix.normalize(entry) !== entry
      || entry === ".."
      || entry.startsWith("../")
      || seen.has(entry)) {
      throw safeError("artifact_identity_mismatch");
    }
    seen.add(entry);
  }
  if (REQUIRED_ARCHIVE_ENTRIES.some((entry) => !seen.has(entry))) {
    throw safeError("artifact_identity_mismatch");
  }
  return { safe: true, entryCount: entries.length };
}

export function deriveWaitBudget({ intervalSeconds } = {}) {
  if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
    throw safeError("stable_snapshot_unavailable");
  }
  return Math.min(720000, (intervalSeconds * 2 + 60) * 1000);
}

function validateFrozenIdentity(input, expected, code) {
  const value = record(input);
  const output = {};
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (value[key] !== expectedValue) throw safeError(code);
    output[key] = expectedValue;
  }
  return output;
}

function validateBeforeIdentity(input) {
  return validateFrozenIdentity(input, JAPAN_TUIC_REPAIR_GATE.before, "expected_count_mismatch");
}

function validateAppliedReport(input) {
  const value = record(input);
  if (value.applied !== true || value.finalMode !== "600") throw safeError("post_apply_invariant_failed");
  return validateCandidateReport(value);
}

function validatePostApplyCandidate(input) {
  const value = record(input);
  const candidate = record(value.candidate);
  const expected = {
    addCount: 0,
    removeCount: 0,
    deferredRemoveCount: 27,
    deferredChangedCount: 0,
    missingMaterialCount: 0,
    projectedMapCount: 82,
    ready: true
  };
  if (value.ok !== true || value.candidateReady !== true) throw safeError("post_apply_invariant_failed");
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (candidate[key] !== expectedValue) throw safeError("post_apply_invariant_failed");
  }
  return { ok: true, candidateReady: true, candidate: expected };
}

function stableJson(value) {
  return JSON.stringify(value, Object.keys(record(value)).sort());
}

function assertStableAggregate(first, second, beforeOne, beforeTwo) {
  if (stableJson(first) !== stableJson(second) || stableJson(beforeOne) !== stableJson(beforeTwo)) {
    throw safeError("stable_snapshot_unavailable");
  }
}

function validateMetadata(value, code) {
  const metadata = record(value);
  if (!Number.isInteger(metadata.mode)
    || metadata.mode !== 0o600
    || !Number.isInteger(metadata.uid)
    || metadata.uid < 0
    || !Number.isInteger(metadata.gid)
    || metadata.gid < 0) {
    throw safeError(code);
  }
  return { mode: metadata.mode, uid: metadata.uid, gid: metadata.gid };
}

function assertMetadataPreserved(before, after) {
  const left = validateMetadata(before, "post_apply_invariant_failed");
  const right = validateMetadata(after, "post_apply_invariant_failed");
  if (left.mode !== right.mode || left.uid !== right.uid || left.gid !== right.gid) {
    throw safeError("post_apply_invariant_failed");
  }
}

function validateTimerState(value, code) {
  const timer = record(value);
  if (timer.active !== true
    || timer.enabled !== true
    || !Number.isInteger(timer.timerRestarts)
    || timer.timerRestarts < 0
    || !Number.isInteger(timer.serviceRestarts)
    || timer.serviceRestarts < 0) {
    throw safeError(code);
  }
  deriveWaitBudget(timer);
  return {
    active: true,
    enabled: true,
    timerRestarts: timer.timerRestarts,
    serviceRestarts: timer.serviceRestarts,
    intervalSeconds: timer.intervalSeconds
  };
}

function validateObservationBaseline(value) {
  const baseline = record(value);
  if (!Number.isInteger(baseline.collectorCount)
    || baseline.collectorCount < 0
    || !Number.isInteger(baseline.unresolvedTotal)
    || baseline.unresolvedTotal < 0) {
    throw safeError("stable_snapshot_unavailable");
  }
  return {
    collectorCount: baseline.collectorCount,
    unresolvedTotal: baseline.unresolvedTotal
  };
}

async function waitForNaturalObservation({
  operations,
  extracted,
  binding,
  applyBoundary,
  observationBefore,
  timerBefore,
  timerAfter
}) {
  const waitBudget = deriveWaitBudget(timerBefore);
  const pollMilliseconds = Math.min(
    5000,
    Math.max(1000, Math.floor(timerBefore.intervalSeconds * 250))
  );
  const maxAttempts = Math.max(1, Math.ceil(waitBudget / pollMilliseconds));
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const currentObservation = record(await operations.readNaturalObservation({
      root: extracted.root,
      binding,
      phase: "current"
    }));
    const captured = typeof currentObservation.capturedAt === "string"
      ? Date.parse(currentObservation.capturedAt)
      : Number.NaN;
    if (!Number.isFinite(captured)) throw safeError("natural_observation_failed");
    if (captured > Date.parse(applyBoundary)) {
      return validateNaturalObservation({
        applyBoundary,
        baseline: {
          ...observationBefore,
          timerRestarts: timerBefore.timerRestarts,
          serviceRestarts: timerBefore.serviceRestarts
        },
        current: {
          ...currentObservation,
          timerActive: timerAfter.active,
          timerEnabled: timerAfter.enabled,
          timerRestarts: timerAfter.timerRestarts,
          serviceRestarts: timerAfter.serviceRestarts
        }
      });
    }
    if (attempt + 1 < maxAttempts) await operations.sleep(pollMilliseconds);
  }
  throw safeError("natural_observation_timeout");
}

function safeCode(error, fallback) {
  return error instanceof JapanTuicRepairContractError && SAFE_ERROR_CODES.has(error.code)
    ? error.code
    : fallback;
}

function baseReceipt({ productionResult, error, rollbackVerified = false }) {
  const receipt = {
    schemaVersion: "1",
    type: "japan_tuic_additive_repair_execution",
    productionResult,
    hostCredentialCleanup: "failed",
    closeout: "incomplete"
  };
  if (error) receipt.error = error;
  if (rollbackVerified) receipt.rollbackVerified = true;
  return receipt;
}

async function verifyRollback({ operations, binding, extracted, metadataBefore }) {
  validateCandidateReport(await operations.runMapHelper({ root: extracted.root, binding, apply: false }));
  validateBeforeIdentity(await operations.readIdentityGate({ root: extracted.root, binding, phase: "rollback" }));
  assertMetadataPreserved(metadataBefore, await operations.readFileMetadata(binding.paths.currentMap));
}

async function cleanupHost({ operations, binding }) {
  let temporaryRemoved = false;
  let authorizationRevoked = false;
  try {
    temporaryRemoved = await operations.removeTemporaryMaterial(binding) === true;
  } catch {
    temporaryRemoved = false;
  }
  try {
    authorizationRevoked = await operations.revokeOwnAuthorization(binding) === true;
  } catch {
    authorizationRevoked = false;
  }
  return temporaryRemoved && authorizationRevoked;
}

export async function executeJapanTuicAdditiveRepair({
  binding: rawBinding,
  artifactStream,
  operations,
  now = () => new Date()
} = {}) {
  const binding = validateRunnerBinding(rawBinding);
  if (!operations || typeof operations !== "object") throw safeError("restricted_identity_rejected");
  let receipt = baseReceipt({
    productionResult: "stopped_pre_apply",
    error: "stable_snapshot_unavailable"
  });
  let extracted = null;
  let backup = null;
  let metadataBefore = null;
  let applyAttempted = false;

  try {
    const received = await operations.receiveArtifact(artifactStream);
    validateArtifactIdentity({
      runId: JAPAN_TUIC_REPAIR_GATE.artifact.runId,
      fileName: JAPAN_TUIC_REPAIR_GATE.artifact.fileName,
      sizeBytes: received.sizeBytes,
      sha256: received.sha256,
      sourceCommit: JAPAN_TUIC_REPAIR_GATE.artifact.sourceCommit
    });
    validateArchiveEntries(await operations.listArchiveEntries(received.path));
    extracted = await operations.extractArtifact(received.path);

    const firstCandidate = validateCandidateReport(
      await operations.runMapHelper({ root: extracted.root, binding, apply: false })
    );
    const beforeOne = validateBeforeIdentity(
      await operations.readIdentityGate({ root: extracted.root, binding, phase: "before" })
    );
    const secondCandidate = validateCandidateReport(
      await operations.runMapHelper({ root: extracted.root, binding, apply: false })
    );
    const beforeTwo = validateBeforeIdentity(
      await operations.readIdentityGate({ root: extracted.root, binding, phase: "before" })
    );
    assertStableAggregate(firstCandidate, secondCandidate, beforeOne, beforeTwo);

    metadataBefore = validateMetadata(
      await operations.readFileMetadata(binding.paths.currentMap),
      "stable_snapshot_unavailable"
    );
    const timerBefore = validateTimerState(
      await operations.readTimerState(binding),
      "stable_snapshot_unavailable"
    );
    const observationBefore = validateObservationBaseline(
      await operations.readNaturalObservation({ root: extracted.root, binding, phase: "baseline" })
    );
    backup = await operations.createBackup(binding);
    if (!backup || typeof backup !== "object" || typeof backup.ref !== "string" || backup.ref.length === 0) {
      throw safeError("backup_failed");
    }

    const applyBoundary = now().toISOString();
    applyAttempted = true;
    validateAppliedReport(await operations.runMapHelper({ root: extracted.root, binding, apply: true }));
    validatePostApplyCandidate(
      await operations.runMapHelper({ root: extracted.root, binding, apply: false })
    );
    const afterIdentity = validatePostApplyIdentity(
      await operations.readIdentityGate({ root: extracted.root, binding, phase: "after" })
    );
    assertMetadataPreserved(
      metadataBefore,
      await operations.readFileMetadata(binding.paths.currentMap)
    );
    const timerAfter = validateTimerState(
      await operations.readTimerState(binding),
      "natural_observation_failed"
    );
    const observation = await waitForNaturalObservation({
      operations,
      extracted,
      binding,
      applyBoundary,
      observationBefore,
      timerBefore,
      timerAfter
    });
    receipt = {
      ...baseReceipt({ productionResult: "applied_validated" }),
      candidate: { ...JAPAN_TUIC_REPAIR_GATE.candidate },
      identityAfter: afterIdentity,
      naturalObservation: observation
    };
  } catch (error) {
    if (applyAttempted && backup && extracted && metadataBefore) {
      try {
        await operations.restoreBackup(binding, backup);
        await verifyRollback({ operations, binding, extracted, metadataBefore });
        receipt = baseReceipt({
          productionResult: "rolled_back_validated",
          error: safeCode(error, "post_apply_invariant_failed"),
          rollbackVerified: true
        });
      } catch {
        receipt = baseReceipt({
          productionResult: "indeterminate",
          error: "rollback_verification_failed"
        });
      }
    } else {
      receipt = baseReceipt({
        productionResult: "stopped_pre_apply",
        error: safeCode(error, "stable_snapshot_unavailable")
      });
    }
  }

  const hostCleanupVerified = await cleanupHost({ operations, binding });
  receipt.hostCredentialCleanup = hostCleanupVerified ? "verified" : "failed";
  receipt.closeout = hostCleanupVerified ? "github_cleanup_pending" : "incomplete";
  return validateExecutionReceipt(receipt);
}
