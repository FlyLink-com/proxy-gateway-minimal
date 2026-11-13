import assert from "node:assert/strict";
import test from "node:test";
import { createSign, generateKeyPairSync, webcrypto } from "node:crypto";
import { PortalAuthState } from "../src/portal-auth-state.mjs";
import { createPortalSession, resolvePortalSession, logoutPortalSession } from "../src/portal-auth.mjs";
import { resetOidcJwksCacheForTests } from "../src/oidc-gateway.mjs";
import { createWorker } from "./helpers.mjs";

globalThis.crypto ??= webcrypto;
const b64url = (value) => Buffer.from(value).toString("base64url");
const issuer = "https://portal.example.test/";
const audience = "https://api.portal.example.test/";
const clientId = "portalClient123";
const now = Date.now();
const nowSeconds = Math.floor(now / 1000);
const subject = "auth0|portal-synth-101";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "portal-key", kty: "RSA", use: "sig", alg: "RS256" };

function jwt(claims) {
  const header = b64url(JSON.stringify({ alg: "RS256", kid: "portal-key", typ: "JWT" }));
  const payload = b64url(JSON.stringify(claims));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${signer.sign(privateKey).toString("base64url")}`;
}

function tokenFor(sub = subject, overrides = {}) {
  return jwt({
    iss: issuer,
    sub,
    aud: audience,
    azp: clientId,
    scope: "read:portal_identity",
    iat: nowSeconds,
    exp: nowSeconds + 600,
    ...overrides,
  });
}

function fixtureFetch() {
  return async (url) => {
    if (url !== `${issuer}.well-known/jwks.json`) throw new Error("unexpected provider endpoint");
    return new Response(JSON.stringify({ keys: [jwk] }), { headers: { "content-type": "application/json" } });
  };
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
      const object = new PortalAuthState(state, {});
      this.objects.set(id, { state, object });
    }
    const { object } = this.objects.get(id);
    return { fetch: (input, init) => object.fetch(new Request(input, init)) };
  }
}

function env(db, namespace = new FakeNamespace()) {
  return {
    CONTROL_DB: db,
    PORTAL_AUTH_STATE: namespace,
    AUTH0_PORTAL_ISSUER: issuer,
    AUTH0_PORTAL_AUDIENCE: audience,
    AUTH0_PORTAL_ALLOWED_CLIENT_IDS: clientId,
    AUTH0_ADMIN_ISSUER: "https://admin.example.test/",
    AUTH0_ADMIN_AUDIENCE: "https://api.admin.example.test/",
    AUTH0_ADMIN_ALLOWED_CLIENT_IDS: "adminClient123",
  };
}

async function bind(db, { accountId = "acct-pg-101", sub = subject } = {}) {
  const at = Date.now();
  await db.prepare(
    `INSERT INTO platform_identity_bindings
       (id, account_id, issuer_ref, subject_ref, status, created_at_ms, updated_at_ms, revoked_at_ms)
     VALUES (?, ?, 'portal', ?, 'active', ?, ?, NULL)`,
  ).bind(`idb-synth-${accountId}`, accountId, sub, at, at).run();
}

test("Portal exchange binds verified Auth0 subject to one active account and issues a revocable opaque session", async (t) => {
  resetOidcJwksCacheForTests();
  const { mf, db } = await createWorker();
  t.after(() => mf.dispose());
  await bind(db);
  const namespace = new FakeNamespace();
  const e = env(db, namespace);
  const accessToken = tokenFor();
  const created = await createPortalSession(new Request("https://worker.test/v1/auth/portal/session", {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
  }), e, { fetcher: fixtureFetch(), now });
  assert.equal(created.status, 201);
  const issued = await created.json();
  assert.match(issued.sessionToken, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(typeof issued.expiresAt, "string");
  assert.deepEqual(Object.keys(issued).sort(), ["expiresAt", "sessionToken"]);
  assert.equal(JSON.stringify(issued).includes("@"), false);
  assert.equal(JSON.stringify(issued).includes(subject), false);

  const sessionRequest = new Request("https://worker.test/internal/portal-session", {
    headers: { authorization: `Bearer ${issued.sessionToken}` },
  });
  const resolved = await resolvePortalSession(sessionRequest, e, { now: now + 1000 });
  assert.equal(resolved.actor.issuerRef, "portal");
  assert.equal(resolved.actor.subjectRef, subject);
  assert.equal(resolved.actor.accountRef, "acct-pg-101");
  assert.equal(resolved.actor.issuedAtMs, nowSeconds * 1000);
  assert.equal(resolved.actor.authTimeMs, null);
  assert.deepEqual(resolved.actor.factors, []);
  assert.deepEqual(resolved.account, {
    id: "acct-pg-101",
    status: "active",
    createdAt: "2026-03-01T10:00:00.000Z",
    updatedAt: "2026-03-01T10:00:00.000Z",
  });

  const stored = [...namespace.objects.values()][0].state.storage.data.get("record");
  assert.equal(stored.kind, "portal_session");
  assert.equal(stored.bindingRef, "idb-synth-acct-pg-101");
  assert.equal(stored.actor.issuedAtMs, nowSeconds * 1000);
  assert.equal(stored.actor.authTimeMs, null);
  assert.equal(JSON.stringify(stored).includes(accessToken), false);
  assert.equal(JSON.stringify(stored).includes("@"), false);
  assert.equal(JSON.stringify(stored).includes("email"), false);

  // A previously issued session is invalidated immediately when its exact
  // issuer/subject binding is revoked, even before the provider token expires.
  const bindingRow = await db.prepare(
    "SELECT id FROM platform_identity_bindings WHERE issuer_ref = 'portal' AND subject_ref = ?",
  ).bind(subject).first();
  const revokedAt = Date.now() + 1000;
  await db.prepare(
    "UPDATE platform_identity_bindings SET status = 'revoked', updated_at_ms = ?, revoked_at_ms = ? WHERE id = ?",
  ).bind(revokedAt, revokedAt, bindingRow.id).run();
  await db.prepare(
    `INSERT INTO platform_identity_bindings
       (id, account_id, issuer_ref, subject_ref, status, created_at_ms, updated_at_ms, revoked_at_ms)
     VALUES ('idb-synth-rebound', 'acct-pg-101', 'portal', ?, 'active', ?, ?, NULL)`,
  ).bind(subject, revokedAt + 1, revokedAt + 1).run();
  // Rebinding the same subject to the same account still invalidates sessions
  // created under the previous binding generation.
  assert.equal(await resolvePortalSession(sessionRequest, e, { now: revokedAt + 100 }), null);

  const logout = await logoutPortalSession(new Request("https://worker.test/v1/auth/portal/logout", {
    method: "POST",
    headers: { authorization: `Bearer ${issued.sessionToken}` },
  }), e);
  assert.equal(logout.status, 200);
  assert.equal(await resolvePortalSession(sessionRequest, e, { now: now + 2000 }), null);
});

test("Portal auth keeps verified auth_time unchanged when a silent refresh issues a newer token", async (t) => {
  resetOidcJwksCacheForTests();
  const { mf, db } = await createWorker();
  t.after(() => mf.dispose());
  await bind(db);
  const namespace = new FakeNamespace();
  const e = env(db, namespace);
  const previousAuthenticationTime = nowSeconds - 120;
  const accessToken = tokenFor(subject, {
    iat: nowSeconds,
    auth_time: previousAuthenticationTime,
  });
  const created = await createPortalSession(new Request("https://worker.test/v1/auth/portal/session", {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
  }), e, { fetcher: fixtureFetch(), now });
  assert.equal(created.status, 201);
  const issued = await created.json();
  const resolved = await resolvePortalSession(new Request("https://worker.test/internal/portal-session", {
    headers: { authorization: `Bearer ${issued.sessionToken}` },
  }), e, { now: now + 1000 });
  assert.equal(resolved.actor.issuedAtMs, nowSeconds * 1000);
  assert.equal(resolved.actor.authTimeMs, previousAuthenticationTime * 1000);
  const stored = [...namespace.objects.values()][0].state.storage.data.get("record");
  assert.equal(stored.actor.issuedAtMs, nowSeconds * 1000);
  assert.equal(stored.actor.authTimeMs, previousAuthenticationTime * 1000);
  for (const auth_time of [nowSeconds + 61, -1]) {
    const invalid = await createPortalSession(new Request("https://worker.test/v1/auth/portal/session", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenFor(subject, { auth_time })}` },
    }), e, { fetcher: fixtureFetch(), now });
    assert.equal(invalid.status, 401);
  }
});

