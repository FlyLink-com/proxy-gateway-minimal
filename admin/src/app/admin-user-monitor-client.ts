const ROOT = "/api/admin/platform/user-monitor";
export const USER_MONITOR_SCHEMA_VERSION = "admin-user-monitor/v1";
const MAX_RANGE_MS = 31 * 24 * 60 * 60 * 1000;
const SAFE_REF = /^[A-Za-z0-9._:-]{1,128}$/;
const CURSOR_RE = /^[A-Za-z0-9_-]{1,512}$/;
const UNSAFE = /https?:\/\/|subscriptionurl|token=|secret|password|edgecred_|bearer|materialref|\bcredential\b/i;
const OFFSET_DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/;
const MESSAGES = {
  session: "Admin session required.",
  permission: "Admin permission denied.",
  unavailable: "Admin user monitor is unavailable.",
  invalid: "Admin user monitor response is invalid.",
  network: "Admin user monitor request failed."
} as const;
const ACCOUNT_STATUS = new Set(["active", "suspended", "disabled"]);
const REG_SOURCE = new Set(["self_service_portal", "other"]);
const WALLET_STATUS = new Set(["not_created", "active", "frozen", "closed"]);
const COIN_TYPE = new Set(["paid_coins", "bonus_coins", "reward_coins"]);
const CATEGORY = new Set([
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
const TRAFFIC_STATE = new Set(["not_collected", "measured_zero", "measured"]);
const BUCKET = new Set(["hour", "day"]);

export type UserMonitorErrorCode = "session" | "permission" | "unavailable" | "invalid" | "network";
export type UserMonitorAccountStatus = "active" | "suspended" | "disabled";
export type UserMonitorRegistrationSource = "self_service_portal" | "other";
export type UserMonitorWalletStatus = "not_created" | "active" | "frozen" | "closed";
export type UserMonitorCoinType = "paid_coins" | "bonus_coins" | "reward_coins";
export type UserMonitorLedgerCategory =
  | "credit"
  | "pending_to_reversed"
  | "available_to_reversed"
  | "pending_to_available"
  | "available_to_held"
  | "held_to_available"
  | "held_to_consumed"
  | "held_to_expired"
  | "available_to_expired";
export type UserMonitorTrafficState = "not_collected" | "measured_zero" | "measured";
export type UserMonitorBucket = "hour" | "day";
export type UserMonitorRange = { from: string; to: string };
export type UserMonitorDirectoryQuery = {
  accountId?: string;
  status?: UserMonitorAccountStatus;
  cursor?: string;
  limit?: number;
};
export type UserMonitorLedgerQuery = { cursor?: string; limit?: number };
export type UserMonitorTrafficQuery = UserMonitorRange & { bucket?: UserMonitorBucket };
export type UserMonitorGrowthPoint = { at: string; registeredCount: number; otherCreatedCount: number };
export type UserMonitorGrowth = {
  generatedAt: string;
  from: string;
  to: string;
  timezone: "UTC";
  registeredCount: number;
  otherCreatedCount: number;
  points: UserMonitorGrowthPoint[];
};
export type UserMonitorAccount = {
  id: string;
  status: UserMonitorAccountStatus;
  createdAt: string;
  registrationSource: UserMonitorRegistrationSource;
};
export type UserMonitorAccountsPage = {
  generatedAt: string;
  items: UserMonitorAccount[];
  nextCursor: string | null;
};
export type UserMonitorWallet = {
  status: UserMonitorWalletStatus;
  version: number;
  balances: { paidCoins: number; bonusCoins: number; rewardCoins: number };
  spendableUnits: number;
  heldUnits: number;
  pendingUnits: number;
};
export type UserMonitorLedgerEntry = {
  entryRef: string;
  occurredAt: string;
  category: UserMonitorLedgerCategory;
  coinType: UserMonitorCoinType;
  amountUnits: number;
  availableDeltaUnits: number | null;
  pendingDeltaUnits: number | null;
  heldDeltaUnits: number | null;
  totalDeltaUnits: number;
};
export type UserMonitorCoins = {
  generatedAt: string;
  accountId: string;
  wallet: UserMonitorWallet;
  entries: UserMonitorLedgerEntry[];
  nextCursor: string | null;
};
export type UserMonitorTrafficPoint = {
  at: string;
  sampleCount: number;
  uploadBytes: number;
  downloadBytes: number;
  totalBytes: number;
};
export type UserMonitorTraffic = {
  generatedAt: string;
  accountId: string;
  from: string;
  to: string;
  bucket: UserMonitorBucket;
  state: UserMonitorTrafficState;
  sampleCount: number;
  lastObservedAt: string | null;
  totalBytes: number | null;
  uploadBytes: number | null;
  downloadBytes: number | null;
  points: UserMonitorTrafficPoint[];
};

export class UserMonitorReadError extends Error {
  readonly code: UserMonitorErrorCode;
  constructor(code: UserMonitorErrorCode) {
    super(MESSAGES[code]);
    this.name = "UserMonitorReadError";
    this.code = code;
  }
}

export class AdminUserMonitorClient {
  private readonly fetcher: typeof fetch;
  constructor(options?: { fetcher?: typeof fetch }) {
    this.fetcher = options?.fetcher ?? fetch;
  }
  growth(range: UserMonitorRange, signal?: AbortSignal) {
    return readGrowth(this.fetcher, range, signal);
  }
  accounts(query?: UserMonitorDirectoryQuery, signal?: AbortSignal) {
    return readAccounts(this.fetcher, query, signal);
  }
  coins(accountId: string, query?: UserMonitorLedgerQuery, signal?: AbortSignal) {
    return readCoins(this.fetcher, accountId, query, signal);
  }
  traffic(accountId: string, range: UserMonitorTrafficQuery, signal?: AbortSignal) {
    return readTraffic(this.fetcher, accountId, range, signal);
  }
}

export type UserMonitorClient = AdminUserMonitorClient;

export function createAdminUserMonitorClient(options?: { fetcher?: typeof fetch }) {
  return new AdminUserMonitorClient(options);
}

export function isUserMonitorAccountId(value: string): boolean {
  const text = value.trim();
  return Boolean(text) && SAFE_REF.test(text) && !UNSAFE.test(text) && !text.includes("@");
}

export function parseUserMonitorUtcInput(value: string): string | null {
  const text = value.trim();
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)
    ? `${text}:00Z`
    : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(text)
      ? `${text}Z`
      : text;
  const date = parseOffsetDateTime(iso);
  return date ? date.toISOString() : null;
}

export function parseUserMonitorRange(fromRaw: string, toRaw: string): UserMonitorRange | null {
  const fromDate = parseOffsetDateTime(fromRaw);
  const toDate = parseOffsetDateTime(toRaw);
  if (!fromDate || !toDate) return null;
  const fromMs = fromDate.getTime();
  const toMs = toDate.getTime();
  if (!(fromMs < toMs) || toMs - fromMs > MAX_RANGE_MS) return null;
  return { from: fromDate.toISOString(), to: toDate.toISOString() };
}

function fail(code: UserMonitorErrorCode): never {
  throw new UserMonitorReadError(code);
}

function abortError(): never {
  throw new DOMException("The operation was aborted.", "AbortError");
}

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  return (error instanceof DOMException || error instanceof Error) && error.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function readJson(
  fetcher: typeof fetch,
  path: string,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  if (signal?.aborted) abortError();
  const init: RequestInit = {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error"
  };
  if (signal) init.signal = signal;
  let response: Response;
  try {
    response = await fetcher(path, init);
  } catch (error) {
    if (isAbortError(error, signal)) abortError();
    fail("network");
  }
  if (signal?.aborted) abortError();
  if (response.status === 401) fail("session");
  if (response.status === 403) fail("permission");
  if (response.status === 404 || response.status === 503) fail("unavailable");
  if (response.status === 400) fail("invalid");
  if (response.status !== 200) fail("network");
  let text = "";
  try {
    text = await response.text();
  } catch (error) {
    if (isAbortError(error, signal)) abortError();
    fail("invalid");
  }
  if (signal?.aborted) abortError();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) as unknown : null;
  } catch {
    fail("invalid");
  }
  if (signal?.aborted) abortError();
  if (!isRecord(body) || Object.hasOwn(body, "error")) fail("invalid");
  return body;
}

