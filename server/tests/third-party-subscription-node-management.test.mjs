import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { createPortalTotpSecretProtector } from "../services/platform/portal-totp-verifier.mjs";
import {
  applyThirdPartySubscriptionMigrations,
  REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
  REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM
} from "../services/platform/third-party-subscription-migrations.mjs";
import { createSqliteThirdPartySubscriptionStore } from "../services/platform/third-party-subscription-store.mjs";
import { createThirdPartyNodeManagement } from "../services/platform/third-party-subscription-node-management.mjs";

const at = () => new Date("2026-10-13T00:00:00.000Z");
const yaml = `proxies:
  - {name: JP first, type: ss, server: 192.0.2.1, port: 8388, cipher: aes-256-gcm, password: synthetic-secret-one}
  - {name: JP second, type: ss, server: 192.0.2.2, port: 8388, cipher: aes-256-gcm, password: synthetic-secret-two}
  - {name: US entry, type: vless, server: 192.0.2.3, port: 443, uuid: 11111111-1111-4111-8111-111111111111}`;

function fixture(t, path = ":memory:") {
  const database = new Database(path);
  t.after(() => database.close());
  applyThirdPartySubscriptionMigrations({ database,
    expectedMigrationId: REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
    expectedDdlChecksum: REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM, nowFn: at });
  const secretProtector = createPortalTotpSecretProtector({ key: Buffer.alloc(32, 17) });
  const store = createSqliteThirdPartySubscriptionStore({ database, secretProtector, nowFn: at });
  const source = store.createInlineSource({ name: "Synthetic", yamlContent: yaml, tiers: ["monthly_basic"], enabled: false });
  const management = createThirdPartyNodeManagement({ database, secretProtector, nowFn: at });
  return { database, secretProtector, store, source, management };
}

function inputOf(view, overrides = {}) {
  return { revision: view.revision, nodes: view.items.map(({ id, customName }) => ({ id, customName })), ...overrides };
}
function snapshot(database) {
  return {
    sources: database.prepare("select * from platform_third_party_sources order by id").all(),
    nodes: database.prepare("select * from platform_third_party_nodes order by id").all()
  };
}
function rejects(code, action) {
  assert.throws(action, (error) => error.code === code && error.message === code);
}

for (const sourceEnabled of [false, true]) {
  test(`single-node pause/resume preserves source and all other rows (source enabled ${sourceEnabled})`, (t) => {
    const { database, secretProtector, source, store } = fixture(t);
    let view = store.listSourceNodes(source.id);
    const named = inputOf(view);
    named.nodes[0] = { ...named.nodes[0], customName: "Target alias", customCountryCode: "SG" };
    store.saveSourceNodes(source.id, named);
    store.patchSource(source.id, { enabled: sourceEnabled });
    view = store.listSourceNodes(source.id);
    assert.ok(view.items.every(node => node.enabled === true));
    const target = view.items[0];
    const before = snapshot(database);
    const paused = store.setSourceNodeEnabled(source.id, target.id, { revision: view.revision, enabled: false });
    assert.equal(paused.enabled, sourceEnabled);
    assert.equal(paused.items.length, view.items.length);
    assert.deepEqual(paused.items, view.items.map(node => node.id === target.id ? { ...node, enabled: false } : node));
    assert.notEqual(paused.revision, view.revision);
    const after = snapshot(database);
    assert.deepEqual(after.nodes.filter(node => node.id !== target.id), before.nodes.filter(node => node.id !== target.id));
    const old = before.nodes.find(node => node.id === target.id);
    const current = after.nodes.find(node => node.id === target.id);
    assert.deepEqual({ ...current, protected_config: old.protected_config }, old);
    const config = JSON.parse(secretProtector.unprotect(current.protected_config));
    assert.equal(config.adminDisabled, true);
    delete config.adminDisabled;
    assert.deepEqual(config, JSON.parse(secretProtector.unprotect(old.protected_config)));
    assert.equal(store.listActiveServersForPlan("monthly_basic").length, sourceEnabled ? 2 : 0);
    assert.ok(store.listActiveServersForPlan("monthly_basic").every(node => node.id !== target.id && !Object.hasOwn(node, "adminDisabled")));
    assert.deepEqual(store.setSourceNodeEnabled(source.id, target.id, { revision: paused.revision, enabled: false }), paused);
    assert.deepEqual(snapshot(database), after, "idempotent operation does not rewrite ciphertext");
    rejects("revision_conflict", () => store.setSourceNodeEnabled(source.id, target.id, { revision: view.revision, enabled: false }));
    const resumed = store.setSourceNodeEnabled(source.id, target.id, { revision: paused.revision, enabled: true });
    assert.deepEqual(resumed.items, view.items);
    assert.equal(resumed.enabled, sourceEnabled);
    assert.equal(store.listActiveServersForPlan("monthly_basic").length, sourceEnabled ? 3 : 0);
    assert.ok(store.listActiveServersForPlan("monthly_basic").every(node => !Object.hasOwn(node, "adminDisabled")));
  });
}

