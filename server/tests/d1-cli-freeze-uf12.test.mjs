// U-F12: CLI-path freeze tests (disposition R4 §6 step 4; R2 §3 row 12).
// Each of the five CLI families is driven through its real CLI script as a
// subprocess, twice: once while the writer authority is FROZEN (the CLI
// write must be refused and nothing may land), once while it is BWH_ACTIVE
// (the same CLI write must go through). All databases are synthetic temp
// files; no production data, no live database, no BWH, no network.
// Fixtures are minimal copies of the owning CLI test files' setups, cited
// inline. Freeze is applied with the same helpers the U-F1..U-F7 fence
// suite uses (d1-storefront-fences-uf1-uf7.test.mjs).
//
// Called-method fence for each family (all verified on master ea837930):
// - platform-issue-portal-entry: user-portal-auth issueDynamicEntry ->
//   controlStore.createPortalEntry, fenced at definition
//   (subscription-control-db.mjs:9451, U-F13 W-004, first statement).
// - platform-issue-portal-initial-account: portal-initial-account-issuance
//   issuePortalInitialAccount -> controlStore.runInTransaction
//   (subscription-control-db.mjs:10447 -> guardedTransaction,
//   single-writer-authority.mjs:312).
// - platform-issue-subscription: subscription-issuance
//   executeSubscriptionIssuance -> controlStore.createAccount /
//   createEntitlement / createIssuanceRequest, each fenced at definition
//   (subscription-control-db.mjs:1984 / :5265 / :6319, U-F13 W-003/W-065/
//   W-070); the control finalization runs inside runInTransaction (:83-84).
// - platform-lead-retention: lead-retention-operations runLeadPurge,
//   assertWritable inside the purge transaction, first statement
//   (lead-retention-operations.mjs:472, U-F7). backup/prune have no DB
//   write and need no fence (R3 E §1.2).
// - platform-portal-referral-policy: portal-referral-service publishPolicy,
//   assertWritable inside its transaction, first statement
//   (portal-referral-service.mjs:112, U-F4).
//
// Two CLI-level reporting limits are pinned here rather than hidden:
// - The four exec-style CLIs print the fence message
//   ("BWH writes require phase BWH_ACTIVE, current phase is FROZEN") on
//   stderr and exit 1; the fence code `writer_authority_not_bwh` itself is
//   not printed, so these tests match the message text.
// - The referral policy CLI normalizes every non-listed error code to
//   `referral_policy_unavailable` with exit code 2, so its frozen test
//   asserts that exit/reason plus zero rows landed; the fence code itself
//   is asserted at the service layer in d1-storefront-fences-uf1-uf7.test.mjs.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

import {
  ensureWriterAuthority,
  readWriterAuthority,
  transitionWriterAuthority
} from "../services/platform/single-writer-authority.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createSqliteSubscriptionStore } from "../services/subscriptions/repository.mjs";
import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  applyCoinWalletMigrations
} from "../services/platform/coin-wallet-migrations.mjs";
import { applyPaymentStoreMigrations } from "../services/platform/payment-store-migrations.mjs";
import {
  REFERRAL_DDL_CHECKSUM,
  REFERRAL_MIGRATION_ID,
  applyPortalReferralMigration
} from "../services/platform/portal-referral-migrations.mjs";
import {
  digest,
  policySnapshot
} from "../services/platform/portal-referral-contract.mjs";
import { buildSourceValidationTestEnvironment } from "../../scripts/source-validation-test-runner.mjs";

const rootDir = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const NOW = "2026-09-08T00:00:00.000Z";
const FUTURE = "2099-06-04T00:00:00.000Z";
const FROZEN_MESSAGE = /BWH writes require phase BWH_ACTIVE, current phase is FROZEN/;

