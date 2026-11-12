import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { seedAccountModelForTest } from "./helpers/account-model-seed.mjs";
import { fileURLToPath } from "node:url";

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
  REQUIRED_WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_MIGRATION_ID,
  WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_MIGRATIONS,
  WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_TABLE,
  applyWalletFirstSetupDeliveryHandoffsMigrations,
  dryRunWalletFirstSetupDeliveryHandoffsMigrations,
  validateWalletFirstSetupDeliveryHandoffsSchema
} from "../services/platform/wallet-first-setup-delivery-handoffs-migrations.mjs";
import {
  createSqliteSubscriptionControlStore
} from "../services/platform/subscription-control-db.mjs";
import {
  createWalletFirstResourceEffectAdapters
} from "../services/platform/wallet-first-resource-effect-adapter.mjs";
import {
  createWalletFirstResourceEffectHandler
} from "../services/platform/wallet-first-resource-effect-handler.mjs";
import {
  createWalletFirstSetupDeliveryEscrow
} from "../services/platform/wallet-first-setup-delivery-escrow.mjs";
import {
  createSubscriptionCore
} from "../services/subscriptions/core.mjs";
import {
  createSqliteSubscriptionStore
} from "../services/subscriptions/repository.mjs";
import {
  runWalletFirstSetupDeliveryHandoffsSchemaCli
} from "../../scripts/platform-wallet-first-setup-delivery-handoffs-schema.mjs";

const NOW = "2030-01-01T00:00:00.000Z";
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CLI_PATH = join(
  REPOSITORY_ROOT,
  "scripts",
  "platform-wallet-first-setup-delivery-handoffs-schema.mjs"
);

function hash(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function withDatabase(callback) {
  const directory = mkdtempSync(join(tmpdir(), "wallet-first-setup-handoff-"));
  const dbPath = join(directory, "control.sqlite");
  try {
    return await callback({ directory, dbPath });
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

function applyRuntimeClaims(database, nowFn) {
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
    expectedMigrationId: REQUIRED_WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_MIGRATION_ID,
    expectedDdlChecksum: WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_MIGRATIONS[0].ddlChecksum,
    nowFn
  });
}

function bootstrapControlDatabase(database) {
  const controlStore = createSqliteSubscriptionControlStore({ database });
  controlStore.close();
}

function applyHandoffs(database, nowFn) {
  return applyWalletFirstSetupDeliveryHandoffsMigrations({
    database,
    expectedMigrationId: REQUIRED_WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_MIGRATION_ID,
    expectedDdlChecksum: WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_MIGRATIONS[0].ddlChecksum,
    nowFn
  });
}

function createFixture({ migrateHandoffs = true, setupDeliveryRuntimeEscrow = null } = {}) {
  let now = NOW;
  const controlDatabase = new Database(":memory:");
  const runtimeDatabase = new Database(":memory:");
  const controlStore = createSqliteSubscriptionControlStore({ database: controlDatabase });
  applyRuntimeClaims(controlDatabase, () => new Date(now));
  if (migrateHandoffs) applyHandoffs(controlDatabase, () => new Date(now));
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
      rawToken: "pgsub_synthetic_setup_handoff",
      tokenHash: "a".repeat(64),
      tokenPrefix: "pgsub_synthetic"
    }),
    artifactSecretFactory: () => "artifact_synthetic_setup_handoff",
    idFactory: () => "tenant_setup_handoff_001",
    artifactIdFactory: () => "artifact_setup_handoff_001"
  });
  seedAccountModelForTest(controlDatabase, {
    id: "acct_setup_handoff",
    ownerRef: "owner_setup_handoff",
    status: "active",
    createdAt: now,
    updatedAt: now,
    commercialModel: "wallet_first_unique_v1"
  });
  const adapters = createWalletFirstResourceEffectAdapters({
    controlStore,
    subscriptionCore,
    nodeId: "node_alpha",
    nowFn: () => new Date(now),
    ...(setupDeliveryRuntimeEscrow === null ? {} : { setupDeliveryRuntimeEscrow })
  });
  const handler = createWalletFirstResourceEffectHandler(adapters);
  return {
    controlDatabase,
    controlStore,
    handler,
    setNow(value) { now = value; },
    close() {
      controlStore.close();
      runtimeStore.close();
    }
  };
}

