import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import express from "express";
import { buildSourceValidationTestEnvironment } from "../../scripts/source-validation-test-runner.mjs";
import { adminSubscriptionDistributionRoutes } from "../routes/admin-subscription-distribution.mjs";
import { openAdmittedBwhBandwidth } from "../services/platform/bwh-bandwidth-service.mjs";
import { applySubscriptionDistributionMigrations, REQUIRED_SUBSCRIPTION_DISTRIBUTION_DDL_CHECKSUM, REQUIRED_SUBSCRIPTION_DISTRIBUTION_MIGRATION_ID } from "../services/platform/subscription-distribution-migrations.mjs";
import { applyThirdPartySubscriptionMigrations, REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM, REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID } from "../services/platform/third-party-subscription-migrations.mjs";
import { createRuntimeState } from "../state.mjs";
import { listen } from "./helpers/listen.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const NOW = new Date("2026-10-19T00:00:00Z");
const ORIGIN = "https://admin.example.test";
const BANDWIDTH_KEYS = ["inboundEnabled", "inboundMbps", "outboundEnabled", "outboundMbps", "revision", "state"];

function boot(directory, extraEnv = {}, runtime = {}) {
  const env = {
    ...buildSourceValidationTestEnvironment({}, { repositoryRoot: ROOT }),
    CONSOLE_TOKEN: "synthetic-bandwidth-state",
    ...extraEnv
  };
  return createRuntimeState({
    rootDir: ROOT,
    controlDbPath: join(directory, "control.sqlite"),
    subscriptionDbPath: join(directory, "subscriptions.sqlite"),
    autoStartHttpProxy: false,
    subscriptionNowFn: () => NOW,
    ...runtime,
    env
  });
}

function preparedImportedDatabase(directory) {
  const dbPath = join(directory, "third-party.sqlite");
  const db = new Database(dbPath);
  try {
    applyThirdPartySubscriptionMigrations({
      database: db,
      expectedMigrationId: REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
      expectedDdlChecksum: REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM
    });
    applySubscriptionDistributionMigrations({
      database: db,
      expectedMigrationId: REQUIRED_SUBSCRIPTION_DISTRIBUTION_MIGRATION_ID,
      expectedDdlChecksum: REQUIRED_SUBSCRIPTION_DISTRIBUTION_DDL_CHECKSUM
    });
  } finally { db.close(); }
  return {
    THIRD_PARTY_SUBSCRIPTION_ENABLED: "true",
    THIRD_PARTY_SUBSCRIPTION_DB_PATH: dbPath,
    THIRD_PARTY_SUBSCRIPTION_SECRET_KEY: "12".repeat(32),
    SUBSCRIPTION_DISTRIBUTION_ENABLED: "true"
  };
}

function hold(t) {
  const directory = mkdtempSync(join(tmpdir(), "bwh-bandwidth-state-"));
  let state;
  t.after(async () => {
    await state?.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    directory,
    start(extraEnv = {}, runtime = {}) {
      state = boot(directory, extraEnv, runtime);
      return state;
    },
    replace(next) { state = next; }
  };
}

function tableCount(dbPath) {
  if (!existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true });
  try {
    return db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'bwh_shared_bandwidth_desired'").get().n;
  } finally { db.close(); }
}

function rowOf(dbPath) {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db.prepare("SELECT status, classification_proven, management_exempt_proven, revision, inbound_bps, outbound_bps, reason FROM bwh_shared_bandwidth_desired WHERE singleton = 1").get();
  } finally { db.close(); }
}

function setStatus(dbPath, status, reason = null) {
  const db = new Database(dbPath);
  try {
    db.prepare("UPDATE bwh_shared_bandwidth_desired SET status = ?, reason = ?, classification_proven = 0, management_exempt_proven = 0, proven_inbound_bps = NULL, proven_outbound_bps = NULL WHERE singleton = 1").run(status, reason);
  } finally { db.close(); }
}

function pausedHost(calls) {
  const paused = {
    revision: "d".repeat(64), state: "paused", protocolsRunning: 0, collectorState: "paused",
    nativeDistributionEnabled: false, observedAt: NOW.toISOString(), canPause: false, canEnable: true
  };
  return {
    durableIntent: true,
    readStatus: () => paused,
    allowsNativeDistribution: () => false,
    async setEnabled() { calls.supply += 1; throw new Error("supply must stay paused"); }
  };
}

