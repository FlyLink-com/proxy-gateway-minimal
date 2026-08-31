import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import Database from "better-sqlite3";

import {
  PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATIONS,
  REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID
} from "../services/platform/portal-registration-welcome-bonus-migrations.mjs";
import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  applyCoinWalletMigrations
} from "../services/platform/coin-wallet-migrations.mjs";
import {
  runPortalRegistrationWelcomeBonusSchemaCli
} from "../../scripts/platform-portal-registration-welcome-bonus-schema-lib.mjs";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const IMPLEMENTATION_PATH = join(
  REPOSITORY_ROOT,
  "scripts",
  "platform-portal-registration-welcome-bonus-schema-lib.mjs"
);
const COMPATIBILITY_ENTRY_PATH = join(
  REPOSITORY_ROOT,
  "scripts",
  "platform-portal-registration-welcome-bonus-schema.mjs"
);
const CLI_PATH = join(
  REPOSITORY_ROOT,
  "scripts",
  "platform-portal-registration-welcome-bonus-schema-cli.mjs"
);
const PACKAGE_PATH = join(REPOSITORY_ROOT, "package.json");
const MIGRATION_ID = REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID;
const MIGRATION_IDS = PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATIONS.map(({ id }) => id);
const DDL_CHECKSUM = PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATIONS.at(-1).ddlChecksum;
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
  "foreignKeys",
  "foundationDependency",
  "quickCheck",
  "schemaExact"
]);

function withTempDirectory(action) {
  const directory = mkdtempSync(join(tmpdir(), "welcome-bonus-schema-cli-"));
  try {
    return action(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}

function fileSha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function createWalletFoundation(dbPath) {
  const database = new Database(dbPath);
  try {
    database.exec(`
      create table platform_accounts (
        id text primary key,
        owner_ref text not null,
        status text not null,
        created_at text not null,
        updated_at text not null,
        metadata_json text not null default '{}'
      );
    `);
  } finally {
    database.close();
  }
  applyCoinWalletMigrations({
    dbPath,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum
  });
}

function applyLegacyWelcomeMigration(dbPath) {
  const [legacy] = PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATIONS;
  const database = new Database(dbPath);
  try {
    database.pragma("foreign_keys = ON");
    database.transaction(() => {
      for (const statement of legacy.statements) database.exec(statement);
      database.prepare(`
        insert into platform_schema_migrations (migration_id, ddl_checksum, applied_at)
        values (?, ?, ?)
      `).run(legacy.id, legacy.ddlChecksum, "2026-08-13T00:00:00.000Z");
    }).immediate();
  } finally {
    database.close();
  }
}

function runCli(args) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    env: {},
    timeout: 15_000,
    windowsHide: true
  });
}

function parseOutput(result, forbidden = []) {
  assert.equal(result.error, undefined);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout.endsWith("\n"), true);
  const lines = result.stdout.trimEnd().split(/\r?\n/);
  assert.equal(lines.length, 1);
  const output = JSON.parse(lines[0]);
  assert.deepEqual(Object.keys(output).sort(), OUTPUT_KEYS);
  assert.deepEqual(Object.keys(output.checks).sort(), CHECK_KEYS);
  const serialized = `${result.stdout}${result.stderr}`;
  for (const value of [
    ...forbidden,
    "Error:",
    "SQLITE_",
    "create table",
    "insert into",
    "select "
  ]) {
    assert.equal(serialized.toLowerCase().includes(value.toLowerCase()), false);
  }
  return output;
}

function exactApplyArguments(dbPath) {
  return [
    "--mode", "apply",
    "--db-path", dbPath,
    "--confirm-migration-id", MIGRATION_ID,
    "--confirm-ddl-checksum", DDL_CHECKSUM
  ];
}

function pendingValidation() {
  return {
    ok: false,
    schemaState: "pending",
    requiredMigrationId: MIGRATION_ID,
    checks: {
      foundationDependency: true,
      schemaExact: false,
      quickCheck: true,
      foreignKeys: true
    },
    reasonCodes: ["required_migration_missing"],
    pendingMigrationIds: [MIGRATION_ID]
  };
}

