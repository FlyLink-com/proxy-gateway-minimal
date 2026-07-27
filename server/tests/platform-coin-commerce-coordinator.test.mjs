import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import {
  createCoinCommerceCoordinator
} from "../services/platform/coin-commerce-coordinator.mjs";
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

const COORDINATOR_ERROR_MESSAGE = "Coin commerce coordinator operation rejected";
const RESTART_CLOCK = "2026-07-27T12:00:00.000Z";
const REQUIRED_STORE_METHODS = [
  "recoverNonTerminalOrders",
  "claimDueCaptures",
  "captureClaimedOrder",
  "claimNextFulfillmentCommand",
  "completeFulfillmentCommand",
  "failFulfillmentCommand",
  "nextWakeAt"
];

function makeStore(log = []) {
  return {
    recoverNonTerminalOrders(input) {
      log.push(["recoverNonTerminalOrders", input]);
      return {
        scanned: 0,
        readyForCapture: 0,
        captureRecovered: 0,
        outboxRecovered: 0,
        expiredHoldReleased: 0,
        expiredLeaseObserved: 0,
        reconciliationRequired: 0,
        unchanged: 0
      };
    },
    claimDueCaptures(input) {
      log.push(["claimDueCaptures", input]);
      return [];
    },
    captureClaimedOrder(input) {
      log.push(["captureClaimedOrder", input]);
      return { paymentStatus: "captured" };
    },
    claimNextFulfillmentCommand(input) {
      log.push(["claimNextFulfillmentCommand", input]);
      return null;
    },
    completeFulfillmentCommand(input) {
      log.push(["completeFulfillmentCommand", input]);
      return { status: "delivered" };
    },
    failFulfillmentCommand(input) {
      log.push(["failFulfillmentCommand", input]);
      return { status: "failed", safeCode: input.safeCode };
    },
    nextWakeAt() {
      log.push(["nextWakeAt"]);
      return null;
    }
  };
}

function makeHandler(overrides = {}) {
  return {
    idempotencyContract: "deduplicate_by_command_ref",
    async execute() {
      return {
        status: "delivered",
        effectRef: "synthetic_effect_order_1"
      };
    },
    ...overrides
  };
}

function expectCoordinatorCode(callback, code) {
  assert.throws(callback, (error) => {
    assert.equal(error?.code, code);
    assert.equal(error?.message, COORDINATOR_ERROR_MESSAGE);
    assert.equal(Object.hasOwn(error, "cause"), false);
    return true;
  });
}

async function expectCoordinatorRejection(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error?.code, code);
    assert.equal(error?.message, COORDINATOR_ERROR_MESSAGE);
    assert.equal(Object.hasOwn(error, "cause"), false);
    return true;
  });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function makeScheduler(log = []) {
  let nextId = 1;
  const tasks = [];
  const active = new Set();
  return {
    tasks,
    active,
    scheduleFn(callback, delay) {
      const task = {
        id: nextId,
        callback,
        delay,
        cleared: false
      };
      nextId += 1;
      tasks.push(task);
      active.add(task);
      log.push(["schedule", delay]);
      return task;
    },
    clearScheduleFn(task) {
      task.cleared = true;
      active.delete(task);
      log.push(["clear", task.id]);
    },
    async fire(task, { includeCleared = false } = {}) {
      if (task.cleared && !includeCleared) return;
      active.delete(task);
      task.callback();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    }
  };
}

function planDelivery() {
  return {
    kind: "subscription_plan",
    durationDays: 30,
    monthlyTrafficGb: 50,
    trafficGb: null,
    neverExpires: false,
    discountBasisPoints: 500
  };
}

function commandFixture({
  commandRef = "coincmd_order_1",
  orderRef = "order_1",
  accountId = "account_1",
  leaseGeneration = 1,
  leaseToken = "a".repeat(64)
} = {}) {
  return {
    commandRef,
    orderRef,
    accountId,
    delivery: planDelivery(),
    leaseGeneration,
    leaseToken
  };
}

function fixedCoordinatorClockDatabase(database, clock) {
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

function createCoordinatorSchema(dbPath) {
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
    nowFn: () => new Date(RESTART_CLOCK)
  });
  applyCoinCommerceMigrations({
    database,
    expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(RESTART_CLOCK)
  });
  database.prepare(`
    insert into platform_accounts (
      id, owner_ref, status, created_at, updated_at, metadata_json
    ) values (
      'acct_restart_1', 'owner_restart_1', 'active', ?, ?, '{}'
    )
  `).run(RESTART_CLOCK, RESTART_CLOCK);
  return database;
}

function restartOffer() {
  return {
    offerRef: "offer_restart_plan",
    offerVersionRef: "offerv_restart_plan_v1",
    version: 1,
    category: "plan",
    title: { zh: "重启月卡", en: "Restart plan" },
    summary: { zh: "重启验证", en: "Restart validation" },
    importantNotices: {
      zh: ["仅用于合成测试"],
      en: ["Synthetic test only"]
    },
    baseCoinUnits: 20,
    referencePrice: { currency: "CNY", amountMinor: 2_000 },
    acceptedCoinTypes: ["paid_coins"],
    delivery: planDelivery()
  };
}

function seedCapturedRestartOrder(store, clock) {
  store.walletStore.creditCoins({
    accountId: "acct_restart_1",
    coinType: "paid_coins",
    amountUnits: 20,
    availability: "available",
    sourceType: "synthetic_seed",
    sourceRef: "source_restart_paid",
    sourceDigest: "d".repeat(64),
    policyRef: null,
    policyVersion: null,
    expiresAt: null,
    operation: {
      actorScope: "system:coordinator_restart_test",
      idempotencyKey: "credit_restart_paid",
      actorType: "system",
      actorRef: "coordinator_restart_test"
    }
  });
  store.publishOfferVersion(restartOffer());
  const quote = store.createCheckoutQuote({
    accountId: "acct_restart_1",
    offerRef: "offer_restart_plan"
  });
  const order = store.confirmOrder({
    accountId: "acct_restart_1",
    quoteRef: quote.quoteRef,
    operation: {
      actorScope: "portal:acct_restart_1",
      idempotencyKey: "confirm_restart_order",
      actorType: "portal_user",
      actorRef: "acct_restart_1"
    }
  });
  clock.value = order.cancelUntil;
  store.claimDueCaptures({ limit: 1 });
  store.captureClaimedOrder({ orderRef: order.orderRef });
  return order;
}

