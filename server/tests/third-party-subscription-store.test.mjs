import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";

import { createPortalTotpSecretProtector } from "../services/platform/portal-totp-verifier.mjs";
import {
  REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM,
  REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
  applyThirdPartySubscriptionMigrations
} from "../services/platform/third-party-subscription-migrations.mjs";
import {
  THIRD_PARTY_PROTECTED_PREFIX,
  createSqliteThirdPartySubscriptionStore
} from "../services/platform/third-party-subscription-store.mjs";

const SECRET_KEY = "ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100";
const SOURCE_URL = "https://example.invalid/third-party-source-secret-path";
const SS_YAML = [
  "proxies:",
  "  - name: HK",
  "    type: ss",
  "    server: 203.0.113.10",
  "    port: 8388",
  "    cipher: aes-256-gcm",
  "    password: synthetic-password",
  "  - name: JP",
  "    type: ss",
  "    server: 203.0.113.11",
  "    port: 8388",
  "    cipher: aes-256-gcm",
  "    password: synthetic-password"
].join("\n");
const REGION_YAML = [
  "proxies:",
  "  - name: node-a",
  "    type: ss",
  "    server: 203.0.113.10",
  "    port: 8388",
  "    cipher: aes-256-gcm",
  "    password: synthetic-password"
].join("\n");

function appliedDatabase() {
  const database = new Database(":memory:");
  applyThirdPartySubscriptionMigrations({
    database,
    expectedMigrationId: REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
    expectedDdlChecksum: REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM,
    nowFn: () => new Date("2026-10-10T00:00:00.000Z")
  });
  return database;
}

