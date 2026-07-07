import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../app.mjs";
import { listen } from "./helpers/listen.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));

function fakeState({ portalPayments }) {
  return {
    rootDir: ROOT,
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: "secret",
    proxyConfig: { servers: [], pingHosts: [], nginx: { host: "127.0.0.1", ports: [] } },
    platform: { portalPayments },
    services: {
      ssLocal: {
        start: async () => ({ ok: true }),
        stop: async () => ({ ok: true }),
        status: () => ({ running: false, starting: false })
      },
      httpProxy: {
        start: async () => ({ ok: true }),
        stop: async () => ({ ok: true }),
        status: () => ({ running: false, starting: false })
      }
    },
    isPortListening: async () => false
  };
}

function authHeaders() {
  return { Authorization: "Bearer secret" };
}

test("admin platform payment route returns safe local payment summaries", async () => {
  const portalPayments = {
    listOrders() {
      return [
        {
          orderRef: "pay_admin_001",
          plan: "monthly_basic",
          amountMinor: 2000,
          currency: "CNY",
          status: "pending_payment",
          providerOrderRef: "provider_safe_001",
          checkoutUrl: "https://pay.example.test/pay_admin_001",
          createdAt: "2026-07-02T10:00:00.000Z"
        }
      ];
    }
  };
  const { server, baseUrl } = await listen(createApp(fakeState({ portalPayments })));
  try {
    const unauthenticated = await fetch(`${baseUrl}/api/admin/platform/payments`);
    assert.equal(unauthenticated.status, 401);

    const response = await fetch(`${baseUrl}/api/admin/platform/payments`, {
      headers: authHeaders()
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      payments: {
        configured: true,
        orders: [
          {
            orderRef: "pay_admin_001",
            plan: "monthly_basic",
            amountMinor: 2000,
            currency: "CNY",
            status: "pending_payment",
            providerOrderRef: "provider_safe_001",
            checkoutUrl: "https://pay.example.test/pay_admin_001",
            createdAt: "2026-07-02T10:00:00.000Z"
          }
        ],
        safety: {
          noRawMerchantKey: true,
          noRawProviderPayload: true,
          noPaymentMutation: true
        }
      }
    });
  } finally {
    server.close();
  }
});

