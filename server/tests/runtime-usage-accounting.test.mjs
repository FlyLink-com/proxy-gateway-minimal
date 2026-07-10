import assert from "node:assert/strict";
import test from "node:test";

import { createRuntimeUsageAccountingService } from "../services/platform/runtime-usage-accounting.mjs";

function observation(overrides = {}) {
  return {
    sourceRef: "runtime_source_1",
    channelRef: "channel-good",
    edgeCredentialRef: "edgecred_good",
    observedAt: "2026-06-15T00:00:00.000Z",
    intervalStartedAt: "2026-06-14T23:55:00.000Z",
    intervalEndedAt: "2026-06-15T00:00:00.000Z",
    uploadBytes: 1,
    downloadBytes: 2,
    ...overrides
  };
}

test("runtime usage accounting isolates collector failures and keeps later collectors writable", async () => {
  const recordedInputs = [];
  const service = createRuntimeUsageAccountingService({
    collectors: [
      {
        channelRef: "channel-bad",
        collect: async () => {
          throw new Error("secret runtime payload must not leak");
        }
      },
      {
        channelRef: "channel-good",
        collect: async () => ({
          ok: true,
          status: "collected",
          observations: [observation()],
          nextAction: "record_usage_observations_with_control_plane_accounting"
        })
      }
    ],
    accounting: {
      recordUsageObservation(input) {
        recordedInputs.push(input);
        return {
          ok: true,
          status: "within_quota",
          channelRef: input.channelRef,
          edgeCredentialRef: input.edgeCredentialRef,
          sampleInserted: true,
          nextAction: "continue_metering"
        };
      }
    }
  });

  const report = await service.collectAndRecord({ since: "2026-06-14T23:00:00.000Z" });

  assert.equal(report.ok, false);
  assert.equal(report.collectorCount, 2);
  assert.equal(report.observationCount, 1);
  assert.equal(report.recordedCount, 1);
  assert.equal(report.insertedCount, 1);
  assert.equal(report.unresolvedCount, 0);
  assert.equal(recordedInputs.length, 1);
  assert.equal(report.reports[0].collectorOk, false);
  assert.equal(report.reports[0].collectorStatus, "collector_error");
  assert.deepEqual(report.reports[0].blockers, ["collector_exception"]);
  assert.deepEqual(report.reports[0].collectorState, {
    type: "traffic_collector_state",
    health: "failed",
    condition: "runtime_down",
    sourceRef: "",
    channelRef: "channel-bad",
    lastSuccessAt: null,
    observationCount: 0,
    unresolvedCount: 0,
    errorType: "runtime_down",
    safety: {
      redacted: true
    }
  });
  assert.equal(report.reports[1].collectorOk, true);
  assert.deepEqual(report.reports[1].collectorState, {
    type: "traffic_collector_state",
    health: "healthy",
    condition: "ok",
    sourceRef: "runtime_source_1",
    channelRef: "channel-good",
    lastSuccessAt: "2026-06-15T00:00:00.000Z",
    observationCount: 1,
    unresolvedCount: 0,
    errorType: null,
    safety: {
      redacted: true
    }
  });
  assert.equal(report.execution.writerMode, "sequential");
  assert.equal(report.execution.retryMode, "operator_replay_idempotent_samples");
  assert.equal(report.execution.safeToRetry, true);
  assert.doesNotMatch(JSON.stringify(report), /secret runtime payload/i);
});

