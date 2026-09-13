const ACCOUNTS_PATH = "/api/admin/platform/accounts";
const ENTITLEMENTS_PATH = "/api/admin/platform/entitlements";
const USAGE_PATH = "/api/admin/platform/subscription-usage-monitor";
const COLLECTORS_PATH = "/api/admin/platform/traffic-collector-status";
const MAX_QUERY_RANGE_MS = 31 * 24 * 60 * 60 * 1000;
const SAFE_REF = /^[A-Za-z0-9._:-]{1,128}$/;
const MILLISECOND_EPOCH = /^\d{13}$/;
const UNSAFE_TEXT = /https?:\/\/|subscriptionurl|token=|secret|password|edgecred_|bearer|materialref|\bcredential\b/i;
const MONITOR_READ_MESSAGES = {
  session: "Admin session required.",
  permission: "Admin permission denied.",
  unavailable: "Admin monitor is unavailable.",
  invalid: "Admin monitor response is invalid.",
  network: "Admin monitor request failed."
} as const;
const USAGE_STATES = new Set([
  "not_collected",
  "measured_zero",
  "measured",
  "collector_disabled",
  "stale"
]);
const COLLECTOR_AVAILABILITY = new Set([
  "available",
  "not_configured",
  "not_observed",
  "invalid_observation"
]);
const COLLECTOR_HEALTH = new Set(["healthy", "degraded", "failed"]);
const COLLECTOR_REASONS = new Set([
  "ok",
  "idle_no_user_traffic",
  "config_error",
  "sidecar_idle",
  "auth_error",
  "authentication_failed",
  "collector_exception",
  "controller_error",
  "controller_forbidden",
  "controller_unauthorized",
  "credential_binding_missing",
  "mapping_unresolved",
  "missing_stats",
  "node_aggregate_only",
  "per_credential_usage_entries_required",
  "runtime_down",
  "runtime_fetch_failed",
  "traffic_stats_forbidden",
  "traffic_stats_unauthorized",
  "unresolved_binding",
  "validation_error",
  "xray_stats_query_failed"
]);
const ACCOUNT_STATUSES = new Set([
  "active",
  "pending",
  "pending_review",
  "suspended",
  "disabled",
  "expired",
  "revoked",
  "locked",
  "blocked"
]);
const ENTITLEMENT_STATUSES = new Set([
  "active",
  "pending",
  "suspended",
  "disabled",
  "expired",
  "revoked"
]);
const OFFSET_DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/;

export type MonitorQuery = {
  from?: string;
  to?: string;
  nodeId?: string;
  bucket?: "hour" | "day";
};

export type MonitorAccount = {
  id: string;
  status: string;
  entitlementCount: number | null;
  usableEntitlementCount: number | null;
};

export type MonitorEntitlement = {
  id: string;
  accountId: string;
  plan: string | null;
  status: string;
  usable: boolean | null;
  validUntil: string | null;
};

export type MonitorUsageRow = {
  accountId: string;
  entitlementId: string;
  plan: string | null;
  status: string;
  usedBytes: number | null;
  observedAt: string | null;
};

export type MonitorPoint = {
  at: string;
  uploadBytes: number | null;
  downloadBytes: number | null;
  totalBytes: number | null;
};

export type MonitorUsage = {
  items: MonitorUsageRow[];
  points: MonitorPoint[];
  generatedAt: string | null;
  from: string | null;
  to: string | null;
};

export type MonitorCollector = {
  name: string;
  state: string;
  observedAt: string | null;
  reasons: string[];
};

export type MonitorCollectors = {
  state: string;
  observedAt: string | null;
  collectors: MonitorCollector[];
  reasons: string[];
};

export class MonitorReadError extends Error {
  readonly code: "session" | "permission" | "unavailable" | "invalid" | "network";

  constructor(code: "session" | "permission" | "unavailable" | "invalid" | "network") {
    super(MONITOR_READ_MESSAGES[code]);
    this.name = "MonitorReadError";
    this.code = code;
  }
}

