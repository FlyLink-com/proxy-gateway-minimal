import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { createApp } from "../app.mjs";
import { createPortalTotpSecretProtector } from "../services/platform/portal-totp-verifier.mjs";
import {
  REQUIRED_RESIDENTIAL_RELAY_PACK_DDL_CHECKSUM, REQUIRED_RESIDENTIAL_RELAY_PACK_MIGRATION_ID,
  applyResidentialRelayPackMigrations
} from "../services/platform/residential-relay-pack-migrations.mjs";
import { createSqliteResidentialRelayPackStore } from "../services/platform/residential-relay-pack-store.mjs";
import { listen } from "./helpers/listen.mjs";

const KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
const YAML = "proxies:\n  - { name: \"US resi 1\", type: ss, server: 203.0.113.30, port: 8388, cipher: aes-256-gcm, password: synthetic-pw }\n";
const START = "2026-10-14T00:00:00.000Z";
const EXPIRES = "2026-12-01T00:00:00.000Z";
let clock = new Date(START);
const now = () => clock;
const PATH = "/api/portal/residential-relay-packs/coupons";
const CODE_SHAPE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;

function open(database) {
  return createSqliteResidentialRelayPackStore({ database, secretProtector: createPortalTotpSecretProtector({ key: KEY }), nowFn: now });
}
function migrate(database) {
  applyResidentialRelayPackMigrations({ database, expectedMigrationId: REQUIRED_RESIDENTIAL_RELAY_PACK_MIGRATION_ID,
    expectedDdlChecksum: REQUIRED_RESIDENTIAL_RELAY_PACK_DDL_CHECKSUM, nowFn: now });
}
function fixture() {
  clock = new Date(START);
  const database = new Database(":memory:");
  migrate(database);
  return { database, store: open(database) };
}
function sku(store, size = "100G") { return store.listSkus().find(item => item.sizeCode === size); }
function sellable(store, size = "100G") {
  let snap = store.getSku(sku(store, size).id);
  snap = store.importUpstreams(snap.sku.id, { revision: snap.revision, yamlContent: YAML });
  snap = store.setUpstreamsEnabled(snap.sku.id, { revision: snap.revision, upstreamIds: [snap.items[0].id], enabled: true });
  return store.setSkuEnabled(snap.sku.id, { revision: snap.revision, enabled: true }).sku;
}
function generate(store, fields = {}) {
  return store.generateCoupons({ count: 1, kind: "percent", value: 1000, allSkus: true, expiresAt: EXPIRES, issuedBy: "op_alice", ...fields });
}
function redeem(store, accountRef, code, clientKey = "client_1") {
  return store.redeemCoupon({ accountRef, clientKey, code });
}

test("generate: codes avoid ambiguous characters, batch shares a definition, audit fields recorded", (t) => {
  const { database, store } = fixture();
  t.after(() => database.close());
  const batch = generate(store, { count: 50 });
  assert.equal(batch.items.length, 50);
  assert.equal(new Set(batch.items.map(item => item.code)).size, 50);
  for (const item of batch.items) {
    assert.match(item.code, CODE_SHAPE);
    assert.deepEqual([item.status, item.issuedBy, item.issuedAt, item.expiresAt, item.batchId], ["issued", "op_alice", START, EXPIRES, batch.batchId]);
    assert.equal(item.redeemedBy, null);
  }
  assert.equal(store.listCoupons().items.length, 50);
  assert.ok(!Object.keys(batch.items[0]).some(key => /stack|discount|remaining|limit/i.test(key)));
  for (const bad of [{ count: 0 }, { count: 501 }, { expiresAt: START }, { expiresAt: "nope" }, { allSkus: false, skuIds: [] }]) {
    assert.throws(() => generate(store, bad), { code: "invalid_coupon" });
  }
});

