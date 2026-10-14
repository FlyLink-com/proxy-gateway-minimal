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
const DAY = 24 * 60 * 60 * 1000;
const CODE_EXPIRES = "2026-11-13T00:00:00.000Z"; // START + 30 days
const ISSUERS = new Set(["op_alice", "op_bob", "console_token"]);
let clock = new Date(START);
const now = () => clock;
const PATH = "/api/portal/residential-relay-packs/coupons";
const CODE_SHAPE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;

function open(database, extra = {}) {
  return createSqliteResidentialRelayPackStore({ database, secretProtector: createPortalTotpSecretProtector({ key: KEY }), nowFn: now,
    isActiveIssuer: ref => ISSUERS.has(ref), redeemDailyLimit: 100, ...extra });
}
function migrate(database) {
  applyResidentialRelayPackMigrations({ database, expectedMigrationId: REQUIRED_RESIDENTIAL_RELAY_PACK_MIGRATION_ID,
    expectedDdlChecksum: REQUIRED_RESIDENTIAL_RELAY_PACK_DDL_CHECKSUM, nowFn: now });
}
function fixture(extra) {
  clock = new Date(START);
  ISSUERS.add("op_alice");
  const database = new Database(":memory:");
  migrate(database);
  return { database, store: open(database, extra) };
}
function sku(store, size = "100G") { return store.listSkus().find(item => item.sizeCode === size); }
function sellable(store, size = "100G") {
  let snap = store.getSku(sku(store, size).id);
  snap = store.importUpstreams(snap.sku.id, { revision: snap.revision, yamlContent: YAML });
  snap = store.setUpstreamsEnabled(snap.sku.id, { revision: snap.revision, upstreamIds: [snap.items[0].id], enabled: true });
  return store.setSkuEnabled(snap.sku.id, { revision: snap.revision, enabled: true }).sku;
}
function generate(store, fields = {}) {
  return store.generateCoupons({ count: 1, kind: "percent", value: 1000, allSkus: true, issuedBy: "op_alice", ...fields });
}
function redeem(store, accountRef, code, clientKey = "client_1") {
  return store.redeemCoupon({ accountRef, clientKey, code });
}

test("generate: codes avoid ambiguous characters, fixed 30-day expiry, issuer/recipient recorded", (t) => {
  const { database, store } = fixture();
  t.after(() => database.close());
  const batch = generate(store, { count: 50 });
  assert.equal(batch.items.length, 50);
  assert.equal(new Set(batch.items.map(item => item.code)).size, 50);
  for (const item of batch.items) {
    assert.match(item.code, CODE_SHAPE);
    assert.deepEqual([item.status, item.issuedBy, item.issuer, item.recipientRef, item.issuedAt, item.expiresAt, item.batchId, item.codeMasked],
      ["issued", "op_alice", "op_alice", null, START, CODE_EXPIRES, batch.batchId, false]);
    assert.match(item.ref, /^RC-[0-9A-F]{8}$/);
  }
  const targeted = generate(store, { issuer: "op_bob", recipientRef: "acct_b" }).items[0];
  assert.deepEqual([targeted.issuedBy, targeted.issuer, targeted.recipientRef], ["op_alice", "op_bob", "acct_b"]);
  assert.equal(store.listCoupons().items.length, 51);
  assert.ok(!Object.keys(batch.items[0]).some(key => /stack|discount|remaining|limit/i.test(key)));
  for (const bad of [{ count: 0 }, { count: 501 }, { allSkus: false, skuIds: [] }]) {
    assert.throws(() => generate(store, bad), { code: "invalid_coupon" });
  }
  assert.throws(() => generate(store, { expiresAt: "2027-01-01T00:00:00.000Z" }), { code: "invalid_input" });
  assert.throws(() => generate(store, { issuer: "op_mallory" }), { code: "invalid_issuer" });
  assert.throws(() => generate(store, { recipientRef: "bad ref!" }), { code: "invalid_recipient" });
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
  assert.throws(() => generate(store, { kind: "fixed", value: 1, allSkus: false, skuIds: [sku(store, "1TB").id] }), { code: "invalid_coupon" });
  const fixed24 = generate(store, { kind: "fixed", value: 24, allSkus: false, skuIds: [s500] }).items[0];
  const snap = store.getSku(s500);
  store.saveSku({ sizeCode: "500G", buyerProtocol: "vless", durationDays: 30, quotaBytes: snap.sku.quotaBytes, baseCoinUnits: 50, revision: snap.revision });
  const q = store.quote({ skuId: s500, couponCode: fixed24.code });
  assert.deepEqual([q.listPrice, q.deduction, q.finalPrice, q.coupon.capped], [50, 10, 40, true]);
  assert.ok(!JSON.stringify(q).includes(fixed24.code.slice(0, 4) + "-"));
  const pct = generate(store, { value: 2000 }).items[0];
  assert.deepEqual([store.quote({ skuId: sku(store).id, couponCode: pct.code }).finalPrice], [24]);
});

