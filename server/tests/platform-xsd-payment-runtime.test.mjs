import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createXsdPaymentRuntime } from "../services/platform/xsd-payment-runtime.mjs";

const API_ORIGIN = "https://xsd-api.example.test";
const SECRET = "synthetic-xsd-secret";
const MERCHANT_DIGEST = "a".repeat(64);

function signature(fields) {
  return createHash("md5").update(Object.keys(fields).filter((key) => key !== "sign" && key !== "format" && fields[key] !== "").sort().map((key) => `${key}=${fields[key]}`).join("&") + SECRET, "utf8").digest("hex");
}

function response(status, body, { headers, url = `${API_ORIGIN}/api/gaia/unifiedorder`, ...extras } = {}) {
  const standard = new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
  return Object.freeze({ status: standard.status, headers: standard.headers, body: standard.body, redirected: false, url, ...extras });
}

function streamResponse(stream, { url = `${API_ORIGIN}/api/gaia/unifiedorder`, ...extras } = {}) {
  const standard = new Response(stream, { status: 200 });
  return Object.freeze({ status: standard.status, headers: standard.headers, body: standard.body, redirected: false, url, ...extras });
}

function runtime(fetchFn) {
  return createXsdPaymentRuntime({
    credential: { merchantId: "merchant_demo", merchantSecret: SECRET, merchantScopeDigest: MERCHANT_DIGEST },
    fetchFn, apiOrigin: API_ORIGIN, allowedActionOrigins: ["https://checkout.example.test"],
    routeMap: {
      portal_payment_callback_v1: "https://portal.example.test/api/payment/xsd/callback",
      portal_wallet_return_v1: "https://portal.example.test/wallet",
    }, nowFn: () => "2026-08-02T00:00:00.000Z",
    profileRef: "xsd_profile", credentialProfileRef: "xsd_credential",
  });
}

async function request(runtimeValue, operation, request, bindingOverride = {}) {
  const binding = Object.freeze({ profileRef: "xsd_profile", adapterKey: "xsd_v1", contractVersion: "v1", credentialProfileRef: "xsd_credential", operation, ...bindingOverride });
  return runtimeValue.credentialLoader.withCredential(binding, (credentialHandle) => runtimeValue.transport.requestFn({ binding, credentialHandle, request }));
}

test("XSD runtime signs UTF-8 create and query form requests with injected transport", async () => {
  const calls = [];
  const value = runtime(async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith("/unifiedorder")) return response(200, { code: "0", datas: { url: "https://checkout.example.test/pay/1" } });
    const fields = { mch_order_no: "payment_order_1", mchId: "merchant_demo", status: "00", amount: "12.00" };
    return response(200, { ...fields, sign: signature(fields) }, { url });
  });
  const created = await request(value, "create_recharge_order", {
    action: "xsd_payment_create",
    createInput: { paymentOrderRef: "payment_order_1", attemptRef: "attempt_1", providerRequestRef: "provider_request_1", paymentMethod: "alipay", amountMinor: 1200, currency: "CNY", currencyExponent: 2, expectedPaidCoins: 30, quoteDigest: "c".repeat(64), expiresAt: "2026-08-02T00:10:00.000Z", callbackRouteRef: "portal_payment_callback_v1", returnRouteRef: "portal_wallet_return_v1" },
    routeRefs: { callbackRouteRef: "portal_payment_callback_v1", returnRouteRef: "portal_wallet_return_v1" },
  });
  assert.equal(calls[0].url, `${API_ORIGIN}/api/gaia/unifiedorder`);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.redirect, "error");
  assert.equal(calls[0].init.headers["Content-Type"], "application/x-www-form-urlencoded; charset=utf-8");
  assert.equal(calls[0].init.body, `amount=12.00&callbackurl=https%3A%2F%2Fportal.example.test%2Fwallet&channel=1917&format=json&mchId=merchant_demo&mch_order_no=payment_order_1&notifyurl=https%3A%2F%2Fportal.example.test%2Fapi%2Fpayment%2Fxsd%2Fcallback&sign=${signature({ mch_order_no: "payment_order_1", amount: "12.00", notifyurl: "https://portal.example.test/api/payment/xsd/callback", callbackurl: "https://portal.example.test/wallet", mchId: "merchant_demo", channel: "1917", format: "json" })}`);
  assert.deepEqual(created, { response: { url: "https://checkout.example.test/pay/1" }, evidence: null });
  const queried = await request(value, "query_payment", { action: "xsd_payment_query", paymentOrderRef: "payment_order_1" });
  assert.equal(calls[1].url, `${API_ORIGIN}/api/gaia/query`);
  assert.equal(calls[1].init.redirect, "error");
  assert.equal(calls[1].init.body, `mchId=merchant_demo&mch_order_no=payment_order_1&sign=${signature({ mch_order_no: "payment_order_1", mchId: "merchant_demo" })}`);
  assert.deepEqual(queried, { response: { mch_order_no: "payment_order_1", status: "00" }, evidence: null });
});

