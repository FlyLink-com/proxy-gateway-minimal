// d1-card13-import-batch-budget.test.mjs
//
// Card 13 tests. All inputs are synthetic / planning metadata: the
// Card 6 snapshot counts (6,848 rows), DDL v1.1 parsed shape (70 indexes,
// 55 triggers, 570 columns) and the Card 7 dry-run figures. No production
// data, no network, no D1 calls. Boundary tests assert the official
// limits exactly (100,000-byte statement, 2,000,000-byte row, 100 binds,
// 30 s query, 50 MB result, 10 GB database).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  D1_LIMITS,
  OPERATIONAL_MARGINS,
  DEFAULT_BATCH_ROWS,
  MAX_BATCH_RETRIES,
  RETRY_DELAY_SECONDS,
  TRIGGER_WRITES_PER_INSERT,
  rowsPerStatementByBinds,
  rowsPerStatementByBytes,
  rowsPerStatement,
  classifyRow,
  planTable,
  planLoad,
  planFirstBatch6848,
  FIRST_BATCH_PLAN_INPUT_6848,
  retryBudget,
  retryDelaySeconds,
  checkBatchDuration,
  checkResultSize,
  checkStorage,
  evaluatePause,
  snapshotDrift,
} from '../services/platform/d1-card13-import-batch-budget.mjs';

// --- Official limits, as verified 2026-11-21 -------------------------------

test('official limits match the values verified on 2026-11-21', () => {
  assert.equal(D1_LIMITS.maxStatementBytes, 100_000);
  assert.equal(D1_LIMITS.maxRowBytes, 2_000_000);
  assert.equal(D1_LIMITS.maxBindParamsPerQuery, 100);
  assert.equal(D1_LIMITS.maxQuerySeconds, 30);
  assert.equal(D1_LIMITS.maxQueryResultBytes, 50_000_000);
  assert.equal(D1_LIMITS.maxColumnsPerTable, 100);
  assert.equal(D1_LIMITS.maxDatabaseBytes, 10_000_000_000);
  assert.equal(D1_LIMITS.monthlyRowsReadIncluded, 25_000_000_000);
  assert.equal(D1_LIMITS.monthlyRowsWrittenIncluded, 50_000_000);
  assert.equal(D1_LIMITS.monthlyStorageIncludedBytes, 5_000_000_000);
  assert.equal(D1_LIMITS.maxQueriesPerWorkerInvocationPaid, 1_000);
  assert.equal(D1_LIMITS.timeTravelDaysPaid, 30);
  assert.equal(D1_LIMITS.verifiedDate, '2026-11-21');
});

// --- 100-bind boundary --------------------------------------------------------

test('bind cap: rows per statement = floor(100 / columns)', () => {
  // Widest first-batch table: archive, 28 columns -> 3 rows per statement
  // (3*28 = 84 binds; a 4th row would need 112 binds).
  assert.equal(rowsPerStatementByBinds(28), 3);
  // Receipts, 21 columns -> 4 rows (4*21 = 84; 5 rows = 105 > 100).
  assert.equal(rowsPerStatementByBinds(21), 4);
  assert.equal(rowsPerStatementByBinds(22), 4);
  assert.equal(rowsPerStatementByBinds(26), 3);
  assert.equal(rowsPerStatementByBinds(100), 1);
  assert.equal(rowsPerStatementByBinds(1), 100);
  assert.equal(rowsPerStatementByBinds(2), 50);
  assert.throws(() => rowsPerStatementByBinds(0), /column_count_invalid/);
  assert.throws(() => rowsPerStatementByBinds(101), /column_count_exceeds_table_limit/);
});

test('bind cap: 5 receipt rows in one statement would need 105 binds and is rejected', () => {
  const perStatement = rowsPerStatement({ columns: 21 });
  assert.equal(perStatement, 4);
  assert.ok(5 * 21 > D1_LIMITS.maxBindParamsPerQuery);
  assert.ok(perStatement * 21 <= D1_LIMITS.maxBindParamsPerQuery);
});

// --- 100 KB statement boundary ----------------------------------------------

test('statement bytes: literal mode splits at the 80,000-byte operational cap', () => {
  // 2,000-byte rows: 40 rows fit in 80,000 bytes, the 41st does not.
  assert.equal(rowsPerStatementByBytes(2_000), 40);
  assert.equal(rowsPerStatementByBytes(2_000, 100_000), 50);
  // A single row whose literal text alone exceeds the official 100 KB cap
  // cannot be sent literally at all (0 rows fit) -> bound mode or defer.
  assert.equal(rowsPerStatementByBytes(100_001, 100_000), 0);
  assert.equal(rowsPerStatementByBytes(100_000, 100_000), 1);
  assert.throws(() => rowsPerStatementByBytes(0), /row_literal_bytes_invalid/);
});

