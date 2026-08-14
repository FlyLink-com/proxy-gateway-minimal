import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";

import {
  COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID,
  applyCoinCommerceMigrations
} from "../services/platform/coin-commerce-migrations.mjs";
import {
  REQUIRED_DEFERRED_RESOURCE_TRANSITION_DDL_CHECKSUM,
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
import {
  REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID,
  WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATIONS,
  WALLET_FIRST_DEFERRED_CHECKOUT_QUOTES_TABLE,
  applyWalletFirstDeferredCheckoutMigrations
} from "../services/platform/wallet-first-deferred-checkout-migrations.mjs";
import {
  createWalletFirstDeferredCheckoutAdapter,
  snapshotWalletFirstDeferredCheckoutAdapter,
  WALLET_FIRST_DEFERRED_CHECKOUT_ADAPTER_CONTRACT,
  WALLET_FIRST_DEFERRED_CHECKOUT_SURFACE_METHODS
} from "../services/platform/wallet-first-deferred-checkout-adapter.mjs";
import {
  createWalletFirstCommerceService
} from "../services/platform/wallet-first-commerce-service.mjs";

const NOW = "2030-01-01T00:00:00.000Z";
const PLAN = Object.freeze({
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

function foundation() {
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
    expectedDdlChecksum: REQUIRED_DEFERRED_RESOURCE_TRANSITION_DDL_CHECKSUM,
    nowFn: () => new Date(NOW)
  });
  applyWalletFirstDeferredCheckoutMigrations({
    database,
    expectedMigrationId: REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID,
    expectedDdlChecksum: WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(NOW)
  });
  return database;
}

function seedAccount(database, accountId) {
  database.prepare(`
    insert into platform_accounts(id, owner_ref, status, created_at, updated_at, metadata_json)
    values (?, ?, 'active', ?, ?, ?)
  `).run(
    accountId,
    `owner_${accountId}`,
    NOW,
    NOW,
    JSON.stringify({ commercialModel: "wallet_first_unique_v1" })
  );
}

function offer() {
  return {
    offerRef: PLAN.offerRef,
    offerVersionRef: PLAN.offerVersionRef,
    version: 1,
    category: "plan",
    title: { zh: "200 GB 年度套餐", en: "200 GB annual plan" },
    summary: { zh: "测试套餐", en: "Test plan" },
    importantNotices: { zh: ["测试"], en: ["Test"] },
    baseCoinUnits: PLAN.baseCoinUnits,
    referencePrice: { currency: "CNY", amountMinor: 20000 },
    acceptedCoinTypes: ["bonus_coins", "paid_coins", "reward_coins"],
    delivery: {
      kind: "subscription_plan",
      durationDays: 365,
      monthlyTrafficGb: 200,
      trafficGb: null,
      neverExpires: false,
      discountBasisPoints: 0
    }
  };
}

function seedOffer(database) {
  const value = offer();
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
    value.offerVersionRef,
    value.offerRef,
    value.title.zh,
    value.title.en,
    value.summary.zh,
    value.summary.en,
    JSON.stringify(value.importantNotices.zh),
    JSON.stringify(value.importantNotices.en),
    value.baseCoinUnits,
    value.referencePrice.amountMinor,
    JSON.stringify(value.acceptedCoinTypes),
    NOW,
    NOW
  );
}

function credit(database, accountId, amountUnits, sourceRef) {
  const wallet = createSqliteCoinWalletStore({
    database,
    nowFn: () => new Date(NOW),
    refFactory: references(`wallet_${sourceRef}`)
  });
  try {
    wallet.creditCoins({
      accountId,
      coinType: "paid_coins",
      amountUnits,
      availability: "available",
      sourceType: "checkout_adapter_test",
      sourceRef,
      sourceDigest: "a".repeat(64),
      policyRef: null,
      policyVersion: null,
      expiresAt: null,
      operation: {
        actorScope: `test:${accountId}`,
        idempotencyKey: `credit_${sourceRef}`,
        actorType: "system",
        actorRef: "checkout_adapter_test"
      }
    });
  } finally {
    wallet.close();
  }
}

function context(scheduledFor = NOW) {
  return {
    flowKind: "initial_activation",
    scheduledFor,
    expectedEntitlementId: null,
    expectedRequestId: null,
    expectedIssuedLinkId: null,
    expectedValidUntil: null
  };
}

