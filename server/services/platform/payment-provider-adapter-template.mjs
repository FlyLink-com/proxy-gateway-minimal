import {
  normalizeBillingPaymentEvent
} from "./billing-provider-contract.mjs";

const SUPPORTED_PROVIDER_IDS = new Set([
  "paypal",
  "stripe",
  "paddle",
  "lemonsqueezy",
  "alipay",
  "wechatpay",
  "manual",
  "mock"
]);
const PROVIDER_ALIASES = {
  paypal: "paypal",
  stripe: "stripe",
  paddle: "paddle",
  lemonsqueezy: "lemonsqueezy",
  lemon: "lemonsqueezy",
  alipay: "alipay",
  wechat: "wechatpay",
  wechatpay: "wechatpay",
  weixin: "wechatpay",
  weixinpay: "wechatpay",
  manual: "manual",
  mock: "mock"
};
const PROVIDER_REQUIRED_ENV = Object.freeze({
  paypal: ["PAYMENT_PROVIDER_API_KEY", "PAYMENT_PROVIDER_API_SECRET", "PAYMENT_PROVIDER_WEBHOOK_SECRET"],
  stripe: ["PAYMENT_PROVIDER_API_SECRET", "PAYMENT_PROVIDER_WEBHOOK_SECRET"],
  paddle: ["PAYMENT_PROVIDER_API_KEY", "PAYMENT_PROVIDER_WEBHOOK_SECRET"],
  lemonsqueezy: ["PAYMENT_PROVIDER_API_KEY", "PAYMENT_PROVIDER_WEBHOOK_SECRET"],
  alipay: [
    "PAYMENT_PROVIDER_APP_ID",
    "PAYMENT_PROVIDER_API_SECRET",
    "PAYMENT_PROVIDER_MERCHANT_ID",
    "PAYMENT_PROVIDER_PRIVATE_KEY_PATH"
  ],
  wechatpay: [
    "PAYMENT_PROVIDER_MERCHANT_ID",
    "PAYMENT_PROVIDER_API_SECRET",
    "PAYMENT_PROVIDER_CERT_SERIAL",
    "PAYMENT_PROVIDER_PRIVATE_KEY_PATH"
  ],
  manual: [],
  mock: []
});
const PAYMENT_EVENT_TYPES = new Set([
  "payment_pending",
  "payment_succeeded",
  "payment_failed",
  "payment_refunded",
  "payment_chargeback"
]);

function adapterError(message) {
  const error = new Error(message);
  error.code = "payment_adapter_contract_error";
  return error;
}

function cleanString(value, maxLength = 160) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }
  return String(value).trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function requiredString(value, field, maxLength = 160) {
  const normalized = cleanString(value, maxLength);
  if (!normalized) {
    throw adapterError(`${field} is required`);
  }
  return normalized;
}

function normalizeProvider(value) {
  const raw = requiredString(value, "provider", 80).toLowerCase().replace(/[-_\s]/g, "");
  const provider = PROVIDER_ALIASES[raw];
  if (!provider || !SUPPORTED_PROVIDER_IDS.has(provider)) {
    throw adapterError("provider is invalid");
  }
  return provider;
}

function normalizeMode(value) {
  const mode = cleanString(value || "sandbox", 40).toLowerCase();
  if (!["sandbox", "live", "manual", "mock"].includes(mode)) {
    throw adapterError("payment mode is invalid");
  }
  return mode;
}

function normalizeHttpsUrl(value, field, options = {}) {
  const url = cleanString(value, 240);
  if (!url) {
    return null;
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw adapterError(`${field} must be a valid URL`);
  }
  const local = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(options.allowLocalTest === true && local)) {
    throw adapterError(`${field} must be https unless allowLocalTest is enabled for loopback`);
  }
  return parsed.toString();
}

function isConfiguredSecret(value) {
  const text = cleanString(value, 1000);
  if (!text) {
    return false;
  }
  return !/^(replace|changeme|change_me|example|placeholder|test|todo|set_|<)/i.test(text);
}

