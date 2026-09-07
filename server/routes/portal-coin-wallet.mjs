import { Router } from "express";
import { types as utilTypes } from "node:util";

const SESSION_REFERENCE = /^[a-z][a-z0-9_]{2,95}$/;
const COIN_TYPES = new Set([
  "paid_coins",
  "bonus_coins",
  "reward_coins"
]);
const WALLET_STATUSES = new Set(["active", "frozen", "closed"]);
const LEDGER_OPERATIONS = new Set([
  "credit",
  "pending_to_available",
  "available_to_held",
  "held_to_available",
  "held_to_consumed",
  "held_to_expired",
  "available_to_expired"
]);

function projectionInvalid() {
  return new Error("invalid Portal Wallet projection");
}

function sendWalletError(res, status, code) {
  res.status(status).json({
    error: {
      code,
      retryable: code === "wallet_unavailable"
    }
  });
}

function snapshotExactObject(value, fields) {
  try {
    if (
      utilTypes.isProxy(value)
      || !value
      || typeof value !== "object"
      || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype
    ) {
      throw projectionInvalid();
    }
    const expected = new Set(fields);
    const keys = Reflect.ownKeys(value);
    if (keys.length !== fields.length) throw projectionInvalid();
    const snapshot = {};
    for (const key of keys) {
      if (typeof key !== "string" || !expected.has(key)) {
        throw projectionInvalid();
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        !descriptor
        || !descriptor.enumerable
        || !("value" in descriptor)
      ) {
        throw projectionInvalid();
      }
      snapshot[key] = descriptor.value;
    }
    for (const field of fields) {
      if (!Object.hasOwn(snapshot, field)) throw projectionInvalid();
    }
    return snapshot;
  } catch {
    throw projectionInvalid();
  }
}

function snapshotPlainArray(value) {
  try {
    if (
      utilTypes.isProxy(value)
      || !Array.isArray(value)
      || Object.getPrototypeOf(value) !== Array.prototype
    ) {
      throw projectionInvalid();
    }
    const length = value.length;
    if (
      !Number.isSafeInteger(length)
      || length < 0
      || Reflect.ownKeys(value).length !== length + 1
    ) {
      throw projectionInvalid();
    }
    const snapshot = new Array(length);
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (
        !descriptor
        || !descriptor.enumerable
        || !("value" in descriptor)
      ) {
        throw projectionInvalid();
      }
      snapshot[index] = descriptor.value;
    }
    return snapshot;
  } catch {
    throw projectionInvalid();
  }
}

function requireNormalizedString(value) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.trim() !== value
  ) {
    throw projectionInvalid();
  }
  return value;
}

function requireNullableNormalizedString(value) {
  return value === null ? null : requireNormalizedString(value);
}

function requireNonNegativeSafeInteger(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw projectionInvalid();
  }
  return value;
}

function requirePositiveSafeInteger(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw projectionInvalid();
  }
  return value;
}

function requireUtcTimestamp(value) {
  if (
    typeof value !== "string"
    || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString() !== value
  ) {
    throw projectionInvalid();
  }
  return value;
}

function normalizeTotals(value) {
  const totals = snapshotExactObject(value, [
    "paid_coins",
    "bonus_coins",
    "reward_coins"
  ]);
  return {
    paidCoins: requireNonNegativeSafeInteger(totals.paid_coins),
    bonusCoins: requireNonNegativeSafeInteger(totals.bonus_coins),
    rewardCoins: requireNonNegativeSafeInteger(totals.reward_coins)
  };
}

function projectWallet(input) {
  const existsDescriptor = input && typeof input === "object"
    ? Object.getOwnPropertyDescriptor(input, "exists")
    : null;
  if (
    !existsDescriptor
    || !existsDescriptor.enumerable
    || !("value" in existsDescriptor)
    || typeof existsDescriptor.value !== "boolean"
  ) {
    throw projectionInvalid();
  }
  const fields = existsDescriptor.value
    ? [
        "exists",
        "walletRef",
        "status",
        "version",
        "totals",
        "spendableUnits",
        "heldUnits",
        "pendingUnits"
      ]
    : [
        "exists",
        "status",
        "version",
        "totals",
        "spendableUnits",
        "heldUnits",
        "pendingUnits"
      ];
  const value = snapshotExactObject(input, fields);
  if (value.exists !== existsDescriptor.value) throw projectionInvalid();
  const balances = normalizeTotals(value.totals);
  const version = requireNonNegativeSafeInteger(value.version);
  const spendableUnits = requireNonNegativeSafeInteger(value.spendableUnits);
  const heldUnits = requireNonNegativeSafeInteger(value.heldUnits);
  const pendingUnits = requireNonNegativeSafeInteger(value.pendingUnits);
  if (!value.exists) {
    if (
      value.status !== "not_created"
      || version !== 0
      || balances.paidCoins !== 0
      || balances.bonusCoins !== 0
      || balances.rewardCoins !== 0
      || spendableUnits !== 0
      || heldUnits !== 0
      || pendingUnits !== 0
    ) {
      throw projectionInvalid();
    }
    return {
      exists: false,
      walletRef: null,
      portal: {
        status: "not_created",
        version: 0,
        balances,
        spendableUnits: 0,
        heldUnits: 0,
        pendingUnits: 0
      }
    };
  }
  if (!WALLET_STATUSES.has(value.status)) throw projectionInvalid();
  const walletRef = requireNormalizedString(value.walletRef);
  return {
    exists: true,
    walletRef,
    portal: {
      status: value.status,
      version,
      balances,
      spendableUnits,
      heldUnits,
      pendingUnits
    }
  };
}

