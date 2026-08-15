import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import {
  createSqliteSubscriptionControlStore
} from "../services/platform/subscription-control-db.mjs";
import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  applyCoinWalletMigrations
} from "../services/platform/coin-wallet-migrations.mjs";
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
  REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID,
  WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATIONS,
  applyWalletFirstDeferredCheckoutMigrations
} from "../services/platform/wallet-first-deferred-checkout-migrations.mjs";
import {
  REQUIRED_WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_MIGRATION_ID,
  WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_MIGRATIONS,
  applyWalletFirstResourceEffectRuntimeClaimsMigrations
} from "../services/platform/wallet-first-resource-effect-runtime-claims-migrations.mjs";
import {
  REQUIRED_WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_MIGRATION_ID,
  WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_MIGRATIONS,
  applyWalletFirstSetupDeliveryHandoffsMigrations
} from "../services/platform/wallet-first-setup-delivery-handoffs-migrations.mjs";
import {
  createWalletFirstResourceEffectHandler
} from "../services/platform/wallet-first-resource-effect-handler.mjs";
import {
  createWalletFirstResourceEffectAdapters,
  walletFirstResourceEffectRuntimeMarker,
  WALLET_FIRST_RESOURCE_EFFECT_CONTROL_ADAPTER_CONTRACT,
  WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_ADAPTER_CONTRACT
} from "../services/platform/wallet-first-resource-effect-adapter.mjs";
import {
  createWalletFirstSetupDeliveryEscrow
} from "../services/platform/wallet-first-setup-delivery-escrow.mjs";
import {
  createSubscriptionCore
} from "../services/subscriptions/core.mjs";
import {
  createSqliteSubscriptionStore
} from "../services/subscriptions/repository.mjs";

const INITIAL_NOW = "2026-08-13T00:00:00.000Z";
const CONTROL_METHODS = Object.freeze([
  "getWalletFirstAccountForDeferredTransition",
  "resolveExactWalletFirstResourceChainForDeferredTransition",
  "getWalletFirstTransitionEffectForDeferredTransition",
  "prepareWalletFirstInitialActivationForDeferredTransition",
  "prepareWalletFirstScheduledSwitchForDeferredTransition",
  "getWalletFirstRuntimeReceiptForDeferredTransition",
  "verifyWalletFirstRuntimeTransitionForDeferredTransition",
  "claimWalletFirstRuntimeEffectForDeferredTransition",
  "markWalletFirstRuntimeEffectReconciliationRequiredForDeferredTransition",
  "recordWalletFirstRuntimeReceiptForDeferredTransition",
  "completeWalletFirstTransitionEffectForDeferredTransition",
  "assertWalletFirstSetupDeliveryHandoffForDeferredTransition"
]);
const RUNTIME_METHODS = Object.freeze([
  "listTenants",
  "createTenant",
  "renewTenant",
  "listSubscriptionArtifacts",
  "createSubscriptionArtifact"
]);

function offer({ offerVersionRef, durationDays, monthlyTrafficGb }) {
  return {
    offerRef: `offer_${offerVersionRef}`,
    offerVersionRef,
    version: 1,
    category: "plan",
    title: { zh: "合成钱包优先套餐", en: "Synthetic Wallet-first Plan" },
    summary: { zh: "本地适配器测试夹具", en: "Synthetic local test fixture" },
    importantNotices: {
      zh: ["仅用于平台订阅服务"],
      en: ["Platform subscription only"]
    },
    baseCoinUnits: 20,
    referencePrice: { currency: "CNY", amountMinor: 2_000 },
    acceptedCoinTypes: ["bonus_coins", "paid_coins"],
    delivery: {
      kind: "subscription_plan",
      durationDays,
      monthlyTrafficGb,
      trafficGb: null,
      neverExpires: false,
      discountBasisPoints: 0
    }
  };
}

function initialInput(now = INITIAL_NOW) {
  return {
    transitionRef: "transition_wallet_001",
    accountId: "acct_wallet_001",
    orderRef: "deferred_order_001",
    flowKind: "initial_activation",
    offer: offer({
      offerVersionRef: "offerv_plan_30d_50gb_monthly_v1",
      durationDays: 30,
      monthlyTrafficGb: 50
    }),
    scheduledFor: now,
    expectedEntitlementId: null,
    expectedRequestId: null,
    expectedIssuedLinkId: null,
    expectedValidUntil: null,
    activationAt: now
  };
}

