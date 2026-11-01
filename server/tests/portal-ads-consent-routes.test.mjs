import assert from "node:assert/strict";
import { createServer } from "node:http";
import express from "express";
import Database from "better-sqlite3";
import test from "node:test";

import { userPortalRoutes } from "../routes/user-portal.mjs";
import { createSqliteAdsConsentStore } from "../services/platform/ads-consent-store.mjs";

const NOW = Date.parse("2026-11-01T00:00:00.000Z");

async function createHarness() {
  const database = new Database(":memory:");
  const adsConsentStore = createSqliteAdsConsentStore({
    database,
    env: { ADS_CLICK_BINDING_ENABLED: "true" },
    nowFn: () => NOW
  });
  const auth = {
    requireSession({ sessionRef }) {
      if (sessionRef === "portal_session_valid") {
        return { sessionRef, accountId: "acct_portal_ads" };
      }
      if (sessionRef === "portal_session_other") {
        return { sessionRef, accountId: "acct_portal_other" };
      }
      const error = new Error("invalid session");
      error.code = "invalid_session";
      throw error;
    }
  };
  const browserSessions = {
    middleware(_req, _res, next) { next(); },
    session() { return null; }
  };
  const app = express();
  app.use(express.json());
  app.use(userPortalRoutes({
    platform: { userPortalAuth: auth, adsConsentStore }
  }, { browserSessions }));
  const server = createServer(app);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    baseUrl,
    database,
    async close() {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      adsConsentStore.close();
      database.close();
    }
  };
}

async function request(harness, method, path, { session = "portal_session_valid", body } = {}) {
  return fetch(`${harness.baseUrl}${path}`, {
    method,
    headers: {
      ...(session ? { "x-portal-session": session } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

test("Portal consent endpoint requires an authenticated session and never accepts caller account references", async () => {
  const harness = await createHarness();
  try {
    const anonymous = await request(harness, "GET", "/api/portal/ads-consent", { session: null });
    assert.equal(anonymous.status, 401);

    const invalidBody = await request(harness, "POST", "/api/portal/ads-consent", {
      body: { accountRef: "acct_attacker", adUserData: true }
    });
    assert.equal(invalidBody.status, 400);
    assert.deepEqual(await invalidBody.json(), { error: "validation_error" });

    const other = await request(harness, "GET", "/api/portal/ads-consent", {
      session: "portal_session_other"
    });
    assert.equal(other.status, 200);
    assert.deepEqual((await other.json()).consent, {
      decision: "unknown",
      adUserData: null,
      adPersonalization: false,
      updatedAt: null
    });
  } finally {
    await harness.close();
  }
});

test("authenticated Portal grant and withdrawal are reflected by server-side consent state", async () => {
  const harness = await createHarness();
  try {
    const grant = await request(harness, "POST", "/api/portal/ads-consent", {
      body: { adUserData: true }
    });
    assert.equal(grant.status, 200);
    assert.equal(grant.headers.get("cache-control"), "no-store");
    assert.equal(grant.headers.get("referrer-policy"), "no-referrer");
    assert.deepEqual((await grant.json()).consent, {
      decision: "granted",
      adUserData: true,
      adPersonalization: false,
      updatedAt: NOW,
      revocation: {
        redactedClaimCount: 0,
        deletedBindingCount: 0,
        skippedOutboxCount: 0,
        deletedLinkCount: 0
      },
      unverifiedCleanup: {
        redactedClaimCount: 0,
        deletedBindingCount: 0,
        skippedOutboxCount: 0
      }
    });

    const current = await request(harness, "GET", "/api/portal/ads-consent");
    assert.deepEqual((await current.json()).consent, {
      decision: "granted",
      adUserData: true,
      adPersonalization: false,
      updatedAt: NOW
    });

    const revoke = await request(harness, "POST", "/api/portal/ads-consent", {
      body: { adUserData: false }
    });
    assert.equal(revoke.status, 200);
    assert.deepEqual((await revoke.json()).consent, {
      decision: "denied",
      adUserData: false,
      adPersonalization: false,
      updatedAt: NOW,
      revocation: {
        redactedClaimCount: 0,
        deletedBindingCount: 0,
        skippedOutboxCount: 0,
        deletedLinkCount: 0
      },
      unverifiedCleanup: {
        redactedClaimCount: 0,
        deletedBindingCount: 0,
        skippedOutboxCount: 0
      }
    });
  } finally {
    await harness.close();
  }
});

test("Portal consent endpoint rejects malformed and non-boolean decisions", async () => {
  const harness = await createHarness();
  try {
    for (const body of [{ adUserData: "true" }, { adUserData: true, adPersonalization: true }, {}]) {
      const response = await request(harness, "POST", "/api/portal/ads-consent", { body });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: "validation_error" });
    }
  } finally {
    await harness.close();
  }
});
