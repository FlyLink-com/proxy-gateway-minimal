import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Database from "better-sqlite3";
import { createAdminUsageLedgerReader } from "../services/platform/admin-usage-ledger-reader.mjs";
import { readAdminUsageLedger } from "../services/platform/admin-usage-ledger-query.mjs";

const CUTOFF = "2026-10-16T12:00:00.000Z";
const AT = "2026-10-16T11:59:00.000Z";
const PRIVATE = "synthetic-private-diagnostics";
const WORKER = fileURLToPath(new URL("../services/platform/admin-usage-ledger-worker.mjs", import.meta.url));
const PHASES = Object.freeze([
  "worker_input", "native_import", "validate_input", "db_open", "db_setup", "schema_budget",
  "validate_samples", "validate_rollups", "validate_accounts", "reconcile_samples", "reconcile_rollups",
  "reconcile_outside", "reconcile_orphan_samples", "reconcile_orphan_rollups", "window_accounts",
  "window_sources", "window_fold", "db_close", "result_serialization", "result_write"
]);
const WORKER_FAILURES = new Set([
  "invalid_input", "import_failed", "source_unavailable", "invalid_query", "invalid_source_data",
  "integer_overflow", "scan_limit_exceeded", "output_too_large", "worker_io_error", "diagnostic_unavailable"
]);

function assertUnavailable(error) {
  assert.equal(error.code, "source_unavailable");
  assert.equal(error.message, "Admin usage ledger unavailable");
  assert.equal(JSON.stringify(error).includes(PRIVATE), false);
  return true;
}

function assertSafeRecords(records, dbPath) {
  assert.ok(records.length > 0, "explicit diagnostics emit safe records");
  const encoded = JSON.stringify(records);
  for (const forbidden of [PRIVATE, dbPath, "SELECT ", "SQLITE_", "platform_usage_samples", CUTOFF]) {
    assert.equal(encoded.includes(forbidden), false, "diagnostics contain no input values, path, SQL or native error");
  }
  for (const record of records) {
    assert.ok(Number.isFinite(record.elapsedMs) && record.elapsedMs >= 0);
    if (record.kind === "phase") {
      assert.deepEqual(Object.keys(record).sort(), ["elapsedMs", "event", "kind", "phase"]);
      assert.ok(PHASES.includes(record.phase));
      assert.ok(["start", "end", "error"].includes(record.event));
    } else if (record.kind === "worker_failure") {
      assert.deepEqual(Object.keys(record).sort(), ["category", "elapsedMs", "kind"]);
      assert.ok(WORKER_FAILURES.has(record.category));
    } else {
      assert.equal(record.kind, "reader");
      assert.deepEqual(Object.keys(record).sort(), ["category", "diagnosticState", "elapsedMs", "event", "kind", "lastPhase"]);
      assert.ok(["failure", "success", "closed"].includes(record.event));
      assert.match(record.category, /^[a-z_]+$/);
      assert.ok(record.lastPhase === "not_observed" || PHASES.includes(record.lastPhase));
      assert.ok(["complete", "partial", "invalid"].includes(record.diagnosticState));
    }
  }
}

function fixture(t, { populated = false, malformed = false, missing = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "admin-ledger-diag-integration-"));
  const dbPath = join(directory, `${PRIVATE}.sqlite`);
  const children = [];
  const readers = [];
  const calls = [];
  t.after(async () => {
    for (const reader of readers) reader.close();
    for (const { child, closed } of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      await closed;
    }
    rmSync(directory, { recursive: true, force: true });
  });
  if (malformed) writeFileSync(dbPath, `${PRIVATE}: not a SQLite database\n`);
  else if (!missing) {
    const db = new Database(dbPath);
    try {
      db.exec(`
        create table platform_accounts (id text primary key);
        create table platform_usage_samples (
          id text primary key, source_ref text, channel_ref text,
          edge_credential_ref text, account_id text, entitlement_id text, request_id text,
          observed_at text, interval_started_at text, interval_ended_at text,
          upload_bytes, download_bytes, total_bytes, sample_digest text, created_at text
        );
        create table platform_usage_rollups (
          edge_credential_ref text primary key, account_id text, entitlement_id text,
          request_id text, channel_ref text, upload_bytes, download_bytes, total_bytes,
          last_observed_at text, updated_at text
        );
      `);
      if (populated) {
        db.prepare("insert into platform_accounts values (?)").run(`${PRIVATE}-account`);
        db.prepare("insert into platform_usage_samples values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .run(`${PRIVATE}-sample`, "full_metering_xray_cumulative_v1", "channel-vultr-a-vless-reality-tcp",
            `${PRIVATE}-material`, `${PRIVATE}-account`, `${PRIVATE}-entitlement`, `${PRIVATE}-request`,
            AT, AT, AT, 4n, 38n, 42n, `${PRIVATE}-digest`, AT);
        db.prepare("insert into platform_usage_rollups values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .run(`${PRIVATE}-material`, `${PRIVATE}-account`, `${PRIVATE}-entitlement`, `${PRIVATE}-request`,
            "channel-vultr-a-vless-reality-tcp", 4n, 38n, 42n, AT, AT);
      }
    } finally { db.close(); }
  }
  const spawnFn = (...args) => {
    calls.push(args);
    const child = spawn(...args);
    const closed = new Promise((resolve) => child.once("close", resolve));
    children.push({ child, closed });
    return child;
  };
  return {
    dbPath, calls,
    reader(options = {}) {
      const reader = createAdminUsageLedgerReader({ dbPath, nowFn: () => new Date(CUTOFF), spawnFn, ...options });
      readers.push(reader);
      return reader;
    },
    async settled() { await Promise.all(children.map(({ closed }) => closed)); }
  };
}

