import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { resolve } from "node:path";
import test from "node:test";
import { createLedgerDiagnosticParser } from "../services/platform/admin-usage-ledger-diagnostics.mjs";
import { createAdminUsageLedgerReader } from "../services/platform/admin-usage-ledger-reader.mjs";

const phase = (name, event, elapsedMs = 1) => ({ kind: "phase", phase: name, event, elapsedMs });
const bytes = (record) => Buffer.from(`${JSON.stringify(record)}\n`);
const unavailable = (error) => error.code === "source_unavailable"
  && error.message === "Admin usage ledger unavailable";

test("diagnostic parser retains fixed progress across arbitrary chunk boundaries", () => {
  const records = [];
  const parser = createLedgerDiagnosticParser((record) => records.push(record));
  const input = Buffer.concat([bytes(phase("worker_input", "start", 0)), bytes(phase("worker_input", "end", 2)),
    bytes(phase("native_import", "start", 2))]);
  for (const byte of input) parser.push(Buffer.from([byte]));
  parser.finish();
  assert.equal(records.length, 3);
  assert.equal(parser.lastPhase(), "native_import");
  assert.equal(parser.failureCategory(), null);
  assert.deepEqual(records[0], phase("worker_input", "start", 0));
});

test("diagnostic parser preserves failed phase when database cleanup follows", () => {
  const parser = createLedgerDiagnosticParser(() => {});
  for (const event of [phase("db_open", "start", 1), phase("db_open", "error", 2),
    phase("db_close", "start", 2), phase("db_close", "end", 3),
    { kind: "worker_failure", category: "source_unavailable", elapsedMs: 3 }]) parser.push(bytes(event));
  parser.finish();
  assert.equal(parser.lastPhase(), "db_open");
  assert.equal(parser.failureCategory(), "source_unavailable");
});

for (const [label, input] of [
  ["unknown phase", bytes(phase("synthetic-secret-path", "start"))],
  ["extra fields", bytes({ ...phase("worker_input", "start"), account: "synthetic-secret" })],
  ["non-finite clock", Buffer.from('{"kind":"phase","phase":"worker_input","event":"start","elapsedMs":1e999}\n')],
  ["negative clock", bytes(phase("worker_input", "start", -1))],
  ["unknown failure", bytes({ kind: "worker_failure", category: "synthetic-secret", elapsedMs: 1 })],
  ["malformed UTF8", Buffer.from([0xff, 10])],
  ["oversized line", Buffer.alloc(513, 32)],
  ["oversized stream", Buffer.alloc(8193, 32)],
  ["unmatched end", bytes(phase("db_open", "end"))],
]) {
  test(`diagnostic parser rejects ${label} without forwarding raw content`, () => {
    const forwarded = [];
    const parser = createLedgerDiagnosticParser((record) => forwarded.push(record));
    assert.throws(() => parser.push(input), { message: "Invalid ledger diagnostic stream" });
    assert.equal(forwarded.length, 0);
  });
}

test("diagnostic parser rejects reordered, duplicate, backward-clock and truncated progress", () => {
  for (const invalid of [phase("worker_input", "start", 2), phase("native_import", "start", 0),
    phase("db_open", "end", 2)]) {
    const parser = createLedgerDiagnosticParser(() => {});
    parser.push(bytes(phase("worker_input", "start", 0)));
    parser.push(bytes(phase("worker_input", "end", 1)));
    assert.throws(() => parser.push(bytes(invalid)));
  }
  const parser = createLedgerDiagnosticParser(() => {});
  parser.push(Buffer.from('{"kind":'));
  assert.throws(() => parser.finish());
  assert.throws(() => createLedgerDiagnosticParser(() => {}).finish({ success: true }));
});

test("a terminal marker cannot claim complete diagnostics when earlier phases are missing", () => {
  const parser = createLedgerDiagnosticParser(() => {});
  parser.push(bytes(phase("result_write", "start", 0)));
  parser.push(bytes(phase("result_write", "end", 1)));
  assert.equal(parser.state(), "partial");
  assert.throws(() => parser.finish({ success: true }));
});

