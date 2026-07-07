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

function fakeState(platform = {}, subscriptions = {}) {
  return {
    rootDir: ROOT,
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: "secret",
    proxyConfig: { servers: [], pingHosts: [], nginx: {} },
    platform,
    subscriptions,
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

async function withStore(fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "platform-usage-monitor-route-"));
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
  accountId,
  portalUserRef,
  requestId,
  entitlementId,
  tenantRef,
  artifactRef,
  edgeCredentialRef,
  channelRef,
  edgeCredentials,
  plan = "monthly",
  quantity = 1,
  trafficLimitBytes = 0,
  now = "2026-06-08T00:00:00.000Z"
}) {
  if (!store.getAccount(accountId)) {
    store.createAccount({
      id: accountId,
      ownerRef: portalUserRef,
      status: "active",
      createdAt: now,
      updatedAt: now
    });
  }
  store.createEntitlement({
    id: entitlementId,
    accountId,
    plan,
    status: "active",
    validFrom: now,
    validUntil: "2026-07-08T00:00:00.000Z",
    trafficLimitBytes,
    createdAt: now,
    updatedAt: now
  });
  store.createIssuanceRequest({
    id: requestId,
    accountId,
    entitlementId,
    approvalRef: `approval_${requestId}`,
    status: "issued",
    quantity,
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
    plan,
    clientTarget: "clash",
    durationDays: plan === "trial" ? 7 : 30,
    quantity,
    status: "delivered",
    nextAction: "user_can_use_access",
    noteProvided: false,
    priorTrialState: "not_applicable",
    submittedAt: now,
    updatedAt: now,
    reviewedAt: now,
    reviewedByRef: "portal_auto_issuer",
    expiresAt: "2026-07-08T00:00:00.000Z",
    validUntil: "2026-07-08T00:00:00.000Z",
    entitlementRef: entitlementId,
    accessGrantRef: `grant_${requestId}`,
    tenantId: tenantRef,
    artifactId: artifactRef,
    subscriptionUrl: "https://sub.example.test/sub/a/visible-once.yaml",
    edgeChannelRef: channelRef,
    edgeCredentialRef,
    edgeMaterialDigest: `sha256:digest_${requestId}`,
    edgeCredentials
  });
}

