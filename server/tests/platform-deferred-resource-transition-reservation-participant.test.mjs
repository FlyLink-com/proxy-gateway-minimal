import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";

import {
  COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID,
  applyCoinCommerceMigrations
} from "../services/platform/coin-commerce-migrations.mjs";
import {
  DEFERRED_RESOURCE_TRANSITION_MIGRATIONS,
  REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID,
  applyDeferredResourceTransitionMigrations
} from "../services/platform/deferred-resource-transition-migrations.mjs";
import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  applyCoinWalletMigrations
} from "../services/platform/coin-wallet-migrations.mjs";
import {
  createDeferredResourceTransitionReservationParticipant,
  createSqliteCoinWalletStore
} from "../services/platform/coin-wallet-store.mjs";

const NOW = "2030-01-01T00:00:00.000Z";
const SCHEDULED_FOR = "2030-01-02T00:00:00.000Z";
const REBASED_FOR = "2030-01-03T00:00:00.000Z";
const RESERVATIONS_TABLE = "platform_deferred_resource_transition_reservations";
const ALLOCATIONS_TABLE =
  "platform_deferred_resource_transition_reservation_allocations";
const TRANSITIONS_TABLE = "platform_deferred_resource_transitions";

function makeRefFactory(prefix) {
  const counts = new Map();
  return (kind) => {
    const next = (counts.get(kind) ?? 0) + 1;
    counts.set(kind, next);
    return `${prefix}_${kind}_${next}`;
  };
}

function operation(accountId, idempotencyKey) {
  return {
    actorScope: `account:${accountId}`,
    idempotencyKey,
    actorType: "portal_user",
    actorRef: accountId
  };
}

function createFoundation({ withDeferred = true } = {}) {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  database.exec(`
    create table platform_accounts (
      id text primary key,
      owner_ref text not null,
      status text not null,
      created_at text not null,
      updated_at text not null,
      metadata_json text not null default '{}'
    );
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
  applyCoinWalletMigrations({
    database,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(NOW)
  });
  applyCoinCommerceMigrations({
    database,
    expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(NOW)
  });
  if (withDeferred) {
    applyDeferredResourceTransitionMigrations({
      database,
      expectedMigrationId: REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID,
      expectedDdlChecksum:
        DEFERRED_RESOURCE_TRANSITION_MIGRATIONS[0].ddlChecksum,
      nowFn: () => new Date(NOW)
    });
  }
  return database;
}

function seedAccount(database, accountId) {
  database.prepare(`
    insert into platform_accounts (
      id, owner_ref, status, created_at, updated_at, metadata_json
    ) values (?, ?, 'active', ?, ?, '{}')
  `).run(accountId, `owner_${accountId}`, NOW, NOW);
}

function seedOffer(database) {
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
      'offerv_deferred_test', 'offer_deferred_test', 1, 'published', 'plan',
      '测试', 'Test', '测试', 'Test', '["说明"]', '["Notice"]', 20, 'CNY', 2000,
      '["paid_coins"]', 'subscription_plan', 30, 50, null, 0, 0, ?, ?, null
    )
  `).run(NOW, NOW);
}

function createWalletStore(database) {
  return createSqliteCoinWalletStore({
    database,
    nowFn: () => new Date(NOW),
    refFactory: makeRefFactory("wallet")
  });
}

function credit(database, accountId, {
  coinType = "paid_coins",
  amountUnits = 20,
  expiresAt = null,
  sourceRef = `credit_${coinType}`
} = {}) {
  const store = createWalletStore(database);
  try {
    return store.creditCoins({
      accountId,
      coinType,
      amountUnits,
      availability: "available",
      sourceType: "participant_test_credit",
      sourceRef,
      sourceDigest: `digest_${sourceRef}`,
      policyRef: null,
      policyVersion: null,
      expiresAt,
      operation: operation(accountId, `credit_${sourceRef}`)
    });
  } finally {
    store.close();
  }
}

function createParticipant(database) {
  return createDeferredResourceTransitionReservationParticipant({
    database,
    nowFn: () => new Date(NOW),
    refFactory: makeRefFactory("deferred")
  });
}

function immediate(database, callback) {
  return database.transaction(callback).immediate();
}

