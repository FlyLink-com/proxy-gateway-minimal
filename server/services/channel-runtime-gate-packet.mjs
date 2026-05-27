function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return String(value ?? "").trim();
}

function uniqueText(values) {
  const result = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = text(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function assertRuntimeRegistry(registry) {
  if (!isObject(registry) || registry.mode !== "channel-runtime-registry") {
    throw new Error("channel runtime gate packet requires a channel runtime registry");
  }
}

function safeCandidate(candidate) {
  const payload = {
    name: text(candidate.name),
    protocol: text(candidate.protocol),
    qualityClass: text(candidate.qualityClass),
    qualityTier: text(candidate.qualityTier),
    channelScore: numberOrNull(candidate.channelScore),
    lifecycleStatus: text(candidate.lifecycleStatus),
    targetLabel: text(candidate.targetLabel),
    nextGate: text(candidate.nextGate),
    reasonCodes: uniqueText(candidate.reasonCodes)
  };

  if (!payload.qualityClass) delete payload.qualityClass;
  if (!payload.qualityTier) delete payload.qualityTier;
  if (!payload.lifecycleStatus) delete payload.lifecycleStatus;
  if (!payload.targetLabel) delete payload.targetLabel;
  if (!payload.nextGate) delete payload.nextGate;
  return payload;
}

function approvalCandidate(candidate) {
  return {
    ...safeCandidate(candidate),
    approvalGate: "risk_a_channel_runtime_canary",
    approvalRequired: true
  };
}

function blockedCandidate(candidate) {
  return {
    ...safeCandidate(candidate),
    blockers: uniqueText(candidate.blockers)
  };
}

function missingInventoryCandidate(candidate) {
  return safeCandidate(candidate);
}

function selectedBaseline(registry) {
  if (!isObject(registry.selectedBaseline)) {
    return null;
  }
  return {
    name: text(registry.selectedBaseline.name),
    protocol: text(registry.selectedBaseline.protocol),
    qualityTier: text(registry.selectedBaseline.qualityTier),
    channelScore: numberOrNull(registry.selectedBaseline.channelScore),
    reasonCodes: uniqueText(registry.selectedBaseline.reasonCodes)
  };
}

function gateStatus(readiness) {
  if (Number(readiness.runtimeBlockedCount) > 0) {
    return "blocked";
  }
  if (Number(readiness.missingRuntimeInventoryCount) > 0) {
    return "needs_inventory";
  }
  if (Number(readiness.canaryReadyCount) > 0) {
    return "approval_ready";
  }
  return "no_candidate";
}

export function buildChannelRuntimeGatePacket({
  runtimeRegistry,
  generatedAt = new Date().toISOString()
}) {
  assertRuntimeRegistry(runtimeRegistry);

  const readiness = isObject(runtimeRegistry.systemReadiness) ? runtimeRegistry.systemReadiness : {};
  const approvalReadyCandidates = Array.isArray(runtimeRegistry.canaryReadyCandidates)
    ? runtimeRegistry.canaryReadyCandidates.map(approvalCandidate)
    : [];
  const blockedCandidates = Array.isArray(runtimeRegistry.runtimeBlockedCandidates)
    ? runtimeRegistry.runtimeBlockedCandidates.map(blockedCandidate)
    : [];
  const missingInventoryCandidates = Array.isArray(runtimeRegistry.missingRuntimeInventoryCandidates)
    ? runtimeRegistry.missingRuntimeInventoryCandidates.map(missingInventoryCandidate)
    : [];

  return {
    ok: true,
    mode: "channel-runtime-gate-packet",
    generatedAt,
    sourceGeneratedAt: text(runtimeRegistry.generatedAt),
    gateStatus: gateStatus(readiness),
    requiredNextAction: text(readiness.requiredNextAction),
    selectedBaseline: selectedBaseline(runtimeRegistry),
    approvalReadyCandidates,
    blockedCandidates,
    missingInventoryCandidates,
    gateEvidence: {
      selectedBaselineReady: readiness.selectedBaselineReady === true,
      canaryReadyCount: approvalReadyCandidates.length,
      runtimeBlockedCount: blockedCandidates.length,
      missingRuntimeInventoryCount: missingInventoryCandidates.length
    },
    safety: {
      advisoryOnly: true,
      noRuntimeMutation: true,
      noProductionMutation: true,
      noApprovalSubmission: true,
      noTrafficMovement: true,
      requiresSeparateRiskAApproval: true,
      omittedFields: ["hosts", "ports", "urls", "credentials", "rawLogs", "tokens", "subscriptionUrls"]
    }
  };
}
