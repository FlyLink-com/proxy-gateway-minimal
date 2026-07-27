import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

import {
  COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID
} from "../services/platform/coin-commerce-migrations.mjs";
import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  applyCoinWalletMigrations
} from "../services/platform/coin-wallet-migrations.mjs";
import { runCoinCommerceSchemaCli } from "../../scripts/platform-coin-commerce-schema.mjs";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CLI_PATH = join(REPOSITORY_ROOT, "scripts", "platform-coin-commerce-schema.mjs");
const PACKAGE_PATH = join(REPOSITORY_ROOT, "package.json");
const DDL_CHECKSUM = COIN_COMMERCE_MIGRATIONS[0].ddlChecksum;

function withTempDirectory(action) {
  const directory = mkdtempSync(join(tmpdir(), "coin-commerce-cli-test-"));
  try {
    return action(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}

function createWalletDatabase(dbPath) {
  const database = new Database(dbPath);
  database.exec(`
    create table platform_accounts (
      id text primary key,
      owner_ref text not null,
      status text not null,
      created_at text not null,
      updated_at text not null,
      metadata_json text not null default '{}'
    );
    create table synthetic_private_sentinel (
      sentinel_key text primary key,
      sentinel_value text not null
    );
    insert into synthetic_private_sentinel
      values ('account_private', 'order_private');
  `);
  database.close();
  applyCoinWalletMigrations({
    dbPath,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum
  });
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function runCli(args) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    env: {},
    timeout: 10_000,
    windowsHide: true
  });
}

function parseClosedOutput(result, { forbidden = [] } = {}) {
  assert.equal(result.error, undefined);
  assert.equal(result.stderr, "");
  const lines = result.stdout.trimEnd().split(/\r?\n/);
  assert.equal(lines.length, 1);
  const output = JSON.parse(lines[0]);
  assert.deepEqual(Object.keys(output).sort(), [
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
  assert.deepEqual(Object.keys(output.checks).sort(), [
    "foreignKeys",
    "quickCheck",
    "schemaExact",
    "walletDependency"
  ]);
  const serialized = `${result.stdout}\n${result.stderr}`;
  for (const value of [
    "create table",
    "select ",
    "insert ",
    "pragma ",
    "Error:",
    "SQLITE_",
    ...forbidden
  ]) {
    assert.equal(serialized.includes(value), false, `output leaked ${value}`);
  }
  return output;
}

function exactApplyArguments(dbPath) {
  return [
    "--mode",
    "apply",
    "--db-path",
    dbPath,
    "--confirm-migration-id",
    REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    "--confirm-ddl-checksum",
    DDL_CHECKSUM
  ];
}

test("package exposes the closed Commerce schema CLI", () => {
  const packageJson = JSON.parse(readFileSync(PACKAGE_PATH, "utf8"));
  assert.equal(
    packageJson.scripts["platform:coin-commerce:schema"],
    "node scripts/platform-coin-commerce-schema.mjs"
  );
});

test("missing, duplicate, unknown, empty, and relative arguments are contract rejections", () => {
  const cases = [
    [[], "mode_required"],
    [["--mode", "validate"], "database_path_required"],
    [["--mode", "unknown", "--db-path", "C:\\synthetic.sqlite"], "invalid_mode"],
    [["--mode", "validate", "--mode", "validate", "--db-path", "C:\\synthetic.sqlite"], "duplicate_argument"],
    [["--mode", "validate", "--unknown", "value", "--db-path", "C:\\synthetic.sqlite"], "unknown_argument"],
    [["--mode", "", "--db-path", "C:\\synthetic.sqlite"], "empty_argument"],
    [["--mode", "validate", "--db-path", "relative.sqlite"], "database_path_must_be_absolute"]
  ];
  for (const [args, reason] of cases) {
    const result = runCli(args);
    assert.equal(result.status, 2);
    const output = parseClosedOutput(result);
    assert.equal(output.ok, false);
    assert.deepEqual(output.reasonCodes, [reason]);
  }
});

test("apply requires both exact confirmations and validate or dry-run reject them", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "synthetic.sqlite");
    createWalletDatabase(dbPath);
    const cases = [
      [["--mode", "apply", "--db-path", dbPath], "apply_confirmation_required"],
      [[
        "--mode", "apply", "--db-path", dbPath,
        "--confirm-migration-id", "wrong",
        "--confirm-ddl-checksum", DDL_CHECKSUM
      ], "migration_id_mismatch"],
      [[
        "--mode", "apply", "--db-path", dbPath,
        "--confirm-migration-id", REQUIRED_COIN_COMMERCE_MIGRATION_ID,
        "--confirm-ddl-checksum", "0".repeat(64)
      ], "migration_checksum_mismatch"],
      [[
        "--mode", "validate", "--db-path", dbPath,
        "--confirm-migration-id", REQUIRED_COIN_COMMERCE_MIGRATION_ID
      ], "argument_not_allowed_for_mode"],
      [[
        "--mode", "dry-run", "--db-path", dbPath,
        "--confirm-ddl-checksum", DDL_CHECKSUM
      ], "argument_not_allowed_for_mode"]
    ];
    for (const [args, reason] of cases) {
      const before = sha256File(dbPath);
      const result = runCli(args);
      assert.equal(result.status, 2);
      assert.deepEqual(parseClosedOutput(result, {
        forbidden: [dbPath, dbPath.split(/[\\/]/).at(-1)]
      }).reasonCodes, [reason]);
      assert.equal(sha256File(dbPath), before);
    }
  });
});

