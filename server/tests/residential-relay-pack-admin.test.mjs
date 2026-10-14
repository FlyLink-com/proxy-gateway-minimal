import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { createApp } from "../app.mjs";
import { createPortalTotpSecretProtector } from "../services/platform/portal-totp-verifier.mjs";
import {
  REQUIRED_RESIDENTIAL_RELAY_PACK_DDL_CHECKSUM, REQUIRED_RESIDENTIAL_RELAY_PACK_MIGRATION_ID,
  applyResidentialRelayPackMigrations, inspectResidentialRelayPackSchema
} from "../services/platform/residential-relay-pack-migrations.mjs";
import { createSqliteResidentialRelayPackStore } from "../services/platform/residential-relay-pack-store.mjs";
import { buildResidentialXrayRelayConfig } from "../services/edge/residential-relay-config.mjs";
import { listen } from "./helpers/listen.mjs";

const GB = 1024 ** 3;
const ROOT = "/api/admin/residential-relay-packs";
const MARKER = "synthetic-residential-upstream-secret";
const YAML = [
  "proxies:",
  `  - { name: "US resi 1", type: ss, server: 203.0.113.30, port: 8388, cipher: aes-256-gcm, password: ${MARKER}-1 }`,
  `  - { name: "US resi 2", type: ss, server: 203.0.113.31, port: 8388, cipher: aes-256-gcm, password: ${MARKER}-2 }`,
  `  - { name: "US resi 3", type: vless, server: 203.0.113.32, port: 443, uuid: 44444444-4444-4444-8444-444444444444, tls: true, servername: a.example.test }`
].join("\n") + "\n";
const KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
const now = () => new Date("2026-10-14T00:00:00.000Z");

function migrated() {
  const database = new Database(":memory:");
  applyResidentialRelayPackMigrations({ database, expectedMigrationId: REQUIRED_RESIDENTIAL_RELAY_PACK_MIGRATION_ID,
    expectedDdlChecksum: REQUIRED_RESIDENTIAL_RELAY_PACK_DDL_CHECKSUM, nowFn: now });
  return database;
}

function storeFixture() {
  const database = migrated();
  const store = createSqliteResidentialRelayPackStore({ database, secretProtector: createPortalTotpSecretProtector({ key: KEY }), nowFn: now });
  return { database, store };
}

const SKU_100 = { sizeCode: "100G", buyerProtocol: "vless", durationDays: 30, quotaBytes: 100 * GB, baseCoinUnits: 30 };

test("migration is idempotent and the store fails closed without schema or secret", () => {
  const database = migrated();
  assert.equal(inspectResidentialRelayPackSchema({ database }).ok, true);
  assert.deepEqual(applyResidentialRelayPackMigrations({ database, expectedMigrationId: REQUIRED_RESIDENTIAL_RELAY_PACK_MIGRATION_ID,
    expectedDdlChecksum: REQUIRED_RESIDENTIAL_RELAY_PACK_DDL_CHECKSUM, nowFn: now }), []);
  assert.equal(createSqliteResidentialRelayPackStore({ database: new Database(":memory:"), secretProtector: createPortalTotpSecretProtector({ key: KEY }) }).available, false);
  assert.equal(createSqliteResidentialRelayPackStore({ database }).available, false);
  assert.throws(() => applyResidentialRelayPackMigrations({ database, expectedMigrationId: "x", expectedDdlChecksum: "y", nowFn: now }), { code: "migration_id_mismatch" });
});

function seeded(store, sizeCode = "100G") {
  const row = store.listSkus().find(item => item.sizeCode === sizeCode);
  return store.getSku(row.id);
}

test("migration seeds four disabled SKUs with Ethan's default prices; 1TB has no price", () => {
  const { store } = storeFixture();
  const listed = store.listSkus();
  assert.deepEqual(listed.map(s => [s.sizeCode, s.configured, s.baseCoinUnits, s.durationDays, s.buyerProtocol, s.enabled, s.purchasable]), [
    ["100G", true, 30, 30, "vless", false, false], ["200G", true, 50, 30, "vless", false, false],
    ["500G", true, 120, 30, "vless", false, false], ["1TB", true, null, 30, "vless", false, false]]);
  assert.deepEqual(listed.map(s => s.quotaBytes), [100 * GB, 200 * GB, 500 * GB, 1024 * GB]);
  for (const sku of listed) assert.ok(!("discount" in sku) && !("displayPrice" in sku), "no per-pack discount surface");
  assert.deepEqual(listed[0].terms, { refunds: false, unusedByteRollover: false, renewals: false, autoRenew: false, gracePeriod: false });
  const snap = seeded(store);
  assert.throws(() => store.setSkuEnabled(snap.sku.id, { revision: snap.revision, enabled: true }), { code: "no_enabled_upstream" });
});

