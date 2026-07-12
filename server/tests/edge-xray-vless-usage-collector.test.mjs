import assert from "node:assert/strict";
import test from "node:test";
import { createXrayVlessUsageCollector } from "../services/edge/xray-vless-usage-collector.mjs";

test("Xray VLESS usage collector converts per-user stats into safe observations", async () => {
  const collector = createXrayVlessUsageCollector({
    channelRef: "channel-vultr-a-vless-reality-tcp",
    snapshotReader: async () => ({
      sourceRef: "xray_statsquery_user_traffic",
      accountingMode: "cumulative",
      observedAt: "2026-07-07T12:00:00.000Z",
      intervalStartedAt: "2026-07-07T11:55:00.000Z",
      intervalEndedAt: "2026-07-07T12:00:00.000Z",
      entries: [
        {
          edgeCredentialRef: "edgecred_vless_001",
          uploadBytes: 1200,
          downloadBytes: 3400,
          uuid: "11111111-1111-4111-8111-111111111111",
          privateKey: "must-not-return"
        }
      ]
    })
  });

  const result = await collector.collect();

  assert.equal(result.ok, true);
  assert.equal(result.status, "collected");
  assert.equal(result.accountingMode, "cumulative");
  assert.deepEqual(result.observations, [
    {
      accountingMode: "cumulative",
      sourceRef: "xray_statsquery_user_traffic",
      channelRef: "channel-vultr-a-vless-reality-tcp",
      edgeCredentialRef: "edgecred_vless_001",
      observedAt: "2026-07-07T12:00:00.000Z",
      intervalStartedAt: "2026-07-07T11:55:00.000Z",
      intervalEndedAt: "2026-07-07T12:00:00.000Z",
      uploadBytes: 1200,
      downloadBytes: 3400
    }
  ]);
  assert.equal(result.safety.noRawRuntimePayload, true);
  assert.equal(result.safety.noSecretMaterialReturned, true);
  assert.doesNotMatch(JSON.stringify(result), /11111111-1111-4111-8111-111111111111|must-not-return|privateKey/);
});

test("Xray VLESS usage collector reports idle when stats are reachable without user traffic", async () => {
  const collector = createXrayVlessUsageCollector({
    channelRef: "channel-vultr-a-vless-reality-tcp",
    snapshotReader: async () => ({
      sourceRef: "xray_statsquery_user_traffic",
      observedAt: "2026-07-07T12:00:00.000Z",
      intervalStartedAt: "2026-07-07T11:55:00.000Z",
      intervalEndedAt: "2026-07-07T12:00:00.000Z",
      entries: []
    })
  });

  const result = await collector.collect();

  assert.equal(result.ok, true);
  assert.equal(result.status, "idle_no_user_traffic");
  assert.deepEqual(result.observations, []);
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(result.observability, {
    statsApiReachable: true,
    userTrafficCountersObserved: false
  });
  assert.equal(result.nextAction, "continue_usage_monitoring_until_user_counters_are_observed");
});
