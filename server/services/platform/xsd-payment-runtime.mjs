import { createHash, timingSafeEqual } from "node:crypto";
import { types as utilTypes } from "node:util";

import { formatPaymentAmountMinor, parsePaymentAmountMinor } from "./payment-money-codec.mjs";

const SAFE_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const DIGEST_RE = /^[a-f0-9]{64}$/u;
const MAX_JSON_BYTES = 1_048_576;
const MAX_JSON_CHUNKS = 4_096;
const FORM_CONTENT_TYPE = "application/x-www-form-urlencoded; charset=utf-8";
const CALLBACK_CONTENT_TYPES = Object.freeze([
  "application/x-www-form-urlencoded",
  FORM_CONTENT_TYPE,
]);
const XSD_API_ORIGIN = "https://www.xsd8866.com";
const XSD_ACTION_ORIGIN = XSD_API_ORIGIN;
const MAX_CALLBACK_BYTES = 16_384;
const MAX_CALLBACK_BASE64_CHARS = Math.ceil(MAX_CALLBACK_BYTES / 3) * 4;
const OPERATION_BY_ACTION = Object.freeze({
  xsd_payment_create: "create_recharge_order",
  xsd_payment_query: "query_payment",
  xsd_callback_verify: "verify_callback",
});
const CHANNELS = Object.freeze({ alipay: "1917", wechat_pay: "1923" });

function fail() { throw new Error("xsd_transport_failed"); }

function snapshot(value, fields) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) fail();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== fields.length || keys.some((key) => typeof key !== "string" || !fields.includes(key)) || fields.some((key) => !Object.hasOwn(descriptors, key))) fail();
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
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "" || parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "") fail();
  return parsed.origin;
}

function routeUrl(value) {
  let parsed;
  try { parsed = new URL(value); } catch { fail(); }
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "" || parsed.hash !== "") fail();
  return parsed.toString();
}

function formSignature(fields, merchantSecret) {
  const text = Object.keys(fields).filter((key) => key !== "sign" && key !== "format" && key !== "attach" && fields[key] !== "").sort().map((key) => `${key}=${fields[key]}`).join("&");
  return createHash("md5").update(`${text}${merchantSecret}`, "utf8").digest("hex");
}

function formBody(fields) {
  const ordered = Object.fromEntries([
    ...Object.keys(fields).filter((key) => key !== "sign").sort().map((key) => [key, fields[key]]),
    ["sign", fields.sign],
  ]);
  return new URLSearchParams(ordered).toString();
}

function constantTimeSignature(actual, expected) {
  if (typeof actual !== "string" || !/^[a-f0-9]{32}$/u.test(actual)) fail();
  const left = Buffer.from(actual, "utf8");
  const right = Buffer.from(expected, "utf8");
  if (left.length !== right.length || !timingSafeEqual(left, right)) fail();
}

function credential(value) {
  const input = snapshot(value, ["merchantId", "merchantSecret", "merchantScopeDigest"]);
  return Object.freeze({ merchantId: safeRef(input.merchantId), merchantSecret: secret(input.merchantSecret), merchantScopeDigest: digest(input.merchantScopeDigest) });
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

function xsdActionOrigins(value) {
  if (!Array.isArray(value) || utilTypes.isProxy(value) || value.length !== 1 || value[0] !== XSD_ACTION_ORIGIN) fail();
  return Object.freeze([XSD_ACTION_ORIGIN]);
}

function amountMinor(value) {
  try { return parsePaymentAmountMinor(value, 2); } catch { fail(); }
}

function formattedAmount(value) {
  if (!Number.isSafeInteger(value) || value <= 0 || Object.is(value, -0)) fail();
  try { return formatPaymentAmountMinor(value, 2); } catch { fail(); }
}

async function jsonResponse(response, requestUrl) {
  if (response === null || typeof response !== "object") fail();
  let body;
  try {
    if (!Number.isSafeInteger(response.status) || response.redirected !== false) fail();
    if (typeof response.url !== "string" || response.url.length < 1 || response.url !== requestUrl) fail();
    const declaredLength = response.headers?.get?.("content-length");
    if (declaredLength !== null && declaredLength !== undefined && (!/^(?:0|[1-9]\d*)$/u.test(declaredLength) || Number(declaredLength) > MAX_JSON_BYTES)) fail();
    if (response.status < 200 || response.status > 299) fail();
    body = response.body;
    if (body === null || typeof body?.getReader !== "function") fail();
  } catch { fail(); }
  let reader;
  try { reader = body.getReader(); } catch { fail(); }
  const bytes = Buffer.allocUnsafe(MAX_JSON_BYTES);
  let offset = 0;
  let chunks = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      chunks += 1;
      if (!(item.value instanceof Uint8Array) || item.value.byteLength < 1 || chunks > MAX_JSON_CHUNKS || item.value.byteLength > MAX_JSON_BYTES - offset) {
        try { await reader.cancel(); } catch {}
        fail();
      }
      bytes.set(item.value, offset);
      offset += item.value.byteLength;
    }
  } catch { fail(); }
  finally { try { reader.releaseLock(); } catch {} }
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, offset)); } catch { fail(); }
  try { return JSON.parse(text); } catch { fail(); }
}

