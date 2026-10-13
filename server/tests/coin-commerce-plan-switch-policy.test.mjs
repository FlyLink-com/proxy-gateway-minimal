import assert from "node:assert/strict";
import test from "node:test";

import { COIN_COMMERCE_PRODUCTION_PUBLISHED_OFFERS } from "../services/platform/coin-commerce-production-catalog.mjs";
import {
  PLAN_SWITCH_ERROR,
  PLAN_SWITCH_KINDS,
  PLAN_SWITCH_LEGACY_COMMERCE_MODE,
  PLAN_SWITCH_MIN_UPGRADE_REMAINING_MS,
  PLAN_SWITCH_MS_PER_DAY,
  PLAN_SWITCH_ORDINARY_KIND,
  PLAN_SWITCH_TIERS,
  assertPlanSwitchStartupFlags,
  classifyPlanSwitch,
  computeSwitchCharge,
  planSwitchDurationMs,
  planSwitchTierCoverageGaps,
  planSwitchTierForOfferVersionRef,
  precheckPlanSwitchAccount
} from "../services/platform/coin-commerce-plan-switch-policy.mjs";

const BASIC = "offerv_plan_30d_50gb_monthly_v1";
const PLUS = "offerv_plan_30d_100gb_monthly_v1";
const YEARLY = "offerv_plan_365d_200gb_monthly_v1";
const DAY_MS = PLAN_SWITCH_MS_PER_DAY;
const D30 = 30 * DAY_MS;

function charge(overrides) {
  return computeSwitchCharge({
    kind: "upgrade_inplace",
    fromOfferVersionRef: BASIC,
    toOfferVersionRef: PLUS,
    remainingMs: D30,
    pendingCreditUnits: 0,
    ...overrides
  });
}

test("published plan offers match PLAN_SWITCH_TIERS exactly", () => {
  assert.deepEqual(planSwitchTierCoverageGaps(
    COIN_COMMERCE_PRODUCTION_PUBLISHED_OFFERS
  ), []);
  assert.deepEqual(
    PLAN_SWITCH_TIERS.map((tier) => tier.rank),
    [1, 2, 3]
  );
  assert.equal(planSwitchDurationMs(30), 2_592_000_000);
  assert.equal(planSwitchDurationMs(365), 31_536_000_000);
  assert.equal(planSwitchTierForOfferVersionRef(BASIC)?.listPriceUnits, 20);
  assert.equal(planSwitchTierForOfferVersionRef("offerv_not_a_plan"), null);
  assert.deepEqual(
    planSwitchTierCoverageGaps([{
      category: "plan",
      offerRef: "offer_plan_unknown",
      offerVersionRef: "offerv_plan_unknown",
      baseCoinUnits: 1,
      delivery: { durationDays: 30, monthlyTrafficGb: 1 }
    }]),
    ["offerv_plan_unknown", BASIC, PLUS, YEARLY]
  );
});

test("precheck accepts only legacy commerce with no authority flag or rows", () => {
  assert.deepEqual(precheckPlanSwitchAccount({
    authorityFlagEnabled: false,
    commerceMode: PLAN_SWITCH_LEGACY_COMMERCE_MODE,
    authorityRowCount: 0
  }), { ok: true });

  const cases = [
    [{
      authorityFlagEnabled: true,
      commerceMode: "legacy",
      authorityRowCount: 0
    }, PLAN_SWITCH_ERROR.AUTHORITY_MODE_UNSUPPORTED],
    [{
      authorityFlagEnabled: false,
      commerceMode: "wallet_first_unique_v1",
      authorityRowCount: 0
    }, PLAN_SWITCH_ERROR.COMMERCE_MODEL_UNSUPPORTED],
    [{
      authorityFlagEnabled: false,
      commerceMode: "legacy",
      authorityRowCount: 1
    }, PLAN_SWITCH_ERROR.AUTHORITY_ROW_PRESENT],
    [{
      authorityFlagEnabled: true,
      commerceMode: "wallet_first_unique_v1",
      authorityRowCount: 4
    }, PLAN_SWITCH_ERROR.AUTHORITY_MODE_UNSUPPORTED],
    [{
      authorityFlagEnabled: false,
      commerceMode: "other",
      authorityRowCount: 0
    }, PLAN_SWITCH_ERROR.COMMERCE_MODEL_UNSUPPORTED]
  ];
  for (const [input, code] of cases) {
    assert.deepEqual(precheckPlanSwitchAccount(input), { ok: false, code });
  }
});

