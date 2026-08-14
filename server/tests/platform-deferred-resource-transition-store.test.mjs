import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
  DEFERRED_RESERVATION_RECOVERY_GRACE_MS,
  MAX_DEFERRED_TRANSITIONS_PER_ACCOUNT,
  createSqliteDeferredResourceTransitionStore
} from "../services/platform/deferred-resource-transition-store.mjs";
import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  applyCoinWalletMigrations
} from "../services/platform/coin-wallet-migrations.mjs";
import {
  createSqliteCoinWalletStore
} from "../services/platform/coin-wallet-store.mjs";

const APPLIED_AT = "2026-08-13T00:00:00.000Z";
const YEARLY = Object.freeze({
  offerVersionRef: "offerv_plan_365d_200gb_monthly_v1",
  durationDays: 365,
  monthlyTrafficGb: 200,
  baseCoinUnits: 200
});
const MONTHLY_100 = Object.freeze({
  offerVersionRef: "offerv_plan_30d_100gb_monthly_v1",
  durationDays: 30,
  monthlyTrafficGb: 100,
  baseCoinUnits: 30
});
const MONTHLY_50 = Object.freeze({
  offerVersionRef: "offerv_plan_30d_50gb_monthly_v1",
  durationDays: 30,
  monthlyTrafficGb: 50,
  baseCoinUnits: 20
});
const RESERVATIONS_TABLE = "platform_deferred_resource_transition_reservations";

function makeRefFactory(prefix = "ref") {
  const counts = new Map();
  return (kind) => {
    const count = (counts.get(kind) ?? 0) + 1;
    counts.set(kind, count);
    return `${prefix}_${kind}_${count}`;
  };
}

function makeLeaseTokenFactory() {
  let count = 0;
  return () => {
    count += 1;
    return count.toString(16).padStart(64, "0");
  };
}

function operation(accountId, key, actorType = "portal_user") {
  return {
    actorScope: `account:${accountId}`,
    idempotencyKey: key,
    actorType,
    actorRef: actorType === "portal_user" ? accountId : "test_transition_worker"
  };
}

function rebaseOperation(accountId, settledTransitionRef, phase = "apply") {
  return operation(
    accountId,
    `deferred_rebase_${phase}_${settledTransitionRef}`,
    "commerce_system"
  );
}

