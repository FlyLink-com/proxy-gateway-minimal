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
  assert.equal(report.reports[1].collectorOk, true);
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
