// B2-b (path A): server-side authority token verifier.
//
// Mirrors the Worker oidc-gateway pattern
// (workers/control-plane/src/oidc-gateway.mjs) using Node's built-in crypto
// (RS256 via JWK) — no new dependency. The verifier checks signature,
// issuer, audience, client, scope and time claims, and extracts the
// namespaced MFA claim issued by the Portal Post-Login Action (the Admin
// pattern, gateway contract §6).
//
// A verified Access Token proves identity only. MFA is proven only by a
// valid MFA claim ({ method: "otp", completed_at }) inside the time window
// below. A missing, malformed or stale claim means "password only" — it
// never blocks the login itself and is never treated as MFA proof. The
// caller routes totp-required operations to the existing second-factor
// challenge flow when the claim does not prove totp.
//
// No tenant is created here, no production key is fetched, and no
// caller-supplied claim is trusted: the claim is read only after the
// signature verifies. Configuration (issuer / audience / client / JWKS
// source / claim name) is injected; without it the login entry fails
// closed (see verifyAuthorityLoginAndMaybeChallenge).

import { createPublicKey, verify as verifyRsaSha256 } from "node:crypto";

const CLOCK_SKEW_SECONDS = 30;
const MFA_MAX_AGE_MS = 5 * 60 * 1000;
const MFA_AUTH_TIME_MAX_AGE_SECONDS = 300;
const ACCESS_TOKEN_MAX_LIFETIME_SECONDS = 86400;
const ID_TOKEN_MAX_LIFETIME_SECONDS = 86400;
// JWKS cache TTL, mirroring the Worker oidc-gateway CACHE_MS (300000):
// a revoked key must stop being usable once the cache expires, instead of
// staying trusted for the process lifetime.
const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;
const SCOPE_PATTERN = /^[A-Za-z0-9:_-]+(?: [A-Za-z0-9:_-]+)*$/u;

function authorityError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requiredConfigText(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw authorityError("authority_config_invalid", `${field} is required`);
  }
  return value.trim();
}

function decodeJsonPart(part, field) {
  let text;
  try {
    text = Buffer.from(part, "base64url").toString("utf8");
  } catch {
    throw authorityError("authority_token_invalid", `${field} is not valid base64url`);
  }
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw authorityError("authority_token_invalid", `${field} is not a JSON object`);
    }
    return value;
  } catch (error) {
    if (error && error.code === "authority_token_invalid") throw error;
    throw authorityError("authority_token_invalid", `${field} is not valid JSON`);
  }
}

function decodeBytesPart(part, field) {
  if (typeof part !== "string" || !part) {
    throw authorityError("authority_token_invalid", `${field} is missing`);
  }
  const bytes = Buffer.from(part, "base64url");
  if (bytes.length === 0) {
    throw authorityError("authority_token_invalid", `${field} is empty`);
  }
  return bytes;
}

