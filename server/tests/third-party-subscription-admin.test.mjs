import assert from "node:assert/strict";
import test from "node:test";
import { inspect } from "node:util";
import Database from "better-sqlite3";
import { generateClashSubscription } from "../services/clash-subscription.mjs";
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
const IMPORT_BODY_SECRET = "synthetic-import-body-secret";
const SS_YAML = [
  "proxies:",
  "  - name: HK",
  "    type: ss",
  "    server: 203.0.113.10",
  "    port: 8388",
  "    cipher: aes-256-gcm",
  "    password: synthetic-password",
  "  - name: JP",
  "    type: ss",
  "    server: 203.0.113.11",
  "    port: 8388",
  "    cipher: aes-256-gcm",
  "    password: synthetic-password"
].join("\n");

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

function featureState({ enabled = true, secretProtector, network = { calls: 0 }, database = appliedDatabase() } = {}) {
  const protector = secretProtector || createPortalTotpSecretProtector({ key: SECRET_KEY });
  const store = createSqliteThirdPartySubscriptionStore({
    database,
    secretProtector: protector,
    fetchFn: async () => {
      network.calls += 1;
      throw new Error("network");
    },
    resolveFn: async () => {
      network.calls += 1;
      throw new Error("dns");
    },
    nowFn: () => new Date("2026-10-10T00:00:00.000Z")
  });
  const state = {
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
      secretProtector: protector
    },
    security: { adminAllowedCidrs: ["127.0.0.1", "::1"] }
  };
  return { state, database, network };
}

function assertNoStore(response) {
  assert.equal(response.headers.get("cache-control"), "no-store");
}

function rowCount(database) {
  return database.prepare("select count(*) as n from platform_third_party_sources").get().n;
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

function assertNoImportBodySecret(value) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  assert.equal(serialized.includes(IMPORT_BODY_SECRET), false);
}

function capturedText(item) {
  if (typeof item === "string") return item;
  try {
    return inspect(item, {
      depth: 8,
      maxArrayLength: null,
      maxStringLength: null,
      breakLength: Infinity
    });
  } catch {
    return String(item);
  }
}

function captureConsoleAndStderr() {
  const chunks = [];
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalStderrWrite = process.stderr.write;
  const record = (...args) => {
    chunks.push(args.map((item) => capturedText(item)).join(" "));
  };
  console.log = record;
  console.error = record;
  console.warn = record;
  process.stderr.write = (chunk, encoding, callback) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
    if (typeof encoding === "function") encoding();
    else if (typeof callback === "function") callback();
    return true;
  };
  return {
    text() {
      return chunks.join("\n");
    },
    restore() {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
      process.stderr.write = originalStderrWrite;
    }
  };
}

async function requestRaw(baseUrl, path, options = {}) {
  const headers = {
    "content-type": "application/json",
    ...(options.headers ?? {})
  };
  if (options.token !== null) {
    headers.authorization = `Bearer ${options.token ?? "secret"}`;
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "POST",
    headers,
    body: options.body
  });
  const text = await response.text();
  const contentType = response.headers.get("content-type") || "";
  let body = text;
  if (text && contentType.includes("application/json")) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { response, body, raw: text };
}

test("admin third-party routes require console auth", async () => {
  const { state } = featureState();
  const { server, baseUrl } = await listen(createApp(state));
  try {
    const unauth = await requestJson(baseUrl, "/api/admin/third-party-subscriptions/sources", {
      token: null
    });
    assert.equal(unauth.response.status, 401);
    assert.deepEqual(unauth.body, { error: "Unauthorized" });
    const wrong = await requestJson(baseUrl, "/api/admin/third-party-subscriptions/sources", {
      token: "wrong-token"
    });
    assert.equal(wrong.response.status, 401);
    assert.deepEqual(wrong.body, { error: "Unauthorized" });
  } finally {
    server.close();
  }
});

