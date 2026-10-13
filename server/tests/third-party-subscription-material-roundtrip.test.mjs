import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";

import { generateClashSubscription } from "../services/clash-subscription.mjs";
import { applyThirdPartyProxyConfig } from "../services/platform/third-party-subscription-render.mjs";
import { createPortalTotpSecretProtector } from "../services/platform/portal-totp-verifier.mjs";
import {
  REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM,
  REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
  applyThirdPartySubscriptionMigrations
} from "../services/platform/third-party-subscription-migrations.mjs";
import { createSqliteThirdPartySubscriptionStore } from "../services/platform/third-party-subscription-store.mjs";
import { parseThirdPartyYaml } from "../services/platform/third-party-subscription-yaml.mjs";

const GIB = 1024 ** 3;
const OFFER_50 = "offerv_plan_30d_50gb_monthly_v1";
const SECRET_KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
const INTERIOR_SS_PASSWORD = "syn  thetic";
const INTERIOR_HY2_PASSWORD = "hy2  secret";
const INTERIOR_OBFS_PASSWORD = "obfs  secret";
const INTERIOR_TUIC_PASSWORD = "tuic  secret";

function appliedStore() {
  const database = new Database(":memory:");
  applyThirdPartySubscriptionMigrations({
    database,
    expectedMigrationId: REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
    expectedDdlChecksum: REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM,
    nowFn: () => new Date("2026-10-10T00:00:00.000Z")
  });
  const secretProtector = createPortalTotpSecretProtector({ key: SECRET_KEY });
  const network = { calls: 0 };
  const store = createSqliteThirdPartySubscriptionStore({
    database,
    secretProtector,
    fetchFn: async () => {
      network.calls += 1;
      throw new Error("network");
    },
    resolveFn: async () => {
      network.calls += 1;
      throw new Error("dns");
    },
    nowFn: () => new Date("2026-10-10T00:00:00.000Z")
  });
  return { database, store, secretProtector, network };
}

function counts(database) {
  return {
    sources: database.prepare("select count(*) as n from platform_third_party_sources").get().n,
    tiers: database.prepare("select count(*) as n from platform_third_party_source_tiers").get().n,
    nodes: database.prepare("select count(*) as n from platform_third_party_nodes").get().n
  };
}

function sampleOwnConfig() {
  return {
    servers: [
      {
        name: "aws-singapore-blue",
        host: "192.0.2.10",
        port: 18388,
        method: "aes-256-gcm",
        password: "pw:with#chars",
        qualityClass: "stable"
      },
      {
        name: "aws-singapore-backup",
        host: "198.51.100.10",
        port: 8388,
        method: "aes-256-gcm",
        password: "secondary-secret"
      }
    ],
    pingHosts: [],
    nginx: {}
  };
}

function yamlDoc(blocks) {
  return ["proxies:", ...blocks].join("\n");
}

function ssBlock(name, server, passwordLiteral) {
  return [
    `  - name: ${name}`,
    "    type: ss",
    `    server: ${server}`,
    "    port: 8388",
    "    cipher: aes-256-gcm",
    `    password: ${passwordLiteral}`
  ].join("\n");
}

function hy2Block(passwordLiteral, extra = []) {
  return [
    "  - name: SG",
    "    type: hysteria2",
    "    server: 203.0.113.12",
    "    port: 443",
    `    password: ${passwordLiteral}`,
    ...extra,
    "    sni: hy2.example.test"
  ].join("\n");
}

function tuicBlock(passwordLiteral) {
  return [
    "  - name: JP",
    "    type: tuic",
    "    server: 203.0.113.13",
    "    port: 443",
    "    uuid: 11111111-1111-4111-8111-111111111111",
    `    password: ${passwordLiteral}`
  ].join("\n");
}

function renderPlan(store, tenantId) {
  return generateClashSubscription(applyThirdPartyProxyConfig({
    thirdPartySubscriptions: { enabled: true, available: true, store },
    platform: {
      controlStore: {
        findUsageBindingByTenantRef: () => ({ plan: OFFER_50, trafficLimitBytes: 50 * GIB })
      }
    }
  }, {
    proxyConfig: sampleOwnConfig(),
    tenant: { id: tenantId, status: "active" }
  }));
}

function assertEdgeRejected(yamlContent, itemIndex) {
  assert.throws(() => parseThirdPartyYaml(yamlContent), (error) => {
    assert.equal(error?.code, "yaml_proxy_invalid");
    assert.equal(error?.itemIndex, itemIndex);
    return true;
  });
  const { store, database, network } = appliedStore();
  assert.throws(() => store.createInlineSource({
    name: "synthetic-source",
    yamlContent,
    tiers: ["monthly_basic"]
  }), (error) => error?.code === "invalid_yaml");
  assert.deepEqual(counts(database), { sources: 0, tiers: 0, nodes: 0 });
  assert.equal(network.calls, 0);
}

