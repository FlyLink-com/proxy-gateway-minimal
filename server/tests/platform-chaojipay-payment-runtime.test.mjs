import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createChaoJiPayPaymentRuntime } from "../services/platform/chaojipay-payment-runtime.mjs";

const API_ORIGIN = "https://payment.chaojipay.example.test";
const SECRET = "synthetic-chaojipay-secret";
const REQUEST_IP = "198.51.100.10";
const MERCHANT_DIGEST = "a".repeat(64);
const CREATE_INPUT = Object.freeze({
  paymentOrderRef: "payment_order_1", attemptRef: "attempt_1", providerRequestRef: "provider_request_1",
  paymentMethod: "wechat_pay", amountMinor: 1200, currency: "CNY", currencyExponent: 2,
  expectedPaidCoins: 30, quoteDigest: "c".repeat(64), expiresAt: "2026-08-02T00:10:00.000Z",
  callbackRouteRef: "portal_payment_callback_v1", returnRouteRef: "portal_wallet_return_v1",
});

function signature(fields) {
  const canonical = Object.keys(fields).filter((key) => key !== "sign" && fields[key] !== "").sort().map((key) => `${key}=${fields[key]}`).join("&");
  return createHash("md5").update(`${canonical}&key=${SECRET}`, "utf8").digest("hex").toUpperCase();
}

function response(status, body, extras = {}) {
  return Object.freeze({ status, ...extras, async text() { return typeof body === "string" ? body : JSON.stringify(body); } });
}

function runtime(fetchFn, options = {}) {
  return createChaoJiPayPaymentRuntime({
    credential: { merchantId: "merchant_demo", merchantSecret: SECRET, merchantScopeDigest: MERCHANT_DIGEST },
    fetchFn, apiOrigin: API_ORIGIN, allowedActionOrigins: ["https://checkout.example.test"],
    routeMap: { portal_payment_callback_v1: "https://portal.example.test/api/payment/chaojipay/callback" },
    createRequestIp: REQUEST_IP, nowFn: () => "2026-08-02T00:00:00.000Z", ...options,
  });
}

async function request(value, operation, body) {
  const binding = Object.freeze({ profileRef: "chaojipay_profile", adapterKey: "chaojipay_v1", contractVersion: "v1", credentialProfileRef: "chaojipay_credential", operation });
  return value.credentialLoader.withCredential(binding, (credentialHandle) => value.transport.requestFn({ binding, credentialHandle, request: body }));
}

