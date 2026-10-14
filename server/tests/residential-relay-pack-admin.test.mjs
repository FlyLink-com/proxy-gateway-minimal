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

test("all four sizes are listed; configuring a SKU never makes it sellable without an enabled upstream", () => {
  const { store } = storeFixture();
  const listed = store.listSkus();
  assert.deepEqual(listed.map(s => [s.sizeCode, s.configured, s.purchasable]),
    [["100G", false, false], ["200G", false, false], ["500G", false, false], ["1TB", false, false]]);
  assert.equal(listed[3].quotaBytes, 1024 * GB);
  assert.throws(() => store.saveSku({ ...SKU_100, enabled: true }), { code: "no_enabled_upstream" });
  const created = store.saveSku(SKU_100);
  assert.equal(created.sku.enabled, false);
  assert.equal(created.sku.purchasable, false);
  assert.deepEqual(created.sku.terms, { refunds: false, unusedByteRollover: false, renewals: false, autoRenew: false, gracePeriod: false });
  assert.throws(() => store.setSkuEnabled(created.sku.id, { revision: created.revision, enabled: true }), { code: "no_enabled_upstream" });
});

test("import binds N upstreams to one SKU; batch enable/pause/delete; pool resolves only enabled", () => {
  const { store } = storeFixture();
  let snap = store.saveSku(SKU_100);
  const skuId = snap.sku.id;
  snap = store.importUpstreams(skuId, { revision: snap.revision, yamlContent: YAML });
  assert.equal(snap.items.length, 3);
  assert.ok(snap.items.every(item => item.enabled === false), "imports start paused");
  assert.ok(!JSON.stringify(snap).includes(MARKER) && !JSON.stringify(snap).includes("203.0.113."));
  assert.throws(() => store.setUpstreamsEnabled(skuId, { revision: "0".repeat(64), upstreamIds: [snap.items[0].id], enabled: true }), { code: "revision_conflict" });
  // Re-importing the same YAML does not duplicate bindings.
  snap = store.importUpstreams(skuId, { revision: snap.revision, yamlContent: YAML });
  assert.equal(snap.items.length, 3);
  const [a, b, c] = snap.items.map(item => item.id);
  snap = store.setUpstreamsEnabled(skuId, { revision: snap.revision, upstreamIds: [a, b], enabled: true });
  assert.deepEqual(snap.items.map(item => item.enabled), [true, true, false]);
  assert.equal(snap.sku.enabledUpstreamCount, 2);
  snap = store.setSkuEnabled(skuId, { revision: snap.revision, enabled: true });
  assert.equal(snap.sku.purchasable, true);
  const { pool } = store.resolveRelayPool(skuId);
  assert.equal(pool.length, 2);
  assert.ok(pool.every(entry => entry.tag.startsWith("resi-us-")));
  // The resolved pool feeds the relay config for this SKU's buyers only.
  const config = buildResidentialXrayRelayConfig({ inbound: { port: 443 }, groups: [{ groupId: "100g",
    users: [{ edgeCredentialRef: "edgecred_x", uuid: "55555555-5555-4555-8555-555555555555" }], pool }] });
  assert.deepEqual(config.routing.balancers[0].selector, pool.map(entry => entry.tag));
  assert.throws(() => store.deleteUpstreams(skuId, { revision: snap.revision, upstreamIds: [a, c] }), { code: "upstream_enabled" });
  snap = store.deleteUpstreams(skuId, { revision: snap.revision, upstreamIds: [c] });
  assert.equal(snap.items.length, 2);
  // Pausing every enabled upstream auto-pauses the SKU so it cannot be sold.
  snap = store.setUpstreamsEnabled(skuId, { revision: snap.revision, upstreamIds: [a, b], enabled: false });
  assert.deepEqual([snap.sku.enabled, snap.sku.purchasable], [false, false]);
  assert.throws(() => store.resolveRelayPool(skuId), { code: "sku_not_ready" });
  snap = store.deleteUpstreams(skuId, { revision: snap.revision, upstreamIds: [a, b] });
  assert.equal(snap.items.length, 0);
});

test("SKU edit changes protocol, quota, duration and price; invalid input rejected", () => {
  const { store } = storeFixture();
  let snap = store.saveSku(SKU_100);
  snap = store.saveSku({ ...SKU_100, buyerProtocol: "hysteria2", durationDays: 14, quotaBytes: 120 * GB, baseCoinUnits: 45, revision: snap.revision });
  assert.deepEqual([snap.sku.buyerProtocol, snap.sku.durationDays, snap.sku.quotaBytes, snap.sku.baseCoinUnits], ["hysteria2", 14, 120 * GB, 45]);
  assert.throws(() => store.saveSku({ ...SKU_100, revision: "0".repeat(64) }), { code: "revision_conflict" });
  assert.throws(() => store.saveSku({ ...SKU_100, sizeCode: "2TB" }), { code: "invalid_sku_size" });
  assert.throws(() => store.saveSku({ ...SKU_100, baseCoinUnits: 0 }), { code: "invalid_price" });
  assert.throws(() => store.saveSku({ ...SKU_100, extra: 1 }), { code: "invalid_input" });
  assert.throws(() => store.importUpstreams(snap.sku.id, { revision: snap.revision, yamlContent: "proxies: []\n" }), { code: "invalid_yaml" });
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
  assert.equal((await request("/skus")).body.skus.length, 4);
  let res = await request("/skus", { method: "PUT", body: SKU_100 });
  assert.equal(res.status, 200);
  const id = res.body.sku.id;
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
});

test("admin HTTP is unavailable while the flag is off", async (t) => {
  const request = await http(t, { enabled: false });
  const res = await request("/skus");
  assert.deepEqual([res.status, res.body.error], [503, "residential_relay_unavailable"]);
});
