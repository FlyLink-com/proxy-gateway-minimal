import { Worker } from "node:worker_threads";
import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  applyCoinWalletMigrations,
} from "../services/platform/coin-wallet-migrations.mjs";
import { applyPaymentStoreMigrations } from "../services/platform/payment-store-migrations.mjs";
import { createSqliteCoinWalletStore } from "../services/platform/coin-wallet-store.mjs";
import { createSqlitePaymentStore } from "../services/platform/payment-store.mjs";
import { createPaymentRechargeOfferCatalog } from "../services/platform/payment-recharge-offer-catalog.mjs";
import { paymentSettlementIdentity } from "../services/platform/payment-recharge-coordinator.mjs";
import {
  applyPortalReferralMigration,
  validatePortalReferralSchema,
  REFERRAL_MIGRATION_ID,
  REFERRAL_DDL_CHECKSUM,
} from "../services/platform/portal-referral-migrations.mjs";
import {
  recordReferralRegistration,
  rewardUnits,
  policySnapshot,
} from "../services/platform/portal-referral-contract.mjs";
import { runPortalReferralPolicyCli } from "../../scripts/platform-portal-referral-policy.mjs";
import { runPortalReferralSchemaCli } from "../../scripts/platform-portal-referral-schema.mjs";
import { createPortalReferralService } from "../services/platform/portal-referral-service.mjs";

const NOW = "2026-09-08T00:00:00.000Z";
// Synthetic fixture operands only; these are not production business defaults.
const POLICY = {
  policyRef: "test_policy",
  version: 1,
  effectiveAt: NOW,
  rateBps: 1250,
  rounding: "floor",
  attributionDays: 7,
  confirmationDays: 2,
};
// Regression operands for the approved policy; this does not publish a policy.
const FIRST_RECHARGE_20_PERCENT_POLICY = {
  ...POLICY,
  policyRef: "test_first_recharge_20_percent",
  rateBps: 2000,
  attributionDays: 60,
  confirmationDays: 7,
};
const confirmation = {
  expectedMigrationId: REFERRAL_MIGRATION_ID,
  expectedDdlChecksum: REFERRAL_DDL_CHECKSUM,
};
const op = (key) => ({
  actorScope: "test",
  actorType: "test",
  actorRef: "test",
  idempotencyKey: key,
});
function fixture(
  t,
  { path = ":memory:", migrate = true, publish = true, paidCoinUnits = 100,
    serviceOptions = { rewardsEnabled: true } } = {},
) {
  const db = new Database(path);
  db.pragma("foreign_keys=ON");
  db.exec(`create table platform_accounts(id text primary key,owner_ref text not null,status text not null,
    created_at text not null,updated_at text not null,metadata_json text not null default '{}')`);
  const addAccount = (id) =>
    db
      .prepare("insert into platform_accounts values(?,?,'active',?,?,'{}')")
      .run(id, `owner_${id}`, NOW, NOW);
  for (const id of [
    "promoter",
    "other_promoter",
    "customer",
    "customer_2",
    "customer_3",
  ])
    addAccount(id);
  applyCoinWalletMigrations({
    database: db,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(NOW),
  });
  applyPaymentStoreMigrations({ database: db, nowFn: () => NOW });
  let now = NOW,
    sequence = 0;
  const nowFn = () => new Date(now),
    refs = (kind) => `${kind}_${++sequence}`;
  const wallet = createSqliteCoinWalletStore({
    database: db,
    nowFn,
    refFactory: refs,
  });
  const payments = createSqlitePaymentStore({
    database: db,
    nowFn,
    refFactory: refs,
  });
  const refunds = new Map(),
    risks = new Map();
  let service;
  const open = () =>
    createPortalReferralService({
      database: db,
      nowFn,
      riskReader: (r) => risks.get(r),
      refundReader: (r) => refunds.get(r),
      ...serviceOptions,
    });
  if (migrate) {
    applyPortalReferralMigration(db, confirmation);
    service = open();
    if (publish) service.publishPolicy(POLICY);
  }
  const offer = createPaymentRechargeOfferCatalog({
    environment: "sandbox",
    offers: [
      {
        offerRef: "test_offer",
        quoteVersion: 1,
        paidCoinUnits,
        amountMinor: 300,
        currency: "USD",
        currencyExponent: 2,
        paymentMethods: ["paypal"],
        enabled: true,
      },
    ],
  }).getOffer("test_offer");
  function recharge(
    accountId = "customer",
    { credit = true, close = true } = {},
  ) {
    const { order } = payments.createOrder({
      accountId,
      offer,
      idempotencyKey: `create_${++sequence}`,
      adapterKey: "paypal_v1",
      paymentMethod: "paypal",
      merchantBindingRef: "test_merchant",
    });
    const providerOrderRef = `provider_${order.orderRef}`;
    payments.recordOperationReceipt({
      orderRef: order.orderRef,
      attemptRef: refs("attempt"),
      providerRequestRef: refs("request"),
      receiptType: "create",
      operationResult: {
        providerOrderRef,
        status: "entry_ready",
        chargeCertainty: "possibly_charged",
        nextAction: {
          type: "redirect",
          url: "https://www.sandbox.paypal.com/checkoutnow?token=test",
          expiresAt: "2026-12-01T00:00:00.000Z",
        },
        occurredAt: now,
      },
    });
    const accepted = payments.acceptVerifiedPayment({
      orderRef: order.orderRef,
      attemptRef: refs("attempt"),
      providerRequestRef: refs("request"),
      receiptType: "callback",
      adapterKey: "paypal_v1",
      paymentMethod: "paypal",
      merchantBindingRef: "test_merchant",
      paymentFact: {
        sourceType: "callback",
        providerEventRef: refs("event"),
        eventDedupeKey: refs("dedupe"),
        eventType: "payment_succeeded",
        paymentOrderRef: order.orderRef,
        providerOrderRef,
        providerCaptureRef: refs("capture"),
        providerRefundRef: null,
        amountMinor: 300,
        currency: "USD",
        currencyExponent: 2,
        merchantScopeDigest: "b".repeat(64),
        payloadDigest: "c".repeat(64),
        occurredAt: now,
        verificationResult: "verified",
      },
    });
    const context = payments.getSettlementContext({
      orderRef: order.orderRef,
      receiptRef: accepted.receipt.receiptRef,
    });
    const identity = paymentSettlementIdentity(context, context.receipt);
    let credited;
    if (credit)
      credited = wallet.creditCoins({
        accountId,
        coinType: "paid_coins",
        amountUnits: paidCoinUnits,
        availability: "available",
        sourceType: "verified_payment_capture",
        sourceRef: identity.settlementRef,
        sourceDigest: identity.settlementDigest,
        policyRef: null,
        policyVersion: null,
        expiresAt: null,
        operation: op(identity.settlementRef),
      });
    const closeOrder = () =>
      payments.markOrderCredited({
        orderRef: order.orderRef,
        receiptRef: accepted.receipt.receiptRef,
        walletOperationRef: credited.operationRef,
        walletLotRef: credited.resultRef,
      });
    if (credit && close) closeOrder();
    return {
      orderRef: order.orderRef,
      lotRef: credited?.resultRef,
      closeOrder,
    };
  }
  function bind(accountId = "customer", promoter = "promoter") {
    const code = service.createLink(promoter).linkPath.split("/").at(-1);
    const touch = service.capture(code);
    db.transaction(() =>
      recordReferralRegistration(db, {
        accountId,
        token: touch.token,
        registeredAt: now,
      }),
    ).immediate();
    return touch;
  }
  t.after(() => {
    service?.close();
    wallet.close();
    payments.close();
    db.close();
  });
  return {
    db,
    service,
    open,
    addAccount,
    wallet,
    payments,
    recharge,
    bind,
    refunds,
    risks,
    setNow: (value) => {
      now = value;
    },
    row: () =>
      db
        .prepare(
          "select * from platform_referral_accruals where account_id='customer'",
        )
        .get(),
    refund: (orderRef, amount, ref = "refund_test", chargeback = false) => {
      refunds.set(ref, {
        verified: true,
        observationRef: ref,
        paymentOrderRef: orderRef,
        cumulativeRefundedPaidUnits: amount,
        chargeback,
      });
      return service.applyRefund(ref);
    },
    approve: () => {
      risks.set("risk_test", {
        accountId: "customer",
        decisionRef: "risk_test",
        approved: true,
        refundObservationComplete: true,
      });
      return service.confirm("customer", "risk_test");
    },
  };
}

