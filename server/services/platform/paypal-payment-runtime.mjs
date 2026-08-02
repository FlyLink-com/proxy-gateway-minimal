import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";

const API_ORIGIN = "https://api-m.sandbox.paypal.com";
const SAFE_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const DIGEST_RE = /^[a-f0-9]{64}$/u;
const MAX_JSON_BYTES = 1_048_576;
const OPERATION_BY_ACTION = Object.freeze({
  paypal_orders_create: "create_recharge_order",
  paypal_orders_query: "query_payment",
  paypal_orders_capture: "capture_payment",
  paypal_webhook_verify: "verify_callback",
});

function fail() {
  throw new Error("paypal_transport_failed");
}

function snapshot(value, fields) {
  if (
    value === null || typeof value !== "object" || Array.isArray(value)
    || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
  ) fail();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== fields.length
    || keys.some((key) => typeof key !== "string" || !fields.includes(key))
    || fields.some((field) => !Object.hasOwn(descriptors, field))
  ) fail();
  const result = {};
  for (const field of fields) {
    const descriptor = descriptors[field];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) fail();
    result[field] = descriptor.value;
  }
  return result;
}

function safeRef(value) {
  if (typeof value !== "string" || !SAFE_REF_RE.test(value)) fail();
  return value;
}

function secretText(value, maximum = 4096) {
  if (
    typeof value !== "string" || value.length < 1 || value.length > maximum
    || /[\0\r\n]/u.test(value)
  ) fail();
  return value;
}

function digest(value) {
  if (typeof value !== "string" || !DIGEST_RE.test(value)) fail();
  return value;
}

function httpsUrl(value, allowedOrigin = null) {
  let parsed;
  try { parsed = new URL(value); } catch { fail(); }
  if (
    parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== ""
    || parsed.hash !== "" || (allowedOrigin !== null && (
      parsed.origin !== allowedOrigin || parsed.pathname !== "/" || parsed.search !== ""
    ))
  ) fail();
  return parsed.toString().replace(/\/$/u, "");
}

function normalizeCredential(value) {
  const input = snapshot(value, [
    "clientId", "clientSecret", "webhookId", "merchantScopeDigest",
  ]);
  return Object.freeze({
    clientId: secretText(input.clientId),
    clientSecret: secretText(input.clientSecret),
    webhookId: secretText(input.webhookId, 128),
    merchantScopeDigest: digest(input.merchantScopeDigest),
  });
}

function normalizeOrigins(value) {
  if (
    !Array.isArray(value) || utilTypes.isProxy(value)
    || value.length < 1 || value.length > 8
  ) fail();
  return Object.freeze(value.map((entry) => {
    const parsed = new URL(httpsUrl(entry));
    if (parsed.pathname !== "/" || parsed.search !== "") fail();
    return parsed.origin;
  }));
}

function normalizeRouteMap(value) {
  if (
    value === null || typeof value !== "object" || Array.isArray(value)
    || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
  ) fail();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length < 1 || keys.length > 32 || keys.some((key) => typeof key !== "string")) fail();
  const routes = new Map();
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) fail();
    routes.set(safeRef(key), httpsUrl(descriptor.value));
  }
  return routes;
}

async function jsonResponse(response) {
  if (
    response === null || typeof response !== "object"
    || !Number.isSafeInteger(response.status) || typeof response.text !== "function"
  ) fail();
  let text;
  try { text = await response.text(); } catch { fail(); }
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > MAX_JSON_BYTES) fail();
  let parsed;
  try { parsed = JSON.parse(text); } catch { fail(); }
  if (response.status < 200 || response.status > 299 || parsed === null || typeof parsed !== "object") {
    fail();
  }
  return parsed;
}

function payloadDigest(value) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function jsonObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail();
  return value;
}

function jsonArray(value, maximum = 32) {
  if (!Array.isArray(value) || value.length > maximum) fail();
  return value;
}

function projectedProviderResponse(action, value) {
  const source = jsonObject(value);
  if (action === "paypal_orders_create") {
    return {
      id: source.id,
      status: source.status,
      links: jsonArray(source.links).map((entry) => {
        const link = jsonObject(entry);
        return { rel: link.rel, href: link.href };
      }),
    };
  }
  if (action === "paypal_orders_query") {
    return { id: source.id, status: source.status };
  }
  if (action === "paypal_orders_capture") {
    if (source.status !== "COMPLETED") {
      return { id: source.id, status: source.status, purchase_units: [] };
    }
    return {
      id: source.id,
      status: source.status,
      purchase_units: jsonArray(source.purchase_units, 1).map((unitValue) => {
        const unit = jsonObject(unitValue);
        const payments = jsonObject(unit.payments);
        return {
          custom_id: unit.custom_id,
          payments: {
            captures: jsonArray(payments.captures, 1).map((captureValue) => {
              const capture = jsonObject(captureValue);
              const amount = jsonObject(capture.amount);
              return {
                id: capture.id,
                status: capture.status,
                amount: {
                  currency_code: amount.currency_code,
                  value: amount.value,
                },
              };
            }),
          },
        };
      }),
    };
  }
  if (action === "paypal_webhook_verify") {
    return { verification_status: source.verification_status };
  }
  fail();
}

