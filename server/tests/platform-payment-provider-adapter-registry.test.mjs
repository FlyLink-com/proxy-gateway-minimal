import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createStaticPaymentProviderAdapterRegistry,
} from "../services/platform/payment-provider-adapter-registry.mjs";
import {
  createPayPalPaymentAdapter,
} from "../services/platform/paypal-payment-adapter.mjs";
import {
  createXsdPaymentAdapter,
} from "../services/platform/xsd-payment-adapter.mjs";
import {
  createChaoJiPayPaymentAdapter,
} from "../services/platform/chaojipay-payment-adapter.mjs";

const NOW = "2026-07-23T12:34:56.789Z";
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
const CAPABILITY_KEYS = [
  "createRechargeOrder",
  "queryPayment",
  "capturePayment",
  "verifyCallback",
  "refund",
  "reconcile",
  "repeatCreateIdempotent",
  "repeatCaptureIdempotent",
];
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
const TRUE_CAPABILITIES = Object.freeze({
  createRechargeOrder: true,
  queryPayment: true,
  capturePayment: true,
  verifyCallback: true,
  refund: true,
  reconcile: true,
  repeatCreateIdempotent: true,
  repeatCaptureIdempotent: true,
});
const OPERATIONS = [
  "createRechargeOrder",
  "queryPayment",
  "capturePayment",
  "verifyAndNormalizeCallback",
  "webhookSuccessAck",
  "refund",
  "reconcile",
];

function knownResolution(overrides = {}) {
  return {
    adapterKey: "paypal_v1",
    profileRef: "profile-1",
    contractVersion: "unverified",
    credentialProfileRef: "credential-profile-1",
    declaredCapabilities: { ...FALSE_CAPABILITIES },
    ...overrides,
  };
}

function assertRegistryError(action, code, forbidden = "synthetic-secret-marker") {
  assert.throws(action, (error) => {
    assert.ok(error instanceof Error);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    assert.deepEqual(Object.keys(error), ["code"]);
    assert.equal(Object.hasOwn(error, "cause"), false);
    assert.doesNotMatch(JSON.stringify(error), new RegExp(forbidden, "iu"));
    return true;
  });
}

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

test("static registry lists three detached frozen descriptors in compiled order", () => {
  const registry = createStaticPaymentProviderAdapterRegistry({ nowFn: () => NOW });
  assert.equal(Object.getPrototypeOf(registry), Object.prototype);
  assert.ok(Object.isFrozen(registry));
  assert.deepEqual(Object.keys(registry), ["list", "resolve"]);

  const first = registry.list();
  const second = registry.list();
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(second));
  assert.notEqual(first, second);
  assert.deepEqual(first, [
    {
      adapterKey: "paypal_v1",
      providerId: "paypal_commerce",
      contractVersion: "unverified",
      capabilities: { ...FALSE_CAPABILITIES },
      supportedPaymentMethods: [],
    },
    {
      adapterKey: "xsd_v1",
      providerId: "xsd",
      contractVersion: "unverified",
      capabilities: { ...FALSE_CAPABILITIES },
      supportedPaymentMethods: [],
    },
    {
      adapterKey: "chaojipay_v1",
      providerId: "chaojipay",
      contractVersion: "unverified",
      capabilities: { ...FALSE_CAPABILITIES },
      supportedPaymentMethods: [],
    },
  ]);

  for (const entries of [first, second]) {
    for (const entry of entries) {
      assert.equal(Object.getPrototypeOf(entry), Object.prototype);
      assert.ok(Object.isFrozen(entry));
      assert.ok(Object.isFrozen(entry.capabilities));
      assert.ok(Object.isFrozen(entry.supportedPaymentMethods));
      assert.deepEqual(Object.keys(entry), [
        "adapterKey",
        "providerId",
        "contractVersion",
        "capabilities",
        "supportedPaymentMethods",
      ]);
    }
  }
  assert.notEqual(first[0], second[0]);
  assert.notEqual(first[0].capabilities, second[0].capabilities);
  assert.notEqual(first[0].supportedPaymentMethods, second[0].supportedPaymentMethods);
  assert.equal(new Set(first.map(({ adapterKey }) => adapterKey)).size, 3);
  assert.equal(new Set(first.map(({ providerId }) => providerId)).size, 3);
  assert.notEqual(first[0].adapterKey, first[0].providerId);
  assert.notEqual(first[1].adapterKey, first[1].providerId);
});

