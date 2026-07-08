import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createPartnerAttributionAdminReport
} from "../services/platform/partner-attribution-admin-report.mjs";
import {
  createPartnerAttributionEventLedger
} from "../services/platform/partner-attribution-event-ledger.mjs";
import {
  createPartnerAttributionStore
} from "../services/platform/partner-attribution-store.mjs";
import {
  createPartnerSettlementCandidateEngine
} from "../services/platform/partner-settlement-candidate-engine.mjs";

function withAttributionReporting(fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "platform-partner-admin-report-"));
  const db = new Database(join(tempDir, "control.sqlite"));
  const attributionStore = createPartnerAttributionStore({ database: db });
  const eventLedger = createPartnerAttributionEventLedger({ database: db });
  const settlementEngine = createPartnerSettlementCandidateEngine({
    database: db,
    eventLedger
  });
  try {
    return fn({ attributionStore, eventLedger, settlementEngine });
  } finally {
    settlementEngine.close();
    eventLedger.close();
    attributionStore.close();
    db.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

function seedPartnerCampaign(attributionStore) {
  attributionStore.upsertPartner({
    partnerRef: "partner_alpha",
    status: "active",
    riskTier: "standard",
    payoutPolicyRef: "policy_first_payment_cpa",
    defaultAttributionWindowDays: 30,
    safeDisplayName: "Alpha Partner",
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:00:00.000Z"
  });
  attributionStore.upsertCampaign({
    campaignRef: "campaign_launch",
    partnerRef: "partner_alpha",
    status: "active",
    provider: "appsflyer",
    providerCampaignId: "af_campaign_launch",
    landingRoute: "/portal/register",
    allowedParams: ["pid", "c", "af_channel"],
    attributionWindowDays: 14,
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:00:00.000Z"
  });
}

function seedFacts({ attributionStore, eventLedger, settlementEngine }) {
  seedPartnerCampaign(attributionStore);
  const touch = attributionStore.recordAttributionTouch({
    touchRef: "touch_launch_alpha",
    provider: "appsflyer",
    partnerRef: "partner_alpha",
    campaignRef: "campaign_launch",
    visitorRef: "visitor_safe_alpha",
    sessionRef: "session_safe_alpha",
    providerClickRef: "click_safe_alpha",
    landingRoute: "/portal/register",
    touchType: "first_touch",
    observedAt: "2026-07-07T01:00:00.000Z",
    idempotencyKey: "idem_touch_launch_alpha",
    params: {
      pid: "partner_alpha",
      c: "campaign_launch",
      af_channel: "creator"
    }
  });
  eventLedger.recordEvent({
    eventType: "visit",
    source: "appsflyer_web",
    partnerRef: "partner_alpha",
    campaignRef: "campaign_launch",
    touchRef: touch.touchRef,
    occurredAt: "2026-07-07T01:00:00.000Z",
    providerEvidence: {
      provider: "appsflyer",
      eventName: "visit",
      evidenceRef: "af_visit_safe"
    }
  });
  eventLedger.recordEvent({
    eventType: "registration_success",
    source: "portal_backend",
    accountRef: "account_safe_alpha",
    partnerRef: "partner_alpha",
    campaignRef: "campaign_launch",
    touchRef: touch.touchRef,
    occurredAt: "2026-07-07T01:05:00.000Z"
  });
  eventLedger.recordEvent({
    eventType: "checkout_started",
    source: "billing_backend",
    accountRef: "account_safe_alpha",
    orderRef: "order_safe_alpha",
    partnerRef: "partner_alpha",
    campaignRef: "campaign_launch",
    touchRef: touch.touchRef,
    occurredAt: "2026-07-07T01:10:00.000Z"
  });
  eventLedger.recordEvent({
    eventType: "payment_success",
    source: "payment_backend",
    accountRef: "account_safe_alpha",
    orderRef: "order_safe_alpha",
    paymentRef: "payment_safe_alpha",
    partnerRef: "partner_alpha",
    campaignRef: "campaign_launch",
    touchRef: touch.touchRef,
    occurredAt: "2026-07-07T01:15:00.000Z",
    metadataSummary: {
      amountCents: 12000,
      currency: "USD"
    }
  });
  eventLedger.recordEvent({
    eventType: "entitlement_delivered",
    source: "entitlement_service",
    accountRef: "account_safe_alpha",
    orderRef: "order_safe_alpha",
    paymentRef: "payment_safe_alpha",
    entitlementRef: "entitlement_safe_alpha",
    partnerRef: "partner_alpha",
    campaignRef: "campaign_launch",
    touchRef: touch.touchRef,
    occurredAt: "2026-07-07T01:20:00.000Z"
  });
  settlementEngine.upsertSettlementPolicy({
    policyRef: "policy_first_payment_cpa",
    status: "active",
    model: "first_payment_cpa",
    freezeDays: 7,
    currency: "USD",
    amountCents: 2500,
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:00:00.000Z"
  });
  return settlementEngine.evaluateOrderSettlement({
    orderRef: "order_safe_alpha",
    policyRef: "policy_first_payment_cpa",
    evaluatedAt: "2026-07-07T01:30:00.000Z"
  }).candidate;
}

test("partner attribution admin report summarizes funnel and settlement review without sensitive material", () => {
  withAttributionReporting((services) => {
    const candidate = seedFacts(services);

    const report = createPartnerAttributionAdminReport({
      ...services,
      now: "2026-07-07T02:00:00.000Z"
    });

    assert.equal(report.type, "partner_attribution_admin_report");
    assert.equal(report.generatedAt, "2026-07-07T02:00:00.000Z");
    assert.deepEqual(report.sourceLabels, ["AppsFlyer evidence", "Backend settlement facts"]);
    assert.equal(report.summary.partnerCount, 1);
    assert.equal(report.summary.campaignCount, 1);
    assert.equal(report.summary.touchCount, 1);
    assert.equal(report.summary.eventCount, 6);
    assert.equal(report.summary.settlementCandidateCount, 1);
    assert.equal(report.summary.payableReviewCount, 0);
    assert.equal(report.summary.reversedCount, 0);
    assert.deepEqual(report.guardrails, {
      summaryOnly: true,
      privacyBoundaryOk: true,
      rawValuesReturned: false,
      reconciliation: {
        payableReviewAllowedCount: 1,
        manualReviewRequiredCount: 0,
        blockedCount: 0
      }
    });
    assert.deepEqual(report.funnel, {
      visit: 1,
      registrationSuccess: 1,
      checkoutStarted: 1,
      paymentSuccess: 1,
      entitlementDelivered: 1,
      refund: 0,
      chargeback: 0,
      riskRejected: 0,
      settlementCandidateCreated: 1,
      settlementReversed: 0
    });
    assert.deepEqual(report.partners, [
      {
        partnerRef: "partner_alpha",
        safeDisplayName: "Alpha Partner",
        status: "active",
        riskTier: "standard",
        campaignCount: 1,
        touchCount: 1,
        eventCount: 6,
        settlementCandidateCount: 1,
        payableReviewCount: 0,
        reversedCount: 0,
        totalAmountCents: 2500,
        currency: "USD"
      }
    ]);
    assert.equal(report.campaigns.length, 1);
    assert.equal(report.campaigns[0].campaignRef, "campaign_launch");
    assert.equal(report.campaigns[0].provider, "appsflyer");
    assert.equal(report.campaigns[0].funnel.paymentSuccess, 1);
    assert.equal(report.campaigns[0].funnel.settlementCandidateCreated, 1);
    assert.deepEqual(report.candidates, [
      {
        candidateRef: candidate.candidateRef,
        status: "frozen",
        partnerRef: "partner_alpha",
        campaignRef: "campaign_launch",
        accountRef: "account_safe_alpha",
        orderRef: "order_safe_alpha",
        paymentRef: "payment_safe_alpha",
        entitlementRef: "entitlement_safe_alpha",
        policyRef: "policy_first_payment_cpa",
        model: "first_payment_cpa",
        currency: "USD",
        basisAmountCents: 12000,
        amountCents: 2500,
        freezeUntil: "2026-07-14T01:20:00.000Z",
        payableAt: null,
        reversedAt: null,
        reasonCode: null,
        sourceEventRefs: candidate.sourceEventRefs,
        reversalEventRef: null,
        sourceLabels: ["Backend settlement facts"],
        reconciliationStatus: "payable_review_allowed",
        manualReviewRequired: false,
        reconciliationBlockers: [],
        matchedEvidence: [
          "backend_entitlement_delivered",
          "backend_payment_success",
          "provider_attribution_evidence"
        ]
      }
    ]);
    assert.equal(report.safety.summaryOnly, true);
    assert.equal(report.safety.rawProviderPayloadReturned, false);
    assert.equal(report.safety.rawSubscriptionUrlReturned, false);
    assert.equal(report.safety.rawTokenReturned, false);
    assert.equal(report.safety.rawCredentialReturned, false);
    assert.equal(report.safety.rawRuntimeConfigReturned, false);
    assert.equal(report.safety.rawSqliteRowsReturned, false);
    assert.equal(report.safety.mutationAllowed, false);
    assert.doesNotMatch(
      JSON.stringify(report),
      /https?:\/\/|token=|secret-value|password=|rawConfig|edgecred_|customer@example|\/sub\//i
    );
  });
});

test("partner attribution admin report returns an empty safe state before services are wired", () => {
  const report = createPartnerAttributionAdminReport({
    now: "2026-07-07T02:00:00.000Z"
  });

  assert.equal(report.status, "unconfigured");
  assert.deepEqual(report.sourceLabels, []);
  assert.deepEqual(report.partners, []);
  assert.deepEqual(report.campaigns, []);
  assert.deepEqual(report.candidates, []);
  assert.deepEqual(report.guardrails, {
    summaryOnly: true,
    privacyBoundaryOk: true,
    rawValuesReturned: false,
    reconciliation: {
      payableReviewAllowedCount: 0,
      manualReviewRequiredCount: 0,
      blockedCount: 0
    }
  });
  assert.deepEqual(report.funnel, {
    visit: 0,
    registrationSuccess: 0,
    checkoutStarted: 0,
    paymentSuccess: 0,
    entitlementDelivered: 0,
    refund: 0,
    chargeback: 0,
    riskRejected: 0,
    settlementCandidateCreated: 0,
    settlementReversed: 0
  });
  assert.deepEqual(report.warnings, ["partner attribution reporting services are not configured"]);
  assert.equal(report.safety.mutationAllowed, false);
});