test("coordinator exposes a frozen lifecycle surface", () => {
  const log = [];
  const coordinator = createCoinCommerceCoordinator({
    store: makeStore(log),
    fulfillmentHandler: makeHandler()
  });

  assert.deepEqual(Reflect.ownKeys(coordinator), ["start", "runOnce", "stop"]);
  assert.equal(Object.isFrozen(coordinator), true);
  for (const method of Reflect.ownKeys(coordinator)) {
    const descriptor = Object.getOwnPropertyDescriptor(coordinator, method);
    assert.equal(descriptor?.enumerable, true);
    assert.equal(typeof descriptor?.value, "function");
  }
  assert.deepEqual(log, []);
});

test("coordinator snapshots every required Store method as an own data function", () => {
  for (const method of REQUIRED_STORE_METHODS) {
    const missingStore = makeStore();
    delete missingStore[method];
    expectCoordinatorCode(() => createCoinCommerceCoordinator({
      store: missingStore,
      fulfillmentHandler: makeHandler()
    }), "coin_commerce_coordinator_invalid");

    let getterCalls = 0;
    const getterStore = makeStore();
    Object.defineProperty(getterStore, method, {
      enumerable: true,
      configurable: true,
      get() {
        getterCalls += 1;
        return () => {};
      }
    });
    expectCoordinatorCode(() => createCoinCommerceCoordinator({
      store: getterStore,
      fulfillmentHandler: makeHandler()
    }), "coin_commerce_coordinator_invalid");
    assert.equal(getterCalls, 0);

    const nonFunctionStore = makeStore();
    nonFunctionStore[method] = null;
    expectCoordinatorCode(() => createCoinCommerceCoordinator({
      store: nonFunctionStore,
      fulfillmentHandler: makeHandler()
    }), "coin_commerce_coordinator_invalid");
  }

  const storeWithAdditionalMethod = makeStore();
  storeWithAdditionalMethod.close = () => {};
  const coordinator = createCoinCommerceCoordinator({
    store: storeWithAdditionalMethod,
    fulfillmentHandler: makeHandler()
  });
  assert.equal(typeof coordinator.runOnce, "function");
});

test("coordinator rejects invalid batch and lease bounds before Store use", () => {
  const invalidOptions = [
    ["captureBatchSize", 0],
    ["captureBatchSize", 101],
    ["captureBatchSize", 1.5],
    ["captureBatchSize", Number.MAX_SAFE_INTEGER + 1],
    ["captureBatchSize", null],
    ["captureBatchSize", undefined],
    ["commandLeaseMs", 0],
    ["commandLeaseMs", 86_400_001],
    ["commandLeaseMs", 1.5],
    ["commandLeaseMs", Number.MAX_SAFE_INTEGER + 1],
    ["commandLeaseMs", null],
    ["commandLeaseMs", undefined]
  ];

  for (const [field, value] of invalidOptions) {
    const log = [];
    expectCoordinatorCode(() => createCoinCommerceCoordinator({
      store: makeStore(log),
      fulfillmentHandler: makeHandler(),
      [field]: value
    }), "coin_commerce_coordinator_invalid");
    assert.deepEqual(log, []);
  }
});

test("coordinator requires the exact fulfillment idempotency declaration", () => {
  const invalidHandlers = [
    {},
    { execute: async () => ({ status: "delivered", effectRef: "effect_one" }) },
    {
      idempotencyContract: "deduplicate_by_order_ref",
      execute: async () => ({ status: "delivered", effectRef: "effect_one" })
    },
    {
      idempotencyContract: "deduplicate_by_command_ref",
      execute: null
    },
    {
      idempotencyContract: "deduplicate_by_command_ref",
      execute: async () => ({ status: "delivered", effectRef: "effect_one" }),
      extra: true
    }
  ];

  for (const fulfillmentHandler of invalidHandlers) {
    expectCoordinatorCode(() => createCoinCommerceCoordinator({
      store: makeStore(),
      fulfillmentHandler
    }), "coin_commerce_coordinator_invalid");
  }
});

test("coordinator rejects handler getters, symbols, non-enumerable fields, and prototypes", () => {
  let getterCalls = 0;
  const getterHandler = {
    idempotencyContract: "deduplicate_by_command_ref"
  };
  Object.defineProperty(getterHandler, "execute", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return async () => ({ status: "delivered", effectRef: "effect_one" });
    }
  });
  expectCoordinatorCode(() => createCoinCommerceCoordinator({
    store: makeStore(),
    fulfillmentHandler: getterHandler
  }), "coin_commerce_coordinator_invalid");
  assert.equal(getterCalls, 0);

  const symbolHandler = makeHandler();
  symbolHandler[Symbol("hidden")] = true;
  expectCoordinatorCode(() => createCoinCommerceCoordinator({
    store: makeStore(),
    fulfillmentHandler: symbolHandler
  }), "coin_commerce_coordinator_invalid");

  const nonEnumerableHandler = {
    idempotencyContract: "deduplicate_by_command_ref"
  };
  Object.defineProperty(nonEnumerableHandler, "execute", {
    enumerable: false,
    value: async () => ({ status: "delivered", effectRef: "effect_one" })
  });
  expectCoordinatorCode(() => createCoinCommerceCoordinator({
    store: makeStore(),
    fulfillmentHandler: nonEnumerableHandler
  }), "coin_commerce_coordinator_invalid");

  const prototypeHandler = Object.create({ inherited: true });
  prototypeHandler.idempotencyContract = "deduplicate_by_command_ref";
  prototypeHandler.execute = async () => ({
    status: "delivered",
    effectRef: "effect_one"
  });
  expectCoordinatorCode(() => createCoinCommerceCoordinator({
    store: makeStore(),
    fulfillmentHandler: prototypeHandler
  }), "coin_commerce_coordinator_invalid");
});