function createInput({
  accountId,
  orderRef,
  transitionRef,
  reservationRef,
  amountUnits = 20,
  scheduledFor = SCHEDULED_FOR,
  acceptedCoinTypes = ["paid_coins"],
  operationKey = `reserve_${reservationRef}`
}) {
  return {
    accountId,
    orderRef,
    transitionRef,
    reservationRef,
    amountUnits,
    acceptedCoinTypes,
    scheduledFor,
    operation: operation(accountId, operationKey)
  };
}

function insertTransition(database, {
  accountId,
  orderRef,
  transitionRef,
  reservationRef,
  amountUnits = 20,
  scheduledFor = SCHEDULED_FOR,
  rebaseGeneration = 0
}) {
  database.prepare(`
    insert into ${TRANSITIONS_TABLE} (
      transition_ref, account_id, order_ref, reservation_ref, offer_version_ref,
      commercial_model, flow_kind, plan_rank, amount_units,
      offer_snapshot_json, allocation_snapshot_json, reserved_at, scheduled_for,
      expected_entitlement_id, expected_request_id, expected_issued_link_id,
      expected_valid_until, rebase_generation, state, lease_generation,
      lease_token, lease_until, effect_ref, safe_code, settled_at,
      created_at, updated_at
    ) values (?, ?, ?, ?, 'offerv_deferred_test',
      'wallet_first_unique_v1', 'initial_activation', 1, ?,
      '{}', '[]', ?, ?, null, null, null, null, ?, 'reserved', 0,
      null, null, null, null, null, ?, ?)
  `).run(
    transitionRef,
    accountId,
    orderRef,
    reservationRef,
    amountUnits,
    NOW,
    scheduledFor,
    rebaseGeneration,
    NOW,
    NOW
  );
}

function getLot(database) {
  return database.prepare(`
    select available_units, held_units, consumed_units, expired_units
      from platform_coin_lots
     order by lot_ref
     limit 1
  `).get();
}

test("deferred reservation participant requires exact schema and an outer transaction", () => {
  const missing = createFoundation({ withDeferred: false });
  try {
    assert.throws(
      () => createParticipant(missing),
      (error) => error?.code === "deferred_reservation_schema_not_ready"
    );
  } finally {
    missing.close();
  }

  const database = createFoundation();
  try {
    seedAccount(database, "account_contract");
    credit(database, "account_contract");
    const participant = createParticipant(database);
    assert.throws(
      () => participant.createReservationInTransaction(createInput({
        accountId: "account_contract",
        orderRef: "deferred_order_contract",
        transitionRef: "deferred_transition_contract",
        reservationRef: "deferred_reservation_contract"
      })),
      (error) => error?.code === "wallet_transaction_required"
    );
  } finally {
    database.close();
  }
});

