export type SubscriptionStatus = "active" | "expiring" | "expired" | "disabled";

export type NodeCredentialMode = "shared-node" | "per-user-password" | "per-user-port";

export type SubscriptionTenant = {
  id: string;
  displayName: string;
  status: SubscriptionStatus;
  expiresAt: string;
  note: string;
  nodeName: string;
  tokenPrefix: string;
  lastUsedAt: string | null;
  credentialMode: NodeCredentialMode;
};

export type CreateSubscriptionInput = {
  displayName: string;
  expiresAt: string;
  note: string;
};

export type RenewSubscriptionInput = {
  id: string;
  expiresAt: string;
};

export type ResetTokenResult = {
  tenant: SubscriptionTenant;
  subscriptionUrl: string;
};

export type CreateSubscriptionResult = {
  tenant: SubscriptionTenant;
  subscriptionUrl: string;
};

export type TempLinkResult = {
  tenantId: string;
  tokenPrefix: string;
  expiresAt: string;
  subscriptionUrl: string;
};

export type SubscriptionNode = {
  id: string;
  name: string;
  status: string;
};

export type SubscriptionOverview = {
  ok: boolean;
  total: number;
  active: number;
  expiring: number;
  expired: number;
  disabled: number;
  nodes: SubscriptionNode[];
  distribution: {
    mode: "subscription-v2";
    ready: boolean;
    eligibleNodes: number;
    blockedNodes: number;
    blockers: string[];
  };
};

export type AliyunGateStatus =
  | "blocked"
  | "ready_for_operator_approval"
  | "completed"
  | string;

export type AliyunGateApprovalPolicy = {
  mode: "exact_phrase_for_named_gate" | string;
  phraseBoundToGate: boolean;
  acceptsShortConfirmation: boolean;
  approvalSubmissionRoute: string | null;
  executesGate: boolean;
};

export type AliyunGateDecision = {
  id: string;
  label: string;
  risk: string;
  status: AliyunGateStatus;
  approvalRequired: boolean;
  requiredApprovalPhrase?: string;
  approvalPolicy?: AliyunGateApprovalPolicy;
  sourceDoc: string;
  blockers: string[];
  preflightSummary?: Record<string, unknown>;
};

export type AliyunGateDecisionPacket = {
  type: "aliyun_gate_decision_packet";
  status: AliyunGateStatus;
  generatedAt: string;
  redacted: boolean;
  sourceDocs: string[];
  notAuthorized: string[];
  gates: AliyunGateDecision[];
};

export type ProviderFirewallEvidenceInput = {
  hasRollbackSnapshot: boolean;
  hasManagementSourceDecision: boolean;
  hasWgHomeDecision: boolean;
};

export type AccessMigrationEvidenceInput = {
  hasLiveAccessModelInventory: boolean;
  hasApprovedArtifactScope: boolean;
  artifactIssuanceCompleted: boolean;
  artifactRefreshObservationRecorded: boolean;
  hasApprovedLegacyRetirementScope: boolean;
};

export type ProviderFirewallEvidenceSummary = {
  type: "provider_firewall_evidence_summary";
  status: "incomplete" | "ready_for_gate_packet" | string;
  hasRollbackSnapshot: boolean;
  hasManagementSourceDecision: boolean;
  hasWgHomeDecision: boolean;
  rawRulesProvided: boolean;
  rawRulesEchoed: boolean;
  noteProvided: boolean;
  recordedAt: string;
  updatedAt: string;
};

export type AccessMigrationEvidenceSummary = {
  type: "access_migration_evidence_summary";
  status: "incomplete" | "ready_for_artifact_issuance_gate" | "ready_for_legacy_retirement_gate" | string;
  hasLiveAccessModelInventory: boolean;
  hasApprovedArtifactScope: boolean;
  artifactIssuanceCompleted: boolean;
  artifactRefreshObservationRecorded: boolean;
  hasApprovedLegacyRetirementScope: boolean;
  rawUrlsProvided: boolean;
  rawUrlsEchoed: boolean;
  rawTokensProvided: boolean;
  rawTokensEchoed: boolean;
  rawArtifactsProvided: boolean;
  rawArtifactsEchoed: boolean;
  noteProvided: boolean;
  recordedAt: string;
  updatedAt: string;
};

