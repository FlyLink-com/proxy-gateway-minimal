import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
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
  COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID,
  applyCoinCommerceMigrations
} from "../services/platform/coin-commerce-migrations.mjs";
import * as authorityMigrations from
  "../services/platform/account-resource-authority-migrations.mjs";
import {
  ACCOUNT_RESOURCE_AUTHORITY_MIGRATIONS,
  REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID,
  applyAccountResourceAuthorityMigrations,
  dryRunAccountResourceAuthorityMigrations,
  inspectAccountResourceAuthoritySchema,
  rollbackAccountResourceAuthorityMigration,
  validateAccountResourceAuthoritySchema
} from "../services/platform/account-resource-authority-migrations.mjs";

const APPLIED_AT = "2026-08-07T12:00:00.000Z";
const REVOKED_AT = "2026-08-07T12:05:00.000Z";
const TABLE = "platform_account_resource_authorities";
const INDEXES = Object.freeze([
  "account_resource_authorities_active_account_uidx",
  "account_resource_authorities_active_request_uidx",
  "account_resource_authorities_active_entitlement_uidx",
  "account_resource_authorities_active_link_uidx"
]);
const TRIGGERS = Object.freeze([
  "account_resource_authorities_insert_state_guard",
  "account_resource_authorities_insert_lineage_guard",
  "account_resource_authorities_insert_cas_guard",
  "account_resource_authorities_revoke_only_update",
  "account_resource_authorities_delete_deny"
]);

