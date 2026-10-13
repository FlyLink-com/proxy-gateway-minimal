import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import test from "node:test";
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
const PUBLIC_PATH = "/api/portal/public/catalog";
const SCHEMA_VERSION = "portal-public-catalog/v1";
const RATE_LIMIT_MAX = 10;
const CACHE_TTL_MS = 60_000;
const BROWSER_CREDENTIAL = Buffer.from("a".repeat(32)).toString("base64url");
const SECRET_VERSION = "offerv_secret_internal_v1";
const SECRET_ACCOUNT = "acct_secret";
const SECRET_COMMAND = "command_secret";

const PLAN_OFFER = {
  offerRef: "offer_monthly_basic",
  offerVersionRef: SECRET_VERSION,
  version: 1,
  category: "plan",
  title: {
    zh: "基础月付",
    en: "Basic monthly",
    internal: "welcome-coins-hidden"
  },
  summary: { zh: "适合日常使用", en: "For everyday use" },
  importantNotices: {
    zh: ["购买后自动交付"],
    en: ["Delivered automatically after purchase"]
  },
  baseCoinUnits: 100,
  referencePrice: { currency: "CNY", amountMinor: 1_000 },
  acceptedCoinTypes: ["bonus_coins", "paid_coins", "reward_coins"],
  delivery: {
    kind: "subscription_plan",
    durationDays: 30,
    monthlyTrafficGb: 100,
    trafficGb: null,
    neverExpires: false,
    discountBasisPoints: 2_000
  },
  accountId: SECRET_ACCOUNT,
  balances: {
    bonusCoins: 40,
    paidCoins: 80,
    rewardCoins: 5,
    heldCoins: 9
  },
  eligibility: "eligible",
  welcomeCoins: 88,
  recommendation: "buy_now",
  fulfillment: { commandRef: SECRET_COMMAND },
  accountPrice: { coinUnits: 1, currency: "CNY", amountMinor: 1 }
};

const CLEAN_OFFER = {
  offerRef: "offer_monthly_basic",
  offerVersionRef: "offerversion_monthly_basic_1",
  version: 1,
  category: "plan",
  title: { zh: "基础月付", en: "Basic monthly" },
  summary: { zh: "适合日常使用", en: "For everyday use" },
  importantNotices: {
    zh: ["购买后自动交付"],
    en: ["Delivered automatically after purchase"]
  },
  baseCoinUnits: 100,
  referencePrice: { currency: "CNY", amountMinor: 1_000 },
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

const PACK_OFFER = {
  offerRef: "offer_data_100gb",
  offerVersionRef: "offerv_secret_pack_v1",
  version: 1,
  category: "data_pack",
  title: { zh: "100 GB 流量包", en: "100 GB data pack" },
  summary: { zh: "一次性流量", en: "One-time traffic" },
  importantNotices: {
    zh: ["流量包没有到期日"],
    en: ["The data pack has no expiry date"]
  },
  baseCoinUnits: 30,
  referencePrice: { currency: "CNY", amountMinor: 3_000 },
  acceptedCoinTypes: ["bonus_coins", "paid_coins", "reward_coins"],
  delivery: {
    kind: "data_pack",
    durationDays: null,
    monthlyTrafficGb: null,
    trafficGb: 100,
    neverExpires: true,
    discountBasisPoints: null
  },
  accountId: SECRET_ACCOUNT,
  welcomeCoins: 88
};

const PUBLIC_CATALOG = {
  schemaVersion: SCHEMA_VERSION,
  tiers: [
    {
      tierRef: "offer_monthly_basic",
      displayName: { zh: "基础月付", en: "Basic monthly" },
      traffic: { gigabytes: 100, period: "month" },
      validity: { durationDays: 30, neverExpires: false },
      listPrice: { coinUnits: 100, currency: "CNY", amountMinor: 1_000 }
    },
    {
      tierRef: "offer_data_100gb",
      displayName: { zh: "100 GB 流量包", en: "100 GB data pack" },
      traffic: { gigabytes: 100, period: "pack" },
      validity: { durationDays: null, neverExpires: true },
      listPrice: { coinUnits: 30, currency: "CNY", amountMinor: 3_000 }
    }
  ]
};

const ALLOWED_KEYS = new Set([
  "schemaVersion",
  "tiers",
  "tierRef",
  "displayName",
  "zh",
  "en",
  "traffic",
  "gigabytes",
  "period",
  "validity",
  "durationDays",
  "neverExpires",
  "listPrice",
  "coinUnits",
  "currency",
  "amountMinor"
]);

function clone(value) {
  return structuredClone(value);
}

function assertWhitelist(value) {
  if (Array.isArray(value)) {
    for (const item of value) assertWhitelist(item);
    return;
  }
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) {
      assert.equal(ALLOWED_KEYS.has(key), true, key);
      assertWhitelist(value[key]);
    }
  }
}

