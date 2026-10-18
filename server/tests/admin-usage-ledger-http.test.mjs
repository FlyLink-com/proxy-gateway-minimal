import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { request } from "node:http";
import express from "express";
import { createApp } from "../app.mjs";
import { adminUserMonitorRoutes } from "../routes/admin-user-monitor.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { readAdminUsageLedger } from "../services/platform/admin-usage-ledger-query.mjs";
import { listen } from "./helpers/listen.mjs";

const PATH = "/api/admin/platform/user-monitor/usage-ledger-summary";
const CUTOFF = "2026-10-18T12:00:00.000Z";
const COOKIE = { Cookie: "gcc_admin_session=synthetic-valid" };

async function fixture(t, { reader, capabilities, authEnabled = true, routerOnly = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "admin-ledger-http-"));
  const dbPath = join(directory, "control.sqlite");
  const store = createSqliteSubscriptionControlStore({ dbPath });
  const platform = {
    controlStore: store, adminUsageLedger: reader,
    adminAuthRoutesEnabled: authEnabled,
    adminAuth: {
      sessionStatus: () => ({ authenticated: false }),
      authenticateCookie: ({ cookieHeader }) => cookieHeader === COOKIE.Cookie ? {
        sessionRef: "synthetic-session", operatorRef: "portal_user_20260604_001",
        authMethod: "totp", status: "active", issuedAt: "2026-10-18T00:00:00.000Z",
        expiresAt: "2026-10-19T00:00:00.000Z"
      } : null
    }
  };
  const state = {
    rootDir: fileURLToPath(new URL("../../", import.meta.url)), host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 }, consoleToken: "synthetic-console",
    proxyConfig: { servers: [], pingHosts: [], nginx: {} },
    services: { ssLocal: { status: () => ({ running: false }) }, httpProxy: { status: () => ({ running: false }) } },
    subscriptions: { service: { listTenants: () => [] } }, platform,
    security: { adminAllowedCidrs: ["127.0.0.1/32"], subRateLimit: { windowMs: 60000, max: 30 } },
    isPortListening: async () => false,
    runCommand: async () => ({ ok: true, stdout: "", stderr: "", code: 0, timedOut: false })
  };
  let app;
  if (routerOnly) {
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      if (capabilities) req.adminPrincipal = { capabilities };
      next();
    });
    app.use(adminUserMonitorRoutes(state));
  } else app = createApp(state);
  const { server, baseUrl } = await listen(app);
  t.after(async () => {
    reader?.close?.();
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return { baseUrl, platform, dbPath, store };
}

for (const authEnabled of [true, false]) {
  test(`ledger denies anonymous and bearer-only before reading (Admin session enabled=${authEnabled})`, async (t) => {
    let calls = 0;
    const { baseUrl } = await fixture(t, { authEnabled, reader: { read: async () => { calls++; } } });
    for (const headers of [{}, { Authorization: "Bearer synthetic-console" }]) {
      const response = await fetch(baseUrl + PATH, { headers });
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("cache-control"), "no-store");
      await response.text();
    }
    assert.equal(calls, 0);
  });
}

for (const capabilities of [undefined, [], ["users.read"], ["runtime.read"]]) {
  test(`ledger requires both capabilities: ${JSON.stringify(capabilities)}`, async (t) => {
    let calls = 0;
    const { baseUrl } = await fixture(t, { routerOnly: true, capabilities, reader: { read: async () => { calls++; } } });
    const response = await fetch(baseUrl + PATH);
    assert.equal(response.status, capabilities ? 403 : 401);
    assert.equal(response.headers.get("cache-control"), "no-store");
    await response.text();
    assert.equal(calls, 0);
  });
}

test("ledger rejects query and GET bodies and never scans for HEAD or other methods", async (t) => {
  let calls = 0;
  const { baseUrl } = await fixture(t, {
    routerOnly: true, capabilities: ["users.read", "runtime.read"],
    reader: { read: async () => { calls++; return {}; } }
  });
  for (const query of ["?dbPath=secret", "?sql=select", "?cutoff=bad", "?scanLimit=1", "?x=1&x=2", "?x[y]=1"]) {
    const response = await fetch(baseUrl + PATH + query);
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { error: "invalid_query" });
  }
  for (const method of ["HEAD", "POST", "PUT", "DELETE", "PATCH"]) {
    const response = await fetch(baseUrl + PATH, { method });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "GET");
    assert.equal(response.headers.get("cache-control"), "no-store");
    await response.text();
  }
  const bodyStatus = await new Promise((resolve, reject) => {
    const req = request(baseUrl + PATH, { method: "GET", headers: { "Content-Length": "2", "Content-Type": "application/json" } }, (res) => {
      res.resume(); res.on("end", () => resolve(res.statusCode));
    });
    req.on("error", reject); req.end("{}");
  });
  assert.equal(bodyStatus, 400);
  assert.equal((await fetch(baseUrl + PATH + "/extra")).status, 404);
  assert.equal(calls, 0);
});