function strictCallbackForm(callback) {
  const input = snapshot(callback, ["callbackRequestRef", "receivedAt", "bodyBase64", "headerEntries"]);
  if (typeof input.bodyBase64 !== "string" || input.bodyBase64.length < 4 || input.bodyBase64.length > MAX_CALLBACK_BASE64_CHARS || input.bodyBase64.length % 4 !== 0) fail();
  let body;
  try { body = Buffer.from(input.bodyBase64, "base64"); } catch { fail(); }
  if (body.length < 1 || body.length > MAX_CALLBACK_BYTES || body.toString("base64") !== input.bodyBase64 || /[\0\r\n]/u.test(body.toString("utf8"))) fail();
  if (!Array.isArray(input.headerEntries) || utilTypes.isProxy(input.headerEntries) || input.headerEntries.length !== 1) fail();
  const headerDescriptors = Object.getOwnPropertyDescriptors(input.headerEntries);
  if (Reflect.ownKeys(headerDescriptors).length !== 2 || !Object.hasOwn(headerDescriptors, "0") || !Object.hasOwn(headerDescriptors, "length") || !Object.hasOwn(headerDescriptors["0"], "value")) fail();
  const header = snapshot(headerDescriptors["0"].value, ["name", "value"]);
  if (header.name !== "content-type" || !CALLBACK_CONTENT_TYPES.includes(header.value)) fail();
  let entries;
  try { entries = [...new URLSearchParams(body.toString("utf8")).entries()]; } catch { fail(); }
  const expected = ["mch_order_no", "partnerorderid", "status", "mchId", "amount", "sign"];
  const allowed = [...expected, "attach"];
  if (entries.length < expected.length || entries.length > allowed.length || entries.some(([key]) => !allowed.includes(key)) || new Set(entries.map(([key]) => key)).size !== entries.length) fail();
  const fields = Object.fromEntries(entries);
  for (const key of expected) if (!Object.hasOwn(fields, key) || fields[key] === "") fail();
  return { fields, body: body.toString("utf8") };
}

function callbackProjection(callback, current) {
  const { fields, body } = strictCallbackForm(callback);
  if (safeRef(fields.mchId) !== current.merchantId) fail();
  safeRef(fields.mch_order_no);
  safeRef(fields.partnerorderid);
  if (!/^-?\d{1,2}$/u.test(fields.status)) fail();
  amountMinor(fields.amount);
  constantTimeSignature(fields.sign, formSignature(fields, current.merchantSecret));
  return { response: Object.freeze({ mch_order_no: fields.mch_order_no, partnerorderid: fields.partnerorderid, status: fields.status, mchId: fields.mchId, amount: fields.amount }), body };
}

function binding(value) {
  const input = snapshot(value, ["profileRef", "adapterKey", "contractVersion", "credentialProfileRef", "operation"]);
  if (input.adapterKey !== "xsd_v1" || input.contractVersion !== "v1" || !Object.values(OPERATION_BY_ACTION).includes(input.operation)) fail();
  return { ...input, profileRef: safeRef(input.profileRef), credentialProfileRef: safeRef(input.credentialProfileRef) };
}

function assertCredentialBinding(value, profileRef, credentialProfileRef) {
  const verified = binding(value);
  if (verified.profileRef !== profileRef || verified.credentialProfileRef !== credentialProfileRef) fail();
  return verified;
}

function createRequest(value, current, routes) {
  const request = snapshot(value, ["action", "createInput", "routeRefs"]);
  if (request.action !== "xsd_payment_create") fail();
  const input = snapshot(request.createInput, ["paymentOrderRef", "attemptRef", "providerRequestRef", "paymentMethod", "amountMinor", "currency", "currencyExponent", "expectedPaidCoins", "quoteDigest", "expiresAt", "callbackRouteRef", "returnRouteRef"]);
  const refs = snapshot(request.routeRefs, ["callbackRouteRef", "returnRouteRef"]);
  if (input.currency !== "CNY" || input.currencyExponent !== 2 || !Object.hasOwn(CHANNELS, input.paymentMethod) || input.callbackRouteRef !== refs.callbackRouteRef || input.returnRouteRef !== refs.returnRouteRef) fail();
  const notifyurl = routes.get(safeRef(refs.callbackRouteRef));
  const callbackurl = routes.get(safeRef(refs.returnRouteRef));
  if (!notifyurl || !callbackurl) fail();
  const fields = { mch_order_no: safeRef(input.paymentOrderRef), amount: formattedAmount(input.amountMinor), notifyurl, callbackurl, mchId: current.merchantId, channel: CHANNELS[input.paymentMethod], format: "json" };
  return { fields: { ...fields, sign: formSignature(fields, current.merchantSecret) }, paymentOrderRef: fields.mch_order_no };
}

