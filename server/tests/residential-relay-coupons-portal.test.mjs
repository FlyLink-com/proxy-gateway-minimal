import assert from "node:assert/strict";
import test from "node:test";
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
let clock = new Date("2026-10-14T00:00:00.000Z");
const now = () => clock;
const PATH = "/api/portal/residential-relay-packs/coupons";

function fixture() {
  clock = new Date("2026-10-14T00:00:00.000Z");
  const database = new Database(":memory:");
  applyResidentialRelayPackMigrations({ database, expectedMigrationId: REQUIRED_RESIDENTIAL_RELAY_PACK_MIGRATION_ID,
    expectedDdlChecksum: REQUIRED_RESIDENTIAL_RELAY_PACK_DDL_CHECKSUM, nowFn: now });
  const store = createSqliteResidentialRelayPackStore({ database, secretProtector: createPortalTotpSecretProtector({ key: KEY }), nowFn: now });
  return { database, store };
}

function coupon(store, fields) {
  const created = store.createCoupon({ revision: store.listCoupons().revision, kind: "percent", value: 1000, allSkus: true, ...fields });
  const item = created.items.find(entry => entry.code === fields.code);
  return item.id;
}

// Simulates an order redemption without the upstream/SKU readiness setup that
// recordOrderPrice requires (covered in residential-relay-pack.test.mjs).
function redeem(database, orderRef, couponId, accountRef) {
  database.prepare("insert into platform_residential_relay_coupon_redemptions (order_ref, coupon_id, account_ref, redeemed_at) values (?, ?, ?, ?)")
    .run(orderRef, couponId, accountRef, clock.toISOString());
  database.prepare("update platform_residential_relay_coupons set redemption_count = redemption_count + 1 where id = ?").run(couponId);
}

function enable(store, ids, enabled = true) {
  store.setCouponsEnabled({ revision: store.listCoupons().revision, couponIds: ids, enabled });
}

test("store: grants are idempotent and listing is account-scoped with status classification", (t) => {
  const { database, store } = fixture();
  t.after(() => database.close());
  const skus = store.listSkus();
  const sku100 = skus.find(item => item.sizeCode === "100G");
  const avail = coupon(store, { code: "WELCOME10", perUserLimit: 2, endsAt: "2026-11-01T00:00:00.000Z" });
  const once = coupon(store, { code: "ONCE5", kind: "fixed", value: 5, allSkus: false, skuIds: [sku100.id], perUserLimit: 1 });
  const ended = coupon(store, { code: "OLDDEAL", endsAt: "2026-10-20T00:00:00.000Z" });
  const paused = coupon(store, { code: "PAUSED1" });
  const later = coupon(store, { code: "SOON20", startsAt: "2026-12-01T00:00:00.000Z" });
  const notMine = coupon(store, { code: "OTHER1" });
  enable(store, [avail, once, ended, later, notMine]);
  for (const id of [avail, once, ended, paused, later]) {
    assert.equal(store.grantCoupon({ couponId: id, accountRefs: ["acct_a", "acct_a"] }).granted, 1);
    assert.equal(store.grantCoupon({ couponId: id, accountRefs: ["acct_a"] }).granted, 0);
  }
  store.grantCoupon({ couponId: notMine, accountRefs: ["acct_b"] });
  redeem(database, "ord_1", once, "acct_a");
  redeem(database, "ord_2", avail, "acct_a");
  clock = new Date("2026-10-25T00:00:00.000Z");
  const listed = store.listAccountCoupons({ accountRef: "acct_a" });
  const byCode = Object.fromEntries(listed.items.map(item => [item.code, item]));
  assert.deepEqual(Object.keys(byCode).sort(), ["OLDDEAL", "ONCE5", "PAUSED1", "SOON20", "WELCOME10"]);
  assert.equal(byCode.WELCOME10.status, "available");
  assert.equal(byCode.WELCOME10.remainingUses, 1);
  assert.ok(!("stackable" in byCode.WELCOME10));
  assert.equal(byCode.WELCOME10.skus.length, 4);
  assert.equal(byCode.ONCE5.status, "used");
  assert.equal(byCode.ONCE5.remainingUses, 0);
  assert.deepEqual(byCode.ONCE5.skus.map(item => item.sizeCode), ["100G"]);
  assert.deepEqual([byCode.OLDDEAL.status, byCode.OLDDEAL.reason], ["expired", "ended"]);
  assert.deepEqual([byCode.PAUSED1.status, byCode.PAUSED1.reason], ["expired", "paused"]);
  assert.deepEqual([byCode.SOON20.status, byCode.SOON20.reason], ["available", "upcoming"]);
  assert.equal(byCode.SOON20.remainingUses, null);
  for (const item of listed.items) assert.ok(!Object.keys(item).some(key => /discount|stack/i.test(key)) && !("id" in item) && !("redemptionCount" in item) && !("totalLimit" in item));
  assert.deepEqual(store.listAccountCoupons({ accountRef: "acct_b" }).items.map(item => item.code), ["OTHER1"]);
  assert.deepEqual(store.listAccountCoupons({ accountRef: "acct_none" }).items, []);
  assert.throws(() => store.listAccountCoupons({ accountRef: "" }), { code: "invalid_account" });
  assert.throws(() => store.grantCoupon({ couponId: avail, accountRefs: [] }), { code: "invalid_account" });
  assert.throws(() => store.grantCoupon({ couponId: "rrcpn_" + "0".repeat(32), accountRefs: ["acct_a"] }), { code: "coupon_not_found" });
});