for (const populated of [false, true]) {
  test(`real diagnostics worker preserves ${populated ? "populated" : "empty"} DTO and database bytes`, async (t) => {
    const sample = fixture(t, { populated });
    const before = readFileSync(sample.dbPath);
    const expected = readAdminUsageLedger({ dbPath: sample.dbPath, cutoff: CUTOFF });
    const records = [];
    const normal = await sample.reader().read();
    const diagnostic = await sample.reader({ onDiagnostic(record) { records.push(record); } }).read();
    await sample.settled();
    assert.deepEqual(normal, expected);
    assert.deepEqual(diagnostic, expected);
    assert.deepEqual(sample.calls[1][1], ["--max-old-space-size=128", WORKER, "--ledger-diagnostics-v1"]);
    assert.deepEqual(sample.calls[1][2].stdio, ["pipe", "pipe", "ignore", "pipe"]);
    assert.deepEqual(readFileSync(sample.dbPath), before);
    assert.equal(diagnostic.windows[0].totalBytes, populated ? "42" : "0");
    assertSafeRecords(records, sample.dbPath);
    const phases = records.filter(({ kind }) => kind === "phase");
    assert.deepEqual(phases.map(({ phase, event }) => [phase, event]),
      PHASES.flatMap((phase) => [[phase, "start"], [phase, "end"]]));
    assert.equal(records.some(({ kind }) => kind === "worker_failure"), false);
    const resultEnd = records.findIndex(({ kind, phase, event }) => kind === "phase" && phase === "result_write" && event === "end");
    const success = records.findIndex(({ kind, event }) => kind === "reader" && event === "success");
    assert.ok(success > resultEnd);
    assert.equal(records[success].lastPhase, "result_write");
    assert.equal(records[success].diagnosticState, "complete");
    const closed = records.findIndex(({ kind, event }) => kind === "reader" && event === "closed");
    assert.ok(closed > success);
  });
}

for (const malformed of [false, true]) {
  test(`real diagnostics worker safely classifies ${malformed ? "malformed" : "missing"} database`, async (t) => {
    const sample = fixture(t, { malformed, missing: !malformed });
    const before = malformed ? readFileSync(sample.dbPath) : null;
    const records = [];
    const reader = sample.reader({ onDiagnostic(record) { records.push(record); } });
    await assert.rejects(reader.read(), assertUnavailable);
    await sample.settled();
    assertSafeRecords(records, sample.dbPath);
    assert.ok(records.some(({ kind, category }) => kind === "worker_failure" && category === "source_unavailable"));
    assert.ok(records.some(({ kind, event, phase }) => kind === "phase" && event === "error"
      && (malformed ? ["db_open", "db_setup", "schema_budget"].includes(phase) : phase === "db_open")));
    const failure = records.find(({ kind, event }) => kind === "reader" && event === "failure");
    const failedPhase = records.find(({ kind, event }) => kind === "phase" && event === "error").phase;
    assert.equal(failure.category, "source_unavailable");
    assert.equal(failure.lastPhase, failedPhase, "database close cannot hide the original failing stage");
    assert.equal(failure.diagnosticState, "partial");
    assert.equal(records.some(({ kind, event }) => kind === "reader" && event === "success"), false);
    assert.equal(records.some(({ phase }) => phase === "result_write"), false);
    if (malformed) assert.deepEqual(readFileSync(sample.dbPath), before);
    else assert.equal(existsSync(sample.dbPath), false);
  });
}

