import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Database from "better-sqlite3";
import { fullMeteringDigest, initializeFullMeteringJournal, readFullMeteringJournal, withFullMeteringJournalLock } from "../../scripts/lib/full-metering-journal.mjs";
import { runProtocolRatingOperator } from "../../scripts/lib/protocol-traffic-rating-operator.mjs";
import { runProtocolRatingLifecycle } from "../../scripts/lib/protocol-traffic-rating-lifecycle.mjs";
import { createApp } from "../app.mjs";
import { publishProtocolRatingPolicy, protocolRatingRevision } from "../services/platform/protocol-traffic-rating.mjs";
import { usageCycleForBinding } from "../services/platform/usage-billing-cycle.mjs";
import { createRuntimeState } from "../state.mjs";
import { listen } from "./helpers/listen.mjs";
import { buildSourceValidationTestEnvironment } from "../../scripts/source-validation-test-runner.mjs";
import { applyThirdPartySubscriptionMigrations, REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID, REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM } from "../services/platform/third-party-subscription-migrations.mjs";
import { applySubscriptionDistributionMigrations, REQUIRED_SUBSCRIPTION_DISTRIBUTION_MIGRATION_ID, REQUIRED_SUBSCRIPTION_DISTRIBUTION_DDL_CHECKSUM } from "../services/platform/subscription-distribution-migrations.mjs";

const NOW = "2026-10-20T00:00:00.000Z";
const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const ORIGIN = "https://admin.example.test";
const ACCOUNT = "synthetic_rating_admin";
const DISTRIBUTION = "/api/admin/third-party-subscriptions/distribution";
const context = { scopeDigest: "a".repeat(64), databaseIdentityDigest: "b".repeat(64) };

function journal(t) {
  const parent = mkdtempSync(join(tmpdir(), "rating-operator-"));
  const directory = join(parent, "journal");
  initializeFullMeteringJournal({ directory, context, checkpoint: { sequence: 0, channels: [] } });
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  return { parent, directory, checkpoint: fullMeteringDigest(readFullMeteringJournal({ directory, context })) };
}

function memoryDb() {
  const db = new Database(":memory:");
  db.exec(`create table platform_entitlements (
    id text primary key, plan text not null, valid_from text not null, valid_until text not null
  )`);
  return db;
}

function request(directory, checkpoint, action, extra = {}) {
  return {
    action, directory, context, now: NOW, expectedCheckpointDigest: checkpoint,
    ...extra
  };
}

function ratingTables(db) {
  return Number(db.prepare("select count(*) as count from sqlite_master where name like 'platform_protocol_rating_%'").get().count);
}

function policyState(db) {
  if (!db.prepare("select 1 from sqlite_master where name = 'platform_protocol_rating_policies'").get()) return { active: null, pending: null };
  const row = (status) => db.prepare("select version, policy_digest from platform_protocol_rating_policies where status = ?").get(status) || null;
  return { active: row("active"), pending: row("pending") };
}

function cli(args) {
  return spawnSync(process.execPath, ["scripts/protocol-traffic-rating-operator.mjs", ...args], { cwd: ROOT, encoding: "utf8" });
}

function cliArgs(dbPath, directory, checkpoint, action, extra = []) {
  return [
    "--action", action, "--db", dbPath, "--journal", directory,
    "--scope-digest", context.scopeDigest, "--database-identity", context.databaseIdentityDigest,
    "--now", NOW, "--expected-checkpoint", checkpoint, ...extra
  ];
}

