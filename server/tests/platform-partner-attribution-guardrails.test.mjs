import assert from "node:assert/strict";
import test from "node:test";
import {
  createPartnerAttributionGuardrails
} from "../services/platform/partner-attribution-guardrails.mjs";

test("partner attribution guardrails block forbidden private material without returning raw values", () => {
  const guardrails = createPartnerAttributionGuardrails();

  const review = guardrails.inspectPrivacyBoundary({
    surface: "provider_upload",
    payload: {
      partnerRef: "partner_alpha",
      campaignRef: "campaign_launch",
      eventName: "payment_success",
      customerEmail: "private@example.invalid",
      subscriptionUrl: "https://portal.example.invalid/sub/raw-token",
      metadataSummary: {
        amountCents: 12000,
        currency: "USD",
        rawRuntimeConfig: "vless://secret-material"
      }
    }
  });

  assert.equal(review.ok, false);
  assert.equal(review.surface, "provider_upload");
  assert.deepEqual(review.findings.map((finding) => finding.label).sort(), [
    "customer_private_contact",
    "raw_runtime_config",
    "subscription_url"
  ]);
  assert.deepEqual(review.findings.map((finding) => finding.path).sort(), [
    "$.customerEmail",
    "$.metadataSummary.rawRuntimeConfig",
    "$.subscriptionUrl"
  ]);
  assert.equal(JSON.stringify(review).includes("private@example.invalid"), false);
  assert.equal(JSON.stringify(review).includes("/sub/raw-token"), false);
  assert.equal(JSON.stringify(review).includes("vless://"), false);
});

test("partner attribution guardrails cover advertised artifact and raw-log forbidden classes", () => {
  const guardrails = createPartnerAttributionGuardrails();

  const review = guardrails.inspectPrivacyBoundary({
    surface: "admin_view",
    payload: {
      partnerRef: "partner_alpha",
      artifactMaterial: "opaque-material-placeholder",
      diagnostics: {
        rawLog: "request carried customer private details"
      }
    }
  });

  assert.equal(review.ok, false);
  assert.deepEqual(review.findings.map((finding) => finding.label).sort(), [
    "opaque_artifact_material",
    "raw_log_private"
  ]);
  assert.equal(JSON.stringify(review).includes("opaque-material-placeholder"), false);
  assert.equal(JSON.stringify(review).includes("customer private details"), false);
});

test("partner attribution guardrails block raw provider credential key fields", () => {
  const guardrails = createPartnerAttributionGuardrails();

  const review = guardrails.inspectPrivacyBoundary({
    surface: "provider_upload",
    payload: {
      partnerRef: "partner_alpha",
      webDevKey: "placeholder-web-dev-key",
      nested: {
        devKey: "placeholder-dev-key",
        providerCredential: "placeholder-provider-credential"
      }
    }
  });

  assert.equal(review.ok, false);
  assert.deepEqual(review.findings.map((finding) => finding.path).sort(), [
    "$.nested.devKey",
    "$.nested.providerCredential",
    "$.webDevKey"
  ]);
  assert.deepEqual(new Set(review.findings.map((finding) => finding.label)), new Set(["protocol_credential"]));
  assert.equal(JSON.stringify(review).includes("placeholder-web-dev-key"), false);
  assert.equal(JSON.stringify(review).includes("placeholder-dev-key"), false);
  assert.equal(JSON.stringify(review).includes("placeholder-provider-credential"), false);
});

test("partner attribution guardrails summarize fraud and abuse signals from safe aggregates", () => {
  const guardrails = createPartnerAttributionGuardrails();

  const summary = guardrails.summarizeFraudSignals({
    partnerRef: "partner_alpha",
    campaignRef: "campaign_launch",
    accountRefs: ["account_a", "account_a", "account_b"],
    orderRefs: ["order_1", "order_1"],
    paymentRefs: ["payment_1", "payment_2"],
    campaignParams: {
      pid: "partner_alpha",
      c: "campaign_launch",
      redirect_url: "https://example.invalid/private"
    },
    allowedCampaignParams: ["pid", "c"],
    reversalFacts: [
      { reasonCode: "refund" },
      { reasonCode: "chargeback" }
    ],
    sessionAnomalies: [
      { code: "shared_session_ref", count: 3 }
    ]
  });

  assert.equal(summary.partnerRef, "partner_alpha");
  assert.equal(summary.campaignRef, "campaign_launch");
  assert.equal(summary.manualReviewRequired, true);
  assert.equal(summary.riskTier, "high");
  assert.deepEqual(summary.signals.map((signal) => signal.code).sort(), [
    "duplicate_account_ref",
    "duplicate_order_ref",
    "repeated_reversal",
    "session_anomaly",
    "unexpected_campaign_param",
    "unsafe_campaign_param"
  ]);
  assert.equal(JSON.stringify(summary).includes("https://example.invalid"), false);
});

