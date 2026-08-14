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
  COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID,
  applyCoinCommerceMigrations
} from "../services/platform/coin-commerce-migrations.mjs";
import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  applyCoinWalletMigrations
} from "../services/platform/coin-wallet-migrations.mjs";
import {
  DEFERRED_RESOURCE_TRANSITION_REBASE_OUTBOX_SCHEMA,
  DEFERRED_RESOURCE_TRANSITION_RESERVATION_SCHEMA,
  LEGACY_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID,
  REQUIRED_DEFERRED_RESOURCE_TRANSITION_DDL_CHECKSUM,
  REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID,
  applyDeferredResourceTransitionMigrations,
  dryRunDeferredResourceTransitionMigrations,
  inspectDeferredResourceTransitionSchema,
  validateDeferredResourceTransitionSchema
} from "../services/platform/deferred-resource-transition-migrations.mjs";

const TRANSITIONS_TABLE = "platform_deferred_resource_transitions";
const RESERVATIONS_TABLE =
  "platform_deferred_resource_transition_reservations";
const RESERVATION_ALLOCATIONS_TABLE =
  "platform_deferred_resource_transition_reservation_allocations";
const OPERATION_RECEIPTS_TABLE =
  "platform_deferred_resource_transition_operation_receipts";
const EVENTS_TABLE = "platform_deferred_resource_transition_events";
const REBASES_TABLE = "platform_deferred_resource_transition_rebases";
const ACTIVE_ACCOUNT_INDEX =
  "platform_deferred_resource_transitions_one_active_account_idx";
const REBASE_PENDING_CLAIM_INDEX =
  "platform_deferred_resource_transition_rebases_pending_claim_idx";
const APPLIED_AT = "2026-08-13T00:00:00.000Z";

function fileSha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

