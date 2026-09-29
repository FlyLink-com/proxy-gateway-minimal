import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import {
  startProductionProxyGateway
} from "../services/platform/coin-commerce-production-runtime.mjs";
import {
  ACCOUNT_RESOURCE_AUTHORITY_MIGRATIONS,
  REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID,
  applyAccountResourceAuthorityMigrations
} from "../services/platform/account-resource-authority-migrations.mjs";
import {
  ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATIONS,
  REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID,
  applyAccountResourceAuthorityCommerceMigrations
} from "../services/platform/account-resource-authority-commerce-migrations.mjs";
import { createRuntimeState } from "../state.mjs";
import {
  applyCoinCommerceMigrations,
  COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID
} from "../services/platform/coin-commerce-migrations.mjs";
import {
  COIN_COMMERCE_PRODUCTION_OFFERS
} from "../services/platform/coin-commerce-production-catalog.mjs";
import {
  applyCoinWalletMigrations,
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID
} from "../services/platform/coin-wallet-migrations.mjs";
import {
  createSqliteCoinCommerceStore
} from "../services/platform/coin-commerce-store.mjs";

function removeTempDir(directory) {
  rmSync(directory, { recursive: true, force: true });
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  const port = address.port;
  await new Promise((resolvePromise, rejectPromise) => {
    server.close((error) => {
      if (error) rejectPromise(error);
      else resolvePromise();
    });
  });
  return port;
}

async function assertPortBindable(port) {
  const server = createServer();
  try {
    await new Promise((resolvePromise, rejectPromise) => {
      server.once("error", rejectPromise);
      server.listen(port, "127.0.0.1", resolvePromise);
    });
  } finally {
    await new Promise((resolvePromise) => {
      server.close(() => resolvePromise());
    });
  }
}

function prepareRuntime(directory, { authority = false } = {}) {
  const controlDbPath = join(directory, "control.sqlite");
  const subscriptionDbPath = join(directory, "subscriptions.sqlite");
  const proxyConfigPath = join(directory, "proxy-config.json");
  writeFileSync(proxyConfigPath, JSON.stringify({
    servers: [
      {
        id: "synthetic-node",
        name: "synthetic-node",
        type: "ss",
        host: "127.0.0.1",
        port: 8388,
        method: "aes-128-gcm",
        password: "synthetic-password"
      }
    ]
  }), "utf8");
  const seed = createRuntimeState({
    rootDir: new URL("../../", import.meta.url),
    env: { CONSOLE_TOKEN: "secret" },
    controlDbPath,
    subscriptionDbPath,
    proxyConfigPath,
    autoStartHttpProxy: false
  });
  seed.close();
  applyCoinWalletMigrations({
    dbPath: controlDbPath,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date("2026-07-29T00:00:00.000Z")
  });
  applyCoinCommerceMigrations({
    dbPath: controlDbPath,
    expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date("2026-07-29T00:00:00.000Z")
  });
  if (authority) {
    applyAccountResourceAuthorityMigrations({
      dbPath: controlDbPath,
      expectedMigrationId: REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID,
      expectedDdlChecksum: ACCOUNT_RESOURCE_AUTHORITY_MIGRATIONS[0].ddlChecksum,
      nowFn: () => new Date("2026-08-08T00:00:00.000Z")
    });
    applyAccountResourceAuthorityCommerceMigrations({
      dbPath: controlDbPath,
      expectedMigrationId:
        REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID,
      expectedDdlChecksum:
        ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATIONS[0].ddlChecksum,
      nowFn: () => new Date("2026-08-08T00:00:00.000Z")
    });
  }
  return {
    controlDbPath,
    subscriptionDbPath,
    proxyConfigPath
  };
}

function accountHash(accountId) {
  return createHash("sha256").update(accountId).digest("hex");
}