export type AliyunGateEvidenceSummary = {
  type: "aliyun_gate_evidence_summary";
  providerFirewall: ProviderFirewallEvidenceSummary | null;
  accessMigration: AccessMigrationEvidenceSummary | null;
};

export type ChannelSystemReviewInput = {
  dryRunSummary: unknown;
  measurementScore: unknown;
  runtimeInventoryInput: unknown;
};

export type ChannelRuntimeEvidenceBridgeInput = {
  dryRunSummary: unknown;
  measurementScore: unknown;
  runtimeEvidenceInput: unknown;
};

export type ChannelSubscriptionOutputDraftInput = ChannelRuntimeEvidenceBridgeInput;

export type ChannelLabTargetDecisionInput = {
  generatedAt?: string;
  inventory: unknown;
};

export type ChannelSystemReadiness = {
  runtimeGateStatus: string;
  selectedBaselineReady: boolean;
  canaryReadyCount: number;
  runtimeBlockedCount: number;
  missingRuntimeInventoryCount: number;
};

export type ChannelSystemDecisionFlow = {
  ok: boolean;
  mode: "channel-system-decision-flow";
  generatedAt: string;
  flowStatus: string;
  requiredNextAction: string;
  systemReadiness: ChannelSystemReadiness;
  outputs: Record<string, unknown>;
  safety: {
    advisoryOnly: boolean;
    noRuntimeMutation: boolean;
    noProductionMutation: boolean;
    noApprovalSubmission: boolean;
    noTrafficMovement: boolean;
    requiresSeparateRiskAApproval: boolean;
    omittedFields: string[];
  };
};

export type ChannelRuntimeEvidenceBridge = {
  ok: boolean;
  mode: "channel-runtime-evidence-bridge";
  generatedAt: string;
  sourceGeneratedAt: string;
  runtimeInventoryInput: {
    generatedAt: string;
    records: Array<{
      candidateName: string;
      protocol: string;
      targetLabel: string;
      lifecycleStatus: string;
      deploymentReady: boolean;
      blockers: string[];
      nextGate: string;
    }>;
  };
  channelSystem: ChannelSystemDecisionFlow;
  safety: {
    advisoryOnly: boolean;
    summaryOnly: boolean;
    noRuntimeMutation: boolean;
    noProductionMutation: boolean;
    noApprovalSubmission: boolean;
    noTrafficMovement: boolean;
    requiresSeparateRiskAApproval: boolean;
    omittedFields: string[];
  };
};

export type ChannelRuntimeGateWorkbench = {
  ok: boolean;
  mode: "channel-runtime-gate-workbench";
  generatedAt: string;
  sourceGeneratedAt: string;
  gate: {
    status: string;
    requiredNextAction: string;
    approvalRequestReady: boolean;
    counts: {
      canaryReady: number;
      runtimeBlocked: number;
      missingRuntimeInventory: number;
    };
    approvalPolicy: {
      risk: "A" | string;
      approvalRequired: boolean;
      exactPhraseRequired: boolean;
      approvalPhraseEchoed: boolean;
      approvalSubmissionRoute: string | null;
      executesGate: boolean;
    };
  };
  candidates: {
    approvalReady: Array<Record<string, unknown>>;
    blocked: Array<Record<string, unknown>>;
    missingInventory: Array<Record<string, unknown>>;
  };
  source: {
    bridgeMode: string;
    systemMode: string;
    gatePacketMode: string;
  };
  safety: {
    advisoryOnly: boolean;
    summaryOnly: boolean;
    noRuntimeMutation: boolean;
    noProductionMutation: boolean;
    noApprovalSubmission: boolean;
    noTrafficMovement: boolean;
    requiresSeparateRiskAApproval: boolean;
    approvalPhraseEchoed: boolean;
    omittedFields: string[];
  };
};

