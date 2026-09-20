import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Database from "better-sqlite3";
import express from "express";
import { createApp } from "../app.mjs";
import { userPortalRoutes } from "../routes/user-portal.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createUserPortalAuthService } from "../services/platform/user-portal-auth.mjs";
import { createPortalPasswordCredentialService } from "../services/platform/portal-password-credentials.mjs";
import { createPortalHumanChallengeService } from "../services/platform/portal-human-challenge.mjs";
import { createPortalRegistrationService } from "../services/platform/portal-registration.mjs";
import { createPortalRegistrationEmailVerificationService } from "../services/platform/portal-registration-email-verification.mjs";
import { createWalletFirstCurrentResourceProjection } from "../services/platform/wallet-first-current-resource-projection.mjs";
import { listen } from "./helpers/listen.mjs";

const NOW = "2026-09-06T12:00:00.000Z";
const ORIGIN = "https://portal.example.test";
const ACCOUNT = "acct_cookie_routes";
const CURRENT_OVERVIEW = {
  state: "available",
  plan: { id: "plan_cookie_routes", durationDays: 30, monthlyTrafficGb: 100 },
  validUntil: "2026-10-06T12:00:00.000Z",
  setupAvailable: false,
  resourceRef: "resource_" + "a".repeat(64),
  usage: {
    totalBytes: 1000000,
    usedBytes: 250000,
    remainingBytes: 750000,
    collectionStatus: "measured",
    updatedAt: NOW,
    cycleStartedAt: "2026-09-01T00:00:00.000Z",
    cycleEndsAt: "2026-10-01T00:00:00.000Z"
  }
};
const READ_PATHS = [
  "/api/portal/coins/wallet", "/api/portal/coins/wallet/ledger?limit=25",
  "/api/portal/catalog/offers", "/api/portal/commerce/orders?limit=25",
  "/api/portal/coins/recharge/offers", "/api/portal/coins/recharge/orders",
  "/api/portal/resources/current", "/api/portal/resources/current/overview",
  "/api/portal/security/current", "/api/portal/access-requests/current"
];
const WRITE_PATHS = ["/api/portal/commerce/orders", "/api/portal/coins/recharge/orders", "/api/portal/resources/current/setup", "/api/portal/security/totp/enrollment"];
const CONTEXT = /^portalctx_[a-f0-9]{64}$/;

