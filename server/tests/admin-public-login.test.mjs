import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createApp } from "../app.mjs";
import { createRuntimeState } from "../state.mjs";
import { listen } from "./helpers/listen.mjs";
import { buildSourceValidationTestEnvironment } from "../../scripts/source-validation-test-runner.mjs";
import { createPortalAccountAdminAuthService } from "../services/platform/admin-auth.mjs";
import { createPortalPasswordCredentialService } from "../services/platform/portal-password-credentials.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";

const ORIGIN = "https://admin.example.test";
function fixture(publicEnabled = true) {
  const calls = { writes: 0, logins: 0 };
  const state = {
    rootDir: new URL("../../", import.meta.url).pathname,
    consoleToken: "synthetic-console-secret",
    services: {}, proxyConfig: { servers: [] },
    subscriptions: { service: {
      listTenants: () => [],
      disableTenant: () => { calls.writes += 1; return {}; }
    } },
    security: { adminAllowedCidrs: ["127.0.0.1"], trustedProxyCidrs: ["127.0.0.1"] },
    platform: {
      adminPublicLoginEnabled: publicEnabled, adminBrowserOrigin: ORIGIN,
      adminAuthRoutesEnabled: true,
      adminAuth: {
        sessionStatus: () => ({ authenticated: false, mode: "portalAccount" }),
        authenticateCookie: ({ cookieHeader }) => cookieHeader === "gcc_admin_session=synthetic"
          ? { sessionRef: "synthetic-session", operatorRef: "synthetic-admin", authMethod: "totp" } : null,
        login: () => { calls.logins += 1; return { challenge: { challengeRef: "synthetic" } }; }
      }
    }
  };
  return { state, calls };
}

test("public Admin opt-in removes only visitor IP restriction, never cookie authentication", async () => {
  const { state } = fixture();
  const { server, baseUrl } = await listen(createApp(state));
  try {
    const headers = { "X-Forwarded-For": "203.0.113.24" };
    const status = await fetch(`${baseUrl}/api/admin-auth/session`, { headers });
    assert.equal(status.status, 200);
    assert.equal(status.headers.get("cache-control"), "no-store");
    for (const extra of [{}, { Authorization: "Bearer synthetic-console-secret" }, { Cookie: "gcc_admin_session=wrong" }]) {
      const response = await fetch(`${baseUrl}/api/admin/subscriptions`, { headers: { ...headers, ...extra } });
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
    const allowed = await fetch(`${baseUrl}/api/admin/subscriptions`, {
      headers: { ...headers, Cookie: "gcc_admin_session=synthetic" }
    });
    assert.equal(allowed.status, 200);
  } finally { server.close(); }
});

test("default/restricted Admin retains source IP allowlist", async () => {
  const { state } = fixture(false);
  const { server, baseUrl } = await listen(createApp(state));
  try {
    for (const path of ["/api/admin-auth/session", "/api/admin/subscriptions"]) {
      const response = await fetch(`${baseUrl}${path}`, { headers: { "X-Forwarded-For": "203.0.113.24" } });
      assert.equal(response.status, 403);
    }
  } finally { server.close(); }
});

test("public Admin writes require exact configured Origin before auth or mutation", async () => {
  const { state, calls } = fixture();
  const { server, baseUrl } = await listen(createApp(state));
  try {
    for (const origin of [undefined, "null", "https://portal.example.test", "https://evil.test", "http://admin.example.test", `${ORIGIN}:444`, `${ORIGIN}/`, `${ORIGIN}, ${ORIGIN}`]) {
      for (const path of ["/api/admin/subscriptions/synthetic/disable", "/api/admin-auth/login"]) {
        const headers = { Cookie: "gcc_admin_session=synthetic", "X-Forwarded-For": "203.0.113.24" };
        if (origin !== undefined) headers.Origin = origin;
        const response = await fetch(`${baseUrl}${path}`, { method: "POST", headers });
        assert.equal(response.status, 403, `${origin} ${path}`);
        assert.equal(response.headers.get("cache-control"), "no-store");
      }
    }
    assert.equal(calls.writes, 0);
    assert.equal(calls.logins, 0);
    const valid = await fetch(`${baseUrl}/api/admin/subscriptions/synthetic/disable`, {
      method: "POST", headers: { Origin: ORIGIN, Cookie: "gcc_admin_session=synthetic", "X-Forwarded-For": "203.0.113.24" }
    });
    assert.equal(valid.status, 200);
    assert.equal(calls.writes, 1);
  } finally { server.close(); }
});

test("Origin cannot be replaced by Host/X-Forwarded-Host/Fetch-Metadata and mixed-case paths stay protected", async () => {
  const { state, calls } = fixture();
  const { server, baseUrl } = await listen(createApp(state));
  try {
    for (const headers of [
      { Origin: "https://evil.test", Host: "evil.test", "X-Forwarded-Host": "evil.test" },
      { "Sec-Fetch-Site": "same-origin" },
      { Origin: ORIGIN, "Sec-Fetch-Site": "same-site" },
      { Origin: ORIGIN, "Sec-Fetch-Site": "cross-site" }
    ]) {
      const response = await fetch(`${baseUrl}/API/ADMIN/subscriptions/synthetic/disable/`, {
        method: "POST", headers: { ...headers, Cookie: "gcc_admin_session=synthetic" }
      });
      assert.equal(response.status, 403);
    }
    assert.equal(calls.writes, 0);
  } finally { server.close(); }
});

test("public Admin parser failures are uncached and do not reflect submitted credentials", async () => {
  const { state, calls } = fixture();
  const { server, baseUrl } = await listen(createApp(state));
  try {
    const response = await fetch(`${baseUrl}/api/admin-auth/login`, {
      method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/json" },
      body: '{"bootstrapToken":"synthetic-do-not-reflect"'
    });
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { error: "validation_error" });
    assert.equal(calls.logins, 0);
  } finally { server.close(); }
});

