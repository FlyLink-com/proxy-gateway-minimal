import { types as utilTypes } from "node:util";

import {
  assertPaymentProviderAdapterContract,
  createCredentialScopedPaymentExecution,
} from "./payment-provider-adapter-contract.mjs";
import {
  createPayPalPaymentAdapter,
} from "./paypal-payment-adapter.mjs";
import {
  createXsdPaymentAdapter,
} from "./xsd-payment-adapter.mjs";
import {
  createChaoJiPayPaymentAdapter,
} from "./chaojipay-payment-adapter.mjs";

const REGISTRY_ERROR_CODES = new Set([
  "invalid_payment_adapter_registry",
  "invalid_payment_adapter_resolution",
  "payment_adapter_not_registered",
]);
const REGISTRY_OPTION_KEYS = ["credentialLoader", "transports", "nowFn"];
const RESOLUTION_KEYS = [
  "adapterKey",
  "profileRef",
  "contractVersion",
  "credentialProfileRef",
  "declaredCapabilities",
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
const OPERATION_CAPABILITY_KEYS = [
  "createRechargeOrder",
  "queryPayment",
  "capturePayment",
  "verifyCallback",
  "refund",
  "reconcile",
];
const TRANSPORT_KEYS = ["requestFn", "allowedActionOrigins"];
const SAFE_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const ADAPTER_FACTORIES = Object.freeze({
  paypal_v1: createPayPalPaymentAdapter,
  xsd_v1: createXsdPaymentAdapter,
  chaojipay_v1: createChaoJiPayPaymentAdapter,
});
const COMPILED_ADAPTER_KEYS = Object.freeze(Object.keys(ADAPTER_FACTORIES));

function registryError(code) {
  if (!REGISTRY_ERROR_CODES.has(code)) {
    throw new Error("invalid_registry_error_code");
  }
  const error = new Error(code);
  error.code = code;
  return Object.freeze(error);
}

function fail(code) {
  throw registryError(code);
}

function snapshotObject(value, allowedKeys, exact, code) {
  if (
    value === null
    || typeof value !== "object"
    || utilTypes.isProxy(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail(code);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.some((key) => typeof key !== "string" || !allowedKeys.includes(key))
    || (exact && (
      keys.length !== allowedKeys.length
      || allowedKeys.some((key) => !Object.hasOwn(descriptors, key))
    ))
  ) {
    fail(code);
  }
  const result = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      !descriptor
      || !Object.hasOwn(descriptor, "value")
      || descriptor.enumerable !== true
    ) {
      fail(code);
    }
    result[key] = descriptor.value;
  }
  return result;
}

function snapshotArray(value, code) {
  if (
    utilTypes.isProxy(value)
    || !Array.isArray(value)
    || Object.getPrototypeOf(value) !== Array.prototype
  ) {
    fail(code);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  const lengthDescriptor = descriptors.length;
  if (
    keys.some((key) => typeof key !== "string")
    || !lengthDescriptor
    || !Object.hasOwn(lengthDescriptor, "value")
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
    || keys.length !== lengthDescriptor.value + 1
  ) {
    fail(code);
  }
  const result = [];
  for (let index = 0; index < lengthDescriptor.value; index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      !descriptor
      || !Object.hasOwn(descriptor, "value")
      || descriptor.enumerable !== true
    ) {
      fail(code);
    }
    result.push(descriptor.value);
  }
  return result;
}

function snapshotFunction(value, code) {
  if (typeof value !== "function" || utilTypes.isProxy(value)) fail(code);
  return value;
}

function safeRef(value, code) {
  if (typeof value !== "string" || !SAFE_REF_RE.test(value)) fail(code);
  return value;
}

function failClosedCredentialUse() {
  return Promise.reject(new Error("payment_provider_credential_unavailable"));
}

function failClosedRequest() {
  return Promise.reject(new Error("payment_provider_transport_unavailable"));
}

const DEFAULT_CREDENTIAL_LOADER = Object.freeze({
  withCredential: failClosedCredentialUse,
});
const DEFAULT_TRANSPORT = Object.freeze({
  requestFn: failClosedRequest,
  allowedActionOrigins: Object.freeze([]),
});
const INERT_DESCRIPTOR_EXECUTION_SCOPE = Object.freeze({
  withCredential: failClosedCredentialUse,
});
const INERT_DESCRIPTOR_NOW = () => "1970-01-01T00:00:00.000Z";

