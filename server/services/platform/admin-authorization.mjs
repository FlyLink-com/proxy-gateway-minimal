export function authorizeAdmin(input = {}) {
  const capability = String(input.capability || "").trim();
  const capabilities = Array.isArray(input.principal?.capabilities)
    ? input.principal.capabilities
    : [];

  if (capability && capabilities.includes(capability)) {
    return {
      allowed: true,
      capability,
      reasonCode: "allowed"
    };
  }

  return {
    allowed: false,
    capability,
    reasonCode: "capability_missing"
  };
}
