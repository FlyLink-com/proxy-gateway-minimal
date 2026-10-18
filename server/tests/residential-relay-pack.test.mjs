import assert from "node:assert/strict";
import test from "node:test";
import {
  RESIDENTIAL_RELAY_PACK_TERMS, RESIDENTIAL_RELAY_SKU_SIZE_CODES, assertResidentialRelayPackStartup,
  isResidentialRelaySkuPurchasable, assertResidentialRelaySkuInput
} from "../services/platform/residential-relay-pack-product.mjs";
import { COIN_COMMERCE_PRODUCTION_PUBLISHED_OFFERS, COIN_COMMERCE_DATA_PACK_CANDIDATES } from "../services/platform/coin-commerce-production-catalog.mjs";
import { buildResidentialPool } from "../services/edge/residential-relay-pool.mjs";
import {
  buildResidentialXrayRelayConfig, buildResidentialSingBoxHy2RelayConfig, residentialClientEndpoint, RESIDENTIAL_BLOCK_TAG
} from "../services/edge/residential-relay-config.mjs";
import {
  residentialPeriod, accumulateResidentialUsage, evaluateResidentialQuota, parseRelayStats, reconcileResidentialOutbounds
} from "../services/platform/residential-relay-quota.mjs";
import { parseThirdPartyYaml } from "../services/platform/third-party-subscription-yaml.mjs";

const GB = 1024 ** 3;
const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const UUID_C = "33333333-3333-4333-8333-333333333333";
const UP_SS_PW = "synthetic-upstream-ss-pw";
const userA = { edgeCredentialRef: "edgecred_resi_a", uuid: UUID_A, password: "synthetic-hy2-password-a" };
const userB = { edgeCredentialRef: "edgecred_resi_b", uuid: UUID_B, password: "synthetic-hy2-password-b" };
const userC = { edgeCredentialRef: "edgecred_resi_c", uuid: UUID_C, password: "synthetic-hy2-password-c" };
const pool100 = () => buildResidentialPool({ staticEntries: [
  { tag: "s1", protocol: "socks", host: "203.0.113.10", port: 1080, username: "u", password: "synthetic-socks-pw" },
  { tag: "s2", protocol: "ss", host: "203.0.113.11", port: 8388, method: "aes-256-gcm", password: UP_SS_PW }] });
const pool500 = () => buildResidentialPool({ staticEntries: [
  { tag: "t1", protocol: "ss", host: "203.0.113.20", port: 8388, method: "aes-256-gcm", password: "synthetic-500" }] });
const sku = (patch = {}) => ({ id: "rrsku_x", sizeCode: "100G", buyerProtocol: "vless", baseCoinUnits: 30, durationDays: 30,
  quotaBytes: 100 * GB, enabled: true, enabledUpstreamCount: 2, ...patch });

test("terms are locked: no refunds, no rollover, no renewals, no grace", () => {
  assert.deepEqual({ ...RESIDENTIAL_RELAY_PACK_TERMS }, { refunds: false, unusedByteRollover: false, renewals: false, autoRenew: false, gracePeriod: false });
  assert.deepEqual([...RESIDENTIAL_RELAY_SKU_SIZE_CODES], ["100G", "200G", "500G", "1TB"]);
});

test("SKU is sellable only with price, duration, quota, buyer protocol and an enabled upstream", () => {
  assert.equal(isResidentialRelaySkuPurchasable(sku()), true);
  for (const patch of [{ enabled: false }, { baseCoinUnits: null }, { baseCoinUnits: 0 }, { durationDays: 0 },
    { quotaBytes: 0 }, { enabledUpstreamCount: 0 }, { buyerProtocol: "tuic" }, { sizeCode: "300G" }]) {
    assert.equal(isResidentialRelaySkuPurchasable(sku(patch)), false, JSON.stringify(patch));
  }
  assert.throws(() => assertResidentialRelaySkuInput({ ...sku(), baseCoinUnits: null }), { code: "invalid_price" });
  assert.throws(() => assertResidentialRelaySkuInput({ ...sku(), sizeCode: "2TB" }), { code: "invalid_sku_size" });
  const refs = [...COIN_COMMERCE_PRODUCTION_PUBLISHED_OFFERS, ...COIN_COMMERCE_DATA_PACK_CANDIDATES].map(o => o.offerRef);
  assert.ok(!refs.some(ref => /resi/i.test(ref)));
});

