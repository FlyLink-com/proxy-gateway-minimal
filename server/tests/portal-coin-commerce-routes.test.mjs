import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import test from "node:test";
import { types } from "node:util";
import Database from "better-sqlite3";

import { createApp } from "../app.mjs";
import {
  COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID,
  applyCoinCommerceMigrations
} from "../services/platform/coin-commerce-migrations.mjs";
import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  applyCoinWalletMigrations
} from "../services/platform/coin-wallet-migrations.mjs";
import { createSqliteCoinCommerceStore } from "../services/platform/coin-commerce-store.mjs";
import { listen } from "./helpers/listen.mjs";

const ROOT_DIR = new URL("../../", import.meta.url).pathname;
const CONSOLE_TOKEN = "console-secret";
const COMMERCE_ERROR = (code, retryable = false) => ({
  error: { code, retryable }
});

const FULL_OFFER = {
  offerRef: "offer_monthly_basic",
  offerVersionRef: "offerversion_monthly_basic_1",
  version: 1,
  category: "plan",
  title: {
    zh: "基础月付",
    en: "Basic monthly"
  },
  summary: {
    zh: "适合日常使用",
    en: "For everyday use"
  },
  importantNotices: {
    zh: ["购买后自动交付"],
    en: ["Delivered automatically after purchase"]
  },
  baseCoinUnits: 100,
  referencePrice: {
    currency: "CNY",
    amountMinor: 1_000
  },
  acceptedCoinTypes: ["bonus_coins", "paid_coins", "reward_coins"],
  delivery: {
    kind: "subscription_plan",
    durationDays: 30,
    monthlyTrafficGb: 100,
    trafficGb: null,
    neverExpires: false,
    discountBasisPoints: 0
  }
};

const PORTAL_OFFER = {
  offerRef: "offer_monthly_basic",
  offerVersionRef: "offerversion_monthly_basic_1",
  category: "plan",
  title: {
    zh: "基础月付",
    en: "Basic monthly"
  },
  summary: {
    zh: "适合日常使用",
    en: "For everyday use"
  },
  importantNotices: {
    zh: ["购买后自动交付"],
    en: ["Delivered automatically after purchase"]
  },
  baseCoinUnits: 100,
  referencePrice: {
    currency: "CNY",
    amountMinor: 1_000
  },
  acceptedCoinTypes: ["bonus_coins", "paid_coins", "reward_coins"],
  delivery: {
    kind: "subscription_plan",
    durationDays: 30,
    monthlyTrafficGb: 100,
    trafficGb: null,
    neverExpires: false,
    discountBasisPoints: 0
  }
};

const FULL_QUOTE = {
  quoteRef: "quote_monthly_basic_1",
  offer: FULL_OFFER,
  amountUnits: 100,
  appliedDiscountBasisPoints: 0,
  purchaseAvailability: "available",
  shortfallUnits: 0,
  allocation: [
    { coinType: "bonus_coins", amountUnits: 40 },
    { coinType: "paid_coins", amountUnits: 60 }
  ],
  balances: {
    before: {
      bonusCoins: 40,
      paidCoins: 80,
      rewardCoins: 5,
      heldCoins: 0
    },
    after: {
      bonusCoins: 0,
      paidCoins: 20,
      rewardCoins: 5,
      heldCoins: 100
    }
  },
  expiresAt: "2026-07-27T00:05:00.000Z"
};

const PORTAL_QUOTE = {
  quoteRef: "quote_monthly_basic_1",
  offer: PORTAL_OFFER,
  amountUnits: 100,
  appliedDiscountBasisPoints: 0,
  purchaseAvailability: "available",
  shortfallUnits: 0,
  allocation: [
    { coinType: "bonus_coins", amountUnits: 40 },
    { coinType: "paid_coins", amountUnits: 60 }
  ],
  balances: {
    before: {
      bonusCoins: 40,
      paidCoins: 80,
      rewardCoins: 5,
      heldCoins: 0
    },
    after: {
      bonusCoins: 0,
      paidCoins: 20,
      rewardCoins: 5,
      heldCoins: 100
    }
  },
  expiresAt: "2026-07-27T00:05:00.000Z"
};

const FULL_HELD_ORDER = {
  orderRef: "order_monthly_basic_1",
  offer: FULL_OFFER,
  amountUnits: 100,
  allocation: [
    { coinType: "bonus_coins", amountUnits: 40 },
    { coinType: "paid_coins", amountUnits: 60 }
  ],
  paymentStatus: "held",
  cancelUntil: "2026-07-27T00:00:03.000Z",
  fulfillment: {
    status: "not_requested",
    safeCode: null
  },
  createdAt: "2026-07-27T00:00:00.000Z",
  updatedAt: "2026-07-27T00:00:00.000Z"
};

const PORTAL_HELD_ORDER = {
  orderRef: "order_monthly_basic_1",
  offer: PORTAL_OFFER,
  amountUnits: 100,
  allocation: [
    { coinType: "bonus_coins", amountUnits: 40 },
    { coinType: "paid_coins", amountUnits: 60 }
  ],
  paymentStatus: "held",
  cancelUntil: "2026-07-27T00:00:03.000Z",
  fulfillment: {
    status: "not_requested",
    safeCode: null
  },
  createdAt: "2026-07-27T00:00:00.000Z",
  updatedAt: "2026-07-27T00:00:00.000Z"
};

const FULL_CANCELLED_ORDER = {
  ...FULL_HELD_ORDER,
  paymentStatus: "cancelled",
  updatedAt: "2026-07-27T00:00:01.000Z"
};

const PORTAL_CANCELLED_ORDER = {
  ...PORTAL_HELD_ORDER,
  paymentStatus: "cancelled",
  updatedAt: "2026-07-27T00:00:01.000Z"
};

function clone(value) {
  return structuredClone(value);
}

function routeError(code, message = "synthetic internal detail") {
  const error = new Error(message);
  error.code = code;
  return error;
}

function accountForSession(sessionRef) {
  if (sessionRef === "session_alpha") return "acct_alpha";
  if (sessionRef === "session_beta") return "acct_beta";
  const capacityMatch = /^session_([0-9]{5})$/.exec(sessionRef);
  if (capacityMatch) return `acct_${capacityMatch[1]}`;
  return null;
}

function createAuth(overrides = {}) {
  return {
    requireSession({ sessionRef }) {
      if (sessionRef === "session_revoked") {
        throw routeError("invalid_session", "revoked synthetic session");
      }
      const accountId = accountForSession(sessionRef);
      if (!accountId) {
        throw routeError("invalid_session", "unknown synthetic session");
      }
      return { sessionRef, accountId };
    },
    ...overrides
  };
}

function createStore(overrides = {}) {
  const calls = [];
  const store = {
    listPublishedOffers(input) {
      calls.push(["listPublishedOffers", clone(input)]);
      return [clone(FULL_OFFER)];
    },
    getPublishedOffer(input) {
      calls.push(["getPublishedOffer", clone(input)]);
      return clone(FULL_OFFER);
    },
    createCheckoutQuote(input) {
      calls.push(["createCheckoutQuote", clone(input)]);
      return clone(FULL_QUOTE);
    },
    confirmOrder(input) {
      calls.push(["confirmOrder", clone(input)]);
      return clone(FULL_HELD_ORDER);
    },
    cancelOrder(input) {
      calls.push(["cancelOrder", clone(input)]);
      return clone(FULL_CANCELLED_ORDER);
    },
    listOrders(input) {
      calls.push(["listOrders", clone(input)]);
      return {
        orders: [clone(FULL_HELD_ORDER)],
        nextCursor: {
          afterCreatedAt: FULL_HELD_ORDER.createdAt,
          afterOrderRef: FULL_HELD_ORDER.orderRef
        }
      };
    },
    getOrder(input) {
      calls.push(["getOrder", clone(input)]);
      return clone(FULL_HELD_ORDER);
    },
    ...overrides
  };
  return { store, calls };
}

