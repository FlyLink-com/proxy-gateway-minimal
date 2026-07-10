import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import * as sidecarModule from "../../scripts/mihomo-connection-delta-usage-sidecar.mjs";
import { createFileTrafficCollectorStatusStore } from "../services/platform/traffic-collector-admin-projection.mjs";

const { runMihomoConnectionDeltaUsageSidecar } = sidecarModule;

test("Mihomo connection delta sidecar producer exposes idle and polling limits separately", () => {
  assert.equal(typeof sidecarModule.buildMihomoConnectionDeltaSidecarProducerStatus, "function");

  const status = sidecarModule.buildMihomoConnectionDeltaSidecarProducerStatus({
    summary: {
      type: "mihomo_connection_delta_usage_sidecar",
      ok: true,
      recordUsage: true,
      collectorStatus: "collected",
      channelRef: "channel-sgp-a-tuic",
      accountingMode: "delta",
      stateWarmup: true,
      observationCount: 0,
      recordedCount: 0,
      insertedCount: 0,
      unresolvedCount: 0,
      blockers: [],
      rawControllerPayload: "must-not-leak"
    },
    observedAt: "2026-07-10T14:05:00.000Z",
    timer: { active: true, enabled: true },
    stateFile: { configured: true, protected: true },
    pollIntervalSeconds: 10
  });

  assert.deepEqual(status, {
    type: "traffic_collector_status_producer",
    schemaVersion: "1",
    producerRef: "sgp_tuic_connection_delta_sidecar",
    availability: "available",
    observedAt: "2026-07-10T14:05:00.000Z",
    channelRef: "channel-sgp-a-tuic",
    producerHealth: "degraded",
    producerCondition: "sidecar_idle",
    lastSuccessAt: "2026-07-10T14:05:00.000Z",
    sidecar: {
      timerActive: true,
      timerEnabled: true,
      lastRunResult: "success",
      recordUsage: true,
      stateFileConfigured: true,
      stateFileProtected: true,
      observationCount: 0,
      recordedCount: 0,
      insertedCount: 0,
      unresolvedCount: 0
    },
    polling: {
      model: "connection_delta",
      intervalSeconds: 10,
      mayUndercountShortConnections: true
    },
    reasonCodes: [],
    safety: {
      redacted: true,
      summaryOnly: true,
      protectedMaterialReturned: false,
      rawControllerPayloadReturned: false
    }
  });
  assert.doesNotMatch(JSON.stringify(status), /must-not-leak|"rawControllerPayload":|credentialRef|password|token/i);

  const authFailure = sidecarModule.buildMihomoConnectionDeltaSidecarProducerStatus({
    summary: {
      type: "mihomo_connection_delta_usage_sidecar",
      ok: false,
      recordUsage: false,
      channelRef: "channel-sgp-a-tuic",
      observationCount: 0,
      recordedCount: 0,
      insertedCount: 0,
      unresolvedCount: 0,
      blockers: ["controller_unauthorized", "https://private.example/token=must-not-leak"]
    },
    observedAt: "2026-07-10T14:06:00.000Z",
    timer: { active: true, enabled: true },
    stateFile: { configured: true, protected: true }
  });
  assert.equal(authFailure.producerHealth, "failed");
  assert.equal(authFailure.producerCondition, "auth_error");
  assert.deepEqual(authFailure.reasonCodes, ["controller_unauthorized"]);
  assert.doesNotMatch(JSON.stringify(authFailure), /private\.example|token=|must-not-leak/i);

  const unsafeStateFile = sidecarModule.buildMihomoConnectionDeltaSidecarProducerStatus({
    summary: {
      type: "mihomo_connection_delta_usage_sidecar",
      ok: true,
      recordUsage: true,
      channelRef: "channel-sgp-a-tuic",
      observationCount: 1,
      recordedCount: 1,
      insertedCount: 1,
      unresolvedCount: 0,
      blockers: []
    },
    observedAt: "2026-07-10T14:07:00.000Z",
    timer: { active: true, enabled: true },
    stateFile: { configured: true, protected: false }
  });
  assert.equal(unsafeStateFile.producerHealth, "failed");
  assert.equal(unsafeStateFile.producerCondition, "config_error");

  const unknownTimer = sidecarModule.buildMihomoConnectionDeltaSidecarProducerStatus({
    summary: {
      type: "mihomo_connection_delta_usage_sidecar",
      ok: true,
      recordUsage: true,
      channelRef: "channel-sgp-a-tuic",
      observationCount: 1,
      recordedCount: 1,
      insertedCount: 1,
      unresolvedCount: 0,
      blockers: []
    },
    observedAt: "2026-07-10T14:08:00.000Z",
    timer: { active: null, enabled: null },
    stateFile: { configured: true, protected: true }
  });
  assert.equal(unknownTimer.producerHealth, "degraded");
  assert.equal(unknownTimer.producerCondition, "missing_stats");
});

