// D1 read client unit tests: SELECT-only guard, executor limits,
// keyset pagination (no OFFSET), and retry behaviour. All HTTP is
// mocked; no real Cloudflare call is made and no token value is used.
import assert from "node:assert/strict";
import test from "node:test";

import {
  D1_READ_LIMITS,
  assertD1ReadLimits,
  assertSelectOnly,
  createD1ReadClient,
  createD1ReadClientFromEnv,
} from "../services/platform/d1-read-client.mjs";

const CONFIG = {
  accountId: "acct_test",
  databaseId: "db_test",
  token: "test-token-never-logged",
};

function mockFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return handler(calls.length, url, init);
  };
  return { fetchImpl, calls };
}

function okResponse(rows) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ success: true, result: [{ results: rows }] }),
  };
}

function errorResponse(status, message = "boom") {
  return {
    ok: false,
    status,
    json: async () => ({ success: false, errors: [{ message }] }),
  };
}

test("d1-read-client: SELECT-only guard refuses writes and PRAGMA", () => {
  assert.equal(assertSelectOnly("select * from t where id = ?"), true);
  assert.equal(
    assertSelectOnly("  -- leading comment\n  WITH x AS (select 1) select * from x"),
    true,
  );
  for (const sql of [
    "INSERT INTO t VALUES (1)",
    "insert into t values (1)",
    "UPDATE t SET a = 1",
    "DELETE FROM t",
    "DROP TABLE t",
    "CREATE TABLE t (id integer)",
    "ALTER TABLE t ADD COLUMN x text",
    "TRUNCATE TABLE t",
    "PRAGMA foreign_keys = OFF",
    "select * from t; PRAGMA foreign_keys = OFF",
    "select * from t where x in (select 1) -- DROP TABLE t",
    "",
    "   ",
  ]) {
    assert.throws(
      () => assertSelectOnly(sql),
      (error) => error.code === "d1_read_forbidden_statement"
        || error.code === "d1_read_invalid_sql",
      sql,
    );
  }
  // A nested SELECT mentioning a forbidden word only inside a string
  // literal is not a DML statement; the keyword scan is intentionally
  // conservative and refuses it rather than guessing.
  assert.throws(
    () => assertSelectOnly("select 'delete' as word"),
    (error) => error.code === "d1_read_forbidden_statement",
  );
});

test("d1-read-client: executor limits are enforced", () => {
  assert.deepEqual(D1_READ_LIMITS, {
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
  assert.throws(
    () => assertD1ReadLimits(`select '${"x".repeat(100_001)}'`),
    (error) => error.code === "d1_read_statement_too_large",
  );
  assert.throws(
    () => assertD1ReadLimits("select 1", new Array(101).fill(1)),
    (error) => error.code === "d1_read_too_many_params",
  );
  assert.equal(assertD1ReadLimits("select 1", new Array(100).fill(1)), true);
});

test("d1-read-client: query posts to the D1 endpoint with bearer auth", async () => {
  const { fetchImpl, calls } = mockFetch(() => okResponse([{ id: 1 }]));
  const client = createD1ReadClient({ ...CONFIG, fetchImpl });
  const rows = await client.query("select * from t where id = ?", [1]);
  assert.deepEqual(rows, [{ id: 1 }]);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    "https://api.cloudflare.com/client/v4/accounts/acct_test/d1/database/db_test/query",
  );
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers["Content-Type"], "application/json");
  assert.equal(
    calls[0].init.headers.Authorization,
    "Bearer test-token-never-logged",
  );
  assert.equal(JSON.parse(calls[0].init.body).sql, "select * from t where id = ?");
  assert.deepEqual(JSON.parse(calls[0].init.body).params, [1]);
  const one = await client.queryOne("select * from t where id = ?", [1]);
  assert.deepEqual(one, { id: 1 });
});

test("d1-read-client: queryOne returns null on empty results", async () => {
  const { fetchImpl } = mockFetch(() => okResponse([]));
  const client = createD1ReadClient({ ...CONFIG, fetchImpl });
  assert.equal(await client.queryOne("select * from t"), null);
});

