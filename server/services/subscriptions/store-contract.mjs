export const SUBSCRIPTION_STORE_METHODS = [
  "listTenants",
  "getTenant",
  "findTenantByTokenHash",
  "createTenant",
  "renewTenant",
  "setTenantNode",
  "setTenantStatus",
  "resetTenantToken",
  "markLastUsed",
  "createTempLink",
  "findTempLinkByTokenHash",
  "markTempLinkUsed"
];

export function assertSubscriptionStore(store) {
  if (!store || typeof store !== "object") {
    throw new Error("SubscriptionStore is required");
  }

  for (const method of SUBSCRIPTION_STORE_METHODS) {
    if (typeof store[method] !== "function") {
      throw new Error(`SubscriptionStore is missing method ${method}`);
    }
  }
}
