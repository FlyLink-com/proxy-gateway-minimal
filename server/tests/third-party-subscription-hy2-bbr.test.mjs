import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { parse, stringify } from "yaml";

import { generateClashSubscription } from "../services/clash-subscription.mjs";
import { createPortalTotpSecretProtector } from "../services/platform/portal-totp-verifier.mjs";
import {
  REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM,
  REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
  applyThirdPartySubscriptionMigrations
} from "../services/platform/third-party-subscription-migrations.mjs";
import { applyThirdPartyProxyConfig } from "../services/platform/third-party-subscription-render.mjs";
import { createSqliteThirdPartySubscriptionStore } from "../services/platform/third-party-subscription-store.mjs";
import { parseThirdPartyYaml } from "../services/platform/third-party-subscription-yaml.mjs";

// Synthetic-only fixtures; no downloaded subscriptions or live credentials.
const PROFILES = ["standard", "conservative", "aggressive"];
const KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
const hy2 = (fields = {}) => ({
  name: "SG synthetic Hy2", type: "hysteria2", server: "203.0.113.12", port: 443,
  password: "synthetic-hy2", sni: "hy2.example.invalid", ...fields
});
const vless = () => ({
  name: "JP synthetic VLESS", type: "vless", server: "203.0.113.11", port: 443,
  uuid: "11111111-1111-4111-8111-111111111111"
});
const tuic = () => ({
  name: "US synthetic TUIC", type: "tuic", server: "203.0.113.13", port: 443,
  uuid: "22222222-2222-4222-8222-222222222222", password: "synthetic-tuic"
});
const yaml = (nodes, fields = {}) => stringify({ proxies: nodes, ...fields });

function expectRejected(content, code = "yaml_proxy_invalid", itemIndex = 0) {
  assert.throws(() => parseThirdPartyYaml(content), (error) => {
    assert.equal(error.code, code);
    if (itemIndex !== undefined) assert.equal(error.itemIndex, itemIndex);
    assert.equal(error.message.includes("synthetic"), false);
    return true;
  });
}

for (const profile of PROFILES) {
  test(`Hy2 bbr-profile ${profile} parses alongside VLESS and TUIC`, () => {
    const parsed = parseThirdPartyYaml(yaml([vless(), hy2({ "bbr-profile": profile }), tuic()]));
    assert.deepEqual(parsed.nodes.map((node) => node.protocol), ["vless", "hysteria2", "tuic"]);
    assert.equal(parsed.counts.valid, 3);
    assert.equal(parsed.nodes[1].bbrProfile, profile);
    assert.equal(Object.hasOwn(parsed.nodes[1], "bbr-profile"), false);
    assert.equal(Object.hasOwn(parsed.nodes[0], "bbrProfile"), false);
    assert.equal(Object.hasOwn(parsed.nodes[2], "bbrProfile"), false);
  });
}

test("Hy2 bbr-profile omission stays absent, with no inserted default", () => {
  const [node] = parseThirdPartyYaml(yaml([hy2()])).nodes;
  assert.equal(Object.hasOwn(node, "bbrProfile"), false);
});

test("Hy2 bbr-profile accepts only exact supported string enums atomically", () => {
  for (const invalid of ["", "bbr", "STANDARD", " standard", "standard ", "standard\n", 1, true, null, [], {}]) {
    expectRejected(yaml([vless(), hy2({ "bbr-profile": invalid }), tuic()]), "yaml_proxy_invalid", 1);
  }
});

test("Hy2 bbr-profile participates in same-identity conflict detection", () => {
  const same = parseThirdPartyYaml(yaml([
    hy2({ "bbr-profile": "standard" }),
    hy2({ name: "renamed synthetic", "bbr-profile": "standard" })
  ]));
  assert.equal(same.nodes.length, 1);
  assert.equal(same.nodes[0].bbrProfile, "standard");
  for (const conflicting of [hy2(), hy2({ "bbr-profile": "aggressive" })]) {
    expectRejected(yaml([hy2({ "bbr-profile": "standard" }), conflicting]), "yaml_conflict", 1);
  }
});

