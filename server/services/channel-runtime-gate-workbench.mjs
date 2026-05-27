import { buildChannelRuntimeEvidenceBridge } from "./channel-runtime-evidence-bridge.mjs";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function gatePacketFrom(bridge) {
  return bridge?.channelSystem?.outputs?.runtimeGatePacket ?? {};
}

function countFrom(packet, key) {
  return Number(packet?.gateEvidence?.[key]) || 0;
}

function approvalRequestReady(packet) {
  return text(packet.gateStatus) === "approval_ready"
    && text(packet.requiredNextAction) === "request_risk_a_runtime_canary_approval"
    && countFrom(packet, "canaryReadyCount") > 0
    && countFrom(packet, "runtimeBlockedCount") === 0
    && countFrom(packet, "missingRuntimeInventoryCount") === 0;
}

function bridgeError() {
  return new Error("channel runtime gate workbench requires safe bridge evidence");
}

export function buildChannelRuntimeGateWorkbench({
  dryRunSummary,
  measurementScore,
  runtimeEvidenceInput,
  generatedAt = new Date().toISOString()
}) {
  let bridge;
  try {
    bridge = buildChannelRuntimeEvidenceBridge({
      dryRunSummary,
      measurementScore,
      runtimeEvidenceInput,
      generatedAt
    });
  } catch {
    throw bridgeError();
  }

  const packet = gatePacketFrom(bridge);
  const ready = approvalRequestReady(packet);

  return {
    ok: true,
    mode: "channel-runtime-gate-workbench",
    generatedAt,
    sourceGeneratedAt: text(bridge.generatedAt),
    gate: {
      status: text(packet.gateStatus),
      requiredNextAction: text(packet.requiredNextAction),
      approvalRequestReady: ready,
      counts: {
        canaryReady: countFrom(packet, "canaryReadyCount"),
        runtimeBlocked: countFrom(packet, "runtimeBlockedCount"),
        missingRuntimeInventory: countFrom(packet, "missingRuntimeInventoryCount")
      },
      approvalPolicy: {
        risk: "A",
        approvalRequired: ready,
        exactPhraseRequired: true,
        approvalPhraseEchoed: false,
        approvalSubmissionRoute: null,
        executesGate: false
      }
    },
    candidates: {
      approvalReady: list(packet.approvalReadyCandidates),
      blocked: list(packet.blockedCandidates),
      missingInventory: list(packet.missingInventoryCandidates)
    },
    source: {
      bridgeMode: text(bridge.mode),
      systemMode: text(bridge.channelSystem?.mode),
      gatePacketMode: text(packet.mode)
    },
    safety: {
      advisoryOnly: true,
      summaryOnly: true,
      noRuntimeMutation: true,
      noProductionMutation: true,
      noApprovalSubmission: true,
      noTrafficMovement: true,
      requiresSeparateRiskAApproval: true,
      approvalPhraseEchoed: false,
      omittedFields: ["hosts", "ports", "urls", "credentials", "rawLogs", "tokens", "subscriptionUrls"]
    }
  };
}
