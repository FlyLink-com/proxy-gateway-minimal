// V-04 narrow diagnostics (2026-11-27): the strict dangling-tolerance
// tests in d1-dangling-tolerance.test.mjs stay untouched and still require
// fail-closed behaviour. This file proves the new diagnostic surface only:
// unmigrated rows are visible (explicit marker + count-only log, no
// identifiers) while no business write is advanced. All fixtures use
// synthetic SQLite; nothing here connects to E4/BWH.
// Fixture helpers are copied from d1-dangling-tolerance.test.mjs (not
// imported from a test file).

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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
import { buildSourceValidationTestEnvironment } from "../../scripts/source-validation-test-runner.mjs";
import { createRuntimeState } from "../state.mjs";

const NOW = "2026-07-23T12:34:56.000Z";
const NOW_DATE = new Date(NOW);
const COMMERCE_CLOCK = "2026-07-26T12:34:56.000Z";

function totalChanges(database) {
  return database.prepare("select total_changes() as count").get().count;
}

// Captures console.warn lines while `fn` runs, then restores the original.
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

function insertCredential(database, { requestId, channelRef = "chan_1", credentialRef = "edgecred_1", digest = `sha256:${"a".repeat(64)}` }) {
  database.prepare(`
    insert into platform_portal_edge_credentials (
      request_id, edge_channel_ref, edge_credential_ref, edge_material_digest, ordinal
    ) values (?, ?, ?, ?, 1)
  `).run(requestId, channelRef, credentialRef, digest);
}

test("A1/A2 E6: diagnostic counts 714 orphan credentials; desired state stays withheld", (t) => {
  const { database, store } = controlFixture(t);
  const COUNT = 714;
  withoutForeignKeys(database, () => {
    for (let index = 0; index < COUNT; index += 1) {
      insertCredential(database, {
        requestId: `pareq_diag_${index}`,
        credentialRef: `edgecred_diag_${index}`,
        digest: `sha256:${String(index).padStart(64, "0")}`
      });
    }
  });
  const before = totalChanges(database);
  const { result, lines } = captureWarnings(() => store.diagnoseDanglingEdgeDesiredState("chan_1"));
  assert.equal(totalChanges(database), before, "diagnostic must not write");
  assert.equal(result.channelRef, "chan_1");
  assert.equal(result.unmigratedCount, COUNT);
  assert.equal(result.unmigratedRows.length, COUNT);
  assert.equal(new Set(result.unmigratedRows.map((row) => row.edgeCredentialRef)).size, COUNT);
  const first = result.unmigratedRows.find((row) => row.edgeCredentialRef === "edgecred_diag_0");
  assert.deepEqual(first, {
    edgeChannelRef: "chan_1",
    edgeCredentialRef: "edgecred_diag_0",
    edgeMaterialDigest: `sha256:${"0".repeat(64)}`,
    requestStatus: null
  });
  const last = result.unmigratedRows.find((row) => row.edgeCredentialRef === "edgecred_diag_713");
  assert.deepEqual(last, {
    edgeChannelRef: "chan_1",
    edgeCredentialRef: "edgecred_diag_713",
    edgeMaterialDigest: `sha256:${"0".repeat(61)}713`,
    requestStatus: null
  });
  assert.deepEqual(lines, ["v04 unmigrated diagnostic: kind=edge-desired-state count=714"]);
  assert.doesNotMatch(lines.join("\n"), /pareq_diag|edgecred_diag/);
  // Business side stays at zero: no credential is served without its parent.
  assert.equal(store.getLatestEdgeDesiredStateForChannel("chan_1"), null);
});

test("A4 E6: diagnostic is empty and silent when every credential has its request", (t) => {
  const { database, store } = controlFixture(t);
  insertAccessRequest(database, "pareq_valid");
  insertCredential(database, { requestId: "pareq_valid", credentialRef: "edgecred_valid" });
  const { result, lines } = captureWarnings(() => store.diagnoseDanglingEdgeDesiredState("chan_1"));
  assert.deepEqual(result, { channelRef: "chan_1", unmigratedCount: 0, unmigratedRows: [] });
  assert.deepEqual(lines, []);
});

