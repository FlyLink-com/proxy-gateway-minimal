import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { createApp } from "../app.mjs";
import { createPortalTotpSecretProtector } from "../services/platform/portal-totp-verifier.mjs";
import {
  REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM,
  REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
  applyThirdPartySubscriptionMigrations
} from "../services/platform/third-party-subscription-migrations.mjs";
import { createSqliteThirdPartySubscriptionStore } from "../services/platform/third-party-subscription-store.mjs";
import { listen } from "./helpers/listen.mjs";

const SECRET_KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
const SOURCE_URL = "https://example.invalid/third-party-source-secret-path";
const SS_HK = "ss://YWVzLTI1Ni1nY206c3ludGhldGljLXBhc3N3b3Jk@203.0.113.10:8388#HK";

function appliedDatabase() {
  const database = new Database(":memory:");
  applyThirdPartySubscriptionMigrations({
    database,
    expectedMigrationId: REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
    expectedDdlChecksum: REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM,
    nowFn: () => new Date("2026-10-10T00:00:00.000Z")
  });
  return database;
}

function textResponse(body) {
  const payload = Buffer.from(body);
  return {
    status: 200,
    headers: new Headers(),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(payload);
        controller.close();
      }
    })
  };
}

function featureState({ enabled = true, fetchFn } = {}) {
  const database = appliedDatabase();
  const secretProtector = createPortalTotpSecretProtector({ key: SECRET_KEY });
  const store = createSqliteThirdPartySubscriptionStore({
    database,
    secretProtector,
    fetchFn: fetchFn || (async () => textResponse(SS_HK)),
    resolveFn: async () => ["203.0.113.8"],
    nowFn: () => new Date("2026-10-10T00:00:00.000Z")
  });
  return {
    rootDir: new URL("../../", import.meta.url).pathname,
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: "secret",
    proxyConfig: { servers: [], pingHosts: [], nginx: {} },
    services: {
      ssLocal: { status: () => ({ running: false }), start: async () => ({ ok: true }), stop: async () => ({ ok: true }) },
      httpProxy: { status: () => ({ running: false }), start: async () => ({ ok: true }), stop: async () => ({ ok: true }) }
    },
    isPortListening: async () => false,
    runCommand: async () => ({ ok: true, stdout: "", stderr: "", code: 0, timedOut: false }),
    thirdPartySubscriptions: {
      enabled,
      available: enabled && store.available,
      store: enabled ? store : null,
      secretProtector
    },
    security: { adminAllowedCidrs: ["127.0.0.1", "::1"] }
  };
}