function withTempDirectory(action) {
  const directory = mkdtempSync(join(tmpdir(), "account-authority-test-"));
  try {
    return action(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}

async function withTempDirectoryAsync(action) {
  const directory = mkdtempSync(join(tmpdir(), "account-authority-test-"));
  try {
    return await action(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}

function createLineageFoundation(dbPath) {
  const database = new Database(dbPath);
  database.exec(`
    create table platform_accounts (
      id text primary key,
      owner_ref text not null,
      status text not null check (
        status in ('active', 'suspended', 'disabled')
      ),
      created_at text not null,
      updated_at text not null,
      metadata_json text not null default '{}'
    );
    create table platform_entitlements (
      id text primary key,
      account_id text not null references platform_accounts(id)
        on delete cascade,
      plan text not null,
      status text not null check (
        status in ('active', 'expired', 'revoked', 'suspended')
      ),
      valid_from text not null,
      valid_until text not null,
      max_artifacts integer not null default 1,
      max_devices integer not null default 1,
      traffic_limit_bytes integer not null default 0,
      created_at text not null,
      updated_at text not null
    );
    create table platform_issuance_requests (
      id text primary key,
      account_id text not null references platform_accounts(id)
        on delete cascade,
      entitlement_id text not null references platform_entitlements(id)
        on delete cascade,
      approval_ref text not null,
      status text not null check (
        status in ('planned', 'issued', 'failed', 'revoked', 'cancelled')
      ),
      quantity integer not null check (quantity > 0),
      node_id text not null,
      purpose text not null,
      requested_by_ref text not null,
      created_at text not null,
      updated_at text not null,
      metadata_json text not null default '{}'
    );
    create table platform_issued_subscription_links (
      id text primary key,
      request_id text not null references platform_issuance_requests(id)
        on delete cascade,
      tenant_ref text not null,
      artifact_ref text not null,
      status text not null check (
        status in ('active', 'revoked', 'rotated', 'disabled')
      ),
      created_at text not null,
      updated_at text not null
    );
    create table platform_portal_access_requests (
      id text primary key,
      portal_user_ref text not null,
      entitlement_ref text,
      status text not null,
      tenant_id text,
      artifact_id text,
      expires_at text,
      valid_until text
    );
    create table synthetic_authority_sentinel (
      sentinel_key text primary key,
      sentinel_value text not null
    );
    insert into synthetic_authority_sentinel
      values ('preserve', 'unchanged');
  `);
  database.close();

  applyCoinWalletMigrations({
    dbPath,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(APPLIED_AT)
  });
  applyCoinCommerceMigrations({
    dbPath,
    expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(APPLIED_AT)
  });
}

function exactApply({ dbPath, database, nowFn } = {}) {
  return applyAccountResourceAuthorityMigrations({
    dbPath,
    database,
    expectedMigrationId: REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID,
    expectedDdlChecksum:
      ACCOUNT_RESOURCE_AUTHORITY_MIGRATIONS[0].ddlChecksum,
    nowFn: nowFn ?? (() => new Date(APPLIED_AT))
  });
}

function exactRollback({ dbPath, database } = {}) {
  return rollbackAccountResourceAuthorityMigration({
    dbPath,
    database,
    expectedMigrationId: REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID,
    expectedDdlChecksum:
      ACCOUNT_RESOURCE_AUTHORITY_MIGRATIONS[0].ddlChecksum
  });
}

function insertLineage(database, suffix, {
  accountId = `account_${suffix}`,
  accountStatus = "active",
  entitlementStatus = "active",
  requestStatus = "issued",
  linkStatus = "active"
} = {}) {
  const entitlementId = `entitlement_${suffix}`;
  const requestId = `request_${suffix}`;
  const linkId = `link_${suffix}`;
  database.prepare(`
    insert or ignore into platform_accounts (
      id, owner_ref, status, created_at, updated_at, metadata_json
    ) values (?, ?, ?, ?, ?, '{}')
  `).run(
    accountId,
    `owner_${suffix}`,
    accountStatus,
    APPLIED_AT,
    APPLIED_AT
  );
  database.prepare(`
    insert into platform_entitlements (
      id, account_id, plan, status, valid_from, valid_until,
      max_artifacts, max_devices, traffic_limit_bytes, created_at, updated_at
    ) values (?, ?, 'synthetic', ?, ?, '2027-08-07T00:00:00.000Z',
      1, 1, 1, ?, ?)
  `).run(
    entitlementId,
    accountId,
    entitlementStatus,
    APPLIED_AT,
    APPLIED_AT,
    APPLIED_AT
  );
  database.prepare(`
    insert into platform_issuance_requests (
      id, account_id, entitlement_id, approval_ref, status, quantity,
      node_id, purpose, requested_by_ref, created_at, updated_at,
      metadata_json
    ) values (?, ?, ?, ?, ?, 1, 'synthetic-node', 'commerce', ?, ?, ?, '{}')
  `).run(
    requestId,
    accountId,
    entitlementId,
    `approval_${suffix}`,
    requestStatus,
    `requester_${suffix}`,
    APPLIED_AT,
    APPLIED_AT
  );
  database.prepare(`
    insert into platform_issued_subscription_links (
      id, request_id, tenant_ref, artifact_ref, status, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?)
  `).run(
    linkId,
    requestId,
    `tenant_${suffix}`,
    `artifact_${suffix}`,
    linkStatus,
    APPLIED_AT,
    APPLIED_AT
  );
  return { accountId, entitlementId, requestId, linkId };
}

function insertAuthority(database, lineage, {
  authorityRef = `authority_${lineage.requestId}`,
  version = 1,
  previousAuthorityRef = null
} = {}) {
  database.prepare(`
    insert into platform_account_resource_authorities (
      authority_ref, account_id, resource_request_id, entitlement_id,
      issued_link_id, status, version, previous_authority_ref,
      created_at, updated_at, created_by, reason,
      revoked_at, revoked_by, revocation_reason
    ) values (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, 'operator:test',
      'explicit_test_assignment', null, null, null)
  `).run(
    authorityRef,
    lineage.accountId,
    lineage.requestId,
    lineage.entitlementId,
    lineage.linkId,
    version,
    previousAuthorityRef,
    APPLIED_AT,
    APPLIED_AT
  );
  return authorityRef;
}

function revokeAuthority(database, authorityRef) {
  database.prepare(`
    update platform_account_resource_authorities
       set status = 'revoked',
           updated_at = ?,
           revoked_at = ?,
           revoked_by = 'operator:test',
           revocation_reason = 'explicit_test_revocation'
     where authority_ref = ?
  `).run(REVOKED_AT, REVOKED_AT, authorityRef);
}

function canonicalState(dbPath) {
  const database = new Database(dbPath, {
    readonly: true,
    fileMustExist: true
  });
  try {
    return {
      schema: database.prepare(`
        select type, name, tbl_name, sql
          from sqlite_master
         where name not like 'sqlite_%'
         order by type, name
      `).all(),
      migrations: database.prepare(`
        select migration_id, ddl_checksum, applied_at
          from platform_schema_migrations
         order by migration_id
      `).all(),
      sentinel: database.prepare(`
        select * from synthetic_authority_sentinel
      `).all()
    };
  } finally {
    database.close();
  }
}

test("exports the frozen authority migration contract", () => {
  assert.deepEqual(Object.keys(authorityMigrations).sort(), [
    "ACCOUNT_RESOURCE_AUTHORITY_MIGRATIONS",
    "REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID",
    "applyAccountResourceAuthorityMigrations",
    "dryRunAccountResourceAuthorityMigrations",
    "inspectAccountResourceAuthoritySchema",
    "rollbackAccountResourceAuthorityMigration",
    "validateAccountResourceAuthoritySchema"
  ]);
  assert.equal(
    REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID,
    "20260807_001_account_resource_authority"
  );
  assert.equal(ACCOUNT_RESOURCE_AUTHORITY_MIGRATIONS.length, 1);
  assert.equal(
    ACCOUNT_RESOURCE_AUTHORITY_MIGRATIONS[0].id,
    REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID
  );
  assert.match(
    ACCOUNT_RESOURCE_AUTHORITY_MIGRATIONS[0].ddlChecksum,
    /^[a-f0-9]{64}$/
  );
  assert.equal(Object.isFrozen(ACCOUNT_RESOURCE_AUTHORITY_MIGRATIONS), true);
  assert.equal(Object.isFrozen(ACCOUNT_RESOURCE_AUTHORITY_MIGRATIONS[0]), true);
});

test("foundation validates pending and apply creates exact empty additive schema", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "foundation.sqlite");
    createLineageFoundation(dbPath);
    const before = canonicalState(dbPath);

    const pending = validateAccountResourceAuthoritySchema({ dbPath });
    assert.equal(pending.ok, false);
    assert.equal(pending.schemaState, "pending");
    assert.deepEqual(pending.pendingMigrationIds, [
      REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID
    ]);

    const applied = exactApply({ dbPath });
    assert.equal(applied.ok, true);
    assert.equal(applied.mode, "apply");
    assert.equal(applied.sourceChanged, true);
    assert.deepEqual(applied.appliedMigrationIds, [
      REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID
    ]);
    assert.equal(applied.counts.authorityRows, 0);
    assert.equal(applied.checks.zeroBackfill, true);

    const database = new Database(dbPath);
    try {
      const objects = database.prepare(`
        select type, name
          from sqlite_master
         where name = ?
            or tbl_name = ?
         order by type, name
      `).all(TABLE, TABLE).filter(({ name }) => !name.startsWith(
        "sqlite_autoindex_"
      ));
      assert.deepEqual(
        objects.filter(({ type }) => type === "table").map(({ name }) => name),
        [TABLE]
      );
      assert.deepEqual(
        objects.filter(({ type }) => type === "index").map(({ name }) => name),
        [...INDEXES].sort()
      );
      assert.deepEqual(
        objects.filter(({ type }) => type === "trigger").map(({ name }) => name),
        [...TRIGGERS].sort()
      );
      assert.equal(database.prepare(`select count(*) from ${TABLE}`).pluck().get(), 0);
      assert.equal(database.prepare(`
        select count(*) from synthetic_authority_sentinel
      `).pluck().get(), 1);
      assert.equal(
        inspectAccountResourceAuthoritySchema({ database }).ok,
        true
      );
    } finally {
      database.close();
    }
    assert.equal(canonicalState(dbPath).sentinel[0].sentinel_value,
      before.sentinel[0].sentinel_value);
  });
});

