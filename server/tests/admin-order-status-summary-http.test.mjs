import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import express from "express";
import Database from "better-sqlite3";
import { createApp } from "../app.mjs";
import { adminOrderStatusSummaryRoutes } from "../routes/admin-order-status-summary.mjs";
import { createAdminOrderStatusSummaryService } from "../services/platform/admin-order-status-summary.mjs";
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
import { applyPaymentStoreMigrations } from "../services/platform/payment-store-migrations.mjs";
import { listen } from "./helpers/listen.mjs";

const NOW = "2026-10-24T00:00:00.000Z";
const PATH = "/api/admin/operations/order-status-summary";
const WINDOW = `${PATH}?from=2026-10-01T00:00:00.000Z&to=2026-10-08T00:00:00.000Z`;

function baseState(platform = {}) {
  return {
    rootDir: new URL("../../", import.meta.url).pathname,
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
    platform,
    isPortListening: async () => false,
    runCommand: async () => ({ ok: true, stdout: "", stderr: "", code: 0, timedOut: false })
  };
}

function sessionAuth() {
  return {
    sessionStatus: () => ({ authenticated: false }),
    authenticateCookie: ({ cookieHeader }) => (
      String(cookieHeader || "").includes("gcc_admin_session=valid")
        ? {
          sessionRef: "admin_session_order_status_1",
          operatorRef: "portal_user_20260604_001",
          authMethod: "totp",
          status: "active",
          issuedAt: "2026-10-24T00:00:00.000Z",
          expiresAt: "2026-10-24T01:00:00.000Z"
        }
        : null
    )
  };
}

function appWith(platform, capabilities) {
  const app = express();
  app.use((req, _res, next) => {
    if (capabilities) req.adminPrincipal = { capabilities };
    next();
  });
  app.use(adminOrderStatusSummaryRoutes({ platform }));
  return app;
}

async function withServer(app, fn) {
  const { server, baseUrl } = await listen(app);
  try {
    return await fn(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function migrate(db) {
  db.pragma("foreign_keys = ON");
  db.exec(`create table platform_accounts(
    id text primary key, owner_ref text not null, status text not null,
    created_at text not null, updated_at text not null, metadata_json text not null default '{}')`);
  applyCoinWalletMigrations({
    database: db,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(NOW)
  });
  applyPaymentStoreMigrations({ database: db, nowFn: () => NOW });
  applyCoinCommerceMigrations({
    database: db,
    expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(NOW)
  });
}

test("authorization off does not register the order summary route", async () => {
  let calls = 0;
  const platform = {
    adminAuthorizationEnabled: false,
    adminOrderStatusSummary: {
      readSummary() {
        calls += 1;
        return { schemaVersion: "operations-order-status-summary/v1" };
      }
    }
  };
  await withServer(createApp(baseState(platform)), async (baseUrl) => {
    const response = await fetch(`${baseUrl}${PATH}`, {
      headers: { authorization: "Bearer console-secret" }
    });
    assert.equal(response.status, 404);
    const body = await response.text();
    assert.equal(body.includes("operations-order-status-summary"), false);
    assert.equal(body.includes("orderAmountMinorTotal"), false);
  });
  await withServer(createApp(baseState({
    ...platform,
    adminAuthorizationEnabled: 1
  })), async (baseUrl) => {
    const response = await fetch(`${baseUrl}${PATH}`, {
      headers: { authorization: "Bearer console-secret" }
    });
    assert.equal(response.status, 404);
  });
  assert.equal(calls, 0);
});

test("the route requires an Admin session and operations.read before reading", async () => {
  const calls = [];
  const platform = {
    adminAuthorizationEnabled: true,
    adminAuthRoutesEnabled: true,
    adminAuth: sessionAuth(),
    adminOrderStatusSummary: {
      readSummary(query) {
        calls.push(query);
        const error = new Error("source_unavailable");
        error.code = "source_unavailable";
        throw error;
      }
    }
  };
  await withServer(createApp(baseState(platform)), async (baseUrl) => {
    const anonymous = await fetch(`${baseUrl}${PATH}`);
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.headers.get("cache-control"), "no-store");
    assert.deepEqual(await anonymous.json(), { error: "admin_authentication_required" });

    const consoleToken = await fetch(`${baseUrl}${PATH}`, {
      headers: { authorization: "Bearer console-secret" }
    });
    assert.equal(consoleToken.status, 401);
    assert.deepEqual(await consoleToken.json(), { error: "admin_authentication_required" });

    const unavailable = await fetch(`${baseUrl}${WINDOW}`, {
      headers: { cookie: "gcc_admin_session=valid" }
    });
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.headers.get("cache-control"), "no-store");
    assert.deepEqual(await unavailable.json(), { error: "source_unavailable" });
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].from, "2026-10-01T00:00:00.000Z");
  assert.equal(calls[0].to, "2026-10-08T00:00:00.000Z");

  await withServer(appWith(platform, ["users.read", "wallet.read"]), async (baseUrl) => {
    const denied = await fetch(`${baseUrl}${PATH}`);
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get("cache-control"), "no-store");
    assert.deepEqual(await denied.json(), {
      error: "admin_capability_required",
      capability: "operations.read"
    });
  });
  assert.equal(calls.length, 1);
});

