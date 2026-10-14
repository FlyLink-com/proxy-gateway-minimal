import assert from "node:assert/strict";
import test from "node:test";
import { applyAdjustment, computeResidentialPrice, assertPriceAdjustment, maxCouponDeduction, RESIDENTIAL_COUPON_MAX_BPS } from "../services/platform/residential-relay-pricing.mjs";

test("list -> coupon, half-up whole Coins, deduction capped at 20% of list price, never negative", () => {
  assert.equal(RESIDENTIAL_COUPON_MAX_BPS, 2000);
  assert.equal(applyAdjustment(30, { kind: "percent", value: 1500 }), 25); // 4.5 off -> 5
  assert.equal(applyAdjustment(30, { kind: "percent", value: 1499 }), 26);
  assert.deepEqual([maxCouponDeduction(30), maxCouponDeduction(33), maxCouponDeduction(4)], [6, 6, 0]);
  const r = computeResidentialPrice({ listPrice: 120, coupon: { code: "X", kind: "fixed", value: 10 } });
  assert.deepEqual(r, { currency: "coins", listPrice: 120, coupon: { code: "X", kind: "fixed", value: 10, applied: true, capped: false }, deduction: 10, finalPrice: 110 });
  assert.deepEqual(computeResidentialPrice({ listPrice: 50 }), { currency: "coins", listPrice: 50, coupon: null, deduction: 0, finalPrice: 50 });
  // 20% of 33 = 6.6 -> half-up 7 exceeds 20%; capped to 6.
  const pct = computeResidentialPrice({ listPrice: 33, coupon: { kind: "percent", value: 2000 } });
  assert.deepEqual([pct.deduction, pct.finalPrice, pct.coupon.capped], [6, 27, true]);
  const big = computeResidentialPrice({ listPrice: 30, coupon: { kind: "fixed", value: 99 } });
  assert.deepEqual([big.deduction, big.finalPrice], [6, 24]);
  const tiny = computeResidentialPrice({ listPrice: 1, coupon: { kind: "fixed", value: 1 } });
  assert.deepEqual([tiny.deduction, tiny.finalPrice], [0, 1]);
  for (let list = 1; list <= 500; list += 1) {
    for (const coupon of [{ kind: "percent", value: 2000 }, { kind: "fixed", value: 1000 }]) {
      const out = computeResidentialPrice({ listPrice: list, coupon });
      assert.ok(out.finalPrice >= 0 && out.finalPrice * 10 >= list * 8, `>= 80% at ${list}`);
    }
  }
});

test("percent above 20% is rejected at validation and at compute time", () => {
  assert.throws(() => assertPriceAdjustment({ kind: "percent", value: 2001 }), { code: "invalid_coupon" });
  assert.throws(() => computeResidentialPrice({ listPrice: 100, coupon: { kind: "percent", value: 5000 } }), { code: "invalid_coupon" });
  assert.throws(() => assertPriceAdjustment({ kind: "percent", value: 0 }), { code: "invalid_coupon" });
  assert.throws(() => assertPriceAdjustment({ kind: "bogus", value: 1 }), { code: "invalid_coupon" });
  assert.throws(() => computeResidentialPrice({ listPrice: null }), { code: "sku_price_unset" });
});
