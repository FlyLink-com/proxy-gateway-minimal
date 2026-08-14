import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";

import { createApp } from "../app.mjs";
import {
  COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID,
  applyCoinCommerceMigrations
} from "../services/platform/coin-commerce-migrations.mjs";
import {
  DEFERRED_RESOURCE_TRANSITION_MIGRATIONS,
  REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID,
  applyDeferredResourceTransitionMigrations
} from "../services/platform/deferred-resource-transition-migrations.mjs";
import {
  createSqliteDeferredResourceTransitionStore
} from "../services/platform/deferred-resource-transition-store.mjs";
import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  applyCoinWalletMigrations
} from "../services/platform/coin-wallet-migrations.mjs";
import {
  createSqliteCoinWalletStore
} from "../services/platform/coin-wallet-store.mjs";
import {
  REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID,
  WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATIONS,
  applyWalletFirstDeferredCheckoutMigrations
} from "../services/platform/wallet-first-deferred-checkout-migrations.mjs";
import {
  createWalletFirstDeferredCheckoutAdapter,
  snapshotWalletFirstDeferredCheckoutAdapter
} from "../services/platform/wallet-first-deferred-checkout-adapter.mjs";
import { createWalletFirstCommerceService } from "../services/platform/wallet-first-commerce-service.mjs";
import { listen } from "./helpers/listen.mjs";

const ROOT_DIR = new URL("../../", import.meta.url).pathname;
const CONSOLE_TOKEN = "console-secret";

const FULL_OFFER = Object.freeze({
  offerRef: "offer_annual_premium",
  offerVersionRef: "offerversion_annual_premium_1",
  version: 1,
  category: "plan",
  title: { zh: "年度套餐", en: "Annual plan" },
  summary: { zh: "年度服务", en: "Annual service" },
  importantNotices: {
    zh: ["按订阅周期交付"],
    en: ["Delivered by subscription period"]
  },
  baseCoinUnits: 200,
  referencePrice: { currency: "CNY", amountMinor: 20_000 },
  acceptedCoinTypes: ["bonus_coins", "paid_coins", "reward_coins"],
  delivery: {
    kind: "subscription_plan",
    durationDays: 365,
    monthlyTrafficGb: 200,
    trafficGb: null,
    neverExpires: false,
    discountBasisPoints: 0
  }
});

const DEFERRED_CHECKOUT = Object.freeze({
  quoteRef: "quote_annual_premium_1",
  offer: FULL_OFFER,
  amountUnits: 200,
  appliedDiscountBasisPoints: 0,
  purchaseAvailability: "available",
  shortfallUnits: 0,
  allocation: [{ coinType: "bonus_coins", amountUnits: 200 }],
  balances: {
    before: {
      bonusCoins: 1_000,
      paidCoins: 0,
      rewardCoins: 0,
      heldCoins: 0
    },
    after: {
      bonusCoins: 800,
      paidCoins: 0,
      rewardCoins: 0,
      heldCoins: 200
    }
  },
  expiresAt: "2026-08-13T00:05:00.000Z",
  transition: {
    flowKind: "initial_activation",
    scheduledFor: "2026-08-13T00:00:00.000Z"
  }
});

const RESERVED_TRANSITION = Object.freeze({
  transitionRef: "transition_annual_premium_1",
  offer: FULL_OFFER,
  amountUnits: 200,
  flowKind: "initial_activation",
  scheduledFor: "2026-08-13T00:00:00.000Z",
  state: "reserved",
  safeCode: null,
  reservedAt: "2026-08-13T00:00:00.000Z",
  settledAt: null,
  createdAt: "2026-08-13T00:00:00.000Z",
  updatedAt: "2026-08-13T00:00:00.000Z"
});

const INITIAL_TRANSITION_CONTEXT = Object.freeze({
  flowKind: "initial_activation",
  scheduledFor: "2026-08-13T00:00:00.000Z",
  expectedEntitlementId: null,
  expectedRequestId: null,
  expectedIssuedLinkId: null,
  expectedValidUntil: null
});

function clone(value) {
  return structuredClone(value);
}

const REAL_E2E_NOW = "2030-01-01T00:00:00.000Z";
const REAL_E2E_OFFER_VERSION = "offerv_plan_365d_200gb_monthly_v1";

function realE2eReferences(prefix) {
  let count = 0;
  return (kind) => `${prefix}_${kind}_${++count}`;
}

