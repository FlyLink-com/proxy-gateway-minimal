const REPORT_TYPE = "partner_attribution_admin_report";
const SOURCE_LABELS = ["AppsFlyer evidence", "Backend settlement facts"];

const FUNNEL_FIELDS = [
  ["visit", "visit"],
  ["registration_success", "registrationSuccess"],
  ["checkout_started", "checkoutStarted"],
  ["payment_success", "paymentSuccess"],
  ["entitlement_delivered", "entitlementDelivered"],
  ["refund", "refund"],
  ["chargeback", "chargeback"],
  ["risk_rejected", "riskRejected"],
  ["settlement_candidate_created", "settlementCandidateCreated"],
  ["settlement_reversed", "settlementReversed"]
];

function generatedAt(value) {
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function emptyFunnel() {
  return Object.fromEntries(FUNNEL_FIELDS.map(([, field]) => [field, 0]));
}

function safety() {
  return {
    summaryOnly: true,
    rawProviderPayloadReturned: false,
    rawSubscriptionUrlReturned: false,
    rawTokenReturned: false,
    rawCredentialReturned: false,
    rawRuntimeConfigReturned: false,
    rawSqliteRowsReturned: false,
    mutationAllowed: false
  };
}

function configured({ attributionStore, eventLedger, settlementEngine }) {
  return Boolean(
    attributionStore?.listAttributionTouches &&
    eventLedger?.listSettlementSafeEvents &&
    settlementEngine?.listSettlementCandidates
  );
}

function increment(map, key, amount = 1) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + amount);
}

function countBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    increment(counts, keyFn(item));
  }
  return counts;
}

function uniqueRefs(...groups) {
  const refs = new Set();
  for (const group of groups) {
    for (const ref of group) {
      if (ref) refs.add(ref);
    }
  }
  return [...refs].sort();
}

function funnelFor(events) {
  const funnel = emptyFunnel();
  for (const event of events) {
    const field = FUNNEL_FIELDS.find(([eventType]) => eventType === event.eventType)?.[1];
    if (field) {
      funnel[field] += 1;
    }
  }
  return funnel;
}

function candidateReviewRow(candidate) {
  return {
    candidateRef: candidate.candidateRef,
    status: candidate.status,
    partnerRef: candidate.partnerRef,
    campaignRef: candidate.campaignRef,
    accountRef: candidate.accountRef,
    orderRef: candidate.orderRef,
    paymentRef: candidate.paymentRef,
    entitlementRef: candidate.entitlementRef,
    policyRef: candidate.policyRef,
    model: candidate.model,
    currency: candidate.currency,
    basisAmountCents: candidate.basisAmountCents,
    amountCents: candidate.amountCents,
    freezeUntil: candidate.freezeUntil,
    payableAt: candidate.payableAt,
    reversedAt: candidate.reversedAt,
    reasonCode: candidate.reasonCode,
    sourceEventRefs: [...(candidate.sourceEventRefs || [])],
    reversalEventRef: candidate.reversalEventRef,
    sourceLabels: ["Backend settlement facts"]
  };
}

function currencyFor(candidates) {
  const currencies = new Set(candidates.map((candidate) => candidate.currency).filter(Boolean));
  return currencies.size === 1 ? [...currencies][0] : null;
}

function partnerSummary({
  partner,
  partnerRef,
  campaigns,
  touches,
  events,
  candidates
}) {
  const partnerCandidates = candidates.filter((candidate) => candidate.partnerRef === partnerRef);
  return {
    partnerRef,
    safeDisplayName: partner?.safeDisplayName || partnerRef,
    status: partner?.status || "unknown",
    riskTier: partner?.riskTier || "unknown",
    campaignCount: campaigns.filter((campaign) => campaign.partnerRef === partnerRef).length,
    touchCount: touches.filter((touch) => touch.partnerRef === partnerRef).length,
    eventCount: events.filter((event) => event.partnerRef === partnerRef).length,
    settlementCandidateCount: partnerCandidates.length,
    payableReviewCount: partnerCandidates.filter((candidate) => candidate.status === "payable_review").length,
    reversedCount: partnerCandidates.filter((candidate) => candidate.status === "reversed").length,
    totalAmountCents: partnerCandidates.reduce((sum, candidate) => sum + (candidate.amountCents || 0), 0),
    currency: currencyFor(partnerCandidates)
  };
}

