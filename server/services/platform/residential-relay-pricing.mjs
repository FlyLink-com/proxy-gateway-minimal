// Server-side price computation for residential relay pack SKUs.
// Order: list price -> coupon (coupons are the only promotion mechanism).
// The coupon amount rounds to whole Coins (half up) and the result clamps at >= 0. The full breakdown is meant to be
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

export function assertPriceAdjustment(input, code = "invalid_coupon") {
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

// coupon: normalized adjustment ({ code, kind, value }) or null.
export function computeResidentialPrice({ listPrice, coupon = null }) {
  if (!Number.isSafeInteger(listPrice) || listPrice <= 0) throw fail("sku_price_unset");
  const finalPrice = coupon ? applyAdjustment(listPrice, coupon) : listPrice;
  return {
    currency: "coins",
    listPrice,
    coupon: coupon ? { code: coupon.code ?? null, kind: coupon.kind, value: coupon.value, applied: true } : null,
    finalPrice
  };
}