test("coordinator rejects unsafe option descriptors and never executes option getters", () => {
  const base = {
    store: makeStore(),
    fulfillmentHandler: makeHandler()
  };

  for (const invalid of [
    { ...base, extra: true },
    Object.assign({ ...base }, { [Symbol("hidden")]: true }),
    Object.assign(Object.create({ inherited: true }), base)
  ]) {
    expectCoordinatorCode(() => createCoinCommerceCoordinator(invalid),
      "coin_commerce_coordinator_invalid");
  }

  let getterCalls = 0;
  const accessorOptions = { ...base };
  Object.defineProperty(accessorOptions, "captureBatchSize", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 25;
    }
  });
  expectCoordinatorCode(() => createCoinCommerceCoordinator(accessorOptions),
    "coin_commerce_coordinator_invalid");
  assert.equal(getterCalls, 0);

  const nonEnumerableOptions = { ...base };
  Object.defineProperty(nonEnumerableOptions, "captureBatchSize", {
    enumerable: false,
    value: 25
  });
  expectCoordinatorCode(() => createCoinCommerceCoordinator(nonEnumerableOptions),
    "coin_commerce_coordinator_invalid");
});

test("coordinator validates scheduler and clock functions before Store use", () => {
  for (const [field, value] of [
    ["scheduleFn", null],
    ["clearScheduleFn", "clear"],
    ["nowFn", {}]
  ]) {
    const log = [];
    expectCoordinatorCode(() => createCoinCommerceCoordinator({
      store: makeStore(log),
      fulfillmentHandler: makeHandler(),
      [field]: value
    }), "coin_commerce_coordinator_invalid");
    assert.deepEqual(log, []);
  }
});

test("start runs one ordered pass before scheduling and is idempotent while running", async () => {
  const log = [];
  const scheduler = makeScheduler(log);
  const store = makeStore(log);
  const coordinator = createCoinCommerceCoordinator({
    store,
    fulfillmentHandler: makeHandler(),
    scheduleFn: scheduler.scheduleFn,
    clearScheduleFn: scheduler.clearScheduleFn,
    nowFn: () => new Date("2026-07-27T00:00:00.000Z")
  });

  const firstStart = coordinator.start();
  assert.deepEqual(log, [
    ["recoverNonTerminalOrders", { limit: 25 }],
    ["claimDueCaptures", { limit: 25 }],
    ["claimNextFulfillmentCommand", { leaseMs: 30_000 }]
  ]);
  assert.equal(coordinator.start(), firstStart);

  const summary = await firstStart;
  assert.deepEqual(log.slice(-2), [
    ["nextWakeAt"],
    ["schedule", 1000]
  ]);
  assert.equal(Object.isFrozen(summary), true);
  assert.equal(scheduler.active.size, 1);
  await coordinator.stop();
});

test("started scheduling clamps past, future, far-future, and null wakes", async () => {
  const cases = [
    ["2026-07-26T23:59:59.999Z", 0],
    ["2026-07-27T00:00:00.250Z", 250],
    ["2026-07-27T00:01:00.000Z", 1000],
    [null, 1000]
  ];

  for (const [nextWakeAt, expectedDelay] of cases) {
    const scheduler = makeScheduler();
    const store = makeStore();
    store.nextWakeAt = () => nextWakeAt;
    const coordinator = createCoinCommerceCoordinator({
      store,
      fulfillmentHandler: makeHandler(),
      scheduleFn: scheduler.scheduleFn,
      clearScheduleFn: scheduler.clearScheduleFn,
      nowFn: () => new Date("2026-07-27T00:00:00.000Z")
    });

    await coordinator.start();
    assert.equal(scheduler.tasks.length, 1);
    assert.equal(scheduler.tasks[0].delay, expectedDelay);
    await coordinator.stop();
  }
});

test("initial start failure is terminal, leaves no timer, and cannot be restarted", async () => {
  const scheduler = makeScheduler();
  let recoveries = 0;
  const store = makeStore();
  store.recoverNonTerminalOrders = () => {
    recoveries += 1;
    throw new Error("private startup failure");
  };
  const coordinator = createCoinCommerceCoordinator({
    store,
    fulfillmentHandler: makeHandler(),
    scheduleFn: scheduler.scheduleFn,
    clearScheduleFn: scheduler.clearScheduleFn
  });

  await expectCoordinatorRejection(
    coordinator.start(),
    "coin_commerce_coordinator_unavailable"
  );
  assert.equal(recoveries, 1);
  assert.equal(scheduler.active.size, 0);
  assert.equal(scheduler.tasks.length, 0);
  await expectCoordinatorRejection(
    coordinator.start(),
    "coin_commerce_coordinator_stopped"
  );
  await expectCoordinatorRejection(
    coordinator.runOnce(),
    "coin_commerce_coordinator_stopped"
  );
});

test("a failed manual pass after successful start replaces the cleared timer with idle fallback", async () => {
  const scheduler = makeScheduler();
  let recoveries = 0;
  const store = makeStore();
  store.recoverNonTerminalOrders = (input) => {
    recoveries += 1;
    if (recoveries === 2) throw new Error("private manual failure");
    return makeStore().recoverNonTerminalOrders(input);
  };
  const coordinator = createCoinCommerceCoordinator({
    store,
    fulfillmentHandler: makeHandler(),
    scheduleFn: scheduler.scheduleFn,
    clearScheduleFn: scheduler.clearScheduleFn
  });

  await coordinator.start();
  const firstTimer = scheduler.tasks[0];
  await expectCoordinatorRejection(
    coordinator.runOnce(),
    "coin_commerce_coordinator_unavailable"
  );
  assert.equal(firstTimer.cleared, true);
  assert.equal(scheduler.active.size, 1);
  assert.equal(scheduler.tasks.length, 2);
  assert.equal(scheduler.tasks[1].delay, 1000);
  await coordinator.stop();
});