for (const mode of ["throw", "reject"]) {
  test(`real diagnostics observer ${mode} cannot change a successful read`, async (t) => {
    const sample = fixture(t, { populated: true });
    const expected = readAdminUsageLedger({ dbPath: sample.dbPath, cutoff: CUTOFF });
    const records = [];
    const reader = sample.reader({ onDiagnostic(record) {
      records.push(record);
      if (mode === "throw") throw new Error(`${PRIVATE}-observer`);
      return Promise.reject(new Error(`${PRIVATE}-observer`));
    } });
    assert.deepEqual(await reader.read(), expected);
    await sample.settled();
    await new Promise((resolve) => setImmediate(resolve));
    assertSafeRecords(records, sample.dbPath);
    assert.ok(records.some(({ kind, event }) => kind === "reader" && event === "success"));
  });

  test(`real diagnostics observer ${mode} cannot change an unavailable result`, async (t) => {
    const sample = fixture(t, { missing: true });
    const records = [];
    const reader = sample.reader({ onDiagnostic(record) {
      records.push(record);
      if (mode === "throw") throw new Error(`${PRIVATE}-observer`);
      return Promise.reject(new Error(`${PRIVATE}-observer`));
    } });
    await assert.rejects(reader.read(), assertUnavailable);
    await sample.settled();
    await new Promise((resolve) => setImmediate(resolve));
    assertSafeRecords(records, sample.dbPath);
    assert.equal(existsSync(sample.dbPath), false);
    assert.ok(records.some(({ kind, event, category }) => kind === "reader" && event === "failure"
      && category === "source_unavailable"));
  });
}

test("only trusted reader construction enables diagnostics; read options leave default spawn unchanged", async (t) => {
  const sample = fixture(t, { populated: true });
  let observed = 0;
  let optionAccessed = false;
  const options = { diagnostics: true, onDiagnostic() { observed += 1; } };
  Object.defineProperty(options, "diagnosticObserver", { get() { optionAccessed = true; throw new Error(PRIVATE); } });
  const expected = readAdminUsageLedger({ dbPath: sample.dbPath, cutoff: CUTOFF });
  assert.deepEqual(await sample.reader().read(options), expected);
  await sample.settled();
  assert.equal(observed, 0);
  assert.equal(optionAccessed, false);
  assert.equal(sample.calls.length, 1);
  assert.deepEqual(sample.calls[0][1], ["--max-old-space-size=128", WORKER]);
  assert.deepEqual(sample.calls[0][2].stdio, ["pipe", "pipe", "ignore"]);
});

function invokeWorker(t, input, diagnostics) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--max-old-space-size=128", WORKER, ...(diagnostics ? ["--ledger-diagnostics-v1"] : [])], {
      shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe", "pipe"],
      env: process.platform === "win32" ? { SYSTEMROOT: process.env.SYSTEMROOT ?? process.env.SystemRoot } : {}
    });
    const output = [];
    const errors = [];
    const diagnosticOutput = [];
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("synthetic worker deadline exceeded")); }, 10000);
    t.after(() => { clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); });
    child.once("error", reject);
    child.stdin.on("error", () => {});
    child.stdout.on("data", (chunk) => output.push(chunk));
    child.stderr.on("data", (chunk) => errors.push(chunk));
    child.stdio[3].on("data", (chunk) => diagnosticOutput.push(chunk));
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve({ code, output: Buffer.concat(output).toString(), errors: Buffer.concat(errors).toString(),
        diagnostics: Buffer.concat(diagnosticOutput).toString() });
    });
    child.stdin.end(input);
  });
}

test("real worker invalid input emits only opt-in bounded categories, never input or stderr", async (t) => {
  const input = JSON.stringify({ dbPath: `${PRIVATE}-relative`, cutoff: CUTOFF, onDiagnostic: PRIVATE });
  const silent = await invokeWorker(t, input, false);
  assert.equal(silent.code, 1);
  assert.equal(silent.output, "");
  assert.equal(silent.errors, "");
  assert.equal(silent.diagnostics, "");
  const observed = await invokeWorker(t, input, true);
  assert.equal(observed.code, 1);
  assert.equal(observed.output, "");
  assert.equal(observed.errors, "");
  assert.ok(Buffer.byteLength(observed.diagnostics) <= 8192);
  assert.ok(observed.diagnostics.endsWith("\n"));
  const records = observed.diagnostics.trim().split("\n").map((line) => JSON.parse(line));
  assertSafeRecords(records, `${PRIVATE}-relative`);
  assert.ok(records.some(({ kind, category }) => kind === "worker_failure" && category === "invalid_input"));
  assert.equal(records.some(({ phase }) => phase === "db_open"), false);
});
