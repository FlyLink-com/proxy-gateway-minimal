import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createMihomoTuicUsageCollector } from "../services/edge/mihomo-tuic-usage-collector.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createTrafficAccountingService } from "../services/platform/traffic-accounting.mjs";

async function withStore(fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "mihomo-tuic-usage-collector-"));
  let store;
  try {
    store = createSqliteSubscriptionControlStore({
      dbPath: join(tempDir, "control.sqlite")
    });
    seedIssuedOrder(store);
    return await fn(store);
  } finally {
    store?.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

function seedIssuedOrder(store) {
  const now = "2026-06-06T00:00:00.000Z";
  store.createAccount({
    id: "acct_collector_1",
    ownerRef: "portal_user_collector_1",
    status: "active",
    createdAt: now,
    updatedAt: now
  });
  store.createEntitlement({
    id: "ent_collector_1",
    accountId: "acct_collector_1",
    plan: "monthly",
    status: "active",
    validFrom: now,
    validUntil: "2026-07-06T00:00:00.000Z",
    trafficLimitBytes: 1000,
    createdAt: now,
    updatedAt: now
  });
  store.createIssuanceRequest({
    id: "pareq_collector_1",
    accountId: "acct_collector_1",
    entitlementId: "ent_collector_1",
    approvalRef: "approval_collector_1",
    status: "issued",
    quantity: 1,
    nodeId: "channel-aliyun-a-tuic",
    purpose: "portal_auto_issuance",
    requestedByRef: "portal_auto_issuer",
    createdAt: now,
    updatedAt: now
  });
  store.linkIssuedSubscription({
    id: "link_collector_1",
    requestId: "pareq_collector_1",
    tenantRef: "tenant_collector_1",
    artifactRef: "artifact_collector_1",
    status: "active",
    createdAt: now,
    updatedAt: now
  });
  store.upsertPortalAccessRequest({
    id: "pareq_collector_1",
    portalUserRef: "portal_user_collector_1",
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
    expiresAt: "2026-07-06T00:00:00.000Z",
    validUntil: "2026-07-06T00:00:00.000Z",
    entitlementRef: "ent_collector_1",
    accessGrantRef: "grant_collector_1",
    tenantId: "tenant_collector_1",
    artifactId: "artifact_collector_1",
    edgeChannelRef: "channel-aliyun-a-tuic",
    edgeCredentialRef: "edgecred_collector_1",
    edgeMaterialDigest: "sha256:digest_collector_1"
  });
}

test("Mihomo TUIC usage collector converts per-credential snapshots into safe observations", async () => {
  const collector = createMihomoTuicUsageCollector({
    channelRef: "channel-aliyun-a-tuic",
    snapshotReader: async () => ({
      sourceRef: "mihomo_usage_snapshot_001",
      observedAt: "2026-06-06T00:05:00.000Z",
      intervalStartedAt: "2026-06-06T00:00:00.000Z",
      intervalEndedAt: "2026-06-06T00:05:00.000Z",
      entries: [
        {
          edgeCredentialRef: "edgecred_order_001",
          uploadBytes: 128,
          downloadBytes: 256,
          uuid: "11111111-1111-4111-8111-111111111111",
          password: "synthetic-runtime-password"
        }
      ],
      rawConfig: "must not be returned"
    })
  });

  const result = await collector.collect();

  assert.equal(result.ok, true);
  assert.equal(result.status, "collected");
  assert.deepEqual(result.observations, [
    {
      accountingMode: "cumulative",
      sourceRef: "mihomo_usage_snapshot_001",
      channelRef: "channel-aliyun-a-tuic",
      edgeCredentialRef: "edgecred_order_001",
      observedAt: "2026-06-06T00:05:00.000Z",
      intervalStartedAt: "2026-06-06T00:00:00.000Z",
      intervalEndedAt: "2026-06-06T00:05:00.000Z",
      uploadBytes: 128,
      downloadBytes: 256
    }
  ]);
  assert.equal(result.safety.noRawRuntimePayload, true);
  assert.equal(result.safety.noSecretMaterialReturned, true);
  assert.doesNotMatch(JSON.stringify(result), /11111111-1111-4111-8111-111111111111|synthetic-runtime-password|rawConfig/);
});

test("Mihomo TUIC usage collector fails closed for node aggregate snapshots", async () => {
  const collector = createMihomoTuicUsageCollector({
    channelRef: "channel-aliyun-a-tuic",
    snapshotReader: async () => ({
      sourceRef: "mihomo_usage_snapshot_aggregate",
      observedAt: "2026-06-06T00:05:00.000Z",
      intervalStartedAt: "2026-06-06T00:00:00.000Z",
      intervalEndedAt: "2026-06-06T00:05:00.000Z",
      aggregate: {
        uploadBytes: 1024,
        downloadBytes: 2048
      }
    })
  });

  const result = await collector.collect();

  assert.equal(result.ok, false);
  assert.equal(result.status, "collector_not_supported");
  assert.deepEqual(result.observations, []);
  assert.equal(result.blockers[0].code, "node_aggregate_only");
  assert.equal(result.nextAction, "prove_runtime_can_emit_edge_credential_usage_before_quota_enforcement");
});

test("Mihomo TUIC usage collector observations can be recorded by traffic accounting", async () => {
  await withStore(async (store) => {
    let readCount = 0;
    const collector = createMihomoTuicUsageCollector({
      channelRef: "channel-aliyun-a-tuic",
      snapshotReader: async () => {
        readCount += 1;
        return {
          sourceRef: "mihomo_usage_snapshot_ledger_001",
          observedAt: readCount === 1
            ? "2026-06-06T00:05:00.000Z"
            : "2026-06-06T00:10:00.000Z",
          intervalStartedAt: "2026-06-06T00:00:00.000Z",
          intervalEndedAt: readCount === 1
            ? "2026-06-06T00:05:00.000Z"
            : "2026-06-06T00:10:00.000Z",
          entries: [
            {
              edgeCredentialRef: "edgecred_collector_1",
              uploadBytes: readCount === 1 ? 200 : 250,
              downloadBytes: readCount === 1 ? 300 : 360
            }
          ]
        };
      }
    });
    const accounting = createTrafficAccountingService({
      controlStore: store,
      nowFn: () => "2026-06-06T00:10:00.000Z",
      usageSampleRefFactory: () => "usage_sample_collector_1"
    });

    const initialized = await collector.collect();
    const initializedRecord = accounting.recordUsageObservation(initialized.observations[0]);
    const collected = await collector.collect();
    const recorded = accounting.recordUsageObservation(collected.observations[0]);

    assert.equal(initializedRecord.sampleInserted, false);
    assert.equal(initializedRecord.accountingStatus, "cursor_initialized");
    assert.equal(collected.ok, true);
    assert.equal(collected.observations[0].accountingMode, "cumulative");
    assert.equal(recorded.ok, true);
    assert.equal(recorded.status, "within_quota");
    assert.equal(recorded.rollup.totalBytes, 110);
    assert.equal(recorded.quota.trafficLimitBytes, 1000);
    assert.equal(recorded.execution.directRuntimeMutationAllowed, false);
  });
});
