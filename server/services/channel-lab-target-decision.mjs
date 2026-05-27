const ALLOWED_TOP_LEVEL_KEYS = new Set(["generatedAt", "inventory"]);
const ALLOWED_INVENTORY_KEYS = new Set(["targetLabel", "protocol", "lifecycleStatus", "checks", "blockerCodes", "nextGate"]);
const ALLOWED_CHECK_KEYS = new Set([
  "cloudIdentityVerified",
  "networkPostureVerified",
  "sshBannerReachable",
  "ssmRegistered",
  "hostInventoryCompleted",
  "incumbentRuntimePresent",
  "incumbentRuntimeProtocol",
  "candidatePortPlanRecorded",
  "cleanupDecisionRecorded"
]);
const FORBIDDEN_VALUE_PATTERN = /[a-z][a-z0-9+.-]*:\/\/|token=|subscriptionUrl|artifactUrl|password|credential|rawLog|rawError|secret\.example/i;
const IPV4_VALUE_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
const IPV6_VALUE_PATTERN = /\b(?:[0-9a-f]{0,4}:){2,}[0-9a-f]{0,4}\b/i;
const DOMAIN_VALUE_PATTERN = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/i;
const HOST_PORT_VALUE_PATTERN = /\b(?:[a-z0-9-]+(?:\.[a-z0-9-]+)+|(?:\d{1,3}\.){3}\d{1,3}|\[[0-9a-f:]+\]):\d{2,5}\b/i;
const PORT_LABEL_PATTERN = /^\d{2,5}$/;

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return String(value ?? "").trim();
}

function bool(value) {
  return value === true;
}

function decisionError() {
  return new Error("channel lab target decision input is invalid");
}

function assertExactKeys(value, allowedKeys) {
  if (!isObject(value)) {
    throw decisionError();
  }
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw decisionError();
    }
  }
}

function safeText(value) {
  const normalized = text(value);
  if (FORBIDDEN_VALUE_PATTERN.test(normalized)) {
    throw decisionError();
  }
  return normalized;
}

function safeLabel(value) {
  const normalized = safeText(value);
  if (
    IPV4_VALUE_PATTERN.test(normalized)
    || IPV6_VALUE_PATTERN.test(normalized)
    || DOMAIN_VALUE_PATTERN.test(normalized)
    || HOST_PORT_VALUE_PATTERN.test(normalized)
    || PORT_LABEL_PATTERN.test(normalized)
    || normalized.includes("@")
  ) {
    throw decisionError();
  }
  return normalized;
}

function appendUnique(values, value) {
  if (value && !values.includes(value)) {
    values.push(value);
  }
}

function uniqueLabels(values) {
  const result = [];
  for (const value of Array.isArray(values) ? values : []) {
    appendUnique(result, safeLabel(value));
  }
  return result;
}

function normalizeChecks(value) {
  assertExactKeys(value, ALLOWED_CHECK_KEYS);
  return {
    cloudIdentityVerified: bool(value.cloudIdentityVerified),
    networkPostureVerified: bool(value.networkPostureVerified),
    sshBannerReachable: bool(value.sshBannerReachable),
    ssmRegistered: bool(value.ssmRegistered),
    hostInventoryCompleted: bool(value.hostInventoryCompleted),
    incumbentRuntimePresent: bool(value.incumbentRuntimePresent),
    incumbentRuntimeProtocol: safeLabel(value.incumbentRuntimeProtocol),
    candidatePortPlanRecorded: bool(value.candidatePortPlanRecorded),
    cleanupDecisionRecorded: bool(value.cleanupDecisionRecorded)
  };
}

function normalizeInventory(input) {
  assertExactKeys(input, ALLOWED_INVENTORY_KEYS);
  const inventory = {
    targetLabel: safeLabel(input.targetLabel),
    protocol: safeLabel(input.protocol),
    lifecycleStatus: safeLabel(input.lifecycleStatus),
    checks: normalizeChecks(input.checks),
    blockerCodes: uniqueLabels(input.blockerCodes),
    nextGate: safeLabel(input.nextGate)
  };
  if (!inventory.targetLabel || !inventory.protocol || !inventory.lifecycleStatus) {
    throw decisionError();
  }
  return inventory;
}