function createSetupDeliveryEscrowFixture(t, name) {
  const directory = mkdtempSync(join(tmpdir(), `${name}-`));
  const escrow = createWalletFirstSetupDeliveryEscrow({
    key: Buffer.from(
      "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
      "hex"
    ),
    filePath: join(directory, "setup-delivery-escrow.json"),
    ivFactory: () => Buffer.from("000102030405060708090a0b", "hex")
  });
  t.after(() => escrow.close());
  t.after(() => rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }));
  return escrow;
}

async function applyInitialResource(fixture) {
  return fixture.handler.applyDeferredResourceTransition({
    transitionRef: "transition_setup_handoff_initial",
    accountId: "acct_setup_handoff",
    orderRef: "deferred_order_setup_handoff_initial",
    flowKind: "initial_activation",
    offer: {
      offerRef: "offer_offerv_plan_30d_50gb_monthly_v1",
      offerVersionRef: "offerv_plan_30d_50gb_monthly_v1",
      version: 1,
      category: "plan",
      title: { zh: "合成套餐", en: "Synthetic plan" },
      summary: { zh: "仅测试", en: "Test only" },
      importantNotices: { zh: ["测试"], en: ["Test"] },
      baseCoinUnits: 20,
      referencePrice: { currency: "CNY", amountMinor: 2_000 },
      acceptedCoinTypes: ["bonus_coins", "paid_coins"],
      delivery: {
        kind: "subscription_plan",
        durationDays: 30,
        monthlyTrafficGb: 50,
        trafficGb: null,
        neverExpires: false,
        discountBasisPoints: 0
      }
    },
    scheduledFor: NOW,
    expectedEntitlementId: null,
    expectedRequestId: null,
    expectedIssuedLinkId: null,
    expectedValidUntil: null,
    activationAt: NOW
  });
}

async function applyScheduledResource(fixture, chain) {
  return fixture.handler.applyDeferredResourceTransition({
    transitionRef: "transition_setup_handoff_scheduled",
    accountId: "acct_setup_handoff",
    orderRef: "deferred_order_setup_handoff_scheduled",
    flowKind: "scheduled_switch",
    offer: {
      offerRef: "offer_offerv_plan_365d_200gb_monthly_v1",
      offerVersionRef: "offerv_plan_365d_200gb_monthly_v1",
      version: 1,
      category: "plan",
      title: { zh: "合成续期套餐", en: "Synthetic renewal plan" },
      summary: { zh: "仅测试", en: "Test only" },
      importantNotices: { zh: ["测试"], en: ["Test"] },
      baseCoinUnits: 20,
      referencePrice: { currency: "CNY", amountMinor: 2_000 },
      acceptedCoinTypes: ["bonus_coins", "paid_coins"],
      delivery: {
        kind: "subscription_plan",
        durationDays: 365,
        monthlyTrafficGb: 200,
        trafficGb: null,
        neverExpires: false,
        discountBasisPoints: 0
      }
    },
    scheduledFor: chain.validUntil,
    expectedEntitlementId: chain.entitlementId,
    expectedRequestId: chain.requestId,
    expectedIssuedLinkId: chain.issuedLinkId,
    expectedValidUntil: chain.validUntil,
    activationAt: chain.validUntil
  });
}

function runCli(argv) {
  return spawnSync(process.execPath, [CLI_PATH, ...argv], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    env: {},
    timeout: 15_000,
    windowsHide: true
  });
}

