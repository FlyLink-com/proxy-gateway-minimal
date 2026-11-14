import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { createApp } from "../app.mjs";
import { createAdminAuthService } from "../services/platform/admin-auth.mjs";
import { createPortalTotpSecretProtector } from "../services/platform/portal-totp-verifier.mjs";
import {
  REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM,
  REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
  applyThirdPartySubscriptionMigrations
} from "../services/platform/third-party-subscription-migrations.mjs";
import { createSqliteThirdPartySubscriptionStore } from "../services/platform/third-party-subscription-store.mjs";
import { listen } from "./helpers/listen.mjs";

const ROOT = "/api/admin/third-party-subscriptions";
const BOOTSTRAP_TOKEN = "synthetic-third-party-admin-bootstrap";
const CONSOLE_TOKEN = "synthetic-third-party-console-token";
const PRIVATE_MARKER = "synthetic-third-party-node-credential";
const YAML = [
  "proxies:",
  "  - name: Japan synthetic",
  "    type: ss",
  "    server: 203.0.113.19",
  "    port: 8388",
  "    cipher: aes-256-gcm",
  `    password: ${PRIVATE_MARKER}`
].join("\n");

async function fixture(t, { allowedCidrs = ["127.0.0.1/32"], featureEnabled = true, role = "admin" } = {}) {
  let clock = Date.parse("2026-10-13T00:00:00.000Z");
  const database = new Database(":memory:");
  applyThirdPartySubscriptionMigrations({
    database,
    expectedMigrationId: REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
    expectedDdlChecksum: REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM,
    nowFn: () => new Date(clock)
  });
  const store = createSqliteThirdPartySubscriptionStore({
    database,
    secretProtector: createPortalTotpSecretProtector({ key: "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff" }),
    nowFn: () => new Date(clock)
  });
  const source = store.createInlineSource({ name: "synthetic-source", yamlContent: YAML, tiers: ["monthly_basic"] });
  const auth = createAdminAuthService({
    bootstrapToken: BOOTSTRAP_TOKEN,
    sessionSecret: "synthetic-third-party-admin-session-signing-key",
    operatorRef: "synthetic-admin-operator",
    sessionTtlSeconds: 60,
    nowFn: () => new Date(clock).toISOString(),
    totpSecretFactory: () => ["JBSW", "Y3DP", "EHPK", "3PXP"].join(""),
    totpVerifier: ({ code }) => code === "123456"
  });
  const enrollment = auth.startBootstrap({ bootstrapToken: BOOTSTRAP_TOKEN });
  const verified = auth.confirmTotpEnrollment({ enrollmentRef: enrollment.enrollment.enrollmentRef, code: "123456" });
  const cookie = verified.sessionCookie.split(";")[0];
  const state = {
    rootDir: new URL("../../", import.meta.url).pathname,
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: CONSOLE_TOKEN,
    proxyConfig: { servers: [], pingHosts: [], nginx: {} },
    services: {
      ssLocal: { status: () => ({ running: false }) },
      httpProxy: { status: () => ({ running: false }) }
    },
    security: { adminAllowedCidrs: allowedCidrs },
    platform: { adminAuthRoutesEnabled: true, adminAuth: auth, adminRole: role },
    thirdPartySubscriptions: { enabled: featureEnabled, available: featureEnabled, store },
    isPortListening: async () => false,
    runCommand: async () => ({ ok: true, stdout: "", stderr: "", code: 0, timedOut: false })
  };
  const { server, baseUrl } = await listen(createApp(state));
  t.after(() => { server.closeAllConnections(); server.close(); database.close(); });

  async function request(path, { method = "GET", body, cookieHeader = cookie, headers = {} } = {}) {
    const response = await fetch(`${baseUrl}${ROOT}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(cookieHeader === null ? {} : { cookie: cookieHeader }),
        ...headers
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const raw = await response.text();
    return { response, raw, body: response.headers.get("content-type")?.includes("application/json") ? JSON.parse(raw) : raw };
  }
  return {
    auth, database, source, store, cookie, cookieAttributes: verified.sessionCookie.slice(cookie.length), request,
    expire: () => { clock += 61_000; },
    nodesPath: `/sources/${source.id}/nodes`, enablePath: `/sources/${source.id}/enable`
  };
}

function assertSafe(result) {
  assert.equal(result.response.headers.get("cache-control"), "no-store");
  for (const value of [PRIVATE_MARKER, BOOTSTRAP_TOKEN, CONSOLE_TOKEN, "203.0.113.19"]) {
    assert.equal(result.raw.includes(value), false);
  }
}

function protectedActions(f) {
  const current = f.store.listSourceNodes(f.source.id);
  return [
    ["/sources", "GET"],
    [f.nodesPath, "GET"],
    [f.nodesPath, "PUT", { revision: current.revision, nodes: current.items.map(({ id }) => ({ id, customName: "Renamed" })) }],
    [f.enablePath, "POST", { revision: current.revision }],
    ["/sources", "POST", { name: "Second synthetic", yamlContent: YAML, tiers: ["monthly_basic"], enabled: false }],
    [`/sources/${f.source.id}`, "PATCH", { enabled: false }]
  ];
}

async function assertRejectedWithoutMutation(f, options, expectedStatus = 401) {
  const before = f.database.serialize();
  for (const [path, method, body] of protectedActions(f)) {
    const result = await f.request(path, { method, body, ...options });
    assert.equal(result.response.status, expectedStatus, `${method} ${path}`);
    assertSafe(result);
  }
  assert.equal(f.database.serialize().equals(before), true, "unauthorized requests must not change the source or node store");
}

test("third-party management uses the existing signed Admin cookie without a browser Console token", async (t) => {
  const f = await fixture(t);
  const sources = await f.request("/sources");
  assert.equal(sources.response.status, 200);
  assert.equal(sources.body.items.length, 1);
  const listed = await f.request(f.nodesPath);
  assert.equal(listed.response.status, 200);
  const saved = await f.request(f.nodesPath, {
    method: "PUT",
    body: { revision: listed.body.revision, nodes: [{ id: listed.body.items[0].id, customName: "JP authenticated rename" }] }
  });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.body.items[0].customName, "JP authenticated rename");
  assert.equal(f.store.listActiveServersForPlan("monthly_basic").length, 0);
  const enabled = await f.request(f.enablePath, { method: "POST", body: { revision: saved.body.revision } });
  assert.equal(enabled.response.status, 200);
  assert.equal(enabled.body.enabled, true);
  assert.equal(f.store.listActiveServersForPlan("monthly_basic").length, 1);
  const imported = await f.request("/sources", {
    method: "POST", body: { name: "Second synthetic", yamlContent: YAML, tiers: ["monthly_basic"], enabled: false }
  });
  assert.equal(imported.response.status, 201);
  assert.equal(imported.body.enabled, false);
  for (const result of [sources, listed, saved, enabled, imported]) assertSafe(result);
});

test("anonymous requests and browser-supplied Console tokens cannot bypass Admin session authentication", async (t) => {
  const f = await fixture(t);
  await assertRejectedWithoutMutation(f, { cookieHeader: null });
  await assertRejectedWithoutMutation(f, { cookieHeader: null, headers: { authorization: `Bearer ${CONSOLE_TOKEN}` } });
});

test("ordinary Portal and forged Admin cookies cannot access third-party management", async (t) => {
  const f = await fixture(t);
  const forged = f.cookie.slice(0, -1) + (f.cookie.endsWith("0") ? "1" : "0");
  await assertRejectedWithoutMutation(f, { cookieHeader: "gcc_portal_session=synthetic-portal-user" });
  await assertRejectedWithoutMutation(f, { cookieHeader: forged });
});

test("an Admin session that expires is refused before any third-party store mutation", async (t) => {
  const f = await fixture(t);
  f.expire();
  await assertRejectedWithoutMutation(f, {});
});

test("an explicitly revoked Admin session is refused before any third-party store mutation", async (t) => {
  const f = await fixture(t);
  f.auth.logout({ cookieHeader: f.cookie });
  await assertRejectedWithoutMutation(f, {});
});

test("a valid Admin session still cannot bypass the existing Admin CIDR allowlist", async (t) => {
  const f = await fixture(t, { allowedCidrs: ["192.0.2.25/32"] });
  await assertRejectedWithoutMutation(f, {}, 403);
});

test("third-party session routes reject an authenticated session with an invalid Admin principal role", async (t) => {
  const f = await fixture(t, { role: "portal_user" });
  await assertRejectedWithoutMutation(f, {}, 403);
});

test("the existing super_admin principal also reaches third-party node management", async (t) => {
  const f = await fixture(t, { role: "super_admin" });
  const result = await f.request(f.nodesPath);
  assert.equal(result.response.status, 200);
  assertSafe(result);
});

test("valid Admin authentication does not enable an unavailable third-party feature", async (t) => {
  const f = await fixture(t, { featureEnabled: false });
  await assertRejectedWithoutMutation(f, {}, 503);
});

test("Admin cookies retain browser same-site protection and unauthenticated cross-origin requests are refused", async (t) => {
  const f = await fixture(t);
  assert.match(f.cookieAttributes, /; HttpOnly(?:;|$)/);
  assert.match(f.cookieAttributes, /; Secure(?:;|$)/);
  assert.match(f.cookieAttributes, /; SameSite=Strict(?:;|$)/);
  await assertRejectedWithoutMutation(f, {
    cookieHeader: null,
    headers: { origin: "https://untrusted.invalid", "sec-fetch-site": "cross-site" }
  });
  const preflight = await f.request(f.nodesPath, {
    method: "OPTIONS", cookieHeader: null,
    headers: { origin: "https://untrusted.invalid", "access-control-request-method": "PUT", "access-control-request-headers": "content-type" }
  });
  assert.equal(preflight.response.status, 401);
  assert.equal(preflight.response.headers.has("access-control-allow-origin"), false);
  assertSafe(preflight);
  // This checks the existing browser-cookie/CORS boundary only. The gateway
  // does not independently validate Origin when a caller supplies a valid cookie.
});