async function withOwnedDatabase(callback) {
  const directory = mkdtempSync(join(tmpdir(), "deferred-resource-transition-"));
  const dbPath = join(directory, "control.sqlite");
  try {
    return await callback({ directory, dbPath });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
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

function createResourceChainParentFoundation(dbPath) {
  const database = new Database(dbPath);
  try {
    database.exec(`
      create table platform_entitlements (
        id text primary key,
        account_id text not null references platform_accounts(id),
        status text not null,
        valid_until text not null
      );
      create table platform_issuance_requests (
        id text primary key,
        account_id text not null references platform_accounts(id),
        entitlement_id text not null references platform_entitlements(id)
      );
      create table platform_issued_subscription_links (
        id text primary key,
        request_id text not null references platform_issuance_requests(id)
      );
    `);
  } finally {
    database.close();
  }
}

function createCommerceFoundation(dbPath, { withResourceChainParents = true } = {}) {
  createWalletFoundation(dbPath);
  applyCoinCommerceMigrations({
    dbPath,
    expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(APPLIED_AT)
  });
  if (withResourceChainParents) createResourceChainParentFoundation(dbPath);
}

function applyDeferredMigration(dbPath) {
  return applyDeferredResourceTransitionMigrations({
    dbPath,
    expectedMigrationId: REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID,
    expectedDdlChecksum: REQUIRED_DEFERRED_RESOURCE_TRANSITION_DDL_CHECKSUM,
    nowFn: () => new Date(APPLIED_AT)
  });
}

function ensureSyntheticWallet(database) {
  database.prepare(`
    insert or ignore into platform_accounts (
      id, owner_ref, status, created_at, updated_at, metadata_json
    ) values ('account_synthetic', 'owner_synthetic', 'active', ?, ?, '{}')
  `).run(APPLIED_AT, APPLIED_AT);
  database.prepare(`
    insert or ignore into platform_coin_wallets (
      wallet_ref, account_id, status, version, created_at, updated_at
    ) values ('wallet_synthetic', 'account_synthetic', 'active', 0, ?, ?)
  `).run(APPLIED_AT, APPLIED_AT);
}

function insertSyntheticReservation(database, {
  reservationRef,
  sourceType = "deferred_resource_transition",
  sourceRef = reservationRef.replace(/^reservation_/, ""),
  activationAt = APPLIED_AT,
  expiresAt = "2026-08-14T00:00:00.000Z",
  rebaseGeneration = 0,
  state = "reserved"
}) {
  ensureSyntheticWallet(database);
  database.prepare(`
    insert into ${RESERVATIONS_TABLE} (
      reservation_ref, account_id, wallet_ref, source_type, source_ref,
      amount_units, activation_at, expires_at, rebase_generation,
      state, lease_generation, lease_token, lease_until, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    reservationRef,
    "account_synthetic",
    "wallet_synthetic",
    sourceType,
    sourceRef,
    10,
    activationAt,
    expiresAt,
    rebaseGeneration,
    "reserved",
    0,
    null,
    null,
    APPLIED_AT,
    APPLIED_AT
  );
}

function insertSyntheticLot(database, {
  lotRef,
  coinType = "bonus_coins",
  expiresAt = "2026-12-31T00:00:00.000Z"
}) {
  database.prepare(`
    insert or ignore into platform_coin_lots (
      lot_ref, wallet_ref, coin_type, credit_origin_ref,
      issued_units, pending_units, available_units, held_units, consumed_units,
      reversed_units, expired_units, source_type, source_ref,
      policy_ref, policy_version, expires_at, created_at, updated_at
    ) values (?, ?, ?, ?, ?, 0, ?, 0, 0, 0, 0, ?, ?, null, null, ?, ?, ?)
  `).run(
    lotRef,
    "wallet_synthetic",
    coinType,
    `credit_origin_${lotRef}`,
    10,
    10,
    "synthetic",
    `source_${lotRef}`,
    expiresAt,
    APPLIED_AT,
    APPLIED_AT
  );
}

function insertSyntheticReservationAllocation(database, {
  reservationRef,
  allocationRef = `allocation_${reservationRef}`,
  lotRef = "lot_synthetic",
  coinTypeSnapshot = "bonus_coins",
  lotExpiresAtSnapshot = "2026-12-31T00:00:00.000Z"
}) {
  insertSyntheticLot(database, {
    lotRef,
    coinType: coinTypeSnapshot,
    expiresAt: lotExpiresAtSnapshot
  });
  database.prepare(`
    insert into ${RESERVATION_ALLOCATIONS_TABLE} (
      allocation_ref, reservation_ref, lot_ref, coin_type_snapshot, allocation_sequence,
      amount_units, lot_expires_at_snapshot, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    allocationRef,
    reservationRef,
    lotRef,
    coinTypeSnapshot,
    1,
    10,
    lotExpiresAtSnapshot,
    APPLIED_AT
  );
}

function insertSyntheticTransition(database, {
  transitionRef,
  orderRef = `deferred_order_${transitionRef}`,
  reservationRef = `reservation_${transitionRef}`,
  state
}) {
  ensureSyntheticWallet(database);
  const insert = database.transaction(() => {
    database.prepare(`
    insert into ${TRANSITIONS_TABLE} (
      transition_ref, account_id, order_ref, reservation_ref, offer_version_ref,
      commercial_model, flow_kind, plan_rank, amount_units,
      offer_snapshot_json, allocation_snapshot_json, reserved_at, scheduled_for,
      expected_entitlement_id, expected_request_id, expected_issued_link_id,
      expected_valid_until, rebase_generation, state, lease_generation,
      lease_token, lease_until, effect_ref, safe_code, settled_at,
      created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, null, null, null,
      ?, ?, ?, ?, ?, null, null, null, ?, ?)
  `).run(
    transitionRef,
    "account_synthetic",
    orderRef,
    reservationRef,
    `offer_${transitionRef}`,
    "wallet_first_unique_v1",
    "initial_activation",
    1,
    10,
    "{}",
    "[]",
    APPLIED_AT,
    APPLIED_AT,
    0,
    "reserved",
    0,
    null,
    null,
    APPLIED_AT,
    APPLIED_AT
  );
    if (state === "processing") {
      database.prepare(`
        update ${TRANSITIONS_TABLE}
           set state = 'processing', lease_generation = 1,
               lease_token = ?, lease_until = ?, updated_at = ?
         where transition_ref = ? and state = 'reserved'
      `).run("a".repeat(64), "2026-08-13T00:01:00.000Z", APPLIED_AT, transitionRef);
      database.prepare(`
        update ${RESERVATIONS_TABLE}
           set state = 'processing', lease_generation = 1,
               lease_token = ?, lease_until = ?, updated_at = ?
         where reservation_ref = ? and state = 'reserved'
      `).run("b".repeat(64), "2026-08-13T00:01:00.000Z", APPLIED_AT, reservationRef);
    }
  });
  insert.immediate();
}

function insertSyntheticRebase(database, {
  transitionRef,
  accountId = "account_synthetic",
  effectRef = "effect_snapshot_applied",
  entitlementId = "entitlement_effect_snapshot",
  requestId = "request_effect_snapshot",
  issuedLinkId = "issued_link_effect_snapshot",
  validUntil = "2027-08-13T00:00:00.000Z"
}) {
  database.prepare(`
    insert into ${REBASES_TABLE} (
      settled_transition_ref, account_id, effect_ref,
      effect_entitlement_id, effect_request_id, effect_issued_link_id,
      effect_valid_until, state, lease_generation, lease_token, lease_until,
      safe_code, created_at, updated_at, completed_at
    ) values (?, ?, ?, ?, ?, ?, ?, 'pending', 0, null, null, null, ?, ?, null)
  `).run(
    transitionRef,
    accountId,
    effectRef,
    entitlementId,
    requestId,
    issuedLinkId,
    validUntil,
    APPLIED_AT,
    APPLIED_AT
  );
}

test("deferred-transition successor requires both wallet and commerce foundations", async () => {
  await withOwnedDatabase(async ({ dbPath }) => {
    createWalletFoundation(dbPath);

    const pending = validateDeferredResourceTransitionSchema({ dbPath });
    assert.equal(pending.ok, false);
    assert.equal(pending.schemaState, "blocked");
    assert.deepEqual(pending.reasonCodes, ["migration_dependency_missing"]);
    assert.throws(
      () => applyDeferredMigration(dbPath),
      (error) => error?.code === "migration_dependency_missing"
    );
  });
});

test("deferred-transition successor reports Commerce foundation state as pending without writing", async () => {
  await withOwnedDatabase(async ({ dbPath }) => {
    createCommerceFoundation(dbPath);
    const before = fileSha256(dbPath);

    const inspected = validateDeferredResourceTransitionSchema({ dbPath });

    assert.equal(inspected.ok, false);
    assert.equal(inspected.schemaState, "pending");
    assert.deepEqual(inspected.reasonCodes, ["required_migration_missing"]);
    assert.deepEqual(inspected.pendingMigrationIds, [
      LEGACY_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID,
      REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID
    ]);
    assert.equal(fileSha256(dbPath), before);
  });
});

test("deferred-transition successor requires resource-chain parent tables before apply", async () => {
  await withOwnedDatabase(async ({ dbPath }) => {
    createCommerceFoundation(dbPath, { withResourceChainParents: false });

    const inspected = validateDeferredResourceTransitionSchema({ dbPath });

    assert.equal(inspected.ok, false);
    assert.equal(inspected.schemaState, "blocked");
    assert.deepEqual(inspected.reasonCodes, ["migration_dependency_missing"]);
    assert.throws(
      () => applyDeferredMigration(dbPath),
      (error) => error?.code === "migration_dependency_missing"
    );
  });
});

test("deferred-transition successor rejects resource parents without resolvable keys and lineage FKs", async () => {
  await withOwnedDatabase(async ({ dbPath }) => {
    createCommerceFoundation(dbPath, { withResourceChainParents: false });
    const database = new Database(dbPath);
    try {
      database.exec(`
        create table platform_entitlements (
          id text not null,
          account_id text not null,
          status text not null,
          valid_until text not null
        );
        create table platform_issuance_requests (
          id text primary key,
          account_id text not null,
          entitlement_id text not null
        );
        create table platform_issued_subscription_links (
          id text primary key,
          request_id text not null
        );
      `);
    } finally {
      database.close();
    }

    const inspected = validateDeferredResourceTransitionSchema({ dbPath });

    assert.equal(inspected.ok, false);
    assert.equal(inspected.schemaState, "blocked");
    assert.equal(inspected.checks.resourceChainParentDependency, false);
    assert.deepEqual(inspected.reasonCodes, ["migration_dependency_missing"]);
    assert.throws(
      () => applyDeferredMigration(dbPath),
      (error) => error?.code === "migration_dependency_missing"
    );
  });
});

test("deferred-transition schema rejects cross-account reservations and initial settled transitions", async () => {
  await withOwnedDatabase(async ({ dbPath }) => {
    createCommerceFoundation(dbPath);
    applyDeferredMigration(dbPath);
    const database = new Database(dbPath);
    try {
      const insertAccount = database.prepare(`
        insert into platform_accounts (
          id, owner_ref, status, created_at, updated_at, metadata_json
        ) values (?, ?, 'active', ?, ?, '{}')
      `);
      const insertWallet = database.prepare(`
        insert into platform_coin_wallets (
          wallet_ref, account_id, status, version, created_at, updated_at
        ) values (?, ?, 'active', 0, ?, ?)
      `);
      insertAccount.run("account_reservation_owner", "owner_reservation_owner", APPLIED_AT, APPLIED_AT);
      insertAccount.run("account_other_wallet", "owner_other_wallet", APPLIED_AT, APPLIED_AT);
      insertWallet.run("wallet_reservation_owner", "account_reservation_owner", APPLIED_AT, APPLIED_AT);
      insertWallet.run("wallet_other_owner", "account_other_wallet", APPLIED_AT, APPLIED_AT);

      assert.throws(
        () => database.prepare(`
          insert into ${RESERVATIONS_TABLE} (
            reservation_ref, account_id, wallet_ref, source_type, source_ref,
            amount_units, activation_at, expires_at, rebase_generation,
            state, lease_generation, lease_token, lease_until, created_at, updated_at
          ) values (?, ?, ?, 'deferred_resource_transition', ?, 10, ?, ?, 0,
            'reserved', 0, null, null, ?, ?)
        `).run(
          "reservation_cross_account_wallet",
          "account_reservation_owner",
          "wallet_other_owner",
          "transition_cross_account_wallet",
          APPLIED_AT,
          "2026-08-14T00:00:00.000Z",
          APPLIED_AT,
          APPLIED_AT
        ),
        /deferred_resource_transition_reservation_wallet_account_binding/u
      );

      database.prepare(`
        insert into ${RESERVATIONS_TABLE} (
          reservation_ref, account_id, wallet_ref, source_type, source_ref,
          amount_units, activation_at, expires_at, rebase_generation,
          state, lease_generation, lease_token, lease_until, created_at, updated_at
        ) values (?, ?, ?, 'deferred_resource_transition', ?, 10, ?, ?, 0,
          'reserved', 0, null, null, ?, ?)
      `).run(
        "reservation_initial_settled",
        "account_reservation_owner",
        "wallet_reservation_owner",
        "transition_initial_settled",
        APPLIED_AT,
        "2026-08-14T00:00:00.000Z",
        APPLIED_AT,
        APPLIED_AT
      );
      database.pragma("foreign_keys = OFF");
      assert.throws(
        () => database.prepare(`
          insert into ${TRANSITIONS_TABLE} (
            transition_ref, account_id, order_ref, reservation_ref, offer_version_ref,
            commercial_model, flow_kind, plan_rank, amount_units,
            offer_snapshot_json, allocation_snapshot_json, reserved_at, scheduled_for,
            expected_entitlement_id, expected_request_id, expected_issued_link_id,
            expected_valid_until, rebase_generation, state, lease_generation,
            lease_token, lease_until, effect_ref, effect_entitlement_id,
            effect_request_id, effect_issued_link_id, effect_valid_until,
            safe_code, settled_at, created_at, updated_at
          ) values (?, ?, ?, ?, ?, 'wallet_first_unique_v1', 'initial_activation', 1, 10,
            '{}', '[]', ?, ?, null, null, null, null, 0, 'settled', 0,
            null, null, ?, ?, ?, ?, ?, null, ?, ?, ?)
        `).run(
          "transition_initial_settled",
          "account_reservation_owner",
          "order_initial_settled",
          "reservation_initial_settled",
          "offer_initial_settled",
          APPLIED_AT,
          APPLIED_AT,
          "effect_initial_settled",
          "entitlement_initial_settled",
          "request_initial_settled",
          "link_initial_settled",
          "2026-09-13T00:00:00.000Z",
          APPLIED_AT,
          APPLIED_AT,
          APPLIED_AT
        ),
        /deferred_resource_transition_initial_state_reserved/u
      );
    } finally {
      database.close();
    }
  });
});

test("deferred-transition successor applies exact schema idempotently", async () => {
  await withOwnedDatabase(async ({ dbPath }) => {
    createCommerceFoundation(dbPath);

    const first = applyDeferredMigration(dbPath);
    assert.equal(first.ok, true);
    assert.equal(first.sourceChanged, true);
    assert.deepEqual(first.appliedMigrationIds, [
      LEGACY_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID,
      REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID
    ]);
    const second = applyDeferredMigration(dbPath);
    assert.equal(second.ok, true);
    assert.equal(second.sourceChanged, false);
    assert.deepEqual(second.appliedMigrationIds, []);

    const database = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      assert.equal(inspectDeferredResourceTransitionSchema({ database }).ok, true);
      assert.deepEqual(
        database.pragma(`index_info(${ACTIVE_ACCOUNT_INDEX})`)
          .map(({ name }) => name),
        ["account_id"]
      );
      assert.equal(
        database.pragma(`foreign_key_list(${TRANSITIONS_TABLE})`)
          .some(({ from, table, to }) => (
            from === "reservation_ref"
            && table === RESERVATIONS_TABLE
            && to === "reservation_ref"
          )),
        true
      );
      const transitionColumns = database.pragma(`table_info(${TRANSITIONS_TABLE})`)
        .map(({ name }) => name);
      assert.equal(transitionColumns.includes("order_ref"), true);
      assert.deepEqual(
        [
          "effect_entitlement_id",
          "effect_request_id",
          "effect_issued_link_id",
          "effect_valid_until"
        ].every((column) => transitionColumns.includes(column)),
        true
      );
      assert.equal(transitionColumns.includes("hold_ref"), false);
      assert.equal(
        database.pragma(`foreign_key_list(${TRANSITIONS_TABLE})`)
          .some(({ from, table, to }) => (
            from === "order_ref"
            && table === "platform_coin_commerce_orders"
            && to === "order_ref"
          )),
        false
      );
      assert.equal(
        database.pragma(`foreign_key_list(${TRANSITIONS_TABLE})`)
          .filter(({ from }) => from.startsWith("effect_"))
          .map(({ from, table, to }) => `${from}->${table}.${to}`)
          .sort()
          .join("|"),
        [
          "effect_entitlement_id->platform_entitlements.id",
          "effect_issued_link_id->platform_issued_subscription_links.id",
          "effect_request_id->platform_issuance_requests.id"
        ].join("|")
      );
      assert.equal(
        database.prepare(`
          select count(*) from sqlite_master
           where type = 'table'
             and name in (?, ?, ?, ?, ?, ?)
        `).pluck().get(
          TRANSITIONS_TABLE,
          RESERVATIONS_TABLE,
          RESERVATION_ALLOCATIONS_TABLE,
          OPERATION_RECEIPTS_TABLE,
          EVENTS_TABLE,
          REBASES_TABLE
        ),
        6
      );
      assert.deepEqual(
        database.pragma(`index_info(${REBASE_PENDING_CLAIM_INDEX})`)
          .map(({ name }) => name),
        ["created_at", "settled_transition_ref"]
      );
    } finally {
      database.close();
    }
  });
});

test("an exact legacy deferred schema upgrades only the Risk A successor and replays safely", async () => {
  await withOwnedDatabase(async ({ dbPath }) => {
    createCommerceFoundation(dbPath);
    applyDeferredMigration(dbPath);
    const database = new Database(dbPath);
    let legacyChecksum;
    try {
      database.exec(`
        drop trigger deferred_resource_transition_reservations_wallet_account_binding_insert;
        drop trigger deferred_resource_transition_reservations_initial_state_reserved;
        drop trigger deferred_resource_transitions_initial_state_reserved;
      `);
      database.prepare(`
        delete from platform_schema_migrations where migration_id = ?
      `).run(REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID);
      legacyChecksum = database.prepare(`
        select ddl_checksum from platform_schema_migrations where migration_id = ?
      `).pluck().get(LEGACY_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID);
    } finally {
      database.close();
    }

    const pending = validateDeferredResourceTransitionSchema({ dbPath });
    assert.equal(pending.ok, false);
    assert.equal(pending.schemaState, "pending");
    assert.deepEqual(pending.pendingMigrationIds, [
      REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID
    ]);

    const upgraded = applyDeferredMigration(dbPath);
    assert.equal(upgraded.ok, true);
    assert.deepEqual(upgraded.appliedMigrationIds, [
      REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID
    ]);
    const replay = applyDeferredMigration(dbPath);
    assert.equal(replay.ok, true);
    assert.equal(replay.sourceChanged, false);
    assert.deepEqual(replay.appliedMigrationIds, []);

    const verified = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      assert.equal(
        verified.prepare(`
          select ddl_checksum from platform_schema_migrations where migration_id = ?
        `).pluck().get(LEGACY_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID),
        legacyChecksum
      );
      assert.equal(
        verified.prepare(`
          select ddl_checksum from platform_schema_migrations where migration_id = ?
        `).pluck().get(REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID),
        REQUIRED_DEFERRED_RESOURCE_TRANSITION_DDL_CHECKSUM
      );
    } finally {
      verified.close();
    }
  });
});

test("a legacy migration checksum mismatch fails closed before the Risk A successor is installed", async () => {
  await withOwnedDatabase(async ({ dbPath }) => {
    createCommerceFoundation(dbPath);
    applyDeferredMigration(dbPath);
    const database = new Database(dbPath);
    try {
      database.exec(`
        drop trigger deferred_resource_transition_reservations_wallet_account_binding_insert;
        drop trigger deferred_resource_transition_reservations_initial_state_reserved;
        drop trigger deferred_resource_transitions_initial_state_reserved;
      `);
      database.prepare(`
        delete from platform_schema_migrations where migration_id = ?
      `).run(REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID);
      database.prepare(`
        update platform_schema_migrations
           set ddl_checksum = 'mismatched_legacy_checksum'
         where migration_id = ?
      `).run(LEGACY_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID);
    } finally {
      database.close();
    }

    const inspected = validateDeferredResourceTransitionSchema({ dbPath });
    assert.equal(inspected.ok, false);
    assert.equal(inspected.schemaState, "blocked");
    assert.deepEqual(inspected.reasonCodes, ["migration_checksum_mismatch"]);
    assert.throws(
      () => applyDeferredMigration(dbPath),
      (error) => error?.code === "migration_checksum_mismatch"
    );

    const verified = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      assert.equal(
        verified.prepare(`
          select count(*) from platform_schema_migrations where migration_id = ?
        `).pluck().get(REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID),
        0
      );
      assert.equal(
        verified.prepare(`
          select count(*) from sqlite_master
           where type = 'trigger' and name = ?
        `).pluck().get("deferred_resource_transitions_initial_state_reserved"),
        0
      );
    } finally {
      verified.close();
    }
  });
});

