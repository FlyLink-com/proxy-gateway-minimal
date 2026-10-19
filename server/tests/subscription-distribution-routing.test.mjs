import assert from "node:assert/strict";
import test from "node:test";
import { parse } from "yaml";
import {
  DISTRIBUTION_CLIENT_ROUTING,
  rotateSubscriptionDistributionServers
} from "../services/subscription-distribution-routing.mjs";
import {
  generateClashSubscription,
  generateClashProviderSubscription,
  generateClashProxyProvider,
  generateMihomoRenderTemplate,
  generateMihomoProviderTemplate
} from "../services/clash-subscription.mjs";

const AT = "2026-10-19T00:00:00.000Z";
const planId = "monthly_basic";
const TEST_URL = "https://www.gstatic.com/generate_204";
const id = number => `tpnode_${number.toString(16).padStart(32, "0")}`;
function node(number, overrides = {}) {
  return { id: id(number), name: `synthetic-internal-${number}`, subscriptionDisplayName: `Synthetic ${number}`,
    protocol: "ss", host: `203.0.113.${number}`, port: 8388, cipher: "aes-256-gcm", password: "synthetic-only",
    thirdParty: true, autoEligible: false, countryCode: number % 2 ? "JP" : "SG", ...overrides };
}
function managed(servers = [node(1), node(2), node(3)]) {
  return { servers, [DISTRIBUTION_CLIENT_ROUTING]: true };
}
function assertGroupReferences(document) {
  const proxies = document.proxies;
  const groups = document["proxy-groups"];
  const names = [...proxies, ...groups].map(value => value.name);
  assert.equal(new Set(names).size, names.length);
  const existing = new Set(names);
  for (const group of groups) {
    assert.ok(group.proxies.length > 0);
    for (const target of group.proxies) {
      assert.ok(existing.has(target), `${group.name} must not reference a missing/native/direct target`);
      assert.notEqual(group.name, target);
    }
  }
}

test("daily ordering is deterministic for a UTC day, independent of incoming order, and does not mutate nodes", () => {
  const servers = Object.freeze([Object.freeze(node(3)), Object.freeze(node(1)), Object.freeze(node(2))]);
  const before = JSON.stringify(servers);
  const first = rotateSubscriptionDistributionServers(servers, { planId, at: AT });
  const later = rotateSubscriptionDistributionServers([...servers].reverse(), { planId, at: "2026-10-19T23:59:59.999Z" });
  assert.deepEqual(first.map(value => value.id), later.map(value => value.id));
  assert.notEqual(first, servers);
  assert.equal(JSON.stringify(servers), before);
  for (const current of first) assert.equal(current, servers.find(value => value.id === current.id));
});

test("next UTC day rotates the same stable membership once and preserves display labels", () => {
  const servers = [node(3), node(1), node(2)];
  const before = rotateSubscriptionDistributionServers(servers, { planId, at: "2026-10-19T23:59:59.999Z" });
  const after = rotateSubscriptionDistributionServers(servers, { planId, at: "2026-10-20T00:00:00.000Z" });
  assert.deepEqual(after.map(value => value.id), [...before.slice(1), before[0]].map(value => value.id));
  for (const current of after) assert.equal(current.subscriptionDisplayName, servers.find(value => value.id === current.id).subscriptionDisplayName);
});

test("UTC day uses the instant, not the textual timezone; numeric and Date instants match", () => {
  const servers = [node(1), node(2), node(3)];
  const expected = rotateSubscriptionDistributionServers(servers, { planId, at: "2026-10-20T00:00:00.000Z" });
  for (const at of ["2026-10-19T17:00:00-07:00", new Date("2026-10-20T00:00:00.000Z"), Date.parse("2026-10-20T00:00:00.000Z")]) {
    assert.deepEqual(rotateSubscriptionDistributionServers(servers, { planId, at }), expected);
  }
});

test("single-node pool stays valid and pre-epoch UTC instants do not drop members", () => {
  const servers = [node(1)];
  assert.deepEqual(rotateSubscriptionDistributionServers(servers, { planId, at: AT }), servers);
  const beforeEpoch = rotateSubscriptionDistributionServers([node(1), node(2), node(3)], { planId, at: "1969-12-31T23:59:59.999Z" });
  assert.equal(beforeEpoch.length, 3);
  assert.equal(new Set(beforeEpoch.map(value => value.id)).size, 3);
});

test("all supported tiers accept the full bounded pool and cycle every member through first priority", () => {
  for (const supportedPlan of ["monthly_basic", "monthly_plus", "yearly"]) {
    const pool = Array.from({ length: 256 }, (_, index) => node(index + 1));
    const ordered = rotateSubscriptionDistributionServers(pool, { planId: supportedPlan, at: AT });
    assert.equal(ordered.length, 256);
    assert.equal(new Set(ordered.map(value => value.id)).size, 256);
  }
  const pool = [node(1), node(2), node(3)];
  const firstIds = [19, 20, 21].map(day => rotateSubscriptionDistributionServers(pool, { planId, at: `2026-10-${day}T00:00:00Z` })[0].id);
  assert.equal(new Set(firstIds).size, pool.length);
});