function queryRequest(value, current) {
  const request = snapshot(value, ["action", "paymentOrderRef"]);
  if (request.action !== "xsd_payment_query") fail();
  const fields = { mch_order_no: safeRef(request.paymentOrderRef), mchId: current.merchantId };
  return { fields: { ...fields, sign: formSignature(fields, current.merchantSecret) }, paymentOrderRef: fields.mch_order_no };
}

function projectCreateResponse(value) {
  const response = snapshot(value, ["code", "error", "datas"]);
  if (response.code !== "200" || typeof response.error !== "string" || response.error.length < 1 || response.error.length > 4096 || /[\0\r\n]/u.test(response.error)) fail();
  const datas = snapshot(response.datas, ["code_url"]);
  if (typeof datas.code_url !== "string" || datas.code_url.length < 1 || datas.code_url.length > 2048) fail();
  return Object.freeze({ url: datas.code_url });
}

function projectQueryResponse(value, current, expectedOrderRef) {
  const envelope = snapshot(value, ["code", "error", "datas"]);
  if (envelope.code !== "200" || typeof envelope.error !== "string" || envelope.error.length < 1 || envelope.error.length > 4096 || /[\0\r\n]/u.test(envelope.error)) fail();
  const datas = snapshot(envelope.datas, ["mch_order_no", "partnerorderid", "amount", "status", "sign"]);
  if (safeRef(datas.mch_order_no) !== expectedOrderRef || !/^-?\d{1,2}$/u.test(datas.status)) fail();
  safeRef(datas.partnerorderid);
  amountMinor(datas.amount);
  constantTimeSignature(datas.sign, formSignature(datas, current.merchantSecret));
  return Object.freeze({ mch_order_no: datas.mch_order_no, status: datas.status });
}

export function createXsdPaymentRuntime(value = {}) {
  const input = snapshot(value, ["credential", "fetchFn", "apiOrigin", "allowedActionOrigins", "routeMap", "profileRef", "credentialProfileRef", "nowFn"]);
  const apiOrigin = origin(input.apiOrigin);
  if (apiOrigin !== XSD_API_ORIGIN || input.apiOrigin !== XSD_API_ORIGIN) fail();
  const currentCredential = credential(input.credential);
  const profileRef = safeRef(input.profileRef);
  const credentialProfileRef = safeRef(input.credentialProfileRef);
  if (typeof input.fetchFn !== "function" || utilTypes.isProxy(input.fetchFn) || typeof input.nowFn !== "function" || utilTypes.isProxy(input.nowFn)) fail();
  const actionOrigins = xsdActionOrigins(input.allowedActionOrigins);
  const routes = routeMap(input.routeMap);
  const handles = new WeakMap();
  const credentialLoader = Object.freeze({
    withCredential(rawBinding, callback) {
      assertCredentialBinding(rawBinding, profileRef, credentialProfileRef);
      if (typeof callback !== "function" || utilTypes.isProxy(callback)) fail();
      const handle = Object.freeze({ kind: "xsd_payment_credential_handle" });
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
    if (action === "xsd_callback_verify") {
      const request = snapshot(rawRequest, ["action", "callbackInput"]);
      const verified = callbackProjection(request.callbackInput, current);
      return Object.freeze({ response: verified.response, evidence: Object.freeze({ merchantScopeDigest: current.merchantScopeDigest, payloadDigest: createHash("sha256").update(verified.body, "utf8").digest("hex") }) });
    }
    const compiled = action === "xsd_payment_create" ? createRequest(rawRequest, current, routes) : queryRequest(rawRequest, current);
    const path = action === "xsd_payment_create" ? "/api/gaia/unifiedorder" : "/api/gaia/query";
    let response;
    const requestUrl = `${apiOrigin}${path}`;
    try { response = await input.fetchFn(requestUrl, { method: "POST", headers: { "Content-Type": FORM_CONTENT_TYPE }, body: formBody(compiled.fields), redirect: "error" }); } catch { fail(); }
    const body = await jsonResponse(response, requestUrl);
    const projected = action === "xsd_payment_create" ? projectCreateResponse(body) : projectQueryResponse(body, current, compiled.paymentOrderRef);
    return Object.freeze({ response: projected, evidence: null });
  }
  return Object.freeze({ credentialLoader, transport: Object.freeze({ requestFn, allowedActionOrigins: actionOrigins }) });
}