test("deferred reservation moves lots atomically without ordinary holds and replays capture", () => {
  const database = createFoundation();
  try {
    const accountId = "account_capture";
    seedAccount(database, accountId);
    seedOffer(database);
    credit(database, accountId, { amountUnits: 60 });
    const participant = createParticipant(database);
    const input = createInput({
      accountId,
      orderRef: "deferred_order_capture",
      transitionRef: "deferred_transition_capture",
      reservationRef: "deferred_reservation_capture"
    });
    const created = immediate(database, () => participant.createReservationInTransaction(input));
    assert.deepEqual(created, {
      ok: true,
      reservationRef: input.reservationRef,
      state: "reserved",
      activationAt: SCHEDULED_FOR,
      expiresAt: "2030-01-03T00:00:00.000Z",
      allocationSnapshot: [{
        lotRef: "wallet_lot_1",
        allocationSequence: 1,
        coinType: "paid_coins",
        allocatedUnits: 20,
        expiresAt: null
      }]
    });
    assert.deepEqual(getLot(database), {
      available_units: 40,
      held_units: 20,
      consumed_units: 0,
      expired_units: 0
    });
    assert.equal(
      database.prepare("select count(*) from platform_coin_holds").pluck().get(),
      0
    );
    const reservation = database.prepare(`
      select source_type, source_ref, activation_at, expires_at, rebase_generation
        from ${RESERVATIONS_TABLE}
       where reservation_ref = ?
    `).get(input.reservationRef);
    assert.deepEqual(reservation, {
      source_type: "deferred_resource_transition",
      source_ref: input.transitionRef,
      activation_at: SCHEDULED_FOR,
      expires_at: "2030-01-03T00:00:00.000Z",
      rebase_generation: 0
    });
    assert.equal(
      database.prepare(`select count(*) from ${ALLOCATIONS_TABLE}`).pluck().get(),
      1
    );

    immediate(database, () => insertTransition(database, input));
    const verified = immediate(database, () => participant.verifyReservationInTransaction({
      accountId,
      orderRef: input.orderRef,
      reservationRef: input.reservationRef,
      amountUnits: input.amountUnits,
      allocationSnapshot: created.allocationSnapshot
    }));
    assert.deepEqual(verified, created);

    const captureInput = {
      reservationRef: input.reservationRef,
      operation: operation(accountId, "capture_1")
    };
    const captured = immediate(database, () => participant.captureReservationInTransaction(captureInput));
    const replay = immediate(database, () => participant.captureReservationInTransaction(captureInput));
    assert.deepEqual(captured, {
      ok: true,
      reservationRef: input.reservationRef,
      safeResultCode: "captured"
    });
    assert.deepEqual(replay, captured);
    assert.deepEqual(getLot(database), {
      available_units: 40,
      held_units: 0,
      consumed_units: 20,
      expired_units: 0
    });
    assert.equal(
      database.prepare(`
        select state from ${RESERVATIONS_TABLE} where reservation_ref = ?
      `).pluck().get(input.reservationRef),
      "captured"
    );
    assert.equal(
      database.prepare(`
        select count(*)
          from platform_coin_ledger_entries
         where hold_ref is not null or order_ref is not null
      `).pluck().get(),
      0
    );
    assert.equal(
      database.prepare(`
        select count(*)
          from platform_coin_operation_receipts
         where result_ref = ?
      `).pluck().get(input.reservationRef) >= 2,
      true
    );

    const projectionStore = createWalletStore(database);
    try {
      assert.deepEqual(projectionStore.getWalletProjection({ accountId }), {
        exists: true,
        walletRef: "wallet_wallet_1",
        status: "active",
        version: 3,
        totals: { paid_coins: 40, bonus_coins: 0, reward_coins: 0 },
        spendableUnits: 40,
        heldUnits: 0,
        pendingUnits: 0
      });
    } finally {
      projectionStore.close();
    }
  } finally {
    database.close();
  }
});

test("deferred reservation rejects a bonus lot that cannot cover its recovery grace", () => {
  const database = createFoundation();
  try {
    const accountId = "account_bonus";
    seedAccount(database, accountId);
    credit(database, accountId, {
      coinType: "bonus_coins",
      expiresAt: "2030-01-03T00:00:00.000Z",
      sourceRef: "bonus_expiring_at_deadline"
    });
    const participant = createParticipant(database);
    const input = createInput({
      accountId,
      orderRef: "deferred_order_bonus",
      transitionRef: "deferred_transition_bonus",
      reservationRef: "deferred_reservation_bonus",
      acceptedCoinTypes: ["bonus_coins"]
    });
    const rejected = immediate(database, () => participant.createReservationInTransaction(input));
    assert.deepEqual(rejected, {
      ok: false,
      reservationRef: input.reservationRef,
      state: "reserved",
      activationAt: SCHEDULED_FOR,
      expiresAt: "2030-01-03T00:00:00.000Z",
      allocationSnapshot: []
    });
    assert.deepEqual(getLot(database), {
      available_units: 20,
      held_units: 0,
      consumed_units: 0,
      expired_units: 0
    });
    assert.equal(
      database.prepare(`select count(*) from ${RESERVATIONS_TABLE}`).pluck().get(),
      0
    );
  } finally {
    database.close();
  }
});

