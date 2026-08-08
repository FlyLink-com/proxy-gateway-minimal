import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import Database from "better-sqlite3";

import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID
} from "../services/platform/coin-wallet-migrations.mjs";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CLI_PATH = join(REPOSITORY_ROOT, "scripts", "platform-coin-wallet-schema.mjs");
const PACKAGE_PATH = join(REPOSITORY_ROOT, "package.json");
const MIGRATION_ID = "20260723_001_coin_wallet_foundation";
const DDL_CHECKSUM = COIN_WALLET_MIGRATIONS[0].ddlChecksum;
const EXIT_SUCCESS = 0;
const EXIT_CONTRACT_REJECTED = 2;
const EXIT_SCHEMA_REJECTED = 3;
const EXIT_INFRASTRUCTURE_FAILURE = 4;

function withTempDirectory(prefix, action) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  try {
    return action(directory);
  } finally {
    rmSync(directory, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 50
    });
  }
}

async function withTempDirectoryAsync(prefix, action) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  try {
    return await action(directory);
  } finally {
    rmSync(directory, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 50
    });
  }
}

function createSyntheticDatabase(dbPath) {
  const database = new Database(dbPath);
  database.pragma("foreign_keys = ON");
  database.exec(`
    create table platform_accounts (
      id text primary key,
      owner_ref text not null,
      status text not null check (status in ('active', 'suspended', 'disabled')),
      created_at text not null,
      updated_at text not null,
      metadata_json text not null default '{}'
    );
  `);
  database.close();
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function runCli(args, { nodeArguments = [], timeout = 10_000 } = {}) {
  return spawnSync(process.execPath, [...nodeArguments, CLI_PATH, ...args], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    env: {},
    timeout,
    windowsHide: true
  });
}

function parseClosedOutput(result, { dbPath, forbidden = [] } = {}) {
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
    "schemaExact"
  ]);
  const serialized = `${result.stdout}\n${result.stderr}`;
  const forbiddenValues = [
    dbPath,
    dbPath ? dbPath.split(/[\\/]/).at(-1) : undefined,
    "create table",
    "select ",
    "insert ",
    "pragma ",
    "Error:",
    "not a database",
    ...forbidden
  ].filter(Boolean);
  for (const value of forbiddenValues) {
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
    MIGRATION_ID,
    "--confirm-ddl-checksum",
    DDL_CHECKSUM
  ];
}

test("package command exposes only the closed schema CLI entrypoint", () => {
  const packageJson = JSON.parse(readFileSync(PACKAGE_PATH, "utf8"));
  assert.equal(
    packageJson.scripts["platform:coin-wallet:schema"],
    "node scripts/platform-coin-wallet-schema.mjs"
  );
});

test("missing required arguments are contract rejections and never default to apply", () => {
  const result = runCli([]);
  assert.equal(result.status, EXIT_CONTRACT_REJECTED);
  const output = parseClosedOutput(result);
  assert.equal(output.ok, false);
  assert.equal(output.mode, null);
  assert.equal(output.schemaState, "rejected");
  assert.deepEqual(output.reasonCodes, ["mode_required"]);
  assert.deepEqual(output.appliedMigrationIds, []);
});

test("duplicate, unknown, empty, relative, and mode-incompatible arguments are rejected", () => {
  withTempDirectory("coin-wallet-cli-contract-", (directory) => {
    const dbPath = join(directory, "synthetic.sqlite");
    const tempRoot = join(directory, "dry-run");
    createSyntheticDatabase(dbPath);
    const cases = [
      {
        args: ["--mode", "validate", "--mode", "validate", "--db-path", dbPath],
        reason: "duplicate_argument"
      },
      {
        args: ["--mode", "validate", "--db-path", dbPath, "--extra", "value"],
        reason: "unknown_argument"
      },
      {
        args: ["--mode", "", "--db-path", dbPath],
        reason: "empty_argument"
      },
      {
        args: ["--mode", "validate", "--db-path", ""],
        reason: "empty_argument"
      },
      {
        args: ["--mode", "validate", "--db-path", "relative.sqlite"],
        reason: "database_path_must_be_absolute"
      },
      {
        args: ["--mode", "validate", "--db-path", dbPath, "--temp-root", tempRoot],
        reason: "argument_not_allowed_for_mode"
      },
      {
        args: [
          "--mode",
          "dry-run",
          "--db-path",
          dbPath,
          "--confirm-migration-id",
          MIGRATION_ID
        ],
        reason: "argument_not_allowed_for_mode"
      },
      {
        args: ["--mode", "apply", "--db-path", dbPath],
        reason: "apply_confirmation_required"
      },
      {
        args: ["--mode", "inspect", "--db-path", dbPath],
        reason: "invalid_mode"
      }
    ];
    for (const { args, reason } of cases) {
      const result = runCli(args);
      assert.equal(result.status, EXIT_CONTRACT_REJECTED);
      const output = parseClosedOutput(result, { dbPath });
      assert.equal(output.ok, false);
      assert.deepEqual(output.reasonCodes, [reason]);
      assert.deepEqual(output.appliedMigrationIds, []);
    }
  });
});