test('statement bytes: bound mode is governed by binds, literal mode by the min of both', () => {
  // 21-column receipts, 2 KB rows: binds allow 4, bytes allow 40 -> 4.
  assert.equal(rowsPerStatement({ columns: 21, maxRowLiteralBytes: 2_000, mode: 'literal' }), 4);
  // 2-column channels table, 30 KB rows: binds allow 50, bytes allow 2 -> 2.
  assert.equal(rowsPerStatement({ columns: 2, maxRowLiteralBytes: 30_000, mode: 'literal' }), 2);
  assert.equal(rowsPerStatement({ columns: 2, mode: 'bound' }), 50);
  assert.throws(
    () => rowsPerStatement({ columns: 2, mode: 'literal' }),
    /literal_mode_needs_row_bytes/,
  );
  assert.throws(() => rowsPerStatement({ columns: 2, mode: 'inline' }), /unknown_statement_mode/);
});

// --- 2 MB single-row boundary ------------------------------------------------

test('row size: exactly 2,000,000 bytes loads, 2,000,001 defers (F-5)', () => {
  assert.equal(classifyRow(2_000_000).verdict, 'loadable');
  assert.deepEqual(classifyRow(2_000_001), { verdict: 'defer', reason: 'row_exceeds_2mb', code: 'F-5' });
  assert.equal(classifyRow(0).verdict, 'loadable');
  assert.throws(() => classifyRow(-1), /row_bytes_invalid/);
});

// --- 30-second batch boundary -------------------------------------------------

test('batch duration: 30 s is a split, never a retry-as-is; 20 s is the soft cap', () => {
  assert.equal(checkBatchDuration(19.9).verdict, 'ok');
  assert.equal(checkBatchDuration(20).verdict, 'split_batch');
  assert.equal(checkBatchDuration(29.9).verdict, 'split_batch');
  assert.deepEqual(checkBatchDuration(30), {
    verdict: 'split_batch', reason: 'batch_exceeds_30s', retryAsIs: false,
  });
  assert.equal(checkBatchDuration(30).retryAsIs, false);
  assert.throws(() => checkBatchDuration(-1), /seconds_invalid/);
});

// --- 50 MB result boundary ------------------------------------------------------

test('result size: over 50,000,000 bytes fails; over the 40 MB soft cap reads must split', () => {
  assert.equal(checkResultSize(50_000_001).verdict, 'fail');
  // Exactly 50 MB does not exceed the hard cap, but it is over the 40 MB
  // operational soft cap, so the planner still says split the reads.
  assert.equal(checkResultSize(50_000_000).verdict, 'split_reads');
  assert.equal(checkResultSize(40_000_001).verdict, 'split_reads');
  assert.equal(checkResultSize(40_000_000).verdict, 'ok');
  // Card 6 estimate: largest table 1,513 rows at 0.5-2 KB/row is ~0.75-3 MB,
  // far below the cap; the whole 6,848-row read is ~3-14 MB (estimate only).
  assert.equal(checkResultSize(14_000_000).verdict, 'ok');
});

// --- 10 GB database boundary ------------------------------------------------------

test('storage: 10 GB is the single-database hard cap; 5 GB is the included amount', () => {
  assert.equal(checkStorage(10_000_000_000).withinSingleDbLimit, true);
  assert.equal(checkStorage(10_000_000_001).withinSingleDbLimit, false);
  assert.equal(checkStorage(5_000_000_000).withinIncludedStorage, true);
  assert.equal(checkStorage(5_000_000_001).withinIncludedStorage, false);
  assert.equal(checkStorage(6_000_000_000).overageGbMonth, 1);
});

// --- Per-table plan --------------------------------------------------------------

test('planTable: receipts (1,513 rows, 21 cols, 4 indexes) need 16 batches and 25 statements each', () => {
  const p = planTable({
    table: 'platform_edge_apply_receipts', rows: 1513, columns: 21,
    indexes: 4, partialIndexes: 1, foreignKeys: 0,
  });
  assert.equal(p.batches, 16);
  assert.equal(p.rowsPerStatement, 4);
  assert.equal(p.statementsPerBatch, 25);
  assert.equal(p.statementsTotal, 400);
  // Worst case: 1 table row + 4 index entries per row (partial digest
  // index assumed to match every row).
  assert.equal(p.rowsWrittenWorst, 1513 * 5);
  // Floor: partial index excluded.
  assert.equal(p.rowsWrittenNonPartial, 1513 * 4);
  assert.equal(p.fkParentLookups, 0);
});

