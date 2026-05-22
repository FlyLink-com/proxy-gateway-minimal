function requireCoreMethod(core, method) {
  if (!core || typeof core[method] !== "function") {
    throw new Error(`SubscriptionCore is missing method ${method}`);
  }
}

export function createPlatformSubscriptionIntegration({ core }) {
  for (const method of ["createTenant", "renewTenant", "disableTenant", "getTenant"]) {
    requireCoreMethod(core, method);
  }

  return {
    openSubscription: (input) => core.createTenant(input),
    renewSubscription: (id, input) => core.renewTenant(id, input),
    disableSubscription: (id) => core.disableTenant(id),
    getSubscription: (id) => core.getTenant(id)
  };
}
