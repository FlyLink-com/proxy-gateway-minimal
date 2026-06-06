import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createHysteria2UsageCollector } from "../services/edge/hysteria2-usage-collector.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createTrafficAccountingService } from "../services/platform/traffic-accounting.mjs";

async function withStore(fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "hysteria2-usage-collector-"));
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
    id: "acct_hy2_1",
    ownerRef: "portal_user_hy2_1",
    status: "active",
    createdAt: now,
    updatedAt: now
  });
  store.createEntitlement({
    id: "ent_hy2_1",
    accountId: "acct_hy2_1",
    plan: "monthly",
    status: "active",
    validFrom: now,
    validUntil: "2026-07-06T00:00:00.000Z",
    trafficLimitBytes: 1000,
    createdAt: now,
    updatedAt: now
  });
  store.createIssuanceRequest({
    id: "pareq_hy2_1",
    accountId: "acct_hy2_1",
    entitlementId: "ent_hy2_1",
    approvalRef: "approval_hy2_1",
    status: "issued",
    quantity: 1,
    nodeId: "channel-aws-staging-hy2",
    purpose: "portal_auto_issuance",
    requestedByRef: "portal_auto_issuer",
    createdAt: now,
    updatedAt: now
  });
  store.linkIssuedSubscription({
    id: "link_hy2_1",
    requestId: "pareq_hy2_1",
    tenantRef: "tenant_hy2_1",
    artifactRef: "artifact_hy2_1",
    status: "active",
    createdAt: now,
    updatedAt: now
  });
  store.upsertPortalAccessRequest({
    id: "pareq_hy2_1",
    portalUserRef: "portal_user_hy2_1",
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
    entitlementRef: "ent_hy2_1",
    accessGrantRef: "grant_hy2_1",
    tenantId: "tenant_hy2_1",
    artifactId: "artifact_hy2_1",
    edgeChannelRef: "channel-aws-staging-hy2",
    edgeCredentialRef: "edgecred_hy2_1",
    edgeMaterialDigest: "sha256:digest_hy2_1"
  });
}

test("Hysteria2 usage collector converts clear-mode client stats into safe observations", async () => {
  const calls = [];
  const collector = createHysteria2UsageCollector({
    channelRef: "channel-aws-staging-hy2",
    trafficReader: async (input) => {
      calls.push(input);
      return {
        edgecred_hy2_1: { tx: 514, rx: 4017 },
        edgecred_hy2_2: { tx: "10", rx: "20" }
      };
    },
    nowFn: () => "2026-06-06T00:05:00.000Z"
  });

  const result = await collector.collect({
    since: "2026-06-06T00:00:00.000Z"
  });

  assert.deepEqual(calls, [
    {
      channelRef: "channel-aws-staging-hy2",
      clear: true
    }
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.status, "collected");
  assert.equal(result.accountingMode, "delta");
  assert.deepEqual(result.observations, [
    {
      sourceRef: "hysteria2_traffic_stats",
      channelRef: "channel-aws-staging-hy2",
      edgeCredentialRef: "edgecred_hy2_1",
      observedAt: "2026-06-06T00:05:00.000Z",
      intervalStartedAt: "2026-06-06T00:00:00.000Z",
      intervalEndedAt: "2026-06-06T00:05:00.000Z",
      uploadBytes: 514,
      downloadBytes: 4017
    },
    {
      sourceRef: "hysteria2_traffic_stats",
      channelRef: "channel-aws-staging-hy2",
      edgeCredentialRef: "edgecred_hy2_2",
      observedAt: "2026-06-06T00:05:00.000Z",
      intervalStartedAt: "2026-06-06T00:00:00.000Z",
      intervalEndedAt: "2026-06-06T00:05:00.000Z",
      uploadBytes: 10,
      downloadBytes: 20
    }
  ]);
  assert.equal(result.safety.noRawRuntimePayload, true);
  assert.equal(result.safety.noSecretMaterialReturned, true);
});

test("Hysteria2 usage collector rejects client IDs that cannot be edge credential refs", async () => {
  const collector = createHysteria2UsageCollector({
    channelRef: "channel-aws-staging-hy2",
    trafficReader: async () => ({
      "raw user name": { tx: 1, rx: 2 }
    }),
    nowFn: () => "2026-06-06T00:05:00.000Z"
  });

  const result = await collector.collect();

  assert.equal(result.ok, false);
  assert.equal(result.status, "validation_error");
  assert.deepEqual(result.observations, []);
  assert.equal(result.blockers[0].code, "validation_error");
  assert.doesNotMatch(JSON.stringify(result), /raw user name/);
});

test("Hysteria2 usage collector observations can be recorded by traffic accounting", async () => {
  await withStore(async (store) => {
    const collector = createHysteria2UsageCollector({
      channelRef: "channel-aws-staging-hy2",
      trafficReader: async () => ({
        edgecred_hy2_1: { tx: 200, rx: 300 }
      }),
      nowFn: () => "2026-06-06T00:05:00.000Z"
    });
    const accounting = createTrafficAccountingService({
      controlStore: store,
      nowFn: () => "2026-06-06T00:10:00.000Z",
      usageSampleRefFactory: () => "usage_sample_hy2_1"
    });

    const collected = await collector.collect({
      since: "2026-06-06T00:00:00.000Z"
    });
    const recorded = accounting.recordUsageObservation(collected.observations[0]);

    assert.equal(collected.ok, true);
    assert.equal(recorded.ok, true);
    assert.equal(recorded.status, "within_quota");
    assert.equal(recorded.rollup.totalBytes, 500);
    assert.equal(recorded.quota.trafficLimitBytes, 1000);
    assert.equal(recorded.execution.directRuntimeMutationAllowed, false);
  });
});
