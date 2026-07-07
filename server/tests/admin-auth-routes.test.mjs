import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../app.mjs";
import { createAdminAuthService, createPortalAccountAdminAuthService } from "../services/platform/admin-auth.mjs";
import { createPortalPasswordCredentialService } from "../services/platform/portal-password-credentials.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { listen } from "./helpers/listen.mjs";

const ROOT_DIR = new URL("../../", import.meta.url).pathname;

function baseState(overrides = {}) {
  return {
    rootDir: ROOT_DIR,
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: "console-secret",
    proxyConfig: { servers: [], pingHosts: [], nginx: {} },
    services: {
      ssLocal: { status: () => ({ running: false }) },
      httpProxy: { status: () => ({ running: false }) }
    },
    subscriptions: {
      service: {
        listTenants: () => [{ id: "tenant_1" }]
      }
    },
    security: {
      adminAllowedCidrs: ["127.0.0.1/32"],
      subRateLimit: { windowMs: 60000, max: 30 }
    },
    platform: {},
    isPortListening: async () => false,
    runCommand: async () => ({ ok: true, stdout: "", stderr: "", code: 0, timedOut: false }),
    ...overrides
  };
}

function adminAuthService() {
  return createAdminAuthService({
    nowFn: () => "2026-07-01T00:00:00.000Z",
    bootstrapToken: "bootstrap-secret",
    sessionSecret: "session-secret",
    operatorRef: "admin_operator_1",
    enrollmentRefFactory: () => "admin_totp_enroll_1",
    credentialRefFactory: () => "admin_totp_credential_1",
    challengeRefFactory: () => "admin_totp_challenge_1",
    sessionRefFactory: () => "admin_session_1",
    totpSecretFactory: () => "JBSWY3DPEHPK3PXP",
    totpVerifier: ({ encryptedTotpSecret, code }) => encryptedTotpSecret === "enc:JBSWY3DPEHPK3PXP" && code === "654321"
  });
}

function enabledState() {
  const state = baseState();
  state.platform.adminAuthRoutesEnabled = true;
  state.platform.adminAuth = adminAuthService();
  return state;
}

test("admin auth routes stay unavailable when the protected route gate is disabled", async () => {
  const app = createApp(baseState());
  const { server, baseUrl } = await listen(app);
  try {
    const response = await fetch(`${baseUrl}/api/admin-auth/session`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Unauthorized" });
  } finally {
    server.close();
  }
});

test("admin auth routes share the admin IP allowlist before session work", async () => {
  const app = createApp(enabledState(), { clientIpResolver: () => "203.0.113.10" });
  const { server, baseUrl } = await listen(app);
  try {
    const response = await fetch(`${baseUrl}/api/admin-auth/session`);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "Forbidden" });
  } finally {
    server.close();
  }
});