test("Portal exchange rejects unknown subjects, wrong tenants and inactive business accounts", async (t) => {
  resetOidcJwksCacheForTests();
  const { mf, db } = await createWorker();
  t.after(() => mf.dispose());
  const e = env(db);
  const unknown = await createPortalSession(new Request("https://worker.test/v1/auth/portal/session", {
    method: "POST", headers: { authorization: `Bearer ${tokenFor("auth0|unknown-subject")}` },
  }), e, { fetcher: fixtureFetch(), now });
  assert.equal(unknown.status, 401);

  await bind(db, { accountId: "acct-pg-103", sub: "auth0|suspended-subject" });
  const suspended = await createPortalSession(new Request("https://worker.test/v1/auth/portal/session", {
    method: "POST", headers: { authorization: `Bearer ${tokenFor("auth0|suspended-subject")}` },
  }), e, { fetcher: fixtureFetch(), now });
  assert.equal(suspended.status, 401);

  const wrongTenant = jwt({
    iss: "https://admin.example.test/", sub: subject, aud: "https://api.admin.example.test/",
    azp: "adminClient123", scope: "read:admin_identity", iat: nowSeconds, exp: nowSeconds + 600,
  });
  const cross = await createPortalSession(new Request("https://worker.test/v1/auth/portal/session", {
    method: "POST", headers: { authorization: `Bearer ${wrongTenant}` },
  }), e, { fetcher: fixtureFetch(), now });
  assert.equal(cross.status, 401);
});

test("Portal session expiry and malformed session bearer fail closed", async (t) => {
  resetOidcJwksCacheForTests();
  const { mf, db } = await createWorker();
  t.after(() => mf.dispose());
  await bind(db);
  const e = env(db);
  const created = await createPortalSession(new Request("https://worker.test/v1/auth/portal/session", {
    method: "POST", headers: { authorization: `Bearer ${tokenFor()}` },
  }), e, { fetcher: fixtureFetch(), now });
  const issued = await created.json();
  const sessionRequest = new Request("https://worker.test/internal/portal-session", {
    headers: { authorization: `Bearer ${issued.sessionToken}` },
  });
  assert.equal(await resolvePortalSession(sessionRequest, e, { now: now + 601_000 }), null);
  assert.equal(await resolvePortalSession(new Request("https://worker.test/internal/portal-session", {
    headers: { authorization: "Bearer malformed" },
  }), e, { now: now + 1000 }), null);
});
