import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createChaoJiPayPaymentRuntime } from "../services/platform/chaojipay-payment-runtime.mjs";

const API_ORIGIN = "https://payment.chaojipay.example.test";
const SECRET = "synthetic-chaojipay-secret";
const REQUEST_IP = "1.1.1.1";
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

function response(status, body, { headers, ...extras } = {}) {
  const standard = new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
  return Object.freeze({ status: standard.status, headers: standard.headers, body: standard.body, redirected: false, url: `${API_ORIGIN}/api/order/create`, ...extras });
}

function streamResponse(stream, extras = {}) {
  const standard = new Response(stream, { status: 200 });
  return Object.freeze({ status: standard.status, headers: standard.headers, body: standard.body, redirected: false, url: `${API_ORIGIN}/api/order/create`, ...extras });
}

function runtime(fetchFn, options = {}) {
  return createChaoJiPayPaymentRuntime({
    credential: { merchantId: "merchant_demo", merchantSecret: SECRET, merchantScopeDigest: MERCHANT_DIGEST },
    fetchFn, apiOrigin: API_ORIGIN, allowedActionOrigins: ["https://checkout.example.test"],
    routeMap: { portal_payment_callback_v1: "https://portal.example.test/api/payment/chaojipay/callback" },
    profileRef: "chaojipay_profile", credentialProfileRef: "chaojipay_credential",
    createRequestIp: REQUEST_IP, nowFn: () => "2026-08-02T00:00:00.000Z", ...options,
  });
}

async function request(value, operation, body, bindingOverride = {}) {
  const binding = Object.freeze({ profileRef: "chaojipay_profile", adapterKey: "chaojipay_v1", contractVersion: "v1", credentialProfileRef: "chaojipay_credential", operation, ...bindingOverride });
  return value.credentialLoader.withCredential(binding, (credentialHandle) => value.transport.requestFn({ binding, credentialHandle, request: body }));
}

test("ChaoJiPay runtime sends the exact signed JSON create body with the injected public IP", async () => {
  const calls = [];
  const value = runtime(async (url, init) => {
    calls.push({ url, init });
    return response(200, { data: { payUrl: "https://checkout.example.test/pay/1" } }, { url });
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
  for (const createRequestIp of [
    undefined, "0.0.0.0", "0.1.2.3", "10.0.0.1", "172.16.0.1", "192.168.0.1",
    "127.0.0.1", "169.254.1.1", "100.64.0.1", "192.0.0.1", "192.0.0.255",
    "192.0.2.1", "192.88.99.2", "198.51.100.10", "203.0.113.1", "198.18.0.1", "198.19.255.255",
    "224.0.0.1", "240.0.0.1", "255.255.255.255", "2001:db8::1", "198.051.100.10",
  ]) {
    assert.throws(() => runtime(async () => response(200, {}), { createRequestIp }), /chaojipay_transport_failed/u);
  }
  for (const createRequestIp of ["198.50.100.10", "203.1.113.1"]) {
    assert.doesNotThrow(() => runtime(async () => response(200, {}), { createRequestIp }));
  }
  const redirected = runtime(async (url) => response(200, { data: { payUrl: "https://checkout.example.test/pay/1" } }, { redirected: true, url }));
  await assert.rejects(() => request(redirected, "create_recharge_order", { action: "chaojipay_payment_create", createInput: CREATE_INPUT, routeRefs: { callbackRouteRef: "portal_payment_callback_v1" } }), /chaojipay_transport_failed/u);
  const unexpectedResponse = runtime(async (url) => response(200, { data: { payUrl: "https://checkout.example.test/pay/1" }, extra: "no" }, { redirected: false, url }));
  await assert.rejects(() => request(unexpectedResponse, "create_recharge_order", { action: "chaojipay_payment_create", createInput: CREATE_INPUT, routeRefs: { callbackRouteRef: "portal_payment_callback_v1" } }), /chaojipay_transport_failed/u);
  const emptyFinalUrl = runtime(async () => response(200, { data: { payUrl: "https://checkout.example.test/pay/1" } }, { url: "" }));
  await assert.rejects(() => request(emptyFinalUrl, "create_recharge_order", { action: "chaojipay_payment_create", createInput: CREATE_INPUT, routeRefs: { callbackRouteRef: "portal_payment_callback_v1" } }), /chaojipay_transport_failed/u);
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
    { orderId: "provider_capture_1", orderStatus: "1", outTradeId: "payment_order_1", amount: "12.00", extra: "forbidden" },
    { orderId: "provider_capture_1", orderStatus: "1", outTradeId: "payment_order_1", amount: "12.00", sign: "0".repeat(32) },
  ]) {
    const signed = fields.sign ? fields : { ...fields, sign: signature(fields) };
    await assert.rejects(() => request(callbackRuntime, "verify_callback", { action: "chaojipay_callback_verify", callbackInput: { callbackRequestRef: "callback_request_1", receivedAt: "2026-08-02T00:00:00.000Z", bodyBase64: Buffer.from(new URLSearchParams(signed).toString(), "utf8").toString("base64"), headerEntries: [{ name: "content-type", value: "application/form" }] } }), /chaojipay_transport_failed/u);
  }
});

