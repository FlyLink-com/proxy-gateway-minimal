import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import Database from "better-sqlite3";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createUserPortalAuthService } from "../services/platform/user-portal-auth.mjs";

const START = "2026-09-06T12:00:00.000Z";
const digest = (value) => createHash("sha256").update(value).digest("hex");
const internalId = (value) => `portalbrowser_${digest(value)}`;
function fixture(run) {
  const db = new Database(":memory:");
  const store = createSqliteSubscriptionControlStore({ database: db });
  let now = START;
  let nextSession = 0;
  store.createAccount({ id: "acct_browser_test", ownerRef: "owner_browser_test", status: "active", createdAt: START, updatedAt: START,
    metadata: { loginRef: "browser@example.test", displayRef: "browser@example.test" } });
  const service = (overrides = {}) => createUserPortalAuthService({
    controlStore: store, nowFn: () => now, sessionRefFactory: () => `portal_session_test_${++nextSession}`,
    secondFactorChallengeRefFactory: () => `portal_mfa_test_${++nextSession}`,
    passwordCredentialService: { verifyPasswordCredential() {} },
    allowPasswordOnlySessionForSetup: true, totpVerifier: ({ code }) => code === "123456", ...overrides
  });
  const auth = service();
  const login = (rememberMe = false, target = auth) => target.verifyPasswordAndMaybeChallenge({
    accountId: "acct_browser_test", plainPassword: "synthetic-test-value", rememberMe
  });
  try { return run({ db, store, auth, service, login, setNow(value) { now = value; } }); }
  finally { store.close(); }
}

for (const [rememberMe, expiresAt] of [[false, "2026-09-06T12:30:00.000Z"], [true, "2026-09-13T12:00:00.000Z"]]) {
  test(`browser conversion persists only a credential digest with absolute ${rememberMe ? "seven-day" : "thirty-minute"} expiry`, () => fixture(({ db, store, auth, login, setNow, service }) => {
    const before = db.prepare("select type, name, sql from sqlite_master order by type, name").all();
    const initial = login(rememberMe);
    setNow("2026-09-06T12:00:30.000Z");
    const result = auth.createBrowserSession({ sessionRef: initial.session.sessionRef, rememberMe });
    assert.match(result.cookieValue, /^[A-Za-z0-9_-]{43}$/);
    const id = internalId(result.cookieValue);
    assert.equal(result.session.sessionRef, `portalctx_${digest(`context:${id}`)}`);
    assert.equal(result.session.transport, "cookie");
    assert.equal(result.session.expiresAt, expiresAt);
    assert.equal(result.session.issuedAt, START);
    assert.equal(store.getPortalSession(id).expiresAt, expiresAt);
    assert.equal(store.getPortalSession(initial.session.sessionRef).status, "revoked");
    assert.equal(store.getPortalSession(result.cookieValue), null);
    assert.equal(JSON.stringify(result.session).includes(result.cookieValue), false);
    assert.equal(JSON.stringify(result.session).includes(id), false);
    assert.deepEqual(db.prepare("select type, name, sql from sqlite_master order by type, name").all(), before);
    assert.equal(service().getBrowserSession({ cookieValue: result.cookieValue }).expiresAt, expiresAt);
  }));
}

test("browser conversion rejects remembered escalation and malformed preference", () => fixture(({ auth, login, store }) => {
  const initial = login(false);
  assert.throws(() => auth.createBrowserSession({ sessionRef: initial.session.sessionRef, rememberMe: true }), /session|remember/i);
  assert.throws(() => auth.createBrowserSession({ sessionRef: initial.session.sessionRef, rememberMe: "true" }), /remember/i);
  assert.equal(store.listPortalSessions({ accountId: "acct_browser_test" }).length, 1);
  assert.throws(() => login("true"), /remember/i);
}));

test("browser conversion is fresh, one-use, and unavailable to another service instance", () => fixture(({ auth, login, service, setNow, store }) => {
  const initial = login();
  assert.throws(() => service().createBrowserSession({ sessionRef: initial.session.sessionRef }), /session/i);
  setNow("2026-09-06T12:01:01.000Z");
  assert.throws(() => auth.createBrowserSession({ sessionRef: initial.session.sessionRef }), /session/i);
  const fresh = login();
  auth.createBrowserSession({ sessionRef: fresh.session.sessionRef });
  assert.throws(() => auth.createBrowserSession({ sessionRef: fresh.session.sessionRef }), /session/i);
  assert.equal(store.listPortalSessions({ accountId: "acct_browser_test" }).length, 3);
}));

