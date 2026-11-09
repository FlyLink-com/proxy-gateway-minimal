// FlyLink control-plane Worker — G3 local vertical slice.
//
// Routes:
//   GET  /healthz                 open liveness probe
//   GET  /v1/accounts             protected, keyset-paginated directory
//   GET  /v1/accounts/:accountId  protected, single account projection
//   POST /v1/accounts/:accountId/second-factor-challenges
//                                 protected bounded write: issue one
//                                 second-factor challenge under a
//                                 required Idempotency-Key header
//
// Read routes require `Authorization: Bearer <token>` with the
// CONTROL_PLANE_READ_TOKEN secret/var; the write route requires the
// separate CONTROL_PLANE_WRITE_TOKEN. When the relevant token is not
// configured the Worker fails closed (every such request is 401).
// Responses only ever contain safe projections: reads return
// (id, status, createdAt, updatedAt); the write returns the challenge
// projection (id, accountId, status, allowedFactors, expiresAt,
// createdAt) and never the challenge hash or the one-time secret.
// All errors are JSON: { "error": { "code": "...", "message": "..." } }

import { isAuthorized, isWriteAuthorized } from "./auth.mjs";
import { InvalidCursorError, REF_PATTERN } from "./cursor.mjs";
import { randomBase64Url, sha256Hex } from "./digests.mjs";
import {
  AccountRepository,
  ACCOUNT_STATUSES,
} from "./repositories/account-repository.mjs";
import {
  ChallengeRepository,
  CHALLENGE_TTL_MS,
} from "./repositories/challenge-repository.mjs";
import { handleAgentDesiredState, handleAgentReceipt } from "./agent-protocol.mjs";
import { handleAuth0IdentityProof } from "./oidc-gateway.mjs";\nimport { AdminAuthState } from "./admin-auth-state.mjs";\nimport { startAdminLogin, completeAdminLogin, getAdminSession, logoutAdminSession } from "./admin-auth.mjs";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_BODY_BYTES = 4096;
const IDEMPOTENCY_KEY_PATTERN = /^[!-~]{16,128}$/;
const ALLOWED_FACTORS = new Set(["totp", "webauthn", "sms", "email"]);

function jsonResponse(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extraHeaders },
  });
}

function jsonError(status, code, message) {
  return jsonResponse(status, { error: { code, message } });
}

function parseLimit(raw) {
  if (raw === null || raw === undefined) return DEFAULT_LIMIT;
  if (typeof raw === "string" && /^[1-9]\d{0,2}$/.test(raw)) {
    const parsed = Number(raw);
    if (Number.isSafeInteger(parsed) && parsed <= MAX_LIMIT) return parsed;
  }
  throw new InvalidCursorError("limit is invalid");
}

async function handleListAccounts(request, env) {
  const url = new URL(request.url);
  const allowed = new Set(["status", "cursor", "limit"]);
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key)) {
      return jsonError(400, "invalid_query", `unknown query parameter: ${key}`);
    }
  }
  const status = url.searchParams.get("status");
  if (status !== null && !ACCOUNT_STATUSES.has(status)) {
    return jsonError(400, "invalid_query", "status is invalid");
  }
  let limit;
  try {
    limit = parseLimit(url.searchParams.get("limit"));
  } catch {
    return jsonError(400, "invalid_query", "limit is invalid");
  }
  const repository = new AccountRepository(env.CONTROL_DB);
  try {
    const { items, nextCursor } = await repository.listDirectory({
      status,
      cursor: url.searchParams.get("cursor"),
      limit,
    });
    return jsonResponse(200, { items, nextCursor });
  } catch (error) {
    if (error instanceof InvalidCursorError) {
      return jsonError(400, "invalid_query", "cursor is invalid");
    }
    throw error;
  }
}

async function handleGetAccount(accountId, env) {
  if (!REF_PATTERN.test(accountId)) {
    return jsonError(400, "invalid_query", "accountId is invalid");
  }
  const repository = new AccountRepository(env.CONTROL_DB);
  const account = await repository.findById(accountId);
  if (!account) {
    return jsonError(404, "account_not_found", "account not found");
  }
  return jsonResponse(200, { account });
}

function replayOrConflict(record, fingerprint) {
  if (record.request_fingerprint !== fingerprint) {
    return jsonError(
      409,
      "idempotency_key_conflict",
      "Idempotency-Key was already used with a different request",
    );
  }
  return new Response(record.response_body_json, {
    status: record.response_status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "idempotency-replayed": "true",
    },
  });
}