function createRealWalletFirstCommerceDatabase() {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  database.exec(`
    create table platform_accounts (
      id text primary key,
      owner_ref text not null,
      status text not null,
      created_at text not null,
      updated_at text not null,
      metadata_json text not null default '{}'
    );
    create table platform_entitlements (
      id text primary key,
      account_id text not null references platform_accounts(id),
      status text not null,
      valid_from text not null,
      valid_until text not null
    );
    create table platform_issuance_requests (
      id text primary key,
      account_id text not null references platform_accounts(id),
      entitlement_id text not null references platform_entitlements(id),
      status text not null default 'issued'
    );
    create table platform_issued_subscription_links (
      id text primary key,
      request_id text not null references platform_issuance_requests(id),
      tenant_ref text not null default '',
      artifact_ref text not null default '',
      status text not null default 'active'
    );
    create table platform_portal_access_requests (
      id text primary key,
      portal_user_ref text not null,
      entitlement_ref text,
      status text not null,
      expires_at text,
      valid_until text,
      tenant_id text,
      artifact_id text
    );
  `);
  applyCoinWalletMigrations({
    database,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(REAL_E2E_NOW)
  });
  applyCoinCommerceMigrations({
    database,
    expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(REAL_E2E_NOW)
  });
  applyDeferredResourceTransitionMigrations({
    database,
    expectedMigrationId: REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID,
    expectedDdlChecksum: DEFERRED_RESOURCE_TRANSITION_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(REAL_E2E_NOW)
  });
  applyWalletFirstDeferredCheckoutMigrations({
    database,
    expectedMigrationId: REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID,
    expectedDdlChecksum: WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(REAL_E2E_NOW)
  });
  return database;
}

function seedRealWalletFirstCommerceAccount(database, accountId) {
  database.prepare(`
    insert into platform_accounts(id, owner_ref, status, created_at, updated_at, metadata_json)
    values (?, ?, 'active', ?, ?, ?)
  `).run(
    accountId,
    `owner_${accountId}`,
    REAL_E2E_NOW,
    REAL_E2E_NOW,
    JSON.stringify({ commercialModel: "wallet_first_unique_v1" })
  );
  database.prepare(`
    insert into platform_coin_commerce_offer_versions (
      offer_version_ref, offer_ref, version, status, category,
      title_zh, title_en, summary_zh, summary_en,
      important_notices_zh_json, important_notices_en_json,
      base_coin_units, reference_currency, reference_amount_minor,
      accepted_coin_types_json, delivery_kind, duration_days,
      monthly_traffic_gb, traffic_gb, never_expires,
      discount_basis_points, created_at, published_at, retired_at
    ) values (?, ?, ?, 'published', 'plan', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      'subscription_plan', ?, ?, null, 0, 0, ?, ?, null)
  `).run(
    REAL_E2E_OFFER_VERSION,
    FULL_OFFER.offerRef,
    FULL_OFFER.version,
    FULL_OFFER.title.zh,
    FULL_OFFER.title.en,
    FULL_OFFER.summary.zh,
    FULL_OFFER.summary.en,
    JSON.stringify(FULL_OFFER.importantNotices.zh),
    JSON.stringify(FULL_OFFER.importantNotices.en),
    FULL_OFFER.baseCoinUnits,
    FULL_OFFER.referencePrice.currency,
    FULL_OFFER.referencePrice.amountMinor,
    JSON.stringify(FULL_OFFER.acceptedCoinTypes),
    FULL_OFFER.delivery.durationDays,
    FULL_OFFER.delivery.monthlyTrafficGb,
    REAL_E2E_NOW,
    REAL_E2E_NOW
  );
  const wallet = createSqliteCoinWalletStore({
    database,
    nowFn: () => new Date(REAL_E2E_NOW),
    refFactory: realE2eReferences("wallet")
  });
  try {
    wallet.creditCoins({
      accountId,
      coinType: "paid_coins",
      amountUnits: FULL_OFFER.baseCoinUnits,
      availability: "available",
      sourceType: "wallet_first_route_e2e",
      sourceRef: "fund_wallet_first_route_e2e",
      sourceDigest: "a".repeat(64),
      policyRef: null,
      policyVersion: null,
      expiresAt: null,
      operation: {
        actorScope: `test:${accountId}`,
        idempotencyKey: "credit_wallet_first_route_e2e",
        actorType: "system",
        actorRef: "wallet_first_route_e2e"
      }
    });
  } finally {
    wallet.close();
  }
}