test("browser credential/context are not legacy bearer credentials and require exact context", () => fixture(({ auth, login }) => {
  const result = auth.createBrowserSession({ sessionRef: login().session.sessionRef });
  for (const sessionRef of [result.cookieValue, internalId(result.cookieValue), result.session.sessionRef]) {
    assert.throws(() => auth.requireSession({ sessionRef }), /session/i);
  }
  assert.throws(() => auth.requireBrowserSession({ cookieValue: result.cookieValue, sessionContext: "portalctx_wrong" }), /session/i);
  assert.deepEqual(auth.requireBrowserSession({ cookieValue: result.cookieValue, sessionContext: result.session.sessionRef }), {
    sessionRef: internalId(result.cookieValue), accountId: "acct_browser_test"
  });
}));

test("browser bootstrap has absolute expiry, no sliding writes, and checks account state", () => fixture(({ auth, login, store, db, setNow }) => {
  const result = auth.createBrowserSession({ sessionRef: login().session.sessionRef });
  const stored = store.getPortalSession(internalId(result.cookieValue));
  setNow("2026-09-06T12:29:59.999Z");
  auth.getBrowserSession({ cookieValue: result.cookieValue });
  assert.deepEqual(store.getPortalSession(stored.sessionRef), stored);
  db.prepare("update platform_accounts set status = 'disabled' where id = ?").run("acct_browser_test");
  assert.throws(() => auth.getBrowserSession({ cookieValue: result.cookieValue }), { code: "invalid_session" });
  db.prepare("update platform_accounts set status = 'active' where id = ?").run("acct_browser_test");
  setNow("2026-09-06T12:30:00.000Z");
  assert.throws(() => auth.getBrowserSession({ cookieValue: result.cookieValue }), /session/i);
}));

test("browser logout is idempotent but a wrong context cannot revoke", () => fixture(({ auth, login, store }) => {
  const result = auth.createBrowserSession({ sessionRef: login().session.sessionRef });
  assert.throws(() => auth.revokeBrowserSession({ cookieValue: result.cookieValue, sessionContext: "portalctx_wrong" }), /session/i);
  assert.equal(store.getPortalSession(internalId(result.cookieValue)).status, "active");
  const request = { cookieValue: result.cookieValue, sessionContext: result.session.sessionRef };
  auth.revokeBrowserSession(request);
  const after = store.getPortalSession(internalId(result.cookieValue));
  auth.revokeBrowserSession(request);
  assert.deepEqual(store.getPortalSession(after.sessionRef), after);
  assert.equal(after.status, "revoked");
  assert.throws(() => auth.getBrowserSession({ cookieValue: result.cookieValue }), /session/i);
}));

test("legacy logout revokes its session but rejects browser-private identifiers", () => fixture(({ auth, login, store }) => {
  const initial = login();
  auth.revokeSession({ sessionRef: initial.session.sessionRef });
  auth.revokeSession({ sessionRef: initial.session.sessionRef });
  assert.equal(store.getPortalSession(initial.session.sessionRef).status, "revoked");
  assert.throws(() => auth.requireSession({ sessionRef: initial.session.sessionRef }), /session/i);
  assert.throws(() => auth.revokeSession({ sessionRef: `portalbrowser_${"a".repeat(64)}` }), /session/i);
}));

test("conversion rotates and revokes the previous browser session in the same transaction", () => fixture(({ auth, login, store }) => {
  const first = auth.createBrowserSession({ sessionRef: login().session.sessionRef });
  const second = auth.createBrowserSession({ sessionRef: login().session.sessionRef, previousCookieValue: first.cookieValue });
  assert.notEqual(first.cookieValue, second.cookieValue);
  assert.equal(store.getPortalSession(internalId(first.cookieValue)).status, "revoked");
  assert.equal(store.getPortalSession(internalId(second.cookieValue)).status, "active");
}));

