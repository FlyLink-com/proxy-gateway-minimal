import assert from "node:assert/strict";
import { request } from "node:http";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { createApp } from "../app.mjs";
import { portalPublicCatalogRoutes } from "../routes/portal-public-catalog.mjs";
import { createSqliteCoinCommerceStore } from "../services/platform/coin-commerce-store.mjs";
import {
  applyCoinWalletMigrations, COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID
} from "../services/platform/coin-wallet-migrations.mjs";
import {
  applyCoinCommerceMigrations, COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID
} from "../services/platform/coin-commerce-migrations.mjs";
import { listen } from "./helpers/listen.mjs";

const PATH = "/api/portal/public/catalog";
const WINDOW_START = 1_800_000_000_000;
const COOKIE = Buffer.from("c".repeat(32)).toString("base64url");
const OFFER = {
  offerRef: "offer_public_test", offerVersionRef: "offerversion_public_test_1",
  version: 1, category: "plan", title: { zh: "测试", en: "Test" },
  summary: { zh: "测试", en: "Test" }, importantNotices: { zh: ["测试"], en: ["Test"] },
  baseCoinUnits: 20, referencePrice: { currency: "CNY", amountMinor: 2000 },
  acceptedCoinTypes: ["paid_coins"], delivery: {
    kind: "subscription_plan", durationDays: 30, monthlyTrafficGb: 50,
    trafficGb: null, neverExpires: false, discountBasisPoints: 0
  }
};

function get(baseUrl, { method = "GET", path = PATH, headers = {} } = {}) {
  const url = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const req = request({ hostname: url.hostname, port: url.port, path, method,
      headers: { host: "portal.test", "sec-fetch-site": "same-origin", ...headers } }, res => {
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers,
        text: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end();
  });
}

async function fixture(run, { testIp = false, trustedProxyCidrs = [] } = {}) {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  database.exec(`create table platform_accounts (
    id text primary key, owner_ref text not null, status text not null,
    created_at text not null, updated_at text not null,
    metadata_json text not null default '{}'
  )`);
  applyCoinWalletMigrations({ database, expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum });
  applyCoinCommerceMigrations({ database, expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum });
  const store = createSqliteCoinCommerceStore({ database });
  store.publishOfferVersion(OFFER);
  let authReads = 0;
  let now = WINDOW_START;
  const rejectSession = () => {
    authReads += 1;
    throw Object.assign(new Error("Synthetic expired session"), { code: "invalid_session" });
  };
  const state = {
    rootDir: fileURLToPath(new URL("../../", import.meta.url)), host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 }, consoleToken: "synthetic-only",
    proxyConfig: { servers: [], pingHosts: [], nginx: {} }, subscriptions: {},
    services: { ssLocal: { status: () => ({ running: false }) }, httpProxy: { status: () => ({ running: false }) } },
    security: { trustedProxyCidrs, adminAllowedCidrs: ["127.0.0.1/32"] },
    platform: { coinsCommerceEnabled: true, userPortalRoutesEnabled: true,
      portalBrowserOrigin: "https://portal.test", coinCommerceStore: store,
      coinCommerceCoordinator: { start() {}, stop() {} },
      userPortalAuth: { requireSession: rejectSession, requireBrowserSession: rejectSession } },
    isPortListening: async () => false,
    runCommand: async () => ({ ok: true, stdout: "", stderr: "", code: 0, timedOut: false })
  };
  const options = { rateLimitNowFn: () => now };
  if (testIp) options.clientIpResolver = req => req.headers["x-test-ip"];
  const { server, baseUrl } = await listen(createApp(state, options));
  try {
    await run({ get: input => get(baseUrl, input), store,
      authReads: () => authReads, setNow: value => { now = value; } });
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    store.close();
    database.close();
  }
}

