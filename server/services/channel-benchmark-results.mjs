const KNOWN_ERROR_CLASSES = new Set([
  "timeout",
  "connect_failed",
  "http_error",
  "tls_error",
  "udp_error",
  "protocol_error",
  "unknown_failure"
]);

export const CHANNEL_BENCHMARK_SAMPLE_SCHEMA_VERSION = "channel-benchmark-samples/v1";

const FIXTURE_KEYS = new Set(["schemaVersion", "generatedAt", "samples"]);

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertFixtureKeys(payload) {
  for (const key of Object.keys(payload)) {
    if (!FIXTURE_KEYS.has(key)) {
      throw new Error("channel benchmark fixture contains unsupported metadata");
    }
  }
}

function textField(value, fieldName) {
  const text = String(value ?? "").trim();
  if (!text) {
    throw new Error(`benchmark sample ${fieldName} is required`);
  }
  return text;
}

function optionalMetadataToken(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
}

function requiredNonNegativeNumber(value, fieldName) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`benchmark sample ${fieldName} must be a non-negative number`);
  }
  return number;
}

function optionalNonNegativeNumber(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return requiredNonNegativeNumber(value, fieldName);
}

function booleanField(value, fieldName) {
  if (typeof value !== "boolean") {
    throw new Error(`benchmark sample ${fieldName} must be a boolean`);
  }
  return value;
}

function normalizeErrorClass(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (KNOWN_ERROR_CLASSES.has(text)) {
    return text;
  }
  return "unknown_failure";
}

function roundRate(value) {
  return Number(value.toFixed(4));
}

function percentile(values, percentileValue) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1);
  return sorted[index];
}

function percentileSummary(values) {
  return {
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    p99: percentile(values, 99)
  };
}

function withQualityClass(payload, qualityClass) {
  if (!qualityClass) {
    return payload;
  }
  return {
    ...payload,
    qualityClass
  };
}

function createProbeSummary({ name, protocol, role, qualityClass }) {
  return withQualityClass({
    name,
    protocol,
    role,
    sampleCount: 0,
    successCount: 0,
    failureCount: 0,
    timeoutCount: 0,
    errorCounts: {},
    durations: [],
    connectTimes: [],
    firstByteTimes: []
  }, qualityClass);
}

function finalizeProbe(probe) {
  return withQualityClass({
    name: probe.name,
    protocol: probe.protocol,
    role: probe.role,
    sampleCount: probe.sampleCount,
    successCount: probe.successCount,
    failureCount: probe.failureCount,
    successRate: roundRate(probe.successCount / probe.sampleCount),
    timeoutCount: probe.timeoutCount,
    errorCounts: probe.errorCounts,
    latencyMs: {
      duration: percentileSummary(probe.durations),
      connect: percentileSummary(probe.connectTimes),
      timeToFirstByte: percentileSummary(probe.firstByteTimes)
    }
  }, probe.qualityClass);
}

function normalizePlanProbe(probe) {
  if (!isObject(probe)) {
    throw new Error("benchmark plan probe must be an object");
  }
  return withQualityClass({
    probeName: textField(probe.name, "probe.name"),
    protocol: textField(probe.protocol, "probe.protocol"),
    role: textField(probe.role, "probe.role"),
    ok: false,
    durationMs: 0,
    connectTimeMs: 0,
    timeToFirstByteMs: 0,
    errorClass: "unknown_failure"
  }, optionalMetadataToken(probe.qualityClass));
}

export function createChannelBenchmarkFixtureFromPlan(plan, { generatedAt = new Date().toISOString() } = {}) {
  if (!isObject(plan)) {
    throw new Error("benchmark fixture generation requires a local dry-run plan");
  }
  if (plan.mode !== "local-dry-run" || plan.remoteConnections !== false || !Array.isArray(plan.probes)) {
    throw new Error("benchmark fixture generation requires a local dry-run plan");
  }

  return {
    schemaVersion: CHANNEL_BENCHMARK_SAMPLE_SCHEMA_VERSION,
    generatedAt,
    samples: plan.probes.map(normalizePlanProbe)
  };
}