function exposeAdmin(state) {
  state.platform.adminAuthRoutesEnabled = true;
  state.platform.adminAuth = state.platform.adminAuth || { synthetic: true };
  state.platform.adminBrowserOrigin = ORIGIN;
}

async function mount(t, state) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.adminPrincipal = { role: "admin" }; next(); });
  app.use(adminSubscriptionDistributionRoutes(state));
  const listened = await listen(app);
  t.after(() => { listened.server.closeAllConnections(); listened.server.close(); });
  return listened.baseUrl;
}

test("ordinary startup leaves bandwidth unadmitted and creates no schema", (t) => {
  const held = hold(t);
  const imported = preparedImportedDatabase(held.directory);
  const state = held.start(imported);
  assert.equal(state.bwhBandwidth, null);
  assert.equal(state.subscriptionDistribution.supply, undefined);
  assert.equal(tableCount(imported.THIRD_PARTY_SUBSCRIPTION_DB_PATH), 0);
  assert.equal(existsSync(join(held.directory, "bandwidth.sqlite")), false);
});

test("admission flag without an absolute file stays null and does not throw", (t) => {
  const held = hold(t);
  const imported = preparedImportedDatabase(held.directory);
  const relativeName = "bwh-bandwidth-a4-relative-must-not-exist.sqlite";
  for (const env of [
    { BWH_SHARED_BANDWIDTH_ADMITTED: "true" },
    { BWH_SHARED_BANDWIDTH_ADMITTED: "true", BWH_SHARED_BANDWIDTH_DB_PATH: relativeName },
    { BWH_SHARED_BANDWIDTH_ADMITTED: "true", BWH_SHARED_BANDWIDTH_DB_PATH: ":memory:" },
    { BWH_SHARED_BANDWIDTH_ADMITTED: "enabled", BWH_SHARED_BANDWIDTH_DB_PATH: join(held.directory, "ignored.sqlite") }
  ]) {
    const state = held.start({ ...imported, ...env });
    assert.equal(state.bwhBandwidth, null);
    state.close();
  }
  assert.equal(existsSync(join(process.cwd(), relativeName)), false);
  assert.equal(existsSync(join(ROOT, relativeName)), false);
  assert.equal(existsSync(join(held.directory, "ignored.sqlite")), false);
  assert.equal(tableCount(imported.THIRD_PARTY_SUBSCRIPTION_DB_PATH), 0);
});

test("a non-file absolute path fails closed without throwing from startup", (t) => {
  const held = hold(t);
  const dbPath = join(held.directory, "not-a-file");
  mkdirSync(dbPath);
  const state = held.start({ BWH_SHARED_BANDWIDTH_ADMITTED: "true", BWH_SHARED_BANDWIDTH_DB_PATH: dbPath });
  assert.equal(state.bwhBandwidth, null);
});

