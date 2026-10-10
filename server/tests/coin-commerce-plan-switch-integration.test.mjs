import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  COIN_COMMERCE_PRODUCTION_OFFERS
} from "../services/platform/coin-commerce-production-catalog.mjs";
import {
  createCoinCommerceCoordinator
} from "../services/platform/coin-commerce-coordinator.mjs";
import {
  applyCoinCommerceMigrations,
  COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID
} from "../services/platform/coin-commerce-migrations.mjs";
import {
  createSqliteCoinCommerceStore
} from "../services/platform/coin-commerce-store.mjs";
import {
  createCoinCommerceProductionSubscriptionFulfillment
} from "../services/platform/coin-commerce-production-subscription-fulfillment.mjs";
import { createRuntimeState } from "../state.mjs";
import { buildSourceValidationTestEnvironment } from "../../scripts/source-validation-test-runner.mjs";
import {
  PLAN_SWITCH_ERROR,
  computeSwitchCharge
} from "../services/platform/coin-commerce-plan-switch-policy.mjs";
import {
  applyPlanSwitchMigrations,
  PLAN_SWITCH_MIGRATIONS,
  REQUIRED_PLAN_SWITCH_MIGRATION_ID
} from "../services/platform/coin-commerce-plan-switch-migrations.mjs";
import {
  applyDueScheduledPlanSwitches,
  createPlanSwitchReader,
  planSwitchDueCommandRef
} from "../services/platform/coin-commerce-plan-switch-runtime.mjs";
import {
  createSqliteSubscriptionControlStore
} from "../services/platform/subscription-control-db.mjs";
import {
  applyCoinWalletMigrations,
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID
} from "../services/platform/coin-wallet-migrations.mjs";
import { usageCycleForBinding } from "../services/platform/usage-billing-cycle.mjs";
import { createSubscriptionCore } from "../services/subscriptions/core.mjs";
import { createSqliteSubscriptionStore } from "../services/subscriptions/repository.mjs";
import { hashSubscriptionToken } from "../services/subscriptions/tokens.mjs";

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const DAY_MS = 86_400_000;
const CLOCK = "2026-08-01T00:00:00.000Z";
const VALID_FROM = "2026-07-17T00:00:00.000Z";
const VALID_UNTIL = "2026-08-16T00:00:00.000Z";
const REMAINING_MS = Date.parse(VALID_UNTIL) - Date.parse(CLOCK);
const GIB = 1024 ** 3;
const BASIC = COIN_COMMERCE_PRODUCTION_OFFERS[0];
const PLUS = COIN_COMMERCE_PRODUCTION_OFFERS[1];
const YEARLY = COIN_COMMERCE_PRODUCTION_OFFERS[2];

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function removeTempDir(dir) {
  let lastError;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      if (!["EPERM", "EBUSY", "ENOTEMPTY"].includes(error?.code)) throw error;
      sleepMs(100);
    }
  }
  if (process.platform === "win32" && ["EPERM", "EBUSY"].includes(lastError?.code)) {
    return;
  }
  throw lastError;
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

function safeIssuedRef(prefix, value) {
  return `${prefix}ref_${createHash("sha256").update(String(value)).digest("hex").slice(0, 16)}`;
}

function sampleProxyConfig() {
  return {
    servers: [{
      id: "node_sg",
      name: "vultr-singapore",
      region: "Singapore",
      host: "203.0.113.10",
      port: 18388,
      method: "aes-256-gcm",
      password: "synthetic-shared-secret"
    }],
    pingHosts: [],
    nginx: {}
  };
}

