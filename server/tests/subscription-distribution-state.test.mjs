import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { createRuntimeState } from "../state.mjs";
import { buildSourceValidationTestEnvironment } from "../../scripts/source-validation-test-runner.mjs";
import { applyThirdPartySubscriptionMigrations, REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID, REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM } from "../services/platform/third-party-subscription-migrations.mjs";
import { applySubscriptionDistributionMigrations, REQUIRED_SUBSCRIPTION_DISTRIBUTION_MIGRATION_ID, REQUIRED_SUBSCRIPTION_DISTRIBUTION_DDL_CHECKSUM } from "../services/platform/subscription-distribution-migrations.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const NOW = new Date("2026-10-19T00:00:00Z");

function fixture(t, extra = {}) {
  const directory = mkdtempSync(join(tmpdir(), "distribution-state-"));
  let state;
  t.after(async () => { await state?.close(); rmSync(directory, { recursive: true, force: true }); });
  const { prepare, ...runtimeOptions } = extra;
  const prepared = prepare?.(directory) ?? {};
  const env = { ...buildSourceValidationTestEnvironment({}, { repositoryRoot: ROOT }), CONSOLE_TOKEN: "synthetic-distribution-state", ...prepared.env, ...extra.env };
  state = createRuntimeState({
    rootDir: ROOT, controlDbPath: join(directory, "control.sqlite"),
    subscriptionDbPath: join(directory, "subscriptions.sqlite"), autoStartHttpProxy: false,
    subscriptionNowFn: () => NOW, ...runtimeOptions, env
  });
  return { state, directory };
}

function tenant(core) {
  const created = core.createTenant({ displayName: "synthetic tenant", expiresAt: "2026-11-19T00:00:00Z" });
  return { ...created, token: new URL(created.subscriptionUrl).searchParams.get("token") };
}

test("distribution remains default off and never creates a policy database", (t) => {
  const { state } = fixture(t);
  assert.deepEqual(state.subscriptionDistribution, { enabled: false, available: false, store: null });
});

test("explicit feature without prepared store fails closed for authenticated subscriptions", (t) => {
  const { state } = fixture(t, { env: { SUBSCRIPTION_DISTRIBUTION_ENABLED: "true" } });
  assert.equal(state.subscriptionDistribution.enabled, true);
  assert.equal(state.subscriptionDistribution.available, false);
  const created = tenant(state.subscriptions.core);
  const result = state.subscriptions.core.resolveSubscriptionToken(created.token);
  assert.equal(result.status, 503);
  assert.equal(result.error, "subscription_distribution_unavailable");
});

test("runtime binds policy selection after construction while preserving original token", (t) => {
  let calls = 0;
  let closed = 0;
  const selected = { name: "synthetic-external", host: "203.0.113.200", port: 8388, method: "aes-256-gcm", password: "synthetic-selected" };
  const distributionStore = {
    available: true,
    resolveProxyConfig({ tenant: user, baseProxyConfig }) {
      calls += 1;
      assert.equal(user.status, "active");
      return { proxyConfig: { ...baseProxyConfig, servers: [selected] }, distributionManaged: true };
    },
    close() { closed += 1; }
  };
  const { state } = fixture(t, { env: { SUBSCRIPTION_DISTRIBUTION_ENABLED: "true" }, subscriptionDistributionStore: distributionStore });
  const created = tenant(state.subscriptions.core);
  const result = state.subscriptions.core.resolveSubscriptionToken(created.token);
  assert.equal(result.ok, true);
  assert.equal(result.distributionManaged, true);
  assert.equal(result.proxyConfig.servers[0], selected);
  assert.equal(calls, 1);
  state.close();
  assert.equal(closed, 1);
});

test("feature off never invokes injected selector and keeps native access rules", (t) => {
  let calls = 0;
  const { state } = fixture(t, { subscriptionDistributionStore: { available: true, resolveProxyConfig() { calls += 1; throw new Error("must not call"); }, close() {} } });
  const created = tenant(state.subscriptions.core);
  state.subscriptions.core.resolveSubscriptionToken(created.token);
  assert.equal(calls, 0);
});

function preparedImportedDatabase(directory, distributionSchema) {
  const dbPath = join(directory, "third-party.sqlite");
  const db = new Database(dbPath);
  try {
    applyThirdPartySubscriptionMigrations({ database: db,
      expectedMigrationId: REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
      expectedDdlChecksum: REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM });
    if (distributionSchema) applySubscriptionDistributionMigrations({ database: db,
      expectedMigrationId: REQUIRED_SUBSCRIPTION_DISTRIBUTION_MIGRATION_ID,
      expectedDdlChecksum: REQUIRED_SUBSCRIPTION_DISTRIBUTION_DDL_CHECKSUM });
  } finally { db.close(); }
  return { env: { THIRD_PARTY_SUBSCRIPTION_ENABLED: "true", THIRD_PARTY_SUBSCRIPTION_DB_PATH: dbPath,
    THIRD_PARTY_SUBSCRIPTION_SECRET_KEY: "12".repeat(32), SUBSCRIPTION_DISTRIBUTION_ENABLED: "true" } };
}

