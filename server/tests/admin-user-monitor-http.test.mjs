import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import express from "express";
import Database from "better-sqlite3";
import { createApp } from "../app.mjs";
import { adminUserMonitorRoutes } from "../routes/admin-user-monitor.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { listen } from "./helpers/listen.mjs";

const ROOT_DIR = fileURLToPath(new URL("../../", import.meta.url));
const FROM = "2026-01-10T00:00:00.000Z";
const TO = "2026-01-13T00:00:00.000Z";
const RANGE = `from=${encodeURIComponent(FROM)}&to=${encodeURIComponent(TO)}`;
const COOKIE = { Cookie: "gcc_admin_session=valid" };
const ROOT = "/api/admin/platform/user-monitor";

function putAccount(store, id, createdAt, metadata = {}, status = "active") {
  store.createAccount({
    id,
    ownerRef: "owner_must_not_leak",
    status,
    createdAt,
    updatedAt: createdAt,
    metadata
  });
}

function putUsage(store, accountId, samples) {
  const entitlementId = `ent_${accountId}`;
  const requestId = `req_${accountId}`;
  store.createEntitlement({
    id: entitlementId,
    accountId,
    plan: "monthly",
    status: "expired",
    validFrom: "2025-01-01T00:00:00.000Z",
    validUntil: "2025-12-31T00:00:00.000Z",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-12-31T00:00:00.000Z"
  });
  store.createIssuanceRequest({
    id: requestId,
    accountId,
    entitlementId,
    approvalRef: "appr_1",
    status: "issued",
    quantity: 1,
    nodeId: "node_1",
    purpose: "access",
    requestedByRef: "op_1",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z"
  });
  for (const sample of samples) {
    store.recordUsageSample({
      id: sample.id,
      sourceRef: "src_1",
      channelRef: "ch_1",
      edgeCredentialRef: `edge_${accountId}`,
      accountId,
      entitlementId,
      requestId,
      observedAt: sample.at,
      intervalStartedAt: sample.at,
      intervalEndedAt: sample.at,
      uploadBytes: sample.up,
      downloadBytes: sample.down,
      sampleDigest: `sha256:${sample.id}`,
      createdAt: sample.at
    });
  }
}

function walletStub(accountId = "acc_coins") {
  return {
    getWalletProjection({ accountId: id }) {
      assert.equal(id, accountId);
      return {
        exists: true,
        walletRef: "wallet_acc_coins",
        status: "active",
        version: 1,
        totals: { paid_coins: 8, bonus_coins: 0, reward_coins: 0 },
        spendableUnits: 8,
        heldUnits: 0,
        pendingUnits: 0
      };
    },
    listLedgerEntries({ walletRef, limit }) {
      return [{
        entryRef: "e_credit",
        walletRef,
        occurredAt: "2026-01-12T00:00:00.000Z",
        operation: "credit",
        coinType: "paid_coins",
        amountUnits: 5,
        actorRef: "actor_secret",
        sourceRef: "src_secret"
      }].slice(0, limit);
    }
  };
}

function adminState(platformExtra = {}) {
  const database = new Database(":memory:");
  const controlStore = createSqliteSubscriptionControlStore({ database });
  return {
    database,
    controlStore,
    state: {
      rootDir: ROOT_DIR,
      host: "127.0.0.1",
      ports: { console: 3456, socks: 1080, httpProxy: 18180 },
      consoleToken: "console-secret",
      proxyConfig: { servers: [], pingHosts: [], nginx: {} },
      services: {
        ssLocal: { status: () => ({ running: false }) },
        httpProxy: { status: () => ({ running: false }) }
      },
      subscriptions: { service: { listTenants: () => [] } },
      security: {
        adminAllowedCidrs: ["127.0.0.1/32"],
        subRateLimit: { windowMs: 60000, max: 30 }
      },
      platform: {
        adminAuthRoutesEnabled: true,
        adminAuth: {
          sessionStatus: () => ({ authenticated: false }),
          authenticateCookie: ({ cookieHeader }) => (
            String(cookieHeader || "").includes("gcc_admin_session=valid")
              ? {
                sessionRef: "admin_session_1",
                operatorRef: "portal_user_20260604_001",
                authMethod: "totp",
                status: "active",
                issuedAt: "2026-07-30T00:00:00.000Z",
                expiresAt: "2026-07-30T01:00:00.000Z"
              }
              : null
          )
        },
        controlStore,
        ...platformExtra
      },
      isPortListening: async () => false,
      runCommand: async () => ({ ok: true, stdout: "", stderr: "", code: 0, timedOut: false })
    }
  };
}

async function withApp(platformExtra, fn) {
  const { database, controlStore, state } = adminState(platformExtra);
  const { server, baseUrl } = await listen(createApp(state));
  try {
    return await fn({ database, controlStore, baseUrl });
  } finally {
    server.close();
    controlStore.close();
    database.close();
  }
}

async function withRouter(setup, fn) {
  const app = express();
  setup(app);
  app.use(adminUserMonitorRoutes({ platform: {} }));
  const { server, baseUrl } = await listen(app);
  try {
    return await fn({ baseUrl });
  } finally {
    server.close();
  }
}

