import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { runAdminLedgerSchemaBudgetProbe } from "../../scripts/lib/admin-ledger-schema-budget-probe.mjs";

const COLS = {
  platform_usage_samples: ["source_ref", "channel_ref", "account_id", "observed_at", "interval_started_at", "interval_ended_at", "created_at", "upload_bytes", "download_bytes", "total_bytes"],
  platform_usage_rollups: ["account_id", "last_observed_at", "updated_at", "upload_bytes", "download_bytes", "total_bytes"],
  platform_accounts: ["id"]
};
const DB_PATH = join(tmpdir(), "synthetic-probe-never-opened.sqlite");
const norm = sql => sql.trim().replace(/\s+/g, " ");
const sha = value => createHash("sha256").update(value).digest("hex");

function fake({ failPrepare = 0, failExecute = 0, failClose = false, count = 2n, missingColumn = false } = {}) {
  const state = { trace: [], prepares: 0, executes: 0, closed: 0, transactions: 0 };
  class FakeDatabase {
    constructor(path, options) { state.path = path; state.options = options; this.open = true; this.readonly = true; }
    defaultSafeIntegers(value) { state.safeIntegers = value; }
    pragma(sql, options) { state.trace.push(["pragma", sql]); if (options?.simple) return sql === "query_only" ? 1 : 0; }
    transaction(action) { return () => { state.transactions++; return action(); }; }
    prepare(sql) {
      state.prepares++;
      const prepared = norm(sql);
      state.trace.push(["prepare", prepared]);
      if (state.prepares === failPrepare) throw new Error("SECRET SQL PATH");
      const execute = (method, args) => {
        state.executes++;
        state.trace.push([method, prepared, args]);
        if (state.executes === failExecute) throw new Error("SECRET ROW DATA");
        if (prepared.includes("sqlite_schema")) return { type: "table", sql: "create table synthetic_hidden_ddl (private_column)" };
        if (prepared.startsWith("pragma table_info")) {
          const table = /table_info\(([^)]+)\)/.exec(prepared)[1];
          return COLS[table].slice(missingColumn ? 1 : 0).map(name => ({ name }));
        }
        return { row_count: count };
      };
      return { get: (...args) => execute("get", args), all: (...args) => execute("all", args) };
    }
    close() { state.closed++; this.open = false; if (failClose) throw new Error("SECRET CLOSE"); }
  }
  return { state, DatabaseClass: FakeDatabase };
}

// Exact operation sequence of #792 (35c969eb) assertTablesAndBudget, preserved
// independently of the probe's own statement declarations. No Git dependency.
function original792BudgetTrace(db, scanLimit) {
  for (const [table, required] of Object.entries(COLS)) {
    const schema = db.prepare("select type, sql from sqlite_schema where name = ?").get(table);
    assert.equal(schema.type, "table");
    assert.match(schema.sql, /^\s*create\s+table\b/i);
    const columns = new Set(db.prepare(`pragma table_info(${table})`).all().map(c => c.name));
    assert(required.every(column => columns.has(column)));
    const { row_count: count } = db.prepare(`select count(*) as row_count from (select 1 from ${table} limit ?)`).get(scanLimit + 1);
    assert(count <= BigInt(scanLimit));
  }
}

function invoke(fixture, extra = {}) {
  const events = [];
  const result = runAdminLedgerSchemaBudgetProbe({ dbPath: DB_PATH, scanLimit: 2 },
    { DatabaseClass: fixture.DatabaseClass, onEvent: event => events.push(event), ...extra });
  return { result, events };
}