function operation(accountId, idempotencyKey) {
  return {
    actorScope: `portal:${accountId}`,
    idempotencyKey,
    actorType: "portal_user",
    actorRef: accountId
  };
}

function createAdapter(database, clock) {
  const deferredTransitionStore = createSqliteDeferredResourceTransitionStore({
    database,
    nowFn: () => new Date(clock.value),
    refFactory: references("transition"),
    leaseTokenFactory: () => "a".repeat(64)
  });
  const adapter = createWalletFirstDeferredCheckoutAdapter({
    database,
    deferredTransitionStore,
    nowFn: () => new Date(clock.value),
    refFactory: references("quote"),
    quoteTtlMs: 60_000
  });
  return { adapter, deferredTransitionStore };
}

test("runtime snapshot accepts only a factory-created dedicated adapter", () => {
  const database = foundation();
  try {
    const accountId = "acct_quote_snapshot";
    seedAccount(database, accountId);
    seedOffer(database);
    const clock = { value: NOW };
    const { adapter, deferredTransitionStore } = createAdapter(database, clock);
    try {
      const snapshot = snapshotWalletFirstDeferredCheckoutAdapter(adapter);
      assert.notEqual(snapshot, adapter);
      assert.equal(snapshot.contract, WALLET_FIRST_DEFERRED_CHECKOUT_ADAPTER_CONTRACT);
      assert.deepEqual(
        Object.keys(snapshot),
        ["contract", ...WALLET_FIRST_DEFERRED_CHECKOUT_SURFACE_METHODS, "close"]
      );
      assert.deepEqual(snapshot.listOffers({ accountId }), [offer()]);
      const forged = Object.freeze({
        contract: WALLET_FIRST_DEFERRED_CHECKOUT_ADAPTER_CONTRACT,
        ...Object.fromEntries(
          [...WALLET_FIRST_DEFERRED_CHECKOUT_SURFACE_METHODS, "close"].map(
            (methodName) => [methodName, () => null]
          )
        )
      });
      assert.throws(
        () => snapshotWalletFirstDeferredCheckoutAdapter(forged),
        (error) => error?.code === "wallet_first_deferred_checkout_invalid"
      );
    } finally {
      adapter.close();
      deferredTransitionStore.close();
    }
  } finally {
    database.close();
  }
});

test("exact deferred lookup never scans the bounded transition list", () => {
  const database = foundation();
  const calls = [];
  const expected = Object.freeze({ transitionRef: "transition_direct_lookup" });
  const deferredTransitionStore = Object.freeze({
    reserveTransitionFromCheckoutQuote() {
      throw new Error("reserve is not part of this lookup test");
    },
    listTransitions() {
      throw new Error("bounded list must not be used for an exact lookup");
    },
    getTransition(input) {
      calls.push(input);
      return expected;
    },
    cancelTransition() {
      throw new Error("cancel is not part of this lookup test");
    }
  });
  const adapter = createWalletFirstDeferredCheckoutAdapter({
    database,
    deferredTransitionStore,
    nowFn: () => new Date(NOW),
    refFactory: references("quote_direct_lookup")
  });
  try {
    assert.equal(adapter.getDeferredTransition({
      accountId: "acct_direct_lookup",
      transitionRef: expected.transitionRef
    }), expected);
    assert.deepEqual(calls, [{
      accountId: "acct_direct_lookup",
      transitionRef: expected.transitionRef
    }]);
  } finally {
    adapter.close();
    database.close();
  }
});

test("adapter preserves route-safe deferred reservation errors", () => {
  const database = foundation();
  const codes = [
    "deferred_transition_queue_full",
    "deferred_transition_state_conflict",
    "deferred_transition_account_not_eligible",
    "deferred_reservation_capture_invalid",
    "reconciliation_required"
  ];
  let code = codes[0];
  const deferredTransitionStore = Object.freeze({
    reserveTransitionFromCheckoutQuote() {
      const error = new Error("synthetic safe deferred failure");
      error.code = code;
      throw error;
    },
    listTransitions() {
      return [];
    },
    getTransition() {
      return null;
    },
    cancelTransition() {
      return null;
    }
  });
  const adapter = createWalletFirstDeferredCheckoutAdapter({
    database,
    deferredTransitionStore,
    nowFn: () => new Date(NOW),
    refFactory: references("safe_error")
  });
  try {
    for (const expectedCode of codes) {
      code = expectedCode;
      assert.throws(
        () => adapter.reserveDeferredTransition({
          accountId: "acct_safe_error",
          quoteRef: "quote_safe_error",
          operation: operation("acct_safe_error", `reserve_${expectedCode}`)
        }),
        (error) => error?.code === expectedCode
      );
    }
  } finally {
    adapter.close();
    database.close();
  }
});