test("legacy full-list saves and source enable preserve paused node state", (t) => {
  const { source, store } = fixture(t);
  let view = store.listSourceNodes(source.id);
  const target = view.items[0];
  view = store.setSourceNodeEnabled(source.id, target.id, { revision: view.revision, enabled: false });
  view = store.saveSourceNodes(source.id, inputOf(view));
  assert.equal(view.items[0].enabled, false);
  view = store.enableSourceNodes(source.id, { revision: view.revision });
  assert.equal(view.items[0].enabled, false);
  assert.equal(store.listActiveServersForPlan("monthly_basic").length, 2);
});

test("single-node deletion requires pause, preserves every other row and cannot restore deleted rows", (t) => {
  const { database, source, store } = fixture(t);
  store.patchSource(source.id, { enabled: true });
  let view = store.listSourceNodes(source.id);
  const target = view.items[0];
  const before = snapshot(database);
  rejects("node_enabled", () => store.deleteSourceNode(source.id, target.id, { revision: view.revision }));
  assert.deepEqual(snapshot(database), before);
  view = store.setSourceNodeEnabled(source.id, target.id, { revision: view.revision, enabled: false });
  const paused = snapshot(database);
  const deleted = store.deleteSourceNode(source.id, target.id, { revision: view.revision });
  assert.equal(deleted.enabled, true);
  assert.deepEqual(deleted.items, view.items.filter(node => node.id !== target.id));
  assert.notEqual(deleted.revision, view.revision);
  const after = snapshot(database);
  assert.deepEqual(after.nodes, paused.nodes.map(node => node.id === target.id ? { ...node, active: 0 } : node));
  for (const action of [
    () => store.setSourceNodeEnabled(source.id, target.id, { revision: deleted.revision, enabled: true }),
    () => store.deleteSourceNode(source.id, target.id, { revision: deleted.revision })
  ]) rejects("not_found", action);
  assert.deepEqual(snapshot(database), after);
});

test("deleting the final paused node leaves enabled source intact with empty rendering", (t) => {
  const { database, source, store } = fixture(t);
  store.patchSource(source.id, { enabled: true });
  let view = store.listSourceNodes(source.id);
  for (const node of [...view.items]) {
    view = store.setSourceNodeEnabled(source.id, node.id, { revision: view.revision, enabled: false });
    view = store.deleteSourceNode(source.id, node.id, { revision: view.revision });
  }
  assert.equal(view.enabled, true);
  assert.deepEqual(view.items, []);
  assert.deepEqual(store.listActiveServersForPlan("monthly_basic"), []);
  assert.equal(database.prepare("select count(*) as n from platform_third_party_nodes").get().n, 3);
});

test("single-node operations reject wrong source and stale revision without writes", (t) => {
  const { database, source, store } = fixture(t);
  const other = store.createInlineSource({ name: "Other", yamlContent: yaml, tiers: ["yearly"] });
  const view = store.listSourceNodes(source.id);
  const wrongId = store.listSourceNodes(other.id).items[0].id;
  const before = snapshot(database);
  for (const action of [
    () => store.setSourceNodeEnabled(source.id, wrongId, { revision: view.revision, enabled: false }),
    () => store.deleteSourceNode(source.id, wrongId, { revision: view.revision })
  ]) rejects("not_found", action);
  assert.deepEqual(snapshot(database), before);
  const target = view.items[0].id;
  store.setSourceNodeEnabled(source.id, target, { revision: view.revision, enabled: false });
  const paused = snapshot(database);
  rejects("revision_conflict", () => store.deleteSourceNode(source.id, target, { revision: view.revision }));
  assert.deepEqual(snapshot(database), paused);
});

for (const invalid of [null, 0, 1, "true", "false", [], {}]) {
  test(`stored invalid adminDisabled fails closed: ${JSON.stringify(invalid)}`, (t) => {
    const { database, secretProtector, source, store } = fixture(t);
    store.patchSource(source.id, { enabled: true });
    const view = store.listSourceNodes(source.id);
    const target = view.items[0].id;
    const row = database.prepare("select protected_config from platform_third_party_nodes where id = ?").get(target);
    const config = JSON.parse(secretProtector.unprotect(row.protected_config));
    config.adminDisabled = invalid;
    database.prepare("update platform_third_party_nodes set protected_config = ? where id = ?").run(secretProtector.protect(JSON.stringify(config)), target);
    rejects("protected_value_invalid", () => store.listSourceNodes(source.id));
    assert.equal(store.listActiveServersForPlan("monthly_basic").length, 2);
    assert.ok(store.listActiveServersForPlan("monthly_basic").every(node => node.id !== target));
  });
}

