const SAFE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_:/-]{0,127}$/;
const REVIEW_SURFACES = new Set([
  "provider_upload",
  "admin_view",
  "linear_issue",
  "docs",
  "logs",
  "campaign_params",
  "settlement_reconciliation",
  "unknown"
]);
const FORBIDDEN_FIELD_RULES = [
  {
    label: "customer_private_contact",
    pattern: /(^|_)(customer_)?(email|phone|contact)($|_)/
  },
  {
    label: "subscription_url",
    pattern: /subscription_?url|(^|_)sub_?url($|_)/
  },
  {
    label: "raw_runtime_config",
    pattern: /raw_?runtime_?config|raw_?config|runtime_?config/
  },
  {
    label: "opaque_artifact_material",
    pattern: /opaque_?artifact|artifact_?material|raw_?artifact/
  },
  {
    label: "raw_log_private",
    pattern: /raw_?log|private_?log|log_?dump/
  },
  {
    label: "token",
    pattern: /(^|_)(token|bearer|api_?key|auth_?header)($|_)/
  },
  {
    label: "secret",
    pattern: /secret|private_?key/
  },
  {
    label: "protocol_credential",
    pattern: /credential_?material|protocol_?credential|provider_?credential|(^|_)(web_?dev_?key|dev_?key)($|_)|password/
  },
  {
    label: "sqlite_row_dump",
    pattern: /sqlite|row_?dump/
  },
  {
    label: "private_payment_account",
    pattern: /payment_?account|payout_?account|iban|routing_?number/
  },
  {
    label: "external_url",
    pattern: /(^|_)(redirect_)?url($|_)/
  }
];
const FORBIDDEN_VALUE_RULES = [
  {
    label: "subscription_url",
    pattern: /https?:\/\/\S*\/sub\/|\/sub\/|subscriptionUrl/i
  },
  {
    label: "raw_runtime_config",
    pattern: /\b(vless|hysteria2|tuic|trojan|ss):\/\//i
  },
  {
    label: "token",
    pattern: /\b(token=|bearer\s+|api[_-]?key|auth[_-]?header)\b/i
  },
  {
    label: "secret",
    pattern: /\b(secret|private key|private_key)\b/i
  },
  {
    label: "customer_private_contact",
    pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
  },
  {
    label: "external_url",
    pattern: /https?:\/\//i
  }
];
const SAFE_FIELD_HINTS = /(^|_)(safe|redacted|masked|summary|count|status|ref|refs)($|_)/;
const REVERSAL_EVENT_TYPES = new Set(["refund", "chargeback", "risk_rejected"]);

export const ATTRIBUTION_FORBIDDEN_DATA_LABELS = [
  "secret",
  "token",
  "subscription_url",
  "opaque_artifact_material",
  "protocol_credential",
  "raw_runtime_config",
  "raw_log_private",
  "sqlite_row_dump",
  "password",
  "private_payment_account",
  "customer_private_contact"
];

function guardrailError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function text(value) {
  return String(value ?? "").trim();
}

function normalizeKey(key) {
  return text(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function normalizeSurface(surface) {
  const normalized = text(surface || "unknown").toLowerCase();
  return REVIEW_SURFACES.has(normalized) ? normalized : "unknown";
}

function pathFor(parent, key) {
  if (typeof key === "number") {
    return `${parent}[${key}]`;
  }
  return parent === "$" ? `$.${key}` : `${parent}.${key}`;
}

function safeRef(value) {
  const normalized = text(value);
  return SAFE_REF_PATTERN.test(normalized) ? normalized : null;
}

function addFinding(findings, finding) {
  if (
    finding.label === "external_url" &&
    findings.some((item) => item.path === finding.path && item.label === "subscription_url")
  ) {
    return;
  }
  const exists = findings.some((item) => item.path === finding.path && item.label === finding.label);
  if (!exists) {
    findings.push(finding);
  }
}

function fieldFindingFor(key, path, surface) {
  const normalized = normalizeKey(key);
  if (!normalized) return null;
  for (const rule of FORBIDDEN_FIELD_RULES) {
    if (!rule.pattern.test(normalized)) continue;
    if (rule.label !== "external_url" && SAFE_FIELD_HINTS.test(normalized)) {
      continue;
    }
    return {
      code: "forbidden_field",
      label: rule.label,
      path,
      surface,
      severity: "block"
    };
  }
  return null;
}

function valueFindingFor(value, path, surface) {
  const normalized = text(value);
  if (!normalized) return null;
  for (const rule of FORBIDDEN_VALUE_RULES) {
    if (!rule.pattern.test(normalized)) continue;
    return {
      code: "forbidden_value_shape",
      label: rule.label,
      path,
      surface,
      severity: "block"
    };
  }
  return null;
}

function inspectNode(value, { surface, path, findings }) {
  if (value == null) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectNode(item, { surface, path: pathFor(path, index), findings }));
    return;
  }
  if (typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      const nestedPath = pathFor(path, key);
      const fieldFinding = fieldFindingFor(key, nestedPath, surface);
      if (fieldFinding) addFinding(findings, fieldFinding);
      inspectNode(nested, { surface, path: nestedPath, findings });
    }
    return;
  }
  if (typeof value === "string") {
    const valueFinding = valueFindingFor(value, path, surface);
    if (valueFinding) addFinding(findings, valueFinding);
  }
}

