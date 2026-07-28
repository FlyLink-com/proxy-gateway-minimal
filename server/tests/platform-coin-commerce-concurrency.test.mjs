import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  Worker,
  isMainThread,
  parentPort,
  workerData
} from "node:worker_threads";
import Database from "better-sqlite3";

import {
  COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID,
  applyCoinCommerceMigrations
} from "../services/platform/coin-commerce-migrations.mjs";
import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  applyCoinWalletMigrations
} from "../services/platform/coin-wallet-migrations.mjs";
import {
  createSqliteCoinCommerceStore
} from "../services/platform/coin-commerce-store.mjs";

const APPLIED_AT = "2026-07-26T12:34:56.000Z";

function commerceOperation(key) {
  return {
    actorScope: "portal:acct_concurrency_1",
    idempotencyKey: key,
    actorType: "portal_user",
    actorRef: "acct_concurrency_1"
  };
}

function offer() {
  return {
    offerRef: "offer_concurrency",
    offerVersionRef: "offerv_concurrency_v1",
    version: 1,
    category: "data_pack",
    title: { zh: "并发流量包", en: "Concurrent data pack" },
    summary: { zh: "合成测试", en: "Synthetic test" },
    importantNotices: { zh: ["合成测试"], en: ["Synthetic test"] },
    baseCoinUnits: 10,
    referencePrice: { currency: "CNY", amountMinor: 1_000 },
    acceptedCoinTypes: ["paid_coins"],
    delivery: {
      kind: "data_pack",
      durationDays: null,
      monthlyTrafficGb: null,
      trafficGb: 100,
      neverExpires: true,
      discountBasisPoints: null
    }
  };
}