function openHarness({
  planSwitchEnabled = true,
  authorityEnabled = false,
  plan = PLUS.offerVersionRef,
  trafficGb = 100,
  validFrom = VALID_FROM,
  validUntil = VALID_UNTIL
} = {}) {
  const directory = mkdtempSync(join(tmpdir(), "plan-switch-integration-"));
  const controlDbPath = join(directory, "control.sqlite");
  const runtimeDbPath = join(directory, "runtime.sqlite");
  const clock = { value: CLOCK };
  const accountId = "acct_plan_switch";
  const requestRef = "pareq_plan_switch";
  const entitlementRef = "ent_plan_switch";
  const tenantId = "tenant_plan_switch";
  const artifactId = "artifact_plan_switch";
  let controlStore = createSqliteSubscriptionControlStore({ dbPath: controlDbPath });
  const database = new Database(controlDbPath);
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 2000");
  const nowFn = () => new Date(clock.value);
  applyCoinWalletMigrations({
    database,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn
  });
  applyCoinCommerceMigrations({
    database,
    expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
    nowFn
  });
  applyPlanSwitchMigrations({
    database,
    expectedMigrationId: REQUIRED_PLAN_SWITCH_MIGRATION_ID,
    expectedDdlChecksum: PLAN_SWITCH_MIGRATIONS[0].ddlChecksum,
    nowFn
  });
  controlStore.createAccount({
    id: accountId,
    ownerRef: "owner_plan_switch",
    status: "active",
    createdAt: CLOCK,
    updatedAt: CLOCK
  });
  controlStore.createEntitlement({
    id: entitlementRef,
    accountId,
    plan,
    status: "active",
    validFrom,
    validUntil,
    maxArtifacts: 1,
    maxDevices: 2,
    trafficLimitBytes: trafficGb * GIB,
    createdAt: CLOCK,
    updatedAt: CLOCK
  });
  controlStore.createIssuanceRequest({
    id: requestRef,
    accountId,
    entitlementId: entitlementRef,
    approvalRef: "approval_plan_switch",
    status: "issued",
    quantity: 1,
    nodeId: "channel-vultr-a-tuic",
    purpose: "portal_access_request",
    requestedByRef: "operator_plan_switch",
    createdAt: CLOCK,
    updatedAt: CLOCK
  });
  controlStore.linkIssuedSubscription({
    id: "link_plan_switch",
    requestId: requestRef,
    tenantRef: safeIssuedRef("tenant", tenantId),
    artifactRef: safeIssuedRef("artifact", artifactId),
    status: "active",
    createdAt: CLOCK,
    updatedAt: CLOCK
  });
  const runtimeStore = createSqliteSubscriptionStore({ dbPath: runtimeDbPath });
  const runtimeCore = createSubscriptionCore({
    store: runtimeStore,
    proxyConfig: sampleProxyConfig(),
    publicSubscriptionBaseUrl: "https://gateway.example.test",
    nowFn,
    tokenFactory() {
      const rawToken = "pgsub_synthetic_plan_switch_token";
      return {
        rawToken,
        tokenHash: hashSubscriptionToken(rawToken),
        tokenPrefix: rawToken.slice(0, 14)
      };
    },
    artifactSecretFactory: () => "synthetic_plan_switch_artifact",
    idFactory: () => tenantId,
    artifactIdFactory: () => artifactId
  });
  runtimeCore.createTenant({
    displayName: "Synthetic Plan Switch",
    nodeId: "vultr-singapore",
    expiresAt: validUntil,
    note: ""
  });
  runtimeCore.createSubscriptionArtifact(tenantId);
  controlStore.upsertPortalAccessRequest({
    id: requestRef,
    portalUserRef: accountId,
    plan: "monthly",
    clientTarget: "clash",
    durationDays: 30,
    quantity: 1,
    status: "delivered",
    nextAction: "user_can_use_access",
    noteProvided: false,
    priorTrialState: "not_applicable",
    submittedAt: validFrom,
    updatedAt: CLOCK,
    reviewedAt: CLOCK,
    reviewedByRef: "operator_plan_switch",
    expiresAt: validUntil,
    validUntil,
    entitlementRef,
    accessGrantRef: "grant_plan_switch",
    tenantId,
    artifactId,
    edgeChannelRef: "channel-vultr-a-tuic",
    edgeCredentialRef: "edgecred_plan_switch",
    edgeMaterialDigest: "sha256:synthetic_plan_switch"
  });
  const fulfillment = createCoinCommerceProductionSubscriptionFulfillment({
    controlStore,
    runtimeCore,
    accountActivationReader: () => true,
    nowFn,
    ...(planSwitchEnabled ? { planSwitchEnabled: true } : {})
  });
  const store = createSqliteCoinCommerceStore({
    database: fixedClockDatabase(database, clock),
    commerceRefFactory: (() => {
      const counts = new Map();
      return (kind) => {
        const count = (counts.get(kind) ?? 0) + 1;
        counts.set(kind, count);
        return `${kind}_${count}`;
      };
    })(),
    discountReader: () => 0,
    purchaseEligibilityReader: fulfillment.purchaseEligibilityReader,
    storefrontEligibilityReader: fulfillment.storefrontEligibilityReader,
    ...(planSwitchEnabled
      ? {
        planSwitchEnabled: true,
        planSwitchReader: createPlanSwitchReader({
          controlStore,
          authorityEnabled
        }),
        planSwitchApplyDue: (nowIso) => applyDueScheduledPlanSwitches({
          controlStore,
          execute: fulfillment.fulfillmentHandler.execute,
          nowIso
        })
      }
      : {})
  });
  store.bootstrapPublishedOffers(COIN_COMMERCE_PRODUCTION_OFFERS);
  store.walletStore.creditCoins({
    accountId,
    coinType: "paid_coins",
    amountUnits: 500,
    availability: "available",
    sourceType: "synthetic_seed",
    sourceRef: "source_plan_switch",
    sourceDigest: "a".repeat(64),
    policyRef: null,
    policyVersion: null,
    expiresAt: null,
    operation: {
      actorScope: "system:plan-switch-test",
      idempotencyKey: "credit_plan_switch",
      actorType: "system",
      actorRef: "plan_switch_test"
    }
  });
  const coordinator = createCoinCommerceCoordinator({
    store,
    fulfillmentHandler: fulfillment.fulfillmentHandler,
    nowFn,
    scheduleFn: () => 0,
    clearScheduleFn: () => {}
  });
  return {
    accountId,
    entitlementRef,
    clock,
    database,
    controlStore,
    runtimeCore,
    store,
    fulfillment,
    coordinator,
    quote(offerRef) {
      return store.createCheckoutQuote({ accountId, offerRef });
    },
    confirm(quote, key) {
      return store.confirmOrder({
        accountId,
        quoteRef: quote.quoteRef,
        operation: {
          actorScope: `portal:${accountId}`,
          idempotencyKey: key,
          actorType: "portal_user",
          actorRef: accountId
        }
      });
    },
    async deliver() {
      clock.value = new Date(Date.parse(clock.value) + 4_000).toISOString();
      return coordinator.runOnce();
    },
    entitlement() {
      return controlStore.getEntitlement(entitlementRef);
    },
    scheduledRows() {
      return database.prepare(`
        select * from platform_scheduled_plan_switches order by switch_ref
      `).all();
    },
    close() {
      try { store.close(); } catch { /* close the owned stores next */ }
      try { controlStore.close(); } catch { /* temp directory cleanup follows */ }
      try { runtimeStore.close(); } catch { /* temp directory cleanup follows */ }
      try { database.close(); } catch { /* temp directory cleanup follows */ }
      removeTempDir(directory);
    }
  };
}

