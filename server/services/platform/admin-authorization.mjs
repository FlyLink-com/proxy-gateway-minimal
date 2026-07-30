const ADMIN_READ_CAPABILITIES = Object.freeze([
  "operations.read",
  "users.read",
  "commerce.read",
  "payments.read",
  "wallet.read",
  "catalog.read",
  "runtime.read"
]);

export function createAdminPrincipal(input = {}) {
  const session = input.session;
  const role = String(input.role || "").trim();

  if (!session || session.status !== "active" || role !== "admin") {
    return null;
  }

  const operatorRef = String(session.operatorRef || "").trim();
  const sessionRef = String(session.sessionRef || "").trim();
  const authenticatedAt = String(session.issuedAt || "").trim();
  const expiresAt = String(session.expiresAt || "").trim();

  if (!operatorRef || !sessionRef || !authenticatedAt || !expiresAt) {
    return null;
  }

  return {
    operatorRef,
    sessionRef,
    role,
    capabilities: [...ADMIN_READ_CAPABILITIES],
    authenticatedAt,
    expiresAt,
    authStrength: "session"
  };
}

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