test("real runtime leaves missing distribution schema untouched in prepared imported-source DB", (t) => {
  const { state, directory } = fixture(t, { prepare: (path) => preparedImportedDatabase(path, false) });
  assert.equal(state.thirdPartySubscriptions.available, true);
  assert.equal(state.subscriptionDistribution.available, false);
  const db = new Database(join(directory, "third-party.sqlite"), { readonly: true });
  try {
    assert.equal(db.prepare("select count(*) as n from sqlite_master where name like 'platform_subscription_distribution_%'").get().n, 0);
    assert.equal(db.prepare("select count(*) as n from platform_schema_migrations where migration_id = ?").get(REQUIRED_SUBSCRIPTION_DISTRIBUTION_MIGRATION_ID).n, 0);
  } finally { db.close(); }
});

test("real runtime binds explicitly migrated policy DB and closes its connection", (t) => {
  const { state } = fixture(t, { prepare: (path) => preparedImportedDatabase(path, true) });
  assert.equal(state.thirdPartySubscriptions.available, true);
  assert.equal(state.subscriptionDistribution.available, true);
  const snapshot = state.subscriptionDistribution.store.getSnapshot();
  assert.equal(snapshot.routes.length, 3);
  assert.equal(snapshot.routes.every((route) => route.mode === "owned" && route.nodeIds.length === 0), true);
  assert.equal(snapshot.owned.items.length > 0, true);
  state.close();
  assert.throws(() => state.subscriptionDistribution.store.getSnapshot(), { code: "distribution_unavailable" });
});

test("real runtime exposes default-off client automation and binds only explicit flags", (t) => {
  const defaults = fixture(t, { prepare: path => preparedImportedDatabase(path, true) });
  assert.equal(defaults.state.subscriptionDistribution.store.getSnapshot().automation.clientHealthCheckEnabled, false);
  assert.equal(defaults.state.subscriptionDistribution.store.getSnapshot().automation.dailyRotationEnabled, false);
  const enabled = fixture(t, { prepare: path => preparedImportedDatabase(path, true), env: {
    SUBSCRIPTION_DISTRIBUTION_CLIENT_HEALTH_ENABLED: "true", SUBSCRIPTION_DISTRIBUTION_DAILY_ROTATION_ENABLED: "true"
  } });
  assert.deepEqual(enabled.state.subscriptionDistribution.store.getSnapshot().automation, {
    clientHealthCheckEnabled: true, dailyRotationEnabled: true, healthCheckIntervalSeconds: 300, rotationTimezone: "UTC"
  });
  const unrelated = fixture(t, { prepare: path => preparedImportedDatabase(path, true), env: {
    SUBSCRIPTION_DISTRIBUTION_CLIENT_HEALTH_ENABLED: "arbitrary", SUBSCRIPTION_DISTRIBUTION_DAILY_ROTATION_ENABLED: "enabled"
  } });
  assert.equal(unrelated.state.subscriptionDistribution.store.getSnapshot().automation.clientHealthCheckEnabled, false);
  assert.equal(unrelated.state.subscriptionDistribution.store.getSnapshot().automation.dailyRotationEnabled, false);
});

test("BWH actual control is opt-in and an unavailable host never permits native rendering", t => {
  const { state } = fixture(t, { prepare: path => preparedImportedDatabase(path, true), env: { BWH_SUPPLY_CONTROL_ENABLED: "true" },
    bwhSupplyHost: { durableIntent: true, readStatus: () => { throw new Error("private host detail"); },
      allowsNativeDistribution: () => false, async setEnabled() { throw new Error("must not call"); } } });
  assert.equal(state.subscriptionDistribution.supply.enabled, true);
  assert.equal(state.subscriptionDistribution.supply.read().state, "unavailable");
  const created = tenant(state.subscriptions.core);
  const result = state.subscriptions.core.resolveSubscriptionToken(created.token);
  assert.equal(result.status, 503);
  assert.equal(result.error, "subscription_distribution_unavailable");
  assert.equal(JSON.stringify(state.subscriptionDistribution.supply.read()).includes("private"), false);
});

test("BWH actual control with an injected verified paused host blocks native but leaves its control service reachable", t => {
  const paused = { revision: "d".repeat(64), state: "paused", protocolsRunning: 0, collectorState: "paused",
    nativeDistributionEnabled: false, observedAt: NOW.toISOString(), canPause: false, canEnable: true };
  const { state } = fixture(t, { prepare: path => preparedImportedDatabase(path, true), env: { BWH_SUPPLY_CONTROL_ENABLED: "true" },
    bwhSupplyHost: { durableIntent: true, readStatus: () => paused, allowsNativeDistribution: () => false,
      async setEnabled() { throw new Error("must not call"); } } });
  assert.equal(state.subscriptionDistribution.supply.read().state, "paused");
  assert.equal(state.subscriptionDistribution.supply.allowsNativeDistribution(), false);
  assert.equal(state.subscriptionDistribution.store.available, true);
  assert.equal(state.subscriptions.core.resolveSubscriptionToken(tenant(state.subscriptions.core).token).status, 503);
});
