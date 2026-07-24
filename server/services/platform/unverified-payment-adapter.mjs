import { types as utilTypes } from "node:util";

import { normalizePaymentProviderError } from "./payment-provider-adapter-contract.mjs";

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
const OPERATION_BY_METHOD = Object.freeze({
  createRechargeOrder: "create_recharge_order",
  queryPayment: "query_payment",
  capturePayment: "capture_payment",
  verifyAndNormalizeCallback: "verify_callback",
  webhookSuccessAck: "verify_callback",
  refund: "refund",
  reconcile: "reconcile",
});
const OPERATIONS = new Set(Object.values(OPERATION_BY_METHOD));
const FACTORY_OPTION_KEYS = ["executionScope", "nowFn"];
const SENTINEL_TIME = "1970-01-01T00:00:00.000Z";
const SAFE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function invalidAdapter() {
  throw new TypeError("invalid_payment_provider_adapter");
}

function snapshotObject(value, allowedKeys, exact) {
  if (
    value === null
    || typeof value !== "object"
    || utilTypes.isProxy(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    invalidAdapter();
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
    invalidAdapter();
  }
  const result = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      !Object.hasOwn(descriptor, "value")
      || descriptor.enumerable !== true
    ) {
      invalidAdapter();
    }
    result[key] = descriptor.value;
  }
  return result;
}

function snapshotFactoryOptions(options) {
  const input = snapshotObject(options, FACTORY_OPTION_KEYS, false);
  if (Object.hasOwn(input, "nowFn")) {
    if (typeof input.nowFn !== "function" || utilTypes.isProxy(input.nowFn)) {
      invalidAdapter();
    }
  }
  if (Object.hasOwn(input, "executionScope")) {
    const scope = snapshotObject(input.executionScope, ["withCredential"], true);
    if (typeof scope.withCredential !== "function" || utilTypes.isProxy(scope.withCredential)) {
      invalidAdapter();
    }
  }
}

function snapshotIdentity(identity) {
  const input = snapshotObject(identity, ["adapterKey", "providerId"], true);
  if (
    typeof input.adapterKey !== "string"
    || typeof input.providerId !== "string"
    || !SAFE_ID_RE.test(input.adapterKey)
    || !SAFE_ID_RE.test(input.providerId)
    || input.adapterKey === input.providerId
  ) {
    invalidAdapter();
  }
  return Object.freeze({
    adapterKey: input.adapterKey,
    providerId: input.providerId,
  });
}

function requestedOperation(value) {
  if (
    value === null
    || typeof value !== "object"
    || utilTypes.isProxy(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return null;
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, "operation");
  return descriptor
    && Object.hasOwn(descriptor, "value")
    && OPERATIONS.has(descriptor.value)
    ? descriptor.value
    : null;
}

function errorRecord(operation) {
  return {
    code: "provider_contract_unverified",
    operation,
    retryable: false,
    chargeCertainty: "confirmed_no_charge",
    providerOrderRef: null,
    occurredAt: SENTINEL_TIME,
  };
}

function invalidOperationRecord() {
  return {
    code: "provider_operation_failed",
    operation: "reconcile",
    retryable: false,
    chargeCertainty: "unknown",
    providerOrderRef: null,
    occurredAt: SENTINEL_TIME,
  };
}

export function createUnverifiedPaymentAdapter(identity, options = {}) {
  const resolvedIdentity = snapshotIdentity(identity);
  snapshotFactoryOptions(options);
  const reject = (operation) => {
    throw normalizePaymentProviderError(errorRecord(operation));
  };

  return {
    adapterKey: resolvedIdentity.adapterKey,
    providerId: resolvedIdentity.providerId,
    contractVersion: "unverified",
    capabilities: FALSE_CAPABILITIES,
    supportedPaymentMethods: Object.freeze([]),
    createRechargeOrder: () => reject(OPERATION_BY_METHOD.createRechargeOrder),
    queryPayment: () => reject(OPERATION_BY_METHOD.queryPayment),
    capturePayment: () => reject(OPERATION_BY_METHOD.capturePayment),
    verifyAndNormalizeCallback: () => reject(OPERATION_BY_METHOD.verifyAndNormalizeCallback),
    normalizeError: (value) => {
      const operation = requestedOperation(value);
      return operation === null ? invalidOperationRecord() : errorRecord(operation);
    },
    webhookSuccessAck: () => reject(OPERATION_BY_METHOD.webhookSuccessAck),
    refund: () => reject(OPERATION_BY_METHOD.refund),
    reconcile: () => reject(OPERATION_BY_METHOD.reconcile),
  };
}