test("precheck rejects invalid input instead of treating it as allowed", () => {
  const invalid = [
    null,
    [],
    { authorityFlagEnabled: false, commerceMode: "legacy" },
    {
      authorityFlagEnabled: false,
      commerceMode: "legacy",
      authorityRowCount: 0,
      extra: true
    },
    {
      authorityFlagEnabled: "false",
      commerceMode: "legacy",
      authorityRowCount: 0
    },
    {
      authorityFlagEnabled: false,
      commerceMode: " legacy",
      authorityRowCount: 0
    },
    {
      authorityFlagEnabled: false,
      commerceMode: "",
      authorityRowCount: 0
    },
    {
      authorityFlagEnabled: false,
      commerceMode: "legacy",
      authorityRowCount: -1
    },
    {
      authorityFlagEnabled: false,
      commerceMode: "legacy",
      authorityRowCount: 1.5
    },
    {
      authorityFlagEnabled: false,
      commerceMode: "legacy",
      authorityRowCount: Number.MAX_SAFE_INTEGER + 1
    }
  ];
  for (const input of invalid) {
    assert.equal(
      precheckPlanSwitchAccount(input).code,
      PLAN_SWITCH_ERROR.INVALID_INPUT
    );
  }
});

test("charge math matches the design worked examples", () => {
  const rows = [
    ["basic to plus, just bought", charge({ remainingMs: D30 }), 10],
    ["basic to plus, 15 days left", charge({ remainingMs: 15 * DAY_MS }), 5],
    ["basic to plus, 29.9 days left", charge({ remainingMs: 2_583_360_000 }), 9],
    ["basic to plus, 1 hour left", charge({ remainingMs: 3_600_000 }), 1],
    ["basic to yearly, 15 days left", charge({
      kind: "upgrade_restart",
      toOfferVersionRef: YEARLY,
      remainingMs: 15 * DAY_MS
    }), 190],
    ["plus to yearly, 7 days left", charge({
      kind: "upgrade_restart",
      fromOfferVersionRef: PLUS,
      toOfferVersionRef: YEARLY,
      remainingMs: 7 * DAY_MS
    }), 193],
    ["plus to yearly, 7 days + 1ms", charge({
      kind: "upgrade_restart",
      fromOfferVersionRef: PLUS,
      toOfferVersionRef: YEARLY,
      remainingMs: 7 * DAY_MS + 1
    }), 192],
    ["basic to yearly, 70 days left", charge({
      kind: "upgrade_restart",
      toOfferVersionRef: YEARLY,
      remainingMs: 70 * DAY_MS
    }), 153],
    ["downgrade plus to basic", charge({
      kind: "downgrade_scheduled",
      fromOfferVersionRef: PLUS,
      toOfferVersionRef: BASIC,
      remainingMs: 15 * DAY_MS
    }), 20],
    ["downgrade yearly to plus", charge({
      kind: "downgrade_scheduled",
      fromOfferVersionRef: YEARLY,
      toOfferVersionRef: PLUS,
      remainingMs: DAY_MS
    }), 30],
    ["renew plus while basic downgrade pending", charge({
      kind: "renewal",
      fromOfferVersionRef: PLUS,
      toOfferVersionRef: PLUS,
      remainingMs: 10 * DAY_MS,
      pendingCreditUnits: 20
    }), 10]
  ];
  for (const [label, result, expected] of rows) {
    assert.equal(result.ok, true, label);
    assert.equal(result.chargeUnits, expected, label);
    assert.equal(result.chargeUnits >= 1, true, label);
  }

  const refused = charge({
    kind: "upgrade_restart",
    toOfferVersionRef: YEARLY,
    remainingMs: 310 * DAY_MS
  });
  assert.deepEqual(refused, {
    ok: false,
    code: PLAN_SWITCH_ERROR.CREDIT_EXCEEDS_PRICE
  });

  const yearlyFifteen = charge({
    kind: "upgrade_restart",
    toOfferVersionRef: YEARLY,
    remainingMs: 15 * DAY_MS
  });
  assert.equal(yearlyFifteen.creditUnits, 10);
  assert.equal(yearlyFifteen.listPriceUnits, 200);
  const plusSeven = charge({
    kind: "upgrade_restart",
    fromOfferVersionRef: PLUS,
    toOfferVersionRef: YEARLY,
    remainingMs: 7 * DAY_MS + 1
  });
  assert.equal(plusSeven.creditUnits, 8);
});