test("admin platform payment delivery retry route requires approval metadata", async () => {
  const calls = [];
  const portalPayments = {
    retryDelivery(orderRef, input) {
      calls.push({ orderRef, input: structuredClone(input) });
      if (!input.approvalRef) {
        const error = new Error("approvalRef is required");
        error.code = "validation_error";
        throw error;
      }
      return {
        order: {
          orderRef,
          plan: "monthly_plus",
          amountMinor: 3000,
          currency: "CNY",
          status: "paid_access_delivered",
          accessRequestRef: "pareq_retry_admin_001",
          accessRequestStatus: "delivered",
          createdAt: "2026-07-02T10:00:00.000Z",
          paidAt: "2026-07-02T10:03:00.000Z"
        },
        audit: {
          action: "payment_order_delivery_retry",
          actorRef: input.actorRef,
          recordedAt: "2026-07-02T10:10:00.000Z"
        },
        safety: {
          noRawMerchantKey: true,
          noRawProviderPayload: true,
          noPaymentAmountMutation: true,
          noPlanMutation: true
        }
      };
    }
  };
  const { server, baseUrl } = await listen(createApp(fakeState({ portalPayments })));
  try {
    const unauthenticated = await fetch(`${baseUrl}/api/admin/platform/payments/pay_admin_retry_001/retry-delivery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actorRef: "operator_001",
        reasonCode: "payment_delivery_retry",
        approvalRef: "approval_retry_001"
      })
    });
    assert.equal(unauthenticated.status, 401);
    assert.equal(calls.length, 0);

    const invalid = await fetch(`${baseUrl}/api/admin/platform/payments/pay_admin_retry_001/retry-delivery`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        actorRef: "operator_001",
        reasonCode: "payment_delivery_retry"
      })
    });
    assert.equal(invalid.status, 400);

    const response = await fetch(`${baseUrl}/api/admin/platform/payments/pay_admin_retry_001/retry-delivery`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        actorRef: "operator_001",
        reasonCode: "payment_delivery_retry",
        approvalRef: "approval_retry_001"
      })
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.payment.order.status, "paid_access_delivered");
    assert.equal(body.payment.audit.action, "payment_order_delivery_retry");
    assert.equal(calls.at(-1).orderRef, "pay_admin_retry_001");
    assert.equal(JSON.stringify(body).includes("merchant"), false);
    assert.equal(JSON.stringify(body).includes("raw"), false);
  } finally {
    server.close();
  }
});

test("admin platform payment refund approval route requires approval metadata", async () => {
  const calls = [];
  const portalPayments = {
    quoteRefund(orderRef, input) {
      calls.push({ action: "quote", orderRef, input: structuredClone(input) });
      return {
        order: {
          orderRef,
          plan: "yearly",
          amountMinor: 20000,
          currency: "CNY",
          status: "paid_access_delivered"
        },
        refund: {
          status: "not_requested",
          amountMinor: 10000,
          money: "100.00",
          currency: "CNY",
          remainingDays: 183,
          durationDays: 365,
          basis: "remaining_days"
        },
        safety: {
          noRawMerchantKey: true,
          noRawProviderPayload: true,
          noPaymentMutation: true,
          noSubscriptionMutation: true
        }
      };
    },
    async approveRefund(orderRef, input) {
      calls.push({ action: "approve", orderRef, input: structuredClone(input) });
      if (!input.approvalRef) {
        const error = new Error("approvalRef is required");
        error.code = "validation_error";
        throw error;
      }
      return {
        order: {
          orderRef,
          plan: "yearly",
          amountMinor: 20000,
          currency: "CNY",
          status: "paid_access_delivered",
          refund: {
            status: "refund_succeeded",
            amountMinor: 10000,
            remainingDays: 183
          }
        },
        refund: {
          status: "refund_succeeded",
          amountMinor: 10000,
          money: "100.00",
          currency: "CNY",
          remainingDays: 183,
          durationDays: 365,
          basis: "remaining_days",
          providerSubmitted: true
        },
        audit: {
          action: "payment_order_refund_approved",
          actorRef: input.actorRef,
          recordedAt: "2026-07-12T10:10:00.000Z"
        },
        safety: {
          noRawMerchantKey: true,
          noRawProviderPayload: true,
          noPaymentAmountMutation: true,
          noPlanMutation: true,
          subscriptionDisabledOnlyAfterProviderSuccess: true
        }
      };
    }
  };
  const { server, baseUrl } = await listen(createApp(fakeState({ portalPayments })));
  try {
    const quote = await fetch(`${baseUrl}/api/admin/platform/payments/pay_admin_refund_001/refund-quote?approvedAt=2026-07-12T10%3A10%3A00.000Z`, {
      headers: authHeaders()
    });
    assert.equal(quote.status, 200);
    const quoteBody = await quote.json();
    assert.equal(quoteBody.payment.refund.amountMinor, 10000);
    assert.equal(quoteBody.payment.safety.noPaymentMutation, true);

    const invalid = await fetch(`${baseUrl}/api/admin/platform/payments/pay_admin_refund_001/approve-refund`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        actorRef: "operator_001",
        reasonCode: "customer_requested_refund"
      })
    });
    assert.equal(invalid.status, 400);

    const response = await fetch(`${baseUrl}/api/admin/platform/payments/pay_admin_refund_001/approve-refund`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        actorRef: "operator_001",
        reasonCode: "customer_requested_refund",
        approvalRef: "approval_refund_001"
      })
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.payment.refund.status, "refund_succeeded");
    assert.equal(body.payment.audit.action, "payment_order_refund_approved");
    assert.equal(calls.at(-1).action, "approve");
    assert.equal(calls.at(-1).orderRef, "pay_admin_refund_001");
    assert.equal(JSON.stringify(body).includes("merchant"), false);
    assert.equal(JSON.stringify(body).includes("raw"), false);
  } finally {
    server.close();
  }
});
