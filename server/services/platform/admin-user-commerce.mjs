import { randomBytes } from "node:crypto";
import Database from "better-sqlite3";
import { isAbsolute } from "node:path";
import { digest, policySnapshot } from "./portal-referral-contract.mjs";
import { validatePortalReferralSchema } from "./portal-referral-migrations.mjs";
import { createPortalReferralService } from "./portal-referral-service.mjs";
import { reverseReferralReward } from "./portal-referral-wallet.mjs";

const DELIBERATE = Symbol("admin-user-commerce");
const ACCOUNT = /^[A-Za-z0-9_-]{1,64}$/;
const REF = /^[A-Za-z0-9_-]{1,64}$/;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const STATUS = /^[a-z_]{1,32}$/;
const LABEL = /^[^\u0000-\u001f\u007f]{1,32}$/;
const COINS = /^[1-9]\d{0,11}$/;
const STORED_TIME = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{3}))?Z$/;
const MAX_SPAN_DAYS = 366;
const MAX_ROWS = 100;
const LINK_LABEL = "当前链接";
const LEDGER_OPERATIONS = Object.freeze([
  "credit",
  "pending_to_reversed",
  "available_to_reversed",
  "held_to_consumed",
  "available_to_expired",
  "held_to_expired"
]);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  error[DELIBERATE] = true;
  throw error;
}

function plain(value) {
  return Boolean(value)
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function exact(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function daysInMonth(year, month) {
  const lengths = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month !== 2) return lengths[month];
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
}

function readDay(value) {
  if (typeof value !== "string") fail("invalid_query");
  const match = DAY.exec(value);
  if (!match) fail("invalid_query");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) fail("invalid_query");
  return value;
}

function dayNumber(day) {
  const [year, month, date] = day.split("-").map(Number);
  return Date.UTC(year, month - 1, date) / 86400000;
}

function nextDayIso(day) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + 1)).toISOString();
}

function readAccount(value) {
  if (typeof value !== "string" || !ACCOUNT.test(value)) fail("invalid_query");
  return value;
}

function readQuery(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || !exact(input, ["accountId", "from", "to"])) {
    fail("invalid_query");
  }
  const accountId = readAccount(input.accountId);
  const from = readDay(input.from);
  const to = readDay(input.to);
  if (from > to || dayNumber(to) - dayNumber(from) > MAX_SPAN_DAYS) fail("invalid_query");
  return {
    accountId,
    start: `${from}T00:00:00.000Z`,
    end: nextDayIso(to)
  };
}

function readRate(input) {
  if (!plain(input) || !exact(input, ["ratePercent", "effectiveAt"])) fail("invalid_query");
  const percent = input.ratePercent;
  if (typeof percent !== "number" || !Number.isFinite(percent) || Object.is(percent, -0)) fail("invalid_query");
  if (Math.round(percent * 10) !== percent * 10) fail("invalid_query");
  const rateBps = Math.round(percent * 100);
  if (!Number.isSafeInteger(rateBps) || rateBps < 1 || rateBps > 10000) fail("invalid_query");
  return { rateBps, effectiveDay: readDay(input.effectiveAt) };
}

function readClawback(input) {
  if (!plain(input) || !exact(input, ["accountId", "coins", "reason"])) fail("invalid_query");
  const accountId = readAccount(input.accountId);
  if (typeof input.coins !== "string" || !COINS.test(input.coins)) fail("invalid_query");
  if (typeof input.reason !== "string" || !LABEL.test(input.reason)) fail("invalid_query");
  const coins = Number(input.coins);
  if (!Number.isSafeInteger(coins) || coins < 1) fail("invalid_query");
  return { accountId, coins, reason: input.reason };
}

function publicTime(value) {
  if (typeof value !== "string") fail("source_unavailable");
  const match = STORED_TIME.exec(value);
  if (!match) fail("source_unavailable");
  const canonical = match[2] ? value : `${match[1]}.000Z`;
  if (new Date(canonical).toISOString() !== canonical) fail("source_unavailable");
  return `${match[1]}Z`;
}

function publicDay(value) {
  const time = publicTime(value);
  return time.slice(0, 10);
}

function publicRef(value) {
  if (typeof value !== "string" || !REF.test(value)) fail("source_unavailable");
  return value;
}

function publicAccount(value) {
  if (typeof value !== "string" || !ACCOUNT.test(value)) fail("source_unavailable");
  return value;
}

function publicStatus(value) {
  if (typeof value !== "string" || !STATUS.test(value)) fail("source_unavailable");
  return value;
}

