import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import { COIN_COMMERCE_PRODUCTION_OFFERS } from "../services/platform/coin-commerce-production-catalog.mjs";
import { createCoinCommerceCoordinator } from "../services/platform/coin-commerce-coordinator.mjs";
import { applyCoinCommerceMigrations, COIN_COMMERCE_MIGRATIONS, REQUIRED_COIN_COMMERCE_MIGRATION_ID } from "../services/platform/coin-commerce-migrations.mjs";
import { createSqliteCoinCommerceStore } from "../services/platform/coin-commerce-store.mjs";
import { createCoinCommerceProductionSubscriptionFulfillment } from "../services/platform/coin-commerce-production-subscription-fulfillment.mjs";
import { applyPlanSwitchMigrations, rollbackPlanSwitchMigrations, PLAN_SWITCH_MIGRATIONS, REQUIRED_PLAN_SWITCH_MIGRATION_ID } from "../services/platform/coin-commerce-plan-switch-migrations.mjs";
import { createPlanSwitchReader } from "../services/platform/coin-commerce-plan-switch-runtime.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { applyCoinWalletMigrations, COIN_WALLET_MIGRATIONS, REQUIRED_COIN_WALLET_MIGRATION_ID } from "../services/platform/coin-wallet-migrations.mjs";
import { createSubscriptionCore } from "../services/subscriptions/core.mjs";
import { createSqliteSubscriptionStore } from "../services/subscriptions/repository.mjs";

const NOW = "2026-08-01T00:00:00.000Z";
const VALID_FROM = "2026-07-17T00:00:00.000Z";
const VALID_UNTIL = "2026-08-16T00:00:00.000Z";
const DAY_MS = 86_400_000;
const [BASIC, PLUS, YEARLY] = COIN_COMMERCE_PRODUCTION_OFFERS;
const ACCOUNT = "acct_rollback_compatibility";
const ENTITLEMENT = "ent_rollback_compatibility";
const REQUEST = "pareq_rollback_compatibility";
const TENANT = "tenant_rollback_compatibility";
const ARTIFACT = "artifact_rollback_compatibility";

