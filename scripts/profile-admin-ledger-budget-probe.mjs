// Explicit local synthetic experiment, not a production query or readiness gate.
// node scripts/profile-admin-ledger-budget-probe.mjs --rows 550000 --runs 1 --output output/budget-550000.json
// Repeat with --rows 1000000. No existing database, env or credentials accepted.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const QUERY = "server/services/platform/admin-usage-ledger-query.mjs";
const BASELINE_REF = "35c969eb53ecd689f4094c9a68d50891dbb1b26d";
const BASELINE_SHA = "864281f210a8dcb053e9ed0759dae16c47ce2cd516fbf270bb5955fee0bb3be8";
const TABLES = ["platform_usage_samples", "platform_usage_rollups", "platform_accounts"];
const CUTOFF = "2026-10-18T12:00:00.000Z";
const ACCOUNTS = 61;
const CREDENTIALS = 181;
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const COUNT_BLOCK = `    // COUNT over a bounded subquery visits at most cap+1 rows, unlike LIMIT on
    // the result of a full-table aggregate. Never publish a truncated total.
    const { row_count: count } = db.prepare(\`
      select count(*) as row_count from (select 1 from \${table} limit ?)
    \`).get(scanLimit + 1);
    if (safeCount(count) > scanLimit) fail("scan_limit_exceeded");`;
const PROBE_BLOCK = `    // We only need to know whether a cap+1th row exists. OFFSET still visits
    // at most cap+1 rows, but avoids a subquery coroutine and COUNT per row.
    // This is a budget check, not pagination: later validation and aggregates
    // still consume the entire snapshot and never publish truncated totals.
    const excess = db.prepare(\`
      select 1 as over_budget from \${table} limit 1 offset ?
    \`).get(scanLimit);
    if (excess) fail("scan_limit_exceeded");`;

function optionsFor(args) {
  const options = { rows: 550000, runs: 1, output: null };
  for (let i = 0; i < args.length; i += 2) {
    assert.ok(["--rows", "--runs", "--output"].includes(args[i]) && args[i + 1], "Unknown/missing argument");
    if (args[i] === "--rows") options.rows = Number(args[i + 1]);
    if (args[i] === "--runs") options.runs = Number(args[i + 1]);
    if (args[i] === "--output") options.output = resolve(args[i + 1]);
  }
  assert.ok(Number.isSafeInteger(options.rows) && options.rows >= CREDENTIALS && options.rows <= 1000000);
  assert.ok(Number.isSafeInteger(options.runs) && options.runs >= 1 && options.runs <= 5);
  if (options.output) assert.equal(existsSync(options.output), false, "Do not replace an existing report");
  return options;
}

