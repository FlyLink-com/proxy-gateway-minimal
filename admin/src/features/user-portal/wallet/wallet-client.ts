import type {
  PortalWalletClient,
  PortalWalletClientErrorCode,
  PortalWalletErrorCode,
  PortalWalletLedgerCategory,
  PortalWalletLedgerEntry,
  PortalWalletStatus,
  PortalWalletSummary
} from "./api-contract";

const SESSION_REFERENCE = /^[a-z][a-z0-9_]{2,95}$/;
const WALLET_READ_TIMEOUT_MS = 15_000;
const UTC_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const WALLET_STATUSES = new Set<PortalWalletStatus>([
  "not_created",
  "active",
  "frozen",
  "closed"
]);
const LEDGER_CATEGORIES = new Set<PortalWalletLedgerCategory>([
  "credit",
  "pending_to_available",
  "available_to_held",
  "held_to_available",
  "held_to_consumed",
  "held_to_expired",
  "available_to_expired"
]);
const COIN_TYPES = new Set([
  "paid_coins",
  "bonus_coins",
  "reward_coins"
] as const);
const WALLET_ERROR_CONTRACT = new Map<
  PortalWalletErrorCode,
  { status: number; retryable: boolean }
>([
  ["wallet_request_invalid", { status: 400, retryable: false }],
  ["wallet_session_invalid", { status: 401, retryable: false }],
  ["wallet_unavailable", { status: 503, retryable: true }]
]);

export class PortalWalletClientError extends Error {
  readonly code: PortalWalletClientErrorCode;
  readonly retryable: boolean;

  constructor(code: PortalWalletClientErrorCode, retryable: boolean) {
    super("Portal Wallet request failed.");
    this.name = "PortalWalletClientError";
    this.code = code;
    this.retryable = retryable;
  }
}

function requestFailed() {
  return new PortalWalletClientError("wallet_request_failed", true);
}

function invalidProjection(): never {
  throw requestFailed();
}

function exactObject(
  input: unknown,
  fields: readonly string[]
): Record<string, unknown> {
  try {
    if (
      !input
      || typeof input !== "object"
      || Array.isArray(input)
      || Object.getPrototypeOf(input) !== Object.prototype
    ) {
      return invalidProjection();
    }
    const expected = new Set(fields);
    const keys = Reflect.ownKeys(input);
    if (keys.length !== fields.length) return invalidProjection();
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      if (typeof key !== "string" || !expected.has(key)) {
        return invalidProjection();
      }
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (
        !descriptor
        || !descriptor.enumerable
        || !("value" in descriptor)
      ) {
        return invalidProjection();
      }
      result[key] = descriptor.value;
    }
    for (const field of fields) {
      if (!Object.hasOwn(result, field)) return invalidProjection();
    }
    return result;
  } catch (error) {
    if (error instanceof PortalWalletClientError) throw error;
    return invalidProjection();
  }
}

function exactArray(input: unknown): unknown[] {
  try {
    if (
      !Array.isArray(input)
      || Object.getPrototypeOf(input) !== Array.prototype
    ) {
      return invalidProjection();
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(input, "length");
    if (
      !lengthDescriptor
      || !("value" in lengthDescriptor)
      || !Number.isSafeInteger(lengthDescriptor.value)
      || lengthDescriptor.value < 0
      || Reflect.ownKeys(input).length !== lengthDescriptor.value + 1
    ) {
      return invalidProjection();
    }
    const result = new Array(lengthDescriptor.value);
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(
        input,
        String(index)
      );
      if (
        !descriptor
        || !descriptor.enumerable
        || !("value" in descriptor)
      ) {
        return invalidProjection();
      }
      result[index] = descriptor.value;
    }
    return result;
  } catch (error) {
    if (error instanceof PortalWalletClientError) throw error;
    return invalidProjection();
  }
}

function positiveSafeInteger(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    return invalidProjection();
  }
  return value as number;
}

function nonNegativeSafeInteger(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    return invalidProjection();
  }
  return value as number;
}

function signedSafeInteger(value: unknown) {
  if (!Number.isSafeInteger(value)) return invalidProjection();
  return value as number;
}

function safeAdd(left: number, right: number) {
  const result = left + right;
  if (!Number.isSafeInteger(result)) return invalidProjection();
  return result;
}