test("Hy2 bbr-profile does not relax TLS, unknown-key, protocol, or remote-provider restrictions", () => {
  for (const fields of [{ "skip-cert-verify": true }, { up: "100 Mbps" }, { bbrProfile: "standard" }]) {
    expectRejected(yaml([hy2({ "bbr-profile": "standard", ...fields })]));
  }
  for (const node of [vless(), tuic(), { ...hy2(), type: "hy2" }]) {
    expectRejected(yaml([{ ...node, "bbr-profile": "standard" }]));
  }
  for (const key of ["proxy-providers", "rule-providers", "script"]) {
    assert.throws(() => parseThirdPartyYaml(yaml([hy2({ "bbr-profile": "standard" })], { [key]: {} })),
      (error) => error.code === "yaml_remote_rejected");
  }
});

for (const profile of [...PROFILES, undefined]) {
  test(`Hy2 ${profile ?? "omitted"} profile survives encrypted SQLite reopen and final rendering`, (t) => {
    const root = mkdtempSync(join(tmpdir(), "gccgw-hy2-bbr-"));
    const filename = join(root, "synthetic.sqlite");
    let database = new Database(filename);
    t.after(() => {
      if (database.open) database.close();
      assert.equal(dirname(resolve(root)), resolve(tmpdir()));
      rmSync(root, { recursive: true, force: true });
    });
    applyThirdPartySubscriptionMigrations({
      database,
      expectedMigrationId: REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
      expectedDdlChecksum: REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM,
      nowFn: () => new Date("2026-10-13T00:00:00.000Z")
    });
    const secretProtector = createPortalTotpSecretProtector({ key: KEY });
    let networkCalls = 0;
    const createStore = () => createSqliteThirdPartySubscriptionStore({
      database, secretProtector,
      fetchFn: async () => { networkCalls += 1; throw new Error("unexpected network"); },
      resolveFn: async () => { networkCalls += 1; throw new Error("unexpected DNS"); }
    });
    let store = createStore();
    const source = store.createInlineSource({
      name: "synthetic-profile-source",
      yamlContent: yaml([vless(), hy2(profile === undefined ? {} : { "bbr-profile": profile }), tuic()]),
      tiers: ["monthly_basic"], enabled: true
    });
    const row = database.prepare(
      "select protected_config from platform_third_party_nodes where source_id = ? and protocol = 'hysteria2'"
    ).get(source.id);
    assert.equal(row.protected_config.includes("synthetic-hy2"), false);
    assert.equal(row.protected_config.includes("bbrProfile"), false);
    const stored = JSON.parse(secretProtector.unprotect(row.protected_config));
    assert.equal(stored.bbrProfile, profile);
    assert.equal(Object.hasOwn(stored, "bbrProfile"), profile !== undefined);

    database.close();
    database = new Database(filename);
    store = createStore();
    const servers = store.listActiveServersForPlan("monthly_basic");
    assert.equal(servers.length, 3);
    const delivered = servers.find((node) => node.protocol === "hysteria2");
    assert.equal(delivered.bbrProfile, profile);
    assert.equal(Object.hasOwn(delivered, "bbrProfile"), profile !== undefined);
    const proxyConfig = applyThirdPartyProxyConfig({
      thirdPartySubscriptions: { enabled: true, available: true, store },
      platform: { controlStore: { findUsageBindingByTenantRef: () => ({
        plan: "offerv_plan_30d_50gb_monthly_v1", trafficLimitBytes: 50 * 1024 ** 3
      }) } }
    }, { proxyConfig: { servers: [], pingHosts: [], nginx: {} }, tenant: { id: "synthetic-tenant", status: "active" } });
    const rendered = parse(generateClashSubscription(proxyConfig));
    assert.equal(rendered.proxies.length, 3);
    const renderedHy2 = rendered.proxies.find((node) => node.type === "hysteria2");
    assert.equal(renderedHy2["bbr-profile"], profile);
    assert.equal(Object.hasOwn(renderedHy2, "bbr-profile"), profile !== undefined);
    assert.equal(Object.hasOwn(renderedHy2, "bbrProfile"), false);
    assert.equal(renderedHy2.password, "synthetic-hy2");
    assert.equal(networkCalls, 0);
  });
}