test("apply replay is a no-op", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "replay.sqlite");
    createLineageFoundation(dbPath);
    exactApply({ dbPath });
    const before = canonicalState(dbPath);
    const replay = exactApply({
      dbPath,
      nowFn() {
        throw new Error("nowFn must not run during replay");
      }
    });
    assert.equal(replay.sourceChanged, false);
    assert.deepEqual(replay.appliedMigrationIds, []);
    assert.deepEqual(canonicalState(dbPath), before);
  });
});

test("lineage and status trigger accept only one valid active authority", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "lineage.sqlite");
    createLineageFoundation(dbPath);
    exactApply({ dbPath });
    const database = new Database(dbPath);
    database.pragma("foreign_keys = ON");
    try {
      const first = insertLineage(database, "first");
      const other = insertLineage(database, "other");

      assert.throws(
        () => insertAuthority(database, {
          ...first,
          entitlementId: other.entitlementId
        }, { authorityRef: "authority_cross_entitlement" }),
        /authority_lineage_invalid/
      );

      assert.throws(
        () => insertAuthority(database, {
          ...first,
          linkId: other.linkId
        }, { authorityRef: "authority_cross_link" }),
        /authority_lineage_invalid/
      );

      insertAuthority(database, first);

      const inactive = insertLineage(database, "inactive", {
        entitlementStatus: "expired"
      });
      assert.throws(
        () => insertAuthority(database, inactive),
        /authority_lineage_invalid/
      );

      assert.throws(() => database.prepare(`
        insert into ${TABLE} (
          authority_ref, account_id, resource_request_id, entitlement_id,
          issued_link_id, status, version, previous_authority_ref,
          created_at, updated_at, created_by, reason,
          revoked_at, revoked_by, revocation_reason
        ) values (
          'authority_pre_revoked', ?, ?, ?, ?, 'revoked', 1, null,
          ?, ?, 'operator:test', 'invalid', ?, 'operator:test', 'invalid'
        )
      `).run(
        other.accountId,
        other.requestId,
        other.entitlementId,
        other.linkId,
        APPLIED_AT,
        APPLIED_AT,
        APPLIED_AT
      ), /authority_insert_state_invalid/);
    } finally {
      database.close();
    }
  });
});