test("admin subscription usage monitor returns every delivered order with portal user ownership", async () => {
  await withStore(async (controlStore) => {
    seedDeliveredOrder(controlStore, {
      accountId: "acct_usage_monitor_1",
      portalUserRef: "portal_user_usage_monitor_1",
      requestId: "pareq_usage_monitor_1",
      entitlementId: "ent_usage_monitor_1",
      tenantRef: "tenant_usage_monitor_1",
      artifactRef: "artifact_usage_monitor_1",
      edgeCredentialRef: "edgecred_pareq_usage_monitor_1",
      channelRef: "channel-vultr-a-vless-reality-tcp",
      trafficLimitBytes: 1000
    });
    seedDeliveredOrder(controlStore, {
      accountId: "acct_usage_monitor_2",
      portalUserRef: "portal_user_usage_monitor_2",
      requestId: "pareq_usage_monitor_2",
      entitlementId: "ent_usage_monitor_2",
      tenantRef: "tenant_usage_monitor_2",
      artifactRef: "artifact_usage_monitor_2",
      edgeCredentialRef: "edgecred_pareq_usage_monitor_2_channel-vultr-a-hy2",
      channelRef: "channel-vultr-a-hy2",
      plan: "trial",
      trafficLimitBytes: 500
    });
    const accounting = createTrafficAccountingService({
      controlStore,
      nowFn: () => "2026-06-08T01:06:00.000Z"
    });
    accounting.recordUsageObservation({
      sourceRef: "hy2_stats_usage_monitor_2",
      channelRef: "channel-vultr-a-hy2",
      edgeCredentialRef: "edgecred_pareq_usage_monitor_2_channel-vultr-a-hy2",
      observedAt: "2026-06-08T00:05:00.000Z",
      intervalStartedAt: "2026-06-08T00:00:00.000Z",
      intervalEndedAt: "2026-06-08T00:05:00.000Z",
      uploadBytes: 100,
      downloadBytes: 200
    });
    accounting.recordUsageObservation({
      sourceRef: "hy2_stats_usage_monitor_2_later",
      channelRef: "channel-vultr-a-hy2",
      edgeCredentialRef: "edgecred_pareq_usage_monitor_2_channel-vultr-a-hy2",
      observedAt: "2026-06-08T01:05:00.000Z",
      intervalStartedAt: "2026-06-08T01:00:00.000Z",
      intervalEndedAt: "2026-06-08T01:05:00.000Z",
      uploadBytes: 50,
      downloadBytes: 250
    });

    const { server, baseUrl } = await listen(createApp(fakeState({
      controlStore,
      portalAccessRequests: { listRequests: () => [] }
    })));
    try {
      const response = await fetch(`${baseUrl}/api/admin/platform/subscription-usage-monitor`, {
        headers: authHeaders()
      });
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type") || "", /application\/json/);
      const body = await response.json();
      assert.equal(body.monitor.type, "subscription_usage_monitor");
      assert.equal(body.monitor.items.length, 2);
      assert.deepEqual(body.monitor.items.map((item) => item.portalUserRef), [
        "portal_user_usage_monitor_1",
        "portal_user_usage_monitor_2"
      ]);
      assert.deepEqual(body.monitor.items.map((item) => item.issuanceRequestId), [
        "pareq_usage_monitor_1",
        "pareq_usage_monitor_2"
      ]);
      assert.equal(body.monitor.items[0].usedBytes, 0);
      assert.equal(body.monitor.items[0].usageStatus, "not_collected");
      assert.equal(body.monitor.items[0].collectionStatus, "collector_disabled");
      assert.equal(body.monitor.items[0].usageMeasured, false);
      assert.equal(body.monitor.items[0].lastUsageObservedAt, null);
      assert.deepEqual(body.monitor.items[0].channelUsages, []);
      assert.deepEqual(body.monitor.items[0].edgeCredentialBindings, [
        {
          channelRef: "channel-vultr-a-vless-reality-tcp",
          credentialRefPresent: true,
          materialDigestPresent: true,
          usageMeasured: false
        }
      ]);
      assert.equal(body.monitor.items[1].usedBytes, 600);
      assert.equal(body.monitor.items[1].usageStatus, "measured");
      assert.equal(body.monitor.items[1].collectionStatus, "measured");
      assert.equal(body.monitor.items[1].usageMeasured, true);
      assert.equal(body.monitor.items[1].lastUsageObservedAt, "2026-06-08T01:05:00.000Z");
      assert.deepEqual(body.monitor.items[1].channelUsages, [
        {
          channelRef: "channel-vultr-a-hy2",
          usedBytes: 600,
          uploadBytes: 150,
          downloadBytes: 450,
          lastObservedAt: "2026-06-08T01:05:00.000Z"
        }
      ]);
      assert.equal(body.monitor.items[1].trafficLimitBytes, 500);
      assert.equal(body.monitor.aggregates.total, 2);
      assert.equal(body.monitor.aggregates.usage.totalUsedBytes, 600);
      assert.equal(body.monitor.aggregates.usage.totalUploadBytes, 150);
      assert.equal(body.monitor.aggregates.usage.totalDownloadBytes, 450);
      assert.equal(body.monitor.aggregates.usage.measuredOrders, 1);
      assert.equal(body.monitor.aggregates.usage.unmeasuredOrders, 1);
      assert.deepEqual(body.monitor.aggregates.usage.byUsageChannel, {
        "channel-vultr-a-hy2": 600
      });
      assert.equal(body.monitor.series.type, "subscription_usage_timeseries");
      assert.equal(body.monitor.series.range.bucket, "hour");
      assert.deepEqual(body.monitor.series.points.map((point) => ({
        bucketStart: point.bucketStart,
        portalUserRef: point.portalUserRef,
        issuanceRequestId: point.issuanceRequestId,
        channelRef: point.channelRef,
        uploadBytes: point.uploadBytes,
        downloadBytes: point.downloadBytes,
        usedBytes: point.usedBytes
      })), [
        {
          bucketStart: "2026-06-08T00:00:00.000Z",
          portalUserRef: "portal_user_usage_monitor_2",
          issuanceRequestId: "pareq_usage_monitor_2",
          channelRef: "channel-vultr-a-hy2",
          uploadBytes: 100,
          downloadBytes: 200,
          usedBytes: 300
        },
        {
          bucketStart: "2026-06-08T01:00:00.000Z",
          portalUserRef: "portal_user_usage_monitor_2",
          issuanceRequestId: "pareq_usage_monitor_2",
          channelRef: "channel-vultr-a-hy2",
          uploadBytes: 50,
          downloadBytes: 250,
          usedBytes: 300
        }
      ]);
      assert.deepEqual(body.monitor.series.aggregates.byOrder, {
        pareq_usage_monitor_2: 600
      });
      assert.deepEqual(body.monitor.series.aggregates.byAccount, {
        portal_user_usage_monitor_2: 600
      });
      assert.deepEqual(body.monitor.series.aggregates.byChannel, {
        "channel-vultr-a-hy2": 600
      });
      assert.equal(body.monitor.series.safety.orderScoped, true);
      assert.equal(body.monitor.series.safety.rawEdgeCredentialReturned, false);
      assert.equal(body.monitor.safety.orderLevelRows, true);
      assert.equal(body.monitor.safety.channelUsageBreakdownIncluded, true);
      assert.equal(body.monitor.safety.rawSubscriptionUrlReturned, false);
      assert.doesNotMatch(JSON.stringify(body.monitor), /visible-once|https?:\/\/|password|token=|bearer|rawConfig|edgecred_/i);

      const filtered = await fetch(
        `${baseUrl}/api/admin/platform/subscription-usage-monitor?accountId=portal_user_usage_monitor_2`,
        { headers: authHeaders() }
      );
      assert.equal(filtered.status, 200);
      const filteredBody = await filtered.json();
      assert.equal(filteredBody.monitor.items.length, 1);
      assert.equal(filteredBody.monitor.items[0].portalUserRef, "portal_user_usage_monitor_2");
    } finally {
      server.close();
    }
  });
});

