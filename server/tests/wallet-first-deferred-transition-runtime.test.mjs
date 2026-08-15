import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import {
  COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID,
  applyCoinCommerceMigrations
} from "../services/platform/coin-commerce-migrations.mjs";
import {
  createSqliteCoinCommerceStore
} from "../services/platform/coin-commerce-store.mjs";
import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  applyCoinWalletMigrations
} from "../services/platform/coin-wallet-migrations.mjs";
import {
  REQUIRED_DEFERRED_RESOURCE_TRANSITION_DDL_CHECKSUM,
  REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID,
  applyDeferredResourceTransitionMigrations
} from "../services/platform/deferred-resource-transition-migrations.mjs";
import {
  createSqliteSubscriptionControlStore
} from "../services/platform/subscription-control-db.mjs";
import {
  createWalletFirstDeferredTransitionRuntime
} from "../services/platform/wallet-first-deferred-transition-runtime.mjs";
import {
  createWalletFirstSetupDeliveryEscrow
} from "../services/platform/wallet-first-setup-delivery-escrow.mjs";
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
  WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_TABLE,
  applyWalletFirstSetupDeliveryHandoffsMigrations
} from "../services/platform/wallet-first-setup-delivery-handoffs-migrations.mjs";
import {
  createSubscriptionCore
} from "../services/subscriptions/core.mjs";
import {
  createSqliteSubscriptionStore
} from "../services/subscriptions/repository.mjs";

const ACCOUNT_ID = "acct_runtime_e2e";
const NODE_ID = "node_runtime_e2e";
const INITIAL_NOW = "2030-01-01T00:00:00.000Z";
const MONTHLY_OFFER = Object.freeze({
  offerRef: "offer_plan_30d_50gb_monthly",
  offerVersionRef: "offerv_plan_30d_50gb_monthly_v1",
  version: 1,
  category: "plan",
  title: Object.freeze({ zh: "50 GB 月度套餐", en: "50 GB monthly plan" }),
  summary: Object.freeze({ zh: "每月 50 GB", en: "50 GB per month" }),
  importantNotices: Object.freeze({
    zh: Object.freeze(["仅用于平台订阅服务"]),
    en: Object.freeze(["Platform subscription only"])
  }),
  baseCoinUnits: 20,
  referencePrice: Object.freeze({ currency: "CNY", amountMinor: 2_000 }),
  acceptedCoinTypes: Object.freeze(["paid_coins"]),
  delivery: Object.freeze({
    kind: "subscription_plan",
    durationDays: 30,
    monthlyTrafficGb: 50,
    trafficGb: null,
    neverExpires: false,
    discountBasisPoints: 0
  })
});
const ANNUAL_OFFER = Object.freeze({
  offerRef: "offer_plan_365d_200gb_monthly",
  offerVersionRef: "offerv_plan_365d_200gb_monthly_v1",
  version: 1,
  category: "plan",
  title: Object.freeze({ zh: "200 GB 年度套餐", en: "200 GB annual plan" }),
  summary: Object.freeze({ zh: "每月 200 GB", en: "200 GB per month" }),
  importantNotices: Object.freeze({
    zh: Object.freeze(["仅用于平台订阅服务"]),
    en: Object.freeze(["Platform subscription only"])
  }),
  baseCoinUnits: 200,
  referencePrice: Object.freeze({ currency: "CNY", amountMinor: 20_000 }),
  acceptedCoinTypes: Object.freeze(["paid_coins"]),
  delivery: Object.freeze({
    kind: "subscription_plan",
    durationDays: 365,
    monthlyTrafficGb: 200,
    trafficGb: null,
    neverExpires: false,
    discountBasisPoints: 0
  })
});

function plusMilliseconds(timestamp, milliseconds) {
  return new Date(Date.parse(timestamp) + milliseconds).toISOString();
}

function operation(idempotencyKey) {
  return {
    actorScope: `portal:${ACCOUNT_ID}`,
    idempotencyKey,
    actorType: "portal_user",
    actorRef: ACCOUNT_ID
  };
}

