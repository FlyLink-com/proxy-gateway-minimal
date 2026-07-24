import { types as utilTypes } from "node:util";

import { normalizePaymentProviderError } from "./payment-provider-adapter-contract.mjs";

const OPERATIONS = new Set([
  "create_recharge_order",
  "query_payment",
  "verify_callback",
  "refund",
  "reconcile",
]);

function requestedOperation(value) {
  if (value === null || typeof value !== "object" || utilTypes.isProxy(value)) {
    return null;
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, "operation");
  return descriptor && Object.hasOwn(descriptor, "value") && OPERATIONS.has(descriptor.value)
    ? descriptor.value
    : null;
}

export function createProviderAPaymentAdapter({ nowFn } = {}) {
  if (nowFn !== undefined && (typeof nowFn !== "function" || utilTypes.isProxy(nowFn))) {
    throw new TypeError("invalid_now_fn");
  }
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
    adapterKey: "provisional_provider_a_v1",
    providerId: "provisional_provider_a",
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
      return normalizePaymentProviderError({
        code: requested ? "provider_contract_unverified" : "provider_operation_failed",
        operation,
        retryable: false,
        chargeCertainty: requested ? "confirmed_no_charge" : "unknown",
        providerOrderRef: null,
        occurredAt: timestamp(),
      });
    },
    webhookSuccessAck: () => disabled("verify_callback"),
    refund: () => disabled("refund"),
    reconcile: () => disabled("reconcile"),
  };
}
