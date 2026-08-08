import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import {
  createAccountResourceAuthorityStore
} from "../services/platform/account-resource-authority.mjs";
import {
  ACCOUNT_RESOURCE_AUTHORITY_MIGRATIONS,
  REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID,
  applyAccountResourceAuthorityMigrations
} from "../services/platform/account-resource-authority-migrations.mjs";
import {
  ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATIONS,
  REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID,
  applyAccountResourceAuthorityCommerceMigrations
} from "../services/platform/account-resource-authority-commerce-migrations.mjs";
import {
  COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID,
  applyCoinCommerceMigrations
} from "../services/platform/coin-commerce-migrations.mjs";
import {
  createCoinCommerceCoordinator
} from "../services/platform/coin-commerce-coordinator.mjs";
import {
  createCoinCommerceProductionSubscriptionFulfillment
} from "../services/platform/coin-commerce-production-subscription-fulfillment.mjs";
import {
  createSqliteCoinCommerceStore
} from "../services/platform/coin-commerce-store.mjs";
import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  applyCoinWalletMigrations
} from "../services/platform/coin-wallet-migrations.mjs";
import {
  createSqliteSubscriptionControlStore
} from "../services/platform/subscription-control-db.mjs";

const NOW = "2026-08-08T12:00:00.000Z";
const VALID_UNTIL = "2026-09-08T12:00:00.000Z";
const OFFER = Object.freeze({
  offerRef: "offer_authority_plan",
  offerVersionRef: "offerv_authority_plan_v1",
  version: 1,
  category: "plan",
  title: { zh: "Authority 套餐", en: "Authority plan" },
  summary: { zh: "合成测试", en: "Synthetic test" },
  importantNotices: { zh: ["合成测试"], en: ["Synthetic test"] },
  baseCoinUnits: 10,
  referencePrice: { currency: "CNY", amountMinor: 1_000 },
  acceptedCoinTypes: ["paid_coins"],
  delivery: {
    kind: "subscription_plan",
    durationDays: 30,
    monthlyTrafficGb: 50,
    trafficGb: null,
    neverExpires: false,
    discountBasisPoints: 0
  }
});