function ledgerDeltas(category, amountUnits) {
  switch (category) {
    case "credit":
      return [null, null, null, amountUnits];
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
      throw projectionInvalid();
  }
}

function projectLedgerEntry(input, walletRef) {
  const value = snapshotExactObject(input, [
    "entryRef",
    "operationRef",
    "walletRef",
    "lotRef",
    "operation",
    "coinType",
    "amountUnits",
    "holdRef",
    "orderRef",
    "sourceType",
    "sourceRef",
    "actorType",
    "actorRef",
    "previousWalletVersion",
    "resultingWalletVersion",
    "resultingWalletStatus",
    "occurredAt"
  ]);
  const entryRef = requireNormalizedString(value.entryRef);
  requireNormalizedString(value.operationRef);
  if (requireNormalizedString(value.walletRef) !== walletRef) {
    throw projectionInvalid();
  }
  requireNormalizedString(value.lotRef);
  if (!LEDGER_OPERATIONS.has(value.operation)) throw projectionInvalid();
  if (!COIN_TYPES.has(value.coinType)) throw projectionInvalid();
  const amountUnits = requirePositiveSafeInteger(value.amountUnits);
  requireNullableNormalizedString(value.holdRef);
  const relatedOrderRef = requireNullableNormalizedString(value.orderRef);
  requireNormalizedString(value.sourceType);
  requireNormalizedString(value.sourceRef);
  requireNormalizedString(value.actorType);
  requireNormalizedString(value.actorRef);
  const previousWalletVersion = requireNonNegativeSafeInteger(
    value.previousWalletVersion
  );
  const resultingWalletVersion = requireNonNegativeSafeInteger(
    value.resultingWalletVersion
  );
  if (
    resultingWalletVersion <= previousWalletVersion
    || !WALLET_STATUSES.has(value.resultingWalletStatus)
  ) {
    throw projectionInvalid();
  }
  const occurredAt = requireUtcTimestamp(value.occurredAt);
  const [
    availableDeltaUnits,
    pendingDeltaUnits,
    heldDeltaUnits,
    totalDeltaUnits
  ] = ledgerDeltas(value.operation, amountUnits);
  return {
    entryRef,
    category: value.operation,
    coinType: value.coinType,
    amountUnits,
    availableDeltaUnits,
    pendingDeltaUnits,
    heldDeltaUnits,
    totalDeltaUnits,
    relatedOrderRef,
    occurredAt
  };
}

function readRawHeader(req, expectedName) {
  const rawHeaders = req.rawHeaders;
  if (!Array.isArray(rawHeaders) || rawHeaders.length % 2 !== 0) {
    return { state: "invalid", value: null };
  }
  let found = false;
  let value = null;
  for (let index = 0; index < rawHeaders.length; index += 2) {
    const name = rawHeaders[index];
    const candidate = rawHeaders[index + 1];
    if (typeof name !== "string" || typeof candidate !== "string") {
      return { state: "invalid", value: null };
    }
    if (name.toLowerCase() !== expectedName) continue;
    if (found) return { state: "invalid", value: null };
    found = true;
    value = candidate;
  }
  return found
    ? { state: "present", value }
    : { state: "missing", value: null };
}

function createSessionMiddleware(auth, browserSessions) {
  return function requirePortalSession(req, res, next) {
    let browser;
    try { browser = browserSessions?.session(req); }
    catch { sendWalletError(res, 401, "wallet_session_invalid"); return; }
    const header = readRawHeader(req, "x-portal-session");
    if (
      !browser && (header.state !== "present"
      || !SESSION_REFERENCE.test(header.value))
    ) {
      sendWalletError(res, 401, "wallet_session_invalid");
      return;
    }
    let projection;
    try {
      projection = browser ?? auth.requireSession({ sessionRef: header.value });
    } catch {
      sendWalletError(res, 401, "wallet_session_invalid");
      return;
    }
    try {
      const session = snapshotExactObject(projection, [
        "sessionRef",
        "accountId"
      ]);
      if (
        session.sessionRef !== (browser?.sessionRef ?? header.value)
        || !SESSION_REFERENCE.test(session.sessionRef)
      ) {
        throw projectionInvalid();
      }
      res.locals.portalCoinWalletSession = {
        accountId: requireNormalizedString(session.accountId)
      };
      next();
    } catch {
      sendWalletError(res, 503, "wallet_unavailable");
    }
  };
}