function severityRank(severity) {
  if (severity === "high" || severity === "block") return 3;
  if (severity === "medium" || severity === "review") return 2;
  if (severity === "low") return 1;
  return 0;
}

function riskTierFor(signals) {
  const highest = signals.reduce((rank, signal) => Math.max(rank, severityRank(signal.severity)), 0);
  if (highest >= 3) return "high";
  if (highest === 2) return "elevated";
  if (highest === 1) return "standard";
  return "low";
}

function duplicateSignal(values, code) {
  const counts = new Map();
  for (const value of values || []) {
    const normalized = safeRef(value);
    if (!normalized) continue;
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }
  const duplicateCounts = [...counts.values()].filter((count) => count > 1);
  if (duplicateCounts.length === 0) return null;
  return {
    code,
    severity: "medium",
    duplicateRefCount: duplicateCounts.length,
    maxOccurrences: Math.max(...duplicateCounts)
  };
}

function signal(code, severity, details = {}) {
  return {
    code,
    severity,
    ...details
  };
}

function recordedFact(fact) {
  return !fact.status || fact.status === "recorded";
}

function recordedProviderEvidence(evidence) {
  return !evidence.status || evidence.status === "recorded";
}

function refMatches(actual, expected) {
  return !expected || actual === expected;
}

function optionalRefCompatible(actual, expected) {
  return !actual || !expected || actual === expected;
}

function backendFactMatches(fact, eventType, candidate) {
  if (!fact || fact.eventType !== eventType || !recordedFact(fact)) return false;
  if (!refMatches(fact.orderRef, candidate.orderRef)) return false;
  if (eventType === "payment_success" && !refMatches(fact.paymentRef, candidate.paymentRef)) return false;
  if (eventType === "entitlement_delivered" && !refMatches(fact.entitlementRef, candidate.entitlementRef)) return false;
  if (!optionalRefCompatible(fact.paymentRef, candidate.paymentRef)) return false;
  if (!optionalRefCompatible(fact.partnerRef, candidate.partnerRef)) return false;
  if (!optionalRefCompatible(fact.campaignRef, candidate.campaignRef)) return false;
  if (!optionalRefCompatible(fact.touchRef, candidate.touchRef)) return false;
  return true;
}

function duplicatePaymentFactMatches(fact, candidate) {
  if (!fact || fact.eventType !== "payment_success" || !recordedFact(fact)) return false;
  if (candidate.orderRef) {
    return fact.orderRef === candidate.orderRef;
  }
  if (candidate.paymentRef) {
    return fact.paymentRef === candidate.paymentRef;
  }
  return false;
}

const PROVIDER_ANCHOR_FIELDS = ["touchRef", "accountRef", "orderRef", "paymentRef", "entitlementRef"];
const PROVIDER_COMPATIBLE_FIELDS = ["partnerRef", "campaignRef", ...PROVIDER_ANCHOR_FIELDS];

function providerMatches(evidence, candidate) {
  if (!evidence) return false;
  if (!recordedProviderEvidence(evidence)) return false;
  if (!PROVIDER_COMPATIBLE_FIELDS.every((field) => optionalRefCompatible(evidence[field], candidate[field]))) {
    return false;
  }
  return PROVIDER_ANCHOR_FIELDS.some((field) => evidence[field] && candidate[field] && evidence[field] === candidate[field]);
}

function reversalFactMatches(fact, candidate) {
  if (!fact || !REVERSAL_EVENT_TYPES.has(fact.eventType) || !recordedFact(fact)) return false;
  return ["orderRef", "paymentRef", "entitlementRef"].some((field) => (
    fact[field] && candidate[field] && fact[field] === candidate[field]
  ));
}

