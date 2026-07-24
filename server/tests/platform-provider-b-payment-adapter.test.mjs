import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { assertPaymentProviderAdapterContract } from "../services/platform/payment-provider-adapter-contract.mjs";
import { createProviderBPaymentAdapter } from "../services/platform/provider-b-payment-adapter.mjs";

const NOW = "2026-07-23T12:34:56.789Z";
const operations = [
  ["createRechargeOrder", "create_recharge_order"],
  ["queryPayment", "query_payment"],
  ["capturePayment", "capture_payment"],
  ["verifyAndNormalizeCallback", "verify_callback"],
  ["webhookSuccessAck", "verify_callback"],
  ["refund", "refund"],
  ["reconcile", "reconcile"],
];

function assertUnverified(error, operation) {
  assert.ok(error instanceof Error);
  assert.equal(error.message, "provider_contract_unverified");
  assert.deepEqual(Object.keys(error).sort(), [
    "chargeCertainty", "code", "occurredAt", "operation", "providerOrderRef", "retryable",
  ]);
  assert.deepEqual({ ...error }, {
    code: "provider_contract_unverified", operation, retryable: false,
    chargeCertainty: "confirmed_no_charge", providerOrderRef: null, occurredAt: NOW,
  });
}

function assertInvalidFactoryOptions(value, marker) {
  assert.throws(() => createProviderBPaymentAdapter(value), (error) => {
    assert.equal(error?.message, "invalid_payment_provider_adapter");
    assert.doesNotMatch(String(error), new RegExp(marker));
    return true;
  });
}

test("Provider B rejects Proxy factory options without invoking traps or leaking errors", () => {
  const marker = "provider-b-options-marker";
  const trapCalls = { get: 0, ownKeys: 0, descriptor: 0 };
  const proxyOptions = new Proxy({ nowFn: () => NOW }, {
    get() { trapCalls.get += 1; throw new Error(marker); },
    ownKeys() { trapCalls.ownKeys += 1; throw new Error(marker); },
    getOwnPropertyDescriptor() { trapCalls.descriptor += 1; throw new Error(marker); },
  });
  assertInvalidFactoryOptions(proxyOptions, marker);
  assert.deepEqual(trapCalls, { get: 0, ownKeys: 0, descriptor: 0 });
});

test("Provider B rejects accessor factory options without invoking getters or leaking errors", () => {
  const marker = "provider-b-options-marker";
  let getterCalls = 0;
  const accessorOptions = {};
  Object.defineProperty(accessorOptions, "nowFn", {
    enumerable: true,
    get() { getterCalls += 1; throw new Error(marker); },
  });
  assertInvalidFactoryOptions(accessorOptions, marker);
  assert.equal(getterCalls, 0);
});

test("Provider B rejects factory options outside the closed ordinary shape", () => {
  const marker = "provider-b-options-marker";
  assertInvalidFactoryOptions({ nowFn: () => NOW, extra: marker }, marker);
  assertInvalidFactoryOptions({ [Symbol(marker)]: true }, marker);
  assertInvalidFactoryOptions(Object.create(null), marker);
  assertInvalidFactoryOptions([], marker);
  assertInvalidFactoryOptions(null, marker);
});

test("Provider B is a frozen, distinct provisional disabled adapter", () => {
  const raw = createProviderBPaymentAdapter({ nowFn: () => NOW });
  assert.equal(raw.adapterKey, "provisional_provider_b_v1");
  assert.equal(raw.providerId, "provisional_provider_b");
  assert.equal(raw.contractVersion, "unverified");
  assert.deepEqual(raw.capabilities, {
    createRechargeOrder: false, queryPayment: false, capturePayment: false,
    verifyCallback: false, refund: false, reconcile: false,
    repeatCreateIdempotent: false, repeatCaptureIdempotent: false,
  });
  const normalized = assertPaymentProviderAdapterContract(raw);
  assert.ok(Object.isFrozen(normalized));
  assert.ok(Object.isFrozen(normalized.capabilities));
  assert.ok(Object.isFrozen(normalized.supportedPaymentMethods));
  assert.deepEqual(normalized.supportedPaymentMethods, []);
  assert.notEqual(raw.queryPayment, raw.verifyAndNormalizeCallback);
});

test("Provider B direct operations fail closed without reading input or execution scope", () => {
  let scopeCalls = 0;
  const executionScope = {
    credentialLoader() { scopeCalls += 1; },
    transport() { scopeCalls += 1; },
  };
  const raw = createProviderBPaymentAdapter({ executionScope, nowFn: () => NOW });
  for (const [method, operation] of operations) {
    const counters = { get: 0, ownKeys: 0, descriptor: 0 };
    const input = new Proxy({ secret: "synthetic-secret-marker" }, {
      get(target, key, receiver) { counters.get += 1; return Reflect.get(target, key, receiver); },
      ownKeys(target) { counters.ownKeys += 1; return Reflect.ownKeys(target); },
      getOwnPropertyDescriptor(target, key) { counters.descriptor += 1; return Reflect.getOwnPropertyDescriptor(target, key); },
    });
    assert.throws(() => raw[method](input), (error) => {
      assertUnverified(error, operation);
      assert.doesNotMatch(JSON.stringify(error), /synthetic-secret-marker/);
      return true;
    });
    assert.deepEqual(counters, { get: 0, ownKeys: 0, descriptor: 0 });
  }
  assert.equal(scopeCalls, 0);
});

test("Provider B normalized disabled methods reject before raw operation execution", async () => {
  const raw = createProviderBPaymentAdapter({ nowFn: () => NOW });
  let rawCalls = 0;
  for (const [method] of operations) {
    const original = raw[method];
    raw[method] = (...args) => { rawCalls += 1; return original(...args); };
  }
  const normalized = assertPaymentProviderAdapterContract(raw);
  for (const [method] of operations) {
    await assert.rejects(() => normalized[method]({}), /payment_provider_capability_disabled/);
  }
  assert.equal(rawCalls, 0);
});

test("Provider B exposes a plain safe raw error record and preserves it through the normalized wrapper", () => {
  const raw = createProviderBPaymentAdapter({ nowFn: () => NOW });
  const rawRecord = raw.normalizeError({ operation: "refund", error: new Error("ignored") });
  assert.equal(rawRecord instanceof Error, false);
  assert.deepEqual(rawRecord, {
    code: "provider_contract_unverified", operation: "refund", retryable: false,
    chargeCertainty: "confirmed_no_charge", providerOrderRef: null, occurredAt: NOW,
  });
  const normalized = assertPaymentProviderAdapterContract(raw);
  assertUnverified(normalized.normalizeError({ operation: "refund", error: new Error("ignored") }), "refund");
  const invalidWrapper = normalized.normalizeError({ operation: "not-an-operation", error: new Error("ignored") });
  assert.equal(invalidWrapper.message, "provider_operation_failed");
  assert.equal(invalidWrapper.operation, "reconcile");
  const fallback = raw.normalizeError({ operation: "not-an-operation" });
  assert.deepEqual(fallback, {
    code: "provider_operation_failed", operation: "reconcile", retryable: false,
    chargeCertainty: "unknown", providerOrderRef: null, occurredAt: NOW,
  });
});

test("Provider B fixture contains no provider integration assumptions", async () => {
  const source = await readFile(new URL("../services/platform/provider-b-payment-adapter.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /endpoint|signature|merchant|credential|\bstatus\b|callback(?:url|path)/i);
});