function rawTarget(req) {
  if (typeof req.originalUrl === "string") return req.originalUrl;
  return typeof req.url === "string" ? req.url : "";
}

function requireNoQuery(req, res, next) {
  if (rawTarget(req).includes("?")) {
    sendWalletError(res, 400, "wallet_request_invalid");
    return;
  }
  next();
}

function parseLedgerQuery(req, res, next) {
  try {
    const target = rawTarget(req);
    const queryIndex = target.indexOf("?");
    if (queryIndex === -1) throw projectionInvalid();
    const params = new URLSearchParams(target.slice(queryIndex + 1));
    const allowed = new Set([
      "limit",
      "afterOccurredAt",
      "afterEntryRef"
    ]);
    for (const key of params.keys()) {
      if (!allowed.has(key)) throw projectionInvalid();
    }
    const limits = params.getAll("limit");
    const occurredAtValues = params.getAll("afterOccurredAt");
    const entryRefValues = params.getAll("afterEntryRef");
    if (
      limits.length !== 1
      || occurredAtValues.length > 1
      || entryRefValues.length > 1
      || (occurredAtValues.length === 1) !== (entryRefValues.length === 1)
      || !/^(?:[1-9]|[1-9][0-9]|100)$/.test(limits[0])
    ) {
      throw projectionInvalid();
    }
    const query = { limit: Number(limits[0]) };
    if (occurredAtValues.length === 1) {
      query.afterOccurredAt = requireUtcTimestamp(occurredAtValues[0]);
      query.afterEntryRef = requireNormalizedString(entryRefValues[0]);
    }
    res.locals.portalCoinWalletQuery = query;
    next();
  } catch {
    sendWalletError(res, 400, "wallet_request_invalid");
  }
}

function rawPathname(req) {
  const target = rawTarget(req);
  const queryIndex = target.indexOf("?");
  return queryIndex === -1 ? target : target.slice(0, queryIndex);
}

function isSelectedWalletRoute(method, pathname) {
  return method === "GET" && (
    pathname === "/api/portal/coins/wallet"
    || pathname === "/api/portal/coins/wallet/ledger"
  );
}

function requireWalletProjection(store, accountId) {
  return projectWallet(store.getWalletProjection({ accountId }));
}

export function createPortalCoinWalletRouter({ store, auth, browserSessions }) {
  if (
    !store
    || typeof store.getWalletProjection !== "function"
    || typeof store.listLedgerEntries !== "function"
    || !auth
    || typeof auth.requireSession !== "function"
  ) {
    throw new TypeError("Portal Wallet dependencies unavailable");
  }
  const router = Router({ caseSensitive: true, strict: true });
  const requireSession = createSessionMiddleware(auth, browserSessions);

  router.get(
    "/api/portal/coins/wallet",
    requireNoQuery,
    requireSession,
    (_req, res) => {
      try {
        const wallet = requireWalletProjection(
          store,
          res.locals.portalCoinWalletSession.accountId
        );
        res.json({ wallet: wallet.portal });
      } catch {
        sendWalletError(res, 503, "wallet_unavailable");
      }
    }
  );

  router.get(
    "/api/portal/coins/wallet/ledger",
    parseLedgerQuery,
    requireSession,
    (_req, res) => {
      try {
        const wallet = requireWalletProjection(
          store,
          res.locals.portalCoinWalletSession.accountId
        );
        if (!wallet.exists) {
          res.json({ entries: [], nextCursor: null });
          return;
        }
        const query = res.locals.portalCoinWalletQuery;
        const storeQuery = {
          walletRef: wallet.walletRef,
          ...(query.afterOccurredAt === undefined
            ? {}
            : {
                afterOccurredAt: query.afterOccurredAt,
                afterEntryRef: query.afterEntryRef
              }),
          limit: query.limit + 1
        };
        const sourceEntries = snapshotPlainArray(
          store.listLedgerEntries(storeQuery)
        );
        if (sourceEntries.length > query.limit + 1) {
          throw projectionInvalid();
        }
        const returned = sourceEntries.slice(0, query.limit);
        const entries = returned.map(
          (entry) => projectLedgerEntry(entry, wallet.walletRef)
        );
        const nextCursor = sourceEntries.length > query.limit
          ? {
              afterOccurredAt: entries[entries.length - 1].occurredAt,
              afterEntryRef: entries[entries.length - 1].entryRef
            }
          : null;
        res.json({ entries, nextCursor });
      } catch {
        sendWalletError(res, 503, "wallet_unavailable");
      }
    }
  );

  return function portalCoinWalletDispatcher(req, res, next) {
    if (!isSelectedWalletRoute(req.method, rawPathname(req))) {
      next();
      return;
    }
    router(req, res, next);
  };
}