export function createAdminMonitorReadClient(options?: { fetcher?: typeof fetch }): {
  accounts(signal: AbortSignal): Promise<MonitorAccount[]>;
  entitlements(signal: AbortSignal): Promise<MonitorEntitlement[]>;
  usage(signal: AbortSignal, query?: MonitorQuery): Promise<MonitorUsage>;
  collectors(signal: AbortSignal): Promise<MonitorCollectors>;
} {
  const fetcher = options?.fetcher ?? fetch;

  return {
    async accounts(signal: AbortSignal) {
      const body = await readJson(fetcher, ACCOUNTS_PATH, signal);
      return mapRecords(body.items, mapAccount);
    },
    async entitlements(signal: AbortSignal) {
      const body = await readJson(fetcher, ENTITLEMENTS_PATH, signal);
      return mapRecords(body.items, mapEntitlement);
    },
    async usage(signal: AbortSignal, query?: MonitorQuery) {
      const body = await readJson(fetcher, usagePath(query), signal);
      return mapUsage(body);
    },
    async collectors(signal: AbortSignal) {
      const body = await readJson(fetcher, COLLECTORS_PATH, signal);
      return mapCollectors(body);
    }
  };
}

function fail(code: MonitorReadError["code"]): never {
  throw new MonitorReadError(code);
}

function abortError(): never {
  throw new DOMException("The operation was aborted.", "AbortError");
}

function isAbortError(error: unknown, signal: AbortSignal): boolean {
  if (signal.aborted) return true;
  return (error instanceof DOMException || error instanceof Error) && error.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function readJson(
  fetcher: typeof fetch,
  path: string,
  signal: AbortSignal
): Promise<Record<string, unknown>> {
  if (signal.aborted) abortError();

  let response: Response;
  try {
    response = await fetcher(path, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      signal
    });
  } catch (error) {
    if (isAbortError(error, signal)) abortError();
    fail("network");
  }

  if (signal.aborted) abortError();
  if (response.status === 401) fail("session");
  if (response.status === 403) fail("permission");
  if (response.status === 404 || response.status === 503) fail("unavailable");
  if (response.status !== 200) fail("network");

  let text = "";
  try {
    text = await response.text();
  } catch (error) {
    if (isAbortError(error, signal)) abortError();
    fail("invalid");
  }
  if (signal.aborted) abortError();

  let body: unknown;
  try {
    body = text ? JSON.parse(text) as unknown : null;
  } catch (error) {
    if (isAbortError(error, signal)) abortError();
    fail("invalid");
  }
  if (signal.aborted) abortError();
  if (!isRecord(body) || Object.hasOwn(body, "error")) fail("invalid");
  return body;
}

function usagePath(query?: MonitorQuery): string {
  const params = validatedQuery(query);
  const search = new URLSearchParams();
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);
  if (params.nodeId) search.set("nodeId", params.nodeId);
  if (params.bucket) search.set("bucket", params.bucket);
  const encoded = search.toString();
  return encoded ? `${USAGE_PATH}?${encoded}` : USAGE_PATH;
}

function validatedQuery(query?: MonitorQuery): {
  from?: string;
  to?: string;
  nodeId?: string;
  bucket?: "hour" | "day";
} {
  if (query === undefined) return {};
  if (!isRecord(query)) fail("invalid");

  const fromRaw = optionalQueryString(query.from);
  const toRaw = optionalQueryString(query.to);
  const nodeRaw = optionalQueryString(query.nodeId);
  const bucketRaw = optionalQueryString(query.bucket);
  if ((fromRaw === undefined) !== (toRaw === undefined)) fail("invalid");
  const from = fromRaw === undefined ? undefined : requiredIso(fromRaw);
  const to = toRaw === undefined ? undefined : requiredIso(toRaw);
  if (from && to) {
    const fromMs = Date.parse(from);
    const toMs = Date.parse(to);
    if (!(fromMs < toMs) || toMs - fromMs > MAX_QUERY_RANGE_MS) fail("invalid");
  }

  let nodeId: string | undefined;
  if (nodeRaw !== undefined) {
    nodeId = safeRef(nodeRaw);
    if (!nodeId) fail("invalid");
  }

  let bucket: "hour" | "day" | undefined;
  if (bucketRaw !== undefined) {
    if (bucketRaw !== "hour" && bucketRaw !== "day") fail("invalid");
    bucket = bucketRaw;
  }

  return { from, to, nodeId, bucket };
}

function optionalQueryString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") fail("invalid");
  const text = value.trim();
  return text ? text : undefined;
}