function scheduledInput(chain, now) {
  return {
    transitionRef: "transition_wallet_002",
    accountId: "acct_wallet_001",
    orderRef: "deferred_order_002",
    flowKind: "scheduled_switch",
    offer: offer({
      offerVersionRef: "offerv_plan_365d_200gb_monthly_v1",
      durationDays: 365,
      monthlyTrafficGb: 200
    }),
    scheduledFor: chain.validUntil,
    expectedEntitlementId: chain.entitlementId,
    expectedRequestId: chain.requestId,
    expectedIssuedLinkId: chain.issuedLinkId,
    expectedValidUntil: chain.validUntil,
    activationAt: now
  };
}

function createFixture({ setupDeliveryRuntimeEscrow = null } = {}) {
  let now = INITIAL_NOW;
  const controlDatabase = new Database(":memory:");
  const runtimeDatabase = new Database(":memory:");
  const controlStore = createSqliteSubscriptionControlStore({ database: controlDatabase });
  const migrationNow = () => new Date(now);
  applyCoinWalletMigrations({
    database: controlDatabase,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: migrationNow
  });
  applyCoinCommerceMigrations({
    database: controlDatabase,
    expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
    nowFn: migrationNow
  });
  applyDeferredResourceTransitionMigrations({
    database: controlDatabase,
    expectedMigrationId: REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID,
    expectedDdlChecksum: REQUIRED_DEFERRED_RESOURCE_TRANSITION_DDL_CHECKSUM,
    nowFn: migrationNow
  });
  applyWalletFirstDeferredCheckoutMigrations({
    database: controlDatabase,
    expectedMigrationId: REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID,
    expectedDdlChecksum: WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATIONS[0].ddlChecksum,
    nowFn: migrationNow
  });
  applyWalletFirstResourceEffectRuntimeClaimsMigrations({
    database: controlDatabase,
    expectedMigrationId: REQUIRED_WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_MIGRATION_ID,
    expectedDdlChecksum: WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_MIGRATIONS[0].ddlChecksum,
    nowFn: migrationNow
  });
  if (setupDeliveryRuntimeEscrow) {
    applyWalletFirstSetupDeliveryHandoffsMigrations({
      database: controlDatabase,
      expectedMigrationId: REQUIRED_WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_MIGRATION_ID,
      expectedDdlChecksum: WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_MIGRATIONS[0].ddlChecksum,
      nowFn: migrationNow
    });
  }
  const runtimeStore = createSqliteSubscriptionStore({ database: runtimeDatabase });
  const subscriptionCore = createSubscriptionCore({
    store: runtimeStore,
    proxyConfig: {
      servers: [{
        id: "node_alpha",
        name: "node_alpha",
        host: "203.0.113.7",
        port: 443,
        method: "aes-256-gcm",
        password: "synthetic-test-secret"
      }]
    },
    publicSubscriptionBaseUrl: "https://gateway.example.test",
    nowFn: () => new Date(now),
    tokenFactory: () => ({
      rawToken: "pgsub_synthetic_wallet_001",
      tokenHash: "a".repeat(64),
      tokenPrefix: "pgsub_synthetic"
    }),
    artifactSecretFactory: () => "artifact_synthetic_wallet_001",
    idFactory: () => "tenant_wallet_001",
    artifactIdFactory: () => "artifact_wallet_001"
  });
  controlStore.createAccount({
    id: "acct_wallet_001",
    ownerRef: "owner_wallet_001",
    status: "active",
    createdAt: now,
    updatedAt: now,
    metadata: { commercialModel: "wallet_first_unique_v1" }
  });
  const adapters = createWalletFirstResourceEffectAdapters({
    controlStore,
    subscriptionCore,
    nodeId: "node_alpha",
    nowFn: () => new Date(now),
    ...(setupDeliveryRuntimeEscrow ? { setupDeliveryRuntimeEscrow } : {})
  });
  const handler = createWalletFirstResourceEffectHandler(adapters);
  return {
    controlDatabase,
    runtimeDatabase,
    controlStore,
    subscriptionCore,
    adapters,
    handler,
    setNow(value) {
      now = value;
    },
    close() {
      controlStore.close();
      runtimeStore.close();
    }
  };
}

function wrapMethods(source, methods, overrides = {}) {
  return Object.freeze(Object.fromEntries(methods.map((method) => [
    method,
    (...args) => Object.hasOwn(overrides, method)
      ? overrides[method](...args)
      : source[method](...args)
  ])));
}

