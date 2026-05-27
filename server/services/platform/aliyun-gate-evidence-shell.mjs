function nowIso(nowFn) {
  return new Date(nowFn()).toISOString();
}

function validationError(message) {
  const error = new Error(message);
  error.code = "validation_error";
  return error;
}

function normalizeProviderFirewallInput(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw validationError("provider firewall evidence must be an object");
  }

  const hasRollbackSnapshot = input.hasRollbackSnapshot === true;
  const hasManagementSourceDecision = String(input.managementSource || "").trim().length > 0
    || input.hasManagementSourceDecision === true;
  const hasWgHomeDecision = String(input.wgHomeDecision || "").trim().length > 0
    || input.hasWgHomeDecision === true;
  const rawRules = Array.isArray(input.rawRules)
    ? input.rawRules.filter((rule) => String(rule || "").trim())
    : [];
  const note = String(input.note || "").trim();

  return {
    hasRollbackSnapshot,
    hasManagementSourceDecision,
    hasWgHomeDecision,
    rawRulesProvided: rawRules.length > 0,
    noteProvided: note.length > 0
  };
}

function summarizeProviderFirewall(record) {
  if (!record) {
    return null;
  }

  const complete = record.hasRollbackSnapshot
    && record.hasManagementSourceDecision
    && record.hasWgHomeDecision;

  return {
    type: "provider_firewall_evidence_summary",
    status: complete ? "ready_for_gate_packet" : "incomplete",
    hasRollbackSnapshot: record.hasRollbackSnapshot,
    hasManagementSourceDecision: record.hasManagementSourceDecision,
    hasWgHomeDecision: record.hasWgHomeDecision,
    rawRulesProvided: record.rawRulesProvided,
    rawRulesEchoed: false,
    noteProvided: record.noteProvided,
    recordedAt: record.recordedAt,
    updatedAt: record.updatedAt
  };
}

function evidenceSummary(providerFirewall) {
  return {
    type: "aliyun_gate_evidence_summary",
    providerFirewall: summarizeProviderFirewall(providerFirewall)
  };
}

export function createPlatformAliyunGateEvidenceShell({
  nowFn = () => new Date()
} = {}) {
  let providerFirewall = null;

  return {
    recordProviderFirewallEvidence(input = {}) {
      const normalized = normalizeProviderFirewallInput(input);
      const timestamp = nowIso(nowFn);
      providerFirewall = {
        ...normalized,
        recordedAt: providerFirewall?.recordedAt || timestamp,
        updatedAt: timestamp
      };

      return evidenceSummary(providerFirewall);
    },

    summary() {
      return evidenceSummary(providerFirewall);
    },

    providerFirewallEvidenceForDecisionPacket() {
      if (!providerFirewall) {
        return {};
      }

      return {
        hasRollbackSnapshot: providerFirewall.hasRollbackSnapshot,
        ...(providerFirewall.hasManagementSourceDecision ? { managementSource: true } : {}),
        ...(providerFirewall.hasWgHomeDecision ? { wgHomeDecision: true } : {})
      };
    }
  };
}