test("ChaoJiPay runtime rejects mismatched credential bindings before issuing a handle", async () => {
  let fetchCalls = 0;
  const value = runtime(async () => { fetchCalls += 1; throw new Error("must-not-fetch"); });
  const body = { action: "chaojipay_payment_create", createInput: CREATE_INPUT, routeRefs: { callbackRouteRef: "portal_payment_callback_v1" } };
  for (const bindingOverride of [{ profileRef: "wrong_profile" }, { credentialProfileRef: "wrong_credential" }]) {
    await assert.rejects(() => request(value, "create_recharge_order", body, bindingOverride), /chaojipay_transport_failed/u);
  }
  assert.equal(fetchCalls, 0);
});

test("ChaoJiPay runtime rechecks profile and credential profile when an issued handle is used", async () => {
  let fetchCalls = 0;
  const value = runtime(async () => { fetchCalls += 1; throw new Error("must-not-fetch"); });
  const correctBinding = Object.freeze({ profileRef: "chaojipay_profile", adapterKey: "chaojipay_v1", contractVersion: "v1", credentialProfileRef: "chaojipay_credential", operation: "create_recharge_order" });
  const body = { action: "chaojipay_payment_create", createInput: CREATE_INPUT, routeRefs: { callbackRouteRef: "portal_payment_callback_v1" } };
  await value.credentialLoader.withCredential(correctBinding, async (credentialHandle) => {
    for (const binding of [
      { ...correctBinding, profileRef: "wrong_profile" },
      { ...correctBinding, credentialProfileRef: "wrong_credential" },
    ]) {
      await assert.rejects(() => value.transport.requestFn({ binding, credentialHandle, request: body }), /chaojipay_transport_failed/u);
    }
  });
  assert.equal(fetchCalls, 0);
});

test("ChaoJiPay runtime bounds malformed declared-length and chunked JSON Responses", async () => {
  const body = { action: "chaojipay_payment_create", createInput: CREATE_INPUT, routeRefs: { callbackRouteRef: "portal_payment_callback_v1" } };
  for (const providerResponse of [
    response(200, "{"),
    response(200, { data: { payUrl: "https://checkout.example.test/pay/1" } }, { headers: { "content-length": "1048577" } }),
    streamResponse(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(1_048_576)); controller.enqueue(new Uint8Array(1)); controller.close(); } })),
  ]) {
    const value = runtime(async () => providerResponse);
    await assert.rejects(() => request(value, "create_recharge_order", body), /chaojipay_transport_failed/u);
  }
  const duplicateSignature = signature({ orderId: "provider_capture_1", orderStatus: "1", outTradeId: "payment_order_1", amount: "12.00" });
  const duplicateFields = `orderId=provider_capture_wrong&orderId=provider_capture_1&orderStatus=1&outTradeId=payment_order_1&amount=12.00&sign=${duplicateSignature}`;
  const callbackRuntime = runtime(async () => { throw new Error("callback must not fetch"); });
  await assert.rejects(() => request(callbackRuntime, "verify_callback", { action: "chaojipay_callback_verify", callbackInput: { callbackRequestRef: "callback_request_1", receivedAt: "2026-08-02T00:00:00.000Z", bodyBase64: Buffer.from(duplicateFields, "utf8").toString("base64"), headerEntries: [{ name: "content-type", value: "application/form" }] } }), /chaojipay_transport_failed/u);
});