test("CAS version chain requires an explicitly revoked previous authority", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "cas.sqlite");
    createLineageFoundation(dbPath);
    exactApply({ dbPath });
    const database = new Database(dbPath);
    database.pragma("foreign_keys = ON");
    try {
      const first = insertLineage(database, "cas_first");
      const second = insertLineage(database, "cas_second", {
        accountId: first.accountId
      });
      const firstAuthority = insertAuthority(database, first, {
        authorityRef: "authority_cas_v1"
      });
      assert.throws(
        () => insertAuthority(database, second, {
          authorityRef: "authority_cas_active_previous",
          version: 2,
          previousAuthorityRef: firstAuthority
        }),
        /authority_insert_cas_mismatch/
      );
      assert.throws(
        () => insertAuthority(database, second, {
          authorityRef: "authority_cas_gap",
          version: 3,
          previousAuthorityRef: firstAuthority
        }),
        /authority_insert_cas_mismatch/
      );

      revokeAuthority(database, firstAuthority);
      const secondAuthority = insertAuthority(database, second, {
        authorityRef: "authority_cas_v2",
        version: 2,
        previousAuthorityRef: firstAuthority
      });
      assert.equal(database.prepare(`
        select status from ${TABLE} where authority_ref = ?
      `).pluck().get(secondAuthority), "active");
      assert.throws(
        () => insertAuthority(database, second, {
          authorityRef: "authority_cas_duplicate_version",
          version: 2,
          previousAuthorityRef: firstAuthority
        }),
        /authority_insert_cas_mismatch|UNIQUE constraint failed/
      );
    } finally {
      database.close();
    }
  });
});