function createCatalogStore(offers = [PLAN_OFFER, PACK_OFFER]) {
  const calls = [];
  const store = {
    listPublishedCatalogOffers() {
      calls.push(["listPublishedCatalogOffers", arguments.length]);
      return clone(offers);
    },
    listPublishedOffers(input) {
      calls.push(["listPublishedOffers", clone(input)]);
      return [clone(CLEAN_OFFER)];
    },
    getPublishedOffer() {
      throw new Error("public catalog must not read an account offer");
    },
    createCheckoutQuote() {
      throw new Error("public catalog must not quote");
    },
    confirmOrder() {
      throw new Error("unused");
    },
    cancelOrder() {
      throw new Error("unused");
    },
    getOrder() {
      throw new Error("unused");
    },
    listOrders() {
      throw new Error("unused");
    }
  };
  return { store, calls };
}

function createState(store, {
  enabled = true,
  requireBrowserSession = () => {
    throw new Error("public catalog must not open a browser session");
  }
} = {}) {
  return {
    rootDir: ROOT_DIR,
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
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
      coinsCommerceEnabled: enabled,
      userPortalRoutesEnabled: true,
      portalBrowserOrigin: "https://portal.test",
      coinCommerceStore: store,
      userPortalAuth: {
        requireSession({ sessionRef }) {
          if (sessionRef !== "session_alpha") {
            const error = new Error("unknown session");
            error.code = "invalid_session";
            throw error;
          }
          return { sessionRef, accountId: "acct_alpha" };
        },
        requireBrowserSession
      },
      coinCommerceCoordinator: {
        start() {},
        stop() {}
      }
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

async function readResponse(response) {
  const text = await response.text();
  let json = null;
  if (text.length > 0) json = JSON.parse(text);
  return { status: response.status, headers: response.headers, text, json };
}

function rawRequest(baseUrl, { method = "GET", path, headers = {} } = {}) {
  const target = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      hostname: target.hostname,
      port: target.port,
      method,
      path,
      headers,
      agent: false
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        const headerMap = new Map();
        for (let index = 0; index < response.rawHeaders.length; index += 2) {
          headerMap.set(
            response.rawHeaders[index].toLowerCase(),
            response.rawHeaders[index + 1]
          );
        }
        resolve({
          status: response.statusCode,
          headers: {
            get(name) {
              return headerMap.get(name.toLowerCase()) ?? null;
            }
          },
          text,
          json: text.length > 0 ? JSON.parse(text) : null
        });
      });
    });
    request.on("error", reject);
    request.end();
  });
}