function applyWalletFirstMigrations(database, nowFn, { setupDeliveryEnabled = false } = {}) {
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
  applyDeferredResourceTransitionMigrations({
    database,
    expectedMigrationId: REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID,
    expectedDdlChecksum: REQUIRED_DEFERRED_RESOURCE_TRANSITION_DDL_CHECKSUM,
    nowFn
  });
  applyWalletFirstDeferredCheckoutMigrations({
    database,
    expectedMigrationId: REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID,
    expectedDdlChecksum: WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATIONS[0].ddlChecksum,
    nowFn
  });
  applyWalletFirstResourceEffectRuntimeClaimsMigrations({
    database,
    expectedMigrationId:
      REQUIRED_WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_MIGRATION_ID,
    expectedDdlChecksum:
      WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_MIGRATIONS[0].ddlChecksum,
    nowFn
  });
  if (setupDeliveryEnabled) {
    applyWalletFirstSetupDeliveryHandoffsMigrations({
      database,
      expectedMigrationId: REQUIRED_WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_MIGRATION_ID,
      expectedDdlChecksum: WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_MIGRATIONS[0].ddlChecksum,
      nowFn
    });
  }
}

function createFixture({ setupDeliveryRuntimeEscrow = null } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "wallet-first-runtime-e2e-"));
  const controlDbPath = join(directory, "control.sqlite");
  const runtimeDbPath = join(directory, "runtime.sqlite");
  const clock = { value: INITIAL_NOW };
  const nowFn = () => new Date(clock.value);
  const controlDatabase = new Database(controlDbPath);
  controlDatabase.pragma("foreign_keys = ON");
  const controlStore = createSqliteSubscriptionControlStore({
    database: controlDatabase
  });
  applyWalletFirstMigrations(controlDatabase, nowFn, {
    setupDeliveryEnabled: setupDeliveryRuntimeEscrow !== null
  });
  const commerceStore = createSqliteCoinCommerceStore({
    database: controlDatabase
  });
  commerceStore.bootstrapPublishedOffers([MONTHLY_OFFER, ANNUAL_OFFER]);
  controlStore.createAccount({
    id: ACCOUNT_ID,
    ownerRef: "owner_runtime_e2e",
    status: "active",
    createdAt: clock.value,
    updatedAt: clock.value,
    metadata: { commercialModel: "wallet_first_unique_v1" }
  });
  commerceStore.walletStore.creditCoins({
    accountId: ACCOUNT_ID,
    coinType: "paid_coins",
    amountUnits: MONTHLY_OFFER.baseCoinUnits + ANNUAL_OFFER.baseCoinUnits,
    availability: "available",
    sourceType: "wallet_first_runtime_e2e",
    sourceRef: "wallet_first_runtime_e2e_credit",
    sourceDigest: "a".repeat(64),
    policyRef: null,
    policyVersion: null,
    expiresAt: null,
    operation: {
      actorScope: `system:${ACCOUNT_ID}`,
      idempotencyKey: "wallet_first_runtime_e2e_credit",
      actorType: "commerce_system",
      actorRef: "wallet_first_runtime_e2e"
    }
  });

  const runtimeDatabase = new Database(runtimeDbPath);
  const subscriptionStore = createSqliteSubscriptionStore({
    database: runtimeDatabase
  });
  let tenantCount = 0;
  let artifactCount = 0;
  const subscriptionCore = createSubscriptionCore({
    store: subscriptionStore,
    proxyConfig: {
      servers: [{
        id: NODE_ID,
        name: NODE_ID,
        host: "203.0.113.7",
        port: 443,
        method: "aes-256-gcm",
        password: "synthetic-runtime-e2e-password"
      }]
    },
    publicSubscriptionBaseUrl: "https://gateway.example.test",
    nowFn,
    tokenFactory: () => ({
      rawToken: "pgsub_runtime_e2e_token",
      tokenHash: "b".repeat(64),
      tokenPrefix: "pgsub_runtime_e2e"
    }),
    artifactSecretFactory: () => "artifact_runtime_e2e_secret",
    idFactory: () => `tenant_runtime_e2e_${++tenantCount}`,
    artifactIdFactory: () => `artifact_runtime_e2e_${++artifactCount}`
  });
  const runtime = createWalletFirstDeferredTransitionRuntime({
    dbPath: controlDbPath,
    controlStore,
    subscriptionCore,
    nodeId: NODE_ID,
    nowFn,
    ...(setupDeliveryRuntimeEscrow ? { setupDeliveryRuntimeEscrow } : {})
  });
  return {
    controlDatabase,
    controlStore,
    commerceStore,
    runtimeDatabase,
    subscriptionStore,
    subscriptionCore,
    runtime,
    clock,
    setNow(value) {
      clock.value = value;
    },
    close() {
      runtime.close();
      commerceStore.close();
      controlStore.close();
      subscriptionStore.close();
      controlDatabase.close();
      runtimeDatabase.close();
      rmSync(directory, { recursive: true, force: true });
    }
  };
}

