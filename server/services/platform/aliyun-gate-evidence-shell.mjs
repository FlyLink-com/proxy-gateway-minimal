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

function nonEmptyStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item) => String(item || "").trim());
}

function hasAnyText(...values) {
  return values.some((value) => {
    if (Array.isArray(value)) {
      return nonEmptyStringArray(value).length > 0;
    }
    return String(value || "").trim().length > 0;
  });
}

function normalizeAccessMigrationInput(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw validationError("access migration evidence must be an object");
  }

  const hasLiveAccessModelInventory = input.hasLiveAccessModelInventory === true;
  const hasApprovedArtifactScope = input.hasApprovedArtifactScope === true;
  const artifactIssuanceCompleted = input.artifactIssuanceCompleted === true;
  const artifactRefreshObservationRecorded = input.artifactRefreshObservationRecorded === true;
  const hasApprovedLegacyRetirementScope = input.hasApprovedLegacyRetirementScope === true;
  const rawUrlsProvided = hasAnyText(
    input.rawUrls,
    input.rawSubscriptionUrls,
    input.rawArtifactUrls,
    input.subscriptionUrl,
    input.artifactUrl
  );
  const rawTokensProvided = hasAnyText(input.rawTokens, input.token, input.subscriptionToken, input.legacyToken);
  const rawArtifactsProvided = hasAnyText(
    input.rawArtifacts,
    input.rawArtifactUrls,
    input.artifactRef,
    input.artifactSecret
  );
  const noteProvided = String(input.note || "").trim().length > 0;

  return {
    hasLiveAccessModelInventory,
    hasApprovedArtifactScope,
    artifactIssuanceCompleted,
    artifactRefreshObservationRecorded,
    hasApprovedLegacyRetirementScope,
    rawUrlsProvided,
    rawTokensProvided,
    rawArtifactsProvided,
    noteProvided
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

function summarizeAccessMigration(record) {
  if (!record) {
    return null;
  }

  const readyForArtifactIssuance = record.hasLiveAccessModelInventory
    && record.hasApprovedArtifactScope;
  const readyForLegacyRetirement = readyForArtifactIssuance
    && record.artifactIssuanceCompleted
    && record.artifactRefreshObservationRecorded
    && record.hasApprovedLegacyRetirementScope;

  return {
    type: "access_migration_evidence_summary",
    status: readyForLegacyRetirement
      ? "ready_for_legacy_retirement_gate"
      : readyForArtifactIssuance
        ? "ready_for_artifact_issuance_gate"
        : "incomplete",
    hasLiveAccessModelInventory: record.hasLiveAccessModelInventory,
    hasApprovedArtifactScope: record.hasApprovedArtifactScope,
    artifactIssuanceCompleted: record.artifactIssuanceCompleted,
    artifactRefreshObservationRecorded: record.artifactRefreshObservationRecorded,
    hasApprovedLegacyRetirementScope: record.hasApprovedLegacyRetirementScope,
    rawUrlsProvided: record.rawUrlsProvided,
    rawUrlsEchoed: false,
    rawTokensProvided: record.rawTokensProvided,
    rawTokensEchoed: false,
    rawArtifactsProvided: record.rawArtifactsProvided,
    rawArtifactsEchoed: false,
    noteProvided: record.noteProvided,
    recordedAt: record.recordedAt,
    updatedAt: record.updatedAt
  };
}

function evidenceSummary(providerFirewall, accessMigration) {
  return {
    type: "aliyun_gate_evidence_summary",
    providerFirewall: summarizeProviderFirewall(providerFirewall),
    accessMigration: summarizeAccessMigration(accessMigration)
  };
}

export function createPlatformAliyunGateEvidenceShell({
  nowFn = () => new Date()
} = {}) {
  let providerFirewall = null;
  let accessMigration = null;

  return {
    recordProviderFirewallEvidence(input = {}) {
      const normalized = normalizeProviderFirewallInput(input);
      const timestamp = nowIso(nowFn);
      providerFirewall = {
        ...normalized,
        recordedAt: providerFirewall?.recordedAt || timestamp,
        updatedAt: timestamp
      };

      return evidenceSummary(providerFirewall, accessMigration);
    },

    recordAccessMigrationEvidence(input = {}) {
      const normalized = normalizeAccessMigrationInput(input);
      const timestamp = nowIso(nowFn);
      accessMigration = {
        ...normalized,
        recordedAt: accessMigration?.recordedAt || timestamp,
        updatedAt: timestamp
      };

      return evidenceSummary(providerFirewall, accessMigration);
    },

    summary() {
      return evidenceSummary(providerFirewall, accessMigration);
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
    },

    accessMigrationEvidenceForDecisionPacket() {
      if (!accessMigration) {
        return {};
      }

      return {
        hasLiveAccessModelInventory: accessMigration.hasLiveAccessModelInventory,
        hasApprovedArtifactScope: accessMigration.hasApprovedArtifactScope,
        artifactIssuanceCompleted: accessMigration.artifactIssuanceCompleted,
        artifactRefreshObservationRecorded: accessMigration.artifactRefreshObservationRecorded,
        hasApprovedLegacyRetirementScope: accessMigration.hasApprovedLegacyRetirementScope
      };
    }
  };
}