function envelope(body: Record<string, unknown>): string {
  if (body.schemaVersion !== USER_MONITOR_SCHEMA_VERSION) fail("invalid");
  return requiredIso(body.generatedAt);
}

async function readGrowth(fetcher: typeof fetch, range: UserMonitorRange, signal?: AbortSignal) {
  const q = validatedRange(range);
  const search = new URLSearchParams();
  search.set("from", q.from);
  search.set("to", q.to);
  const body = await readJson(fetcher, `${ROOT}/growth?${search.toString()}`, signal);
  return mapGrowth(body, q);
}

async function readAccounts(fetcher: typeof fetch, query?: UserMonitorDirectoryQuery, signal?: AbortSignal) {
  const q = validatedDirectory(query);
  const search = new URLSearchParams();
  if (q.accountId) search.set("accountId", q.accountId);
  if (q.status) search.set("status", q.status);
  if (q.cursor) search.set("cursor", q.cursor);
  search.set("limit", String(q.limit));
  const body = await readJson(fetcher, `${ROOT}/accounts?${search.toString()}`, signal);
  return mapAccounts(body, q);
}

async function readCoins(
  fetcher: typeof fetch,
  accountId: string,
  query?: UserMonitorLedgerQuery,
  signal?: AbortSignal
) {
  const id = requiredAccountId(accountId);
  const q = validatedLedger(query);
  const search = new URLSearchParams();
  if (q.cursor) search.set("cursor", q.cursor);
  search.set("limit", String(q.limit));
  const body = await readJson(
    fetcher,
    `${ROOT}/accounts/${encodeURIComponent(id)}/coins?${search.toString()}`,
    signal
  );
  return mapCoins(body, id, q.limit);
}