test("a drive-rooted database path without a drive is rejected before access", () => {
  withTempDirectory("coin-wallet-cli-drive-rooted-", (directory) => {
    const ambiguousDbPath = String.raw`\coin-wallet-ambiguous-db.sqlite`;
    const result = runCli([
      "--mode",
      "validate",
      "--db-path",
      ambiguousDbPath
    ]);
    assert.equal(result.status, EXIT_CONTRACT_REJECTED);
    const output = parseClosedOutput(result, {
      forbidden: [ambiguousDbPath, directory]
    });
    assert.equal(output.ok, false);
    assert.deepEqual(output.reasonCodes, ["database_path_must_be_absolute"]);
  });
});

test("a drive-rooted temp path without a drive is rejected before database access", () => {
  withTempDirectory("coin-wallet-cli-temp-drive-rooted-", (directory) => {
    const missingDbPath = join(directory, "missing.sqlite");
    const ambiguousTempRoot = String.raw`\coin-wallet-ambiguous-temp`;
    const result = runCli([
      "--mode",
      "dry-run",
      "--db-path",
      missingDbPath,
      "--temp-root",
      ambiguousTempRoot
    ]);
    assert.equal(result.status, EXIT_CONTRACT_REJECTED);
    const output = parseClosedOutput(result, {
      forbidden: [ambiguousTempRoot, missingDbPath]
    });
    assert.equal(output.ok, false);
    assert.deepEqual(output.reasonCodes, ["temp_root_must_be_absolute"]);
  });
});

test("unexpected execution errors are closed infrastructure failures", async () => {
  await withTempDirectoryAsync("coin-wallet-cli-execution-error-", async (directory) => {
    const dbPath = join(directory, "synthetic.sqlite");
    const arbitraryReason = "arbitrary_reason_from_execution_layer";
    const privateMessage = `${dbPath}: private raw execution detail`;
    const importUrl = `${pathToFileURL(CLI_PATH).href}?unexpected-execution-unit`;
    const importProbe = spawnSync(process.execPath, [
      "--input-type=module",
      "--eval",
      `await import(${JSON.stringify(importUrl)})`
    ], {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
      env: {},
      windowsHide: true
    });
    assert.equal(importProbe.status, 0);
    assert.equal(importProbe.stdout, "");
    assert.equal(importProbe.stderr, "");
    const cliModule = await import(importUrl);
    assert.equal(typeof cliModule.runCoinWalletSchemaCli, "function");

    const outcome = await cliModule.runCoinWalletSchemaCli({
      argv: ["--mode", "validate", "--db-path", dbPath],
      operations: {
        validateCoinWalletSchema() {
          throw Object.assign(new Error(privateMessage), {
            reasonCode: arbitraryReason
          });
        },
        applyCoinWalletMigrations() {
          throw new Error("not reached");
        },
        async dryRunCoinWalletMigrations() {
          throw new Error("not reached");
        }
      }
    });
    assert.equal(outcome.exitCode, EXIT_INFRASTRUCTURE_FAILURE);
    assert.equal(outcome.output.ok, false);
    assert.equal(outcome.output.schemaState, "unavailable");
    assert.deepEqual(
      outcome.output.reasonCodes,
      ["unexpected_execution_failure"]
    );
    const serialized = JSON.stringify(outcome.output);
    assert.equal(serialized.includes(arbitraryReason), false);
    assert.equal(serialized.includes(privateMessage), false);
    assert.equal(serialized.includes(dbPath), false);
  });
});