test("anonymous GET returns only the public list-price catalog", async () => {
  const { store, calls } = createCatalogStore();
  const { server, baseUrl } = await listen(createApp(createState(store)));
  try {
    const response = await readResponse(await fetch(`${baseUrl}${PUBLIC_PATH}`));
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("cache-control"),
      "public, max-age=60"
    );
    assert.match(response.headers.get("etag") ?? "", /^"[0-9a-f]{64}"$/);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.deepEqual(response.json, PUBLIC_CATALOG);
    assertWhitelist(response.json);
    assert.equal(response.text.includes(SECRET_VERSION), false);
    assert.equal(response.text.includes(SECRET_ACCOUNT), false);
    assert.equal(response.text.includes(SECRET_COMMAND), false);
    assert.equal(response.text.includes("welcomeCoins"), false);
    assert.equal(response.text.includes("buy_now"), false);
    assert.equal(response.text.includes("offerVersionRef"), false);
    assert.equal(response.text.includes("accountPrice"), false);
    assert.equal(response.text.includes("discountBasisPoints"), false);
    assert.deepEqual(calls, [["listPublishedCatalogOffers", 0]]);
  } finally {
    await closeServer(server);
  }
});

test("a browser cookie does not create a session or change the public catalog", async () => {
  let browserSessionReads = 0;
  const { store } = createCatalogStore();
  const { server, baseUrl } = await listen(createApp(createState(store, {
    requireBrowserSession() {
      browserSessionReads += 1;
      return { sessionRef: "portalbrowser_secret", accountId: "acct_alpha" };
    }
  }), {
    portalBrowserOrigin: "https://portal.test"
  }));
  try {
    const response = await rawRequest(baseUrl, {
      path: PUBLIC_PATH,
      headers: {
        host: "portal.test",
        origin: "https://portal.test",
        "sec-fetch-site": "same-origin",
        "x-portal-request": "browser-v1",
        cookie: `__Host-PortalSession=${BROWSER_CREDENTIAL}`
      }
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "public, max-age=60");
    assert.deepEqual(response.json, PUBLIC_CATALOG);
    assert.equal(browserSessionReads, 0);
    assert.equal(response.headers.get("set-cookie"), null);
  } finally {
    await closeServer(server);
  }
});

test("non-GET methods are rejected without a session", async () => {
  const { store, calls } = createCatalogStore();
  const { server, baseUrl } = await listen(createApp(createState(store)));
  try {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD"]) {
      const response = await readResponse(await fetch(`${baseUrl}${PUBLIC_PATH}`, {
        method,
        headers: {
          "content-type": "application/json",
          "x-portal-session": "session_alpha"
        },
        body: method === "HEAD" ? undefined : "{}"
      }));
      assert.equal(response.status, 405, method);
      assert.equal(response.headers.get("allow"), "GET");
      assert.equal(response.headers.get("cache-control"), "no-store");
      if (method !== "HEAD") {
        assert.deepEqual(response.json, {
          error: { code: "public_catalog_method_not_allowed", retryable: false }
        });
      }
    }
    const queried = await readResponse(await fetch(
      `${baseUrl}${PUBLIC_PATH}?accountId=${SECRET_ACCOUNT}`
    ));
    assert.equal(queried.status, 400);
    assert.deepEqual(queried.json, {
      error: { code: "public_catalog_request_invalid", retryable: false }
    });
    assert.equal(queried.text.includes(SECRET_ACCOUNT), false);
    assert.deepEqual(calls, []);
  } finally {
    await closeServer(server);
  }
});

