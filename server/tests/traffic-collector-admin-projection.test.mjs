import assert from "node:assert/strict";
import {
  mkdtempSync,
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
  createFileTrafficCollectorStatusStore
} from "../services/platform/traffic-collector-admin-projection.mjs";
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
    assert.deepEqual(JSON.parse(readFileSync(statusPath, "utf8")), written);
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
