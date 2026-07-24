import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import test from "node:test";
import {
  isMainThread,
  parentPort,
  Worker,
  workerData
} from "node:worker_threads";
import Database from "better-sqlite3";

import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  applyCoinWalletMigrations
} from "../services/platform/coin-wallet-migrations.mjs";
import {
  createSqliteCoinWalletStore
} from "../services/platform/coin-wallet-store.mjs";

const NOW = "2026-07-23T12:34:56.000Z";
const WAIT_MS = 5000;
const TABLES = [
  "platform_coin_wallets",
  "platform_coin_lots",
  "platform_coin_holds",
  "platform_coin_hold_allocations",
  "platform_coin_operation_receipts",
  "platform_coin_ledger_entries"
];
const PUBLIC_RESULT_KEYS = [
  "ok",
  "operationRef",
  "previousWalletVersion",
  "replayed",
  "resultRef",
  "resultingWalletStatus",
  "resultingWalletVersion",
  "safeResultCode",
  "walletRef"
];

function completeSnapshot(database) {
  return Object.fromEntries(TABLES.map((table) => [
    table,
    database.prepare(`select * from ${table} order by rowid`).all()
  ]));
}

function assertExactPublicResult(value, expected) {
  assert.deepEqual(Object.keys(value).sort(), PUBLIC_RESULT_KEYS);
  assert.deepEqual(value, expected);
  assert.equal(typeof value.operationRef, "string");
  assert.equal(value.operationRef.length > 0, true);
}

function assertExactDurableHold({
  snapshot,
  credit,
  request,
  result,
  failedRequest = null,
  failedResult = null
}) {
  assert.equal(snapshot.platform_coin_wallets.length, 1);
  assert.equal(snapshot.platform_coin_lots.length, 1);
  assert.equal(snapshot.platform_coin_holds.length, 1);
  assert.equal(snapshot.platform_coin_hold_allocations.length, 1);
  assert.equal(snapshot.platform_coin_operation_receipts.length, failedRequest ? 3 : 2);
  assert.equal(snapshot.platform_coin_ledger_entries.length, 2);
  assert.deepEqual(snapshot.platform_coin_operation_receipts.map(
    ({ operation_type }) => operation_type
  ).sort(), failedRequest
    ? ["create_coin_hold", "create_coin_hold", "credit_coins"]
    : ["create_coin_hold", "credit_coins"]);
  assert.deepEqual(snapshot.platform_coin_ledger_entries.map(
    ({ operation }) => operation
  ).sort(), ["available_to_held", "credit"]);

  const receipt = snapshot.platform_coin_operation_receipts.find(
    ({ operation_type, idempotency_key }) => (
      operation_type === "create_coin_hold"
      && idempotency_key === request.operation.idempotencyKey
    )
  );
  assert.deepEqual({
    operationRef: receipt.operation_ref,
    walletRef: receipt.wallet_ref,
    actorScope: receipt.actor_scope,
    operationType: receipt.operation_type,
    idempotencyKey: receipt.idempotency_key,
    status: receipt.status,
    resultRef: receipt.result_ref,
    safeResultCode: receipt.safe_result_code,
    previous: receipt.previous_wallet_version,
    resulting: receipt.resulting_wallet_version,
    resultingStatus: receipt.resulting_wallet_status
  }, {
    operationRef: result.operationRef,
    walletRef: result.walletRef,
    actorScope: request.operation.actorScope,
    operationType: "create_coin_hold",
    idempotencyKey: request.operation.idempotencyKey,
    status: "succeeded",
    resultRef: result.resultRef,
    safeResultCode: "held",
    previous: 1,
    resulting: 2,
    resultingStatus: "active"
  });
  const hold = snapshot.platform_coin_holds[0];
  assert.deepEqual({
    holdRef: hold.hold_ref,
    walletRef: hold.wallet_ref,
    purpose: hold.purpose,
    purposeRef: hold.purpose_ref,
    amountUnits: hold.amount_units,
    status: hold.status
  }, {
    holdRef: result.resultRef,
    walletRef: credit.walletRef,
    purpose: request.purpose,
    purposeRef: request.purposeRef,
    amountUnits: 10,
    status: "active"
  });
  const allocation = snapshot.platform_coin_hold_allocations[0];
  assert.deepEqual({
    holdRef: allocation.hold_ref,
    lotRef: allocation.lot_ref,
    sequence: allocation.allocation_sequence,
    units: allocation.allocated_units
  }, {
    holdRef: result.resultRef,
    lotRef: credit.resultRef,
    sequence: 1,
    units: 10
  });
  const lot = snapshot.platform_coin_lots[0];
  for (const field of [
    "pending_units", "available_units", "held_units", "consumed_units",
    "reversed_units", "expired_units"
  ]) assert.equal(lot[field] >= 0, true);
  assert.equal(
    lot.pending_units + lot.available_units + lot.held_units
      + lot.consumed_units + lot.reversed_units + lot.expired_units,
    lot.issued_units
  );
  assert.equal(lot.available_units, 0);
  assert.equal(lot.held_units, 10);
  assert.equal(snapshot.platform_coin_wallets[0].version, 2);
  const ledger = snapshot.platform_coin_ledger_entries.find(
    ({ operation_ref }) => operation_ref === result.operationRef
  );
  assert.deepEqual({
    operation: ledger.operation,
    operationRef: ledger.operation_ref,
    walletRef: ledger.wallet_ref,
    lotRef: ledger.lot_ref,
    amountUnits: ledger.amount_units,
    holdRef: ledger.hold_ref,
    orderRef: ledger.order_ref,
    sourceType: ledger.source_type,
    sourceRef: ledger.source_ref,
    actorType: ledger.actor_type,
    actorRef: ledger.actor_ref,
    previous: ledger.previous_wallet_version,
    resulting: ledger.resulting_wallet_version,
    resultingStatus: ledger.resulting_wallet_status
  }, {
    operation: "available_to_held",
    operationRef: result.operationRef,
    walletRef: credit.walletRef,
    lotRef: credit.resultRef,
    amountUnits: 10,
    holdRef: result.resultRef,
    orderRef: request.purposeRef,
    sourceType: "verified_recharge",
    sourceRef: "seed_credit",
    actorType: "user",
    actorRef: "account_1",
    previous: 1,
    resulting: 2,
    resultingStatus: "active"
  });
  if (failedRequest) {
    const failed = snapshot.platform_coin_operation_receipts.find(
      ({ operation_type, idempotency_key }) => (
        operation_type === "create_coin_hold"
        && idempotency_key === failedRequest.operation.idempotencyKey
      )
    );
    assert.deepEqual({
      operationRef: failed.operation_ref,
      walletRef: failed.wallet_ref,
      actorScope: failed.actor_scope,
      operationType: failed.operation_type,
      idempotencyKey: failed.idempotency_key,
      status: failed.status,
      resultRef: failed.result_ref,
      safeResultCode: failed.safe_result_code,
      previous: failed.previous_wallet_version,
      resulting: failed.resulting_wallet_version,
      resultingStatus: failed.resulting_wallet_status
    }, {
      operationRef: failedResult.operationRef,
      walletRef: failedResult.walletRef,
      actorScope: failedRequest.operation.actorScope,
      operationType: "create_coin_hold",
      idempotencyKey: failedRequest.operation.idempotencyKey,
      status: "failed",
      resultRef: null,
      safeResultCode: "insufficient_balance",
      previous: 2,
      resulting: 2,
      resultingStatus: "active"
    });
    assert.equal(snapshot.platform_coin_ledger_entries.some(
      ({ operation_ref }) => operation_ref === failed.operation_ref
    ), false);
  }
}

