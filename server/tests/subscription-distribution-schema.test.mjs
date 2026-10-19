import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { applyThirdPartySubscriptionMigrations, inspectThirdPartySubscriptionSchema, REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID, REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM } from "../services/platform/third-party-subscription-migrations.mjs";
import { applySubscriptionDistributionMigrations, validateSubscriptionDistributionSchema, dryRunSubscriptionDistributionMigrations, REQUIRED_SUBSCRIPTION_DISTRIBUTION_MIGRATION_ID as ID, REQUIRED_SUBSCRIPTION_DISTRIBUTION_DDL_CHECKSUM as SHA } from "../services/platform/subscription-distribution-migrations.mjs";
import { runSubscriptionDistributionSchemaCli } from "../../scripts/platform-subscription-distribution-schema.mjs";
function base(database) { applyThirdPartySubscriptionMigrations({ database, expectedMigrationId: REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID, expectedDdlChecksum: REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM }); }
function apply(database, extra = {}) { return applySubscriptionDistributionMigrations({ database, expectedMigrationId: ID, expectedDdlChecksum: SHA, ...extra }); }

test("new migration requires exact old third-party schema and leaves its checksum untouched", () => {
  const db = new Database(":memory:");
  try {
    assert.throws(() => apply(db), error => error.code === "third_party_schema_required");
    base(db);
    const before = db.prepare("select * from platform_schema_migrations").all();
    const pending = validateSubscriptionDistributionSchema({ database: db });
    assert.equal(pending.schemaState, "pending");
    assert.equal(apply(db).sourceChanged, true);
    assert.equal(apply(db).sourceChanged, false);
    assert.equal(validateSubscriptionDistributionSchema({ database: db }).ok, true);
    assert.equal(inspectThirdPartySubscriptionSchema({ database: db }).ok, true);
    assert.deepEqual(db.prepare("select * from platform_schema_migrations where migration_id = ?").all(REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID), before);
    assert.equal(db.prepare("select count(*) as n from platform_subscription_distribution_policy").get().n, 0);
  } finally { db.close(); }
});

test("wrong migration id/checksum and incompatible preexisting tables fail without DDL", () => {
  const db = new Database(":memory:");
  try {
    base(db);
    const count = db.prepare("select count(*) as n from sqlite_master").get().n;
    assert.throws(() => apply(db, { expectedMigrationId: "wrong" }), error => error.code === "migration_id_mismatch");
    assert.throws(() => apply(db, { expectedDdlChecksum: "0".repeat(64) }), error => error.code === "migration_checksum_mismatch");
    assert.equal(db.prepare("select count(*) as n from sqlite_master").get().n, count);
    db.exec("create table platform_subscription_distribution_policy (wrong text)");
    assert.throws(() => apply(db), error => error.code === "owned_object_without_migration");
  } finally { db.close(); }
});

test("read-only validation does not create a DB and additive apply does not create missing base", () => {
  const directory = mkdtempSync(join(tmpdir(), "distribution-schema-"));
  try {
    const path = join(directory, "missing.sqlite");
    assert.equal(validateSubscriptionDistributionSchema({ dbPath: path }).schemaState, "pending");
    assert.equal(existsSync(path), false);
    assert.throws(() => applySubscriptionDistributionMigrations({ dbPath: path, expectedMigrationId: ID, expectedDdlChecksum: SHA }));
    assert.equal(existsSync(path), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("dry-run applies only a snapshot and verifies untouched backup restoration with base data", async () => {
  const directory = mkdtempSync(join(tmpdir(), "distribution-schema-"));
  const path = join(directory, "source.sqlite");
  const db = new Database(path);
  try {
    base(db);
    db.prepare("insert into platform_third_party_sources(id,name,protected_url,created_at,updated_at) values(?,?,?,?,?)").run("synthetic", "preserved", "synthetic-encrypted-only", "at", "at");
    const before = db.prepare("select * from platform_third_party_sources").all();
    const result = await dryRunSubscriptionDistributionMigrations({ dbPath: path, tempRoot: directory });
    assert.equal(result.ok, true);
    assert.equal(result.restoreVerified, true);
    assert.equal(result.sourceChanged, false);
    assert.equal(validateSubscriptionDistributionSchema({ database: db }).schemaState, "pending");
    assert.deepEqual(db.prepare("select * from platform_third_party_sources").all(), before);
    assert.deepEqual(readdirSync(directory).filter(name => name.startsWith("subscription-distribution-dry-run-")), []);
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("schema tamper after successful apply is detected and never repaired implicitly", () => {
  const db = new Database(":memory:");
  try {
    base(db); apply(db);
    db.exec("alter table platform_subscription_distribution_owned add column unexpected text");
    assert.equal(validateSubscriptionDistributionSchema({ database: db }).ok, false);
    assert.throws(() => apply(db), error => error.code === "owned_object_incompatible");
  } finally { db.close(); }
});

test("CLI validates exact contracts, returns bounded safe output and never prints paths or raw errors", async () => {
  const directory = mkdtempSync(join(tmpdir(), "distribution-cli-"));
  const path = join(directory, "source.sqlite");
  const db = new Database(path);
  try {
    base(db);
    for (const argv of [[], ["--mode", "apply", "--db-path", path], ["--mode", "validate", "--db-path", path, "--bad", "x"], ["--mode", "validate", "--db-path", "relative.sqlite"]]) {
      assert.equal((await runSubscriptionDistributionSchemaCli({ argv })).exitCode, 2);
    }
    const dry = await runSubscriptionDistributionSchemaCli({ argv: ["--mode", "dry-run", "--db-path", path, "--temp-root", directory] });
    assert.equal(dry.exitCode, 0);
    const applied = await runSubscriptionDistributionSchemaCli({ argv: ["--mode", "apply", "--db-path", path, "--confirm-migration-id", ID, "--confirm-ddl-checksum", SHA] });
    assert.equal(applied.exitCode, 0);
    assert.equal(applied.output.ok, true);
    assert.equal(JSON.stringify(applied).includes(path), false);
    const err = await runSubscriptionDistributionSchemaCli({ argv: ["--mode", "validate", "--db-path", path], operations: { validateSubscriptionDistributionSchema() { throw new Error("synthetic-secret-path"); } } });
    assert.equal(JSON.stringify(err).includes("synthetic-secret-path"), false);
    assert.equal(err.output.ok, false);
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});
