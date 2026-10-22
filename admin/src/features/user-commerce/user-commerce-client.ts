export type CommerceQuery = {
  accountId: string;
  from: string;
  to: string;
};

export type CommerceOrder = {
  orderRef: string;
  accountId: string;
  kind: "recharge" | "subscription";
  status: string;
  amountLabel: string;
  createdAt: string;
};

export type LedgerEntry = {
  entryRef: string;
  accountId: string;
  occurredAt: string;
  direction: "credit" | "debit";
  title: string;
  coins: string;
};

export type ShareUser = {
  accountId: string;
  registeredAt: string;
  linkLabel: string;
  firstRecharge: boolean;
};

export type SettlementSnapshot = {
  ratePercent: number;
  effectiveAt: string;
  availableRewardCoins: string;
};

export type UserCommerceClient = {
  readOrders(query: CommerceQuery, signal?: AbortSignal): Promise<CommerceOrder[]>;
  readLedger(query: CommerceQuery, signal?: AbortSignal): Promise<LedgerEntry[]>;
  readShareUsers(query: CommerceQuery, signal?: AbortSignal): Promise<ShareUser[]>;
  readSettlement(signal?: AbortSignal): Promise<SettlementSnapshot>;
  updateRate(input: { ratePercent: number; effectiveAt: string }, signal?: AbortSignal): Promise<SettlementSnapshot>;
  clawback(input: { accountId: string; coins: string; reason: string }, signal?: AbortSignal): Promise<{ clawbackRef: string; settlement: SettlementSnapshot }>;
};

export class UserCommerceError extends Error {
  constructor(readonly code: "unavailable" | "invalid" | "conflict" | "failed") {
    super(code);
  }
}

type FetchLike = typeof fetch;

const ROOT = "/api/admin/user-commerce";
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ACCOUNT = /^[A-Za-z0-9_-]{1,64}$/;
const REF = /^[A-Za-z0-9_-]{1,64}$/;
const COINS = /^[1-9]\d{0,11}$/;
const LABEL = /^[^\u0000-\u001f\u007f]{1,32}$/;

function exactKeys(value: object, keys: string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function accountId(value: unknown): string {
  if (typeof value !== "string" || !ACCOUNT.test(value)) throw new UserCommerceError("invalid");
  return value;
}

function day(value: unknown, name: string): string {
  if (typeof value !== "string" || !DAY.test(value)) throw new UserCommerceError("invalid");
  if (name === "to") return value;
  return value;
}

function query(input: CommerceQuery): CommerceQuery {
  const from = day(input.from, "from");
  const to = day(input.to, "to");
  if (from > to) throw new UserCommerceError("invalid");
  return { accountId: accountId(input.accountId), from, to };
}

function text(value: unknown, pattern: RegExp): string {
  if (typeof value !== "string" || !pattern.test(value)) throw new UserCommerceError("invalid");
  return value;
}

function settlement(value: unknown): SettlementSnapshot {
  if (!value || typeof value !== "object" || !exactKeys(value, ["ratePercent", "effectiveAt", "availableRewardCoins"])) {
    throw new UserCommerceError("invalid");
  }
  const row = value as SettlementSnapshot;
  if (typeof row.ratePercent !== "number" || !Number.isFinite(row.ratePercent) || row.ratePercent < 0 || row.ratePercent > 100) {
    throw new UserCommerceError("invalid");
  }
  if (Math.round(row.ratePercent * 10) !== row.ratePercent * 10) throw new UserCommerceError("invalid");
  if (!DAY.test(row.effectiveAt)) throw new UserCommerceError("invalid");
  if (!/^\d{1,12}$/.test(row.availableRewardCoins)) throw new UserCommerceError("invalid");
  return { ratePercent: row.ratePercent, effectiveAt: row.effectiveAt, availableRewardCoins: row.availableRewardCoins };
}

function orders(value: unknown): CommerceOrder[] {
  if (!value || typeof value !== "object" || !exactKeys(value, ["orders"])) throw new UserCommerceError("invalid");
  const rows = (value as { orders: unknown }).orders;
  if (!Array.isArray(rows) || rows.length > 100) throw new UserCommerceError("invalid");
  return rows.map((row) => {
    if (!row || typeof row !== "object" || !exactKeys(row, ["orderRef", "accountId", "kind", "status", "amountLabel", "createdAt"])) {
      throw new UserCommerceError("invalid");
    }
    const order = row as CommerceOrder;
    if (order.kind !== "recharge" && order.kind !== "subscription") throw new UserCommerceError("invalid");
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(order.createdAt)) throw new UserCommerceError("invalid");
    return {
      orderRef: text(order.orderRef, REF),
      accountId: accountId(order.accountId),
      kind: order.kind,
      status: text(order.status, LABEL),
      amountLabel: text(order.amountLabel, LABEL),
      createdAt: order.createdAt
    };
  });
}