function initialize(dbPath) {
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
    );
    insert into platform_accounts
      (id, owner_ref, status, created_at, updated_at, metadata_json)
    values (
      'acct_concurrency_1', 'owner_concurrency_1', 'active',
      '${APPLIED_AT}', '${APPLIED_AT}', '{}'
    )
  `);
  applyCoinWalletMigrations({
    database,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(APPLIED_AT)
  });
  applyCoinCommerceMigrations({
    database,
    expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(APPLIED_AT)
  });
  database.close();
}

function seed(dbPath, { cancelWindowMs = 3_000 } = {}) {
  const store = createSqliteCoinCommerceStore({ dbPath, cancelWindowMs });
  store.walletStore.creditCoins({
    accountId: "acct_concurrency_1",
    coinType: "paid_coins",
    amountUnits: 100,
    availability: "available",
    sourceType: "synthetic_seed",
    sourceRef: "source_concurrency",
    sourceDigest: "c".repeat(64),
    policyRef: null,
    policyVersion: null,
    expiresAt: null,
    operation: {
      actorScope: "system:concurrency",
      idempotencyKey: "credit_concurrency",
      actorType: "system",
      actorRef: "concurrency_seed"
    }
  });
  store.publishOfferVersion(offer());
  return store;
}

async function withDatabase(action) {
  const directory = mkdtempSync(join(tmpdir(), "coin-commerce-concurrency-"));
  const dbPath = join(directory, "commerce.sqlite");
  initialize(dbPath);
  try {
    return await action(dbPath);
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}

function workerAction(data) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), {
      workerData: { commerceTask4Worker: true, ...data }
    });
    let message;
    let workerError;
    let timedOut = false;
    const cleanup = () => {
      clearTimeout(timer);
      worker.removeListener("message", onMessage);
      worker.removeListener("error", onError);
      worker.removeListener("exit", onExit);
    };
    const onMessage = (value) => {
      message = value;
    };
    const onError = (error) => {
      workerError = error;
    };
    const onExit = (code) => {
      if (timedOut) return;
      cleanup();
      if (workerError) {
        reject(workerError);
      } else if (code !== 0) {
        reject(new Error(`commerce worker exited with code ${code}`));
      } else if (message === undefined) {
        reject(new Error("commerce worker exited without a result"));
      } else {
        resolve(message);
      }
    };
    const timer = setTimeout(async () => {
      timedOut = true;
      try {
        await worker.terminate();
      } finally {
        cleanup();
        reject(new Error("commerce worker timeout"));
      }
    }, 10_000);
    worker.on("message", onMessage);
    worker.on("error", onError);
    worker.on("exit", onExit);
  });
}

if (!isMainThread && workerData?.commerceTask4Worker) {
  if (workerData.delayMs) {
    Atomics.wait(
      new Int32Array(new SharedArrayBuffer(4)),
      0,
      0,
      workerData.delayMs
    );
  }
  const store = createSqliteCoinCommerceStore({ dbPath: workerData.dbPath });
  try {
    let value;
    if (workerData.action === "confirm") {
      value = store.confirmOrder(workerData.input);
    } else if (workerData.action === "cancel") {
      value = store.cancelOrder(workerData.input);
    } else if (workerData.action === "claim") {
      value = store.claimDueCaptures({ limit: 10 });
    } else if (workerData.action === "capture") {
      value = store.captureClaimedOrder(workerData.input);
    } else if (workerData.action === "claim_fulfillment") {
      value = store.claimNextFulfillmentCommand({ leaseMs: 1000 });
    } else {
      throw new Error("unknown synthetic worker action");
    }
    parentPort.postMessage({ ok: true, value });
  } catch (error) {
    parentPort.postMessage({
      ok: false,
      code: error?.code,
      safeMessage: error?.message
    });
  } finally {
    store.close();
  }
}

if (isMainThread) {
  test("independent workers double-confirm one Quote into one Order and Hold", async () => {
    await withDatabase(async (dbPath) => {
      const store = seed(dbPath);
      const quote = store.createCheckoutQuote({
        accountId: "acct_concurrency_1",
        offerRef: offer().offerRef
      });
      store.close();
      const input = {
        accountId: "acct_concurrency_1",
        quoteRef: quote.quoteRef,
        operation: commerceOperation("confirm_same")
      };
      const results = await Promise.all([
        workerAction({ dbPath, action: "confirm", input }),
        workerAction({ dbPath, action: "confirm", input })
      ]);
      assert.equal(results.every((result) => result.ok), true);
      assert.equal(new Set(results.map((result) => result.value.orderRef)).size, 1);
      const database = new Database(dbPath);
      try {
        assert.equal(database.prepare(
          "select count(*) from platform_coin_commerce_orders"
        ).pluck().get(), 1);
        assert.equal(database.prepare(
          "select count(*) from platform_coin_holds"
        ).pluck().get(), 1);
      } finally {
        database.close();
      }
    });
  });

  test("same key with different Quote digests has one winner and one closed conflict", async () => {
    await withDatabase(async (dbPath) => {
      const store = seed(dbPath);
      const quote1 = store.createCheckoutQuote({
        accountId: "acct_concurrency_1",
        offerRef: offer().offerRef
      });
      const quote2 = store.createCheckoutQuote({
        accountId: "acct_concurrency_1",
        offerRef: offer().offerRef
      });
      store.close();
      const results = await Promise.all([
        workerAction({
          dbPath,
          action: "confirm",
          input: {
            accountId: "acct_concurrency_1",
            quoteRef: quote1.quoteRef,
            operation: commerceOperation("confirm_drift")
          }
        }),
        workerAction({
          dbPath,
          action: "confirm",
          input: {
            accountId: "acct_concurrency_1",
            quoteRef: quote2.quoteRef,
            operation: commerceOperation("confirm_drift")
          }
        })
      ]);
      assert.equal(results.filter((result) => result.ok).length, 1);
      assert.deepEqual(
        results.filter((result) => !result.ok).map((result) => result.code),
        ["idempotency_key_reused"]
      );
    });
  });

  test("cancel versus capture claim leaves exactly one coherent terminal path", async () => {
    await withDatabase(async (dbPath) => {
      const store = seed(dbPath, { cancelWindowMs: 25 });
      const quote = store.createCheckoutQuote({
        accountId: "acct_concurrency_1",
        offerRef: offer().offerRef
      });
      const order = store.confirmOrder({
        accountId: "acct_concurrency_1",
        quoteRef: quote.quoteRef,
        operation: commerceOperation("confirm_race")
      });
      store.close();
      const results = await Promise.all([
        workerAction({
          dbPath,
          action: "cancel",
          delayMs: 20,
          input: {
            accountId: "acct_concurrency_1",
            orderRef: order.orderRef,
            operation: commerceOperation("cancel_race")
          }
        }),
        workerAction({ dbPath, action: "claim", delayMs: 20 })
      ]);
      const read = createSqliteCoinCommerceStore({ dbPath });
      try {
        const durable = read.getOrder({
          accountId: "acct_concurrency_1",
          orderRef: order.orderRef
        });
        assert.equal(
          ["cancelled", "capture_pending"].includes(durable.paymentStatus),
          true
        );
        const hold = read.walletStore.listHolds({
          walletRef: read.walletStore.getWalletByAccountId(
            "acct_concurrency_1"
          ).walletRef,
          limit: 10
        })[0];
        assert.equal(
          durable.paymentStatus === "cancelled"
            ? hold.status === "released"
            : hold.status === "active",
          true
        );
        assert.equal(results.some((result) => result.ok), true);
      } finally {
        read.close();
      }
    });
  });

  test("two claimers and two capture retries preserve one outbox", async () => {
    await withDatabase(async (dbPath) => {
      const store = seed(dbPath, { cancelWindowMs: 1 });
      const quote = store.createCheckoutQuote({
        accountId: "acct_concurrency_1",
        offerRef: offer().offerRef
      });
      const order = store.confirmOrder({
        accountId: "acct_concurrency_1",
        quoteRef: quote.quoteRef,
        operation: commerceOperation("confirm_capture")
      });
      store.close();
      await new Promise((resolve) => setTimeout(resolve, 10));
      const claims = await Promise.all([
        workerAction({ dbPath, action: "claim" }),
        workerAction({ dbPath, action: "claim" })
      ]);
      assert.equal(
        claims.reduce((sum, result) => sum + result.value.length, 0),
        1
      );
      const captures = await Promise.all([
        workerAction({
          dbPath,
          action: "capture",
          input: { orderRef: order.orderRef }
        }),
        workerAction({
          dbPath,
          action: "capture",
          input: { orderRef: order.orderRef }
        })
      ]);
      assert.equal(captures.every((result) => result.ok), true);
      const database = new Database(dbPath);
      try {
        assert.equal(database.prepare(
          "select count(*) from platform_coin_commerce_fulfillment_commands"
        ).pluck().get(), 1);
      } finally {
        database.close();
      }
    });
  });

  test("two independent outbox claimers grant one generation and token", async () => {
    await withDatabase(async (dbPath) => {
      const store = seed(dbPath, { cancelWindowMs: 1 });
      const quote = store.createCheckoutQuote({
        accountId: "acct_concurrency_1",
        offerRef: offer().offerRef
      });
      const order = store.confirmOrder({
        accountId: "acct_concurrency_1",
        quoteRef: quote.quoteRef,
        operation: commerceOperation("confirm_outbox_claim")
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      store.claimDueCaptures({ limit: 1 });
      store.captureClaimedOrder({ orderRef: order.orderRef });
      store.close();

      const results = await Promise.all([
        workerAction({ dbPath, action: "claim_fulfillment" }),
        workerAction({ dbPath, action: "claim_fulfillment" })
      ]);

      assert.equal(results.every((result) => result.ok), true);
      const claims = results
        .map((result) => result.value)
        .filter((value) => value !== null);
      assert.equal(claims.length, 1);
      assert.equal(claims[0].leaseGeneration, 1);
      assert.match(claims[0].leaseToken, /^[0-9a-f]{64}$/);
      const database = new Database(dbPath);
      try {
        assert.deepEqual(database.prepare(`
          select status, lease_generation, lease_token
            from platform_coin_commerce_fulfillment_commands
           where order_ref = ?
        `).get(order.orderRef), {
          status: "processing",
          lease_generation: claims[0].leaseGeneration,
          lease_token: claims[0].leaseToken
        });
      } finally {
        database.close();
      }
    });
  });

  test("a competing immediate transaction maps timeout to commerce_busy", async () => {
    await withDatabase(async (dbPath) => {
      const store = seed(dbPath);
      const quote = store.createCheckoutQuote({
        accountId: "acct_concurrency_1",
        offerRef: offer().offerRef
      });
      store.close();
      const blocker = new Database(dbPath);
      blocker.exec("begin immediate");
      try {
        const result = await workerAction({
          dbPath,
          action: "confirm",
          input: {
            accountId: "acct_concurrency_1",
            quoteRef: quote.quoteRef,
            operation: commerceOperation("confirm_busy")
          }
        });
        assert.deepEqual(result, {
          ok: false,
          code: "commerce_busy",
          safeMessage: "Coin commerce store operation rejected"
        });
      } finally {
        blocker.exec("rollback");
        blocker.close();
      }
    });
  });
}