async function fileHash(path) {
  if (!existsSync(path)) return null;
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function fileEvidence(path) {
  return { databaseBytes: statSync(path).size, walBytes: existsSync(path + "-wal") ? statSync(path + "-wal").size : 0,
    databaseSha256: await fileHash(path), walSha256: await fileHash(path + "-wal") };
}

async function loadCore(source, label) {
  assert.equal(source.split('from "better-sqlite3"').length, 2);
  const executable = source.replace('from "better-sqlite3"', `from ${JSON.stringify(import.meta.resolve("better-sqlite3"))}`);
  return import(`data:text/javascript;base64,${Buffer.from(executable + `\n// ${label}\n`).toString("base64")}`);
}

function seed(directory, rows) {
  const dbPath = join(directory, "synthetic.sqlite");
  const writer = new Database(dbPath);
  try {
    writer.pragma("journal_mode = WAL");
    writer.pragma("wal_autocheckpoint = 0");
    const source = readFileSync(join(ROOT, "server/services/platform/subscription-control-db.mjs"), "utf8");
    const start = source.indexOf("    create table if not exists platform_usage_samples (");
    const end = source.indexOf("    create table if not exists platform_usage_counter_cursors (", start);
    assert.ok(start >= 0 && end > start);
    const schema = source.slice(start, end);
    writer.exec(`create table platform_accounts (id text primary key);
      create table platform_entitlements (id text primary key);
      create table platform_issuance_requests (id text primary key);`);
    writer.exec(schema);
    writer.pragma("foreign_keys = ON");
    const insert = writer.prepare(`insert into platform_usage_samples values
      (@id,@source,@channel,@credential,@account,@entitlement,@request,@at,@start,@end,@up,@down,@total,@id,@created)`);
    const account = writer.prepare("insert into platform_accounts values (?)");
    const entitlement = writer.prepare("insert into platform_entitlements values (?)");
    const request = writer.prepare("insert into platform_issuance_requests values (?)");
    const pairs = [
      ["full_metering_xray_cumulative_v1", "channel-vultr-a-vless-reality-tcp"],
      ["full_metering_hy2_cumulative_v1", "channel-vultr-a-hy2"],
      ["full_metering_tuic_connections_v1", "channel-vultr-a-tuic"],
      ["full_metering_xray_cumulative_v1", "channel-sgp-a-vless-reality-tcp"],
      ["full_metering_hy2_cumulative_v1", "channel-sgp-a-hy2"],
      ["synthetic-other-source", "synthetic-other-channel"]
    ];
    const boundary = [CUTOFF, "2026-10-18T12:00:00.001Z", "2026-10-17T12:00:00.000Z",
      "2026-10-11T12:00:00.000Z", "2026-10-01T00:00:00.000Z", "2026-09-30T23:59:59.999Z"];
    const cycles = Math.ceil(rows / CREDENTIALS);
    const times = Array.from({ length: cycles }, (_, cycle) => {
      const time = Date.parse(CUTOFF) - 1 - Math.floor(cycle * 21 * 86400000 / cycles);
      return [time, time - 60000, time - 1, time + 1].map(t => new Date(t).toISOString());
    });
    writer.transaction(() => {
      for (let i = 0; i < ACCOUNTS; i++) {
        account.run(`synthetic-account-${i}`);
        entitlement.run(`synthetic-entitlement-${i}`);
        request.run(`synthetic-request-${i}`);
      }
      for (let i = 0; i < rows; i++) {
        const credential = i % CREDENTIALS, owner = credential % ACCOUNTS;
        const pair = pairs[credential % pairs.length];
        const [at, from, to, created] = i < boundary.length ? Array(4).fill(boundary[i]) : times[Math.floor(i / CREDENTIALS)];
        const up = owner % 11 === 0 ? 0 : 5 + i % 100, down = owner % 11 === 0 ? 0 : 37 + i % 1000;
        insert.run({ id: `synthetic-sample-${i}`, source: pair[0], channel: pair[1],
          credential: `synthetic-credential-${credential}`, account: `synthetic-account-${owner}`,
          entitlement: `synthetic-entitlement-${owner}`, request: `synthetic-request-${owner}`,
          at, start: from, end: to, created, up, down, total: up + down });
      }
      writer.exec(`insert into platform_usage_rollups
        select edge_credential_ref, account_id, entitlement_id, request_id, min(channel_ref),
        sum(upload_bytes), sum(download_bytes), sum(total_bytes), max(observed_at), max(created_at)
        from platform_usage_samples group by edge_credential_ref, account_id, entitlement_id, request_id`);
    })();
    return { writer, dbPath, schemaSha256: sha(schema), sqlite: writer.prepare("select sqlite_version() value").get().value };
  } catch (error) { writer.close(); throw error; }
}

function sqlFor(table, kind) {
  assert.ok(TABLES.includes(table));
  return kind === "bounded_count" ? `select count(*) as row_count from (select 1 from ${table} limit ?)`
    : `select 1 as over_budget from ${table} limit 1 offset ?`;
}

function budgetEvidence(path, rows, runs) {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    db.defaultSafeIntegers(true);
    db.pragma("query_only = ON");
    return db.transaction(() => TABLES.map((table, index) => {
      const count = [rows, CREDENTIALS, ACCOUNTS][index];
      const entries = ["bounded_count", "offset_probe"].map(kind => {
        const sql = sqlFor(table, kind), statement = db.prepare(sql), cap = 1000000;
        const parameter = kind === "bounded_count" ? cap + 1 : cap;
        const plan = db.prepare("explain query plan " + sql).all(parameter).map(r => r.detail);
        const opcodes = db.prepare("explain " + sql).all(parameter).reduce((result, row) => {
          result[row.opcode] = (result[row.opcode] ?? 0) + 1; return result;
        }, {});
        const checks = [count - 1, count, count + 1].map(limit => {
          const row = statement.get(kind === "bounded_count" ? limit + 1 : limit);
          const exceeded = kind === "bounded_count" ? row.row_count > BigInt(limit) : row !== undefined;
          assert.equal(exceeded, count > limit);
          return { cap: limit, exceeded };
        });
        const elapsedMs = [];
        for (let i = 0; i < runs; i++) {
          const began = performance.now(); statement.get(parameter); elapsedMs.push(performance.now() - began);
        }
        return { kind, plan, opcodes, checks, elapsedMs };
      });
      assert.deepEqual(entries[0].checks, entries[1].checks);
      return { table, syntheticRows: count, entries };
    }))();
  } finally { db.close(); }
}

function measureCore(core, input) {
  const phases = {}, starts = {};
  const began = performance.now();
  const result = core.readAdminUsageLedger(input, { onPhase({ phase, event }) {
    if (event === "start") starts[phase] = performance.now();
    else { assert.ok(Object.hasOwn(starts, phase)); phases[phase] = performance.now() - starts[phase]; delete starts[phase]; }
  } });
  assert.deepEqual(starts, {});
  assert.ok(Object.hasOwn(phases, "schema_budget") && Object.hasOwn(phases, "validate_samples"));
  return { result, elapsedMs: performance.now() - began, phases };
}

const options = optionsFor(process.argv.slice(2));
const baseline = execFileSync("git", ["show", `${BASELINE_REF}:${QUERY}`], { cwd: ROOT, encoding: "utf8" });
assert.equal(sha(baseline), BASELINE_SHA, "Exact immutable baseline required");
assert.equal(baseline.split(COUNT_BLOCK).length, 2, "Budget replacement must have exactly one source boundary");
const probe = readFileSync(join(ROOT, QUERY), "utf8").replace(/\r\n/g, "\n");
assert.equal(probe, baseline.replace(COUNT_BLOCK, PROBE_BLOCK), "Current query must be exactly the approved budget-only source change");
const cores = { bounded_count: await loadCore(baseline, "baseline"), offset_probe: await loadCore(probe, "probe") };
const directory = mkdtempSync(join(tmpdir(), "admin-ledger-budget-probe-"));
let fixture;
try {
  const began = performance.now();
  fixture = seed(directory, options.rows);
  const evidence = { environment: "local-synthetic-only", productionTouched: false,
    observedAt: new Date().toISOString(), node: process.version, platform: process.platform, arch: process.arch,
    sqlite: fixture.sqlite, baselineRef: BASELINE_REF, baselineSha256: sha(baseline), currentSha256: sha(probe),
    schemaSha256: fixture.schemaSha256, rows: options.rows, accounts: ACCOUNTS, credentials: CREDENTIALS,
    schemaBoundary: "Repository usage tables and indexes; minimal synthetic identity tables",
    seedMs: performance.now() - began, timeSpanDays: 21, modes: [], resultsExactlyEqual: true,
    limits: ["OFFSET remains O(n)", "Writer is idle but retained to preserve WAL", "No OS cache flush; these are not cold-disk measurements",
      "Direct synchronous synthetic core, not production 10-second reader acceptance", "No change to production DB, indexes, timeout or cache"] };
  console.log(JSON.stringify({ stage: "seed", rows: options.rows, seedMs: evidence.seedMs }));
  let expected;
  for (const mode of ["wal_uncheckpointed", "checkpointed"]) {
    if (mode === "checkpointed") {
      const result = fixture.writer.pragma("wal_checkpoint(TRUNCATE)");
      assert.equal(result[0].busy, 0);
    }
    const before = await fileEvidence(fixture.dbPath), fullQueryRuns = [];
    if (mode === "wal_uncheckpointed") assert.ok(before.walBytes > 0);
    else assert.equal(before.walBytes, 0);
    // Fresh read-only connection per call, alternating order; OS cache is not reset.
    for (let run = 0; run < options.runs; run++) {
      const order = run % 2 === 0 ? ["bounded_count", "offset_probe"] : ["offset_probe", "bounded_count"];
      for (const name of order) {
        const measured = measureCore(cores[name], { dbPath: fixture.dbPath, cutoff: CUTOFF });
        expected ??= measured.result;
        assert.deepEqual(measured.result, expected);
        assert.equal(measured.result.reconciliation.state, "totals_match");
        assert.equal(measured.result.reconciliation.samples.sampleCount, options.rows);
        fullQueryRuns.push({ run, name, elapsedMs: measured.elapsedMs, phases: measured.phases,
          resultSha256: sha(JSON.stringify(measured.result)) });
      }
    }
    const budgets = budgetEvidence(fixture.dbPath, options.rows, options.runs);
    assert.deepEqual(await fileEvidence(fixture.dbPath), before, "Read-only runs changed fixture DB/WAL bytes");
    const item = { mode, ...before, databaseAndWalUnchanged: true, fullQueryRuns, budgets };
    evidence.modes.push(item);
    console.log(JSON.stringify({ stage: "mode", mode, rows: options.rows, fullQueryRuns }));
  }
  evidence.resultSha256 = sha(JSON.stringify(expected));
  assert.equal(sha(readFileSync(join(ROOT, QUERY), "utf8").replace(/\r\n/g, "\n")), sha(probe), "Current source changed during benchmark");
  if (options.output) {
    mkdirSync(dirname(options.output), { recursive: true });
    writeFileSync(options.output, JSON.stringify(evidence, null, 2) + "\n", { flag: "wx" });
  }
  console.log(JSON.stringify({ stage: "complete", rows: options.rows, modes: evidence.modes.length,
    resultsExactlyEqual: true, productionTouched: false, resultSha256: evidence.resultSha256 }));
} finally {
  fixture?.writer.close();
  // Only the fresh exact mkdtemp-owned synthetic directory is removable.
  rmSync(directory, { recursive: true, force: true });
}
