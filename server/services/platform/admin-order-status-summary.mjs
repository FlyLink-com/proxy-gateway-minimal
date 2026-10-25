import Database from "better-sqlite3";
import { isAbsolute } from "node:path";
import {
  OPERATIONS_DEFAULT_SPAN_MS as DEFAULT_SPAN_MS,
  parseUtcWindowPair
} from "./admin-operations-window.mjs";
import { createOperationsReadEnvelope } from "./operations-read-envelope.mjs";

const DELIBERATE = Symbol("admin-order-status-summary");
const TOKEN = /^[a-z_]{1,64}$/;
const CURRENCY = /^[A-Z]{3}$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;
const SAFE_MAX = BigInt(Number.MAX_SAFE_INTEGER);
const SCHEMA_VERSION = "operations-order-status-summary/v1";
const DEFINITION = "current_status_of_orders_created_in_window";

// delivery_kind lives on the offer version, not on the order row.
// Neither order table has a created_at index that this window can use.
// This read does not add one: a migration is a separate decision.
const RECHARGE_SQL = `
  select status,
         currency,
         currency_exponent,
         cast(count(*) as text) as order_count,
         cast(sum(amount_minor) as text) as order_amount_minor_total
    from platform_payment_orders
   where created_at >= ? and created_at < ?
   group by status, currency, currency_exponent
   order by status asc, currency asc, currency_exponent asc
`;

const COIN_SQL = `
  select o.payment_status as payment_status,
         v.delivery_kind as delivery_kind,
         cast(count(*) as text) as order_count,
         cast(sum(o.amount_units) as text) as coin_units_total
    from platform_coin_commerce_orders o
    left join platform_coin_commerce_offer_versions v
      on v.offer_version_ref = o.offer_version_ref
   where o.created_at >= ? and o.created_at < ?
   group by o.payment_status, v.delivery_kind
   order by o.payment_status asc, v.delivery_kind asc
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
  if (
    !tableReady(db, "platform_payment_orders")
    || !tableReady(db, "platform_coin_commerce_orders")
    || !tableReady(db, "platform_coin_commerce_offer_versions")
  ) {
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

function readToken(value) {
  if (typeof value !== "string" || !TOKEN.test(value)) fail("source_unavailable");
  return value;
}

function readGroups(db, window) {
  requireTables(db);
  const rechargeRows = db.prepare(RECHARGE_SQL).all(window.from, window.to);
  const coinRows = db.prepare(COIN_SQL).all(window.from, window.to);
  return {
    rechargeGroups: rechargeRows.map((row) => {
      if (!Number.isSafeInteger(row.currency_exponent) || row.currency_exponent < 0 || row.currency_exponent > 9) {
        fail("source_unavailable");
      }
      if (typeof row.currency !== "string" || !CURRENCY.test(row.currency)) fail("source_unavailable");
      return {
        status: readToken(row.status),
        currency: row.currency,
        currencyExponent: row.currency_exponent,
        orderCount: readSafeTotal(row.order_count, { minimum: 1n }),
        orderAmountMinorTotal: readSafeTotal(row.order_amount_minor_total, { minimum: 1n })
      };
    }),
    coinGroups: coinRows.map((row) => ({
      paymentStatus: readToken(row.payment_status),
      deliveryKind: readToken(row.delivery_kind),
      orderCount: readSafeTotal(row.order_count, { minimum: 1n }),
      coinUnitsTotal: readSafeTotal(row.coin_units_total, { minimum: 1n })
    }))
  };
}

function envelope(groups, window, generatedAt) {
  return createOperationsReadEnvelope({
    schemaVersion: SCHEMA_VERSION,
    freshness: "fresh",
    sourceState: "implemented_source",
    data: {
      definition: DEFINITION,
      window: {
        from: window.from,
        to: window.to,
        bound: "[from, to)"
      },
      rechargeOrders: {
        amountMeaning: "order_amount_minor_units",
        groups: groups.rechargeGroups
      },
      coinCommerceOrders: {
        amountMeaning: "coin_units",
        groups: groups.coinGroups
      }
    },
    warnings: [],
    access: {
      allowed: true,
      capability: "operations.read",
      reasonCode: "allowed"
    }
  }, { nowFn: () => generatedAt });
}

export function createAdminOrderStatusSummaryService({
  database,
  dbPath = null,
  nowFn = () => new Date()
} = {}) {
  if (database !== undefined && dbPath !== null && dbPath !== undefined) {
    throw new Error("admin_order_status_summary_source_conflict");
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

  function readSummary(input) {
    const explicit = parseQuery(input);
    const generatedAt = readClock(nowFn);
    const window = explicit ?? defaultWindow(generatedAt);
    const groups = withDb((db) => readGroups(db, window));
    return envelope(groups, window, generatedAt);
  }

  return { readSummary };
}
