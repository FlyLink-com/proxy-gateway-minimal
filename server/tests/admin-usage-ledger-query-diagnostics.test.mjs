import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { readAdminUsageLedger } from "../services/platform/admin-usage-ledger-query.mjs";

const CUTOFF = "2026-10-18T12:00:00.000Z";
const PRIVATE = "private-synthetic-value-must-not-be-observed";
const PHASES = ["validate_input", "db_open", "db_setup", "schema_budget",
  "validate_samples", "validate_rollups", "validate_accounts", "reconcile_samples",
  "reconcile_rollups", "reconcile_outside", "reconcile_orphan_samples",
  "reconcile_orphan_rollups", "window_accounts", "window_sources", "window_fold", "db_close"];
const completed = phases => phases.flatMap(phase => [{ phase, event: "start" }, { phase, event: "end" }]);

function fixture(t, change = () => {}) {
  const directory = mkdtempSync(join(tmpdir(), "ledger-diagnostics-synthetic-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const dbPath = join(directory, "synthetic.sqlite");
  const db = new Database(dbPath);
  try {
    db.exec(`
      create table platform_accounts (id text primary key);
      create table platform_usage_samples (account_id text, source_ref text, channel_ref text,
        observed_at text, interval_started_at text, interval_ended_at text, created_at text,
        upload_bytes, download_bytes, total_bytes);
      create table platform_usage_rollups (account_id text, last_observed_at text,
        updated_at text, upload_bytes, download_bytes, total_bytes);
    `);
    const at = "2026-10-18T11:00:00.000Z";
    db.prepare("insert into platform_accounts values (?)").run(PRIVATE);
    db.prepare("insert into platform_usage_samples values (?,?,?,?,?,?,?,?,?,?)")
      .run(PRIVATE, PRIVATE, PRIVATE, at, at, at, at, 1n, 2n, 3n);
    db.prepare("insert into platform_usage_rollups values (?,?,?,?,?,?)").run(PRIVATE, at, at, 1n, 2n, 3n);
    change(db);
  } finally { db.close(); }
  return { dbPath, directory, input: { dbPath, cutoff: CUTOFF } };
}

function assertFailure(action, code) {
  assert.throws(action, error => {
    assert.equal(error.code, code);
    assert.equal(error.message, "Admin usage ledger unavailable");
    assert.equal(Object.hasOwn(error, "cause"), false);
    return true;
  });
}

function assertFailedPhase(events, phase, closeEvent = "end") {
  const before = PHASES.slice(0, PHASES.indexOf(phase));
  assert.deepEqual(events, [...completed(before), { phase, event: "start" }, { phase, event: "error" },
    ...(phase === "db_close" ? [] : [{ phase: "db_close", event: "start" }, { phase: "db_close", event: closeEvent }])]);
  for (const event of events) assert.deepEqual(Object.keys(event).sort(), ["event", "phase"]);
  assert.equal(JSON.stringify(events).includes(PRIVATE), false);
}

test("optional observer receives only ordered non-nested fixed stage events without changing DTO or database", t => {
  const f = fixture(t);
  const hash = () => createHash("sha256").update(readFileSync(f.dbPath)).digest("hex");
  const before = hash();
  const expected = readAdminUsageLedger(f.input);
  const events = [];
  assert.deepEqual(readAdminUsageLedger(f.input, { onPhase: event => events.push(event) }), expected);
  assert.deepEqual(events, completed(PHASES));
  for (const event of events) assert.deepEqual(Object.keys(event).sort(), ["event", "phase"]);
  for (const forbidden of [PRIVATE, f.dbPath, CUTOFF, "select ", "Bytes", '"count":', "errorMessage"]) {
    assert.equal(JSON.stringify(events).includes(forbidden), false, forbidden);
  }
  assert.equal(hash(), before);
  const db = new Database(f.dbPath);
  try { db.exec("begin exclusive; rollback"); } finally { db.close(); }
});

test("observer throws at every boundary without changing query, close or returned data", t => {
  const f = fixture(t); const expected = readAdminUsageLedger(f.input); const events = [];
  const actual = readAdminUsageLedger(f.input, { onPhase: event => { events.push(event); throw new Error(PRIVATE); } });
  assert.deepEqual(actual, expected); assert.deepEqual(events, completed(PHASES));
});

test("observer rejected promise and hostile then getter are isolated", async t => {
  const f = fixture(t); const expected = readAdminUsageLedger(f.input); let calls = 0;
  const result = readAdminUsageLedger(f.input, { onPhase() { calls++; return Promise.reject(new Error(PRIVATE)); } });
  assert.deepEqual(result, expected); assert.equal(calls, PHASES.length * 2);
  assert.deepEqual(readAdminUsageLedger(f.input, { onPhase() {
    return Object.defineProperty({}, "then", { get() { throw new Error(PRIVATE); } });
  } }), expected);
  await new Promise(resolve => setImmediate(resolve));
});

test("missing, nonfunction or throwing observer options cannot change normal default behavior", t => {
  const f = fixture(t); const expected = readAdminUsageLedger(f.input);
  for (const options of [undefined, null, {}, { onPhase: null }, { onPhase: true },
    Object.defineProperty({}, "onPhase", { get() { throw new Error(PRIVATE); } })]) {
    assert.deepEqual(readAdminUsageLedger(f.input, options), expected);
  }
});

test("input and database-open failures still report the separate cleanup phase", t => {
  const f = fixture(t);
  for (const [input, phase, code] of [
    [{ ...f.input, scanLimit: 1_000_001 }, "validate_input", "invalid_query"],
    [{ ...f.input, dbPath: join(f.directory, "missing.sqlite") }, "db_open", "source_unavailable"]
  ]) {
    const events = [];
    assertFailure(() => readAdminUsageLedger(input, { onPhase: event => events.push(event) }), code);
    assertFailedPhase(events, phase);
  }
});

for (const [phase, change] of [
  ["schema_budget", db => db.exec("drop table platform_usage_rollups")],
  ["validate_samples", db => db.exec("update platform_usage_samples set upload_bytes=-1")],
  ["validate_rollups", db => db.exec("update platform_usage_rollups set total_bytes=-1")],
  ["validate_accounts", db => db.exec("update platform_accounts set id=''" )]
]) test(`data validation failure identifies ${phase} without exposing values`, t => {
  const f = fixture(t, change); const events = [];
  assertFailure(() => readAdminUsageLedger(f.input, { onPhase: event => events.push(event) }),
    phase === "schema_budget" ? "source_unavailable" : "invalid_source_data");
  assertFailedPhase(events, phase);
});

const SQL_FAILURES = [
  ["reconcile_samples", sql => /sum\(upload_bytes\)/.test(sql) && /from platform_usage_samples$/.test(sql.trim())],
  ["reconcile_rollups", sql => /sum\(upload_bytes\)/.test(sql) && /from platform_usage_rollups$/.test(sql.trim())],
  ["reconcile_outside", sql => sql.includes("as future_count")],
  ["reconcile_orphan_samples", sql => sql.includes("as orphan_count") && sql.includes("from platform_usage_samples")],
  ["reconcile_orphan_rollups", sql => sql.includes("as orphan_count") && sql.includes("from platform_usage_rollups")],
  ["window_accounts", sql => sql.startsWith("select count(distinct case")],
  ["window_sources", sql => sql.includes("group by category")]
];
for (const [phase, match] of SQL_FAILURES) test(`native query error stays redacted and attributed to ${phase}`, t => {
  const f = fixture(t); const events = []; const original = Database.prototype.prepare;
  t.mock.method(Database.prototype, "prepare", function(sql, ...args) {
    if (match(sql)) throw Object.assign(new Error(PRIVATE), { code: "SQLITE_ERROR" });
    return Reflect.apply(original, this, [sql, ...args]);
  });
  assertFailure(() => readAdminUsageLedger(f.input, { onPhase: event => events.push(event) }), "source_unavailable");
  assertFailedPhase(events, phase);
});

test("setup and fold exceptions are reported without inventing a later completed stage", t => {
  const f = fixture(t); const events = [];
  const original = Database.prototype.pragma;
  const mock = t.mock.method(Database.prototype, "pragma", function(sql, ...args) {
    if (sql === "query_only = ON") throw new Error(PRIVATE);
    return Reflect.apply(original, this, [sql, ...args]);
  });
  assertFailure(() => readAdminUsageLedger(f.input, { onPhase: event => events.push(event) }), "source_unavailable");
  assertFailedPhase(events, "db_setup"); mock.mock.restore(); events.length = 0;
  const prepare = Database.prototype.prepare;
  t.mock.method(Database.prototype, "prepare", function(sql, ...args) {
    const statement = Reflect.apply(prepare, this, [sql, ...args]);
    if (sql.includes("group by category")) return { all(...bindings) {
      const rows = statement.all(...bindings); rows[0].w0_sample_count = "invalid-private-count"; return rows;
    } };
    return statement;
  });
  assertFailure(() => readAdminUsageLedger(f.input, { onPhase: event => events.push(event) }), "integer_overflow");
  assertFailedPhase(events, "window_fold");
});

test("cleanup error is recorded and cannot erase an earlier failure event", t => {
  const f = fixture(t, db => db.exec("update platform_usage_samples set total_bytes=-1"));
  const events = []; const original = Database.prototype.close;
  t.mock.method(Database.prototype, "close", function(...args) {
    Reflect.apply(original, this, args); throw new Error(PRIVATE);
  });
  assertFailure(() => readAdminUsageLedger(f.input, { onPhase: event => events.push(event) }), "source_unavailable");
  assertFailedPhase(events, "validate_samples", "error");
});

test("cleanup failure after successful reads never publishes success", t => {
  const f = fixture(t); const events = []; const original = Database.prototype.close;
  t.mock.method(Database.prototype, "close", function(...args) {
    Reflect.apply(original, this, args); throw new Error(PRIVATE);
  });
  assertFailure(() => readAdminUsageLedger(f.input, { onPhase: event => events.push(event) }), "source_unavailable");
  assertFailedPhase(events, "db_close");
});

test("observer mode executes exactly the same SQL with the same binding values as default", t => {
  const f = fixture(t); const calls = []; const original = Database.prototype.prepare;
  t.mock.method(Database.prototype, "prepare", function(sql, ...args) {
    const statement = Reflect.apply(original, this, [sql, ...args]);
    return new Proxy(statement, { get(target, name) {
      const value = Reflect.get(target, name);
      if (name === "get" || name === "all") return (...values) => {
        calls.push({ sql, method: name, values: structuredClone(values) });
        return Reflect.apply(value, target, values);
      };
      return typeof value === "function" ? value.bind(target) : value;
    } });
  });
  const expected = readAdminUsageLedger(f.input); const defaultCalls = structuredClone(calls); calls.length = 0;
  const events = [];
  assert.deepEqual(readAdminUsageLedger(f.input, { onPhase: event => events.push(event) }), expected);
  assert.deepEqual(calls, defaultCalls); assert.deepEqual(events, completed(PHASES));
});