test("A1/A2 E5: diagnostic counts 144 dangling links; the strict list stays empty of them", (t) => {
  const { database, store } = controlFixture(t);
  const COUNT = 144;
  withoutForeignKeys(database, () => {
    for (let index = 0; index < COUNT; index += 1) {
      insertLink(database, `link_diag_${index}`, `req_diag_${index}`, `tenant_diag_${index}`);
    }
  });
  // One migrated link proves the diagnostic only counts unmigrated rows.
  insertAccount(database, "acct_1");
  insertEntitlement(database, "ent_1", "acct_1");
  insertIssuanceRequest(database, "req_1", "acct_1", "ent_1");
  insertLink(database, "link_1", "req_1", "tenant_1");
  const before = totalChanges(database);
  const { result, lines } = captureWarnings(() => store.diagnoseDanglingIssuedSubscriptionBindings());
  assert.equal(totalChanges(database), before, "diagnostic must not write");
  assert.equal(result.unmigratedCount, COUNT);
  assert.equal(result.unmigratedRows.length, COUNT);
  assert.equal(new Set(result.unmigratedRows.map((row) => row.id)).size, COUNT);
  const first = result.unmigratedRows.find((row) => row.id === "link_diag_0");
  assert.deepEqual(first, {
    id: "link_diag_0",
    linkId: "link_diag_0",
    requestId: "req_diag_0",
    accountId: null,
    entitlementId: null,
    tenantRef: "tenant_diag_0",
    artifactRef: "artifact_1",
    status: "active",
    requestStatus: null,
    entitlementStatus: null,
    nodeId: null,
    plan: null,
    validFrom: null,
    validUntil: null,
    trafficLimitBytes: null,
    createdAt: NOW,
    updatedAt: NOW,
    diagnosticReason: "missing_request"
  });
  const last = result.unmigratedRows.find((row) => row.id === "link_diag_143");
  assert.equal(last.requestId, "req_diag_143");
  assert.equal(last.tenantRef, "tenant_diag_143");
  assert.equal(last.requestStatus, null);
  assert.equal(last.diagnosticReason, "missing_request");
  assert.deepEqual(lines, ["v04 unmigrated diagnostic: kind=issued-subscription-bindings count=144"]);
  assert.doesNotMatch(lines.join("\n"), /req_diag|link_diag|tenant_diag/);
  // Business side stays at zero for the dangling rows: only the migrated
  // link is listed.
  const listed = store.listIssuedSubscriptionBindings();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, "link_1");
  assert.equal(listed[0].requestStatus, "issued");
});

test("E5: a missing entitlement keeps the actual issued request status", (t) => {
  const { database, store } = controlFixture(t);
  insertAccount(database, "acct_1");
  withoutForeignKeys(database, () => {
    insertIssuanceRequest(database, "req_1", "acct_1", "ent_missing");
    insertLink(database, "link_1", "req_1", "tenant_1");
    insertLink(database, "link_2", "req_missing", "tenant_2");
  });
  const before = totalChanges(database);
  const { result, lines } = captureWarnings(() => store.diagnoseDanglingIssuedSubscriptionBindings());
  assert.equal(totalChanges(database), before);
  assert.equal(result.unmigratedCount, 2);
  const byId = new Map(result.unmigratedRows.map((row) => [row.id, row]));
  assert.equal(byId.get("link_1").requestStatus, "issued");
  assert.equal(byId.get("link_1").entitlementStatus, null);
  assert.equal(byId.get("link_1").diagnosticReason, "missing_entitlement");
  assert.equal(byId.get("link_2").requestStatus, null);
  assert.equal(byId.get("link_2").diagnosticReason, "missing_request");
  assert.deepEqual(lines, ["v04 unmigrated diagnostic: kind=issued-subscription-bindings count=2"]);
  assert.deepEqual(store.listIssuedSubscriptionBindings(), []);
});