test("the formal entry rejects an unbound target and does not create a database", (t) => {
  const parent = mkdtempSync(join(tmpdir(), "rating-operator-cli-"));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const missing = join(parent, "missing.sqlite");
  const relative = cli(["--action", "inspect", "--db", "relative.sqlite", "--journal", join(parent, "journal"),
    "--scope-digest", context.scopeDigest, "--database-identity", context.databaseIdentityDigest,
    "--now", NOW, "--expected-checkpoint", "c".repeat(64)]);
  assert.equal(relative.status, 2);
  assert.equal(JSON.parse(relative.stdout).error, "rating_operator_rejected");
  assert.equal(relative.stdout.includes("relative.sqlite"), false);
  assert.equal(existsSync(join(ROOT, "relative.sqlite")), false);
  const absent = cli(cliArgs(missing, join(parent, "journal"), "c".repeat(64), "inspect"));
  assert.equal(absent.status, 2);
  assert.equal(existsSync(missing), false);
  const extra = cli(["--action", "inspect", "--persistFault", "parent-sync"]);
  assert.equal(extra.status, 2);
  assert.equal(JSON.parse(extra.stdout).error, "rating_operator_rejected");
  mkdirSync(join(parent, "directory-db"));
  const directoryTarget = cli(cliArgs(join(parent, "directory-db"), join(parent, "journal"), "c".repeat(64), "migrate"));
  assert.equal(directoryTarget.status, 2);
  assert.equal(JSON.parse(directoryTarget.stdout).error, "rating_operator_rejected");
  const file = join(parent, "regular.sqlite");
  const created = new Database(file);
  created.close();
  let linked = false;
  try {
    symlinkSync(file, join(parent, "linked.sqlite"));
    linked = true;
  } catch { linked = false; }
  if (linked) {
    const link = cli(cliArgs(join(parent, "linked.sqlite"), join(parent, "journal"), "c".repeat(64), "inspect"));
    assert.equal(link.status, 2);
    assert.equal(JSON.parse(link.stdout).error, "rating_operator_rejected");
  }
});

test("activate does not migrate, and a missing drain or a wrong checkpoint writes nothing", async (t) => {
  const { directory, checkpoint } = journal(t);
  const db = memoryDb();
  t.after(() => db.close());
  await assert.rejects(runProtocolRatingOperator(request(directory, checkpoint, "activate", {
    db, expectedPolicyVersion: 1, expectedPolicyDigest: "d".repeat(64), expectedActiveVersion: null
  })), /rating_lifecycle_prerequisite/);
  assert.equal(ratingTables(db), 0);
  assert.equal(existsSync(join(directory, "rating-lifecycle.json")), false);
  await runProtocolRatingOperator(request(directory, checkpoint, "inspect", { db }));
  await runProtocolRatingOperator(request(directory, checkpoint, "migrate", { db }));
  await assert.rejects(runProtocolRatingOperator(request(directory, checkpoint, "activate", {
    db, expectedPolicyVersion: 1, expectedPolicyDigest: "d".repeat(64), expectedActiveVersion: null
  })), /rating_lifecycle_prerequisite/);
  assert.equal(existsSync(join(directory, "rating-lifecycle.json")), true);
  assert.equal(Object.hasOwn(JSON.parse(readFileSync(join(directory, "rating-lifecycle.json"), "utf8")).stages, "drain"), false);
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_baselines").get().count, 0);
  await assert.rejects(runProtocolRatingOperator(request(directory, "e".repeat(64), "drain", { db })), /rating_lifecycle_conflict/);
  assert.equal(Object.hasOwn(JSON.parse(readFileSync(join(directory, "rating-lifecycle.json"), "utf8")).stages, "drain"), false);
});

test("partial schema, a bad checksum, the wrong scope, and a test hook are refused", async (t) => {
  const opened = journal(t);
  const partial = memoryDb();
  t.after(() => partial.close());
  partial.exec("create table platform_protocol_rating_migrations (id text primary key, checksum text not null, applied_at text not null)");
  await runProtocolRatingOperator(request(opened.directory, opened.checkpoint, "inspect", { db: partial }));
  await assert.rejects(runProtocolRatingOperator(request(opened.directory, opened.checkpoint, "migrate", { db: partial })), /rating_partial_schema/);
  assert.equal(partial.prepare("select count(*) as count from sqlite_master where name = 'platform_protocol_rating_policies'").get().count, 0);
  const mismatch = memoryDb();
  t.after(() => mismatch.close());
  const second = journal(t);
  await runProtocolRatingOperator(request(second.directory, second.checkpoint, "inspect", { db: mismatch }));
  await runProtocolRatingOperator(request(second.directory, second.checkpoint, "migrate", { db: mismatch }));
  mismatch.prepare("update platform_protocol_rating_migrations set checksum = ?").run("f".repeat(64));
  await assert.rejects(runProtocolRatingOperator(request(second.directory, second.checkpoint, "migrate", { db: mismatch })), /rating_checksum_mismatch/);
  assert.equal(mismatch.prepare("select checksum from platform_protocol_rating_migrations").get().checksum, "f".repeat(64));
  const drifted = { ...context, scopeDigest: "c".repeat(64) };
  await assert.rejects(runProtocolRatingOperator({
    ...request(opened.directory, opened.checkpoint, "inspect", { db: partial }), context: drifted
  }), /full_metering_context_changed|rating_operator_rejected/);
  await assert.rejects(runProtocolRatingOperator({
    ...request(opened.directory, opened.checkpoint, "inspect", { db: partial }), persistFault: "parent-sync"
  }), /rating_operator_rejected/);
});

