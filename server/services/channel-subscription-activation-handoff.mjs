import { buildChannelSubscriptionActivationReadiness } from "./channel-subscription-activation-readiness.mjs";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function handoffError() {
  return new Error("channel subscription activation handoff requires safe readiness evidence");
}

function handoffStatus(readiness) {
  return readiness?.activationGate?.approvalRequestReady === true
    ? "ready_for_operator_approval_request"
    : "blocked_before_operator_approval_request";
}

function summarizeCounts(readiness) {
  const output = readiness.subscriptionOutputDraft ?? {};
  return {
    baselinePool: list(output.baselinePool).length,
    canaryPool: list(output.canaryPool).length,
    privatePool: list(output.privatePool).length,
    blockedPool: list(output.blockedPool).length
  };
}

export function buildChannelSubscriptionActivationHandoff({
  dryRunSummary,
  measurementScore,
  runtimeEvidenceInput,
  generatedAt = new Date().toISOString()
}) {
  let readiness;
  try {
    readiness = buildChannelSubscriptionActivationReadiness({
      dryRunSummary,
      measurementScore,
      runtimeEvidenceInput,
      generatedAt
    });
  } catch {
    throw handoffError();
  }

  const approvalReady = readiness.activationGate.approvalRequestReady === true;

  return {
    ok: true,
    mode: "channel-subscription-activation-handoff-packet",
    generatedAt,
    sourceGeneratedAt: text(readiness.generatedAt),
    handoff: {
      status: handoffStatus(readiness),
      requiredNextAction: text(readiness.activationGate.requiredNextAction),
      executionAuthority: "not_granted",
      blockers: list(readiness.readiness.blockers),
      counts: summarizeCounts(readiness),
      nextGate: {
        risk: "A",
        gate: "risk_a_subscription_output_activation",
        approvalRequestReady: approvalReady,
        exactApprovalRequired: true,
        approvalTextIncluded: false,
        approvalSubmissionRoute: null,
        subscriptionOutputExecutionRoute: null,
        executesGate: false,
        runbook: text(readiness.activationGate.runbook)
      }
    },
    checklists: {
      preflight: [
        "confirm_channel_subscription_activation_readiness",
        "refresh_runtime_evidence_before_activation_request",
        "confirm_baseline_and_canary_pools_match_handoff_packet",
        "prepare_dated_subscription_output_activation_record"
      ],
      validation: [
        "record_subscription_output_activation_validation",
        "record_controlled_import_refresh_result",
        "record_no_unapproved_traffic_moved",
        "record_legacy_output_compatibility_decision"
      ],
      rollback: [
        "prepare_subscription_output_revert_plan",
        "record_previous_subscription_output_config",
        "record_runtime_cleanup_or_retain_decision",
        "record_dns_and_gateway_unchanged"
      ]
    },
    candidates: {
      baseline: list(readiness.subscriptionOutputDraft.baselinePool),
      canary: list(readiness.subscriptionOutputDraft.canaryPool),
      private: list(readiness.subscriptionOutputDraft.privatePool),
      blocked: list(readiness.subscriptionOutputDraft.blockedPool)
    },
    source: {
      readinessMode: text(readiness.mode),
      readinessStatus: text(readiness.status),
      draftMode: text(readiness.source.draftMode),
      bridgeMode: text(readiness.source.bridgeMode),
      systemMode: text(readiness.source.systemMode),
      runtimeRegistryMode: text(readiness.source.runtimeRegistryMode),
      runtimeGatePacketMode: text(readiness.source.runtimeGatePacketMode)
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