test("partner attribution guardrails count ledger chargeback event types as reversal signals", () => {
  const guardrails = createPartnerAttributionGuardrails();

  const summary = guardrails.summarizeFraudSignals({
    partnerRef: "partner_alpha",
    campaignRef: "campaign_launch",
    reversalFacts: [
      { eventType: "chargeback" }
    ]
  });

  assert.equal(summary.manualReviewRequired, true);
  assert.equal(summary.riskTier, "high");
  assert.deepEqual(summary.signals.map((signal) => signal.code), ["repeated_reversal"]);
});

test("partner attribution guardrails reconcile provider evidence to backend facts before payable review", () => {
  const guardrails = createPartnerAttributionGuardrails();

  const review = guardrails.reconcileSettlementEvidence({
    candidate: {
      candidateRef: "candidate_alpha",
      partnerRef: "partner_alpha",
      campaignRef: "campaign_launch",
      orderRef: "order_alpha",
      paymentRef: "payment_alpha",
      entitlementRef: "entitlement_alpha",
      touchRef: "touch_alpha",
      status: "frozen"
    },
    providerEvidence: [
      {
        provider: "appsflyer",
        partnerRef: "partner_alpha",
        campaignRef: "campaign_launch",
        touchRef: "touch_alpha",
        eventName: "purchase_confirmed"
      }
    ],
    backendFacts: [
      {
        eventType: "payment_success",
        orderRef: "order_alpha",
        paymentRef: "payment_alpha",
        partnerRef: "partner_alpha",
        campaignRef: "campaign_launch",
        touchRef: "touch_alpha",
        status: "recorded"
      },
      {
        eventType: "entitlement_delivered",
        orderRef: "order_alpha",
        paymentRef: "payment_alpha",
        entitlementRef: "entitlement_alpha",
        partnerRef: "partner_alpha",
        campaignRef: "campaign_launch",
        touchRef: "touch_alpha",
        status: "recorded"
      }
    ]
  });

  assert.equal(review.status, "payable_review_allowed");
  assert.equal(review.payableReviewAllowed, true);
  assert.equal(review.manualReviewRequired, false);
  assert.deepEqual(review.matchedEvidence.sort(), [
    "backend_entitlement_delivered",
    "backend_payment_success",
    "provider_attribution_evidence"
  ]);
  assert.deepEqual(review.blockers, []);
});

test("partner attribution guardrails do not require optional touch refs on backend facts", () => {
  const guardrails = createPartnerAttributionGuardrails();

  const review = guardrails.reconcileSettlementEvidence({
    candidate: {
      candidateRef: "candidate_alpha",
      partnerRef: "partner_alpha",
      campaignRef: "campaign_launch",
      orderRef: "order_alpha",
      paymentRef: "payment_alpha",
      entitlementRef: "entitlement_alpha",
      touchRef: "touch_alpha",
      status: "frozen"
    },
    providerEvidence: [{
      provider: "appsflyer",
      partnerRef: "partner_alpha",
      campaignRef: "campaign_launch",
      touchRef: "touch_alpha",
      eventName: "purchase_confirmed"
    }],
    backendFacts: [
      {
        eventType: "payment_success",
        orderRef: "order_alpha",
        paymentRef: "payment_alpha",
        partnerRef: "partner_alpha",
        campaignRef: "campaign_launch",
        touchRef: "touch_alpha",
        status: "recorded"
      },
      {
        eventType: "entitlement_delivered",
        orderRef: "order_alpha",
        paymentRef: "payment_alpha",
        entitlementRef: "entitlement_alpha",
        partnerRef: "partner_alpha",
        campaignRef: "campaign_launch",
        status: "recorded"
      }
    ]
  });

  assert.equal(review.status, "payable_review_allowed");
  assert.equal(review.payableReviewAllowed, true);
  assert.deepEqual(review.blockers, []);
});