test("dedicated preview binds price, wallet version and server transition context", () => {
  const database = foundation();
  try {
    const accountId = "acct_quote_preview";
    seedAccount(database, accountId);
    seedOffer(database);
    credit(database, accountId, 200, "fund_preview");
    const clock = { value: NOW };
    const { adapter, deferredTransitionStore } = createAdapter(database, clock);
    try {
      const quote = adapter.previewDeferredCheckout({
        accountId,
        offerRef: PLAN.offerRef,
        transitionContext: context()
      });
      assert.equal(quote.purchaseAvailability, "available");
      assert.equal(quote.amountUnits, 200);
      assert.deepEqual(quote.allocation, [{ coinType: "paid_coins", amountUnits: 200 }]);
      assert.equal(quote.transition.flowKind, "initial_activation");
      const stored = database.prepare(`
        select offer_version_ref, wallet_version, amount_units, flow_kind,
               scheduled_for, status, transition_ref
          from ${WALLET_FIRST_DEFERRED_CHECKOUT_QUOTES_TABLE}
         where quote_ref = ?
      `).get(quote.quoteRef);
      assert.deepEqual(stored, {
        offer_version_ref: PLAN.offerVersionRef,
        wallet_version: 1,
        amount_units: 200,
        flow_kind: "initial_activation",
        scheduled_for: NOW,
        status: "active",
        transition_ref: null
      });
      assert.equal(database.prepare("select count(*) from platform_coin_commerce_orders").pluck().get(), 0);
      assert.equal(database.prepare("select count(*) from platform_coin_holds").pluck().get(), 0);
    } finally {
      adapter.close();
      deferredTransitionStore.close();
    }
  } finally {
    database.close();
  }
});

test("confirmation atomically consumes the dedicated quote and creates one deferred reservation", () => {
  const database = foundation();
  try {
    const accountId = "acct_quote_confirm";
    seedAccount(database, accountId);
    seedOffer(database);
    credit(database, accountId, 200, "fund_confirm");
    const clock = { value: NOW };
    const { adapter, deferredTransitionStore } = createAdapter(database, clock);
    try {
      const quote = adapter.previewDeferredCheckout({
        accountId,
        offerRef: PLAN.offerRef,
        transitionContext: context()
      });
      const first = adapter.reserveDeferredTransition({
        accountId,
        quoteRef: quote.quoteRef,
        operation: operation(accountId, "reserve_quote_1")
      });
      const replay = adapter.reserveDeferredTransition({
        accountId,
        quoteRef: quote.quoteRef,
        operation: operation(accountId, "reserve_quote_1")
      });
      assert.deepEqual(replay, first);
      assert.equal(first.state, "reserved");
      assert.equal(database.prepare(`
        select status, transition_ref
          from ${WALLET_FIRST_DEFERRED_CHECKOUT_QUOTES_TABLE}
         where quote_ref = ?
      `).get(quote.quoteRef).status, "reserved");
      assert.equal(database.prepare(`
        select transition_ref
          from ${WALLET_FIRST_DEFERRED_CHECKOUT_QUOTES_TABLE}
         where quote_ref = ?
      `).pluck().get(quote.quoteRef), first.transitionRef);
      assert.equal(database.prepare("select count(*) from platform_coin_commerce_orders").pluck().get(), 0);
      assert.equal(database.prepare("select count(*) from platform_coin_holds").pluck().get(), 0);
      assert.equal(database.prepare(`
        select count(*) from platform_deferred_resource_transition_reservations
      `).pluck().get(), 1);
      assert.throws(() => adapter.reserveDeferredTransition({
        accountId,
        quoteRef: quote.quoteRef,
        operation: operation(accountId, "reserve_quote_other_key")
      }), (error) => error?.code === "quote_stale");
      assert.equal(deferredTransitionStore.listTransitions({ accountId }).length, 1);
    } finally {
      adapter.close();
      deferredTransitionStore.close();
    }
  } finally {
    database.close();
  }
});