test("startup flag defaults off", () => {
  assert.deepEqual(assertResidentialRelayPackStartup({}), { enabled: false });
  assert.deepEqual(assertResidentialRelayPackStartup({ enabled: true }), { enabled: true });
});

test("pool from third-party YAML; reserved and duplicate tags rejected", () => {
  const yaml = "proxies:\n  - { name: \"US Residential 1\", type: ss, server: 198.51.100.1, port: 8388, cipher: aes-256-gcm, password: synthetic-a }\n"
    + "  - { name: \"JP 1\", type: ss, server: 198.51.100.2, port: 8388, cipher: aes-256-gcm, password: synthetic-b }\n";
  const { nodes } = parseThirdPartyYaml(yaml);
  assert.equal(buildResidentialPool({ importedNodes: nodes }).length, 1);
  assert.equal(buildResidentialPool({ importedNodes: nodes, requireCountry: null }).length, 2);
  assert.throws(() => buildResidentialPool({ staticEntries: [{ tag: "pool-x", protocol: "socks", host: "h", port: 1 }] }), { code: "residential_pool_tag_reserved" });
  assert.throws(() => buildResidentialPool({ staticEntries: [{ tag: "a", protocol: "socks", host: "h", port: 1 }, { tag: "a", protocol: "http", host: "h", port: 2 }] }), { code: "residential_pool_tag_duplicate" });
});

test("xray: each SKU's buyers route only to that SKU's bound upstreams, never direct", () => {
  const config = buildResidentialXrayRelayConfig({ inbound: { port: 443 }, groups: [
    { groupId: "100g", users: [userA, userB], pool: pool100() },
    { groupId: "500g", users: [userC], pool: pool500() }] });
  const rules = config.routing.rules;
  assert.deepEqual(rules[2], { type: "field", user: ["edgecred_resi_a", "edgecred_resi_b"], balancerTag: "resi-us-pool-100g" });
  assert.deepEqual(rules[3], { type: "field", user: ["edgecred_resi_c"], balancerTag: "resi-us-pool-500g" });
  assert.deepEqual(rules.at(-1), { type: "field", inboundTag: ["resi-in"], outboundTag: RESIDENTIAL_BLOCK_TAG });
  assert.deepEqual(config.routing.balancers.map(b => [b.tag, b.selector]),
    [["resi-us-pool-100g", ["resi-us-s1", "resi-us-s2"]], ["resi-us-pool-500g", ["resi-us-t1"]]]);
  assert.equal(config.inbounds[0].listen, "127.0.0.1");
  assert.equal(config.policy.system.statsOutboundDownlink, true);
  assert.throws(() => buildResidentialXrayRelayConfig({ inbound: { port: 443 }, groups: [
    { groupId: "a", users: [userA], pool: pool100() }, { groupId: "b", users: [userA], pool: pool500() }] }), { code: "residential_relay_user_duplicate" });
  assert.throws(() => buildResidentialXrayRelayConfig({ inbound: { port: 443 }, groups: [
    { groupId: "a", users: [userA], pool: pool100() }, { groupId: "b", users: [userB], pool: pool100() }] }), { code: "residential_pool_tag_duplicate" });
  const hy = buildResidentialPool({ staticEntries: [{ tag: "h", protocol: "hysteria2", host: "h", port: 443, password: "p" }] });
  assert.throws(() => buildResidentialXrayRelayConfig({ inbound: { port: 443 }, groups: [{ groupId: "a", users: [userA], pool: hy }] }), { code: "residential_pool_protocol_unsupported_xray" });
});

test("sing-box Hy2: auth_user bound per SKU group with user and outbound stats", () => {
  const config = buildResidentialSingBoxHy2RelayConfig({ inbound: { port: 8443, tls: { enabled: true } }, groups: [
    { groupId: "100g", users: [userA], pool: pool100() }, { groupId: "1tb", users: [userB], pool: pool500() }] });
  assert.deepEqual(config.route.rules[1], { auth_user: ["edgecred_resi_a"], outbound: "resi-us-pool-100g" });
  assert.deepEqual(config.route.rules[2], { auth_user: ["edgecred_resi_b"], outbound: "resi-us-pool-1tb" });
  assert.deepEqual(config.experimental.v2ray_api.stats.outbounds, ["resi-us-s1", "resi-us-s2", "resi-us-t1"]);
});