test("deferred reservation returns the bonus-expiry safe code before a rebase can consume it", () => {
  const database = createFoundation();
  try {
    const accountId = "account_rebase_bonus";
    seedAccount(database, accountId);
    seedOffer(database);
    credit(database, accountId, {
      coinType: "bonus_coins",
      expiresAt: "2030-01-03T12:00:00.000Z",
      sourceRef: "bonus_rebase_expiry"
    });
    const participant = createParticipant(database);
    const input = createInput({
      accountId,
      orderRef: "deferred_order_rebase_bonus",
      transitionRef: "deferred_transition_rebase_bonus",
      reservationRef: "deferred_reservation_rebase_bonus",
      acceptedCoinTypes: ["bonus_coins"]
    });
    immediate(database, () => participant.createReservationInTransaction(input));
    immediate(database, () => insertTransition(database, input));

    const preflight = immediate(database, () =>
      participant.preflightRebaseReservationInTransaction({
        reservationRef: input.reservationRef,
        activationAt: REBASED_FOR
      })
    );
    assert.deepEqual(preflight, {
      ok: false,
      reservationRef: input.reservationRef,
      safeResultCode: "bonus_expires_before_activation"
    });

    database.exec("begin immediate");
    try {
      const reboundTransition = database.prepare(`
        update ${TRANSITIONS_TABLE}
           set scheduled_for = ?, rebase_generation = 1, updated_at = ?
         where transition_ref = ? and state = 'reserved' and rebase_generation = 0
      `).run(REBASED_FOR, NOW, input.transitionRef);
      assert.equal(reboundTransition.changes, 1);
      const rebase = participant.rebaseReservationInTransaction({
        reservationRef: input.reservationRef,
        activationAt: REBASED_FOR,
        operation: operation(accountId, "rebase_bonus_expiry")
      });
      assert.deepEqual(rebase, {
        ok: false,
        reservationRef: input.reservationRef,
        safeResultCode: "bonus_expires_before_activation"
      });
    } finally {
      database.exec("rollback");
    }
    assert.deepEqual(
      database.prepare(`
        select activation_at, expires_at, rebase_generation
          from ${RESERVATIONS_TABLE}
         where reservation_ref = ?
      `).get(input.reservationRef),
      {
        activation_at: SCHEDULED_FOR,
        expires_at: "2030-01-03T00:00:00.000Z",
        rebase_generation: 0
      }
    );
  } finally {
    database.close();
  }
});

test("deferred reservation preflight and rebase require transition-first atomic coupling", () => {
  const database = createFoundation();
  try {
    const accountId = "account_rebase";
    seedAccount(database, accountId);
    seedOffer(database);
    credit(database, accountId);
    const participant = createParticipant(database);
    const input = createInput({
      accountId,
      orderRef: "deferred_order_rebase",
      transitionRef: "deferred_transition_rebase",
      reservationRef: "deferred_reservation_rebase"
    });
    const created = immediate(database, () => participant.createReservationInTransaction(input));
    immediate(database, () => insertTransition(database, input));
    const beforeReceipts = database.prepare(`
      select count(*) from platform_coin_operation_receipts
    `).pluck().get();
    const rebased = immediate(database, () => {
      const preflight = participant.preflightRebaseReservationInTransaction({
        reservationRef: input.reservationRef,
        activationAt: REBASED_FOR
      });
      assert.equal(preflight.ok, true);
      const updatedTransition = database.prepare(`
        update ${TRANSITIONS_TABLE}
           set scheduled_for = ?, rebase_generation = 1, updated_at = ?
         where transition_ref = ? and state = 'reserved' and rebase_generation = 0
      `).run(REBASED_FOR, NOW, input.transitionRef);
      assert.equal(updatedTransition.changes, 1);
      return participant.rebaseReservationInTransaction({
        reservationRef: input.reservationRef,
        activationAt: REBASED_FOR,
        operation: operation(accountId, "rebase_1")
      });
    });
    assert.equal(rebased.ok, true);
    assert.equal(rebased.activationAt, REBASED_FOR);
    assert.equal(rebased.expiresAt, "2030-01-04T00:00:00.000Z");
    assert.deepEqual(rebased.allocationSnapshot, created.allocationSnapshot);
    assert.equal(
      database.prepare(`
        select count(*) from platform_coin_operation_receipts
      `).pluck().get(),
      beforeReceipts + 1
    );
    assert.deepEqual(
      database.prepare(`
        select activation_at, expires_at, rebase_generation
          from ${RESERVATIONS_TABLE}
         where reservation_ref = ?
      `).get(input.reservationRef),
      {
        activation_at: REBASED_FOR,
        expires_at: "2030-01-04T00:00:00.000Z",
        rebase_generation: 1
      }
    );
  } finally {
    database.close();
  }
});
