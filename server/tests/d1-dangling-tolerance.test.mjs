// D1 control-plane read — dangling-reference tolerance (E2/E4/E5/E6/E7/E8/E9).
//
// E4 dropped 11 foreign keys, so child rows can exist while their parent
// row was never migrated. These tests prove each tolerant path degrades to
// "unmigrated" instead of failing closed, and that a present-but-wrong
// parent still fails closed. All fixtures are synthetic in-memory SQLite
// databases built by the tests themselves; nothing here touches D1, BWH,
// or any real control plane, and no secret ever enters a test artifact.

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  applyCoinWalletMigrations
} from "../services/platform/coin-wallet-migrations.mjs";
import { createSqliteCoinWalletStore } from "../services/platform/coin-wallet-store.mjs";
import {
  COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID,
  applyCoinCommerceMigrations
} from "../services/platform/coin-commerce-migrations.mjs";
import { createSqliteCoinCommerceStore } from "../services/platform/coin-commerce-store.mjs";
import {
  applyPaymentStoreMigrations
} from "../services/platform/payment-store-migrations.mjs";
import {
  createSqlitePaymentStore
} from "../services/platform/payment-store.mjs";
import { createPaymentRechargeOfferCatalog } from "../services/platform/payment-recharge-offer-catalog.mjs";
import { paymentSettlementIdentity } from "../services/platform/payment-recharge-coordinator.mjs";
import {
  REFERRAL_DDL_CHECKSUM,
  REFERRAL_MIGRATION_ID,
  applyPortalReferralMigration
} from "../services/platform/portal-referral-migrations.mjs";
import { recordReferralRegistration } from "../services/platform/portal-referral-contract.mjs";
import { createPortalReferralService } from "../services/platform/portal-referral-service.mjs";

const NOW = "2026-07-23T12:34:56.000Z";
const NOW_DATE = new Date(NOW);
const COMMERCE_CLOCK = "2026-07-26T12:34:56.000Z";
const REF_NOW = "2026-09-08T00:00:00.000Z";
// Local copy of the referral test's approved first-recharge policy
// (confirmationDays 7, so confirmation lands on 2026-09-15).
const REFERRAL_POLICY = {
  policyRef: "test_first_recharge_20_percent",
  version: 1,
  effectiveAt: REF_NOW,
  rateBps: 2000,
  rounding: "floor",
  attributionDays: 60,
  confirmationDays: 7
};
const REFERRAL_CONFIRMATION = {
  expectedMigrationId: REFERRAL_MIGRATION_ID,
  expectedDdlChecksum: REFERRAL_DDL_CHECKSUM
};

// Captures console.warn lines while `fn` runs (the dangling log helper
// writes through console.warn), then restores the original.
function captureWarnings(fn) {
  const lines = [];
  const original = console.warn;
  console.warn = (...args) => lines.push(args.join(" "));
  try {
    return { result: fn(), lines };
  } finally {
    console.warn = original;
  }
}

// E4 simulation helper: run `fn` with foreign-key checks off, then back on.
function withoutForeignKeys(database, fn) {
  database.pragma("foreign_keys = OFF");
  try {
    return fn();
  } finally {
    database.pragma("foreign_keys = ON");
  }
}

// ---------------------------------------------------------------------------
// E5 / E6 — subscription control store (light fixture, store-built schema)
// ---------------------------------------------------------------------------

function controlFixture(t) {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  const store = createSqliteSubscriptionControlStore({ database });
  t.after(() => {
    try {
      store.close();
    } catch {
      // Already closed.
    }
  });
  return { database, store };
}

function insertAccount(database, accountId, { commercialModel = null } = {}) {
  database.prepare(`
    insert into platform_accounts (id, owner_ref, status, created_at, updated_at, metadata_json)
    values (?, ?, 'active', ?, ?, ?)
  `).run(accountId, accountId, NOW, NOW, JSON.stringify(
    commercialModel ? { commercialModel } : {}
  ));
}

