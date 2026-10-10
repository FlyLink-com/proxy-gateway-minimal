import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Database from "better-sqlite3";

import {
  REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM,
  REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
  applyThirdPartySubscriptionMigrations,
  validateThirdPartySubscriptionSchema
} from "../services/platform/third-party-subscription-migrations.mjs";
import { createSqliteThirdPartySubscriptionStore } from "../services/platform/third-party-subscription-store.mjs";
import { createPortalTotpSecretProtector } from "../services/platform/portal-totp-verifier.mjs";

const NOW = "2026-10-10T00:00:00.000Z";
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CLI_PATH = join(REPOSITORY_ROOT, "scripts", "platform-third-party-subscription-schema.mjs");
const SECRET_KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

function withDirectory(callback) {
  const directory = mkdtempSync(join(tmpdir(), "tps-schema-test-"));
  try {
    return callback(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function apply(dbPath) {
  return applyThirdPartySubscriptionMigrations({
    dbPath,
    expectedMigrationId: REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
    expectedDdlChecksum: REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM,
    nowFn: () => new Date(NOW)
  });
}

function runCli(argv) {
  return spawnSync(process.execPath, [CLI_PATH, ...argv], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8"
  });
}

test("missing third-party schema is pending and fail-closed at runtime", () => withDirectory((directory) => {
  const dbPath = join(directory, "missing.sqlite");
  const validated = validateThirdPartySubscriptionSchema({ dbPath });
  assert.equal(validated.ok, false);
  assert.equal(validated.schemaState, "pending");
  assert.deepEqual(validated.reasonCodes, ["required_migration_missing"]);

  const memory = new Database(":memory:");
  try {
    const pending = validateThirdPartySubscriptionSchema({ database: memory });
    assert.equal(pending.ok, false);
    const store = createSqliteThirdPartySubscriptionStore({
      database: memory,
      secretProtector: createPortalTotpSecretProtector({ key: SECRET_KEY })
    });
    assert.equal(store.available, false);
    assert.throws(() => store.createSource({
      name: "x",
      subscriptionUrl: "https://example.invalid/s",
      tiers: ["monthly_basic"]
    }), (error) => error?.code === "third_party_unavailable");
  } finally {
    memory.close();
  }
}));

test("schema apply on a temp database is idempotent and inspects ready", () => withDirectory((directory) => {
  const dbPath = join(directory, "third-party.sqlite");
  const first = apply(dbPath);
  const second = apply(dbPath);
  assert.equal(first.ok, true);
  assert.equal(first.schemaState, "ready");
  assert.deepEqual(first.appliedMigrationIds, [REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID]);
  assert.equal(second.sourceChanged, false);
  const validated = validateThirdPartySubscriptionSchema({ dbPath });
  assert.equal(validated.ok, true);
  const database = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const tables = database.prepare(`
      select name from sqlite_master where type = 'table' order by name
    `).all().map((row) => row.name);
    assert.deepEqual(tables, [
      "platform_schema_migrations",
      "platform_third_party_nodes",
      "platform_third_party_source_tiers",
      "platform_third_party_sources"
    ]);
  } finally {
    database.close();
  }
}));

test("schema CLI validates, dry-runs, and applies with confirmation", () => withDirectory((directory) => {
  const dbPath = join(directory, "cli.sqlite");
  const pending = runCli(["--mode", "validate", "--db-path", dbPath]);
  assert.equal(pending.status, 3);
  const pendingOutput = JSON.parse(pending.stdout);
  assert.equal(pendingOutput.schemaState, "pending");
  assert.equal(pendingOutput.reasonCodes.includes("required_migration_missing"), true);

  const dryRun = runCli(["--mode", "dry-run", "--db-path", dbPath, "--temp-root", directory]);
  assert.equal(dryRun.status, 0, dryRun.stderr);
  const dryOutput = JSON.parse(dryRun.stdout);
  assert.equal(dryOutput.ok, true);
  assert.equal(dryOutput.sourceChanged, false);
  assert.equal(validateThirdPartySubscriptionSchema({ dbPath }).ok, false);

  const applyCli = runCli([
    "--mode", "apply",
    "--db-path", dbPath,
    "--confirm-migration-id", REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
    "--confirm-ddl-checksum", REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM
  ]);
  assert.equal(applyCli.status, 0, applyCli.stderr);
  const applyOutput = JSON.parse(applyCli.stdout);
  assert.equal(applyOutput.ok, true);
  assert.equal(applyOutput.schemaState, "ready");
  assert.equal(validateThirdPartySubscriptionSchema({ dbPath }).ok, true);
  assert.equal(JSON.stringify(applyOutput).includes("example.invalid"), false);
}));

test("package.json exposes the schema CLI script only", () => {
  const packageJson = JSON.parse(readFileSync(join(REPOSITORY_ROOT, "package.json"), "utf8"));
  assert.equal(
    packageJson.scripts["platform:third-party-subscription:schema"],
    "node scripts/platform-third-party-subscription-schema.mjs"
  );
});