function requiredIso(value: string): string {
  const date = parseOffsetDateTime(value);
  if (!date) fail("invalid");
  return date.toISOString();
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year
    && probe.getUTCMonth() === month - 1
    && probe.getUTCDate() === day
  );
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
  if (!isValidCalendarDate(year, month, day) || hour > 23 || minute > 59 || second > 59) {
    return null;
  }
  if (match[8] !== "Z") {
    const offsetHour = Number(match[8].slice(1, 3));
    const offsetMinute = Number(match[8].slice(4, 6));
    if (offsetHour > 14 || offsetMinute > 59) return null;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseTime(value: unknown): Date | null {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 1e12) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > 40) return null;
  if (MILLISECOND_EPOCH.test(text)) {
    const date = new Date(Number(text));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return parseOffsetDateTime(text);
}

function isoOrNull(value: unknown): string | null {
  if (value == null || value === "") return null;
  const date = parseTime(value);
  return date ? date.toISOString() : null;
}

function safeRef(value: unknown): string {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!text || !SAFE_REF.test(text) || UNSAFE_TEXT.test(text) || text.includes("@")) return "";
  return text;
}

function requiredRef(value: unknown): string {
  const ref = safeRef(value);
  if (!ref) fail("invalid");
  return ref;
}

function optionalUsageRef(value: unknown): string {
  if (value == null) return "";
  if (typeof value !== "string") fail("invalid");
  const text = value.trim();
  if (!text) return "";
  const ref = safeRef(text);
  if (!ref) fail("invalid");
  return ref;
}

function sanitizePlan(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > 120) return null;
  if (/[\u0000-\u001F\u007F<>]/.test(text) || text.includes("@") || UNSAFE_TEXT.test(text) || text.includes("://")) {
    return null;
  }
  return text;
}

function projectStatus(value: unknown, allowed: Set<string>): string {
  if (typeof value !== "string") return "unknown";
  const text = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!text || UNSAFE_TEXT.test(text) || text.includes("@") || !allowed.has(text)) {
    return "unknown";
  }
  return text;
}

function optionalCounter(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return null;
  return value;
}

function optionalBoolean(value: unknown): boolean | null {
  return value === true || value === false ? value : null;
}

function mapRecords<T>(value: unknown, map: (entry: unknown) => T): T[] {
  if (!Array.isArray(value)) fail("invalid");
  return value.map(map);
}

function mapAccount(value: unknown): MonitorAccount {
  if (!isRecord(value)) fail("invalid");
  if (typeof value.type === "string" && value.type !== "platform_account_summary") fail("invalid");
  return {
    id: requiredRef(value.id),
    status: projectStatus(value.status, ACCOUNT_STATUSES),
    entitlementCount: optionalCounter(value.entitlementCount),
    usableEntitlementCount: optionalCounter(value.usableEntitlementCount)
  };
}

function mapEntitlement(value: unknown): MonitorEntitlement {
  if (!isRecord(value)) fail("invalid");
  if (typeof value.type === "string" && value.type !== "platform_entitlement_summary") fail("invalid");
  return {
    id: requiredRef(value.id),
    accountId: requiredRef(value.accountId),
    plan: sanitizePlan(value.plan),
    status: projectStatus(value.status, ENTITLEMENT_STATUSES),
    usable: optionalBoolean(value.usable),
    validUntil: isoOrNull(value.validUntil)
  };
}

function usageStatus(row: Record<string, unknown>): string {
  if (row.usageStatus === "not_collected" && row.collectionStatus === "collector_disabled") {
    return "collector_disabled";
  }
  if (typeof row.usageStatus === "string" && USAGE_STATES.has(row.usageStatus)) {
    return row.usageStatus;
  }
  if (typeof row.collectionStatus === "string" && USAGE_STATES.has(row.collectionStatus)) {
    return row.collectionStatus;
  }
  return "unknown";
}

function mapUsedBytes(status: string, value: unknown): number | null {
  const bytes = optionalCounter(value);
  if (status === "measured_zero") return bytes === 0 ? 0 : null;
  if (status === "measured") return bytes === null || bytes === 0 ? null : bytes;
  return null;
}