test("admin subscription usage monitor exposes user-level traffic aggregates across orders", async () => {
  await withStore(async (controlStore) => {
    seedDeliveredOrder(controlStore, {
      accountId: "acct_usage_user_rollup",
      portalUserRef: "portal_user_usage_rollup",
      requestId: "pareq_usage_user_rollup_1",
      entitlementId: "ent_usage_user_rollup_1",
      tenantRef: "tenant_usage_user_rollup_1",
      artifactRef: "artifact_usage_user_rollup_1",
      edgeCredentialRef: "edgecred_pareq_usage_user_rollup_1",
      channelRef: "channel-vultr-a-hy2",
      plan: "monthly",
      trafficLimitBytes: 1000
    });
    seedDeliveredOrder(controlStore, {
      accountId: "acct_usage_user_rollup",
      portalUserRef: "portal_user_usage_rollup",
      requestId: "pareq_usage_user_rollup_2",
      entitlementId: "ent_usage_user_rollup_2",
      tenantRef: "tenant_usage_user_rollup_2",
      artifactRef: "artifact_usage_user_rollup_2",
      edgeCredentialRef: "edgecred_pareq_usage_user_rollup_2",
      channelRef: "channel-vultr-b-tuic",
      plan: "yearly",
      trafficLimitBytes: 2000
    });
    const accounting = createTrafficAccountingService({
      controlStore,
      nowFn: () => "2026-06-08T01:06:00.000Z"
    });
    accounting.recordUsageObservation({
      sourceRef: "hy2_stats_usage_user_rollup_1",
      channelRef: "channel-vultr-a-hy2",
      edgeCredentialRef: "edgecred_pareq_usage_user_rollup_1",
      observedAt: "2026-06-08T00:05:00.000Z",
      intervalStartedAt: "2026-06-08T00:00:00.000Z",
      intervalEndedAt: "2026-06-08T00:05:00.000Z",
      uploadBytes: 100,
      downloadBytes: 200
    });
    accounting.recordUsageObservation({
      sourceRef: "tuic_stats_usage_user_rollup_2",
      channelRef: "channel-vultr-b-tuic",
      edgeCredentialRef: "edgecred_pareq_usage_user_rollup_2",
      observedAt: "2026-06-08T00:10:00.000Z",
      intervalStartedAt: "2026-06-08T00:00:00.000Z",
      intervalEndedAt: "2026-06-08T00:10:00.000Z",
      uploadBytes: 50,
      downloadBytes: 250
    });

    const { server, baseUrl } = await listen(createApp(fakeState({
      controlStore,
      portalAccessRequests: { listRequests: () => [] }
    })));
    try {
      const response = await fetch(`${baseUrl}/api/admin/platform/subscription-usage-monitor`, {
        headers: authHeaders()
      });
      assert.equal(response.status, 200);
      const body = await response.json();

      assert.equal(body.monitor.items.length, 2);
      assert.equal(body.monitor.userAggregates.length, 1);
      assert.deepEqual(body.monitor.userAggregates[0], {
        accountId: "acct_usage_user_rollup",
        portalUserRef: "portal_user_usage_rollup",
        orderCount: 2,
        measuredOrders: 2,
        unmeasuredOrders: 0,
        zeroUsageOrders: 0,
        plans: ["monthly", "yearly"],
        issuedChannels: ["channel-vultr-a-hy2", "channel-vultr-b-tuic"],
        trafficLimitBytes: 3000,
        usedBytes: 600,
        uploadBytes: 150,
        downloadBytes: 450,
        collectionStatus: "measured",
        usageMeasured: true,
        lastUsageObservedAt: "2026-06-08T00:10:00.000Z",
        channelUsages: [
          {
            channelRef: "channel-vultr-a-hy2",
            usedBytes: 300,
            uploadBytes: 100,
            downloadBytes: 200,
            lastObservedAt: "2026-06-08T00:05:00.000Z"
          },
          {
            channelRef: "channel-vultr-b-tuic",
            usedBytes: 300,
            uploadBytes: 50,
            downloadBytes: 250,
            lastObservedAt: "2026-06-08T00:10:00.000Z"
          }
        ],
        warnings: []
      });
      assert.equal(body.monitor.safety.userAggregatedRows, true);
      assert.doesNotMatch(JSON.stringify(body.monitor.userAggregates), /visible-once|https?:\/\/|password|token=|bearer|rawConfig|edgecred_/i);
    } finally {
      server.close();
    }
  });
});

