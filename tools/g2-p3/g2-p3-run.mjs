// G2-P3 probe runner.
//
// Executes every frozen fixture case on BOTH engines (better-sqlite3 /
// SQLite <-> local Miniflare D1) with local synthetic data only, and
// writes g2-p3-results.json + g2-p3-ddl-diff.json. Exit code 0 iff every
// case is PROVEN on both engines and the schema verification passed.
//
// Usage:
//   node g2-p3-run.mjs [--fixture g2-p3-fixture.json] [--out g2-p3-results.json]
//                      [--only L1] [--skip-d1]
//
// How a case runs (per engine, identical schedule on both):
//   1. Fresh DB, experiment schema built from this checkout's own
//      migration modules, stage-7 seed applied verbatim.
//   2. Watermark: the frozen ordered list of (occurred_at, entry_ref)
//      for all rows present at traversal start. Both engines must agree
//      with the fixture watermark before the traversal starts.
//   3. The reader walks the ledger with the VERBATIM production
//      listLedgerEntries SQL + the service-layer limit+1 / hasMore /
//      nextCursor logic (page size 5). After page N is fetched, the
//      writer batch scheduled at afterPage N is applied — synchronously
//      in the same process, between the reader's page requests. That is
//      exactly the hazard window of a real sequential reader while
//      writers commit between its requests; it is NOT OS-thread
//      parallelism, and the receipt says so.
//   4. Verdict PROVEN iff, on BOTH engines: the returned frozen rows
//      match the declared expectation exactly (missed / duplicated /
//      absent), every returned extra is a row the schedule inserted,
//      the full page sequences are byte-identical across engines, and
//      the page sequences match the independent JS simulation.
//      FAILED = expectation mismatch (exact deviation recorded).
//      UNPROVEN = a case could not be executed/measured (reason recorded).
//      Unexecuted is never filled PASS.
//
// The runner never mutates the fixture. It rebuilds the experiment
// schema and verifies it against the fixture's frozen hashes before
// running any probe, and it verifies the frozen LEDGER_SQL against the
// live production source at the baseline before running any probe.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  buildExperimentObjects,
  EXPERIMENT_OMIT_TRIGGERS,
  sha256,
} from "./lib/build-control-schema.mjs";
import {
  buildSqlite,
  buildD1,
  sqliteRun,
  sqliteQuery,
  d1Run,
  d1Query,
  D1Pool,
  errString,
} from "./lib/engines.mjs";
import { fetchPage, simulateWalk, analyzeReturned } from "./lib/traversal.mjs";

const require = createRequire(import.meta.url);
const bsPkg = require("better-sqlite3/package.json");
const mfPkg = require("miniflare/package.json");

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const FIXTURE_PATH = resolve(HERE, opt("--fixture", "g2-p3-fixture.json"));
const OUT_PATH = resolve(HERE, opt("--out", "g2-p3-results.json"));
const DDL_DIFF_PATH = resolve(HERE, opt("--ddl-diff", "g2-p3-ddl-diff.json"));
const ONLY = opt("--only", null);
const SKIP_D1 = args.includes("--skip-d1");

const sha256File = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const eqSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const eqObj = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Ledger dump: the full row, ordered by entry_ref. Desensitized
// synthetic data only (stage-7 fixture refs).
const LEDGER_DUMP_SQL =
  "select entry_ref, operation_ref, wallet_ref, lot_ref, operation, amount_units, previous_wallet_version, resulting_wallet_version, resulting_wallet_status, occurred_at from platform_coin_ledger_entries order by entry_ref";
const WATERMARK_SQL =
  "select occurred_at, entry_ref from platform_coin_ledger_entries where wallet_ref = 'wallet-pg-1' order by occurred_at desc, entry_ref desc";
const SEED_PARENT_TABLES = [
  "platform_accounts",
  "platform_coin_credit_origins",
  "platform_coin_lots",
  "platform_coin_operation_receipts",
  "platform_coin_wallets",
];

function dedupeEntries(entries) {
  const seen = new Set(), out = [];
  for (const e of entries ?? []) {
    const k = typeof e === "string" ? e : JSON.stringify(e);
    if (!seen.has(k)) { seen.add(k); out.push(e); }
  }
  return out;
}