function realControlStore(database) {
  return {
    getAccount(accountId) {
      const row = database.prepare(`
        select id, owner_ref, status, created_at, updated_at, metadata_json
          from platform_accounts
         where id = ?
      `).get(accountId);
      if (!row) return null;
      return {
        id: row.id,
        ownerRef: row.owner_ref,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        metadata: JSON.parse(row.metadata_json)
      };
    }
  };
}

function legacyPortalQuote() {
  const quote = clone(DEFERRED_CHECKOUT);
  delete quote.transition;
  delete quote.offer.version;
  return quote;
}

function createAuth() {
  return {
    requireSession({ sessionRef }) {
      if (sessionRef === "session_alpha") {
        return { sessionRef, accountId: "acct_alpha" };
      }
      if (sessionRef === "session_beta") {
        return { sessionRef, accountId: "acct_beta" };
      }
      throw new Error("invalid session");
    }
  };
}

function createLegacyStore(calls) {
  const quote = {
    ...clone(DEFERRED_CHECKOUT),
    transition: undefined
  };
  delete quote.transition;
  const order = {
    orderRef: "order_legacy_1",
    offer: clone(FULL_OFFER),
    amountUnits: 200,
    allocation: [{ coinType: "bonus_coins", amountUnits: 200 }],
    paymentStatus: "held",
    cancelUntil: "2026-08-13T00:00:03.000Z",
    fulfillment: { status: "not_requested", safeCode: null },
    createdAt: "2026-08-13T00:00:00.000Z",
    updatedAt: "2026-08-13T00:00:00.000Z"
  };
  return {
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
      return clone(quote);
    },
    confirmOrder(input) {
      calls.push(["confirmOrder", clone(input)]);
      return clone(order);
    },
    cancelOrder(input) {
      calls.push(["cancelOrder", clone(input)]);
      return clone({ ...order, paymentStatus: "cancelled" });
    },
    getOrder(input) {
      calls.push(["getOrder", clone(input)]);
      return clone(order);
    },
    listOrders(input) {
      calls.push(["listOrders", clone(input)]);
      return { orders: [clone(order)], nextCursor: null };
    }
  };
}

function createControlStore(models = {}) {
  return {
    getAccount(accountId) {
      const commercialModel = models[accountId];
      return {
        id: accountId,
        ownerRef: accountId,
        status: "active",
        createdAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:00.000Z",
        metadata: commercialModel === undefined ? {} : { commercialModel }
      };
    }
  };
}

function createNoCurrentResourceChainResolver() {
  return {
    resolveCurrentResourceChain() {
      return { state: "none" };
    }
  };
}

function createDeferredSurface(calls, overrides = {}) {
  return {
    listOffers(input) {
      calls.push(["listOffers", clone(input)]);
      return [clone(FULL_OFFER)];
    },
    getOffer(input) {
      calls.push(["getOffer", clone(input)]);
      return clone(FULL_OFFER);
    },
    previewDeferredCheckout(input) {
      calls.push(["previewDeferredCheckout", clone(input)]);
      return clone(DEFERRED_CHECKOUT);
    },
    reserveDeferredTransition(input) {
      calls.push(["reserveDeferredTransition", clone(input)]);
      return clone(RESERVED_TRANSITION);
    },
    listDeferredTransitions(input) {
      calls.push(["listDeferredTransitions", clone(input)]);
      return [clone(RESERVED_TRANSITION)];
    },
    getDeferredTransition(input) {
      calls.push(["getDeferredTransition", clone(input)]);
      return clone(RESERVED_TRANSITION);
    },
    cancelDeferredTransition(input) {
      calls.push(["cancelDeferredTransition", clone(input)]);
      return clone({
        ...RESERVED_TRANSITION,
        state: "cancelled",
        updatedAt: "2026-08-13T00:00:01.000Z"
      });
    },
    ...overrides
  };
}

function createDeferredService(calls, {
  resourceChainResolver = createNoCurrentResourceChainResolver(),
  ...overrides
} = {}) {
  return createWalletFirstCommerceService({
    deferredSurface: createDeferredSurface(calls, overrides),
    resourceChainResolver,
    nowFn: () => new Date("2026-08-13T00:00:00.000Z")
  });
}

function createState({
  controlStore,
  deferredService,
  legacyCalls,
  walletFirstRegistrationEnabled = true
}) {
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
      coinsCommerceEnabled: true,
      userPortalRoutesEnabled: true,
      walletFirstRegistrationEnabled,
      coinCommerceStore: createLegacyStore(legacyCalls),
      coinCommerceCoordinator: { start() {}, stop() {} },
      userPortalAuth: createAuth(),
      controlStore,
      ...(deferredService ? { walletFirstCommerceService: deferredService } : {})
    },
    isPortListening: async () => false,
    runCommand: async () => ({ ok: true, stdout: "", stderr: "", code: 0, timedOut: false })
  };
}