test("redeem: case-insensitive, exactly once, generic failures, code never shown after redemption, attempts hashed", (t) => {
  const { database, store } = fixture();
  t.after(() => database.close());
  const [a, b, c] = generate(store, { count: 3 }).items;
  const lower = a.code.toLowerCase().replace(/-/g, " ");
  const out = redeem(store, "acct_a", lower);
  assert.deepEqual([out.coupon.ref, out.coupon.status, out.coupon.redeemedAt, out.coupon.usableUntil], [a.ref, "available", START, CODE_EXPIRES]);
  assert.ok(!("code" in out.coupon));
  assert.throws(() => redeem(store, "acct_a", a.code), { code: "redeem_failed" });
  assert.throws(() => redeem(store, "acct_b", a.code), { code: "redeem_failed" });
  assert.deepEqual(store.voidCoupons({ couponIds: [b.id], voidedBy: "op_bob" }), { voided: 1 });
  assert.throws(() => redeem(store, "acct_b", b.code), { code: "redeem_failed" });
  assert.throws(() => store.voidCoupons({ couponIds: [a.id], voidedBy: "op_bob" }), { code: "coupon_not_voidable" });
  assert.throws(() => redeem(store, "acct_b", "not a code"), { code: "redeem_failed" });
  clock = new Date(CODE_EXPIRES);
  assert.throws(() => redeem(store, "acct_c", c.code), { code: "redeem_failed" });
  const audit = Object.fromEntries(store.listCoupons().items.map(item => [item.id, item]));
  assert.deepEqual([audit[a.id].status, audit[a.id].redeemedBy, audit[a.id].codeMasked], ["expired", "acct_a", true]);
  assert.equal(audit[a.id].code, `••••-••••-${a.code.slice(-4)}`);
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

test("redeem: targeted codes only for their recipient; issuer must be an active admin", (t) => {
  const { database, store } = fixture();
  t.after(() => database.close());
  const targeted = generate(store, { recipientRef: "acct_b" }).items[0];
  assert.throws(() => redeem(store, "acct_a", targeted.code), { code: "redeem_failed" });
  assert.equal(redeem(store, "acct_b", targeted.code).coupon.ref, targeted.ref);
  const open1 = generate(store).items[0];
  ISSUERS.delete("op_alice");
  assert.throws(() => redeem(store, "acct_c", open1.code), { code: "redeem_failed" });
  ISSUERS.add("op_alice");
  assert.equal(redeem(store, "acct_c", open1.code).coupon.ref, open1.ref);
  // Without an issuer checker the store fails closed.
  const closed = createSqliteResidentialRelayPackStore({ database, secretProtector: createPortalTotpSecretProtector({ key: KEY }), nowFn: now });
  assert.throws(() => generate(closed), { code: "invalid_issuer" });
});

test("redeem daily limit: 1 success per account per Los Angeles calendar day, configurable", (t) => {
  const { database, store } = fixture({ redeemDailyLimit: undefined });
  t.after(() => database.close());
  const [a, b, c] = generate(store, { count: 3 }).items;
  // START = 2026-10-13 17:00 PT. Next LA day starts 2026-10-14T07:00Z.
  redeem(store, "acct_a", a.code);
  clock = new Date("2026-10-14T06:59:59.000Z");
  assert.throws(() => redeem(store, "acct_a", b.code), { code: "redeem_daily_limit" });
  assert.equal(redeem(store, "acct_b", b.code).coupon.ref, b.ref, "other accounts unaffected");
  clock = new Date("2026-10-14T07:00:00.000Z");
  assert.equal(redeem(store, "acct_a", c.code).coupon.ref, c.ref);
  const outcomes = database.prepare("select outcome from platform_residential_relay_redeem_attempts order by id").all().map(row => row.outcome);
  assert.deepEqual(outcomes, ["redeemed", "daily_limited", "redeemed", "redeemed"]);
  const two = fixture({ redeemDailyLimit: 2 });
  t.after(() => two.database.close());
  const codes = generate(two.store, { count: 3 }).items;
  redeem(two.store, "acct_a", codes[0].code);
  redeem(two.store, "acct_a", codes[1].code);
  assert.throws(() => redeem(two.store, "acct_a", codes[2].code), { code: "redeem_daily_limit" });
});

test("redeem brute-force budget: 5 failures per account per 15 minutes, then locked even for valid codes", (t) => {
  const { database, store } = fixture();
  t.after(() => database.close());
  const good = generate(store).items[0];
  for (let i = 0; i < 5; i += 1) assert.throws(() => redeem(store, "acct_x", `ABCD-EFGH-JK${i + 2}2`), { code: "redeem_failed" });
  assert.throws(() => redeem(store, "acct_x", good.code), { code: "redeem_rate_limited" });
  clock = new Date(Date.parse(START) + 15 * 60 * 1000 + 1);
  assert.equal(redeem(store, "acct_x", good.code).coupon.ref, good.ref);
  for (let i = 0; i < 20; i += 1) assert.throws(() => redeem(store, `acct_${i}`, "ZZZZ-ZZZZ-ZZZZ", "client_bad"), { code: "redeem_failed" });
  assert.throws(() => redeem(store, "acct_new", "ZZZZ-ZZZZ-ZZZZ", "client_bad"), { code: "redeem_rate_limited" });
});

test("checkout: auto-applies the largest allowed deduction, buyer can switch or opt out, codes never exposed", (t) => {
  const { database, store } = fixture();
  t.after(() => database.close());
  const s100 = sellable(store).id; // 30 Coins; cap 6
  const p10 = generate(store, { value: 1000 }).items[0]; // 3
  const f5 = generate(store, { kind: "fixed", value: 5 }).items[0]; // 5
  const p20 = generate(store, { value: 2000 }).items[0]; // 6
  const only500 = generate(store, { value: 2000, allSkus: false, skuIds: [sku(store, "500G").id] }).items[0];
  for (const c of [p10, f5, p20, only500]) redeem(store, "acct_a", c.code);
  let q = store.checkoutQuote({ accountRef: "acct_a", skuId: s100 });
  assert.deepEqual([q.selection, q.coupon.id, q.listPrice, q.deduction, q.finalPrice], ["auto", p20.id, 30, 6, 24]);
  assert.deepEqual(q.options.map(o => [o.id, o.deduction, o.best]), [[p20.id, 6, true], [f5.id, 5, false], [p10.id, 3, false]]);
  for (const c of [p10, f5, p20]) assert.ok(!JSON.stringify(q).includes(c.code));
  q = store.checkoutQuote({ accountRef: "acct_a", skuId: s100, couponId: p10.id });
  assert.deepEqual([q.selection, q.coupon.id, q.finalPrice], ["manual", p10.id, 27]);
  q = store.checkoutQuote({ accountRef: "acct_a", skuId: s100, couponId: null });
  assert.deepEqual([q.selection, q.coupon, q.deduction, q.finalPrice], ["none", null, 0, 30]);
  assert.throws(() => store.checkoutQuote({ accountRef: "acct_a", skuId: s100, couponId: only500.id }), { code: "coupon_inactive" });
  assert.throws(() => store.checkoutQuote({ accountRef: "acct_b", skuId: s100, couponId: p10.id }), { code: "coupon_inactive" });
  assert.deepEqual(store.checkoutQuote({ accountRef: "acct_b", skuId: s100 }).options, []);
  // Order pricing uses the same auto rule and consumes atomically.
  const o1 = store.recordOrderPrice({ orderRef: "o_1", accountRef: "acct_a", skuId: s100 });
  assert.deepEqual([o1.coupon.id, o1.finalPrice], [p20.id, 24]);
  assert.deepEqual(store.recordOrderPrice({ orderRef: "o_1", accountRef: "acct_a", skuId: s100 }), o1);
  const o2 = store.recordOrderPrice({ orderRef: "o_2", accountRef: "acct_a", skuId: s100 });
  assert.equal(o2.coupon.id, f5.id);
  const o3 = store.recordOrderPrice({ orderRef: "o_3", accountRef: "acct_a", skuId: s100, couponId: null });
  assert.deepEqual([o3.coupon, o3.finalPrice], [null, 30]);
  assert.throws(() => store.recordOrderPrice({ orderRef: "o_4", accountRef: "acct_a", skuId: s100, couponId: p20.id }), { code: "coupon_inactive" });
  const mine = store.listAccountCoupons({ accountRef: "acct_a" }).items;
  assert.deepEqual(mine.filter(item => item.status === "used").map(item => [item.id, item.consumedOrderRef, item.consumedAmount]).sort(),
    [[f5.id, "o_2", 5], [p20.id, "o_1", 6]].sort());
  for (const item of mine) assert.ok(!("code" in item));
  const audit = store.listCoupons().items.find(item => item.id === p20.id);
  assert.deepEqual([audit.status, audit.consumedBy, audit.consumedOrderRef, audit.consumedAmount], ["consumed", "acct_a", "o_1", 6]);
});

test("validity: redeemed coupons usable 30 days from redemption, then expired and skipped", (t) => {
  const { database, store } = fixture();
  t.after(() => database.close());
  const s100 = sellable(store).id;
  const c = generate(store).items[0];
  clock = new Date(Date.parse(START) + 20 * DAY);
  const at = clock.toISOString();
  assert.equal(redeem(store, "acct_a", c.code).coupon.usableUntil, new Date(Date.parse(at) + 30 * DAY).toISOString());
  clock = new Date(Date.parse(at) + 29 * DAY); // past the code's own 30-day expiry, still usable
  assert.equal(store.checkoutQuote({ accountRef: "acct_a", skuId: s100 }).coupon.id, c.id);
  clock = new Date(Date.parse(at) + 30 * DAY);
  assert.equal(store.listAccountCoupons({ accountRef: "acct_a" }).items[0].status, "expired");
  assert.equal(store.checkoutQuote({ accountRef: "acct_a", skuId: s100 }).coupon, null);
  assert.throws(() => store.recordOrderPrice({ orderRef: "o_x", accountRef: "acct_a", skuId: s100, couponId: c.id }), { code: "coupon_inactive" });
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
    try { return store.recordOrderPrice({ orderRef: `race_${i}`, accountRef: "acct_a", skuId: s100, couponId: c.id }).finalPrice; }
    catch (error) { return error.code; }
  });
  assert.deepEqual(results, [27, "coupon_inactive"]);
  assert.equal(first.prepare("select count(*) as n from platform_residential_relay_order_prices where coupon_id is not null").get().n, 1);
});

