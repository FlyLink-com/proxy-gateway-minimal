const GENERATED_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UTC_DAY = /^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/;
const UNAVAILABLE_METRICS = ["platformHealth", "channelCoverage", "freshnessP95", "riskCandidates"] as const;
const FORBIDDEN_DATA_KEYS = ["nodes", "token", "password", "secret", "subscriptionUrl", "email", "accounts", "channelRef", "sourceRef"];

export type RegistrationPoint = {
  at: string;
  registeredCount: number;
  otherCreatedCount: number;
};

export type RegistrationGrowth =
  | {
      availability: "ready";
      from: string;
      to: string;
      registeredCount: number;
      otherCreatedCount: number;
      points: RegistrationPoint[];
    }
  | {
      availability: "not_authorized" | "unavailable";
    };

export type TrafficCollectorSummary =
  | { availability: "ready" | "partial"; observedAt: string }
  | { availability: "not_connected" | "unknown"; observedAt: null };

export type OperationsDashboardSummary = {
  generatedAt: string;
  subscriptions: {
    total: number;
    active: number;
    expiring: number;
    disabledOrExpired: number;
  };
  registrationGrowth: RegistrationGrowth;
  trafficCollector: TrafficCollectorSummary;
};

export type OperationsDashboardReadCode = "session" | "permission" | "not_mounted" | "unavailable" | "invalid";

export class OperationsDashboardReadError extends Error {
  readonly code: OperationsDashboardReadCode;
  readonly status: number | null;

  constructor(code: OperationsDashboardReadCode, status: number | null = null) {
    super(code);
    this.name = "OperationsDashboardReadError";
    this.code = code;
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function count(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new OperationsDashboardReadError("invalid");
  }
  return value;
}

function requireNotConnected(value: unknown) {
  if (!isRecord(value) || value.availability !== "not_connected") {
    throw new OperationsDashboardReadError("invalid");
  }
  if ("value" in value || "total" in value || "count" in value) {
    throw new OperationsDashboardReadError("invalid");
  }
}

function growthPoint(value: unknown): RegistrationPoint {
  if (!isRecord(value) || value.coverage !== "queried" || typeof value.at !== "string" || !UTC_DAY.test(value.at)) {
    throw new OperationsDashboardReadError("invalid");
  }
  return {
    at: value.at,
    registeredCount: count(value.registeredCount),
    otherCreatedCount: count(value.otherCreatedCount)
  };
}

function registrationGrowth(value: unknown): RegistrationGrowth {
  if (!isRecord(value)) throw new OperationsDashboardReadError("invalid");
  if (value.availability === "not_authorized" || value.availability === "unavailable") {
    if ("points" in value || "registeredCount" in value || "otherCreatedCount" in value || "value" in value) {
      throw new OperationsDashboardReadError("invalid");
    }
    return { availability: value.availability };
  }
  if (
    value.availability !== "ready"
    || value.timezone !== "UTC"
    || value.definition !== "account_created_at"
    || typeof value.from !== "string"
    || typeof value.to !== "string"
    || !Array.isArray(value.points)
  ) {
    throw new OperationsDashboardReadError("invalid");
  }
  const points = value.points.map(growthPoint);
  const registeredCount = count(value.registeredCount);
  const otherCreatedCount = count(value.otherCreatedCount);
  return { availability: "ready", from: value.from, to: value.to, registeredCount, otherCreatedCount, points };
}

function trafficCollector(value: unknown): TrafficCollectorSummary {
  if (!isRecord(value)) throw new OperationsDashboardReadError("invalid");
  for (const key of ["channelRef", "sourceRef", "collectors", "producers", "token", "email"]) {
    if (key in value) throw new OperationsDashboardReadError("invalid");
  }
  if (value.availability === "not_connected" || value.availability === "unknown") {
    if (value.observedAt !== null || "value" in value) throw new OperationsDashboardReadError("invalid");
    return { availability: value.availability, observedAt: null };
  }
  if (
    (value.availability !== "ready" && value.availability !== "partial")
    || typeof value.observedAt !== "string"
    || !GENERATED_AT.test(value.observedAt)
  ) {
    throw new OperationsDashboardReadError("invalid");
  }
  return { availability: value.availability, observedAt: value.observedAt };
}

export function parseOperationsDashboardSummary(body: unknown): OperationsDashboardSummary {
  if (!isRecord(body)) throw new OperationsDashboardReadError("invalid");
  if (body.schemaVersion !== "operations-dashboard-summary/v1") throw new OperationsDashboardReadError("invalid");
  if (body.freshness !== "partial" || body.sourceState !== "implemented_source") {
    throw new OperationsDashboardReadError("invalid");
  }
  if (typeof body.generatedAt !== "string" || !GENERATED_AT.test(body.generatedAt)) {
    throw new OperationsDashboardReadError("invalid");
  }
  if (!Array.isArray(body.warnings) || !body.warnings.some((item) => isRecord(item) && item.code === "source_partial")) {
    throw new OperationsDashboardReadError("invalid");
  }
  if (!isRecord(body.access) || body.access.allowed !== true || body.access.capability !== "operations.read" || body.access.reasonCode !== "allowed") {
    throw new OperationsDashboardReadError("invalid");
  }
  if (!isRecord(body.data)) throw new OperationsDashboardReadError("invalid");
  for (const key of Object.keys(body.data)) {
    if (FORBIDDEN_DATA_KEYS.includes(key)) throw new OperationsDashboardReadError("invalid");
  }
  const subscriptions = body.data.subscriptions;
  if (!isRecord(subscriptions) || subscriptions.availability !== "ready" || subscriptions.definition !== "subscription_tenants") {
    throw new OperationsDashboardReadError("invalid");
  }
  for (const metric of UNAVAILABLE_METRICS) requireNotConnected(body.data[metric]);
  return {
    generatedAt: body.generatedAt,
    subscriptions: {
      total: count(subscriptions.total),
      active: count(subscriptions.active),
      expiring: count(subscriptions.expiring),
      disabledOrExpired: count(subscriptions.disabledOrExpired)
    },
    registrationGrowth: registrationGrowth(body.data.registrationGrowth),
    trafficCollector: trafficCollector(body.data.trafficCollector)
  };
}

export async function readOperationsDashboardSummary(options: {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  from?: string;
  to?: string;
} = {}) {
  const fetcher = options.fetcher ?? fetch;
  const params = new URLSearchParams();
  if (options.from) params.set("from", options.from);
  if (options.to) params.set("to", options.to);
  const path = params.size > 0
    ? `/api/admin/operations/dashboard-summary?${params.toString()}`
    : "/api/admin/operations/dashboard-summary";
  let response: Response;
  try {
    response = await fetcher(path, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      signal: options.signal
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new OperationsDashboardReadError("unavailable");
  }
  if (response.status === 400) throw new OperationsDashboardReadError("invalid", 400);
  if (response.status === 401) throw new OperationsDashboardReadError("session", 401);
  if (response.status === 403) throw new OperationsDashboardReadError("permission", 403);
  if (response.status === 404) throw new OperationsDashboardReadError("not_mounted", 404);
  if (!response.ok) throw new OperationsDashboardReadError("unavailable", response.status);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new OperationsDashboardReadError("invalid", response.status);
  }
  try {
    return parseOperationsDashboardSummary(body);
  } catch (error) {
    if (error instanceof OperationsDashboardReadError) {
      throw new OperationsDashboardReadError(error.code, response.status);
    }
    throw new OperationsDashboardReadError("invalid", response.status);
  }
}
