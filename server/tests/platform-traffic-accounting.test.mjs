import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createTrafficAccountingService } from "../services/platform/traffic-accounting.mjs";
import { runTrafficUsageRecoveryPreflight } from "../../scripts/lib/traffic-usage-recovery-preflight.mjs";

function withStore(fn, seedOverrides = {}) {
  const tempDir = mkdtempSync(join(tmpdir(), "platform-traffic-accounting-"));
  let store;
  try {
    store = createSqliteSubscriptionControlStore({
      dbPath: join(tempDir, "control.sqlite")
    });
    seedIssuedOrder(store, seedOverrides);
    return fn(store);
  } finally {
    store?.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

function seedIssuedOrder(store, overrides = {}) {
  const now = overrides.now || "2026-06-06T00:00:00.000Z";
  const validUntil = overrides.validUntil || "2026-07-06T00:00:00.000Z";
  const plan = overrides.plan || "monthly";
  const durationDays = overrides.durationDays ?? (plan === "yearly" ? 365 : 30);
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
    plan,
    status: "active",
    validFrom: now,
    validUntil,
    trafficLimitBytes: overrides.trafficLimitBytes ?? 1000,
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
    plan,
    clientTarget: "clash",
    durationDays,
    quantity: 1,
    status: "delivered",
    nextAction: "user_can_use_access",
    noteProvided: false,
    priorTrialState: "not_applicable",
    submittedAt: now,
    updatedAt: now,
    reviewedAt: now,
    reviewedByRef: "portal_auto_issuer",
    expiresAt: validUntil,
    validUntil,
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

function cumulativeObservation(overrides = {}) {
  return {
    accountingMode: "cumulative",
    sourceRef: "xray_statsquery_user_traffic",
    channelRef: "channel-aliyun-a-tuic",
    edgeCredentialRef: "edgecred_pareq_usage_service_1",
    observedAt: "2026-06-06T00:05:00.000Z",
    intervalStartedAt: "2026-06-06T00:00:00.000Z",
    intervalEndedAt: "2026-06-06T00:05:00.000Z",
    uploadBytes: 100,
    downloadBytes: 200,
    ...overrides
  };
}

test("recovery preflight preserves a 35-day gap whose unreviewed collection would charge the current cycle", () => {
  const directory = mkdtempSync(join(tmpdir(), "traffic-recovery-first-intake-"));
  const dbPath = join(directory, "control.sqlite");
  const statusPath = join(directory, "status.json");
  const store = createSqliteSubscriptionControlStore({ dbPath });
  const oldTime = "2026-08-01T15:38:48.000Z";
  const recoveredAt = "2026-09-05T09:00:00.000Z";
  try {
    seedIssuedOrder(store, {
      now: "2026-08-01T00:00:00.000Z", validUntil: "2027-08-01T00:00:00.000Z",
      plan: "yearly", trafficLimitBytes: 1000
    });
    const service = createTrafficAccountingService({ controlStore: store, nowFn: () => recoveredAt });
    const old = cumulativeObservation({ observedAt: oldTime, intervalStartedAt: oldTime, intervalEndedAt: oldTime });
    assert.equal(service.recordUsageObservation(old).accountingStatus, "cursor_initialized");
    const originalCursor = store.getUsageCounterCursor(old);
    writeFileSync(statusPath, JSON.stringify({
      type: "traffic_collector_admin_projection", schemaVersion: "1", availability: "available",
      observedAt: oldTime, run: { runOk: true, rawReportOk: true, collectorCount: 0, idleCollectorCount: 0 },
      accounting: { recordingOk: true, observationCount: 0, recordedCount: 0, insertedCount: 0, unresolvedCount: 0 },
      collectors: [], producers: [], omittedCollectorCount: 0, omittedProducerCount: 0
    }));
    const preflight = runTrafficUsageRecoveryPreflight({
      env: { SUBSCRIPTION_CONTROL_DB_PATH: dbPath, EDGE_USAGE_COLLECTOR_STATUS_PATH: statusPath },
      nowFn: () => new Date(recoveredAt)
    });
    assert.equal(preflight.ok, true);
    assert.equal(preflight.status, "requires_review");
    assert.equal(preflight.productionCollectionAuthorized, false);
    assert.equal(preflight.statusEvidence.stale, true);
    assert.equal(preflight.cursorEvidence.staleCount, 1);
    assert.deepEqual(store.getUsageCounterCursor(old), originalCursor);
    assert.equal(store.listUsageSamples({}).length, 0);

    // Demonstrate why read success must never authorize the preserved --collect
    // path: its existing accounting contract does not split cross-cycle deltas.
    const resumed = cumulativeObservation({
      observedAt: recoveredAt, intervalStartedAt: oldTime, intervalEndedAt: recoveredAt,
      uploadBytes: 600, downloadBytes: 800
    });
    const charged = service.recordUsageObservation(resumed);
    assert.equal(charged.quota.usedBytes, 1100);
    assert.equal(charged.status, "over_quota_disable_required");
    assert.equal(charged.lifecycleAction, "traffic_supply_suspend_required");
    assert.equal(charged.sample.intervalStartedAt, oldTime);
    assert.equal(store.listUsageSamples({ observedFrom: "2026-08-01T00:00:00.000Z", observedTo: "2026-09-01T00:00:00.000Z" }).length, 0);
    assert.equal(store.listUsageSamples({ observedFrom: "2026-09-01T00:00:00.000Z", observedTo: "2026-10-01T00:00:00.000Z" })[0].totalBytes, 1100);
    assert.equal(service.recordUsageObservation(resumed).sampleInserted, false);
    assert.equal(store.listUsageSamples({}).length, 1);

    const reset = service.recordUsageObservation({
      ...resumed, observedAt: "2026-09-05T09:05:00.000Z", intervalEndedAt: "2026-09-05T09:05:00.000Z",
      uploadBytes: 1, downloadBytes: 2
    });
    assert.equal(reset.accountingStatus, "counter_reset_detected");
    assert.equal(reset.sampleInserted, false);
    assert.equal(reset.quota.usedBytes, 1100);
    assert.equal(store.getUsageCounterCursor(old).epoch, 1);
    assert.equal(store.listUsageSamples({}).length, 1);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test("traffic accounting resets quota decisions at entitlement monthly cycle boundary", () => {
  withStore((store) => {
    let sequence = 0;
    const service = createTrafficAccountingService({
      controlStore: store,
      nowFn: () => "2026-08-07T00:10:00.000Z",
      usageSampleRefFactory: () => `usage_sample_yearly_cycle_${++sequence}`
    });

    const previousCycle = service.recordUsageObservation({
      sourceRef: "mihomo_snapshot_yearly_cycle_1",
      channelRef: "channel-aliyun-a-tuic",
      edgeCredentialRef: "edgecred_pareq_usage_service_1",
      observedAt: "2026-07-10T00:05:00.000Z",
      intervalStartedAt: "2026-07-10T00:00:00.000Z",
      intervalEndedAt: "2026-07-10T00:05:00.000Z",
      uploadBytes: 400,
      downloadBytes: 500
    });
    assert.equal(previousCycle.status, "within_quota");
    assert.equal(previousCycle.quota.usedBytes, 900);

    const currentCycle = service.recordUsageObservation({
      sourceRef: "mihomo_snapshot_yearly_cycle_2",
      channelRef: "channel-aliyun-a-tuic",
      edgeCredentialRef: "edgecred_pareq_usage_service_1",
      observedAt: "2026-08-07T00:05:00.000Z",
      intervalStartedAt: "2026-08-07T00:00:00.000Z",
      intervalEndedAt: "2026-08-07T00:05:00.000Z",
      uploadBytes: 90,
      downloadBytes: 110
    });

    assert.equal(currentCycle.status, "within_quota");
    assert.equal(currentCycle.rollup.totalBytes, 1100);
    assert.equal(currentCycle.quota.usedBytes, 200);
    assert.equal(currentCycle.quota.trafficLimitBytes, 1000);
    assert.doesNotMatch(JSON.stringify(currentCycle), /password|token|subscriptionUrl|rawConfig/i);
  }, {
    now: "2026-07-06T00:00:00.000Z",
    plan: "yearly",
    durationDays: 365,
    validUntil: "2027-07-06T00:00:00.000Z",
    trafficLimitBytes: 1000
  });
});

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
    assert.equal(over.nextAction, "suspend_traffic_supply_through_controlled_gate");
    assert.equal(over.lifecycleAction, "traffic_supply_suspend_required");
    assert.deepEqual(over.trafficSupply, {
      status: "suspend_required",
      scope: "order_resource",
      reason: "quota_exhausted",
      accountMutationRequired: false
    });
    assert.equal(over.execution.directRuntimeMutationAllowed, false);
    assert.equal(over.execution.trafficSupplyMutationRequired, true);
    assert.equal(over.execution.accountMutationRequired, false);

    const serialized = JSON.stringify({ first, duplicate, over });
    assert.doesNotMatch(serialized, /password|token|subscriptionUrl|rawConfig/i);
  });
});

test("traffic accounting converts cumulative counters into durable deltas without double counting", () => {
  withStore((store) => {
    const service = createTrafficAccountingService({
      controlStore: store,
      nowFn: () => "2026-06-06T00:20:00.000Z"
    });
    const base = {
      accountingMode: "cumulative",
      sourceRef: "xray_statsquery_user_traffic",
      channelRef: "channel-aliyun-a-tuic",
      edgeCredentialRef: "edgecred_pareq_usage_service_1",
      intervalStartedAt: "2026-06-06T00:00:00.000Z"
    };

    const initialized = service.recordUsageObservation({
      ...base,
      observedAt: "2026-06-06T00:05:00.000Z",
      intervalEndedAt: "2026-06-06T00:05:00.000Z",
      uploadBytes: 100,
      downloadBytes: 200
    });
    assert.equal(initialized.accountingStatus, "cursor_initialized");
    assert.equal(initialized.sampleInserted, false);
    assert.equal(initialized.quota.usedBytes, 0);

    const unchanged = service.recordUsageObservation({
      ...base,
      observedAt: "2026-06-06T00:10:00.000Z",
      intervalEndedAt: "2026-06-06T00:10:00.000Z",
      uploadBytes: 100,
      downloadBytes: 200
    });
    assert.equal(unchanged.accountingStatus, "no_delta");
    assert.equal(unchanged.sampleInserted, false);
    assert.equal(unchanged.quota.usedBytes, 0);

    const increased = service.recordUsageObservation({
      ...base,
      observedAt: "2026-06-06T00:15:00.000Z",
      intervalEndedAt: "2026-06-06T00:15:00.000Z",
      uploadBytes: 150,
      downloadBytes: 260
    });
    assert.equal(increased.accountingStatus, "calculated");
    assert.equal(increased.sampleInserted, true);
    assert.equal(increased.quota.usedBytes, 110);

    const stale = service.recordUsageObservation({
      ...base,
      observedAt: "2026-06-06T00:12:00.000Z",
      intervalEndedAt: "2026-06-06T00:12:00.000Z",
      uploadBytes: 999,
      downloadBytes: 999
    });
    assert.equal(stale.accountingStatus, "stale_observation");
    assert.equal(stale.sampleInserted, false);
    assert.equal(stale.quota.usedBytes, 110);

    const replayedCheckpoint = service.recordUsageObservation({
      ...base,
      observedAt: "2026-06-06T00:20:00.000Z",
      intervalEndedAt: "2026-06-06T00:20:00.000Z",
      uploadBytes: 150,
      downloadBytes: 260
    });
    assert.equal(replayedCheckpoint.accountingStatus, "no_delta");
    assert.equal(replayedCheckpoint.sampleInserted, false);
    assert.equal(replayedCheckpoint.quota.usedBytes, 110);

    const samples = store.listUsageSamples({
      edgeCredentialRef: "edgecred_pareq_usage_service_1"
    });
    assert.equal(samples.length, 1);
    assert.equal(samples[0].uploadBytes, 50);
    assert.equal(samples[0].downloadBytes, 60);

    const reset = service.recordUsageObservation({
      ...base,
      observedAt: "2026-06-06T00:25:00.000Z",
      intervalEndedAt: "2026-06-06T00:25:00.000Z",
      uploadBytes: 10,
      downloadBytes: 20
    });
    assert.equal(reset.accountingStatus, "counter_reset_detected");
    assert.equal(reset.sampleInserted, false);
    assert.equal(reset.quota.usedBytes, 110);

    const afterReset = service.recordUsageObservation({
      ...base,
      observedAt: "2026-06-06T00:30:00.000Z",
      intervalEndedAt: "2026-06-06T00:30:00.000Z",
      uploadBytes: 15,
      downloadBytes: 30
    });
    assert.equal(afterReset.accountingStatus, "calculated");
    assert.equal(afterReset.sampleInserted, true);
    assert.equal(afterReset.quota.usedBytes, 125);
    assert.equal(store.getUsageCounterCursor(base).epoch, 1);
  });
});

test("traffic accounting preserves cumulative cursors across control-store restarts", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "platform-traffic-cursor-restart-"));
  const dbPath = join(tempDir, "control.sqlite");
  let store;
  try {
    store = createSqliteSubscriptionControlStore({ dbPath });
    seedIssuedOrder(store);
    createTrafficAccountingService({ controlStore: store }).recordUsageObservation(
      cumulativeObservation()
    );
    store.close();

    store = createSqliteSubscriptionControlStore({ dbPath });
    const recorded = createTrafficAccountingService({ controlStore: store }).recordUsageObservation(
      cumulativeObservation({
        observedAt: "2026-06-06T00:10:00.000Z",
        intervalEndedAt: "2026-06-06T00:10:00.000Z",
        uploadBytes: 150,
        downloadBytes: 260
      })
    );

    assert.equal(recorded.accountingStatus, "calculated");
    assert.equal(recorded.quota.usedBytes, 110);
  } finally {
    store?.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test("traffic accounting rolls back a cumulative sample when cursor advancement fails", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "platform-traffic-cursor-atomic-"));
  const database = new Database(join(tempDir, "control.sqlite"));
  const store = createSqliteSubscriptionControlStore({ database });
  try {
    seedIssuedOrder(store);
    const service = createTrafficAccountingService({ controlStore: store });
    service.recordUsageObservation(cumulativeObservation());
    database.exec(`
      create trigger fail_usage_cursor_update
      before update on platform_usage_counter_cursors
      begin
        select raise(abort, 'forced_cursor_update_failure');
      end;
    `);

    assert.throws(() => service.recordUsageObservation(cumulativeObservation({
      observedAt: "2026-06-06T00:10:00.000Z",
      intervalEndedAt: "2026-06-06T00:10:00.000Z",
      uploadBytes: 150,
      downloadBytes: 260
    })), { code: "constraint_error" });
    assert.equal(store.listUsageSamples({
      edgeCredentialRef: "edgecred_pareq_usage_service_1"
    }).length, 0);
    assert.equal(store.getUsageRollupByEdgeCredentialRef("edgecred_pareq_usage_service_1"), null);
    assert.equal(store.getUsageCounterCursor(cumulativeObservation()).uploadBytes, 100);

    database.exec("drop trigger fail_usage_cursor_update");
    const retried = service.recordUsageObservation(cumulativeObservation({
      observedAt: "2026-06-06T00:10:00.000Z",
      intervalEndedAt: "2026-06-06T00:10:00.000Z",
      uploadBytes: 150,
      downloadBytes: 260
    }));
    assert.equal(retried.accountingStatus, "calculated");
    assert.equal(retried.quota.usedBytes, 110);
  } finally {
    store.close();
    database.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test("traffic accounting maps derived multi-channel edge credentials to the issued order", () => {
  withStore((store) => {
    const service = createTrafficAccountingService({
      controlStore: store,
      nowFn: () => "2026-06-06T00:10:00.000Z",
      usageSampleRefFactory: () => "usage_sample_service_hy2"
    });

    const recorded = service.recordUsageObservation({
      sourceRef: "hy2_stats_snapshot_1",
      channelRef: "channel-vultr-a-hy2",
      edgeCredentialRef: "edgecred_pareq_usage_service_1_channel-vultr-a-hy2",
      observedAt: "2026-06-06T00:05:00.000Z",
      intervalStartedAt: "2026-06-06T00:00:00.000Z",
      intervalEndedAt: "2026-06-06T00:05:00.000Z",
      uploadBytes: 10,
      downloadBytes: 20
    });

    assert.equal(recorded.ok, true);
    assert.equal(recorded.status, "within_quota");
    assert.equal(recorded.requestId, "pareq_usage_service_1");
    assert.equal(recorded.channelRef, "channel-vultr-a-hy2");
    assert.equal(recorded.edgeCredentialRef, "edgecred_pareq_usage_service_1_channel-vultr-a-hy2");
    assert.equal(recorded.rollup.totalBytes, 30);
    assert.doesNotMatch(JSON.stringify(recorded), /password|token|subscriptionUrl|rawConfig/i);
  });
});

test("traffic accounting rejects derived channel credentials when explicit order credentials exist", () => {
  withStore((store) => {
    const existing = store.getPortalAccessRequest("pareq_usage_service_1");
    store.upsertPortalAccessRequest({
      ...existing,
      edgeCredentials: [
        {
          edgeChannelRef: "channel-vultr-a-hy2",
          edgeCredentialRef: "edgecred_pareq_usage_service_1_channel-vultr-a-hy2",
          edgeMaterialDigest: "sha256:digest_usage_service_hy2"
        }
      ]
    });
    const service = createTrafficAccountingService({
      controlStore: store,
      nowFn: () => "2026-06-06T00:10:00.000Z",
      usageSampleRefFactory: () => "usage_sample_service_unissued_channel"
    });

    const result = service.recordUsageObservation({
      sourceRef: "hy2_stats_snapshot_unissued_channel",
      channelRef: "channel-sgp-a-hy2",
      edgeCredentialRef: "edgecred_pareq_usage_service_1_channel-sgp-a-hy2",
      observedAt: "2026-06-06T00:05:00.000Z",
      intervalStartedAt: "2026-06-06T00:00:00.000Z",
      intervalEndedAt: "2026-06-06T00:05:00.000Z",
      uploadBytes: 10,
      downloadBytes: 20
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "unresolved_binding");
    assert.equal(result.unresolvedReason, "binding_missing");
    assert.equal(result.sampleInserted, false);
    assert.equal(store.listUsageSamples({ edgeCredentialRef: "edgecred_pareq_usage_service_1_channel-sgp-a-hy2" }).length, 0);
    assert.equal(result.execution.directRuntimeMutationAllowed, false);
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
    assert.equal(result.unresolvedReason, "binding_missing");
    assert.deepEqual(result.blockers, [{ code: "credential_binding_missing" }]);
    assert.equal(result.sampleInserted, false);
    assert.equal(store.listUsageSamples({ edgeCredentialRef: "edgecred_missing" }).length, 0);
    assert.equal(result.execution.directRuntimeMutationAllowed, false);
  });
});

test("traffic accounting distinguishes a channel mismatch without recording usage", () => {
  withStore((store) => {
    const service = createTrafficAccountingService({
      controlStore: store,
      nowFn: () => "2026-06-06T00:10:00.000Z",
      usageSampleRefFactory: () => "usage_sample_channel_mismatch"
    });

    const result = service.recordUsageObservation({
      sourceRef: "mihomo_snapshot_channel_mismatch",
      channelRef: "channel-vultr-a-tuic",
      edgeCredentialRef: "edgecred_pareq_usage_service_1",
      observedAt: "2026-06-06T00:05:00.000Z",
      intervalStartedAt: "2026-06-06T00:00:00.000Z",
      intervalEndedAt: "2026-06-06T00:05:00.000Z",
      uploadBytes: 1,
      downloadBytes: 1
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "unresolved_binding");
    assert.equal(result.unresolvedReason, "channel_mismatch");
    assert.deepEqual(result.blockers, [{ code: "channel_binding_mismatch" }]);
    assert.equal(result.sampleInserted, false);
    assert.equal(store.listUsageSamples({ edgeCredentialRef: "edgecred_pareq_usage_service_1" }).length, 0);
    assert.equal(store.getUsageRollupByEdgeCredentialRef("edgecred_pareq_usage_service_1"), null);
  });
});