test("manual clear failure rejects generically but installs one fenced idle fallback", async () => {
  const scheduler = makeScheduler();
  let recoveries = 0;
  let clearCalls = 0;
  const store = makeStore();
  store.recoverNonTerminalOrders = (input) => {
    recoveries += 1;
    return makeStore().recoverNonTerminalOrders(input);
  };
  const coordinator = createCoinCommerceCoordinator({
    store,
    fulfillmentHandler: makeHandler(),
    scheduleFn: scheduler.scheduleFn,
    clearScheduleFn(task) {
      clearCalls += 1;
      scheduler.clearScheduleFn(task);
      if (clearCalls === 1) {
        throw new Error("private clear detail");
      }
    }
  });

  await coordinator.start();
  const staleTimer = scheduler.tasks[0];
  await expectCoordinatorRejection(
    coordinator.runOnce(),
    "coin_commerce_coordinator_unavailable"
  );
  assert.equal(recoveries, 1);
  assert.equal(staleTimer.cleared, true);
  assert.equal(scheduler.active.size, 1);
  assert.equal(scheduler.tasks.length, 2);
  assert.equal(scheduler.tasks[1].delay, 1000);

  await scheduler.fire(staleTimer, { includeCleared: true });
  assert.equal(recoveries, 1);
  assert.equal(scheduler.tasks.length, 2);
  await coordinator.stop();
});

test("a failed timer pass is swallowed and rearms only the idle fallback", async () => {
  const scheduler = makeScheduler();
  let recoveries = 0;
  const store = makeStore();
  store.recoverNonTerminalOrders = (input) => {
    recoveries += 1;
    if (recoveries === 2) throw new Error("private timer failure");
    return makeStore().recoverNonTerminalOrders(input);
  };
  const coordinator = createCoinCommerceCoordinator({
    store,
    fulfillmentHandler: makeHandler(),
    scheduleFn: scheduler.scheduleFn,
    clearScheduleFn: scheduler.clearScheduleFn
  });

  await coordinator.start();
  await scheduler.fire(scheduler.tasks[0]);
  assert.equal(recoveries, 2);
  assert.equal(scheduler.active.size, 1);
  assert.equal(scheduler.tasks.length, 2);
  assert.equal(scheduler.tasks[1].delay, 1000);
  await coordinator.stop();
});

test("idle fallback observes work that becomes visible after startup", async () => {
  const log = [];
  const scheduler = makeScheduler(log);
  const store = makeStore(log);
  let visible = false;
  let claimed = false;
  store.claimNextFulfillmentCommand = (input) => {
    log.push(["claimNextFulfillmentCommand", input]);
    if (!visible || claimed) return null;
    claimed = true;
    return commandFixture();
  };
  const coordinator = createCoinCommerceCoordinator({
    store,
    fulfillmentHandler: makeHandler({
      async execute(input) {
        log.push(["execute", input]);
        return {
          status: "delivered",
          effectRef: "synthetic_effect_order_1"
        };
      }
    }),
    scheduleFn: scheduler.scheduleFn,
    clearScheduleFn: scheduler.clearScheduleFn,
    nowFn: () => new Date("2026-07-27T00:00:00.000Z")
  });

  await coordinator.start();
  const idleTick = scheduler.tasks[0];
  assert.equal(idleTick.delay, 1000);
  visible = true;
  await scheduler.fire(idleTick);
  assert.equal(log.some(([operation]) => operation === "execute"), true);
  assert.equal(
    log.filter(([operation]) => operation === "completeFulfillmentCommand").length,
    1
  );
  assert.equal(scheduler.active.size, 1);
  await coordinator.stop();
});

test("concurrent start and runOnce share one in-flight handler pass", async () => {
  const log = [];
  const scheduler = makeScheduler(log);
  const handlerGate = deferred();
  const store = makeStore(log);
  let claimed = false;
  store.claimNextFulfillmentCommand = (input) => {
    log.push(["claimNextFulfillmentCommand", input]);
    if (claimed) return null;
    claimed = true;
    return commandFixture();
  };
  const coordinator = createCoinCommerceCoordinator({
    store,
    fulfillmentHandler: makeHandler({
      execute(input) {
        log.push(["execute", input]);
        return handlerGate.promise;
      }
    }),
    scheduleFn: scheduler.scheduleFn,
    clearScheduleFn: scheduler.clearScheduleFn
  });

  const startPromise = coordinator.start();
  const secondStart = coordinator.start();
  const manualPromise = coordinator.runOnce();
  assert.equal(secondStart, startPromise);
  assert.equal(manualPromise, startPromise);
  assert.equal(
    log.filter(([operation]) => operation === "recoverNonTerminalOrders").length,
    1
  );

  handlerGate.resolve({
    status: "delivered",
    effectRef: "synthetic_effect_order_1"
  });
  await startPromise;
  assert.equal(
    log.filter(([operation]) => operation === "completeFulfillmentCommand").length,
    1
  );
  assert.equal(scheduler.active.size, 1);
  await coordinator.stop();
});

test("start upgrades an idle runOnce in flight and arms the shared pass after settlement", async () => {
  const scheduler = makeScheduler();
  const handlerGate = deferred();
  let claimed = false;
  const store = makeStore();
  store.claimNextFulfillmentCommand = () => {
    if (claimed) return null;
    claimed = true;
    return commandFixture();
  };
  const coordinator = createCoinCommerceCoordinator({
    store,
    fulfillmentHandler: makeHandler({
      execute() {
        return handlerGate.promise;
      }
    }),
    scheduleFn: scheduler.scheduleFn,
    clearScheduleFn: scheduler.clearScheduleFn
  });

  const manualPass = coordinator.runOnce();
  const startPass = coordinator.start();
  assert.equal(startPass, manualPass);
  handlerGate.resolve({
    status: "delivered",
    effectRef: "synthetic_effect_order_1"
  });
  await manualPass;
  assert.equal(scheduler.active.size, 1);
  assert.equal(scheduler.tasks.length, 1);
  assert.equal(scheduler.tasks[0].delay, 1000);
  await coordinator.stop();
});

