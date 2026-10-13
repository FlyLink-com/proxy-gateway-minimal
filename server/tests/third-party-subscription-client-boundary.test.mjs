import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { parseDocument } from "yaml";

import { generateClashSubscription } from "../services/clash-subscription.mjs";
import { createPortalTotpSecretProtector } from "../services/platform/portal-totp-verifier.mjs";
import { applyThirdPartyProxyConfig } from "../services/platform/third-party-subscription-render.mjs";
import { parseThirdPartyYaml } from "../services/platform/third-party-subscription-yaml.mjs";
import { createSqliteThirdPartySubscriptionStore } from "../services/platform/third-party-subscription-store.mjs";
import {
  applyThirdPartySubscriptionMigrations,
  REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
  REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM
} from "../services/platform/third-party-subscription-migrations.mjs";

// Synthetic, in-memory boundary tests only. No network, client process, or production data.
// Mihomo configuration loading and TLS handshakes are separate acceptance evidence.
const UUID = "11111111-1111-4111-8111-111111111111";
const PUBLIC_KEY = Buffer.alloc(32, 11).toString("base64url");
const SS2022 = [
  ["2022-blake3-aes-128-gcm", 16],
  ["2022-blake3-aes-256-gcm", 32],
  ["2022-blake3-chacha20-poly1305", 32]
];

function yamlNode(type, fields) {
  return [
    "proxies:", "  - name: synthetic HK", `    type: ${type}`,
    "    server: 203.0.113.10", "    port: 443", ...fields
  ].join("\n");
}

function alpnYaml(type, size) {
  return yamlNode(type, [
    ...(type === "tuic" ? [`    uuid: ${UUID}`] : []),
    "    password: synthetic-password", "    sni: synthetic.example.invalid",
    "    alpn:", `      - ${"a".repeat(size)}`
  ]);
}

function ssYaml(cipher, password) {
  return yamlNode("ss", [`    cipher: ${cipher}`, `    password: ${JSON.stringify(password)}`]);
}

function realityYaml(publicKey, shortId) {
  return yamlNode("vless", [
    `    uuid: ${UUID}`, "    tls: true", "    network: tcp",
    "    servername: synthetic.example.invalid", "    flow: xtls-rprx-vision",
    "    client-fingerprint: chrome", "    reality-opts:",
    `      public-key: ${JSON.stringify(publicKey)}`,
    ...(shortId === undefined ? [] : [`      short-id: ${JSON.stringify(shortId)}`])
  ]);
}

function fixture(t) {
  const database = new Database(":memory:");
  t.after(() => database.close());
  applyThirdPartySubscriptionMigrations({
    database,
    expectedMigrationId: REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
    expectedDdlChecksum: REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM,
    nowFn: () => new Date("2026-10-13T00:00:00.000Z")
  });
  const protector = createPortalTotpSecretProtector({ key: Buffer.alloc(32, 42).toString("hex") });
  let networkCalls = 0;
  const networkDenied = async () => { networkCalls += 1; throw new Error("synthetic_network_denied"); };
  const store = createSqliteThirdPartySubscriptionStore({
    database, secretProtector: protector, fetchFn: networkDenied, resolveFn: networkDenied,
    nowFn: () => new Date("2026-10-13T00:00:00.000Z")
  });
  t.after(() => assert.equal(networkCalls, 0));
  assert.equal(store.available, true);
  return { database, protector, store };
}

function importInput(yamlContent) {
  return { name: "synthetic-boundary", yamlContent, tiers: ["monthly_basic"], enabled: true };
}

function rowCounts(database) {
  return ["platform_third_party_sources", "platform_third_party_source_tiers", "platform_third_party_nodes"]
    .map((table) => database.prepare(`select count(*) as n from ${table}`).get().n);
}

function acceptAndRender(t, yamlContent) {
  const { store, database, protector } = fixture(t);
  const parsed = parseThirdPartyYaml(yamlContent);
  assert.equal(parsed.nodes.length, 1);
  const created = store.createInlineSource(importInput(yamlContent));
  const row = database.prepare(
    "select protected_config from platform_third_party_nodes where source_id = ?"
  ).get(created.id);
  assert.match(row.protected_config, /^v2:aes-256-gcm:/);
  assert.equal(row.protected_config.includes("synthetic-password"), false);
  assert.equal(row.protected_config.includes("203.0.113.10"), false);
  const stored = JSON.parse(protector.unprotect(row.protected_config));
  assert.equal(stored.protocol, parsed.nodes[0].protocol);
  const merged = applyThirdPartyProxyConfig({
    thirdPartySubscriptions: { enabled: true, available: true, store },
    platform: { controlStore: { findUsageBindingByTenantRef: () => ({
      plan: "offerv_plan_30d_50gb_monthly_v1", trafficLimitBytes: 50 * 1024 ** 3
    }) } }
  }, {
    tenant: { id: "synthetic-client-boundary", status: "active" },
    proxyConfig: { servers: [{
      name: "synthetic-owned", protocol: "ss", host: "198.51.100.10", port: 8388,
      method: "aes-256-gcm", password: "synthetic-owned-password"
    }] }
  });
  const yaml = generateClashSubscription(merged);
  const document = parseDocument(yaml, { uniqueKeys: true });
  assert.equal(document.errors.length, 0);
  const rendered = document.toJS();
  const thirdParty = rendered.proxies.filter((node) => node.name.startsWith("[3P]"));
  assert.equal(thirdParty.length, 1);
  assert.equal(yaml.includes(parsed.nodes[0].dedupKey), false);
  return { parsed: parsed.nodes[0], stored, rendered: thirdParty[0] };
}