function createEffectInput(preparation) {
  return Object.freeze({
    transitionRef: preparation.transitionRef,
    effectRef: preparation.effectRef,
    flowKind: preparation.runtimeRequest.initialTransitionRef
      ? "scheduled_switch"
      : "initial_activation",
    successor: preparation.successor,
    runtimeRequest: preparation.runtimeRequest
  });
}

function createSetupDeliveryEscrow(t, name, { ivFactory } = {}) {
  const directory = mkdtempSync(join(tmpdir(), `${name}-`));
  const filePath = join(directory, "setup-delivery-escrow.json");
  const escrow = createWalletFirstSetupDeliveryEscrow({
    key: Buffer.from("00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff", "hex"),
    filePath,
    ...(ivFactory ? { ivFactory } : {})
  });
  t.after(() => escrow.close());
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return { escrow, filePath };
}

function runtimeClaim(fixture, preparation, now = INITIAL_NOW) {
  return fixture.controlStore.claimWalletFirstRuntimeEffectForDeferredTransition({
    transitionRef: preparation.transitionRef,
    flowKind: preparation.runtimeRequest.initialTransitionRef
      ? "scheduled_switch"
      : "initial_activation",
    successor: preparation.successor,
    nodeId: "node_alpha",
    now,
    leaseMs: 60_000
  });
}

test("wallet-first concrete adapters activate one marked chain and replay its durable receipt", async (t) => {
  const fixture = createFixture();
  t.after(() => fixture.close());

  const first = await fixture.handler.applyDeferredResourceTransition(initialInput());
  assert.equal(first.status, "applied");
  assert.equal(fixture.subscriptionCore.listTenants().length, 1);
  assert.equal(
    fixture.subscriptionCore.listSubscriptionArtifacts(
      fixture.subscriptionCore.listTenants()[0].id
    ).length,
    1
  );
  const chain = fixture.handler.resolveCurrentResourceChain({ accountId: "acct_wallet_001" });
  assert.equal(chain.state, "current");
  assert.equal(chain.entitlementId, first.nextEntitlementId);
  assert.equal(chain.requestId, first.nextRequestId);
  assert.equal(chain.issuedLinkId, first.nextIssuedLinkId);
  assert.equal(chain.validUntil, first.nextValidUntil);

  const entitlement = fixture.controlStore.getEntitlement(chain.entitlementId);
  const request = fixture.controlStore.getIssuanceRequest(chain.requestId);
  const link = fixture.controlStore.getIssuedLink(chain.issuedLinkId);
  const portal = fixture.controlStore.getPortalAccessRequest(chain.requestId);
  assert.equal(entitlement.plan, "offerv_plan_30d_50gb_monthly_v1");
  assert.equal(request.metadata.resourceModel, "wallet_first_resource_chain_v1");
  assert.equal(request.metadata.initialTransitionRef, "transition_wallet_001");
  assert.equal(link.status, "active");
  assert.equal(portal.subscriptionUrl, null);
  assert.equal(portal.edgeLifecycleMutation, false);

  const replay = await fixture.handler.applyDeferredResourceTransition(initialInput());
  assert.deepEqual(replay, first);
  assert.equal(fixture.subscriptionCore.listTenants().length, 1);
});

