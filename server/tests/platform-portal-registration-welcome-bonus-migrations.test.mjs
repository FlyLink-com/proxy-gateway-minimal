import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  applyCoinWalletMigrations
} from "../services/platform/coin-wallet-migrations.mjs";
import {
  PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATIONS,
  REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID,
  applyPortalRegistrationWelcomeBonusMigrations,
  dryRunPortalRegistrationWelcomeBonusMigrations,
  inspectPortalRegistrationWelcomeBonusSchema,
  validatePortalRegistrationWelcomeBonusSchema
} from "../services/platform/portal-registration-welcome-bonus-migrations.mjs";

const WELCOME_GRANTS_TABLE = "platform_portal_registration_welcome_coin_grants";
const WELCOME_GRANTS_CLAIM_INDEX =
  "platform_portal_registration_welcome_coin_grants_claim_idx";
const APPLIED_AT = "2026-08-13T00:00:00.000Z";

function fileSha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

async function withOwnedDatabase(callback) {
  const directory = mkdtempSync(join(tmpdir(), "portal-registration-welcome-bonus-"));
  const dbPath = join(directory, "control.sqlite");
  try {
    return await callback({ directory, dbPath });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function createFoundationDatabase(dbPath) {
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
      )
    `);
  } finally {
    database.close();
  }
  applyCoinWalletMigrations({
    dbPath,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(APPLIED_AT)
  });
}

function applyWelcomeMigration(dbPath) {
  return applyPortalRegistrationWelcomeBonusMigrations({
    dbPath,
    expectedMigrationId:
      REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID,
    expectedDdlChecksum:
      PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(APPLIED_AT)
  });
}

test("welcome-bonus successor reports foundation-only state as pending without writing", async () => {
  await withOwnedDatabase(async ({ dbPath }) => {
    createFoundationDatabase(dbPath);
    const before = fileSha256(dbPath);

    const inspected = validatePortalRegistrationWelcomeBonusSchema({ dbPath });

    assert.equal(inspected.ok, false);
    assert.equal(inspected.schemaState, "pending");
    assert.equal(
      inspected.requiredMigrationId,
      REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID
    );
    assert.deepEqual(inspected.reasonCodes, ["required_migration_missing"]);
    assert.deepEqual(inspected.pendingMigrationIds, [
      REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID
    ]);
    assert.equal(fileSha256(dbPath), before);
  });
});

test("welcome-bonus successor applies exact owned table and claim index idempotently", async () => {
  await withOwnedDatabase(async ({ dbPath }) => {
    createFoundationDatabase(dbPath);

    const first = applyWelcomeMigration(dbPath);
    assert.equal(first.ok, true);
    assert.equal(first.mode, "apply");
    assert.equal(first.sourceChanged, true);
    assert.deepEqual(first.appliedMigrationIds, [
      REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID
    ]);

    const second = applyWelcomeMigration(dbPath);
    assert.equal(second.ok, true);
    assert.equal(second.sourceChanged, false);
    assert.deepEqual(second.appliedMigrationIds, []);

    const database = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      const inspection = inspectPortalRegistrationWelcomeBonusSchema({ database });
      assert.equal(inspection.ok, true);
      const migration = database.prepare(`
        select migration_id, ddl_checksum, applied_at
          from platform_schema_migrations
         where migration_id = ?
      `).get(REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID);
      assert.deepEqual(migration, {
        migration_id: REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID,
        ddl_checksum: PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATIONS[0].ddlChecksum,
        applied_at: APPLIED_AT
      });
      assert.deepEqual(
        database.pragma(`table_info(${WELCOME_GRANTS_TABLE})`)
          .map(({ name }) => name),
        [
          "grant_ref",
          "account_id",
          "commercial_model",
          "coin_type",
          "amount_units",
          "source_type",
          "source_ref",
          "source_digest",
          "actor_scope",
          "idempotency_key",
          "expires_at",
          "status",
          "next_attempt_at",
          "attempt_count",
          "lease_generation",
          "lease_token",
          "lease_until",
          "last_safe_code",
          "credited_lot_ref",
          "created_at",
          "updated_at",
          "credited_at"
        ]
      );
      assert.deepEqual(
        database.pragma(`index_info(${WELCOME_GRANTS_CLAIM_INDEX})`)
          .map(({ name }) => name),
        [
          "status",
          "next_attempt_at",
          "lease_until",
          "expires_at",
          "grant_ref"
        ]
      );
    } finally {
      database.close();
    }
  });
});

test("welcome-bonus successor dry-run applies only a temporary snapshot", async () => {
  await withOwnedDatabase(async ({ directory, dbPath }) => {
    createFoundationDatabase(dbPath);
    const before = fileSha256(dbPath);

    const result = await dryRunPortalRegistrationWelcomeBonusMigrations({
      dbPath,
      tempRoot: directory
    });

    assert.equal(result.ok, true);
    assert.equal(result.mode, "dry-run");
    assert.equal(result.sourceChanged, false);
    assert.deepEqual(result.pendingMigrationIds, [
      REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID
    ]);
    assert.deepEqual(result.appliedMigrationIds, [
      REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID
    ]);
    assert.equal(fileSha256(dbPath), before);
    assert.equal(
      validatePortalRegistrationWelcomeBonusSchema({ dbPath }).schemaState,
      "pending"
    );
  });
});

test("welcome-bonus successor rejects an owned object without its migration ledger row", async () => {
  await withOwnedDatabase(async ({ dbPath }) => {
    createFoundationDatabase(dbPath);
    const database = new Database(dbPath);
    try {
      database.exec(`create table ${WELCOME_GRANTS_TABLE} (grant_ref text primary key)`);
    } finally {
      database.close();
    }

    assert.throws(
      () => applyWelcomeMigration(dbPath),
      (error) => error?.code === "owned_object_without_migration"
    );
    const inspection = validatePortalRegistrationWelcomeBonusSchema({ dbPath });
    assert.equal(inspection.schemaState, "blocked");
    assert.deepEqual(inspection.reasonCodes, ["owned_object_without_migration"]);
  });
});
