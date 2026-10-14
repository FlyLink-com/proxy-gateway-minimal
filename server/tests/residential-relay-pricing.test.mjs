import assert from "node:assert/strict";
import test from "node:test";
import { applyAdjustment, computeResidentialPrice, assertPriceAdjustment } from "../services/platform/residential-relay-pricing.mjs";

const now = "2026-10-14T00:00:00.000Z";

test("list -> discount -> coupon, half-up integer rounding, clamped at 0", () => {
  assert.equal(applyAdjustment(30, { kind: "percent", value: 1500 }), 25); // 4.5 off -> 5
  assert.equal(applyAdjustment(30, { kind: "percent", value: 1499 }), 26);
  assert.equal(applyAdjustment(30, { kind: "fixed", value: 99 }), 0);
  const r = computeResidentialPrice({ listPrice: 120, now,
    discount: { kind: "percent", value: 2000, enabled: true }, coupon: { code: "X", kind: "fixed", value: 10, stackable: true } });
  assert.deepEqual([r.listPrice, r.priceAfterDiscount, r.finalPrice, r.stacked], [120, 96, 86, true]);
  const free = computeResidentialPrice({ listPrice: 30, now, coupon: { kind: "percent", value: 10000 } });
  assert.equal(free.finalPrice, 0);
});

test("inactive or disabled discounts are ignored", () => {
  assert.equal(computeResidentialPrice({ listPrice: 50, now, discount: { kind: "fixed", value: 10, startsAt: "2026-11-01T00:00:00Z" } }).finalPrice, 50);
  assert.equal(computeResidentialPrice({ listPrice: 50, now, discount: { kind: "fixed", value: 10, enabled: false } }).finalPrice, 50);
  assert.equal(computeResidentialPrice({ listPrice: 50, now, discount: { kind: "fixed", value: 10, endsAt: now } }).finalPrice, 50);
});

test("non-stackable coupon: buyer gets the lower of discount-only or coupon-only", () => {
  const discount = { kind: "percent", value: 1000 };
  const better = computeResidentialPrice({ listPrice: 100, now, discount, coupon: { kind: "fixed", value: 20, stackable: false } });
  assert.deepEqual([better.finalPrice, better.coupon.applied, better.discount.applied, better.stacked], [80, true, false, false]);
  const worse = computeResidentialPrice({ listPrice: 100, now, discount, coupon: { kind: "fixed", value: 5, stackable: false } });
  assert.deepEqual([worse.finalPrice, worse.coupon.applied, worse.discount.applied], [90, false, true]);
});

test("unpriced SKUs and invalid adjustments are rejected", () => {
  assert.throws(() => computeResidentialPrice({ listPrice: null, now }), { code: "sku_price_unset" });
  assert.throws(() => assertPriceAdjustment({ kind: "percent", value: 0 }), { code: "invalid_discount" });
  assert.throws(() => assertPriceAdjustment({ kind: "bogus", value: 1 }, "invalid_coupon"), { code: "invalid_coupon" });
});
