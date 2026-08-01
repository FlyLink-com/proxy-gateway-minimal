import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPaymentProviderAdapterContract,
  createCredentialScopedPaymentExecution,
} from "../services/platform/payment-provider-adapter-contract.mjs";
import { createPayPalPaymentAdapter } from "../services/platform/paypal-payment-adapter.mjs";

const NOW = "2026-08-01T00:00:00.000Z";
const EXPIRES_AT = "2026-08-01T00:10:00.000Z";
const ACTION_ORIGIN = "https://www.sandbox.paypal.com";
const MERCHANT_DIGEST = "a".repeat(64);
const PAYLOAD_DIGEST = "b".repeat(64);

const CREATE_INPUT = Object.freeze({
  paymentOrderRef: "payment_order_1",
  attemptRef: "attempt_1",
  providerRequestRef: "provider_create_1",
  paymentMethod: "paypal",
  amountMinor: 100,
  currency: "USD",
  currencyExponent: 2,
  expectedPaidCoins: 30,
  quoteDigest: "c".repeat(64),
  expiresAt: EXPIRES_AT,
  callbackRouteRef: "portal_payment_callback_v1",
  returnRouteRef: "portal_wallet_return_v1",
});

const CAPTURE_INPUT = Object.freeze({
  paymentOrderRef: "payment_order_1",
  attemptRef: "attempt_1",
  providerOrderRef: "paypal_order_1",
  captureRequestRef: "provider_capture_1",
  amountMinor: 100,
  currency: "USD",
  currencyExponent: 2,
});

function callbackInput() {
  const event = {
    id: "paypal_event_1",
    event_type: "PAYMENT.CAPTURE.COMPLETED",
    resource: {
      id: "paypal_capture_1",
      status: "COMPLETED",
      custom_id: "payment_order_1",
      supplementary_data: { related_ids: { order_id: "paypal_order_1" } },
      amount: { currency_code: "USD", value: "1.00" },
    },
  };
  return {
    callbackRequestRef: "callback_request_1",
    receivedAt: NOW,
    bodyBase64: Buffer.from(JSON.stringify(event), "utf8").toString("base64"),
    headerEntries: [
      { name: "paypal-auth-algo", value: "SHA256withRSA" },
      { name: "paypal-cert-url", value: "https://api.paypal.com/v1/notifications/certs/CERT-safe" },
      { name: "paypal-transmission-id", value: "transmission_1" },
      { name: "paypal-transmission-sig", value: "signature_1" },
      { name: "paypal-transmission-time", value: NOW },
    ],
  };
}

function createExecutionScope() {
  return createCredentialScopedPaymentExecution({
    profileRef: "paypal_sandbox_profile",
    adapterKey: "paypal_v1",
    contractVersion: "v1",
    credentialProfileRef: "paypal_sandbox_credential",
    credentialLoader: {
      withCredential(_binding, callback) {
        return callback({ opaque: "secret-marker" });
      },
    },
    requestFn({ request }) {
      if (request.action === "paypal_orders_create") {
        return {
          response: {
            id: "paypal_order_1",
            status: "CREATED",
            links: [{
              rel: "approve",
              href: `${ACTION_ORIGIN}/checkoutnow?token=safe`,
            }],
          },
          evidence: null,
        };
      }
      if (request.action === "paypal_orders_query") {
        return {
          response: { id: "paypal_order_1", status: "APPROVED" },
          evidence: null,
        };
      }
      if (request.action === "paypal_orders_capture") {
        return {
          response: {
            id: "paypal_order_1",
            status: "COMPLETED",
            purchase_units: [{
              custom_id: "payment_order_1",
              payments: { captures: [{
                id: "paypal_capture_1",
                status: "COMPLETED",
                amount: { currency_code: "USD", value: "1.00" },
              }] },
            }],
          },
          evidence: {
            merchantScopeDigest: MERCHANT_DIGEST,
            payloadDigest: PAYLOAD_DIGEST,
          },
        };
      }
      return {
        response: { verification_status: "SUCCESS" },
        evidence: {
          merchantScopeDigest: MERCHANT_DIGEST,
          payloadDigest: PAYLOAD_DIGEST,
        },
      };
    },
    allowedActionOrigins: [ACTION_ORIGIN],
  });
}

test("PayPal v1 creates, queries, captures, and verifies through scoped transport", async () => {
  const raw = createPayPalPaymentAdapter({
    executionScope: createExecutionScope(),
    nowFn: () => NOW,
  });
  assert.equal(raw.contractVersion, "v1");
  assert.deepEqual(raw.supportedPaymentMethods, ["paypal"]);
  assert.deepEqual(raw.capabilities, {
    createRechargeOrder: true,
    queryPayment: true,
    capturePayment: true,
    verifyCallback: true,
    refund: false,
    reconcile: false,
    repeatCreateIdempotent: true,
    repeatCaptureIdempotent: true,
  });
  const adapter = assertPaymentProviderAdapterContract(raw, {
    allowedActionOrigins: [ACTION_ORIGIN],
  });
  const created = await adapter.createRechargeOrder(CREATE_INPUT);
  assert.equal(created.status, "entry_ready");
  assert.equal(created.providerOrderRef, "paypal_order_1");
  const queried = await adapter.queryPayment({
    paymentOrderRef: "payment_order_1",
    attemptRef: "attempt_1",
    providerOrderRef: "paypal_order_1",
  });
  assert.equal(queried.status, "pending");
  const captured = await adapter.capturePayment(CAPTURE_INPUT);
  assert.equal(captured.paymentFact.eventType, "payment_succeeded");
  assert.equal(captured.paymentFact.providerCaptureRef, "paypal_capture_1");
  const callback = await adapter.verifyAndNormalizeCallback(callbackInput());
  assert.equal(callback.sourceType, "callback");
  assert.deepEqual(await adapter.webhookSuccessAck(callback), {
    statusCode: 204,
    contentType: "text/plain",
    body: "",
  });
  assert.doesNotMatch(JSON.stringify({ created, queried, captured, callback }), /secret-marker/u);
  await assert.rejects(() => adapter.refund({}), /payment_provider_capability_disabled/u);
  await assert.rejects(() => adapter.reconcile({}), /payment_provider_capability_disabled/u);
});

test("PayPal adapter requires an exact injected scope and canonical clock", () => {
  for (const options of [
    {},
    { executionScope: {}, nowFn: () => NOW },
    { executionScope: createExecutionScope(), nowFn: "invalid" },
    { executionScope: createExecutionScope(), nowFn: () => NOW, extra: true },
  ]) {
    assert.throws(
      () => createPayPalPaymentAdapter(options),
      /invalid_payment_provider_adapter/u,
    );
  }
});