function createReconciliationStoreFixture(fulfillmentStatus) {
  const database = new Database(":memory:");
  const clock = { value: "2026-07-27T00:00:00.000Z" };
  database.pragma("foreign_keys = ON");
  database.exec(`
    create table platform_accounts (
      id text primary key,
      owner_ref text not null,
      status text not null,
      created_at text not null,
      updated_at text not null,
      metadata_json text not null default '{}'
    )
  `);
  applyCoinWalletMigrations({
    database,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(clock.value)
  });
  applyCoinCommerceMigrations({
    database,
    expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(clock.value)
  });
  database.prepare(`
    insert into platform_accounts
      (id, owner_ref, status, created_at, updated_at)
    values ('acct_alpha', 'owner_synthetic', 'active', ?, ?)
  `).run(clock.value, clock.value);
  const fixedClockDatabase = new Proxy(database, {
    get(target, property) {
      if (property === "prepare") return (sql) => {
        if (/select\s+strftime\('%Y-%m-%dT%H:%M:%fZ',\s*'now'\)/i.test(sql)) {
          return { pluck: () => ({ get: () => clock.value }) };
        }
        return target.prepare(sql);
      };
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  const counts = new Map();
  const refFactory = (kind) => {
    const count = (counts.get(kind) ?? 0) + 1;
    counts.set(kind, count);
    return `${kind}_route_contract_${count}`;
  };
  const store = createSqliteCoinCommerceStore({
    database: fixedClockDatabase,
    commerceRefFactory: refFactory,
    walletRefFactory: refFactory
  });
  store.walletStore.creditCoins({
    accountId: "acct_alpha",
    coinType: "paid_coins",
    amountUnits: 1_000,
    availability: "available",
    sourceType: "synthetic_seed",
    sourceRef: "source_route_contract",
    sourceDigest: "a".repeat(64),
    policyRef: null,
    policyVersion: null,
    expiresAt: null,
    operation: {
      actorScope: "system:route-contract",
      idempotencyKey: "synthetic_credit",
      actorType: "system",
      actorRef: "route_contract"
    }
  });
  store.publishOfferVersion(clone(FULL_OFFER));
  const quote = store.createCheckoutQuote({
    accountId: "acct_alpha", offerRef: FULL_OFFER.offerRef
  });
  const held = store.confirmOrder({
    accountId: "acct_alpha",
    quoteRef: quote.quoteRef,
    operation: {
      actorScope: "portal:acct_alpha",
      idempotencyKey: "synthetic_confirm",
      actorType: "portal_user",
      actorRef: "acct_alpha"
    }
  });
  clock.value = held.cancelUntil;
  store.claimDueCaptures({ limit: 1 });
  if (fulfillmentStatus === "not_requested") {
    // The public capture path isolates an expired Hold without a command.
    clock.value = "2099-01-01T00:00:00.000Z";
  }
  store.captureClaimedOrder({ orderRef: held.orderRef });
  if (fulfillmentStatus !== "not_requested") {
    const command = store.claimNextFulfillmentCommand({ leaseMs: 1_000 });
    const lease = {
      commandRef: command.commandRef,
      leaseGeneration: command.leaseGeneration,
      leaseToken: command.leaseToken
    };
    if (fulfillmentStatus === "failed") {
      store.failFulfillmentCommand({
        ...lease, safeCode: "fulfillment_handler_unavailable"
      });
    } else {
      store.completeFulfillmentCommand({
        ...lease, effectRef: "effect_route_contract", status: "delivered"
      });
      // In-memory terminal-state fixture only: retain the real immutable
      // command and receipt, and require both store projections to validate it.
      // This is not a simulated public reconciliation mutation API.
      database.prepare(`
        update platform_coin_commerce_orders
           set payment_status = 'reconciliation_required'
         where order_ref = ?
      `).run(held.orderRef);
    }
  }
  const order = store.getOrder({
    accountId: "acct_alpha", orderRef: held.orderRef
  });
  assert.equal(order.paymentStatus, "reconciliation_required");
  assert.equal(order.fulfillment.status, fulfillmentStatus);
  assert.deepEqual(store.listOrders({ accountId: "acct_alpha", limit: 25 }), {
    orders: [order], nextCursor: null
  });
  return {
    store,
    order,
    close() {
      store.close();
      database.close();
    }
  };
}

function createState({
  auth = createAuth(),
  store = createStore().store,
  coordinator = {
    start() {},
    stop() {}
  },
  enabled = true
} = {}) {
  return {
    rootDir: ROOT_DIR,
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: CONSOLE_TOKEN,
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
      coinsCommerceEnabled: enabled,
      userPortalRoutesEnabled: true,
      coinCommerceStore: store,
      userPortalAuth: auth,
      coinCommerceCoordinator: coordinator
    },
    isPortListening: async () => false,
    runCommand: async () => ({
      ok: true,
      stdout: "",
      stderr: "",
      code: 0,
      timedOut: false
    })
  };
}

async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function rawRequest(baseUrl, {
  method = "GET",
  path,
  headers = [],
  body
}) {
  const target = new URL(baseUrl);
  const outgoingHeaders = {};
  for (let index = 0; index < headers.length; index += 2) {
    const name = headers[index];
    const value = headers[index + 1];
    const existingName = Object.keys(outgoingHeaders).find(
      (candidate) => candidate.toLowerCase() === name.toLowerCase()
    );
    if (!existingName) {
      outgoingHeaders[name] = value;
      continue;
    }
    outgoingHeaders[existingName] = Array.isArray(outgoingHeaders[existingName])
      ? [...outgoingHeaders[existingName], value]
      : [outgoingHeaders[existingName], value];
  }
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      hostname: target.hostname,
      port: target.port,
      method,
      path,
      headers: outgoingHeaders
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({
          status: response.statusCode,
          headers: response.headers,
          rawHeaders: response.rawHeaders,
          text,
          json: text.length > 0 ? JSON.parse(text) : null
        });
      });
    });
    request.on("error", reject);
    if (body !== undefined) request.write(body);
    request.end();
  });
}

function portalHeaders(sessionRef = "session_alpha") {
  return {
    "X-Portal-Session": sessionRef
  };
}

function jsonHeaders(sessionRef = "session_alpha", idempotencyKey) {
  return {
    "Content-Type": "application/json",
    "X-Portal-Session": sessionRef,
    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {})
  };
}

async function expectCommerceError(response, status, code, retryable = false) {
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), COMMERCE_ERROR(code, retryable));
}

test("the seven exact Portal Commerce routes return safe DTOs and session-owned Store inputs", async () => {
  const { store, calls } = createStore();
  const coordinatorReads = [];
  const coordinator = {
    start() {},
    stop() {}
  };
  Object.defineProperty(coordinator, "nudge", {
    enumerable: true,
    get() {
      coordinatorReads.push("read");
      throw new Error("HTTP must not nudge the coordinator");
    }
  });
  const state = createState({ store, coordinator });
  const { server, baseUrl } = await listen(createApp(state));
  try {
    const list = await fetch(`${baseUrl}/api/portal/catalog/offers`, {
      headers: portalHeaders()
    });
    assert.equal(list.status, 200);
    assert.deepEqual(await list.json(), { offers: [PORTAL_OFFER] });

    const getOffer = await fetch(
      `${baseUrl}/api/portal/catalog/offers/offer_monthly_basic`,
      { headers: portalHeaders() }
    );
    assert.equal(getOffer.status, 200);
    assert.deepEqual(await getOffer.json(), { offer: PORTAL_OFFER });

    const preview = await fetch(`${baseUrl}/api/portal/commerce/checkout-preview`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ offerRef: "offer_monthly_basic" })
    });
    assert.equal(preview.status, 200);
    assert.deepEqual(await preview.json(), { quote: PORTAL_QUOTE });

    const listOrders = await fetch(
      `${baseUrl}/api/portal/commerce/orders?limit=1`
        + "&afterCreatedAt=2026-07-27T00%3A00%3A00.000Z"
        + "&afterOrderRef=order_monthly_basic_2",
      { headers: portalHeaders("session_beta") }
    );
    assert.equal(listOrders.status, 200);
    assert.deepEqual(await listOrders.json(), {
      orders: [PORTAL_HELD_ORDER],
      nextCursor: {
        afterCreatedAt: PORTAL_HELD_ORDER.createdAt,
        afterOrderRef: PORTAL_HELD_ORDER.orderRef
      }
    });

    const createOrder = await fetch(`${baseUrl}/api/portal/commerce/orders`, {
      method: "POST",
      headers: jsonHeaders("session_alpha", "idem-create-1"),
      body: JSON.stringify({ quoteRef: "quote_monthly_basic_1" })
    });
    assert.equal(createOrder.status, 201);
    assert.deepEqual(await createOrder.json(), { order: PORTAL_HELD_ORDER });

    const cancel = await fetch(
      `${baseUrl}/api/portal/commerce/orders/order_monthly_basic_1/cancel`,
      {
        method: "POST",
        headers: jsonHeaders("session_alpha", "idem-cancel-1"),
        body: "{}"
      }
    );
    assert.equal(cancel.status, 200);
    assert.deepEqual(await cancel.json(), { order: PORTAL_CANCELLED_ORDER });

    const getOrder = await fetch(
      `${baseUrl}/api/portal/commerce/orders/order_monthly_basic_1`,
      { headers: portalHeaders() }
    );
    assert.equal(getOrder.status, 200);
    assert.deepEqual(await getOrder.json(), { order: PORTAL_HELD_ORDER });

    assert.deepEqual(calls, [
      ["listPublishedOffers", { accountId: "acct_alpha" }],
      ["getPublishedOffer", {
        accountId: "acct_alpha",
        offerRef: "offer_monthly_basic"
      }],
      ["createCheckoutQuote", {
        accountId: "acct_alpha",
        offerRef: "offer_monthly_basic"
      }],
      ["listOrders", {
        accountId: "acct_beta",
        limit: 1,
        afterCreatedAt: "2026-07-27T00:00:00.000Z",
        afterOrderRef: "order_monthly_basic_2"
      }],
      ["confirmOrder", {
        accountId: "acct_alpha",
        quoteRef: "quote_monthly_basic_1",
        operation: {
          actorScope: "portal:acct_alpha",
          idempotencyKey: "idem-create-1",
          actorType: "portal_user",
          actorRef: "acct_alpha"
        }
      }],
      ["cancelOrder", {
        accountId: "acct_alpha",
        orderRef: "order_monthly_basic_1",
        operation: {
          actorScope: "portal:acct_alpha",
          idempotencyKey: "idem-cancel-1",
          actorType: "portal_user",
          actorRef: "acct_alpha"
        }
      }],
      ["getOrder", {
        accountId: "acct_alpha",
        orderRef: "order_monthly_basic_1"
      }]
    ]);
    assert.deepEqual(coordinatorReads, []);
  } finally {
    await closeServer(server);
  }
});