test("nine legacy SQL statements and bindings exactly match the original trace", () => {
  const actual = fake(), oracle = fake();
  const { result, events } = invoke(actual);
  original792BudgetTrace(new oracle.DatabaseClass(), 2);
  assert.deepEqual(actual.state.trace.filter(x => x[0] !== "pragma"), oracle.state.trace);
  assert.deepEqual(actual.state.options, { readonly: true, fileMustExist: true, timeout: 1000 });
  assert.equal(actual.state.transactions, 1);
  assert.equal(actual.state.safeIntegers, true);
  assert.equal(actual.state.prepares, 9);
  assert.equal(actual.state.closed, 1);
  assert.deepEqual(result, { version: "admin-ledger-schema-budget-probe/v1", ok: true, statements: 9, mode: "legacy_bounded_count", readOnly: true });
  assert.equal(events.length, 44);
  assert.equal(events.filter(e => e.phase === "sql" && e.event === "start").length, 18);
  assert.deepEqual(events.filter(e => e.phase === "sql" && e.part === "prepare" && e.event === "start").map(e => [e.role, e.step]),
    ["samples", "rollups", "accounts"].flatMap(role => [1, 2, 3].map(step => [role, step])));
});

test("metrics contain fixed numeric deltas and resource high-water values only", () => {
  let ticks = 0, cpu = 0, resource = 0;
  const { events } = invoke(fake(), { now: () => ++ticks, cpuUsage: () => ({ user: ++cpu * 5, system: cpu * 2 }),
    resourceUsage: () => ({ minorPageFault: ++resource, majorPageFault: resource, fsRead: resource,
      voluntaryContextSwitches: resource, involuntaryContextSwitches: resource, maxRSS: 500 + resource }) });
  for (const event of events) {
    assert(Object.isFrozen(event));
    assert(Number.isFinite(event.elapsedMs));
    if (event.event === "start") { assert.equal(event.metrics, undefined); continue; }
    assert.equal(event.metrics.cpu.state, "available");
    assert.equal(event.metrics.resource.state, "available");
    for (const [key, value] of Object.entries(event.metrics.cpu)) if (key !== "state") assert(value >= 0);
    for (const [key, value] of Object.entries(event.metrics.resource)) if (key !== "state") assert(value >= 0);
    assert(event.metrics.resource.maxRssKiB >= 500);
  }
  const encoded = JSON.stringify(events);
  assert(!encoded.includes("synthetic_hidden_ddl"));
  assert(!encoded.includes(DB_PATH));
  assert(!encoded.includes("source_ref"));
  assert(!encoded.includes("select "));
  assert(Buffer.byteLength(encoded) < 16384);
});

test("unavailable CPU/resource counters are explicit unknown", () => {
  const { events } = invoke(fake(), { cpuUsage: () => { throw new Error("SECRET"); }, resourceUsage: () => ({ maxRSS: NaN }) });
  for (const event of events.filter(e => e.metrics)) {
    assert.deepEqual(event.metrics.cpu, { state: "unknown" });
    assert.deepEqual(event.metrics.resource, { state: "unknown" });
  }
});

for (const part of ["prepare", "execute"]) test(`${part} failure at each of the nine statements is classified, stops and closes`, () => {
  for (let index = 1; index <= 9; index++) {
    const f = fake(part === "prepare" ? { failPrepare: index } : { failExecute: index });
    const events = [];
    assert.throws(() => invoke(f, { onEvent: e => events.push(e) }), e => e.category === "source_unavailable" && !e.message.includes("SECRET"));
    assert.equal(f.state.closed, 1);
    assert.equal(f.state.prepares, index);
    assert.equal(f.state.executes, part === "prepare" ? index - 1 : index);
    assert(events.some(e => e.phase === "sql" && e.part === part && e.event === "error" && e.category === "source_unavailable"));
    assert(!events.some(e => e.phase === "transaction" && e.event === "end"));
    assert(!JSON.stringify(events).includes("SECRET"));
    assert(events.length <= 46);
  }
});

test("observer failure aborts, does not claim complete, and still closes", () => {
  const f = fake();
  const events = [];
  assert.throws(() => invoke(f, { onEvent: e => { events.push(e); if (e.phase === "sql") throw new Error("OBSERVER SECRET"); } }),
    e => e.category === "diagnostic_unavailable");
  assert.equal(f.state.prepares, 0);
  assert.equal(f.state.closed, 1);
  assert(!events.some(e => e.phase === "transaction" && e.event === "end"));
});

