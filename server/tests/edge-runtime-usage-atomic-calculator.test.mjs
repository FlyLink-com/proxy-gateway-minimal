import assert from "node:assert/strict";
import test from "node:test";
import { calculateRuntimeUsageDeltas } from "../services/edge/runtime-usage-atomic-calculator.mjs";

const baseObservation = {
  sourceRef: "hy2_traffic_stats",
  channelRef: "channel-hy2-a",
  edgeCredentialRef: "edgecred_atomic_1",
  observedAt: "2026-06-06T12:05:00.000Z",
  intervalStartedAt: "2026-06-06T12:00:00.000Z",
  intervalEndedAt: "2026-06-06T12:05:00.000Z",
  uploadBytes: 1000,
  downloadBytes: 2000
};

test("runtime usage atomic calculator initializes cumulative cursors without charging historical bytes", () => {
  const result = calculateRuntimeUsageDeltas({
    mode: "cumulative",
    observations: [baseObservation],
    cursors: {}
  });

  assert.deepEqual(result, {
    ok: true,
    status: "cursor_initialized",
    mode: "cumulative",
    observations: [],
    nextCursors: {
      edgecred_atomic_1: {
        uploadBytes: 1000,
        downloadBytes: 2000,
        observedAt: "2026-06-06T12:05:00.000Z"
      }
    },
    skipped: [
      {
        edgeCredentialRef: "edgecred_atomic_1",
        reason: "cursor_initialized"
      }
    ],
    resetEvents: [],
    safety: {
      noRawRuntimePayload: true,
      noSecretMaterialReturned: true
    }
  });
});

test("runtime usage atomic calculator converts cumulative counters into delta observations", () => {
  const result = calculateRuntimeUsageDeltas({
    mode: "cumulative",
    observations: [baseObservation],
    cursors: {
      edgecred_atomic_1: {
        uploadBytes: 700,
        downloadBytes: 1500,
        observedAt: "2026-06-06T12:00:00.000Z"
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "calculated");
  assert.deepEqual(result.observations, [
    {
      ...baseObservation,
      uploadBytes: 300,
      downloadBytes: 500,
      intervalStartedAt: "2026-06-06T12:00:00.000Z"
    }
  ]);
  assert.equal(result.nextCursors.edgecred_atomic_1.uploadBytes, 1000);
  assert.equal(result.nextCursors.edgecred_atomic_1.downloadBytes, 2000);
  assert.deepEqual(result.resetEvents, []);
  assert.doesNotMatch(JSON.stringify(result), /password|token|uuid|rawConfig/i);
});

test("runtime usage atomic calculator fails safe when cumulative counters reset", () => {
  const result = calculateRuntimeUsageDeltas({
    mode: "cumulative",
    observations: [baseObservation],
    cursors: {
      edgecred_atomic_1: {
        uploadBytes: 1200,
        downloadBytes: 2500,
        observedAt: "2026-06-06T12:00:00.000Z"
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "counter_reset_detected");
  assert.deepEqual(result.observations, []);
  assert.deepEqual(result.resetEvents, [
    {
      edgeCredentialRef: "edgecred_atomic_1",
      previousObservedAt: "2026-06-06T12:00:00.000Z",
      observedAt: "2026-06-06T12:05:00.000Z",
      reason: "counter_decreased"
    }
  ]);
  assert.equal(result.nextCursors.edgecred_atomic_1.uploadBytes, 1000);
  assert.equal(result.nextCursors.edgecred_atomic_1.downloadBytes, 2000);
});

test("runtime usage atomic calculator passes read-and-clear or delta observations through", () => {
  const result = calculateRuntimeUsageDeltas({
    mode: "delta",
    observations: [baseObservation],
    cursors: {}
  });

  assert.deepEqual(result.observations, [baseObservation]);
  assert.equal(result.status, "calculated");
  assert.deepEqual(result.nextCursors, {
    edgecred_atomic_1: {
      uploadBytes: 1000,
      downloadBytes: 2000,
      observedAt: "2026-06-06T12:05:00.000Z"
    }
  });
});

test("runtime usage atomic calculator rejects unsafe observations before ledger recording", () => {
  assert.throws(() => calculateRuntimeUsageDeltas({
    mode: "delta",
    observations: [
      {
        ...baseObservation,
        edgeCredentialRef: "edgecred with spaces"
      }
    ],
    cursors: {}
  }), /edgeCredentialRef must be a safe reference/);
});