test("second-factor remember preference is durable and cannot be upgraded in the final request", () => fixture(({ auth, login, service, store }) => {
  store.createPortalTotpCredential({ id: "totp_browser_test", accountId: "acct_browser_test", encryptedTotpSecret: "synthetic-test-secret", enrolledAt: START, updatedAt: START });
  for (const rememberMe of [false, true]) {
    const challenge = login(rememberMe);
    assert.equal(challenge.session, undefined);
    assert.equal(store.listPortalSessions({ accountId: "acct_browser_test" }).length, rememberMe ? 2 : 0);
    assert.equal(store.getPortalSecondFactorChallenge(challenge.result.challengeRef).rememberMe, rememberMe);
    const restarted = service();
    if (!rememberMe) assert.throws(() => restarted.completeSecondFactor({ challengeRef: challenge.result.challengeRef, factor: "totp", code: "123456", rememberMe: true }), /remember/i);
    const completed = restarted.completeSecondFactor({ challengeRef: challenge.result.challengeRef, factor: "totp", code: "123456" });
    assert.equal(completed.rememberMe, rememberMe);
    const browser = restarted.createBrowserSession({ sessionRef: completed.session.sessionRef, rememberMe: completed.rememberMe });
    assert.equal(browser.session.expiresAt, rememberMe ? "2026-09-13T12:00:00.000Z" : "2026-09-06T12:30:00.000Z");
  }
}));

test("existing array-format MFA challenges stay readable with remember disabled", () => fixture(({ store, db }) => {
  store.createPortalSecondFactorChallenge({ id: "portal_mfa_legacy", accountId: "acct_browser_test", challengeHash: "synthetic-hash", allowedFactors: ["totp"], expiresAt: "2026-09-06T12:05:00.000Z", createdAt: START, updatedAt: START });
  db.prepare("update platform_portal_second_factor_challenges set allowed_factors_json = ? where id = ?").run('["totp"]', "portal_mfa_legacy");
  const challenge = store.getPortalSecondFactorChallenge("portal_mfa_legacy");
  assert.deepEqual(challenge.allowedFactors, ["totp"]);
  assert.equal(challenge.rememberMe, false);
}));

test("session store revoke preserves the first timestamp and does not resurrect expired rows", () => fixture(({ auth, login, store, db }) => {
  const initial = login();
  store.revokePortalSession(initial.session.sessionRef, { revokedAt: START, updatedAt: START });
  const first = store.getPortalSession(initial.session.sessionRef);
  store.revokePortalSession(initial.session.sessionRef, { revokedAt: "2026-09-06T12:05:00.000Z", updatedAt: "2026-09-06T12:05:00.000Z" });
  assert.deepEqual(store.getPortalSession(initial.session.sessionRef), first);
  assert.throws(() => auth.requireSession({ sessionRef: initial.session.sessionRef }), /session/i);
  const expired = login();
  db.prepare("update platform_portal_sessions set status = 'expired' where id = ?").run(expired.session.sessionRef);
  const expiredRow = store.getPortalSession(expired.session.sessionRef);
  store.revokePortalSession(expired.session.sessionRef, { revokedAt: START, updatedAt: START });
  assert.deepEqual(store.getPortalSession(expired.session.sessionRef), expiredRow);
  assert.equal(store.revokePortalSession("portal_session_unknown", { revokedAt: START, updatedAt: START }), null);
}));

test("failed conversion rolls back all session changes and consumes its one-use permission", () => fixture(({ auth, login, store }) => {
  const old = auth.createBrowserSession({ sessionRef: login().session.sessionRef });
  const initial = login();
  const before = store.listPortalSessions({ accountId: "acct_browser_test" });
  const original = store.revokePortalSession;
  store.revokePortalSession = (...args) => { original(...args); throw new Error("synthetic persistence failure"); };
  assert.throws(() => auth.createBrowserSession({ sessionRef: initial.session.sessionRef, previousCookieValue: old.cookieValue }), /synthetic persistence failure/);
  store.revokePortalSession = original;
  assert.deepEqual(store.listPortalSessions({ accountId: "acct_browser_test" }), before);
  assert.throws(() => auth.createBrowserSession({ sessionRef: initial.session.sessionRef }), { code: "invalid_session" });
}));

test("conversion capacity is bounded without revoking or changing legacy sessions", () => fixture(({ auth, login, store }) => {
  const first = login();
  let latest;
  for (let index = 0; index < 1024; index += 1) latest = login();
  assert.throws(() => auth.createBrowserSession({ sessionRef: first.session.sessionRef }), { code: "invalid_session" });
  assert.equal(store.getPortalSession(first.session.sessionRef).status, "active");
  assert.equal(auth.requireSession({ sessionRef: first.session.sessionRef }).accountId, "acct_browser_test");
  auth.createBrowserSession({ sessionRef: latest.session.sessionRef });
}));

