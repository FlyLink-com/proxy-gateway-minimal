import test from "node:test";
import assert from "node:assert/strict";
import { createSign, createHash, generateKeyPairSync, webcrypto, randomBytes } from "node:crypto";
import { AdminAuthState } from "../src/admin-auth-state.mjs";
import { startAdminLogin, completeAdminLogin, getAdminSession, logoutAdminSession } from "../src/admin-auth.mjs";\nimport worker from "../src/index.mjs";

globalThis.crypto ??= webcrypto;
const encoder = new TextEncoder();
const b64url = (value) => Buffer.from(value).toString("base64url");
const now = Date.now();
const nowS = Math.floor(now / 1000);
const issuer = "https://admin.example.test/";
const clientId = "adminClient123";
const audience = "https://api.admin.example.test/";
const claimUri = "https://flylink.example.test/mfa";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "admin-key", kty: "RSA", use: "sig", alg: "RS256" };

function jwt(claims) {
  const header = b64url(JSON.stringify({ alg: "RS256", kid: "admin-key", typ: "JWT" }));
  const payload = b64url(JSON.stringify(claims));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${signer.sign(privateKey).toString("base64url")}`;
}

class FakeStorage {
  constructor() { this.data = new Map(); this.alarm = null; this.queue = Promise.resolve(); }
  get(key) { return Promise.resolve(this.data.get(key)); }
  put(key, value) { this.data.set(key, structuredClone(value)); return Promise.resolve(); }
  delete(key) { return Promise.resolve(this.data.delete(key)); }
  deleteAll() { this.data.clear(); return Promise.resolve(); }
  setAlarm(at) { this.alarm = at; return Promise.resolve(); }
  deleteAlarm() { this.alarm = null; return Promise.resolve(); }
  transaction(fn) {
    const run = this.queue.then(() => fn({
      get: (key) => Promise.resolve(this.data.get(key)),
      put: (key, value) => { this.data.set(key, structuredClone(value)); return Promise.resolve(); },
      delete: (key) => Promise.resolve(this.data.delete(key)),
    }));
    this.queue = run.catch(() => {});
    return run;
  }
}
class FakeNamespace {
  constructor() { this.objects = new Map(); }
  idFromName(name) { return name; }
  get(id) {
    if (!this.objects.has(id)) {
      const state = { storage: new FakeStorage() };
      const object = new AdminAuthState(state, {});
      this.objects.set(id, { state, object });
    }
    const { object } = this.objects.get(id);
    return { fetch: (input, init) => object.fetch(new Request(input, init)) };
  }
}
function env() {
  return {
    ADMIN_AUTH_STATE: new FakeNamespace(),
    AUTH0_ADMIN_ISSUER: issuer,
    AUTH0_ADMIN_CLIENT_ID: clientId,
    AUTH0_ADMIN_CLIENT_SECRET: "synthetic-client-secret",
    AUTH0_ADMIN_AUDIENCE: audience,
    AUTH0_ADMIN_REDIRECT_URI: "https://admin.example.test/v1/auth/admin/callback",
    ADMIN_APP_ORIGIN: "https://admin.example.test",
    AUTH0_ADMIN_ALLOWED_CLIENT_IDS: clientId,
    AUTH0_ADMIN_MFA_CLAIM: claimUri,
    AUTH0_ADMIN_TX_ENCRYPTION_KEY: b64url(randomBytes(32)),
  };
}
function cookies(response) {
  const values = response.headers.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];
  return values;
}
function cookieValue(response, name) {
  const all = cookies(response).join("; ");
  const match = all.match(new RegExp(`(?:^|[,;]\\s*)${name}=([^;,]+)`));
  return match?.[1] ?? null;
}
function jwksResponse() {
  return new Response(JSON.stringify({ keys: [jwk] }), { headers: { "content-type": "application/json" } });
}

test("AdminAuthState consumes OAuth transactions exactly once under concurrency", async () => {
  const state = { storage: new FakeStorage() };
  const object = new AdminAuthState(state, {});
  const stateHash = "a".repeat(64);
  const create = await object.fetch(new Request("https://do/transaction/create", {
    method: "POST", body: JSON.stringify({
      stateHash, nonce: "n".repeat(43), encryptedVerifier: "iv.cipher",
      redirectUri: "https://admin.example.test/v1/auth/admin/callback",
      createdAt: Date.now(), expiresAt: Date.now() + 60000,
    }),
  }));
  assert.equal(create.status, 201);
  const attempts = await Promise.all([1, 2, 3].map(() => object.fetch(new Request("https://do/transaction/consume", {
    method: "POST", body: JSON.stringify({ stateHash, now: Date.now() }),
  }))));
  const successes = attempts.filter((r) => r.status === 200);
  assert.equal(successes.length, 1);
  assert.equal((await attempts.find((r) => r.status === 200).json()).transaction.stateHash, stateHash);
  assert.equal((await object.fetch(new Request("https://do/transaction/consume", {
    method: "POST", body: JSON.stringify({ stateHash, now: Date.now() }),
  }))).status, 401);
});

test("Admin session state is bounded, expires and can be explicitly revoked", async () => {
  const state = { storage: new FakeStorage() };
  const object = new AdminAuthState(state, {});
  const createdAt = Date.now();
  const body = {
    actor: { surface: "admin", issuer, subject: "auth0|synthetic", clientId, scopes: ["read:admin_identity"] },
    mfaVerifiedAt: createdAt, authTime: createdAt, createdAt, expiresAt: createdAt + 900000,
  };
  assert.equal((await object.fetch(new Request("https://do/session/create", { method: "POST", body: JSON.stringify(body) }))).status, 201);
  assert.equal((await object.fetch(new Request("https://do/session/validate", { method: "POST", body: JSON.stringify({ now: createdAt + 1000 }) }))).status, 200);
  assert.equal((await object.fetch(new Request("https://do/session/validate", { method: "POST", body: JSON.stringify({ now: createdAt + 900001 }) }))).status, 401);
  assert.equal((await object.fetch(new Request("https://do/session/revoke", { method: "POST", body: "{}" }))).status, 200);
});

test("Universal Login BFF completes state, PKCE, nonce, Access Token and MFA proof then issues opaque session", async () => {
  const e = env();
  const start = await startAdminLogin(new Request("https://admin.example.test/v1/auth/admin/login", {
    headers: { origin: "https://admin.example.test" },
  }), e);
  assert.equal(start.status, 302);
  const authorize = new URL(start.headers.get("location"));
  assert.equal(authorize.searchParams.get("response_type"), "code");
  assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
  assert.equal(authorize.searchParams.get("prompt"), "login");
  assert.equal(authorize.searchParams.get("max_age"), "0");
  assert.equal(authorize.searchParams.get("scope"), "openid read:admin_identity");
  assert.ok(!authorize.searchParams.get("scope").includes("offline_access"));
  const state = authorize.searchParams.get("state");
  const nonce = authorize.searchParams.get("nonce");
  const cookie = cookieValue(start, "__Host-flylink_admin_oauth_state");
  assert.equal(cookie, state);

  const accessToken = jwt({
    iss: issuer, sub: "auth0|synthetic-admin", aud: audience, azp: clientId,
    scope: "read:admin_identity", iat: nowS, exp: nowS + 600,
    [claimUri]: { method: "otp", completed_at: new Date(now).toISOString() },
  });
  const idToken = jwt({
    iss: issuer, sub: "auth0|synthetic-admin", aud: clientId, azp: clientId,
    nonce, iat: nowS, exp: nowS + 600, auth_time: nowS,
  });
  const fetcher = async (url, init) => {
    if (url === issuer + "oauth/token") {
      assert.equal(init.method, "POST");
      const form = new URLSearchParams(init.body);
      assert.equal(form.get("client_secret"), "synthetic-client-secret");\n      const verifier = form.get("code_verifier");\n      assert.equal(Buffer.from(createHash("sha256").update(verifier).digest()).toString("base64url"), authorize.searchParams.get("code_challenge"));
      assert.equal(form.get("grant_type"), "authorization_code");
      assert.ok(form.get("code_verifier"));
      return new Response(JSON.stringify({ token_type: "Bearer", expires_in: 600, access_token: accessToken, id_token: idToken }));
    }
    if (url === issuer + ".well-known/jwks.json") return jwksResponse();
    throw new Error("unexpected provider endpoint");
  };
  const callback = await completeAdminLogin(new Request(
    `https://admin.example.test/v1/auth/admin/callback?code=synthetic-code&state=${state}`,
    { headers: { cookie: `__Host-flylink_admin_oauth_state=${cookie}` } },
  ), e, { fetcher, now });
  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get("location"), "https://admin.example.test");
  const session = cookieValue(callback, "__Host-flylink_admin_session");
  assert.ok(session);
  assert.match(cookies(callback).join(";"), /HttpOnly/);
  assert.match(cookies(callback).join(";"), /SameSite=Strict/);

  const identity = await getAdminSession(new Request("https://admin.example.test/v1/auth/admin/identity", {
    headers: { origin: "https://admin.example.test", cookie: `__Host-flylink_admin_session=${session}` },
  }), e, { now });
  assert.equal(identity.status, 200);
  const actor = await identity.json();
  assert.equal(actor.actor.subject, "auth0|synthetic-admin");
  assert.equal(actor.actor.surface, "admin");
  assert.equal(actor.mfaVerifiedAt, now);

  const logout = await logoutAdminSession(new Request("https://admin.example.test/v1/auth/admin/logout", {
    method: "POST",
    headers: { origin: "https://admin.example.test", cookie: `__Host-flylink_admin_session=${session}` },
  }), e);
  assert.equal(logout.status, 200);
  const afterLogout = await getAdminSession(new Request("https://admin.example.test/v1/auth/admin/identity", {
    headers: { origin: "https://admin.example.test", cookie: `__Host-flylink_admin_session=${session}` },
  }), e, { now });
  assert.equal(afterLogout.status, 401);
});

