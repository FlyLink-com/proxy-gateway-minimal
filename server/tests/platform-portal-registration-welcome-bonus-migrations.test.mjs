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
  LEGACY_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID,
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
const MIGRATION_IDS = PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATIONS.map(({ id }) => id);

function fileSha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
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
  `).run(id, `owner_${id}`, APPLIED_AT, APPLIED_AT);
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
      PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATIONS.at(-1).ddlChecksum,
    nowFn: () => new Date(APPLIED_AT)
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
      `).run(legacy.id, legacy.ddlChecksum, APPLIED_AT);
    }).immediate();
  } finally {
    database.close();
  }
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
    assert.deepEqual(inspected.pendingMigrationIds, MIGRATION_IDS);
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
    assert.deepEqual(first.appliedMigrationIds, MIGRATION_IDS);

    const second = applyWelcomeMigration(dbPath);
    assert.equal(second.ok, true);
    assert.equal(second.sourceChanged, false);
    assert.deepEqual(second.appliedMigrationIds, []);

    const database = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      const inspection = inspectPortalRegistrationWelcomeBonusSchema({ database });
      assert.equal(inspection.ok, true);
      const migrations = database.prepare(`
        select migration_id, ddl_checksum, applied_at
          from platform_schema_migrations
         where migration_id in (?, ?)
         order by migration_id asc
      `).all(...MIGRATION_IDS);
      assert.deepEqual(migrations, PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATIONS.map(
        ({ id, ddlChecksum }) => ({
          migration_id: id,
          ddl_checksum: ddlChecksum,
          applied_at: APPLIED_AT
        })
      ));
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

test("welcome-bonus successor upgrades an exact v1 ledger entry without rewriting it", () => withOwnedDatabase(({ dbPath }) => {
  createFoundationDatabase(dbPath);
  applyLegacyWelcomeMigration(dbPath);
  const pending = validatePortalRegistrationWelcomeBonusSchema({ dbPath });
  assert.equal(pending.schemaState, "pending");
  assert.deepEqual(pending.pendingMigrationIds, [
    REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID
  ]);

  const upgraded = applyWelcomeMigration(dbPath);
  assert.deepEqual(upgraded.appliedMigrationIds, [
    REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID
  ]);
  const replay = applyWelcomeMigration(dbPath);
  assert.deepEqual(replay.appliedMigrationIds, []);

  const database = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const legacy = database.prepare(`
      select ddl_checksum from platform_schema_migrations where migration_id = ?
    `).get(LEGACY_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID);
    assert.equal(legacy.ddl_checksum, PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATIONS[0].ddlChecksum);
    assert.equal(validatePortalRegistrationWelcomeBonusSchema({ database }).ok, true);
  } finally {
    database.close();
  }
}));

test("welcome-bonus contract successor fails closed on a legacy grant outside the seven-day contract", () => withOwnedDatabase(({ dbPath }) => {
  createFoundationDatabase(dbPath);
  applyLegacyWelcomeMigration(dbPath);
  const database = new Database(dbPath);
  try {
    database.prepare(`
      insert into platform_accounts (
        id, owner_ref, status, created_at, updated_at, metadata_json
      ) values (?, ?, 'active', ?, ?, '{}')
    `).run(
      "acct_welcome_legacy_incompatible",
      "owner_welcome_legacy_incompatible",
      APPLIED_AT,
      APPLIED_AT
    );
    database.prepare(`
      insert into ${WELCOME_GRANTS_TABLE} (
        grant_ref, account_id, commercial_model, coin_type, amount_units,
        source_type, source_ref, source_digest, actor_scope, idempotency_key,
        expires_at, status, next_attempt_at, attempt_count, lease_generation,
        lease_token, lease_until, last_safe_code, credited_lot_ref,
        created_at, updated_at, credited_at
      ) values (
        ?, ?, 'wallet_first_unique_v1', 'bonus_coins', 10,
        ?, ?, ?, ?, ?,
        ?, 'pending', ?, 0, 0,
        null, null, null, null,
        ?, ?, null
      )
    `).run(
      "welcome_grant_legacy_incompatible",
      "acct_welcome_legacy_incompatible",
      "portal_registration_welcome_bonus",
      "portal_registration_legacy_incompatible",
      "d".repeat(64),
      "portal_registration_welcome_bonus",
      "portal_registration_legacy_incompatible",
      "2026-08-21T00:00:00.000Z",
      APPLIED_AT,
      APPLIED_AT,
      APPLIED_AT
    );
  } finally {
    database.close();
  }

  assert.throws(
    () => applyWelcomeMigration(dbPath),
    (error) => error?.code === "migration_apply_failed"
  );

  const after = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    assert.equal(
      after.prepare(`
        select expires_at from ${WELCOME_GRANTS_TABLE} where grant_ref = ?
      `).pluck().get("welcome_grant_legacy_incompatible"),
      "2026-08-21T00:00:00.000Z"
    );
    assert.equal(
      after.prepare(`
        select count(*) from platform_schema_migrations where migration_id = ?
      `).pluck().get(REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID),
      0
    );
    assert.deepEqual(
      validatePortalRegistrationWelcomeBonusSchema({ database: after }).pendingMigrationIds,
      [REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID]
    );
  } finally {
    after.close();
  }
}));

