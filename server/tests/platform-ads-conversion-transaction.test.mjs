// Transaction regression tests for the Ads conversion measurement hooks
// (fix round 2, R3). The measurement layer must never change a purchase
// outcome: with the flag on and every Ads-table write forced to fail,
// the legacy confirm / legacy complete / deferred reserve / deferred
// settle results are identical to the flag-off results, and an
// initial-confirmation transaction that rolls back produces no outbox
// row even when the post-commit flush is invoked afterwards.
//
// Fixture style follows the repository's existing store tests
// (platform-coin-commerce-store, platform-coin-commerce-initial-
// confirmation-participant, wallet-first-deferred-checkout-adapter,
// platform-deferred-resource-transition-store): in-memory databases,
// fixed clocks, synthetic seeds only.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import Database from "better-sqlite3";

import { ensureAdsConversionSchema } from "../services/platform/ads-conversion-store.mjs";
import * as commerce from "../services/platform/coin-commerce-store.mjs";
import * as coinCommerceSchema from "../services/platform/coin-commerce-migrations.mjs";
import {
  applyCoinCommerceMigrations,
  COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID
} from "../services/platform/coin-commerce-migrations.mjs";
import {
  applyCoinWalletMigrations,
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID
} from "../services/platform/coin-wallet-migrations.mjs";
import { COIN_COMMERCE_PRODUCTION_OFFERS } from "../services/platform/coin-commerce-production-catalog.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import {
  applyDeferredResourceTransitionMigrations,
  REQUIRED_DEFERRED_RESOURCE_TRANSITION_DDL_CHECKSUM,
  REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID
} from "../services/platform/deferred-resource-transition-migrations.mjs";
import { createSqliteDeferredResourceTransitionStore } from "../services/platform/deferred-resource-transition-store.mjs";
import {
  applyWalletFirstDeferredCheckoutMigrations,
  REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID,
  WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATIONS
} from "../services/platform/wallet-first-deferred-checkout-migrations.mjs";
import { createWalletFirstDeferredCheckoutAdapter } from "../services/platform/wallet-first-deferred-checkout-adapter.mjs";
import { createSqliteCoinWalletStore } from "../services/platform/coin-wallet-store.mjs";

const FLAG = "ADS_CLICK_BINDING_ENABLED";
const ADS_TABLES = [
  "platform_ads_click_claims",
  "platform_ads_click_bindings",
  "platform_ads_conversion_outbox"
];

// The Ads click validator reads the real wall clock, so clickAt is
// derived from Date.now() rather than from the fixtures' fixed clocks.
function freshClick(value = "EAIaIQobChMI-test_click.001") {
  return {
    type: "gclid",
    value,
    clickAt: new Date(Date.now() - 60_000).toISOString(),
    consent: { adUserData: true, adPersonalization: false }
  };
}

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

// Pre-create the Ads schema, then make every INSERT/UPDATE on the three
// Ads tables abort. Purchase code must swallow these failures entirely.
function breakAdsWrites(database) {
  ensureAdsConversionSchema(database);
  for (const table of ADS_TABLES) {
    database.exec(`
      create trigger ads_tx_fail_${table}_insert
        before insert on ${table}
        begin select raise(abort, 'synthetic ads write failure'); end;
      create trigger ads_tx_fail_${table}_update
        before update on ${table}
        begin select raise(abort, 'synthetic ads write failure'); end;
    `);
  }
}

function adsRowCounts(database) {
  return Object.fromEntries(ADS_TABLES.map((table) => [
    table,
    database.prepare(`select count(*) from ${table}`).pluck().get()
  ]));
}

/* ------------------------------------------------------------------ */
/* Legacy fixture (initial-confirmation participant test style).       */
/* ------------------------------------------------------------------ */

const LEGACY_NOW = "2026-07-30T00:00:00.000Z";
const LEGACY_ACCOUNT = "acct_ads_tx";
const LEGACY_OFFER = COIN_COMMERCE_PRODUCTION_OFFERS[0];

