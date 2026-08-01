import { types as utilTypes } from "node:util";

import { normalizePaymentProviderError } from "./payment-provider-adapter-contract.mjs";
import {
  decodePayPalCaptureOrderResponse,
  decodePayPalCreateOrderResponse,
  decodePayPalQueryOrderResponse,
  decodeVerifiedPayPalWebhook,
  encodePayPalCaptureOrderRequest,
  encodePayPalCreateOrderRequest,
  encodePayPalQueryOrderRequest,
  encodePayPalWebhookVerificationRequest,
} from "./paypal-payment-protocol-codec.mjs";

const OPERATIONS = new Set([
  "create_recharge_order", "query_payment", "capture_payment",
  "verify_callback", "refund", "reconcile",
]);

function invalidAdapter() {
  throw new TypeError("invalid_payment_provider_adapter");
}

function normalizeOptions(value) {
  if (
    value === null || typeof value !== "object" || Array.isArray(value)
    || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
  ) invalidAdapter();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const expected = ["executionScope", "nowFn"];
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== expected.length
    || keys.some((key) => typeof key !== "string" || !expected.includes(key))
    || expected.some((key) => !Object.hasOwn(descriptors, key))
  ) invalidAdapter();
  for (const key of expected) {
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) invalidAdapter();
  }
  const executionScope = descriptors.executionScope.value;
  const nowFn = descriptors.nowFn.value;
  if (
    executionScope === null || typeof executionScope !== "object"
    || utilTypes.isProxy(executionScope)
    || typeof executionScope.withCredential !== "function"
    || utilTypes.isProxy(executionScope.withCredential)
    || typeof nowFn !== "function" || utilTypes.isProxy(nowFn)
  ) invalidAdapter();
  return { executionScope, nowFn };
}

function nowIso(nowFn) {
  try {
    const raw = nowFn();
    const value = raw instanceof Date ? raw.toISOString() : raw;
    if (typeof value !== "string" || new Date(value).toISOString() !== value) {
      invalidAdapter();
    }
    return value;
  } catch {
    invalidAdapter();
  }
}

function requestedOperation(value) {
  if (value === null || typeof value !== "object" || utilTypes.isProxy(value)) return null;
  const descriptor = Object.getOwnPropertyDescriptor(value, "operation");
  return descriptor && Object.hasOwn(descriptor, "value")
    && OPERATIONS.has(descriptor.value) ? descriptor.value : null;
}

export function createPayPalPaymentAdapter(options = {}) {
  const { executionScope, nowFn } = normalizeOptions(options);
  const unsupported = () => Promise.reject(new Error("payment_provider_capability_disabled"));
  return Object.freeze({
    adapterKey: "paypal_v1",
    providerId: "paypal_commerce",
    contractVersion: "v1",
    capabilities: Object.freeze({
      createRechargeOrder: true,
      queryPayment: true,
      capturePayment: true,
      verifyCallback: true,
      refund: false,
      reconcile: false,
      repeatCreateIdempotent: true,
      repeatCaptureIdempotent: true,
    }),
    supportedPaymentMethods: Object.freeze(["paypal"]),
    createRechargeOrder(input) {
      return executionScope.withCredential("create_recharge_order", async ({ request }) => {
        const transport = await request(encodePayPalCreateOrderRequest(input));
        return decodePayPalCreateOrderResponse({
          createInput: input,
          providerResponse: transport.response,
          receivedAt: nowIso(nowFn),
        });
      });
    },
    queryPayment(input) {
      return executionScope.withCredential("query_payment", async ({ request }) => {
        const transport = await request(encodePayPalQueryOrderRequest(input));
        return decodePayPalQueryOrderResponse({
          queryInput: input,
          providerResponse: transport.response,
          receivedAt: nowIso(nowFn),
        });
      });
    },
    capturePayment(input) {
      return executionScope.withCredential("capture_payment", async ({ request }) => {
        const transport = await request(encodePayPalCaptureOrderRequest(input));
        return {
          transportReceipt: transport.transportReceipt,
          captureOutcome: decodePayPalCaptureOrderResponse({
            captureInput: input,
            providerResponse: transport.response,
            merchantScopeDigest: transport.evidence.merchantScopeDigest,
            payloadDigest: transport.evidence.payloadDigest,
            receivedAt: nowIso(nowFn),
          }),
        };
      });
    },
    verifyAndNormalizeCallback(input) {
      return executionScope.withCredential("verify_callback", async ({ request }) => {
        const transport = await request(encodePayPalWebhookVerificationRequest(input));
        return {
          transportReceipt: transport.transportReceipt,
          paymentFact: decodeVerifiedPayPalWebhook({
            callbackInput: input,
            verificationResponse: transport.response,
            merchantScopeDigest: transport.evidence.merchantScopeDigest,
            payloadDigest: transport.evidence.payloadDigest,
          }),
        };
      });
    },
    normalizeError(value) {
      return normalizePaymentProviderError({
        code: "provider_operation_failed",
        operation: requestedOperation(value) ?? "reconcile",
        retryable: false,
        chargeCertainty: "unknown",
        providerOrderRef: null,
        occurredAt: nowIso(nowFn),
      });
    },
    webhookSuccessAck() {
      return Object.freeze({ statusCode: 204, contentType: "text/plain", body: "" });
    },
    refund: unsupported,
    reconcile: unsupported,
  });
}
