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
const PAYLOAD_DIGEST = "b".repeat(64);
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
    sourceType: "callback",
    providerEventRef: "provider-event-1",
    eventDedupeKey: "event-dedupe-1",
    eventType: "payment_succeeded",
    paymentOrderRef: "payment-order-1",
    providerOrderRef: "provider-order-1",
    providerCaptureRef: "provider-capture-1",
    providerRefundRef: null,
    amountMinor: 3000,
    currency: "USD",
    currencyExponent: 2,
    merchantScopeDigest: DIGEST,
    payloadDigest: PAYLOAD_DIGEST,
    occurredAt: NOW,
    verificationResult: "verified",
    ...overrides,
  };
}

function validCaptureFact(overrides = {}) {
  return validEvent({
    sourceType: "authenticated_capture_response",
    providerEventRef: null,
    eventDedupeKey: "capture-dedupe-1",
    providerRefundRef: null,
    ...overrides,
  });
}

function validCreateInput(overrides = {}) {
  return {
    paymentOrderRef: "payment-order-1",
    attemptRef: "attempt-1",
    providerRequestRef: "provider-request-1",
    paymentMethod: "alipay",
    amountMinor: 3000,
    currency: "USD",
    currencyExponent: 2,
    expectedPaidCoins: 30,
    quoteDigest: DIGEST,
    expiresAt: NOW,
    callbackRouteRef: "callback-route-1",
    returnRouteRef: null,
    ...overrides,
  };
}

function validCaptureInput(overrides = {}) {
  return {
    paymentOrderRef: "payment-order-1",
    attemptRef: "attempt-1",
    providerOrderRef: "provider-order-1",
    captureRequestRef: "capture-request-1",
    amountMinor: 3000,
    currency: "USD",
    currencyExponent: 2,
    ...overrides,
  };
}

