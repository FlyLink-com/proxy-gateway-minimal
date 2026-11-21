// d1-card13-import-batch-budget.mjs
//
// Card 13: D1 import batch budget calculator (read-only planning only).
//
// Pure functions, no I/O, no network, no credentials, no D1 calls.
// Inputs: Cloudflare's published D1 limits (verified 2026-11-21, see
// D1_LIMITS below) plus planning metadata from the Card 6 acceptance
// package (6,848 snapshot rows / 50 tables / 103 batches) and the Card 7
// 70-table importer dry run (synthetic rows only). The calculator never
// reads production data and never estimates E4's real on-disk size from
// the historical database's logical size: 6,848 is a planning row count,
// not a storage or write budget. Actual rows_written must be taken from
// the D1 `meta` object of a synthetic / isolated rehearsal run.
//
// Conventions (all in bytes unless stated):
//   - "row" = one logical row inserted into one table.
//   - "rows_written" = Cloudflare billing metric: 1 per table row written
//     + 1 per index entry written (pricing page, definition 6). A trigger
//     that writes to another table would add more; the DDL v1.1 trigger
//     set contains no such trigger (verified by parsing all 55 triggers:
//     34 BEFORE UPDATE, 17 BEFORE DELETE, 4 BEFORE INSERT, all bodies
//     are guard RAISE(ABORT) only), so the trigger write multiplier is 0
//     for the INSERT-only load path. If DDL changes, re-parse and update
//     TRIGGER_WRITES_PER_INSERT.
//   - "rows_read" = Cloudflare billing metric: rows scanned, not rows
//     returned. FK parent lookups are budgeted as 1 row read per FK
//     reference per inserted row (indexed lookup assumption, see gaps).
//   - Checkpoint records are local JSONL (Card 6 section 5.1), never
//     written into E4, so checkpoints cost 0 D1 rows_written / rows_read.

export const D1_LIMITS = Object.freeze({
  sourceLimitsUrl: 'https://developers.cloudflare.com/d1/platform/limits/',
  sourcePricingUrl: 'https://developers.cloudflare.com/d1/platform/pricing/',
  verifiedDate: '2026-11-21',
  // Limits page states dateModified 2026-11-20; pricing page "Updated: 2026-10-30".
  limitsPageModified: '2026-11-20',
  pricingPageUpdated: '2026-10-30',
  maxStatementBytes: 100_000,
  maxRowBytes: 2_000_000,
  maxBindParamsPerQuery: 100,
  maxQuerySeconds: 30,
  maxQueryResultBytes: 50_000_000,
  maxColumnsPerTable: 100,
  maxColumnsPerQueryResult: 100,
  maxDatabaseBytes: 10_000_000_000,
  maxStoragePerAccountBytesPaid: 1_000_000_000_000,
  maxDatabasesPerAccountPaid: 1_000_000,
  maxQueriesPerWorkerInvocationPaid: 1_000,
  maxFileImportBytes: 5_000_000_000,
  timeTravelDaysPaid: 30,
  monthlyRowsReadIncluded: 25_000_000_000,
  monthlyRowsWrittenIncluded: 50_000_000,
  monthlyStorageIncludedBytes: 5_000_000_000,
  overageRowsReadUsdPerMillion: 0.001,
  overageRowsWrittenUsdPerMillion: 1.0,
  overageStorageUsdPerGbMonth: 0.75,
});

// Operational safety margins. These are OUR policy, not Cloudflare's
// limits: the official caps are hard failures, so planning stops short.
export const OPERATIONAL_MARGINS = Object.freeze({
  // Plan statements at most 80% of the official 100,000-byte cap.
  statementCapBytes: 80_000,
  // A batch() call must finish inside 30 s; plan for at most 20 s of
  // measured batch time and split as soon as a rehearsal batch is slower.
  batchSecondsSoftCap: 20,
  // A reconciliation read must stay well under the 50 MB result cap.
  resultBytesSoftCap: 40_000_000,
});

// Card 6 default: 100 rows per batch, never packed across tables, so a
// batch belongs to exactly one table (FK checks and per-table hash).
export const DEFAULT_BATCH_ROWS = 100;
// Card 6 failure class F-1: a failed row's batch is retried at most twice,
// 60 seconds apart; after that the row stays on the failure list for Yi.
export const MAX_BATCH_RETRIES = 2;
export const RETRY_DELAY_SECONDS = 60;
// DDL v1.1 trigger set writes 0 rows on the INSERT-only load path
// (all 55 triggers are BEFORE UPDATE/DELETE/INSERT guards whose bodies
// only RAISE(ABORT); none INSERT/UPDATE/DELETE another table).
export const TRIGGER_WRITES_PER_INSERT = 0;