export function createPayPalSandboxRuntime(options = {}) {
  const input = snapshot(options, [
    "credential", "fetchFn", "apiOrigin", "allowedActionOrigins", "routeMap", "nowFn",
  ]);
  const credential = normalizeCredential(input.credential);
  if (typeof input.fetchFn !== "function" || utilTypes.isProxy(input.fetchFn)) fail();
  if (typeof input.nowFn !== "function" || utilTypes.isProxy(input.nowFn)) fail();
  const apiOrigin = httpsUrl(input.apiOrigin, API_ORIGIN);
  const allowedActionOrigins = normalizeOrigins(input.allowedActionOrigins);
  const routes = normalizeRouteMap(input.routeMap);
  const handles = new WeakMap();

  const credentialLoader = Object.freeze({
    withCredential(binding, callback) {
      if (typeof callback !== "function" || utilTypes.isProxy(callback)) fail();
      if (
        binding === null || typeof binding !== "object"
        || binding.adapterKey !== "paypal_v1" || binding.contractVersion !== "v1"
      ) fail();
      const handle = Object.freeze({ kind: "paypal_sandbox_credential_handle" });
      handles.set(handle, credential);
      let result;
      try { result = callback(handle); } catch (error) {
        handles.delete(handle);
        throw error;
      }
      return Promise.resolve(result).finally(() => handles.delete(handle));
    },
  });

  async function accessToken(current) {
    const authorization = Buffer.from(
      `${current.clientId}:${current.clientSecret}`,
      "utf8",
    ).toString("base64");
    let response;
    try {
      response = await input.fetchFn(`${apiOrigin}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${authorization}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      });
    } catch { fail(); }
    const body = await jsonResponse(response);
    if (body.token_type !== "Bearer") fail();
    return secretText(body.access_token, 16_000);
  }

  async function providerRequest({ binding, credentialHandle, request }) {
    const current = handles.get(credentialHandle);
    if (!current || binding === null || typeof binding !== "object") fail();
    const action = request?.action;
    if (OPERATION_BY_ACTION[action] !== binding.operation) fail();
    const token = await accessToken(current);
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    let url;
    let method;
    let body;
    if (action === "paypal_orders_create") {
      const descriptor = snapshot(request, ["action", "requestId", "routeRefs", "body"]);
      const routeRefs = snapshot(descriptor.routeRefs, ["callbackRouteRef", "returnRouteRef"]);
      if (!routes.has(safeRef(routeRefs.callbackRouteRef))) fail();
      const returnUrl = routes.get(safeRef(routeRefs.returnRouteRef));
      if (!returnUrl) fail();
      headers["PayPal-Request-Id"] = safeRef(descriptor.requestId);
      url = `${apiOrigin}/v2/checkout/orders`;
      method = "POST";
      body = JSON.stringify({
        ...descriptor.body,
        application_context: { return_url: returnUrl, cancel_url: returnUrl },
      });
    } else if (action === "paypal_orders_query") {
      const descriptor = snapshot(request, ["action", "providerOrderRef"]);
      url = `${apiOrigin}/v2/checkout/orders/${encodeURIComponent(safeRef(descriptor.providerOrderRef))}`;
      method = "GET";
    } else if (action === "paypal_orders_capture") {
      const descriptor = snapshot(request, ["action", "providerOrderRef", "requestId", "body"]);
      headers["PayPal-Request-Id"] = safeRef(descriptor.requestId);
      url = `${apiOrigin}/v2/checkout/orders/${encodeURIComponent(safeRef(descriptor.providerOrderRef))}/capture`;
      method = "POST";
      body = JSON.stringify(descriptor.body);
    } else if (action === "paypal_webhook_verify") {
      const descriptor = snapshot(request, ["action", "transmission", "webhookEvent"]);
      const transmission = snapshot(descriptor.transmission, [
        "authAlgo", "certUrl", "transmissionId", "transmissionSig", "transmissionTime",
      ]);
      url = `${apiOrigin}/v1/notifications/verify-webhook-signature`;
      method = "POST";
      body = JSON.stringify({
        auth_algo: transmission.authAlgo,
        cert_url: transmission.certUrl,
        transmission_id: transmission.transmissionId,
        transmission_sig: transmission.transmissionSig,
        transmission_time: transmission.transmissionTime,
        webhook_id: current.webhookId,
        webhook_event: descriptor.webhookEvent,
      });
    } else fail();
    let response;
    try { response = await input.fetchFn(url, { method, headers, ...(body ? { body } : {}) }); }
    catch { fail(); }
    const safeBody = await jsonResponse(response);
    const evidence = action === "paypal_orders_capture" || action === "paypal_webhook_verify"
      ? Object.freeze({
          merchantScopeDigest: current.merchantScopeDigest,
          payloadDigest: payloadDigest(safeBody),
        })
      : null;
    return Object.freeze({
      response: projectedProviderResponse(action, safeBody),
      evidence,
    });
  }

  return Object.freeze({
    credentialLoader,
    transport: Object.freeze({ requestFn: providerRequest, allowedActionOrigins }),
  });
}
