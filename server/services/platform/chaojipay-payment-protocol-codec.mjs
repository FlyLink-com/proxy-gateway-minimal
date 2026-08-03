import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";

import { parsePaymentAmountMinor } from "./payment-money-codec.mjs";

const SAFE_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const DIGEST_RE = /^[a-f0-9]{64}$/u;
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const MAX_CALLBACK_BASE64_CHARS = 16_384;
const MAX_CALLBACK_BYTES = 16_384;
const CALLBACK_TYPES = new Set([
  "application/form", "application/form; charset=utf-8",
  "application/x-www-form-urlencoded", "application/x-www-form-urlencoded; charset=utf-8",
]);

function fail() { throw new TypeError("invalid_chaojipay_payment_protocol"); }

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

function canonicalTime(value) {
  if (typeof value !== "string" || !TIMESTAMP_RE.test(value)) fail();
  try { if (new Date(value).toISOString() !== value) fail(); } catch { fail(); }
  return value;
}

function digest(value) {
  if (typeof value !== "string" || !DIGEST_RE.test(value)) fail();
  return value;
}

function positiveMinor(value) {
  if (!Number.isSafeInteger(value) || value <= 0 || Object.is(value, -0)) fail();
  return value;
}

function callbackHeaders(value) {
  if (!Array.isArray(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length !== 1) fail();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== 2 || !Object.hasOwn(descriptors, "0") || !Object.hasOwn(descriptors, "length")) fail();
  const entry = snapshot(descriptors["0"].value, ["name", "value"]);
  if (entry.name !== "content-type" || !CALLBACK_TYPES.has(entry.value)) fail();
  return [entry];
}

function callbackInput(value) {
  const input = snapshot(value, ["callbackRequestRef", "receivedAt", "bodyBase64", "headerEntries"]);
  if (typeof input.bodyBase64 !== "string" || input.bodyBase64.length < 4 || input.bodyBase64.length > MAX_CALLBACK_BASE64_CHARS || input.bodyBase64.length % 4 !== 0) fail();
  let body;
  try { body = Buffer.from(input.bodyBase64, "base64"); } catch { fail(); }
  if (body.length < 1 || body.length > MAX_CALLBACK_BYTES || body.toString("base64") !== input.bodyBase64 || /[\0\r\n]/u.test(body.toString("utf8"))) fail();
  return { callbackRequestRef: safeRef(input.callbackRequestRef), receivedAt: canonicalTime(input.receivedAt), bodyBase64: input.bodyBase64, headerEntries: callbackHeaders(input.headerEntries) };
}

function createInput(value) {
  const input = snapshot(value, [
    "paymentOrderRef", "attemptRef", "providerRequestRef", "paymentMethod", "amountMinor",
    "currency", "currencyExponent", "expectedPaidCoins", "quoteDigest", "expiresAt",
    "callbackRouteRef", "returnRouteRef",
  ]);
  if (input.paymentMethod !== "wechat_pay" || input.currency !== "CNY" || input.currencyExponent !== 2) fail();
  return {
    paymentOrderRef: safeRef(input.paymentOrderRef), attemptRef: safeRef(input.attemptRef), providerRequestRef: safeRef(input.providerRequestRef), paymentMethod: input.paymentMethod,
    amountMinor: positiveMinor(input.amountMinor), currency: input.currency, currencyExponent: input.currencyExponent,
    expectedPaidCoins: positiveMinor(input.expectedPaidCoins), quoteDigest: digest(input.quoteDigest), expiresAt: canonicalTime(input.expiresAt),
    callbackRouteRef: safeRef(input.callbackRouteRef), returnRouteRef: safeRef(input.returnRouteRef),
  };
}

function httpsUrl(value) {
  let parsed;
  try { parsed = new URL(value); } catch { fail(); }
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "" || parsed.hash !== "") fail();
  return parsed.toString();
}

function amount(value) {
  try { return parsePaymentAmountMinor(value, 2); } catch { fail(); }
}

function eventKey(merchantScopeDigest, providerCaptureRef) {
  return `chaojipay_${createHash("sha256").update(`${merchantScopeDigest}\0${providerCaptureRef}`, "utf8").digest("hex")}`;
}

function freeze(value) {
  for (const child of Object.values(value)) if (child !== null && typeof child === "object" && !Object.isFrozen(child)) freeze(child);
  return Object.freeze(value);
}

export function encodeChaoJiPayCreateRequest(value) {
  const input = createInput(value);
  return freeze({ action: "chaojipay_payment_create", createInput: input, routeRefs: { callbackRouteRef: input.callbackRouteRef } });
}

export function encodeChaoJiPayCallbackVerificationRequest(value) {
  return freeze({ action: "chaojipay_callback_verify", callbackInput: callbackInput(value) });
}

export function decodeChaoJiPayCreateResponse(value) {
  const envelope = snapshot(value, ["createInput", "providerResponse", "receivedAt"]);
  const input = createInput(envelope.createInput);
  const response = snapshot(envelope.providerResponse, ["data"]);
  const data = snapshot(response.data, ["payUrl"]);
  return freeze({ providerOrderRef: input.paymentOrderRef, status: "entry_ready", chargeCertainty: "possibly_charged", nextAction: { type: "redirect", url: httpsUrl(data.payUrl), expiresAt: input.expiresAt }, occurredAt: canonicalTime(envelope.receivedAt) });
}

export function decodeVerifiedChaoJiPayCallback(value) {
  const envelope = snapshot(value, ["callbackInput", "providerResponse", "merchantScopeDigest", "payloadDigest"]);
  const input = callbackInput(envelope.callbackInput);
  const response = snapshot(envelope.providerResponse, ["orderId", "orderStatus", "outTradeId", "amount"]);
  const providerCaptureRef = safeRef(response.orderId);
  const paymentOrderRef = safeRef(response.outTradeId);
  const merchantScopeDigest = digest(envelope.merchantScopeDigest);
  const payloadDigest = digest(envelope.payloadDigest);
  const amountMinor = amount(response.amount);
  if (response.orderStatus === "0" || response.orderStatus === "2" || response.orderStatus === "3") return null;
  if (response.orderStatus !== "1") fail();
  return freeze({
    sourceType: "callback", providerEventRef: providerCaptureRef, eventDedupeKey: eventKey(merchantScopeDigest, providerCaptureRef), eventType: "payment_succeeded",
    paymentOrderRef, providerOrderRef: paymentOrderRef, providerCaptureRef, providerRefundRef: null,
    amountMinor, currency: "CNY", currencyExponent: 2, merchantScopeDigest, payloadDigest,
    occurredAt: input.receivedAt, verificationResult: "verified",
  });
}