test("admin subscription usage monitor keeps user aggregates pending when any order is unmeasured", async () => {
  await withStore(async (controlStore) => {
    seedDeliveredOrder(controlStore, {
      accountId: "acct_usage_user_partial",
      portalUserRef: "portal_user_usage_partial",
      requestId: "pareq_usage_user_partial_1",
      entitlementId: "ent_usage_user_partial_1",
      tenantRef: "tenant_usage_user_partial_1",
      artifactRef: "artifact_usage_user_partial_1",
      edgeCredentialRef: "edgecred_pareq_usage_user_partial_1",
      channelRef: "channel-vultr-a-hy2",
      trafficLimitBytes: 1000
    });
    seedDeliveredOrder(controlStore, {
      accountId: "acct_usage_user_partial",
      portalUserRef: "portal_user_usage_partial",
      requestId: "pareq_usage_user_partial_2",
      entitlementId: "ent_usage_user_partial_2",
      tenantRef: "tenant_usage_user_partial_2",
      artifactRef: "artifact_usage_user_partial_2",
      edgeCredentialRef: "edgecred_pareq_usage_user_partial_2",
      channelRef: "channel-vultr-b-tuic",
      trafficLimitBytes: 2000
    });
    const accounting = createTrafficAccountingService({
      controlStore,
      nowFn: () => "2026-06-08T01:06:00.000Z"
    });
    accounting.recordUsageObservation({
      sourceRef: "hy2_stats_usage_user_partial_1",
      channelRef: "channel-vultr-a-hy2",
      edgeCredentialRef: "edgecred_pareq_usage_user_partial_1",
      observedAt: "2026-06-08T00:05:00.000Z",
      intervalStartedAt: "2026-06-08T00:00:00.000Z",
      intervalEndedAt: "2026-06-08T00:05:00.000Z",
      uploadBytes: 100,
      downloadBytes: 200
    });

    const { server, baseUrl } = await listen(createApp(fakeState({
      controlStore,
      portalAccessRequests: { listRequests: () => [] }
    })));
    try {
      const response = await fetch(`${baseUrl}/api/admin/platform/subscription-usage-monitor`, {
        headers: authHeaders()
      });
      assert.equal(response.status, 200);
      const body = await response.json();

      assert.equal(body.monitor.userAggregates.length, 1);
      assert.deepEqual(body.monitor.userAggregates[0], {
        accountId: "acct_usage_user_partial",
        portalUserRef: "portal_user_usage_partial",
        orderCount: 2,
        measuredOrders: 1,
        unmeasuredOrders: 1,
        zeroUsageOrders: 0,
        plans: ["monthly"],
        issuedChannels: ["channel-vultr-a-hy2", "channel-vultr-b-tuic"],
        trafficLimitBytes: 3000,
        usedBytes: 300,
        uploadBytes: 100,
        downloadBytes: 200,
        collectionStatus: "not_collected",
        usageMeasured: true,
        lastUsageObservedAt: "2026-06-08T00:05:00.000Z",
        channelUsages: [
          {
            channelRef: "channel-vultr-a-hy2",
            usedBytes: 300,
            uploadBytes: 100,
            downloadBytes: 200,
            lastObservedAt: "2026-06-08T00:05:00.000Z"
          }
        ],
        warnings: []
      });
    } finally {
      server.close();
    }
  });
});