test("XSD runtime rejects empty, redirected, or mismatched final URLs even when their bodies are valid", async () => {
  const redirected = response(200, { code: "0", datas: { url: "https://checkout.example.test/pay/1" } }, { redirected: true, url: `${API_ORIGIN}/api/gaia/unifiedorder` });
  const value = runtime(async () => redirected);
  await assert.rejects(() => request(value, "create_recharge_order", {
    action: "xsd_payment_create",
    createInput: { paymentOrderRef: "payment_order_1", attemptRef: "attempt_1", providerRequestRef: "provider_request_1", paymentMethod: "alipay", amountMinor: 1200, currency: "CNY", currencyExponent: 2, expectedPaidCoins: 30, quoteDigest: "c".repeat(64), expiresAt: "2026-08-02T00:10:00.000Z", callbackRouteRef: "portal_payment_callback_v1", returnRouteRef: "portal_wallet_return_v1" },
    routeRefs: { callbackRouteRef: "portal_payment_callback_v1", returnRouteRef: "portal_wallet_return_v1" },
  }), /xsd_transport_failed/u);
  for (const url of ["", "https://other.example.test/redirected"]) {
    const query = runtime(async () => {
      const fields = { mch_order_no: "payment_order_1", mchId: "merchant_demo", status: "00", amount: "12.00" };
      return response(200, { ...fields, sign: signature(fields) }, { url });
    });
    await assert.rejects(() => request(query, "query_payment", { action: "xsd_payment_query", paymentOrderRef: "payment_order_1" }), /xsd_transport_failed/u);
  }
  const standard = new Response(JSON.stringify({ code: "0", datas: { url: "https://checkout.example.test/pay/1" } }), { status: 200 });
  const missingRedirected = Object.freeze({ status: standard.status, headers: standard.headers, body: standard.body, url: `${API_ORIGIN}/api/gaia/unifiedorder` });
  await assert.rejects(() => request(runtime(async () => missingRedirected), "create_recharge_order", {
    action: "xsd_payment_create",
    createInput: { paymentOrderRef: "payment_order_1", attemptRef: "attempt_1", providerRequestRef: "provider_request_1", paymentMethod: "alipay", amountMinor: 1200, currency: "CNY", currencyExponent: 2, expectedPaidCoins: 30, quoteDigest: "c".repeat(64), expiresAt: "2026-08-02T00:10:00.000Z", callbackRouteRef: "portal_payment_callback_v1", returnRouteRef: "portal_wallet_return_v1" },
    routeRefs: { callbackRouteRef: "portal_payment_callback_v1", returnRouteRef: "portal_wallet_return_v1" },
  }), /xsd_transport_failed/u);
});

test("XSD runtime rejects mismatched profile bindings before issuing a handle", async () => {
  let callbacks = 0;
  const value = runtime(async () => { throw new Error("must-not-fetch"); });
  for (const binding of [
    { profileRef: "wrong_profile", adapterKey: "xsd_v1", contractVersion: "v1", credentialProfileRef: "xsd_credential", operation: "query_payment" },
    { profileRef: "xsd_profile", adapterKey: "xsd_v1", contractVersion: "v1", credentialProfileRef: "wrong_credential", operation: "query_payment" },
  ]) {
    assert.throws(() => value.credentialLoader.withCredential(binding, () => { callbacks += 1; }), /xsd_transport_failed/u);
  }
  assert.equal(callbacks, 0);
});

test("XSD runtime rechecks profile bindings when an issued handle is used", async () => {
  let fetchCalls = 0;
  const value = runtime(async () => { fetchCalls += 1; throw new Error("must-not-fetch"); });
  const correctBinding = Object.freeze({ profileRef: "xsd_profile", adapterKey: "xsd_v1", contractVersion: "v1", credentialProfileRef: "xsd_credential", operation: "query_payment" });
  const body = { action: "xsd_payment_query", paymentOrderRef: "payment_order_1" };
  await value.credentialLoader.withCredential(correctBinding, async (credentialHandle) => {
    for (const binding of [{ ...correctBinding, profileRef: "wrong_profile" }, { ...correctBinding, credentialProfileRef: "wrong_credential" }]) {
      await assert.rejects(() => value.transport.requestFn({ binding, credentialHandle, request: body }), /xsd_transport_failed/u);
    }
  });
  assert.equal(fetchCalls, 0);
});