function legacyFixture() {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  const control = createSqliteSubscriptionControlStore({ database });
  applyCoinWalletMigrations({
    database,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(LEGACY_NOW)
  });
  applyCoinCommerceMigrations({
    database,
    expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(LEGACY_NOW)
  });
  control.createAccount({
    id: LEGACY_ACCOUNT, ownerRef: LEGACY_ACCOUNT, status: "active",
    createdAt: LEGACY_NOW, updatedAt: LEGACY_NOW
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
    }
  });
  const store = commerce.createSqliteCoinCommerceStore({
    database: connection, cancelWindowMs: 0
  });
  store.walletStore.creditCoins({
    accountId: LEGACY_ACCOUNT, coinType: "paid_coins", amountUnits: 100,
    availability: "available", sourceType: "synthetic_seed",
    sourceRef: "source_ads_tx", sourceDigest: "a".repeat(64),
    policyRef: null, policyVersion: null, expiresAt: null,
    operation: {
      actorScope: "system:test", idempotencyKey: "credit_ads_tx",
      actorType: "system", actorRef: "ads_tx_test"
    }
  });
  store.publishOfferVersion(LEGACY_OFFER);
  let sequence = 0;
  return {
    database, connection, control, store,
    nextKey: () => `ads_tx_${++sequence}`,
    close() { store.close(); control.close(); database.close(); }
  };
}

function legacyConfirmAndCapture(state, { adsClick } = {}) {
  const quote = state.store.createCheckoutQuote({
    accountId: LEGACY_ACCOUNT, offerRef: LEGACY_OFFER.offerRef
  });
  const confirmed = state.store.confirmOrder({
    accountId: LEGACY_ACCOUNT,
    quoteRef: quote.quoteRef,
    ...(adsClick ? { adsClick } : {}),
    operation: {
      actorScope: `portal:${LEGACY_ACCOUNT}`,
      idempotencyKey: `confirm_${state.nextKey()}`,
      actorType: "portal_user", actorRef: LEGACY_ACCOUNT
    }
  });
  state.store.claimDueCaptures({ limit: 10 });
  state.store.captureClaimedOrder({ orderRef: confirmed.orderRef });
  return confirmed;
}

function legacyOrderState(database, orderRef) {
  const order = database.prepare(
    "select payment_status from platform_coin_commerce_orders where order_ref = ?"
  ).get(orderRef);
  const command = database.prepare(
    "select status from platform_coin_commerce_fulfillment_commands where order_ref = ?"
  ).get(orderRef);
  return { paymentStatus: order?.payment_status, commandStatus: command?.status };
}

test("legacy confirm and complete are unchanged when every Ads write fails", () => {
  const runScenario = (adsMode) => {
    const state = legacyFixture();
    try {
      return withFlag(adsMode !== "off", () => {
        if (adsMode === "broken") breakAdsWrites(state.database);
        const confirmed = legacyConfirmAndCapture(state, { adsClick: freshClick() });
        const claimed = state.store.claimNextFulfillmentCommand({ leaseMs: 1000 });
        state.store.completeFulfillmentCommand({
          commandRef: claimed.commandRef,
          leaseGeneration: claimed.leaseGeneration,
          leaseToken: claimed.leaseToken,
          effectRef: `effect_ads_tx_${adsMode}`,
          status: "delivered"
        });
        return {
          orderRef: confirmed.orderRef,
          state: legacyOrderState(state.database, confirmed.orderRef),
          ads: adsMode === "off" ? null : adsRowCounts(state.database)
        };
      });
    } finally {
      state.close();
    }
  };

  const off = runScenario("off");
  assert.deepEqual(off.state, { paymentStatus: "captured", commandStatus: "delivered" });

  const broken = runScenario("broken");
  // Same purchase outcome, and not a single Ads row could be written.
  assert.deepEqual(broken.state, off.state);
  assert.deepEqual(broken.ads, {
    platform_ads_click_claims: 0,
    platform_ads_click_bindings: 0,
    platform_ads_conversion_outbox: 0
  });

  const healthy = runScenario("healthy");
  assert.deepEqual(healthy.state, off.state);
});

test("legacy complete records a pending conversion when Ads writes succeed", () => {
  const state = legacyFixture();
  try {
    withFlag(true, () => {
      const click = freshClick();
      const confirmed = legacyConfirmAndCapture(state, { adsClick: click });
      const claimed = state.store.claimNextFulfillmentCommand({ leaseMs: 1000 });
      state.store.completeFulfillmentCommand({
        commandRef: claimed.commandRef,
        leaseGeneration: claimed.leaseGeneration,
        leaseToken: claimed.leaseToken,
        effectRef: "effect_ads_tx_healthy",
        status: "delivered"
      });
      const outbox = state.database.prepare(
        "select status, skip_reason from platform_ads_conversion_outbox where order_ref = ?"
      ).get(confirmed.orderRef);
      // Control for the failure test above: the hook really fires, so
      // the empty outbox there is the swallowed failure, not a dead path.
      assert.deepEqual(outbox, { status: "pending", skip_reason: null });
      const binding = state.database.prepare(
        "select click_value from platform_ads_click_bindings where order_ref = ?"
      ).get(confirmed.orderRef);
      assert.equal(binding?.click_value, click.value);
    });
  } finally {
    state.close();
  }
});