test("manual run replaces the pending timer and fences its retained callback", async () => {
  const log = [];
  const scheduler = makeScheduler(log);
  const coordinator = createCoinCommerceCoordinator({
    store: makeStore(log),
    fulfillmentHandler: makeHandler(),
    scheduleFn: scheduler.scheduleFn,
    clearScheduleFn: scheduler.clearScheduleFn
  });

  await coordinator.start();
  const staleTimer = scheduler.tasks[0];
  const recoveriesBeforeManual = log.filter(
    ([operation]) => operation === "recoverNonTerminalOrders"
  ).length;
  await coordinator.runOnce();
  assert.equal(staleTimer.cleared, true);
  assert.equal(scheduler.active.size, 1);
  assert.equal(scheduler.tasks.length, 2);
  assert.equal(
    log.filter(([operation]) => operation === "recoverNonTerminalOrders").length,
    recoveriesBeforeManual + 1
  );

  const operationsBeforeStaleFire = log.length;
  await scheduler.fire(staleTimer, { includeCleared: true });
  assert.equal(log.length, operationsBeforeStaleFire);
  assert.equal(scheduler.tasks.length, 2);
  await coordinator.stop();
});

test("stop during a handler waits for finalization, prevents another claim, and never rearms", async () => {
  const log = [];
  const scheduler = makeScheduler(log);
  const handlerGate = deferred();
  const commands = [
    commandFixture(),
    commandFixture({
      commandRef: "coincmd_order_2",
      orderRef: "order_2",
      leaseGeneration: 1,
      leaseToken: "b".repeat(64)
    })
  ];
  const store = makeStore(log);
  store.claimNextFulfillmentCommand = (input) => {
    log.push(["claimNextFulfillmentCommand", input]);
    return commands.shift() ?? null;
  };
  const coordinator = createCoinCommerceCoordinator({
    store,
    fulfillmentHandler: makeHandler({
      execute(input) {
        log.push(["execute", input]);
        return handlerGate.promise;
      }
    }),
    scheduleFn: scheduler.scheduleFn,
    clearScheduleFn: scheduler.clearScheduleFn
  });

  const pass = coordinator.start();
  let stopSettled = false;
  const stopping = coordinator.stop().then(() => {
    stopSettled = true;
  });
  await Promise.resolve();
  assert.equal(stopSettled, false);

  handlerGate.resolve({
    status: "delivered",
    effectRef: "synthetic_effect_order_1"
  });
  await pass;
  await stopping;
  assert.equal(
    log.filter(([operation]) => operation === "claimNextFulfillmentCommand").length,
    1
  );
  assert.equal(
    log.filter(([operation]) => operation === "completeFulfillmentCommand").length,
    1
  );
  assert.equal(scheduler.active.size, 0);
  assert.equal(scheduler.tasks.length, 0);
  await expectCoordinatorRejection(
    coordinator.start(),
    "coin_commerce_coordinator_stopped"
  );
  await expectCoordinatorRejection(
    coordinator.runOnce(),
    "coin_commerce_coordinator_stopped"
  );
});

test("stop before start is terminal and repeated stop is idempotent", async () => {
  const log = [];
  const scheduler = makeScheduler(log);
  const coordinator = createCoinCommerceCoordinator({
    store: makeStore(log),
    fulfillmentHandler: makeHandler(),
    scheduleFn: scheduler.scheduleFn,
    clearScheduleFn: scheduler.clearScheduleFn
  });

  await Promise.all([coordinator.stop(), coordinator.stop()]);
  assert.deepEqual(log, []);
  assert.equal(scheduler.tasks.length, 0);
  await expectCoordinatorRejection(
    coordinator.start(),
    "coin_commerce_coordinator_stopped"
  );
  await expectCoordinatorRejection(
    coordinator.runOnce(),
    "coin_commerce_coordinator_stopped"
  );
});

test("one pass preserves Store order, contains capture failures, and bounds both batches", async () => {
  const log = [];
  const store = makeStore(log);
  store.claimDueCaptures = (input) => {
    log.push(["claimDueCaptures", input]);
    return [{ orderRef: "order_1" }, { orderRef: "order_2" }];
  };
  store.captureClaimedOrder = (input) => {
    log.push(["captureClaimedOrder", input]);
    if (input.orderRef === "order_1") throw new Error("capture detail");
    return { paymentStatus: "captured" };
  };
  let commandSequence = 0;
  store.claimNextFulfillmentCommand = (input) => {
    log.push(["claimNextFulfillmentCommand", input]);
    commandSequence += 1;
    return commandFixture({
      commandRef: `coincmd_order_${commandSequence}`,
      orderRef: `order_${commandSequence}`,
      leaseToken: String(commandSequence).repeat(64)
    });
  };
  const coordinator = createCoinCommerceCoordinator({
    store,
    fulfillmentHandler: makeHandler({
      async execute(input) {
        log.push(["execute", input]);
        assert.deepEqual(Reflect.ownKeys(input), [
          "commandRef",
          "orderRef",
          "accountId",
          "delivery"
        ]);
        assert.equal(Object.hasOwn(input, "leaseGeneration"), false);
        assert.equal(Object.hasOwn(input, "leaseToken"), false);
        return {
          status: "delivered",
          effectRef: `effect_${input.orderRef}`
        };
      }
    }),
    captureBatchSize: 2,
    commandLeaseMs: 4567
  });

  const summary = await coordinator.runOnce();
  assert.deepEqual(summary, {
    recoveryPasses: 1,
    capturesClaimed: 2,
    capturesProcessed: 1,
    capturesDeferred: 1,
    commandsClaimed: 2,
    commandsDelivered: 2,
    commandsFailed: 0,
    commandsDeferred: 0
  });
  assert.deepEqual(Reflect.ownKeys(summary), [
    "recoveryPasses",
    "capturesClaimed",
    "capturesProcessed",
    "capturesDeferred",
    "commandsClaimed",
    "commandsDelivered",
    "commandsFailed",
    "commandsDeferred"
  ]);
  assert.equal(Object.isFrozen(summary), true);
  assert.equal(
    log.filter(([operation]) => operation === "claimNextFulfillmentCommand").length,
    2
  );
  assert.deepEqual(log.slice(0, 4), [
    ["recoverNonTerminalOrders", { limit: 2 }],
    ["claimDueCaptures", { limit: 2 }],
    ["captureClaimedOrder", { orderRef: "order_1" }],
    ["captureClaimedOrder", { orderRef: "order_2" }]
  ]);
  assert.deepEqual(
    log.filter(([operation]) => operation === "completeFulfillmentCommand")
      .map(([, input]) => input),
    [
      {
        commandRef: "coincmd_order_1",
        leaseGeneration: 1,
        leaseToken: "1".repeat(64),
        effectRef: "effect_order_1",
        status: "delivered"
      },
      {
        commandRef: "coincmd_order_2",
        leaseGeneration: 1,
        leaseToken: "2".repeat(64),
        effectRef: "effect_order_2",
        status: "delivered"
      }
    ]
  );
});

