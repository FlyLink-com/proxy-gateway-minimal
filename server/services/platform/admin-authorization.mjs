const ADMIN_READ_CAPABILITIES = Object.freeze([
  "operations.read",
  "users.read",
  "commerce.read",
  "payments.read",
  "wallet.read",
  "catalog.read",
  "runtime.read"
]);

const SUPER_ADMIN_READ_CAPABILITIES = Object.freeze([
  ...ADMIN_READ_CAPABILITIES,
  "audit.read"
]);

// The only mutation capability in the admin model. Financial writes must
// never ride on a read capability: an ordinary admin session holds the
// read set above and nothing else, so it cannot execute a clawback (or
// any future wallet write gated on this capability). The capability is
// minted by role here, exactly like audit.read — no per-operator grants.
const SUPER_ADMIN_WRITE_CAPABILITIES = Object.freeze([
  "wallet.write"
]);

export function createAdminPrincipal(input = {}) {
  const context = input && typeof input === "object" ? input : {};
  const session = context.session;
  const role = String(context.role || "").trim();

  if (
    !session ||
    session.status !== "active" ||
    !["admin", "super_admin"].includes(role)
  ) {
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
    capabilities:
      role === "super_admin"
        ? [...SUPER_ADMIN_READ_CAPABILITIES, ...SUPER_ADMIN_WRITE_CAPABILITIES]
        : [...ADMIN_READ_CAPABILITIES],
    authenticatedAt,
    expiresAt,
    authStrength: "session"
  };
}

export function authorizeAdmin(input = {}) {
  const context = input && typeof input === "object" ? input : {};
  const capability = String(context.capability || "").trim();
  if (!context.principal) {
    return {
      allowed: false,
      capability,
      reasonCode: "principal_missing"
    };
  }

  const capabilities = Array.isArray(context.principal.capabilities)
    ? context.principal.capabilities
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
