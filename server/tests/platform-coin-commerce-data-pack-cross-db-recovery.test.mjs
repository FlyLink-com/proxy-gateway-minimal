import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import { createSqliteCoinCommerceStore } from "../services/platform/coin-commerce-store.mjs";
import { applyCoinCommerceMigrations, COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID } from "../services/platform/coin-commerce-migrations.mjs";
import { applyCoinWalletMigrations, COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID } from "../services/platform/coin-wallet-migrations.mjs";
import { COIN_COMMERCE_DATA_PACK_CANDIDATES } from "../services/platform/coin-commerce-production-catalog.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createCoinCommerceDataPackFulfillmentHandler } from "../services/platform/coin-commerce-data-pack-fulfillment.mjs";
import { createDataPlaneDesiredStateNotifier } from "../services/edge/data-plane-desired-state-notifier.mjs";

const ACCOUNT = "acct_pack_cross_db";
const CHANNEL = "channel_pack_cross_db";
const NODE = "node_pack_cross_db";
const DIGEST = `sha256:${"b".repeat(64)}`;

function clockedDatabase(database, clock) {
  return new Proxy(database, {
    get(target, property) {
      if (property === "inTransaction") return target.inTransaction;
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

function initializeCommerce(path, now) {
  const db = new Database(path);
  db.pragma("foreign_keys = ON");
  db.exec(`create table platform_accounts (
    id text primary key, owner_ref text not null,
    status text not null check (status in ('active', 'suspended', 'disabled')),
    created_at text not null, updated_at text not null,
    metadata_json text not null default '{}'
  )`);
  applyCoinWalletMigrations({ database: db,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(now) });
  applyCoinCommerceMigrations({ database: db,
    expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(now) });
  db.prepare(`insert into platform_accounts
    (id, owner_ref, status, created_at, updated_at, metadata_json)
    values (?, 'owner_pack_cross_db', 'active', ?, ?, '{}')`).run(ACCOUNT, now, now);
  return db;
}

function fulfillmentInput(claim) {
  return {
    commandRef: claim.commandRef, orderRef: claim.orderRef,
    accountId: claim.accountId, offerVersionRef: claim.offerVersionRef,
    delivery: claim.delivery,
    fulfillmentLease: { leaseGeneration: claim.leaseGeneration,
      leaseToken: claim.leaseToken }
  };
}

test("captured pack replays across Commerce/control DB restart without another debit or resource", () => {
  const directory = mkdtempSync(join(tmpdir(), "pack-cross-db-"));
  const commercePath = join(directory, "commerce.sqlite");
  const controlPath = join(directory, "control.sqlite");
  const clock = { value: "2026-09-29T00:00:00.000Z" };
  let commerceDb;
  let commerce;
  let control;
  let resourceCreations = 0;
  try {
    commerceDb = initializeCommerce(commercePath, clock.value);
    commerce = createSqliteCoinCommerceStore({
      database: clockedDatabase(commerceDb, clock), cancelWindowMs: 0
    });
    control = createSqliteSubscriptionControlStore({ dbPath: controlPath });
    control.createAccount({ id: ACCOUNT, ownerRef: "owner_pack_cross_db",
      status: "active", createdAt: clock.value, updatedAt: clock.value });
    commerce.walletStore.creditCoins({
      accountId: ACCOUNT, coinType: "paid_coins", amountUnits: 30,
      availability: "available", sourceType: "synthetic_seed",
      sourceRef: "source_pack_cross_db", sourceDigest: "d".repeat(64),
      policyRef: null, policyVersion: null, expiresAt: null,
      operation: { actorScope: "system:pack_cross_db", idempotencyKey: "credit_pack_cross_db",
        actorType: "system", actorRef: "pack_cross_db" }
    });
    commerce.publishOfferVersion(COIN_COMMERCE_DATA_PACK_CANDIDATES[0]);
    const quote = commerce.createCheckoutQuote({
      accountId: ACCOUNT, offerRef: "offer_pack_100gb"
    });
    const order = commerce.confirmOrder({
      accountId: ACCOUNT, quoteRef: quote.quoteRef,
      operation: { actorScope: `portal:${ACCOUNT}`, idempotencyKey: "confirm_pack_cross_db",
        actorType: "portal_user", actorRef: ACCOUNT }
    });
    clock.value = order.cancelUntil;
    commerce.claimDueCaptures({ limit: 1 });
    commerce.captureClaimedOrder({ orderRef: order.orderRef });
    const debitCount = () => commerceDb.prepare(`select count(*) from platform_coin_ledger_entries
      where order_ref = ?`).pluck().get(order.orderRef);
    const initialDebitCount = debitCount();
    assert.ok(initialDebitCount > 0);

    const handler = () => {
      const notifier = createDataPlaneDesiredStateNotifier({
        controlStore: control,
        servers: [{ name: CHANNEL, physicalNodeRef: NODE,
          runtimeAdapter: "remote-data-plane-handoff" }],
        nowFn: () => clock.value
      });
      return createCoinCommerceDataPackFulfillmentHandler({
        commerceStore: commerce,
        controlStore: control,
        runtimeIssuer: {
          issue(input) {
            const reserved = control.reserveCoinCommerceDataPackIssuance({
              ...input, nodeId: CHANNEL, now: clock.value
            });
            if (reserved.status === "planned") resourceCreations += 1;
            return { ...control.completeCoinCommerceDataPackIssuance({
              commandRef: input.commandRef, orderRef: input.orderRef,
              accountId: input.accountId, requestRef: reserved.requestRef,
              entitlementRef: reserved.entitlementRef, nodeId: CHANNEL,
              tenantRef: "tenantref_pack_cross_db",
              artifactRef: "artifactref_pack_cross_db", now: clock.value
            }), orderRef: input.orderRef };
          }
        },
        edgeIssuer: {
          issue(input) {
            return control.registerCoinCommerceDataPackEdgeCredential({
              requestRef: input.requestRef, entitlementRef: input.entitlementRef,
              edgeChannelRef: CHANNEL, edgeCredentialRef: "edgecred_pack_cross_db",
              edgeMaterialDigest: DIGEST, now: clock.value
            });
          }
        },
        desiredStateNotifier: {
          notifyOrderLifecycle(input) {
            const result = notifier.notifyOrderLifecycle(input);
            const notification = result.notifications[0];
            const desired = control.getLatestEdgeDesiredStateForChannel(CHANNEL, {
              nodeRef: NODE
            });
            if (!control.listEdgeApplyReceipts({ channelRef: CHANNEL }).some((receipt) => (
              receipt.desiredStateRef === desired.desiredStateRef && receipt.status === "applied"
            ))) {
              control.recordEdgeApplyReceipt({
                id: "receipt_pack_cross_db", channelRef: CHANNEL,
                desiredStateRef: desired.desiredStateRef, status: "applied",
                configTestOk: true, serviceActive: true, listenerUdp443: true,
                appliedAt: clock.value, createdAt: clock.value
              });
            }
            return { notificationCount: 1,
              notifications: [{ ...notification, status: "applied" }] };
          }
        }
      });
    };

    const first = commerce.claimNextFulfillmentCommand({ leaseMs: 1000 });
    assert.equal(first.orderRef, order.orderRef);
    const effect = handler().execute(fulfillmentInput(first));
    assert.equal(effect.status, "delivered");
    assert.equal(resourceCreations, 1);
    assert.equal(debitCount(), initialDebitCount);
    // Simulate a crash after control-plane effect but before Commerce completion.
    const leaseUntil = commerceDb.prepare(`select lease_until from
      platform_coin_commerce_fulfillment_commands where command_ref = ?`)
      .pluck().get(first.commandRef);
    commerce.close();
    commerceDb.close();
    control.close();

    clock.value = leaseUntil;
    commerceDb = new Database(commercePath);
    commerceDb.pragma("foreign_keys = ON");
    commerce = createSqliteCoinCommerceStore({
      database: clockedDatabase(commerceDb, clock), cancelWindowMs: 0
    });
    control = createSqliteSubscriptionControlStore({ dbPath: controlPath });
    const second = commerce.claimNextFulfillmentCommand({ leaseMs: 1000 });
    assert.equal(second.commandRef, first.commandRef);
    assert.equal(second.leaseGeneration, first.leaseGeneration + 1);
    const replayed = handler().execute(fulfillmentInput(second));
    assert.deepEqual(replayed, effect);
    assert.deepEqual(commerce.completeFulfillmentCommand({
      commandRef: second.commandRef, leaseGeneration: second.leaseGeneration,
      leaseToken: second.leaseToken, effectRef: replayed.effectRef,
      status: "delivered"
    }), { status: "delivered" });
    assert.equal(resourceCreations, 1);
    assert.equal(debitCount(), initialDebitCount);
    const deliveredOrder = commerce.getOrder({ accountId: ACCOUNT,
      orderRef: order.orderRef });
    assert.equal(deliveredOrder.paymentStatus, "captured");
    assert.equal(deliveredOrder.fulfillment.status, "delivered");
    assert.equal(commerceDb.prepare(`select count(*) from
      platform_coin_commerce_fulfillment_receipts where command_ref = ?`)
      .pluck().get(first.commandRef), 1);
    assert.equal(control.getAuditEvent(effect.effectRef)?.action,
      "data_pack_fulfillment_applied");
  } finally {
    try { commerce?.close(); } catch { /* setup may have stopped early */ }
    try { commerceDb?.close(); } catch { /* setup may have stopped early */ }
    try { control?.close(); } catch { /* setup may have stopped early */ }
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  }
});