function initializeWalletDatabase(dbPath) {
  assert.equal(isAbsolute(dbPath), true);
  const database = new Database(dbPath);
  let store;
  try {
    database.pragma("foreign_keys = ON");
    database.pragma("busy_timeout = 250");
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
      nowFn: () => new Date(NOW)
    });
    assert.equal(database.pragma("journal_mode = WAL", { simple: true }), "wal");
    database.prepare(`
    insert into platform_accounts (
      id, owner_ref, status, created_at, updated_at, metadata_json
    ) values ('account_1', 'owner_1', 'active', ?, ?, '{}')
    `).run(NOW, NOW);
    store = createSqliteCoinWalletStore({ database });
    return store.creditCoins({
    accountId: "account_1",
    coinType: "paid_coins",
    amountUnits: 10,
    availability: "available",
    sourceType: "verified_recharge",
    sourceRef: "seed_credit",
    sourceDigest: "a".repeat(64),
    policyRef: null,
    policyVersion: null,
    expiresAt: null,
    operation: {
      actorScope: "account:account_1",
      idempotencyKey: "seed_credit",
      actorType: "system",
      actorRef: "test_seed"
    }
    });
  } finally {
    store?.close();
    database.close();
  }
}

function holdRequest(walletRef, suffix) {
  return {
    walletRef,
    purpose: "product_purchase",
    purposeRef: `order_${suffix}`,
    amountUnits: 10,
    acceptedCoinTypes: ["paid_coins"],
    expiresAt: "2099-01-01T00:00:00.000Z",
    operation: {
      actorScope: "account:account_1",
      idempotencyKey: `hold_${suffix}`,
      actorType: "user",
      actorRef: "account_1"
    }
  };
}

function initializeLifecycleRaceDatabase(dbPath, { coinType }) {
  assert.equal(isAbsolute(dbPath), true);
  const database = new Database(dbPath);
  try {
    database.pragma("foreign_keys = ON");
    database.pragma("busy_timeout = 250");
    database.exec(`
      create table platform_accounts (
        id text primary key,
        owner_ref text not null,
        status text not null,
        created_at text not null,
        updated_at text not null,
        metadata_json text not null default '{}'
      )
    `);
    applyCoinWalletMigrations({
      database,
      expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
      expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
      nowFn: () => new Date(NOW)
    });
    assert.equal(database.pragma("journal_mode = WAL", { simple: true }), "wal");
    database.prepare(`
      insert into platform_accounts (
        id, owner_ref, status, created_at, updated_at, metadata_json
      ) values ('account_lifecycle', 'owner_lifecycle', 'active', ?, ?, '{}')
    `).run(NOW, NOW);
    database.prepare(`
      insert into platform_coin_wallets (
        wallet_ref, account_id, status, version, created_at, updated_at
      ) values (
        'wallet_lifecycle', 'account_lifecycle', 'active', 2, ?, ?
      )
    `).run(NOW, NOW);
    const seed = database.transaction(() => {
      database.prepare(`
        insert into platform_coin_operation_receipts (
          operation_ref, wallet_ref, actor_scope, operation_type,
          idempotency_key, request_digest, status, previous_wallet_version,
          resulting_wallet_version, resulting_wallet_status, result_ref,
          safe_result_code, created_at, completed_at
        ) values (
          'operation_lifecycle_credit', 'wallet_lifecycle', 'system:seed',
          'credit_coins', 'lifecycle_credit', 'credit_digest', 'succeeded',
          0, 1, 'active', 'lot_lifecycle', 'credited', ?, ?
        )
      `).run(NOW, NOW);
      database.prepare(`
        insert into platform_coin_operation_receipts (
          operation_ref, wallet_ref, actor_scope, operation_type,
          idempotency_key, request_digest, status, previous_wallet_version,
          resulting_wallet_version, resulting_wallet_status, result_ref,
          safe_result_code, created_at, completed_at
        ) values (
          'operation_lifecycle_hold', 'wallet_lifecycle', 'system:seed',
          'create_coin_hold', 'lifecycle_hold', 'hold_digest', 'succeeded',
          1, 2, 'active', 'hold_lifecycle', 'held', ?, ?
        )
      `).run(NOW, NOW);
      database.prepare(`
        insert into platform_coin_credit_origins (
          credit_origin_ref, wallet_ref, coin_type, source_type, source_ref,
          source_digest, operation_ref, lot_ref, created_at
        ) values (
          'origin_lifecycle', 'wallet_lifecycle', ?, 'synthetic_seed',
          'source_lifecycle', 'source_digest',
          'operation_lifecycle_credit', 'lot_lifecycle', ?
        )
      `).run(coinType, NOW);
      database.prepare(`
        insert into platform_coin_lots (
          lot_ref, wallet_ref, coin_type, credit_origin_ref, issued_units,
          pending_units, available_units, held_units, consumed_units,
          reversed_units, expired_units, source_type, source_ref, policy_ref,
          policy_version, expires_at, created_at, updated_at
        ) values (
          'lot_lifecycle', 'wallet_lifecycle', ?, 'origin_lifecycle', 10,
          0, 0, 10, 0, 0, 0, 'synthetic_seed', 'source_lifecycle',
          null, null, ?, ?, ?
        )
      `).run(
        coinType,
        coinType === "bonus_coins" ? "2000-01-01T00:00:00.000Z" : null,
        NOW,
        NOW
      );
      database.prepare(`
        insert into platform_coin_holds (
          hold_ref, wallet_ref, purpose, purpose_ref, amount_units, status,
          expires_at, created_at, updated_at
        ) values (
          'hold_lifecycle', 'wallet_lifecycle', 'product_purchase',
          'order_lifecycle', 10, 'active', '2000-01-01T00:00:00.000Z', ?, ?
        )
      `).run(NOW, NOW);
      database.prepare(`
        insert into platform_coin_hold_allocations (
          allocation_ref, hold_ref, lot_ref, allocation_sequence,
          allocated_units, created_at
        ) values (
          'allocation_lifecycle', 'hold_lifecycle', 'lot_lifecycle', 1, 10, ?
        )
      `).run(NOW);
      for (const [entryRef, operationRef, operation, previous, resulting] of [
        ["ledger_lifecycle_credit", "operation_lifecycle_credit", "credit", 0, 1],
        [
          "ledger_lifecycle_hold",
          "operation_lifecycle_hold",
          "available_to_held",
          1,
          2
        ]
      ]) {
        database.prepare(`
          insert into platform_coin_ledger_entries (
            entry_ref, operation_ref, wallet_ref, lot_ref, operation,
            amount_units, hold_ref, order_ref, source_type, source_ref,
            actor_type, actor_ref, previous_wallet_version,
            resulting_wallet_version, resulting_wallet_status, occurred_at
          ) values (?, ?, 'wallet_lifecycle', 'lot_lifecycle', ?, 10, ?, ?,
                    'synthetic_seed', 'source_lifecycle', 'system', 'seed',
                    ?, ?, 'active', ?)
        `).run(
          entryRef,
          operationRef,
          operation,
          operation === "available_to_held" ? "hold_lifecycle" : null,
          operation === "available_to_held" ? "order_lifecycle" : null,
          previous,
          resulting,
          NOW
        );
      }
    });
    seed.immediate();
    return {
      walletRef: "wallet_lifecycle",
      lotRef: "lot_lifecycle",
      holdRef: "hold_lifecycle"
    };
  } finally {
    database.close();
  }
}

