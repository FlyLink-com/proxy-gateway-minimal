import assert from "node:assert/strict";
import test from "node:test";
import { createMihomoTuicUsageCollector } from "../services/edge/mihomo-tuic-usage-collector.mjs";
import { createMihomoExternalControllerUsageSnapshotReader } from "../services/edge/mihomo-external-controller-usage-reader.mjs";

test("Mihomo external-controller usage reader rejects non-loopback controller URLs", () => {
  assert.throws(() => createMihomoExternalControllerUsageSnapshotReader({
    controllerUrl: "http://203.0.113.10:9090",
    fetchJson: async () => ({})
  }), /controllerUrl must be loopback-only/);

  assert.throws(() => createMihomoExternalControllerUsageSnapshotReader({
    controllerUrl: "https://127.0.0.1:9090",
    fetchJson: async () => ({})
  }), /controllerUrl must use http loopback/);
});

test("Mihomo external-controller usage reader converts aggregate traffic into safe aggregate snapshot", async () => {
  const calls = [];
  const reader = createMihomoExternalControllerUsageSnapshotReader({
    controllerUrl: "http://127.0.0.1:9090",
    metricsPath: "/traffic",
    controllerSecret: "controller-secret-value",
    nowFn: () => "2026-06-06T12:00:00.000Z",
    fetchJson: async (request) => {
      calls.push(request);
      return {
        up: 128,
        down: 256,
        rawConfig: "must-not-return",
        password: "must-not-return"
      };
    }
  });

  const snapshot = await reader({
    channelRef: "channel-aws-staging-a-tuic",
    since: "2026-06-06T11:55:00.000Z"
  });

  assert.deepEqual(snapshot, {
    sourceRef: "mihomo_external_controller_traffic",
    observedAt: "2026-06-06T12:00:00.000Z",
    intervalStartedAt: "2026-06-06T11:55:00.000Z",
    intervalEndedAt: "2026-06-06T12:00:00.000Z",
    aggregate: {
      uploadBytes: 128,
      downloadBytes: 256
    }
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:9090/traffic");
  assert.equal(calls[0].headers.Authorization, "Bearer controller-secret-value");
  assert.doesNotMatch(JSON.stringify(snapshot), /controller-secret-value|rawConfig|password|127\.0\.0\.1|9090/);
});

test("Mihomo external-controller usage reader maps per-credential entries and suppresses raw fields", async () => {
  const reader = createMihomoExternalControllerUsageSnapshotReader({
    controllerUrl: "http://localhost:19090",
    metricsPath: "/usage",
    nowFn: () => "2026-06-06T12:00:00.000Z",
    fetchJson: async () => ({
      observedAt: "2026-06-06T11:59:00.000Z",
      users: [
        {
          edgeCredentialRef: "edgecred_runtime_001",
          upload: 512,
          download: 1024,
          uuid: "11111111-1111-4111-8111-111111111111",
          password: "runtime-password",
          remoteAddress: "198.51.100.20"
        }
      ]
    })
  });

  const snapshot = await reader({
    channelRef: "channel-aws-staging-a-tuic",
    since: "2026-06-06T11:55:00.000Z"
  });

  assert.deepEqual(snapshot, {
    sourceRef: "mihomo_external_controller_usage",
    observedAt: "2026-06-06T11:59:00.000Z",
    intervalStartedAt: "2026-06-06T11:55:00.000Z",
    intervalEndedAt: "2026-06-06T11:59:00.000Z",
    entries: [
      {
        edgeCredentialRef: "edgecred_runtime_001",
        uploadBytes: 512,
        downloadBytes: 1024
      }
    ]
  });
  assert.doesNotMatch(JSON.stringify(snapshot), /11111111-1111-4111-8111-111111111111|runtime-password|198\.51\.100\.20/);
});

test("Mihomo external-controller aggregate snapshots fail closed through the usage collector", async () => {
  const reader = createMihomoExternalControllerUsageSnapshotReader({
    controllerUrl: "http://[::1]:19090",
    nowFn: () => "2026-06-06T12:00:00.000Z",
    fetchJson: async () => ({
      uploadBytes: 300,
      downloadBytes: 700
    })
  });
  const collector = createMihomoTuicUsageCollector({
    channelRef: "channel-aws-staging-a-tuic",
    snapshotReader: reader
  });

  const result = await collector.collect({
    since: "2026-06-06T11:55:00.000Z"
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "collector_not_supported");
  assert.equal(result.blockers[0].code, "node_aggregate_only");
  assert.deepEqual(result.observations, []);
});