/* ------------------------------------------------------------------ */
/* Deferred fixture (wallet-first deferred checkout adapter style).    */
/* ------------------------------------------------------------------ */

const DEFERRED_NOW = "2030-01-01T00:00:00.000Z";
const DEFERRED_PLAN = Object.freeze({
  offerRef: "offer_plan_365d_200gb_monthly",
  offerVersionRef: "offerv_plan_365d_200gb_monthly_v1",
  baseCoinUnits: 200
});

function references(prefix = "test") {
  const counts = new Map();
  return (kind) => {
    const count = (counts.get(kind) ?? 0) + 1;
    counts.set(kind, count);
    return `${prefix}_${kind}_${count}`;
  };
}

function deferredFoundation() {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  database.exec(`
    create table platform_accounts (
      id text primary key, owner_ref text not null, status text not null,
      created_at text not null, updated_at text not null,
      metadata_json text not null default '{}'
    );
    create table platform_entitlements (
      id text primary key,
      account_id text not null references platform_accounts(id),
      status text not null, valid_from text not null, valid_until text not null
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
      tenant_ref text not null default '', artifact_ref text not null default '',
      status text not null default 'active'
    );
    create table platform_portal_access_requests (
      id text primary key, portal_user_ref text not null, entitlement_ref text,
      status text not null, expires_at text, valid_until text,
      tenant_id text, artifact_id text
    );
  `);
  applyCoinWalletMigrations({
    database, expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(DEFERRED_NOW)
  });
  applyCoinCommerceMigrations({
    database, expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(DEFERRED_NOW)
  });
  applyDeferredResourceTransitionMigrations({
    database, expectedMigrationId: REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID,
    expectedDdlChecksum: REQUIRED_DEFERRED_RESOURCE_TRANSITION_DDL_CHECKSUM,
    nowFn: () => new Date(DEFERRED_NOW)
  });
  applyWalletFirstDeferredCheckoutMigrations({
    database, expectedMigrationId: REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID,
    expectedDdlChecksum: WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(DEFERRED_NOW)
  });
  return database;
}