test("runtime adapter captures the first artifact into encrypted escrow and refuses a replay with a missing exact escrow record", async (t) => {
  const setup = createSetupDeliveryEscrow(t, "wallet-first-runtime-escrow");
  const fixture = createFixture({
    setupDeliveryRuntimeEscrow: setup.escrow.runtimeEscrow
  });
  t.after(() => fixture.close());

  const first = await fixture.handler.applyDeferredResourceTransition(initialInput());
  const tenant = fixture.subscriptionCore.listTenants()[0];
  const artifact = fixture.subscriptionCore.listSubscriptionArtifacts(tenant.id)[0];
  const summary = setup.escrow.deliveryEscrow.getSetupDeliverySummary({
    transitionRef: "transition_wallet_001",
    effectRef: first.effectRef,
    tenantId: tenant.id,
    artifactId: artifact.id
  });
  assert.equal(summary.state, "available");
  assert.equal(first.setupDeliveryHandoffRef, summary.handoffRef);
  assert.equal(readFileSync(setup.filePath, "utf8").includes("gateway.example.test"), false);
  assert.equal(fixture.subscriptionCore.listTenants().length, 1);

  const replay = await fixture.handler.applyDeferredResourceTransition(initialInput());
  assert.deepEqual(replay, first);
  assert.equal(fixture.subscriptionCore.listTenants().length, 1);

  const initialChain = fixture.handler.resolveCurrentResourceChain({
    accountId: "acct_wallet_001"
  });
  fixture.setNow(initialChain.validUntil);
  const scheduled = await fixture.handler.applyDeferredResourceTransition(
    scheduledInput(initialChain, initialChain.validUntil)
  );
  assert.equal(Object.hasOwn(scheduled, "setupDeliveryHandoffRef"), false);
  assert.equal(
    setup.escrow.deliveryEscrow.getSetupDeliverySummary({
      transitionRef: "transition_wallet_001",
      effectRef: first.effectRef,
      tenantId: tenant.id,
      artifactId: artifact.id
    }).state,
    "available"
  );

  const missing = createSetupDeliveryEscrow(t, "wallet-first-runtime-escrow-missing");
  const restarted = createWalletFirstResourceEffectAdapters({
    controlStore: fixture.controlStore,
    subscriptionCore: fixture.subscriptionCore,
    nodeId: "node_alpha",
    nowFn: () => new Date(INITIAL_NOW),
    setupDeliveryRuntimeEscrow: missing.escrow.runtimeEscrow
  });
  const preparation = fixture.adapters.controlAdapter.prepareWalletFirstInitialActivation({
    transitionRef: "transition_wallet_001",
    accountId: "acct_wallet_001",
    offer: {
      offerVersionRef: "offerv_plan_30d_50gb_monthly_v1",
      durationDays: 30,
      monthlyTrafficGb: 50
    },
    scheduledFor: INITIAL_NOW,
    activationAt: INITIAL_NOW
  });
  await assert.rejects(
    restarted.runtimeAdapter.applyWalletFirstTransition(createEffectInput(preparation)),
    (error) => error?.code === "wallet_first_resource_effect_reconciliation_required"
  );
  assert.equal(fixture.subscriptionCore.listTenants().length, 1);
  assert.equal(
    fixture.subscriptionCore.listSubscriptionArtifacts(tenant.id).length,
    1
  );
});

test("initial escrow capture failure never records or completes an effect", async (t) => {
  const setup = createSetupDeliveryEscrow(t, "wallet-first-runtime-escrow-capture-failure", {
    ivFactory() {
      throw new Error("synthetic capture failure");
    }
  });
  const fixture = createFixture({
    setupDeliveryRuntimeEscrow: setup.escrow.runtimeEscrow
  });
  t.after(() => fixture.close());

  await assert.rejects(
    fixture.handler.applyDeferredResourceTransition(initialInput()),
    (error) => error?.code === "wallet_first_resource_effect_unavailable"
  );
  assert.equal(
    fixture.controlStore.getWalletFirstRuntimeReceiptForDeferredTransition({
      transitionRef: "transition_wallet_001"
    }),
    null
  );
  assert.equal(
    fixture.controlStore.getWalletFirstTransitionEffectForDeferredTransition({
      transitionRef: "transition_wallet_001"
    }),
    null
  );
  assert.equal(fixture.subscriptionCore.listTenants().length, 1);
  assert.equal(
    fixture.subscriptionCore.listSubscriptionArtifacts(
      fixture.subscriptionCore.listTenants()[0].id
    ).length,
    1
  );

  await assert.rejects(
    fixture.handler.applyDeferredResourceTransition(initialInput()),
    (error) => error?.code === "wallet_first_resource_effect_unavailable"
  );
  assert.equal(fixture.subscriptionCore.listTenants().length, 1);
});