test("quoted edge whitespace secrets are rejected for the whole inline document", () => {
  const obfs = (literal) => ["    obfs: salamander", `    obfs-password: ${literal}`];
  const cases = [
    { itemIndex: 0, yamlContent: yamlDoc([ssBlock("HK", "203.0.113.10", '" synthetic-password"')]) },
    { itemIndex: 0, yamlContent: yamlDoc([ssBlock("HK", "203.0.113.10", '"synthetic-password "')]) },
    { itemIndex: 0, yamlContent: yamlDoc([ssBlock("HK", "203.0.113.10", '" synthetic-password "')]) },
    { itemIndex: 0, yamlContent: yamlDoc([ssBlock("HK", "203.0.113.10", '"  syn  thetic  "')]) },
    { itemIndex: 0, yamlContent: yamlDoc([ssBlock("HK", "203.0.113.10", '" "')]) },
    { itemIndex: 0, yamlContent: yamlDoc([ssBlock("HK", "203.0.113.10", '"\u00A0synthetic-password"')]) },
    { itemIndex: 0, yamlContent: yamlDoc([hy2Block('" synthetic-hy2"')]) },
    { itemIndex: 0, yamlContent: yamlDoc([hy2Block('"synthetic-hy2 "')]) },
    { itemIndex: 0, yamlContent: yamlDoc([hy2Block("synthetic-hy2", obfs('" synthetic-obfs"'))]) },
    { itemIndex: 0, yamlContent: yamlDoc([hy2Block("synthetic-hy2", obfs('"synthetic-obfs "'))]) },
    { itemIndex: 0, yamlContent: yamlDoc([tuicBlock('" synthetic-tuic"')]) },
    { itemIndex: 0, yamlContent: yamlDoc([tuicBlock('"synthetic-tuic "')]) },
    {
      itemIndex: 1,
      yamlContent: yamlDoc([
        ssBlock("HK", "203.0.113.10", "synthetic-password"),
        ssBlock("JP", "203.0.113.11", '" synthetic-password"')
      ])
    }
  ];
  for (const item of cases) assertEdgeRejected(item.yamlContent, item.itemIndex);

  const { store, database, network } = appliedStore();
  const kept = store.createInlineSource({
    name: "synthetic-source",
    yamlContent: yamlDoc([ssBlock("HK", "203.0.113.10", "synthetic-password")]),
    tiers: ["monthly_basic"]
  });
  const before = counts(database);
  assert.throws(() => store.createInlineSource({
    name: "synthetic-bad",
    yamlContent: yamlDoc([
      ssBlock("HK", "203.0.113.10", "synthetic-password"),
      ssBlock("JP", "203.0.113.11", '" synthetic-password"')
    ]),
    tiers: ["monthly_basic"]
  }), (error) => error?.code === "invalid_yaml");
  assert.deepEqual(counts(database), before);
  assert.deepEqual(store.listSources().map((source) => source.id), [kept.id]);
  assert.equal(network.calls, 0);
});

test("interior secret whitespace is preserved through parse, store, and render", () => {
  const yamlContent = yamlDoc([
    ssBlock("HK", "203.0.113.10", `"${INTERIOR_SS_PASSWORD}"`),
    hy2Block(`"${INTERIOR_HY2_PASSWORD}"`, [
      "    obfs: salamander",
      `    obfs-password: "${INTERIOR_OBFS_PASSWORD}"`
    ]),
    tuicBlock(`"${INTERIOR_TUIC_PASSWORD}"`)
  ]);
  const parsed = parseThirdPartyYaml(yamlContent);
  assert.deepEqual(parsed.nodes.map((node) => node.protocol), ["ss", "hysteria2", "tuic"]);
  assert.equal(parsed.nodes[0].password, INTERIOR_SS_PASSWORD);
  assert.equal(parsed.nodes[1].password, INTERIOR_HY2_PASSWORD);
  assert.equal(parsed.nodes[1].obfsPassword, INTERIOR_OBFS_PASSWORD);
  assert.equal(parsed.nodes[2].password, INTERIOR_TUIC_PASSWORD);

  const { database, store, secretProtector, network } = appliedStore();
  const source = store.createInlineSource({
    name: "synthetic-source",
    yamlContent,
    tiers: ["monthly_basic"],
    enabled: true
  });
  const rows = database.prepare(
    "select protocol, protected_config from platform_third_party_nodes where source_id = ?"
  ).all(source.id);
  assert.equal(rows.length, 3);
  const stored = Object.fromEntries(rows.map((row) => {
    assert.equal(row.protected_config.includes(INTERIOR_SS_PASSWORD), false);
    assert.equal(row.protected_config.includes(INTERIOR_HY2_PASSWORD), false);
    assert.equal(row.protected_config.includes(INTERIOR_OBFS_PASSWORD), false);
    assert.equal(row.protected_config.includes(INTERIOR_TUIC_PASSWORD), false);
    return [row.protocol, JSON.parse(secretProtector.unprotect(row.protected_config))];
  }));
  assert.equal(stored.ss.password, INTERIOR_SS_PASSWORD);
  assert.equal(stored.hysteria2.password, INTERIOR_HY2_PASSWORD);
  assert.equal(stored.hysteria2.obfsPassword, INTERIOR_OBFS_PASSWORD);
  assert.equal(stored.tuic.password, INTERIOR_TUIC_PASSWORD);

  const delivered = Object.fromEntries(
    store.listActiveServersForPlan("monthly_basic").map((node) => [node.protocol, node])
  );
  assert.equal(delivered.ss.password, INTERIOR_SS_PASSWORD);
  assert.equal(delivered.hysteria2.password, INTERIOR_HY2_PASSWORD);
  assert.equal(delivered.hysteria2.obfsPassword, INTERIOR_OBFS_PASSWORD);
  assert.equal(delivered.tuic.password, INTERIOR_TUIC_PASSWORD);

  const yaml = renderPlan(store, "tenant_basic");
  assert.match(yaml, /syn {2}thetic/);
  assert.match(yaml, /hy2 {2}secret/);
  assert.match(yaml, /obfs {2}secret/);
  assert.match(yaml, /tuic {2}secret/);
  assert.equal(network.calls, 0);
});

