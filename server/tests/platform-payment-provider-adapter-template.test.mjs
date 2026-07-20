import assert from "node:assert/strict";
import test from "node:test";
import {
  createPaymentProviderAdapterTemplate,
  normalizeVerifiedPaymentProviderEvent,
  summarizePaymentProviderEnvironment
} from "../services/platform/payment-provider-adapter-template.mjs";

const NOW = "2026-05-31T00:00:00.000Z";

test("payment provider environment summary reports configured placeholders without exposing values", () => {
  const summary = summarizePaymentProviderEnvironment({
    PAYMENT_PROVIDER: "paypal",
    PAYMENT_MODE: "sandbox",
    PAYMENT_PROVIDER_API_KEY: "paypal-client-id-safe-test",
    PAYMENT_PROVIDER_API_SECRET: "paypal-client-secret-sensitive",
    PAYMENT_PROVIDER_WEBHOOK_SECRET: "paypal-webhook-secret-sensitive",
    PAYMENT_PUBLIC_BASE_URL: "https://pay.example.com",
    PAYMENT_RETURN_URL: "https://pay.example.com/return",
    PAYMENT_CANCEL_URL: "https://pay.example.com/cancel"
  });

  assert.equal(summary.provider, "paypal");
  assert.equal(summary.mode, "sandbox");
  assert.equal(summary.configured.apiKeyConfigured, true);
  assert.equal(summary.configured.apiSecretConfigured, true);
  assert.equal(summary.configured.webhookSecretConfigured, true);
  assert.equal(summary.urls.returnUrlConfigured, true);
  assert.equal(summary.safety.noRawApiSecret, true);
  assert.doesNotMatch(JSON.stringify(summary), /paypal-client-secret-sensitive|paypal-webhook-secret-sensitive/i);
});

test("payment provider environment summary models WorldFirst RSA integration requirements", () => {
  const summary = summarizePaymentProviderEnvironment({
    PAYMENT_PROVIDER: "worldfirst",
    PAYMENT_MODE: "sandbox",
    PAYMENT_PROVIDER_CLIENT_ID: "worldfirst-client-id",
    PAYMENT_PROVIDER_PRIVATE_KEY_PATH: "/operator-only/worldfirst/client-private-key.pem",
    PAYMENT_PROVIDER_PLATFORM_PUBLIC_KEY_PATH: "/operator-only/worldfirst/platform-public-key.pem",
    PAYMENT_PUBLIC_BASE_URL: "https://pay.example.com",
    PAYMENT_RETURN_URL: "https://pay.example.com/return",
    PAYMENT_CANCEL_URL: "https://pay.example.com/cancel"
  });

  assert.equal(summary.provider, "worldfirst");
  assert.deepEqual(summary.requiredEnv, [
    "PAYMENT_PROVIDER_CLIENT_ID",
    "PAYMENT_PROVIDER_PRIVATE_KEY_PATH",
    "PAYMENT_PROVIDER_PLATFORM_PUBLIC_KEY_PATH"
  ]);
  assert.equal(summary.configured.clientIdConfigured, true);
  assert.equal(summary.configured.privateKeyPathConfigured, true);
  assert.equal(summary.configured.platformPublicKeyPathConfigured, true);
  assert.doesNotMatch(JSON.stringify(summary), /worldfirst-client-id|client-private-key|platform-public-key/i);
});

test("payment provider environment summary rejects non-https public URLs outside loopback test mode", () => {
  assert.throws(() => summarizePaymentProviderEnvironment({
    PAYMENT_PROVIDER: "stripe",
    PAYMENT_PUBLIC_BASE_URL: "http://pay.example.com"
  }), /must be https/);

  const summary = summarizePaymentProviderEnvironment({
    PAYMENT_PROVIDER: "mock",
    PAYMENT_PUBLIC_BASE_URL: "http://127.0.0.1:4173"
  }, { allowLocalTest: true });

  assert.equal(summary.urls.publicBaseUrlConfigured, true);
});

test("payment adapter template fails closed for real provider operations", async () => {
  const adapter = createPaymentProviderAdapterTemplate({
    provider: "wechat",
    env: {
      PAYMENT_PROVIDER: "wechat",
      PAYMENT_MODE: "sandbox"
    }
  });

  assert.equal(adapter.provider, "wechatpay");
  await assert.rejects(() => adapter.createRechargeOrder({ amountMinor: 100 }), /provider-specific adapter/);
  await assert.rejects(() => adapter.capturePayment({ providerOrderRef: "order_1" }), /provider-specific adapter/);
  await assert.rejects(() => adapter.verifyWebhook({}), /provider-specific adapter/);
});

test("verified provider event normalizes into billing event and rejects raw payment material", () => {
  const event = normalizeVerifiedPaymentProviderEvent({
    id: "evt_001",
    provider: "alipay",
    providerEventRef: "alipay_event_001",
    idempotencyKey: "idem_alipay_001",
    orderId: "recharge_001",
    eventType: "payment_succeeded",
    verificationStatus: "verified"
  }, { now: NOW });

  assert.deepEqual(event, {
    id: "evt_001",
    type: "billing_payment_event",
    provider: "alipay",
    providerEventRef: "alipay_event_001",
    idempotencyKey: "idem_alipay_001",
    orderId: "recharge_001",
    eventType: "payment_succeeded",
    signatureStatus: "verified",
    receivedAt: NOW,
    createdAt: NOW
  });

  assert.throws(() => normalizeVerifiedPaymentProviderEvent({
    id: "evt_unsafe",
    provider: "stripe",
    providerEventRef: "stripe_event_001",
    idempotencyKey: "idem_stripe_001",
    orderId: "recharge_002",
    eventType: "payment_succeeded",
    verificationStatus: "unverified"
  }, { now: NOW }), /must be verified/);

  assert.throws(() => normalizeVerifiedPaymentProviderEvent({
    id: "evt_raw",
    provider: "stripe",
    providerEventRef: "stripe_event_002",
    idempotencyKey: "idem_stripe_002",
    orderId: "recharge_003",
    eventType: "payment_succeeded",
    verificationStatus: "verified",
    rawProviderPayload: { card: "secret" }
  }, { now: NOW }), /rawProviderPayload is not allowed/);
});