test("unknown Adapter detection precedes missing known-resolution fields", () => {
  const registry = createStaticPaymentProviderAdapterRegistry();
  assertRegistryError(
    () => registry.resolve({
      adapterKey: "database_supplied_module",
      declaredCapabilities: {
        createRechargeOrder: false,
        queryPayment: false,
        capturePayment: false,
        verifyCallback: false,
        refund: true,
        reconcile: false,
        repeatCreateIdempotent: false,
        repeatCaptureIdempotent: false,
      },
    }),
    "payment_adapter_not_registered",
  );
  assertRegistryError(
    () => registry.resolve({
      adapterKey: "synthetic_secret_marker",
      declaredCapabilities: { ...FALSE_CAPABILITIES },
    }),
    "payment_adapter_not_registered",
    "synthetic_secret_marker",
  );
});

test("known resolution requires exact safe refs, version, and full strict declarations", () => {
  const registry = createStaticPaymentProviderAdapterRegistry();
  const valid = registry.resolve(knownResolution());
  assert.equal(valid.adapterKey, "paypal_v1");

  const invalidInputs = [];
  for (const key of [
    "adapterKey",
    "profileRef",
    "contractVersion",
    "credentialProfileRef",
    "declaredCapabilities",
  ]) {
    const input = knownResolution();
    delete input[key];
    invalidInputs.push(input);
  }
  invalidInputs.push(
    knownResolution({ profileRef: "" }),
    knownResolution({ profileRef: "unsafe ref" }),
    knownResolution({ credentialProfileRef: "../unsafe" }),
    knownResolution({ contractVersion: "v1" }),
    { ...knownResolution(), extra: true },
  );

  for (const capabilityKey of CAPABILITY_KEYS) {
    const missing = { ...FALSE_CAPABILITIES };
    delete missing[capabilityKey];
    invalidInputs.push(knownResolution({ declaredCapabilities: missing }));
    invalidInputs.push(knownResolution({
      declaredCapabilities: { ...FALSE_CAPABILITIES, [capabilityKey]: 0 },
    }));
  }
  invalidInputs.push(
    knownResolution({
      declaredCapabilities: { ...FALSE_CAPABILITIES, unexpected: false },
    }),
    knownResolution({ declaredCapabilities: Object.create(null) }),
  );

  for (const input of invalidInputs) {
    assertRegistryError(
      () => registry.resolve(input),
      "invalid_payment_adapter_resolution",
    );
  }
});

test("resolution rejects symbols, accessors, and Proxies without executing traps or values", () => {
  const registry = createStaticPaymentProviderAdapterRegistry();

  const symbolInput = knownResolution();
  symbolInput[Symbol("synthetic-secret-marker")] = true;
  assertRegistryError(
    () => registry.resolve(symbolInput),
    "invalid_payment_adapter_resolution",
  );

  let topAccessorCalls = 0;
  const accessorInput = knownResolution();
  Object.defineProperty(accessorInput, "profileRef", {
    enumerable: true,
    get() {
      topAccessorCalls += 1;
      return "synthetic-secret-marker";
    },
  });
  assertRegistryError(
    () => registry.resolve(accessorInput),
    "invalid_payment_adapter_resolution",
  );
  assert.equal(topAccessorCalls, 0);

  const inputCounters = { get: 0, ownKeys: 0, descriptor: 0 };
  assertRegistryError(
    () => registry.resolve(trappingProxy(knownResolution(), inputCounters)),
    "invalid_payment_adapter_resolution",
  );
  assert.deepEqual(inputCounters, { get: 0, ownKeys: 0, descriptor: 0 });

  const capabilityCounters = { get: 0, ownKeys: 0, descriptor: 0 };
  assertRegistryError(
    () => registry.resolve(knownResolution({
      declaredCapabilities: trappingProxy(
        { ...FALSE_CAPABILITIES },
        capabilityCounters,
      ),
    })),
    "invalid_payment_adapter_resolution",
  );
  assert.deepEqual(capabilityCounters, { get: 0, ownKeys: 0, descriptor: 0 });

  let capabilityAccessorCalls = 0;
  const accessorCapabilities = { ...FALSE_CAPABILITIES };
  Object.defineProperty(accessorCapabilities, "refund", {
    enumerable: true,
    get() {
      capabilityAccessorCalls += 1;
      return true;
    },
  });
  assertRegistryError(
    () => registry.resolve(knownResolution({
      declaredCapabilities: accessorCapabilities,
    })),
    "invalid_payment_adapter_resolution",
  );
  assert.equal(capabilityAccessorCalls, 0);

  const symbolCapabilities = { ...FALSE_CAPABILITIES };
  symbolCapabilities[Symbol("synthetic-secret-marker")] = true;
  assertRegistryError(
    () => registry.resolve(knownResolution({
      declaredCapabilities: symbolCapabilities,
    })),
    "invalid_payment_adapter_resolution",
  );
});