// Bounded write: issue exactly one second-factor challenge for the
// account. The Idempotency-Key header is required; the challenge row
// and the idempotency record are written in one atomic D1 batch, so a
// retry with the same key and the same request returns the original
// response instead of creating a second challenge, and a retry with
// the same key but a different request is a 409 conflict.
async function handleCreateChallenge(accountId, request, env) {
  if (!REF_PATTERN.test(accountId)) {
    return jsonError(400, "invalid_query", "accountId is invalid");
  }
  const idempotencyKey = request.headers.get("idempotency-key");
  if (typeof idempotencyKey !== "string" || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    return jsonError(
      400,
      "invalid_idempotency_key",
      "Idempotency-Key header is required (16-128 visible ASCII characters)",
    );
  }
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return jsonError(400, "invalid_body", "request body is too large");
  }
  let parsed;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return jsonError(400, "invalid_body", "request body must be a JSON object");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return jsonError(400, "invalid_body", "request body must be a JSON object");
  }
  const bodyKeys = Object.keys(parsed);
  if (bodyKeys.length !== 1 || bodyKeys[0] !== "allowedFactors") {
    return jsonError(400, "invalid_body", "request body must contain exactly: allowedFactors");
  }
  const factors = parsed.allowedFactors;
  if (
    !Array.isArray(factors)
    || factors.length < 1
    || factors.length > ALLOWED_FACTORS.size
    || factors.some((factor) => typeof factor !== "string" || !ALLOWED_FACTORS.has(factor))
    || new Set(factors).size !== factors.length
  ) {
    return jsonError(
      400,
      "invalid_body",
      "allowedFactors must be a non-empty array of unique values from: email, sms, totp, webauthn",
    );
  }
  // Canonical form: sorted, so semantically identical requests always
  // produce the same fingerprint and the same stored factor list.
  const canonicalFactors = [...factors].sort();
  const scope = `POST:/v1/accounts/${accountId}/second-factor-challenges`;
  const fingerprint = await sha256Hex(
    `${scope}\n${JSON.stringify({ allowedFactors: canonicalFactors })}`,
  );

  const challenges = new ChallengeRepository(env.CONTROL_DB);
  const existing = await challenges.findIdempotencyRecord(scope, idempotencyKey);
  if (existing) {
    return replayOrConflict(existing, fingerprint);
  }

  const accounts = new AccountRepository(env.CONTROL_DB);
  const account = await accounts.findById(accountId);
  if (!account) {
    return jsonError(404, "account_not_found", "account not found");
  }

  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS).toISOString();
  const challengeId = crypto.randomUUID();
  const secret = randomBase64Url(32);
  const challengeHash = await sha256Hex(secret);
  const body = {
    challenge: {
      id: challengeId,
      accountId,
      status: "active",
      allowedFactors: canonicalFactors,
      expiresAt,
      createdAt,
    },
  };
  try {
    await challenges.issueChallengeAtomically({
      challenge: {
        id: challengeId,
        accountId,
        challengeHash,
        allowedFactorsJson: JSON.stringify(canonicalFactors),
        expiresAt,
        createdAt,
      },
      idempotency: {
        scope,
        key: idempotencyKey,
        fingerprint,
        responseStatus: 201,
        responseBodyJson: JSON.stringify(body),
        createdAt,
      },
    });
  } catch {
    // A concurrent duplicate may have committed between the pre-check
    // and the batch; if so, answer from its record instead of failing.
    const committed = await challenges.findIdempotencyRecord(scope, idempotencyKey);
    if (committed) {
      return replayOrConflict(committed, fingerprint);
    }
    throw new Error("challenge issuance failed");
  }
  return jsonResponse(201, body);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    try {
      if (pathname === "/healthz") {
        if (request.method !== "GET") {
          return jsonError(405, "method_not_allowed", "method not allowed");
        }
        return jsonResponse(200, { ok: true, service: "flylink-control-plane" });
      }
      // C1 proof-only: Auth0 Access Tokens are never interchangeable with G3/G4 service tokens.
      // These routes perform no D1 reads/writes and grant no domain authorization.
      if (pathname === "/v1/auth/portal/identity" || pathname === "/v1/auth/admin/identity") {
        const surface = pathname === "/v1/auth/admin/identity" ? "admin" : "portal";
        return await handleAuth0IdentityProof(request, env, surface);
      }
      if (pathname === "/v1/agent/desired-state") {
        if (request.method !== "GET") {
          return jsonError(405, "method_not_allowed", "method not allowed");
        }
        return await handleAgentDesiredState(request, env);
      }
      if (pathname === "/v1/agent/receipts") {
        if (request.method !== "POST") {
          return jsonError(405, "method_not_allowed", "method not allowed");
        }
        return await handleAgentReceipt(request, env);
      }
      const challengeMatch = /^\/v1\/accounts\/([^/]+)\/second-factor-challenges$/.exec(pathname);
      if (challengeMatch) {
        if (request.method !== "POST") {
          return jsonError(405, "method_not_allowed", "method not allowed");
        }
        if (!(await isWriteAuthorized(request, env))) {
          return jsonError(401, "unauthorized", "a valid bearer token is required");
        }
        if (!env || !env.CONTROL_DB) {
          return jsonError(503, "source_unavailable", "control database binding is not configured");
        }
        return await handleCreateChallenge(decodeURIComponent(challengeMatch[1]), request, env);
      }
      const accountMatch = /^\/v1\/accounts\/([^/]+)$/.exec(pathname);
      if (pathname === "/v1/accounts" || accountMatch) {
        if (request.method !== "GET") {
          return jsonError(405, "method_not_allowed", "method not allowed");
        }
        if (!(await isAuthorized(request, env))) {
          return jsonError(401, "unauthorized", "a valid bearer token is required");
        }
        if (!env || !env.CONTROL_DB) {
          return jsonError(503, "source_unavailable", "control database binding is not configured");
        }
        return accountMatch
          ? await handleGetAccount(decodeURIComponent(accountMatch[1]), env)
          : await handleListAccounts(request, env);
      }
      return jsonError(404, "not_found", "route not found");
    } catch {
      return jsonError(500, "internal_error", "internal error");
    }
  },
};
