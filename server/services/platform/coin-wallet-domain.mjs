import { createHash } from "node:crypto";

export const COIN_TYPES = Object.freeze([
  "paid_coins",
  "bonus_coins",
  "reward_coins"
]);

export const COIN_ALLOCATION_PRIORITY = Object.freeze([
  "bonus_coins",
  "paid_coins",
  "reward_coins"
]);

const COIN_TYPE_SET = new Set(COIN_TYPES);
const WALLET_REQUEST_FIELDS = new Set([
  "walletRef",
  "lotRef",
  "accountId",
  "coinType",
  "amountUnits",
  "acceptedCoinTypes",
  "sourceType",
  "sourceRef",
  "sourceDigest",
  "availability",
  "policyRef",
  "policyVersion",
  "expiresAt",
  "holdRef",
  "purpose",
  "purposeRef",
  "reasonType",
  "reasonRef",
  "recoveryRef",
  "operationRef"
]);

function coinWalletError(code, field) {
  const error = new Error("invalid Coin wallet domain input");
  error.code = code;
  error.field = field;
  return error;
}

function assertPlainObject(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw coinWalletError("invalid_wallet_request", field);
  }
  return value;
}

function assertNormalizedString(value, field) {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw coinWalletError("non_normalized_wallet_request", field);
  }
  return value;
}

function normalizeTimestamp(value, field, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw coinWalletError("invalid_wallet_timestamp", field);
  }
  return value;
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function compareCodeUnits(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareNullableCodeUnits(left, right) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return compareCodeUnits(left, right);
}

function safeAdd(left, right, field) {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw coinWalletError("coin_units_overflow", field);
  }
  return result;
}

function freezeAllocations(allocations) {
  return Object.freeze(allocations.map((allocation) => Object.freeze(allocation)));
}

function assertCoinUnitsAtLeast(value, field, minimum) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw coinWalletError("invalid_coin_units", field);
  }
  return value;
}

function normalizeLot(value, index) {
  const lot = assertPlainObject(value, `lots[${index}]`);
  const lotRef = assertNormalizedString(lot.lotRef, `lots[${index}].lotRef`);
  const coinType = normalizeCoinType(lot.coinType);
  const availableUnits = assertCoinUnits(lot.availableUnits, `lots[${index}].availableUnits`);
  const pendingUnits = assertCoinUnits(lot.pendingUnits ?? 0, `lots[${index}].pendingUnits`);
  const heldUnits = assertCoinUnits(lot.heldUnits ?? 0, `lots[${index}].heldUnits`);
  const expiresAt = normalizeTimestamp(lot.expiresAt ?? null, `lots[${index}].expiresAt`, { nullable: true });
  if (coinType !== "bonus_coins" && expiresAt !== null) {
    throw coinWalletError("invalid_coin_expiry", `lots[${index}].expiresAt`);
  }
  return {
    lotRef,
    coinType,
    availableUnits,
    pendingUnits,
    heldUnits,
    expiresAt,
    createdAt: normalizeTimestamp(lot.createdAt, `lots[${index}].createdAt`)
  };
}

function normalizeWalletRequestInput(input) {
  const request = assertPlainObject(input, "input");
  const normalized = {};
  for (const key of Reflect.ownKeys(request)) {
    if (typeof key !== "string" || !WALLET_REQUEST_FIELDS.has(key)) {
      throw coinWalletError("unexpected_wallet_request_field", key);
    }
    const descriptor = Object.getOwnPropertyDescriptor(request, key);
    if (!descriptor || !("value" in descriptor)) {
      throw coinWalletError("non_normalized_wallet_request", key);
    }
    const { value } = descriptor;
    if (key === "coinType") normalized[key] = normalizeCoinType(value);
    else if (key === "acceptedCoinTypes") normalized[key] = normalizeAcceptedCoinTypes(value);
    else if (key === "amountUnits" || key === "policyVersion") normalized[key] = assertCoinUnits(value, key);
    else if (key === "expiresAt") normalized[key] = normalizeTimestamp(value, key, { nullable: true });
    else normalized[key] = assertNormalizedString(value, key);
  }
  return normalized;
}

export function assertCoinUnits(value, field) {
  return assertCoinUnitsAtLeast(value, field, 0);
}

export function assertPositiveCoinUnits(value, field) {
  return assertCoinUnitsAtLeast(value, field, 1);
}

export function normalizeCoinType(value) {
  if (typeof value !== "string" || !COIN_TYPE_SET.has(value)) {
    throw coinWalletError("invalid_coin_type", "coinType");
  }
  return value;
}

export function normalizeAcceptedCoinTypes(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw coinWalletError("invalid_accepted_coin_types", "acceptedCoinTypes");
  }
  const normalized = Array.from(values, (value) => normalizeCoinType(value));
  if (new Set(normalized).size !== normalized.length) {
    throw coinWalletError("duplicate_coin_type", "acceptedCoinTypes");
  }
  const accepted = new Set(normalized);
  return Object.freeze(COIN_ALLOCATION_PRIORITY.filter((coinType) => accepted.has(coinType)));
}

