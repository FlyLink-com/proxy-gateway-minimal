import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import test from "node:test";
import Database from "better-sqlite3";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { readAdminUsageLedger } from "../services/platform/admin-usage-ledger-query.mjs";
import { createAdminUsageLedgerReader } from "../services/platform/admin-usage-ledger-reader.mjs";

const CUTOFF = "2026-10-16T12:00:00.000Z";
const DB_PATH = resolve("synthetic-private-control.sqlite");
const WORKER_PATH = fileURLToPath(new URL("../services/platform/admin-usage-ledger-worker.mjs", import.meta.url));
let summary;
test.before(() => {
  const directory = mkdtempSync(join(tmpdir(), "admin-ledger-response-"));
  const dbPath = join(directory, "empty.sqlite");
  try {
    createSqliteSubscriptionControlStore({ dbPath }).close();
    summary = readAdminUsageLedger({ dbPath, cutoff: CUTOFF });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
const unavailable = (error) => {
  assert.equal(error.code, "source_unavailable");
  assert.equal(error.message, "Admin usage ledger unavailable");
  assert.equal(JSON.stringify(error).includes("synthetic-private"), false);
  return true;
};

function fakeChild({ killThrows = false, killResult = true, onEnd } = {}) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stdin = new EventEmitter();
  child.input = null;
  child.signals = [];
  child.stdin.end = (input) => {
    child.input = input;
    onEnd?.(child);
  };
  child.kill = (signal) => {
    child.signals.push(signal);
    if (killThrows) throw new Error("synthetic-private kill failure");
    return killResult;
  };
  return child;
}

function harness(t, childOptions = {}, readerOptions = {}) {
  const children = [];
  const calls = [];
  const reader = createAdminUsageLedgerReader({
    dbPath: DB_PATH, nowFn: () => new Date(CUTOFF),
    spawnFn: (...args) => {
      calls.push(args);
      const child = fakeChild(childOptions);
      children.push(child);
      return child;
    },
    ...readerOptions
  });
  t.after(() => {
    reader.close();
    for (const child of children) child.emit("close", null, "SIGKILL");
  });
  return { reader, children, calls };
}

function succeed(child, value = summary) {
  child.stdout.emit("data", Buffer.from(JSON.stringify(value)));
  child.emit("exit", 0, null);
  child.emit("close", 0, null);
}

function temporaryDirectory(t) {
  const directory = mkdtempSync(join(tmpdir(), "admin-ledger-reader-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("usage ledger reader is lazy and invalid bindings reject safely without spawning", async () => {
  for (const dbPath of [undefined, null, "", "relative.sqlite", ":memory:", "file:/tmp/control.sqlite", "https://invalid/control.sqlite", `${DB_PATH}\0`]) {
    let spawned = 0;
    const reader = createAdminUsageLedgerReader({ dbPath, spawnFn() { spawned += 1; } });
    assert.equal(spawned, 0);
    await assert.rejects(reader.read(), unavailable);
    assert.equal(spawned, 0);
    assert.equal(reader.close(), undefined);
  }
});

test("usage ledger reader holds its single-flight slot until a failed child closes", async (t) => {
  const { reader, children } = harness(t);
  const pending = reader.read();
  await assert.rejects(reader.read(), unavailable);
  children[0].emit("error", new Error("synthetic-private spawn error"));
  await assert.rejects(pending, unavailable);
  assert.deepEqual(children[0].signals, ["SIGKILL"]);
  await assert.rejects(reader.read(), unavailable);
  assert.equal(children.length, 1);
  children[0].emit("close", 1, null);
  const next = reader.read();
  assert.equal(children.length, 2);
  reader.close();
  await assert.rejects(next, unavailable);
});

test("usage ledger reader fixes command, environment, bound path and server cutoff", async (t) => {
  const { reader, children, calls } = harness(t);
  assert.equal(calls.length, 0);
  const pending = reader.read({ dbPath: "caller-path", cutoff: "caller-cutoff", sql: "caller-sql" });
  const [command, args, options] = calls[0];
  assert.equal(command, process.execPath);
  assert.deepEqual(args, ["--max-old-space-size=128", WORKER_PATH]);
  assert.equal(args.includes(DB_PATH), false);
  assert.equal(options.shell, false);
  assert.equal(options.windowsHide, true);
  assert.deepEqual(options.stdio, ["pipe", "pipe", "ignore"]);
  assert.deepEqual(Object.keys(options.env), process.platform === "win32" && (process.env.SYSTEMROOT ?? process.env.SystemRoot) ? ["SYSTEMROOT"] : []);
  assert.equal(Object.hasOwn(options.env, "NODE_OPTIONS"), false);
  assert.equal(Object.hasOwn(options.env, "PATH"), false);
  assert.deepEqual(JSON.parse(children[0].input), { dbPath: DB_PATH, cutoff: CUTOFF });
  assert.ok(Buffer.byteLength(children[0].input) <= 8192);
  let resolved = false;
  pending.then(() => { resolved = true; });
  const bytes = Buffer.from(JSON.stringify(summary));
  children[0].stdout.emit("data", bytes.subarray(0, 37));
  children[0].stdout.emit("data", bytes.subarray(37));
  children[0].emit("exit", 0, null);
  await Promise.resolve();
  assert.equal(resolved, false, "normal exit alone does not prove stdout and process cleanup");
  children[0].emit("close", 0, null);
  assert.deepEqual(await pending, summary);
  assert.equal(children[0].listenerCount("error"), 0);
  assert.equal(children[0].stdout.listenerCount("data"), 0);
  assert.equal(children[0].stdin.listenerCount("error"), 0);
  const again = reader.read();
  succeed(children[1]);
  assert.deepEqual(await again, summary);
});

test("usage ledger reader strips raw extras at every DTO level", async (t) => {
  const { reader, children } = harness(t);
  const value = structuredClone(summary);
  const sentinel = "synthetic-private-account-path-and-config";
  value.account = sentinel;
  value.windows[0].rawSource = sentinel;
  value.windows[0].sources[0].credentialRef = sentinel;
  value.reconciliation.rows = [sentinel];
  value.reconciliation.samples.account = sentinel;
  value.reconciliation.rollups.account = sentinel;
  value.reconciliation.differenceBytes.account = sentinel;
  value.coverage.config = sentinel;
  const pending = reader.read();
  succeed(children[0], value);
  assert.deepEqual(await pending, summary);
});

for (const [label, getBytes] of [
  ["invalid JSON", () => Buffer.from("{synthetic-private")],
  ["invalid UTF-8", () => Buffer.from([0xff])],
  ["empty output", () => Buffer.alloc(0)],
  ["oversized output", () => Buffer.alloc(262145, 32)],
  ["wrong cutoff", () => Buffer.from(JSON.stringify({ ...summary, cutoff: "2026-10-16T11:00:00.000Z" }))],
  ["invalid DTO", () => Buffer.from(JSON.stringify({ ...summary, windows: [] }))],
  ["error envelope", () => Buffer.from(JSON.stringify({ ...summary, error: "synthetic-private-native-error" }))]
]) {
  test(`usage ledger reader rejects ${label} with safe failure`, async (t) => {
    const { reader, children } = harness(t);
    const pending = reader.read();
    children[0].stdout.emit("data", getBytes());
    if (label === "oversized output") {
      await assert.rejects(pending, unavailable);
      assert.deepEqual(children[0].signals, ["SIGKILL"]);
      await assert.rejects(reader.read(), unavailable);
    } else {
      children[0].emit("close", 0, null);
      await assert.rejects(pending, unavailable);
    }
  });
}

test("usage ledger output byte cap applies cumulatively and accepts exactly the bound", async (t) => {
  const { reader, children } = harness(t);
  const bytes = Buffer.from(JSON.stringify(summary));
  const first = reader.read();
  children[0].stdout.emit("data", bytes);
  children[0].stdout.emit("data", Buffer.alloc(262144 - bytes.length, 32));
  children[0].emit("close", 0, null);
  assert.deepEqual(await first, summary);
  const second = reader.read();
  children[1].stdout.emit("data", Buffer.alloc(131072, 32));
  children[1].stdout.emit("data", Buffer.alloc(131073, 32));
  await assert.rejects(second, unavailable);
  assert.deepEqual(children[1].signals, ["SIGKILL"]);
});

for (const event of ["child error", "stdin error", "stdout error", "nonzero exit", "signalled exit"]) {
  test(`usage ledger reader handles ${event} and retains error listeners while reaping`, async (t) => {
    const { reader, children } = harness(t);
    const pending = reader.read();
    const child = children[0];
    if (event === "child error") child.emit("error", new Error("synthetic-private"));
    if (event === "stdin error") child.stdin.emit("error", new Error("synthetic-private"));
    if (event === "stdout error") child.stdout.emit("error", new Error("synthetic-private"));
    if (event === "nonzero exit") child.emit("exit", 1, null);
    if (event === "signalled exit") child.emit("exit", null, "SIGTERM");
    await assert.rejects(pending, unavailable);
    assert.deepEqual(child.signals, ["SIGKILL"]);
    assert.doesNotThrow(() => child.emit("error", new Error("late synthetic-private")));
    assert.doesNotThrow(() => child.stdin.emit("error", new Error("late stdin")));
    assert.doesNotThrow(() => child.stdout.emit("error", new Error("late stdout")));
    await assert.rejects(reader.read(), unavailable);
    assert.equal(children.length, 1);
    child.emit("close", 1, null);
    assert.equal(child.listenerCount("error"), 0);
  });
}

test("usage ledger reader rejects nonzero close even after valid output", async (t) => {
  const { reader, children } = harness(t);
  const pending = reader.read();
  children[0].stdout.emit("data", Buffer.from(JSON.stringify(summary)));
  children[0].emit("close", 1, null);
  await assert.rejects(pending, unavailable);
});

test("usage ledger reader recovers its slot after synchronous spawn failure", async () => {
  let attempts = 0;
  const reader = createAdminUsageLedgerReader({ dbPath: DB_PATH, spawnFn() {
    attempts += 1;
    throw new Error("synthetic-private spawn failure");
  } });
  await assert.rejects(reader.read(), unavailable);
  await assert.rejects(reader.read(), unavailable);
  assert.equal(attempts, 2);
  reader.close();
});

test("usage ledger reader catches a synchronous stdin write failure", async (t) => {
  const { reader, children } = harness(t, { onEnd() { throw new Error("synthetic-private write failure"); } });
  await assert.rejects(reader.read(), unavailable);
  assert.deepEqual(children[0].signals, ["SIGKILL"]);
  await assert.rejects(reader.read(), unavailable);
});

for (const killMode of ["works", "throws", "returns false"]) {
  test(`usage ledger deadline is hard and stays busy when kill ${killMode}`, async (t) => {
    const { reader, children } = harness(t, { killThrows: killMode === "throws", killResult: killMode !== "returns false" }, { timeoutMs: 15 });
    const pending = reader.read();
    await assert.rejects(pending, unavailable);
    assert.deepEqual(children[0].signals, ["SIGKILL"]);
    await assert.rejects(reader.read(), unavailable);
    assert.equal(children.length, 1);
    children[0].emit("close", null, "SIGKILL");
    const again = reader.read();
    succeed(children[1]);
    assert.deepEqual(await again, summary);
  });
}

test("usage ledger deadline includes startup and waiting for child close", async (t) => {
  const { reader, children } = harness(t, {}, { timeoutMs: 15 });
  const pending = reader.read();
  children[0].stdout.emit("data", Buffer.from(JSON.stringify(summary)));
  children[0].emit("exit", 0, null);
  await assert.rejects(pending, unavailable);
  assert.deepEqual(children[0].signals, ["SIGKILL"]);
  await assert.rejects(reader.read(), unavailable);
});

test("usage ledger deadline also covers response parsing and validation", async (t) => {
  const { reader, children } = harness(t, {}, { timeoutMs: 10 });
  let elapsed = 0;
  t.mock.method(performance, "now", () => elapsed);
  const originalParse = JSON.parse;
  t.mock.method(JSON, "parse", (...args) => {
    elapsed = 11;
    return originalParse(...args);
  });
  const pending = reader.read();
  succeed(children[0]);
  await assert.rejects(pending, unavailable);
});

test("usage ledger close during synchronous startup still terminates the returned child", async (t) => {
  const child = fakeChild();
  let reader;
  reader = createAdminUsageLedgerReader({ dbPath: DB_PATH, spawnFn() {
    reader.close();
    return child;
  } });
  t.after(() => child.emit("close", null, "SIGKILL"));
  await assert.rejects(reader.read(), unavailable);
  assert.deepEqual(child.signals, ["SIGKILL"]);
  assert.equal(child.input, null);
});

test("usage ledger already-aborted read creates no child", async (t) => {
  const { reader, children } = harness(t);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(reader.read({ signal: controller.signal }), unavailable);
  assert.equal(children.length, 0);
});

test("usage ledger abort terminates active read, waits for reap and removes abort listener", async (t) => {
  const { reader, children } = harness(t);
  const controller = new AbortController();
  const pending = reader.read({ signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, unavailable);
  assert.deepEqual(children[0].signals, ["SIGKILL"]);
  await assert.rejects(reader.read(), unavailable);
  children[0].emit("close", null, "SIGKILL");
  const again = reader.read();
  succeed(children[1]);
  assert.deepEqual(await again, summary);
});

test("usage ledger reader close synchronously disables future reads and kills once", async (t) => {
  const { reader, children } = harness(t);
  const pending = reader.read();
  assert.equal(reader.close(), undefined);
  assert.deepEqual(children[0].signals, ["SIGKILL"]);
  assert.equal(reader.close(), undefined);
  await assert.rejects(pending, unavailable);
  children[0].emit("close", null, "SIGKILL");
  await assert.rejects(reader.read(), unavailable);
  assert.equal(children.length, 1);
  assert.deepEqual(children[0].signals, ["SIGKILL"]);
});

test("usage ledger invalid clock, oversized input or deadline cannot spawn", async () => {
  for (const options of [
    { nowFn: () => "2026-10-16T12:00:00.000Z" },
    { nowFn: () => new Date(NaN) },
    { nowFn() { throw new Error("synthetic-private clock"); } },
    { dbPath: resolve("a".repeat(8192)) },
    { timeoutMs: 0 }, { timeoutMs: 10001 }, { timeoutMs: Infinity }, { timeoutMs: 1.5 }
  ]) {
    let calls = 0;
    const reader = createAdminUsageLedgerReader({ dbPath: DB_PATH, spawnFn() { calls += 1; }, ...options });
    await assert.rejects(reader.read(), unavailable);
    assert.equal(calls, 0);
    reader.close();
  }
});

test("real worker reads application SQLite aggregates without changing DB content or leaking raw rows", async (t) => {
  const dbPath = join(temporaryDirectory(t), "control.sqlite");
  const store = createSqliteSubscriptionControlStore({ dbPath });
  const at = "2026-10-16T11:59:00.000Z";
  store.createAccount({ id: "synthetic-private-account", ownerRef: "synthetic-private-owner", status: "active", createdAt: at, updatedAt: at });
  store.createEntitlement({ id: "synthetic-private-entitlement", accountId: "synthetic-private-account", plan: "monthly", status: "active", validFrom: at, validUntil: "2026-11-01T00:00:00.000Z", createdAt: at, updatedAt: at });
  store.createIssuanceRequest({ id: "synthetic-private-request", accountId: "synthetic-private-account", entitlementId: "synthetic-private-entitlement", approvalRef: "synthetic-private-approval", status: "issued", quantity: 1, nodeId: "synthetic-private-node", purpose: "access", requestedByRef: "synthetic-private-operator", createdAt: at, updatedAt: at });
  store.recordUsageSample({ id: "synthetic-private-sample", accountId: "synthetic-private-account", entitlementId: "synthetic-private-entitlement", requestId: "synthetic-private-request", edgeCredentialRef: "synthetic-private-material", sourceRef: "full_metering_xray_cumulative_v1", channelRef: "channel-vultr-a-vless-reality-tcp", observedAt: at, intervalStartedAt: at, intervalEndedAt: at, uploadBytes: 4, downloadBytes: 38, sampleDigest: "sha256:synthetic-private-sample", createdAt: at });
  store.close();
  const before = readFileSync(dbPath);
  const reader = createAdminUsageLedgerReader({ dbPath, nowFn: () => new Date(CUTOFF) });
  t.after(() => reader.close());
  let ticks = 0;
  const interval = setInterval(() => { ticks += 1; }, 1);
  let result;
  try { result = await reader.read(); } finally { clearInterval(interval); }
  assert.ok(ticks > 0, "the parent event loop remains responsive during the child read");
  assert.equal(result.cutoff, CUTOFF);
  assert.equal(result.windows[0].totalBytes, "42");
  assert.equal(result.reconciliation.state, "totals_match");
  assert.equal(JSON.stringify(result).includes("synthetic-private"), false);
  assert.equal(JSON.stringify(result).includes(dbPath), false);
  assert.deepEqual(readFileSync(dbPath), before);
  const realtimeReader = createAdminUsageLedgerReader({ dbPath });
  t.after(() => realtimeReader.close());
  const earliest = Date.now();
  const realtime = await realtimeReader.read();
  assert.ok(Date.parse(realtime.cutoff) >= earliest && Date.parse(realtime.cutoff) <= Date.now());
});

test("real worker cannot create missing databases or initialize missing schemas", async (t) => {
  const directory = temporaryDirectory(t);
  const missing = join(directory, "missing.sqlite");
  const absentReader = createAdminUsageLedgerReader({ dbPath: missing });
  t.after(() => absentReader.close());
  await assert.rejects(absentReader.read(), unavailable);
  assert.equal(existsSync(missing), false);
  const empty = join(directory, "empty.sqlite");
  new Database(empty).close();
  const before = readFileSync(empty);
  const emptyReader = createAdminUsageLedgerReader({ dbPath: empty });
  t.after(() => emptyReader.close());
  await assert.rejects(emptyReader.read(), unavailable);
  assert.deepEqual(readFileSync(empty), before);
  const db = new Database(empty, { readonly: true, fileMustExist: true });
  try { assert.deepEqual(db.prepare("select name from sqlite_schema").all(), []); } finally { db.close(); }
});

function invokeWorker(t, input) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, ["--max-old-space-size=128", WORKER_PATH], {
      shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
      env: process.platform === "win32" ? { SYSTEMROOT: process.env.SYSTEMROOT ?? process.env.SystemRoot } : {}
    });
    const output = [];
    const errors = [];
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("synthetic worker deadline exceeded")); }, 10000);
    t.after(() => { clearTimeout(timer); if (child.exitCode === null) child.kill("SIGKILL"); });
    child.once("error", reject);
    child.stdin.on("error", () => {});
    child.stdout.on("data", (chunk) => output.push(chunk));
    child.stderr.on("data", (chunk) => errors.push(chunk));
    child.once("close", (code) => {
      clearTimeout(timer);
      resolveResult({ code, output: Buffer.concat(output).toString(), errors: Buffer.concat(errors).toString() });
    });
    child.stdin.end(input);
  });
}

for (const [label, input] of [
  ["extra input fields", JSON.stringify({ dbPath: DB_PATH, cutoff: CUTOFF, scanLimit: 1 })],
  ["missing input fields", JSON.stringify({ dbPath: DB_PATH })],
  ["noncanonical cutoff", JSON.stringify({ dbPath: DB_PATH, cutoff: "2026-10-16T12:00:00Z" })],
  ["relative path", JSON.stringify({ dbPath: "relative.sqlite", cutoff: CUTOFF })],
  ["URI path", JSON.stringify({ dbPath: "file:/tmp/synthetic.sqlite", cutoff: CUTOFF })],
  ["malformed JSON", "{synthetic-private"],
  ["malformed UTF-8", Buffer.from([0xff])],
  ["oversized input", Buffer.alloc(8193, 32)]
]) {
  test(`real worker fails safely for ${label}`, async (t) => {
    const result = await invokeWorker(t, input);
    assert.equal(result.code, 1);
    assert.equal(result.output, "");
    assert.equal(result.errors, "");
  });
}