test("inline hy2 pin equal to dedupKey is preserved and legacy rows still drop it", () => {
  const parsed = parseThirdPartyYaml(yamlDoc([hy2Block("synthetic-hy2")]));
  const dedupKey = parsed.nodes[0].dedupKey;
  assert.match(dedupKey, /^[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(parsed.nodes[0], "fingerprint"), false);

  const collided = parseThirdPartyYaml(yamlDoc([
    hy2Block("synthetic-hy2", [`    fingerprint: "${dedupKey}"`])
  ]));
  assert.equal(collided.nodes.length, 1);
  assert.equal(collided.nodes[0].dedupKey, dedupKey);
  assert.equal(collided.nodes[0].fingerprint, dedupKey);

  const { database, store, secretProtector, network } = appliedStore();
  const source = store.createInlineSource({
    name: "synthetic-hy2-source",
    yamlContent: yamlDoc([
      hy2Block("synthetic-hy2", [`    fingerprint: "${dedupKey}"`])
    ]),
    tiers: ["monthly_basic"],
    enabled: true
  });
  const row = database.prepare(
    "select id, fingerprint, protected_config from platform_third_party_nodes where source_id = ?"
  ).get(source.id);
  assert.equal(row.fingerprint, dedupKey);
  assert.equal(row.protected_config.includes(dedupKey), false);
  const stored = JSON.parse(secretProtector.unprotect(row.protected_config));
  assert.equal(stored.dedupKey, dedupKey);
  assert.equal(stored.fingerprint, dedupKey);

  const delivered = store.listActiveServersForPlan("monthly_basic");
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].fingerprint, dedupKey);
  assert.equal(Object.hasOwn(delivered[0], "dedupKey"), false);
  const freshYaml = renderPlan(store, "tenant_hy2");
  assert.match(freshYaml, /type: hysteria2/);
  assert.match(freshYaml, /\[3P\] SG 1/);
  assert.match(freshYaml, new RegExp(`fingerprint:\\s*"?${dedupKey}"?`));
  assert.doesNotMatch(freshYaml, /dedupKey/);

  const legacy = { ...stored };
  delete legacy.dedupKey;
  assert.equal(Object.hasOwn(legacy, "dedupKey"), false);
  assert.equal(legacy.fingerprint, row.fingerprint);
  database.prepare("update platform_third_party_nodes set protected_config = ? where id = ?")
    .run(secretProtector.protect(JSON.stringify(legacy)), row.id);
  const legacyDelivered = store.listActiveServersForPlan("monthly_basic");
  assert.equal(legacyDelivered.length, 1);
  assert.equal(legacyDelivered[0].id, row.id);
  assert.equal(Object.hasOwn(legacyDelivered[0], "fingerprint"), false);
  assert.equal(Object.hasOwn(legacyDelivered[0], "dedupKey"), false);
  const legacyYaml = renderPlan(store, "tenant_hy2");
  assert.match(legacyYaml, /type: hysteria2/);
  assert.match(legacyYaml, /\[3P\] SG 1/);
  assert.doesNotMatch(legacyYaml, /fingerprint:/);
  assert.equal(legacyYaml.includes(dedupKey), false);
  assert.equal(network.calls, 0);
});