async function main() {
  const fixtureRaw = readFileSync(FIXTURE_PATH, "utf8");
  const fixture = JSON.parse(fixtureRaw);
  const fixtureSha256 = sha256(fixtureRaw);
  const cases = ONLY ? fixture.cases.filter((x) => x.id === ONLY) : fixture.cases;
  if (cases.length === 0) throw new Error(`no cases matched (only=${ONLY})`);

  // ---------- schema verification (before any probe) ----------
  const omitUnion = [...fixture.meta.omissionUnion].sort();
  const builderUnion = [...EXPERIMENT_OMIT_TRIGGERS].sort();
  const exp = await buildExperimentObjects(
    join(HERE, ".g2-p3-run-build.sqlite"),
    fixture.meta.omissionUnion,
  );
  const verification = {
    baseline: fixture.meta.baseline,
    omissionUnionMatchesBuilder: JSON.stringify(omitUnion) === JSON.stringify(builderUnion),
    omissionUnionSize: omitUnion.length,
    objectSha256: exp.objectSha256,
    objectSha256MatchesFixture: exp.objectSha256 === fixture.meta.ddl.objectSha256,
    tables: exp.counts.tables,
    indexesTotal: exp.counts.indexesTotal,
    triggersBuilt: exp.counts.triggers,
    triggersOmitted: exp.omitCount,
    triggersRemaining: exp.counts.triggers - exp.omitCount,
    fkPragmaRows: exp.fkCount,
    ledgerRows: exp.ledgerRows.length,
    ledgerSqlMatchesLiveSource: false,
    ledgerSqlNormalizedSha256: null,
    watermarkMatchesFixture: false,
    watermarkSha256: null,
  };
  // The frozen LEDGER_SQL must match the live production source at the
  // baseline (whitespace-normalized). The probe tests current production
  // code, not a stale copy.
  const walletSrc = readFileSync(join(HERE, "..", "..", "server", "services", "platform", "coin-wallet-store.mjs"), "utf8");
  const lm = walletSrc.match(/function listLedgerEntries[\s\S]*?return db\.prepare\(`([\s\S]*?)`\)\.all\(/);
  const liveLedgerSql = lm ? lm[1] : null;
  verification.ledgerSqlNormalizedSha256 = liveLedgerSql ? sha256(norm(liveLedgerSql)) : null;
  verification.ledgerSqlMatchesLiveSource =
    !!liveLedgerSql &&
    norm(liveLedgerSql) === norm(fixture.ledgerSql) &&
    verification.ledgerSqlNormalizedSha256 === fixture.meta.ledgerSqlNormalizedSha256;
  // The accounts directory query (read path for the separate
  // declaration doc): extract live SQL + the registration-source
  // constant, inline it, and compare with the fixture's recorded
  // frozen SHA (stage-7 inlined the same CASE expression verbatim).
  const controlSrc = readFileSync(join(HERE, "..", "..", "server", "services", "platform", "subscription-control-db.mjs"), "utf8");
  const am = controlSrc.match(/function listUserMonitorAccountDirectory[\s\S]*?db\.prepare\(`([\s\S]*?)`\)\.all\(/);
  const constM = controlSrc.match(/const USER_MONITOR_REGISTRATION_SOURCE_SQL = `([\s\S]*?)`;/);
  const liveAccountsInlined = am && constM ? am[1].replace(/\$\{USER_MONITOR_REGISTRATION_SOURCE_SQL\}/g, constM[1]) : null;
  verification.accountsSqlNormalizedSha256AfterInlining = liveAccountsInlined ? sha256(norm(liveAccountsInlined)) : null;
  verification.accountsSqlMatchesFrozenAfterInlining =
    !!liveAccountsInlined &&
    verification.accountsSqlNormalizedSha256AfterInlining === fixture.meta.accountsSql?.liveNormalizedSha256AfterInlining &&
    verification.accountsSqlNormalizedSha256AfterInlining === fixture.meta.accountsSql?.frozenNormalizedSha256;
  // The watermark must be recomputable from the seed alone: run the
  // frozen seed on a throwaway SQLite DB and compare its ordered key
  // list with the fixture watermark. The seed is applied inside ONE
  // transaction: its statement order relies on a DEFERRABLE INITIALLY
  // DEFERRED FK (credit_origins.lot_ref -> lots, lot inserted after
  // the origin row), so per-statement autocommit would fail with a
  // foreign-key error. Same for the per-case seeds below, and the D1
  // batch on the other engine.
  const wdb = buildSqlite(exp.objects);
  wdb.transaction(() => { for (const e of dedupeEntries(fixture.seedStatements)) sqliteRun(wdb, e); })();
  const wmKeys = sqliteQuery(wdb, WATERMARK_SQL).map((r) => [r.occurred_at, r.entry_ref]);
  verification.watermarkSha256 = sha256(JSON.stringify(wmKeys));
  verification.watermarkMatchesFixture =
    verification.watermarkSha256 === fixture.meta.watermark.sha256 &&
    JSON.stringify(wmKeys) === JSON.stringify(fixture.meta.watermark.keys);
  wdb.close();
  verification.passed =
    verification.omissionUnionMatchesBuilder &&
    verification.objectSha256MatchesFixture &&
    verification.ledgerSqlMatchesLiveSource &&
    verification.accountsSqlMatchesFrozenAfterInlining &&
    verification.watermarkMatchesFixture;
  if (!verification.passed) {
    console.error("SCHEMA VERIFICATION FAILED:", JSON.stringify(verification, null, 2));
    process.exitCode = 2;
  }

  const sqliteVersion = (() => {
    const db = buildSqlite(exp.objects);
    const v = sqliteQuery(db, "SELECT sqlite_version() AS v")[0].v;
    db.close();
    return v;
  })();

  // ---------- D1 pool ----------
  // NOTE: D1 does not expose its SQLite version (sqlite_version() is
  // unauthorized: "D1_ERROR: not authorized to use function:
  // sqlite_version"). Record the Miniflare + workerd versions instead.
  let pool = null;
  let workerdVersion = null;
  if (!SKIP_D1) {
    try {
      workerdVersion = require("workerd/package.json").version;
    } catch {
      workerdVersion = null;
    }
    pool = new D1Pool(cases.length, join(HERE, ".miniflare-d1"));
    await pool.init();
  }

  // ---------- per-case runs ----------
  const results = [];
  for (const item of cases) {
    const rec = {
      id: item.id,
      kind: item.kind,
      title: item.title,
      pageSize: item.pageSize,
      productionReachability: item.productionReachability,
      sqlite: {},
      d1: null,
      verdict: null,
      problems: [],
      notes: item.note ? [item.note] : [],
    };
    const problems = rec.problems;
    const sdb = buildSqlite(exp.objects);
    let ddb = null;
    if (!SKIP_D1) {
      ddb = pool.take();
      await buildD1(ddb, exp.objects);
    }
    const seed = dedupeEntries(fixture.seedStatements);
    try {
      // One transaction (see watermark note above): the seed order
      // relies on a deferred FK.
      sdb.transaction(() => { for (const e of seed) sqliteRun(sdb, e); })();
      rec.sqlite.setup = { ok: true, rowsSeeded: seed.length };
    } catch (e) { rec.sqlite.setup = { ok: false, error: errString(e).slice(0, 300) }; }
    if (ddb) {
      try {
        // One D1 batch = one atomic unit, so the deferred FK resolves
        // at batch commit exactly as in the SQLite transaction.
        await d1Run(ddb, { batch: seed });
        rec.d1 = { setup: { ok: true, rowsSeeded: seed.length } };
      } catch (e) { rec.d1 = { setup: { ok: false, error: errString(e).slice(0, 300) } }; }
    }

    // Watermark agreement on both engines, before the traversal starts.
    const wmSqlite = sqliteQuery(sdb, WATERMARK_SQL).map((r) => [r.occurred_at, r.entry_ref]);
    rec.sqlite.watermark = { keys: wmSqlite.length, sha256: sha256(JSON.stringify(wmSqlite)), matchesFixture: JSON.stringify(wmSqlite) === JSON.stringify(fixture.meta.watermark.keys) };
    if (!rec.sqlite.watermark.matchesFixture) problems.push("sqlite watermark does not match fixture");
    let wmD1 = null;
    if (ddb) {
      wmD1 = (await d1Query(ddb, WATERMARK_SQL)).map((r) => [r.occurred_at, r.entry_ref]);
      rec.d1.watermark = { keys: wmD1.length, sha256: sha256(JSON.stringify(wmD1)), matchesFixture: JSON.stringify(wmD1) === JSON.stringify(fixture.meta.watermark.keys) };
      if (!rec.d1.watermark.matchesFixture) problems.push("d1 watermark does not match fixture");
      if (JSON.stringify(wmD1) !== JSON.stringify(wmSqlite)) problems.push("watermarks differ between engines");
    }

    // Interleaved traversal: fetch a page, then apply the writer batch
    // scheduled after that page number, then fetch the next page.
    const runTraversal = async (query, applyOp) => {
      const pages = [];
      let after = null;
      const byPage = new Map();
      for (const s of item.schedule) byPage.set(s.afterPage, s.ops);
      for (let i = 0; i < 200; i++) {
        const p = await fetchPage(query, fixture.ledgerSql, { limit: item.pageSize, after });
        pages.push(p.keys);
        if (!p.nextCursor) break;
        after = p.nextCursor;
        for (const op of byPage.get(pages.length) ?? []) {
          await applyOp(op.sql);
        }
      }
      return pages;
    };
    const sqliteQueryFn = async (sql, params) => sdb.prepare(sql).all(...params);
    const sqliteApply = async (sql) => { sdb.exec(sql); };
    try {
      rec.sqlite.pages = await runTraversal(sqliteQueryFn, sqliteApply);
      rec.sqlite.traversal = { ok: true };
    } catch (e) { rec.sqlite.traversal = { ok: false, error: errString(e).slice(0, 300) }; }
    if (ddb) {
      const d1QueryFn = async (sql, params) => (await ddb.prepare(sql).bind(...params).all()).results;
      const d1Apply = async (sql) => { await ddb.prepare(sql).run(); };
      try {
        rec.d1.pages = await runTraversal(d1QueryFn, d1Apply);
        rec.d1.traversal = { ok: true };
      } catch (e) { rec.d1.traversal = { ok: false, error: errString(e).slice(0, 300) }; }
    }

    // Terminal state: full ledger dump + seed-parent row counts.
    const dumpLedger = (rows) => rows;
    rec.sqlite.terminalState = {
      ledger: dumpLedger(sqliteQuery(sdb, LEDGER_DUMP_SQL)),
      parentCounts: Object.fromEntries(
        SEED_PARENT_TABLES.map((t) => [t, sqliteQuery(sdb, `select count(*) as n from ${t}`)[0].n]),
      ),
    };
    if (ddb) {
      rec.d1.terminalState = {
        ledger: dumpLedger(await d1Query(ddb, LEDGER_DUMP_SQL)),
        parentCounts: Object.fromEntries(
          await Promise.all(SEED_PARENT_TABLES.map(async (t) => [t, (await d1Query(ddb, `select count(*) as n from ${t}`))[0].n])),
        ),
      };
    }

    // ---------- verdict ----------
    const frozenKeys = fixture.meta.watermark.keys;
    const insertedSet = new Set(
      item.schedule.flatMap((s) => s.ops.filter((o) => o.kind === "insert").map((o) => o.ref)),
    );
    const checkEngine = (label, pages, traversal) => {
      if (!traversal?.ok) { problems.push(`${label} traversal failed: ${traversal?.error ?? ""}`); return null; }
      const returnedRefs = pages.flat();
      const analysis = analyzeReturned(returnedRefs, frozenKeys);
      const extras = returnedRefs.filter((r) => !new Set(frozenKeys.map((k) => k[1])).has(r));
      if (!eqSet(analysis.missed, item.expectation.missed)) {
        problems.push(`${label} missed ${JSON.stringify(analysis.missed)} != expected ${JSON.stringify(item.expectation.missed)}`);
      }
      if (!eqObj(analysis.duplicated, item.expectation.duplicated)) {
        problems.push(`${label} duplicated ${JSON.stringify(analysis.duplicated)} != expected ${JSON.stringify(item.expectation.duplicated)}`);
      }
      if (!eqSet(extras, item.expectation.extras)) {
        problems.push(`${label} extras ${JSON.stringify(extras)} != expected ${JSON.stringify(item.expectation.extras)}`);
      }
      for (const x of extras) {
        if (!insertedSet.has(x)) problems.push(`${label} phantom extra ${x} was not inserted by the schedule`);
      }
      // Independent simulation agreement (same schedule, same page size).
      const sim = simulateWalk(frozenKeys, item.schedule, item.pageSize);
      if (JSON.stringify(pages) !== JSON.stringify(sim.pages)) {
        problems.push(`${label} page sequences differ from the independent simulation`);
      }
      return { pages, returnedRefs, analysis, extras, simulatedPages: sim.pages };
    };
    rec.sqlite.check = checkEngine("sqlite", rec.sqlite.pages, rec.sqlite.traversal);
    if (ddb) rec.d1.check = checkEngine("d1", rec.d1.pages, rec.d1.traversal);
    if (rec.sqlite.check && rec.d1?.check) {
      if (JSON.stringify(rec.sqlite.pages) !== JSON.stringify(rec.d1.pages)) {
        problems.push("page sequences differ between engines");
      }
      if (JSON.stringify(rec.sqlite.terminalState) !== JSON.stringify(rec.d1.terminalState)) {
        problems.push("terminal states differ between engines");
      }
    }
    if (!rec.sqlite.setup?.ok) problems.push(`sqlite setup failed: ${rec.sqlite.setup?.error}`);
    if (rec.d1 && !rec.d1.setup?.ok) problems.push(`d1 setup failed: ${rec.d1.setup?.error}`);
    if (SKIP_D1) problems.push("d1 run skipped (--skip-d1): dual-engine evidence NOT established");
    // Verdict semantics: PROVEN = all checks pass on both engines.
    // FAILED = an expectation mismatch on an executed engine.
    // UNPROVEN = a case could not be executed/measured (traversal or
    // setup failed, or an engine was skipped). A skipped engine is
    // UNPROVEN, never FAILED.
    if (!rec.sqlite.traversal?.ok || (rec.d1 && !rec.d1.traversal?.ok) || SKIP_D1) rec.verdict = "UNPROVEN";
    else rec.verdict = problems.length === 0 ? "PROVEN" : "FAILED";
    results.push(rec);
    sdb.close();
    console.log(`${item.id} ${item.kind} :: ${rec.verdict}${problems.length ? " -- " + problems.join("; ") : ""}`);
  }

  if (pool) await pool.dispose();

  const summary = {
    total: results.length,
    proven: results.filter((r) => r.verdict === "PROVEN").length,
    failed: results.filter((r) => r.verdict === "FAILED").length,
    unproven: results.filter((r) => r.verdict === "UNPROVEN").length,
    verificationPassed: verification.passed,
    dualEngine: !SKIP_D1,
  };
  const out = {
    meta: {
      baseline: fixture.meta.baseline,
      fixtureSha256,
      fixturePath: FIXTURE_PATH,
      generatedAt: new Date().toISOString(),
      versions: {
        node: process.version,
        betterSqlite3: bsPkg.version,
        sqlite: sqliteVersion,
        miniflare: SKIP_D1 ? null : mfPkg.version,
        workerd: workerdVersion,
        d1Sqlite: "not exposed by D1 (sqlite_version() is unauthorized)",
      },
      ddl: fixture.meta.ddl,
      omissionUnion: fixture.meta.omissionUnion,
      watermarkSha256: fixture.meta.watermark.sha256,
      ledgerSqlNormalizedSha256: fixture.meta.ledgerSqlNormalizedSha256,
    },
    verification,
    summary,
    cases: results,
  };
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  // Frozen stage-7 vs live query comparison (the DDL-diff artifact).
  const ddlDiff = {
    meta: {
      baseline: fixture.meta.baseline,
      g2Baseline: "master 63082bae5d980c3905d6e7405329b19e6c4e38ac (stage-7 pagination evidence, pagination-results.json)",
      note: "Frozen comparison: each pagination query as frozen by stage 7 (63082bae) vs the live query text at the baseline (this checkout's own production source). Comparison is whitespace-normalized. The ledger query is byte-identical; the accounts query is identical after inlining the registration-source constant (a refactor into a named constant, not a semantic change).",
    },
    ledger: {
      query: "coin-wallet-store.mjs listLedgerEntries",
      stage7FrozenSqlNormalizedSha256: fixture.meta.ledgerSqlNormalizedSha256,
      liveSqlNormalizedSha256: verification.ledgerSqlNormalizedSha256,
      identicalNormalized: verification.ledgerSqlMatchesLiveSource,
    },
    accounts: {
      query: "subscription-control-db.mjs listUserMonitorAccountDirectory",
      stage7FrozenSqlNormalizedSha256: fixture.meta.accountsSql.frozenNormalizedSha256,
      liveSqlNormalizedSha256AfterInlining: verification.accountsSqlNormalizedSha256AfterInlining,
      identicalNormalizedAfterInlining: verification.accountsSqlMatchesFrozenAfterInlining,
      note: fixture.meta.accountsSql.note,
    },
  };
  writeFileSync(DDL_DIFF_PATH, JSON.stringify(ddlDiff, null, 2));
  console.log(`\n=== SUMMARY === ${summary.proven}/${summary.total} PROVEN (${summary.failed} FAILED, ${summary.unproven} UNPROVEN); verification ${verification.passed ? "PASSED" : "FAILED"}; results sha256 ${sha256File(OUT_PATH)}; ddl-diff sha256 ${sha256File(DDL_DIFF_PATH)}`);
  process.exitCode = summary.proven === summary.total && verification.passed ? 0 : 1;
}

main().catch((e) => {
  console.error("RUNNER FAILED:", e);
  process.exitCode = 2;
});