export type ChannelRuntimeExecutionHandoff = {
  ok: boolean;
  mode: "channel-runtime-execution-handoff-packet";
  generatedAt: string;
  sourceGeneratedAt: string;
  handoff: {
    status: string;
    requiredNextAction: string;
    executionAuthority: string;
    counts: {
      canaryReady: number;
      runtimeBlocked: number;
      missingRuntimeInventory: number;
    };
    nextGate: {
      risk: "A" | string;
      gate: string;
      approvalRequestReady: boolean;
      exactApprovalRequired: boolean;
      approvalTextIncluded: boolean;
      approvalSubmissionRoute: string | null;
      runtimeExecutionRoute: string | null;
      executesGate: boolean;
      runbook: string;
    };
  };
  checklists: {
    preflight: string[];
    validation: string[];
    rollback: string[];
  };
  candidates: {
    approvalReady: Array<Record<string, unknown>>;
    blocked: Array<Record<string, unknown>>;
    missingInventory: Array<Record<string, unknown>>;
  };
  source: {
    workbenchMode: string;
    bridgeMode: string;
    systemMode: string;
    gatePacketMode: string;
  };
  safety: {
    advisoryOnly: boolean;
    summaryOnly: boolean;
    noRuntimeMutation: boolean;
    noProductionMutation: boolean;
    noApprovalSubmission: boolean;
    noTrafficMovement: boolean;
    requiresSeparateRiskAApproval: boolean;
    approvalTextIncluded: boolean;
    omittedFields: string[];
  };
};

export type ChannelSubscriptionOutputDraftCandidate = {
  name: string;
  protocol: string;
  qualityClass?: string;
  qualityTier?: string;
  channelScore?: number | null;
  targetLabel?: string;
  lifecycleStatus?: string;
  nextGate?: string;
  reasonCodes?: string[];
  blockers?: string[];
};

export type ChannelSubscriptionOutputDraft = {
  ok: boolean;
  mode: "channel-subscription-output-draft";
  generatedAt: string;
  sourceGeneratedAt: string;
  status: string;
  subscriptionOutputDraft: {
    yamlGenerated: boolean;
    realSubscriptionOutputChanged: boolean;
    activationAllowed: boolean;
    baselinePool: ChannelSubscriptionOutputDraftCandidate[];
    canaryPool: ChannelSubscriptionOutputDraftCandidate[];
    privatePool: ChannelSubscriptionOutputDraftCandidate[];
    blockedPool: ChannelSubscriptionOutputDraftCandidate[];
  };
  nextGate: {
    risk: "A" | string;
    gate: string;
    requiredNextAction: string;
    approvalRequired: boolean;
    exactApprovalRequired: boolean;
    subscriptionOutputActivationApproved: boolean;
    approvalTextIncluded: boolean;
    approvalSubmissionRoute: string | null;
    executionRoute: string | null;
    runbook: string;
  };
  source: {
    bridgeMode: string;
    systemMode: string;
    runtimeRegistryMode: string;
    runtimeGatePacketMode: string;
  };
  safety: {
    advisoryOnly: boolean;
    summaryOnly: boolean;
    noRuntimeMutation: boolean;
    noProductionMutation: boolean;
    noApprovalSubmission: boolean;
    noTrafficMovement: boolean;
    noSubscriptionOutputMutation: boolean;
    yamlNotGenerated: boolean;
    requiresSeparateRiskAApproval: boolean;
    approvalTextIncluded: boolean;
    omittedFields: string[];
  };
};

