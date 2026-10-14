import assert from "node:assert/strict";
import test from "node:test";
import {
  RESIDENTIAL_RELAY_PACK_CANDIDATE, assertResidentialRelayPackStartup, isResidentialRelayPackPurchasable
} from "../services/platform/residential-relay-pack-product.mjs";
import { COIN_COMMERCE_PRODUCTION_PUBLISHED_OFFERS, COIN_COMMERCE_DATA_PACK_CANDIDATES } from "../services/platform/coin-commerce-production-catalog.mjs";
import { buildResidentialPool } from "../services/edge/residential-relay-pool.mjs";
import {
  buildResidentialXrayRelayConfig, buildResidentialSingBoxHy2RelayConfig, residentialClientEndpoint,
  RESIDENTIAL_BALANCER_TAG, RESIDENTIAL_BLOCK_TAG
} from "../services/edge/residential-relay-config.mjs";
import {
  residentialPeriod, accumulateResidentialUsage, evaluateResidentialQuota, parseRelayStats, reconcileResidentialOutbounds
} from "../services/platform/residential-relay-quota.mjs";
import { parseThirdPartyYaml } from "../services/platform/third-party-subscription-yaml.mjs";

const GB = 1024 ** 3;
const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const UP_SS_PW = "synthetic-upstream-ss-pw";
const users = [{ edgeCredentialRef: "edgecred_resi_a", uuid: UUID_A, password: "synthetic-hy2-password-a" },
  { edgeCredentialRef: "edgecred_resi_b", uuid: UUID_B, password: "synthetic-hy2-password-b" }];
const staticPool = () => buildResidentialPool({ staticEntries: [
  { tag: "s1", protocol: "socks", host: "203.0.113.10", port: 1080, username: "u", password: "synthetic-socks-pw" },
  { tag: "s2", protocol: "ss", host: "203.0.113.11", port: 8388, method: "aes-256-gcm", password: UP_SS_PW }] });

test("product is unpublished, priceless, and absent from every catalog", () => {
  const p = RESIDENTIAL_RELAY_PACK_CANDIDATE;
  assert.equal(p.published, false);
  assert.equal(p.baseCoinUnits, null);
  assert.equal(p.periodQuotaBytes, 100 * GB);
  assert.equal(p.periodDays, 30);
  assert.equal(isResidentialRelayPackPurchasable(), false);
  const refs = [...COIN_COMMERCE_PRODUCTION_PUBLISHED_OFFERS, ...COIN_COMMERCE_DATA_PACK_CANDIDATES].map(o => o.offerRef);
  assert.ok(!refs.some(ref => /resi/i.test(ref)));
});

test("startup flag is off by default and fails closed when enabled before decisions", () => {
  assert.deepEqual(assertResidentialRelayPackStartup({}), { enabled: false });
  assert.deepEqual(assertResidentialRelayPackStartup({ enabled: false, dataPackRuntimeEnabled: true }), { enabled: false });
  assert.throws(() => assertResidentialRelayPackStartup({ enabled: true, dataPackRuntimeEnabled: false }), { code: "residential_relay_pack_requires_data_pack_runtime" });
  assert.throws(() => assertResidentialRelayPackStartup({ enabled: true, dataPackRuntimeEnabled: true }), { code: "residential_relay_pack_price_undecided" });
  const priced = { ...RESIDENTIAL_RELAY_PACK_CANDIDATE, baseCoinUnits: 1 };
  assert.throws(() => assertResidentialRelayPackStartup({ enabled: true, dataPackRuntimeEnabled: true, product: priced }), { code: "residential_relay_pack_terms_undecided" });
});

test("pool from third-party YAML keeps only US nodes and rejects reserved/duplicate tags", () => {
  const yaml = [
    "proxies:",
    "  - { name: \"US Residential 1\", type: ss, server: 198.51.100.1, port: 8388, cipher: aes-256-gcm, password: synthetic-a }",
    "  - { name: \"JP 1\", type: ss, server: 198.51.100.2, port: 8388, cipher: aes-256-gcm, password: synthetic-b }"
  ].join("\n") + "\n";
  const { nodes } = parseThirdPartyYaml(yaml);
  const pool = buildResidentialPool({ importedNodes: nodes });
  assert.equal(pool.length, 1);
  assert.equal(pool[0].host, "198.51.100.1");
  assert.match(pool[0].tag, /^resi-us-/);
  assert.throws(() => buildResidentialPool({ importedNodes: nodes.filter(n => n.countryCode !== "US") }), { code: "residential_pool_empty" });
  assert.throws(() => buildResidentialPool({ staticEntries: [{ tag: "pool", protocol: "socks", host: "h", port: 1 }] }), { code: "residential_pool_tag_reserved" });
  assert.throws(() => buildResidentialPool({ staticEntries: [{ tag: "a", protocol: "socks", host: "h", port: 1 }, { tag: "a", protocol: "http", host: "h", port: 2 }] }), { code: "residential_pool_tag_duplicate" });
  assert.throws(() => buildResidentialPool({ staticEntries: [{ protocol: "vmess", host: "h", port: 1 }] }), { code: "residential_pool_protocol_unsupported" });
});