test("a wrong baseline, a replaced pending, and the writer lock do not publish or activate", async (t) => {
  const { directory, checkpoint } = journal(t);
  const db = memoryDb();
  t.after(() => db.close());
  db.prepare("insert into platform_entitlements (id, plan, valid_from, valid_until) values (?, ?, ?, ?)").run(
    "entitlement", "yearly", "2026-09-01T00:00:00.000Z", "2027-09-01T00:00:00.000Z"
  );
  for (const action of ["inspect", "migrate", "drain"]) {
    await runProtocolRatingOperator(request(directory, checkpoint, action, { db }));
  }
  const cycle = usageCycleForBinding({
    plan: "yearly", validFrom: "2026-09-01T00:00:00.000Z", validUntil: "2027-09-01T00:00:00.000Z"
  }, NOW);
  await assert.rejects(runProtocolRatingOperator(request(directory, checkpoint, "baseline", {
    db, baselines: [{
      accountId: "account", entitlementId: "entitlement", requestId: "request", observation: "measured_zero",
      boundaryObservedAt: NOW, cycleKey: "not-the-cycle", windowStartedAt: cycle.startedAt
    }]
  })), /rating_lifecycle_cycle_conflict/);
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_baselines").get().count, 0);
  await runProtocolRatingOperator(request(directory, checkpoint, "baseline", { db, baselines: [] }));
  publishProtocolRatingPolicy(db, { vless: "1.5", hy2: "1.0", tuic: "1.0", now: NOW, expectedRevision: protocolRatingRevision(db) });
  const first = policyState(db).pending;
  publishProtocolRatingPolicy(db, { vless: "2.5", hy2: "1.0", tuic: "1.0", now: "2026-10-20T00:05:00.000Z", expectedRevision: protocolRatingRevision(db) });
  await assert.rejects(runProtocolRatingOperator(request(directory, checkpoint, "activate", {
    db, expectedPolicyVersion: 1, expectedPolicyDigest: first.policy_digest, expectedActiveVersion: null
  })), /rating_lifecycle_conflict/);
  const replaced = policyState(db);
  assert.equal(replaced.active, null);
  assert.equal(replaced.pending.version, 2);
  assert.equal(Object.hasOwn(JSON.parse(readFileSync(join(directory, "rating-lifecycle.json"), "utf8")).stages, "activate"), false);
  const before = readFileSync(join(directory, "rating-lifecycle.json"));
  await assert.rejects(withFullMeteringJournalLock({ directory }, () => runProtocolRatingOperator(request(directory, checkpoint, "inspect", { db }))), /full_metering_locked/);
  assert.equal(readFileSync(join(directory, "rating-lifecycle.json")).equals(before), true);
  assert.equal(policyState(db).active, null);
});