test("client endpoint exposes only the relay and the buyer's own credential", () => {
  const relay = { host: "relay.example.test", port: 443 };
  for (const protocol of ["vless", "hysteria2"]) {
    const json = JSON.stringify(residentialClientEndpoint({ relay, user: userA, protocol }));
    assert.ok(!json.includes("203.0.113") && !json.includes(UP_SS_PW) && !json.includes(UUID_B));
  }
});

test("one-shot period: ends after durationDays with no renewal or grace", () => {
  const anchorAt = "2026-10-01T00:00:00.000Z";
  const p = residentialPeriod({ anchorAt, now: "2026-10-05T00:00:00Z", durationDays: 7 });
  assert.deepEqual(p, { index: 0, startAt: anchorAt, endAt: "2026-10-08T00:00:00.000Z", ended: false });
  const q = evaluateResidentialQuota({ anchorAt, now: "2026-10-08T00:00:00Z", durationDays: 7, quotaBytes: GB, state: { usedBytes: 1 } });
  assert.deepEqual([q.enabled, q.reason, q.remainingBytes], [false, "period_ended", 0]);
});

test("usage survives relay restarts, never rolls over, disables at quota", () => {
  const anchorAt = "2026-10-01T00:00:00.000Z", quotaBytes = 100 * GB, durationDays = 30;
  let s = accumulateResidentialUsage({ state: null, sample: { counterBytes: 5 * GB, runtimeGeneration: "g1" } });
  assert.equal(s.usedBytes, 0);
  s = accumulateResidentialUsage({ state: s, sample: { counterBytes: 65 * GB, runtimeGeneration: "g1" } });
  s = accumulateResidentialUsage({ state: s, sample: { counterBytes: 30 * GB, runtimeGeneration: "g2" } });
  assert.equal(s.usedBytes, 90 * GB);
  assert.throws(() => accumulateResidentialUsage({ state: s, sample: { counterBytes: 1, runtimeGeneration: "g2" } }), { code: "residential_quota_counter_regressed" });
  let q = evaluateResidentialQuota({ anchorAt, now: "2026-10-11T00:00:00Z", quotaBytes, durationDays, state: s });
  assert.deepEqual([q.enabled, q.remainingBytes], [true, 10 * GB]);
  s = accumulateResidentialUsage({ state: s, sample: { counterBytes: 41 * GB, runtimeGeneration: "g2" } });
  q = evaluateResidentialQuota({ anchorAt, now: "2026-10-12T00:00:00Z", quotaBytes, durationDays, state: s });
  assert.deepEqual([q.enabled, q.reason], [false, "quota_exhausted"]);
  q = evaluateResidentialQuota({ anchorAt, now: "2026-11-05T00:00:00Z", quotaBytes, durationDays, state: { usedBytes: 0 } });
  assert.deepEqual([q.enabled, q.reason], [false, "period_ended"], "no new period after the end");
});

test("relay stats parse and reconcile per outbound tag", () => {
  const stats = parseRelayStats({ stat: [
    { name: "user>>>edgecred_resi_a>>>traffic>>>uplink", value: 100 },
    { name: "outbound>>>resi-us-s1>>>traffic>>>uplink", value: 50 },
    { name: "outbound>>>resi-us-s1>>>traffic>>>downlink", value: 950 },
    { name: "outbound>>>resi-us-s2>>>traffic>>>downlink", value: 10 }] });
  const rows = reconcileResidentialOutbounds({ outbounds: stats.outbounds, upstreamBytesByTag: { "resi-us-s1": 1030 } });
  assert.equal(rows.find(r => r.tag === "resi-us-s1").withinTolerance, true);
  assert.equal(rows.find(r => r.tag === "resi-us-s2").withinTolerance, false);
  assert.throws(() => parseRelayStats({}), { code: "residential_stats_invalid" });
});
