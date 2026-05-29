import { afterEach, describe, expect, test, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../App";
import { UserPortalPage } from "../features/user-portal/user-portal-page";
import type { AdminApiClient } from "../features/subscriptions/api-client";
import type {
  ChannelLabTargetDecision,
  ChannelRuntimeEvidenceBridge,
  ChannelRuntimeExecutionHandoff,
  ChannelRuntimeGateWorkbench,
  ChannelSubscriptionActivationFlow,
  ChannelSubscriptionActivationHandoff,
  ChannelSubscriptionActivationPackage,
  ChannelSubscriptionActivationRecordTemplate,
  ChannelSubscriptionActivationReadiness,
  ChannelSubscriptionOutputDraft,
  ChannelSystemDecisionFlow,
  CleanEdgeReadinessSummary,
  SubscriptionTenant
} from "../features/subscriptions/types";

afterEach(() => {
  cleanup();
  window.location.hash = "";
  vi.restoreAllMocks();
});

function tenant(overrides: Partial<SubscriptionTenant> = {}): SubscriptionTenant {
  return {
    id: "tenant_portal_1",
    displayName: "portal-user",
    status: "active",
    expiresAt: "2026-06-26T00:00:00.000Z",
    note: "portal self-service onboarding",
    nodeName: "sub-control-a",
    tokenPrefix: "pgsub_portal",
    lastUsedAt: null,
    credentialMode: "shared-node",
    ...overrides
  };
}

function adminClient(overrides: Partial<AdminApiClient> = {}): AdminApiClient {
  return {
    listTenants: async () => [],
    createTenant: async (input) => ({
      tenant: tenant({ displayName: input.displayName, note: input.note, expiresAt: input.expiresAt }),
      subscriptionUrl: "https://sub.example.test/import/visible-once"
    }),
    renewTenant: async (input) => tenant({ id: input.id, expiresAt: input.expiresAt }),
    disableTenant: async (id) => tenant({ id, status: "disabled" }),
    enableTenant: async (id) => tenant({ id, status: "active" }),
    resetToken: async (id) => ({
      tenant: tenant({ id, tokenPrefix: "pgsub_reset" }),
      subscriptionUrl: "https://sub.example.test/import/reset"
    }),
    createTempLink: async (id) => ({
      tenantId: id,
      tokenPrefix: "pgtmp_portal",
      expiresAt: "2026-05-27T00:00:00.000Z",
      subscriptionUrl: "https://sub.example.test/import/temp"
    }),
    listNodes: async () => [],
    getAliyunGates: async () => ({
      type: "aliyun_gate_decision_packet",
      status: "blocked",
      generatedAt: "2026-05-27T00:00:00.000Z",
      redacted: true,
      sourceDocs: [],
      notAuthorized: [],
      gates: []
    }),
    getAliyunGateEvidence: async () => null,
    recordProviderFirewallEvidence: async () => ({
      type: "aliyun_gate_evidence_summary",
      providerFirewall: null,
      accessMigration: null
    }),
    recordAccessMigrationEvidence: async () => ({
      type: "aliyun_gate_evidence_summary",
      providerFirewall: null,
      accessMigration: null
    }),
    reviewChannelSystem: async () => channelSystemDecisionFlow(),
    reviewChannelRuntimeEvidence: async () => channelRuntimeEvidenceBridge(),
    reviewChannelRuntimeGate: async () => channelRuntimeGateWorkbench(),
    reviewChannelRuntimeExecutionHandoff: async () => channelRuntimeExecutionHandoff(),
    reviewChannelSubscriptionActivationFlow: async () => channelSubscriptionActivationFlow(),
    reviewChannelSubscriptionActivationRecordTemplate: async () => channelSubscriptionActivationRecordTemplate(),
    reviewChannelSubscriptionActivationPackage: async () => channelSubscriptionActivationPackage(),
    reviewChannelSubscriptionActivationHandoff: async () => channelSubscriptionActivationHandoff(),
    reviewChannelSubscriptionOutputDraft: async () => channelSubscriptionOutputDraft(),
    reviewChannelSubscriptionActivationReadiness: async () => channelSubscriptionActivationReadiness(),
    reviewChannelLabTargetDecision: async () => channelLabTargetDecision(),
    reviewCleanEdgeReadiness: async () => cleanEdgeReadinessSummary(),
    previewProvisioningForm: async () => ({
      ok: true,
      mode: "platform-provisioning-form",
      status: "ready_for_cli_dry_run",
      blockers: [],
      approvalRef: "PR-265",
      customerRef: "cust_portal",
      form: {
        source: "operator_provisioning_form",
        operatorRef: "operator_portal",
        plan: "pilot",
        handoffDelivery: "operator_visible_once",
        rawCustomerDataReturned: false
      },
      issuanceInput: {
        displayName: "portal-user",
        expiresAt: "2026-06-26T00:00:00.000Z",
        nodeId: "channel-lab-b-tuic",
        note: "portal preview",
        artifact: {
          create: true
        }
      },
      execution: {
        command: "platform:issue-subscription",
        nextAction: "run_cli_dry_run_then_request_risk_a_approval",
        requiresRiskAApproval: true,
        dbMutationAuthorized: false,
        publicAdminRequired: false
      },
      audit: {
        recordType: "operator_provisioning_form_summary",
        approvalRef: "PR-265",
        customerRef: "cust_portal",
        evidenceKinds: ["operator_form_facts", "issuance_input_preview", "risk_a_execution_required"]
      },
      safety: {
        summaryOnly: true,
        formAdapterOnly: true,
        noSubscriptionUrl: true,
        noRawCustomerData: true,
        noSecrets: true,
        noDbMutation: true,
        noProductionMutation: true,
        noApprovalSubmission: true,
        requiresSeparateRiskAApprovalForIssuance: true,
        omittedFields: ["customer.email", "subscriptionUrl", "tokens"]
      }
    }),
    overview: async () => ({
      ok: true,
      total: 0,
      active: 0,
      expiring: 0,
      expired: 0,
      disabled: 0,
      nodes: [],
      distribution: {
        mode: "subscription-v2",
        ready: true,
        eligibleNodes: 1,
        blockedNodes: 0,
        blockers: []
      }
    }),
    ...overrides
  };
}

function cleanEdgeReadinessSummary(): CleanEdgeReadinessSummary {
  return {
    ok: true,
    mode: "clean-edge-readiness-summary",
    generatedAt: "2026-05-27T21:40:00.000Z",
    readiness: {
      preconditionsReady: false,
      approvalRequired: true,
      executionAllowed: false,
      blockers: ["clean edge readiness not reviewed"]
    },
    repoState: {
      branchSynced: false,
      noOpenPrs: false,
      projectStateCheckPassed: false
    },
    subscriptionBoundary: {
      subOnAliyun: false,
      healthOk: false,
      adminBlocked: false,
      rootBlocked: false,
      noTokenRejected: false
    },
    edgeDns: {
      ssSgUnchangedOnOldAws: false
    },
    stoppedNodes: {
      prodEdgeAStopped: false,
      prodEdgeANoPublicIp: false,
      prodEdgeBStopped: false,
      prodEdgeBNoPublicIp: false
    },
    cleanTarget: {
      noTargetSelected: false,
      noTargetProvisioned: false
    },
    approval: {
      exactApprovalReceived: false
    },
    notes: [],
    safety: {
      summaryOnly: true,
      noRuntimeMutation: true,
      noProductionMutation: true,
      noCloudMutation: true,
      noDnsMutation: true,
      noSubscriptionOutputMutation: true,
      noSecretHandling: true,
      omittedFields: ["rawHosts", "rawIps", "rawPorts", "rawSecrets", "tokens", "subscriptionUrls"]
    }
  };
}

function channelSystemDecisionFlow(): ChannelSystemDecisionFlow {
  return {
    ok: true,
    mode: "channel-system-decision-flow",
    generatedAt: "2026-05-27T20:02:00.000Z",
    flowStatus: "blocked",
    requiredNextAction: "collect_runtime_inventory",
    systemReadiness: {
      runtimeGateStatus: "blocked",
      selectedBaselineReady: false,
      canaryReadyCount: 0,
      runtimeBlockedCount: 0,
      missingRuntimeInventoryCount: 1
    },
    outputs: {},
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

function channelRuntimeEvidenceBridge(): ChannelRuntimeEvidenceBridge {
  return {
    ok: true,
    mode: "channel-runtime-evidence-bridge",
    generatedAt: "2026-05-27T20:02:00.000Z",
    sourceGeneratedAt: "2026-05-27T20:01:00.000Z",
    runtimeInventoryInput: {
      generatedAt: "2026-05-27T20:01:00.000Z",
      records: []
    },
    channelSystem: channelSystemDecisionFlow(),
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

function channelRuntimeGateWorkbench(): ChannelRuntimeGateWorkbench {
  return {
    ok: true,
    mode: "channel-runtime-gate-workbench",
    generatedAt: "2026-05-27T20:03:00.000Z",
    sourceGeneratedAt: "2026-05-27T20:02:00.000Z",
    gate: {
      status: "blocked",
      requiredNextAction: "collect_runtime_inventory",
      approvalRequestReady: false,
      counts: {
        canaryReady: 0,
        runtimeBlocked: 0,
        missingRuntimeInventory: 1
      },
      approvalPolicy: {
        risk: "A",
        approvalRequired: false,
        exactPhraseRequired: true,
        approvalPhraseEchoed: false,
        approvalSubmissionRoute: null,
        executesGate: false
      }
    },
    candidates: {
      approvalReady: [],
      blocked: [],
      missingInventory: []
    },
    source: {
      bridgeMode: "channel-runtime-evidence-bridge",
      systemMode: "channel-system-decision-flow",
      gatePacketMode: "channel-runtime-gate-packet"
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

function channelRuntimeExecutionHandoff(): ChannelRuntimeExecutionHandoff {
  return {
    ok: true,
    mode: "channel-runtime-execution-handoff-packet",
    generatedAt: "2026-05-27T20:04:00.000Z",
    sourceGeneratedAt: "2026-05-27T20:03:00.000Z",
    handoff: {
      status: "blocked_before_operator_approval_request",
      requiredNextAction: "collect_runtime_inventory",
      executionAuthority: "not_granted",
      counts: {
        canaryReady: 0,
        runtimeBlocked: 0,
        missingRuntimeInventory: 1
      },
      nextGate: {
        risk: "A",
        gate: "risk_a_channel_runtime_canary",
        approvalRequestReady: false,
        exactApprovalRequired: true,
        approvalTextIncluded: false,
        approvalSubmissionRoute: null,
        runtimeExecutionRoute: null,
        executesGate: false,
        runbook: "docs/CHANNEL_RUNTIME_CANARY_RUNBOOK.md"
      }
    },
    checklists: {
      preflight: ["confirm_channel_runtime_canary_runbook"],
      validation: ["record_operator_device_canary_metrics"],
      rollback: ["document_runtime_cleanup_or_retain_decision"]
    },
    candidates: {
      approvalReady: [],
      blocked: [],
      missingInventory: []
    },
    source: {
      workbenchMode: "channel-runtime-gate-workbench",
      bridgeMode: "channel-runtime-evidence-bridge",
      systemMode: "channel-system-decision-flow",
      gatePacketMode: "channel-runtime-gate-packet"
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

function channelSubscriptionOutputDraft(): ChannelSubscriptionOutputDraft {
  return {
    ok: true,
    mode: "channel-subscription-output-draft",
    generatedAt: "2026-05-27T20:04:30.000Z",
    sourceGeneratedAt: "2026-05-27T20:04:00.000Z",
    status: "blocked_before_subscription_output_draft",
    subscriptionOutputDraft: {
      yamlGenerated: false,
      realSubscriptionOutputChanged: false,
      activationAllowed: false,
      baselinePool: [],
      canaryPool: [],
      privatePool: [],
      blockedPool: []
    },
    nextGate: {
      risk: "A",
      gate: "resolve_channel_subscription_output_draft_blockers",
      requiredNextAction: "resolve_channel_subscription_output_draft_blockers",
      approvalRequired: false,
      exactApprovalRequired: false,
      subscriptionOutputActivationApproved: false,
      approvalTextIncluded: false,
      approvalSubmissionRoute: null,
      executionRoute: null,
      runbook: "docs/CHANNEL_STRATEGY_ENGINE.md"
    },
    source: {
      bridgeMode: "channel-runtime-evidence-bridge",
      systemMode: "channel-system-decision-flow",
      runtimeRegistryMode: "channel-runtime-registry",
      runtimeGatePacketMode: "channel-runtime-gate-packet"
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

function channelSubscriptionActivationReadiness(): ChannelSubscriptionActivationReadiness {
  return {
    ok: true,
    mode: "channel-subscription-activation-readiness",
    generatedAt: "2026-05-27T20:04:40.000Z",
    sourceGeneratedAt: "2026-05-27T20:04:30.000Z",
    status: "blocked_before_subscription_output_activation",
    readiness: {
      baselineReady: false,
      canaryOutputCandidateCount: 0,
      blockedCandidateCount: 0,
      runtimeCanaryCompleted: false,
      blockers: ["baseline_pool_missing", "canary_pool_missing"]
    },
    subscriptionOutputDraft: {
      yamlGenerated: false,
      realSubscriptionOutputChanged: false,
      activationAllowed: false,
      baselinePool: [],
      canaryPool: [],
      privatePool: [],
      blockedPool: []
    },
    activationGate: {
      risk: "A",
      gate: "risk_a_subscription_output_activation",
      requiredNextAction: "resolve_subscription_output_activation_blockers",
      approvalRequestReady: false,
      exactApprovalRequired: true,
      executionAuthority: "not_granted",
      approvalTextIncluded: false,
      approvalSubmissionRoute: null,
      executionRoute: null,
      runbook: "docs/CHANNEL_RUNTIME_CANARY_RUNBOOK.md"
    },
    source: {
      draftMode: "channel-subscription-output-draft",
      draftStatus: "blocked_before_subscription_output_draft",
      bridgeMode: "channel-runtime-evidence-bridge",
      systemMode: "channel-system-decision-flow",
      runtimeRegistryMode: "channel-runtime-registry",
      runtimeGatePacketMode: "channel-runtime-gate-packet"
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

function channelSubscriptionActivationHandoff(): ChannelSubscriptionActivationHandoff {
  return {
    ok: true,
    mode: "channel-subscription-activation-handoff-packet",
    generatedAt: "2026-05-27T20:04:50.000Z",
    sourceGeneratedAt: "2026-05-27T20:04:40.000Z",
    handoff: {
      status: "blocked_before_operator_approval_request",
      requiredNextAction: "resolve_subscription_output_activation_blockers",
      executionAuthority: "not_granted",
      blockers: ["baseline_pool_missing", "canary_pool_missing"],
      counts: {
        baselinePool: 0,
        canaryPool: 0,
        privatePool: 0,
        blockedPool: 0
      },
      nextGate: {
        risk: "A",
        gate: "risk_a_subscription_output_activation",
        approvalRequestReady: false,
        exactApprovalRequired: true,
        approvalTextIncluded: false,
        approvalSubmissionRoute: null,
        subscriptionOutputExecutionRoute: null,
        executesGate: false,
        runbook: "docs/CHANNEL_RUNTIME_CANARY_RUNBOOK.md"
      }
    },
    checklists: {
      preflight: ["confirm_channel_subscription_activation_readiness"],
      validation: ["record_subscription_output_activation_validation"],
      rollback: ["prepare_subscription_output_revert_plan"]
    },
    candidates: {
      baseline: [],
      canary: [],
      private: [],
      blocked: []
    },
    source: {
      readinessMode: "channel-subscription-activation-readiness",
      readinessStatus: "blocked_before_subscription_output_activation",
      draftMode: "channel-subscription-output-draft",
      bridgeMode: "channel-runtime-evidence-bridge",
      systemMode: "channel-system-decision-flow",
      runtimeRegistryMode: "channel-runtime-registry",
      runtimeGatePacketMode: "channel-runtime-gate-packet"
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

function channelSubscriptionActivationFlow(): ChannelSubscriptionActivationFlow {
  return {
    ok: true,
    mode: "channel-subscription-activation-flow",
    generatedAt: "2026-05-27T20:04:55.000Z",
    sourceGeneratedAt: "2026-05-27T20:04:50.000Z",
    flowStatus: "blocked_before_a_tier_subscription_output_activation_request",
    requiredNextAction: "resolve_subscription_output_activation_blockers",
    blockers: ["baseline_pool_missing", "canary_pool_missing"],
    stages: {
      runtimeEvidenceBridge: {
        mode: "channel-runtime-evidence-bridge",
        status: "reviewed"
      },
      subscriptionOutputDraft: {
        mode: "channel-subscription-output-draft",
        status: "draft_blocked_before_activation_review"
      },
      activationReadiness: {
        mode: "channel-subscription-activation-readiness",
        status: "blocked_before_subscription_output_activation"
      },
      activationHandoff: {
        mode: "channel-subscription-activation-handoff-packet",
        status: "blocked_before_operator_approval_request"
      }
    },
    gate: {
      risk: "A",
      gate: "risk_a_subscription_output_activation",
      approvalRequestReady: false,
      exactApprovalRequired: true,
      executionAuthority: "not_granted",
      approvalTextIncluded: false,
      approvalSubmissionRoute: null,
      subscriptionOutputExecutionRoute: null,
      executesGate: false,
      runbook: "docs/CHANNEL_RUNTIME_CANARY_RUNBOOK.md"
    },
    outputs: {
      activationHandoff: channelSubscriptionActivationHandoff()
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

function channelSubscriptionActivationRecordTemplate(): ChannelSubscriptionActivationRecordTemplate {
  return {
    ok: true,
    mode: "channel-subscription-activation-record-template",
    generatedAt: "2026-05-27T20:04:58.000Z",
    source: {
      fixtureSchemaVersion: "channel-subscription-activation-flow-fixture/v1",
      fixtureGeneratedAt: "2026-05-27T20:04:57.000Z",
      sourceGeneratedAt: "2026-05-27T20:04:55.000Z",
      flowStatus: "blocked_before_a_tier_subscription_output_activation_request",
      requiredNextAction: "resolve_subscription_output_activation_blockers"
    },
    readiness: {
      approvalRequestReady: false,
      executionAuthority: "not_granted",
      blockers: ["baseline_pool_missing", "canary_pool_missing"]
    },
    record: {
      title: "Channel Subscription Output Activation Execution Record",
      suggestedPath: "docs/production-replacement-records/2026-05-28-channel-subscription-output-activation.md",
      markdown: "# Channel Subscription Output Activation Execution Record\n\n## Approval Evidence\n\n## Validation Evidence"
    },
    safety: {
      advisoryOnly: true,
      summaryOnly: true,
      templateOnly: true,
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

function channelSubscriptionActivationPackage(): ChannelSubscriptionActivationPackage {
  return {
    ok: true,
    mode: "channel-subscription-activation-package",
    generatedAt: "2026-05-28T10:07:00.000Z",
    status: "ready_for_risk_a_subscription_output_activation_request",
    blockers: [],
    package: {
      renderProofReady: true,
      recordTemplateReady: true,
      approvalRequestReady: true,
      executionAuthority: "not_granted",
      requiredNextAction: "request_risk_a_subscription_output_activation_approval"
    },
    renderProof: {
      status: "render_proof_ready_for_subscription_output_activation_request",
      internalYamlRenderCompleted: true,
      yamlReturned: false,
      renderedProxyCount: 2,
      generatedYamlBytes: 512,
      protocolCounts: { ss: 1, tuic: 1 },
      baseline: [{ name: "ss-baseline", protocol: "ss" }],
      canary: [{ name: "tuic-lab", protocol: "tuic" }]
    },
    recordTemplate: {
      mode: "channel-subscription-activation-record-template",
      title: "Channel Subscription Output Activation Execution Record",
      suggestedPath: "docs/production-replacement-records/2026-05-28-channel-subscription-output-activation.md",
      markdownReturned: false,
      approvalRequestReady: true,
      executionAuthority: "not_granted",
      blockers: []
    },
    gate: {
      risk: "A",
      gate: "risk_a_subscription_output_activation",
      approvalRequestReady: true,
      exactApprovalRequired: true,
      executionAuthority: "not_granted",
      approvalSubmissionRoute: null,
      subscriptionOutputExecutionRoute: null,
      executesGate: false
    },
    source: {
      fixtureGeneratedAt: "2026-05-28T10:05:00.000Z",
      sourceGeneratedAt: "2026-05-28T10:04:00.000Z",
      fixtureSchemaVersion: "channel-subscription-activation-flow-fixture/v1"
    },
    safety: {
      advisoryOnly: true,
      summaryOnly: true,
      packageOnly: true,
      renderProofRequired: true,
      noRuntimeMutation: true,
      noProductionMutation: true,
      noApprovalSubmission: true,
      noTrafficMovement: true,
      noSubscriptionOutputMutation: true,
      yamlReturned: false,
      yamlNotReturned: true,
      recordMarkdownReturned: false,
      requiresSeparateRiskAApproval: true,
      omittedFields: ["hosts", "ports", "urls", "credentials", "rawLogs", "tokens", "subscriptionUrls", "yaml", "recordMarkdown"]
    }
  };
}

function channelLabTargetDecision(): ChannelLabTargetDecision {
  return {
    ok: true,
    mode: "channel-lab-target-decision",
    generatedAt: "2026-05-27T20:05:00.000Z",
    status: "fresh_target_recommended",
    requiredNextAction: "request_channel_lab_b_selection_gate",
    executionAuthority: "not_granted",
    target: {
      targetLabel: "channel-lab-a",
      protocol: "tuic",
      lifecycleStatus: "running",
      reuseRecommendation: "not_recommended"
    },
    blockers: ["ssh_banner_timeout"],
    nextGate: {
      risk: "A",
      gate: "risk_a_channel_lab_b_selection",
      approvalRequired: true,
      approvalTextIncluded: false,
      approvalSubmissionRoute: null,
      runtimeExecutionRoute: null,
      runbook: "docs/CHANNEL_CANARY_SERVER_SELECTION.md"
    },
    alternatives: {
      channelLabAAccessCleanupGate: true,
      freshChannelLabBSelection: true
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

async function enterPortalDashboard() {
  fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: "customer@example.com" } });
  fireEvent.change(screen.getByLabelText("密码"), { target: { value: "correct horse battery staple" } });
  fireEvent.click(screen.getByRole("button", { name: "登录" }));
  return screen.findByRole("navigation", { name: "用户中心导航" });
}

describe("user portal route", () => {
  test("opens a separate customer portal on the EqualDCDN /use-style auth shell", async () => {
    render(createElement(App));

    expect(screen.getByLabelText("Admin navigation").textContent).not.toContain("Portal");

    fireEvent.click(screen.getByRole("link", { name: /open user portal/i }));

    expect(await screen.findByRole("heading", { name: "Log in" })).not.toBeNull();
    expect(screen.getByText("欢迎回来，请登录您的账户")).not.toBeNull();
    expect(screen.getByLabelText("邮箱")).not.toBeNull();
    expect(screen.getByLabelText("密码")).not.toBeNull();
    expect(screen.getByRole("button", { name: "登录" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "立即注册" })).not.toBeNull();
    expect(screen.queryByLabelText("Admin navigation")).toBeNull();
  });
});

describe("user portal onboarding", () => {
  test("switches between login and signup states before entering the dashboard preview", async () => {
    render(createElement(UserPortalPage, { apiClient: adminClient() }));

    fireEvent.click(screen.getByRole("button", { name: "立即注册" }));

    expect(screen.getByRole("heading", { name: "Sign up" })).not.toBeNull();
    expect(screen.getByText("创建新账户，开始使用我们的服务")).not.toBeNull();
    expect(screen.getByLabelText("验证码")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "返回登录" }));

    expect(screen.getByRole("heading", { name: "Log in" })).not.toBeNull();
  });

  test("generates a visible-once subscription from the dashboard-style use page", async () => {
    const createTenant = vi.fn(adminClient().createTenant);
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });

    render(createElement(UserPortalPage, { apiClient: adminClient({ createTenant }) }));

    const portalNav = await enterPortalDashboard();
    expect(within(portalNav).getByText("Dashboard")).not.toBeNull();
    expect(within(portalNav).getByText("订阅管理")).not.toBeNull();
    expect(within(portalNav).getByText("开始使用")).not.toBeNull();
    expect(within(portalNav).getByText("安全清单")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "订阅管理" }));
    fireEvent.click(screen.getByRole("button", { name: /Professional/ }));
    fireEvent.change(screen.getByLabelText("用户邮箱"), { target: { value: "customer@example.com" } });
    fireEvent.change(screen.getByLabelText("显示名称"), { target: { value: "Customer Alpha" } });
    fireEvent.change(screen.getByLabelText("有效期"), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: "生成订阅" }));

    expect(await screen.findByText("订阅链接")).not.toBeNull();
    expect(screen.getByText("国内备用订阅链接")).not.toBeNull();
    expect(screen.getByText("应用下载")).not.toBeNull();
    expect(screen.getByText("使用步骤")).not.toBeNull();
    expect(createTenant).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: "Customer Alpha",
        note: expect.stringContaining("portal plan=professional")
      })
    );
    expect(screen.getAllByText("https://sub.example.test/import/visible-once").length).toBeGreaterThan(0);

    const result = screen.getByRole("region", { name: "开始使用" });
    expect(within(result).getAllByRole("button", { name: "复制" }).length).toBeGreaterThan(0);
    expect(within(result).getAllByText(/Clash/i).length).toBeGreaterThan(0);

    fireEvent.click(within(result).getAllByRole("button", { name: "复制" })[0]);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://sub.example.test/import/visible-once"));
  });

  test("renders device onboarding guides and user-facing FAQ", async () => {
    render(createElement(UserPortalPage, { apiClient: adminClient() }));

    await enterPortalDashboard();
    fireEvent.click(screen.getByRole("button", { name: "开始使用" }));

    expect(screen.getByText("订阅导入指南")).not.toBeNull();
    expect(screen.getByText("Windows / macOS")).not.toBeNull();
    expect(screen.getByText("iOS / Android")).not.toBeNull();
    expect(screen.getByText("常见问题")).not.toBeNull();
    expect(screen.getByText("更新订阅失败怎么办？")).not.toBeNull();
    expect(screen.getByText("为什么有些网站仍显示原 IP？")).not.toBeNull();
  });

  test("separates recommended and forbidden safety actions", async () => {
    render(createElement(UserPortalPage, { apiClient: adminClient() }));

    await enterPortalDashboard();
    fireEvent.click(screen.getByRole("button", { name: "安全清单" }));

    expect(screen.getByText("正确做法")).not.toBeNull();
    expect(screen.getByText("禁止做法")).not.toBeNull();
    expect(screen.getByText("保持订阅链接私密，仅在自己的设备中导入。")).not.toBeNull();
    expect(screen.getByText("不要共享订阅链接或账号。")).not.toBeNull();
  });

  test("shows support and profile placeholders without implying live integrations", async () => {
    render(createElement(UserPortalPage, { apiClient: adminClient() }));

    await enterPortalDashboard();
    fireEvent.click(screen.getByRole("button", { name: "客服支持" }));

    expect(screen.getByText("工单系统")).not.toBeNull();
    expect(screen.getByText("邮箱支持")).not.toBeNull();
    expect(screen.getByText("即时消息")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "个人中心" }));

    expect(screen.getByText("设备管理")).not.toBeNull();
    expect(screen.getByText("账单记录")).not.toBeNull();
    expect(screen.getByText("账号安全")).not.toBeNull();
  });
});
