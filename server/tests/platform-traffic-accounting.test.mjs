import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createTrafficAccountingService } from "../services/platform/traffic-accounting.mjs";

function withStore(fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "platform-traffic-accounting-"));
  let store;
  try {
    store = createSqliteSubscriptionControlStore({
      dbPath: join(tempDir, "control.sqlite")
    });
    seedIssuedOrder(store);
    return fn(store);
  } finally {
    store?.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

function seedIssuedOrder(store) {
  const now = "2026-06-06T00:00:00.000Z";
  store.createAccount({
    id: "acct_usage_service_1",
    ownerRef: "portal_user_usage_service_1",
    status: "active",
    createdAt: now,
    updatedAt: now
  });
  store.createEntitlement({
    id: "ent_usage_service_1",
    accountId: "acct_usage_service_1",
    plan: "monthly",
    status: "active",
    validFrom: now,
    validUntil: "2026-07-06T00:00:00.000Z",
    trafficLimitBytes: 1000,
    createdAt: now,
    updatedAt: now
  });
  store.createIssuanceRequest({
    id: "pareq_usage_service_1",
    accountId: "acct_usage_service_1",
    entitlementId: "ent_usage_service_1",
    approvalRef: "approval_usage_service_1",
    status: "issued",
    quantity: 1,
    nodeId: "channel-aliyun-a-tuic",
    purpose: "portal_auto_issuance",
    requestedByRef: "portal_auto_issuer",
    createdAt: now,
    updatedAt: now
  });
  store.linkIssuedSubscription({
    id: "link_usage_service_1",
    requestId: "pareq_usage_service_1",
    tenantRef: "tenant_usage_service_1",
    artifactRef: "artifact_usage_service_1",
    status: "active",
    createdAt: now,
    updatedAt: now
  });
  store.upsertPortalAccessRequest({
    id: "pareq_usage_service_1",
    portalUserRef: "portal_user_usage_service_1",
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
    entitlementRef: "ent_usage_service_1",
    accessGrantRef: "grant_usage_service_1",
    tenantId: "tenant_usage_service_1",
    artifactId: "artifact_usage_service_1",
    subscriptionUrl: "https://sub.example.test/sub/a/visible-once.yaml",
    edgeChannelRef: "channel-aliyun-a-tuic",
    edgeCredentialRef: "edgecred_pareq_usage_service_1",
    edgeMaterialDigest: "sha256:digest_usage_service_1"
  });
}

test("traffic accounting records usage by edge credential and returns quota decisions", () => {
  withStore((store) => {
    let sequence = 0;
    const service = createTrafficAccountingService({
      controlStore: store,
      nowFn: () => "2026-06-06T00:10:00.000Z",
      usageSampleRefFactory: () => `usage_sample_service_${++sequence}`
    });

    const first = service.recordUsageObservation({
      sourceRef: "mihomo_snapshot_service_1",
      channelRef: "channel-aliyun-a-tuic",
      edgeCredentialRef: "edgecred_pareq_usage_service_1",
      observedAt: "2026-06-06T00:05:00.000Z",
      intervalStartedAt: "2026-06-06T00:00:00.000Z",
      intervalEndedAt: "2026-06-06T00:05:00.000Z",
      uploadBytes: 300,
      downloadBytes: 400
    });
    assert.equal(first.status, "within_quota");
    assert.equal(first.sampleInserted, true);
    assert.equal(first.rollup.totalBytes, 700);
    assert.equal(first.quota.trafficLimitBytes, 1000);
    assert.equal(first.execution.directRuntimeMutationAllowed, false);

    const duplicate = service.recordUsageObservation({
      sourceRef: "mihomo_snapshot_service_1",
      channelRef: "channel-aliyun-a-tuic",
      edgeCredentialRef: "edgecred_pareq_usage_service_1",
      observedAt: "2026-06-06T00:05:00.000Z",
      intervalStartedAt: "2026-06-06T00:00:00.000Z",
      intervalEndedAt: "2026-06-06T00:05:00.000Z",
      uploadBytes: 300,
      downloadBytes: 400
    });
    assert.equal(duplicate.status, "within_quota");
    assert.equal(duplicate.sampleInserted, false);
    assert.equal(duplicate.rollup.totalBytes, 700);

    const over = service.recordUsageObservation({
      sourceRef: "mihomo_snapshot_service_2",
      channelRef: "channel-aliyun-a-tuic",
      edgeCredentialRef: "edgecred_pareq_usage_service_1",
      observedAt: "2026-06-06T00:10:00.000Z",
      intervalStartedAt: "2026-06-06T00:05:00.000Z",
      intervalEndedAt: "2026-06-06T00:10:00.000Z",
      uploadBytes: 150,
      downloadBytes: 150
    });
    assert.equal(over.status, "over_quota_disable_required");
    assert.equal(over.rollup.totalBytes, 1000);
    assert.equal(over.portalUserRef, "portal_user_usage_service_1");
    assert.equal(over.nextAction, "disable_or_revoke_through_controlled_gate");
    assert.equal(over.execution.directRuntimeMutationAllowed, false);

    const serialized = JSON.stringify({ first, duplicate, over });
    assert.doesNotMatch(serialized, /password|token|subscriptionUrl|rawConfig/i);
  });
});

test("traffic accounting fails closed when an edge credential cannot be resolved", () => {
  withStore((store) => {
    const service = createTrafficAccountingService({
      controlStore: store,
      nowFn: () => "2026-06-06T00:10:00.000Z",
      usageSampleRefFactory: () => "usage_sample_unresolved"
    });

    const result = service.recordUsageObservation({
      sourceRef: "mihomo_snapshot_missing",
      channelRef: "channel-aliyun-a-tuic",
      edgeCredentialRef: "edgecred_missing",
      observedAt: "2026-06-06T00:05:00.000Z",
      intervalStartedAt: "2026-06-06T00:00:00.000Z",
      intervalEndedAt: "2026-06-06T00:05:00.000Z",
      uploadBytes: 1,
      downloadBytes: 1
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "unresolved_binding");
    assert.equal(result.sampleInserted, false);
    assert.equal(store.listUsageSamples({ edgeCredentialRef: "edgecred_missing" }).length, 0);
    assert.equal(result.execution.directRuntimeMutationAllowed, false);
  });
});
