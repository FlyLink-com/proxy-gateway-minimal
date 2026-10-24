import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { createAdminOrderStatusSummaryService } from "../services/platform/admin-order-status-summary.mjs";
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
import { applyPaymentStoreMigrations } from "../services/platform/payment-store-migrations.mjs";

const NOW = "2026-10-24T00:00:00.000Z";
const DIGEST = "ab".repeat(32);
const EMAIL = "sentinel.user@example.test";
const TOKEN = "subscription-token-sentinel";
const REFERENCE_MINOR = 888888;
const OUTSIDE_AMOUNT = 424242;
const PAYMENT_STATUSES = [
  "created",
  "entry_ready",
  "pending",
  "payment_verified",
  "credited",
  "failed_no_charge",
  "reconciliation_required",
  "expired"
];
const COIN_STATUSES = [
  "held",
  "capture_pending",
  "captured",
  "cancelled",
  "capture_failed",
  "reconciliation_required"
];

function migrate(db) {
  db.pragma("foreign_keys = ON");
  db.exec(`create table platform_accounts(
    id text primary key, owner_ref text not null, status text not null,
    created_at text not null, updated_at text not null, metadata_json text not null default '{}')`);
  applyCoinWalletMigrations({
    database: db,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date("2026-09-01T00:00:00.000Z")
  });
  applyPaymentStoreMigrations({ database: db, nowFn: () => "2026-09-01T00:00:00.000Z" });
  applyCoinCommerceMigrations({
    database: db,
    expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date("2026-09-01T00:00:00.000Z")
  });
}

function addAccount(db, id) {
  db.prepare(`
    insert into platform_accounts (
      id, owner_ref, status, created_at, updated_at, metadata_json
    ) values (?, ?, 'active', ?, ?, ?)
  `).run(
    id,
    `owner_${id}`,
    NOW,
    NOW,
    JSON.stringify({ email: EMAIL, subscriptionUrl: `https://secret.example/sub/a/${TOKEN}` })
  );
}

function insertPayment(db, row) {
  const credited = row.status === "credited";
  db.prepare(`
    insert into platform_payment_orders (
      payment_order_ref, account_id, offer_ref, create_idempotency_key,
      create_request_digest, quote_version, expected_paid_coin_units,
      amount_minor, currency, currency_exponent, quote_digest,
      adapter_key, payment_method, merchant_binding_ref, status,
      latest_receipt_ref, wallet_operation_ref, wallet_lot_ref, provider_order_ref,
      expires_at, created_at, updated_at
    ) values (
      ?, ?, 'offer_sentinel', ?, ?, 1, 1,
      ?, ?, ?, ?,
      'adapter_sentinel', 'method_sentinel', 'merchant_sentinel', ?,
      ?, ?, ?, ?,
      '2026-12-01T00:00:00.000Z', ?, ?
    )
  `).run(
    row.orderRef,
    row.accountId,
    row.orderRef,
    DIGEST,
    row.amountMinor,
    row.currency,
    row.currencyExponent,
    DIGEST,
    row.status,
    credited ? `receipt_sentinel_${row.orderRef}` : null,
    credited ? `wallet_op_sentinel_${row.orderRef}` : null,
    credited ? `wallet_lot_sentinel_${row.orderRef}` : null,
    credited ? `provider_sentinel_${row.orderRef}` : null,
    row.createdAt,
    row.createdAt
  );
}

function insertOffer(db, { offerVersionRef, offerRef, kind }) {
  const plan = kind === "subscription_plan";
  db.prepare(`
    insert into platform_coin_commerce_offer_versions (
      offer_version_ref, offer_ref, version, status, category,
      title_zh, title_en, summary_zh, summary_en,
      important_notices_zh_json, important_notices_en_json,
      base_coin_units, reference_currency, reference_amount_minor,
      accepted_coin_types_json, delivery_kind, duration_days,
      monthly_traffic_gb, traffic_gb, never_expires,
      discount_basis_points, created_at, published_at, retired_at
    ) values (
      ?, ?, 1, 'published', ?,
      '合成方案', 'Synthetic plan', '合成测试', 'Synthetic test',
      ?, ?,
      20, 'CNY', ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, null
    )
  `).run(
    offerVersionRef,
    offerRef,
    plan ? "plan" : "data_pack",
    JSON.stringify(["合成测试", EMAIL]),
    JSON.stringify(["Synthetic test", TOKEN]),
    REFERENCE_MINOR,
    JSON.stringify(["paid_coins"]),
    kind,
    plan ? 30 : null,
    plan ? 50 : null,
    plan ? null : 100,
    plan ? 0 : 1,
    plan ? 0 : null,
    NOW,
    NOW
  );
}