test("A5: wallet-first exact chain still refuses a dangling link while the diagnostic sees it", (t) => {
  const { database, store } = controlFixture(t);
  withoutForeignKeys(database, () => insertLink(database, "link_1", "req_missing", "tenant_1"));
  insertAccount(database, "acct_wf", { commercialModel: "wallet_first_unique_v1" });
  insertEntitlement(database, "ent_wf", "acct_wf");
  const { result } = captureWarnings(() => store.diagnoseDanglingIssuedSubscriptionBindings());
  assert.equal(result.unmigratedCount, 1);
  assert.equal(result.unmigratedRows[0].requestStatus, null);
  assert.throws(() => store.resolveExactWalletFirstResourceChainForDeferredTransition({
    accountId: "acct_wf"
  }), { code: "validation_error" });
});

// ---------------------------------------------------------------------------
// E4 — wallet projection (fixture helpers copied from the strict file)
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

function insertOrphanAllocations(database, lotRef, count) {
  withoutForeignKeys(database, () => {
    database.exec("drop trigger platform_coin_hold_allocations_immutable_update");
    database.exec("drop trigger platform_coin_hold_allocations_immutable_delete");
    for (let index = 0; index < count; index += 1) {
      database.prepare(`
        insert into platform_coin_hold_allocations (
          allocation_ref, hold_ref, lot_ref, allocation_sequence, allocated_units,
          created_at
        ) values (?, ?, ?, 1, 1, ?)
      `).run(`alloc_orphan_${index}`, `hold_missing_${index}`, lotRef, NOW);
    }
  });
}

test("A1/A2 E4: diagnostic counts 44 orphan allocations grouped by lot", (t) => {
  const { database, store } = walletFixture(t);
  const credited = creditPaidCoins(store, "account_1", 100, "credit_diag44");
  insertOrphanAllocations(database, credited.resultRef, 44);
  const before = totalChanges(database);
  const { result, lines } = captureWarnings(() => store.diagnoseOrphanHoldAllocations({
    walletRef: credited.walletRef
  }));
  assert.equal(totalChanges(database), before, "diagnostic must not write");
  assert.equal(result.walletRef, credited.walletRef);
  assert.equal(result.orphanCount, 44);
  assert.equal(result.orphanUnits, 44);
  assert.deepEqual(result.lots, [{ lotRef: credited.resultRef, orphanUnits: 44 }]);
  assert.deepEqual(lines, ["v04 unmigrated diagnostic: kind=orphan-hold-allocations count=44"]);
  assert.doesNotMatch(lines.join("\n"), /hold_missing|alloc_orphan/);
});

test("A6 E4: orphan allocation is diagnosed and the projection still fails closed", (t) => {
  const { database, store } = walletFixture(t);
  const credited = creditPaidCoins(store, "account_1", 25, "credit_orphan_diag");
  database.prepare(`
    update platform_coin_lots
       set available_units = available_units - 5, held_units = 5
     where lot_ref = ?
  `).run(credited.resultRef);
  withoutForeignKeys(database, () => {
    database.exec("drop trigger platform_coin_hold_allocations_immutable_update");
    database.exec("drop trigger platform_coin_hold_allocations_immutable_delete");
    database.prepare(`
      insert into platform_coin_hold_allocations (
        allocation_ref, hold_ref, lot_ref, allocation_sequence, allocated_units,
        created_at
      ) values (?, ?, ?, 1, 5, ?)
    `).run("alloc_orphan", "hold_missing", credited.resultRef, NOW);
  });
  const { result, lines } = captureWarnings(() => store.diagnoseOrphanHoldAllocations({
    walletRef: credited.walletRef
  }));
  assert.equal(result.orphanCount, 1);
  assert.equal(result.orphanUnits, 5);
  assert.deepEqual(result.lots, [{ lotRef: credited.resultRef, orphanUnits: 5 }]);
  assert.deepEqual(lines, ["v04 unmigrated diagnostic: kind=orphan-hold-allocations count=1"]);
  // The held_units comparison is unchanged: the orphan amount is reported,
  // not deducted, so the projection still throws.
  assert.throws(
    () => store.getWalletProjection({ walletRef: credited.walletRef }),
    { code: "wallet_infrastructure_error" }
  );
  assert.equal(database.prepare(
    "select held_units from platform_coin_lots where lot_ref = ?"
  ).pluck().get(credited.resultRef), 5);
});