test("setup-delivery handoff schema requires the exact runtime-claim predecessor and is additive", () => withDatabase(({ dbPath }) => {
  const database = new Database(dbPath);
  try {
    bootstrapControlDatabase(database);
    const pending = validateWalletFirstSetupDeliveryHandoffsSchema({ database });
    assert.equal(pending.schemaState, "blocked");
    assert.deepEqual(pending.reasonCodes, ["migration_dependency_missing"]);
    applyRuntimeClaims(database, () => new Date(NOW));
    const readyToApply = validateWalletFirstSetupDeliveryHandoffsSchema({ database });
    assert.equal(readyToApply.schemaState, "pending");
    const first = applyHandoffs(database, () => new Date(NOW));
    const second = applyHandoffs(database, () => new Date(NOW));
    assert.equal(first.ok, true);
    assert.deepEqual(first.appliedMigrationIds, [
      REQUIRED_WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_MIGRATION_ID
    ]);
    assert.equal(second.sourceChanged, false);
    const columns = database.pragma(`table_info(${WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_TABLE})`)
      .map(({ name }) => name);
    for (const required of [
      "handoff_ref", "account_id", "initial_transition_ref", "effect_ref",
      "tenant_ref", "artifact_ref", "idempotency_key_hash", "session_binding_hash",
      "status", "claim_generation", "lease_until", "delivered_at"
    ]) assert.equal(columns.includes(required), true);
    for (const forbidden of ["url", "secret", "token", "yaml", "raw"]) {
      assert.equal(columns.some((name) => name.includes(forbidden)), false);
    }
  } finally {
    database.close();
  }
}));

test("setup-delivery handoff schema dry-run leaves the source unchanged and CLI requires exact confirmation", async () => withDatabase(async ({ directory, dbPath }) => {
  const database = new Database(dbPath);
  try {
    bootstrapControlDatabase(database);
    applyRuntimeClaims(database, () => new Date(NOW));
  } finally {
    database.close();
  }
  const before = createHash("sha256").update(readFileSync(dbPath)).digest("hex");
  const dryRun = await dryRunWalletFirstSetupDeliveryHandoffsMigrations({
    dbPath,
    tempRoot: directory
  });
  assert.equal(dryRun.ok, true);
  assert.equal(createHash("sha256").update(readFileSync(dbPath)).digest("hex"), before);
  const cliDryRun = await runWalletFirstSetupDeliveryHandoffsSchemaCli({
    argv: ["--mode", "dry-run", "--db-path", dbPath, "--temp-root", directory]
  });
  assert.equal(cliDryRun.exitCode, 0);
  assert.equal(cliDryRun.output.ok, true);
  assert.equal(createHash("sha256").update(readFileSync(dbPath)).digest("hex"), before);
  const validation = await runWalletFirstSetupDeliveryHandoffsSchemaCli({
    argv: ["--mode", "validate", "--db-path", dbPath]
  });
  assert.equal(validation.exitCode, 3);
  const result = runCli([
    "--mode", "apply", "--db-path", dbPath,
    "--confirm-migration-id", REQUIRED_WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_MIGRATION_ID,
    "--confirm-ddl-checksum", WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_MIGRATIONS[0].ddlChecksum
  ]);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, true);
  assert.equal(JSON.stringify(output).toLowerCase().includes("create table"), false);
}));

test("setup-delivery schema inspection fails closed if its owned claim index drifts", () => withDatabase(({ dbPath }) => {
  const database = new Database(dbPath);
  try {
    bootstrapControlDatabase(database);
    applyRuntimeClaims(database, () => new Date(NOW));
    applyHandoffs(database, () => new Date(NOW));
    database.exec(`drop index platform_wallet_first_setup_delivery_handoffs_claimable_idx`);
    const inspection = validateWalletFirstSetupDeliveryHandoffsSchema({ database });
    assert.equal(inspection.ok, false);
    assert.equal(inspection.schemaState, "blocked");
    assert.equal(inspection.reasonCodes.includes("owned_object_missing"), true);
  } finally {
    database.close();
  }
}));

