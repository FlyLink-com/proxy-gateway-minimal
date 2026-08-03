import { createHash, timingSafeEqual } from "node:crypto";
import { types as utilTypes } from "node:util";

import {
  formatPaymentAmountMinor,
  parsePaymentAmountMinor,
} from "./payment-money-codec.mjs";

const SAFE_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const DIGEST_RE = /^[a-f0-9]{64}$/u;
const MAX_JSON_BYTES = 1_048_576;
const MAX_CALLBACK_BASE64_CHARS = 16_384;
const MAX_CALLBACK_BYTES = 16_384;
const CALLBACK_TYPES = new Set([
  "application/form",
  "application/form; charset=utf-8",
  "application/x-www-form-urlencoded",
  "application/x-www-form-urlencoded; charset=utf-8",
]);
const OPERATION_BY_ACTION = Object.freeze({
  chaojipay_payment_create: "create_recharge_order",
  chaojipay_callback_verify: "verify_callback",
});
const NON_GLOBAL_IPV4_CIDRS = Object.freeze([
  [0x00000000, 8], [0x0a000000, 8], [0x64400000, 10], [0x7f000000, 8],
  [0xa9fe0000, 16], [0xac100000, 12], [0xc0000000, 24], [0xc0000200, 24],
  [0xc0586300, 24], [0xc0a80000, 16], [0xc6120000, 15], [0xc6336400, 24],
  [0xcb007100, 24], [0xe0000000, 4], [0xf0000000, 4],
]);

function fail() { throw new Error("chaojipay_transport_failed"); }

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
    || fields.some((key) => !Object.hasOwn(descriptors, key))
  ) fail();
  const result = {};
  for (const key of fields) {
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) fail();
    result[key] = descriptor.value;
  }
  return result;
}

function safeRef(value) {
  if (typeof value !== "string" || !SAFE_REF_RE.test(value)) fail();
  return value;
}

function secret(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 4096 || /[\0\r\n]/u.test(value)) fail();
  return value;
}

function digest(value) {
  if (typeof value !== "string" || !DIGEST_RE.test(value)) fail();
  return value;
}

function origin(value) {
  let parsed;
  try { parsed = new URL(value); } catch { fail(); }
  if (
    parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== ""
    || parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== ""
  ) fail();
  return parsed.origin;
}

function routeUrl(value) {
  let parsed;
  try { parsed = new URL(value); } catch { fail(); }
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "" || parsed.hash !== "") fail();
  return parsed.toString();
}

function publicIpv4(value) {
  if (
    typeof value !== "string"
    || !/^(?:0|[1-9]\d{0,2})\.(?:0|[1-9]\d{0,2})\.(?:0|[1-9]\d{0,2})\.(?:0|[1-9]\d{0,2})$/u.test(value)
  ) fail();
  const parts = value.split(".").map(Number);
  if (parts.some((part) => part > 255)) fail();
  const address = (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
  if (NON_GLOBAL_IPV4_CIDRS.some(([network, prefix]) => (address >>> (32 - prefix)) === (network >>> (32 - prefix)))) fail();
  return value;
}

function credential(value) {
  const input = snapshot(value, ["merchantId", "merchantSecret", "merchantScopeDigest"]);
  return Object.freeze({
    merchantId: safeRef(input.merchantId),
    merchantSecret: secret(input.merchantSecret),
    merchantScopeDigest: digest(input.merchantScopeDigest),
  });
}

function allowedOrigins(value) {
  if (!Array.isArray(value) || utilTypes.isProxy(value) || value.length < 1 || value.length > 8) fail();
  return Object.freeze(value.map(origin));
}

function routeMap(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) fail();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length < 1 || keys.length > 32 || keys.some((key) => typeof key !== "string")) fail();
  const routes = new Map();
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) fail();
    routes.set(safeRef(key), routeUrl(descriptor.value));
  }
  return routes;
}

function sign(fields, merchantSecret) {
  const canonical = Object.keys(fields)
    .filter((key) => key !== "sign" && fields[key] !== "")
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("&");
  return createHash("md5").update(`${canonical}&key=${merchantSecret}`, "utf8").digest("hex").toUpperCase();
}

function constantTimeSignature(actual, expected) {
  if (typeof actual !== "string" || !/^[A-F0-9]{32}$/u.test(actual)) fail();
  const left = Buffer.from(actual, "utf8");
  const right = Buffer.from(expected, "utf8");
  if (left.length !== right.length || !timingSafeEqual(left, right)) fail();
}