test("public Admin application fails closed without cookie auth or exact HTTPS origin", () => {
  for (const value of [undefined, "", "https://admin.example.test/", "https://admin.example.test/path", "http://admin.example.test", "https://user:pass@admin.example.test", "https://admin.example.test?x", "https://admin.example.test#x"]) {
    const { state } = fixture();
    state.platform.adminBrowserOrigin = value;
    assert.throws(() => createApp(state), /ADMIN_BROWSER_ORIGIN/);
  }
  for (const patch of [{ adminAuthRoutesEnabled: false }, { adminAuth: null }]) {
    const { state } = fixture();
    Object.assign(state.platform, patch);
    assert.throws(() => createApp(state), /admin auth/i);
  }
});

test("runtime opt-in requires admin auth and exact configured origin without changing defaults", () => {
  const dir = mkdtempSync(join(tmpdir(), "admin-public-state-"));
  const syntheticEnv = buildSourceValidationTestEnvironment({}, { repositoryRoot: fileURLToPath(new URL("../../", import.meta.url)) });
  const common = {
    ...syntheticEnv,
    CONSOLE_TOKEN: "synthetic", ADMIN_AUTH_ROUTES_ENABLED: "true",
    ADMIN_AUTH_PORTAL_ACCOUNT_ID: "synthetic-admin", ADMIN_AUTH_SESSION_SECRET: "synthetic-session-secret"
  };
  try {
    for (const env of [
      { ...common, ADMIN_PUBLIC_LOGIN_ENABLED: "true", ADMIN_BROWSER_ORIGIN: ORIGIN },
      { ...common }
    ]) {
      const state = createRuntimeState({ rootDir: new URL("../../", import.meta.url), env,
        subscriptionDbPath: join(dir, "subs.sqlite"), controlDbPath: join(dir, "control.sqlite"), autoStartHttpProxy: false });
      try {
        assert.equal(state.platform.adminPublicLoginEnabled, env.ADMIN_PUBLIC_LOGIN_ENABLED === "true");
        assert.equal(state.platform.adminBrowserOrigin, env.ADMIN_BROWSER_ORIGIN);
      } finally { state.close(); }
    }
    for (const env of [
      { ...common, ADMIN_PUBLIC_LOGIN_ENABLED: "true" },
      { ...syntheticEnv, CONSOLE_TOKEN: "synthetic", ADMIN_PUBLIC_LOGIN_ENABLED: "true", ADMIN_BROWSER_ORIGIN: ORIGIN }
    ]) {
      assert.throws(() => createRuntimeState({ rootDir: new URL("../../", import.meta.url), env,
        subscriptionDbPath: join(dir, "subs.sqlite"), controlDbPath: join(dir, "control.sqlite"), autoStartHttpProxy: false }), /admin auth|ADMIN_BROWSER_ORIGIN/i);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("public fixed-account HTTP flow requires password then TOTP, enforces same-origin writes and revokes logout", async () => {
  const dir = mkdtempSync(join(tmpdir(), "admin-public-http-"));
  const store = createSqliteSubscriptionControlStore({ dbPath: join(dir, "synthetic.sqlite") });
  const now = "2026-10-13T00:00:00.000Z";
  let clock = now;
  let server;
  try {
    store.createAccount({ id: "synthetic-admin", ownerRef: "synthetic-owner", status: "active", createdAt: now, updatedAt: now });
    const passwords = createPortalPasswordCredentialService({ controlStore: store, nowFn: () => clock });
    passwords.issueInitialPasswordCredential({ accountId: "synthetic-admin", plainPassword: "synthetic-strong-password",
      issuedByRef: "synthetic-issuer", approvalRef: "synthetic-approval" });
    store.createPortalTotpCredential({ id: "synthetic-totp", accountId: "synthetic-admin", encryptedTotpSecret: "synthetic-protected",
      status: "active", failureCount: 0, enrolledAt: now, updatedAt: now });
    const { state, calls } = fixture();
    state.platform.adminAuth = createPortalAccountAdminAuthService({ controlStore: store, passwordCredentialService: passwords,
      nowFn: () => clock, accountId: "synthetic-admin", sessionSecret: "synthetic-session-only",
      totpVerifier: ({ code }) => code === "654321" });
    const listener = await listen(createApp(state));
    server = listener.server;
    const request = (path, body, cookie) => fetch(`${listener.baseUrl}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Origin: ORIGIN, "Content-Type": "application/json", "X-Forwarded-For": "203.0.113.37",
        ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body)
    });
    const session = await request("/api/admin-auth/session");
    assert.deepEqual(await session.json(), { authenticated: false, mode: "portalAccount" });
    for (const path of ["/api/admin-auth/bootstrap/start", "/api/admin-auth/totp/enrollment/confirm"]) {
      assert.equal((await request(path, {})).status, 404);
    }
    assert.equal((await request("/api/admin-auth/login", { bootstrapToken: "wrong" })).status, 401);
    async function signIn() {
      const login = await request("/api/admin-auth/login", { bootstrapToken: "synthetic-strong-password" });
      assert.equal(login.status, 202);
      assert.equal(login.headers.get("set-cookie"), null);
      assert.equal((await request("/api/admin/subscriptions")).status, 401);
      const { challenge } = await login.json();
      assert.equal((await request("/api/admin-auth/totp/verify", { challengeRef: challenge.challengeRef, code: "000000" })).status, 401);
      const verified = await request("/api/admin-auth/totp/verify", { challengeRef: challenge.challengeRef, code: "654321" });
      assert.equal(verified.status, 200);
      const setCookie = verified.headers.get("set-cookie");
      assert.match(setCookie, /HttpOnly/);
      assert.match(setCookie, /Secure/);
      assert.match(setCookie, /SameSite=Strict/);
      return setCookie.split(";")[0];
    }
    const cookie = await signIn();
    assert.equal((await request("/api/admin/subscriptions", undefined, cookie)).status, 200);
    for (const malformed of ["unrelated=%", "gcc_admin_session=%", "gcc_admin_session=%E0%A4%A", `${cookie}; unrelated=%`, `${cookie}; ${cookie}`]) {
      const rejected = await request("/api/admin/subscriptions", undefined, malformed);
      assert.equal(rejected.status, 401);
      assert.match(rejected.headers.get("content-type"), /application\/json/);
      const anonymous = await request("/api/admin-auth/session", undefined, malformed);
      assert.equal(anonymous.status, 200);
      assert.deepEqual(await anonymous.json(), { authenticated: false, mode: "portalAccount" });
    }
    assert.equal((await request("/api/admin/subscriptions", undefined, cookie)).status, 200);
    assert.equal((await request("/api/status", undefined, cookie)).status, 401);
    const crossSite = await fetch(`${listener.baseUrl}/api/admin/subscriptions/synthetic/disable`, {
      method: "POST", headers: { Cookie: cookie, Origin: "https://portal.example.test" }
    });
    assert.equal(crossSite.status, 403);
    assert.equal(calls.writes, 0);
    assert.equal((await request("/api/admin/subscriptions/synthetic/disable", {}, cookie)).status, 200);
    assert.equal(calls.writes, 1);
    assert.equal((await request("/api/admin-auth/logout", {}, cookie)).status, 200);
    assert.equal((await request("/api/admin/subscriptions", undefined, cookie)).status, 401);
    const expiredCookie = await signIn();
    clock = "2026-10-14T00:00:00.000Z";
    assert.equal((await request("/api/admin/subscriptions", undefined, expiredCookie)).status, 401);
  } finally { server?.close(); store.close(); rmSync(dir, { recursive: true, force: true }); }
});
