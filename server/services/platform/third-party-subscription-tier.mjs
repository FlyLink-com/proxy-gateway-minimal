import { createHash } from "node:crypto";

export const THIRD_PARTY_PLAN_IDS = Object.freeze([
  "monthly_basic",
  "monthly_plus",
  "yearly"
]);

const GIB = 1024 ** 3;

// Source of truth for the offer version refs and their monthly traffic:
// WALLET_FIRST_RESOURCE_EFFECT_SUPPORTED_OFFERS in
// server/services/platform/subscription-control-db.mjs (private, not exported).
// Paid fulfilment stores platform_entitlements.plan = product.offerVersionRef
// (fulfillCommerceProduct in portal-access-requests.mjs). Public plan ids
// (monthly_30d_50gb / monthly_30d_100gb / yearly_365d_200gb) are a different
// namespace and are not accepted here.
// Legacy and manual entitlements store only monthly / yearly / trial / pilot,
// which cannot distinguish monthly_basic from monthly_plus, so they fail closed.
export const THIRD_PARTY_OFFER_PLAN_MAP = Object.freeze({
  offerv_plan_30d_50gb_monthly_v1: Object.freeze({
    planId: "monthly_basic",
    monthlyTrafficGb: 50
  }),
  offerv_plan_30d_100gb_monthly_v1: Object.freeze({
    planId: "monthly_plus",
    monthlyTrafficGb: 100
  }),
  offerv_plan_365d_200gb_monthly_v1: Object.freeze({
    planId: "yearly",
    monthlyTrafficGb: 200
  })
});

function text(value) {
  return String(value ?? "").trim().toLowerCase();
}

function planRef(value) {
  return String(value ?? "").trim();
}

function safeRef(prefix, value) {
  return `${prefix}ref_${createHash("sha256").update(String(value)).digest("hex").slice(0, 16)}`;
}

function trafficMatchesOffer(offer, trafficLimitBytes) {
  if (trafficLimitBytes === undefined || trafficLimitBytes === null || trafficLimitBytes === "") {
    return true;
  }
  const bytes = Number(trafficLimitBytes);
  if (!Number.isSafeInteger(bytes)) return false;
  return bytes === offer.monthlyTrafficGb * GIB;
}

export function resolveThirdPartyPlanId({
  plan,
  offerVersionRef,
  trafficLimitBytes,
  tenantStatus,
  lifecycleStatus
} = {}) {
  const status = text(tenantStatus || lifecycleStatus);
  if (status && status !== "active") return null;
  const ref = planRef(plan ?? offerVersionRef);
  const offer = Object.hasOwn(THIRD_PARTY_OFFER_PLAN_MAP, ref)
    ? THIRD_PARTY_OFFER_PLAN_MAP[ref]
    : null;
  if (!offer) return null;
  if (!trafficMatchesOffer(offer, trafficLimitBytes)) return null;
  return offer.planId;
}

export function findUsageBindingForTenant(controlStore, tenantId) {
  if (
    !controlStore
    || typeof controlStore.findUsageBindingByTenantRef !== "function"
  ) {
    return null;
  }
  const id = String(tenantId || "").trim();
  if (!id) return null;
  const refs = [id, safeRef("tenant", id)];
  for (const tenantRef of refs) {
    try {
      const binding = controlStore.findUsageBindingByTenantRef(tenantRef);
      if (binding) return binding;
    } catch {
      return null;
    }
  }
  return null;
}