function createFoundation() {
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
      valid_from text not null,
      valid_until text not null
    );
    create table platform_issuance_requests (
      id text primary key,
      account_id text not null references platform_accounts(id),
      entitlement_id text not null references platform_entitlements(id),
      status text not null default 'issued'
    );
    create table platform_issued_subscription_links (
      id text primary key,
      request_id text not null references platform_issuance_requests(id),
      tenant_ref text not null default '',
      artifact_ref text not null default '',
      status text not null default 'active'
    );
    create table platform_portal_access_requests (
      id text primary key,
      portal_user_ref text not null,
      entitlement_ref text,
      status text not null,
      expires_at text,
      valid_until text,
      tenant_id text,
      artifact_id text
    );
  `);
  applyCoinWalletMigrations({
    database,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(APPLIED_AT)
  });
  applyCoinCommerceMigrations({
    database,
    expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(APPLIED_AT)
  });
  applyDeferredResourceTransitionMigrations({
    database,
    expectedMigrationId: REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID,
    expectedDdlChecksum: DEFERRED_RESOURCE_TRANSITION_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(APPLIED_AT)
  });
  return database;
}

function offerSnapshot(plan) {
  const suffix = plan.offerVersionRef.replace(/^offerv_/, "");
  return {
    offerRef: `offer_${suffix}`,
    offerVersionRef: plan.offerVersionRef,
    version: 1,
    category: "plan",
    title: { zh: "测试套餐", en: "Test plan" },
    summary: { zh: "测试套餐摘要", en: "Test plan summary" },
    importantNotices: {
      zh: ["仅用于平台自营订阅服务"],
      en: ["Platform subscription only"]
    },
    baseCoinUnits: plan.baseCoinUnits,
    referencePrice: { currency: "CNY", amountMinor: plan.baseCoinUnits * 100 },
    acceptedCoinTypes: ["bonus_coins", "paid_coins", "reward_coins"],
    delivery: {
      kind: "subscription_plan",
      durationDays: plan.durationDays,
      monthlyTrafficGb: plan.monthlyTrafficGb,
      trafficGb: null,
      neverExpires: false,
      discountBasisPoints: 0
    }
  };
}

function seedOffer(database, plan) {
  const offer = offerSnapshot(plan);
  database.prepare(`
    insert into platform_coin_commerce_offer_versions (
      offer_version_ref, offer_ref, version, status, category,
      title_zh, title_en, summary_zh, summary_en,
      important_notices_zh_json, important_notices_en_json,
      base_coin_units, reference_currency, reference_amount_minor,
      accepted_coin_types_json, delivery_kind, duration_days,
      monthly_traffic_gb, traffic_gb, never_expires,
      discount_basis_points, created_at, published_at, retired_at
    ) values (?, ?, 1, 'published', 'plan', ?, ?, ?, ?, ?, ?, ?, 'CNY', ?, ?,
      'subscription_plan', ?, ?, null, 0, 0, ?, ?, null)
  `).run(
    offer.offerVersionRef,
    offer.offerRef,
    offer.title.zh,
    offer.title.en,
    offer.summary.zh,
    offer.summary.en,
    JSON.stringify(offer.importantNotices.zh),
    JSON.stringify(offer.importantNotices.en),
    offer.baseCoinUnits,
    offer.referencePrice.amountMinor,
    JSON.stringify(offer.acceptedCoinTypes),
    offer.delivery.durationDays,
    offer.delivery.monthlyTrafficGb,
    APPLIED_AT,
    APPLIED_AT
  );
  return offer;
}

function seedAccount(database, accountId, {
  metadata = { commercialModel: "wallet_first_unique_v1" }
} = {}) {
  database.prepare(`
    insert into platform_accounts (id, owner_ref, status, created_at, updated_at, metadata_json)
    values (?, ?, 'active', ?, ?, ?)
  `).run(accountId, `owner_${accountId}`, APPLIED_AT, APPLIED_AT, JSON.stringify(metadata));
}

function bindingRef(prefix, value) {
  return `${prefix}ref_${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

function seedResourceChain(database, {
  accountId,
  entitlementId,
  requestId,
  issuedLinkId,
  validFrom = APPLIED_AT,
  validUntil
}) {
  const suffix = entitlementId.replace(/^entitlement_/, "");
  const tenantId = `tenant_${suffix}`;
  const artifactId = `artifact_${suffix}`;
  database.prepare(`
    insert into platform_entitlements (id, account_id, status, valid_from, valid_until)
    values (?, ?, 'active', ?, ?)
  `).run(entitlementId, accountId, validFrom, validUntil);
  database.prepare(`
    insert into platform_issuance_requests (id, account_id, entitlement_id, status)
    values (?, ?, ?, 'issued')
  `).run(requestId, accountId, entitlementId);
  database.prepare(`
    insert into platform_issued_subscription_links (
      id, request_id, tenant_ref, artifact_ref, status
    ) values (?, ?, ?, ?, 'active')
  `).run(
    issuedLinkId,
    requestId,
    bindingRef("tenant", tenantId),
    bindingRef("artifact", artifactId)
  );
  database.prepare(`
    insert into platform_portal_access_requests (
      id, portal_user_ref, entitlement_ref, status, expires_at, valid_until,
      tenant_id, artifact_id
    ) values (?, ?, ?, 'issued', ?, ?, ?, ?)
  `).run(
    requestId,
    accountId,
    entitlementId,
    validUntil,
    validUntil,
    tenantId,
    artifactId
  );
}

function creditPaidCoins(database, accountId, amountUnits, now) {
  const walletStore = createSqliteCoinWalletStore({
    database,
    nowFn: () => new Date(now),
    refFactory: makeRefFactory("wallet_default_participant")
  });
  try {
    return walletStore.creditCoins({
      accountId,
      coinType: "paid_coins",
      amountUnits,
      availability: "available",
      sourceType: "deferred_store_test_credit",
      sourceRef: `source_${accountId}`,
      sourceDigest: "a".repeat(64),
      policyRef: null,
      policyVersion: null,
      expiresAt: null,
      operation: {
        actorScope: `account:${accountId}`,
        idempotencyKey: `credit_${accountId}`,
        actorType: "system",
        actorRef: "deferred_transition_store_test"
      }
    });
  } finally {
    walletStore.close();
  }
}

function seedEffectSuccessor(database, accountId, suffix, validUntil) {
  const entitlementId = `effect_entitlement_${suffix}`;
  const requestId = `effect_request_${suffix}`;
  const issuedLinkId = `effect_link_${suffix}`;
  seedResourceChain(database, {
    accountId,
    entitlementId,
    requestId,
    issuedLinkId,
    validUntil
  });
  return Object.freeze({ entitlementId, requestId, issuedLinkId, validUntil });
}

function createTestReservationParticipant(database) {
  const funding = new Map();
  const reservations = new Map();

  function ensureWallet(accountId) {
    const walletRef = `wallet_${accountId}`;
    database.prepare(`
      insert or ignore into platform_coin_wallets (
        wallet_ref, account_id, status, version, created_at, updated_at
      ) values (?, ?, 'active', 0, ?, ?)
    `).run(walletRef, accountId, APPLIED_AT, APPLIED_AT);
    return walletRef;
  }

  function seedFunding({
    accountId,
    orderRef,
    amountUnits,
    coinType = "paid_coins",
    bonusExpiresAt = null
  }) {
    ensureWallet(accountId);
    const allocationSnapshot = [{
      lotRef: `lot_${orderRef}`,
      allocationSequence: 1,
      coinType,
      allocatedUnits: amountUnits,
      expiresAt: bonusExpiresAt
    }];
    funding.set(`${accountId}\0${orderRef}`, Object.freeze({
      accountId,
      orderRef,
      amountUnits,
      allocationSnapshot: Object.freeze(allocationSnapshot.map(Object.freeze))
    }));
    return Object.freeze({ allocationSnapshot });
  }

  function readReservation(reservationRef) {
    return database.prepare(`
      select reservation_ref as reservationRef, state,
             activation_at as activationAt, expires_at as expiresAt,
             rebase_generation as rebaseGeneration
        from ${RESERVATIONS_TABLE}
       where reservation_ref = ?
    `).get(reservationRef) ?? null;
  }

  return Object.freeze({
    seedFunding,
    readReservation,
    createReservationInTransaction({
      accountId,
      orderRef,
      transitionRef,
      reservationRef,
      amountUnits,
      acceptedCoinTypes,
      scheduledFor
    }) {
      assert.equal(database.inTransaction, true);
      const source = funding.get(`${accountId}\0${orderRef}`);
      const expiresAt = new Date(
        Date.parse(scheduledFor) + DEFERRED_RESERVATION_RECOVERY_GRACE_MS
      ).toISOString();
      if (
        !source
        || source.amountUnits !== amountUnits
        || !acceptedCoinTypes.includes(source.allocationSnapshot[0].coinType)
        || (
          source.allocationSnapshot[0].coinType === "bonus_coins"
          && source.allocationSnapshot[0].expiresAt <= expiresAt
        )
      ) {
        return {
          ok: false,
          reservationRef,
          safeResultCode: "bonus_expires_before_activation"
        };
      }
      const existing = reservations.get(reservationRef);
      if (existing) {
        const row = readReservation(reservationRef);
        return {
          ok: true,
          reservationRef,
          state: row.state,
          activationAt: row.activationAt,
          expiresAt: row.expiresAt,
          allocationSnapshot: existing.allocationSnapshot
        };
      }
      const walletRef = ensureWallet(accountId);
      database.prepare(`
        insert into ${RESERVATIONS_TABLE} (
          reservation_ref, account_id, wallet_ref, source_type, source_ref,
          amount_units, activation_at, expires_at, rebase_generation,
          state, lease_generation, lease_token, lease_until, created_at, updated_at
        ) values (?, ?, ?, 'deferred_resource_transition', ?, ?, ?, ?, 0,
          'reserved', 0, null, null, ?, ?)
      `).run(
        reservationRef,
        accountId,
        walletRef,
        transitionRef,
        amountUnits,
        scheduledFor,
        expiresAt,
        APPLIED_AT,
        APPLIED_AT
      );
      reservations.set(reservationRef, source);
      return {
          ok: true,
          reservationRef,
          state: "reserved",
          activationAt: scheduledFor,
          expiresAt,
          allocationSnapshot: source.allocationSnapshot
      };
    },
    verifyReservationInTransaction({
      accountId,
      orderRef,
      reservationRef,
      amountUnits,
      allocationSnapshot
    }) {
      assert.equal(database.inTransaction, true);
      const reservation = reservations.get(reservationRef);
      const row = readReservation(reservationRef);
      if (
        !reservation
        || !row
        || reservation.accountId !== accountId
        || reservation.orderRef !== orderRef
        || reservation.amountUnits !== amountUnits
        || JSON.stringify(reservation.allocationSnapshot) !== JSON.stringify(allocationSnapshot)
      ) {
        return {
          ok: false,
          reservationRef,
          state: "invalidated",
          activationAt: row?.activationAt ?? "1970-01-01T00:00:00.000Z",
          expiresAt: row?.expiresAt ?? "1970-01-02T00:00:00.000Z",
          allocationSnapshot: reservation?.allocationSnapshot ?? allocationSnapshot
        };
      }
      return {
        ok: true,
        reservationRef,
        state: row.state,
        activationAt: row.activationAt,
        expiresAt: row.expiresAt,
        allocationSnapshot: reservation.allocationSnapshot
      };
    },
    preflightRebaseReservationInTransaction({ reservationRef, activationAt }) {
      const reservation = reservations.get(reservationRef);
      const row = readReservation(reservationRef);
      const expiresAt = new Date(
        Date.parse(activationAt) + DEFERRED_RESERVATION_RECOVERY_GRACE_MS
      ).toISOString();
      if (!reservation || !row || row.state !== "reserved") {
        throw new Error("test deferred reservation is unavailable");
      }
      const bonusAllocation = reservation.allocationSnapshot.find(
        ({ coinType }) => coinType === "bonus_coins"
      );
      if (bonusAllocation && bonusAllocation.expiresAt <= expiresAt) {
        return {
          ok: false,
          reservationRef,
          safeResultCode: "bonus_expires_before_activation"
        };
      }
      return {
        ok: true,
        reservationRef,
        state: "reserved",
        activationAt,
        expiresAt,
        allocationSnapshot: reservation.allocationSnapshot
      };
    },
    rebaseReservationInTransaction({ reservationRef, activationAt }) {
      const preflight = this.preflightRebaseReservationInTransaction({
        reservationRef,
        activationAt
      });
      if (preflight.ok !== true) return preflight;
      const rebound = database.prepare(`
        update ${RESERVATIONS_TABLE}
           set activation_at = ?, expires_at = ?,
               rebase_generation = rebase_generation + 1, updated_at = ?
         where reservation_ref = ? and state = 'reserved'
      `).run(
        activationAt,
        preflight.expiresAt,
        APPLIED_AT,
        reservationRef
      );
      if (rebound.changes !== 1) {
        throw new Error("test deferred reservation rebase failed");
      }
      return {
        ...preflight,
        activationAt,
        expiresAt: preflight.expiresAt
      };
    },
    captureReservationInTransaction({ reservationRef }) {
      const row = readReservation(reservationRef);
      if (!row) return { ok: false, reservationRef, safeResultCode: "missing" };
      if (row.state === "captured") {
        return { ok: true, reservationRef, safeResultCode: "captured" };
      }
      if (row.state !== "reserved") {
        return { ok: false, reservationRef, safeResultCode: "not_capturable" };
      }
      const claimed = database.prepare(`
        update ${RESERVATIONS_TABLE}
           set state = 'processing', lease_generation = lease_generation + 1,
               lease_token = ?, lease_until = ?, updated_at = ?
         where reservation_ref = ? and state = 'reserved'
      `).run(
        "c".repeat(64),
        "2035-01-01T00:00:00.000Z",
        APPLIED_AT,
        reservationRef
      );
      if (claimed.changes !== 1) {
        return { ok: false, reservationRef, safeResultCode: "not_capturable" };
      }
      const captured = database.prepare(`
        update ${RESERVATIONS_TABLE}
           set state = 'captured', lease_token = null, lease_until = null, updated_at = ?
         where reservation_ref = ? and state = 'processing'
      `).run(APPLIED_AT, reservationRef);
      return captured.changes === 1
        ? { ok: true, reservationRef, safeResultCode: "captured" }
        : { ok: false, reservationRef, safeResultCode: "not_capturable" };
    },
    releaseReservationInTransaction({ reservationRef }) {
      const row = readReservation(reservationRef);
      if (!row) return { ok: false, reservationRef, safeResultCode: "missing" };
      if (row.state === "released") {
        return { ok: true, reservationRef, safeResultCode: "released" };
      }
      if (row.state !== "reserved") {
        return { ok: false, reservationRef, safeResultCode: "not_releasable" };
      }
      const released = database.prepare(`
        update ${RESERVATIONS_TABLE}
           set state = 'released', updated_at = ?
         where reservation_ref = ? and state = 'reserved'
      `).run(APPLIED_AT, reservationRef);
      return released.changes === 1
        ? { ok: true, reservationRef, safeResultCode: "released" }
        : { ok: false, reservationRef, safeResultCode: "not_releasable" };
    }
  });
}

function reserveInput({
  accountId,
  orderRef,
  plan,
  scheduledFor,
  operationKey,
  flowKind = "initial_activation",
  expectedEntitlementId = null,
  expectedRequestId = null,
  expectedIssuedLinkId = null,
  expectedValidUntil = null
}) {
  return {
    accountId,
    orderRef,
    offerVersionRef: plan.offerVersionRef,
    flowKind,
    amountUnits: plan.baseCoinUnits,
    offerSnapshot: offerSnapshot(plan),
    scheduledFor,
    expectedEntitlementId,
    expectedRequestId,
    expectedIssuedLinkId,
    expectedValidUntil,
    operation: operation(accountId, operationKey)
  };
}

function createDeferredStore(database, clock, reservationParticipant) {
  return createSqliteDeferredResourceTransitionStore({
    database,
    nowFn: () => new Date(clock.value),
    refFactory: makeRefFactory("deferred"),
    leaseTokenFactory: makeLeaseTokenFactory(),
    reservationParticipantFactory: ({ database: participantDatabase }) => {
      assert.equal(participantDatabase, database);
      return reservationParticipant;
    }
  });
}

test("store constructs its dedicated reservation participant on the exact database and fails closed for an invalid test override", () => {
  const database = createFoundation();
  try {
    const defaultStore = createSqliteDeferredResourceTransitionStore({ database });
    defaultStore.close();
    assert.throws(
      () => createSqliteDeferredResourceTransitionStore({
        database,
        reservationParticipantFactory: () => null
      }),
      (error) => error?.code === "wallet_deferred_hold_adapter_required"
    );
  } finally {
    database.close();
  }
});

test("default participant creates and verifies a claimed reservation on the store transaction", () => {
  const database = createFoundation();
  let store;
  try {
    const accountId = "account_default_participant";
    const clock = { value: "2030-01-05T00:00:00.000Z" };
    seedOffer(database, MONTHLY_50);
    seedAccount(database, accountId);
    creditPaidCoins(database, accountId, MONTHLY_50.baseCoinUnits, clock.value);
    store = createSqliteDeferredResourceTransitionStore({
      database,
      nowFn: () => new Date(clock.value),
      refFactory: makeRefFactory("default_participant"),
      leaseTokenFactory: makeLeaseTokenFactory()
    });
    const reserved = store.reserveTransition(reserveInput({
      accountId,
      orderRef: "deferred_order_default_participant",
      plan: MONTHLY_50,
      scheduledFor: clock.value,
      operationKey: "reserve_default_participant"
    }));
    const claimed = store.claimNextDueTransition({ leaseMs: 60_000 });
    const verified = store.verifyClaimedTransitionReservation({
      transitionRef: claimed.transitionRef,
      leaseGeneration: claimed.leaseGeneration,
      leaseToken: claimed.leaseToken
    });
    assert.deepEqual(verified, {
      ok: true,
      reservationRef: reserved.reservationRef,
      state: "reserved",
      activationAt: clock.value,
      expiresAt: "2030-01-06T00:00:00.000Z",
      allocationSnapshot: [{
        lotRef: "wallet_default_participant_lot_1",
        allocationSequence: 1,
        coinType: "paid_coins",
        allocatedUnits: MONTHLY_50.baseCoinUnits,
        expiresAt: null
      }]
    });
    assert.equal(database.inTransaction, false);
    assert.equal(
      database.prepare("select count(*) from platform_coin_holds").pluck().get(),
      0
    );
    assert.throws(
      () => store.verifyClaimedTransitionReservation({
        transitionRef: claimed.transitionRef,
        leaseGeneration: claimed.leaseGeneration,
        leaseToken: "f".repeat(64)
      }),
      (error) => error?.code === "deferred_transition_lease_lost"
    );
  } finally {
    store?.close();
    database.close();
  }
});

test("real wallet participant carries a settled transition through durable rebase without generic holds", () => {
  const database = createFoundation();
  let store;
  try {
    for (const plan of [YEARLY, MONTHLY_100]) seedOffer(database, plan);
    const accountId = "account_real_wallet_rebase";
    const clock = { value: "2030-01-15T00:00:00.000Z" };
    seedAccount(database, accountId);
    seedResourceChain(database, {
      accountId,
      entitlementId: "entitlement_real_wallet_old",
      requestId: "request_real_wallet_old",
      issuedLinkId: "link_real_wallet_old",
      validUntil: clock.value
    });
    creditPaidCoins(
      database,
      accountId,
      YEARLY.baseCoinUnits + MONTHLY_100.baseCoinUnits,
      clock.value
    );
    store = createSqliteDeferredResourceTransitionStore({
      database,
      nowFn: () => new Date(clock.value),
      refFactory: makeRefFactory("real_wallet_rebase"),
      leaseTokenFactory: makeLeaseTokenFactory()
    });
    const predecessor = {
      flowKind: "scheduled_switch",
      expectedEntitlementId: "entitlement_real_wallet_old",
      expectedRequestId: "request_real_wallet_old",
      expectedIssuedLinkId: "link_real_wallet_old",
      expectedValidUntil: clock.value
    };
    const source = store.reserveTransition(reserveInput({
      accountId,
      orderRef: "deferred_order_real_wallet_source",
      plan: YEARLY,
      scheduledFor: clock.value,
      operationKey: "reserve_real_wallet_source",
      ...predecessor
    }));
    const queued = store.reserveTransition(reserveInput({
      accountId,
      orderRef: "deferred_order_real_wallet_queued",
      plan: MONTHLY_100,
      scheduledFor: clock.value,
      operationKey: "reserve_real_wallet_queued",
      ...predecessor
    }));
    const claim = store.claimNextDueTransition({ leaseMs: 60_000 });
    assert.equal(claim.transitionRef, source.transitionRef);
    database.prepare("update platform_entitlements set status = 'expired' where id = ?")
      .run("entitlement_real_wallet_old");
    const successor = seedEffectSuccessor(
      database,
      accountId,
      "real_wallet_new",
      "2031-01-15T00:00:00.000Z"
    );
    store.recordEffectApplied({
      transitionRef: claim.transitionRef,
      leaseGeneration: claim.leaseGeneration,
      leaseToken: claim.leaseToken,
      effectRef: "effect_real_wallet_source",
      successor,
      operation: operation(accountId, "record_real_wallet", "commerce_system")
    });
    const settled = store.settleTransition({
      transitionRef: claim.transitionRef,
      leaseGeneration: claim.leaseGeneration,
      leaseToken: claim.leaseToken,
      operation: operation(accountId, "settle_real_wallet", "commerce_system")
    });
    assert.equal(settled.state, "settled");
    const rebaseClaim = store.claimNextPendingRebase({ leaseMs: 60_000 });
    const completed = store.applyClaimedRebase({
      settledTransitionRef: rebaseClaim.settledTransitionRef,
      leaseGeneration: rebaseClaim.leaseGeneration,
      leaseToken: rebaseClaim.leaseToken,
      operation: rebaseOperation(accountId, source.transitionRef)
    });
    assert.equal(completed.state, "completed");
    assert.equal(database.prepare(`
      select state from platform_deferred_resource_transition_reservations
       where reservation_ref = ?
    `).pluck().get(source.reservationRef), "captured");
    assert.equal(database.prepare(`
      select state from platform_deferred_resource_transition_reservations
       where reservation_ref = ?
    `).pluck().get(queued.reservationRef), "reserved");
    const [queuedAfterRebase] = store.listTransitions({ accountId })
      .filter((transition) => transition.transitionRef === queued.transitionRef);
    assert.equal(queuedAfterRebase.scheduledFor, successor.validUntil);
    assert.equal(database.prepare("select count(*) from platform_coin_holds").pluck().get(), 0);
  } finally {
    store?.close();
    database.close();
  }
});

test("reserve is idempotent, owns a standalone reservation, and list projection excludes allocation/lease secrets", () => {
  const database = createFoundation();
  try {
    seedOffer(database, MONTHLY_50);
    seedAccount(database, "account_reserve");
    const reservationParticipant = createTestReservationParticipant(database);
    reservationParticipant.seedFunding({
      accountId: "account_reserve",
      orderRef: "deferred_order_reserve",
      amountUnits: MONTHLY_50.baseCoinUnits
    });
    const clock = { value: "2030-01-01T00:00:00.000Z" };
    const store = createDeferredStore(database, clock, reservationParticipant);
    const input = reserveInput({
      accountId: "account_reserve",
      orderRef: "deferred_order_reserve",
      plan: MONTHLY_50,
      scheduledFor: "2030-01-02T00:00:00.000Z",
      operationKey: "reserve_1"
    });

    const first = store.reserveTransition(input);
    const replay = store.reserveTransition(input);
    assert.equal(first.transitionRef, replay.transitionRef);
    assert.equal(first.state, "reserved");
    assert.equal(
      database.prepare("select count(*) from platform_coin_commerce_orders").pluck().get(),
      0
    );
    assert.throws(
      () => store.reserveTransition({ ...input, scheduledFor: "2030-01-03T00:00:00.000Z" }),
      (error) => error?.code === "deferred_transition_idempotency_conflict"
    );
    const [listed] = store.listTransitions({ accountId: "account_reserve" });
    assert.equal(listed.transitionRef, first.transitionRef);
    assert.equal(typeof listed.reservationRef, "string");
    assert.equal(Object.hasOwn(listed, "allocationSnapshot"), false);
    assert.equal(Object.hasOwn(listed, "leaseToken"), false);

    const cancelled = store.cancelTransition({
      accountId: "account_reserve",
      transitionRef: first.transitionRef,
      operation: operation("account_reserve", "cancel_1")
    });
    assert.equal(cancelled.state, "cancelled");
    assert.equal(reservationParticipant.readReservation(first.reservationRef).state, "released");
  } finally {
    database.close();
  }
});

test("a wallet-first account cannot reserve more queued transitions than the Portal can list", () => {
  const database = createFoundation();
  let store;
  try {
    const accountId = "account_queue_cap";
    const validUntil = "2030-02-01T00:00:00.000Z";
    const clock = { value: "2030-01-01T00:00:00.000Z" };
    seedOffer(database, MONTHLY_50);
    seedAccount(database, accountId);
    seedResourceChain(database, {
      accountId,
      entitlementId: "entitlement_queue_cap",
      requestId: "request_queue_cap",
      issuedLinkId: "link_queue_cap",
      validUntil
    });
    const reservationParticipant = createTestReservationParticipant(database);
    store = createDeferredStore(database, clock, reservationParticipant);
    const expectedChain = {
      flowKind: "scheduled_switch",
      expectedEntitlementId: "entitlement_queue_cap",
      expectedRequestId: "request_queue_cap",
      expectedIssuedLinkId: "link_queue_cap",
      expectedValidUntil: validUntil
    };
    const created = [];
    for (let index = 0; index < MAX_DEFERRED_TRANSITIONS_PER_ACCOUNT; index += 1) {
      const suffix = String(index).padStart(3, "0");
      const orderRef = `deferred_order_queue_cap_${suffix}`;
      reservationParticipant.seedFunding({
        accountId,
        orderRef,
        amountUnits: MONTHLY_50.baseCoinUnits
      });
      created.push(store.reserveTransition(reserveInput({
        accountId,
        orderRef,
        plan: MONTHLY_50,
        scheduledFor: validUntil,
        operationKey: `reserve_queue_cap_${suffix}`,
        ...expectedChain
      })));
    }

    assert.equal(store.listTransitions({ accountId }).length, MAX_DEFERRED_TRANSITIONS_PER_ACCOUNT);
    assert.deepEqual(
      store.getTransition({
        accountId,
        transitionRef: created[0].transitionRef
      }),
      created[0]
    );

    const overflowOrderRef = "deferred_order_queue_cap_overflow";
    reservationParticipant.seedFunding({
      accountId,
      orderRef: overflowOrderRef,
      amountUnits: MONTHLY_50.baseCoinUnits
    });
    assert.throws(
      () => store.reserveTransition(reserveInput({
        accountId,
        orderRef: overflowOrderRef,
        plan: MONTHLY_50,
        scheduledFor: validUntil,
        operationKey: "reserve_queue_cap_overflow",
        ...expectedChain
      })),
      (error) => error?.code === "deferred_transition_queue_full"
    );
    assert.equal(store.listTransitions({ accountId }).length, MAX_DEFERRED_TRANSITIONS_PER_ACCOUNT);
  } finally {
    store?.close();
    database.close();
  }
});

test("due claiming applies rank within an account and FIFO across independent accounts", () => {
  const database = createFoundation();
  try {
    for (const plan of [YEARLY, MONTHLY_100, MONTHLY_50]) seedOffer(database, plan);
    const reservationParticipant = createTestReservationParticipant(database);
    const clock = { value: "2030-02-01T00:00:00.000Z" };
    const store = createDeferredStore(database, clock, reservationParticipant);
    const reservations = [
      ["account_monthly", "deferred_order_monthly", MONTHLY_50, "reserve_monthly"],
      ["account_yearly_later", "deferred_order_yearly_later", YEARLY, "reserve_yearly_later"],
      ["account_yearly_first", "deferred_order_yearly_first", YEARLY, "reserve_yearly_first"]
    ];
    for (const [accountId, orderRef, plan, operationKey] of reservations) {
      seedAccount(database, accountId);
      reservationParticipant.seedFunding({
        accountId,
        orderRef,
        amountUnits: plan.baseCoinUnits
      });
      store.reserveTransition(reserveInput({
        accountId,
        orderRef,
        plan,
        scheduledFor: "2030-02-01T00:00:00.000Z",
        operationKey
      }));
    }
    const claimed = store.claimNextDueTransition({ leaseMs: 60_000 });
    assert.equal(claimed.accountId, "account_monthly");
    assert.equal(claimed.planRank, 1);
    const successor = seedEffectSuccessor(
      database,
      claimed.accountId,
      "monthly",
      "2030-03-01T00:00:00.000Z"
    );
    const injectedEffectHandler = ({ transitionRef }) => ({
      effectRef: `effect_${transitionRef}`,
      successor
    });
    const effect = injectedEffectHandler(claimed);
    const applied = store.recordEffectApplied({
      transitionRef: claimed.transitionRef,
      leaseGeneration: claimed.leaseGeneration,
      leaseToken: claimed.leaseToken,
      effectRef: effect.effectRef,
      successor: effect.successor,
      operation: operation(claimed.accountId, "effect_1", "commerce_system")
    });
    assert.equal(applied.state, "effect_applied");
    const settled = store.settleTransition({
      transitionRef: claimed.transitionRef,
      leaseGeneration: claimed.leaseGeneration,
      leaseToken: claimed.leaseToken,
      operation: operation(claimed.accountId, "settle_1", "commerce_system")
    });
    assert.equal(settled.state, "settled");
    assert.equal(
      reservationParticipant.readReservation(claimed.reservationRef).state,
      "captured"
    );
    assert.equal(
      database.prepare("select count(*) from platform_coin_commerce_orders").pluck().get(),
      0
    );
  } finally {
    database.close();
  }
});

test("due claiming selects the highest-ranked reservation only within one account", () => {
  const database = createFoundation();
  try {
    for (const plan of [YEARLY, MONTHLY_50]) seedOffer(database, plan);
    const accountId = "account_ranked_queue";
    const clock = { value: "2030-02-15T00:00:00.000Z" };
    seedAccount(database, accountId);
    seedResourceChain(database, {
      accountId,
      entitlementId: "entitlement_ranked_queue",
      requestId: "request_ranked_queue",
      issuedLinkId: "link_ranked_queue",
      validUntil: clock.value
    });
    const reservationParticipant = createTestReservationParticipant(database);
    const store = createDeferredStore(database, clock, reservationParticipant);
    for (const [orderRef, plan] of [
      ["deferred_order_rank_low", MONTHLY_50],
      ["deferred_order_rank_high", YEARLY]
    ]) {
      reservationParticipant.seedFunding({
        accountId,
        orderRef,
        amountUnits: plan.baseCoinUnits
      });
      store.reserveTransition(reserveInput({
        accountId,
        orderRef,
        plan,
        scheduledFor: clock.value,
        operationKey: `reserve_${orderRef}`,
        flowKind: "scheduled_switch",
        expectedEntitlementId: "entitlement_ranked_queue",
        expectedRequestId: "request_ranked_queue",
        expectedIssuedLinkId: "link_ranked_queue",
        expectedValidUntil: clock.value
      }));
    }
    const claimed = store.claimNextDueTransition({ leaseMs: 60_000 });
    assert.equal(claimed.accountId, accountId);
    assert.equal(claimed.planRank, 3);
    assert.equal(claimed.orderRef, "deferred_order_rank_high");
  } finally {
    database.close();
  }
});

test("bonus allocations must cover the reservation recovery grace before settlement", () => {
  const database = createFoundation();
  try {
    seedOffer(database, MONTHLY_50);
    seedAccount(database, "account_bonus_rejected");
    seedAccount(database, "account_bonus_settled");
    const reservationParticipant = createTestReservationParticipant(database);
    const clock = { value: "2030-03-01T00:00:00.000Z" };
    const store = createDeferredStore(database, clock, reservationParticipant);

    reservationParticipant.seedFunding({
      accountId: "account_bonus_rejected",
      orderRef: "deferred_order_bonus_rejected",
      amountUnits: MONTHLY_50.baseCoinUnits,
      coinType: "bonus_coins",
      bonusExpiresAt: "2030-03-02T00:00:00.000Z"
    });
    assert.throws(() => store.reserveTransition(reserveInput({
      accountId: "account_bonus_rejected",
      orderRef: "deferred_order_bonus_rejected",
      plan: MONTHLY_50,
      scheduledFor: "2030-03-01T00:00:00.000Z",
      operationKey: "reserve_bonus_rejected"
    })), (error) => error?.code === "bonus_expires_before_activation");
    assert.deepEqual(store.listTransitions({ accountId: "account_bonus_rejected" }), []);

    clock.value = "2030-03-10T00:00:00.000Z";
    reservationParticipant.seedFunding({
      accountId: "account_bonus_settled",
      orderRef: "deferred_order_bonus_settled",
      amountUnits: MONTHLY_50.baseCoinUnits,
      coinType: "bonus_coins",
      bonusExpiresAt: "2030-03-11T01:00:00.000Z"
    });
    const second = store.reserveTransition(reserveInput({
      accountId: "account_bonus_settled",
      orderRef: "deferred_order_bonus_settled",
      plan: MONTHLY_50,
      scheduledFor: "2030-03-10T00:00:00.000Z",
      operationKey: "reserve_bonus_settled"
    }));
    const claim = store.claimNextDueTransition({ leaseMs: 60_000 });
    assert.equal(claim.transitionRef, second.transitionRef);
    const successor = seedEffectSuccessor(
      database,
      "account_bonus_settled",
      "bonus_settled",
      "2030-04-10T00:00:00.000Z"
    );
    store.recordEffectApplied({
      transitionRef: claim.transitionRef,
      leaseGeneration: claim.leaseGeneration,
      leaseToken: claim.leaseToken,
      effectRef: "effect_bonus_settled",
      successor,
      operation: operation("account_bonus_settled", "effect_bonus", "commerce_system")
    });
    const settled = store.settleTransition({
      transitionRef: claim.transitionRef,
      leaseGeneration: claim.leaseGeneration,
      leaseToken: claim.leaseToken,
      operation: operation("account_bonus_settled", "settle_bonus", "commerce_system")
    });
    assert.equal(settled.state, "settled");
    assert.equal(
      reservationParticipant.readReservation(second.reservationRef).state,
      "captured"
    );
  } finally {
    database.close();
  }
});

test("an expired effect-applied lease is recovered from its durable successor without replaying the effect", () => {
  const database = createFoundation();
  try {
    seedOffer(database, MONTHLY_50);
    seedAccount(database, "account_effect_recovery");
    const reservationParticipant = createTestReservationParticipant(database);
    reservationParticipant.seedFunding({
      accountId: "account_effect_recovery",
      orderRef: "deferred_order_effect_recovery",
      amountUnits: MONTHLY_50.baseCoinUnits
    });
    const clock = { value: "2030-05-01T00:00:00.000Z" };
    const store = createDeferredStore(database, clock, reservationParticipant);
    const reserved = store.reserveTransition(reserveInput({
      accountId: "account_effect_recovery",
      orderRef: "deferred_order_effect_recovery",
      plan: MONTHLY_50,
      scheduledFor: clock.value,
      operationKey: "reserve_effect_recovery"
    }));
    const claimed = store.claimNextDueTransition({ leaseMs: 60_000 });
    const successor = seedEffectSuccessor(
      database,
      "account_effect_recovery",
      "effect_recovery",
      "2030-06-01T00:00:00.000Z"
    );
    const recorded = store.recordEffectApplied({
      transitionRef: claimed.transitionRef,
      leaseGeneration: claimed.leaseGeneration,
      leaseToken: claimed.leaseToken,
      effectRef: "effect_recovery",
      successor,
      operation: operation("account_effect_recovery", "record_effect_recovery", "commerce_system")
    });
    assert.equal(recorded.state, "effect_applied");

    clock.value = "2030-05-01T00:01:01.000Z";
    assert.equal(store.claimNextDueTransition({ leaseMs: 60_000 }), null);
    const recovered = store.claimNextRecoverableEffectAppliedTransition({ leaseMs: 60_000 });
    assert.equal(recovered.transitionRef, reserved.transitionRef);
    assert.equal(recovered.effectRef, "effect_recovery");
    assert.deepEqual(recovered.successor, successor);
    assert.equal(recovered.leaseGeneration, claimed.leaseGeneration + 1);

    const settled = store.settleTransition({
      transitionRef: recovered.transitionRef,
      leaseGeneration: recovered.leaseGeneration,
      leaseToken: recovered.leaseToken,
      operation: operation("account_effect_recovery", "settle_effect_recovery", "commerce_system")
    });
    assert.equal(settled.state, "settled");
    assert.equal(store.claimNextRecoverableEffectAppliedTransition({ leaseMs: 60_000 }), null);
  } finally {
    database.close();
  }
});

test("an expired effect receipt with successor-chain drift is durably reconciled without releasing its reservation", () => {
  const database = createFoundation();
  try {
    seedOffer(database, MONTHLY_50);
    const accountId = "account_effect_drift";
    seedAccount(database, accountId);
    const reservationParticipant = createTestReservationParticipant(database);
    reservationParticipant.seedFunding({
      accountId,
      orderRef: "deferred_order_effect_drift",
      amountUnits: MONTHLY_50.baseCoinUnits
    });
    const clock = { value: "2030-05-10T00:00:00.000Z" };
    const store = createDeferredStore(database, clock, reservationParticipant);
    const reserved = store.reserveTransition(reserveInput({
      accountId,
      orderRef: "deferred_order_effect_drift",
      plan: MONTHLY_50,
      scheduledFor: clock.value,
      operationKey: "reserve_effect_drift"
    }));
    const claimed = store.claimNextDueTransition({ leaseMs: 60_000 });
    const successor = seedEffectSuccessor(
      database,
      accountId,
      "effect_drift",
      "2030-06-10T00:00:00.000Z"
    );
    store.recordEffectApplied({
      transitionRef: claimed.transitionRef,
      leaseGeneration: claimed.leaseGeneration,
      leaseToken: claimed.leaseToken,
      effectRef: "effect_drift",
      successor,
      operation: operation(accountId, "record_effect_drift", "commerce_system")
    });
    database.prepare(`
      update platform_issued_subscription_links set status = 'revoked' where id = ?
    `).run(successor.issuedLinkId);
    clock.value = "2030-05-10T00:01:01.000Z";

    assert.equal(store.claimNextRecoverableEffectAppliedTransition({ leaseMs: 60_000 }), null);
    const [reconciled] = store.listTransitions({ accountId });
    assert.equal(reconciled.transitionRef, reserved.transitionRef);
    assert.equal(reconciled.state, "reconciliation_required");
    assert.equal(reconciled.safeCode, "deferred_transition_expected_chain_invalid");
    assert.equal(
      reservationParticipant.readReservation(reserved.reservationRef).state,
      "reserved"
    );
    assert.equal(database.prepare(`
      select count(*) from platform_deferred_resource_transition_events
       where transition_ref = ?
         and event_type = 'transition_reconciliation_required'
         and safe_code = 'deferred_transition_expected_chain_invalid'
    `).pluck().get(reserved.transitionRef), 1);
    assert.equal(store.claimNextRecoverableEffectAppliedTransition({ leaseMs: 60_000 }), null);
  } finally {
    database.close();
  }
});

test("a rebase that would outlive a bonus reservation releases it and requires requote", () => {
  const database = createFoundation();
  try {
    seedOffer(database, YEARLY);
    seedOffer(database, MONTHLY_100);
    seedAccount(database, "account_rebase_bonus");
    const reservationParticipant = createTestReservationParticipant(database);
    const clock = { value: "2030-04-01T00:00:00.000Z" };
    const store = createDeferredStore(database, clock, reservationParticipant);
    seedResourceChain(database, {
      accountId: "account_rebase_bonus",
      entitlementId: "entitlement_bonus_old",
      requestId: "request_bonus_old",
      issuedLinkId: "link_bonus_old",
      validUntil: "2030-04-01T00:00:00.000Z"
    });
    reservationParticipant.seedFunding({
      accountId: "account_rebase_bonus",
      orderRef: "deferred_order_bonus_source",
      amountUnits: YEARLY.baseCoinUnits
    });
    reservationParticipant.seedFunding({
      accountId: "account_rebase_bonus",
      orderRef: "deferred_order_bonus_queued",
      amountUnits: MONTHLY_100.baseCoinUnits,
      coinType: "bonus_coins",
      bonusExpiresAt: "2030-04-02T12:00:00.000Z"
    });
    const chain = {
      flowKind: "scheduled_switch",
      expectedEntitlementId: "entitlement_bonus_old",
      expectedRequestId: "request_bonus_old",
      expectedIssuedLinkId: "link_bonus_old",
      expectedValidUntil: "2030-04-01T00:00:00.000Z"
    };
    const source = store.reserveTransition(reserveInput({
      accountId: "account_rebase_bonus",
      orderRef: "deferred_order_bonus_source",
      plan: YEARLY,
      scheduledFor: chain.expectedValidUntil,
      operationKey: "reserve_bonus_source",
      ...chain
    }));
    const queued = store.reserveTransition(reserveInput({
      accountId: "account_rebase_bonus",
      orderRef: "deferred_order_bonus_queued",
      plan: MONTHLY_100,
      scheduledFor: chain.expectedValidUntil,
      operationKey: "reserve_bonus_queued",
      ...chain
    }));
    const claim = store.claimNextDueTransition({ leaseMs: 60_000 });
    assert.equal(claim.transitionRef, source.transitionRef);
    database.prepare(`
      update platform_entitlements set status = 'expired' where id = ?
    `).run("entitlement_bonus_old");
    seedResourceChain(database, {
      accountId: "account_rebase_bonus",
      entitlementId: "entitlement_bonus_new",
      requestId: "request_bonus_new",
      issuedLinkId: "link_bonus_new",
      validUntil: "2031-04-01T00:00:00.000Z"
    });
    store.recordEffectApplied({
      transitionRef: claim.transitionRef,
      leaseGeneration: claim.leaseGeneration,
      leaseToken: claim.leaseToken,
      effectRef: "effect_rebase_bonus_source",
      successor: {
        entitlementId: "entitlement_bonus_new",
        requestId: "request_bonus_new",
        issuedLinkId: "link_bonus_new",
        validUntil: "2031-04-01T00:00:00.000Z"
      },
      operation: operation("account_rebase_bonus", "effect_bonus_source", "commerce_system")
    });
    store.settleTransition({
      transitionRef: claim.transitionRef,
      leaseGeneration: claim.leaseGeneration,
      leaseToken: claim.leaseToken,
      operation: operation("account_rebase_bonus", "settle_bonus_source", "commerce_system")
    });
    const rebaseClaim = store.claimNextPendingRebase({ leaseMs: 60_000 });
    const requote = store.completeRebase({
      settledTransitionRef: rebaseClaim.settledTransitionRef,
      leaseGeneration: rebaseClaim.leaseGeneration,
      leaseToken: rebaseClaim.leaseToken,
      operation: rebaseOperation("account_rebase_bonus", source.transitionRef)
    });
    assert.equal(requote.state, "completed");
    const [queuedAfterRebase] = store.listTransitions({ accountId: "account_rebase_bonus" })
      .filter((transition) => transition.transitionRef === queued.transitionRef);
    assert.equal(queuedAfterRebase.state, "requote_required");
    assert.equal(queuedAfterRebase.safeCode, "bonus_expires_before_activation");
    assert.equal(reservationParticipant.readReservation(queued.reservationRef).state, "released");
  } finally {
    database.close();
  }
});

test("a settled effect safely rebases reserved scheduled switches without changing immutable purchase inputs", () => {
  const database = createFoundation();
  try {
    seedOffer(database, YEARLY);
    seedOffer(database, MONTHLY_100);
    seedAccount(database, "account_rebase");
    const reservationParticipant = createTestReservationParticipant(database);
    const clock = { value: "2030-04-01T00:00:00.000Z" };
    const store = createDeferredStore(database, clock, reservationParticipant);
    seedResourceChain(database, {
      accountId: "account_rebase",
      entitlementId: "entitlement_old",
      requestId: "request_old",
      issuedLinkId: "link_old",
      validUntil: "2030-04-01T00:00:00.000Z"
    });
    reservationParticipant.seedFunding({
      accountId: "account_rebase",
      orderRef: "deferred_order_source",
      amountUnits: YEARLY.baseCoinUnits
    });
    reservationParticipant.seedFunding({
      accountId: "account_rebase",
      orderRef: "deferred_order_queued",
      amountUnits: MONTHLY_100.baseCoinUnits
    });
    const chain = {
      flowKind: "scheduled_switch",
      expectedEntitlementId: "entitlement_old",
      expectedRequestId: "request_old",
      expectedIssuedLinkId: "link_old",
      expectedValidUntil: "2030-04-01T00:00:00.000Z"
    };
    const source = store.reserveTransition(reserveInput({
      accountId: "account_rebase",
      orderRef: "deferred_order_source",
      plan: YEARLY,
      scheduledFor: chain.expectedValidUntil,
      operationKey: "reserve_source",
      ...chain
    }));
    const queued = store.reserveTransition(reserveInput({
      accountId: "account_rebase",
      orderRef: "deferred_order_queued",
      plan: MONTHLY_100,
      scheduledFor: chain.expectedValidUntil,
      operationKey: "reserve_queued",
      ...chain
    }));
    const claim = store.claimNextDueTransition({ leaseMs: 60_000 });
    assert.equal(claim.transitionRef, source.transitionRef);
    database.prepare(`
      update platform_entitlements set status = 'expired' where id = ?
    `).run("entitlement_old");
    seedResourceChain(database, {
      accountId: "account_rebase",
      entitlementId: "entitlement_new",
      requestId: "request_new",
      issuedLinkId: "link_new",
      validUntil: "2031-04-01T00:00:00.000Z"
    });
    store.recordEffectApplied({
      transitionRef: claim.transitionRef,
      leaseGeneration: claim.leaseGeneration,
      leaseToken: claim.leaseToken,
      effectRef: "effect_rebase_source",
      successor: {
        entitlementId: "entitlement_new",
        requestId: "request_new",
        issuedLinkId: "link_new",
        validUntil: "2031-04-01T00:00:00.000Z"
      },
      operation: operation("account_rebase", "effect_rebase", "commerce_system")
    });
    store.settleTransition({
      transitionRef: claim.transitionRef,
      leaseGeneration: claim.leaseGeneration,
      leaseToken: claim.leaseToken,
      operation: operation("account_rebase", "settle_rebase", "commerce_system")
    });
    const rebaseClaim = store.claimNextPendingRebase({ leaseMs: 60_000 });
    const completed = store.applyClaimedRebase({
      settledTransitionRef: rebaseClaim.settledTransitionRef,
      leaseGeneration: rebaseClaim.leaseGeneration,
      leaseToken: rebaseClaim.leaseToken,
      operation: rebaseOperation("account_rebase", source.transitionRef)
    });
    assert.equal(completed.state, "completed");
    const [queuedAfterRebase] = store.listTransitions({ accountId: "account_rebase" })
      .filter((transition) => transition.transitionRef === queued.transitionRef);
    assert.equal(queuedAfterRebase.scheduledFor, "2031-04-01T00:00:00.000Z");
    assert.equal(queuedAfterRebase.rebaseGeneration, 1);
    assert.equal(queuedAfterRebase.amountUnits, MONTHLY_100.baseCoinUnits);
  } finally {
    database.close();
  }
});

test("settle atomically creates a rebase outbox and blocks the account through pending, processing, and reconciliation", () => {
  const database = createFoundation();
  try {
    for (const plan of [YEARLY, MONTHLY_100]) seedOffer(database, plan);
    const accountId = "account_rebase_blocker";
    const clock = { value: "2030-07-01T00:00:00.000Z" };
    seedAccount(database, accountId);
    seedResourceChain(database, {
      accountId,
      entitlementId: "entitlement_blocker_old",
      requestId: "request_blocker_old",
      issuedLinkId: "link_blocker_old",
      validUntil: clock.value
    });
    const reservationParticipant = createTestReservationParticipant(database);
    const store = createDeferredStore(database, clock, reservationParticipant);
    reservationParticipant.seedFunding({
      accountId,
      orderRef: "deferred_order_blocker_source",
      amountUnits: YEARLY.baseCoinUnits
    });
    reservationParticipant.seedFunding({
      accountId,
      orderRef: "deferred_order_blocker_queued",
      amountUnits: MONTHLY_100.baseCoinUnits
    });
    reservationParticipant.seedFunding({
      accountId,
      orderRef: "deferred_order_blocker_new",
      amountUnits: MONTHLY_100.baseCoinUnits
    });
    const predecessor = {
      flowKind: "scheduled_switch",
      expectedEntitlementId: "entitlement_blocker_old",
      expectedRequestId: "request_blocker_old",
      expectedIssuedLinkId: "link_blocker_old",
      expectedValidUntil: clock.value
    };
    const source = store.reserveTransition(reserveInput({
      accountId,
      orderRef: "deferred_order_blocker_source",
      plan: YEARLY,
      scheduledFor: clock.value,
      operationKey: "reserve_blocker_source",
      ...predecessor
    }));
    store.reserveTransition(reserveInput({
      accountId,
      orderRef: "deferred_order_blocker_queued",
      plan: MONTHLY_100,
      scheduledFor: clock.value,
      operationKey: "reserve_blocker_queued",
      ...predecessor
    }));
    const claim = store.claimNextDueTransition({ leaseMs: 60_000 });
    assert.equal(claim.transitionRef, source.transitionRef);
    database.prepare("update platform_entitlements set status = 'expired' where id = ?")
      .run("entitlement_blocker_old");
    const successor = seedEffectSuccessor(
      database,
      accountId,
      "blocker_new",
      "2031-07-01T00:00:00.000Z"
    );
    store.recordEffectApplied({
      transitionRef: claim.transitionRef,
      leaseGeneration: claim.leaseGeneration,
      leaseToken: claim.leaseToken,
      effectRef: "effect_blocker_source",
      successor,
      operation: operation(accountId, "record_blocker", "commerce_system")
    });
    const settled = store.settleTransition({
      transitionRef: claim.transitionRef,
      leaseGeneration: claim.leaseGeneration,
      leaseToken: claim.leaseToken,
      operation: operation(accountId, "settle_blocker", "commerce_system")
    });
    assert.equal(settled.state, "settled");
    assert.deepEqual(database.prepare(`
      select state, account_id as accountId, effect_ref as effectRef,
             effect_entitlement_id as entitlementId,
             effect_request_id as requestId,
             effect_issued_link_id as issuedLinkId,
             effect_valid_until as validUntil
        from platform_deferred_resource_transition_rebases
       where settled_transition_ref = ?
    `).get(source.transitionRef), {
      state: "pending",
      accountId,
      effectRef: "effect_blocker_source",
      ...successor
    });
    const blockedReservation = () => store.reserveTransition(reserveInput({
      accountId,
      orderRef: "deferred_order_blocker_new",
      plan: MONTHLY_100,
      scheduledFor: successor.validUntil,
      operationKey: "reserve_blocker_new",
      flowKind: "scheduled_switch",
      expectedEntitlementId: successor.entitlementId,
      expectedRequestId: successor.requestId,
      expectedIssuedLinkId: successor.issuedLinkId,
      expectedValidUntil: successor.validUntil
    }));
    assert.equal(store.claimNextDueTransition({ leaseMs: 60_000 }), null);
    assert.throws(blockedReservation, (error) => error?.code === "deferred_transition_account_conflict");

    const rebaseClaim = store.claimNextPendingRebase({ leaseMs: 60_000 });
    assert.equal(rebaseClaim.settledTransitionRef, source.transitionRef);
    assert.deepEqual(rebaseClaim.successor, successor);
    assert.equal(store.claimNextDueTransition({ leaseMs: 60_000 }), null);
    assert.throws(blockedReservation, (error) => error?.code === "deferred_transition_account_conflict");

    const reconciled = store.reconcileRebase({
      settledTransitionRef: rebaseClaim.settledTransitionRef,
      leaseGeneration: rebaseClaim.leaseGeneration,
      leaseToken: rebaseClaim.leaseToken,
      safeCode: "deferred_rebase_binding_invalid",
      operation: rebaseOperation(accountId, source.transitionRef, "reconcile")
    });
    assert.equal(reconciled.state, "reconciliation_required");
    assert.equal(reconciled.safeCode, "deferred_rebase_binding_invalid");
    assert.equal(store.claimNextDueTransition({ leaseMs: 60_000 }), null);
    assert.equal(store.claimNextPendingRebase({ leaseMs: 60_000 }), null);
    assert.throws(blockedReservation, (error) => error?.code === "deferred_transition_account_conflict");
  } finally {
    database.close();
  }
});

test("a rebase outbox recovers its lease and completes exactly once with a stable settled-transition key", () => {
  const database = createFoundation();
  try {
    for (const plan of [YEARLY, MONTHLY_100]) seedOffer(database, plan);
    const accountId = "account_rebase_recovery";
    const clock = { value: "2030-08-01T00:00:00.000Z" };
    seedAccount(database, accountId);
    seedResourceChain(database, {
      accountId,
      entitlementId: "entitlement_recovery_old",
      requestId: "request_recovery_old",
      issuedLinkId: "link_recovery_old",
      validUntil: clock.value
    });
    const reservationParticipant = createTestReservationParticipant(database);
    const store = createDeferredStore(database, clock, reservationParticipant);
    reservationParticipant.seedFunding({
      accountId,
      orderRef: "deferred_order_recovery_source",
      amountUnits: YEARLY.baseCoinUnits
    });
    reservationParticipant.seedFunding({
      accountId,
      orderRef: "deferred_order_recovery_queued",
      amountUnits: MONTHLY_100.baseCoinUnits
    });
    const predecessor = {
      flowKind: "scheduled_switch",
      expectedEntitlementId: "entitlement_recovery_old",
      expectedRequestId: "request_recovery_old",
      expectedIssuedLinkId: "link_recovery_old",
      expectedValidUntil: clock.value
    };
    const source = store.reserveTransition(reserveInput({
      accountId,
      orderRef: "deferred_order_recovery_source",
      plan: YEARLY,
      scheduledFor: clock.value,
      operationKey: "reserve_recovery_source",
      ...predecessor
    }));
    const queued = store.reserveTransition(reserveInput({
      accountId,
      orderRef: "deferred_order_recovery_queued",
      plan: MONTHLY_100,
      scheduledFor: clock.value,
      operationKey: "reserve_recovery_queued",
      ...predecessor
    }));
    const transitionClaim = store.claimNextDueTransition({ leaseMs: 60_000 });
    database.prepare("update platform_entitlements set status = 'expired' where id = ?")
      .run("entitlement_recovery_old");
    const successor = seedEffectSuccessor(
      database,
      accountId,
      "recovery_new",
      "2031-08-01T00:00:00.000Z"
    );
    store.recordEffectApplied({
      transitionRef: transitionClaim.transitionRef,
      leaseGeneration: transitionClaim.leaseGeneration,
      leaseToken: transitionClaim.leaseToken,
      effectRef: "effect_recovery_source",
      successor,
      operation: operation(accountId, "record_recovery", "commerce_system")
    });
    store.settleTransition({
      transitionRef: transitionClaim.transitionRef,
      leaseGeneration: transitionClaim.leaseGeneration,
      leaseToken: transitionClaim.leaseToken,
      operation: operation(accountId, "settle_recovery", "commerce_system")
    });
    const first = store.claimNextPendingRebase({ leaseMs: 60_000 });
    clock.value = "2030-08-01T00:01:01.000Z";
    const recovered = store.claimNextPendingRebase({ leaseMs: 60_000 });
    assert.equal(recovered.settledTransitionRef, source.transitionRef);
    assert.equal(recovered.leaseGeneration, first.leaseGeneration + 1);
    assert.throws(() => store.completeRebase({
      settledTransitionRef: first.settledTransitionRef,
      leaseGeneration: first.leaseGeneration,
      leaseToken: first.leaseToken,
      operation: rebaseOperation(accountId, source.transitionRef)
    }), (error) => error?.code === "deferred_transition_lease_lost");
    assert.throws(() => store.completeRebase({
      settledTransitionRef: recovered.settledTransitionRef,
      leaseGeneration: recovered.leaseGeneration,
      leaseToken: recovered.leaseToken,
      operation: operation(
        accountId,
        `deferred_rebase_apply_${source.transitionRef}_${recovered.leaseGeneration}`,
        "commerce_system"
      )
    }), (error) => error?.code === "deferred_transition_invalid_input");
    const completed = store.completeRebase({
      settledTransitionRef: recovered.settledTransitionRef,
      leaseGeneration: recovered.leaseGeneration,
      leaseToken: recovered.leaseToken,
      operation: rebaseOperation(accountId, source.transitionRef)
    });
    assert.equal(completed.state, "completed");
    const replay = store.completeRebase({
      settledTransitionRef: recovered.settledTransitionRef,
      leaseGeneration: recovered.leaseGeneration,
      leaseToken: recovered.leaseToken,
      operation: rebaseOperation(accountId, source.transitionRef)
    });
    assert.deepEqual(replay, completed);
    const [queuedAfterRebase] = store.listTransitions({ accountId })
      .filter((transition) => transition.transitionRef === queued.transitionRef);
    assert.equal(queuedAfterRebase.scheduledFor, successor.validUntil);
    assert.equal(queuedAfterRebase.rebaseGeneration, 1);
    assert.equal(database.prepare(`
      select count(*) from platform_deferred_resource_transition_events
       where transition_ref = ? and event_type = 'transition_rebased'
    `).pluck().get(queued.transitionRef), 1);
  } finally {
    database.close();
  }
});

test("future-only account and exact-chain guards reject legacy, residual, and ambiguous resource models before reservation", () => {
  const database = createFoundation();
  try {
    seedOffer(database, MONTHLY_50);
    const clock = { value: "2030-09-01T00:00:00.000Z" };
    const reservationParticipant = createTestReservationParticipant(database);
    const store = createDeferredStore(database, clock, reservationParticipant);

    seedAccount(database, "account_legacy", { metadata: {} });
    reservationParticipant.seedFunding({
      accountId: "account_legacy",
      orderRef: "deferred_order_legacy",
      amountUnits: MONTHLY_50.baseCoinUnits
    });
    assert.throws(() => store.reserveTransition(reserveInput({
      accountId: "account_legacy",
      orderRef: "deferred_order_legacy",
      plan: MONTHLY_50,
      scheduledFor: clock.value,
      operationKey: "reserve_legacy"
    })), (error) => error?.code === "deferred_transition_account_not_eligible");

    seedAccount(database, "account_residual");
    seedResourceChain(database, {
      accountId: "account_residual",
      entitlementId: "entitlement_residual",
      requestId: "request_residual",
      issuedLinkId: "link_residual",
      validUntil: "2029-09-01T00:00:00.000Z"
    });
    reservationParticipant.seedFunding({
      accountId: "account_residual",
      orderRef: "deferred_order_residual",
      amountUnits: MONTHLY_50.baseCoinUnits
    });
    assert.throws(() => store.reserveTransition(reserveInput({
      accountId: "account_residual",
      orderRef: "deferred_order_residual",
      plan: MONTHLY_50,
      scheduledFor: clock.value,
      operationKey: "reserve_residual"
    })), (error) => error?.code === "deferred_transition_account_conflict");

    seedAccount(database, "account_ambiguous");
    seedResourceChain(database, {
      accountId: "account_ambiguous",
      entitlementId: "entitlement_ambiguous_primary",
      requestId: "request_ambiguous_primary",
      issuedLinkId: "link_ambiguous_primary",
      validUntil: "2030-10-01T00:00:00.000Z"
    });
    seedResourceChain(database, {
      accountId: "account_ambiguous",
      entitlementId: "entitlement_ambiguous_side",
      requestId: "request_ambiguous_side",
      issuedLinkId: "link_ambiguous_side",
      validUntil: "2030-10-01T00:00:00.000Z"
    });
    reservationParticipant.seedFunding({
      accountId: "account_ambiguous",
      orderRef: "deferred_order_ambiguous",
      amountUnits: MONTHLY_50.baseCoinUnits
    });
    assert.throws(() => store.reserveTransition(reserveInput({
      accountId: "account_ambiguous",
      orderRef: "deferred_order_ambiguous",
      plan: MONTHLY_50,
      scheduledFor: "2030-10-01T00:00:00.000Z",
      operationKey: "reserve_ambiguous",
      flowKind: "scheduled_switch",
      expectedEntitlementId: "entitlement_ambiguous_primary",
      expectedRequestId: "request_ambiguous_primary",
      expectedIssuedLinkId: "link_ambiguous_primary",
      expectedValidUntil: "2030-10-01T00:00:00.000Z"
    })), (error) => error?.code === "deferred_transition_expected_chain_invalid");
    for (const accountId of ["account_legacy", "account_residual", "account_ambiguous"]) {
      assert.equal(database.prepare(`
        select count(*) from platform_deferred_resource_transitions where account_id = ?
      `).pluck().get(accountId), 0);
      assert.equal(database.prepare(`
        select count(*) from ${RESERVATIONS_TABLE} where account_id = ?
      `).pluck().get(accountId), 0);
    }
  } finally {
    database.close();
  }
});


test("scheduled switch recovery crosses natural predecessor expiry only inside its reservation window", () => {
  const database = createFoundation();
  let store;
  try {
    const accountId = "account_scheduled_expiry_recovery";
    const validUntil = "2030-10-01T00:00:00.000Z";
    const recoveryNow = "2030-10-01T00:01:01.000Z";
    const recoveryEndsAt = "2030-10-02T00:00:00.000Z";
    const clock = { value: validUntil };
    seedOffer(database, MONTHLY_50);
    seedAccount(database, accountId);
    seedResourceChain(database, {
      accountId,
      entitlementId: "entitlement_scheduled_expiry",
      requestId: "request_scheduled_expiry",
      issuedLinkId: "link_scheduled_expiry",
      validUntil
    });
    const reservationParticipant = createTestReservationParticipant(database);
    reservationParticipant.seedFunding({
      accountId,
      orderRef: "deferred_order_scheduled_expiry",
      amountUnits: MONTHLY_50.baseCoinUnits
    });
    store = createDeferredStore(database, clock, reservationParticipant);
    const transition = store.reserveTransition(reserveInput({
      accountId,
      orderRef: "deferred_order_scheduled_expiry",
      plan: MONTHLY_50,
      scheduledFor: validUntil,
      operationKey: "reserve_scheduled_expiry",
      flowKind: "scheduled_switch",
      expectedEntitlementId: "entitlement_scheduled_expiry",
      expectedRequestId: "request_scheduled_expiry",
      expectedIssuedLinkId: "link_scheduled_expiry",
      expectedValidUntil: validUntil
    }));
    const firstClaim = store.claimNextDueTransition({ leaseMs: 60_000 });
    assert.equal(firstClaim.leaseGeneration, 1);

    clock.value = recoveryNow;
    const recoveredClaim = store.claimNextDueTransition({ leaseMs: 60_000 });
    assert.equal(recoveredClaim.transitionRef, transition.transitionRef);
    assert.equal(recoveredClaim.leaseGeneration, 2);
    const verified = store.verifyClaimedTransitionReservation({
      transitionRef: recoveredClaim.transitionRef,
      leaseGeneration: recoveredClaim.leaseGeneration,
      leaseToken: recoveredClaim.leaseToken
    });
    assert.equal(verified.ok, true);
    assert.equal(verified.reservationRef, transition.reservationRef);
    assert.equal(verified.expiresAt, recoveryEndsAt);

    // At the inclusive recovery deadline the store releases the reservation
    // and requires a fresh quote before a coordinator can reach runtime work.
    clock.value = recoveryEndsAt;
    assert.equal(store.claimNextDueTransition({ leaseMs: 60_000 }), null);
    const [afterExpiry] = store.listTransitions({ accountId });
    assert.equal(afterExpiry.state, "requote_required");
    assert.equal(afterExpiry.safeCode, "deferred_reservation_expired_before_capture");
    assert.equal(
      reservationParticipant.readReservation(transition.reservationRef).state,
      "released"
    );
  } finally {
    store?.close();
    database.close();
  }
});
