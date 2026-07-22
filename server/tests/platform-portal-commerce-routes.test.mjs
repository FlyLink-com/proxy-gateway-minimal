import assert from "node:assert/strict";
import test from "node:test";

import { createApp } from "../app.mjs";
import { createCoinsCommerceService } from "../services/platform/coins-commerce-service.mjs";
import { createInMemoryCoinsCommerceStore } from "../services/platform/coins-commerce-store.mjs";
import { listen } from "./helpers/listen.mjs";

const T0 = "2026-07-22T00:00:00.000Z";
const T1 = "2026-07-22T00:00:01.000Z";

function refFactory() {
  const counts = new Map();
  return (kind) => {
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
    return `${kind}_${counts.get(kind)}`;
  };
}

function paidLot(accountRef, issuedCoins = 500) {
  return {
    lotRef: `paid_${accountRef}`,
    accountRef,
    origin: "paid",
    issuedCoins,
    sourceRef: `source:${accountRef}`,
    createdAt: T0,
    expiresAt: null
  };
}

function provider(providerId, result) {
  return {
    providerId,
    capabilities: { createRechargeOrder: true },
    createRechargeOrder: async () => ({
      providerOrderRef: `provider_order_${providerId}`,
      ...result
    })
  };
}

function commerceFixture({ walletLots = [paidLot("acct-a"), paidLot("acct-b")] } = {}) {
  const providers = [
    provider("provider_one", {
      status: "confirmed_no_charge",
      chargeCertainty: "confirmed_no_charge",
      nextAction: { type: "none" }
    }),
    provider("provider_two", {
      status: "action_required",
      chargeCertainty: "pending",
      nextAction: { type: "hosted_redirect", url: "https://pay.example.test/checkout" }
    })
  ];
  const store = createInMemoryCoinsCommerceStore({ nowFn: () => T1, walletLots });
  const service = createCoinsCommerceService({
    store,
    providers,
    nowFn: () => T1,
    refFactory: refFactory(),
    rechargeQuoteIssuer: ({ rechargeOfferRef, paidCoins, bonusCoins }) => ({
      rechargeOfferRef,
      paidCoins,
      bonusCoins,
      fiatAmountMinor: paidCoins * 100,
      fiatCurrency: "USD",
      rateNumerator: 100,
      rateDenominator: 1,
      rateVersionRef: "rate_usd_v1",
      promotionRef: null
    })
  });
  return { service, store };
}

function stateFor(service) {
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
      adminAllowedCidrs: ["127.0.0.1/32"],
      subRateLimit: { windowMs: 60_000, max: 30 }
    },
    platform: {
      userPortalRoutesEnabled: true,
      userPortalAuth: {
        requireSession({ sessionRef }) {
          if (sessionRef === "session-a") return { accountId: "acct-a" };
          if (sessionRef === "session-b") return { accountId: "acct-b" };
          throw Object.assign(new Error("invalid session"), { code: "invalid_session" });
        }
      },
      coinsCommerceService: service
    },
    isPortListening: async () => false,
    runCommand: async () => ({ ok: true, stdout: "", stderr: "", code: 0, timedOut: false })
  };
}

function portalHeaders(extra = {}) {
  return { "X-Portal-Session": "session-a", ...extra };
}

async function jsonRequest(baseUrl, path, options = {}) {
  return fetch(`${baseUrl}${path}`, options);
}

