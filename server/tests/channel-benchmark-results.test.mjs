import assert from "node:assert/strict";
import test from "node:test";
import { summarizeChannelBenchmarkResults } from "../services/channel-benchmark-results.mjs";

test("summarizeChannelBenchmarkResults aggregates per-probe latency and failure metrics safely", () => {
  const summary = summarizeChannelBenchmarkResults(
    [
      {
        probeName: "ss-baseline",
        protocol: "ss",
        role: "baseline",
        ok: true,
        durationMs: 100,
        connectTimeMs: 30,
        timeToFirstByteMs: 70,
        targetUrl: "https://secret.example/token=raw-secret"
      },
      {
        probeName: "ss-baseline",
        protocol: "ss",
        role: "baseline",
        ok: false,
        durationMs: 300,
        connectTimeMs: 90,
        timeToFirstByteMs: 0,
        errorClass: "timeout",
        rawError: "connect to secret.example failed"
      },
      {
        probeName: "ss-baseline",
        protocol: "ss",
        role: "baseline",
        ok: true,
        durationMs: 120,
        connectTimeMs: 40,
        timeToFirstByteMs: 80
      },
      {
        probeName: "vless-candidate",
        protocol: "vless",
        role: "candidate",
        ok: true,
        durationMs: 80,
        connectTimeMs: 20,
        timeToFirstByteMs: 55
      }
    ],
    { generatedAt: "2026-05-26T15:20:00.000Z" }
  );

  assert.deepEqual(summary, {
    ok: true,
    mode: "local-benchmark-summary",
    generatedAt: "2026-05-26T15:20:00.000Z",
    sampleCount: 4,
    probeCount: 2,
    totals: {
      sampleCount: 4,
      successCount: 3,
      failureCount: 1,
      successRate: 0.75,
      timeoutCount: 1
    },
    probes: [
      {
        name: "ss-baseline",
        protocol: "ss",
        role: "baseline",
        sampleCount: 3,
        successCount: 2,
        failureCount: 1,
        successRate: 0.6667,
        timeoutCount: 1,
        errorCounts: {
          timeout: 1
        },
        latencyMs: {
          duration: { p50: 120, p95: 300, p99: 300 },
          connect: { p50: 40, p95: 90, p99: 90 },
          timeToFirstByte: { p50: 70, p95: 80, p99: 80 }
        }
      },
      {
        name: "vless-candidate",
        protocol: "vless",
        role: "candidate",
        sampleCount: 1,
        successCount: 1,
        failureCount: 0,
        successRate: 1,
        timeoutCount: 0,
        errorCounts: {},
        latencyMs: {
          duration: { p50: 80, p95: 80, p99: 80 },
          connect: { p50: 20, p95: 20, p99: 20 },
          timeToFirstByte: { p50: 55, p95: 55, p99: 55 }
        }
      }
    ]
  });

  assert.doesNotMatch(JSON.stringify(summary), /secret|targetUrl|rawError|token=/);
});

test("summarizeChannelBenchmarkResults validates sample shape without echoing raw values", () => {
  assert.throws(
    () =>
      summarizeChannelBenchmarkResults([
        {
          probeName: "bad-probe",
          protocol: "ss",
          role: "baseline",
          ok: true,
          durationMs: -1,
          targetUrl: "https://secret.example/token=raw-secret"
        }
      ]),
    (error) => {
      assert.match(error.message, /benchmark sample durationMs must be a non-negative number/);
      assert.doesNotMatch(error.message, /secret|targetUrl|token=/);
      return true;
    }
  );

  assert.throws(
    () =>
      summarizeChannelBenchmarkResults([
        {
          probeName: "bad-probe",
          protocol: "ss",
          role: "baseline",
          durationMs: 20,
          rawError: "secret backend failure"
        }
      ]),
    (error) => {
      assert.match(error.message, /benchmark sample ok must be a boolean/);
      assert.doesNotMatch(error.message, /secret|rawError/);
      return true;
    }
  );
});
