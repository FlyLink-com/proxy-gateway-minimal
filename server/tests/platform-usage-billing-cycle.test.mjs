import assert from "node:assert/strict";
import test from "node:test";

import {
  isQuotaRolloverManagedBinding,
  usageCycleForBinding,
  usageCycleFiltersForBinding
} from "../services/platform/usage-billing-cycle.mjs";

test("a single 30-day Coins entitlement stays in one fixed-duration quota cycle across February", () => {
  const binding = {
    plan: "offerv_plan_30d_50gb_monthly_v1",
    validFrom: "2026-01-31T00:00:00.000Z",
    validUntil: "2026-03-02T00:00:00.000Z"
  };

  assert.deepEqual(usageCycleForBinding(binding, "2026-03-01T00:00:00.000Z"), {
    startedAt: "2026-01-31T00:00:00.000Z",
    endedAt: "2026-03-02T00:00:00.000Z",
    cadence: "fixed_30_days"
  });
  assert.deepEqual(usageCycleFiltersForBinding(binding, "2026-03-01T00:00:00.000Z"), {
    observedFrom: "2026-01-31T00:00:00.000Z",
    observedTo: "2026-03-02T00:00:00.000Z"
  });
});

test("versioned 30-day Coins plans start a second quota cycle at exactly validFrom plus 30 days", () => {
  for (const plan of [
    "offerv_plan_30d_50gb_monthly_v1",
    "offerv_plan_30d_100gb_monthly_v1"
  ]) {
    assert.deepEqual(usageCycleForBinding({
      plan,
      validFrom: "2026-01-31T00:00:00.000Z",
      validUntil: "2026-04-01T00:00:00.000Z"
    }, "2026-03-02T00:00:00.000Z"), {
      startedAt: "2026-03-02T00:00:00.000Z",
      endedAt: "2026-04-01T00:00:00.000Z",
      cadence: "fixed_30_days"
    });
  }
});

test("the final 30-day Coins quota cycle is capped by validUntil", () => {
  assert.deepEqual(usageCycleForBinding({
    plan: "offerv_plan_30d_100gb_monthly_v1",
    validFrom: "2026-01-31T00:00:00.000Z",
    validUntil: "2026-03-15T12:00:00.000Z"
  }, "2026-03-10T00:00:00.000Z"), {
    startedAt: "2026-03-02T00:00:00.000Z",
    endedAt: "2026-03-15T12:00:00.000Z",
    cadence: "fixed_30_days"
  });
});

test("only immutable Coins offers with defined replenishment semantics are rollover managed", () => {
  for (const plan of [
    "offerv_plan_30d_50gb_monthly_v1",
    "offerv_plan_30d_100gb_monthly_v1",
    "offerv_plan_365d_200gb_monthly_v1"
  ]) {
    assert.equal(isQuotaRolloverManagedBinding({ plan }), true, plan);
  }
  for (const plan of ["trial", "monthly", "yearly", "future_plan_not_reviewed"]) {
    assert.equal(isQuotaRolloverManagedBinding({ plan }), false, plan);
  }
});

test("default-off deployment preserves legacy trial and monthly anniversary behavior", () => {
  for (const plan of ["trial", "monthly"]) {
    assert.deepEqual(usageCycleForBinding({
      plan,
      validFrom: "2026-02-01T00:00:00.000Z",
      validUntil: "2026-03-03T00:00:00.000Z"
    }, "2026-03-02T00:00:00.000Z"), {
      startedAt: "2026-03-01T00:00:00.000Z",
      endedAt: "2026-03-03T00:00:00.000Z",
      cadence: "monthly_anniversary"
    });
  }
});

test("annual entitlements reset quota at monthly anniversaries", () => {
  for (const plan of ["yearly", "offerv_plan_365d_200gb_monthly_v1"]) {
    assert.deepEqual(usageCycleForBinding({
      plan,
      validFrom: "2026-01-31T00:00:00.000Z",
      validUntil: "2027-01-31T00:00:00.000Z"
    }, "2026-03-01T00:00:00.000Z"), {
      startedAt: "2026-02-28T00:00:00.000Z",
      endedAt: "2026-03-31T00:00:00.000Z",
      cadence: "monthly_anniversary"
    });
  }
});

test("versioned data packs retain one lifetime quota across monthly anniversaries", () => {
  for (const plan of [
    "offerv_pack_100gb_v1",
    "offerv_pack_200gb_v1",
    "offerv_pack_500gb_v1"
  ]) {
    const binding = {
      plan,
      validFrom: "2026-01-31T00:00:00.000Z",
      validUntil: "9999-12-31T23:59:59.999Z"
    };
    assert.deepEqual(usageCycleForBinding(binding, "2026-03-01T00:00:00.000Z"), {
      startedAt: binding.validFrom,
      endedAt: binding.validUntil,
      cadence: "lifetime"
    });
    assert.deepEqual(usageCycleFiltersForBinding(binding, "2026-09-01T00:00:00.000Z"), {
      observedFrom: binding.validFrom,
      observedTo: binding.validUntil
    });
    assert.equal(isQuotaRolloverManagedBinding(binding), false);
  }
});

test("default-off deployment preserves existing monthly anniversary handling for unknown plans", () => {
  assert.deepEqual(usageCycleForBinding({
    plan: "future_plan_not_reviewed",
    validFrom: "2026-01-01T00:00:00.000Z",
    validUntil: "2027-01-01T00:00:00.000Z"
  }, "2026-08-01T00:00:00.000Z"), {
    startedAt: "2026-08-01T00:00:00.000Z",
    endedAt: "2026-09-01T00:00:00.000Z",
    cadence: "monthly_anniversary"
  });
});
