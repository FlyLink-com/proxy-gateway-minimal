import assert from "node:assert/strict";
import test from "node:test";

import {
  PAYMENT_METHODS_V1,
  assertPaymentProviderAdapterContract,
  createCredentialScopedPaymentExecution,
  normalizePaymentMethod,
  normalizePaymentNextAction,
  normalizePaymentOperationResult,
  normalizePaymentProviderError,
  normalizeVerifiedPaymentEvent,
} from "../services/platform/payment-provider-adapter-contract.mjs";

const NOW = "2026-07-23T12:34:56.789Z";
const DIGEST = "a".repeat(64);
const ACTION_ORIGINS = ["https://pay.example.com"];

function validResult(overrides = {}) {
  return {
    providerOrderRef: "provider-order-1",
    status: "succeeded",
    chargeCertainty: "confirmed_charged",
    nextAction: null,
    occurredAt: NOW,
    ...overrides,
  };
}

function validEvent(overrides = {}) {
  return {
    providerEventRef: "provider-event-1",
    eventDedupeKey: "event-dedupe-1",
    eventType: "payment_succeeded",
    providerOrderRef: "provider-order-1",
    amountMinor: 3000,
    currency: "USD",
    merchantScopeDigest: DIGEST,
    payloadDigest: "b".repeat(64),
    occurredAt: NOW,
    verificationResult: "verified",
    ...overrides,
  };
}

function validCreateInput(overrides = {}) {
  return {
    paymentOrderRef: "payment-order-1",
    attemptRef: "attempt-1",
    providerRequestRef: "provider-request-1",
    paymentMethod: "alipay",
    amountMinor: 3000,
    currency: "USD",
    expectedPaidCoins: 30,
    quoteDigest: DIGEST,
    expiresAt: NOW,
    callbackRouteRef: "callback-route-1",
    returnRouteRef: null,
    ...overrides,
  };
}

function validCallbackInput(overrides = {}) {
  return {
    callbackRequestRef: "callback-request-1",
    receivedAt: NOW,
    bodyBase64: Buffer.from("callback").toString("base64"),
    headerEntries: [{ name: "x-provider-signature", value: "safe-value" }],
    ...overrides,
  };
}

function enabledAdapter(overrides = {}) {
  const adapter = {
    adapterKey: "provider_core",
    providerId: "provider_core",
    contractVersion: "v1",
    capabilities: {
      createRechargeOrder: true,
      queryPayment: true,
      verifyCallback: true,
      refund: true,
      reconcile: true,
      repeatCreateIdempotent: true,
    },
    supportedPaymentMethods: ["alipay", "wechat_pay"],
    createRechargeOrder: () => validResult(),
    queryPayment: () => validResult({ status: "pending", chargeCertainty: "possibly_charged" }),
    verifyAndNormalizeCallback: () => validEvent(),
    normalizeError: ({ operation }) => validProviderError({ operation }),
    webhookSuccessAck: () => ({
      statusCode: 200,
      contentType: "application/json",
      body: "{}",
    }),
    refund: () => validResult({ status: "reversed" }),
    reconcile: () => validResult(),
  };
  return { ...adapter, ...overrides };
}

function disabledAdapter(overrides = {}) {
  const empty = () => {};
  return enabledAdapter({
    contractVersion: "unverified",
    capabilities: {
      createRechargeOrder: false,
      queryPayment: false,
      verifyCallback: false,
      refund: false,
      reconcile: false,
      repeatCreateIdempotent: false,
    },
    supportedPaymentMethods: [],
    createRechargeOrder: empty,
    queryPayment: () => {},
    verifyAndNormalizeCallback: () => {},
    normalizeError: () => {},
    webhookSuccessAck: () => {},
    refund: () => {},
    reconcile: () => {},
    ...overrides,
  });
}

function validProviderError(overrides = {}) {
  return {
    code: "provider_timeout",
    operation: "query_payment",
    retryable: true,
    chargeCertainty: "unknown",
    providerOrderRef: null,
    occurredAt: NOW,
    ...overrides,
  };
}

function expectCode(code) {
  return (error) => {
    assert.equal(error?.message, code);
    return true;
  };
}

function proxyWithTrapCounters(target) {
  const counters = { get: 0, ownKeys: 0, descriptor: 0 };
  const proxy = new Proxy(target, {
    get(value, key, receiver) {
      counters.get += 1;
      return Reflect.get(value, key, receiver);
    },
    ownKeys(value) {
      counters.ownKeys += 1;
      return Reflect.ownKeys(value);
    },
    getOwnPropertyDescriptor(value, key) {
      counters.descriptor += 1;
      return Reflect.getOwnPropertyDescriptor(value, key);
    },
  });
  return { proxy, counters };
}

