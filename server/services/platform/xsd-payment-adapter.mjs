import { types as utilTypes } from "node:util";

import { normalizePaymentProviderError } from "./payment-provider-adapter-contract.mjs";
import { createUnverifiedPaymentAdapter } from "./unverified-payment-adapter.mjs";
import {
  decodeVerifiedXsdCallback, decodeXsdCreateResponse, decodeXsdQueryResponse,
  encodeXsdCallbackVerificationRequest, encodeXsdCreateRequest, encodeXsdQueryRequest,
} from "./xsd-payment-protocol-codec.mjs";

const OPERATIONS = new Set(["create_recharge_order", "query_payment", "capture_payment", "verify_callback", "refund", "reconcile"]);

function invalid() { throw new TypeError("invalid_payment_provider_adapter"); }

function options(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== 2 || !Object.hasOwn(descriptors, "executionScope") || !Object.hasOwn(descriptors, "nowFn")) invalid();
  const executionScope = descriptors.executionScope.value;
  const nowFn = descriptors.nowFn.value;
  if (!descriptors.executionScope.enumerable || !descriptors.nowFn.enumerable || executionScope === null || typeof executionScope !== "object" || utilTypes.isProxy(executionScope) || Object.getPrototypeOf(executionScope) !== Object.prototype || typeof nowFn !== "function" || utilTypes.isProxy(nowFn)) invalid();
  const executionDescriptors = Object.getOwnPropertyDescriptors(executionScope);
  if (Reflect.ownKeys(executionDescriptors).length !== 1 || !Object.hasOwn(executionDescriptors, "withCredential")) invalid();
  const withCredentialDescriptor = executionDescriptors.withCredential;
  const withCredential = withCredentialDescriptor.value;
  if (!withCredentialDescriptor.enumerable || !Object.hasOwn(withCredentialDescriptor, "value") || typeof withCredential !== "function" || utilTypes.isProxy(withCredential)) invalid();
  return { executionScope, nowFn, withCredential };
}

function now(nowFn) {
  try {
    const value = nowFn();
    const iso = value instanceof Date ? value.toISOString() : value;
    if (typeof iso !== "string" || new Date(iso).toISOString() !== iso) invalid();
    return iso;
  } catch { invalid(); }
}

function requestedOperation(value) {
  if (value === null || typeof value !== "object" || utilTypes.isProxy(value)) return "reconcile";
  const descriptor = Object.getOwnPropertyDescriptor(value, "operation");
  return descriptor && Object.hasOwn(descriptor, "value") && OPERATIONS.has(descriptor.value) ? descriptor.value : "reconcile";
}

export function createXsdPaymentAdapter(value = {}) {
  if (
    value !== null && typeof value === "object" && !Array.isArray(value)
    && !utilTypes.isProxy(value) && Object.getPrototypeOf(value) === Object.prototype
    && Reflect.ownKeys(Object.getOwnPropertyDescriptors(value)).length === 0
  ) {
    return createUnverifiedPaymentAdapter({ adapterKey: "xsd_v1", providerId: "xsd" });
  }
  const { executionScope, nowFn, withCredential } = options(value);
  const unsupported = () => Promise.reject(new Error("payment_provider_capability_disabled"));
  return Object.freeze({
    adapterKey: "xsd_v1", providerId: "xsd", contractVersion: "v1",
    capabilities: Object.freeze({ createRechargeOrder: true, queryPayment: true, capturePayment: false, verifyCallback: true, refund: false, reconcile: false, repeatCreateIdempotent: false, repeatCaptureIdempotent: false }),
    supportedPaymentMethods: Object.freeze(["alipay", "wechat_pay"]),
    createRechargeOrder(input) {
      return withCredential.call(executionScope, "create_recharge_order", async ({ request }) => decodeXsdCreateResponse({ createInput: input, providerResponse: (await request(encodeXsdCreateRequest(input))).response, receivedAt: now(nowFn) }));
    },
    queryPayment(input) {
      return withCredential.call(executionScope, "query_payment", async ({ request }) => decodeXsdQueryResponse({ queryInput: input, providerResponse: (await request(encodeXsdQueryRequest(input))).response, receivedAt: now(nowFn) }));
    },
    verifyAndNormalizeCallback(input) {
      return withCredential.call(executionScope, "verify_callback", async ({ request }) => {
        const transport = await request(encodeXsdCallbackVerificationRequest(input));
        const paymentFact = decodeVerifiedXsdCallback({ callbackInput: input, providerResponse: transport.response, merchantScopeDigest: transport.evidence.merchantScopeDigest, payloadDigest: transport.evidence.payloadDigest });
        return { transportReceipt: transport.transportReceipt, paymentFact };
      });
    },
    normalizeError(value) {
      return normalizePaymentProviderError({ code: "provider_operation_failed", operation: requestedOperation(value), retryable: false, chargeCertainty: "unknown", providerOrderRef: null, occurredAt: now(nowFn) });
    },
    webhookSuccessAck() { return Object.freeze({ statusCode: 200, contentType: "text/plain", body: "SUCCESS" }); },
    capturePayment: unsupported, refund: unsupported, reconcile: unsupported,
  });
}
