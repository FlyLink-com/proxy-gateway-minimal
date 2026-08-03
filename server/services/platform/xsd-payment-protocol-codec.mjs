import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";

import { parsePaymentAmountMinor } from "./payment-money-codec.mjs";

const SAFE_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const DIGEST_RE = /^[a-f0-9]{64}$/u;
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const FORM_CONTENT_TYPE = "application/x-www-form-urlencoded; charset=utf-8";

function fail() { throw new TypeError("invalid_xsd_payment_protocol"); }

function snapshot(value, fields) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) fail();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== fields.length || keys.some((key) => typeof key !== "string" || !fields.includes(key))
    || fields.some((key) => !Object.hasOwn(descriptors, key))) fail();
  const result = {};
  for (const key of fields) {
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) fail();
    result[key] = descriptor.value;
  }
  return result;
}

function safeRef(value, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !SAFE_REF_RE.test(value)) fail();
  return value;
}

function canonicalTime(value) {
  if (typeof value !== "string" || !TIMESTAMP_RE.test(value)) fail();
  try { if (new Date(value).toISOString() !== value) fail(); } catch { fail(); }
  return value;
}

function digest(value) {
  if (typeof value !== "string" || !DIGEST_RE.test(value)) fail();
  return value;
}

function cny(value, exponent) {
  if (value !== "CNY" || exponent !== 2) fail();
  return { currency: value, currencyExponent: exponent };
}

function positiveMinor(value) {
  if (!Number.isSafeInteger(value) || value <= 0 || Object.is(value, -0)) fail();
  return value;
}

function callbackHeaders(value) {
  if (!Array.isArray(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length !== 1) fail();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== 2 || !Object.hasOwn(descriptors, "0") || !Object.hasOwn(descriptors, "length")) fail();
  const index = descriptors["0"];
  if (!index.enumerable || !Object.hasOwn(index, "value")) fail();
  const entry = snapshot(index.value, ["name", "value"]);
  if (entry.name !== "content-type" || entry.value !== FORM_CONTENT_TYPE) fail();
  return [{ name: entry.name, value: entry.value }];
}

function freeze(value) {
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === "object" && !Object.isFrozen(child)) freeze(child);
  }
  return Object.freeze(value);
}

function createInput(value) {
  const input = snapshot(value, [
    "paymentOrderRef", "attemptRef", "providerRequestRef", "paymentMethod", "amountMinor",
    "currency", "currencyExponent", "expectedPaidCoins", "quoteDigest", "expiresAt",
    "callbackRouteRef", "returnRouteRef",
  ]);
  if (input.paymentMethod !== "alipay" && input.paymentMethod !== "wechat_pay") fail();
  cny(input.currency, input.currencyExponent);
  return {
    paymentOrderRef: safeRef(input.paymentOrderRef), attemptRef: safeRef(input.attemptRef),
    providerRequestRef: safeRef(input.providerRequestRef), paymentMethod: input.paymentMethod,
    amountMinor: positiveMinor(input.amountMinor), currency: input.currency,
    currencyExponent: input.currencyExponent, expectedPaidCoins: positiveMinor(input.expectedPaidCoins),
    quoteDigest: digest(input.quoteDigest), expiresAt: canonicalTime(input.expiresAt),
    callbackRouteRef: safeRef(input.callbackRouteRef), returnRouteRef: safeRef(input.returnRouteRef),
  };
}

function queryInput(value) {
  const input = snapshot(value, ["paymentOrderRef", "attemptRef", "providerOrderRef"]);
  const paymentOrderRef = safeRef(input.paymentOrderRef);
  if (safeRef(input.providerOrderRef) !== paymentOrderRef) fail();
  return { paymentOrderRef, attemptRef: safeRef(input.attemptRef), providerOrderRef: paymentOrderRef };
}

