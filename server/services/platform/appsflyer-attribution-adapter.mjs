const PROVIDER = "appsflyer";
const MODES = new Set(["disabled", "dry_run", "live"]);
const WEB_S2S_EVENT_ENDPOINT_TEMPLATE = "https://webs2s.appsflyer.com/v1/{bundleId}/event";
const WEB_S2S_CREDENTIAL_FIELDS = ["webDevKey"];
const WEB_S2S_REQUIRED_IDENTIFIERS = ["customerUserId", "afUserId"];
const SAFE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_:/-]{0,127}$/;
const SAFE_ROUTE_PATTERN = /^\/[A-Za-z0-9/_-]{0,127}$/;
const SAFE_PARAM_NAMES = new Set([
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
  "af_sub5"
]);
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

function safeEventName(value) {
  return safeRef(value, "eventName");
}

function maybeSafeAccountRef(value) {
  return text(value) ? safeRef(value, "accountRef") : null;
}

function maybeSafeVisitorRef(value) {
  return text(value) ? safeRef(value, "visitorRef") : null;
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
      partnerRef: normalized.pid || normalized.media_source || null,
      campaignRef: normalized.c || normalized.campaign || null,
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
    normalizeLandingParams,
    planServerEvent,
    planWebSdkEvent
  };
}