test("single-node operations validate exact bodies and strict boolean without writes", (t) => {
  const { database, source, store } = fixture(t);
  const view = store.listSourceNodes(source.id);
  const id = view.items[0].id;
  const before = snapshot(database);
  for (const input of [null, [], {}, { revision: view.revision }, { revision: view.revision, enabled: null },
    { revision: view.revision, enabled: "false" }, { revision: view.revision, enabled: false, active: 0 }]) {
    rejects("invalid_input", () => store.setSourceNodeEnabled(source.id, id, input));
  }
  for (const input of [null, [], {}, { revision: "bad" }, { revision: view.revision, enabled: false }]) {
    rejects("invalid_input", () => store.deleteSourceNode(source.id, id, input));
  }
  assert.deepEqual(snapshot(database), before);
});

for (const operation of ["pause", "delete"]) {
  test(`single-node ${operation} rolls back when source timestamp update fails`, (t) => {
    const { database, source, store } = fixture(t);
    let view = store.listSourceNodes(source.id);
    const target = view.items[0].id;
    if (operation === "delete") view = store.setSourceNodeEnabled(source.id, target, { revision: view.revision, enabled: false });
    const before = snapshot(database);
    database.exec("create trigger synthetic_single_abort before update on platform_third_party_sources begin select raise(abort, 'synthetic-private-error'); end");
    rejects("third_party_unavailable", () => operation === "pause"
      ? store.setSourceNodeEnabled(source.id, target, { revision: view.revision, enabled: false })
      : store.deleteSourceNode(source.id, target, { revision: view.revision }));
    assert.deepEqual(snapshot(database), before);
  });
}

test("single-node mutation rejects invalid protected state and protector failure without writes", (t) => {
  const { database, secretProtector, source, store } = fixture(t);
  const view = store.listSourceNodes(source.id);
  const target = view.items[0].id;
  const row = database.prepare("select protected_config from platform_third_party_nodes where id = ?").get(target);
  const before = snapshot(database);
  const invalidConfig = createThirdPartyNodeManagement({ database, nowFn: at, secretProtector: {
    protect: secretProtector.protect,
    unprotect(value) {
      if (value !== row.protected_config) return secretProtector.unprotect(value);
      return JSON.stringify({ ...JSON.parse(secretProtector.unprotect(value)), adminDisabled: "false" });
    }
  } });
  rejects("protected_value_invalid", () => invalidConfig.setSourceNodeEnabled(source.id, target, { revision: view.revision, enabled: true }));
  rejects("protected_value_invalid", () => invalidConfig.deleteSourceNode(source.id, target, { revision: view.revision }));
  const brokenProtector = createThirdPartyNodeManagement({ database, nowFn: at, secretProtector: {
    unprotect: secretProtector.unprotect,
    protect() { throw new Error("synthetic-private-error"); }
  } });
  rejects("protected_value_invalid", () => brokenProtector.setSourceNodeEnabled(source.id, target, { revision: view.revision, enabled: false }));
  assert.deepEqual(snapshot(database), before);
});

test("unavailable store exposes both single-node methods without schema writes", (t) => {
  const database = new Database(":memory:");
  t.after(() => database.close());
  const store = createSqliteThirdPartySubscriptionStore({ database });
  rejects("third_party_unavailable", () => store.setSourceNodeEnabled("unknown", "unknown", { revision: "0".repeat(64), enabled: false }));
  rejects("third_party_unavailable", () => store.deleteSourceNode("unknown", "unknown", { revision: "0".repeat(64) }));
  assert.equal(database.prepare("select count(*) as n from sqlite_master").get().n, 0);
});

