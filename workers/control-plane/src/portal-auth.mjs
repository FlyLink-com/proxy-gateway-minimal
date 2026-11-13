// Portal Auth0 Access Token exchange and revocable opaque application session.
// Auth0 proves the external identity; the local D1 binding resolves one
// opaque business account. No email or provider token enters D1/DO state.

import { AccountRepository } from "./repositories/account-repository.mjs";
import { IdentityBindingRepository } from "./repositories/identity-binding-repository.mjs";
import { randomBase64Url, sha256Hex } from "./digests.mjs";
import { verifyAuth0AccessTokenWithClaims } from "./oidc-gateway.mjs";
import {
  IDENTITY_ACTOR_CONTEXT_AUDIENCE,
  parseTrustedIdentityActorContext,
} from "./identity-boundary.mjs";

const ACTOR_CONTEXT_TTL_MS = 5 * 60 * 1000;
const MAX_SESSION_MS = 24 * 60 * 60 * 1000;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function response(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function unauthorized() {
  return response(401, { error: { code: "unauthorized", message: "unauthorized" } });
}

function sessionTokenFromRequest(request) {
  const header = request.headers.get("authorization");
  if (typeof header !== "string" || header.length > 64) return null;
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header);
  return match ? match[1] : null;
}

async function stateCall(env, sessionHash, path, body) {
  const namespace = env?.PORTAL_AUTH_STATE;
  if (!namespace || typeof namespace.idFromName !== "function" || typeof namespace.get !== "function") {
    throw new Error("portal_auth_state_unavailable");
  }
  const id = namespace.idFromName(`portal-session:${sessionHash}`);
  const stub = namespace.get(id);
  const result = await stub.fetch(`https://portal-auth-state.internal${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await result.text();
  if (raw.length > 8192) throw new Error("portal_auth_state_unavailable");
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error("portal_auth_state_unavailable"); }
  return { status: result.status, data };
}

function trustedPortalActor({ subjectRef, accountRef, sessionRef, authTimeMs, expiresAtMs, nowMs }) {
  return parseTrustedIdentityActorContext({
    issuerRef: "portal",
    subjectRef,
    accountRef,
    sessionRef,
    authTimeMs,
    expiresAtMs: Math.min(expiresAtMs, nowMs + ACTOR_CONTEXT_TTL_MS),
    factors: [],
    audience: IDENTITY_ACTOR_CONTEXT_AUDIENCE,
  }, {
    allowedIssuers: ["portal"],
    nowMs,
    maxLifetimeMs: ACTOR_CONTEXT_TTL_MS,
  });
}

function safeAccount(account) {
  return {
    id: account.id,
    status: account.status,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

export async function createPortalSession(request, env, {
  fetcher = fetch,
  now = Date.now(),
} = {}) {
  if (request.method !== "POST") {
    return response(405, { error: { code: "method_not_allowed", message: "method not allowed" } });
  }
  if (request.body !== null) {
    return response(400, { error: { code: "invalid_request", message: "request body must be empty" } });
  }
  if (!env?.CONTROL_DB || !Number.isSafeInteger(now) || now < 0) {
    return response(503, { error: { code: "portal_auth_unavailable", message: "authentication is unavailable" } });
  }

  let verified;
  try {
    verified = await verifyAuth0AccessTokenWithClaims(request, env, "portal", {
      fetcher,
      nowSeconds: Math.floor(now / 1000),
    });
  } catch {
    return unauthorized();
  }

  const sessionExpiresAtMs = verified.actor.expiresAt * 1000;
  const nowSeconds = Math.floor(now / 1000);
  const authTimeSeconds = Number.isSafeInteger(verified.claims.auth_time)
    ? verified.claims.auth_time
    : verified.actor.issuedAt;
  if (!Number.isSafeInteger(sessionExpiresAtMs) || sessionExpiresAtMs <= now
    || sessionExpiresAtMs - now > MAX_SESSION_MS
    || !Number.isSafeInteger(authTimeSeconds) || authTimeSeconds < 0
    || authTimeSeconds > nowSeconds + 60) {
    return unauthorized();
  }

  let accountRef;
  let bindingRef;
  try {
    const bindings = new IdentityBindingRepository(env.CONTROL_DB);
    const resolved = await bindings.resolve({ issuerRef: "portal", subjectRef: verified.actor.subject });
    if (resolved.outcome !== "resolved" || typeof resolved.bindingId !== "string") return unauthorized();
    accountRef = resolved.accountRef;
    bindingRef = resolved.bindingId;
    const account = await new AccountRepository(env.CONTROL_DB).findById(accountRef);
    if (!account || account.status !== "active") return unauthorized();
  } catch {
    return response(503, { error: { code: "identity_binding_unavailable", message: "authentication is unavailable" } });
  }

  const sessionToken = randomBase64Url(32);
  const sessionHash = await sha256Hex(sessionToken);
  const sessionRef = `sess_${randomBase64Url(24)}`;
  let actor;
  try {
    actor = trustedPortalActor({
      subjectRef: verified.actor.subject,
      accountRef,
      sessionRef,
      authTimeMs: authTimeSeconds * 1000,
      expiresAtMs: sessionExpiresAtMs,
      nowMs: now,
    });
  } catch {
    return unauthorized();
  }

  const actorRecord = {
    issuerRef: actor.issuerRef,
    subjectRef: actor.subjectRef,
    accountRef: actor.accountRef,
    sessionRef: actor.sessionRef,
    authTimeMs: actor.authTimeMs,
    factors: [...actor.factors],
    audience: actor.audience,
  };
  try {
    const created = await stateCall(env, sessionHash, "/session/create", {
      actor: actorRecord,
      bindingRef,
      createdAtMs: now,
      expiresAtMs: sessionExpiresAtMs,
      nowMs: now,
    });
    if (created.status !== 201) {
      return response(503, { error: { code: "portal_session_unavailable", message: "authentication is unavailable" } });
    }
  } catch {
    return response(503, { error: { code: "portal_session_unavailable", message: "authentication is unavailable" } });
  }

  // The client receives only a random, revocable session token. The
  // account/subject binding remains inside the DO record for the trusted
  // business-side resolver; no account identifier or provider token is echoed.
  return response(201, {
    sessionToken,
    expiresAt: new Date(sessionExpiresAtMs).toISOString(),
  });
}

// Internal business-side resolver. Do not expose this as a public route;
// the production caller must be the separately approved private service-binding path.
export async function resolvePortalSession(request, env, { now = Date.now() } = {}) {
  const sessionToken = sessionTokenFromRequest(request);
  if (!sessionToken || !env?.CONTROL_DB || !Number.isSafeInteger(now) || now < 0) return null;
  const sessionHash = await sha256Hex(sessionToken);
  const state = await stateCall(env, sessionHash, "/session/validate", { nowMs: now });
  if (state.status === 401) return null;
  if (state.status !== 200 || !state.data?.actor || typeof state.data.bindingRef !== "string"
    || !Number.isSafeInteger(state.data.expiresAtMs)) {
    throw new Error("portal_session_unavailable");
  }

  let actor;
  try {
    const base = state.data.actor;
    actor = parseTrustedIdentityActorContext({
      ...base,
      expiresAtMs: Math.min(state.data.expiresAtMs, now + ACTOR_CONTEXT_TTL_MS),
    }, {
      allowedIssuers: ["portal"],
      nowMs: now,
      maxLifetimeMs: ACTOR_CONTEXT_TTL_MS,
    });
  } catch {
    return null;
  }

  let binding;
  let account;
  try {
    binding = await new IdentityBindingRepository(env.CONTROL_DB).resolve({
      issuerRef: actor.issuerRef,
      subjectRef: actor.subjectRef,
      expectedAccountRef: actor.accountRef,
    });
    if (binding.outcome !== "resolved" || binding.bindingId !== state.data.bindingRef) {
      try { await stateCall(env, sessionHash, "/session/revoke", {}); } catch { /* fail closed */ }
      return null;
    }
    account = await new AccountRepository(env.CONTROL_DB).findById(binding.accountRef);
  } catch {
    throw new Error("portal_identity_binding_unavailable");
  }
  if (!account || account.status !== "active") {
    try { await stateCall(env, sessionHash, "/session/revoke", {}); } catch { /* fail closed */ }
    return null;
  }
  return { actor, account: safeAccount(account) };
}

export async function logoutPortalSession(request, env) {
  if (request.method !== "POST") {
    return response(405, { error: { code: "method_not_allowed", message: "method not allowed" } });
  }
  const sessionToken = sessionTokenFromRequest(request);
  if (!sessionToken) return unauthorized();
  const sessionHash = await sha256Hex(sessionToken);
  try {
    const result = await stateCall(env, sessionHash, "/session/revoke", {});
    if (result.status !== 200) throw new Error("portal_logout_unavailable");
  } catch {
    return response(503, { error: { code: "portal_logout_unavailable", message: "logout is unavailable" } });
  }
  return response(200, { ok: true });
}
