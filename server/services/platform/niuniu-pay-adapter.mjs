import { createHash, timingSafeEqual } from "node:crypto";

const DEFAULT_API_BASE_URL = "https://niuniupay.cc";
const DEFAULT_USER_AGENT = "proxy-gateway-minimal/niuniu-pay";
const SUPPORTED_CHANNELS = new Set(["alipay", "wxpay", "qqpay", "bank", "jdpay"]);
const SUCCESS_STATUSES = new Set(["TRADE_SUCCESS", "TRADE_FINISHED", "success", "paid"]);

function adapterError(message) {
  const error = new Error(message);
  error.code = "niuniu_pay_adapter_error";
  return error;
}

function cleanString(value, maxLength = 240) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }
  return String(value).trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function requiredString(value, field, maxLength = 240) {
  const normalized = cleanString(value, maxLength);
  if (!normalized) {
    throw adapterError(`${field} is required`);
  }
  return normalized;
}

function normalizeBaseUrl(value) {
  const raw = requiredString(value || DEFAULT_API_BASE_URL, "apiBaseUrl", 240);
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw adapterError("apiBaseUrl must be a valid URL");
  }
  if (parsed.protocol !== "https:") {
    throw adapterError("apiBaseUrl must be https");
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

function normalizeAmount(value) {
  const amount = requiredString(value, "money", 40);
  if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) {
    throw adapterError("money must be a decimal amount with up to 2 fraction digits");
  }
  return amount;
}

function normalizeHttpsUrl(value, field) {
  const raw = requiredString(value, field, 500);
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw adapterError(`${field} must be a valid URL`);
  }
  if (parsed.protocol !== "https:") {
    throw adapterError(`${field} must be https`);
  }
  return parsed.toString();
}

function normalizeChannel(value) {
  const channel = requiredString(value, "type", 40).toLowerCase();
  if (!SUPPORTED_CHANNELS.has(channel)) {
    throw adapterError("type is invalid");
  }
  return channel;
}

function formEncode(params) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      body.set(key, String(value));
    }
  }
  return body.toString();
}

function firstCleanString(source = {}, keys = [], maxLength = 500) {
  for (const key of keys) {
    const value = cleanString(source[key], maxLength);
    if (value) return value;
  }
  return null;
}

async function parseJsonResponse(response) {
  if (!response || response.ok !== true) {
    throw adapterError("Niuniu Pay request failed");
  }
  try {
    return await response.json();
  } catch {
    throw adapterError("Niuniu Pay response was not valid JSON");
  }
}

function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