function normalizeCredentialLoader(value) {
  if (value === undefined) return DEFAULT_CREDENTIAL_LOADER;
  const input = snapshotObject(
    value,
    ["withCredential"],
    true,
    "invalid_payment_adapter_registry",
  );
  return Object.freeze({
    withCredential: snapshotFunction(
      input.withCredential,
      "invalid_payment_adapter_registry",
    ),
  });
}

function validateOriginsWithContract({
  adapterKey,
  credentialLoader,
  requestFn,
  allowedActionOrigins,
}) {
  try {
    createCredentialScopedPaymentExecution({
      profileRef: "registry_validation_profile",
      adapterKey,
      contractVersion: "unverified",
      credentialProfileRef: "registry_validation_credential",
      credentialLoader,
      requestFn,
      allowedActionOrigins,
    });
  } catch {
    fail("invalid_payment_adapter_registry");
  }
}

function normalizeTransport(value, adapterKey, credentialLoader) {
  if (value === undefined) return DEFAULT_TRANSPORT;
  const input = snapshotObject(
    value,
    TRANSPORT_KEYS,
    true,
    "invalid_payment_adapter_registry",
  );
  const requestFn = snapshotFunction(
    input.requestFn,
    "invalid_payment_adapter_registry",
  );
  const allowedActionOrigins = Object.freeze(snapshotArray(
    input.allowedActionOrigins,
    "invalid_payment_adapter_registry",
  ));
  validateOriginsWithContract({
    adapterKey,
    credentialLoader,
    requestFn,
    allowedActionOrigins,
  });
  return Object.freeze({ requestFn, allowedActionOrigins });
}

function normalizeTransports(value, credentialLoader) {
  const input = value === undefined
    ? {}
    : snapshotObject(
      value,
      COMPILED_ADAPTER_KEYS,
      false,
      "invalid_payment_adapter_registry",
    );
  const result = {};
  for (const adapterKey of COMPILED_ADAPTER_KEYS) {
    result[adapterKey] = normalizeTransport(
      input[adapterKey],
      adapterKey,
      credentialLoader,
    );
  }
  return Object.freeze(result);
}

function compiledDescriptor(adapterKey, factory) {
  const raw = factory({
    executionScope: INERT_DESCRIPTOR_EXECUTION_SCOPE,
    nowFn: INERT_DESCRIPTOR_NOW,
  });
  return Object.freeze({
    adapterKey,
    providerId: raw.providerId,
    contractVersion: raw.contractVersion,
    capabilities: Object.freeze(Object.fromEntries(
      CAPABILITY_KEYS.map((key) => [key, raw.capabilities[key]]),
    )),
    supportedPaymentMethods: Object.freeze([...raw.supportedPaymentMethods]),
  });
}

const COMPILED_DESCRIPTORS = Object.freeze(
  Object.entries(ADAPTER_FACTORIES).map(([adapterKey, factory]) => (
    compiledDescriptor(adapterKey, factory)
  )),
);

function detachedDescriptor(descriptor) {
  return Object.freeze({
    adapterKey: descriptor.adapterKey,
    providerId: descriptor.providerId,
    contractVersion: descriptor.contractVersion,
    capabilities: Object.freeze({ ...descriptor.capabilities }),
    supportedPaymentMethods: Object.freeze([
      ...descriptor.supportedPaymentMethods,
    ]),
  });
}

