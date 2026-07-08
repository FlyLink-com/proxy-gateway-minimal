import assert from "node:assert/strict";
import test from "node:test";
import { createMihomoTuicUsageCollector } from "../services/edge/mihomo-tuic-usage-collector.mjs";
import {
  createInMemoryMihomoConnectionDeltaStateStore,
  createMihomoConnectionDeltaUsageReader
} from "../services/edge/mihomo-connection-delta-usage-reader.mjs";

test("Mihomo connection delta reader baselines first snapshot and emits later deltas", async () => {
  const stateStore = createInMemoryMihomoConnectionDeltaStateStore();
  const payloads = [
    {
      connections: [
        {
          id: "conn-1",
          upload: 100,
          download: 200,
          metadata: {
            inboundUser: "11111111-1111-4111-8111-111111111111",
            sourceIP: "198.51.100.20"
          },
          password: "runtime-password"
        }
      ]
    },
    {
      connections: [
        {
          id: "conn-1",
          upload: 160,
          download: 260,
          metadata: {
            inboundUser: "11111111-1111-4111-8111-111111111111"
          }
        },
        {
          id: "conn-2",
          upload: 10,
          download: 20,
          metadata: {
            inboundUser: "11111111-1111-4111-8111-111111111111"
          }
        }
      ]
    }
  ];
  let callIndex = 0;
  const reader = createMihomoConnectionDeltaUsageReader({
    controllerUrl: "http://127.0.0.1:19090",
    credentialRefByRuntimeUser: {
      "11111111-1111-4111-8111-111111111111": "edgecred_runtime_user_001"
    },
    stateStore,
    nowFn: () => callIndex === 0 ? "2026-07-08T00:00:00.000Z" : "2026-07-08T00:00:05.000Z",
    fetchJson: async () => payloads[callIndex++]
  });

  const first = await reader({
    channelRef: "channel-sgp-a-tuic"
  });
  const second = await reader({
    channelRef: "channel-sgp-a-tuic"
  });

  assert.deepEqual(first.entries, []);
  assert.equal(first.accountingMode, "delta");
  assert.equal(first.stateWarmup, true);
  assert.deepEqual(second.entries, [
    {
      edgeCredentialRef: "edgecred_runtime_user_001",
      uploadBytes: 70,
      downloadBytes: 80
    }
  ]);
  assert.equal(second.accountingMode, "delta");
  assert.equal(second.stateWarmup, false);
  assert.doesNotMatch(JSON.stringify(second), /11111111-1111-4111-8111-111111111111|runtime-password|198\.51\.100\.20/);
});

test("Mihomo TUIC collector treats empty delta snapshots as collected zero traffic", async () => {
  const collector = createMihomoTuicUsageCollector({
    channelRef: "channel-sgp-a-tuic",
    snapshotReader: async () => ({
      sourceRef: "mihomo_connection_delta",
      accountingMode: "delta",
      observedAt: "2026-07-08T00:00:05.000Z",
      intervalStartedAt: "2026-07-08T00:00:00.000Z",
      intervalEndedAt: "2026-07-08T00:00:05.000Z",
      entries: []
    })
  });

  const result = await collector.collect({
    since: "2026-07-08T00:00:00.000Z"
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "collected");
  assert.equal(result.accountingMode, "delta");
  assert.deepEqual(result.observations, []);
  assert.deepEqual(result.blockers, []);
});
