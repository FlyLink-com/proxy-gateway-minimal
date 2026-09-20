import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";

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
  createSqliteSubscriptionControlStore
} from "../services/platform/subscription-control-db.mjs";
import {
  WALLET_FIRST_RESOURCE_EFFECT_CONTROL_ADAPTER_CONTRACT,
  WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_ADAPTER_CONTRACT,
  createWalletFirstResourceEffectAdapters
} from "../services/platform/wallet-first-resource-effect-adapter.mjs";
import {
  createWalletFirstResourceEffectHandler
} from "../services/platform/wallet-first-resource-effect-handler.mjs";
import {
  createSubscriptionCore
} from "../services/subscriptions/core.mjs";
import {
  createSqliteSubscriptionStore
} from "../services/subscriptions/repository.mjs";

const INITIAL_NOW = "2026-08-13T00:00:00.000Z";

function planOffer({ offerVersionRef, durationDays, monthlyTrafficGb }) {
  return {
    offerRef: `offer_${offerVersionRef}`,
    offerVersionRef,
    version: 1,
    category: "plan",
    title: { zh: "合成钱包优先套餐", en: "Synthetic wallet-first plan" },
    summary: { zh: "本地处理器测试夹具", en: "Local handler test fixture" },
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

function initialInput({
  transitionRef = "transition_handler_initial",
  orderRef = "deferred_order_handler_initial",
  activationAt = INITIAL_NOW
} = {}) {
  return {
    transitionRef,
    accountId: "acct_handler",
    orderRef,
    flowKind: "initial_activation",
    offer: planOffer({
      offerVersionRef: "offerv_plan_30d_50gb_monthly_v1",
      durationDays: 30,
      monthlyTrafficGb: 50
    }),
    scheduledFor: activationAt,
    expectedEntitlementId: null,
    expectedRequestId: null,
    expectedIssuedLinkId: null,
    expectedValidUntil: null,
    activationAt
  };
}

function scheduledInput(chain, {
  transitionRef = "transition_handler_scheduled",
  orderRef = "deferred_order_handler_scheduled",
  activationAt = chain.validUntil
} = {}) {
  return {
    transitionRef,
    accountId: "acct_handler",
    orderRef,
    flowKind: "scheduled_switch",
    offer: planOffer({
      offerVersionRef: "offerv_plan_365d_200gb_monthly_v1",
      durationDays: 365,
      monthlyTrafficGb: 200
    }),
    scheduledFor: chain.validUntil,
    expectedEntitlementId: chain.entitlementId,
    expectedRequestId: chain.requestId,
    expectedIssuedLinkId: chain.issuedLinkId,
    expectedValidUntil: chain.validUntil,
    activationAt
  };
}

function applyWalletFirstMigrations(database, nowFn) {
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
}

function createFixture({ commercialModel = "wallet_first_unique_v1" } = {}) {
  let now = INITIAL_NOW;
  const controlDatabase = new Database(":memory:");
  const runtimeDatabase = new Database(":memory:");
  const controlStore = createSqliteSubscriptionControlStore({ database: controlDatabase });
  applyWalletFirstMigrations(controlDatabase, () => new Date(now));
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
      rawToken: "pgsub_synthetic_handler_001",
      tokenHash: "a".repeat(64),
      tokenPrefix: "pgsub_synthetic"
    }),
    artifactSecretFactory: () => "artifact_synthetic_handler_001",
    idFactory: () => "tenant_handler_001",
    artifactIdFactory: () => "artifact_handler_001"
  });
  controlStore.createAccount({
    id: "acct_handler",
    ownerRef: "owner_handler",
    status: "active",
    createdAt: now,
    updatedAt: now,
    metadata: { commercialModel }
  });
  const adapters = createWalletFirstResourceEffectAdapters({
    controlStore,
    subscriptionCore,
    nodeId: "node_alpha",
    nowFn: () => new Date(now)
  });
  return {
    controlDatabase,
    controlStore,
    subscriptionCore,
    handler: createWalletFirstResourceEffectHandler(adapters),
    setNow(value) {
      now = value;
    },
    close() {
      controlStore.close();
      runtimeStore.close();
    }
  };
}

test("handler applies a factory-branded initial activation once and never creates an ordinary Commerce order", async (t) => {
  const fixture = createFixture();
  t.after(() => fixture.close());

  const input = initialInput();
  const first = await fixture.handler.applyDeferredResourceTransition(input);
  const replay = await fixture.handler.applyDeferredResourceTransition(input);

  assert.deepEqual(replay, first);
  assert.equal(first.status, "applied");
  assert.equal(fixture.subscriptionCore.listTenants().length, 1);
  assert.equal(
    fixture.controlDatabase.prepare(
      "select count(*) from platform_coin_commerce_orders"
    ).pluck().get(),
    0
  );
  const chain = fixture.handler.resolveCurrentResourceChain({ accountId: "acct_handler" });
  assert.equal(chain.state, "current");
  assert.equal(chain.entitlementId, first.nextEntitlementId);
  assert.equal(chain.requestId, first.nextRequestId);
  assert.equal(chain.issuedLinkId, first.nextIssuedLinkId);
});