test("1TB stays unsellable until the admin sets a price", () => {
  const { store } = storeFixture();
  let snap = seeded(store, "1TB");
  snap = store.importUpstreams(snap.sku.id, { revision: snap.revision, yamlContent: YAML });
  snap = store.setUpstreamsEnabled(snap.sku.id, { revision: snap.revision, upstreamIds: [snap.items[0].id], enabled: true });
  assert.throws(() => store.setSkuEnabled(snap.sku.id, { revision: snap.revision, enabled: true }), { code: "sku_price_unset" });
  assert.throws(() => store.quote({ skuId: snap.sku.id }), { code: "sku_price_unset" });
  snap = store.saveSku({ sizeCode: "1TB", buyerProtocol: "vless", durationDays: 30, quotaBytes: 1024 * GB, baseCoinUnits: 200, revision: snap.revision });
  snap = store.setSkuEnabled(snap.sku.id, { revision: snap.revision, enabled: true });
  assert.equal(snap.sku.purchasable, true);
});

test("import binds N upstreams to one SKU; batch enable/pause/delete; pool resolves only enabled", () => {
  const { store } = storeFixture();
  let snap = seeded(store);
  const skuId = snap.sku.id;
  snap = store.importUpstreams(skuId, { revision: snap.revision, yamlContent: YAML });
  assert.equal(snap.items.length, 3);
  assert.ok(snap.items.every(item => item.enabled === false), "imports start paused");
  assert.ok(!JSON.stringify(snap).includes(MARKER) && !JSON.stringify(snap).includes("203.0.113."));
  assert.throws(() => store.setUpstreamsEnabled(skuId, { revision: "0".repeat(64), upstreamIds: [snap.items[0].id], enabled: true }), { code: "revision_conflict" });
  snap = store.importUpstreams(skuId, { revision: snap.revision, yamlContent: YAML });
  assert.equal(snap.items.length, 3);
  const [a, b, c] = snap.items.map(item => item.id);
  snap = store.setUpstreamsEnabled(skuId, { revision: snap.revision, upstreamIds: [a, b], enabled: true });
  assert.deepEqual(snap.items.map(item => item.enabled), [true, true, false]);
  snap = store.setSkuEnabled(skuId, { revision: snap.revision, enabled: true });
  assert.equal(snap.sku.purchasable, true);
  const { pool } = store.resolveRelayPool(skuId);
  assert.equal(pool.length, 2);
  const config = buildResidentialXrayRelayConfig({ inbound: { port: 443 }, groups: [{ groupId: "100g",
    users: [{ edgeCredentialRef: "edgecred_x", uuid: "55555555-5555-4555-8555-555555555555" }], pool }] });
  assert.deepEqual(config.routing.balancers[0].selector, pool.map(entry => entry.tag));
  assert.throws(() => store.deleteUpstreams(skuId, { revision: snap.revision, upstreamIds: [a, c] }), { code: "upstream_enabled" });
  snap = store.deleteUpstreams(skuId, { revision: snap.revision, upstreamIds: [c] });
  snap = store.setUpstreamsEnabled(skuId, { revision: snap.revision, upstreamIds: [a, b], enabled: false });
  assert.deepEqual([snap.sku.enabled, snap.sku.purchasable], [false, false]);
  assert.throws(() => store.resolveRelayPool(skuId), { code: "sku_not_ready" });
});

test("SKU edit changes protocol, quota, duration and price; invalid input rejected", () => {
  const { store } = storeFixture();
  let snap = seeded(store);
  snap = store.saveSku({ ...SKU_100, buyerProtocol: "hysteria2", durationDays: 14, quotaBytes: 120 * GB, baseCoinUnits: 45, revision: snap.revision });
  assert.deepEqual([snap.sku.buyerProtocol, snap.sku.durationDays, snap.sku.quotaBytes, snap.sku.baseCoinUnits], ["hysteria2", 14, 120 * GB, 45]);
  assert.throws(() => store.saveSku({ ...SKU_100, revision: "0".repeat(64) }), { code: "revision_conflict" });
  assert.throws(() => store.saveSku({ ...SKU_100, sizeCode: "2TB" }), { code: "invalid_sku_size" });
  assert.throws(() => store.saveSku({ ...SKU_100, baseCoinUnits: 0, revision: snap.revision }), { code: "invalid_price" });
  assert.throws(() => store.saveSku({ ...SKU_100, extra: 1 }), { code: "invalid_input" });
  assert.throws(() => store.importUpstreams(snap.sku.id, { revision: snap.revision, yamlContent: "proxies: []\n" }), { code: "invalid_yaml" });
});