function insertEntitlement(database, entitlementId, accountId) {
  database.prepare(`
    insert into platform_entitlements (
      id, account_id, plan, status, valid_from, valid_until,
      traffic_limit_bytes, created_at, updated_at
    ) values (?, ?, 'monthly', 'active', ?, ?, 1000, ?, ?)
  `).run(entitlementId, accountId, NOW, "2027-07-23T00:00:00.000Z", NOW, NOW);
}

function insertIssuanceRequest(database, requestId, accountId, entitlementId) {
  database.prepare(`
    insert into platform_issuance_requests (
      id, account_id, entitlement_id, approval_ref, status, quantity,
      node_id, purpose, requested_by_ref, created_at, updated_at
    ) values (?, ?, ?, 'approval_1', 'issued', 1, 'node_1', 'subscription', 'operator_1', ?, ?)
  `).run(requestId, accountId, entitlementId, NOW, NOW);
}

function insertLink(database, linkId, requestId, tenantRef, artifactRef = "artifact_1") {
  database.prepare(`
    insert into platform_issued_subscription_links
      (id, request_id, tenant_ref, artifact_ref, status, created_at, updated_at)
    values (?, ?, ?, ?, 'active', ?, ?)
  `).run(linkId, requestId, tenantRef, artifactRef, NOW, NOW);
}

function insertAccessRequest(database, requestId, { status = "delivered" } = {}) {
  database.prepare(`
    insert into platform_portal_access_requests (
      id, portal_user_ref, plan, client_target, duration_days, quantity,
      status, next_action, prior_trial_state, submitted_at, updated_at,
      entitlement_ref, tenant_id, artifact_id, expires_at, valid_until
    ) values (
      ?, ?, 'monthly', 'clash', 30, 1, ?, '', 'none', ?, ?,
      'entitlement_1', 'tenant_1', 'artifact_1',
      '2027-07-23T00:00:00.000Z', '2027-07-23T00:00:00.000Z'
    )
  `).run(requestId, "portal_user_1", status, NOW, NOW);
}

function insertCredential(database, { requestId, channelRef = "chan_1", credentialRef = "edgecred_1" }) {
  database.prepare(`
    insert into platform_portal_edge_credentials (
      request_id, edge_channel_ref, edge_credential_ref, edge_material_digest, ordinal
    ) values (?, ?, ?, ?, 1)
  `).run(requestId, channelRef, credentialRef, `sha256:${"a".repeat(64)}`);
}

function insertPackCredential(database, { requestRef, entitlementRef, credentialRef }) {
  database.prepare(`
    insert into platform_data_pack_edge_credentials (
      request_ref, entitlement_ref, edge_channel_ref, edge_credential_ref,
      edge_material_digest, status, created_at, updated_at
    ) values (?, ?, 'chan_1', ?, ?, 'active', ?, ?)
  `).run(requestRef, entitlementRef, credentialRef, `sha256:${"b".repeat(64)}`, NOW, NOW);
}

