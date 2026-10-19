import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createSchemaBudgetProbeParser, runSchemaBudgetProbeSupervised } from "../../scripts/lib/admin-ledger-schema-budget-probe-supervisor.mjs";

const VERSION = "admin-ledger-schema-budget-probe/v1";
const PRIVATE = "synthetic-private-data-never-echo";
const WORKER = fileURLToPath(new URL("../../scripts/admin-ledger-schema-budget-probe-worker.mjs", import.meta.url));
const INPUT = { dbPath: resolve(`${PRIVATE}.sqlite`), scanLimit: 100 };
const clone = (value) => JSON.parse(JSON.stringify(value));
const line = (value) => Buffer.from(`${JSON.stringify(value)}\n`);
const stream = (records) => Buffer.concat(records.map(line));
const sha = (value) => createHash("sha256").update(value).digest("hex");
const metrics = () => ({ wallMs: 1, cpu: { state: "available", userUs: 100, systemUs: 5 },
  resource: { state: "available", minorFaults: 0, majorFaults: 0, fsRead: 0,
    voluntaryCS: 0, involuntaryCS: 0, maxRssKiB: 1024, maxRssGrowthKiB: 0 } });

function successRecords() {
  let elapsedMs = 0;
  const records = [{ kind: "worker", event: "ready", elapsedMs: 0 },
    { kind: "worker", event: "imported", elapsedMs: 1 }];
  const emit = (phase, event, role = "none", step = 0, part = "operation") => {
    const record = { phase, role, step, part, event, elapsedMs: elapsedMs++ };
    if (event !== "start") record.metrics = metrics();
    records.push({ kind: "probe", record });
  };
  for (const phase of ["db_open", "db_setup"]) { emit(phase, "start"); emit(phase, "end"); }
  emit("transaction", "start");
  for (const role of ["samples", "rollups", "accounts"]) {
    for (let step = 1; step <= 3; step += 1) {
      for (const part of ["prepare", "execute"]) { emit("sql", "start", role, step, part); emit("sql", "end", role, step, part); }
    }
  }
  emit("transaction", "end"); emit("db_close", "start"); emit("db_close", "end");
  records.push({ kind: "result", ok: true, category: "accepted", version: VERSION });
  assert.equal(records.filter((value) => value.kind === "probe").length, 44);
  return records;
}

function rejectsProtocol(bytes) {
  const parser = createSchemaBudgetProbeParser();
  assert.throws(() => { parser.push(bytes); parser.finish(); }, (error) => {
    assert.equal(error.message, "Invalid probe protocol");
    assert.equal(String(error).includes(PRIVATE), false);
    return true;
  });
  assert.equal(JSON.stringify(parser.snapshot()).includes(PRIVATE), false);
}

function fakeChild({ killMode = "normal" } = {}) {
  const child = new EventEmitter();
  child.stdin = new EventEmitter(); child.stdout = new EventEmitter();
  child.input = null; child.signals = [];
  child.stdin.end = (input) => { child.input = input; };
  child.kill = (signal) => {
    child.signals.push(signal);
    if (killMode === "throw") throw new Error(PRIVATE);
    return killMode !== "false";
  };
  return child;
}

function harness(t, options = {}, childOptions = {}) {
  const child = fakeChild(childOptions), calls = [];
  const promise = runSchemaBudgetProbeSupervised(INPUT, {
    spawnFn: (...args) => { calls.push(args); return child; }, ...options,
  });
  t.after(() => child.emit("close", null, "SIGKILL"));
  return { child, calls, promise };
}

function complete(child) {
  child.stdout.emit("data", stream(successRecords()));
  child.emit("exit", 0, null);
  child.emit("close", 0, null);
}