function productionRuntimeOptions(
  paths,
  consolePort,
  canaryAccountHashes = accountHash("account_production_entry_canary")
) {
  return {
    rootDir: new URL("../../", import.meta.url),
    env: {
      CONSOLE_TOKEN: "secret",
      CONSOLE_PORT: String(consolePort),
      USER_PORTAL_ROUTES_ENABLED: "true",
      COINS_WALLET_ENABLED: "true",
      COINS_COMMERCE_ENABLED: "true",
      COINS_COMMERCE_CANARY_ACCOUNT_HASHES: canaryAccountHashes
    },
    ...paths,
    autoStartHttpProxy: false
  };
}

function protectedDataPackRuntimeEnvironment(directory) {
  return {
    COINS_COMMERCE_DATA_PACK_RUNTIME_ENABLED: "true",
    COINS_COMMERCE_DATA_PACK_NODE_ID: "synthetic-node",
    COINS_COMMERCE_DATA_PACK_ESCROW_KEY: "a".repeat(64),
    COINS_COMMERCE_DATA_PACK_ESCROW_PATH: join(directory, "pack-escrow.json"),
    USER_PORTAL_EDGE_LIFECYCLE_ENABLED: "true",
    USER_PORTAL_EDGE_CHANNEL_REF: "synthetic-node",
    EDGE_CREDENTIAL_MATERIAL_PATH: join(directory, "edge-material.json"),
    EDGE_DATA_PLANE_AGENT_ROUTES_ENABLED: "true"
  };
}

test("production entry rejects an injected state before startup", () => {
  assert.throws(
    () => startProductionProxyGateway({ state: {} }),
    (error) => error?.code === "coin_commerce_production_runtime_invalid"
  );
  assert.throws(
    () => startProductionProxyGateway({
      runtimeOptions: new Proxy({}, {})
    }),
    (error) => error?.code === "coin_commerce_production_runtime_invalid"
  );
});

test("production entry rejects a Proxy that hides and then injects state", async () => {
  const directory = mkdtempSync(join(tmpdir(), "proxy-gateway-production-proxy-state-"));
  const paths = prepareRuntime(directory);
  const consolePort = await reservePort();
  const injectedState = createRuntimeState({
    rootDir: new URL("../../", import.meta.url),
    env: {
      CONSOLE_TOKEN: "secret",
      CONSOLE_PORT: String(consolePort),
      USER_PORTAL_ROUTES_ENABLED: "true",
      COINS_WALLET_ENABLED: "false",
      COINS_COMMERCE_ENABLED: "false"
    },
    ...paths,
    autoStartHttpProxy: false
  });
  const target = {
    state: injectedState,
    logger: false
  };
  let firstStateDescriptorRead = true;
  const options = new Proxy(target, {
    getOwnPropertyDescriptor(value, property) {
      if (property === "state" && firstStateDescriptorRead) {
        firstStateDescriptorRead = false;
        return undefined;
      }
      return Reflect.getOwnPropertyDescriptor(value, property);
    }
  });
  let handle;

  try {
    const outcome = await Promise.resolve()
      .then(() => startProductionProxyGateway(options))
      .then(
        (startedHandle) => ({ handle: startedHandle, error: null }),
        (error) => ({ handle: null, error })
      );
    handle = outcome.handle;
    assert.equal(outcome.handle, null);
    assert.equal(
      outcome.error?.code,
      "coin_commerce_production_runtime_invalid"
    );
  } finally {
    if (handle) {
      await handle.stop();
    } else {
      await Promise.resolve(injectedState.close());
    }
    removeTempDir(directory);
  }
});

