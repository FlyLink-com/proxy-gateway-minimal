import assert from "node:assert/strict";
import test from "node:test";

import {
  sanitizeTrafficCollectorState,
  TRAFFIC_COLLECTOR_CONDITION,
  TRAFFIC_COLLECTOR_HEALTH
} from "../services/platform/traffic-collector-state.mjs";

const VALID_PAIRS = new Set([
  "healthy:ok",
  "healthy:idle_no_user_traffic",
  "degraded:missing_stats",
  "degraded:mapping_unresolved",
  "degraded:sidecar_idle",
  "failed:runtime_down",
  "failed:config_error",
  "failed:auth_error"
]);

test("traffic collector state sanitizer enforces the health-condition matrix", () => {
  for (const health of Object.values(TRAFFIC_COLLECTOR_HEALTH)) {
    for (const condition of Object.values(TRAFFIC_COLLECTOR_CONDITION)) {
      const state = sanitizeTrafficCollectorState({
        health,
        condition,
        sourceRef: "xray_statsquery_user_traffic",
        channelRef: "channel-safe",
        lastCollectorSuccessAt: "2026-07-09T00:00:00.000Z",
        observationCount: 1,
        unresolvedCount: 0
      });
      const expectedValid = VALID_PAIRS.has(`${health}:${condition}`);

      assert.equal(Boolean(state), expectedValid, `${health}:${condition}`);
    }
  }
});

test("traffic collector state names collector success time explicitly", () => {
  const state = sanitizeTrafficCollectorState({
    health: "healthy",
    condition: "ok",
    sourceRef: "xray_statsquery_user_traffic",
    channelRef: "channel-safe",
    lastCollectorSuccessAt: "2026-07-09T00:00:00.000Z",
    observationCount: 1,
    unresolvedCount: 0
  });

  assert.equal(state.lastCollectorSuccessAt, "2026-07-09T00:00:00.000Z");
  assert.equal("lastSuccessAt" in state, false);
});