function withTempDir(prefix, fn) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  try {
    return fn(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

function freezeDbFile(dbPath) {
  const db = new Database(dbPath);
  try {
    ensureWriterAuthority(db);
    transitionWriterAuthority(db, { to: "FROZEN", expectedEpoch: 1 });
  } finally {
    db.close();
  }
}

function authorityOf(dbPath) {
  const db = new Database(dbPath, { readonly: true });
  try {
    return readWriterAuthority(db);
  } finally {
    db.close();
  }
}

function countRows(dbPath, table) {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db.prepare(`select count(*) as n from ${table}`).get().n;
  } finally {
    db.close();
  }
}

function runCli(script, args, env = process.env) {
  return execFileSync(process.execPath, [script, ...args], {
    cwd: rootDir,
    encoding: "utf8",
    env
  });
}

function runCliThrows(script, args, env = process.env) {
  try {
    runCli(script, args, env);
    return null;
  } catch (error) {
    return error;
  }
}

// --- platform-issue-portal-entry (fixture: platform-issue-portal-entry-cli.test.mjs)
function portalEntryInput(overrides = {}) {
  return {
    accountId: "acct_portal_cli_uf12",
    entitlementId: "ent_portal_cli_uf12",
    issuedByRef: "operator_safe_ref",
    expiresAt: FUTURE,
    maxUses: 1,
    ...overrides
  };
}

function seedPortalEntryControlDb(controlDbPath) {
  const store = createSqliteSubscriptionControlStore({ dbPath: controlDbPath });
  store.createAccount({
    id: "acct_portal_cli_uf12",
    ownerRef: "owner_safe_ref",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW
  });
  store.createEntitlement({
    id: "ent_portal_cli_uf12",
    accountId: "acct_portal_cli_uf12",
    plan: "pilot",
    status: "active",
    validFrom: NOW,
    validUntil: FUTURE,
    maxArtifacts: 1,
    maxDevices: 1,
    trafficLimitBytes: 0,
    createdAt: NOW,
    updatedAt: NOW
  });
  store.close();
}

test("U-F12 portal-entry CLI is refused in FROZEN and writes nothing", () => {
  withTempDir("d1-uf12-portal-entry-frozen-", (directory) => {
    const controlDbPath = join(directory, "control.sqlite");
    const inputPath = join(directory, "portal-entry-input.json");
    const handoffPath = join(directory, "handoff.json");
    writeFileSync(inputPath, JSON.stringify(portalEntryInput(), null, 2));
    seedPortalEntryControlDb(controlDbPath);
    freezeDbFile(controlDbPath);
    assert.equal(authorityOf(controlDbPath).phase, "FROZEN");

    const error = runCliThrows("scripts/platform-issue-portal-entry.mjs", [
      "--execute-production-mutation",
      "--approval-ref", "approval-portal-uf12",
      "--control-db-path", controlDbPath,
      "--handoff-file", handoffPath,
      inputPath
    ]);

    assert.ok(error, "frozen CLI must fail");
    assert.equal(error.status, 1);
    assert.match(error.stderr || error.message, FROZEN_MESSAGE);
    assert.ok(!existsSync(handoffPath), "frozen CLI must not write a handoff file");
    assert.equal(countRows(controlDbPath, "platform_portal_entries"), 0);
    assert.equal(authorityOf(controlDbPath).phase, "FROZEN");
    assert.equal(authorityOf(controlDbPath).epoch, 2);
  });
});

test("U-F12 portal-entry CLI succeeds while BWH_ACTIVE", () => {
  withTempDir("d1-uf12-portal-entry-active-", (directory) => {
    const controlDbPath = join(directory, "control.sqlite");
    const inputPath = join(directory, "portal-entry-input.json");
    const handoffPath = join(directory, "handoff.json");
    writeFileSync(inputPath, JSON.stringify(portalEntryInput(), null, 2));
    seedPortalEntryControlDb(controlDbPath);
    assert.equal(authorityOf(controlDbPath).phase, "BWH_ACTIVE");

    const stdout = runCli("scripts/platform-issue-portal-entry.mjs", [
      "--execute-production-mutation",
      "--approval-ref", "approval-portal-uf12",
      "--control-db-path", controlDbPath,
      "--handoff-file", handoffPath,
      inputPath
    ]);

    const summary = JSON.parse(stdout);
    assert.equal(summary.ok, true);
    assert.equal(summary.mode, "platform-issue-portal-entry");
    assert.equal(summary.controlDbMutated, true);
    assert.equal(summary.handoffWritten, true);
    assert.equal(summary.summary.accountId, "acct_portal_cli_uf12");
    const store = createSqliteSubscriptionControlStore({ dbPath: controlDbPath });
    const stored = store.getPortalEntry(summary.summary.entryRef);
    assert.equal(stored.accountId, "acct_portal_cli_uf12");
    store.close();
  });
});

// --- platform-issue-portal-initial-account (fixture: platform-issue-portal-initial-account-cli.test.mjs)
function initialAccountInput(overrides = {}) {
  return {
    accountId: "acct_initial_cli_uf12",
    ownerRef: "owner_initial_cli_safe_ref",
    displayName: "Initial CLI Account",
    issuedByRef: "operator_safe_ref",
    ...overrides
  };
}

const INITIAL_ACCOUNT_ENV = {
  ...process.env,
  PORTAL_INITIAL_ACCOUNT_TEST_PASSWORD: "test-only-cli-generated-password"
};

test("U-F12 portal-initial-account CLI is refused in FROZEN and writes nothing", () => {
  withTempDir("d1-uf12-initial-account-frozen-", (directory) => {
    const controlDbPath = join(directory, "control.sqlite");
    const inputPath = join(directory, "initial-account-input.json");
    const handoffPath = join(directory, "initial-account-handoff.json");
    writeFileSync(inputPath, JSON.stringify(initialAccountInput(), null, 2));
    // Install schema + authority only; no account row yet.
    const store = createSqliteSubscriptionControlStore({ dbPath: controlDbPath });
    store.close();
    freezeDbFile(controlDbPath);
    assert.equal(authorityOf(controlDbPath).phase, "FROZEN");

    const error = runCliThrows("scripts/platform-issue-portal-initial-account.mjs", [
      "--execute-production-mutation",
      "--approval-ref", "approval_initial_cli_uf12",
      "--control-db-path", controlDbPath,
      "--handoff-file", handoffPath,
      inputPath
    ], INITIAL_ACCOUNT_ENV);

    assert.ok(error, "frozen CLI must fail");
    assert.equal(error.status, 1);
    assert.match(error.stderr || error.message, FROZEN_MESSAGE);
    assert.ok(!existsSync(handoffPath), "frozen CLI must not write a handoff file");
    assert.equal(countRows(controlDbPath, "platform_accounts"), 0);
    assert.equal(authorityOf(controlDbPath).phase, "FROZEN");
  });
});

test("U-F12 portal-initial-account CLI succeeds while BWH_ACTIVE", () => {
  withTempDir("d1-uf12-initial-account-active-", (directory) => {
    const controlDbPath = join(directory, "control.sqlite");
    const inputPath = join(directory, "initial-account-input.json");
    const handoffPath = join(directory, "initial-account-handoff.json");
    writeFileSync(inputPath, JSON.stringify(initialAccountInput(), null, 2));

    const stdout = runCli("scripts/platform-issue-portal-initial-account.mjs", [
      "--execute-production-mutation",
      "--approval-ref", "approval_initial_cli_uf12",
      "--control-db-path", controlDbPath,
      "--handoff-file", handoffPath,
      inputPath
    ], INITIAL_ACCOUNT_ENV);

    const summary = JSON.parse(stdout);
    assert.equal(summary.ok, true);
    assert.equal(summary.mode, "platform-issue-portal-initial-account");
    assert.equal(summary.controlDbMutated, true);
    assert.equal(summary.handoffWritten, true);
    assert.equal(summary.summary.accountId, "acct_initial_cli_uf12");
    const handoff = JSON.parse(readFileSync(handoffPath, "utf8"));
    assert.equal(handoff.initialPassword, "test-only-cli-generated-password");
    const store = createSqliteSubscriptionControlStore({ dbPath: controlDbPath });
    const account = store.getAccount("acct_initial_cli_uf12");
    assert.equal(account.ownerRef, "owner_initial_cli_safe_ref");
    const credential = store.getActivePortalPasswordCredential("acct_initial_cli_uf12");
    assert.equal(credential.mustRotate, true);
    store.close();
  });
});

// --- platform-issue-subscription (fixture: platform-issue-subscription-cli.test.mjs)
function subscriptionInput(overrides = {}) {
  return {
    displayName: "Test User",
    expiresAt: FUTURE,
    nodeId: "channel-vultr-a-vless-reality-tcp",
    note: "test-note",
    control: {
      accountId: "acct_test_user_uf12",
      ownerRef: "cust_8f14e45fceea167a",
      entitlementId: "ent_test_user_uf12",
      plan: "pilot",
      requestId: "iss_test_user_uf12",
      requestedByRef: "operator_1f3870be274f6c49",
      purpose: "preproduction-canary",
      maxArtifacts: 1,
      maxDevices: 1,
      trafficLimitBytes: 0
    },
    artifact: { create: true },
    ...overrides
  };
}

function subscriptionCliArgs({ dbPath, controlDbPath, handoffPath, inputPath }) {
  return [
    "--execute-production-mutation",
    "--approval-ref", "PR-123",
    "--db-path", dbPath,
    "--control-db-path", controlDbPath,
    "--public-base-url", "https://example.com",
    "--handoff-file", handoffPath,
    inputPath
  ];
}

test("U-F12 issue-subscription CLI is refused in FROZEN and writes nothing", () => {
  withTempDir("d1-uf12-issue-subscription-frozen-", (directory) => {
    const dbPath = join(directory, "test.sqlite");
    const controlDbPath = join(directory, "control.sqlite");
    const inputPath = join(directory, "input.json");
    const handoffPath = join(directory, "handoff.txt");
    writeFileSync(inputPath, JSON.stringify(subscriptionInput(), null, 2));
    const runtime = createSqliteSubscriptionStore({ dbPath });
    runtime.close();
    const control = createSqliteSubscriptionControlStore({ dbPath: controlDbPath });
    control.close();
    freezeDbFile(controlDbPath);
    assert.equal(authorityOf(controlDbPath).phase, "FROZEN");

    const env = buildSourceValidationTestEnvironment(process.env, { repositoryRoot: rootDir });
    const error = runCliThrows("scripts/platform-issue-subscription.mjs",
      subscriptionCliArgs({ dbPath, controlDbPath, handoffPath, inputPath }), env);

    assert.ok(error, "frozen CLI must fail");
    assert.equal(error.status, 1);
    assert.match(error.stderr || error.message, FROZEN_MESSAGE);
    assert.ok(!existsSync(handoffPath), "frozen CLI must not write a handoff file");
    const store = createSqliteSubscriptionStore({ dbPath });
    assert.equal(store.listTenants().length, 0);
    store.close();
    assert.equal(countRows(controlDbPath, "platform_accounts"), 0);
    assert.equal(authorityOf(controlDbPath).phase, "FROZEN");
  });
});

test("U-F12 issue-subscription CLI succeeds while BWH_ACTIVE", () => {
  withTempDir("d1-uf12-issue-subscription-active-", (directory) => {
    const dbPath = join(directory, "test.sqlite");
    const controlDbPath = join(directory, "control.sqlite");
    const inputPath = join(directory, "input.json");
    const handoffPath = join(directory, "handoff.txt");
    writeFileSync(inputPath, JSON.stringify(subscriptionInput(), null, 2));
    const runtime = createSqliteSubscriptionStore({ dbPath });
    runtime.close();

    const env = buildSourceValidationTestEnvironment(process.env, { repositoryRoot: rootDir });
    const stdout = runCli("scripts/platform-issue-subscription.mjs",
      subscriptionCliArgs({ dbPath, controlDbPath, handoffPath, inputPath }), env);

    const summary = JSON.parse(stdout);
    assert.equal(summary.ok, true);
    assert.equal(summary.mode, "platform-issue-subscription");
    assert.equal(summary.dbMutated, true);
    assert.equal(summary.controlDbMutated, true);
    assert.equal(summary.issuanceRequestRef, "iss_test_user_uf12");
    const handoff = JSON.parse(readFileSync(handoffPath, "utf8"));
    const store = createSqliteSubscriptionStore({ dbPath });
    assert.equal(store.listTenants().length, 1);
    assert.equal(store.listTenants()[0].id, handoff.tenantId);
    assert.equal(store.listArtifactsByTenant(handoff.tenantId).length, 1);
    store.close();
    const controlStore = createSqliteSubscriptionControlStore({ dbPath: controlDbPath });
    const controlSummary = controlStore.getAccountControlSummary("acct_test_user_uf12");
    assert.equal(controlSummary.issuanceRequests[0].id, "iss_test_user_uf12");
    assert.equal(controlSummary.issuanceRequests[0].status, "issued");
    controlStore.close();
  });
});

// --- platform-lead-retention (fixture: d1-storefront-fences-uf1-uf7.test.mjs U-F7)
function leadPurgeFixture(dbPath) {
  const database = new Database(dbPath);
  database.pragma("foreign_keys = ON");
  database.exec(`
    create table platform_leads (
      id text primary key,
      status text not null,
      organization text not null,
      email text not null,
      direction text not null,
      stage text not null default '',
      message text not null,
      source text not null,
      created_at text not null,
      updated_at text not null,
      expires_at text not null
    );
  `);
  const insert = database.prepare(`
    insert into platform_leads (
      id, status, organization, email, direction, stage, message, source,
      created_at, updated_at, expires_at
    ) values (
      @id, 'new', 'Synthetic Research', @email, 'API Sandbox', 'review',
      @message, 'company-site', @createdAt, @createdAt, @expiresAt
    )
  `);
  insert.run({
    id: "lead_expired_1",
    email: "expired@example.test",
    message: "expired lead",
    createdAt: "2026-07-01T00:00:00.000Z",
    expiresAt: "2026-07-10T00:00:00.000Z"
  });
  insert.run({
    id: "lead_live_1",
    email: "live@example.test",
    message: "live lead",
    createdAt: "2026-07-01T00:00:00.000Z",
    expiresAt: "2099-12-31T00:00:00.000Z"
  });
  database.close();
}

test("U-F12 lead-retention purge CLI is blocked in FROZEN and deletes nothing", () => {
  withTempDir("d1-uf12-lead-retention-frozen-", (directory) => {
    const dbPath = join(directory, "private-control.sqlite");
    leadPurgeFixture(dbPath);
    freezeDbFile(dbPath);
    assert.equal(authorityOf(dbPath).phase, "FROZEN");

    const error = runCliThrows("scripts/platform-lead-retention.mjs",
      ["purge", "--apply"],
      { ...process.env, SUBSCRIPTION_CONTROL_DB_PATH: dbPath });

    assert.ok(error, "frozen CLI must exit non-zero");
    assert.equal(error.status, 20);
    const result = JSON.parse(error.stdout);
    assert.equal(result.status, "blocked");
    assert.deepEqual(result.reasonCodes, ["writer_authority_not_bwh"]);
    assert.equal(result.mutationState, "none");
    assert.equal(countRows(dbPath, "platform_leads"), 2);
  });
});

test("U-F12 lead-retention purge CLI succeeds while BWH_ACTIVE", () => {
  withTempDir("d1-uf12-lead-retention-active-", (directory) => {
    const dbPath = join(directory, "private-control.sqlite");
    leadPurgeFixture(dbPath);
    const setup = new Database(dbPath);
    ensureWriterAuthority(setup);
    setup.close();
    assert.equal(authorityOf(dbPath).phase, "BWH_ACTIVE");

    const stdout = runCli("scripts/platform-lead-retention.mjs",
      ["purge", "--apply"],
      { ...process.env, SUBSCRIPTION_CONTROL_DB_PATH: dbPath });

    const result = JSON.parse(stdout);
    assert.equal(result.status, "completed");
    assert.equal(result.counts.deletedLeadCount, 1);
    assert.equal(countRows(dbPath, "platform_leads"), 1);
  });
});

// --- platform-portal-referral-policy (fixture: platform-portal-referral.test.mjs)
const REFERRAL_POLICY = {
  policyRef: "test_policy_uf12",
  version: 1,
  effectiveAt: "2099-01-01T00:00:00.000Z",
  rateBps: 1250,
  rounding: "floor",
  attributionDays: 7,
  confirmationDays: 2
};

function referralDb(dbPath) {
  const db = new Database(dbPath);
  db.pragma("foreign_keys=ON");
  db.exec(`create table platform_accounts(id text primary key,owner_ref text not null,status text not null,
    created_at text not null,updated_at text not null,metadata_json text not null default '{}')`);
  applyCoinWalletMigrations({
    database: db,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(NOW)
  });
  applyPaymentStoreMigrations({ database: db, nowFn: () => NOW });
  applyPortalReferralMigration(db, {
    expectedMigrationId: REFERRAL_MIGRATION_ID,
    expectedDdlChecksum: REFERRAL_DDL_CHECKSUM
  });
  db.close();
}

function referralPolicyArgs({ policyPath, dbPath, policyDigest }) {
  return [
    "--mode", "publish",
    "--policy-path", policyPath,
    "--db-path", dbPath,
    "--confirm-policy-digest", policyDigest
  ];
}

test("U-F12 referral-policy publish CLI is refused in FROZEN and publishes nothing", () => {
  withTempDir("d1-uf12-referral-policy-frozen-", (directory) => {
    const dbPath = join(directory, "state.sqlite");
    const policyPath = join(directory, "policy.json");
    referralDb(dbPath);
    freezeDbFile(dbPath);
    assert.equal(authorityOf(dbPath).phase, "FROZEN");
    writeFileSync(policyPath, JSON.stringify(REFERRAL_POLICY, null, 2));
    const policyDigest = digest(JSON.stringify(policySnapshot(REFERRAL_POLICY)));

    const error = runCliThrows("scripts/platform-portal-referral-policy.mjs",
      referralPolicyArgs({ policyPath, dbPath, policyDigest }));

    assert.ok(error, "frozen CLI must exit non-zero");
    assert.equal(error.status, 2);
    // The CLI normalizes the fence code to referral_policy_unavailable;
    // the fence itself is asserted at the service layer (U-F4 test).
    assert.deepEqual(JSON.parse(error.stdout), { ok: false, reason: "referral_policy_unavailable" });
    assert.equal(countRows(dbPath, "platform_referral_policies"), 0);
    assert.equal(authorityOf(dbPath).phase, "FROZEN");
  });
});

test("U-F12 referral-policy publish CLI succeeds while BWH_ACTIVE", () => {
  withTempDir("d1-uf12-referral-policy-active-", (directory) => {
    const dbPath = join(directory, "state.sqlite");
    const policyPath = join(directory, "policy.json");
    referralDb(dbPath);
    const setup = new Database(dbPath);
    ensureWriterAuthority(setup);
    setup.close();
    assert.equal(authorityOf(dbPath).phase, "BWH_ACTIVE");
    writeFileSync(policyPath, JSON.stringify(REFERRAL_POLICY, null, 2));
    const policyDigest = digest(JSON.stringify(policySnapshot(REFERRAL_POLICY)));

    const stdout = runCli("scripts/platform-portal-referral-policy.mjs",
      referralPolicyArgs({ policyPath, dbPath, policyDigest }));

    const result = JSON.parse(stdout);
    assert.equal(result.ok, true);
    assert.equal(result.mode, "publish");
    assert.equal(countRows(dbPath, "platform_referral_policies"), 1);
  });
});