function expectCommerceCode(action, code) {
  assert.throws(action, (error) => {
    assert.equal(error?.code, code);
    return true;
  });
}

test("monthly card plan switch server integration", { concurrency: false }, async (t) => {
  await t.test("flag off keeps same-plan pricing and rejects a different live plan", () => {
    const harness = openHarness({ planSwitchEnabled: false, plan: BASIC.offerVersionRef, trafficGb: 50 });
    try {
      assert.equal(
        harness.fulfillment.purchaseEligibilityReader({
          accountId: harness.accountId,
          offerVersionRef: PLUS.offerVersionRef
        }),
        false
      );
      const renewal = harness.quote(BASIC.offerRef);
      assert.equal(renewal.amountUnits, BASIC.baseCoinUnits);
      assert.equal(Object.hasOwn(renewal, "planSwitch"), false);
      assert.equal(harness.database.prepare(`
        select count(*) from platform_coin_commerce_plan_switch_quotes
      `).pluck().get(), 0);
      expectCommerceCode(
        () => harness.quote(PLUS.offerRef),
        "offer_unavailable"
      );
    } finally {
      harness.close();
    }
  });

  await t.test("old renewal chains still extend without a switchKind metadata key", () => {
    const harness = openHarness({
      planSwitchEnabled: false,
      plan: BASIC.offerVersionRef,
      trafficGb: 50
    });
    try {
      const first = harness.fulfillment.fulfillmentHandler.execute({
        commandRef: "coincmd_old_chain_1",
        orderRef: "coinord_old_chain_1",
        accountId: harness.accountId,
        offerVersionRef: BASIC.offerVersionRef,
        delivery: { ...BASIC.delivery }
      });
      const second = harness.fulfillment.fulfillmentHandler.execute({
        commandRef: "coincmd_old_chain_2",
        orderRef: "coinord_old_chain_2",
        accountId: harness.accountId,
        offerVersionRef: BASIC.offerVersionRef,
        delivery: { ...BASIC.delivery }
      });
      assert.equal(first.status, "delivered");
      assert.equal(second.status, "delivered");
      assert.equal(
        harness.entitlement().validUntil,
        new Date(Date.parse(VALID_UNTIL) + 60 * DAY_MS).toISOString()
      );
      const metadata = harness.database.prepare(`
        select metadata_json from platform_audit_events
         where action = 'subscription_fulfillment_applied'
      `).all().map((row) => JSON.parse(row.metadata_json));
      assert.equal(metadata.length, 2);
      assert.equal(metadata.every((entry) => !Object.hasOwn(entry, "switchKind")), true);
    } finally {
      harness.close();
    }
  });

  await t.test("in-place upgrade charges the prorated difference and preserves used bytes", async () => {
    const harness = openHarness({ plan: BASIC.offerVersionRef, trafficGb: 50 });
    try {
      harness.controlStore.recordUsageSample({
        id: "usage_plan_switch_1",
        sourceRef: "source_plan_switch",
        channelRef: "channel-vultr-a-tuic",
        edgeCredentialRef: "edgecred_plan_switch",
        accountId: harness.accountId,
        entitlementId: harness.entitlementRef,
        requestId: "pareq_plan_switch",
        observedAt: "2026-07-20T12:00:00.000Z",
        intervalStartedAt: "2026-07-20T11:00:00.000Z",
        intervalEndedAt: "2026-07-20T12:00:00.000Z",
        uploadBytes: 1000,
        downloadBytes: 2000,
        totalBytes: 3000,
        sampleDigest: "digest_plan_switch_1",
        createdAt: "2026-07-20T12:00:01.000Z"
      });
      const before = harness.entitlement();
      const usedBefore = usedBytes(harness, before);
      const expected = computeSwitchCharge({
        kind: "upgrade_inplace",
        fromOfferVersionRef: BASIC.offerVersionRef,
        toOfferVersionRef: PLUS.offerVersionRef,
        remainingMs: REMAINING_MS,
        pendingCreditUnits: 0
      });
      assert.equal(expected.ok, true);
      assert.equal(expected.chargeUnits, 5);
      const quote = harness.quote(PLUS.offerRef);
      assert.equal(quote.amountUnits, expected.chargeUnits);
      assert.equal(quote.planSwitch.kind, "upgrade_inplace");
      assert.equal(quote.planSwitch.chargeUnits, 5);
      assert.equal(quote.planSwitch.creditUnits, 5);
      assert.equal(quote.planSwitch.effectiveAt, null);
      assert.equal(quote.planSwitch.cancelsPendingDowngrade, false);
      const upgradeOrder = harness.confirm(quote, "confirm_upgrade");
      assert.equal(upgradeOrder.planSwitch.kind, "upgrade_inplace");
      assert.equal(upgradeOrder.planSwitch.chargeUnits, 5);
      const summary = await harness.deliver();
      assert.equal(summary.commandsDelivered, 1, JSON.stringify(summary));
      const after = harness.entitlement();
      assert.equal(after.plan, PLUS.offerVersionRef);
      assert.equal(after.validFrom, before.validFrom);
      assert.equal(after.validUntil, before.validUntil);
      assert.equal(after.trafficLimitBytes, 100 * GIB);
      assert.equal(usedBytes(harness, after), usedBefore);
      assert.equal(usedBefore, 3000);
      const metadata = JSON.parse(harness.database.prepare(`
        select metadata_json from platform_audit_events
         where action = 'subscription_fulfillment_applied'
      `).pluck().get());
      assert.equal(metadata.switchKind, "upgrade_inplace");
      const replay = harness.fulfillment.fulfillmentHandler.execute(
        latestCommand(harness)
      );
      assert.equal(replay.status, "delivered");
      assert.equal(harness.entitlement().validUntil, before.validUntil);
      const renewal = harness.quote(PLUS.offerRef);
      assert.equal(renewal.amountUnits, PLUS.baseCoinUnits);
      harness.confirm(renewal, "confirm_renewal_after_upgrade");
      const renewed = await harness.deliver();
      assert.equal(renewed.commandsDelivered, 1, JSON.stringify(renewed));
      assert.equal(harness.entitlement().validFrom, before.validFrom);
      assert.equal(
        harness.entitlement().validUntil,
        new Date(Date.parse(before.validUntil) + 30 * DAY_MS).toISOString()
      );
    } finally {
      harness.close();
    }
  });

  await t.test("yearly upgrade restarts the term, keeps validFrom, and renews from there", async () => {
    const harness = openHarness({ plan: BASIC.offerVersionRef, trafficGb: 50 });
    try {
      const expected = computeSwitchCharge({
        kind: "upgrade_restart",
        fromOfferVersionRef: BASIC.offerVersionRef,
        toOfferVersionRef: YEARLY.offerVersionRef,
        remainingMs: REMAINING_MS,
        pendingCreditUnits: 0
      });
      assert.equal(expected.ok, true);
      assert.equal(expected.chargeUnits, 190);
      const before = harness.entitlement();
      const quote = harness.quote(YEARLY.offerRef);
      assert.equal(quote.amountUnits, 190);
      harness.confirm(quote, "confirm_yearly_upgrade");
      const summary = await harness.deliver();
      assert.equal(summary.commandsDelivered, 1, JSON.stringify(summary));
      const restartedUntil = new Date(Date.parse(CLOCK) + 4_000 + 365 * DAY_MS).toISOString();
      const after = harness.entitlement();
      assert.equal(after.plan, YEARLY.offerVersionRef);
      assert.equal(after.validFrom, before.validFrom);
      assert.equal(after.validUntil, restartedUntil);
      assert.equal(after.trafficLimitBytes, 200 * GIB);
      const metadata = JSON.parse(harness.database.prepare(`
        select metadata_json from platform_audit_events
         where action = 'subscription_fulfillment_applied'
      `).pluck().get());
      assert.equal(metadata.switchKind, "upgrade_restart");
      assert.equal(metadata.validFrom, before.validFrom);
      const renewal = harness.quote(YEARLY.offerRef);
      assert.equal(renewal.amountUnits, YEARLY.baseCoinUnits);
      harness.confirm(renewal, "confirm_yearly_renewal");
      const renewed = await harness.deliver();
      assert.equal(renewed.commandsDelivered, 1, JSON.stringify(renewed));
      assert.equal(harness.entitlement().validFrom, before.validFrom);
      assert.equal(
        harness.entitlement().validUntil,
        new Date(Date.parse(restartedUntil) + 365 * DAY_MS).toISOString()
      );
    } finally {
      harness.close();
    }
  });

  await t.test("cancel inside the window leaves no scheduled downgrade", () => {
    const harness = openHarness();
    try {
      const before = harness.entitlement();
      const quote = harness.quote(BASIC.offerRef);
      assert.equal(quote.amountUnits, BASIC.baseCoinUnits);
      const order = harness.confirm(quote, "confirm_downgrade_cancel");
      const cancelled = harness.store.cancelOrder({
        accountId: harness.accountId,
        orderRef: order.orderRef,
        operation: {
          actorScope: `portal:${harness.accountId}`,
          idempotencyKey: "cancel_downgrade",
          actorType: "portal_user",
          actorRef: harness.accountId
        }
      });
      assert.equal(cancelled.paymentStatus, "cancelled");
      assert.equal(harness.scheduledRows().length, 0);
      const after = harness.entitlement();
      assert.equal(after.plan, PLUS.offerVersionRef);
      assert.equal(after.validFrom, before.validFrom);
      assert.equal(after.validUntil, before.validUntil);
      assert.equal(after.trafficLimitBytes, before.trafficLimitBytes);
      assert.equal(harness.database.prepare(`
        select count(*) from platform_coin_commerce_fulfillment_commands
      `).pluck().get(), 0);
      assert.equal(harness.database.prepare(`
        select count(*) from platform_scheduled_plan_switches
      `).pluck().get(), 0);
    } finally {
      harness.close();
    }
  });

  await t.test("confirm rejects a drifted entitlement snapshot and does not cancel early", async () => {
    const harness = openHarness();
    try {
      const quote = harness.quote(BASIC.offerRef);
      harness.database.prepare(`
        update platform_entitlements set valid_until = ? where id = ?
      `).run("2026-08-20T00:00:00.000Z", harness.entitlementRef);
      expectCommerceCode(
        () => harness.confirm(quote, "confirm_drift"),
        PLAN_SWITCH_ERROR.STATE_CHANGED
      );
      const stable = openHarness();
      try {
        const downgrade = stable.quote(BASIC.offerRef);
        stable.confirm(downgrade, "confirm_downgrade");
        assert.equal((await stable.deliver()).commandsDelivered, 1);
        assert.equal(stable.scheduledRows()[0].status, "scheduled");
        assert.equal(stable.entitlement().plan, PLUS.offerVersionRef);
        const renewal = stable.quote(PLUS.offerRef);
        const expected = computeSwitchCharge({
          kind: "renewal",
          fromOfferVersionRef: PLUS.offerVersionRef,
          toOfferVersionRef: PLUS.offerVersionRef,
          remainingMs: Date.parse(VALID_UNTIL) - Date.parse(stable.clock.value),
          pendingCreditUnits: 20
        });
        assert.equal(renewal.amountUnits, expected.chargeUnits);
        assert.equal(expected.chargeUnits, 10);
        const renewalOrder = stable.confirm(renewal, "confirm_renewal_keeps_downgrade");
        assert.equal(stable.scheduledRows()[0].status, "scheduled");
        assert.equal((await stable.deliver()).commandsDelivered, 1);
        const row = stable.scheduledRows()[0];
        assert.equal(row.status, "superseded");
        assert.equal(row.superseded_by_order_ref, renewalOrder.orderRef);
        assert.equal(stable.entitlement().plan, PLUS.offerVersionRef);
      } finally {
        stable.close();
      }
    } finally {
      harness.close();
    }
  });

  await t.test("a due downgrade applies on the expired-plan path and blocks quotes until then", async () => {
    const harness = openHarness();
    try {
      const quote = harness.quote(BASIC.offerRef);
      harness.confirm(quote, "confirm_due_downgrade");
      assert.equal((await harness.deliver()).commandsDelivered, 1);
      assert.equal(harness.entitlement().plan, PLUS.offerVersionRef);
      harness.clock.value = VALID_UNTIL;
      expectCommerceCode(
        () => harness.quote(BASIC.offerRef),
        PLAN_SWITCH_ERROR.APPLICATION_PENDING
      );
      const applied = await harness.coordinator.runOnce();
      assert.equal(applied.commandsDelivered, 0, JSON.stringify(applied));
      const entitlement = harness.entitlement();
      assert.equal(entitlement.plan, BASIC.offerVersionRef);
      assert.equal(entitlement.validFrom, VALID_UNTIL);
      assert.equal(
        entitlement.validUntil,
        new Date(Date.parse(VALID_UNTIL) + 30 * DAY_MS).toISOString()
      );
      assert.equal(entitlement.trafficLimitBytes, 50 * GIB);
      assert.equal(harness.scheduledRows()[0].status, "applied");
      const appliedUntil = entitlement.validUntil;
      const replay = harness.fulfillment.fulfillmentHandler.execute({
        commandRef: planSwitchDueCommandRef(harness.scheduledRows()[0].switch_ref),
        orderRef: harness.scheduledRows()[0].switch_ref,
        accountId: harness.accountId,
        offerVersionRef: BASIC.offerVersionRef,
        delivery: { ...BASIC.delivery }
      });
      assert.equal(replay.status, "delivered");
      assert.equal(harness.entitlement().validUntil, appliedUntil);
      const again = await harness.coordinator.runOnce();
      assert.equal(again.commandsDelivered, 0, JSON.stringify(again));
      assert.equal(harness.scheduledRows()[0].status, "applied");
      assert.equal(harness.entitlement().validUntil, appliedUntil);
      assert.equal(harness.entitlement().plan, BASIC.offerVersionRef);
    } finally {
      harness.close();
    }
  });

  await t.test("precheck failures and the upgrade window fail closed", () => {
    const authority = openHarness({ authorityEnabled: true, plan: BASIC.offerVersionRef, trafficGb: 50 });
    try {
      expectCommerceCode(
        () => authority.quote(PLUS.offerRef),
        PLAN_SWITCH_ERROR.AUTHORITY_MODE_UNSUPPORTED
      );
    } finally {
      authority.close();
    }
    const walletFirst = openHarness({ plan: BASIC.offerVersionRef, trafficGb: 50 });
    try {
      walletFirst.database.prepare(`
        update platform_accounts set metadata_json = ? where id = ?
      `).run(
        JSON.stringify({ commercialModel: "wallet_first_unique_v1" }),
        walletFirst.accountId
      );
      expectCommerceCode(
        () => walletFirst.quote(PLUS.offerRef),
        PLAN_SWITCH_ERROR.COMMERCE_MODEL_UNSUPPORTED
      );
    } finally {
      walletFirst.close();
    }
    const authorityRow = openHarness({ plan: BASIC.offerVersionRef, trafficGb: 50 });
    try {
      authorityRow.database.exec(`
        create table platform_account_resource_authorities (account_id text)
      `);
      authorityRow.database.prepare(`
        insert into platform_account_resource_authorities (account_id) values (?)
      `).run(authorityRow.accountId);
      expectCommerceCode(
        () => authorityRow.quote(PLUS.offerRef),
        PLAN_SWITCH_ERROR.AUTHORITY_ROW_PRESENT
      );
    } finally {
      authorityRow.close();
    }
    const closing = openHarness({
      plan: BASIC.offerVersionRef,
      trafficGb: 50,
      validFrom: "2026-07-31T23:00:00.000Z",
      validUntil: "2026-08-01T00:30:00.000Z"
    });
    try {
      expectCommerceCode(
        () => closing.quote(PLUS.offerRef),
        PLAN_SWITCH_ERROR.UPGRADE_WINDOW_CLOSED
      );
      const renewal = closing.quote(BASIC.offerRef);
      assert.equal(renewal.amountUnits, BASIC.baseCoinUnits);
    } finally {
      closing.close();
    }
  });

  await t.test("a second plan confirm loses to the existing nonterminal conflict", () => {
    const harness = openHarness({ plan: BASIC.offerVersionRef, trafficGb: 50 });
    try {
      const plus = harness.quote(PLUS.offerRef);
      const yearly = harness.quote(YEARLY.offerRef);
      harness.confirm(plus, "confirm_plus_first");
      expectCommerceCode(
        () => harness.confirm(yearly, "confirm_yearly_second"),
        "offer_unavailable"
      );
      expectCommerceCode(
        () => harness.quote(YEARLY.offerRef),
        "offer_unavailable"
      );
    } finally {
      harness.close();
    }
  });

  await t.test("fulfillment drift after confirm is a reconciliation error", async () => {
    const harness = openHarness({ plan: BASIC.offerVersionRef, trafficGb: 50 });
    try {
      const quote = harness.quote(PLUS.offerRef);
      harness.confirm(quote, "confirm_then_drift");
      harness.database.prepare(`
        update platform_entitlements set valid_until = ? where id = ?
      `).run("2026-08-20T00:00:00.000Z", harness.entitlementRef);
      harness.database.prepare(`
        update platform_portal_access_requests
           set expires_at = ?, valid_until = ?
         where id = ?
      `).run(
        "2026-08-20T00:00:00.000Z",
        "2026-08-20T00:00:00.000Z",
        "pareq_plan_switch"
      );
      const summary = await harness.deliver();
      assert.equal(summary.commandsFailed, 1, JSON.stringify(summary));
      assert.equal(harness.entitlement().plan, BASIC.offerVersionRef);
    } finally {
      harness.close();
    }
  });
});