function callbackInput(value) {
  const input = snapshot(value, ["callbackRequestRef", "receivedAt", "bodyBase64", "headerEntries"]);
  if (typeof input.bodyBase64 !== "string" || input.bodyBase64.length < 4 || input.bodyBase64.length % 4 !== 0) fail();
  let body;
  try { body = Buffer.from(input.bodyBase64, "base64"); } catch { fail(); }
  if (body.length < 1 || body.length > 16_384 || body.toString("base64") !== input.bodyBase64 || /[\0\r\n]/u.test(body.toString("utf8"))) fail();
  return {
    callbackRequestRef: safeRef(input.callbackRequestRef), receivedAt: canonicalTime(input.receivedAt),
    bodyBase64: input.bodyBase64, headerEntries: callbackHeaders(input.headerEntries),
  };
}

function numericStatus(value) {
  if (typeof value !== "string" || !/^-?\d{1,2}$/u.test(value)) fail();
  return value;
}

function amount(value) {
  try { return parsePaymentAmountMinor(value, 2); } catch { fail(); }
}

function eventKey(callbackRequestRef, providerOrderRef) {
  return `xsd_${createHash("sha256").update(`${callbackRequestRef}\0${providerOrderRef}`, "utf8").digest("hex")}`;
}

export function encodeXsdCreateRequest(value) {
  const input = createInput(value);
  return freeze({
    action: "xsd_payment_create", createInput: input,
    routeRefs: { callbackRouteRef: input.callbackRouteRef, returnRouteRef: input.returnRouteRef },
  });
}

export function encodeXsdQueryRequest(value) {
  return freeze({ action: "xsd_payment_query", paymentOrderRef: queryInput(value).paymentOrderRef });
}

export function encodeXsdCallbackVerificationRequest(value) {
  return freeze({ action: "xsd_callback_verify", callbackInput: callbackInput(value) });
}

export function decodeXsdCreateResponse(value) {
  const envelope = snapshot(value, ["createInput", "providerResponse", "receivedAt"]);
  const input = createInput(envelope.createInput);
  const response = snapshot(envelope.providerResponse, ["url"]);
  if (typeof response.url !== "string" || response.url.length < 1 || response.url.length > 2048) fail();
  return freeze({
    providerOrderRef: input.paymentOrderRef, status: "entry_ready", chargeCertainty: "possibly_charged",
    nextAction: { type: "redirect", url: response.url, expiresAt: input.expiresAt },
    occurredAt: canonicalTime(envelope.receivedAt),
  });
}

export function decodeXsdQueryResponse(value) {
  const envelope = snapshot(value, ["queryInput", "providerResponse", "receivedAt"]);
  const input = queryInput(envelope.queryInput);
  const response = snapshot(envelope.providerResponse, ["mch_order_no", "status"]);
  if (safeRef(response.mch_order_no) !== input.paymentOrderRef) fail();
  const status = numericStatus(response.status);
  const mapped = status === "3" ? ["succeeded", "confirmed_charged"]
    : status === "00" ? ["pending", "possibly_charged"] : ["reconciliation_required", "unknown"];
  return freeze({ providerOrderRef: input.paymentOrderRef, status: mapped[0], chargeCertainty: mapped[1], nextAction: null, occurredAt: canonicalTime(envelope.receivedAt) });
}

export function decodeVerifiedXsdCallback(value) {
  const envelope = snapshot(value, ["callbackInput", "providerResponse", "merchantScopeDigest", "payloadDigest"]);
  const input = callbackInput(envelope.callbackInput);
  const response = snapshot(envelope.providerResponse, ["mch_order_no", "partnerorderid", "status", "mchId", "amount"]);
  const paymentOrderRef = safeRef(response.mch_order_no);
  const providerOrderRef = safeRef(response.partnerorderid);
  const status = numericStatus(response.status);
  safeRef(response.mchId);
  const amountMinor = amount(response.amount);
  const merchantScopeDigest = digest(envelope.merchantScopeDigest);
  const payloadDigest = digest(envelope.payloadDigest);
  if (status === "-1") return null;
  if (status !== "1") fail();
  return freeze({
    sourceType: "callback", providerEventRef: providerOrderRef,
    eventDedupeKey: eventKey(input.callbackRequestRef, providerOrderRef), eventType: "payment_succeeded",
    paymentOrderRef, providerOrderRef, providerCaptureRef: providerOrderRef, providerRefundRef: null,
    amountMinor, currency: "CNY", currencyExponent: 2, merchantScopeDigest, payloadDigest,
    occurredAt: input.receivedAt, verificationResult: "verified",
  });
}