test("production entry does not read overridden Commerce options while default-off", async () => {
  const directory = mkdtempSync(join(tmpdir(), "proxy-gateway-production-default-off-"));
  const paths = prepareRuntime(directory);
  const consolePort = await reservePort();
  const runtimeOptions = productionRuntimeOptions(paths, consolePort);
  runtimeOptions.env.COINS_WALLET_ENABLED = "false";
  runtimeOptions.env.COINS_COMMERCE_ENABLED = "false";
  delete runtimeOptions.env.COINS_COMMERCE_CANARY_ACCOUNT_HASHES;
  let catalogGetterReads = 0;
  Object.defineProperty(runtimeOptions, "coinCommerceCatalog", {
    enumerable: true,
    get() {
      catalogGetterReads += 1;
      throw new Error("default-off Commerce catalog getter was read");
    }
  });
  let packFactoryGetterReads = 0;
  Object.defineProperty(runtimeOptions, "coinCommerceDataPackFulfillmentFactory", {
    enumerable: true,
    get() {
      packFactoryGetterReads += 1;
      throw new Error("default-off pack factory getter was read");
    }
  });
  let packEscrowGetterReads = 0;
  Object.defineProperty(runtimeOptions, "coinCommerceDataPackMaterialEscrow", {
    enumerable: true,
    get() {
      packEscrowGetterReads += 1;
      throw new Error("production pack escrow override was read");
    }
  });
  let handle;

  try {
    handle = await startProductionProxyGateway({
      runtimeOptions,
      logger: false
    });
    assert.equal(catalogGetterReads, 0);
    assert.equal(packFactoryGetterReads, 0);
    assert.equal(packEscrowGetterReads, 0);
    assert.equal(handle.state.platform.coinsCommerceEnabled, false);
    assert.equal(handle.state.platform.coinsCommerceAuthorityEnabled, false);
  } finally {
    await handle?.stop();
    removeTempDir(directory);
  }
});

test("production entry rejects Authority mode unless Commerce is enabled", async () => {
  const directory = mkdtempSync(join(
    tmpdir(),
    "proxy-gateway-production-authority-prerequisite-"
  ));
  const paths = prepareRuntime(directory);
  const consolePort = await reservePort();
  const runtimeOptions = productionRuntimeOptions(paths, consolePort);
  runtimeOptions.env.COINS_WALLET_ENABLED = "false";
  runtimeOptions.env.COINS_COMMERCE_ENABLED = "false";
  runtimeOptions.env.COINS_COMMERCE_ACCOUNT_RESOURCE_AUTHORITY_ENABLED = "true";

  try {
    await assert.rejects(
      startProductionProxyGateway({ runtimeOptions, logger: false }),
      (error) => error?.code === "coin_commerce_prerequisite_missing"
    );
    await assertPortBindable(consolePort);
  } finally {
    removeTempDir(directory);
  }
});

test("production entry rejects each missing Authority schema independently", async (t) => {
  for (const scenario of [
    {
      label: "foundation_missing",
      installFoundation: false,
      code: "account_resource_authority_schema_not_ready"
    },
    {
      label: "quote_binding_missing",
      installFoundation: true,
      code: "account_resource_authority_commerce_schema_not_ready"
    }
  ]) {
    await t.test(scenario.label, async () => {
      const directory = mkdtempSync(join(
        tmpdir(),
        `proxy-gateway-production-authority-${scenario.label}-`
      ));
      const paths = prepareRuntime(directory);
      if (scenario.installFoundation) {
        applyAccountResourceAuthorityMigrations({
          dbPath: paths.controlDbPath,
          expectedMigrationId: REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID,
          expectedDdlChecksum:
            ACCOUNT_RESOURCE_AUTHORITY_MIGRATIONS[0].ddlChecksum,
          nowFn: () => new Date("2026-08-08T00:00:00.000Z")
        });
      }
      const consolePort = await reservePort();
      const runtimeOptions = productionRuntimeOptions(paths, consolePort);
      runtimeOptions.env.COINS_COMMERCE_ACCOUNT_RESOURCE_AUTHORITY_ENABLED =
        "true";

      try {
        await assert.rejects(
          startProductionProxyGateway({ runtimeOptions, logger: false }),
          (error) => error?.code === scenario.code
        );
        await assertPortBindable(consolePort);
      } finally {
        removeTempDir(directory);
      }
    });
  }
});