test("welcome-bonus successor persists an exact seven-day expiry and immutable issuance timestamps", async () => {
  await withOwnedDatabase(async ({ dbPath }) => {
    createFoundationDatabase(dbPath);
    applyWelcomeMigration(dbPath);
    const database = new Database(dbPath);
    try {
      database.prepare(`
        insert into platform_accounts (
          id, owner_ref, status, created_at, updated_at, metadata_json
        ) values (?, ?, ?, ?, ?, ?)
      `).run(
        "acct_welcome_contract",
        "owner_welcome_contract",
        "active",
        APPLIED_AT,
        APPLIED_AT,
        "{}"
      );
      database.prepare(`
        insert into platform_accounts (
          id, owner_ref, status, created_at, updated_at, metadata_json
        ) values (?, ?, ?, ?, ?, ?)
      `).run(
        "acct_welcome_contract_invalid",
        "owner_welcome_contract_invalid",
        "active",
        APPLIED_AT,
        APPLIED_AT,
        "{}"
      );
      const insert = database.prepare(`
        insert into ${WELCOME_GRANTS_TABLE} (
          grant_ref, account_id, commercial_model, coin_type, amount_units,
          source_type, source_ref, source_digest, actor_scope, idempotency_key,
          expires_at, status, next_attempt_at, attempt_count, lease_generation,
          lease_token, lease_until, last_safe_code, credited_lot_ref,
          created_at, updated_at, credited_at
        ) values (
          ?, ?, 'wallet_first_unique_v1', 'bonus_coins', 10,
          ?, ?, ?, ?, ?,
          ?, 'pending', ?, 0, 0,
          null, null, null, null,
          ?, ?, null
        )
      `);
      insert.run(
        "welcome_grant_contract_exact",
        "acct_welcome_contract",
        "portal_registration_welcome_bonus",
        "portal_registration_contract_exact",
        "a".repeat(64),
        "portal_registration_welcome_bonus",
        "portal_registration_contract_exact",
        "2026-08-20T00:00:00.000Z",
        APPLIED_AT,
        APPLIED_AT,
        APPLIED_AT
      );
      assert.throws(
        () => insert.run(
          "welcome_grant_contract_invalid",
          "acct_welcome_contract_invalid",
          "portal_registration_welcome_bonus",
          "portal_registration_contract_invalid",
          "b".repeat(64),
          "portal_registration_welcome_bonus",
          "portal_registration_contract_invalid",
          "2026-08-21T00:00:00.000Z",
          APPLIED_AT,
          APPLIED_AT,
          APPLIED_AT
        ),
        (error) => error?.code === "SQLITE_CONSTRAINT_CHECK"
      );
      assert.throws(
        () => insert.run(
          "welcome_grant_contract_millisecond_invalid",
          "acct_welcome_contract_invalid",
          "portal_registration_welcome_bonus",
          "portal_registration_contract_millisecond_invalid",
          "c".repeat(64),
          "portal_registration_welcome_bonus",
          "portal_registration_contract_millisecond_invalid",
          "2026-08-20T00:00:00.999Z",
          APPLIED_AT,
          APPLIED_AT,
          APPLIED_AT
        ),
        (error) => error?.code === "SQLITE_CONSTRAINT_CHECK"
      );
      database.prepare(`
        update ${WELCOME_GRANTS_TABLE}
        set updated_at = ?
        where grant_ref = ?
      `).run("2026-08-13T00:00:01.000Z", "welcome_grant_contract_exact");
      assert.throws(
        () => database.prepare(`
          update ${WELCOME_GRANTS_TABLE}
          set created_at = ?, expires_at = ?
          where grant_ref = ?
        `).run(
          "2026-08-14T00:00:00.000Z",
          "2026-08-21T00:00:00.000Z",
          "welcome_grant_contract_exact"
        ),
        (error) => error?.code === "SQLITE_CONSTRAINT_TRIGGER"
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
    assert.deepEqual(result.pendingMigrationIds, MIGRATION_IDS);
    assert.deepEqual(result.appliedMigrationIds, MIGRATION_IDS);
    assert.equal(fileSha256(dbPath), before);
    assert.equal(
      validatePortalRegistrationWelcomeBonusSchema({ dbPath }).schemaState,
      "pending"
    );
  });
});

test("welcome-bonus dry-run accepts a preexisting WAL and a checkpoint without a source mutation", async () => {
  await withOwnedDatabase(async ({ directory, dbPath }) => {
    createFoundationDatabase(dbPath);
    const writer = openWalWriter(dbPath);
    try {
      insertWalOnlyAccount(writer, "acct_welcome_preexisting_wal");
      const preexisting = await dryRunPortalRegistrationWelcomeBonusMigrations({
        dbPath,
        tempRoot: directory
      });
      assert.equal(preexisting.ok, true);

      let checkpointRows;
      const checkpoint = await withBackupHook(
        () => {
          checkpointRows = writer.pragma("wal_checkpoint(PASSIVE)");
        },
        () => dryRunPortalRegistrationWelcomeBonusMigrations({
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
  });
});

test("welcome-bonus dry-run rejects concurrent WAL-only source commits", async () => {
  await withOwnedDatabase(async ({ directory, dbPath }) => {
    createFoundationDatabase(dbPath);
    const writer = openWalWriter(dbPath);
    try {
      await assert.rejects(
        () => withBackupHook(
          () => insertWalOnlyAccount(writer, "acct_welcome_postbackup_wal"),
          () => dryRunPortalRegistrationWelcomeBonusMigrations({
            dbPath,
            tempRoot: directory
          })
        ),
        (error) => error?.code === "source_changed_during_dry_run"
      );
      await assert.rejects(
        () => withPreBackupHook(
          () => insertWalOnlyAccount(writer, "acct_welcome_prebackup_wal"),
          () => dryRunPortalRegistrationWelcomeBonusMigrations({
            dbPath,
            tempRoot: directory
          })
        ),
        (error) => error?.code === "source_changed_during_dry_run"
      );
    } finally {
      writer.close();
    }
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