test("initial activation reserves the immutable quote context across a later server tick", () => {
  const database = foundation();
  try {
    const accountId = "acct_quote_cross_tick";
    seedAccount(database, accountId);
    seedOffer(database);
    credit(database, accountId, 200, "fund_cross_tick");
    const clock = { value: NOW };
    const { adapter, deferredTransitionStore } = createAdapter(database, clock);
    try {
      let resourceResolverCalls = 0;
      const service = createWalletFirstCommerceService({
        deferredSurface: snapshotWalletFirstDeferredCheckoutAdapter(adapter),
        resourceChainResolver: {
          resolveCurrentResourceChain() {
            resourceResolverCalls += 1;
            return { state: "none" };
          }
        },
        nowFn: () => new Date(clock.value)
      });
      const quote = service.previewDeferredCheckout({
        accountId,
        offerRef: PLAN.offerRef
      });
      assert.equal(quote.transition.scheduledFor, NOW);
      clock.value = "2030-01-01T00:00:01.000Z";
      const transition = service.reserveDeferredTransition({
        accountId,
        quoteRef: quote.quoteRef,
        operation: operation(accountId, "reserve_cross_tick")
      });
      assert.equal(resourceResolverCalls, 1);
      assert.equal(transition.state, "reserved");
      assert.equal(transition.flowKind, "initial_activation");
      assert.equal(transition.scheduledFor, NOW);
      assert.equal(deferredTransitionStore.listTransitions({ accountId }).length, 1);
      assert.equal(database.prepare(`
        select scheduled_for
          from platform_deferred_resource_transitions
         where transition_ref = ?
      `).pluck().get(transition.transitionRef), NOW);
    } finally {
      adapter.close();
      deferredTransitionStore.close();
    }
  } finally {
    database.close();
  }
});

test("expired, caller-context-injected, or wallet-version-stale quotes fail closed before a reservation", () => {
  const database = foundation();
  try {
    const accountId = "acct_quote_stale";
    seedAccount(database, accountId);
    seedOffer(database);
    credit(database, accountId, 400, "fund_stale_one");
    const clock = { value: NOW };
    const { adapter, deferredTransitionStore } = createAdapter(database, clock);
    try {
      const stale = adapter.previewDeferredCheckout({
        accountId,
        offerRef: PLAN.offerRef,
        transitionContext: context()
      });
      credit(database, accountId, 1, "fund_stale_two");
      assert.throws(() => adapter.reserveDeferredTransition({
        accountId,
        quoteRef: stale.quoteRef,
        operation: operation(accountId, "reserve_stale_wallet")
      }), (error) => error?.code === "quote_stale");

      const contextDrift = adapter.previewDeferredCheckout({
        accountId,
        offerRef: PLAN.offerRef,
        transitionContext: context()
      });
      assert.throws(() => adapter.reserveDeferredTransition({
        accountId,
        quoteRef: contextDrift.quoteRef,
        operation: operation(accountId, "reserve_stale_context"),
        transitionContext: context("2030-01-01T00:00:01.000Z")
      }), (error) => error?.code === "wallet_first_deferred_checkout_invalid");

      const expired = adapter.previewDeferredCheckout({
        accountId,
        offerRef: PLAN.offerRef,
        transitionContext: context()
      });
      clock.value = "2030-01-01T00:01:01.000Z";
      assert.throws(() => adapter.reserveDeferredTransition({
        accountId,
        quoteRef: expired.quoteRef,
        operation: operation(accountId, "reserve_expired_quote")
      }), (error) => error?.code === "quote_expired");
      assert.equal(deferredTransitionStore.listTransitions({ accountId }).length, 0);
      assert.equal(database.prepare(`
        select count(*) from platform_deferred_resource_transition_reservations
      `).pluck().get(), 0);
    } finally {
      adapter.close();
      deferredTransitionStore.close();
    }
  } finally {
    database.close();
  }
});