test("a formal completion keeps the committed policy and leaves the later pending", async (t) => {
  const { directory, checkpoint } = journal(t);
  const db = memoryDb();
  t.after(() => db.close());
  await runProtocolRatingLifecycle({ db, directory, context, now: NOW, action: "baseline", baselines: [] });
  publishProtocolRatingPolicy(db, { vless: "1.5", hy2: "1.0", tuic: "1.0", now: NOW, expectedRevision: protocolRatingRevision(db) });
  await assert.rejects(runProtocolRatingLifecycle({
    db, directory, context, now: NOW, action: "activate",
    beforeRecord: (stage) => { if (stage === "activate") throw new Error("stop_before_activate_record"); }
  }), /stop_before_activate_record/);
  const visibleDigest = JSON.parse(readFileSync(join(directory, "rating-lifecycle.json"), "utf8")).stages.activateIntent.policyDigest;
  publishProtocolRatingPolicy(db, { vless: "2.5", hy2: "1.0", tuic: "1.0", now: "2026-10-20T00:05:00.000Z", expectedRevision: protocolRatingRevision(db) });
  await assert.rejects(runProtocolRatingLifecycle({
    db, directory, context, now: "2026-10-20T00:05:00.000Z", action: "activate", persistFault: "parent-sync"
  }), /persist_parent_sync/);
  const completed = await runProtocolRatingOperator(request(directory, checkpoint, "activate", {
    db, expectedPolicyVersion: 1, expectedPolicyDigest: visibleDigest, expectedActiveVersion: null
  }));
  assert.equal(completed.ok, true);
  assert.equal(completed.digests.policy, visibleDigest);
  assert.equal(completed.digests.checkpoint, checkpoint);
  assert.equal(JSON.stringify(completed).includes(directory), false);
  const state = policyState(db);
  assert.equal(state.active.version, 1);
  assert.equal(state.active.policy_digest, visibleDigest);
  assert.equal(state.pending.version, 2);
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_charges").get().count, 0);
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_baselines").get().count, 0);
  const repeated = await runProtocolRatingOperator(request(directory, checkpoint, "activate", {
    db, expectedPolicyVersion: 1, expectedPolicyDigest: visibleDigest, expectedActiveVersion: null
  }));
  assert.equal(repeated.digests.policy, visibleDigest);
  assert.equal(policyState(db).pending.version, 2);
});

