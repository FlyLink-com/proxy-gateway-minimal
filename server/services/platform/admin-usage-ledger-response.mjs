const SCHEMA_VERSION = "admin-usage-ledger/v1";
const SIGNED64_MAX = 9223372036854775807n;
const SIGNED64_MIN = -9223372036854775808n;
const CANONICAL_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UNSIGNED_BYTES = /^(0|[1-9]\d{0,18})$/;
const SIGNED_BYTES = /^-?(0|[1-9]\d{0,18})$/;
const WINDOW_IDS = ["all_time", "last_24h", "last_7d", "month_to_date"];
const CATEGORIES = ["local_vless", "local_hy2", "local_tuic", "sgp_vless", "sgp_hy2", "other_sources"];
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

export class AdminUsageLedgerResponseError extends Error {
  constructor() {
    super("Admin usage ledger unavailable");
    this.code = "source_unavailable";
  }
}

function fail() {
  throw new AdminUsageLedgerResponseError();
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function canonicalIso(value) {
  if (typeof value !== "string" || !CANONICAL_UTC.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

/** Validate the worker contract and return only the fixed aggregate projection. */
export function validateAdminUsageLedgerResponse(value, expectedCutoff) {
  try {
    if (!isRecord(value) || Object.hasOwn(value, "error")) fail();
    if (value.schemaVersion !== SCHEMA_VERSION || value.timezone !== "UTC" || value.unit !== "bytes") fail();
    const cutoff = value.cutoff;
    if (!canonicalIso(expectedCutoff) || cutoff !== expectedCutoff) fail();
    const timestamp = Date.parse(cutoff);
    const starts = [null, new Date(timestamp - 86_400_000).toISOString(),
      new Date(timestamp - 7 * 86_400_000).toISOString(), `${cutoff.slice(0, 7)}-01T00:00:00.000Z`];
    if (starts.some((from) => from !== null && !canonicalIso(from))) fail();
    const rawWindows = value.windows;
    if (!Array.isArray(rawWindows) || rawWindows.length !== WINDOW_IDS.length) fail();
    const windows = WINDOW_IDS.map((id, index) => mapWindow(rawWindows[index], id, starts[index], cutoff));
    const reconciliation = mapReconciliation(value.reconciliation);
    const coverage = value.coverage;
    if (!isRecord(coverage)) fail();
    for (const [key, expected] of Object.entries(COVERAGE)) if (coverage[key] !== expected) fail();
    return {
      schemaVersion: SCHEMA_VERSION,
      cutoff,
      timezone: "UTC",
      unit: "bytes",
      windows,
      reconciliation,
      coverage: { ...COVERAGE }
    };
  } catch {
    // Never propagate a parser, property-access or other unexpected input error.
    fail();
  }
}

function mapWindow(value, id, from, to) {
  if (!isRecord(value) || value.id !== id || value.from !== from || value.to !== to) fail();
  if (from !== null && from > to) fail();
  const metrics = mapMetrics(value, from, to);
  const rawSources = value.sources;
  if (!Array.isArray(rawSources) || rawSources.length !== CATEGORIES.length) fail();
  const sources = CATEGORIES.map((category, index) => {
    const source = rawSources[index];
    if (!isRecord(source) || source.category !== category) fail();
    return { category, ...mapMetrics(source, from, to) };
  });
  assertSourceConservation(metrics, sources);
  return { id, from, to, ...metrics, sources };
}

function mapMetrics(value, from, to) {
  const sampleCount = requiredCount(value.sampleCount);
  const positiveAccountCount = requiredCount(value.positiveAccountCount);
  const uploadBytes = requiredUnsignedBytes(value.uploadBytes);
  const downloadBytes = requiredUnsignedBytes(value.downloadBytes);
  const totalBytes = requiredUnsignedBytes(value.totalBytes);
  if (addChecked(uploadBytes.value, downloadBytes.value) !== totalBytes.value) fail();
  if (positiveAccountCount > sampleCount) fail();
  const latestObservedAt = value.latestObservedAt;
  if (latestObservedAt !== null && !canonicalIso(latestObservedAt)) fail();
  const state = sampleCount === 0 ? "not_collected" : totalBytes.value === 0n ? "measured_zero" : "measured";
  if (value.state !== state) fail();
  if (sampleCount === 0) {
    if (latestObservedAt !== null || positiveAccountCount !== 0 || totalBytes.value !== 0n) fail();
  } else {
    if (latestObservedAt === null) fail();
    const observed = Date.parse(latestObservedAt);
    if (!(observed < Date.parse(to)) || (from !== null && observed < Date.parse(from))) fail();
    if (state === "measured" && positiveAccountCount < 1) fail();
    if (state === "measured_zero" && positiveAccountCount !== 0) fail();
  }
  if (from !== null && from === to && sampleCount !== 0) fail();
  return {
    state,
    sampleCount,
    positiveAccountCount,
    uploadBytes: uploadBytes.text,
    downloadBytes: downloadBytes.text,
    totalBytes: totalBytes.text,
    latestObservedAt
  };
}

function assertSourceConservation(window, sources) {
  let sampleCount = 0;
  let upload = 0n;
  let download = 0n;
  let total = 0n;
  let latest = null;
  for (const source of sources) {
    sampleCount += source.sampleCount;
    if (!Number.isSafeInteger(sampleCount)) fail();
    upload = addChecked(upload, BigInt(source.uploadBytes));
    download = addChecked(download, BigInt(source.downloadBytes));
    total = addChecked(total, BigInt(source.totalBytes));
    if (source.latestObservedAt && (latest === null || source.latestObservedAt > latest)) {
      latest = source.latestObservedAt;
    }
  }
  if (sampleCount !== window.sampleCount || upload.toString() !== window.uploadBytes
    || download.toString() !== window.downloadBytes || total.toString() !== window.totalBytes
    || latest !== window.latestObservedAt) fail();
}

function mapReconciliation(value) {
  if (!isRecord(value) || value.scope !== "entire_database_snapshot" || value.aggregateOnly !== true) fail();
  const state = value.state;
  if (state !== "totals_match" && state !== "totals_mismatch") fail();
  const samples = mapCountedTotals(value.samples, "sampleCount");
  const rollups = mapCountedTotals(value.rollups, "rollupCount");
  const rawDifference = value.differenceBytes;
  if (!isRecord(rawDifference)) fail();
  const differenceBytes = {
    uploadBytes: requiredSignedBytes(rawDifference.uploadBytes),
    downloadBytes: requiredSignedBytes(rawDifference.downloadBytes),
    totalBytes: requiredSignedBytes(rawDifference.totalBytes)
  };
  const expectedUpload = BigInt(samples.uploadBytes) - BigInt(rollups.uploadBytes);
  const expectedDownload = BigInt(samples.downloadBytes) - BigInt(rollups.downloadBytes);
  const expectedTotal = BigInt(samples.totalBytes) - BigInt(rollups.totalBytes);
  if (expectedUpload.toString() !== differenceBytes.uploadBytes
    || expectedDownload.toString() !== differenceBytes.downloadBytes
    || expectedTotal.toString() !== differenceBytes.totalBytes
    || addChecked(expectedUpload, expectedDownload) !== expectedTotal) fail();
  const matched = differenceBytes.uploadBytes === "0" && differenceBytes.downloadBytes === "0"
    && differenceBytes.totalBytes === "0";
  if (matched !== (state === "totals_match")) fail();
  return {
    scope: "entire_database_snapshot",
    aggregateOnly: true,
    state,
    samples,
    rollups,
    differenceBytes,
    futureSampleCount: requiredCount(value.futureSampleCount),
    atCutoffSampleCount: requiredCount(value.atCutoffSampleCount),
    orphanSampleAccountCount: requiredCount(value.orphanSampleAccountCount),
    orphanRollupAccountCount: requiredCount(value.orphanRollupAccountCount)
  };
}

function mapCountedTotals(value, countKey) {
  if (!isRecord(value)) fail();
  const count = requiredCount(value[countKey]);
  const uploadBytes = requiredUnsignedBytes(value.uploadBytes);
  const downloadBytes = requiredUnsignedBytes(value.downloadBytes);
  const totalBytes = requiredUnsignedBytes(value.totalBytes);
  if (addChecked(uploadBytes.value, downloadBytes.value) !== totalBytes.value) fail();
  return {
    [countKey]: count,
    uploadBytes: uploadBytes.text,
    downloadBytes: downloadBytes.text,
    totalBytes: totalBytes.text
  };
}

function requiredCount(value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) fail();
  return value;
}

function requiredUnsignedBytes(value) {
  if (typeof value !== "string" || !UNSIGNED_BYTES.test(value)) fail();
  const parsed = BigInt(value);
  if (parsed < 0n || parsed > SIGNED64_MAX || parsed.toString() !== value) fail();
  return { text: value, value: parsed };
}

function requiredSignedBytes(value) {
  if (typeof value !== "string" || !SIGNED_BYTES.test(value)) fail();
  const parsed = BigInt(value);
  if (parsed < SIGNED64_MIN || parsed > SIGNED64_MAX || parsed.toString() !== value) fail();
  return value;
}

function addChecked(left, right) {
  const sum = left + right;
  if (sum > SIGNED64_MAX || sum < SIGNED64_MIN) fail();
  return sum;
}