test("E5/E6 dangling tolerance in the control store", (t) => {
  const { database, store } = controlFixture(t);
  // A migrated link whose issuance request never arrived (E5).
  withoutForeignKeys(database, () => insertLink(database, "link_1", "req_missing", "tenant_1"));
  // A data-pack credential whose issuance request never arrived (E5).
  withoutForeignKeys(database, () => insertPackCredential(database, {
    requestRef: "req_missing", entitlementRef: "ent_missing", credentialRef: "edgecred_pack_missing"
  }));
  // A credential whose access request never arrived (E6).
  withoutForeignKeys(database, () => insertCredential(database, { requestId: "pareq_missing" }));
  // A wallet-first account whose entitlement exists but whose request and
  // portal rows never arrived.
  insertAccount(database, "acct_wf", { commercialModel: "wallet_first_unique_v1" });
  insertEntitlement(database, "ent_wf", "acct_wf");

  const { lines } = captureWarnings(() => {
    const bindings = store.listIssuedSubscriptionBindings();
    assert.equal(bindings.length, 1);
    assert.equal(bindings[0].tenantRef, "tenant_1");
    assert.equal(bindings[0].requestStatus, null);
    assert.equal(bindings[0].requestId, "req_missing");

    const packBinding = store.findIssuedSubscriptionBindingByEdgeCredentialRef("edgecred_pack_missing");
    assert.equal(packBinding.requestStatus, null);
    assert.equal(packBinding.requestId, "req_missing");

    const usage = store.findUsageBindingByTenantRef("tenant_1");
    assert.equal(usage.tenantRef, "tenant_1");
    assert.equal(usage.requestStatus, null);
    assert.equal(usage.edgeCredentialRef, "edgecred_req_missing");

    assert.deepEqual(store.getThirdPartySubscriptionEligibilityByTenantRefs(["tenant_1"]), {
      state: "denied"
    });

    assert.deepEqual(store.resolveExactWalletFirstResourceChainForDeferredTransition({
      accountId: "acct_wf"
    }), { state: "none", activeChainCount: 0 });

    const desired = store.getLatestEdgeDesiredStateForChannel("chan_1");
    assert.deepEqual(desired.edgeCredentialRefs, ["edgecred_1"]);
  });
  const joined = lines.join("\n");
  assert.match(joined, /data_pack_binding_unmigrated/);
  assert.match(joined, /third_party_eligibility_denied_unmigrated/);
  assert.match(joined, /wallet_first_chain_unmigrated/);
  assert.match(joined, /edge_desired_state_unmigrated_credentials/);
});

test("E5: per-account binding lists stay strict (unmigrated links are not leaked)", (t) => {
  const { database, store } = controlFixture(t);
  withoutForeignKeys(database, () => insertLink(database, "link_1", "req_missing", "tenant_1"));
  assert.deepEqual(store.listIssuedSubscriptionBindings({ accountId: "acct_1" }), []);
});

test("E6: a credential whose request exists but is disabled is not delivered", (t) => {
  const { database, store } = controlFixture(t);
  insertAccessRequest(database, "pareq_disabled", { status: "disabled" });
  insertCredential(database, { requestId: "pareq_disabled" });
  const desired = store.getLatestEdgeDesiredStateForChannel("chan_1");
  assert.deepEqual(desired.edgeCredentialRefs, []);
});

test("E5: a link whose request exists still resolves its request fields", (t) => {
  const { database, store } = controlFixture(t);
  insertAccount(database, "acct_1");
  insertEntitlement(database, "ent_1", "acct_1");
  insertIssuanceRequest(database, "req_1", "acct_1", "ent_1");
  insertLink(database, "link_1", "req_1", "tenant_1");
  const bindings = store.listIssuedSubscriptionBindings();
  assert.equal(bindings.length, 1);
  assert.equal(bindings[0].requestStatus, "issued");
  assert.equal(bindings[0].accountId, "acct_1");
});

// ---------------------------------------------------------------------------
// E4 — wallet projection excludes orphan allocation amounts
// ---------------------------------------------------------------------------

function walletFixture(t) {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  database.exec(`
    create table platform_accounts (
      id text primary key,
      owner_ref text not null,
      status text not null check (status in ('active', 'suspended', 'disabled')),
      created_at text not null,
      updated_at text not null,
      metadata_json text not null default '{}'
    )
  `);
  applyCoinWalletMigrations({
    database,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(NOW_DATE)
  });
  database.prepare(`
    insert into platform_accounts (id, owner_ref, status, created_at, updated_at, metadata_json)
    values ('account_1', 'owner_account_1', 'active', ?, ?, '{}')
  `).run(NOW, NOW);
  let refCount = 0;
  const store = createSqliteCoinWalletStore({
    database,
    nowFn: () => new Date(NOW_DATE),
    refFactory: () => `ref_${++refCount}`
  });
  t.after(() => {
    try {
      store.close();
    } catch {
      // Already closed.
    }
  });
  return { database, store };
}