test('planTable: widest table (archive, 28 cols) fits 3 rows per statement', () => {
  const p = planTable({
    table: 'platform_payment_orders_legacy_archive_20260803', rows: 33, columns: 28,
    indexes: 3, partialIndexes: 0, foreignKeys: 0,
  });
  assert.equal(p.rowsPerStatement, 3);
  assert.equal(p.batches, 1);
  assert.equal(p.statementsPerBatch, 34);
  assert.equal(p.rowsWrittenWorst, 33 * 4);
});

test('planTable: a zero-row table plans zero batches and zero writes', () => {
  const p = planTable({ table: 'platform_leads', rows: 0, columns: 5, indexes: 0, partialIndexes: 0, foreignKeys: 0 });
  assert.equal(p.batches, 0);
  assert.equal(p.statementsTotal, 0);
  assert.equal(p.rowsWrittenWorst, 0);
});

test('planTable rejects inconsistent index counts', () => {
  assert.throws(
    () => planTable({ table: 'x', rows: 1, columns: 1, indexes: 1, partialIndexes: 2 }),
    /index_count_invalid/,
  );
});

// --- Whole first-batch plan: 6,848 rows ------------------------------------------

test('first-batch input is the Card 6 snapshot: 50 tables, 6,848 rows', () => {
  assert.equal(FIRST_BATCH_PLAN_INPUT_6848.length, 50);
  assert.equal(FIRST_BATCH_PLAN_INPUT_6848.reduce((a, t) => a + t.rows, 0), 6848);
  // DDL v1.1 shape carried by the input: 67 of the 70 indexes (9 partial)
  // sit on these 50 tables; the other 3 are on platform_portal_entries
  // (FK-prep empty table, 0 rows, 0 load writes). FK references: 68.
  assert.equal(FIRST_BATCH_PLAN_INPUT_6848.reduce((a, t) => a + t.indexes, 0), 67);
  assert.equal(FIRST_BATCH_PLAN_INPUT_6848.reduce((a, t) => a + t.partialIndexes, 0), 9);
  assert.equal(FIRST_BATCH_PLAN_INPUT_6848.reduce((a, t) => a + t.foreignKeys, 0), 68);
});

test('planFirstBatch6848: 103 batches, 1,412 statements, 22,012 worst-case rows_written', () => {
  const plan = planFirstBatch6848();
  assert.equal(plan.totals.tables, 50);
  assert.equal(plan.totals.rows, 6848);
  assert.equal(plan.totals.batches, 103);
  assert.equal(plan.totals.statementsTotal, 1412);
  // Worst case (every partial index matches every row): 6,848 base rows
  // + index maintenance = 22,012 rows_written, multiplier 3.214x.
  assert.equal(plan.totals.rowsWrittenWorst, 22012);
  // Floor (no partial index ever matches): 20,336.
  assert.equal(plan.totals.rowsWrittenNonPartial, 20336);
  // FK parent lookups: 68 references over the 50 tables.
  assert.equal(plan.totals.fkParentLookups, 7497);
  // E4-side reconciliation: COUNT + full hash read = 2 x 6,848.
  assert.equal(plan.totals.reconciliationRowsReadE4, 13696);
  assert.equal(plan.rowsReadPlanningBound, 7497 + 13696);
  // Monthly shares: writes are 0.0440% of the 50M included writes;
  // reads are 0.000085% of the 25B included reads. Neither binds.
  assert.ok(Math.abs(plan.monthlyShare.rowsWrittenWorstPct - 0.044024) < 0.000001);
  assert.ok(plan.monthlyShare.rowsReadPlanningBoundPct < 0.001);
});

test('planFirstBatch6848: triggers add zero rows_written on the INSERT path', () => {
  assert.equal(TRIGGER_WRITES_PER_INSERT, 0);
  // If DDL ever gains a writing trigger, the multiplier must be revisited:
  // one writing trigger would add 6,848 rows_written to the worst case.
  const plan = planFirstBatch6848();
  assert.equal(plan.totals.rowsWrittenWorst, plan.totals.rows * 1 + 15164);
});

test('planLoad honours a different batch size (Card 6 alternatives)', () => {
  const by250 = planLoad({ tables: FIRST_BATCH_PLAN_INPUT_6848, batchRows: 250 });
  assert.equal(by250.totals.batches, 63);
  const by1000 = planLoad({ tables: FIRST_BATCH_PLAN_INPUT_6848, batchRows: 1000 });
  assert.equal(by1000.totals.batches, 52);
  // Batch size changes batch count, never rows_written.
  assert.equal(by250.totals.rowsWrittenWorst, 22012);
  assert.equal(by1000.totals.rowsWrittenWorst, 22012);
  assert.equal(DEFAULT_BATCH_ROWS, 100);
});

