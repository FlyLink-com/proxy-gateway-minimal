import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { request as httpRequest } from "node:http";
import test from "node:test";

import { createApp } from "../app.mjs";
import { listen } from "./helpers/listen.mjs";

const ROOT_DIR = new URL("../../", import.meta.url).pathname;
const SESSION_REF = "session_recharge_1";
const ACCOUNT_ID = "account_recharge_1";
const NOW = "2026-08-01T00:00:00.000Z";
const CALLBACKS = Object.freeze({
  paypal_sandbox: "/api/platform/payments/paypal/callback",
  xsd: "/api/platform/payments/xsd/callback",
  chaojipay: "/api/platform/payments/chaojipay/callback",
});

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

function createState({
  enabled = true,
  paymentRechargeProvider = "paypal_sandbox",
  coordinator = createCoordinator(),
} = {}) {
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
      paymentRechargeProvider: enabled ? paymentRechargeProvider : null,
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

function rawHttpRequest(baseUrl, {
  path,
  method = "POST",
  rawHeaders = [],
  body = Buffer.alloc(0),
}) {
  const url = new URL(path, baseUrl);
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, {
      method,
      headers: [
        "Host", url.host,
        ...rawHeaders,
        "Content-Length", String(body.byteLength),
      ],
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks),
      }));
    });
    request.on("error", reject);
    request.end(body);
  });
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

test("disabled recharge exposes none of the three provider callbacks", async () => {
  const coordinator = createCoordinator();
  const { server, baseUrl } = await listen(createApp(createState({
    enabled: false,
    coordinator,
  })));
  try {
    for (const path of Object.values(CALLBACKS)) {
      const response = await fetch(`${baseUrl}${path}`, { method: "POST" });
      assert.equal(response.status, 404, path);
    }
    assert.deepEqual(coordinator.calls, []);
  } finally {
    await closeServer(server);
  }
});

for (const [provider, callbackPath] of Object.entries(CALLBACKS)) {
  test(`${provider} exposes only its exact callback route`, async () => {
    const coordinator = createCoordinator();
    const { server, baseUrl } = await listen(createApp(createState({
      paymentRechargeProvider: provider,
      coordinator,
    })));
    try {
      const variants = [
        { path: callbackPath, method: "GET", expectedStatus: 404 },
        { path: `${callbackPath}?attempt=1`, method: "POST", expectedStatus: 400 },
        { path: callbackPath.replace("/api/", "/API/"), method: "POST", expectedStatus: 404 },
        { path: `${callbackPath}/`, method: "POST", expectedStatus: 404 },
      ];
      for (const variant of variants) {
        const response = await fetch(`${baseUrl}${variant.path}`, { method: variant.method });
        assert.equal(response.status, variant.expectedStatus, `${variant.method} ${variant.path}`);
      }
      for (const inactivePath of Object.values(CALLBACKS).filter((path) => path !== callbackPath)) {
        const response = await fetch(`${baseUrl}${inactivePath}`, { method: "POST" });
        assert.equal(response.status, 404, inactivePath);
      }
      assert.deepEqual(coordinator.calls, []);
    } finally {
      await closeServer(server);
    }
  });
}

test("unsupported provider enum leaves recharge routes unavailable", async () => {
  const coordinator = createCoordinator();
  const { server, baseUrl } = await listen(createApp(createState({
    paymentRechargeProvider: "unsupported",
    coordinator,
  })));
  try {
    for (const path of [
      ...Object.values(CALLBACKS),
      "/api/portal/coins/recharge/orders",
    ]) {
      const response = await fetch(`${baseUrl}${path}`, { method: "POST" });
      assert.equal(response.status, 404, path);
    }
    assert.deepEqual(coordinator.calls, []);
  } finally {
    await closeServer(server);
  }
});

test("provider and recharge query capabilities are not exposed", async () => {
  const coordinator = createCoordinator();
  const { server, baseUrl } = await listen(createApp(createState({ coordinator })));
  try {
    for (const path of [
      "/api/platform/payments/xsd/query",
      "/api/platform/payments/chaojipay/query",
      "/api/portal/coins/recharge/orders/payment_order_1/query",
    ]) {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: { Authorization: "Bearer console-secret" },
      });
      assert.equal(response.status, 404, path);
    }
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
    const digest = createHash("sha256")
      .update("transmission_1", "utf8")
      .update("\0", "utf8")
      .update(Buffer.from(body, "utf8"))
      .digest("hex");
    assert.equal(callback.callbackRequestRef, `paypal_callback_${digest}`);
  } finally {
    await closeServer(server);
  }
});

