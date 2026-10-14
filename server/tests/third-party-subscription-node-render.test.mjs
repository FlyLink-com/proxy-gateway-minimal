import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { parse } from "yaml";
import { createPortalTotpSecretProtector } from "../services/platform/portal-totp-verifier.mjs";
import {
  REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM,
  REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
  applyThirdPartySubscriptionMigrations
} from "../services/platform/third-party-subscription-migrations.mjs";
import { createSqliteThirdPartySubscriptionStore } from "../services/platform/third-party-subscription-store.mjs";
import { decorateThirdPartyServers, THIRD_PARTY_NAME_INDEX } from "../services/platform/third-party-subscription-render.mjs";
import { validateProxyDisplayNames } from "../services/proxy-display-name.mjs";
import { generateClashSubscription } from "../services/clash-subscription.mjs";

const node = (alias) => ({
  name: "upstream-original", displayName: "upstream-original", countryCode: "JP",
  thirdPartyDisplayAlias: alias, host: "192.0.2.1", port: 8388,
  protocol: "ss", method: "aes-256-gcm", password: "synthetic-only"
});

test("reserved naming slots accept only trusted positive integers and never escape the decorator", () => {
  for (const invalid of [undefined, null, false, 0, -1, 1.5, "4", {}, Number.MAX_SAFE_INTEGER + 1]) {
    const result = decorateThirdPartyServers([{ ...node(null), thirdPartyNameIndex: 9, [THIRD_PARTY_NAME_INDEX]: invalid }])[0];
    assert.equal(result.subscriptionDisplayName, "[3P] JP 1 | upstream-original");
    assert.equal(Object.hasOwn(result, "thirdPartyNameIndex"), false);
    assert.deepEqual(Object.getOwnPropertySymbols(result), []);
  }
  const result = decorateThirdPartyServers([{ ...node(null), [THIRD_PARTY_NAME_INDEX]: 4 }, node(null)]);
  assert.deepEqual(result.map(server => server.subscriptionDisplayName), ["[3P] JP 4 | upstream-original", "[3P] JP 5 | upstream-original"]);
});

test("explicit country overrides replace leading flags for aliases and default names only", () => {
  for (const alias of ["🇯🇵 🇺🇸 Tokyo", undefined]) {
    const input = { ...node(alias), name: "🇯🇵 🇺🇸 Tokyo", displayName: "🇯🇵 🇺🇸 Tokyo", thirdPartyCountryOverride: "SG" };
    const result = decorateThirdPartyServers([input])[0];
    assert.equal(result.countryCode, "JP");
    assert.equal(result.subscriptionDisplayName, alias ? "🇸🇬 Tokyo" : "🇸🇬 [3P] JP 1 | Tokyo");
    assert.equal(result.name, input.name);
    const without = decorateThirdPartyServers([{ ...input, thirdPartyCountryOverride: "OTHER" }])[0];
    assert.equal(without.subscriptionDisplayName, alias ? "Tokyo" : "[3P] JP 1 | Tokyo");
    const legacy = { ...input }; delete legacy.thirdPartyCountryOverride;
    assert.equal(decorateThirdPartyServers([legacy])[0].subscriptionDisplayName,
      alias ? alias : "[3P] JP 1 | 🇯🇵 🇺🇸 Tokyo");
  }
});

test("flagged long aliases stay well formed and uniquely suffixed within 128 UTF16 units", () => {
  const alias = `x${"😀".repeat(63)}y`;
  const nodes = Array.from({ length: 3 }, () => ({ ...node(alias), thirdPartyCountryOverride: "US" }));
  const result = decorateThirdPartyServers(nodes);
  assert.equal(new Set(result.map(item => item.subscriptionDisplayName)).size, 3);
  assert.equal(result[1].subscriptionDisplayName.endsWith("~2"), true);
  assert.equal(result[2].subscriptionDisplayName.endsWith("~3"), true);
  for (const item of result) {
    assert.ok(item.subscriptionDisplayName.startsWith("🇺🇸 "));
    assert.ok(item.subscriptionDisplayName.length <= 128 && item.subscriptionDisplayName.isWellFormed());
  }
  validateProxyDisplayNames(result);
  const rendered = parse(generateClashSubscription({ servers: result, pingHosts: [], nginx: {} }));
  assert.deepEqual(rendered.proxies.map(proxy => proxy.name), result.map(item => item.subscriptionDisplayName));
  assert.deepEqual(rendered["proxy-groups"].find(group => group.name === "3P-JP").proxies, result.map(item => item.subscriptionDisplayName));
});