async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function sessionHeaders(sessionRef, extra = {}) {
  return {
    "x-portal-session": sessionRef,
    ...extra
  };
}

async function responseJson(response) {
  return {
    status: response.status,
    text: await response.text()
  };
}

test("wallet-first model is server-selected while legacy Commerce calls stay byte-compatible", async (t) => {
  const legacyCalls = [];
  const deferredCalls = [];
  const state = createState({
    controlStore: createControlStore({
      acct_alpha: "wallet_first_unique_v1"
    }),
    deferredService: createDeferredService(deferredCalls),
    legacyCalls
  });
  const { server, baseUrl } = await listen(createApp(state));
  t.after(() => closeServer(server));

  const legacyPreview = await fetch(`${baseUrl}/api/portal/commerce/checkout-preview`, {
    method: "POST",
    headers: sessionHeaders("session_beta", { "content-type": "application/json" }),
    body: JSON.stringify({ offerRef: FULL_OFFER.offerRef })
  });
  const legacyBody = await responseJson(legacyPreview);
  assert.equal(legacyBody.status, 200);
  assert.deepEqual(JSON.parse(legacyBody.text), {
    quote: legacyPortalQuote()
  });
  // JSON.stringify omits the intentionally absent transition key.
  assert.deepEqual(legacyCalls, [["createCheckoutQuote", {
    accountId: "acct_beta",
    offerRef: FULL_OFFER.offerRef
  }]]);
  assert.deepEqual(deferredCalls, []);

  const mode = await fetch(`${baseUrl}/api/portal/commerce/model`, {
    headers: sessionHeaders("session_alpha")
  });
  assert.deepEqual(await mode.json(), {
    commerceModel: "wallet_first_unique_v1"
  });

  const blockedLegacyConfirm = await fetch(`${baseUrl}/api/portal/commerce/orders`, {
    method: "POST",
    headers: sessionHeaders("session_alpha", {
      "content-type": "application/json",
      "idempotency-key": "legacy_confirm_must_not_run"
    }),
    body: JSON.stringify({ quoteRef: "quote_annual_premium_1" })
  });
  assert.equal(blockedLegacyConfirm.status, 409);
  assert.deepEqual(await blockedLegacyConfirm.json(), {
    error: { code: "wallet_first_deferred_required", retryable: false }
  });
  assert.equal(legacyCalls.some(([method]) => method === "confirmOrder"), false);

  const preview = await fetch(`${baseUrl}/api/portal/commerce/deferred/checkout-preview`, {
    method: "POST",
    headers: sessionHeaders("session_alpha", { "content-type": "application/json" }),
    body: JSON.stringify({ offerRef: FULL_OFFER.offerRef })
  });
  assert.equal(preview.status, 200);
  const previewJson = await preview.json();
  assert.equal(previewJson.quote.transition.flowKind, "initial_activation");
  assert.equal(previewJson.quote.transition.scheduledFor, "2026-08-13T00:00:00.000Z");

  const reserve = await fetch(`${baseUrl}/api/portal/commerce/deferred/transitions`, {
    method: "POST",
    headers: sessionHeaders("session_alpha", {
      "content-type": "application/json",
      "idempotency-key": "reserve_annual_1"
    }),
    body: JSON.stringify({ quoteRef: "quote_annual_premium_1" })
  });
  assert.equal(reserve.status, 201);
  const reserveJson = await reserve.json();
  assert.deepEqual(Object.keys(reserveJson.transition).sort(), [
    "amountUnits",
    "createdAt",
    "flowKind",
    "offer",
    "reservedAt",
    "safeCode",
    "scheduledFor",
    "settledAt",
    "state",
    "transitionRef",
    "updatedAt"
  ]);
  assert.equal(Object.hasOwn(reserveJson.transition, "reservationRef"), false);
  assert.equal(Object.hasOwn(reserveJson.transition, "orderRef"), false);

  const listed = await fetch(`${baseUrl}/api/portal/commerce/deferred/transitions`, {
    headers: sessionHeaders("session_alpha")
  });
  assert.equal(listed.status, 200);
  assert.equal((await listed.json()).transitions.length, 1);

  const cancelled = await fetch(
    `${baseUrl}/api/portal/commerce/deferred/transitions/transition_annual_premium_1/cancel`,
    {
      method: "POST",
      headers: sessionHeaders("session_alpha", {
        "content-type": "application/json",
        "idempotency-key": "cancel_transition_1"
      }),
      body: "{}"
    }
  );
  assert.equal(cancelled.status, 200);
  assert.equal((await cancelled.json()).transition.state, "cancelled");

  assert.deepEqual(deferredCalls, [
    ["listDeferredTransitions", { accountId: "acct_alpha" }],
    ["previewDeferredCheckout", {
      accountId: "acct_alpha",
      offerRef: FULL_OFFER.offerRef,
      transitionContext: INITIAL_TRANSITION_CONTEXT
    }],
    ["listDeferredTransitions", { accountId: "acct_alpha" }],
    ["reserveDeferredTransition", {
      accountId: "acct_alpha",
      quoteRef: "quote_annual_premium_1",
      operation: {
        actorScope: "portal:acct_alpha",
        idempotencyKey: "reserve_annual_1",
        actorType: "portal_user",
        actorRef: "acct_alpha"
      }
    }],
    ["listDeferredTransitions", { accountId: "acct_alpha" }],
    ["cancelDeferredTransition", {
      accountId: "acct_alpha",
      transitionRef: "transition_annual_premium_1",
      operation: {
        actorScope: "portal:acct_alpha",
        idempotencyKey: "cancel_transition_1",
        actorType: "portal_user",
        actorRef: "acct_alpha"
      }
    }]
  ]);
});