function creditPaidCoins(store, accountId, amountUnits, idempotencyKey) {
  return store.creditCoins({
    accountId,
    coinType: "paid_coins",
    amountUnits,
    availability: "available",
    sourceType: "verified_recharge",
    sourceRef: "source_1",
    sourceDigest: "a".repeat(64),
    policyRef: null,
    policyVersion: null,
    expiresAt: null,
    operation: {
      actorScope: `account:${accountId}`,
      idempotencyKey,
      actorType: "system",
      actorRef: "settlement_worker"
    }
  });
}

test("E4: an orphan hold allocation is excluded from held units instead of 503", (t) => {
  const { database, store } = walletFixture(t);
  const credited = creditPaidCoins(store, "account_1", 25, "credit_orphan");
  // Simulate the E4 state: the allocation row arrived but its hold never did.
  // Move 5 units from available to held to keep the lot's unit-sum CHECK true.
  database.prepare(`
    update platform_coin_lots
       set available_units = available_units - 5, held_units = 5
     where lot_ref = ?
  `).run(credited.resultRef);
  withoutForeignKeys(database, () => {
    database.prepare(`
      insert into platform_coin_hold_allocations (
        allocation_ref, hold_ref, lot_ref, allocation_sequence, allocated_units,
        created_at
      ) values (?, ?, ?, 1, 5, ?)
    `).run("alloc_orphan", "hold_missing", credited.resultRef, NOW);
  });
  const { result, lines } = captureWarnings(() => store.getWalletProjection({
    walletRef: credited.walletRef
  }));
  assert.equal(result.spendableUnits, 20);
  assert.equal(result.heldUnits, 0);
  assert.match(lines.join("\n"), /wallet_orphan_allocations_excluded/);
});

test("E4: a present-but-drifting held allocation still fails closed", (t) => {
  const { database, store } = walletFixture(t);
  const credited = creditPaidCoins(store, "account_1", 25, "credit_drift");
  // No allocation rows at all, but the lot claims held units: genuine drift.
  database.prepare(`
    update platform_coin_lots
       set available_units = available_units - 5, held_units = 5
     where lot_ref = ?
  `).run(credited.resultRef);
  assert.throws(
    () => store.getWalletProjection({ walletRef: credited.walletRef }),
    (error) => error.code === "wallet_infrastructure_error"
  );
});

// ---------------------------------------------------------------------------
// E2 — commerce cancel path with a missing hold row
// (fixture helpers copied from platform-coin-commerce-store.test.mjs)
// ---------------------------------------------------------------------------

function commerceRefFactory() {
  const counts = new Map();
  return (kind) => {
    const count = (counts.get(kind) ?? 0) + 1;
    counts.set(kind, count);
    return `${kind}_${count}`;
  };
}

