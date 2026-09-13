const SCHEMA_VERSION = "admin-user-monitor/v1";
const DAY_MS = 86400000;
const MAX_RANGE_MS = 31 * DAY_MS;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_CURSOR_LENGTH = 512;
const REF_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const DELIBERATE = Symbol("admin-user-monitor-deliberate");
const TZ_ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/;
const ACCOUNT_STATUSES = new Set(["active", "suspended", "disabled"]);
const WALLET_STATUSES = new Set(["active", "frozen", "closed"]);
const COIN_TYPES = new Set(["paid_coins", "bonus_coins", "reward_coins"]);
const LEDGER_CATEGORIES = new Set([
  "credit",
  "pending_to_reversed",
  "available_to_reversed",
  "pending_to_available",
  "available_to_held",
  "held_to_available",
  "held_to_consumed",
  "held_to_expired",
  "available_to_expired"
]);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  error[DELIBERATE] = true;
  throw error;
}

function withSource(fn) {
  try {
    return fn();
  } catch (error) {
    if (error && error[DELIBERATE] && (error.code === "account_not_found" || error.code === "source_unavailable")) {
      throw error;
    }
    fail("source_unavailable");
  }
}

function envelope(fields) {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    ...fields
  };
}

function exactQuery(query, allowed) {
  const value = query == null ? {} : query;
  if (typeof value !== "object" || Array.isArray(value)) fail("invalid_query");
  for (const key of Object.keys(value)) {
    if (!allowed.has(key) || Array.isArray(value[key])) fail("invalid_query");
  }
  return value;
}

function daysInMonth(year, month) {
  const lengths = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month !== 2) return lengths[month];
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return leap ? 29 : 28;
}

function parseTimezoneIso(value) {
  if (typeof value !== "string") fail("invalid_query");
  const match = TZ_ISO.exec(value);
  if (!match) fail("invalid_query");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (
    month < 1
    || month > 12
    || day < 1
    || day > daysInMonth(year, month)
    || hour > 23
    || minute > 59
    || second > 59
  ) {
    fail("invalid_query");
  }
  const tz = match[8];
  if (tz !== "Z") {
    const offsetHour = Number(tz.slice(1, 3));
    const offsetMinute = Number(tz.slice(4, 6));
    if (offsetHour > 23 || offsetMinute > 59) fail("invalid_query");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) fail("invalid_query");
  return date.toISOString();
}

function parseRangeQuery(query, extraAllowed = []) {
  const value = exactQuery(query, new Set(["from", "to", ...extraAllowed]));
  if (!Object.prototype.hasOwnProperty.call(value, "from")
    || !Object.prototype.hasOwnProperty.call(value, "to")) {
    fail("invalid_query");
  }
  const from = parseTimezoneIso(value.from);
  const to = parseTimezoneIso(value.to);
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (!(fromMs < toMs) || toMs - fromMs > MAX_RANGE_MS) fail("invalid_query");
  return { from, to, value };
}

function parseLimit(value) {
  if (value === undefined) return DEFAULT_LIMIT;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 1 || value > MAX_LIMIT) fail("invalid_query");
    return value;
  }
  if (typeof value === "string" && /^(?:[1-9]\d{0,2})$/.test(value)) {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed > MAX_LIMIT) fail("invalid_query");
    return parsed;
  }
  fail("invalid_query");
}

function requireAccountId(value) {
  if (typeof value !== "string" || !REF_PATTERN.test(value)) fail("invalid_query");
  return value;
}

function requireSourceRef(value) {
  if (typeof value !== "string" || !REF_PATTERN.test(value)) fail("source_unavailable");
  return value;
}

function requireCallerRef(value) {
  if (typeof value !== "string" || !REF_PATTERN.test(value)) fail("invalid_query");
  return value;
}

function safeAdd(left, right) {
  const sum = left + right;
  if (!Number.isSafeInteger(sum)) fail("source_unavailable");
  return sum;
}

function requireCanonicalIso(value) {
  if (typeof value !== "string") fail("invalid_query");
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) fail("invalid_query");
  return value;
}

function encodeCursor(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(raw, fields) {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_CURSOR_LENGTH) {
    fail("invalid_query");
  }
  if (!BASE64URL.test(raw)) fail("invalid_query");
  let parsed;
  try {
    const decoded = Buffer.from(raw, "base64url");
    if (decoded.toString("base64url") !== raw) fail("invalid_query");
    parsed = JSON.parse(decoded.toString("utf8"));
  } catch {
    fail("invalid_query");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) fail("invalid_query");
  const keys = Object.keys(parsed);
  if (keys.length !== fields.length || fields.some((field) => !Object.prototype.hasOwnProperty.call(parsed, field)) || keys.some((key, index) => key !== fields[index] && !fields.includes(key))) {
    fail("invalid_query");
  }
  return parsed;
}