export type ChannelLabTargetDecision = {
  ok: boolean;
  mode: "channel-lab-target-decision";
  generatedAt: string;
  status: string;
  requiredNextAction: string;
  executionAuthority: string;
  target: {
    targetLabel: string;
    protocol: string;
    lifecycleStatus: string;
    reuseRecommendation: string;
  };
  blockers: string[];
  nextGate: {
    risk: "A" | string;
    gate: string;
    approvalRequired: boolean;
    approvalTextIncluded: boolean;
    approvalSubmissionRoute: string | null;
    runtimeExecutionRoute: string | null;
    runbook: string;
  };
  alternatives: {
    channelLabAAccessCleanupGate: boolean;
    freshChannelLabBSelection: boolean;
  };
  safety: {
    advisoryOnly: boolean;
    summaryOnly: boolean;
    noRuntimeMutation: boolean;
    noProductionMutation: boolean;
    noApprovalSubmission: boolean;
    noTrafficMovement: boolean;
    requiresSeparateRiskAApproval: boolean;
    omittedFields: string[];
  };
};

export type CleanEdgeReadinessInput = {
  generatedAt?: string;
  repoState?: {
    branchSynced?: boolean;
    noOpenPrs?: boolean;
    projectStateCheckPassed?: boolean;
  };
  subscriptionBoundary?: {
    subOnAliyun?: boolean;
    healthOk?: boolean;
    adminBlocked?: boolean;
    rootBlocked?: boolean;
    noTokenRejected?: boolean;
  };
  edgeDns?: {
    ssSgUnchangedOnOldAws?: boolean;
  };
  stoppedNodes?: {
    prodEdgeAStopped?: boolean;
    prodEdgeANoPublicIp?: boolean;
    prodEdgeBStopped?: boolean;
    prodEdgeBNoPublicIp?: boolean;
  };
  cleanTarget?: {
    noTargetSelected?: boolean;
    noTargetProvisioned?: boolean;
  };
  approval?: {
    exactApprovalReceived?: boolean;
  };
  notes?: string[];
};

export type CleanEdgeRepoState = {
  branchSynced: boolean;
  noOpenPrs: boolean;
  projectStateCheckPassed: boolean;
};

export type CleanEdgeSubscriptionBoundary = {
  subOnAliyun: boolean;
  healthOk: boolean;
  adminBlocked: boolean;
  rootBlocked: boolean;
  noTokenRejected: boolean;
};

export type CleanEdgeDnsState = {
  ssSgUnchangedOnOldAws: boolean;
};

export type CleanEdgeStoppedNodes = {
  prodEdgeAStopped: boolean;
  prodEdgeANoPublicIp: boolean;
  prodEdgeBStopped: boolean;
  prodEdgeBNoPublicIp: boolean;
};

export type CleanEdgeTargetState = {
  noTargetSelected: boolean;
  noTargetProvisioned: boolean;
};

export type CleanEdgeApprovalState = {
  exactApprovalReceived: boolean;
};

export type CleanEdgeReadinessSummary = {
  ok: boolean;
  mode: "clean-edge-readiness-summary";
  generatedAt: string;
  readiness: {
    preconditionsReady: boolean;
    approvalRequired: boolean;
    executionAllowed: boolean;
    blockers: string[];
  };
  repoState: CleanEdgeRepoState;
  subscriptionBoundary: CleanEdgeSubscriptionBoundary;
  edgeDns: CleanEdgeDnsState;
  stoppedNodes: CleanEdgeStoppedNodes;
  cleanTarget: CleanEdgeTargetState;
  approval: CleanEdgeApprovalState;
  notes: string[];
  safety: {
    summaryOnly: boolean;
    noRuntimeMutation: boolean;
    noProductionMutation: boolean;
    noCloudMutation: boolean;
    noDnsMutation: boolean;
    noSubscriptionOutputMutation: boolean;
    noSecretHandling: boolean;
    omittedFields: string[];
  };
};