test("public catalog rate limit is per resolved client IP", async () => {
  let now = 1_700_000_000_000;
  const { store } = createCatalogStore();
  const { server, baseUrl } = await listen(createApp(createState(store), {
    rateLimitNowFn: () => now,
    clientIpResolver(req) {
      return req.headers["x-test-client-ip"] || "203.0.113.10";
    }
  }));
  try {
    for (let count = 1; count <= RATE_LIMIT_MAX; count += 1) {
      const response = await fetch(`${baseUrl}${PUBLIC_PATH}`, {
        headers: { "x-test-client-ip": "203.0.113.10" }
      });
      assert.equal(response.status, 200, String(count));
      await response.arrayBuffer();
    }
    const blocked = await readResponse(await fetch(`${baseUrl}${PUBLIC_PATH}`, {
      headers: {
        "x-test-client-ip": "203.0.113.10",
        "x-forwarded-for": "198.51.100.20"
      }
    }));
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get("cache-control"), "no-store");
    assert.match(blocked.headers.get("retry-after") ?? "", /^[1-9][0-9]*$/);
    assert.deepEqual(blocked.json, {
      error: { code: "public_catalog_rate_limited", retryable: true }
    });
    const otherAddress = await fetch(`${baseUrl}${PUBLIC_PATH}`, {
      headers: { "x-test-client-ip": "203.0.113.11" }
    });
    assert.equal(otherAddress.status, 200);
    await otherAddress.arrayBuffer();
    now += 60_000;
    const afterWindow = await fetch(`${baseUrl}${PUBLIC_PATH}`, {
      headers: { "x-test-client-ip": "203.0.113.10" }
    });
    assert.equal(afterWindow.status, 200);
    await afterWindow.arrayBuffer();
  } finally {
    await closeServer(server);
  }
});

test("ETag revalidates with If-None-Match and the memory cache expires", async () => {
  let now = 1_700_000_000_000;
  const offers = [clone(PLAN_OFFER), clone(PACK_OFFER)];
  const { store, calls } = createCatalogStore(offers);
  const { server, baseUrl } = await listen(createApp(createState(store), {
    rateLimitNowFn: () => now
  }));
  try {
    const first = await readResponse(await fetch(`${baseUrl}${PUBLIC_PATH}`));
    assert.equal(first.status, 200);
    const etag = first.headers.get("etag");
    offers[0].title.zh = "已改名套餐";
    const cached = await readResponse(await fetch(`${baseUrl}${PUBLIC_PATH}`, {
      headers: { "if-none-match": etag }
    }));
    assert.equal(cached.status, 304);
    assert.equal(cached.text, "");
    assert.equal(cached.headers.get("etag"), etag);
    assert.equal(cached.headers.get("cache-control"), "public, max-age=60");
    const weak = await readResponse(await fetch(`${baseUrl}${PUBLIC_PATH}`, {
      headers: { "if-none-match": `W/${etag}, "other"` }
    }));
    assert.equal(weak.status, 304);
    assert.equal(weak.text, "");
    const staleValidator = await readResponse(await fetch(`${baseUrl}${PUBLIC_PATH}`, {
      headers: { "if-none-match": `"${"0".repeat(64)}"` }
    }));
    assert.equal(staleValidator.status, 200);
    assert.equal(staleValidator.json.tiers[0].displayName.zh, "基础月付");
    assert.equal(calls.length, 1);
    now += CACHE_TTL_MS - 1;
    const stillCached = await readResponse(await fetch(`${baseUrl}${PUBLIC_PATH}`));
    assert.equal(stillCached.json.tiers[0].displayName.zh, "基础月付");
    assert.equal(calls.length, 1);
    now += 1;
    const refreshed = await readResponse(await fetch(`${baseUrl}${PUBLIC_PATH}`));
    assert.equal(refreshed.status, 200);
    assert.equal(refreshed.json.tiers[0].displayName.zh, "已改名套餐");
    assert.notEqual(refreshed.headers.get("etag"), etag);
    assert.equal(calls.length, 2);
  } finally {
    await closeServer(server);
  }
});

test("catalog read failures stay private and are not cached", async () => {
  let fail = true;
  const { store } = createCatalogStore();
  store.listPublishedCatalogOffers = () => {
    if (fail) throw new Error(`secret store detail ${SECRET_ACCOUNT}`);
    return [clone(PLAN_OFFER)];
  };
  const { server, baseUrl } = await listen(createApp(createState(store)));
  try {
    const failed = await readResponse(await fetch(`${baseUrl}${PUBLIC_PATH}`));
    assert.equal(failed.status, 503);
    assert.equal(failed.headers.get("cache-control"), "no-store");
    assert.equal(failed.headers.get("etag"), null);
    assert.deepEqual(failed.json, {
      error: { code: "public_catalog_unavailable", retryable: true }
    });
    assert.equal(failed.text.includes(SECRET_ACCOUNT), false);
    assert.equal(failed.text.includes("secret store detail"), false);
    fail = false;
    const recovered = await readResponse(await fetch(`${baseUrl}${PUBLIC_PATH}`));
    assert.equal(recovered.status, 200);
    assert.equal(recovered.json.tiers.length, 1);
  } finally {
    await closeServer(server);
  }
});

