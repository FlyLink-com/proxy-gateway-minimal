import { buildChannelSubscriptionActivationHandoff } from "./channel-subscription-activation-handoff.mjs";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function activationFlowError() {
  return new Error("channel subscription activation flow requires safe handoff evidence");
}

function flowStatus(handoff) {
  return handoff?.handoff?.nextGate?.approvalRequestReady === true
    ? "ready_for_a_tier_subscription_output_activation_request"
    : "blocked_before_a_tier_subscription_output_activation_request";
}

function requiredNextAction(handoff) {
  return handoff?.handoff?.nextGate?.approvalRequestReady === true
    ? "request_risk_a_subscription_output_activation_approval"
    : text(handoff?.handoff?.requiredNextAction);
}

export function buildChannelSubscriptionActivationFlow({
  dryRunSummary,
  measurementScore,
  runtimeEvidenceInput,
  generatedAt = new Date().toISOString()
}) {
  let handoff;
  try {
    handoff = buildChannelSubscriptionActivationHandoff({
      dryRunSummary,
      measurementScore,
      runtimeEvidenceInput,
      generatedAt
    });
  } catch {
    throw activationFlowError();
  }

  const nextGate = handoff.handoff.nextGate ?? {};

  return {
    ok: true,
    mode: "channel-subscription-activation-flow",
    generatedAt,
    sourceGeneratedAt: text(handoff.generatedAt),
    flowStatus: flowStatus(handoff),
    requiredNextAction: requiredNextAction(handoff),
    blockers: list(handoff.handoff.blockers),
    stages: {
      runtimeEvidenceBridge: {
        mode: text(handoff.source.bridgeMode),
        status: "reviewed"
      },
      subscriptionOutputDraft: {
        mode: text(handoff.source.draftMode),
        status: handoff.handoff.counts.baselinePool > 0 && handoff.handoff.counts.canaryPool > 0
          ? "draft_ready_for_activation_review"
          : "draft_blocked_before_activation_review"
      },
      activationReadiness: {
        mode: text(handoff.source.readinessMode),
        status: text(handoff.source.readinessStatus)
      },
      activationHandoff: {
        mode: text(handoff.mode),
        status: text(handoff.handoff.status)
      }
    },
    gate: {
      risk: text(nextGate.risk),
      gate: text(nextGate.gate),
      approvalRequestReady: nextGate.approvalRequestReady === true,
      exactApprovalRequired: nextGate.exactApprovalRequired === true,
      executionAuthority: text(handoff.handoff.executionAuthority),
      approvalTextIncluded: nextGate.approvalTextIncluded === true,
      approvalSubmissionRoute: null,
      subscriptionOutputExecutionRoute: null,
      executesGate: false,
      runbook: text(nextGate.runbook)
    },
    outputs: {
      activationHandoff: handoff
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
      omittedFields: ["hosts", "ports", "urls", "credentials", "rawLogs", "tokens", "subscriptionUrls", "yaml"]
    }
  };
}
