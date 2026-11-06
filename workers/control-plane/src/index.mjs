// FlyLink control-plane Worker — G3 local vertical slice.
//
// Routes:
//   GET /healthz                 open liveness probe
//   GET /v1/accounts             protected, keyset-paginated directory
//   GET /v1/accounts/:accountId  protected, single account projection
//
// Protected routes require `Authorization: Bearer <token>` where the
// token is the CONTROL_PLANE_READ_TOKEN secret/var; when it is not
// configured the Worker fails closed (every protected request is 401).
// Responses only ever contain the safe account projection
// (id, status, createdAt, updatedAt). All errors are JSON:
//   { "error": { "code": "...", "message": "..." } }

import { isAuthorized } from "./auth.mjs";
import { InvalidCursorError, REF_PATTERN } from "./cursor.mjs";
import {
  AccountRepository,
  ACCOUNT_STATUSES,
} from "./repositories/account-repository.mjs";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
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