test("ledger absent binding and raw reader failures remain generic no-store 503", async (t) => {
  const { baseUrl, platform } = await fixture(t);
  for (const reader of [undefined, { read() { throw new Error("secret-path-and-account"); } }, { async read() { throw { code: "SQLITE_ERROR", message: "secret-path-and-account" }; } }]) {
    platform.adminUsageLedger = reader;
    const response = await fetch(baseUrl + PATH, { headers: COOKIE });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { error: "source_unavailable" });
  }
});

test("real Admin cookie returns aggregate DTO and does not accept caller cutoff", async (t) => {
  const { baseUrl, platform, dbPath } = await fixture(t);
  let calls = 0;
  platform.adminUsageLedger = { read: async (options) => {
    calls++;
    assert.deepEqual(Object.keys(options), ["signal"]);
    assert.ok(options.signal instanceof AbortSignal);
    return readAdminUsageLedger({ dbPath, cutoff: CUTOFF });
  } };
  const response = await fetch(baseUrl + PATH, { headers: COOKIE });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const result = await response.json();
  assert.equal(result.cutoff, CUTOFF);
  assert.equal(result.windows.length, 4);
  assert.ok(result.windows.every((window) => window.to === CUTOFF && window.state === "not_collected"));
  assert.equal(result.reconciliation.state, "totals_match");
  assert.equal(JSON.stringify(result).includes(dbPath), false);
  assert.equal(calls, 1);
});

test("disconnected HTTP request aborts the reader without another response", { timeout: 5000 }, async (t) => {
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  let aborted;
  const cancelled = new Promise((resolve) => { aborted = resolve; });
  const { baseUrl } = await fixture(t, { reader: { read: ({ signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => { aborted(); reject(new Error("synthetic-abort")); }, { once: true });
    entered();
  }) } });
  const req = request(baseUrl + PATH, { headers: COOKIE });
  req.on("error", () => {}); req.end();
  await started;
  req.destroy();
  await cancelled;
});

test("real app session reaches a child-process read of application-written SQLite aggregates", async (t) => {
  const { createAdminUsageLedgerReader } = await import("../services/platform/admin-usage-ledger-reader.mjs");
  const { baseUrl, platform, dbPath, store } = await fixture(t);
  const at = "2026-10-18T11:59:00.000Z";
  store.createAccount({ id: "synthetic-http-account", ownerRef: "synthetic-private-owner", status: "active", createdAt: at, updatedAt: at });
  store.createEntitlement({
    id: "synthetic-http-entitlement", accountId: "synthetic-http-account", plan: "monthly", status: "active",
    validFrom: at, validUntil: "2026-11-18T00:00:00.000Z", createdAt: at, updatedAt: at
  });
  store.createIssuanceRequest({
    id: "synthetic-http-request", accountId: "synthetic-http-account", entitlementId: "synthetic-http-entitlement",
    approvalRef: "synthetic-approval", status: "issued", quantity: 1, nodeId: "synthetic-node", purpose: "access",
    requestedByRef: "synthetic-operator", createdAt: at, updatedAt: at
  });
  const record = (id, up) => store.recordUsageSample({
    id, accountId: "synthetic-http-account", entitlementId: "synthetic-http-entitlement", requestId: "synthetic-http-request",
    edgeCredentialRef: "synthetic-private-material", sourceRef: "synthetic-private-source", channelRef: "synthetic-private-channel",
    observedAt: at, intervalStartedAt: at, intervalEndedAt: at, uploadBytes: up, downloadBytes: 38,
    sampleDigest: `sha256:${id}`, createdAt: at
  });
  record("synthetic-http-sample-1", 4);
  const reader = createAdminUsageLedgerReader({ dbPath, nowFn: () => new Date(CUTOFF) });
  t.after(() => reader.close());
  platform.adminUsageLedger = reader;
  const response = await fetch(baseUrl + PATH, { headers: COOKIE });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.deepEqual(body, readAdminUsageLedger({ dbPath, cutoff: CUTOFF }));
  assert.equal(body.windows[0].totalBytes, "42");
  assert.equal(body.windows[0].sources[5].totalBytes, "42");
  assert.equal(body.windows[0].positiveAccountCount, 1);
  assert.equal(body.reconciliation.samples.totalBytes, "42");
  assert.equal(body.reconciliation.rollups.totalBytes, "42");
  for (const forbidden of [dbPath, "synthetic-http-account", "synthetic-private", "synthetic-http-request"]) {
    assert.equal(JSON.stringify(body).includes(forbidden), false);
  }
  record("synthetic-http-sample-2", 3);
  const second = await fetch(baseUrl + PATH, { headers: COOKIE });
  assert.equal(second.status, 200);
  assert.equal((await second.json()).windows[0].totalBytes, "83");
  const detailQuery = new URLSearchParams({ from: "2026-10-17T00:00:00.000Z", to: "2026-10-19T00:00:00.000Z" });
  const detail = await fetch(`${baseUrl}/api/admin/platform/user-monitor/accounts/synthetic-http-account/traffic?${detailQuery}`, { headers: COOKIE });
  assert.equal(detail.status, 200);
  const detailBody = await detail.json();
  assert.equal(detailBody.totalBytes, 83);
  assert.equal(detailBody.sampleCount, 2);
});