test("pack subscription handoff requires the owner session and never caches material", async () => {
  const calls = [];
  const state = createState();
  state.platform.coinCommerceDataPackOrderDelivery = {
    get(input) {
      calls.push(input);
      if (input.accountId !== "acct_alpha") {
        throw routeError("coin_commerce_data_pack_delivery_unavailable", "private order");
      }
      return {
        orderRef: input.orderRef,
        subscriptionUrl: "https://example.invalid/synthetic-pack",
        usage: { totalBytes: 100 * 1024 ** 3, usedBytes: 0,
          remainingBytes: 100 * 1024 ** 3, collectionStatus: "measured_zero",
          updatedAt: "2026-09-28T00:00:00.000Z", exhausted: false }
      };
    }
  };
  const { server, baseUrl } = await listen(createApp(state));
  const path = "/api/portal/commerce/orders/coinord_pack_delivery/subscription";
  try {
    const anonymous = await fetch(`${baseUrl}${path}`);
    assert.equal(anonymous.status, 401);
    assert.match(anonymous.headers.get("cache-control"), /no-store/);
    assert.equal(calls.length, 0);

    const owned = await fetch(`${baseUrl}${path}`, { headers: portalHeaders() });
    assert.equal(owned.status, 200);
    assert.match(owned.headers.get("cache-control"), /no-store/);
    assert.equal(owned.headers.get("referrer-policy"), "no-referrer");
    assert.deepEqual(await owned.json(), {
      orderRef: "coinord_pack_delivery",
      subscriptionUrl: "https://example.invalid/synthetic-pack",
      usage: { totalBytes: 100 * 1024 ** 3, usedBytes: 0,
        remainingBytes: 100 * 1024 ** 3, collectionStatus: "measured_zero",
        updatedAt: "2026-09-28T00:00:00.000Z", exhausted: false }
    });
    assert.deepEqual(calls, [{ accountId: "acct_alpha",
      orderRef: "coinord_pack_delivery" }]);

    const otherAccount = await fetch(`${baseUrl}${path}`, {
      headers: portalHeaders("session_beta")
    });
    assert.equal(otherAccount.status, 404);
    assert.match(otherAccount.headers.get("cache-control"), /no-store/);
    assert.deepEqual(calls[1], { accountId: "acct_beta",
      orderRef: "coinord_pack_delivery" });

    const withQuery = await fetch(`${baseUrl}${path}?leak=1`, {
      headers: portalHeaders()
    });
    assert.equal(withQuery.status, 400);
    assert.match(withQuery.headers.get("cache-control"), /no-store/);
    assert.equal(calls.length, 2);
  } finally {
    await closeServer(server);
  }
});

test("pack handoff preserves unknown usage and closes malformed delivery", async () => {
  const state = createState();
  let result = {
    orderRef: "coinord_pack_delivery",
    subscriptionUrl: "https://example.invalid/synthetic-pack",
    usage: { totalBytes: 100 * 1024 ** 3, usedBytes: null,
      remainingBytes: null, collectionStatus: "pending", updatedAt: null, exhausted: null }
  };
  state.platform.coinCommerceDataPackOrderDelivery = { get: () => result };
  const { server, baseUrl } = await listen(createApp(state));
  const path = "/api/portal/commerce/orders/coinord_pack_delivery/subscription";
  try {
    const pending = await fetch(`${baseUrl}${path}`, { headers: portalHeaders() });
    assert.equal(pending.status, 200);
    assert.equal((await pending.json()).usage.remainingBytes, null);
    result = { ...result, subscriptionUrl: "https://" };
    const malformed = await fetch(`${baseUrl}${path}`, { headers: portalHeaders() });
    assert.equal(malformed.status, 404);
    assert.match(malformed.headers.get("cache-control"), /no-store/);
    assert.deepEqual(await malformed.json(), {
      error: { code: "commerce_not_found", retryable: false }
    });
  } finally {
    await closeServer(server);
  }
});

test("pack rotation route is owner-only, no-store and returns no material", async () => {
  const state = createState();
  const rotated = [];
  state.platform.coinCommerceDataPackOrderDelivery = {
    get({ accountId }) {
      if (accountId !== "acct_alpha") throw new Error("private order");
      return { orderRef: "coinord_pack_delivery",
        subscriptionUrl: "https://example.invalid/synthetic-pack",
        usage: { totalBytes: 100 * 1024 ** 3, usedBytes: 0,
          remainingBytes: 100 * 1024 ** 3, collectionStatus: "measured_zero",
          updatedAt: "2026-09-28T00:00:00.000Z", exhausted: false } };
    }
  };
  state.platform.coinCommerceDataPackArtifactRotation = {
    rotate(input) { rotated.push(input); return { status: "complete", orderRef: input.orderRef }; }
  };
  const { server, baseUrl } = await listen(createApp(state));
  const path = "/api/portal/commerce/orders/coinord_pack_delivery/subscription/rotate";
  const body = JSON.stringify({ rotationRef: "packrot_portal_once" });
  const headers = { ...portalHeaders(), "Content-Type": "application/json" };
  try {
    const anonymous = await fetch(`${baseUrl}${path}`, { method: "POST", body,
      headers: { "Content-Type": "application/json" } });
    assert.equal(anonymous.status, 401);
    assert.match(anonymous.headers.get("cache-control"), /no-store/);
    const other = await fetch(`${baseUrl}${path}`, { method: "POST", body,
      headers: { ...headers, ...portalHeaders("session_beta") } });
    assert.equal(other.status, 404);
    assert.deepEqual(rotated, []);
    const accepted = await fetch(`${baseUrl}${path}`, { method: "POST", body, headers });
    assert.equal(accepted.status, 200);
    assert.match(accepted.headers.get("cache-control"), /no-store/);
    assert.deepEqual(await accepted.json(), {
      orderRef: "coinord_pack_delivery", status: "complete"
    });
    assert.deepEqual(rotated, [{ accountId: "acct_alpha",
      orderRef: "coinord_pack_delivery", rotationRef: "packrot_portal_once" }]);
    const malformed = await fetch(`${baseUrl}${path}`, { method: "POST",
      body: JSON.stringify({ rotationRef: "invalid-ref" }), headers });
    assert.equal(malformed.status, 400);
    assert.equal(rotated.length, 1);
  } finally { await closeServer(server); }
});

test("Commerce routes stay unmounted unless the flag and required runtime services are present", async (t) => {
  let serviceGetterReads = 0;
  const cases = [
    ["disabled Commerce flag", (state) => {
      state.platform.coinsCommerceEnabled = false;
    }],
    ["disabled Portal routes flag", (state) => {
      state.platform.userPortalRoutesEnabled = false;
    }],
    ["missing Commerce Store", (state) => {
      delete state.platform.coinCommerceStore;
    }],
    ["missing Portal auth", (state) => {
      delete state.platform.userPortalAuth;
    }],
    ["missing Commerce coordinator", (state) => {
      delete state.platform.coinCommerceCoordinator;
    }],
    ["malformed Commerce Store surface", (state) => {
      state.platform.coinCommerceStore = {};
    }],
    ["Commerce Store missing listOrders", (state) => {
      delete state.platform.coinCommerceStore.listOrders;
    }],
    ["malformed Portal auth surface", (state) => {
      state.platform.userPortalAuth = {};
    }],
    ["malformed Commerce coordinator surface", (state) => {
      state.platform.coinCommerceCoordinator = { start() {} };
    }],
    ["accessor-backed Commerce service", (state) => {
      Object.defineProperty(state.platform, "coinCommerceStore", {
        enumerable: true,
        get() {
          serviceGetterReads += 1;
          throw new Error("route mount gate must not execute service accessors");
        }
      });
    }]
  ];

  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      let authCalls = 0;
      let storeCalls = 0;
      const auth = createAuth({
        requireSession({ sessionRef }) {
          authCalls += 1;
          return { sessionRef, accountId: "acct_alpha" };
        }
      });
      const { store } = createStore({
        listPublishedOffers() {
          storeCalls += 1;
          return [clone(FULL_OFFER)];
        }
      });
      const state = createState({ auth, store });
      mutate(state);
      const { server, baseUrl } = await listen(createApp(state));
      try {
        const response = await fetch(
          `${baseUrl}/api/portal/catalog/offers`,
          { headers: portalHeaders() }
        );
        assert.equal(response.status, 401);
        assert.deepEqual(await response.json(), { error: "Unauthorized" });
        assert.equal(authCalls, 0);
        assert.equal(storeCalls, 0);
      } finally {
        await closeServer(server);
      }
    });
  }
  assert.equal(serviceGetterReads, 0);
});