function rejectsBeforePublication(t, yamlContent) {
  const { database, store } = fixture(t);
  const before = rowCounts(database);
  let parserError;
  let storeError;
  try { parseThirdPartyYaml(yamlContent); } catch (error) { parserError = error; }
  try { store.createInlineSource(importInput(yamlContent)); } catch (error) { storeError = error; }
  assert.equal(parserError?.code, "yaml_proxy_invalid", "parser must reject client-invalid parameters");
  assert.equal(storeError?.code, "invalid_yaml", "store must reject before publishing");
  assert.deepEqual(rowCounts(database), before, "rejection must not leave source, tier, or node rows");
}

for (const protocol of ["hysteria2", "tuic"]) {
  test(`client boundary: ${protocol} ALPN 255 survives parser encrypted store and render`, (t) => {
    const result = acceptAndRender(t, alpnYaml(protocol, 255));
    for (const value of [result.parsed, result.stored, result.rendered]) {
      assert.deepEqual(value.alpn, ["a".repeat(255)]);
    }
  });
  test(`client boundary: ${protocol} ALPN 256 is rejected before publication`, (t) => {
    rejectsBeforePublication(t, alpnYaml(protocol, 256));
  });
}

for (const [cipher, bytes] of SS2022) {
  test(`client boundary: ${cipher} valid ${bytes}-byte key survives the full render path`, (t) => {
    const key = Buffer.alloc(bytes, 19).toString("base64");
    const result = acceptAndRender(t, ssYaml(cipher, key));
    assert.equal(result.rendered.cipher, cipher);
    for (const value of [result.parsed, result.stored, result.rendered]) assert.equal(value.password, key);
  });
  for (const [label, key] of [
    ["short", "short"],
    ["invalid base64", "!invalid-base64!"],
    ["wrong decoded length", Buffer.alloc(bytes - 1, 19).toString("base64")]
  ]) {
    test(`client boundary: ${cipher} ${label} key is rejected before publication`, (t) => {
      rejectsBeforePublication(t, ssYaml(cipher, key));
    });
  }
}

for (const [cipher, bytes] of SS2022.slice(0, 2)) {
  test(`client boundary: ${cipher} validates every colon-separated key`, (t) => {
    const key = Buffer.alloc(bytes, 19).toString("base64");
    const chain = `${key}:${Buffer.alloc(bytes, 20).toString("base64")}`;
    assert.equal(acceptAndRender(t, ssYaml(cipher, chain)).rendered.password, chain);
    for (const invalid of [`:${key}`, `${key}:`, `${key}:short`, `${key}::${key}`]) {
      rejectsBeforePublication(t, ssYaml(cipher, invalid));
    }
  });
}

test("client boundary: ChaCha SS2022 rejects a multi-key chain", (t) => {
  const key = Buffer.alloc(32, 19).toString("base64");
  rejectsBeforePublication(t, ssYaml("2022-blake3-chacha20-poly1305", `${key}:${key}`));
});

test("client boundary: base64 unused bits must be canonical", (t) => {
  const ssKey = Buffer.alloc(16).toString("base64");
  const noncanonical = `${ssKey.slice(0, -3)}B==`;
  assert.deepEqual(Buffer.from(ssKey, "base64"), Buffer.from(noncanonical, "base64"));
  rejectsBeforePublication(t, ssYaml("2022-blake3-aes-128-gcm", noncanonical));
  const reality = Buffer.alloc(32).toString("base64url");
  const noncanonicalReality = `${reality.slice(0, -1)}B`;
  assert.deepEqual(Buffer.from(reality, "base64url"), Buffer.from(noncanonicalReality, "base64url"));
  rejectsBeforePublication(t, realityYaml(noncanonicalReality, "00"));
});

for (const shortId of [undefined, "00", "aabbccddeeff0011"]) {
  test(`client boundary: Reality 32-byte base64url key with ${shortId ?? "omitted"} short-id renders`, (t) => {
    const result = acceptAndRender(t, realityYaml(PUBLIC_KEY, shortId));
    assert.equal(result.stored.realityOpts.publicKey, PUBLIC_KEY);
    assert.equal(result.rendered["reality-opts"]["public-key"], PUBLIC_KEY);
    assert.equal(result.rendered.tls, true);
    if (shortId !== undefined) assert.equal(result.rendered["reality-opts"]["short-id"], shortId);
  });
}

for (const [label, key] of [
  ["16 characters", "A".repeat(16)],
  ["invalid base64 padding", `${"A".repeat(40)}===`],
  ["invalid alphabet", `${"A".repeat(42)}!`],
  ["31 decoded bytes", Buffer.alloc(31, 11).toString("base64url")],
  ["33 decoded bytes", Buffer.alloc(33, 11).toString("base64url")]
]) {
  test(`client boundary: Reality ${label} key is rejected before publication`, (t) => {
    rejectsBeforePublication(t, realityYaml(key, "00"));
  });
}

// Empty short-id policy is intentionally not changed by this test slice.
for (const shortId of ["a", "abc", "gg", "aabbccddeeff001122"]) {
  test(`client boundary: Reality invalid short-id ${shortId} is rejected before publication`, (t) => {
    rejectsBeforePublication(t, realityYaml(PUBLIC_KEY, shortId));
  });
}