function issuedRef(prefix, value) {
  return `${prefix}ref_${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

function clockDatabase(database, clock) {
  return new Proxy(database, {
    get(target, property) {
      if (property === "prepare") return (sql) => {
        if (/select\s+strftime\('%Y-%m-%dT%H:%M:%fZ',\s*'now'\)/i.test(sql)) {
          return { pluck: () => ({ get: () => clock.value }) };
        }
        return target.prepare(sql);
      };
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}

// Fresh, synthetic control and runtime databases. No old-release module is
// substituted: this fixture certifies the retained compatibility reader only.
function openFixture() {
  const directory = mkdtempSync(join(tmpdir(), "plan-switch-rollback-compatibility-"));
  const controlPath = join(directory, "control.sqlite");
  const runtimePath = join(directory, "runtime.sqlite");
  const clock = { value: NOW };
  const nowFn = () => new Date(clock.value);
  let controlStore = createSqliteSubscriptionControlStore({ dbPath: controlPath });
  let runtimeStore = createSqliteSubscriptionStore({ dbPath: runtimePath });
  const database = new Database(controlPath);
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 2000");
  const migrationInput = {
    database,
    expectedMigrationId: REQUIRED_PLAN_SWITCH_MIGRATION_ID,
    expectedDdlChecksum: PLAN_SWITCH_MIGRATIONS[0].ddlChecksum
  };
  applyCoinWalletMigrations({ database, expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum, nowFn });
  applyCoinCommerceMigrations({ database, expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum, nowFn });
  applyPlanSwitchMigrations({ ...migrationInput, nowFn });
  controlStore.createAccount({ id: ACCOUNT, ownerRef: "owner_synthetic", status: "active", createdAt: NOW, updatedAt: NOW });
  controlStore.createEntitlement({ id: ENTITLEMENT, accountId: ACCOUNT, plan: BASIC.offerVersionRef,
    status: "active", validFrom: VALID_FROM, validUntil: VALID_UNTIL, maxArtifacts: 1,
    maxDevices: 2, trafficLimitBytes: 50 * 1024 ** 3, createdAt: NOW, updatedAt: NOW });
  controlStore.createIssuanceRequest({ id: REQUEST, accountId: ACCOUNT, entitlementId: ENTITLEMENT,
    approvalRef: "approval_synthetic", status: "issued", quantity: 1, nodeId: "channel-vultr-a-tuic",
    purpose: "portal_access_request", requestedByRef: "operator_synthetic", createdAt: NOW, updatedAt: NOW });
  controlStore.linkIssuedSubscription({ id: "link_synthetic", requestId: REQUEST,
    tenantRef: issuedRef("tenant", TENANT), artifactRef: issuedRef("artifact", ARTIFACT),
    status: "active", createdAt: NOW, updatedAt: NOW });
  const proxyConfig = { servers: [{ id: "node_synthetic", name: "synthetic-node", region: "Test",
    host: "203.0.113.10", port: 18388, method: "aes-256-gcm", password: "synthetic-only" }], pingHosts: [], nginx: {} };
  function openRuntime() {
    return createSubscriptionCore({ store: runtimeStore, proxyConfig,
      publicSubscriptionBaseUrl: "https://gateway.example.test", nowFn,
      idFactory: () => TENANT, artifactIdFactory: () => ARTIFACT });
  }
  let runtimeCore = openRuntime();
  runtimeCore.createTenant({ displayName: "Synthetic rollback", nodeId: "synthetic-node", expiresAt: VALID_UNTIL, note: "" });
  runtimeCore.createSubscriptionArtifact(TENANT);
  controlStore.upsertPortalAccessRequest({ id: REQUEST, portalUserRef: ACCOUNT, plan: "monthly", clientTarget: "clash",
    durationDays: 30, quantity: 1, status: "delivered", nextAction: "user_can_use_access", noteProvided: false,
    priorTrialState: "not_applicable", submittedAt: VALID_FROM, updatedAt: NOW, reviewedAt: NOW,
    reviewedByRef: "operator_synthetic", expiresAt: VALID_UNTIL, validUntil: VALID_UNTIL,
    entitlementRef: ENTITLEMENT, accessGrantRef: "grant_synthetic", tenantId: TENANT, artifactId: ARTIFACT,
    edgeChannelRef: "channel-vultr-a-tuic", edgeCredentialRef: "edgecred_synthetic", edgeMaterialDigest: "sha256:synthetic" });
  let store;
  let coordinator;
  let handler;
  let refIndex = 0;
  function startCommerce(planSwitchEnabled) {
    const fulfillment = createCoinCommerceProductionSubscriptionFulfillment({ controlStore, runtimeCore,
      accountActivationReader: () => true, planSwitchEnabled, nowFn });
    handler = fulfillment.fulfillmentHandler;
    store = createSqliteCoinCommerceStore({ database: clockDatabase(database, clock), discountReader: () => 0,
      commerceRefFactory: (kind) => `${kind}_rollback_${++refIndex}`,
      purchaseEligibilityReader: fulfillment.purchaseEligibilityReader,
      storefrontEligibilityReader: fulfillment.storefrontEligibilityReader,
      ...(planSwitchEnabled ? { planSwitchEnabled: true, planSwitchReader: createPlanSwitchReader({ controlStore, authorityEnabled: false }) } : {}) });
    store.bootstrapPublishedOffers(COIN_COMMERCE_PRODUCTION_OFFERS);
    coordinator = createCoinCommerceCoordinator({ store, fulfillmentHandler: handler, nowFn,
      scheduleFn: () => 0, clearScheduleFn: () => {} });
  }
  startCommerce(true);
  store.walletStore.creditCoins({ accountId: ACCOUNT, coinType: "paid_coins", amountUnits: 1000,
    availability: "available", sourceType: "synthetic_seed", sourceRef: "source_synthetic", sourceDigest: "a".repeat(64),
    policyRef: null, policyVersion: null, expiresAt: null, operation: { actorScope: "system:rollback-test",
      idempotencyKey: "seed", actorType: "system", actorRef: "synthetic_test" } });
  return {
    database,
    quote(offer) { return store.createCheckoutQuote({ accountId: ACCOUNT, offerRef: offer.offerRef }); },
    confirm(quote, idempotencyKey) {
      return store.confirmOrder({ accountId: ACCOUNT, quoteRef: quote.quoteRef, operation: {
        actorScope: `portal:${ACCOUNT}`, idempotencyKey, actorType: "portal_user", actorRef: ACCOUNT } });
    },
    async tick() { clock.value = new Date(Date.parse(clock.value) + 4000).toISOString(); return coordinator.runOnce(); },
    order(orderRef) { return store.getOrder({ accountId: ACCOUNT, orderRef }); },
    entitlement() { return controlStore.getEntitlement(ENTITLEMENT); },
    runtimeExpiry() { return runtimeCore.getTenant(TENANT).expiresAt; },
    restartFlagOff({ removeSchema }) {
      store.close();
      controlStore.close();
      runtimeStore.close();
      if (removeSchema) assert.equal(rollbackPlanSwitchMigrations(migrationInput).sourceChanged, true);
      controlStore = createSqliteSubscriptionControlStore({ dbPath: controlPath, initializeSchema: false });
      runtimeStore = createSqliteSubscriptionStore({ dbPath: runtimePath });
      runtimeCore = openRuntime();
      startCommerce(false);
    },
    replay(orderRef) {
      const command = database.prepare("select * from platform_coin_commerce_fulfillment_commands where order_ref = ?").get(orderRef);
      return handler.execute({ commandRef: command.command_ref, orderRef, accountId: ACCOUNT, ...JSON.parse(command.payload_json) });
    },
    close() {
      try { store?.close(); } finally {
        try { controlStore.close(); } finally {
          try { runtimeStore.close(); } finally {
            database.close();
            rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
          }
        }
      }
    }
  };
}

for (const [kind, offer] of [["upgrade_inplace", PLUS], ["upgrade_restart", YEARLY]]) {
  for (const removeSchema of [false, true]) {
    test(`${kind}: compatible flag-off renewal preserves audit history ${removeSchema ? "after additive schema rollback" : "with additive schema retained"}`, async () => {
      const h = openFixture();
      try {
        const quote = h.quote(offer);
        assert.equal(quote.planSwitch.kind, kind);
        const upgrade = h.confirm(quote, "upgrade");
        await h.tick();
        assert.equal(h.order(upgrade.orderRef).paymentStatus, "captured");
        const before = h.entitlement();
        assert.equal(before.plan, offer.offerVersionRef);
        assert.equal(before.validFrom, VALID_FROM);
        const audit = h.database.prepare("select * from platform_audit_events where entity_type = 'coin_commerce_subscription_fulfillment'").all();
        assert.equal(audit.length, 1);
        assert.equal(JSON.parse(audit[0].metadata_json).switchKind, kind);
        const ledger = h.database.prepare("select * from platform_coin_ledger_entries order by rowid").all();
        const orders = h.database.prepare("select * from platform_coin_commerce_orders order by rowid").all();
        assert.equal(h.database.prepare("select count(*) from platform_coin_commerce_fulfillment_commands where status <> 'delivered'").pluck().get(), 0);
        assert.equal(h.database.prepare("select count(*) from platform_scheduled_plan_switches where status in ('scheduled', 'applying')").pluck().get(), 0);

        h.restartFlagOff({ removeSchema });
        assert.equal(h.database.prepare("select count(*) from sqlite_master where type = 'table' and name in ('platform_coin_commerce_plan_switch_quotes', 'platform_scheduled_plan_switches')").pluck().get(), removeSchema ? 0 : 2);
        assert.deepEqual(h.database.prepare("select * from platform_audit_events where entity_type = 'coin_commerce_subscription_fulfillment'").all(), audit);
        assert.deepEqual(h.database.prepare("select * from platform_coin_ledger_entries order by rowid").all(), ledger);
        assert.deepEqual(h.database.prepare("select * from platform_coin_commerce_orders order by rowid").all(), orders);
        const renewalQuote = h.quote(offer);
        assert.equal(Object.hasOwn(renewalQuote, "planSwitch"), false);
        assert.equal(renewalQuote.amountUnits, offer.baseCoinUnits);
        const renewal = h.confirm(renewalQuote, "ordinary_after_rollback");
        await h.tick();
        assert.equal(h.order(renewal.orderRef).paymentStatus, "captured");
        const expectedExpiry = new Date(Date.parse(before.validUntil) + offer.delivery.durationDays * DAY_MS).toISOString();
        assert.equal(h.entitlement().validUntil, expectedExpiry);
        assert.equal(h.entitlement().validFrom, VALID_FROM);
        assert.equal(h.entitlement().trafficLimitBytes, before.trafficLimitBytes);
        assert.equal(h.runtimeExpiry(), expectedExpiry);
        assert.equal(h.replay(renewal.orderRef).status, "delivered");
        assert.equal(h.entitlement().validUntil, expectedExpiry);
        const afterAudit = h.database.prepare("select * from platform_audit_events where entity_type = 'coin_commerce_subscription_fulfillment' order by rowid").all();
        assert.equal(afterAudit.length, 2);
        assert.deepEqual(afterAudit[0], audit[0]);
        assert.equal(Object.hasOwn(JSON.parse(afterAudit[1].metadata_json), "switchKind"), false);
        assert.deepEqual(h.database.prepare("select * from platform_coin_ledger_entries order by rowid").all().slice(0, ledger.length), ledger);
        assert.deepEqual(h.database.prepare("select status from platform_coin_commerce_fulfillment_commands order by rowid").all(), [{ status: "delivered" }, { status: "delivered" }]);
        assert.equal(h.database.prepare("select count(*) from platform_coin_holds where status = 'captured'").pluck().get(), 2);
      } finally { h.close(); }
    });
  }
}
