import assert from "node:assert/strict";
import test from "node:test";
import {
  createChannelProbeHarness,
  normalizeProbeTarget,
  runChannelProbeMatrix
} from "../../agent/channel-probe.mjs";

function sequenceNow(values) {
  const queue = [...values];
  return () => {
    if (queue.length === 0) {
      throw new Error("now sequence exhausted");
    }
    return queue.shift();
  };
}

test("probe harness records success and failure without leaking target details", async () => {
  const channel = {
    async openTcp(target) {
      if (target.host.includes("fail")) {
        throw new Error(`failed to connect ${target.host}`);
      }
      return {
        destroy() {}
      };
    }
  };
  const harness = createChannelProbeHarness({
    channel,
    now: sequenceNow([100, 115, 200, 260])
  });

  const ok = await harness.probeTcp({ id: "ok", host: "secret-ok.example", port: 443 });
  const fail = await harness.probeTcp({ id: "fail", host: "secret-fail.example", port: 443 });
  const snapshot = harness.diagnosticsSnapshot();
  const serialized = JSON.stringify({ ok, fail, snapshot });

  assert.deepEqual(ok, { ok: true, id: "ok", durationMs: 15 });
  assert.deepEqual(fail, { ok: false, id: "fail", durationMs: 60, failureClass: "channel_failure" });
  assert.deepEqual(snapshot, {
    ok: true,
    counters: {
      connectOk: 1,
      connectFailure: 1
    },
    latencyMs: {
      count: 1,
      min: 15,
      max: 15,
      avg: 15,
      p50: 15,
      p95: 15
    },
    lastFailure: { class: "channel_failure" }
  });
  assert.doesNotMatch(serialized, /secret-ok|secret-fail|failed to connect/i);
});

test("probe matrix aggregates repeated targets with safe ids", async () => {
  const channel = {
    async openTcp(target) {
      if (target.host.includes("fail")) {
        throw new Error("backend failure for secret target");
      }
      return {
        destroy() {}
      };
    }
  };

  const result = await runChannelProbeMatrix({
    channel,
    targets: [
      { id: "baseline", host: "baseline-secret.example", port: 443 },
      { id: "candidate", host: "candidate-fail.example", port: 443 }
    ],
    iterations: 2,
    now: sequenceNow([0, 10, 10, 20, 20, 35, 35, 55])
  });
  const serialized = JSON.stringify(result);

  assert.equal(result.ok, false);
  assert.deepEqual(result.counters, {
    connectOk: 2,
    connectFailure: 2
  });
  assert.deepEqual(result.latencyMs, {
    count: 2,
    min: 10,
    max: 15,
    avg: 12.5,
    p50: 10,
    p95: 15
  });
  assert.deepEqual(
    result.results.map((entry) => [entry.id, entry.ok, entry.durationMs]),
    [
      ["baseline", true, 10],
      ["candidate", false, 10],
      ["baseline", true, 15],
      ["candidate", false, 20]
    ]
  );
  assert.doesNotMatch(serialized, /secret|backend failure|example/i);
});

test("probe target normalization rejects unsafe ids and invalid ports", () => {
  assert.deepEqual(normalizeProbeTarget({ host: "example.test", port: "443" }), {
    id: "target",
    host: "example.test",
    port: 443,
    addressType: "domain"
  });
  assert.throws(
    () => normalizeProbeTarget({ id: "secret.example", host: "example.test", port: 443 }),
    /probe target id must be a non-secret identifier/
  );
  assert.throws(
    () => normalizeProbeTarget({ id: "ok", host: "example.test", port: 0 }),
    /probe target port must be an integer TCP port/
  );
});