test("an unsafe legacy initial settlement blocks the Risk A upgrade instead of bypassing capture and outbox", async () => {
  await withOwnedDatabase(async ({ dbPath }) => {
    createCommerceFoundation(dbPath);
    applyDeferredMigration(dbPath);
    const database = new Database(dbPath);
    try {
      database.exec(`
        drop trigger deferred_resource_transition_reservations_wallet_account_binding_insert;
        drop trigger deferred_resource_transition_reservations_initial_state_reserved;
        drop trigger deferred_resource_transitions_initial_state_reserved;
      `);
      database.prepare(`
        delete from platform_schema_migrations where migration_id = ?
      `).run(REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID);
      ensureSyntheticWallet(database);
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
          'offer_legacy_direct_settled', 'offer_legacy_direct_settled', 1, 'published', 'plan',
          '测试', 'Test', '测试', 'Test', '["说明"]', '["Notice"]', 10, 'CNY', 1000,
          '["paid_coins"]', 'subscription_plan', 30, 50, null, 0, 0, ?, ?, null
        )
      `).run(APPLIED_AT, APPLIED_AT);
      database.prepare(`
        insert into platform_entitlements (id, account_id, status, valid_until)
        values ('entitlement_legacy_direct_settled', 'account_synthetic', 'active', ?)
      `).run("2026-09-13T00:00:00.000Z");
      database.prepare(`
        insert into platform_issuance_requests (id, account_id, entitlement_id)
        values ('request_legacy_direct_settled', 'account_synthetic', 'entitlement_legacy_direct_settled')
      `).run();
      database.prepare(`
        insert into platform_issued_subscription_links (id, request_id)
        values ('link_legacy_direct_settled', 'request_legacy_direct_settled')
      `).run();
      insertSyntheticReservation(database, {
        reservationRef: "reservation_legacy_direct_settled",
        sourceRef: "transition_legacy_direct_settled"
      });
      database.prepare(`
        insert into ${TRANSITIONS_TABLE} (
          transition_ref, account_id, order_ref, reservation_ref, offer_version_ref,
          commercial_model, flow_kind, plan_rank, amount_units,
          offer_snapshot_json, allocation_snapshot_json, reserved_at, scheduled_for,
          expected_entitlement_id, expected_request_id, expected_issued_link_id,
          expected_valid_until, rebase_generation, state, lease_generation,
          lease_token, lease_until, effect_ref, effect_entitlement_id,
          effect_request_id, effect_issued_link_id, effect_valid_until,
          safe_code, settled_at, created_at, updated_at
        ) values (?, 'account_synthetic', ?, ?, 'offer_legacy_direct_settled',
          'wallet_first_unique_v1', 'initial_activation', 1, 10,
          '{}', '[]', ?, ?, null, null, null, null, 0, 'settled', 0,
          null, null, ?, ?, ?, ?, ?, null, ?, ?, ?)
      `).run(
        "transition_legacy_direct_settled",
        "order_legacy_direct_settled",
        "reservation_legacy_direct_settled",
        APPLIED_AT,
        APPLIED_AT,
        "effect_legacy_direct_settled",
        "entitlement_legacy_direct_settled",
        "request_legacy_direct_settled",
        "link_legacy_direct_settled",
        "2026-09-13T00:00:00.000Z",
        APPLIED_AT,
        APPLIED_AT,
        APPLIED_AT
      );
    } finally {
      database.close();
    }

    assert.throws(
      () => applyDeferredMigration(dbPath),
      (error) => error?.code === "applied_schema_incompatible"
    );
    const verified = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      assert.equal(
        verified.prepare(`
          select count(*) from platform_schema_migrations where migration_id = ?
        `).pluck().get(REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID),
        0
      );
      assert.equal(
        verified.prepare(`
          select count(*) from sqlite_master
           where type = 'trigger' and name = ?
        `).pluck().get("deferred_resource_transitions_initial_state_reserved"),
        0
      );
    } finally {
      verified.close();
    }
  });
});

test("deferred-transition schema permits multiple reservations but only one active transition per account", async () => {
  await withOwnedDatabase(async ({ dbPath }) => {
    createCommerceFoundation(dbPath);
    applyDeferredMigration(dbPath);
    const database = new Database(dbPath);
    try {
      database.pragma("foreign_keys = OFF");
      insertSyntheticReservation(database, {
        reservationRef: "reservation_transition_reserved_one"
      });
      insertSyntheticTransition(database, {
        transitionRef: "transition_reserved_one",
        reservationRef: "reservation_transition_reserved_one",
        state: "reserved"
      });
      insertSyntheticReservation(database, {
        reservationRef: "reservation_transition_reserved_two"
      });
      insertSyntheticTransition(database, {
        transitionRef: "transition_reserved_two",
        reservationRef: "reservation_transition_reserved_two",
        state: "reserved"
      });
      assert.equal(
        database.prepare(`
          select count(*) from ${TRANSITIONS_TABLE}
           where account_id = ? and state = 'reserved'
        `).pluck().get("account_synthetic"),
        2
      );

      insertSyntheticReservation(database, {
        reservationRef: "reservation_transition_processing_one",
        state: "processing"
      });
      insertSyntheticTransition(database, {
        transitionRef: "transition_processing_one",
        reservationRef: "reservation_transition_processing_one",
        state: "processing"
      });
      insertSyntheticReservation(database, {
        reservationRef: "reservation_transition_processing_two",
        state: "processing"
      });
      assert.throws(
        () => insertSyntheticTransition(database, {
          transitionRef: "transition_processing_two",
          reservationRef: "reservation_transition_processing_two",
          state: "processing"
        }),
        /UNIQUE constraint failed/u
      );
      insertSyntheticReservation(database, {
        reservationRef: "reservation_transition_binding_wrong",
        sourceRef: "unbound_transition_ref"
      });
      assert.throws(
        () => insertSyntheticTransition(database, {
          transitionRef: "transition_binding_wrong",
          reservationRef: "reservation_transition_binding_wrong",
          state: "reserved"
        }),
        /deferred_resource_transition_reservation_binding/u
      );
      insertSyntheticReservation(database, {
        reservationRef: "reservation_transition_deadline_wrong",
        expiresAt: "2026-08-14T00:00:01.000Z"
      });
      assert.throws(
        () => insertSyntheticTransition(database, {
          transitionRef: "transition_deadline_wrong",
          reservationRef: "reservation_transition_deadline_wrong",
          state: "reserved"
        }),
        /deferred_resource_transition_reservation_binding/u
      );

      assert.throws(
        () => database.prepare(`
          update ${TRANSITIONS_TABLE}
             set scheduled_for = ?
           where transition_ref = ?
        `).run("2026-08-14T00:00:00.000Z", "transition_reserved_one"),
        /deferred_resource_transition_rebase_transition/u
      );
      assert.throws(
        () => database.prepare(`
          update ${RESERVATIONS_TABLE}
             set activation_at = ?,
                 expires_at = ?,
                 rebase_generation = 1
           where reservation_ref = ?
        `).run(
          "2026-08-14T00:00:00.000Z",
          "2026-08-15T00:00:00.000Z",
          "reservation_transition_reserved_one"
        ),
        /deferred_resource_transition_reservation_rebase_binding/u
      );
      assert.throws(
        () => database.prepare(`
          update ${TRANSITIONS_TABLE}
             set order_ref = ?
           where transition_ref = ?
        `).run("deferred_order_rewritten", "transition_reserved_one"),
        /deferred_resource_transition_identity_immutable/u
      );

      database.exec("begin immediate");
      try {
        database.prepare(`
          update ${TRANSITIONS_TABLE}
             set scheduled_for = ?,
                 rebase_generation = 1
           where transition_ref = ?
        `).run("2026-08-14T00:00:00.000Z", "transition_reserved_two");
        assert.throws(
          () => database.prepare(`
            update ${RESERVATIONS_TABLE}
               set activation_at = ?,
                   expires_at = ?,
                   rebase_generation = 1
             where reservation_ref = ?
          `).run(
            "2026-08-14T00:00:00.000Z",
            "2026-08-15T00:00:01.000Z",
            "reservation_transition_reserved_two"
          ),
          /deferred_resource_transition_reservation_rebase_binding/u
        );
      } finally {
        database.exec("rollback");
      }

      database.exec("begin immediate");
      try {
        database.prepare(`
          update ${TRANSITIONS_TABLE}
             set scheduled_for = ?,
                 rebase_generation = 1
           where transition_ref = ?
        `).run("2026-08-14T00:00:00.000Z", "transition_reserved_one");
        database.prepare(`
          update ${RESERVATIONS_TABLE}
             set activation_at = ?,
                 expires_at = ?,
                 rebase_generation = 1,
                 updated_at = ?
           where reservation_ref = ?
        `).run(
          "2026-08-14T00:00:00.000Z",
          "2026-08-15T00:00:00.000Z",
          "2026-08-14T00:00:00.000Z",
          "reservation_transition_reserved_one"
        );
        database.exec("commit");
      } catch (error) {
        database.exec("rollback");
        throw error;
      }
      assert.deepEqual(
        database.prepare(`
          select activation_at, expires_at, rebase_generation
            from ${RESERVATIONS_TABLE}
           where reservation_ref = ?
        `).get("reservation_transition_reserved_one"),
        {
          activation_at: "2026-08-14T00:00:00.000Z",
          expires_at: "2026-08-15T00:00:00.000Z",
          rebase_generation: 1
        }
      );
      assert.equal(
        database.prepare(`
          select count(*) from sqlite_master
           where type = 'trigger'
             and name = 'deferred_resource_transitions_rebase_reservation_deadline'
        `).pluck().get(),
        0
      );
    } finally {
      database.close();
    }
  });
});

test("deferred transition atomically snapshots an applied successor and preserves it for recovery", async () => {
  await withOwnedDatabase(async ({ dbPath }) => {
    createCommerceFoundation(dbPath);
    applyDeferredMigration(dbPath);
    const database = new Database(dbPath);
    try {
      database.pragma("foreign_keys = OFF");
      insertSyntheticReservation(database, {
        reservationRef: "reservation_effect_snapshot"
      });
      insertSyntheticTransition(database, {
        transitionRef: "effect_snapshot",
        reservationRef: "reservation_effect_snapshot",
        state: "reserved"
      });

      database.prepare(`
        update ${TRANSITIONS_TABLE}
           set state = ?,
               lease_generation = ?,
               lease_token = ?,
               lease_until = ?,
               updated_at = ?
         where transition_ref = ?
      `).run(
        "processing",
        1,
        "c".repeat(64),
        "2026-08-13T00:01:00.000Z",
        APPLIED_AT,
        "effect_snapshot"
      );

      assert.throws(
        () => database.prepare(`
          update ${TRANSITIONS_TABLE}
             set state = ?,
                 effect_ref = ?,
                 updated_at = ?
           where transition_ref = ?
        `).run(
          "effect_applied",
          "effect_missing_successor_snapshot",
          APPLIED_AT,
          "effect_snapshot"
        ),
        /deferred_resource_transition_effect_successor_snapshot_transition/u
      );

      database.prepare(`
        update ${TRANSITIONS_TABLE}
           set state = ?,
               effect_ref = ?,
               effect_entitlement_id = ?,
               effect_request_id = ?,
               effect_issued_link_id = ?,
               effect_valid_until = ?,
               updated_at = ?
         where transition_ref = ?
      `).run(
        "effect_applied",
        "effect_snapshot_applied",
        "entitlement_effect_snapshot",
        "request_effect_snapshot",
        "issued_link_effect_snapshot",
        "2027-08-13T00:00:00.000Z",
        APPLIED_AT,
        "effect_snapshot"
      );

      assert.deepEqual(
        database.prepare(`
          select effect_ref,
                 effect_entitlement_id,
                 effect_request_id,
                 effect_issued_link_id,
                 effect_valid_until
            from ${TRANSITIONS_TABLE}
           where transition_ref = ?
        `).get("effect_snapshot"),
        {
          effect_ref: "effect_snapshot_applied",
          effect_entitlement_id: "entitlement_effect_snapshot",
          effect_request_id: "request_effect_snapshot",
          effect_issued_link_id: "issued_link_effect_snapshot",
          effect_valid_until: "2027-08-13T00:00:00.000Z"
        }
      );

      insertSyntheticRebase(database, {
        transitionRef: "effect_snapshot"
      });

      assert.throws(
        () => database.prepare(`
          update ${TRANSITIONS_TABLE}
             set effect_valid_until = ?
           where transition_ref = ?
        `).run("2028-08-13T00:00:00.000Z", "effect_snapshot"),
        /deferred_resource_transition_effect_successor_snapshot_transition/u
      );

      database.prepare(`
        update ${TRANSITIONS_TABLE}
           set state = ?,
               lease_token = null,
               lease_until = null,
               settled_at = ?,
               updated_at = ?
         where transition_ref = ?
      `).run("settled", APPLIED_AT, APPLIED_AT, "effect_snapshot");

      assert.throws(
        () => database.prepare(`
          update ${TRANSITIONS_TABLE}
             set effect_request_id = ?
           where transition_ref = ?
        `).run("request_effect_rewritten", "effect_snapshot"),
        /deferred_resource_transition_(effect_successor_snapshot_transition|terminal_immutable)/u
      );
    } finally {
      database.close();
    }
  });
});

test("a settled transition requires a durable rebase outbox with CAS-bound recovery", async () => {
  await withOwnedDatabase(async ({ dbPath }) => {
    createCommerceFoundation(dbPath);
    applyDeferredMigration(dbPath);
    const database = new Database(dbPath);
    try {
      assert.deepEqual(DEFERRED_RESOURCE_TRANSITION_REBASE_OUTBOX_SCHEMA, {
        table: REBASES_TABLE,
        settledTransitionRefColumn: "settled_transition_ref",
        accountIdColumn: "account_id",
        effectRefColumn: "effect_ref",
        effectSuccessorSnapshotColumns: [
          "effect_entitlement_id",
          "effect_request_id",
          "effect_issued_link_id",
          "effect_valid_until"
        ],
        stateColumn: "state",
        states: [
          "pending",
          "processing",
          "completed",
          "reconciliation_required"
        ],
        leaseColumns: ["lease_generation", "lease_token", "lease_until"],
        safeCodeColumn: "safe_code",
        createdAtColumn: "created_at",
        updatedAtColumn: "updated_at",
        completedAtColumn: "completed_at",
        keyedBySettledTransition: true,
        transitionSettleRequiresPendingOutbox: true,
        claimIndex: REBASE_PENDING_CLAIM_INDEX
      });
      database.pragma("foreign_keys = OFF");
      insertSyntheticReservation(database, {
        reservationRef: "reservation_rebase_outbox"
      });
      insertSyntheticTransition(database, {
        transitionRef: "rebase_outbox",
        reservationRef: "reservation_rebase_outbox",
        state: "reserved"
      });
      database.prepare(`
        update ${TRANSITIONS_TABLE}
           set state = 'processing', lease_generation = 1,
               lease_token = ?, lease_until = ?, updated_at = ?
         where transition_ref = ?
      `).run(
        "d".repeat(64),
        "2026-08-13T00:01:00.000Z",
        APPLIED_AT,
        "rebase_outbox"
      );
      database.prepare(`
        update ${TRANSITIONS_TABLE}
           set state = 'effect_applied', effect_ref = ?,
               effect_entitlement_id = ?, effect_request_id = ?,
               effect_issued_link_id = ?, effect_valid_until = ?, updated_at = ?
         where transition_ref = ?
      `).run(
        "effect_rebase_outbox",
        "entitlement_rebase_outbox",
        "request_rebase_outbox",
        "issued_link_rebase_outbox",
        "2027-08-13T00:00:00.000Z",
        APPLIED_AT,
        "rebase_outbox"
      );

      assert.throws(
        () => database.prepare(`
          update ${TRANSITIONS_TABLE}
             set state = 'settled', lease_token = null, lease_until = null,
                 settled_at = ?, updated_at = ?
           where transition_ref = ?
        `).run(APPLIED_AT, APPLIED_AT, "rebase_outbox"),
        /deferred_resource_transition_settled_rebase_outbox_binding/u
      );
      assert.throws(
        () => insertSyntheticRebase(database, {
          transitionRef: "rebase_outbox",
          effectRef: "effect_rebase_outbox_wrong"
        }),
        /deferred_resource_transition_rebase_transition_binding/u
      );

      insertSyntheticRebase(database, {
        transitionRef: "rebase_outbox",
        effectRef: "effect_rebase_outbox",
        entitlementId: "entitlement_rebase_outbox",
        requestId: "request_rebase_outbox",
        issuedLinkId: "issued_link_rebase_outbox"
      });
      database.prepare(`
        update ${TRANSITIONS_TABLE}
           set state = 'settled', lease_token = null, lease_until = null,
               settled_at = ?, updated_at = ?
         where transition_ref = ?
      `).run(APPLIED_AT, APPLIED_AT, "rebase_outbox");

      assert.deepEqual(
        database.prepare(`
          select settled_transition_ref, account_id, effect_ref,
                 effect_entitlement_id, effect_request_id, effect_issued_link_id,
                 effect_valid_until, state, lease_generation, lease_token,
                 lease_until, safe_code, completed_at
            from ${REBASES_TABLE}
           where settled_transition_ref = ?
        `).get("rebase_outbox"),
        {
          settled_transition_ref: "rebase_outbox",
          account_id: "account_synthetic",
          effect_ref: "effect_rebase_outbox",
          effect_entitlement_id: "entitlement_rebase_outbox",
          effect_request_id: "request_rebase_outbox",
          effect_issued_link_id: "issued_link_rebase_outbox",
          effect_valid_until: "2027-08-13T00:00:00.000Z",
          state: "pending",
          lease_generation: 0,
          lease_token: null,
          lease_until: null,
          safe_code: null,
          completed_at: null
        }
      );

      assert.throws(
        () => database.prepare(`
          update ${REBASES_TABLE}
             set lease_generation = 1
           where settled_transition_ref = ?
        `).run("rebase_outbox"),
        /deferred_resource_transition_rebase_lease_cas/u
      );
      database.prepare(`
        update ${REBASES_TABLE}
           set state = 'processing', lease_generation = 1,
               lease_token = ?, lease_until = ?, updated_at = ?
         where settled_transition_ref = ? and state = 'pending'
      `).run(
        "e".repeat(64),
        "2026-08-13T00:02:00.000Z",
        APPLIED_AT,
        "rebase_outbox"
      );
      database.prepare(`
        update ${REBASES_TABLE}
           set state = 'completed', lease_token = null, lease_until = null,
               completed_at = ?, updated_at = ?
         where settled_transition_ref = ? and state = 'processing'
           and lease_generation = 1 and lease_token = ?
      `).run(
        APPLIED_AT,
        APPLIED_AT,
        "rebase_outbox",
        "e".repeat(64)
      );
      assert.throws(
        () => database.prepare(`
          update ${REBASES_TABLE}
             set safe_code = ?
           where settled_transition_ref = ?
        `).run("late_rewrite", "rebase_outbox"),
        /deferred_resource_transition_rebase_terminal_immutable/u
      );
    } finally {
      database.close();
    }
  });
});

test("deferred reservations have an isolated lot-allocation contract", async () => {
  await withOwnedDatabase(async ({ dbPath }) => {
    createCommerceFoundation(dbPath);
    applyDeferredMigration(dbPath);
    const database = new Database(dbPath);
    try {
      assert.deepEqual(DEFERRED_RESOURCE_TRANSITION_RESERVATION_SCHEMA, {
        reservationTable: RESERVATIONS_TABLE,
        reservationRefColumn: "reservation_ref",
        transitionTable: TRANSITIONS_TABLE,
        transitionOrderRefColumn: "order_ref",
        sourceTypeColumn: "source_type",
        sourceRefColumn: "source_ref",
        sourceRefBindsTransitionRef: true,
        activationAtColumn: "activation_at",
        expiresAtColumn: "expires_at",
        reservationRebaseGenerationColumn: "rebase_generation",
        sourceIdentityUnique: true,
        orderRefImmutable: true,
        deadlineRebaseContract: {
          transitionScheduleColumn: "scheduled_for",
          transitionGenerationColumn: "rebase_generation",
          activationMatchesSchedule: true,
          recoveryGraceHours: 24,
          extendsOnly: true,
          atomic: true,
          callerOwnsBeginImmediateTransaction: true,
          transitionUpdatedFirst: true,
          automaticTransitionUpdate: false
        },
        effectSuccessorSnapshotColumns: [
          "effect_entitlement_id",
          "effect_request_id",
          "effect_issued_link_id",
          "effect_valid_until"
        ],
        allocationTable: RESERVATION_ALLOCATIONS_TABLE,
        allocationRefColumn: "allocation_ref",
        lotRefColumn: "lot_ref",
        coinTypeSnapshotColumn: "coin_type_snapshot",
        amountUnitsColumn: "amount_units",
        lotExpiresAtSnapshotColumn: "lot_expires_at_snapshot",
        allocationDeadlineCheck:
          "bonus_lot_expires_at_after_reservation_expires_at",
        stateColumn: "state",
        leaseColumns: ["lease_generation", "lease_token", "lease_until"],
        lotExpiryChecks: {
          reserve: "bonus_lot_expires_at_after_reservation_expires_at",
          claim: "live_lot_binding_matches_snapshot",
          preCapture: "live_lot_binding_matches_snapshot_and_not_expired",
          rebase: "release_or_requote_if_live_lot_expiry_invalid"
        },
        allocationImmutable: true
      });
      database.pragma("foreign_keys = OFF");
      insertSyntheticReservation(database, {
        reservationRef: "reservation_isolated"
      });
      insertSyntheticReservationAllocation(database, {
        reservationRef: "reservation_isolated"
      });

      const tableSql = database.prepare(`
        select sql from sqlite_master
         where type = 'table' and name in (?, ?)
         order by name asc
      `).all(RESERVATION_ALLOCATIONS_TABLE, RESERVATIONS_TABLE)
        .map(({ sql }) => sql.toLowerCase())
        .join("\n");
      assert.equal(tableSql.includes("platform_coin_holds"), false);
      assert.equal(tableSql.includes("platform_coin_commerce_orders"), false);
      assert.equal(tableSql.includes("hold_ref"), false);
      assert.equal(tableSql.includes("order_ref"), false);

      assert.deepEqual(
        database.pragma(`table_info(${RESERVATIONS_TABLE})`)
          .map(({ name }) => name),
        [
          "reservation_ref",
          "account_id",
          "wallet_ref",
          "source_type",
          "source_ref",
          "amount_units",
          "activation_at",
          "expires_at",
          "rebase_generation",
          "state",
          "lease_generation",
          "lease_token",
          "lease_until",
          "created_at",
          "updated_at"
        ]
      );

      assert.deepEqual(
        database.pragma(`foreign_key_list(${RESERVATIONS_TABLE})`)
          .map(({ from, table, to }) => `${from}->${table}.${to}`)
          .sort(),
        [
          "account_id->platform_accounts.id",
          "wallet_ref->platform_coin_wallets.wallet_ref"
        ]
      );
      assert.deepEqual(
        database.pragma(`foreign_key_list(${RESERVATION_ALLOCATIONS_TABLE})`)
          .map(({ from, table, to }) => `${from}->${table}.${to}`)
          .sort(),
        [
          `lot_ref->platform_coin_lots.lot_ref`,
          `reservation_ref->${RESERVATIONS_TABLE}.reservation_ref`
        ].sort()
      );
      assert.deepEqual(
        database.pragma(`table_info(${RESERVATION_ALLOCATIONS_TABLE})`)
          .map(({ name }) => name),
        [
          "allocation_ref",
          "reservation_ref",
          "lot_ref",
          "coin_type_snapshot",
          "allocation_sequence",
          "amount_units",
          "lot_expires_at_snapshot",
          "created_at"
        ]
      );
      assert.throws(
        () => insertSyntheticReservation(database, {
          reservationRef: "reservation_duplicate_source",
          sourceRef: "isolated"
        }),
        /UNIQUE constraint failed/u
      );
      assert.throws(
        () => database.prepare(`
          update ${RESERVATIONS_TABLE}
             set source_ref = ?
           where reservation_ref = ?
        `).run("source_rewritten", "reservation_isolated"),
        /deferred_resource_transition_reservation_identity_immutable/u
      );
      assert.throws(
        () => database.prepare(`
          update ${RESERVATIONS_TABLE}
             set source_type = ?
           where reservation_ref = ?
        `).run("rewritten_source_type", "reservation_isolated"),
        /deferred_resource_transition_reservation_identity_immutable/u
      );
      assert.throws(
        () => database.prepare(`
          update ${RESERVATIONS_TABLE}
             set expires_at = ?
           where reservation_ref = ?
        `).run("2026-08-15T00:00:00.000Z", "reservation_isolated"),
        /deferred_resource_transition_reservation_rebase_binding/u
      );
      assert.throws(
        () => database.prepare(`
          update ${RESERVATIONS_TABLE}
             set state = 'processing',
                 lease_generation = 1,
                 lease_token = ?,
                 lease_until = ?
           where reservation_ref = ?
        `).run(
          "c".repeat(64),
          "2026-08-13T00:01:00.000Z",
          "reservation_isolated"
        ),
        /deferred_resource_transition_reservation_transition_binding/u
      );
      assert.throws(
        () => database.prepare(`
          update ${RESERVATION_ALLOCATIONS_TABLE}
             set amount_units = 9
           where allocation_ref = ?
        `).run("allocation_reservation_isolated"),
        /deferred_resource_transition_reservation_allocation_immutable/u
      );
      assert.throws(
        () => database.prepare(`
          update ${RESERVATION_ALLOCATIONS_TABLE}
             set lot_expires_at_snapshot = ?
           where allocation_ref = ?
        `).run(
          "2027-01-01T00:00:00.000Z",
          "allocation_reservation_isolated"
        ),
        /deferred_resource_transition_reservation_allocation_immutable/u
      );
      assert.throws(
        () => database.prepare(`
          update ${RESERVATION_ALLOCATIONS_TABLE}
             set coin_type_snapshot = 'paid_coins'
           where allocation_ref = ?
        `).run("allocation_reservation_isolated"),
        /deferred_resource_transition_reservation_allocation_immutable/u
      );
      insertSyntheticLot(database, {
        lotRef: "lot_deadline_rejected",
        expiresAt: "2026-08-14T00:00:00.000Z"
      });
      assert.throws(
        () => insertSyntheticReservationAllocation(database, {
          reservationRef: "reservation_isolated",
          allocationRef: "allocation_deadline_rejected",
          lotRef: "lot_deadline_rejected",
          lotExpiresAtSnapshot: "2026-08-14T00:00:00.000Z"
        }),
        /deferred_resource_transition_reservation_allocation_snapshot_binding/u
      );
      insertSyntheticLot(database, {
        lotRef: "lot_snapshot_mismatch",
        expiresAt: "2026-12-31T00:00:00.000Z"
      });
      assert.throws(
        () => insertSyntheticReservationAllocation(database, {
          reservationRef: "reservation_isolated",
          allocationRef: "allocation_snapshot_mismatch",
          lotRef: "lot_snapshot_mismatch",
          lotExpiresAtSnapshot: "2027-01-01T00:00:00.000Z"
        }),
        /deferred_resource_transition_reservation_allocation_snapshot_binding/u
      );
      assert.throws(
        () => database.prepare(`
          delete from ${RESERVATION_ALLOCATIONS_TABLE}
           where allocation_ref = ?
        `).run("allocation_reservation_isolated"),
        /deferred_resource_transition_reservation_allocation_immutable/u
      );
      assert.equal(
        database.pragma("table_info(platform_coin_holds)")
          .some(({ name }) => name === "reservation_ref"),
        false
      );
    } finally {
      database.close();
    }
  });
});

test("deferred-transition successor dry-run applies only a temporary snapshot", async () => {
  await withOwnedDatabase(async ({ directory, dbPath }) => {
    createCommerceFoundation(dbPath);
    const before = fileSha256(dbPath);

    const result = await dryRunDeferredResourceTransitionMigrations({
      dbPath,
      tempRoot: directory
    });

    assert.equal(result.ok, true);
    assert.equal(result.mode, "dry-run");
    assert.equal(result.sourceChanged, false);
    assert.deepEqual(result.pendingMigrationIds, [
      LEGACY_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID,
      REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID
    ]);
    assert.deepEqual(result.appliedMigrationIds, [
      LEGACY_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID,
      REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID
    ]);
    assert.equal(fileSha256(dbPath), before);
    assert.equal(
      validateDeferredResourceTransitionSchema({ dbPath }).schemaState,
      "pending"
    );
  });
});
