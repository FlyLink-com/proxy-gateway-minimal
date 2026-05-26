const KNOWN_ERROR_CLASSES = new Set([
  "timeout",
  "connect_failed",
  "http_error",
  "tls_error",
  "udp_error",
  "protocol_error",
  "unknown_failure"
]);

function textField(value, fieldName) {
  const text = String(value ?? "").trim();
  if (!text) {
    throw new Error(`benchmark sample ${fieldName} is required`);
  }
  return text;
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

function createProbeSummary({ name, protocol, role }) {
  return {
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
  };
}

function finalizeProbe(probe) {
  return {
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
    const ok = booleanField(sample.ok, "ok");
    const durationMs = requiredNonNegativeNumber(sample.durationMs, "durationMs");
    const connectTimeMs = optionalNonNegativeNumber(sample.connectTimeMs, "connectTimeMs");
    const timeToFirstByteMs = optionalNonNegativeNumber(sample.timeToFirstByteMs, "timeToFirstByteMs");
    const key = `${name}\u0000${protocol}\u0000${role}`;

    let probe = probes.get(key);
    if (!probe) {
      probe = createProbeSummary({ name, protocol, role });
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