function assertNoProxyTraps(counters) {
  assert.deepEqual(counters, { get: 0, ownKeys: 0, descriptor: 0 });
}

async function createExecution(overrides = {}) {
  let loaderCalls = 0;
  const credentialMarker = "credential-marker-must-not-leak";
  const options = {
    profileRef: "profile-1",
    adapterKey: "provider_core",
    contractVersion: "v1",
    credentialProfileRef: "credential-profile-1",
    credentialLoader: {
      withCredential(binding, callback) {
        loaderCalls += 1;
        return callback({ opaque: credentialMarker });
      },
    },
    requestFn({ binding, credentialHandle, request }) {
      assert.equal(credentialHandle.opaque, credentialMarker);
      return { binding, request };
    },
    allowedActionOrigins: ACTION_ORIGINS,
    ...overrides,
  };
  return {
    execution: createCredentialScopedPaymentExecution(options),
    credentialMarker,
    getLoaderCalls: () => loaderCalls,
  };
}

test("exports exact frozen payment method vocabulary and performs no coercion", async () => {
  const module = await import("../services/platform/payment-provider-adapter-contract.mjs");
  assert.deepEqual(Object.keys(module).sort(), [
    "PAYMENT_METHODS_V1",
    "assertPaymentProviderAdapterContract",
    "createCredentialScopedPaymentExecution",
    "normalizePaymentMethod",
    "normalizePaymentNextAction",
    "normalizePaymentOperationResult",
    "normalizePaymentProviderError",
    "normalizeVerifiedPaymentEvent",
  ]);
  assert.deepEqual(PAYMENT_METHODS_V1, ["alipay", "wechat_pay"]);
  assert.ok(Object.isFrozen(PAYMENT_METHODS_V1));
  assert.equal(normalizePaymentMethod("alipay"), "alipay");
  assert.equal(normalizePaymentMethod("wechat_pay"), "wechat_pay");
  for (const value of [" alipay", "ALIPAY", "wechat-pay", "provider_core", 1, true, null, undefined]) {
    assert.throws(() => normalizePaymentMethod(value), expectCode("invalid_payment_method"));
  }
});

test("accepts enabled and fully disabled unverified canonical adapters", async () => {
  const normalized = assertPaymentProviderAdapterContract(enabledAdapter(), {
    allowedActionOrigins: ACTION_ORIGINS,
  });
  assert.ok(Object.isFrozen(normalized));
  assert.ok(Object.isFrozen(normalized.capabilities));
  assert.ok(Object.isFrozen(normalized.supportedPaymentMethods));
  assert.deepEqual(normalized.supportedPaymentMethods, PAYMENT_METHODS_V1);
  assert.deepEqual(await normalized.createRechargeOrder(validCreateInput()), validResult());

  const unverified = assertPaymentProviderAdapterContract(disabledAdapter());
  assert.equal(unverified.contractVersion, "unverified");
  assert.deepEqual(unverified.supportedPaymentMethods, []);
  for (const [method, args] of [
    ["createRechargeOrder", [validCreateInput()]],
    ["queryPayment", [{ paymentOrderRef: "p-1", attemptRef: "a-1", providerOrderRef: "o-1" }]],
    ["verifyAndNormalizeCallback", [validCallbackInput()]],
    ["webhookSuccessAck", [validEvent()]],
    ["refund", [{
      paymentOrderRef: "p-1",
      attemptRef: "a-1",
      providerOrderRef: "o-1",
      refundRequestRef: "r-1",
      amountMinor: 1,
      currency: "USD",
      reasonCode: "other",
    }]],
    ["reconcile", [{ paymentOrderRef: "p-1", attemptRef: "a-1", providerOrderRef: "o-1" }]],
  ]) {
    await assert.rejects(() => unverified[method](...args), expectCode("payment_provider_capability_disabled"));
  }
});

