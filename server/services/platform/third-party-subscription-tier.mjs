import { createHash } from "node:crypto";

export const THIRD_PARTY_PLAN_IDS = Object.freeze([
  "monthly_basic",
  "monthly_plus",
  "yearly"
]);

const GIB = 1024 ** 3;

// Derived from entitlement trafficLimitBytes = monthlyTrafficGb * 1024**3.
// Catalog traffic sizes: 50 GB -> monthly_basic, 100 GB -> monthly_plus,
// 200 GB -> yearly. Any other size, missing binding, or non-active tenant
// fails closed and receives no third-party nodes.
const PLAN_BY_TRAFFIC_BYTES = new Map([
  [50 * GIB, "monthly_basic"],
  [100 * GIB, "monthly_plus"],
  [200 * GIB, "yearly"]
]);

function text(value) {
  return String(value ?? "").trim().toLowerCase();
}

function safeRef(prefix, value) {
  return `${prefix}ref_${createHash("sha256").update(String(value)).digest("hex").slice(0, 16)}`;
}

export function resolveThirdPartyPlanId({
  trafficLimitBytes,
  tenantStatus,
  lifecycleStatus
} = {}) {
  const status = text(tenantStatus || lifecycleStatus);
  if (status && status !== "active") return null;
  const bytes = Number(trafficLimitBytes);
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  return PLAN_BY_TRAFFIC_BYTES.get(bytes) || null;
}

export function trafficLimitBytesFromBinding(binding) {
  const bytes = Number(binding?.trafficLimitBytes);
  return Number.isFinite(bytes) && bytes > 0 ? bytes : null;
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
      if (binding?.trafficLimitBytes) return binding;
    } catch {
      return null;
    }
  }
  return null;
}