function entries(value: unknown): LedgerEntry[] {
  if (!value || typeof value !== "object" || !exactKeys(value, ["entries"])) throw new UserCommerceError("invalid");
  const rows = (value as { entries: unknown }).entries;
  if (!Array.isArray(rows) || rows.length > 100) throw new UserCommerceError("invalid");
  return rows.map((row) => {
    if (!row || typeof row !== "object" || !exactKeys(row, ["entryRef", "accountId", "occurredAt", "direction", "title", "coins"])) {
      throw new UserCommerceError("invalid");
    }
    const entry = row as LedgerEntry;
    if (entry.direction !== "credit" && entry.direction !== "debit") throw new UserCommerceError("invalid");
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(entry.occurredAt)) throw new UserCommerceError("invalid");
    if (!/^\d{1,12}$/.test(entry.coins)) throw new UserCommerceError("invalid");
    return {
      entryRef: text(entry.entryRef, REF),
      accountId: accountId(entry.accountId),
      occurredAt: entry.occurredAt,
      direction: entry.direction,
      title: text(entry.title, LABEL),
      coins: entry.coins
    };
  });
}

function shareUsers(value: unknown): ShareUser[] {
  if (!value || typeof value !== "object" || !exactKeys(value, ["users"])) throw new UserCommerceError("invalid");
  const rows = (value as { users: unknown }).users;
  if (!Array.isArray(rows) || rows.length > 100) throw new UserCommerceError("invalid");
  return rows.map((row) => {
    if (!row || typeof row !== "object" || !exactKeys(row, ["accountId", "registeredAt", "linkLabel", "firstRecharge"])) {
      throw new UserCommerceError("invalid");
    }
    const user = row as ShareUser;
    if (typeof user.firstRecharge !== "boolean") throw new UserCommerceError("invalid");
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(user.registeredAt)) throw new UserCommerceError("invalid");
    return {
      accountId: accountId(user.accountId),
      registeredAt: user.registeredAt,
      linkLabel: text(user.linkLabel, LABEL),
      firstRecharge: user.firstRecharge
    };
  });
}

async function request(fetcher: FetchLike, path: string, init: RequestInit | undefined, signal?: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(path, { ...init, signal, cache: "no-store", headers: { accept: "application/json", ...init?.headers } });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new UserCommerceError("failed");
  }
  if (response.status === 404 || response.status === 501 || response.status === 503) throw new UserCommerceError("unavailable");
  if (response.status === 409) throw new UserCommerceError("conflict");
  if (!response.ok) throw new UserCommerceError(response.status === 400 ? "invalid" : "failed");
  try {
    return await response.json();
  } catch {
    throw new UserCommerceError("invalid");
  }
}

export function createUserCommerceClient(options: { fetcher?: FetchLike } = {}): UserCommerceClient {
  const fetcher = options.fetcher ?? fetch;
  const search = (input: CommerceQuery) => {
    const parsed = query(input);
    return `accountId=${encodeURIComponent(parsed.accountId)}&from=${parsed.from}&to=${parsed.to}`;
  };
  return {
    async readOrders(input, signal) {
      return request(fetcher, `${ROOT}/orders?${search(input)}`, undefined, signal).then(orders);
    },
    async readLedger(input, signal) {
      return request(fetcher, `${ROOT}/ledger?${search(input)}`, undefined, signal).then(entries);
    },
    async readShareUsers(input, signal) {
      return request(fetcher, `${ROOT}/share-users?${search(input)}`, undefined, signal).then(shareUsers);
    },
    readSettlement(signal) {
      return request(fetcher, `${ROOT}/settlement`, undefined, signal).then(settlement);
    },
    updateRate(input, signal) {
      if (!DAY.test(input.effectiveAt) || typeof input.ratePercent !== "number" || input.ratePercent < 0 || input.ratePercent > 100 || Math.round(input.ratePercent * 10) !== input.ratePercent * 10) {
        return Promise.reject(new UserCommerceError("invalid"));
      }
      return request(fetcher, `${ROOT}/settlement-rate`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ratePercent: input.ratePercent, effectiveAt: input.effectiveAt })
      }, signal).then(settlement);
    },
    clawback(input, signal) {
      if (!ACCOUNT.test(input.accountId) || !COINS.test(input.coins) || !LABEL.test(input.reason)) {
        return Promise.reject(new UserCommerceError("invalid"));
      }
      return request(fetcher, `${ROOT}/reward-clawbacks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId: input.accountId, coins: input.coins, reason: input.reason })
      }, signal).then((value) => {
        if (!value || typeof value !== "object" || !exactKeys(value, ["clawbackRef", "settlement"])) throw new UserCommerceError("invalid");
        const row = value as { clawbackRef: unknown; settlement: unknown };
        return { clawbackRef: text(row.clawbackRef, REF), settlement: settlement(row.settlement) };
      });
    }
  };
}