test("enforces all capability invariants and disables before compiled invocation", async () => {
  const invalidCapabilities = [
    { repeatCreateIdempotent: true, createRechargeOrder: false },
    { createRechargeOrder: "true" },
    { queryPayment: true },
    { verifyCallback: true },
    { refund: true },
    { reconcile: true },
  ];
  for (const changed of invalidCapabilities) {
    const base = disabledAdapter({ contractVersion: "v1" });
    base.capabilities = { ...base.capabilities, ...changed };
    assert.throws(
      () => assertPaymentProviderAdapterContract(base),
      expectCode("invalid_payment_provider_adapter"),
    );
  }
  assert.throws(
    () => assertPaymentProviderAdapterContract(enabledAdapter({
      supportedPaymentMethods: ["wechat_pay", "alipay"],
    })),
    expectCode("invalid_payment_provider_adapter"),
  );
  assert.throws(
    () => assertPaymentProviderAdapterContract(enabledAdapter({
      supportedPaymentMethods: ["alipay", "alipay"],
    })),
    expectCode("invalid_payment_provider_adapter"),
  );
  const same = () => validResult();
  assert.throws(
    () => assertPaymentProviderAdapterContract(enabledAdapter({
      queryPayment: same,
      verifyAndNormalizeCallback: same,
    })),
    expectCode("invalid_payment_provider_adapter"),
  );

  let called = 0;
  const adapter = disabledAdapter({
    contractVersion: "v1",
    refund() {
      called += 1;
    },
  });
  const normalized = assertPaymentProviderAdapterContract(adapter);
  await assert.rejects(
    () => normalized.refund({}),
    expectCode("payment_provider_capability_disabled"),
  );
  assert.equal(called, 0);
});

test("rejects hostile reflection surfaces without triggering Proxy traps", async () => {
  const root = proxyWithTrapCounters(enabledAdapter());
  assert.throws(
    () => assertPaymentProviderAdapterContract(root.proxy),
    expectCode("invalid_payment_provider_adapter"),
  );
  assertNoProxyTraps(root.counters);

  const capabilities = proxyWithTrapCounters(enabledAdapter().capabilities);
  assert.throws(
    () => assertPaymentProviderAdapterContract(enabledAdapter({ capabilities: capabilities.proxy })),
    expectCode("invalid_payment_provider_adapter"),
  );
  assertNoProxyTraps(capabilities.counters);

  const methods = proxyWithTrapCounters(["alipay"]);
  assert.throws(
    () => assertPaymentProviderAdapterContract(enabledAdapter({ supportedPaymentMethods: methods.proxy })),
    expectCode("invalid_payment_provider_adapter"),
  );
  assertNoProxyTraps(methods.counters);

  const fn = proxyWithTrapCounters(() => validResult());
  assert.throws(
    () => assertPaymentProviderAdapterContract(enabledAdapter({ queryPayment: fn.proxy })),
    expectCode("invalid_payment_provider_adapter"),
  );
  assertNoProxyTraps(fn.counters);

  for (const mutate of [
    (value) => { value.extra = true; },
    (value) => { value[Symbol("secret")] = true; },
    (value) => Object.defineProperty(value, "hidden", { value: true }),
    (value) => Object.defineProperty(value, "adapterKey", { get() { throw new Error("getter"); } }),
    (value) => Object.setPrototypeOf(value, null),
  ]) {
    const value = enabledAdapter();
    mutate(value);
    assert.throws(
      () => assertPaymentProviderAdapterContract(value),
      expectCode("invalid_payment_provider_adapter"),
    );
  }

  class MethodArray extends Array {}
  assert.throws(
    () => assertPaymentProviderAdapterContract(enabledAdapter({
      supportedPaymentMethods: new MethodArray("alipay"),
    })),
    expectCode("invalid_payment_provider_adapter"),
  );
  const cyclic = enabledAdapter();
  cyclic.capabilities.cycle = cyclic;
  assert.throws(
    () => assertPaymentProviderAdapterContract(cyclic),
    expectCode("invalid_payment_provider_adapter"),
  );
});

test("snapshots adapter metadata, methods, origins, inputs, and freezes detached results", async () => {
  let calls = 0;
  const original = () => {
    calls += 1;
    return validResult();
  };
  const adapter = enabledAdapter({ createRechargeOrder: original });
  const origins = [...ACTION_ORIGINS];
  const normalized = assertPaymentProviderAdapterContract(adapter, { allowedActionOrigins: origins });
  adapter.adapterKey = "mutated_key";
  adapter.createRechargeOrder = () => {
    throw new Error("mutated");
  };
  adapter.capabilities.createRechargeOrder = false;
  adapter.supportedPaymentMethods[0] = "wechat_pay";
  origins[0] = "https://evil.example";
  const input = validCreateInput();
  const pending = normalized.createRechargeOrder(input);
  input.amountMinor = 999;
  const result = await pending;
  assert.equal(normalized.adapterKey, "provider_core");
  assert.equal(calls, 1);
  assert.deepEqual(result, validResult());
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.nextAction) || result.nextAction === null);
  assert.notEqual(result, adapter);
});

