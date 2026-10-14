// Server-side price computation for residential relay pack SKUs.
// Order: list price -> active SKU discount -> coupon. Each stage rounds to
// integer Coins (half up) and clamps at >= 0. The full breakdown is meant to be
// recorded on the order. Locked terms (no refunds / rollover / renewals) are
// unaffected by pricing.

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function ms(value) {
  if (value === null || value === undefined) return null;
  const t = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(t)) throw fail("invalid_time");
  return t;
}

export function isWithinWindow({ startsAt, endsAt }, now) {
  const at = ms(now), start = ms(startsAt), end = ms(endsAt);
  return (start === null || at >= start) && (end === null || at < end);
}

export function assertPriceAdjustment(input, code = "invalid_discount") {
  if (!input || typeof input !== "object") throw fail(code);
  if (input.kind === "percent") {
    if (!Number.isSafeInteger(input.value) || input.value <= 0 || input.value > 10_000) throw fail(code);
  } else if (input.kind === "fixed") {
    if (!Number.isSafeInteger(input.value) || input.value <= 0) throw fail(code);
  } else throw fail(code);
  let start, end;
  try { start = ms(input.startsAt ?? null); end = ms(input.endsAt ?? null); } catch { throw fail(code); }
  if (start !== null && end !== null && end <= start) throw fail(code);
  return { kind: input.kind, value: input.value, startsAt: input.startsAt ?? null, endsAt: input.endsAt ?? null };
}

// percent values are basis points (1500 = 15%). Half-up rounding to integer Coins.
export function applyAdjustment(price, adjustment) {
  if (!Number.isSafeInteger(price) || price < 0) throw fail("invalid_price");
  const off = adjustment.kind === "percent"
    ? Math.floor((price * adjustment.value + 5_000) / 10_000)
    : adjustment.value;
  return Math.max(0, price - off);
}

// discount / coupon: normalized adjustments or null. coupon.stackable decides
// whether the coupon applies on top of the discount. When not stackable, the
// buyer gets the lower of (discount only, coupon only on list price).
export function computeResidentialPrice({ listPrice, discount = null, coupon = null, now }) {
  if (!Number.isSafeInteger(listPrice) || listPrice <= 0) throw fail("sku_price_unset");
  const activeDiscount = discount && discount.enabled !== false && isWithinWindow(discount, now) ? discount : null;
  const afterDiscount = activeDiscount ? applyAdjustment(listPrice, activeDiscount) : listPrice;
  let finalPrice = afterDiscount;
  let couponApplied = false, discountApplied = Boolean(activeDiscount), stacked = false;
  if (coupon) {
    if (coupon.stackable !== false || !activeDiscount) {
      finalPrice = applyAdjustment(afterDiscount, coupon);
      couponApplied = true;
      stacked = Boolean(activeDiscount);
    } else {
      const couponOnly = applyAdjustment(listPrice, coupon);
      if (couponOnly < afterDiscount) {
        finalPrice = couponOnly;
        couponApplied = true;
        discountApplied = false;
      }
    }
  }
  return {
    currency: "coins",
    listPrice,
    discount: activeDiscount ? { kind: activeDiscount.kind, value: activeDiscount.value, applied: discountApplied } : null,
    priceAfterDiscount: afterDiscount,
    coupon: coupon ? { code: coupon.code ?? null, kind: coupon.kind, value: coupon.value, stackable: coupon.stackable !== false, applied: couponApplied } : null,
    stacked,
    finalPrice: Math.max(0, Math.round(finalPrice))
  };
}
