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

export type ProvisioningFormInput = {
  approvalRef: string;
  customerLabel: string;
  customerEmail: string;
  customerChannel: string;
  subscriptionLabel: string;
  plan?: string;
  expiresAt: string;
  nodeId: string;
  note?: string;
};

export type ProvisioningFormPreview = {
  ok: boolean;
  mode: "platform-provisioning-form";
  status: string;
  blockers: string[];
  approvalRef: string;
  customerRef: string;
  form: {
    source: string;
    operatorRef: string;
    plan: string;
    handoffDelivery: string;
    rawCustomerDataReturned: boolean;
  };
  issuanceInput: {
    displayName: string;
    expiresAt: string;
    nodeId: string;
    note: string;
    artifact: {
      create: true;
    };
  } | null;
  execution: {
    command: string;
    nextAction: string;
    requiresRiskAApproval: boolean;
    dbMutationAuthorized: boolean;
    publicAdminRequired: boolean;
  };
  audit: {
    recordType: string;
    approvalRef: string;
    customerRef: string;
    evidenceKinds: string[];
  };
  safety: {
    summaryOnly: boolean;
    formAdapterOnly: boolean;
    noSubscriptionUrl: boolean;
    noRawCustomerData: boolean;
    noSecrets: boolean;
    noDbMutation: boolean;
    noProductionMutation: boolean;
    noApprovalSubmission: boolean;
    requiresSeparateRiskAApprovalForIssuance: boolean;
    omittedFields: string[];
  };
};

export type PortalAccessRequestPlan = "trial" | "monthly" | "yearly";

export type PortalAccessRequestStatus =
  | "pending_admin_review"
  | "approved_pending_delivery"
  | "delivered"
  | "rejected"
  | "cancelled"
  | "expired"
  | "revoked";

export type PortalAccessRequestSummary = {
  id: string;
  type: "portal_access_request_summary";
  portalUserRef: string;
  plan: PortalAccessRequestPlan;
  planLabel: string;
  durationDays: number;
  status: PortalAccessRequestStatus;
  nextAction: string;
  submittedAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  reviewedByRef: string | null;
  safeReasonCode: string | null;
  priorTrialState: string;
  entitlementRef: string | null;
  accessGrantRef: string | null;
  safety: {
    noSubscriptionUrl: boolean;
    noRawCustomerData: boolean;
    noRawHandoffMaterial: boolean;
    noEntitlementCreated: boolean;
    noRuntimeMutation: boolean;
    noProductionMutation: boolean;
  };
};

export type PortalAccessApprovalPreviewInput = {
  reviewedByRef: string;
  approvalRef: string;
  nodeId: string;
};