test("invalid queries and a missing source stay errors instead of empty totals", async () => {
  const db = new Database(":memory:");
  const service = createAdminOrderStatusSummaryService({
    database: db,
    nowFn: () => new Date(NOW)
  });
  const platform = {
    adminAuthorizationEnabled: true,
    adminOrderStatusSummary: service
  };
  try {
    await withServer(appWith(platform, ["operations.read"]), async (baseUrl) => {
      const invalid = await fetch(`${baseUrl}${PATH}?from=2026-10-01T00:00:00.000Z`);
      assert.equal(invalid.status, 400);
      assert.equal(invalid.headers.get("cache-control"), "no-store");
      assert.deepEqual(await invalid.json(), { error: "invalid_query" });

      for (const from of [
        "2026-13-01T00:00:00.000Z",
        "2026-10-01T25:00:00.000Z",
        "2026-02-30T00:00:00.000Z"
      ]) {
        const impossible = await fetch(
          `${baseUrl}${PATH}?from=${encodeURIComponent(from)}&to=2026-10-08T00:00:00.000Z`
        );
        assert.equal(impossible.status, 400, from);
        assert.equal(impossible.headers.get("cache-control"), "no-store");
        assert.deepEqual(await impossible.json(), { error: "invalid_query" });
      }

      const missing = await fetch(`${baseUrl}${WINDOW}`);
      assert.equal(missing.status, 503);
      assert.equal(missing.headers.get("cache-control"), "no-store");
      const body = await missing.json();
      assert.deepEqual(body, { error: "source_unavailable" });
      assert.equal(Object.hasOwn(body, "rechargeOrders"), false);
      assert.equal(Object.hasOwn(body, "coinCommerceOrders"), false);
    });
  } finally {
    db.close();
  }
});

test("createApp returns the aggregate only for an operations.read session", async () => {
  const directory = mkdtempSync(join(tmpdir(), "order-status-summary-http-"));
  const dbPath = join(directory, "control.sqlite");
  const db = new Database(dbPath);
  migrate(db);
  const digest = "cd".repeat(32);
  db.prepare(`
    insert into platform_accounts (
      id, owner_ref, status, created_at, updated_at, metadata_json
    ) values ('acct_sentinel_http', 'owner_http', 'active', ?, ?, ?)
  `).run(NOW, NOW, JSON.stringify({ email: "sentinel.user@example.test" }));
  db.prepare(`
    insert into platform_payment_orders (
      payment_order_ref, account_id, offer_ref, create_idempotency_key,
      create_request_digest, quote_version, expected_paid_coin_units,
      amount_minor, currency, currency_exponent, quote_digest,
      adapter_key, payment_method, merchant_binding_ref, status,
      latest_receipt_ref, wallet_operation_ref, wallet_lot_ref, provider_order_ref,
      expires_at, created_at, updated_at
    ) values (
      'pay_order_sentinel_http', 'acct_sentinel_http', 'offer_sentinel', 'idem_http',
      ?, 1, 1, 64, 'USD', 2, ?,
      'adapter_sentinel', 'method_sentinel', 'merchant_sentinel', 'payment_verified',
      null, null, null, null,
      '2026-12-01T00:00:00.000Z', '2026-10-03T00:00:00.000Z', '2026-10-03T00:00:00.000Z'
    )
  `).run(digest, digest);
  db.close();

  const state = baseState({
    adminAuthorizationEnabled: true,
    adminAuthRoutesEnabled: true,
    adminAuth: sessionAuth(),
    adminOrderStatusSummary: createAdminOrderStatusSummaryService({
      dbPath,
      nowFn: () => new Date(NOW)
    })
  });
  try {
    await withServer(createApp(state), async (baseUrl) => {
      const response = await fetch(`${baseUrl}${WINDOW}`, {
        headers: { cookie: "gcc_admin_session=valid" }
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const body = await response.json();
      assert.equal(body.schemaVersion, "operations-order-status-summary/v1");
      assert.equal(body.data.definition, "current_status_of_orders_created_in_window");
      assert.deepEqual(body.data.rechargeOrders.groups, [{
        status: "payment_verified",
        currency: "USD",
        currencyExponent: 2,
        orderCount: 1,
        orderAmountMinorTotal: 64
      }]);
      assert.deepEqual(body.data.coinCommerceOrders.groups, []);
      const encoded = JSON.stringify(body);
      assert.equal(encoded.includes("acct_sentinel_http"), false);
      assert.equal(encoded.includes("pay_order_sentinel_http"), false);
      assert.equal(encoded.includes("sentinel.user@example.test"), false);
      assert.equal(encoded.includes("revenue"), false);
      assert.equal(encoded.includes("credited"), false);
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
