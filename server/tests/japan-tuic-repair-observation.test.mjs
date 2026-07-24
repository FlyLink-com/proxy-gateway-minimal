import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildJapanTuicRepairObservation,
  createJapanTuicRepairObservationStore,
  validateJapanTuicRepairObservation
} from "../services/platform/japan-tuic-repair-observation.mjs";

const OBSERVED_AT = "2026-07-24T12:00:00.000Z";
const LAST_COLLECTOR_SUCCESS_AT = "2026-07-24T11:59:00.000Z";

function validProjection(overrides = {}) {
  return {
    type: "traffic_collector_admin_projection",
    schemaVersion: "1",
    availability: "available",
    observedAt: OBSERVED_AT,
    run: {
      runOk: true,
      rawReportOk: true,
      collectorCount: 1
    },
    accounting: {
      recordingOk: true,
      unresolvedCount: 0
    },
    omittedCollectorCount: 0,
    collectors: [{
      channelRef: "channel-vultr-a-tuic",
      health: "healthy",
      condition: "ok",
      unresolvedCount: 0,
      lastCollectorSuccessAt: LAST_COLLECTOR_SUCCESS_AT,
      safety: {
        redacted: true,
        protectedFixtureMarker: "must-not-persist"
      }
    }],
    safety: { redacted: true },
    ...overrides
  };
}

test("buildJapanTuicRepairObservation returns only the accepted aggregate", () => {
  const observation = buildJapanTuicRepairObservation({
    projection: validProjection()
  });

  assert.deepEqual(observation, {
    schemaVersion: "1",
    type: "japan_tuic_repair_observation",
    capturedAt: OBSERVED_AT,
    collectorCount: 1,
    unresolvedTotal: 0,
    japanTuicUnresolved: 0,
    accepted: true
  });
  assert.doesNotMatch(JSON.stringify(observation), /must-not-persist/i);
});

test("validateJapanTuicRepairObservation accepts only the exact aggregate record", () => {
  const observation = buildJapanTuicRepairObservation({
    projection: validProjection()
  });

  assert.deepEqual(
    validateJapanTuicRepairObservation(observation),
    observation
  );
  for (const invalid of [
    { ...observation, type: "traffic_collector_admin_projection" },
    { ...observation, unexpected: true }
  ]) {
    assert.throws(
      () => validateJapanTuicRepairObservation(invalid),
      { code: "validation_error" }
    );
  }
});

test("Japan TUIC repair observation rejects invalid or unsafe projections", () => {
  const cases = [
    validProjection({ collectors: [] }),
    validProjection({ observedAt: "not-a-timestamp" }),
    validProjection({ observedAt: "2026-07-24T11:58:00.000Z" }),
    validProjection({
      accounting: { recordingOk: false, unresolvedCount: 1 }
    }),
    validProjection({ omittedCollectorCount: 1 }),
    validProjection({
      collectors: [{
        ...validProjection().collectors[0],
        lastCollectorSuccessAt: null
      }]
    })
  ];

  for (const projection of cases) {
    assert.throws(() => buildJapanTuicRepairObservation({ projection }), {
      code: "validation_error"
    });
  }
});

test("Japan TUIC repair observation store atomically persists only the aggregate", () => {
  const dir = mkdtempSync(join(tmpdir(), "japan-tuic-repair-observation-"));
  const filePath = join(dir, "nested", "observation.json");
  try {
    const store = createJapanTuicRepairObservationStore({ filePath });
    const observation = store.write({ projection: validProjection() });

    assert.equal(observation.accepted, true);
    if (process.platform !== "win32") {
      assert.equal(statSync(filePath).mode & 0o777, 0o600);
    }
    const serialized = readFileSync(filePath, "utf8");
    assert.deepEqual(JSON.parse(serialized), observation);
    assert.doesNotMatch(serialized, /must-not-persist|channel-vultr-a-tuic|lastCollectorSuccessAt/i);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test("Japan TUIC repair observation store preserves an existing parent mode", {
  skip: process.platform === "win32"
}, () => {
  const dir = mkdtempSync(join(tmpdir(), "japan-tuic-repair-observation-existing-parent-"));
  const parentDirectory = join(dir, "existing");
  const filePath = join(parentDirectory, "observation.json");
  try {
    mkdirSync(parentDirectory, { mode: 0o750 });
    chmodSync(parentDirectory, 0o750);

    createJapanTuicRepairObservationStore({ filePath }).write({
      projection: validProjection()
    });

    assert.equal(statSync(parentDirectory).mode & 0o777, 0o750);
    assert.equal(statSync(filePath).mode & 0o777, 0o600);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test("Japan TUIC repair observation store creates a missing parent with private modes", {
  skip: process.platform === "win32"
}, () => {
  const dir = mkdtempSync(join(tmpdir(), "japan-tuic-repair-observation-missing-parent-"));
  const parentDirectory = join(dir, "missing", "nested");
  const filePath = join(parentDirectory, "observation.json");
  try {
    createJapanTuicRepairObservationStore({ filePath }).write({
      projection: validProjection()
    });

    assert.equal(statSync(parentDirectory).mode & 0o777, 0o700);
    assert.equal(statSync(filePath).mode & 0o777, 0o600);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test("Japan TUIC repair observation store rejects a relative path", () => {
  assert.throws(() => createJapanTuicRepairObservationStore({
    filePath: "relative-observation.json"
  }), { code: "validation_error" });
});

test("Japan TUIC repair observation store preserves a colliding temporary file", () => {
  const dir = mkdtempSync(join(tmpdir(), "japan-tuic-repair-observation-collision-"));
  const filePath = join(dir, "observation.json");
  const temporaryPath = join(dir, `.observation.json.tmp-${process.pid}`);
  try {
    writeFileSync(temporaryPath, "existing temporary file", { mode: 0o600, flag: "wx" });
    const store = createJapanTuicRepairObservationStore({ filePath });

    assert.throws(() => store.write({ projection: validProjection() }), {
      code: "EEXIST"
    });
    assert.equal(readFileSync(temporaryPath, "utf8"), "existing temporary file");
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});
