// B2-b (path A): authority-first login, authority registration, and the
// deletion binding cleanup. Synthetic keys, tokens, accounts and bindings
// only; no tenant, no network, no production data.
//
// Coverage map (B2 design §4.2 / §6.2):
// - B-A1: the server token verifier accepts a well-formed RS256 token and
//   rejects bad signatures, wrong issuer/audience/client, expired tokens
//   and unknown kids; the MFA claim proves totp only inside its window.
// - B-A3: the resolver enforces caller-supplied requiredFactors.
// - B-A2: authority login resolves through the binding only (the legacy
//   email resolver is never called), fails closed for unbound / inactive /
//   expired inputs, challenges when totp is enrolled but unproven, and
//   creates a session directly when the MFA claim proves totp.
// - B-A4: authority registration creates an account + binding with a
//   masked display only; duplicates fail without orphan accounts.
// - C2: physical deletion of a bound account completes (binding rows
//   removed before step 5); logical deletion keeps the binding rows.
// - B2-b P2 (CodeQL #100, HTTP route level): the authority session entry is
//   attempt-limited per verified source IP (10 per 60 s, then 429); normal
//   attempts below the limit succeed; untrusted X-Forwarded-For cannot open
//   a fresh bucket. These three tests live in this file — not a separate
//   file — because the source-validation runner bounds the total test-file
//   inventory command line (28,000 chars); a new file would push it over.
import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { generateKeyPairSync, sign } from "node:crypto";
import { createApp } from "../app.mjs";
import { listen } from "./helpers/listen.mjs";
import {
  createSqliteSubscriptionControlStore
} from "../services/platform/subscription-control-db.mjs";
import { createUserPortalAuthService } from "../services/platform/user-portal-auth.mjs";
import { createPortalAuthorityTokenVerifier } from "../services/platform/portal-authority-token-verifier.mjs";
import { registerAccountFromAuthority } from "../services/platform/portal-authority-registration.mjs";
import { resolveAccountByVerifiedActorContext } from "../services/platform/d1-identity-binding-resolver.mjs";
import { PortalIdentityDeletionService } from "../services/platform/portal-identity-deletion.mjs";

const NOW = 1794000000000;
const NOW_ISO = new Date(NOW).toISOString();
const NOW_SECONDS = Math.floor(NOW / 1000);
const SESSION_EXPIRES = "2026-05-31T00:30:00.000Z";
const ISSUER = "https://portal-synth.test.auth0.com/";
const AUDIENCE = "https://api.portal.example.test/";
const CLIENT_ID = "portal-client-1";
const MFA_CLAIM = "https://flylink.example.test/mfa";
const SUBJECT = "auth0|portal-synth-1";
const ACCOUNT_ID = "acct-b2-b-1";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const JWK = { ...publicKey.export({ format: "jwk" }), kid: "b2b-test-k1", kty: "RSA", use: "sig", alg: "RS256" };
const OTHER_KEY = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;

function jwt(claims, { kid = "b2b-test-k1", key = privateKey } = {}) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid, typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = sign(null, Buffer.from(`${header}.${payload}`), key).toString("base64url");
  return `${header}.${payload}.${signature}`;
}

function accessToken(overrides = {}, signOptions = {}) {
  return jwt({
    iss: ISSUER,
    sub: SUBJECT,
    aud: AUDIENCE,
    azp: CLIENT_ID,
    scope: "openid profile email",
    iat: NOW_SECONDS,
    exp: NOW_SECONDS + 600,
    auth_time: NOW_SECONDS,
    ...overrides
  }, signOptions);
}

function mfaClaim(completedAtMs = NOW) {
  return { [MFA_CLAIM]: { method: "otp", completed_at: new Date(completedAtMs).toISOString() } };
}

function makeVerifier({ fetchJwks = async () => ({ keys: [JWK] }), ...overrides } = {}) {
  return createPortalAuthorityTokenVerifier({
    issuer: ISSUER,
    audience: AUDIENCE,
    clientIds: [CLIENT_ID],
    fetchJwks,
    mfaClaim: MFA_CLAIM,
    nowFn: () => NOW,
    ...overrides
  });
}

async function withStore(fn) {
  const database = new Database(":memory:");
  let store;
  try {
    store = createSqliteSubscriptionControlStore({ database });
    // Awaited: the store must stay open until an async test body finishes.
    return await fn({ database, store });
  } finally {
    store?.close?.();
    database.close();
  }
}