// ---------------------------------------------------------------------------
// Per-statement row caps
// ---------------------------------------------------------------------------

export function rowsPerStatementByBinds(columnCount) {
  if (!Number.isInteger(columnCount) || columnCount < 1) {
    throw new Error('column_count_invalid');
  }
  if (columnCount > D1_LIMITS.maxColumnsPerTable) {
    throw new Error('column_count_exceeds_table_limit');
  }
  // One INSERT row binds one parameter per column; a statement may bind
  // at most 100 parameters, so floor(100 / columns) rows fit per statement.
  return Math.max(1, Math.floor(D1_LIMITS.maxBindParamsPerQuery / columnCount));
}

// Literal-SQL mode: the statement text itself carries every value, so the
// 100 KB cap binds on bytes. Returns 0 when even one row cannot fit in a
// single literal statement (caller must switch to bound parameters or
// defer the row). maxRowLiteralBytes is the largest single-row literal
// INSERT text for the table, measured from the snapshot (never guessed).
export function rowsPerStatementByBytes(maxRowLiteralBytes, statementCapBytes = OPERATIONAL_MARGINS.statementCapBytes) {
  if (!Number.isFinite(maxRowLiteralBytes) || maxRowLiteralBytes < 1) {
    throw new Error('row_literal_bytes_invalid');
  }
  if (!Number.isFinite(statementCapBytes) || statementCapBytes < 1) {
    throw new Error('statement_cap_invalid');
  }
  return Math.floor(statementCapBytes / maxRowLiteralBytes);
}

// Recommended mode is 'bound': the Card 7 executor interface builds
// parameterised statements (100-param / 100 KB checks), so statement text
// stays small and the bind cap governs. 'literal' mode additionally
// applies the byte cap (for importers that inline VALUES text).
export function rowsPerStatement({ columns, maxRowLiteralBytes = null, mode = 'bound' } = {}) {
  const byBinds = rowsPerStatementByBinds(columns);
  if (mode === 'bound') return byBinds;
  if (mode === 'literal') {
    if (maxRowLiteralBytes === null) throw new Error('literal_mode_needs_row_bytes');
    return Math.min(byBinds, rowsPerStatementByBytes(maxRowLiteralBytes));
  }
  throw new Error('unknown_statement_mode');
}

// A single row over 2,000,000 bytes cannot be stored in D1 at all
// (string / BLOB / row cap). Card 6 failure class F-5: defer the row,
// never truncate it, never split one row across statements.
export function classifyRow(rowBytes) {
  if (!Number.isFinite(rowBytes) || rowBytes < 0) throw new Error('row_bytes_invalid');
  if (rowBytes > D1_LIMITS.maxRowBytes) {
    return { verdict: 'defer', reason: 'row_exceeds_2mb', code: 'F-5' };
  }
  return { verdict: 'loadable', reason: null, code: null };
}

// ---------------------------------------------------------------------------
// Per-table and whole-load planning
// ---------------------------------------------------------------------------