test("wallet-first HTTP reserve atomically holds Coins across a later tick and replays one safe transition", async () => {
  const database = createRealWalletFirstCommerceDatabase();
  const accountId = "acct_alpha";
  seedRealWalletFirstCommerceAccount(database, accountId);
  const clock = { value: REAL_E2E_NOW };
  const deferredTransitionStore = createSqliteDeferredResourceTransitionStore({
    database,
    nowFn: () => new Date(clock.value),
    refFactory: realE2eReferences("transition"),
    leaseTokenFactory: () => "b".repeat(64)
  });
  const checkoutAdapter = createWalletFirstDeferredCheckoutAdapter({
    database,
    deferredTransitionStore,
    nowFn: () => new Date(clock.value),
    refFactory: realE2eReferences("quote"),
    quoteTtlMs: 60_000
  });
  const deferredService = createWalletFirstCommerceService({
    deferredSurface: snapshotWalletFirstDeferredCheckoutAdapter(checkoutAdapter),
    resourceChainResolver: {
      resolveCurrentResourceChain() {
        return { state: "none" };
      }
    },
    nowFn: () => new Date(clock.value)
  });
  let server;
  try {
    const state = createState({
      controlStore: realControlStore(database),
      deferredService,
      legacyCalls: []
    });
    const listening = await listen(createApp(state));
    server = listening.server;
    const preview = await fetch(
      `${listening.baseUrl}/api/portal/commerce/deferred/checkout-preview`,
      {
        method: "POST",
        headers: sessionHeaders("session_alpha", { "content-type": "application/json" }),
        body: JSON.stringify({ offerRef: FULL_OFFER.offerRef })
      }
    );
    assert.equal(preview.status, 200, await preview.clone().text());
    const quote = (await preview.json()).quote;
    assert.equal(quote.transition.scheduledFor, REAL_E2E_NOW);

    clock.value = "2030-01-01T00:00:01.000Z";
    const request = {
      method: "POST",
      headers: sessionHeaders("session_alpha", {
        "content-type": "application/json",
        "idempotency-key": "reserve_wallet_first_route_e2e"
      }),
      body: JSON.stringify({ quoteRef: quote.quoteRef })
    };
    const first = await fetch(
      `${listening.baseUrl}/api/portal/commerce/deferred/transitions`,
      request
    );
    assert.equal(first.status, 201);
    const firstTransition = (await first.json()).transition;
    assert.equal(firstTransition.state, "reserved");
    assert.equal(firstTransition.scheduledFor, REAL_E2E_NOW);
    assert.deepEqual(Object.keys(firstTransition).sort(), [
      "amountUnits",
      "createdAt",
      "flowKind",
      "offer",
      "reservedAt",
      "safeCode",
      "scheduledFor",
      "settledAt",
      "state",
      "transitionRef",
      "updatedAt"
    ]);
    for (const forbidden of [
      "orderRef", "reservationRef", "planRank", "expectedValidUntil",
      "rebaseGeneration", "effectRef"
    ]) {
      assert.equal(Object.hasOwn(firstTransition, forbidden), false, forbidden);
    }

    const replay = await fetch(
      `${listening.baseUrl}/api/portal/commerce/deferred/transitions`,
      request
    );
    assert.equal(replay.status, 201);
    assert.deepEqual((await replay.json()).transition, firstTransition);
    assert.equal(
      database.prepare(`
        select coalesce(sum(held_units), 0)
          from platform_coin_lots
      `).pluck().get(),
      FULL_OFFER.baseCoinUnits
    );
    assert.equal(
      database.prepare("select count(*) from platform_deferred_resource_transitions").pluck().get(),
      1
    );
    assert.equal(
      database.prepare("select count(*) from platform_coin_commerce_orders").pluck().get(),
      0
    );
    assert.equal(
      database.prepare("select count(*) from platform_coin_holds").pluck().get(),
      0
    );
  } finally {
    if (server) await closeServer(server);
    checkoutAdapter.close();
    deferredTransitionStore.close();
    database.close();
  }
});