test("country override is encrypted, survives reopening and leaves identity material untouched", (t) => {
  const { database, secretProtector, store, source } = fixture(t);
  const before = snapshot(database);
  const view = store.listSourceNodes(source.id);
  const input = inputOf(view);
  input.nodes[0].customCountryCode = "SG";
  input.nodes[0].customName = "🇯🇵🇺🇸 专线";
  store.saveSourceNodes(source.id, input);
  const reopened = createSqliteThirdPartySubscriptionStore({ database, secretProtector, nowFn: at });
  const saved = reopened.listSourceNodes(source.id);
  assert.equal(saved.items[0].customCountryCode, "SG");
  assert.equal(saved.items[0].countryCode, view.items[0].countryCode);
  assert.equal(saved.items[0].customName, "🇯🇵🇺🇸 专线");
  assert.equal(saved.items[0].displayName, "🇸🇬 专线");
  assert.equal(saved.items[0].defaultName, view.items[0].defaultName);
  const old = before.nodes.find(row => row.id === saved.items[0].id);
  const row = database.prepare("select * from platform_third_party_nodes where id = ?").get(old.id);
  for (const key of Object.keys(old).filter(key => key !== "protected_config")) assert.deepEqual(row[key], old[key]);
  const config = JSON.parse(secretProtector.unprotect(row.protected_config));
  assert.equal(config.adminCountryCode, "SG");
  delete config.adminCountryCode;
  delete config.adminDisplayName;
  assert.deepEqual(config, JSON.parse(secretProtector.unprotect(old.protected_config)));
  reopened.enableSourceNodes(source.id, { revision: saved.revision });
  const active = reopened.listActiveServersForPlan("monthly_basic").find(item => item.id === old.id);
  assert.equal(active.thirdPartyCountryOverride, "SG");
  assert.equal(Object.hasOwn(active, "adminCountryCode"), false);
});

test("legacy country omission preserves override, explicit null restores original projection", (t) => {
  const { management, source } = fixture(t);
  const original = management.listSourceNodes(source.id);
  const change = inputOf(original); change.nodes[0].customCountryCode = "OTHER";
  let view = management.saveSourceNodes(source.id, change);
  assert.equal(view.items[0].customCountryCode, "OTHER");
  assert.equal(view.items[0].defaultName, original.items[0].defaultName);
  view = management.saveSourceNodes(source.id, inputOf(view));
  assert.equal(view.items[0].customCountryCode, "OTHER");
  const reset = inputOf(view); reset.nodes[0].customCountryCode = null;
  view = management.saveSourceNodes(source.id, reset);
  assert.equal(Object.hasOwn(view.items[0], "customCountryCode"), false);
  assert.deepEqual(view.items, original.items);
});

for (const value of ["", "sg", "ZZ", "UK", "USA", " US", "US\n", 3, {}, [], true]) {
  test(`invalid country override rejected atomically: ${JSON.stringify(value)}`, (t) => {
    const { database, management, source } = fixture(t);
    const before = snapshot(database);
    const input = inputOf(management.listSourceNodes(source.id));
    input.nodes[0].customCountryCode = value;
    rejects("invalid_input", () => management.saveSourceNodes(source.id, input));
    assert.deepEqual(snapshot(database), before);
  });
}

test("country override cannot bypass enabled source, revision or transaction rollback protections", (t) => {
  const { database, management, source, store } = fixture(t);
  const original = management.listSourceNodes(source.id);
  const input = inputOf(original); input.nodes[0].customCountryCode = "SG";
  const saved = management.saveSourceNodes(source.id, input);
  rejects("revision_conflict", () => management.saveSourceNodes(source.id, input));
  management.enableSourceNodes(source.id, { revision: saved.revision });
  const enabled = inputOf(management.listSourceNodes(source.id)); enabled.nodes[0].customCountryCode = "US";
  rejects("source_enabled", () => management.saveSourceNodes(source.id, enabled));
  store.patchSource(source.id, { enabled: false });
  const attempt = inputOf(management.listSourceNodes(source.id)); attempt.nodes.forEach(node => { node.customCountryCode = "JP"; });
  const before = snapshot(database);
  database.exec(`create trigger synthetic_country_abort before update of protected_config on platform_third_party_nodes
    when old.id = '${attempt.nodes[1].id}' begin select raise(abort, 'synthetic-private-error'); end`);
  rejects("third_party_unavailable", () => management.saveSourceNodes(source.id, attempt));
  assert.deepEqual(snapshot(database), before);
});

test("country choice persists across an actual SQLite close and reopen", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "third-party-country-persistence-"));
  const path = join(directory, "synthetic.sqlite");
  let database = new Database(path);
  t.after(() => { if (database.open) database.close(); rmSync(directory, { recursive: true, force: true }); });
  applyThirdPartySubscriptionMigrations({ database,
    expectedMigrationId: REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
    expectedDdlChecksum: REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM, nowFn: at });
  const secretProtector = createPortalTotpSecretProtector({ key: Buffer.alloc(32, 19) });
  const options = { database, secretProtector, nowFn: at };
  let store = createSqliteThirdPartySubscriptionStore(options);
  const source = store.createInlineSource({ name: "Synthetic", yamlContent: yaml, tiers: ["monthly_basic"] });
  const view = store.listSourceNodes(source.id);
  const input = inputOf(view); input.nodes[0].customCountryCode = "GB";
  const saved = store.saveSourceNodes(source.id, input);
  database.close();
  database = new Database(path);
  store = createSqliteThirdPartySubscriptionStore({ ...options, database });
  assert.deepEqual(store.listSourceNodes(source.id), saved);
  store.enableSourceNodes(source.id, { revision: saved.revision });
  const active = store.listActiveServersForPlan("monthly_basic").find(node => node.id === view.items[0].id);
  assert.equal(active.thirdPartyCountryOverride, "GB");
  assert.equal(Object.hasOwn(active, "adminCountryCode"), false);
});