// ---------------------------------------------------------------------------
// E2 — commerce held orders with a missing hold row
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
  const directory = mkdtempSync(join(tmpdir(), "v04-diagnostics-commerce-"));
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
  return { database, store, clock };
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
  commerceCredit(store, { accountId, coinType: "paid_coins", amountUnits: 720, suffix: "paidbulk" });
  commerceCredit(store, {
    accountId, coinType: "reward_coins", amountUnits: 10,
    suffix: "reward", availability: "pending"
  });
}

function commerceHeldOrder(store, suffix) {
  const quote = store.createCheckoutQuote({
    accountId: "acct_synthetic_1",
    offerRef: "offer_monthly_basic"
  });
  return store.confirmOrder({
    accountId: "acct_synthetic_1",
    quoteRef: quote.quoteRef,
    operation: commerceOperation(`confirm_diag_${suffix}`)
  });
}

function deleteHoldRows(database, orderRefs) {
  const holdRefs = orderRefs.map((orderRef) => database.prepare(`
    select hold_ref from platform_coin_commerce_orders where order_ref = ?
  `).get(orderRef).hold_ref);
  withoutForeignKeys(database, () => {
    // The allocation table's immutability triggers are a local-DB guard;
    // dropping them once here simulates the E4 state, where these rows
    // never arrived at all (there is nothing to protect).
    database.exec("drop trigger platform_coin_hold_allocations_immutable_update");
    database.exec("drop trigger platform_coin_hold_allocations_immutable_delete");
    for (const holdRef of holdRefs) {
      database.prepare(`
        delete from platform_coin_hold_allocations where hold_ref = ?
      `).run(holdRef);
      database.prepare(`
        delete from platform_coin_holds where hold_ref = ?
      `).run(holdRef);
    }
  });
  return holdRefs;
}

test("A1/A2/A6 E2: diagnostic counts 34 held orders missing their hold; cancel stays fail-closed", (t) => {
  const { database, store } = commerceFixture(t);
  commerceSeedWallet(store);
  store.publishOfferVersion(commerceOffer());
  const COUNT = 34;
  const orderRefs = [];
  for (let index = 0; index < COUNT; index += 1) {
    orderRefs.push(commerceHeldOrder(store, index).orderRef);
  }
  const holdRefs = deleteHoldRows(database, orderRefs);
  const before = totalChanges(database);
  const { result, lines } = captureWarnings(() => store.diagnoseDanglingOrderHolds({ limit: 100 }));
  assert.equal(totalChanges(database), before, "diagnostic must not write");
  assert.equal(result.unmigratedCount, COUNT);
  assert.equal(result.unmigratedRows.length, COUNT);
  assert.equal(new Set(result.unmigratedRows.map((row) => row.orderRef)).size, COUNT);
  const first = result.unmigratedRows.find((row) => row.orderRef === orderRefs[0]);
  assert.deepEqual(first, {
    orderRef: orderRefs[0],
    accountId: "acct_synthetic_1",
    amountUnits: 20,
    paymentStatus: "held",
    holdRef: holdRefs[0],
    holdMissing: true
  });
  assert.equal(result.unmigratedRows.every((row) => row.holdMissing === true), true);
  assert.deepEqual(lines, ["v04 unmigrated diagnostic: kind=order-holds count=34"]);
  assert.doesNotMatch(lines.join("\n"), /order_|hold_/);
  // Business side stays at zero: cancel still requires reconciliation and
  // records no cancellation event.
  assert.throws(() => store.cancelOrder({
    accountId: "acct_synthetic_1", orderRef: orderRefs[0],
    operation: commerceOperation("cancel_diag_missing_hold")
  }), { code: "reconciliation_required" });
  assert.equal(database.prepare(
    "select count(*) from platform_coin_commerce_order_events where order_ref = ? and event_type = 'order_cancelled'"
  ).pluck().get(orderRefs[0]), 0);
});