function moneyLabel(minor, currency, exponent) {
  if (!Number.isSafeInteger(minor) || minor < 1) fail("source_unavailable");
  if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) fail("source_unavailable");
  if (!Number.isSafeInteger(exponent) || exponent < 0 || exponent > 9) fail("source_unavailable");
  const digits = String(minor);
  const text = exponent === 0
    ? digits
    : digits.length > exponent
      ? `${digits.slice(0, -exponent)}.${digits.slice(-exponent)}`
      : `0.${"0".repeat(exponent - digits.length)}${digits}`;
  const label = `${currency} ${text}`;
  if (!LABEL.test(label)) fail("source_unavailable");
  return label;
}

function coinLabel(units) {
  if (!Number.isSafeInteger(units) || units < 1) fail("source_unavailable");
  const label = `${units} Coins`;
  if (!LABEL.test(label)) fail("source_unavailable");
  return label;
}

function coinText(units) {
  if (!Number.isSafeInteger(units) || units < 1 || String(units).length > 12) fail("source_unavailable");
  return String(units);
}

function tableReady(db, name) {
  return Boolean(db.prepare(
    "select 1 from sqlite_master where type = 'table' and name = ?"
  ).get(name));
}

function validPath(value) {
  return typeof value === "string"
    && isAbsolute(value)
    && !value.includes("\0")
    && !/^[a-z][a-z\d+.-]*:/i.test(value.replace(/^[a-z]:[\\/]/i, ""));
}

function referralReady(db) {
  try {
    return validatePortalReferralSchema(db) === true;
  } catch {
    return false;
  }
}

function loadCurrentPolicy(db, now) {
  if (!referralReady(db)) fail("source_unavailable");
  const row = db.prepare(`
    select policy_json
      from platform_referral_policies
     where effective_at <= ?
     order by effective_at desc
     limit 1
  `).get(now);
  if (!row) fail("source_unavailable");
  try {
    return policySnapshot(JSON.parse(row.policy_json));
  } catch {
    fail("source_unavailable");
  }
}

function availableRewardCoins(db) {
  const units = db.prepare(`
    select coalesce(sum(available_units), 0) as units
      from platform_coin_lots
     where coin_type = 'reward_coins'
       and source_type = 'portal_first_recharge_reward'
       and pending_units = 0
       and available_units > 0
  `).get().units;
  if (!Number.isSafeInteger(units) || units < 0 || String(units).length > 12) fail("source_unavailable");
  return String(units);
}

function settlementFrom(db, policy) {
  const ratePercent = policy.rateBps / 100;
  if (!Number.isFinite(ratePercent) || policy.rateBps % 10 !== 0) fail("source_unavailable");
  return {
    ratePercent,
    effectiveAt: publicDay(policy.effectiveAt),
    availableRewardCoins: availableRewardCoins(db)
  };
}

function ledgerTitle(operation, sourceType) {
  if (operation === "credit") {
    if (sourceType === "verified_payment_capture") return "充值入账";
    if (sourceType === "portal_first_recharge_reward") return "分享奖励";
    if (sourceType === "portal_registration_welcome_bonus") return "注册赠送";
    return "入账";
  }
  if (operation === "pending_to_reversed" || operation === "available_to_reversed") return "奖励划扣";
  if (operation === "held_to_consumed") return "消费扣款";
  return "过期扣减";
}

function constraint(error) {
  return typeof error?.code === "string" && error.code.startsWith("SQLITE_CONSTRAINT");
}

