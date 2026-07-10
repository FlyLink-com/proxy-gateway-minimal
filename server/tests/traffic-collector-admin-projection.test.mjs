import assert from "node:assert/strict";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createApp } from "../app.mjs";
import {
  buildTrafficCollectorAdminProjection,
  createFileTrafficCollectorStatusStore,
  sanitizeTrafficCollectorAdminProjection
} from "../services/platform/traffic-collector-admin-projection.mjs";
import { sanitizeTrafficCollectorProducerStatus } from "../services/platform/traffic-collector-status-producers.mjs";
import { listen } from "./helpers/listen.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const OBSERVED_AT = "2026-07-10T13:00:00.000Z";

function collectorSummary(overrides = {}) {
  return {
    type: "traffic_usage_collect_once",
    ok: false,
    rawReportOk: false,
    collectorCount: 2,
    idleCollectorCount: 0,
    observationCount: 1,
    recordedCount: 0,
    insertedCount: 0,
    unresolvedCount: 1,
    reports: [
      {
        channelRef: "channel-vultr-a-tuic",
        collectorState: {
          type: "traffic_collector_state",
          health: "failed",
          condition: "auth_error",
          sourceRef: "mihomo_usage_primary",
          channelRef: "channel-vultr-a-tuic",
          lastCollectorSuccessAt: null,
          observationCount: 0,
          unresolvedCount: 0,
          errorType: "auth_error",
          safety: { redacted: true },
          rawConfig: "must-not-leak-config"
        },
        blockers: [
          "controller_unauthorized",
          "https://controller.example.test/secret?token=must-not-leak"
        ],
        observability: {
          statsApiReachable: true,
          userTrafficCountersObserved: false,
          controllerPayload: "must-not-leak-payload"
        },
        nextAction: "restart_runtime_must_not_be_projected"
      },
      {
        channelRef: "channel-invalid",
        collectorState: {
          health: "healthy",
          condition: "runtime_down",
          sourceRef: "invalid_source",
          channelRef: "channel-invalid"
        },
        blockers: ["collector_exception"]
      }
    ],
    rawEnvironment: "must-not-leak-env",
    customerEmail: "private@example.test",
    ...overrides
  };
}

function fakeState(platform = {}) {
  return {
    rootDir: ROOT,
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: "secret",
    proxyConfig: { servers: [], pingHosts: [], nginx: {} },
    platform,
    subscriptions: {},
    services: {
      ssLocal: { start: async () => ({ ok: true }), stop: async () => ({ ok: true }), status: () => ({ running: false }) },
      httpProxy: { start: async () => ({ ok: true }), stop: async () => ({ ok: true }), status: () => ({ running: false }) }
    },
    isPortListening: async () => false
  };
}

test("collector Admin projection preserves canonical state and only allowlisted source reasons", () => {
  const projection = buildTrafficCollectorAdminProjection({
    summary: collectorSummary(),
    observedAt: OBSERVED_AT
  });

  assert.equal(projection.type, "traffic_collector_admin_projection");
  assert.equal(projection.schemaVersion, "1");
  assert.equal(projection.availability, "available");
  assert.equal(projection.observedAt, OBSERVED_AT);
  assert.deepEqual(projection.run, {
    runOk: false,
    rawReportOk: false,
    collectorCount: 2,
    idleCollectorCount: 0
  });
  assert.deepEqual(projection.accounting, {
    recordingOk: false,
    observationCount: 1,
    recordedCount: 0,
    insertedCount: 0,
    unresolvedCount: 1
  });
  assert.equal(projection.collectors.length, 1);
  assert.deepEqual(projection.collectors[0], {
    type: "traffic_collector_state",
    health: "failed",
    condition: "auth_error",
    sourceRef: "mihomo_usage_primary",
    channelRef: "channel-vultr-a-tuic",
    lastCollectorSuccessAt: null,
    observationCount: 0,
    unresolvedCount: 0,
    errorType: "auth_error",
    reasonCodes: ["controller_unauthorized"],
    observability: {
      statsApiReachable: true,
      userTrafficCountersObserved: false
    },
    safety: { redacted: true }
  });
  assert.equal(projection.omittedCollectorCount, 1);
  assert.deepEqual(projection.safety, {
    redacted: true,
    summaryOnly: true,
    mutationAllowed: false,
    rawRuntimePayloadReturned: false,
    rawConfigReturned: false,
    rawLogReturned: false,
    credentialReturned: false,
    customerDataReturned: false
  });

  const serialized = JSON.stringify(projection);
  assert.doesNotMatch(serialized, /must-not-leak|private@example|https?:\/\/|token=|restart_runtime/i);
  assert.doesNotMatch(serialized, /retryable|recommendedAction|owner/i);
});