function latestCommand(harness) {
  const row = harness.database.prepare(`
    select command_ref, order_ref, account_id, payload_json
      from platform_coin_commerce_fulfillment_commands
     order by created_at desc, command_ref desc
     limit 1
  `).get();
  const payload = JSON.parse(row.payload_json);
  return {
    commandRef: row.command_ref,
    orderRef: row.order_ref,
    accountId: row.account_id,
    offerVersionRef: payload.offerVersionRef,
    delivery: payload.delivery
  };
}

function usedBytes(harness, entitlement) {
  const cycle = usageCycleForBinding({
    plan: entitlement.plan,
    validFrom: entitlement.validFrom,
    validUntil: entitlement.validUntil
  }, harness.clock.value);
  const samples = harness.controlStore.listUsageSamples({
    accountId: harness.accountId,
    entitlementId: entitlement.id,
    observedFrom: cycle.startedAt,
    observedTo: cycle.endedAt
  });
  return samples.reduce((sum, sample) => sum + sample.totalBytes, 0);
}

test("upgrade_restart cycle window can shift by 30 days", () => {
  const yearlyRef = YEARLY.offerVersionRef;
  const basicRef = BASIC.offerVersionRef;
  const anchor = "2024-01-01T00:00:00.000Z";
  const validUntil = "2025-01-01T00:00:00.000Z";
  const at = "2024-01-31T00:00:00.000Z";
  const fixed = usageCycleForBinding({ plan: basicRef, validFrom: anchor, validUntil }, at);
  const monthly = usageCycleForBinding({ plan: yearlyRef, validFrom: anchor, validUntil }, at);
  assert.equal(fixed.startedAt, "2024-01-31T00:00:00.000Z");
  assert.equal(monthly.startedAt, "2024-01-01T00:00:00.000Z");
  assert.equal(
    (Date.parse(fixed.startedAt) - Date.parse(monthly.startedAt)) / DAY_MS,
    30
  );
  let maxDelta = 0;
  for (let month = 0; month < 12; month += 1) {
    for (let day = 1; day <= 31; day += 1) {
      const start = new Date(Date.UTC(2024, month, day));
      if (start.getUTCMonth() !== month) continue;
      const until = new Date(start.getTime() + 365 * DAY_MS).toISOString();
      for (let elapsed = 0; elapsed <= 400; elapsed += 1) {
        const observed = new Date(start.getTime() + elapsed * DAY_MS).toISOString();
        const fixedCycle = usageCycleForBinding({
          plan: basicRef,
          validFrom: start.toISOString(),
          validUntil: until
        }, observed);
        const monthlyCycle = usageCycleForBinding({
          plan: yearlyRef,
          validFrom: start.toISOString(),
          validUntil: until
        }, observed);
        const delta = Math.abs(
          Date.parse(fixedCycle.startedAt) - Date.parse(monthlyCycle.startedAt)
        ) / DAY_MS;
        if (delta > maxDelta) maxDelta = delta;
      }
    }
  }
  assert.equal(maxDelta, 30);
});

