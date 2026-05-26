import assert from "node:assert/strict";
import test from "node:test";
import { runChannelBenchmarkPlan } from "../services/channel-benchmark-runner.mjs";

function localPlan() {
  return {
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
        name: "hy2-long-haul",
        protocol: "hysteria2",
        role: "candidate",
        qualityClass: "weak-network",
        host: "hy2.secret.example",
        port: 443,
        checks: ["tcp-connect", "sustained-session"],
        udpProbe: true
      }
    ]
  };
}

test("runChannelBenchmarkPlan requires an injected probe runner", async () => {
  await assert.rejects(
    runChannelBenchmarkPlan(localPlan(), { generatedAt: "2026-05-26T16:20:00.000Z" }),
    /requires an injected local probe runner/
  );
});

test("runChannelBenchmarkPlan rejects remote benchmark plans", async () => {
  await assert.rejects(
    runChannelBenchmarkPlan(
      {
        mode: "runtime-canary",
        remoteConnections: true,
        probes: [{ name: "unsafe", protocol: "ss", role: "baseline" }]
      },
      {
        runProbe: async () => ({ ok: true, durationMs: 1 })
      }
    ),
    /requires a local dry-run plan/
  );
});

test("runChannelBenchmarkPlan produces safe samples from an injected local runner", async () => {
  const seen = [];
  const fixture = await runChannelBenchmarkPlan(localPlan(), {
    generatedAt: "2026-05-26T16:20:00.000Z",
    runProbe: async (probe, index) => {
      seen.push({ index, name: probe.name, host: probe.host, port: probe.port });
      if (probe.protocol === "ss") {
        return {
          ok: true,
          durationMs: 91,
          connectTimeMs: 31,
          timeToFirstByteMs: 61,
          rawTarget: "https://secret.example/token=raw"
        };
      }
      return {
        ok: false,
        durationMs: 250,
        connectTimeMs: 120,
        errorClass: "timeout",
        rawError: "hy2.secret.example timed out"
      };
    }
  });

  assert.deepEqual(seen, [
    { index: 0, name: "ss-baseline", host: "ss.secret.example", port: 18388 },
    { index: 1, name: "hy2-long-haul", host: "hy2.secret.example", port: 443 }
  ]);
  assert.deepEqual(fixture, {
    schemaVersion: "channel-benchmark-samples/v1",
    generatedAt: "2026-05-26T16:20:00.000Z",
    samples: [
      {
        probeName: "ss-baseline",
        protocol: "ss",
        role: "baseline",
        qualityClass: "stable",
        ok: true,
        durationMs: 91,
        connectTimeMs: 31,
        timeToFirstByteMs: 61
      },
      {
        probeName: "hy2-long-haul",
        protocol: "hysteria2",
        role: "candidate",
        qualityClass: "weak-network",
        ok: false,
        durationMs: 250,
        connectTimeMs: 120,
        timeToFirstByteMs: 0,
        errorClass: "timeout"
      }
    ]
  });
  assert.doesNotMatch(JSON.stringify(fixture), /secret\.example|rawTarget|rawError|token=raw|host|port|checks|udpProbe/);
});

test("runChannelBenchmarkPlan normalizes injected probe failures without leaking raw errors", async () => {
  const fixture = await runChannelBenchmarkPlan(localPlan(), {
    generatedAt: "2026-05-26T16:21:00.000Z",
    runProbe: async () => {
      throw new Error("connect to hy2.secret.example with token=raw failed");
    }
  });

  assert.equal(fixture.samples.length, 2);
  for (const sample of fixture.samples) {
    assert.equal(sample.ok, false);
    assert.equal(sample.errorClass, "unknown_failure");
    assert.equal(sample.durationMs, 0);
  }
  assert.doesNotMatch(JSON.stringify(fixture), /secret\.example|token=raw|connect to/);
});