test("runtime forwards but never closes the factory-owned setup delivery escrow", () => {
  const escrowDirectory = mkdtempSync(join(tmpdir(), "wallet-first-runtime-owned-escrow-"));
  const setup = createWalletFirstSetupDeliveryEscrow({
    key: Buffer.from("00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff", "hex"),
    filePath: join(escrowDirectory, "setup-delivery-escrow.json")
  });
  const fixture = createFixture({
    setupDeliveryRuntimeEscrow: setup.runtimeEscrow
  });
  try {
    fixture.runtime.close();
    assert.doesNotThrow(() => setup.runtimeEscrow.captureInitialSetupDelivery({
      transitionRef: "transition_runtime_escrow_001",
      effectRef: "effect_runtime_escrow_001",
      tenantId: "tenant_runtime_escrow_001",
      artifactId: "artifact_runtime_escrow_001",
      subscriptionUrl: "https://gateway.example.test/sub/runtime-escrow?token=synthetic"
    }));
  } finally {
    fixture.close();
    setup.close();
    rmSync(escrowDirectory, { recursive: true, force: true });
  }
});

test("escrow-enabled runtime settles one initial handoff and keeps scheduled effects handoff-free", async (t) => {
  const escrowDirectory = mkdtempSync(join(tmpdir(), "wallet-first-runtime-coordinator-escrow-"));
  const setup = createWalletFirstSetupDeliveryEscrow({
    key: Buffer.from("00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff", "hex"),
    filePath: join(escrowDirectory, "setup-delivery-escrow.json")
  });
  const fixture = createFixture({ setupDeliveryRuntimeEscrow: setup.runtimeEscrow });
  t.after(() => {
    fixture.close();
    setup.close();
    rmSync(escrowDirectory, { recursive: true, force: true });
  });

  const initialQuote = fixture.runtime.walletFirstCommerceService.previewDeferredCheckout({
    accountId: ACCOUNT_ID,
    offerRef: MONTHLY_OFFER.offerRef
  });
  const initialTransition = fixture.runtime.walletFirstCommerceService.reserveDeferredTransition({
    accountId: ACCOUNT_ID,
    quoteRef: initialQuote.quoteRef,
    operation: operation("runtime_escrow_initial_reserve")
  });
  const initialResult = await fixture.runtime.deferredTransitionCoordinator.runOnce();
  assert.equal(initialResult.effectApplied, 1);
  assert.equal(initialResult.settled, 1);
  assert.equal(initialResult.reconciliationRequired, 0);

  const initialEffect = await fixture.runtime.resourceEffectHandler
    .resolveDeferredResourceTransitionEffect({ transitionRef: initialTransition.transitionRef });
  assert.match(initialEffect.setupDeliveryHandoffRef, /^wfxsetup_[a-f0-9]{48}$/);
  const handoff = fixture.controlDatabase.prepare(`
    select handoff_ref, initial_transition_ref, effect_ref, status
      from ${WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_TABLE}
  `).get();
  assert.deepEqual(handoff, {
    handoff_ref: initialEffect.setupDeliveryHandoffRef,
    initial_transition_ref: initialTransition.transitionRef,
    effect_ref: initialEffect.effectRef,
    status: "pending"
  });
  const initialReceipt = fixture.controlStore
    .getWalletFirstRuntimeReceiptForDeferredTransition({
      transitionRef: initialTransition.transitionRef
    });
  assert.equal(
    setup.deliveryEscrow.getSetupDeliverySummary({
      transitionRef: initialTransition.transitionRef,
      effectRef: initialEffect.effectRef,
      tenantId: initialReceipt.tenantId,
      artifactId: initialReceipt.artifactId
    }).handoffRef,
    initialEffect.setupDeliveryHandoffRef
  );

  const initialChain = fixture.runtime.resourceEffectHandler
    .resolveCurrentResourceChain({ accountId: ACCOUNT_ID });
  await fixture.runtime.deferredTransitionCoordinator.runOnce();
  fixture.setNow(plusMilliseconds(INITIAL_NOW, 1_000));
  const scheduledQuote = fixture.runtime.walletFirstCommerceService.previewDeferredCheckout({
    accountId: ACCOUNT_ID,
    offerRef: ANNUAL_OFFER.offerRef
  });
  const scheduledTransition = fixture.runtime.walletFirstCommerceService.reserveDeferredTransition({
    accountId: ACCOUNT_ID,
    quoteRef: scheduledQuote.quoteRef,
    operation: operation("runtime_escrow_scheduled_reserve")
  });
  fixture.setNow(initialChain.validUntil);
  const scheduledResult = await fixture.runtime.deferredTransitionCoordinator.runOnce();
  assert.equal(scheduledResult.effectApplied, 1);
  assert.equal(scheduledResult.settled, 1);
  assert.equal(scheduledResult.reconciliationRequired, 0);
  const scheduledEffect = await fixture.runtime.resourceEffectHandler
    .resolveDeferredResourceTransitionEffect({ transitionRef: scheduledTransition.transitionRef });
  assert.equal(Object.hasOwn(scheduledEffect, "setupDeliveryHandoffRef"), false);
  assert.equal(
    fixture.controlDatabase.prepare(`
      select count(*) from ${WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_TABLE}
    `).pluck().get(),
    1
  );
});

