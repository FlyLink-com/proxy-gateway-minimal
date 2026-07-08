import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../app.mjs";
import { createPortalAccountAdminAuthService } from "../services/platform/admin-auth.mjs";
import { createPortalPasswordCredentialService } from "../services/platform/portal-password-credentials.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { listen } from "./helpers/listen.mjs";

const ROOT_DIR = new URL("../../", import.meta.url).pathname;
const ADMIN_ACCOUNT_ID = "portal_user_20260604_001";

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

test("admin-auth session exposes the configured portal admin and gates admin APIs by session cookie", async () => {
  const state = baseState({
    platform: {
      adminAuthRoutesEnabled: true,
      adminAuth: {
        sessionStatus: () => ({
          authenticated: false,
          mode: "portalAccount",
          operatorRef: ADMIN_ACCOUNT_ID,
          setupRequired: false
        }),
        authenticateCookie: ({ cookieHeader }) => (
          String(cookieHeader || "").includes("gcc_admin_session=valid")
            ? {
              sessionRef: "admin_session_1",
              operatorRef: ADMIN_ACCOUNT_ID,
              authMethod: "totp"
            }
            : null
        )
      }
    }
  });
  const app = createApp(state);
  const { server, baseUrl } = await listen(app);
  try {
    const status = await fetch(`${baseUrl}/api/admin-auth/session`);
    assert.equal(status.status, 200);
    assert.deepEqual(await status.json(), {
      authenticated: false,
      mode: "portalAccount",
      operatorRef: ADMIN_ACCOUNT_ID,
      setupRequired: false
    });

    const bearerOnly = await fetch(`${baseUrl}/api/admin/subscriptions`, {
      headers: { Authorization: "Bearer console-secret" }
    });
    assert.equal(bearerOnly.status, 401);

    const protectedApi = await fetch(`${baseUrl}/api/admin/subscriptions`, {
      headers: { Cookie: "gcc_admin_session=valid" }
    });
    assert.equal(protectedApi.status, 200);
    assert.deepEqual(await protectedApi.json(), { items: [{ id: "tenant_1" }] });
  } finally {
    server.close();
  }
});

test("portal-account admin auth permits only portal_user_20260604_001 with password and TOTP", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "admin-auth-portal-account-"));
  const store = createSqliteSubscriptionControlStore({
    dbPath: join(tempDir, "control.sqlite")
  });
  try {
    store.createAccount({
      id: ADMIN_ACCOUNT_ID,
      ownerRef: "owner_safe_ref",
      status: "active",
      createdAt: "2026-07-08T00:00:00.000Z",
      updatedAt: "2026-07-08T00:00:00.000Z"
    });
    const passwordCredentialService = createPortalPasswordCredentialService({
      controlStore: store,
      nowFn: () => "2026-07-08T00:00:00.000Z",
      saltFactory: () => Buffer.from("0123456789abcdef", "utf8"),
      credentialRefFactory: () => "portal_pwd_admin_1"
    });
    passwordCredentialService.issueInitialPasswordCredential({
      accountId: ADMIN_ACCOUNT_ID,
      plainPassword: "synthetic-portal-password",
      issuedByRef: "operator_safe_ref",
      approvalRef: "approval_safe_ref"
    });
    store.createPortalTotpCredential({
      id: "portal_totp_admin_1",
      accountId: ADMIN_ACCOUNT_ID,
      encryptedTotpSecret: "enc:portal-admin-totp",
      status: "active",
      failureCount: 0,
      enrolledAt: "2026-07-08T00:00:00.000Z",
      updatedAt: "2026-07-08T00:00:00.000Z"
    });

    const state = baseState({
      platform: {
        adminAuthRoutesEnabled: true,
        controlStore: store,
        adminAuth: createPortalAccountAdminAuthService({
          controlStore: store,
          passwordCredentialService,
          nowFn: () => "2026-07-08T00:00:00.000Z",
          sessionSecret: "synthetic-admin-session-secret",
          accountId: ADMIN_ACCOUNT_ID,
          challengeRefFactory: () => "admin_portal_challenge_1",
          sessionRefFactory: () => "admin_portal_session_1",
          totpVerifier: ({ encryptedTotpSecret, code }) => (
            encryptedTotpSecret === "enc:portal-admin-totp" && code === "654321"
          )
        })
      }
    });
    const app = createApp(state);
    const { server, baseUrl } = await listen(app);
    try {
      const status = await fetch(`${baseUrl}/api/admin-auth/session`);
      assert.equal(status.status, 200);
      assert.deepEqual(await status.json(), {
        authenticated: false,
        mode: "portalAccount",
        operatorRef: ADMIN_ACCOUNT_ID,
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
        body: JSON.stringify({ operatorRef: ADMIN_ACCOUNT_ID, bootstrapToken: "synthetic-portal-password" })
      });
      assert.equal(login.status, 202);
      const loginBody = await login.json();
      assert.equal(loginBody.challenge.challengeRef, "admin_portal_challenge_1");
      assert.equal(loginBody.challenge.operatorRef, ADMIN_ACCOUNT_ID);
      assert.doesNotMatch(JSON.stringify(loginBody), /synthetic-portal-password|portal-admin-totp|enc:/);

      const badTotp = await fetch(`${baseUrl}/api/admin-auth/totp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeRef: "admin_portal_challenge_1", code: "000000" })
      });
      assert.equal(badTotp.status, 401);

      const secondLogin = await fetch(`${baseUrl}/api/admin-auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatorRef: ADMIN_ACCOUNT_ID, bootstrapToken: "synthetic-portal-password" })
      });
      assert.equal(secondLogin.status, 202);

      const verified = await fetch(`${baseUrl}/api/admin-auth/totp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeRef: "admin_portal_challenge_1", code: "654321" })
      });
      assert.equal(verified.status, 200);
      const cookie = verified.headers.get("set-cookie").split(";")[0];
      const verifiedBody = await verified.json();
      assert.equal(verifiedBody.session.operatorRef, ADMIN_ACCOUNT_ID);
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