test("XSD runtime rejects declared oversize JSON before accessing its body", async () => {
  const body = { action: "xsd_payment_create", createInput: { paymentOrderRef: "payment_order_1", attemptRef: "attempt_1", providerRequestRef: "provider_request_1", paymentMethod: "alipay", amountMinor: 1200, currency: "CNY", currencyExponent: 2, expectedPaidCoins: 30, quoteDigest: "c".repeat(64), expiresAt: "2026-08-02T00:10:00.000Z", callbackRouteRef: "portal_payment_callback_v1", returnRouteRef: "portal_wallet_return_v1" }, routeRefs: { callbackRouteRef: "portal_payment_callback_v1", returnRouteRef: "portal_wallet_return_v1" } };
  let bodyGets = 0;
  let readerGets = 0;
  let reads = 0;
  const validJson = new TextEncoder().encode(JSON.stringify({ code: "0", datas: { url: "https://checkout.example.test/pay/1" } }));
  const declaredResponse = { status: 200, redirected: false, url: `${API_ORIGIN}/api/gaia/unifiedorder`, headers: new Headers({ "content-length": "1048577" }) };
  Object.defineProperty(declaredResponse, "body", { enumerable: true, get() {
    bodyGets += 1;
    return { getReader() { readerGets += 1; return { async read() { reads += 1; return reads === 1 ? { done: false, value: validJson } : { done: true }; } }; } };
  } });
  const declared = runtime(async () => declaredResponse);
  await assert.rejects(() => request(declared, "create_recharge_order", body), /xsd_transport_failed/u);
  assert.deepEqual({ bodyGets, readerGets, reads }, { bodyGets: 0, readerGets: 0, reads: 0 });
});

test("XSD runtime cancels zero-length and excessive-chunk Responses", async () => {
  const body = { action: "xsd_payment_create", createInput: { paymentOrderRef: "payment_order_1", attemptRef: "attempt_1", providerRequestRef: "provider_request_1", paymentMethod: "alipay", amountMinor: 1200, currency: "CNY", currencyExponent: 2, expectedPaidCoins: 30, quoteDigest: "c".repeat(64), expiresAt: "2026-08-02T00:10:00.000Z", callbackRouteRef: "portal_payment_callback_v1", returnRouteRef: "portal_wallet_return_v1" }, routeRefs: { callbackRouteRef: "portal_payment_callback_v1", returnRouteRef: "portal_wallet_return_v1" } };
  let cancelled = false;
  for (const stream of [
    new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(1_048_576)); controller.enqueue(new Uint8Array([1])); }, cancel() { cancelled = true; } }),
    new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array()); }, cancel() { cancelled = true; } }),
    new ReadableStream({ start(controller) { for (let index = 0; index < 4097; index += 1) controller.enqueue(new Uint8Array([1])); }, cancel() { cancelled = true; } }),
  ]) {
    cancelled = false;
    await assert.rejects(() => request(runtime(async () => streamResponse(stream)), "create_recharge_order", body), /xsd_transport_failed/u);
    assert.equal(cancelled, true);
  }
});

test("XSD runtime collapses reader exceptions without exposing their messages", async () => {
  const body = { action: "xsd_payment_create", createInput: { paymentOrderRef: "payment_order_1", attemptRef: "attempt_1", providerRequestRef: "provider_request_1", paymentMethod: "alipay", amountMinor: 1200, currency: "CNY", currencyExponent: 2, expectedPaidCoins: 30, quoteDigest: "c".repeat(64), expiresAt: "2026-08-02T00:10:00.000Z", callbackRouteRef: "portal_payment_callback_v1", returnRouteRef: "portal_wallet_return_v1" }, routeRefs: { callbackRouteRef: "portal_payment_callback_v1", returnRouteRef: "portal_wallet_return_v1" } };
  const sensitive = "synthetic-sensitive-reader-text";
  const hostile = Object.freeze({ status: 200, redirected: false, url: `${API_ORIGIN}/api/gaia/unifiedorder`, headers: new Headers(), body: { getReader() { throw new Error(sensitive); } } });
  await assert.rejects(() => request(runtime(async () => hostile), "create_recharge_order", body), (error) => {
    assert.equal(error.message, "xsd_transport_failed");
    assert.equal(error.message.includes(sensitive), false);
    return true;
  });
});

