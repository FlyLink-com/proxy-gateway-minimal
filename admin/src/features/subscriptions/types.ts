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