test("d1-read-client: 4xx is permanent, 5xx/429 retry at most twice then stop", async () => {
  let sleeps = 0;
  const sleepImpl = async () => { sleeps += 1; };
  const { fetchImpl, calls } = mockFetch(() => errorResponse(500));
  const client = createD1ReadClient({
    ...CONFIG, fetchImpl, sleepImpl, nowFn: () => 0,
  });
  await assert.rejects(
    () => client.query("select 1"),
    (error) => error.code === "d1_read_http_error",
  );
  assert.equal(calls.length, 3); // initial + 2 retries
  assert.equal(sleeps, 2);

  const bad = mockFetch(() => errorResponse(400));
  const client2 = createD1ReadClient({
    ...CONFIG, fetchImpl: bad.fetchImpl, sleepImpl,
  });
  await assert.rejects(
    () => client2.query("select 1"),
    (error) => error.code === "d1_read_http_error",
  );
  assert.equal(bad.calls.length, 1); // no retry on 400
});

test("d1-read-client: keyset pagination pages on PK cursor, never OFFSET", async () => {
  const pages = [[{ id: 1 }, { id: 2 }], [{ id: 3 }]];
  let call = 0;
  const { fetchImpl, calls } = mockFetch(() => okResponse(pages[call++]));
  const client = createD1ReadClient({ ...CONFIG, fetchImpl });
  const rows = await client.queryAllKeyset({
    pageQuery: (cursor) => cursor == null
      ? { sql: "select id from t order by id asc limit ?", params: [] }
      : { sql: "select id from t where id > ? order by id asc limit ?", params: [cursor] },
    keyOf: (row) => row.id,
    pageSize: 2,
  });
  assert.deepEqual(rows, [{ id: 1 }, { id: 2 }, { id: 3 }]);
  assert.equal(calls.length, 2);
  assert.deepEqual(JSON.parse(calls[0].init.body).params, [2]);
  assert.deepEqual(JSON.parse(calls[1].init.body).params, [2, 2]);
  await assert.rejects(
    () => client.queryAllKeyset({
      pageQuery: () => ({ sql: "select id from t order by id limit ? offset ?", params: [] }),
      keyOf: (row) => row.id,
    }),
    (error) => error.code === "d1_read_forbidden_statement",
  );
  await assert.rejects(
    () => client.queryAllKeyset({
      pageQuery: () => ({ sql: "select id from t order by id asc limit ?", params: [] }),
      keyOf: (row) => row.id,
      pageSize: 101,
    }),
    (error) => error.code === "d1_read_invalid_config",
  );
});

test("d1-read-client: oversized row and result are refused", async () => {
  const big = "x".repeat(D1_READ_LIMITS.maxRowBytes + 1);
  const { fetchImpl } = mockFetch(() => okResponse([{ blob: big }]));
  const client = createD1ReadClient({ ...CONFIG, fetchImpl });
  await assert.rejects(
    () => client.query("select blob from t"),
    (error) => error.code === "d1_read_row_too_large",
  );
});

test("d1-read-client: fromEnv returns null unless fully configured", () => {
  assert.equal(createD1ReadClientFromEnv({}), null);
  assert.equal(
    createD1ReadClientFromEnv({
      CLOUDFLARE_API_TOKEN: "t",
      CLOUDFLARE_ACCOUNT_ID: "a",
    }),
    null,
  );
  const client = createD1ReadClientFromEnv({
    CLOUDFLARE_API_TOKEN: "t",
    CLOUDFLARE_ACCOUNT_ID: "a",
    CLOUDFLARE_D1_DATABASE_ID: "d",
  });
  assert.equal(client.kind, "d1-read-client");
  assert.equal(
    createD1ReadClientFromEnv({
      CLOUDFLARE_API_TOKEN: "t",
      CLOUDFLARE_ACCOUNT_ID: "a",
      D1_DATABASE_ID: "d2",
    }).databaseId,
    "d2",
  );
  assert.throws(
    () => createD1ReadClient({ accountId: "a", databaseId: "d" }),
    (error) => error.code === "d1_read_invalid_config",
  );
});