test("validates create, query, callback, refund, and reconcile operation inputs", async () => {
  const seen = {};
  const adapter = assertPaymentProviderAdapterContract(enabledAdapter({
    createRechargeOrder(input) { seen.create = input; return validResult(); },
    queryPayment(input) { seen.query = input; return validResult(); },
    verifyAndNormalizeCallback(input) { seen.callback = input; return validEvent(); },
    refund(input) { seen.refund = input; return validResult({ status: "reversed" }); },
    reconcile(input) { seen.reconcile = input; return validResult(); },
  }), { allowedActionOrigins: ACTION_ORIGINS });
  await adapter.createRechargeOrder(validCreateInput());
  await adapter.queryPayment({ paymentOrderRef: "p-1", attemptRef: "a-1", providerOrderRef: "o-1" });
  await adapter.verifyAndNormalizeCallback(validCallbackInput());
  await adapter.refund({
    paymentOrderRef: "p-1",
    attemptRef: "a-1",
    providerOrderRef: "o-1",
    refundRequestRef: "r-1",
    amountMinor: 1,
    currency: "USD",
    reasonCode: "customer_request",
  });
  await adapter.reconcile({ paymentOrderRef: "p-1", attemptRef: "a-1", providerOrderRef: "o-1" });
  for (const value of Object.values(seen)) assert.ok(Object.isFrozen(value));

  for (const bad of [
    validCreateInput({ amountMinor: 0 }),
    validCreateInput({ amountMinor: -0 }),
    validCreateInput({ amountMinor: 1.5 }),
    validCreateInput({ amountMinor: Number.MAX_SAFE_INTEGER + 1 }),
    validCreateInput({ amountMinor: "3000" }),
    validCreateInput({ paymentMethod: "ALIPAY" }),
    validCreateInput({ currency: "usd" }),
    validCreateInput({ quoteDigest: DIGEST.toUpperCase() }),
    validCreateInput({ expiresAt: "2026-07-23T12:34:56Z" }),
    validCreateInput({ callbackRouteRef: "https://callback.example" }),
    validCreateInput({ returnRouteRef: undefined }),
    { ...validCreateInput(), extra: true },
  ]) {
    await assert.rejects(() => adapter.createRechargeOrder(bad), expectCode("invalid_payment_operation_input"));
  }
  for (const bad of [
    { paymentOrderRef: "p-1", attemptRef: "a-1", providerOrderRef: null },
    { paymentOrderRef: "p-1", attemptRef: "a-1", providerOrderRef: "o-1", extra: true },
  ]) {
    await assert.rejects(() => adapter.queryPayment(bad), expectCode("invalid_payment_operation_input"));
    await assert.rejects(() => adapter.reconcile(bad), expectCode("invalid_payment_operation_input"));
  }
  for (const reasonCode of ["duplicate_charge", "customer_request", "fraud", "service_failure", "other"]) {
    await adapter.refund({
      paymentOrderRef: "p-1", attemptRef: "a-1", providerOrderRef: "o-1",
      refundRequestRef: `refund-${reasonCode}`, amountMinor: 1, currency: "USD", reasonCode,
    });
  }
  await assert.rejects(() => adapter.refund({
    paymentOrderRef: "p-1", attemptRef: "a-1", providerOrderRef: "o-1",
    refundRequestRef: "r-1", amountMinor: 1, currency: "USD", reasonCode: "risk_rejection",
  }), expectCode("invalid_payment_operation_input"));
});

