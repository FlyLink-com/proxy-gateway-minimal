import assert from "node:assert/strict";
import test from "node:test";
import {
  createPayPalPaymentAdapter,
  summarizePayPalPaymentEnvironment
} from "../services/platform/paypal-payment-adapter.mjs";

const NOW = "2026-07-20T09:00:00.000Z";

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    }
  };
}

function configuredEnv(overrides = {}) {
  return {
    PAYMENT_PROVIDER: "paypal",
    PAYMENT_MODE: "sandbox",
    PAYMENT_PROVIDER_API_KEY: "paypal-client-id-safe",
    PAYMENT_PROVIDER_API_SECRET: "paypal-client-secret-sensitive",
    PAYMENT_PROVIDER_WEBHOOK_SECRET: "paypal-webhook-id-sensitive",
    PAYMENT_PUBLIC_BASE_URL: "https://portal.example.test",
    PAYMENT_RETURN_URL: "https://portal.example.test/paypal/return",
    PAYMENT_CANCEL_URL: "https://portal.example.test/paypal/cancel",
    PAYMENT_PROVIDER_CURRENCY: "USD",
    ...overrides
  };
}

test("PayPal sandbox summary exposes hosted UI config without client secret", () => {
  const summary = summarizePayPalPaymentEnvironment(configuredEnv());

  assert.equal(summary.provider, "paypal");
  assert.equal(summary.mode, "sandbox");
  assert.equal(summary.configured.clientIdConfigured, true);
  assert.equal(summary.configured.clientSecretConfigured, true);
  assert.equal(summary.hostedCheckout.sdkUrl, "https://www.paypal.com/sdk/js?client-id=paypal-client-id-safe&currency=USD&intent=capture");
  assert.equal(summary.hostedCheckout.clientSecretExposed, false);
  assert.doesNotMatch(JSON.stringify(summary), /paypal-client-secret-sensitive|paypal-webhook-id-sensitive/i);
});

test("PayPal adapter creates provider-hosted checkout orders through Orders v2", async () => {
  const calls = [];
  const adapter = createPayPalPaymentAdapter({
    env: configuredEnv(),
    nowFn: () => NOW,
    fetchFn: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith("/v1/oauth2/token")) {
        assert.equal(init.method, "POST");
        assert.equal(init.headers.Authorization.startsWith("Basic "), true);
        assert.equal(String(init.body), "grant_type=client_credentials");
        return response(200, {
          access_token: "paypal-access-token-sensitive",
          token_type: "Bearer"
        });
      }
      assert.equal(String(url), "https://api-m.sandbox.paypal.com/v2/checkout/orders");
      assert.equal(init.method, "POST");
      assert.equal(init.headers.Authorization, "Bearer paypal-access-token-sensitive");
      assert.equal(init.headers["PayPal-Request-Id"], "pay_route_001");
      const body = JSON.parse(init.body);
      assert.equal(body.intent, "CAPTURE");
      assert.equal(body.purchase_units[0].custom_id, "pay_route_001");
      assert.equal(body.purchase_units[0].amount.currency_code, "USD");
      assert.equal(body.purchase_units[0].amount.value, "20.00");
      assert.equal(body.payment_source.paypal.experience_context.return_url, "https://portal.example.test/paypal/return");
      return response(201, {
        id: "PAYPAL_ORDER_001",
        status: "CREATED",
        links: [
          {
            rel: "approve",
            href: "https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL_ORDER_001"
          }
        ]
      });
    }
  });

  const order = await adapter.createCheckoutOrder({
    orderRef: "pay_route_001",
    accountRef: "acct_route_001",
    packageRef: "monthly_basic",
    amountMinor: 2000,
    currency: "USD",
    description: "GCC WebOS monthly_basic"
  });

  assert.equal(calls.length, 2);
  assert.deepEqual(order, {
    provider: "paypal",
    mode: "sandbox",
    providerOrderRef: "PAYPAL_ORDER_001",
    status: "pending_payment",
    checkoutUrl: "https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL_ORDER_001",
    createdAt: NOW,
    safety: {
      clientSecretExposed: false,
      noRawProviderPayload: true,
      noBillingMutation: true,
      noSubscriptionIssued: true
    }
  });
});

test("PayPal adapter captures approved orders without exposing raw provider payloads", async () => {
  const adapter = createPayPalPaymentAdapter({
    env: configuredEnv(),
    nowFn: () => NOW,
    fetchFn: async (url, init = {}) => {
      if (String(url).endsWith("/v1/oauth2/token")) {
        return response(200, {
          access_token: "paypal-access-token-sensitive",
          token_type: "Bearer"
        });
      }
      assert.equal(String(url), "https://api-m.sandbox.paypal.com/v2/checkout/orders/PAYPAL_ORDER_001/capture");
      assert.equal(init.method, "POST");
      assert.equal(init.headers["PayPal-Request-Id"], "pay_route_001");
      return response(201, {
        id: "PAYPAL_ORDER_001",
        status: "COMPLETED",
        purchase_units: [{
          payments: {
            captures: [{
              id: "PAYPAL_CAPTURE_001",
              status: "COMPLETED",
              create_time: NOW
            }]
          }
        }]
      });
    }
  });

  const capture = await adapter.capturePayment({
    orderRef: "pay_route_001",
    providerOrderRef: "PAYPAL_ORDER_001"
  });

  assert.equal(capture.status, "paid_pending_admin_review");
  assert.equal(capture.providerCaptureRef, "PAYPAL_CAPTURE_001");
  assert.equal(capture.paidAt, NOW);
  assert.equal(capture.safety.noRawProviderPayload, true);
  assert.doesNotMatch(JSON.stringify(capture), /access-token|purchase_units|captures/i);
});

test("PayPal webhook verification normalizes only PayPal-verified events", async () => {
  const adapter = createPayPalPaymentAdapter({
    env: configuredEnv(),
    nowFn: () => NOW,
    fetchFn: async (url, init = {}) => {
      if (String(url).endsWith("/v1/oauth2/token")) {
        return response(200, {
          access_token: "paypal-access-token-sensitive",
          token_type: "Bearer"
        });
      }
      assert.equal(String(url), "https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature");
      const body = JSON.parse(init.body);
      assert.equal(body.webhook_id, "paypal-webhook-id-sensitive");
      assert.equal(body.webhook_event.id, "WH-001");
      return response(200, { verification_status: "SUCCESS" });
    }
  });

  const event = await adapter.verifyWebhook({
    headers: {
      "paypal-auth-algo": "SHA256withRSA",
      "paypal-cert-url": "https://api-m.sandbox.paypal.com/certs/CERT-001",
      "paypal-transmission-id": "transmission_001",
      "paypal-transmission-sig": "signature-sensitive",
      "paypal-transmission-time": NOW
    },
    body: {
      id: "WH-001",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      create_time: NOW,
      resource: {
        id: "PAYPAL_CAPTURE_001",
        custom_id: "pay_route_001"
      }
    }
  });

  assert.equal(event.provider, "paypal");
  assert.equal(event.eventType, "payment_succeeded");
  assert.equal(event.orderId, "pay_route_001");
  assert.equal(event.signatureStatus, "verified");
  assert.doesNotMatch(JSON.stringify(event), /signature-sensitive|paypal-webhook-id-sensitive|resource/i);
});