test("partner attribution guardrails scope reversal blockers to the candidate facts", () => {
  const guardrails = createPartnerAttributionGuardrails();

  const review = guardrails.reconcileSettlementEvidence({
    candidate: {
      candidateRef: "candidate_alpha",
      partnerRef: "partner_alpha",
      campaignRef: "campaign_launch",
      orderRef: "order_alpha",
      paymentRef: "payment_alpha",
      entitlementRef: "entitlement_alpha",
      touchRef: "touch_alpha",
      status: "frozen"
    },
    providerEvidence: [{
      provider: "appsflyer",
      partnerRef: "partner_alpha",
      campaignRef: "campaign_launch",
      touchRef: "touch_alpha",
      eventName: "purchase_confirmed"
    }],
    backendFacts: [
      {
        eventType: "payment_success",
        orderRef: "order_alpha",
        paymentRef: "payment_alpha",
        partnerRef: "partner_alpha",
        campaignRef: "campaign_launch",
        touchRef: "touch_alpha",
        status: "recorded"
      },
      {
        eventType: "entitlement_delivered",
        orderRef: "order_alpha",
        paymentRef: "payment_alpha",
        entitlementRef: "entitlement_alpha",
        partnerRef: "partner_alpha",
        campaignRef: "campaign_launch",
        touchRef: "touch_alpha",
        status: "recorded"
      },
      {
        eventType: "refund",
        orderRef: "order_other",
        paymentRef: "payment_other",
        partnerRef: "partner_other",
        campaignRef: "campaign_other",
        status: "recorded"
      }
    ]
  });

  assert.equal(review.status, "payable_review_allowed");
  assert.equal(review.payableReviewAllowed, true);
  assert.deepEqual(review.blockers, []);
});

test("partner attribution guardrails block same-order reversals even when attribution refs are stale", () => {
  const guardrails = createPartnerAttributionGuardrails();

  const review = guardrails.reconcileSettlementEvidence({
    candidate: {
      candidateRef: "candidate_alpha",
      partnerRef: "partner_alpha",
      campaignRef: "campaign_launch",
      orderRef: "order_alpha",
      paymentRef: "payment_alpha",
      entitlementRef: "entitlement_alpha",
      touchRef: "touch_alpha",
      status: "frozen"
    },
    providerEvidence: [{
      provider: "appsflyer",
      partnerRef: "partner_alpha",
      campaignRef: "campaign_launch",
      touchRef: "touch_alpha",
      eventName: "purchase_confirmed"
    }],
    backendFacts: [
      {
        eventType: "payment_success",
        orderRef: "order_alpha",
        paymentRef: "payment_alpha",
        partnerRef: "partner_alpha",
        campaignRef: "campaign_launch",
        touchRef: "touch_alpha",
        status: "recorded"
      },
      {
        eventType: "entitlement_delivered",
        orderRef: "order_alpha",
        paymentRef: "payment_alpha",
        entitlementRef: "entitlement_alpha",
        partnerRef: "partner_alpha",
        campaignRef: "campaign_launch",
        touchRef: "touch_alpha",
        status: "recorded"
      },
      {
        eventType: "refund",
        orderRef: "order_alpha",
        paymentRef: "payment_alpha",
        partnerRef: "partner_stale",
        campaignRef: "campaign_stale",
        touchRef: "touch_stale",
        status: "recorded"
      }
    ]
  });

  assert.equal(review.status, "blocked");
  assert.equal(review.payableReviewAllowed, false);
  assert.deepEqual(review.blockers.map((blocker) => blocker.code), ["backend_reversal_fact"]);
});

