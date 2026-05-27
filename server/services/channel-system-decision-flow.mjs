import { buildChannelRuntimeGatePacket } from "./channel-runtime-gate-packet.mjs";
import { buildChannelRuntimeInventorySummary } from "./channel-runtime-inventory-summary.mjs";
import { buildChannelRuntimeRegistry } from "./channel-runtime-registry.mjs";

function text(value) {
  return String(value ?? "").trim();
}

function readinessFromGatePacket(packet) {
  const evidence = packet.gateEvidence ?? {};
  return {
    runtimeGateStatus: text(packet.gateStatus),
    selectedBaselineReady: evidence.selectedBaselineReady === true,
    canaryReadyCount: Number(evidence.canaryReadyCount) || 0,
    runtimeBlockedCount: Number(evidence.runtimeBlockedCount) || 0,
    missingRuntimeInventoryCount: Number(evidence.missingRuntimeInventoryCount) || 0
  };
}

export function buildChannelSystemDecisionFlow({
  dryRunSummary,
  measurementScore,
  runtimeInventoryInput,
  generatedAt = new Date().toISOString()
}) {
  const runtimeInventorySummary = buildChannelRuntimeInventorySummary(runtimeInventoryInput);
  const runtimeRegistry = buildChannelRuntimeRegistry({
    dryRunSummary,
    measurementScore,
    runtimeInventory: runtimeInventorySummary,
    generatedAt
  });
  const runtimeGatePacket = buildChannelRuntimeGatePacket({
    runtimeRegistry,
    generatedAt
  });

  return {
    ok: true,
    mode: "channel-system-decision-flow",
    generatedAt,
    flowStatus: text(runtimeGatePacket.gateStatus),
    requiredNextAction: text(runtimeGatePacket.requiredNextAction),
    systemReadiness: readinessFromGatePacket(runtimeGatePacket),
    outputs: {
      runtimeInventorySummary,
      runtimeRegistry,
      runtimeGatePacket
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