test("createApp user-monitor prefix sets Cache-Control no-store on 401 before router for enabled and disabled admin auth", async () => {
  async function assertUnauthorizedNoStore(platformExtra, headers) {
    await withApp(platformExtra, async ({ baseUrl }) => {
      for (const path of [
        `${ROOT}/accounts`,
        `${ROOT}/growth?range=${RANGE}`,
        `${ROOT}/accounts/acc_probe/coins`,
        `${ROOT}/accounts/acc_probe/traffic?range=${RANGE}`,
      ]) {
        const res = await fetch(`${baseUrl}${path}`, { headers });
        assert.equal(res.status, 401);
        assert.equal(res.headers.get("cache-control"), "no-store");
      }
    });
  }

  await assertUnauthorizedNoStore({ adminAuthRoutesEnabled: true }, {});
  await assertUnauthorizedNoStore({ adminAuthRoutesEnabled: true }, {
    Authorization: "Bearer console-secret",
  });
  await assertUnauthorizedNoStore({ adminAuthRoutesEnabled: false }, {});
  await assertUnauthorizedNoStore({ adminAuthRoutesEnabled: false }, {
    Authorization: "Bearer console-secret",
  });
});

test("createApp cookie reaches four GET families; bearer-only and anonymous are denied", async () => {
  await withApp({ coinsWalletStore: walletStub() }, async ({ database, controlStore, baseUrl }) => {
    const ts = "2026-01-12T00:00:00.000Z";
    putAccount(controlStore, "acc_z", ts, { registrationSource: "self_service_portal" });
    putAccount(controlStore, "acc_a", ts, {});
    putAccount(controlStore, "acc_coins", FROM);
    putAccount(controlStore, "acc_t", FROM);
    putAccount(controlStore, "acc_other", FROM);
    putUsage(controlStore, "acc_t", [
      { id: "s1", at: "2026-01-10T00:10:00.000Z", up: 10, down: 20 }
    ]);
    putUsage(controlStore, "acc_other", [
      { id: "o1", at: "2026-01-10T00:00:00.000Z", up: 999, down: 999 }
    ]);
    assert.equal((await fetch(`${baseUrl}${ROOT}/growth?${RANGE}`)).status, 401);
    assert.equal((await fetch(`${baseUrl}${ROOT}/growth?${RANGE}`, {
      headers: { Authorization: "Bearer console-secret" }
    })).status, 401);
    const before = database.prepare("select total_changes() as n").get().n;
    const growth = await fetch(`${baseUrl}${ROOT}/growth?${RANGE}`, { headers: COOKIE });
    assert.equal(growth.status, 200);
    assert.equal(growth.headers.get("cache-control"), "no-store");
    const growthBody = await growth.json();
    assert.equal(growthBody.schemaVersion, "admin-user-monitor/v1");
    assert.equal(growthBody.registeredCount, 1);
    const page1 = await (await fetch(`${baseUrl}${ROOT}/accounts?limit=1`, { headers: COOKIE })).json();
    assert.equal(page1.items[0].id, "acc_z");
    const page2 = await fetch(
      `${baseUrl}${ROOT}/accounts?limit=1&cursor=${encodeURIComponent(page1.nextCursor)}`,
      { headers: COOKIE }
    );
    assert.equal((await page2.json()).items[0].id, "acc_a");
    const coinsBody = await (await fetch(`${baseUrl}${ROOT}/accounts/acc_coins/coins`, { headers: COOKIE })).json();
    assert.equal(coinsBody.wallet.balances.paidCoins, 8);
    assert.equal(coinsBody.entries[0].totalDeltaUnits, 5);
    assert.doesNotMatch(JSON.stringify(coinsBody), /wallet_acc_coins|actor_secret|owner_must_not_leak/);
    const trafficBody = await (await fetch(`${baseUrl}${ROOT}/accounts/acc_t/traffic?${RANGE}`, { headers: COOKIE })).json();
    assert.equal(trafficBody.totalBytes, 30);
    assert.equal(trafficBody.sampleCount, 1);
    const posted = await fetch(`${baseUrl}${ROOT}/growth?${RANGE}`, { method: "POST", headers: COOKIE });
    assert.notEqual(posted.status, 200);
    assert.equal((await fetch(`${baseUrl}${ROOT}/growth?${RANGE}&extra=1`, { headers: COOKIE })).status, 400);
    assert.equal((await fetch(
      `${baseUrl}${ROOT}/growth?from=${encodeURIComponent(FROM)}&from=${encodeURIComponent(FROM)}&to=${encodeURIComponent(TO)}`,
      { headers: COOKIE }
    )).status, 400);
    const missing = await fetch(`${baseUrl}${ROOT}/accounts/missing_acc/traffic?${RANGE}`, { headers: COOKIE });
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: "account_not_found" });
    assert.equal(missing.headers.get("cache-control"), "no-store");
    const badQuery = await fetch(`${baseUrl}${ROOT}/growth?${RANGE}&limit=not-a-number`, { headers: COOKIE });
    assert.equal(badQuery.status, 400);
    assert.deepEqual(await badQuery.json(), { error: "invalid_query" });
    assert.equal(badQuery.headers.get("cache-control"), "no-store");
    assert.equal(database.prepare("select total_changes() as n").get().n, before);
    const afterPost = database.prepare("select total_changes() as n").get().n;
    assert.equal(afterPost, before);
  });
  await withApp({}, async ({ controlStore, baseUrl }) => {
    putAccount(controlStore, "acc_coins", FROM);
    const coins = await fetch(`${baseUrl}${ROOT}/accounts/acc_coins/coins`, { headers: COOKIE });
    assert.equal(coins.status, 503);
    assert.deepEqual(await coins.json(), { error: "source_unavailable" });
  });
  await withApp({ adminAuthRoutesEnabled: false, coinsWalletStore: walletStub() }, async ({ baseUrl }) => {
    assert.equal((await fetch(`${baseUrl}${ROOT}/growth?${RANGE}`, {
      headers: { Authorization: "Bearer console-secret" }
    })).status, 401);
  });
  await withApp({ coinsWalletStore: walletStub() }, async ({ controlStore, baseUrl }) => {
    controlStore.listUserMonitorGrowthDays = () => {
      throw Object.assign(new Error("raw_secret_sentinel"), { code: "invalid_query" });
    };
    const poisonedQuery = await fetch(`${baseUrl}${ROOT}/growth?${RANGE}`, { headers: COOKIE });
    assert.equal(poisonedQuery.status, 503);
    const poisonedQueryBody = await poisonedQuery.json();
    assert.deepEqual(poisonedQueryBody, { error: "source_unavailable" });
    assert.doesNotMatch(JSON.stringify(poisonedQueryBody), /raw_secret_sentinel/);
    assert.equal(poisonedQuery.headers.get("cache-control"), "no-store");
  });
  await withApp({ coinsWalletStore: walletStub() }, async ({ controlStore, baseUrl }) => {
    controlStore.listUserMonitorGrowthDays = () => {
      throw Object.assign(new Error("raw_secret_sentinel"), { code: "account_not_found" });
    };
    const poisonedMissing = await fetch(`${baseUrl}${ROOT}/growth?${RANGE}`, { headers: COOKIE });
    assert.equal(poisonedMissing.status, 503);
    const poisonedMissingBody = await poisonedMissing.json();
    assert.deepEqual(poisonedMissingBody, { error: "source_unavailable" });
    assert.doesNotMatch(JSON.stringify(poisonedMissingBody), /raw_secret_sentinel/);
    assert.equal(poisonedMissing.headers.get("cache-control"), "no-store");
  });
});

