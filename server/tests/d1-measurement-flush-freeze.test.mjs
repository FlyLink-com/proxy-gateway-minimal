// D1 Card 9 — U-F11 measurement-flush freeze tests (J1–J5).
//
// Acceptance A1–A7 from decisions/D3_UF11_MEASUREMENT_FLUSH_RULING_2026-11-23.md:
// frozen (and D1-active) flushes must not write; the freeze drain
// records the discarded count; unfreeze restores flushing without
// backfilling; a missing or damaged authority record fails closed.
// All fixtures are synthetic. No production data, no real credential
// material, no network, no E4/D1 calls.
//
// Fixture style follows platform-ads-conversion-transaction.test.mjs
// (initial-confirmation participant): an in-memory database, fixed
// clocks, synthetic seeds only. The flush's write signal is the
// outbox row the committed confirmation flow produces (a no-click
// skip row); no Ads click or consent is needed for that signal.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import Database from "better-sqlite3";

import * as commerce from "../services/platform/coin-commerce-store.mjs";
import * as coinCommerceSchema from "../services/platform/coin-commerce-migrations.mjs";
import {
  applyCoinCommerceMigrations,
  COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID,
} from "../services/platform/coin-commerce-migrations.mjs";
import {
  applyCoinWalletMigrations,
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
} from "../services/platform/coin-wallet-migrations.mjs";
import { COIN_COMMERCE_PRODUCTION_OFFERS } from "../services/platform/coin-commerce-production-catalog.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import {
  ensureWriterAuthority,
  readWriterAuthority,
  transitionWriterAuthority,
} from "../services/platform/single-writer-authority.mjs";
import {
  buildWriteLockReceipt,
  buildSchedulerQuiescenceReceipt,
  buildCallbackDrainReceipt,
  buildHwmCompletenessReceipt,
  buildFreezeReadinessBundle,
  SCHEDULER_JOBS,
  UNFENCED_WRITER_BASELINE,
} from "../services/platform/d1-stage2-freeze-drain.mjs";
import {
  buildWriterCoverageMatrix,
  createDrainTracker,
  createFreezeDrainCoordinator,
} from "../services/platform/d1-card9-freeze-drain-coordinator.mjs";

const FLAG = "ADS_CLICK_BINDING_ENABLED";
const SNAPSHOT = "s2s-measurement-flush-001";
const CHECKPOINT = "s2s-checkpoint-measurement-001";
const LEGACY_NOW = "2026-07-30T00:00:00.000Z";
const LEGACY_ACCOUNT = "acct_ads_tx";
const LEGACY_OFFER = COIN_COMMERCE_PRODUCTION_OFFERS[0];

function withFlag(enabled, fn) {
  const previous = process.env[FLAG];
  if (enabled) process.env[FLAG] = "true";
  else delete process.env[FLAG];
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env[FLAG];
    else process.env[FLAG] = previous;
  }
}

function makeClock() {
  let nowMs = Date.parse("2026-11-21T00:00:00.000Z");
  const now = () => new Date(nowMs);
  return {
    now,
    advance(ms) { nowMs += ms; },
  };
}