test("runtime usage accounting isolates per-observation accounting failures without leaking details", async () => {
  const service = createRuntimeUsageAccountingService({
    collectors: [
      {
        channelRef: "channel-good",
        collect: async () => ({
          ok: true,
          status: "collected",
          observations: [
            observation({ edgeCredentialRef: "edgecred_bad" }),
            observation({ edgeCredentialRef: "edgecred_good_2" })
          ],
          nextAction: "record_usage_observations_with_control_plane_accounting"
        })
      }
    ],
    accounting: {
      recordUsageObservation(input) {
        if (input.edgeCredentialRef === "edgecred_bad") {
          throw new Error("raw sqlite path C:/secret/control.db must not leak");
        }
        return {
          ok: true,
          status: "within_quota",
          channelRef: input.channelRef,
          edgeCredentialRef: input.edgeCredentialRef,
          sampleInserted: true,
          nextAction: "continue_metering"
        };
      }
    }
  });

  const report = await service.collectAndRecord({ since: "2026-06-14T23:00:00.000Z" });

  assert.equal(report.ok, false);
  assert.equal(report.observationCount, 2);
  assert.equal(report.recordedCount, 1);
  assert.equal(report.insertedCount, 1);
  assert.equal(report.unresolvedCount, 1);
  assert.equal(report.reports[0].recorded[0].ok, false);
  assert.equal(report.reports[0].recorded[0].status, "accounting_error");
  assert.deepEqual(report.reports[0].recorded[0].blockers, ["accounting_exception"]);
  assert.equal(report.reports[0].recorded[1].ok, true);
  assert.doesNotMatch(JSON.stringify(report), /raw sqlite path|C:\/secret|control\.db/i);
});

test("runtime usage accounting treats reachable empty Xray stats as observable idle", async () => {
  const service = createRuntimeUsageAccountingService({
    collectors: [
      {
        channelRef: "channel-sgp-a-vless-reality-tcp",
        collect: async () => ({
          ok: true,
          status: "idle_no_user_traffic",
          sourceRef: "xray_statsquery_user_traffic",
          observations: [],
          blockers: [],
          observability: {
            statsApiReachable: true,
            userTrafficCountersObserved: false
          },
          nextAction: "continue_usage_monitoring_until_user_counters_are_observed"
        })
      }
    ],
    accounting: {
      recordUsageObservation() {
        throw new Error("idle collector should not record samples");
      }
    }
  });

  const report = await service.collectAndRecord({ since: "2026-07-09T00:00:00.000Z" });

  assert.equal(report.ok, true);
  assert.equal(report.collectorCount, 1);
  assert.equal(report.observationCount, 0);
  assert.equal(report.idleCollectorCount, 1);
  assert.equal(report.reports[0].collectorOk, true);
  assert.equal(report.reports[0].collectorStatus, "idle_no_user_traffic");
  assert.equal(report.reports[0].idle, true);
  assert.deepEqual(report.reports[0].collectorState, {
    type: "traffic_collector_state",
    health: "healthy",
    condition: "idle_no_user_traffic",
    sourceRef: "xray_statsquery_user_traffic",
    channelRef: "channel-sgp-a-vless-reality-tcp",
    lastSuccessAt: null,
    observationCount: 0,
    unresolvedCount: 0,
    errorType: null,
    safety: {
      redacted: true
    }
  });
  assert.deepEqual(report.reports[0].observability, {
    statsApiReachable: true,
    userTrafficCountersObserved: false
  });
  assert.equal(report.nextAction, "continue_usage_monitoring");
});

