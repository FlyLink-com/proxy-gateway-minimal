import Database from "better-sqlite3";
import { isAbsolute } from "node:path";
import {
  OPERATIONS_DEFAULT_SPAN_MS as DEFAULT_SPAN_MS,
  parseUtcWindowPair,
  readUtcInstant
} from "./admin-operations-window.mjs";
import { createOperationsReadEnvelope } from "./operations-read-envelope.mjs";

const DELIBERATE = Symbol("admin-recharge-confirmation-gross");
const CURRENCY = /^[A-Z]{3}$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;
const SAFE_MAX = BigInt(Number.MAX_SAFE_INTEGER);
const SCHEMA_VERSION = "operations-recharge-confirmation-gross/v1";
const DEFINITION = "first_confirmed_charge_in_window";

// First confirmation is the earliest qualifying receipt by accepted_at, then
// receipt_ref. SQLite walks platform_payment_receipts_order_accepted_idx for
// that pass. verification_result, canonical_state, and charge_certainty are
// residual filters, not index keys. This read does not add an index or change
// payment DDL.
//
// Confirmation timestamps use readUtcInstant, the same calendar rule as the
// query window. SQLite strftime rolls some impossible days and keeps hour 24,
// so a shape or strftime round-trip is not enough. Every qualifying receipt is
// checked, including receipts outside the requested window.
const CONFIRMATION_ACCEPTED_AT_SQL = `
  select distinct accepted_at
    from platform_payment_receipts
   where verification_result = 'verified'
     and canonical_state = 'payment_succeeded'
     and charge_certainty = 'confirmed_charged'
`;
const READ_CTE = `
  with qualifying as (
    select r.payment_order_ref as payment_order_ref,
           r.receipt_ref as receipt_ref,
           r.accepted_at as accepted_at,
           r.amount_minor as receipt_amount_minor,
           r.currency as receipt_currency,
           r.currency_exponent as receipt_currency_exponent,
           o.amount_minor as order_amount_minor,
           o.currency as order_currency,
           o.currency_exponent as order_currency_exponent,
           o.status as order_status
      from platform_payment_receipts r
      inner join platform_payment_orders o
        on o.payment_order_ref = r.payment_order_ref
     where r.verification_result = 'verified'
       and r.canonical_state = 'payment_succeeded'
       and r.charge_certainty = 'confirmed_charged'
  ),
  first_at as (
    select payment_order_ref, min(accepted_at) as accepted_at
      from qualifying
     group by payment_order_ref
  ),
  first_ref as (
    select q.payment_order_ref as payment_order_ref,
           min(q.receipt_ref) as receipt_ref
      from qualifying q
      inner join first_at f
        on f.payment_order_ref = q.payment_order_ref
       and f.accepted_at = q.accepted_at
     group by q.payment_order_ref
  ),
  firsts as (
    select q.payment_order_ref as payment_order_ref,
           q.accepted_at as accepted_at,
           q.order_amount_minor as order_amount_minor,
           q.order_currency as order_currency,
           q.order_currency_exponent as order_currency_exponent,
           q.order_status as order_status
      from qualifying q
      inner join first_ref f
        on f.payment_order_ref = q.payment_order_ref
       and f.receipt_ref = q.receipt_ref
  ),
  in_window as (
    select payment_order_ref,
           accepted_at,
           order_amount_minor,
           order_currency,
           order_currency_exponent,
           order_status
      from firsts
     where accepted_at >= ? and accepted_at < ?
  )
`;

const FLAGS_SQL = `
  ${READ_CTE}
  select
    cast((
      select count(*)
        from qualifying q
        inner join in_window w
          on w.payment_order_ref = q.payment_order_ref
       where q.receipt_amount_minor <> q.order_amount_minor
          or q.receipt_currency <> q.order_currency
          or q.receipt_currency_exponent <> q.order_currency_exponent
    ) as text) as mismatch_count,
    cast((
      select count(*)
        from in_window
       where order_status not in (
         'payment_verified', 'credited', 'reconciliation_required'
       )
    ) as text) as contradictory_count,
    cast((
      select count(*)
        from in_window
       where order_status = 'reconciliation_required'
    ) as text) as excluded_count
`;

export const RECHARGE_CONFIRMATION_GROSS_GROUP_SQL = `
  ${READ_CTE}
  select order_currency as currency,
         order_currency_exponent as currency_exponent,
         cast(count(*) as text) as confirmed_charge_count,
         cast(sum(order_amount_minor) as text) as gross_minor_total
    from in_window
   where order_status in ('payment_verified', 'credited')
   group by order_currency, order_currency_exponent
   order by order_currency asc, order_currency_exponent asc
`;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  error[DELIBERATE] = true;
  throw error;
}

function parseQuery(input) {
  return parseUtcWindowPair(input, fail);
}

function readClock(nowFn) {
  if (typeof nowFn !== "function") fail("source_unavailable");
  let value;
  try {
    value = nowFn();
  } catch {
    fail("source_unavailable");
  }
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) fail("source_unavailable");
  const iso = date.toISOString();
  if (new Date(iso).toISOString() !== iso) fail("source_unavailable");
  return date;
}

