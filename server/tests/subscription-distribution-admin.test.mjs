import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { adminSubscriptionDistributionRoutes } from "../routes/admin-subscription-distribution.mjs";
import { createApp } from "../app.mjs";
import { createAdminAuthService } from "../services/platform/admin-auth.mjs";
import { listen } from "./helpers/listen.mjs";

const ROOT = "/api/admin/third-party-subscriptions/distribution";
const REVISION = "a".repeat(64);
const ROUTES = ["monthly_basic", "monthly_plus", "yearly"].map((planId) => ({ planId, mode: "owned", nodeIds: [] }));

async function fixture(t, { enabled = true, available = true, role = "admin", failure, supply, authEnabled = true } = {}) {
  const calls = [];
  const snapshot = { revision: REVISION, owned: { enabled: true, items: [] }, routes: ROUTES, candidates: [] };
  const store = {
    getSnapshot() { calls.push("read"); if (failure) throw failure; return snapshot; },
    writeRoutes(body) { calls.push(["routes", body]); if (failure) throw failure; return snapshot; },
    writeOwned(body) { calls.push(["owned", body]); if (failure) throw failure; return snapshot; }
  };
  const state = { platform: { adminAuthRoutesEnabled: authEnabled, adminAuth: {}, adminBrowserOrigin: "https://admin.example.test" }, subscriptionDistribution: { enabled, available, store, ...(supply ? { supply } : {}) } };
  const app = express();
  app.use(express.json({ strict: false }));
  app.use((req, _res, next) => { if (role !== null) req.adminPrincipal = { role }; next(); });
  app.use(adminSubscriptionDistributionRoutes(state));
  const { server, baseUrl } = await listen(app);
  t.after(() => { server.closeAllConnections(); server.close(); });
  async function request(method = "GET", body, suffix = "", headers = {}) {
    const response = await fetch(`${baseUrl}${ROOT}${suffix}`, {
      method, headers: { "content-type": "application/json", ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const raw = await response.text();
    return { response, raw, body: JSON.parse(raw) };
  }
  return { calls, snapshot, request };
}

test("BWH supply controls require session role, exact Origin, strict request and return verified full snapshot", async t => {
  let writes = 0;
  let enabled = true;
  const supplyRevision = "b".repeat(64);
  const supply = {
    read() { return { revision: supplyRevision, state: enabled ? "enabled" : "paused", protocolsRunning: enabled ? 3 : 0,
      collectorState: enabled ? "running" : "paused", nativeDistributionEnabled: enabled,
      observedAt: "2026-10-19T00:00:00.000Z", canPause: enabled, canEnable: !enabled }; },
    async setEnabled(input) { assert.deepEqual(input, { revision: REVISION, supplyRevision, enabled: false }); writes += 1; enabled = false; return this.read(); }
  };
  const f = await fixture(t, { supply });
  assert.equal((await f.request()).body.bwhSupply.state, "enabled");
  const input = { revision: REVISION, supplyRevision, enabled: false };
  for (const origin of [undefined, "https://evil.test"]) {
    assert.equal((await f.request("PUT", input, "/supply", origin ? { Origin: origin } : {})).response.status, 403);
  }
  for (const body of [{ ...input, unit: "nginx.service" }, { ...input, enabled: "false" }, { ...input, supplyRevision: "invalid" }]) {
    assert.equal((await f.request("PUT", body, "/supply", { Origin: "https://admin.example.test" })).response.status, 400);
  }
  assert.equal(writes, 0);
  const accepted = await f.request("PUT", input, "/supply", { Origin: "https://admin.example.test" });
  assert.equal(accepted.response.status, 200);
  assert.equal(accepted.response.headers.get("cache-control"), "no-store");
  assert.equal(accepted.body.bwhSupply.state, "paused");
  assert.equal(accepted.body.revision, REVISION);
  assert.equal(accepted.body.bwhSupply.nativeDistributionEnabled, false);
  assert.equal(writes, 1);
  const legacy = await fixture(t, { authEnabled: false, supply });
  assert.equal((await legacy.request("PUT", input, "/supply", { Origin: "https://admin.example.test" })).response.status, 403);
  assert.equal(writes, 1);
});

test("BWH supply failures are sanitized and never claim a paused state", async t => {
  const f = await fixture(t, { supply: { read: () => ({ state: "unavailable" }), async setEnabled() {
    throw Object.assign(new Error("private-host-secret"), { code: "bwh_supply_unavailable" });
  } } });
  const response = await f.request("PUT", { revision: REVISION, supplyRevision: "b".repeat(64), enabled: false }, "/supply", { Origin: "https://admin.example.test" });
  assert.equal(response.response.status, 503);
  assert.equal(response.raw.includes("private-host-secret"), false);
  assert.equal(response.body.state, undefined);
});

test("distribution Admin read and writes return no-store snapshots", async (t) => {
  const f = await fixture(t);
  for (const args of [["GET"], ["PUT", { revision: REVISION, routes: ROUTES }], ["PUT", { revision: REVISION, enabled: true, nodes: [] }, "/owned"]]) {
    const result = await f.request(...args);
    assert.equal(result.response.status, 200);
    assert.equal(result.response.headers.get("cache-control"), "no-store");
    assert.deepEqual(result.body, f.snapshot);
  }
  assert.equal(f.calls.length, 3);
});

for (const role of [null, "viewer", "invalid", "operator"]) {
  test(`distribution Admin rejects role ${role} before accessing policy`, async (t) => {
    const f = await fixture(t, { role });
    for (const args of [["GET"], ["PUT", { revision: REVISION, routes: ROUTES }], ["PUT", { revision: REVISION, enabled: true, nodes: [] }, "/owned"]]) {
      const result = await f.request(...args);
      assert.equal(result.response.status, 403);
      assert.equal(result.response.headers.get("cache-control"), "no-store");
    }
    assert.equal(f.calls.length, 0);
  });
}

for (const options of [{ enabled: false }, { available: false }]) {
  test(`disabled or unavailable distribution is explicit ${JSON.stringify(options)}`, async (t) => {
    const f = await fixture(t, options);
    const result = await f.request();
    assert.equal(result.response.status, 503);
    assert.deepEqual(result.body, { error: "distribution_unavailable" });
    assert.equal(f.calls.length, 0);
  });
}

test("distribution routes reject unknown keys and bounded malformed lists before store writes", async (t) => {
  const f = await fixture(t);
  for (const body of [null, [], {}, { revision: REVISION, routes: ROUTES, host: "private-marker" },
    { revision: "bad", routes: ROUTES }, { revision: REVISION, routes: ROUTES.map((route) => ({ ...route, password: "private-marker" })) },
    { revision: REVISION, routes: [{ planId: "monthly_basic", mode: "third-party", nodeIds: Array(257).fill("tpnode_" + "1".repeat(32)) }] }]) {
    assert.equal((await f.request("PUT", body)).response.status, 400);
  }
  for (const body of [{ revision: REVISION, enabled: "yes", nodes: [] },
    { revision: REVISION, enabled: true, nodes: [{ id: "ownnode_" + "1".repeat(32), enabled: true, customName: null, customCountryCode: null, password: "private-marker" }] },
    { revision: REVISION, enabled: true, nodes: Array(257).fill({}) }]) {
    assert.equal((await f.request("PUT", body, "/owned")).response.status, 400);
  }
  assert.equal(f.calls.length, 0);
});

test("distribution failures expose fixed classification and never exception text", async (t) => {
  for (const [code, expected] of [["revision_conflict", 409], ["invalid_input", 400], ["distribution_unavailable", 503], ["SQLITE-private-marker", 503]]) {
    const f = await fixture(t, { failure: Object.assign(new Error("private-marker"), { code }) });
    const result = await f.request("PUT", { revision: REVISION, routes: ROUTES });
    assert.equal(result.response.status, expected);
    assert.equal(result.raw.includes("private-marker"), false);
    assert.equal(result.response.headers.get("cache-control"), "no-store");
    assert.equal(f.calls.length, 1);
  }
});

test("real application enforces session, CIDR and Admin role on all distribution operations", async (t) => {
  const auth = createAdminAuthService({
    bootstrapToken: "synthetic-bootstrap-distribution",
    sessionSecret: "synthetic-distribution-session-signing-key",
    operatorRef: "synthetic-operator", sessionTtlSeconds: 60,
    nowFn: () => "2026-10-19T00:00:00Z", totpSecretFactory: () => "JBSWY3DPEHPK3PXP",
    totpVerifier: ({ code }) => code === "123456"
  });
  const enrollment = auth.startBootstrap({ bootstrapToken: "synthetic-bootstrap-distribution" });
  const verified = auth.confirmTotpEnrollment({ enrollmentRef: enrollment.enrollment.enrollmentRef, code: "123456" });
  const cookie = verified.sessionCookie.split(";")[0];
  for (const [role, cidrs, cookieHeader, expected] of [
    ["admin", ["127.0.0.1/32"], null, 401],
    ["viewer", ["127.0.0.1/32"], cookie, 403],
    ["admin", ["192.0.2.1/32"], cookie, 403],
    ["super_admin", ["127.0.0.1/32"], cookie, 200]
  ]) {
    let calls = 0;
    const result = { revision: REVISION, owned: { enabled: true, items: [] }, routes: ROUTES, candidates: [] };
    const state = {
      rootDir: new URL("../../", import.meta.url).pathname,
      host: "127.0.0.1", ports: { console: 3456, socks: 1080, httpProxy: 18180 }, consoleToken: "synthetic-console-distribution",
      proxyConfig: { servers: [], pingHosts: [], nginx: {} },
      services: { ssLocal: { status: () => ({ running: false }) }, httpProxy: { status: () => ({ running: false }) } },
      security: { adminAllowedCidrs: cidrs },
      platform: { adminAuthRoutesEnabled: true, adminAuth: auth, adminRole: role, adminBrowserOrigin: "https://admin.example.test" },
      subscriptionDistribution: { enabled: true, available: true, store: {
        getSnapshot() { calls += 1; return result; },
        writeRoutes() { calls += 1; return result; },
        writeOwned() { calls += 1; return result; }
      }, supply: { read: () => ({ state: "enabled" }), setEnabled: async () => { calls += 1; return { state: "paused" }; } } },
      isPortListening: async () => false,
      runCommand: async () => ({ ok: true, stdout: "", stderr: "", code: 0, timedOut: false })
    };
    const { server, baseUrl } = await listen(createApp(state));
    try {
      for (const [method, suffix, body] of [["GET", ""], ["PUT", "", { revision: REVISION, routes: ROUTES }], ["PUT", "/owned", { revision: REVISION, enabled: true, nodes: [] }], ["PUT", "/supply", { revision: REVISION, supplyRevision: "b".repeat(64), enabled: false }]]) {
        const response = await fetch(`${baseUrl}${ROOT}${suffix}`, {
          method, headers: { "content-type": "application/json", Origin: "https://admin.example.test", ...(cookieHeader ? { cookie: cookieHeader } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {})
        });
        assert.equal(response.status, expected);
        assert.equal(response.headers.get("cache-control"), "no-store");
        await response.arrayBuffer();
      }
      assert.equal(calls, expected === 200 ? 5 : 0);
    } finally { server.closeAllConnections(); server.close(); }
  }
});

test("real app accepts the bounded 256-node Unicode save only at the owned PUT path", async (t) => {
  let saves = 0;
  const state = {
    rootDir: new URL("../../", import.meta.url).pathname,
    host: "127.0.0.1", ports: { console: 3456, socks: 1080, httpProxy: 18180 }, consoleToken: "synthetic-body-budget",
    proxyConfig: { servers: [], pingHosts: [], nginx: {} },
    services: { ssLocal: { status: () => ({ running: false }) }, httpProxy: { status: () => ({ running: false }) } },
    security: { adminAllowedCidrs: ["127.0.0.1/32"] },
    subscriptionDistribution: { enabled: true, available: true, store: {
      writeOwned(body) { saves += 1; assert.equal(body.nodes.length, 256); return { saved: true }; }
    } }
  };
  const nodes = Array.from({ length: 256 }, (_, index) => ({
    id: `ownnode_${index.toString(16).padStart(32, "0")}`, enabled: true,
    customName: "中".repeat(124) + String(index).padStart(4, "0"), customCountryCode: null
  }));
  const body = JSON.stringify({ revision: REVISION, enabled: true, nodes });
  assert.equal(Buffer.byteLength(body) > 100 * 1024, true);
  assert.equal(Buffer.byteLength(body) < 256 * 1024, true);
  const { server, baseUrl } = await listen(createApp(state));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const send = (path, data) => fetch(`${baseUrl}${path}`, {
    method: "PUT", headers: { "content-type": "application/json", authorization: "Bearer synthetic-body-budget" }, body: data
  });
  const accepted = await send(`${ROOT}/owned`, body);
  assert.equal(accepted.status, 200);
  assert.equal(accepted.headers.get("cache-control"), "no-store");
  await accepted.arrayBuffer();
  assert.equal(saves, 1);
  for (const [path, data] of [[ROOT, body], [`${ROOT}/owned`, JSON.stringify({ marker: "synthetic-only".repeat(25_000) })]]) {
    const rejected = await send(path, data);
    assert.equal(rejected.status, 413);
    assert.equal(rejected.headers.get("cache-control"), "no-store");
    const text = await rejected.text();
    assert.equal(text.includes("synthetic-only"), false);
  }
  assert.equal(saves, 1);
});