test("E2: a present hold with a missing wallet is not a missing hold and cancel still fails closed", (t) => {
  const { database, store } = commerceFixture(t);
  commerceSeedWallet(store);
  store.publishOfferVersion(commerceOffer());
  const missingHold = commerceHeldOrder(store, "missing_hold");
  const missingWallet = commerceHeldOrder(store, "missing_wallet");
  deleteHoldRows(database, [missingHold.orderRef]);
  const presentHold = database.prepare(
    "select hold_ref from platform_coin_commerce_orders where order_ref = ?"
  ).pluck().get(missingWallet.orderRef);
  const missingWalletRef = database.prepare(
    "select wallet_ref from platform_coin_holds where hold_ref = ?"
  ).pluck().get(presentHold);
  const removed = withoutForeignKeys(database, () => database.prepare(
    "delete from platform_coin_wallets where wallet_ref = ?"
  ).run(missingWalletRef));
  assert.equal(removed.changes, 1);
  const before = totalChanges(database);
  const { result, lines } = captureWarnings(() => store.diagnoseDanglingOrderHolds());
  assert.equal(totalChanges(database), before);
  assert.equal(result.unmigratedCount, 2);
  const byRef = new Map(result.unmigratedRows.map((row) => [row.orderRef, row]));
  assert.equal(byRef.get(missingHold.orderRef).holdMissing, true);
  assert.equal(byRef.get(missingHold.orderRef).walletMissing, undefined);
  assert.equal(byRef.get(missingWallet.orderRef).holdRef, presentHold);
  assert.equal(byRef.get(missingWallet.orderRef).holdMissing, undefined);
  assert.equal(byRef.get(missingWallet.orderRef).walletMissing, true);
  assert.deepEqual(lines, ["v04 unmigrated diagnostic: kind=order-holds count=2"]);
  for (const [index, order] of [missingHold, missingWallet].entries()) {
    assert.throws(() => store.cancelOrder({
      accountId: "acct_synthetic_1", orderRef: order.orderRef,
      operation: commerceOperation("cancel_diag_gap_" + index)
    }), { code: "reconciliation_required" });
    assert.equal(database.prepare(
      "select count(*) from platform_coin_commerce_order_events where order_ref = ? and event_type = 'order_cancelled'"
    ).pluck().get(order.orderRef), 0);
  }
});

test("A4 E2: diagnostic is empty and silent when every held order has its hold", (t) => {
  const { database, store } = commerceFixture(t);
  commerceSeedWallet(store);
  store.publishOfferVersion(commerceOffer());
  const order = commerceHeldOrder(store, "healthy");
  assert.equal(order.paymentStatus, "held");
  const { result, lines } = captureWarnings(() => store.diagnoseDanglingOrderHolds({ limit: 100 }));
  assert.deepEqual(result, { unmigratedCount: 0, unmigratedRows: [] });
  assert.deepEqual(lines, []);
});

// ---------------------------------------------------------------------------
// E6 durable path — the requestStatus marker must not resurrect a legacy
// issuance without a Portal record (fixture pattern copied from
// edge-durable-binding-authority.test.mjs).
// ---------------------------------------------------------------------------

