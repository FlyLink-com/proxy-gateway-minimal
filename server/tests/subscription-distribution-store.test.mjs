import assert from "node:assert/strict";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { createSqliteSubscriptionDistributionStore } from "../services/platform/subscription-distribution-store.mjs";
import { applySubscriptionDistributionMigrations, REQUIRED_SUBSCRIPTION_DISTRIBUTION_MIGRATION_ID, REQUIRED_SUBSCRIPTION_DISTRIBUTION_DDL_CHECKSUM } from "../services/platform/subscription-distribution-migrations.mjs";
import { applyThirdPartySubscriptionMigrations, REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID, REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM } from "../services/platform/third-party-subscription-migrations.mjs";
import { createSqliteThirdPartySubscriptionStore } from "../services/platform/third-party-subscription-store.mjs";
import { createPortalTotpSecretProtector } from "../services/platform/portal-totp-verifier.mjs";

const NOW = new Date("2026-10-19T00:00:00.000Z");
const TIERS = ["monthly_basic", "monthly_plus", "yearly"];
const Y = "proxies:\n  - name: partner-one\n    type: ss\n    server: 203.0.113.10\n    port: 8388\n    cipher: aes-256-gcm\n    password: synthetic-only-secret\n  - name: partner-two\n    type: ss\n    server: 203.0.113.11\n    port: 8388\n    cipher: aes-256-gcm\n    password: synthetic-second-secret\n";
const eligibility = () => ({ getThirdPartySubscriptionEligibilityByTenantRefs: () => ({ state: "bound", binding: { plan: "offerv_plan_30d_50gb_monthly_v1", trafficLimitBytes: 50 * 1024 ** 3 } }) });
function apply(database) {
  applyThirdPartySubscriptionMigrations({ database, expectedMigrationId: REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID, expectedDdlChecksum: REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM });
  applySubscriptionDistributionMigrations({ database, expectedMigrationId: REQUIRED_SUBSCRIPTION_DISTRIBUTION_MIGRATION_ID, expectedDdlChecksum: REQUIRED_SUBSCRIPTION_DISTRIBUTION_DDL_CHECKSUM });
}
function fixture(options = {}) {
  const database = new Database(":memory:");
  apply(database);
  const thirdPartyStore = createSqliteThirdPartySubscriptionStore({ database, secretProtector: createPortalTotpSecretProtector({ key: "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff" }), nowFn: () => NOW });
  const proxyConfig = { servers: [
    { name: "bwh-vless", protocol: "vless", countryCode: "US", host: "198.51.100.1", port: 443, uuid: "11111111-1111-4111-8111-111111111111", credentialRef: "synthetic-credential", autoEligible: true, qualityClass: "stable" },
    { name: "bwh-tuic", protocol: "tuic", countryCode: "US", host: "198.51.100.1", port: 8443, password: "native-secret", maintenance: true }
  ] };
  const store = createSqliteSubscriptionDistributionStore({ database, thirdPartyStore, proxyConfig, controlStore: options.controlStore || eligibility(), nowFn: () => NOW });
  const source = thirdPartyStore.createInlineSource({ name: "Synthetic inline", yamlContent: Y, tiers: options.tiers || TIERS, enabled: true });
  return { database, store, thirdPartyStore, source, proxyConfig, close: () => database.close() };
}
function selectThirdParty(store, { nodeIds, planId = "monthly_basic" } = {}) {
  const snapshot = store.getSnapshot();
  return store.writeRoutes({ revision: snapshot.revision, routes: snapshot.routes.map(route => route.planId === planId
    ? { ...route, mode: "third-party", nodeIds: nodeIds || snapshot.candidates.map(item => item.id) } : route) });
}
function ownedInput(snapshot) {
  return { revision: snapshot.revision, enabled: snapshot.owned.enabled, nodes: snapshot.owned.items.map(item => ({ id: item.id, enabled: item.enabled, customName: item.customName, customCountryCode: item.customCountryCode ?? null })) };
}
const code = expected => error => error?.code === expected;

