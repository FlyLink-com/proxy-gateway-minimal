import assert from "node:assert/strict";
import test from "node:test";
import { applyAdjustment, computeResidentialPrice, assertPriceAdjustment, isWithinWindow } from "../services/platform/residential-relay-pricing.mjs";

test("list -> coupon, half-up whole-Coin rounding, clamped at 0", () => {
  assert.equal(applyAdjustment(30, { kind: "percent", value: 1500 }), 25); // 4.5 off -> 5
  assert.equal(applyAdjustment(30, { kind: "percent", value: 1499 }), 26);
  assert.equal(applyAdjustment(30, { kind: "fixed", value: 99 }), 0);
  const r = computeResidentialPrice({ listPrice: 120, coupon: { code: "X", kind: "fixed", value: 10 } });
  assert.deepEqual(r, { currency: "coins", listPrice: 120, coupon: { code: "X", kind: "fixed", value: 10, applied: true }, finalPrice: 110 });
  assert.deepEqual(computeResidentialPrice({ listPrice: 50 }), { currency: "coins", listPrice: 50, coupon: null, finalPrice: 50 });
  assert.equal(computeResidentialPrice({ listPrice: 30, coupon: { kind: "percent", value: 10000 } }).finalPrice, 0);
  for (const key of Object.keys(r)) assert.ok(!/discount|stack/i.test(key));
});

test("coupon windows are half-open", () => {
  assert.equal(isWithinWindow({ startsAt: "2026-10-01T00:00:00Z", endsAt: "2026-10-14T00:00:00Z" }, "2026-10-14T00:00:00Z"), false);
  assert.equal(isWithinWindow({ startsAt: null, endsAt: null }, "2026-10-14T00:00:00Z"), true);
});

test("unpriced SKUs and invalid adjustments are rejected", () => {
  assert.throws(() => computeResidentialPrice({ listPrice: null }), { code: "sku_price_unset" });
  assert.throws(() => assertPriceAdjustment({ kind: "percent", value: 0 }), { code: "invalid_coupon" });
  assert.throws(() => assertPriceAdjustment({ kind: "bogus", value: 1 }), { code: "invalid_coupon" });
});
