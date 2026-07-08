import {
  createAppsFlyerAttributionAdapter
} from "./appsflyer-attribution-adapter.mjs";

const PREVIEW_TYPE = "partner_attribution_pilot_package_preview";
const SAFE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_:/-]{0,127}$/;
const UNSAFE_VALUE_PATTERN =
  /https?:|token=|secret|credential|password|private|customer|@|\/sub\/|(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9-]+\.[a-z]{2,}/i;
const REQUIRED_REVIEWS = [
  "partner_approved",
  "campaign_approved",
  "privacy_boundary_reviewed",
  "production_gate_required"
];

function previewError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function text(value) {
  return String(value ?? "").trim();
}

function safeRef(value, field) {
  const normalized = text(value);
  if (!SAFE_REF_PATTERN.test(normalized) || UNSAFE_VALUE_PATTERN.test(normalized)) {
    throw previewError("validation_error", `${field} must be a safe reference`);
  }
  return normalized;
}

function safeRefList(value, field, fallback) {
  const raw = Array.isArray(value) ? value : value ? [value] : fallback;
  const seen = new Set();
  const refs = [];
  for (const item of raw) {
    const ref = safeRef(item, field);
    if (seen.has(ref)) continue;
    seen.add(ref);
    refs.push(ref);
  }
  return refs;
}

function uniqueSorted(values = []) {
  return [...new Set(values.filter(Boolean))].sort();
}

function linkPreview(link, creativeRef) {
  return {
    creativeRef,
    provider: link.provider,
    landingRoute: link.landingRoute,
    landingPath: link.landingPath,
    partnerRef: link.partnerRef,
    campaignRef: link.campaignRef,
    queryParams: link.queryParams,
    queryParamKeys: link.queryParamKeys,
    strippedParams: link.strippedParams,
    dryRun: link.dryRun,
    dispatchBlocked: link.dispatchBlocked,
    productionGateRequired: link.productionGateRequired
  };
}

function webEventValue({ partnerRef, campaignRef, landingRoute, eventValueHints }) {
  return {
    ...eventValueHints,
    partner_ref: partnerRef,
    campaign_ref: campaignRef,
    landing_route: landingRoute
  };
}

function serverEventValue({
  partnerRef,
  campaignRef,
  orderRef,
  amountCents,
  currency,
  eventValueHints
}) {
  return {
    ...eventValueHints,
    partner_ref: partnerRef,
    campaign_ref: campaignRef,
    order_ref: orderRef,
    amount_cents: amountCents,
    currency
  };
}

export function buildPartnerAttributionPilotPackagePreview({
  env = process.env,
  packageRef,
  partnerRef,
  campaignRef,
  creativeRefs = ["creative_a"],
  landingRoute = "/portal/register",
  visitorRef = "visitor_preview",
  accountRef = "account_preview",
  orderRef = "order_preview",
  amountCents = 9900,
  currency = "USD",
  extraParams = {},
  eventValueHints = {}
} = {}) {
  const adapter = createAppsFlyerAttributionAdapter({ env });
  const config = adapter.getConfigSummary();
  const safePackageRef = safeRef(packageRef || "pilot_package_preview", "packageRef");
  const safePartnerRef = safeRef(partnerRef, "partnerRef");
  const safeCampaignRef = safeRef(campaignRef, "campaignRef");
  const safeCreativeRefs = safeRefList(creativeRefs, "creativeRef", ["creative_a"]);
  const safeVisitorRef = safeRef(visitorRef, "visitorRef");
  const safeAccountRef = safeRef(accountRef, "accountRef");
  const safeOrderRef = safeRef(orderRef, "orderRef");
  const safeCurrency = safeRef(currency, "currency");

  const links = safeCreativeRefs.map((creativeRef) => linkPreview(adapter.planPilotLink({
    landingRoute,
    partnerRef: safePartnerRef,
    campaignRef: safeCampaignRef,
    creativeRef,
    extraParams
  }), creativeRef));

  const webSdk = ["registration_success", "checkout_started"].map((eventName) => adapter.planWebSdkEvent({
    eventName,
    visitorRef: safeVisitorRef,
    eventValue: webEventValue({
      partnerRef: safePartnerRef,
      campaignRef: safeCampaignRef,
      landingRoute: links[0].landingRoute,
      eventValueHints
    })
  }));
  const server = ["purchase_confirmed", "entitlement_delivered"].map((eventName) => adapter.planServerEvent({
    eventName,
    accountRef: safeAccountRef,
    eventValue: serverEventValue({
      partnerRef: safePartnerRef,
      campaignRef: safeCampaignRef,
      orderRef: safeOrderRef,
      amountCents,
      currency: safeCurrency,
      eventValueHints
    })
  }));
  const strippedParamNames = uniqueSorted(links.flatMap((link) => link.strippedParams));
  const strippedEventValueKeys = uniqueSorted([
    ...webSdk.flatMap((plan) => plan.strippedEventValueKeys),
    ...server.flatMap((plan) => plan.strippedEventValueKeys)
  ]);

  return {
    type: PREVIEW_TYPE,
    provider: "appsflyer",
    mode: config.mode,
    status: "ready",
    dryRun: true,
    dispatchBlocked: true,
    productionGateRequired: true,
    packageRef: safePackageRef,
    partnerRef: safePartnerRef,
    campaignRef: safeCampaignRef,
    landingRoute: links[0].landingRoute,
    links,
    eventPlans: {
      webSdk,
      server
    },
    adminPreview: {
      packageRef: safePackageRef,
      provider: "appsflyer",
      partnerRef: safePartnerRef,
      campaignRef: safeCampaignRef,
      landingRoute: links[0].landingRoute,
      linkCount: links.length,
      webSdkEventCount: webSdk.length,
      serverEventCount: server.length,
      strippedParamNames,
      strippedEventValueKeys,
      requiredReviews: REQUIRED_REVIEWS
    },
    safety: {
      summaryOnly: true,
      redacted: true,
      credentialConfigured: config.credentialConfigured,
      appIdConfigured: config.appIdConfigured,
      liveDispatchAllowed: config.liveDispatchAllowed,
      rawValuesReturned: false,
      mutationAllowed: false
    }
  };
}
