const PROVIDER = "appsflyer";
const MODES = new Set(["disabled", "dry_run", "live"]);
const WEB_S2S_EVENT_ENDPOINT_TEMPLATE = "https://webs2s.appsflyer.com/v1/{bundleId}/event";
const WEB_S2S_CREDENTIAL_FIELDS = ["webDevKey"];
const WEB_S2S_REQUIRED_IDENTIFIERS = ["customerUserId", "afUserId"];
const SAFE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_:/-]{0,127}$/;
const SAFE_ROUTE_PATTERN = /^\/[A-Za-z0-9/_-]{0,127}$/;
const SAFE_PARAM_NAMES = new Set([
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
]);
const DEFAULT_PILOT_LANDING_ROUTES = new Set(["/portal/register", "/portal"]);
const PILOT_LINK_PARAM_ORDER = [
  "pid",
  "c",
  "partner_ref",
  "campaign_ref",
  "af_channel",
  "af_sub1",
  "af_sub2",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term"
];
const UNSAFE_FIELD_PARTS = [
  "email",
  "phone",
  "url",
  "token",
  "secret",
  "password",
  "credential",
  "private",
  "raw",
  "contact",
  "payment",
  "subscription",
  "runtime"
];
const UNSAFE_VALUE_PATTERN =
  /https?:|token=|secret|credential|password|private|customer|@|\/sub\/|(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9-]+\.[a-z]{2,}/i;

function text(value) {
  return String(value ?? "").trim();
}

function configured(value) {
  return Boolean(text(value));
}

function normalizeMode(value) {
  const mode = text(value || "disabled").toLowerCase();
  return MODES.has(mode) ? mode : "disabled";
}

function adapterError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function asParams(input) {
  if (input instanceof URLSearchParams) {
    return Object.fromEntries(input.entries());
  }
  return { ...(input || {}) };
}

function isUnsafeField(key) {
  const normalized = text(key).toLowerCase();
  return !normalized || UNSAFE_FIELD_PARTS.some((part) => normalized.includes(part));
}

function isSafeValue(value) {
  const normalized = text(Array.isArray(value) ? value[0] : value);
  return Boolean(normalized) && !UNSAFE_VALUE_PATTERN.test(normalized);
}

function safeRef(value, field) {
  const normalized = text(value);
  if (!SAFE_REF_PATTERN.test(normalized) || UNSAFE_VALUE_PATTERN.test(normalized)) {
    throw adapterError("validation_error", `${field} must be a safe reference`);
  }
  return normalized;
}

function safeRoute(value) {
  const normalized = text(value || "/");
  if (!SAFE_ROUTE_PATTERN.test(normalized) || UNSAFE_VALUE_PATTERN.test(normalized)) {
    throw adapterError("validation_error", "landingRoute must be a safe route");
  }
  return normalized;
}

function safeLandingRoute(value, approvedLandingRoutes = DEFAULT_PILOT_LANDING_ROUTES) {
  const landingRoute = safeRoute(value || "/portal/register");
  const approved = new Set(Array.from(approvedLandingRoutes, (route) => safeRoute(route)));
  if (!approved.has(landingRoute)) {
    throw adapterError("validation_error", "landingRoute is not approved for AppsFlyer pilot attribution");
  }
  return landingRoute;
}

function safeEventName(value) {
  return safeRef(value, "eventName");
}

function maybeSafeAccountRef(value) {
  return text(value) ? safeRef(value, "accountRef") : null;
}

function maybeSafeVisitorRef(value) {
  return text(value) ? safeRef(value, "visitorRef") : null;
}

function optionalSafeRef(value, field) {
  return text(value) ? safeRef(value, field) : null;
}

function optionalTimestamp(value) {
  if (value == null || value === "") return null;
  const timestamp = Number(value);
  if (!Number.isInteger(timestamp) || timestamp < 0) {
    throw adapterError("validation_error", "timestamp must be a Unix timestamp in milliseconds");
  }
  return timestamp;
}

