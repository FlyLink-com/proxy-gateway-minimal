const PATH = "/api/admin/platform/user-monitor/usage-ledger-summary";
export const USAGE_LEDGER_SCHEMA_VERSION = "admin-usage-ledger/v1";
const MAX_RESPONSE_BYTES = 262_144;
const SIGNED64_MAX = 9223372036854775807n;
const SIGNED64_MIN = -9223372036854775808n;
const CANONICAL_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UNSIGNED_BYTES = /^(0|[1-9]\d{0,18})$/;
const SIGNED_BYTES = /^-?(0|[1-9]\d{0,18})$/;
const WINDOW_IDS = ["all_time", "last_24h", "last_7d", "month_to_date"] as const;
const CATEGORIES = ["local_vless", "local_hy2", "local_tuic", "sgp_vless", "sgp_hy2", "other_sources"] as const;
const SAMPLE_STATES = new Set(["not_collected", "measured_zero", "measured"]);
const RECON_STATES = new Set(["totals_match", "totals_mismatch"]);
const COVERAGE = Object.freeze({
  customerClassification: "not_available",
  population: "all_recorded_accounts",
  sourceClassification: "stored_pairs_not_current_activation",
  thirdPartyUsage: "not_metered_here",
  missingIntervals: "unknown",
  collectorHealth: "not_assessed",
  timestamps: "observation_time_not_commit_time",
  emptySamples: "not_proven_zero_consumption",
  reconciliation: "aggregate_totals_only"
});
const MESSAGES = {
  session: "Admin session required.",
  permission: "Admin permission denied.",
  unavailable: "Admin usage ledger is unavailable.",
  invalid: "Admin usage ledger response is invalid.",
  network: "Admin usage ledger request failed."
} as const;

export type UsageLedgerErrorCode = keyof typeof MESSAGES;
export type UsageLedgerWindowId = (typeof WINDOW_IDS)[number];
export type UsageLedgerCategory = (typeof CATEGORIES)[number];
export type UsageLedgerSampleState = "not_collected" | "measured_zero" | "measured";
export type UsageLedgerReconciliationState = "totals_match" | "totals_mismatch";

export type UsageLedgerMetrics = {
  state: UsageLedgerSampleState;
  sampleCount: number;
  positiveAccountCount: number;
  uploadBytes: string;
  downloadBytes: string;
  totalBytes: string;
  latestObservedAt: string | null;
};

export type UsageLedgerSource = UsageLedgerMetrics & {
  category: UsageLedgerCategory;
};

export type UsageLedgerWindow = UsageLedgerMetrics & {
  id: UsageLedgerWindowId;
  from: string | null;
  to: string;
  sources: UsageLedgerSource[];
};

export type UsageLedgerByteTotals = {
  uploadBytes: string;
  downloadBytes: string;
  totalBytes: string;
};

export type UsageLedgerReconciliation = {
  scope: "entire_database_snapshot";
  aggregateOnly: true;
  state: UsageLedgerReconciliationState;
  samples: UsageLedgerByteTotals & { sampleCount: number };
  rollups: UsageLedgerByteTotals & { rollupCount: number };
  differenceBytes: UsageLedgerByteTotals;
  futureSampleCount: number;
  atCutoffSampleCount: number;
  orphanSampleAccountCount: number;
  orphanRollupAccountCount: number;
};

export type UsageLedgerCoverage = {
  customerClassification: "not_available";
  population: "all_recorded_accounts";
  sourceClassification: "stored_pairs_not_current_activation";
  thirdPartyUsage: "not_metered_here";
  missingIntervals: "unknown";
  collectorHealth: "not_assessed";
  timestamps: "observation_time_not_commit_time";
  emptySamples: "not_proven_zero_consumption";
  reconciliation: "aggregate_totals_only";
};

export type AdminUsageLedgerSummary = {
  schemaVersion: "admin-usage-ledger/v1";
  cutoff: string;
  timezone: "UTC";
  unit: "bytes";
  windows: UsageLedgerWindow[];
  reconciliation: UsageLedgerReconciliation;
  coverage: UsageLedgerCoverage;
};

export class UsageLedgerReadError extends Error {
  readonly code: UsageLedgerErrorCode;
  constructor(code: UsageLedgerErrorCode) {
    super(MESSAGES[code]);
    this.name = "UsageLedgerReadError";
    this.code = code;
  }
}

export type UsageLedgerClient = {
  summary(signal?: AbortSignal): Promise<AdminUsageLedgerSummary>;
};