function makeAccount(store, id = ACCOUNT_ID, status = "active") {
  return store.createAccount({
    id, ownerRef: id, status, createdAt: NOW_ISO, updatedAt: NOW_ISO
  });
}

function bindAccount(store, { accountRef = ACCOUNT_ID, subjectRef = SUBJECT } = {}) {
  // The store exposes the repository; build it through the public accessor
  // so the test uses the same rows as the service under test.
  const repo = store.identityBindingRepository();
  const created = repo.createActive({
    accountRef,
    issuerRef: "portal",
    subjectRef,
    status: "active",
    createdAtMs: NOW - 1000,
    updatedAtMs: NOW - 1000,
    revokedAtMs: null
  });
  assert.equal(created.outcome, "created");
  return created;
}

function createAuthService(store, { verifier = makeVerifier(), ...overrides } = {}) {
  return createUserPortalAuthService({
    controlStore: store,
    nowFn: () => NOW_ISO,
    sessionRefFactory: () => "portal_session_1",
    secondFactorChallengeRefFactory: () => "mfa_challenge_1",
    sessionExpiresAtFactory: () => SESSION_EXPIRES,
    totpSecretProtector: {
      protect: (secret) => `v2:test-protected:${secret}`
    },
    totpVerifier: ({ encryptedTotpSecret, code }) => encryptedTotpSecret === "v2:test-protected:totp-secret" && code === "123456",
    authorityTokenVerifier: verifier,
    allowPasswordOnlySessionForSetup: true,
    ...overrides
  });
}

