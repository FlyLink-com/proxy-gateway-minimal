import { buildChannelDecisionPack } from "./channel-decision-pack.mjs";

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return String(value ?? "").trim();
}

function bool(value) {
  return value === true;
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

function assertRuntimeInventory(inventory) {
  if (!isObject(inventory) || inventory.mode !== "channel-runtime-inventory-summary" || !Array.isArray(inventory.records)) {
    throw new Error("channel runtime registry requires a channel runtime inventory summary");
  }
}

function keyFor(name, protocol) {
  return `${text(protocol)}\u0000${text(name)}`;
}

function safeRuntimeRecord(record) {
  return {
    candidateName: text(record.candidateName),
    protocol: text(record.protocol),
    targetLabel: text(record.targetLabel),
    lifecycleStatus: text(record.lifecycleStatus),
    deploymentReady: bool(record.deploymentReady),
    blockers: uniqueText(record.blockers),
    nextGate: text(record.nextGate)
  };
}

function runtimeRecordByCandidate(inventory) {
  const byKey = new Map();
  for (const rawRecord of inventory.records) {
    if (!isObject(rawRecord)) continue;
    const record = safeRuntimeRecord(rawRecord);
    if (!record.candidateName || !record.protocol) continue;
    byKey.set(keyFor(record.candidateName, record.protocol), record);
  }
  return byKey;
}

function baseCandidate(candidate, record) {
  const payload = {
    name: text(candidate.name),
    protocol: text(candidate.protocol),
    qualityClass: text(candidate.qualityClass),
    qualityTier: text(candidate.qualityTier),
    channelScore: Number.isFinite(Number(candidate.channelScore)) ? Number(candidate.channelScore) : null,
    lifecycleStatus: text(record.lifecycleStatus),
    targetLabel: text(record.targetLabel),
    nextGate: text(record.nextGate),
    reasonCodes: uniqueText(candidate.reasonCodes)
  };

  if (!payload.qualityClass) delete payload.qualityClass;
  if (!payload.qualityTier) delete payload.qualityTier;
  if (!payload.lifecycleStatus) delete payload.lifecycleStatus;
  if (!payload.targetLabel) delete payload.targetLabel;
  if (!payload.nextGate) delete payload.nextGate;
  return payload;
}

function blockedCandidate(candidate, record) {
  return {
    ...baseCandidate(candidate, record),
    blockers: record.blockers
  };
}

function missingInventoryCandidate(candidate) {
  return {
    name: text(candidate.name),
    protocol: text(candidate.protocol),
    qualityClass: text(candidate.qualityClass),
    qualityTier: text(candidate.qualityTier),
    channelScore: Number.isFinite(Number(candidate.channelScore)) ? Number(candidate.channelScore) : null,
    reasonCodes: uniqueText([...(candidate.reasonCodes ?? []), "missing_runtime_inventory"])
  };
}

function requiredNextAction({ canaryReadyCandidates, runtimeBlockedCandidates, missingRuntimeInventoryCandidates, decisionPack }) {
  if (runtimeBlockedCandidates.length > 0) {
    return "resolve_runtime_inventory_blockers";
  }
  if (missingRuntimeInventoryCandidates.length > 0) {
    return "collect_runtime_inventory";
  }
  if (canaryReadyCandidates.length > 0) {
    return "request_risk_a_runtime_canary_approval";
  }
  return decisionPack.requiredNextAction;
}

export function buildChannelRuntimeRegistry({
  dryRunSummary,
  measurementScore,
  runtimeInventory,
  generatedAt = new Date().toISOString()
}) {
  assertRuntimeInventory(runtimeInventory);

  const decisionPack = buildChannelDecisionPack({
    dryRunSummary,
    measurementScore,
    generatedAt
  });
  const runtimeByCandidate = runtimeRecordByCandidate(runtimeInventory);
  const canaryReadyCandidates = [];
  const runtimeBlockedCandidates = [];
  const missingRuntimeInventoryCandidates = [];

  for (const candidate of decisionPack.canaryCandidates) {
    const record = runtimeByCandidate.get(keyFor(candidate.name, candidate.protocol));
    if (!record) {
      missingRuntimeInventoryCandidates.push(missingInventoryCandidate(candidate));
      continue;
    }
    if (record.deploymentReady) {
      canaryReadyCandidates.push(baseCandidate(candidate, record));
    } else {
      runtimeBlockedCandidates.push(blockedCandidate(candidate, record));
    }
  }

  const systemReadiness = {
    selectedBaselineReady: Boolean(decisionPack.selectedBaseline),
    canaryReadyCount: canaryReadyCandidates.length,
    runtimeBlockedCount: runtimeBlockedCandidates.length,
    missingRuntimeInventoryCount: missingRuntimeInventoryCandidates.length,
    requiredNextAction: requiredNextAction({
      canaryReadyCandidates,
      runtimeBlockedCandidates,
      missingRuntimeInventoryCandidates,
      decisionPack
    })
  };

  return {
    ok: true,
    mode: "channel-runtime-registry",
    generatedAt,
    sourceGeneratedAt: decisionPack.sourceGeneratedAt,
    selectedBaseline: decisionPack.selectedBaseline,
    canaryReadyCandidates,
    runtimeBlockedCandidates,
    missingRuntimeInventoryCandidates,
    privateCandidates: decisionPack.privateCandidates,
    holdBlockers: decisionPack.holdBlockers,
    systemReadiness,
    safety: {
      advisoryOnly: true,
      noRuntimeMutation: true,
      noProductionMutation: true,
      requiresRiskAForRuntime: true,
      omittedFields: ["hosts", "ports", "credentials", "rawErrors", "tokens", "subscriptionUrls"]
    },
    sourceDecisionPack: {
      mode: decisionPack.mode,
      requiredNextAction: decisionPack.requiredNextAction,
      candidateReport: decisionPack.candidateReport
    }
  };
}
