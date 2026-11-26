// D1 control-plane read client (D1 HTTP API, read-only).
//
// Reads the E4 D1 database through the same endpoint the load executor
// proved (`POST /client/v4/accounts/{account}/d1/database/{db}/query`),
// but this client can only ever issue SELECT statements: any other
// statement is refused before it leaves the process, and
// `PRAGMA foreign_keys = OFF` is refused anywhere in the text.
//
// Token handling: the token is read from the environment only
// (`CLOUDFLARE_API_TOKEN`), never hard-coded, and never written to any
// log, receipt, or error message. The long-term token selection (a
// dedicated E4 read-only token vs the DevOps-Connector token) is still
// Yi's call; this module only defines the injection point
// (`createD1ReadClientFromEnv` / the `token` option). Do NOT point a
// long-lived writer token at this client without that decision.
//
// Limits reuse the load executor's constants
// (`executor/d1-load-executor-r2fix.mjs` lines 77-88): batch 100 rows,
// <=100 bind params, single statement <=100 KB, single row <=2 MB,
// 60 s call timeout, 30 s single-query budget (enforced by D1),
// result <=50 MB. Pagination is PK keyset (`WHERE pk > ? / LIMIT`);
// OFFSET is never used. Retries: whole batch at most 2 retries,
// single row at most 2 retries, 60 s apart; one batch wall-clock
// ceiling 10 minutes.
//
// This client is inert by default: it is only constructed when the
// caller supplies account/database/token (see `createD1ReadClientFromEnv`).
// No serving code path uses it until a store is explicitly given a
// client, and D1_ACTIVE is never activated from here.

const D1_API_BASE = "https://api.cloudflare.com/client/v4";

// Executor limits (d1-load-executor-r2fix.mjs:77-88), reused verbatim.
export const D1_READ_LIMITS = Object.freeze({
  batchRows: 100,
  maxParamsPerStatement: 100,
  maxStatementBytes: 100_000,
  maxRowBytes: 2_000_000,
  callTimeoutMs: 60_000,
  singleQueryTimeoutMs: 30_000,
  maxResultBytes: 50_000_000,
  batchRetryMax: 2,
  singleRowRetryMax: 2,
  retryDelayMs: 60_000,
  batchWallClockMaxMs: 600_000,
});

// Statements this read client will never send. Anything else that is
// not a leading SELECT is refused as well.
const FORBIDDEN_STATEMENT_KEYWORDS =
  /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|REPLACE|VACUUM|ATTACH|DETACH|PRAGMA)\b/i;
const PRAGMA_FOREIGN_KEYS_OFF = /PRAGMA\s+foreign_keys\s*=\s*OFF/i;

function d1ReadError(code, message) {
  const error = new Error(`D1 read client: ${message}`);
  error.code = code;
  return error;
}

