import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import express from "express";
import Database from "better-sqlite3";
import { createApp } from "../app.mjs";
import { adminUserCommerceRoutes } from "../routes/admin-user-commerce.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { listen } from "./helpers/listen.mjs";

const ROOT_DIR = fileURLToPath(new URL("../../", import.meta.url));
const COOKIE = { cookie: "gcc_admin_session=valid" };

function adminState() {
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
        controlStore
      },
      isPortListening: async () => false,
      runCommand: async () => ({ ok: true, stdout: "", stderr: "", code: 0, timedOut: false })
    }
  };
}

async function withServer(app, fn) {
  const { server, baseUrl } = await listen(app);
  try {
    return await fn(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("createApp keeps user commerce unavailable and unauthenticated requests out", async () => {
  const { database, controlStore, state } = adminState();
  try {
    await withServer(createApp(state), async (baseUrl) => {
      const anonymous = await fetch(`${baseUrl}/api/admin/user-commerce/settlement`);
      assert.equal(anonymous.status, 401);
      assert.equal(anonymous.headers.get("cache-control"), "no-store");
      const signedIn = await fetch(`${baseUrl}/api/admin/user-commerce/orders?accountId=customer&from=2026-09-01&to=2026-09-30`, { headers: COOKIE });
      assert.equal(signedIn.status, 503);
      assert.deepEqual(await signedIn.json(), { error: "source_unavailable" });
      assert.equal(signedIn.headers.get("cache-control"), "no-store");
    });
  } finally {
    controlStore.close();
    database.close();
  }
});

test("user commerce routes enforce capabilities and pass the frontend contract through", async () => {
  const calls = [];
  const service = {
    readOrders(query) {
      calls.push(["orders", query]);
      return [{
        orderRef: "order_1",
        accountId: "customer",
        kind: "recharge",
        status: "credited",
        amountLabel: "USD 3.00",
        createdAt: "2026-09-08T00:00:00Z"
      }];
    },
    readLedger() {
      const error = new Error("conflict");
      error.code = "conflict";
      throw error;
    },
    readShareUsers() { return []; },
    readSettlement() {
      return { ratePercent: 12.5, effectiveAt: "2026-09-08", availableRewardCoins: "12" };
    },
    updateRate(body) {
      calls.push(["rate", body]);
      return { ratePercent: body.ratePercent, effectiveAt: body.effectiveAt, availableRewardCoins: "12" };
    },
    clawback(body) {
      calls.push(["clawback", body]);
      return {
        clawbackRef: "clawback_0123456789abcdef0123456789abcdef",
        settlement: { ratePercent: 12.5, effectiveAt: "2026-09-08", availableRewardCoins: "7" }
      };
    }
  };
  function appFor(capabilities) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.adminPrincipal = { capabilities };
      next();
    });
    app.use(adminUserCommerceRoutes({ platform: { adminUserCommerce: service } }));
    return app;
  }
  await withServer(appFor(["users.read"]), async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/api/admin/user-commerce/ledger?accountId=customer&from=2026-09-01&to=2026-09-30`);
    assert.equal(denied.status, 403);
    const orders = await fetch(`${baseUrl}/api/admin/user-commerce/orders?accountId=customer&from=2026-09-01&to=2026-09-30`);
    assert.equal(orders.status, 200);
    assert.deepEqual(await orders.json(), {
      orders: [{
        orderRef: "order_1",
        accountId: "customer",
        kind: "recharge",
        status: "credited",
        amountLabel: "USD 3.00",
        createdAt: "2026-09-08T00:00:00Z"
      }]
    });
  });
  await withServer(appFor(["users.read", "wallet.read"]), async (baseUrl) => {
    const ledger = await fetch(`${baseUrl}/api/admin/user-commerce/ledger?accountId=promoter&from=2026-09-01&to=2026-09-30`);
    assert.equal(ledger.status, 409);
    const rate = await fetch(`${baseUrl}/api/admin/user-commerce/settlement-rate`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ratePercent: 15, effectiveAt: "2026-09-11" })
    });
    assert.equal(rate.status, 200);
    assert.deepEqual(await rate.json(), { ratePercent: 15, effectiveAt: "2026-09-11", availableRewardCoins: "12" });
    const clawback = await fetch(`${baseUrl}/api/admin/user-commerce/reward-clawbacks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId: "promoter", coins: "5", reason: "重复发放" })
    });
    assert.equal(clawback.status, 200);
    assert.equal((await clawback.json()).clawbackRef, "clawback_0123456789abcdef0123456789abcdef");
  });
  assert.equal(calls[0][0], "orders");
  assert.deepEqual({ ...calls[0][1] }, { accountId: "customer", from: "2026-09-01", to: "2026-09-30" });
  assert.deepEqual(calls[1], ["rate", { ratePercent: 15, effectiveAt: "2026-09-11" }]);
  assert.deepEqual(calls[2], ["clawback", { accountId: "promoter", coins: "5", reason: "重复发放" }]);
});