function safeConfiguredEnvSummary(env = {}) {
  return {
    apiKeyConfigured: isConfiguredSecret(env.PAYMENT_PROVIDER_API_KEY || env.PAYMENT_API_KEY),
    apiSecretConfigured: isConfiguredSecret(env.PAYMENT_PROVIDER_API_SECRET || env.PAYMENT_API_SECRET),
    webhookSecretConfigured: isConfiguredSecret(env.PAYMENT_PROVIDER_WEBHOOK_SECRET || env.PAYMENT_WEBHOOK_SECRET),
    appIdConfigured: isConfiguredSecret(env.PAYMENT_PROVIDER_APP_ID),
    merchantIdConfigured: isConfiguredSecret(env.PAYMENT_PROVIDER_MERCHANT_ID),
    certSerialConfigured: isConfiguredSecret(env.PAYMENT_PROVIDER_CERT_SERIAL),
    privateKeyPathConfigured: isConfiguredSecret(env.PAYMENT_PROVIDER_PRIVATE_KEY_PATH)
  };
}

function assertNoSensitivePayload(payload = {}) {
  for (const field of [
    "rawPayload",
    "rawProviderPayload",
    "customerEmail",
    "cardToken",
    "paymentCredential",
    "apiKey",
    "apiSecret",
    "accessKey",
    "secretKey"
  ]) {
    if (payload[field] !== undefined) {
      throw adapterError(`${field} is not allowed in safe payment event facts`);
    }
  }
}

function notImplemented(operation) {
  const error = new Error(`${operation} requires a provider-specific adapter`);
  error.code = "payment_provider_adapter_not_implemented";
  throw error;
}

export function summarizePaymentProviderEnvironment(env = {}, options = {}) {
  const provider = normalizeProvider(options.provider ?? env.PAYMENT_PROVIDER ?? "manual");
  const mode = normalizeMode(options.mode ?? env.PAYMENT_MODE ?? "sandbox");
  const requiredEnv = PROVIDER_REQUIRED_ENV[provider] || [];
  const configured = safeConfiguredEnvSummary(env);
  const returnUrl = normalizeHttpsUrl(env.PAYMENT_RETURN_URL, "PAYMENT_RETURN_URL", options);
  const cancelUrl = normalizeHttpsUrl(env.PAYMENT_CANCEL_URL, "PAYMENT_CANCEL_URL", options);
  const publicBaseUrl = normalizeHttpsUrl(env.PAYMENT_PUBLIC_BASE_URL, "PAYMENT_PUBLIC_BASE_URL", options);

  return {
    provider,
    mode,
    requiredEnv,
    configured,
    urls: {
      publicBaseUrlConfigured: Boolean(publicBaseUrl),
      returnUrlConfigured: Boolean(returnUrl),
      cancelUrlConfigured: Boolean(cancelUrl)
    },
    status: "template_only",
    safety: {
      summaryOnly: true,
      noRawApiKey: true,
      noRawApiSecret: true,
      noWebhookSecret: true,
      noRawProviderPayload: true,
      noPaymentCredential: true,
      noCheckoutCreation: true,
      noBillingMutation: true,
      noSubscriptionMutation: true
    }
  };
}

export function createPaymentProviderAdapterTemplate(options = {}) {
  const summary = summarizePaymentProviderEnvironment(options.env || {}, options);
  return {
    provider: summary.provider,
    mode: summary.mode,
    summary,
    async createRechargeOrder() {
      return notImplemented("createRechargeOrder");
    },
    async capturePayment() {
      return notImplemented("capturePayment");
    },
    async verifyWebhook() {
      return notImplemented("verifyWebhook");
    },
    normalizeVerifiedPaymentEvent(payload = {}) {
      return normalizeVerifiedPaymentProviderEvent({
        ...payload,
        provider: payload.provider ?? summary.provider
      });
    }
  };
}

export function normalizeVerifiedPaymentProviderEvent(payload = {}, options = {}) {
  assertNoSensitivePayload(payload);
  const provider = normalizeProvider(payload.provider ?? options.provider);
  const eventType = requiredString(payload.eventType, "eventType", 80).toLowerCase();
  if (!PAYMENT_EVENT_TYPES.has(eventType)) {
    throw adapterError("eventType is invalid");
  }
  const verificationStatus = requiredString(payload.verificationStatus, "verificationStatus", 80).toLowerCase();
  if (verificationStatus !== "verified") {
    throw adapterError("payment event must be verified before normalization");
  }

  return normalizeBillingPaymentEvent({
    id: payload.id,
    provider,
    providerEventRef: payload.providerEventRef,
    idempotencyKey: payload.idempotencyKey,
    orderId: payload.orderId,
    eventType,
    signatureStatus: "verified",
    receivedAt: payload.receivedAt,
    createdAt: payload.createdAt
  }, options);
}
