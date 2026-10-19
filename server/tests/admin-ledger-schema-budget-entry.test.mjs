import assert from "node:assert/strict";
import test from "node:test";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, linkSync, lstatSync, mkdtempSync, openSync, readFileSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { runSchemaBudgetProbeEntry, parseSchemaBudgetEntryInput, parseSchemaBudgetEntryResult } from "../../scripts/admin-ledger-schema-budget-entry.mjs";

const VERSION = "admin-ledger-schema-budget-entry/v1";
const PRIVATE = "synthetic-path-never-returned";
const ENTRY = fileURLToPath(new URL("../../scripts/admin-ledger-schema-budget-entry.mjs", import.meta.url));
const identity = path => Object.fromEntries(["dev", "ino", "uid", "gid", "mode", "nlink"].map(key => [key, String(lstatSync(path, { bigint: true })[key])]));
const hash = path => createHash("sha256").update(readFileSync(path)).digest("hex");
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "ledger-entry-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const dbPath = join(dir, `${PRIVATE}.sqlite`);
  createSqliteSubscriptionControlStore({ dbPath }).close();
  return { dir, dbPath, input: { version: VERSION, dbPath, scanLimit: 100, expectedIdentity: identity(dbPath) } };
}
const pending = () => ({ ok: false, category: "reader_timeout", failureCategory: "reader_timeout", workerClosed: true, killRequested: true, elapsedMs: 10001, events: [] });

test("entry runs the real worker once, returns only safe report and verifies stable DB identity", async t => {
  const f = fixture(t), before = hash(f.dbPath), events = [];
  const result = await runSchemaBudgetProbeEntry(f.input, { onEvent: event => { events.push(event); } });
  assert.equal(result.ok, true); assert.equal(result.category, "accepted");
  assert.equal(result.fileIdentity, "stable"); assert.equal(result.descriptorClosed, true);
  assert.equal(result.probe.result.events.length, 47); assert.equal(events.length, 47);
  if (process.platform === "linux") {
    for (const event of events.filter(value => value.record?.metrics)) {
      assert.equal(event.record.metrics.cpu.state, "available");
      assert.equal(event.record.metrics.resource.state, "available");
    }
  }
  assert.deepEqual(parseSchemaBudgetEntryResult(JSON.stringify(result)), result);
  assert.equal(JSON.stringify(result).includes(PRIVATE), false); assert.equal(hash(f.dbPath), before);
});

test("input parser rejects duplicate keys, unknown fields, URI, missing binding, oversized and invalid UTF8", t => {
  const { input } = fixture(t);
  const variants = [JSON.stringify({ ...input, secret: PRIVATE }), JSON.stringify({ ...input, dbPath: "file:/tmp/test" }),
    JSON.stringify({ ...input, expectedIdentity: {} }), JSON.stringify({ ...input, scanLimit: 1000001 }),
    JSON.stringify(input).replace('"scanLimit":100', '"scanLimit":100,"scanLimit":100'), Buffer.from([0xff]), " ".repeat(8193)];
  for (const value of variants) assert.throws(() => parseSchemaBudgetEntryInput(value), error => error.message === "Invalid probe entry input");
  assert.deepEqual(parseSchemaBudgetEntryInput(JSON.stringify(input)), input);
});

test("incorrect or absent file identity prevents worker start and never creates a missing DB", async t => {
  const f = fixture(t); let calls = 0;
  const options = { onEvent() {}, runProbe: async () => { calls += 1; return pending(); } };
  const wrong = structuredClone(f.input); wrong.expectedIdentity.ino = String(BigInt(wrong.expectedIdentity.ino) + 1n);
  assert.equal((await runSchemaBudgetProbeEntry(wrong, options)).category, "file_identity_unavailable");
  const absent = { ...f.input, dbPath: join(f.dir, "absent.sqlite") };
  assert.equal((await runSchemaBudgetProbeEntry(absent, options)).category, "file_identity_unavailable");
  assert.equal(existsSync(absent.dbPath), false); assert.equal(calls, 0);
});