async function readTraffic(
  fetcher: typeof fetch,
  accountId: string,
  range: UserMonitorTrafficQuery,
  signal?: AbortSignal
) {
  const id = requiredAccountId(accountId);
  const q = validatedTraffic(range);
  const search = new URLSearchParams();
  search.set("from", q.from);
  search.set("to", q.to);
  search.set("bucket", q.bucket);
  const body = await readJson(
    fetcher,
    `${ROOT}/accounts/${encodeURIComponent(id)}/traffic?${search.toString()}`,
    signal
  );
  return mapTraffic(body, id, q);
}

function validatedRange(range: UserMonitorRange): UserMonitorRange {
  if (!isRecord(range)) fail("invalid");
  const fromRaw = optionalQueryString(range.from);
  const toRaw = optionalQueryString(range.to);
  if (!fromRaw || !toRaw) fail("invalid");
  const parsed = parseUserMonitorRange(fromRaw, toRaw);
  if (!parsed) fail("invalid");
  return parsed;
}

function validatedDirectory(query?: UserMonitorDirectoryQuery): {
  accountId?: string;
  status?: UserMonitorAccountStatus;
  cursor?: string;
  limit: number;
} {
  if (query === undefined) return { limit: 20 };
  if (!isRecord(query)) fail("invalid");
  const accountRaw = optionalQueryString(query.accountId);
  const statusRaw = optionalQueryString(query.status);
  const cursorRaw = optionalQueryString(query.cursor);
  const next: {
    accountId?: string;
    status?: UserMonitorAccountStatus;
    cursor?: string;
    limit: number;
  } = { limit: limitOf(query.limit) };
  if (accountRaw !== undefined) next.accountId = requiredAccountId(accountRaw);
  if (statusRaw !== undefined) next.status = requiredEnum<UserMonitorAccountStatus>(statusRaw, ACCOUNT_STATUS);
  if (cursorRaw !== undefined) next.cursor = requiredCursor(cursorRaw);
  return next;
}

