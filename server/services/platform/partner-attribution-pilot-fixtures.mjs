import Database from "better-sqlite3";
import {
  createAppsFlyerAttributionAdapter
} from "./appsflyer-attribution-adapter.mjs";
import {
  createPartnerAttributionAdminReport
} from "./partner-attribution-admin-report.mjs";
import {
  createPartnerAttributionEventLedger
} from "./partner-attribution-event-ledger.mjs";
import {
  createPartnerAttributionStore
} from "./partner-attribution-store.mjs";
import {
  createPartnerSettlementCandidateEngine
} from "./partner-settlement-candidate-engine.mjs";
import {
  createPortalAttributionBindingService
} from "./portal-attribution-binding.mjs";

const DEFAULT_NOW = "2026-07-07T00:00:00.000Z";
const DEFAULT_POLICY_REF = "policy_first_payment_cpa";
const DEFAULT_ALLOWED_PARAMS = [
  "partner_ref",
  "campaign_ref",
  "pid",
  "c",
  "campaign",
  "media_source",
  "af_channel",
  "af_adset",
  "af_ad",
  "af_sub1",
  "af_sub2",
  "af_sub3",
  "af_sub4",
  "af_sub5",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term"
];
const FLOW_EVENT_TYPES = [
  "visit",
  "registration_success",
  "checkout_started",
  "payment_success",
  "entitlement_delivered",
  "settlement_candidate_created"
];

function timestamp(value, fallback) {
  const date = new Date(value || fallback || DEFAULT_NOW);
  return Number.isNaN(date.getTime()) ? DEFAULT_NOW : date.toISOString();
}

function plusMinutes(iso, minutes) {
  const date = new Date(iso);
  date.setUTCMinutes(date.getUTCMinutes() + minutes);
  return date.toISOString();
}

function defaultInput(input = {}) {
  const observedAt = timestamp(input.observedAt || input.observed_at, DEFAULT_NOW);
  return {
    partnerRef: input.partnerRef || input.partner_ref || "partner_alpha",
    campaignRef: input.campaignRef || input.campaign_ref || "campaign_launch",
    creativeRef: input.creativeRef || input.creative_ref || "creative_a",
    landingRoute: input.landingRoute || input.landing_route || "/portal/register",
    visitorRef: input.visitorRef || input.visitor_ref || "visitor_alpha",
    sessionRef: input.sessionRef || input.session_ref || "session_alpha",
    accountRef: input.accountRef || input.account_ref || "account_alpha",
    orderRef: input.orderRef || input.order_ref || "order_alpha",
    paymentRef: input.paymentRef || input.payment_ref || "payment_alpha",
    entitlementRef: input.entitlementRef || input.entitlement_ref || "entitlement_alpha",
    policyRef: input.policyRef || input.policy_ref || DEFAULT_POLICY_REF,
    amountCents: input.amountCents || input.amount_cents || 9900,
    currency: input.currency || "USD",
    safeDisplayName: input.safeDisplayName || input.safe_display_name || "Pilot Partner",
    observedAt,
    registrationAt: timestamp(input.registrationAt || input.registration_at, plusMinutes(observedAt, 5)),
    checkoutAt: timestamp(input.checkoutAt || input.checkout_at, plusMinutes(observedAt, 10)),
    paymentAt: timestamp(input.paymentAt || input.payment_at, plusMinutes(observedAt, 15)),
    entitlementAt: timestamp(input.entitlementAt || input.entitlement_at, plusMinutes(observedAt, 20)),
    evaluatedAt: timestamp(input.evaluatedAt || input.evaluated_at, plusMinutes(observedAt, 25)),
    extraParams: input.extraParams || input.extra_params || {}
  };
}

function flowEventTypes(events) {
  const present = new Set(events.map((event) => event.eventType));
  return FLOW_EVENT_TYPES.filter((eventType) => present.has(eventType));
}

