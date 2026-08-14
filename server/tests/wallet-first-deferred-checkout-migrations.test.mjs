import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

import {
  COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID,
  applyCoinCommerceMigrations
} from "../services/platform/coin-commerce-migrations.mjs";
import {
  REQUIRED_DEFERRED_RESOURCE_TRANSITION_DDL_CHECKSUM,
  REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID,
  applyDeferredResourceTransitionMigrations
} from "../services/platform/deferred-resource-transition-migrations.mjs";
import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  applyCoinWalletMigrations
} from "../services/platform/coin-wallet-migrations.mjs";
import {
  REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID,
  WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATIONS,
  WALLET_FIRST_DEFERRED_CHECKOUT_QUOTES_TABLE,
  applyWalletFirstDeferredCheckoutMigrations,
  dryRunWalletFirstDeferredCheckoutMigrations,
  validateWalletFirstDeferredCheckoutSchema
} from "../services/platform/wallet-first-deferred-checkout-migrations.mjs";
import {
  runWalletFirstDeferredCheckoutSchemaCli
} from "../../scripts/platform-wallet-first-deferred-checkout-schema.mjs";

const NOW = "2030-01-01T00:00:00.000Z";
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CLI_PATH = join(
  REPOSITORY_ROOT,
  "scripts",
  "platform-wallet-first-deferred-checkout-schema.mjs"
);
const CLI_OUTPUT_KEYS = Object.freeze([
  "appliedMigrationIds",
  "checks",
  "mode",
  "ok",
  "pendingMigrationIds",
  "reasonCodes",
  "requiredMigrationId",
  "schemaState",
  "sourceChanged"
]);
const CLI_CHECK_KEYS = Object.freeze([
  "deferredTransitionDependency",
  "foreignKeys",
  "quickCheck",
  "schemaExact"
]);