test("xray relay routes only residential users to the pool and never to direct", () => {
  const pool = staticPool();
  const config = buildResidentialXrayRelayConfig({ pool, users, inbound: { port: 443 } });
  const rules = config.routing.rules;
  assert.deepEqual(rules[1], { type: "field", user: ["edgecred_resi_a", "edgecred_resi_b"], ip: ["geoip:private"], outboundTag: RESIDENTIAL_BLOCK_TAG });
  assert.deepEqual(rules[2], { type: "field", user: ["edgecred_resi_a", "edgecred_resi_b"], balancerTag: RESIDENTIAL_BALANCER_TAG });
  assert.deepEqual(rules[3], { type: "field", inboundTag: ["resi-in"], outboundTag: RESIDENTIAL_BLOCK_TAG });
  assert.deepEqual(config.routing.balancers[0].selector, ["resi-us-s1", "resi-us-s2"]);
  const resiIn = config.inbounds.find(i => i.tag === "resi-in");
  assert.deepEqual(resiIn.settings.clients.map(c => [c.email, c.id]), [["edgecred_resi_a", UUID_A], ["edgecred_resi_b", UUID_B]]);
  assert.equal(config.inbounds[0].listen, "127.0.0.1");
  assert.equal(config.policy.levels[0].statsUserUplink, true);
  assert.equal(config.policy.system.statsOutboundDownlink, true);
  assert.deepEqual(config.outbounds.map(o => o.tag), ["direct", "resi-us-s1", "resi-us-s2", "resi-block"]);
  assert.equal(config.outbounds[1].protocol, "socks");
  assert.equal(config.outbounds[2].protocol, "shadowsocks");
});

test("xray relay rejects bad users and Hy2/TUIC pool entries", () => {
  const pool = staticPool();
  assert.throws(() => buildResidentialXrayRelayConfig({ pool, users: [], inbound: { port: 443 } }), { code: "residential_relay_users_empty" });
  assert.throws(() => buildResidentialXrayRelayConfig({ pool, users: [users[0], { ...users[1], uuid: UUID_A }], inbound: { port: 443 } }), { code: "residential_relay_user_duplicate" });
  assert.throws(() => buildResidentialXrayRelayConfig({ pool, users: [{ edgeCredentialRef: "x", uuid: "nope" }], inbound: { port: 443 } }), { code: "residential_relay_user_invalid" });
  const hyPool = buildResidentialPool({ staticEntries: [{ tag: "h", protocol: "hysteria2", host: "h", port: 443, password: "p" }] });
  assert.throws(() => buildResidentialXrayRelayConfig({ pool: hyPool, users, inbound: { port: 443 } }), { code: "residential_pool_protocol_unsupported_xray" });
});

test("sing-box Hy2 relay binds auth_user to the pool with user and outbound stats", () => {
  const pool = staticPool();
  const config = buildResidentialSingBoxHy2RelayConfig({ pool, users, inbound: { port: 8443, tls: { enabled: true } } });
  assert.deepEqual(config.inbounds[0].users.map(u => u.name), ["edgecred_resi_a", "edgecred_resi_b"]);
  assert.deepEqual(config.route.rules[1], { auth_user: ["edgecred_resi_a", "edgecred_resi_b"], outbound: RESIDENTIAL_BALANCER_TAG });
  assert.deepEqual(config.route.rules[2], { inbound: ["resi-in"], outbound: RESIDENTIAL_BLOCK_TAG });
  assert.equal(config.experimental.v2ray_api.listen, "127.0.0.1:10086");
  assert.deepEqual(config.experimental.v2ray_api.stats.outbounds, ["resi-us-s1", "resi-us-s2"]);
  assert.throws(() => buildResidentialSingBoxHy2RelayConfig({ pool, users, inbound: { port: 8443 } }), { code: "residential_relay_inbound_invalid" });
});

test("client endpoint exposes only the relay and the buyer's own credential", () => {
  const relay = { host: "relay.example.test", port: 443 };
  const vless = residentialClientEndpoint({ relay, user: users[0], protocol: "vless" });
  const hy2 = residentialClientEndpoint({ relay, user: users[0], protocol: "hysteria2" });
  for (const out of [vless, hy2]) {
    const json = JSON.stringify(out);
    assert.ok(!json.includes("203.0.113"));
    assert.ok(!json.includes(UP_SS_PW));
    assert.ok(!json.includes(UUID_B));
    assert.equal(out.server, "relay.example.test");
  }
});