function validatedLedger(query?: UserMonitorLedgerQuery): { cursor?: string; limit: number } {
  if (query === undefined) return { limit: 20 };
  if (!isRecord(query)) fail("invalid");
  const cursorRaw = optionalQueryString(query.cursor);
  const next: { cursor?: string; limit: number } = { limit: limitOf(query.limit) };
  if (cursorRaw !== undefined) next.cursor = requiredCursor(cursorRaw);
  return next;
}

function validatedTraffic(range: UserMonitorTrafficQuery): UserMonitorRange & { bucket: UserMonitorBucket } {
  if (!isRecord(range)) fail("invalid");
  const next = validatedRange(range);
  const bucketRaw = optionalQueryString(range.bucket);
  const bucket: UserMonitorBucket = bucketRaw === undefined
    ? "day"
    : requiredEnum<UserMonitorBucket>(bucketRaw, BUCKET);
  return { ...next, bucket };
}

function optionalQueryString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") fail("invalid");
  const text = value.trim();
  return text ? text : undefined;
}

function limitOf(value: unknown): number {
  if (value === undefined) return 20;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 100) fail("invalid");
  return value;
}

function requiredAccountId(value: unknown): string {
  if (typeof value !== "string" || !isUserMonitorAccountId(value)) fail("invalid");
  return value.trim();
}

function requiredCursor(value: string): string {
  if (!CURSOR_RE.test(value) || UNSAFE.test(value)) fail("invalid");
  return value;
}

function requiredEnum<T extends string>(value: unknown, allowed: Set<string>): T {
  if (typeof value !== "string" || !allowed.has(value) || UNSAFE.test(value)) fail("invalid");
  return value as T;
}

function requiredIso(value: unknown): string {
  if (typeof value !== "string") fail("invalid");
  const date = parseOffsetDateTime(value);
  if (!date) fail("invalid");
  return date.toISOString();
}

function isoOrNull(value: unknown): string | null {
  if (value === null) return null;
  return requiredIso(value);
}

function requiredNonnegInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) fail("invalid");
  return value;
}

function requiredSafeInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) fail("invalid");
  return value;
}

function deltaOf(value: unknown): number | null {
  if (value === null) return null;
  return requiredSafeInt(value);
}

function cursorOrNull(value: unknown): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string") fail("invalid");
  return requiredCursor(value);
}

function mapArray<T>(value: unknown, map: (entry: unknown) => T, max: number): T[] {
  if (!Array.isArray(value) || value.length > max) fail("invalid");
  return value.map(map);
}

function addSafe(left: number, right: number): number {
  const sum = left + right;
  if (!Number.isSafeInteger(sum)) fail("invalid");
  return sum;
}

function requiredPositiveInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) fail("invalid");
  return value;
}

function floorUtc(ms: number, bucket: UserMonitorBucket): number {
  const date = new Date(ms);
  if (bucket === "hour") {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours());
  }
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function expectedGrowthAts(fromIso: string, toIso: string): string[] {
  const toMs = Date.parse(toIso);
  const ats: string[] = [];
  for (let time = floorUtc(Date.parse(fromIso), "day"); time < toMs; time += 86_400_000) {
    ats.push(new Date(time).toISOString());
  }
  return ats;
}

function uniqueSortedDesc(ids: string[], keys: Array<readonly [string, string]>): void {
  if (new Set(ids).size !== ids.length) fail("invalid");
  for (let index = 1; index < keys.length; index++) {
    const prev = keys[index - 1];
    const curr = keys[index];
    if (prev[0] < curr[0]) fail("invalid");
    if (prev[0] === curr[0] && prev[1] <= curr[1]) fail("invalid");
  }
}