test("malformed cookies and public/internal identifiers cannot enter the private cookie lookup", () => fixture(({ auth, login }) => {
  const result = auth.createBrowserSession({ sessionRef: login().session.sessionRef });
  for (const cookieValue of [null, undefined, "", " ", result.cookieValue + "=", result.cookieValue + " ", "a".repeat(43), result.session.sessionRef, internalId(result.cookieValue), { value: result.cookieValue }]) {
    assert.throws(() => auth.getBrowserSession({ cookieValue }), { code: "invalid_session" });
  }
  assert.throws(() => auth.getBrowserSession({ sessionRef: internalId(result.cookieValue) }), { code: "invalid_session" });
}));

test("failed, expired, reused, and unsupported MFA do not create convertible sessions", () => fixture(({ auth, login, store, setNow }) => {
  store.createPortalTotpCredential({ id: "totp_browser_negative", accountId: "acct_browser_test", encryptedTotpSecret: "synthetic-test-secret", enrolledAt: START, updatedAt: START });
  const first = login(true);
  assert.throws(() => auth.completeSecondFactor({ challengeRef: first.result.challengeRef, factor: "totp", code: "000000" }));
  assert.equal(store.listPortalSessions({ accountId: "acct_browser_test" }).length, 0);
  const completed = auth.completeSecondFactor({ challengeRef: first.result.challengeRef, factor: "totp", code: "123456" });
  assert.throws(() => auth.completeSecondFactor({ challengeRef: first.result.challengeRef, factor: "totp", code: "123456" }));
  const next = login(true);
  setNow("2026-09-06T12:05:00.000Z");
  assert.throws(() => auth.completeSecondFactor({ challengeRef: next.result.challengeRef, factor: "totp", code: "123456" }));
  assert.throws(() => auth.createBrowserSession({ sessionRef: completed.session.sessionRef, rememberMe: true }), { code: "invalid_session" });
  store.createPortalSecondFactorChallenge({ id: "portal_mfa_passkey", accountId: "acct_browser_test", challengeHash: "synthetic-hash", allowedFactors: ["passkey"], rememberMe: true, expiresAt: "2026-09-06T12:10:00.000Z", createdAt: "2026-09-06T12:05:00.000Z", updatedAt: "2026-09-06T12:05:00.000Z" });
  assert.throws(() => auth.completeSecondFactor({ challengeRef: "portal_mfa_passkey", factor: "passkey", passkeyProof: "synthetic-proof" }), /passkey second factor is not configured/);
  assert.equal(store.listPortalSessions({ accountId: "acct_browser_test" }).length, 1);
}));

test("malformed durable MFA preference fails closed before completing a challenge", () => fixture(({ auth, login, store, db }) => {
  store.createPortalTotpCredential({ id: "totp_browser_malformed", accountId: "acct_browser_test", encryptedTotpSecret: "synthetic-test-secret", enrolledAt: START, updatedAt: START });
  const challenge = login(false);
  for (const payload of ['{"version":1,"allowedFactors":["totp"],"rememberMe":"true"}', '{"version":2,"allowedFactors":["totp"],"rememberMe":true}', '{"version":1,"allowedFactors":["totp"],"rememberMe":true,"extra":1}', 'null']) {
    db.prepare("update platform_portal_second_factor_challenges set allowed_factors_json = ? where id = ?").run(payload, challenge.result.challengeRef);
    assert.throws(() => auth.completeSecondFactor({ challengeRef: challenge.result.challengeRef, factor: "totp", code: "123456" }), { code: "validation_error" });
  }
  assert.equal(store.listPortalSessions({ accountId: "acct_browser_test" }).length, 0);
}));

test("registration setup remains default short-lived without changing legacy issuance", () => fixture(({ auth, store }) => {
  const registered = auth.createPasswordSetupSession({ accountId: "acct_browser_test", loginRef: "browser@example.test" });
  const result = auth.createBrowserSession({ sessionRef: registered.session.sessionRef });
  assert.equal(result.session.expiresAt, "2026-09-06T12:30:00.000Z");
  assert.equal(store.listPortalSessions({ accountId: "acct_browser_test" }).length, 2);
}));
