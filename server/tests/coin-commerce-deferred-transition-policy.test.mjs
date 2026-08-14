import assert from "node:assert/strict";
import test from "node:test";

import {
  assessReservationAtActivation,
  COIN_COMMERCE_DEFERRED_TRANSITION_CONTRACT_VERSION,
  planRank,
  selectDeferredTransition,
  WALLET_FIRST_COMMERCIAL_MODEL
} from "../services/platform/coin-commerce-deferred-transition-policy.mjs";

const MONTHLY_50 = Object.freeze({
  offerVersionRef: "offerv_plan_30d_50gb_monthly_v1",
  durationDays: 30,
  monthlyTrafficGb: 50
});
const MONTHLY_100 = Object.freeze({
  offerVersionRef: "offerv_plan_30d_100gb_monthly_v1",
  durationDays: 30,
  monthlyTrafficGb: 100
});
const YEARLY_200 = Object.freeze({
  offerVersionRef: "offerv_plan_365d_200gb_monthly_v1",
  durationDays: 365,
  monthlyTrafficGb: 200
});

function transition({ transitionRef, plan, reservedAt, state = "reserved" }) {
  return { transitionRef, plan, reservedAt, state };
}

test("the deferred-transition contract keeps the wallet-first model explicit", () => {
  assert.equal(
    COIN_COMMERCE_DEFERRED_TRANSITION_CONTRACT_VERSION,
    "coin-commerce-deferred-transition/v1"
  );
  assert.equal(WALLET_FIRST_COMMERCIAL_MODEL, "wallet_first_unique_v1");
});

test("rank is fixed to annual 200GB, monthly 100GB, then monthly 50GB", () => {
  assert.equal(planRank(YEARLY_200), 3);
  assert.equal(planRank(MONTHLY_100), 2);
  assert.equal(planRank(MONTHLY_50), 1);
});

test("selection chooses the highest plan rank and preserves FIFO at the same rank", () => {
  const selected = selectDeferredTransition([
    transition({
      transitionRef: "transition_monthly_50",
      plan: MONTHLY_50,
      reservedAt: "2026-08-13T00:00:00.000Z"
    }),
    transition({
      transitionRef: "transition_annual_later",
      plan: YEARLY_200,
      reservedAt: "2026-08-13T00:02:00.000Z"
    }),
    transition({
      transitionRef: "transition_annual_first",
      plan: YEARLY_200,
      reservedAt: "2026-08-13T00:01:00.000Z"
    }),
    transition({
      transitionRef: "transition_not_reservable",
      plan: MONTHLY_100,
      reservedAt: "2026-08-13T00:00:00.000Z",
      state: "requote_required"
    })
  ]);
  assert.deepEqual(selected, {
    transitionRef: "transition_annual_first",
    plan: {
      offerVersionRef: YEARLY_200.offerVersionRef,
      durationDays: 365,
      monthlyTrafficGb: 200,
      rank: 3
    },
    reservedAt: "2026-08-13T00:01:00.000Z",
    state: "reserved"
  });
});

test("a reservation that would consume expired bonus Coins requires a re-quote", () => {
  assert.deepEqual(assessReservationAtActivation({
    activationAt: "2026-08-20T00:00:00.000Z",
    allocationLots: [
      { coinType: "bonus_coins", expiresAt: "2026-08-19T00:00:00.000Z" },
      { coinType: "paid_coins", expiresAt: null }
    ]
  }), {
    status: "requote_required",
    reasonCode: "bonus_expires_before_activation"
  });
});

test("paid Coins and bonus Coins valid after activation remain reservable", () => {
  assert.deepEqual(assessReservationAtActivation({
    activationAt: "2026-08-20T00:00:00.000Z",
    allocationLots: [
      { coinType: "bonus_coins", expiresAt: "2026-08-21T00:00:00.000Z" },
      { coinType: "paid_coins", expiresAt: null },
      { coinType: "reward_coins", expiresAt: null }
    ]
  }), {
    status: "reservable",
    reasonCode: null
  });
});

test("unknown plans and malformed transition timing fail closed", () => {
  assert.throws(
    () => planRank({
      offerVersionRef: "offerv_other_plan_v1",
      durationDays: 30,
      monthlyTrafficGb: 100
    }),
    (error) => error?.code === "unsupported_deferred_transition_offer"
  );
  assert.throws(
    () => selectDeferredTransition([
      transition({
        transitionRef: "transition_bad_time",
        plan: MONTHLY_50,
        reservedAt: "not-a-timestamp"
      })
    ]),
    (error) => error?.code === "invalid_deferred_transition_timestamp"
  );
});