test("country flag substitution cannot create same-source duplicate aliases", (t) => {
  const { database, management, source } = fixture(t);
  const input = inputOf(management.listSourceNodes(source.id));
  input.nodes[0] = { ...input.nodes[0], customName: "🇯🇵 Node", customCountryCode: "SG" };
  input.nodes[1] = { ...input.nodes[1], customName: "🇺🇸 node", customCountryCode: "SG" };
  const before = snapshot(database);
  rejects("duplicate_node_name", () => management.saveSourceNodes(source.id, input));
  assert.deepEqual(snapshot(database), before);
});

test("flagged aliases that collide only after truncation whitespace trimming are rejected atomically", (t) => {
  const { database, management, source } = fixture(t);
  const input = inputOf(management.listSourceNodes(source.id));
  input.nodes[0] = { ...input.nodes[0], customName: `${"x".repeat(122)} y`, customCountryCode: "US" };
  input.nodes[1] = { ...input.nodes[1], customName: "x".repeat(122), customCountryCode: "US" };
  const before = snapshot(database);
  rejects("duplicate_node_name", () => management.saveSourceNodes(source.id, input));
  assert.deepEqual(snapshot(database), before);
});

test("same raw alias with different explicit country flags is allowed", (t) => {
  const { management, source } = fixture(t);
  const input = inputOf(management.listSourceNodes(source.id));
  input.nodes[0] = { ...input.nodes[0], customName: "Node", customCountryCode: "JP" };
  input.nodes[1] = { ...input.nodes[1], customName: "Node", customCountryCode: "US" };
  const saved = management.saveSourceNodes(source.id, input);
  assert.deepEqual(saved.items.slice(0, 2).map(item => item.displayName), ["🇯🇵 Node", "🇺🇸 Node"]);
});

for (const alias of ["🇯🇵 🇺🇸", "🇯🇵 DIRECT", "🇸🇬 reject", "🇸🇬 Auto"]) {
  test(`OTHER override cannot expose empty or reserved alias: ${alias}`, (t) => {
    const { management, source, database } = fixture(t);
    const before = snapshot(database);
    const input = inputOf(management.listSourceNodes(source.id));
    input.nodes[0] = { ...input.nodes[0], customName: alias, customCountryCode: "OTHER" };
    rejects("invalid_node_name", () => management.saveSourceNodes(source.id, input));
    assert.deepEqual(snapshot(database), before);
  });
}

test("node management returns only explicit public fields and deterministic defaults", (t) => {
  const { management, source } = fixture(t);
  const view = management.listSourceNodes(source.id);
  assert.deepEqual(Object.keys(view).sort(), ["enabled", "items", "revision", "sourceId"]);
  assert.match(view.revision, /^[a-f0-9]{64}$/);
  assert.equal(view.enabled, false);
  assert.equal(view.items.length, 3);
  for (const item of view.items) {
    assert.deepEqual(Object.keys(item).sort(), ["countryCode", "customName", "defaultName", "displayName", "enabled", "id", "originalName", "protocol"]);
    assert.equal(item.customName, null);
    assert.equal(item.displayName, item.defaultName);
    assert.match(item.defaultName, /^\[3P\] (JP|US) [12] \| /);
  }
  assert.equal(management.listSourceNodes(source.id).revision, view.revision);
  assert.doesNotMatch(JSON.stringify(view), /synthetic-secret|192\.0\.2|11111111|protected_|fingerprint|password|https:/);
});

