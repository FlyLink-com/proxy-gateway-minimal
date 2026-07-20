import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPortalPaymentCheckoutService } from "../services/platform/portal-payment-checkout.mjs";
import { createRuntimeState } from "../state.mjs";

const NOW = "2026-07-20T09:00:00.000Z";
const VULTR_MULTICHANNEL_ENV = {
  VULTR_TUIC_HOST: "tuic.example.test",
  VULTR_TUIC_UUID: "11111111-1111-4111-8111-111111111111",
  VULTR_TUIC_PASSWORD: "synthetic-tuic-password",
  VULTR_TUIC_SNI: "tuic.example.test",
  VULTR_VLESS_REALITY_HOST: "vless.example.test",
  VULTR_VLESS_REALITY_UUID: "22222222-2222-4222-8222-222222222222",
  VULTR_VLESS_REALITY_SNI: "www.example.test",
  VULTR_VLESS_REALITY_PUBLIC_KEY: "synthetic-public-key",
  VULTR_VLESS_REALITY_SHORT_ID: "synthetic-short-id",
  VULTR_HY2_HOST: "hy2.example.test",
  VULTR_HY2_PASSWORD: "synthetic-hy2-password",
  VULTR_HY2_SNI: "hy2.example.test",
  SGP_TUIC_STATIC_UUID: "33333333-3333-4333-8333-333333333333",
  SGP_TUIC_STATIC_PASSWORD: "synthetic-sgp-tuic-password",
  SGP_VLESS_STATIC_UUID: "44444444-4444-4444-8444-444444444444",
  SGP_XRAY_VLESS_REALITY_PUBLIC_KEY: "synthetic-sgp-public-key",
  SGP_XRAY_VLESS_REALITY_SHORT_ID: "synthetic-sgp-short-id",
  SGP_HY2_STATIC_PASSWORD: "synthetic-sgp-hy2-password"
};

function serviceEnv(overrides = {}) {
  return {
    PAYMENT_PROVIDER: "paypal",
    PAYMENT_MODE: "sandbox",
    PAYMENT_PROVIDER_CURRENCY: "USD",
    PAYMENT_PLAN_MONTHLY_BASIC_AMOUNT_MINOR: "2000",
    PAYMENT_PLAN_MONTHLY_PLUS_AMOUNT_MINOR: "3000",
    PAYMENT_PLAN_YEARLY_AMOUNT_MINOR: "20000",
    ...overrides
  };
}

function adapter() {
  const calls = [];
  return {
    provider: "paypal",
    mode: "sandbox",
    calls,
    async createCheckoutOrder(input) {
      calls.push(["createCheckoutOrder", input]);
      return {
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
      };
    },
    async capturePayment(input) {
      calls.push(["capturePayment", input]);
      return {
        provider: "paypal",
        providerOrderRef: input.providerOrderRef,
        providerCaptureRef: "PAYPAL_CAPTURE_001",
        status: "paid_pending_admin_review",
        paidAt: "2026-07-20T09:05:00.000Z",
        checkedAt: "2026-07-20T09:05:00.000Z",
        safety: {
          noRawProviderPayload: true,
          noBillingMutation: true,
          noSubscriptionIssued: true
        }
      };
    }
  };
}