export function assertSelectOnly(sql) {
  if (typeof sql !== "string" || !sql.trim()) {
    throw d1ReadError("d1_read_invalid_sql", "SQL statement is required");
  }
  if (PRAGMA_FOREIGN_KEYS_OFF.test(sql)) {
    throw d1ReadError(
      "d1_read_forbidden_statement",
      "PRAGMA foreign_keys = OFF is never sent by the D1 read client",
    );
  }
  // Strip leading comments/whitespace so `-- comment\nSELECT ...` and
  // `(SELECT ...)` wrappers cannot smuggle a non-SELECT past the check.
  const stripped = sql
    .replace(/--[^\n]*\n/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .trim()
    .replace(/^\(+/, "");
  if (!/^SELECT\b/i.test(stripped) && !/^WITH\b/i.test(stripped)) {
    throw d1ReadError(
      "d1_read_forbidden_statement",
      "D1 read client only sends SELECT statements",
    );
  }
  if (FORBIDDEN_STATEMENT_KEYWORDS.test(stripped)) {
    throw d1ReadError(
      "d1_read_forbidden_statement",
      "D1 read client refuses DDL/DML statements",
    );
  }
  return true;
}

export function assertD1ReadLimits(sql, params = []) {
  if (typeof sql !== "string") {
    throw d1ReadError("d1_read_invalid_sql", "SQL statement is required");
  }
  if (Buffer.byteLength(sql, "utf8") > D1_READ_LIMITS.maxStatementBytes) {
    throw d1ReadError(
      "d1_read_statement_too_large",
      "single SQL statement exceeds 100 KB",
    );
  }
  if (!Array.isArray(params)) {
    throw d1ReadError("d1_read_invalid_params", "params must be an array");
  }
  if (params.length > D1_READ_LIMITS.maxParamsPerStatement) {
    throw d1ReadError(
      "d1_read_too_many_params",
      "single query exceeds 100 bind params",
    );
  }
  return true;
}

function byteLengthOfRow(row) {
  return Buffer.byteLength(JSON.stringify(row ?? null), "utf8");
}

function assertResultLimits(rows) {
  let total = 0;
  for (const row of rows) {
    const size = byteLengthOfRow(row);
    if (size > D1_READ_LIMITS.maxRowBytes) {
      throw d1ReadError(
        "d1_read_row_too_large",
        "single result row exceeds 2 MB",
      );
    }
    total += size;
    if (total > D1_READ_LIMITS.maxResultBytes) {
      throw d1ReadError(
        "d1_read_result_too_large",
        "single query result exceeds 50 MB",
      );
    }
  }
  return true;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function cfErrorText(data) {
  if (!data) return "";
  const errs = Array.isArray(data.errors) ? data.errors : [];
  return errs
    .map((e) => (e && e.message ? String(e.message) : ""))
    .filter(Boolean)
    .join("; ")
    .slice(0, 500);
}

function isRetryable(error) {
  // Network failures, 5xx, and 429 are retried; 4xx (other than 429)
  // and D1 success:false payloads are permanent.
  if (error?.code === "d1_read_http_error") {
    return error.httpStatus === 429 || error.httpStatus >= 500;
  }
  return error?.code === "d1_read_network_error"
    || error?.code === "d1_read_timeout";
}

export function createD1ReadClient({
  accountId,
  databaseId,
  token,
  fetchImpl = fetch,
  sleepImpl = sleep,
  nowFn = () => Date.now(),
} = {}) {
  if (typeof accountId !== "string" || !accountId.trim()) {
    throw d1ReadError("d1_read_invalid_config", "accountId is required");
  }
  if (typeof databaseId !== "string" || !databaseId.trim()) {
    throw d1ReadError("d1_read_invalid_config", "databaseId is required");
  }
  if (typeof token !== "string" || !token.trim()) {
    throw d1ReadError("d1_read_invalid_config", "token is required");
  }
  if (typeof fetchImpl !== "function") {
    throw d1ReadError("d1_read_invalid_config", "fetchImpl is required");
  }
  const endpoint =
    `${D1_API_BASE}/accounts/${accountId}/d1/database/${databaseId}/query`;

  async function postOnce(sql, params, signal) {
    const body = params && params.length > 0 ? { sql, params } : { sql };
    let res;
    try {
      res = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          // The token value is sent only here, over HTTPS, to the D1
          // endpoint. It is never logged or copied into any error.
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: signal ?? AbortSignal.timeout(D1_READ_LIMITS.callTimeoutMs),
      });
    } catch (error) {
      if (error?.name === "TimeoutError") {
        throw d1ReadError("d1_read_timeout", "D1 query timed out after 60 s");
      }
      // Never include the token or the request body in the message.
      throw d1ReadError("d1_read_network_error", "D1 query network failure");
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.success !== true) {
      const error = d1ReadError(
        "d1_read_http_error",
        `D1 query failed http=${res.status}`,
      );
      error.httpStatus = res.status;
      error.detail = cfErrorText(data);
      throw error;
    }
    return (data.result && data.result[0] && data.result[0].results) || [];
  }

  // Single SELECT with retries (whole-query retries, at most 2, 60 s apart).
  async function query(sql, params = [], { signal } = {}) {
    assertSelectOnly(sql);
    assertD1ReadLimits(sql, params);
    // Request-path callers supply one deadline for the complete read chain.
    // Do not use the offline retry cadence within that request.
    if (signal) {
      signal.throwIfAborted();
      const rows = await postOnce(sql, params, signal);
      signal.throwIfAborted();
      assertResultLimits(rows);
      return rows;
    }
    const startedAt = nowFn();
    let attempt = 0;
    for (;;) {
      try {
        const rows = await postOnce(sql, params);
        assertResultLimits(rows);
        return rows;
      } catch (error) {
        const retryable = isRetryable(error);
        const elapsed = nowFn() - startedAt;
        if (
          !retryable
          || attempt >= D1_READ_LIMITS.batchRetryMax
          || elapsed + D1_READ_LIMITS.retryDelayMs
            > D1_READ_LIMITS.batchWallClockMaxMs
        ) {
          throw error;
        }
        attempt += 1;
        await sleepImpl(D1_READ_LIMITS.retryDelayMs);
      }
    }
  }

  async function queryOne(sql, params = [], options) {
    const rows = await query(sql, params, options);
    return rows.length > 0 ? rows[0] : null;
  }

  // PK keyset pagination: `WHERE pk > ?` + `LIMIT <pageSize>`, never
  // OFFSET. `pageQuery(cursor)` returns `{ sql, params }` for one page;
  // the SQL must end with `limit ?` and the helper appends the page
  // size as the final parameter. `keyOf` extracts the cursor key from
  // a row (or returns the row itself for composite cursors). Stops when
  // a page is short or the batch wall-clock ceiling (10 min) is hit.
  async function queryAllKeyset({
    pageQuery,
    keyOf,
    pageSize = D1_READ_LIMITS.batchRows,
  } = {}) {
    if (typeof pageQuery !== "function") {
      throw d1ReadError("d1_read_invalid_config", "pageQuery is required");
    }
    if (typeof keyOf !== "function") {
      throw d1ReadError("d1_read_invalid_config", "keyOf is required");
    }
    if (
      !Number.isSafeInteger(pageSize)
      || pageSize < 1
      || pageSize > D1_READ_LIMITS.batchRows
    ) {
      throw d1ReadError(
        "d1_read_invalid_config",
        "pageSize must be between 1 and 100",
      );
    }
    const startedAt = nowFn();
    const rows = [];
    let cursor = null;
    for (;;) {
      if (nowFn() - startedAt > D1_READ_LIMITS.batchWallClockMaxMs) {
        throw d1ReadError(
          "d1_read_batch_timeout",
          "keyset pagination exceeded the 10 minute batch wall-clock ceiling",
        );
      }
      const { sql, params = [] } = pageQuery(cursor) ?? {};
      if (typeof sql !== "string" || !sql.trim()) {
        throw d1ReadError("d1_read_invalid_sql", "pageQuery must return sql");
      }
      if (/\bOFFSET\b/i.test(sql)) {
        throw d1ReadError(
          "d1_read_forbidden_statement",
          "keyset pagination never uses OFFSET",
        );
      }
      const page = await query(sql, [...params, pageSize]);
      rows.push(...page);
      if (page.length < pageSize) break;
      cursor = keyOf(page[page.length - 1]);
      if (cursor === undefined || cursor === null) {
        throw d1ReadError(
          "d1_read_invalid_config",
          "keyOf must return the page cursor key",
        );
      }
    }
    return rows;
  }

  return Object.freeze({
    kind: "d1-read-client",
    accountId,
    databaseId,
    query,
    queryOne,
    queryAllKeyset,
  });
}

// Injection point for the serving process. Reads only environment
// variables; returns null when the D1 read path is not configured, so
// the local SQLite path stays in effect. The token is never logged.
// Env names: CLOUDFLARE_API_TOKEN (token), CLOUDFLARE_ACCOUNT_ID,
// CLOUDFLARE_D1_DATABASE_ID (preferred) or D1_DATABASE_ID.
export function createD1ReadClientFromEnv(env = process.env) {
  const token = env?.CLOUDFLARE_API_TOKEN;
  const accountId = env?.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = env?.CLOUDFLARE_D1_DATABASE_ID || env?.D1_DATABASE_ID;
  if (!token || !accountId || !databaseId) return null;
  return createD1ReadClient({ accountId, databaseId, token });
}