test("store: globally exhausted coupon is expired for an account that never used it", (t) => {
  const { database, store } = fixture();
  t.after(() => database.close());
  const id = coupon(store, { code: "LIMITED1", totalLimit: 1 });
  enable(store, [id]);
  store.grantCoupon({ couponId: id, accountRefs: ["acct_a", "acct_b"] });
  redeem(database, "ord_x", id, "acct_b");
  const [item] = store.listAccountCoupons({ accountRef: "acct_a" }).items;
  assert.deepEqual([item.status, item.reason, item.remainingUses], ["expired", "exhausted", 0]);
  const [own] = store.listAccountCoupons({ accountRef: "acct_b" }).items;
  assert.deepEqual([own.status, own.usedCount], ["used", 1], "the account that consumed the last use sees it as used");
});

async function server(t, { enabled = true } = {}) {
  const { database, store } = fixture();
  const sessions = new Map([["session_alpha", "acct_a"], ["session_beta", "acct_b"]]);
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
  const { server: listener, baseUrl } = await listen(createApp(state));
  t.after(() => { listener.closeAllConnections(); listener.close(); database.close(); });
  return { store, baseUrl };
}

test("portal HTTP: owner-only coupon list via session; no account selector; no-store", async (t) => {
  const { store, baseUrl } = await server(t);
  const a = coupon(store, { code: "ALPHA10" });
  const b = coupon(store, { code: "BETA10" });
  enable(store, [a, b]);
  store.grantCoupon({ couponId: a, accountRefs: ["acct_a"] });
  store.grantCoupon({ couponId: b, accountRefs: ["acct_b"] });
  const get = (suffix = "", headers = {}) => fetch(`${baseUrl}${PATH}${suffix}`, { headers });
  let res = await get("", { "x-portal-session": "session_alpha" });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual((await res.json()).items.map(item => item.code), ["ALPHA10"]);
  res = await get("", { "x-portal-session": "session_beta" });
  assert.deepEqual((await res.json()).items.map(item => item.code), ["BETA10"]);
  res = await get("?accountId=acct_b", { "x-portal-session": "session_alpha" });
  assert.equal(res.status, 400);
  for (const headers of [{}, { "x-portal-session": "BAD REF" }, { "x-portal-session": "session_unknown" }]) {
    res = await get("", headers);
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: "invalid_session" });
  }
});

test("portal HTTP: route is absent when the residential pack flag is off", async (t) => {
  const { baseUrl } = await server(t, { enabled: false });
  const res = await fetch(`${baseUrl}${PATH}`, { headers: { "x-portal-session": "session_alpha" } });
  assert.notEqual(res.status, 200);
});

test("admin HTTP: grant coupon to accounts, then the owner sees it", async (t) => {
  const { store, baseUrl } = await server(t);
  const id = coupon(store, { code: "GRANTME" });
  enable(store, [id]);
  const grant = (body, token = "secret") => fetch(`${baseUrl}/api/admin/residential-relay-packs/coupons/${id}/grants`, {
    method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body) });
  assert.equal((await grant({ accountRefs: ["acct_a"] }, null)).status, 401);
  assert.equal((await grant({ accountRefs: [] })).status, 400);
  let res = await grant({ accountRefs: ["acct_a"] });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { couponId: id, granted: 1 });
  res = await fetch(`${baseUrl}${PATH}`, { headers: { "x-portal-session": "session_alpha" } });
  assert.deepEqual((await res.json()).items.map(item => item.code), ["GRANTME"]);
});