function serverIdentifier(input = {}) {
  const customerUserId = text(input.customerUserId || input.customer_user_id || input.accountRef || input.account_ref)
    ? safeRef(input.customerUserId || input.customer_user_id || input.accountRef || input.account_ref, "customerUserId")
    : null;
  const afUserId = text(input.afUserId || input.af_user_id)
    ? safeRef(input.afUserId || input.af_user_id, "afUserId")
    : null;
  if (!customerUserId && !afUserId) {
    throw adapterError("validation_error", "customerUserId or afUserId is required");
  }
  return {
    customerUserId,
    afUserId
  };
}

function safeEventValueKeys(eventValue = {}) {
  const kept = [];
  const stripped = [];
  for (const [rawKey, rawValue] of Object.entries(eventValue || {})) {
    const key = text(rawKey).toLowerCase();
    if (!key || isUnsafeField(key) || !isSafeValue(rawValue)) {
      if (key) stripped.push(key);
      continue;
    }
    kept.push(key);
  }
  kept.sort();
  stripped.sort();
  return {
    kept,
    stripped
  };
}

function normalizePilotExtraParams(extraParams = {}) {
  const kept = {};
  const stripped = [];
  for (const [rawKey, rawValue] of Object.entries(asParams(extraParams))) {
    const key = text(rawKey).toLowerCase();
    if (!SAFE_PARAM_NAMES.has(key) || isUnsafeField(key) || !isSafeValue(rawValue)) {
      if (key) stripped.push(key);
      continue;
    }
    kept[key] = text(Array.isArray(rawValue) ? rawValue[0] : rawValue);
  }
  stripped.sort();
  return { kept, stripped };
}

function orderedQueryString(params = {}) {
  const orderedKeys = [
    ...PILOT_LINK_PARAM_ORDER,
    ...Object.keys(params).filter((key) => !PILOT_LINK_PARAM_ORDER.includes(key)).sort()
  ];
  const search = new URLSearchParams();
  for (const key of orderedKeys) {
    if (params[key]) {
      search.set(key, params[key]);
    }
  }
  return search.toString();
}