function expectedDeltas(
  category: UserMonitorLedgerCategory,
  amount: number
): [number | null, number | null, number | null, number] {
  switch (category) {
    case "credit":
      return [null, null, null, amount];
    case "pending_to_reversed":
      return [0, -amount, 0, -amount];
    case "available_to_reversed":
      return [-amount, 0, 0, -amount];
    case "pending_to_available":
      return [amount, -amount, 0, 0];
    case "available_to_held":
      return [-amount, 0, amount, 0];
    case "held_to_available":
      return [amount, 0, -amount, 0];
    case "held_to_consumed":
    case "held_to_expired":
      return [0, 0, -amount, -amount];
    case "available_to_expired":
      return [-amount, 0, 0, -amount];
  }
}

function mapGrowth(body: Record<string, unknown>, request: UserMonitorRange): UserMonitorGrowth {
  const generatedAt = envelope(body);
  if (body.timezone !== "UTC") fail("invalid");
  const registeredCount = requiredNonnegInt(body.registeredCount);
  const otherCreatedCount = requiredNonnegInt(body.otherCreatedCount);
  const points = mapArray(body.points, mapGrowthPoint, 40);
  const expected = expectedGrowthAts(request.from, request.to);
  if (points.length !== expected.length) fail("invalid");
  if (requiredIso(body.from) !== request.from || requiredIso(body.to) !== request.to) fail("invalid");
  let sumRegistered = 0;
  let sumOther = 0;
  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    if (point.at !== expected[index]) fail("invalid");
    sumRegistered = addSafe(sumRegistered, point.registeredCount);
    sumOther = addSafe(sumOther, point.otherCreatedCount);
  }
  if (sumRegistered !== registeredCount || sumOther !== otherCreatedCount) fail("invalid");
  return {
    generatedAt,
    from: request.from,
    to: request.to,
    timezone: "UTC",
    registeredCount,
    otherCreatedCount,
    points
  };
}

function mapGrowthPoint(value: unknown): UserMonitorGrowthPoint {
  if (!isRecord(value)) fail("invalid");
  return {
    at: requiredIso(value.at),
    registeredCount: requiredNonnegInt(value.registeredCount),
    otherCreatedCount: requiredNonnegInt(value.otherCreatedCount)
  };
}

function mapAccounts(
  body: Record<string, unknown>,
  query: { accountId?: string; status?: UserMonitorAccountStatus; limit: number }
): UserMonitorAccountsPage {
  const items = mapArray(body.items, mapAccount, 100);
  if (items.length > query.limit) fail("invalid");
  uniqueSortedDesc(items.map((item) => item.id), items.map((item) => [item.createdAt, item.id] as const));
  for (const item of items) {
    if (query.accountId && item.id !== query.accountId) fail("invalid");
    if (query.status && item.status !== query.status) fail("invalid");
  }
  return { generatedAt: envelope(body), items, nextCursor: cursorOrNull(body.nextCursor) };
}

function mapAccount(value: unknown): UserMonitorAccount {
  if (!isRecord(value)) fail("invalid");
  return {
    id: requiredAccountId(value.id),
    status: requiredEnum<UserMonitorAccountStatus>(value.status, ACCOUNT_STATUS),
    createdAt: requiredIso(value.createdAt),
    registrationSource: requiredEnum<UserMonitorRegistrationSource>(value.registrationSource, REG_SOURCE)
  };
}

function mapCoins(body: Record<string, unknown>, accountId: string, limit: number): UserMonitorCoins {
  const generatedAt = envelope(body);
  if (requiredAccountId(body.accountId) !== accountId) fail("invalid");
  const wallet = mapWallet(body.wallet);
  const entries = mapArray(body.entries, mapEntry, 100);
  if (entries.length > limit) fail("invalid");
  const nextCursor = cursorOrNull(body.nextCursor);
  if (entries.length === 0 && nextCursor !== null) fail("invalid");
  uniqueSortedDesc(
    entries.map((entry) => entry.entryRef),
    entries.map((entry) => [entry.occurredAt, entry.entryRef] as const)
  );
  if (wallet.status === "not_created" && (entries.length !== 0 || nextCursor !== null)) fail("invalid");
  return { generatedAt, accountId, wallet, entries, nextCursor };
}