test("charge boundaries, minimum coin, and overflow rejection", () => {
  const dayPart = D30 / 10;
  assert.equal(charge({ remainingMs: dayPart }).chargeUnits, 1);
  assert.equal(charge({ remainingMs: dayPart - 1 }).chargeUnits, 1);
  assert.equal(charge({ remainingMs: 1 }).chargeUnits, 1);
  assert.equal(charge({ remainingMs: D30 + 1 }).chargeUnits, 10);
  // Stacked remaining follows the written floor formula, which can exceed
  // the full price difference. Pinned so a later cap cannot land silently.
  assert.equal(charge({ remainingMs: 70 * DAY_MS }).chargeUnits, 23);

  const basicLast = charge({
    kind: "upgrade_restart",
    toOfferVersionRef: YEARLY,
    remainingMs: 199 * D30 / 20
  });
  assert.equal(basicLast.ok, true);
  assert.equal(basicLast.creditUnits, 199);
  assert.equal(basicLast.chargeUnits, 1);
  assert.equal(charge({
    kind: "upgrade_restart",
    toOfferVersionRef: YEARLY,
    remainingMs: 10 * D30
  }).code, PLAN_SWITCH_ERROR.CREDIT_EXCEEDS_PRICE);

  const plusLast = charge({
    kind: "upgrade_restart",
    fromOfferVersionRef: PLUS,
    toOfferVersionRef: YEARLY,
    remainingMs: 199 * DAY_MS
  });
  assert.equal(plusLast.chargeUnits, 1);
  assert.equal(charge({
    kind: "upgrade_restart",
    fromOfferVersionRef: PLUS,
    toOfferVersionRef: YEARLY,
    remainingMs: 199 * DAY_MS + 1
  }).code, PLAN_SWITCH_ERROR.CREDIT_EXCEEDS_PRICE);

  const floored = charge({
    kind: "renewal",
    fromOfferVersionRef: PLUS,
    toOfferVersionRef: PLUS,
    pendingCreditUnits: 30
  });
  assert.equal(floored.chargeUnits, 1);
  assert.equal(charge({
    kind: "renewal",
    fromOfferVersionRef: PLUS,
    toOfferVersionRef: PLUS,
    pendingCreditUnits: 10_000
  }).chargeUnits, 1);

  const rejected = [
    charge({ remainingMs: 0 }),
    charge({ remainingMs: -1 }),
    charge({ remainingMs: 1.5 }),
    charge({ remainingMs: Number.MAX_SAFE_INTEGER + 1 }),
    charge({ pendingCreditUnits: -1 }),
    charge({ kind: "upgrade_restart", toOfferVersionRef: PLUS }),
    charge({
      kind: "downgrade_scheduled",
      fromOfferVersionRef: PLUS,
      toOfferVersionRef: BASIC,
      pendingCreditUnits: 1
    }),
    charge({ kind: "renewal", toOfferVersionRef: YEARLY }),
    charge({ kind: "not_a_kind" }),
    computeSwitchCharge({
      kind: "renewal",
      fromOfferVersionRef: PLUS,
      toOfferVersionRef: PLUS,
      remainingMs: 1
    })
  ];
  for (const result of rejected) {
    assert.equal(result.ok, false);
    assert.equal(
      [
        PLAN_SWITCH_ERROR.INVALID_INPUT,
        PLAN_SWITCH_ERROR.CREDIT_EXCEEDS_PRICE
      ].includes(result.code),
      true
    );
  }
});