test("distribution defaults rewards off and attributes without policy or financial writes", (t) => {
  const f = fixture(t, { publish: false, serviceOptions: { attributionDays: 3 } });
  assert.deepEqual(f.service.profile("promoter"), {
    eligible: true, linkPath: null, attributionDays: 3, policy: null,
  });
  const touch = f.bind();
  assert.equal(touch.expiresAt, "2026-09-11T00:00:00.000Z");
  assert.equal(touch.maxAge, 3 * 86400);
  assert.equal(f.service.performance("promoter").registrations, 1);
  f.recharge();
  const before = f.db.serialize();
  assert.deepEqual(f.service.accrue("customer"), { status: "rewards_disabled" });
  assert.deepEqual(f.service.reconcile(), []);
  assert.throws(() => f.service.confirm("customer", "risk_test"), /referral_rewards_disabled/);
  const schedule = t.mock.method(globalThis, "setInterval", () => {
    throw new Error("disabled_rewards_must_not_schedule");
  });
  f.service.start();
  assert.equal(schedule.mock.callCount(), 0);
  assert.deepEqual(f.db.serialize(), before);
  for (const table of ["policies", "origins", "accruals", "events"]) {
    assert.equal(f.db.prepare(`select count(*) n from platform_referral_${table}`).get().n, 0);
  }
  assert.equal(f.db.prepare("select count(*) n from platform_coin_lots where coin_type='reward_coins'").get().n, 0);
});

test("distribution requires an explicit integer window and a boolean rewards switch", (t) => {
  const f = fixture(t);
  for (const attributionDays of [undefined, null, 0, 366, -1, 1.5, "7", NaN, Infinity]) {
    assert.throws(() => createPortalReferralService({ database: f.db, attributionDays }), /referral_attribution_days_invalid/);
    if (attributionDays !== undefined) {
      assert.throws(() => createPortalReferralService({ database: f.db, attributionDays, rewardsEnabled: true }), /referral_attribution_days_invalid/);
    }
  }
  for (const rewardsEnabled of [null, 0, 1, "false", "true", {}]) {
    assert.throws(() => createPortalReferralService({ database: f.db, attributionDays: 7, rewardsEnabled }), /referral_rewards_configuration_invalid/);
  }
  for (const attributionDays of [1, 365]) {
    const service = createPortalReferralService({ database: f.db, attributionDays });
    assert.equal(service.profile("promoter").attributionDays, attributionDays);
    service.close();
  }
});

test("distribution uses its explicit window and hides existing reward policy", (t) => {
  const f = fixture(t, { serviceOptions: { rewardsEnabled: false, attributionDays: 2 } });
  assert.equal(f.service.createLink("promoter").policy, null);
  assert.equal(f.service.profile("promoter").attributionDays, 2);
  assert.equal(f.bind().maxAge, 2 * 86400);
  f.recharge();
  const before = f.db.serialize();
  assert.deepEqual(f.service.accrue("customer"), { status: "rewards_disabled" });
  assert.deepEqual(f.service.reconcile(), []);
  f.service.start();
  assert.deepEqual(f.db.serialize(), before);
});

test("enabled rewards use only the published policy attribution window", (t) => {
  const f = fixture(t, { serviceOptions: { rewardsEnabled: true, attributionDays: 2 } });
  assert.equal(f.service.createLink("promoter").attributionDays, POLICY.attributionDays);
  assert.deepEqual(f.service.profile("promoter").policy, POLICY);
  assert.equal(f.bind().maxAge, POLICY.attributionDays * 86400);
  f.recharge();
  assert.equal(f.service.accrue("customer").status, "pending");
});

test("enabling rewards later never backfills a first recharge with no policy at its original time", (t) => {
  const f = fixture(t, { publish: false, serviceOptions: { attributionDays: 3 } });
  f.bind();
  const first = f.recharge();
  assert.deepEqual(f.service.accrue("customer"), { status: "rewards_disabled" });
  assert.equal(f.row(), undefined);
  f.setNow("2026-09-09T00:00:00.000Z");
  f.service.close();
  const rewards = createPortalReferralService({ database: f.db, rewardsEnabled: true,
    nowFn: () => new Date("2026-09-09T00:00:00.000Z") });
  t.after(() => rewards.close());
  rewards.publishPolicy({ ...POLICY, effectiveAt: "2026-09-09T00:00:00.000Z" });
  assert.equal(rewards.accrue("customer").status, "policy_missing");
  f.recharge();
  assert.deepEqual(rewards.accrue("customer"), { status: "policy_missing", replayed: true });
  const origin = f.db.prepare("select lot_ref,policy_json from platform_referral_origins where account_id='customer'").get();
  assert.equal(origin.lot_ref, first.lotRef);
  assert.equal(origin.policy_json, null);
  assert.equal(f.row().reward_units, 0);
  assert.equal(f.db.prepare("select count(*) n from platform_coin_lots where coin_type='reward_coins'").get().n, 0);
});

