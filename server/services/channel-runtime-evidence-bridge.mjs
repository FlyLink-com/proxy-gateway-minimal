import { buildChannelSystemDecisionFlow } from "./channel-system-decision-flow.mjs";

const ALLOWED_TOP_LEVEL_KEYS = new Set(["generatedAt", "records"]);
const ALLOWED_RECORD_KEYS = new Set([
  "candidateName",
  "protocol",
  "targetLabel",
  "observedAt",
  "checks",
  "blockerCodes",
  "nextGate"
]);
const ALLOWED_CHECK_KEYS = new Set([
  "cloudIdentityVerified",
  "networkPostureVerified",
  "hostInventoryCompleted",
  "runtimeSlotAvailable",
  "runtimeInstalled",
  "serviceActive",
  "operatorImportValidated",
  "cleanupRequired"
]);
const FORBIDDEN_VALUE_PATTERN = /https?:\/\/|token=|subscriptionUrl|artifactUrl|secret\.example/i;

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return String(value ?? "").trim();
}

function bool(value) {
  return value === true;
}

function bridgeError() {
  return new Error("safe runtime evidence bridge requires only supported summary fields");
}

function assertExactKeys(value, allowedKeys) {
  if (!isObject(value)) {
    throw bridgeError();
  }
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw bridgeError();
    }
  }
}

function safeText(value) {
  const normalized = text(value);
  if (FORBIDDEN_VALUE_PATTERN.test(normalized)) {
    throw bridgeError();
  }
  return normalized;
}

function uniqueText(values) {
  const result = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = safeText(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function appendUnique(values, value) {
  if (!value || values.includes(value)) return values;
  values.push(value);
  return values;
}

function normalizeChecks(value) {
  assertExactKeys(value, ALLOWED_CHECK_KEYS);
  return {
    cloudIdentityVerified: bool(value.cloudIdentityVerified),
    networkPostureVerified: bool(value.networkPostureVerified),
    hostInventoryCompleted: bool(value.hostInventoryCompleted),
    runtimeSlotAvailable: bool(value.runtimeSlotAvailable),
    runtimeInstalled: bool(value.runtimeInstalled),
    serviceActive: bool(value.serviceActive),
    operatorImportValidated: bool(value.operatorImportValidated),
    cleanupRequired: bool(value.cleanupRequired)
  };
}

function lifecycleStatus(checks) {
  if (checks.cleanupRequired) {
    return "cleanup_required";
  }
  if (!checks.hostInventoryCompleted || !checks.runtimeSlotAvailable) {
    return "inventory_blocked";
  }
  if (checks.runtimeInstalled && !checks.serviceActive) {
    return "runtime_blocked";
  }
  if (checks.runtimeInstalled && checks.serviceActive) {
    return "runtime_deployed";
  }
  return "inventory_ready";
}

function automaticBlockers(checks) {
  const blockers = [];
  if (!checks.cloudIdentityVerified) appendUnique(blockers, "cloud_identity_unverified");
  if (!checks.networkPostureVerified) appendUnique(blockers, "network_posture_unverified");
  if (!checks.hostInventoryCompleted) appendUnique(blockers, "host_inventory_incomplete");
  if (!checks.runtimeSlotAvailable) appendUnique(blockers, "runtime_slot_unavailable");
  if (checks.runtimeInstalled && !checks.serviceActive) appendUnique(blockers, "runtime_service_inactive");
  if (checks.cleanupRequired) appendUnique(blockers, "cleanup_required");
  return blockers;
}

function deploymentReady(checks, blockers, status) {
  if (blockers.length > 0) return false;
  if (status === "cleanup_required" || status === "inventory_blocked" || status === "runtime_blocked") {
    return false;
  }
  return checks.cloudIdentityVerified && checks.networkPostureVerified && checks.hostInventoryCompleted && checks.runtimeSlotAvailable;
}

function defaultNextGate(status) {
  if (status === "cleanup_required") return "cleanup_decision";
  if (status === "inventory_blocked" || status === "runtime_blocked") return "resolve_runtime_inventory_blockers";
  if (status === "runtime_deployed") return "operator_device_canary_validation";
  return "runtime_deployment_approval";
}

function runtimeInventoryRecord(record) {
  assertExactKeys(record, ALLOWED_RECORD_KEYS);
  const candidateName = safeText(record.candidateName);
  const protocol = safeText(record.protocol);
  const targetLabel = safeText(record.targetLabel);
  safeText(record.observedAt);
  const checks = normalizeChecks(record.checks);
  const status = lifecycleStatus(checks);
  const blockers = uniqueText(record.blockerCodes);
  for (const blocker of automaticBlockers(checks)) {
    appendUnique(blockers, blocker);
  }

  if (!candidateName || !protocol || !targetLabel) {
    throw bridgeError();
  }

  return {
    candidateName,
    protocol,
    targetLabel,
    lifecycleStatus: status,
    deploymentReady: deploymentReady(checks, blockers, status),
    blockers,
    nextGate: safeText(record.nextGate) || defaultNextGate(status)
  };
}

function buildRuntimeInventoryInput(input = {}) {
  assertExactKeys(input, ALLOWED_TOP_LEVEL_KEYS);
  if (!Array.isArray(input.records)) {
    throw bridgeError();
  }
  return {
    generatedAt: safeText(input.generatedAt),
    records: input.records.map(runtimeInventoryRecord)
  };
}

export function buildChannelRuntimeEvidenceBridge({
  dryRunSummary,
  measurementScore,
  runtimeEvidenceInput,
  generatedAt = new Date().toISOString()
}) {
  const runtimeInventoryInput = buildRuntimeInventoryInput(runtimeEvidenceInput);
  const channelSystem = buildChannelSystemDecisionFlow({
    dryRunSummary,
    measurementScore,
    runtimeInventoryInput,
    generatedAt
  });

  return {
    ok: true,
    mode: "channel-runtime-evidence-bridge",
    generatedAt,
    sourceGeneratedAt: runtimeInventoryInput.generatedAt,
    runtimeInventoryInput,
    channelSystem,
    safety: {
      advisoryOnly: true,
      summaryOnly: true,
      noRuntimeMutation: true,
      noProductionMutation: true,
      noApprovalSubmission: true,
      noTrafficMovement: true,
      requiresSeparateRiskAApproval: true,
      omittedFields: ["hosts", "ports", "urls", "credentials", "rawLogs", "tokens", "subscriptionUrls"]
    }
  };
}
