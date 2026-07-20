import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { normalizeVerifiedPaymentProviderEvent } from "./payment-provider-adapter-template.mjs";

const PAYPAL_API_ORIGINS = Object.freeze({
  sandbox: "https://api-m.sandbox.paypal.com",
  live: "https://api-m.paypal.com"
});
const PAYPAL_JS_SDK_URL = "https://www.paypal.com/sdk/js";
const PAYPAL_CHECKOUT_TTL_MS = 10 * 60 * 1000;
const PAYPAL_WEBHOOK_EVENT_TYPES = Object.freeze({
  "CHECKOUT.ORDER.APPROVED": "payment_pending",
  "PAYMENT.CAPTURE.COMPLETED": "payment_succeeded",
  "PAYMENT.CAPTURE.DENIED": "payment_failed",
  "PAYMENT.CAPTURE.DECLINED": "payment_failed",
  "PAYMENT.CAPTURE.REFUNDED": "payment_refunded",
  "CUSTOMER.DISPUTE.CREATED": "payment_chargeback"
});

function paypalError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  if (status) error.status = status;
  return error;
}

function cleanText(value, maxLength = 240) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }
  return String(value).trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function requiredText(value, field, maxLength = 240) {
  const normalized = cleanText(value, maxLength);
  if (!normalized) {
    throw paypalError("payment_provider_config_error", `${field} is required`);
  }
  return normalized;
}

function optionalText(value, maxLength = 240) {
  return cleanText(value, maxLength) || null;
}

function normalizeMode(value) {
  const mode = cleanText(value || "sandbox", 40).toLowerCase();
  if (mode !== "sandbox" && mode !== "live") {
    throw paypalError("payment_provider_config_error", "PAYMENT_MODE must be sandbox or live for PayPal");
  }
  return mode;
}

function normalizeCurrency(value) {
  const currency = cleanText(value || "USD", 12).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw paypalError("payment_provider_config_error", "payment currency is invalid");
  }
  return currency;
}

function positiveInteger(value, field) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw paypalError("payment_provider_validation_error", `${field} must be an integer > 0`);
  }
  return parsed;
}

function isoNow(nowFn) {
  const value = nowFn();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw paypalError("payment_provider_validation_error", "now must be a valid timestamp");
  }
  return date.toISOString();
}

function httpsUrl(value, field) {
  const normalized = optionalText(value);
  if (!normalized) return null;
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw paypalError("payment_provider_config_error", `${field} must be a valid URL`);
  }
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !local) {
    throw paypalError("payment_provider_config_error", `${field} must be https outside loopback`);
  }
  return parsed.toString();
}

function isConfigured(value) {
  const text = cleanText(value, 1000);
  return Boolean(text && !/^(replace|changeme|change_me|example|placeholder|test|todo|set_|<)/i.test(text));
}

function paypalClientId(env) {
  return env.PAYMENT_PROVIDER_API_KEY || env.PAYPAL_CLIENT_ID || env.PAYMENT_API_KEY;
}

function paypalClientSecret(env) {
  return env.PAYMENT_PROVIDER_API_SECRET || env.PAYPAL_CLIENT_SECRET || env.PAYMENT_API_SECRET;
}

function paypalWebhookId(env) {
  return env.PAYMENT_PROVIDER_WEBHOOK_SECRET || env.PAYPAL_WEBHOOK_ID || env.PAYMENT_WEBHOOK_SECRET;
}

function amountValue(amountMinor) {
  return (positiveInteger(amountMinor, "amountMinor") / 100).toFixed(2);
}

function jsonHeaders(accessToken) {
  return {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json"
  };
}

function paypalRequestId(value, prefix) {
  const normalized = requiredText(value, "PayPal request id seed", 240);
  if (/^[A-Za-z0-9._-]{1,80}$/.test(normalized)) {
    return normalized;
  }
  return `${prefix}_${createHash("sha256").update(normalized).digest("hex").slice(0, 32)}`;
}

async function parseJsonResponse(response) {
  return await response.json().catch(() => ({}));
}

function approveLink(order) {
  const links = Array.isArray(order?.links) ? order.links : [];
  return optionalText(links.find((link) => link?.rel === "approve")?.href, 500);
}

function captureRef(captureBody) {
  const purchaseUnits = Array.isArray(captureBody?.purchase_units) ? captureBody.purchase_units : [];
  for (const unit of purchaseUnits) {
    const captures = Array.isArray(unit?.payments?.captures) ? unit.payments.captures : [];
    const completed = captures.find((capture) => cleanText(capture?.status, 40).toUpperCase() === "COMPLETED")
      || captures[0];
    if (completed?.id) {
      return cleanText(completed.id, 120);
    }
  }
  return cleanText(captureBody?.id, 120);
}