test("raw import parser failures stay fixed and lookalikes stay outside", async () => {
  const { state, database } = featureState();
  const { server, baseUrl } = await listen(createApp(state));
  const captured = captureConsoleAndStderr();
  try {
    const malformed = await requestRaw(baseUrl, "/api/admin/third-party-subscriptions/sources", {
      body: `{"yamlContent":${IMPORT_BODY_SECRET}}`
    });
    assert.equal(malformed.response.status, 400);
    assert.equal(malformed.raw, "{\"error\":\"invalid_input\"}");
    assertNoStore(malformed.response);
    assertNoImportBodySecret(malformed.raw);

    const oversized = await requestRaw(baseUrl, "/api/admin/third-party-subscriptions/sources", {
      body: `${IMPORT_BODY_SECRET}${"y".repeat((100 * 1024) + 1)}${IMPORT_BODY_SECRET}`
    });
    assert.equal(oversized.response.status, 413);
    assert.equal(oversized.raw, "{\"error\":\"input_too_large\"}");
    assertNoStore(oversized.response);
    assertNoImportBodySecret(oversized.raw);

    const exactRoot = await requestRaw(baseUrl, "/api/admin/third-party-subscriptions", {
      body: `{"yamlContent":${IMPORT_BODY_SECRET}}`
    });
    assert.equal(exactRoot.response.status, 400);
    assert.equal(exactRoot.raw, "{\"error\":\"invalid_input\"}");
    assertNoStore(exactRoot.response);
    assertNoImportBodySecret(exactRoot.raw);

    const uppercase = await requestRaw(baseUrl, "/API/ADMIN/THIRD-PARTY-SUBSCRIPTIONS/SOURCES", {
      body: `{"yamlContent":${IMPORT_BODY_SECRET}}`
    });
    assert.equal(uppercase.response.status, 400);
    assert.equal(uppercase.raw, "{\"error\":\"invalid_input\"}");
    assertNoStore(uppercase.response);
    assertNoImportBodySecret(uppercase.raw);

    const stillUnauthorized = await requestJson(baseUrl, "/api/admin/third-party-subscriptions/sources", {
      method: "POST",
      token: null,
      body: { name: "x", yamlContent: "proxies: []" }
    });
    assert.equal(stillUnauthorized.response.status, 401);
    assert.deepEqual(stillUnauthorized.body, { error: "Unauthorized" });
    assertNoStore(stillUnauthorized.response);
    assert.equal(captured.text(), "", "sensitive namespace parser errors must not reach the logger");

    const lookalikeMalformed = await requestRaw(baseUrl, "/api/admin/third-party-subscriptions-extra", {
      token: null,
      body: "{"
    });
    assert.notEqual(lookalikeMalformed.response.headers.get("cache-control"), "no-store");
    assert.equal(lookalikeMalformed.raw.includes("\"invalid_input\""), false);
    assert.equal(lookalikeMalformed.raw.includes("\"input_too_large\""), false);

    const lookalikePrefix = await requestJson(baseUrl, "/api/admin/third-party-subscriptionsuffix", {
      method: "POST",
      token: null,
      body: { name: "outside" }
    });
    assert.equal(lookalikePrefix.response.status, 401);
    assert.deepEqual(lookalikePrefix.body, { error: "Unauthorized" });
    assert.notEqual(lookalikePrefix.response.headers.get("cache-control"), "no-store");

    assertNoImportBodySecret(captured.text());
    assert.equal(rowCount(database), 0);
  } finally {
    captured.restore();
    server.close();
  }
});

test("flag-off admin import is unavailable", async () => {
  const network = { calls: 0 };
  const { state } = featureState({ enabled: false, network });
  const { server, baseUrl } = await listen(createApp(state));
  try {
    const created = await requestJson(baseUrl, "/api/admin/third-party-subscriptions/sources", {
      method: "POST",
      body: { name: "x", subscriptionUrl: SOURCE_URL, tiers: ["monthly_basic"] }
    });
    assert.equal(created.response.status, 503);
    assert.deepEqual(created.body, { error: "third_party_unavailable" });
    assertNoStore(created.response);
    assertNoSecret(created.raw);
    assert.equal(network.calls, 0);
  } finally {
    server.close();
  }
});

test("inline region changes are rejected without changing source, nodes, or rendering", async () => {
  const { state, database } = featureState();
  const store = state.thirdPartySubscriptions.store;
  const source = store.createInlineSource({ name: "region-fixed", yamlContent: SS_YAML,
    regionOverride: "JP", tiers: ["monthly_basic"], enabled: true });
  const beforeSources = store.listSources();
  const beforeNodes = database.prepare("select * from platform_third_party_nodes order by id").all();
  const beforeYaml = generateClashSubscription({ servers: store.listActiveServersForPlan("monthly_basic") });
  const { server, baseUrl } = await listen(createApp(state));
  try {
    for (const regionOverride of ["SG", null]) {
      assert.throws(() => store.patchSource(source.id, { regionOverride }), error => error?.code === "invalid_input");
      const result = await requestJson(baseUrl, `/api/admin/third-party-subscriptions/sources/${source.id}`, {
        method: "PATCH", body: { regionOverride }
      });
      assert.equal(result.response.status, 400);
      assert.deepEqual(result.body, { error: "invalid_input" });
      assertNoStore(result.response);
      assert.deepEqual(store.listSources(), beforeSources);
      assert.deepEqual(database.prepare("select * from platform_third_party_nodes order by id").all(), beforeNodes);
      assert.equal(generateClashSubscription({ servers: store.listActiveServersForPlan("monthly_basic") }), beforeYaml);
    }
    const changed = await requestJson(baseUrl, `/api/admin/third-party-subscriptions/sources/${source.id}`, {
      method: "PATCH", body: { name: "region-fixed-renamed", tiers: ["yearly"], enabled: false }
    });
    assert.equal(changed.response.status, 200);
    assert.equal(changed.body.name, "region-fixed-renamed");
    assert.equal(changed.body.enabled, false);
    assert.deepEqual(changed.body.tiers, ["yearly"]);
    assert.equal(changed.body.regionOverride, "JP");
  } finally {
    server.closeAllConnections();
    server.close();
    database.close();
  }
});