function automaticBlockers(inventory) {
  const blockers = [...inventory.blockerCodes];
  const { checks } = inventory;
  const accessReady = checks.sshBannerReachable || checks.ssmRegistered;
  if (!checks.cloudIdentityVerified) appendUnique(blockers, "cloud_identity_unverified");
  if (!checks.networkPostureVerified) appendUnique(blockers, "network_posture_unverified");
  if (!checks.sshBannerReachable && !checks.ssmRegistered && blockers.length === 0) {
    appendUnique(blockers, "target_access_blocked");
  }
  if (!checks.hostInventoryCompleted) appendUnique(blockers, "host_inventory_incomplete");
  if (
    inventory.targetLabel === "channel-lab-a"
    && checks.incumbentRuntimePresent
    && accessReady
    && checks.hostInventoryCompleted
    && !checks.candidatePortPlanRecorded
  ) {
    appendUnique(blockers, "candidate_port_plan_missing");
  }
  if (
    inventory.targetLabel === "channel-lab-a"
    && checks.incumbentRuntimePresent
    && accessReady
    && checks.hostInventoryCompleted
    && !checks.cleanupDecisionRecorded
  ) {
    appendUnique(blockers, "cleanup_decision_missing");
  }
  return blockers;
}

function classify(inventory, blockers) {
  const { checks } = inventory;
  const accessReady = checks.sshBannerReachable || checks.ssmRegistered;
  if (!accessReady || !checks.hostInventoryCompleted) {
    return {
      status: "fresh_target_recommended",
      reuseRecommendation: "not_recommended",
      requiredNextAction: "request_channel_lab_b_selection_gate",
      nextGate: {
        gate: "risk_a_channel_lab_b_selection",
        runbook: "docs/CHANNEL_CANARY_SERVER_SELECTION.md"
      }
    };
  }
  if (inventory.targetLabel === "channel-lab-a" && blockers.length > 0) {
    return {
      status: "access_cleanup_gate_required",
      reuseRecommendation: "separate_gate_required",
      requiredNextAction: "request_channel_lab_a_access_port_cleanup_gate",
      nextGate: {
        gate: "risk_a_channel_lab_a_access_port_cleanup",
        runbook: "docs/CHANNEL_CANARY_SERVER_SELECTION.md"
      }
    };
  }
  return {
    status: "ready_for_runtime_deployment_request",
    reuseRecommendation: inventory.targetLabel === "channel-lab-a" ? "reuse_ready" : "fresh_target_ready",
    requiredNextAction: "request_risk_a_runtime_deployment_approval",
    nextGate: {
      gate: "risk_a_channel_runtime_canary",
      runbook: "docs/CHANNEL_RUNTIME_CANARY_RUNBOOK.md"
    }
  };
}

export function buildChannelLabTargetDecision(input = {}) {
  assertExactKeys(input, ALLOWED_TOP_LEVEL_KEYS);
  const { generatedAt = new Date().toISOString(), inventory } = input;
  const normalized = normalizeInventory(inventory);
  const blockers = automaticBlockers(normalized);
  const classification = classify(normalized, blockers);

  return {
    ok: true,
    mode: "channel-lab-target-decision",
    generatedAt: safeText(generatedAt) || new Date().toISOString(),
    status: classification.status,
    requiredNextAction: classification.requiredNextAction,
    executionAuthority: "not_granted",
    target: {
      targetLabel: normalized.targetLabel,
      protocol: normalized.protocol,
      lifecycleStatus: normalized.lifecycleStatus,
      reuseRecommendation: classification.reuseRecommendation
    },
    blockers,
    nextGate: {
      risk: "A",
      gate: classification.nextGate.gate,
      approvalRequired: true,
      approvalTextIncluded: false,
      approvalSubmissionRoute: null,
      runtimeExecutionRoute: null,
      runbook: classification.nextGate.runbook
    },
    alternatives: {
      channelLabAAccessCleanupGate: normalized.targetLabel === "channel-lab-a",
      freshChannelLabBSelection: classification.status !== "ready_for_runtime_deployment_request"
    },
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