test("enforces callback body, header, forbidden-header, and hostile-layer bounds", async () => {
  const adapter = assertPaymentProviderAdapterContract(enabledAdapter());
  await adapter.verifyAndNormalizeCallback(validCallbackInput());
  const invalid = [
    validCallbackInput({ bodyBase64: "" }),
    validCallbackInput({ bodyBase64: "a===" }),
    validCallbackInput({ bodyBase64: "YQ" }),
    validCallbackInput({ bodyBase64: Buffer.alloc(1_048_577).toString("base64") }),
    validCallbackInput({ headerEntries: Array.from({ length: 65 }, () => ({ name: "x-a", value: "" })) }),
    validCallbackInput({ headerEntries: [{ name: "X-Test", value: "x" }] }),
    validCallbackInput({ headerEntries: [{ name: "bad header", value: "x" }] }),
    validCallbackInput({ headerEntries: [{ name: "x-test", value: "x\r\ninjected" }] }),
    validCallbackInput({ headerEntries: [{ name: "authorization", value: "secret" }] }),
    validCallbackInput({ headerEntries: [{ name: "cookie", value: "secret" }] }),
  ];
  for (const value of invalid) {
    await assert.rejects(
      () => adapter.verifyAndNormalizeCallback(value),
      expectCode("invalid_payment_operation_input"),
    );
  }
  for (const create of [
    () => proxyWithTrapCounters(validCallbackInput()),
    () => proxyWithTrapCounters(validCallbackInput().headerEntries),
    () => proxyWithTrapCounters(validCallbackInput().headerEntries[0]),
  ]) {
    const { proxy, counters } = create();
    let input;
    if (Array.isArray(proxy)) input = validCallbackInput({ headerEntries: proxy });
    else if (typeof proxy === "object" && proxy !== null && "callbackRequestRef" in Object.getPrototypeOf(proxy)) input = proxy;
    else input = validCallbackInput({ headerEntries: [proxy] });
    await assert.rejects(
      () => adapter.verifyAndNormalizeCallback(input),
      expectCode("invalid_payment_operation_input"),
    );
    assertNoProxyTraps(counters);
  }
});

test("normalizes null, redirect, and QR actions with compile-time HTTPS origin binding", () => {
  assert.equal(normalizePaymentNextAction(null, { allowedActionOrigins: ACTION_ORIGINS }), null);
  for (const type of ["redirect", "qr_code"]) {
    const value = { type, url: "https://pay.example.com/start?order=1", expiresAt: NOW };
    const result = normalizePaymentNextAction(value, { allowedActionOrigins: ACTION_ORIGINS });
    assert.deepEqual(result, value);
    assert.ok(Object.isFrozen(result));
  }
  for (const url of [
    "http://pay.example.com/start",
    "https://user:pass@pay.example.com/start",
    "https://pay.example.com/start#fragment",
    "https://localhost/start",
    "https://127.0.0.1/start",
    "https://[::1]/start",
    "https://pay.example.com./start",
    "https://éxample.com/start",
    "https://other.example/start",
    "data:text/html,x",
  ]) {
    assert.throws(
      () => normalizePaymentNextAction({ type: "redirect", url, expiresAt: NOW }, {
        allowedActionOrigins: ACTION_ORIGINS,
      }),
      expectCode("invalid_payment_next_action"),
    );
  }
  assert.throws(
    () => normalizePaymentNextAction(
      { type: "redirect", url: "https://pay.example.com", expiresAt: NOW, html: "<b>x</b>" },
      { allowedActionOrigins: ACTION_ORIGINS },
    ),
    expectCode("invalid_payment_next_action"),
  );
  const trapped = proxyWithTrapCounters({
    type: "redirect",
    url: "https://pay.example.com",
    expiresAt: NOW,
  });
  assert.throws(
    () => normalizePaymentNextAction(trapped.proxy, { allowedActionOrigins: ACTION_ORIGINS }),
    expectCode("invalid_payment_next_action"),
  );
  assertNoProxyTraps(trapped.counters);
});

test("accepts every legal operation result row and rejects illegal combinations", () => {
  const action = { type: "redirect", url: "https://pay.example.com/start", expiresAt: NOW };
  const legal = [
    validResult({ status: "entry_ready", chargeCertainty: "possibly_charged", nextAction: action }),
    validResult({ status: "pending", chargeCertainty: "possibly_charged" }),
    validResult(),
    validResult({ providerOrderRef: null, status: "failed_no_charge", chargeCertainty: "confirmed_no_charge" }),
    validResult({ status: "failed_no_charge", chargeCertainty: "confirmed_no_charge" }),
    validResult({ providerOrderRef: null, status: "reconciliation_required", chargeCertainty: "unknown" }),
    validResult({ status: "reconciliation_required", chargeCertainty: "possibly_charged" }),
    validResult({ status: "reconciliation_required", chargeCertainty: "confirmed_charged" }),
    validResult({ status: "reversed" }),
  ];
  for (const value of legal) {
    const normalized = normalizePaymentOperationResult(value, { allowedActionOrigins: ACTION_ORIGINS });
    assert.deepEqual(normalized, value);
    assert.ok(Object.isFrozen(normalized));
  }
  const illegal = [
    validResult({ status: "entry_unavailable", chargeCertainty: "unknown", providerOrderRef: null }),
    validResult({ status: "entry_ready", nextAction: null, chargeCertainty: "possibly_charged" }),
    validResult({ status: "pending", nextAction: action, chargeCertainty: "possibly_charged" }),
    validResult({ status: "succeeded", chargeCertainty: "unknown" }),
    validResult({ providerOrderRef: null }),
    validResult({ status: "failed_no_charge", chargeCertainty: "confirmed_no_charge", nextAction: action }),
    validResult({ status: "reversed", providerOrderRef: null }),
    { status: "succeeded", chargeCertainty: "confirmed_charged", nextAction: null, occurredAt: NOW },
    { ...validResult(), extra: true },
  ];
  for (const value of illegal) {
    assert.throws(
      () => normalizePaymentOperationResult(value, { allowedActionOrigins: ACTION_ORIGINS }),
      expectCode("invalid_payment_operation_result"),
    );
  }
});