test("explicit absolute admission installs the schema and saves desired only", async (t) => {
  const held = hold(t);
  const dbPath = join(held.directory, "bandwidth.sqlite");
  const calls = { supply: 0 };
  const imported = preparedImportedDatabase(held.directory);
  const state = held.start({
    ...imported,
    BWH_SHARED_BANDWIDTH_ADMITTED: "true",
    BWH_SHARED_BANDWIDTH_DB_PATH: dbPath,
    BWH_SUPPLY_CONTROL_ENABLED: "true"
  }, { bwhSupplyHost: pausedHost(calls) });
  assert.equal(state.bwhBandwidth.admitted, true);
  assert.equal(tableCount(dbPath), 1);
  assert.equal(tableCount(imported.THIRD_PARTY_SUBSCRIPTION_DB_PATH), 0);
  const opened = state.bwhBandwidth.read();
  assert.equal(opened.state, "desired");
  assert.equal(opened.inboundEnabled, false);
  assert.equal(opened.outboundEnabled, false);
  assert.equal(opened.inboundMbps, null);
  assert.equal(opened.reason, null);
  const saved = state.bwhBandwidth.save({
    bandwidthRevision: opened.revision, inboundEnabled: true, outboundEnabled: false, inboundMbps: "1.5", outboundMbps: "0.1"
  });
  assert.equal(saved.state, "desired");
  assert.equal(saved.inboundMbps, "1.5");
  assert.equal(saved.outboundMbps, null);
  assert.notEqual(saved.revision, opened.revision);
  const stored = rowOf(dbPath);
  assert.equal(stored.status, "desired");
  assert.equal(stored.classification_proven, 0);
  assert.equal(stored.management_exempt_proven, 0);
  assert.equal(stored.inbound_bps, 1500000);
  assert.equal(stored.outbound_bps, null);
  assert.equal(calls.supply, 0);
  assert.equal(state.subscriptionDistribution.supply.read().state, "paused");
  assert.equal(existsSync(join(held.directory, "bwh-bandwidth-attempt.json")), false);
  state.close();
  assert.throws(() => state.bwhBandwidth.read(), { code: "bwh_bandwidth_unavailable" });
  assert.throws(() => state.bwhBandwidth.save({
    bandwidthRevision: saved.revision, inboundEnabled: false, outboundEnabled: false, inboundMbps: "0.1", outboundMbps: "0.1"
  }), { code: "bwh_bandwidth_unavailable" });
  const restarted = boot(held.directory, {
    ...imported,
    BWH_SHARED_BANDWIDTH_ADMITTED: "true",
    BWH_SHARED_BANDWIDTH_DB_PATH: dbPath
  });
  held.replace(restarted);
  const again = restarted.bwhBandwidth.read();
  assert.equal(again.state, "desired");
  assert.equal(again.inboundMbps, "1.5");
  assert.equal(rowOf(dbPath).status, "desired");
  assert.equal(restarted.subscriptionDistribution.supply, undefined);
});

test("direct admission refuses missing consent, relative paths, links, and non-files", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "bwh-bandwidth-direct-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const dbPath = join(directory, "bandwidth.sqlite");
  assert.throws(() => openAdmittedBwhBandwidth({ dbPath, admit: false }), { code: "bwh_bandwidth_admission_required" });
  assert.throws(() => openAdmittedBwhBandwidth({ dbPath }), { code: "bwh_bandwidth_admission_required" });
  assert.equal(existsSync(dbPath), false);
  assert.throws(() => openAdmittedBwhBandwidth({ dbPath: "bandwidth.sqlite", admit: true }), { code: "bwh_bandwidth_invalid" });
  assert.throws(() => openAdmittedBwhBandwidth({ dbPath: `${dbPath}\0`, admit: true }), { code: "bwh_bandwidth_invalid" });
  const asDirectory = join(directory, "directory-path");
  mkdirSync(asDirectory);
  assert.throws(() => openAdmittedBwhBandwidth({ dbPath: asDirectory, admit: true }), { code: "bwh_bandwidth_invalid" });
  const target = join(directory, "target.sqlite");
  writeFileSync(target, "");
  const link = join(directory, "link.sqlite");
  let linkError = null;
  try { symlinkSync(target, link); } catch (error) { linkError = error; }
  if (!linkError) {
    assert.throws(() => openAdmittedBwhBandwidth({ dbPath: link, admit: true }), { code: "bwh_bandwidth_invalid" });
    assert.equal(readFileSync(target, "utf8"), "");
  } else {
    assert.ok(["EPERM", "ENOTSUP", "EACCES"].includes(linkError.code));
  }
  const source = readFileSync(fileURLToPath(new URL("../services/platform/bwh-bandwidth-service.mjs", import.meta.url)), "utf8");
  assert.equal(source.includes("applyPlan"), false);
  assert.equal(source.includes("executeOwnedBandwidth"), false);
  assert.equal(source.includes("bwh-supply"), false);
  assert.equal(source.includes("setTimeout"), false);
  assert.equal(source.includes("child_process"), false);
  const stateSource = readFileSync(fileURLToPath(new URL("../state.mjs", import.meta.url)), "utf8");
  assert.equal(stateSource.includes("applyPlan"), false);
  assert.equal(stateSource.includes("executeOwnedBandwidth"), false);
  assert.equal(stateSource.includes("applyBwhBandwidthSchema"), false);
});