test("flagged aliases remove truncation whitespace before collision checks and final rendering", () => {
  const nodes = [`${"x".repeat(122)} y`, "x".repeat(122)].map(alias => ({ ...node(alias), thirdPartyCountryOverride: "US" }));
  const result = decorateThirdPartyServers(nodes);
  assert.equal(result[0].subscriptionDisplayName, `🇺🇸 ${"x".repeat(122)}`);
  assert.ok(result[1].subscriptionDisplayName.endsWith("~2"));
  for (const item of result) assert.equal(item.subscriptionDisplayName, item.subscriptionDisplayName.trim());
  validateProxyDisplayNames(result);
  const rendered = parse(generateClashSubscription({ servers: result, pingHosts: [], nginx: {} }));
  assert.deepEqual(rendered.proxies.map(proxy => proxy.name), result.map(item => item.subscriptionDisplayName));
});

test("managed alias changes only the subscription label, not upstream identity or credentials", () => {
  const input = node("日本-精选 01");
  const result = decorateThirdPartyServers([input])[0];
  assert.equal(result.subscriptionDisplayName, "日本-精选 01");
  for (const key of ["name", "displayName", "host", "port", "protocol", "method", "password"]) {
    assert.equal(result[key], input[key]);
  }
  assert.equal(result.thirdParty, true);
  assert.equal(result.autoEligible, false);
  assert.equal(result.qualityClass, "");
});

test("managed aliases cannot shadow own nodes or other sources, ignoring case", () => {
  const own = [{ name: "JP-SERVICE" }];
  const rendered = decorateThirdPartyServers([node("jp-service"), node("JP-SERVICE")], own);
  assert.deepEqual(rendered.map((item) => item.subscriptionDisplayName), ["jp-service~2", "JP-SERVICE~3"]);
  validateProxyDisplayNames([...own, ...rendered]);
});

test("invalid stored aliases fail closed to the normal third-party label", () => {
  for (const alias of ["DIRECT", "auto", "  REJECT  ", "bad\nname", "bad\u202ename", "x".repeat(129), "bad\ud800", {}, 12]) {
    const rendered = decorateThirdPartyServers([node(alias)]);
    assert.equal(rendered[0].subscriptionDisplayName, "[3P] JP 1 | upstream-original");
    validateProxyDisplayNames(rendered);
  }
});

test("collision suffix does not split a surrogate pair in a valid 128-unit alias", () => {
  const alias = `x${"😀".repeat(63)}y`;
  assert.equal(alias.length, 128);
  const rendered = decorateThirdPartyServers([node(alias), node(alias)]);
  assert.equal(rendered[1].subscriptionDisplayName, `x${"😀".repeat(62)}~2`);
  assert.ok(rendered.every((item) => item.subscriptionDisplayName.isWellFormed()));
  validateProxyDisplayNames(rendered);
});

test("empty aliases preserve default naming and collision suffixes remain within 128 units", () => {
  assert.equal(decorateThirdPartyServers([node(null)])[0].subscriptionDisplayName, "[3P] JP 1 | upstream-original");
  const alias = "x".repeat(128);
  const rendered = decorateThirdPartyServers([node(alias), node(alias)]);
  assert.equal(rendered[0].subscriptionDisplayName, alias);
  assert.equal(rendered[1].subscriptionDisplayName, `${"x".repeat(126)}~2`);
  validateProxyDisplayNames(rendered);
});

