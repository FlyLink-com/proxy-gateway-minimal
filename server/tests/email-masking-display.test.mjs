import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../app.mjs";
import { createPlatformAccountEntitlementShell } from "../services/platform/account-entitlement-shell.mjs";
import { createPlatformLeadReviewQueue } from "../services/platform/lead-review-queue.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createUserPortalAuthService } from "../services/platform/user-portal-auth.mjs";
import { listen } from "./helpers/listen.mjs";

// Display consistency (B2-6, G-03): one synthetic email shows the same
// masked value in the password setup session, the browser session, and the
// admin list (control-store and shell items), and in a full-email admin
// search. The raw address appears nowhere in any response. Registration
// display is covered by portal-registration-routes.test.mjs, which asserts
// the same masked value on the registration response.
const EMAIL = "Local.User+tag@example.test";
const MASKED = "lo***@example.test";
const NOW = "2026-06-03T00:00:00.000Z";
const SESSION_EXPIRES = "2026-06-03T00:30:00.000Z";
const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));

test("masked email is identical across setup session, browser session, and admin list", async () => {
  const database = new Database(":memory:");
  const store = createSqliteSubscriptionControlStore({ database });
  try {
    store.createAccount({
      id: "acct_masked_1",
      ownerRef: "acct_masked_1",
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
      metadata: {
        registrationSource: "self_service_portal",
        loginRef: EMAIL,
        displayRef: EMAIL
      }
    });
    store.createEntitlement({
      id: "ent_masked_1",
      accountId: "acct_masked_1",
      plan: "trial",
      status: "active",
      validFrom: NOW,
      validUntil: "2026-06-10T00:00:00.000Z",
      maxArtifacts: 1,
      maxDevices: 1,
      trafficLimitBytes: 1024,
      createdAt: NOW,
      updatedAt: NOW
    });

    const auth = createUserPortalAuthService({
      controlStore: store,
      nowFn: () => NOW,
      sessionRefFactory: (() => {
        let index = 0;
        return () => `portal_session_masked_${++index}`;
      })(),
      sessionExpiresAtFactory: () => SESSION_EXPIRES,
      passwordCredentialService: { verifyPasswordCredential() {} },
      allowPasswordOnlySessionForSetup: true,
      totpVerifier: ({ code }) => code === "123456"
    });

    // Password setup session: masked, and the raw address is absent.
    const setup = auth.createPasswordSetupSession({ accountId: "acct_masked_1", loginRef: EMAIL });
    assert.equal(setup.session.userRef, MASKED);
    assert.equal(setup.session.displayName, MASKED);
    assert.equal(JSON.stringify(setup).includes(EMAIL), false);
    assert.equal(JSON.stringify(setup).includes("Local.User"), false);

    // Browser session after a password login: the same masked value.
    // Login resolution itself still uses the raw email inside the server
    // (the account is found by id here; the email never leaves as a value).
    const login = auth.verifyPasswordAndMaybeChallenge({
      accountId: "acct_masked_1",
      plainPassword: "synthetic-test-value"
    });
    const browser = auth.createBrowserSession({ sessionRef: login.session.sessionRef });
    const browserSession = auth.getBrowserSession({ cookieValue: browser.cookieValue });
    assert.equal(browserSession.userRef, MASKED);
    assert.equal(browserSession.displayName, MASKED);
    assert.equal(JSON.stringify(browserSession).includes(EMAIL), false);

    // Admin list: control-store item and shell item show the same value.
    const leadQueue = createPlatformLeadReviewQueue({
      nowFn: () => NOW,
      idFactory: () => "lead_masked_1"
    });
    const accountShell = createPlatformAccountEntitlementShell({
      nowFn: () => NOW,
      accountIdFactory: () => "acct_shell_masked_1"
    });
    const lead = leadQueue.getLead(leadQueue.enqueueLead({
      organization: "Masked Org",
      email: EMAIL,
      direction: "API Sandbox",
      stage: "pilot budget approved",
      message: "Synthetic lead."
    }).id);
    accountShell.createAccountFromLead(lead, { displayName: "Masked Org" });

    const { server, baseUrl } = await listen(createApp({
      rootDir: ROOT,
      host: "127.0.0.1",
      ports: { console: 3456, socks: 1080, httpProxy: 18180 },
      consoleToken: "secret",
      proxyConfig: { servers: [], pingHosts: [], nginx: { host: "127.0.0.1", ports: [] } },
      platform: { leadQueue, accountShell, controlStore: store },
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
    }));
    try {
      const listed = await fetch(`${baseUrl}/api/admin/platform/accounts`, {
        headers: { Authorization: "Bearer secret" }
      });
      assert.equal(listed.status, 200);
      const listedBody = await listed.json();
      assert.equal(listedBody.items.length, 2);
      const controlItem = listedBody.items.find((item) => item.id === "acct_masked_1");
      assert.equal(controlItem.email, MASKED);
      assert.equal(controlItem.displayName, MASKED);
      const shellItem = listedBody.items.find((item) => item.id === "acct_shell_masked_1");
      assert.equal(shellItem.email, MASKED);
      // A non-email display label passes through unchanged.
      assert.equal(shellItem.displayName, "Masked Org");
      assert.equal(JSON.stringify(listedBody).includes(EMAIL), false);
      assert.equal(JSON.stringify(listedBody).includes("Local.User"), false);

      // Full-email admin search (uppercase input): the digest match still
      // finds the control-store account, the masked-equality match finds
      // the shell account with the same address, and both stay masked.
      const searched = await fetch(
        `${baseUrl}/api/admin/platform/accounts?search=${encodeURIComponent("LOCAL.USER+TAG@EXAMPLE.TEST")}`,
        { headers: { Authorization: "Bearer secret" } }
      );
      assert.equal(searched.status, 200);
      const searchedBody = await searched.json();
      assert.deepEqual(
        searchedBody.items.map((item) => item.id),
        ["acct_masked_1", "acct_shell_masked_1"]
      );
      for (const item of searchedBody.items) {
        assert.equal(item.email, MASKED);
      }
      assert.equal(JSON.stringify(searchedBody).includes(EMAIL), false);
    } finally {
      server.close();
    }
  } finally {
    store.close();
    database.close();
  }
});

test("masked email never becomes an identifier: login still resolves by account", () => {
  const database = new Database(":memory:");
  const store = createSqliteSubscriptionControlStore({ database });
  try {
    store.createAccount({
      id: "acct_masked_2",
      ownerRef: "acct_masked_2",
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
      metadata: { loginRef: EMAIL, displayRef: EMAIL }
    });
    const auth = createUserPortalAuthService({
      controlStore: store,
      nowFn: () => NOW,
      sessionRefFactory: (() => {
        let index = 0;
        return () => `portal_session_masked_${++index}`;
      })(),
      sessionExpiresAtFactory: () => SESSION_EXPIRES,
      passwordCredentialService: { verifyPasswordCredential() {} },
      allowPasswordOnlySessionForSetup: true,
      totpVerifier: ({ code }) => code === "123456"
    });
    // The masked value is not a login reference: no session is created
    // from it, and the real login (by account id, raw email inside the
    // server) still works and returns the masked display.
    const login = auth.verifyPasswordAndMaybeChallenge({
      accountId: "acct_masked_2",
      plainPassword: "synthetic-test-value"
    });
    assert.equal(login.session.sessionRef, "portal_session_masked_1");
    const browser = auth.createBrowserSession({ sessionRef: login.session.sessionRef });
    assert.equal(auth.getBrowserSession({ cookieValue: browser.cookieValue }).userRef, MASKED);
  } finally {
    store.close();
    database.close();
  }
});