test("an injected bandwidth service is not replaced or closed by startup", (t) => {
  const held = hold(t);
  const dbPath = join(held.directory, "must-not-open.sqlite");
  let closed = 0;
  const injected = {
    admitted: false,
    read() { return { revision: "a".repeat(64), state: "desired", inboundEnabled: false, outboundEnabled: false, inboundMbps: null, outboundMbps: null }; },
    save() { throw Object.assign(new Error("must not save"), { code: "bwh_bandwidth_conflict" }); },
    close() { closed += 1; }
  };
  const state = held.start({
    BWH_SHARED_BANDWIDTH_ADMITTED: "true",
    BWH_SHARED_BANDWIDTH_DB_PATH: dbPath
  }, { bwhBandwidth: injected });
  assert.equal(state.bwhBandwidth, injected);
  state.close();
  assert.equal(closed, 0);
  assert.equal(existsSync(dbPath), false);
});

test("real admin route reads and saves the admitted service without resuming supply", async (t) => {
  const held = hold(t);
  const dbPath = join(held.directory, "bandwidth.sqlite");
  const calls = { supply: 0 };
  const imported = preparedImportedDatabase(held.directory);
  const state = held.start({
    ...imported,
    BWH_SHARED_BANDWIDTH_ADMITTED: "true",
    BWH_SHARED_BANDWIDTH_DB_PATH: dbPath,
    BWH_SUPPLY_CONTROL_ENABLED: "true"
  }, { bwhSupplyHost: pausedHost(calls) });
  exposeAdmin(state);
  const before = state.subscriptionDistribution.store.getSnapshot();
  const baseUrl = await mount(t, state);
  const headers = { "content-type": "application/json", origin: ORIGIN, "sec-fetch-site": "same-origin" };
  const openedResponse = await fetch(`${baseUrl}/api/admin/third-party-subscriptions/distribution`, { headers });
  const opened = await openedResponse.json();
  assert.equal(openedResponse.status, 200);
  assert.deepEqual(Object.keys(opened.bwhBandwidth).sort(), BANDWIDTH_KEYS);
  assert.equal(opened.bwhBandwidth.state, "desired");
  assert.equal(opened.bwhSupply.state, "paused");
  const body = {
    bandwidthRevision: opened.bwhBandwidth.revision, inboundEnabled: true, outboundEnabled: false, inboundMbps: "1.5", outboundMbps: "0.1"
  };
  const denied = await fetch(`${baseUrl}/api/admin/third-party-subscriptions/distribution/bandwidth`, {
    method: "PUT", headers: { ...headers, origin: "https://evil.example.test" }, body: JSON.stringify(body)
  });
  assert.equal(denied.status, 403);
  await denied.arrayBuffer();
  const accepted = await fetch(`${baseUrl}/api/admin/third-party-subscriptions/distribution/bandwidth`, {
    method: "PUT", headers, body: JSON.stringify(body)
  });
  const acceptedText = await accepted.text();
  const acceptedBody = JSON.parse(acceptedText);
  assert.equal(accepted.status, 200);
  assert.equal(acceptedBody.bwhBandwidth.state, "desired");
  assert.equal(acceptedBody.bwhBandwidth.inboundMbps, "1.5");
  assert.equal(acceptedBody.bwhBandwidth.outboundMbps, null);
  assert.deepEqual(Object.keys(acceptedBody.bwhBandwidth).sort(), BANDWIDTH_KEYS);
  assert.equal(acceptedBody.bwhSupply.state, "paused");
  const bandwidthText = JSON.stringify(acceptedBody.bwhBandwidth);
  for (const secret of ["ifb-gccgw-bwh", "0xb100", "classification_unproven", "private-host-detail", dbPath, "reason"]) {
    assert.equal(bandwidthText.includes(secret), false);
  }
  assert.equal(acceptedText.includes("ifb-gccgw-bwh"), false);
  assert.equal(acceptedText.includes("0xb100"), false);
  assert.equal(calls.supply, 0);
  const after = state.subscriptionDistribution.store.getSnapshot();
  assert.equal(JSON.stringify(after.routes), JSON.stringify(before.routes));
  assert.equal(rowOf(dbPath).status, "desired");
  const zero = await fetch(`${baseUrl}/api/admin/third-party-subscriptions/distribution/bandwidth`, {
    method: "PUT", headers, body: JSON.stringify({ ...body, bandwidthRevision: acceptedBody.bwhBandwidth.revision, inboundMbps: "0" })
  });
  assert.equal(zero.status, 400);
  assert.equal((await zero.json()).error, "bwh_bandwidth_invalid");
  const conflict = await fetch(`${baseUrl}/api/admin/third-party-subscriptions/distribution/bandwidth`, {
    method: "PUT", headers, body: JSON.stringify(body)
  });
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error, "bwh_bandwidth_conflict");
  assert.equal(rowOf(dbPath).revision, acceptedBody.bwhBandwidth.revision);
  assert.equal(calls.supply, 0);
  const current = acceptedBody.bwhBandwidth.revision;
  for (const status of ["unknown", "applying"]) {
    setStatus(dbPath, status, "private-host-detail");
    const blocked = await fetch(`${baseUrl}/api/admin/third-party-subscriptions/distribution/bandwidth`, {
      method: "PUT", headers, body: JSON.stringify({ ...body, bandwidthRevision: current })
    });
    const blockedText = await blocked.text();
    assert.equal(blocked.status, 409);
    assert.equal(JSON.parse(blockedText).error, "bwh_bandwidth_conflict");
    assert.equal(blockedText.includes("private-host-detail"), false);
    assert.equal(rowOf(dbPath).status, status);
    assert.equal(rowOf(dbPath).revision, current);
  }
  setStatus(dbPath, "applied", "private-host-detail");
  const forged = await fetch(`${baseUrl}/api/admin/third-party-subscriptions/distribution`, { headers });
  const forgedText = await forged.text();
  const forgedBody = JSON.parse(forgedText);
  assert.equal(forged.status, 200);
  assert.equal(forgedBody.bwhBandwidth.state, "failed");
  assert.deepEqual(Object.keys(forgedBody.bwhBandwidth).sort(), BANDWIDTH_KEYS);
  assert.equal(JSON.stringify(forgedBody.bwhBandwidth).includes("applied"), false);
  assert.equal(forgedText.includes("private-host-detail"), false);
  assert.equal(forgedText.includes("ifb-gccgw-bwh"), false);
  assert.equal(state.bwhBandwidth.read().state, "failed");
  assert.equal(state.bwhBandwidth.read().reason, "classification_unproven");
  assert.equal(rowOf(dbPath).status, "applied");
  assert.equal(calls.supply, 0);
  assert.equal(state.subscriptionDistribution.supply.read().state, "paused");
});