test("capture summary reports processing without claiming a captured business outcome", async () => {
  const store = makeStore();
  store.claimDueCaptures = () => [{ orderRef: "order_1" }];
  store.captureClaimedOrder = () => ({
    paymentStatus: "reconciliation_required"
  });
  const coordinator = createCoinCommerceCoordinator({
    store,
    fulfillmentHandler: makeHandler()
  });

  const summary = await coordinator.runOnce();
  assert.equal(summary.capturesClaimed, 1);
  assert.equal(summary.capturesProcessed, 1);
  assert.equal(summary.capturesDeferred, 0);
  assert.equal(Object.hasOwn(summary, "capturesCompleted"), false);
});

test("capture claim list is plain, exact, and cannot exceed the requested bound", async () => {
  const invalidClaims = [
    [
      { orderRef: "order_1" },
      { orderRef: "order_2" },
      { orderRef: "order_3" }
    ],
    Object.assign([{ orderRef: "order_1" }], { extra: true }),
    [Object.assign({ orderRef: "order_1" }, { extra: true })]
  ];

  let getterCalls = 0;
  const getterRow = {};
  Object.defineProperty(getterRow, "orderRef", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "order_1";
    }
  });
  invalidClaims.push([getterRow]);

  for (const claims of invalidClaims) {
    const log = [];
    const store = makeStore(log);
    store.claimDueCaptures = () => claims;
    const coordinator = createCoinCommerceCoordinator({
      store,
      fulfillmentHandler: makeHandler(),
      captureBatchSize: 2
    });
    await expectCoordinatorRejection(
      coordinator.runOnce(),
      "coin_commerce_coordinator_unavailable"
    );
    assert.equal(
      log.filter(([operation]) => operation === "captureClaimedOrder").length,
      0
    );
  }
  assert.equal(getterCalls, 0);
});

test("claimed command DTOs are validated before handler or finalizer use", async () => {
  let getterCalls = 0;
  const accessorCommand = commandFixture();
  Object.defineProperty(accessorCommand, "orderRef", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "order_1";
    }
  });
  const symbolCommand = commandFixture();
  symbolCommand[Symbol("hidden")] = true;
  const prototypeCommand = Object.assign(
    Object.create({ inherited: true }),
    commandFixture()
  );
  const invalidCommands = [
    { ...commandFixture(), extra: true },
    accessorCommand,
    symbolCommand,
    prototypeCommand,
    { ...commandFixture(), orderRef: " Order_1 " },
    { ...commandFixture(), leaseGeneration: 0 },
    { ...commandFixture(), leaseToken: "A".repeat(64) },
    {
      ...commandFixture(),
      delivery: { ...planDelivery(), extra: true }
    }
  ];

  for (const invalidCommand of invalidCommands) {
    let claims = 0;
    let handlerCalls = 0;
    let finalizerCalls = 0;
    const store = makeStore();
    store.claimNextFulfillmentCommand = () => {
      claims += 1;
      return invalidCommand;
    };
    store.completeFulfillmentCommand = () => {
      finalizerCalls += 1;
    };
    store.failFulfillmentCommand = () => {
      finalizerCalls += 1;
    };
    const coordinator = createCoinCommerceCoordinator({
      store,
      fulfillmentHandler: makeHandler({
        async execute() {
          handlerCalls += 1;
          return {
            status: "delivered",
            effectRef: "synthetic_effect_order_1"
          };
        }
      })
    });
    await expectCoordinatorRejection(
      coordinator.runOnce(),
      "coin_commerce_coordinator_unavailable"
    );
    assert.equal(claims, 1);
    assert.equal(handlerCalls, 0);
    assert.equal(finalizerCalls, 0);
  }
  assert.equal(getterCalls, 0);
});

test("handler throws and invalid results map to fixed safe failure codes and later commands continue", async () => {
  const commands = [
    commandFixture(),
    commandFixture({
      commandRef: "coincmd_order_2",
      orderRef: "order_2",
      leaseToken: "b".repeat(64)
    }),
    commandFixture({
      commandRef: "coincmd_order_3",
      orderRef: "order_3",
      leaseToken: "c".repeat(64)
    })
  ];
  const log = [];
  const store = makeStore(log);
  store.claimNextFulfillmentCommand = (input) => {
    log.push(["claimNextFulfillmentCommand", input]);
    return commands.shift() ?? null;
  };
  const coordinator = createCoinCommerceCoordinator({
    store,
    fulfillmentHandler: makeHandler({
      async execute(input) {
        log.push(["execute", input]);
        if (input.commandRef === "coincmd_order_1") {
          throw new Error("private handler detail");
        }
        if (input.commandRef === "coincmd_order_2") {
          return {
            status: "delivered",
            effectRef: "effect_order_2",
            extra: "not allowed"
          };
        }
        return {
          status: "delivered",
          effectRef: "effect_order_3"
        };
      }
    }),
    captureBatchSize: 3
  });

  const summary = await coordinator.runOnce();
  assert.deepEqual(
    log.filter(([operation]) => operation === "failFulfillmentCommand")
      .map(([, input]) => input.safeCode),
    ["fulfillment_handler_failed", "fulfillment_result_invalid"]
  );
  assert.equal(
    log.filter(([operation]) => operation === "completeFulfillmentCommand").length,
    1
  );
  assert.equal(summary.commandsClaimed, 3);
  assert.equal(summary.commandsFailed, 2);
  assert.equal(summary.commandsDelivered, 1);
  assert.equal(summary.commandsDeferred, 0);
});