function legacyFixture({ installAuthority = true } = {}) {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  // The measurement-flush phase gate reads the writer authority.
  // Install BWH_ACTIVE epoch 1 (the state production holds while
  // unfrozen) unless the test explicitly wants the missing-authority
  // case (A7).
  if (installAuthority) ensureWriterAuthority(database);
  const control = createSqliteSubscriptionControlStore({ database });
  applyCoinWalletMigrations({
    database,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(LEGACY_NOW),
  });
  applyCoinCommerceMigrations({
    database,
    expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(LEGACY_NOW),
  });
  control.createAccount({
    id: LEGACY_ACCOUNT, ownerRef: LEGACY_ACCOUNT, status: "active",
    createdAt: LEGACY_NOW, updatedAt: LEGACY_NOW,
  });
  const connection = new Proxy(database, {
    get(target, key) {
      if (key === "prepare") {
        return (sql) => /select\s+strftime\('%Y-%m-%dT%H:%M:%fZ',\s*'now'\)/i.test(sql)
          ? { pluck: () => ({ get: () => LEGACY_NOW }) }
          : target.prepare(sql);
      }
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const store = commerce.createSqliteCoinCommerceStore({
    database: connection, cancelWindowMs: 0,
  });
  store.walletStore.creditCoins({
    accountId: LEGACY_ACCOUNT, coinType: "paid_coins", amountUnits: 100,
    availability: "available", sourceType: "synthetic_seed",
    sourceRef: "source_ads_tx", sourceDigest: "a".repeat(64),
    policyRef: null, policyVersion: null, expiresAt: null,
    operation: {
      actorScope: "system:test", idempotencyKey: "credit_ads_tx",
      actorType: "system", actorRef: "ads_tx_test",
    },
  });
  store.publishOfferVersion(LEGACY_OFFER);
  let sequence = 0;
  return {
    database, connection, control, store,
    nextKey: () => `ads_tx_${++sequence}`,
    close() { store.close(); control.close(); database.close(); },
  };
}

function confirmationFixture(state) {
  const quote = state.store.createCheckoutQuote({
    accountId: LEGACY_ACCOUNT, offerRef: LEGACY_OFFER.offerRef,
  });
  const confirmed = state.store.confirmOrder({
    accountId: LEGACY_ACCOUNT, quoteRef: quote.quoteRef,
    operation: {
      actorScope: `portal:${LEGACY_ACCOUNT}`,
      idempotencyKey: `confirm_${state.nextKey()}`,
      actorType: "portal_user", actorRef: LEGACY_ACCOUNT,
    },
  });
  state.store.claimDueCaptures({ limit: 10 });
  state.store.captureClaimedOrder({ orderRef: confirmed.orderRef });
  const failedCommand = state.store.claimNextFulfillmentCommand({ leaseMs: 1000 });
  state.store.failFulfillmentCommand({
    commandRef: failedCommand.commandRef,
    leaseGeneration: failedCommand.leaseGeneration,
    leaseToken: failedCommand.leaseToken,
    safeCode: "fulfillment_handler_unavailable",
  });

  coinCommerceSchema.applyCoinCommerceInitialConfirmationMigrations({
    database: state.database,
    expectedMigrationId: coinCommerceSchema.REQUIRED_COIN_COMMERCE_INITIAL_CONFIRMATION_MIGRATION_ID,
    expectedDdlChecksum: coinCommerceSchema.COIN_COMMERCE_INITIAL_CONFIRMATION_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(LEGACY_NOW),
  });
  const command = state.database.prepare(
    "select * from platform_coin_commerce_fulfillment_commands where order_ref = ?",
  ).get(confirmed.orderRef);
  const sha = (value) => createHash("sha256").update(value).digest("hex");
  const request = `pareq_commerce_${sha(command.command_ref)}`;
  const entitlement = `ent_commerce_${sha(command.command_ref)}`;
  const link = `${request}_link_1`;
  const effect = `effect_coin_commerce_${sha(`GCCWEBOS:COIN_COMMERCE_SUBSCRIPTION_FULFILLMENT:v1\0${command.command_ref}`)}`;
  const expires = "2026-08-29T00:00:00.000Z";
  const confirmedAt = "2026-07-30T00:01:00.000Z";
  const tenant = "tenantref_0000000000000000";
  const artifact = "artifactref_0000000000000000";
  state.control.createEntitlement({
    id: entitlement, accountId: LEGACY_ACCOUNT, plan: LEGACY_OFFER.offerVersionRef,
    status: "active", validFrom: LEGACY_NOW, validUntil: expires,
    trafficLimitBytes: 50 * 1024 ** 3, createdAt: LEGACY_NOW, updatedAt: LEGACY_NOW,
  });
  state.control.createIssuanceRequest({
    id: request, accountId: LEGACY_ACCOUNT, entitlementId: entitlement,
    approvalRef: `approval_commerce_${sha(`${command.command_ref}\0${confirmed.orderRef}`)}`,
    status: "issued", quantity: 1, nodeId: "node_synthetic",
    purpose: "coin_commerce_product_fulfillment",
    requestedByRef: "operator_synthetic", createdAt: LEGACY_NOW, updatedAt: LEGACY_NOW,
  });
  state.control.linkIssuedSubscription({
    id: link, requestId: request, tenantRef: tenant, artifactRef: artifact,
    status: "active", createdAt: LEGACY_NOW, updatedAt: LEGACY_NOW,
  });
  const metadata = {
    version: 1, commandRef: command.command_ref, orderRef: confirmed.orderRef,
    accountId: LEGACY_ACCOUNT, requestRef: request, entitlementRef: entitlement,
    issuedLinkRef: link, tenantRef: tenant, artifactRef: artifact,
    offerVersionRef: LEGACY_OFFER.offerVersionRef, portalPlan: "monthly",
    durationDays: 30, monthlyTrafficGb: 50, trafficLimitBytes: 50 * 1024 ** 3,
    validFrom: LEGACY_NOW, previousValidUntil: LEGACY_NOW, targetValidUntil: expires,
  };
  const values = {
    confirmation_ref: `confirmation_ads_tx_${confirmed.orderRef}`,
    command_ref: command.command_ref, order_ref: confirmed.orderRef,
    account_id: LEGACY_ACCOUNT, effect_ref: effect, effect_sha256: "c".repeat(64),
    receipt_ref: `receipt_ads_tx_${confirmed.orderRef}`,
    approval_sha256: sha(`approval_${confirmed.orderRef}`),
    inventory_sha256: sha(`inventory_${confirmed.orderRef}`),
    resource_request_ref: request, entitlement_ref: entitlement, issued_link_ref: link,
    failed_updated_at: LEGACY_NOW, attempt_count: command.attempt_count,
    lease_generation: command.lease_generation, confirmed_at: confirmedAt,
    operator_ref: "operator_synthetic",
  };
  function insert() {
    state.control.recordAuditEvent({
      id: effect, entityType: "coin_commerce_subscription_fulfillment",
      entityRef: entitlement, action: "subscription_fulfillment_applied",
      actorRef: "coin_commerce_fulfillment", createdAt: confirmedAt, metadata,
    });
    const rawAudit = state.database.prepare(
      "select * from platform_audit_events where id = ?",
    ).get(effect);
    const canonicalAudit = Object.fromEntries(
      Object.keys(rawAudit).sort().map((key) => [key, rawAudit[key]]),
    );
    const row = { ...values, effect_sha256: sha(JSON.stringify(canonicalAudit)) };
    state.database.prepare(`
      insert into platform_coin_commerce_initial_confirmations (${Object.keys(row).join(",")})
      values (${Object.keys(row).map((key) => `@${key}`).join(",")})
    `).run(row);
  }
  return { orderRef: confirmed.orderRef, confirmationRef: values.confirmation_ref, insert };
}

function outboxCount(database, orderRef) {
  return database.prepare(
    "select count(*) from platform_ads_conversion_outbox where order_ref = ?",
  ).pluck().get(orderRef);
}

function outboxRow(database, orderRef) {
  return database.prepare(
    "select status, skip_reason from platform_ads_conversion_outbox where order_ref = ?",
  ).get(orderRef);
}

function recoveryControls(state) {
  return {
    participant: commerce.createCoinCommerceInitialConfirmationParticipant({
      store: state.store, database: state.connection,
    }),
    controls: commerce.createCoinCommerceAdsRecoveryControls({
      store: state.store, database: state.connection,
    }),
  };
}

// Queue one delivered order's measurement enqueue (committed recovery).
function queueDelivered(state, { participant, controls } = recoveryControls(state)) {
  const committed = confirmationFixture(state);
  state.database.transaction(() => {
    committed.insert();
    assert.deepEqual(
      participant.complete({ confirmationRef: committed.confirmationRef }),
      { status: "delivered" },
    );
  })();
  assert.equal(controls.pendingAdsRecoveryEnqueueCount(), 1);
  return { committed, participant, controls };
}

function codeOf(fn) {
  try {
    fn();
  } catch (error) {
    return error.code;
  }
  return null;
}

// Coordinator helpers (same synthetic bundle shape as the Card 9 tests).
function buildBundle(db) {
  const writeLock = buildWriteLockReceipt(db, { snapshotId: SNAPSHOT, checkpointId: CHECKPOINT, outstandingJobs: [] });
  const schedulerQuiescence = buildSchedulerQuiescenceReceipt({
    snapshotId: SNAPSHOT,
    evidence: Object.fromEntries(SCHEDULER_JOBS.map((job) => [job.id, true])),
  });
  const callbackDrain = buildCallbackDrainReceipt({ snapshotId: SNAPSHOT, callbacks: [] });
  const hwmCompleteness = buildHwmCompletenessReceipt({
    snapshotId: SNAPSHOT,
    highWaterMark: { seq: 7, snapshotId: SNAPSHOT },
    manifestSeq: 7,
    rowCounts: { platform_coin_commerce_orders: 1 },
  });
  return buildFreezeReadinessBundle({ snapshotId: SNAPSHOT, writeLock, schedulerQuiescence, callbackDrain, hwmCompleteness });
}

function closedCoverage() {
  // U (PR #906 r4662139139): every fenced claim carries the R7
  // disposition record as its evidence ref.
  const fenced = Object.fromEntries(
    UNFENCED_WRITER_BASELINE.map((entry) => entry.id).filter((id) => id !== "U-F17")
      .map((id) => [id, "decisions/D3_28_ITEMS_DISPOSITION_R7_2026-11-24.md (R7-approved writer dispositions)"]),
  );
  return buildWriterCoverageMatrix({ fenced });
}

function drainedTracker(clock) {
  const tracker = createDrainTracker({ timeoutMs: 60000, now: clock.now });
  tracker.registerWrite("s2s-tx-1");
  tracker.registerCallback("s2s-cb-1");
  tracker.settleWrite("s2s-tx-1");
  tracker.settleCallback("s2s-cb-1");
  tracker.markSchedulerQuiesced();
  tracker.recordHwmObservation({ rowCounts: { platform_coin_commerce_orders: 1 } });
  tracker.recordHwmObservation({ rowCounts: { platform_coin_commerce_orders: 1 } });
  return tracker;
}

function makeCoordinator(db) {
  const clock = makeClock();
  const coordinator = createFreezeDrainCoordinator(db, { snapshotId: SNAPSHOT, now: clock.now });
  return { coordinator, clock };
}

// --- A1: frozen flush writes nothing and clears the queue -----------------

test("A1 frozen flush writes no outbox row and clears the queue", () => {
  const state = legacyFixture();
  try {
    withFlag(true, () => {
      const { committed, controls } = queueDelivered(state);
      transitionWriterAuthority(state.database, { to: "FROZEN", expectedEpoch: 1 });
      assert.equal(readWriterAuthority(state.database).phase, "FROZEN");
      controls.flushAdsRecoveryEnqueues([committed.orderRef]);
      assert.equal(outboxCount(state.database, committed.orderRef), 0);
      assert.equal(controls.pendingAdsRecoveryEnqueueCount(), 0);
    });
  } finally {
    state.close();
  }
});

// --- A2: frozen execute() backstop -----------------------------------------

test("A2 frozen execute() flushes nothing and the business action is refused", () => {
  const state = legacyFixture();
  try {
    withFlag(true, () => {
      const { committed, controls } = queueDelivered(state);
      transitionWriterAuthority(state.database, { to: "FROZEN", expectedEpoch: 1 });
      // createCheckoutQuote runs through the store's internal execute(),
      // whose backstop flush runs before the fenced quote transaction:
      // the flush must discard the queue and the quote itself must be
      // refused by the commerce fence (execute is internal, not a store
      // method, so the public quote call is the entry point).
      assert.equal(codeOf(() => state.store.createCheckoutQuote({
        accountId: LEGACY_ACCOUNT, offerRef: LEGACY_OFFER.offerRef,
      })), "writer_authority_not_bwh");
      assert.equal(outboxCount(state.database, committed.orderRef), 0);
      assert.equal(controls.pendingAdsRecoveryEnqueueCount(), 0);
    });
  } finally {
    state.close();
  }
});

// --- A3: freeze records the discarded count --------------------------------

test("A3 freeze records the discarded measurement count in the T1 receipt", () => {
  const state = legacyFixture();
  try {
    withFlag(true, () => {
      const { controls } = queueDelivered(state);
      assert.equal(controls.pendingAdsRecoveryEnqueueCount(), 1);
      assert.equal(controls.discardAdsRecoveryEnqueues(), 1);
      assert.equal(controls.pendingAdsRecoveryEnqueueCount(), 0);
      const { coordinator, clock } = makeCoordinator(state.database);
      const result = coordinator.freeze({
        readinessBundle: buildBundle(state.database),
        coverageMatrix: closedCoverage(),
        drainTracker: drainedTracker(clock),
        checkpointId: CHECKPOINT,
        measurementDrain: { queueLengthBefore: 1, discardedMeasurementEnqueues: 1 },
      });
      assert.equal(result.transitionId, "T1");
      assert.equal(result.authority.phase, "FROZEN");
      assert.equal(result.coordinatorReceipt.gateRefs.discardedMeasurementEnqueues, 1);
      assert.equal(result.coordinatorReceipt.gateRefs.measurementQueueLengthBefore, 1);
    });
  } finally {
    state.close();
  }
});

test("A3 a mismatched measurement drain count refuses the freeze", () => {
  const state = legacyFixture();
  try {
    withFlag(true, () => {
      const { coordinator, clock } = makeCoordinator(state.database);
      assert.equal(codeOf(() => coordinator.freeze({
        readinessBundle: buildBundle(state.database),
        coverageMatrix: closedCoverage(),
        drainTracker: drainedTracker(clock),
        checkpointId: CHECKPOINT,
        measurementDrain: { queueLengthBefore: 1, discardedMeasurementEnqueues: 0 },
      })), "freeze_measurement_drain_mismatch");
      assert.equal(readWriterAuthority(state.database).phase, "BWH_ACTIVE");
      assert.equal(coordinator.readLog().length, 0);
    });
  } finally {
    state.close();
  }
});

// --- A4: BWH_ACTIVE flush works (regression) --------------------------------

test("A4 BWH_ACTIVE flush writes the outbox row for a delivered order and none for a rolled-back one", () => {
  const committedState = legacyFixture();
  try {
    withFlag(true, () => {
      const { committed, controls } = queueDelivered(committedState);
      controls.flushAdsRecoveryEnqueues([committed.orderRef]);
      assert.deepEqual(outboxRow(committedState.database, committed.orderRef), { status: "skipped", skip_reason: "no_click" });
      assert.equal(controls.pendingAdsRecoveryEnqueueCount(), 0);
    });
  } finally {
    committedState.close();
  }
  const rolledBackState = legacyFixture();
  try {
    withFlag(true, () => {
      const { participant, controls } = recoveryControls(rolledBackState);
      const rolledBack = confirmationFixture(rolledBackState);
      assert.throws(() => rolledBackState.database.transaction(() => {
        rolledBack.insert();
        assert.deepEqual(
          participant.complete({ confirmationRef: rolledBack.confirmationRef }),
          { status: "delivered" },
        );
        throw new Error("synthetic recovery rollback");
      })(), /synthetic recovery rollback/);
      controls.discardAdsRecoveryEnqueues([rolledBack.orderRef]);
      controls.flushAdsRecoveryEnqueues([rolledBack.orderRef]);
      assert.equal(outboxCount(rolledBackState.database, rolledBack.orderRef), 0);
    });
  } finally {
    rolledBackState.close();
  }
});

// --- A5: D1_ACTIVE flush still stops ----------------------------------------

test("A5 D1_ACTIVE flush writes no outbox row and clears the queue", () => {
  const state = legacyFixture();
  try {
    withFlag(true, () => {
      const { committed, controls } = queueDelivered(state);
      transitionWriterAuthority(state.database, { to: "FROZEN", expectedEpoch: 1 });
      transitionWriterAuthority(state.database, { to: "D1_ACTIVE", expectedEpoch: 2 });
      assert.equal(readWriterAuthority(state.database).phase, "D1_ACTIVE");
      controls.flushAdsRecoveryEnqueues([committed.orderRef]);
      assert.equal(outboxCount(state.database, committed.orderRef), 0);
      assert.equal(controls.pendingAdsRecoveryEnqueueCount(), 0);
    });
  } finally {
    state.close();
  }
});

// --- A6: unfreeze restores flushing without backfilling ----------------------

test("A6 after unfreeze a new enqueue flushes normally and the discarded one is never backfilled", () => {
  const state = legacyFixture();
  try {
    withFlag(true, () => {
      const first = queueDelivered(state);
      assert.equal(first.controls.discardAdsRecoveryEnqueues(), 1);
      const { coordinator, clock } = makeCoordinator(state.database);
      const frozen = coordinator.freeze({
        readinessBundle: buildBundle(state.database),
        coverageMatrix: closedCoverage(),
        drainTracker: drainedTracker(clock),
        checkpointId: CHECKPOINT,
        measurementDrain: { queueLengthBefore: 1, discardedMeasurementEnqueues: 1 },
      });
      const unfrozen = coordinator.unfreeze({
        reason: "synthetic unfreeze",
        voidedFreezeReceiptRef: frozen.freezeReceipt.receiptDigest,
      });
      assert.equal(unfrozen.authority.phase, "BWH_ACTIVE");
      assert.equal(unfrozen.authority.epoch, 3);
      const second = queueDelivered(state);
      second.controls.flushAdsRecoveryEnqueues([second.committed.orderRef]);
      assert.deepEqual(outboxRow(state.database, second.committed.orderRef), { status: "skipped", skip_reason: "no_click" });
      assert.equal(outboxCount(state.database, first.committed.orderRef), 0);
      assert.equal(second.controls.pendingAdsRecoveryEnqueueCount(), 0);
    });
  } finally {
    state.close();
  }
});

// --- A7: missing / damaged authority fails closed -----------------------------

test("A7 flush with no authority record discards, writes nothing, and never throws", () => {
  const state = legacyFixture();
  try {
    withFlag(true, () => {
      const { committed, controls } = queueDelivered(state);
      // Remove every authority object: the database is a legacy one
      // with no authority record at all.
      state.database.exec("drop table platform_writer_authority");
      state.database.exec("drop view platform_writer_authority_installed");
      assert.equal(readWriterAuthority(state.database), null);
      assert.doesNotThrow(() => controls.flushAdsRecoveryEnqueues([committed.orderRef]));
      assert.equal(outboxCount(state.database, committed.orderRef), 0);
      assert.equal(controls.pendingAdsRecoveryEnqueueCount(), 0);
    });
  } finally {
    state.close();
  }
});

test("A7 flush with a damaged authority record discards, writes nothing, and never throws", () => {
  const state = legacyFixture();
  try {
    withFlag(true, () => {
      const { committed, controls } = queueDelivered(state);
      // Drop the table but leave the marker view: the authority schema
      // is present-but-broken, so the read throws and the flush must
      // fail closed instead of writing.
      state.database.exec("drop table platform_writer_authority");
      assert.equal(
        codeOf(() => readWriterAuthority(state.database)),
        "writer_authority_unavailable",
      );
      assert.doesNotThrow(() => controls.flushAdsRecoveryEnqueues([committed.orderRef]));
      assert.equal(outboxCount(state.database, committed.orderRef), 0);
      assert.equal(controls.pendingAdsRecoveryEnqueueCount(), 0);
    });
  } finally {
    state.close();
  }
});
