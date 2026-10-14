// US clean-residential relay traffic pack (monthly recurring quota).
//
// Deliberately NOT a CoinCommerce offer and NOT a #753 lifetime data pack:
// #753 packs are `neverExpires: true` lifetime allowances. This product resets
// every 30-day period and routes only through a dedicated residential pool, so
// it gets its own product kind and must never be merged into the published
// catalog until price, renewal and refund semantics are decided.

export const RESIDENTIAL_RELAY_PACK_KIND = "residential_relay_pack";
export const RESIDENTIAL_RELAY_PERIOD_DAYS = 30;
export const RESIDENTIAL_RELAY_GIB = 1024 ** 3;

export const RESIDENTIAL_RELAY_PACK_CANDIDATE = Object.freeze({
  productRef: "product_residential_us_100gb_monthly",
  productVersionRef: "productv_residential_us_100gb_monthly_v0",
  kind: RESIDENTIAL_RELAY_PACK_KIND,
  published: false,
  title: Object.freeze({ zh: "美国纯净住宅流量包（100 GB/月）", en: "US clean residential traffic (100 GB / month)" }),
  audience: "social_media_operators",
  exitRegion: "US",
  relayLine: "CN2",
  periodDays: RESIDENTIAL_RELAY_PERIOD_DAYS,
  periodQuotaBytes: 100 * RESIDENTIAL_RELAY_GIB,
  // TODO(Ethan, pricing): unpublished placeholder. null blocks any purchase path.
  baseCoinUnits: null,
  // TODO(Ethan, renewal): auto-renew vs manual renew; behaviour when a renewal
  // payment fails; whether unused bytes roll over (current code: no rollover).
  renewal: Object.freeze({ decided: false, rollover: false }),
  // TODO(Ethan, refund): refund/cancel rules for a partially used period and for
  // upstream residential pool outages. No refund path is implemented.
  refund: Object.freeze({ decided: false })
});

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

// Startup gate. Default off. While the pricing/renewal/refund decisions are
// open and order fulfillment is not wired, turning the flag on fails closed
// instead of exposing a sellable-but-unfulfillable product.
export function assertResidentialRelayPackStartup({ enabled, dataPackRuntimeEnabled, product = RESIDENTIAL_RELAY_PACK_CANDIDATE } = {}) {
  if (enabled !== true) return { enabled: false };
  if (dataPackRuntimeEnabled !== true) throw fail("residential_relay_pack_requires_data_pack_runtime");
  if (!Number.isSafeInteger(product.baseCoinUnits) || product.baseCoinUnits <= 0) throw fail("residential_relay_pack_price_undecided");
  if (product.renewal?.decided !== true || product.refund?.decided !== true) throw fail("residential_relay_pack_terms_undecided");
  return { enabled: true };
}

export function isResidentialRelayPackPurchasable(product = RESIDENTIAL_RELAY_PACK_CANDIDATE) {
  return product.published === true && Number.isSafeInteger(product.baseCoinUnits) && product.baseCoinUnits > 0
    && product.renewal?.decided === true && product.refund?.decided === true;
}
