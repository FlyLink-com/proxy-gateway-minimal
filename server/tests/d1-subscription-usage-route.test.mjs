import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { subscriptionRoutes } from "../routes/subscription.mjs";
import { createD1ReadClient } from "../services/platform/d1-read-client.mjs";
import { listen } from "./helpers/listen.mjs";

const tenant = { id: "s2s-tenant", status: "active", expiresAt: "2027-01-01T00:00:00Z" };
const binding = {
  tenantRef: tenant.id, requestId: "s2s-request", accountId: "s2s-account",
  entitlementId: "s2s-entitlement", edgeCredentialRef: "s2s-credential", linkId: "s2s-link",
  requestStatus: "issued", entitlementStatus: "active", plan: "monthly",
  trafficLimitBytes: 5000, validFrom: "2026-11-01T00:00:00.000Z", validUntil: tenant.expiresAt
};
const header = (up, down) =>
  `upload=${up}; download=${down}; total=5000; expire=${Date.parse(tenant.expiresAt) / 1000}`;
const pathList = ["/sub/clash.yaml?token=synthetic", "/sub/a/synthetic",
  "/sub/a/synthetic/profile.yaml", "/sub/a/synthetic/provider.yaml"];

async function fixture(t, { enabled = true, available = true, samples = false, mode = "ok" } = {}) {
  let remoteReads = 0, aborted = false, sampleFilters;
  const client = createD1ReadClient({
    accountId: "synthetic-account", databaseId: "synthetic-db", token: "synthetic-token",
    fetchImpl: async (_url, { body, signal }) => {
      remoteReads++;
      const { sql } = JSON.parse(body);
      if (mode === "timeout") {
        await new Promise((_, reject) => signal.addEventListener("abort", () => {
          aborted = true;
          reject(signal.reason);
        }, { once: true }));
      }
      if (mode === "error") throw new Error("synthetic read unavailable");
      const rows = mode === "missing" ? [] : sql.includes("binding")
        ? [{ ...binding, ...(mode === "drift" ? { plan: "annual" } : {}),
            ...(mode === "partial" ? { entitlementStatus: null } : {}) }]
        : [{ ...binding, uploadBytes: 42, downloadBytes: 88,
            ...(mode === "wrong-rollup" ? { requestId: "s2s-other-request" } : {}) }];
      return new Response(JSON.stringify({ success: true, result: [{ results: rows }] }));
    },
    sleepImpl: async () => assert.fail("request-path D1 read must not retry")
  });
  const controlStore = {
    d1SubscriptionUsageReadAvailable: available,
    findUsageBindingByTenantRef: ref => ref === tenant.id ? binding : null,
    getUsageRollupByEdgeCredentialRef: () => ({ uploadBytes: 7, downloadBytes: 11 }),
    findUsageBindingByTenantRefAsync: (ref, options) =>
      client.queryOne("select binding from fixture", [ref], options),
    getUsageRollupByEdgeCredentialRefAsync: (ref, options) =>
      client.queryOne("select rollup from fixture", [ref], options),
    ...(samples ? { listUsageSamples: filters => {
      sampleFilters = filters;
      return [{ uploadBytes: 19, downloadBytes: 31 }];
    } } : {})
  };
  const proxyConfig = {
    servers: [{ name: "synthetic-node", host: "192.0.2.1",
      port: 12345, method: "aes-256-gcm", password: "synthetic-only" }]
  };
  const resolve = () => ({ ok: true, tenant, proxyConfig });
  const app = express();
  app.use(subscriptionRoutes({
    platform: { controlStore, usageNowFn: () => new Date("2026-11-26T00:00:00Z") },
    subscriptions: { core: { resolveSubscriptionToken: resolve, resolveSubscriptionArtifact: resolve } }
  }, { d1UsageRead: enabled }));
  const { server, baseUrl } = await listen(app);
  t.after(() => { server.closeAllConnections(); server.close(); });
  return {
    async check(path, expected) {
      const response = await fetch(baseUrl + path);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("subscription-userinfo"), expected);
      if (path.endsWith("/profile.yaml")) assert.match(await response.text(), /proxy-providers:/);
      else assert.match(await response.text(), /synthetic-node/);
    },
    remoteReads: () => remoteReads,
    aborted: () => aborted,
    sampleFilters: () => sampleFilters
  };
}

test("D1 opt-in uses matching usage reads through all four HTTP subscription routes", async t => {
  const f = await fixture(t);
  for (const path of pathList) await f.check(path, header(42, 88));
  assert.equal(f.remoteReads(), 8);
});

test("default-off and unconfigured D1 preserve local usage without a D1 request", async t => {
  for (const settings of [{ enabled: false }, { available: false }]) {
    const f = await fixture(t, settings);
    await f.check(pathList[0], header(7, 11));
    assert.equal(f.remoteReads(), 0);
  }
});

test("missing data or transport failure falls back to complete local usage", async t => {
  for (const mode of ["missing", "error"]) {
    const f = await fixture(t, { mode });
    await f.check(pathList[2], header(7, 11));
    assert.equal(f.remoteReads(), mode === "missing" ? 2 : 1);
  }
});

test("partial D1 binding or unrelated rollup cannot supply subscription usage", async t => {
  for (const mode of ["partial", "wrong-rollup"]) {
    const f = await fixture(t, { mode });
    await f.check(pathList[0], header(7, 11));
    assert.equal(f.remoteReads(), 2);
  }
});

test("whole-route deadline aborts the optional D1 request and serves the local header and YAML", async t => {
  const f = await fixture(t, { mode: "timeout" });
  await f.check(pathList[3], header(7, 11));
  assert.equal(f.remoteReads(), 1);
  assert.equal(f.aborted(), true);
});

test("cycle-scoped BWH samples keep their established semantics and reject D1 binding drift", async t => {
  for (const mode of ["ok", "drift"]) {
    const f = await fixture(t, { samples: true, mode });
    await f.check(pathList[1], header(19, 31));
    assert.equal(f.remoteReads(), 1, "never substitute a cumulative D1 rollup for cycle samples");
    assert.deepEqual(f.sampleFilters(), {
      requestId: binding.requestId, observedFrom: "2026-11-01T00:00:00.000Z",
      observedTo: "2026-12-01T00:00:00.000Z"
    });
  }
});
