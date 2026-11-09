// Admin Backend-for-Frontend: Auth0 Universal Login + Authorization Code + PKCE.
// No password/OTP grant is used. Provider tokens are verified in memory and discarded.
// Durable Object state stores only a short-lived encrypted PKCE verifier/nonce transaction
// and a minimal opaque Admin session record; never D1, logs, or browser storage.

import { randomBase64Url } from "./digests.mjs";
import { verifyAuth0AccessTokenWithClaims, verifyAuth0IdToken } from "./oidc-gateway.mjs";

const STATE_COOKIE = "__Host-flylink_admin_oauth_state";
const SESSION_COOKIE = "__Host-flylink_admin_session";
const TX_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 15 * 60 * 1000;
const MFA_MAX_AGE_MS = 5 * 60 * 1000;
const MAX_TOKEN_RESPONSE_BYTES = 16384;
const encoder = new TextEncoder();

function b64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function decodeB64url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("invalid_encoding");
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  if (b64url(bytes) !== value) throw new Error("invalid_encoding");
  return bytes;
}
async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
}
function required(value, max = 2048) {
  if (typeof value !== "string" || value.length < 1 || value.length > max || value.trim() !== value) throw new Error("configuration");
  return value;
}
function config(env) {
  const issuer = required(env.AUTH0_ADMIN_ISSUER, 1024);
  const clientId = required(env.AUTH0_ADMIN_CLIENT_ID, 256);
  const clientSecret = required(env.AUTH0_ADMIN_CLIENT_SECRET, 4096);
  const audience = required(env.AUTH0_ADMIN_AUDIENCE, 512);
  const redirectUri = required(env.AUTH0_ADMIN_REDIRECT_URI, 2048);
  const appOrigin = required(env.ADMIN_APP_ORIGIN, 512);
  const mfaClaim = required(env.AUTH0_ADMIN_MFA_CLAIM, 512);
  const txKey = required(env.AUTH0_ADMIN_TX_ENCRYPTION_KEY, 128);
  const issuerUrl = new URL(issuer);
  const redirectUrl = new URL(redirectUri);
  const appUrl = new URL(appOrigin);
  if (issuerUrl.protocol !== "https:" || issuerUrl.pathname !== "/" || issuerUrl.search || issuerUrl.hash || issuerUrl.href !== issuer
    || redirectUrl.protocol !== "https:" || redirectUrl.pathname !== "/v1/auth/admin/callback" || redirectUrl.search || redirectUrl.hash
    || appUrl.protocol !== "https:" || appUrl.pathname !== "/" || appUrl.search || appUrl.hash || appUrl.origin !== appOrigin
    || !mfaClaim.startsWith("https://") || !env.AUTH0_ADMIN_ALLOWED_CLIENT_IDS?.split(",").map(x => x.trim()).includes(clientId)) {
    throw new Error("configuration");
  }
  const keyBytes = decodeB64url(txKey);
  if (keyBytes.length !== 32) throw new Error("configuration");
  return { issuer, clientId, clientSecret, audience, redirectUri, appOrigin, mfaClaim, keyBytes };
}
function cookieValue(request, name) {
  const header = request.headers.get("cookie") ?? "";
  if (header.length > 4096) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}