test("30-day periods are anchored to activation", () => {
  const anchorAt = "2026-10-01T00:00:00.000Z";
  assert.equal(residentialPeriod({ anchorAt, now: "2026-10-30T23:59:59.999Z" }).index, 0);
  const p1 = residentialPeriod({ anchorAt, now: "2026-10-31T00:00:00.000Z" });
  assert.deepEqual(p1, { index: 1, startAt: "2026-10-31T00:00:00.000Z", endAt: "2026-11-30T00:00:00.000Z" });
  assert.throws(() => residentialPeriod({ anchorAt, now: "2026-09-30T00:00:00Z" }), { code: "residential_quota_time_invalid" });
});

test("usage accumulates, survives relay restarts, resets per period, disables at 100 GB", () => {
  const anchorAt = "2026-10-01T00:00:00.000Z", quotaBytes = 100 * GB, paidThroughAt = "2026-12-01T00:00:00.000Z";
  let s = accumulateResidentialUsage({ state: null, anchorAt, sample: { at: "2026-10-02T00:00:00Z", counterBytes: 5 * GB, runtimeGeneration: "g1" } });
  assert.equal(s.usedBytes, 0, "first observation is a zero-debit baseline");
  s = accumulateResidentialUsage({ state: s, anchorAt, sample: { at: "2026-10-10T00:00:00Z", counterBytes: 65 * GB, runtimeGeneration: "g1" } });
  assert.equal(s.usedBytes, 60 * GB);
  s = accumulateResidentialUsage({ state: s, anchorAt, sample: { at: "2026-10-11T00:00:00Z", counterBytes: 30 * GB, runtimeGeneration: "g2" } });
  assert.equal(s.usedBytes, 90 * GB, "restart: counter restarted at zero");
  assert.throws(() => accumulateResidentialUsage({ state: s, anchorAt, sample: { at: "2026-10-12T00:00:00Z", counterBytes: 1, runtimeGeneration: "g2" } }), { code: "residential_quota_counter_regressed" });
  let q = evaluateResidentialQuota({ anchorAt, now: "2026-10-11T00:00:00Z", quotaBytes, state: s, paidThroughAt });
  assert.equal(q.enabled, true);
  assert.equal(q.remainingBytes, 10 * GB);
  s = accumulateResidentialUsage({ state: s, anchorAt, sample: { at: "2026-10-12T00:00:00Z", counterBytes: 41 * GB, runtimeGeneration: "g2" } });
  q = evaluateResidentialQuota({ anchorAt, now: "2026-10-12T00:00:00Z", quotaBytes, state: s, paidThroughAt });
  assert.deepEqual([q.enabled, q.reason, q.remainingBytes], [false, "quota_exhausted", 0]);
  q = evaluateResidentialQuota({ anchorAt, now: "2026-10-31T00:00:01Z", quotaBytes, state: s, paidThroughAt });
  assert.deepEqual([q.enabled, q.usedBytes, q.period.index], [true, 0, 1], "new period resets quota");
  s = accumulateResidentialUsage({ state: s, anchorAt, sample: { at: "2026-10-31T01:00:00Z", counterBytes: 43 * GB, runtimeGeneration: "g2" } });
  assert.deepEqual([s.periodIndex, s.usedBytes], [1, 2 * GB]);
  q = evaluateResidentialQuota({ anchorAt, now: "2026-12-01T00:00:00Z", quotaBytes, state: s, paidThroughAt });
  assert.deepEqual([q.enabled, q.reason], [false, "period_unpaid"]);
});

test("relay stats parse per user and per outbound tag and reconcile against upstream", () => {
  const stats = parseRelayStats({ stat: [
    { name: "user>>>edgecred_resi_a>>>traffic>>>uplink", value: 100 },
    { name: "user>>>edgecred_resi_a>>>traffic>>>downlink", value: 900 },
    { name: "outbound>>>resi-us-s1>>>traffic>>>uplink", value: 50 },
    { name: "outbound>>>resi-us-s1>>>traffic>>>downlink", value: 950 },
    { name: "outbound>>>resi-us-s2>>>traffic>>>downlink", value: 10 },
    { name: "inbound>>>resi-in>>>traffic>>>uplink", value: 7 },
    { name: "outbound>>>direct>>>traffic>>>uplink" }
  ] });
  assert.deepEqual(stats.users.get("edgecred_resi_a"), { uplink: 100, downlink: 900 });
  assert.deepEqual(stats.outbounds.get("resi-us-s1"), { uplink: 50, downlink: 950 });
  const rows = reconcileResidentialOutbounds({ outbounds: stats.outbounds, upstreamBytesByTag: { "resi-us-s1": 1030 } });
  assert.deepEqual(rows.find(r => r.tag === "resi-us-s1"), { tag: "resi-us-s1", localBytes: 1000, upstreamBytes: 1030, diffBytes: 30, withinTolerance: true });
  assert.equal(rows.find(r => r.tag === "resi-us-s2").withinTolerance, false);
  assert.throws(() => parseRelayStats({}), { code: "residential_stats_invalid" });
  assert.throws(() => parseRelayStats({ stat: [{ name: "user>>>a>>>traffic>>>uplink", value: -1 }] }), { code: "residential_stats_invalid" });
});
