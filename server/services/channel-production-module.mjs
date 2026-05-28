function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

const FORBIDDEN_CANARY_EVIDENCE_KEYS = new Set([
  "credential",
  "credentials",
  "host",
  "hosts",
  "password",
  "privatekey",
  "port",
  "ports",
  "rawlog",
  "rawlogs",
  "secret",
  "secrets",
  "subscriptionurl",
  "subscriptionurls",
  "token",
  "tokens",
  "url",
  "urls",
  "uuid",
  "yaml"
]);

function normalizedKey(key) {
  return text(key).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function assertNoForbiddenCanaryEvidenceKeys(value) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      assertNoForbiddenCanaryEvidenceKeys(entry);
    }
    return;
  }

  if (!isObject(value)) {
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_CANARY_EVIDENCE_KEYS.has(normalizedKey(key))) {
      throw new Error("channel production module canary evidence contains unsupported sensitive fields");
    }
    assertNoForbiddenCanaryEvidenceKeys(entry);
  }
}

function activationPackageReady(activationPackage) {
  return activationPackage?.ok === true
    && text(activationPackage.mode) === "channel-subscription-activation-package"
    && text(activationPackage.status) === "ready_for_risk_a_subscription_output_activation_request"
    && activationPackage.package?.approvalRequestReady === true
    && activationPackage.package?.renderProofReady === true
    && activationPackage.package?.recordTemplateReady === true
    && activationPackage.safety?.noProductionMutation === true
    && activationPackage.safety?.noRuntimeMutation === true
    && activationPackage.safety?.noSubscriptionOutputMutation === true
    && activationPackage.safety?.yamlNotReturned === true;
}

function shortCanaryPassed(canaryEvidence) {
  const sampleCount = number(canaryEvidence?.sampleCount);
  const successCount = number(canaryEvidence?.successCount);
  const failedCount = number(canaryEvidence?.failedCount);
  const logErrorCount = number(canaryEvidence?.logErrorCount);

  return sampleCount > 0
    && successCount === sampleCount
    && failedCount === 0
    && logErrorCount === 0
    && canaryEvidence?.runtimeActive === true;
}

function candidateExistsInActivationPackage(activationPackage, canaryEvidence) {
  const candidateName = text(canaryEvidence?.candidateName);
  const protocol = text(canaryEvidence?.protocol).toLowerCase();
  return list(activationPackage?.renderProof?.canary).some((candidate) => (
    text(candidate.name) === candidateName
    && text(candidate.protocol).toLowerCase() === protocol
  ));
}

function blockersFor({ activationPackage, canaryEvidence }) {
  const blockers = [];
  if (!activationPackageReady(activationPackage)) {
    blockers.push("activation_package_not_ready");
  }
  if (!shortCanaryPassed(canaryEvidence)) {
    blockers.push("short_canary_not_clean");
  }
  if (!candidateExistsInActivationPackage(activationPackage, canaryEvidence)) {
    blockers.push("candidate_missing_from_activation_package");
  }
  return blockers;
}

function packageProtocolCounts(activationPackage) {
  const counts = activationPackage?.renderProof?.protocolCounts;
  return isObject(counts) ? counts : {};
}

function safetyFlags() {
  return {
    advisoryOnly: true,
    summaryOnly: true,
    productionModuleOnly: true,
    noRuntimeMutation: true,
    noProductionMutation: true,
    noApprovalSubmission: true,
    noTrafficMovement: true,
    noSubscriptionOutputMutation: true,
    yamlReturned: false,
    yamlNotReturned: true,
    credentialsReturned: false,
    requiresSeparateRiskAApproval: true,
    omittedFields: [
      "hosts",
      "ports",
      "urls",
      "credentials",
      "rawLogs",
      "tokens",
      "subscriptionUrls",
      "yaml"
    ]
  };
}

export function buildChannelProductionModule({
  activationPackage,
  canaryEvidence,
  generatedAt = new Date().toISOString()
}) {
  if (!isObject(activationPackage) || !isObject(canaryEvidence)) {
    throw new Error("channel production module requires safe activation package and canary evidence");
  }

  assertNoForbiddenCanaryEvidenceKeys(canaryEvidence);

  const blockers = blockersFor({ activationPackage, canaryEvidence });
  const ready = blockers.length === 0;
  const protocol = text(canaryEvidence.protocol).toLowerCase();

  return {
    ok: true,
    mode: "channel-production-module",
    generatedAt,
    status: ready
      ? "ready_for_production_module_branch_review"
      : "blocked_before_production_module_branch_review",
    blockers,
    productionModule: {
      candidateName: text(canaryEvidence.candidateName),
      protocol,
      targetLabel: text(canaryEvidence.targetLabel),
      shortCanaryPassed: shortCanaryPassed(canaryEvidence),
      activationPackageReady: activationPackageReady(activationPackage),
      productionActivationReady: false,
      sampleSummary: {
        sampleCount: number(canaryEvidence.sampleCount),
        successCount: number(canaryEvidence.successCount),
        failedCount: number(canaryEvidence.failedCount),
        p50TotalSec: number(canaryEvidence.p50TotalSec),
        p95TotalSec: number(canaryEvidence.p95TotalSec),
        maxTotalSec: number(canaryEvidence.maxTotalSec),
        logErrorCount: number(canaryEvidence.logErrorCount)
      },
      packageProtocolCounts: packageProtocolCounts(activationPackage)
    },
    nextGate: {
      risk: "A",
      gate: ready
        ? "risk_a_subscription_output_activation_or_extended_measurement"
        : "resolve_channel_production_module_blockers",
      requiredNextAction: ready
        ? "review_production_module_branch_then_request_extended_measurement_or_subscription_output_activation_approval"
        : "resolve_channel_production_module_blockers",
      approvalRequired: ready,
      exactApprovalRequired: ready,
      executionAuthority: "not_granted",
      approvalSubmissionRoute: null,
      executionRoute: null,
      executesGate: false,
      productionBranchSuggested: ready,
      runbook: "docs/CHANNEL_RUNTIME_CANARY_RUNBOOK.md"
    },
    source: {
      activationPackageMode: text(activationPackage.mode),
      activationPackageStatus: text(activationPackage.status),
      canaryEvidenceMode: text(canaryEvidence.mode)
    },
    safety: safetyFlags()
  };
}
