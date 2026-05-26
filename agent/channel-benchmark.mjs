import { normalizeProbeTarget, runChannelProbeMatrix } from "./channel-probe.mjs";

const SAFE_BENCHMARK_LABEL = /^[a-z0-9_-]{1,64}$/i;

function normalizeBenchmarkLabel(value) {
  const label = String(value ?? "channel").trim();
  if (!SAFE_BENCHMARK_LABEL.test(label)) {
    throw new Error("benchmark label must be a non-secret identifier");
  }
  return label;
}

function normalizeIterations(value) {
  const iterations = Number(value ?? 1);
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new Error("benchmark iterations must be a positive integer");
  }
  return iterations;
}

export function normalizeBenchmarkConfig(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("benchmark config must be an object");
  }
  if (!Array.isArray(input.targets) || input.targets.length === 0) {
    throw new Error("benchmark requires at least one target");
  }

  return {
    label: normalizeBenchmarkLabel(input.label),
    iterations: normalizeIterations(input.iterations),
    targets: input.targets.map((target) => normalizeProbeTarget(target))
  };
}

export async function runChannelBenchmark({ channel, now, ...input } = {}) {
  const config = normalizeBenchmarkConfig(input);
  const result = await runChannelProbeMatrix({
    channel,
    targets: config.targets,
    iterations: config.iterations,
    now
  });

  return {
    ok: result.ok,
    label: config.label,
    targetCount: config.targets.length,
    iterations: config.iterations,
    counters: result.counters,
    latencyMs: result.latencyMs,
    results: result.results
  };
}