async function withDatabase(callback) {
  const directory = mkdtempSync(join(tmpdir(), "wallet-first-checkout-migration-"));
  const dbPath = join(directory, "control.sqlite");
  try {
    return await callback({ directory, dbPath });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function digest(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function runCli(argv) {
  return spawnSync(process.execPath, [CLI_PATH, ...argv], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    env: {},
    timeout: 15_000,
    windowsHide: true
  });
}

function parseCliOutput(result, forbidden = []) {
  assert.equal(result.error, undefined);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout.endsWith("\n"), true);
  const lines = result.stdout.trimEnd().split(/\r?\n/);
  assert.equal(lines.length, 1);
  const output = JSON.parse(lines[0]);
  assert.deepEqual(Object.keys(output).sort(), CLI_OUTPUT_KEYS);
  assert.deepEqual(Object.keys(output.checks).sort(), CLI_CHECK_KEYS);
  const serialized = `${result.stdout}${result.stderr}`;
  for (const value of [...forbidden, "Error:", "SQLITE_", "create table", "insert into", "select "]) {
    assert.equal(serialized.toLowerCase().includes(value.toLowerCase()), false);
  }
  return output;
}

function exactApplyArguments(dbPath) {
  return [
    "--mode", "apply",
    "--db-path", dbPath,
    "--confirm-migration-id", REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID,
    "--confirm-ddl-checksum", WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATIONS[0].ddlChecksum
  ];
}

function cliValidation({
  ok,
  schemaState,
  checks,
  reasonCodes,
  pendingMigrationIds = []
}) {
  return {
    ok,
    schemaState,
    requiredMigrationId: REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID,
    checks,
    reasonCodes,
    pendingMigrationIds
  };
}

const CLI_READY_CHECKS = Object.freeze({
  deferredTransitionDependency: true,
  schemaExact: true,
  quickCheck: true,
  foreignKeys: true
});
const CLI_PENDING_CHECKS = Object.freeze({
  deferredTransitionDependency: true,
  schemaExact: false,
  quickCheck: true,
  foreignKeys: true
});

function cliReadyTarget({
  appliedMigrationIds = [],
  pendingMigrationIds = [],
  sourceChanged = false
} = {}) {
  return {
    ...cliValidation({
      ok: true,
      schemaState: "ready",
      checks: CLI_READY_CHECKS,
      reasonCodes: [],
      pendingMigrationIds
    }),
    sourceChanged,
    appliedMigrationIds
  };
}

function withBackupHook(action, operation) {
  const originalBackup = Database.prototype.backup;
  let invoked = false;
  Database.prototype.backup = function patchedBackup(...args) {
    const result = originalBackup.apply(this, args);
    if (invoked) return result;
    invoked = true;
    return Promise.resolve(result).then((value) => {
      action();
      return value;
    });
  };
  return Promise.resolve()
    .then(operation)
    .finally(() => {
      Database.prototype.backup = originalBackup;
      assert.equal(invoked, true);
    });
}

function withPreBackupHook(action, operation) {
  const originalBackup = Database.prototype.backup;
  let invoked = false;
  Database.prototype.backup = function patchedBackup(...args) {
    if (!invoked) {
      invoked = true;
      action();
    }
    return originalBackup.apply(this, args);
  };
  return Promise.resolve()
    .then(operation)
    .finally(() => {
      Database.prototype.backup = originalBackup;
      assert.equal(invoked, true);
    });
}

function openWalWriter(dbPath) {
  const writer = new Database(dbPath);
  assert.equal(String(writer.pragma("journal_mode = WAL", { simple: true })).toLowerCase(), "wal");
  return writer;
}

function insertWalOnlyAccount(writer, id) {
  writer.prepare(`
    insert into platform_accounts (
      id, owner_ref, status, created_at, updated_at, metadata_json
    ) values (?, ?, 'active', ?, ?, '{}')
  `).run(id, `owner_${id}`, NOW, NOW);
}

function foundation(dbPath) {
  const database = new Database(dbPath);
  try {
    database.pragma("foreign_keys = ON");
    database.exec(`
      create table platform_accounts (
        id text primary key,
        owner_ref text not null,
        status text not null,
        created_at text not null,
        updated_at text not null,
        metadata_json text not null default '{}'
      );
      create table platform_entitlements (
        id text primary key,
        account_id text not null references platform_accounts(id),
        status text not null,
        valid_from text not null,
        valid_until text not null
      );
      create table platform_issuance_requests (
        id text primary key,
        account_id text not null references platform_accounts(id),
        entitlement_id text not null references platform_entitlements(id),
        status text not null default 'issued'
      );
      create table platform_issued_subscription_links (
        id text primary key,
        request_id text not null references platform_issuance_requests(id),
        tenant_ref text not null default '',
        artifact_ref text not null default '',
        status text not null default 'active'
      );
      create table platform_portal_access_requests (
        id text primary key,
        portal_user_ref text not null,
        entitlement_ref text,
        status text not null,
        expires_at text,
        valid_until text,
        tenant_id text,
        artifact_id text
      );
    `);
  } finally {
    database.close();
  }
  applyCoinWalletMigrations({
    dbPath,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(NOW)
  });
  applyCoinCommerceMigrations({
    dbPath,
    expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(NOW)
  });
}

function deferred(dbPath) {
  return applyDeferredResourceTransitionMigrations({
    dbPath,
    expectedMigrationId: REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID,
    expectedDdlChecksum: REQUIRED_DEFERRED_RESOURCE_TRANSITION_DDL_CHECKSUM,
    nowFn: () => new Date(NOW)
  });
}

function checkout(dbPath) {
  return applyWalletFirstDeferredCheckoutMigrations({
    dbPath,
    expectedMigrationId: REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID,
    expectedDdlChecksum: WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(NOW)
  });
}

test("checkout quote successor refuses a missing deferred foundation", () => withDatabase(({ dbPath }) => {
  foundation(dbPath);
  const inspected = validateWalletFirstDeferredCheckoutSchema({ dbPath });
  assert.equal(inspected.ok, false);
  assert.deepEqual(inspected.reasonCodes, ["migration_dependency_missing"]);
  assert.throws(() => checkout(dbPath), (error) => error?.code === "migration_dependency_missing");
}));

test("checkout quote successor applies exact schema idempotently without ordinary Commerce objects", () => withDatabase(({ dbPath }) => {
  foundation(dbPath);
  deferred(dbPath);
  const first = checkout(dbPath);
  const second = checkout(dbPath);
  assert.equal(first.ok, true);
  assert.deepEqual(first.appliedMigrationIds, [
    REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID
  ]);
  assert.equal(second.sourceChanged, false);
  const database = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    assert.equal(validateWalletFirstDeferredCheckoutSchema({ database }).ok, true);
    const columns = database.pragma(`table_info(${WALLET_FIRST_DEFERRED_CHECKOUT_QUOTES_TABLE})`)
      .map(({ name }) => name);
    assert.equal(columns.includes("transition_ref"), true);
    assert.equal(columns.includes("hold_ref"), false);
    assert.equal(database.prepare(`
      select count(*) from sqlite_master where name = 'platform_coin_commerce_orders'
    `).pluck().get(), 1);
  } finally {
    database.close();
  }
}));