async function server(t, { enabled = true, daily = false } = {}) {
  const { database, store } = fixture(daily ? { redeemDailyLimit: undefined } : undefined);
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
  const redeemed = await res.json();
  assert.equal(redeemed.coupon.ref, a.ref);
  assert.ok(!JSON.stringify(redeemed).includes(a.code));
  for (const body of [{ code: a.code }, { code: "nope" }, { code: b.code, accountRef: "acct_b" }, { other: 1 }]) {
    res = await post(baseUrl, "session_beta", body);
    assert.deepEqual([res.status, await res.json()], [400, { error: "redeem_failed" }]);
  }
  res = await post(baseUrl, null, { code: b.code });
  assert.equal(res.status, 401);
  res = await fetch(`${baseUrl}${PATH}`, { headers: { "x-portal-session": "session_alpha" } });
  assert.deepEqual((await res.json()).items.map(item => item.ref), [a.ref]);
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
  let res = await admin("/coupons/generate", { count: 3, kind: "percent", value: 1500, allSkus: true });
  assert.equal(res.status, 201);
  const items = (await res.json()).items;
  assert.deepEqual([items[0].issuedBy, items[0].issuer, items[0].expiresAt], ["console_token", "console_token", CODE_EXPIRES]);
  res = await admin("/coupons/generate", { count: 1, kind: "percent", value: 1000, allSkus: true, issuer: "op_bob", recipientRef: "acct_b" });
  const targeted = (await res.json()).items[0];
  assert.deepEqual([targeted.issuer, targeted.recipientRef], ["op_bob", "acct_b"]);
  res = await admin("/coupons/generate", { count: 1, kind: "percent", value: 1000, allSkus: true, issuer: "op_nobody" });
  assert.deepEqual([res.status, (await res.json()).error], [400, "invalid_issuer"]);
  res = await admin("/coupons/generate", { count: 1, kind: "percent", value: 2500, allSkus: true });
  assert.deepEqual([res.status, (await res.json()).error], [400, "invalid_coupon"]);
  res = await admin("/coupons/void", { couponIds: [items[0].id] });
  assert.deepEqual(await res.json(), { voided: 1 });
  res = await admin("/coupons/void", { couponIds: [items[0].id] });
  assert.equal(res.status, 409);
  const listed = await (await admin("/coupons")).json();
  assert.equal(listed.actor, "console_token");
  assert.deepEqual(listed.items.map(item => item.status).sort(), ["issued", "issued", "issued", "voided"]);
  assert.equal((await admin("/coupons/grants", { couponIds: [] })).status, 404);
});