test("updates are revoke-only and deletes are denied", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "immutability.sqlite");
    createLineageFoundation(dbPath);
    exactApply({ dbPath });
    const database = new Database(dbPath);
    database.pragma("foreign_keys = ON");
    try {
      const lineage = insertLineage(database, "immutable");
      const authorityRef = insertAuthority(database, lineage);
      assert.throws(() => database.prepare(`
        update ${TABLE}
           set reason = 'silently_changed'
         where authority_ref = ?
      `).run(authorityRef), /authority_update_must_revoke/);
      assert.throws(() => database.prepare(`
        update ${TABLE}
           set status = 'revoked', updated_at = ?, revoked_at = ?,
               revoked_by = null, revocation_reason = 'missing actor'
         where authority_ref = ?
      `).run(REVOKED_AT, REVOKED_AT, authorityRef),
      /authority_update_must_revoke|CHECK constraint failed/);

      revokeAuthority(database, authorityRef);
      assert.throws(() => database.prepare(`
        update ${TABLE}
           set updated_at = '2026-08-07T12:10:00.000Z'
         where authority_ref = ?
      `).run(authorityRef), /authority_update_must_revoke/);
      assert.throws(() => database.prepare(`
        delete from ${TABLE} where authority_ref = ?
      `).run(authorityRef), /authority_delete_denied/);
    } finally {
      database.close();
    }
  });
});

test("partial uniqueness covers active account request entitlement and link", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "unique.sqlite");
    createLineageFoundation(dbPath);
    exactApply({ dbPath });
    const database = new Database(dbPath);
    database.pragma("foreign_keys = ON");
    try {
      const first = insertLineage(database, "unique_first");
      const authorityRef = insertAuthority(database, first);
      const second = insertLineage(database, "unique_second", {
        accountId: first.accountId
      });
      assert.throws(
        () => insertAuthority(database, second, {
          authorityRef: "authority_second_while_active",
          version: 2,
          previousAuthorityRef: authorityRef
        }),
        /authority_insert_cas_mismatch|UNIQUE constraint failed/
      );
      const indexes = database.pragma(`index_list(${TABLE})`);
      for (const name of INDEXES) {
        const index = indexes.find((candidate) => candidate.name === name);
        assert.equal(index?.unique, 1);
        assert.equal(index?.partial, 1);
      }
    } finally {
      database.close();
    }
  });
});

test("dry-run applies a disposable snapshot without changing source", async () => {
  await withTempDirectoryAsync(async (directory) => {
    const dbPath = join(directory, "source.sqlite");
    const tempRoot = join(directory, "owned-temp");
    createLineageFoundation(dbPath);
    const bytesBefore = readFileSync(dbPath);
    const stateBefore = canonicalState(dbPath);

    const result = await dryRunAccountResourceAuthorityMigrations({
      dbPath,
      tempRoot
    });
    assert.equal(result.ok, true);
    assert.equal(result.mode, "dry-run");
    assert.equal(result.sourceChanged, false);
    assert.deepEqual(result.appliedMigrationIds, [
      REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID
    ]);
    assert.deepEqual(readFileSync(dbPath), bytesBefore);
    assert.deepEqual(canonicalState(dbPath), stateBefore);
    assert.deepEqual(readdirSync(tempRoot), []);
  });
});

test("rollback is allowed only for an exact empty authority schema", () => {
  withTempDirectory((directory) => {
    const emptyPath = join(directory, "empty.sqlite");
    createLineageFoundation(emptyPath);
    exactApply({ dbPath: emptyPath });
    const rolledBack = exactRollback({ dbPath: emptyPath });
    assert.equal(rolledBack.mode, "rollback");
    assert.equal(rolledBack.sourceChanged, true);
    assert.deepEqual(rolledBack.rolledBackMigrationIds, [
      REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID
    ]);
    const pending = validateAccountResourceAuthoritySchema({
      dbPath: emptyPath
    });
    assert.equal(pending.schemaState, "pending");
    assert.equal(pending.counts.authorityRows, 0);

    const occupiedPath = join(directory, "occupied.sqlite");
    createLineageFoundation(occupiedPath);
    exactApply({ dbPath: occupiedPath });
    const database = new Database(occupiedPath);
    try {
      const lineage = insertLineage(database, "rollback_guard");
      insertAuthority(database, lineage);
    } finally {
      database.close();
    }
    const before = canonicalState(occupiedPath);
    assert.throws(
      () => exactRollback({ dbPath: occupiedPath }),
      (error) => error.code === "authority_rollback_rows_present"
    );
    assert.deepEqual(canonicalState(occupiedPath), before);
  });
});