function mapUsageRow(value: unknown): MonitorUsageRow {
  if (!isRecord(value)) fail("invalid");
  const status = usageStatus(value);
  return {
    accountId: optionalUsageRef(value.accountId),
    entitlementId: optionalUsageRef(value.entitlementId),
    plan: sanitizePlan(value.plan),
    status,
    usedBytes: mapUsedBytes(status, value.usedBytes),
    observedAt: isoOrNull(value.lastUsageObservedAt)
  };
}

function addOptional(left: number | null, right: number | null): number | null {
  if (left === null || right === null) return null;
  const sum = left + right;
  if (!Number.isSafeInteger(sum) || sum < 0) return null;
  return sum;
}

function mapPoints(value: unknown): MonitorPoint[] {
  if (!Array.isArray(value)) fail("invalid");
  const byAt = new Map<string, MonitorPoint>();
  for (const entry of value) {
    if (!isRecord(entry)) fail("invalid");
    const at = isoOrNull(entry.bucketStart);
    if (!at) continue;
    const next: MonitorPoint = {
      at,
      uploadBytes: optionalCounter(entry.uploadBytes),
      downloadBytes: optionalCounter(entry.downloadBytes),
      totalBytes: optionalCounter(entry.usedBytes)
    };
    const current = byAt.get(at);
    if (!current) {
      byAt.set(at, next);
      continue;
    }
    current.uploadBytes = addOptional(current.uploadBytes, next.uploadBytes);
    current.downloadBytes = addOptional(current.downloadBytes, next.downloadBytes);
    current.totalBytes = addOptional(current.totalBytes, next.totalBytes);
  }
  return [...byAt.values()].sort((left, right) => left.at.localeCompare(right.at));
}

function mapUsage(body: Record<string, unknown>): MonitorUsage {
  if (!isRecord(body.monitor)) fail("invalid");
  const monitor = body.monitor;
  if (typeof monitor.type === "string" && monitor.type !== "subscription_usage_monitor") {
    fail("invalid");
  }
  if (!isRecord(monitor.series)) fail("invalid");
  const range = isRecord(monitor.series.range) ? monitor.series.range : null;
  return {
    items: mapRecords(monitor.items, mapUsageRow),
    points: mapPoints(monitor.series.points),
    generatedAt: isoOrNull(monitor.generatedAt),
    from: range ? isoOrNull(range.from) : null,
    to: range ? isoOrNull(range.to) : null
  };
}

function knownOrUnknown(value: unknown, allowed: Set<string>): string {
  return typeof value === "string" && allowed.has(value) ? value : "unknown";
}

function mapReason(value: unknown): string {
  if (typeof value !== "string") return "unknown_reason";
  const code = value.trim().toLowerCase();
  return COLLECTOR_REASONS.has(code) ? code : "unknown_reason";
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function mapCollectorReasons(value: unknown): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) fail("invalid");
  return uniqueSorted(value.map(mapReason));
}

function mapCollector(value: unknown, snapshotObservedAt: string | null): MonitorCollector {
  if (!isRecord(value)) fail("invalid");
  const name = safeRef(value.channelRef) || safeRef(value.sourceRef);
  if (!name) fail("invalid");
  const reasons = mapCollectorReasons(value.reasonCodes);
  if (typeof value.condition === "string") {
    const condition = value.condition.trim().toLowerCase();
    if (COLLECTOR_REASONS.has(condition)) reasons.push(condition);
  }
  return {
    name,
    state: knownOrUnknown(value.health, COLLECTOR_HEALTH),
    observedAt: snapshotObservedAt,
    reasons: uniqueSorted(reasons)
  };
}

function mapCollectors(body: Record<string, unknown>): MonitorCollectors {
  if (!isRecord(body.collectorStatus)) fail("invalid");
  const status = body.collectorStatus;
  if (typeof status.type === "string" && status.type !== "traffic_collector_admin_projection") {
    fail("invalid");
  }
  const observedAt = isoOrNull(status.observedAt);
  const collectors = mapRecords(status.collectors, (entry) => mapCollector(entry, observedAt));
  return {
    state: knownOrUnknown(status.availability, COLLECTOR_AVAILABILITY),
    observedAt,
    collectors,
    reasons: uniqueSorted(collectors.flatMap((collector) => collector.reasons))
  };
}