function sellable(store, sizeCode = "100G") {
  let snap = seeded(store, sizeCode);
  snap = store.importUpstreams(snap.sku.id, { revision: snap.revision, yamlContent: YAML });
  snap = store.setUpstreamsEnabled(snap.sku.id, { revision: snap.revision, upstreamIds: [snap.items[0].id], enabled: true });
  return store.setSkuEnabled(snap.sku.id, { revision: snap.revision, enabled: true });
}

test("coupons: create, list -> coupon pricing, per-user and total limits, idempotent order price record", () => {
  const { store } = storeFixture();
  let sku100 = sellable(store, "100G");
  const sku200 = seeded(store, "200G");
  let coupons = store.listCoupons();
  coupons = store.createCoupon({ revision: coupons.revision, code: "welcome10", kind: "percent", value: 1000,
    skuIds: [sku100.sku.id], totalLimit: 2, perUserLimit: 1 });
  const welcome = coupons.items[0];
  assert.deepEqual([welcome.code, welcome.enabled, welcome.redemptionCount, "stackable" in welcome], ["WELCOME10", false, 0, false]);
  assert.throws(() => store.createCoupon({ revision: coupons.revision, code: "WELCOME10", kind: "fixed", value: 1, allSkus: true }), { code: "duplicate_coupon_code" });
  assert.throws(() => store.quote({ skuId: sku100.sku.id, couponCode: "welcome10" }), { code: "coupon_inactive" });
  coupons = store.setCouponsEnabled({ revision: coupons.revision, couponIds: [welcome.id], enabled: true });
  // 30 list -> 10% off = 3 -> 27
  const q = store.quote({ skuId: sku100.sku.id, couponCode: "WELCOME10", accountRef: "acct_a" });
  assert.deepEqual([q.listPrice, q.finalPrice, q.coupon.applied], [30, 27, true]);
  assert.ok(!Object.keys(q).some(key => /discount|stack/i.test(key)));
  assert.throws(() => store.quote({ skuId: sku200.sku.id, couponCode: "WELCOME10" }), { code: "coupon_not_applicable" });
  const recorded = store.recordOrderPrice({ orderRef: "order_1", accountRef: "acct_a", skuId: sku100.sku.id, couponCode: "WELCOME10" });
  assert.equal(recorded.finalPrice, 27);
  assert.deepEqual(store.recordOrderPrice({ orderRef: "order_1", accountRef: "acct_a", skuId: sku100.sku.id, couponCode: "welcome10" }), recorded);
  assert.throws(() => store.recordOrderPrice({ orderRef: "order_1", accountRef: "acct_b", skuId: sku100.sku.id }), { code: "order_already_priced" });
  assert.throws(() => store.recordOrderPrice({ orderRef: "order_2", accountRef: "acct_a", skuId: sku100.sku.id, couponCode: "WELCOME10" }), { code: "coupon_user_limit" });
  store.recordOrderPrice({ orderRef: "order_3", accountRef: "acct_b", skuId: sku100.sku.id, couponCode: "WELCOME10" });
  assert.throws(() => store.quote({ skuId: sku100.sku.id, couponCode: "WELCOME10", accountRef: "acct_c" }), { code: "coupon_exhausted" });
  coupons = store.listCoupons();
  assert.equal(coupons.items[0].redemptionCount, 2);
  // Fixed coupon on list price; the removed stacking toggle is rejected.
  assert.throws(() => store.createCoupon({ revision: coupons.revision, code: "FLAT8", kind: "fixed", value: 8, allSkus: true, stackable: false }), { code: "invalid_input" });
  coupons = store.createCoupon({ revision: coupons.revision, code: "FLAT8", kind: "fixed", value: 8, allSkus: true });
  const flat = coupons.items.find(item => item.code === "FLAT8");
  coupons = store.setCouponsEnabled({ revision: coupons.revision, couponIds: [flat.id], enabled: true });
  const nq = store.quote({ skuId: sku100.sku.id, couponCode: "flat8" });
  assert.deepEqual([nq.finalPrice, nq.coupon.applied], [22, true]);
  // Order without coupon records the list price and does not redeem anything.
  assert.equal(store.recordOrderPrice({ orderRef: "order_4", accountRef: "acct_d", skuId: sku100.sku.id }).finalPrice, 30);
  // Delete requires pause first.
  assert.throws(() => store.deleteCoupons({ revision: coupons.revision, couponIds: [flat.id] }), { code: "coupon_enabled" });
  coupons = store.setCouponsEnabled({ revision: coupons.revision, couponIds: [flat.id, welcome.id], enabled: false });
  coupons = store.deleteCoupons({ revision: coupons.revision, couponIds: [flat.id, welcome.id] });
  assert.equal(coupons.items.length, 0);
  assert.throws(() => store.createCoupon({ revision: coupons.revision, code: "WELCOME10", kind: "fixed", value: 1, allSkus: true }), { code: "duplicate_coupon_code" });
});