test("exact public GET ignores ordinary, stale, malformed and duplicate cookies without auth or Set-Cookie", async () => {
  await fixture(async h => {
    for (const cookie of [undefined, `__Host-PortalSession=${COOKIE}`,
      "__Host-PortalSession=expired-format", "__Host-PortalSession=",
      `__Host-PortalSession=${COOKIE}; __Host-PortalSession=broken`,
      `PortalLocalSession=${COOKIE}`]) {
      const response = await h.get({ headers: cookie === undefined ? {} : { cookie } });
      assert.equal(response.status, 200);
      assert.equal(response.headers["set-cookie"], undefined);
      assert.equal(response.headers["cache-control"], "public, max-age=60");
      assert.equal(JSON.parse(response.text).tiers[0].tierRef, OFFER.offerRef);
    }
    const marked = await h.get({ headers: { cookie: "__Host-PortalSession=broken",
      "x-portal-request": "browser-v1", "x-portal-session-context": "invalid" } });
    assert.equal(marked.status, 200);
    assert.equal(h.authReads(), 0);
    const queried = await h.get({ path: `${PATH}?`, headers: { cookie: "__Host-PortalSession=broken" } });
    assert.equal(queried.status, 400);
    assert.equal(queried.headers["set-cookie"], undefined);
  });
});

test("public-cookie exception does not include methods, aliases or private Portal routes", async () => {
  await fixture(async h => {
    const headers = { cookie: `__Host-PortalSession=${COOKIE}` };
    for (const method of ["HEAD", "POST", "PUT", "OPTIONS"]) {
      assert.equal((await h.get({ method, headers })).status, 403, method);
    }
    for (const path of [`${PATH}/`, PATH.toUpperCase(), "/api/portal/public/%63atalog",
      "/api/portal/public/catalog/extra", "/api/portal/catalog/offers", "/api/portal/commerce/model"]) {
      assert.equal((await h.get({ path, headers })).status, 403, path);
    }
    for (const path of ["/api/portal/catalog/offers", "/api/portal/commerce/model"]) {
      assert.equal((await h.get({ path })).status, 401, path);
      const expired = await h.get({ path, headers: { ...headers, "x-portal-request": "browser-v1",
        "x-portal-session-context": `portalctx_${"b".repeat(64)}` } });
      assert.equal(expired.status, 401, path);
    }
    assert.ok(h.authReads() > 0);
  });
});

test("IPv6 /64 address rotation cannot exhaust the catalog and distinct prefixes remain available", async () => {
  await fixture(async h => {
    for (let index = 1; index <= 1030; index += 1) {
      const response = await h.get({ headers: { "x-test-ip": `2001:db8:1:2::${index.toString(16)}` } });
      assert.equal(response.status, index <= 10 ? 200 : 429, String(index));
    }
    assert.equal((await h.get({ headers: { "x-test-ip": "2001:db8:1:3::1" } })).status, 200);
    assert.equal((await h.get({ headers: { "x-test-ip": "198.51.100.1" } })).status, 200);
  }, { testIp: true });
});

test("more than 1024 client prefixes do not impose a global admission cliff or evict a hot source", async () => {
  await fixture(async h => {
    const hot = { "x-test-ip": "198.51.100.99" };
    for (let index = 0; index < 10; index += 1) assert.equal((await h.get({ headers: hot })).status, 200);
    assert.equal((await h.get({ headers: hot })).status, 429);
    let admitted = 0;
    for (let index = 0; index < 1400; index += 1) {
      const response = await h.get({ headers: { "x-test-ip": `2001:db8:${index.toString(16)}:1::1` } });
      assert.ok([200, 429].includes(response.status));
      if (response.status === 200) admitted += 1;
    }
    assert.ok(admitted > 1300, `Expected no 1024-entry cliff, got ${admitted}`);
    assert.equal((await h.get({ headers: { "x-test-ip": "203.0.113.77" } })).status, 200);
    assert.equal((await h.get({ headers: hot })).status, 429);
    h.setNow(WINDOW_START + 60_000);
    assert.equal((await h.get({ headers: hot })).status, 200);
  }, { testIp: true });
});