function safeInt(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildNiuniuPaySignature(params = {}, merchantKey) {
  const key = requiredString(merchantKey, "merchantKey", 1000);
  const signingText = Object.entries(params)
    .filter(([field, value]) => field !== "sign" && field !== "sign_type" && value !== undefined && value !== null && value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([field, value]) => `${field}=${String(value)}`)
    .join("&");

  return createHash("md5").update(`${signingText}${key}`).digest("hex").toLowerCase();
}

export function verifyNiuniuPaySignature(payload = {}, options = {}) {
  const merchantId = requiredString(options.merchantId, "merchantId", 120);
  const merchantKey = requiredString(options.merchantKey, "merchantKey", 1000);
  const payloadPid = requiredString(payload.pid, "payload.pid", 120);
  if (payloadPid !== merchantId) {
    throw adapterError("payload merchant is invalid");
  }

  const receivedSign = requiredString(payload.sign, "payload.sign", 80).toLowerCase();
  const expectedSign = buildNiuniuPaySignature(payload, merchantKey);
  if (!constantTimeEqual(receivedSign, expectedSign)) {
    throw adapterError("signature is invalid");
  }

  const tradeStatus = cleanString(payload.trade_status, 80);
  const eventType = SUCCESS_STATUSES.has(tradeStatus) ? "payment_succeeded" : "payment_failed";
  return {
    provider: "niuniu-pay",
    providerEventRef: requiredString(payload.trade_no, "payload.trade_no", 120),
    orderId: requiredString(payload.out_trade_no, "payload.out_trade_no", 120),
    eventType,
    amount: normalizeAmount(payload.money),
    channel: cleanString(payload.type, 40) || null,
    signatureStatus: "verified",
    receivedAt: options.receivedAt || new Date().toISOString(),
    safety: {
      noRawMerchantKey: true,
      noRawProviderPayload: true
    }
  };
}

export function createNiuniuPayAdapter(options = {}) {
  const apiBaseUrl = normalizeBaseUrl(options.apiBaseUrl || DEFAULT_API_BASE_URL);
  const merchantId = cleanString(options.merchantId, 120);
  const merchantKey = cleanString(options.merchantKey, 1000);
  const fetchFn = options.fetchFn || globalThis.fetch;
  const userAgent = cleanString(options.userAgent || DEFAULT_USER_AGENT, 120);

  function assertConfigured() {
    if (!merchantId || !merchantKey) {
      throw adapterError("Niuniu Pay merchant credentials are not configured");
    }
    if (typeof fetchFn !== "function") {
      throw adapterError("fetchFn is required");
    }
  }

  return {
    provider: "niuniu-pay",
    apiBaseUrl,
    isConfigured: Boolean(merchantId && merchantKey && typeof fetchFn === "function"),

    async queryMerchant() {
      assertConfigured();
      const url = new URL(`${apiBaseUrl}/api.php`);
      url.searchParams.set("act", "query");
      url.searchParams.set("pid", merchantId);
      url.searchParams.set("key", merchantKey);

      const data = await parseJsonResponse(await fetchFn(url.toString(), {
        headers: {
          "User-Agent": userAgent
        }
      }));

      return {
        provider: "niuniu-pay",
        code: safeInt(data.code),
        pidMatched: String(data.pid) === merchantId,
        active: safeInt(data.active),
        money: data.money === undefined || data.money === null ? null : String(data.money),
        settlementType: safeInt(data.type),
        orders: safeInt(data.orders),
        orderToday: safeInt(data.order_today),
        orderLastday: safeInt(data.order_lastday),
        safety: {
          noRawMerchantKey: true,
          noSettlementAccount: true,
          noSettlementName: true
        }
      };
    },

    async createPaymentOrder(input = {}) {
      assertConfigured();
      const payload = {
        pid: merchantId,
        type: normalizeChannel(input.type),
        out_trade_no: requiredString(input.outTradeNo, "outTradeNo", 120),
        notify_url: normalizeHttpsUrl(input.notifyUrl, "notifyUrl"),
        return_url: input.returnUrl ? normalizeHttpsUrl(input.returnUrl, "returnUrl") : undefined,
        name: requiredString(input.name, "name", 120),
        money: normalizeAmount(input.money),
        clientip: requiredString(input.clientIp, "clientIp", 80),
        device: input.device ? cleanString(input.device, 40) : undefined,
        param: input.param ? cleanString(input.param, 120) : undefined
      };
      payload.sign = buildNiuniuPaySignature(payload, merchantKey);
      payload.sign_type = "MD5";

      const data = await parseJsonResponse(await fetchFn(`${apiBaseUrl}/mapi.php`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": userAgent
        },
        body: formEncode(payload)
      }));

      return {
        provider: "niuniu-pay",
        code: safeInt(data.code),
        providerOrderRef: firstCleanString(data, ["trade_no", "tradeNo"], 120),
        checkoutUrl: firstCleanString(data, ["payurl", "pay_url", "checkout_url", "checkoutUrl"], 500),
        qrCode: firstCleanString(data, ["qrcode", "qr_code", "qrCode", "code_url", "codeUrl", "qr_url", "qrUrl"], 2000),
        urlScheme: firstCleanString(data, ["urlscheme", "url_scheme", "urlScheme"], 500),
        safety: {
          noRawMerchantKey: true,
          noRawProviderPayload: true
        }
      };
    },

    async refundPaymentOrder(input = {}) {
      assertConfigured();
      const providerOrderRef = cleanString(input.providerOrderRef || input.tradeNo, 120);
      const outTradeNo = cleanString(input.outTradeNo, 120);
      if (!providerOrderRef && !outTradeNo) {
        throw adapterError("providerOrderRef or outTradeNo is required");
      }
      const payload = {
        pid: merchantId,
        key: merchantKey,
        money: normalizeAmount(input.money)
      };
      if (providerOrderRef) payload.trade_no = providerOrderRef;
      if (outTradeNo) payload.out_trade_no = outTradeNo;

      const url = new URL(`${apiBaseUrl}/api.php`);
      url.searchParams.set("act", "refund");
      const data = await parseJsonResponse(await fetchFn(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": userAgent
        },
        body: formEncode(payload)
      }));

      const code = safeInt(data.code);
      return {
        provider: "niuniu-pay",
        code,
        success: code === 0,
        providerRefundRef: firstCleanString(data, ["refund_no", "refundNo", "refund_trade_no", "trade_no", "tradeNo"], 120)
          || providerOrderRef
          || outTradeNo,
        message: firstCleanString(data, ["msg", "message"], 240),
        safety: {
          noRawMerchantKey: true,
          noRawProviderPayload: true
        }
      };
    },

    verifyNotification(payload = {}, verifyOptions = {}) {
      return verifyNiuniuPaySignature(payload, {
        merchantId,
        merchantKey,
        ...verifyOptions
      });
    }
  };
}