test("save encrypts alias, preserves all credential material and logical-deletes omissions", (t) => {
  const { management, source, database, secretProtector } = fixture(t);
  const view = management.listSourceNodes(source.id);
  const originals = database.prepare("select * from platform_third_party_nodes order by id").all();
  const kept = view.items[0];
  const saved = management.saveSourceNodes(source.id, inputOf(view, { nodes: [{ id: kept.id, customName: "  东京专线  " }] }));
  assert.equal(saved.items.length, 1);
  assert.equal(saved.items[0].customName, "东京专线");
  assert.equal(saved.items[0].displayName, "东京专线");
  assert.notEqual(saved.revision, view.revision);
  for (const original of originals) {
    const row = database.prepare("select * from platform_third_party_nodes where id = ?").get(original.id);
    assert.equal(row.fingerprint, original.fingerprint);
    assert.equal(row.display_name, original.display_name);
    assert.equal(row.active, row.id === kept.id ? 1 : 0);
    const config = JSON.parse(secretProtector.unprotect(row.protected_config));
    const before = JSON.parse(secretProtector.unprotect(original.protected_config));
    if (row.id === kept.id) { assert.equal(config.adminDisplayName, "东京专线"); delete config.adminDisplayName; }
    assert.deepEqual(config, before);
    if (row.id !== kept.id) assert.equal(row.protected_config, original.protected_config);
    assert.ok(!row.protected_config.includes("东京专线"));
  }
});

for (const rawName of ["US\u200b Node", "US\u2060 Node", "US\ud800 Node", "\u200b\u2060"]) {
  test(`read-only display projection handles unsafe upstream label ${JSON.stringify(rawName)}`, (t) => {
    const { database, secretProtector, store } = fixture(t);
    const imported = store.createInlineSource({ name: `Source${rawName}`, tiers: ["monthly_basic"], enabled: false,
      yamlContent: `proxies:\n  - { name: ${JSON.stringify(rawName)}, type: ss, server: 192.0.2.20, port: 8388, cipher: aes-256-gcm, password: synthetic-only }` });
    const before = database.prepare("select * from platform_third_party_nodes where source_id = ?").all(imported.id);
    const view = store.listSourceNodes(imported.id);
    const listed = store.listSources().find((item) => item.id === imported.id);
    assert.equal(view.items.length, 1);
    for (const label of [listed.name, view.items[0].originalName, view.items[0].defaultName, view.items[0].displayName]) {
      assert.ok(label.length > 0 && label.length <= 128);
      assert.doesNotMatch(label, /[\u200b-\u200f\u2060-\u206f\ud800-\udfff]/u);
    }
    assert.deepEqual(database.prepare("select * from platform_third_party_nodes where source_id = ?").all(imported.id), before);
    const config = JSON.parse(secretProtector.unprotect(before[0].protected_config));
    assert.equal(config.name, rawName);
  });
}

test("null alias resets to default without changing original name", (t) => {
  const { management, source, database, secretProtector } = fixture(t);
  let view = management.listSourceNodes(source.id);
  const original = view.items[0].originalName;
  const named = inputOf(view); named.nodes[0].customName = "Custom";
  view = management.saveSourceNodes(source.id, named);
  const reset = inputOf(view); reset.nodes[0].customName = null;
  view = management.saveSourceNodes(source.id, reset);
  assert.equal(view.items[0].customName, null);
  assert.equal(view.items[0].originalName, original);
  assert.equal(view.items[0].displayName, view.items[0].defaultName);
  const config = JSON.parse(secretProtector.unprotect(database.prepare("select protected_config from platform_third_party_nodes where id = ?").get(view.items[0].id).protected_config));
  assert.equal(Object.hasOwn(config, "adminDisplayName"), false);
});

for (const value of ["DIRECT", "reject", "AUTO", "a\n", "a\u0085", "a\u202e", "a\u200b", "a\u2066", "😀".repeat(129), 3, {}, "\ud800"]) {
  test(`invalid node name rejected atomically: ${JSON.stringify(value)}`, (t) => {
    const { management, source, database } = fixture(t);
    const before = snapshot(database);
    const input = inputOf(management.listSourceNodes(source.id)); input.nodes[0].customName = value;
    rejects("invalid_node_name", () => management.saveSourceNodes(source.id, input));
    assert.deepEqual(snapshot(database), before);
  });
}

test("128 UTF-16 units allowed, emoji boundary enforced and whitespace resets", (t) => {
  const { management, source } = fixture(t);
  const input = inputOf(management.listSourceNodes(source.id)); input.nodes[0].customName = "😀".repeat(64);
  let view = management.saveSourceNodes(source.id, input);
  assert.equal(view.items[0].customName.length, 128);
  const oversized = inputOf(view); oversized.nodes[0].customName = "😀".repeat(65);
  rejects("invalid_node_name", () => management.saveSourceNodes(source.id, oversized));
  const reset = inputOf(view); reset.nodes[0].customName = "   ";
  view = management.saveSourceNodes(source.id, reset);
  assert.equal(view.items[0].customName, null);
});

