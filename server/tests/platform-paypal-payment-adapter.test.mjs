import assert from "node:assert/strict";
import test from "node:test";

import { assertPaymentProviderAdapterContract } from "../services/platform/payment-provider-adapter-contract.mjs";
import { createPayPalPaymentAdapter } from "../services/platform/paypal-payment-adapter.mjs";

const FALSE_CAPABILITIES = Object.freeze({
  createRechargeOrder: false,
  queryPayment: false,
  capturePayment: false,
  verifyCallback: false,
  refund: false,
  reconcile: false,
  repeatCreateIdempotent: false,
  repeatCaptureIdempotent: false,
});
const OPERATIONS = Object.freeze([
  ["createRechargeOrder", "create_recharge_order"],
  ["queryPayment", "query_payment"],
  ["capturePayment", "capture_payment"],
  ["verifyAndNormalizeCallback", "verify_callback"],
  ["webhookSuccessAck", "verify_callback"],
  ["refund", "refund"],
  ["reconcile", "reconcile"],
]);
const SENTINEL_TIME = "1970-01-01T00:00:00.000Z";

function assertUnverified(error, operation) {
  assert.equal(error?.code, "provider_contract_unverified");
  assert.equal(error?.operation, operation);
  assert.equal(error?.chargeCertainty, "confirmed_no_charge");
  assert.equal(error?.occurredAt, SENTINEL_TIME);
}

test("PayPal is the exact paypal_v1 unverified disabled Adapter", () => {
  const raw = createPayPalPaymentAdapter();
  assert.deepEqual(Object.keys(raw), [
    "adapterKey", "providerId", "contractVersion", "capabilities",
    "supportedPaymentMethods", "createRechargeOrder", "queryPayment",
    "capturePayment", "verifyAndNormalizeCallback", "normalizeError",
    "webhookSuccessAck", "refund", "reconcile",
  ]);
  assert.equal(raw.adapterKey, "paypal_v1");
  assert.equal(raw.providerId, "paypal_commerce");
  assert.equal(raw.contractVersion, "unverified");
  assert.deepEqual(raw.capabilities, FALSE_CAPABILITIES);
  assert.deepEqual(raw.supportedPaymentMethods, []);
  assert.deepEqual(assertPaymentProviderAdapterContract(raw).capabilities, FALSE_CAPABILITIES);
});

test("PayPal rejects hostile options and operations without reading input or scope", () => {
  const optionCalls = { get: 0, ownKeys: 0, descriptor: 0 };
  const hostileOptions = new Proxy({}, {
    get() { optionCalls.get += 1; throw new Error("synthetic-secret-marker"); },
    ownKeys() { optionCalls.ownKeys += 1; throw new Error("synthetic-secret-marker"); },
    getOwnPropertyDescriptor() { optionCalls.descriptor += 1; throw new Error("synthetic-secret-marker"); },
  });
  assert.throws(() => createPayPalPaymentAdapter(hostileOptions), /invalid_payment_provider_adapter/u);
  assert.deepEqual(optionCalls, { get: 0, ownKeys: 0, descriptor: 0 });

  const counters = { get: 0, ownKeys: 0, descriptor: 0, scope: 0, clock: 0 };
  const raw = createPayPalPaymentAdapter({
    executionScope: { withCredential() { counters.scope += 1; } },
    nowFn() { counters.clock += 1; return "unexpected"; },
  });
  for (const [method, operation] of OPERATIONS) {
    const input = new Proxy({ marker: "synthetic-secret-marker" }, {
      get(target, key, receiver) { counters.get += 1; return Reflect.get(target, key, receiver); },
      ownKeys(target) { counters.ownKeys += 1; return Reflect.ownKeys(target); },
      getOwnPropertyDescriptor(target, key) { counters.descriptor += 1; return Reflect.getOwnPropertyDescriptor(target, key); },
    });
    assert.throws(() => raw[method](input), (error) => {
      assertUnverified(error, operation);
      assert.doesNotMatch(JSON.stringify(error), /synthetic-secret-marker/u);
      return true;
    });
  }
  assert.deepEqual(counters, { get: 0, ownKeys: 0, descriptor: 0, scope: 0, clock: 0 });
});

test("PayPal normalizes capture_payment without leaking the raw error", () => {
  const raw = createPayPalPaymentAdapter();
  const marker = "synthetic-secret-marker";
  assert.deepEqual(raw.normalizeError({ operation: "capture_payment", error: new Error(marker) }), {
    code: "provider_contract_unverified",
    operation: "capture_payment",
    retryable: false,
    chargeCertainty: "confirmed_no_charge",
    providerOrderRef: null,
    occurredAt: SENTINEL_TIME,
  });
  const normalized = assertPaymentProviderAdapterContract(raw);
  const error = normalized.normalizeError({ operation: "capture_payment", error: new Error(marker) });
  assertUnverified(error, "capture_payment");
  assert.doesNotMatch(JSON.stringify(error), new RegExp(marker, "u"));
});
