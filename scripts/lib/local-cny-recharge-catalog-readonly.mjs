import { createHash } from "node:crypto";

const RECHARGE_PATH = "/api/portal/coins/recharge";
const PROVIDER_PATH = "/api/platform/payments";

function paymentPath(path) {
  return path === RECHARGE_PATH || path.startsWith(`${RECHARGE_PATH}/`)
    || path === PROVIDER_PATH || path.startsWith(`${PROVIDER_PATH}/`);
}

function allowedPaymentRead(method, target) {
  if (method !== "GET") return false;
  return target === `${RECHARGE_PATH}/offers`
    || target === `${RECHARGE_PATH}/orders`
    || /^\/api\/portal\/coins\/recharge\/orders\/[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(target);
}

function isPaymentRequest(target) {
  if (typeof target !== "string") return true;
  try {
    const path = decodeURIComponent(new URL(target, "http://127.0.0.1").pathname)
      .replaceAll("\\", "/").replace(/\/{2,}/gu, "/").toLowerCase();
    return paymentPath(path) || paymentPath(target.split(/[?#]/u, 1)[0].toLowerCase());
  } catch {
    // Malformed targets must never escape into a provider-capable router.
    return true;
  }
}

// This profile is only composed by the marker-owned local validation harness.
// It uses the real production CNY catalog/route projection, but never allows a
// recharge mutation, callback, provider request, or generated checkout action.
export function createLocalCnyRechargeCatalogReadonlyProfile() {
  if (arguments.length !== 0) throw new Error("local CNY profile accepts no arguments");
  let rejectedPaymentRequests = 0;
  let rejectedProviderCalls = 0;
  const env = Object.freeze({
    PLATFORM_COIN_RECHARGE_ENABLED: "true",
    PLATFORM_XSD_PAYMENT_ENABLED: "true",
    PLATFORM_XSD_PAYMENT_METHOD: "alipay",
    PLATFORM_PAYPAL_SANDBOX_ENABLED: "false",
    PLATFORM_CHAOJIPAY_PAYMENT_ENABLED: "false",
    PLATFORM_XSD_MERCHANT_ID: "local_catalog_only",
    PLATFORM_XSD_MERCHANT_SECRET: "local-only-synthetic-catalog-secret",
    PLATFORM_XSD_MERCHANT_SCOPE_DIGEST: createHash("sha256")
      .update("local-cny-catalog-readonly-v1", "utf8").digest("hex"),
    PLATFORM_XSD_ALLOWED_ACTION_ORIGINS_JSON: JSON.stringify(["https://www.xsd8866.com"]),
    PLATFORM_XSD_CALLBACK_URL: "https://portal.example.test/api/platform/payments/xsd/callback",
    PLATFORM_XSD_RETURN_URL: "https://portal.example.test/wallet",
  });
  const runtimeOptions = Object.freeze({
    async xsdFetchFn() {
      rejectedProviderCalls += 1;
      const error = new Error("local payment network disabled");
      error.code = "local_payment_network_disabled";
      throw error;
    },
  });
  return Object.freeze({
    env,
    runtimeOptions,
    wrapRequestHandler(handler) {
      if (typeof handler !== "function") throw new TypeError("local app handler required");
      return (req, res) => {
        if (isPaymentRequest(req.url) && !allowedPaymentRead(req.method, req.url)) {
          rejectedPaymentRequests += 1;
          res.statusCode = 403;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify({ error: { code: "payment_recharge_unavailable", retryable: false } }));
          return;
        }
        handler(req, res);
      };
    },
    inspect: () => Object.freeze({ readonly: true, rejectedPaymentRequests, rejectedProviderCalls }),
  });
}