function adminReportProof(report) {
  return {
    status: report.status,
    generatedAt: report.generatedAt,
    summary: report.summary,
    funnel: report.funnel,
    guardrails: report.guardrails,
    safety: report.safety
  };
}

export function createPartnerAttributionPilotFixture({
  database,
  env = process.env,
  now = DEFAULT_NOW
} = {}) {
  const db = database || new Database(":memory:");
  const ownsDatabase = !database;
  const attributionStore = createPartnerAttributionStore({ database: db });
  const eventLedger = createPartnerAttributionEventLedger({ database: db });
  const settlementEngine = createPartnerSettlementCandidateEngine({
    database: db,
    eventLedger
  });
  const portalBinding = createPortalAttributionBindingService({
    database: db,
    attributionStore,
    eventLedger
  });
  const appsflyerAdapter = createAppsFlyerAttributionAdapter({ env });

  function seedPilotPartnerCampaign(input = {}) {
    const seedInput = defaultInput(input);
    const createdAt = timestamp(now, DEFAULT_NOW);
    settlementEngine.upsertSettlementPolicy({
      policyRef: seedInput.policyRef,
      status: "active",
      model: "first_payment_cpa",
      freezeDays: 7,
      currency: seedInput.currency,
      amountCents: 2500,
      createdAt,
      updatedAt: createdAt
    });
    const partner = attributionStore.upsertPartner({
      partnerRef: seedInput.partnerRef,
      status: "active",
      riskTier: "standard",
      payoutPolicyRef: seedInput.policyRef,
      defaultAttributionWindowDays: 30,
      safeDisplayName: seedInput.safeDisplayName,
      metadataSummary: {
        fixture: "appsflyer_pilot_dry_run"
      },
      createdAt,
      updatedAt: createdAt
    });
    const campaign = attributionStore.upsertCampaign({
      campaignRef: seedInput.campaignRef,
      partnerRef: seedInput.partnerRef,
      status: "active",
      provider: "appsflyer",
      providerCampaignId: seedInput.campaignRef,
      landingRoute: seedInput.landingRoute,
      allowedParams: DEFAULT_ALLOWED_PARAMS,
      attributionWindowDays: 30,
      createdAt,
      updatedAt: createdAt
    });
    return { partner, campaign };
  }

  function runClosedLoopProof(input = {}) {
    const fixtureInput = defaultInput(input);
    const linkPlan = appsflyerAdapter.planPilotLink({
      landingRoute: fixtureInput.landingRoute,
      partnerRef: fixtureInput.partnerRef,
      campaignRef: fixtureInput.campaignRef,
      creativeRef: fixtureInput.creativeRef,
      extraParams: fixtureInput.extraParams
    });
    const { partner, campaign } = seedPilotPartnerCampaign(fixtureInput);
    const landingEvidence = appsflyerAdapter.normalizeLandingParams({
      landingRoute: linkPlan.landingRoute,
      params: linkPlan.queryParams
    });
    const touch = portalBinding.captureLandingAttribution({
      landingRoute: linkPlan.landingRoute,
      visitorRef: fixtureInput.visitorRef,
      sessionRef: fixtureInput.sessionRef,
      observedAt: fixtureInput.observedAt,
      params: linkPlan.queryParams
    }).touch;
    eventLedger.recordEvent({
      eventType: "visit",
      source: "appsflyer_web",
      partnerRef: landingEvidence.partnerRef,
      campaignRef: landingEvidence.campaignRef,
      touchRef: touch.touchRef,
      occurredAt: fixtureInput.observedAt,
      idempotencyKey: `appsflyer_${touch.touchRef}`,
      providerEvidence: {
        provider: "appsflyer",
        eventName: "visit",
        evidenceRef: `evidence_${touch.touchRef}`
      }
    });
    portalBinding.bindRegistration({
      accountRef: fixtureInput.accountRef,
      visitorRef: fixtureInput.visitorRef,
      sessionRef: fixtureInput.sessionRef,
      occurredAt: fixtureInput.registrationAt
    });
    portalBinding.bindOrder({
      accountRef: fixtureInput.accountRef,
      orderRef: fixtureInput.orderRef,
      occurredAt: fixtureInput.checkoutAt
    });
    portalBinding.recordBackendPaymentSuccess({
      orderRef: fixtureInput.orderRef,
      paymentRef: fixtureInput.paymentRef,
      occurredAt: fixtureInput.paymentAt,
      metadataSummary: {
        amountCents: fixtureInput.amountCents,
        currency: fixtureInput.currency
      }
    });
    portalBinding.recordBackendEntitlementDelivered({
      orderRef: fixtureInput.orderRef,
      paymentRef: fixtureInput.paymentRef,
      entitlementRef: fixtureInput.entitlementRef,
      occurredAt: fixtureInput.entitlementAt
    });
    const settlement = settlementEngine.evaluateOrderSettlement({
      orderRef: fixtureInput.orderRef,
      policyRef: fixtureInput.policyRef,
      evaluatedAt: fixtureInput.evaluatedAt
    });
    const report = createPartnerAttributionAdminReport({
      attributionStore,
      eventLedger,
      settlementEngine,
      now: fixtureInput.evaluatedAt
    });
    const candidateRow = report.candidates.find((candidate) => (
      candidate.candidateRef === settlement.candidate?.candidateRef
    ));
    const events = eventLedger.listSettlementSafeEvents();
    const config = appsflyerAdapter.getConfigSummary();

    return {
      provider: linkPlan.provider,
      mode: linkPlan.mode,
      dryRun: linkPlan.dryRun,
      dispatchBlocked: linkPlan.dispatchBlocked,
      productionGateRequired: linkPlan.productionGateRequired,
      partner: {
        partnerRef: partner.partnerRef,
        safeDisplayName: partner.safeDisplayName,
        status: partner.status,
        riskTier: partner.riskTier,
        payoutPolicyRef: partner.payoutPolicyRef
      },
      campaign: {
        campaignRef: campaign.campaignRef,
        partnerRef: campaign.partnerRef,
        status: campaign.status,
        provider: campaign.provider,
        landingRoute: campaign.landingRoute
      },
      link: {
        provider: linkPlan.provider,
        landingRoute: linkPlan.landingRoute,
        landingPath: linkPlan.landingPath,
        partnerRef: linkPlan.partnerRef,
        campaignRef: linkPlan.campaignRef,
        queryParams: linkPlan.queryParams,
        queryParamKeys: linkPlan.queryParamKeys,
        strippedParams: linkPlan.strippedParams
      },
      flow: {
        touchRef: touch.touchRef,
        accountRef: fixtureInput.accountRef,
        orderRef: fixtureInput.orderRef,
        paymentRef: fixtureInput.paymentRef,
        entitlementRef: fixtureInput.entitlementRef,
        eventTypes: flowEventTypes(events),
        touchCount: attributionStore.listAttributionTouches().length,
        eventCount: events.length,
        candidateCount: settlementEngine.listSettlementCandidates().length
      },
      settlement: {
        candidateRef: settlement.candidate?.candidateRef || null,
        status: settlement.candidate?.status || null,
        policyRef: settlement.candidate?.policyRef || null,
        amountCents: settlement.candidate?.amountCents || null,
        currency: settlement.candidate?.currency || null,
        reconciliationStatus: candidateRow?.reconciliationStatus || null,
        reconciliationBlockers: candidateRow?.reconciliationBlockers || []
      },
      adminReport: adminReportProof(report),
      safety: {
        summaryOnly: true,
        redacted: true,
        credentialConfigured: config.credentialConfigured,
        appIdConfigured: config.appIdConfigured,
        liveDispatchAllowed: config.liveDispatchAllowed
      }
    };
  }

  return {
    attributionStore,
    eventLedger,
    settlementEngine,
    portalBinding,
    appsflyerAdapter,
    seedPilotPartnerCampaign,
    runClosedLoopProof,
    close() {
      if (ownsDatabase) {
        db.close();
      }
    }
  };
}