// indexes: total indexes on the table (DDL v1.1 count, all columns written
// by an INSERT). partialIndexes: subset whose WHERE predicate must match
// for an index entry to be written. Worst case assumes every partial
// index matches every row; the non-partial figure is the floor. The true
// figure needs the real predicate-match shares, which only the execution
// snapshot can supply (see gaps in the Card 13 report).
export function planTable({ table, rows, columns, indexes = 0, partialIndexes = 0, foreignKeys = 0, batchRows = DEFAULT_BATCH_ROWS } = {}) {
  if (typeof table !== 'string' || table.length === 0) throw new Error('table_invalid');
  if (!Number.isInteger(rows) || rows < 0) throw new Error('rows_invalid');
  if (!Number.isInteger(indexes) || indexes < 0 || partialIndexes < 0 || partialIndexes > indexes) {
    throw new Error('index_count_invalid');
  }
  if (!Number.isInteger(foreignKeys) || foreignKeys < 0) throw new Error('foreign_key_count_invalid');
  if (!Number.isInteger(batchRows) || batchRows < 1) throw new Error('batch_rows_invalid');
  const rowsPerStmt = rowsPerStatement({ columns });
  const batches = Math.ceil(rows / batchRows);
  const statementsPerBatch = Math.ceil(batchRows / rowsPerStmt);
  const statementsTotal = batches * statementsPerBatch;
  // Pricing definition 6: one table row + one index entry per index whose
  // indexed column is written. INSERT writes every column, so every
  // non-partial index adds 1; a partial index adds 1 only when its
  // predicate matches (worst case: always).
  const rowsWrittenWorst = rows * (1 + indexes + TRIGGER_WRITES_PER_INSERT);
  const rowsWrittenNonPartial = rows * (1 + (indexes - partialIndexes) + TRIGGER_WRITES_PER_INSERT);
  // FK parent lookups: 1 row read per FK reference per inserted row,
  // assuming D1 enforces FKs via indexed parent lookups.
  const fkParentLookups = rows * foreignKeys;
  return Object.freeze({
    table, rows, columns, indexes, partialIndexes, foreignKeys, batchRows,
    rowsPerStatement: rowsPerStmt, batches, statementsPerBatch, statementsTotal,
    rowsWrittenWorst, rowsWrittenNonPartial, fkParentLookups,
  });
}

export function planLoad({ tables, batchRows = DEFAULT_BATCH_ROWS } = {}) {
  if (!Array.isArray(tables) || tables.length === 0) throw new Error('tables_invalid');
  const plans = tables.map((t) => planTable({ ...t, batchRows }));
  const sum = (key) => plans.reduce((acc, p) => acc + p[key], 0);
  const totals = Object.freeze({
    tables: plans.length,
    rows: sum('rows'),
    batches: sum('batches'),
    statementsTotal: sum('statementsTotal'),
    rowsWrittenWorst: sum('rowsWrittenWorst'),
    rowsWrittenNonPartial: sum('rowsWrittenNonPartial'),
    fkParentLookups: sum('fkParentLookups'),
    // E4-side reconciliation reads (Card 6 section 6): one COUNT + one
    // full-row hash read per table on the E4 side. Source-side reads hit
    // BWH SQLite, not D1, so they are not billed here.
    reconciliationRowsReadE4: sum('rows') * 2,
  });
  const rowsReadPlanningBound = totals.fkParentLookups + totals.reconciliationRowsReadE4;
  return Object.freeze({
    plans, totals,
    monthlyShare: Object.freeze({
      rowsWrittenWorstPct: (totals.rowsWrittenWorst / D1_LIMITS.monthlyRowsWrittenIncluded) * 100,
      rowsWrittenNonPartialPct: (totals.rowsWrittenNonPartial / D1_LIMITS.monthlyRowsWrittenIncluded) * 100,
      rowsReadPlanningBoundPct: (rowsReadPlanningBound / D1_LIMITS.monthlyRowsReadIncluded) * 100,
    }),
    rowsReadPlanningBound,
  });
}

// ---------------------------------------------------------------------------
// Retries, duration, result size, storage
// ---------------------------------------------------------------------------

// Card 6 F-1: at most 2 retries, 60 s apart. A batch() is atomic: any
// statement failing rolls the whole sequence back, so a retried batch
// re-writes every row in it. Whether Cloudflare meters rolled-back
// writes is undocumented; the budget conservatively assumes retried rows
// count in full (see gaps).
export function retryBudget(rowsWritten, maxRetries = MAX_BATCH_RETRIES) {
  if (!Number.isFinite(rowsWritten) || rowsWritten < 0) throw new Error('rows_written_invalid');
  if (!Number.isInteger(maxRetries) || maxRetries < 0) throw new Error('max_retries_invalid');
  return Object.freeze({
    attempts: 1 + maxRetries,
    rowsWrittenNoRetry: rowsWritten,
    rowsWrittenAllRetries: rowsWritten * (1 + maxRetries),
  });
}

export function retryDelaySeconds(attempt) {
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > MAX_BATCH_RETRIES) {
    throw new Error('retry_attempt_out_of_range');
  }
  return RETRY_DELAY_SECONDS;
}