function validCaptureOutcome(overrides = {}) {
  return {
    operationResult: validResult(),
    paymentFact: null,
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
    adapterKey: "provider_core_adapter",
    providerId: "provider_core",
    contractVersion: "v1",
    capabilities: {
      createRechargeOrder: true,
      queryPayment: true,
      capturePayment: true,
      verifyCallback: true,
      refund: true,
      reconcile: true,
      repeatCreateIdempotent: true,
      repeatCaptureIdempotent: true,
    },
    supportedPaymentMethods: ["alipay", "wechat_pay", "paypal"],
    createRechargeOrder: () => validResult(),
    queryPayment: () => validResult({ status: "pending", chargeCertainty: "possibly_charged" }),
    capturePayment: () => validCaptureOutcome({
      operationResult: validResult({
        status: "pending",
        chargeCertainty: "possibly_charged",
      }),
    }),
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
      capturePayment: false,
      verifyCallback: false,
      refund: false,
      reconcile: false,
      repeatCreateIdempotent: false,
      repeatCaptureIdempotent: false,
    },
    supportedPaymentMethods: [],
    createRechargeOrder: empty,
    queryPayment: () => {},
    capturePayment: () => {},
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

function poisonNativePromiseConstructor(promise, mode, marker, counters) {
  if (mode === "throwing_constructor_getter") {
    Object.defineProperty(promise, "constructor", {
      get() {
        counters.constructor += 1;
        throw new Error(marker);
      },
    });
    return promise;
  }
  const constructor = {};
  Object.defineProperty(constructor, Symbol.species, {
    get() {
      counters.species += 1;
      throw new Error(marker);
    },
  });
  Object.defineProperty(promise, "constructor", {
    value: constructor,
  });
  return promise;
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
      const evidence = (
        binding.operation === "capture_payment"
        || binding.operation === "verify_callback"
      ) ? {
          merchantScopeDigest: DIGEST,
          payloadDigest: PAYLOAD_DIGEST,
        }
        : null;
      return {
        response: { binding, request },
        evidence,
      };
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

async function createBrandedEvent(overrides = {}) {
  const { execution } = await createExecution();
  return executeCallbackFact(execution, validEvent(overrides));
}

async function executeCallbackFact(execution, paymentFact = validEvent()) {
  return execution.withCredential("verify_callback", async ({ request }) => {
    const { transportReceipt } = await request({ callbackRequestRef: "callback-request-1" });
    return {
      transportReceipt,
      paymentFact,
    };
  });
}

async function createBrandedCaptureFact(overrides = {}) {
  const { execution } = await createExecution();
  const outcome = await executeCaptureOutcome(
    execution,
    validCaptureOutcome({ paymentFact: validCaptureFact(overrides) }),
  );
  return outcome.paymentFact;
}

async function executeCaptureOutcome(execution, captureOutcome = validCaptureOutcome()) {
  return execution.withCredential("capture_payment", async ({ request }) => {
    const { transportReceipt } = await request({ captureRequestRef: "capture-request-1" });
    return {
      transportReceipt,
      captureOutcome,
    };
  });
}

test("payment methods include paypal while provider identity remains distinct", async () => {
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
  assert.deepEqual(PAYMENT_METHODS_V1, ["alipay", "wechat_pay", "paypal"]);
  assert.ok(Object.isFrozen(PAYMENT_METHODS_V1));
  assert.equal(normalizePaymentMethod("alipay"), "alipay");
  assert.equal(normalizePaymentMethod("wechat_pay"), "wechat_pay");
  assert.equal(normalizePaymentMethod("paypal"), "paypal");
  for (const providerId of PAYMENT_METHODS_V1) {
    assert.throws(
      () => assertPaymentProviderAdapterContract(enabledAdapter({ providerId })),
      expectCode("invalid_payment_provider_adapter"),
    );
  }
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
    ["capturePayment", [validCaptureInput()]],
    ["verifyAndNormalizeCallback", [validCallbackInput()]],
    ["webhookSuccessAck", [validEvent()]],
    ["refund", [{
      paymentOrderRef: "p-1",
      attemptRef: "a-1",
      providerOrderRef: "o-1",
      refundRequestRef: "r-1",
      amountMinor: 1,
      currency: "USD",
      currencyExponent: 2,
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
    { repeatCaptureIdempotent: true, capturePayment: false },
    { createRechargeOrder: "true" },
    { queryPayment: true },
    { capturePayment: true },
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
  assert.throws(
    () => assertPaymentProviderAdapterContract(enabledAdapter({
      adapterKey: "provider_core",
      providerId: "provider_core",
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

test("repeat-capture idempotency requires capture capability", () => {
  const adapter = disabledAdapter({ contractVersion: "v1" });
  adapter.capabilities = {
    ...adapter.capabilities,
    repeatCaptureIdempotent: true,
  };
  assert.throws(
    () => assertPaymentProviderAdapterContract(adapter),
    expectCode("invalid_payment_provider_adapter"),
  );
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

  const revokedMethods = Proxy.revocable(["alipay"], {});
  revokedMethods.revoke();
  assert.throws(
    () => assertPaymentProviderAdapterContract(enabledAdapter({
      supportedPaymentMethods: revokedMethods.proxy,
    })),
    expectCode("invalid_payment_provider_adapter"),
  );

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
  assert.equal(normalized.adapterKey, "provider_core_adapter");
  assert.equal(calls, 1);
  assert.deepEqual(result, validResult());
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.nextAction) || result.nextAction === null);
  assert.notEqual(result, adapter);
});

test("validates create, query, capture, callback, refund, and reconcile operation inputs", async () => {
  const seen = {};
  const brandedCallbackEvent = await createBrandedEvent();
  const brandedCaptureFact = await createBrandedCaptureFact();
  const adapter = assertPaymentProviderAdapterContract(enabledAdapter({
    createRechargeOrder(input) { seen.create = input; return validResult(); },
    queryPayment(input) { seen.query = input; return validResult(); },
    capturePayment(input) {
      seen.capture = input;
      return validCaptureOutcome({ paymentFact: brandedCaptureFact });
    },
    verifyAndNormalizeCallback(input) { seen.callback = input; return brandedCallbackEvent; },
    refund(input) { seen.refund = input; return validResult({ status: "reversed" }); },
    reconcile(input) { seen.reconcile = input; return validResult(); },
  }), { allowedActionOrigins: ACTION_ORIGINS });
  await adapter.createRechargeOrder(validCreateInput());
  await adapter.queryPayment({ paymentOrderRef: "p-1", attemptRef: "a-1", providerOrderRef: "o-1" });
  await adapter.capturePayment(validCaptureInput());
  await adapter.verifyAndNormalizeCallback(validCallbackInput());
  await adapter.refund({
    paymentOrderRef: "p-1",
    attemptRef: "a-1",
    providerOrderRef: "o-1",
    refundRequestRef: "r-1",
    amountMinor: 1,
    currency: "USD",
    currencyExponent: 2,
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
      currencyExponent: 2,
    });
  }
  await assert.rejects(() => adapter.refund({
    paymentOrderRef: "p-1", attemptRef: "a-1", providerOrderRef: "o-1",
    refundRequestRef: "r-1", amountMinor: 1, currency: "USD", currencyExponent: 2,
    reasonCode: "risk_rejection",
  }), expectCode("invalid_payment_operation_input"));
});

test("create refund capture and verified facts require an explicit bounded currency exponent", async () => {
  const adapter = assertPaymentProviderAdapterContract(enabledAdapter(), {
    allowedActionOrigins: ACTION_ORIGINS,
  });
  for (const currencyExponent of [-1, 0, 2, 3, 9, 10]) {
    const shouldPass = currencyExponent >= 0 && currencyExponent <= 9;
    const inputs = [
      () => adapter.createRechargeOrder(validCreateInput({ currencyExponent })),
      () => adapter.refund({
        paymentOrderRef: "p-1",
        attemptRef: "a-1",
        providerOrderRef: "provider-order-1",
        refundRequestRef: "r-1",
        amountMinor: 1,
        currency: "USD",
        currencyExponent,
        reasonCode: "other",
      }),
      () => adapter.capturePayment(validCaptureInput({ currencyExponent })),
    ];
    for (const invoke of inputs) {
      if (shouldPass) await assert.doesNotReject(invoke);
      else {
        await assert.rejects(
          invoke,
          expectCode("invalid_payment_operation_input"),
        );
      }
    }
    const { execution } = await createExecution();
    if (shouldPass) {
      const fact = await executeCallbackFact(
        execution,
        validEvent({ currencyExponent }),
      );
      assert.equal(fact.currencyExponent, currencyExponent);
    } else {
      await assert.rejects(
        () => executeCallbackFact(execution, validEvent({ currencyExponent })),
        (error) => error?.code === "provider_operation_failed",
      );
    }
  }

  const missingCreate = validCreateInput();
  delete missingCreate.currencyExponent;
  const missingCapture = validCaptureInput();
  delete missingCapture.currencyExponent;
  const missingRefund = {
    paymentOrderRef: "p-1",
    attemptRef: "a-1",
    providerOrderRef: "provider-order-1",
    refundRequestRef: "r-1",
    amountMinor: 1,
    currency: "USD",
    currencyExponent: 2,
    reasonCode: "other",
  };
  delete missingRefund.currencyExponent;
  for (const invoke of [
    () => adapter.createRechargeOrder(missingCreate),
    () => adapter.capturePayment(missingCapture),
    () => adapter.refund(missingRefund),
  ]) {
    await assert.rejects(invoke, expectCode("invalid_payment_operation_input"));
  }
  const missingFact = validEvent();
  delete missingFact.currencyExponent;
  const { execution } = await createExecution();
  await assert.rejects(
    () => executeCallbackFact(execution, missingFact),
    (error) => error?.code === "provider_operation_failed",
  );
});

test("capture is an exact separately gated canonical operation", async () => {
  const counters = { loader: 0, request: 0, clock: 0 };
  const execution = createCredentialScopedPaymentExecution({
    profileRef: "profile-1",
    adapterKey: "provider_core",
    contractVersion: "v1",
    credentialProfileRef: "credential-profile-1",
    credentialLoader: {
      withCredential(binding, callback) {
        counters.loader += 1;
        assert.equal(binding.operation, "capture_payment");
        return callback("opaque-credential");
      },
    },
    requestFn({ binding }) {
      counters.request += 1;
      assert.equal(binding.operation, "capture_payment");
      return {
        response: { accepted: true },
        evidence: {
          merchantScopeDigest: DIGEST,
          payloadDigest: PAYLOAD_DIGEST,
        },
      };
    },
    allowedActionOrigins: ACTION_ORIGINS,
  });
  const compiledCapture = (input) => {
    counters.clock += 1;
    assert.ok(Object.isFrozen(input));
    assert.deepEqual(Object.keys(input), [
      "paymentOrderRef",
      "attemptRef",
      "providerOrderRef",
      "captureRequestRef",
      "amountMinor",
      "currency",
      "currencyExponent",
    ]);
    return execution.withCredential("capture_payment", async ({ request }) => {
      const { transportReceipt } = await request({ captureRequestRef: input.captureRequestRef });
      return {
        transportReceipt,
        captureOutcome: validCaptureOutcome({
          operationResult: validResult({ providerOrderRef: input.providerOrderRef }),
          paymentFact: validCaptureFact({
            paymentOrderRef: input.paymentOrderRef,
            providerOrderRef: input.providerOrderRef,
            amountMinor: input.amountMinor,
            currency: input.currency,
            currencyExponent: input.currencyExponent,
          }),
        }),
      };
    });
  };

  const disabledRaw = disabledAdapter({
    capturePayment: compiledCapture,
  });
  const disabled = assertPaymentProviderAdapterContract(disabledRaw);
  await assert.rejects(
    () => disabled.capturePayment(validCaptureInput()),
    expectCode("payment_provider_capability_disabled"),
  );
  assert.deepEqual(counters, { loader: 0, request: 0, clock: 0 });

  const enabled = assertPaymentProviderAdapterContract(enabledAdapter({
    capturePayment: compiledCapture,
  }));
  const outcome = await enabled.capturePayment(validCaptureInput());
  assert.equal(outcome.paymentFact.sourceType, "authenticated_capture_response");
  assert.deepEqual(counters, { loader: 1, request: 1, clock: 1 });
});

test("enforces callback body, header, forbidden-header, and hostile-layer bounds", async () => {
  const brandedCallbackEvent = await createBrandedEvent();
  const adapter = assertPaymentProviderAdapterContract(enabledAdapter({
    verifyAndNormalizeCallback: () => brandedCallbackEvent,
  }));
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
  const mappedLoopbackOrigin = "https://[::ffff:7f00:1]";
  assert.throws(
    () => assertPaymentProviderAdapterContract(enabledAdapter(), {
      allowedActionOrigins: [mappedLoopbackOrigin],
    }),
    expectCode("invalid_payment_provider_adapter"),
  );
  assert.throws(
    () => normalizePaymentNextAction({
      type: "redirect",
      url: `${mappedLoopbackOrigin}/start`,
      expiresAt: NOW,
    }, {
      allowedActionOrigins: [mappedLoopbackOrigin],
    }),
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

test("credential execution brands callback and capture facts with distinct provenance", async () => {
  const callbackFact = await createBrandedEvent();
  const captureFact = await createBrandedCaptureFact();
  assert.equal(normalizeVerifiedPaymentEvent(callbackFact), callbackFact);
  assert.equal(normalizeVerifiedPaymentEvent(captureFact), captureFact);
  assert.equal(callbackFact.sourceType, "callback");
  assert.equal(captureFact.sourceType, "authenticated_capture_response");
  assert.notEqual(callbackFact, captureFact);
  assert.ok(Object.isFrozen(callbackFact));
  assert.ok(Object.isFrozen(captureFact));
  assert.deepEqual(Object.keys(callbackFact), [
    "sourceType",
    "providerEventRef",
    "eventDedupeKey",
    "eventType",
    "paymentOrderRef",
    "providerOrderRef",
    "providerCaptureRef",
    "providerRefundRef",
    "amountMinor",
    "currency",
    "currencyExponent",
    "merchantScopeDigest",
    "payloadDigest",
    "occurredAt",
    "verificationResult",
  ]);
});

test("fact provenance requires a successful same-scope same-operation transport receipt", async () => {
  const raw = validEvent();
  assert.throws(
    () => normalizeVerifiedPaymentEvent(raw),
    expectCode("invalid_verified_payment_event"),
  );
  const { execution } = await createExecution();
  const branded = await executeCallbackFact(execution, raw);
  assert.deepEqual(normalizeVerifiedPaymentEvent(branded), raw);
  assert.equal(normalizeVerifiedPaymentEvent(branded), branded);
  assert.throws(
    () => normalizeVerifiedPaymentEvent({ ...branded }),
    expectCode("invalid_verified_payment_event"),
  );
});

test("failed zero-request reused and cross-scope receipts cannot mint facts", async () => {
  const { execution } = await createExecution();
  await assert.rejects(
    () => execution.withCredential("verify_callback", () => ({
      transportReceipt: Object.freeze({}),
      paymentFact: validEvent(),
    })),
    (error) => error?.code === "provider_operation_failed",
  );
  await assert.rejects(
    () => execution.withCredential("capture_payment", () => ({
      transportReceipt: Object.freeze({}),
      captureOutcome: validCaptureOutcome({
        paymentFact: validCaptureFact(),
      }),
    })),
    (error) => error?.code === "provider_operation_failed",
  );
  await assert.rejects(
    () => execution.withCredential("verify_callback", async ({ request }) => {
      const { transportReceipt } = await request({
        callbackRequestRef: "callback-request-null-fact",
      });
      return { transportReceipt, paymentFact: null };
    }),
    (error) => error?.code === "provider_operation_failed",
  );

  let retainedReceipt;
  const first = await execution.withCredential("verify_callback", async ({ request }) => {
    const requestResult = await request({ callbackRequestRef: "callback-request-1" });
    retainedReceipt = requestResult.transportReceipt;
    return {
      transportReceipt: retainedReceipt,
      paymentFact: validEvent(),
    };
  });
  assert.equal(first.sourceType, "callback");
  await assert.rejects(
    () => execution.withCredential("verify_callback", () => ({
      transportReceipt: retainedReceipt,
      paymentFact: validEvent(),
    })),
    (error) => error?.code === "provider_operation_failed",
  );

  let failedReceipt;
  const failed = await createExecution({
    requestFn() {
      throw new Error("transport-secret");
    },
  });
  await assert.rejects(
    () => failed.execution.withCredential("verify_callback", async ({ request }) => {
      failedReceipt = await request({ callbackRequestRef: "callback-request-1" })
        .then((result) => result.transportReceipt, () => undefined);
      return {
        transportReceipt: failedReceipt,
        paymentFact: validEvent(),
      };
    }),
    (error) => error?.code === "provider_operation_failed",
  );
  assert.equal(failedReceipt, undefined);
  assert.throws(
    () => normalizeVerifiedPaymentEvent(validEvent()),
    expectCode("invalid_verified_payment_event"),
  );
});

test("transport receipt attack matrix rejects fabricated cross-operation digest mismatch custom thenable late fulfillment and post-closure use", async () => {
  const { execution } = await createExecution();
  await assert.rejects(
    () => execution.withCredential("verify_callback", () => ({
      transportReceipt: Object.freeze({}),
      paymentFact: validEvent(),
    })),
    (error) => error?.code === "provider_operation_failed",
  );

  const malformedTransports = [
    { response: { accepted: true }, evidence: null },
    { response: { accepted: true } },
    {
      response: { accepted: true },
      evidence: {
        merchantScopeDigest: DIGEST,
        payloadDigest: PAYLOAD_DIGEST,
      },
      extra: true,
    },
  ];
  for (const transportValue of malformedTransports) {
    const malformed = await createExecution({
      requestFn: () => transportValue,
    });
    await assert.rejects(
      () => executeCallbackFact(malformed.execution),
      (error) => error?.code === "provider_operation_failed",
    );
  }

  for (const mode of ["sync", "promise"]) {
    for (const digestField of ["merchantScopeDigest", "payloadDigest"]) {
      const transport = await createExecution({
        requestFn() {
          const envelope = {
            response: { accepted: true },
            evidence: {
              merchantScopeDigest: DIGEST,
              payloadDigest: PAYLOAD_DIGEST,
            },
          };
          return mode === "promise" ? Promise.resolve(envelope) : envelope;
        },
      });
      await assert.rejects(
        () => executeCallbackFact(
          transport.execution,
          validEvent({ [digestField]: "c".repeat(64) }),
        ),
        (error) => error?.code === "provider_operation_failed",
      );
    }
  }

  let crossOperationReceipt;
  await assert.rejects(
    () => execution.withCredential("capture_payment", async ({ request }) => {
      crossOperationReceipt = (await request({ captureRequestRef: "capture-request-1" }))
        .transportReceipt;
      return {
        transportReceipt: Object.freeze({}),
        captureOutcome: validCaptureOutcome(),
      };
    }),
    (error) => error?.code === "provider_operation_failed",
  );
  await assert.rejects(
    () => execution.withCredential("verify_callback", () => ({
      transportReceipt: crossOperationReceipt,
      paymentFact: validEvent(),
    })),
    (error) => error?.code === "provider_operation_failed",
  );

  let thenReads = 0;
  const customThenable = Object.create(null);
  Object.defineProperty(customThenable, "then", {
    get() {
      thenReads += 1;
      return () => {};
    },
  });
  const thenableTransport = await createExecution({
    requestFn: () => customThenable,
  });
  await assert.rejects(
    () => thenableTransport.execution.withCredential(
      "verify_callback",
      async ({ request }) => {
        const requestResult = await request({ callbackRequestRef: "callback-request-1" });
        return {
          transportReceipt: requestResult.transportReceipt,
          paymentFact: validEvent(),
        };
      },
    ),
    (error) => error?.code === "provider_operation_failed",
  );
  assert.equal(thenReads, 0);

  let resolveTransport;
  let lateRequest;
  const late = await createExecution({
    requestFn() {
      return new Promise((resolve) => {
        resolveTransport = resolve;
      });
    },
  });
  await assert.rejects(
    () => late.execution.withCredential("verify_callback", ({ request }) => {
      lateRequest = request({ callbackRequestRef: "callback-request-1" });
      return {
        transportReceipt: Object.freeze({}),
        paymentFact: validEvent(),
      };
    }),
    (error) => error?.code === "provider_operation_failed",
  );
  resolveTransport({
    response: { accepted: true },
    evidence: {
      merchantScopeDigest: DIGEST,
      payloadDigest: PAYLOAD_DIGEST,
    },
  });
  await assert.rejects(
    lateRequest,
    expectCode("payment_execution_scope_closed"),
  );

  let retainedRequest;
  await execution.withCredential("query_payment", ({ request }) => {
    retainedRequest = request;
    return validResult();
  });
  await assert.rejects(
    () => retainedRequest({ afterClosure: true }),
    expectCode("payment_execution_scope_closed"),
  );
});

test("transport rejects Promise-prototype then spoofs without minting receipts or facts", async () => {
  const marker = "promise-prototype-transport-marker";
  for (const mode of ["data_then", "throwing_then_getter"]) {
    const counters = { then: 0, getter: 0 };
    const spoof = Object.create(Promise.prototype);
    if (mode === "data_then") {
      Object.defineProperty(spoof, "then", {
        value(onFulfilled) {
          counters.then += 1;
          return Promise.resolve(onFulfilled({
            response: { accepted: true },
            evidence: {
              merchantScopeDigest: DIGEST,
              payloadDigest: PAYLOAD_DIGEST,
            },
          }));
        },
      });
    } else {
      Object.defineProperty(spoof, "then", {
        get() {
          counters.getter += 1;
          throw new Error(marker);
        },
      });
    }

    const rawFact = validEvent();
    let retainedRequest;
    let receivedReceipt;
    let output;
    let caught;
    const { execution } = await createExecution({
      requestFn: () => spoof,
    });
    try {
      output = await execution.withCredential(
        "verify_callback",
        async ({ request }) => {
          retainedRequest = request;
          const requestResult = await request({
            callbackRequestRef: `callback-${mode}`,
          });
          receivedReceipt = requestResult.transportReceipt;
          return {
            transportReceipt: receivedReceipt,
            paymentFact: rawFact,
          };
        },
      );
    } catch (error) {
      caught = error;
    }

    assert.equal(output, undefined);
    assert.equal(receivedReceipt, undefined);
    assert.equal(counters.then, 0);
    assert.equal(counters.getter, 0);
    assert.equal(caught?.code, "provider_operation_failed");
    assert.doesNotMatch(String(caught), new RegExp(marker, "u"));
    assert.doesNotMatch(JSON.stringify(caught), new RegExp(marker, "u"));
    assert.throws(
      () => normalizeVerifiedPaymentEvent(rawFact),
      expectCode("invalid_verified_payment_event"),
    );
    await assert.rejects(
      () => retainedRequest({ afterFailure: true }),
      expectCode("payment_execution_scope_closed"),
    );
  }
});

test("transport rejects genuine Promises with throwing constructor or species without minting provenance", async () => {
  const marker = "native-promise-transport-species-marker";
  for (const mode of [
    "throwing_constructor_getter",
    "throwing_species_getter",
  ]) {
    const counters = { constructor: 0, species: 0, request: 0 };
    const response = poisonNativePromiseConstructor(
      Promise.resolve({
        response: { accepted: true },
        evidence: {
          merchantScopeDigest: DIGEST,
          payloadDigest: PAYLOAD_DIGEST,
        },
      }),
      mode,
      marker,
      counters,
    );
    const rawFact = validEvent();
    let retainedRequest;
    let receivedReceipt;
    let output;
    let caught;
    const { execution } = await createExecution({
      requestFn() {
        counters.request += 1;
        return response;
      },
    });
    try {
      output = await execution.withCredential(
        "verify_callback",
        async ({ request }) => {
          retainedRequest = request;
          const requestResult = await request({
            callbackRequestRef: `native-promise-${mode}`,
          });
          receivedReceipt = requestResult.transportReceipt;
          return {
            transportReceipt: receivedReceipt,
            paymentFact: rawFact,
          };
        },
      );
    } catch (error) {
      caught = error;
    }

    assert.equal(output, undefined);
    assert.equal(receivedReceipt, undefined);
    assert.equal(counters.constructor, 0);
    assert.equal(counters.species, 0);
    assert.equal(counters.request, 1);
    assert.equal(caught?.code, "provider_operation_failed");
    assert.doesNotMatch(String(caught), new RegExp(marker, "u"));
    assert.doesNotMatch(JSON.stringify(caught), new RegExp(marker, "u"));
    assert.throws(
      () => normalizeVerifiedPaymentEvent(rawFact),
      expectCode("invalid_verified_payment_event"),
    );
    await assert.rejects(
      () => retainedRequest({ afterTransportFailure: true }),
      expectCode("payment_execution_scope_closed"),
    );
  }
});

test("normalized adapters reject unbranded callback facts and preserve branded provenance", async () => {
  const plainAdapter = assertPaymentProviderAdapterContract(enabledAdapter());
  await assert.rejects(
    () => plainAdapter.verifyAndNormalizeCallback(validCallbackInput()),
    expectCode("invalid_verified_payment_event"),
  );

  const branded = await createBrandedEvent();
  const cloneAdapter = assertPaymentProviderAdapterContract(enabledAdapter({
    verifyAndNormalizeCallback: () => ({ ...branded }),
  }));
  await assert.rejects(
    () => cloneAdapter.verifyAndNormalizeCallback(validCallbackInput()),
    expectCode("invalid_verified_payment_event"),
  );

  let acknowledgedEvent;
  const adapter = assertPaymentProviderAdapterContract(enabledAdapter({
    verifyAndNormalizeCallback: () => branded,
    webhookSuccessAck(event) {
      acknowledgedEvent = event;
      return { statusCode: 204, contentType: "text/plain", body: "" };
    },
  }));
  const returned = await adapter.verifyAndNormalizeCallback(validCallbackInput());
  assert.equal(returned, branded);
  assert.equal(normalizeVerifiedPaymentEvent(returned), branded);
  assert.deepEqual(await adapter.webhookSuccessAck(returned), {
    statusCode: 204,
    contentType: "text/plain",
    body: "",
  });
  assert.equal(acknowledgedEvent, branded);
});

test("successful capture requires a matching branded payment fact", async () => {
  const branded = await createBrandedCaptureFact();
  const valid = assertPaymentProviderAdapterContract(enabledAdapter({
    capturePayment: () => validCaptureOutcome({ paymentFact: branded }),
  }));
  const outcome = await valid.capturePayment(validCaptureInput());
  assert.equal(outcome.paymentFact, branded);
  assert.ok(Object.isFrozen(outcome));

  for (const paymentFact of [null, validCaptureFact(), { ...branded }]) {
    const adapter = assertPaymentProviderAdapterContract(enabledAdapter({
      capturePayment: () => validCaptureOutcome({ paymentFact }),
    }));
    await assert.rejects(
      () => adapter.capturePayment(validCaptureInput()),
      expectCode("invalid_payment_operation_result"),
    );
  }
});

test("successful capture requires an operation result bound to its provider order", async () => {
  const branded = await createBrandedCaptureFact();
  const adapter = assertPaymentProviderAdapterContract(enabledAdapter({
    capturePayment: () => validCaptureOutcome({
      operationResult: validResult({ providerOrderRef: "other-provider-order" }),
      paymentFact: branded,
    }),
  }));

  await assert.rejects(
    () => adapter.capturePayment(validCaptureInput()),
    expectCode("invalid_payment_operation_result"),
  );
});

test("capture rejects order amount currency exponent and provenance mismatches", async () => {
  const cases = [
    ["paymentOrderRef", "other-payment-order"],
    ["providerOrderRef", "other-provider-order"],
    ["amountMinor", 3001],
    ["currency", "EUR"],
    ["currencyExponent", 3],
    ["sourceType", "callback"],
    ["eventType", "payment_pending"],
    ["providerCaptureRef", null],
  ];
  for (const [field, value] of cases) {
    let paymentFactPromise;
    if (field === "sourceType") {
      paymentFactPromise = createBrandedEvent({
        ...validCaptureFact(),
        sourceType: value,
      });
    } else {
      paymentFactPromise = createBrandedCaptureFact({ [field]: value });
    }
    const adapter = assertPaymentProviderAdapterContract(enabledAdapter({
      async capturePayment() {
        return validCaptureOutcome({
          paymentFact: await paymentFactPromise,
        });
      },
    }));
    await assert.rejects(
      () => adapter.capturePayment(validCaptureInput()),
      (error) => (
        error?.message === "invalid_payment_operation_result"
        || error?.code === "provider_operation_failed"
      ),
    );
  }
});

test("non-success capture outcomes require a null payment fact", async () => {
  const branded = await createBrandedCaptureFact();
  const results = [
    validResult({ status: "pending", chargeCertainty: "possibly_charged" }),
    validResult({
      status: "failed_no_charge",
      chargeCertainty: "confirmed_no_charge",
    }),
    validResult({
      status: "reconciliation_required",
      chargeCertainty: "unknown",
    }),
    validResult({ status: "reversed" }),
  ];
  for (const operationResult of results) {
    const valid = assertPaymentProviderAdapterContract(enabledAdapter({
      capturePayment: () => ({ operationResult, paymentFact: null }),
    }));
    const outcome = await valid.capturePayment(validCaptureInput());
    assert.equal(outcome.paymentFact, null);
    for (const paymentFact of [branded, validCaptureFact()]) {
      const invalid = assertPaymentProviderAdapterContract(enabledAdapter({
        capturePayment: () => ({ operationResult, paymentFact }),
      }));
      await assert.rejects(
        () => invalid.capturePayment(validCaptureInput()),
        expectCode("invalid_payment_operation_result"),
      );
    }
  }
  const { execution } = await createExecution();
  const internal = await executeCaptureOutcome(
    execution,
    validCaptureOutcome({
      operationResult: validResult({
        status: "pending",
        chargeCertainty: "possibly_charged",
      }),
      paymentFact: null,
    }),
  );
  assert.equal(internal.paymentFact, null);
  await assert.rejects(
    () => execution.withCredential("capture_payment", () => ({
      transportReceipt: Object.freeze({}),
      captureOutcome: validCaptureOutcome({
        operationResult: validResult({
          status: "pending",
          chargeCertainty: "possibly_charged",
        }),
        paymentFact: null,
      }),
    })),
    (error) => error?.code === "provider_operation_failed",
  );
});

test("non-success capture requires an operation result bound to its provider order", async () => {
  const adapter = assertPaymentProviderAdapterContract(enabledAdapter({
    capturePayment: () => validCaptureOutcome({
      operationResult: validResult({
        providerOrderRef: "other-provider-order",
        status: "pending",
        chargeCertainty: "possibly_charged",
      }),
      paymentFact: null,
    }),
  }));

  await assert.rejects(
    () => adapter.capturePayment(validCaptureInput()),
    expectCode("invalid_payment_operation_result"),
  );
});

test("query cannot return a payment fact or invoke capture", async () => {
  let queryCalls = 0;
  let captureCalls = 0;
  const adapter = assertPaymentProviderAdapterContract(enabledAdapter({
    queryPayment() {
      queryCalls += 1;
      return validResult({ status: "pending", chargeCertainty: "possibly_charged" });
    },
    capturePayment() {
      captureCalls += 1;
      return validCaptureOutcome();
    },
  }));
  const result = await adapter.queryPayment({
    paymentOrderRef: "payment-order-1",
    attemptRef: "attempt-1",
    providerOrderRef: "provider-order-1",
  });
  assert.equal(queryCalls, 1);
  assert.equal(captureCalls, 0);
  assert.equal(Object.hasOwn(result, "paymentFact"), false);

  const invalid = assertPaymentProviderAdapterContract(enabledAdapter({
    queryPayment: () => validCaptureOutcome(),
  }));
  await assert.rejects(
    () => invalid.queryPayment({
      paymentOrderRef: "payment-order-1",
      attemptRef: "attempt-1",
      providerOrderRef: "provider-order-1",
    }),
    expectCode("invalid_payment_operation_result"),
  );
});

test("webhook acknowledgement rejects authenticated-capture provenance", async () => {
  const callbackFact = await createBrandedEvent();
  const captureFact = await createBrandedCaptureFact();
  let calls = 0;
  const adapter = assertPaymentProviderAdapterContract(enabledAdapter({
    webhookSuccessAck: () => {
      calls += 1;
      return { statusCode: 204, contentType: "text/plain", body: "" };
    },
  }));
  await assert.doesNotReject(() => adapter.webhookSuccessAck(callbackFact));
  await assert.rejects(
    () => adapter.webhookSuccessAck(captureFact),
    expectCode("invalid_payment_webhook_ack"),
  );
  assert.equal(calls, 1);
});

test("validates all verified fact types, nullable refs, digests, time, amount, and payload rejection", async () => {
  const { execution } = await createExecution();
  for (const eventType of [
    "payment_pending",
    "payment_succeeded",
    "payment_failed",
    "payment_refunded",
    "payment_chargeback",
  ]) {
    const event = await executeCallbackFact(execution, validEvent({
      eventType,
      providerCaptureRef: eventType === "payment_succeeded" ? "provider-capture-1" : null,
      providerRefundRef: eventType === "payment_refunded" ? "provider-refund-1" : null,
    }));
    assert.equal(event.eventType, eventType);
  }
  const nullable = await executeCallbackFact(
    execution,
    validEvent({ providerEventRef: null }),
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
      () => executeCallbackFact(execution, value),
      (error) => error?.code === "provider_operation_failed",
    );
  }
});

test("normalizes safe webhook acknowledgements and requires branded events", async () => {
  const event = await createBrandedEvent();
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

test("consumes rejected async normalizeError results without unhandled rejection", async () => {
  const marker = "async-normalize-error-marker";
  let unhandled;
  const onUnhandled = (error) => {
    unhandled = error;
  };
  process.once("unhandledRejection", onUnhandled);
  try {
    const adapter = assertPaymentProviderAdapterContract(enabledAdapter({
      normalizeError: async () => {
        throw new Error(marker);
      },
    }));
    const collapsed = adapter.normalizeError({
      operation: "query_payment",
      error: new Error(marker),
    });
    assert.equal(collapsed.code, "provider_operation_failed");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(unhandled, undefined);
  } finally {
    process.removeListener("unhandledRejection", onUnhandled);
  }
});

test("compiled Adapter Promise species failures are rejected without reading hostile constructors", async () => {
  const marker = "native-promise-adapter-species-marker";
  for (const mode of [
    "throwing_constructor_getter",
    "throwing_species_getter",
  ]) {
    const queryCounters = { constructor: 0, species: 0 };
    const queryPromise = poisonNativePromiseConstructor(
      Promise.resolve(validResult({
        status: "pending",
        chargeCertainty: "possibly_charged",
      })),
      mode,
      marker,
      queryCounters,
    );
    const queryAdapter = assertPaymentProviderAdapterContract(enabledAdapter({
      queryPayment: () => queryPromise,
    }));
    let queryError;
    try {
      await queryAdapter.queryPayment({
        paymentOrderRef: "payment-order-1",
        attemptRef: "attempt-1",
        providerOrderRef: "provider-order-1",
      });
    } catch (error) {
      queryError = error;
    }
    assert.equal(queryError?.message, "invalid_payment_operation_result");
    assert.equal(queryCounters.constructor, 0);
    assert.equal(queryCounters.species, 0);
    assert.doesNotMatch(String(queryError), new RegExp(marker, "u"));
    assert.doesNotMatch(JSON.stringify(queryError), new RegExp(marker, "u"));

    const normalizeCounters = { constructor: 0, species: 0 };
    const normalizePromise = poisonNativePromiseConstructor(
      Promise.resolve(validProviderError()),
      mode,
      marker,
      normalizeCounters,
    );
    const normalizeAdapter = assertPaymentProviderAdapterContract(enabledAdapter({
      normalizeError: () => normalizePromise,
    }));
    const normalized = normalizeAdapter.normalizeError({
      operation: "query_payment",
      error: new Error(marker),
    });
    assert.equal(normalized.code, "provider_operation_failed");
    assert.equal(normalizeCounters.constructor, 0);
    assert.equal(normalizeCounters.species, 0);
    assert.doesNotMatch(String(normalized), new RegExp(marker, "u"));
    assert.doesNotMatch(JSON.stringify(normalized), new RegExp(marker, "u"));
  }
});

test("credential execution covers six operations, exact bindings, fresh scopes, and no credential view", async () => {
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
    "capture_payment",
    "verify_callback",
    "refund",
    "reconcile",
  ];
  for (const operation of operations) {
    const output = await execution.withCredential(operation, async ({ binding, request }) => {
      callbacks += 1;
      callbackCredentialView = { binding, request };
      assert.equal(binding.operation, operation);
      assert.deepEqual(Object.keys({ binding, request }), ["binding", "request"]);
      if (operation === "verify_callback") {
        const { transportReceipt } = await request({ callbackRequestRef: "callback-request-1" });
        return { transportReceipt, paymentFact: validEvent() };
      }
      if (operation === "capture_payment") {
        const { transportReceipt } = await request({ captureRequestRef: "capture-request-1" });
        return {
          transportReceipt,
          captureOutcome: validCaptureOutcome({
            paymentFact: validCaptureFact(),
          }),
        };
      }
      return validResult();
    });
    assert.ok(Object.isFrozen(output));
  }
  assert.equal(callbacks, 6);
  assert.equal(getLoaderCalls(), 0);
  assert.equal(bindings.length, 6);
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
      return { response: request, evidence: null };
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
    const requestResult = await request({ ping: true });
    assert.deepEqual(requestResult.response, { ping: true });
    assert.equal(requestResult.evidence, null);
    assert.deepEqual(Object.keys(requestResult.transportReceipt), []);
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

test("compiled credential callbacks reject genuine Promise species failures and close scope", async () => {
  const marker = "native-promise-callback-species-marker";
  for (const mode of [
    "throwing_constructor_getter",
    "throwing_species_getter",
  ]) {
    const counters = { constructor: 0, species: 0, request: 0 };
    const rawFact = validEvent();
    const callbackPromise = poisonNativePromiseConstructor(
      Promise.resolve({
        transportReceipt: Object.freeze({}),
        paymentFact: rawFact,
      }),
      mode,
      marker,
      counters,
    );
    let retainedRequest;
    let output;
    let caught;
    const { execution } = await createExecution({
      requestFn() {
        counters.request += 1;
        throw new Error("must-not-run");
      },
    });
    try {
      output = await execution.withCredential(
        "verify_callback",
        ({ request }) => {
          retainedRequest = request;
          return callbackPromise;
        },
      );
    } catch (error) {
      caught = error;
    }

    assert.equal(output, undefined);
    assert.equal(counters.constructor, 0);
    assert.equal(counters.species, 0);
    assert.equal(counters.request, 0);
    assert.equal(caught?.code, "provider_operation_failed");
    assert.doesNotMatch(String(caught), new RegExp(marker, "u"));
    assert.doesNotMatch(JSON.stringify(caught), new RegExp(marker, "u"));
    assert.throws(
      () => normalizeVerifiedPaymentEvent(rawFact),
      expectCode("invalid_verified_payment_event"),
    );
    await assert.rejects(
      () => retainedRequest({ afterCallbackFailure: true }),
      expectCode("payment_execution_scope_closed"),
    );
  }
});

test("request transport failures atomically close the credential scope", async () => {
  for (const failureMode of ["sync_throw", "native_reject"]) {
    let transportCalls = 0;
    const { execution } = await createExecution({
      requestFn() {
        transportCalls += 1;
        if (failureMode === "sync_throw") throw new Error("transport-secret");
        return Promise.reject(new Error("transport-secret"));
      },
    });
    const result = await execution.withCredential("query_payment", async ({ request }) => {
      const firstError = await request({ attempt: 1 }).catch((error) => error);
      assert.equal(firstError.code, "provider_operation_failed");
      const secondError = await request({ attempt: 2 }).catch((error) => error);
      assert.equal(secondError.message, "payment_execution_scope_closed");
      return validResult();
    });
    assert.deepEqual(result, validResult());
    assert.equal(transportCalls, 1);
  }
});

test("loader failures close retained scopes and drain background callback rejection", async () => {
  for (const failureMode of ["sync_throw", "native_reject", "custom_thenable"]) {
    let retainedRequest;
    let transportCalls = 0;
    let releaseCallback;
    let callbackReachedRequest;
    const callbackGate = new Promise((resolve) => {
      releaseCallback = resolve;
    });
    const reachedRequest = new Promise((resolve) => {
      callbackReachedRequest = resolve;
    });
    const unhandled = [];
    const onUnhandled = (error) => {
      unhandled.push(error);
    };
    process.on("unhandledRejection", onUnhandled);
    try {
      const credentialLoader = {
        withCredential(_binding, callback) {
          void callback("opaque-credential");
          if (failureMode === "sync_throw") throw new Error("loader-secret");
          if (failureMode === "native_reject") {
            return Promise.reject(new Error("loader-secret"));
          }
          return { then() {} };
        },
      };
      const { execution } = await createExecution({
        credentialLoader,
        requestFn() {
          transportCalls += 1;
          return { ok: true };
        },
      });
      const outer = execution.withCredential("query_payment", async ({ request }) => {
        retainedRequest = request;
        await callbackGate;
        callbackReachedRequest();
        await request({ background: true });
        return validResult();
      });
      await assert.rejects(outer, (error) => error?.code === "provider_operation_failed");
      await assert.rejects(
        () => retainedRequest({ retained: true }),
        expectCode("payment_execution_scope_closed"),
      );
      assert.equal(transportCalls, 0);
      releaseCallback();
      await reachedRequest;
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(transportCalls, 0);
      assert.deepEqual(unhandled, []);
    } finally {
      process.removeListener("unhandledRejection", onUnhandled);
      releaseCallback();
    }
  }
});

test("loader rejects Promise-prototype then spoofs and closes opened scopes safely", async () => {
  const marker = "promise-prototype-loader-marker";
  for (const mode of ["data_then", "throwing_then_getter"]) {
    const counters = { then: 0, getter: 0, request: 0 };
    const spoof = Object.create(Promise.prototype);
    if (mode === "data_then") {
      Object.defineProperty(spoof, "then", {
        value() {
          counters.then += 1;
          return Promise.resolve("forged-loader-result");
        },
      });
    } else {
      Object.defineProperty(spoof, "then", {
        get() {
          counters.getter += 1;
          throw new Error(marker);
        },
      });
    }

    let releaseCallback;
    const callbackGate = new Promise((resolve) => {
      releaseCallback = resolve;
    });
    let callbackOutcome;
    let callbackValue;
    let callbackError;
    let retainedRequest;
    const rawFact = validEvent();
    const execution = createCredentialScopedPaymentExecution({
      profileRef: "profile-1",
      adapterKey: "provider_core",
      contractVersion: "v1",
      credentialProfileRef: "credential-profile-1",
      credentialLoader: {
        withCredential(_binding, callback) {
          callbackOutcome = callback("opaque-credential");
          return spoof;
        },
      },
      requestFn() {
        counters.request += 1;
        return {
          response: { accepted: true },
          evidence: {
            merchantScopeDigest: DIGEST,
            payloadDigest: PAYLOAD_DIGEST,
          },
        };
      },
      allowedActionOrigins: ACTION_ORIGINS,
    });

    let outerValue;
    let outerError;
    try {
      try {
        outerValue = await execution.withCredential(
          "verify_callback",
          async ({ request }) => {
            retainedRequest = request;
            await callbackGate;
            const { transportReceipt } = await request({
              callbackRequestRef: `loader-${mode}`,
            });
            return { transportReceipt, paymentFact: rawFact };
          },
        );
      } catch (error) {
        outerError = error;
      }
    } finally {
      releaseCallback();
      try {
        callbackValue = await callbackOutcome;
      } catch (error) {
        callbackError = error;
      }
    }

    assert.equal(outerValue, undefined);
    assert.equal(callbackValue, undefined);
    assert.equal(outerError?.code, "provider_operation_failed");
    assert.equal(callbackError?.code, "provider_operation_failed");
    assert.equal(counters.then, 0);
    assert.equal(counters.getter, 0);
    assert.equal(counters.request, 0);
    assert.doesNotMatch(String(outerError), new RegExp(marker, "u"));
    assert.doesNotMatch(JSON.stringify(outerError), new RegExp(marker, "u"));
    assert.throws(
      () => normalizeVerifiedPaymentEvent(rawFact),
      expectCode("invalid_verified_payment_event"),
    );
    await assert.rejects(
      () => retainedRequest({ afterLoaderFailure: true }),
      expectCode("payment_execution_scope_closed"),
    );
  }
});

test("loader rejects genuine Promises with throwing constructor or species and drains callbacks", async () => {
  const marker = "native-promise-loader-species-marker";
  for (const mode of [
    "throwing_constructor_getter",
    "throwing_species_getter",
  ]) {
    const counters = { constructor: 0, species: 0, request: 0 };
    const loaderPromise = poisonNativePromiseConstructor(
      Promise.resolve(),
      mode,
      marker,
      counters,
    );
    let releaseCallback;
    const callbackGate = new Promise((resolve) => {
      releaseCallback = resolve;
    });
    let callbackOutcome;
    let callbackValue;
    let callbackError;
    let retainedRequest;
    const rawFact = validEvent();
    const execution = createCredentialScopedPaymentExecution({
      profileRef: "profile-1",
      adapterKey: "provider_core",
      contractVersion: "v1",
      credentialProfileRef: "credential-profile-1",
      credentialLoader: {
        withCredential(_binding, callback) {
          callbackOutcome = callback("opaque-credential");
          return loaderPromise;
        },
      },
      requestFn() {
        counters.request += 1;
        return {
          response: { accepted: true },
          evidence: {
            merchantScopeDigest: DIGEST,
            payloadDigest: PAYLOAD_DIGEST,
          },
        };
      },
      allowedActionOrigins: ACTION_ORIGINS,
    });

    let outerValue;
    let outerError;
    try {
      try {
        outerValue = await execution.withCredential(
          "verify_callback",
          async ({ request }) => {
            retainedRequest = request;
            await callbackGate;
            const { transportReceipt } = await request({
              callbackRequestRef: `loader-native-${mode}`,
            });
            return { transportReceipt, paymentFact: rawFact };
          },
        );
      } catch (error) {
        outerError = error;
      }
    } finally {
      releaseCallback();
      try {
        callbackValue = await callbackOutcome;
      } catch (error) {
        callbackError = error;
      }
    }

    assert.equal(outerValue, undefined);
    assert.equal(callbackValue, undefined);
    assert.equal(outerError?.code, "provider_operation_failed");
    assert.equal(callbackError?.code, "provider_operation_failed");
    assert.equal(counters.constructor, 0);
    assert.equal(counters.species, 0);
    assert.equal(counters.request, 0);
    assert.doesNotMatch(String(outerError), new RegExp(marker, "u"));
    assert.doesNotMatch(JSON.stringify(outerError), new RegExp(marker, "u"));
    assert.throws(
      () => normalizeVerifiedPaymentEvent(rawFact),
      expectCode("invalid_verified_payment_event"),
    );
    await assert.rejects(
      () => retainedRequest({ afterLoaderFailure: true }),
      expectCode("payment_execution_scope_closed"),
    );
  }
});

test("successful early loader resolution keeps scope open until callback settles", async () => {
  let retainedRequest;
  let releaseCallback;
  let transportCalls = 0;
  const callbackGate = new Promise((resolve) => {
    releaseCallback = resolve;
  });
  const { execution } = await createExecution({
    credentialLoader: {
      withCredential(_binding, callback) {
        void callback("opaque-credential");
        return Promise.resolve();
      },
    },
    requestFn({ request }) {
      transportCalls += 1;
      return { response: request, evidence: null };
    },
  });
  const outer = execution.withCredential("query_payment", async ({ request }) => {
    retainedRequest = request;
    await callbackGate;
    const requestResult = await request({ allowed: true });
    assert.deepEqual(requestResult.response, { allowed: true });
    assert.equal(requestResult.evidence, null);
    return validResult();
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(transportCalls, 0);
  releaseCallback();
  assert.deepEqual(await outer, validResult());
  assert.equal(transportCalls, 1);
  await assert.rejects(
    () => retainedRequest({ after: true }),
    expectCode("payment_execution_scope_closed"),
  );
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
