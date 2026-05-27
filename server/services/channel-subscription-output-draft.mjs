import { buildChannelRuntimeEvidenceBridge } from "./channel-runtime-evidence-bridge.mjs";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function draftError() {
  return new Error("channel subscription output draft requires safe channel evidence");
}

function slimCandidate(candidate, extra = {}) {
  const payload = {
    name: text(candidate.name),
    protocol: text(candidate.protocol),
    qualityClass: text(candidate.qualityClass),
    qualityTier: text(candidate.qualityTier),
    channelScore: Number.isFinite(Number(candidate.channelScore)) ? Number(candidate.channelScore) : null,
    targetLabel: text(candidate.targetLabel),
    lifecycleStatus: text(candidate.lifecycleStatus),
    nextGate: text(candidate.nextGate),
    reasonCodes: list(candidate.reasonCodes).map(text),
    blockers: list(candidate.blockers).map(text),
    ...extra
  };

  for (const key of Object.keys(payload)) {
    if (payload[key] === "" || (Array.isArray(payload[key]) && payload[key].length === 0)) {
      delete payload[key];
    }
  }
  return payload;
}

function draftStatus({ baselinePool, canaryPool, blockedPool }) {
  if (baselinePool.length > 0 && canaryPool.length > 0 && blockedPool.length === 0) {
    return "draft_ready_for_runtime_gate_review";
  }
  return "blocked_before_subscription_output_draft";
}

function nextGateFor(status, gatePacket) {
  const ready = status === "draft_ready_for_runtime_gate_review";
  return {
    risk: "A",
    gate: ready ? "risk_a_channel_runtime_canary" : "resolve_channel_subscription_output_draft_blockers",
    requiredNextAction: ready ? text(gatePacket.requiredNextAction) : "resolve_channel_subscription_output_draft_blockers",
    approvalRequired: ready,
    exactApprovalRequired: ready,
    subscriptionOutputActivationApproved: false,
    approvalTextIncluded: false,
    approvalSubmissionRoute: null,
    executionRoute: null,
    runbook: ready ? "docs/CHANNEL_RUNTIME_CANARY_RUNBOOK.md" : "docs/CHANNEL_STRATEGY_ENGINE.md"
  };
}

export function buildChannelSubscriptionOutputDraft({
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
    throw draftError();
  }

  const registry = bridge.channelSystem.outputs.runtimeRegistry;
  const gatePacket = bridge.channelSystem.outputs.runtimeGatePacket;
  const baselinePool = registry.selectedBaseline ? [slimCandidate(registry.selectedBaseline)] : [];
  const canaryPool = list(registry.canaryReadyCandidates).map((candidate) => slimCandidate(candidate));
  const privatePool = list(registry.privateCandidates).map((candidate) => slimCandidate(candidate));
  const blockedPool = [
    ...list(registry.runtimeBlockedCandidates),
    ...list(registry.missingRuntimeInventoryCandidates),
    ...list(registry.holdBlockers)
  ].map((candidate) => slimCandidate(candidate));
  const status = draftStatus({ baselinePool, canaryPool, blockedPool });

  return {
    ok: true,
    mode: "channel-subscription-output-draft",
    generatedAt,
    sourceGeneratedAt: text(bridge.generatedAt),
    status,
    subscriptionOutputDraft: {
      yamlGenerated: false,
      realSubscriptionOutputChanged: false,
      activationAllowed: false,
      baselinePool,
      canaryPool,
      privatePool,
      blockedPool
    },
    nextGate: nextGateFor(status, gatePacket),
    source: {
      bridgeMode: text(bridge.mode),
      systemMode: text(bridge.channelSystem.mode),
      runtimeRegistryMode: text(registry.mode),
      runtimeGatePacketMode: text(gatePacket.mode)
    },
    safety: {
      advisoryOnly: true,
      summaryOnly: true,
      noRuntimeMutation: true,
      noProductionMutation: true,
      noApprovalSubmission: true,
      noTrafficMovement: true,
      noSubscriptionOutputMutation: true,
      yamlNotGenerated: true,
      requiresSeparateRiskAApproval: true,
      approvalTextIncluded: false,
      omittedFields: ["hosts", "ports", "urls", "credentials", "rawLogs", "tokens", "subscriptionUrls", "yaml"]
    }
  };
}