test("wallet-first HTTP requires a new Quote after expiry or wallet-version drift", async () => {
  const database = createRealWalletFirstCommerceDatabase();
  // The portal test session resolves server-side to this account; each test
  // owns its own in-memory database so it remains isolated.
  const accountId = "acct_alpha";
  seedRealWalletFirstCommerceAccount(database, accountId);
  const clock = { value: REAL_E2E_NOW };
  const deferredTransitionStore = createSqliteDeferredResourceTransitionStore({
    database,
    nowFn: () => new Date(clock.value),
    refFactory: realE2eReferences("transition_requote"),
    leaseTokenFactory: () => "c".repeat(64)
  });
  const checkoutAdapter = createWalletFirstDeferredCheckoutAdapter({
    database,
    deferredTransitionStore,
    nowFn: () => new Date(clock.value),
    refFactory: realE2eReferences("quote_requote"),
    quoteTtlMs: 60_000
  });
  const deferredService = createWalletFirstCommerceService({
    deferredSurface: snapshotWalletFirstDeferredCheckoutAdapter(checkoutAdapter),
    resourceChainResolver: {
      resolveCurrentResourceChain() {
        return { state: "none" };
      }
    },
    nowFn: () => new Date(clock.value)
  });
  let server;
  try {
    const state = createState({
      controlStore: realControlStore(database),
      deferredService,
      legacyCalls: []
    });
    const listening = await listen(createApp(state));
    server = listening.server;
    const preview = () => fetch(
      `${listening.baseUrl}/api/portal/commerce/deferred/checkout-preview`,
      {
        method: "POST",
        headers: sessionHeaders("session_alpha", { "content-type": "application/json" }),
        body: JSON.stringify({ offerRef: FULL_OFFER.offerRef })
      }
    );
    const reserve = (quoteRef, idempotencyKey) => fetch(
      `${listening.baseUrl}/api/portal/commerce/deferred/transitions`,
      {
        method: "POST",
        headers: sessionHeaders("session_alpha", {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey
        }),
        body: JSON.stringify({ quoteRef })
      }
    );

    const expiredPreview = await preview();
    assert.equal(expiredPreview.status, 200);
    const expiredQuote = (await expiredPreview.json()).quote;
    clock.value = "2030-01-01T00:01:01.000Z";
    const expired = await reserve(expiredQuote.quoteRef, "reserve_expired_quote");
    assert.equal(expired.status, 409);
    assert.deepEqual(await expired.json(), {
      error: { code: "quote_expired", retryable: false }
    });

    const stalePreview = await preview();
    assert.equal(stalePreview.status, 200);
    const staleQuote = (await stalePreview.json()).quote;
    const wallet = createSqliteCoinWalletStore({
      database,
      nowFn: () => new Date(clock.value),
      refFactory: realE2eReferences("wallet_drift")
    });
    try {
      wallet.creditCoins({
        accountId,
        coinType: "paid_coins",
        amountUnits: 1,
        availability: "available",
        sourceType: "wallet_first_route_drift",
        sourceRef: "fund_wallet_first_route_drift",
        sourceDigest: "b".repeat(64),
        policyRef: null,
        policyVersion: null,
        expiresAt: null,
        operation: {
          actorScope: `test:${accountId}`,
          idempotencyKey: "credit_wallet_first_route_drift",
          actorType: "system",
          actorRef: "wallet_first_route_drift"
        }
      });
    } finally {
      wallet.close();
    }
    const stale = await reserve(staleQuote.quoteRef, "reserve_stale_quote");
    assert.equal(stale.status, 409);
    assert.deepEqual(await stale.json(), {
      error: { code: "quote_stale", retryable: false }
    });
    assert.equal(
      database.prepare("select count(*) from platform_deferred_resource_transitions").pluck().get(),
      0
    );
    assert.equal(
      database.prepare(`
        select coalesce(sum(held_units), 0) from platform_coin_lots
      `).pluck().get(),
      0
    );
  } finally {
    if (server) await closeServer(server);
    checkoutAdapter.close();
    deferredTransitionStore.close();
    database.close();
  }
});