test("validate reports a missing database as a closed schema rejection", () => {
  withTempDirectory("coin-wallet-cli-missing-", (directory) => {
    const dbPath = join(directory, "missing.sqlite");
    const result = runCli(["--mode", "validate", "--db-path", dbPath]);
    assert.equal(result.status, EXIT_SCHEMA_REJECTED);
    const output = parseClosedOutput(result, { dbPath });
    assert.equal(output.ok, false);
    assert.equal(output.mode, "validate");
    assert.equal(output.schemaState, "blocked");
    assert.deepEqual(output.reasonCodes, ["database_missing"]);
  });
});

test("validate reports an incompatible synthetic schema without leaking details", () => {
  withTempDirectory("coin-wallet-cli-incompatible-", (directory) => {
    const dbPath = join(directory, "synthetic-account-private.sqlite");
    createSyntheticDatabase(dbPath);
    const result = runCli(["--mode", "validate", "--db-path", dbPath]);
    assert.equal(result.status, EXIT_SCHEMA_REJECTED);
    const output = parseClosedOutput(result, {
      dbPath,
      forbidden: ["synthetic-account-private"]
    });
    assert.equal(output.ok, false);
    assert.equal(output.schemaState, "blocked");
    assert.equal(output.checks.schemaExact, false);
    assert.ok(output.reasonCodes.includes("migration_ledger_missing"));
  });
});

test("dry-run reports migration-ledger checksum drift as a schema rejection", () => {
  withTempDirectory("coin-wallet-cli-ledger-drift-", (directory) => {
    const dbPath = join(directory, "synthetic.sqlite");
    createSyntheticDatabase(dbPath);
    const database = new Database(dbPath);
    database.exec(`
      create table platform_schema_migrations (
        migration_id text primary key,
        ddl_checksum text not null,
        applied_at text not null
      )
    `);
    database.prepare(`
      insert into platform_schema_migrations (
        migration_id,
        ddl_checksum,
        applied_at
      ) values (?, ?, ?)
    `).run(MIGRATION_ID, "0".repeat(64), "2026-07-23T00:00:00.000Z");
    database.close();

    const result = runCli(["--mode", "dry-run", "--db-path", dbPath]);
    assert.equal(result.status, EXIT_SCHEMA_REJECTED);
    const output = parseClosedOutput(result, { dbPath });
    assert.equal(output.ok, false);
    assert.equal(output.schemaState, "blocked");
    assert.deepEqual(output.reasonCodes, ["migration_checksum_mismatch"]);
  });
});

test("dry-run applies only to its snapshot and removes its owned temporary directory", () => {
  withTempDirectory("coin-wallet-cli-dry-run-", (directory) => {
    const dbPath = join(directory, "synthetic.sqlite");
    const tempRoot = join(directory, "dry-run-root");
    createSyntheticDatabase(dbPath);
    const before = sha256File(dbPath);
    const result = runCli([
      "--mode",
      "dry-run",
      "--db-path",
      dbPath,
      "--temp-root",
      tempRoot
    ]);
    assert.equal(result.status, EXIT_SUCCESS);
    const output = parseClosedOutput(result, { dbPath });
    assert.equal(output.ok, true);
    assert.equal(output.mode, "dry-run");
    assert.equal(output.schemaState, "ready");
    assert.equal(output.sourceChanged, false);
    assert.deepEqual(output.pendingMigrationIds, [MIGRATION_ID]);
    assert.deepEqual(output.appliedMigrationIds, [MIGRATION_ID]);
    assert.equal(sha256File(dbPath), before);
    assert.deepEqual(readdirSync(tempRoot), []);
  });
});