test("mapped IPv4 and canonical IPv6 spellings share quotas", async () => {
  await fixture(async h => {
    const ipv4 = ["192.0.2.5", "::ffff:192.0.2.5", "0:0:0:0:0:ffff:c000:205"];
    for (let index = 0; index < 11; index += 1) {
      assert.equal((await h.get({ headers: { "x-test-ip": ipv4[index % ipv4.length] } })).status, index < 10 ? 200 : 429);
    }
    const ipv6 = ["2001:db8:a:b::1", "2001:0DB8:000A:000B:0000:0000:0000:0002", "2001:db8:a:b::192.0.2.3"];
    for (let index = 0; index < 11; index += 1) {
      assert.equal((await h.get({ headers: { "x-test-ip": ipv6[index % ipv6.length] } })).status, index < 10 ? 200 : 429);
    }
  }, { testIp: true });
});

test("fixed-minute quota expires at its boundary, clock rollback cannot clear counts, cache TTL stays independent", async () => {
  await fixture(async h => {
    const headers = { "x-test-ip": "198.51.100.1" };
    h.setNow(WINDOW_START + 59_000);
    const first = await h.get({ headers });
    for (let index = 1; index < 10; index += 1) assert.equal((await h.get({ headers })).status, 200);
    const blocked = await h.get({ headers });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers["retry-after"], "1");
    h.setNow(WINDOW_START - 1);
    assert.equal((await h.get({ headers })).status, 503);
    h.setNow(WINDOW_START + 59_500);
    assert.equal((await h.get({ headers })).status, 429);
    h.setNow(WINDOW_START + 60_000);
    assert.equal((await h.get({ headers: { ...headers, "if-none-match": first.headers.etag } })).status, 304);
    h.store.retireOfferVersion({ offerRef: OFFER.offerRef, offerVersionRef: OFFER.offerVersionRef });
    h.setNow(WINDOW_START + 118_999);
    assert.equal(JSON.parse((await h.get({ headers })).text).tiers.length, 1);
    h.setNow(WINDOW_START + 119_000);
    assert.equal(JSON.parse((await h.get({ headers })).text).tiers.length, 0);
  }, { testIp: true });
});

test("untrusted forwarded claims do not change a quota", async () => {
  await fixture(async h => {
    for (let index = 0; index < 11; index += 1) {
      assert.equal((await h.get({ headers: { "x-forwarded-for": `198.51.100.${index + 1}` } })).status, index < 10 ? 200 : 429);
    }
  });
});

test("only exact trusted peers resolve clients and malformed forwarded chains fail closed", async () => {
  await fixture(async h => {
    for (let index = 0; index < 11; index += 1) {
      const response = await h.get({ headers: { "x-forwarded-for": `203.0.113.${index + 1}, 198.51.100.10` } });
      assert.equal(response.status, index < 10 ? 200 : 429);
    }
    assert.equal((await h.get({ headers: { "x-forwarded-for": "198.51.100.11" } })).status, 200);
    assert.equal((await h.get({ headers: { "x-forwarded-for": "not-an-ip, 198.51.100.11" } })).status, 503);
  }, { trustedProxyCidrs: ["127.0.0.1", "::1"] });
});

test("high-cardinality counting remains conservative without eviction or an unbounded client table", () => {
  let now = WINDOW_START;
  const route = portalPublicCatalogRoutes({ platform: { coinCommerceStore: {
    listPublishedCatalogOffers: () => []
  } } }, { nowFn: () => now, resolveClientIpFn: req => req.client });
  function visit(client) {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; },
      set() { return this; }, removeHeader() {}, type() { return this; }, end() {}, send() {} };
    route({ method: "GET", originalUrl: PATH, headers: {}, client }, res, () => assert.fail("unexpected dispatch"));
    return res.statusCode;
  }
  const accepted = new Uint8Array(5000);
  for (let round = 0; round < 11; round += 1) {
    for (let index = 0; index < accepted.length; index += 1) {
      const status = visit(`2001:db8:${index.toString(16)}:a::1`);
      assert.ok(status === 200 || status === 429);
      if (status === 200) accepted[index] += 1;
      assert.ok(accepted[index] <= 10, "collisions or churn must not decrease a source count");
    }
  }
  assert.ok(accepted.some(count => count > 0));
  // Do not assert a particular collision distribution: the hash key is random.
  now += 60_000;
  assert.equal(visit("198.51.100.200"), 200);
});