test("rollback refuses an empty authority table with external schema consumers", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "future-consumer.sqlite");
    createLineageFoundation(dbPath);
    exactApply({ dbPath });
    const database = new Database(dbPath);
    database.pragma("foreign_keys = ON");
    try {
      database.exec(`
        create table future_authority_consumer (
          consumer_ref text primary key,
          authority_ref text not null
            references platform_account_resource_authorities(authority_ref)
              on delete restrict
        );
        create view future_authority_view as
          select authority_ref, account_id
            from platform_account_resource_authorities;
      `);
    } finally {
      database.close();
    }
    const before = canonicalState(dbPath);

    assert.throws(
      () => exactRollback({ dbPath }),
      (error) => error.code === "authority_rollback_dependency_present"
    );
    assert.deepEqual(canonicalState(dbPath), before);

    const readback = new Database(dbPath);
    try {
      assert.equal(readback.prepare(`
        select count(*)
          from sqlite_master
         where type = 'table' and name = ?
      `).pluck().get(TABLE), 1);
      assert.equal(readback.prepare(`
        select count(*)
          from sqlite_master
         where type = 'table' and name = 'future_authority_consumer'
      `).pluck().get(), 1);
      assert.equal(
        readback.pragma("foreign_key_check").length,
        0
      );
      const inspection = inspectAccountResourceAuthoritySchema({
        database: readback
      });
      assert.equal(inspection.ok, true);
      assert.equal(inspection.counts.externalDependencies, 2);
      assert.equal(inspection.checks.rollbackSafe, false);
    } finally {
      readback.close();
    }
  });
});

test("DDL contract and postcondition faults roll back the whole migration", () => {
  withTempDirectory((directory) => {
    const invalidNowPath = join(directory, "invalid-now.sqlite");
    createLineageFoundation(invalidNowPath);
    const invalidNowBefore = canonicalState(invalidNowPath);
    assert.throws(
      () => exactApply({
        dbPath: invalidNowPath,
        nowFn: () => new Date("invalid")
      }),
      (error) => error.code === "authority_invalid_migration_contract"
    );
    assert.deepEqual(canonicalState(invalidNowPath), invalidNowBefore);

    const postconditionPath = join(directory, "postcondition.sqlite");
    createLineageFoundation(postconditionPath);
    const postconditionBefore = canonicalState(postconditionPath);
    const database = new Database(postconditionPath);
    try {
      assert.throws(
        () => exactApply({
          database,
          nowFn() {
            database.exec(`
              create temp trigger synthetic_authority_ledger_delete
              after insert on platform_schema_migrations
              when new.migration_id =
                '20260807_001_account_resource_authority'
              begin
                delete from platform_schema_migrations
                 where migration_id = new.migration_id;
              end
            `);
            return new Date(APPLIED_AT);
          }
        }),
        (error) => error.code === "authority_applied_schema_incompatible"
      );
    } finally {
      database.close();
    }
    assert.deepEqual(canonicalState(postconditionPath), postconditionBefore);
  });
});