function insertCoinOrder(db, row) {
  const walletRef = `wallet_${row.accountId}`;
  const quoteRef = `quote_${row.orderRef}`;
  const holdRef = `hold_${row.orderRef}`;
  db.prepare(`
    insert into platform_coin_wallets (
      wallet_ref, account_id, status, version, created_at, updated_at
    ) values (?, ?, 'active', 0, ?, ?)
    on conflict(account_id) do nothing
  `).run(walletRef, row.accountId, NOW, NOW);
  db.prepare(`
    insert into platform_coin_commerce_quotes (
      quote_ref, account_id, offer_version_ref, wallet_version,
      amount_units, applied_discount_basis_points,
      purchase_availability, shortfall_units, allocation_json,
      before_balance_json, after_balance_json, status,
      created_at, expires_at, consumed_at
    ) values (
      ?, ?, ?, 0, ?, 0, 'available', 0, '[]',
      '{}', '{}', 'consumed', ?, '2026-12-01T00:00:00.000Z', ?
    )
  `).run(quoteRef, row.accountId, row.offerVersionRef, row.amountUnits, NOW, NOW);
  db.prepare(`
    insert into platform_coin_holds (
      hold_ref, wallet_ref, purpose, purpose_ref, amount_units,
      status, expires_at, created_at, updated_at
    ) values (?, ?, 'product_purchase', ?, ?, 'active', '2026-12-01T00:00:00.000Z', ?, ?)
  `).run(holdRef, walletRef, row.orderRef, row.amountUnits, NOW, NOW);
  db.prepare(`
    insert into platform_coin_commerce_orders (
      order_ref, account_id, quote_ref, offer_version_ref, hold_ref,
      amount_units, offer_snapshot_json, allocation_snapshot_json,
      payment_status, cancel_until, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, '[]', ?, '2026-12-01T00:00:00.000Z', ?, ?)
  `).run(
    row.orderRef,
    row.accountId,
    quoteRef,
    row.offerVersionRef,
    holdRef,
    row.amountUnits,
    JSON.stringify({ email: EMAIL, token: TOKEN, referenceAmountMinor: REFERENCE_MINOR }),
    row.paymentStatus,
    row.createdAt,
    row.createdAt
  );
}

function remember(map, key, amount) {
  const current = map.get(key) || { orderCount: 0, total: 0 };
  current.orderCount += 1;
  current.total += amount;
  map.set(key, current);
}