test("disabling new rewards preserves only the existing trusted refund correction contract", (t) => {
  const f = fixture(t);
  f.bind();
  const order = f.recharge();
  f.service.accrue("customer");
  f.service.close();
  const distribution = createPortalReferralService({ database: f.db, attributionDays: 3,
    nowFn: () => new Date(NOW), refundReader: (ref) => f.refunds.get(ref) });
  t.after(() => distribution.close());
  assert.throws(() => distribution.confirm("customer", "risk_test"), /referral_rewards_disabled/);
  assert.throws(() => distribution.applyRefund("unverified"), /referral_refund_unverified/);
  f.refunds.set("trusted_refund", { observationRef: "trusted_refund", verified: true,
    chargeback: false, paymentOrderRef: order.orderRef, cumulativeRefundedPaidUnits: 100 });
  assert.deepEqual(distribution.applyRefund("trusted_refund"), { status: "reversed" });
  const before = f.db.serialize();
  assert.deepEqual(distribution.accrue("customer"), { status: "rewards_disabled" });
  assert.deepEqual(distribution.reconcile(), []);
  assert.deepEqual(f.db.serialize(), before);
});

test("migration requires exact confirmation and parent schemas, detects drift, and replays", (t) => {
  const f = fixture(t, { migrate: false });
  assert.throws(
    () => applyPortalReferralMigration(f.db),
    /confirmation_required/,
  );
  assert.equal(validatePortalReferralSchema(f.db), false);
  assert.deepEqual(applyPortalReferralMigration(f.db, confirmation), {
    applied: true,
  });
  assert.deepEqual(applyPortalReferralMigration(f.db, confirmation), {
    applied: false,
  });
  f.db.exec("drop trigger platform_referral_bindings_immutable_update");
  assert.equal(validatePortalReferralSchema(f.db), false);
  assert.throws(
    () => applyPortalReferralMigration(f.db, confirmation),
    /schema_conflict/,
  );
  assert.throws(() => f.open(), /schema_not_ready/);
});

test("stable opaque codes survive independent connections and restart", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "referral-"));
  const path = join(dir, "state.sqlite"),
    f = fixture(t, { path });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const a = f.service.createLink("promoter");
  assert.match(a.linkPath, /^\/r\/[A-Za-z0-9_-]{32}$/);
  const other = createPortalReferralService({
    dbPath: path,
    nowFn: () => new Date(NOW),
    rewardsEnabled: true,
  });
  try {
    assert.equal(other.createLink("promoter").linkPath, a.linkPath);
  } finally {
    other.close();
  }
  f.service.close();
  const reopened = f.open();
  try {
    assert.equal(reopened.profile("promoter").linkPath, a.linkPath);
  } finally {
    reopened.close();
  }
  assert.equal(
    f.db.prepare("select count(*) n from platform_referral_profiles").get().n,
    1,
  );
});

test("registration locks last valid token, including permanently unattributed, and rejects expired/self/disabled", (t) => {
  const f = fixture(t);
  const first = f.bind();
  const second = f.service.capture(
    f.service.createLink("other_promoter").linkPath.split("/").at(-1),
  );
  const record = (id, token, at = NOW) =>
    f.db
      .transaction(() =>
        recordReferralRegistration(f.db, {
          accountId: id,
          token,
          registeredAt: at,
        }),
      )
      .immediate();
  record("customer", second.token);
  assert.equal(
    f.db
      .prepare(
        "select referrer_id from platform_referral_bindings where account_id=?",
      )
      .get("customer").referrer_id,
    "promoter",
  );
  record("customer_2", second.token);
  assert.equal(
    f.db
      .prepare(
        "select referrer_id from platform_referral_bindings where account_id=?",
      )
      .get("customer_2").referrer_id,
    "other_promoter",
  );
  record("customer_3", first.token, "2026-09-15T00:00:00.000Z");
  record("customer_3", second.token);
  record("promoter", first.token);
  assert.equal(
    f.db
      .prepare(
        "select count(*) n from platform_referral_bindings where referrer_id is null",
      )
      .get().n,
    2,
  );
  f.db
    .prepare(
      "update platform_referral_profiles set status='disabled' where account_id='other_promoter'",
    )
    .run();
  assert.equal(
    f.service.capture(f.service.profile("other_promoter").linkPath),
    null,
  );
  f.addAccount("customer_4");
  record("customer_4", second.token);
  assert.equal(
    f.db
      .prepare(
        "select referrer_id from platform_referral_bindings where account_id=?",
      )
      .get("customer_4").referrer_id,
    null,
  );
  assert.throws(
    () =>
      recordReferralRegistration(f.db, {
        accountId: "customer",
        token: first.token,
        registeredAt: NOW,
      }),
    /transaction_required/,
  );
  assert.throws(
    () =>
      f.db
        .prepare("update platform_referral_bindings set referrer_id=null")
        .run(),
    /immutable/,
  );
});

test("account and referral binding roll back together if later registration work fails", (t) => {
  const f = fixture(t),
    touch = f.service.capture(
      f.service.createLink("promoter").linkPath.split("/").at(-1),
    );
  assert.throws(
    () =>
      f.db
        .transaction(() => {
          f.addAccount("rollback_account");
          recordReferralRegistration(f.db, {
            accountId: "rollback_account",
            token: touch.token,
            registeredAt: NOW,
          });
          throw new Error("late_registration_failure");
        })
        .immediate(),
    /late_registration_failure/,
  );
  assert.equal(
    f.db
      .prepare("select 1 from platform_accounts where id=?")
      .get("rollback_account"),
    undefined,
  );
  assert.equal(
    f.db
      .prepare("select 1 from platform_referral_bindings where account_id=?")
      .get("rollback_account"),
    undefined,
  );
});

test("only first verified payment plus closed durable wallet credit accrues once", (t) => {
  const f = fixture(t);
  f.bind();
  f.recharge("customer", { credit: false });
  assert.equal(f.service.accrue("customer").status, "awaiting_first_recharge");
  f.wallet.creditCoins({
    accountId: "customer",
    coinType: "bonus_coins",
    amountUnits: 10,
    availability: "available",
    sourceType: "welcome_bonus",
    sourceRef: "welcome",
    sourceDigest: "a".repeat(64),
    policyRef: null,
    policyVersion: null,
    expiresAt: null,
    operation: op("welcome"),
  });
  assert.equal(f.service.accrue("customer").status, "awaiting_first_recharge");
  const first = f.recharge("customer", { close: false });
  f.recharge();
  assert.equal(f.service.accrue("customer").status, "awaiting_payment_close");
  first.closeOrder();
  assert.deepEqual(f.service.accrue("customer"), {
    status: "pending",
    replayed: false,
  });
  assert.equal(f.service.accrue("customer").replayed, true);
  f.recharge();
  assert.equal(f.service.accrue("customer").replayed, true);
  assert.equal(f.row().reward_units, 12);
  assert.equal(
    f.db.prepare("select lot_ref from platform_referral_origins").get().lot_ref,
    first.lotRef,
  );
  assert.deepEqual(f.service.performance("promoter"), {
    registrations: 1,
    firstRechargeConversions: 1,
    creditedFirstRechargeCoins: 100,
    pendingRewardCoins: 12,
    availableRewardCoins: 0,
    reversedRewardCoins: 0,
    conversionRate: 1,
    reconciliationRequired: false,
  });
  assert.equal(
    f.service.performance("other_promoter").firstRechargeConversions,
    0,
  );
});