test("production entry wires Authority mode only after both exact schemas exist", async () => {
  const directory = mkdtempSync(join(
    tmpdir(),
    "proxy-gateway-production-authority-runtime-"
  ));
  const paths = prepareRuntime(directory, { authority: true });
  const consolePort = await reservePort();
  const runtimeOptions = productionRuntimeOptions(paths, consolePort);
  runtimeOptions.env.COINS_COMMERCE_ACCOUNT_RESOURCE_AUTHORITY_ENABLED = "true";
  let handle;

  try {
    handle = await startProductionProxyGateway({ runtimeOptions, logger: false });
    assert.equal(handle.state.platform.coinsCommerceEnabled, true);
    assert.equal(handle.state.platform.coinsCommerceAuthorityEnabled, true);
  } finally {
    await handle?.stop();
    removeTempDir(directory);
  }
});

test("production entry starts with the authoritative catalog and production fulfillment factory", async () => {
  const directory = mkdtempSync(join(tmpdir(), "proxy-gateway-production-commerce-entry-"));
  const paths = prepareRuntime(directory);
  const consolePort = await reservePort();
  let handle;
  const runtimeOptions = productionRuntimeOptions(paths, consolePort);
  let packFactoryGetterReads = 0;
  Object.defineProperty(runtimeOptions, "coinCommerceDataPackFulfillmentFactory", {
    enumerable: true,
    get() {
      packFactoryGetterReads += 1;
      throw new Error("production pack factory override was read");
    }
  });

  try {
    handle = await startProductionProxyGateway({
      runtimeOptions,
      logger: false
    });
    assert.equal(handle.server.listening, true);
    assert.equal(handle.state.platform.coinsCommerceEnabled, true);
    assert.equal(handle.state.platform.coinCommerceDataPackRuntimeEnabled, false);
    assert.equal(packFactoryGetterReads, 0);

    const database = new Database(paths.controlDbPath, {
      readonly: true,
      fileMustExist: true
    });
    try {
      assert.deepEqual(database.prepare(`
        select base_coin_units, discount_basis_points
          from platform_coin_commerce_offer_versions
         where status = 'published'
         order by base_coin_units
      `).all(), [
        { base_coin_units: 20, discount_basis_points: 0 },
        { base_coin_units: 30, discount_basis_points: 0 },
        { base_coin_units: 200, discount_basis_points: 0 }
      ]);
    } finally {
      database.close();
    }
  } finally {
    await handle?.stop();
    removeTempDir(directory);
  }
});

test("production entry rejects an opted-in data pack without protected prerequisites before listening", async () => {
  const directory = mkdtempSync(join(tmpdir(), "proxy-gateway-production-pack-prerequisite-"));
  const paths = prepareRuntime(directory);
  const consolePort = await reservePort();
  const runtimeOptions = productionRuntimeOptions(paths, consolePort);
  runtimeOptions.env.COINS_COMMERCE_DATA_PACK_RUNTIME_ENABLED = "true";
  let handle;

  try {
    await assert.rejects(
      startProductionProxyGateway({ runtimeOptions, logger: false })
        .then((started) => { handle = started; return started; }),
      (error) => error?.code === "coin_commerce_prerequisite_missing"
    );
    await assertPortBindable(consolePort);
  } finally {
    await handle?.stop();
    removeTempDir(directory);
  }
});