function openFixture() {
  const db = new Database(":memory:");
  migrate(db);
  addAccount(db, "acct_sentinel_a");
  addAccount(db, "acct_sentinel_b");
  const recharge = new Map();
  const coins = new Map();
  const payments = [
    ["pay_order_sentinel_created_a", "acct_sentinel_a", "created", "USD", 2, 11, "2026-10-01T00:00:00.000Z"],
    ["pay_order_sentinel_created_b", "acct_sentinel_b", "created", "USD", 2, 13, "2026-10-03T00:00:00.000Z"],
    ["pay_order_sentinel_entry", "acct_sentinel_a", "entry_ready", "USD", 2, 17, "2026-10-02T00:00:00.000Z"],
    ["pay_order_sentinel_pending", "acct_sentinel_a", "pending", "CNY", 2, 19, "2026-10-02T00:00:00.000Z"],
    ["pay_order_sentinel_verified", "acct_sentinel_a", "payment_verified", "USD", 2, 23, "2026-10-04T00:00:00.000Z"],
    ["pay_order_sentinel_credited", "acct_sentinel_b", "credited", "USD", 2, 29, "2026-10-04T00:00:00.000Z"],
    ["pay_order_sentinel_failed", "acct_sentinel_a", "failed_no_charge", "EUR", 2, 31, "2026-10-05T00:00:00.000Z"],
    ["pay_order_sentinel_recon", "acct_sentinel_a", "reconciliation_required", "USD", 2, 37, "2026-10-05T00:00:00.000Z"],
    ["pay_order_sentinel_expired", "acct_sentinel_a", "expired", "USD", 0, 41, "2026-10-06T00:00:00.000Z"],
    ["pay_order_sentinel_before", "acct_sentinel_a", "created", "USD", 2, OUTSIDE_AMOUNT, "2026-09-23T23:59:59.999Z"],
    ["pay_order_sentinel_edge", "acct_sentinel_a", "created", "USD", 2, 43, "2026-09-24T00:00:00.000Z"],
    ["pay_order_sentinel_to", "acct_sentinel_a", "pending", "USD", 2, 47, "2026-10-08T00:00:00.000Z"],
    ["pay_order_sentinel_after", "acct_sentinel_a", "created", "USD", 2, OUTSIDE_AMOUNT, "2026-10-24T00:00:00.000Z"]
  ];
  for (const [orderRef, accountId, status, currency, currencyExponent, amountMinor, createdAt] of payments) {
    insertPayment(db, { orderRef, accountId, status, currency, currencyExponent, amountMinor, createdAt });
  }
  for (const row of payments) {
    const createdAt = row[6];
    if (createdAt >= "2026-10-01T00:00:00.000Z" && createdAt < "2026-10-08T00:00:00.000Z") {
      remember(recharge, `${row[2]}|${row[3]}|${row[4]}`, row[5]);
    }
  }

  insertOffer(db, {
    offerVersionRef: "offerv_plan",
    offerRef: "offer_plan",
    kind: "subscription_plan"
  });
  insertOffer(db, {
    offerVersionRef: "offerv_pack",
    offerRef: "offer_pack",
    kind: "data_pack"
  });
  const coinRows = [
    ["coin_order_sentinel_held_plan", "held", "offerv_plan", 3, "2026-10-01T00:00:00.000Z"],
    ["coin_order_sentinel_held_plan_b", "held", "offerv_plan", 5, "2026-10-02T00:00:00.000Z"],
    ["coin_order_sentinel_pending", "capture_pending", "offerv_plan", 7, "2026-10-02T00:00:00.000Z"],
    ["coin_order_sentinel_captured_plan", "captured", "offerv_plan", 9, "2026-10-03T00:00:00.000Z"],
    ["coin_order_sentinel_cancelled", "cancelled", "offerv_pack", 11, "2026-10-03T00:00:00.000Z"],
    ["coin_order_sentinel_failed", "capture_failed", "offerv_pack", 15, "2026-10-04T00:00:00.000Z"],
    ["coin_order_sentinel_recon", "reconciliation_required", "offerv_pack", 17, "2026-10-05T00:00:00.000Z"],
    ["coin_order_sentinel_captured_pack", "captured", "offerv_pack", 19, "2026-10-06T00:00:00.000Z"],
    ["coin_order_sentinel_outside", "captured", "offerv_plan", OUTSIDE_AMOUNT, "2026-09-01T00:00:00.000Z"],
    ["coin_order_sentinel_to", "held", "offerv_pack", 53, "2026-10-08T00:00:00.000Z"]
  ];
  for (const [orderRef, paymentStatus, offerVersionRef, amountUnits, createdAt] of coinRows) {
    insertCoinOrder(db, {
      orderRef,
      accountId: orderRef.endsWith("_b") ? "acct_sentinel_b" : "acct_sentinel_a",
      paymentStatus,
      offerVersionRef,
      amountUnits,
      createdAt
    });
    if (createdAt >= "2026-10-01T00:00:00.000Z" && createdAt < "2026-10-08T00:00:00.000Z") {
      const kind = offerVersionRef === "offerv_plan" ? "subscription_plan" : "data_pack";
      remember(coins, `${paymentStatus}|${kind}`, amountUnits);
    }
  }
  return { db, recharge, coins };
}

function summary(db, query, now = NOW) {
  return createAdminOrderStatusSummaryService({
    database: db,
    nowFn: () => new Date(now)
  }).readSummary(query);
}