test("20 percent first recharge floors 103 Coins, waits seven days, and reverses cumulative refunds once per account", (t) => {
  const f = fixture(t, { publish: false, paidCoinUnits: 103 });
  f.service.publishPolicy(FIRST_RECHARGE_20_PERCENT_POLICY);
  const touch = f.bind();
  assert.equal(touch.maxAge, 60 * 86400);
  assert.equal(touch.expiresAt, "2026-11-07T00:00:00.000Z");
  f.bind("customer_2", "other_promoter");
  const first = f.recharge();
  f.recharge("customer_2");
  assert.deepEqual(f.service.accrue("customer"), { status: "pending", replayed: false });
  assert.deepEqual(f.service.accrue("customer_2"), { status: "pending", replayed: false });
  assert.equal(f.row().reward_units, 20);
  assert.equal(f.row().confirmation_at, "2026-09-15T00:00:00.000Z");
  assert.equal(f.service.performance("promoter").pendingRewardCoins, 20);
  assert.equal(f.service.performance("promoter").availableRewardCoins, 0);
  const otherPromoterBefore = f.service.performance("other_promoter");
  assert.equal(otherPromoterBefore.pendingRewardCoins, 20);

  f.recharge();
  assert.deepEqual(f.service.accrue("customer"), { status: "pending", replayed: true });
  assert.equal(f.service.performance("promoter").creditedFirstRechargeCoins, 103);
  assert.equal(f.service.performance("promoter").firstRechargeConversions, 1);
  f.setNow("2026-09-14T23:59:59.999Z");
  assert.throws(() => f.approve(), /referral_not_confirmable/);
  assert.equal(f.service.performance("promoter").availableRewardCoins, 0);
  f.setNow("2026-09-15T00:00:00.000Z");
  f.risks.set("incomplete_20_percent", {
    accountId: "customer", decisionRef: "incomplete_20_percent",
    approved: true, refundObservationComplete: false,
  });
  assert.throws(() => f.service.confirm("customer", "incomplete_20_percent"), /referral_risk_rejected/);
  assert.throws(() => f.service.confirm("customer_2", "risk_test"), /referral_risk_rejected/);
  assert.deepEqual(f.approve(), { status: "available" });
  assert.deepEqual(f.approve(), { status: "available" });
  assert.equal(f.service.performance("promoter").availableRewardCoins, 20);
  assert.equal(f.service.performance("promoter").pendingRewardCoins, 0);

  f.refund(first.orderRef, 23, "partial_20_percent_1");
  assert.equal(f.row().reversed_units, 4); // 20 - floor((103 - 23) * 20%).
  f.refund(first.orderRef, 52, "partial_20_percent_2");
  assert.equal(f.row().reversed_units, 10); // 20 - floor((103 - 52) * 20%).
  f.refund(first.orderRef, 52, "partial_20_percent_2");
  f.refund(first.orderRef, 23, "older_20_percent_observation");
  assert.equal(f.row().refunded_paid_units, 52);
  assert.equal(f.row().reversed_units, 10);
  assert.equal(f.service.performance("promoter").availableRewardCoins, 10);
  assert.deepEqual(f.refund(first.orderRef, 103, "full_20_percent"), { status: "reversed" });
  assert.deepEqual(f.refund(first.orderRef, 103, "full_20_percent"), { status: "reversed" });
  assert.equal(f.row().reversed_units, 20);
  assert.equal(f.service.performance("promoter").availableRewardCoins, 0);
  assert.equal(f.service.performance("promoter").reversedRewardCoins, 20);
  assert.deepEqual(f.service.performance("other_promoter"), otherPromoterBefore);
  assert.equal(f.db.prepare("select coalesce(sum(amount_units),0) units from platform_coin_ledger_entries where lot_ref=? and source_type='portal_referral_reversal'")
    .get(f.row().reward_lot_ref).units, 20);
  f.recharge();
  assert.deepEqual(f.service.accrue("customer"), { status: "reversed", replayed: true });
  assert.equal(f.db.prepare("select lot_ref from platform_referral_origins where account_id='customer'").get().lot_ref, first.lotRef);
  assert.equal(f.db.prepare("select count(*) n from platform_coin_lots where source_type='portal_first_recharge_reward'").get().n, 2);
  assert.equal(f.db.pragma("foreign_key_check").length, 0);
});

test("spent 20 percent first-recharge rewards require reconciliation without reversing another account's reward", (t) => {
  const f = fixture(t, { publish: false, paidCoinUnits: 103 });
  f.service.publishPolicy(FIRST_RECHARGE_20_PERCENT_POLICY);
  f.bind();
  f.bind("customer_2", "other_promoter");
  const first = f.recharge();
  f.recharge("customer_2");
  f.service.accrue("customer");
  f.service.accrue("customer_2");
  f.setNow("2026-09-15T00:00:00.000Z");
  f.approve();
  const lotBefore = f.db.prepare("select * from platform_coin_lots where lot_ref=?").get(f.row().reward_lot_ref);
  const otherPromoterBefore = f.service.performance("other_promoter");
  const hold = f.wallet.createCoinHold({
    walletRef: lotBefore.wallet_ref, purpose: "product_purchase", purposeRef: "purchase_spent_reward",
    amountUnits: 20, acceptedCoinTypes: ["reward_coins"], expiresAt: "2026-09-16T00:00:00.000Z",
    operation: op("hold_spent_20_percent"),
  });
  f.wallet.captureCoinHold({ holdRef: hold.resultRef, operation: op("capture_spent_20_percent") });
  assert.deepEqual(f.refund(first.orderRef, 103, "refund_spent_20_percent"), { status: "reconciliation_required" });
  assert.deepEqual(f.refund(first.orderRef, 103, "refund_spent_20_percent"), { status: "reconciliation_required" });
  assert.equal(f.row().refunded_paid_units, 103);
  assert.equal(f.row().reversed_units, 0);
  assert.equal(f.service.performance("promoter").reconciliationRequired, true);
  const lotAfter = f.db.prepare("select * from platform_coin_lots where lot_ref=?").get(lotBefore.lot_ref);
  assert.equal(lotAfter.consumed_units, 20);
  assert.equal(lotAfter.available_units + lotAfter.pending_units + lotAfter.held_units + lotAfter.reversed_units, 0);
  assert.equal(f.db.prepare("select count(*) n from platform_coin_ledger_entries where lot_ref=? and source_type='portal_referral_reversal'")
    .get(lotBefore.lot_ref).n, 0);
  assert.deepEqual(f.service.performance("other_promoter"), otherPromoterBefore);
  f.recharge();
  assert.deepEqual(f.service.accrue("customer"), { status: "reconciliation_required", replayed: true });
  assert.equal(f.db.pragma("foreign_key_check").length, 0);
});