export function normalizeChannelBenchmarkFixture(payload) {
  if (Array.isArray(payload)) {
    return {
      schemaVersion: CHANNEL_BENCHMARK_SAMPLE_SCHEMA_VERSION,
      generatedAt: undefined,
      samples: payload
    };
  }

  if (!isObject(payload)) {
    throw new Error("channel benchmark fixture must be an object or sample array");
  }

  assertFixtureKeys(payload);

  const schemaVersion = String(payload.schemaVersion || CHANNEL_BENCHMARK_SAMPLE_SCHEMA_VERSION).trim();
  if (schemaVersion !== CHANNEL_BENCHMARK_SAMPLE_SCHEMA_VERSION) {
    throw new Error("unsupported channel benchmark fixture schema");
  }

  if (!Array.isArray(payload.samples)) {
    throw new Error("channel benchmark fixture samples must be an array");
  }

  const generatedAt =
    payload.generatedAt === undefined || payload.generatedAt === null || payload.generatedAt === ""
      ? undefined
      : textField(payload.generatedAt, "generatedAt");

  return {
    schemaVersion,
    generatedAt,
    samples: payload.samples
  };
}

export function summarizeChannelBenchmarkResults(samples, { generatedAt = new Date().toISOString() } = {}) {
  if (!Array.isArray(samples)) {
    throw new Error("benchmark samples must be an array");
  }

  const probes = new Map();
  const totals = {
    sampleCount: 0,
    successCount: 0,
    failureCount: 0,
    timeoutCount: 0
  };

  for (const sample of samples) {
    if (!sample || typeof sample !== "object" || Array.isArray(sample)) {
      throw new Error("benchmark sample must be an object");
    }

    const name = textField(sample.probeName ?? sample.name, "probeName");
    const protocol = textField(sample.protocol, "protocol");
    const role = textField(sample.role, "role");
    const qualityClass = optionalMetadataToken(sample.qualityClass);
    const ok = booleanField(sample.ok, "ok");
    const durationMs = requiredNonNegativeNumber(sample.durationMs, "durationMs");
    const connectTimeMs = optionalNonNegativeNumber(sample.connectTimeMs, "connectTimeMs");
    const timeToFirstByteMs = optionalNonNegativeNumber(sample.timeToFirstByteMs, "timeToFirstByteMs");
    const key = `${name}\u0000${protocol}\u0000${role}\u0000${qualityClass}`;

    let probe = probes.get(key);
    if (!probe) {
      probe = createProbeSummary({ name, protocol, role, qualityClass });
      probes.set(key, probe);
    }

    probe.sampleCount += 1;
    totals.sampleCount += 1;
    probe.durations.push(durationMs);
    if (connectTimeMs !== null) {
      probe.connectTimes.push(connectTimeMs);
    }
    if (ok && timeToFirstByteMs !== null) {
      probe.firstByteTimes.push(timeToFirstByteMs);
    }

    if (ok) {
      probe.successCount += 1;
      totals.successCount += 1;
    } else {
      probe.failureCount += 1;
      totals.failureCount += 1;
      const errorClass = normalizeErrorClass(sample.errorClass);
      probe.errorCounts[errorClass] = (probe.errorCounts[errorClass] || 0) + 1;
      if (errorClass === "timeout") {
        probe.timeoutCount += 1;
        totals.timeoutCount += 1;
      }
    }
  }

  return {
    ok: true,
    mode: "local-benchmark-summary",
    generatedAt,
    sampleCount: totals.sampleCount,
    probeCount: probes.size,
    totals: {
      ...totals,
      successRate: totals.sampleCount === 0 ? 0 : roundRate(totals.successCount / totals.sampleCount)
    },
    probes: [...probes.values()].map(finalizeProbe)
  };
}