function binding(value) {
  const input = snapshot(value, ["profileRef", "adapterKey", "contractVersion", "credentialProfileRef", "operation"]);
  if (input.adapterKey !== "chaojipay_v1" || input.contractVersion !== "v1" || !Object.values(OPERATION_BY_ACTION).includes(input.operation)) fail();
  return { ...input, profileRef: safeRef(input.profileRef), credentialProfileRef: safeRef(input.credentialProfileRef) };
}

function assertCredentialBinding(value, profileRef, credentialProfileRef) {
  const verified = binding(value);
  if (verified.profileRef !== profileRef || verified.credentialProfileRef !== credentialProfileRef) fail();
  return verified;
}

function createRequest(value, current, routes, createRequestIp) {
  const request = snapshot(value, ["action", "createInput", "routeRefs"]);
  if (request.action !== "chaojipay_payment_create") fail();
  const input = snapshot(request.createInput, [
    "paymentOrderRef", "attemptRef", "providerRequestRef", "paymentMethod", "amountMinor",
    "currency", "currencyExponent", "expectedPaidCoins", "quoteDigest", "expiresAt",
    "callbackRouteRef", "returnRouteRef",
  ]);
  const refs = snapshot(request.routeRefs, ["callbackRouteRef"]);
  if (input.paymentMethod !== "wechat_pay" || input.currency !== "CNY" || input.currencyExponent !== 2 || input.callbackRouteRef !== refs.callbackRouteRef) fail();
  let amount;
  try { amount = formatPaymentAmountMinor(input.amountMinor, 2); } catch { fail(); }
  const notifyUrl = routes.get(safeRef(refs.callbackRouteRef));
  if (!notifyUrl) fail();
  const fields = {
    outTradeId: safeRef(input.paymentOrderRef), amount, productCode: "726",
    merchantId: current.merchantId, ip: createRequestIp, notifyUrl,
  };
  return { ...fields, sign: sign(fields, current.merchantSecret) };
}

async function responseText(response, requestUrl) {
  if (response === null || typeof response !== "object" || !Number.isSafeInteger(response.status) || response.body === null || typeof response.body?.getReader !== "function") fail();
  try {
    if (response.redirected !== undefined && response.redirected !== false) fail();
    if (typeof response.url !== "string" || response.url !== requestUrl) fail();
    const declaredLength = response.headers?.get?.("content-length");
    if (declaredLength !== null && declaredLength !== undefined && (!/^(?:0|[1-9]\d*)$/u.test(declaredLength) || Number(declaredLength) > MAX_JSON_BYTES)) fail();
  } catch { fail(); }
  if (response.status < 200 || response.status > 299) fail();
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      if (!(item.value instanceof Uint8Array)) fail();
      bytes += item.value.byteLength;
      if (bytes > MAX_JSON_BYTES) {
        await reader.cancel();
        fail();
      }
      chunks.push(item.value);
    }
  } catch { fail(); }
  finally { try { reader.releaseLock(); } catch {} }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)); } catch { fail(); }
}

async function jsonResponse(response, requestUrl) {
  const text = await responseText(response, requestUrl);
  try { return JSON.parse(text); } catch { fail(); }
}

function createResponse(value) {
  const response = snapshot(value, ["data"]);
  const data = snapshot(response.data, ["payUrl"]);
  if (typeof data.payUrl !== "string" || data.payUrl.length < 1 || data.payUrl.length > 2048) fail();
  return Object.freeze({ data: Object.freeze({ payUrl: data.payUrl }) });
}