test("portal payment checkout service creates safe PayPal hosted orders from env-backed prices", async () => {
  const paypal = adapter();
  const service = createPortalPaymentCheckoutService({
    env: serviceEnv(),
    providerAdapter: paypal,
    nowFn: () => NOW,
    orderRefFactory: () => "pay_safe_001"
  });

  const checkout = await service.createCheckout({
    accountRef: "acct_payment_001",
    plan: "monthly_basic",
    clientTarget: "clash",
    channel: "paypal",
    device: "pc"
  });

  assert.equal(checkout.provider, "paypal");
  assert.equal(checkout.order.orderRef, "pay_safe_001");
  assert.equal(checkout.order.providerOrderRef, "PAYPAL_ORDER_001");
  assert.equal(checkout.order.checkoutUrl, "https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL_ORDER_001");
  assert.equal(checkout.order.amountMinor, 2000);
  assert.equal(checkout.order.currency, "USD");
  assert.equal(checkout.order.status, "pending_payment");
  assert.equal(checkout.order.channel, "paypal");
  assert.equal(checkout.order.safety.noSubscriptionIssued, true);
  assert.equal(paypal.calls[0][1].orderRef, "pay_safe_001");
  assert.equal(paypal.calls[0][1].accountRef, "acct_payment_001");
  assert.equal(paypal.calls[0][1].amountMinor, 2000);
  assert.equal(paypal.calls[0][1].currency, "USD");
  assert.doesNotMatch(JSON.stringify(checkout), /secret|raw-provider-payload/i);
});

test("portal payment checkout service keeps orders account-scoped and capture does not issue subscriptions", async () => {
  const service = createPortalPaymentCheckoutService({
    env: serviceEnv(),
    providerAdapter: adapter(),
    nowFn: () => NOW,
    orderRefFactory: () => "pay_safe_002"
  });
  await service.createCheckout({
    accountRef: "acct_payment_002",
    plan: "yearly",
    clientTarget: "karing",
    channel: "paypal"
  });

  assert.equal(service.listOrders({ accountRef: "acct_payment_002" }).length, 1);
  assert.equal(service.listOrders({ accountRef: "acct_other" }).length, 0);

  const captured = await service.captureCheckout({
    accountRef: "acct_payment_002",
    orderRef: "pay_safe_002"
  });
  assert.equal(captured.order.status, "paid_pending_admin_review");
  assert.equal(captured.order.paidAt, "2026-07-20T09:05:00.000Z");
  assert.equal(captured.safety.noSubscriptionIssued, true);

  assert.throws(() => service.listOrders({ accountRef: "" }), /accountRef is required/);
  await assert.rejects(() => service.captureCheckout({
    accountRef: "acct_other",
    orderRef: "pay_safe_002"
  }), /payment order not found/);
});

test("portal payment checkout service rejects missing pricing and non-PayPal channels", async () => {
  const service = createPortalPaymentCheckoutService({
    env: serviceEnv({ PAYMENT_PLAN_MONTHLY_BASIC_AMOUNT_MINOR: "" }),
    providerAdapter: adapter(),
    nowFn: () => NOW,
    orderRefFactory: () => "pay_safe_003"
  });

  await assert.rejects(() => service.createCheckout({
    accountRef: "acct_payment_003",
    plan: "monthly_basic",
    clientTarget: "clash",
    channel: "paypal"
  }), /amount env is required/);

  const configured = createPortalPaymentCheckoutService({
    env: serviceEnv(),
    providerAdapter: adapter(),
    nowFn: () => NOW
  });
  await assert.rejects(() => configured.createCheckout({
    accountRef: "acct_payment_004",
    plan: "monthly_basic",
    clientTarget: "clash",
    channel: "wxpay"
  }), /payment channel is invalid/);
});