function paidAt(captureBody, fallback) {
  const purchaseUnits = Array.isArray(captureBody?.purchase_units) ? captureBody.purchase_units : [];
  for (const unit of purchaseUnits) {
    const captures = Array.isArray(unit?.payments?.captures) ? unit.payments.captures : [];
    const completed = captures.find((capture) => cleanText(capture?.status, 40).toUpperCase() === "COMPLETED")
      || captures[0];
    if (completed?.create_time) {
      const parsed = new Date(completed.create_time);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
  }
  return fallback;
}

function lowerHeader(headers = {}, name) {
  const wanted = name.toLowerCase();
  if (typeof headers.get === "function") {
    return cleanText(headers.get(name) || headers.get(wanted), 1000);
  }
  for (const [key, value] of Object.entries(headers || {})) {
    if (String(key).toLowerCase() === wanted) {
      return cleanText(value, 1000);
    }
  }
  return "";
}

function webhookOrderRef(body = {}) {
  return optionalText(
    body.resource?.custom_id
    || body.resource?.invoice_id
    || body.resource?.supplementary_data?.related_ids?.order_id
    || body.resource?.id,
    120
  );
}

export function summarizePayPalPaymentEnvironment(env = {}, options = {}) {
  const mode = normalizeMode(options.mode ?? env.PAYMENT_MODE ?? "sandbox");
  const currency = normalizeCurrency(options.currency ?? env.PAYMENT_PROVIDER_CURRENCY ?? env.PAYMENT_CURRENCY);
  const clientId = cleanText(paypalClientId(env), 500);
  const sdkUrl = new URL(PAYPAL_JS_SDK_URL);
  if (clientId) sdkUrl.searchParams.set("client-id", clientId);
  sdkUrl.searchParams.set("currency", currency);
  sdkUrl.searchParams.set("intent", "capture");

  return {
    provider: "paypal",
    mode,
    apiOrigin: PAYPAL_API_ORIGINS[mode],
    configured: {
      clientIdConfigured: isConfigured(clientId),
      clientSecretConfigured: isConfigured(paypalClientSecret(env)),
      webhookIdConfigured: isConfigured(paypalWebhookId(env)),
      returnUrlConfigured: Boolean(httpsUrl(env.PAYMENT_RETURN_URL, "PAYMENT_RETURN_URL")),
      cancelUrlConfigured: Boolean(httpsUrl(env.PAYMENT_CANCEL_URL, "PAYMENT_CANCEL_URL"))
    },
    hostedCheckout: {
      uiSource: "paypal_hosted",
      sdkUrl: sdkUrl.toString(),
      clientSecretExposed: false
    },
    safety: {
      noRawClientSecret: true,
      noRawWebhookId: true,
      noRawProviderPayload: true,
      noBillingMutation: true,
      noSubscriptionIssued: true
    }
  };
}

export function createPayPalPaymentAdapter(options = {}) {
  const env = options.env || {};
  const mode = normalizeMode(options.mode ?? env.PAYMENT_MODE ?? "sandbox");
  const apiOrigin = options.apiOrigin || PAYPAL_API_ORIGINS[mode];
  const nowFn = options.nowFn || (() => new Date());
  const fetchFn = options.fetchFn || fetch;
  const clientId = requiredText(paypalClientId(env), "PayPal REST client id", 500);
  const clientSecret = requiredText(paypalClientSecret(env), "PayPal REST client secret", 1000);
  const webhookId = optionalText(paypalWebhookId(env), 500);
  const returnUrl = httpsUrl(env.PAYMENT_RETURN_URL, "PAYMENT_RETURN_URL");
  const cancelUrl = httpsUrl(env.PAYMENT_CANCEL_URL, "PAYMENT_CANCEL_URL");

  async function accessToken() {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
    const response = await fetchFn(`${apiOrigin}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }).toString()
    });
    const body = await parseJsonResponse(response);
    if (!response.ok || !body?.access_token) {
      throw paypalError("payment_provider_auth_failed", "PayPal access token request failed", response.status);
    }
    return cleanText(body.access_token, 4000);
  }

  async function paypalJson(path, init = {}) {
    const token = await accessToken();
    const response = await fetchFn(`${apiOrigin}${path}`, {
      ...init,
      headers: {
        ...jsonHeaders(token),
        ...(init.headers || {})
      }
    });
    const body = await parseJsonResponse(response);
    return { response, body };
  }

  return {
    provider: "paypal",
    mode,
    summary: summarizePayPalPaymentEnvironment(env, { mode }),

    async createCheckoutOrder(input = {}) {
      const timestamp = isoNow(nowFn);
      const orderRef = requiredText(input.orderRef, "orderRef", 120);
      const currency = normalizeCurrency(input.currency || env.PAYMENT_PROVIDER_CURRENCY || env.PAYMENT_CURRENCY);
      const experienceContext = {};
      if (returnUrl) experienceContext.return_url = returnUrl;
      if (cancelUrl) experienceContext.cancel_url = cancelUrl;
      experienceContext.brand_name = cleanText(env.PAYMENT_PROVIDER_BRAND_NAME || "GCC WebOS", 127);
      experienceContext.shipping_preference = "NO_SHIPPING";
      experienceContext.user_action = "PAY_NOW";

      const { response, body } = await paypalJson("/v2/checkout/orders", {
        method: "POST",
        headers: {
          "PayPal-Request-Id": paypalRequestId(orderRef, "order")
        },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{
            reference_id: orderRef,
            custom_id: orderRef,
            description: cleanText(input.description || input.packageRef || "GCC WebOS order", 127),
            amount: {
              currency_code: currency,
              value: amountValue(input.amountMinor)
            }
          }],
          payment_source: {
            paypal: {
              experience_context: experienceContext
            }
          }
        })
      });
      if (!response.ok || !body?.id) {
        throw paypalError("payment_provider_order_create_failed", "PayPal checkout order creation failed", response.status);
      }
      const checkoutUrl = approveLink(body);
      if (!checkoutUrl) {
        throw paypalError("payment_provider_checkout_unavailable", "PayPal checkout approve link is unavailable");
      }
      return {
        provider: "paypal",
        mode,
        providerOrderRef: cleanText(body.id, 120),
        status: "pending_payment",
        checkoutUrl,
        createdAt: timestamp,
        safety: {
          clientSecretExposed: false,
          noRawProviderPayload: true,
          noBillingMutation: true,
          noSubscriptionIssued: true
        }
      };
    },

    async capturePayment(input = {}) {
      const timestamp = isoNow(nowFn);
      const providerOrderRef = requiredText(input.providerOrderRef, "providerOrderRef", 120);
      const { response, body } = await paypalJson(`/v2/checkout/orders/${encodeURIComponent(providerOrderRef)}/capture`, {
        method: "POST",
        headers: {
          "PayPal-Request-Id": paypalRequestId(input.idempotencyKey || input.orderRef || providerOrderRef, "capture")
        },
        body: "{}"
      });
      if (response.status === 422) {
        return {
          provider: "paypal",
          providerOrderRef,
          status: "pending_payment",
          checkedAt: timestamp,
          safety: {
            noRawProviderPayload: true,
            noBillingMutation: true,
            noSubscriptionIssued: true
          }
        };
      }
      if (!response.ok) {
        throw paypalError("payment_provider_capture_failed", "PayPal capture failed", response.status);
      }
      const completed = cleanText(body?.status, 40).toUpperCase() === "COMPLETED";
      return {
        provider: "paypal",
        providerOrderRef,
        providerCaptureRef: captureRef(body),
        status: completed ? "paid_pending_admin_review" : "pending_payment",
        paidAt: completed ? paidAt(body, timestamp) : undefined,
        checkedAt: timestamp,
        safety: {
          noRawProviderPayload: true,
          noBillingMutation: true,
          noSubscriptionIssued: true
        }
      };
    },

    async verifyWebhook(input = {}, options = {}) {
      if (!webhookId) {
        throw paypalError("payment_provider_config_error", "PayPal webhook id is required");
      }
      const headers = input.headers || {};
      const eventBody = input.body || {};
      const { response, body } = await paypalJson("/v1/notifications/verify-webhook-signature", {
        method: "POST",
        body: JSON.stringify({
          auth_algo: requiredText(lowerHeader(headers, "paypal-auth-algo"), "paypal-auth-algo", 120),
          cert_url: requiredText(lowerHeader(headers, "paypal-cert-url"), "paypal-cert-url", 500),
          transmission_id: requiredText(lowerHeader(headers, "paypal-transmission-id"), "paypal-transmission-id", 240),
          transmission_sig: requiredText(lowerHeader(headers, "paypal-transmission-sig"), "paypal-transmission-sig", 1000),
          transmission_time: requiredText(lowerHeader(headers, "paypal-transmission-time"), "paypal-transmission-time", 120),
          webhook_id: webhookId,
          webhook_event: eventBody
        })
      });
      if (!response.ok || body?.verification_status !== "SUCCESS") {
        throw paypalError("payment_provider_webhook_unverified", "PayPal webhook signature verification failed", response.status);
      }
      const providerEventRef = requiredText(eventBody.id, "webhook event id", 120);
      const eventType = PAYPAL_WEBHOOK_EVENT_TYPES[cleanText(eventBody.event_type, 120).toUpperCase()];
      if (!eventType) {
        throw paypalError("payment_provider_webhook_unsupported", "PayPal webhook event type is unsupported");
      }
      const transmissionId = requiredText(lowerHeader(headers, "paypal-transmission-id"), "paypal-transmission-id", 240);
      return normalizeVerifiedPaymentProviderEvent({
        id: options.idFactory?.() || `evt_paypal_${providerEventRef}`.slice(0, 80),
        provider: "paypal",
        providerEventRef,
        idempotencyKey: `paypal:${transmissionId}:${providerEventRef}`,
        orderId: requiredText(webhookOrderRef(eventBody), "webhook order ref", 120),
        eventType,
        verificationStatus: "verified",
        receivedAt: options.receivedAt || timestampOrNow(eventBody.create_time, nowFn),
        createdAt: timestampOrNow(eventBody.create_time, nowFn)
      }, options);
    }
  };
}

function timestampOrNow(value, nowFn) {
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }
  return isoNow(nowFn);
}