test("parser accepts exactly 44 core events and preserves byte-chunked safe events", () => {
  const records = successRecords(), observed = [];
  const parser = createSchemaBudgetProbeParser((record) => observed.push(record));
  for (const byte of stream(records)) parser.push(Buffer.from([byte]));
  assert.deepEqual(parser.finish(), records.at(-1));
  assert.deepEqual(parser.snapshot(), records);
  assert.deepEqual(observed, records);
  observed[0].event = PRIVATE;
  const snapshot = parser.snapshot(); snapshot[0].event = PRIVATE;
  assert.equal(parser.snapshot()[0].event, "ready");
});

test("no incomplete prefix of the 44 core events can assert success", () => {
  const records = successRecords();
  for (let length = 0; length < records.length - 1; length += 1) {
    const parser = createSchemaBudgetProbeParser();
    parser.push(stream(records.slice(0, length)));
    assert.equal(parser.finish(), null);
    assert.throws(() => parser.push(line(records.at(-1))), /Invalid probe protocol/);
  }
});

test("parser rejects any record after terminal result", () => {
  const records = successRecords();
  rejectsProtocol(stream([...records, records.at(-1)]));
});

const mutations = [
  ["unknown worker key", (r) => { r[0].raw = PRIVATE; }],
  ["unknown core key", (r) => { r[2].record.raw = PRIVATE; }],
  ["unknown nested metrics key", (r) => { r[3].record.metrics.raw = PRIVATE; }],
  ["unknown nested CPU key", (r) => { r[3].record.metrics.cpu.raw = PRIVATE; }],
  ["unknown nested resource key", (r) => { r[3].record.metrics.resource.raw = PRIVATE; }],
  ["unknown terminal key", (r) => { r.at(-1).raw = PRIVATE; }],
  ["missing required role", (r) => { delete r[2].record.role; }],
  ["metrics on start event", (r) => { r[2].record.metrics = metrics(); }],
  ["missing metrics on end event", (r) => { delete r[3].record.metrics; }],
  ["unknown SQL role", (r) => { r[7].record.role = PRIVATE; }],
  ["raw SQL in label", (r) => { r[7].record.phase = `SELECT ${PRIVATE}`; }],
  ["raw data as row payload", (r) => { r[7].record.rows = [PRIVATE]; }],
  ["wrong import order", (r) => { [r[0], r[1]] = [r[1], r[0]]; }],
  ["wrong statement order", (r) => { [r[7], r[8]] = [r[8], r[7]]; }],
  ["changed step type", (r) => { r[7].record.step = "1"; }],
  ["backwards elapsed clock", (r) => { r[3].record.elapsedMs = -1; }],
  ["worker elapsed exceeds 12 seconds", (r) => { r[0].elapsedMs = 12001; }],
  ["core elapsed exceeds 12 seconds", (r) => { r[2].record.elapsedMs = 12001; }],
  ["unsafe CPU number", (r) => { r[3].record.metrics.cpu.userUs = Number.MAX_SAFE_INTEGER + 1; }],
  ["string CPU value", (r) => { r[3].record.metrics.cpu.userUs = "100"; }],
  ["negative resource value", (r) => { r[3].record.metrics.resource.fsRead = -1; }],
  ["invalid terminal version", (r) => { r.at(-1).version = PRIVATE; }],
  ["unknown terminal category", (r) => { r.at(-1).category = PRIVATE; }],
  ["nonboolean success", (r) => { r.at(-1).ok = 1; }],
];
for (const [name, mutate] of mutations) test(`parser rejects ${name}`, () => {
  const records = clone(successRecords()); mutate(records); rejectsProtocol(stream(records));
});

test("parser rejects duplicate JSON keys instead of accepting the last raw value", () => {
  rejectsProtocol(Buffer.from('{"kind":"worker","event":"ready","elapsedMs":0,"elapsedMs":1}\n'));
});

test("parser rejects duplicate nested JSON keys", () => {
  const records = successRecords();
  const prefix = stream(records.slice(0, 3));
  const ambiguous = JSON.stringify(records[3]).replace('"wallMs":1', '"wallMs":1,"wallMs":2');
  rejectsProtocol(Buffer.concat([prefix, Buffer.from(`${ambiguous}\n`)]));
});