test("scheduled switch updates the exact marked chain in place and preserves runtime resources", async (t) => {
  const fixture = createFixture();
  t.after(() => fixture.close());

  const initial = await fixture.handler.applyDeferredResourceTransition(initialInput());
  const before = fixture.handler.resolveCurrentResourceChain({ accountId: "acct_wallet_001" });
  fixture.setNow(before.validUntil);
  const scheduled = await fixture.handler.applyDeferredResourceTransition(
    scheduledInput(before, before.validUntil)
  );
  const after = fixture.handler.resolveCurrentResourceChain({ accountId: "acct_wallet_001" });

  assert.equal(after.entitlementId, before.entitlementId);
  assert.equal(after.requestId, before.requestId);
  assert.equal(after.issuedLinkId, before.issuedLinkId);
  assert.equal(after.validUntil, scheduled.nextValidUntil);
  assert.equal(scheduled.nextEntitlementId, before.entitlementId);
  assert.equal(scheduled.nextRequestId, before.requestId);
  assert.equal(scheduled.nextIssuedLinkId, before.issuedLinkId);
  assert.equal(fixture.subscriptionCore.listTenants().length, 1);
  assert.equal(
    fixture.subscriptionCore.listSubscriptionArtifacts(
      fixture.subscriptionCore.listTenants()[0].id
    ).length,
    1
  );
  const entitlement = fixture.controlStore.getEntitlement(after.entitlementId);
  const request = fixture.controlStore.getIssuanceRequest(after.requestId);
  const portal = fixture.controlStore.getPortalAccessRequest(after.requestId);
  assert.equal(entitlement.plan, "offerv_plan_365d_200gb_monthly_v1");
  assert.equal(entitlement.validFrom, before.validUntil);
  assert.equal(request.metadata.initialTransitionRef, "transition_wallet_001");
  assert.equal(request.metadata.lastTransitionRef, "transition_wallet_002");
  assert.equal(portal.plan, "yearly");
  assert.equal(portal.validUntil, scheduled.nextValidUntil);

  const replay = await fixture.handler.applyDeferredResourceTransition(
    scheduledInput(before, before.validUntil)
  );
  assert.deepEqual(replay, scheduled);
  const oldReceipt = await fixture.handler.resolveDeferredResourceTransitionEffect({
    transitionRef: "transition_wallet_001"
  });
  assert.deepEqual(oldReceipt, initial);
});

test("handler quarantines a durable-receipt replay after runtime drift", async (t) => {
  const fixture = createFixture();
  t.after(() => fixture.close());

  const input = initialInput();
  await fixture.handler.applyDeferredResourceTransition(input);
  const tenants = fixture.subscriptionCore.listTenants();
  fixture.subscriptionCore.disableTenant(tenants[0].id);

  await assert.rejects(
    fixture.handler.applyDeferredResourceTransition(input),
    (error) => error?.code === "wallet_first_resource_effect_unavailable"
  );
});

test("handler rejects a forged control/runtime adapter pair even when methods and contract match", () => {
  const fakeControl = Object.freeze({
    contract: WALLET_FIRST_RESOURCE_EFFECT_CONTROL_ADAPTER_CONTRACT,
    idempotencyContract: "deduplicate_by_transition_ref",
    getWalletFirstAccount() {},
    resolveExactWalletFirstResourceChain() {},
    getWalletFirstTransitionEffect() {},
    prepareWalletFirstInitialActivation() {},
    prepareWalletFirstScheduledSwitch() {},
    completeWalletFirstTransitionEffect() {}
  });
  const fakeRuntime = Object.freeze({
    contract: WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_ADAPTER_CONTRACT,
    idempotencyContract: "deduplicate_by_transition_ref",
    verifyWalletFirstTransition() {},
    applyWalletFirstTransition() {}
  });
  assert.throws(
    () => createWalletFirstResourceEffectHandler({
      controlAdapter: fakeControl,
      runtimeAdapter: fakeRuntime
    }),
    (error) => error?.code === "wallet_first_resource_effect_invalid"
  );
});