test("checkout schema CLI recognizes pending, dry-runs a snapshot, and leaves source unchanged", async () => withDatabase(async ({ directory, dbPath }) => {
  foundation(dbPath);
  deferred(dbPath);
  const before = digest(dbPath);
  const validation = await runWalletFirstDeferredCheckoutSchemaCli({
    argv: ["--mode", "validate", "--db-path", dbPath]
  });
  assert.equal(validation.exitCode, 3);
  assert.deepEqual(validation.output.pendingMigrationIds, [
    REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID
  ]);
  const dryRun = await runWalletFirstDeferredCheckoutSchemaCli({
    argv: [
      "--mode", "dry-run", "--db-path", dbPath,
      "--temp-root", directory
    ]
  });
  assert.equal(dryRun.exitCode, 0, JSON.stringify(dryRun));
  assert.equal(dryRun.output.ok, true);
  assert.equal(digest(dbPath), before);
  assert.equal(validateWalletFirstDeferredCheckoutSchema({ dbPath }).schemaState, "pending");
}));

test("checkout schema CLI process applies only after exact confirmation and redacts database paths", async () => withDatabase(async ({ directory, dbPath }) => {
  foundation(dbPath);
  deferred(dbPath);
  const sourceHash = digest(dbPath);

  const pending = runCli(["--mode", "validate", "--db-path", dbPath]);
  assert.equal(pending.status, 3);
  const pendingOutput = parseCliOutput(pending, [dbPath]);
  assert.deepEqual(pendingOutput.reasonCodes, ["required_migration_missing"]);
  assert.equal(digest(dbPath), sourceHash);

  const dryRun = runCli([
    "--mode", "dry-run", "--db-path", dbPath, "--temp-root", directory
  ]);
  assert.equal(dryRun.status, 0);
  const dryRunOutput = parseCliOutput(dryRun, [dbPath, directory]);
  assert.equal(dryRunOutput.ok, true);
  assert.equal(dryRunOutput.sourceChanged, false);
  assert.deepEqual(dryRunOutput.appliedMigrationIds, [
    REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID
  ]);
  assert.equal(digest(dbPath), sourceHash);

  const rejectedApply = runCli(["--mode", "apply", "--db-path", dbPath]);
  assert.equal(rejectedApply.status, 2);
  assert.deepEqual(
    parseCliOutput(rejectedApply, [dbPath]).reasonCodes,
    ["apply_confirmation_required"]
  );
  assert.equal(digest(dbPath), sourceHash);

  const applied = runCli(exactApplyArguments(dbPath));
  assert.equal(applied.status, 0);
  const appliedOutput = parseCliOutput(applied, [dbPath]);
  assert.equal(appliedOutput.sourceChanged, true);
  assert.deepEqual(appliedOutput.appliedMigrationIds, [
    REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID
  ]);

  const replay = runCli(exactApplyArguments(dbPath));
  assert.equal(replay.status, 0);
  const replayOutput = parseCliOutput(replay, [dbPath]);
  assert.equal(replayOutput.sourceChanged, false);
  assert.deepEqual(replayOutput.appliedMigrationIds, []);
}));

test("checkout dry-run accepts a preexisting WAL and a checkpoint without a source mutation", async () => withDatabase(async ({ directory, dbPath }) => {
  foundation(dbPath);
  deferred(dbPath);
  const writer = openWalWriter(dbPath);
  try {
    insertWalOnlyAccount(writer, "acct_checkout_preexisting_wal");
    const preexisting = await dryRunWalletFirstDeferredCheckoutMigrations({
      dbPath,
      tempRoot: directory
    });
    assert.equal(preexisting.ok, true);

    let checkpointRows;
    const checkpoint = await withBackupHook(
      () => {
        checkpointRows = writer.pragma("wal_checkpoint(PASSIVE)");
      },
      () => dryRunWalletFirstDeferredCheckoutMigrations({ dbPath, tempRoot: directory })
    );
    assert.equal(checkpoint.ok, true);
    assert.equal(checkpointRows[0].busy, 0);
    assert.equal(checkpointRows[0].checkpointed > 0, true);
  } finally {
    writer.close();
  }
}));

test("checkout dry-run rejects a concurrent WAL-only source commit", async () => withDatabase(async ({ directory, dbPath }) => {
  foundation(dbPath);
  deferred(dbPath);
  const writer = openWalWriter(dbPath);
  try {
    await assert.rejects(
      () => withBackupHook(
        () => insertWalOnlyAccount(writer, "acct_checkout_concurrent_wal"),
        () => dryRunWalletFirstDeferredCheckoutMigrations({ dbPath, tempRoot: directory })
      ),
      (error) => error?.code === "source_changed_during_dry_run"
    );
  } finally {
    writer.close();
  }
}));

test("checkout dry-run rejects a WAL-only source commit after inspection and before backup", async () => withDatabase(async ({ directory, dbPath }) => {
  foundation(dbPath);
  deferred(dbPath);
  const writer = openWalWriter(dbPath);
  try {
    await assert.rejects(
      () => withPreBackupHook(
        () => insertWalOnlyAccount(writer, "acct_checkout_prebackup_wal"),
        () => dryRunWalletFirstDeferredCheckoutMigrations({ dbPath, tempRoot: directory })
      ),
      (error) => error?.code === "source_changed_during_dry_run"
    );
  } finally {
    writer.close();
  }
}));