test("post-query replacement is rejected, with query result and cleanup retained", async t => {
  const f = fixture(t);
  const result = await runSchemaBudgetProbeEntry(f.input, { onEvent() {}, runProbe: async () => {
    renameSync(f.dbPath, join(f.dir, "retained.sqlite")); writeFileSync(f.dbPath, "synthetic replacement"); return pending();
  } });
  assert.equal(result.category, "file_identity_changed"); assert.equal(result.fileIdentity, "mismatch");
  assert.equal(result.ok, false); assert.equal(result.descriptorClosed, true);
  assert.equal(result.probe.result.category, "reader_timeout");
});

test("normal size and mtime growth do not invalidate stable file identity", async t => {
  const f = fixture(t);
  const result = await runSchemaBudgetProbeEntry(f.input, { onEvent() {}, runProbe: async () => {
    writeFileSync(f.dbPath, "synthetic mutation retaining file identity"); return pending();
  } });
  assert.equal(result.fileIdentity, "stable"); assert.equal(result.category, "reader_timeout");
});

test("worker exception and hostile report are redacted and still checked/closed", async t => {
  const f = fixture(t);
  for (const runProbe of [async () => { throw new Error(PRIVATE); }, async () => ({ ...pending(), secret: PRIVATE })]) {
    const result = await runSchemaBudgetProbeEntry(f.input, { onEvent() {}, runProbe });
    assert.equal(result.category, "entry_failed"); assert.equal(result.descriptorClosed, true);
    assert.equal(result.fileIdentity, "stable"); assert.equal(result.probe, null);
    assert.equal(JSON.stringify(result).includes(PRIVATE), false);
  }
});

test("result parser rejects success/identity contradictions and reorders object keys safely", async t => {
  const f = fixture(t), result = await runSchemaBudgetProbeEntry(f.input, { onEvent() {} });
  for (const changed of [{ ...result, fileIdentity: "mismatch" }, { ...result, descriptorClosed: false }, { ...result, probe: null }, { ...result, secret: PRIVATE }]) {
    assert.throws(() => parseSchemaBudgetEntryResult(JSON.stringify(changed)));
  }
  const sort = value => Array.isArray(value) ? value.map(sort) : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => [key, sort(val)])) : value;
  assert.deepEqual(parseSchemaBudgetEntryResult(JSON.stringify(sort(result))), result);
});

test("CLI requires explicit private flag and progress pipe before reading database", t => {
  const f = fixture(t);
  for (const args of [[], ["--schema-budget-entry-v1"]]) {
    const child = spawnSync(process.execPath, [ENTRY, ...args], { input: JSON.stringify(f.input), encoding: "utf8", timeout: 15000, windowsHide: true });
    assert.equal(child.status, 1); assert.equal(child.stderr, "");
    assert.equal(JSON.parse(child.stdout).category, "invalid_invocation");
    assert.equal(child.stdout.includes(PRIVATE), false);
  }
});

test("CLI produces bounded final report plus independent validated progress pipe", t => {
  const f = fixture(t);
  const child = spawnSync(process.execPath, [ENTRY, "--schema-budget-entry-v1"], {
    input: JSON.stringify(f.input), encoding: "utf8", timeout: 15000, windowsHide: true, stdio: ["pipe", "pipe", "pipe", "pipe"]
  });
  assert.equal(child.status, 0, child.stderr || child.stdout); assert.equal(child.stderr, "");
  assert.equal(parseSchemaBudgetEntryResult(child.stdout).ok, true);
  assert.ok(Buffer.byteLength(child.stdout) <= 16384);
  assert.equal(child.output[3].trim().split("\n").length, 47);
  assert.equal(child.output.join("").includes(PRIVATE), false);
});

test("CLI refuses a regular-file progress destination without writing to it", t => {
  const f = fixture(t), target = join(f.dir, "must-stay-empty.txt"), fd = openSync(target, "wx");
  try {
    const child = spawnSync(process.execPath, [ENTRY, "--schema-budget-entry-v1"], {
      input: JSON.stringify(f.input), encoding: "utf8", timeout: 15000, windowsHide: true, stdio: ["pipe", "pipe", "pipe", fd]
    });
    assert.equal(child.status, 1); assert.equal(JSON.parse(child.stdout).category, "invalid_invocation");
    assert.equal(readFileSync(target).length, 0);
  } finally { closeSync(fd); }
});