test("brands verified events only through credential-scoped verify_callback execution", async () => {
  const raw = validEvent();
  assert.throws(
    () => normalizeVerifiedPaymentEvent(raw),
    expectCode("invalid_verified_payment_event"),
  );
  const { execution } = await createExecution();
  const branded = await execution.withCredential("verify_callback", () => raw);
  assert.deepEqual(normalizeVerifiedPaymentEvent(branded), raw);
  assert.equal(normalizeVerifiedPaymentEvent(branded), branded);
  assert.ok(Object.isFrozen(branded));
  assert.throws(
    () => normalizeVerifiedPaymentEvent({ ...branded }),
    expectCode("invalid_verified_payment_event"),
  );
});

test("validates all verified event types, nullable ref, digests, time, amount, and payload rejection", async () => {
  const { execution } = await createExecution();
  for (const eventType of [
    "payment_pending",
    "payment_succeeded",
    "payment_failed",
    "payment_refunded",
    "payment_chargeback",
  ]) {
    const event = await execution.withCredential("verify_callback", () => validEvent({ eventType }));
    assert.equal(event.eventType, eventType);
  }
  const nullable = await execution.withCredential(
    "verify_callback",
    () => validEvent({ providerEventRef: null }),
  );
  assert.equal(nullable.providerEventRef, null);
  for (const value of [
    validEvent({ eventDedupeKey: "" }),
    validEvent({ merchantScopeDigest: "A".repeat(64) }),
    validEvent({ payloadDigest: "a".repeat(63) }),
    validEvent({ occurredAt: "2026-07-23T12:34:56Z" }),
    validEvent({ amountMinor: 0 }),
    validEvent({ amountMinor: 1.5 }),
    validEvent({ eventType: "payment_unknown" }),
    { ...validEvent(), payload: "raw-secret" },
  ]) {
    await assert.rejects(
      () => execution.withCredential("verify_callback", () => value),
      (error) => error?.code === "provider_operation_failed",
    );
  }
});

test("normalizes safe webhook acknowledgements and requires branded events", async () => {
  const { execution } = await createExecution();
  const event = await execution.withCredential("verify_callback", () => validEvent());
  for (const contentType of ["text/plain", "application/json", "application/xml", "text/xml"]) {
    const adapter = assertPaymentProviderAdapterContract(enabledAdapter({
      webhookSuccessAck: () => ({ statusCode: 204, contentType, body: "ok" }),
    }));
    const ack = await adapter.webhookSuccessAck(event);
    assert.deepEqual(ack, { statusCode: 204, contentType, body: "ok" });
    assert.ok(Object.isFrozen(ack));
  }
  const adapter = assertPaymentProviderAdapterContract(enabledAdapter());
  await assert.rejects(
    () => adapter.webhookSuccessAck(validEvent()),
    expectCode("invalid_payment_webhook_ack"),
  );
  for (const ack of [
    { statusCode: 199, contentType: "text/plain", body: "" },
    { statusCode: 200, contentType: "text/html", body: "" },
    { statusCode: 200, contentType: "text/plain", body: "\0" },
    { statusCode: 200, contentType: "text/plain", body: "x".repeat(257) },
  ]) {
    const invalid = assertPaymentProviderAdapterContract(enabledAdapter({
      webhookSuccessAck: () => ack,
    }));
    await assert.rejects(
      () => invalid.webhookSuccessAck(event),
      expectCode("invalid_payment_webhook_ack"),
    );
  }
});