test("existing commerce catalog and model routes still require a session", async () => {
  const { store, calls } = createCatalogStore();
  const { server, baseUrl } = await listen(createApp(createState(store)));
  try {
    for (const path of [
      "/api/portal/catalog/offers",
      "/api/portal/commerce/model"
    ]) {
      const anonymous = await readResponse(await fetch(`${baseUrl}${path}`));
      assert.equal(anonymous.status, 401, path);
      assert.deepEqual(anonymous.json, {
        error: { code: "commerce_session_invalid", retryable: false }
      });
      const authed = await readResponse(await fetch(`${baseUrl}${path}`, {
        headers: { "x-portal-session": "session_alpha" }
      }));
      assert.equal(authed.status, 200, path);
    }
    const offers = calls.filter(([name]) => name === "listPublishedOffers");
    assert.deepEqual(offers, [[
      "listPublishedOffers",
      { accountId: "acct_alpha" }
    ]]);
    assert.equal(
      calls.some(([name]) => name === "listPublishedCatalogOffers"),
      false
    );
  } finally {
    await closeServer(server);
  }
});

test("published catalog ignores account eligibility and account discounts", async () => {
  const database = new Database(":memory:");
  const eligibilityReads = [];
  const discountReads = [];
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
    nowFn: () => new Date("2026-07-27T00:00:00.000Z")
  });
  applyCoinCommerceMigrations({
    database,
    expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date("2026-07-27T00:00:00.000Z")
  });
  database.prepare(`
    insert into platform_accounts
      (id, owner_ref, status, created_at, updated_at)
    values ('acct_alpha', 'owner_synthetic', 'active', ?, ?)
  `).run("2026-07-27T00:00:00.000Z", "2026-07-27T00:00:00.000Z");
  const plan = clone(PLAN_OFFER);
  delete plan.accountId;
  delete plan.balances;
  delete plan.eligibility;
  delete plan.welcomeCoins;
  delete plan.recommendation;
  delete plan.fulfillment;
  delete plan.accountPrice;
  delete plan.title.internal;
  const pack = clone(PACK_OFFER);
  delete pack.accountId;
  delete pack.welcomeCoins;
  const store = createSqliteCoinCommerceStore({
    database,
    storefrontEligibilityReader(input) {
      eligibilityReads.push(input);
      return false;
    },
    discountReader(input) {
      discountReads.push(input.accountId);
      return 5_000;
    }
  });
  store.publishOfferVersion(plan);
  store.publishOfferVersion(pack);
  const { server, baseUrl } = await listen(createApp(createState(store)));
  try {
    const response = await readResponse(await fetch(`${baseUrl}${PUBLIC_PATH}`));
    assert.equal(response.status, 200);
    assert.deepEqual(
      response.json.tiers.map((tier) => [tier.tierRef, tier.listPrice.coinUnits]),
      [
        ["offer_data_100gb", 30],
        ["offer_monthly_basic", 100]
      ]
    );
    assert.equal(response.text.includes(SECRET_VERSION), false);
    assert.deepEqual(eligibilityReads, []);
    assert.deepEqual(discountReads, []);
    assert.throws(
      () => store.listPublishedOffers({ accountId: "acct_alpha" }),
      (error) => error?.code === "offer_unavailable"
    );
    assert.equal(eligibilityReads.length, 2);
  } finally {
    await closeServer(server);
    store.close();
    database.close();
  }
});
