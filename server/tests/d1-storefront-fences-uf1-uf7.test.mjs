// D3-A: storefront fence wiring for U-F1..U-F7 (disposition R2 §3 rows 1-7).
// Each store/service is exercised twice: the write succeeds while the
// writer authority is BWH_ACTIVE, and the same write is refused with
// `writer_authority_not_bwh` (or a blocked CLI result naming that code)
// once the authority has moved to FROZEN. Reads stay available in FROZEN.
// Fixtures are minimal copies of the owning test files' setups, cited inline.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import {
  ensureWriterAuthority,
  transitionWriterAuthority
} from "../services/platform/single-writer-authority.mjs";
import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  applyCoinWalletMigrations
} from "../services/platform/coin-wallet-migrations.mjs";
import {
  createSqliteCoinWalletStore
} from "../services/platform/coin-wallet-store.mjs";
import {
  applyPaymentStoreMigrations
} from "../services/platform/payment-store-migrations.mjs";
import {
  createPaymentRechargeOfferCatalog
} from "../services/platform/payment-recharge-offer-catalog.mjs";
import {
  createSqlitePaymentStore
} from "../services/platform/payment-store.mjs";
import {
  createSqliteAdsConsentStore
} from "../services/platform/ads-consent-store.mjs";
import {
  applyPortalReferralMigration,
  REFERRAL_DDL_CHECKSUM,
  REFERRAL_MIGRATION_ID
} from "../services/platform/portal-referral-migrations.mjs";
import {
  createPortalReferralService
} from "../services/platform/portal-referral-service.mjs";
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
  createAdminUserCommerceService
} from "../services/platform/admin-user-commerce.mjs";
import {
  runLeadPurge
} from "../services/platform/lead-retention-operations.mjs";

const NOW = "2026-09-08T00:00:00.000Z";
const ENABLED = { ADS_CLICK_BINDING_ENABLED: "true" };

function codeOf(fn) {
  try {
    fn();
  } catch (error) {
    return error?.code;
  }
  return null;
}

function freezeDb(db) {
  ensureWriterAuthority(db);
  transitionWriterAuthority(db, { to: "FROZEN", expectedEpoch: 1 });
}

function withTempDir(prefix, fn) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  try {
    return fn(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

function makeRefFactory() {
  const counts = new Map();
  return (kind) => {
    const next = (counts.get(kind) ?? 0) + 1;
    counts.set(kind, next);
    return `${kind}_${next}`;
  };
}

// --- U-F1 wallet fixture (platform-coin-wallet-store.test.mjs) ------------
function walletDb() {
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
    nowFn: () => new Date(NOW)
  });
  database.prepare(`
    insert into platform_accounts (id, owner_ref, status, created_at, updated_at, metadata_json)
    values (?, ?, 'active', ?, ?, '{}')
  `).run("account_1", "owner_account_1", NOW, NOW);
  return database;
}

function validCredit(overrides = {}) {
  return {
    accountId: "account_1",
    coinType: "paid_coins",
    amountUnits: 25,
    availability: "available",
    sourceType: "verified_recharge",
    sourceRef: "source_1",
    sourceDigest: "a".repeat(64),
    policyRef: null,
    policyVersion: null,
    expiresAt: null,
    ...overrides,
    operation: {
      actorScope: "account:account_1",
      idempotencyKey: "credit_1",
      actorType: "system",
      actorRef: "settlement_worker",
      ...(overrides.operation ?? {})
    }
  };
}

test("U-F1 wallet creditCoins succeeds while BWH_ACTIVE", () => {
  const database = walletDb();
  const store = createSqliteCoinWalletStore({
    database,
    nowFn: () => new Date(NOW),
    refFactory: makeRefFactory()
  });
  try {
    ensureWriterAuthority(database);
    const result = store.creditCoins(validCredit());
    assert.equal(result.safeResultCode, "credited");
    assert.equal(
      database.prepare("select count(*) from platform_coin_operation_receipts").pluck().get(),
      1
    );
  } finally {
    store.close();
    database.close();
  }
});

test("U-F1 wallet writes are refused in FROZEN and reads still work", () => {
  const database = walletDb();
  const store = createSqliteCoinWalletStore({
    database,
    nowFn: () => new Date(NOW),
    refFactory: makeRefFactory()
  });
  try {
    store.creditCoins(validCredit());
    freezeDb(database);
    assert.equal(codeOf(() => store.creditCoins(validCredit({
      operation: { idempotencyKey: "credit_2" }
    }))), "writer_authority_not_bwh");
    assert.equal(codeOf(() => store.createCoinHold({
      walletRef: "wallet_1",
      purpose: "product_purchase",
      purposeRef: "order_1",
      amountUnits: 5,
      acceptedCoinTypes: ["bonus_coins", "paid_coins", "reward_coins"],
      expiresAt: "2099-01-01T00:00:00.000Z",
      operation: {
        actorScope: "account:account_1",
        idempotencyKey: "hold_1",
        actorType: "user",
        actorRef: "account_1"
      }
    })), "writer_authority_not_bwh");
    // No second receipt was written: the frozen attempts changed nothing.
    assert.equal(
      database.prepare("select count(*) from platform_coin_operation_receipts").pluck().get(),
      1
    );
    // Reads are not fenced.
    assert.equal(store.getWalletByAccountId("account_1").version, 1);
  } finally {
    store.close();
    database.close();
  }
});