for (const invalidPlan of [undefined, "", "monthly", "MONTHLY_BASIC", {}, 1]) {
  test(`rotation rejects unsupported plan ${JSON.stringify(invalidPlan)}`, () => {
    assert.throws(() => rotateSubscriptionDistributionServers([node(1)], { planId: invalidPlan, at: AT }), { code: "invalid_subscription_distribution_rotation" });
  });
}
for (const invalidAt of [undefined, null, "", "not-a-date", NaN, Infinity, new Date(NaN), {}]) {
  test(`rotation rejects invalid instant ${String(invalidAt)}`, () => {
    assert.throws(() => rotateSubscriptionDistributionServers([node(1)], { planId, at: invalidAt }), { code: "invalid_subscription_distribution_rotation" });
  });
}
for (const [label, servers] of [
  ["empty", []], ["non-array", {}], ["duplicate IDs", [node(1), node(1)]],
  ["foreign ID", [node(1, { id: "ownnode_" + "1".repeat(32) })]],
  ["missing ID", [node(1, { id: undefined })]], ["native member", [node(1, { thirdParty: false })]],
  ["oversized", Array.from({ length: 257 }, (_, index) => node(index + 1))]
]) {
  test(`rotation rejects ${label} pool`, () => {
    assert.throws(() => rotateSubscriptionDistributionServers(servers, { planId, at: AT }), { code: "invalid_subscription_distribution_rotation" });
  });
}

const RENDERERS = [
  ["Clash", generateClashSubscription], ["Mihomo", generateMihomoRenderTemplate],
  ["Clash provider profile", generateClashProviderSubscription], ["Mihomo provider profile", generateMihomoProviderTemplate]
];
for (const [label, render] of RENDERERS) {
  test(`${label}: trusted all-third-party pool adds automatic fastest and priority fallback groups`, () => {
    const config = managed();
    const document = parse(render(config));
    assertGroupReferences(document);
    const groups = document["proxy-groups"];
    const auto = groups.find(value => value.name === "3P-AUTO");
    const fallback = groups.find(value => value.name === "3P-FALLBACK");
    assert.equal(auto.type, "url-test");
    assert.equal(fallback.type, "fallback");
    for (const group of [auto, fallback]) {
      assert.deepEqual(group.proxies, config.servers.map(value => value.subscriptionDisplayName));
      assert.equal(group.url, TEST_URL);
      assert.equal(group.interval, 300);
      assert.equal(group.proxies.includes("DIRECT"), false);
    }
    assert.equal(groups.find(value => value.name === "GLOBAL").proxies[0], auto.name);
    assert.ok(groups.find(value => value.name === "GLOBAL").proxies.includes(fallback.name));
    assert.ok(groups.find(value => value.name === "3P-JP"));
    assert.ok(groups.find(value => value.name === "3P-SG"));
    assert.equal(groups.some(value => ["AUTO", "STABLE", "FALLBACK", "WEAK-NETWORK"].includes(value.name)), false);
    const yaml = render(config);
    assert.equal(yaml.includes("tpnode_"), false);
    assert.equal(yaml.includes("DISTRIBUTION_CLIENT_ROUTING"), false);
  });

  test(`${label}: generated pool groups avoid existing display names and leave all references valid`, () => {
    const config = managed([
      node(1, { subscriptionDisplayName: "3P-AUTO" }),
      node(2, { subscriptionDisplayName: "3P-AUTO-2" }),
      node(3, { subscriptionDisplayName: "3P-FALLBACK" }),
      node(4, { subscriptionDisplayName: "3P-FALLBACK-2" }),
      node(5, { subscriptionDisplayName: "3P-JP" })
    ]);
    const document = parse(render(config));
    assertGroupReferences(document);
    assert.equal(document["proxy-groups"].find(value => value.name === "GLOBAL").proxies[0], "3P-AUTO-3");
    assert.equal(document["proxy-groups"].find(value => value.name === "3P-FALLBACK-3").type, "fallback");
  });

  test(`${label}: a string property or non-true Symbol cannot turn automatic routing on`, () => {
    const legacy = { servers: [node(1), node(2)] };
    const expected = render(legacy);
    for (const value of [false, "true", 1, null]) assert.equal(render({ ...legacy, [DISTRIBUTION_CLIENT_ROUTING]: value }), expected);
    assert.equal(render({ ...legacy, DISTRIBUTION_CLIENT_ROUTING: true, distributionClientRouting: true }), expected);
    assert.equal(render(JSON.parse(JSON.stringify(managed(legacy.servers)))), expected);
  });

  test(`${label}: client pool checks cannot inherit an arbitrary URL or timing from provider options`, () => {
    const document = parse(render(managed(), { healthCheckUrl: "http://127.0.0.1/private", healthCheckInterval: 1 }));
    for (const name of ["3P-AUTO", "3P-FALLBACK"]) {
      const group = document["proxy-groups"].find(value => value.name === name);
      assert.equal(group.url, TEST_URL);
      assert.equal(group.interval, 300);
    }
  });

  test(`${label}: trusted Symbol does not alter owned-only or mixed output`, () => {
    const native = node(3, { thirdParty: false, subscriptionDisplayName: "Native", autoEligible: true });
    for (const servers of [[native], [native, node(1)]]) {
      const options = { providerUrl: "https://synthetic.example.invalid/provider" };
      assert.equal(render(managed(servers), options), render({ servers }, options));
    }
    // A native member filtered by the renderer must not accidentally turn a
    // mixed source configuration into an authorized all-third-party pool.
    const partlyInvalidMixed = [node(1), { ...native, host: undefined }];
    assert.equal(render(managed(partlyInvalidMixed)), render({ servers: partlyInvalidMixed }));
  });
}

test("raw proxy-provider fragments remain proxies-only even with trusted routing metadata", () => {
  const config = managed();
  const rendered = parse(generateClashProxyProvider(config));
  assert.deepEqual(Object.keys(rendered), ["proxies"]);
  assert.equal(rendered.proxies.length, 3);
  assert.equal(generateClashProxyProvider(config), generateClashProxyProvider({ servers: config.servers }));
});
