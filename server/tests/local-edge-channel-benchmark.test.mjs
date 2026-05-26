import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeBenchmarkConfig,
  runChannelBenchmark
} from "../../agent/channel-benchmark.mjs";

function sequenceNow(values) {
  const queue = [...values];
  return () => {
    if (queue.length === 0) {
      throw new Error("now sequence exhausted");
    }
    return queue.shift();
  };
}

test("benchmark runner returns a redacted report for an injected channel", async () => {
  const channel = {
    async openTcp(target) {
      if (target.host.includes("fail")) {
        throw new Error(`cannot reach ${target.host}`);
      }
      return { destroy() {} };
    }
  };

  const report = await runChannelBenchmark({
    label: "ss-baseline",
    channel,
    iterations: 2,
    targets: [
      { id: "control", host: "secret-control.example", port: 443 },
      { id: "candidate", host: "secret-fail.example", port: 443 }
    ],
    now: sequenceNow([0, 8, 8, 30, 30, 42, 42, 75])
  });
  const serialized = JSON.stringify(report);

  assert.equal(report.ok, false);
  assert.equal(report.label, "ss-baseline");
  assert.equal(report.targetCount, 2);
  assert.equal(report.iterations, 2);
  assert.deepEqual(report.counters, {
    connectOk: 2,
    connectFailure: 2
  });
  assert.deepEqual(report.latencyMs, {
    count: 2,
    min: 8,
    max: 12,
    avg: 10,
    p50: 8,
    p95: 12
  });
  assert.deepEqual(
    report.results.map((entry) => [entry.id, entry.ok, entry.durationMs]),
    [
      ["control", true, 8],
      ["candidate", false, 22],
      ["control", true, 12],
      ["candidate", false, 33]
    ]
  );
  assert.doesNotMatch(serialized, /secret|cannot reach|example/i);
});

test("benchmark config normalization rejects unsafe labels and invalid iterations", () => {
  assert.deepEqual(
    normalizeBenchmarkConfig({
      label: "vless-xudp-candidate",
      iterations: "3",
      targets: [{ id: "control", host: "example.test", port: 443 }]
    }),
    {
      label: "vless-xudp-candidate",
      iterations: 3,
      targets: [{ id: "control", host: "example.test", port: 443, addressType: "domain" }]
    }
  );
  assert.throws(
    () => normalizeBenchmarkConfig({ label: "secret.example", targets: [{ host: "example.test", port: 443 }] }),
    /benchmark label must be a non-secret identifier/
  );
  assert.throws(
    () => normalizeBenchmarkConfig({ iterations: 0, targets: [{ host: "example.test", port: 443 }] }),
    /benchmark iterations must be a positive integer/
  );
});