test("pricing limits: percent at most 20%, fixed at most 20% of every applicable priced pack; capped at compute time", (t) => {
  const { database, store } = fixture();
  t.after(() => database.close());
  assert.throws(() => generate(store, { value: 2001 }), { code: "invalid_coupon" });
  assert.equal(generate(store, { value: 2000 }).items[0].value, 2000);
  // 100G = 30 -> max 6 Coins; 500G = 120 -> max 24.
  assert.throws(() => generate(store, { kind: "fixed", value: 7 }), { code: "invalid_coupon" });
  assert.equal(generate(store, { kind: "fixed", value: 6 }).items.length, 1);
  const s500 = sku(store, "500G").id;
  assert.equal(generate(store, { kind: "fixed", value: 24, allSkus: false, skuIds: [s500] }).items.length, 1);
  assert.throws(() => generate(store, { kind: "fixed", value: 25, allSkus: false, skuIds: [s500] }), { code: "invalid_coupon" });
  // 1TB is unpriced: a fixed coupon scoped only to it can't be validated.
  assert.throws(() => generate(store, { kind: "fixed", value: 1, allSkus: false, skuIds: [sku(store, "1TB").id] }), { code: "invalid_coupon" });
  // Admin later lowers the 500G price: compute-time cap still holds deduction <= 20%.
  const fixed24 = generate(store, { kind: "fixed", value: 24, allSkus: false, skuIds: [s500] }).items[0];
  const snap = store.getSku(s500);
  store.saveSku({ sizeCode: "500G", buyerProtocol: "vless", durationDays: 30, quotaBytes: snap.sku.quotaBytes, baseCoinUnits: 50, revision: snap.revision });
  const q = store.quote({ skuId: s500, couponCode: fixed24.code });
  assert.deepEqual([q.listPrice, q.deduction, q.finalPrice, q.coupon.capped], [50, 10, 40, true]);
  // 20% of 30 = 6 exactly; 20% of 33 = 6.6 -> half-up would be 7 but cap floors to 6.
  const pct = generate(store, { value: 2000 }).items[0];
  assert.deepEqual([store.quote({ skuId: sku(store).id, couponCode: pct.code }).finalPrice], [24]);
});

test("redeem: case-insensitive, exactly once, generic failures, voided and expired codes rejected, attempts hashed", (t) => {
  const { database, store } = fixture();
  t.after(() => database.close());
  const [a, b, c] = generate(store, { count: 3 }).items;
  const lower = a.code.toLowerCase().replace(/-/g, " ");
  const out = redeem(store, "acct_a", lower);
  assert.deepEqual([out.coupon.code, out.coupon.status, out.coupon.redeemedAt], [a.code, "available", START]);
  assert.throws(() => redeem(store, "acct_a", a.code), { code: "redeem_failed" });
  assert.throws(() => redeem(store, "acct_b", a.code), { code: "redeem_failed" });
  assert.deepEqual(store.voidCoupons({ couponIds: [b.id], voidedBy: "op_bob" }), { voided: 1 });
  assert.throws(() => redeem(store, "acct_b", b.code), { code: "redeem_failed" });
  assert.throws(() => store.voidCoupons({ couponIds: [a.id], voidedBy: "op_bob" }), { code: "coupon_not_voidable" });
  assert.throws(() => redeem(store, "acct_b", "not a code"), { code: "redeem_failed" });
  clock = new Date(EXPIRES);
  assert.throws(() => redeem(store, "acct_c", c.code), { code: "redeem_failed" });
  const audit = Object.fromEntries(store.listCoupons().items.map(item => [item.id, item]));
  assert.deepEqual([audit[a.id].status, audit[a.id].redeemedBy], ["expired", "acct_a"]);
  assert.deepEqual([audit[b.id].status, audit[b.id].voidedBy], ["voided", "op_bob"]);
  assert.equal(audit[c.id].status, "expired");
  const attempts = database.prepare("select * from platform_residential_relay_redeem_attempts order by id").all();
  assert.equal(attempts.length, 6);
  for (const row of attempts) {
    assert.match(row.input_hash, /^[0-9a-f]{12}$/);
    assert.ok(!JSON.stringify(row).includes(a.code.replace(/-/g, "")) && !JSON.stringify(row).includes("not a code"));
  }
  assert.deepEqual(attempts.map(row => row.outcome), ["redeemed", "failed", "failed", "failed", "failed", "failed"]);
});

test("redeem brute-force budget: 5 failures per account per 15 minutes, then locked even for valid codes", (t) => {
  const { database, store } = fixture();
  t.after(() => database.close());
  const good = generate(store).items[0];
  for (let i = 0; i < 5; i += 1) assert.throws(() => redeem(store, "acct_x", `ABCD-EFGH-JK${i + 2}2`), { code: "redeem_failed" });
  assert.throws(() => redeem(store, "acct_x", good.code), { code: "redeem_rate_limited" });
  clock = new Date(Date.parse(START) + 15 * 60 * 1000 + 1);
  assert.equal(redeem(store, "acct_x", good.code).coupon.code, good.code);
  // Per-client budget (20) spans accounts.
  for (let i = 0; i < 20; i += 1) assert.throws(() => redeem(store, `acct_${i}`, "ZZZZ-ZZZZ-ZZZZ", "client_bad"), { code: "redeem_failed" });
  assert.throws(() => redeem(store, "acct_new", "ZZZZ-ZZZZ-ZZZZ", "client_bad"), { code: "redeem_rate_limited" });
});

