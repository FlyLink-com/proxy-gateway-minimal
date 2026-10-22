import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { createSqliteCoinCommerceStore } from "../services/platform/coin-commerce-store.mjs";
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
import { createSqliteCoinWalletStore } from "../services/platform/coin-wallet-store.mjs";
import { createSqlitePaymentStore } from "../services/platform/payment-store.mjs";
import { createPaymentRechargeOfferCatalog } from "../services/platform/payment-recharge-offer-catalog.mjs";
import { paymentSettlementIdentity } from "../services/platform/payment-recharge-coordinator.mjs";
import {
  applyPortalReferralMigration,
  REFERRAL_DDL_CHECKSUM,
  REFERRAL_MIGRATION_ID
} from "../services/platform/portal-referral-migrations.mjs";
import {
  digest,
  recordReferralRegistration
} from "../services/platform/portal-referral-contract.mjs";
import { createPortalReferralService } from "../services/platform/portal-referral-service.mjs";
import { createAdminUserCommerceService } from "../services/platform/admin-user-commerce.mjs";

const START = "2026-09-08T00:00:00.000Z";
const POLICY = {
  policyRef: "test_policy",
  version: 1,
  effectiveAt: START,
  rateBps: 1250,
  rounding: "floor",
  attributionDays: 7,
  confirmationDays: 2
};
const PLAN = {
  offerRef: "offer_plan",
  offerVersionRef: "offerv_plan_v1",
  version: 1,
  category: "plan",
  title: { zh: "合成套餐", en: "Synthetic plan" },
  summary: { zh: "合成测试", en: "Synthetic test" },
  importantNotices: { zh: ["合成测试"], en: ["Synthetic test"] },
  baseCoinUnits: 10,
  referencePrice: { currency: "CNY", amountMinor: 1000 },
  acceptedCoinTypes: ["paid_coins"],
  delivery: {
    kind: "subscription_plan",
    durationDays: 30,
    monthlyTrafficGb: 50,
    trafficGb: null,
    neverExpires: false,
    discountBasisPoints: 0
  }
};
const PACK = {
  ...PLAN,
  offerRef: "offer_pack",
  offerVersionRef: "offerv_pack_v1",
  category: "data_pack",
  delivery: {
    kind: "data_pack",
    durationDays: null,
    monthlyTrafficGb: null,
    trafficGb: 100,
    neverExpires: true,
    discountBasisPoints: null
  }
};