// --- U-F2 payment fixture (platform-payment-store.test.mjs) ---------------
function paymentDb() {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = on");
  database.exec(`
    create table platform_schema_migrations (
      migration_id text primary key,
      ddl_checksum text not null,
      applied_at text not null
    );
    create table platform_accounts (id text primary key);
    insert into platform_accounts (id) values ('account_1');
  `);
  applyPaymentStoreMigrations({ database, nowFn: () => NOW });
  return database;
}

function paymentCatalog() {
  return createPaymentRechargeOfferCatalog({
    environment: "sandbox",
    offers: [{
      offerRef: "coins_30",
      quoteVersion: 1,
      paidCoinUnits: 30,
      amountMinor: 100,
      currency: "USD",
      currencyExponent: 2,
      paymentMethods: ["paypal"],
      enabled: true
    }]
  });
}

function paymentStore(database) {
  return createSqlitePaymentStore({
    database,
    nowFn: () => NOW,
    refFactory: makeRefFactory()
  });
}

function paymentOrderInput(overrides = {}) {
  return {
    accountId: "account_1",
    offer: paymentCatalog().getOffer("coins_30"),
    idempotencyKey: "portal_create_1",
    adapterKey: "paypal_v1",
    paymentMethod: "paypal",
    merchantBindingRef: "paypal_sandbox_primary",
    ...overrides
  };
}

test("U-F2 payment createOrder succeeds while BWH_ACTIVE", () => {
  const database = paymentDb();
  const store = paymentStore(database);
  try {
    ensureWriterAuthority(database);
    const created = store.createOrder(paymentOrderInput());
    assert.equal(created.order.status, "created");
  } finally {
    store.close();
    database.close();
  }
});

test("U-F2 payment writes are refused in FROZEN and reads still work", () => {
  const database = paymentDb();
  const store = paymentStore(database);
  try {
    const created = store.createOrder(paymentOrderInput());
    freezeDb(database);
    assert.equal(
      codeOf(() => store.createOrder(paymentOrderInput({ idempotencyKey: "portal_create_2" }))),
      "writer_authority_not_bwh"
    );
    assert.equal(
      codeOf(() => store.recordOperationReceipt({
        orderRef: created.order.orderRef,
        attemptRef: "payment_attempt_1",
        providerRequestRef: "provider_create_1",
        receiptType: "create",
        operationResult: {
          providerOrderRef: "provider_order_1",
          status: "entry_ready",
          chargeCertainty: "possibly_charged",
          nextAction: {
            type: "redirect",
            url: "https://www.sandbox.paypal.com/checkoutnow?token=<redacted>",
            expiresAt: "2026-09-08T00:10:00.000Z"
          },
          occurredAt: NOW
        }
      })),
      "writer_authority_not_bwh"
    );
    assert.equal(
      database.prepare("select count(*) from platform_payment_orders").pluck().get(),
      1
    );
    assert.equal(
      store.getOrderForAccount({ accountId: "account_1", orderRef: created.order.orderRef }).status,
      "created"
    );
  } finally {
    store.close();
    database.close();
  }
});

// --- U-F3 ads consent ------------------------------------------------------
test("U-F3 consent recordConsent succeeds while BWH_ACTIVE", () => {
  const db = new Database(":memory:");
  try {
    const store = createSqliteAdsConsentStore({ database: db, env: ENABLED, nowFn: () => Date.parse(NOW) });
    ensureWriterAuthority(db);
    const granted = store.recordConsent({ accountRef: "acct_1", adUserData: true });
    assert.equal(granted.decision, "granted");
    store.close();
  } finally {
    db.close();
  }
});

test("U-F3 consent recordConsent is refused in FROZEN and reads still work", () => {
  const db = new Database(":memory:");
  try {
    const store = createSqliteAdsConsentStore({ database: db, env: ENABLED, nowFn: () => Date.parse(NOW) });
    store.recordConsent({ accountRef: "acct_1", adUserData: true });
    freezeDb(db);
    assert.equal(
      codeOf(() => store.recordConsent({ accountRef: "acct_2", adUserData: true })),
      "writer_authority_not_bwh"
    );
    assert.equal(
      db.prepare("select count(*) from platform_ads_consent_decisions").pluck().get(),
      1
    );
    assert.equal(store.getConsent({ accountRef: "acct_1" }).decision, "granted");
    store.close();
  } finally {
    db.close();
  }
});