test("consume: owner only, single order, deduction recorded, list shows used", (t) => {
  const { database, store } = fixture();
  t.after(() => database.close());
  const s100 = sellable(store).id;
  const [a, b] = generate(store, { count: 2 }).items;
  redeem(store, "acct_a", a.code);
  // Unredeemed or foreign coupons can't be used on an order.
  assert.throws(() => store.recordOrderPrice({ orderRef: "o_x", accountRef: "acct_a", skuId: s100, couponCode: b.code }), { code: "coupon_not_found" });
  assert.throws(() => store.recordOrderPrice({ orderRef: "o_y", accountRef: "acct_b", skuId: s100, couponCode: a.code }), { code: "coupon_not_found" });
  const order = store.recordOrderPrice({ orderRef: "o_1", accountRef: "acct_a", skuId: s100, couponCode: a.code });
  assert.deepEqual([order.listPrice, order.deduction, order.finalPrice], [30, 3, 27]);
  assert.deepEqual(store.recordOrderPrice({ orderRef: "o_1", accountRef: "acct_a", skuId: s100, couponCode: a.code.toLowerCase() }), order);
  assert.throws(() => store.recordOrderPrice({ orderRef: "o_2", accountRef: "acct_a", skuId: s100, couponCode: a.code }), { code: "coupon_inactive" });
  const audit = store.listCoupons().items.find(item => item.id === a.id);
  assert.deepEqual([audit.status, audit.consumedBy, audit.consumedOrderRef, audit.consumedAmount, audit.consumedAt],
    ["consumed", "acct_a", "o_1", 3, START]);
  const [mine] = store.listAccountCoupons({ accountRef: "acct_a" }).items;
  assert.deepEqual([mine.status, mine.consumedOrderRef, mine.consumedAmount], ["used", "o_1", 3]);
  assert.deepEqual(store.listAccountCoupons({ accountRef: "acct_b" }).items, []);
  for (const key of Object.keys(mine)) assert.ok(!/stack|discount|remaining|id$/i.test(key) || key === "consumedOrderRef");
  // Expired redeemed coupons show as expired and can't be consumed.
  const late = generate(store).items[0];
  redeem(store, "acct_a", late.code);
  clock = new Date(EXPIRES);
  assert.equal(store.listAccountCoupons({ accountRef: "acct_a" }).items.find(item => item.code === late.code).status, "expired");
  assert.throws(() => store.recordOrderPrice({ orderRef: "o_3", accountRef: "acct_a", skuId: s100, couponCode: late.code }), { code: "coupon_inactive" });
});

test("consume is atomic across connections: two orders racing on one coupon, only one wins", (t) => {
  clock = new Date(START);
  const dir = mkdtempSync(join(tmpdir(), "rr-race-"));
  const file = join(dir, "pack.sqlite");
  const first = new Database(file);
  migrate(first);
  const second = new Database(file);
  second.pragma("busy_timeout = 2000");
  t.after(() => { first.close(); second.close(); rmSync(dir, { recursive: true, force: true }); });
  const storeA = open(first);
  const storeB = open(second);
  const s100 = sellable(storeA).id;
  const c = generate(storeA).items[0];
  redeem(storeA, "acct_a", c.code);
  const results = [storeA, storeB].map((store, i) => {
    try { return store.recordOrderPrice({ orderRef: `race_${i}`, accountRef: "acct_a", skuId: s100, couponCode: c.code }).finalPrice; }
    catch (error) { return error.code; }
  });
  assert.deepEqual(results, [27, "coupon_inactive"]);
  assert.equal(first.prepare("select count(*) as n from platform_residential_relay_order_prices where coupon_id is not null").get().n, 1);
});

async function server(t, { enabled = true } = {}) {
  const { database, store } = fixture();
  const sessions = new Map([["session_alpha", "acct_a"], ["session_beta", "acct_b"]]);
  let ms = Date.parse(START);
  const state = {
    rootDir: new URL("../../", import.meta.url).pathname, host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 }, consoleToken: "secret",
    proxyConfig: { servers: [], pingHosts: [], nginx: {} },
    services: { ssLocal: { status: () => ({ running: false }), start: async () => ({ ok: true }), stop: async () => ({ ok: true }) },
      httpProxy: { status: () => ({ running: false }), start: async () => ({ ok: true }), stop: async () => ({ ok: true }) } },
    isPortListening: async () => false,
    runCommand: async () => ({ ok: true, stdout: "", stderr: "", code: 0, timedOut: false }),
    residentialRelayPack: { enabled, available: enabled, store },
    platform: { userPortalAuth: { requireSession({ sessionRef }) {
      if (!sessions.has(sessionRef)) throw Object.assign(new Error("no"), { code: "invalid_session" });
      return { sessionRef, accountId: sessions.get(sessionRef) };
    } } },
    security: { adminAllowedCidrs: ["127.0.0.1", "::1"] }
  };
  const { server: listener, baseUrl } = await listen(createApp(state, { rateLimitNowFn: () => ms }));
  t.after(() => { listener.closeAllConnections(); listener.close(); database.close(); });
  return { store, baseUrl, advance: (delta) => { ms += delta; } };
}