// The 30 s cap covers the whole batch() call (limits page footnote 3).
// A batch that slow must be SPLIT and re-run smaller, never retried as-is
// (Card 6 section 4.2). Duration is a measured value from rehearsal;
// this function only classifies it, it cannot predict it.
export function checkBatchDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('seconds_invalid');
  if (seconds >= D1_LIMITS.maxQuerySeconds) {
    return { verdict: 'split_batch', reason: 'batch_exceeds_30s', retryAsIs: false };
  }
  if (seconds >= OPERATIONAL_MARGINS.batchSecondsSoftCap) {
    return { verdict: 'split_batch', reason: 'batch_over_20s_soft_cap', retryAsIs: false };
  }
  return { verdict: 'ok', reason: null, retryAsIs: true };
}

// Query results over 50 MB fail (in force since 2026-11-04). Applies to
// reconciliation reads, not to writes.
export function checkResultSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) throw new Error('bytes_invalid');
  if (bytes > D1_LIMITS.maxQueryResultBytes) {
    return { verdict: 'fail', reason: 'result_exceeds_50mb', splitReads: true };
  }
  if (bytes > OPERATIONAL_MARGINS.resultBytesSoftCap) {
    return { verdict: 'split_reads', reason: 'result_over_40mb_soft_cap', splitReads: true };
  }
  return { verdict: 'ok', reason: null, splitReads: false };
}

export function checkStorage(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) throw new Error('bytes_invalid');
  return Object.freeze({
    withinSingleDbLimit: bytes <= D1_LIMITS.maxDatabaseBytes,
    withinIncludedStorage: bytes <= D1_LIMITS.monthlyStorageIncludedBytes,
    overageGbMonth: Math.max(0, bytes - D1_LIMITS.monthlyStorageIncludedBytes) / 1_000_000_000,
  });
}

// ---------------------------------------------------------------------------
// Pause / stop thresholds (Card 6 section 7, failure classes F-1..F-7)
// ---------------------------------------------------------------------------

export const STOP_THRESHOLDS = Object.freeze({
  // Same table, 2 consecutive F-2 batches -> stop that table.
  consecutiveFailedBatchesSameTable: 2,
  // Whole run, 3 cumulative F-2 batches -> stop the run.
  cumulativeFailedBatchesRun: 3,
  // 120 minutes without finishing -> hard review point, stop and review.
  runMinutesHardReview: 120,
  // Total run window budget (writes + reconciliation + receipts).
  runMinutesBudget: 60,
  // F-6 interrupt unrecovered after 30 minutes -> pause, Yi confirms reschedule.
  interruptUnrecoveredMinutes: 30,
});

export function evaluatePause({
  consecutiveFailedBatchesSameTable = 0,
  cumulativeFailedBatches = 0,
  failedBatchesTotal = 0,
  elapsedMinutes = 0,
  interruptUnrecoveredMinutes = 0,
} = {}) {
  const decisions = [];
  if (consecutiveFailedBatchesSameTable >= STOP_THRESHOLDS.consecutiveFailedBatchesSameTable) {
    decisions.push({ action: 'stop_table', reason: 'F-2_same_table_2_consecutive' });
  }
  if (cumulativeFailedBatches >= STOP_THRESHOLDS.cumulativeFailedBatchesRun) {
    decisions.push({ action: 'stop_run', reason: 'F-2_cumulative_3_batches' });
  }
  if (elapsedMinutes >= STOP_THRESHOLDS.runMinutesHardReview) {
    decisions.push({ action: 'stop_run', reason: 'run_over_120min_hard_review' });
  } else if (elapsedMinutes >= STOP_THRESHOLDS.runMinutesBudget) {
    decisions.push({ action: 'review_point', reason: 'run_over_60min_budget' });
  }
  if (interruptUnrecoveredMinutes >= STOP_THRESHOLDS.interruptUnrecoveredMinutes) {
    decisions.push({ action: 'pause_run', reason: 'F-6_interrupt_unrecovered_30min' });
  }
  if (failedBatchesTotal > 0 && decisions.length === 0) {
    decisions.push({ action: 'continue_with_retry', reason: 'failures_below_threshold' });
  }
  if (decisions.length === 0) decisions.push({ action: 'continue', reason: 'no_threshold_hit' });
  return Object.freeze({ decisions: Object.freeze(decisions) });
}