test("runtime state wires PayPal portal checkout only behind explicit sandbox env", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "portal-paypal-runtime-"));
  const calls = [];
  let state;
  try {
    state = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      subscriptionDbPath: join(tempDir, "subscriptions.sqlite"),
      controlDbPath: join(tempDir, "control.sqlite"),
      autoStartHttpProxy: false,
      paymentProviderFetchFn: async (url, init = {}) => {
        calls.push({ url: String(url), init });
        if (String(url).endsWith("/v1/oauth2/token")) {
          return {
            ok: true,
            status: 200,
            async json() {
              return { access_token: "paypal-access-token-sensitive" };
            }
          };
        }
        return {
          ok: true,
          status: 201,
          async json() {
            return {
              id: "PAYPAL_RUNTIME_ORDER",
              status: "CREATED",
              links: [{ rel: "approve", href: "https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL_RUNTIME_ORDER" }]
            };
          }
        };
      },
      env: {
        ...VULTR_MULTICHANNEL_ENV,
        CONSOLE_TOKEN: "secret",
        SS_PASSWORD: "pw",
        USER_PORTAL_ROUTES_ENABLED: "true",
        USER_PORTAL_PAYMENT_CHECKOUT_ENABLED: "true",
        PAYMENT_PROVIDER: "paypal",
        PAYMENT_MODE: "sandbox",
        PAYMENT_PROVIDER_API_KEY: "paypal-client-id-safe",
        PAYMENT_PROVIDER_API_SECRET: "paypal-client-secret-sensitive",
        PAYMENT_PROVIDER_CURRENCY: "USD",
        PAYMENT_PLAN_MONTHLY_BASIC_AMOUNT_MINOR: "2000",
        PAYMENT_PLAN_MONTHLY_PLUS_AMOUNT_MINOR: "3000",
        PAYMENT_PLAN_YEARLY_AMOUNT_MINOR: "20000",
        PAYMENT_RETURN_URL: "https://portal.example.test/paypal/return",
        PAYMENT_CANCEL_URL: "https://portal.example.test/paypal/cancel"
      }
    });

    assert.equal(state.platform.portalPaymentCheckout.provider, "paypal");
    const checkout = await state.platform.portalPaymentCheckout.createCheckout({
      accountRef: "acct_runtime_payment",
      plan: "monthly_basic",
      clientTarget: "clash",
      channel: "paypal"
    });
    assert.equal(checkout.order.providerOrderRef, "PAYPAL_RUNTIME_ORDER");
    assert.equal(calls.some((call) => call.url.endsWith("/v2/checkout/orders")), true);
    assert.doesNotMatch(JSON.stringify(checkout), /paypal-client-secret-sensitive|paypal-access-token-sensitive/i);
  } finally {
    state?.close();
    rmSync(tempDir, { recursive: true, force: true });
  }

  const disabledState = createRuntimeState({
    rootDir: new URL("../../", import.meta.url),
    subscriptionDbPath: join(tempDir, "disabled-subscriptions.sqlite"),
    controlDbPath: join(tempDir, "disabled-control.sqlite"),
    autoStartHttpProxy: false,
    env: {
      ...VULTR_MULTICHANNEL_ENV,
      CONSOLE_TOKEN: "secret",
      SS_PASSWORD: "pw",
      USER_PORTAL_ROUTES_ENABLED: "true",
      PAYMENT_PROVIDER: "paypal",
      PAYMENT_MODE: "sandbox"
    }
  });
  try {
    assert.equal(disabledState.platform.portalPaymentCheckout, null);
  } finally {
    disabledState.close();
  }

  assert.throws(() => createRuntimeState({
    rootDir: new URL("../../", import.meta.url),
    subscriptionDbPath: join(tempDir, "live-subscriptions.sqlite"),
    controlDbPath: join(tempDir, "live-control.sqlite"),
    autoStartHttpProxy: false,
    env: {
      ...VULTR_MULTICHANNEL_ENV,
      CONSOLE_TOKEN: "secret",
      SS_PASSWORD: "pw",
      USER_PORTAL_ROUTES_ENABLED: "true",
      USER_PORTAL_PAYMENT_CHECKOUT_ENABLED: "true",
      PAYMENT_PROVIDER: "paypal",
      PAYMENT_MODE: "live",
      PAYMENT_PROVIDER_API_KEY: "paypal-client-id-safe",
      PAYMENT_PROVIDER_API_SECRET: "paypal-client-secret-sensitive",
      PAYMENT_PLAN_MONTHLY_BASIC_AMOUNT_MINOR: "2000",
      PAYMENT_PLAN_MONTHLY_PLUS_AMOUNT_MINOR: "3000",
      PAYMENT_PLAN_YEARLY_AMOUNT_MINOR: "20000"
    }
  }), /live PayPal checkout requires a separate Risk A gate/);
});
