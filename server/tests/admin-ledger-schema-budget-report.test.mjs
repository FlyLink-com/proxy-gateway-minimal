import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { runSchemaBudgetProbeSupervised } from "../../scripts/lib/admin-ledger-schema-budget-probe-supervisor.mjs";
import { serializeSchemaBudgetReport, parseSchemaBudgetReport, MAX_REPORT_BYTES, METRIC_FIELDS } from "../../scripts/lib/admin-ledger-schema-budget-report.mjs";

const SECRET = "synthetic-secret-not-for-report";
const clone = value => structuredClone(value);
const hash = value => createHash("sha256").update(value).digest("hex");
const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
function success() {
  let elapsedMs = 0;
  const events = [{ kind: "worker", event: "ready", elapsedMs: 0 }, { kind: "worker", event: "imported", elapsedMs: 1 }];
  const emit = (phase, event, role = "none", step = 0, part = "operation") => {
    const record = { phase, role, step, part, event, elapsedMs: elapsedMs++ };
    if (event !== "start") record.metrics = { wallMs: 0.125, cpu: { state: "available", userUs: 17000, systemUs: 90 },
      resource: { state: "available", minorFaults: 12, majorFaults: 0, fsRead: 10, voluntaryCS: 8, involuntaryCS: 1, maxRssKiB: 99840, maxRssGrowthKiB: 1024 } };
    events.push({ kind: "probe", record });
  };
  for (const phase of ["db_open", "db_setup"]) { emit(phase, "start"); emit(phase, "end"); }
  emit("transaction", "start");
  for (const role of ["samples", "rollups", "accounts"]) for (const step of [1, 2, 3]) for (const part of ["prepare", "execute"]) {
    emit("sql", "start", role, step, part); emit("sql", "end", role, step, part);
  }
  emit("transaction", "end"); emit("db_close", "start"); emit("db_close", "end");
  events.push({ kind: "result", ok: true, category: "accepted", version: "admin-ledger-schema-budget-probe/v1" });
  return { ok: true, category: "accepted", failureCategory: null, workerClosed: true, killRequested: false, elapsedMs: 150, events };
}
function reject(action, code = "invalid_report") {
  assert.throws(action, error => error.code === code && !String(error).includes(SECRET));
}

test("complete Linux-shaped resource events round trip below 16 KiB", () => {
  const result = success(), text = serializeSchemaBudgetReport(result);
  assert(Buffer.byteLength(text) < MAX_REPORT_BYTES);
  assert.deepEqual(parseSchemaBudgetReport(text), result);
  assert.deepEqual(parseSchemaBudgetReport(Buffer.from(text)), result);
  assert.equal(JSON.parse(text).version, "admin-ledger-schema-budget-report/v1");
  assert.deepEqual(METRIC_FIELDS.cpuUs, ["userUs", "systemUs"]);
  assert.equal(METRIC_FIELDS.resources.length, 7);
});

test("recursive Python-style sorted keys preserve semantics in both directions", () => {
  const result = success();
  const text = serializeSchemaBudgetReport(sorted(result));
  assert.deepEqual(parseSchemaBudgetReport(JSON.stringify(sorted(JSON.parse(text)))), result);
});

test("unknown counters are null in wire, never invented numeric zeros", () => {
  const result = success();
  for (const event of result.events.filter(e => e.record?.metrics)) {
    event.record.metrics.cpu = { state: "unknown" }; event.record.metrics.resource = { state: "unknown" };
  }
  const wire = JSON.parse(serializeSchemaBudgetReport(result));
  assert.equal(wire.result.events[3].record.metrics.cpuUs, null);
  assert.equal(wire.result.events[3].record.metrics.resources, null);
  assert.deepEqual(parseSchemaBudgetReport(JSON.stringify(wire)), result);
});

for (const [name, mutate] of [
  ["unknown category", r => { r.category = SECRET; }],
  ["unknown failure category", r => { r.failureCategory = SECRET; }],
  ["top sensitive field", r => { r.rawPath = SECRET; }],
  ["nested sensitive field", r => { r.events[3].record.metrics.raw = SECRET; }],
  ["incomplete success", r => { r.events.pop(); }],
  ["successful prefix", r => { r.events = r.events.slice(0, 7); }],
  ["wrong event order", r => { [r.events[3], r.events[4]] = [r.events[4], r.events[3]]; }],
  ["success but worker not closed", r => { r.workerClosed = false; }],
  ["success with kill", r => { r.killRequested = true; }],
  ["success with first failure", r => { r.failureCategory = "reader_timeout"; }],
  ["cleanup unknown falsely closed", r => { r.ok = false; r.category = "cleanup_unconfirmed"; r.failureCategory = "reader_timeout"; r.killRequested = true; }],
  ["accepted category despite false", r => { r.ok = false; }],
  ["numeric boolean", r => { r.workerClosed = 1; }],
  ["negative elapsed", r => { r.elapsedMs = -1; }],
  ["undefined silently dropped", r => { r.events[3].record.metrics.raw = undefined; }],
]) test(`rejects ${name} without input disclosure`, () => { const r = success(); mutate(r); reject(() => serializeSchemaBudgetReport(r)); });