test("callback rejects replayed state and refuses a missing MFA proof", async () => {
  const e = env();
  const start = await startAdminLogin(new Request("https://admin.example.test/v1/auth/admin/login", {
    headers: { origin: "https://admin.example.test" },
  }), e);
  const authorize = new URL(start.headers.get("location"));
  const state = authorize.searchParams.get("state");
  const cookie = cookieValue(start, "__Host-flylink_admin_oauth_state");
  const accessToken = jwt({
    iss: issuer, sub: "auth0|synthetic-admin", aud: audience, azp: clientId,
    scope: "read:admin_identity", iat: nowS, exp: nowS + 600,
  });
  const idToken = jwt({
    iss: issuer, sub: "auth0|synthetic-admin", aud: clientId, azp: clientId,
    nonce: authorize.searchParams.get("nonce"), iat: nowS, exp: nowS + 600, auth_time: nowS,
  });
  const fetcher = async (url) => url === issuer + "oauth/token"
    ? new Response(JSON.stringify({ token_type: "Bearer", expires_in: 600, access_token: accessToken, id_token: idToken }))
    : jwksResponse();
  const request = () => new Request(`https://admin.example.test/v1/auth/admin/callback?code=code&state=${state}`, {
    headers: { cookie: `__Host-flylink_admin_oauth_state=${cookie}` },
  });
  const first = await completeAdminLogin(request(), e, { fetcher, now });
  assert.equal(first.status, 302);
  assert.equal(cookieValue(first, "__Host-flylink_admin_session"), null);
  const replay = await completeAdminLogin(request(), e, { fetcher, now });
  assert.equal(replay.status, 401);
});