test("apply requires exact migration ID and checksum without mutating on mismatch", () => {
  withTempDirectory("coin-wallet-cli-confirm-", (directory) => {
    const cases = [
      {
        name: "migration ID",
        confirmation: [
          "--confirm-migration-id",
          `${MIGRATION_ID}_wrong`,
          "--confirm-ddl-checksum",
          DDL_CHECKSUM
        ],
        reason: "migration_id_mismatch"
      },
      {
        name: "DDL checksum",
        confirmation: [
          "--confirm-migration-id",
          MIGRATION_ID,
          "--confirm-ddl-checksum",
          "0".repeat(64)
        ],
        reason: "migration_checksum_mismatch"
      }
    ];
    for (const testCase of cases) {
      const dbPath = join(directory, `${testCase.name.replaceAll(" ", "-")}.sqlite`);
      createSyntheticDatabase(dbPath);
      const before = sha256File(dbPath);
      const result = runCli([
        "--mode",
        "apply",
        "--db-path",
        dbPath,
        ...testCase.confirmation
      ]);
      assert.equal(result.status, EXIT_CONTRACT_REJECTED);
      const output = parseClosedOutput(result, { dbPath });
      assert.equal(output.ok, false);
      assert.deepEqual(output.reasonCodes, [testCase.reason]);
      assert.equal(sha256File(dbPath), before);
    }
  });
});

test("exact apply migrates a synthetic database and validate reads it back", () => {
  withTempDirectory("coin-wallet-cli-apply-", (directory) => {
    const dbPath = join(directory, "synthetic.sqlite");
    createSyntheticDatabase(dbPath);

    const applyResult = runCli(exactApplyArguments(dbPath));
    assert.equal(applyResult.status, EXIT_SUCCESS);
    const applied = parseClosedOutput(applyResult, { dbPath });
    assert.equal(applied.ok, true);
    assert.equal(applied.mode, "apply");
    assert.equal(applied.schemaState, "ready");
    assert.equal(applied.sourceChanged, true);
    assert.deepEqual(applied.appliedMigrationIds, [MIGRATION_ID]);

    const reapplyResult = runCli(exactApplyArguments(dbPath));
    assert.equal(reapplyResult.status, EXIT_SUCCESS);
    const reapplied = parseClosedOutput(reapplyResult, { dbPath });
    assert.equal(reapplied.ok, true);
    assert.equal(reapplied.mode, "apply");
    assert.equal(reapplied.schemaState, "ready");
    assert.equal(reapplied.sourceChanged, false);
    assert.deepEqual(reapplied.appliedMigrationIds, []);

    const validateResult = runCli(["--mode", "validate", "--db-path", dbPath]);
    assert.equal(validateResult.status, EXIT_SUCCESS);
    const validated = parseClosedOutput(validateResult, { dbPath });
    assert.equal(validated.ok, true);
    assert.equal(validated.mode, "validate");
    assert.equal(validated.schemaState, "ready");
    assert.deepEqual(validated.appliedMigrationIds, []);
  });
});

test("a locked synthetic database is a transient infrastructure failure", () => {
  withTempDirectory("coin-wallet-cli-locked-", (directory) => {
    const dbPath = join(directory, "synthetic.sqlite");
    createSyntheticDatabase(dbPath);
    const database = new Database(dbPath);
    database.exec("begin exclusive");
    try {
      const result = runCli(exactApplyArguments(dbPath));
      assert.equal(result.status, EXIT_INFRASTRUCTURE_FAILURE);
      const output = parseClosedOutput(result, { dbPath });
      assert.equal(output.ok, false);
      assert.equal(output.schemaState, "unavailable");
      assert.deepEqual(output.reasonCodes, ["database_unavailable"]);
    } finally {
      database.exec("rollback");
      database.close();
    }
  });
});

test("invalid database bytes stay closed and redact file, path, and exception text", () => {
  withTempDirectory("coin-wallet-cli-redaction-", (directory) => {
    const dbPath = join(directory, "private-account-row.sqlite");
    writeFileSync(dbPath, "not a sqlite database");
    const result = runCli(["--mode", "validate", "--db-path", dbPath]);
    assert.equal(result.status, EXIT_SCHEMA_REJECTED);
    const output = parseClosedOutput(result, {
      dbPath,
      forbidden: ["private-account-row", "not a sqlite database"]
    });
    assert.equal(output.ok, false);
    assert.deepEqual(output.reasonCodes, ["database_invalid"]);
  });
});

test("migration confirmation identity is imported from the reviewed migration module", () => {
  assert.equal(REQUIRED_COIN_WALLET_MIGRATION_ID, MIGRATION_ID);
  assert.match(DDL_CHECKSUM, /^[a-f0-9]{64}$/);
});
