import assert from "node:assert/strict";
import test from "node:test";

import { createHysteria2UsageCollector } from "../services/edge/hysteria2-usage-collector.mjs";
import { createMihomoTuicUsageCollector } from "../services/edge/mihomo-tuic-usage-collector.mjs";
import { createXrayVlessUsageCollector } from "../services/edge/xray-vless-usage-collector.mjs";
import { createRuntimeUsageAccountingService } from "../services/platform/runtime-usage-accounting.mjs";

function sourceError(code) {
  const error = new Error("secret runtime payload must not leak");
  error.code = code;
  error.rawConfig = "private runtime config must not leak";
  return error;
}

async function collectReport(collector) {
  const service = createRuntimeUsageAccountingService({
    collectors: [collector],
    accounting: {
      recordUsageObservation() {
        throw new Error("failed collectors must not record usage");
      }
    }
  });
  return service.collectAndRecord();
}

test("Xray collector preserves a safe stats-query failure for canonical runtime-down state", async () => {
  const report = await collectReport({
    channelRef: "channel-vultr-a-vless-reality-tcp",
    ...createXrayVlessUsageCollector({
      channelRef: "channel-vultr-a-vless-reality-tcp",
      snapshotReader: async () => {
        throw sourceError("xray_stats_query_failed");
      }
    })
  });

  assert.equal(report.reports[0].collectorStatus, "collector_error");
  assert.deepEqual(report.reports[0].blockers, ["xray_stats_query_failed"]);
  assert.equal(report.reports[0].collectorState.sourceRef, "xray_statsquery_user_traffic");
  assert.equal(report.reports[0].collectorState.health, "failed");
  assert.equal(report.reports[0].collectorState.condition, "runtime_down");
  assert.doesNotMatch(JSON.stringify(report), /secret runtime payload|private runtime config|rawConfig/i);
});

test("Mihomo collector preserves a safe controller auth failure for canonical auth state", async () => {
  const report = await collectReport({
    channelRef: "channel-vultr-a-tuic",
    ...createMihomoTuicUsageCollector({
      channelRef: "channel-vultr-a-tuic",
      snapshotReader: async () => {
        throw sourceError("controller_unauthorized");
      }
    })
  });

  assert.equal(report.reports[0].collectorStatus, "collector_error");
  assert.deepEqual(report.reports[0].blockers, ["controller_unauthorized"]);
  assert.equal(report.reports[0].collectorState.sourceRef, "mihomo_usage_snapshot");
  assert.equal(report.reports[0].collectorState.health, "failed");
  assert.equal(report.reports[0].collectorState.condition, "auth_error");
  assert.doesNotMatch(JSON.stringify(report), /secret runtime payload|private runtime config|rawConfig/i);
});

test("Hysteria2 collector keeps runtime fetch failures distinct from config validation", async () => {
  const report = await collectReport({
    channelRef: "channel-vultr-a-hy2",
    ...createHysteria2UsageCollector({
      channelRef: "channel-vultr-a-hy2",
      trafficReader: async () => {
        throw sourceError("runtime_fetch_failed");
      },
      nowFn: () => "2026-07-10T00:00:00.000Z"
    })
  });

  assert.equal(report.reports[0].collectorStatus, "collector_error");
  assert.deepEqual(report.reports[0].blockers, ["runtime_fetch_failed"]);
  assert.equal(report.reports[0].collectorState.sourceRef, "hysteria2_traffic_stats");
  assert.equal(report.reports[0].collectorState.health, "failed");
  assert.equal(report.reports[0].collectorState.condition, "runtime_down");
  assert.doesNotMatch(JSON.stringify(report), /secret runtime payload|private runtime config|rawConfig/i);
});

test("unknown adapter exceptions still use the redacted platform fallback", async () => {
  const report = await collectReport({
    channelRef: "channel-vultr-a-tuic",
    ...createMihomoTuicUsageCollector({
      channelRef: "channel-vultr-a-tuic",
      snapshotReader: async () => {
        throw sourceError("constructor");
      }
    })
  });

  assert.equal(report.reports[0].collectorStatus, "collector_error");
  assert.deepEqual(report.reports[0].blockers, ["collector_exception"]);
  assert.equal(report.reports[0].collectorState.condition, "runtime_down");
  assert.doesNotMatch(JSON.stringify(report), /constructor|secret runtime payload|private runtime config|rawConfig/i);
});