function fixedClockDatabase(database) {
  return new Proxy(database, {
    get(target, property) {
      if (property === "inTransaction") return target.inTransaction;
      if (property === "prepare") {
        return (sql) => {
          if (/select\s+strftime\('%Y-%m-%dT%H:%M:%fZ',\s*'now'\)/i.test(sql)) {
            return { pluck: () => ({ get: () => NOW }) };
          }
          return target.prepare(sql);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}

function observedPrepareDatabase(database, preparedSql) {
  return new Proxy(database, {
    get(target, property) {
      if (property === "inTransaction") return target.inTransaction;
      if (property === "prepare") {
        return (sql) => {
          preparedSql.push(sql);
          return target.prepare(sql);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}

function refs() {
  const counts = new Map();
  return (kind) => {
    const next = (counts.get(kind) ?? 0) + 1;
    counts.set(kind, next);
    return `${kind}_${next}`;
  };
}

function safeBindingRef(prefix, value) {
  return `${prefix}ref_${createHash("sha256")
    .update(value)
    .digest("hex")
    .slice(0, 16)}`;
}

function createFoundation({
  authority = true,
  commerceBinding = true,
  dbPath = ":memory:"
} = {}) {
  const database = new Database(dbPath);
  database.pragma("foreign_keys = ON");
  const controlStore = createSqliteSubscriptionControlStore({ database });
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
  if (authority) {
    applyAccountResourceAuthorityMigrations({
      database,
      expectedMigrationId: REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID,
      expectedDdlChecksum: ACCOUNT_RESOURCE_AUTHORITY_MIGRATIONS[0].ddlChecksum,
      nowFn: () => new Date(NOW)
    });
  }
  if (commerceBinding) {
    applyAccountResourceAuthorityCommerceMigrations({
      database,
      expectedMigrationId:
        REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID,
      expectedDdlChecksum:
        ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATIONS[0].ddlChecksum,
      nowFn: () => new Date(NOW)
    });
  }
  return { database, controlStore };
}

function seedAccount(controlStore, accountId = "acct_authority_1") {
  controlStore.createAccount({
    id: accountId,
    ownerRef: `owner_${accountId}`,
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
    metadata: {}
  });
  return accountId;
}

function seedResource(controlStore, { accountId, suffix, plan = OFFER.offerVersionRef }) {
  const entitlementId = `entitlement_${suffix}`;
  const resourceRequestId = `request_${suffix}`;
  const issuedLinkId = `link_${suffix}`;
  const tenantId = `tenant_${suffix}`;
  const artifactId = `artifact_${suffix}`;
  controlStore.createEntitlement({
    id: entitlementId,
    accountId,
    plan,
    status: "active",
    validFrom: NOW,
    validUntil: VALID_UNTIL,
    maxArtifacts: 1,
    maxDevices: 1,
    trafficLimitBytes: 50 * 1024 ** 3,
    createdAt: NOW,
    updatedAt: NOW
  });
  controlStore.createIssuanceRequest({
    id: resourceRequestId,
    accountId,
    entitlementId,
    approvalRef: `approval_${suffix}`,
    status: "issued",
    quantity: 1,
    nodeId: `node_${suffix}`,
    purpose: "commerce",
    requestedByRef: `operator_${suffix}`,
    createdAt: NOW,
    updatedAt: NOW,
    metadata: {}
  });
  controlStore.linkIssuedSubscription({
    id: issuedLinkId,
    requestId: resourceRequestId,
    tenantRef: safeBindingRef("tenant", tenantId),
    artifactRef: safeBindingRef("artifact", artifactId),
    status: "active",
    createdAt: NOW,
    updatedAt: NOW
  });
  controlStore.upsertPortalAccessRequest({
    id: resourceRequestId,
    portalUserRef: accountId,
    plan: "monthly",
    clientTarget: "clash",
    durationDays: 30,
    quantity: 1,
    status: "delivered",
    nextAction: "none",
    noteProvided: false,
    priorTrialState: "none",
    submittedAt: NOW,
    updatedAt: NOW,
    expiresAt: VALID_UNTIL,
    validUntil: VALID_UNTIL,
    entitlementRef: entitlementId,
    accessGrantRef: `grant_${suffix}`,
    tenantId,
    artifactId,
    edgeLifecycleMutation: false,
    event: {}
  });
  return {
    accountId,
    resourceRequestId,
    entitlementId,
    issuedLinkId,
    tenantId,
    artifactId
  };
}

function assign(database, target, authorityRef, expectedVersion = 0) {
  const authorityStore = createAccountResourceAuthorityStore({
    database,
    nowFn: () => new Date(NOW),
    idFactory: () => authorityRef
  });
  return authorityStore.assignAuthority({
    ...target,
    expectedVersion,
    createdBy: "operator:test",
    reason: "commerce_test_assignment"
  });
}

function createCommerceStore(database, { authorityEnabled, ...options }) {
  return createSqliteCoinCommerceStore({
    database: fixedClockDatabase(database),
    authorityEnabled,
    cancelWindowMs: 0,
    commerceRefFactory: refs(),
    walletRefFactory: refs(),
    ...options
  });
}

function seedWalletAndOffer(store, accountId) {
  store.walletStore.creditCoins({
    accountId,
    coinType: "paid_coins",
    amountUnits: 100,
    availability: "available",
    sourceType: "synthetic_seed",
    sourceRef: `source_authority_paid_${accountId}`,
    sourceDigest: "a".repeat(64),
    policyRef: null,
    policyVersion: null,
    expiresAt: null,
    operation: {
      actorScope: `system:authority-test:${accountId}`,
      idempotencyKey: "credit_authority_paid",
      actorType: "system",
      actorRef: "authority_test"
    }
  });
  store.publishOfferVersion(OFFER);
}

function quote(store, accountId = "acct_authority_1") {
  return store.createCheckoutQuote({ accountId, offerRef: OFFER.offerRef });
}

function confirm(
  store,
  quoteValue,
  key = "confirm_authority",
  accountId = "acct_authority_1"
) {
  return store.confirmOrder({
    accountId,
    quoteRef: quoteValue.quoteRef,
    operation: {
      actorScope: `portal:${accountId}`,
      idempotencyKey: key,
      actorType: "portal_user",
      actorRef: accountId
    }
  });
}

function walletFinancialSnapshot(database) {
  return Object.fromEntries([
    "platform_coin_wallets",
    "platform_coin_lots",
    "platform_coin_holds",
    "platform_coin_hold_allocations",
    "platform_coin_operation_receipts",
    "platform_coin_ledger_entries"
  ].map((table) => [
    table,
    database.prepare(`select * from ${table} order by rowid`).all()
  ]));
}

function resourceSnapshot(database, resource) {
  return {
    entitlement: database.prepare(
      "select * from platform_entitlements where id = ?"
    ).get(resource.entitlementId),
    request: database.prepare(
      "select * from platform_issuance_requests where id = ?"
    ).get(resource.resourceRequestId),
    link: database.prepare(
      "select * from platform_issued_subscription_links where id = ?"
    ).get(resource.issuedLinkId),
    portal: database.prepare(
      "select * from platform_portal_access_requests where id = ?"
    ).get(resource.resourceRequestId)
  };
}

test("authority flag off preserves legacy Quote behavior without authority schema", () => {
  const state = createFoundation({ authority: false, commerceBinding: false });
  try {
    const accountId = seedAccount(state.controlStore);
    const store = createCommerceStore(state.database, { authorityEnabled: false });
    try {
      seedWalletAndOffer(store, accountId);
      assert.equal(quote(store, accountId).purchaseAvailability, "available");
    } finally {
      store.close();
    }
  } finally {
    state.database.close();
  }
});

test("authority flag on binds an exact Authority identity, version, and resource triad", () => {
  const state = createFoundation();
  try {
    const accountId = seedAccount(state.controlStore);
    const resourceA = seedResource(state.controlStore, { accountId, suffix: "a" });
    const resourceB = seedResource(state.controlStore, { accountId, suffix: "b" });
    const authority = assign(state.database, resourceA, "authority_a");
    const beforeB = resourceSnapshot(state.database, resourceB);
    const store = createCommerceStore(state.database, { authorityEnabled: true });
    try {
      seedWalletAndOffer(store, accountId);
      const created = quote(store, accountId);
      assert.deepEqual(state.database.prepare(`
        select authority_ref as authorityRef,
               authority_version as authorityVersion,
               resource_request_id as resourceRequestId,
               entitlement_id as entitlementId,
               issued_link_id as issuedLinkId
          from platform_commerce_authority_quote_bindings
         where quote_ref = ?
      `).get(created.quoteRef), {
        authorityRef: authority.authorityRef,
        authorityVersion: authority.authorityVersion,
        resourceRequestId: resourceA.resourceRequestId,
        entitlementId: resourceA.entitlementId,
        issuedLinkId: resourceA.issuedLinkId
      });
      assert.deepEqual(resourceSnapshot(state.database, resourceB), beforeB);
    } finally {
      store.close();
    }
  } finally {
    state.database.close();
  }
});

test("a TEMP sidecar cannot shadow the durable main Authority binding", () => {
  const state = createFoundation();
  let store;
  try {
    const accountId = seedAccount(state.controlStore, "acct_temp_shadow");
    const resourceA = seedResource(state.controlStore, {
      accountId,
      suffix: "temp_shadow"
    });
    const authority = assign(
      state.database,
      resourceA,
      "authority_temp_shadow"
    );
    store = createCommerceStore(state.database, { authorityEnabled: true });
    state.database.exec(`
      create temp table platform_commerce_authority_quote_bindings as
      select *
        from main.platform_commerce_authority_quote_bindings
       where 0
    `);
    seedWalletAndOffer(store, accountId);
    const created = quote(store, accountId);
    assert.equal(state.database.prepare(`
      select count(*)
        from main.platform_commerce_authority_quote_bindings
       where quote_ref = ?
    `).pluck().get(created.quoteRef), 1);
    assert.equal(state.database.prepare(`
      select count(*)
        from temp.platform_commerce_authority_quote_bindings
    `).pluck().get(), 0);
    state.database.prepare(`
      insert into temp.platform_commerce_authority_quote_bindings (
        quote_ref, authority_ref, account_id, authority_version,
        resource_request_id, entitlement_id, issued_link_id, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      created.quoteRef,
      authority.authorityRef,
      accountId,
      authority.authorityVersion + 1,
      resourceA.resourceRequestId,
      resourceA.entitlementId,
      resourceA.issuedLinkId,
      NOW
    );

    const order = confirm(
      store,
      created,
      "confirm_temp_shadow",
      accountId
    );
    store.claimDueCaptures({ limit: 1 });
    store.captureClaimedOrder({ orderRef: order.orderRef });
    assert.equal(
      store.listOrders({ accountId, limit: 100 }).orders[0].orderRef,
      order.orderRef
    );
  } finally {
    store?.close();
    state.database.close();
  }
});

test("missing or drifted Authority creates no Quote", () => {
  for (const drift of [false, true]) {
    const state = createFoundation();
    try {
      const accountId = seedAccount(state.controlStore);
      const resourceA = seedResource(state.controlStore, { accountId, suffix: "a" });
      if (drift) {
        assign(state.database, resourceA, "authority_a");
        state.database.prepare(`
          update platform_portal_access_requests
             set artifact_id = 'artifact_wrong'
           where id = ?
        `).run(resourceA.resourceRequestId);
      }
      const store = createCommerceStore(state.database, { authorityEnabled: true });
      try {
        seedWalletAndOffer(store, accountId);
        assert.throws(() => quote(store, accountId), { code: "offer_unavailable" });
        assert.equal(state.database.prepare(
          "select count(*) from platform_coin_commerce_quotes"
        ).pluck().get(), 0);
      } finally {
        store.close();
      }
    } finally {
      state.database.close();
    }
  }
});

test("Authority mode never bootstraps a first resource during Quote", () => {
  const state = createFoundation();
  try {
    const accountId = seedAccount(state.controlStore, "acct_no_authority");
    const store = createCommerceStore(state.database, { authorityEnabled: true });
    try {
      seedWalletAndOffer(store, accountId);
      const beforeWallet = walletFinancialSnapshot(state.database);
      assert.throws(() => quote(store, accountId), {
        code: "offer_unavailable"
      });
      assert.deepEqual(walletFinancialSnapshot(state.database), beforeWallet);
      assert.equal(state.database.prepare(
        "select count(*) from platform_coin_commerce_quotes"
      ).pluck().get(), 0);
      for (const table of [
        "platform_entitlements",
        "platform_issuance_requests",
        "platform_issued_subscription_links",
        "platform_portal_access_requests",
        "platform_account_resource_authorities"
      ]) {
        assert.equal(state.database.prepare(
          `select count(*) from ${table}`
        ).pluck().get(), 0);
      }
    } finally {
      store.close();
    }
  } finally {
    state.database.close();
  }
});

test("Authority version change after Quote rejects Confirm before any Coin write", () => {
  const state = createFoundation();
  try {
    const accountId = seedAccount(state.controlStore);
    const resourceA = seedResource(state.controlStore, { accountId, suffix: "a" });
    const resourceB = seedResource(state.controlStore, { accountId, suffix: "b" });
    assign(state.database, resourceA, "authority_a");
    const store = createCommerceStore(state.database, { authorityEnabled: true });
    try {
      seedWalletAndOffer(store, accountId);
      const created = quote(store, accountId);
      const beforeWallet = walletFinancialSnapshot(state.database);
      const authorityStore = createAccountResourceAuthorityStore({
        database: state.database,
        nowFn: () => new Date(NOW),
        idFactory: () => "authority_b"
      });
      authorityStore.reassignAuthority({
        ...resourceB,
        expectedVersion: 1,
        createdBy: "operator:test",
        reason: "commerce_test_reassignment",
        revokedBy: "operator:test",
        revocationReason: "commerce_test_reassignment"
      });
      assert.throws(() => confirm(store, created), { code: "quote_stale" });
      assert.deepEqual(walletFinancialSnapshot(state.database), beforeWallet);
      assert.equal(state.database.prepare(
        "select count(*) from platform_coin_commerce_orders"
      ).pluck().get(), 0);
    } finally {
      store.close();
    }
  } finally {
    state.database.close();
  }
});

test("an Authority reassignment attempt inside Confirm is serialized and fails closed", () => {
  const directory = mkdtempSync(join(tmpdir(), "commerce-authority-race-"));
  const dbPath = join(directory, "control.sqlite");
  const state = createFoundation({ dbPath });
  let contender;
  try {
    const accountId = seedAccount(state.controlStore);
    const resourceA = seedResource(state.controlStore, { accountId, suffix: "a" });
    const resourceB = seedResource(state.controlStore, { accountId, suffix: "b" });
    assign(state.database, resourceA, "authority_a");
    contender = new Database(dbPath, { fileMustExist: true });
    contender.pragma("foreign_keys = ON");
    contender.pragma("busy_timeout = 25");
    const contenderAuthority = createAccountResourceAuthorityStore({
      database: contender,
      nowFn: () => new Date(NOW),
      idFactory: () => "authority_b"
    });
    let raceEnabled = false;
    let contenderCode = null;
    const store = createCommerceStore(state.database, {
      authorityEnabled: true,
      purchaseEligibilityReader() {
        if (!raceEnabled) return true;
        try {
          contenderAuthority.reassignAuthority({
            ...resourceB,
            expectedVersion: 1,
            createdBy: "operator:test",
            reason: "concurrent_reassignment",
            revokedBy: "operator:test",
            revocationReason: "concurrent_reassignment"
          });
        } catch (error) {
          contenderCode = error?.code;
          throw error;
        }
        return true;
      }
    });
    try {
      seedWalletAndOffer(store, accountId);
      const created = quote(store, accountId);
      const beforeWallet = walletFinancialSnapshot(state.database);
      const beforeB = resourceSnapshot(state.database, resourceB);
      raceEnabled = true;
      assert.throws(() => confirm(store, created), { code: "offer_unavailable" });
      assert.equal(contenderCode, "account_resource_authority_unavailable");
      assert.deepEqual(walletFinancialSnapshot(state.database), beforeWallet);
      assert.deepEqual(resourceSnapshot(state.database, resourceB), beforeB);
      assert.equal(state.database.prepare(`
        select authority_ref from platform_account_resource_authorities
         where account_id = ? and status = 'active'
      `).pluck().get(accountId), "authority_a");
      assert.equal(state.database.prepare(
        "select count(*) from platform_coin_commerce_orders"
      ).pluck().get(), 0);
    } finally {
      store.close();
    }
  } finally {
    contender?.close();
    state.database.close();
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  }
});

test("same-connection Authority changes during Confirm roll back every durable write", async (t) => {
  for (const mutationPoint of ["purchase_eligibility", "order_event_ref"]) {
    await t.test(mutationPoint, () => {
      const state = createFoundation();
      let store;
      try {
        const accountId = seedAccount(state.controlStore);
        const resourceA = seedResource(state.controlStore, {
          accountId,
          suffix: `confirm_${mutationPoint}_a`
        });
        const resourceB = seedResource(state.controlStore, {
          accountId,
          suffix: `confirm_${mutationPoint}_b`
        });
        assign(state.database, resourceA, "authority_confirm_a");
        const authorityStore = createAccountResourceAuthorityStore({
          database: state.database,
          nowFn: () => new Date(NOW),
          idFactory: () => "authority_confirm_b"
        });
        const nextCommerceRef = refs();
        let raceEnabled = false;
        let reassignmentAttempted = false;
        const reassign = () => {
          if (!raceEnabled || reassignmentAttempted) return;
          reassignmentAttempted = true;
          authorityStore.reassignAuthority({
            ...resourceB,
            expectedVersion: 1,
            createdBy: "operator:test",
            reason: "same_connection_confirm_race",
            revokedBy: "operator:test",
            revocationReason: "same_connection_confirm_race"
          });
        };
        store = createCommerceStore(state.database, {
          authorityEnabled: true,
          purchaseEligibilityReader() {
            if (mutationPoint === "purchase_eligibility") reassign();
            return true;
          },
          commerceRefFactory(kind) {
            if (mutationPoint === "order_event_ref" && kind === "order_event") {
              reassign();
            }
            return nextCommerceRef(kind);
          }
        });
        seedWalletAndOffer(store, accountId);
        const created = quote(store, accountId);
        const beforeWallet = walletFinancialSnapshot(state.database);
        raceEnabled = true;

        assert.throws(() => confirm(store, created), { code: "quote_stale" });
        assert.equal(reassignmentAttempted, true);
        assert.deepEqual(walletFinancialSnapshot(state.database), beforeWallet);
        assert.equal(state.database.prepare(
          "select count(*) from platform_coin_commerce_orders"
        ).pluck().get(), 0);
        assert.deepEqual(state.database.prepare(`
          select authority_ref as authorityRef, version
            from platform_account_resource_authorities
           where account_id = ? and status = 'active'
        `).get(accountId), {
          authorityRef: "authority_confirm_a",
          version: 1
        });
      } finally {
        store?.close();
        state.database.close();
      }
    });
  }
});

test("same-connection Authority change during capture rolls back Coin consumption and outbox", () => {
  const state = createFoundation();
  let store;
  try {
    const accountId = seedAccount(state.controlStore);
    const resourceA = seedResource(state.controlStore, {
      accountId,
      suffix: "capture_race_a"
    });
    const resourceB = seedResource(state.controlStore, {
      accountId,
      suffix: "capture_race_b"
    });
    assign(state.database, resourceA, "authority_capture_a");
    const authorityStore = createAccountResourceAuthorityStore({
      database: state.database,
      nowFn: () => new Date(NOW),
      idFactory: () => "authority_capture_b"
    });
    const nextWalletRef = refs();
    let raceEnabled = false;
    let reassignmentAttempted = false;
    store = createCommerceStore(state.database, {
      authorityEnabled: true,
      walletRefFactory(kind) {
        if (raceEnabled && !reassignmentAttempted && kind === "ledger_entry") {
          reassignmentAttempted = true;
          authorityStore.reassignAuthority({
            ...resourceB,
            expectedVersion: 1,
            createdBy: "operator:test",
            reason: "same_connection_capture_race",
            revokedBy: "operator:test",
            revocationReason: "same_connection_capture_race"
          });
        }
        return nextWalletRef(kind);
      }
    });
    seedWalletAndOffer(store, accountId);
    const created = quote(store, accountId);
    const order = confirm(store, created);
    store.claimDueCaptures({ limit: 1 });
    const beforeWallet = walletFinancialSnapshot(state.database);
    raceEnabled = true;

    assert.throws(
      () => store.captureClaimedOrder({ orderRef: order.orderRef }),
      { code: "capture_in_progress" }
    );
    assert.equal(reassignmentAttempted, true);
    assert.deepEqual(walletFinancialSnapshot(state.database), beforeWallet);
    assert.equal(state.database.prepare(
      "select count(*) from platform_coin_commerce_fulfillment_commands"
    ).pluck().get(), 0);
    assert.equal(state.database.prepare(`
      select payment_status from platform_coin_commerce_orders
       where order_ref = ?
    `).pluck().get(order.orderRef), "capture_pending");
    assert.deepEqual(state.database.prepare(`
      select authority_ref as authorityRef, version
        from platform_account_resource_authorities
       where account_id = ? and status = 'active'
    `).get(accountId), {
      authorityRef: "authority_capture_a",
      version: 1
    });
  } finally {
    store?.close();
    state.database.close();
  }
});

test("Authority-bound Confirm and capture retries do not duplicate Coin, Order, or outbox writes", () => {
  const state = createFoundation();
  try {
    const accountId = seedAccount(state.controlStore);
    const resourceA = seedResource(state.controlStore, { accountId, suffix: "a" });
    assign(state.database, resourceA, "authority_a");
    const store = createCommerceStore(state.database, { authorityEnabled: true });
    try {
      seedWalletAndOffer(store, accountId);
      const created = quote(store, accountId);
      const first = confirm(store, created);
      const replay = confirm(store, created);
      assert.deepEqual(replay, first);
      store.claimDueCaptures({ limit: 1 });
      store.captureClaimedOrder({ orderRef: first.orderRef });
      store.captureClaimedOrder({ orderRef: first.orderRef });
      assert.equal(state.database.prepare(
        "select count(*) from platform_coin_commerce_orders"
      ).pluck().get(), 1);
      assert.equal(state.database.prepare(
        "select count(*) from platform_coin_holds"
      ).pluck().get(), 1);
      assert.equal(state.database.prepare(`
        select count(*) from platform_coin_ledger_entries
         where operation = 'held_to_consumed'
      `).pluck().get(), 1);
      assert.equal(state.database.prepare(
        "select count(*) from platform_coin_commerce_fulfillment_commands"
      ).pluck().get(), 1);
      const command = store.claimNextFulfillmentCommand({ leaseMs: 30_000 });
      assert.deepEqual(command.authority, {
        authorityRef: "authority_a",
        authorityVersion: 1,
        resourceRequestId: resourceA.resourceRequestId,
        entitlementId: resourceA.entitlementId,
        issuedLinkId: resourceA.issuedLinkId
      });
    } finally {
      store.close();
    }
  } finally {
    state.database.close();
  }
});

test("Authority command payload cannot drop its immutable Quote binding", () => {
  const state = createFoundation();
  let store;
  try {
    const accountId = seedAccount(state.controlStore);
    const resourceA = seedResource(state.controlStore, {
      accountId,
      suffix: "payload_downgrade"
    });
    assign(state.database, resourceA, "authority_payload_downgrade");
    store = createCommerceStore(state.database, { authorityEnabled: true });
    seedWalletAndOffer(store, accountId);
    const created = quote(store, accountId);
    const order = confirm(
      store,
      created,
      "confirm_authority_payload_downgrade",
      accountId
    );
    store.claimDueCaptures({ limit: 1 });
    store.captureClaimedOrder({ orderRef: order.orderRef });
    store.close();
    store = null;

    state.database.prepare(`
      update platform_coin_commerce_fulfillment_commands
         set payload_json = json_remove(payload_json, '$.authority')
       where order_ref = ?
    `).run(order.orderRef);

    assert.throws(
      () => createCommerceStore(state.database, { authorityEnabled: true }),
      { code: "commerce_infrastructure_error" }
    );
  } finally {
    store?.close();
    state.database.close();
  }
});

test("Authority command completion rejects a payload downgrade atomically", () => {
  const state = createFoundation();
  let store;
  try {
    const accountId = seedAccount(state.controlStore);
    const resourceA = seedResource(state.controlStore, {
      accountId,
      suffix: "completion_downgrade"
    });
    assign(state.database, resourceA, "authority_completion_downgrade");
    store = createCommerceStore(state.database, { authorityEnabled: true });
    seedWalletAndOffer(store, accountId);
    const created = quote(store, accountId);
    const order = confirm(
      store,
      created,
      "confirm_authority_completion_downgrade",
      accountId
    );
    store.claimDueCaptures({ limit: 1 });
    store.captureClaimedOrder({ orderRef: order.orderRef });
    const command = store.claimNextFulfillmentCommand({ leaseMs: 30_000 });

    state.database.prepare(`
      update platform_coin_commerce_fulfillment_commands
         set payload_json = json_remove(payload_json, '$.authority')
       where command_ref = ?
    `).run(command.commandRef);

    assert.throws(() => store.completeFulfillmentCommand({
      commandRef: command.commandRef,
      leaseGeneration: command.leaseGeneration,
      leaseToken: command.leaseToken,
      effectRef: "effect_authority_completion_downgrade",
      status: "delivered"
    }), { code: "commerce_infrastructure_error" });
    assert.deepEqual(state.database.prepare(`
      select status, lease_generation as leaseGeneration,
             lease_token as leaseToken
        from platform_coin_commerce_fulfillment_commands
       where command_ref = ?
    `).get(command.commandRef), {
      status: "processing",
      leaseGeneration: command.leaseGeneration,
      leaseToken: command.leaseToken
    });
    assert.equal(state.database.prepare(`
      select count(*)
        from platform_coin_commerce_fulfillment_receipts
       where command_ref = ?
    `).pluck().get(command.commandRef), 0);
  } finally {
    store?.close();
    state.database.close();
  }
});

test("Authority-bound order listing stays bounded and rejects payload downgrade", () => {
  const state = createFoundation();
  const preparedSql = [];
  let store;
  try {
    const accountId = seedAccount(state.controlStore, "acct_authority_list");
    const resourceA = seedResource(state.controlStore, {
      accountId,
      suffix: "authority_list"
    });
    assign(state.database, resourceA, "authority_list");
    store = createCommerceStore(
      observedPrepareDatabase(state.database, preparedSql),
      { authorityEnabled: true }
    );
    seedWalletAndOffer(store, accountId);
    const orders = [];
    for (let index = 1; index <= 3; index += 1) {
      const created = quote(store, accountId);
      const order = confirm(
        store,
        created,
        `confirm_authority_list_${index}`,
        accountId
      );
      store.claimDueCaptures({ limit: 1 });
      store.captureClaimedOrder({ orderRef: order.orderRef });
      orders.push(order);
    }

    preparedSql.length = 0;
    assert.equal(store.listOrders({ accountId, limit: 100 }).orders.length, 3);
    assert.equal(preparedSql.length, 2);

    state.database.prepare(`
      update platform_coin_commerce_fulfillment_commands
         set payload_json = json_remove(payload_json, '$.authority')
       where order_ref = ?
    `).run(orders[1].orderRef);
    preparedSql.length = 0;
    assert.throws(
      () => store.listOrders({ accountId, limit: 100 }),
      { code: "commerce_infrastructure_error" }
    );
    assert.equal(preparedSql.length, 2);
  } finally {
    store?.close();
    state.database.close();
  }
});

test("enabling Authority isolates a legacy pending command without blocking new Authority work", () => {
  const state = createFoundation();
  const commerceRefFactory = refs();
  const walletRefFactory = refs();
  let store;
  try {
    const legacyAccountId = seedAccount(
      state.controlStore,
      "acct_transition_legacy"
    );
    store = createCommerceStore(state.database, {
      authorityEnabled: false,
      commerceRefFactory,
      walletRefFactory
    });
    seedWalletAndOffer(store, legacyAccountId);
    const legacyQuote = quote(store, legacyAccountId);
    const legacyOrder = confirm(
      store,
      legacyQuote,
      "confirm_transition_legacy",
      legacyAccountId
    );
    store.claimDueCaptures({ limit: 1 });
    store.captureClaimedOrder({ orderRef: legacyOrder.orderRef });
    store.close();

    store = createCommerceStore(state.database, {
      authorityEnabled: true,
      commerceRefFactory,
      walletRefFactory
    });
    const authorityAccountId = seedAccount(
      state.controlStore,
      "acct_transition_authority"
    );
    const resourceA = seedResource(state.controlStore, {
      accountId: authorityAccountId,
      suffix: "transition_authority"
    });
    assign(state.database, resourceA, "authority_transition");
    seedWalletAndOffer(store, authorityAccountId);
    const authorityQuote = quote(store, authorityAccountId);
    const authorityOrder = confirm(
      store,
      authorityQuote,
      "confirm_transition_authority",
      authorityAccountId
    );
    store.claimDueCaptures({ limit: 1 });
    store.captureClaimedOrder({ orderRef: authorityOrder.orderRef });

    assert.equal(store.claimNextFulfillmentCommand({ leaseMs: 30_000 }), null);
    assert.deepEqual(state.database.prepare(`
      select o.payment_status as paymentStatus,
             c.status as commandStatus
        from platform_coin_commerce_orders o
        join platform_coin_commerce_fulfillment_commands c
          on c.order_ref = o.order_ref
       where o.order_ref = ?
    `).get(legacyOrder.orderRef), {
      paymentStatus: "reconciliation_required",
      commandStatus: "failed"
    });
    const claimed = store.claimNextFulfillmentCommand({ leaseMs: 30_000 });
    assert.equal(claimed.orderRef, authorityOrder.orderRef);
    assert.equal(claimed.authority.authorityRef, "authority_transition");
  } finally {
    store?.close();
    state.database.close();
  }
});

test("disabling Authority isolates a pending Authority command without blocking legacy work", () => {
  const state = createFoundation();
  const commerceRefFactory = refs();
  const walletRefFactory = refs();
  let store;
  try {
    const authorityAccountId = seedAccount(
      state.controlStore,
      "acct_transition_authority_first"
    );
    const resourceA = seedResource(state.controlStore, {
      accountId: authorityAccountId,
      suffix: "transition_authority_first"
    });
    assign(state.database, resourceA, "authority_transition_first");
    store = createCommerceStore(state.database, {
      authorityEnabled: true,
      commerceRefFactory,
      walletRefFactory
    });
    seedWalletAndOffer(store, authorityAccountId);
    const authorityQuote = quote(store, authorityAccountId);
    const authorityOrder = confirm(
      store,
      authorityQuote,
      "confirm_transition_authority_first",
      authorityAccountId
    );
    store.claimDueCaptures({ limit: 1 });
    store.captureClaimedOrder({ orderRef: authorityOrder.orderRef });
    store.close();

    store = createCommerceStore(state.database, {
      authorityEnabled: false,
      commerceRefFactory,
      walletRefFactory
    });
    const legacyAccountId = seedAccount(
      state.controlStore,
      "acct_transition_legacy_second"
    );
    seedWalletAndOffer(store, legacyAccountId);
    const legacyQuote = quote(store, legacyAccountId);
    const legacyOrder = confirm(
      store,
      legacyQuote,
      "confirm_transition_legacy_second",
      legacyAccountId
    );
    store.claimDueCaptures({ limit: 1 });
    store.captureClaimedOrder({ orderRef: legacyOrder.orderRef });

    assert.equal(store.claimNextFulfillmentCommand({ leaseMs: 30_000 }), null);
    assert.deepEqual(state.database.prepare(`
      select o.payment_status as paymentStatus,
             c.status as commandStatus
        from platform_coin_commerce_orders o
        join platform_coin_commerce_fulfillment_commands c
          on c.order_ref = o.order_ref
       where o.order_ref = ?
    `).get(authorityOrder.orderRef), {
      paymentStatus: "reconciliation_required",
      commandStatus: "failed"
    });
    const claimed = store.claimNextFulfillmentCommand({ leaseMs: 30_000 });
    assert.equal(claimed.orderRef, legacyOrder.orderRef);
    assert.equal(Object.hasOwn(claimed, "authority"), false);
  } finally {
    store?.close();
    state.database.close();
  }
});

test("disabling Authority freezes a bound active Quote and releases a bound held Order", () => {
  const state = createFoundation();
  const commerceRefFactory = refs();
  const walletRefFactory = refs();
  let store;
  try {
    const accountId = seedAccount(state.controlStore, "acct_transition_bound");
    const resourceA = seedResource(state.controlStore, {
      accountId,
      suffix: "transition_bound"
    });
    assign(state.database, resourceA, "authority_transition_bound");
    store = createCommerceStore(state.database, {
      authorityEnabled: true,
      commerceRefFactory,
      walletRefFactory
    });
    seedWalletAndOffer(store, accountId);
    const heldQuote = quote(store, accountId);
    const heldOrder = confirm(
      store,
      heldQuote,
      "confirm_transition_bound_held",
      accountId
    );
    const activeQuote = quote(store, accountId);
    store.close();

    store = createCommerceStore(state.database, {
      authorityEnabled: false,
      commerceRefFactory,
      walletRefFactory
    });
    const beforeConfirm = walletFinancialSnapshot(state.database);
    assert.throws(
      () => confirm(
        store,
        activeQuote,
        "confirm_transition_bound_active",
        accountId
      ),
      { code: "quote_stale" }
    );
    assert.deepEqual(walletFinancialSnapshot(state.database), beforeConfirm);
    assert.equal(state.database.prepare(
      "select count(*) from platform_coin_commerce_orders"
    ).pluck().get(), 1);

    assert.deepEqual(store.claimDueCaptures({ limit: 1 }), [
      { orderRef: heldOrder.orderRef }
    ]);
    const holdRef = state.database.prepare(`
      select hold_ref from platform_coin_commerce_orders where order_ref = ?
    `).pluck().get(heldOrder.orderRef);
    const isolated = store.captureClaimedOrder({ orderRef: heldOrder.orderRef });
    assert.equal(isolated.paymentStatus, "reconciliation_required");
    assert.equal(state.database.prepare(`
      select status from platform_coin_holds where hold_ref = ?
    `).pluck().get(holdRef), "released");
    assert.equal(state.database.prepare(`
      select count(*) from platform_coin_ledger_entries
       where operation = 'held_to_consumed'
    `).pluck().get(), 0);
    assert.equal(state.database.prepare(
      "select count(*) from platform_coin_commerce_fulfillment_commands"
    ).pluck().get(), 0);
  } finally {
    store?.close();
    state.database.close();
  }
});

test("a running legacy store discovers a later Authority binding schema and never downgrades its artifacts", () => {
  const state = createFoundation({ commerceBinding: false });
  const commerceRefFactory = refs();
  const walletRefFactory = refs();
  let legacyStore;
  let authorityStore;
  try {
    const accountId = seedAccount(state.controlStore, "acct_late_binding");
    const resourceA = seedResource(state.controlStore, {
      accountId,
      suffix: "late_binding"
    });
    assign(state.database, resourceA, "authority_late_binding");
    legacyStore = createCommerceStore(state.database, {
      authorityEnabled: false,
      commerceRefFactory,
      walletRefFactory
    });
    seedWalletAndOffer(legacyStore, accountId);

    applyAccountResourceAuthorityCommerceMigrations({
      database: state.database,
      expectedMigrationId:
        REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID,
      expectedDdlChecksum:
        ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATIONS[0].ddlChecksum,
      nowFn: () => new Date(NOW)
    });
    authorityStore = createCommerceStore(state.database, {
      authorityEnabled: true,
      commerceRefFactory,
      walletRefFactory
    });
    const heldQuote = quote(authorityStore, accountId);
    const heldOrder = confirm(
      authorityStore,
      heldQuote,
      "confirm_late_binding_held",
      accountId
    );
    const activeQuote = quote(authorityStore, accountId);

    assert.throws(() => confirm(
      legacyStore,
      activeQuote,
      "confirm_late_binding_active",
      accountId
    ), { code: "quote_stale" });
    authorityStore.claimDueCaptures({ limit: 1 });
    assert.equal(
      legacyStore.captureClaimedOrder({ orderRef: heldOrder.orderRef })
        .paymentStatus,
      "reconciliation_required"
    );
    assert.equal(state.database.prepare(`
      select count(*) from platform_coin_ledger_entries
       where operation = 'held_to_consumed'
    `).pluck().get(), 0);
    assert.equal(state.database.prepare(
      "select count(*) from platform_coin_commerce_fulfillment_commands"
    ).pluck().get(), 0);
  } finally {
    authorityStore?.close();
    legacyStore?.close();
    state.database.close();
  }
});

test("flag transitions keep delivered command history read-only", async (t) => {
  for (const transition of [
    { label: "legacy_to_authority", fromAuthority: false, toAuthority: true },
    { label: "authority_to_legacy", fromAuthority: true, toAuthority: false }
  ]) {
    await t.test(transition.label, () => {
      const state = createFoundation();
      const commerceRefFactory = refs();
      const walletRefFactory = refs();
      let store;
      try {
        const accountId = seedAccount(
          state.controlStore,
          `acct_${transition.label}`
        );
        if (transition.fromAuthority) {
          const resourceA = seedResource(state.controlStore, {
            accountId,
            suffix: transition.label
          });
          assign(
            state.database,
            resourceA,
            `authority_${transition.label}`
          );
        }
        store = createCommerceStore(state.database, {
          authorityEnabled: transition.fromAuthority,
          commerceRefFactory,
          walletRefFactory
        });
        seedWalletAndOffer(store, accountId);
        const created = quote(store, accountId);
        const order = confirm(
          store,
          created,
          `confirm_${transition.label}`,
          accountId
        );
        store.claimDueCaptures({ limit: 1 });
        store.captureClaimedOrder({ orderRef: order.orderRef });
        const command = store.claimNextFulfillmentCommand({ leaseMs: 30_000 });
        store.completeFulfillmentCommand({
          commandRef: command.commandRef,
          leaseGeneration: command.leaseGeneration,
          leaseToken: command.leaseToken,
          effectRef: `effect_${transition.label}`,
          status: "delivered"
        });
        store.close();

        store = createCommerceStore(state.database, {
          authorityEnabled: transition.toAuthority,
          commerceRefFactory,
          walletRefFactory
        });
        store.recoverNonTerminalOrders({ limit: 10 });
        assert.equal(
          store.captureClaimedOrder({ orderRef: order.orderRef }).paymentStatus,
          "captured"
        );
        assert.deepEqual(state.database.prepare(`
          select o.payment_status as paymentStatus,
                 c.status as commandStatus,
                 count(r.receipt_ref) as receiptCount
            from platform_coin_commerce_orders o
            join platform_coin_commerce_fulfillment_commands c
              on c.order_ref = o.order_ref
            left join platform_coin_commerce_fulfillment_receipts r
              on r.command_ref = c.command_ref
           where o.order_ref = ?
           group by o.order_ref, c.command_ref
        `).get(order.orderRef), {
          paymentStatus: "captured",
          commandStatus: "delivered",
          receiptCount: 1
        });
      } finally {
        store?.close();
        state.database.close();
      }
    });
  }
});

test("terminal transition history never bypasses the captured Hold invariant", () => {
  const state = createFoundation();
  const commerceRefFactory = refs();
  const walletRefFactory = refs();
  let store;
  try {
    const accountId = seedAccount(state.controlStore, "acct_terminal_invariant");
    store = createCommerceStore(state.database, {
      authorityEnabled: false,
      commerceRefFactory,
      walletRefFactory
    });
    seedWalletAndOffer(store, accountId);
    const created = quote(store, accountId);
    const order = confirm(
      store,
      created,
      "confirm_terminal_invariant",
      accountId
    );
    store.claimDueCaptures({ limit: 1 });
    store.captureClaimedOrder({ orderRef: order.orderRef });
    const command = store.claimNextFulfillmentCommand({ leaseMs: 30_000 });
    store.completeFulfillmentCommand({
      commandRef: command.commandRef,
      leaseGeneration: command.leaseGeneration,
      leaseToken: command.leaseToken,
      effectRef: "effect_terminal_invariant",
      status: "delivered"
    });
    store.close();

    const otherAccountId = seedAccount(
      state.controlStore,
      "acct_terminal_invariant_other"
    );
    state.database.prepare(`
      update platform_coin_wallets
         set account_id = ?
       where wallet_ref = (
         select h.wallet_ref
           from platform_coin_commerce_orders o
           join platform_coin_holds h on h.hold_ref = o.hold_ref
          where o.order_ref = ?
       )
    `).run(otherAccountId, order.orderRef);
    store = createCommerceStore(state.database, {
      authorityEnabled: true,
      commerceRefFactory,
      walletRefFactory
    });

    assert.equal(
      store.captureClaimedOrder({ orderRef: order.orderRef }).paymentStatus,
      "reconciliation_required"
    );
    assert.deepEqual(state.database.prepare(`
      select c.status as commandStatus, count(r.receipt_ref) as receiptCount
        from platform_coin_commerce_fulfillment_commands c
        left join platform_coin_commerce_fulfillment_receipts r
          on r.command_ref = c.command_ref
       where c.order_ref = ?
       group by c.command_ref
    `).get(order.orderRef), {
      commandStatus: "delivered",
      receiptCount: 1
    });
  } finally {
    store?.close();
    state.database.close();
  }
});

test("Authority mode never infers an active cross-product transition", () => {
  const state = createFoundation();
  try {
    const accountId = seedAccount(state.controlStore);
    const resourceA = seedResource(state.controlStore, {
      accountId,
      suffix: "a",
      plan: "offerv_unreviewed_active_plan_v1"
    });
    assign(state.database, resourceA, "authority_a");
    const productionOffer = {
      ...OFFER,
      title: { ...OFFER.title },
      summary: { ...OFFER.summary },
      importantNotices: {
        zh: [...OFFER.importantNotices.zh],
        en: [...OFFER.importantNotices.en]
      },
      acceptedCoinTypes: [...OFFER.acceptedCoinTypes],
      delivery: { ...OFFER.delivery }
    };
    const binding = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: state.controlStore,
      runtimeCore: {},
      accountActivationReader: () => true,
      publishedCatalog: [productionOffer],
      fulfillmentCatalog: [productionOffer],
      authorityEnabled: true,
      nowFn: () => new Date(NOW)
    });
    assert.equal(binding.purchaseEligibilityReader({
      accountId,
      offerVersionRef: OFFER.offerVersionRef
    }), false);
  } finally {
    state.database.close();
  }
});

test("Store, coordinator, and production fulfillment mutate only Resource A", async () => {
  const state = createFoundation();
  let store;
  try {
    const accountId = seedAccount(state.controlStore, "acct_authority_e2e");
    const resourceA = seedResource(state.controlStore, {
      accountId,
      suffix: "e2e_a"
    });
    const resourceB = seedResource(state.controlStore, {
      accountId,
      suffix: "e2e_b"
    });
    assign(state.database, resourceA, "authority_e2e_a");
    const beforeA = resourceSnapshot(state.database, resourceA);
    const beforeB = resourceSnapshot(state.database, resourceB);
    const tenants = new Map([
      [resourceA.tenantId, {
        id: resourceA.tenantId,
        status: "active",
        expiresAt: VALID_UNTIL
      }],
      [resourceB.tenantId, {
        id: resourceB.tenantId,
        status: "active",
        expiresAt: VALID_UNTIL
      }]
    ]);
    const artifacts = new Map([
      [resourceA.tenantId, [{
        id: resourceA.artifactId,
        tenantId: resourceA.tenantId,
        status: "active"
      }]],
      [resourceB.tenantId, [{
        id: resourceB.artifactId,
        tenantId: resourceB.tenantId,
        status: "active"
      }]]
    ]);
    const runtimeCore = {
      getTenant(tenantId) {
        return tenants.get(tenantId) ?? null;
      },
      listSubscriptionArtifacts(tenantId) {
        return artifacts.get(tenantId) ?? [];
      },
      renewTenant(tenantId, { expiresAt }) {
        const renewed = {
          ...tenants.get(tenantId),
          status: "active",
          expiresAt
        };
        tenants.set(tenantId, renewed);
        return renewed;
      }
    };
    const productionOffer = {
      ...OFFER,
      title: { ...OFFER.title },
      summary: { ...OFFER.summary },
      importantNotices: {
        zh: [...OFFER.importantNotices.zh],
        en: [...OFFER.importantNotices.en]
      },
      acceptedCoinTypes: [...OFFER.acceptedCoinTypes],
      delivery: { ...OFFER.delivery }
    };
    const binding = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: state.controlStore,
      runtimeCore,
      accountActivationReader: () => true,
      publishedCatalog: [productionOffer],
      fulfillmentCatalog: [productionOffer],
      authorityEnabled: true,
      nowFn: () => new Date(NOW)
    });
    store = createCommerceStore(state.database, { authorityEnabled: true });
    seedWalletAndOffer(store, accountId);
    const created = quote(store, accountId);
    const order = confirm(
      store,
      created,
      "confirm_authority_e2e",
      accountId
    );
    const coordinator = createCoinCommerceCoordinator({
      store,
      fulfillmentHandler: binding.fulfillmentHandler,
      captureBatchSize: 1,
      commandLeaseMs: 30_000
    });

    const summary = await coordinator.runOnce();
    assert.equal(summary.capturesProcessed, 1);
    assert.equal(summary.commandsDelivered, 1);
    const afterA = resourceSnapshot(state.database, resourceA);
    assert.notEqual(
      afterA.entitlement.valid_until,
      beforeA.entitlement.valid_until
    );
    assert.equal(
      tenants.get(resourceA.tenantId).expiresAt,
      afterA.entitlement.valid_until
    );
    assert.deepEqual(resourceSnapshot(state.database, resourceB), beforeB);
    assert.equal(tenants.get(resourceB.tenantId).expiresAt, VALID_UNTIL);
    assert.equal(state.database.prepare(`
      select count(*) from platform_coin_ledger_entries
       where operation = 'held_to_consumed'
    `).pluck().get(), 1);
    assert.equal(state.database.prepare(`
      select count(*)
        from platform_coin_commerce_fulfillment_receipts r
        join platform_coin_commerce_fulfillment_commands c
          on c.command_ref = r.command_ref
       where c.order_ref = ? and r.status = 'delivered'
    `).pluck().get(order.orderRef), 1);
  } finally {
    store?.close();
    state.database.close();
  }
});

test("Authority fulfillment accepts public Authority refs, mutates only Resource A, and leaves B unchanged", async () => {
  const state = createFoundation();
  try {
    const accountId = seedAccount(state.controlStore);
    const resourceA = seedResource(state.controlStore, {
      accountId,
      suffix: "a.with.dot"
    });
    const resourceB = seedResource(state.controlStore, { accountId, suffix: "b" });
    const authority = assign(state.database, resourceA, ".authority.a");
    const beforeA = resourceSnapshot(state.database, resourceA);
    const beforeB = resourceSnapshot(state.database, resourceB);
    const tenants = new Map([
      [resourceA.tenantId, {
        id: resourceA.tenantId,
        status: "active",
        expiresAt: VALID_UNTIL
      }],
      [resourceB.tenantId, {
        id: resourceB.tenantId,
        status: "active",
        expiresAt: VALID_UNTIL
      }]
    ]);
    const artifacts = new Map([
      [resourceA.tenantId, [{
        id: resourceA.artifactId,
        tenantId: resourceA.tenantId,
        status: "active"
      }]],
      [resourceB.tenantId, [{
        id: resourceB.artifactId,
        tenantId: resourceB.tenantId,
        status: "active"
      }]]
    ]);
    const runtimeCore = {
      getTenant(tenantId) {
        return tenants.get(tenantId) ?? null;
      },
      listSubscriptionArtifacts(tenantId) {
        return artifacts.get(tenantId) ?? [];
      },
      renewTenant(tenantId, { expiresAt }) {
        const current = tenants.get(tenantId);
        const renewed = { ...current, status: "active", expiresAt };
        tenants.set(tenantId, renewed);
        return renewed;
      }
    };
    const productionOffer = {
      ...OFFER,
      title: { ...OFFER.title },
      summary: { ...OFFER.summary },
      importantNotices: {
        zh: [...OFFER.importantNotices.zh],
        en: [...OFFER.importantNotices.en]
      },
      acceptedCoinTypes: [...OFFER.acceptedCoinTypes],
      delivery: { ...OFFER.delivery }
    };
    const binding = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: state.controlStore,
      runtimeCore,
      accountActivationReader: ({ accountId: candidate }) => candidate === accountId,
      publishedCatalog: [productionOffer],
      fulfillmentCatalog: [productionOffer],
      authorityEnabled: true,
      nowFn: () => new Date(NOW)
    });
    const command = {
      commandRef: "command_authority_1",
      orderRef: "order_authority_1",
      accountId,
      offerVersionRef: OFFER.offerVersionRef,
      delivery: OFFER.delivery,
      authority: {
        authorityRef: authority.authorityRef,
        authorityVersion: authority.authorityVersion,
        resourceRequestId: resourceA.resourceRequestId,
        entitlementId: resourceA.entitlementId,
        issuedLinkId: resourceA.issuedLinkId
      }
    };
    const first = await binding.fulfillmentHandler.execute(command);
    const replay = await binding.fulfillmentHandler.execute(command);
    const afterA = resourceSnapshot(state.database, resourceA);
    assert.deepEqual(replay, first);
    assert.notEqual(
      afterA.entitlement.valid_until,
      beforeA.entitlement.valid_until
    );
    assert.equal(
      afterA.entitlement.valid_until,
      afterA.portal.valid_until
    );
    assert.equal(afterA.entitlement.valid_until, afterA.portal.expires_at);
    assert.equal(
      tenants.get(resourceA.tenantId).expiresAt,
      afterA.entitlement.valid_until
    );
    assert.deepEqual(resourceSnapshot(state.database, resourceB), beforeB);
    assert.equal(state.database.prepare(`
      select count(*) from platform_audit_events
       where entity_type = 'coin_commerce_subscription_fulfillment'
    `).pluck().get(), 1);
    assert.equal(tenants.get(resourceB.tenantId).expiresAt, VALID_UNTIL);
  } finally {
    state.database.close();
  }
});

test("Authority version change between fulfillment preflight and control mutation fails closed", () => {
  const state = createFoundation();
  try {
    const accountId = seedAccount(state.controlStore);
    const resourceA = seedResource(state.controlStore, {
      accountId,
      suffix: "fulfillment_race_a"
    });
    const resourceB = seedResource(state.controlStore, {
      accountId,
      suffix: "fulfillment_race_b"
    });
    const authority = assign(state.database, resourceA, "authority_fulfillment_a");
    const authorityStore = createAccountResourceAuthorityStore({
      database: state.database,
      nowFn: () => new Date(NOW),
      idFactory: () => "authority_fulfillment_b"
    });
    const beforeA = resourceSnapshot(state.database, resourceA);
    const beforeB = resourceSnapshot(state.database, resourceB);
    const tenants = new Map([[resourceA.tenantId, {
      id: resourceA.tenantId,
      status: "active",
      expiresAt: VALID_UNTIL
    }]]);
    let renewalCalls = 0;
    const runtimeCore = {
      getTenant(tenantId) {
        return tenants.get(tenantId) ?? null;
      },
      listSubscriptionArtifacts(tenantId) {
        return tenantId === resourceA.tenantId
          ? [{
              id: resourceA.artifactId,
              tenantId,
              status: "active"
            }]
          : [];
      },
      renewTenant() {
        renewalCalls += 1;
        throw new Error("runtime renewal must not run after Authority drift");
      }
    };
    let reassigned = false;
    const racingControlStore = new Proxy(state.controlStore, {
      get(target, property, receiver) {
        if (property === "applyCoinCommerceSubscriptionFulfillment") {
          return (input) => {
            if (!reassigned) {
              reassigned = true;
              authorityStore.reassignAuthority({
                ...resourceB,
                expectedVersion: 1,
                createdBy: "operator:test",
                reason: "fulfillment_control_race",
                revokedBy: "operator:test",
                revocationReason: "fulfillment_control_race"
              });
            }
            return target.applyCoinCommerceSubscriptionFulfillment(input);
          };
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
    const productionOffer = {
      ...OFFER,
      title: { ...OFFER.title },
      summary: { ...OFFER.summary },
      importantNotices: {
        zh: [...OFFER.importantNotices.zh],
        en: [...OFFER.importantNotices.en]
      },
      acceptedCoinTypes: [...OFFER.acceptedCoinTypes],
      delivery: { ...OFFER.delivery }
    };
    const binding = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: racingControlStore,
      runtimeCore,
      accountActivationReader: () => true,
      publishedCatalog: [productionOffer],
      fulfillmentCatalog: [productionOffer],
      authorityEnabled: true,
      nowFn: () => new Date(NOW)
    });

    assert.throws(() => binding.fulfillmentHandler.execute({
      commandRef: "command_authority_race",
      orderRef: "order_authority_race",
      accountId,
      offerVersionRef: OFFER.offerVersionRef,
      delivery: OFFER.delivery,
      authority: {
        authorityRef: authority.authorityRef,
        authorityVersion: authority.authorityVersion,
        resourceRequestId: resourceA.resourceRequestId,
        entitlementId: resourceA.entitlementId,
        issuedLinkId: resourceA.issuedLinkId
      }
    }), { code: "coin_commerce_fulfillment_reconciliation_required" });
    assert.equal(reassigned, true);
    assert.equal(renewalCalls, 0);
    assert.deepEqual(resourceSnapshot(state.database, resourceA), beforeA);
    assert.deepEqual(resourceSnapshot(state.database, resourceB), beforeB);
    assert.equal(state.database.prepare(`
      select count(*) from platform_audit_events
       where entity_type = 'coin_commerce_subscription_fulfillment'
    `).pluck().get(), 0);
  } finally {
    state.database.close();
  }
});
