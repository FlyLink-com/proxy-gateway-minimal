import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
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
  applyCoinCommerceMigrations,
  inspectCoinCommerceSchema
} from "../services/platform/coin-commerce-migrations.mjs";
import {
  ACCOUNT_RESOURCE_AUTHORITY_MIGRATIONS,
  REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID,
  applyAccountResourceAuthorityMigrations,
  inspectAccountResourceAuthoritySchema
} from "../services/platform/account-resource-authority-migrations.mjs";
import {
  ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATIONS,
  REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID,
  applyAccountResourceAuthorityCommerceMigrations,
  validateAccountResourceAuthorityCommerceSchema
} from "../services/platform/account-resource-authority-commerce-migrations.mjs";

const APPLIED_AT = "2026-08-08T00:00:00.000Z";
const TABLE = "platform_commerce_authority_quote_bindings";

function withTempDirectory(action) {
  const directory = mkdtempSync(join(tmpdir(), "authority-commerce-test-"));
  try {
    return action(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}

function createFoundation(dbPath) {
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
  applyAccountResourceAuthorityMigrations({
    dbPath,
    expectedMigrationId: REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID,
    expectedDdlChecksum:
      ACCOUNT_RESOURCE_AUTHORITY_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(APPLIED_AT)
  });
}

function seedAuthority(database, suffix) {
  const snapshot = {
    accountId: `account_${suffix}`,
    authorityRef: `authority_${suffix}`,
    authorityVersion: 1,
    resourceRequestId: `request_${suffix}`,
    entitlementId: `entitlement_${suffix}`,
    issuedLinkId: `link_${suffix}`,
    offerVersionRef: `offerv_${suffix}`
  };
  database.prepare(`
    insert into platform_accounts (
      id, owner_ref, status, created_at, updated_at, metadata_json
    ) values (?, ?, 'active', ?, ?, '{}')
  `).run(
    snapshot.accountId,
    `owner_${suffix}`,
    APPLIED_AT,
    APPLIED_AT
  );
  database.prepare(`
    insert into platform_entitlements (
      id, account_id, plan, status, valid_from, valid_until,
      max_artifacts, max_devices, traffic_limit_bytes, created_at, updated_at
    ) values (?, ?, ?, 'active', ?, '2027-08-08T00:00:00.000Z',
      1, 1, 1, ?, ?)
  `).run(
    snapshot.entitlementId,
    snapshot.accountId,
    snapshot.offerVersionRef,
    APPLIED_AT,
    APPLIED_AT,
    APPLIED_AT
  );
  database.prepare(`
    insert into platform_issuance_requests (
      id, account_id, entitlement_id, approval_ref, status, quantity,
      node_id, purpose, requested_by_ref, created_at, updated_at,
      metadata_json
    ) values (?, ?, ?, ?, 'issued', 1, 'synthetic-node', 'commerce', ?,
      ?, ?, '{}')
  `).run(
    snapshot.resourceRequestId,
    snapshot.accountId,
    snapshot.entitlementId,
    `approval_${suffix}`,
    `requester_${suffix}`,
    APPLIED_AT,
    APPLIED_AT
  );
  database.prepare(`
    insert into platform_issued_subscription_links (
      id, request_id, tenant_ref, artifact_ref, status, created_at, updated_at
    ) values (?, ?, ?, ?, 'active', ?, ?)
  `).run(
    snapshot.issuedLinkId,
    snapshot.resourceRequestId,
    `tenant_${suffix}`,
    `artifact_${suffix}`,
    APPLIED_AT,
    APPLIED_AT
  );
  database.prepare(`
    insert into platform_account_resource_authorities (
      authority_ref, account_id, resource_request_id, entitlement_id,
      issued_link_id, status, version, previous_authority_ref,
      created_at, updated_at, created_by, reason,
      revoked_at, revoked_by, revocation_reason
    ) values (?, ?, ?, ?, ?, 'active', 1, null, ?, ?, 'operator:test',
      'explicit_test_assignment', null, null, null)
  `).run(
    snapshot.authorityRef,
    snapshot.accountId,
    snapshot.resourceRequestId,
    snapshot.entitlementId,
    snapshot.issuedLinkId,
    APPLIED_AT,
    APPLIED_AT
  );
  database.prepare(`
    insert into platform_coin_commerce_offer_versions (
      offer_version_ref, offer_ref, version, status, category,
      title_zh, title_en, summary_zh, summary_en,
      important_notices_zh_json, important_notices_en_json,
      base_coin_units, reference_currency, reference_amount_minor,
      accepted_coin_types_json, delivery_kind, duration_days,
      monthly_traffic_gb, traffic_gb, never_expires,
      discount_basis_points, created_at, published_at, retired_at
    ) values (
      ?, ?, 1, 'published', 'plan',
      '合成方案', 'Synthetic plan', '合成测试', 'Synthetic test',
      '["合成测试"]', '["Synthetic test"]',
      20, 'CNY', 2000, '["paid_coins"]',
      'subscription_plan', 30, 50, null, 0, 0, ?, ?, null
    )
  `).run(
    snapshot.offerVersionRef,
    `offer_${suffix}`,
    APPLIED_AT,
    APPLIED_AT
  );
  return snapshot;
}

function insertQuote(database, snapshot, suffix, status = "active") {
  const quoteRef = `quote_${suffix}`;
  const consumedAt = status === "consumed" ? APPLIED_AT : null;
  database.prepare(`
    insert into platform_coin_commerce_quotes (
      quote_ref, account_id, offer_version_ref, wallet_version,
      amount_units, applied_discount_basis_points,
      purchase_availability, shortfall_units, allocation_json,
      before_balance_json, after_balance_json, status,
      created_at, expires_at, consumed_at
    ) values (
      ?, ?, ?, 0, 20, 0, 'available', 0, '[]',
      '{}', '{}', ?, ?, '2027-08-08T00:00:00.000Z', ?
    )
  `).run(
    quoteRef,
    snapshot.accountId,
    snapshot.offerVersionRef,
    status,
    APPLIED_AT,
    consumedAt
  );
  return quoteRef;
}

function insertBinding(database, quoteRef, snapshot) {
  database.prepare(`
    insert into platform_commerce_authority_quote_bindings (
      quote_ref, authority_ref, account_id, authority_version,
      resource_request_id, entitlement_id, issued_link_id, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    quoteRef,
    snapshot.authorityRef,
    snapshot.accountId,
    snapshot.authorityVersion,
    snapshot.resourceRequestId,
    snapshot.entitlementId,
    snapshot.issuedLinkId,
    APPLIED_AT
  );
}

test("applies an independent empty Authority x Commerce Quote binding schema", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "binding.sqlite");
    createFoundation(dbPath);
    const database = new Database(dbPath);
    try {
      database.pragma("foreign_keys = ON");
      const foundationalSql = {
        authority: database.prepare(`
          select sql from sqlite_master
           where type = 'table'
             and name = 'platform_account_resource_authorities'
        `).pluck().get(),
        quote: database.prepare(`
          select sql from sqlite_master
           where type = 'table'
             and name = 'platform_coin_commerce_quotes'
        `).pluck().get()
      };

      const applied = applyAccountResourceAuthorityCommerceMigrations({
        database,
        expectedMigrationId:
          REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID,
        expectedDdlChecksum:
          ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATIONS[0].ddlChecksum,
        nowFn: () => new Date(APPLIED_AT)
      });

      assert.equal(applied.ok, true);
      assert.equal(applied.schemaState, "ready");
      assert.equal(applied.sourceChanged, true);
      assert.equal(applied.counts.bindingRows, 0);
      assert.equal(applied.checks.zeroBackfill, true);
      assert.deepEqual(database.pragma(`table_info(${TABLE})`).map(
        ({ name }) => name
      ), [
        "quote_ref",
        "authority_ref",
        "account_id",
        "authority_version",
        "resource_request_id",
        "entitlement_id",
        "issued_link_id",
        "created_at"
      ]);
      assert.deepEqual(database.pragma(`foreign_key_list(${TABLE})`).map(
        ({ from, table, to }) => ({ from, table, to })
      ).sort((left, right) => JSON.stringify(left).localeCompare(
        JSON.stringify(right)
      )), [
        {
          from: "account_id",
          table: "platform_account_resource_authorities",
          to: "account_id"
        },
        { from: "account_id", table: "platform_accounts", to: "id" },
        {
          from: "authority_ref",
          table: "platform_account_resource_authorities",
          to: "authority_ref"
        },
        {
          from: "authority_version",
          table: "platform_account_resource_authorities",
          to: "version"
        },
        {
          from: "entitlement_id",
          table: "platform_entitlements",
          to: "id"
        },
        {
          from: "issued_link_id",
          table: "platform_issued_subscription_links",
          to: "id"
        },
        {
          from: "quote_ref",
          table: "platform_coin_commerce_quotes",
          to: "quote_ref"
        },
        {
          from: "resource_request_id",
          table: "platform_issuance_requests",
          to: "id"
        }
      ].sort((left, right) => JSON.stringify(left).localeCompare(
        JSON.stringify(right)
      )));
      assert.deepEqual({
        authority: database.prepare(`
          select sql from sqlite_master
           where type = 'table'
             and name = 'platform_account_resource_authorities'
        `).pluck().get(),
        quote: database.prepare(`
          select sql from sqlite_master
           where type = 'table'
             and name = 'platform_coin_commerce_quotes'
        `).pluck().get()
      }, foundationalSql);
      assert.equal(inspectAccountResourceAuthoritySchema({ database }).ok, true);
      assert.equal(inspectCoinCommerceSchema({ database }).ok, true);
      assert.equal(
        validateAccountResourceAuthorityCommerceSchema({ database }).ok,
        true
      );
    } finally {
      database.close();
    }
  });
});

test("accepts only exact active snapshots and keeps bindings immutable", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "binding-guards.sqlite");
    createFoundation(dbPath);
    const database = new Database(dbPath);
    try {
      database.pragma("foreign_keys = ON");
      applyAccountResourceAuthorityCommerceMigrations({
        database,
        expectedMigrationId:
          REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID,
        expectedDdlChecksum:
          ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATIONS[0].ddlChecksum,
        nowFn: () => new Date(APPLIED_AT)
      });
      const first = seedAuthority(database, "first");
      const second = seedAuthority(database, "second");
      const validQuote = insertQuote(database, first, "valid");
      insertBinding(database, validQuote, first);

      const crossWiredQuote = insertQuote(database, first, "cross_wired");
      assert.throws(() => insertBinding(database, crossWiredQuote, {
        ...second,
        accountId: first.accountId
      }), /commerce_authority_quote_binding_invalid/);

      const inactiveQuote = insertQuote(database, first, "inactive", "expired");
      assert.throws(() => insertBinding(database, inactiveQuote, first),
        /commerce_authority_quote_binding_invalid/);

      database.prepare(`
        update platform_account_resource_authorities
           set status = 'revoked',
               updated_at = ?,
               revoked_at = ?,
               revoked_by = 'operator:test',
               revocation_reason = 'test_revoke'
         where authority_ref = ?
      `).run(APPLIED_AT, APPLIED_AT, first.authorityRef);
      const revokedQuote = insertQuote(database, first, "revoked");
      assert.throws(() => insertBinding(database, revokedQuote, first),
        /commerce_authority_quote_binding_invalid/);

      assert.throws(() => database.prepare(`
        update platform_commerce_authority_quote_bindings
           set created_at = '2026-08-08T00:01:00.000Z'
         where quote_ref = ?
      `).run(validQuote), /commerce_authority_quote_binding_immutable/);
      assert.throws(() => database.prepare(`
        delete from platform_commerce_authority_quote_bindings
         where quote_ref = ?
      `).run(validQuote), /commerce_authority_quote_binding_immutable/);
      assert.deepEqual(database.prepare(`
        select quote_ref, authority_ref, account_id, authority_version,
               resource_request_id, entitlement_id, issued_link_id, created_at
          from platform_commerce_authority_quote_bindings
      `).get(), {
        quote_ref: validQuote,
        authority_ref: first.authorityRef,
        account_id: first.accountId,
        authority_version: 1,
        resource_request_id: first.resourceRequestId,
        entitlement_id: first.entitlementId,
        issued_link_id: first.issuedLinkId,
        created_at: APPLIED_AT
      });
    } finally {
      database.close();
    }
  });
});

test("validator reports a missing dependency without inventing checksum drift", () => {
  const database = new Database(":memory:");
  try {
    assert.deepEqual(validateAccountResourceAuthorityCommerceSchema({
      database
    }), {
      ok: false,
      schemaState: "blocked",
      requiredMigrationId:
        REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID,
      counts: {
        bindingRows: 0,
        ownedObjects: 0,
        migrationRows: 0,
        foreignKeyViolations: 0
      },
      checks: {
        authorityDependency: false,
        commerceDependency: false,
        schemaExact: false,
        zeroBackfill: true,
        quickCheck: true,
        foreignKeys: true
      },
      reasonCodes: ["authority_commerce_migration_dependency_missing"],
      pendingMigrationIds: []
    });
  } finally {
    database.close();
  }
});

test("validator fails closed on a malformed injected migration ledger", () => {
  const database = new Database(":memory:");
  try {
    database.exec(`
      create table platform_schema_migrations (
        migration_id text primary key
      )
    `);

    const validation = validateAccountResourceAuthorityCommerceSchema({
      database
    });

    assert.equal(validation.ok, false);
    assert.equal(validation.schemaState, "blocked");
    assert.deepEqual(validation.reasonCodes, ["database_inspection_failed"]);
    assert.equal(validation.checks.schemaExact, false);
    assert.equal(validation.checks.quickCheck, false);
    assert.equal(validation.counts.bindingRows, null);
    assert.equal(validation.checks.zeroBackfill, false);
    assert.deepEqual(validation.pendingMigrationIds, []);
  } finally {
    database.close();
  }
});

test("apply is idempotent and rejects mismatched identity before database access", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "idempotent.sqlite");
    createFoundation(dbPath);
    const database = new Database(dbPath);
    try {
      const exact = {
        database,
        expectedMigrationId:
          REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID,
        expectedDdlChecksum:
          ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATIONS[0].ddlChecksum,
        nowFn: () => new Date(APPLIED_AT)
      };
      const first = applyAccountResourceAuthorityCommerceMigrations(exact);
      const replay = applyAccountResourceAuthorityCommerceMigrations(exact);
      assert.equal(first.sourceChanged, true);
      assert.deepEqual(first.appliedMigrationIds, [
        REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID
      ]);
      assert.equal(replay.sourceChanged, false);
      assert.deepEqual(replay.appliedMigrationIds, []);
      assert.equal(replay.ok, true);
      assert.equal(database.prepare(`
        select count(*) from platform_schema_migrations
         where migration_id = ?
      `).pluck().get(
        REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID
      ), 1);
    } finally {
      database.close();
    }
  });

  const unopened = new Proxy({}, {
    get() {
      throw new Error("database must not be accessed");
    }
  });
  assert.throws(() => applyAccountResourceAuthorityCommerceMigrations({
    database: unopened,
    expectedMigrationId: "20260808_999_wrong",
    expectedDdlChecksum:
      ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATIONS[0].ddlChecksum
  }), { code: "authority_commerce_migration_id_mismatch" });
  assert.throws(() => applyAccountResourceAuthorityCommerceMigrations({
    database: unopened,
    expectedMigrationId:
      REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: "0".repeat(64)
  }), { code: "authority_commerce_migration_checksum_mismatch" });
});

test("post-apply owned schema drift is rejected without replay mutation", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "post-apply-drift.sqlite");
    createFoundation(dbPath);
    const database = new Database(dbPath);
    try {
      const exact = {
        database,
        expectedMigrationId:
          REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID,
        expectedDdlChecksum:
          ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATIONS[0].ddlChecksum,
        nowFn: () => new Date(APPLIED_AT)
      };
      applyAccountResourceAuthorityCommerceMigrations(exact);
      database.exec(
        "drop trigger commerce_authority_quote_bindings_update_deny"
      );

      const validation = validateAccountResourceAuthorityCommerceSchema({
        database
      });
      assert.equal(validation.ok, false);
      assert.equal(validation.schemaState, "blocked");
      assert.equal(validation.checks.schemaExact, false);
      assert.equal(validation.counts.bindingRows, 0);
      assert.equal(validation.checks.zeroBackfill, true);
      assert.deepEqual(validation.reasonCodes, [
        "owned_object_incompatible",
        "owned_object_missing"
      ]);
      assert.throws(
        () => applyAccountResourceAuthorityCommerceMigrations(exact),
        { code: "authority_commerce_applied_schema_incompatible" }
      );
      assert.equal(database.prepare(`
        select count(*) from platform_schema_migrations
         where migration_id = ? and ddl_checksum = ?
      `).pluck().get(
        REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID,
        ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATIONS[0].ddlChecksum
      ), 1);
      assert.equal(database.prepare(`
        select count(*) from sqlite_master
         where type = 'table' and name = ?
      `).pluck().get(TABLE), 1);
    } finally {
      database.close();
    }
  });
});

test("validator reports populated drift without inventing zero backfill", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "populated-drift.sqlite");
    createFoundation(dbPath);
    const database = new Database(dbPath);
    try {
      database.exec(`
        create table ${TABLE} (marker text not null);
        insert into ${TABLE} (marker) values ('retained');
      `);
      const validation = validateAccountResourceAuthorityCommerceSchema({
        database
      });
      assert.equal(validation.ok, false);
      assert.equal(validation.schemaState, "blocked");
      assert.equal(validation.counts.bindingRows, 1);
      assert.equal(validation.checks.zeroBackfill, false);
      assert.deepEqual(validation.reasonCodes, [
        "owned_object_without_migration"
      ]);
      assert.throws(() => applyAccountResourceAuthorityCommerceMigrations({
        database,
        expectedMigrationId:
          REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID,
        expectedDdlChecksum:
          ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATIONS[0].ddlChecksum,
        nowFn: () => new Date(APPLIED_AT)
      }), { code: "authority_commerce_owned_object_without_migration" });
      assert.equal(database.prepare(`
        select count(*) from ${TABLE}
      `).pluck().get(), 1);
    } finally {
      database.close();
    }
  });
});

test("migration ledger checksum drift is rejected without creating objects", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "ledger-drift.sqlite");
    createFoundation(dbPath);
    const database = new Database(dbPath);
    try {
      database.prepare(`
        insert into platform_schema_migrations (
          migration_id, ddl_checksum, applied_at
        ) values (?, ?, ?)
      `).run(
        REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID,
        "f".repeat(64),
        APPLIED_AT
      );
      const validation = validateAccountResourceAuthorityCommerceSchema({
        database
      });
      assert.equal(validation.ok, false);
      assert.equal(validation.schemaState, "blocked");
      assert.deepEqual(validation.reasonCodes, [
        "migration_checksum_mismatch"
      ]);
      assert.equal(validation.counts.ownedObjects, 0);
      assert.equal(validation.counts.bindingRows, 0);
      assert.equal(validation.checks.zeroBackfill, true);
      assert.throws(() => applyAccountResourceAuthorityCommerceMigrations({
        database,
        expectedMigrationId:
          REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID,
        expectedDdlChecksum:
          ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATIONS[0].ddlChecksum,
        nowFn: () => new Date(APPLIED_AT)
      }), { code: "authority_commerce_migration_checksum_mismatch" });
      assert.equal(database.prepare(`
        select count(*) from sqlite_master
         where name = ? or tbl_name = ?
      `).pluck().get(TABLE, TABLE), 0);
    } finally {
      database.close();
    }
  });
});

test("validator fails closed when a binding row count cannot be proven", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "unknown-row-count.sqlite");
    createFoundation(dbPath);
    const database = new Database(dbPath);
    try {
      applyAccountResourceAuthorityCommerceMigrations({
        database,
        expectedMigrationId:
          REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID,
        expectedDdlChecksum:
          ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATIONS[0].ddlChecksum,
        nowFn: () => new Date(APPLIED_AT)
      });
      const injected = new Proxy(database, {
        get(target, property) {
          if (property === "prepare") {
            return (sql) => {
              if (/select count\(\*\) from main\.platform_commerce_authority_quote_bindings/i.test(
                sql
              )) {
                throw new Error("injected count failure");
              }
              return target.prepare(sql);
            };
          }
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        }
      });
      const validation = validateAccountResourceAuthorityCommerceSchema({
        database: injected
      });
      assert.equal(validation.ok, false);
      assert.equal(validation.schemaState, "blocked");
      assert.equal(validation.counts.bindingRows, null);
      assert.equal(validation.checks.zeroBackfill, false);
      assert.deepEqual(validation.reasonCodes, [
        "binding_row_count_unknown"
      ]);
    } finally {
      database.close();
    }
  });
});

test("migration DDL and ledger roll back together on an injected failure", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "transaction-rollback.sqlite");
    createFoundation(dbPath);
    const database = new Database(dbPath);
    try {
      let execCount = 0;
      const injected = new Proxy(database, {
        get(target, property) {
          if (property === "exec") {
            return (sql) => {
              execCount += 1;
              if (execCount === 2) {
                const error = new Error("injected migration failure");
                error.code = "SQLITE_IOERR";
                throw error;
              }
              return target.exec(sql);
            };
          }
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        }
      });
      assert.throws(() => applyAccountResourceAuthorityCommerceMigrations({
        database: injected,
        expectedMigrationId:
          REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID,
        expectedDdlChecksum:
          ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATIONS[0].ddlChecksum,
        nowFn: () => new Date(APPLIED_AT)
      }), { code: "authority_commerce_migration_apply_failed" });
      assert.equal(database.prepare(`
        select count(*) from sqlite_master
         where name = ? or tbl_name = ?
      `).pluck().get(TABLE, TABLE), 0);
      assert.equal(database.prepare(`
        select count(*) from platform_schema_migrations
         where migration_id = ?
      `).pluck().get(
        REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID
      ), 0);
      const pending = validateAccountResourceAuthorityCommerceSchema({
        database
      });
      assert.equal(pending.schemaState, "pending");
      assert.deepEqual(pending.pendingMigrationIds, [
        REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID
      ]);
    } finally {
      database.close();
    }
  });
});