test("wallet-first HTTP exposes a full deferred queue as a non-retryable conflict", async (t) => {
  const calls = [];
  const state = createState({
    controlStore: createControlStore({ acct_alpha: "wallet_first_unique_v1" }),
    deferredService: createDeferredService(calls, {
      reserveDeferredTransition(input) {
        calls.push(["reserveDeferredTransition", clone(input)]);
        const error = new Error("synthetic deferred queue cap");
        error.code = "deferred_transition_queue_full";
        throw error;
      }
    }),
    legacyCalls: []
  });
  const { server, baseUrl } = await listen(createApp(state));
  t.after(() => closeServer(server));

  const response = await fetch(
    `${baseUrl}/api/portal/commerce/deferred/transitions`,
    {
      method: "POST",
      headers: sessionHeaders("session_alpha", {
        "content-type": "application/json",
        "idempotency-key": "reserve_queue_full"
      }),
      body: JSON.stringify({ quoteRef: "quote_annual_premium_1" })
    }
  );
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: { code: "deferred_transition_conflict", retryable: false }
  });
  assert.equal(calls.some(([method]) => method === "reserveDeferredTransition"), true);
});

test("wallet-first preview and reserve preserve the reconciliation-required safety gate", async (t) => {
  const legacyCalls = [];
  const deferredCalls = [];
  const state = createState({
    controlStore: createControlStore({
      acct_alpha: "wallet_first_unique_v1"
    }),
    deferredService: createDeferredService(deferredCalls, {
      resourceChainResolver: {
        resolveCurrentResourceChain() {
          throw new Error("must not derive a new transition after reconciliation");
        }
      },
      listDeferredTransitions(input) {
        deferredCalls.push(["listDeferredTransitions", clone(input)]);
        return [{ state: "reconciliation_required" }];
      }
    }),
    legacyCalls
  });
  const { server, baseUrl } = await listen(createApp(state));
  t.after(() => closeServer(server));

  const preview = await fetch(`${baseUrl}/api/portal/commerce/deferred/checkout-preview`, {
    method: "POST",
    headers: sessionHeaders("session_alpha", { "content-type": "application/json" }),
    body: JSON.stringify({ offerRef: FULL_OFFER.offerRef })
  });
  assert.equal(preview.status, 423);
  assert.deepEqual(await preview.json(), {
    error: { code: "reconciliation_required", retryable: false }
  });

  const reserve = await fetch(`${baseUrl}/api/portal/commerce/deferred/transitions`, {
    method: "POST",
    headers: sessionHeaders("session_alpha", {
      "content-type": "application/json",
      "idempotency-key": "reserve_reconciliation_1"
    }),
    body: JSON.stringify({ quoteRef: DEFERRED_CHECKOUT.quoteRef })
  });
  assert.equal(reserve.status, 423);
  assert.deepEqual(await reserve.json(), {
    error: { code: "reconciliation_required", retryable: false }
  });
  assert.deepEqual(legacyCalls, []);
  assert.deepEqual(deferredCalls, [
    ["listDeferredTransitions", { accountId: "acct_alpha" }],
    ["listDeferredTransitions", { accountId: "acct_alpha" }]
  ]);
});

