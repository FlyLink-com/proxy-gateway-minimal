import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  CHANNEL_BENCHMARK_SAMPLE_SCHEMA_VERSION,
  createChannelBenchmarkFixtureFromPlan,
  normalizeChannelBenchmarkFixture,
  scoreChannelBenchmarkSummary,
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
        qualityClass: "stable",
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
        qualityClass: "stable",
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
        qualityClass: "stable",
        ok: true,
        durationMs: 120,
        connectTimeMs: 40,
        timeToFirstByteMs: 80
      },
      {
        probeName: "vless-candidate",
        protocol: "vless",
        role: "candidate",
        qualityClass: "weak-network",
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
        qualityClass: "stable",
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
        qualityClass: "weak-network",
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

test("scoreChannelBenchmarkSummary classifies safe channel quality and rollout recommendations", () => {
  const summary = summarizeChannelBenchmarkResults(
    [
      {
        probeName: "ss-baseline",
        protocol: "ss",
        role: "baseline",
        qualityClass: "stable",
        ok: true,
        durationMs: 120,
        connectTimeMs: 30,
        timeToFirstByteMs: 80
      },
      {
        probeName: "ss-baseline",
        protocol: "ss",
        role: "baseline",
        qualityClass: "stable",
        ok: true,
        durationMs: 140,
        connectTimeMs: 35,
        timeToFirstByteMs: 90
      },
      {
        probeName: "hy2-candidate",
        protocol: "hysteria2",
        role: "candidate",
        qualityClass: "weak-network",
        ok: true,
        durationMs: 180,
        connectTimeMs: 40,
        timeToFirstByteMs: 100
      },
      {
        probeName: "hy2-candidate",
        protocol: "hysteria2",
        role: "candidate",
        qualityClass: "weak-network",
        ok: true,
        durationMs: 220,
        connectTimeMs: 45,
        timeToFirstByteMs: 120
      },
      {
        probeName: "tuic-candidate",
        protocol: "tuic",
        role: "candidate",
        qualityClass: "weak-network",
        ok: false,
        durationMs: 3000,
        connectTimeMs: 0,
        errorClass: "timeout",
        rawError: "secret backend timeout"
      },
      {
        probeName: "tuic-candidate",
        protocol: "tuic",
        role: "candidate",
        qualityClass: "weak-network",
        ok: false,
        durationMs: 3000,
        connectTimeMs: 0,
        errorClass: "timeout"
      }
    ],
    { generatedAt: "2026-05-26T19:20:00.000Z" }
  );

  const scored = scoreChannelBenchmarkSummary(summary, {
    generatedAt: "2026-05-26T19:21:00.000Z"
  });

  assert.deepEqual(scored, {
    ok: true,
    mode: "channel-measurement-score",
    generatedAt: "2026-05-26T19:21:00.000Z",
    sourceGeneratedAt: "2026-05-26T19:20:00.000Z",
    probeCount: 3,
    candidates: [
      {
        name: "ss-baseline",
        protocol: "ss",
        role: "baseline",
        qualityClass: "stable",
        sampleCount: 2,
        successRate: 1,
        timeoutRate: 0,
        p95DurationMs: 140,
        channelScore: 99,
        qualityTier: "healthy",
        recommendedPool: "stable",
        reasonCodes: ["stable_baseline_healthy"]
      },
      {
        name: "hy2-candidate",
        protocol: "hysteria2",
        role: "candidate",
        qualityClass: "weak-network",
        sampleCount: 2,
        successRate: 1,
        timeoutRate: 0,
        p95DurationMs: 220,
        channelScore: 98,
        qualityTier: "healthy",
        recommendedPool: "canary",
        reasonCodes: ["candidate_requires_canary"]
      },
      {
        name: "tuic-candidate",
        protocol: "tuic",
        role: "candidate",
        qualityClass: "weak-network",
        sampleCount: 2,
        successRate: 0,
        timeoutRate: 1,
        p95DurationMs: 3000,
        channelScore: 0,
        qualityTier: "blocked",
        recommendedPool: "hold",
        reasonCodes: ["low_success_rate", "timeout_failures", "high_p95_latency"]
      }
    ]
  });

  assert.doesNotMatch(JSON.stringify(scored), /secret|rawError|token=/);
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

test("createChannelBenchmarkFixtureFromPlan emits editable safe sample placeholders", () => {
  const fixture = createChannelBenchmarkFixtureFromPlan(
    {
      mode: "local-dry-run",
      remoteConnections: false,
      probes: [
        {
          name: "ss-baseline",
          protocol: "ss",
          role: "baseline",
          qualityClass: "stable",
          host: "ss.secret.example",
          port: 18388,
          checks: ["tcp-connect"],
          udpProbe: false
        },
        {
          name: "vless-candidate",
          protocol: "vless",
          role: "candidate",
          qualityClass: "weak-network",
          host: "vless.secret.example",
          port: 443,
          checks: ["tcp-connect", "sustained-session"],
          udpProbe: true
        }
      ]
    },
    { generatedAt: "2026-05-26T15:45:00.000Z" }
  );

  assert.deepEqual(fixture, {
    schemaVersion: CHANNEL_BENCHMARK_SAMPLE_SCHEMA_VERSION,
    generatedAt: "2026-05-26T15:45:00.000Z",
    samples: [
      {
        probeName: "ss-baseline",
        protocol: "ss",
        role: "baseline",
        qualityClass: "stable",
        ok: false,
        durationMs: 0,
        connectTimeMs: 0,
        timeToFirstByteMs: 0,
        errorClass: "unknown_failure"
      },
      {
        probeName: "vless-candidate",
        protocol: "vless",
        role: "candidate",
        qualityClass: "weak-network",
        ok: false,
        durationMs: 0,
        connectTimeMs: 0,
        timeToFirstByteMs: 0,
        errorClass: "unknown_failure"
      }
    ]
  });
  assert.doesNotMatch(JSON.stringify(fixture), /secret\.example|host|port|checks|udpProbe/);
});

test("createChannelBenchmarkFixtureFromPlan rejects remote benchmark plans", () => {
  assert.throws(
    () =>
      createChannelBenchmarkFixtureFromPlan({
        mode: "runtime-canary",
        remoteConnections: true,
        probes: [{ name: "unsafe", protocol: "ss", role: "baseline" }]
      }),
    /benchmark fixture generation requires a local dry-run plan/
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

test("channel benchmark score CLI prints safe channel recommendations from a local summary", () => {
  withSamples(
    {
      ok: true,
      mode: "local-benchmark-summary",
      generatedAt: "2026-05-26T19:30:00.000Z",
      sampleCount: 2,
      probeCount: 1,
      totals: {
        sampleCount: 2,
        successCount: 2,
        failureCount: 0,
        successRate: 1,
        timeoutCount: 0
      },
      probes: [
        {
          name: "hy2-candidate",
          protocol: "hysteria2",
          role: "candidate",
          qualityClass: "weak-network",
          sampleCount: 2,
          successCount: 2,
          failureCount: 0,
          successRate: 1,
          timeoutCount: 0,
          errorCounts: {},
          latencyMs: {
            duration: { p50: 180, p95: 220, p99: 220 },
            connect: { p50: 40, p95: 45, p99: 45 },
            timeToFirstByte: { p50: 100, p95: 120, p99: 120 }
          },
          rawError: "secret backend detail"
        }
      ]
    },
    (summaryPath) => {
      const stdout = execFileSync(process.execPath, ["scripts/channel-benchmark-score.mjs", summaryPath], {
        cwd: new URL("../../", import.meta.url),
        encoding: "utf8"
      });

      const scored = JSON.parse(stdout);
      assert.equal(scored.ok, true);
      assert.equal(scored.mode, "channel-measurement-score");
      assert.equal(scored.candidates[0].recommendedPool, "canary");
      assert.equal(scored.candidates[0].qualityTier, "healthy");
      assert.doesNotMatch(stdout, /secret|rawError|token=/);
    }
  );
});

test("channel benchmark fixture CLI prints safe placeholders from a local dry-run summary", () => {
  withSamples(
    {
      ok: true,
      benchmarkPlan: {
        mode: "local-dry-run",
        remoteConnections: false,
        probes: [
          {
            name: "ss-baseline",
            protocol: "ss",
            role: "baseline",
            qualityClass: "stable",
            host: "ss.secret.example",
            port: 18388,
            checks: ["tcp-connect"],
            udpProbe: false
          }
        ]
      }
    },
    (summaryPath) => {
      const stdout = execFileSync(process.execPath, ["scripts/channel-benchmark-fixture.mjs", summaryPath], {
        cwd: new URL("../../", import.meta.url),
        encoding: "utf8"
      });

      const fixture = JSON.parse(stdout);
      assert.equal(fixture.schemaVersion, CHANNEL_BENCHMARK_SAMPLE_SCHEMA_VERSION);
      assert.equal(fixture.samples.length, 1);
      assert.deepEqual(fixture.samples[0], {
        probeName: "ss-baseline",
        protocol: "ss",
        role: "baseline",
        qualityClass: "stable",
        ok: false,
        durationMs: 0,
        connectTimeMs: 0,
        timeToFirstByteMs: 0,
        errorClass: "unknown_failure"
      });
      assert.doesNotMatch(stdout, /secret\.example|host|port|checks|udpProbe/);
    }
  );
});