test("a deleted initial handoff makes coordinator recovery reconcile instead of settle", async (t) => {
  const escrowDirectory = mkdtempSync(join(tmpdir(), "wallet-first-runtime-deleted-handoff-"));
  const setup = createWalletFirstSetupDeliveryEscrow({
    key: Buffer.from("00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff", "hex"),
    filePath: join(escrowDirectory, "setup-delivery-escrow.json")
  });
  const fixture = createFixture({ setupDeliveryRuntimeEscrow: setup.runtimeEscrow });
  t.after(() => {
    fixture.close();
    setup.close();
    rmSync(escrowDirectory, { recursive: true, force: true });
  });

  const quote = fixture.runtime.walletFirstCommerceService.previewDeferredCheckout({
    accountId: ACCOUNT_ID,
    offerRef: MONTHLY_OFFER.offerRef
  });
  const transition = fixture.runtime.walletFirstCommerceService.reserveDeferredTransition({
    accountId: ACCOUNT_ID,
    quoteRef: quote.quoteRef,
    operation: operation("runtime_deleted_handoff_reserve")
  });
  const claimed = fixture.runtime.deferredTransitionStore.claimNextDueTransition({ leaseMs: 60_000 });
  assert.equal(claimed.transitionRef, transition.transitionRef);
  const applied = await fixture.runtime.resourceEffectHandler.applyDeferredResourceTransition({
    transitionRef: claimed.transitionRef,
    accountId: claimed.accountId,
    orderRef: claimed.orderRef,
    flowKind: claimed.flowKind,
    offer: claimed.offer,
    scheduledFor: claimed.scheduledFor,
    expectedEntitlementId: claimed.expectedEntitlementId,
    expectedRequestId: claimed.expectedRequestId,
    expectedIssuedLinkId: claimed.expectedIssuedLinkId,
    expectedValidUntil: claimed.expectedValidUntil,
    activationAt: INITIAL_NOW
  });
  assert.match(applied.setupDeliveryHandoffRef, /^wfxsetup_[a-f0-9]{48}$/);
  fixture.controlDatabase.prepare(`
    delete from ${WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_TABLE} where handoff_ref = ?
  `).run(applied.setupDeliveryHandoffRef);

  fixture.setNow(plusMilliseconds(INITIAL_NOW, 61_000));
  const recovered = await fixture.runtime.deferredTransitionCoordinator.runOnce();
  assert.equal(recovered.effectApplied, 0);
  assert.equal(recovered.settled, 0);
  assert.equal(recovered.reconciliationRequired, 1);
  assert.equal(
    fixture.controlDatabase.prepare(`
      select state from platform_deferred_resource_transitions where transition_ref = ?
    `).pluck().get(transition.transitionRef),
    "reconciliation_required"
  );
  assert.equal(fixture.subscriptionCore.listTenants().length, 1);
});

