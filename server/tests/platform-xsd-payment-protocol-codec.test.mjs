import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeVerifiedXsdCallback,
  decodeXsdCreateResponse,
  decodeXsdQueryResponse,
  encodeXsdCallbackVerificationRequest,
  encodeXsdCreateRequest,
  encodeXsdQueryRequest,
} from "../services/platform/xsd-payment-protocol-codec.mjs";

const NOW = "2026-08-02T00:00:00.000Z";
const EXPIRES_AT = "2026-08-02T00:10:00.000Z";
const MERCHANT_DIGEST = "a".repeat(64);
const PAYLOAD_DIGEST = "b".repeat(64);
const CREATE_INPUT = Object.freeze({
  paymentOrderRef: "payment_order_1",
  attemptRef: "attempt_1",
  providerRequestRef: "provider_request_1",
  paymentMethod: "alipay",
  amountMinor: 1200,
  currency: "CNY",
  currencyExponent: 2,
  expectedPaidCoins: 30,
  quoteDigest: "c".repeat(64),
  expiresAt: EXPIRES_AT,
  callbackRouteRef: "portal_payment_callback_v1",
  returnRouteRef: "portal_wallet_return_v1",
});
const QUERY_INPUT = Object.freeze({
  paymentOrderRef: "payment_order_1",
  attemptRef: "attempt_1",
  providerOrderRef: "payment_order_1",
});
const CALLBACK_INPUT = Object.freeze({
  callbackRequestRef: "callback_request_1",
  receivedAt: NOW,
  bodyBase64: Buffer.from("amount=12.00&mchId=merchant_demo&mch_order_no=payment_order_1&partnerorderid=provider_order_1&sign=synthetic&status=1", "utf8").toString("base64"),
  headerEntries: [{ name: "content-type", value: "application/x-www-form-urlencoded; charset=utf-8" }],
});

function assertInvalid(action) {
  assert.throws(action, /invalid_xsd_payment_protocol/u);
}

test("XSD codec freezes opaque create, query, and callback transport envelopes without credentials", () => {
  const create = encodeXsdCreateRequest(CREATE_INPUT);
  assert.deepEqual(create, {
    action: "xsd_payment_create",
    createInput: { ...CREATE_INPUT },
    routeRefs: {
      callbackRouteRef: "portal_payment_callback_v1",
      returnRouteRef: "portal_wallet_return_v1",
    },
  });
  assert.equal(Object.isFrozen(create), true);
  assert.equal(Object.isFrozen(create.createInput), true);
  assert.equal(JSON.stringify(create).includes("credential"), false);
  assert.deepEqual(encodeXsdQueryRequest(QUERY_INPUT), {
    action: "xsd_payment_query",
    paymentOrderRef: "payment_order_1",
  });
  assert.deepEqual(encodeXsdCallbackVerificationRequest(CALLBACK_INPUT), {
    action: "xsd_callback_verify",
    callbackInput: { ...CALLBACK_INPUT },
  });
});

test("XSD codec returns only entry-ready redirect, signed query states, and signed callback success facts", () => {
  assert.deepEqual(decodeXsdCreateResponse({
    createInput: CREATE_INPUT,
    providerResponse: { url: "https://checkout.example.test/pay/1" },
    receivedAt: NOW,
  }), {
    providerOrderRef: "payment_order_1",
    status: "entry_ready",
    chargeCertainty: "possibly_charged",
    nextAction: { type: "redirect", url: "https://checkout.example.test/pay/1", expiresAt: EXPIRES_AT },
    occurredAt: NOW,
  });
  for (const [status, expected] of [
    ["3", ["succeeded", "confirmed_charged"]],
    ["00", ["pending", "possibly_charged"]],
    ["9", ["reconciliation_required", "unknown"]],
  ]) {
    const actual = decodeXsdQueryResponse({
      queryInput: QUERY_INPUT,
      providerResponse: { mch_order_no: "payment_order_1", status },
      receivedAt: NOW,
    });
    assert.equal(actual.status, expected[0]);
    assert.equal(actual.chargeCertainty, expected[1]);
  }
  const fact = decodeVerifiedXsdCallback({
    callbackInput: CALLBACK_INPUT,
    providerResponse: {
      mch_order_no: "payment_order_1", partnerorderid: "provider_order_1",
      status: "1", mchId: "merchant_demo", amount: "12.00",
    },
    merchantScopeDigest: MERCHANT_DIGEST,
    payloadDigest: PAYLOAD_DIGEST,
  });
  assert.equal(fact.eventType, "payment_succeeded");
  assert.equal(fact.paymentOrderRef, "payment_order_1");
  assert.equal(fact.providerCaptureRef, "provider_order_1");
  assert.equal(fact.amountMinor, 1200);
  assert.equal(fact.currency, "CNY");
  assert.equal(fact.currencyExponent, 2);
  assert.equal(decodeVerifiedXsdCallback({
    callbackInput: CALLBACK_INPUT,
    providerResponse: { mch_order_no: "payment_order_1", partnerorderid: "provider_order_1", status: "-1", mchId: "merchant_demo", amount: "12.00" },
    merchantScopeDigest: MERCHANT_DIGEST,
    payloadDigest: PAYLOAD_DIGEST,
  }), null);
});

test("XSD codec fails closed for non-CNY inputs, hostile objects, unsafe references, extra fields, unsigned projection, and attach", () => {
  const accessor = {};
  let reads = 0;
  Object.defineProperty(accessor, "paymentOrderRef", { enumerable: true, get() { reads += 1; return "payment_order_1"; } });
  for (const input of [
    { ...CREATE_INPUT, currency: "USD" },
    { ...CREATE_INPUT, currencyExponent: 0 },
    { ...CREATE_INPUT, paymentOrderRef: "unsafe/ref" },
    { ...CREATE_INPUT, extra: "no" },
    new Proxy(CREATE_INPUT, {}),
    accessor,
  ]) assertInvalid(() => encodeXsdCreateRequest(input));
  assert.equal(reads, 0);
  assertInvalid(() => encodeXsdQueryRequest({ ...QUERY_INPUT, providerOrderRef: "other_order" }));
  const headerAccessor = [];
  Object.defineProperty(headerAccessor, "0", { enumerable: true, get() { reads += 1; return { name: "content-type", value: "application/x-www-form-urlencoded; charset=utf-8" }; } });
  headerAccessor.length = 1;
  assertInvalid(() => encodeXsdCallbackVerificationRequest({ ...CALLBACK_INPUT, headerEntries: headerAccessor }));
  assert.equal(reads, 0);
  assertInvalid(() => encodeXsdCallbackVerificationRequest({ ...CALLBACK_INPUT, attach: "unexpected" }));
  assertInvalid(() => decodeXsdQueryResponse({
    queryInput: QUERY_INPUT,
    providerResponse: { mch_order_no: "payment_order_1", status: "unknown" },
    receivedAt: NOW,
  }));
  assertInvalid(() => decodeVerifiedXsdCallback({
    callbackInput: CALLBACK_INPUT,
    providerResponse: { mch_order_no: "payment_order_1", partnerorderid: "provider_order_1", status: "1", mchId: "merchant_demo", amount: "12.00", attach: "unexpected" },
    merchantScopeDigest: MERCHANT_DIGEST,
    payloadDigest: PAYLOAD_DIGEST,
  }));
});
