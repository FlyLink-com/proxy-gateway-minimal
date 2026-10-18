// Explicit local synthetic benchmark. Never opens a caller-supplied database,
// imports runtime configuration, or changes the application's query contract.
// Run manually, outside npm test:
// node scripts/profile-admin-usage-ledger.mjs --rows 550000 --runs 3 --output output/ledger-profile.json
// A checkout without Git objects can use --baseline-source <exact exported module>.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { createAdminUsageLedgerReader } from "../server/services/platform/admin-usage-ledger-reader.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const QUERY = "server/services/platform/admin-usage-ledger-query.mjs";
const BASELINE_REF = "e41536d9d42c0fa5b66acbcdebfe2b39ce12ff09";
const BASELINE_SHA256 = "f1916573f3335d23a8364846b626e3781890d7c481573b8063bc62910e41f438";
const CUTOFF = "2026-10-18T12:00:00.000Z";
const CREDENTIALS = 181;
const ACCOUNTS = 61;
const pairs = [
  ["full_metering_xray_cumulative_v1", "channel-vultr-a-vless-reality-tcp"],
  ["full_metering_hy2_cumulative_v1", "channel-vultr-a-hy2"],
  ["full_metering_tuic_connections_v1", "channel-vultr-a-tuic"],
  ["full_metering_xray_cumulative_v1", "channel-sgp-a-vless-reality-tcp"],
  ["full_metering_hy2_cumulative_v1", "channel-sgp-a-hy2"],
  ["synthetic-other-source", "synthetic-other-channel"]
];

function optionsFor(args) {
  const options = { rows: 550_000, runs: 3, output: null, baselineOnly: false, baselineSource: null };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--baseline-only") options.baselineOnly = true;
    else if (arg === "--rows") options.rows = Number(args[++index]);
    else if (arg === "--runs") options.runs = Number(args[++index]);
    else if (arg === "--output") options.output = resolve(args[++index]);
    else if (arg === "--baseline-source") options.baselineSource = resolve(args[++index]);
    else throw new Error(`Unknown benchmark argument: ${arg}`);
  }
  assert.ok(Number.isSafeInteger(options.rows) && options.rows >= CREDENTIALS && options.rows <= 1_000_000);
  assert.ok(Number.isSafeInteger(options.runs) && options.runs >= 1 && options.runs <= 10);
  if (options.output) mkdirSync(dirname(options.output), { recursive: true });
  return options;
}

function sha256(source) {
  return createHash("sha256").update(source).digest("hex");
}

async function fileSha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, `Expected exactly one instrumentation boundary: ${before}`);
  return source.replace(before, after);
}

async function loadQuery(source, instrumented, identity) {
  // Data URL modules leave the source checkout untouched. Only the dependency
  // specifier and four exact, checked call sites are rewritten in memory.
  let executable = replaceOnce(source, 'from "better-sqlite3"', `from ${JSON.stringify(import.meta.resolve("better-sqlite3"))}`);
  if (instrumented) {
    for (const [name, call] of [
      ["schemaAndBudget", "assertTablesAndBudget(db, scanLimit)"],
      ["validateData", "assertData(db)"],
      ["reconciliation", "readReconciliation(db, cutoff)"],
      ["windows", "readWindows(db, windows, cutoff)"]
    ]) {
      const boundary = name === "schemaAndBudget" || name === "validateData" ? `      ${call};`
        : name === "reconciliation" ? `      const reconciliation = ${call};`
          : `        windows: ${call},`;
      executable = replaceOnce(executable, boundary, boundary.replace(call, `__measure(${JSON.stringify(name)}, () => ${call})`));
    }
    executable += `\nconst __phases = {};\nfunction __measure(name, action) { const start = performance.now(); try { return action(); } finally { __phases[name] = performance.now() - start; } }\nexport function benchmarkPhases() { return { ...__phases }; }\n`;
  }
  executable += `\n// benchmark-module-${identity}\n`;
  return { module: await import(`data:text/javascript;base64,${Buffer.from(executable).toString("base64")}`), instrumentedSha256: sha256(executable) };
}