test("concrete wallet-first runtime recovers an expired scheduled-switch lease through the normal coordinator", async (t) => {
  const fixture = createFixture();
  t.after(() => fixture.close());

  const initialQuote = fixture.runtime.walletFirstCommerceService
    .previewDeferredCheckout({
      accountId: ACCOUNT_ID,
      offerRef: MONTHLY_OFFER.offerRef
    });
  assert.equal(initialQuote.offer.version, 1);
  // The fixture deliberately uses the default Wallet ref factory, whose
  // UUID-backed lot references contain hyphens.
  const initialTransition = fixture.runtime.walletFirstCommerceService
    .reserveDeferredTransition({
      accountId: ACCOUNT_ID,
      quoteRef: initialQuote.quoteRef,
      operation: operation("runtime_e2e_initial_reserve")
    });
  assert.equal(initialTransition.state, "reserved");
  const initialResult = await fixture.runtime.deferredTransitionCoordinator.runOnce();
  assert.equal(initialResult.effectApplied, 1);
  assert.equal(initialResult.settled, 1);
  assert.equal(initialResult.reconciliationRequired, 0);
  assert.equal(
    fixture.controlDatabase.prepare(`
      select state from platform_deferred_resource_transitions where transition_ref = ?
    `).pluck().get(initialTransition.transitionRef),
    "settled"
  );
  const initialChain = fixture.runtime.resourceEffectHandler
    .resolveCurrentResourceChain({ accountId: ACCOUNT_ID });
  assert.equal(initialChain.state, "current");
  const initialTenant = fixture.subscriptionCore.listTenants()[0];
  assert.ok(initialTenant);
  assert.match(initialTenant.note, /^wallet_first_resource_effect_v1:wfxm_[a-f0-9]{24}$/);
  assert.equal(initialTenant.note.includes(initialTransition.transitionRef), false);
  const initialArtifacts = fixture.subscriptionCore
    .listSubscriptionArtifacts(initialTenant.id);
  assert.equal(initialArtifacts.length, 1);

  // Initial settlement enqueues its durable rebase outbox. Drain it through
  // the same coordinator before creating a later same-account transition.
  const initialRebase = await fixture.runtime.deferredTransitionCoordinator.runOnce();
  assert.equal(initialRebase.effectApplied, 0);
  assert.equal(initialRebase.settled, 0);
  assert.equal(initialRebase.rebased, 1);
  assert.equal(initialRebase.reconciliationRequired, 0);

  fixture.setNow(plusMilliseconds(INITIAL_NOW, 1_000));
  const scheduledQuote = fixture.runtime.walletFirstCommerceService
    .previewDeferredCheckout({
      accountId: ACCOUNT_ID,
      offerRef: ANNUAL_OFFER.offerRef
    });
  assert.equal(scheduledQuote.transition.flowKind, "scheduled_switch");
  assert.equal(scheduledQuote.transition.scheduledFor, initialChain.validUntil);
  const scheduledTransition = fixture.runtime.walletFirstCommerceService
    .reserveDeferredTransition({
      accountId: ACCOUNT_ID,
      quoteRef: scheduledQuote.quoteRef,
      operation: operation("runtime_e2e_scheduled_reserve")
    });
  assert.equal(scheduledTransition.state, "reserved");

  fixture.setNow(initialChain.validUntil);
  const crashedClaim = fixture.runtime.deferredTransitionStore
    .claimNextDueTransition({ leaseMs: 60_000 });
  assert.equal(crashedClaim.transitionRef, scheduledTransition.transitionRef);
  assert.equal(crashedClaim.leaseGeneration, 1);
  assert.equal(fixture.subscriptionCore.listTenants().length, 1);

  // Let the outer lease expire before the coordinator reaches normal runtime
  // preparation, inner lease, Core mutation, or Coins capture.
  fixture.setNow(plusMilliseconds(initialChain.validUntil, 61_000));
  assert.ok(
    Date.parse(fixture.clock.value) > Date.parse(initialChain.validUntil),
    "recovery runs after natural predecessor expiry"
  );
  const recovered = await fixture.runtime.deferredTransitionCoordinator.runOnce();
  assert.equal(recovered.effectApplied, 1);
  assert.equal(recovered.settled, 1);
  assert.equal(recovered.reconciliationRequired, 0);
  assert.deepEqual(
    fixture.controlDatabase.prepare(`
      select state, lease_generation
        from platform_deferred_resource_transitions
       where transition_ref = ?
    `).get(scheduledTransition.transitionRef),
    { state: "settled", lease_generation: 2 }
  );
  assert.deepEqual(
    fixture.controlDatabase.prepare(`
      select status, lease_generation
        from platform_wallet_first_resource_effect_runtime_claims
       where transition_ref = ?
    `).get(scheduledTransition.transitionRef),
    { status: "recorded", lease_generation: 1 }
  );

  const finalChain = fixture.runtime.resourceEffectHandler
    .resolveCurrentResourceChain({ accountId: ACCOUNT_ID });
  assert.equal(finalChain.state, "current");
  assert.equal(finalChain.entitlementId, initialChain.entitlementId);
  assert.equal(finalChain.requestId, initialChain.requestId);
  assert.equal(finalChain.issuedLinkId, initialChain.issuedLinkId);
  assert.equal(finalChain.validUntil, plusMilliseconds(fixture.clock.value, 365 * 86_400_000));
  assert.equal(fixture.subscriptionCore.listTenants().length, 1);
  assert.equal(
    fixture.subscriptionCore.listSubscriptionArtifacts(initialTenant.id).length,
    1
  );
  assert.equal(
    fixture.commerceStore.walletStore.getWalletProjection({ accountId: ACCOUNT_ID })
      .heldUnits,
    0
  );
  assert.equal(
    fixture.commerceStore.walletStore.getWalletProjection({ accountId: ACCOUNT_ID })
      .spendableUnits,
    0
  );
  assert.equal(
    fixture.controlDatabase.prepare(
      "select count(*) from platform_coin_commerce_orders"
    ).pluck().get(),
    0
  );
  assert.equal(
    fixture.controlDatabase.prepare(
      "select count(*) from platform_coin_holds"
    ).pluck().get(),
    0
  );

  const afterRecovery = await fixture.runtime.deferredTransitionCoordinator.runOnce();
  assert.equal(afterRecovery.effectApplied, 0);
  assert.equal(afterRecovery.settled, 0);
  assert.equal(afterRecovery.reconciliationRequired, 0);
  assert.equal(fixture.subscriptionCore.listTenants().length, 1);
  assert.equal(
    fixture.subscriptionCore.listSubscriptionArtifacts(initialTenant.id).length,
    1
  );
});