test("Mihomo connection delta sidecar emits redacted delta summaries across persisted state", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "mihomo-delta-sidecar-"));
  const statePath = join(tempDir, "state.json");
  const statusPath = join(tempDir, "collector-status.json");
  const secretPath = join(tempDir, "controller.secret");
  const runtimeUser = "11111111-1111-4111-8111-111111111111";
  writeFileSync(secretPath, "sidecar-controller-secret\n", { mode: 0o600 });
  const env = {
    MIHOMO_CONNECTION_DELTA_CONTROLLER_URL: "http://127.0.0.1:19091",
    MIHOMO_CONNECTION_DELTA_CONTROLLER_SECRET_FILE: secretPath,
    MIHOMO_CONNECTION_DELTA_CHANNEL_REF: "channel-sgp-a-tuic",
    MIHOMO_CONNECTION_DELTA_STATE_PATH: statePath,
    MIHOMO_CONNECTION_DELTA_POLL_INTERVAL_SECONDS: "10",
    EDGE_USAGE_COLLECTOR_STATUS_PATH: statusPath,
    MIHOMO_CONNECTION_DELTA_CREDENTIAL_MAP_JSON: JSON.stringify({
      [runtimeUser]: "edgecred_runtime_user_001"
    })
  };
  const payloads = [
    {
      connections: [
        {
          id: "conn-1",
          upload: 100,
          download: 200,
          metadata: {
            inboundUser: runtimeUser,
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
          upload: 140,
          download: 260,
          metadata: {
            inboundUser: runtimeUser
          }
        }
      ]
    }
  ];
  let callIndex = 0;
  const authorizations = [];
  const outputs = [];
  const stdout = {
    write(chunk) {
      outputs.push(String(chunk));
    }
  };

  try {
    const firstCode = await runMihomoConnectionDeltaUsageSidecar({
      argv: ["--collect"],
      env,
      stdout,
      fetchJson: async (request) => {
        authorizations.push(request.headers.Authorization);
        return payloads[callIndex++];
      },
      timerStatusReader: () => ({ active: true, enabled: true }),
      stateFileStatusReader: () => ({ configured: true, protected: true }),
      nowFn: () => callIndex === 1 ? "2026-07-08T00:00:00.000Z" : "2026-07-08T00:00:05.000Z"
    });
    const secondCode = await runMihomoConnectionDeltaUsageSidecar({
      argv: ["--collect"],
      env,
      stdout,
      fetchJson: async (request) => {
        authorizations.push(request.headers.Authorization);
        return payloads[callIndex++];
      },
      timerStatusReader: () => ({ active: true, enabled: true }),
      stateFileStatusReader: () => ({ configured: true, protected: true }),
      nowFn: () => "2026-07-08T00:00:05.000Z"
    });

    assert.equal(firstCode, 0);
    assert.equal(secondCode, 0);
    const summaries = outputs.join("").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.equal(summaries[0].stateWarmup, true);
    assert.equal(summaries[0].observationCount, 0);
    assert.equal(summaries[1].stateWarmup, false);
    assert.equal(summaries[1].observationCount, 1);
    assert.equal(summaries[1].recordUsage, false);
    assert.equal(summaries[1].recordedCount, 0);
    assert.equal(summaries[1].sensitiveOutputSuppressed, true);
    assert.deepEqual(authorizations, [
      "Bearer sidecar-controller-secret",
      "Bearer sidecar-controller-secret"
    ]);
    const producerProjection = createFileTrafficCollectorStatusStore({ filePath: statusPath }).read();
    assert.equal(producerProjection.producers.length, 2);
    const producer = producerProjection.producers.find((entry) => (
      entry.producerRef === "sgp_tuic_connection_delta_sidecar"
    ));
    const mapProducer = producerProjection.producers.find((entry) => (
      entry.producerRef === "japan_tuic_usage_credential_map"
    ));
    assert.equal(producer.producerRef, "sgp_tuic_connection_delta_sidecar");
    assert.equal(producer.producerHealth, "healthy");
    assert.equal(producer.producerCondition, "ok");
    assert.equal(producer.lastSuccessAt, "2026-07-08T00:00:05.000Z");
    assert.equal(producer.sidecar.timerActive, true);
    assert.equal(producer.sidecar.timerEnabled, true);
    assert.equal(producer.sidecar.stateFileProtected, true);
    assert.equal(producer.polling.mayUndercountShortConnections, true);
    assert.equal(mapProducer.availability, "not_observed");
    assert.doesNotMatch(outputs.join(""), /11111111-1111-4111-8111-111111111111|edgecred_runtime_user_001|runtime-password|198\.51\.100\.20|sidecar-controller-secret/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("Mihomo connection delta sidecar records redacted initialization failure", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "mihomo-delta-sidecar-failure-"));
  const statusPath = join(tempDir, "collector-status.json");
  const output = [];
  const env = {
    MIHOMO_CONNECTION_DELTA_CONTROLLER_URL: "http://127.0.0.1:19091",
    MIHOMO_CONNECTION_DELTA_CONTROLLER_SECRET_FILE: join(tempDir, "must-not-leak-controller.secret"),
    MIHOMO_CONNECTION_DELTA_CHANNEL_REF: "channel-sgp-a-tuic",
    MIHOMO_CONNECTION_DELTA_STATE_PATH: join(tempDir, "state.json"),
    EDGE_USAGE_COLLECTOR_STATUS_PATH: statusPath
  };
  let code;

  try {
    await assert.doesNotReject(async () => {
      code = await runMihomoConnectionDeltaUsageSidecar({
        argv: ["--collect"],
        env,
        stdout: { write: (chunk) => output.push(String(chunk)) },
        stderr: { write: (chunk) => output.push(String(chunk)) },
        timerStatusReader: () => ({ active: true, enabled: true }),
        stateFileStatusReader: () => ({ configured: true, protected: false }),
        nowFn: () => "2026-07-10T14:20:00.000Z"
      });
    });

    assert.equal(code, 1);
    const producer = createFileTrafficCollectorStatusStore({ filePath: statusPath })
      .read()
      .producers
      .find((entry) => entry.producerRef === "sgp_tuic_connection_delta_sidecar");
    assert.equal(producer.producerHealth, "failed");
    assert.equal(producer.producerCondition, "config_error");
    assert.equal(producer.sidecar.lastRunResult, "failed");
    assert.deepEqual(producer.reasonCodes, ["validation_error"]);
    assert.doesNotMatch(output.join(""), /must-not-leak|controller\.secret|ENOENT|127\.0\.0\.1|19091/i);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