test("missing admission stays an unavailable bandwidth response", async (t) => {
  const held = hold(t);
  const calls = { supply: 0 };
  const imported = preparedImportedDatabase(held.directory);
  const state = held.start({ ...imported, BWH_SUPPLY_CONTROL_ENABLED: "true" }, { bwhSupplyHost: pausedHost(calls) });
  assert.equal(state.bwhBandwidth, null);
  exposeAdmin(state);
  const baseUrl = await mount(t, state);
  const headers = { "content-type": "application/json", origin: ORIGIN, "sec-fetch-site": "same-origin" };
  const opened = await fetch(`${baseUrl}/api/admin/third-party-subscriptions/distribution`, { headers });
  const openedBody = await opened.json();
  assert.equal(opened.status, 200);
  assert.equal(Object.hasOwn(openedBody, "bwhBandwidth"), false);
  assert.equal(openedBody.bwhSupply.state, "paused");
  const missing = await fetch(`${baseUrl}/api/admin/third-party-subscriptions/distribution/bandwidth`, {
    method: "PUT", headers,
    body: JSON.stringify({
      bandwidthRevision: "a".repeat(64), inboundEnabled: false, outboundEnabled: false, inboundMbps: "0.1", outboundMbps: "0.1"
    })
  });
  const missingText = await missing.text();
  assert.equal(missing.status, 503);
  assert.deepEqual(JSON.parse(missingText), { error: "bwh_bandwidth_unavailable" });
  assert.equal(missingText.includes("bwhBandwidth"), false);
  assert.equal(calls.supply, 0);
  assert.equal(state.subscriptionDistribution.supply.read().state, "paused");
  assert.equal(tableCount(imported.THIRD_PARTY_SUBSCRIPTION_DB_PATH), 0);
});