test("order-list query is canonical, bounded, paired, single-valued, and account-free", async (t) => {
  const { store, calls } = createStore({
    listOrders(input) {
      calls.push(["listOrders", clone(input)]);
      return { orders: [], nextCursor: null };
    }
  });
  const { server, baseUrl } = await listen(createApp(createState({ store })));
  try {
    for (const limit of [1, 100]) {
      await t.test(`accepts limit ${limit}`, async () => {
        const response = await fetch(
          `${baseUrl}/api/portal/commerce/orders?limit=${limit}`,
          { headers: portalHeaders() }
        );
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
          orders: [],
          nextCursor: null
        });
      });
    }

    const beforeRejected = calls.length;
    for (const query of [
      "",
      "?limit=0",
      "?limit=101",
      "?limit=01",
      "?limit=1.0",
      "?limit=1&unknown=true",
      "?limit=1&accountId=acct_beta",
      "?limit=1&limit=2",
      "?limit=1&afterCreatedAt=2026-07-27T00%3A00%3A00.000Z",
      "?limit=1&afterOrderRef=order_monthly_basic_1",
      "?limit=1&afterCreatedAt=2026-07-27T00%3A00%3A00Z"
        + "&afterOrderRef=order_monthly_basic_1",
      "?limit=1&afterCreatedAt=2026-07-27T00%3A00%3A00.000Z"
        + "&afterOrderRef=ORDER_UNSAFE",
      "?limit=1&afterCreatedAt=2026-07-27T00%3A00%3A00.000Z"
        + "&afterCreatedAt=2026-07-26T00%3A00%3A00.000Z"
        + "&afterOrderRef=order_monthly_basic_1",
      "?limit=1&afterCreatedAt=2026-07-27T00%3A00%3A00.000Z"
        + "&afterOrderRef=order_monthly_basic_1"
        + "&afterOrderRef=order_monthly_basic_2"
    ]) {
      await t.test(`rejects ${query || "missing query"}`, async () => {
        const response = await fetch(
          `${baseUrl}/api/portal/commerce/orders${query}`,
          { headers: portalHeaders() }
        );
        await expectCommerceError(
          response,
          400,
          "commerce_request_invalid"
        );
      });
    }
    assert.equal(calls.length, beforeRejected);
    assert.deepEqual(calls, [
      ["listOrders", { accountId: "acct_alpha", limit: 1 }],
      ["listOrders", { accountId: "acct_alpha", limit: 100 }]
    ]);
  } finally {
    await closeServer(server);
  }
});

test("order-list GET returns only its stable safe page without Commerce or Wallet mutation", async () => {
  let mutationCalls = 0;
  let walletMutationCalls = 0;
  const { store, calls } = createStore({
    createCheckoutQuote() {
      mutationCalls += 1;
    },
    confirmOrder() {
      mutationCalls += 1;
    },
    cancelOrder() {
      mutationCalls += 1;
    },
    listOrders(input) {
      calls.push(["listOrders", clone(input)]);
      return {
        orders: [clone(FULL_HELD_ORDER)],
        nextCursor: {
          afterCreatedAt: FULL_HELD_ORDER.createdAt,
          afterOrderRef: FULL_HELD_ORDER.orderRef
        }
      };
    }
  });
  const coordinator = {
    start() {
      mutationCalls += 1;
    },
    stop() {
      mutationCalls += 1;
    }
  };
  const state = createState({ store, coordinator });
  state.platform.coinsWalletStore = {
    debitCoins() {
      walletMutationCalls += 1;
    }
  };
  const { server, baseUrl } = await listen(createApp(state));
  try {
    const response = await fetch(
      `${baseUrl}/api/portal/commerce/orders?limit=1`,
      { headers: portalHeaders("session_beta") }
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      orders: [PORTAL_HELD_ORDER],
      nextCursor: {
        afterCreatedAt: PORTAL_HELD_ORDER.createdAt,
        afterOrderRef: PORTAL_HELD_ORDER.orderRef
      }
    });
    assert.deepEqual(calls, [
      ["listOrders", { accountId: "acct_beta", limit: 1 }]
    ]);
    assert.equal(mutationCalls, 0);
    assert.equal(walletMutationCalls, 0);
  } finally {
    await closeServer(server);
  }
});