function utcTimestamp(value: unknown) {
  if (
    typeof value !== "string"
    || !UTC_TIMESTAMP.test(value)
    || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString() !== value
  ) {
    return invalidProjection();
  }
  return value;
}

function normalizedReference(value: unknown) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.trim() !== value
  ) {
    return invalidProjection();
  }
  return value;
}

function summaryProjection(input: unknown): PortalWalletSummary {
  const wrapper = exactObject(input, ["wallet"]);
  const wallet = exactObject(wrapper.wallet, [
    "status",
    "version",
    "balances",
    "spendableUnits",
    "heldUnits",
    "pendingUnits"
  ]);
  if (!WALLET_STATUSES.has(wallet.status as PortalWalletStatus)) {
    return invalidProjection();
  }
  const balances = exactObject(wallet.balances, [
    "paidCoins",
    "bonusCoins",
    "rewardCoins"
  ]);
  const paidCoins = nonNegativeSafeInteger(balances.paidCoins);
  const bonusCoins = nonNegativeSafeInteger(balances.bonusCoins);
  const rewardCoins = nonNegativeSafeInteger(balances.rewardCoins);
  const version = nonNegativeSafeInteger(wallet.version);
  const spendableUnits = nonNegativeSafeInteger(wallet.spendableUnits);
  const heldUnits = nonNegativeSafeInteger(wallet.heldUnits);
  const pendingUnits = nonNegativeSafeInteger(wallet.pendingUnits);
  if (
    spendableUnits !== safeAdd(safeAdd(paidCoins, bonusCoins), rewardCoins)
  ) {
    return invalidProjection();
  }
  if (
    wallet.status === "not_created"
    && (
      version !== 0
      || paidCoins !== 0
      || bonusCoins !== 0
      || rewardCoins !== 0
      || spendableUnits !== 0
      || heldUnits !== 0
      || pendingUnits !== 0
    )
  ) {
    return invalidProjection();
  }
  return {
    status: wallet.status as PortalWalletStatus,
    version,
    balances: {
      paidCoins,
      bonusCoins,
      rewardCoins
    },
    spendableUnits,
    heldUnits,
    pendingUnits
  };
}

function ledgerEntryProjection(input: unknown): PortalWalletLedgerEntry {
  const value = exactObject(input, [
    "entryRef",
    "category",
    "coinType",
    "amountUnits",
    "availableDeltaUnits",
    "pendingDeltaUnits",
    "heldDeltaUnits",
    "totalDeltaUnits",
    "relatedOrderRef",
    "occurredAt"
  ]);
  if (!LEDGER_CATEGORIES.has(value.category as PortalWalletLedgerCategory)) {
    return invalidProjection();
  }
  if (!COIN_TYPES.has(value.coinType as PortalWalletLedgerEntry["coinType"])) {
    return invalidProjection();
  }
  const entryRef = normalizedReference(value.entryRef);
  const category = value.category as PortalWalletLedgerCategory;
  const coinType = value.coinType as PortalWalletLedgerEntry["coinType"];
  const amountUnits = positiveSafeInteger(value.amountUnits);
  const totalDeltaUnits = signedSafeInteger(value.totalDeltaUnits);
  const relatedOrderRef = value.relatedOrderRef === null
    ? null
    : normalizedReference(value.relatedOrderRef);
  const occurredAt = utcTimestamp(value.occurredAt);
  const common = {
    entryRef,
    coinType,
    amountUnits,
    relatedOrderRef,
    occurredAt
  };
  if (category === "credit") {
    if (
      value.availableDeltaUnits !== null
      || value.pendingDeltaUnits !== null
      || value.heldDeltaUnits !== null
      || totalDeltaUnits !== amountUnits
    ) {
      return invalidProjection();
    }
    return {
      ...common,
      category: "credit",
      availableDeltaUnits: null,
      pendingDeltaUnits: null,
      heldDeltaUnits: null,
      totalDeltaUnits
    };
  }

  const availableDeltaUnits = signedSafeInteger(value.availableDeltaUnits);
  const pendingDeltaUnits = signedSafeInteger(value.pendingDeltaUnits);
  const heldDeltaUnits = signedSafeInteger(value.heldDeltaUnits);
  let expected: readonly [number, number, number, number];
  switch (category) {
    case "pending_to_available":
      expected = [amountUnits, -amountUnits, 0, 0];
      break;
    case "available_to_held":
      expected = [-amountUnits, 0, amountUnits, 0];
      break;
    case "held_to_available":
      expected = [amountUnits, 0, -amountUnits, 0];
      break;
    case "held_to_consumed":
    case "held_to_expired":
      expected = [0, 0, -amountUnits, -amountUnits];
      break;
    case "available_to_expired":
      expected = [-amountUnits, 0, 0, -amountUnits];
      break;
  }
  if (
    availableDeltaUnits !== expected[0]
    || pendingDeltaUnits !== expected[1]
    || heldDeltaUnits !== expected[2]
    || totalDeltaUnits !== expected[3]
  ) {
    return invalidProjection();
  }
  return {
    ...common,
    category,
    availableDeltaUnits,
    pendingDeltaUnits,
    heldDeltaUnits,
    totalDeltaUnits
  };
}