test("initial Core success before receipt survives a lease takeover without a duplicate tenant", async (t) => {
  const fixture = createFixture();
  t.after(() => fixture.close());
  const preparation = await fixture.adapters.controlAdapter.prepareWalletFirstInitialActivation({
    transitionRef: "transition_wallet_003",
    accountId: "acct_wallet_001",
    offer: {
      offerVersionRef: "offerv_plan_30d_50gb_monthly_v1",
      durationDays: 30,
      monthlyTrafficGb: 50
    },
    scheduledFor: INITIAL_NOW,
    activationAt: INITIAL_NOW
  });
  let failReceipt = true;
  const crashed = createWalletFirstResourceEffectAdapters({
    controlStore: wrapMethods(fixture.controlStore, CONTROL_METHODS, {
      recordWalletFirstRuntimeReceiptForDeferredTransition(...args) {
        if (failReceipt) {
          failReceipt = false;
          throw new Error("synthetic receipt crash");
        }
        return fixture.controlStore.recordWalletFirstRuntimeReceiptForDeferredTransition(...args);
      }
    }),
    subscriptionCore: fixture.subscriptionCore,
    nodeId: "node_alpha",
    nowFn: () => new Date(INITIAL_NOW)
  });

  await assert.rejects(
    crashed.runtimeAdapter.applyWalletFirstTransition(createEffectInput(preparation)),
    (error) => error?.code === "wallet_first_resource_effect_reconciliation_required"
  );
  assert.equal(fixture.subscriptionCore.listTenants().length, 1);
  assert.equal(
    fixture.subscriptionCore.listSubscriptionArtifacts(
      fixture.subscriptionCore.listTenants()[0].id
    ).length,
    1
  );
  assert.equal(fixture.controlDatabase.prepare(`
    select status from platform_wallet_first_resource_effect_runtime_claims
     where transition_ref = 'transition_wallet_003'
  `).pluck().get(), "claimed");

  const recoveryNow = "2026-08-13T00:01:01.000Z";
  fixture.setNow(recoveryNow);
  const restarted = createWalletFirstResourceEffectHandler(
    createWalletFirstResourceEffectAdapters({
      controlStore: fixture.controlStore,
      subscriptionCore: fixture.subscriptionCore,
      nodeId: "node_alpha",
      nowFn: () => new Date(recoveryNow)
    })
  );
  const completed = await restarted.applyDeferredResourceTransition({
    ...initialInput(INITIAL_NOW),
    transitionRef: preparation.transitionRef,
    activationAt: recoveryNow
  });
  assert.equal(completed.status, "applied");
  assert.equal(fixture.subscriptionCore.listTenants().length, 1);
  assert.equal(fixture.controlDatabase.prepare(`
    select status || ':' || lease_generation
      from platform_wallet_first_resource_effect_runtime_claims
     where transition_ref = 'transition_wallet_003'
  `).pluck().get(), "recorded:2");
});

test("initial takeover with no marker stays manual even if a stale worker later creates", async (t) => {
  const fixture = createFixture();
  t.after(() => fixture.close());
  const preparation = await fixture.adapters.controlAdapter.prepareWalletFirstInitialActivation({
    transitionRef: "transition_wallet_004",
    accountId: "acct_wallet_001",
    offer: {
      offerVersionRef: "offerv_plan_30d_50gb_monthly_v1",
      durationDays: 30,
      monthlyTrafficGb: 50
    },
    scheduledFor: INITIAL_NOW,
    activationAt: INITIAL_NOW
  });
  const staleClaim = runtimeClaim(fixture, preparation);
  assert.equal(staleClaim.status, "claimed");
  const recoveryNow = "2026-08-13T00:01:01.000Z";
  fixture.setNow(recoveryNow);
  const restarted = createWalletFirstResourceEffectAdapters({
    controlStore: fixture.controlStore,
    subscriptionCore: fixture.subscriptionCore,
    nodeId: "node_alpha",
    nowFn: () => new Date(recoveryNow)
  });
  await assert.rejects(
    restarted.runtimeAdapter.applyWalletFirstTransition(createEffectInput(preparation)),
    (error) => error?.code === "wallet_first_resource_effect_reconciliation_required"
  );
  assert.equal(fixture.subscriptionCore.listTenants().length, 0);
  assert.equal(fixture.controlDatabase.prepare(`
    select status from platform_wallet_first_resource_effect_runtime_claims
     where transition_ref = 'transition_wallet_004'
  `).pluck().get(), "reconciliation_required");
  // Simulate the superseded process returning from Core after its lease was
  // taken. It may create a marked tenant because Core has no create fence, but
  // it cannot write the durable receipt or cause automatic capture.
  const staleTenant = fixture.subscriptionCore.createTenant({
    displayName: "Synthetic stale worker",
    nodeId: "node_alpha",
    expiresAt: preparation.successor.validUntil,
    note: walletFirstResourceEffectRuntimeMarker("transition_wallet_004")
  }).tenant;
  const staleArtifact = fixture.subscriptionCore.createSubscriptionArtifact(staleTenant.id).artifact;
  assert.throws(() => fixture.controlStore.recordWalletFirstRuntimeReceiptForDeferredTransition({
    transitionRef: preparation.transitionRef,
    flowKind: "initial_activation",
    successor: preparation.successor,
    tenantId: staleTenant.id,
    artifactId: staleArtifact.id,
    nodeId: "node_alpha",
    now: recoveryNow,
    leaseGeneration: staleClaim.leaseGeneration,
    leaseToken: staleClaim.leaseToken
  }), (error) => error?.code === "claim_lost");
  assert.equal(await fixture.controlStore.getWalletFirstRuntimeReceiptForDeferredTransition({
    transitionRef: preparation.transitionRef
  }), null);
  assert.equal(
    fixture.handler.resolveCurrentResourceChain({ accountId: "acct_wallet_001" }).state,
    "none"
  );
});