test("runtime usage accounting projects canonical collector conditions", async (t) => {
  const cases = [
    {
      name: "missing per-credential stats",
      collected: {
        ok: false,
        status: "collector_not_supported",
        sourceRef: "mihomo_usage_snapshot",
        observations: [],
        blockers: [{ code: "per_credential_usage_entries_required" }]
      },
      expected: { health: "degraded", condition: "missing_stats" }
    },
    {
      name: "runtime authentication failure",
      collected: {
        ok: false,
        status: "collector_error",
        sourceRef: "mihomo_usage_snapshot",
        observations: [],
        blockers: [{ code: "controller_unauthorized" }]
      },
      expected: { health: "failed", condition: "auth_error" }
    },
    {
      name: "collector configuration failure",
      collected: {
        ok: false,
        status: "validation_error",
        sourceRef: "hysteria2_traffic_stats",
        observations: [],
        blockers: [{ code: "validation_error" }]
      },
      expected: { health: "failed", condition: "config_error" }
    },
    {
      name: "sidecar warmup window",
      collected: {
        ok: true,
        status: "collected",
        sourceRef: "mihomo_connection_delta",
        stateWarmup: true,
        observations: [],
        blockers: []
      },
      expected: { health: "degraded", condition: "sidecar_idle" }
    }
  ];

  for (const entry of cases) {
    await t.test(entry.name, async () => {
      const service = createRuntimeUsageAccountingService({
        collectors: [
          {
            channelRef: "channel-safe",
            collect: async () => entry.collected
          }
        ],
        accounting: {
          recordUsageObservation() {
            throw new Error("empty collector result must not record usage");
          }
        }
      });

      const report = await service.collectAndRecord();

      assert.equal(report.reports[0].collectorState.health, entry.expected.health);
      assert.equal(report.reports[0].collectorState.condition, entry.expected.condition);
      assert.equal(report.reports[0].collectorState.errorType, entry.expected.condition);
    });
  }
});

test("runtime usage accounting projects unresolved bindings separately from collector health", async () => {
  const service = createRuntimeUsageAccountingService({
    collectors: [
      {
        channelRef: "channel-mapping",
        collect: async () => ({
          ok: true,
          status: "collected",
          sourceRef: "hysteria2_traffic_stats",
          observations: [observation({ channelRef: "channel-mapping" })],
          blockers: []
        })
      }
    ],
    accounting: {
      recordUsageObservation(input) {
        return {
          ok: false,
          status: "unresolved_binding",
          channelRef: input.channelRef,
          edgeCredentialRef: input.edgeCredentialRef,
          sampleInserted: false,
          blockers: [{ code: "edge_credential_binding_missing" }]
        };
      }
    }
  });

  const report = await service.collectAndRecord();

  assert.equal(report.reports[0].collectorOk, true);
  assert.equal(report.reports[0].unresolvedCount, 1);
  assert.equal(report.reports[0].collectorState.health, "degraded");
  assert.equal(report.reports[0].collectorState.condition, "mapping_unresolved");
  assert.equal(report.reports[0].collectorState.errorType, "mapping_unresolved");
});

test("runtime usage accounting blocks over-quota traffic supply suspension when lifecycle gate is missing", async () => {
  const service = createRuntimeUsageAccountingService({
    collectors: [
      {
        channelRef: "channel-good",
        collect: async () => ({
          ok: true,
          status: "collected",
          observations: [observation()],
          nextAction: "record_usage_observations_with_control_plane_accounting"
        })
      }
    ],
    accounting: {
      recordUsageObservation(input) {
        return {
          ok: true,
          status: "over_quota_disable_required",
          lifecycleAction: "traffic_supply_suspend_required",
          trafficSupply: {
            status: "suspend_required",
            scope: "order_resource",
            reason: "quota_exhausted",
            accountMutationRequired: false
          },
          channelRef: input.channelRef,
          edgeCredentialRef: input.edgeCredentialRef,
          sampleInserted: true,
          nextAction: "suspend_traffic_supply_through_controlled_gate"
        };
      }
    }
  });

  const report = await service.collectAndRecord({ since: "2026-06-14T23:00:00.000Z" });

  assert.equal(report.ok, false);
  assert.equal(report.quotaDisableRequiredCount, 1);
  assert.equal(report.trafficSupplySuspendRequiredCount, 1);
  assert.equal(report.trafficSupplySuspendAttemptedCount, 0);
  assert.equal(report.trafficSupplySuspendExecutedCount, 0);
  assert.equal(report.trafficSupplySuspendFailedCount, 0);
  assert.equal(report.trafficSupplySuspendPendingCount, 1);
  assert.equal(report.execution.subscriptionMutationRequired, true);
  assert.equal(report.execution.trafficSupplyMutationRequired, true);
  assert.equal(report.execution.trafficSupplyMutationAttempted, false);
  assert.equal(report.execution.trafficSupplyMutationExecuted, false);
  assert.equal(report.execution.accountMutationRequired, false);
  assert.equal(
    report.reports[0].recorded[0].trafficSupplyLifecycle.status,
    "traffic_supply_suspend_gate_missing"
  );
  assert.equal(report.reports[0].recorded[0].lifecycleAction, "traffic_supply_suspend_required");
  assert.deepEqual(report.reports[0].recorded[0].trafficSupply, {
    status: "suspend_required",
    scope: "order_resource",
    reason: "quota_exhausted",
    accountMutationRequired: false
  });
  assert.doesNotMatch(JSON.stringify(report), /password|token|subscriptionUrl|rawConfig/i);
});