function mapWallet(value: unknown): UserMonitorWallet {
  if (!isRecord(value) || !isRecord(value.balances)) fail("invalid");
  const status = requiredEnum<UserMonitorWalletStatus>(value.status, WALLET_STATUS);
  const paidCoins = requiredNonnegInt(value.balances.paidCoins);
  const bonusCoins = requiredNonnegInt(value.balances.bonusCoins);
  const rewardCoins = requiredNonnegInt(value.balances.rewardCoins);
  const spendableUnits = requiredNonnegInt(value.spendableUnits);
  const heldUnits = requiredNonnegInt(value.heldUnits);
  const pendingUnits = requiredNonnegInt(value.pendingUnits);
  const version = requiredNonnegInt(value.version);
  if (addSafe(addSafe(paidCoins, bonusCoins), rewardCoins) !== spendableUnits) fail("invalid");
  const wallet: UserMonitorWallet = {
    status,
    version,
    balances: { paidCoins, bonusCoins, rewardCoins },
    spendableUnits,
    heldUnits,
    pendingUnits
  };
  if (
    status === "not_created"
    && (
      version !== 0
      || wallet.balances.paidCoins !== 0
      || wallet.balances.bonusCoins !== 0
      || wallet.balances.rewardCoins !== 0
      || wallet.spendableUnits !== 0
      || wallet.heldUnits !== 0
      || wallet.pendingUnits !== 0
    )
  ) {
    fail("invalid");
  }
  return wallet;
}

function mapEntry(value: unknown): UserMonitorLedgerEntry {
  if (!isRecord(value)) fail("invalid");
  const amountUnits = requiredPositiveInt(value.amountUnits);
  const category = requiredEnum<UserMonitorLedgerCategory>(value.category, CATEGORY);
  const availableDeltaUnits = deltaOf(value.availableDeltaUnits);
  const pendingDeltaUnits = deltaOf(value.pendingDeltaUnits);
  const heldDeltaUnits = deltaOf(value.heldDeltaUnits);
  const totalDeltaUnits = requiredSafeInt(value.totalDeltaUnits);
  const expected = expectedDeltas(category, amountUnits);
  if (
    availableDeltaUnits !== expected[0]
    || pendingDeltaUnits !== expected[1]
    || heldDeltaUnits !== expected[2]
    || totalDeltaUnits !== expected[3]
  ) {
    fail("invalid");
  }
  return {
    entryRef: requiredAccountId(value.entryRef),
    occurredAt: requiredIso(value.occurredAt),
    category,
    coinType: requiredEnum<UserMonitorCoinType>(value.coinType, COIN_TYPE),
    amountUnits,
    availableDeltaUnits,
    pendingDeltaUnits,
    heldDeltaUnits,
    totalDeltaUnits
  };
}

