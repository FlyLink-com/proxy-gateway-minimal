import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { COIN_COMMERCE_PRODUCTION_OFFERS } from "../services/platform/coin-commerce-production-catalog.mjs";
import { createCoinCommerceCoordinator } from "../services/platform/coin-commerce-coordinator.mjs";
import * as commerceMigrations from "../services/platform/coin-commerce-migrations.mjs";
import {
  applyCoinCommerceMigrations,
  COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID
} from "../services/platform/coin-commerce-migrations.mjs";
import { createSqliteCoinCommerceStore } from "../services/platform/coin-commerce-store.mjs";
import { createCoinCommerceProductionSubscriptionFulfillment } from "../services/platform/coin-commerce-production-subscription-fulfillment.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createPortalAccessRequestService } from "../services/platform/portal-access-requests.mjs";
import {
  applyCoinWalletMigrations,
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID
} from "../services/platform/coin-wallet-migrations.mjs";
import { createSubscriptionCore } from "../services/subscriptions/core.mjs";
import { createSqliteSubscriptionStore } from "../services/subscriptions/repository.mjs";
import { hashSubscriptionToken } from "../services/subscriptions/tokens.mjs";

const NOW = "2026-07-30T00:00:00.000Z";
const CONFIRM_AT = "2026-07-30T00:01:00.000Z";
const EXPIRES_AT = "2026-07-30T00:05:00.000Z";
const OFFER = COIN_COMMERCE_PRODUCTION_OFFERS[0];