test("checkout schema CLI rejects malformed preflight states and contract paths before dispatch", async () => {
  const dbPath = resolve(tmpdir(), "wallet-first-checkout-cli-contract.sqlite");
  const calls = [];
  const operations = {
    validateWalletFirstDeferredCheckoutSchema() {
      calls.push("validate");
      return cliValidation({
        ok: false,
        schemaState: "blocked",
        checks: CLI_PENDING_CHECKS,
        reasonCodes: ["required_migration_missing"],
        pendingMigrationIds: []
      });
    },
    dryRunWalletFirstDeferredCheckoutMigrations() {
      calls.push("dry-run");
      throw new Error("must not dispatch");
    },
    applyWalletFirstDeferredCheckoutMigrations() {
      calls.push("apply");
      throw new Error("must not dispatch");
    }
  };

  const invalidMode = await runWalletFirstDeferredCheckoutSchemaCli({
    argv: ["--mode", "rollback", "--db-path", dbPath],
    operations
  });
  assert.equal(invalidMode.exitCode, 2);
  assert.deepEqual(invalidMode.output.reasonCodes, ["invalid_mode"]);

  const rootRelative = await runWalletFirstDeferredCheckoutSchemaCli({
    argv: ["--mode", "validate", "--db-path", "\\root-relative.sqlite"],
    operations
  });
  assert.equal(rootRelative.exitCode, 2);
  assert.deepEqual(rootRelative.output.reasonCodes, ["database_path_must_be_absolute"]);

  const blocked = await runWalletFirstDeferredCheckoutSchemaCli({
    argv: ["--mode", "dry-run", "--db-path", dbPath],
    operations
  });
  assert.equal(blocked.exitCode, 3);
  assert.deepEqual(blocked.output.reasonCodes, ["required_migration_missing"]);
  assert.deepEqual(calls, ["validate"]);

  operations.validateWalletFirstDeferredCheckoutSchema = () => {
    calls.push("pending-extra");
    return cliValidation({
      ok: false,
      schemaState: "pending",
      checks: { ...CLI_PENDING_CHECKS, quickCheck: false },
      reasonCodes: ["quick_check_failed", "required_migration_missing"],
      pendingMigrationIds: [REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID]
    });
  };
  const pendingExtra = await runWalletFirstDeferredCheckoutSchemaCli({
    argv: ["--mode", "dry-run", "--db-path", dbPath],
    operations
  });
  assert.equal(pendingExtra.exitCode, 4);
  assert.deepEqual(pendingExtra.output.reasonCodes, ["unexpected_execution_failure"]);
  assert.deepEqual(calls, ["validate", "pending-extra"]);

  operations.validateWalletFirstDeferredCheckoutSchema = () => {
    calls.push("unknown-state");
    return cliValidation({
      ok: false,
      schemaState: "unknown",
      checks: CLI_PENDING_CHECKS,
      reasonCodes: ["required_migration_missing"],
      pendingMigrationIds: [REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID]
    });
  };
  const unknown = await runWalletFirstDeferredCheckoutSchemaCli({
    argv: ["--mode", "dry-run", "--db-path", dbPath],
    operations
  });
  assert.equal(unknown.exitCode, 4);
  assert.deepEqual(unknown.output.reasonCodes, ["unexpected_execution_failure"]);
  assert.deepEqual(calls, ["validate", "pending-extra", "unknown-state"]);
});

test("checkout schema CLI requires target migration lists to match its exact pending preflight", async () => {
  const dbPath = resolve(tmpdir(), "wallet-first-checkout-cli-target.sqlite");
  const calls = [];
  const operations = {
    validateWalletFirstDeferredCheckoutSchema() {
      calls.push("validate");
      return cliValidation({
        ok: false,
        schemaState: "pending",
        checks: CLI_PENDING_CHECKS,
        reasonCodes: ["required_migration_missing"],
        pendingMigrationIds: [REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID]
      });
    },
    dryRunWalletFirstDeferredCheckoutMigrations() {
      calls.push("dry-run");
      return cliReadyTarget();
    },
    applyWalletFirstDeferredCheckoutMigrations() {
      calls.push("apply");
      return cliReadyTarget();
    }
  };
  const outcome = await runWalletFirstDeferredCheckoutSchemaCli({
    argv: ["--mode", "dry-run", "--db-path", dbPath],
    operations
  });
  assert.equal(outcome.exitCode, 4);
  assert.deepEqual(outcome.output.reasonCodes, ["unexpected_execution_failure"]);
  assert.deepEqual(calls, ["validate", "dry-run"]);
});