test("production entry composes a protected pack handler without publishing pack offers", async () => {
  const directory = mkdtempSync(join(tmpdir(), "proxy-gateway-production-pack-composition-"));
  const paths = prepareRuntime(directory);
  const consolePort = await reservePort();
  const runtimeOptions = productionRuntimeOptions(paths, consolePort);
  Object.assign(runtimeOptions.env, protectedDataPackRuntimeEnvironment(directory));
  let handle;

  try {
    handle = await startProductionProxyGateway({ runtimeOptions, logger: false });
    assert.equal(handle.server.listening, true);
    assert.equal(handle.state.platform.coinCommerceDataPackRuntimeEnabled, true);
    assert.equal(typeof handle.state.platform.coinCommerceDataPackOrderDelivery.get, "function");
    assert.equal(typeof handle.state.platform.coinCommerceDataPackArtifactRotation.rotate, "function");
    assert.equal(typeof handle.state.platform.coinCommerceDataPackRotationCoordinator.start, "function");
    // Startup must not create customer material before a captured pack order exists.
    assert.equal(existsSync(runtimeOptions.env.COINS_COMMERCE_DATA_PACK_ESCROW_PATH), false);
    const database = new Database(paths.controlDbPath, {
      readonly: true, fileMustExist: true
    });
    try {
      assert.deepEqual(database.prepare(`
        select category, count(*) as count
          from platform_coin_commerce_offer_versions
         where status = 'published'
         group by category
      `).all(), [{ category: "plan", count: 3 }]);
    } finally {
      database.close();
    }
  } finally {
    await handle?.stop();
    removeTempDir(directory);
  }
});

for (const [label, alter] of [
  ["missing escrow key", (env) => { delete env.COINS_COMMERCE_DATA_PACK_ESCROW_KEY; }],
  ["invalid escrow key", (env) => { env.COINS_COMMERCE_DATA_PACK_ESCROW_KEY = "invalid"; }],
  ["unconfigured node", (env) => { env.COINS_COMMERCE_DATA_PACK_NODE_ID = "other-node"; }],
  ["disabled Agent route", (env) => { env.EDGE_DATA_PLANE_AGENT_ROUTES_ENABLED = "false"; }],
  ["relative escrow path", (env) => { env.COINS_COMMERCE_DATA_PACK_ESCROW_PATH = "pack-escrow.json"; }],
  ["shared edge material path", (env) => {
    env.COINS_COMMERCE_DATA_PACK_ESCROW_PATH = env.EDGE_CREDENTIAL_MATERIAL_PATH;
  }],
  ["shared control database path", (env, paths) => {
    env.COINS_COMMERCE_DATA_PACK_ESCROW_PATH = paths.controlDbPath;
  }]
]) {
  test(`production entry fails closed for ${label} before listening`, async () => {
    const directory = mkdtempSync(join(tmpdir(), "proxy-gateway-production-pack-invalid-"));
    const paths = prepareRuntime(directory);
    const consolePort = await reservePort();
    const runtimeOptions = productionRuntimeOptions(paths, consolePort);
    Object.assign(runtimeOptions.env, protectedDataPackRuntimeEnvironment(directory));
    alter(runtimeOptions.env, paths);
    let handle;
    try {
      await assert.rejects(
        startProductionProxyGateway({ runtimeOptions, logger: false })
          .then((started) => { handle = started; return started; }),
        (error) => error?.code === "coin_commerce_prerequisite_missing"
      );
      await assertPortBindable(consolePort);
    } finally {
      await handle?.stop();
      removeTempDir(directory);
    }
  });
}

test("production entry starts all-active Commerce without canary hashes and keeps inactive accounts excluded", async () => {
  const directory = mkdtempSync(join(tmpdir(), "proxy-gateway-production-commerce-all-active-"));
  const paths = prepareRuntime(directory);
  const consolePort = await reservePort();
  const activeAccountId = "account_production_all_active";
  const inactiveAccountId = "account_production_all_inactive";
  const database = new Database(paths.controlDbPath);
  const insertAccount = database.prepare(`
    insert into platform_accounts
      (id, owner_ref, status, created_at, updated_at, metadata_json)
    values (?, ?, ?, ?, ?, '{}')
  `);
  insertAccount.run(
    activeAccountId,
    `owner_${activeAccountId}`,
    "active",
    "2026-07-29T00:00:00.000Z",
    "2026-07-29T00:00:00.000Z"
  );
  insertAccount.run(
    inactiveAccountId,
    `owner_${inactiveAccountId}`,
    "suspended",
    "2026-07-29T00:00:00.000Z",
    "2026-07-29T00:00:00.000Z"
  );
  database.close();
  const runtimeOptions = productionRuntimeOptions(paths, consolePort);
  runtimeOptions.env.COINS_COMMERCE_AUDIENCE = "all_active";
  delete runtimeOptions.env.COINS_COMMERCE_CANARY_ACCOUNT_HASHES;
  let handle;

  try {
    handle = await startProductionProxyGateway({
      runtimeOptions,
      logger: false
    });
    assert.deepEqual(
      handle.state.platform.coinCommerceStore
        .listPublishedOffers({ accountId: activeAccountId })
        .map((offer) => offer.baseCoinUnits),
      [20, 30, 200]
    );
    assert.throws(
      () => handle.state.platform.coinCommerceStore.listPublishedOffers({
        accountId: inactiveAccountId
      }),
      (error) => error?.code === "commerce_not_found"
    );
  } finally {
    await handle?.stop();
    removeTempDir(directory);
  }
});