function requireSafeCount(value) {
  if (typeof value === "bigint") {
    if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) fail("source_unavailable");
    return Number(value);
  }
  if (!Number.isSafeInteger(value) || value < 0) fail("source_unavailable");
  return value;
}

function utcDayList(fromIso, toIso) {
  const start = Date.parse(`${fromIso.slice(0, 10)}T00:00:00.000Z`);
  const end = Date.parse(toIso);
  if (Number.isNaN(start) || Number.isNaN(end)) fail("source_unavailable");
  const days = [];
  for (let time = start; time < end; time += DAY_MS) {
    days.push(new Date(time).toISOString());
    if (days.length > 32) fail("source_unavailable");
  }
  return days;
}

function loadAccount(controlStore, accountId) {
  if (!controlStore || typeof controlStore.getAccount !== "function") fail("source_unavailable");
  let account;
  try {
    account = controlStore.getAccount(accountId);
  } catch {
    fail("source_unavailable");
  }
  if (!account) fail("account_not_found");
  return account;
}

function ledgerDeltas(category, amountUnits) {
  switch (category) {
    case "credit":
      return [null, null, null, amountUnits];
    case "pending_to_reversed":
      return [0, -amountUnits, 0, -amountUnits];
    case "available_to_reversed":
      return [-amountUnits, 0, 0, -amountUnits];
    case "pending_to_available":
      return [amountUnits, -amountUnits, 0, 0];
    case "available_to_held":
      return [-amountUnits, 0, amountUnits, 0];
    case "held_to_available":
      return [amountUnits, 0, -amountUnits, 0];
    case "held_to_consumed":
    case "held_to_expired":
      return [0, 0, -amountUnits, -amountUnits];
    case "available_to_expired":
      return [-amountUnits, 0, 0, -amountUnits];
    default:
      fail("source_unavailable");
  }
}

function projectWallet(projection) {
  if (!projection || typeof projection !== "object" || Array.isArray(projection)) {
    fail("source_unavailable");
  }
  if (projection.exists === false) {
    const version = requireSafeCount(projection.version);
    const totals = projection.totals && typeof projection.totals === "object" ? projection.totals : null;
    if (
      !totals
      || projection.status !== "not_created"
      || version !== 0
      || requireSafeCount(projection.spendableUnits) !== 0
      || requireSafeCount(projection.heldUnits) !== 0
      || requireSafeCount(projection.pendingUnits) !== 0
      || requireSafeCount(totals.paid_coins) !== 0
      || requireSafeCount(totals.bonus_coins) !== 0
      || requireSafeCount(totals.reward_coins) !== 0
    ) {
      fail("source_unavailable");
    }
    return {
      status: "not_created",
      version: 0,
      balances: { paidCoins: 0, bonusCoins: 0, rewardCoins: 0 },
      spendableUnits: 0,
      heldUnits: 0,
      pendingUnits: 0
    };
  }
  if (projection.exists !== true) fail("source_unavailable");
  if (typeof projection.walletRef !== "string" || projection.walletRef.trim() !== projection.walletRef || !projection.walletRef) {
    fail("source_unavailable");
  }
  if (!WALLET_STATUSES.has(projection.status)) fail("source_unavailable");
  const totals = projection.totals;
  if (!totals || typeof totals !== "object") fail("source_unavailable");
  const paidCoins = requireSafeCount(totals.paid_coins);
  const bonusCoins = requireSafeCount(totals.bonus_coins);
  const rewardCoins = requireSafeCount(totals.reward_coins);
  const spendableUnits = requireSafeCount(projection.spendableUnits);
  const availableTotal = safeAdd(safeAdd(paidCoins, bonusCoins), rewardCoins);
  if (availableTotal !== spendableUnits) fail("source_unavailable");
  return {
    walletRef: projection.walletRef,
    portal: {
      status: projection.status,
      version: requireSafeCount(projection.version),
      balances: {
        paidCoins,
        bonusCoins,
        rewardCoins
      },
      spendableUnits,
      heldUnits: requireSafeCount(projection.heldUnits),
      pendingUnits: requireSafeCount(projection.pendingUnits)
    }
  };
}

