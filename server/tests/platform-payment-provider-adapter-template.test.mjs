import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import * as templateModule from "../services/platform/payment-provider-adapter-template.mjs";
import {
  createStaticPaymentProviderAdapterRegistry,
} from "../services/platform/payment-provider-adapter-registry.mjs";

const NOW = "2026-07-23T12:34:56.789Z";
const MARKER = "synthetic-secret-marker";
const ADAPTER_KEYS = [
  "adapterKey",
  "providerId",
  "contractVersion",
  "capabilities",
  "supportedPaymentMethods",
  "createRechargeOrder",
  "queryPayment",
  "capturePayment",
  "verifyAndNormalizeCallback",
  "normalizeError",
  "webhookSuccessAck",
  "refund",
  "reconcile",
];
const FALSE_CAPABILITIES = {
  createRechargeOrder: false,
  queryPayment: false,
  capturePayment: false,
  verifyCallback: false,
  refund: false,
  reconcile: false,
  repeatCreateIdempotent: false,
  repeatCaptureIdempotent: false,
};

function trappingProxy(value, counters) {
  return new Proxy(value, {
    get(target, key, receiver) {
      counters.get += 1;
      return Reflect.get(target, key, receiver);
    },
    ownKeys(target) {
      counters.ownKeys += 1;
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(target, key) {
      counters.descriptor += 1;
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
}

test("module keeps only the safe summary and canonical template factory exports", () => {
  assert.deepEqual(Object.keys(templateModule).sort(), [
    "createPaymentProviderAdapterTemplate",
    "summarizePaymentProviderEnvironment",
  ]);
  assert.equal(
    Object.hasOwn(templateModule, "normalizeVerifiedPaymentProviderEvent"),
    false,
  );
});

test("environment summary reports configuration without exposing values", () => {
  const summary = templateModule.summarizePaymentProviderEnvironment({
    PAYMENT_PROVIDER: "paypal",
    PAYMENT_MODE: "sandbox",
    PAYMENT_PROVIDER_API_KEY: `${MARKER}-key`,
    PAYMENT_PROVIDER_API_SECRET: `${MARKER}-api`,
    PAYMENT_PROVIDER_WEBHOOK_SECRET: `${MARKER}-webhook`,
    PAYMENT_PUBLIC_BASE_URL: "https://pay.example.test",
    PAYMENT_RETURN_URL: "https://pay.example.test/return",
    PAYMENT_CANCEL_URL: "https://pay.example.test/cancel",
  });

  assert.equal(summary.provider, "paypal");
  assert.equal(summary.mode, "sandbox");
  assert.equal(summary.configured.apiKeyConfigured, true);
  assert.equal(summary.configured.apiSecretConfigured, true);
  assert.equal(summary.configured.webhookSecretConfigured, true);
  assert.equal(summary.urls.returnUrlConfigured, true);
  assert.equal(summary.safety.noRawApiSecret, true);
  assert.doesNotMatch(JSON.stringify(summary), new RegExp(MARKER, "u"));
});

test("environment summary requires HTTPS except explicit loopback test mode", () => {
  assert.throws(() => templateModule.summarizePaymentProviderEnvironment({
    PAYMENT_PROVIDER: "stripe",
    PAYMENT_PUBLIC_BASE_URL: "http://pay.example.test",
  }), /must be https/u);

  assert.throws(() => templateModule.summarizePaymentProviderEnvironment({
    PAYMENT_PROVIDER: "mock",
    PAYMENT_PUBLIC_BASE_URL: "http://127.0.0.1:4173",
  }), /must be https/u);

  const summary = templateModule.summarizePaymentProviderEnvironment({
    PAYMENT_PROVIDER: "mock",
    PAYMENT_PUBLIC_BASE_URL: "http://127.0.0.1:4173",
  }, { allowLocalTest: true });

  assert.equal(summary.urls.publicBaseUrlConfigured, true);
});

test("template factory accepts only a closed ordinary options object with optional nowFn", () => {
  assert.doesNotThrow(() => templateModule.createPaymentProviderAdapterTemplate());
  assert.doesNotThrow(() => templateModule.createPaymentProviderAdapterTemplate({
    nowFn: () => NOW,
  }));

  for (const invalid of [
    null,
    [],
    Object.create(null),
    { nowFn: "not-a-function" },
    { nowFn: new Proxy(() => NOW, {}) },
    { provider: "manual" },
    { env: {} },
    { nowFn: () => NOW, extra: true },
    { [MARKER]: MARKER },
  ]) {
    let captured;
    assert.throws(() => {
      try {
        templateModule.createPaymentProviderAdapterTemplate(invalid);
      } catch (error) {
        captured = error;
        throw error;
      }
    });
    assert.doesNotMatch(JSON.stringify(captured), new RegExp(MARKER, "u"));
    assert.doesNotMatch(String(captured), new RegExp(MARKER, "u"));
  }

  const counters = { get: 0, ownKeys: 0, descriptor: 0 };
  assert.throws(() => templateModule.createPaymentProviderAdapterTemplate(
    trappingProxy({}, counters),
  ));
  assert.deepEqual(counters, { get: 0, ownKeys: 0, descriptor: 0 });

  let accessorCalls = 0;
  const accessorOptions = {};
  Object.defineProperty(accessorOptions, "nowFn", {
    enumerable: true,
    get() {
      accessorCalls += 1;
      return () => NOW;
    },
  });
  assert.throws(
    () => templateModule.createPaymentProviderAdapterTemplate(accessorOptions),
  );
  assert.equal(accessorCalls, 0);
});

test("template is an exact frozen canonical unverified Adapter", () => {
  const adapter = templateModule.createPaymentProviderAdapterTemplate({
    nowFn: () => NOW,
  });

  assert.equal(Object.getPrototypeOf(adapter), Object.prototype);
  assert.ok(Object.isFrozen(adapter));
  assert.deepEqual(Object.keys(adapter), ADAPTER_KEYS);
  assert.equal(adapter.adapterKey, "payment_provider_template_v1");
  assert.equal(adapter.providerId, "payment_provider_template");
  assert.equal(adapter.contractVersion, "unverified");
  assert.deepEqual(adapter.capabilities, FALSE_CAPABILITIES);
  assert.ok(Object.isFrozen(adapter.capabilities));
  assert.deepEqual(adapter.supportedPaymentMethods, []);
  assert.ok(Object.isFrozen(adapter.supportedPaymentMethods));
  assert.doesNotMatch(JSON.stringify(adapter), new RegExp(MARKER, "u"));

  for (const key of ADAPTER_KEYS.slice(5)) {
    assert.equal(typeof adapter[key], "function");
  }

  for (const forbidden of [
    "createCheckoutOrder",
    "verifyWebhook",
    "normalizeVerifiedPaymentEvent",
    "provider",
    "mode",
    "summary",
  ]) {
    assert.equal(Object.hasOwn(adapter, forbidden), false);
  }
});

test("all disabled template operations reject before reading caller input", async () => {
  const adapter = templateModule.createPaymentProviderAdapterTemplate({
    nowFn: () => NOW,
  });

  for (const operation of [
    "createRechargeOrder",
    "queryPayment",
    "capturePayment",
    "verifyAndNormalizeCallback",
    "webhookSuccessAck",
    "refund",
    "reconcile",
  ]) {
    const counters = { get: 0, ownKeys: 0, descriptor: 0 };
    const input = trappingProxy({ marker: MARKER }, counters);
    await assert.rejects(
      () => adapter[operation](input),
      (error) => {
        assert.equal(error.message, "payment_provider_capability_disabled");
        assert.doesNotMatch(JSON.stringify(error), new RegExp(MARKER, "u"));
        return true;
      },
    );
    assert.deepEqual(counters, { get: 0, ownKeys: 0, descriptor: 0 });
  }
});

test("template normalizes safe fail-closed errors and generic invalid wrapper input", () => {
  const adapter = templateModule.createPaymentProviderAdapterTemplate({
    nowFn: () => NOW,
  });
  const providerError = adapter.normalizeError({
    operation: "refund",
    error: new Error(MARKER),
  });

  assert.ok(Object.isFrozen(providerError));
  assert.equal(providerError.code, "provider_contract_unverified");
  assert.equal(providerError.operation, "refund");
  assert.equal(providerError.retryable, false);
  assert.equal(providerError.chargeCertainty, "confirmed_no_charge");
  assert.equal(providerError.providerOrderRef, null);
  assert.equal(providerError.occurredAt, NOW);
  assert.doesNotMatch(JSON.stringify(providerError), new RegExp(MARKER, "u"));
  assert.doesNotMatch(String(providerError), new RegExp(MARKER, "u"));

  const fallback = adapter.normalizeError({
    operation: "not-an-operation",
    error: new Error(MARKER),
  });
  assert.equal(fallback.code, "provider_operation_failed");
  assert.equal(fallback.operation, "reconcile");
  assert.equal(fallback.retryable, false);
  assert.equal(fallback.chargeCertainty, "unknown");
  assert.equal(fallback.providerOrderRef, null);
  assert.doesNotMatch(JSON.stringify(fallback), new RegExp(MARKER, "u"));
});

test("template is not selectable from the static provider registry", () => {
  const registry = createStaticPaymentProviderAdapterRegistry();
  assert.equal(
    registry.list().some(
      ({ adapterKey }) => adapterKey === "payment_provider_template_v1",
    ),
    false,
  );
  assert.throws(
    () => registry.resolve({ adapterKey: "payment_provider_template_v1" }),
    (error) => error.code === "payment_adapter_not_registered",
  );
});

test("template source has no legacy billing or self-declared verification seam", async () => {
  const source = await readFile(
    new URL(
      "../services/platform/payment-provider-adapter-template.mjs",
      import.meta.url,
    ),
    "utf8",
  );

  assert.doesNotMatch(source, /normalizeBillingPaymentEvent/u);
  assert.doesNotMatch(source, /normalizeVerifiedPaymentProviderEvent/u);
  assert.doesNotMatch(source, /\bverifyWebhook\b/u);
  assert.doesNotMatch(source, /verificationStatus\s*[:=]\s*["']verified["']/u);
});