test("all malformed handler result shapes fail closed without executing getters", async () => {
  let getterCalls = 0;
  const accessorResult = { status: "delivered" };
  Object.defineProperty(accessorResult, "effectRef", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "effect_order_1";
    }
  });
  const symbolResult = {
    status: "delivered",
    effectRef: "effect_order_1"
  };
  symbolResult[Symbol("hidden")] = true;
  const prototypeResult = Object.assign(
    Object.create({ inherited: true }),
    { status: "delivered", effectRef: "effect_order_1" }
  );
  const nonEnumerableEffectResult = { status: "delivered" };
  Object.defineProperty(nonEnumerableEffectResult, "effectRef", {
    enumerable: false,
    value: "effect_order_1"
  });
  const nonEnumerableStatusResult = { effectRef: "effect_order_1" };
  Object.defineProperty(nonEnumerableStatusResult, "status", {
    enumerable: false,
    value: "delivered"
  });
  const invalidResults = [
    null,
    {},
    { status: "unknown", effectRef: "effect_order_1" },
    { status: "delivered" },
    { status: "delivered", effectRef: " Effect " },
    { status: "delivered", effectRef: "effect_order_1", extra: true },
    accessorResult,
    symbolResult,
    prototypeResult,
    nonEnumerableEffectResult,
    nonEnumerableStatusResult
  ];

  for (const result of invalidResults) {
    const failures = [];
    let claimed = false;
    const store = makeStore();
    store.claimNextFulfillmentCommand = () => {
      if (claimed) return null;
      claimed = true;
      return commandFixture();
    };
    store.failFulfillmentCommand = (input) => {
      failures.push(input);
      return { status: "failed", safeCode: input.safeCode };
    };
    const coordinator = createCoinCommerceCoordinator({
      store,
      fulfillmentHandler: makeHandler({
        async execute() {
          return result;
        }
      })
    });

    const summary = await coordinator.runOnce();
    assert.equal(failures.length, 1);
    assert.equal(failures[0].safeCode, "fulfillment_result_invalid");
    assert.equal(summary.commandsFailed, 1);
  }
  assert.equal(getterCalls, 0);
});

test("failure-writer errors leave the lease deferred and do not stop later commands", async () => {
  const commands = [
    commandFixture(),
    commandFixture({
      commandRef: "coincmd_order_2",
      orderRef: "order_2",
      leaseToken: "b".repeat(64)
    })
  ];
  const store = makeStore();
  store.claimNextFulfillmentCommand = () => commands.shift() ?? null;
  let failureWrites = 0;
  store.failFulfillmentCommand = () => {
    failureWrites += 1;
    throw new Error("private write detail");
  };
  const coordinator = createCoinCommerceCoordinator({
    store,
    fulfillmentHandler: makeHandler({
      async execute(input) {
        if (input.commandRef === "coincmd_order_1") {
          throw new Error("private handler detail");
        }
        return {
          status: "delivered",
          effectRef: "effect_order_2"
        };
      }
    }),
    captureBatchSize: 2
  });

  const summary = await coordinator.runOnce();
  assert.equal(failureWrites, 1);
  assert.equal(summary.commandsDeferred, 1);
  assert.equal(summary.commandsDelivered, 1);
  assert.equal(summary.commandsFailed, 0);
});

test("a completion write error after handler success never rewrites the effect as failed", async () => {
  const commands = [
    commandFixture(),
    commandFixture({
      commandRef: "coincmd_order_2",
      orderRef: "order_2",
      leaseToken: "b".repeat(64)
    })
  ];
  const effects = [];
  const completions = [];
  const failures = [];
  const store = makeStore();
  store.claimNextFulfillmentCommand = () => commands.shift() ?? null;
  store.completeFulfillmentCommand = (input) => {
    completions.push(input.commandRef);
    if (input.commandRef === "coincmd_order_1") {
      throw new Error("receipt write unavailable");
    }
    return { status: "delivered" };
  };
  store.failFulfillmentCommand = (input) => {
    failures.push(input);
    return { status: "failed", safeCode: input.safeCode };
  };
  const coordinator = createCoinCommerceCoordinator({
    store,
    fulfillmentHandler: makeHandler({
      async execute(input) {
        effects.push(input.commandRef);
        return {
          status: "delivered",
          effectRef: `effect_${input.orderRef}`
        };
      }
    }),
    captureBatchSize: 2
  });

  const summary = await coordinator.runOnce();
  assert.deepEqual(effects, ["coincmd_order_1", "coincmd_order_2"]);
  assert.deepEqual(completions, ["coincmd_order_1", "coincmd_order_2"]);
  assert.deepEqual(failures, []);
  assert.equal(summary.commandsDeferred, 1);
  assert.equal(summary.commandsDelivered, 1);
  assert.equal(summary.commandsFailed, 0);
});

test("fulfillment claim errors reject once and cannot create a hot spin", async () => {
  let claimCalls = 0;
  const store = makeStore();
  store.claimNextFulfillmentCommand = () => {
    claimCalls += 1;
    throw new Error("private claim detail");
  };
  const coordinator = createCoinCommerceCoordinator({
    store,
    fulfillmentHandler: makeHandler()
  });

  await expectCoordinatorRejection(
    coordinator.runOnce(),
    "coin_commerce_coordinator_unavailable"
  );
  assert.equal(claimCalls, 1);
});

