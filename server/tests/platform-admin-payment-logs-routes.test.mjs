import assert from "node:assert/strict";
import test from "node:test";

import { createApp } from "../app.mjs";
import { createCoinsCommerceService } from "../services/platform/coins-commerce-service.mjs";
import { createInMemoryCoinsCommerceStore } from "../services/platform/coins-commerce-store.mjs";
import { listen } from "./helpers/listen.mjs";

const NOW = "2026-07-22T00:00:01.000Z";

function commerceService() {
  const store = createInMemoryCoinsCommerceStore({ nowFn: () => NOW });
  store.insertOrder({
    schemaVersion: "coins_commerce_order_v1",
    orderRef: "recharge_order_admin_1",
    accountRef: "acct-sensitive",
    orderType: "recharge",
    status: "payment_requested",
    rechargeSnapshot: {
      rechargeOfferRef: "rov_paid_10_v1",
      currency: "COINS",
      paidCoins: 10,
      bonusCoins: 0
    },
    createdAt: NOW
  });
  store.insertPaymentAttempt({
    schemaVersion: "coins_commerce_payment_attempt_v1",
    attemptRef: "attempt_admin_1",
    accountRef: "acct-sensitive",
    orderRef: "recharge_order_admin_1",
    providerId: "provider_safe",
    sourceAttemptRef: null,
    targetAttemptRef: null,
    switchReason: null,
    idempotencyFingerprint: "a".repeat(64),
    quoteSnapshot: {
      rechargeOfferRef: "rov_paid_10_v1",
      paidCoins: 10,
      bonusCoins: 0,
      fiatAmountMinor: 1000,
      fiatCurrency: "USD",
      rateNumerator: 100,
      rateDenominator: 1,
      rateVersionRef: "rate_secret",
      promotionRef: null
    },
    providerOrderRef: "provider-secret-ref",
    status: "pending",
    chargeCertainty: "pending",
    nextAction: { type: "hosted_redirect", url: "https://secret.example.test/checkout" },
    reconciliationState: "pending",
    createdAt: NOW,
    updatedAt: NOW
  });
  return createCoinsCommerceService({ store, providers: [], nowFn: () => NOW });
}

function stateFor({ adminAuthRoutesEnabled = false } = {}) {
  return {
    rootDir: new URL("../../", import.meta.url).pathname,
    consoleToken: "console-secret",
    proxyConfig: { servers: [], pingHosts: [], nginx: {} },
    services: {
      ssLocal: { status: () => ({ running: false }) },
      httpProxy: { status: () => ({ running: false }) }
    },
    subscriptions: {},
    security: {
      adminAllowedCidrs: ["127.0.0.1/32", "10.0.0.0/8"],
      subRateLimit: { windowMs: 60_000, max: 30 }
    },
    platform: {
      adminAuthRoutesEnabled,
      adminAuth: adminAuthRoutesEnabled ? {
        authenticateCookie: ({ cookieHeader }) => (
          String(cookieHeader || "").includes("gcc_admin_session=valid")
            ? { sessionRef: "admin-session" }
            : null
        )
      } : null,
      coinsCommerceService: commerceService()
    },
    isPortListening: async () => false,
    runCommand: async () => ({ ok: true, stdout: "", stderr: "", code: 0, timedOut: false })
  };
}

test("Admin Payment Logs requires allowlist and Console Bearer before returning actual redacted data", async () => {
  const deniedApp = createApp(stateFor(), { clientIpResolver: () => "203.0.113.10" });
  const denied = await listen(deniedApp);
  try {
    const response = await fetch(`${denied.baseUrl}/api/admin/platform/payment-logs`, {
      headers: { Authorization: "Bearer console-secret" }
    });
    assert.equal(response.status, 403);
  } finally {
    denied.server.close();
  }

  const allowed = await listen(createApp(stateFor(), { clientIpResolver: () => "10.0.0.8" }));
  try {
    const unauthenticated = await fetch(`${allowed.baseUrl}/api/admin/platform/payment-logs`);
    assert.equal(unauthenticated.status, 401);

    const response = await fetch(`${allowed.baseUrl}/api/admin/platform/payment-logs`, {
      headers: { Authorization: "Bearer console-secret" }
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.safety, { readOnly: true, mutationAllowed: false });
    assert.deepEqual(Object.keys(body.items[0]), [
      "attemptRef", "orderRef", "providerId", "status", "chargeCertainty",
      "sourceAttemptRef", "targetAttemptRef", "switchReason", "idempotencyFingerprint",
      "reconciliationState", "createdAt", "updatedAt"
    ]);
    assert.doesNotMatch(JSON.stringify(body), /acct-sensitive|provider-secret-ref|secret\.example|rate_secret|quoteSnapshot|nextAction/);
  } finally {
    allowed.server.close();
  }
});

test("Admin Payment Logs accepts the existing Admin session gateway and rejects raw Bearer in session mode", async () => {
  const { server, baseUrl } = await listen(createApp(stateFor({ adminAuthRoutesEnabled: true })));
  try {
    const bearerOnly = await fetch(`${baseUrl}/api/admin/platform/payment-logs`, {
      headers: { Authorization: "Bearer console-secret" }
    });
    assert.equal(bearerOnly.status, 401);

    const session = await fetch(`${baseUrl}/api/admin/platform/payment-logs`, {
      headers: { Cookie: "gcc_admin_session=valid" }
    });
    assert.equal(session.status, 200);
  } finally {
    server.close();
  }
});

test("Admin Payment Logs exposes no mutation endpoint", async () => {
  const { server, baseUrl } = await listen(createApp(stateFor()));
  const actions = [
    "capture", "refund", "retry", "routing", "settlement", "webhook-replay", "balance"
  ];
  try {
    for (const action of actions) {
      const response = await fetch(`${baseUrl}/api/admin/platform/payment-logs/attempt_admin_1/${action}`, {
        method: "POST",
        headers: {
          Authorization: "Bearer console-secret",
          "Content-Type": "application/json"
        },
        body: "{}"
      });
      assert.equal(response.status, 404, action);
    }
  } finally {
    server.close();
  }
});