test("internal settlement waits exactly 168 hours and releases the verified first-credit reward without external readers", (t) => {
  const f = fixture(t, { publish: false, paidCoinUnits: 103,
    serviceOptions: { rewardsEnabled: true,
      riskReader() { throw new Error("external_risk_reader_must_not_run"); },
      refundReader() { throw new Error("external_refund_reader_must_not_run"); } } });
  f.service.publishPolicy(FIRST_RECHARGE_20_PERCENT_POLICY);
  f.bind();
  f.recharge();
  f.service.accrue("customer");
  f.setNow("2026-09-14T23:59:59.999Z");
  assert.deepEqual(f.service.settle(), []);
  assert.equal(f.service.performance("promoter").availableRewardCoins, 0);
  f.setNow("2026-09-15T00:00:00.000Z");
  assert.deepEqual(f.service.settle(), ["available"]);
  assert.equal(f.service.performance("promoter").availableRewardCoins, 20);
  assert.equal(f.row().risk_approved, 0);
  assert.equal(f.db.prepare("select count(*) n from platform_referral_events where kind='internal_ledger_confirmed'").get().n, 1);
  assert.equal(f.db.prepare("select count(*) n from platform_referral_events where kind='risk_approved'").get().n, 0);
  const before = f.db.serialize();
  assert.deepEqual(f.service.settle(), []);
  assert.deepEqual(f.db.serialize(), before);
  const reopened = f.open();
  t.after(() => reopened.close());
  assert.deepEqual(reopened.settle(), []);
  assert.equal(f.service.performance("promoter").availableRewardCoins, 20);
});

test("internal settlement advances its bounded cursor past broken payment bindings without mixing accounts", (t) => {
  const f = fixture(t, { publish: false, paidCoinUnits: 103 });
  f.service.publishPolicy(FIRST_RECHARGE_20_PERCENT_POLICY);
  f.bind();
  f.bind("customer_2", "other_promoter");
  const first = f.recharge();
  f.recharge("customer_2");
  f.service.accrue("customer");
  f.service.accrue("customer_2");
  f.setNow("2026-09-15T00:00:00.000Z");
  f.db.exec("drop trigger platform_payment_orders_quote_immutable");
  f.db.prepare("update platform_payment_orders set account_id='customer_3' where payment_order_ref=?").run(first.orderRef);
  assert.deepEqual(f.service.settle({ limit: 1 }), ["settlement_blocked"]);
  assert.deepEqual(f.service.settle({ limit: 1 }), ["available"]);
  assert.equal(f.row().status, "pending");
  assert.equal(f.service.performance("promoter").availableRewardCoins, 0);
  assert.equal(f.service.performance("other_promoter").availableRewardCoins, 20);
  assert.deepEqual(f.service.settle({ limit: 1 }), []);
  assert.deepEqual(f.service.settle({ limit: 1 }), ["settlement_blocked"]);
  f.db.prepare("update platform_payment_orders set account_id='customer' where payment_order_ref=?").run(first.orderRef);
  assert.deepEqual(f.service.settle({ limit: 1 }), []);
  assert.deepEqual(f.service.settle({ limit: 1 }), ["available"]);
});

test("internal settlement requires recorded refunds to be fully reversed and never releases a fully refunded reward", (t) => {
  const f = fixture(t, { publish: false, paidCoinUnits: 103 });
  f.service.publishPolicy(FIRST_RECHARGE_20_PERCENT_POLICY);
  f.bind();
  f.bind("customer_2", "other_promoter");
  const first = f.recharge();
  const other = f.recharge("customer_2");
  f.service.accrue("customer");
  f.service.accrue("customer_2");
  f.refund(other.orderRef, 103, "internal_full_refund");
  // Simulate a known cumulative refund whose wallet reversal has not completed.
  f.db.prepare("update platform_referral_accruals set refunded_paid_units=52 where account_id='customer'").run();
  f.setNow("2026-09-15T00:00:00.000Z");
  assert.deepEqual(f.service.settle(), ["settlement_blocked"]);
  assert.equal(f.service.performance("promoter").availableRewardCoins, 0);
  f.refund(first.orderRef, 52, "internal_partial_refund");
  assert.equal(f.row().reversed_units, 10);
  assert.deepEqual(f.service.settle(), ["available"]);
  assert.equal(f.service.performance("promoter").availableRewardCoins, 10);
  assert.equal(f.service.performance("other_promoter").availableRewardCoins, 0);
  assert.equal(f.service.performance("other_promoter").reversedRewardCoins, 20);
});

test("internal settlement rejects inactive accounts and inconsistent pending reward balances", (t) => {
  const f = fixture(t, { publish: false, paidCoinUnits: 103 });
  f.service.publishPolicy(FIRST_RECHARGE_20_PERCENT_POLICY);
  f.bind();
  f.recharge();
  f.service.accrue("customer");
  f.setNow("2026-09-15T00:00:00.000Z");
  f.db.prepare("update platform_accounts set status='disabled' where id='customer'").run();
  assert.deepEqual(f.service.settle(), ["settlement_blocked"]);
  f.db.prepare("update platform_accounts set status='active' where id='customer'").run();
  f.db.prepare("update platform_coin_lots set pending_units=19,available_units=1 where lot_ref=?").run(f.row().reward_lot_ref);
  assert.deepEqual(f.service.settle(), ["settlement_blocked"]);
  assert.equal(f.row().status, "pending");
  assert.equal(f.db.prepare("select count(*) n from platform_referral_events where kind='internal_ledger_confirmed'").get().n, 0);
});