function stateRuntimeEnv(overrides = {}) {
  return {
    ...buildSourceValidationTestEnvironment({}, { repositoryRoot: REPOSITORY_ROOT }),
    ...overrides
  };
}

test("coordinator tick applies a due switch through state.mjs planSwitchApplyDue", async () => {
  const directory = mkdtempSync(join(tmpdir(), "plan-switch-state-due-"));
  const controlDbPath = join(directory, "control.sqlite");
  const subscriptionDbPath = join(directory, "subscriptions.sqlite");
  const proxyConfigPath = join(directory, "proxy-servers.json");
  writeFileSync(proxyConfigPath, JSON.stringify({
    servers: [{
      id: "node_sg",
      name: "vultr-singapore",
      region: "Singapore",
      host: "203.0.113.10",
      port: 18388,
      method: "aes-256-gcm",
      password: "synthetic-shared-secret"
    }],
    pingHosts: [],
    nginx: {}
  }));
  const seed = createRuntimeState({
    rootDir: new URL("../../", import.meta.url),
    env: stateRuntimeEnv({ CONSOLE_TOKEN: "secret" }),
    controlDbPath,
    subscriptionDbPath,
    proxyConfigPath,
    autoStartHttpProxy: false
  });
  await seed.close();
  const nowFn = () => new Date("2026-08-01T00:00:00.000Z");
  applyCoinWalletMigrations({
    dbPath: controlDbPath,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn
  });
  applyCoinCommerceMigrations({
    dbPath: controlDbPath,
    expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
    nowFn
  });
  applyPlanSwitchMigrations({
    dbPath: controlDbPath,
    expectedMigrationId: REQUIRED_PLAN_SWITCH_MIGRATION_ID,
    expectedDdlChecksum: PLAN_SWITCH_MIGRATIONS[0].ddlChecksum,
    nowFn
  });

  const accountId = "acct_state_due_switch";
  const entitlementRef = "ent_state_due_switch";
  const requestRef = "pareq_state_due_switch";
  let state;
  let capturedExecute;
  try {
    state = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env: stateRuntimeEnv({
        CONSOLE_TOKEN: "secret",
        USER_PORTAL_ROUTES_ENABLED: "true",
        COINS_WALLET_ENABLED: "true",
        COINS_COMMERCE_ENABLED: "true",
        COINS_COMMERCE_PLAN_SWITCH_ENABLED: "true",
        COINS_COMMERCE_AUDIENCE: "all_active"
      }),
      controlDbPath,
      subscriptionDbPath,
      proxyConfigPath,
      coinCommerceCatalog: COIN_COMMERCE_PRODUCTION_OFFERS,
      coinCommerceFulfillmentFactory(input) {
        const binding = createCoinCommerceProductionSubscriptionFulfillment(input);
        capturedExecute = binding.fulfillmentHandler.execute.bind(
          binding.fulfillmentHandler
        );
        return binding;
      },
      autoStartHttpProxy: false
    });
    assert.equal(state.platform.coinsCommercePlanSwitchEnabled, true);
    const controlStore = state.platform.controlStore;
    const store = state.platform.coinCommerceStore;
    const coordinator = state.platform.coinCommerceCoordinator;
    const validUntil = new Date(Date.now() + 25_000).toISOString();
    const validFrom = new Date(Date.parse(validUntil) - 30 * DAY_MS).toISOString();
    const stamped = new Date().toISOString();
    controlStore.createAccount({
      id: accountId,
      ownerRef: "owner_state_due_switch",
      status: "active",
      createdAt: stamped,
      updatedAt: stamped
    });
    controlStore.createEntitlement({
      id: entitlementRef,
      accountId,
      plan: PLUS.offerVersionRef,
      status: "active",
      validFrom,
      validUntil,
      maxArtifacts: 1,
      maxDevices: 2,
      trafficLimitBytes: 100 * GIB,
      createdAt: stamped,
      updatedAt: stamped
    });
    controlStore.createIssuanceRequest({
      id: requestRef,
      accountId,
      entitlementId: entitlementRef,
      approvalRef: "approval_state_due_switch",
      status: "issued",
      quantity: 1,
      nodeId: "channel-vultr-a-tuic",
      purpose: "portal_access_request",
      requestedByRef: "operator_state_due_switch",
      createdAt: stamped,
      updatedAt: stamped
    });
    const createdTenant = state.subscriptions.core.createTenant({
      displayName: "State Due Switch",
      nodeId: "vultr-singapore",
      expiresAt: validUntil,
      note: ""
    });
    const tenantId = createdTenant.tenant.id;
    const createdArtifact = state.subscriptions.core.createSubscriptionArtifact(tenantId);
    const artifactId = createdArtifact.artifact.id;
    controlStore.linkIssuedSubscription({
      id: "link_state_due_switch",
      requestId: requestRef,
      tenantRef: safeIssuedRef("tenant", tenantId),
      artifactRef: safeIssuedRef("artifact", artifactId),
      status: "active",
      createdAt: stamped,
      updatedAt: stamped
    });
    controlStore.upsertPortalAccessRequest({
      id: requestRef,
      portalUserRef: accountId,
      plan: "monthly",
      clientTarget: "clash",
      durationDays: 30,
      quantity: 1,
      status: "delivered",
      nextAction: "user_can_use_access",
      noteProvided: false,
      priorTrialState: "not_applicable",
      submittedAt: validFrom,
      updatedAt: stamped,
      reviewedAt: stamped,
      reviewedByRef: "operator_state_due_switch",
      expiresAt: validUntil,
      validUntil,
      entitlementRef,
      accessGrantRef: "grant_state_due_switch",
      tenantId,
      artifactId,
      edgeChannelRef: "channel-vultr-a-tuic",
      edgeCredentialRef: "edgecred_state_due_switch",
      edgeMaterialDigest: "sha256:synthetic_state_due_switch"
    });
    store.walletStore.creditCoins({
      accountId,
      coinType: "paid_coins",
      amountUnits: 500,
      availability: "available",
      sourceType: "synthetic_seed",
      sourceRef: "source_state_due_switch",
      sourceDigest: "b".repeat(64),
      policyRef: null,
      policyVersion: null,
      expiresAt: null,
      operation: {
        actorScope: "system:plan-switch-test",
        idempotencyKey: "credit_state_due_switch",
        actorType: "system",
        actorRef: "plan_switch_test"
      }
    });
    const quote = store.createCheckoutQuote({
      accountId,
      offerRef: BASIC.offerRef
    });
    assert.equal(quote.amountUnits, BASIC.baseCoinUnits);
    const order = store.confirmOrder({
      accountId,
      quoteRef: quote.quoteRef,
      operation: {
        actorScope: `portal:${accountId}`,
        idempotencyKey: "confirm_state_due_switch",
        actorType: "portal_user",
        actorRef: accountId
      }
    });
    sleepMs(4_500);
    const delivered = await coordinator.runOnce();
    assert.equal(delivered.commandsDelivered, 1, JSON.stringify(delivered));
    assert.equal(controlStore.getEntitlement(entitlementRef).plan, PLUS.offerVersionRef);
    assert.equal(
      controlStore.readScheduledPlanSwitch({ switchRef: order.orderRef }).status,
      "scheduled"
    );
    const waitMs = Date.parse(validUntil) - Date.now() + 1_500;
    if (waitMs > 0) sleepMs(waitMs);
    assert.throws(
      () => store.createCheckoutQuote({ accountId, offerRef: BASIC.offerRef }),
      (error) => error?.code === PLAN_SWITCH_ERROR.APPLICATION_PENDING
    );
    assert.equal(
      controlStore.readScheduledPlanSwitch({ switchRef: order.orderRef }).status,
      "scheduled"
    );
    const applied = await coordinator.runOnce();
    assert.equal(applied.commandsDelivered, 0, JSON.stringify(applied));
    const entitlement = controlStore.getEntitlement(entitlementRef);
    assert.equal(entitlement.plan, BASIC.offerVersionRef);
    assert.equal(entitlement.trafficLimitBytes, 50 * GIB);
    assert.ok(Date.parse(entitlement.validFrom) >= Date.parse(validUntil));
    assert.equal(
      entitlement.validUntil,
      new Date(Date.parse(entitlement.validFrom) + 30 * DAY_MS).toISOString()
    );
    assert.equal(
      state.subscriptions.core.getTenant(tenantId).expiresAt,
      entitlement.validUntil
    );
    assert.equal(
      controlStore.readScheduledPlanSwitch({ switchRef: order.orderRef }).status,
      "applied"
    );
    const replay = capturedExecute({
      commandRef: planSwitchDueCommandRef(order.orderRef),
      orderRef: order.orderRef,
      accountId,
      offerVersionRef: BASIC.offerVersionRef,
      delivery: { ...BASIC.delivery }
    });
    assert.equal(replay.status, "delivered");
    const again = await coordinator.runOnce();
    assert.equal(again.commandsDelivered, 0, JSON.stringify(again));
    const settled = controlStore.getEntitlement(entitlementRef);
    assert.equal(settled.plan, BASIC.offerVersionRef);
    assert.equal(settled.validFrom, entitlement.validFrom);
    assert.equal(settled.validUntil, entitlement.validUntil);
    assert.equal(
      controlStore.readScheduledPlanSwitch({ switchRef: order.orderRef }).status,
      "applied"
    );
    const renewal = store.createCheckoutQuote({
      accountId,
      offerRef: BASIC.offerRef
    });
    assert.equal(renewal.amountUnits, BASIC.baseCoinUnits);
  } finally {
    await Promise.resolve(state?.close());
    removeTempDir(directory);
  }
});