test("inline import validation, explicit enable, preview and refresh leak no material", async () => {
  const logs = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args) => logs.push(args.join(" "));
  console.error = (...args) => logs.push(args.join(" "));
  const network = { calls: 0 };
  const { state, database } = featureState({ network });
  const { server, baseUrl } = await listen(createApp(state));
  try {
    const unknown = await requestJson(baseUrl, "/api/admin/third-party-subscriptions/sources", {
      method: "POST",
      body: {
        name: "x",
        yamlContent: SS_YAML,
        tiers: ["monthly_basic"],
        filePath: "D:\\unused\\secret-sub.yaml"
      }
    });
    assert.equal(unknown.response.status, 400);
    assert.deepEqual(unknown.body, { error: "invalid_input" });
    assert.equal(unknown.raw.includes("secret-sub"), false);
    assertNoStore(unknown.response);

    const both = await requestJson(baseUrl, "/api/admin/third-party-subscriptions/sources", {
      method: "POST",
      body: {
        name: "x",
        yamlContent: SS_YAML,
        subscriptionUrl: SOURCE_URL,
        tiers: ["monthly_basic"]
      }
    });
    assert.equal(both.response.status, 400);
    assert.deepEqual(both.body, { error: "invalid_input" });
    assertNoSecret(both.raw);

    const remote = await requestJson(baseUrl, "/api/admin/third-party-subscriptions/sources", {
      method: "POST",
      body: { name: "x", subscriptionUrl: "http://example.invalid/x", tiers: ["monthly_basic"] }
    });
    assert.equal(remote.response.status, 400);
    assert.deepEqual(remote.body, { error: "remote_import_disabled" });
    assertNoStore(remote.response);

    const privateIp = await requestJson(baseUrl, "/api/admin/third-party-subscriptions/sources", {
      method: "POST",
      body: { name: "x", subscriptionUrl: "https://10.0.0.8/x", tiers: ["monthly_basic"] }
    });
    assert.deepEqual(privateIp.body, { error: "remote_import_disabled" });

    const httpsUrl = await requestJson(baseUrl, "/api/admin/third-party-subscriptions/sources", {
      method: "POST",
      body: { name: "x", subscriptionUrl: SOURCE_URL, tiers: ["monthly_basic"], enabled: true }
    });
    assert.deepEqual(httpsUrl.body, { error: "remote_import_disabled" });
    assertNoSecret(httpsUrl.raw);

    const badTiers = await requestJson(baseUrl, "/api/admin/third-party-subscriptions/sources", {
      method: "POST",
      body: { name: "x", yamlContent: SS_YAML, tiers: ["trial"] }
    });
    assert.equal(badTiers.response.status, 400);
    assert.deepEqual(badTiers.body, { error: "invalid_tiers" });

    const oversize = await requestJson(baseUrl, "/api/admin/third-party-subscriptions/sources", {
      method: "POST",
      body: { name: "x", yamlContent: "a".repeat((64 * 1024) + 1), tiers: ["monthly_basic"] }
    });
    assert.deepEqual(oversize.body, { error: "invalid_yaml" });

    const malformed = await requestJson(baseUrl, "/api/admin/third-party-subscriptions/sources", {
      method: "POST",
      body: { name: "x", yamlContent: "proxies: [", tiers: ["monthly_basic"] }
    });
    assert.equal(malformed.response.status, 400);
    assert.equal(malformed.body.error === "invalid_yaml" || malformed.body.error === "parse_no_valid_nodes", true);
    assert.equal(rowCount(database), 0);

    const preview = await requestJson(baseUrl, "/api/admin/third-party-subscriptions/sources/preview", {
      method: "POST",
      body: { yamlContent: SS_YAML }
    });
    assert.equal(preview.response.status, 200);
    assert.equal(preview.body.byProtocol.ss, 2);
    assert.deepEqual(preview.body.byCountry, { HK: 1, JP: 1 });
    assert.equal(Object.hasOwn(preview.body, "nodes"), false);
    assert.equal(preview.raw.includes("synthetic-password"), false);
    assert.equal(preview.raw.includes("203.0.113.10"), false);
    assertNoStore(preview.response);
    assert.equal(rowCount(database), 0);

    const created = await requestJson(baseUrl, "/api/admin/third-party-subscriptions/sources", {
      method: "POST",
      body: {
        name: "synthetic-source",
        yamlContent: SS_YAML,
        tiers: ["monthly_basic"]
      }
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.name, "synthetic-source");
    assert.equal(created.body.enabled, false);
    assert.equal(created.body.sourceKind, "inline-yaml");
    assert.deepEqual(created.body.tiers, ["monthly_basic"]);
    assert.equal(Object.hasOwn(created.body, "subscriptionUrl"), false);
    assert.equal(Object.hasOwn(created.body, "yamlContent"), false);
    assertNoStore(created.response);
    assertNoSecret(created.body);

    const summaryBefore = await requestJson(baseUrl, "/api/admin/third-party-subscriptions/summary");
    assert.equal(summaryBefore.body.byTier.monthly_basic.activeNodes, 0);

    const patched = await requestJson(baseUrl, `/api/admin/third-party-subscriptions/sources/${created.body.id}`, {
      method: "PATCH",
      body: { tiers: ["monthly_basic", "yearly"], enabled: true }
    });
    assert.equal(patched.response.status, 200);
    assert.equal(patched.body.enabled, true);
    assert.deepEqual(patched.body.tiers, ["monthly_basic", "yearly"]);
    assertNoSecret(patched.body);

    const listed = await requestJson(baseUrl, "/api/admin/third-party-subscriptions/sources");
    assert.equal(listed.response.status, 200);
    assert.equal(listed.body.items.length, 1);
    assertNoSecret(listed.body);

    const beforeRefresh = database.prepare(
      "select status, last_error_code, last_refresh_at from platform_third_party_sources where id = ?"
    ).get(created.body.id);
    const refreshed = await requestJson(
      baseUrl,
      `/api/admin/third-party-subscriptions/sources/${created.body.id}/refresh`,
      { method: "POST" }
    );
    assert.equal(refreshed.response.status, 400);
    assert.deepEqual(refreshed.body, { error: "remote_refresh_disabled" });
    assertNoStore(refreshed.response);
    assertNoSecret(refreshed.raw);
    assert.deepEqual(database.prepare(
      "select status, last_error_code, last_refresh_at from platform_third_party_sources where id = ?"
    ).get(created.body.id), beforeRefresh);

    const summary = await requestJson(baseUrl, "/api/admin/third-party-subscriptions/summary");
    assert.equal(summary.body.byTier.monthly_basic.activeNodes, 2);
    assert.equal(summary.body.byTier.yearly.activeNodes, 2);
    assert.equal(summary.body.byTier.monthly_plus.activeNodes, 0);
    assertNoSecret(summary.body);
    assertNoStore(summary.response);
    assert.equal(network.calls, 0);
    assert.equal(logs.join("\n").includes("example.invalid"), false);
    assert.equal(logs.join("\n").includes("synthetic-password"), false);
  } finally {
    console.log = originalLog;
    console.error = originalError;
    server.close();
  }
});

test("protector failure is allowlisted and leaves no source", async () => {
  const database = appliedDatabase();
  const base = createPortalTotpSecretProtector({ key: SECRET_KEY });
  let calls = 0;
  const { state } = featureState({
    database,
    secretProtector: {
      protect(value) {
        calls += 1;
        if (calls > 1) {
          const error = new Error("synthetic-password from protector");
          error.code = "ECONNRESET";
          throw error;
        }
        return base.protect(value);
      },
      unprotect: (value) => base.unprotect(value)
    }
  });
  const { server, baseUrl } = await listen(createApp(state));
  try {
    const created = await requestJson(baseUrl, "/api/admin/third-party-subscriptions/sources", {
      method: "POST",
      body: { name: "synthetic-source", yamlContent: SS_YAML, tiers: ["monthly_basic"] }
    });
    assert.equal(created.response.status, 400);
    assert.deepEqual(created.body, { error: "invalid_input" });
    assert.equal(created.raw.includes("ECONNRESET"), false);
    assert.equal(created.raw.includes("synthetic-password"), false);
    assert.equal(database.prepare("select count(*) as n from platform_third_party_sources").get().n, 0);
  } finally {
    server.close();
  }
});