test("normalizes every provider code and enforces charge-certainty restrictions without leaks", () => {
  const codes = [
    "invalid_request",
    "unsupported_payment_method",
    "provider_contract_unverified",
    "provider_authentication_failed",
    "provider_authorization_failed",
    "provider_rate_limited",
    "provider_timeout",
    "provider_unavailable",
    "provider_rejected",
    "provider_verification_failed",
    "provider_idempotency_conflict",
    "provider_protocol_error",
    "provider_operation_failed",
  ];
  for (const code of codes) {
    const normalized = normalizePaymentProviderError(validProviderError({ code }));
    assert.ok(normalized instanceof Error);
    assert.ok(Object.isFrozen(normalized));
    assert.equal(normalized.message, code);
    assert.deepEqual(Object.keys(normalized).sort(), [
      "chargeCertainty",
      "code",
      "occurredAt",
      "operation",
      "providerOrderRef",
      "retryable",
    ]);
  }
  for (const code of ["invalid_request", "unsupported_payment_method", "provider_contract_unverified"]) {
    const normalized = normalizePaymentProviderError(validProviderError({
      code,
      retryable: false,
      chargeCertainty: "confirmed_no_charge",
      providerOrderRef: null,
    }));
    assert.equal(normalized.chargeCertainty, "confirmed_no_charge");
  }
  for (const value of [
    validProviderError({ code: "provider_timeout", chargeCertainty: "confirmed_no_charge" }),
    validProviderError({ chargeCertainty: "confirmed_charged", providerOrderRef: null }),
    validProviderError({ code: "risk_rejection" }),
    validProviderError({ retryable: "true" }),
    { ...validProviderError(), details: "credential-marker-must-not-leak" },
  ]) {
    assert.throws(
      () => normalizePaymentProviderError(value),
      expectCode("invalid_payment_provider_error"),
    );
  }
  const marker = "credential-marker-must-not-leak";
  const adapter = assertPaymentProviderAdapterContract(enabledAdapter({
    normalizeError() {
      throw new Error(marker);
    },
  }));
  const collapsed = adapter.normalizeError({
    operation: "query_payment",
    error: new Error(marker),
  });
  assert.equal(collapsed.code, "provider_operation_failed");
  assert.equal(collapsed.retryable, false);
  assert.equal(collapsed.chargeCertainty, "unknown");
  assert.equal(collapsed.providerOrderRef, null);
  assert.ok(!JSON.stringify(collapsed).includes(marker));
  assert.ok(!collapsed.message.includes(marker));
  assert.ok(!collapsed.stack.includes(marker));
});

test("credential execution covers five operations, exact bindings, fresh scopes, and no credential view", async () => {
  const bindings = [];
  let callbacks = 0;
  let callbackCredentialView;
  const { execution, credentialMarker, getLoaderCalls } = await createExecution({
    credentialLoader: {
      withCredential(binding, callback) {
        bindings.push(binding);
        return callback({ opaque: "credential-marker-must-not-leak" });
      },
    },
  });
  const operations = [
    "create_recharge_order",
    "query_payment",
    "verify_callback",
    "refund",
    "reconcile",
  ];
  for (const operation of operations) {
    const output = await execution.withCredential(operation, ({ binding, request }) => {
      callbacks += 1;
      callbackCredentialView = { binding, request };
      assert.equal(binding.operation, operation);
      assert.deepEqual(Object.keys({ binding, request }), ["binding", "request"]);
      if (operation === "verify_callback") return validEvent();
      return validResult();
    });
    assert.ok(Object.isFrozen(output));
  }
  assert.equal(callbacks, 5);
  assert.equal(getLoaderCalls(), 0);
  assert.equal(bindings.length, 5);
  for (const [index, binding] of bindings.entries()) {
    assert.deepEqual(binding, {
      profileRef: "profile-1",
      adapterKey: "provider_core",
      contractVersion: "v1",
      credentialProfileRef: "credential-profile-1",
      operation: operations[index],
    });
    assert.ok(Object.isFrozen(binding));
  }
  assert.ok(!JSON.stringify(callbackCredentialView).includes(credentialMarker));
  assert.deepEqual(Object.keys(execution), ["withCredential"]);
  assert.ok(Object.isFrozen(execution));
});