test("hard-linked DB is rejected even if the supplied identity otherwise matches", async t => {
  const f = fixture(t); linkSync(f.dbPath, join(f.dir, "alias.sqlite"));
  let called = false;
  const result = await runSchemaBudgetProbeEntry(f.input, { onEvent() {}, runProbe() { called = true; } });
  assert.equal(result.category, "file_identity_unavailable"); assert.equal(called, false);
});

test("Linux rejects final and parent symlinks before spawning", { skip: process.platform === "win32" }, async t => {
  const f = fixture(t), alias = join(f.dir, "alias.sqlite"), parent = join(f.dir, "parent");
  symlinkSync(f.dbPath, alias); symlinkSync(f.dir, parent);
  for (const dbPath of [alias, join(parent, `${PRIVATE}.sqlite`)]) {
    let called = false;
    const result = await runSchemaBudgetProbeEntry({ ...f.input, dbPath }, { onEvent() {}, runProbe() { called = true; } });
    assert.equal(result.category, "file_identity_unavailable"); assert.equal(called, false);
  }
});

test("post-query missing path cannot be accepted as stable", async t => {
  const f = fixture(t);
  const result = await runSchemaBudgetProbeEntry(f.input, { onEvent() {}, runProbe: async () => { unlinkSync(f.dbPath); return pending(); } });
  assert.equal(result.category, "file_identity_changed"); assert.equal(result.descriptorClosed, true);
});

test("pre-cancelled entry preserves no-worker result and does not claim completed query", async t => {
  const f = fixture(t), controller = new AbortController(); controller.abort();
  const result = await runSchemaBudgetProbeEntry(f.input, { onEvent() {}, signal: controller.signal });
  assert.equal(result.ok, false); assert.equal(result.category, "cancelled");
  assert.equal(result.probe.result.workerClosed, false); assert.equal(result.probe.result.killRequested, false);
  assert.equal(result.probe.result.events.length, 0); assert.equal(result.descriptorClosed, true);
  assert.deepEqual(parseSchemaBudgetEntryResult(JSON.stringify(result)), result);
});

test("CLI rejects duplicate/oversized input with no progress and no private input returned", t => {
  const f = fixture(t);
  for (const input of [JSON.stringify(f.input).replace('"scanLimit":100', '"scanLimit":100,"scanLimit":100'), PRIVATE.repeat(500)]) {
    const child = spawnSync(process.execPath, [ENTRY, "--schema-budget-entry-v1"], {
      input, encoding: "utf8", timeout: 15000, windowsHide: true, stdio: ["pipe", "pipe", "pipe", "pipe"]
    });
    assert.equal(child.status, 1); assert.equal(parseSchemaBudgetEntryResult(child.stdout).category, "invalid_input");
    assert.equal(child.stderr, ""); assert.equal(child.output[3], ""); assert.equal(child.stdout.includes(PRIVATE), false);
  }
});

test("CLI stdin wait is bounded without opening the worker", async t => {
  const child = spawn(process.execPath, [ENTRY, "--schema-budget-entry-v1"], { windowsHide: true, stdio: ["pipe", "pipe", "pipe", "pipe"] });
  let stdout = "", stderr = "", progress = "";
  child.stdout.on("data", chunk => { stdout += chunk; }); child.stderr.on("data", chunk => { stderr += chunk; });
  child.stdio[3].on("data", chunk => { progress += chunk; }); child.stdin.on("error", () => {});
  const timer = setTimeout(() => child.kill("SIGKILL"), 8000); t.after(() => clearTimeout(timer));
  const code = await new Promise((resolve, reject) => { child.once("close", resolve); child.once("error", reject); });
  assert.equal(code, 1); assert.equal(parseSchemaBudgetEntryResult(stdout).category, "invalid_input");
  assert.equal(stderr, ""); assert.equal(progress, "");
});
