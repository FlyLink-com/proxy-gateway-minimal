import { buildChannelRuntimeGateWorkbench } from "./channel-runtime-gate-workbench.mjs";

const RUNBOOK_PATH = "docs/CHANNEL_RUNTIME_CANARY_RUNBOOK.md";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function handoffError() {
  return new Error("channel runtime execution handoff requires safe gate evidence");
}

function handoffStatus(workbench) {
  return workbench?.gate?.approvalRequestReady === true
    ? "ready_for_operator_approval_request"
    : "blocked_before_operator_approval_request";
}

export function buildChannelRuntimeExecutionHandoff({
  dryRunSummary,
  measurementScore,
  runtimeEvidenceInput,
  generatedAt = new Date().toISOString()
}) {
  let workbench;
  try {
    workbench = buildChannelRuntimeGateWorkbench({
      dryRunSummary,
      measurementScore,
      runtimeEvidenceInput,
      generatedAt
    });
  } catch {
    throw handoffError();
  }

  const approvalReady = workbench.gate.approvalRequestReady === true;

  return {
    ok: true,
    mode: "channel-runtime-execution-handoff-packet",
    generatedAt,
    sourceGeneratedAt: text(workbench.generatedAt),
    handoff: {
      status: handoffStatus(workbench),
      requiredNextAction: text(workbench.gate.requiredNextAction),
      executionAuthority: "not_granted",
      counts: {
        canaryReady: Number(workbench.gate.counts.canaryReady) || 0,
        runtimeBlocked: Number(workbench.gate.counts.runtimeBlocked) || 0,
        missingRuntimeInventory: Number(workbench.gate.counts.missingRuntimeInventory) || 0
      },
      nextGate: {
        risk: "A",
        gate: "risk_a_channel_runtime_canary",
        approvalRequestReady: approvalReady,
        exactApprovalRequired: true,
        approvalTextIncluded: false,
        approvalSubmissionRoute: null,
        runtimeExecutionRoute: null,
        executesGate: false,
        runbook: RUNBOOK_PATH
      }
    },
    checklists: {
      preflight: [
        "confirm_channel_runtime_canary_runbook",
        "refresh_runtime_inventory_before_execution",
        "confirm_candidate_matches_handoff_packet",
        "prepare_dated_execution_record"
      ],
      validation: [
        "record_operator_device_canary_metrics",
        "record_runtime_service_health",
        "record_import_validation_result",
        "record_no_production_traffic_moved"
      ],
      rollback: [
        "document_runtime_cleanup_or_retain_decision",
        "record_firewall_or_port_revert_plan",
        "record_subscription_output_unchanged",
        "record_traffic_cutover_not_performed"
      ]
    },
    candidates: {
      approvalReady: list(workbench.candidates.approvalReady),
      blocked: list(workbench.candidates.blocked),
      missingInventory: list(workbench.candidates.missingInventory)
    },
    source: {
      workbenchMode: text(workbench.mode),
      bridgeMode: text(workbench.source.bridgeMode),
      systemMode: text(workbench.source.systemMode),
      gatePacketMode: text(workbench.source.gatePacketMode)
    },
    safety: {
      advisoryOnly: true,
      summaryOnly: true,
      noRuntimeMutation: true,
      noProductionMutation: true,
      noApprovalSubmission: true,
      noTrafficMovement: true,
      requiresSeparateRiskAApproval: true,
      approvalTextIncluded: false,
      omittedFields: ["hosts", "ports", "urls", "credentials", "rawLogs", "tokens", "subscriptionUrls"]
    }
  };
}