test("real runtime save stays pending until the formal entry activates it", { timeout: 120000 }, async (t) => {
  const parent = mkdtempSync(join(tmpdir(), "rating-operator-http-"));
  const directory = join(parent, "journal");
  initializeFullMeteringJournal({ directory, context, checkpoint: { sequence: 0, channels: [] } });
  const checkpoint = fullMeteringDigest(readFullMeteringJournal({ directory, context }));
  const controlPath = join(parent, "control.sqlite");
  const imported = join(parent, "third-party.sqlite");
  const importedDb = new Database(imported);
  applyThirdPartySubscriptionMigrations({ database: importedDb, expectedMigrationId: REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID, expectedDdlChecksum: REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM });
  applySubscriptionDistributionMigrations({ database: importedDb, expectedMigrationId: REQUIRED_SUBSCRIPTION_DISTRIBUTION_MIGRATION_ID, expectedDdlChecksum: REQUIRED_SUBSCRIPTION_DISTRIBUTION_DDL_CHECKSUM });
  importedDb.close();
  let state;
  const servers = [];
  t.after(async () => {
    for (const server of servers) { server.closeAllConnections(); server.close(); }
    await state?.close();
    rmSync(parent, { recursive: true, force: true });
  });
  state = createRuntimeState({
    rootDir: ROOT,
    controlDbPath: controlPath,
    subscriptionDbPath: join(parent, "subscriptions.sqlite"),
    autoStartHttpProxy: false,
    subscriptionNowFn: () => new Date(NOW),
    userPortalNowFn: () => NOW,
    adminAuthNowFn: () => NOW,
    adminAuthTotpVerifier: ({ code }) => code === "654321",
    env: {
      ...buildSourceValidationTestEnvironment({}, { repositoryRoot: ROOT }),
      CONSOLE_TOKEN: "synthetic-rating-operator",
      ADMIN_AUTH_ROUTES_ENABLED: "true",
      ADMIN_AUTH_SESSION_SECRET: "synthetic-rating-operator-session",
      ADMIN_AUTH_PORTAL_ACCOUNT_ID: ACCOUNT,
      ADMIN_BROWSER_ORIGIN: ORIGIN,
      ADMIN_ALLOWED_CIDRS: "127.0.0.1/32",
      THIRD_PARTY_SUBSCRIPTION_ENABLED: "true",
      THIRD_PARTY_SUBSCRIPTION_DB_PATH: imported,
      THIRD_PARTY_SUBSCRIPTION_SECRET_KEY: "12".repeat(32),
      SUBSCRIPTION_DISTRIBUTION_ENABLED: "true"
    }
  });
  state.platform.controlStore.createAccount({ id: ACCOUNT, ownerRef: "owner_safe_ref", status: "active", createdAt: NOW, updatedAt: NOW });
  state.platform.portalPasswordCredentialService.issueInitialPasswordCredential({
    accountId: ACCOUNT, plainPassword: "synthetic-portal-password", issuedByRef: "operator_safe_ref", approvalRef: "approval_safe_ref"
  });
  state.platform.controlStore.createPortalTotpCredential({
    id: "portal_totp_rating_operator", accountId: ACCOUNT, encryptedTotpSecret: "enc:rating-operator",
    status: "active", failureCount: 0, enrolledAt: NOW, updatedAt: NOW
  });
  state.platform.adminRole = "viewer";
  const viewerListener = await listen(createApp(state));
  servers.push(viewerListener.server);
  state.platform.adminRole = "admin";
  const adminListener = await listen(createApp(state));
  servers.push(adminListener.server);
  async function call(baseUrl, method, cookie, body, suffix = "") {
    const response = await fetch(`${baseUrl}${DISTRIBUTION}${suffix}`, {
      method,
      headers: {
        "content-type": "application/json",
        Origin: ORIGIN,
        ...(cookie ? { cookie } : {})
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const raw = await response.text();
    return { status: response.status, raw, body: JSON.parse(raw) };
  }
  const login = await fetch(`${adminListener.baseUrl}/api/admin-auth/login`, {
    method: "POST", headers: { "content-type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ bootstrapToken: "synthetic-portal-password" })
  });
  assert.equal(login.status, 202);
  const challenge = await login.json();
  const verified = await fetch(`${adminListener.baseUrl}/api/admin-auth/totp/verify`, {
    method: "POST", headers: { "content-type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ challengeRef: challenge.challenge.challengeRef, code: "654321" })
  });
  assert.equal(verified.status, 200);
  const cookie = verified.headers.get("set-cookie").split(";")[0];
  const probe = new Database(controlPath, { readonly: true, fileMustExist: true });
  probe.pragma("query_only = ON");
  assert.equal(probe.prepare("select count(*) as count from sqlite_master where name like 'platform_protocol_rating_%'").get().count, 0);
  probe.close();
  const initial = await call(adminListener.baseUrl, "GET", cookie);
  assert.equal(initial.status, 200);
  assert.equal(initial.body.protocolRating.installed, false);
  assert.equal(initial.body.protocolRating.active, null);
  assert.equal(initial.body.protocolRating.pending, null);
  const premature = await call(adminListener.baseUrl, "PUT", cookie, { ratingRevision: "c".repeat(64), vless: "1.5", hy2: "1.0", tuic: "1.0" }, "/rating");
  assert.equal(premature.status, 503);
  assert.equal(premature.body.error, "protocol_rating_unavailable");
  assert.equal(existsSync(join(directory, "rating-lifecycle.json")), false);
  const anonymous = await call(adminListener.baseUrl, "PUT", null, { ratingRevision: "c".repeat(64), vless: "1.5", hy2: "1.0", tuic: "1.0" }, "/rating");
  assert.equal(anonymous.status, 401);
  for (const action of ["inspect", "migrate", "drain"]) {
    const step = cli(cliArgs(controlPath, directory, checkpoint, action));
    assert.equal(step.status, 0, step.stdout);
    assert.equal(step.stdout.includes(controlPath), false);
    assert.equal(step.stdout.includes(directory), false);
  }
  const baselines = join(parent, "baselines.json");
  writeFileSync(baselines, "[]");
  const recorded = cli(cliArgs(controlPath, directory, checkpoint, "baseline", ["--baselines", baselines]));
  assert.equal(recorded.status, 0, recorded.stdout);
  const ready = await call(adminListener.baseUrl, "GET", cookie);
  assert.equal(ready.status, 200);
  assert.equal(ready.body.protocolRating.installed, true);
  assert.equal(ready.body.protocolRating.active, null);
  assert.equal(ready.body.protocolRating.pending, null);
  const revision = ready.body.protocolRating.revision;
  const save = { ratingRevision: revision, vless: "1.5", hy2: "1.0", tuic: "1.0" };
  const denied = await call(viewerListener.baseUrl, "PUT", cookie, save, "/rating");
  assert.equal(denied.status, 403);
  const evil = await fetch(`${adminListener.baseUrl}${DISTRIBUTION}/rating`, {
    method: "PUT", headers: { "content-type": "application/json", Origin: "https://evil.test", cookie }, body: JSON.stringify(save)
  });
  assert.equal(evil.status, 403);
  await evil.arrayBuffer();
  const unknown = await fetch(`${adminListener.baseUrl}${DISTRIBUTION}/rating`, {
    method: "PUT", headers: { "content-type": "application/json", Origin: ORIGIN, cookie },
    body: JSON.stringify({ ...save, command: "tc" })
  });
  assert.equal(unknown.status, 400);
  const badMultiplier = await fetch(`${adminListener.baseUrl}${DISTRIBUTION}/rating`, {
    method: "PUT", headers: { "content-type": "application/json", Origin: ORIGIN, cookie },
    body: JSON.stringify({ ...save, vless: "0" })
  });
  assert.equal(badMultiplier.status, 400);
  await unknown.arrayBuffer();
  await badMultiplier.arrayBuffer();
  const accepted = await call(adminListener.baseUrl, "PUT", cookie, save, "/rating");
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.protocolRating.pending.multipliers.vless, "1.5");
  assert.equal(accepted.body.protocolRating.active, null);
  assert.equal(Object.hasOwn(accepted.body, "bwhSupply"), false);
  const reader = new Database(controlPath, { readonly: true, fileMustExist: true });
  reader.pragma("query_only = ON");
  const saved = reader.prepare("select version, status, policy_digest from platform_protocol_rating_policies").all();
  reader.close();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].status, "pending");
  const stages = JSON.parse(readFileSync(join(directory, "rating-lifecycle.json"), "utf8")).stages;
  assert.equal(Object.hasOwn(stages, "activate"), false);
  assert.equal(Object.hasOwn(stages, "baseline"), true);
  const stale = await fetch(`${adminListener.baseUrl}${DISTRIBUTION}/rating`, {
    method: "PUT", headers: { "content-type": "application/json", Origin: ORIGIN, cookie },
    body: JSON.stringify(save)
  });
  assert.equal(stale.status, 409);
  const conflicted = cli(cliArgs(controlPath, directory, checkpoint, "activate", [
    "--expected-policy-version", "9", "--expected-policy-digest", saved[0].policy_digest, "--expected-active-version", "none"
  ]));
  assert.equal(conflicted.status, 2);
  assert.equal(JSON.parse(conflicted.stdout).error, "rating_lifecycle_conflict");
  const activated = cli(cliArgs(controlPath, directory, checkpoint, "activate", [
    "--expected-policy-version", String(saved[0].version), "--expected-policy-digest", saved[0].policy_digest, "--expected-active-version", "none"
  ]));
  assert.equal(activated.status, 0, activated.stdout);
  const receipt = JSON.parse(activated.stdout);
  assert.equal(receipt.ok, true);
  assert.equal(receipt.digests.policy, saved[0].policy_digest);
  assert.equal(receipt.stages.includes("activate"), true);
  assert.equal(activated.stdout.includes(controlPath), false);
  const after = await call(adminListener.baseUrl, "GET", cookie);
  assert.equal(after.status, 200);
  assert.equal(after.body.protocolRating.active.version, saved[0].version);
  assert.equal(after.body.protocolRating.active.state, "active");
  assert.equal(after.body.protocolRating.active.multipliers.vless, "1.5");
  assert.equal(after.body.protocolRating.pending, null);
  assert.equal(after.raw.includes(controlPath), false);
  const again = cli(cliArgs(controlPath, directory, checkpoint, "activate", [
    "--expected-policy-version", String(saved[0].version), "--expected-policy-digest", saved[0].policy_digest, "--expected-active-version", "none"
  ]));
  assert.equal(again.status, 0, again.stdout);
  const finalReader = new Database(controlPath, { readonly: true, fileMustExist: true });
  finalReader.pragma("query_only = ON");
  const finalRows = finalReader.prepare("select version, status from platform_protocol_rating_policies order by version").all();
  const samples = finalReader.prepare("select count(*) as count from platform_usage_samples").get().count;
  finalReader.close();
  assert.deepEqual(finalRows, [{ version: saved[0].version, status: "active" }]);
  assert.equal(samples, 0);
  assert.equal(state.subscriptionDistribution.supply, undefined);
});