function makeFixture(directory, sampleCount) {
  const dbPath = join(directory, "synthetic.sqlite");
  const db = new Database(dbPath);
  const started = performance.now();
  try {
    db.pragma("journal_mode = WAL");
    // Take the two usage-table definitions and their indexes directly from the
    // local schema source. Minimal identity tables contain synthetic IDs only.
    const schema = readFileSync(join(ROOT, "server/services/platform/subscription-control-db.mjs"), "utf8");
    const start = schema.indexOf("    create table if not exists platform_usage_samples (");
    const end = schema.indexOf("    create table if not exists platform_usage_counter_cursors (", start);
    assert.ok(start >= 0 && end > start);
    db.exec(`create table platform_accounts (id text primary key);
      create table platform_entitlements (id text primary key);
      create table platform_issuance_requests (id text primary key);`);
    db.exec(schema.slice(start, end));
    db.pragma("foreign_keys = ON");
    const insert = db.prepare(`insert into platform_usage_samples values
      (@id, @source, @channel, @credential, @account, @entitlement, @request,
       @at, @start, @at, @up, @down, @total, @id, @created)`);
    const accountInsert = db.prepare("insert into platform_accounts values (?)");
    const entitlementInsert = db.prepare("insert into platform_entitlements values (?)");
    const requestInsert = db.prepare("insert into platform_issuance_requests values (?)");
    const boundaries = [CUTOFF, "2026-10-18T12:00:00.001Z", "2026-10-17T12:00:00.000Z",
      "2026-10-11T12:00:00.000Z", "2026-10-01T00:00:00.000Z", "2026-09-30T23:59:59.999Z"];
    const cycles = Math.ceil(sampleCount / CREDENTIALS);
    const timestamps = Array.from({ length: cycles }, (_, index) =>
      new Date(Date.parse(CUTOFF) - 1 - Math.floor(index * 21 * 86_400_000 / cycles)).toISOString());
    const starts = timestamps.map((at) => new Date(Date.parse(at) - 60_000).toISOString());
    db.transaction(() => {
      for (let account = 0; account < ACCOUNTS; account += 1) {
        accountInsert.run(`synthetic-account-${account}`);
        entitlementInsert.run(`synthetic-entitlement-${account}`);
        requestInsert.run(`synthetic-request-${account}`);
      }
      for (let index = 0; index < sampleCount; index += 1) {
        const credential = index % CREDENTIALS;
        const account = credential % ACCOUNTS;
        const pair = pairs[credential % pairs.length];
        const cycle = Math.floor(index / CREDENTIALS);
        const at = index < boundaries.length ? boundaries[index] : timestamps[cycle];
        const up = account % 11 === 0 ? 0 : 5 + (index % 100);
        const down = account % 11 === 0 ? 0 : 37 + (index % 1000);
        insert.run({ id: `synthetic-sample-${index}`, source: pair[0], channel: pair[1],
          credential: `synthetic-credential-${credential}`, account: `synthetic-account-${account}`,
          entitlement: `synthetic-entitlement-${account}`, request: `synthetic-request-${account}`,
          at, start: index < boundaries.length ? at : starts[cycle], created: at, up, down, total: up + down });
      }
      db.exec(`insert into platform_usage_rollups
        select edge_credential_ref, account_id, entitlement_id, request_id, min(channel_ref),
        sum(upload_bytes), sum(download_bytes), sum(total_bytes), max(observed_at), max(created_at)
        from platform_usage_samples group by edge_credential_ref, account_id, entitlement_id, request_id`);
    })();
    db.pragma("wal_checkpoint(TRUNCATE)");
    return { dbPath, seedMs: performance.now() - started,
      databaseBytes: statSync(dbPath).size, schemaSha256: sha256(schema.slice(start, end)) };
  } finally { db.close(); }
}

const options = optionsFor(process.argv.slice(2));
// A detached local Linux fixture can use the exact exported baseline snapshot;
// its pinned hash prevents a convenient copy from silently changing the oracle.
const baseline = options.baselineSource ? readFileSync(options.baselineSource, "utf8")
  : execFileSync("git", ["show", `${BASELINE_REF}:${QUERY}`], { cwd: ROOT, encoding: "utf8" });