test("internal settlement preserves its confirmation basis when a held refund later becomes recoverable", (t) => {
  const f = fixture(t, { publish: false, paidCoinUnits: 103 });
  f.service.publishPolicy(FIRST_RECHARGE_20_PERCENT_POLICY);
  f.bind();
  const first = f.recharge();
  f.service.accrue("customer");
  f.setNow("2026-09-15T00:00:00.000Z");
  assert.deepEqual(f.service.settle(), ["available"]);
  const lot = f.db.prepare("select * from platform_coin_lots where lot_ref=?").get(f.row().reward_lot_ref);
  const hold = f.wallet.createCoinHold({ walletRef: lot.wallet_ref, purpose: "product_purchase",
    purposeRef: "internal_confirmed_purchase", amountUnits: 20, acceptedCoinTypes: ["reward_coins"],
    expiresAt: "2026-09-16T00:00:00.000Z", operation: op("internal_reward_hold") });
  assert.deepEqual(f.refund(first.orderRef, 23, "internal_held_refund"), { status: "reconciliation_required" });
  assert.deepEqual(f.service.settle(), []);
  f.wallet.releaseCoinHold({ holdRef: hold.resultRef, operation: op("internal_reward_release") });
  assert.deepEqual(f.service.applyRefund("internal_held_refund"), { status: "available" });
  assert.equal(f.row().risk_approved, 0);
  assert.equal(f.service.performance("promoter").availableRewardCoins, 16);
  assert.equal(f.service.performance("promoter").reversedRewardCoins, 4);
});

test("internal settlement rolls back wallet confirmation and its event together before a safe retry", (t) => {
  const f = fixture(t, { publish: false, paidCoinUnits: 103 });
  f.service.publishPolicy(FIRST_RECHARGE_20_PERCENT_POLICY);
  f.bind();
  f.recharge();
  f.service.accrue("customer");
  f.setNow("2026-09-15T00:00:00.000Z");
  f.db.exec("create trigger fail_internal_confirmation before insert on platform_referral_events when new.kind='internal_ledger_confirmed' begin select raise(abort,'injected_internal_failure'); end");
  const before = f.db.serialize();
  assert.deepEqual(f.service.settle(), ["settlement_blocked"]);
  assert.deepEqual(f.db.serialize(), before);
  assert.equal(f.row().status, "pending");
  assert.equal(f.service.performance("promoter").pendingRewardCoins, 20);
  f.db.exec("drop trigger fail_internal_confirmation");
  assert.deepEqual(f.service.settle(), ["available"]);
  assert.equal(f.service.performance("promoter").availableRewardCoins, 20);
  assert.equal(f.db.prepare("select count(*) n from platform_coin_ledger_entries where lot_ref=? and operation='pending_to_available'")
    .get(f.row().reward_lot_ref).n, 1);
});

test("internal settlement timer accrues then settles, stays bounded, and cannot write after close or while disabled", (t) => {
  const callbacks = [];
  const timer = { unref() {} };
  t.mock.method(globalThis, "setInterval", (callback) => { callbacks.push(callback); return timer; });
  const cleared = t.mock.method(globalThis, "clearInterval", () => {});
  const f = fixture(t, { publish: false, paidCoinUnits: 103 });
  f.service.publishPolicy(FIRST_RECHARGE_20_PERCENT_POLICY);
  f.bind();
  f.recharge("customer", { close: false });
  f.setNow("2026-09-15T00:00:00.000Z");
  f.service.start();
  assert.equal(f.row(), undefined);
  assert.equal(callbacks.length, 1);
  f.service.start();
  assert.equal(callbacks.length, 1);
  f.service.close();
  const before = f.db.serialize();
  callbacks[0]();
  assert.deepEqual(f.db.serialize(), before);
  assert.equal(cleared.mock.callCount(), 1);
  assert.throws(() => f.service.settle(), /referral_unavailable/);
  const disabled = fixture(t, { publish: false, serviceOptions: { attributionDays: 60 } });
  assert.deepEqual(disabled.service.settle(), []);
  disabled.service.start();
  assert.equal(callbacks.length, 1);
  const ready = fixture(t, { publish: false, paidCoinUnits: 103 });
  ready.service.publishPolicy(FIRST_RECHARGE_20_PERCENT_POLICY);
  ready.bind();
  ready.recharge();
  ready.setNow("2026-09-15T00:00:00.000Z");
  ready.service.start();
  assert.equal(ready.row().status, "available");
  assert.equal(ready.service.performance("promoter").availableRewardCoins, 20);
  assert.throws(() => ready.service.settle({ limit: 0 }), /referral_request_invalid/);
  assert.throws(() => ready.service.settle({ limit: 1001 }), /referral_request_invalid/);
});

test("failed event insert rolls back reward wallet, origin and accrual, then scan repairs exactly once", (t) => {
  const f = fixture(t);
  f.bind();
  f.recharge();
  f.db.exec(
    "create trigger fail_referral_event before insert on platform_referral_events begin select raise(abort,'injected_failure'); end",
  );
  assert.throws(() => f.service.accrue("customer"), /injected_failure/);
  for (const table of ["origins", "accruals", "events"])
    assert.equal(
      f.db.prepare(`select count(*) n from platform_referral_${table}`).get().n,
      0,
    );
  assert.equal(
    f.db
      .prepare(
        "select count(*) n from platform_coin_lots where source_type='portal_first_recharge_reward'",
      )
      .get().n,
    0,
  );
  f.db.exec("drop trigger fail_referral_event");
  assert.deepEqual(f.service.reconcile(), ["pending"]);
  assert.deepEqual(f.service.reconcile(), []);
});

test("reconciliation advances past unresolved first orders and retries after restart", (t) => {
  const f = fixture(t);
  f.bind();
  f.bind("customer_2");
  f.recharge("customer", { close: false });
  f.recharge("customer_2");
  assert.deepEqual(f.service.reconcile({ limit: 1 }), [
    "awaiting_payment_close",
  ]);
  assert.deepEqual(f.service.reconcile({ limit: 1 }), ["pending"]);
  assert.deepEqual(f.service.reconcile({ limit: 1 }), []);
  assert.deepEqual(f.service.reconcile({ limit: 1 }), [
    "awaiting_payment_close",
  ]);
});

test("policy inputs are explicit immutable snapshots; historical missing policy never regains eligibility", (t) => {
  const f = fixture(t, { publish: false });
  assert.throws(() => f.service.createLink("promoter"), /policy_unavailable/);
  f.recharge();
  assert.equal(f.service.accrue("customer").status, "excluded");
  f.service.publishPolicy(POLICY);
  assert.equal(f.service.publishPolicy(POLICY).version, 1);
  assert.throws(
    () => f.service.publishPolicy({ ...POLICY, rateBps: 500 }),
    /policy_immutable/,
  );
  f.setNow("2026-09-09T00:00:00.000Z");
  assert.throws(
    () => f.service.publishPolicy({ ...POLICY, version: 2 }),
    /retroactive/,
  );
  f.bind();
  f.recharge();
  assert.equal(f.service.accrue("customer").status, "excluded");
  assert.equal(
    rewardUnits(
      Number.MAX_SAFE_INTEGER,
      policySnapshot({ ...POLICY, rateBps: 10000 }),
    ),
    Number.MAX_SAFE_INTEGER,
  );
  assert.throws(
    () => policySnapshot({ ...POLICY, unexpected: 1 }),
    /policy_invalid/,
  );
  assert.throws(
    () =>
      policySnapshot({
        ...POLICY,
        get rateBps() {
          throw new Error("getter_executed");
        },
      }),
    /policy_invalid/,
  );
});