function readyResult(mode, overrides = {}) {
  return {
    ok: true,
    schemaState: "ready",
    requiredMigrationId: MIGRATION_ID,
    checks: {
      foundationDependency: true,
      schemaExact: true,
      quickCheck: true,
      foreignKeys: true
    },
    reasonCodes: [],
    pendingMigrationIds: [],
    appliedMigrationIds: [],
    sourceChanged: false,
    mode,
    ...overrides
  };
}

test("package exposes the future account-wallet schema CLIs", () => {
  const packageJson = JSON.parse(readFileSync(PACKAGE_PATH, "utf8"));
  assert.equal(
    packageJson.scripts["platform:portal-registration-welcome-bonus:schema"],
    "node scripts/platform-portal-registration-welcome-bonus-schema-cli.mjs"
  );
  assert.equal(packageJson.scripts["welcome-coins:schema:custody-apply"], undefined);
  assert.equal(
    packageJson.scripts["platform:deferred-resource-transition:schema"],
    "node scripts/platform-deferred-resource-transition-schema.mjs"
  );
});

test("validate and dry-run stay read-only while standalone apply requires custody", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "foundation.sqlite");
    createWalletFoundation(dbPath);
    const sourceHash = fileSha256(dbPath);

    const pending = runCli(["--mode", "validate", "--db-path", dbPath]);
    assert.equal(pending.status, 3);
    const pendingOutput = parseOutput(pending, [dbPath]);
    assert.equal(pendingOutput.schemaState, "pending");
    assert.equal(pendingOutput.sourceChanged, false);
    assert.deepEqual(pendingOutput.pendingMigrationIds, MIGRATION_IDS);
    assert.equal(fileSha256(dbPath), sourceHash);

    const dryRun = runCli([
      "--mode", "dry-run", "--db-path", dbPath, "--temp-root", directory
    ]);
    assert.equal(dryRun.status, 0);
    const dryRunOutput = parseOutput(dryRun, [dbPath, directory]);
    assert.equal(dryRunOutput.schemaState, "ready");
    assert.equal(dryRunOutput.sourceChanged, false);
    assert.deepEqual(dryRunOutput.appliedMigrationIds, MIGRATION_IDS);
    assert.deepEqual(dryRunOutput.pendingMigrationIds, MIGRATION_IDS);
    assert.equal(fileSha256(dbPath), sourceHash);

    const blockedApply = runCli(exactApplyArguments(dbPath));
    assert.equal(blockedApply.status, 2);
    const blockedOutput = parseOutput(blockedApply, [dbPath]);
    assert.deepEqual(blockedOutput.reasonCodes, ["custody_gate_required"]);
    assert.equal(blockedOutput.sourceChanged, false);
    assert.deepEqual(blockedOutput.appliedMigrationIds, []);
    assert.equal(fileSha256(dbPath), sourceHash);
  });
});

test("v1-only welcome ledger dry-runs successors but standalone apply remains blocked", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "legacy.sqlite");
    createWalletFoundation(dbPath);
    applyLegacyWelcomeMigration(dbPath);
    const sourceHash = fileSha256(dbPath);

    const pending = runCli(["--mode", "validate", "--db-path", dbPath]);
    assert.equal(pending.status, 3);
    assert.deepEqual(
      parseOutput(pending, [dbPath]).pendingMigrationIds,
      MIGRATION_IDS.slice(1)
    );

    const dryRun = runCli([
      "--mode", "dry-run", "--db-path", dbPath, "--temp-root", directory
    ]);
    assert.equal(dryRun.status, 0);
    const dryRunOutput = parseOutput(dryRun, [dbPath, directory]);
    assert.deepEqual(dryRunOutput.appliedMigrationIds, MIGRATION_IDS.slice(1));
    assert.deepEqual(dryRunOutput.pendingMigrationIds, MIGRATION_IDS.slice(1));
    assert.equal(fileSha256(dbPath), sourceHash);

    const blockedApply = runCli(exactApplyArguments(dbPath));
    assert.equal(blockedApply.status, 2);
    assert.deepEqual(
      parseOutput(blockedApply, [dbPath]).reasonCodes,
      ["custody_gate_required"]
    );
    assert.equal(fileSha256(dbPath), sourceHash);

    const legacy = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      const rows = legacy.prepare(`
        select migration_id, ddl_checksum
          from platform_schema_migrations
         where migration_id in (?, ?)
         order by migration_id asc
      `).all(...MIGRATION_IDS.slice(0, 2));
      assert.deepEqual(rows, PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATIONS
        .slice(0, 1)
        .map(({ id, ddlChecksum }) => ({
          migration_id: id,
          ddl_checksum: ddlChecksum
        })));
    } finally {
      legacy.close();
    }
  });
});