export function createPortalAuthorityTokenVerifier({
  issuer,
  audience,
  clientIds,
  jwksUri = null,
  fetchJwks = null,
  mfaClaim = null,
  maxLifetimeSeconds = ACCESS_TOKEN_MAX_LIFETIME_SECONDS,
  clockSkewSeconds = CLOCK_SKEW_SECONDS,
  jwksCacheTtlMs = JWKS_CACHE_TTL_MS,
  nowFn = () => Date.now()
} = {}) {
  const verifiedIssuer = requiredConfigText(issuer, "issuer");
  const verifiedAudience = requiredConfigText(audience, "audience");
  if (!Array.isArray(clientIds) || clientIds.length === 0
    || clientIds.some((id) => typeof id !== "string" || !id.trim())) {
    throw authorityError("authority_config_invalid", "clientIds must be a non-empty string array");
  }
  const verifiedClientIds = new Set(clientIds.map((id) => id.trim()));
  if (typeof fetchJwks !== "function" && typeof jwksUri !== "string") {
    throw authorityError("authority_config_invalid", "jwksUri or fetchJwks is required");
  }
  if (mfaClaim !== null
    && (typeof mfaClaim !== "string" || !mfaClaim.startsWith("https://"))) {
    throw authorityError("authority_config_invalid", "mfaClaim must be an https:// namespaced claim");
  }
  if (!Number.isSafeInteger(maxLifetimeSeconds) || maxLifetimeSeconds <= 0
    || !Number.isSafeInteger(clockSkewSeconds) || clockSkewSeconds < 0) {
    throw authorityError("authority_config_invalid", "lifetime and clock skew must be safe integers");
  }
  if (!Number.isSafeInteger(jwksCacheTtlMs) || jwksCacheTtlMs <= 0) {
    throw authorityError("authority_config_invalid", "jwksCacheTtlMs must be a positive safe integer");
  }

  let cachedJwks = null;
  let cachedJwksExpiresAtMs = 0;

  async function loadJwks({ refresh = false } = {}) {
    // A cached JWKS is trusted only inside its TTL. Past expiry the keys
    // are refetched, so a revoked key stops verifying; a failed refetch
    // throws instead of serving the expired set (fail closed).
    if (cachedJwks && !refresh && nowFn() < cachedJwksExpiresAtMs) return cachedJwks;
    let jwks;
    try {
      if (typeof fetchJwks === "function") {
        jwks = await fetchJwks();
      } else {
        const response = await fetch(jwksUri);
        if (!response.ok) {
          throw authorityError("authority_jwks_unavailable", "identity authority keys are unavailable");
        }
        jwks = await response.json();
      }
    } catch (error) {
      if (error && error.code === "authority_jwks_unavailable") throw error;
      throw authorityError("authority_jwks_unavailable", "identity authority keys are unavailable");
    }
    if (!jwks || typeof jwks !== "object" || !Array.isArray(jwks.keys)) {
      throw authorityError("authority_jwks_unavailable", "identity authority keys are unavailable");
    }
    cachedJwks = jwks;
    cachedJwksExpiresAtMs = nowFn() + jwksCacheTtlMs;
    return jwks;
  }

  async function publicKeyFor(kid) {
    const findKey = (jwks) => jwks.keys.find(
      (key) => key && key.kid === kid && key.kty === "RSA" && key.use !== "enc"
    );
    let jwks = await loadJwks();
    let jwk = findKey(jwks);
    if (!jwk) {
      // Unknown kid: refresh once, mirroring the Worker JWKS behaviour.
      jwks = await loadJwks({ refresh: true });
      jwk = findKey(jwks);
    }
    if (!jwk) {
      throw authorityError("authority_token_invalid", "unknown signing key");
    }
    try {
      return createPublicKey({ key: jwk, format: "jwk" });
    } catch {
      throw authorityError("authority_token_invalid", "unusable signing key");
    }
  }

  function parseToken(token) {
    if (typeof token !== "string" || !token.trim()) {
      throw authorityError("authority_token_invalid", "token is required");
    }
    const parts = token.trim().split(".");
    if (parts.length !== 3) {
      throw authorityError("authority_token_invalid", "token must have three parts");
    }
    const header = decodeJsonPart(parts[0], "token header");
    const claims = decodeJsonPart(parts[1], "token claims");
    if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) {
      throw authorityError("authority_token_invalid", "token header must carry an RS256 kid");
    }
    return {
      header,
      claims,
      signingInput: `${parts[0]}.${parts[1]}`,
      signature: decodeBytesPart(parts[2], "token signature")
    };
  }

  async function verifySignature(parsed) {
    const publicKey = await publicKeyFor(parsed.header.kid);
    let ok = false;
    try {
      ok = verifyRsaSha256(
        "RSA-SHA256",
        Buffer.from(parsed.signingInput, "utf8"),
        publicKey,
        parsed.signature
      );
    } catch {
      ok = false;
    }
    if (!ok) {
      throw authorityError("authority_token_invalid", "signature verification failed");
    }
  }

  function checkTimeClaims(claims, { nowSeconds, maxLifetime }) {
    if (!Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp)) {
      throw authorityError("authority_token_invalid", "token time claims are missing");
    }
    if (claims.nbf !== undefined && !Number.isSafeInteger(claims.nbf)) {
      throw authorityError("authority_token_invalid", "token nbf is invalid");
    }
    if (claims.exp <= claims.iat || claims.exp - claims.iat > maxLifetime
      || claims.exp <= nowSeconds - clockSkewSeconds
      || claims.iat > nowSeconds + clockSkewSeconds
      || (claims.nbf !== undefined && claims.nbf > nowSeconds + clockSkewSeconds)) {
      throw authorityError("authority_token_expired", "token time claims are not valid");
    }
  }

  // Mirrors workers/control-plane/src/admin-auth.mjs:260-265 (MFA_MAX_AGE_MS
  // 5 minutes; auth_time within 300 seconds; completed_at not before
  // auth_time minus 30 seconds and not after now plus 30 seconds). A claim
  // that fails any of these is "not proven", not a login failure: the
  // caller falls back to the password-only factor set and the existing
  // second-factor challenge flow.
  function checkMfaClaim(claims, authTimeSeconds, nowMs) {
    const notProven = (reason) => ({ proven: false, verifiedAtMs: null, reason });
    if (mfaClaim === null) return notProven("mfa_claim_not_configured");
    const mfa = claims[mfaClaim];
    if (mfa === undefined) return notProven("mfa_claim_absent");
    if (!mfa || typeof mfa !== "object" || Array.isArray(mfa)
      || mfa.method !== "otp" || typeof mfa.completed_at !== "string") {
      return notProven("mfa_claim_malformed");
    }
    const verifiedAtMs = Date.parse(mfa.completed_at);
    if (!Number.isSafeInteger(verifiedAtMs)) return notProven("mfa_claim_time_invalid");
    if (verifiedAtMs > nowMs + 30000 || nowMs - verifiedAtMs > MFA_MAX_AGE_MS) {
      return notProven("mfa_claim_stale");
    }
    if (authTimeSeconds !== null && verifiedAtMs < authTimeSeconds * 1000 - 30000) {
      return notProven("mfa_claim_before_auth_time");
    }
    if (authTimeSeconds !== null
      && Math.floor(nowMs / 1000) - authTimeSeconds > MFA_AUTH_TIME_MAX_AGE_SECONDS) {
      return notProven("mfa_claim_auth_time_stale");
    }
    return { proven: true, verifiedAtMs, reason: null };
  }

  async function verifyAccessToken(token) {
    const nowMs = nowFn();
    const nowSeconds = Math.floor(nowMs / 1000);
    const parsed = parseToken(token);
    await verifySignature(parsed);
    const claims = parsed.claims;
    if (claims.iss !== verifiedIssuer) {
      throw authorityError("authority_token_issuer_mismatch", "token issuer does not match");
    }
    if (typeof claims.sub !== "string" || !claims.sub) {
      throw authorityError("authority_token_invalid", "token subject is missing");
    }
    if (!(claims.aud === verifiedAudience
      || (Array.isArray(claims.aud) && claims.aud.includes(verifiedAudience)))) {
      throw authorityError("authority_token_audience_mismatch", "token audience does not match");
    }
    if (!verifiedClientIds.has(claims.azp)) {
      throw authorityError("authority_token_client_mismatch", "token client does not match");
    }
    if (typeof claims.scope !== "string" || !claims.scope
      || !SCOPE_PATTERN.test(claims.scope)) {
      throw authorityError("authority_token_scope_invalid", "token scope is invalid");
    }
    checkTimeClaims(claims, { nowSeconds, maxLifetime: maxLifetimeSeconds });
    const authTimeSeconds = Number.isSafeInteger(claims.auth_time) ? claims.auth_time : null;
    const mfa = checkMfaClaim(claims, authTimeSeconds, nowMs);
    return Object.freeze({
      issuer: verifiedIssuer,
      subject: claims.sub,
      clientId: claims.azp,
      scopes: Object.freeze([...new Set(claims.scope.split(" "))]),
      issuedAt: claims.iat,
      expiresAt: claims.exp,
      authTimeMs: authTimeSeconds === null ? null : authTimeSeconds * 1000,
      mfaProven: mfa.proven,
      mfaVerifiedAtMs: mfa.verifiedAtMs,
      mfaReason: mfa.reason
    });
  }

  // ID Token verification for authority registration (B-A4): the email comes
  // from a signature-verified ID Token bound to this login's nonce, and must
  // be authority-verified. Mirrors oidc-gateway.mjs ID token checks.
  async function verifyIdToken(token, { expectedNonce } = {}) {
    const nowMs = nowFn();
    const nowSeconds = Math.floor(nowMs / 1000);
    if (typeof expectedNonce !== "string" || !expectedNonce.trim()) {
      throw authorityError("authority_config_invalid", "expectedNonce is required");
    }
    const parsed = parseToken(token);
    await verifySignature(parsed);
    const claims = parsed.claims;
    if (claims.iss !== verifiedIssuer) {
      throw authorityError("authority_token_issuer_mismatch", "token issuer does not match");
    }
    if (typeof claims.sub !== "string" || !claims.sub) {
      throw authorityError("authority_token_invalid", "token subject is missing");
    }
    if (!(claims.aud === [...verifiedClientIds][0]
      || (Array.isArray(claims.aud) && claims.aud.some((aud) => verifiedClientIds.has(aud))))) {
      throw authorityError("authority_token_audience_mismatch", "token audience does not match");
    }
    if (claims.azp !== undefined && !verifiedClientIds.has(claims.azp)) {
      throw authorityError("authority_token_client_mismatch", "token client does not match");
    }
    if (claims.nonce !== expectedNonce) {
      throw authorityError("authority_id_token_nonce_mismatch", "token nonce does not match");
    }
    checkTimeClaims(claims, { nowSeconds, maxLifetime: ID_TOKEN_MAX_LIFETIME_SECONDS });
    if (!Number.isSafeInteger(claims.auth_time)
      || claims.auth_time > nowSeconds + clockSkewSeconds
      || nowSeconds - claims.auth_time > MFA_AUTH_TIME_MAX_AGE_SECONDS + clockSkewSeconds) {
      throw authorityError("authority_token_invalid", "token auth_time is not valid");
    }
    if (typeof claims.email !== "string" || !claims.email.trim()) {
      throw authorityError("authority_token_invalid", "token email is missing");
    }
    if (claims.email_verified !== true) {
      throw authorityError("authority_id_token_email_unverified", "token email is not verified");
    }
    return Object.freeze({
      issuer: verifiedIssuer,
      subject: claims.sub,
      email: claims.email.trim(),
      authTimeMs: claims.auth_time * 1000,
      issuedAtMs: claims.iat * 1000,
      expiresAtMs: claims.exp * 1000
    });
  }

  return Object.freeze({ verifyAccessToken, verifyIdToken });
}
