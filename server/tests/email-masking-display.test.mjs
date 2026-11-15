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

test("stored displayEmailMasked wins over the derived mask, and a raw value stored in that field is rejected", async () => {
  const database = new Database(":memory:");
  const store = createSqliteSubscriptionControlStore({ database });
  try {
    // A: stored masked value differs from what the legacy loginRef would
    // derive (lo*** vs ot***). The stored value must win everywhere.
    store.createAccount({
      id: "acct_stored_masked_1",
      ownerRef: "acct_stored_masked_1",
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
      metadata: {
        registrationSource: "self_service_portal",
        loginRef: "other@example.test",
        displayRef: "other@example.test",
        displayEmailMasked: "lo***@example.test"
      }
    });
    // B: a raw email in displayEmailMasked. The write boundary rejects it,
    // so it can only exist as a malformed historical row: inject it with raw
    // SQL (the write-path audit's own precedent for malformed fixtures) and
    // prove the display readers fall back to the derived mask instead.
    store.createAccount({
      id: "acct_raw_masked_field_1",
      ownerRef: "acct_raw_masked_field_1",
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
      metadata: {
        registrationSource: "self_service_portal",
        loginRef: "member@example.test",
        displayRef: "member@example.test"
      }
    });
    {
      const row = database.prepare(
        "SELECT metadata_json FROM platform_accounts WHERE id = ?"
      ).get("acct_raw_masked_field_1");
      const metadata = JSON.parse(row.metadata_json);
      metadata.displayEmailMasked = "member@example.test";
      database.prepare(
        "UPDATE platform_accounts SET metadata_json = ? WHERE id = ?"
      ).run(JSON.stringify(metadata), "acct_raw_masked_field_1");
    }
    // C: no loginRef at all. The stored masked value is the only display
    // source; without it the session would fall back to "user_account".
    store.createAccount({
      id: "acct_no_login_ref_1",
      ownerRef: "acct_no_login_ref_1",
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
      metadata: {
        registrationSource: "self_service_portal",
        displayEmailMasked: "no***@example.test"
      }
    });

    const auth = createUserPortalAuthService({
      controlStore: store,
      nowFn: () => NOW,
      sessionRefFactory: (() => {
        let index = 0;
        return () => `portal_session_stored_${++index}`;
      })(),
      sessionExpiresAtFactory: () => SESSION_EXPIRES,
      passwordCredentialService: { verifyPasswordCredential() {} },
      allowPasswordOnlySessionForSetup: true,
      totpVerifier: ({ code }) => code === "123456"
    });

    // Setup session: stored value wins for A; raw stored value is rejected
    // for B and the derived mask is used instead.
    const setupA = auth.createPasswordSetupSession({ accountId: "acct_stored_masked_1", loginRef: "other@example.test" });
    assert.equal(setupA.session.userRef, "lo***@example.test");
    assert.equal(setupA.session.displayName, "lo***@example.test");
    assert.equal(JSON.stringify(setupA).includes("other@example.test"), false);
    const setupB = auth.createPasswordSetupSession({ accountId: "acct_raw_masked_field_1", loginRef: "member@example.test" });
    assert.equal(setupB.session.userRef, "me***@example.test");
    assert.equal(setupB.session.displayName, "me***@example.test");
    assert.equal(JSON.stringify(setupB).includes("member@example.test"), false);

    // Browser session: stored value wins for A; C shows the stored value
    // instead of the "user_account" fallback.
    const loginA = auth.verifyPasswordAndMaybeChallenge({
      accountId: "acct_stored_masked_1",
      plainPassword: "synthetic-test-value"
    });
    const browserA = auth.createBrowserSession({ sessionRef: loginA.session.sessionRef });
    assert.equal(auth.getBrowserSession({ cookieValue: browserA.cookieValue }).userRef, "lo***@example.test");
    const loginC = auth.verifyPasswordAndMaybeChallenge({
      accountId: "acct_no_login_ref_1",
      plainPassword: "synthetic-test-value"
    });
    const browserC = auth.createBrowserSession({ sessionRef: loginC.session.sessionRef });
    const sessionC = auth.getBrowserSession({ cookieValue: browserC.cookieValue });
    assert.equal(sessionC.userRef, "no***@example.test");
    assert.equal(sessionC.displayName, "no***@example.test");

    // Admin list: the same stored values, never the raw login reference.
    const leadQueue = createPlatformLeadReviewQueue({
      nowFn: () => NOW,
      idFactory: () => "lead_stored_1"
    });
    const accountShell = createPlatformAccountEntitlementShell({
      nowFn: () => NOW,
      accountIdFactory: () => "acct_shell_stored_1"
    });
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
      assert.equal(listedBody.items.length, 3);
      const itemA = listedBody.items.find((item) => item.id === "acct_stored_masked_1");
      assert.equal(itemA.email, "lo***@example.test");
      assert.equal(itemA.displayName, "lo***@example.test");
      const itemB = listedBody.items.find((item) => item.id === "acct_raw_masked_field_1");
      assert.equal(itemB.email, "me***@example.test");
      assert.equal(itemB.displayName, "me***@example.test");
      const itemC = listedBody.items.find((item) => item.id === "acct_no_login_ref_1");
      assert.equal(itemC.email, "no***@example.test");
      assert.equal(itemC.displayName, "no***@example.test");
      assert.equal(JSON.stringify(listedBody).includes("other@example.test"), false);
      assert.equal(JSON.stringify(listedBody).includes("member@example.test"), false);
    } finally {
      server.close();
    }
  } finally {
    store.close();
    database.close();
  }
});