test("wallet-first routing ignores client model hints and fails closed without a dedicated runtime", async (t) => {
  const legacyCalls = [];
  const deferredCalls = [];
  const state = createState({
    controlStore: createControlStore({
      acct_alpha: "wallet_first_unique_v1"
    }),
    deferredService: createDeferredService(deferredCalls),
    legacyCalls
  });
  const { server, baseUrl } = await listen(createApp(state));
  t.after(() => closeServer(server));

  const clientSpoof = await fetch(`${baseUrl}/api/portal/commerce/deferred/checkout-preview`, {
    method: "POST",
    headers: sessionHeaders("session_alpha", { "content-type": "application/json" }),
    body: JSON.stringify({
      offerRef: FULL_OFFER.offerRef,
      commercialModel: "legacy"
    })
  });
  assert.equal(clientSpoof.status, 400);
  assert.deepEqual(await clientSpoof.json(), {
    error: { code: "commerce_request_invalid", retryable: false }
  });
  assert.deepEqual(deferredCalls, []);

  const reserveSpoof = await fetch(`${baseUrl}/api/portal/commerce/deferred/transitions`, {
    method: "POST",
    headers: sessionHeaders("session_alpha", {
      "content-type": "application/json",
      "idempotency-key": "reserve_spoof_1"
    }),
    body: JSON.stringify({
      quoteRef: "quote_annual_premium_1",
      flowKind: "initial_activation",
      scheduledFor: "2026-08-13T00:00:00.000Z",
      reservationSnapshot: [{ coinType: "bonus_coins", amountUnits: 200 }],
      planRank: 3,
      priority: 3
    })
  });
  assert.equal(reserveSpoof.status, 400);
  assert.deepEqual(await reserveSpoof.json(), {
    error: { code: "commerce_request_invalid", retryable: false }
  });
  assert.deepEqual(deferredCalls, []);

  const legacyAccountDeferred = await fetch(
    `${baseUrl}/api/portal/commerce/deferred/checkout-preview`,
    {
      method: "POST",
      headers: sessionHeaders("session_beta", { "content-type": "application/json" }),
      body: JSON.stringify({ offerRef: FULL_OFFER.offerRef })
    }
  );
  assert.equal(legacyAccountDeferred.status, 404);
  assert.deepEqual(deferredCalls, []);

  const unavailableState = createState({
    controlStore: createControlStore({
      acct_alpha: "wallet_first_unique_v1"
    }),
    deferredService: null,
    legacyCalls: []
  });
  const unavailable = await listen(createApp(unavailableState));
  t.after(() => closeServer(unavailable.server));
  const unavailablePreview = await fetch(
    `${unavailable.baseUrl}/api/portal/commerce/deferred/checkout-preview`,
    {
      method: "POST",
      headers: sessionHeaders("session_alpha", { "content-type": "application/json" }),
      body: JSON.stringify({ offerRef: FULL_OFFER.offerRef })
    }
  );
  assert.equal(unavailablePreview.status, 503);
  assert.deepEqual(await unavailablePreview.json(), {
    error: { code: "commerce_unavailable", retryable: true }
  });
  const unavailableLegacy = await fetch(
    `${unavailable.baseUrl}/api/portal/commerce/checkout-preview`,
    {
      method: "POST",
      headers: sessionHeaders("session_alpha", { "content-type": "application/json" }),
      body: JSON.stringify({ offerRef: FULL_OFFER.offerRef })
    }
  );
  assert.equal(unavailableLegacy.status, 409);
});

test("unknown server-side commercial models fail closed without calling either Commerce path", async (t) => {
  const legacyCalls = [];
  const deferredCalls = [];
  const state = createState({
    controlStore: createControlStore({ acct_alpha: "unrecognized_future_model" }),
    deferredService: createDeferredService(deferredCalls),
    legacyCalls
  });
  const { server, baseUrl } = await listen(createApp(state));
  t.after(() => closeServer(server));

  const response = await fetch(`${baseUrl}/api/portal/commerce/checkout-preview`, {
    method: "POST",
    headers: sessionHeaders("session_alpha", { "content-type": "application/json" }),
    body: JSON.stringify({ offerRef: FULL_OFFER.offerRef })
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: { code: "commerce_unavailable", retryable: true }
  });
  assert.deepEqual(legacyCalls, []);
  assert.deepEqual(deferredCalls, []);
});

test("an existing wallet-first marker never falls back when new registration is disabled", async (t) => {
  const legacyCalls = [];
  const state = createState({
    controlStore: createControlStore({ acct_alpha: "wallet_first_unique_v1" }),
    deferredService: null,
    legacyCalls,
    walletFirstRegistrationEnabled: false
  });
  const { server, baseUrl } = await listen(createApp(state));
  t.after(() => closeServer(server));

  const response = await fetch(`${baseUrl}/api/portal/commerce/checkout-preview`, {
    method: "POST",
    headers: sessionHeaders("session_alpha", { "content-type": "application/json" }),
    body: JSON.stringify({ offerRef: FULL_OFFER.offerRef })
  });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: { code: "wallet_first_deferred_required", retryable: false }
  });
  assert.deepEqual(legacyCalls, []);
});
