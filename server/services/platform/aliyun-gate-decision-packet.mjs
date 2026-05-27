const CLEAN_START_PRIVATE_VALIDATION_APPROVAL =
  "Approve Aliyun clean-start private validation. Allow candidate-only clean-start state initialization and private rendering checks on Aliyun. No DNS change, no public listener exposure, no public Admin, no edge traffic, no AWS mutation, and no historical state copy.";

const PROVIDER_FIREWALL_HARDENING_APPROVAL =
  "Approve Aliyun provider firewall hardening. Restrict inbound to documented management and approved public-boundary ports only. No DNS change, no Nginx public promotion, no production authority transfer, no state copy, no user traffic, no edge traffic, and rollback by restoring the recorded provider firewall rules.";

const APPROVAL_PHRASES_BY_GATE = Object.freeze({
  aliyun_clean_start_private_validation: CLEAN_START_PRIVATE_VALIDATION_APPROVAL,
  aliyun_provider_firewall_hardening: PROVIDER_FIREWALL_HARDENING_APPROVAL
});

const SOURCE_DOCS = {
  cleanStartPrivateValidation:
    "docs/production-replacement-records/2026-05-27-aliyun-clean-start-private-validation-runbook.md",
  providerFirewallHardening:
    "docs/production-replacement-records/2026-05-27-aliyun-provider-firewall-hardening-runbook.md",
  aliyunRunbook: "docs/ALIYUN_USER_SUBSCRIPTION_DISTRIBUTION_RUNBOOK.md"
};

const NOT_AUTHORIZED = [
  "Aliyun runtime mutation",
  "DNS change",
  "provider firewall mutation",
  "public listener exposure",
  "public Admin exposure",
  "AWS mutation",
  "state copy",
  "user traffic",
  "edge traffic"
];

const EXACT_APPROVAL_POLICY = Object.freeze({
  mode: "exact_phrase_for_named_gate",
  phraseBoundToGate: true,
  acceptsShortConfirmation: false,
  approvalSubmissionRoute: null,
  executesGate: false
});

function cleanStartBlockers(cleanStart = {}) {
  const blockers = [];
  if (cleanStart.status !== "ready_for_private_validation") {
    blockers.push("clean-start package is not ready for private validation");
  }
  if (cleanStart.privateRenderingDryRun?.status !== "ready") {
    blockers.push("private rendering dry-run is not ready");
  }
  return blockers;
}

function firewallBlockers(providerFirewall = {}) {
  const blockers = [];
  if (!providerFirewall.hasRollbackSnapshot) {
    blockers.push("missing provider firewall rollback snapshot");
  }
  if (!providerFirewall.managementSource) {
    blockers.push("missing management source decision");
  }
  if (!providerFirewall.wgHomeDecision) {
    blockers.push("missing wg-home decision");
  }
  return blockers;
}

function gateStatus(blockers) {
  return blockers.length === 0 ? "ready_for_operator_approval" : "blocked";
}

function cleanStartSummary(cleanStart = {}) {
  return {
    authorityMode: cleanStart.authorityMode,
    status: cleanStart.status,
    counts: cleanStart.counts || {},
    privateRenderingDryRun: cleanStart.privateRenderingDryRun
      ? {
          status: cleanStart.privateRenderingDryRun.status,
          nodeCount: cleanStart.privateRenderingDryRun.nodeCount,
          protocols: cleanStart.privateRenderingDryRun.protocols || [],
          generatedYamlBytes: cleanStart.privateRenderingDryRun.generatedYamlBytes,
          redacted: cleanStart.privateRenderingDryRun.redacted === true
        }
      : null,
    blockerCount: Array.isArray(cleanStart.blockers) ? cleanStart.blockers.length : 0
  };
}

