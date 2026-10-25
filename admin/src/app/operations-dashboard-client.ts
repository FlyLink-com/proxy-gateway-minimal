const GENERATED_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UNAVAILABLE_METRICS = ["platformHealth", "channelCoverage", "freshnessP95", "riskCandidates"] as const;
const FORBIDDEN_DATA_KEYS = ["nodes", "token", "password", "secret", "subscriptionUrl", "email", "accounts"];

export type OperationsDashboardSummary = {
  generatedAt: string;
  subscriptions: {
    total: number;
    active: number;
    expiring: number;
    disabledOrExpired: number;
  };
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
    }
  };
}

export async function readOperationsDashboardSummary(options: {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
} = {}) {
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher("/api/admin/operations/dashboard-summary", {
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