test("collector Admin projection keeps producer health separate and redacted", () => {
  const projection = buildTrafficCollectorAdminProjection({
    summary: collectorSummary(),
    observedAt: OBSERVED_AT,
    producerStatuses: [
      {
        type: "traffic_collector_status_producer",
        schemaVersion: "1",
        producerRef: "sgp_tuic_connection_delta_sidecar",
        availability: "available",
        observedAt: "2026-07-10T12:59:59.000Z",
        channelRef: "channel-sgp-a-tuic",
        producerHealth: "failed",
        producerCondition: "auth_error",
        lastSuccessAt: null,
        sidecar: {
          timerActive: true,
          timerEnabled: true,
          lastRunResult: "failed",
          recordUsage: true,
          stateFileConfigured: true,
          stateFileProtected: true,
          observationCount: 0,
          recordedCount: 0,
          insertedCount: 0,
          unresolvedCount: 0,
          rawLog: "must-not-leak-sidecar-log"
        },
        polling: {
          model: "connection_delta",
          intervalSeconds: 10,
          mayUndercountShortConnections: true
        },
        reasonCodes: ["controller_unauthorized", "https://private.example/token=must-not-leak"]
      },
      {
        type: "traffic_collector_status_producer",
        schemaVersion: "1",
        producerRef: "japan_tuic_usage_credential_map",
        availability: "available",
        observedAt: "2026-07-10T12:58:00.000Z",
        channelRef: "channel-vultr-a-tuic",
        producerHealth: "healthy",
        producerCondition: "ok",
        lastSuccessAt: "2026-07-10T12:58:00.000Z",
        map: {
          status: "in_sync",
          currentMapCount: 7,
          expectedMapCount: 7,
          addCount: 0,
          removeCount: 0,
          missingMaterialCount: 0,
          rawMap: "must-not-leak-map"
        }
      },
      {
        type: "traffic_collector_status_producer",
        schemaVersion: "1",
        producerRef: "unknown_producer",
        availability: "available",
        observedAt: OBSERVED_AT,
        producerHealth: "healthy",
        producerCondition: "ok"
      }
    ]
  });

  assert.equal(Array.isArray(projection.producers), true);
  assert.deepEqual(projection.producers.map((entry) => entry.producerRef), [
    "japan_tuic_usage_credential_map",
    "sgp_tuic_connection_delta_sidecar"
  ]);
  assert.equal(projection.producers[0].map.status, "in_sync");
  assert.equal(projection.producers[1].producerCondition, "auth_error");
  assert.deepEqual(projection.producers[1].reasonCodes, ["controller_unauthorized"]);
  assert.equal(projection.producers[1].polling.mayUndercountShortConnections, true);
  assert.equal(projection.omittedProducerCount, 1);
  assert.equal(Object.hasOwn(projection.run, "producerHealth"), false);
  assert.equal(Object.hasOwn(projection.accounting, "producerHealth"), false);

  const serialized = JSON.stringify(projection);
  assert.doesNotMatch(serialized, /must-not-leak|private\.example|token=|"rawMap":|"rawLog":/i);
});

test("collector producer sanitizer rejects contradictory sidecar health evidence", () => {
  const contradictory = {
    type: "traffic_collector_status_producer",
    schemaVersion: "1",
    producerRef: "sgp_tuic_connection_delta_sidecar",
    availability: "available",
    observedAt: "2026-07-10T12:59:59.000Z",
    channelRef: "channel-sgp-a-tuic",
    producerHealth: "healthy",
    producerCondition: "ok",
    lastSuccessAt: null,
    sidecar: {
      timerActive: false,
      timerEnabled: false,
      lastRunResult: "failed",
      recordUsage: true,
      stateFileConfigured: false,
      stateFileProtected: false,
      observationCount: 0,
      recordedCount: 0,
      insertedCount: 0,
      unresolvedCount: 1
    },
    polling: {
      model: "connection_delta",
      intervalSeconds: 10,
      mayUndercountShortConnections: true
    },
    reasonCodes: ["controller_unauthorized"]
  };

  assert.equal(sanitizeTrafficCollectorProducerStatus(contradictory), null);
});