// The legacy email resolver must never run on the authority path. Wrap the
// store so any call to it throws loudly; every other method delegates.
function storeWithoutLegacyLogin(store) {
  return new Proxy(store, {
    get(target, prop) {
      if (prop === "resolvePortalLoginAccount") {
        return () => { throw new Error("legacy login resolver must not be called"); };
      }
      const value = target[prop];
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}

function enrollTotp(store, accountId = ACCOUNT_ID) {
  store.createPortalTotpCredential({
    id: "totp_cred_b2b_1",
    accountId,
    encryptedTotpSecret: "v2:test-protected:totp-secret",
    status: "active",
    failureCount: 0,
    enrolledAt: NOW_ISO,
    updatedAt: NOW_ISO
  });
}

// ---------------------------------------------------------------- B-A1 ---

test("B-A1: verifier accepts a well-formed token (identity only, no MFA claim)", async () => {
  const verifier = makeVerifier();
  const verified = await verifier.verifyAccessToken(accessToken());
  assert.equal(verified.subject, SUBJECT);
  assert.equal(verified.issuer, ISSUER);
  assert.equal(verified.clientId, CLIENT_ID);
  assert.equal(verified.mfaProven, false);
  assert.equal(verified.mfaVerifiedAtMs, null);
  assert.equal(verified.authTimeMs, NOW_SECONDS * 1000);
});

test("B-A1: verifier proves totp from a valid namespaced MFA claim", async () => {
  const verifier = makeVerifier();
  const verified = await verifier.verifyAccessToken(accessToken(mfaClaim()));
  assert.equal(verified.mfaProven, true);
  assert.equal(verified.mfaVerifiedAtMs, NOW);
  assert.equal(verified.mfaReason, null);
});

test("B-A1: stale MFA claim proves nothing but the token still proves identity", async () => {
  const verifier = makeVerifier();
  const verified = await verifier.verifyAccessToken(accessToken(mfaClaim(NOW - 6 * 60 * 1000)));
  assert.equal(verified.mfaProven, false);
  assert.equal(verified.mfaReason, "mfa_claim_stale");
  assert.equal(verified.subject, SUBJECT);
});

test("B-A1: malformed MFA claim (wrong method) proves nothing", async () => {
  const verifier = makeVerifier();
  const verified = await verifier.verifyAccessToken(accessToken({
    [MFA_CLAIM]: { method: "sms", completed_at: new Date(NOW).toISOString() }
  }));
  assert.equal(verified.mfaProven, false);
  assert.equal(verified.mfaReason, "mfa_claim_malformed");
});

test("B-A1: verifier rejects a forged signature", async () => {
  const verifier = makeVerifier();
  await assert.rejects(
    () => verifier.verifyAccessToken(accessToken({}, { key: OTHER_KEY })),
    (error) => error.code === "authority_token_invalid"
  );
});

test("B-A1: verifier rejects wrong issuer, audience and client", async () => {
  const verifier = makeVerifier();
  await assert.rejects(
    () => verifier.verifyAccessToken(accessToken({ iss: "https://other.test/" })),
    (error) => error.code === "authority_token_issuer_mismatch"
  );
  await assert.rejects(
    () => verifier.verifyAccessToken(accessToken({ aud: "https://other.test/" })),
    (error) => error.code === "authority_token_audience_mismatch"
  );
  await assert.rejects(
    () => verifier.verifyAccessToken(accessToken({ azp: "other-client" })),
    (error) => error.code === "authority_token_client_mismatch"
  );
});

test("B-A1: verifier rejects an expired token", async () => {
  const verifier = makeVerifier();
  await assert.rejects(
    () => verifier.verifyAccessToken(accessToken({ exp: NOW_SECONDS - 10 })),
    (error) => error.code === "authority_token_expired"
  );
});

test("B-A1: verifier rejects an unknown kid even after a JWKS refresh", async () => {
  const verifier = makeVerifier();
  await assert.rejects(
    () => verifier.verifyAccessToken(accessToken({}, { kid: "unknown-kid" })),
    (error) => error.code === "authority_token_invalid"
  );
});

test("B-A1: verifier reports JWKS outage instead of trusting the token", async () => {
  const verifier = makeVerifier({
    fetchJwks: async () => { throw new Error("network down"); }
  });
  await assert.rejects(
    () => verifier.verifyAccessToken(accessToken()),
    (error) => error.code === "authority_jwks_unavailable"
  );
});

test("B-A1: ID token verifies subject + verified email under the expected nonce", async () => {
  const verifier = makeVerifier();
  const token = jwt({
    iss: ISSUER,
    sub: SUBJECT,
    aud: CLIENT_ID,
    azp: CLIENT_ID,
    nonce: "nonce-b2b-1",
    email: "Test.User@example.test",
    email_verified: true,
    iat: NOW_SECONDS,
    exp: NOW_SECONDS + 600,
    auth_time: NOW_SECONDS
  });
  const verified = await verifier.verifyIdToken(token, { expectedNonce: "nonce-b2b-1" });
  assert.equal(verified.subject, SUBJECT);
  assert.equal(verified.email, "Test.User@example.test");
});

test("B-A1: ID token rejects nonce mismatch and unverified email", async () => {
  const verifier = makeVerifier();
  const token = jwt({
    iss: ISSUER,
    sub: SUBJECT,
    aud: CLIENT_ID,
    azp: CLIENT_ID,
    nonce: "nonce-b2b-1",
    email: "test.user@example.test",
    email_verified: true,
    iat: NOW_SECONDS,
    exp: NOW_SECONDS + 600,
    auth_time: NOW_SECONDS
  });
  await assert.rejects(
    () => verifier.verifyIdToken(token, { expectedNonce: "nonce-other" }),
    (error) => error.code === "authority_id_token_nonce_mismatch"
  );
  const unverified = jwt({
    iss: ISSUER,
    sub: SUBJECT,
    aud: CLIENT_ID,
    azp: CLIENT_ID,
    nonce: "nonce-b2b-1",
    email: "test.user@example.test",
    email_verified: false,
    iat: NOW_SECONDS,
    exp: NOW_SECONDS + 600,
    auth_time: NOW_SECONDS
  });
  await assert.rejects(
    () => verifier.verifyIdToken(unverified, { expectedNonce: "nonce-b2b-1" }),
    (error) => error.code === "authority_id_token_email_unverified"
  );
});

// ---------------------------------------------------------------- B-A3 ---

test("B-A3: resolver enforces caller-supplied requiredFactors", () => withStore(({ store }) => {
  makeAccount(store);
  bindAccount(store);
  const repository = store.identityBindingRepository();
  const context = {
    accountRef: ACCOUNT_ID,
    audience: "flylink-control-plane",
    authTimeMs: NOW - 1000,
    expiresAtMs: NOW + 60000,
    factors: ["password"],
    issuedAtMs: NOW - 1000,
    issuerRef: "portal",
    sessionRef: "sess-b2-b-0001",
    subjectRef: SUBJECT
  };
  const resolved = resolveAccountByVerifiedActorContext({
    controlStore: store,
    bindingRepository: repository,
    actorContext: context,
    allowedIssuers: ["portal"],
    requiredFactors: ["password"],
    nowMs: NOW
  });
  assert.equal(resolved.account.id, ACCOUNT_ID);
  assert.throws(
    () => resolveAccountByVerifiedActorContext({
      controlStore: store,
      bindingRepository: repository,
      actorContext: context,
      allowedIssuers: ["portal"],
      requiredFactors: ["password", "totp"],
      nowMs: NOW
    }),
    (error) => error.code === "identity_actor_required_factor_missing"
  );
  const withTotp = resolveAccountByVerifiedActorContext({
    controlStore: store,
    bindingRepository: repository,
    actorContext: { ...context, factors: ["password", "totp"] },
    allowedIssuers: ["portal"],
    requiredFactors: ["password", "totp"],
    nowMs: NOW
  });
  assert.equal(withTotp.account.id, ACCOUNT_ID);
}));

// ---------------------------------------------------------------- B-A2 ---

test("B-A2: authority login creates a session through the binding only", async () => withStore(async ({ store }) => {
  makeAccount(store);
  bindAccount(store);
  const service = createAuthService(storeWithoutLegacyLogin(store));
  const result = await service.verifyAuthorityLoginAndMaybeChallenge({
    accessToken: accessToken(),
    rememberMe: false
  });
  assert.equal(result.session.authMethod, "authority");
  assert.equal(result.session.accountId, ACCOUNT_ID);
  assert.equal(result.session.sessionRef, "portal_session_1");
  assert.equal(result.rememberMe, false);
}));

test("B-A2: authority login fails closed for unbound and inactive accounts", async () => withStore(async ({ store }) => {
  makeAccount(store);
  const service = createAuthService(storeWithoutLegacyLogin(store));
  await assert.rejects(
    () => service.verifyAuthorityLoginAndMaybeChallenge({ accessToken: accessToken() }),
    (error) => error.code === "invalid_login"
  );
  const suspendedStore = store;
  suspendedStore.createAccount({
    id: "acct-b2-b-2", ownerRef: "acct-b2-b-2", status: "suspended",
    createdAt: NOW_ISO, updatedAt: NOW_ISO
  });
  bindAccount(suspendedStore, { accountRef: "acct-b2-b-2", subjectRef: "auth0|portal-synth-2" });
  await assert.rejects(
    () => service.verifyAuthorityLoginAndMaybeChallenge({
      accessToken: accessToken({ sub: "auth0|portal-synth-2" })
    }),
    (error) => error.code === "invalid_login"
  );
}));

test("B-A2: authority login rejects expired and forged tokens as invalid_login", async () => withStore(async ({ store }) => {
  makeAccount(store);
  bindAccount(store);
  const service = createAuthService(storeWithoutLegacyLogin(store));
  await assert.rejects(
    () => service.verifyAuthorityLoginAndMaybeChallenge({
      accessToken: accessToken({ exp: NOW_SECONDS - 10 })
    }),
    (error) => error.code === "invalid_login"
  );
  await assert.rejects(
    () => service.verifyAuthorityLoginAndMaybeChallenge({
      accessToken: accessToken({}, { key: OTHER_KEY })
    }),
    (error) => error.code === "invalid_login"
  );
}));

test("B-A2: authority login without a configured verifier fails closed", async () => withStore(async ({ store }) => {
  makeAccount(store);
  bindAccount(store);
  const service = createAuthService(store, { verifier: null });
  await assert.rejects(
    () => service.verifyAuthorityLoginAndMaybeChallenge({ accessToken: accessToken() }),
    (error) => error.code === "identity_authority_unavailable"
  );
}));

test("B-A2: enrolled totp without an MFA claim issues a challenge, not a session", async () => withStore(async ({ store }) => {
  makeAccount(store);
  bindAccount(store);
  enrollTotp(store);
  const service = createAuthService(storeWithoutLegacyLogin(store));
  const result = await service.verifyAuthorityLoginAndMaybeChallenge({
    accessToken: accessToken()
  });
  assert.equal(result.session, undefined);
  assert.equal(result.result.status, "second_factor_required");
  assert.deepEqual(result.result.availableFactors, ["totp"]);
  // The pre-issued sessionRef was discarded: no session row exists.
  assert.equal(store.getPortalSession("portal_session_1"), null);
}));

test("B-A2: enrolled totp with a valid MFA claim creates a session directly", async () => withStore(async ({ store }) => {
  makeAccount(store);
  bindAccount(store);
  enrollTotp(store);
  const service = createAuthService(storeWithoutLegacyLogin(store));
  const result = await service.verifyAuthorityLoginAndMaybeChallenge({
    accessToken: accessToken(mfaClaim())
  });
  assert.equal(result.session.authMethod, "authority");
  assert.equal(result.session.accountId, ACCOUNT_ID);
  assert.equal(result.result, undefined);
}));

// ---------------------------------------------------------------- B-A4 ---

test("B-A4: authority registration creates an account + binding with a masked display only", () => withStore(({ store }) => {
  const created = registerAccountFromAuthority({
    controlStore: store,
    authority: {
      subjectRef: SUBJECT,
      email: "Test.User@example.test",
      emailVerified: true,
      authTimeMs: NOW
    },
    legalAgreement: { termsVersion: "2026-11-01", privacyVersion: "2026-11-01" },
    nowFn: () => NOW_ISO
  });
  assert.equal(created.account.status, "active");
  // The masked display is returned for one-time display, never persisted:
  // the store rejects "email" metadata keys at createAccount by design.
  assert.equal(created.displayEmailMasked, "te***@example.test");
  const metadata = created.account.metadata ?? {};
  assert.equal(metadata.displayEmailMasked, undefined);
  assert.equal(metadata.loginRef, undefined);
  assert.equal(metadata.displayRef, undefined);
  assert.equal(metadata.loginDigest, undefined);
  assert.equal(metadata.contactDigest, undefined);
  assert.equal(metadata.displayName, undefined);
  assert.equal(metadata.registrationSource, "authority_portal");
  const repository = store.identityBindingRepository();
  const resolved = repository.resolve({ issuerRef: "portal", subjectRef: SUBJECT });
  assert.equal(resolved.outcome, "resolved");
  assert.equal(resolved.accountRef, created.account.id);
}));

test("B-A4: duplicate authority subject fails without an orphan account", () => withStore(({ store }) => {
  const input = {
    controlStore: store,
    authority: {
      subjectRef: SUBJECT,
      email: "test.user@example.test",
      emailVerified: true,
      authTimeMs: NOW
    },
    legalAgreement: { termsVersion: "2026-11-01", privacyVersion: "2026-11-01" },
    nowFn: () => NOW_ISO
  };
  registerAccountFromAuthority(input);
  assert.equal(store.listAccounts().length, 1);
  assert.throws(
    () => registerAccountFromAuthority(input),
    (error) => error.code === "account_already_exists"
  );
  assert.equal(store.listAccounts().length, 1);
}));

test("B-A4: unverified email and invalid email are rejected before any write", () => withStore(({ store }) => {
  assert.throws(
    () => registerAccountFromAuthority({
      controlStore: store,
      authority: {
        subjectRef: SUBJECT,
        email: "test.user@example.test",
        emailVerified: false,
        authTimeMs: NOW
      },
      legalAgreement: { termsVersion: "2026-11-01", privacyVersion: "2026-11-01" },
      nowFn: () => NOW_ISO
    }),
    (error) => error.code === "validation_error"
  );
  assert.throws(
    () => registerAccountFromAuthority({
      controlStore: store,
      authority: {
        subjectRef: SUBJECT,
        email: "not-an-email",
        emailVerified: true,
        authTimeMs: NOW
      },
      legalAgreement: { termsVersion: "2026-11-01", privacyVersion: "2026-11-01" },
      nowFn: () => NOW_ISO
    }),
    (error) => error.code === "validation_error"
  );
  assert.equal(store.listAccounts().length, 0);
}));

// ------------------------------------------------------------------ C2 ---

function requestDeletion(service, overrides = {}) {
  return service.requestDeletion({
    requestRef: "delreq-b2-b-0001",
    accountId: ACCOUNT_ID,
    authorizationBasis: "owner_request",
    scope: ["account", "credentials", "sessions"],
    verificationMode: "physical",
    actorRef: "admin:operator-synth-1",
    ...overrides
  });
}

test("C2: physical deletion of a bound account completes and removes the binding rows", () => withStore(({ store }) => {
  makeAccount(store);
  bindAccount(store);
  const service = new PortalIdentityDeletionService({
    controlStore: store,
    now: () => NOW_ISO
  });
  requestDeletion(service);
  const done = service.runDeletion({ requestRef: "delreq-b2-b-0001" });
  assert.equal(done.status, "completed");
  assert.equal(store.getAccount(ACCOUNT_ID), null);
  const repository = store.identityBindingRepository();
  assert.equal(
    repository.resolve({ issuerRef: "portal", subjectRef: SUBJECT }).outcome,
    "not_found"
  );
}));

test("C2: logical deletion keeps the binding rows with the account row", () => withStore(({ store }) => {
  makeAccount(store);
  bindAccount(store);
  const service = new PortalIdentityDeletionService({
    controlStore: store,
    now: () => NOW_ISO
  });
  requestDeletion(service, { verificationMode: "logical" });
  const done = service.runDeletion({ requestRef: "delreq-b2-b-0001" });
  assert.equal(done.status, "completed");
  assert.notEqual(store.getAccount(ACCOUNT_ID), null);
  const repository = store.identityBindingRepository();
  assert.equal(
    repository.resolve({ issuerRef: "portal", subjectRef: SUBJECT }).outcome,
    "resolved"
  );
}));

// ---------------------------------------------------------------------------
// B2-b P2: HTTP-level attempt limiting for POST /api/portal/authority/session
// (CodeQL #100). Real app + real HTTP via createApp/listen, mirroring the
// admin-auth route tests. Synthetic auth/human-challenge stubs only.
const AUTHORITY_SESSION_PATH = "/api/portal/authority/session";
const HTTP_TEST_ROOT_DIR = new URL("../../", import.meta.url).pathname;

function httpBaseState(platform = {}) {
  return {
    rootDir: HTTP_TEST_ROOT_DIR,
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: "console-secret",
    proxyConfig: { servers: [], pingHosts: [], nginx: {} },
    services: {
      ssLocal: { status: () => ({ running: false }) },
      httpProxy: { status: () => ({ running: false }) }
    },
    // No trusted proxies configured: X-Forwarded-For is never trusted.
    security: {},
    platform,
    isPortListening: async () => false,
    runCommand: async () => ({ ok: true, stdout: "{}", stderr: "", code: 0, timedOut: false })
  };
}

function rejectingAuthorityAuth() {
  return {
    async verifyAuthorityLoginAndMaybeChallenge() {
      const error = new Error("invalid authority login");
      error.code = "invalid_login";
      throw error;
    }
  };
}

function acceptingAuthorityAuth() {
  return {
    async verifyAuthorityLoginAndMaybeChallenge() {
      return {
        session: {
          sessionRef: "synthetic-authority-session",
          accountId: "acct-authority-1",
          expiresAt: "2026-05-31T00:30:00.000Z"
        },
        rememberMe: false
      };
    }
  };
}

function acceptingHttpHumanChallenges() {
  return { verifyChallenge() {} };
}

async function postAuthoritySession(baseUrl, { headers = {} } = {}) {
  return fetch(`${baseUrl}${AUTHORITY_SESSION_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ accessToken: "synthetic.invalid.token" })
  });
}

test("authority session limits repeated attempts by source IP", async () => {
  const state = httpBaseState({
    userPortalRoutesEnabled: true,
    userPortalAuth: rejectingAuthorityAuth(),
    portalHumanChallenges: acceptingHttpHumanChallenges()
  });
  const { server, baseUrl } = await listen(createApp(state));
  try {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await postAuthoritySession(baseUrl);
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: "invalid_login" });
    }

    const limited = await postAuthoritySession(baseUrl);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "60");
    assert.deepEqual(await limited.json(), { error: "Too Many Requests" });
  } finally {
    server.close();
  }
});

test("authority session allows normal attempts below the limit", async () => {
  const state = httpBaseState({
    userPortalRoutesEnabled: true,
    userPortalAuth: acceptingAuthorityAuth(),
    portalHumanChallenges: acceptingHttpHumanChallenges()
  });
  const { server, baseUrl } = await listen(createApp(state));
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`${baseUrl}${AUTHORITY_SESSION_PATH}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: "synthetic.valid.token" })
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.session.sessionRef, "synthetic-authority-session");
    }
  } finally {
    server.close();
  }
});

test("untrusted XFF cannot bypass the authority session limiter", async () => {
  const state = httpBaseState({
    userPortalRoutesEnabled: true,
    userPortalAuth: rejectingAuthorityAuth(),
    portalHumanChallenges: acceptingHttpHumanChallenges()
  });
  const { server, baseUrl } = await listen(createApp(state));
  try {
    // A different client-supplied X-Forwarded-For on every attempt must not
    // open a fresh bucket: the limiter key comes from the verified resolver
    // (direct socket address), never from the untrusted header.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await postAuthoritySession(baseUrl, {
        headers: { "X-Forwarded-For": `203.0.113.${attempt + 1}` }
      });
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: "invalid_login" });
    }

    const limited = await postAuthoritySession(baseUrl, {
      headers: { "X-Forwarded-For": "203.0.113.99" }
    });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "60");
    assert.deepEqual(await limited.json(), { error: "Too Many Requests" });
  } finally {
    server.close();
  }
});