const post = (baseUrl, session, body) => fetch(`${baseUrl}${PATH}/redeem`, { method: "POST",
  headers: { "content-type": "application/json", ...(session ? { "x-portal-session": session } : {}) }, body: JSON.stringify(body) });

test("portal HTTP: redeem then list own coupons; generic errors; no account selector", async (t) => {
  const { store, baseUrl } = await server(t);
  const [a, b] = generate(store, { count: 2 }).items;
  let res = await post(baseUrl, "session_alpha", { code: a.code.toLowerCase() });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal((await res.json()).coupon.code, a.code);
  for (const body of [{ code: a.code }, { code: "nope" }, { code: b.code, accountRef: "acct_b" }, { other: 1 }]) {
    res = await post(baseUrl, "session_beta", body);
    assert.deepEqual([res.status, await res.json()], [400, { error: "redeem_failed" }]);
  }
  res = await post(baseUrl, null, { code: b.code });
  assert.equal(res.status, 401);
  res = await fetch(`${baseUrl}${PATH}`, { headers: { "x-portal-session": "session_alpha" } });
  assert.deepEqual((await res.json()).items.map(item => item.code), [a.code]);
  res = await fetch(`${baseUrl}${PATH}`, { headers: { "x-portal-session": "session_beta" } });
  assert.deepEqual((await res.json()).items, []);
  res = await fetch(`${baseUrl}${PATH}?accountId=acct_a`, { headers: { "x-portal-session": "session_beta" } });
  assert.equal(res.status, 400);
});

test("portal HTTP: burst limit returns 429 with Retry-After before the store is touched", async (t) => {
  const { baseUrl, advance } = await server(t);
  let last;
  for (let i = 0; i < 11; i += 1) last = await post(baseUrl, "session_alpha", { code: "ZZZZ-ZZZZ-ZZZ2" });
  // First 5 failures hit the store budget (429 at #6); the in-memory burst also caps at 10/min.
  assert.equal(last.status, 429);
  assert.deepEqual(await last.json(), { error: "redeem_rate_limited" });
  assert.ok(last.headers.get("retry-after"));
  advance(61_000);
  last = await post(baseUrl, "session_alpha", { code: "ZZZZ-ZZZZ-ZZZ2" });
  assert.equal(last.status, 429, "store budget still applies for 15 minutes");
});

test("portal HTTP: routes are absent when the residential pack flag is off", async (t) => {
  const { baseUrl } = await server(t, { enabled: false });
  const res = await fetch(`${baseUrl}${PATH}`, { headers: { "x-portal-session": "session_alpha" } });
  assert.notEqual(res.status, 200);
  assert.notEqual((await post(baseUrl, "session_alpha", { code: "ABCD-EFGH-JKMN" })).status, 200);
});

test("admin HTTP: generate, list audit, void", async (t) => {
  const { baseUrl } = await server(t);
  const admin = (path, body) => fetch(`${baseUrl}/api/admin/residential-relay-packs${path}`, {
    method: body ? "POST" : "GET", headers: { "content-type": "application/json", authorization: "Bearer secret" },
    body: body ? JSON.stringify(body) : undefined });
  let res = await admin("/coupons/generate", { count: 3, kind: "percent", value: 1500, allSkus: true, expiresAt: EXPIRES });
  assert.equal(res.status, 201);
  const items = (await res.json()).items;
  res = await admin("/coupons/generate", { count: 1, kind: "percent", value: 2500, allSkus: true, expiresAt: EXPIRES });
  assert.deepEqual([res.status, (await res.json()).error], [400, "invalid_coupon"]);
  res = await admin("/coupons/void", { couponIds: [items[0].id] });
  assert.deepEqual(await res.json(), { voided: 1 });
  res = await admin("/coupons/void", { couponIds: [items[0].id] });
  assert.equal(res.status, 409);
  const list = (await (await admin("/coupons")).json()).items;
  assert.deepEqual(list.map(item => item.status).sort(), ["issued", "issued", "voided"]);
  assert.equal((await admin("/coupons/grants", { couponIds: [] })).status, 404);
});