test("contract rejects rollback, implicit apply, and non-absolute database paths before execution", () => {
  const cases = [
    [["--mode", "rollback", "--db-path", resolve("ignored.sqlite")], "invalid_mode"],
    [["--mode", "apply", "--db-path", resolve("missing.sqlite")], "apply_confirmation_required"],
    [["--mode", "validate", "--db-path", "relative.sqlite"], "database_path_must_be_absolute"],
    [["--mode", "validate", "--db-path", resolve("ignored.sqlite"), "--temp-root", resolve("tmp")], "argument_not_allowed_for_mode"]
  ];
  for (const [args, reason] of cases) {
    const result = runCli(args);
    assert.equal(result.status, 2);
    const output = parseOutput(result, [resolve("ignored.sqlite"), resolve("missing.sqlite")]);
    assert.deepEqual(output.reasonCodes, [reason]);
    assert.equal(output.sourceChanged, false);
  }
});

test("schema implementation is import-only and its CLI launcher dispatches unconditionally", () => {
  const implementation = readFileSync(IMPLEMENTATION_PATH, "utf8");
  const launcher = readFileSync(CLI_PATH, "utf8");

  assert.doesNotMatch(implementation, /isDirectInvocation|process\.argv\[1\]|process\.exitCode/);
  assert.doesNotMatch(launcher, /isDirectInvocation|process\.argv\[1\]|realpathSync|import\.meta\.main/);
  assert.match(
    launcher,
    /const outcome = await runPortalRegistrationWelcomeBonusSchemaCli\(\{/
  );
  assert.match(launcher, /process\.exitCode = outcome\.exitCode;/);
});

test("the historical schema entry emits a blocked receipt instead of silent success", () => {
  const result = spawnSync(process.execPath, [COMPATIBILITY_ENTRY_PATH], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    env: {},
    timeout: 15_000,
    windowsHide: true
  });

  assert.equal(result.status, 2);
  assert.deepEqual(parseOutput(result).reasonCodes, ["mode_required"]);
});

test("standalone apply is rejected before validation and requires the custody gate", async () => {
  const calls = [];
  const outcome = await runPortalRegistrationWelcomeBonusSchemaCli({
    argv: exactApplyArguments(resolve("custody-required.sqlite")),
    operations: {
      validatePortalRegistrationWelcomeBonusSchema() {
        calls.push("validate");
        return pendingValidation();
      },
      dryRunPortalRegistrationWelcomeBonusMigrations() {
        calls.push("dry-run");
      },
      applyPortalRegistrationWelcomeBonusMigrations() {
        calls.push("apply");
      }
    }
  });

  assert.equal(outcome.exitCode, 2);
  assert.deepEqual(outcome.output.reasonCodes, ["custody_gate_required"]);
  assert.equal(outcome.output.sourceChanged, false);
  assert.deepEqual(calls, []);
});

test("a symlinked direct CLI entry still emits the custody rejection", () => {
  withTempDirectory((directory) => {
    const linkedScripts = join(directory, "scripts-current");
    symlinkSync(
      dirname(CLI_PATH),
      linkedScripts,
      process.platform === "win32" ? "junction" : "dir"
    );
    const linkedCli = join(linkedScripts, basename(CLI_PATH));
    const result = spawnSync(
      process.execPath,
      [linkedCli, ...exactApplyArguments(join(directory, "not-opened.sqlite"))],
      {
        cwd: REPOSITORY_ROOT,
        encoding: "utf8",
        env: {},
        timeout: 15_000,
        windowsHide: true
      }
    );

    assert.equal(result.status, 2);
    assert.deepEqual(
      parseOutput(result, [directory]).reasonCodes,
      ["custody_gate_required"]
    );
  });
});

test("a file-symlinked direct CLI entry still emits the custody rejection", () => {
  withTempDirectory((directory) => {
    const linkedCli = join(directory, basename(CLI_PATH));
    symlinkSync(CLI_PATH, linkedCli, "file");
    const result = spawnSync(
      process.execPath,
      [linkedCli, ...exactApplyArguments(join(directory, "not-opened.sqlite"))],
      {
        cwd: REPOSITORY_ROOT,
        encoding: "utf8",
        env: {},
        timeout: 15_000,
        windowsHide: true
      }
    );

    assert.equal(result.status, 2);
    assert.deepEqual(
      parseOutput(result, [directory]).reasonCodes,
      ["custody_gate_required"]
    );
  });
});

test("a missing importer argv path does not trigger the schema CLI", () => {
  withTempDirectory((directory) => {
    const importerPath = join(directory, "importer.mjs");
    const missingArgvPath = join(directory, "missing-entry.mjs");
    writeFileSync(importerPath, `
process.argv[1] = ${JSON.stringify(missingArgvPath)};
await import(${JSON.stringify(pathToFileURL(IMPLEMENTATION_PATH).href)});
process.stdout.write("imported\\n");
`);
    const result = spawnSync(process.execPath, [importerPath], {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
      env: {},
      timeout: 15_000,
      windowsHide: true
    });

    assert.equal(result.status, 0);
    assert.equal(result.stdout, "imported\n");
  assert.equal(result.stderr, "");
  });
});

test("an argv alias import does not trigger the schema CLI", () => {
  withTempDirectory((directory) => {
    const importerPath = join(directory, "importer.mjs");
    const aliasedArgvPath = join(directory, basename(IMPLEMENTATION_PATH));
    symlinkSync(IMPLEMENTATION_PATH, aliasedArgvPath, "file");
    writeFileSync(importerPath, `
process.argv[1] = ${JSON.stringify(aliasedArgvPath)};
await import(${JSON.stringify(pathToFileURL(IMPLEMENTATION_PATH).href)});
process.stdout.write("imported\\n");
`);
    const result = spawnSync(process.execPath, [importerPath], {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
      env: {},
      timeout: 15_000,
      windowsHide: true
    });

    assert.equal(result.status, 0);
    assert.equal(result.stdout, "imported\n");
    assert.equal(result.stderr, "");
  });
});

test("a blocked validation cannot dispatch a mutation and malformed results fail closed", async () => {
  const calls = [];
  const blocked = await runPortalRegistrationWelcomeBonusSchemaCli({
    argv: ["--mode", "dry-run", "--db-path", resolve("injection.sqlite")],
    operations: {
      validatePortalRegistrationWelcomeBonusSchema() {
        calls.push("validate");
        return {
          ...pendingValidation(),
          schemaState: "blocked",
          checks: {
            foundationDependency: false,
            schemaExact: false,
            quickCheck: false,
            foreignKeys: false
          },
          reasonCodes: ["migration_dependency_missing"],
          pendingMigrationIds: []
        };
      },
      dryRunPortalRegistrationWelcomeBonusMigrations() {
        calls.push("dry-run");
        return readyResult("dry-run");
      },
      applyPortalRegistrationWelcomeBonusMigrations() {
        calls.push("apply");
        return readyResult("apply");
      }
    }
  });
  assert.equal(blocked.exitCode, 3);
  assert.deepEqual(calls, ["validate"]);
  assert.deepEqual(blocked.output.reasonCodes, ["migration_dependency_missing"]);

  const malformed = await runPortalRegistrationWelcomeBonusSchemaCli({
    argv: ["--mode", "validate", "--db-path", resolve("injection.sqlite")],
    operations: {
      validatePortalRegistrationWelcomeBonusSchema: () => ({
        ...pendingValidation(),
        requiredMigrationId: "private_value"
      })
    }
  });
  assert.equal(malformed.exitCode, 4);
  assert.deepEqual(malformed.output.reasonCodes, ["unexpected_execution_failure"]);
  assert.deepEqual(malformed.output.appliedMigrationIds, []);
});