test("portal HTTP: daily limit 429, catalogue and checkout quote (auto, switch, none)", async (t) => {
  const { store, baseUrl } = await server(t, { daily: true });
  const s100 = sellable(store).id;
  const [a, b] = generate(store, { count: 2 }).items;
  assert.equal((await post(baseUrl, "session_alpha", { code: a.code })).status, 200);
  const limited = await post(baseUrl, "session_alpha", { code: b.code });
  assert.deepEqual([limited.status, await limited.json()], [429, { error: "redeem_daily_limit" }]);
  const headers = { "content-type": "application/json", "x-portal-session": "session_alpha" };
  let res = await fetch(`${baseUrl}/api/portal/residential-relay-packs/skus`, { headers });
  assert.deepEqual((await res.json()).items.map(item => [item.id, item.listPrice]), [[s100, 30]]);
  const quote = body => fetch(`${baseUrl}/api/portal/residential-relay-packs/checkout/quote`, { method: "POST", headers, body: JSON.stringify(body) });
  res = await quote({ skuId: s100 });
  let q = await res.json();
  assert.deepEqual([res.status, q.selection, q.coupon.id, q.finalPrice], [200, "auto", a.id, 27]);
  assert.ok(!JSON.stringify(q).includes(a.code));
  q = await (await quote({ skuId: s100, couponId: null })).json();
  assert.deepEqual([q.selection, q.finalPrice], ["none", 30]);
  res = await quote({ skuId: s100, couponId: b.id });
  assert.deepEqual([res.status, await res.json()], [409, { error: "coupon_inactive" }]);
  assert.equal((await quote({ skuId: s100, accountRef: "acct_b" })).status, 400);
  res = await fetch(`${baseUrl}/api/portal/residential-relay-packs/checkout/quote`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ skuId: s100 }) });
  assert.equal(res.status, 401);
});
