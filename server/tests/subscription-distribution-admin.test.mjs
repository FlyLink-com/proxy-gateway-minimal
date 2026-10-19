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

async function fixture(t, { enabled = true, available = true, role = "admin", failure } = {}) {
  const calls = [];
  const snapshot = { revision: REVISION, owned: { enabled: true, items: [] }, routes: ROUTES, candidates: [] };
  const store = {
    getSnapshot() { calls.push("read"); if (failure) throw failure; return snapshot; },
    writeRoutes(body) { calls.push(["routes", body]); if (failure) throw failure; return snapshot; },
    writeOwned(body) { calls.push(["owned", body]); if (failure) throw failure; return snapshot; }
  };
  const state = { platform: { adminAuthRoutesEnabled: true, adminAuth: {} }, subscriptionDistribution: { enabled, available, store } };
  const app = express();
  app.use(express.json({ strict: false }));
  app.use((req, _res, next) => { if (role !== null) req.adminPrincipal = { role }; next(); });
  app.use(adminSubscriptionDistributionRoutes(state));
  const { server, baseUrl } = await listen(app);
  t.after(() => { server.closeAllConnections(); server.close(); });
  async function request(method = "GET", body, suffix = "") {
    const response = await fetch(`${baseUrl}${ROOT}${suffix}`, {
      method, headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const raw = await response.text();
    return { response, raw, body: JSON.parse(raw) };
  }
  return { calls, snapshot, request };
}

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
      platform: { adminAuthRoutesEnabled: true, adminAuth: auth, adminRole: role },
      subscriptionDistribution: { enabled: true, available: true, store: {
        getSnapshot() { calls += 1; return result; },
        writeRoutes() { calls += 1; return result; },
        writeOwned() { calls += 1; return result; }
      } },
      isPortListening: async () => false,
      runCommand: async () => ({ ok: true, stdout: "", stderr: "", code: 0, timedOut: false })
    };
    const { server, baseUrl } = await listen(createApp(state));
    try {
      for (const [method, suffix, body] of [["GET", ""], ["PUT", "", { revision: REVISION, routes: ROUTES }], ["PUT", "/owned", { revision: REVISION, enabled: true, nodes: [] }]]) {
        const response = await fetch(`${baseUrl}${ROOT}${suffix}`, {
          method, headers: { "content-type": "application/json", ...(cookieHeader ? { cookie: cookieHeader } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {})
        });
        assert.equal(response.status, expected);
        assert.equal(response.headers.get("cache-control"), "no-store");
        await response.arrayBuffer();
      }
      assert.equal(calls, expected === 200 ? 3 : 0);
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