for (const [name, bytes] of [
  ["invalid UTF8", Buffer.from([0xff, 10])],
  ["truncated line", Buffer.from('{"kind":"worker"')],
  ["empty line", Buffer.from("\n")],
  ["line overflow", Buffer.alloc(2049, 120)],
  ["aggregate overflow", Buffer.alloc(49153, 120)],
  ["null record", Buffer.from("null\n")],
]) test(`parser rejects ${name} without retaining raw payload`, () => rejectsProtocol(bytes));

test("parser exposes a valid safe prefix after later corruption, never raw payload", () => {
  const parser = createSchemaBudgetProbeParser();
  const prefix = successRecords().slice(0, 4);
  parser.push(stream(prefix));
  assert.throws(() => parser.push(line({ raw: PRIVATE })), /Invalid probe protocol/);
  assert.deepEqual(parser.snapshot(), prefix);
  assert.throws(() => parser.finish(), /Invalid probe protocol/);
});

test("parser accepts explicit unknown CPU/resource metrics, not invented zero measurements", () => {
  const records = clone(successRecords());
  records[3].record.metrics.cpu = { state: "unknown" };
  records[3].record.metrics.resource = { state: "unknown" };
  const parser = createSchemaBudgetProbeParser(); parser.push(stream(records));
  assert.equal(parser.finish().ok, true);
  assert.deepEqual(parser.snapshot()[3].record.metrics.cpu, { state: "unknown" });
});

test("clean spawn has fixed worker/flag, no shell, no caller path in argv and no inherited environment", async (t) => {
  const envKeys = ["NODE_OPTIONS", "SYNTHETIC_PRIVATE_TOKEN"];
  const original = envKeys.map((key) => ({ key, exists: Object.hasOwn(process.env, key), value: process.env[key] }));
  t.after(() => {
    for (const { key, exists, value } of original) {
      if (exists) process.env[key] = value;
      else delete process.env[key];
    }
  });
  process.env.NODE_OPTIONS = "--synthetic-private-loader";
  process.env.SYNTHETIC_PRIVATE_TOKEN = PRIVATE;
  const { child, calls, promise } = harness(t);
  assert.equal(calls.length, 1);
  const [command, args, options] = calls[0];
  assert.equal(command, process.execPath);
  assert.deepEqual(args, ["--max-old-space-size=128", WORKER, "--schema-budget-probe-worker-v1"]);
  assert.equal(options.shell, false); assert.equal(options.windowsHide, true);
  assert.deepEqual(options.stdio, ["pipe", "pipe", "ignore"]);
  assert.ok(Object.keys(options.env).every((key) => process.platform === "win32" && key === "SYSTEMROOT"));
  assert.equal(JSON.stringify(options.env).includes(PRIVATE), false);
  assert.equal(Object.hasOwn(options.env, "NODE_OPTIONS"), false);
  assert.deepEqual(JSON.parse(child.input), INPUT);
  complete(child);
  const result = await promise;
  assert.equal(result.ok, true); assert.equal(result.category, "accepted");
  assert.equal(result.workerClosed, true); assert.equal(result.killRequested, false);
});

test("exit without close does not claim workerClosed; buffered events until close remain valid", async (t) => {
  const { child, promise } = harness(t);
  const records = successRecords();
  child.stdout.emit("data", stream(records.slice(0, 10)));
  child.emit("exit", 0, null);
  let settled = false; promise.then(() => { settled = true; });
  await Promise.resolve(); assert.equal(settled, false);
  child.stdout.emit("data", stream(records.slice(10)));
  child.emit("close", 0, null);
  const result = await promise;
  assert.equal(result.ok, true); assert.equal(result.workerClosed, true);
  assert.equal(result.events.length, 47);
});