test("ChaoJiPay runtime sends the exact signed JSON create body with the injected public IP", async () => {
  const calls = [];
  const value = runtime(async (url, init) => {
    calls.push({ url, init });
    return response(200, { data: { payUrl: "https://checkout.example.test/pay/1" } }, { redirected: false, url });
  });
  const result = await request(value, "create_recharge_order", {
    action: "chaojipay_payment_create", createInput: CREATE_INPUT,
    routeRefs: { callbackRouteRef: "portal_payment_callback_v1" },
  });
  const fields = { outTradeId: "payment_order_1", amount: "12.00", productCode: "726", merchantId: "merchant_demo", ip: REQUEST_IP, notifyUrl: "https://portal.example.test/api/payment/chaojipay/callback" };
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${API_ORIGIN}/api/order/create`);
  assert.deepEqual(calls[0].init, { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify({ ...fields, sign: signature(fields) }), redirect: "error" });
  assert.deepEqual(result, { response: { data: { payUrl: "https://checkout.example.test/pay/1" } }, evidence: null });
});

test("ChaoJiPay runtime verifies signed conventional or documented callback forms without a network call", async () => {
  const value = runtime(async () => { throw new Error("callback must not fetch"); });
  const fields = { orderId: "provider_capture_1", orderStatus: "1", outTradeId: "payment_order_1", amount: "12.00" };
  for (const contentType of ["application/form", "application/form; charset=utf-8", "application/x-www-form-urlencoded", "application/x-www-form-urlencoded; charset=utf-8"]) {
    const body = new URLSearchParams({ ...fields, sign: signature(fields) }).toString();
    const result = await request(value, "verify_callback", { action: "chaojipay_callback_verify", callbackInput: { callbackRequestRef: "callback_request_1", receivedAt: "2026-08-02T00:00:00.000Z", bodyBase64: Buffer.from(body, "utf8").toString("base64"), headerEntries: [{ name: "content-type", value: contentType }] } });
    assert.deepEqual(result.response, fields);
    assert.equal(result.evidence.merchantScopeDigest, MERCHANT_DIGEST);
    assert.match(result.evidence.payloadDigest, /^[a-f0-9]{64}$/u);
  }
});

test("ChaoJiPay runtime acknowledges signed non-success statuses and fails closed for IP, redirect, callback, and response faults", async () => {
  for (const createRequestIp of [undefined, "127.0.0.1", "0.0.0.0", "10.0.0.1", "169.254.1.1", "224.0.0.1", "2001:db8::1", "198.051.100.10"]) {
    assert.throws(() => runtime(async () => response(200, {}), { createRequestIp }), /chaojipay_transport_failed/u);
  }
  const redirected = runtime(async (url) => response(200, { data: { payUrl: "https://checkout.example.test/pay/1" } }, { redirected: true, url }));
  await assert.rejects(() => request(redirected, "create_recharge_order", { action: "chaojipay_payment_create", createInput: CREATE_INPUT, routeRefs: { callbackRouteRef: "portal_payment_callback_v1" } }), /chaojipay_transport_failed/u);
  const unexpectedResponse = runtime(async (url) => response(200, { data: { payUrl: "https://checkout.example.test/pay/1" }, extra: "no" }, { redirected: false, url }));
  await assert.rejects(() => request(unexpectedResponse, "create_recharge_order", { action: "chaojipay_payment_create", createInput: CREATE_INPUT, routeRefs: { callbackRouteRef: "portal_payment_callback_v1" } }), /chaojipay_transport_failed/u);
  const callbackRuntime = runtime(async () => { throw new Error("callback must not fetch"); });
  for (const fields of [
    { orderId: "provider_capture_1", orderStatus: "0", outTradeId: "payment_order_1", amount: "12.00" },
    { orderId: "provider_capture_1", orderStatus: "2", outTradeId: "payment_order_1", amount: "12.00" },
    { orderId: "provider_capture_1", orderStatus: "3", outTradeId: "payment_order_1", amount: "12.00" },
  ]) {
    const body = new URLSearchParams({ ...fields, sign: signature(fields) }).toString();
    assert.deepEqual((await request(callbackRuntime, "verify_callback", { action: "chaojipay_callback_verify", callbackInput: { callbackRequestRef: "callback_request_1", receivedAt: "2026-08-02T00:00:00.000Z", bodyBase64: Buffer.from(body, "utf8").toString("base64"), headerEntries: [{ name: "content-type", value: "application/form" }] } })).response, fields);
  }
  for (const fields of [
    { orderId: "provider_capture_1", orderStatus: "1", outTradeId: "payment_order_1", amount: "12.00", param: "forbidden" },
    { orderId: "provider_capture_1", orderStatus: "1", outTradeId: "payment_order_1", amount: "12.00", sign: "0".repeat(32) },
  ]) {
    const signed = fields.sign ? fields : { ...fields, sign: signature(fields) };
    await assert.rejects(() => request(callbackRuntime, "verify_callback", { action: "chaojipay_callback_verify", callbackInput: { callbackRequestRef: "callback_request_1", receivedAt: "2026-08-02T00:00:00.000Z", bodyBase64: Buffer.from(new URLSearchParams(signed).toString(), "utf8").toString("base64"), headerEntries: [{ name: "content-type", value: "application/form" }] } }), /chaojipay_transport_failed/u);
  }
});