test("handler rejects a second initial activation after a marked chain exists", async (t) => {
  const fixture = createFixture();
  t.after(() => fixture.close());

  await fixture.handler.applyDeferredResourceTransition(initialInput());
  await assert.rejects(
    fixture.handler.applyDeferredResourceTransition(initialInput({
      transitionRef: "transition_handler_second_initial",
      orderRef: "deferred_order_handler_second_initial"
    })),
    (error) => error?.code === "wallet_first_resource_effect_chain_changed"
  );
  assert.equal(fixture.subscriptionCore.listTenants().length, 1);
});

test("handler applies only an exact scheduled switch through the same branded chain", async (t) => {
  const fixture = createFixture();
  t.after(() => fixture.close());

  await fixture.handler.applyDeferredResourceTransition(initialInput());
  const before = fixture.handler.resolveCurrentResourceChain({ accountId: "acct_handler" });
  fixture.setNow(before.validUntil);
  const switched = await fixture.handler.applyDeferredResourceTransition(
    scheduledInput(before)
  );
  const after = fixture.handler.resolveCurrentResourceChain({ accountId: "acct_handler" });

  assert.equal(after.entitlementId, before.entitlementId);
  assert.equal(after.requestId, before.requestId);
  assert.equal(after.issuedLinkId, before.issuedLinkId);
  assert.equal(after.validUntil, switched.nextValidUntil);
  assert.equal(fixture.subscriptionCore.listTenants().length, 1);

  const mismatched = scheduledInput(after, {
    transitionRef: "transition_handler_mismatched",
    orderRef: "deferred_order_handler_mismatched",
    activationAt: after.validUntil
  });
  mismatched.expectedRequestId = "request_handler_wrong";
  await assert.rejects(
    fixture.handler.applyDeferredResourceTransition(mismatched),
    (error) => error?.code === "wallet_first_resource_effect_chain_changed"
  );
});

test("handler verifies a durable receipt against the concrete runtime before replay", async (t) => {
  const fixture = createFixture();
  t.after(() => fixture.close());

  const input = initialInput();
  await fixture.handler.applyDeferredResourceTransition(input);
  fixture.subscriptionCore.disableTenant(fixture.subscriptionCore.listTenants()[0].id);

  await assert.rejects(
    fixture.handler.applyDeferredResourceTransition(input),
    (error) => error?.code === "wallet_first_resource_effect_unavailable"
  );
});

test("handler accepts only a canonical full Commerce offer before projecting to its narrow resource contract", async (t) => {
  const fixture = createFixture();
  t.after(() => fixture.close());

  const missingVersion = initialInput({
    transitionRef: "transition_handler_missing_version",
    orderRef: "deferred_order_handler_missing_version"
  });
  delete missingVersion.offer.version;
  const extraField = initialInput({
    transitionRef: "transition_handler_extra_offer_field",
    orderRef: "deferred_order_handler_extra_offer_field"
  });
  extraField.offer = {
    ...extraField.offer,
    untrustedResourceHint: "never-forwarded"
  };

  for (const input of [missingVersion, extraField]) {
    await assert.rejects(
      fixture.handler.applyDeferredResourceTransition(input),
      (error) => error?.code === "wallet_first_resource_effect_invalid"
    );
  }
  assert.equal(fixture.subscriptionCore.listTenants().length, 0);
  assert.equal(fixture.controlDatabase.prepare(`
    select count(*) from platform_wallet_first_resource_effect_runtime_claims
  `).pluck().get(), 0);
});

test("handler requires the exact server-side wallet-first marker", (t) => {
  const fixture = createFixture({ commercialModel: "legacy" });
  t.after(() => fixture.close());

  assert.throws(
    () => fixture.handler.resolveCurrentResourceChain({ accountId: "acct_handler" }),
    (error) => error?.code === "wallet_first_resource_effect_account_invalid"
  );
});

test("control-store current-resource reader emits only a verified safe Portal projection", async (t) => {
  const fixture = createFixture();
  t.after(() => fixture.close());

  const applied = await fixture.handler.applyDeferredResourceTransition(initialInput());
  const resource = fixture.controlStore.readWalletFirstCurrentResourceProjection({
    accountId: "acct_handler"
  });

  assert.deepEqual(resource, {
    state: "available",
    plan: {
      id: "monthly_30d_50gb",
      durationDays: 30,
      monthlyTrafficGb: 50
    },
    validUntil: applied.nextValidUntil,
    setupAvailable: false
  });
  assert.doesNotMatch(
    JSON.stringify(resource),
    /account|entitlement|request|issued|link|tenant|artifact|node|transition|url|material/i
  );
});

test("control-store current-resource reader returns none only for a verified wallet-first account with no chain", (t) => {
  const fixture = createFixture();
  t.after(() => fixture.close());

  assert.deepEqual(
    fixture.controlStore.readWalletFirstCurrentResourceProjection({
      accountId: "acct_handler"
    }),
    { state: "none" }
  );
});