const ROOT = new URL("../../", import.meta.url);
const BINDING_NOW = "2026-09-23T00:00:00.000Z";
const BINDING_UNTIL = "2099-10-23T00:00:00.000Z";
const BINDING_CHANNEL = "channel-vultr-a-hy2";
const BINDING_REQUEST = "pareq_binding_authority_001";
const bindingDerivedRef = (channel) => `edgecred_${BINDING_REQUEST}_${channel}`;
const bindingDigest = (credentialRef) => `sha256:${credentialRef}`;

function bindingFixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "gccgw-v04-diagnostics-"));
  const state = createRuntimeState({
    rootDir: ROOT,
    env: {
      ...buildSourceValidationTestEnvironment({}, { repositoryRoot: fileURLToPath(ROOT) }),
      USER_PORTAL_EDGE_LIFECYCLE_ENABLED: "true",
      USER_PORTAL_EDGE_CHANNEL_REF: BINDING_CHANNEL,
      USER_PORTAL_EDGE_CHANNEL_REFS: BINDING_CHANNEL,
      EDGE_CREDENTIAL_MATERIAL_PATH: join(dir, "protected", "material.json")
    },
    subscriptionDbPath: join(dir, "subscriptions.sqlite"),
    controlDbPath: join(dir, "control.sqlite"),
    edgeLifecycleNowFn: () => new Date(BINDING_NOW),
    edgeCurrentCredentialSummaries: [],
    edgeRuntimeAdapter: {
      applyCredentialReconciliation() { throw new Error("test must not mutate runtime"); }
    },
    autoStartHttpProxy: false
  });
  t.after(async () => {
    await state.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  const store = state.platform.controlStore;
  store.createAccount({
    id: "acct_binding_authority", ownerRef: "portal_user_binding_authority", status: "active",
    createdAt: BINDING_NOW, updatedAt: BINDING_NOW
  });
  store.createEntitlement({
    id: "ent_binding_authority", accountId: "acct_binding_authority", plan: "monthly",
    status: "active", validFrom: BINDING_NOW, validUntil: BINDING_UNTIL, createdAt: BINDING_NOW, updatedAt: BINDING_NOW
  });
  store.createIssuanceRequest({
    id: BINDING_REQUEST, accountId: "acct_binding_authority", entitlementId: "ent_binding_authority",
    approvalRef: "approval_binding_authority", status: "issued", quantity: 1,
    // Original-node recovery only: the issuance node (VLESS) differs from
    // the runtime channel (HY2), so the legacy path must not authorize it.
    nodeId: "channel-vultr-a-vless-reality-tcp",
    purpose: "portal_access_request", requestedByRef: "portal_auto_issuer", createdAt: BINDING_NOW, updatedAt: BINDING_NOW
  });
  store.linkIssuedSubscription({
    id: "link_binding_authority", requestId: BINDING_REQUEST, tenantRef: "tenant_binding_authority",
    artifactRef: "artifact_binding_authority", status: "active", createdAt: BINDING_NOW, updatedAt: BINDING_NOW
  });
  return {
    state,
    material(credentialRef) {
      state.platform.edgeCredentialMaterialStore.putCredentialMaterial({
        credentialRef, materialDigest: bindingDigest(credentialRef),
        material: { uuid: "11111111-1111-4111-8111-111111111111", password: "synthetic-binding-password" }
      });
    },
    plan() {
      const report = state.platform.edgeLifecycleService.reconcileOrderLifecycle();
      assert.equal(report.ok, true);
      assert.equal(report.mutation, false);
      assert.equal(report.productionAuthority, false);
      return report;
    }
  };
}

test("A2 E6 durable: marker on a legacy order does not resurrect it without a Portal record", (t) => {
  const f = bindingFixture(t);
  assert.equal(f.state.platform.controlStore.getPortalAccessRequest(BINDING_REQUEST), null);
  f.material(`edgecred_${BINDING_REQUEST}`);
  f.material(bindingDerivedRef(BINDING_CHANNEL));
  assert.equal(f.plan().summary.desiredCount, 0);
});