test("handoff store binds only the verified current resource, claims by hashes, and acknowledges by session CAS", async (t) => {
  const escrow = createSetupDeliveryEscrowFixture(t, "wallet-first-setup-handoff-atomic");
  const fixture = createFixture({ setupDeliveryRuntimeEscrow: escrow.runtimeEscrow });
  t.after(() => fixture.close());
  const initial = await applyInitialResource(fixture);

  const accountId = "acct_setup_handoff";
  const idempotencyKeyHash = hash("idempotency-first");
  const sessionBindingHash = hash("session-first");
  const nextSessionBindingHash = hash("session-second");

  // The normal initial-effect path writes this row inside the same immediate
  // completion transaction. There is no post-effect handoff creation call.
  const availability = fixture.controlStore.readWalletFirstSetupDeliveryAvailabilityBinding({
    accountId,
    now: NOW
  });
  assert.equal(availability.state, "available");
  assert.match(availability.handoffRef, /^wfxsetup_[a-f0-9]{48}$/);
  const handoffRef = availability.handoffRef;
  assert.equal(initial.setupDeliveryHandoffRef, handoffRef);
  assert.deepEqual(
    fixture.controlStore.assertWalletFirstSetupDeliveryHandoffForDeferredTransition({
      transitionRef: "transition_setup_handoff_initial",
      effectRef: initial.effectRef,
      handoffRef
    }),
    {}
  );
  assert.throws(
    () => fixture.controlStore.assertWalletFirstSetupDeliveryHandoffForDeferredTransition({
      transitionRef: "transition_setup_handoff_initial",
      effectRef: initial.effectRef,
      handoffRef: "handoff_not_deterministic"
    }),
    (error) => error?.code === "validation_error"
  );
  assert.equal(
    fixture.controlDatabase.prepare(`
      select count(*) as count from ${WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_TABLE}
    `).get().count,
    1
  );
  const replay = await applyInitialResource(fixture);
  assert.equal(replay.setupDeliveryHandoffRef, handoffRef);
  assert.equal(
    fixture.controlDatabase.prepare(`
      select count(*) as count from ${WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_TABLE}
    `).get().count,
    1
  );
  assert.deepEqual(
    fixture.controlStore.readWalletFirstSetupDeliveryHandoff({ accountId, now: NOW }),
    { state: "available" }
  );

  const claimed = fixture.controlStore.claimWalletFirstSetupDeliveryHandoff({
    accountId,
    idempotencyKeyHash,
    sessionBindingHash,
    now: NOW,
    leaseMs: 60_000
  });
  assert.equal(claimed.state, "claimed");
  assert.equal(claimed.handoffRef, handoffRef);
  assert.equal(claimed.claimGeneration, 1);
  assert.equal(claimed.binding.handoffRef, handoffRef);
  assert.doesNotMatch(JSON.stringify(claimed), /subscription|https?:|secret|yaml|token/i);
  const persistedClaim = fixture.controlDatabase.prepare(`
    select handoff_ref, idempotency_key_hash, session_binding_hash, status
      from ${WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_TABLE}
  `).get();
  assert.equal(persistedClaim.handoff_ref, handoffRef);
  assert.equal(persistedClaim.idempotency_key_hash, idempotencyKeyHash);
  assert.equal(persistedClaim.session_binding_hash, sessionBindingHash);
  assert.doesNotMatch(JSON.stringify(persistedClaim), /idempotency-first|session-first/i);
  assert.deepEqual(
    fixture.controlStore.claimWalletFirstSetupDeliveryHandoff({
      accountId,
      idempotencyKeyHash,
      sessionBindingHash,
      now: "2030-01-01T00:00:30.000Z",
      leaseMs: 60_000
    }),
    claimed
  );
  assert.throws(
    () => fixture.controlStore.claimWalletFirstSetupDeliveryHandoff({
      accountId,
      idempotencyKeyHash,
      sessionBindingHash: nextSessionBindingHash,
      now: "2030-01-01T00:00:30.000Z",
      leaseMs: 60_000
    }),
    (error) => error?.code === "claim_lost"
  );
  const binding = fixture.controlStore.readWalletFirstSetupDeliveryBinding({
    accountId,
    handoffRef,
    sessionBindingHash,
    now: "2030-01-01T00:00:30.000Z"
  });
  assert.equal(binding.state, "claimed");
  assert.equal(binding.binding.effectRef, claimed.binding.effectRef);
  assert.deepEqual(
    fixture.controlStore.acknowledgeWalletFirstSetupDeliveryHandoff({
      accountId,
      handoffRef,
      sessionBindingHash,
      now: "2030-01-01T00:00:30.000Z"
    }),
    { state: "delivered" }
  );
  assert.deepEqual(
    fixture.controlStore.acknowledgeWalletFirstSetupDeliveryHandoff({
      accountId,
      handoffRef,
      sessionBindingHash,
      now: "2030-01-01T00:00:31.000Z"
    }),
    { state: "delivered" }
  );
  // A database acknowledgement may succeed just before an escrow delete
  // failure. Only the acknowledgement reader can return this verified
  // terminal binding for cleanup; the release reader stays fail-closed.
  const deliveredBinding = fixture.controlStore.readWalletFirstSetupDeliveryAcknowledgementBinding({
    accountId,
    handoffRef,
    sessionBindingHash,
    now: "2030-01-01T00:00:31.000Z"
  });
  assert.equal(deliveredBinding.state, "delivered");
  assert.equal(deliveredBinding.binding.handoffRef, handoffRef);
  assert.throws(
    () => fixture.controlStore.readWalletFirstSetupDeliveryBinding({
      accountId,
      handoffRef,
      sessionBindingHash,
      now: "2030-01-01T00:00:31.000Z"
    }),
    (error) => error?.code === "claim_lost"
  );
  assert.throws(
    () => fixture.controlStore.readWalletFirstSetupDeliveryAcknowledgementBinding({
      accountId,
      handoffRef,
      sessionBindingHash: nextSessionBindingHash,
      now: "2030-01-01T00:00:31.000Z"
    }),
    (error) => error?.code === "claim_lost"
  );
  assert.deepEqual(
    fixture.controlStore.readWalletFirstSetupDeliveryHandoff({ accountId, now: NOW }),
    { state: "delivered" }
  );
});

