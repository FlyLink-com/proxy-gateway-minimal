import { types as utilTypes } from "node:util";

import { normalizePaymentProviderError } from "./payment-provider-adapter-contract.mjs";

const OPERATIONS = new Set([
  "create_recharge_order",
  "query_payment",
  "verify_callback",
  "refund",
  "reconcile",
]);
const FACTORY_OPTION_KEYS = new Set(["executionScope", "nowFn"]);

function snapshotFactoryNowFn(options) {
  const code = "invalid_payment_provider_adapter";
  if (
    options === null
    || typeof options !== "object"
    || utilTypes.isProxy(options)
    || Object.getPrototypeOf(options) !== Object.prototype
  ) {
    throw new TypeError(code);
  }
  const descriptors = Object.getOwnPropertyDescriptors(options);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.some((key) => typeof key !== "string" || !FACTORY_OPTION_KEYS.has(key))
    || keys.some((key) => (
      !Object.hasOwn(descriptors[key], "value")
      || descriptors[key].enumerable !== true
    ))
  ) {
    throw new TypeError(code);
  }
  if (!Object.hasOwn(descriptors, "nowFn")) return undefined;
  const nowFn = descriptors.nowFn.value;
  if (typeof nowFn !== "function" || utilTypes.isProxy(nowFn)) {
    throw new TypeError("invalid_now_fn");
  }
  return nowFn;
}

function requestedOperation(value) {
  if (value === null || typeof value !== "object" || utilTypes.isProxy(value)) {
    return null;
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, "operation");
  return descriptor && Object.hasOwn(descriptor, "value") && OPERATIONS.has(descriptor.value)
    ? descriptor.value
    : null;
}

export function createProviderBPaymentAdapter(options = {}) {
  const nowFn = snapshotFactoryNowFn(options);
  const timestamp = nowFn ?? (() => new Date().toISOString());
  const errorFor = (operation) => normalizePaymentProviderError({
    code: "provider_contract_unverified",
    operation,
    retryable: false,
    chargeCertainty: "confirmed_no_charge",
    providerOrderRef: null,
    occurredAt: timestamp(),
  });
  const disabled = (operation) => { throw errorFor(operation); };

  return {
    adapterKey: "provisional_provider_b_v1",
    providerId: "provisional_provider_b",
    contractVersion: "unverified",
    capabilities: Object.freeze({
      createRechargeOrder: false,
      queryPayment: false,
      verifyCallback: false,
      refund: false,
      reconcile: false,
      repeatCreateIdempotent: false,
    }),
    supportedPaymentMethods: Object.freeze([]),
    createRechargeOrder: () => disabled("create_recharge_order"),
    queryPayment: () => disabled("query_payment"),
    verifyAndNormalizeCallback: () => disabled("verify_callback"),
    normalizeError: (value) => {
      const requested = requestedOperation(value);
      const operation = requested ?? "reconcile";
      return {
        code: requested ? "provider_contract_unverified" : "provider_operation_failed",
        operation,
        retryable: false,
        chargeCertainty: requested ? "confirmed_no_charge" : "unknown",
        providerOrderRef: null,
        occurredAt: timestamp(),
      };
    },
    webhookSuccessAck: () => disabled("verify_callback"),
    refund: () => disabled("refund"),
    reconcile: () => disabled("reconcile"),
  };
}