function campaignSummary({
  campaign,
  campaignRef,
  touches,
  events,
  candidates
}) {
  const campaignEvents = events.filter((event) => event.campaignRef === campaignRef);
  const campaignCandidates = candidates.filter((candidate) => candidate.campaignRef === campaignRef);
  return {
    campaignRef,
    partnerRef: campaign?.partnerRef || campaignEvents[0]?.partnerRef || campaignCandidates[0]?.partnerRef || null,
    status: campaign?.status || "unknown",
    provider: campaign?.provider || "unknown",
    touchCount: touches.filter((touch) => touch.campaignRef === campaignRef).length,
    eventCount: campaignEvents.length,
    settlementCandidateCount: campaignCandidates.length,
    payableReviewCount: campaignCandidates.filter((candidate) => candidate.status === "payable_review").length,
    reversedCount: campaignCandidates.filter((candidate) => candidate.status === "reversed").length,
    totalAmountCents: campaignCandidates.reduce((sum, candidate) => sum + (candidate.amountCents || 0), 0),
    currency: currencyFor(campaignCandidates),
    funnel: funnelFor(campaignEvents)
  };
}

export function createPartnerAttributionAdminReport({
  attributionStore,
  eventLedger,
  settlementEngine,
  now = new Date()
} = {}) {
  const reportGeneratedAt = generatedAt(now);
  const base = {
    type: REPORT_TYPE,
    generatedAt: reportGeneratedAt,
    sourceLabels: SOURCE_LABELS,
    warnings: [],
    funnel: emptyFunnel(),
    partners: [],
    campaigns: [],
    candidates: [],
    safety: safety()
  };

  if (!configured({ attributionStore, eventLedger, settlementEngine })) {
    return {
      ...base,
      status: "unconfigured",
      sourceLabels: [],
      warnings: ["partner attribution reporting services are not configured"],
      summary: {
        partnerCount: 0,
        campaignCount: 0,
        touchCount: 0,
        eventCount: 0,
        settlementCandidateCount: 0,
        payableReviewCount: 0,
        reversedCount: 0
      }
    };
  }

  const touches = attributionStore.listAttributionTouches();
  const events = eventLedger.listSettlementSafeEvents();
  const candidates = settlementEngine.listSettlementCandidates();
  const partnerRefs = uniqueRefs(
    touches.map((touch) => touch.partnerRef),
    events.map((event) => event.partnerRef),
    candidates.map((candidate) => candidate.partnerRef)
  );
  const campaignRefs = uniqueRefs(
    touches.map((touch) => touch.campaignRef),
    events.map((event) => event.campaignRef),
    candidates.map((candidate) => candidate.campaignRef)
  );
  const campaigns = campaignRefs.map((campaignRef) => {
    try {
      return attributionStore.getCampaign(campaignRef) || { campaignRef };
    } catch {
      return { campaignRef };
    }
  });
  const partners = partnerRefs.map((partnerRef) => {
    try {
      return attributionStore.getPartner(partnerRef) || { partnerRef };
    } catch {
      return { partnerRef };
    }
  });

  const candidatesByStatus = countBy(candidates, (candidate) => candidate.status);
  const funnel = funnelFor(events);
  return {
    ...base,
    status: "ready",
    funnel,
    summary: {
      partnerCount: partnerRefs.length,
      campaignCount: campaignRefs.length,
      touchCount: touches.length,
      eventCount: events.length,
      settlementCandidateCount: candidates.length,
      payableReviewCount: candidatesByStatus.get("payable_review") || 0,
      reversedCount: candidatesByStatus.get("reversed") || 0
    },
    partners: partnerRefs.map((partnerRef) => partnerSummary({
      partner: partners.find((partner) => partner.partnerRef === partnerRef),
      partnerRef,
      campaigns,
      touches,
      events,
      candidates
    })),
    campaigns: campaignRefs.map((campaignRef) => campaignSummary({
      campaign: campaigns.find((campaign) => campaign.campaignRef === campaignRef),
      campaignRef,
      touches,
      events,
      candidates
    })),
    candidates: candidates.map(candidateReviewRow)
  };
}
