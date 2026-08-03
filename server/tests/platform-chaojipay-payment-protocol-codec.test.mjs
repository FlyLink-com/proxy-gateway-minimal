import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeChaoJiPayCreateResponse, decodeVerifiedChaoJiPayCallback,
  encodeChaoJiPayCallbackVerificationRequest, encodeChaoJiPayCreateRequest,
} from "../services/platform/chaojipay-payment-protocol-codec.mjs";

const NOW = "2026-08-02T00:00:00.000Z";
const CREATE_INPUT = Object.freeze({
  paymentOrderRef: "payment_order_1", attemptRef: "attempt_1", providerRequestRef: "provider_request_1",
  paymentMethod: "wechat_pay", amountMinor: 1200, currency: "CNY", currencyExponent: 2,
  expectedPaidCoins: 30, quoteDigest: "c".repeat(64), expiresAt: "2026-08-02T00:10:00.000Z",
  callbackRouteRef: "portal_payment_callback_v1", returnRouteRef: "portal_wallet_return_v1",
});
const CALLBACK_INPUT = Object.freeze({
  callbackRequestRef: "callback_request_1", receivedAt: NOW,
  bodyBase64: Buffer.from("amount=12.00&orderId=provider_capture_1&orderStatus=1&outTradeId=payment_order_1&sign=synthetic", "utf8").toString("base64"),
  headerEntries: [{ name: "content-type", value: "application/form" }],
});

function invalid(action) { assert.throws(action, /invalid_chaojipay_payment_protocol/u); }

test("ChaoJiPay codec creates credential-free envelopes and only exposes documented route refs", () => {
  const create = encodeChaoJiPayCreateRequest(CREATE_INPUT);
  assert.deepEqual(create, { action: "chaojipay_payment_create", createInput: { ...CREATE_INPUT }, routeRefs: { callbackRouteRef: "portal_payment_callback_v1" } });
  assert.equal(Object.isFrozen(create), true);
  assert.equal(JSON.stringify(create).includes("credential"), false);
  assert.deepEqual(encodeChaoJiPayCallbackVerificationRequest(CALLBACK_INPUT), { action: "chaojipay_callback_verify", callbackInput: { ...CALLBACK_INPUT } });
});

test("ChaoJiPay codec maps only verified signed status one to a success fact", () => {
  assert.deepEqual(decodeChaoJiPayCreateResponse({ createInput: CREATE_INPUT, providerResponse: { data: { payUrl: "https://checkout.example.test/pay/1" } }, receivedAt: NOW }), {
    providerOrderRef: "payment_order_1", status: "entry_ready", chargeCertainty: "possibly_charged",
    nextAction: { type: "redirect", url: "https://checkout.example.test/pay/1", expiresAt: CREATE_INPUT.expiresAt }, occurredAt: NOW,
  });
  const fact = decodeVerifiedChaoJiPayCallback({
    callbackInput: CALLBACK_INPUT,
    providerResponse: { orderId: "provider_capture_1", orderStatus: "1", outTradeId: "payment_order_1", amount: "12.00" },
    merchantScopeDigest: "a".repeat(64), payloadDigest: "b".repeat(64),
  });
  assert.equal(fact.paymentOrderRef, "payment_order_1");
  assert.equal(fact.providerOrderRef, "payment_order_1");
  assert.equal(fact.providerCaptureRef, "provider_capture_1");
  assert.equal(fact.eventType, "payment_succeeded");
  for (const status of ["0", "2", "3"]) assert.equal(decodeVerifiedChaoJiPayCallback({ callbackInput: CALLBACK_INPUT, providerResponse: { orderId: "provider_capture_1", orderStatus: status, outTradeId: "payment_order_1", amount: "12.00" }, merchantScopeDigest: "a".repeat(64), payloadDigest: "b".repeat(64) }), null);
  invalid(() => decodeVerifiedChaoJiPayCallback({ callbackInput: CALLBACK_INPUT, providerResponse: { orderId: "provider_capture_1", orderStatus: "9", outTradeId: "payment_order_1", amount: "12.00" }, merchantScopeDigest: "a".repeat(64), payloadDigest: "b".repeat(64) }));
});

test("ChaoJiPay codec fails closed for unsupported methods, malformed callbacks, and unsafe response fields", () => {
  for (const input of [{ ...CREATE_INPUT, paymentMethod: "alipay" }, { ...CREATE_INPUT, currency: "USD" }, { ...CREATE_INPUT, currencyExponent: 0 }, { ...CREATE_INPUT, paymentOrderRef: "unsafe/ref" }]) invalid(() => encodeChaoJiPayCreateRequest(input));
  invalid(() => encodeChaoJiPayCallbackVerificationRequest({ ...CALLBACK_INPUT, bodyBase64: Buffer.alloc(12_289, "a").toString("base64") }));
  invalid(() => decodeVerifiedChaoJiPayCallback({ callbackInput: CALLBACK_INPUT, providerResponse: { orderId: "provider_capture_1", orderStatus: "1", outTradeId: "payment_order_1", amount: "12.00", param: "forbidden" }, merchantScopeDigest: "a".repeat(64), payloadDigest: "b".repeat(64) }));
});