function deferredSeed(database, accountId) {
  database.prepare(`
    insert into platform_accounts (id, owner_ref, status, created_at, updated_at, metadata_json)
    values (?, ?, 'active', ?, ?, ?)
  `).run(accountId, `owner_${accountId}`, DEFERRED_NOW, DEFERRED_NOW,
    JSON.stringify({ commercialModel: "wallet_first_unique_v1" }));
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
      'subscription_plan', 365, 200, null, 0, 0, ?, ?, null)
  `).run(
    DEFERRED_PLAN.offerVersionRef, DEFERRED_PLAN.offerRef,
    "200 GB 年度套餐", "200 GB annual plan", "测试套餐", "Test plan",
    JSON.stringify(["测试"]), JSON.stringify(["Test"]),
    DEFERRED_PLAN.baseCoinUnits, 20000,
    JSON.stringify(["bonus_coins", "paid_coins", "reward_coins"]),
    DEFERRED_NOW, DEFERRED_NOW
  );
  const wallet = createSqliteCoinWalletStore({
    database, nowFn: () => new Date(DEFERRED_NOW),
    refFactory: references(`wallet_${accountId}`)
  });
  try {
    wallet.creditCoins({
      accountId, coinType: "paid_coins",
      amountUnits: DEFERRED_PLAN.baseCoinUnits, availability: "available",
      sourceType: "ads_tx_test", sourceRef: `source_${accountId}`,
      sourceDigest: "a".repeat(64), policyRef: null, policyVersion: null,
      expiresAt: null,
      operation: {
        actorScope: `test:${accountId}`, idempotencyKey: `credit_${accountId}`,
        actorType: "system", actorRef: "ads_tx_test"
      }
    });
  } finally {
    wallet.close();
  }
}

function bindingRef(prefix, value) {
  return `${prefix}ref_${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

function seedEffectSuccessor(database, accountId, suffix, validUntil) {
  const entitlementId = `effect_entitlement_${suffix}`;
  const requestId = `effect_request_${suffix}`;
  const issuedLinkId = `effect_link_${suffix}`;
  const tenantId = `tenant_${suffix}`;
  const artifactId = `artifact_${suffix}`;
  database.prepare(`
    insert into platform_entitlements (id, account_id, status, valid_from, valid_until)
    values (?, ?, 'active', ?, ?)
  `).run(entitlementId, accountId, DEFERRED_NOW, validUntil);
  database.prepare(`
    insert into platform_issuance_requests (id, account_id, entitlement_id, status)
    values (?, ?, ?, 'issued')
  `).run(requestId, accountId, entitlementId);
  database.prepare(`
    insert into platform_issued_subscription_links (id, request_id, tenant_ref, artifact_ref, status)
    values (?, ?, ?, ?, 'active')
  `).run(issuedLinkId, requestId, bindingRef("tenant", tenantId), bindingRef("artifact", artifactId));
  database.prepare(`
    insert into platform_portal_access_requests (
      id, portal_user_ref, entitlement_ref, status, expires_at, valid_until, tenant_id, artifact_id
    ) values (?, ?, ?, 'issued', ?, ?, ?, ?)
  `).run(requestId, accountId, entitlementId, validUntil, validUntil, tenantId, artifactId);
  return { entitlementId, requestId, issuedLinkId, validUntil };
}

function deferredOperation(accountId, key, actorType = "portal_user") {
  return {
    actorScope: `account:${accountId}`,
    idempotencyKey: key,
    actorType,
    actorRef: actorType === "portal_user" ? accountId : "test_transition_worker"
  };
}

function deferredScenario(adsMode) {
  const database = deferredFoundation();
  const accountId = `acct_ads_tx_${adsMode}`;
  let adapter;
  let store;
  try {
    deferredSeed(database, accountId);
    const clock = { value: DEFERRED_NOW };
    store = createSqliteDeferredResourceTransitionStore({
      database,
      nowFn: () => new Date(clock.value),
      refFactory: references("transition"),
      leaseTokenFactory: () => "a".repeat(64)
    });
    adapter = createWalletFirstDeferredCheckoutAdapter({
      database, deferredTransitionStore: store,
      nowFn: () => new Date(clock.value),
      refFactory: references("quote"), quoteTtlMs: 60_000
    });
    return withFlag(adsMode !== "off", () => {
      if (adsMode === "broken") breakAdsWrites(database);
      const quote = adapter.previewDeferredCheckout({
        accountId,
        offerRef: DEFERRED_PLAN.offerRef,
        transitionContext: {
          flowKind: "initial_activation",
          scheduledFor: DEFERRED_NOW,
          expectedEntitlementId: null,
          expectedRequestId: null,
          expectedIssuedLinkId: null,
          expectedValidUntil: null
        }
      });
      const reserved = adapter.reserveDeferredTransition({
        accountId,
        quoteRef: quote.quoteRef,
        operation: {
          actorScope: `portal:${accountId}`,
          idempotencyKey: `reserve_ads_tx_${adsMode}`,
          actorType: "portal_user", actorRef: accountId
        },
        adsClick: freshClick()
      });
      const claim = store.claimNextDueTransition({ leaseMs: 60_000 });
      const successor = seedEffectSuccessor(
        database, accountId, adsMode, "2031-01-01T00:00:00.000Z"
      );
      store.recordEffectApplied({
        transitionRef: claim.transitionRef,
        leaseGeneration: claim.leaseGeneration,
        leaseToken: claim.leaseToken,
        effectRef: `effect_ads_tx_${adsMode}`,
        successor,
        operation: deferredOperation(accountId, `record_ads_tx_${adsMode}`, "commerce_system")
      });
      const settled = store.settleTransition({
        transitionRef: claim.transitionRef,
        leaseGeneration: claim.leaseGeneration,
        leaseToken: claim.leaseToken,
        operation: deferredOperation(accountId, `settle_ads_tx_${adsMode}`, "commerce_system")
      });
      return {
        reservedState: reserved.state,
        settledState: settled.state,
        orderRef: reserved.orderRef,
        ads: adsMode === "off" ? null : adsRowCounts(database),
        outbox: adsMode === "off" ? null : database.prepare(
          "select status, skip_reason from platform_ads_conversion_outbox where order_ref = ?"
        ).get(reserved.orderRef) ?? null
      };
    });
  } finally {
    adapter?.close();
    store?.close();
    database.close();
  }
}

test("deferred reserve and settle are unchanged when every Ads write fails", () => {
  const off = deferredScenario("off");
  assert.equal(off.reservedState, "reserved");
  assert.equal(off.settledState, "settled");

  const broken = deferredScenario("broken");
  assert.equal(broken.reservedState, off.reservedState);
  assert.equal(broken.settledState, off.settledState);
  assert.deepEqual(broken.ads, {
    platform_ads_click_claims: 0,
    platform_ads_click_bindings: 0,
    platform_ads_conversion_outbox: 0
  });
  assert.equal(broken.outbox, null);

  const healthy = deferredScenario("healthy");
  assert.equal(healthy.reservedState, off.reservedState);
  assert.equal(healthy.settledState, off.settledState);
  // Control: with working Ads writes the settle hook enqueues pending.
  assert.deepEqual(healthy.outbox, { status: "pending", skip_reason: null });
});

/* ------------------------------------------------------------------ */
/* Initial-confirmation recovery: rollback leaves no outbox row.       */
/* ------------------------------------------------------------------ */

function confirmationFixture(state) {
  // Failed fulfillment order (the participant fixture pattern).
  const quote = state.store.createCheckoutQuote({
    accountId: LEGACY_ACCOUNT, offerRef: LEGACY_OFFER.offerRef
  });
  const confirmed = state.store.confirmOrder({
    accountId: LEGACY_ACCOUNT, quoteRef: quote.quoteRef,
    operation: {
      actorScope: `portal:${LEGACY_ACCOUNT}`,
      idempotencyKey: `confirm_${state.nextKey()}`,
      actorType: "portal_user", actorRef: LEGACY_ACCOUNT
    }
  });
  state.store.claimDueCaptures({ limit: 10 });
  state.store.captureClaimedOrder({ orderRef: confirmed.orderRef });
  const failedCommand = state.store.claimNextFulfillmentCommand({ leaseMs: 1000 });
  state.store.failFulfillmentCommand({
    commandRef: failedCommand.commandRef,
    leaseGeneration: failedCommand.leaseGeneration,
    leaseToken: failedCommand.leaseToken,
    safeCode: "fulfillment_handler_unavailable"
  });

  coinCommerceSchema.applyCoinCommerceInitialConfirmationMigrations({
    database: state.database,
    expectedMigrationId: coinCommerceSchema.REQUIRED_COIN_COMMERCE_INITIAL_CONFIRMATION_MIGRATION_ID,
    expectedDdlChecksum: coinCommerceSchema.COIN_COMMERCE_INITIAL_CONFIRMATION_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(LEGACY_NOW)
  });
  const command = state.database.prepare(
    "select * from platform_coin_commerce_fulfillment_commands where order_ref = ?"
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
    trafficLimitBytes: 50 * 1024 ** 3, createdAt: LEGACY_NOW, updatedAt: LEGACY_NOW
  });
  state.control.createIssuanceRequest({
    id: request, accountId: LEGACY_ACCOUNT, entitlementId: entitlement,
    approvalRef: `approval_commerce_${sha(`${command.command_ref}\0${confirmed.orderRef}`)}`,
    status: "issued", quantity: 1, nodeId: "node_synthetic",
    purpose: "coin_commerce_product_fulfillment",
    requestedByRef: "operator_synthetic", createdAt: LEGACY_NOW, updatedAt: LEGACY_NOW
  });
  state.control.linkIssuedSubscription({
    id: link, requestId: request, tenantRef: tenant, artifactRef: artifact,
    status: "active", createdAt: LEGACY_NOW, updatedAt: LEGACY_NOW
  });
  const metadata = {
    version: 1, commandRef: command.command_ref, orderRef: confirmed.orderRef,
    accountId: LEGACY_ACCOUNT, requestRef: request, entitlementRef: entitlement,
    issuedLinkRef: link, tenantRef: tenant, artifactRef: artifact,
    offerVersionRef: LEGACY_OFFER.offerVersionRef, portalPlan: "monthly",
    durationDays: 30, monthlyTrafficGb: 50, trafficLimitBytes: 50 * 1024 ** 3,
    validFrom: LEGACY_NOW, previousValidUntil: LEGACY_NOW, targetValidUntil: expires
  };
  const values = {
    confirmation_ref: `confirmation_ads_tx_${confirmed.orderRef}`,
    command_ref: command.command_ref, order_ref: confirmed.orderRef,
    account_id: LEGACY_ACCOUNT, effect_ref: effect, effect_sha256: "c".repeat(64),
    receipt_ref: `receipt_ads_tx_${confirmed.orderRef}`,
    approval_sha256: "a".repeat(64), inventory_sha256: "b".repeat(64),
    resource_request_ref: request, entitlement_ref: entitlement, issued_link_ref: link,
    failed_updated_at: LEGACY_NOW, attempt_count: command.attempt_count,
    lease_generation: command.lease_generation, confirmed_at: confirmedAt,
    operator_ref: "operator_synthetic"
  };
  function insert() {
    state.control.recordAuditEvent({
      id: effect, entityType: "coin_commerce_subscription_fulfillment",
      entityRef: entitlement, action: "subscription_fulfillment_applied",
      actorRef: "coin_commerce_fulfillment", createdAt: confirmedAt, metadata
    });
    const rawAudit = state.database.prepare(
      "select * from platform_audit_events where id = ?"
    ).get(effect);
    const canonicalAudit = Object.fromEntries(
      Object.keys(rawAudit).sort().map((key) => [key, rawAudit[key]])
    );
    const row = { ...values, effect_sha256: sha(JSON.stringify(canonicalAudit)) };
    state.database.prepare(`
      insert into platform_coin_commerce_initial_confirmations (${Object.keys(row).join(",")})
      values (${Object.keys(row).map((key) => `@${key}`).join(",")})
    `).run(row);
  }
  return { orderRef: confirmed.orderRef, confirmationRef: values.confirmation_ref, insert };
}