test("database declarations can only reduce every compiled capability", () => {
  const registry = createStaticPaymentProviderAdapterRegistry();
  for (const adapterKey of [
    "paypal_v1",
    "xsd_v1",
    "chaojipay_v1",
  ]) {
    for (const capabilityKey of CAPABILITY_KEYS) {
      const declaredCapabilities = { ...FALSE_CAPABILITIES };
      declaredCapabilities[capabilityKey] = true;
      if (capabilityKey === "repeatCreateIdempotent") {
        declaredCapabilities.createRechargeOrder = true;
      }
      if (capabilityKey === "repeatCaptureIdempotent") {
        declaredCapabilities.capturePayment = true;
      }
      const adapter = registry.resolve(knownResolution({
        adapterKey,
        credentialProfileRef: `credential-${adapterKey}`,
        declaredCapabilities,
      }));
      assert.deepEqual(adapter.capabilities, FALSE_CAPABILITIES);
      assert.deepEqual(adapter.supportedPaymentMethods, []);
    }

    const allRequested = registry.resolve(knownResolution({
      adapterKey,
      credentialProfileRef: `credential-all-${adapterKey}`,
      declaredCapabilities: { ...TRUE_CAPABILITIES },
    }));
    assert.deepEqual(allRequested.capabilities, FALSE_CAPABILITIES);
    assert.deepEqual(allRequested.supportedPaymentMethods, []);
  }
});

test("repeat-create declaration cannot be true when create is false", () => {
  const registry = createStaticPaymentProviderAdapterRegistry();
  assertRegistryError(
    () => registry.resolve(knownResolution({
      declaredCapabilities: {
        ...FALSE_CAPABILITIES,
        repeatCreateIdempotent: true,
      },
    })),
    "invalid_payment_adapter_resolution",
  );
});

test("repeat-capture declaration cannot be true when capture is false", () => {
  const registry = createStaticPaymentProviderAdapterRegistry();
  assertRegistryError(
    () => registry.resolve(knownResolution({
      declaredCapabilities: {
        ...FALSE_CAPABILITIES,
        repeatCaptureIdempotent: true,
      },
    })),
    "invalid_payment_adapter_resolution",
  );
});

test("successful resolution returns only distinct canonical frozen Adapters", () => {
  const registry = createStaticPaymentProviderAdapterRegistry();
  const first = registry.resolve(knownResolution());
  const second = registry.resolve(knownResolution());

  assert.notEqual(first, second);
  for (const adapter of [first, second]) {
    assert.equal(Object.getPrototypeOf(adapter), Object.prototype);
    assert.ok(Object.isFrozen(adapter));
    assert.ok(Object.isFrozen(adapter.capabilities));
    assert.ok(Object.isFrozen(adapter.supportedPaymentMethods));
    assert.deepEqual(Object.keys(adapter), ADAPTER_KEYS);
    assert.deepEqual(adapter.capabilities, FALSE_CAPABILITIES);
    assert.deepEqual(adapter.supportedPaymentMethods, []);
    assert.equal("profileRef" in adapter, false);
    assert.equal("credentialProfileRef" in adapter, false);
    assert.equal("executionScope" in adapter, false);
    assert.equal("binding" in adapter, false);
    assert.equal("registry" in adapter, false);
  }
});