test("initial partial tenant is quarantined under the new lease and never completed by a second create", async (t) => {
  const fixture = createFixture();
  t.after(() => fixture.close());
  const preparation = await fixture.adapters.controlAdapter.prepareWalletFirstInitialActivation({
    transitionRef: "transition_wallet_005",
    accountId: "acct_wallet_001",
    offer: {
      offerVersionRef: "offerv_plan_30d_50gb_monthly_v1",
      durationDays: 30,
      monthlyTrafficGb: 50
    },
    scheduledFor: INITIAL_NOW,
    activationAt: INITIAL_NOW
  });
  const partialRuntime = wrapMethods(fixture.subscriptionCore, RUNTIME_METHODS, {
    createSubscriptionArtifact() {
      throw new Error("synthetic artifact crash");
    }
  });
  const crashed = createWalletFirstResourceEffectAdapters({
    controlStore: fixture.controlStore,
    subscriptionCore: partialRuntime,
    nodeId: "node_alpha",
    nowFn: () => new Date(INITIAL_NOW)
  });
  await assert.rejects(
    crashed.runtimeAdapter.applyWalletFirstTransition(createEffectInput(preparation)),
    (error) => error?.code === "wallet_first_resource_effect_unavailable"
  );
  assert.equal(fixture.subscriptionCore.listTenants().length, 1);
  const recoveryNow = "2026-08-13T00:01:01.000Z";
  fixture.setNow(recoveryNow);
  const restarted = createWalletFirstResourceEffectAdapters({
    controlStore: fixture.controlStore,
    subscriptionCore: fixture.subscriptionCore,
    nodeId: "node_alpha",
    nowFn: () => new Date(recoveryNow)
  });
  await assert.rejects(
    restarted.runtimeAdapter.applyWalletFirstTransition(createEffectInput(preparation)),
    (error) => error?.code === "wallet_first_resource_effect_reconciliation_required"
  );
  assert.equal(fixture.subscriptionCore.listTenants().length, 1);
  assert.equal(
    fixture.subscriptionCore.listSubscriptionArtifacts(
      fixture.subscriptionCore.listTenants()[0].id
    ).length,
    0
  );
  assert.equal(fixture.controlDatabase.prepare(`
    select status from platform_wallet_first_resource_effect_runtime_claims
     where transition_ref = 'transition_wallet_005'
  `).pluck().get(), "reconciliation_required");
});

test("scheduled renewal crash reuses immutable preparation on later activation and records target receipt", async (t) => {
  const fixture = createFixture();
  t.after(() => fixture.close());
  await fixture.handler.applyDeferredResourceTransition(initialInput());
  const before = fixture.handler.resolveCurrentResourceChain({ accountId: "acct_wallet_001" });
  fixture.setNow(before.validUntil);
  const preparation = await fixture.adapters.controlAdapter.prepareWalletFirstScheduledSwitch({
    transitionRef: "transition_wallet_006",
    accountId: "acct_wallet_001",
    offer: {
      offerVersionRef: "offerv_plan_365d_200gb_monthly_v1",
      durationDays: 365,
      monthlyTrafficGb: 200
    },
    scheduledFor: before.validUntil,
    activationAt: before.validUntil,
    expectedChain: {
      entitlementId: before.entitlementId,
      requestId: before.requestId,
      issuedLinkId: before.issuedLinkId,
      validUntil: before.validUntil
    }
  });
  const crashControl = wrapMethods(fixture.controlStore, CONTROL_METHODS, {
    recordWalletFirstRuntimeReceiptForDeferredTransition() {
      throw new Error("synthetic post-renew receipt crash");
    }
  });
  const crashed = createWalletFirstResourceEffectAdapters({
    controlStore: crashControl,
    subscriptionCore: fixture.subscriptionCore,
    nodeId: "node_alpha",
    nowFn: () => new Date(before.validUntil)
  });
  await assert.rejects(
    crashed.runtimeAdapter.applyWalletFirstTransition(createEffectInput(preparation)),
    (error) => error?.code === "wallet_first_resource_effect_reconciliation_required"
  );
  assert.equal(fixture.subscriptionCore.listTenants()[0].expiresAt, preparation.successor.validUntil);

  const recoveryNow = "2026-09-12T00:01:01.000Z";
  fixture.setNow(recoveryNow);
  const restarted = createWalletFirstResourceEffectHandler(
    createWalletFirstResourceEffectAdapters({
      controlStore: fixture.controlStore,
      subscriptionCore: fixture.subscriptionCore,
      nodeId: "node_alpha",
      nowFn: () => new Date(recoveryNow)
    })
  );
  const completed = await restarted.applyDeferredResourceTransition({
    ...scheduledInput(before, recoveryNow),
    transitionRef: preparation.transitionRef
  });
  assert.equal(completed.nextValidUntil, preparation.successor.validUntil);
  assert.equal(
    fixture.handler.resolveCurrentResourceChain({ accountId: "acct_wallet_001" }).validUntil,
    preparation.successor.validUntil
  );
  assert.equal(fixture.controlDatabase.prepare(`
    select status || ':' || lease_generation
      from platform_wallet_first_resource_effect_runtime_claims
     where transition_ref = 'transition_wallet_006'
  `).pluck().get(), "recorded:2");
});