test("runtime usage accounting automatically suspends traffic supply at quota limit", async () => {
  const lifecycleCalls = [];
  const service = createRuntimeUsageAccountingService({
    collectors: [
      {
        channelRef: "channel-good",
        collect: async () => ({
          ok: true,
          status: "collected",
          observations: [observation()],
          nextAction: "record_usage_observations_with_control_plane_accounting"
        })
      }
    ],
    accounting: {
      recordUsageObservation(input) {
        return {
          ok: true,
          status: "over_quota_disable_required",
          lifecycleAction: "traffic_supply_suspend_required",
          trafficSupply: {
            status: "suspend_required",
            scope: "order_resource",
            reason: "quota_exhausted",
            accountMutationRequired: false
          },
          requestId: "pareq_good",
          portalUserRef: "portal_user_good",
          channelRef: input.channelRef,
          edgeCredentialRef: input.edgeCredentialRef,
          sampleInserted: true,
          nextAction: "suspend_traffic_supply_through_controlled_gate"
        };
      }
    },
    trafficSupplyLifecycleGate: {
      handleUsageDecision(decision, options) {
        lifecycleCalls.push({ decision, options });
        return {
          ok: true,
          status: "controlled_traffic_supply_suspend_completed",
          mutation: true,
          nextAction: "traffic_supply_suspended_review_edge_lifecycle",
          execution: {
            trafficSupplySuspendRequired: true,
            trafficSupplySuspendExecuted: true,
            accountMutationRequired: false
          }
        };
      }
    }
  });

  const report = await service.collectAndRecord({ since: "2026-06-14T23:00:00.000Z" });

  assert.equal(report.ok, true);
  assert.equal(report.trafficSupplySuspendRequiredCount, 1);
  assert.equal(report.trafficSupplySuspendAttemptedCount, 1);
  assert.equal(report.trafficSupplySuspendExecutedCount, 1);
  assert.equal(report.trafficSupplySuspendFailedCount, 0);
  assert.equal(report.trafficSupplySuspendPendingCount, 0);
  assert.equal(report.execution.trafficSupplyMutationAttempted, true);
  assert.equal(report.execution.trafficSupplyMutationExecuted, true);
  assert.equal(report.execution.accountMutationRequired, false);
  assert.equal(lifecycleCalls.length, 1);
  assert.equal(lifecycleCalls[0].options.executeControlledTrafficSupplySuspend, true);
  assert.equal(lifecycleCalls[0].options.reviewedByRef, "usage_quota_auto_gate");
  assert.equal(
    report.reports[0].recorded[0].trafficSupplyLifecycle.status,
    "controlled_traffic_supply_suspend_completed"
  );
  assert.equal(report.reports[0].recorded[0].trafficSupplyLifecycle.mutation, true);
  assert.equal(report.reports[0].recorded[0].trafficSupplyLifecycle.execution.accountMutationRequired, false);
  assert.doesNotMatch(JSON.stringify(report), /password|token|subscriptionUrl|rawConfig/i);
});
