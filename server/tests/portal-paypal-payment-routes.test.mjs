import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createApp } from "../app.mjs";
import { listen } from "./helpers/listen.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));

function fakeState(platform = {}) {
  return {
    rootDir: ROOT,
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: "secret",
    proxyConfig: { servers: [], pingHosts: [], nginx: { host: "127.0.0.1", ports: [] } },
    platform,
    services: {
      ssLocal: { start: async () => ({ ok: true }), stop: async () => ({ ok: true }), status: () => ({ running: false }) },
      httpProxy: { start: async () => ({ ok: true }), stop: async () => ({ ok: true }), status: () => ({ running: false }) }
    },
    isPortListening: async () => false
  };
}

function portalAuth(accountId = "acct_payment_route_1") {
  return {
    requireSession(input = {}) {
      if (input.sessionRef !== "portal_session_payment") {
        const error = new Error("portal session is required");
        error.code = "invalid_session";
        throw error;
      }
      return {
        sessionRef: input.sessionRef,
        accountId
      };
    }
  };
}

function paymentCheckoutService() {
  const calls = [];
  const orders = new Map();
  return {
    calls,
    async createCheckout(input) {
      calls.push(["createCheckout", input]);
      const order = {
        orderRef: "pay_route_001",
        provider: "paypal",
        providerOrderRef: "PAYPAL_ORDER_001",
        planId: input.plan,
        planLabel: "monthly basic",
        amountMinor: 2000,
        currency: "USD",
        channel: "paypal",
        status: "pending_payment",
        checkoutUrl: "https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL_ORDER_001",
        createdAt: "2026-07-20T09:00:00.000Z",
        paymentExpiresAt: "2026-07-20T09:10:00.000Z",
        safety: {
          noRawMerchantKey: true,
          noRawProviderPayload: true,
          noSubscriptionIssued: true
        }
      };
      orders.set(order.orderRef, order);
      return {
        provider: "paypal",
        order,
        safety: {
          noRawMerchantKey: true,
          noRawProviderPayload: true,
          noSubscriptionIssued: true
        }
      };
    },
    listOrders(input) {
      calls.push(["listOrders", input]);
      return [...orders.values()];
    },
    async captureCheckout(input) {
      calls.push(["captureCheckout", input]);
      const existing = orders.get(input.orderRef);
      const captured = {
        ...existing,
        status: "paid_pending_admin_review",
        paidAt: "2026-07-20T09:05:00.000Z"
      };
      orders.set(input.orderRef, captured);
      return {
        provider: "paypal",
        order: captured,
        safety: {
          noRawMerchantKey: true,
          noRawProviderPayload: true,
          noSubscriptionIssued: true
        }
      };
    }
  };
}

function portalHeaders(sessionRef = "portal_session_payment") {
  return {
    "Content-Type": "application/json",
    "X-Portal-Session": sessionRef
  };
}

test("portal payment routes require the portal payment checkout service", async () => {
  const { server, baseUrl } = await listen(createApp(fakeState({
    userPortalRoutesEnabled: true,
    userPortalAuth: portalAuth()
  })));
  try {
    const response = await fetch(`${baseUrl}/api/portal/payments/checkout`, {
      method: "POST",
      headers: portalHeaders(),
      body: JSON.stringify({ plan: "monthly_basic", channel: "paypal", clientTarget: "clash" })
    });

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "payment_provider_checkout_unavailable" });
  } finally {
    server.close();
  }
});

test("portal payment checkout uses the session account and returns safe PayPal-hosted order facts", async () => {
  const paymentCheckout = paymentCheckoutService();
  const { server, baseUrl } = await listen(createApp(fakeState({
    userPortalRoutesEnabled: true,
    userPortalAuth: portalAuth(),
    portalPaymentCheckout: paymentCheckout
  })));
  try {
    const response = await fetch(`${baseUrl}/api/portal/payments/checkout`, {
      method: "POST",
      headers: portalHeaders(),
      body: JSON.stringify({
        portalUserRef: "acct_attacker",
        plan: "monthly_basic",
        clientTarget: "clash",
        channel: "paypal",
        device: "pc"
      })
    });

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.checkout.provider, "paypal");
    assert.equal(body.checkout.order.channel, "paypal");
    assert.equal(body.checkout.order.checkoutUrl, "https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL_ORDER_001");
    assert.equal(body.checkout.safety.noSubscriptionIssued, true);
    assert.equal(paymentCheckout.calls[0][1].accountRef, "acct_payment_route_1");
    assert.equal(paymentCheckout.calls[0][1].portalUserRef, undefined);
    assert.doesNotMatch(JSON.stringify(body), /secret|raw-provider-payload|acct_attacker/i);

    const listed = await fetch(`${baseUrl}/api/portal/payments/current`, {
      headers: { "X-Portal-Session": "portal_session_payment" }
    });
    assert.equal(listed.status, 200);
    const listedBody = await listed.json();
    assert.equal(listedBody.payments.orders.length, 1);
    assert.equal(listedBody.payments.orders[0].orderRef, "pay_route_001");

    const captured = await fetch(`${baseUrl}/api/portal/payments/capture`, {
      method: "POST",
      headers: portalHeaders(),
      body: JSON.stringify({ orderRef: "pay_route_001" })
    });
    assert.equal(captured.status, 200);
    const capturedBody = await captured.json();
    assert.equal(capturedBody.checkout.order.status, "paid_pending_admin_review");
    assert.equal(capturedBody.checkout.safety.noSubscriptionIssued, true);
  } finally {
    server.close();
  }
});

test("portal payment routes reject missing portal sessions without console auth fallback", async () => {
  const { server, baseUrl } = await listen(createApp(fakeState({
    userPortalRoutesEnabled: true,
    userPortalAuth: portalAuth(),
    portalPaymentCheckout: paymentCheckoutService()
  })));
  try {
    const response = await fetch(`${baseUrl}/api/portal/payments/current`);

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "invalid_session" });
  } finally {
    server.close();
  }
});