test("user-monitor capability gates stay specific and set no-store", async () => {
  await withRouter((app) => {
    app.use((req, _res, next) => {
      req.adminPrincipal = { capabilities: ["users.read"] };
      next();
    });
  }, async ({ baseUrl }) => {
    const coins = await fetch(`${baseUrl}${ROOT}/accounts/acc_q/coins`);
    assert.equal(coins.status, 403);
    assert.deepEqual(await coins.json(), { error: "admin_capability_required", capability: "wallet.read" });
    assert.equal(coins.headers.get("cache-control"), "no-store");
    const traffic = await fetch(`${baseUrl}${ROOT}/accounts/acc_q/traffic?${RANGE}`);
    assert.equal(traffic.status, 403);
    assert.deepEqual(await traffic.json(), { error: "admin_capability_required", capability: "runtime.read" });
    assert.equal(traffic.headers.get("cache-control"), "no-store");
  });

  await withRouter(() => {}, async ({ baseUrl }) => {
    const growth = await fetch(`${baseUrl}${ROOT}/growth?${RANGE}`);
    assert.equal(growth.status, 401);
    assert.deepEqual(await growth.json(), { error: "admin_authentication_required" });
    assert.equal(growth.headers.get("cache-control"), "no-store");
  });

  await withRouter((app) => {
    app.use((req, _res, next) => {
      req.adminPrincipal = { capabilities: ["runtime.read", "wallet.read"] };
      next();
    });
  }, async ({ baseUrl }) => {
    const growth = await fetch(`${baseUrl}${ROOT}/growth?${RANGE}`);
    assert.equal(growth.status, 403);
    assert.deepEqual(await growth.json(), { error: "admin_capability_required", capability: "users.read" });
    assert.equal(growth.headers.get("cache-control"), "no-store");
  });

  await withRouter((app) => {
    app.use((req, _res, next) => {
      req.adminPrincipal = { capabilities: ["users.read", "wallet.read"] };
      next();
    });
  }, async ({ baseUrl }) => {
    const malformed = await fetch(`${baseUrl}${ROOT}/accounts/%E0%A4%A/coins`);
    assert.equal(malformed.status, 400);
    const body = await malformed.json();
    assert.deepEqual(body, { error: "invalid_query" });
    assert.doesNotMatch(JSON.stringify(body), /%E0|stack|Error/);
    assert.equal(malformed.headers.get("cache-control"), "no-store");
  });
});