test("admin subscription usage monitor collect route records runtime usage through accounting service", async () => {
  let receivedInput;
  const { server, baseUrl } = await listen(createApp(fakeState({
    edgeUsageAccounting: {
      collectAndRecord: async (input) => {
        receivedInput = input;
        return {
          type: "gccgw_runtime_usage_accounting_report",
          ok: true,
          collectorCount: 1,
          observationCount: 1,
          recordedCount: 1,
          insertedCount: 1,
          unresolvedCount: 0,
          quotaDisableRequiredCount: 0,
          reports: [
            {
              channelRef: "channel-vultr-a-hy2",
              collectorOk: true,
              collectorStatus: "collected",
              observationCount: 1,
              recordedCount: 1,
              unresolvedCount: 0,
              blockers: [],
              recorded: [
                {
                  ok: true,
                  status: "within_quota",
                  channelRef: "channel-vultr-a-hy2",
                  edgeCredentialRef: "edgecred_redacted",
                  sampleInserted: true,
                  nextAction: "continue_metering"
                }
              ],
              nextAction: "record_usage_observations_with_control_plane_accounting"
            }
          ],
          nextAction: "continue_usage_monitoring",
          execution: {
            directRuntimeMutationAllowed: false,
            subscriptionMutationRequired: false
          },
          safety: {
            noRawRuntimePayload: true,
            noSecretMaterialReturned: true
          },
          redacted: true
        };
      }
    }
  })));
  try {
    const response = await fetch(`${baseUrl}/api/admin/platform/subscription-usage-monitor/collect`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ since: "2026-06-08T00:00:00.000Z" })
    });
    assert.equal(response.status, 202);
    assert.match(response.headers.get("content-type") || "", /application\/json/);
    const body = await response.json();
    assert.equal(body.usageAccounting.type, "gccgw_runtime_usage_accounting_report");
    assert.equal(body.usageAccounting.ok, true);
    assert.equal(body.usageAccounting.recordedCount, 1);
    assert.equal(receivedInput.since, "2026-06-08T00:00:00.000Z");
    assert.doesNotMatch(JSON.stringify(body), /password|token|subscriptionUrl|rawConfig/i);
  } finally {
    server.close();
  }
});

test("admin subscription usage monitor collect route fails closed when runtime accounting is disabled", async () => {
  const { server, baseUrl } = await listen(createApp(fakeState({ controlStore: {} })));
  try {
    const response = await fetch(`${baseUrl}/api/admin/platform/subscription-usage-monitor/collect`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({})
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, "validation_error");
    assert.match(body.message, /usage accounting/i);
  } finally {
    server.close();
  }
});