test("collector producer sanitizer rejects contradictory map evidence", () => {
  const contradictory = {
    type: "traffic_collector_status_producer",
    schemaVersion: "1",
    producerRef: "japan_tuic_usage_credential_map",
    availability: "available",
    observedAt: "2026-07-10T12:58:00.000Z",
    channelRef: "channel-vultr-a-tuic",
    producerHealth: "healthy",
    producerCondition: "ok",
    lastSuccessAt: "2026-07-10T12:58:00.000Z",
    map: {
      status: "in_sync",
      currentMapCount: 6,
      expectedMapCount: 7,
      addCount: 1,
      removeCount: 0,
      changedCount: 0,
      missingMaterialCount: 1
    }
  };

  assert.equal(sanitizeTrafficCollectorProducerStatus(contradictory), null);
});

test("collector status store persists only the redacted projection and reports unavailable evidence safely", () => {
  const dir = mkdtempSync(join(tmpdir(), "collector-admin-projection-"));
  const statusPath = join(dir, "collector-status.json");
  try {
    const store = createFileTrafficCollectorStatusStore({ filePath: statusPath });
    assert.equal(store.read().availability, "not_observed");

    const written = store.write({
      summary: collectorSummary(),
      observedAt: OBSERVED_AT
    });
    assert.deepEqual(store.read(), written);
    assert.deepEqual(JSON.parse(readFileSync(statusPath, "utf8")), {
      ...written,
      producers: []
    });
    if (process.platform !== "win32") {
      assert.equal(statSync(statusPath).mode & 0o777, 0o600);
    }
    assert.doesNotMatch(readFileSync(statusPath, "utf8"), /must-not-leak|private@example|https?:\/\/|token=/i);

    writeFileSync(statusPath, "{not-json", { mode: 0o600 });
    const invalid = store.read();
    assert.equal(invalid.availability, "invalid_observation");
    assert.equal(invalid.observedAt, null);
    assert.deepEqual(invalid.collectors, []);
    assert.doesNotMatch(JSON.stringify(invalid), new RegExp(statusPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test("collector status store merges independent protected producer snapshots", () => {
  const dir = mkdtempSync(join(tmpdir(), "collector-admin-producers-"));
  const statusPath = join(dir, "collector-status.json");
  try {
    const store = createFileTrafficCollectorStatusStore({ filePath: statusPath });
    assert.equal(typeof store.writeProducerStatus, "function");
    const before = store.read();
    assert.deepEqual(before.producers.map((entry) => [entry.producerRef, entry.availability]), [
      ["japan_tuic_usage_credential_map", "not_observed"],
      ["sgp_tuic_connection_delta_sidecar", "not_observed"]
    ]);
    store.write({
      summary: collectorSummary(),
      observedAt: OBSERVED_AT
    });
    store.writeProducerStatus({
      type: "traffic_collector_status_producer",
      schemaVersion: "1",
      producerRef: "japan_tuic_usage_credential_map",
      availability: "available",
      observedAt: "2026-07-10T12:58:00.000Z",
      channelRef: "channel-vultr-a-tuic",
      producerHealth: "healthy",
      producerCondition: "ok",
      lastSuccessAt: "2026-07-10T12:58:00.000Z",
      map: {
        status: "in_sync",
        currentMapCount: 7,
        expectedMapCount: 7,
        addCount: 0,
        removeCount: 0,
        missingMaterialCount: 0,
        protectedMap: "must-not-leak-map"
      }
    });
    store.writeProducerStatus({
      type: "traffic_collector_status_producer",
      schemaVersion: "1",
      producerRef: "sgp_tuic_connection_delta_sidecar",
      availability: "available",
      observedAt: "2026-07-10T12:59:59.000Z",
      channelRef: "channel-sgp-a-tuic",
      producerHealth: "degraded",
      producerCondition: "sidecar_idle",
      lastSuccessAt: "2026-07-10T12:59:59.000Z",
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
        unresolvedCount: 0,
        controllerPayload: "must-not-leak-payload"
      },
      polling: {
        model: "connection_delta",
        intervalSeconds: 10,
        mayUndercountShortConnections: true
      },
      reasonCodes: []
    });

    const projection = store.read();
    assert.deepEqual(projection.producers.map((entry) => entry.producerRef), [
      "japan_tuic_usage_credential_map",
      "sgp_tuic_connection_delta_sidecar"
    ]);
    store.writeProducerStatus({
      type: "traffic_collector_status_producer",
      schemaVersion: "1",
      producerRef: "sgp_tuic_connection_delta_sidecar",
      availability: "available",
      observedAt: "2026-07-10T13:01:00.000Z",
      channelRef: "channel-sgp-a-tuic",
      producerHealth: "failed",
      producerCondition: "runtime_down",
      lastSuccessAt: null,
      sidecar: {
        timerActive: false,
        timerEnabled: true,
        lastRunResult: "failed",
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
      reasonCodes: []
    });
    const failedSidecar = store.read().producers.find((entry) => (
      entry.producerRef === "sgp_tuic_connection_delta_sidecar"
    ));
    assert.equal(failedSidecar.producerHealth, "failed");
    assert.equal(failedSidecar.lastSuccessAt, "2026-07-10T12:59:59.000Z");
    const files = readdirSync(dir).map((name) => join(dir, name));
    assert.equal(files.length, 3);
    for (const filePath of files) {
      if (process.platform !== "win32") {
        assert.equal(statSync(filePath).mode & 0o777, 0o600);
      }
      assert.doesNotMatch(readFileSync(filePath, "utf8"), /must-not-leak|"controllerPayload":|"protectedMap":/i);
    }

    const sidecarPath = files.find((filePath) => filePath.includes("sgp-tuic-sidecar"));
    writeFileSync(sidecarPath, '{"rawLog":"must-not-leak"}', { mode: 0o600 });
    const invalidSidecar = store.read().producers.find((entry) => (
      entry.producerRef === "sgp_tuic_connection_delta_sidecar"
    ));
    assert.equal(invalidSidecar.availability, "invalid_observation");
    assert.equal(invalidSidecar.producerHealth, null);
    assert.doesNotMatch(JSON.stringify(invalidSidecar), /must-not-leak|rawLog|collector-status/i);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test("collector status store preserves the last success time across a later failed run", () => {
  const dir = mkdtempSync(join(tmpdir(), "collector-admin-last-success-"));
  const statusPath = join(dir, "collector-status.json");
  try {
    const store = createFileTrafficCollectorStatusStore({ filePath: statusPath });
    store.write({
      observedAt: "2026-07-10T12:55:00.000Z",
      summary: collectorSummary({
        ok: true,
        rawReportOk: true,
        unresolvedCount: 0,
        reports: [{
          collectorState: {
            health: "healthy",
            condition: "ok",
            sourceRef: "mihomo_usage_primary",
            channelRef: "channel-vultr-a-tuic",
            lastCollectorSuccessAt: "2026-07-10T12:54:59.000Z",
            observationCount: 1,
            unresolvedCount: 0
          },
          blockers: []
        }]
      })
    });

    store.write({
      observedAt: OBSERVED_AT,
      summary: collectorSummary({
        reports: [{
          collectorState: {
            health: "failed",
            condition: "auth_error",
            sourceRef: "mihomo_usage_primary",
            channelRef: "channel-vultr-a-tuic",
            lastCollectorSuccessAt: null,
            observationCount: 0,
            unresolvedCount: 0
          },
          blockers: ["controller_unauthorized"]
        }]
      })
    });

    const projection = store.read();
    assert.equal(projection.observedAt, OBSERVED_AT);
    assert.equal(projection.collectors[0].health, "failed");
    assert.equal(projection.collectors[0].condition, "auth_error");
    assert.deepEqual(projection.collectors[0].reasonCodes, ["controller_unauthorized"]);
    assert.equal(projection.collectors[0].lastCollectorSuccessAt, "2026-07-10T12:54:59.000Z");
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test("collector status store rejects stale producer observations", () => {
  const dir = mkdtempSync(join(tmpdir(), "collector-admin-producer-order-"));
  const statusPath = join(dir, "collector-status.json");
  try {
    const store = createFileTrafficCollectorStatusStore({ filePath: statusPath });
    const base = {
      type: "traffic_collector_status_producer",
      schemaVersion: "1",
      producerRef: "japan_tuic_usage_credential_map",
      availability: "available",
      channelRef: "channel-vultr-a-tuic",
      safety: { redacted: true }
    };
    store.writeProducerStatus({
      ...base,
      observedAt: "2026-07-10T13:05:00.000Z",
      producerHealth: "healthy",
      producerCondition: "ok",
      lastSuccessAt: "2026-07-10T13:05:00.000Z",
      map: {
        status: "in_sync",
        currentMapCount: 7,
        expectedMapCount: 7,
        addCount: 0,
        removeCount: 0,
        changedCount: 0,
        missingMaterialCount: 0
      }
    });
    store.writeProducerStatus({
      ...base,
      observedAt: "2026-07-10T13:04:00.000Z",
      producerHealth: "degraded",
      producerCondition: "mapping_unresolved",
      lastSuccessAt: null,
      map: {
        status: "drifted",
        currentMapCount: 7,
        expectedMapCount: 7,
        addCount: 0,
        removeCount: 0,
        changedCount: 1,
        missingMaterialCount: 0
      }
    });

    const producer = store.read().producers.find((entry) => (
      entry.producerRef === "japan_tuic_usage_credential_map"
    ));
    assert.equal(producer.observedAt, "2026-07-10T13:05:00.000Z");
    assert.equal(producer.producerHealth, "healthy");
    assert.equal(producer.map.status, "in_sync");
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test("collector Admin projection rejects malformed available snapshot containers", () => {
  const projection = buildTrafficCollectorAdminProjection({
    summary: collectorSummary(),
    observedAt: OBSERVED_AT
  });

  for (const malformed of [
    { ...projection, run: [] },
    { ...projection, accounting: [] },
    { ...projection, collectors: {} }
  ]) {
    const sanitized = sanitizeTrafficCollectorAdminProjection(malformed);
    assert.equal(sanitized.availability, "invalid_observation");
    assert.equal(sanitized.observedAt, null);
    assert.deepEqual(sanitized.collectors, []);
  }
});

test("protected collector status route is read-only and does not trigger collection", async () => {
  let collectCalls = 0;
  const projection = buildTrafficCollectorAdminProjection({
    summary: collectorSummary(),
    observedAt: OBSERVED_AT
  });
  const { server, baseUrl } = await listen(createApp(fakeState({
    edgeUsageAccounting: {
      async collectAndRecord() {
        collectCalls += 1;
        throw new Error("GET must not collect");
      }
    },
    trafficCollectorStatusStore: {
      read() {
        return {
          ...projection,
          rawConfig: "must-not-leak-route-config",
          collectors: projection.collectors.map((collector) => ({
            ...collector,
            reasonCodes: [...collector.reasonCodes, "https://private.example.test/token=secret"],
            rawLog: "must-not-leak-route-log"
          }))
        };
      }
    }
  })));

  try {
    const unauthenticated = await fetch(`${baseUrl}/api/admin/platform/traffic-collector-status`);
    assert.equal(unauthenticated.status, 401);

    const response = await fetch(`${baseUrl}/api/admin/platform/traffic-collector-status`, {
      headers: { Authorization: "Bearer secret" }
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.collectorStatus, projection);
    assert.equal(collectCalls, 0);
  } finally {
    server.close();
  }
});

test("protected collector status route preserves producer-only evidence", async () => {
  const dir = mkdtempSync(join(tmpdir(), "collector-admin-producer-only-route-"));
  const statusPath = join(dir, "collector-status.json");
  const store = createFileTrafficCollectorStatusStore({ filePath: statusPath });
  store.writeProducerStatus({
    type: "traffic_collector_status_producer",
    schemaVersion: "1",
    producerRef: "japan_tuic_usage_credential_map",
    availability: "available",
    observedAt: "2026-07-10T12:58:00.000Z",
    channelRef: "channel-vultr-a-tuic",
    producerHealth: "healthy",
    producerCondition: "ok",
    lastSuccessAt: "2026-07-10T12:58:00.000Z",
    map: {
      status: "in_sync",
      currentMapCount: 7,
      expectedMapCount: 7,
      addCount: 0,
      removeCount: 0,
      changedCount: 0,
      missingMaterialCount: 0
    }
  });
  const { server, baseUrl } = await listen(createApp(fakeState({
    trafficCollectorStatusStore: store
  })));

  try {
    const response = await fetch(`${baseUrl}/api/admin/platform/traffic-collector-status`, {
      headers: { Authorization: "Bearer secret" }
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.collectorStatus.availability, "not_observed");
    assert.deepEqual(body.collectorStatus.producers.map((entry) => [
      entry.producerRef,
      entry.availability
    ]), [
      ["japan_tuic_usage_credential_map", "available"],
      ["sgp_tuic_connection_delta_sidecar", "not_observed"]
    ]);
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test("collector status route reports not_configured without inventing unknown health", async () => {
  const { server, baseUrl } = await listen(createApp(fakeState({
    edgeUsageAccounting: {
      async collectAndRecord() {
        throw new Error("GET must not collect");
      }
    }
  })));

  try {
    const response = await fetch(`${baseUrl}/api/admin/platform/traffic-collector-status`, {
      headers: { Authorization: "Bearer secret" }
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.collectorStatus.availability, "not_configured");
    assert.equal(body.collectorStatus.observedAt, null);
    assert.deepEqual(body.collectorStatus.collectors, []);
    assert.equal(Object.hasOwn(body.collectorStatus, "health"), false);
  } finally {
    server.close();
  }
});