test("raw factories stay unverified while resolved normalized operations stay disabled", async () => {
  for (const [factory, adapterKey] of [
    [createPayPalPaymentAdapter, "paypal_v1"],
    [createXsdPaymentAdapter, "xsd_v1"],
    [createChaoJiPayPaymentAdapter, "chaojipay_v1"],
  ]) {
    const raw = factory({ nowFn: () => NOW });
    assert.throws(() => raw.createRechargeOrder({}), (error) => (
      error.code === "provider_contract_unverified"
      && error.operation === "create_recharge_order"
      && error.chargeCertainty === "confirmed_no_charge"
    ));

    const registry = createStaticPaymentProviderAdapterRegistry({ nowFn: () => NOW });
    const normalized = registry.resolve(knownResolution({
      adapterKey,
      credentialProfileRef: `credential-${adapterKey}`,
      declaredCapabilities: { ...TRUE_CAPABILITIES },
    }));
    for (const operation of OPERATIONS) {
      await assert.rejects(
        () => normalized[operation]({}),
        (error) => error.message === "payment_provider_capability_disabled",
      );
    }
    const providerError = normalized.normalizeError({
      operation: "refund",
      error: new Error("ignored"),
    });
    assert.equal(providerError.code, "provider_contract_unverified");
    assert.equal(providerError.operation, "refund");
  }
});

test("constructor is closed over loader, time, and the three compiled transport entries", () => {
  const requestFn = () => {
    throw new Error("must-not-run");
  };
  const credentialLoader = {
    withCredential() {
      throw new Error("must-not-run");
    },
  };
  const transports = {
    paypal_v1: {
      requestFn,
      allowedActionOrigins: ["https://provider-a.example.test"],
    },
    xsd_v1: {
      requestFn,
      allowedActionOrigins: ["https://provider-b.example.test"],
    },
  };
  assert.doesNotThrow(() => createStaticPaymentProviderAdapterRegistry({
    credentialLoader,
    transports,
    nowFn: () => NOW,
  }));
  assert.doesNotThrow(() => createStaticPaymentProviderAdapterRegistry({
    credentialLoader: undefined,
    transports: undefined,
    nowFn: undefined,
  }));

  for (const forbiddenKey of [
    "factory",
    "module",
    "importSpecifier",
    "path",
    "url",
    "endpoint",
    "credential",
    "secret",
  ]) {
    assertRegistryError(
      () => createStaticPaymentProviderAdapterRegistry({
        [forbiddenKey]: "synthetic-secret-marker",
      }),
      "invalid_payment_adapter_registry",
    );
  }

  const invalidOptions = [
    null,
    [],
    Object.create(null),
    { nowFn: new Proxy(() => NOW, {}) },
    { credentialLoader: {} },
    { credentialLoader: { withCredential: "not-a-function" } },
    { credentialLoader: { withCredential() {}, extra: true } },
    { transports: null },
    { transports: { unknown_adapter_v1: transports.paypal_v1 } },
    {
      transports: {
        paypal_v1: {
          ...transports.paypal_v1,
          endpoint: "synthetic-secret-marker",
        },
      },
    },
    {
      transports: {
        paypal_v1: {
          requestFn: new Proxy(requestFn, {}),
          allowedActionOrigins: [],
        },
      },
    },
    {
      transports: {
        paypal_v1: {
          requestFn,
          allowedActionOrigins: ["http://synthetic-secret-marker.example.test"],
        },
      },
    },
    {
      transports: {
        paypal_v1: {
          requestFn,
          allowedActionOrigins: ["https://provider-a.example.test/"],
        },
      },
    },
  ];
  for (const options of invalidOptions) {
    assertRegistryError(
      () => createStaticPaymentProviderAdapterRegistry(options),
      "invalid_payment_adapter_registry",
    );
  }

  const optionCounters = { get: 0, ownKeys: 0, descriptor: 0 };
  assertRegistryError(
    () => createStaticPaymentProviderAdapterRegistry(
      trappingProxy({}, optionCounters),
    ),
    "invalid_payment_adapter_registry",
  );
  assert.deepEqual(optionCounters, { get: 0, ownKeys: 0, descriptor: 0 });

  let accessorCalls = 0;
  const accessorOptions = {};
  Object.defineProperty(accessorOptions, "transports", {
    enumerable: true,
    get() {
      accessorCalls += 1;
      return "synthetic-secret-marker";
    },
  });
  assertRegistryError(
    () => createStaticPaymentProviderAdapterRegistry(accessorOptions),
    "invalid_payment_adapter_registry",
  );
  assert.equal(accessorCalls, 0);

  const symbolic = {};
  symbolic[Symbol("synthetic-secret-marker")] = true;
  assertRegistryError(
    () => createStaticPaymentProviderAdapterRegistry(symbolic),
    "invalid_payment_adapter_registry",
  );
});