test("partner attribution guardrails block payable review when backend facts are incomplete or provider evidence mismatches", () => {
  const guardrails = createPartnerAttributionGuardrails();

  const review = guardrails.reconcileSettlementEvidence({
    candidate: {
      candidateRef: "candidate_alpha",
      partnerRef: "partner_alpha",
      campaignRef: "campaign_launch",
      orderRef: "order_alpha",
      paymentRef: "payment_alpha",
      entitlementRef: "entitlement_alpha",
      touchRef: "touch_alpha",
      status: "frozen"
    },
    providerEvidence: [
      {
        provider: "appsflyer",
        partnerRef: "partner_other",
        campaignRef: "campaign_launch",
        touchRef: "touch_alpha",
        eventName: "purchase_confirmed"
      }
    ],
    backendFacts: [
      {
        eventType: "payment_success",
        orderRef: "order_alpha",
        paymentRef: "payment_alpha",
        partnerRef: "partner_alpha",
        campaignRef: "campaign_launch",
        touchRef: "touch_alpha",
        status: "recorded"
      }
    ]
  });

  assert.equal(review.status, "blocked");
  assert.equal(review.payableReviewAllowed, false);
  assert.equal(review.manualReviewRequired, true);
  assert.deepEqual(review.blockers.map((blocker) => blocker.code).sort(), [
    "missing_backend_entitlement",
    "provider_partner_mismatch"
  ]);
  assert.equal(JSON.stringify(review).includes("partner_other"), false);
});

test("partner attribution guardrails require anchored provider evidence before payable review", () => {
  const guardrails = createPartnerAttributionGuardrails();

  const review = guardrails.reconcileSettlementEvidence({
    candidate: {
      candidateRef: "candidate_alpha",
      partnerRef: "partner_alpha",
      campaignRef: "campaign_launch",
      orderRef: "order_alpha",
      paymentRef: "payment_alpha",
      entitlementRef: "entitlement_alpha",
      touchRef: "touch_alpha",
      status: "frozen"
    },
    providerEvidence: [
      {
        provider: "appsflyer",
        partnerRef: "partner_alpha",
        campaignRef: "campaign_launch",
        eventName: "purchase_confirmed",
        status: "recorded"
      }
    ],
    backendFacts: [
      {
        eventType: "payment_success",
        orderRef: "order_alpha",
        paymentRef: "payment_alpha",
        partnerRef: "partner_alpha",
        campaignRef: "campaign_launch",
        touchRef: "touch_alpha",
        status: "recorded"
      },
      {
        eventType: "entitlement_delivered",
        orderRef: "order_alpha",
        paymentRef: "payment_alpha",
        entitlementRef: "entitlement_alpha",
        partnerRef: "partner_alpha",
        campaignRef: "campaign_launch",
        touchRef: "touch_alpha",
        status: "recorded"
      }
    ]
  });

  assert.equal(review.status, "manual_review_required");
  assert.equal(review.payableReviewAllowed, false);
  assert.deepEqual(review.matchedEvidence, [
    "backend_entitlement_delivered",
    "backend_payment_success"
  ]);
  assert.deepEqual(review.blockers.map((blocker) => blocker.code), ["insufficient_provider_attribution_evidence"]);
});

test("partner attribution guardrails block duplicate payment facts for one order", () => {
  const guardrails = createPartnerAttributionGuardrails();

  const review = guardrails.reconcileSettlementEvidence({
    candidate: {
      candidateRef: "candidate_alpha",
      partnerRef: "partner_alpha",
      campaignRef: "campaign_launch",
      orderRef: "order_alpha",
      paymentRef: "payment_alpha",
      entitlementRef: "entitlement_alpha",
      touchRef: "touch_alpha",
      status: "frozen"
    },
    providerEvidence: [{
      provider: "appsflyer",
      partnerRef: "partner_alpha",
      campaignRef: "campaign_launch",
      touchRef: "touch_alpha",
      eventName: "purchase_confirmed"
    }],
    backendFacts: [
      {
        eventType: "payment_success",
        orderRef: "order_alpha",
        paymentRef: "payment_alpha",
        partnerRef: "partner_alpha",
        campaignRef: "campaign_launch",
        touchRef: "touch_alpha",
        status: "recorded"
      },
      {
        eventType: "payment_success",
        orderRef: "order_alpha",
        paymentRef: "payment_beta",
        partnerRef: "partner_alpha",
        campaignRef: "campaign_launch",
        touchRef: "touch_alpha",
        status: "recorded"
      },
      {
        eventType: "entitlement_delivered",
        orderRef: "order_alpha",
        paymentRef: "payment_alpha",
        entitlementRef: "entitlement_alpha",
        partnerRef: "partner_alpha",
        campaignRef: "campaign_launch",
        touchRef: "touch_alpha",
        status: "recorded"
      }
    ]
  });

  assert.equal(review.status, "blocked");
  assert.equal(review.payableReviewAllowed, false);
  assert.deepEqual(review.blockers.map((blocker) => blocker.code), ["duplicate_backend_payment"]);
});