export function createAppsFlyerAttributionAdapter({
  env = process.env,
  allowLiveDispatch = false
} = {}) {
  const mode = normalizeMode(env.APPSFLYER_ATTRIBUTION_MODE);
  const credentialConfigured = configured(env.APPSFLYER_DEV_KEY) || configured(env.APPSFLYER_WEB_DEV_KEY);
  const appIdConfigured = configured(env.APPSFLYER_APP_ID);
  const liveDispatchAllowed = mode === "live" && allowLiveDispatch === true;

  if (mode === "live" && !liveDispatchAllowed) {
    throw adapterError(
      "production_gate_required",
      "live AppsFlyer dispatch requires an explicit production gate"
    );
  }

  function getConfigSummary() {
    return {
      provider: PROVIDER,
      mode,
      enabled: mode !== "disabled",
      credentialConfigured,
      appIdConfigured,
      liveDispatchAllowed,
      redacted: true
    };
  }

  function planPilotLink(input = {}) {
    const landingRoute = safeLandingRoute(input.landingRoute || input.landing_route, input.approvedLandingRoutes);
    const partnerRef = safeRef(input.partnerRef || input.partner_ref, "partnerRef");
    const campaignRef = safeRef(input.campaignRef || input.campaign_ref, "campaignRef");
    const channel = optionalSafeRef(input.channel || input.afChannel || input.af_channel || "partner", "channel");
    const creativeRef = optionalSafeRef(input.creativeRef || input.creative_ref || input.afSub2 || input.af_sub2, "creativeRef");
    const medium = optionalSafeRef(input.medium || input.utmMedium || input.utm_medium || "partner", "medium");
    const term = optionalSafeRef(input.term || input.utmTerm || input.utm_term, "term");
    const { kept: extraParams, stripped: strippedParams } = normalizePilotExtraParams(
      input.extraParams || input.extra_params
    );
    const queryParams = {
      ...extraParams,
      pid: partnerRef,
      c: campaignRef,
      partner_ref: partnerRef,
      campaign_ref: campaignRef,
      af_channel: channel,
      af_sub1: partnerRef,
      utm_source: partnerRef,
      utm_medium: medium,
      utm_campaign: campaignRef
    };
    if (creativeRef) {
      queryParams.af_sub2 = creativeRef;
      queryParams.utm_content = creativeRef;
    }
    if (term) {
      queryParams.utm_term = term;
    }
    const queryString = orderedQueryString(queryParams);

    return {
      provider: PROVIDER,
      mode,
      dryRun: true,
      dispatchBlocked: true,
      productionGateRequired: true,
      landingRoute,
      landingPath: `${landingRoute}?${queryString}`,
      partnerRef,
      campaignRef,
      queryParams,
      queryParamKeys: Object.keys(queryParams).sort(),
      strippedParams,
      redacted: true
    };
  }

  function normalizeLandingParams({ landingRoute = "/", params = {} } = {}) {
    const normalized = {};
    const strippedParams = [];
    for (const [rawKey, rawValue] of Object.entries(asParams(params))) {
      const key = text(rawKey).toLowerCase();
      if (!SAFE_PARAM_NAMES.has(key) || isUnsafeField(key) || !isSafeValue(rawValue)) {
        if (key) strippedParams.push(key);
        continue;
      }
      normalized[key] = text(Array.isArray(rawValue) ? rawValue[0] : rawValue);
    }

    return {
      provider: PROVIDER,
      partnerRef: normalized.partner_ref || normalized.pid || normalized.media_source || normalized.utm_source || null,
      campaignRef: normalized.campaign_ref || normalized.c || normalized.campaign || normalized.utm_campaign || null,
      landingRoute: safeRoute(landingRoute),
      metadata: normalized,
      strippedParams,
      redacted: true
    };
  }

  function planServerEvent(input = {}) {
    const eventName = safeEventName(input.eventName || input.event_name);
    const identifiers = serverIdentifier(input);
    const { kept, stripped } = safeEventValueKeys(input.eventValue || input.event_value);
    const timestamp = optionalTimestamp(input.timestamp);
    const payloadPreview = {
      eventType: "EVENT",
      eventName,
      eventValueKeys: kept,
      redactedCredentialFields: WEB_S2S_CREDENTIAL_FIELDS
    };
    if (identifiers.customerUserId) {
      payloadPreview.customerUserId = identifiers.customerUserId;
    }
    if (identifiers.afUserId) {
      payloadPreview.afUserId = identifiers.afUserId;
    }
    if (timestamp !== null) {
      payloadPreview.timestamp = timestamp;
    }

    return {
      provider: PROVIDER,
      mode,
      dryRun: !liveDispatchAllowed,
      dispatchBlocked: !liveDispatchAllowed,
      transport: {
        method: "POST",
        endpointTemplate: WEB_S2S_EVENT_ENDPOINT_TEMPLATE,
        bundleIdConfigured: appIdConfigured,
        credentialFields: WEB_S2S_CREDENTIAL_FIELDS,
        requiredIdentifiers: WEB_S2S_REQUIRED_IDENTIFIERS
      },
      payloadPreview,
      eventName,
      accountRef: maybeSafeAccountRef(input.accountRef || input.account_ref),
      eventValueKeys: kept,
      strippedEventValueKeys: stripped,
      redacted: true
    };
  }

  function planWebSdkEvent({ eventName, eventValue = {}, visitorRef = null } = {}) {
    const { kept, stripped } = safeEventValueKeys(eventValue);
    return {
      provider: PROVIDER,
      mode,
      dryRun: !liveDispatchAllowed,
      dispatchBlocked: !liveDispatchAllowed,
      eventName: safeEventName(eventName),
      visitorRef: maybeSafeVisitorRef(visitorRef),
      eventValueKeys: kept,
      strippedEventValueKeys: stripped,
      redacted: true
    };
  }

  return {
    getConfigSummary,
    planPilotLink,
    normalizeLandingParams,
    planServerEvent,
    planWebSdkEvent
  };
}