test("production entry leaves its listener unopened when catalog bootstrap detects drift", async () => {
  const directory = mkdtempSync(join(tmpdir(), "proxy-gateway-production-commerce-drift-"));
  const paths = prepareRuntime(directory);
  const consolePort = await reservePort();
  const seedStore = createSqliteCoinCommerceStore({
    dbPath: paths.controlDbPath
  });
  seedStore.bootstrapPublishedOffers([
    {
      ...COIN_COMMERCE_PRODUCTION_OFFERS[0],
      baseCoinUnits: 21
    }
  ]);
  seedStore.close();

  try {
    await assert.rejects(
      startProductionProxyGateway({
        runtimeOptions: productionRuntimeOptions(paths, consolePort),
        logger: false
      }),
      (error) => error?.code === "offer_unavailable"
    );
    await assertPortBindable(consolePort);
  } finally {
    removeTempDir(directory);
  }
});

for (const [label, canaryAccountHashes] of [
  ["missing", undefined],
  ["empty", ""],
  ["wildcard", "*"],
  ["short hash", "a".repeat(63)],
  ["non-hex hash", "g".repeat(64)],
  [
    "duplicate hashes",
    [accountHash("duplicate_canary"), accountHash("duplicate_canary")].join(",")
  ],
  [
    "oversized cohort",
    Array.from(
      { length: 33 },
      (_, index) => accountHash(`oversized_canary_${index}`)
    ).join(",")
  ]
]) {
  test(`production entry rejects ${label} canary scope before opening its listener`, async () => {
    const directory = mkdtempSync(join(tmpdir(), "proxy-gateway-production-commerce-canary-"));
    const paths = prepareRuntime(directory);
    const consolePort = await reservePort();
    const runtimeOptions = productionRuntimeOptions(
      paths,
      consolePort,
      canaryAccountHashes
    );
    if (canaryAccountHashes === undefined) {
      delete runtimeOptions.env.COINS_COMMERCE_CANARY_ACCOUNT_HASHES;
    }
    let listenCount = 0;

    try {
      await assert.rejects(
        startProductionProxyGateway({
          runtimeOptions,
          app: {
            listen() {
              listenCount += 1;
              throw new Error("listener must remain unopened");
            }
          },
          logger: false
        }),
        (error) => error?.code === "coin_commerce_prerequisite_missing"
      );
      assert.equal(listenCount, 0);
      await assertPortBindable(consolePort);

      const releasedControlDbPath = join(directory, "released-control.sqlite");
      const releasedSubscriptionDbPath = join(
        directory,
        "released-subscriptions.sqlite"
      );
      renameSync(paths.controlDbPath, releasedControlDbPath);
      renameSync(paths.subscriptionDbPath, releasedSubscriptionDbPath);
      assert.equal(existsSync(releasedControlDbPath), true);
      assert.equal(existsSync(releasedSubscriptionDbPath), true);
    } finally {
      removeTempDir(directory);
    }
  });
}
