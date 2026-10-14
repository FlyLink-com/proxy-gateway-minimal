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
// Legacy monthly/yearly entitlements are handled separately below, only after
// current ownership/history checks and with an exact stored traffic limit.
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
  // Omitted status stays compatible with existing helper callers.
  // A present status must be active or expiring.
  const status = text(tenantStatus || lifecycleStatus);
  if (status && status !== "active" && status !== "expiring") return null;
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

// Never infer a legacy tier from a tenant name, expiry duration or a missing
// usage binding. Subscription core must authenticate the link before this is
// called; the history-aware reader separately validates current entitlement.
export function resolveThirdPartyPlanIdForTenant(controlStore, tenant, { at = new Date().toISOString() } = {}) {
  const tenantStatus = text(tenant?.status);
  if (!["active", "expiring"].includes(tenantStatus)
    || typeof tenant?.id !== "string" || !tenant.id.trim() || tenant.id.length > 512) return null;
  if (typeof controlStore?.getThirdPartySubscriptionEligibilityByTenantRefs !== "function") {
    // Compatibility for existing non-SQLite adapters: no new legacy admission.
    const binding = findUsageBindingForTenant(controlStore, tenant.id);
    return resolveThirdPartyPlanId({ ...binding, tenantStatus });
  }
  try {
    const id = tenant.id.trim();
    const evidence = controlStore.getThirdPartySubscriptionEligibilityByTenantRefs(
      [id, safeRef("tenant", id)], { at }
    );
    if (evidence?.state !== "bound" || !evidence.binding) return null;
    const binding = evidence.binding;
    const offerPlan = resolveThirdPartyPlanId({ ...binding, tenantStatus });
    if (offerPlan) return offerPlan;
    // Do not coerce null/strings or approximate custom quotas into paid tiers.
    if (!Number.isSafeInteger(binding.trafficLimitBytes)) return null;
    if (binding.plan === "monthly") {
      if (binding.trafficLimitBytes === 50 * GIB) return "monthly_basic";
      if (binding.trafficLimitBytes === 100 * GIB) return "monthly_plus";
    }
    if (binding.plan === "yearly" && binding.trafficLimitBytes === 200 * GIB) return "yearly";
    return null;
  } catch {
    // An unreadable store is not evidence that a tenant has no binding.
    return null;
  }
}
