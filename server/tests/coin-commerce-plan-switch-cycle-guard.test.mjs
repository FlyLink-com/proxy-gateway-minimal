import assert from "node:assert/strict";
import test from "node:test";

import {
  PLAN_SWITCH_ERROR,
  PLAN_SWITCH_LEGACY_COMMERCE_MODE
} from "../services/platform/coin-commerce-plan-switch-policy.mjs";
import { evaluatePlanSwitchRequest } from "../services/platform/coin-commerce-plan-switch-runtime.mjs";

const BASIC = "offerv_plan_30d_50gb_monthly_v1";
const YEARLY = "offerv_plan_365d_200gb_monthly_v1";

function evaluate(nowIso) {
  return evaluatePlanSwitchRequest({
    requestedOfferVersionRef: YEARLY,
    authorityFlagEnabled: false,
    commerceMode: PLAN_SWITCH_LEGACY_COMMERCE_MODE,
    authorityRowCount: 0,
    nowIso,
    entitlement: {
      id: "ent_cycle_guard",
      plan: BASIC,
      validFrom: "2024-01-31T00:00:00.000Z",
      validUntil: "2024-03-01T00:00:00.000Z"
    },
    scheduledSwitch: null
  });
}

test("yearly restart upgrade is allowed while both cycle rules pick the same window start", () => {
  const decision = evaluate("2024-02-10T00:00:00.000Z");
  assert.equal(decision.ok, true);
  assert.equal(decision.kind, "upgrade_restart");
});

test("yearly restart upgrade fails closed when the cycle window start would move (free quota reset)", () => {
  // Fixed 30-day window started 2024-01-31; yearly month-anniversary window
  // would start 2024-02-29, silently dropping 29 days of used bytes.
  const decision = evaluate("2024-02-29T05:00:00.000Z");
  assert.equal(decision.ok, false);
  assert.equal(decision.code, PLAN_SWITCH_ERROR.CYCLE_MISALIGNED);
});