function guarded() {
  const db = new Database(":memory:");
  let reads = 0;
  const proxy = new Proxy(db, {
    get(target, property, receiver) {
      if (property === "prepare" || property === "exec" || property === "pragma") {
        return (...args) => {
          reads += 1;
          return target[property](...args);
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  return { db: proxy, reads: () => reads, close: () => db.close() };
}

test("invalid windows are rejected before the clock or the database", () => {
  const guard = guarded();
  let clocks = 0;
  const service = createAdminOrderStatusSummaryService({
    database: guard.db,
    nowFn: () => {
      clocks += 1;
      return new Date(NOW);
    }
  });
  const from = "2026-10-01T00:00:00.000Z";
  const to = "2026-10-08T00:00:00.000Z";
  const invalid = [
    null,
    [],
    "from",
    { from },
    { to },
    { from: to, to: from },
    { from, to: from },
    { from: "2026-02-31T00:00:00.000Z", to: "2026-03-03T00:00:00.000Z" },
    { from: "2026-13-01T00:00:00.000Z", to },
    { from: "2026-10-01T25:00:00.000Z", to },
    { from: "2026-02-30T00:00:00.000Z", to: "2026-03-02T00:00:00.000Z" },
    { from: "2026-02-29T00:00:00.000Z", to: "2026-03-01T00:00:00.000Z" },
    { from: "1900-02-29T00:00:00.000Z", to: "1900-03-01T00:00:00.000Z" },
    { from: "2026-10-01T00:60:00.000Z", to },
    { from: "2026-10-01T00:00:60.000Z", to },
    { from: "2026-10-01T00:00:00Z", to },
    { from: "2026-10-01", to: "2026-10-08" },
    { from, to, accountId: "acct_sentinel_a" },
    { from, to: "2026-11-01T00:00:00.001Z" },
    { from: [from], to }
  ];
  try {
    for (const query of invalid) {
      assert.throws(() => service.readSummary(query), { code: "invalid_query" });
    }
    const inherited = Object.create({ from, to });
    assert.throws(() => service.readSummary(inherited), { code: "invalid_query" });
    assert.equal(clocks, 0);
    assert.equal(guard.reads(), 0);
  } finally {
    guard.close();
  }
});

test("a valid window does not open the database when the clock is unusable", () => {
  const guard = guarded();
  const service = createAdminOrderStatusSummaryService({
    database: guard.db,
    nowFn: () => {
      throw new Error("clock_sentinel");
    }
  });
  try {
    assert.throws(() => service.readSummary({}), { code: "source_unavailable" });
    assert.throws(() => service.readSummary({
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-08T00:00:00.000Z"
    }), { code: "source_unavailable" });
    assert.equal(guard.reads(), 0);
  } finally {
    guard.close();
  }
});

test("groups recharge and Coins orders without mixing units, statuses, or windows", () => {
  const { db, recharge, coins } = openFixture();
  try {
    const body = summary(db, {
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-08T00:00:00.000Z"
    });
    assert.equal(body.schemaVersion, "operations-order-status-summary/v1");
    assert.equal(body.generatedAt, NOW);
    assert.equal(body.freshness, "fresh");
    assert.equal(body.sourceState, "implemented_source");
    assert.deepEqual(body.warnings, []);
    assert.deepEqual(body.access, {
      allowed: true,
      capability: "operations.read",
      reasonCode: "allowed"
    });
    assert.equal(body.data.definition, "current_status_of_orders_created_in_window");
    assert.deepEqual(body.data.window, {
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-08T00:00:00.000Z",
      bound: "[from, to)"
    });
    assert.equal(body.data.rechargeOrders.amountMeaning, "order_amount_minor_units");
    assert.equal(body.data.coinCommerceOrders.amountMeaning, "coin_units");

    const rechargeGroups = body.data.rechargeOrders.groups;
    assert.deepEqual(
      rechargeGroups.map((group) => `${group.status}|${group.currency}|${group.currencyExponent}`),
      [...recharge.keys()].sort()
    );
    for (const group of rechargeGroups) {
      const expected = recharge.get(`${group.status}|${group.currency}|${group.currencyExponent}`);
      assert.equal(group.orderCount, expected.orderCount);
      assert.equal(group.orderAmountMinorTotal, expected.total);
      assert.deepEqual(Object.keys(group), [
        "status",
        "currency",
        "currencyExponent",
        "orderCount",
        "orderAmountMinorTotal"
      ]);
    }
    const createdUsd = rechargeGroups.find((group) => (
      group.status === "created" && group.currency === "USD" && group.currencyExponent === 2
    ));
    assert.equal(createdUsd.orderCount, 2);
    assert.equal(createdUsd.orderAmountMinorTotal, 24);
    const verified = rechargeGroups.find((group) => group.status === "payment_verified");
    const credited = rechargeGroups.find((group) => group.status === "credited");
    assert.equal(verified.orderAmountMinorTotal, 23);
    assert.equal(credited.orderAmountMinorTotal, 29);
    assert.equal(rechargeGroups.some((group) => group.currency === "USD" && group.currencyExponent === 0), true);
    assert.equal(rechargeGroups.some((group) => group.currency === "CNY"), true);
    assert.equal(rechargeGroups.some((group) => group.currency === "EUR"), true);

    const coinGroups = body.data.coinCommerceOrders.groups;
    assert.deepEqual(
      coinGroups.map((group) => `${group.paymentStatus}|${group.deliveryKind}`),
      [...coins.keys()].sort()
    );
    for (const group of coinGroups) {
      const expected = coins.get(`${group.paymentStatus}|${group.deliveryKind}`);
      assert.equal(group.orderCount, expected.orderCount);
      assert.equal(group.coinUnitsTotal, expected.total);
      assert.deepEqual(Object.keys(group), [
        "paymentStatus",
        "deliveryKind",
        "orderCount",
        "coinUnitsTotal"
      ]);
    }
    const heldPlan = coinGroups.find((group) => (
      group.paymentStatus === "held" && group.deliveryKind === "subscription_plan"
    ));
    const capturedPlan = coinGroups.find((group) => (
      group.paymentStatus === "captured" && group.deliveryKind === "subscription_plan"
    ));
    const capturedPack = coinGroups.find((group) => (
      group.paymentStatus === "captured" && group.deliveryKind === "data_pack"
    ));
    assert.equal(heldPlan.orderCount, 2);
    assert.equal(heldPlan.coinUnitsTotal, 8);
    assert.equal(capturedPlan.coinUnitsTotal, 9);
    assert.equal(capturedPack.coinUnitsTotal, 19);
    assert.equal(coinGroups.some((group) => group.deliveryKind === "subscription_plan"), true);
    assert.equal(coinGroups.some((group) => group.deliveryKind === "data_pack"), true);
    assert.deepEqual(
      [...new Set(rechargeGroups.map((group) => group.status))].sort(),
      [...PAYMENT_STATUSES].sort()
    );
    assert.deepEqual(
      [...new Set(coinGroups.map((group) => group.paymentStatus))].sort(),
      [...COIN_STATUSES].sort()
    );

    const encoded = JSON.stringify(body);
    for (const needle of [
      EMAIL,
      TOKEN,
      "acct_sentinel",
      "pay_order_sentinel",
      "coin_order_sentinel",
      "receipt_sentinel",
      "provider_sentinel",
      "wallet_op_sentinel",
      "subscriptionUrl",
      String(REFERENCE_MINOR),
      String(OUTSIDE_AMOUNT),
      "revenue",
      "income",
      "refunded",
      "transition",
      "\"cash\"",
      "\"paid\"",
      "\"failed\""
    ]) {
      assert.equal(encoded.includes(needle), false, needle);
    }
    assert.equal(encoded.includes("order_amount_minor_units"), true);
    assert.equal(encoded.includes("coin_units"), true);
    assert.equal(encoded.includes("current_status_of_orders_created_in_window"), true);
  } finally {
    db.close();
  }
});

test("an empty window is a real empty result and the default window is thirty days", () => {
  const { db } = openFixture();
  try {
    const empty = summary(db, {
      from: "2020-01-01T00:00:00.000Z",
      to: "2020-02-01T00:00:00.000Z"
    });
    assert.equal(empty.sourceState, "implemented_source");
    assert.deepEqual(empty.warnings, []);
    assert.deepEqual(empty.data.rechargeOrders.groups, []);
    assert.deepEqual(empty.data.coinCommerceOrders.groups, []);

    const leapDay = summary(db, {
      from: "2024-02-29T00:00:00.000Z",
      to: "2024-03-01T00:00:00.000Z"
    });
    assert.equal(leapDay.data.window.from, "2024-02-29T00:00:00.000Z");
    assert.deepEqual(leapDay.data.rechargeOrders.groups, []);
    const centuryLeap = summary(db, {
      from: "2000-02-29T00:00:00.000Z",
      to: "2000-03-01T00:00:00.000Z"
    });
    assert.equal(centuryLeap.data.window.from, "2000-02-29T00:00:00.000Z");

    const expressQuery = Object.create(null);
    expressQuery.from = "2026-10-01T00:00:00.000Z";
    expressQuery.to = "2026-10-01T00:00:00.001Z";
    const boundary = summary(db, expressQuery);
    assert.deepEqual(
      boundary.data.rechargeOrders.groups.map((group) => group.orderAmountMinorTotal),
      [11]
    );
    assert.deepEqual(
      boundary.data.coinCommerceOrders.groups.map((group) => group.coinUnitsTotal),
      [3]
    );

    const fallback = summary(db, {});
    assert.deepEqual(fallback.data.window, {
      from: "2026-09-24T00:00:00.000Z",
      to: NOW,
      bound: "[from, to)"
    });
    const included = fallback.data.rechargeOrders.groups
      .find((group) => group.status === "created" && group.currency === "USD" && group.currencyExponent === 2);
    assert.equal(included.orderAmountMinorTotal, 24 + 43);
    assert.equal(
      fallback.data.rechargeOrders.groups.some((group) => group.orderAmountMinorTotal === 47),
      true
    );
    assert.equal(JSON.stringify(fallback).includes(String(OUTSIDE_AMOUNT)), false);
  } finally {
    db.close();
  }
});

test("missing tables, unmatched offer versions, and unsafe sums fail closed", () => {
  const empty = new Database(":memory:");
  try {
    assert.throws(() => summary(empty, {
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-02T00:00:00.000Z"
    }), { code: "source_unavailable" });
  } finally {
    empty.close();
  }

  const paymentsOnly = new Database(":memory:");
  try {
    paymentsOnly.exec(`create table platform_accounts(
      id text primary key, owner_ref text not null, status text not null,
      created_at text not null, updated_at text not null, metadata_json text not null default '{}')`);
    applyCoinWalletMigrations({
      database: paymentsOnly,
      expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
      expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
      nowFn: () => new Date(NOW)
    });
    applyPaymentStoreMigrations({ database: paymentsOnly, nowFn: () => NOW });
    assert.throws(() => summary(paymentsOnly, {}), { code: "source_unavailable" });
  } finally {
    paymentsOnly.close();
  }

  const { db } = openFixture();
  try {
    db.pragma("foreign_keys = OFF");
    db.prepare("delete from platform_coin_commerce_offer_versions where offer_version_ref = ?").run("offerv_pack");
    db.pragma("foreign_keys = ON");
    assert.throws(() => summary(db, {
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-08T00:00:00.000Z"
    }), (error) => {
      assert.equal(error.code, "source_unavailable");
      assert.equal(JSON.stringify(error).includes("orderAmountMinorTotal"), false);
      assert.equal(String(error.message).includes("11"), false);
      return true;
    });
  } finally {
    db.close();
  }

  const overflow = new Database(":memory:");
  try {
    migrate(overflow);
    addAccount(overflow, "acct_sentinel_a");
    insertOffer(overflow, {
      offerVersionRef: "offerv_plan",
      offerRef: "offer_plan",
      kind: "subscription_plan"
    });
    const huge = 9007199254740991;
    insertPayment(overflow, {
      orderRef: "pay_order_sentinel_huge_a",
      accountId: "acct_sentinel_a",
      status: "created",
      currency: "USD",
      currencyExponent: 2,
      amountMinor: huge,
      createdAt: "2026-10-02T00:00:00.000Z"
    });
    insertPayment(overflow, {
      orderRef: "pay_order_sentinel_huge_b",
      accountId: "acct_sentinel_a",
      status: "created",
      currency: "USD",
      currencyExponent: 2,
      amountMinor: 2,
      createdAt: "2026-10-02T00:00:00.000Z"
    });
    insertPayment(overflow, {
      orderRef: "pay_order_sentinel_small",
      accountId: "acct_sentinel_a",
      status: "pending",
      currency: "CNY",
      currencyExponent: 2,
      amountMinor: 10,
      createdAt: "2026-10-02T00:00:00.000Z"
    });
    assert.throws(() => summary(overflow, {
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-03T00:00:00.000Z"
    }), { code: "source_unavailable" });

    const coinOnly = new Database(":memory:");
    try {
      migrate(coinOnly);
      addAccount(coinOnly, "acct_sentinel_a");
      insertOffer(coinOnly, {
        offerVersionRef: "offerv_plan",
        offerRef: "offer_plan",
        kind: "subscription_plan"
      });
      insertCoinOrder(coinOnly, {
        orderRef: "coin_order_sentinel_huge_a",
        accountId: "acct_sentinel_a",
        offerVersionRef: "offerv_plan",
        paymentStatus: "held",
        amountUnits: huge,
        createdAt: "2026-10-02T00:00:00.000Z"
      });
      insertCoinOrder(coinOnly, {
        orderRef: "coin_order_sentinel_huge_b",
        accountId: "acct_sentinel_a",
        offerVersionRef: "offerv_plan",
        paymentStatus: "held",
        amountUnits: huge,
        createdAt: "2026-10-02T00:00:00.000Z"
      });
      assert.throws(() => summary(coinOnly, {
        from: "2026-10-01T00:00:00.000Z",
        to: "2026-10-03T00:00:00.000Z"
      }), { code: "source_unavailable" });
    } finally {
      coinOnly.close();
    }
  } finally {
    overflow.close();
  }
});

test("the aggregate reads a file readonly and records the missing created_at index", () => {
  const directory = mkdtempSync(join(tmpdir(), "order-status-summary-"));
  const dbPath = join(directory, "control.sqlite");
  const db = new Database(dbPath);
  try {
    migrate(db);
    addAccount(db, "acct_sentinel_a");
    insertPayment(db, {
      orderRef: "pay_order_sentinel_file",
      accountId: "acct_sentinel_a",
      status: "pending",
      currency: "USD",
      currencyExponent: 2,
      amountMinor: 12,
      createdAt: "2026-10-02T00:00:00.000Z"
    });
    const paymentIndexes = db.prepare(`
      select sql from sqlite_master
       where type = 'index' and tbl_name = 'platform_payment_orders' and sql is not null
    `).all().map((row) => row.sql);
    assert.equal(paymentIndexes.length, 1);
    assert.match(paymentIndexes[0], /account_id, created_at desc, payment_order_ref desc/);
    const coinIndexes = db.prepare(`
      select sql from sqlite_master
       where type = 'index' and tbl_name = 'platform_coin_commerce_orders' and sql is not null
    `).all().map((row) => row.sql);
    assert.equal(coinIndexes.some((sql) => sql.includes("created_at")), false);
    const plan = db.prepare(`
      explain query plan
      select status, currency, currency_exponent, count(*), sum(amount_minor)
        from platform_payment_orders
       where created_at >= ? and created_at < ?
       group by status, currency, currency_exponent
    `).all("2026-10-01T00:00:00.000Z", "2026-10-08T00:00:00.000Z")
      .map((row) => row.detail)
      .join("\n");
    assert.match(plan, /SCAN platform_payment_orders/);
  } finally {
    db.close();
  }

  try {
    const body = createAdminOrderStatusSummaryService({
      dbPath,
      nowFn: () => new Date(NOW)
    }).readSummary({
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-08T00:00:00.000Z"
    });
    assert.deepEqual(body.data.rechargeOrders.groups, [{
      status: "pending",
      currency: "USD",
      currencyExponent: 2,
      orderCount: 1,
      orderAmountMinorTotal: 12
    }]);
    assert.deepEqual(body.data.coinCommerceOrders.groups, []);
    const conflicting = new Database(":memory:");
    try {
      assert.throws(() => createAdminOrderStatusSummaryService({
        database: conflicting,
        dbPath
      }), /source_conflict/);
    } finally {
      conflicting.close();
    }
    const missing = join(directory, "missing.sqlite");
    const service = createAdminOrderStatusSummaryService({
      dbPath: missing,
      nowFn: () => new Date(NOW)
    });
    assert.throws(() => service.readSummary({ extra: true }), { code: "invalid_query" });
    assert.throws(() => service.readSummary({
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-02T00:00:00.000Z"
    }), { code: "source_unavailable" });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
