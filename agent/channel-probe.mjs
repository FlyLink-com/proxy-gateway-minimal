import { redactedLastFailure, sanitizeDiagnosticsCounters } from "./diagnostics.mjs";

const SAFE_PROBE_ID = /^[a-z0-9_-]{1,48}$/i;
const ADDRESS_TYPES = new Set(["domain", "ipv4", "ipv6"]);

export const CHANNEL_PROBE_CONTRACT = Object.freeze({
  resultKeys: Object.freeze(["ok", "id", "durationMs", "failureClass"]),
  counterKeys: Object.freeze(["connectOk", "connectFailure"]),
  failureClasses: Object.freeze(["channel_failure"])
});

function normalizePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("probe target port must be an integer TCP port");
  }
  return port;
}

function normalizeProbeId(value) {
  const id = String(value ?? "target").trim();
  if (!SAFE_PROBE_ID.test(id)) {
    throw new Error("probe target id must be a non-secret identifier");
  }
  return id;
}

export function normalizeProbeTarget(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("probe target must be an object");
  }

  const host = String(input.host ?? "").trim();
  if (!host) {
    throw new Error("probe target host is required");
  }

  const addressType = String(input.addressType ?? "domain").trim();
  if (!ADDRESS_TYPES.has(addressType)) {
    throw new Error("probe target addressType is unsupported");
  }

  return {
    id: normalizeProbeId(input.id),
    host,
    port: normalizePort(input.port),
    addressType
  };
}

function summarizeLatency(values) {
  if (values.length === 0) {
    return {
      count: 0,
      min: null,
      max: null,
      avg: null,
      p50: null,
      p95: null
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: sum / sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95)
  };
}

function percentile(sortedValues, ratio) {
  const index = Math.ceil(sortedValues.length * ratio) - 1;
  return sortedValues[Math.max(0, Math.min(sortedValues.length - 1, index))];
}

function durationMs(now, startedAt) {
  const elapsed = Number(now()) - startedAt;
  return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : 0;
}

export function createChannelProbeHarness({ channel, now = () => Date.now() } = {}) {
  if (!channel || typeof channel.openTcp !== "function") {
    throw new Error("channel.openTcp is required");
  }

  const counters = {
    connectOk: 0,
    connectFailure: 0
  };
  const successfulLatencies = [];
  let lastFailure = null;

  return {
    async probeTcp(input) {
      const target = normalizeProbeTarget(input);
      const startedAt = Number(now());
      try {
        const socket = await channel.openTcp({
          host: target.host,
          port: target.port,
          addressType: target.addressType
        });
        const elapsed = durationMs(now, startedAt);
        if (socket && typeof socket.destroy === "function") {
          socket.destroy();
        }
        counters.connectOk += 1;
        successfulLatencies.push(elapsed);
        lastFailure = null;
        return {
          ok: true,
          id: target.id,
          durationMs: elapsed
        };
      } catch {
        const elapsed = durationMs(now, startedAt);
        counters.connectFailure += 1;
        lastFailure = { class: "channel_failure" };
        return {
          ok: false,
          id: target.id,
          durationMs: elapsed,
          failureClass: "channel_failure"
        };
      }
    },
    diagnosticsSnapshot() {
      return {
        ok: true,
        counters: sanitizeDiagnosticsCounters(counters),
        latencyMs: summarizeLatency(successfulLatencies),
        lastFailure: redactedLastFailure(lastFailure)
      };
    }
  };
}

export async function runChannelProbeMatrix({ channel, targets, iterations = 1, now } = {}) {
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error("probe matrix requires at least one target");
  }

  const iterationCount = Number(iterations);
  if (!Number.isInteger(iterationCount) || iterationCount < 1) {
    throw new Error("probe matrix iterations must be a positive integer");
  }

  const harness = createChannelProbeHarness({ channel, now });
  const normalizedTargets = targets.map((target) => normalizeProbeTarget(target));
  const results = [];

  for (let iteration = 0; iteration < iterationCount; iteration += 1) {
    for (const target of normalizedTargets) {
      results.push(await harness.probeTcp(target));
    }
  }

  const snapshot = harness.diagnosticsSnapshot();
  return {
    ok: results.every((result) => result.ok),
    counters: snapshot.counters,
    latencyMs: snapshot.latencyMs,
    results
  };
}