test("file restart replays one command effect after completion-write loss and records one receipt", async () => {
  const directory = mkdtempSync(join(tmpdir(), "coin-commerce-coordinator-restart-"));
  const dbPath = join(directory, "commerce.sqlite");
  const clock = { value: RESTART_CLOCK };
  let database = createCoordinatorSchema(dbPath);
  let store = createSqliteCoinCommerceStore({
    database: fixedCoordinatorClockDatabase(database, clock)
  });
  const effects = new Map();
  let externalEffectCount = 0;
  const handler = {
    idempotencyContract: "deduplicate_by_command_ref",
    async execute({ commandRef }) {
      if (!effects.has(commandRef)) {
        effects.set(commandRef, "synthetic_effect_restart_1");
        externalEffectCount += 1;
      }
      return {
        status: "delivered",
        effectRef: effects.get(commandRef)
      };
    }
  };

  try {
    const order = seedCapturedRestartOrder(store, clock);
    let throwCompletionOnce = true;
    const firstCoordinatorStore = {
      recoverNonTerminalOrders: store.recoverNonTerminalOrders,
      claimDueCaptures: store.claimDueCaptures,
      captureClaimedOrder: store.captureClaimedOrder,
      claimNextFulfillmentCommand: store.claimNextFulfillmentCommand,
      completeFulfillmentCommand(input) {
        if (throwCompletionOnce) {
          throwCompletionOnce = false;
          throw new Error("synthetic completion boundary loss");
        }
        return store.completeFulfillmentCommand(input);
      },
      failFulfillmentCommand: store.failFulfillmentCommand,
      nextWakeAt: store.nextWakeAt
    };
    const firstCoordinator = createCoinCommerceCoordinator({
      store: firstCoordinatorStore,
      fulfillmentHandler: handler,
      commandLeaseMs: 1000
    });
    const firstSummary = await firstCoordinator.runOnce();
    assert.equal(firstSummary.commandsDeferred, 1);
    assert.equal(firstSummary.commandsFailed, 0);
    assert.equal(externalEffectCount, 1);

    const firstCommand = database.prepare(`
      select * from platform_coin_commerce_fulfillment_commands
       where order_ref = ?
    `).get(order.orderRef);
    assert.equal(firstCommand.status, "processing");
    assert.equal(firstCommand.lease_generation, 1);
    assert.equal(database.prepare(`
      select count(*) from platform_coin_commerce_fulfillment_receipts
    `).pluck().get(), 0);
    const leaseExpiry = firstCommand.lease_until;
    await firstCoordinator.stop();
    store.close();
    database.close();

    clock.value = leaseExpiry;
    database = new Database(dbPath);
    database.pragma("foreign_keys = ON");
    store = createSqliteCoinCommerceStore({
      database: fixedCoordinatorClockDatabase(database, clock)
    });
    const secondCoordinator = createCoinCommerceCoordinator({
      store,
      fulfillmentHandler: handler,
      commandLeaseMs: 1000
    });
    const secondSummary = await secondCoordinator.runOnce();
    assert.equal(secondSummary.commandsDelivered, 1);
    assert.equal(secondSummary.commandsFailed, 0);
    assert.equal(externalEffectCount, 1);

    const deliveredCommand = database.prepare(`
      select * from platform_coin_commerce_fulfillment_commands
       where command_ref = ?
    `).get(firstCommand.command_ref);
    assert.equal(deliveredCommand.status, "delivered");
    assert.equal(deliveredCommand.lease_generation, 2);
    assert.equal(deliveredCommand.safe_failure_code, null);
    const receipts = database.prepare(`
      select * from platform_coin_commerce_fulfillment_receipts
       where command_ref = ?
    `).all(firstCommand.command_ref);
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].effect_ref, "synthetic_effect_restart_1");
    assert.equal(receipts[0].status, "delivered");
    assert.equal(receipts[0].safe_code, null);
    await secondCoordinator.stop();
  } finally {
    try {
      store?.close();
    } catch {
      // Best-effort synthetic cleanup after assertions.
    }
    try {
      if (database?.open) database.close();
    } catch {
      // Best-effort synthetic cleanup after assertions.
    }
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  }
});

test("a later real Store lease generation fences both late complete and late fail", () => {
  const directory = mkdtempSync(join(tmpdir(), "coin-commerce-coordinator-fence-"));
  const dbPath = join(directory, "commerce.sqlite");
  const clock = { value: RESTART_CLOCK };
  const database = createCoordinatorSchema(dbPath);
  const store = createSqliteCoinCommerceStore({
    database: fixedCoordinatorClockDatabase(database, clock)
  });
  try {
    seedCapturedRestartOrder(store, clock);
    const workerA = store.claimNextFulfillmentCommand({ leaseMs: 1000 });
    const leaseExpiry = database.prepare(`
      select lease_until from platform_coin_commerce_fulfillment_commands
       where command_ref = ?
    `).pluck().get(workerA.commandRef);
    clock.value = leaseExpiry;
    const workerB = store.claimNextFulfillmentCommand({ leaseMs: 1000 });
    assert.equal(workerB.commandRef, workerA.commandRef);
    assert.equal(workerB.leaseGeneration, workerA.leaseGeneration + 1);
    assert.notEqual(workerB.leaseToken, workerA.leaseToken);

    for (const lateWrite of [
      () => store.completeFulfillmentCommand({
        commandRef: workerA.commandRef,
        leaseGeneration: workerA.leaseGeneration,
        leaseToken: workerA.leaseToken,
        effectRef: "synthetic_effect_worker_a",
        status: "delivered"
      }),
      () => store.failFulfillmentCommand({
        commandRef: workerA.commandRef,
        leaseGeneration: workerA.leaseGeneration,
        leaseToken: workerA.leaseToken,
        safeCode: "fulfillment_handler_failed"
      })
    ]) {
      assert.throws(lateWrite, (error) => {
        assert.equal(error?.code, "commerce_fulfillment_lease_lost");
        assert.equal(error?.message, "Coin commerce store operation rejected");
        return true;
      });
    }

    assert.deepEqual(store.completeFulfillmentCommand({
      commandRef: workerB.commandRef,
      leaseGeneration: workerB.leaseGeneration,
      leaseToken: workerB.leaseToken,
      effectRef: "synthetic_effect_worker_b",
      status: "delivered"
    }), { status: "delivered" });
    assert.equal(database.prepare(`
      select count(*) from platform_coin_commerce_fulfillment_receipts
       where command_ref = ?
    `).pluck().get(workerB.commandRef), 1);
  } finally {
    store.close();
    database.close();
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  }
});