function waitForMessage(worker, predicate, timeoutMs = WAIT_MS) {
  let cancel;
  const promise = new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("worker_message_timeout"));
    }, timeoutMs);
    const onMessage = (message) => {
      if (settled || !predicate(message)) return;
      settled = true;
      cleanup();
      resolve(message);
    };
    const onError = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onExit = (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`worker_exited_${code}`));
    };
    const cleanup = () => {
      clearTimeout(timer);
      worker.off("message", onMessage);
      worker.off("error", onError);
      worker.off("exit", onExit);
    };
    worker.on("message", onMessage);
    worker.on("error", onError);
    worker.on("exit", onExit);
    cancel = (reason = new Error("worker_wait_cancelled")) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(reason);
    };
  });
  promise.cancel = cancel;
  promise.catch(() => {});
  return promise;
}

async function sendCommand(worker, message, expectedType) {
  const waiting = waitForMessage(
    worker,
    (candidate) => (
      candidate?.type === expectedType
      && candidate.commandId === message.commandId
    )
  );
  try {
    worker.postMessage(message);
  } catch (error) {
    waiting.cancel(error);
    await waiting.catch(() => {});
    throw error;
  }
  return waiting;
}

async function terminateWorker(worker) {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("worker_terminate_timeout")),
      WAIT_MS
    );
    worker.terminate().then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function closeWorker(worker) {
  if (worker.threadId === -1) return;
  const commandId = `close_${Math.random()}`;
  const exited = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("worker_exit_timeout"));
    }, WAIT_MS);
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timer);
      worker.off("error", onError);
    };
    worker.on("error", onError);
    worker.once("exit", (code) => {
      cleanup();
      if (code === 0) resolve();
      else reject(new Error(`worker_exit_${code}`));
    });
  });
  void exited.catch(() => {});
  try {
    await sendCommand(worker, { type: "close", commandId }, "closed");
    await exited;
  } catch (error) {
    await terminateWorker(worker);
    await exited.catch(() => {});
    throw error;
  }
}

async function closeWorkers(workers) {
  let firstError = null;
  for (const worker of workers) {
    try {
      await closeWorker(worker);
    } catch (error) {
      firstError ??= error;
      try {
        await terminateWorker(worker);
      } catch {
        // Continue closing every remaining worker.
      }
    }
  }
  if (firstError) throw firstError;
}

function newWorker(
  dbPath,
  request,
  barrier = null,
  method = "createCoinHold"
) {
  return new Worker(new URL(import.meta.url), {
    execArgv: [],
    workerData: {
      workerMode: "coin_hold",
      dbPath,
      request,
      barrier,
      method,
      busyTimeoutMs: 40
    }
  });
}

async function workerMain() {
  let database;
  let store;
  let connectionConfig;
  try {
    database = new Database(workerData.dbPath);
    database.pragma("foreign_keys = ON");
    database.pragma(`busy_timeout = ${workerData.busyTimeoutMs}`);
    assert.equal(database.pragma("journal_mode", { simple: true }), "wal");
    connectionConfig = {
      journalMode: database.pragma("journal_mode", { simple: true }),
      foreignKeys: database.pragma("foreign_keys", { simple: true }),
      busyTimeoutMs: database.pragma("busy_timeout", { simple: true })
    };
    assert.deepEqual(connectionConfig, {
      journalMode: "wal",
      foreignKeys: 1,
      busyTimeoutMs: workerData.busyTimeoutMs
    });
    store = createSqliteCoinWalletStore({ database });
  } catch (error) {
    try {
      store?.close();
    } finally {
      database?.close();
    }
    throw error;
  }
  parentPort.postMessage({ type: "ready", connectionConfig });
  parentPort.on("message", (message) => {
    if (message.type === "close") {
      try {
        store.close();
      } finally {
        database.close();
      }
      parentPort.postMessage({ type: "closed", commandId: message.commandId });
      parentPort.close();
      return;
    }
    if (message.type !== "hold" && message.type !== "race") return;
    if (message.type === "race") {
      const barrier = new Int32Array(workerData.barrier);
      parentPort.postMessage({ type: "barrier_ready", commandId: message.commandId });
      const waitResult = Atomics.wait(barrier, 0, 0, WAIT_MS);
      if (waitResult === "timed-out" || Atomics.load(barrier, 1) === 1) {
        parentPort.postMessage({
          type: "result",
          commandId: message.commandId,
          harnessError: waitResult === "timed-out"
            ? "barrier_timeout"
            : "barrier_aborted",
          inTransaction: database.inTransaction
        });
        return;
      }
    }
    if (database.inTransaction) {
      parentPort.postMessage({
        type: "result",
        commandId: message.commandId,
        harnessError: "worker_transaction_not_clean",
        inTransaction: true
      });
      return;
    }
    try {
      const value = store[workerData.method](workerData.request);
      parentPort.postMessage({
        type: "result",
        commandId: message.commandId,
        value,
        inTransaction: database.inTransaction
      });
    } catch (error) {
      parentPort.postMessage({
        type: "result",
        commandId: message.commandId,
        error: { code: error?.code, message: error?.message },
        inTransaction: database.inTransaction
      });
    }
  });
}

async function runBarrierRace(workers, label, barrier) {
  const readyRows = await Promise.all(workers.map(
    (worker) => waitForMessage(worker, (message) => message?.type === "ready")
  ));
  for (const ready of readyRows) {
    assert.deepEqual(ready.connectionConfig, {
      journalMode: "wal",
      foreignKeys: 1,
      busyTimeoutMs: 40
    });
  }
  const commands = [];
  try {
    for (const [index, worker] of workers.entries()) {
      const commandId = `${label}_${index}`;
      const barrierReady = waitForMessage(
        worker,
        (message) => (
          message?.type === "barrier_ready"
          && message.commandId === commandId
        )
      );
      const result = waitForMessage(
        worker,
        (message) => (
          message?.type === "result"
          && message.commandId === commandId
        )
      );
      commands.push({ barrierReady, result });
      worker.postMessage({ type: "race", commandId });
    }
    await Promise.all(commands.map(({ barrierReady }) => barrierReady));
  } catch (error) {
    for (const { barrierReady } of commands) barrierReady.cancel(error);
    const view = new Int32Array(barrier);
    Atomics.store(view, 1, 1);
    Atomics.store(view, 0, 1);
    Atomics.notify(view, 0, workers.length);
    for (const { result } of commands) result.cancel(error);
    await Promise.allSettled(commands.map(({ result }) => result));
    throw error;
  }
  const view = new Int32Array(barrier);
  Atomics.store(view, 0, 1);
  Atomics.notify(view, 0, workers.length);
  const results = await Promise.all(commands.map(({ result }) => result));
  assert.deepEqual(results.map(({ harnessError }) => harnessError), [
    undefined,
    undefined
  ]);
  return results;
}

async function retryLifecycleBusy(worker, initial, commandId) {
  if (initial.error?.code !== "wallet_busy") return initial;
  return sendCommand(worker, { type: "hold", commandId }, "result");
}

if (!isMainThread && workerData?.workerMode === "coin_hold") {
  await workerMain();
}