test("admin subscription usage monitor shows all issued channels for multi-channel orders before usage is collected", async () => {
  await withStore(async (controlStore) => {
    seedDeliveredOrder(controlStore, {
      accountId: "acct_usage_monitor_multichannel",
      portalUserRef: "portal_user_usage_monitor_multichannel",
      requestId: "pareq_usage_monitor_multichannel",
      entitlementId: "ent_usage_monitor_multichannel",
      tenantRef: "tenant_usage_monitor_multichannel",
      artifactRef: "artifact_usage_monitor_multichannel",
      edgeCredentialRef: "edgecred_pareq_usage_monitor_multichannel_channel-vultr-a-vless-reality-tcp",
      channelRef: "channel-vultr-a-vless-reality-tcp",
      edgeCredentials: [
        {
          edgeChannelRef: "channel-vultr-a-vless-reality-tcp",
          edgeCredentialRef: "edgecred_pareq_usage_monitor_multichannel_channel-vultr-a-vless-reality-tcp",
          edgeMaterialDigest: "sha256:digest_multichannel_vless"
        },
        {
          edgeChannelRef: "channel-vultr-a-hy2",
          edgeCredentialRef: "edgecred_pareq_usage_monitor_multichannel_channel-vultr-a-hy2",
          edgeMaterialDigest: "sha256:digest_multichannel_hy2"
        },
        {
          edgeChannelRef: "channel-sgp-a-hy2",
          edgeCredentialRef: "edgecred_pareq_usage_monitor_multichannel_channel-sgp-a-hy2",
          edgeMaterialDigest: "sha256:digest_multichannel_sgp_hy2"
        }
      ],
      trafficLimitBytes: 1000
    });

    const { server, baseUrl } = await listen(createApp(fakeState({
      controlStore,
      portalAccessRequests: { listRequests: () => [] }
    })));
    try {
      const response = await fetch(`${baseUrl}/api/admin/platform/subscription-usage-monitor`, {
        headers: authHeaders()
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.monitor.items.length, 1);
      assert.deepEqual(body.monitor.items[0].issuedChannels, [
        "channel-vultr-a-vless-reality-tcp",
        "channel-vultr-a-hy2",
        "channel-sgp-a-hy2"
      ]);
      assert.equal(body.monitor.items[0].usageStatus, "not_collected");
      assert.equal(body.monitor.items[0].collectionStatus, "collector_disabled");
      assert.deepEqual(body.monitor.items[0].channelUsages, []);
      assert.deepEqual(body.monitor.items[0].edgeCredentialBindings, [
        {
          channelRef: "channel-vultr-a-vless-reality-tcp",
          credentialRefPresent: true,
          materialDigestPresent: true,
          usageMeasured: false
        },
        {
          channelRef: "channel-vultr-a-hy2",
          credentialRefPresent: true,
          materialDigestPresent: true,
          usageMeasured: false
        },
        {
          channelRef: "channel-sgp-a-hy2",
          credentialRefPresent: true,
          materialDigestPresent: true,
          usageMeasured: false
        }
      ]);
      assert.deepEqual(body.monitor.aggregates.byNode, {
        "channel-sgp-a-hy2": 1,
        "channel-vultr-a-hy2": 1,
        "channel-vultr-a-vless-reality-tcp": 1
      });

      const filtered = await fetch(
        `${baseUrl}/api/admin/platform/subscription-usage-monitor?nodeId=channel-sgp-a-hy2`,
        { headers: authHeaders() }
      );
      assert.equal(filtered.status, 200);
      const filteredBody = await filtered.json();
      assert.equal(filteredBody.monitor.items.length, 1);
      assert.equal(filteredBody.monitor.items[0].issuanceRequestId, "pareq_usage_monitor_multichannel");
      assert.doesNotMatch(JSON.stringify(filteredBody.monitor), /edgecred_|https?:\/\/|password|token=|bearer|rawConfig/i);
    } finally {
      server.close();
    }
  });
});