function ledgerPageProjection(
  input: unknown,
  requestBoundary: {
    limit: number;
    cursor: {
      afterOccurredAt: string;
      afterEntryRef: string;
    } | null;
  }
) {
  const value = exactObject(input, ["entries", "nextCursor"]);
  const entries = exactArray(value.entries).map(ledgerEntryProjection);
  if (entries.length > requestBoundary.limit) return invalidProjection();
  const seenEntryRefs = new Set<string>();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (seenEntryRefs.has(entry.entryRef)) return invalidProjection();
    seenEntryRefs.add(entry.entryRef);
    if (index === 0) continue;
    const previous = entries[index - 1];
    if (
      previous.occurredAt < entry.occurredAt
      || (
        previous.occurredAt === entry.occurredAt
        && previous.entryRef <= entry.entryRef
      )
    ) {
      return invalidProjection();
    }
  }
  const firstEntry = entries[0];
  if (
    firstEntry
    && requestBoundary.cursor
    && (
      firstEntry.occurredAt > requestBoundary.cursor.afterOccurredAt
      || (
        firstEntry.occurredAt === requestBoundary.cursor.afterOccurredAt
        && firstEntry.entryRef >= requestBoundary.cursor.afterEntryRef
      )
    )
  ) {
    return invalidProjection();
  }
  if (value.nextCursor === null) {
    return { entries, nextCursor: null };
  }
  const cursor = exactObject(value.nextCursor, [
    "afterOccurredAt",
    "afterEntryRef"
  ]);
  const nextCursor = {
    afterOccurredAt: utcTimestamp(cursor.afterOccurredAt),
    afterEntryRef: normalizedReference(cursor.afterEntryRef)
  };
  const finalEntry = entries.at(-1);
  if (
    !finalEntry
    || nextCursor.afterOccurredAt !== finalEntry.occurredAt
    || nextCursor.afterEntryRef !== finalEntry.entryRef
  ) {
    return invalidProjection();
  }
  return { entries, nextCursor };
}

function exactInput(input: unknown, fields: readonly string[]) {
  try {
    return exactObject(input, fields);
  } catch {
    throw requestFailed();
  }
}

function sessionReference(value: unknown) {
  if (typeof value !== "string" || !SESSION_REFERENCE.test(value)) {
    throw requestFailed();
  }
  return value;
}

function ledgerInput(input: unknown) {
  let hasOccurredAt: boolean;
  let hasEntryRef: boolean;
  try {
    if (!input || typeof input !== "object") throw requestFailed();
    const keys = Reflect.ownKeys(input);
    hasOccurredAt = keys.includes("afterOccurredAt");
    hasEntryRef = keys.includes("afterEntryRef");
  } catch {
    throw requestFailed();
  }
  if (hasOccurredAt !== hasEntryRef) throw requestFailed();
  return exactInput(
    input,
    hasOccurredAt
      ? [
          "sessionRef",
          "limit",
          "afterOccurredAt",
          "afterEntryRef"
        ]
      : ["sessionRef", "limit"]
  );
}

function callerLimit(value: unknown) {
  try {
    const limit = positiveSafeInteger(value);
    if (limit > 100) throw requestFailed();
    return limit;
  } catch {
    throw requestFailed();
  }
}