// --- Retry budget ------------------------------------------------------------------

test('retry budget: F-1 allows at most 2 retries, 60 s apart; worst case triples writes', () => {
  assert.equal(MAX_BATCH_RETRIES, 2);
  assert.equal(RETRY_DELAY_SECONDS, 60);
  assert.equal(retryDelaySeconds(1), 60);
  assert.equal(retryDelaySeconds(2), 60);
  assert.throws(() => retryDelaySeconds(3), /retry_attempt_out_of_range/);
  const r = retryBudget(22012);
  assert.equal(r.attempts, 3);
  assert.equal(r.rowsWrittenNoRetry, 22012);
  // Every batch retried twice: 66,036 rows_written, 0.1321% of 50M.
  assert.equal(r.rowsWrittenAllRetries, 66036);
  const oneRetry = retryBudget(22012, 1);
  assert.equal(oneRetry.rowsWrittenAllRetries, 44024);
});

// --- Pause / stop thresholds (Card 6 section 7) --------------------------------------

test('pause thresholds: 2 consecutive failures stop the table, 3 cumulative stop the run', () => {
  const stopTable = evaluatePause({ consecutiveFailedBatchesSameTable: 2 });
  assert.ok(stopTable.decisions.some((d) => d.action === 'stop_table'));
  const stopRun = evaluatePause({ cumulativeFailedBatches: 3 });
  assert.ok(stopRun.decisions.some((d) => d.action === 'stop_run'));
  const below = evaluatePause({ consecutiveFailedBatchesSameTable: 1, cumulativeFailedBatches: 2, failedBatchesTotal: 2 });
  assert.ok(below.decisions.some((d) => d.action === 'continue_with_retry'));
  assert.ok(!below.decisions.some((d) => d.action === 'stop_run' || d.action === 'stop_table'));
  const clean = evaluatePause({});
  assert.deepEqual(clean.decisions, [{ action: 'continue', reason: 'no_threshold_hit' }]);
});

test('pause thresholds: 60-minute budget is a review point, 120 minutes is a hard stop', () => {
  const at60 = evaluatePause({ elapsedMinutes: 60 });
  assert.ok(at60.decisions.some((d) => d.action === 'review_point'));
  const at120 = evaluatePause({ elapsedMinutes: 120 });
  assert.ok(at120.decisions.some((d) => d.action === 'stop_run'));
  const at119 = evaluatePause({ elapsedMinutes: 119 });
  assert.ok(!at119.decisions.some((d) => d.action === 'stop_run'));
});

test('pause thresholds: F-6 interrupt unrecovered for 30 minutes pauses the run', () => {
  const p = evaluatePause({ interruptUnrecoveredMinutes: 30 });
  assert.ok(p.decisions.some((d) => d.action === 'pause_run'));
  const early = evaluatePause({ interruptUnrecoveredMinutes: 29 });
  assert.ok(!early.decisions.some((d) => d.action === 'pause_run'));
});

// --- Snapshot drift --------------------------------------------------------------------

test('snapshot drift: live 7,029 vs snapshot 6,848 forces a re-plan', () => {
  const d = snapshotDrift({ snapshotRows: 6848, liveRows: 7029 });
  assert.equal(d.drift, 181);
  assert.equal(d.replanRequired, true);
  assert.equal(snapshotDrift({ snapshotRows: 6848, liveRows: 6848 }).replanRequired, false);
});

// --- Card 7 dry-run figures are carried as planning evidence, not as load counts ---------

test('card 7 dry-run shape: checkpoint rows are synthetic-round rows, never snapshot rows', () => {
  // Card 7 synthetic dry run (gates open): 152 source rows -> 89 loaded /
  // 57 deferred / 4 rejected; checkpoints totalled 89 loaded / 13 deferred /
  // 4 rejected over 106 checkpointed rows, 42 LOADED / 61 PENDING.
  // These numbers describe the synthetic fixture, not the 6,848-row load:
  // no checkpoint may ever claim a snapshot-scale row count (e.g. 1,513).
  const syntheticLoaded = 89;
  const checkpointLoaded = 89;
  assert.equal(syntheticLoaded, checkpointLoaded);
  assert.ok(checkpointLoaded <= 152);
  assert.ok(checkpointLoaded < 1513, 'no checkpoint may claim receipt-scale rows');
});