test("active inner lease is retryable without probing, then its exact target is recovered by CAS generation", async (t) => {
  const fixture = createFixture();
  t.after(() => fixture.close());
  const preparation = await fixture.adapters.controlAdapter.prepareWalletFirstInitialActivation({
    transitionRef: "transition_wallet_007",
    accountId: "acct_wallet_001",
    offer: {
      offerVersionRef: "offerv_plan_30d_50gb_monthly_v1",
      durationDays: 30,
      monthlyTrafficGb: 50
    },
    scheduledFor: INITIAL_NOW,
    activationAt: INITIAL_NOW
  });
  const firstClaim = runtimeClaim(fixture, preparation);
  const tenant = fixture.subscriptionCore.createTenant({
    displayName: "Synthetic stale worker",
    nodeId: "node_alpha",
    expiresAt: preparation.successor.validUntil,
    note: walletFirstResourceEffectRuntimeMarker("transition_wallet_007")
  }).tenant;
  const artifact = fixture.subscriptionCore.createSubscriptionArtifact(tenant.id).artifact;
  await assert.rejects(
    fixture.adapters.runtimeAdapter.applyWalletFirstTransition(createEffectInput(preparation)),
    (error) => error?.code === "wallet_first_resource_effect_retryable"
  );
  assert.equal(fixture.subscriptionCore.listTenants().length, 1);
  assert.equal(await fixture.controlStore.getWalletFirstRuntimeReceiptForDeferredTransition({
    transitionRef: preparation.transitionRef
  }), null);

  const recoveryNow = "2026-08-13T00:01:01.000Z";
  fixture.setNow(recoveryNow);
  const secondClaim = runtimeClaim(fixture, preparation, recoveryNow);
  assert.equal(secondClaim.status, "claimed");
  assert.equal(secondClaim.leaseGeneration, firstClaim.leaseGeneration + 1);
  assert.throws(() => fixture.controlStore.recordWalletFirstRuntimeReceiptForDeferredTransition({
    transitionRef: preparation.transitionRef,
    flowKind: "initial_activation",
    successor: preparation.successor,
    tenantId: tenant.id,
    artifactId: artifact.id,
    nodeId: "node_alpha",
    now: recoveryNow,
    leaseGeneration: firstClaim.leaseGeneration,
    leaseToken: firstClaim.leaseToken
  }), (error) => error?.code === "claim_lost");
  const receipt = fixture.controlStore.recordWalletFirstRuntimeReceiptForDeferredTransition({
    transitionRef: preparation.transitionRef,
    flowKind: "initial_activation",
    successor: preparation.successor,
    tenantId: tenant.id,
    artifactId: artifact.id,
    nodeId: "node_alpha",
    now: recoveryNow,
    leaseGeneration: secondClaim.leaseGeneration,
    leaseToken: secondClaim.leaseToken
  });
  assert.equal(receipt.transitionRef, preparation.transitionRef);
  assert.equal(fixture.subscriptionCore.listTenants().length, 1);
});