function createStore() {
  const network = { calls: 0 };
  const database = appliedDatabase();
  const secretProtector = createPortalTotpSecretProtector({ key: SECRET_KEY });
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

function sourceSnapshot(database) {
  return {
    sources: database.prepare(`
      select id, status, enabled, last_refresh_at, last_error_code, protected_url
        from platform_third_party_sources order by id asc
    `).all(),
    nodes: database.prepare(`
      select id, source_id, fingerprint, active, protected_config
        from platform_third_party_nodes order by id asc
    `).all()
  };
}

function insertLegacyRemote(database, secretProtector) {
  const id = `tpsrc_${"ab".repeat(16)}`;
  const dedupKey = "cd".repeat(32);
  const at = "2026-10-09T00:00:00.000Z";
  const config = {
    protocol: "ss",
    host: "203.0.113.10",
    port: 8388,
    method: "aes-256-gcm",
    cipher: "aes-256-gcm",
    password: "synthetic-password",
    name: "HK",
    displayName: "HK",
    countryCode: "HK",
    region: "HK",
    dedupKey
  };
  database.prepare(`
    insert into platform_third_party_sources (
      id, name, protected_url, region_override, enabled, status,
      last_refresh_at, last_error_code, created_at, updated_at
    ) values (?, 'legacy-remote', ?, null, 1, 'ready', ?, null, ?, ?)
  `).run(id, secretProtector.protect(SOURCE_URL), at, at, at);
  database.prepare(
    "insert into platform_third_party_source_tiers (source_id, plan_id) values (?, 'monthly_basic')"
  ).run(id);
  database.prepare(`
    insert into platform_third_party_nodes (
      id, source_id, fingerprint, display_name, country_code, region,
      protocol, protected_config, last_seen_at, active
    ) values (?, ?, ?, 'HK', 'HK', 'HK', 'ss', ?, ?, 1)
  `).run(`tpnode_${"ef".repeat(16)}`, id, dedupKey, secretProtector.protect(JSON.stringify(config)), at);
  return { id, dedupKey };
}

function assertNoSecret(value) {
  const serialized = JSON.stringify(value);
  assert.equal(serialized.includes("example.invalid"), false);
  assert.equal(serialized.includes("third-party-source-secret-path"), false);
  assert.equal(serialized.includes(SOURCE_URL), false);
}

test("inline import stores an encrypted descriptor and encrypted nodes", () => {
  const { store, secretProtector, database, network } = createStore();
  const created = store.createInlineSource({
    name: "synthetic-source",
    yamlContent: SS_YAML,
    tiers: ["monthly_basic"]
  });
  assertNoSecret(created);
  assert.equal(created.enabled, false);
  assert.equal(created.sourceKind, "inline-yaml");
  assert.equal(created.status, "ready");
  assert.equal(Object.hasOwn(created, "subscriptionUrl"), false);
  assert.equal(Object.hasOwn(created, "yamlContent"), false);
  const row = database.prepare("select protected_url from platform_third_party_sources where id = ?")
    .get(created.id);
  assert.equal(row.protected_url.startsWith(THIRD_PARTY_PROTECTED_PREFIX), true);
  const descriptor = secretProtector.unprotect(row.protected_url);
  assert.deepEqual(JSON.parse(descriptor), { version: 1, kind: "inline-yaml" });
  assert.equal(descriptor.includes("proxies"), false);
  assert.equal(descriptor.includes("synthetic-password"), false);
  assert.equal(descriptor.includes("203.0.113.10"), false);
  assert.equal(row.protected_url.includes("synthetic-password"), false);
  assert.equal(row.protected_url.includes("proxies"), false);
  assert.equal(secretProtector.unprotect("plaintext-url"), "plaintext-url");
  const wrapped = secretProtector.protect("synthetic-node-json");
  assert.equal(wrapped.startsWith(THIRD_PARTY_PROTECTED_PREFIX), true);
  assert.equal(secretProtector.unprotect(wrapped.slice(0, -3) + "zzz"), null);
  const node = database.prepare(
    "select fingerprint, protected_config from platform_third_party_nodes where source_id = ?"
  ).all(created.id);
  assert.equal(node.length, 2);
  for (const item of node) {
    assert.match(item.fingerprint, /^[a-f0-9]{64}$/);
    assert.equal(item.protected_config.includes("synthetic-password"), false);
    const stored = JSON.parse(secretProtector.unprotect(item.protected_config));
    assert.equal(stored.dedupKey, item.fingerprint);
    assert.equal(Object.hasOwn(stored, "fingerprint"), false);
    assert.equal(JSON.stringify(stored).includes("proxies"), false);
    assert.equal(JSON.stringify(store.listSources()).includes(item.fingerprint), false);
  }
  assert.equal(network.calls, 0);
});

test("accepts parser-sized protocol secrets and alpn entries", () => {
  const { store, secretProtector, database } = createStore();
  const password513 = "p".repeat(513);
  const password4096 = "q".repeat(4096);
  const alpn255 = "a".repeat(255);
  const created = store.createInlineSource({
    name: "synthetic-limits",
    yamlContent: [
      "proxies:",
      "  - name: HK",
      "    type: ss",
      "    server: 203.0.113.10",
      "    port: 8388",
      "    cipher: aes-256-gcm",
      `    password: ${password513}`,
      "  - name: JP",
      "    type: ss",
      "    server: 203.0.113.11",
      "    port: 8388",
      "    cipher: aes-256-gcm",
      `    password: ${password4096}`,
      "  - name: SG",
      "    type: hysteria2",
      "    server: 203.0.113.12",
      "    port: 443",
      "    password: synthetic-hy2",
      "    alpn:",
      `      - ${alpn255}`
    ].join("\n"),
    tiers: ["monthly_basic"]
  });
  const configs = database.prepare(
    "select protected_config from platform_third_party_nodes where source_id = ?"
  ).all(created.id).map((row) => JSON.parse(secretProtector.unprotect(row.protected_config)));
  assert.equal(configs.some((config) => config.password === password513), true);
  assert.equal(configs.some((config) => config.password === password4096), true);
  assert.deepEqual(configs.find((config) => config.protocol === "hysteria2").alpn, [alpn255]);
  assert.throws(() => store.createInlineSource({
    name: "synthetic-secret-over",
    yamlContent: [
      "proxies:",
      "  - name: HK",
      "    type: ss",
      "    server: 203.0.113.10",
      "    port: 8388",
      "    cipher: aes-256-gcm",
      `    password: ${"r".repeat(4097)}`
    ].join("\n"),
    tiers: ["monthly_basic"]
  }), (error) => error.code === "invalid_yaml");
  assert.throws(() => store.createInlineSource({
    name: "synthetic-alpn-over",
    yamlContent: [
      "proxies:",
      "  - name: SG",
      "    type: hysteria2",
      "    server: 203.0.113.12",
      "    port: 443",
      "    password: synthetic-hy2",
      "    alpn:",
      `      - ${"b".repeat(256)}`
    ].join("\n"),
    tiers: ["monthly_basic"]
  }), (error) => error.code === "invalid_yaml");
});

test("omitted enabled stays unpublished and enabled true publishes", () => {
  const { store } = createStore();
  const created = store.createInlineSource({
    name: "synthetic-source",
    yamlContent: SS_YAML,
    tiers: ["monthly_basic", "yearly"]
  });
  assert.equal(created.enabled, false);
  assert.equal(store.listActiveServersForPlan("monthly_basic").length, 0);
  const published = store.patchSource(created.id, { enabled: true });
  assert.equal(published.enabled, true);
  const delivered = store.listActiveServersForPlan("monthly_basic");
  assert.equal(delivered.length, 2);
  assert.equal(delivered.every((node) => node.thirdParty === true && node.autoEligible === false), true);
  assert.equal(delivered.every((node) => Object.hasOwn(node, "dedupKey") === false), true);
  assertNoSecret(store.getSummary());
});

test("regionOverride is applied and malformed or rejected input leaves no rows", () => {
  const { store, database, network } = createStore();
  const overridden = store.createInlineSource({
    name: "synthetic-region",
    yamlContent: REGION_YAML,
    regionOverride: "jp",
    tiers: ["monthly_plus"]
  });
  const country = database.prepare(
    "select country_code from platform_third_party_nodes where source_id = ?"
  ).get(overridden.id);
  assert.equal(country.country_code, "JP");

  assert.throws(() => store.createInlineSource({
    name: "bad-yaml",
    yamlContent: "proxies: [",
    tiers: ["monthly_basic"]
  }), (error) => {
    assert.equal(error.message, error.code);
    return error.code === "invalid_yaml" || error.code === "parse_no_valid_nodes";
  });
  assert.throws(() => store.createInlineSource({
    name: "too-big",
    yamlContent: "a".repeat((64 * 1024) + 1),
    tiers: ["monthly_basic"]
  }), (error) => error?.code === "invalid_yaml");
  assert.throws(() => store.createInlineSource({
    name: "both",
    yamlContent: SS_YAML,
    subscriptionUrl: SOURCE_URL,
    tiers: ["monthly_basic"]
  }), (error) => error?.code === "invalid_input");
  assert.throws(() => store.createInlineSource({
    name: "extra",
    yamlContent: SS_YAML,
    tiers: ["monthly_basic"],
    filePath: "D:\\unused\\secret-sub.yaml"
  }), (error) => error?.code === "invalid_input");
  assert.equal(counts(database).sources, 1);
  assert.equal(network.calls, 0);
});

test("protector failure during node write rolls the inline import back", () => {
  const database = appliedDatabase();
  const base = createPortalTotpSecretProtector({ key: SECRET_KEY });
  let calls = 0;
  const store = createSqliteThirdPartySubscriptionStore({
    database,
    secretProtector: {
      protect(value) {
        calls += 1;
        if (calls > 1) {
          const error = new Error("boom synthetic-password");
          error.code = "ECONNRESET";
          throw error;
        }
        return base.protect(value);
      },
      unprotect: (value) => base.unprotect(value)
    },
    fetchFn: async () => {
      throw new Error("network");
    },
    resolveFn: async () => {
      throw new Error("dns");
    }
  });
  assert.throws(() => store.createInlineSource({
    name: "synthetic-source",
    yamlContent: SS_YAML,
    tiers: ["monthly_basic"]
  }), (error) => error?.code === "ECONNRESET");
  assert.ok(calls > 1);
  assert.deepEqual(counts(database), { sources: 0, tiers: 0, nodes: 0 });
});

test("preview returns counts only and URL refresh does not touch last-good rows", async () => {
  const { store, database, secretProtector, network } = createStore();
  const preview = store.previewInlineYaml({ yamlContent: SS_YAML });
  assert.equal(preview.encoding, "yaml");
  assert.equal(preview.counts.valid, 2);
  assert.deepEqual(preview.byProtocol, { ss: 2, vless: 0, hysteria2: 0, tuic: 0 });
  assert.deepEqual(preview.byCountry, { HK: 1, JP: 1 });
  assert.equal(Object.hasOwn(preview, "nodes"), false);
  assert.equal(JSON.stringify(preview).includes("synthetic-password"), false);
  assert.equal(JSON.stringify(preview).includes("203.0.113.10"), false);
  assert.deepEqual(counts(database), { sources: 0, tiers: 0, nodes: 0 });

  const legacy = insertLegacyRemote(database, secretProtector);
  const delivered = store.listActiveServersForPlan("monthly_basic");
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].countryCode, "HK");
  assert.equal(delivered[0].protocol, "ss");
  assert.equal(Object.hasOwn(delivered[0], "dedupKey"), false);
  assert.equal(Object.hasOwn(delivered[0], "fingerprint"), false);
  assert.equal(JSON.stringify(delivered).includes(legacy.dedupKey), false);
  const listed = store.listSources().find((source) => source.id === legacy.id);
  assert.equal(listed.sourceKind, "remote");
  assertNoSecret(listed);

  database.prepare("update platform_third_party_sources set protected_url = ? where id = ?")
    .run("plaintext-url", legacy.id);
  const before = sourceSnapshot(database);
  await assert.rejects(
    () => store.refreshSource(legacy.id),
    (error) => error?.code === "remote_refresh_disabled"
  );
  assert.throws(() => store.createSource({
    name: "remote",
    subscriptionUrl: SOURCE_URL,
    tiers: ["monthly_basic"]
  }), (error) => error?.code === "remote_import_disabled");
  await assert.rejects(
    () => store.refreshSource("missing"),
    (error) => error?.code === "not_found"
  );
  assert.deepEqual(sourceSnapshot(database), before);
  assert.equal(network.calls, 0);
});