test("a missing handoff schema rolls an initial completion back instead of settling an orphaned resource chain", async (t) => {
  const escrow = createSetupDeliveryEscrowFixture(t, "wallet-first-setup-handoff-rollback");
  const fixture = createFixture({
    migrateHandoffs: false,
    setupDeliveryRuntimeEscrow: escrow.runtimeEscrow
  });
  t.after(() => fixture.close());

  await assert.rejects(
    applyInitialResource(fixture),
    (error) => error?.code === "wallet_first_resource_effect_unavailable"
  );
  assert.deepEqual(
    fixture.handler.resolveCurrentResourceChain({ accountId: "acct_setup_handoff" }),
    { state: "none" }
  );
  assert.equal(
    fixture.controlDatabase.prepare(`
      select count(*) as count from platform_entitlements
       where account_id = 'acct_setup_handoff'
    `).get().count,
    0
  );
  assert.equal(
    fixture.controlDatabase.prepare(`
      select count(*) as count from platform_audit_events
       where action = 'resource_effect_applied'
    `).get().count,
    0
  );
});

test("the internal effect assertion fails closed when the atomically-created handoff row is deleted", async (t) => {
  const escrow = createSetupDeliveryEscrowFixture(t, "wallet-first-setup-handoff-assertion");
  const fixture = createFixture({ setupDeliveryRuntimeEscrow: escrow.runtimeEscrow });
  t.after(() => fixture.close());
  const initial = await applyInitialResource(fixture);
  fixture.controlDatabase.prepare(`
    delete from ${WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_TABLE}
     where handoff_ref = ?
  `).run(initial.setupDeliveryHandoffRef);
  assert.throws(
    () => fixture.controlStore.assertWalletFirstSetupDeliveryHandoffForDeferredTransition({
      transitionRef: "transition_setup_handoff_initial",
      effectRef: initial.effectRef,
      handoffRef: initial.setupDeliveryHandoffRef
    }),
    (error) => error?.code === "validation_error"
  );
});

