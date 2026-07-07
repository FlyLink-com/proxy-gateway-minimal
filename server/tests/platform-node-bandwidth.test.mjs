import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createApp } from "../app.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createTrafficAccountingService } from "../services/platform/traffic-accounting.mjs";
import { listen } from "./helpers/listen.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));

function fakeState(platform = {}, proxyConfig = { servers: [] }) {
  return {
    rootDir: ROOT,
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: "secret",
    proxyConfig: { pingHosts: [], nginx: {}, ...proxyConfig },
    platform,
    subscriptions: {},
    services: {
      ssLocal: { start: async () => ({ ok: true }), stop: async () => ({ ok: true }), status: () => ({ running: false }) },
      httpProxy: { start: async () => ({ ok: true }), stop: async () => ({ ok: true }), status: () => ({ running: false }) }
    },
    isPortListening: async () => false
  };
}

function authHeaders() {
  return { Authorization: "Bearer secret", "Content-Type": "application/json" };
}

function isoFromMs(ms) {
  return new Date(ms).toISOString();
}

async function withStore(fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "platform-node-bandwidth-"));
  let store;
  try {
    store = createSqliteSubscriptionControlStore({
      dbPath: join(tempDir, "control.sqlite")
    });
    return await fn(store);
  } finally {
    store?.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

function seedDeliveredOrder(store, {
  accountId = "acct_node_bandwidth_1",
  portalUserRef = "portal_user_node_bandwidth_1",
  requestId = "pareq_node_bandwidth_1",
  entitlementId = "ent_node_bandwidth_1",
  tenantRef = "tenant_node_bandwidth_1",
  artifactRef = "artifact_node_bandwidth_1",
  channelRef = "channel-vultr-a-hy2",
  edgeCredentialRef = "edgecred_pareq_node_bandwidth_1_channel-vultr-a-hy2",
  now = "2026-06-30T10:00:00.000Z"
} = {}) {
  store.createAccount({
    id: accountId,
    ownerRef: portalUserRef,
    status: "active",
    createdAt: now,
    updatedAt: now
  });
  store.createEntitlement({
    id: entitlementId,
    accountId,
    plan: "monthly",
    status: "active",
    validFrom: now,
    validUntil: "2026-07-30T10:00:00.000Z",
    trafficLimitBytes: 5000,
    createdAt: now,
    updatedAt: now
  });
  store.createIssuanceRequest({
    id: requestId,
    accountId,
    entitlementId,
    approvalRef: `approval_${requestId}`,
    status: "issued",
    quantity: 1,
    nodeId: channelRef,
    purpose: "portal_auto_issuance",
    requestedByRef: "portal_auto_issuer",
    createdAt: now,
    updatedAt: now
  });
  store.linkIssuedSubscription({
    id: `link_${requestId}`,
    requestId,
    tenantRef,
    artifactRef,
    status: "active",
    createdAt: now,
    updatedAt: now
  });
  store.upsertPortalAccessRequest({
    id: requestId,
    portalUserRef,
    plan: "monthly",
    clientTarget: "clash",
    durationDays: 30,
    quantity: 1,
    status: "delivered",
    nextAction: "user_can_use_access",
    noteProvided: false,
    priorTrialState: "not_applicable",
    submittedAt: now,
    updatedAt: now,
    reviewedAt: now,
    reviewedByRef: "portal_auto_issuer",
    expiresAt: "2026-07-30T10:00:00.000Z",
    validUntil: "2026-07-30T10:00:00.000Z",
    entitlementRef: entitlementId,
    accessGrantRef: `grant_${requestId}`,
    tenantId: tenantRef,
    artifactId: artifactRef,
    subscriptionUrl: "https://sub.example.test/sub/a/visible-once.yaml",
    edgeChannelRef: channelRef,
    edgeCredentialRef,
    edgeMaterialDigest: `sha256:digest_${requestId}`
  });
}

test("admin node bandwidth route returns safe per-node usage and throughput rollups", async () => {
  await withStore(async (controlStore) => {
    const testNowMs = Date.now();
    const latestSampleMs = testNowMs - 5 * 60 * 1000;
    const previousSampleMs = latestSampleMs - 61 * 1000;
    seedDeliveredOrder(controlStore, { now: isoFromMs(previousSampleMs - 60 * 1000) });
    const accounting = createTrafficAccountingService({
      controlStore,
      nowFn: () => isoFromMs(testNowMs),
      usageSampleRefFactory: ({ sourceRef }) => `usage_${sourceRef}`
    });
    accounting.recordUsageObservation({
      sourceRef: "node_bandwidth_sample_1",
      channelRef: "channel-vultr-a-hy2",
      edgeCredentialRef: "edgecred_pareq_node_bandwidth_1_channel-vultr-a-hy2",
      observedAt: isoFromMs(previousSampleMs),
      intervalStartedAt: isoFromMs(previousSampleMs - 10 * 1000),
      intervalEndedAt: isoFromMs(previousSampleMs),
      uploadBytes: 100,
      downloadBytes: 300
    });
    accounting.recordUsageObservation({
      sourceRef: "node_bandwidth_sample_2",
      channelRef: "channel-vultr-a-hy2",
      edgeCredentialRef: "edgecred_pareq_node_bandwidth_1_channel-vultr-a-hy2",
      observedAt: isoFromMs(latestSampleMs),
      intervalStartedAt: isoFromMs(latestSampleMs - 10 * 1000),
      intervalEndedAt: isoFromMs(latestSampleMs),
      uploadBytes: 200,
      downloadBytes: 800
    });

    const proxyConfig = {
      servers: [
        {
          name: "channel-vultr-a-hy2",
          protocol: "hysteria2",
          region: "Tokyo",
          physicalNodeRef: "node-vultr-a",
          runtimeAdapter: "hysteria2-explicit-restart",
          lifecycle: "active",
          capacityBps: 1000,
          host: "edge.example.test",
          port: 10443,
          password: "server-secret"
        },
        {
          name: "channel-sgp-a-tuic",
          protocol: "tuic",
          region: "Singapore",
          physicalNodeRef: "node-sgp-a",
          runtimeAdapter: "remote-data-plane-handoff",
          capacityBps: 2000,
          host: "sgp.example.test",
          port: 443,
          password: "tuic-secret"
        }
      ]
    };
    const { server, baseUrl } = await listen(createApp(fakeState({
      controlStore,
      edgeUsageAccounting: { collectAndRecord: async () => ({ ok: true }) }
    }, proxyConfig)));
    try {
      const response = await fetch(`${baseUrl}/api/admin/platform/node-bandwidth?bucket=minute`, {
        headers: authHeaders()
      });
      assert.equal(response.status, 200);
      const body = await response.json();

      assert.equal(body.nodeBandwidth.type, "node_bandwidth_summary");
      assert.equal(body.nodeBandwidth.items.length, 2);
      const measured = body.nodeBandwidth.items.find((item) => item.nodeId === "channel-vultr-a-hy2");
      assert.ok(measured);
      assert.equal(measured.physicalNodeRef, "node-vultr-a");
      assert.equal(measured.protocol, "hysteria2");
      assert.equal(measured.region, "Tokyo");
      assert.equal(measured.totalBytes, 1400);
      assert.equal(measured.uploadBytes, 300);
      assert.equal(measured.downloadBytes, 1100);
      assert.equal(measured.sampleCount, 2);
      assert.equal(measured.activeOrderCount, 1);
      assert.equal(measured.measuredOrderCount, 1);
      assert.equal(measured.currentUploadBps, 160);
      assert.equal(measured.currentDownloadBps, 640);
      assert.equal(measured.currentTotalBps, 800);
      assert.equal(measured.peakTotalBps, 800);
      assert.equal(measured.capacityBps, 1000);
      assert.equal(measured.utilizationPercent, 80);
      assert.equal(measured.utilizationState, "warning");
      assert.equal(measured.collectionStatus, "measured");
      assert.deepEqual(measured.warnings, ["utilization_high"]);

      const idle = body.nodeBandwidth.items.find((item) => item.nodeId === "channel-sgp-a-tuic");
      assert.ok(idle);
      assert.equal(idle.collectionStatus, "not_collected");
      assert.deepEqual(idle.warnings, ["no_usage_samples"]);
      assert.equal(idle.totalBytes, 0);

      assert.deepEqual(body.nodeBandwidth.aggregates.byNode, {
        "channel-sgp-a-tuic": 0,
        "channel-vultr-a-hy2": 1400
      });
      assert.equal(body.nodeBandwidth.series.points.length, 2);
      assert.equal(body.nodeBandwidth.safety.summaryOnly, true);
      assert.equal(body.nodeBandwidth.safety.rawEdgeCredentialReturned, false);
      assert.equal(body.nodeBandwidth.safety.rawRuntimePayloadReturned, false);
      assert.equal(body.nodeBandwidth.safety.mutationAllowed, false);
      assert.doesNotMatch(JSON.stringify(body), /visible-once|https?:\/\/|edgecred_|server-secret|tuic-secret|password|token=|bearer|rawConfig/i);

      const filtered = await fetch(`${baseUrl}/api/admin/platform/node-bandwidth?nodeId=channel-sgp-a-tuic`, {
        headers: authHeaders()
      });
      assert.equal(filtered.status, 200);
      const filteredBody = await filtered.json();
      assert.deepEqual(filteredBody.nodeBandwidth.items.map((item) => item.nodeId), ["channel-sgp-a-tuic"]);

      const filteredByPhysicalNode = await fetch(`${baseUrl}/api/admin/platform/node-bandwidth?nodeId=node-vultr-a`, {
        headers: authHeaders()
      });
      assert.equal(filteredByPhysicalNode.status, 200);
      const physicalBody = await filteredByPhysicalNode.json();
      assert.deepEqual(physicalBody.nodeBandwidth.items.map((item) => item.nodeId), ["channel-vultr-a-hy2"]);
      assert.equal(physicalBody.nodeBandwidth.items[0].totalBytes, 1400);
    } finally {
      server.close();
    }
  });
});
