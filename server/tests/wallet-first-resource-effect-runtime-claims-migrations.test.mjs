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
  DEFERRED_RESOURCE_TRANSITION_MIGRATIONS,
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
    expectedDdlChecksum: DEFERRED_RESOURCE_TRANSITION_MIGRATIONS[0].ddlChecksum,
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
