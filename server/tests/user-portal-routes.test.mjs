import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createApp } from "../app.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createUserPortalAuthService } from "../services/platform/user-portal-auth.mjs";
import { listen } from "./helpers/listen.mjs";

const NOW = "2026-05-31T00:00:00.000Z";
const FUTURE = "2099-06-04T00:00:00.000Z";
const SESSION_EXPIRES = "2026-05-31T00:30:00.000Z";

function seedAccountAndEntitlement(store) {
  store.createAccount({
    id: "acct_portal_route_1",
    ownerRef: "owner_safe_ref",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW
  });
  store.createEntitlement({
    id: "ent_portal_route_1",
    accountId: "acct_portal_route_1",
    plan: "pilot",
    status: "active",
    validFrom: NOW,
    validUntil: FUTURE,
    maxArtifacts: 1,
    maxDevices: 1,
    trafficLimitBytes: 1024,
    createdAt: NOW,
    updatedAt: NOW
  });
}

function baseState(platform = {}) {
  return {
    rootDir: resolve(fileURLToPath(new URL("../../", import.meta.url))),
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: "secret",
    proxyConfig: { servers: [], pingHosts: [], nginx: { host: "127.0.0.1", ports: [] } },
    platform,
    services: {
      ssLocal: {
        start: async () => ({ ok: true }),
        stop: async () => ({ ok: true }),
        status: () => ({ running: false, starting: false })
      },
      httpProxy: {
        start: async () => ({ ok: true }),
        stop: async () => ({ ok: true }),
        status: () => ({ running: false, starting: false })
      }
    },
    isPortListening: async () => false
  };
}

function withPortalState(fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "user-portal-routes-"));
  let store;
  let shouldCleanup = true;
  const cleanup = () => {
    if (!shouldCleanup) {
      return;
    }
    shouldCleanup = false;
    store?.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  };
  try {
    store = createSqliteSubscriptionControlStore({
      dbPath: join(tempDir, "control.sqlite")
    });
    seedAccountAndEntitlement(store);
    const auth = createUserPortalAuthService({
      controlStore: store,
      nowFn: () => NOW,
      entryTokenFactory: () => "portal-route-raw-entry-token",
      entryRefFactory: () => "entry_portal_route_1",
      credentialRefFactory: () => "totp_route_1",
      sessionRefFactory: () => "portal_session_route_1",
      sessionExpiresAtFactory: () => SESSION_EXPIRES,
      totpVerifier: ({ encryptedTotpSecret, code }) => encryptedTotpSecret === "enc:route-totp-secret" && code === "123456"
    });
    const issued = auth.issueDynamicEntry({
      accountId: "acct_portal_route_1",
      entitlementId: "ent_portal_route_1",
      approvalRef: "approval_portal_route_1",
      issuedByRef: "operator_safe_ref",
      expiresAt: FUTURE
    });
    const result = fn({
      store,
      auth,
      entryToken: issued.handoffMaterial.entryToken
    });
    if (result && typeof result.then === "function") {
      shouldCleanup = false;
      return result.finally(() => {
        shouldCleanup = true;
        cleanup();
      });
    }
    cleanup();
    return result;
  } finally {
    cleanup();
  }
}

test("user portal routes stay unavailable unless explicitly enabled", async () => {
  const { server, baseUrl } = await listen(createApp(baseState()));
  try {
    const response = await fetch(`${baseUrl}/api/portal/entry/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entryToken: "not-used",
        encryptedTotpSecret: "enc:route-totp-secret"
      })
    });

    assert.equal(response.status, 401);
  } finally {
    server.close();
  }
});

test("user portal routes consume dynamic entry and create scoped session without exposing secrets", async () => {
  await withPortalState(async ({ store, auth, entryToken }) => {
    const { server, baseUrl } = await listen(createApp(baseState({
      userPortalAuth: auth,
      userPortalRoutesEnabled: true
    })));
    try {
      const enrollResponse = await fetch(`${baseUrl}/api/portal/entry/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryToken,
          encryptedTotpSecret: "enc:route-totp-secret"
        })
      });
      assert.equal(enrollResponse.status, 200);
      const enrollmentBody = await enrollResponse.json();
      assert.equal(enrollmentBody.enrollment.action, "totp_enrolled");
      assert.equal(enrollmentBody.enrollment.accountId, "acct_portal_route_1");
      assert.equal(store.getPortalEntry("entry_portal_route_1").status, "used");

      const sessionResponse = await fetch(`${baseUrl}/api/portal/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: "acct_portal_route_1",
          code: "123456"
        })
      });
      assert.equal(sessionResponse.status, 200);
      const sessionBody = await sessionResponse.json();
      assert.equal(sessionBody.session.sessionRef, "portal_session_route_1");
      assert.equal(sessionBody.session.expiresAt, SESSION_EXPIRES);

      const serialized = JSON.stringify({ enrollmentBody, sessionBody });
      assert.equal(serialized.includes(entryToken), false);
      assert.equal(serialized.includes("enc:route-totp-secret"), false);
      assert.equal(serialized.includes("123456"), false);
      assert.equal(serialized.includes("subscriptionUrl"), false);
      assert.equal(serialized.includes("token="), false);
      assert.equal(store.listPortalSessions({ accountId: "acct_portal_route_1" }).length, 1);
    } finally {
      server.close();
    }
  });
});