function callbackProjection(value, current) {
  const input = snapshot(value, ["callbackRequestRef", "receivedAt", "bodyBase64", "headerEntries"]);
  if (typeof input.bodyBase64 !== "string" || input.bodyBase64.length < 4 || input.bodyBase64.length > MAX_CALLBACK_BASE64_CHARS || input.bodyBase64.length % 4 !== 0) fail();
  let body;
  try { body = Buffer.from(input.bodyBase64, "base64"); } catch { fail(); }
  if (body.length < 1 || body.length > MAX_CALLBACK_BYTES || body.toString("base64") !== input.bodyBase64 || /[\0\r\n]/u.test(body.toString("utf8"))) fail();
  if (!Array.isArray(input.headerEntries) || utilTypes.isProxy(input.headerEntries) || input.headerEntries.length !== 1) fail();
  const headerDescriptors = Object.getOwnPropertyDescriptors(input.headerEntries);
  if (Reflect.ownKeys(headerDescriptors).length !== 2 || !Object.hasOwn(headerDescriptors, "0") || !Object.hasOwn(headerDescriptors, "length") || !Object.hasOwn(headerDescriptors["0"], "value")) fail();
  const header = snapshot(headerDescriptors["0"].value, ["name", "value"]);
  if (header.name !== "content-type" || !CALLBACK_TYPES.has(header.value)) fail();
  let entries;
  try { entries = [...new URLSearchParams(body.toString("utf8")).entries()]; } catch { fail(); }
  const expected = ["orderId", "orderStatus", "outTradeId", "amount", "sign"];
  if (entries.length !== expected.length || entries.some(([key]) => !expected.includes(key)) || new Set(entries.map(([key]) => key)).size !== expected.length) fail();
  const fields = Object.fromEntries(entries);
  for (const key of expected) if (!Object.hasOwn(fields, key) || fields[key] === "") fail();
  safeRef(fields.orderId); safeRef(fields.outTradeId);
  if (!/^[0123]$/u.test(fields.orderStatus)) fail();
  try { parsePaymentAmountMinor(fields.amount, 2); } catch { fail(); }
  constantTimeSignature(fields.sign, sign(fields, current.merchantSecret));
  return {
    response: Object.freeze({ orderId: fields.orderId, orderStatus: fields.orderStatus, outTradeId: fields.outTradeId, amount: fields.amount }),
    body: body.toString("utf8"),
  };
}

export function createChaoJiPayPaymentRuntime(value = {}) {
  const input = snapshot(value, ["credential", "fetchFn", "apiOrigin", "allowedActionOrigins", "routeMap", "profileRef", "credentialProfileRef", "createRequestIp", "nowFn"]);
  const currentCredential = credential(input.credential);
  const profileRef = safeRef(input.profileRef);
  const credentialProfileRef = safeRef(input.credentialProfileRef);
  if (typeof input.fetchFn !== "function" || utilTypes.isProxy(input.fetchFn) || typeof input.nowFn !== "function" || utilTypes.isProxy(input.nowFn)) fail();
  const apiOrigin = origin(input.apiOrigin);
  const actionOrigins = allowedOrigins(input.allowedActionOrigins);
  const routes = routeMap(input.routeMap);
  const createRequestIp = publicIpv4(input.createRequestIp);
  const handles = new WeakMap();
  const credentialLoader = Object.freeze({
    withCredential(rawBinding, callback) {
      assertCredentialBinding(rawBinding, profileRef, credentialProfileRef);
      if (typeof callback !== "function" || utilTypes.isProxy(callback)) fail();
      const handle = Object.freeze({ kind: "chaojipay_payment_credential_handle" });
      handles.set(handle, currentCredential);
      let result;
      try { result = callback(handle); } catch (error) { handles.delete(handle); throw error; }
      return Promise.resolve(result).finally(() => handles.delete(handle));
    },
  });
  async function requestFn({ binding: rawBinding, credentialHandle, request: rawRequest }) {
    const verifiedBinding = assertCredentialBinding(rawBinding, profileRef, credentialProfileRef);
    const current = handles.get(credentialHandle);
    if (!current || rawRequest === null || typeof rawRequest !== "object" || utilTypes.isProxy(rawRequest)) fail();
    const action = rawRequest.action;
    if (OPERATION_BY_ACTION[action] !== verifiedBinding.operation) fail();
    if (action === "chaojipay_callback_verify") {
      const request = snapshot(rawRequest, ["action", "callbackInput"]);
      const verified = callbackProjection(request.callbackInput, current);
      return Object.freeze({ response: verified.response, evidence: Object.freeze({ merchantScopeDigest: current.merchantScopeDigest, payloadDigest: createHash("sha256").update(verified.body, "utf8").digest("hex") }) });
    }
    const fields = createRequest(rawRequest, current, routes, createRequestIp);
    const requestUrl = `${apiOrigin}/api/order/create`;
    let response;
    try { response = await input.fetchFn(requestUrl, { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify(fields), redirect: "error" }); } catch { fail(); }
    return Object.freeze({ response: createResponse(await jsonResponse(response, requestUrl)), evidence: null });
  }
  return Object.freeze({ credentialLoader, transport: Object.freeze({ requestFn, allowedActionOrigins: actionOrigins }) });
}