function blocker(code, severity = "block") {
  return {
    code,
    severity
  };
}

function sanitizeCandidate(input = {}) {
  return {
    candidateRef: safeRef(input.candidateRef || input.candidate_ref),
    partnerRef: safeRef(input.partnerRef || input.partner_ref),
    campaignRef: safeRef(input.campaignRef || input.campaign_ref),
    orderRef: safeRef(input.orderRef || input.order_ref),
    paymentRef: safeRef(input.paymentRef || input.payment_ref),
    entitlementRef: safeRef(input.entitlementRef || input.entitlement_ref),
    touchRef: safeRef(input.touchRef || input.touch_ref),
    status: text(input.status || "unknown") || "unknown"
  };
}

function summarizeFindings(findings) {
  return findings.map((finding) => ({
    code: finding.code,
    label: finding.label,
    path: finding.path,
    surface: finding.surface,
    severity: finding.severity
  }));
}

export function createPartnerAttributionGuardrails() {
  function inspectPrivacyBoundary({ surface = "unknown", payload = {} } = {}) {
    const normalizedSurface = normalizeSurface(surface);
    const findings = [];
    inspectNode(payload, { surface: normalizedSurface, path: "$", findings });
    const summarized = summarizeFindings(findings);
    summarized.sort((a, b) => a.path.localeCompare(b.path) || a.label.localeCompare(b.label));
    return {
      type: "partner_attribution_privacy_boundary_review",
      surface: normalizedSurface,
      ok: summarized.length === 0,
      findingCount: summarized.length,
      findings: summarized,
      forbiddenDataLabels: ATTRIBUTION_FORBIDDEN_DATA_LABELS,
      rawValuesReturned: false
    };
  }

  function assertPrivacyBoundary(input = {}) {
    const review = inspectPrivacyBoundary(input);
    if (!review.ok) {
      throw guardrailError(
        "privacy_boundary_violation",
        "partner attribution privacy boundary review failed",
        { findings: review.findings }
      );
    }
    return review;
  }

  function summarizeFraudSignals(input = {}) {
    const signals = [];
    const partnerRef = safeRef(input.partnerRef || input.partner_ref);
    const campaignRef = safeRef(input.campaignRef || input.campaign_ref);
    const duplicateAccount = duplicateSignal(input.accountRefs || input.account_refs, "duplicate_account_ref");
    const duplicateOrder = duplicateSignal(input.orderRefs || input.order_refs, "duplicate_order_ref");
    const duplicatePayment = duplicateSignal(input.paymentRefs || input.payment_refs, "duplicate_payment_ref");
    if (duplicateAccount) signals.push(duplicateAccount);
    if (duplicateOrder) signals.push(duplicateOrder);
    if (duplicatePayment) signals.push(duplicatePayment);

    const campaignParams = input.campaignParams || input.campaign_params || {};
    const allowedParams = new Set((input.allowedCampaignParams || input.allowed_campaign_params || []).map(normalizeKey));
    if (allowedParams.size > 0) {
      const unexpected = Object.keys(campaignParams).filter((key) => !allowedParams.has(normalizeKey(key)));
      if (unexpected.length > 0) {
        signals.push(signal("unexpected_campaign_param", "medium", { count: unexpected.length }));
      }
    }
    const campaignPrivacy = inspectPrivacyBoundary({
      surface: "campaign_params",
      payload: campaignParams
    });
    if (!campaignPrivacy.ok) {
      signals.push(signal("unsafe_campaign_param", "high", { findingCount: campaignPrivacy.findingCount }));
    }

    const reversals = input.reversalFacts || input.reversal_facts || [];
    if (
      reversals.length >= 2 ||
      reversals.some((fact) => (
        [fact?.reasonCode, fact?.reason_code, fact?.eventType, fact?.event_type]
          .some((value) => text(value).toLowerCase() === "chargeback")
      ))
    ) {
      signals.push(signal("repeated_reversal", "high", { count: reversals.length }));
    }

    const sessionAnomalies = input.sessionAnomalies || input.session_anomalies || [];
    const anomalyCount = sessionAnomalies.reduce((sum, item) => sum + Math.max(1, Number(item?.count || 0)), 0);
    if (anomalyCount > 0) {
      signals.push(signal("session_anomaly", "medium", { count: anomalyCount }));
    }

    signals.sort((a, b) => a.code.localeCompare(b.code));
    return {
      type: "partner_attribution_fraud_signal_summary",
      partnerRef,
      campaignRef,
      riskTier: riskTierFor(signals),
      manualReviewRequired: signals.length > 0,
      signalCount: signals.length,
      signals,
      rawValuesReturned: false
    };
  }

  function reconcileSettlementEvidence(input = {}) {
    const candidate = sanitizeCandidate(input.candidate || {});
    const providerEvidence = input.providerEvidence || input.provider_evidence || [];
    const recordedProviderEvidenceItems = providerEvidence.filter(recordedProviderEvidence);
    const backendFacts = input.backendFacts || input.backend_facts || [];
    const fraudSignals = input.fraudSignals || input.fraud_signals || null;
    const matchedEvidence = [];
    const blockers = [];

    const privacy = inspectPrivacyBoundary({
      surface: "settlement_reconciliation",
      payload: {
        candidate: input.candidate || {},
        providerEvidence,
        backendFacts
      }
    });
    if (!privacy.ok) {
      blockers.push(blocker("privacy_boundary_violation"));
    }

    const paymentFacts = backendFacts.filter((fact) => duplicatePaymentFactMatches(fact, candidate));
    const payment = paymentFacts.find((fact) => backendFactMatches(fact, "payment_success", candidate));
    if (payment) {
      matchedEvidence.push("backend_payment_success");
    } else {
      blockers.push(blocker("missing_backend_payment"));
    }
    if (paymentFacts.length > 1) {
      blockers.push(blocker("duplicate_backend_payment"));
    }

    const entitlement = backendFacts.find((fact) => backendFactMatches(fact, "entitlement_delivered", candidate));
    if (entitlement) {
      matchedEvidence.push("backend_entitlement_delivered");
    } else {
      blockers.push(blocker("missing_backend_entitlement"));
    }

    const reversal = backendFacts.find((fact) => reversalFactMatches(fact, candidate));
    if (reversal) {
      blockers.push(blocker("backend_reversal_fact"));
    }

    const providerMatch = recordedProviderEvidenceItems.find((evidence) => providerMatches(evidence, candidate));
    if (providerMatch) {
      matchedEvidence.push("provider_attribution_evidence");
    } else if (recordedProviderEvidenceItems.length === 0) {
      blockers.push(blocker("missing_provider_attribution_evidence", "review"));
    } else {
      const partnerMismatch = recordedProviderEvidenceItems.some((evidence) => evidence.partnerRef && evidence.partnerRef !== candidate.partnerRef);
      const campaignMismatch = recordedProviderEvidenceItems.some((evidence) => evidence.campaignRef && evidence.campaignRef !== candidate.campaignRef);
      const touchMismatch = recordedProviderEvidenceItems.some((evidence) => evidence.touchRef && evidence.touchRef !== candidate.touchRef);
      if (partnerMismatch) blockers.push(blocker("provider_partner_mismatch"));
      if (campaignMismatch) blockers.push(blocker("provider_campaign_mismatch"));
      if (touchMismatch) blockers.push(blocker("provider_touch_mismatch", "review"));
      if (!partnerMismatch && !campaignMismatch && !touchMismatch) {
        blockers.push(blocker("insufficient_provider_attribution_evidence", "review"));
      }
    }

    if (fraudSignals?.manualReviewRequired) {
      blockers.push(blocker("fraud_signal_review_required", "review"));
    }
    if (candidate.status === "reversed" || candidate.status === "rejected") {
      blockers.push(blocker("candidate_not_payable"));
    }

    const hasBlocker = blockers.some((item) => item.severity === "block");
    const hasReview = blockers.some((item) => item.severity === "review");
    const status = hasBlocker ? "blocked" : hasReview ? "manual_review_required" : "payable_review_allowed";
    matchedEvidence.sort();
    blockers.sort((a, b) => a.code.localeCompare(b.code));
    return {
      type: "partner_attribution_settlement_reconciliation_review",
      candidateRef: candidate.candidateRef,
      status,
      payableReviewAllowed: status === "payable_review_allowed",
      manualReviewRequired: status !== "payable_review_allowed",
      matchedEvidence,
      blockers,
      rawValuesReturned: false
    };
  }

  return {
    inspectPrivacyBoundary,
    assertPrivacyBoundary,
    summarizeFraudSignals,
    reconcileSettlementEvidence
  };
}