function fakeReader(t, options = {}) {
  const child = new EventEmitter();
  child.stdin = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stdio = [child.stdin, child.stdout, null, new EventEmitter()];
  child.stdin.end = () => {};
  child.signals = [];
  child.kill = (signal) => { child.signals.push(signal); return true; };
  const records = [];
  const reader = createAdminUsageLedgerReader({ dbPath: resolve("synthetic-only.sqlite"),
    timeoutMs: 30, onDiagnostic: (record) => records.push(record), spawnFn: () => child, ...options });
  t.after(() => { reader.close(); child.emit("close", null, "SIGKILL"); });
  return { reader, child, records };
}

test("diagnostic reader reports the last entered SQL phase on deadline and keeps the slot until close", async (t) => {
  const { reader, child, records } = fakeReader(t);
  const pending = reader.read();
  child.stdio[3].emit("data", bytes(phase("window_sources", "start", 0)));
  await assert.rejects(pending, unavailable);
  const failure = records.find((record) => record.kind === "reader" && record.event === "failure");
  assert.equal(failure.category, "reader_timeout");
  assert.equal(failure.lastPhase, "window_sources");
  assert.deepEqual(child.signals, ["SIGKILL"]);
  await assert.rejects(reader.read(), unavailable);
  assert.equal(records.some((record) => record.event === "closed"), false);
  child.emit("close", null, "SIGKILL");
  assert.equal(records.at(-1).event, "closed");
  assert.equal(records.at(-1).category, "reader_timeout");
});

test("diagnostic reader rejects bad diagnostic bytes but never exposes them in public errors", async (t) => {
  const { reader, child, records } = fakeReader(t);
  const pending = reader.read();
  child.stdio[3].emit("data", bytes({ privatePath: "synthetic-secret" }));
  await assert.rejects(pending, unavailable);
  assert.equal(records.find((record) => record.event === "failure").category, "diagnostic_invalid");
  assert.equal(JSON.stringify(records).includes("synthetic-secret"), false);
});

test("diagnostic reader classifies explicit worker errors separately from timeout", async (t) => {
  const { reader, child, records } = fakeReader(t);
  const pending = reader.read();
  child.stdio[3].emit("data", bytes(phase("schema_budget", "start", 0)));
  child.stdio[3].emit("data", bytes(phase("schema_budget", "error", 1)));
  child.stdio[3].emit("data", bytes({ kind: "worker_failure", category: "scan_limit_exceeded", elapsedMs: 1 }));
  child.emit("exit", 1, null);
  child.emit("close", 1, null);
  await assert.rejects(pending, unavailable);
  assert.equal(records.find((record) => record.event === "failure").category, "scan_limit_exceeded");
});

test("worker diagnostics drained after exit still determine the final failure category", async (t) => {
  const { reader, child, records } = fakeReader(t, { timeoutMs: 1000 });
  const pending = reader.read();
  child.emit("exit", 1, null);
  assert.equal(records.some((record) => record.event === "failure"), false);
  child.stdio[3].emit("data", bytes(phase("native_import", "start", 0)));
  child.stdio[3].emit("data", bytes(phase("native_import", "error", 1)));
  child.stdio[3].emit("data", bytes({ kind: "worker_failure", category: "import_failed", elapsedMs: 1 }));
  child.emit("close", 1, null);
  await assert.rejects(pending, unavailable);
  assert.equal(records.find((record) => record.event === "failure").category, "import_failed");
  assert.equal(records.at(-1).lastPhase, "native_import");
});

test("diagnostic truncation on close is distinct from a known query failure", async (t) => {
  const { reader, child, records } = fakeReader(t, { timeoutMs: 1000 });
  const pending = reader.read();
  child.stdio[3].emit("data", Buffer.from('{"kind":'));
  child.emit("close", 1, null);
  await assert.rejects(pending, unavailable);
  assert.equal(records.at(-1).category, "diagnostic_invalid");
  assert.equal(records.at(-1).diagnosticState, "invalid");
});

test("diagnostic reader distinguishes abort and shutdown without leaking event errors", async (t) => {
  for (const category of ["request_aborted", "reader_closed"]) {
    const { reader, records } = fakeReader(t, { timeoutMs: 1000 });
    const controller = new AbortController();
    const pending = reader.read({ signal: controller.signal });
    if (category === "request_aborted") controller.abort(new Error("synthetic-secret"));
    else reader.close();
    await assert.rejects(pending, unavailable);
    assert.equal(records.find((record) => record.event === "failure").category, category);
    assert.equal(JSON.stringify(records).includes("synthetic-secret"), false);
  }
});