function snapshotKnownResolution(value) {
  if (
    value === null
    || typeof value !== "object"
    || utilTypes.isProxy(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail("invalid_payment_adapter_resolution");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.some((key) => typeof key !== "string")
    || keys.some((key) => {
      const descriptor = descriptors[key];
      return (
        !descriptor
        || !Object.hasOwn(descriptor, "value")
        || descriptor.enumerable !== true
      );
    })
  ) {
    fail("invalid_payment_adapter_resolution");
  }
  const adapterDescriptor = descriptors.adapterKey;
  if (
    !adapterDescriptor
    || typeof adapterDescriptor.value !== "string"
  ) {
    fail("invalid_payment_adapter_resolution");
  }
  const adapterKey = adapterDescriptor.value;
  if (!Object.hasOwn(ADAPTER_FACTORIES, adapterKey)) {
    fail("payment_adapter_not_registered");
  }
  if (
    keys.length !== RESOLUTION_KEYS.length
    || RESOLUTION_KEYS.some((key) => !Object.hasOwn(descriptors, key))
  ) {
    fail("invalid_payment_adapter_resolution");
  }
  return Object.fromEntries(
    RESOLUTION_KEYS.map((key) => [key, descriptors[key].value]),
  );
}

function normalizeDeclaredCapabilities(value) {
  const input = snapshotObject(
    value,
    CAPABILITY_KEYS,
    true,
    "invalid_payment_adapter_resolution",
  );
  if (CAPABILITY_KEYS.some((key) => typeof input[key] !== "boolean")) {
    fail("invalid_payment_adapter_resolution");
  }
  if (input.repeatCreateIdempotent && !input.createRechargeOrder) {
    fail("invalid_payment_adapter_resolution");
  }
  if (input.repeatCaptureIdempotent && !input.capturePayment) {
    fail("invalid_payment_adapter_resolution");
  }
  return input;
}

function resolveDescriptor(adapterKey) {
  return COMPILED_DESCRIPTORS.find(
    (descriptor) => descriptor.adapterKey === adapterKey,
  );
}

export function createStaticPaymentProviderAdapterRegistry(options = {}) {
  const input = snapshotObject(
    options,
    REGISTRY_OPTION_KEYS,
    false,
    "invalid_payment_adapter_registry",
  );
  const credentialLoader = normalizeCredentialLoader(input.credentialLoader);
  const nowFn = input.nowFn === undefined
    ? undefined
    : snapshotFunction(input.nowFn, "invalid_payment_adapter_registry");
  const transports = normalizeTransports(input.transports, credentialLoader);

  const list = () => Object.freeze(
    COMPILED_DESCRIPTORS.map(detachedDescriptor),
  );

  const resolve = (resolution) => {
    const known = snapshotKnownResolution(resolution);
    const descriptor = resolveDescriptor(known.adapterKey);
    if (
      descriptor === undefined
      || known.contractVersion !== descriptor.contractVersion
    ) {
      fail("invalid_payment_adapter_resolution");
    }
    const profileRef = safeRef(
      known.profileRef,
      "invalid_payment_adapter_resolution",
    );
    const credentialProfileRef = safeRef(
      known.credentialProfileRef,
      "invalid_payment_adapter_resolution",
    );
    const declaredCapabilities = normalizeDeclaredCapabilities(
      known.declaredCapabilities,
    );
    const transport = transports[known.adapterKey];

    let executionScope;
    try {
      executionScope = createCredentialScopedPaymentExecution({
        profileRef,
        adapterKey: known.adapterKey,
        contractVersion: descriptor.contractVersion,
        credentialProfileRef,
        credentialLoader,
        requestFn: transport.requestFn,
        allowedActionOrigins: transport.allowedActionOrigins,
      });
    } catch {
      fail("invalid_payment_adapter_resolution");
    }

    const factory = ADAPTER_FACTORIES[known.adapterKey];
    let raw;
    try {
      raw = factory({
        executionScope,
        nowFn: nowFn ?? (() => new Date().toISOString()),
      });
    } catch {
      fail("invalid_payment_adapter_resolution");
    }
    const capabilities = Object.freeze(Object.fromEntries(
      CAPABILITY_KEYS.map((key) => [
        key,
        raw.capabilities[key] && declaredCapabilities[key],
      ]),
    ));
    const anyOperationEnabled = OPERATION_CAPABILITY_KEYS.some(
      (key) => capabilities[key],
    );
    const supportedPaymentMethods = Object.freeze(
      anyOperationEnabled ? [...raw.supportedPaymentMethods] : [],
    );
    const effective = {
      ...raw,
      capabilities,
      supportedPaymentMethods,
    };

    try {
      return assertPaymentProviderAdapterContract(effective, {
        allowedActionOrigins: transport.allowedActionOrigins,
      });
    } catch {
      fail("invalid_payment_adapter_resolution");
    }
  };

  return Object.freeze({ list, resolve });
}