test("Portal commerce exposes every authenticated endpoint without Console Bearer", async () => {
  const { service } = commerceFixture();
  const { server, baseUrl } = await listen(createApp(stateFor(service)));
  try {
    for (const path of ["wallet", "catalog", "orders", "referral"]) {
      const response = await jsonRequest(baseUrl, `/api/portal/commerce/${path}`, {
        headers: portalHeaders()
      });
      assert.equal(response.status, 200, path);
    }

    const product = await jsonRequest(baseUrl, "/api/portal/commerce/orders", {
      method: "POST",
      headers: portalHeaders({ "Content-Type": "application/json", "Idempotency-Key": "product-1" }),
      body: JSON.stringify({ offerVersionRef: "ov_traffic_pack_permanent_100gb_v1" })
    });
    assert.equal(product.status, 201);

    const productReplay = await jsonRequest(baseUrl, "/api/portal/commerce/orders", {
      method: "POST",
      headers: portalHeaders({ "Content-Type": "application/json", "Idempotency-Key": "product-1" }),
      body: JSON.stringify({ offerVersionRef: "ov_traffic_pack_permanent_100gb_v1" })
    });
    assert.equal(productReplay.status, 200);

    const recharge = await jsonRequest(baseUrl, "/api/portal/commerce/recharge-orders", {
      method: "POST",
      headers: portalHeaders({ "Content-Type": "application/json", "Idempotency-Key": "recharge-1" }),
      body: JSON.stringify({ rechargeOfferRef: "rov_paid_10_v1", preferredProviderId: "provider_one" })
    });
    assert.equal(recharge.status, 201);
    const rechargeBody = await recharge.json();

    const rechargeReplay = await jsonRequest(baseUrl, "/api/portal/commerce/recharge-orders", {
      method: "POST",
      headers: portalHeaders({ "Content-Type": "application/json", "Idempotency-Key": "recharge-1" }),
      body: JSON.stringify({ rechargeOfferRef: "rov_paid_10_v1", preferredProviderId: "provider_one" })
    });
    assert.equal(rechargeReplay.status, 200);

    const attempt = await jsonRequest(
      baseUrl,
      `/api/portal/commerce/payment-attempts/${rechargeBody.attempt.attemptRef}`,
      { headers: portalHeaders() }
    );
    assert.equal(attempt.status, 200);

    const switched = await jsonRequest(
      baseUrl,
      `/api/portal/commerce/payment-attempts/${rechargeBody.attempt.attemptRef}/switch`,
      {
        method: "POST",
        headers: portalHeaders({ "Content-Type": "application/json", "Idempotency-Key": "switch-1" }),
        body: JSON.stringify({ targetProviderId: "provider_two" })
      }
    );
    assert.equal(switched.status, 201);

    const switchReplay = await jsonRequest(
      baseUrl,
      `/api/portal/commerce/payment-attempts/${rechargeBody.attempt.attemptRef}/switch`,
      {
        method: "POST",
        headers: portalHeaders({ "Content-Type": "application/json", "Idempotency-Key": "switch-1" }),
        body: JSON.stringify({ targetProviderId: "provider_two" })
      }
    );
    assert.equal(switchReplay.status, 200);
  } finally {
    server.close();
  }
});

test("Portal commerce reports a service replay after createApp is rebuilt without a second write", async () => {
  const { service } = commerceFixture();
  const state = stateFor(service);
  const request = {
    method: "POST",
    headers: portalHeaders({
      "Content-Type": "application/json",
      "Idempotency-Key": "cross-app-product-1"
    }),
    body: JSON.stringify({ offerVersionRef: "ov_traffic_pack_permanent_100gb_v1" })
  };

  const firstApp = await listen(createApp(state));
  let firstBody;
  try {
    const first = await jsonRequest(firstApp.baseUrl, "/api/portal/commerce/orders", request);
    assert.equal(first.status, 201);
    firstBody = await first.json();
  } finally {
    firstApp.server.close();
  }

  const rebuiltApp = await listen(createApp(state));
  try {
    const replay = await jsonRequest(rebuiltApp.baseUrl, "/api/portal/commerce/orders", request);
    assert.equal(replay.status, 200);
    const replayBody = await replay.json();
    assert.deepEqual(replayBody, firstBody);
    assert.equal(JSON.stringify(replayBody).includes("replay"), false);
    assert.equal(service.listOrders({ accountRef: "acct-a" }).length, 1);
  } finally {
    rebuiltApp.server.close();
  }
});

test("Portal commerce rejects missing sessions and caller-supplied ownership", async () => {
  const { service } = commerceFixture();
  const { server, baseUrl } = await listen(createApp(stateFor(service)));
  try {
    const missingSession = await jsonRequest(baseUrl, "/api/portal/commerce/wallet");
    assert.equal(missingSession.status, 401);
    assert.deepEqual(await missingSession.json(), { error: "invalid_session" });

    for (const query of ["accountRef=", "userRef=acct-b", "portalUserRef=acct-b"]) {
      const response = await jsonRequest(baseUrl, `/api/portal/commerce/orders?${query}`, {
        headers: portalHeaders()
      });
      assert.equal(response.status, 400, query);
      assert.deepEqual(await response.json(), { error: "validation_error" });
    }

    for (const field of ["accountRef", "userRef", "portalUserRef"]) {
      const response = await jsonRequest(baseUrl, "/api/portal/commerce/orders", {
        method: "POST",
        headers: portalHeaders({ "Content-Type": "application/json", "Idempotency-Key": `owner-${field}` }),
        body: JSON.stringify({ offerVersionRef: "ov_traffic_pack_permanent_100gb_v1", [field]: "acct-b" })
      });
      assert.equal(response.status, 400, field);
      assert.deepEqual(await response.json(), { error: "validation_error" });
    }
  } finally {
    server.close();
  }
});