test("an expired claimed handoff can be reclaimed only through a fresh CAS and an old session cannot acknowledge it", async (t) => {
  const escrow = createSetupDeliveryEscrowFixture(t, "wallet-first-setup-handoff-expiry");
  const fixture = createFixture({ setupDeliveryRuntimeEscrow: escrow.runtimeEscrow });
  t.after(() => fixture.close());
  const initial = await applyInitialResource(fixture);
  const accountId = "acct_setup_handoff";
  const handoffRef = initial.setupDeliveryHandoffRef;
  assert.match(handoffRef, /^wfxsetup_[a-f0-9]{48}$/);
  const firstIdempotencyHash = hash("idempotency-first-expiry");
  const firstSessionHash = hash("session-first-expiry");
  const secondIdempotencyHash = hash("idempotency-second-expiry");
  const secondSessionHash = hash("session-second-expiry");
  fixture.controlStore.claimWalletFirstSetupDeliveryHandoff({
    accountId,
    idempotencyKeyHash: firstIdempotencyHash,
    sessionBindingHash: firstSessionHash,
    now: NOW,
    leaseMs: 60_000
  });
  assert.throws(
    () => fixture.controlStore.readWalletFirstSetupDeliveryBinding({
      accountId,
      handoffRef,
      sessionBindingHash: firstSessionHash,
      now: "2030-01-01T00:01:01.000Z"
    }),
    (error) => error?.code === "claim_lost"
  );
  const expiredAcknowledgement = fixture.controlStore
    .readWalletFirstSetupDeliveryAcknowledgementBinding({
      accountId,
      handoffRef,
      sessionBindingHash: firstSessionHash,
      now: "2030-01-01T00:01:01.000Z"
    });
  assert.equal(expiredAcknowledgement.state, "claimed");
  const reclaimed = fixture.controlStore.claimWalletFirstSetupDeliveryHandoff({
    accountId,
    idempotencyKeyHash: secondIdempotencyHash,
    sessionBindingHash: secondSessionHash,
    now: "2030-01-01T00:01:01.000Z",
    leaseMs: 60_000
  });
  assert.equal(reclaimed.state, "claimed");
  assert.equal(reclaimed.claimGeneration, 2);
  assert.throws(
    () => fixture.controlStore.acknowledgeWalletFirstSetupDeliveryHandoff({
      accountId,
      handoffRef,
      sessionBindingHash: firstSessionHash,
      now: "2030-01-01T00:01:01.000Z"
    }),
    (error) => error?.code === "claim_lost"
  );
  assert.throws(
    () => fixture.controlStore.readWalletFirstSetupDeliveryAcknowledgementBinding({
      accountId,
      handoffRef,
      sessionBindingHash: firstSessionHash,
      now: "2030-01-01T00:01:01.000Z"
    }),
    (error) => error?.code === "claim_lost"
  );
  assert.deepEqual(
    fixture.controlStore.acknowledgeWalletFirstSetupDeliveryHandoff({
      accountId,
      handoffRef,
      sessionBindingHash: secondSessionHash,
      now: "2030-01-01T00:01:01.000Z"
    }),
    { state: "delivered" }
  );
});

test("a scheduled renewal retains the initial handoff binding and does not create a second delivery claim", async (t) => {
  const escrow = createSetupDeliveryEscrowFixture(t, "wallet-first-setup-handoff-scheduled");
  const fixture = createFixture({ setupDeliveryRuntimeEscrow: escrow.runtimeEscrow });
  t.after(() => fixture.close());
  const initial = await applyInitialResource(fixture);
  const before = fixture.handler.resolveCurrentResourceChain({
    accountId: "acct_setup_handoff"
  });
  const initialAvailability = fixture.controlStore.readWalletFirstSetupDeliveryAvailabilityBinding({
    accountId: "acct_setup_handoff",
    now: NOW
  });
  assert.equal(initialAvailability.state, "available");
  assert.equal(initialAvailability.binding.effectRef, initial.effectRef);

  fixture.setNow(before.validUntil);
  const scheduled = await applyScheduledResource(fixture, before);
  assert.equal(Object.hasOwn(scheduled, "setupDeliveryHandoffRef"), false);
  const renewedAvailability = fixture.controlStore.readWalletFirstSetupDeliveryAvailabilityBinding({
    accountId: "acct_setup_handoff",
    now: before.validUntil
  });
  assert.equal(renewedAvailability.state, "available");
  assert.equal(renewedAvailability.handoffRef, initialAvailability.handoffRef);
  assert.equal(renewedAvailability.binding.effectRef, initial.effectRef);
  assert.equal(
    fixture.controlDatabase.prepare(`
      select count(*) as count from ${WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_TABLE}
    `).get().count,
    1
  );
});