function fixedClockDatabase(database, clock) {
  return new Proxy(database, {
    get(target, property) {
      if (property === "inTransaction") return target.inTransaction;
      if (property === "prepare") {
        return (sql) => {
          if (/select\s+strftime\('%Y-%m-%dT%H:%M:%fZ',\s*'now'\)/i.test(sql)) {
            return { pluck: () => ({ get: () => clock.value }) };
          }
          return target.prepare(sql);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}

function commerceFixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "d1-dangling-commerce-"));
  const dbPath = join(directory, "synthetic.sqlite");
  const database = new Database(dbPath);
  database.pragma("foreign_keys = ON");
  database.exec(`
    create table platform_accounts (
      id text primary key,
      owner_ref text not null,
      status text not null check (status in ('active', 'suspended', 'disabled')),
      created_at text not null,
      updated_at text not null,
      metadata_json text not null default '{}'
    )
  `);
  applyCoinWalletMigrations({
    database,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(COMMERCE_CLOCK)
  });
  applyCoinCommerceMigrations({
    database,
    expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(COMMERCE_CLOCK)
  });
  database.prepare(`
    insert into platform_accounts
      (id, owner_ref, status, created_at, updated_at, metadata_json)
    values ('acct_synthetic_1', 'owner_acct_synthetic_1', 'active', ?, ?, '{}')
  `).run(COMMERCE_CLOCK, COMMERCE_CLOCK);
  const clock = { value: COMMERCE_CLOCK };
  const store = createSqliteCoinCommerceStore({
    database: fixedClockDatabase(database, clock),
    commerceRefFactory: commerceRefFactory(),
    walletRefFactory: commerceRefFactory()
  });
  t.after(() => {
    try {
      store.close();
    } catch {
      // Already closed.
    }
    try {
      database.close();
    } catch {
      // Already closed.
    }
    rmSync(directory, { recursive: true, force: true });
  });
  return { database, store };
}

function commerceWalletOperation(id) {
  return {
    actorScope: "system:commerce-test",
    idempotencyKey: id,
    actorType: "system",
    actorRef: "commerce_test"
  };
}

function commerceOperation(id, accountId = "acct_synthetic_1") {
  return {
    actorScope: `portal:${accountId}`,
    idempotencyKey: id,
    actorType: "portal_user",
    actorRef: accountId
  };
}

function commerceOffer() {
  return {
    offerRef: "offer_monthly_basic",
    offerVersionRef: "offerv_monthly_basic_v1",
    version: 1,
    category: "plan",
    title: { zh: "基础月卡", en: "Basic monthly plan" },
    summary: { zh: "每月 50 GB", en: "50 GB monthly" },
    importantNotices: {
      zh: ["仅用于平台自营服务"],
      en: ["For platform-owned services only"]
    },
    baseCoinUnits: 20,
    referencePrice: { currency: "CNY", amountMinor: 2_000 },
    acceptedCoinTypes: ["bonus_coins", "paid_coins", "reward_coins"],
    delivery: {
      kind: "subscription_plan",
      durationDays: 30,
      monthlyTrafficGb: 50,
      trafficGb: null,
      neverExpires: false,
      discountBasisPoints: 500
    }
  };
}

function commerceCredit(store, { accountId, coinType, amountUnits, suffix, availability = "available", expiresAt = null }) {
  const credited = store.walletStore.creditCoins({
    accountId,
    coinType,
    amountUnits,
    availability,
    sourceType: "synthetic_seed",
    sourceRef: `source_${suffix}`,
    sourceDigest: suffix.padEnd(64, "0").slice(0, 64),
    policyRef: coinType === "reward_coins" ? "reward_policy" : null,
    policyVersion: coinType === "reward_coins" ? 1 : null,
    expiresAt,
    operation: commerceWalletOperation(`credit_${suffix}`)
  });
  if (availability === "pending") {
    store.walletStore.confirmCoinCredit({
      lotRef: credited.resultRef,
      amountUnits,
      operation: commerceWalletOperation(`confirm_${suffix}`)
    });
  }
  return credited;
}

function commerceSeedWallet(store, accountId = "acct_synthetic_1") {
  commerceCredit(store, {
    accountId, coinType: "bonus_coins", amountUnits: 5,
    suffix: "bonus", expiresAt: "2099-01-01T00:00:00.000Z"
  });
  commerceCredit(store, { accountId, coinType: "paid_coins", amountUnits: 20, suffix: "paid" });
  commerceCredit(store, {
    accountId, coinType: "reward_coins", amountUnits: 10,
    suffix: "reward", availability: "pending"
  });
}

function commerceHeldOrder(store) {
  store.publishOfferVersion(commerceOffer());
  const quote = store.createCheckoutQuote({
    accountId: "acct_synthetic_1",
    offerRef: "offer_monthly_basic"
  });
  return store.confirmOrder({
    accountId: "acct_synthetic_1",
    quoteRef: quote.quoteRef,
    operation: commerceOperation("confirm_1")
  });
}

function deleteHoldRow(database, orderRef) {
  const holdRef = database.prepare(`
    select hold_ref from platform_coin_commerce_orders where order_ref = ?
  `).get(orderRef).hold_ref;
  withoutForeignKeys(database, () => {
    // The allocation table's immutability triggers are a local-DB guard;
    // dropping them here simulates the E4 state, where these rows never
    // arrived at all (there is nothing to protect). The holds table has
    // no delete-blocking trigger, so its row deletes directly.
    database.exec("drop trigger platform_coin_hold_allocations_immutable_update");
    database.exec("drop trigger platform_coin_hold_allocations_immutable_delete");
    database.prepare(`
      delete from platform_coin_hold_allocations where hold_ref = ?
    `).run(holdRef);
    database.prepare(`
      delete from platform_coin_holds where hold_ref = ?
    `).run(holdRef);
  });
}

test("E2: cancelling a held order whose hold row was never migrated succeeds", (t) => {
  const { database, store } = commerceFixture(t);
  commerceSeedWallet(store);
  const order = commerceHeldOrder(store);
  assert.equal(order.paymentStatus, "held");
  // Simulate the E4 state: the hold row (and its allocations) never arrived.
  deleteHoldRow(database, order.orderRef);
  const { result, lines } = captureWarnings(() => store.cancelOrder({
    accountId: "acct_synthetic_1",
    orderRef: order.orderRef,
    operation: commerceOperation("cancel_unmigrated")
  }));
  assert.equal(result.paymentStatus, "cancelled");
  assert.match(lines.join("\n"), /order_hold_unmigrated/);
});

test("E2: the recovery scan surfaces an unmigrated held order without failing", (t) => {
  const { database, store } = commerceFixture(t);
  commerceSeedWallet(store);
  const order = commerceHeldOrder(store);
  deleteHoldRow(database, order.orderRef);
  const result = store.recoverNonTerminalOrders({ limit: 10 });
  assert.equal(result.scanned, 1);
  assert.equal(result.readyForCapture, 0);
  assert.equal(result.reconciliationRequired, 1);
});

// ---------------------------------------------------------------------------
// E7 / E8 / E9 — referral settle/confirm with missing parent rows
// (fixture helpers copied from platform-portal-referral.test.mjs)
// ---------------------------------------------------------------------------

function referralFixture(t, { paidCoinUnits = 100 } = {}) {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`
    create table platform_accounts (
      id text primary key,
      owner_ref text not null,
      status text not null,
      created_at text not null,
      updated_at text not null,
      metadata_json text not null default '{}'
    )
  `);
  applyCoinWalletMigrations({
    database: db,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(REF_NOW)
  });
  applyPaymentStoreMigrations({ database: db, nowFn: () => REF_NOW });
  let now = REF_NOW;
  let sequence = 0;
  const nowFn = () => new Date(now);
  const refs = (kind) => `${kind}_${++sequence}`;
  const op = (key) => ({
    actorScope: "test",
    actorType: "test",
    actorRef: "test",
    idempotencyKey: key
  });
  const wallet = createSqliteCoinWalletStore({ database: db, nowFn, refFactory: refs });
  const payments = createSqlitePaymentStore({ database: db, nowFn, refFactory: refs });
  const refunds = new Map();
  const risks = new Map();
  applyPortalReferralMigration(db, REFERRAL_CONFIRMATION);
  const service = createPortalReferralService({
    database: db,
    nowFn,
    rewardsEnabled: true,
    riskReader: (decisionRef) => risks.get(decisionRef),
    refundReader: (observationRef) => refunds.get(observationRef)
  });
  service.publishPolicy(REFERRAL_POLICY);
  for (const id of ["promoter", "other_promoter", "customer"]) {
    db.prepare(`
      insert into platform_accounts values (?, ?, 'active', ?, ?, '{}')
    `).run(id, `owner_${id}`, REF_NOW, REF_NOW);
  }
  t.after(() => {
    try {
      service.close();
    } catch {
      // Already closed.
    }
    try {
      wallet.close();
    } catch {
      // Already closed.
    }
    try {
      payments.close();
    } catch {
      // Already closed.
    }
    try {
      db.close();
    } catch {
      // Already closed.
    }
  });
  const offer = createPaymentRechargeOfferCatalog({
    environment: "sandbox",
    offers: [{
      offerRef: "test_offer",
      quoteVersion: 1,
      paidCoinUnits,
      amountMinor: 300,
      currency: "USD",
      currencyExponent: 2,
      paymentMethods: ["paypal"],
      enabled: true
    }]
  }).getOffer("test_offer");
  function recharge(accountId = "customer", { credit = true, close = true } = {}) {
    const { order } = payments.createOrder({
      accountId,
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
          url: "https://www.sandbox.paypal.com/checkoutnow?token=<redacted>",
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
    let credited;
    if (credit) {
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
        operation: op(identity.settlementRef)
      });
    }
    const closeOrder = () => payments.markOrderCredited({
      orderRef: order.orderRef,
      receiptRef: accepted.receipt.receiptRef,
      walletOperationRef: credited.operationRef,
      walletLotRef: credited.resultRef
    });
    if (credit && close) closeOrder();
    return { orderRef: order.orderRef, lotRef: credited?.resultRef, closeOrder };
  }
  function bind(accountId = "customer", promoter = "promoter") {
    const code = service.createLink(promoter).linkPath.split("/").at(-1);
    const touch = service.capture(code);
    db.transaction(() => recordReferralRegistration(db, {
      accountId,
      token: touch.token,
      registeredAt: now
    })).immediate();
    return touch;
  }
  return {
    database: db,
    service,
    wallet,
    payments,
    recharge,
    bind,
    refunds,
    risks,
    setNow: (value) => {
      now = value;
    },
    row: () => db.prepare(`
      select * from platform_referral_accruals where account_id = 'customer'
    `).get(),
    approve: () => {
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

function referralSetup(t) {
  const f = referralFixture(t);
  f.bind();
  f.recharge();
  assert.deepEqual(f.service.accrue("customer"), { status: "pending", replayed: false });
  return f;
}

test("E7: settling with a missing referrer profile defers instead of throwing", (t) => {
  const f = referralSetup(t);
  f.setNow("2026-09-15T00:00:00.000Z");
  withoutForeignKeys(f.database, () => {
    // The profile table's no-delete trigger is a local-DB guard; dropping
    // it here simulates the E4 state, where the profile row never arrived.
    f.database.exec("drop trigger platform_referral_profile_no_delete");
    f.database.prepare(`
      delete from platform_referral_profiles where account_id = 'promoter'
    `).run();
  });
  const { result, lines } = captureWarnings(() => f.service.settle({ limit: 10 }));
  assert.deepEqual(result, ["pending_unmigrated"]);
  assert.match(lines.join("\n"), /referral_profile_unmigrated/);
});

test("E8: confirming with a missing referrer profile defers instead of throwing", (t) => {
  const f = referralSetup(t);
  f.setNow("2026-09-15T00:00:00.000Z");
  withoutForeignKeys(f.database, () => {
    // The profile table's no-delete trigger is a local-DB guard; dropping
    // it here simulates the E4 state, where the profile row never arrived.
    f.database.exec("drop trigger platform_referral_profile_no_delete");
    f.database.prepare(`
      delete from platform_referral_profiles where account_id = 'promoter'
    `).run();
  });
  const { result, lines } = captureWarnings(() => f.approve());
  assert.deepEqual(result, { status: "pending_unmigrated", accountId: "customer" });
  assert.match(lines.join("\n"), /referral_confirm_account_unmigrated|referral_profile_unmigrated/);
});

test("E9: settling with a missing payment order defers instead of throwing", (t) => {
  const f = referralSetup(t);
  f.setNow("2026-09-15T00:00:00.000Z");
  const paymentOrderRef = f.database.prepare(`
    select payment_order_ref from platform_referral_origins where account_id = 'customer'
  `).get().payment_order_ref;
  withoutForeignKeys(f.database, () => {
    f.database.prepare(`
      delete from platform_payment_orders where payment_order_ref = ?
    `).run(paymentOrderRef);
  });
  const { result, lines } = captureWarnings(() => f.service.settle({ limit: 10 }));
  assert.deepEqual(result, ["pending_unmigrated"]);
  assert.match(lines.join("\n"), /referral_payment_order_unmigrated/);
});

// ---------------------------------------------------------------------------
// Async D1 read path: a local-backed fake client must match the sync reads
// ---------------------------------------------------------------------------

function localD1Client(database) {
  return {
    kind: "d1-read-client",
    query: async (sql, params = []) => database.prepare(sql).all(...params),
    queryOne: async (sql, params = []) => database.prepare(sql).get(...params) ?? null,
    queryAllKeyset: async ({ pageQuery, keyOf, pageSize = 100 }) => {
      const rows = [];
      let cursor = null;
      for (;;) {
        const { sql, params = [] } = pageQuery(cursor);
        const page = database.prepare(sql).all(...params, pageSize);
        rows.push(...page);
        if (page.length < pageSize) break;
        cursor = keyOf(page[page.length - 1]);
      }
      return rows;
    }
  };
}

test("async D1 reads return the same rows as the sync local reads", async (t) => {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  const local = createSqliteSubscriptionControlStore({ database });
  const d1 = createSqliteSubscriptionControlStore({
    database,
    d1ReadClient: localD1Client(database)
  });
  t.after(() => {
    try {
      local.close();
    } catch {
      // Already closed.
    }
    try {
      d1.close();
    } catch {
      // Already closed.
    }
  });
  insertAccount(database, "acct_1");
  insertEntitlement(database, "ent_1", "acct_1");
  insertIssuanceRequest(database, "req_1", "acct_1", "ent_1");
  insertLink(database, "link_1", "req_1", "tenant_1");
  insertAccessRequest(database, "pareq_1");
  insertCredential(database, { requestId: "pareq_1", channelRef: "chan_1", credentialRef: "edgecred_1" });
  database.prepare(`
    insert into platform_usage_rollups (
      edge_credential_ref, account_id, entitlement_id, request_id, channel_ref,
      upload_bytes, download_bytes, total_bytes, last_observed_at, updated_at
    ) values (?, ?, ?, ?, ?, 100, 200, 300, ?, ?)
  `).run("edgecred_1", "acct_1", "ent_1", "req_1", "chan_1", NOW, NOW);

  assert.deepEqual(await d1.listIssuedSubscriptionBindingsAsync(), local.listIssuedSubscriptionBindings());
  assert.deepEqual(
    await d1.findUsageBindingByTenantRefAsync("tenant_1"),
    local.findUsageBindingByTenantRef("tenant_1")
  );
  assert.deepEqual(
    await d1.getUsageRollupByEdgeCredentialRefAsync("edgecred_1"),
    local.getUsageRollupByEdgeCredentialRef("edgecred_1")
  );
  assert.deepEqual(
    await d1.listPortalEdgeCredentialsAsync("pareq_1"),
    await local.listPortalEdgeCredentialsAsync("pareq_1")
  );
  assert.deepEqual(
    await d1.getLatestEdgeDesiredStateForChannelAsync("chan_1"),
    local.getLatestEdgeDesiredStateForChannel("chan_1")
  );
  assert.deepEqual(
    await d1.findIssuedSubscriptionBindingByEdgeCredentialRefAsync("edgecred_req_1"),
    local.findIssuedSubscriptionBindingByEdgeCredentialRef("edgecred_req_1")
  );
});

test("async D1 reads delegate to the local sync reads when no client is configured", async (t) => {
  const { database, store } = controlFixture(t);
  assert.equal(store.d1ReadClient, null);
  insertAccount(database, "acct_1");
  insertEntitlement(database, "ent_1", "acct_1");
  insertIssuanceRequest(database, "req_1", "acct_1", "ent_1");
  insertLink(database, "link_1", "req_1", "tenant_1");
  assert.deepEqual(await store.listIssuedSubscriptionBindingsAsync(), store.listIssuedSubscriptionBindings());
});
