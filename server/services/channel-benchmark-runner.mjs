import { CHANNEL_BENCHMARK_SAMPLE_SCHEMA_VERSION } from "./channel-benchmark-results.mjs";

const KNOWN_ERROR_CLASSES = new Set([
  "timeout",
  "connect_failed",
  "http_error",
  "tls_error",
  "udp_error",
  "protocol_error",
  "unknown_failure"
]);

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function textField(value, fieldName) {
  const text = String(value ?? "").trim();
  if (!text) {
    throw new Error(`benchmark probe ${fieldName} is required`);
  }
  return text;
}

function optionalMetadataToken(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
}

function nonNegativeNumber(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return fallback;
  }
  return number;
}

function normalizeErrorClass(value) {
  const normalized = optionalMetadataToken(value);
  return KNOWN_ERROR_CLASSES.has(normalized) ? normalized : "unknown_failure";
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

function normalizeProbe(probe) {
  if (!isObject(probe)) {
    throw new Error("benchmark plan probe must be an object");
  }
  return {
    name: textField(probe.name, "name"),
    protocol: textField(probe.protocol, "protocol"),
    role: textField(probe.role, "role"),
    qualityClass: optionalMetadataToken(probe.qualityClass),
    host: probe.host,
    port: probe.port,
    checks: probe.checks,
    udpProbe: probe.udpProbe
  };
}

function normalizeResult(probe, result) {
  const payload = isObject(result) ? result : {};
  const ok = payload.ok === true;
  const sample = withQualityClass({
    probeName: probe.name,
    protocol: probe.protocol,
    role: probe.role,
    ok,
    durationMs: nonNegativeNumber(payload.durationMs),
    connectTimeMs: nonNegativeNumber(payload.connectTimeMs),
    timeToFirstByteMs: nonNegativeNumber(payload.timeToFirstByteMs)
  }, probe.qualityClass);

  if (!ok) {
    sample.errorClass = normalizeErrorClass(payload.errorClass);
  }

  return sample;
}

function failedSample(probe) {
  return withQualityClass({
    probeName: probe.name,
    protocol: probe.protocol,
    role: probe.role,
    ok: false,
    durationMs: 0,
    connectTimeMs: 0,
    timeToFirstByteMs: 0,
    errorClass: "unknown_failure"
  }, probe.qualityClass);
}

function assertLocalPlan(plan) {
  if (!isObject(plan) || plan.mode !== "local-dry-run" || plan.remoteConnections !== false || !Array.isArray(plan.probes)) {
    throw new Error("channel benchmark runner requires a local dry-run plan");
  }
}

export async function runChannelBenchmarkPlan(plan, {
  generatedAt = new Date().toISOString(),
  runProbe
} = {}) {
  assertLocalPlan(plan);
  if (typeof runProbe !== "function") {
    throw new Error("channel benchmark runner requires an injected local probe runner");
  }

  const samples = [];
  for (const [index, rawProbe] of plan.probes.entries()) {
    const probe = normalizeProbe(rawProbe);
    try {
      samples.push(normalizeResult(probe, await runProbe(probe, index)));
    } catch {
      samples.push(failedSample(probe));
    }
  }

  return {
    schemaVersion: CHANNEL_BENCHMARK_SAMPLE_SCHEMA_VERSION,
    generatedAt,
    samples
  };
}
