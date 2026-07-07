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

function portalAuth(accountId = "user_safe_ref") {
  return {
    requireSession(input = {}) {
      if (input.sessionRef !== "portal_session_safe") {
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

function portalSessionHeaders() {
  return { "Content-Type": "application/json", "X-Portal-Session": "portal_session_safe" };
}

test("portal payment checkout route requires a portal session and returns safe checkout facts", async () => {
  const calls = [];
  const portalPayments = {
    async createCheckout(input) {
      calls.push(structuredClone(input));
      return {
        provider: "niuniu-pay",
        order: {
          orderRef: "pay_route_001",
          plan: input.plan,
          amountMinor: 3000,
          currency: "CNY",
          status: "pending_payment",
          checkoutUrl: "https://pay.example.test/pay_route_001",
          createdAt: "2026-07-02T10:00:00.000Z"
        },
        safety: {
          noRawMerchantKey: true,
          noRawProviderPayload: true,
          noSubscriptionIssued: true
        }
      };
    }
  };
  const { server, baseUrl } = await listen(createApp(fakeState({
    userPortalRoutesEnabled: true,
    userPortalAuth: portalAuth(),
    portalPayments
  })));
  try {
    const blocked = await fetch(`${baseUrl}/api/portal/payments/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "monthly_plus", clientTarget: "clash", channel: "alipay", device: "mobile" })
    });
    assert.equal(blocked.status, 401);
    assert.equal(calls.length, 0);

    const response = await fetch(`${baseUrl}/api/portal/payments/checkout`, {
      method: "POST",
      headers: portalSessionHeaders(),
      body: JSON.stringify({ plan: "monthly_plus", clientTarget: "clash", channel: "alipay", device: "mobile" })
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(calls[0].portalUserRef, "user_safe_ref");
    assert.equal(calls[0].plan, "monthly_plus");
    assert.equal(calls[0].channel, "alipay");
    assert.equal(calls[0].device, "mobile");
    assert.equal(body.checkout.order.checkoutUrl, "https://pay.example.test/pay_route_001");
    assert.equal(JSON.stringify(body).includes("merchant"), false);
  } finally {
    server.close();
  }
});

test("portal payment checkout route returns safe provider-unavailable errors", async () => {
  const portalPayments = {
    async createCheckout() {
      const error = new Error("payment provider did not return checkout URL");
      error.code = "payment_provider_checkout_unavailable";
      throw error;
    }
  };
  const { server, baseUrl } = await listen(createApp(fakeState({
    userPortalRoutesEnabled: true,
    userPortalAuth: portalAuth(),
    portalPayments
  })));
  try {
    const response = await fetch(`${baseUrl}/api/portal/payments/checkout`, {
      method: "POST",
      headers: portalSessionHeaders(),
      body: JSON.stringify({ plan: "monthly_plus", clientTarget: "clash", channel: "wxpay" })
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "payment_provider_checkout_unavailable" });
  } finally {
    server.close();
  }
});

test("portal payment orders route returns only the current portal session orders", async () => {
  const calls = [];
  const portalPayments = {
    listOrders(input) {
      calls.push(structuredClone(input));
      return [
        {
          orderRef: "pay_current_001",
          plan: "monthly_basic",
          amountMinor: 2000,
          currency: "CNY",
          status: "paid_access_delivered",
          providerOrderRef: "provider_current_001",
          checkoutUrl: "https://pay.example.test/pay_current_001",
          accessRequestRef: "pareq_current_001",
          createdAt: "2026-07-02T10:00:00.000Z",
          paidAt: "2026-07-02T10:03:00.000Z"
        }
      ];
    }
  };
  const { server, baseUrl } = await listen(createApp(fakeState({
    userPortalRoutesEnabled: true,
    userPortalAuth: portalAuth("portal-current@example.test"),
    portalPayments
  })));
  try {
    const blocked = await fetch(`${baseUrl}/api/portal/payments/current`);
    assert.equal(blocked.status, 401);
    assert.equal(calls.length, 0);

    const response = await fetch(`${baseUrl}/api/portal/payments/current?portalUserRef=other-user`, {
      headers: { "X-Portal-Session": "portal_session_safe" }
    });
    assert.equal(response.status, 200);
    assert.deepEqual(calls, [
      {
        portalUserRef: "portal-current@example.test",
        status: undefined,
        plan: undefined,
        includePaymentArtifacts: true
      }
    ]);
    const body = await response.json();
    assert.equal(body.payments.orders[0].orderRef, "pay_current_001");
    assert.equal(body.payments.orders[0].accessRequestRef, "pareq_current_001");
    assert.equal(JSON.stringify(body).includes("other-user"), false);
    assert.equal(JSON.stringify(body).includes("merchant"), false);
  } finally {
    server.close();
  }
});

test("portal payment notify route returns success for verified provider notifications", async () => {
  const notifications = [];
  const portalPayments = {
    handleNotification(payload) {
      notifications.push(structuredClone(payload));
      return {
        order: {
          orderRef: payload.out_trade_no,
          status: "paid_pending_admin_review",
          accessRequestRef: "pareq_paid_001"
        },
        notification: {
          signatureStatus: "verified"
        },
        safety: {
          noRawMerchantKey: true,
          noRawProviderPayload: true
        }
      };
    }
  };
  const { server, baseUrl } = await listen(createApp(fakeState({
    userPortalRoutesEnabled: true,
    userPortalAuth: portalAuth(),
    portalPayments
  })));
  try {
    const response = await fetch(`${baseUrl}/api/portal/payments/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sign: "valid",
        trade_no: "provider_pay_route_001",
        out_trade_no: "pay_route_001",
        trade_status: "TRADE_SUCCESS",
        money: "30.00"
      })
    });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "success");
    assert.equal(notifications.length, 1);
  } finally {
    server.close();
  }
});