test("dry-run leaves the source unchanged and exact apply then validates", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "synthetic.sqlite");
    const tempRoot = join(directory, "dry-run");
    createWalletDatabase(dbPath);
    const before = sha256File(dbPath);

    const dryRun = runCli([
      "--mode", "dry-run", "--db-path", dbPath, "--temp-root", tempRoot
    ]);
    assert.equal(dryRun.status, 0);
    const dryOutput = parseClosedOutput(dryRun, {
      forbidden: [dbPath, tempRoot, "account_private", "order_private"]
    });
    assert.equal(dryOutput.ok, true);
    assert.equal(dryOutput.mode, "dry-run");
    assert.equal(dryOutput.sourceChanged, false);
    assert.deepEqual(dryOutput.pendingMigrationIds, [
      REQUIRED_COIN_COMMERCE_MIGRATION_ID
    ]);
    assert.equal(sha256File(dbPath), before);

    const apply = runCli(exactApplyArguments(dbPath));
    assert.equal(apply.status, 0);
    const applyOutput = parseClosedOutput(apply, {
      forbidden: [dbPath, "account_private", "order_private"]
    });
    assert.equal(applyOutput.ok, true);
    assert.equal(applyOutput.sourceChanged, true);
    assert.deepEqual(applyOutput.appliedMigrationIds, [
      REQUIRED_COIN_COMMERCE_MIGRATION_ID
    ]);

    const validate = runCli(["--mode", "validate", "--db-path", dbPath]);
    assert.equal(validate.status, 0);
    const validateOutput = parseClosedOutput(validate, { forbidden: [dbPath] });
    assert.equal(validateOutput.ok, true);
    assert.equal(validateOutput.mode, "validate");
  });
});

test("Wallet-only schema is a closed schema rejection without sensitive output", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "account_private_order_private.sqlite");
    createWalletDatabase(dbPath);
    const result = runCli(["--mode", "validate", "--db-path", dbPath]);
    assert.equal(result.status, 3);
    const output = parseClosedOutput(result, {
      forbidden: [
        dbPath,
        "account_private",
        "order_private",
        dbPath.split(/[\\/]/).at(-1)
      ]
    });
    assert.equal(output.ok, false);
    assert.equal(output.schemaState, "blocked");
  });
});

test("invalid database bytes return a redacted closed rejection", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "wallet_order_private.sqlite");
    writeFileSync(dbPath, "not a database account_private order_private");
    const result = runCli(["--mode", "validate", "--db-path", dbPath]);
    assert.equal(result.status, 3);
    const output = parseClosedOutput(result, {
      forbidden: [
        dbPath,
        dbPath.split(/[\\/]/).at(-1),
        "not a database",
        "account_private",
        "order_private"
      ]
    });
    assert.deepEqual(output.reasonCodes, ["database_invalid"]);
  });
});

test("unexpected operation errors are classified without exception text or private values", async () => {
  const privateValue = "account_private_order_private";
  const outcome = await runCoinCommerceSchemaCli({
    argv: ["--mode", "validate", "--db-path", resolve("synthetic.sqlite")],
    operations: {
      validateCoinCommerceSchema() {
        throw new Error(`SQLITE_BUSY ${privateValue}`);
      },
      dryRunCoinCommerceMigrations() {
        throw new Error(privateValue);
      },
      applyCoinCommerceMigrations() {
        throw new Error(privateValue);
      }
    }
  });
  assert.equal(outcome.exitCode, 4);
  assert.deepEqual(outcome.output.reasonCodes, ["unexpected_execution_failure"]);
  assert.equal(JSON.stringify(outcome.output).includes(privateValue), false);
});

test("unknown returned reason codes become a generic failure without leaking the raw value", async () => {
  const privateReasonCode = "account_private_order_private";
  const outcome = await runCoinCommerceSchemaCli({
    argv: ["--mode", "validate", "--db-path", resolve("synthetic.sqlite")],
    operations: {
      validateCoinCommerceSchema() {
        return {
          ok: true,
          mode: "validate",
          schemaState: "ready",
          sourceChanged: false,
          checks: {
            schemaExact: true,
            walletDependency: true,
            quickCheck: true,
            foreignKeys: true
          },
          reasonCodes: [privateReasonCode],
          appliedMigrationIds: [],
          pendingMigrationIds: []
        };
      },
      dryRunCoinCommerceMigrations() {
        throw new Error("not called");
      },
      applyCoinCommerceMigrations() {
        throw new Error("not called");
      }
    }
  });
  assert.equal(outcome.exitCode, 4);
  assert.equal(outcome.output.ok, false);
  assert.equal(outcome.output.schemaState, "unavailable");
  assert.deepEqual(outcome.output.reasonCodes, ["unexpected_execution_failure"]);
  assert.equal(JSON.stringify(outcome.output).includes(privateReasonCode), false);
});

test("migration confirmation identity is imported from the migration module", () => {
  assert.equal(
    REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    "20260726_001_coin_commerce_foundation"
  );
  assert.match(DDL_CHECKSUM, /^[a-f0-9]{64}$/);
});