test("asynchronous observers are rejected without unhandled rejection", async () => {
  const f = fake();
  assert.throws(() => invoke(f, { onEvent: () => Promise.reject(new Error("SECRET")) }), e => e.category === "diagnostic_unavailable");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.state.prepares, 0);
});

test("observer failures after opening and before closing never lose the database handle", () => {
  for (const [phase, event] of [["db_open", "end"], ["db_close", "start"], ["db_close", "end"]]) {
    const f = fake();
    assert.throws(() => invoke(f, { onEvent: e => { if (e.phase === phase && e.event === event) throw new Error("SECRET"); } }),
      e => e.category === "diagnostic_unavailable");
    assert.equal(f.state.closed, 1);
  }
});

test("counter reset and malformed counters stay unknown rather than becoming negative", () => {
  let cpu = 1000, resource = 1000;
  const { events } = invoke(fake(), { cpuUsage: () => ({ user: cpu--, system: cpu }),
    resourceUsage: () => ({ minorPageFault: resource--, majorPageFault: resource, fsRead: resource,
      voluntaryContextSwitches: resource, involuntaryContextSwitches: resource, maxRSS: resource }) });
  for (const event of events.filter(e => e.metrics)) {
    assert.deepEqual(event.metrics.cpu, { state: "unknown" });
    assert.deepEqual(event.metrics.resource, { state: "unknown" });
  }
});

test("invalid input rejected before opening any database", () => {
  for (const input of [{ dbPath: "relative" }, { dbPath: DB_PATH, scanLimit: 0 }, { dbPath: DB_PATH, scanLimit: 1000001 },
    { dbPath: DB_PATH, scanLimit: "2" }, { dbPath: DB_PATH, extra: true },
    { dbPath: "file:/private.sqlite" }, { dbPath: "C:\\file:private.sqlite" }, { dbPath: "C:\\https:private.sqlite" }]) {
    const f = fake();
    assert.throws(() => runAdminLedgerSchemaBudgetProbe(input, { DatabaseClass: f.DatabaseClass }), e => e.category === "invalid_query");
    assert.equal(f.state.path, undefined);
  }
});

test("Windows default resource counters are not presented as observed zero IO", { skip: process.platform !== "win32" }, () => {
  const { events } = invoke(fake());
  assert(events.filter(e => e.metrics).every(e => e.metrics.resource.state === "unknown"));
});

test("budget and schema error priority matches original loop", () => {
  const f = fake({ count: 3n });
  assert.throws(() => invoke(f), e => e.category === "scan_limit_exceeded");
  assert.equal(f.state.prepares, 3);
  const missing = fake({ count: 3n, missingColumn: true });
  assert.throws(() => invoke(missing), e => e.category === "source_unavailable");
  assert.equal(missing.state.prepares, 2);
  const invalidCount = fake({ count: "3" });
  assert.throws(() => invoke(invalidCount), e => e.category === "integer_overflow");
});

test("uncertain close cannot be reported successful", () => {
  const f = fake({ failClose: true });
  assert.throws(() => invoke(f), e => e.category === "cleanup_unconfirmed");
  assert.equal(f.state.closed, 1);
});

test("real SQLite cap boundary and readonly file hash", t => {
  const root = mkdtempSync(join(tmpdir(), "schema-budget-probe-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, "synthetic.sqlite"), db = new Database(path);
  for (const [table, columns] of Object.entries(COLS)) {
    db.exec(`create table ${table} (${columns.map(c => `${c} text`).join(",")})`);
    db.prepare(`insert into ${table} (${columns[0]}) values (?)`).run("synthetic-one");
    db.prepare(`insert into ${table} (${columns[0]}) values (?)`).run("synthetic-two");
  }
  db.close();
  const before = sha(readFileSync(path));
  for (const cap of [2, 3, 1000000]) assert.equal(runAdminLedgerSchemaBudgetProbe({ dbPath: path, scanLimit: cap }).ok, true);
  assert.throws(() => runAdminLedgerSchemaBudgetProbe({ dbPath: path, scanLimit: 1 }), e => e.category === "scan_limit_exceeded");
  assert.equal(sha(readFileSync(path)), before);
});