for (const { provider, path, contentType } of [
  {
    provider: "xsd",
    path: CALLBACKS.xsd,
    contentType: "application/x-www-form-urlencoded; charset=utf-8",
  },
  {
    provider: "chaojipay",
    path: CALLBACKS.chaojipay,
    contentType: "application/form; charset=utf-8",
  },
]) {
  test(`${provider} callback preserves accepted form bytes and one content-type header`, async () => {
    const coordinator = createCoordinator();
    const { server, baseUrl } = await listen(createApp(createState({
      paymentRechargeProvider: provider,
      coordinator,
    }), { paymentNowFn: () => NOW }));
    const body = Buffer.from("amount=100&note=%E4%B8%AD", "utf8");
    try {
      const response = await rawHttpRequest(baseUrl, {
        path,
        rawHeaders: ["Content-Type", contentType],
        body,
      });
      assert.equal(response.status, 204);
      assert.equal(coordinator.calls.length, 1);
      const callback = coordinator.calls[0][1];
      assert.deepEqual(Buffer.from(callback.bodyBase64, "base64"), body);
      assert.deepEqual(callback.headerEntries, [{ name: "content-type", value: contentType }]);
      const digest = createHash("sha256").update(body).digest("hex");
      assert.equal(callback.callbackRequestRef, `${provider}_callback_${digest}`);
      assert.equal(callback.receivedAt, NOW);
    } finally {
      await closeServer(server);
    }
  });

  test(`${provider} callback rejects content-type and content-encoding faults before coordinator use`, async () => {
    const coordinator = createCoordinator();
    const { server, baseUrl } = await listen(createApp(createState({
      paymentRechargeProvider: provider,
      coordinator,
    })));
    const body = Buffer.from("amount=100", "utf8");
    const cases = [
      { name: "missing", rawHeaders: [] },
      {
        name: "duplicate",
        rawHeaders: ["Content-Type", contentType, "Content-Type", contentType],
      },
      { name: "unsupported", rawHeaders: ["Content-Type", "application/json"] },
      {
        name: "identity encoding",
        rawHeaders: ["Content-Type", contentType, "Content-Encoding", "identity"],
      },
      {
        name: "gzip encoding",
        rawHeaders: ["Content-Type", contentType, "Content-Encoding", "gzip"],
      },
    ];
    try {
      for (const item of cases) {
        const response = await rawHttpRequest(baseUrl, {
          path,
          rawHeaders: item.rawHeaders,
          body,
        });
        assert.equal(response.status, 415, item.name);
        assert.deepEqual(JSON.parse(response.body.toString("utf8")), {
          error: { code: "payment_recharge_content_type_invalid", retryable: false },
        });
      }
      assert.deepEqual(coordinator.calls, []);
    } finally {
      await closeServer(server);
    }
  });

  test(`${provider} callback rejects invalid UTF-8 before coordinator use`, async () => {
    const coordinator = createCoordinator();
    const { server, baseUrl } = await listen(createApp(createState({
      paymentRechargeProvider: provider,
      coordinator,
    })));
    try {
      const response = await rawHttpRequest(baseUrl, {
        path,
        rawHeaders: ["Content-Type", contentType],
        body: Buffer.from([0xc3, 0x28]),
      });
      assert.equal(response.status, 400);
      assert.deepEqual(JSON.parse(response.body.toString("utf8")), {
        error: { code: "payment_recharge_request_invalid", retryable: false },
      });
      assert.deepEqual(coordinator.calls, []);
    } finally {
      await closeServer(server);
    }
  });

  test(`${provider} callback accepts 16384 bytes and generically rejects 16385 bytes`, async () => {
    const coordinator = createCoordinator();
    const { server, baseUrl } = await listen(createApp(createState({
      paymentRechargeProvider: provider,
      coordinator,
    })));
    const acceptedBody = Buffer.alloc(16_384, 0x61);
    const rejectedBody = Buffer.alloc(16_385, 0x62);
    try {
      const accepted = await rawHttpRequest(baseUrl, {
        path,
        rawHeaders: ["Content-Type", contentType],
        body: acceptedBody,
      });
      assert.equal(accepted.status, 204);
      assert.equal(coordinator.calls.length, 1);
      assert.deepEqual(
        Buffer.from(coordinator.calls[0][1].bodyBase64, "base64"),
        acceptedBody,
      );

      const rejected = await rawHttpRequest(baseUrl, {
        path,
        rawHeaders: ["Content-Type", contentType],
        body: rejectedBody,
      });
      assert.equal(rejected.status, 413);
      assert.deepEqual(JSON.parse(rejected.body.toString("utf8")), {
        error: { code: "payment_recharge_body_too_large", retryable: false },
      });
      assert.equal(rejected.body.includes(Buffer.from("bbbb", "utf8")), false);
      assert.equal(coordinator.calls.length, 1);
    } finally {
      await closeServer(server);
    }
  });
}

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