function setCookie(name, value, maxAge, sameSite) {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=${sameSite}`;
}
function clearCookie(name, sameSite) {
  return `${name}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=${sameSite}`;
}
function response(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}
function redirect(location, cookieHeaders = []) {
  const headers = new Headers({ location, "cache-control": "no-store", "referrer-policy": "no-referrer" });
  for (const value of cookieHeaders) headers.append("set-cookie", value);
  return new Response(null, { status: 302, headers });
}
function originAllowed(request, appOrigin, requireOrigin = false) {
  const origin = request.headers.get("origin");
  return origin ? origin === appOrigin : !requireOrigin;
}
async function stateCall(env, name, path, body) {
  if (!env.ADMIN_AUTH_STATE || typeof env.ADMIN_AUTH_STATE.idFromName !== "function") throw new Error("state_unavailable");
  const id = env.ADMIN_AUTH_STATE.idFromName(name);
  const stub = env.ADMIN_AUTH_STATE.get(id);
  const result = await stub.fetch(`https://admin-auth-state.internal${path}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const raw = await result.text();
  if (raw.length > 8192) throw new Error("state_unavailable");
  let data; try { data = JSON.parse(raw); } catch { throw new Error("state_unavailable"); }
  if (!result.ok) throw new Error("state_unavailable");
  return data;
}
async function encryptionKey(rawBytes) {
  return crypto.subtle.importKey("raw", rawBytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function encryptVerifier(verifier, rawKey, stateHash) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey(rawKey);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(`admin-auth-tx:${stateHash}`), tagLength: 128 },
    key,
    encoder.encode(verifier),
  );
  return `${b64url(iv)}.${b64url(new Uint8Array(ciphertext))}`;
}
async function decryptVerifier(envelope, rawKey, stateHash) {
  if (typeof envelope !== "string" || envelope.length > 2048) throw new Error("transaction_invalid");
  const parts = envelope.split(".");
  if (parts.length !== 2) throw new Error("transaction_invalid");
  const iv = decodeB64url(parts[0]);
  const ciphertext = decodeB64url(parts[1]);
  if (iv.length !== 12 || ciphertext.length < 17 || ciphertext.length > 1024) throw new Error("transaction_invalid");
  const key = await encryptionKey(rawKey);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(`admin-auth-tx:${stateHash}`), tagLength: 128 },
    key,
    ciphertext,
  );
  const verifier = new TextDecoder("utf-8", { fatal: true }).decode(plain);
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(verifier)) throw new Error("transaction_invalid");
  return verifier;
}
async function readJsonBounded(response, maxBytes) {
  const raw = await response.text();
  if (encoder.encode(raw).length > maxBytes) throw new Error("provider_error");
  const value = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("provider_error");
  return value;
}
async function revokeUnexpectedRefreshToken(cfg, token, fetcher) {
  const form = new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, token });
  try {
    await fetcher(`${cfg.issuer}oauth/revoke`, {
      method: "POST", redirect: "error",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
  } catch { /* Do not log token or provider response. */ }
}

export async function startAdminLogin(request, env, { now = Date.now() } = {}) {
  if (request.method !== "GET") return response(405, { error: { code: "method_not_allowed" } });
  let cfg;
  try { cfg = config(env); } catch { return response(503, { error: { code: "admin_auth_unavailable" } }); }
  if (!originAllowed(request, cfg.appOrigin)) return response(403, { error: { code: "origin_denied" } });
  try {
    const state = randomBase64Url(32);
    const nonce = randomBase64Url(32);
    const verifier = randomBase64Url(32);
    const stateHash = await sha256(state);
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(verifier))));
    const encryptedVerifier = await encryptVerifier(verifier, cfg.keyBytes, stateHash);
    const createdAt = now;
    const expiresAt = now + TX_TTL_MS;
    await stateCall(env, `tx:${stateHash}`, "/transaction/create", {
      stateHash, nonce, encryptedVerifier, redirectUri: cfg.redirectUri, createdAt, expiresAt,
    });
    const authorize = new URL(`${cfg.issuer}authorize`);
    authorize.search = new URLSearchParams({
      response_type: "code",
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      audience: cfg.audience,
      scope: "openid read:admin_identity",
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: "S256",
      prompt: "login",
      max_age: "0",
    }).toString();
    return redirect(authorize.toString(), [setCookie(STATE_COOKIE, state, TX_TTL_MS / 1000, "Lax")]);
  } catch {
    return response(503, { error: { code: "admin_auth_unavailable" } });
  }
}

