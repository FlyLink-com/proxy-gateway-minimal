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
import { decorateThirdPartyServers } from "../services/platform/third-party-subscription-render.mjs";
import { validateProxyDisplayNames } from "../services/proxy-display-name.mjs";
import { generateClashSubscription } from "../services/clash-subscription.mjs";

const node = (alias) => ({
  name: "upstream-original", displayName: "upstream-original", countryCode: "JP",
  thirdPartyDisplayAlias: alias, host: "192.0.2.1", port: 8388,
  protocol: "ss", method: "aes-256-gcm", password: "synthetic-only"
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