export type PortalAccessApprovalPreview = {
  ok: boolean;
  mode: "portal-access-request-approval-preview";
  status: "approved_pending_delivery" | string;
  request: Partial<PortalAccessRequestSummary>;
  issuanceInput: Record<string, unknown>;
  approvalRef: string;
  safety: {
    previewOnly: boolean;
    noSubscriptionUrl: boolean;
    noRawHandoffMaterial: boolean;
    noRuntimeMutation: boolean;
    noProductionMutation: boolean;
    requiresSeparateIssuanceExecution: boolean;
  };
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

export type ChannelSubscriptionActivationReadinessInput = ChannelRuntimeEvidenceBridgeInput;

export type ChannelSubscriptionActivationHandoffInput = ChannelRuntimeEvidenceBridgeInput;

export type ChannelSubscriptionActivationFlowInput = ChannelRuntimeEvidenceBridgeInput;

export type ChannelSubscriptionActivationRecordTemplateInput = {
  activationFlowFixture: unknown;
};

export type ChannelSubscriptionActivationPackageInput = ChannelSubscriptionActivationRecordTemplateInput;

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

export type ChannelSubscriptionActivationReadiness = {
  ok: boolean;
  mode: "channel-subscription-activation-readiness";
  generatedAt: string;
  sourceGeneratedAt: string;
  status: string;
  readiness: {
    baselineReady: boolean;
    canaryOutputCandidateCount: number;
    blockedCandidateCount: number;
    runtimeCanaryCompleted: boolean;
    blockers: string[];
  };
  subscriptionOutputDraft: {
    yamlGenerated: boolean;
    realSubscriptionOutputChanged: boolean;
    activationAllowed: boolean;
    baselinePool: ChannelSubscriptionOutputDraftCandidate[];
    canaryPool: ChannelSubscriptionOutputDraftCandidate[];
    privatePool: ChannelSubscriptionOutputDraftCandidate[];
    blockedPool: ChannelSubscriptionOutputDraftCandidate[];
  };
  activationGate: {
    risk: "A" | string;
    gate: string;
    requiredNextAction: string;
    approvalRequestReady: boolean;
    exactApprovalRequired: boolean;
    executionAuthority: string;
    approvalTextIncluded: boolean;
    approvalSubmissionRoute: string | null;
    executionRoute: string | null;
    runbook: string;
  };
  source: {
    draftMode: string;
    draftStatus: string;
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

export type ChannelSubscriptionActivationHandoff = {
  ok: boolean;
  mode: "channel-subscription-activation-handoff-packet";
  generatedAt: string;
  sourceGeneratedAt: string;
  handoff: {
    status: string;
    requiredNextAction: string;
    executionAuthority: string;
    blockers: string[];
    counts: {
      baselinePool: number;
      canaryPool: number;
      privatePool: number;
      blockedPool: number;
    };
    nextGate: {
      risk: "A" | string;
      gate: string;
      approvalRequestReady: boolean;
      exactApprovalRequired: boolean;
      approvalTextIncluded: boolean;
      approvalSubmissionRoute: string | null;
      subscriptionOutputExecutionRoute: string | null;
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
    baseline: ChannelSubscriptionOutputDraftCandidate[];
    canary: ChannelSubscriptionOutputDraftCandidate[];
    private: ChannelSubscriptionOutputDraftCandidate[];
    blocked: ChannelSubscriptionOutputDraftCandidate[];
  };
  source: {
    readinessMode: string;
    readinessStatus: string;
    draftMode: string;
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

export type ChannelSubscriptionActivationFlow = {
  ok: boolean;
  mode: "channel-subscription-activation-flow";
  generatedAt: string;
  sourceGeneratedAt: string;
  flowStatus: string;
  requiredNextAction: string;
  blockers: string[];
  stages: {
    runtimeEvidenceBridge: {
      mode: string;
      status: string;
    };
    subscriptionOutputDraft: {
      mode: string;
      status: string;
    };
    activationReadiness: {
      mode: string;
      status: string;
    };
    activationHandoff: {
      mode: string;
      status: string;
    };
  };
  gate: {
    risk: "A" | string;
    gate: string;
    approvalRequestReady: boolean;
    exactApprovalRequired: boolean;
    executionAuthority: string;
    approvalTextIncluded: boolean;
    approvalSubmissionRoute: string | null;
    subscriptionOutputExecutionRoute: string | null;
    executesGate: boolean;
    runbook: string;
  };
  outputs: {
    activationHandoff: ChannelSubscriptionActivationHandoff;
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
    omittedFields: string[];
  };
};

export type ChannelSubscriptionActivationRecordTemplate = {
  ok: boolean;
  mode: "channel-subscription-activation-record-template";
  generatedAt: string;
  source: {
    fixtureSchemaVersion: string;
    fixtureGeneratedAt: string;
    sourceGeneratedAt: string;
    flowStatus: string;
    requiredNextAction: string;
  };
  readiness: {
    approvalRequestReady: boolean;
    executionAuthority: string;
    blockers: string[];
  };
  record: {
    title: string;
    suggestedPath: string;
    markdown: string;
  };
  safety: {
    advisoryOnly: boolean;
    summaryOnly: boolean;
    templateOnly: boolean;
    noRuntimeMutation: boolean;
    noProductionMutation: boolean;
    noApprovalSubmission: boolean;
    noTrafficMovement: boolean;
    noSubscriptionOutputMutation: boolean;
    yamlNotGenerated: boolean;
    requiresSeparateRiskAApproval: boolean;
    omittedFields: string[];
  };
};

export type ChannelSubscriptionActivationPackage = {
  ok: boolean;
  mode: "channel-subscription-activation-package";
  generatedAt: string;
  status: string;
  blockers: string[];
  package: {
    renderProofReady: boolean;
    recordTemplateReady: boolean;
    approvalRequestReady: boolean;
    executionAuthority: string;
    requiredNextAction: string;
  };
  renderProof: {
    status: string;
    internalYamlRenderCompleted: boolean;
    yamlReturned: boolean;
    renderedProxyCount: number;
    generatedYamlBytes?: number;
    protocolCounts: Record<string, number>;
    baseline: Array<Record<string, unknown>>;
    canary: Array<Record<string, unknown>>;
  };
  recordTemplate: {
    mode: string;
    title: string;
    suggestedPath: string;
    markdownReturned: boolean;
    approvalRequestReady: boolean;
    executionAuthority: string;
    blockers: string[];
  };
  gate: {
    risk: "A" | string;
    gate: string;
    approvalRequestReady: boolean;
    exactApprovalRequired: boolean;
    executionAuthority: string;
    approvalSubmissionRoute: string | null;
    subscriptionOutputExecutionRoute: string | null;
    executesGate: boolean;
  };
  source: {
    fixtureGeneratedAt: string;
    sourceGeneratedAt: string;
    fixtureSchemaVersion: string;
  };
  safety: {
    advisoryOnly: boolean;
    summaryOnly: boolean;
    packageOnly: boolean;
    renderProofRequired: boolean;
    noRuntimeMutation: boolean;
    noProductionMutation: boolean;
    noApprovalSubmission: boolean;
    noTrafficMovement: boolean;
    noSubscriptionOutputMutation: boolean;
    yamlReturned: boolean;
    yamlNotReturned: boolean;
    recordMarkdownReturned: boolean;
    requiresSeparateRiskAApproval: boolean;
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