test("default deadline kills only once at 10 seconds and waits for close", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { child, promise } = harness(t);
  t.mock.timers.tick(9999); assert.deepEqual(child.signals, []);
  t.mock.timers.tick(1); assert.deepEqual(child.signals, ["SIGKILL"]);
  child.stdout.emit("error", new Error(PRIVATE));
  child.emit("error", new Error(PRIVATE));
  assert.deepEqual(child.signals, ["SIGKILL"]);
  child.emit("exit", null, "SIGKILL");
  let settled = false; promise.then(() => { settled = true; });
  await Promise.resolve(); assert.equal(settled, false);
  child.emit("close", null, "SIGKILL");
  const result = await promise;
  assert.equal(result.category, "reader_timeout"); assert.equal(result.workerClosed, true);
  assert.equal(result.killRequested, true); assert.equal(result.ok, false);
});

for (const killMode of ["throw", "false", "normal"]) test(`no close after ${killMode} kill remains cleanup_unconfirmed`, async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { child, promise } = harness(t, { timeoutMs: 10, cleanupMs: 20 }, { killMode });
  t.mock.timers.tick(10); t.mock.timers.tick(20);
  const result = await promise;
  assert.equal(result.ok, false); assert.equal(result.category, "cleanup_unconfirmed");
  assert.equal(result.failureCategory, "reader_timeout");
  assert.equal(result.workerClosed, false); assert.equal(result.killRequested, true);
  assert.deepEqual(child.signals, ["SIGKILL"]);
  assert.equal(JSON.stringify(result).includes(PRIVATE), false);
  child.emit("close", null, "SIGKILL");
  assert.equal(result.workerClosed, false, "late close cannot rewrite an already returned unknown-cleanup result");
});

test("already aborted signal avoids spawning entirely", async () => {
  const controller = new AbortController(); controller.abort(PRIVATE);
  let calls = 0;
  const result = await runSchemaBudgetProbeSupervised(INPUT, { signal: controller.signal, spawnFn() { calls += 1; } });
  assert.equal(calls, 0); assert.equal(result.category, "cancelled");
  assert.equal(result.workerClosed, false); assert.equal(result.killRequested, false);
  assert.equal(JSON.stringify(result).includes(PRIVATE), false);
});

test("active cancellation kills once and returns cancellation only after close", async (t) => {
  const controller = new AbortController();
  const { child, promise } = harness(t, { signal: controller.signal });
  controller.abort(PRIVATE);
  assert.deepEqual(child.signals, ["SIGKILL"]);
  child.emit("close", null, "SIGKILL");
  const result = await promise;
  assert.equal(result.category, "cancelled"); assert.equal(result.workerClosed, true);
  assert.equal(JSON.stringify(result).includes(PRIVATE), false);
});

test("observer exception fails safely, keeps only validated prefix and no exception text", async (t) => {
  const { child, promise } = harness(t, { onEvent() { throw new Error(PRIVATE); } });
  child.stdout.emit("data", stream(successRecords()));
  child.emit("close", null, "SIGKILL");
  const result = await promise;
  assert.equal(result.category, "diagnostic_invalid"); assert.equal(result.ok, false);
  assert.equal(result.events.length, 1); assert.deepEqual(child.signals, ["SIGKILL"]);
  assert.equal(JSON.stringify(result).includes(PRIVATE), false);
});

test("async observer rejection fails closed without an unhandled rejection or exception disclosure", async (t) => {
  const { child, promise } = harness(t, { async onEvent() { throw new Error(PRIVATE); } });
  child.stdout.emit("data", stream(successRecords()));
  child.emit("close", null, "SIGKILL");
  const result = await promise;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(result.ok, false); assert.equal(result.category, "diagnostic_invalid");
  assert.equal(result.failureCategory, "diagnostic_invalid");
  assert.equal(result.workerClosed, true); assert.equal(result.events.length, 1);
  assert.deepEqual(child.signals, ["SIGKILL"]);
  assert.equal(JSON.stringify(result).includes(PRIVATE), false);
});

test("observer mutation cannot affect the accepted result", async (t) => {
  const { child, promise } = harness(t, { onEvent(record) { record.kind = PRIVATE; } });
  complete(child);
  const result = await promise;
  assert.equal(result.ok, true); assert.equal(JSON.stringify(result).includes(PRIVATE), false);
});