test("pending confirmation requires elapsed observation, explicit risk and complete refund observation", (t) => {
  const f = fixture(t);
  f.bind();
  f.recharge();
  f.service.accrue("customer");
  assert.throws(
    () => f.service.confirm("customer", "unknown"),
    /risk_rejected/,
  );
  assert.throws(() => f.approve(), /not_confirmable/);
  f.setNow("2026-09-10T00:00:00.000Z");
  f.risks.set("incomplete", {
    accountId: "customer",
    decisionRef: "incomplete",
    approved: true,
  });
  assert.throws(
    () => f.service.confirm("customer", "incomplete"),
    /risk_rejected/,
  );
  assert.equal(f.approve().status, "available");
  assert.equal(f.approve().status, "available");
  assert.equal(f.service.performance("promoter").availableRewardCoins, 12);
  assert.equal(f.service.performance("promoter").pendingRewardCoins, 0);
});

for (const confirmed of [false, true])
  test(`cumulative partial/full refunds and chargeback reverse ${confirmed ? "available" : "pending"} rewards without resetting first`, (t) => {
    const f = fixture(t);
    f.bind();
    const first = f.recharge();
    f.service.accrue("customer");
    if (confirmed) {
      f.setNow("2026-09-10T00:00:00.000Z");
      f.approve();
    }
    f.refund(first.orderRef, 10, "partial_1");
    assert.equal(f.row().reversed_units, 1);
    f.refund(first.orderRef, 10, "partial_1");
    f.refund(first.orderRef, 5, "older_observation");
    assert.equal(f.row().reversed_units, 1);
    f.refund(first.orderRef, 50, "partial_2");
    assert.equal(f.row().reversed_units, 6);
    assert.throws(
      () => f.refund(first.orderRef, 60, "partial_2"),
      /event_conflict/,
    );
    assert.equal(
      f.refund(first.orderRef, 50, "chargeback", true).status,
      "reversed",
    );
    assert.equal(f.row().reversed_units, 12);
    f.refund(first.orderRef, 100, "full_refund");
    f.recharge();
    assert.equal(f.service.accrue("customer").status, "reversed");
    assert.equal(
      f.db
        .prepare(
          "select count(*) n from platform_coin_lots where source_type='portal_first_recharge_reward'",
        )
        .get().n,
      1,
    );
    const lot = f.db
      .prepare("select * from platform_coin_lots where lot_ref=?")
      .get(f.row().reward_lot_ref);
    assert.equal(
      lot.pending_units +
        lot.available_units +
        lot.held_units +
        lot.consumed_units +
        lot.expired_units +
        lot.reversed_units,
      lot.issued_units,
    );
    assert.equal(f.service.performance("promoter").reversedRewardCoins, 12);
    assert.equal(f.db.pragma("foreign_key_check").length, 0);
  });

test("held rewards enter reconciliation and recover after hold release without double reversal", (t) => {
  const f = fixture(t);
  f.bind();
  const order = f.recharge();
  f.service.accrue("customer");
  f.setNow("2026-09-10T00:00:00.000Z");
  f.approve();
  const lot = f.db
    .prepare("select * from platform_coin_lots where lot_ref=?")
    .get(f.row().reward_lot_ref);
  const hold = f.wallet.createCoinHold({
    walletRef: lot.wallet_ref,
    purpose: "product_purchase",
    purposeRef: "purchase_1",
    amountUnits: 12,
    acceptedCoinTypes: ["reward_coins"],
    expiresAt: "2026-09-11T00:00:00.000Z",
    operation: op("hold"),
  });
  assert.equal(f.refund(order.orderRef, 100).status, "reconciliation_required");
  assert.equal(f.row().reversed_units, 0);
  assert.equal(f.service.performance("promoter").reconciliationRequired, true);
  f.wallet.releaseCoinHold({
    holdRef: hold.resultRef,
    operation: op("release"),
  });
  assert.equal(f.service.applyRefund("refund_test").status, "reversed");
  assert.equal(f.row().reversed_units, 12);
});

test("disabled promoter cannot confirm and mismatched wallet/payment binding cannot accrue", (t) => {
  const f = fixture(t);
  f.bind();
  const order = f.recharge();
  // Simulate damaged imported data beyond the payment store's own immutable guard.
  f.db.exec("drop trigger platform_payment_orders_quote_immutable");
  f.db
    .prepare(
      "update platform_payment_orders set account_id='customer_2' where payment_order_ref=?",
    )
    .run(order.orderRef);
  assert.throws(() => f.service.accrue("customer"), /payment_binding_invalid/);
  assert.equal(f.row(), undefined);
  f.db
    .prepare(
      "update platform_payment_orders set account_id='customer' where payment_order_ref=?",
    )
    .run(order.orderRef);
  f.service.accrue("customer");
  f.setNow("2026-09-10T00:00:00.000Z");
  f.db
    .prepare(
      "update platform_referral_profiles set status='disabled' where account_id='promoter'",
    )
    .run();
  assert.throws(() => f.approve(), /account_ineligible/);
});

test("schema CLI validates and dry-runs an existing database without source mutation", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "referral-cli-"));
  const path = join(dir, "state.sqlite"),
    f = fixture(t, { path, migrate: false });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const before = f.db.serialize();
  const run = (mode, extra = []) =>
    runPortalReferralSchemaCli(["--mode", mode, "--db-path", path, ...extra]);
  assert.equal(run("validate").exitCode, 3);
  assert.equal(
    run("apply").output.reason,
    "referral_migration_confirmation_required",
  );
  const dry = run("dry-run");
  assert.equal(dry.exitCode, 0);
  assert.equal(dry.output.sourceChanged, false);
  assert.deepEqual(f.db.serialize(), before);
  assert.equal(
    run("apply", [
      "--confirm-migration-id",
      REFERRAL_MIGRATION_ID,
      "--confirm-ddl-checksum",
      REFERRAL_DDL_CHECKSUM,
    ]).exitCode,
    0,
  );
  assert.equal(run("validate").exitCode, 0);
  assert.equal(
    runPortalReferralSchemaCli([
      "--mode",
      "apply",
      "--db-path",
      "relative.sqlite",
    ]).exitCode,
    2,
  );
});