async function harness(t, { isolatedLegacyRouter = false } = {}) {
  const store = createSqliteSubscriptionControlStore({ database: new Database(":memory:") });
  let clock = NOW;
  let index = 0;
  const password = randomUUID();
  const calls = [];
  const mutations = [];
  const securityCalls = [];
  const read = (name, result) => (input) => { calls.push({ name, input }); return structuredClone(result); };
  const forbiddenWrite = (name) => () => { mutations.push(name); throw new Error("Unexpected synthetic commercial mutation"); };
  store.createAccount({ id: ACCOUNT, ownerRef: "owner_cookie_routes", status: "active", createdAt: NOW, updatedAt: NOW,
    metadata: { loginRef: "cookie-user@example.test", displayRef: "cookie-user@example.test" } });
  const passwordCredentials = createPortalPasswordCredentialService({ controlStore: store, nowFn: () => clock, credentialRefFactory: () => `pwd_cookie_routes_${++index}` });
  passwordCredentials.issueInitialPasswordCredential({ accountId: ACCOUNT, plainPassword: password, issuedByRef: "local_test", approvalRef: "local_test" });
  const auth = createUserPortalAuthService({
    controlStore: store, nowFn: () => clock, passwordCredentialService: passwordCredentials,
    allowPasswordOnlySessionForSetup: true,
    sessionRefFactory: () => `portal_session_routes_${++index}`,
    secondFactorChallengeRefFactory: () => `portal_mfa_routes_${++index}`,
    totpVerifier: ({ code }) => code === "123456",
    totpSecretProtector: { protect: () => "synthetic-protected-totp" }
  });
  for (const method of ["getSecurityState", "startTotpEnrollment", "confirmTotpEnrollment"]) {
    const original = auth[method];
    auth[method] = (input) => { securityCalls.push(method); return original(input); };
  }
  const accessRequests = {
    listRequests: read("access", []),
    submitRequest(input) { calls.push({ name: "registration_trial", input }); return { id: "trial_request_test", status: "submitted" }; },
    revealSubscription: forbiddenWrite("reveal"), refreshSubscription: forbiddenWrite("refresh"), disableSubscription: forbiddenWrite("disable")
  };
  const platform = {
    controlStore: store, userPortalRoutesEnabled: true, userPortalAuth: auth,
    portalAccessRequests: accessRequests,
    portalHumanChallenges: createPortalHumanChallengeService({ nowFn: () => clock, challengeFactory: () => ({ prompt: "2 + 3", answer: "5" }) }),
    portalRegistrationEmailVerifications: createPortalRegistrationEmailVerificationService({ nowFn: () => clock, codeFactory: () => "246810", sender: async () => {} }),
    portalRegistrations: createPortalRegistrationService({ controlStore: store, userPortalAuth: auth, passwordCredentialService: passwordCredentials, portalAccessRequests: accessRequests, nowFn: () => clock }),
    coinsWalletEnabled: true,
    coinsWalletStore: {
      getWalletProjection: read("wallet", { exists: false, status: "not_created", version: 0, totals: { paid_coins: 0, bonus_coins: 0, reward_coins: 0 }, spendableUnits: 0, heldUnits: 0, pendingUnits: 0 }),
      listLedgerEntries: read("ledger", []), creditCoins: forbiddenWrite("credit"), createCoinHold: forbiddenWrite("hold"), captureCoinHold: forbiddenWrite("capture")
    },
    coinsCommerceEnabled: true, coinCommerceCoordinator: { start() {}, stop() {} },
    coinCommerceStore: {
      listPublishedOffers: read("catalog", []), getPublishedOffer: read("offer", null), listOrders: read("commerce_orders", { orders: [], nextCursor: null }), getOrder: read("commerce_order", null),
      createCheckoutQuote: forbiddenWrite("quote"), confirmOrder: forbiddenWrite("commerce_confirm"), cancelOrder: forbiddenWrite("commerce_cancel")
    },
    coinRechargeEnabled: true, paymentRechargeProvider: "xsd",
    paymentRechargeCoordinator: {
      listOffers: read("recharge_offers", []), listRechargeOrders: read("recharge_orders", []), getRechargeOrder: read("recharge_order", null),
      createRechargeOrder: forbiddenWrite("recharge_create"), captureRechargeOrder: forbiddenWrite("recharge_capture"), acceptProviderCallback: forbiddenWrite("provider_callback")
    },
    walletFirstCurrentResourceProjection: createWalletFirstCurrentResourceProjection({
      controlStore: {
        readWalletFirstCurrentResourceProjection: read("resource", { state: "none" }),
        readWalletFirstCurrentResourceOverview: read("resource_overview", CURRENT_OVERVIEW)
      }
    })
  };
  const state = {
    rootDir: fileURLToPath(new URL("../../", import.meta.url)), consoleToken: "synthetic-console-token",
    proxyConfig: { servers: [], pingHosts: [], nginx: {} }, subscriptions: {},
    services: { ssLocal: { status: () => ({ running: false }) }, httpProxy: { status: () => ({ running: false }) } }, platform,
    security: { adminAllowedCidrs: ["127.0.0.1/32"], subRateLimit: { windowMs: 60_000, max: 30 } }
  };
  const app = isolatedLegacyRouter ? express().use(express.json()).use(userPortalRoutes(state)) : createApp(state, { portalBrowserOrigin: ORIGIN });
  const { server, baseUrl } = await listen(app);
  t.after(async () => { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); store.close(); });
  async function request(path, { method = "GET", body, cookie, context, browser = true, headers = {} } = {}) {
    const all = { Host: new URL(ORIGIN).host,
      ...(browser ? { Origin: ORIGIN, "Sec-Fetch-Site": "same-origin", "X-Portal-Request": "browser-v1" } : {}),
      ...(cookie ? { Cookie: cookie } : {}), ...(context ? { "X-Portal-Session-Context": context } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers };
    // Node fetch discards a supplied Host header. Exercise the production
    // origin contract over the test-only loopback socket with raw HTTP instead.
    return new Promise((resolve, reject) => {
      const req = httpRequest(`${baseUrl}${path}`, { method, headers: all }, (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          try {
            resolve({ status: response.statusCode, headers: new Headers(response.headers), body: text ? JSON.parse(text) : null });
          } catch {
            reject(new Error(`Local route returned non-JSON: ${method} ${path.split("?", 1)[0]} (${response.statusCode})`));
          }
        });
      });
      req.on("error", reject);
      req.setTimeout(10_000, () => req.destroy(new Error("Local test request timed out")));
      req.end(body === undefined ? undefined : JSON.stringify(body));
    });
  }
  async function login({ rememberMe = false, cookie, loginRef = "cookie-user@example.test" } = {}) {
    const challenge = await request("/api/portal/human-challenges", { method: "POST", body: { scope: "portal_login" } });
    assert.equal(challenge.status, 201);
    return request("/api/portal/password/session", { method: "POST", cookie, body: { accountId: loginRef, plainPassword: password, rememberMe,
      humanVerification: { challengeRef: challenge.body.challenge.challengeRef, answer: "5" } } });
  }
  function seedTotp() { store.createPortalTotpCredential({ id: "totp_route_test", accountId: ACCOUNT, encryptedTotpSecret: "synthetic-protected-totp", enrolledAt: NOW, updatedAt: NOW }); }
  function seedSecondAccount() {
    const accountId = "acct_cookie_routes_b";
    const loginRef = "second-cookie-user@example.test";
    store.createAccount({ id: accountId, ownerRef: "owner_cookie_routes_b", status: "active", createdAt: NOW, updatedAt: NOW,
      metadata: { loginRef, displayRef: loginRef } });
    passwordCredentials.issueInitialPasswordCredential({ accountId, plainPassword: password, issuedByRef: "local_test", approvalRef: "local_test" });
    return { accountId, loginRef };
  }
  return { store, auth, request, login, seedTotp, seedSecondAccount, calls, mutations, securityCalls, setNow(value) { clock = value; } };
}