// --- U-F4 referral fixture (platform-portal-referral.test.mjs) ------------
const REFERRAL_POLICY = {
  policyRef: "test_policy",
  version: 1,
  effectiveAt: NOW,
  rateBps: 1250,
  rounding: "floor",
  attributionDays: 7,
  confirmationDays: 2
};

function referralDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys=ON");
  db.exec(`create table platform_accounts(id text primary key,owner_ref text not null,status text not null,
    created_at text not null,updated_at text not null,metadata_json text not null default '{}')`);
  for (const id of ["promoter", "customer"]) {
    db.prepare("insert into platform_accounts values(?,?,'active',?,?,'{}')")
      .run(id, `owner_${id}`, NOW, NOW);
  }
  applyCoinWalletMigrations({
    database: db,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(NOW)
  });
  // The referral migration requires the payment store schema as well.
  applyPaymentStoreMigrations({ database: db, nowFn: () => NOW });
  applyPortalReferralMigration(db, {
    expectedMigrationId: REFERRAL_MIGRATION_ID,
    expectedDdlChecksum: REFERRAL_DDL_CHECKSUM
  });
  return db;
}

function referralService(db) {
  const service = createPortalReferralService({
    database: db,
    nowFn: () => new Date(NOW),
    attributionDays: 7,
    rewardsEnabled: true
  });
  service.publishPolicy(REFERRAL_POLICY);
  return service;
}

test("U-F4 referral createLink succeeds while BWH_ACTIVE", () => {
  const db = referralDb();
  const service = referralService(db);
  try {
    ensureWriterAuthority(db);
    const link = service.createLink("promoter");
    assert.equal(typeof link.linkPath, "string");
    assert.equal(service.profile("promoter").attributionDays, 7);
  } finally {
    service.close();
    db.close();
  }
});

test("U-F4 referral writes are refused in FROZEN and the tick stop-table entry works", async () => {
  const db = referralDb();
  const service = referralService(db);
  try {
    service.createLink("promoter");
    freezeDb(db);
    assert.equal(codeOf(() => service.createLink("customer")), "writer_authority_not_bwh");
    assert.equal(codeOf(() => service.publishPolicy({ ...REFERRAL_POLICY, version: 2 })), "writer_authority_not_bwh");
    assert.equal(
      db.prepare("select count(*) from platform_referral_profiles").pluck().get(),
      1
    );
    // Reads are not fenced.
    assert.equal(service.profile("promoter").attributionDays, 7);
    // W-115 stop-table execution entry point (code only; live execution
    // needs separate authorization). Canonical async stopTick (#914):
    // {timerClearedAt, lastTickEndedAt, tickInFlight: false}.
    service.start();
    assert.equal(service.tickState().running, true);
    const stopped = await service.stopTick();
    assert.equal(stopped.tickInFlight, false);
    assert.equal(typeof stopped.timerClearedAt, "string");
    assert.equal(typeof stopped.lastTickEndedAt, "string");
    assert.ok(!Number.isNaN(Date.parse(stopped.timerClearedAt)));
    assert.ok(!Number.isNaN(Date.parse(stopped.lastTickEndedAt)));
    assert.deepEqual(service.tickState(), {
      jobId: "W-115",
      running: false,
      stopped: true,
      rewardsEnabled: true
    });
    assert.deepEqual(await service.stopTick(), stopped);
    service.start();
    assert.equal(service.tickState().running, true);
    await service.stopTick();
  } finally {
    service.close();
    db.close();
  }
});

// --- U-F5 deferred-transition fixture --------------------------------------
// (platform-deferred-resource-transition-store.test.mjs createFoundation)
function deferredDb() {
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
  return database;
}

test("U-F5 deferred claimNextDueTransition works while BWH_ACTIVE and is refused in FROZEN", () => {
  const database = deferredDb();
  const store = createSqliteDeferredResourceTransitionStore({ database });
  try {
    ensureWriterAuthority(database);
    // No transitions exist, so the claim finds nothing — but it runs the
    // fenced claim transaction (lease expiry sweep included).
    assert.equal(store.claimNextDueTransition({ leaseMs: 60000 }), null);
    freezeDb(database);
    assert.equal(
      codeOf(() => store.claimNextDueTransition({ leaseMs: 60000 })),
      "writer_authority_not_bwh"
    );
    assert.equal(
      codeOf(() => store.claimNextPendingRebase({ leaseMs: 60000 })),
      "writer_authority_not_bwh"
    );
  } finally {
    store.close();
    database.close();
  }
});