test("case-insensitive collision rejected including another default name", (t) => {
  const { management, source } = fixture(t);
  const view = management.listSourceNodes(source.id);
  const input = inputOf(view);
  input.nodes[0].customName = "Tokyo"; input.nodes[1].customName = "tokyo";
  rejects("duplicate_node_name", () => management.saveSourceNodes(source.id, input));
  input.nodes[0].customName = view.items[1].defaultName.toLowerCase(); input.nodes[1].customName = null;
  rejects("duplicate_node_name", () => management.saveSourceNodes(source.id, input));
});

for (const change of [
  (input) => { input.extra = true; },
  (input) => { input.nodes[0].host = "192.0.2.99"; },
  (input) => { delete input.nodes[0].customName; },
  (input) => { input.nodes.push(input.nodes[0]); },
  (input) => { input.nodes[0].id = "unknown"; },
  (input) => { input.nodes = Array.from({ length: 257 }, () => input.nodes[0]); },
  (input) => { input.revision = "invalid"; }
]) {
  test("invalid save contract rejected without mutation", (t) => {
    const { management, source, database } = fixture(t);
    const before = snapshot(database);
    const input = inputOf(management.listSourceNodes(source.id)); change(input);
    rejects("invalid_input", () => management.saveSourceNodes(source.id, input));
    assert.deepEqual(snapshot(database), before);
  });
}

test("other-source or inactive node cannot be retained or reactivated", (t) => {
  const { management, source, database, store } = fixture(t);
  const other = store.createInlineSource({ name: "Other", yamlContent: yaml, tiers: ["yearly"] });
  let view = management.listSourceNodes(source.id);
  const input = inputOf(view); input.nodes[0].id = management.listSourceNodes(other.id).items[0].id;
  const before = snapshot(database);
  rejects("invalid_input", () => management.saveSourceNodes(source.id, input));
  assert.deepEqual(snapshot(database), before);
  const removed = view.items[0];
  view = management.saveSourceNodes(source.id, inputOf(view, { nodes: inputOf(view).nodes.slice(1) }));
  rejects("invalid_input", () => management.saveSourceNodes(source.id, inputOf(view, { nodes: [{ id: removed.id, customName: null }] })));
  assert.equal(management.listSourceNodes(other.id).items.length, 3);
});

test("empty save allowed but enable rejected; no physical rows deleted", (t) => {
  const { management, source, database } = fixture(t);
  const view = management.saveSourceNodes(source.id, inputOf(management.listSourceNodes(source.id), { nodes: [] }));
  assert.deepEqual(view.items, []);
  assert.equal(database.prepare("select count(*) as n from platform_third_party_nodes").get().n, 3);
  rejects("empty_source", () => management.enableSourceNodes(source.id, { revision: view.revision }));
});

test("enable verifies revision then enables saved source; enabled source cannot be saved", (t) => {
  const { management, source, store } = fixture(t);
  const view = management.listSourceNodes(source.id);
  rejects("revision_conflict", () => management.enableSourceNodes(source.id, { revision: "0".repeat(64) }));
  rejects("invalid_input", () => management.enableSourceNodes(source.id, { revision: view.revision, enabled: true }));
  const enabled = management.enableSourceNodes(source.id, { revision: view.revision });
  assert.equal(enabled.enabled, true);
  assert.notEqual(enabled.revision, view.revision);
  assert.equal(store.listActiveServersForPlan("monthly_basic").length, 3);
  rejects("source_enabled", () => management.saveSourceNodes(source.id, inputOf(enabled)));
});

test("revision detects same-timestamp changes across independent connections", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "third-party-node-management-"));
  const path = join(directory, "test.sqlite");
  const f = fixture(t, path);
  const second = new Database(path); t.after(() => second.close());
  // Hooks run in registration order; connections close before this owned directory.
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const other = createThirdPartyNodeManagement({ database: second, secretProtector: f.secretProtector, nowFn: at });
  const stale = f.management.listSourceNodes(f.source.id);
  const input = inputOf(other.listSourceNodes(f.source.id)); input.nodes[0].customName = "Other writer";
  const saved = other.saveSourceNodes(f.source.id, input);
  assert.notEqual(saved.revision, stale.revision);
  rejects("revision_conflict", () => f.management.saveSourceNodes(f.source.id, inputOf(stale)));
  rejects("revision_conflict", () => f.management.enableSourceNodes(f.source.id, { revision: stale.revision }));
  assert.equal(f.database.prepare("select updated_at from platform_third_party_sources where id = ?").get(f.source.id).updated_at, at().toISOString());
});