test("admin auth bootstrap binds one TOTP factor and session-gates admin APIs without exposing console token", async () => {
  const app = createApp(enabledState());
  const { server, baseUrl } = await listen(app);
  try {
    const noSession = await fetch(`${baseUrl}/api/admin/subscriptions`);
    assert.equal(noSession.status, 401);

    const bearerOnly = await fetch(`${baseUrl}/api/admin/subscriptions`, {
      headers: { Authorization: "Bearer console-secret" }
    });
    assert.equal(bearerOnly.status, 401);

    const status = await fetch(`${baseUrl}/api/admin-auth/session`);
    assert.equal(status.status, 200);
    assert.deepEqual(await status.json(), { authenticated: false });

    const deniedBootstrap = await fetch(`${baseUrl}/api/admin-auth/bootstrap/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bootstrapToken: "wrong" })
    });
    assert.equal(deniedBootstrap.status, 401);
    assert.deepEqual(await deniedBootstrap.json(), { error: "invalid_admin_login" });

    const bootstrap = await fetch(`${baseUrl}/api/admin-auth/bootstrap/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bootstrapToken: "bootstrap-secret" })
    });
    assert.equal(bootstrap.status, 201);
    const bootstrapBody = await bootstrap.json();
    assert.equal(bootstrapBody.enrollment.enrollmentRef, "admin_totp_enroll_1");
    assert.equal(bootstrapBody.enrollment.manualKey, "JBSWY3DPEHPK3PXP");
    assert.match(bootstrapBody.enrollment.otpauthUri, /^otpauth:\/\/totp\//);
    assert.doesNotMatch(JSON.stringify(bootstrapBody), /console-secret|bootstrap-secret|enc:/);

    const badTotp = await fetch(`${baseUrl}/api/admin-auth/totp/enrollment/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enrollmentRef: "admin_totp_enroll_1", code: "000000" })
    });
    assert.equal(badTotp.status, 401);
    assert.deepEqual(await badTotp.json(), { error: "invalid_totp" });
    assert.equal(badTotp.headers.get("set-cookie"), null);

    const confirmed = await fetch(`${baseUrl}/api/admin-auth/totp/enrollment/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enrollmentRef: "admin_totp_enroll_1", code: "654321" })
    });
    assert.equal(confirmed.status, 200);
    const cookie = confirmed.headers.get("set-cookie") || "";
    assert.match(cookie, /gcc_admin_session=/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    assert.match(cookie, /Secure/);
    const confirmedBody = await confirmed.json();
    assert.equal(confirmedBody.session.operatorRef, "admin_operator_1");
    assert.equal(confirmedBody.session.authMethod, "totp");
    assert.doesNotMatch(JSON.stringify(confirmedBody), /console-secret|bootstrap-secret|654321|JBSWY3DPEHPK3PXP|enc:/);

    const duplicateBootstrap = await fetch(`${baseUrl}/api/admin-auth/bootstrap/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bootstrapToken: "bootstrap-secret" })
    });
    assert.equal(duplicateBootstrap.status, 409);
    assert.deepEqual(await duplicateBootstrap.json(), { error: "admin_operator_already_configured" });

    const protectedApi = await fetch(`${baseUrl}/api/admin/subscriptions`, {
      headers: { Cookie: cookie.split(";")[0] }
    });
    assert.equal(protectedApi.status, 200);
    assert.deepEqual(await protectedApi.json(), { items: [{ id: "tenant_1" }] });
  } finally {
    server.close();
  }
});

test("configured single admin logs in with TOTP after logout", async () => {
  const app = createApp(enabledState());
  const { server, baseUrl } = await listen(app);
  try {
    const bootstrap = await fetch(`${baseUrl}/api/admin-auth/bootstrap/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bootstrapToken: "bootstrap-secret" })
    });
    const enrollmentRef = (await bootstrap.json()).enrollment.enrollmentRef;

    const confirmed = await fetch(`${baseUrl}/api/admin-auth/totp/enrollment/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enrollmentRef, code: "654321" })
    });
    const firstCookie = confirmed.headers.get("set-cookie").split(";")[0];

    const logout = await fetch(`${baseUrl}/api/admin-auth/logout`, {
      method: "POST",
      headers: { Cookie: firstCookie }
    });
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get("set-cookie") || "", /Max-Age=0/);

    const loggedOutApi = await fetch(`${baseUrl}/api/admin/subscriptions`);
    assert.equal(loggedOutApi.status, 401);

    const deniedLogin = await fetch(`${baseUrl}/api/admin-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operatorRef: "other_operator", bootstrapToken: "bootstrap-secret" })
    });
    assert.equal(deniedLogin.status, 401);
    assert.deepEqual(await deniedLogin.json(), { error: "invalid_admin_login" });

    const login = await fetch(`${baseUrl}/api/admin-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operatorRef: "admin_operator_1", bootstrapToken: "bootstrap-secret" })
    });
    assert.equal(login.status, 202);
    const loginBody = await login.json();
    assert.equal(loginBody.challenge.challengeRef, "admin_totp_challenge_1");
    assert.deepEqual(loginBody.challenge.methods, ["totp"]);
    assert.doesNotMatch(JSON.stringify(loginBody), /console-secret|bootstrap-secret|JBSWY3DPEHPK3PXP|enc:/);

    const deniedTotp = await fetch(`${baseUrl}/api/admin-auth/totp/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeRef: "admin_totp_challenge_1", code: "000000" })
    });
    assert.equal(deniedTotp.status, 401);
    assert.equal(deniedTotp.headers.get("set-cookie"), null);

    const verified = await fetch(`${baseUrl}/api/admin-auth/totp/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeRef: "admin_totp_challenge_1", code: "654321" })
    });
    assert.equal(verified.status, 200);
    const secondCookie = verified.headers.get("set-cookie").split(";")[0];
    assert.doesNotMatch(JSON.stringify(await verified.json()), /console-secret|bootstrap-secret|654321|JBSWY3DPEHPK3PXP|enc:/);

    const protectedApi = await fetch(`${baseUrl}/api/admin/subscriptions`, {
      headers: { Cookie: secondCookie }
    });
    assert.equal(protectedApi.status, 200);
    assert.deepEqual(await protectedApi.json(), { items: [{ id: "tenant_1" }] });
  } finally {
    server.close();
  }
});

test("portal account backed admin auth permits only the configured account with password and TOTP", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "admin-auth-portal-account-"));
  const store = createSqliteSubscriptionControlStore({
    dbPath: join(tempDir, "control.sqlite")
  });
  try {
    store.createAccount({
      id: "portal_user_admin_001",
      ownerRef: "owner_safe_ref",
      status: "active",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z"
    });
    const passwordCredentialService = createPortalPasswordCredentialService({
      controlStore: store,
      nowFn: () => "2026-07-01T00:00:00.000Z",
      saltFactory: () => Buffer.from("0123456789abcdef", "utf8"),
      credentialRefFactory: () => "portal_pwd_admin_1"
    });
    passwordCredentialService.issueInitialPasswordCredential({
      accountId: "portal_user_admin_001",
      plainPassword: "synthetic-portal-password",
      issuedByRef: "operator_safe_ref",
      approvalRef: "approval_safe_ref"
    });
    store.createPortalTotpCredential({
      id: "portal_totp_admin_1",
      accountId: "portal_user_admin_001",
      encryptedTotpSecret: "enc:portal-admin-totp",
      status: "active",
      failureCount: 0,
      enrolledAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z"
    });

    const state = baseState();
    state.platform.adminAuthRoutesEnabled = true;
    state.platform.adminAuth = createPortalAccountAdminAuthService({
      controlStore: store,
      passwordCredentialService,
      nowFn: () => "2026-07-01T00:00:00.000Z",
      sessionSecret: "synthetic-admin-session-secret",
      accountId: "portal_user_admin_001",
      challengeRefFactory: () => "admin_portal_challenge_1",
      sessionRefFactory: () => "admin_portal_session_1",
      totpVerifier: ({ encryptedTotpSecret, code }) => encryptedTotpSecret === "enc:portal-admin-totp" && code === "654321"
    });
    const app = createApp(state);
    const { server, baseUrl } = await listen(app);
    try {
      const status = await fetch(`${baseUrl}/api/admin-auth/session`);
      assert.equal(status.status, 200);
      assert.deepEqual(await status.json(), {
        authenticated: false,
        mode: "portalAccount",
        operatorRef: "portal_user_admin_001",
        setupRequired: false
      });

      const wrongAccount = await fetch(`${baseUrl}/api/admin-auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatorRef: "portal_user_other", bootstrapToken: "synthetic-portal-password" })
      });
      assert.equal(wrongAccount.status, 401);

      const login = await fetch(`${baseUrl}/api/admin-auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatorRef: "portal_user_admin_001", bootstrapToken: "synthetic-portal-password" })
      });
      assert.equal(login.status, 202);
      const loginBody = await login.json();
      assert.equal(loginBody.challenge.challengeRef, "admin_portal_challenge_1");
      assert.equal(loginBody.challenge.operatorRef, "portal_user_admin_001");
      assert.doesNotMatch(JSON.stringify(loginBody), /synthetic-portal-password|portal-admin-totp|enc:/);

      const verified = await fetch(`${baseUrl}/api/admin-auth/totp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeRef: "admin_portal_challenge_1", code: "654321" })
      });
      assert.equal(verified.status, 200);
      const cookie = verified.headers.get("set-cookie").split(";")[0];
      const verifiedBody = await verified.json();
      assert.equal(verifiedBody.session.operatorRef, "portal_user_admin_001");
      assert.doesNotMatch(JSON.stringify(verifiedBody), /synthetic-portal-password|654321|portal-admin-totp|enc:/);

      const protectedApi = await fetch(`${baseUrl}/api/admin/subscriptions`, {
        headers: { Cookie: cookie }
      });
      assert.equal(protectedApi.status, 200);
      assert.deepEqual(await protectedApi.json(), { items: [{ id: "tenant_1" }] });
    } finally {
      server.close();
    }
  } finally {
    store.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});
