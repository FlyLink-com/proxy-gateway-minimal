import assert from "node:assert/strict";
import test from "node:test";

import { createApp } from "../app.mjs";
import { listen } from "./helpers/listen.mjs";

const ROOT_DIR = new URL("../../", import.meta.url).pathname;
const SESSION_REF = "session_recharge_1";
const ACCOUNT_ID = "account_recharge_1";
const NOW = "2026-08-01T00:00:00.000Z";

function order(status = "entry_ready") {
  return {
    orderRef: "payment_order_1",
    offerRef: "coins_30",
    quoteVersion: 1,
    expectedPaidCoinUnits: 30,
    amountMinor: 100,
    currency: "USD",
    currencyExponent: 2,
    adapterKey: "paypal_v1",
    paymentMethod: "paypal",
    status,
    providerOrderRef: "paypal_order_1",
    nextAction: status === "entry_ready" ? {
      type: "redirect",
      url: "https://www.sandbox.paypal.com/checkoutnow?token=safe",
      expiresAt: "2026-08-01T00:10:00.000Z",
    } : null,
    walletOperationRef: status === "credited" ? "wallet_operation_1" : null,
    walletLotRef: status === "credited" ? "wallet_lot_1" : null,
    expiresAt: "2026-08-01T00:10:00.000Z",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createCoordinator() {
  const calls = [];
  return {
    calls,
    listOffers() {
      calls.push(["listOffers"]);
      return [{
        offerRef: "coins_30",
        quoteVersion: 1,
        paidCoinUnits: 30,
        amountMinor: 100,
        currency: "USD",
        currencyExponent: 2,
        paymentMethods: ["paypal"],
        environment: "sandbox",
        quoteDigest: "a".repeat(64),
      }];
    },
    async createRechargeOrder(input) {
      calls.push(["createRechargeOrder", structuredClone(input)]);
      return { order: order(), wallet: null };
    },
    getRechargeOrder(input) {
      calls.push(["getRechargeOrder", structuredClone(input)]);
      return order();
    },
    listRechargeOrders(input) {
      calls.push(["listRechargeOrders", structuredClone(input)]);
      return [order()];
    },
    async captureRechargeOrder(input) {
      calls.push(["captureRechargeOrder", structuredClone(input)]);
      return { order: order("credited"), wallet: { resultRef: "wallet_lot_1" } };
    },
    async acceptProviderCallback(input) {
      calls.push(["acceptProviderCallback", structuredClone(input)]);
      return {
        order: order("credited"),
        wallet: { resultRef: "wallet_lot_1" },
        acknowledgement: { statusCode: 204, contentType: "text/plain", body: "" },
      };
    },
  };
}

function createState({ enabled = true, coordinator = createCoordinator() } = {}) {
  return {
    rootDir: ROOT_DIR,
    consoleToken: "console-secret",
    proxyConfig: { servers: [], pingHosts: [], nginx: {} },
    services: {
      ssLocal: { status: () => ({ running: false }) },
      httpProxy: { status: () => ({ running: false }) },
    },
    subscriptions: {},
    security: {
      adminAllowedCidrs: ["127.0.0.1/32"],
      subRateLimit: { windowMs: 60_000, max: 30 },
    },
    platform: {
      coinRechargeEnabled: enabled,
      paymentRechargeCoordinator: enabled ? coordinator : null,
      userPortalRoutesEnabled: true,
      userPortalAuth: {
        requireSession({ sessionRef }) {
          return { sessionRef, accountId: ACCOUNT_ID };
        },
      },
    },
  };
}

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((error) => (
    error ? reject(error) : resolve()
  )));
}