async function http(t, { enabled = true } = {}) {
  const { database, store } = storeFixture();
  const state = {
    rootDir: new URL("../../", import.meta.url).pathname, host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 }, consoleToken: "secret",
    proxyConfig: { servers: [], pingHosts: [], nginx: {} },
    services: { ssLocal: { status: () => ({ running: false }), start: async () => ({ ok: true }), stop: async () => ({ ok: true }) },
      httpProxy: { status: () => ({ running: false }), start: async () => ({ ok: true }), stop: async () => ({ ok: true }) } },
    isPortListening: async () => false,
    runCommand: async () => ({ ok: true, stdout: "", stderr: "", code: 0, timedOut: false }),
    residentialRelayPack: { enabled, available: enabled, store },
    security: { adminAllowedCidrs: ["127.0.0.1", "::1"] }
  };
  const { server, baseUrl } = await listen(createApp(state));
  t.after(() => { server.closeAllConnections(); server.close(); database.close(); });
  return async (path, { method = "GET", body, token = "secret" } = {}) => {
    const response = await fetch(`${baseUrl}${ROOT}${path}`, { method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body) });
    const raw = await response.text();
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.ok(!raw.includes(MARKER) && !raw.includes("203.0.113."), "no upstream material over HTTP");
    return { status: response.status, body: JSON.parse(raw) };
  };
}

test("admin HTTP: list, save SKU, import, batch enable/pause/delete, enable SKU", async (t) => {
  const request = await http(t);
  assert.equal((await request("/skus", { token: null })).status, 401);
  const listed = (await request("/skus")).body.skus;
  assert.equal(listed.length, 4);
  const id = listed[0].id;
  let res = await request("/skus", { method: "PUT", body: { ...SKU_100, revision: (await request(`/skus/${id}`)).body.revision } });
  assert.equal(res.status, 200);
  res = await request(`/skus/${id}/upstreams/preview`, { method: "POST", body: { yamlContent: YAML } });
  assert.deepEqual(res.body, { valid: 3, byProtocol: { ss: 2, vless: 1 }, byCountry: { US: 3 } });
  res = await request(`/skus/${id}/upstreams/import`, { method: "POST", body: { revision: (await request(`/skus/${id}`)).body.revision, yamlContent: YAML } });
  assert.equal(res.status, 201);
  const ids = res.body.items.map(item => item.id);
  res = await request(`/skus/${id}/enabled`, { method: "PATCH", body: { revision: res.body.revision, enabled: true } });
  assert.deepEqual([res.status, res.body.error], [409, "no_enabled_upstream"]);
  res = await request(`/skus/${id}/upstreams/enable`, { method: "POST", body: { revision: (await request(`/skus/${id}/upstreams`)).body.revision, upstreamIds: ids } });
  assert.equal(res.body.sku.enabledUpstreamCount, 3);
  res = await request(`/skus/${id}/upstreams/delete`, { method: "POST", body: { revision: res.body.revision, upstreamIds: [ids[0]] } });
  assert.deepEqual([res.status, res.body.error], [409, "upstream_enabled"]);
  res = await request(`/skus/${id}/upstreams/pause`, { method: "POST", body: { revision: (await request(`/skus/${id}`)).body.revision, upstreamIds: [ids[0]] } });
  res = await request(`/skus/${id}/upstreams/delete`, { method: "POST", body: { revision: res.body.revision, upstreamIds: [ids[0]] } });
  assert.equal(res.body.items.length, 2);
  res = await request(`/skus/${id}/enabled`, { method: "PATCH", body: { revision: res.body.revision, enabled: true } });
  assert.equal(res.body.sku.purchasable, true);
  assert.equal((await request("/skus/not-an-id")).status, 400);
  let coupons = (await request("/coupons")).body;
  res = await request("/coupons", { method: "POST", body: { revision: coupons.revision, code: "HTTP5", kind: "fixed", value: 5, allSkus: true } });
  assert.equal(res.status, 201);
  res = await request("/coupons/enable", { method: "POST", body: { revision: res.body.revision, couponIds: [res.body.items[0].id] } });
  res = await request("/quote", { method: "POST", body: { skuId: id, couponCode: "http5" } });
  assert.deepEqual([res.status, res.body.listPrice, res.body.finalPrice], [200, 30, 25]);
  res = await request("/quote", { method: "POST", body: { skuId: id, couponCode: "NOPE1" } });
  assert.deepEqual([res.status, res.body.error], [404, "coupon_not_found"]);
});

test("admin HTTP is unavailable while the flag is off", async (t) => {
  const request = await http(t, { enabled: false });
  const res = await request("/skus");
  assert.deepEqual([res.status, res.body.error], [503, "residential_relay_unavailable"]);
});