export function canonicalWalletRequestDigest(operationType, input) {
  const operation = assertNormalizedString(operationType, "operationType");
  const normalizedInput = normalizeWalletRequestInput(input);
  return createHash("sha256")
    .update(`GCCWEBOS:COIN_WALLET_REQUEST:v1\0${operation}\0${canonicalJson(normalizedInput)}`, "utf8")
    .digest("hex");
}

export function allocateCoinLots({ lots, amountUnits, acceptedCoinTypes, now }) {
  if (!Array.isArray(lots)) throw coinWalletError("invalid_wallet_lots", "lots");
  const targetUnits = assertCoinUnits(amountUnits, "amountUnits");
  const accepted = new Set(normalizeAcceptedCoinTypes(acceptedCoinTypes));
  const timestamp = normalizeTimestamp(now, "now");
  const eligibleLots = lots
    .map(normalizeLot)
    .filter((lot) => accepted.has(lot.coinType))
    .filter((lot) => lot.availableUnits > 0)
    .filter((lot) => lot.coinType !== "bonus_coins" || lot.expiresAt === null || lot.expiresAt > timestamp);

  let totalAvailable = 0;
  for (const lot of eligibleLots) totalAvailable = safeAdd(totalAvailable, lot.availableUnits, "availableUnits");
  if (totalAvailable < targetUnits) return freezeAllocations([]);

  const priority = new Map(COIN_ALLOCATION_PRIORITY.map((coinType, index) => [coinType, index]));
  eligibleLots.sort((left, right) => (
    priority.get(left.coinType) - priority.get(right.coinType)
    || compareNullableCodeUnits(left.expiresAt, right.expiresAt)
    || compareCodeUnits(left.createdAt, right.createdAt)
    || compareCodeUnits(left.lotRef, right.lotRef)
  ));

  let remaining = targetUnits;
  const allocations = [];
  for (const lot of eligibleLots) {
    if (remaining === 0) break;
    const allocatedUnits = Math.min(lot.availableUnits, remaining);
    allocations.push({
      lotRef: lot.lotRef,
      coinType: lot.coinType,
      allocationSequence: allocations.length + 1,
      allocatedUnits
    });
    remaining -= allocatedUnits;
  }
  return freezeAllocations(allocations);
}

export function projectCoinWalletBalance({ wallet, lots, activeAllocations }) {
  if (wallet === null || wallet === undefined) {
    return {
      exists: false,
      status: "not_created",
      version: 0,
      totals: { paid_coins: 0, bonus_coins: 0, reward_coins: 0 },
      spendableUnits: 0,
      heldUnits: 0,
      pendingUnits: 0
    };
  }
  const normalizedWallet = assertPlainObject(wallet, "wallet");
  const walletRef = assertNormalizedString(normalizedWallet.walletRef, "wallet.walletRef");
  const status = normalizedWallet.status;
  if (!new Set(["active", "frozen", "closed"]).has(status)) {
    throw coinWalletError("invalid_wallet_status", "wallet.status");
  }
  const version = assertCoinUnits(normalizedWallet.version, "wallet.version");
  if (!Array.isArray(lots) || !Array.isArray(activeAllocations)) {
    throw coinWalletError("invalid_wallet_projection", "lots");
  }
  const normalizedLots = lots.map(normalizeLot);
  const lotsByRef = new Map(normalizedLots.map((lot) => [lot.lotRef, lot]));
  if (lotsByRef.size !== normalizedLots.length) throw coinWalletError("duplicate_wallet_lot", "lots");
  const allocatedByLot = new Map();
  for (let index = 0; index < activeAllocations.length; index += 1) {
    const allocation = assertPlainObject(activeAllocations[index], `activeAllocations[${index}]`);
    const lotRef = assertNormalizedString(allocation.lotRef, `activeAllocations[${index}].lotRef`);
    const allocatedUnits = assertCoinUnits(allocation.allocatedUnits, `activeAllocations[${index}].allocatedUnits`);
    if (allocatedUnits === 0 || !lotsByRef.has(lotRef)) throw coinWalletError("invalid_active_allocation", `activeAllocations[${index}]`);
    const updated = safeAdd(allocatedByLot.get(lotRef) ?? 0, allocatedUnits, "allocatedUnits");
    allocatedByLot.set(lotRef, updated);
  }
  const totals = { paid_coins: 0, bonus_coins: 0, reward_coins: 0 };
  let spendableUnits = 0;
  let heldUnits = 0;
  let pendingUnits = 0;
  for (let index = 0; index < normalizedLots.length; index += 1) {
    const lot = normalizedLots[index];
    if ((allocatedByLot.get(lot.lotRef) ?? 0) !== lot.heldUnits) {
      throw coinWalletError("invalid_active_allocation", `lots[${index}].heldUnits`);
    }
    totals[lot.coinType] = safeAdd(totals[lot.coinType], lot.availableUnits, lot.coinType);
    spendableUnits = safeAdd(spendableUnits, lot.availableUnits, "spendableUnits");
    heldUnits = safeAdd(heldUnits, lot.heldUnits, "heldUnits");
    pendingUnits = safeAdd(pendingUnits, lot.pendingUnits, "pendingUnits");
  }
  return {
    exists: true,
    walletRef,
    status,
    version,
    totals,
    spendableUnits,
    heldUnits,
    pendingUnits
  };
}