test("construct, list, resolve, and disabled rejection perform no loader, request, or time call", async () => {
  const counters = { loader: 0, request: 0, now: 0 };
  const registry = createStaticPaymentProviderAdapterRegistry({
    credentialLoader: {
      withCredential() {
        counters.loader += 1;
        throw new Error("must-not-run");
      },
    },
    transports: {
      paypal_v1: {
        requestFn() {
          counters.request += 1;
          throw new Error("must-not-run");
        },
        allowedActionOrigins: ["https://provider-a.example.test"],
      },
      xsd_v1: {
        requestFn() {
          counters.request += 1;
          throw new Error("must-not-run");
        },
        allowedActionOrigins: ["https://provider-b.example.test"],
      },
    },
    nowFn() {
      counters.now += 1;
      return NOW;
    },
  });
  registry.list();
  for (const adapterKey of [
    "paypal_v1",
    "xsd_v1",
    "chaojipay_v1",
  ]) {
    const adapter = registry.resolve(knownResolution({
      adapterKey,
      credentialProfileRef: `credential-${adapterKey}`,
      declaredCapabilities: { ...TRUE_CAPABILITIES },
    }));
    await assert.rejects(
      () => adapter.createRechargeOrder({}),
      /payment_provider_capability_disabled/u,
    );
  }
  assert.deepEqual(counters, { loader: 0, request: 0, now: 0 });

  const defaults = createStaticPaymentProviderAdapterRegistry();
  defaults.list();
  const defaultAdapter = defaults.resolve(knownResolution());
  await assert.rejects(
    () => defaultAdapter.queryPayment({}),
    /payment_provider_capability_disabled/u,
  );
});

test("Registry projections Adapters and errors never contain synthetic secret markers", () => {
  const marker = "synthetic-secret-marker";
  const registry = createStaticPaymentProviderAdapterRegistry({
    credentialLoader: {
      withCredential() {
        throw new Error(marker);
      },
    },
    transports: {
      paypal_v1: {
        requestFn() {
          throw new Error(marker);
        },
        allowedActionOrigins: [`https://${marker}.example.test`],
      },
    },
  });
  const adapter = registry.resolve(knownResolution({
    profileRef: marker,
    credentialProfileRef: `${marker}-credential`,
  }));
  assert.doesNotMatch(JSON.stringify(registry.list()), new RegExp(marker, "u"));
  assert.doesNotMatch(JSON.stringify(adapter), new RegExp(marker, "u"));

  let captured;
  try {
    registry.resolve({
      adapterKey: marker,
      declaredCapabilities: { ...FALSE_CAPABILITIES },
    });
  } catch (error) {
    captured = error;
  }
  assert.ok(captured instanceof Error);
  assert.doesNotMatch(JSON.stringify(captured), new RegExp(marker, "u"));
  assert.equal(Object.hasOwn(captured, "cause"), false);
});

test("registry source is static and contains no runtime or provider integration seam", async () => {
  const source = await readFile(
    new URL(
      "../services/platform/payment-provider-adapter-registry.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /\bimport\s*\(/u);
  assert.doesNotMatch(source, /\b(?:Store|SQLite|wallet|Portal|Admin)\b/iu);
  assert.doesNotMatch(source, /\bprocess\.env\b/u);
  assert.doesNotMatch(source, /\b(?:fetch|axios|undici|http|https)\b/iu);
  assert.doesNotMatch(source, /\b(?:route|router|listen|server)\b/iu);
  assert.doesNotMatch(source, /createRequire|modulePath|importSpecifier/u);
});