test("runtime fails closed without migration and never creates missing files or tables", () => {
  const database = new Database(":memory:");
  try {
    const store = createSqliteSubscriptionDistributionStore({ database, proxyConfig: { servers: [] } });
    assert.equal(store.available, false);
    assert.throws(() => store.getSnapshot(), code("distribution_unavailable"));
    assert.equal(database.prepare("select count(*) as n from sqlite_master").get().n, 0);
  } finally { database.close(); }
  const directory = mkdtempSync(join(tmpdir(), "distribution-store-"));
  try {
    const path = join(directory, "missing.sqlite");
    assert.equal(createSqliteSubscriptionDistributionStore({ dbPath: path, proxyConfig: { servers: [] } }).available, false);
    assert.equal(existsSync(path), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("snapshot defaults every tier to owned and returns only safe inventory fields", () => {
  const f = fixture();
  try {
    const snapshot = f.store.getSnapshot();
    assert.match(snapshot.revision, /^[a-f0-9]{64}$/);
    assert.deepEqual(snapshot.routes, TIERS.map(planId => ({ planId, mode: "owned", nodeIds: [] })));
    assert.equal(snapshot.owned.enabled, true);
    assert.match(snapshot.owned.items[0].id, /^ownnode_[a-f0-9]{32}$/);
    assert.equal(snapshot.owned.items[0].available, true);
    assert.equal(snapshot.owned.items[1].available, false);
    assert.equal(snapshot.candidates.length, 2);
    assert.equal(snapshot.candidates.every(item => item.sourceEnabled && item.enabled), true);
    const output = JSON.stringify(snapshot);
    for (const secret of ["198.51.100.1", "203.0.113.10", "native-secret", "synthetic-only-secret", "uuid", "credentialRef", "protected_", "host", "port"]) assert.equal(output.includes(secret), false, secret);
  } finally { f.close(); }
});

test("owned labels/country/pause persist without mutating native identity, credentials or AUTO flags", () => {
  const f = fixture();
  try {
    const before = structuredClone(f.proxyConfig);
    const snapshot = f.store.getSnapshot();
    const input = ownedInput(snapshot);
    input.nodes[0].customName = "US optimized";
    input.nodes[0].customCountryCode = "US";
    const saved = f.store.writeOwned(input);
    assert.notEqual(saved.revision, snapshot.revision);
    assert.equal(saved.owned.items[0].displayName, "🇺🇸 US optimized");
    const result = f.store.resolveProxyConfig({ tenant: { id: "synthetic", status: "active" }, baseProxyConfig: f.proxyConfig, resolveOwnedProxyConfig: () => f.proxyConfig });
    assert.equal(result.distributionManaged, true);
    assert.equal(result.proxyConfig.servers.length, 1);
    assert.equal(result.proxyConfig.servers[0].name, "bwh-vless");
    assert.equal(result.proxyConfig.servers[0].uuid, before.servers[0].uuid);
    assert.equal(result.proxyConfig.servers[0].autoEligible, true);
    assert.equal(result.proxyConfig.servers[0].subscriptionDisplayName, "🇺🇸 US optimized");
    assert.deepEqual(f.proxyConfig, before);
    assert.equal(JSON.stringify(f.database.prepare("select * from platform_subscription_distribution_owned").all()).includes("native-secret"), false);
  } finally { f.close(); }
});

test("owned exact inventory rejects omissions, duplicates, invalid aliases and colliding output labels", () => {
  const f = fixture();
  try {
    const snapshot = f.store.getSnapshot();
    const base = ownedInput(snapshot);
    assert.throws(() => f.store.writeOwned({ ...base, nodes: base.nodes.slice(1) }), code("invalid_input"));
    assert.throws(() => f.store.writeOwned({ ...base, nodes: [base.nodes[0], base.nodes[0]] }), code("invalid_input"));
    for (const customName of ["AUTO", "\u0001label", "a".repeat(129), "\ud800", " "]) {
      assert.throws(() => f.store.writeOwned({ ...base, nodes: base.nodes.map(node => ({ ...node, customName })) }), code("invalid_node_name"));
    }
    assert.throws(() => f.store.writeOwned({ ...base, nodes: base.nodes.map(node => ({ ...node, customName: "Same" })) }), code("duplicate_node_name"));
    assert.throws(() => f.store.writeOwned({ ...base, nodes: base.nodes.map(node => ({ ...node, customCountryCode: "ZZ" })) }), code("invalid_input"));
    assert.equal(f.store.getSnapshot().revision, snapshot.revision);
  } finally { f.close(); }
});

test("save requires all three tiers and enabled eligible third-party selections", () => {
  const f = fixture({ tiers: ["monthly_basic"] });
  try {
    const snapshot = f.store.getSnapshot();
    assert.throws(() => f.store.writeRoutes({ revision: snapshot.revision, routes: snapshot.routes.slice(0, 1) }), code("invalid_input"));
    assert.throws(() => selectThirdParty(f.store, { planId: "yearly" }), code("invalid_input"));
    assert.throws(() => selectThirdParty(f.store, { nodeIds: [] }), code("empty_source"));
    assert.throws(() => selectThirdParty(f.store, { nodeIds: [snapshot.candidates[0].id, snapshot.candidates[0].id] }), code("invalid_input"));
    const selected = selectThirdParty(f.store, { nodeIds: [snapshot.candidates[0].id] });
    assert.deepEqual(selected.routes[0].nodeIds, [snapshot.candidates[0].id]);
  } finally { f.close(); }
});

test("selected third-party replaces BWH and bypasses a rejecting native gate", () => {
  const f = fixture();
  try {
    const id = f.store.getSnapshot().candidates[0].id;
    selectThirdParty(f.store, { nodeIds: [id] });
    let nativeCalls = 0;
    const result = f.store.resolveProxyConfig({ tenant: { id: "synthetic", status: "active" }, baseProxyConfig: f.proxyConfig,
      resolveOwnedProxyConfig: () => { nativeCalls += 1; throw new Error("material unavailable"); } });
    assert.equal(nativeCalls, 0);
    assert.equal(result.proxyConfig.servers.length, 1);
    assert.equal(result.proxyConfig.servers[0].id, id);
    assert.equal(result.proxyConfig.servers[0].thirdParty, true);
    assert.equal(result.proxyConfig.servers[0].autoEligible, false);
    assert.equal(result.proxyConfig.servers.some(server => server.name === "bwh-vless"), false);
  } finally { f.close(); }
});

test("third-party selected source pause or target deletion fails closed without native fallback", () => {
  for (const pause of [true, false]) {
    const f = fixture();
    try {
      const id = f.store.getSnapshot().candidates[0].id;
      selectThirdParty(f.store, { nodeIds: [id] });
      if (pause) f.thirdPartyStore.patchSource(f.source.id, { enabled: false });
      else {
        const snapshot = f.thirdPartyStore.listSourceNodes(f.source.id);
        f.thirdPartyStore.setSourceNodeEnabled(f.source.id, id, { revision: snapshot.revision, enabled: false });
      }
      let calls = 0;
      assert.throws(() => f.store.resolveProxyConfig({ tenant: { id: "synthetic", status: "active" }, baseProxyConfig: f.proxyConfig,
        resolveOwnedProxyConfig: () => { calls += 1; return f.proxyConfig; } }), code("distribution_unavailable"));
      assert.equal(calls, 0);
    } finally { f.close(); }
  }
});

test("unqualified, revoked and expired tenants never get third-party config", () => {
  for (const tenant of [{ id: "synthetic", status: "expired" }, { id: "synthetic", status: "revoked" }, { status: "active" }]) {
    const f = fixture();
    try {
      selectThirdParty(f.store);
      let calls = 0;
      const result = f.store.resolveProxyConfig({ tenant, baseProxyConfig: f.proxyConfig, resolveOwnedProxyConfig: () => { calls += 1; return f.proxyConfig; } });
      assert.equal(calls, 1);
      assert.equal(result.proxyConfig.servers.every(server => !server.thirdParty), true);
    } finally { f.close(); }
  }
  const f = fixture({ controlStore: { getThirdPartySubscriptionEligibilityByTenantRefs: () => ({ state: "unbound" }) } });
  try {
    selectThirdParty(f.store);
    assert.throws(() => f.store.resolveProxyConfig({ tenant: { id: "synthetic", status: "active" }, baseProxyConfig: f.proxyConfig, resolveOwnedProxyConfig: () => { throw new Error("denied"); } }), code("distribution_unavailable"));
  } finally { f.close(); }
});

test("revision binds native eligibility and full third-party encrypted materials even with fixed clock", () => {
  const f = fixture();
  try {
    const before = f.store.getSnapshot();
    f.proxyConfig.servers[0].maintenance = true;
    assert.throws(() => f.store.writeOwned(ownedInput(before)), code("revision_conflict"));
    const next = f.store.getSnapshot();
    f.database.prepare("update platform_third_party_nodes set protected_config = protected_config || 'x' where id = ?").run(next.candidates[0].id);
    assert.throws(() => f.store.writeRoutes({ revision: next.revision, routes: next.routes }), code("distribution_unavailable"));
  } finally { f.close(); }
});

test("owned distribution pause stops only output, keeps upstream config intact, and clearing restores default labels", () => {
  const f = fixture();
  try {
    const original = JSON.stringify(f.proxyConfig);
    const initial = ownedInput(f.store.getSnapshot());
    initial.enabled = false;
    f.store.writeOwned(initial);
    assert.throws(() => f.store.resolveProxyConfig({ tenant: { id: "synthetic", status: "active" }, baseProxyConfig: f.proxyConfig, resolveOwnedProxyConfig: () => f.proxyConfig }), code("empty_source"));
    assert.equal(JSON.stringify(f.proxyConfig), original);
    const restore = ownedInput(f.store.getSnapshot());
    restore.enabled = true;
    const saved = f.store.writeOwned(restore);
    assert.equal(saved.owned.items[0].displayName, "bwh-vless");
  } finally { f.close(); }
});

test("a second SQLite connection detects policy drift and concurrent writer locks are not retried", () => {
  const directory = mkdtempSync(join(tmpdir(), "distribution-lock-"));
  const path = join(directory, "shared.sqlite");
  const db = new Database(path), peer = new Database(path);
  try {
    apply(db);
    const proxyConfig = { servers: [{ name: "native", protocol: "ss" }] };
    const one = createSqliteSubscriptionDistributionStore({ database: db, proxyConfig });
    const two = createSqliteSubscriptionDistributionStore({ database: peer, proxyConfig });
    const old = one.getSnapshot();
    two.writeOwned(ownedInput(two.getSnapshot()));
    assert.throws(() => one.writeRoutes({ revision: old.revision, routes: old.routes }), code("revision_conflict"));
    db.pragma("busy_timeout = 0");
    peer.exec("begin immediate");
    const current = one.getSnapshot();
    assert.throws(() => one.writeRoutes({ revision: current.revision, routes: current.routes }), code("distribution_unavailable"));
    peer.exec("rollback");
    assert.equal(one.getSnapshot().revision, current.revision);
  } finally { peer.close(); db.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("owned/default hot path does not decrypt or list unrelated third-party sources", () => {
  const f = fixture();
  try {
    f.thirdPartyStore.listSources = () => { throw new Error("unrelated source unavailable"); };
    f.thirdPartyStore.listSourceNodes = () => { throw new Error("unrelated source unavailable"); };
    f.thirdPartyStore.listActiveServersForPlan = () => { throw new Error("must not read third-party"); };
    const result = f.store.resolveProxyConfig({ tenant: { id: "synthetic", status: "active" }, baseProxyConfig: f.proxyConfig, resolveOwnedProxyConfig: () => f.proxyConfig });
    assert.equal(result.proxyConfig.servers[0].name, "bwh-vless");
  } finally { f.close(); }
});

test("third-party hot path ignores native catalog/materials and unrelated Admin source projections", () => {
  const f = fixture();
  try {
    selectThirdParty(f.store);
    f.thirdPartyStore.listSources = () => { throw new Error("admin projection unavailable"); };
    f.thirdPartyStore.listSourceNodes = () => { throw new Error("admin projection unavailable"); };
    f.proxyConfig.servers = null;
    const result = f.store.resolveProxyConfig({ tenant: { id: "synthetic", status: "active" }, baseProxyConfig: f.proxyConfig, resolveOwnedProxyConfig: () => { throw new Error("native missing"); } });
    assert.equal(result.proxyConfig.servers.length, 2);
    assert.equal(result.proxyConfig.servers.every(server => server.thirdParty), true);
  } finally { f.close(); }
});

test("valid third-party changes at the same clock invalidate old revision; node removals cannot be saved over", () => {
  const f = fixture();
  try {
    const old = f.store.getSnapshot();
    const snapshot = f.thirdPartyStore.listSourceNodes(f.source.id);
    f.thirdPartyStore.setSourceNodeEnabled(f.source.id, snapshot.items[0].id, { revision: snapshot.revision, enabled: false });
    assert.notEqual(f.store.getSnapshot().revision, old.revision);
    assert.throws(() => f.store.writeRoutes({ revision: old.revision, routes: old.routes }), code("revision_conflict"));
    assert.throws(() => f.store.writeOwned(ownedInput(old)), code("revision_conflict"));
  } finally { f.close(); }
});

test("protocol aliases match native core and unsafe oversized policies are rejected", () => {
  const f = fixture();
  try {
    f.proxyConfig.servers = [
      { name: "hy2", clashType: "hy2" }, { name: "ss", type: "shadowsocks-libev" },
      { name: "vless", type: "vless" }, { name: "tuic", protocol: "tuic" }
    ];
    assert.deepEqual(f.store.getSnapshot().owned.items.map(item => item.protocol), ["hysteria2", "ss", "vless", "tuic"]);
    const snapshot = f.store.getSnapshot();
    const tooMany = Array.from({ length: 257 }, (_, index) => `tpnode_${index.toString(16).padStart(32, "0")}`);
    assert.throws(() => selectThirdParty(f.store, { nodeIds: tooMany }), code("invalid_input"));
    f.database.prepare("insert into platform_subscription_distribution_routes(plan_id,mode,node_ids_json,updated_at) values(?,?,?,?)").run("monthly_basic", "third-party", JSON.stringify(tooMany), "at");
    assert.throws(() => f.store.resolveProxyConfig({ tenant: { id: "synthetic", status: "active" }, baseProxyConfig: f.proxyConfig, resolveOwnedProxyConfig: () => f.proxyConfig }), code("distribution_unavailable"));
    f.database.prepare("delete from platform_subscription_distribution_routes").run();
    f.proxyConfig.servers = Array.from({ length: 257 }, (_, index) => ({ name: `native-${index}` }));
    assert.throws(() => f.store.getSnapshot(), code("distribution_unavailable"));
    assert.equal(typeof snapshot.revision, "string");
  } finally { f.close(); }
});