test("credential execution defends invalid ops, double callbacks, closure, mutation, Promises, and thenables", async () => {
  let loaderCalls = 0;
  let callbackCalls = 0;
  let retainedRequest;
  let requestCalls = 0;
  const options = {
    profileRef: "profile-1",
    adapterKey: "provider_core",
    contractVersion: "v1",
    credentialProfileRef: "credential-profile-1",
    credentialLoader: {
      async withCredential(binding, callback) {
        loaderCalls += 1;
        const first = await callback("opaque-credential-marker");
        await callback("second-credential-marker");
        return first;
      },
    },
    requestFn({ request }) {
      requestCalls += 1;
      return request;
    },
    allowedActionOrigins: ACTION_ORIGINS,
  };
  const execution = createCredentialScopedPaymentExecution(options);
  options.profileRef = "mutated";
  options.requestFn = () => { throw new Error("mutated"); };
  options.credentialLoader.withCredential = () => { throw new Error("mutated"); };
  await assert.rejects(
    () => execution.withCredential("unknown", () => validResult()),
    expectCode("unsupported_payment_operation"),
  );
  assert.equal(loaderCalls, 0);
  const result = await execution.withCredential("query_payment", async ({ binding, request }) => {
    callbackCalls += 1;
    assert.equal(binding.profileRef, "profile-1");
    retainedRequest = request;
    assert.deepEqual(await request({ ping: true }), { ping: true });
    return Promise.resolve(validResult());
  });
  assert.deepEqual(result, validResult());
  assert.equal(callbackCalls, 1);
  assert.equal(loaderCalls, 1);
  assert.equal(requestCalls, 1);
  await assert.rejects(
    () => retainedRequest({ after: true }),
    expectCode("payment_execution_scope_closed"),
  );

  let thenTrap = 0;
  const customThenable = Object.create(null);
  Object.defineProperty(customThenable, "then", {
    get() {
      thenTrap += 1;
      return () => {};
    },
  });
  await assert.rejects(
    () => execution.withCredential("query_payment", () => customThenable),
    (error) => error?.code === "provider_operation_failed",
  );
  assert.equal(thenTrap, 0);
});

test("rejects hostile execution layers and collapses loader callback and request failures", async () => {
  const base = {
    profileRef: "profile-1",
    adapterKey: "provider_core",
    contractVersion: "v1",
    credentialProfileRef: "credential-profile-1",
    credentialLoader: { withCredential: (_binding, callback) => callback("credential-marker") },
    requestFn: () => { throw new Error("request-secret-marker"); },
    allowedActionOrigins: ACTION_ORIGINS,
  };
  for (const create of [
    () => proxyWithTrapCounters(base),
    () => proxyWithTrapCounters(base.credentialLoader),
    () => proxyWithTrapCounters(base.allowedActionOrigins),
    () => proxyWithTrapCounters(base.requestFn),
  ]) {
    const { proxy, counters } = create();
    let value;
    if (typeof proxy === "function") value = { ...base, requestFn: proxy };
    else if (Array.isArray(proxy)) value = { ...base, allowedActionOrigins: proxy };
    else if (Object.getPrototypeOf(proxy) === Object.prototype && "withCredential" in proxy) {
      value = { ...base, credentialLoader: proxy };
    } else value = proxy;
    assert.throws(
      () => createCredentialScopedPaymentExecution(value),
      expectCode("invalid_payment_execution"),
    );
    assertNoProxyTraps(counters);
  }
  for (const value of [
    { ...base, extra: true },
    Object.assign(Object.create(null), base),
  ]) {
    assert.throws(
      () => createCredentialScopedPaymentExecution(value),
      expectCode("invalid_payment_execution"),
    );
  }
  const execution = createCredentialScopedPaymentExecution(base);
  const error = await execution.withCredential("query_payment", async ({ request }) => {
    await request({ secret: "request-secret-marker" });
    return validResult();
  }).catch((caught) => caught);
  assert.equal(error.code, "provider_operation_failed");
  assert.ok(!JSON.stringify(error).includes("secret-marker"));
  assert.ok(!error.message.includes("secret-marker"));
});

test("keeps query and callback in distinct callable slots without provider status mappings", () => {
  const adapter = assertPaymentProviderAdapterContract(enabledAdapter());
  assert.equal(typeof adapter.queryPayment, "function");
  assert.equal(typeof adapter.verifyAndNormalizeCallback, "function");
  assert.notEqual(adapter.queryPayment, adapter.verifyAndNormalizeCallback);
  assert.equal("providerStatusMap" in adapter, false);
  assert.equal("alipayStatusMap" in adapter, false);
  assert.equal("wechatPayStatusMap" in adapter, false);
});
