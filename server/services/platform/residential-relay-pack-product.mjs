// US clean-residential relay traffic pack.
// Locked product rules (Ethan 2026-10-14):
// - No refunds.
// - No unused-byte rollover.
// - No renewals: one-shot purchase; credential disables when the period ends or
//   the quota is hit. No auto-renew, no grace period.
// Period length, quota and price are admin-configurable per SKU.
// Deliberately NOT a CoinCommerce offer and NOT a #753 lifetime data pack.

export const RESIDENTIAL_RELAY_PACK_KIND = "residential_relay_pack";
export const RESIDENTIAL_RELAY_GIB = 1024 ** 3;
export const RESIDENTIAL_RELAY_BUYER_PROTOCOLS = Object.freeze(["vless", "hysteria2"]);
export const RESIDENTIAL_RELAY_SKU_SIZE_CODES = Object.freeze(["100G", "200G", "500G", "1TB"]);

export const RESIDENTIAL_RELAY_SKU_SIZE_DEFAULTS = Object.freeze({
  "100G": Object.freeze({ sizeCode: "100G", defaultQuotaBytes: 100 * RESIDENTIAL_RELAY_GIB, titleZh: "100 GB", titleEn: "100 GB" }),
  "200G": Object.freeze({ sizeCode: "200G", defaultQuotaBytes: 200 * RESIDENTIAL_RELAY_GIB, titleZh: "200 GB", titleEn: "200 GB" }),
  "500G": Object.freeze({ sizeCode: "500G", defaultQuotaBytes: 500 * RESIDENTIAL_RELAY_GIB, titleZh: "500 GB", titleEn: "500 GB" }),
  "1TB": Object.freeze({ sizeCode: "1TB", defaultQuotaBytes: 1024 * RESIDENTIAL_RELAY_GIB, titleZh: "1 TB", titleEn: "1 TB" })
});

// Locked commercial terms. Do not re-open without an Ethan decision.
export const RESIDENTIAL_RELAY_PACK_TERMS = Object.freeze({
  refunds: false,
  unusedByteRollover: false,
  renewals: false,
  autoRenew: false,
  gracePeriod: false
});

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function isResidentialRelaySkuSizeCode(value) {
  return RESIDENTIAL_RELAY_SKU_SIZE_CODES.includes(value);
}

export function isResidentialRelayBuyerProtocol(value) {
  return RESIDENTIAL_RELAY_BUYER_PROTOCOLS.includes(value);
}

// A SKU is sellable only when every commercial field is set and at least one
// enabled upstream is bound. Terms are locked: no renewals / refunds / rollover.
export function isResidentialRelaySkuPurchasable(sku) {
  if (!sku || sku.enabled !== true) return false;
  if (!isResidentialRelaySkuSizeCode(sku.sizeCode)) return false;
  if (!isResidentialRelayBuyerProtocol(sku.buyerProtocol)) return false;
  if (!Number.isSafeInteger(sku.baseCoinUnits) || sku.baseCoinUnits <= 0) return false;
  if (!Number.isSafeInteger(sku.durationDays) || sku.durationDays <= 0 || sku.durationDays > 3660) return false;
  if (!Number.isSafeInteger(sku.quotaBytes) || sku.quotaBytes <= 0) return false;
  if (!Number.isSafeInteger(sku.enabledUpstreamCount) || sku.enabledUpstreamCount < 1) return false;
  return true;
}

// Startup gate. Default off. Turning the flag on only requires the schema and
// secret for the admin store; selling still goes through isResidentialRelaySkuPurchasable.
export function assertResidentialRelayPackStartup({ enabled } = {}) {
  if (enabled !== true) return { enabled: false };
  return { enabled: true };
}

export function residentialRelaySkuPublicView(sku) {
  return {
    id: sku.id,
    sizeCode: sku.sizeCode,
    buyerProtocol: sku.buyerProtocol,
    quotaBytes: sku.quotaBytes,
    durationDays: sku.durationDays,
    baseCoinUnits: sku.baseCoinUnits,
    enabled: sku.enabled === true,
    enabledUpstreamCount: sku.enabledUpstreamCount ?? 0,
    upstreamCount: sku.upstreamCount ?? 0,
    purchasable: isResidentialRelaySkuPurchasable(sku),
    terms: RESIDENTIAL_RELAY_PACK_TERMS
  };
}

export function assertResidentialRelaySkuInput(input = {}) {
  if (!isResidentialRelaySkuSizeCode(input.sizeCode)) throw fail("invalid_sku_size");
  if (!isResidentialRelayBuyerProtocol(input.buyerProtocol)) throw fail("invalid_buyer_protocol");
  if (!Number.isSafeInteger(input.durationDays) || input.durationDays <= 0 || input.durationDays > 3660) throw fail("invalid_duration");
  if (!Number.isSafeInteger(input.quotaBytes) || input.quotaBytes <= 0) throw fail("invalid_quota");
  // null = no price yet (e.g. seeded 1TB); such a SKU cannot be enabled or sold.
  if (input.baseCoinUnits !== null && (!Number.isSafeInteger(input.baseCoinUnits) || input.baseCoinUnits <= 0)) throw fail("invalid_price");
  if (input.baseCoinUnits === null && input.enabled === true) throw fail("invalid_price");
  if (input.enabled !== undefined && typeof input.enabled !== "boolean") throw fail("invalid_enabled");
  return {
    sizeCode: input.sizeCode,
    buyerProtocol: input.buyerProtocol,
    durationDays: input.durationDays,
    quotaBytes: input.quotaBytes,
    baseCoinUnits: input.baseCoinUnits,
    enabled: input.enabled === true
  };
}