test("classification follows rank, expiry, and the upgrade window", () => {
  const nowMs = 1_700_000_000_000;
  const base = {
    nowMs,
    currentOfferVersionRef: BASIC,
    validUntilMs: nowMs + 15 * DAY_MS,
    requestedOfferVersionRef: PLUS,
    scheduledSwitchRef: null,
    scheduledEffectiveAtMs: null
  };
  const upgrade = classifyPlanSwitch(base);
  assert.equal(upgrade.kind, "upgrade_inplace");
  assert.equal(upgrade.remainingMs, 15 * DAY_MS);
  assert.equal(upgrade.cancelsSwitchRef, null);
  assert.equal(upgrade.effectiveAtMs, null);

  const restart = classifyPlanSwitch({
    ...base,
    requestedOfferVersionRef: YEARLY
  });
  assert.equal(restart.kind, "upgrade_restart");

  const renewal = classifyPlanSwitch({
    ...base,
    requestedOfferVersionRef: BASIC
  });
  assert.equal(renewal.kind, "renewal");

  const downgrade = classifyPlanSwitch({
    ...base,
    currentOfferVersionRef: PLUS,
    requestedOfferVersionRef: BASIC
  });
  assert.equal(downgrade.kind, "downgrade_scheduled");
  assert.equal(downgrade.effectiveAtMs, base.validUntilMs);

  assert.equal(classifyPlanSwitch({
    ...base,
    currentOfferVersionRef: null,
    validUntilMs: null
  }).kind, PLAN_SWITCH_ORDINARY_KIND);
  assert.equal(classifyPlanSwitch({
    ...base,
    validUntilMs: nowMs
  }).kind, PLAN_SWITCH_ORDINARY_KIND);
  assert.equal(classifyPlanSwitch({
    ...base,
    validUntilMs: nowMs - 1
  }).kind, PLAN_SWITCH_ORDINARY_KIND);

  assert.equal(classifyPlanSwitch({
    ...base,
    validUntilMs: nowMs + PLAN_SWITCH_MIN_UPGRADE_REMAINING_MS - 1
  }).code, PLAN_SWITCH_ERROR.UPGRADE_WINDOW_CLOSED);
  assert.equal(classifyPlanSwitch({
    ...base,
    validUntilMs: nowMs + PLAN_SWITCH_MIN_UPGRADE_REMAINING_MS
  }).kind, "upgrade_inplace");
  // Below the upgrade window the same plan is still a renewal.
  assert.equal(classifyPlanSwitch({
    ...base,
    requestedOfferVersionRef: BASIC,
    validUntilMs: nowMs + 60_000
  }).kind, "renewal");

  assert.equal(classifyPlanSwitch({
    ...base,
    currentOfferVersionRef: "offerv_plan_unknown_but_valid_ref"
  }).code, PLAN_SWITCH_ERROR.OFFER_UNAVAILABLE);
  assert.equal(classifyPlanSwitch({
    ...base,
    requestedOfferVersionRef: "offerv_plan_unknown_but_valid_ref"
  }).code, PLAN_SWITCH_ERROR.OFFER_UNAVAILABLE);
});

test("a pending downgrade is credited on renewal or upgrade and blocks another downgrade", () => {
  const nowMs = 1_700_000_000_000;
  const pending = {
    nowMs,
    currentOfferVersionRef: PLUS,
    validUntilMs: nowMs + 10 * DAY_MS,
    requestedOfferVersionRef: PLUS,
    scheduledSwitchRef: "switch_pending_basic",
    scheduledEffectiveAtMs: nowMs + 10 * DAY_MS
  };
  const renewal = classifyPlanSwitch(pending);
  assert.equal(renewal.kind, "renewal");
  assert.equal(renewal.cancelsSwitchRef, "switch_pending_basic");
  const upgrade = classifyPlanSwitch({
    ...pending,
    requestedOfferVersionRef: YEARLY
  });
  assert.equal(upgrade.kind, "upgrade_restart");
  assert.equal(upgrade.cancelsSwitchRef, "switch_pending_basic");
  assert.equal(classifyPlanSwitch({
    ...pending,
    currentOfferVersionRef: YEARLY,
    requestedOfferVersionRef: PLUS
  }).code, PLAN_SWITCH_ERROR.ALREADY_SCHEDULED);
  assert.equal(classifyPlanSwitch({
    ...pending,
    scheduledEffectiveAtMs: nowMs
  }).code, PLAN_SWITCH_ERROR.APPLICATION_PENDING);
  assert.equal(classifyPlanSwitch({
    ...pending,
    scheduledEffectiveAtMs: nowMs - 1
  }).code, PLAN_SWITCH_ERROR.APPLICATION_PENDING);
});

test("startup refuses the plan-switch flag combined with the authority flag", () => {
  assert.doesNotThrow(() => assertPlanSwitchStartupFlags({
    planSwitchEnabled: false,
    authorityEnabled: false
  }));
  assert.doesNotThrow(() => assertPlanSwitchStartupFlags({
    planSwitchEnabled: false,
    authorityEnabled: true
  }));
  assert.doesNotThrow(() => assertPlanSwitchStartupFlags({
    planSwitchEnabled: true,
    authorityEnabled: false
  }));
  assert.throws(
    () => assertPlanSwitchStartupFlags({
      planSwitchEnabled: true,
      authorityEnabled: true
    }),
    (error) => error?.code === PLAN_SWITCH_ERROR.REQUIRES_LEGACY_COMMERCE
  );
  assert.throws(
    () => assertPlanSwitchStartupFlags({ planSwitchEnabled: true }),
    (error) => error?.code === PLAN_SWITCH_ERROR.INVALID_INPUT
  );
  assert.equal(PLAN_SWITCH_KINDS.length, 4);
});