function providerFirewallSummary(providerFirewall = {}) {
  return {
    hasRollbackSnapshot: providerFirewall.hasRollbackSnapshot === true,
    hasManagementSourceDecision: Boolean(providerFirewall.managementSource),
    hasWgHomeDecision: Boolean(providerFirewall.wgHomeDecision),
    wgHomeDecisionEchoed: false,
    rawRulesEchoed: false
  };
}

export function createAliyunGateDecisionPacket({
  cleanStart,
  providerFirewall = {},
  now
} = {}) {
  const cleanStartGateBlockers = cleanStartBlockers(cleanStart);
  const firewallGateBlockers = firewallBlockers(providerFirewall);
  const cleanStartStatus = gateStatus(cleanStartGateBlockers);
  const firewallStatus = gateStatus(firewallGateBlockers);
  const publicBoundaryBlockers = [];

  if (cleanStartStatus !== "completed") {
    publicBoundaryBlockers.push("clean-start private validation not completed");
  }
  if (firewallStatus !== "completed") {
    publicBoundaryBlockers.push("provider firewall hardening not completed");
  }

  const gates = [
    {
      id: "aliyun_clean_start_private_validation",
      label: "Aliyun clean-start private validation",
      risk: "A",
      status: cleanStartStatus,
      approvalRequired: true,
      approvalPolicy: EXACT_APPROVAL_POLICY,
      requiredApprovalPhrase: CLEAN_START_PRIVATE_VALIDATION_APPROVAL,
      sourceDoc: SOURCE_DOCS.cleanStartPrivateValidation,
      blockers: cleanStartGateBlockers,
      preflightSummary: cleanStartSummary(cleanStart)
    },
    {
      id: "aliyun_provider_firewall_hardening",
      label: "Aliyun provider-firewall hardening",
      risk: "A",
      status: firewallStatus,
      approvalRequired: true,
      approvalPolicy: EXACT_APPROVAL_POLICY,
      requiredApprovalPhrase: PROVIDER_FIREWALL_HARDENING_APPROVAL,
      sourceDoc: SOURCE_DOCS.providerFirewallHardening,
      blockers: firewallGateBlockers,
      preflightSummary: providerFirewallSummary(providerFirewall)
    },
    {
      id: "aliyun_public_boundary_dry_run",
      label: "Aliyun public-boundary dry run",
      risk: "A",
      status: "blocked",
      approvalRequired: true,
      sourceDoc: SOURCE_DOCS.aliyunRunbook,
      blockers: publicBoundaryBlockers
    },
    {
      id: "aliyun_dns_promotion",
      label: "Aliyun DNS and production distribution promotion",
      risk: "A",
      status: "blocked",
      approvalRequired: true,
      sourceDoc: SOURCE_DOCS.aliyunRunbook,
      blockers: [
        "public-boundary dry run not completed",
        "final rollback decision not recorded"
      ]
    }
  ];

  return {
    type: "aliyun_gate_decision_packet",
    status: gates.every((gate) => gate.status === "ready_for_operator_approval")
      ? "ready_for_operator_approval"
      : "blocked",
    generatedAt: now ? new Date(now).toISOString() : new Date().toISOString(),
    redacted: true,
    sourceDocs: [
      SOURCE_DOCS.cleanStartPrivateValidation,
      SOURCE_DOCS.providerFirewallHardening,
      SOURCE_DOCS.aliyunRunbook
    ],
    notAuthorized: NOT_AUTHORIZED,
    gates
  };
}

export function evaluateAliyunGateApprovalPhrase({ gateId, phrase } = {}) {
  if (!Object.hasOwn(APPROVAL_PHRASES_BY_GATE, gateId)) {
    return {
      approved: false,
      gateId,
      reason: "unknown_gate"
    };
  }

  const submittedPhrase = typeof phrase === "string" ? phrase.trim() : "";
  if (submittedPhrase !== APPROVAL_PHRASES_BY_GATE[gateId]) {
    return {
      approved: false,
      gateId,
      reason: "phrase_mismatch"
    };
  }

  return {
    approved: true,
    gateId,
    reason: "exact_phrase_matched"
  };
}
