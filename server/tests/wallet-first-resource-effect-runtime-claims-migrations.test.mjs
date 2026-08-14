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
  createSqliteSubscriptionControlStore
} from "../services/platform/subscription-control-db.mjs";
import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  applyCoinWalletMigrations
} from "../services/platform/coin-wallet-migrations.mjs";
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
  REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID,
  WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATIONS,
  applyWalletFirstDeferredCheckoutMigrations
} from "../services/platform/wallet-first-deferred-checkout-migrations.mjs";
import {
  REQUIRED_WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_MIGRATION_ID,
  WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_MIGRATIONS,
  WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_TABLE,
  applyWalletFirstResourceEffectRuntimeClaimsMigrations,
  dryRunWalletFirstResourceEffectRuntimeClaimsMigrations,
  validateWalletFirstResourceEffectRuntimeClaimsSchema
} from "../services/platform/wallet-first-resource-effect-runtime-claims-migrations.mjs";
import {
  runWalletFirstResourceEffectRuntimeClaimsSchemaCli
} from "../../scripts/platform-wallet-first-resource-effect-runtime-claims-schema.mjs";

const NOW = "2030-01-01T00:00:00.000Z";
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CLI_PATH = join(
  REPOSITORY_ROOT,
  "scripts",
  "platform-wallet-first-resource-effect-runtime-claims-schema.mjs"
);
const OUTPUT_KEYS = Object.freeze([
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
const CHECK_KEYS = Object.freeze([
  "deferredCheckoutDependency",
  "foreignKeys",
  "quickCheck",
  "schemaExact"
]);

async function withDatabase(callback) {
  const directory = mkdtempSync(join(tmpdir(), "wallet-first-runtime-claims-migration-"));
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

function bootstrapCheckout(dbPath) {
  const control = createSqliteSubscriptionControlStore({ dbPath });
  control.close();
  const nowFn = () => new Date(NOW);
  applyCoinWalletMigrations({
    dbPath,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn
  });
  applyCoinCommerceMigrations({
    dbPath,
    expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
    nowFn
  });
  applyDeferredResourceTransitionMigrations({
    dbPath,
    expectedMigrationId: REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID,
    expectedDdlChecksum: REQUIRED_DEFERRED_RESOURCE_TRANSITION_DDL_CHECKSUM,
    nowFn
  });
  applyWalletFirstDeferredCheckoutMigrations({
    dbPath,
    expectedMigrationId: REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID,
    expectedDdlChecksum: WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATIONS[0].ddlChecksum,
    nowFn
  });
}

function applyClaims(dbPath) {
  return applyWalletFirstResourceEffectRuntimeClaimsMigrations({
    dbPath,
    expectedMigrationId: REQUIRED_WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_MIGRATION_ID,
    expectedDdlChecksum: WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(NOW)
  });
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

function parseOutput(result) {
  assert.equal(result.error, undefined);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout.endsWith("\n"), true);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(output).sort(), OUTPUT_KEYS);
  assert.deepEqual(Object.keys(output.checks).sort(), CHECK_KEYS);
  const serialized = `${result.stdout}${result.stderr}`.toLowerCase();
  for (const forbidden of ["error:", "sqlite_", "create table", "insert into"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
  return output;
}

function pendingValidation(overrides = {}) {
  return {
    ok: false,
    schemaState: "pending",
    requiredMigrationId: REQUIRED_WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_MIGRATION_ID,
    checks: {
      deferredCheckoutDependency: true,
      schemaExact: false,
      quickCheck: true,
      foreignKeys: true
    },
    reasonCodes: ["required_migration_missing"],
    pendingMigrationIds: [
      REQUIRED_WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_MIGRATION_ID
    ],
    ...overrides
  };
}

function readyResult(overrides = {}) {
  return {
    ok: true,
    schemaState: "ready",
    requiredMigrationId: REQUIRED_WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_MIGRATION_ID,
    checks: {
      deferredCheckoutDependency: true,
      schemaExact: true,
      quickCheck: true,
      foreignKeys: true
    },
    reasonCodes: [],
    pendingMigrationIds: [],
    appliedMigrationIds: [],
    sourceChanged: false,
    ...overrides
  };
}

test("runtime-claim successor refuses a checkout dependency that is not ready", () => withDatabase(({ dbPath }) => {
  const control = createSqliteSubscriptionControlStore({ dbPath });
  control.close();
  const inspection = validateWalletFirstResourceEffectRuntimeClaimsSchema({ dbPath });
  assert.equal(inspection.ok, false);
  assert.deepEqual(inspection.reasonCodes, ["migration_dependency_missing"]);
  assert.throws(() => applyClaims(dbPath), (error) => error?.code === "migration_dependency_missing");
}));

test("runtime-claim successor applies exact lease schema idempotently", () => withDatabase(({ dbPath }) => {
  bootstrapCheckout(dbPath);
  const pending = validateWalletFirstResourceEffectRuntimeClaimsSchema({ dbPath });
  assert.equal(pending.schemaState, "pending");
  const first = applyClaims(dbPath);
  const second = applyClaims(dbPath);
  assert.equal(first.ok, true);
  assert.deepEqual(first.appliedMigrationIds, [
    REQUIRED_WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_MIGRATION_ID
  ]);
  assert.equal(second.sourceChanged, false);
  const database = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    assert.equal(validateWalletFirstResourceEffectRuntimeClaimsSchema({ database }).ok, true);
    const columns = database.pragma(`table_info(${WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_TABLE})`)
      .map(({ name }) => name);
    for (const required of [
      "transition_ref", "effect_ref", "status", "lease_generation", "lease_token",
      "lease_until", "safe_code", "recorded_at"
    ]) {
      assert.equal(columns.includes(required), true);
    }
  } finally {
    database.close();
  }
}));

test("runtime-claim CLI dry-runs a pending successor and applies only with exact confirmation", async () => withDatabase(async ({ directory, dbPath }) => {
  bootstrapCheckout(dbPath);
  const before = digest(dbPath);
  const validation = await runWalletFirstResourceEffectRuntimeClaimsSchemaCli({
    argv: ["--mode", "validate", "--db-path", dbPath]
  });
  assert.equal(validation.exitCode, 3);
  assert.deepEqual(validation.output.pendingMigrationIds, [
    REQUIRED_WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_MIGRATION_ID
  ]);
  const dryRun = await runWalletFirstResourceEffectRuntimeClaimsSchemaCli({
    argv: ["--mode", "dry-run", "--db-path", dbPath, "--temp-root", directory]
  });
  assert.equal(dryRun.exitCode, 0);
  assert.equal(dryRun.output.ok, true);
  assert.equal(digest(dbPath), before);

  const processResult = runCli([
    "--mode", "apply", "--db-path", dbPath,
    "--confirm-migration-id", REQUIRED_WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_MIGRATION_ID,
    "--confirm-ddl-checksum", WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_MIGRATIONS[0].ddlChecksum
  ]);
  assert.equal(processResult.status, 0);
  const applied = parseOutput(processResult);
  assert.equal(applied.ok, true);
  assert.deepEqual(applied.appliedMigrationIds, [
    REQUIRED_WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_MIGRATION_ID
  ]);
}));

test("runtime-claim dry-run accepts a preexisting WAL and a checkpoint without a source mutation", async () => withDatabase(async ({ directory, dbPath }) => {
  bootstrapCheckout(dbPath);
  const writer = openWalWriter(dbPath);
  try {
    insertWalOnlyAccount(writer, "acct_runtime_claims_preexisting_wal");
    const preexisting = await dryRunWalletFirstResourceEffectRuntimeClaimsMigrations({
      dbPath,
      tempRoot: directory
    });
    assert.equal(preexisting.ok, true);

    let checkpointRows;
    const checkpoint = await withBackupHook(
      () => {
        checkpointRows = writer.pragma("wal_checkpoint(PASSIVE)");
      },
      () => dryRunWalletFirstResourceEffectRuntimeClaimsMigrations({
        dbPath,
        tempRoot: directory
      })
    );
    assert.equal(checkpoint.ok, true);
    assert.equal(checkpointRows[0].busy, 0);
    assert.equal(checkpointRows[0].checkpointed > 0, true);
  } finally {
    writer.close();
  }
}));

test("runtime-claim dry-run rejects a concurrent WAL-only source commit", async () => withDatabase(async ({ directory, dbPath }) => {
  bootstrapCheckout(dbPath);
  const writer = openWalWriter(dbPath);
  try {
    await assert.rejects(
      () => withBackupHook(
        () => insertWalOnlyAccount(writer, "acct_runtime_claims_concurrent_wal"),
        () => dryRunWalletFirstResourceEffectRuntimeClaimsMigrations({
          dbPath,
          tempRoot: directory
        })
      ),
      (error) => error?.code === "source_changed_during_dry_run"
    );
  } finally {
    writer.close();
  }
}));

test("runtime-claim dry-run rejects a WAL-only source commit after inspection and before backup", async () => withDatabase(async ({ directory, dbPath }) => {
  bootstrapCheckout(dbPath);
  const writer = openWalWriter(dbPath);
  try {
    await assert.rejects(
      () => withPreBackupHook(
        () => insertWalOnlyAccount(writer, "acct_runtime_claims_prebackup_wal"),
        () => dryRunWalletFirstResourceEffectRuntimeClaimsMigrations({
          dbPath,
          tempRoot: directory
        })
      ),
      (error) => error?.code === "source_changed_during_dry_run"
    );
  } finally {
    writer.close();
  }
}));

test("runtime-claim validator closes on an owned-object mutation", () => withDatabase(({ dbPath }) => {
  bootstrapCheckout(dbPath);
  applyClaims(dbPath);
  const database = new Database(dbPath);
  try {
    database.exec(`drop index platform_wallet_first_resource_effect_runtime_claims_claimable_idx`);
  } finally {
    database.close();
  }
  const inspection = validateWalletFirstResourceEffectRuntimeClaimsSchema({ dbPath });
  assert.equal(inspection.ok, false);
  assert.equal(inspection.schemaState, "blocked");
  assert.equal(inspection.reasonCodes.includes("owned_object_missing"), true);
}));

test("runtime-claim CLI rejects invalid modes and non-fully-qualified paths before dispatch", async () => {
  const dbPath = resolve("runtime-claims-cli-contract.sqlite");
  const cases = [
    [
      ["--mode", "rollback", "--db-path", dbPath],
      "invalid_mode"
    ],
    [
      ["--mode", "validate", "--db-path", "relative.sqlite"],
      "database_path_must_be_absolute"
    ],
    [
      ["--mode", "validate", "--db-path", String.raw`\root-relative.sqlite`],
      "database_path_must_be_absolute"
    ]
  ];
  for (const [argv, reasonCode] of cases) {
    const calls = [];
    const outcome = await runWalletFirstResourceEffectRuntimeClaimsSchemaCli({
      argv,
      operations: {
        validateWalletFirstResourceEffectRuntimeClaimsSchema() {
          calls.push("validate");
          return pendingValidation();
        },
        dryRunWalletFirstResourceEffectRuntimeClaimsMigrations() {
          calls.push("dry-run");
          return readyResult();
        },
        applyWalletFirstResourceEffectRuntimeClaimsMigrations() {
          calls.push("apply");
          return readyResult();
        }
      }
    });
    assert.equal(outcome.exitCode, 2);
    assert.deepEqual(outcome.output.reasonCodes, [reasonCode]);
    assert.deepEqual(calls, []);
  }
});

test("runtime-claim CLI blocks contradictory and unknown preflight states without dispatch", async () => {
  const dbPath = resolve("runtime-claims-cli-preflight.sqlite");
  const cases = [
    {
      name: "blocked required migration",
      validation: pendingValidation({ schemaState: "blocked" }),
      exitCode: 3,
      reasonCodes: ["required_migration_missing"]
    },
    {
      name: "pending with extra reason",
      validation: pendingValidation({
        reasonCodes: ["required_migration_missing", "owned_object_missing"]
      }),
      exitCode: 4,
      reasonCodes: ["unexpected_execution_failure"]
    },
    {
      name: "unknown state",
      validation: pendingValidation({ schemaState: "unknown" }),
      exitCode: 4,
      reasonCodes: ["unexpected_execution_failure"]
    }
  ];
  for (const item of cases) {
    const calls = [];
    const outcome = await runWalletFirstResourceEffectRuntimeClaimsSchemaCli({
      argv: ["--mode", "dry-run", "--db-path", dbPath],
      operations: {
        validateWalletFirstResourceEffectRuntimeClaimsSchema() {
          calls.push("validate");
          return item.validation;
        },
        dryRunWalletFirstResourceEffectRuntimeClaimsMigrations() {
          calls.push("dry-run");
          return readyResult();
        },
        applyWalletFirstResourceEffectRuntimeClaimsMigrations() {
          calls.push("apply");
          return readyResult();
        }
      }
    });
    assert.equal(outcome.exitCode, item.exitCode, item.name);
    assert.deepEqual(outcome.output.reasonCodes, item.reasonCodes, item.name);
    assert.deepEqual(calls, ["validate"], item.name);
  }
});

test("runtime-claim CLI rejects a target result that disagrees with pending preflight", async () => {
  const calls = [];
  const outcome = await runWalletFirstResourceEffectRuntimeClaimsSchemaCli({
    argv: ["--mode", "dry-run", "--db-path", resolve("runtime-claims-cli-target.sqlite")],
    operations: {
      validateWalletFirstResourceEffectRuntimeClaimsSchema() {
        calls.push("validate");
        return pendingValidation();
      },
      dryRunWalletFirstResourceEffectRuntimeClaimsMigrations() {
        calls.push("dry-run");
        return readyResult();
      },
      applyWalletFirstResourceEffectRuntimeClaimsMigrations() {
        calls.push("apply");
        return readyResult();
      }
    }
  });
  assert.equal(outcome.exitCode, 4);
  assert.deepEqual(outcome.output.reasonCodes, ["unexpected_execution_failure"]);
  assert.deepEqual(calls, ["validate", "dry-run"]);
});
