import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { createAdminOrderStatusSummaryService } from "../services/platform/admin-order-status-summary.mjs";
import {
  RECHARGE_CONFIRMATION_GROSS_GROUP_SQL,
  createAdminRechargeConfirmationGrossService
} from "../services/platform/admin-recharge-confirmation-gross.mjs";
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
const FROM = "2026-10-01T00:00:00.000Z";
const TO = "2026-10-08T00:00:00.000Z";
const WINDOW = { from: FROM, to: TO };
const DIGEST = "ab".repeat(32);
const EMAIL = "sentinel.user@example.test";

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
  `).run(id, `owner_${id}`, NOW, NOW, JSON.stringify({
    email: EMAIL,
    subscriptionUrl: "https://secret.example/sub/a/subscription-token-sentinel"
  }));
}

function insertOrder(db, row) {
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
    row.latestReceiptRef ?? null,
    credited ? `wallet_op_${row.orderRef}` : null,
    credited ? `wallet_lot_${row.orderRef}` : null,
    row.providerOrderRef ?? `provider_${row.orderRef}`,
    row.createdAt,
    row.createdAt
  );
}

function insertReceipt(db, row) {
  const verified = row.verification === "verified";
  db.prepare(`
    insert into platform_payment_receipts (
      receipt_ref, payment_order_ref, attempt_ref, provider_request_ref,
      receipt_type, canonical_state, charge_certainty,
      provider_order_ref, provider_capture_ref, provider_event_ref,
      event_dedupe_key, merchant_scope_digest, payload_digest,
      verification_result, amount_minor, currency, currency_exponent,
      expected_paid_coin_units, accepted_at
    ) values (
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      1, ?
    )
  `).run(
    row.receiptRef,
    row.orderRef,
    `attempt_${row.receiptRef}`,
    row.providerRequestRef ?? `request_${row.receiptRef}`,
    row.receiptType,
    row.canonicalState,
    row.chargeCertainty,
    verified ? (row.providerOrderRef ?? `provider_${row.orderRef}`) : null,
    verified ? `capture_${row.receiptRef}` : null,
    verified ? `event_${row.receiptRef}` : null,
    verified ? (row.eventKey ?? `dedupe_${row.receiptRef}`) : null,
    verified ? DIGEST : null,
    verified ? DIGEST : null,
    row.verification,
    row.amountMinor,
    row.currency,
    row.currencyExponent,
    row.acceptedAt
  );
}

function confirmed(db, row) {
  insertOrder(db, {
    latestReceiptRef: row.receiptRef,
    providerOrderRef: `provider_${row.orderRef}`,
    ...row
  });
  insertReceipt(db, {
    receiptRef: row.receiptRef,
    orderRef: row.orderRef,
    receiptType: row.receiptType ?? "capture",
    canonicalState: "payment_succeeded",
    chargeCertainty: "confirmed_charged",
    verification: "verified",
    amountMinor: row.receiptAmountMinor ?? row.amountMinor,
    currency: row.receiptCurrency ?? row.currency,
    currencyExponent: row.receiptCurrencyExponent ?? row.currencyExponent,
    acceptedAt: row.acceptedAt,
    providerRequestRef: row.providerRequestRef,
    eventKey: row.eventKey
  });
}

function openDb() {
  const db = new Database(":memory:");
  migrate(db);
  addAccount(db, "acct_sentinel_gross");
  return db;
}

function gross(db, query = WINDOW, now = NOW) {
  return createAdminRechargeConfirmationGrossService({
    database: db,
    nowFn: () => new Date(now)
  }).readGross(query);
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
  const service = createAdminRechargeConfirmationGrossService({
    database: guard.db,
    nowFn: () => {
      clocks += 1;
      return new Date(NOW);
    }
  });
  const invalid = [
    null,
    [],
    { from: FROM },
    { to: TO },
    { from: TO, to: FROM },
    { from: FROM, to: FROM },
    { from: "2026-13-01T00:00:00.000Z", to: TO },
    { from: "2026-10-01T25:00:00.000Z", to: TO },
    { from: "2026-02-30T00:00:00.000Z", to: "2026-03-02T00:00:00.000Z" },
    { from: "2026-02-31T00:00:00.000Z", to: "2026-03-03T00:00:00.000Z" },
    { from: "2026-02-29T00:00:00.000Z", to: "2026-03-01T00:00:00.000Z" },
    { from: FROM, to: "2026-11-01T00:00:00.001Z" },
    { from: FROM, to: TO, accountId: "acct_sentinel_gross" }
  ];
  try {
    for (const query of invalid) {
      assert.throws(() => service.readGross(query), { code: "invalid_query" });
    }
    assert.equal(clocks, 0);
    assert.equal(guard.reads(), 0);
  } finally {
    guard.close();
  }
});

test("confirmation counts verified and credited charges once, and leaves other facts out", () => {
  const db = openDb();
  try {
    confirmed(db, {
      orderRef: "pay_order_verified",
      accountId: "acct_sentinel_gross",
      status: "payment_verified",
      amountMinor: 100,
      currency: "USD",
      currencyExponent: 2,
      createdAt: "2026-09-01T00:00:00.000Z",
      acceptedAt: "2026-10-03T00:00:00.000Z",
      receiptRef: "receipt_verified",
      receiptType: "capture"
    });
    confirmed(db, {
      orderRef: "pay_order_credited",
      accountId: "acct_sentinel_gross",
      status: "credited",
      amountMinor: 250,
      currency: "USD",
      currencyExponent: 2,
      createdAt: "2026-10-04T00:00:00.000Z",
      acceptedAt: "2026-10-04T00:00:00.000Z",
      receiptRef: "receipt_credited",
      receiptType: "callback"
    });
    insertOrder(db, {
      orderRef: "pay_order_unverified",
      accountId: "acct_sentinel_gross",
      status: "pending",
      amountMinor: 999,
      currency: "USD",
      currencyExponent: 2,
      createdAt: "2026-10-03T00:00:00.000Z",
      providerOrderRef: null
    });
    insertReceipt(db, {
      receiptRef: "receipt_unverified",
      orderRef: "pay_order_unverified",
      receiptType: "query",
      canonicalState: "pending",
      chargeCertainty: "unknown",
      verification: "not_applicable",
      amountMinor: 999,
      currency: "USD",
      currencyExponent: 2,
      acceptedAt: "2026-10-03T01:00:00.000Z"
    });
    insertOrder(db, {
      orderRef: "pay_order_possible",
      accountId: "acct_sentinel_gross",
      status: "pending",
      amountMinor: 80,
      currency: "USD",
      currencyExponent: 2,
      createdAt: "2026-10-03T00:00:00.000Z"
    });
    insertReceipt(db, {
      receiptRef: "receipt_possible",
      orderRef: "pay_order_possible",
      receiptType: "query",
      canonicalState: "pending",
      chargeCertainty: "possibly_charged",
      verification: "not_applicable",
      amountMinor: 80,
      currency: "USD",
      currencyExponent: 2,
      acceptedAt: "2026-10-03T02:00:00.000Z"
    });
    insertOrder(db, {
      orderRef: "pay_order_no_charge",
      accountId: "acct_sentinel_gross",
      status: "failed_no_charge",
      amountMinor: 70,
      currency: "USD",
      currencyExponent: 2,
      createdAt: "2026-10-03T00:00:00.000Z"
    });
    insertReceipt(db, {
      receiptRef: "receipt_no_charge",
      orderRef: "pay_order_no_charge",
      receiptType: "query",
      canonicalState: "failed_no_charge",
      chargeCertainty: "confirmed_no_charge",
      verification: "not_applicable",
      amountMinor: 70,
      currency: "USD",
      currencyExponent: 2,
      acceptedAt: "2026-10-03T03:00:00.000Z"
    });
    insertOrder(db, {
      orderRef: "pay_order_verified_possible",
      accountId: "acct_sentinel_gross",
      status: "payment_verified",
      amountMinor: 60,
      currency: "USD",
      currencyExponent: 2,
      createdAt: "2026-10-03T00:00:00.000Z"
    });
    insertReceipt(db, {
      receiptRef: "receipt_verified_possible",
      orderRef: "pay_order_verified_possible",
      receiptType: "callback",
      canonicalState: "payment_succeeded",
      chargeCertainty: "possibly_charged",
      verification: "verified",
      amountMinor: 60,
      currency: "USD",
      currencyExponent: 2,
      acceptedAt: "2026-10-03T04:00:00.000Z"
    });
    confirmed(db, {
      orderRef: "pay_order_recon",
      accountId: "acct_sentinel_gross",
      status: "reconciliation_required",
      amountMinor: 404,
      currency: "USD",
      currencyExponent: 2,
      createdAt: "2026-10-02T00:00:00.000Z",
      acceptedAt: "2026-10-02T00:00:00.000Z",
      receiptRef: "receipt_recon"
    });

    const body = gross(db);
    assert.equal(body.schemaVersion, "operations-recharge-confirmation-gross/v1");
    assert.equal(body.generatedAt, NOW);
    assert.equal(body.freshness, "partial");
    assert.equal(body.sourceState, "implemented_source");
    assert.deepEqual(body.warnings, [{ code: "source_partial" }]);
    assert.equal(body.data.definition, "first_confirmed_charge_in_window");
    assert.deepEqual(body.data.window, {
      from: FROM,
      to: TO,
      bound: "[from, to)",
      timeField: "accepted_at"
    });
    assert.equal(body.data.confirmedCharges.amountMeaning, "payment_confirmation_gross_minor_units");
    assert.deepEqual(body.data.confirmedCharges.groups, [{
      currency: "USD",
      currencyExponent: 2,
      confirmedChargeCount: 2,
      paymentConfirmationGrossMinorTotal: 350
    }]);
    assert.deepEqual(body.data.reconciliationExcluded, { orderCount: 1 });
    const encoded = JSON.stringify(body);
    for (const secret of [
      "acct_sentinel_gross",
      "pay_order_verified",
      "receipt_verified",
      EMAIL,
      "subscription-token-sentinel",
      "accountId",
      "receipt_ref",
      "revenue",
      "netRevenue",
      "settledAmount",
      "profit"
    ]) {
      assert.equal(encoded.includes(secret), false, secret);
    }
  } finally {
    db.close();
  }
});

test("capture, callback, and later query successes count once and only in the first window", () => {
  const db = openDb();
  try {
    confirmed(db, {
      orderRef: "pay_order_multi",
      accountId: "acct_sentinel_gross",
      status: "payment_verified",
      amountMinor: 100,
      currency: "USD",
      currencyExponent: 2,
      createdAt: "2026-09-15T00:00:00.000Z",
      acceptedAt: FROM,
      receiptRef: "receipt_capture_later_name",
      receiptType: "capture"
    });
    insertReceipt(db, {
      receiptRef: "receipt_callback",
      orderRef: "pay_order_multi",
      receiptType: "callback",
      canonicalState: "payment_succeeded",
      chargeCertainty: "confirmed_charged",
      verification: "verified",
      amountMinor: 100,
      currency: "USD",
      currencyExponent: 2,
      acceptedAt: "2026-10-09T00:00:00.000Z"
    });
    insertReceipt(db, {
      receiptRef: "receipt_query_again",
      orderRef: "pay_order_multi",
      receiptType: "query",
      canonicalState: "payment_succeeded",
      chargeCertainty: "confirmed_charged",
      verification: "verified",
      amountMinor: 100,
      currency: "USD",
      currencyExponent: 2,
      acceptedAt: "2026-10-10T00:00:00.000Z"
    });
    confirmed(db, {
      orderRef: "pay_order_end",
      accountId: "acct_sentinel_gross",
      status: "payment_verified",
      amountMinor: 5,
      currency: "USD",
      currencyExponent: 2,
      createdAt: "2026-10-08T00:00:00.000Z",
      acceptedAt: TO,
      receiptRef: "receipt_end"
    });

    const first = gross(db);
    assert.equal(first.freshness, "fresh");
    assert.deepEqual(first.data.reconciliationExcluded, { orderCount: 0 });
    assert.deepEqual(first.data.confirmedCharges.groups, [{
      currency: "USD",
      currencyExponent: 2,
      confirmedChargeCount: 1,
      paymentConfirmationGrossMinorTotal: 100
    }]);

    const later = gross(db, {
      from: TO,
      to: "2026-10-15T00:00:00.000Z"
    });
    assert.deepEqual(later.data.confirmedCharges.groups, [{
      currency: "USD",
      currencyExponent: 2,
      confirmedChargeCount: 1,
      paymentConfirmationGrossMinorTotal: 5
    }]);
  } finally {
    db.close();
  }
});

test("tied confirmation timestamps use receipt_ref and do not sum both receipts", () => {
  const db = openDb();
  try {
    confirmed(db, {
      orderRef: "pay_order_tie",
      accountId: "acct_sentinel_gross",
      status: "credited",
      amountMinor: 40,
      currency: "EUR",
      currencyExponent: 2,
      createdAt: "2026-10-01T00:00:00.000Z",
      acceptedAt: "2026-10-02T00:00:00.000Z",
      receiptRef: "receipt_b",
      receiptType: "capture"
    });
    insertReceipt(db, {
      receiptRef: "receipt_a",
      orderRef: "pay_order_tie",
      receiptType: "callback",
      canonicalState: "payment_succeeded",
      chargeCertainty: "confirmed_charged",
      verification: "verified",
      amountMinor: 40,
      currency: "EUR",
      currencyExponent: 2,
      acceptedAt: "2026-10-02T00:00:00.000Z"
    });
    const body = gross(db);
    assert.deepEqual(body.data.confirmedCharges.groups, [{
      currency: "EUR",
      currencyExponent: 2,
      confirmedChargeCount: 1,
      paymentConfirmationGrossMinorTotal: 40
    }]);
  } finally {
    db.close();
  }
});

test("currencies and exponents stay apart, and an empty window is fresh", () => {
  const db = openDb();
  try {
    confirmed(db, {
      orderRef: "pay_order_usd",
      accountId: "acct_sentinel_gross",
      status: "payment_verified",
      amountMinor: 15,
      currency: "USD",
      currencyExponent: 2,
      createdAt: "2026-10-02T00:00:00.000Z",
      acceptedAt: "2026-10-02T00:00:00.000Z",
      receiptRef: "receipt_usd"
    });
    confirmed(db, {
      orderRef: "pay_order_usd_zero",
      accountId: "acct_sentinel_gross",
      status: "payment_verified",
      amountMinor: 7,
      currency: "USD",
      currencyExponent: 0,
      createdAt: "2026-10-02T00:00:00.000Z",
      acceptedAt: "2026-10-02T01:00:00.000Z",
      receiptRef: "receipt_usd_zero"
    });
    confirmed(db, {
      orderRef: "pay_order_jpy",
      accountId: "acct_sentinel_gross",
      status: "credited",
      amountMinor: 900,
      currency: "JPY",
      currencyExponent: 0,
      createdAt: "2026-10-02T00:00:00.000Z",
      acceptedAt: "2026-10-02T02:00:00.000Z",
      receiptRef: "receipt_jpy"
    });
    const body = gross(db);
    assert.deepEqual(body.data.confirmedCharges.groups, [
      {
        currency: "JPY",
        currencyExponent: 0,
        confirmedChargeCount: 1,
        paymentConfirmationGrossMinorTotal: 900
      },
      {
        currency: "USD",
        currencyExponent: 0,
        confirmedChargeCount: 1,
        paymentConfirmationGrossMinorTotal: 7
      },
      {
        currency: "USD",
        currencyExponent: 2,
        confirmedChargeCount: 1,
        paymentConfirmationGrossMinorTotal: 15
      }
    ]);

    const empty = gross(db, {
      from: "2024-02-29T00:00:00.000Z",
      to: "2024-03-01T00:00:00.000Z"
    });
    assert.equal(empty.freshness, "fresh");
    assert.deepEqual(empty.warnings, []);
    assert.deepEqual(empty.data.confirmedCharges.groups, []);
    assert.deepEqual(empty.data.reconciliationExcluded, { orderCount: 0 });
    assert.equal(empty.data.window.timeField, "accepted_at");
  } finally {
    db.close();
  }
});

test("only reconciliation rows are a partial empty gross, not a complete zero", () => {
  const db = openDb();
  try {
    confirmed(db, {
      orderRef: "pay_order_recon_only",
      accountId: "acct_sentinel_gross",
      status: "reconciliation_required",
      amountMinor: 33,
      currency: "USD",
      currencyExponent: 2,
      createdAt: "2026-10-02T00:00:00.000Z",
      acceptedAt: "2026-10-02T00:00:00.000Z",
      receiptRef: "receipt_recon_only"
    });
    const body = gross(db);
    assert.equal(body.freshness, "partial");
    assert.deepEqual(body.warnings, [{ code: "source_partial" }]);
    assert.deepEqual(body.data.confirmedCharges.groups, []);
    assert.deepEqual(body.data.reconciliationExcluded, { orderCount: 1 });
  } finally {
    db.close();
  }
});

test("quote mismatches and contradictory statuses fail the whole read", () => {
  const mismatch = openDb();
  try {
    confirmed(mismatch, {
      orderRef: "pay_order_good",
      accountId: "acct_sentinel_gross",
      status: "payment_verified",
      amountMinor: 10,
      currency: "USD",
      currencyExponent: 2,
      createdAt: "2026-10-02T00:00:00.000Z",
      acceptedAt: "2026-10-02T00:00:00.000Z",
      receiptRef: "receipt_good"
    });
    confirmed(mismatch, {
      orderRef: "pay_order_bad_amount",
      accountId: "acct_sentinel_gross",
      status: "payment_verified",
      amountMinor: 10,
      currency: "EUR",
      currencyExponent: 2,
      createdAt: "2026-10-02T00:00:00.000Z",
      acceptedAt: "2026-10-02T01:00:00.000Z",
      receiptRef: "receipt_bad_amount",
      receiptAmountMinor: 11
    });
    assert.throws(() => gross(mismatch), { code: "source_unavailable" });
  } finally {
    mismatch.close();
  }

  const currency = openDb();
  try {
    confirmed(currency, {
      orderRef: "pay_order_bad_currency",
      accountId: "acct_sentinel_gross",
      status: "credited",
      amountMinor: 10,
      currency: "USD",
      currencyExponent: 2,
      createdAt: "2026-10-02T00:00:00.000Z",
      acceptedAt: "2026-10-02T00:00:00.000Z",
      receiptRef: "receipt_bad_currency",
      receiptCurrency: "EUR"
    });
    assert.throws(() => gross(currency), { code: "source_unavailable" });
  } finally {
    currency.close();
  }

  const exponent = openDb();
  try {
    confirmed(exponent, {
      orderRef: "pay_order_bad_exponent",
      accountId: "acct_sentinel_gross",
      status: "payment_verified",
      amountMinor: 10,
      currency: "USD",
      currencyExponent: 2,
      createdAt: "2026-10-02T00:00:00.000Z",
      acceptedAt: "2026-10-02T00:00:00.000Z",
      receiptRef: "receipt_bad_exponent",
      receiptCurrencyExponent: 0
    });
    assert.throws(() => gross(exponent), { code: "source_unavailable" });
  } finally {
    exponent.close();
  }

  const conflict = openDb();
  try {
    confirmed(conflict, {
      orderRef: "pay_order_conflict",
      accountId: "acct_sentinel_gross",
      status: "payment_verified",
      amountMinor: 10,
      currency: "USD",
      currencyExponent: 2,
      createdAt: "2026-10-02T00:00:00.000Z",
      acceptedAt: "2026-10-02T00:00:00.000Z",
      receiptRef: "receipt_first"
    });
    insertReceipt(conflict, {
      receiptRef: "receipt_second",
      orderRef: "pay_order_conflict",
      receiptType: "callback",
      canonicalState: "payment_succeeded",
      chargeCertainty: "confirmed_charged",
      verification: "verified",
      amountMinor: 9,
      currency: "USD",
      currencyExponent: 2,
      acceptedAt: "2026-10-03T00:00:00.000Z"
    });
    assert.throws(() => gross(conflict), { code: "source_unavailable" });
  } finally {
    conflict.close();
  }

  for (const status of ["created", "entry_ready", "pending", "failed_no_charge", "expired"]) {
    const db = openDb();
    try {
      confirmed(db, {
        orderRef: `pay_order_${status}`,
        accountId: "acct_sentinel_gross",
        status,
        amountMinor: 10,
        currency: "USD",
        currencyExponent: 2,
        createdAt: "2026-10-02T00:00:00.000Z",
        acceptedAt: "2026-10-02T00:00:00.000Z",
        receiptRef: `receipt_${status}`,
        providerOrderRef: status === "credited" ? `provider_${status}` : `provider_${status}`
      });
      assert.throws(() => gross(db), { code: "source_unavailable" }, status);
    } finally {
      db.close();
    }
  }
});

test("calendar-invalid confirmation times fail closed, including outside the window", () => {
  const badTimes = [
    "2026-10-05T25:00:00.000Z",
    "2026-02-30T00:00:00.000Z",
    "2026-13-01T00:00:00.000Z",
    "not-a-timestamp",
    "2026-10-01T24:00:00.000Z"
  ];
  for (const acceptedAt of badTimes) {
    const db = openDb();
    try {
      confirmed(db, {
        orderRef: "pay_order_good_time",
        accountId: "acct_sentinel_gross",
        status: "payment_verified",
        amountMinor: 21,
        currency: "USD",
        currencyExponent: 2,
        createdAt: "2026-10-03T00:00:00.000Z",
        acceptedAt: "2026-10-03T00:00:00.000Z",
        receiptRef: "receipt_good_time"
      });
      confirmed(db, {
        orderRef: "pay_order_bad_time",
        accountId: "acct_sentinel_gross",
        status: "credited",
        amountMinor: 99,
        currency: "EUR",
        currencyExponent: 2,
        createdAt: "2026-01-01T00:00:00.000Z",
        acceptedAt,
        receiptRef: "receipt_bad_time"
      });
      let caught;
      try {
        gross(db);
      } catch (error) {
        caught = error;
      }
      assert.equal(caught?.code, "source_unavailable", acceptedAt);
      assert.equal(Object.hasOwn(caught, "freshness"), false, acceptedAt);
      assert.equal(JSON.stringify(caught).includes("confirmedCharges"), false, acceptedAt);
    } finally {
      db.close();
    }
  }

  const db = openDb();
  try {
    confirmed(db, {
      orderRef: "pay_order_leap",
      accountId: "acct_sentinel_gross",
      status: "payment_verified",
      amountMinor: 17,
      currency: "USD",
      currencyExponent: 2,
      createdAt: "2024-02-01T00:00:00.000Z",
      acceptedAt: "2024-02-29T00:00:00.000Z",
      receiptRef: "receipt_leap"
    });
    confirmed(db, {
      orderRef: "pay_order_ordinary",
      accountId: "acct_sentinel_gross",
      status: "credited",
      amountMinor: 8,
      currency: "USD",
      currencyExponent: 2,
      createdAt: "2026-10-03T00:00:00.000Z",
      acceptedAt: "2026-10-03T00:00:00.000Z",
      receiptRef: "receipt_ordinary"
    });
    insertReceipt(db, {
      receiptRef: "receipt_unverified_bad_day",
      orderRef: "pay_order_ordinary",
      receiptType: "query",
      canonicalState: "pending",
      chargeCertainty: "unknown",
      verification: "not_applicable",
      amountMinor: 8,
      currency: "USD",
      currencyExponent: 2,
      acceptedAt: "2026-02-30T00:00:00.000Z"
    });
    const leap = gross(db, {
      from: "2024-02-29T00:00:00.000Z",
      to: "2024-03-01T00:00:00.000Z"
    });
    assert.equal(leap.freshness, "fresh");
    assert.deepEqual(leap.warnings, []);
    assert.deepEqual(leap.data.confirmedCharges.groups, [{
      currency: "USD",
      currencyExponent: 2,
      confirmedChargeCount: 1,
      paymentConfirmationGrossMinorTotal: 17
    }]);
    const ordinary = gross(db);
    assert.equal(ordinary.freshness, "fresh");
    assert.deepEqual(ordinary.data.confirmedCharges.groups, [{
      currency: "USD",
      currencyExponent: 2,
      confirmedChargeCount: 1,
      paymentConfirmationGrossMinorTotal: 8
    }]);
  } finally {
    db.close();
  }
});

test("an outside mismatch does not blank a clean window, and a bad timestamp does", () => {
  const db = openDb();
  try {
    confirmed(db, {
      orderRef: "pay_order_outside",
      accountId: "acct_sentinel_gross",
      status: "payment_verified",
      amountMinor: 10,
      currency: "USD",
      currencyExponent: 2,
      createdAt: "2026-09-01T00:00:00.000Z",
      acceptedAt: "2026-09-02T00:00:00.000Z",
      receiptRef: "receipt_outside"
    });
    insertReceipt(db, {
      receiptRef: "receipt_outside_bad",
      orderRef: "pay_order_outside",
      receiptType: "callback",
      canonicalState: "payment_succeeded",
      chargeCertainty: "confirmed_charged",
      verification: "verified",
      amountMinor: 99,
      currency: "USD",
      currencyExponent: 2,
      acceptedAt: "2026-09-03T00:00:00.000Z"
    });
    confirmed(db, {
      orderRef: "pay_order_inside",
      accountId: "acct_sentinel_gross",
      status: "payment_verified",
      amountMinor: 21,
      currency: "USD",
      currencyExponent: 2,
      createdAt: "2026-09-20T00:00:00.000Z",
      acceptedAt: "2026-10-05T00:00:00.000Z",
      receiptRef: "receipt_inside"
    });
    assert.deepEqual(gross(db).data.confirmedCharges.groups, [{
      currency: "USD",
      currencyExponent: 2,
      confirmedChargeCount: 1,
      paymentConfirmationGrossMinorTotal: 21
    }]);
    assert.throws(() => gross(db, {
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-08T00:00:00.000Z"
    }), { code: "source_unavailable" });

    insertReceipt(db, {
      receiptRef: "receipt_bad_time",
      orderRef: "pay_order_inside",
      receiptType: "query",
      canonicalState: "payment_succeeded",
      chargeCertainty: "confirmed_charged",
      verification: "verified",
      amountMinor: 21,
      currency: "USD",
      currencyExponent: 2,
      acceptedAt: "not-a-timestamp"
    });
    assert.throws(() => gross(db), { code: "source_unavailable" });
  } finally {
    db.close();
  }
});

test("safe integer overflow and a missing source fail closed", () => {
  const limit = openDb();
  try {
    confirmed(limit, {
      orderRef: "pay_order_max",
      accountId: "acct_sentinel_gross",
      status: "payment_verified",
      amountMinor: Number.MAX_SAFE_INTEGER,
      currency: "USD",
      currencyExponent: 2,
      createdAt: "2026-10-02T00:00:00.000Z",
      acceptedAt: "2026-10-02T00:00:00.000Z",
      receiptRef: "receipt_max"
    });
    const body = gross(limit);
    assert.equal(body.data.confirmedCharges.groups[0].paymentConfirmationGrossMinorTotal, Number.MAX_SAFE_INTEGER);

    confirmed(limit, {
      orderRef: "pay_order_one",
      accountId: "acct_sentinel_gross",
      status: "payment_verified",
      amountMinor: 1,
      currency: "JPY",
      currencyExponent: 0,
      createdAt: "2026-10-02T00:00:00.000Z",
      acceptedAt: "2026-10-02T01:00:00.000Z",
      receiptRef: "receipt_one"
    });
    confirmed(limit, {
      orderRef: "pay_order_overflow",
      accountId: "acct_sentinel_gross",
      status: "credited",
      amountMinor: 1,
      currency: "USD",
      currencyExponent: 2,
      createdAt: "2026-10-02T00:00:00.000Z",
      acceptedAt: "2026-10-02T02:00:00.000Z",
      receiptRef: "receipt_overflow"
    });
    assert.throws(() => gross(limit), { code: "source_unavailable" });
  } finally {
    limit.close();
  }

  const empty = new Database(":memory:");
  try {
    assert.throws(() => gross(empty), { code: "source_unavailable" });
  } finally {
    empty.close();
  }
});

test("the default window uses the clock on accepted_at and does not follow created_at", () => {
  const db = openDb();
  try {
    confirmed(db, {
      orderRef: "pay_order_default_in",
      accountId: "acct_sentinel_gross",
      status: "payment_verified",
      amountMinor: 8,
      currency: "USD",
      currencyExponent: 2,
      createdAt: "2026-01-01T00:00:00.000Z",
      acceptedAt: "2026-09-24T00:00:00.000Z",
      receiptRef: "receipt_default_in"
    });
    confirmed(db, {
      orderRef: "pay_order_default_out",
      accountId: "acct_sentinel_gross",
      status: "payment_verified",
      amountMinor: 424242,
      currency: "USD",
      currencyExponent: 2,
      createdAt: "2026-10-03T00:00:00.000Z",
      acceptedAt: "2026-09-23T23:59:59.999Z",
      receiptRef: "receipt_default_out"
    });
    const body = gross(db, {});
    assert.deepEqual(body.data.window, {
      from: "2026-09-24T00:00:00.000Z",
      to: NOW,
      bound: "[from, to)",
      timeField: "accepted_at"
    });
    assert.deepEqual(body.data.confirmedCharges.groups, [{
      currency: "USD",
      currencyExponent: 2,
      confirmedChargeCount: 1,
      paymentConfirmationGrossMinorTotal: 8
    }]);
    assert.equal(JSON.stringify(body).includes("424242"), false);
  } finally {
    db.close();
  }
});

test("order status summary still groups by created_at and this read does not add an index", () => {
  const db = openDb();
  try {
    insertOrder(db, {
      orderRef: "pay_order_created_only",
      accountId: "acct_sentinel_gross",
      status: "pending",
      amountMinor: 12,
      currency: "USD",
      currencyExponent: 2,
      createdAt: "2026-10-03T00:00:00.000Z",
      providerOrderRef: null
    });
    confirmed(db, {
      orderRef: "pay_order_accepted_only",
      accountId: "acct_sentinel_gross",
      status: "payment_verified",
      amountMinor: 18,
      currency: "USD",
      currencyExponent: 2,
      createdAt: "2026-08-01T00:00:00.000Z",
      acceptedAt: "2026-10-04T00:00:00.000Z",
      receiptRef: "receipt_accepted_only"
    });
    const status = createAdminOrderStatusSummaryService({
      database: db,
      nowFn: () => new Date(NOW)
    }).readSummary(WINDOW);
    assert.deepEqual(status.data.rechargeOrders.groups, [{
      status: "pending",
      currency: "USD",
      currencyExponent: 2,
      orderCount: 1,
      orderAmountMinorTotal: 12
    }]);
    assert.equal(status.data.definition, "current_status_of_orders_created_in_window");
    const confirmedGross = gross(db);
    assert.deepEqual(confirmedGross.data.confirmedCharges.groups, [{
      currency: "USD",
      currencyExponent: 2,
      confirmedChargeCount: 1,
      paymentConfirmationGrossMinorTotal: 18
    }]);

    const names = db.prepare(`
      select name from sqlite_master
       where type = 'index'
         and tbl_name = 'platform_payment_receipts'
         and name not like 'sqlite_autoindex%'
    `).pluck().all();
    assert.deepEqual(names, ["platform_payment_receipts_order_accepted_idx"]);
    const plan = db.prepare(`explain query plan ${RECHARGE_CONFIRMATION_GROSS_GROUP_SQL}`)
      .all(FROM, TO)
      .map((row) => row.detail)
      .join("\n");
    assert.match(plan, /SCAN r USING INDEX platform_payment_receipts_order_accepted_idx/);
    assert.match(
      plan,
      /SEARCH r USING INDEX platform_payment_receipts_order_accepted_idx \(payment_order_ref=\? AND accepted_at=\?\)/
    );
    assert.equal(plan.includes("verification_result"), false);
    assert.equal(plan.includes("platform_payment_receipts_confirmed"), false);
  } finally {
    db.close();
  }
});

test("a file read stays on the owned path and a missing file is unavailable", () => {
  const directory = mkdtempSync(join(tmpdir(), "recharge-confirmation-gross-"));
  const dbPath = join(directory, "control.sqlite");
  const db = new Database(dbPath);
  try {
    migrate(db);
    addAccount(db, "acct_sentinel_gross");
    confirmed(db, {
      orderRef: "pay_order_file",
      accountId: "acct_sentinel_gross",
      status: "payment_verified",
      amountMinor: 14,
      currency: "USD",
      currencyExponent: 2,
      createdAt: "2026-10-02T00:00:00.000Z",
      acceptedAt: "2026-10-02T00:00:00.000Z",
      receiptRef: "receipt_file"
    });
  } finally {
    db.close();
  }

  try {
    const body = createAdminRechargeConfirmationGrossService({
      dbPath,
      nowFn: () => new Date(NOW)
    }).readGross(WINDOW);
    assert.equal(body.data.confirmedCharges.groups[0].paymentConfirmationGrossMinorTotal, 14);
    const conflicting = new Database(":memory:");
    try {
      assert.throws(() => createAdminRechargeConfirmationGrossService({
        database: conflicting,
        dbPath
      }), /source_conflict/);
    } finally {
      conflicting.close();
    }
    const service = createAdminRechargeConfirmationGrossService({
      dbPath: join(directory, "missing.sqlite"),
      nowFn: () => new Date(NOW)
    });
    assert.throws(() => service.readGross({ from: FROM }), { code: "invalid_query" });
    assert.throws(() => service.readGross(WINDOW), { code: "source_unavailable" });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