test("schema CLI dry-run reads committed WAL data and schema without changing the source", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "referral-cli-wal-"));
  const path = join(dir, "state.sqlite");
  const keeper = new Database(path);
  t.after(() => keeper.close());
  keeper.pragma("journal_mode=WAL");
  keeper.pragma("wal_autocheckpoint=0");
  keeper.pragma("wal_checkpoint(TRUNCATE)");
  const checkpointedFile = readFileSync(path);
  // The prerequisite schema and this account commit only to WAL. A preview
  // that accidentally reads the checkpointed main file cannot migrate it.
  const f = fixture(t, { path, migrate: false });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  f.db.pragma("wal_autocheckpoint=0");
  f.addAccount("wal_committed");
  assert.deepEqual(readFileSync(path), checkpointedFile);
  const walBefore = readFileSync(`${path}-wal`);
  assert.ok(walBefore.length > 32);
  const viewBefore = f.db.serialize();
  assert.deepEqual([...viewBefore.subarray(18, 20)], [2, 2]);
  const schemaBefore = f.db
    .prepare(
      "select type, name, tbl_name, sql from sqlite_schema order by type, name",
    )
    .all();
  const accountCount = () =>
    f.db.prepare("select count(*) n from platform_accounts").get().n;
  const accountsBefore = accountCount();
  const dry = runPortalReferralSchemaCli([
    "--mode",
    "dry-run",
    "--db-path",
    path,
  ]);
  assert.equal(dry.exitCode, 0);
  assert.equal(dry.output.applied, true);
  assert.equal(dry.output.sourceChanged, false);
  assert.deepEqual(f.db.serialize(), viewBefore);
  assert.deepEqual(readFileSync(path), checkpointedFile);
  assert.deepEqual(readFileSync(`${path}-wal`), walBefore);
  assert.deepEqual(
    f.db
      .prepare(
        "select type, name, tbl_name, sql from sqlite_schema order by type, name",
      )
      .all(),
    schemaBefore,
  );
  assert.equal(accountCount(), accountsBefore);
  assert.equal(f.db.pragma("journal_mode", { simple: true }), "wal");
  assert.equal(validatePortalReferralSchema(f.db), false);
});

test("policy CLI requires reviewed canonical digest before publication and exposes no file error details", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "referral-policy-"));
  const dbPath = join(dir, "state.sqlite"),
    f = fixture(t, { path: dbPath, publish: false });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const policyPath = join(dir, "policy.json");
  writeFileSync(
    policyPath,
    JSON.stringify({ ...POLICY, effectiveAt: "2099-01-01T00:00:00.000Z" }),
  );
  const validation = runPortalReferralPolicyCli([
    "--mode",
    "validate",
    "--policy-path",
    policyPath,
  ]);
  assert.equal(validation.exitCode, 0);
  const args = [
    "--mode",
    "publish",
    "--policy-path",
    policyPath,
    "--db-path",
    dbPath,
  ];
  assert.equal(
    runPortalReferralPolicyCli(args).output.reason,
    "referral_policy_confirmation_required",
  );
  assert.equal(
    f.db.prepare("select count(*) n from platform_referral_policies").get().n,
    0,
  );
  assert.equal(
    runPortalReferralPolicyCli([
      ...args,
      "--confirm-policy-digest",
      validation.output.policyDigest,
    ]).exitCode,
    0,
  );
  assert.equal(
    f.db.prepare("select count(*) n from platform_referral_policies").get().n,
    1,
  );
  assert.deepEqual(
    runPortalReferralPolicyCli([
      "--mode",
      "validate",
      "--policy-path",
      join(dir, "missing.json"),
    ]).output,
    { ok: false, reason: "referral_policy_unavailable" },
  );
});

test("simultaneous independent writers issue one stable code and one reward", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "referral-concurrent-"));
  const path = join(dir, "state.sqlite"),
    f = fixture(t, { path });
  f.bind();
  f.recharge();
  const moduleUrl = new URL(
    "../services/platform/portal-referral-service.mjs",
    import.meta.url,
  ).href;
  const workers = [];
  t.after(() => Promise.all(workers.map((worker) => worker.terminate())));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const results = [];
  const ready = Array.from(
    { length: 2 },
    () =>
      new Promise((resolve, reject) => {
        const worker = new Worker(
          `const {parentPort,workerData}=require('node:worker_threads');
      import(workerData.moduleUrl).then(({createPortalReferralService})=>{
        const service=createPortalReferralService({dbPath:workerData.path,nowFn:()=>new Date(workerData.now),rewardsEnabled:true});
        parentPort.once('message',()=>{try{parentPort.postMessage({link:service.createLink('other_promoter').linkPath,accrual:service.accrue('customer')});}
          finally{service.close();}});parentPort.postMessage('ready');
      }).catch(error=>{throw error});`,
          { eval: true, workerData: { path, moduleUrl, now: NOW } },
        );
        workers.push(worker);
        worker.once("error", reject);
        worker.once("message", resolve);
        results.push(
          new Promise((done, fail) => {
            worker.on("message", (value) => {
              if (value !== "ready") done(value);
            });
            worker.once("error", fail);
          }),
        );
      }),
  );
  await Promise.all(ready);
  workers.forEach((worker) => worker.postMessage("start"));
  const [a, b] = await Promise.all(results);
  assert.equal(a.link, b.link);
  assert.equal(
    [a.accrual, b.accrual].filter((r) => r.replayed === false).length,
    1,
  );
  assert.equal(
    f.db
      .prepare(
        "select count(*) n from platform_coin_lots where source_type='portal_first_recharge_reward'",
      )
      .get().n,
    1,
  );
});

test("refund ledger failure rolls back its observation and all balances before retry", (t) => {
  const f = fixture(t);
  f.bind();
  const order = f.recharge();
  f.service.accrue("customer");
  f.db.exec(
    "create trigger fail_reversal before insert on platform_coin_ledger_entries when new.operation='pending_to_reversed' begin select raise(abort,'injected_reversal_failure'); end",
  );
  assert.throws(
    () => f.refund(order.orderRef, 100),
    /injected_reversal_failure/,
  );
  assert.equal(f.row().refunded_paid_units, 0);
  assert.equal(f.row().reversed_units, 0);
  assert.equal(f.service.performance("promoter").pendingRewardCoins, 12);
  assert.equal(
    f.db
      .prepare(
        "select 1 from platform_referral_events where event_ref='refund_test'",
      )
      .get(),
    undefined,
  );
  f.db.exec("drop trigger fail_reversal");
  assert.equal(f.service.applyRefund("refund_test").status, "reversed");
});