export class AdminUsageLedgerClient implements UsageLedgerClient {
  private readonly fetcher: typeof fetch;
  constructor(options?: { fetcher?: typeof fetch }) {
    this.fetcher = options?.fetcher ?? fetch;
  }
  summary(signal?: AbortSignal) {
    return readSummary(this.fetcher, signal);
  }
}

export function createAdminUsageLedgerClient(options?: { fetcher?: typeof fetch }) {
  return new AdminUsageLedgerClient(options);
}

function fail(code: UsageLedgerErrorCode): never {
  throw new UsageLedgerReadError(code);
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

function canonicalIso(value: unknown): value is string {
  if (typeof value !== "string" || !CANONICAL_UTC.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

async function readBoundedResponse(response: Response, signal?: AbortSignal): Promise<string> {
  if (!response.body) fail("invalid");
  const reader = response.body.getReader();
  const bytes = new Uint8Array(MAX_RESPONSE_BYTES);
  let received = 0;
  let cancelled = false;
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    // A stalled or rejected producer cleanup must not delay a safe failure.
    void reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    if (signal?.aborted) abortError();
    while (true) {
      const { done, value } = await reader.read();
      if (signal?.aborted) abortError();
      if (done) break;
      if (value.byteLength > MAX_RESPONSE_BYTES - received) fail("invalid");
      bytes.set(value, received);
      received += value.byteLength;
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, received));
  } catch (error) {
    cancel();
    throw error;
  } finally {
    signal?.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

async function readSummary(fetcher: typeof fetch, signal?: AbortSignal): Promise<AdminUsageLedgerSummary> {
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
    response = await fetcher(PATH, init);
  } catch (error) {
    if (isAbortError(error, signal)) abortError();
    fail("network");
  }
  if (signal?.aborted) abortError();
  if (response.status === 401) fail("session");
  if (response.status === 403) fail("permission");
  if (response.status === 404 || response.status === 503 || response.status === 429) fail("unavailable");
  if (response.status !== 200) fail("network");
  let text = "";
  try {
    text = await readBoundedResponse(response, signal);
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
  return mapSummary(body);
}

function mapSummary(body: Record<string, unknown>): AdminUsageLedgerSummary {
  if (body.schemaVersion !== USAGE_LEDGER_SCHEMA_VERSION) fail("invalid");
  if (body.timezone !== "UTC" || body.unit !== "bytes") fail("invalid");
  if (!canonicalIso(body.cutoff)) fail("invalid");
  const cutoff = body.cutoff;
  const expected = expectedWindows(cutoff);
  const rawWindows = body.windows;
  if (!Array.isArray(rawWindows) || rawWindows.length !== WINDOW_IDS.length) fail("invalid");
  const windows = WINDOW_IDS.map((id, index) => {
    const window = mapWindow(rawWindows[index], expected[index]);
    if (window.id !== id) fail("invalid");
    return window;
  });
  const reconciliation = mapReconciliation(body.reconciliation);
  return {
    schemaVersion: USAGE_LEDGER_SCHEMA_VERSION,
    cutoff,
    timezone: "UTC",
    unit: "bytes",
    windows,
    reconciliation,
    coverage: mapCoverage(body.coverage)
  };
}

function expectedWindows(cutoff: string): Array<{ id: UsageLedgerWindowId; from: string | null; to: string }> {
  const timestamp = Date.parse(cutoff);
  const from24h = new Date(timestamp - 86_400_000).toISOString();
  const from7d = new Date(timestamp - 7 * 86_400_000).toISOString();
  const monthFrom = `${cutoff.slice(0, 7)}-01T00:00:00.000Z`;
  if (!canonicalIso(from24h) || !canonicalIso(from7d) || !canonicalIso(monthFrom)) fail("invalid");
  return [
    { id: "all_time", from: null, to: cutoff },
    { id: "last_24h", from: from24h, to: cutoff },
    { id: "last_7d", from: from7d, to: cutoff },
    { id: "month_to_date", from: monthFrom, to: cutoff }
  ];
}

function mapWindow(
  value: unknown,
  expected: { id: UsageLedgerWindowId; from: string | null; to: string }
): UsageLedgerWindow {
  if (!isRecord(value)) fail("invalid");
  if (value.id !== expected.id || value.to !== expected.to) fail("invalid");
  if (expected.from === null) {
    if (value.from !== null) fail("invalid");
  } else if (value.from !== expected.from) fail("invalid");
  if (expected.from !== null && expected.from > expected.to) fail("invalid");
  const metrics = mapMetrics(value, expected.from, expected.to);
  const rawSources = value.sources;
  if (!Array.isArray(rawSources) || rawSources.length !== CATEGORIES.length) fail("invalid");
  const sources = CATEGORIES.map((category, index) => {
    const source = mapSource(rawSources[index], expected.from, expected.to);
    if (source.category !== category) fail("invalid");
    return source;
  });
  assertSourceConservation(metrics, sources);
  return {
    id: expected.id,
    from: expected.from,
    to: expected.to,
    state: metrics.state,
    sampleCount: metrics.sampleCount,
    positiveAccountCount: metrics.positiveAccountCount,
    uploadBytes: metrics.uploadBytes,
    downloadBytes: metrics.downloadBytes,
    totalBytes: metrics.totalBytes,
    latestObservedAt: metrics.latestObservedAt,
    sources
  };
}

function mapSource(value: unknown, from: string | null, to: string): UsageLedgerSource {
  if (!isRecord(value)) fail("invalid");
  if (typeof value.category !== "string") fail("invalid");
  const metrics = mapMetrics(value, from, to);
  return {
    category: value.category as UsageLedgerCategory,
    state: metrics.state,
    sampleCount: metrics.sampleCount,
    positiveAccountCount: metrics.positiveAccountCount,
    uploadBytes: metrics.uploadBytes,
    downloadBytes: metrics.downloadBytes,
    totalBytes: metrics.totalBytes,
    latestObservedAt: metrics.latestObservedAt
  };
}

function mapMetrics(value: Record<string, unknown>, from: string | null, to: string): UsageLedgerMetrics {
  const sampleCount = requiredCount(value.sampleCount);
  const positiveAccountCount = requiredCount(value.positiveAccountCount);
  const uploadBytes = requiredUnsignedBytes(value.uploadBytes);
  const downloadBytes = requiredUnsignedBytes(value.downloadBytes);
  const totalBytes = requiredUnsignedBytes(value.totalBytes);
  if (addChecked(uploadBytes.value, downloadBytes.value) !== totalBytes.value) fail("invalid");
  if (positiveAccountCount > sampleCount) fail("invalid");
  const latestObservedAt = isoOrNull(value.latestObservedAt);
  const expectedState = sampleCount === 0 ? "not_collected" : totalBytes.value === 0n ? "measured_zero" : "measured";
  if (!SAMPLE_STATES.has(value.state as string) || value.state !== expectedState) fail("invalid");
  if (sampleCount === 0) {
    if (latestObservedAt !== null || positiveAccountCount !== 0 || totalBytes.value !== 0n) fail("invalid");
  } else {
    if (!latestObservedAt) fail("invalid");
    const observed = Date.parse(latestObservedAt);
    const toMs = Date.parse(to);
    if (!(observed < toMs)) fail("invalid");
    if (from !== null && observed < Date.parse(from)) fail("invalid");
    if (expectedState === "measured" && positiveAccountCount < 1) fail("invalid");
    if (expectedState === "measured_zero" && positiveAccountCount !== 0) fail("invalid");
  }
  if (from !== null && from === to && sampleCount !== 0) fail("invalid");
  return {
    state: expectedState,
    sampleCount,
    positiveAccountCount,
    uploadBytes: uploadBytes.text,
    downloadBytes: downloadBytes.text,
    totalBytes: totalBytes.text,
    latestObservedAt
  };
}

function assertSourceConservation(window: UsageLedgerMetrics, sources: UsageLedgerSource[]): void {
  let sampleCount = 0;
  let upload = 0n;
  let download = 0n;
  let total = 0n;
  let latest: string | null = null;
  for (const source of sources) {
    sampleCount += source.sampleCount;
    if (!Number.isSafeInteger(sampleCount)) fail("invalid");
    upload = addChecked(upload, BigInt(source.uploadBytes));
    download = addChecked(download, BigInt(source.downloadBytes));
    total = addChecked(total, BigInt(source.totalBytes));
    if (source.latestObservedAt && (latest === null || source.latestObservedAt > latest)) {
      latest = source.latestObservedAt;
    }
  }
  if (sampleCount !== window.sampleCount) fail("invalid");
  if (upload.toString() !== window.uploadBytes) fail("invalid");
  if (download.toString() !== window.downloadBytes) fail("invalid");
  if (total.toString() !== window.totalBytes) fail("invalid");
  if (latest !== window.latestObservedAt) fail("invalid");
}

function mapReconciliation(value: unknown): UsageLedgerReconciliation {
  if (!isRecord(value)) fail("invalid");
  if (value.scope !== "entire_database_snapshot" || value.aggregateOnly !== true) fail("invalid");
  if (typeof value.state !== "string" || !RECON_STATES.has(value.state)) fail("invalid");
  const samples = mapCountedTotals(value.samples, "sampleCount");
  const rollups = mapCountedTotals(value.rollups, "rollupCount");
  if (!isRecord(value.differenceBytes)) fail("invalid");
  const differenceBytes = {
    uploadBytes: requiredSignedBytes(value.differenceBytes.uploadBytes),
    downloadBytes: requiredSignedBytes(value.differenceBytes.downloadBytes),
    totalBytes: requiredSignedBytes(value.differenceBytes.totalBytes)
  };
  const expectedUpload = BigInt(samples.uploadBytes) - BigInt(rollups.uploadBytes);
  const expectedDownload = BigInt(samples.downloadBytes) - BigInt(rollups.downloadBytes);
  const expectedTotal = BigInt(samples.totalBytes) - BigInt(rollups.totalBytes);
  if (expectedUpload.toString() !== differenceBytes.uploadBytes) fail("invalid");
  if (expectedDownload.toString() !== differenceBytes.downloadBytes) fail("invalid");
  if (expectedTotal.toString() !== differenceBytes.totalBytes) fail("invalid");
  if (addChecked(expectedUpload, expectedDownload) !== expectedTotal) fail("invalid");
  const matched = differenceBytes.uploadBytes === "0"
    && differenceBytes.downloadBytes === "0"
    && differenceBytes.totalBytes === "0";
  if (matched !== (value.state === "totals_match")) fail("invalid");
  return {
    scope: "entire_database_snapshot",
    aggregateOnly: true,
    state: matched ? "totals_match" : "totals_mismatch",
    samples: {
      sampleCount: samples.count,
      uploadBytes: samples.uploadBytes,
      downloadBytes: samples.downloadBytes,
      totalBytes: samples.totalBytes
    },
    rollups: {
      rollupCount: rollups.count,
      uploadBytes: rollups.uploadBytes,
      downloadBytes: rollups.downloadBytes,
      totalBytes: rollups.totalBytes
    },
    differenceBytes,
    futureSampleCount: requiredCount(value.futureSampleCount),
    atCutoffSampleCount: requiredCount(value.atCutoffSampleCount),
    orphanSampleAccountCount: requiredCount(value.orphanSampleAccountCount),
    orphanRollupAccountCount: requiredCount(value.orphanRollupAccountCount)
  };
}

function mapCountedTotals(value: unknown, countKey: "sampleCount" | "rollupCount") {
  if (!isRecord(value)) fail("invalid");
  const uploadBytes = requiredUnsignedBytes(value.uploadBytes);
  const downloadBytes = requiredUnsignedBytes(value.downloadBytes);
  const totalBytes = requiredUnsignedBytes(value.totalBytes);
  if (addChecked(uploadBytes.value, downloadBytes.value) !== totalBytes.value) fail("invalid");
  return {
    count: requiredCount(value[countKey]),
    uploadBytes: uploadBytes.text,
    downloadBytes: downloadBytes.text,
    totalBytes: totalBytes.text
  };
}

function mapCoverage(value: unknown): UsageLedgerCoverage {
  if (!isRecord(value)) fail("invalid");
  for (const [key, expected] of Object.entries(COVERAGE)) {
    if (value[key] !== expected) fail("invalid");
  }
  return { ...COVERAGE };
}

function requiredCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) fail("invalid");
  return value;
}

function requiredUnsignedBytes(value: unknown): { text: string; value: bigint } {
  if (typeof value !== "string" || !UNSIGNED_BYTES.test(value)) fail("invalid");
  const parsed = BigInt(value);
  if (parsed < 0n || parsed > SIGNED64_MAX || parsed.toString() !== value) fail("invalid");
  return { text: value, value: parsed };
}

function requiredSignedBytes(value: unknown): string {
  if (typeof value !== "string" || !SIGNED_BYTES.test(value)) fail("invalid");
  const parsed = BigInt(value);
  if (parsed < SIGNED64_MIN || parsed > SIGNED64_MAX || parsed.toString() !== value) fail("invalid");
  return value;
}

function addChecked(left: bigint, right: bigint): bigint {
  const sum = left + right;
  if (sum > SIGNED64_MAX || sum < SIGNED64_MIN) fail("invalid");
  return sum;
}

function isoOrNull(value: unknown): string | null {
  if (value === null) return null;
  if (!canonicalIso(value)) fail("invalid");
  return value;
}