function callerTimestamp(value: unknown) {
  try {
    return utcTimestamp(value);
  } catch {
    throw requestFailed();
  }
}

function callerReference(value: unknown) {
  try {
    return normalizedReference(value);
  } catch {
    throw requestFailed();
  }
}

function getInit(sessionRef: string): RequestInit {
  return {
    method: "GET",
    headers: { "X-Portal-Session": sessionRef }
  };
}

function legacyConsoleAuthError(
  input: unknown,
  status: number
) {
  if (status !== 401) return null;
  try {
    const body = exactObject(input, ["error"]);
    return body.error === "Unauthorized"
      ? new PortalWalletClientError("wallet_unavailable", true)
      : null;
  } catch {
    return null;
  }
}

function structuredWalletError(input: unknown, status: number) {
  const wrapper = exactObject(input, ["error"]);
  const error = exactObject(wrapper.error, ["code", "retryable"]);
  if (
    typeof error.code !== "string"
    || typeof error.retryable !== "boolean"
    || !WALLET_ERROR_CONTRACT.has(error.code as PortalWalletErrorCode)
  ) {
    return invalidProjection();
  }
  const code = error.code as PortalWalletErrorCode;
  const contract = WALLET_ERROR_CONTRACT.get(code)!;
  if (
    contract.status !== status
    || contract.retryable !== error.retryable
  ) {
    return invalidProjection();
  }
  return new PortalWalletClientError(code, contract.retryable);
}

async function request<T>(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  project: (input: unknown) => T
): Promise<T> {
  let body: unknown;
  let ok: boolean;
  let status: number;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WALLET_READ_TIMEOUT_MS);
  try {
    // The deadline covers headers and body, and aborts the real fetch rather
    // than leaving an orphaned request behind a Promise.race timeout.
    const response = await fetchFn(url, { ...init, signal: controller.signal });
    if (controller.signal.aborted) throw requestFailed();
    ok = response.ok;
    status = response.status;
    if (
      typeof ok !== "boolean"
      || !Number.isSafeInteger(status)
      || status < 100
      || status > 599
    ) {
      throw requestFailed();
    }
    const text = await response.text();
    if (controller.signal.aborted) throw requestFailed();
    if (typeof text !== "string") throw requestFailed();
    body = JSON.parse(text) as unknown;
  } catch {
    throw requestFailed();
  } finally {
    clearTimeout(timeout);
  }
  if (!ok) {
    const legacyError = legacyConsoleAuthError(body, status);
    if (legacyError) throw legacyError;
    try {
      throw structuredWalletError(body, status);
    } catch (error) {
      if (
        error instanceof PortalWalletClientError
        && error.code !== "wallet_request_failed"
      ) {
        throw error;
      }
      throw requestFailed();
    }
  }
  if (status !== 200) throw requestFailed();
  try {
    return project(body);
  } catch {
    throw requestFailed();
  }
}

export function createPortalWalletClient(
  options: { fetchFn?: typeof fetch } = {}
): PortalWalletClient {
  const fetchFn = options.fetchFn ?? fetch;
  return {
    async getSummary(input) {
      const value = exactInput(input, ["sessionRef"]);
      const sessionRef = sessionReference(value.sessionRef);
      return request(
        fetchFn,
        "/api/portal/coins/wallet",
        getInit(sessionRef),
        summaryProjection
      );
    },
    async listLedger(input) {
      const value = ledgerInput(input);
      const sessionRef = sessionReference(value.sessionRef);
      const limit = callerLimit(value.limit);
      const query = new URLSearchParams({ limit: String(limit) });
      let cursor: {
        afterOccurredAt: string;
        afterEntryRef: string;
      } | null = null;
      if (Object.hasOwn(value, "afterOccurredAt")) {
        cursor = {
          afterOccurredAt: callerTimestamp(value.afterOccurredAt),
          afterEntryRef: callerReference(value.afterEntryRef)
        };
        query.set(
          "afterOccurredAt",
          cursor.afterOccurredAt
        );
        query.set(
          "afterEntryRef",
          cursor.afterEntryRef
        );
      }
      return request(
        fetchFn,
        `/api/portal/coins/wallet/ledger?${query.toString()}`,
        getInit(sessionRef),
        (body) => ledgerPageProjection(body, { limit, cursor })
      );
    }
  };
}