assert.equal(sha256(baseline), BASELINE_SHA256, "Baseline source must match the immutable Git snapshot");
const current = readFileSync(join(ROOT, QUERY), "utf8");
const directory = mkdtempSync(join(tmpdir(), "admin-ledger-synthetic-profile-"));
let reader;
const children = [];
try {
  const fixture = makeFixture(directory, options.rows);
  console.log(JSON.stringify({ stage: "seed", rows: options.rows, seedMs: fixture.seedMs, databaseBytes: fixture.databaseBytes }));
  const beforeDatabaseSha256 = await fileSha256(fixture.dbPath);
  const input = { dbPath: fixture.dbPath, cutoff: CUTOFF };
  const metadataDb = new Database(":memory:");
  const sqlite = metadataDb.prepare("select sqlite_version() version").get().version;
  metadataDb.close();
  const evidence = { environment: "local-synthetic-only", productionTouched: false,
    observedAt: new Date().toISOString(), node: process.version, platform: process.platform,
    arch: process.arch, sqlite,
    baselineRef: BASELINE_REF, baselineSha256: sha256(baseline), currentSha256: sha256(current),
    rows: options.rows, rollups: CREDENTIALS, accounts: ACCOUNTS, sourceCategories: pairs.length,
    cutoff: CUTOFF, timeSpanDays: 21, seedMs: fixture.seedMs, databaseBytes: fixture.databaseBytes,
    schemaSha256: fixture.schemaSha256, runs: [], workerDurationMs: [], resultsExactlyEqual: true };
  let expected;
  const versions = options.baselineOnly ? [["baseline", baseline]] : [["baseline", baseline], ["current", current]];
  for (const [name, source] of versions) {
    const raw = await loadQuery(source, false, `${name}-raw`);
    const profiled = await loadQuery(source, true, `${name}-profiled`);
    const started = performance.now();
    const result = raw.module.readAdminUsageLedger(input);
    const rawMs = performance.now() - started;
    if (!expected) expected = result;
    assert.deepEqual(result, expected);
    assert.equal(result.reconciliation.state, "totals_match");
    assert.equal(result.reconciliation.samples.sampleCount, options.rows);
    assert.equal(result.reconciliation.rollups.rollupCount, CREDENTIALS);
    assert.equal(JSON.stringify(result).includes("synthetic-"), false);
    const runs = [];
    for (let run = 0; run < options.runs; run += 1) {
      const began = performance.now();
      assert.deepEqual(profiled.module.readAdminUsageLedger(input), expected);
      const phases = profiled.module.benchmarkPhases();
      runs.push({ elapsedMs: performance.now() - began, ...phases });
    }
    const entry = { name, rawMs, instrumentedSha256: profiled.instrumentedSha256, runs };
    evidence.runs.push(entry);
    console.log(JSON.stringify({ stage: "query", rows: options.rows, ...entry }));
  }
  if (!options.baselineOnly) {
    assert.equal(sha256(readFileSync(join(ROOT, QUERY), "utf8")), sha256(current), "Candidate changed during benchmark");
    reader = createAdminUsageLedgerReader({ dbPath: fixture.dbPath, nowFn: () => new Date(CUTOFF),
      spawnFn: (...args) => {
        const child = spawn(...args);
        const closed = new Promise((resolveClosed) => child.once("close", resolveClosed));
        children.push({ child, closed });
        return child;
      } });
    for (let run = 0; run < options.runs; run += 1) {
      const began = performance.now();
      assert.deepEqual(await reader.read(), expected);
      evidence.workerDurationMs.push(performance.now() - began);
    }
  }
  evidence.resultSha256 = sha256(JSON.stringify(expected));
  evidence.workerExitCodes = children.map(({ child }) => child.exitCode);
  const afterDatabaseSha256 = await fileSha256(fixture.dbPath);
  assert.equal(afterDatabaseSha256, beforeDatabaseSha256, "Synthetic database must remain byte-for-byte unchanged");
  evidence.databaseSha256 = afterDatabaseSha256;
  evidence.databaseUnchanged = true;
  if (options.output) writeFileSync(options.output, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ stage: "complete", ...evidence }));
} finally {
  reader?.close();
  await Promise.all(children.map(({ closed }) => closed));
  // The only removable directory is this process's fresh, exact mkdtemp path.
  rmSync(directory, { recursive: true, force: true });
}