test("validator rejects post-apply owned schema drift", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "applied-drift.sqlite");
    createLineageFoundation(dbPath);
    exactApply({ dbPath });
    const database = new Database(dbPath);
    try {
      database.exec(
        "drop trigger account_resource_authorities_insert_lineage_guard"
      );
    } finally {
      database.close();
    }

    const validation = validateAccountResourceAuthoritySchema({ dbPath });
    assert.equal(validation.ok, false);
    assert.equal(validation.schemaState, "blocked");
    assert.ok(validation.reasonCodes.includes("owned_object_missing"));
    assert.throws(
      () => exactApply({ dbPath }),
      (error) => error.code === "authority_applied_schema_incompatible"
    );
  });
});

test("missing dependencies and owned namespace drift fail closed", () => {
  withTempDirectory((directory) => {
    const missingPath = join(directory, "missing.sqlite");
    const database = new Database(missingPath);
    database.exec("create table sentinel (id text primary key)");
    database.close();
    const missing = validateAccountResourceAuthoritySchema({
      dbPath: missingPath
    });
    assert.equal(missing.schemaState, "blocked");
    assert.ok(missing.reasonCodes.includes("migration_dependency_missing"));
    assert.throws(
      () => exactApply({ dbPath: missingPath }),
      (error) => error.code === "authority_migration_dependency_missing"
    );

    const collisionPath = join(directory, "collision.sqlite");
    createLineageFoundation(collisionPath);
    const collision = new Database(collisionPath);
    collision.exec(`create table ${TABLE} (authority_ref text primary key)`);
    collision.close();
    const before = canonicalState(collisionPath);
    assert.throws(
      () => exactApply({ dbPath: collisionPath }),
      (error) => error.code === "authority_owned_object_without_migration"
    );
    assert.deepEqual(canonicalState(collisionPath), before);

    const portalDriftPath = join(directory, "portal-column-drift.sqlite");
    createLineageFoundation(portalDriftPath);
    const portalDrift = new Database(portalDriftPath);
    portalDrift.exec(`
      alter table platform_portal_access_requests drop column artifact_id
    `);
    portalDrift.close();
    const drifted = validateAccountResourceAuthoritySchema({
      dbPath: portalDriftPath
    });
    assert.equal(drifted.schemaState, "blocked");
    assert.equal(drifted.checks.lineageDependency, false);
    assert.ok(drifted.reasonCodes.includes("migration_dependency_missing"));
    assert.throws(
      () => exactApply({ dbPath: portalDriftPath }),
      (error) => error.code === "authority_migration_dependency_missing"
    );

    for (const [name, statement] of [
      [
        "entitlement-valid-from-drift.sqlite",
        "alter table platform_entitlements drop column valid_from"
      ],
      [
        "issued-link-artifact-drift.sqlite",
        "alter table platform_issued_subscription_links drop column artifact_ref"
      ]
    ]) {
      const driftPath = join(directory, name);
      createLineageFoundation(driftPath);
      const drift = new Database(driftPath);
      drift.exec(statement);
      drift.close();
      const inspected = validateAccountResourceAuthoritySchema({
        dbPath: driftPath
      });
      assert.equal(inspected.schemaState, "blocked");
      assert.equal(inspected.checks.lineageDependency, false);
      assert.ok(inspected.reasonCodes.includes("migration_dependency_missing"));
      assert.throws(
        () => exactApply({ dbPath: driftPath }),
        (error) => error.code === "authority_migration_dependency_missing"
      );
    }
  });
});

test("confirmation mismatches reject before database access", () => {
  let accessed = false;
  const database = new Proxy({}, {
    get() {
      accessed = true;
      throw new Error("database access forbidden");
    }
  });
  assert.throws(() => applyAccountResourceAuthorityMigrations({
    database,
    expectedMigrationId: "wrong",
    expectedDdlChecksum:
      ACCOUNT_RESOURCE_AUTHORITY_MIGRATIONS[0].ddlChecksum
  }), (error) => error.code === "authority_migration_id_mismatch");
  assert.equal(accessed, false);
  assert.throws(() => rollbackAccountResourceAuthorityMigration({
    database,
    expectedMigrationId: REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID,
    expectedDdlChecksum: "0".repeat(64)
  }), (error) => error.code === "authority_migration_checksum_mismatch");
  assert.equal(accessed, false);
});