test("safe timeout prefixes and confirmed/unconfirmed cleanup retain distinct meaning", () => {
  for (const workerClosed of [true, false]) {
    const result = { ...success(), ok: false, category: workerClosed ? "reader_timeout" : "cleanup_unconfirmed",
      failureCategory: "reader_timeout", workerClosed, killRequested: true, elapsedMs: workerClosed ? 10010 : 12000 };
    result.events = result.events.slice(0, 8);
    assert.deepEqual(parseSchemaBudgetReport(serializeSchemaBudgetReport(result)), result);
  }
});

test("fixed supervisor failure variants retain their actual terminal and cleanup evidence", () => {
  const accepted = success();
  const cases = [
    { ...accepted, ok: false, category: "cancelled", workerClosed: false, events: [] },
    { ...accepted, ok: false, category: "spawn_failed", failureCategory: "spawn_failed", workerClosed: false, events: [] },
    { ...accepted, ok: false, category: "worker_exit" },
    { ...accepted, ok: false, category: "incomplete_probe", events: accepted.events.slice(0, -1) },
    { ...accepted, ok: false, category: "reader_timeout" },
    { ...accepted, ok: false, category: "diagnostic_invalid", events: accepted.events.slice(0, 4) },
    ...["cancelled", "spawn_failed", "worker_io_error", "diagnostic_invalid"].map(category => ({
      ...accepted, ok: false, category, failureCategory: category, killRequested: true, events: accepted.events.slice(0, 4)
    })),
    ...["invalid_query", "source_unavailable", "scan_limit_exceeded", "integer_overflow", "diagnostic_unavailable", "cleanup_unconfirmed", "invalid_input", "import_failed"]
      .map(category => ({ ...accepted, ok: false, category, events: [{ kind: "result", ok: false, category, version: "admin-ledger-schema-budget-probe/v1" }] }))
  ];
  for (const result of cases) assert.deepEqual(parseSchemaBudgetReport(serializeSchemaBudgetReport(result)), result);
});

test("maximum safe CPU/resource integers remain lossless under the report limit", () => {
  const result = success();
  for (const event of result.events.filter(e => e.record?.metrics)) {
    for (const counters of [event.record.metrics.cpu, event.record.metrics.resource]) {
      for (const key of Object.keys(counters)) if (key !== "state") counters[key] = Number.MAX_SAFE_INTEGER;
    }
    event.record.metrics.wallMs = 10000.123456789;
  }
  const text = serializeSchemaBudgetReport(result);
  assert(Buffer.byteLength(text) <= MAX_REPORT_BYTES);
  assert.deepEqual(parseSchemaBudgetReport(text), result);
});

test("duplicate keys including nested/escaped duplicates are refused", () => {
  const text = serializeSchemaBudgetReport(success());
  reject(() => parseSchemaBudgetReport(text.replace('"ok":true', '"ok":false,"ok":true')));
  reject(() => parseSchemaBudgetReport(text.replace('"wallMs":0.125', '"wallMs":1,"wallMs":0.125')));
  reject(() => parseSchemaBudgetReport(text.replace('"ok":true', '"\\u006fk":false,"ok":true')));
});

test("wire structure, array lengths, UTF-8 and JSON types are strict", () => {
  const wire = JSON.parse(serializeSchemaBudgetReport(success()));
  for (const mutate of [w => { w.extra = SECRET; }, w => { w.result.events[3].record.metrics.cpuUs.push(0); },
    w => { w.result.events[3].record.metrics.resources[0] = "12"; }, w => { w.result.events[3].record.metrics.raw = SECRET; },
    w => { w.result.events[3].record.metrics.cpuUs = { state: "unknown" }; }, w => { w.version = "other"; }]) {
    const changed = clone(wire); mutate(changed); reject(() => parseSchemaBudgetReport(JSON.stringify(changed)));
  }
  reject(() => parseSchemaBudgetReport(Buffer.from([0xff])));
  reject(() => parseSchemaBudgetReport("\ud800"));
  reject(() => parseSchemaBudgetReport("null"));
});

test("exact wire byte limit accepts valid padded JSON and refuses one more byte", () => {
  const text = serializeSchemaBudgetReport(success());
  const padding = " ".repeat(MAX_REPORT_BYTES - Buffer.byteLength(text));
  assert.deepEqual(parseSchemaBudgetReport(text + padding), success());
  reject(() => parseSchemaBudgetReport(text + padding + " "), "report_too_large");
});

test("plain data only: accessors and toJSON cannot rewrite invalid values into accepted values", () => {
  const getter = success(); Object.defineProperty(getter, "ok", { get() { throw new Error(SECRET); }, enumerable: true });
  reject(() => serializeSchemaBudgetReport(getter));
  const custom = success(); custom.toJSON = () => success(); reject(() => serializeSchemaBudgetReport(custom));
});

test("real worker synthetic DB round trip does not alter DB hash", async t => {
  const directory = mkdtempSync(join(tmpdir(), "schema-budget-report-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const dbPath = join(directory, "synthetic.sqlite"); createSqliteSubscriptionControlStore({ dbPath }).close();
  const before = hash(readFileSync(dbPath));
  const result = await runSchemaBudgetProbeSupervised({ dbPath, scanLimit: 100 });
  assert.equal(result.ok, true);
  assert.deepEqual(parseSchemaBudgetReport(serializeSchemaBudgetReport(result)), result);
  assert.equal(hash(readFileSync(dbPath)), before);
  assert(!serializeSchemaBudgetReport(result).includes(dbPath));
});