test("Portal session is raw-header-only and malformed successful auth projections fail closed", async (t) => {
  const { store, calls } = createStore();
  const { server, baseUrl } = await listen(createApp(createState({ store })));
  try {
    await t.test("missing header is not replaced by Bearer, body, or query data", async () => {
      const bearerOnly = await fetch(`${baseUrl}/api/portal/catalog/offers`, {
        headers: { Authorization: `Bearer ${CONSOLE_TOKEN}` }
      });
      await expectCommerceError(
        bearerOnly,
        401,
        "commerce_session_invalid"
      );

      const bodyOnly = await fetch(`${baseUrl}/api/portal/commerce/checkout-preview`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${CONSOLE_TOKEN}`
        },
        body: JSON.stringify({
          offerRef: "offer_monthly_basic",
          sessionRef: "session_alpha",
          accountId: "acct_alpha"
        })
      });
      await expectCommerceError(bodyOnly, 401, "commerce_session_invalid");

      const queryOnly = await fetch(
        `${baseUrl}/api/portal/catalog/offers?sessionRef=session_alpha&accountId=acct_alpha`
      );
      await expectCommerceError(queryOnly, 400, "commerce_request_invalid");
    });

    await t.test("empty, comma-combined, invalid, and revoked sessions are rejected", async () => {
      for (const sessionRef of [
        "",
        "session_alpha,session_beta",
        "session alpha",
        "session_unknown",
        "session_revoked"
      ]) {
        const response = await rawRequest(baseUrl, {
          path: "/api/portal/catalog/offers",
          headers: ["X-Portal-Session", sessionRef]
        });
        assert.equal(response.status, 401);
        assert.deepEqual(
          response.json,
          COMMERCE_ERROR("commerce_session_invalid")
        );
      }
    });

    await t.test("duplicate raw session headers are rejected before auth or Store use", async () => {
      const response = await rawRequest(baseUrl, {
        path: "/api/portal/catalog/offers",
        headers: [
          "X-Portal-Session", "session_alpha",
          "x-portal-session", "session_alpha"
        ]
      });
      assert.equal(response.status, 401);
      assert.deepEqual(
        response.json,
        COMMERCE_ERROR("commerce_session_invalid")
      );
    });

    assert.deepEqual(calls, []);
  } finally {
    await closeServer(server);
  }

  const projections = [
    {
      name: "extra field",
      value: {
        sessionRef: "session_alpha",
        accountId: "acct_alpha",
        role: "admin"
      }
    },
    {
      name: "mismatched session",
      value: {
        sessionRef: "session_beta",
        accountId: "acct_alpha"
      }
    },
    {
      name: "invalid account grammar",
      value: {
        sessionRef: "session_alpha",
        accountId: "Acct-Alpha"
      }
    },
    {
      name: "custom prototype",
      value: Object.assign(Object.create(null), {
        sessionRef: "session_alpha",
        accountId: "acct_alpha"
      })
    }
  ];
  for (const projection of projections) {
    await t.test(projection.name, async () => {
      const auth = createAuth({
        requireSession() {
          return projection.value;
        }
      });
      const harness = await listen(createApp(createState({ auth })));
      try {
        const response = await fetch(
          `${harness.baseUrl}/api/portal/catalog/offers`,
          { headers: portalHeaders() }
        );
        await expectCommerceError(response, 503, "commerce_unavailable", true);
      } finally {
        await closeServer(harness.server);
      }
    });
  }

  let accessorReads = 0;
  const accessorProjection = {};
  Object.defineProperties(accessorProjection, {
    sessionRef: {
      enumerable: true,
      get() {
        accessorReads += 1;
        return "session_alpha";
      }
    },
    accountId: {
      enumerable: true,
      value: "acct_alpha"
    }
  });
  const accessorAuth = createAuth({
    requireSession() {
      return accessorProjection;
    }
  });
  const accessorHarness = await listen(createApp(createState({
    auth: accessorAuth
  })));
  try {
    const response = await fetch(
      `${accessorHarness.baseUrl}/api/portal/catalog/offers`,
      { headers: portalHeaders() }
    );
    await expectCommerceError(response, 503, "commerce_unavailable", true);
    assert.equal(accessorReads, 0);
  } finally {
    await closeServer(accessorHarness.server);
  }
});

test("outer raw dispatcher selects only canonical method and path shapes", async () => {
  let authCalls = 0;
  const auth = createAuth({
    requireSession(input) {
      authCalls += 1;
      return {
        sessionRef: input.sessionRef,
        accountId: "acct_alpha"
      };
    }
  });
  const { store, calls } = createStore();
  const { server, baseUrl } = await listen(createApp(createState({
    auth,
    store
  })));
  try {
    const fallthroughs = [
      {
        method: "HEAD",
        path: "/api/portal/catalog/offers"
      },
      {
        method: "OPTIONS",
        path: "/api/portal/catalog/offers"
      },
      {
        method: "PUT",
        path: "/api/portal/commerce/orders"
      },
      {
        method: "GET",
        path: "/api/portal/catalog/offers/"
      },
      {
        method: "GET",
        path: "/api/portal/catalog/offers/offer_monthly_basic/extra"
      },
      {
        method: "GET",
        path: "/api/portal/Catalog/offers"
      },
      {
        method: "GET",
        path: "/api/portal/catalog/offers/offer_%6donthly_basic"
      },
      {
        method: "GET",
        path: "/api/portal/commerce/orders/order_monthly_%62asic_1"
      }
    ];
    for (const request of fallthroughs) {
      const response = await rawRequest(baseUrl, {
        ...request,
        headers: ["X-Portal-Session", "session_alpha"]
      });
      assert.equal(
        response.status,
        401,
        `${request.method} ${request.path}`
      );
      if (request.method !== "HEAD") {
        assert.deepEqual(response.json, { error: "Unauthorized" });
      }
    }

    const queried = await fetch(
      `${baseUrl}/api/portal/catalog/offers?accountId=acct_alpha`,
      { headers: portalHeaders() }
    );
    await expectCommerceError(queried, 400, "commerce_request_invalid");

    assert.equal(authCalls, 0);
    assert.deepEqual(calls, []);
  } finally {
    await closeServer(server);
  }
});

test("POST request parsing is exact, byte-limited, and idempotency headers are canonical", async (t) => {
  const { store, calls } = createStore();
  const { server, baseUrl } = await listen(createApp(createState({ store })));
  try {
    await t.test("missing, unsupported, and duplicate Content-Type are request-invalid", async () => {
      const cases = [
        ["X-Portal-Session", "session_alpha"],
        [
          "X-Portal-Session", "session_alpha",
          "Content-Type", "text/plain"
        ],
        [
          "X-Portal-Session", "session_alpha",
          "Content-Type", "application/json",
          "content-type", "application/json"
        ],
        [
          "X-Portal-Session", "session_alpha",
          "Content-Type", "application/json; charset=latin1"
        ]
      ];
      for (const headers of cases) {
        const response = await rawRequest(baseUrl, {
          method: "POST",
          path: "/api/portal/commerce/checkout-preview",
          headers,
          body: JSON.stringify({ offerRef: "offer_monthly_basic" })
        });
        assert.equal(response.status, 400);
        assert.deepEqual(
          response.json,
          COMMERCE_ERROR("commerce_request_invalid")
        );
      }
    });

    await t.test("malformed, primitive, array, missing, and extra-field JSON are request-invalid", async () => {
      for (const body of [
        "{",
        "null",
        "true",
        "[]",
        "{}",
        JSON.stringify({
          offerRef: "offer_monthly_basic",
          accountId: "acct_alpha"
        })
      ]) {
        const response = await rawRequest(baseUrl, {
          method: "POST",
          path: "/api/portal/commerce/checkout-preview",
          headers: [
            "X-Portal-Session", "session_alpha",
            "Content-Type", "application/json"
          ],
          body
        });
        assert.equal(response.status, 400);
        assert.deepEqual(
          response.json,
          COMMERCE_ERROR("commerce_request_invalid")
        );
      }
    });

    await t.test("a zero-byte cancel body is request-invalid before Store mutation", async () => {
      const response = await rawRequest(baseUrl, {
        method: "POST",
        path: "/api/portal/commerce/orders/order_monthly_basic_1/cancel",
        headers: [
          "X-Portal-Session", "session_alpha",
          "Content-Type", "application/json",
          "Idempotency-Key", "idem-empty-cancel"
        ]
      });
      assert.equal(response.status, 400);
      assert.deepEqual(
        response.json,
        COMMERCE_ERROR("commerce_request_invalid")
      );
    });

    await t.test("the parser accepts exactly 16384 bytes and rejects 16385 bytes", async () => {
      const canonical = JSON.stringify({ offerRef: "offer_monthly_basic" });
      const exactBody = canonical.padEnd(16_384, " ");
      const accepted = await rawRequest(baseUrl, {
        method: "POST",
        path: "/api/portal/commerce/checkout-preview",
        headers: [
          "X-Portal-Session", "session_alpha",
          "Content-Type", "application/json; charset=UTF-8",
          "Content-Length", String(Buffer.byteLength(exactBody))
        ],
        body: exactBody
      });
      assert.equal(accepted.status, 200);
      assert.deepEqual(accepted.json, { quote: PORTAL_QUOTE });

      const oversizedBody = exactBody + " ";
      const rejected = await rawRequest(baseUrl, {
        method: "POST",
        path: "/api/portal/commerce/checkout-preview",
        headers: [
          "X-Portal-Session", "session_alpha",
          "Content-Type", "application/json",
          "Content-Length", String(Buffer.byteLength(oversizedBody))
        ],
        body: oversizedBody
      });
      assert.equal(rejected.status, 400);
      assert.deepEqual(
        rejected.json,
        COMMERCE_ERROR("commerce_request_invalid")
      );
    });

    await t.test("create and cancel require one canonical Idempotency-Key", async () => {
      const targets = [
        {
          path: "/api/portal/commerce/orders",
          body: JSON.stringify({ quoteRef: "quote_monthly_basic_1" })
        },
        {
          path: "/api/portal/commerce/orders/order_monthly_basic_1/cancel",
          body: "{}"
        }
      ];
      for (const target of targets) {
        const missing = await rawRequest(baseUrl, {
          method: "POST",
          path: target.path,
          headers: [
            "X-Portal-Session", "session_alpha",
            "Content-Type", "application/json"
          ],
          body: target.body
        });
        assert.equal(missing.status, 400);
        assert.deepEqual(
          missing.json,
          COMMERCE_ERROR("idempotency_key_required")
        );

        for (const idempotencyHeaders of [
          ["Idempotency-Key", "bad key"],
          ["Idempotency-Key", "first,second"],
          [
            "Idempotency-Key", "first",
            "idempotency-key", "second"
          ],
          ["Idempotency-Key", "x".repeat(129)]
        ]) {
          const response = await rawRequest(baseUrl, {
            method: "POST",
            path: target.path,
            headers: [
              "X-Portal-Session", "session_alpha",
              "Content-Type", "application/json",
              ...idempotencyHeaders
            ],
            body: target.body
          });
          assert.equal(response.status, 400);
          assert.deepEqual(
            response.json,
            COMMERCE_ERROR("commerce_request_invalid")
          );
        }
      }
    });

    assert.deepEqual(calls, [
      ["createCheckoutQuote", {
        accountId: "acct_alpha",
        offerRef: "offer_monthly_basic"
      }]
    ]);
  } finally {
    await closeServer(server);
  }
});

test("Store errors use the closed safe mapping and never expose internal detail", async (t) => {
  const mappings = [
    ["commerce_not_found", 404, "commerce_not_found", false],
    ["idempotency_key_reused", 409, "idempotency_key_reused", false],
    ["offer_unavailable", 409, "offer_unavailable", false],
    ["quote_expired", 409, "quote_expired", false],
    ["quote_stale", 409, "quote_stale", false],
    ["cancel_window_closed", 409, "cancel_window_closed", false],
    ["capture_in_progress", 409, "capture_in_progress", true],
    ["insufficient_coins", 423, "insufficient_coins", false],
    ["wallet_not_active", 423, "wallet_not_active", false],
    ["reconciliation_required", 423, "reconciliation_required", false]
  ];
  for (const [storeCode, status, responseCode, retryable] of mappings) {
    await t.test(storeCode, async () => {
      const { store } = createStore({
        confirmOrder() {
          throw routeError(storeCode, `secret detail for ${storeCode}`);
        }
      });
      const { server, baseUrl } = await listen(createApp(createState({ store })));
      try {
        const response = await fetch(`${baseUrl}/api/portal/commerce/orders`, {
          method: "POST",
          headers: jsonHeaders("session_alpha", `idem-${storeCode}`),
          body: JSON.stringify({ quoteRef: "quote_monthly_basic_1" })
        });
        await expectCommerceError(response, status, responseCode, retryable);
      } finally {
        await closeServer(server);
      }
    });
  }

  await t.test("GET offer maps offer_unavailable to indistinguishable not-found", async () => {
    const { store } = createStore({
      getPublishedOffer() {
        throw routeError("offer_unavailable", "private catalog detail");
      }
    });
    const { server, baseUrl } = await listen(createApp(createState({ store })));
    try {
      const response = await fetch(
        `${baseUrl}/api/portal/catalog/offers/offer_monthly_basic`,
        { headers: portalHeaders() }
      );
      await expectCommerceError(response, 404, "commerce_not_found");
    } finally {
      await closeServer(server);
    }
  });

  await t.test("unknown and accessor-backed errors become generic unavailable", async () => {
    let codeReads = 0;
    const error = new Error("SQL and database path must remain private");
    Object.defineProperty(error, "code", {
      get() {
        codeReads += 1;
        return "commerce_not_found";
      }
    });
    const { store } = createStore({
      listPublishedOffers() {
        throw error;
      }
    });
    const { server, baseUrl } = await listen(createApp(createState({ store })));
    try {
      const response = await fetch(`${baseUrl}/api/portal/catalog/offers`, {
        headers: portalHeaders()
      });
      await expectCommerceError(response, 503, "commerce_unavailable", true);
      assert.equal(codeReads, 0);
    } finally {
      await closeServer(server);
    }
  });

  await t.test("Proxy errors cannot spoof an allowlisted code before reflection", async () => {
    let descriptorReads = 0;
    const error = new Proxy(
      new Error("private Store failure detail"),
      {
        getOwnPropertyDescriptor(target, key) {
          descriptorReads += 1;
          if (key === "code") {
            return {
              configurable: true,
              enumerable: true,
              value: "commerce_not_found",
              writable: false
            };
          }
          return Reflect.getOwnPropertyDescriptor(target, key);
        }
      }
    );
    const { store } = createStore({
      listPublishedOffers() {
        throw error;
      }
    });
    const { server, baseUrl } = await listen(createApp(createState({ store })));
    try {
      const response = await fetch(`${baseUrl}/api/portal/catalog/offers`, {
        headers: portalHeaders()
      });
      await expectCommerceError(response, 503, "commerce_unavailable", true);
      assert.equal(descriptorReads, 0);
    } finally {
      await closeServer(server);
    }
  });
});

test("cross-account references, stable replay, and idempotency drift are closed at the Store boundary", async () => {
  const quotes = new Map([
    ["quote_monthly_basic_1", "acct_alpha"]
  ]);
  const receipts = new Map();
  const orders = new Map();
  const { store, calls } = createStore({
    confirmOrder(input) {
      calls.push(["confirmOrder", clone(input)]);
      const prior = receipts.get(input.operation.idempotencyKey);
      if (prior) {
        if (prior.quoteRef !== input.quoteRef || prior.accountId !== input.accountId) {
          throw routeError("idempotency_key_reused");
        }
        return clone(prior.order);
      }
      if (quotes.get(input.quoteRef) !== input.accountId) {
        throw routeError("commerce_not_found");
      }
      const order = clone(FULL_HELD_ORDER);
      receipts.set(input.operation.idempotencyKey, {
        quoteRef: input.quoteRef,
        accountId: input.accountId,
        order
      });
      orders.set(order.orderRef, {
        accountId: input.accountId,
        order
      });
      return clone(order);
    },
    getOrder(input) {
      calls.push(["getOrder", clone(input)]);
      const record = orders.get(input.orderRef);
      if (!record || record.accountId !== input.accountId) {
        throw routeError("commerce_not_found");
      }
      return clone(record.order);
    }
  });
  const { server, baseUrl } = await listen(createApp(createState({ store })));
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const replay = await fetch(`${baseUrl}/api/portal/commerce/orders`, {
        method: "POST",
        headers: jsonHeaders("session_alpha", "idem-stable-replay"),
        body: JSON.stringify({ quoteRef: "quote_monthly_basic_1" })
      });
      assert.equal(replay.status, 201);
      assert.deepEqual(await replay.json(), { order: PORTAL_HELD_ORDER });
    }

    const crossAccountQuote = await fetch(
      `${baseUrl}/api/portal/commerce/orders`,
      {
        method: "POST",
        headers: jsonHeaders("session_beta", "idem-cross-account"),
        body: JSON.stringify({ quoteRef: "quote_monthly_basic_1" })
      }
    );
    await expectCommerceError(crossAccountQuote, 404, "commerce_not_found");

    const crossAccountOrder = await fetch(
      `${baseUrl}/api/portal/commerce/orders/order_monthly_basic_1`,
      { headers: portalHeaders("session_beta") }
    );
    await expectCommerceError(crossAccountOrder, 404, "commerce_not_found");

    const drift = await fetch(`${baseUrl}/api/portal/commerce/orders`, {
      method: "POST",
      headers: jsonHeaders("session_alpha", "idem-stable-replay"),
      body: JSON.stringify({ quoteRef: "quote_other_1" })
    });
    await expectCommerceError(drift, 409, "idempotency_key_reused");

    assert.equal(
      calls.every(([, input]) => (
        input.accountId === "acct_alpha" || input.accountId === "acct_beta"
      )),
      true
    );
  } finally {
    await closeServer(server);
  }
});

test("successful Offer projections reject Proxies before any reflection trap", async (t) => {
  const cases = [
    {
      name: "top-level exact object Proxy",
      build() {
        const trap = reflectionTrapCounter();
        const proxy = new Proxy(clone(FULL_OFFER), trap.handler);
        return { offer: proxy, proxy, reads: trap.reads };
      }
    },
    {
      name: "nested exact object Proxy",
      build() {
        const offer = clone(FULL_OFFER);
        const trap = reflectionTrapCounter();
        const proxy = new Proxy(offer.title, trap.handler);
        offer.title = proxy;
        return { offer, proxy, reads: trap.reads };
      }
    },
    {
      name: "plain array Proxy",
      build() {
        const offer = clone(FULL_OFFER);
        const trap = reflectionTrapCounter();
        const proxy = new Proxy(offer.acceptedCoinTypes, trap.handler);
        offer.acceptedCoinTypes = proxy;
        return { offer, proxy, reads: trap.reads };
      }
    }
  ];

  function reflectionTrapCounter() {
    let reads = 0;
    return {
      handler: {
        getPrototypeOf(target) {
          reads += 1;
          return Reflect.getPrototypeOf(target);
        },
        ownKeys(target) {
          reads += 1;
          return Reflect.ownKeys(target);
        },
        getOwnPropertyDescriptor(target, key) {
          reads += 1;
          return Reflect.getOwnPropertyDescriptor(target, key);
        }
      },
      reads: () => reads
    };
  }

  for (const entry of cases) {
    await t.test(entry.name, async () => {
      const { offer, proxy, reads } = entry.build();
      assert.equal(types.isProxy(proxy), true);
      const { store } = createStore({
        getPublishedOffer() {
          return offer;
        }
      });
      const { server, baseUrl } = await listen(createApp(createState({ store })));
      try {
        const response = await fetch(
          `${baseUrl}/api/portal/catalog/offers/offer_monthly_basic`,
          { headers: portalHeaders() }
        );
        await expectCommerceError(response, 503, "commerce_unavailable", true);
        assert.equal(reads(), 0);
      } finally {
        await closeServer(server);
      }
    });
  }
});

test("successful projections reject structural, execution, numeric, time, arithmetic, and state drift", async (t) => {
  let offerGetterReads = 0;
  let arrayIndexReads = 0;
  let iteratorReads = 0;
  let thenReads = 0;

  const accessorOffer = clone(FULL_OFFER);
  Object.defineProperty(accessorOffer, "title", {
    enumerable: true,
    get() {
      offerGetterReads += 1;
      return FULL_OFFER.title;
    }
  });

  const symbolOffer = clone(FULL_OFFER);
  symbolOffer[Symbol("internal")] = "must not project";

  const extraOffer = clone(FULL_OFFER);
  extraOffer.internalCost = 99;

  const missingOffer = clone(FULL_OFFER);
  delete missingOffer.summary;

  const customPrototypeOffer = clone(FULL_OFFER);
  Object.setPrototypeOf(customPrototypeOffer, { inherited: true });

  const nonEnumerableOffer = clone(FULL_OFFER);
  Object.defineProperty(nonEnumerableOffer, "title", {
    enumerable: false,
    value: nonEnumerableOffer.title
  });

  const sparseOffers = new Array(1);

  const extraPropertyOffers = [clone(FULL_OFFER)];
  extraPropertyOffers.internal = true;

  const nonEnumerableIndexOffers = [clone(FULL_OFFER)];
  Object.defineProperty(nonEnumerableIndexOffers, "0", {
    enumerable: false,
    value: nonEnumerableIndexOffers[0]
  });

  const accessorIndexOffers = [];
  Object.defineProperty(accessorIndexOffers, "0", {
    enumerable: true,
    get() {
      arrayIndexReads += 1;
      return clone(FULL_OFFER);
    }
  });

  const customIteratorOffers = [clone(FULL_OFFER)];
  Object.defineProperty(customIteratorOffers, Symbol.iterator, {
    get() {
      iteratorReads += 1;
      return Array.prototype[Symbol.iterator];
    }
  });

  const thenableQuote = clone(FULL_QUOTE);
  Object.defineProperty(thenableQuote, "then", {
    get() {
      thenReads += 1;
      return () => {};
    }
  });

  const unsafeQuote = clone(FULL_QUOTE);
  unsafeQuote.amountUnits = Number.MAX_SAFE_INTEGER + 1;

  const nonFiniteQuote = clone(FULL_QUOTE);
  nonFiniteQuote.appliedDiscountBasisPoints = Number.POSITIVE_INFINITY;

  const invalidUtcQuote = clone(FULL_QUOTE);
  invalidUtcQuote.expiresAt = "2026-07-27T00:05:00Z";

  const unknownAvailabilityQuote = clone(FULL_QUOTE);
  unknownAvailabilityQuote.purchaseAvailability = "pending";

  const extraPropertyAllocationOrder = clone(FULL_HELD_ORDER);
  extraPropertyAllocationOrder.allocation.internal = true;

  const cases = [
    {
      name: "offer accessor",
      path: "/api/portal/catalog/offers",
      store: createStore({
        listPublishedOffers() {
          return [accessorOffer];
        }
      }).store
    },
    {
      name: "offer symbol",
      path: "/api/portal/catalog/offers",
      store: createStore({
        listPublishedOffers() {
          return [symbolOffer];
        }
      }).store
    },
    {
      name: "offer extra field",
      path: "/api/portal/catalog/offers",
      store: createStore({
        listPublishedOffers() {
          return [extraOffer];
        }
      }).store
    },
    {
      name: "offer missing field",
      path: "/api/portal/catalog/offers",
      store: createStore({
        listPublishedOffers() {
          return [missingOffer];
        }
      }).store
    },
    {
      name: "offer custom prototype",
      path: "/api/portal/catalog/offers",
      store: createStore({
        listPublishedOffers() {
          return [customPrototypeOffer];
        }
      }).store
    },
    {
      name: "offer non-enumerable field",
      path: "/api/portal/catalog/offers",
      store: createStore({
        listPublishedOffers() {
          return [nonEnumerableOffer];
        }
      }).store
    },
    {
      name: "sparse offer list",
      path: "/api/portal/catalog/offers",
      store: createStore({
        listPublishedOffers() {
          return sparseOffers;
        }
      }).store
    },
    {
      name: "offer list extra property",
      path: "/api/portal/catalog/offers",
      store: createStore({
        listPublishedOffers() {
          return extraPropertyOffers;
        }
      }).store
    },
    {
      name: "offer list non-enumerable index",
      path: "/api/portal/catalog/offers",
      store: createStore({
        listPublishedOffers() {
          return nonEnumerableIndexOffers;
        }
      }).store
    },
    {
      name: "offer list accessor index",
      path: "/api/portal/catalog/offers",
      store: createStore({
        listPublishedOffers() {
          return accessorIndexOffers;
        }
      }).store
    },
    {
      name: "offer list custom iterator",
      path: "/api/portal/catalog/offers",
      store: createStore({
        listPublishedOffers() {
          return customIteratorOffers;
        }
      }).store
    },
    {
      name: "plain thenable quote",
      method: "POST",
      path: "/api/portal/commerce/checkout-preview",
      headers: jsonHeaders(),
      body: JSON.stringify({ offerRef: "offer_monthly_basic" }),
      store: createStore({
        createCheckoutQuote() {
          return thenableQuote;
        }
      }).store
    },
    {
      name: "unsafe quote amount",
      method: "POST",
      path: "/api/portal/commerce/checkout-preview",
      headers: jsonHeaders(),
      body: JSON.stringify({ offerRef: "offer_monthly_basic" }),
      store: createStore({
        createCheckoutQuote() {
          return unsafeQuote;
        }
      }).store
    },
    {
      name: "non-finite quote discount",
      method: "POST",
      path: "/api/portal/commerce/checkout-preview",
      headers: jsonHeaders(),
      body: JSON.stringify({ offerRef: "offer_monthly_basic" }),
      store: createStore({
        createCheckoutQuote() {
          return nonFiniteQuote;
        }
      }).store
    },
    {
      name: "non-canonical UTC quote expiry",
      method: "POST",
      path: "/api/portal/commerce/checkout-preview",
      headers: jsonHeaders(),
      body: JSON.stringify({ offerRef: "offer_monthly_basic" }),
      store: createStore({
        createCheckoutQuote() {
          return invalidUtcQuote;
        }
      }).store
    },
    {
      name: "unknown quote availability",
      method: "POST",
      path: "/api/portal/commerce/checkout-preview",
      headers: jsonHeaders(),
      body: JSON.stringify({ offerRef: "offer_monthly_basic" }),
      store: createStore({
        createCheckoutQuote() {
          return unknownAvailabilityQuote;
        }
      }).store
    },
    {
      name: "quote balance arithmetic drift",
      method: "POST",
      path: "/api/portal/commerce/checkout-preview",
      headers: jsonHeaders(),
      body: JSON.stringify({ offerRef: "offer_monthly_basic" }),
      store: createStore({
        createCheckoutQuote() {
          const quote = clone(FULL_QUOTE);
          quote.balances.after.paidCoins += 1;
          return quote;
        }
      }).store
    },
    {
      name: "order allocation array extra property",
      path: "/api/portal/commerce/orders/order_monthly_basic_1",
      store: createStore({
        getOrder() {
          return extraPropertyAllocationOrder;
        }
      }).store
    },
    {
      name: "order allocation total drift",
      path: "/api/portal/commerce/orders/order_monthly_basic_1",
      store: createStore({
        getOrder() {
          const order = clone(FULL_HELD_ORDER);
          order.allocation[1].amountUnits = 59;
          return order;
        }
      }).store
    },
    {
      name: "non-captured order with fulfillment work",
      path: "/api/portal/commerce/orders/order_monthly_basic_1",
      store: createStore({
        getOrder() {
          const order = clone(FULL_HELD_ORDER);
          order.fulfillment = { status: "pending", safeCode: null };
          return order;
        }
      }).store
    },
    {
      name: "failed fulfillment without allowlisted safe code",
      path: "/api/portal/commerce/orders/order_monthly_basic_1",
      store: createStore({
        getOrder() {
          const order = clone(FULL_HELD_ORDER);
          order.paymentStatus = "captured";
          order.fulfillment = { status: "failed", safeCode: "sql_failed" };
          return order;
        }
      }).store
    }
  ];
  for (const entry of cases) {
    await t.test(entry.name, async () => {
      const { server, baseUrl } = await listen(createApp(createState({
        store: entry.store
      })));
      try {
        const response = await fetch(`${baseUrl}${entry.path}`, {
          method: entry.method,
          headers: entry.headers ?? portalHeaders(),
          body: entry.body
        });
        await expectCommerceError(response, 503, "commerce_unavailable", true);
      } finally {
        await closeServer(server);
      }
    });
  }
  assert.equal(offerGetterReads, 0);
  assert.equal(arrayIndexReads, 0);
  assert.equal(iteratorReads, 0);
  assert.equal(thenReads, 0);
});

test("closed Quote and Order state matrices accept only internally consistent combinations", async (t) => {
  function mutate(base, change) {
    const value = clone(base);
    change(value);
    return value;
  }

  const insufficientQuote = mutate(FULL_QUOTE, (quote) => {
    quote.purchaseAvailability = "insufficient_balance";
    quote.shortfallUnits = 20;
    quote.allocation = [];
    quote.balances.before = {
      bonusCoins: 20,
      paidCoins: 30,
      rewardCoins: 30,
      heldCoins: 0
    };
    quote.balances.after = clone(quote.balances.before);
  });
  const portalInsufficientQuote = mutate(PORTAL_QUOTE, (quote) => {
    quote.purchaseAvailability = "insufficient_balance";
    quote.shortfallUnits = 20;
    quote.allocation = [];
    quote.balances.before = {
      bonusCoins: 20,
      paidCoins: 30,
      rewardCoins: 30,
      heldCoins: 0
    };
    quote.balances.after = clone(quote.balances.before);
  });

  let quoteResult = clone(FULL_QUOTE);
  let orderResult = clone(FULL_HELD_ORDER);
  const { store } = createStore({
    createCheckoutQuote() {
      return quoteResult;
    },
    getOrder() {
      return orderResult;
    }
  });
  const { server, baseUrl } = await listen(createApp(createState({ store })));

  async function requestQuote(value) {
    quoteResult = value;
    return fetch(`${baseUrl}/api/portal/commerce/checkout-preview`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ offerRef: "offer_monthly_basic" })
    });
  }

  async function requestOrder(value) {
    orderResult = value;
    return fetch(
      `${baseUrl}/api/portal/commerce/orders/order_monthly_basic_1`,
      { headers: portalHeaders() }
    );
  }

  try {
    await t.test("valid insufficient-balance quote", async () => {
      const response = await requestQuote(insufficientQuote);
      assert.equal(response.status, 200);
      assert.deepEqual(
        await response.json(),
        { quote: portalInsufficientQuote }
      );
    });

    for (const paymentStatus of [
      "capture_pending",
      "capture_failed",
      "reconciliation_required"
    ]) {
      await t.test(`valid non-captured ${paymentStatus} order`, async () => {
        const order = mutate(FULL_HELD_ORDER, (value) => {
          value.paymentStatus = paymentStatus;
        });
        const expected = mutate(PORTAL_HELD_ORDER, (value) => {
          value.paymentStatus = paymentStatus;
        });
        const response = await requestOrder(order);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { order: expected });
      });
    }

    for (const fulfillment of [
      { status: "pending", safeCode: null },
      { status: "processing", safeCode: null },
      { status: "delivered", safeCode: null },
      {
        status: "failed",
        safeCode: "fulfillment_handler_failed"
      },
      {
        status: "failed",
        safeCode: "fulfillment_result_invalid"
      },
      {
        status: "failed",
        safeCode: "fulfillment_handler_unavailable"
      },
      {
        status: "failed",
        safeCode: "fulfillment_attempt_limit"
      }
    ]) {
      await t.test(
        `valid captured ${fulfillment.status} ${fulfillment.safeCode ?? "null"}`,
        async () => {
          const order = mutate(FULL_HELD_ORDER, (value) => {
            value.paymentStatus = "captured";
            value.fulfillment = fulfillment;
          });
          const expected = mutate(PORTAL_HELD_ORDER, (value) => {
            value.paymentStatus = "captured";
            value.fulfillment = fulfillment;
          });
          const response = await requestOrder(order);
          assert.equal(response.status, 200);
          assert.deepEqual(await response.json(), { order: expected });
        }
      );
    }

    const invalidQuotes = [
      ["available quote with shortfall", mutate(FULL_QUOTE, (quote) => {
        quote.shortfallUnits = 1;
      })],
      ["available quote with empty allocation", mutate(FULL_QUOTE, (quote) => {
        quote.allocation = [];
      })],
      ["allocation priority drift", mutate(FULL_QUOTE, (quote) => {
        quote.allocation.reverse();
      })],
      ["unaccepted allocation coin type", mutate(FULL_QUOTE, (quote) => {
        quote.allocation[0].coinType = "internal_coins";
      })],
      ["held balance arithmetic drift", mutate(FULL_QUOTE, (quote) => {
        quote.balances.after.heldCoins = 99;
      })],
      ["insufficient quote with zero shortfall", mutate(insufficientQuote, (quote) => {
        quote.shortfallUnits = 0;
      })],
      ["insufficient quote with allocation", mutate(insufficientQuote, (quote) => {
        quote.allocation = clone(FULL_QUOTE.allocation);
      })],
      ["insufficient quote with changed balances", mutate(insufficientQuote, (quote) => {
        quote.balances.after.paidCoins = 29;
      })],
      ["insufficient quote with shortfall drift", mutate(insufficientQuote, (quote) => {
        quote.shortfallUnits = 19;
      })],
      ["insufficient quote with enough accepted balance", mutate(insufficientQuote, (quote) => {
        quote.balances.before = clone(FULL_QUOTE.balances.before);
        quote.balances.after = clone(FULL_QUOTE.balances.before);
      })],
      ["discounted amount drift", mutate(FULL_QUOTE, (quote) => {
        quote.amountUnits = 99;
      })]
    ];
    for (const [name, quote] of invalidQuotes) {
      await t.test(name, async () => {
        const response = await requestQuote(quote);
        await expectCommerceError(
          response,
          503,
          "commerce_unavailable",
          true
        );
      });
    }

    const invalidOrders = [
      ["unknown payment status", mutate(FULL_HELD_ORDER, (order) => {
        order.paymentStatus = "refunded";
      })],
      ["unknown fulfillment status", mutate(FULL_HELD_ORDER, (order) => {
        order.fulfillment.status = "queued";
      })],
      ["non-captured safe code", mutate(FULL_HELD_ORDER, (order) => {
        order.fulfillment.safeCode = "fulfillment_handler_failed";
      })],
      ["captured not-requested fulfillment", mutate(FULL_HELD_ORDER, (order) => {
        order.paymentStatus = "captured";
      })],
      ["captured pending with safe code", mutate(FULL_HELD_ORDER, (order) => {
        order.paymentStatus = "captured";
        order.fulfillment = {
          status: "pending",
          safeCode: "fulfillment_handler_failed"
        };
      })],
      ["captured failed without safe code", mutate(FULL_HELD_ORDER, (order) => {
        order.paymentStatus = "captured";
        order.fulfillment = { status: "failed", safeCode: null };
      })],
      ["order allocation priority drift", mutate(FULL_HELD_ORDER, (order) => {
        order.allocation.reverse();
      })],
      ["order unaccepted allocation coin type", mutate(FULL_HELD_ORDER, (order) => {
        order.allocation[0].coinType = "internal_coins";
      })],
      ["order non-canonical UTC", mutate(FULL_HELD_ORDER, (order) => {
        order.updatedAt = "2026-07-27T00:00:00Z";
      })],
      ["cancel time before creation", mutate(FULL_HELD_ORDER, (order) => {
        order.cancelUntil = "2026-07-26T23:59:59.000Z";
      })],
      ["update time before creation", mutate(FULL_HELD_ORDER, (order) => {
        order.updatedAt = "2026-07-26T23:59:59.000Z";
      })]
    ];
    for (const [name, order] of invalidOrders) {
      await t.test(name, async () => {
        const response = await requestOrder(order);
        await expectCommerceError(
          response,
          503,
          "commerce_unavailable",
          true
        );
      });
    }
  } finally {
    await closeServer(server);
  }
});

test("checkout preview limiter is fixed-window, per-account, and resets without Store calls while limited", async () => {
  let now = 1_000;
  const { store, calls } = createStore();
  const { server, baseUrl } = await listen(createApp(
    createState({ store }),
    { rateLimitNowFn: () => now }
  ));
  try {
    async function preview(sessionRef) {
      return fetch(`${baseUrl}/api/portal/commerce/checkout-preview`, {
        method: "POST",
        headers: jsonHeaders(sessionRef),
        body: JSON.stringify({ offerRef: "offer_monthly_basic" })
      });
    }

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const response = await preview("session_alpha");
      assert.equal(response.status, 200);
      await response.arrayBuffer();
    }
    const limited = await preview("session_alpha");
    await expectCommerceError(
      limited,
      429,
      "commerce_rate_limited",
      true
    );
    assert.equal(limited.headers.get("retry-after"), "60");

    const isolated = await preview("session_beta");
    assert.equal(isolated.status, 200);
    await isolated.arrayBuffer();

    now = 60_999;
    const lastSecond = await preview("session_alpha");
    await expectCommerceError(
      lastSecond,
      429,
      "commerce_rate_limited",
      true
    );
    assert.equal(lastSecond.headers.get("retry-after"), "1");

    now = 61_000;
    const reset = await preview("session_alpha");
    assert.equal(reset.status, 200);
    await reset.arrayBuffer();

    assert.equal(
      calls.filter(([method]) => method === "createCheckoutQuote").length,
      32
    );
  } finally {
    await closeServer(server);
  }
});

for (const fulfillmentStatus of ["not_requested", "failed", "delivered"]) {
  for (const surface of ["list", "detail"]) {
    test(`reconciliation terminal fulfillment ${fulfillmentStatus} survives the ${surface} route`, async () => {
      const fixture = createReconciliationStoreFixture(fulfillmentStatus);
      let server;
      try {
        const listener = await listen(createApp(createState({ store: fixture.store })));
        server = listener.server;
        const endpoint = surface === "list"
          ? "/api/portal/commerce/orders?limit=25"
          : `/api/portal/commerce/orders/${fixture.order.orderRef}`;
        const response = await fetch(`${listener.baseUrl}${endpoint}`, {
          headers: portalHeaders()
        });
        assert.equal(response.status, 200);
        const expected = { ...fixture.order, offer: clone(PORTAL_OFFER) };
        assert.deepEqual(await response.json(), surface === "list"
          ? { orders: [expected], nextCursor: null }
          : { order: expected });
      } finally {
        if (server) await closeServer(server);
        fixture.close();
      }
    });
  }
}

test("reconciliation compatibility retains fulfillment and payment fail-closed boundaries", async () => {
  let orderResult = clone(FULL_HELD_ORDER);
  const { store } = createStore({
    getOrder: () => orderResult,
    listOrders: () => ({ orders: [orderResult], nextCursor: null })
  });
  const { server, baseUrl } = await listen(createApp(createState({ store })));
  const invalidPairs = [
    ...["held", "capture_pending", "cancelled", "capture_failed"].flatMap((paymentStatus) => [
      { paymentStatus, fulfillment: { status: "delivered", safeCode: null } },
      { paymentStatus, fulfillment: { status: "failed", safeCode: "fulfillment_handler_failed" } }
    ]),
    ...["pending", "processing"].map((status) => ({
      paymentStatus: "reconciliation_required", fulfillment: { status, safeCode: null }
    })),
    ...[
      { status: "failed", safeCode: null },
      { status: "failed", safeCode: "unknown_failure" },
      { status: "delivered", safeCode: "fulfillment_handler_failed" },
      { status: "not_requested", safeCode: "fulfillment_handler_unavailable" }
    ].map((fulfillment) => ({ paymentStatus: "reconciliation_required", fulfillment })),
    { paymentStatus: "captured", fulfillment: { status: "not_requested", safeCode: null } }
  ];
  try {
    for (const pair of invalidPairs) {
      orderResult = { ...clone(FULL_HELD_ORDER), ...pair };
      for (const endpoint of [
        "/api/portal/commerce/orders?limit=25",
        "/api/portal/commerce/orders/order_monthly_basic_1"
      ]) {
        const response = await fetch(`${baseUrl}${endpoint}`, {
          headers: portalHeaders()
        });
        await expectCommerceError(response, 503, "commerce_unavailable", true);
      }
    }
  } finally {
    await closeServer(server);
  }
});

test("checkout preview limiter caps active account buckets without evicting them", async () => {
  let now = 5_000;
  const { store } = createStore();
  const { server, baseUrl } = await listen(createApp(
    createState({ store }),
    { rateLimitNowFn: () => now }
  ));
  try {
    async function admit(index) {
      const suffix = String(index).padStart(5, "0");
      const response = await fetch(
        `${baseUrl}/api/portal/commerce/checkout-preview`,
        {
          method: "POST",
          headers: jsonHeaders(`session_${suffix}`),
          body: JSON.stringify({ offerRef: "offer_monthly_basic" })
        }
      );
      const status = response.status;
      await response.arrayBuffer();
      return status;
    }

    for (let start = 0; start < 10_000; start += 200) {
      const statuses = await Promise.all(
        Array.from(
          { length: 200 },
          (_, offset) => admit(start + offset)
        )
      );
      assert.equal(statuses.every((status) => status === 200), true);
    }

    const full = await fetch(
      `${baseUrl}/api/portal/commerce/checkout-preview`,
      {
        method: "POST",
        headers: jsonHeaders("session_10000"),
        body: JSON.stringify({ offerRef: "offer_monthly_basic" })
      }
    );
    await expectCommerceError(full, 429, "commerce_rate_limited", true);
    assert.equal(full.headers.get("retry-after"), "60");

    const existing = await admit(0);
    assert.equal(existing, 200, "an active bucket must not be evicted");

    now = 65_000;
    const afterPrune = await fetch(
      `${baseUrl}/api/portal/commerce/checkout-preview`,
      {
        method: "POST",
        headers: jsonHeaders("session_10000"),
        body: JSON.stringify({ offerRef: "offer_monthly_basic" })
      }
    );
    assert.equal(afterPrune.status, 200);
    await afterPrune.arrayBuffer();
  } finally {
    await closeServer(server);
  }
});