function projectLedgerEntry(entry, walletRef) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) fail("source_unavailable");
  if (entry.walletRef !== walletRef) fail("source_unavailable");
  if (typeof entry.entryRef !== "string" || entry.entryRef.trim() !== entry.entryRef || !entry.entryRef) {
    fail("source_unavailable");
  }
  const entryRef = requireSourceRef(entry.entryRef);
  const occurredAt = requireCanonicalIso(entry.occurredAt);
  const category = entry.operation;
  if (!LEDGER_CATEGORIES.has(category)) fail("source_unavailable");
  if (!COIN_TYPES.has(entry.coinType)) fail("source_unavailable");
  if (!Number.isSafeInteger(entry.amountUnits) || entry.amountUnits < 1) fail("source_unavailable");
  const [
    availableDeltaUnits,
    pendingDeltaUnits,
    heldDeltaUnits,
    totalDeltaUnits
  ] = ledgerDeltas(category, entry.amountUnits);
  return {
    entryRef,
    occurredAt,
    category,
    coinType: entry.coinType,
    amountUnits: entry.amountUnits,
    availableDeltaUnits,
    pendingDeltaUnits,
    heldDeltaUnits,
    totalDeltaUnits
  };
}

export function createAdminUserMonitorService({
  controlStore = null,
  coinsWalletStore = null
} = {}) {
  return {
    readGrowth(query) {
      const { from, to } = parseRangeQuery(query);
      return withSource(() => {
        if (!controlStore || typeof controlStore.listUserMonitorGrowthDays !== "function") {
          fail("source_unavailable");
        }
        const rows = controlStore.listUserMonitorGrowthDays({ from, to });
        if (!Array.isArray(rows)) fail("source_unavailable");
        const allowedDays = new Set(utcDayList(from, to));
        const byDay = new Map();
        for (const row of rows) {
          if (!row || typeof row !== "object") fail("source_unavailable");
          const at = requireCanonicalIso(row.at);
          if (!allowedDays.has(at) || byDay.has(at)) fail("source_unavailable");
          byDay.set(at, {
            at,
            registeredCount: requireSafeCount(row.registeredCount),
            otherCreatedCount: requireSafeCount(row.otherCreatedCount)
          });
        }
        const points = utcDayList(from, to).map((at) => byDay.get(at) || {
          at,
          registeredCount: 0,
          otherCreatedCount: 0
        });
        let registeredCount = 0;
        let otherCreatedCount = 0;
        for (const point of points) {
          registeredCount = safeAdd(registeredCount, point.registeredCount);
          otherCreatedCount = safeAdd(otherCreatedCount, point.otherCreatedCount);
        }
        return envelope({
          from,
          to,
          timezone: "UTC",
          registeredCount,
          otherCreatedCount,
          points
        });
      });
    },

    readAccounts(query) {
      const value = exactQuery(query, new Set(["accountId", "status", "cursor", "limit"]));
      const accountId = value.accountId === undefined ? null : requireAccountId(value.accountId);
      const status = value.status === undefined ? null : value.status;
      if (status !== null && !ACCOUNT_STATUSES.has(status)) fail("invalid_query");
      const limit = parseLimit(value.limit);
      let afterCreatedAt;
      let afterId;
      if (value.cursor !== undefined) {
        const cursor = decodeCursor(value.cursor, ["createdAt", "id"]);
        afterCreatedAt = requireCanonicalIso(cursor.createdAt);
        afterId = requireAccountId(cursor.id);
      }
      return withSource(() => {
        if (!controlStore || typeof controlStore.listUserMonitorAccountDirectory !== "function") {
          fail("source_unavailable");
        }
        const rows = controlStore.listUserMonitorAccountDirectory({
          accountId,
          status,
          afterCreatedAt,
          afterId,
          limit: limit + 1
        });
        if (!Array.isArray(rows)) fail("source_unavailable");
        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;
        const items = page.map((row) => {
          if (!row || typeof row !== "object") fail("source_unavailable");
          if (!ACCOUNT_STATUSES.has(row.status)) fail("source_unavailable");
          if (row.registrationSource !== "self_service_portal" && row.registrationSource !== "other") {
            fail("source_unavailable");
          }
          return {
            id: requireSourceRef(row.id),
            status: row.status,
            createdAt: requireCanonicalIso(row.createdAt),
            registrationSource: row.registrationSource
          };
        });
        const last = items[items.length - 1];
        return envelope({
          items,
          nextCursor: hasMore && last
            ? encodeCursor({ createdAt: last.createdAt, id: last.id })
            : null
        });
      });
    },

    readCoins(accountId, query) {
      const id = requireAccountId(accountId);
      const value = exactQuery(query, new Set(["cursor", "limit"]));
      const limit = parseLimit(value.limit);
      let afterOccurredAt;
      let afterEntryRef;
      if (value.cursor !== undefined) {
        const cursor = decodeCursor(value.cursor, ["occurredAt", "entryRef"]);
        afterOccurredAt = requireCanonicalIso(cursor.occurredAt);
        afterEntryRef = requireCallerRef(cursor.entryRef);
      }
      return withSource(() => {
        loadAccount(controlStore, id);
        if (!coinsWalletStore || typeof coinsWalletStore.getWalletProjection !== "function") {
          fail("source_unavailable");
        }
        const projected = projectWallet(coinsWalletStore.getWalletProjection({ accountId: id }));
        if (!projected.walletRef) {
          return envelope({
            accountId: id,
            wallet: projected,
            entries: [],
            nextCursor: null
          });
        }
        if (typeof coinsWalletStore.listLedgerEntries !== "function") fail("source_unavailable");
        const lookup = {
          walletRef: projected.walletRef,
          limit: limit + 1
        };
        if (afterOccurredAt !== undefined) {
          lookup.afterOccurredAt = afterOccurredAt;
          lookup.afterEntryRef = afterEntryRef;
        }
        const rows = coinsWalletStore.listLedgerEntries(lookup);
        if (!Array.isArray(rows)) fail("source_unavailable");
        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;
        const entries = page.map((row) => projectLedgerEntry(row, projected.walletRef));
        const last = entries[entries.length - 1];
        return envelope({
          accountId: id,
          wallet: projected.portal,
          entries,
          nextCursor: hasMore && last
            ? encodeCursor({ occurredAt: last.occurredAt, entryRef: last.entryRef })
            : null
        });
      });
    },

    readTraffic(accountId, query) {
      const id = requireAccountId(accountId);
      const parsed = parseRangeQuery(query, ["bucket"]);
      const bucket = parsed.value.bucket === undefined ? "day" : parsed.value.bucket;
      if (bucket !== "day" && bucket !== "hour") fail("invalid_query");
      return withSource(() => {
        loadAccount(controlStore, id);
        if (!controlStore || typeof controlStore.summarizeUserMonitorTraffic !== "function") {
          fail("source_unavailable");
        }
        const summary = controlStore.summarizeUserMonitorTraffic({
          accountId: id,
          from: parsed.from,
          to: parsed.to,
          bucket
        });
        if (!summary || typeof summary !== "object") fail("source_unavailable");
        const sampleCount = requireSafeCount(summary.sampleCount);
        if (sampleCount === 0) {
          if (summary.lastObservedAt != null || summary.totalBytes != null) fail("source_unavailable");
          if (!Array.isArray(summary.points) || summary.points.length !== 0) fail("source_unavailable");
          return envelope({
            accountId: id,
            from: parsed.from,
            to: parsed.to,
            bucket,
            state: "not_collected",
            sampleCount: 0,
            lastObservedAt: null,
            totalBytes: null,
            uploadBytes: null,
            downloadBytes: null,
            points: []
          });
        }
        const uploadBytes = requireSafeCount(summary.uploadBytes);
        const downloadBytes = requireSafeCount(summary.downloadBytes);
        const totalBytes = requireSafeCount(summary.totalBytes);
        if (!Array.isArray(summary.points)) fail("source_unavailable");
        const points = summary.points.map((point) => {
          if (!point || typeof point !== "object") fail("source_unavailable");
          return {
            at: requireCanonicalIso(point.at),
            sampleCount: requireSafeCount(point.sampleCount),
            uploadBytes: requireSafeCount(point.uploadBytes),
            downloadBytes: requireSafeCount(point.downloadBytes),
            totalBytes: requireSafeCount(point.totalBytes)
          };
        });
        const zero = uploadBytes === 0 && downloadBytes === 0 && totalBytes === 0;
        return envelope({
          accountId: id,
          from: parsed.from,
          to: parsed.to,
          bucket,
          state: zero ? "measured_zero" : "measured",
          sampleCount,
          lastObservedAt: requireCanonicalIso(summary.lastObservedAt),
          totalBytes,
          uploadBytes,
          downloadBytes,
          points
        });
      });
    }
  };
}