// Snapshot drift guard (Card 6 section 1.4): the 6,848-row snapshot is
// stale the moment production keeps writing (live was already 7,029 on
// 2026-11-20). Any drift means re-plan from a fresh snapshot; never load
// from the old counts.
export function snapshotDrift({ snapshotRows, liveRows }) {
  if (!Number.isInteger(snapshotRows) || !Number.isInteger(liveRows) || snapshotRows < 0 || liveRows < 0) {
    throw new Error('snapshot_rows_invalid');
  }
  const drift = liveRows - snapshotRows;
  return Object.freeze({
    snapshotRows, liveRows, drift,
    replanRequired: drift !== 0,
    reason: drift === 0 ? null : 'snapshot_stale_replan_from_fresh_snapshot',
  });
}

// ---------------------------------------------------------------------------
// Card 6 first-batch planning input (snapshot phase8a-20261118T134920Z).
// Row counts: CARD6 sections 1.2/1.3. Column counts: DDL v1.1 parsed
// (evidence/candidate-51-parsed.json, 51 tables / 570 columns). Index
// counts: DDL v1.1 parsed (70 CREATE INDEX, 9 partial). FK counts:
// inline REFERENCES + table-level FOREIGN KEY (70 total in DDL; 68 on
// these 50 tables, the other 2 sit on tables outside the first batch).
// ---------------------------------------------------------------------------