test("XSD runtime rejects malformed fatal UTF-8 Responses", async () => {
  const body = { action: "xsd_payment_create", createInput: { paymentOrderRef: "payment_order_1", attemptRef: "attempt_1", providerRequestRef: "provider_request_1", paymentMethod: "alipay", amountMinor: 1200, currency: "CNY", currencyExponent: 2, expectedPaidCoins: 30, quoteDigest: "c".repeat(64), expiresAt: "2026-08-02T00:10:00.000Z", callbackRouteRef: "portal_payment_callback_v1", returnRouteRef: "portal_wallet_return_v1" }, routeRefs: { callbackRouteRef: "portal_payment_callback_v1", returnRouteRef: "portal_wallet_return_v1" } };
  const malformed = runtime(async () => streamResponse(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([0xc3, 0x28])); controller.close(); } })));
  await assert.rejects(() => request(malformed, "create_recharge_order", body), /xsd_transport_failed/u);
});

test("XSD runtime verifies only signed form callback input and returns redacted evidence", async () => {
  const value = runtime(async () => { throw new Error("callback must not fetch"); });
  const fields = { mch_order_no: "payment_order_1", partnerorderid: "provider_order_1", status: "1", mchId: "merchant_demo", amount: "12.00" };
  const body = new URLSearchParams({ ...fields, sign: signature(fields) }).toString();
  const result = await request(value, "verify_callback", {
    action: "xsd_callback_verify",
    callbackInput: { callbackRequestRef: "callback_request_1", receivedAt: "2026-08-02T00:00:00.000Z", bodyBase64: Buffer.from(body, "utf8").toString("base64"), headerEntries: [{ name: "content-type", value: "application/x-www-form-urlencoded; charset=utf-8" }] },
  });
  assert.deepEqual(result.response, fields);
  assert.equal(result.evidence.merchantScopeDigest, MERCHANT_DIGEST);
  assert.match(result.evidence.payloadDigest, /^[a-f0-9]{64}$/u);
  assert.equal(JSON.stringify(result).includes(body), false);
});

test("XSD runtime fails closed on transport, response, identity, signature, order, amount, and callback-shape faults", async () => {
  const malformed = runtime(async () => response(200, "not-json"));
  await assert.rejects(() => request(malformed, "create_recharge_order", {
    action: "xsd_payment_create", createInput: { paymentOrderRef: "payment_order_1", attemptRef: "attempt_1", providerRequestRef: "provider_request_1", paymentMethod: "alipay", amountMinor: 1200, currency: "CNY", currencyExponent: 2, expectedPaidCoins: 30, quoteDigest: "c".repeat(64), expiresAt: "2026-08-02T00:10:00.000Z", callbackRouteRef: "portal_payment_callback_v1", returnRouteRef: "portal_wallet_return_v1" }, routeRefs: { callbackRouteRef: "portal_payment_callback_v1", returnRouteRef: "portal_wallet_return_v1" },
  }), /xsd_transport_failed/u);
  const value = runtime(async (url) => response(200, { mch_order_no: "other_order", mchId: "merchant_demo", status: "00", amount: "12.00", sign: "0".repeat(32) }, { url }));
  await assert.rejects(() => request(value, "query_payment", { action: "xsd_payment_query", paymentOrderRef: "payment_order_1" }), /xsd_transport_failed/u);
  const callback = runtime(async () => response(500, {}));
  for (const fields of [
    { mch_order_no: "payment_order_1", partnerorderid: "provider_order_1", status: "1", mchId: "merchant_demo", amount: "12.00", attach: "unexpected", sign: "x" },
    { mch_order_no: "payment_order_1", partnerorderid: "provider_order_1", status: "1", mchId: "wrong_merchant", amount: "12.00", sign: "x" },
    { mch_order_no: "payment_order_1", partnerorderid: "provider_order_1", status: "1", mchId: "merchant_demo", amount: "12.001", sign: "x" },
  ]) {
    await assert.rejects(() => request(callback, "verify_callback", {
      action: "xsd_callback_verify", callbackInput: { callbackRequestRef: "callback_request_1", receivedAt: "2026-08-02T00:00:00.000Z", bodyBase64: Buffer.from(new URLSearchParams(fields).toString(), "utf8").toString("base64"), headerEntries: [{ name: "content-type", value: "application/x-www-form-urlencoded; charset=utf-8" }] },
    }), /xsd_transport_failed/u);
  }
});