test("current overview reads actual current-cycle samples and distinguishes missing, zero and stale measurements", async (t) => {
  const fixture = createFixture();
  t.after(() => fixture.close());
  const read = (now = INITIAL_NOW) => fixture.controlStore.readWalletFirstCurrentResourceOverview({ accountId: "acct_handler", now });
  assert.deepEqual(read(), { state: "none" });
  await fixture.handler.applyDeferredResourceTransition(initialInput());
  const chain = fixture.handler.resolveCurrentResourceChain({ accountId: "acct_handler" });
  const pending = read();
  assert.match(pending.resourceRef, /^resource_[a-f0-9]{64}$/);
  assert.equal(pending.usage.collectionStatus, "pending");
  assert.equal(pending.usage.usedBytes, null);
  assert.equal(pending.usage.remainingBytes, null);
  const record = (id, bytes, observedAt = INITIAL_NOW, accountId = "acct_handler") => fixture.controlStore.recordUsageSample({
    id, sourceRef: "source_test", channelRef: "channel_test", edgeCredentialRef: "edge_test",
    accountId, entitlementId: chain.entitlementId, requestId: chain.requestId,
    observedAt, intervalStartedAt: observedAt, intervalEndedAt: observedAt,
    uploadBytes: 0, downloadBytes: bytes, totalBytes: bytes, sampleDigest: id, createdAt: observedAt
  });
  record("sample_zero", 0);
  assert.equal(read().usage.collectionStatus, "measured_zero");
  assert.equal(read().usage.usedBytes, 0);
  record("sample_used", 1024);
  record("sample_previous_period", 4096, "2026-08-12T23:59:59.000Z");
  record("sample_future", 8192, "2026-08-13T02:00:00.000Z");
  fixture.controlStore.createAccount({ id: "acct_other", ownerRef: "owner_other", status: "active", createdAt: INITIAL_NOW, updatedAt: INITIAL_NOW });
  record("sample_other_account", 16384, INITIAL_NOW, "acct_other");
  const measured = read();
  assert.equal(measured.resourceRef, pending.resourceRef);
  assert.equal(measured.usage.usedBytes, 1024);
  assert.equal(measured.usage.remainingBytes, measured.usage.totalBytes - 1024);
  assert.equal(measured.usage.collectionStatus, "measured");
  assert.equal(read("2026-08-13T00:06:00.000Z").usage.collectionStatus, "stale");
  assert.doesNotMatch(JSON.stringify(measured), /acct_handler|wfxreq_|wfxent_|wfxlink_|edge_test|tenant_|artifact_|subscriptionUrl/);
});

test("current overview changes its public resource identity after a switch and excludes the previous plan usage", async (t) => {
  const fixture = createFixture();
  t.after(() => fixture.close());
  await fixture.handler.applyDeferredResourceTransition(initialInput());
  const chain = fixture.handler.resolveCurrentResourceChain({ accountId: "acct_handler" });
  const before = fixture.controlStore.readWalletFirstCurrentResourceOverview({ accountId: "acct_handler", now: INITIAL_NOW });
  fixture.controlStore.recordUsageSample({ id: "sample_before_switch", sourceRef: "source_test", channelRef: "channel_test", edgeCredentialRef: "edge_test", accountId: "acct_handler", entitlementId: chain.entitlementId, requestId: chain.requestId, observedAt: INITIAL_NOW, intervalStartedAt: INITIAL_NOW, intervalEndedAt: INITIAL_NOW, uploadBytes: 0, downloadBytes: 10, totalBytes: 10, sampleDigest: "sample_before_switch", createdAt: INITIAL_NOW });
  fixture.setNow(chain.validUntil);
  await fixture.handler.applyDeferredResourceTransition(scheduledInput(chain));
  const after = fixture.controlStore.readWalletFirstCurrentResourceOverview({ accountId: "acct_handler", now: chain.validUntil });
  assert.notEqual(after.resourceRef, before.resourceRef);
  assert.equal(after.plan.monthlyTrafficGb, 200);
  assert.equal(after.usage.collectionStatus, "pending");
  assert.equal(after.usage.usedBytes, null);
  assert.equal(after.usage.cycleStartedAt, chain.validUntil);
});

test("control-store current-resource reader rejects a model mismatch and requires reconciliation for a missing receipt", async (t) => {
  const legacyFixture = createFixture({ commercialModel: "legacy" });
  const receiptFixture = createFixture();
  t.after(() => legacyFixture.close());
  t.after(() => receiptFixture.close());

  assert.throws(
    () => legacyFixture.controlStore.readWalletFirstCurrentResourceProjection({
      accountId: "acct_handler"
    }),
    (error) => error?.code === "validation_error"
  );

  await receiptFixture.handler.applyDeferredResourceTransition(initialInput());
  receiptFixture.controlDatabase.prepare("delete from platform_audit_events").run();
  assert.deepEqual(
    receiptFixture.controlStore.readWalletFirstCurrentResourceProjection({
      accountId: "acct_handler"
    }),
    { state: "reconciliation_required" }
  );
});

test("handler rejects a forged control/runtime pair even with matching public strings", () => {
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