export const FIRST_BATCH_PLAN_INPUT_6848 = Object.freeze([
  { table: 'platform_edge_apply_receipts', rows: 1513, columns: 21, indexes: 4, partialIndexes: 1, foreignKeys: 0 },
  { table: 'platform_portal_sessions', rows: 1196, columns: 9, indexes: 2, partialIndexes: 0, foreignKeys: 2 },
  { table: 'platform_portal_edge_credentials', rows: 714, columns: 5, indexes: 2, partialIndexes: 0, foreignKeys: 1 },
  { table: 'platform_edge_desired_state_notifications', rows: 346, columns: 9, indexes: 3, partialIndexes: 0, foreignKeys: 0 },
  { table: 'platform_audit_events', rows: 201, columns: 7, indexes: 1, partialIndexes: 0, foreignKeys: 0 },
  { table: 'platform_coin_commerce_quotes', rows: 197, columns: 15, indexes: 1, partialIndexes: 0, foreignKeys: 2 },
  { table: 'platform_usage_rollups', rows: 186, columns: 10, indexes: 2, partialIndexes: 0, foreignKeys: 3 },
  { table: 'platform_entitlements', rows: 184, columns: 11, indexes: 2, partialIndexes: 0, foreignKeys: 1 },
  { table: 'platform_coin_ledger_entries', rows: 155, columns: 16, indexes: 3, partialIndexes: 0, foreignKeys: 4 },
  { table: 'platform_issuance_requests', rows: 144, columns: 12, indexes: 3, partialIndexes: 0, foreignKeys: 2 },
  { table: 'platform_issued_subscription_links', rows: 144, columns: 7, indexes: 2, partialIndexes: 0, foreignKeys: 1 },
  { table: 'platform_portal_access_requests', rows: 144, columns: 26, indexes: 3, partialIndexes: 0, foreignKeys: 0 },
  { table: 'platform_quota_counters', rows: 144, columns: 6, indexes: 0, partialIndexes: 0, foreignKeys: 2 },
  { table: 'platform_coin_commerce_order_events', rows: 138, columns: 7, indexes: 1, partialIndexes: 0, foreignKeys: 1 },
  { table: 'platform_coin_operation_receipts', rows: 135, columns: 14, indexes: 1, partialIndexes: 0, foreignKeys: 1 },
  { table: 'platform_payment_receipts', rows: 129, columns: 21, indexes: 1, partialIndexes: 0, foreignKeys: 1 },
  { table: 'platform_payment_orders', rows: 123, columns: 22, indexes: 1, partialIndexes: 0, foreignKeys: 1 },
  { table: 'platform_referral_touches', rows: 110, columns: 4, indexes: 0, partialIndexes: 0, foreignKeys: 1 },
  { table: 'platform_coin_commerce_plan_switch_quotes', rows: 107, columns: 15, indexes: 0, partialIndexes: 0, foreignKeys: 2 },
  { table: 'platform_portal_second_factor_challenges', rows: 105, columns: 10, indexes: 2, partialIndexes: 0, foreignKeys: 1 },
  { table: 'platform_accounts', rows: 77, columns: 5, indexes: 1, partialIndexes: 0, foreignKeys: 0 },
  { table: 'platform_portal_password_credentials', rows: 75, columns: 11, indexes: 2, partialIndexes: 0, foreignKeys: 1 },
  { table: 'platform_usage_counter_cursors', rows: 68, columns: 8, indexes: 0, partialIndexes: 0, foreignKeys: 0 },
  { table: 'platform_coin_credit_origins', rows: 46, columns: 9, indexes: 0, partialIndexes: 0, foreignKeys: 3 },
  { table: 'platform_coin_lots', rows: 46, columns: 18, indexes: 1, partialIndexes: 1, foreignKeys: 2 },
  { table: 'platform_coin_hold_allocations', rows: 44, columns: 6, indexes: 1, partialIndexes: 0, foreignKeys: 2 },
  { table: 'platform_coin_commerce_fulfillment_commands', rows: 34, columns: 12, indexes: 1, partialIndexes: 0, foreignKeys: 2 },
  { table: 'platform_coin_commerce_fulfillment_receipts', rows: 34, columns: 6, indexes: 1, partialIndexes: 0, foreignKeys: 1 },
  { table: 'platform_coin_commerce_operation_receipts', rows: 34, columns: 11, indexes: 1, partialIndexes: 0, foreignKeys: 1 },
  { table: 'platform_coin_commerce_orders', rows: 34, columns: 12, indexes: 2, partialIndexes: 2, foreignKeys: 4 },
  { table: 'platform_coin_holds', rows: 34, columns: 9, indexes: 1, partialIndexes: 1, foreignKeys: 1 },
  { table: 'platform_coin_wallets', rows: 33, columns: 6, indexes: 1, partialIndexes: 0, foreignKeys: 1 },
  { table: 'platform_payment_orders_legacy_archive_20260803', rows: 33, columns: 28, indexes: 3, partialIndexes: 0, foreignKeys: 0 },
  { table: 'platform_portal_registration_welcome_coin_grants', rows: 29, columns: 21, indexes: 1, partialIndexes: 0, foreignKeys: 1 },
  { table: 'platform_referral_bindings', rows: 27, columns: 4, indexes: 1, partialIndexes: 0, foreignKeys: 3 },
  { table: 'platform_referral_events', rows: 14, columns: 5, indexes: 0, partialIndexes: 0, foreignKeys: 1 },
  { table: 'platform_referral_accruals', rows: 12, columns: 9, indexes: 0, partialIndexes: 0, foreignKeys: 2 },
  { table: 'platform_referral_origins', rows: 12, columns: 8, indexes: 1, partialIndexes: 0, foreignKeys: 4 },
  { table: 'platform_schema_migrations', rows: 12, columns: 3, indexes: 0, partialIndexes: 0, foreignKeys: 0 },
  { table: 'platform_referral_profiles', rows: 10, columns: 4, indexes: 0, partialIndexes: 0, foreignKeys: 1 },
  { table: 'platform_portal_subscription_link_resets', rows: 6, columns: 10, indexes: 2, partialIndexes: 1, foreignKeys: 1 },
  { table: 'platform_coin_commerce_offer_versions', rows: 3, columns: 24, indexes: 2, partialIndexes: 2, foreignKeys: 0 },
  { table: 'platform_edge_agent_leases', rows: 3, columns: 10, indexes: 3, partialIndexes: 0, foreignKeys: 0 },
  { table: 'platform_scheduled_plan_switches', rows: 3, columns: 11, indexes: 1, partialIndexes: 1, foreignKeys: 2 },
  { table: 'platform_edge_desired_states', rows: 3, columns: 13, indexes: 2, partialIndexes: 0, foreignKeys: 0 },
  { table: 'platform_edge_desired_state_channels', rows: 3, columns: 2, indexes: 1, partialIndexes: 0, foreignKeys: 1 },
  { table: 'platform_coin_commerce_initial_confirmations', rows: 1, columns: 17, indexes: 0, partialIndexes: 0, foreignKeys: 7 },
  { table: 'platform_edge_registered_nodes', rows: 1, columns: 13, indexes: 2, partialIndexes: 0, foreignKeys: 0 },
  { table: 'platform_portal_totp_credentials', rows: 1, columns: 9, indexes: 2, partialIndexes: 0, foreignKeys: 1 },
  { table: 'platform_referral_policies', rows: 1, columns: 5, indexes: 0, partialIndexes: 0, foreignKeys: 0 },
]);

export function planFirstBatch6848() {
  return planLoad({ tables: FIRST_BATCH_PLAN_INPUT_6848 });
}