export async function completeAdminLogin(request, env, { fetcher = fetch, now = Date.now() } = {}) {
  if (request.method !== "GET") return response(405, { error: { code: "method_not_allowed" } });
  let cfg;
  try { cfg = config(env); } catch { return response(503, { error: { code: "admin_auth_unavailable" } }); }
  const url = new URL(request.url);
  const stateValues = url.searchParams.getAll("state");
  const codeValues = url.searchParams.getAll("code");
  const errorValues = url.searchParams.getAll("error");
  const state = stateValues.length === 1 ? stateValues[0] : null;
  const cookieState = cookieValue(request, STATE_COOKIE);
  if (!state || !cookieState || state !== cookieState || !/^[A-Za-z0-9_-]{43}$/.test(state)
    || codeValues.length > 1 || errorValues.length > 1) {
    return response(401, { error: { code: "admin_login_failed" } }, { "set-cookie": clearCookie(STATE_COOKIE, "Lax") });
  }
  if (url.searchParams.has("iss") && url.searchParams.get("iss") !== cfg.issuer) {
    return response(401, { error: { code: "admin_login_failed" } }, { "set-cookie": clearCookie(STATE_COOKIE, "Lax") });
  }
  const stateHash = await sha256(state);
  let transaction;
  try {
    const consumed = await stateCall(env, `tx:${stateHash}`, "/transaction/consume", { stateHash, now });
    transaction = consumed.transaction;
  } catch {
    return response(401, { error: { code: "admin_login_failed" } }, { "set-cookie": clearCookie(STATE_COOKIE, "Lax") });
  }
  const clearState = clearCookie(STATE_COOKIE, "Lax");
  if (errorValues.length || !codeValues[0] || codeValues[0].length > 4096 || transaction.redirectUri !== cfg.redirectUri) {
    return redirect(`${cfg.appOrigin}`, [clearState]);
  }

  try {
    const verifier = await decryptVerifier(transaction.encryptedVerifier, cfg.keyBytes, stateHash);
    const form = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code: codeValues[0],
      redirect_uri: cfg.redirectUri,
      code_verifier: verifier,
    });
    const tokenResponse = await fetcher(`${cfg.issuer}oauth/token`, {
      method: "POST", redirect: "error",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    if (!tokenResponse.ok) throw new Error("provider_error");
    const tokens = await readJsonBounded(tokenResponse, MAX_TOKEN_RESPONSE_BYTES);
    if (typeof tokens.refresh_token === "string" && tokens.refresh_token.length) {
      await revokeUnexpectedRefreshToken(cfg, tokens.refresh_token, fetcher);
      throw new Error("unexpected_refresh_token");
    }
    if (tokens.token_type !== "Bearer" || !Number.isSafeInteger(tokens.expires_in) || tokens.expires_in < 1
      || tokens.expires_in > 3600 || typeof tokens.access_token !== "string" || tokens.access_token.length > 8192
      || typeof tokens.id_token !== "string" || tokens.id_token.length > 8192) throw new Error("provider_error");

    const [verifiedAccess, verifiedId] = await Promise.all([
      verifyAuth0AccessTokenWithClaims(new Request("https://worker.internal/", {
        headers: { authorization: `Bearer ${tokens.access_token}` },
      }), env, "admin", { fetcher, nowSeconds: Math.floor(now / 1000) }),
      verifyAuth0IdToken(tokens.id_token, env, { nonce: transaction.nonce, fetcher, nowSeconds: Math.floor(now / 1000) }),
    ]);
    if (verifiedAccess.actor.subject !== verifiedId.subject || verifiedAccess.actor.issuer !== verifiedId.issuer
      || verifiedAccess.actor.clientId !== cfg.clientId) throw new Error("identity_mismatch");
    const mfa = verifiedAccess.claims[cfg.mfaClaim];
    if (!mfa || typeof mfa !== "object" || Array.isArray(mfa) || mfa.method !== "otp"
      || typeof mfa.completed_at !== "string") throw new Error("mfa_missing");
    const mfaVerifiedAt = Date.parse(mfa.completed_at);
    if (!Number.isSafeInteger(mfaVerifiedAt) || mfaVerifiedAt > now + 30000 || now - mfaVerifiedAt > MFA_MAX_AGE_MS
      || mfaVerifiedAt < verifiedId.authTime * 1000 - 30000 || Math.floor(now / 1000) - verifiedId.authTime > 300) throw new Error("mfa_stale");

    const sessionToken = randomBase64Url(32);
    const sessionHash = await sha256(sessionToken);
    const createdAt = now;
    const expiresAt = now + SESSION_TTL_MS;
    await stateCall(env, `session:${sessionHash}`, "/session/create", {
      actor: verifiedAccess.actor,
      mfaVerifiedAt,
      authTime: verifiedId.authTime * 1000,
      createdAt,
      expiresAt,
    });
    return redirect(cfg.appOrigin, [
      clearState,
      setCookie(SESSION_COOKIE, sessionToken, SESSION_TTL_MS / 1000, "Strict"),
    ]);
  } catch {
    return redirect(`${cfg.appOrigin}`, [clearState, clearCookie(SESSION_COOKIE, "Strict")]);
  }
}

export async function getAdminSession(request, env, { now = Date.now() } = {}) {
  let cfg;
  try { cfg = config(env); } catch { return response(503, { error: { code: "admin_auth_unavailable" } }); }
  if (request.method !== "GET") return response(405, { error: { code: "method_not_allowed" } });
  if (!originAllowed(request, cfg.appOrigin)) return response(403, { error: { code: "origin_denied" } });
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return response(401, { error: { code: "unauthorized" } }, { "set-cookie": clearCookie(SESSION_COOKIE, "Strict") });
  }
  try {
    const hash = await sha256(token);
    const result = await stateCall(env, `session:${hash}`, "/session/validate", { now });
    return response(200, result);
  } catch {
    return response(401, { error: { code: "unauthorized" } }, { "set-cookie": clearCookie(SESSION_COOKIE, "Strict") });
  }
}

export async function logoutAdminSession(request, env) {
  let cfg;
  try { cfg = config(env); } catch { return response(503, { error: { code: "admin_auth_unavailable" } }); }
  if (request.method !== "POST") return response(405, { error: { code: "method_not_allowed" } });
  if (!originAllowed(request, cfg.appOrigin, true)) return response(403, { error: { code: "origin_denied" } });
  const token = cookieValue(request, SESSION_COOKIE);
  if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
    try {
      const hash = await sha256(token);
      await stateCall(env, `session:${hash}`, "/session/revoke", {});
    } catch {
      return response(503, { error: { code: "logout_unavailable" } });
    }
  }
  return response(200, { ok: true }, { "set-cookie": clearCookie(SESSION_COOKIE, "Strict") });
}

export const ADMIN_AUTH_POLICY = Object.freeze({
  transactionTtlMs: TX_TTL_MS,
  sessionTtlMs: SESSION_TTL_MS,
  mfaMaxAgeMs: MFA_MAX_AGE_MS,
  refreshTokens: "not-requested-not-stored",
});