test("spawn failure never forwards exception content or attempts another spawn", async () => {
  let calls = 0;
  const result = await runSchemaBudgetProbeSupervised(INPUT, { spawnFn() { calls += 1; throw new Error(PRIVATE); } });
  assert.equal(calls, 1); assert.equal(result.category, "spawn_failed");
  assert.equal(result.workerClosed, false); assert.equal(result.killRequested, false);
  assert.equal(JSON.stringify(result).includes(PRIVATE), false);
});

for (const source of ["child", "stdin", "stdout"]) test(`${source} error triggers one kill and no raw error output`, async (t) => {
  const { child, promise } = harness(t);
  (source === "child" ? child : child[source]).emit("error", new Error(PRIVATE));
  child.emit("close", null, "SIGKILL");
  const result = await promise;
  assert.equal(result.category, "worker_io_error"); assert.equal(result.workerClosed, true);
  assert.deepEqual(child.signals, ["SIGKILL"]);
  assert.equal(JSON.stringify(result).includes(PRIVATE), false);
});

test("invalid diagnostics cause one kill, preserve safe prefix and cannot become success", async (t) => {
  const { child, promise } = harness(t);
  child.stdout.emit("data", stream(successRecords().slice(0, 4)));
  child.stdout.emit("data", line({ raw: PRIVATE }));
  child.stdout.emit("data", stream(successRecords()));
  child.emit("close", 0, null);
  const result = await promise;
  assert.equal(result.category, "diagnostic_invalid"); assert.equal(result.events.length, 4);
  assert.equal(result.ok, false); assert.deepEqual(child.signals, ["SIGKILL"]);
  assert.equal(JSON.stringify(result).includes(PRIVATE), false);
});

test("clean close with incomplete stream is not success", async (t) => {
  const { child, promise } = harness(t);
  child.stdout.emit("data", stream(successRecords().slice(0, -1)));
  child.emit("close", 0, null);
  const result = await promise;
  assert.equal(result.category, "incomplete_probe"); assert.equal(result.workerClosed, true);
  assert.equal(result.ok, false); assert.deepEqual(child.signals, []);
});

for (const [code, signal] of [[1, null], [null, "SIGTERM"]]) test(`valid success stream with bad close (${code}, ${signal}) fails`, async (t) => {
  const { child, promise } = harness(t);
  child.stdout.emit("data", stream(successRecords())); child.emit("close", code, signal);
  const result = await promise;
  assert.equal(result.category, "worker_exit"); assert.equal(result.workerClosed, true); assert.equal(result.ok, false);
});

test("invalid input and above-bound deadlines reject before spawning", async () => {
  let calls = 0;
  const options = { spawnFn() { calls += 1; } };
  for (const input of [null, {}, { ...INPUT, raw: PRIVATE }, { ...INPUT, dbPath: "relative.sqlite" },
    { ...INPUT, dbPath: "https://invalid/db" }, { ...INPUT, dbPath: "file:/tmp/db" },
    { ...INPUT, dbPath: `${INPUT.dbPath}\0` }, { ...INPUT, scanLimit: 0 }, { ...INPUT, scanLimit: 1000001 },
    { ...INPUT, scanLimit: "100" }]) {
    await assert.rejects(runSchemaBudgetProbeSupervised(input, options), /Invalid probe input/);
  }
  for (const patch of [{ timeoutMs: 0 }, { timeoutMs: 10001 }, { timeoutMs: 1.5 }, { timeoutMs: Infinity },
    { cleanupMs: 0 }, { cleanupMs: 2001 }, { cleanupMs: Infinity }, { onEvent: true }, { signal: {} }]) {
    await assert.rejects(runSchemaBudgetProbeSupervised(INPUT, { ...options, ...patch }), /Invalid probe input/);
  }
  assert.equal(calls, 0);
});