test("revision covers tier, inactive material and source state", (t) => {
  const { management, source, database, secretProtector } = fixture(t);
  const initial = management.listSourceNodes(source.id);
  let view = management.saveSourceNodes(source.id, inputOf(initial, { nodes: inputOf(initial).nodes.slice(1) }));
  for (const mutate of [
    () => database.prepare("insert into platform_third_party_source_tiers values (?, 'yearly')").run(source.id),
    () => database.prepare("update platform_third_party_nodes set protected_config = ? where id = ?").run(secretProtector.protect("{}"), initial.items[0].id),
    () => database.prepare("update platform_third_party_sources set name = 'changed' where id = ?").run(source.id)
  ]) {
    mutate(); const next = management.listSourceNodes(source.id);
    assert.notEqual(next.revision, view.revision);
    rejects("revision_conflict", () => management.saveSourceNodes(source.id, inputOf(view)));
    view = next;
  }
});

test("encryption failure rolls back earlier alias writes and all logical deletion", (t) => {
  const { management, source, database, secretProtector } = fixture(t);
  const input = inputOf(management.listSourceNodes(source.id));
  input.nodes = input.nodes.slice(0, 2).map((node, index) => ({ ...node, customName: `Changed ${index}` }));
  let calls = 0;
  const broken = createThirdPartyNodeManagement({ database, nowFn: at, secretProtector: {
    unprotect: secretProtector.unprotect,
    protect(value) { if (++calls === 2) throw new Error("synthetic-secret-must-not-escape"); return secretProtector.protect(value); }
  } });
  const before = snapshot(database);
  rejects("protected_value_invalid", () => broken.saveSourceNodes(source.id, input));
  assert.deepEqual(snapshot(database), before);
});

test("database failure after first write rolls back aliases, logical deletion and source metadata", (t) => {
  const { management, source, database } = fixture(t);
  const view = management.listSourceNodes(source.id);
  const input = inputOf(view, { nodes: view.items.slice(1).map((item, index) => ({ id: item.id, customName: `New ${index}` })) });
  const before = snapshot(database);
  // Fail the last node's write, after the first row was deactivated and second renamed.
  database.exec(`create trigger synthetic_node_write_abort before update of protected_config on platform_third_party_nodes
    when old.id = '${view.items[2].id}' begin select raise(abort, 'synthetic-private-error'); end`);
  rejects("third_party_unavailable", () => management.saveSourceNodes(source.id, input));
  assert.deepEqual(snapshot(database), before);
});

test("enable material validation fails closed inside the locked transaction", (t) => {
  const { management, source, database, secretProtector } = fixture(t);
  const view = management.listSourceNodes(source.id);
  const rows = database.prepare("select * from platform_third_party_nodes order by country_code, fingerprint, id").all();
  let calls = 0;
  const broken = createThirdPartyNodeManagement({ database, nowFn: at, secretProtector: {
    protect: secretProtector.protect,
    unprotect(value) { calls += 1; return value === rows[0].protected_config ? null : secretProtector.unprotect(value); }
  } });
  rejects("protected_value_invalid", () => broken.enableSourceNodes(source.id, { revision: view.revision }));
  assert.ok(calls >= 2);
  assert.equal(management.listSourceNodes(source.id).enabled, false);
});

test("corrupt encrypted config fails closed for list and enable without raw error", (t) => {
  const { management, source, database } = fixture(t);
  const view = management.listSourceNodes(source.id);
  database.prepare("update platform_third_party_nodes set protected_config = 'raw-secret' where id = ?").run(view.items[0].id);
  rejects("protected_value_invalid", () => management.listSourceNodes(source.id));
  const before = snapshot(database);
  rejects("revision_conflict", () => management.enableSourceNodes(source.id, { revision: view.revision }));
  assert.deepEqual(snapshot(database), before);
});

test("unavailable schema/protector fails without creating schema", (t) => {
  const database = new Database(":memory:"); t.after(() => database.close());
  const management = createThirdPartyNodeManagement({ database });
  rejects("third_party_unavailable", () => management.listSourceNodes("unknown"));
  assert.equal(database.prepare("select count(*) as n from sqlite_master").get().n, 0);
});

test("not found and legacy remote descriptor fail closed without mutation", (t) => {
  const { management, source, database, secretProtector } = fixture(t);
  rejects("not_found", () => management.listSourceNodes("unknown"));
  const view = management.listSourceNodes(source.id);
  database.prepare("update platform_third_party_sources set protected_url = ? where id = ?").run(secretProtector.protect("https://example.invalid/synthetic"), source.id);
  const before = snapshot(database);
  rejects("unsupported_source_kind", () => management.listSourceNodes(source.id));
  rejects("unsupported_source_kind", () => management.saveSourceNodes(source.id, inputOf(view)));
  rejects("unsupported_source_kind", () => management.enableSourceNodes(source.id, { revision: view.revision }));
  assert.deepEqual(snapshot(database), before);
});