export function createAdminUserCommerceService({
  database,
  dbPath = null,
  nowFn = () => new Date()
} = {}) {
  if (database !== undefined && dbPath !== null && dbPath !== undefined) {
    throw new Error("admin_user_commerce_source_conflict");
  }

  function clock() {
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
    if (!STORED_TIME.test(iso) || new Date(iso).toISOString() !== iso) fail("source_unavailable");
    return iso;
  }

  function open() {
    if (database) return { db: database, close() {} };
    if (!validPath(dbPath)) fail("source_unavailable");
    let db;
    try {
      db = new Database(dbPath, { fileMustExist: true, timeout: 5000 });
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

  function readOrders(input) {
    const query = readQuery(input);
    return withDb((db) => {
      const paymentReady = tableReady(db, "platform_payment_orders");
      const commerceReady = tableReady(db, "platform_coin_commerce_orders")
        && tableReady(db, "platform_coin_commerce_offer_versions");
      if (!paymentReady && !commerceReady) fail("source_unavailable");
      const rows = [];
      if (paymentReady) {
        rows.push(...db.prepare(`
          select payment_order_ref as order_ref, account_id, status,
                 amount_minor, currency, currency_exponent, created_at
            from platform_payment_orders
           where account_id = ?
             and created_at >= ?
             and created_at < ?
           order by created_at desc, payment_order_ref desc
           limit 101
        `).all(query.accountId, query.start, query.end).map((row) => ({
          orderRef: publicRef(row.order_ref),
          accountId: publicAccount(row.account_id),
          kind: "recharge",
          status: publicStatus(row.status),
          amountLabel: moneyLabel(row.amount_minor, row.currency, row.currency_exponent),
          createdAt: publicTime(row.created_at),
          sortAt: row.created_at
        })));
      }
      if (commerceReady) {
        rows.push(...db.prepare(`
          select o.order_ref, o.account_id, o.payment_status, o.amount_units, o.created_at
            from platform_coin_commerce_orders o
            join platform_coin_commerce_offer_versions v
              on v.offer_version_ref = o.offer_version_ref
           where o.account_id = ?
             and v.delivery_kind = 'subscription_plan'
             and o.created_at >= ?
             and o.created_at < ?
           order by o.created_at desc, o.order_ref desc
           limit 101
        `).all(query.accountId, query.start, query.end).map((row) => ({
          orderRef: publicRef(row.order_ref),
          accountId: publicAccount(row.account_id),
          kind: "subscription",
          status: publicStatus(row.payment_status),
          amountLabel: coinLabel(row.amount_units),
          createdAt: publicTime(row.created_at),
          sortAt: row.created_at
        })));
      }
      if (rows.length > MAX_ROWS) fail("conflict");
      rows.sort((left, right) => {
        if (left.sortAt === right.sortAt) return left.orderRef < right.orderRef ? 1 : -1;
        return left.sortAt < right.sortAt ? 1 : -1;
      });
      return rows.map(({ sortAt, ...row }) => row);
    });
  }

  function readLedger(input) {
    const query = readQuery(input);
    return withDb((db) => {
      if (!tableReady(db, "platform_coin_wallets") || !tableReady(db, "platform_coin_ledger_entries")) {
        fail("source_unavailable");
      }
      const placeholders = LEDGER_OPERATIONS.map(() => "?").join(", ");
      const rows = db.prepare(`
        select e.entry_ref, w.account_id, e.occurred_at, e.operation, e.amount_units, e.source_type
          from platform_coin_ledger_entries e
          join platform_coin_wallets w on w.wallet_ref = e.wallet_ref
         where w.account_id = ?
           and e.occurred_at >= ?
           and e.occurred_at < ?
           and e.operation in (${placeholders})
         order by e.occurred_at desc, e.entry_ref desc
         limit 101
      `).all(query.accountId, query.start, query.end, ...LEDGER_OPERATIONS);
      if (rows.length > MAX_ROWS) fail("conflict");
      return rows.map((row) => ({
        entryRef: publicRef(row.entry_ref),
        accountId: publicAccount(row.account_id),
        occurredAt: publicTime(row.occurred_at),
        direction: row.operation === "credit" ? "credit" : "debit",
        title: ledgerTitle(row.operation, row.source_type),
        coins: coinText(row.amount_units)
      }));
    });
  }

  function readShareUsers(input) {
    const query = readQuery(input);
    return withDb((db) => {
      if (!referralReady(db)) fail("source_unavailable");
      const rows = db.prepare(`
        select b.account_id, b.registered_at,
               exists(
                 select 1 from platform_referral_origins o
                  where o.account_id = b.account_id
               ) as first_recharge
          from platform_referral_bindings b
         where b.referrer_id = ?
           and b.registered_at >= ?
           and b.registered_at < ?
         order by b.registered_at desc, b.account_id desc
         limit 101
      `).all(query.accountId, query.start, query.end);
      if (rows.length > MAX_ROWS) fail("conflict");
      return rows.map((row) => ({
        accountId: publicAccount(row.account_id),
        registeredAt: publicTime(row.registered_at),
        linkLabel: LINK_LABEL,
        firstRecharge: row.first_recharge === 1
      }));
    });
  }

  function readSettlement() {
    return withDb((db) => settlementFrom(db, loadCurrentPolicy(db, clock())));
  }

  function updateRate(input) {
    const rate = readRate(input);
    return withDb((db) => {
      const now = clock();
      const current = loadCurrentPolicy(db, now);
      const effectiveAt = `${rate.effectiveDay}T00:00:00.000Z`;
      if (effectiveAt < now) fail("conflict");
      const maxVersion = db.prepare(`
        select max(version) as version
          from platform_referral_policies
         where policy_ref = ?
      `).get(current.policyRef).version;
      if (!Number.isSafeInteger(maxVersion) || maxVersion < 1 || !Number.isSafeInteger(maxVersion + 1)) {
        fail("source_unavailable");
      }
      const next = {
        policyRef: current.policyRef,
        version: maxVersion + 1,
        effectiveAt,
        rateBps: rate.rateBps,
        rounding: current.rounding,
        attributionDays: current.attributionDays,
        confirmationDays: current.confirmationDays
      };
      let service;
      try {
        service = createPortalReferralService({
          database: db,
          nowFn: () => new Date(now),
          attributionDays: current.attributionDays,
          rewardsEnabled: false
        });
        service.publishPolicy(next);
      } catch (error) {
        if (error?.[DELIBERATE]) throw error;
        if (constraint(error) || error?.code === "referral_policy_retroactive" || error?.code === "referral_policy_immutable") {
          fail("conflict");
        }
        if (error?.code === "referral_policy_invalid" || error?.code === "referral_request_invalid") {
          fail("invalid_query");
        }
        fail("source_unavailable");
      } finally {
        service?.close();
      }
      let published;
      try {
        published = policySnapshot(next);
      } catch {
        fail("source_unavailable");
      }
      return settlementFrom(db, published);
    });
  }

  function clawback(input) {
    const request = readClawback(input);
    return withDb((db) => {
      if (!referralReady(db)) fail("source_unavailable");
      const now = clock();
      const account = db.prepare(
        "select status from platform_accounts where id = ?"
      ).get(request.accountId);
      if (!account || account.status !== "active") fail("conflict");
      const clawbackRef = `clawback_${randomBytes(16).toString("hex")}`;
      try {
        db.transaction(() => {
          const lots = db.prepare(`
            select l.lot_ref, l.available_units, l.source_ref, l.reversed_units, o.paid_units
              from platform_coin_lots l
              join platform_coin_wallets w on w.wallet_ref = l.wallet_ref
              join platform_referral_accruals a on a.reward_lot_ref = l.lot_ref
              join platform_referral_origins o on o.account_id = a.account_id
             where w.account_id = ?
               and w.status = 'active'
               and l.coin_type = 'reward_coins'
               and l.source_type = 'portal_first_recharge_reward'
               and l.pending_units = 0
               and l.held_units = 0
               and l.available_units > 0
             order by l.created_at, l.lot_ref
          `).all(request.accountId);
          let remaining = request.coins;
          for (const lot of lots) {
            if (!remaining) break;
            if (!Number.isSafeInteger(lot.available_units) || lot.available_units < 1) fail("conflict");
            if (!Number.isSafeInteger(lot.paid_units) || !Number.isSafeInteger(lot.reversed_units)) fail("conflict");
            const amount = Math.min(remaining, lot.available_units);
            const cumulative = lot.paid_units + lot.reversed_units + 1;
            if (!Number.isSafeInteger(cumulative)) fail("conflict");
            let reversed = false;
            try {
              reversed = reverseReferralReward(db, {
                lotRef: lot.lot_ref,
                sourceRef: lot.source_ref,
                amount,
                cumulative,
                occurredAt: now
              });
            } catch (error) {
              if (error?.code === "referral_wallet_binding_invalid" || error?.code === "referral_request_invalid") {
                fail("conflict");
              }
              throw error;
            }
            if (reversed !== true) fail("conflict");
            remaining -= amount;
          }
          if (remaining !== 0) fail("conflict");
          // Accrual reversed_units stays on the refund ledger. Writing the admin
          // amount there can make a later refund compute a negative difference.
          db.prepare(`
            insert into platform_referral_events
              (event_ref, account_id, kind, digest, occurred_at)
            values (?, ?, 'admin_reward_clawback', ?, ?)
          `).run(
            clawbackRef,
            request.accountId,
            digest(JSON.stringify({
              accountId: request.accountId,
              kind: "admin_reward_clawback",
              coins: request.coins,
              reason: request.reason
            })),
            now
          );
        }).immediate();
      } catch (error) {
        if (error?.[DELIBERATE]) throw error;
        if (constraint(error)) fail("conflict");
        throw error;
      }
      return {
        clawbackRef: publicRef(clawbackRef),
        settlement: settlementFrom(db, loadCurrentPolicy(db, now))
      };
    });
  }

  return {
    readOrders,
    readLedger,
    readShareUsers,
    readSettlement,
    updateRate,
    clawback
  };
}