function browserIdentity(response) {
  assert.ok([200, 201].includes(response.status), "login must complete");
  const session = response.body.session;
  assert.match(session.sessionRef, CONTEXT);
  assert.equal(session.transport, "cookie");
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie?.startsWith("__Host-PortalSession="));
  const cookie = setCookie.split(";", 1)[0];
  const raw = cookie.slice(cookie.indexOf("=") + 1);
  const privateId = `portalbrowser_${createHash("sha256").update(raw).digest("hex")}`;
  assert.equal(JSON.stringify(response.body).includes(raw), false);
  assert.equal(JSON.stringify(response.body).includes(privateId), false);
  assert.equal(JSON.stringify(response.body).includes("portal_session_routes_"), false);
  assert.equal(session.accountId, undefined);
  return { cookie, context: session.sessionRef, privateId, expiresAt: session.expiresAt };
}

test("real password auth restores by bootstrap and reaches all Portal read namespaces without monetary writes", async (t) => {
  const h = await harness(t);
  const identity = browserIdentity(await h.login());
  const count = h.store.listPortalSessions({ accountId: ACCOUNT }).length;
  const boot = await h.request("/api/portal/browser-session", { cookie: identity.cookie });
  assert.equal(boot.status, 200); assert.equal(boot.body.session.sessionRef, identity.context);
  assert.equal(boot.headers.get("set-cookie"), null);
  for (const path of READ_PATHS) {
    const response = await h.request(path, identity);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  for (const call of h.calls) if (call.input?.accountId) assert.equal(call.input.accountId, ACCOUNT);
  assert.ok(h.calls.some((call) => call.name === "wallet"));
  assert.ok(h.calls.some((call) => call.name === "commerce_orders"));
  assert.ok(h.calls.some((call) => call.name === "recharge_orders"));
  assert.ok(h.calls.some((call) => call.name === "resource"));
  assert.ok(h.calls.some((call) => call.name === "resource_overview"));
  assert.equal(h.store.listPortalSessions({ accountId: ACCOUNT }).length, count);
  assert.deepEqual(h.mutations, []);
});

test("missing/wrong context and cross-origin requests fail before each namespace's business service", async (t) => {
  const h = await harness(t); const identity = browserIdentity(await h.login());
  for (const path of [...READ_PATHS, ...WRITE_PATHS]) for (const variant of [
    { cookie: identity.cookie }, { ...identity, context: `portalctx_${"0".repeat(64)}` }, { ...identity, headers: { Origin: "https://other.example.test" } }
  ]) {
    const before = [h.calls.length, h.securityCalls.length, h.mutations.length];
    const write = WRITE_PATHS.includes(path);
    const response = await h.request(path, { ...variant, ...(write ? { method: "POST", body: {} } : {}) });
    assert.ok([401, 403].includes(response.status), path);
    assert.deepEqual([h.calls.length, h.securityCalls.length, h.mutations.length], before);
    assert.equal(response.headers.get("set-cookie"), null);
  }
});

for (const isolatedLegacyRouter of [false, true]) test(`legacy private references cannot reach security methods (${isolatedLegacyRouter ? "standalone router" : "createApp"})`, async (t) => {
  const h = await harness(t, { isolatedLegacyRouter });
  const fresh = h.auth.createPasswordSetupSession({ accountId: ACCOUNT });
  const created = h.auth.createBrowserSession({ sessionRef: fresh.session.sessionRef });
  const privateId = `portalbrowser_${createHash("sha256").update(created.cookieValue).digest("hex")}`;
  for (const value of [privateId, created.session.sessionRef]) {
    const cases = [
      ["/api/portal/security/current", { headers: { "X-Portal-Session": ` ${value} ` } }],
      [`/api/portal/security/current?sessionRef=${encodeURIComponent(` ${value} `)}`, {}],
      [`/api/portal/security/current?sessionRef[]=${encodeURIComponent(value)}`, {}],
      ...["/api/portal/security/totp/enrollment", "/api/portal/security/totp/enrollment/confirm"].flatMap((path) => [
        [path, { method: "POST", body: { sessionRef: [value], enrollmentRef: "ignored", code: "123456" } }],
        [path, { method: "POST", body: { sessionRef: ` ${value} `, enrollmentRef: "ignored", code: "123456" } }]
      ])
    ];
    for (const [path, options] of cases) {
      const result = await h.request(path, { browser: false, ...options });
      assert.ok([401, 403].includes(result.status), path);
    }
  }
  assert.deepEqual(h.securityCalls, []);
  assert.equal(h.store.getActivePortalTotpCredential(ACCOUNT), null);
});

test("explicit logout revokes and repeated bootstrap/replay cannot recover the old Cookie", async (t) => {
  const h = await harness(t); const identity = browserIdentity(await h.login({ rememberMe: true }));
  assert.equal(identity.expiresAt, "2026-09-13T12:00:00.000Z");
  for (let count = 0; count < 2; count += 1) {
    const result = await h.request("/api/portal/browser-session/logout", { ...identity, method: "POST", body: {} });
    assert.equal(result.status, 200); assert.deepEqual(result.body, { loggedOut: true });
  }
  assert.equal(h.store.getPortalSession(identity.privateId).status, "revoked");
  const boot = await h.request("/api/portal/browser-session", { cookie: identity.cookie });
  assert.deepEqual(boot.body, { session: null });
  assert.equal(boot.headers.get("set-cookie"), null);
  for (const path of READ_PATHS) assert.equal((await h.request(path, identity)).status, 401, path);
  assert.deepEqual(h.calls, []); assert.deepEqual(h.mutations, []);
});

test("a real second-account login rotates shared Cookie and rejects the previous account context before reads or writes", async (t) => {
  const h = await harness(t);
  const first = browserIdentity(await h.login());
  const secondAccount = h.seedSecondAccount();
  const second = browserIdentity(await h.login({ loginRef: secondAccount.loginRef, cookie: first.cookie }));
  assert.notEqual(second.context, first.context);
  assert.equal(h.store.getPortalSession(first.privateId).status, "revoked");
  assert.equal(h.store.getPortalSession(second.privateId).accountId, secondAccount.accountId);
  for (const path of [...READ_PATHS, ...WRITE_PATHS]) {
    const before = [h.calls.length, h.securityCalls.length, h.mutations.length];
    const result = await h.request(path, { cookie: second.cookie, context: first.context,
      ...(WRITE_PATHS.includes(path) ? { method: "POST", body: {} } : {}) });
    assert.equal(result.status, 401, path);
    assert.deepEqual([h.calls.length, h.securityCalls.length, h.mutations.length], before);
    assert.equal(result.headers.get("set-cookie"), null);
  }
  assert.equal((await h.request("/api/portal/browser-session", { cookie: first.cookie })).body.session, null);
  const boot = await h.request("/api/portal/browser-session", { cookie: second.cookie });
  assert.equal(boot.body.session.sessionRef, second.context);
  for (const path of READ_PATHS) assert.equal((await h.request(path, second)).status, 200, path);
  for (const call of h.calls) {
    if (call.input?.accountId) assert.equal(call.input.accountId, secondAccount.accountId);
    if (call.input?.portalUserRef) assert.equal(call.input.portalUserRef, secondAccount.accountId);
  }
  assert.deepEqual(h.mutations, []);
});

test("password MFA creates no Cookie before success and retains the first-step remembered preference", async (t) => {
  const h = await harness(t); h.seedTotp();
  const challenge = await h.login({ rememberMe: true });
  assert.equal(challenge.status, 202); assert.equal(challenge.headers.get("set-cookie"), null);
  assert.equal(h.store.listPortalSessions({ accountId: ACCOUNT }).length, 0);
  const failed = await h.request("/api/portal/password/second-factor", { method: "POST", body: { challengeRef: challenge.body.challenge.challengeRef, factor: "totp", code: "000000" } });
  assert.equal(failed.status, 400); assert.equal(failed.headers.get("set-cookie"), null);
  const complete = await h.request("/api/portal/password/second-factor", { method: "POST", body: { challengeRef: challenge.body.challenge.challengeRef, factor: "totp", code: "123456" } });
  const identity = browserIdentity(complete);
  assert.equal(identity.expiresAt, "2026-09-13T12:00:00.000Z");
  assert.equal((await h.request("/api/portal/security/current", identity)).status, 200);
  assert.deepEqual(h.mutations, []);
});

test("direct TOTP login is finalized as a public-context short Cookie session", async (t) => {
  const h = await harness(t); h.seedTotp();
  const challenge = await h.request("/api/portal/human-challenges", { method: "POST", body: { scope: "portal_login" } });
  const result = await h.request("/api/portal/session", { method: "POST", body: { accountId: ACCOUNT, code: "123456", humanVerification: { challengeRef: challenge.body.challenge.challengeRef, answer: "5" } } });
  const identity = browserIdentity(result);
  assert.equal(identity.expiresAt, "2026-09-06T12:30:00.000Z");
  assert.equal((await h.request("/api/portal/coins/wallet", identity)).status, 200);
});

test("real registration finalizes only its completed session into a default short Cookie", async (t) => {
  const h = await harness(t);
  const email = "new-cookie-user@example.test";
  const verification = await h.request("/api/portal/registration/email-verification", { method: "POST", body: { email } });
  assert.equal(verification.status, 201);
  const result = await h.request("/api/portal/registration", { method: "POST", body: {
    email, password: randomUUID(), legalAgreement: { termsAccepted: true, privacyAccepted: true, termsVersion: "2026-07-02", privacyVersion: "2026-07-02" },
    emailVerification: { verificationRef: verification.body.verification.verificationRef, code: "246810" }
  } });
  const identity = browserIdentity(result);
  assert.equal(identity.expiresAt, "2026-09-06T12:30:00.000Z");
  const response = await h.request("/api/portal/resources/current", identity);
  assert.equal(response.status, 200);
  const accountId = h.store.getPortalSession(identity.privateId).accountId;
  assert.notEqual(accountId, ACCOUNT);
  assert.equal(h.calls.find((call) => call.name === "resource").input.accountId, accountId);
  assert.deepEqual(h.mutations, []);
});

test("valid Cookie can use real security enrollment while stale context cannot invoke it", async (t) => {
  const h = await harness(t); const identity = browserIdentity(await h.login());
  const invalid = await h.request("/api/portal/security/totp/enrollment", { ...identity, context: `portalctx_${"0".repeat(64)}`, method: "POST", body: {} });
  assert.equal(invalid.status, 401); assert.deepEqual(h.securityCalls, []);
  const started = await h.request("/api/portal/security/totp/enrollment", { ...identity, method: "POST", body: {} });
  assert.equal(started.status, 201);
  const completed = await h.request("/api/portal/security/totp/enrollment/confirm", { ...identity, method: "POST", body: { enrollmentRef: started.body.enrollment.enrollmentRef, code: "123456" } });
  assert.equal(completed.status, 200);
  assert.equal(h.store.getActivePortalTotpCredential(ACCOUNT).status, "active");
  assert.deepEqual(h.mutations, []);
});