test("initial-confirmation rollback leaves no outbox row even when flush is called", () => {
  const state = legacyFixture();
  try {
    withFlag(true, () => {
      const participant = commerce.createCoinCommerceInitialConfirmationParticipant({
        store: state.store, database: state.connection
      });
      const controls = commerce.createCoinCommerceAdsRecoveryControls({
        store: state.store, database: state.connection
      });

      // Rolled-back recovery: the participant queues an Ads enqueue
      // inside the transaction, the transaction then fails.
      const rolledBack = confirmationFixture(state);
      assert.throws(() => state.database.transaction(() => {
        rolledBack.insert();
        assert.deepEqual(
          participant.complete({ confirmationRef: rolledBack.confirmationRef }),
          { status: "delivered" }
        );
        throw new Error("synthetic recovery rollback");
      })(), /synthetic recovery rollback/);
      // Committed state is untouched: the command is still failed.
      assert.equal(legacyOrderState(state.database, rolledBack.orderRef).commandStatus, "failed");
      // The executor's failure path discards the batch; even a stray
      // flush afterwards must not create an outbox row, because the
      // flush re-reads committed state and finds nothing delivered.
      controls.discardAdsRecoveryEnqueues([rolledBack.orderRef]);
      controls.flushAdsRecoveryEnqueues([rolledBack.orderRef]);
      assert.equal(
        state.database.prepare(
          "select count(*) from platform_ads_conversion_outbox where order_ref = ?"
        ).pluck().get(rolledBack.orderRef),
        0
      );
    });
  } finally {
    state.close();
  }
});

test("initial-confirmation commit plus explicit flush creates the outbox row at once", () => {
  const state = legacyFixture();
  try {
    withFlag(true, () => {
      const participant = commerce.createCoinCommerceInitialConfirmationParticipant({
        store: state.store, database: state.connection
      });
      const controls = commerce.createCoinCommerceAdsRecoveryControls({
        store: state.store, database: state.connection
      });
      // Committed recovery: the explicit post-commit flush creates the
      // outbox row immediately, without any later store operation. The
      // confirm carried no click, so the row is the explicit no-click
      // skip recorded from the stored claim.
      const committed = confirmationFixture(state);
      state.database.transaction(() => {
        committed.insert();
        assert.deepEqual(
          participant.complete({ confirmationRef: committed.confirmationRef }),
          { status: "delivered" }
        );
      })();
      controls.flushAdsRecoveryEnqueues([committed.orderRef]);
      assert.deepEqual(
        state.database.prepare(
          "select status, skip_reason from platform_ads_conversion_outbox where order_ref = ?"
        ).get(committed.orderRef),
        { status: "skipped", skip_reason: "no_click" }
      );
    });
  } finally {
    state.close();
  }
});