async function requestJson(baseUrl, path, options = {}) {
  const headers = {
    "content-type": "application/json",
    ...(options.headers ?? {})
  };
  if (options.token !== null) {
    headers.authorization = `Bearer ${options.token ?? "secret"}`;
  }
  const response = await fetch(`${baseUrl}${path}`, {
    headers,
    ...options,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const text = await response.text();
  const isJson = response.headers.get("content-type")?.includes("application/json");
  return {
    response,
    body: text && isJson ? JSON.parse(text) : text,
    raw: text
  };
}

function assertNoSecret(raw) {
  const serialized = typeof raw === "string" ? raw : JSON.stringify(raw);
  assert.equal(serialized.includes("example.invalid"), false);
  assert.equal(serialized.includes("third-party-source-secret-path"), false);
  assert.equal(serialized.includes("synthetic-password"), false);
}

test("admin third-party routes require console auth", async () => {
  const { server, baseUrl } = await listen(createApp(featureState()));
  try {
    const unauth = await requestJson(baseUrl, "/api/admin/third-party-subscriptions/sources", {
      token: null
    });
    assert.equal(unauth.response.status, 401);
    assert.deepEqual(unauth.body, { error: "Unauthorized" });
  } finally {
    server.close();
  }
});

test("flag-off admin import is unavailable", async () => {
  const { server, baseUrl } = await listen(createApp(featureState({ enabled: false })));
  try {
    const created = await requestJson(baseUrl, "/api/admin/third-party-subscriptions/sources", {
      method: "POST",
      body: { name: "x", subscriptionUrl: SOURCE_URL, tiers: ["monthly_basic"] }
    });
    assert.equal(created.response.status, 503);
    assert.deepEqual(created.body, { error: "third_party_unavailable" });
    assertNoSecret(created.raw);
  } finally {
    server.close();
  }
});

test("import validation, allocation PATCH, observation and refresh leak no URL", async () => {
  const logs = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args) => logs.push(args.join(" "));
  console.error = (...args) => logs.push(args.join(" "));
  const { server, baseUrl } = await listen(createApp(featureState()));
  try {
    const nonHttps = await requestJson(baseUrl, "/api/admin/third-party-subscriptions/sources", {
      method: "POST",
      body: { name: "x", subscriptionUrl: "http://example.invalid/x", tiers: ["monthly_basic"] }
    });
    assert.equal(nonHttps.response.status, 400);
    assert.deepEqual(nonHttps.body, { error: "invalid_url" });

    const privateIp = await requestJson(baseUrl, "/api/admin/third-party-subscriptions/sources", {
      method: "POST",
      body: { name: "x", subscriptionUrl: "https://10.0.0.8/x", tiers: ["monthly_basic"] }
    });
    assert.equal(privateIp.response.status, 400);

    const badTiers = await requestJson(baseUrl, "/api/admin/third-party-subscriptions/sources", {
      method: "POST",
      body: { name: "x", subscriptionUrl: SOURCE_URL, tiers: ["trial"] }
    });
    assert.equal(badTiers.response.status, 400);
    assert.deepEqual(badTiers.body, { error: "invalid_tiers" });

    const created = await requestJson(baseUrl, "/api/admin/third-party-subscriptions/sources", {
      method: "POST",
      body: {
        name: "synthetic-source",
        subscriptionUrl: SOURCE_URL,
        tiers: ["monthly_basic"],
        enabled: true
      }
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.name, "synthetic-source");
    assert.deepEqual(created.body.tiers, ["monthly_basic"]);
    assert.equal(Object.hasOwn(created.body, "subscriptionUrl"), false);
    assertNoSecret(created.body);

    const patched = await requestJson(baseUrl, `/api/admin/third-party-subscriptions/sources/${created.body.id}`, {
      method: "PATCH",
      body: { tiers: ["monthly_basic", "yearly"], enabled: true }
    });
    assert.equal(patched.response.status, 200);
    assert.deepEqual(patched.body.tiers, ["monthly_basic", "yearly"]);
    assertNoSecret(patched.body);

    const listed = await requestJson(baseUrl, "/api/admin/third-party-subscriptions/sources");
    assert.equal(listed.response.status, 200);
    assert.equal(listed.body.items.length, 1);
    assertNoSecret(listed.body);

    const refreshed = await requestJson(
      baseUrl,
      `/api/admin/third-party-subscriptions/sources/${created.body.id}/refresh`,
      { method: "POST" }
    );
    assert.equal(refreshed.response.status, 200);
    assert.equal(refreshed.body.ok, true);
    assert.equal(refreshed.body.counts.valid, 1);
    assertNoSecret(refreshed.body);

    const summary = await requestJson(baseUrl, "/api/admin/third-party-subscriptions/summary");
    assert.equal(summary.response.status, 200);
    assert.equal(summary.body.byTier.monthly_basic.activeNodes, 1);
    assert.equal(summary.body.byTier.yearly.activeNodes, 1);
    assert.equal(summary.body.byTier.monthly_plus.activeNodes, 0);
    assertNoSecret(summary.body);
    assert.equal(logs.join("\n").includes("example.invalid"), false);
  } finally {
    console.log = originalLog;
    console.error = originalError;
    server.close();
  }
});