test("recharge namespace is unavailable and side-effect free by default", async () => {
  const coordinator = createCoordinator();
  const { server, baseUrl } = await listen(createApp(createState({
    enabled: false,
    coordinator,
  })));
  try {
    const response = await fetch(`${baseUrl}/api/portal/coins/recharge/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Portal-Session": SESSION_REF,
      },
      body: JSON.stringify({ offerRef: "coins_30", idempotencyKey: "create_1" }),
    });
    assert.equal(response.status, 404);
    assert.deepEqual(coordinator.calls, []);
  } finally {
    await closeServer(server);
  }
});

test("authenticated account creates and captures only its server-priced order", async () => {
  const coordinator = createCoordinator();
  const { server, baseUrl } = await listen(createApp(createState({ coordinator })));
  try {
    const headers = {
      "Content-Type": "application/json",
      "X-Portal-Session": SESSION_REF,
    };
    const offersResponse = await fetch(`${baseUrl}/api/portal/coins/recharge/offers`, {
      headers: { "X-Portal-Session": SESSION_REF },
    });
    assert.equal(offersResponse.status, 200);
    const offers = await offersResponse.json();
    assert.deepEqual(offers.offers[0], {
      offerRef: "coins_30",
      quoteVersion: 1,
      paidCoinUnits: 30,
      amountMinor: 100,
      currency: "USD",
      currencyExponent: 2,
    });
    const versionedOffersResponse = await fetch(
      `${baseUrl}/api/portal/coins/recharge/offers`,
      {
        headers: {
          "X-Portal-Session": SESSION_REF,
          "X-Portal-Recharge-Offers-Version": "2",
        },
      },
    );
    assert.equal(versionedOffersResponse.status, 200);
    assert.deepEqual((await versionedOffersResponse.json()).offers[0], {
      offerRef: "coins_30",
      quoteVersion: 1,
      paidCoinUnits: 30,
      amountMinor: 100,
      currency: "USD",
      currencyExponent: 2,
      paymentMethods: ["paypal"],
    });
    const createdResponse = await fetch(`${baseUrl}/api/portal/coins/recharge/orders`, {
      method: "POST",
      headers,
      body: JSON.stringify({ offerRef: "coins_30", idempotencyKey: "create_1" }),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    assert.equal(created.recharge.order.expectedPaidCoinUnits, 30);
    assert.equal("accountId" in created.recharge.order, false);
    const capturedResponse = await fetch(
      `${baseUrl}/api/portal/coins/recharge/orders/payment_order_1/capture`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ idempotencyKey: "capture_1" }),
      },
    );
    assert.equal(capturedResponse.status, 200);
    assert.equal((await capturedResponse.json()).recharge.order.status, "credited");
    assert.deepEqual(coordinator.calls.slice(2, 4), [
      ["createRechargeOrder", {
        accountId: ACCOUNT_ID,
        offerRef: "coins_30",
        idempotencyKey: "create_1",
      }],
      ["captureRechargeOrder", {
        accountId: ACCOUNT_ID,
        orderRef: "payment_order_1",
        idempotencyKey: "capture_1",
      }],
    ]);
  } finally {
    await closeServer(server);
  }
});

test("PayPal callback preserves bounded bytes and acknowledges only coordinator success", async () => {
  const coordinator = createCoordinator();
  const { server, baseUrl } = await listen(createApp(createState({ coordinator }), {
    paymentNowFn: () => NOW,
  }));
  const body = JSON.stringify({ id: "event_1", value: "exact bytes" });
  try {
    const response = await fetch(`${baseUrl}/api/platform/payments/paypal/callback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "PayPal-Auth-Algo": "SHA256withRSA",
        "PayPal-Cert-Url": "https://api.paypal.com/v1/notifications/certs/CERT-safe",
        "PayPal-Transmission-Id": "transmission_1",
        "PayPal-Transmission-Sig": "signature_1",
        "PayPal-Transmission-Time": NOW,
      },
      body,
    });
    assert.equal(response.status, 204);
    const callback = coordinator.calls.at(-1)[1];
    assert.equal(Buffer.from(callback.bodyBase64, "base64").toString("utf8"), body);
    assert.equal(callback.receivedAt, NOW);
    assert.deepEqual(callback.headerEntries.map(({ name }) => name), [
      "paypal-auth-algo",
      "paypal-cert-url",
      "paypal-transmission-id",
      "paypal-transmission-sig",
      "paypal-transmission-time",
    ]);
  } finally {
    await closeServer(server);
  }
});

test("PayPal callback rejects an unsupported content type before coordinator use", async () => {
  const coordinator = createCoordinator();
  const { server, baseUrl } = await listen(createApp(createState({ coordinator })));
  try {
    const response = await fetch(`${baseUrl}/api/platform/payments/paypal/callback`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "not a callback",
    });
    assert.equal(response.status, 415);
    assert.deepEqual(coordinator.calls, []);
  } finally {
    await closeServer(server);
  }
});

test("PayPal callback does not acknowledge a coordinator failure", async () => {
  const coordinator = createCoordinator();
  coordinator.acceptProviderCallback = async () => {
    throw new Error("durable acceptance unavailable");
  };
  const { server, baseUrl } = await listen(createApp(createState({ coordinator })));
  try {
    const response = await fetch(`${baseUrl}/api/platform/payments/paypal/callback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "PayPal-Auth-Algo": "SHA256withRSA",
        "PayPal-Cert-Url": "https://api.paypal.com/v1/notifications/certs/CERT-safe",
        "PayPal-Transmission-Id": "transmission_1",
        "PayPal-Transmission-Sig": "signature_1",
        "PayPal-Transmission-Time": NOW,
      },
      body: JSON.stringify({ id: "event_1" }),
    });
    assert.equal(response.status, 503);
  } finally {
    await closeServer(server);
  }
});