test("logout rejects cross-origin POST and callback rejects state-cookie mismatch", async () => {
  const e = env();
  const denied = await logoutAdminSession(new Request("https://admin.example.test/v1/auth/admin/logout", {
    method: "POST", headers: { origin: "https://evil.example.test" },
  }), e);
  assert.equal(denied.status, 403);
  const mismatch = await completeAdminLogin(new Request(
    "https://admin.example.test/v1/auth/admin/callback?code=x&state=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    { headers: { cookie: "__Host-flylink_admin_oauth_state=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" } },
  ), e);
  assert.equal(mismatch.status, 401);
});


test("Worker routes expose the Admin BFF and preserve Portal route separation", async () => {
  const e = env();
  const login = await worker.fetch(new Request("https://admin.example.test/v1/auth/admin/login", {
    headers: { origin: "https://admin.example.test" },
  }), e);
  assert.equal(login.status, 302);
  assert.match(login.headers.get("location"), /\/authorize\?/);

  const missingSession = await worker.fetch(new Request("https://admin.example.test/v1/auth/admin/identity", {
    headers: { origin: "https://admin.example.test" },
  }), e);
  assert.equal(missingSession.status, 401);

  const crossOriginLogout = await worker.fetch(new Request("https://admin.example.test/v1/auth/admin/logout", {
    method: "POST", headers: { origin: "https://evil.example.test" },
  }), e);
  assert.equal(crossOriginLogout.status, 403);
});