test("saved rename and logical deletion survive reopening and only publish after explicit enable", () => {
  const database = new Database(":memory:");
  try {
    applyThirdPartySubscriptionMigrations({ database,
      expectedMigrationId: REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
      expectedDdlChecksum: REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM });
    const secretProtector = createPortalTotpSecretProtector({ key: "11".repeat(32) });
    const options = { database, secretProtector, nowFn: () => new Date("2026-10-13T00:00:00Z") };
    const store = createSqliteThirdPartySubscriptionStore(options);
    const yamlContent = ["proxies:", ...[1, 2].flatMap((index) => [
      `  - name: JP-${index}`, "    type: ss", `    server: 192.0.2.${index}`,
      "    port: 8388", "    cipher: aes-256-gcm", "    password: synthetic-only"
    ])].join("\n");
    const source = store.createInlineSource({ name: "synthetic source", yamlContent, tiers: ["monthly_basic"] });
    const listing = store.listSourceNodes(source.id);
    const before = database.prepare("select id, fingerprint, protected_config from platform_third_party_nodes where id = ?").get(listing.items[0].id);
    const original = JSON.parse(secretProtector.unprotect(before.protected_config));
    const saved = store.saveSourceNodes(source.id, {
      revision: listing.revision, nodes: [{ id: listing.items[0].id, customName: "日本-精选" }]
    });
    assert.deepEqual(store.listActiveServersForPlan("monthly_basic"), []);
    const reopened = createSqliteThirdPartySubscriptionStore(options);
    assert.equal(reopened.listSourceNodes(source.id).items[0].customName, "日本-精选");
    reopened.enableSourceNodes(source.id, { revision: saved.revision });
    const active = reopened.listActiveServersForPlan("monthly_basic");
    assert.equal(active.length, 1);
    assert.equal(active[0].name, original.name);
    assert.equal(active[0].password, original.password);
    assert.equal(active[0].thirdPartyDisplayAlias, "日本-精选");
    assert.equal(Object.hasOwn(active[0], "adminDisplayName"), false);
    assert.equal(decorateThirdPartyServers(active)[0].subscriptionDisplayName, "日本-精选");
    const own = { ...node(null), name: "own-node", thirdPartyDisplayAlias: undefined };
    const document = parse(generateClashSubscription({
      servers: [own, ...decorateThirdPartyServers(active, [own])], pingHosts: [], nginx: {}
    }));
    assert.deepEqual(document.proxies.map((proxy) => proxy.name), ["own-node", "日本-精选"]);
    const countryGroup = document["proxy-groups"].find((group) => group.name === "3P-JP");
    assert.deepEqual(countryGroup.proxies, ["日本-精选"]);
    assert.equal(document["proxy-groups"].find((group) => group.name === "AUTO").proxies.includes("日本-精选"), false);
    assert.deepEqual(reopened.listActiveServersForPlan("yearly"), []);
    const rows = database.prepare("select id, fingerprint, active from platform_third_party_nodes").all();
    assert.equal(rows.length, 2);
    assert.equal(rows.filter((row) => row.active === 0).length, 1);
    assert.equal(rows.find((row) => row.id === before.id).fingerprint, before.fingerprint);
  } finally { database.close(); }
});

test("single-node lifecycle keeps other default labels stable and renders only enabled survivors", (t) => {
  const database = new Database(":memory:");
  t.after(() => database.close());
  applyThirdPartySubscriptionMigrations({ database,
    expectedMigrationId: REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
    expectedDdlChecksum: REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM });
  const secretProtector = createPortalTotpSecretProtector({ key: "22".repeat(32) });
  const store = createSqliteThirdPartySubscriptionStore({ database, secretProtector });
  const source = store.createInlineSource({ name: "synthetic", enabled: true, tiers: ["monthly_basic"],
    yamlContent: `proxies:\n${[1, 2, 3].map(index => `  - {name: JP-${index}, type: ss, server: 192.0.2.${index}, port: 8388, cipher: aes-256-gcm, password: synthetic-only}`).join("\n")}` });
  const render = () => {
    const servers = decorateThirdPartyServers(store.listActiveServersForPlan("monthly_basic"));
    assert.ok(servers.every(server => !Object.hasOwn(server, "adminDisabled") && !Object.hasOwn(server, "thirdPartyNameIndex")));
    assert.ok(servers.every(server => Object.getOwnPropertySymbols(server).length === 0));
    return parse(generateClashSubscription({ servers, pingHosts: [], nginx: {} }));
  };
  const original = render();
  let view = store.listSourceNodes(source.id);
  const target = view.items[0].id;
  const expected = original.proxies.slice(1);
  view = store.setSourceNodeEnabled(source.id, target, { revision: view.revision, enabled: false });
  assert.deepEqual(render().proxies, expected);
  view = store.setSourceNodeEnabled(source.id, target, { revision: view.revision, enabled: true });
  assert.deepEqual(render().proxies, original.proxies);
  view = store.setSourceNodeEnabled(source.id, target, { revision: view.revision, enabled: false });
  store.deleteSourceNode(source.id, target, { revision: view.revision });
  const document = render();
  assert.deepEqual(document.proxies, expected);
  assert.deepEqual(document["proxy-groups"].find(group => group.name === "3P-JP").proxies, expected.map(proxy => proxy.name));
  const row = database.prepare("select id, protected_config from platform_third_party_nodes where active = 1 limit 1").get();
  const config = JSON.parse(secretProtector.unprotect(row.protected_config));
  config.thirdPartyNameIndex = 999;
  database.prepare("update platform_third_party_nodes set protected_config = ? where id = ?").run(secretProtector.protect(JSON.stringify(config)), row.id);
  assert.deepEqual(render().proxies, expected, "stored input cannot forge the trusted naming slot");
});