test("Portal commerce requires Idempotency-Key on all three POST endpoints", async () => {
  const { service } = commerceFixture();
  const { server, baseUrl } = await listen(createApp(stateFor(service)));
  const cases = [
    ["/api/portal/commerce/orders", { offerVersionRef: "ov_traffic_pack_permanent_100gb_v1" }],
    ["/api/portal/commerce/recharge-orders", { rechargeOfferRef: "rov_paid_10_v1" }],
    ["/api/portal/commerce/payment-attempts/attempt_missing/switch", { targetProviderId: "provider_two" }]
  ];
  try {
    for (const [path, body] of cases) {
      const response = await jsonRequest(baseUrl, path, {
        method: "POST",
        headers: portalHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body)
      });
      assert.equal(response.status, 400, path);
      assert.deepEqual(await response.json(), { error: "validation_error" });
    }
  } finally {
    server.close();
  }
});

test("Portal commerce closes validation, idempotency, insufficient-Coins, and switch errors", async () => {
  const { service, store } = commerceFixture({ walletLots: [] });
  const { server, baseUrl } = await listen(createApp(stateFor(service)));
  try {
    const invalid = await jsonRequest(baseUrl, "/api/portal/commerce/orders", {
      method: "POST",
      headers: portalHeaders({ "Content-Type": "application/json", "Idempotency-Key": "invalid-1" }),
      body: JSON.stringify({ offerVersionRef: "not-valid" })
    });
    assert.equal(invalid.status, 404);
    assert.deepEqual(await invalid.json(), { error: "not_found" });

    const insufficient = await jsonRequest(baseUrl, "/api/portal/commerce/orders", {
      method: "POST",
      headers: portalHeaders({ "Content-Type": "application/json", "Idempotency-Key": "insufficient-1" }),
      body: JSON.stringify({ offerVersionRef: "ov_traffic_pack_permanent_100gb_v1" })
    });
    assert.equal(insufficient.status, 409);
    assert.deepEqual(await insufficient.json(), {
      error: "insufficient_coins",
      recovery: { type: "go_to_recharge", shortfallCoins: 30 }
    });
    assert.equal(store.listPaymentAttempts().items.length, 0);

    const first = await jsonRequest(baseUrl, "/api/portal/commerce/recharge-orders", {
      method: "POST",
      headers: portalHeaders({ "Content-Type": "application/json", "Idempotency-Key": "conflict-1" }),
      body: JSON.stringify({ rechargeOfferRef: "rov_paid_10_v1", preferredProviderId: "provider_one" })
    });
    assert.equal(first.status, 201);
    const firstBody = await first.json();

    const conflict = await jsonRequest(baseUrl, "/api/portal/commerce/recharge-orders", {
      method: "POST",
      headers: portalHeaders({ "Content-Type": "application/json", "Idempotency-Key": "conflict-1" }),
      body: JSON.stringify({ rechargeOfferRef: "rov_paid_20_v1", preferredProviderId: "provider_one" })
    });
    assert.equal(conflict.status, 409);
    assert.deepEqual(await conflict.json(), { error: "idempotency_conflict" });

    const blocked = await jsonRequest(
      baseUrl,
      `/api/portal/commerce/payment-attempts/${firstBody.attempt.attemptRef}/switch`,
      {
        method: "POST",
        headers: portalHeaders({ "Content-Type": "application/json", "Idempotency-Key": "blocked-1" }),
        body: JSON.stringify({ targetProviderId: "provider_one" })
      }
    );
    assert.equal(blocked.status, 409);
    assert.deepEqual(await blocked.json(), { error: "payment_switch_blocked" });
  } finally {
    server.close();
  }
});

test("Portal commerce hides cross-account orders and attempts with a closed 404", async () => {
  const { service } = commerceFixture();
  await service.createProductOrder({
    accountRef: "acct-b",
    offerVersionRef: "ov_traffic_pack_permanent_100gb_v1",
    idempotencyKey: "account-b-product"
  });
  const recharge = await service.createRechargeOrder({
    accountRef: "acct-b",
    rechargeOfferRef: "rov_paid_10_v1",
    preferredProviderId: "provider_one",
    idempotencyKey: "account-b-recharge"
  });
  const { server, baseUrl } = await listen(createApp(stateFor(service)));
  try {
    const orders = await jsonRequest(baseUrl, "/api/portal/commerce/orders", {
      headers: portalHeaders()
    });
    assert.equal(orders.status, 200);
    assert.deepEqual(await orders.json(), []);

    const attempt = await jsonRequest(
      baseUrl,
      `/api/portal/commerce/payment-attempts/${recharge.attempt.attemptRef}`,
      { headers: portalHeaders() }
    );
    assert.equal(attempt.status, 404);
    assert.deepEqual(await attempt.json(), { error: "not_found" });
  } finally {
    server.close();
  }
});