function mapTraffic(
  body: Record<string, unknown>,
  accountId: string,
  request: UserMonitorRange & { bucket: UserMonitorBucket }
): UserMonitorTraffic {
  const generatedAt = envelope(body);
  if (requiredAccountId(body.accountId) !== accountId) fail("invalid");
  if (requiredIso(body.from) !== request.from || requiredIso(body.to) !== request.to) fail("invalid");
  if (requiredEnum<UserMonitorBucket>(body.bucket, BUCKET) !== request.bucket) fail("invalid");
  const state = requiredEnum<UserMonitorTrafficState>(body.state, TRAFFIC_STATE);
  const sampleCount = requiredNonnegInt(body.sampleCount);
  const points = mapArray(body.points, mapTrafficPoint, 800);
  const totalBytes = body.totalBytes === null ? null : requiredNonnegInt(body.totalBytes);
  const uploadBytes = body.uploadBytes === null ? null : requiredNonnegInt(body.uploadBytes);
  const downloadBytes = body.downloadBytes === null ? null : requiredNonnegInt(body.downloadBytes);
  const lastObservedAt = isoOrNull(body.lastObservedAt);
  const fromMs = Date.parse(request.from);
  const toMs = Date.parse(request.to);
  const duration = request.bucket === "hour" ? 3_600_000 : 86_400_000;
  let sumSamples = 0;
  let sumUpload = 0;
  let sumDownload = 0;
  let sumTotal = 0;
  let previousAt: string | null = null;
  for (const point of points) {
    if (point.sampleCount < 1) fail("invalid");
    if (addSafe(point.uploadBytes, point.downloadBytes) !== point.totalBytes) fail("invalid");
    const start = Date.parse(point.at);
    if (start !== floorUtc(start, request.bucket)) fail("invalid");
    if (!(start < toMs && start + duration > fromMs)) fail("invalid");
    if (previousAt !== null && !(previousAt < point.at)) fail("invalid");
    previousAt = point.at;
    sumSamples = addSafe(sumSamples, point.sampleCount);
    sumUpload = addSafe(sumUpload, point.uploadBytes);
    sumDownload = addSafe(sumDownload, point.downloadBytes);
    sumTotal = addSafe(sumTotal, point.totalBytes);
  }
  if (state === "not_collected") {
    if (
      sampleCount !== 0
      || points.length !== 0
      || totalBytes !== null
      || uploadBytes !== null
      || downloadBytes !== null
      || lastObservedAt !== null
    ) {
      fail("invalid");
    }
  } else if (state === "measured_zero") {
    if (sampleCount < 1 || points.length < 1 || totalBytes !== 0 || uploadBytes !== 0 || downloadBytes !== 0) {
      fail("invalid");
    }
    if (sumSamples !== sampleCount || sumUpload !== 0 || sumDownload !== 0 || sumTotal !== 0) fail("invalid");
  } else if (totalBytes === null || uploadBytes === null || downloadBytes === null || totalBytes < 1) {
    fail("invalid");
  } else {
    if (addSafe(uploadBytes, downloadBytes) !== totalBytes) fail("invalid");
    if (sumSamples !== sampleCount || sumUpload !== uploadBytes || sumDownload !== downloadBytes || sumTotal !== totalBytes) {
      fail("invalid");
    }
  }
  if (state !== "not_collected") {
    if (!lastObservedAt || points.length === 0) fail("invalid");
    const observed = Date.parse(lastObservedAt);
    const latest = Date.parse(points[points.length - 1].at);
    if (!(observed >= fromMs && observed < toMs)) fail("invalid");
    if (!(observed >= latest && observed < latest + duration)) fail("invalid");
  }
  return {
    generatedAt,
    accountId,
    from: request.from,
    to: request.to,
    bucket: request.bucket,
    state,
    sampleCount,
    lastObservedAt,
    totalBytes,
    uploadBytes,
    downloadBytes,
    points
  };
}

function mapTrafficPoint(value: unknown): UserMonitorTrafficPoint {
  if (!isRecord(value)) fail("invalid");
  return {
    at: requiredIso(value.at),
    sampleCount: requiredNonnegInt(value.sampleCount),
    uploadBytes: requiredNonnegInt(value.uploadBytes),
    downloadBytes: requiredNonnegInt(value.downloadBytes),
    totalBytes: requiredNonnegInt(value.totalBytes)
  };
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

function parseOffsetDateTime(value: string): Date | null {
  const text = value.trim();
  const match = OFFSET_DATETIME.exec(text);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (!isValidCalendarDate(year, month, day) || hour > 23 || minute > 59 || second > 59) return null;
  if (match[8] !== "Z") {
    const offsetHour = Number(match[8].slice(1, 3));
    const offsetMinute = Number(match[8].slice(4, 6));
    if (offsetHour > 14 || offsetMinute > 59) return null;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}