function fixedClockDatabase(database, nowFn, fault) {
  return new Proxy(database, {
    get(target, property) {
      if (property === "inTransaction") return target.inTransaction;
      if (property === "prepare") {
        return (sql) => {
          if (/select\s+strftime\('%Y-%m-%dT%H:%M:%fZ',\s*'now'\)/i.test(sql)) {
            return { pluck: () => ({ get: nowFn }) };
          }
          const statement = target.prepare(sql);
          if (!/^\s*(?:insert|update|delete)\b/i.test(sql)) return statement;
          return new Proxy(statement, {
            get(result, method) {
              const value = Reflect.get(result, method, result);
              if (typeof value !== "function") return value;
              return (...args) => {
                if (fault.active && ["run", "get", "all"].includes(method)) {
                  fault.writeCount += 1;
                  if (fault.failAt === fault.writeCount) {
                    throw new Error("synthetic private confirmation write failure");
                  }
                }
                return value.apply(result, args);
              };
            }
          });
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}

async function createFailedInitialFixture() {
  const directory = mkdtempSync(join(tmpdir(), "coin-commerce-initial-confirmation-"));
  const controlDbPath = join(directory, "control.sqlite");
  const runtimeDbPath = join(directory, "runtime.sqlite");
  const controlStore = createSqliteSubscriptionControlStore({ dbPath: controlDbPath });
  const runtimeStore = createSqliteSubscriptionStore({ dbPath: runtimeDbPath });
  const database = new Database(controlDbPath);
  const accountId = "acct_initial_confirmation_001";
  let now = NOW;
  let commerceStore;
  let coordinator;
  let command;
  const fault = { active: false, failAt: null, writeCount: 0 };
  const commerceDatabase = fixedClockDatabase(database, () => now, fault);
  const calls = { issuance: 0, capture: 0, renewal: 0 };
  const runtimeView = {
    tenantIdOverride: null, artifactIdOverride: null,
    tenantReadCount: 0, tenantIdOverrideAtRead: null
  };
  const runtimeCore = createSubscriptionCore({
    store: runtimeStore,
    proxyConfig: {
      servers: [{
        id: "node_sg", name: "synthetic-node", region: "Singapore",
        host: "203.0.113.10", port: 18388, method: "aes-256-gcm",
        password: "synthetic-confirmation-secret"
      }],
      pingHosts: [],
      nginx: {}
    },
    publicSubscriptionBaseUrl: "https://gateway.example.test",
    nowFn: () => new Date(now),
    tokenFactory: () => {
      const rawToken = "pgsub_synthetic_initial_confirmation";
      return { rawToken, tokenHash: hashSubscriptionToken(rawToken), tokenPrefix: rawToken.slice(0, 14) };
    },
    artifactSecretFactory: () => "synthetic_initial_confirmation_artifact",
    idFactory: () => "tenant_initial_confirmation_001",
    artifactIdFactory: () => "artifact_initial_confirmation_001"
  });
  const observedRuntimeCore = Object.create(runtimeCore);
  observedRuntimeCore.getTenant = (id) => {
    runtimeView.tenantReadCount += 1;
    const tenant = runtimeCore.getTenant(id);
    return runtimeView.tenantIdOverride
      && (runtimeView.tenantIdOverrideAtRead === null
        || runtimeView.tenantReadCount >= runtimeView.tenantIdOverrideAtRead)
      ? { ...tenant, id: runtimeView.tenantIdOverride }
      : tenant;
  };
  observedRuntimeCore.listSubscriptionArtifacts = (id) => {
    const artifacts = runtimeCore.listSubscriptionArtifacts(id);
    return runtimeView.artifactIdOverride
      ? artifacts.map((artifact) => ({ ...artifact, id: runtimeView.artifactIdOverride }))
      : artifacts;
  };
  observedRuntimeCore.renewTenant = (...args) => {
    calls.renewal += 1;
    return runtimeCore.renewTenant(...args);
  };
  const issuer = createPortalAccessRequestService({
    controlStore,
    runtimeCore: observedRuntimeCore,
    nowFn: () => new Date(now),
    autoIssuance: { enabled: true, nodeId: "node_sg", reviewedByRef: "commerce_product_issuer" }
  });
  const observedIssuer = Object.create(issuer);
  observedIssuer.fulfillCommerceProduct = (input) => {
    calls.issuance += 1;
    return issuer.fulfillCommerceProduct(input);
  };
  const failedConfirmationStore = Object.create(controlStore);
  failedConfirmationStore.applyCoinCommerceSubscriptionFulfillment = () => {
    const error = new Error("synthetic interruption after issued resource, before Commerce effect");
    error.code = "coin_commerce_subscription_fulfillment_drift";
    throw error;
  };
  const productionFulfillment = createCoinCommerceProductionSubscriptionFulfillment({
    controlStore: failedConfirmationStore,
    runtimeCore: observedRuntimeCore,
    accountResourceIssuer: observedIssuer,
    accountActivationReader: () => true,
    nowFn: () => new Date(now)
  });
  const close = async () => {
    await coordinator?.stop();
    commerceStore?.close();
    database.close();
    controlStore.close();
    runtimeStore.close();
    rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  };
  try {
    controlStore.createAccount({
      id: accountId, ownerRef: "owner_initial_confirmation_001", status: "active",
      createdAt: NOW, updatedAt: NOW
    });
    applyCoinWalletMigrations({
      database, expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
      expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum, nowFn: () => new Date(now)
    });
    applyCoinCommerceMigrations({
      database, expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
      expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum, nowFn: () => new Date(now)
    });
    commerceStore = createSqliteCoinCommerceStore({
      database: commerceDatabase, cancelWindowMs: 0
    });
    const captureClaimedOrder = commerceStore.captureClaimedOrder;
    commerceStore.captureClaimedOrder = (input) => {
      calls.capture += 1;
      return captureClaimedOrder(input);
    };
    commerceStore.walletStore.creditCoins({
      accountId, coinType: "paid_coins", amountUnits: 20, availability: "available",
      sourceType: "synthetic_seed", sourceRef: "source_initial_confirmation",
      sourceDigest: "a".repeat(64), policyRef: null, policyVersion: null, expiresAt: null,
      operation: {
        actorScope: "system:initial-confirmation-test", idempotencyKey: "credit_initial_confirmation",
        actorType: "system", actorRef: "initial_confirmation_test"
      }
    });
    commerceStore.bootstrapPublishedOffers([OFFER]);
    const quote = commerceStore.createCheckoutQuote({ accountId, offerRef: OFFER.offerRef });
    const order = commerceStore.confirmOrder({
      accountId, quoteRef: quote.quoteRef,
      operation: {
        actorScope: `portal:${accountId}`, idempotencyKey: "confirm_initial_confirmation",
        actorType: "portal_user", actorRef: accountId
      }
    });
    const [claimed] = commerceStore.claimDueCaptures({ limit: 1 });
    assert.equal(claimed.orderRef, order.orderRef);
    commerceStore.captureClaimedOrder({ orderRef: order.orderRef });
    coordinator = createCoinCommerceCoordinator({
      store: commerceStore,
      fulfillmentHandler: {
        idempotencyContract: productionFulfillment.fulfillmentHandler.idempotencyContract,
        execute(input) {
          command = input;
          return productionFulfillment.fulfillmentHandler.execute(input);
        }
      },
      nowFn: () => new Date(now)
    });
    const pass = await coordinator.runOnce();
    assert.equal(pass.commandsFailed, 1);
    assert.equal(pass.commandsDeferred, 0);
    now = CONFIRM_AT;
    return {
      directory, controlDbPath, runtimeDbPath, database: commerceDatabase,
      rawDatabase: database, fault, controlStore, runtimeStore,
      runtimeCore, observedRuntimeCore, runtimeView, issuer: observedIssuer, commerceStore,
      accountId, orderRef: order.orderRef, command, calls, close,
      get now() { return now; },
      setNow(value) { now = value; },
      readOrder() { return commerceStore.getOrder({ accountId, orderRef: order.orderRef }); },
      readResources() { return controlStore.listPortalAccessRequests({ portalUserRef: accountId }); },
      readEffects() {
        return controlStore.getAccountControlSummary(accountId).auditEvents
          .filter((event) => event.action === "subscription_fulfillment_applied");
      },
      readReceipts() {
        return database.prepare("select * from platform_coin_commerce_fulfillment_receipts order by receipt_ref").all();
      },
      databaseSnapshot() {
        const tableNames = database.prepare(`
          select name from sqlite_master where type = 'table' order by name
        `).all().map((row) => row.name);
        return Object.fromEntries(tableNames.map((table) => [
          table,
          database.prepare(`select * from "${table.replaceAll('"', '""')}"`).all()
            .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
        ]));
      },
      immutableSnapshot() {
        const tableNames = [
          "platform_coin_wallets", "platform_coin_lots", "platform_coin_holds",
          "platform_coin_hold_allocations", "platform_coin_ledger_entries",
          "platform_coin_operation_receipts", "platform_entitlements",
          "platform_issuance_requests", "platform_issued_subscription_links",
          "platform_portal_access_requests"
        ];
        const tables = Object.fromEntries(tableNames.map((table) => [
          table, database.prepare(`select * from ${table} order by rowid`).all()
        ]));
        const [resource] = controlStore.listPortalAccessRequests({ portalUserRef: accountId });
        return {
          tables,
          runtimeTenant: runtimeCore.getTenant(resource.tenantId),
          runtimeArtifacts: runtimeCore.listSubscriptionArtifacts(resource.tenantId)
        };
      }
    };
  } catch (error) {
    await close();
    throw error;
  }
}

test("initial confirmation fixture is a real captured terminal failure with one issued resource", async () => {
  const fixture = await createFailedInitialFixture();
  try {
    assert.equal(fixture.readOrder().paymentStatus, "reconciliation_required");
    assert.equal(fixture.readOrder().fulfillment.status, "failed");
    assert.equal(fixture.readOrder().fulfillment.safeCode, "fulfillment_handler_unavailable");
    const resources = fixture.readResources();
    assert.equal(resources.length, 1);
    assert.equal(resources[0].status, "delivered");
    assert.equal(fixture.controlStore.getAccountControlSummary(fixture.accountId).entitlements.length, 1);
    assert.equal(fixture.controlStore.listIssuedSubscriptionBindings({ accountId: fixture.accountId }).length, 1);
    assert.equal(fixture.readEffects().length, 0);
    assert.equal(fixture.readReceipts().length, 0);
    assert.deepEqual(fixture.calls, { issuance: 1, capture: 1, renewal: 0 });
    const snapshot = fixture.immutableSnapshot();
    assert.equal(snapshot.tables.platform_coin_holds.length, 1);
    assert.equal(snapshot.tables.platform_coin_holds[0].status, "captured");
    assert.equal(snapshot.tables.platform_coin_holds[0].amount_units, 20);
    assert.equal(snapshot.runtimeTenant.status, "active");
    assert.equal(snapshot.runtimeArtifacts.length, 1);
    assert.equal(snapshot.runtimeArtifacts[0].status, "active");
  } finally {
    await fixture.close();
  }
});

async function confirmationApi() {
  return import("../services/platform/coin-commerce-initial-confirmation.mjs");
}

async function readyConfirmationFixture() {
  const fixture = await createFailedInitialFixture();
  try {
    const api = await confirmationApi();
    assert.equal(typeof commerceMigrations.applyCoinCommerceInitialConfirmationMigrations, "function");
    commerceMigrations.applyCoinCommerceInitialConfirmationMigrations({
      database: fixture.database,
      expectedMigrationId: commerceMigrations.REQUIRED_COIN_COMMERCE_INITIAL_CONFIRMATION_MIGRATION_ID,
      expectedDdlChecksum: commerceMigrations.COIN_COMMERCE_INITIAL_CONFIRMATION_MIGRATIONS[0].ddlChecksum,
      nowFn: () => new Date(fixture.now)
    });
    const service = api.createCoinCommerceInitialConfirmation({
      database: fixture.database,
      commerceStore: fixture.commerceStore,
      runtimeCore: fixture.observedRuntimeCore,
      nowFn: () => new Date(fixture.now)
    });
    return {
      ...fixture,
      get now() { return fixture.now; },
      api,
      service,
      approval(inventorySha256, overrides = {}) {
        const input = {
          accountId: fixture.accountId,
          orderRef: fixture.orderRef,
          inventorySha256,
          operatorRef: "operator_initial_confirmation_test",
          expiresAt: EXPIRES_AT,
          ...overrides
        };
        return { ...input, approvalSha256: api.initialConfirmationApprovalDigest(input) };
      }
    };
  } catch (error) {
    await fixture.close();
    throw error;
  }
}

test("controlled initial confirmation completes only the original terminal order without resource or wallet mutation", async () => {
  const fixture = await readyConfirmationFixture();
  try {
    const immutable = fixture.immutableSnapshot();
    const beforePrepare = fixture.databaseSnapshot();
    const inventory = fixture.service.prepare({ accountId: fixture.accountId, orderRef: fixture.orderRef });
    assert.equal(inventory.state, "ready");
    assert.match(inventory.inventorySha256, /^[a-f0-9]{64}$/);
    for (const privateValue of [fixture.accountId, fixture.orderRef, fixture.readResources()[0].tenantId]) {
      assert.equal(JSON.stringify(inventory).includes(privateValue), false);
    }
    assert.deepEqual(fixture.databaseSnapshot(), beforePrepare);
    const failedEvents = fixture.rawDatabase.prepare(`
      select * from platform_coin_commerce_order_events
       where event_type in ('fulfillment_failed', 'reconciliation_required') order by rowid
    `).all();
    assert.equal(failedEvents.length, 2);
    // Inventory binds persisted evidence, not the wall-clock instant of prepare.
    fixture.setNow("2026-07-30T00:02:00.001Z");
    fixture.fault.active = true;
    const result = fixture.service.execute(fixture.approval(inventory.inventorySha256));
    fixture.fault.active = false;
    assert.deepEqual(Object.keys(result).sort(), ["confirmationSha256", "redacted", "state"]);
    assert.equal(result.state, "confirmed");
    assert.equal(result.redacted, true);
    assert.match(result.confirmationSha256, /^[a-f0-9]{64}$/);
    assert.equal(fixture.readOrder().paymentStatus, "captured");
    assert.equal(fixture.readOrder().fulfillment.status, "delivered");
    assert.equal(fixture.readEffects().length, 1);
    assert.equal(fixture.readReceipts().length, 1);
    assert.deepEqual(fixture.calls, { issuance: 1, capture: 1, renewal: 0 });
    assert.deepEqual(fixture.immutableSnapshot(), immutable);
    assert.deepEqual(fixture.rawDatabase.prepare(`
      select * from platform_coin_commerce_order_events
       where event_type in ('fulfillment_failed', 'reconciliation_required') order by rowid
    `).all(), failedEvents);
    assert.ok(fixture.fault.writeCount > 0);
  } finally {
    await fixture.close();
  }
});

function assertRejectedWithoutMutation(fixture, execute, codes) {
  const databaseBefore = fixture.databaseSnapshot();
  const resourcesBefore = fixture.immutableSnapshot();
  const callsBefore = { ...fixture.calls };
  assert.throws(execute, (error) => (
    codes.includes(error.code)
    && !String(error).includes("synthetic private")
  ));
  assert.deepEqual(fixture.databaseSnapshot(), databaseBefore);
  assert.deepEqual(fixture.immutableSnapshot(), resourcesBefore);
  assert.deepEqual(fixture.calls, callsBefore);
}

test("controlled initial confirmation binds exact approval fields and rejects malformed or expired approval", async (t) => {
  const cases = [
    { name: "wrong digest", mutate: (input) => ({ ...input, approvalSha256: "b".repeat(64) }), code: "initial_confirmation_approval_invalid" },
    { name: "changed operator", mutate: (input) => ({ ...input, operatorRef: "operator_other" }), code: "initial_confirmation_approval_invalid" },
    { name: "changed expiry", mutate: (input) => ({ ...input, expiresAt: "2026-07-30T00:06:00.000Z" }), code: "initial_confirmation_approval_invalid" },
    { name: "changed inventory", mutate: (input) => ({ ...input, inventorySha256: "c".repeat(64) }), code: "initial_confirmation_approval_invalid" },
    { name: "invalid inventory", mutate: (input) => ({ ...input, inventorySha256: "short" }), code: "initial_confirmation_invalid_input" },
    { name: "missing operator", mutate: (input) => ({ ...input, operatorRef: undefined }), code: "initial_confirmation_invalid_input" },
    { name: "extra field", mutate: (input) => ({ ...input, retry: true }), code: "initial_confirmation_invalid_input" },
    { name: "expired signed approval", expired: true, mutate: (input) => input, code: "initial_confirmation_approval_expired" }
  ];
  for (const entry of cases) {
    await t.test(entry.name, async () => {
      const fixture = await readyConfirmationFixture();
      try {
        const inventory = fixture.service.prepare({ accountId: fixture.accountId, orderRef: fixture.orderRef });
        const approval = fixture.approval(inventory.inventorySha256);
        if (entry.expired) fixture.setNow("2026-07-30T00:06:00.000Z");
        assertRejectedWithoutMutation(fixture, () => fixture.service.execute(entry.mutate(approval)), [entry.code]);
      } finally {
        await fixture.close();
      }
    });
  }
});

test("controlled initial confirmation replays the exact committed approval after expiry without writes", async () => {
  const fixture = await readyConfirmationFixture();
  try {
    const inventory = fixture.service.prepare({ accountId: fixture.accountId, orderRef: fixture.orderRef });
    const approval = fixture.approval(inventory.inventorySha256);
    const confirmed = fixture.service.execute(approval);
    const afterCommit = fixture.databaseSnapshot();
    const immutable = fixture.immutableSnapshot();
    fixture.setNow("2026-07-30T00:10:00.000Z");
    fixture.fault.active = true;
    fixture.fault.writeCount = 0;
    const replay = fixture.service.execute(approval);
    fixture.fault.active = false;
    assert.deepEqual(replay, { ...confirmed, state: "already_confirmed" });
    assert.equal(fixture.fault.writeCount, 0);
    assert.deepEqual(fixture.databaseSnapshot(), afterCommit);
    assert.deepEqual(fixture.immutableSnapshot(), immutable);
    assert.deepEqual(fixture.calls, { issuance: 1, capture: 1, renewal: 0 });
    assert.equal(fixture.readReceipts().length, 1);
    assert.equal(fixture.readEffects().length, 1);
  } finally {
    await fixture.close();
  }
});

test("controlled initial confirmation cannot authorize another account or order with a fresh digest", async () => {
  const fixture = await readyConfirmationFixture();
  try {
    fixture.controlStore.createAccount({
      id: "acct_other_initial_confirmation", ownerRef: "owner_other_initial_confirmation",
      status: "active", createdAt: NOW, updatedAt: NOW
    });
    const inventory = fixture.service.prepare({ accountId: fixture.accountId, orderRef: fixture.orderRef });
    for (const overrides of [
      { accountId: "acct_other_initial_confirmation" },
      { orderRef: "coinord_other_initial_confirmation" }
    ]) {
      const approval = fixture.approval(inventory.inventorySha256, overrides);
      assertRejectedWithoutMutation(fixture, () => fixture.service.execute(approval), [
        "initial_confirmation_not_eligible", "initial_confirmation_evidence_drift"
      ]);
    }
  } finally {
    await fixture.close();
  }
});

test("controlled initial confirmation never reuses a committed record for another approval", async () => {
  const fixture = await readyConfirmationFixture();
  try {
    const inventory = fixture.service.prepare({ accountId: fixture.accountId, orderRef: fixture.orderRef });
    fixture.service.execute(fixture.approval(inventory.inventorySha256));
    const otherApproval = fixture.approval(inventory.inventorySha256, { operatorRef: "operator_other" });
    assertRejectedWithoutMutation(fixture, () => fixture.service.execute(otherApproval), [
      "initial_confirmation_approval_invalid", "initial_confirmation_evidence_drift"
    ]);
  } finally {
    await fixture.close();
  }
});

test("controlled initial confirmation rejects changed initial lineage or runtime identity", async (t) => {
  for (const drift of ["approvalRef", "purpose", "accessGrantRef", "entitlementTime", "runtimeTenant", "runtimeArtifact"]) {
    await t.test(drift, async () => {
      const fixture = await readyConfirmationFixture();
      try {
        const inventory = fixture.service.prepare({ accountId: fixture.accountId, orderRef: fixture.orderRef });
        const approval = fixture.approval(inventory.inventorySha256);
        const [resource] = fixture.readResources();
        if (drift === "runtimeTenant") {
          fixture.runtimeView.tenantIdOverride = "tenant_other_confirmation";
        } else if (drift === "runtimeArtifact") {
          fixture.runtimeView.artifactIdOverride = "artifact_other_confirmation";
        } else if (drift === "entitlementTime") {
          fixture.rawDatabase.prepare("update platform_entitlements set created_at = ? where id = ?")
            .run("2026-07-29T23:59:59.999Z", resource.entitlementRef);
        } else if (drift === "accessGrantRef") {
          fixture.rawDatabase.prepare("update platform_portal_access_requests set access_grant_ref = ? where id = ?")
            .run("grant_other_confirmation", resource.id);
        } else {
          const column = drift === "approvalRef" ? "approval_ref" : "purpose";
          fixture.rawDatabase.prepare(`update platform_issuance_requests set ${column} = ? where id = ?`)
            .run("synthetic_other_confirmation", resource.id);
        }
        assertRejectedWithoutMutation(fixture, () => fixture.service.execute(approval), [
          "initial_confirmation_evidence_drift", "initial_confirmation_not_eligible"
        ]);
      } finally {
        await fixture.close();
      }
    });
  }
});

test("controlled initial confirmation atomically rolls back every application write failure", async (t) => {
  let writeCount;
  const baseline = await readyConfirmationFixture();
  try {
    const inventory = baseline.service.prepare({ accountId: baseline.accountId, orderRef: baseline.orderRef });
    baseline.fault.active = true;
    baseline.fault.writeCount = 0;
    baseline.service.execute(baseline.approval(inventory.inventorySha256));
    baseline.fault.active = false;
    writeCount = baseline.fault.writeCount;
    assert.ok(writeCount > 0 && writeCount <= 20);
  } finally {
    await baseline.close();
  }
  for (let failAt = 1; failAt <= writeCount; failAt += 1) {
    await t.test(`write ${failAt}`, async () => {
      const fixture = await readyConfirmationFixture();
      try {
        const inventory = fixture.service.prepare({ accountId: fixture.accountId, orderRef: fixture.orderRef });
        const approval = fixture.approval(inventory.inventorySha256);
        const before = fixture.databaseSnapshot();
        const immutable = fixture.immutableSnapshot();
        fixture.fault.active = true;
        fixture.fault.failAt = failAt;
        fixture.fault.writeCount = 0;
        let failure;
        try { fixture.service.execute(approval); } catch (error) { failure = error; }
        fixture.fault.active = false;
        assert.ok(failure, "each injected write failure must reject confirmation");
        assert.equal(fixture.fault.writeCount, failAt);
        assert.deepEqual(fixture.databaseSnapshot(), before);
        assert.deepEqual(fixture.immutableSnapshot(), immutable);
        assert.equal(fixture.readOrder().paymentStatus, "reconciliation_required");
        assert.equal(fixture.readOrder().fulfillment.status, "failed");
        assert.equal(fixture.readEffects().length, 0);
        assert.equal(fixture.readReceipts().length, 0);
        assert.deepEqual(fixture.calls, { issuance: 1, capture: 1, renewal: 0 });
        assert.equal(failure.code, "initial_confirmation_unavailable");
        assert.equal(String(failure).includes("synthetic private"), false);
      } finally {
        await fixture.close();
      }
    });
  }
});

test("controlled initial confirmation rolls back if runtime identity drifts during post-write readback", async () => {
  const fixture = await readyConfirmationFixture();
  try {
    const inventory = fixture.service.prepare({ accountId: fixture.accountId, orderRef: fixture.orderRef });
    const approval = fixture.approval(inventory.inventorySha256);
    fixture.runtimeView.tenantIdOverride = "tenant_drift_after_confirmation_writes";
    fixture.runtimeView.tenantIdOverrideAtRead = fixture.runtimeView.tenantReadCount + 2;
    fixture.fault.active = true;
    fixture.fault.writeCount = 0;
    assertRejectedWithoutMutation(fixture, () => fixture.service.execute(approval), [
      "initial_confirmation_evidence_drift", "initial_confirmation_not_eligible"
    ]);
    fixture.fault.active = false;
    assert.ok(fixture.fault.writeCount > 0);
    assert.equal(fixture.readEffects().length, 0);
    assert.equal(fixture.readReceipts().length, 0);
    assert.equal(fixture.readOrder().fulfillment.status, "failed");
  } finally {
    await fixture.close();
  }
});

test("controlled initial confirmation replay rejects shape-valid canonical effect metadata tampering", async (t) => {
  for (const field of ["targetValidUntil", "tenantRef"]) {
    await t.test(field, async () => {
      const fixture = await readyConfirmationFixture();
      try {
        const inventory = fixture.service.prepare({ accountId: fixture.accountId, orderRef: fixture.orderRef });
        const approval = fixture.approval(inventory.inventorySha256);
        fixture.service.execute(approval);
        const [effect] = fixture.readEffects();
        const metadata = { ...effect.metadata };
        metadata[field] = field === "targetValidUntil"
          ? new Date(Date.parse(metadata.targetValidUntil) + 1).toISOString()
          : "tenantref_ffffffffffffffff";
        assert.equal(fixture.rawDatabase.prepare(`
          update platform_audit_events set metadata_json = ? where id = ?
        `).run(JSON.stringify(metadata), effect.id).changes, 1);
        assertRejectedWithoutMutation(fixture, () => fixture.service.execute(approval), [
          "initial_confirmation_evidence_drift", "initial_confirmation_not_eligible"
        ]);
        assert.equal(fixture.readReceipts().length, 1);
        assert.equal(fixture.readOrder().fulfillment.status, "delivered");
      } finally {
        await fixture.close();
      }
    });
  }
});

test("used initial confirmation schema cannot be removed and preserves the completed source transaction", async () => {
  const fixture = await readyConfirmationFixture();
  try {
    const inventory = fixture.service.prepare({ accountId: fixture.accountId, orderRef: fixture.orderRef });
    fixture.service.execute(fixture.approval(inventory.inventorySha256));
    const before = fixture.databaseSnapshot();
    const immutable = fixture.immutableSnapshot();
    const schemaSql = () => fixture.rawDatabase.prepare(`
      select type, name, tbl_name, sql from sqlite_master order by type, name
    `).all();
    const schemaBefore = schemaSql();
    const schemaVersion = fixture.rawDatabase.pragma("schema_version", { simple: true });
    assert.throws(() => commerceMigrations.removeUnusedCoinCommerceInitialConfirmationMigration({
      database: fixture.database,
      expectedMigrationId: commerceMigrations.REQUIRED_COIN_COMMERCE_INITIAL_CONFIRMATION_MIGRATION_ID,
      expectedDdlChecksum: commerceMigrations.COIN_COMMERCE_INITIAL_CONFIRMATION_MIGRATIONS[0].ddlChecksum,
      nowFn: () => new Date(fixture.now)
    }), (error) => error.code === "commerce_initial_confirmation_migration_in_use");
    assert.deepEqual(fixture.databaseSnapshot(), before);
    assert.deepEqual(fixture.immutableSnapshot(), immutable);
    assert.deepEqual(schemaSql(), schemaBefore);
    assert.equal(fixture.rawDatabase.pragma("schema_version", { simple: true }), schemaVersion);
    assert.equal(fixture.readOrder().paymentStatus, "captured");
    assert.equal(fixture.readOrder().fulfillment.status, "delivered");
    assert.equal(fixture.readEffects().length, 1);
    assert.equal(fixture.readReceipts().length, 1);
  } finally {
    await fixture.close();
  }
});

test("controlled initial confirmation refuses the old schema before any write", async () => {
  const fixture = await createFailedInitialFixture();
  try {
    const before = fixture.databaseSnapshot();
    const api = await confirmationApi();
    assert.throws(() => {
      const service = api.createCoinCommerceInitialConfirmation({
        database: fixture.database,
        commerceStore: fixture.commerceStore,
        runtimeCore: fixture.observedRuntimeCore,
        nowFn: () => new Date(fixture.now)
      });
      service.prepare({ accountId: fixture.accountId, orderRef: fixture.orderRef });
    }, (error) => error.code === "initial_confirmation_schema_not_ready");
    assert.deepEqual(fixture.databaseSnapshot(), before);
  } finally {
    await fixture.close();
  }
});