if (isMainThread) {
  test("concurrency harness keeps bounded cancellable waits and explicit cleanup", () => {
    const source = readFileSync(new URL(import.meta.url), "utf8")
      .replace(/\r\n?/g, "\n");
    for (const pattern of [
      /promise\.cancel = cancel/,
      /promise\.catch\(\(\) => \{\}\)/,
      /Promise\.allSettled\(commands\.map/,
      /worker_terminate_timeout/,
      /execArgv:\s*\[\]/,
      /const exited = new Promise[\s\S]*?\n  \}\);\n  void exited\.catch\(\(\) => \{\}\);\n  try \{/,
      /store\?\.close\(\)[\s\S]*database\.close\(\)/,
      /store\.close\(\)[\s\S]*finally\s*\{[\s\S]*database\.close\(\)/
    ]) assert.match(source, pattern);
  });

  test("BEGIN IMMEDIATE busy is transient and does not consume the hold key", async () => {
    const directory = mkdtempSync(join(tmpdir(), "coin-wallet-busy-"));
    const dbPath = join(directory, "wallet.sqlite");
    let worker;
    let database;
    let store;
    try {
      const credit = initializeWalletDatabase(dbPath);
      const request = holdRequest(credit.walletRef, "busy");
      worker = newWorker(dbPath, request);
      const ready = await waitForMessage(
        worker,
        (message) => message?.type === "ready"
      );
      assert.deepEqual(ready.connectionConfig, {
        journalMode: "wal",
        foreignKeys: 1,
        busyTimeoutMs: 40
      });

      database = new Database(dbPath);
      database.pragma("foreign_keys = ON");
      database.pragma("busy_timeout = 250");
      assert.equal(database.pragma("journal_mode", { simple: true }), "wal");
      store = createSqliteCoinWalletStore({ database });
      const before = completeSnapshot(database);
      database.exec("begin immediate");
      assert.equal(database.inTransaction, true);
      const lockedBaseline = completeSnapshot(database);
      assert.deepEqual(lockedBaseline, before);

      const busy = await sendCommand(
        worker,
        { type: "hold", commandId: "busy_first" },
        "result"
      );
      assert.deepEqual(busy.error, {
        code: "wallet_busy",
        message: "Coin wallet store operation rejected"
      });
      assert.equal(busy.inTransaction, false);
      assert.deepEqual(completeSnapshot(database), before);
      assert.equal(database.prepare(`
        select count(*) from platform_coin_operation_receipts
         where operation_type = 'create_coin_hold'
           and idempotency_key = 'hold_busy'
      `).pluck().get(), 0);
      database.exec("rollback");

      const first = await sendCommand(
        worker,
        { type: "hold", commandId: "busy_retry" },
        "result"
      );
      assert.equal(first.error, undefined);
      assertExactPublicResult(first.value, {
        ok: true,
        replayed: false,
        operationRef: first.value.operationRef,
        walletRef: credit.walletRef,
        safeResultCode: "held",
        resultRef: first.value.resultRef,
        previousWalletVersion: 1,
        resultingWalletVersion: 2,
        resultingWalletStatus: "active"
      });
      const replay = await sendCommand(
        worker,
        { type: "hold", commandId: "busy_replay" },
        "result"
      );
      assertExactPublicResult(replay.value, { ...first.value, replayed: true });

      const after = completeSnapshot(database);
      assertExactDurableHold({
        snapshot: after,
        credit,
        request,
        result: first.value
      });
      assert.equal(after.platform_coin_holds.length, 1);
      assert.equal(after.platform_coin_holds[0].status, "active");
      assert.equal(after.platform_coin_hold_allocations.reduce(
        (sum, row) => sum + row.allocated_units,
        0
      ), 10);
      assert.equal(after.platform_coin_lots[0].available_units, 0);
      assert.equal(after.platform_coin_lots[0].held_units, 10);
      assert.equal(after.platform_coin_wallets[0].version, 2);
      const holdReceipts = after.platform_coin_operation_receipts.filter(
        ({ operation_type }) => operation_type === "create_coin_hold"
      );
      assert.equal(holdReceipts.length, 1);
      assert.equal(holdReceipts[0].status, "succeeded");
      assert.deepEqual(after.platform_coin_ledger_entries.filter(
        ({ operation }) => operation === "available_to_held"
      ).map(({ amount_units }) => amount_units), [10]);
    } finally {
      try {
        if (database?.inTransaction) database.exec("rollback");
      } finally {
        try {
          store?.close();
        } finally {
          try {
            database?.close();
          } finally {
            try {
              if (worker) await closeWorkers([worker]);
            } finally {
              rmSync(directory, {
                recursive: true,
                force: true,
                maxRetries: 3,
                retryDelay: 50
              });
            }
          }
        }
      }
    }
  });

  test("lifecycle BEGIN IMMEDIATE busy consumes no release key", async () => {
    const directory = mkdtempSync(join(tmpdir(), "coin-wallet-lifecycle-busy-"));
    const dbPath = join(directory, "wallet.sqlite");
    let worker;
    let database;
    try {
      const subject = initializeLifecycleRaceDatabase(dbPath, {
        coinType: "paid_coins"
      });
      const request = {
        holdRef: subject.holdRef,
        operation: {
          actorScope: "account:account_lifecycle",
          idempotencyKey: "release_lifecycle_busy",
          actorType: "user",
          actorRef: "account_lifecycle"
        }
      };
      worker = newWorker(dbPath, request, null, "releaseCoinHold");
      const ready = await waitForMessage(
        worker,
        (message) => message?.type === "ready"
      );
      assert.deepEqual(ready.connectionConfig, {
        journalMode: "wal",
        foreignKeys: 1,
        busyTimeoutMs: 40
      });

      database = new Database(dbPath);
      database.pragma("foreign_keys = ON");
      database.pragma("busy_timeout = 250");
      assert.equal(database.pragma("journal_mode", { simple: true }), "wal");
      const before = completeSnapshot(database);
      database.exec("begin immediate");
      assert.equal(database.inTransaction, true);

      const busy = await sendCommand(
        worker,
        { type: "hold", commandId: "lifecycle_busy_first" },
        "result"
      );
      assert.deepEqual(busy.error, {
        code: "wallet_busy",
        message: "Coin wallet store operation rejected"
      });
      assert.equal(busy.inTransaction, false);
      assert.deepEqual(completeSnapshot(database), before);
      assert.equal(database.prepare(`
        select count(*) from platform_coin_operation_receipts
         where operation_type = 'release_coin_hold'
           and idempotency_key = 'release_lifecycle_busy'
      `).pluck().get(), 0);
      database.exec("rollback");

      const first = await sendCommand(
        worker,
        { type: "hold", commandId: "lifecycle_busy_retry" },
        "result"
      );
      assert.equal(first.error, undefined);
      assert.equal(first.inTransaction, false);
      assertExactPublicResult(first.value, {
        ok: true,
        replayed: false,
        operationRef: first.value.operationRef,
        walletRef: subject.walletRef,
        safeResultCode: "released",
        resultRef: subject.holdRef,
        previousWalletVersion: 2,
        resultingWalletVersion: 3,
        resultingWalletStatus: "active"
      });
      const replay = await sendCommand(
        worker,
        { type: "hold", commandId: "lifecycle_busy_replay" },
        "result"
      );
      assert.equal(replay.error, undefined);
      assert.equal(replay.inTransaction, false);
      assertExactPublicResult(replay.value, {
        ...first.value,
        replayed: true
      });

      const after = completeSnapshot(database);
      assert.equal(after.platform_coin_wallets[0].version, 3);
      assert.equal(after.platform_coin_holds[0].status, "released");
      assert.equal(after.platform_coin_lots[0].available_units, 10);
      assert.equal(after.platform_coin_lots[0].held_units, 0);
      assert.equal(after.platform_coin_operation_receipts.filter(
        ({ operation_type, idempotency_key }) => (
          operation_type === "release_coin_hold"
          && idempotency_key === "release_lifecycle_busy"
        )
      ).length, 1);
      assert.equal(after.platform_coin_ledger_entries.filter(
        ({ operation_ref }) => operation_ref === first.value.operationRef
      ).length, 1);
    } finally {
      try {
        if (database?.inTransaction) database.exec("rollback");
      } finally {
        try {
          database?.close();
        } finally {
          try {
            if (worker) await closeWorkers([worker]);
          } finally {
            rmSync(directory, {
              recursive: true,
              force: true,
              maxRetries: 3,
              retryDelay: 50
            });
          }
        }
      }
    }
  });

  test("two WAL workers serialize competing full-balance holds", async () => {
    const directory = mkdtempSync(join(tmpdir(), "coin-wallet-race-"));
    const dbPath = join(directory, "wallet.sqlite");
    const workers = [];
    const requests = [];
    let database;
    let barrier;
    try {
      const credit = initializeWalletDatabase(dbPath);
      barrier = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
      for (const suffix of ["race_a", "race_b"]) {
        const request = holdRequest(credit.walletRef, suffix);
        requests.push(request);
        const worker = newWorker(dbPath, request, barrier);
        workers.push(worker);
      }
      const readyRows = await Promise.all(workers.map(
        (worker) => waitForMessage(worker, (message) => message?.type === "ready")
      ));
      for (const ready of readyRows) {
        assert.deepEqual(ready.connectionConfig, {
          journalMode: "wal",
          foreignKeys: 1,
          busyTimeoutMs: 40
        });
      }

      const commands = [];
      try {
        for (const [index, worker] of workers.entries()) {
          const commandId = `race_${index}`;
          const barrierReady = waitForMessage(
            worker,
            (message) => (
              message?.type === "barrier_ready"
              && message.commandId === commandId
            )
          );
          const result = waitForMessage(
            worker,
            (message) => (
              message?.type === "result"
              && message.commandId === commandId
            )
          );
          commands.push({ barrierReady, result });
          worker.postMessage({ type: "race", commandId });
        }
        await Promise.all(commands.map(({ barrierReady }) => barrierReady));
      } catch (error) {
        for (const { barrierReady } of commands) barrierReady.cancel(error);
        const view = new Int32Array(barrier);
        Atomics.store(view, 1, 1);
        Atomics.store(view, 0, 1);
        Atomics.notify(view, 0, workers.length);
        for (const { result } of commands) result.cancel(error);
        await Promise.allSettled(commands.map(({ result }) => result));
        throw error;
      }
      const view = new Int32Array(barrier);
      Atomics.store(view, 0, 1);
      Atomics.notify(view, 0, 2);
      const initial = await Promise.all(commands.map(({ result }) => result));
      assert.deepEqual(initial.map(({ harnessError }) => harnessError), [
        undefined,
        undefined
      ]);

      const winnerIndexes = initial
        .map((result, index) => result.value?.ok === true ? index : -1)
        .filter((index) => index >= 0);
      assert.equal(winnerIndexes.length, 1);
      const winnerIndex = winnerIndexes[0];
      const winner = initial[winnerIndex].value;
      assertExactPublicResult(winner, {
        ok: true,
        replayed: false,
        operationRef: winner.operationRef,
        walletRef: credit.walletRef,
        safeResultCode: "held",
        resultRef: winner.resultRef,
        previousWalletVersion: 1,
        resultingWalletVersion: 2,
        resultingWalletStatus: "active"
      });
      const loserIndex = winnerIndexes[0] === 0 ? 1 : 0;
      const loser = initial[loserIndex];
      assert.equal(
        loser.error?.code === "wallet_busy"
          || (
            loser.value?.ok === false
            && loser.value.safeResultCode === "insufficient_balance"
          ),
        true
      );
      assert.equal(loser.inTransaction, false);
      const loserWasBusy = loser.error?.code === "wallet_busy";
      if (loserWasBusy) {
        assert.deepEqual(loser.error, {
          code: "wallet_busy",
          message: "Coin wallet store operation rejected"
        });
        const busyReadback = new Database(dbPath, { readonly: true });
        try {
          assert.equal(busyReadback.prepare(`
            select count(*) from platform_coin_operation_receipts
             where operation_type = 'create_coin_hold'
               and idempotency_key = ?
          `).pluck().get(`hold_race_${loserIndex === 0 ? "a" : "b"}`), 0);
        } finally {
          busyReadback.close();
        }
      } else {
        assertExactPublicResult(loser.value, {
          ok: false,
          replayed: false,
          operationRef: loser.value.operationRef,
          walletRef: credit.walletRef,
          safeResultCode: "insufficient_balance",
          resultRef: null,
          previousWalletVersion: 2,
          resultingWalletVersion: 2,
          resultingWalletStatus: "active"
        });
      }

      const firstRetry = await sendCommand(
        workers[loserIndex],
        { type: "hold", commandId: "loser_retry" },
        "result"
      );
      assert.equal(firstRetry.error, undefined);
      assertExactPublicResult(firstRetry.value, {
        ok: false,
        replayed: loserWasBusy ? false : true,
        operationRef: firstRetry.value.operationRef,
        walletRef: credit.walletRef,
        safeResultCode: "insufficient_balance",
        resultRef: null,
        previousWalletVersion: 2,
        resultingWalletVersion: 2,
        resultingWalletStatus: "active"
      });
      assert.equal(
        firstRetry.value.replayed,
        loserWasBusy ? false : true
      );
      const secondRetry = await sendCommand(
        workers[loserIndex],
        { type: "hold", commandId: "loser_replay" },
        "result"
      );
      assert.deepEqual(secondRetry.value, {
        ...firstRetry.value,
        replayed: true
      });
      assertExactPublicResult(secondRetry.value, {
        ...firstRetry.value,
        replayed: true
      });

      database = new Database(dbPath, { readonly: true });
      assert.equal(database.pragma("journal_mode", { simple: true }), "wal");
      const snapshot = completeSnapshot(database);
      assertExactDurableHold({
        snapshot,
        credit,
        request: requests[winnerIndex],
        result: winner,
        failedRequest: requests[loserIndex],
        failedResult: firstRetry.value
      });
      assert.equal(snapshot.platform_coin_holds.length, 1);
      const winnerSuffix = winnerIndex === 0 ? "a" : "b";
      const loserSuffix = loserIndex === 0 ? "a" : "b";
      const winnerReceipt = snapshot.platform_coin_operation_receipts.find(
        ({ operation_type, idempotency_key }) => (
          operation_type === "create_coin_hold"
          && idempotency_key === `hold_race_${winnerSuffix}`
        )
      );
      const loserReceipt = snapshot.platform_coin_operation_receipts.find(
        ({ operation_type, idempotency_key }) => (
          operation_type === "create_coin_hold"
          && idempotency_key === `hold_race_${loserSuffix}`
        )
      );
      assert.deepEqual({
        status: winnerReceipt.status,
        safeResultCode: winnerReceipt.safe_result_code,
        resultRef: winnerReceipt.result_ref,
        previous: winnerReceipt.previous_wallet_version,
        resulting: winnerReceipt.resulting_wallet_version,
        resultingStatus: winnerReceipt.resulting_wallet_status
      }, {
        status: "succeeded",
        safeResultCode: "held",
        resultRef: winner.resultRef,
        previous: 1,
        resulting: 2,
        resultingStatus: "active"
      });
      assert.deepEqual({
        status: loserReceipt.status,
        safeResultCode: loserReceipt.safe_result_code,
        resultRef: loserReceipt.result_ref,
        previous: loserReceipt.previous_wallet_version,
        resulting: loserReceipt.resulting_wallet_version,
        resultingStatus: loserReceipt.resulting_wallet_status
      }, {
        status: "failed",
        safeResultCode: "insufficient_balance",
        resultRef: null,
        previous: 2,
        resulting: 2,
        resultingStatus: "active"
      });
      assert.deepEqual(snapshot.platform_coin_holds[0], {
        hold_ref: winner.resultRef,
        wallet_ref: credit.walletRef,
        purpose: "product_purchase",
        purpose_ref: `order_race_${winnerSuffix}`,
        amount_units: 10,
        status: "active",
        expires_at: "2099-01-01T00:00:00.000Z",
        created_at: snapshot.platform_coin_holds[0].created_at,
        updated_at: snapshot.platform_coin_holds[0].updated_at
      });
      assert.equal(snapshot.platform_coin_hold_allocations.length, 1);
      assert.equal(snapshot.platform_coin_hold_allocations[0].hold_ref, winner.resultRef);
      assert.equal(snapshot.platform_coin_hold_allocations[0].allocation_sequence, 1);
      assert.equal(snapshot.platform_coin_hold_allocations[0].lot_ref, credit.resultRef);
      assert.equal(snapshot.platform_coin_hold_allocations.reduce(
        (sum, row) => sum + row.allocated_units,
        0
      ), 10);
      for (const lot of snapshot.platform_coin_lots) {
        for (const field of [
          "pending_units", "available_units", "held_units", "consumed_units",
          "reversed_units", "expired_units"
        ]) assert.equal(lot[field] >= 0, true);
        assert.equal(
          lot.pending_units + lot.available_units + lot.held_units
            + lot.consumed_units + lot.reversed_units + lot.expired_units,
          lot.issued_units
        );
      }
      const lot = snapshot.platform_coin_lots[0];
      assert.equal(lot.available_units, 0);
      assert.equal(lot.held_units, 10);
      assert.equal(snapshot.platform_coin_wallets[0].version, 2);
      const holdReceipts = snapshot.platform_coin_operation_receipts.filter(
        ({ operation_type }) => operation_type === "create_coin_hold"
      );
      assert.equal(holdReceipts.filter(({ status }) => status === "succeeded").length, 1);
      assert.equal(holdReceipts.filter(({ status }) => status === "failed").length, 1);
      assert.equal(holdReceipts.length, 2);
      const winnerLedger = snapshot.platform_coin_ledger_entries.filter(
        ({ operation_ref }) => operation_ref === winnerReceipt.operation_ref
      );
      assert.equal(winnerLedger.length, 1);
      assert.deepEqual({
        operation: winnerLedger[0].operation,
        walletRef: winnerLedger[0].wallet_ref,
        lotRef: winnerLedger[0].lot_ref,
        amountUnits: winnerLedger[0].amount_units,
        holdRef: winnerLedger[0].hold_ref,
        orderRef: winnerLedger[0].order_ref,
        sourceType: winnerLedger[0].source_type,
        sourceRef: winnerLedger[0].source_ref,
        actorType: winnerLedger[0].actor_type,
        actorRef: winnerLedger[0].actor_ref,
        previous: winnerLedger[0].previous_wallet_version,
        resulting: winnerLedger[0].resulting_wallet_version,
        resultingStatus: winnerLedger[0].resulting_wallet_status
      }, {
        operation: "available_to_held",
        walletRef: credit.walletRef,
        lotRef: credit.resultRef,
        amountUnits: 10,
        holdRef: winner.resultRef,
        orderRef: `order_race_${winnerSuffix}`,
        sourceType: "verified_recharge",
        sourceRef: "seed_credit",
        actorType: "user",
        actorRef: "account_1",
        previous: 1,
        resulting: 2,
        resultingStatus: "active"
      });
      assert.equal(snapshot.platform_coin_ledger_entries.filter(
        ({ operation_ref }) => operation_ref === loserReceipt.operation_ref
      ).length, 0);
    } finally {
      if (barrier) {
        const view = new Int32Array(barrier);
        Atomics.store(view, 1, 1);
        Atomics.store(view, 0, 1);
        Atomics.notify(view, 0, workers.length);
      }
      try {
        database?.close();
      } finally {
        try {
          await closeWorkers(workers);
        } finally {
          rmSync(directory, {
            recursive: true,
            force: true,
            maxRetries: 3,
            retryDelay: 50
          });
        }
      }
    }
  });

  test("capture versus due hold expiry has one financial winner and busy consumes no key", async () => {
    const directory = mkdtempSync(join(tmpdir(), "coin-wallet-capture-expiry-race-"));
    const dbPath = join(directory, "wallet.sqlite");
    const barrier = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
    const workers = [];
    let database;
    try {
      const subject = initializeLifecycleRaceDatabase(dbPath, {
        coinType: "paid_coins"
      });
      workers.push(newWorker(
        dbPath,
        {
          holdRef: subject.holdRef,
          operation: {
            actorScope: "account:account_lifecycle",
            idempotencyKey: "capture_lifecycle_race",
            actorType: "user",
            actorRef: "account_lifecycle"
          }
        },
        barrier,
        "captureCoinHold"
      ));
      workers.push(newWorker(
        dbPath,
        { holdRef: subject.holdRef },
        barrier,
        "expireCoinHold"
      ));

      const initial = await runBarrierRace(
        workers,
        "capture_expiry",
        barrier
      );
      assert.deepEqual(initial.map(({ inTransaction }) => inTransaction), [
        false,
        false
      ]);
      database = new Database(dbPath, { readonly: true });
      for (const [index, operationType, idempotencyKey] of [
        [0, "capture_coin_hold", "capture_lifecycle_race"],
        [
          1,
          "expire_coin_hold",
          `hold-expiry:${subject.holdRef}:2000-01-01T00:00:00.000Z`
        ]
      ]) {
        if (initial[index].error?.code === "wallet_busy") {
          assert.equal(database.prepare(`
            select count(*) from platform_coin_operation_receipts
             where operation_type = ? and idempotency_key = ?
          `).pluck().get(operationType, idempotencyKey), 0);
        }
      }
      database.close();
      database = null;

      const capture = await retryLifecycleBusy(
        workers[0],
        initial[0],
        "capture_after_busy"
      );
      const expiry = await retryLifecycleBusy(
        workers[1],
        initial[1],
        "expiry_after_busy"
      );
      assert.equal(capture.inTransaction, false);
      assert.equal(expiry.inTransaction, false);
      assert.equal(expiry.error, undefined);
      assertExactPublicResult(expiry.value, {
        ok: true,
        replayed: false,
        operationRef: expiry.value.operationRef,
        walletRef: subject.walletRef,
        safeResultCode: "expired",
        resultRef: subject.holdRef,
        previousWalletVersion: 2,
        resultingWalletVersion: 3,
        resultingWalletStatus: "active"
      });
      const captureProducedReceipt = capture.error === undefined;
      if (captureProducedReceipt) {
        assertExactPublicResult(capture.value, {
          ok: false,
          replayed: false,
          operationRef: capture.value.operationRef,
          walletRef: subject.walletRef,
          safeResultCode: "hold_expired",
          resultRef: null,
          previousWalletVersion: 2,
          resultingWalletVersion: 2,
          resultingWalletStatus: "active"
        });
        const captureReplay = await sendCommand(
          workers[0],
          { type: "hold", commandId: "capture_failed_replay" },
          "result"
        );
        assert.equal(captureReplay.error, undefined);
        assert.equal(captureReplay.inTransaction, false);
        assertExactPublicResult(captureReplay.value, {
          ...capture.value,
          replayed: true
        });
      } else {
        assert.deepEqual(capture.error, {
          code: "coin_hold_not_active",
          message: "Coin wallet store operation rejected"
        });
      }
      const expiryReplay = await sendCommand(
        workers[1],
        { type: "hold", commandId: "expiry_replay" },
        "result"
      );
      assert.equal(expiryReplay.error, undefined);
      assert.equal(expiryReplay.inTransaction, false);
      assertExactPublicResult(expiryReplay.value, {
        ...expiry.value,
        replayed: true
      });

      database = new Database(dbPath, { readonly: true });
      const snapshot = completeSnapshot(database);
      assert.equal(snapshot.platform_coin_wallets[0].version, 3);
      assert.equal(snapshot.platform_coin_holds[0].status, "expired");
      assert.equal(snapshot.platform_coin_lots[0].held_units, 0);
      assert.equal(snapshot.platform_coin_lots[0].available_units, 10);
      assert.equal(snapshot.platform_coin_lots[0].consumed_units, 0);
      assert.equal(snapshot.platform_coin_ledger_entries.filter(
        ({ operation }) => operation === "held_to_available"
      ).length, 1);
      assert.equal(snapshot.platform_coin_ledger_entries.filter(
        ({ operation }) => operation === "held_to_consumed"
      ).length, 0);
      assert.equal(snapshot.platform_coin_operation_receipts.filter(
        ({ status }) => status === "started"
      ).length, 0);
      const captureReceipts =
        snapshot.platform_coin_operation_receipts.filter(
          ({ operation_type, idempotency_key }) => (
            operation_type === "capture_coin_hold"
            && idempotency_key === "capture_lifecycle_race"
          )
        );
      if (captureProducedReceipt) {
        assert.equal(captureReceipts.length, 1);
        const [captureReceipt] = captureReceipts;
        assert.deepEqual({
          operationRef: captureReceipt.operation_ref,
          walletRef: captureReceipt.wallet_ref,
          actorScope: captureReceipt.actor_scope,
          operationType: captureReceipt.operation_type,
          idempotencyKey: captureReceipt.idempotency_key,
          status: captureReceipt.status,
          resultRef: captureReceipt.result_ref,
          safeResultCode: captureReceipt.safe_result_code,
          previous: captureReceipt.previous_wallet_version,
          resulting: captureReceipt.resulting_wallet_version,
          resultingStatus: captureReceipt.resulting_wallet_status
        }, {
          operationRef: capture.value.operationRef,
          walletRef: subject.walletRef,
          actorScope: "account:account_lifecycle",
          operationType: "capture_coin_hold",
          idempotencyKey: "capture_lifecycle_race",
          status: "failed",
          resultRef: null,
          safeResultCode: "hold_expired",
          previous: 2,
          resulting: 2,
          resultingStatus: "active"
        });
        assert.equal(snapshot.platform_coin_ledger_entries.filter(
          ({ operation_ref }) => (
            operation_ref === capture.value.operationRef
          )
        ).length, 0);
      } else {
        assert.equal(captureReceipts.length, 0);
      }
      const expiryReceipt = snapshot.platform_coin_operation_receipts.find(
        ({ operation_ref }) => operation_ref === expiry.value.operationRef
      );
      assert.deepEqual({
        walletRef: expiryReceipt.wallet_ref,
        actorScope: expiryReceipt.actor_scope,
        operationType: expiryReceipt.operation_type,
        idempotencyKey: expiryReceipt.idempotency_key,
        status: expiryReceipt.status,
        resultRef: expiryReceipt.result_ref,
        safeResultCode: expiryReceipt.safe_result_code,
        previous: expiryReceipt.previous_wallet_version,
        resulting: expiryReceipt.resulting_wallet_version,
        resultingStatus: expiryReceipt.resulting_wallet_status
      }, {
        walletRef: subject.walletRef,
        actorScope: "system:coin-wallet-expiry",
        operationType: "expire_coin_hold",
        idempotencyKey:
          `hold-expiry:${subject.holdRef}:2000-01-01T00:00:00.000Z`,
        status: "succeeded",
        resultRef: subject.holdRef,
        safeResultCode: "expired",
        previous: 2,
        resulting: 3,
        resultingStatus: "active"
      });
      const expiryLedgers = snapshot.platform_coin_ledger_entries.filter(
        ({ operation_ref }) => operation_ref === expiry.value.operationRef
      );
      assert.equal(expiryLedgers.length, 1);
      const [expiryLedger] = expiryLedgers;
      assert.deepEqual({
        operation: expiryLedger.operation,
        walletRef: expiryLedger.wallet_ref,
        lotRef: expiryLedger.lot_ref,
        amountUnits: expiryLedger.amount_units,
        holdRef: expiryLedger.hold_ref,
        orderRef: expiryLedger.order_ref,
        sourceType: expiryLedger.source_type,
        sourceRef: expiryLedger.source_ref,
        actorType: expiryLedger.actor_type,
        actorRef: expiryLedger.actor_ref,
        previous: expiryLedger.previous_wallet_version,
        resulting: expiryLedger.resulting_wallet_version,
        resultingStatus: expiryLedger.resulting_wallet_status
      }, {
        operation: "held_to_available",
        walletRef: subject.walletRef,
        lotRef: subject.lotRef,
        amountUnits: 10,
        holdRef: subject.holdRef,
        orderRef: "order_lifecycle",
        sourceType: "synthetic_seed",
        sourceRef: "source_lifecycle",
        actorType: "system",
        actorRef: "coin_wallet_expiry_worker",
        previous: 2,
        resulting: 3,
        resultingStatus: "active"
      });
    } finally {
      const view = new Int32Array(barrier);
      Atomics.store(view, 1, 1);
      Atomics.store(view, 0, 1);
      Atomics.notify(view, 0, workers.length);
      try {
        database?.close();
      } finally {
        try {
          await closeWorkers(workers);
        } finally {
          rmSync(directory, {
            recursive: true,
            force: true,
            maxRetries: 3,
            retryDelay: 50
          });
        }
      }
    }
  });

  test("release versus due lot expiry records only one financial transition", async () => {
    const directory = mkdtempSync(join(tmpdir(), "coin-wallet-release-lot-race-"));
    const dbPath = join(directory, "wallet.sqlite");
    const barrier = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
    const workers = [];
    let database;
    try {
      const subject = initializeLifecycleRaceDatabase(dbPath, {
        coinType: "bonus_coins"
      });
      workers.push(newWorker(
        dbPath,
        {
          holdRef: subject.holdRef,
          operation: {
            actorScope: "account:account_lifecycle",
            idempotencyKey: "release_lifecycle_race",
            actorType: "user",
            actorRef: "account_lifecycle"
          }
        },
        barrier,
        "releaseCoinHold"
      ));
      workers.push(newWorker(
        dbPath,
        { lotRef: subject.lotRef },
        barrier,
        "expireCoinLot"
      ));

      const initial = await runBarrierRace(
        workers,
        "release_lot_expiry",
        barrier
      );
      assert.deepEqual(initial.map(({ inTransaction }) => inTransaction), [
        false,
        false
      ]);
      database = new Database(dbPath, { readonly: true });
      for (const [index, operationType, idempotencyKey] of [
        [0, "release_coin_hold", "release_lifecycle_race"],
        [
          1,
          "expire_coin_lot",
          `lot-expiry:${subject.lotRef}:2000-01-01T00:00:00.000Z`
        ]
      ]) {
        if (initial[index].error?.code === "wallet_busy") {
          assert.equal(database.prepare(`
            select count(*) from platform_coin_operation_receipts
             where operation_type = ? and idempotency_key = ?
          `).pluck().get(operationType, idempotencyKey), 0);
        }
      }
      database.close();
      database = null;

      const release = await retryLifecycleBusy(
        workers[0],
        initial[0],
        "release_after_busy"
      );
      const lotExpiry = await retryLifecycleBusy(
        workers[1],
        initial[1],
        "lot_expiry_after_busy"
      );
      assert.equal(release.inTransaction, false);
      assert.equal(lotExpiry.inTransaction, false);
      assert.equal(release.error, undefined);
      assert.equal(lotExpiry.error, undefined);
      assertExactPublicResult(release.value, {
        ok: true,
        replayed: false,
        operationRef: release.value.operationRef,
        walletRef: subject.walletRef,
        safeResultCode: "released",
        resultRef: subject.holdRef,
        previousWalletVersion: 2,
        resultingWalletVersion: 3,
        resultingWalletStatus: "active"
      });
      assertExactPublicResult(lotExpiry.value, {
        ok: true,
        replayed: false,
        operationRef: lotExpiry.value.operationRef,
        walletRef: subject.walletRef,
        safeResultCode: "expiry_processed",
        resultRef: subject.lotRef,
        previousWalletVersion: lotExpiry.value.previousWalletVersion,
        resultingWalletVersion: lotExpiry.value.previousWalletVersion,
        resultingWalletStatus: "active"
      });
      const [releaseReplay, lotExpiryReplay] = await Promise.all([
        sendCommand(
          workers[0],
          { type: "hold", commandId: "release_replay" },
          "result"
        ),
        sendCommand(
          workers[1],
          { type: "hold", commandId: "lot_expiry_replay" },
          "result"
        )
      ]);
      assert.equal(releaseReplay.error, undefined);
      assert.equal(lotExpiryReplay.error, undefined);
      assert.equal(releaseReplay.inTransaction, false);
      assert.equal(lotExpiryReplay.inTransaction, false);
      assertExactPublicResult(releaseReplay.value, {
        ...release.value,
        replayed: true
      });
      assertExactPublicResult(lotExpiryReplay.value, {
        ...lotExpiry.value,
        replayed: true
      });

      database = new Database(dbPath, { readonly: true });
      const snapshot = completeSnapshot(database);
      assert.equal(snapshot.platform_coin_wallets[0].version, 3);
      assert.equal(snapshot.platform_coin_holds[0].status, "released");
      assert.equal(snapshot.platform_coin_lots[0].available_units, 0);
      assert.equal(snapshot.platform_coin_lots[0].held_units, 0);
      assert.equal(snapshot.platform_coin_lots[0].expired_units, 10);
      assert.equal(snapshot.platform_coin_ledger_entries.filter(
        ({ operation }) => operation === "held_to_expired"
      ).length, 1);
      assert.equal(snapshot.platform_coin_ledger_entries.filter(
        ({ operation }) => operation === "available_to_expired"
      ).length, 0);
      assert.equal(snapshot.platform_coin_ledger_entries.filter(
        ({ operation_ref }) => (
          operation_ref === lotExpiry.value.operationRef
        )
      ).length, 0);
      assert.equal(snapshot.platform_coin_operation_receipts.filter(
        ({ operation_type }) => (
          operation_type === "release_coin_hold"
          || operation_type === "expire_coin_lot"
        )
      ).length, 2);
      assert.equal(snapshot.platform_coin_operation_receipts.filter(
        ({ status }) => status === "started"
      ).length, 0);
      const releaseReceipt = snapshot.platform_coin_operation_receipts.find(
        ({ operation_ref }) => operation_ref === release.value.operationRef
      );
      assert.deepEqual({
        walletRef: releaseReceipt.wallet_ref,
        actorScope: releaseReceipt.actor_scope,
        operationType: releaseReceipt.operation_type,
        idempotencyKey: releaseReceipt.idempotency_key,
        status: releaseReceipt.status,
        resultRef: releaseReceipt.result_ref,
        safeResultCode: releaseReceipt.safe_result_code,
        previous: releaseReceipt.previous_wallet_version,
        resulting: releaseReceipt.resulting_wallet_version,
        resultingStatus: releaseReceipt.resulting_wallet_status
      }, {
        walletRef: subject.walletRef,
        actorScope: "account:account_lifecycle",
        operationType: "release_coin_hold",
        idempotencyKey: "release_lifecycle_race",
        status: "succeeded",
        resultRef: subject.holdRef,
        safeResultCode: "released",
        previous: 2,
        resulting: 3,
        resultingStatus: "active"
      });
      const lotExpiryReceipt =
        snapshot.platform_coin_operation_receipts.find(
          ({ operation_ref }) => operation_ref === lotExpiry.value.operationRef
        );
      assert.deepEqual({
        walletRef: lotExpiryReceipt.wallet_ref,
        actorScope: lotExpiryReceipt.actor_scope,
        operationType: lotExpiryReceipt.operation_type,
        idempotencyKey: lotExpiryReceipt.idempotency_key,
        status: lotExpiryReceipt.status,
        resultRef: lotExpiryReceipt.result_ref,
        safeResultCode: lotExpiryReceipt.safe_result_code,
        previous: lotExpiryReceipt.previous_wallet_version,
        resulting: lotExpiryReceipt.resulting_wallet_version,
        resultingStatus: lotExpiryReceipt.resulting_wallet_status
      }, {
        walletRef: subject.walletRef,
        actorScope: "system:coin-wallet-expiry",
        operationType: "expire_coin_lot",
        idempotencyKey:
          `lot-expiry:${subject.lotRef}:2000-01-01T00:00:00.000Z`,
        status: "succeeded",
        resultRef: subject.lotRef,
        safeResultCode: "expiry_processed",
        previous: lotExpiry.value.previousWalletVersion,
        resulting: lotExpiry.value.resultingWalletVersion,
        resultingStatus: "active"
      });
      const releaseLedgers = snapshot.platform_coin_ledger_entries.filter(
        ({ operation_ref }) => operation_ref === release.value.operationRef
      );
      assert.equal(releaseLedgers.length, 1);
      const [releaseLedger] = releaseLedgers;
      assert.deepEqual({
        operation: releaseLedger.operation,
        walletRef: releaseLedger.wallet_ref,
        lotRef: releaseLedger.lot_ref,
        amountUnits: releaseLedger.amount_units,
        holdRef: releaseLedger.hold_ref,
        orderRef: releaseLedger.order_ref,
        sourceType: releaseLedger.source_type,
        sourceRef: releaseLedger.source_ref,
        actorType: releaseLedger.actor_type,
        actorRef: releaseLedger.actor_ref,
        previous: releaseLedger.previous_wallet_version,
        resulting: releaseLedger.resulting_wallet_version,
        resultingStatus: releaseLedger.resulting_wallet_status
      }, {
        operation: "held_to_expired",
        walletRef: subject.walletRef,
        lotRef: subject.lotRef,
        amountUnits: 10,
        holdRef: subject.holdRef,
        orderRef: "order_lifecycle",
        sourceType: "synthetic_seed",
        sourceRef: "source_lifecycle",
        actorType: "user",
        actorRef: "account_lifecycle",
        previous: 2,
        resulting: 3,
        resultingStatus: "active"
      });
    } finally {
      const view = new Int32Array(barrier);
      Atomics.store(view, 1, 1);
      Atomics.store(view, 0, 1);
      Atomics.notify(view, 0, workers.length);
      try {
        database?.close();
      } finally {
        try {
          await closeWorkers(workers);
        } finally {
          rmSync(directory, {
            recursive: true,
            force: true,
            maxRetries: 3,
            retryDelay: 50
          });
        }
      }
    }
  });
}
