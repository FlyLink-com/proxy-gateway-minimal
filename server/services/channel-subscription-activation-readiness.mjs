import { buildChannelSubscriptionOutputDraft } from "./channel-subscription-output-draft.mjs";

const RUNBOOK_PATH = "docs/CHANNEL_RUNTIME_CANARY_RUNBOOK.md";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function activationError() {
  return new Error("channel subscription activation readiness requires safe channel evidence");
}

function candidateReadyForActivation(candidate) {
  return text(candidate.lifecycleStatus) === "runtime_deployed"
    && text(candidate.nextGate) === "subscription_output_activation_approval";
}

function blockersFor(draft) {
  const blockers = [];
  const output = draft.subscriptionOutputDraft ?? {};
  const baselinePool = list(output.baselinePool);
  const canaryPool = list(output.canaryPool);
  const blockedPool = list(output.blockedPool);

  if (text(draft.status) !== "draft_ready_for_runtime_gate_review") {
    blockers.push("subscription_output_draft_not_ready");
  }
  if (baselinePool.length === 0) {
    blockers.push("baseline_pool_missing");
  }
  if (canaryPool.length === 0) {
    blockers.push("canary_pool_missing");
  }
  if (blockedPool.length > 0) {
    blockers.push("subscription_output_draft_has_blocked_candidates");
  }
  if (canaryPool.length > 0 && canaryPool.some((candidate) => !candidateReadyForActivation(candidate))) {
    blockers.push("runtime_canary_not_completed");
  }

  return blockers;
}

function requiredNextAction(blockers) {
  if (blockers.includes("runtime_canary_not_completed")) {
    return "complete_runtime_canary_before_subscription_output_activation";
  }
  if (blockers.length > 0) {
    return "resolve_subscription_output_activation_blockers";
  }
  return "request_risk_a_subscription_output_activation_approval";
}

function summarizeOutputDraft(draft) {
  const output = draft.subscriptionOutputDraft ?? {};
  return {
    yamlGenerated: output.yamlGenerated === true,
    realSubscriptionOutputChanged: output.realSubscriptionOutputChanged === true,
    activationAllowed: output.activationAllowed === true,
    baselinePool: list(output.baselinePool),
    canaryPool: list(output.canaryPool),
    privatePool: list(output.privatePool),
    blockedPool: list(output.blockedPool)
  };
}

export function buildChannelSubscriptionActivationReadiness({
  dryRunSummary,
  measurementScore,
  runtimeEvidenceInput,
  generatedAt = new Date().toISOString()
}) {
  let draft;
  try {
    draft = buildChannelSubscriptionOutputDraft({
      dryRunSummary,
      measurementScore,
      runtimeEvidenceInput,
      generatedAt
    });
  } catch {
    throw activationError();
  }

  const subscriptionOutputDraft = summarizeOutputDraft(draft);
  const blockers = blockersFor(draft);
  const ready = blockers.length === 0;

  return {
    ok: true,
    mode: "channel-subscription-activation-readiness",
    generatedAt,
    sourceGeneratedAt: text(draft.generatedAt),
    status: ready
      ? "ready_for_subscription_output_activation_request"
      : "blocked_before_subscription_output_activation",
    readiness: {
      baselineReady: subscriptionOutputDraft.baselinePool.length > 0,
      canaryOutputCandidateCount: subscriptionOutputDraft.canaryPool.length,
      blockedCandidateCount: subscriptionOutputDraft.blockedPool.length,
      runtimeCanaryCompleted: ready,
      blockers
    },
    subscriptionOutputDraft,
    activationGate: {
      risk: "A",
      gate: "risk_a_subscription_output_activation",
      requiredNextAction: requiredNextAction(blockers),
      approvalRequestReady: ready,
      exactApprovalRequired: true,
      executionAuthority: "not_granted",
      approvalTextIncluded: false,
      approvalSubmissionRoute: null,
      executionRoute: null,
      runbook: RUNBOOK_PATH
    },
    source: {
      draftMode: text(draft.mode),
      draftStatus: text(draft.status),
      bridgeMode: text(draft.source?.bridgeMode),
      systemMode: text(draft.source?.systemMode),
      runtimeRegistryMode: text(draft.source?.runtimeRegistryMode),
      runtimeGatePacketMode: text(draft.source?.runtimeGatePacketMode)
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