function fixedClockDatabase(database, clock) {
  return new Proxy(database, {
    get(target, property) {
      if (property === "inTransaction") return target.inTransaction;
      if (property === "prepare") {
        return (sql) => {
          if (/select\s+strftime\('%Y-%m-%dT%H:%M:%fZ',\s*'now'\)/i.test(sql)) {
            return { pluck: () => ({ get: () => clock() }) };
          }
          return target.prepare(sql);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}

function fixture(t) {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`create table platform_accounts(
    id text primary key, owner_ref text not null, status text not null,
    created_at text not null, updated_at text not null, metadata_json text not null default '{}')`);
  const addAccount = (id) => db.prepare(
    "insert into platform_accounts values(?,?,'active',?,?,'{}')"
  ).run(id, `owner_${id}`, START, START);
  for (const id of ["promoter", "customer", "customer_2"]) addAccount(id);
  applyCoinWalletMigrations({
    database: db,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(START)
  });
  applyPaymentStoreMigrations({ database: db, nowFn: () => START });
  applyCoinCommerceMigrations({
    database: db,
    expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(START)
  });
  applyPortalReferralMigration(db, {
    expectedMigrationId: REFERRAL_MIGRATION_ID,
    expectedDdlChecksum: REFERRAL_DDL_CHECKSUM
  });
  let now = START;
  let sequence = 0;
  const nowFn = () => new Date(now);
  const refs = (kind) => `${kind}_${++sequence}`;
  const wallet = createSqliteCoinWalletStore({ database: db, nowFn, refFactory: refs });
  const payments = createSqlitePaymentStore({ database: db, nowFn, refFactory: refs });
  const risks = new Map();
  const service = createPortalReferralService({
    database: db,
    nowFn,
    riskReader: (ref) => risks.get(ref),
    refundReader: () => {
      throw new Error("refund_reader_unused");
    },
    attributionDays: 7,
    rewardsEnabled: true
  });
  service.publishPolicy(POLICY);
  const commerce = createSqliteCoinCommerceStore({
    database: fixedClockDatabase(db, () => now),
    commerceRefFactory: refs,
    walletRefFactory: refs
  });
  const offer = createPaymentRechargeOfferCatalog({
    environment: "sandbox",
    offers: [{
      offerRef: "test_offer",
      quoteVersion: 1,
      paidCoinUnits: 100,
      amountMinor: 300,
      currency: "USD",
      currencyExponent: 2,
      paymentMethods: ["paypal"],
      enabled: true
    }]
  }).getOffer("test_offer");
  const op = (key) => ({ actorScope: "test", actorType: "test", actorRef: "test", idempotencyKey: key });
  function recharge() {
    const { order } = payments.createOrder({
      accountId: "customer",
      offer,
      idempotencyKey: `create_${++sequence}`,
      adapterKey: "paypal_v1",
      paymentMethod: "paypal",
      merchantBindingRef: "test_merchant"
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
          url: "https://example.test/checkout",
          expiresAt: "2026-12-01T00:00:00.000Z"
        },
        occurredAt: now
      }
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
        verificationResult: "verified"
      }
    });
    const context = payments.getSettlementContext({
      orderRef: order.orderRef,
      receiptRef: accepted.receipt.receiptRef
    });
    const identity = paymentSettlementIdentity(context, context.receipt);
    const credited = wallet.creditCoins({
      accountId: "customer",
      coinType: "paid_coins",
      amountUnits: 100,
      availability: "available",
      sourceType: "verified_payment_capture",
      sourceRef: identity.settlementRef,
      sourceDigest: identity.settlementDigest,
      policyRef: null,
      policyVersion: null,
      expiresAt: null,
      operation: op(identity.settlementRef)
    });
    payments.markOrderCredited({
      orderRef: order.orderRef,
      receiptRef: accepted.receipt.receiptRef,
      walletOperationRef: credited.operationRef,
      walletLotRef: credited.resultRef
    });
    return order.orderRef;
  }
  function bind(accountId) {
    const code = service.createLink("promoter").linkPath.split("/").at(-1);
    const touch = service.capture(code);
    db.transaction(() => recordReferralRegistration(db, {
      accountId,
      token: touch.token,
      registeredAt: now
    })).immediate();
    return { code, token: touch.token };
  }
  function confirmOrder(offerRef, key) {
    commerce.publishOfferVersion(offerRef === PLAN.offerRef ? PLAN : PACK);
    const quote = commerce.createCheckoutQuote({ accountId: "customer", offerRef });
    return commerce.confirmOrder({
      accountId: "customer",
      quoteRef: quote.quoteRef,
      operation: {
        actorScope: "portal:customer",
        idempotencyKey: key,
        actorType: "portal_user",
        actorRef: "customer"
      }
    });
  }
  const admin = createAdminUserCommerceService({ database: db, nowFn });
  t.after(() => {
    service.close();
    commerce.close();
    wallet.close();
    payments.close();
    db.close();
  });
  return {
    db,
    service,
    admin,
    recharge,
    bind,
    confirmOrder,
    setNow(value) { now = value; },
    approve() {
      risks.set("risk_test", {
        accountId: "customer",
        decisionRef: "risk_test",
        approved: true,
        refundObservationComplete: true
      });
      return service.confirm("customer", "risk_test");
    }
  };
}

test("invalid commerce input fails before a missing store is treated as unavailable", () => {
  const db = new Database(":memory:");
  const service = createAdminUserCommerceService({ database: db, nowFn: () => new Date(START) });
  assert.throws(() => createAdminUserCommerceService({ database: db, dbPath: "D:\\unused.sqlite" }), /source_conflict/);
  assert.throws(() => service.readOrders({ accountId: "customer", from: "2026-10-02", to: "2026-10-01" }), { code: "invalid_query" });
  assert.throws(() => service.readOrders({ accountId: "customer", from: "2026-02-31", to: "2026-03-01" }), { code: "invalid_query" });
  assert.throws(() => service.updateRate({ ratePercent: 0, effectiveAt: "2026-10-23", extra: true }), { code: "invalid_query" });
  assert.throws(() => service.updateRate({ ratePercent: 0, effectiveAt: "2026-10-23" }), { code: "invalid_query" });
  assert.throws(() => service.clawback({ accountId: "customer", coins: "0", reason: "重复发放" }), { code: "invalid_query" });
  const expressQuery = Object.create(null);
  expressQuery.accountId = "customer";
  expressQuery.from = "2026-09-01";
  expressQuery.to = "2026-09-30";
  assert.throws(() => service.readOrders(expressQuery), { code: "source_unavailable" });
  assert.throws(() => service.readSettlement(), { code: "source_unavailable" });
  assert.throws(() => createAdminUserCommerceService().readSettlement(), { code: "source_unavailable" });
  db.close();
});

test("admin commerce reads map orders, ledger, and share users without exposing the link", (t) => {
  const f = fixture(t);
  const link = f.bind("customer");
  const unbound = f.bind("customer_2");
  const rechargeRef = f.recharge();
  assert.equal(f.service.accrue("customer").status, "pending");
  const users = f.admin.readShareUsers({ accountId: "promoter", from: "2026-09-01", to: "2026-09-30" });
  assert.deepEqual(users.map((row) => row.accountId), ["customer_2", "customer"]);
  assert.equal(users.find((row) => row.accountId === "customer").firstRecharge, true);
  assert.equal(users.find((row) => row.accountId === "customer_2").firstRecharge, false);
  assert.equal(users.every((row) => row.linkLabel === "当前链接"), true);
  const encoded = JSON.stringify(users);
  assert.equal(encoded.includes(link.code), false);
  assert.equal(encoded.includes(link.token), false);
  assert.equal(encoded.includes(unbound.token), false);

  f.setNow("2026-09-10T00:00:00.000Z");
  assert.equal(f.approve().status, "available");
  const plan = f.confirmOrder(PLAN.offerRef, "confirm_plan");
  const pack = f.confirmOrder(PACK.offerRef, "confirm_pack");
  const orders = f.admin.readOrders({ accountId: "customer", from: "2026-09-01", to: "2026-09-30" });
  assert.deepEqual(orders.map((row) => row.kind), ["subscription", "recharge"]);
  assert.equal(orders.some((row) => row.orderRef === pack.orderRef), false);
  assert.deepEqual(orders[0], {
    orderRef: plan.orderRef,
    accountId: "customer",
    kind: "subscription",
    status: "held",
    amountLabel: "10 Coins",
    createdAt: "2026-09-10T00:00:00Z"
  });
  assert.deepEqual(orders[1], {
    orderRef: rechargeRef,
    accountId: "customer",
    kind: "recharge",
    status: "credited",
    amountLabel: "USD 3.00",
    createdAt: "2026-09-08T00:00:00Z"
  });
  assert.deepEqual(
    f.admin.readLedger({ accountId: "customer", from: "2026-09-01", to: "2026-09-30" })
      .filter((row) => row.title === "充值入账"),
    [{
      entryRef: f.db.prepare("select entry_ref from platform_coin_ledger_entries where operation = 'credit' and source_type = 'verified_payment_capture'").pluck().get(),
      accountId: "customer",
      occurredAt: "2026-09-08T00:00:00Z",
      direction: "credit",
      title: "充值入账",
      coins: "100"
    }]
  );
  assert.deepEqual(f.admin.readSettlement(), {
    ratePercent: 12.5,
    effectiveAt: "2026-09-08",
    availableRewardCoins: "12"
  });
});

test("rate publication is prospective and clawback reverses available reward coins", (t) => {
  const f = fixture(t);
  f.bind("customer");
  f.recharge();
  f.service.accrue("customer");
  f.setNow("2026-09-10T12:00:00.000Z");
  f.approve();
  const before = f.db.prepare("select reward_units, reversed_units from platform_referral_accruals").get();
  const originalPolicy = f.db.prepare("select policy_json from platform_referral_origins").pluck().get();
  const rewardEntry = f.db.prepare("select entry_ref from platform_coin_ledger_entries where source_type = 'portal_first_recharge_reward'").pluck().get();
  assert.throws(() => f.admin.updateRate({ ratePercent: 15, effectiveAt: "2026-09-10" }), { code: "conflict" });
  assert.deepEqual(f.admin.updateRate({ ratePercent: 15, effectiveAt: "2026-09-11" }), {
    ratePercent: 15,
    effectiveAt: "2026-09-11",
    availableRewardCoins: "12"
  });
  assert.deepEqual(f.admin.readSettlement(), {
    ratePercent: 12.5,
    effectiveAt: "2026-09-08",
    availableRewardCoins: "12"
  });
  assert.equal(f.db.prepare("select count(*) from platform_referral_policies").pluck().get(), 2);
  assert.equal(f.db.prepare("select policy_json from platform_referral_origins").pluck().get(), originalPolicy);
  assert.throws(() => f.admin.updateRate({ ratePercent: 15, effectiveAt: "2026-09-11" }), { code: "conflict" });

  const reason = "重复发放";
  assert.throws(() => f.admin.clawback({ accountId: "customer", coins: "5", reason }), { code: "conflict" });
  assert.throws(() => f.admin.clawback({ accountId: "promoter", coins: "13", reason }), { code: "conflict" });
  assert.equal(f.db.prepare("select available_units from platform_coin_lots where coin_type = 'reward_coins'").pluck().get(), 12);
  const result = f.admin.clawback({ accountId: "promoter", coins: "5", reason });
  assert.equal(result.clawbackRef.startsWith("clawback_"), true);
  assert.deepEqual(result.settlement, {
    ratePercent: 12.5,
    effectiveAt: "2026-09-08",
    availableRewardCoins: "7"
  });
  assert.equal(JSON.stringify(result).includes(reason), false);
  assert.deepEqual(
    f.db.prepare("select reward_units, reversed_units from platform_referral_accruals").get(),
    { reward_units: before.reward_units, reversed_units: 0 }
  );
  assert.deepEqual(
    f.db.prepare("select available_units, reversed_units from platform_coin_lots where coin_type = 'reward_coins'").get(),
    { available_units: 7, reversed_units: 5 }
  );
  assert.equal(f.db.prepare("select entry_ref from platform_coin_ledger_entries where entry_ref = ?").pluck().get(rewardEntry), rewardEntry);
  assert.equal(
    f.db.prepare("select digest from platform_referral_events where event_ref = ?").pluck().get(result.clawbackRef),
    digest(JSON.stringify({ accountId: "promoter", kind: "admin_reward_clawback", coins: 5, reason }))
  );
  assert.deepEqual(
    f.admin.readLedger({ accountId: "promoter", from: "2026-09-10", to: "2026-09-10" }),
    [{
      entryRef: f.db.prepare("select entry_ref from platform_coin_ledger_entries where operation = 'available_to_reversed'").pluck().get(),
      accountId: "promoter",
      occurredAt: "2026-09-10T12:00:00Z",
      direction: "debit",
      title: "奖励划扣",
      coins: "5"
    }]
  );
});

test("share-user window over 100 rows conflicts instead of hiding accounts", (t) => {
  const f = fixture(t);
  f.bind("customer");
  const touch = f.db.prepare("select touch_digest from platform_referral_bindings where account_id = 'customer'").get();
  const insertAccount = f.db.prepare("insert into platform_accounts values(?,?,'active',?,?,'{}')");
  const insertBinding = f.db.prepare("insert into platform_referral_bindings values(?,?,?,?)");
  for (let index = 0; index < 100; index += 1) {
    const id = `guest_${String(index).padStart(2, "0")}`;
    insertAccount.run(id, `owner_${id}`, START, START);
    insertBinding.run(id, "promoter", touch.touch_digest, "2026-08-01T00:00:00.000Z");
  }
  assert.equal(f.admin.readShareUsers({ accountId: "promoter", from: "2026-08-01", to: "2026-08-01" }).length, 100);
  insertAccount.run("guest_overflow", "owner_guest_overflow", START, START);
  insertBinding.run("guest_overflow", "promoter", touch.touch_digest, "2026-08-01T00:00:00.000Z");
  assert.throws(() => f.admin.readShareUsers({ accountId: "promoter", from: "2026-08-01", to: "2026-08-01" }), { code: "conflict" });
});