for (const collision of [
  { name: "same alias", aliases: ["same-alias", "same-alias", "same-alias"], expected: ["same-alias", "same-alias~2", "same-alias~3"] },
  { name: "case-insensitive", aliases: ["Shared", "shared", "SHARED"], expected: ["SHARED", "SHARED~2", "SHARED~3"] },
  { name: "country override", aliases: ["🇯🇵 Node", "🇺🇸 Node", "Node"], country: "SG", expected: ["🇸🇬 Node", "🇸🇬 Node~2", "🇸🇬 Node~3"] },
  { name: "length truncation", aliases: Array(3).fill("x".repeat(128)), expected: ["x".repeat(128), `${"x".repeat(126)}~2`, `${"x".repeat(126)}~3`] }
]) {
test(`paused and deleted cross-source ${collision.name} retains suffixes without exposing paused material`, (t) => {
  const database = new Database(":memory:");
  t.after(() => database.close());
  applyThirdPartySubscriptionMigrations({ database,
    expectedMigrationId: REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
    expectedDdlChecksum: REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM });
  const secretProtector = createPortalTotpSecretProtector({ key: "33".repeat(32) });
  const store = createSqliteThirdPartySubscriptionStore({ database, secretProtector });
  for (const index of [1, 2, 3]) {
    const source = store.createInlineSource({ name: `synthetic-${index}`, tiers: ["monthly_basic"],
      yamlContent: `proxies:\n  - {name: JP-${index}, type: ss, server: 192.0.2.${index}, port: 8388, cipher: aes-256-gcm, password: synthetic-${index}}` });
    let view = store.listSourceNodes(source.id);
    view = store.saveSourceNodes(source.id, { revision: view.revision, nodes: [{
      id: view.items[0].id, customName: collision.aliases[index - 1], ...(collision.country ? { customCountryCode: collision.country } : {})
    }] });
    store.enableSourceNodes(source.id, { revision: view.revision });
  }
  const original = decorateThirdPartyServers(store.listActiveServersForPlan("monthly_basic"));
  assert.deepEqual(original.map(server => server.subscriptionDisplayName.toUpperCase()), collision.expected.map(name => name.toUpperCase()));
  const first = original[0];
  const second = original[1];
  let view = store.listSourceNodes(first.sourceId);
  view = store.setSourceNodeEnabled(first.sourceId, first.id, { revision: view.revision, enabled: false });
  const verify = (expected, paused = [first]) => {
    const active = store.listActiveServersForPlan("monthly_basic");
    assert.deepEqual(active.map(server => server.id), expected.map(server => server.id));
    for (const server of active) {
      const serialized = JSON.stringify([server, ...Object.getOwnPropertySymbols(server).map(symbol => server[symbol])]);
      for (const removed of paused) {
        assert.equal(serialized.includes(removed.password), false);
        assert.equal(serialized.includes(removed.host), false);
      }
    }
    const rendered = decorateThirdPartyServers(active);
    assert.deepEqual(rendered, expected);
    assert.ok(rendered.every(server => Object.getOwnPropertySymbols(server).length === 0));
    const document = parse(generateClashSubscription({ servers: rendered, pingHosts: [], nginx: {} }));
    assert.deepEqual(document.proxies.map(proxy => proxy.name), expected.map(server => server.subscriptionDisplayName));
    assert.deepEqual(document["proxy-groups"].find(group => group.name === "3P-JP").proxies, expected.map(server => server.subscriptionDisplayName));
    const own = { ...node(null), name: original[0].subscriptionDisplayName, displayName: original[0].subscriptionDisplayName, thirdPartyDisplayAlias: undefined };
    const originalWithOwn = decorateThirdPartyServers(original, [own]).filter(server => expected.some(item => item.id === server.id));
    assert.deepEqual(decorateThirdPartyServers(active, [own]), originalWithOwn);
  };
  verify(original.slice(1));
  view = store.setSourceNodeEnabled(first.sourceId, first.id, { revision: view.revision, enabled: true });
  assert.deepEqual(decorateThirdPartyServers(store.listActiveServersForPlan("monthly_basic")), original);
  view = store.setSourceNodeEnabled(first.sourceId, first.id, { revision: view.revision, enabled: false });
  store.deleteSourceNode(first.sourceId, first.id, { revision: view.revision });
  verify(original.slice(1));
  const secondView = store.listSourceNodes(second.sourceId);
  store.setSourceNodeEnabled(second.sourceId, second.id, { revision: secondView.revision, enabled: false });
  verify(original.slice(2), [first, second]);
  const survivor = database.prepare("select protected_config from platform_third_party_nodes where id = ?").get(original[2].id);
  const forged = JSON.parse(secretProtector.unprotect(survivor.protected_config));
  forged.thirdPartyNameReservations = [original[0].subscriptionDisplayName];
  database.prepare("update platform_third_party_nodes set protected_config = ? where id = ?").run(secretProtector.protect(JSON.stringify(forged)), original[2].id);
  verify(original.slice(2), [first, second]);
});
}