function temporaryDirectory(t) {
  const directory = mkdtempSync(join(tmpdir(), "ledger-schema-budget-supervisor-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("real worker runs nine SQL operations with exactly 44 core events and unchanged synthetic DB", async (t) => {
  const directory = temporaryDirectory(t), dbPath = join(directory, `${PRIVATE}.sqlite`);
  createSqliteSubscriptionControlStore({ dbPath }).close();
  const before = sha(readFileSync(dbPath));
  const result = await runSchemaBudgetProbeSupervised({ dbPath, scanLimit: 100 });
  assert.equal(result.ok, true, JSON.stringify({ category: result.category, events: result.events }));
  assert.equal(result.category, "accepted"); assert.equal(result.workerClosed, true); assert.equal(result.killRequested, false);
  const core = result.events.filter((event) => event.kind === "probe").map((event) => event.record);
  assert.equal(core.length, 44);
  assert.equal(core.filter((event) => event.phase === "sql" && event.part === "execute" && event.event === "end").length, 9);
  assert.equal(result.events.length, 47);
  assert.equal(core.at(-1).phase, "db_close"); assert.equal(core.at(-1).event, "end");
  assert.equal(sha(readFileSync(dbPath)), before);
  assert.equal(JSON.stringify(result).includes(PRIVATE), false);
  assert.equal(JSON.stringify(result).includes(dbPath), false);
});

test("real worker missing DB returns a safe failure without creating the file", async (t) => {
  const directory = temporaryDirectory(t), dbPath = join(directory, `${PRIVATE}-missing.sqlite`);
  assert.equal(existsSync(dbPath), false);
  const result = await runSchemaBudgetProbeSupervised({ dbPath, scanLimit: 100 });
  assert.equal(result.ok, false); assert.equal(result.category, "source_unavailable");
  assert.equal(result.workerClosed, true); assert.equal(existsSync(dbPath), false);
  assert.equal(JSON.stringify(result).includes(PRIVATE), false);
});

test("real worker preserves scan_limit_exceeded from core through terminal parsing", async (t) => {
  const directory = temporaryDirectory(t), dbPath = join(directory, `${PRIVATE}-over-cap.sqlite`);
  const store = createSqliteSubscriptionControlStore({ dbPath });
  try {
    for (const number of [1, 2]) store.createAccount({
      id: `${PRIVATE}-${number}`, ownerRef: `${PRIVATE}-owner-${number}`, status: "active",
      createdAt: "2026-10-19T00:00:00.000Z", updatedAt: "2026-10-19T00:00:00.000Z", metadata: {}
    });
  } finally { store.close(); }
  const before = sha(readFileSync(dbPath));
  const result = await runSchemaBudgetProbeSupervised({ dbPath, scanLimit: 1 });
  assert.equal(result.ok, false); assert.equal(result.category, "scan_limit_exceeded");
  assert.equal(result.workerClosed, true); assert.equal(result.killRequested, false);
  assert.deepEqual(result.events.at(-1), { kind: "result", ok: false, category: "scan_limit_exceeded", version: VERSION });
  assert.equal(sha(readFileSync(dbPath)), before);
  assert.equal(JSON.stringify(result).includes(PRIVATE), false);
});

for (const [name, bytes] of [["invalid UTF8", Buffer.from([0xff])], ["oversized stdin", Buffer.alloc(8193, 120)],
  ["unknown input field", Buffer.from(JSON.stringify({ ...INPUT, raw: PRIVATE }))]]) {
  test(`real worker rejects ${name} without raw output`, () => {
    const result = spawnSync(process.execPath, [WORKER, "--schema-budget-probe-worker-v1"],
      { input: bytes, timeout: 3000, maxBuffer: 49152, shell: false, windowsHide: true, env: {} });
    assert.equal(result.error, undefined); assert.equal(result.status, 1); assert.equal(result.stderr.length, 0);
    assert.equal(result.stdout.includes(Buffer.from(PRIVATE)), false);
    const parser = createSchemaBudgetProbeParser(); parser.push(result.stdout);
    assert.deepEqual(parser.finish(), { kind: "result", ok: false, category: "invalid_input", version: VERSION });
  });
}
