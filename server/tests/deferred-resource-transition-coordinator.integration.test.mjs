import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
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
  createDeferredResourceTransitionCoordinator
} from "../services/platform/deferred-resource-transition-coordinator.mjs";
import {
  DEFERRED_RESOURCE_TRANSITION_MIGRATIONS,
  REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID,
  applyDeferredResourceTransitionMigrations
} from "../services/platform/deferred-resource-transition-migrations.mjs";
import {
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

const NOW = "2030-01-05T00:00:00.000Z";
const NEXT_UNTIL = "2030-02-04T00:00:00.000Z";
const PLAN = Object.freeze({
  offerVersionRef: "offerv_plan_30d_50gb_monthly_v1",
  durationDays: 30,
  monthlyTrafficGb: 50,
  baseCoinUnits: 20
});

function makeRefFactory(prefix) {
  const counts = new Map();
  return (kind) => {
    const next = (counts.get(kind) ?? 0) + 1;
    counts.set(kind, next);
    return `${prefix}_${kind}_${next}`;
  };
}

function makeLeaseTokenFactory(initialCount = 0) {
  let count = initialCount;
  return () => {
    count += 1;
    return count.toString(16).padStart(64, "0");
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

function createFoundation({ databasePath = ":memory:" } = {}) {
  const database = new Database(databasePath);
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
    nowFn: () => new Date(NOW)
  });
  applyCoinCommerceMigrations({
    database,
    expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(NOW)
  });
  applyDeferredResourceTransitionMigrations({
    database,
    expectedMigrationId: REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID,
    expectedDdlChecksum: DEFERRED_RESOURCE_TRANSITION_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(NOW)
  });
  return database;
}

function offerSnapshot() {
  return {
    offerRef: "offer_plan_30d_50gb_monthly_v1",
    offerVersionRef: PLAN.offerVersionRef,
    version: 1,
    category: "plan",
    title: { zh: "测试套餐", en: "Test plan" },
    summary: { zh: "测试套餐摘要", en: "Test plan summary" },
    importantNotices: {
      zh: ["仅用于平台自营订阅服务"],
      en: ["Platform subscription only"]
    },
    baseCoinUnits: PLAN.baseCoinUnits,
    referencePrice: { currency: "CNY", amountMinor: PLAN.baseCoinUnits * 100 },
    acceptedCoinTypes: ["paid_coins"],
    delivery: {
      kind: "subscription_plan",
      durationDays: PLAN.durationDays,
      monthlyTrafficGb: PLAN.monthlyTrafficGb,
      trafficGb: null,
      neverExpires: false,
      discountBasisPoints: 0
    }
  };
}

function seedAccount(database, accountId) {
  database.prepare(`
    insert into platform_accounts (id, owner_ref, status, created_at, updated_at, metadata_json)
    values (?, ?, 'active', ?, ?, ?)
  `).run(
    accountId,
    `owner_${accountId}`,
    NOW,
    NOW,
    JSON.stringify({ commercialModel: "wallet_first_unique_v1" })
  );
}

function bindingRef(prefix, value) {
  return `${prefix}ref_${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

function seedOffer(database) {
  const offer = offerSnapshot();
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
    NOW,
    NOW
  );
}

function creditPaidCoins(database, accountId, amountUnits = PLAN.baseCoinUnits) {
  const walletStore = createSqliteCoinWalletStore({
    database,
    nowFn: () => new Date(NOW),
    refFactory: makeRefFactory("coordinator_credit")
  });
  try {
    walletStore.creditCoins({
      accountId,
      coinType: "paid_coins",
      amountUnits,
      availability: "available",
      sourceType: "coordinator_integration_credit",
      sourceRef: `credit_${accountId}`,
      sourceDigest: "a".repeat(64),
      policyRef: null,
      policyVersion: null,
      expiresAt: null,
      operation: operation(accountId, "credit_for_coordinator")
    });
  } finally {
    walletStore.close();
  }
}

function seedResourceChain(database, accountId, {
  entitlementId,
  requestId,
  issuedLinkId,
  validFrom = NOW,
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

function seedEffectSuccessor(database, accountId, {
  suffix = "integration",
  validUntil = NEXT_UNTIL
} = {}) {
  const successor = Object.freeze({
    entitlementId: `effect_entitlement_${suffix}`,
    requestId: `effect_request_${suffix}`,
    issuedLinkId: `effect_link_${suffix}`,
    validUntil
  });
  seedResourceChain(database, accountId, successor);
  return successor;
}

function reserveScheduledSwitch(store, {
  accountId,
  orderRef,
  chain,
  operationKey
}) {
  return store.reserveTransition({
    accountId,
    orderRef,
    offerVersionRef: PLAN.offerVersionRef,
    flowKind: "scheduled_switch",
    amountUnits: PLAN.baseCoinUnits,
    offerSnapshot: offerSnapshot(),
    scheduledFor: chain.validUntil,
    expectedEntitlementId: chain.entitlementId,
    expectedRequestId: chain.requestId,
    expectedIssuedLinkId: chain.issuedLinkId,
    expectedValidUntil: chain.validUntil,
    operation: operation(accountId, operationKey)
  });
}

function coordinatorOperation(accountId, idempotencyKey) {
  return {
    actorScope: `deferred:${accountId}`,
    idempotencyKey,
    actorType: "commerce_system",
    actorRef: "deferred_resource_transition_coordinator"
  };
}

test("coordinator composes with the concrete wallet reservation participant inside store transactions", async () => {
  const database = createFoundation();
  let store;
  try {
    const accountId = "account_coordinator_integration";
    const clock = { value: NOW };
    seedAccount(database, accountId);
    seedOffer(database);
    creditPaidCoins(database, accountId);
    store = createSqliteDeferredResourceTransitionStore({
      database,
      nowFn: () => new Date(clock.value),
      refFactory: makeRefFactory("coordinator_transition"),
      leaseTokenFactory: makeLeaseTokenFactory()
    });
    const reserved = store.reserveTransition({
      accountId,
      orderRef: "order_coordinator_integration",
      offerVersionRef: PLAN.offerVersionRef,
      flowKind: "initial_activation",
      amountUnits: PLAN.baseCoinUnits,
      offerSnapshot: offerSnapshot(),
      scheduledFor: NOW,
      expectedEntitlementId: null,
      expectedRequestId: null,
      expectedIssuedLinkId: null,
      expectedValidUntil: null,
      operation: operation(accountId, "reserve_for_coordinator")
    });
    const successor = seedEffectSuccessor(database, accountId);
    let applyCalls = 0;
    const coordinator = createDeferredResourceTransitionCoordinator({
      store,
      nowFn: () => new Date(clock.value),
      resourceEffectHandler: {
        idempotencyContract: "deduplicate_by_transition_ref",
        revalidateDeferredResourceTransition() {
          return { status: "ready" };
        },
        resolveDeferredResourceTransitionEffect() {
          return null;
        },
        applyDeferredResourceTransition() {
          applyCalls += 1;
          return {
            status: "applied",
            effectRef: "effect_coordinator_integration",
            nextEntitlementId: successor.entitlementId,
            nextRequestId: successor.requestId,
            nextIssuedLinkId: successor.issuedLinkId,
            nextValidUntil: successor.validUntil
          };
        }
      },
      leaseMs: 60_000,
      batchSize: 5,
      pollIntervalMs: 60_000
    });

    const result = await coordinator.runOnce();

    assert.deepEqual(result, {
      claimed: 1,
      requoteRequired: 0,
      effectApplied: 1,
      settled: 1,
      rebased: 0,
      rebasePending: 0,
      reconciliationRequired: 0
    });
    assert.equal(applyCalls, 1);
    assert.deepEqual(store.listTransitions({ accountId }), [{
      transitionRef: reserved.transitionRef,
      orderRef: "order_coordinator_integration",
      reservationRef: reserved.reservationRef,
      offer: offerSnapshot(),
      amountUnits: PLAN.baseCoinUnits,
      flowKind: "initial_activation",
      planRank: 1,
      scheduledFor: NOW,
      expectedValidUntil: null,
      state: "settled",
      rebaseGeneration: 0,
      effectRef: "effect_coordinator_integration",
      safeCode: null,
      reservedAt: NOW,
      settledAt: NOW,
      createdAt: NOW,
      updatedAt: NOW
    }]);
    assert.deepEqual(database.prepare(`
      select available_units, held_units, consumed_units, expired_units
        from platform_coin_lots
    `).get(), {
      available_units: 0,
      held_units: 0,
      consumed_units: PLAN.baseCoinUnits,
      expired_units: 0
    });
    assert.equal(database.prepare(`
      select state from platform_deferred_resource_transition_rebases
       where settled_transition_ref = ?
    `).pluck().get(reserved.transitionRef), "pending");
    const drained = await coordinator.runOnce();
    assert.deepEqual(drained, {
      claimed: 0,
      requoteRequired: 0,
      effectApplied: 0,
      settled: 0,
      rebased: 1,
      rebasePending: 0,
      reconciliationRequired: 0
    });
    assert.equal(applyCalls, 1);
    assert.equal(database.prepare(`
      select state from platform_deferred_resource_transition_rebases
       where settled_transition_ref = ?
    `).pluck().get(reserved.transitionRef), "completed");
    assert.deepEqual(database.prepare(`
      select effect_entitlement_id, effect_request_id,
             effect_issued_link_id, effect_valid_until
        from platform_deferred_resource_transitions
       where transition_ref = ?
    `).get(reserved.transitionRef), {
      effect_entitlement_id: successor.entitlementId,
      effect_request_id: successor.requestId,
      effect_issued_link_id: successor.issuedLinkId,
      effect_valid_until: successor.validUntil
    });
  } finally {
    store?.close();
    database.close();
  }
});

test("a restart after durable effect recording captures from the store receipt without invoking a resource effect twice", async () => {
  const database = createFoundation();
  let store;
  try {
    const accountId = "account_coordinator_effect_recovery";
    const clock = { value: NOW };
    seedAccount(database, accountId);
    seedOffer(database);
    creditPaidCoins(database, accountId);
    store = createSqliteDeferredResourceTransitionStore({
      database,
      nowFn: () => new Date(clock.value),
      refFactory: makeRefFactory("coordinator_recovery_transition"),
      leaseTokenFactory: makeLeaseTokenFactory()
    });
    const reserved = store.reserveTransition({
      accountId,
      orderRef: "order_coordinator_effect_recovery",
      offerVersionRef: PLAN.offerVersionRef,
      flowKind: "initial_activation",
      amountUnits: PLAN.baseCoinUnits,
      offerSnapshot: offerSnapshot(),
      scheduledFor: NOW,
      expectedEntitlementId: null,
      expectedRequestId: null,
      expectedIssuedLinkId: null,
      expectedValidUntil: null,
      operation: operation(accountId, "reserve_for_effect_recovery")
    });
    const successor = seedEffectSuccessor(database, accountId);
    const claimed = store.claimNextDueTransition({ leaseMs: 60_000 });
    store.recordEffectApplied({
      transitionRef: claimed.transitionRef,
      leaseGeneration: claimed.leaseGeneration,
      leaseToken: claimed.leaseToken,
      effectRef: "effect_coordinator_effect_recovery",
      successor,
      operation: {
        actorScope: `deferred:${accountId}`,
        idempotencyKey: "record_before_crash",
        actorType: "commerce_system",
        actorRef: "test_crash_boundary"
      }
    });
    // Simulate a process crash between the durable effect receipt and capture.
    store.close();
    clock.value = "2030-01-05T00:01:01.000Z";
    store = createSqliteDeferredResourceTransitionStore({
      database,
      nowFn: () => new Date(clock.value),
      refFactory: makeRefFactory("coordinator_recovery_restart"),
      leaseTokenFactory: makeLeaseTokenFactory()
    });
    const handlerCalls = [];
    const coordinator = createDeferredResourceTransitionCoordinator({
      store,
      nowFn: () => new Date(clock.value),
      resourceEffectHandler: {
        idempotencyContract: "deduplicate_by_transition_ref",
        revalidateDeferredResourceTransition() {
          handlerCalls.push("revalidate");
          throw new Error("recovery must not revalidate a durable effect receipt");
        },
        resolveDeferredResourceTransitionEffect() {
          handlerCalls.push("resolve");
          throw new Error("recovery must not rediscover a durable effect receipt");
        },
        applyDeferredResourceTransition() {
          handlerCalls.push("apply");
          throw new Error("recovery must never replay the resource effect");
        }
      },
      leaseMs: 60_000,
      batchSize: 5,
      pollIntervalMs: 60_000
    });

    const result = await coordinator.runOnce();

    assert.deepEqual(result, {
      claimed: 1,
      requoteRequired: 0,
      effectApplied: 0,
      settled: 1,
      rebased: 1,
      rebasePending: 0,
      reconciliationRequired: 0
    });
    assert.deepEqual(handlerCalls, []);
    assert.equal(store.listTransitions({ accountId })[0].state, "settled");
    assert.equal(database.prepare(`
      select state
        from platform_deferred_resource_transition_reservations
       where reservation_ref = ?
    `).pluck().get(reserved.reservationRef), "captured");
    assert.equal(database.prepare(`
      select state
        from platform_deferred_resource_transition_rebases
       where settled_transition_ref = ?
    `).pluck().get(reserved.transitionRef), "completed");
  } finally {
    store?.close();
    database.close();
  }
});

test("a crashed rebase lease is reclaimed durably, and replay after an atomic apply uses the same settled-transition key", async () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "deferred-coordinator-"));
  const databasePath = join(temporaryDirectory, "rebase-reclaim.sqlite");
  let database;
  let store;
  try {
    database = createFoundation({ databasePath });
    const accountId = "account_coordinator_rebase_reclaim";
    const clock = { value: NOW };
    seedAccount(database, accountId);
    seedOffer(database);
    creditPaidCoins(database, accountId, PLAN.baseCoinUnits * 2);
    const predecessor = {
      entitlementId: "entitlement_rebase_predecessor",
      requestId: "request_rebase_predecessor",
      issuedLinkId: "link_rebase_predecessor",
      validUntil: NOW
    };
    seedResourceChain(database, accountId, predecessor);
    store = createSqliteDeferredResourceTransitionStore({
      database,
      nowFn: () => new Date(clock.value),
      refFactory: makeRefFactory("coordinator_rebase_reclaim"),
      leaseTokenFactory: makeLeaseTokenFactory()
    });
    const source = reserveScheduledSwitch(store, {
      accountId,
      orderRef: "order_rebase_source",
      chain: predecessor,
      operationKey: "reserve_rebase_source"
    });
    const queued = reserveScheduledSwitch(store, {
      accountId,
      orderRef: "order_rebase_queued",
      chain: predecessor,
      operationKey: "reserve_rebase_queued"
    });
    const claimed = store.claimNextDueTransition({ leaseMs: 60_000 });
    assert.equal(claimed.transitionRef, source.transitionRef);
    database.prepare(`
      update platform_entitlements set status = 'superseded' where id = ?
    `).run(predecessor.entitlementId);
    const successor = seedEffectSuccessor(database, accountId, {
      suffix: "rebase_successor",
      validUntil: "2030-02-05T00:00:00.000Z"
    });
    store.recordEffectApplied({
      transitionRef: claimed.transitionRef,
      leaseGeneration: claimed.leaseGeneration,
      leaseToken: claimed.leaseToken,
      effectRef: "effect_rebase_reclaim",
      successor,
      operation: coordinatorOperation(accountId, "record_rebase_reclaim")
    });
    store.settleTransition({
      transitionRef: claimed.transitionRef,
      leaseGeneration: claimed.leaseGeneration,
      leaseToken: claimed.leaseToken,
      operation: coordinatorOperation(accountId, "settle_rebase_reclaim")
    });
    const abandoned = store.claimNextPendingRebase({ leaseMs: 60_000 });
    assert.equal(abandoned.settledTransitionRef, source.transitionRef);

    // Worker A dies after leasing but before its atomic apply/complete call.
    clock.value = "2030-01-05T00:01:01.000Z";
    store.close();
    database.close();
    database = new Database(databasePath);
    database.pragma("foreign_keys = ON");
    store = createSqliteDeferredResourceTransitionStore({
      database,
      nowFn: () => new Date(clock.value),
      refFactory: makeRefFactory("coordinator_rebase_reclaim_restart"),
      leaseTokenFactory: makeLeaseTokenFactory(16)
    });
    const handlerCalls = [];
    const coordinator = createDeferredResourceTransitionCoordinator({
      store,
      nowFn: () => new Date(clock.value),
      resourceEffectHandler: {
        idempotencyContract: "deduplicate_by_transition_ref",
        revalidateDeferredResourceTransition() {
          handlerCalls.push("revalidate");
          throw new Error("a rebase reclaim must not run a resource effect");
        },
        resolveDeferredResourceTransitionEffect() {
          handlerCalls.push("resolve");
          throw new Error("a rebase reclaim must not look up an effect");
        },
        applyDeferredResourceTransition() {
          handlerCalls.push("apply");
          throw new Error("a rebase reclaim must not replay a resource effect");
        }
      },
      leaseMs: 60_000,
      batchSize: 5,
      pollIntervalMs: 60_000
    });

    const result = await coordinator.runOnce();

    assert.deepEqual(result, {
      claimed: 0,
      requoteRequired: 0,
      effectApplied: 0,
      settled: 0,
      rebased: 1,
      rebasePending: 0,
      reconciliationRequired: 0
    });
    assert.deepEqual(handlerCalls, []);
    assert.equal(database.prepare(`
      select state from platform_deferred_resource_transition_rebases
       where settled_transition_ref = ?
    `).pluck().get(source.transitionRef), "completed");
    assert.deepEqual(database.prepare(`
      select scheduled_for, expected_entitlement_id, expected_request_id,
             expected_issued_link_id, expected_valid_until, rebase_generation
        from platform_deferred_resource_transitions
       where transition_ref = ?
    `).get(queued.transitionRef), {
      scheduled_for: successor.validUntil,
      expected_entitlement_id: successor.entitlementId,
      expected_request_id: successor.requestId,
      expected_issued_link_id: successor.issuedLinkId,
      expected_valid_until: successor.validUntil,
      rebase_generation: 1
    });

    // The apply transaction couples all rebases with completed. A lost reply
    // is therefore replayed by its settled-transition operation key, not by a
    // lease-specific key, and cannot produce a second rebase generation.
    const replay = store.applyClaimedRebase({
      settledTransitionRef: abandoned.settledTransitionRef,
      leaseGeneration: abandoned.leaseGeneration,
      leaseToken: abandoned.leaseToken,
      operation: coordinatorOperation(
        accountId,
        `deferred_rebase_apply_${source.transitionRef}`
      )
    });
    assert.equal(replay.state, "completed");
    assert.equal(database.prepare(`
      select rebase_generation from platform_deferred_resource_transitions
       where transition_ref = ?
    `).pluck().get(queued.transitionRef), 1);
  } finally {
    store?.close();
    database?.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("a processing durable rebase outbox blocks an otherwise due transition until its owner releases or completes it", async () => {
  const database = createFoundation();
  let store;
  try {
    const accountId = "account_coordinator_rebase_blocker";
    const clock = { value: NOW };
    seedAccount(database, accountId);
    seedOffer(database);
    creditPaidCoins(database, accountId, PLAN.baseCoinUnits * 2);
    const predecessor = {
      entitlementId: "entitlement_rebase_blocker_predecessor",
      requestId: "request_rebase_blocker_predecessor",
      issuedLinkId: "link_rebase_blocker_predecessor",
      validUntil: NOW
    };
    seedResourceChain(database, accountId, predecessor);
    store = createSqliteDeferredResourceTransitionStore({
      database,
      nowFn: () => new Date(clock.value),
      refFactory: makeRefFactory("coordinator_rebase_blocker"),
      leaseTokenFactory: makeLeaseTokenFactory()
    });
    const source = reserveScheduledSwitch(store, {
      accountId,
      orderRef: "order_blocker_source",
      chain: predecessor,
      operationKey: "reserve_blocker_source"
    });
    const queued = reserveScheduledSwitch(store, {
      accountId,
      orderRef: "order_blocker_queued",
      chain: predecessor,
      operationKey: "reserve_blocker_queued"
    });
    const claimed = store.claimNextDueTransition({ leaseMs: 60_000 });
    assert.equal(claimed.transitionRef, source.transitionRef);
    database.prepare(`
      update platform_entitlements set status = 'superseded' where id = ?
    `).run(predecessor.entitlementId);
    const successor = seedEffectSuccessor(database, accountId, {
      suffix: "rebase_blocker_successor",
      validUntil: "2030-02-05T00:00:00.000Z"
    });
    store.recordEffectApplied({
      transitionRef: claimed.transitionRef,
      leaseGeneration: claimed.leaseGeneration,
      leaseToken: claimed.leaseToken,
      effectRef: "effect_rebase_blocker",
      successor,
      operation: coordinatorOperation(accountId, "record_rebase_blocker")
    });
    store.settleTransition({
      transitionRef: claimed.transitionRef,
      leaseGeneration: claimed.leaseGeneration,
      leaseToken: claimed.leaseToken,
      operation: coordinatorOperation(accountId, "settle_rebase_blocker")
    });
    const otherWorker = store.claimNextPendingRebase({ leaseMs: 60_000 });
    assert.equal(otherWorker.settledTransitionRef, source.transitionRef);
    let applyCalls = 0;
    const coordinator = createDeferredResourceTransitionCoordinator({
      store,
      nowFn: () => new Date(clock.value),
      resourceEffectHandler: {
        idempotencyContract: "deduplicate_by_transition_ref",
        revalidateDeferredResourceTransition() {
          applyCalls += 1;
          return { status: "ready" };
        },
        resolveDeferredResourceTransitionEffect() {
          applyCalls += 1;
          return null;
        },
        applyDeferredResourceTransition() {
          applyCalls += 1;
          return {
            status: "applied",
            effectRef: "effect_must_not_run",
            nextEntitlementId: successor.entitlementId,
            nextRequestId: successor.requestId,
            nextIssuedLinkId: successor.issuedLinkId,
            nextValidUntil: successor.validUntil
          };
        }
      },
      leaseMs: 60_000,
      batchSize: 5,
      pollIntervalMs: 60_000
    });

    const result = await coordinator.runOnce();

    assert.deepEqual(result, {
      claimed: 0,
      requoteRequired: 0,
      effectApplied: 0,
      settled: 0,
      rebased: 0,
      rebasePending: 0,
      reconciliationRequired: 0
    });
    assert.equal(applyCalls, 0);
    assert.deepEqual(database.prepare(`
      select state, expected_entitlement_id, rebase_generation
        from platform_deferred_resource_transitions
       where transition_ref = ?
    `).get(queued.transitionRef), {
      state: "reserved",
      expected_entitlement_id: predecessor.entitlementId,
      rebase_generation: 0
    });
  } finally {
    store?.close();
    database.close();
  }
});
