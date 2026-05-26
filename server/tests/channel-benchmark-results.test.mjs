import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  CHANNEL_BENCHMARK_SAMPLE_SCHEMA_VERSION,
  normalizeChannelBenchmarkFixture,
  summarizeChannelBenchmarkResults
} from "../services/channel-benchmark-results.mjs";

function withSamples(samples, fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "channel-benchmark-samples-"));
  try {
    const samplesPath = join(tempDir, "samples.json");
    writeFileSync(samplesPath, JSON.stringify(samples, null, 2));
    return fn(samplesPath);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

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

test("normalizeChannelBenchmarkFixture accepts the versioned local sample fixture contract", () => {
  const fixture = normalizeChannelBenchmarkFixture({
    schemaVersion: CHANNEL_BENCHMARK_SAMPLE_SCHEMA_VERSION,
    generatedAt: "2026-05-26T15:40:00.000Z",
    samples: [
      {
        probeName: "ss-baseline",
        protocol: "ss",
        role: "baseline",
        ok: true,
        durationMs: 100
      }
    ]
  });

  assert.deepEqual(fixture, {
    schemaVersion: CHANNEL_BENCHMARK_SAMPLE_SCHEMA_VERSION,
    generatedAt: "2026-05-26T15:40:00.000Z",
    samples: [
      {
        probeName: "ss-baseline",
        protocol: "ss",
        role: "baseline",
        ok: true,
        durationMs: 100
      }
    ]
  });
});

test("normalizeChannelBenchmarkFixture rejects unsupported fixture metadata without echoing raw values", () => {
  assert.throws(
    () =>
      normalizeChannelBenchmarkFixture({
        schemaVersion: "channel-benchmark-samples/v999",
        generatedAt: "2026-05-26T15:40:00.000Z",
        samples: []
      }),
    /unsupported channel benchmark fixture schema/
  );

  assert.throws(
    () =>
      normalizeChannelBenchmarkFixture({
        schemaVersion: CHANNEL_BENCHMARK_SAMPLE_SCHEMA_VERSION,
        generatedAt: "2026-05-26T15:40:00.000Z",
        samples: [],
        rawSecret: "secret-token-value"
      }),
    (error) => {
      assert.match(error.message, /channel benchmark fixture contains unsupported metadata/);
      assert.doesNotMatch(error.message, /secret-token-value|rawSecret/);
      return true;
    }
  );
});

test("channel benchmark summary CLI prints safe JSON from a local sample file", () => {
  withSamples(
    {
      schemaVersion: CHANNEL_BENCHMARK_SAMPLE_SCHEMA_VERSION,
      generatedAt: "2026-05-26T15:30:00.000Z",
      samples: [
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
          durationMs: 200,
          connectTimeMs: 80,
          errorClass: "timeout",
          rawError: "secret backend timeout"
        }
      ]
    },
    (samplesPath) => {
      const stdout = execFileSync(process.execPath, ["scripts/channel-benchmark-summary.mjs", samplesPath], {
        cwd: new URL("../../", import.meta.url),
        encoding: "utf8"
      });

      const summary = JSON.parse(stdout);
      assert.equal(summary.ok, true);
      assert.equal(summary.mode, "local-benchmark-summary");
      assert.equal(summary.generatedAt, "2026-05-26T15:30:00.000Z");
      assert.equal(summary.totals.successRate, 0.5);
      assert.equal(summary.totals.timeoutCount, 1);
      assert.doesNotMatch(stdout, /secret|targetUrl|rawError|token=/);
    }
  );
});