// --- U-F6 admin user-commerce (referral fixture + admin service) -----------
test("U-F6 admin updateRate succeeds while BWH_ACTIVE", () => {
  const db = referralDb();
  referralService(db);
  const admin = createAdminUserCommerceService({
    database: db,
    nowFn: () => new Date(NOW)
  });
  try {
    ensureWriterAuthority(db);
    const result = admin.updateRate({ ratePercent: 15, effectiveAt: "2026-09-10" });
    assert.equal(result.ratePercent, 15);
  } finally {
    db.close();
  }
});

test("U-F6 admin writes are refused in FROZEN and reads still work", () => {
  const db = referralDb();
  referralService(db);
  const admin = createAdminUserCommerceService({
    database: db,
    nowFn: () => new Date(NOW)
  });
  try {
    freezeDb(db);
    assert.equal(
      codeOf(() => admin.updateRate({ ratePercent: 15, effectiveAt: "2026-09-10" })),
      "writer_authority_not_bwh"
    );
    assert.equal(
      codeOf(() => admin.clawback({ accountId: "customer", coins: "1", reason: "test" })),
      "writer_authority_not_bwh"
    );
    // No new policy version was published.
    assert.equal(
      db.prepare("select count(*) from platform_referral_policies").pluck().get(),
      1
    );
    // Reads are not fenced.
    assert.equal(admin.readSettlement().ratePercent, 12.5);
  } finally {
    db.close();
  }
});

// --- U-F7 lead purge (platform-lead-retention-operations.test.mjs) ---------
function purgeFixture(dbPath) {
  const database = new Database(dbPath);
  database.exec(`
    create table platform_leads (
      id text primary key,
      status text not null check (status in ('new', 'reviewing', 'converted', 'rejected')),
      organization text not null,
      email text not null,
      direction text not null,
      stage text not null default '',
      message text not null,
      source text not null,
      created_at text not null,
      updated_at text not null,
      expires_at text not null
    );
    create table retention_sentinel (
      id text primary key,
      value text not null
    );
    insert into retention_sentinel (id, value) values ('sentinel_1', 'preserve-me');
  `);
  const insert = database.prepare(`
    insert into platform_leads (
      id, status, organization, email, direction, stage, message, source,
      created_at, updated_at, expires_at
    ) values (
      @id, 'new', 'Synthetic Research', @email, 'API Sandbox', 'review',
      @message, 'company-site', @createdAt, @createdAt, @expiresAt
    )
  `);
  insert.run({
    id: "lead_expired_1",
    email: "expired@example.test",
    message: "expired lead",
    createdAt: "2026-07-01T00:00:00.000Z",
    expiresAt: "2026-07-10T00:00:00.000Z"
  });
  insert.run({
    id: "lead_live_1",
    email: "live@example.test",
    message: "live lead",
    createdAt: "2026-07-01T00:00:00.000Z",
    expiresAt: "2026-12-31T00:00:00.000Z"
  });
  database.close();
}

function leadCount(dbPath) {
  const database = new Database(dbPath, { readonly: true });
  try {
    return database.prepare("select count(*) as count from platform_leads").get().count;
  } finally {
    database.close();
  }
}

test("U-F7 lead purge apply purges the expired row while BWH_ACTIVE", () => {
  withTempDir("d1-uf7-purge-active-", (directory) => {
    const dbPath = join(directory, "private-control.sqlite");
    purgeFixture(dbPath);
    const result = runLeadPurge({
      dbPath,
      apply: true,
      nowFn: () => new Date("2026-07-20T00:00:00.000Z")
    });
    assert.equal(result.status, "completed");
    assert.equal(result.counts.deletedLeadCount, 1);
    assert.equal(leadCount(dbPath), 1);
  });
});

test("U-F7 lead purge apply is blocked in FROZEN and dry-run still plans", () => {
  withTempDir("d1-uf7-purge-frozen-", (directory) => {
    const dbPath = join(directory, "private-control.sqlite");
    purgeFixture(dbPath);
    const setup = new Database(dbPath);
    freezeDb(setup);
    setup.close();
    const blocked = runLeadPurge({
      dbPath,
      apply: true,
      nowFn: () => new Date("2026-07-20T00:00:00.000Z")
    });
    assert.equal(blocked.status, "blocked");
    assert.deepEqual(blocked.reasonCodes, ["writer_authority_not_bwh"]);
    assert.equal(blocked.mutationState, "none");
    assert.equal(leadCount(dbPath), 2);
    // Dry-run opens the database readonly and never reaches the fence.
    const planned = runLeadPurge({
      dbPath,
      apply: false,
      nowFn: () => new Date("2026-07-20T00:00:00.000Z")
    });
    assert.equal(planned.status, "planned");
    assert.equal(planned.counts.eligibleLeadCount, 1);
    assert.equal(leadCount(dbPath), 2);
  });
});