function defaultWindow(now) {
  return {
    from: new Date(now.getTime() - DEFAULT_SPAN_MS).toISOString(),
    to: now.toISOString()
  };
}

function validPath(value) {
  return typeof value === "string"
    && isAbsolute(value)
    && !value.includes("\0")
    && !/^[a-z][a-z\d+.-]*:/i.test(value.replace(/^[a-z]:[\\/]/i, ""));
}

function tableReady(db, name) {
  return Boolean(db.prepare(
    "select 1 as present from sqlite_master where type = 'table' and name = ?"
  ).get(name));
}

function requireTables(db) {
  if (!tableReady(db, "platform_payment_orders") || !tableReady(db, "platform_payment_receipts")) {
    fail("source_unavailable");
  }
}

function readSafeTotal(value, { minimum }) {
  if (typeof value !== "string" || !DECIMAL.test(value)) fail("source_unavailable");
  let parsed;
  try {
    parsed = BigInt(value);
  } catch {
    fail("source_unavailable");
  }
  if (parsed < minimum || parsed > SAFE_MAX) fail("source_unavailable");
  const number = Number(parsed);
  if (!Number.isSafeInteger(number)) fail("source_unavailable");
  return number;
}

function assertConfirmationTimes(db) {
  const timestamps = db.prepare(CONFIRMATION_ACCEPTED_AT_SQL).pluck().all();
  for (const value of timestamps) {
    if (readUtcInstant(value) !== value) fail("source_unavailable");
  }
}

function readAggregate(db, window) {
  requireTables(db);
  const run = db.transaction(() => {
    assertConfirmationTimes(db);
    const flags = db.prepare(FLAGS_SQL).get(window.from, window.to);
    const mismatches = readSafeTotal(flags?.mismatch_count, { minimum: 0n });
    const contradictory = readSafeTotal(flags?.contradictory_count, { minimum: 0n });
    if (mismatches > 0 || contradictory > 0) fail("source_unavailable");
    const excluded = readSafeTotal(flags?.excluded_count, { minimum: 0n });
    const rows = db.prepare(RECHARGE_CONFIRMATION_GROSS_GROUP_SQL).all(window.from, window.to);
    return {
      reconciliationExcludedOrderCount: excluded,
      groups: rows.map((row) => {
        if (!Number.isSafeInteger(row.currency_exponent) || row.currency_exponent < 0 || row.currency_exponent > 9) {
          fail("source_unavailable");
        }
        if (typeof row.currency !== "string" || !CURRENCY.test(row.currency)) fail("source_unavailable");
        return {
          currency: row.currency,
          currencyExponent: row.currency_exponent,
          confirmedChargeCount: readSafeTotal(row.confirmed_charge_count, { minimum: 1n }),
          paymentConfirmationGrossMinorTotal: readSafeTotal(row.gross_minor_total, { minimum: 1n })
        };
      })
    };
  });
  return run();
}

function envelope(result, window, generatedAt) {
  const partial = result.reconciliationExcludedOrderCount > 0;
  return createOperationsReadEnvelope({
    schemaVersion: SCHEMA_VERSION,
    freshness: partial ? "partial" : "fresh",
    sourceState: "implemented_source",
    data: {
      definition: DEFINITION,
      window: {
        from: window.from,
        to: window.to,
        bound: "[from, to)",
        timeField: "accepted_at"
      },
      confirmedCharges: {
        amountMeaning: "payment_confirmation_gross_minor_units",
        groups: result.groups
      },
      reconciliationExcluded: {
        orderCount: result.reconciliationExcludedOrderCount
      }
    },
    warnings: partial ? [{ code: "source_partial" }] : [],
    access: {
      allowed: true,
      capability: "operations.read",
      reasonCode: "allowed"
    }
  }, { nowFn: () => generatedAt });
}

export function createAdminRechargeConfirmationGrossService({
  database,
  dbPath = null,
  nowFn = () => new Date()
} = {}) {
  if (database !== undefined && dbPath !== null && dbPath !== undefined) {
    throw new Error("admin_recharge_confirmation_gross_source_conflict");
  }

  function open() {
    if (database) return { db: database, close() {} };
    if (!validPath(dbPath)) fail("source_unavailable");
    let db;
    try {
      db = new Database(dbPath, { readonly: true, fileMustExist: true, timeout: 5000 });
    } catch {
      fail("source_unavailable");
    }
    return {
      db,
      close() {
        try { db.close(); } catch { /* keep the caller error */ }
      }
    };
  }

  function withDb(fn) {
    const opened = open();
    try {
      opened.db.pragma("foreign_keys = ON");
      opened.db.pragma("busy_timeout = 5000");
      return fn(opened.db);
    } catch (error) {
      if (error?.[DELIBERATE]) throw error;
      fail("source_unavailable");
    } finally {
      opened.close();
    }
  }

  function readGross(input) {
    const explicit = parseQuery(input);
    const generatedAt = readClock(nowFn);
    const window = explicit ?? defaultWindow(generatedAt);
    const result = withDb((db) => readAggregate(db, window));
    return envelope(result, window, generatedAt);
  }

  return { readGross };
}
