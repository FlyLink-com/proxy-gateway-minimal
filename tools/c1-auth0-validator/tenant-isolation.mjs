// Step 5 synthetic contract: Portal/Admin isolation, built directly on the
// approved primitives from PR #842's head (bc3f8c9a):
//   - d1-t2-identity-boundary.mjs  (actor context, bindings)
//   - d1-t2-security-primitives.mjs (key families, TOTP protectors) — used by tests
//
// LOCAL SYNTHETIC ONLY. Issuer refs below are illustrative placeholders for
// the two future Auth0 tenants; no tenant exists and none is created here.
// Isolation model (Yi's principle 4): two tenants, one issuer per surface,
// per-surface required factors, bindings and revocations scoped by issuer.
// Nothing crosses: not identities, not factors, not sessions.

import {
  parseTrustedIdentityActorContext
} from "../../server/services/platform/d1-t2-identity-boundary.mjs";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export const SURFACES = Object.freeze({
  portal: Object.freeze({
    surface: "portal",
    issuerRef: "flylink-portal-auth0",
    requiredFactors: Object.freeze([])
  }),
  admin: Object.freeze({
    surface: "admin",
    issuerRef: "flylink-admin-auth0",
    requiredFactors: Object.freeze(["totp"])
  })
});

// Validate an actor context FOR ONE SURFACE. The issuer allowlist contains
// exactly that surface's issuer: a context minted by the other tenant is
// rejected at this local check regardless of which factors it carries —
// factor possession can never compensate for a foreign issuer.
export function validateSurfaceActorContext(surface, input, { nowMs } = {}) {
  const config = SURFACES[surface];
  if (!config) throw fail("surface_unknown");
  const context = parseTrustedIdentityActorContext(input, {
    allowedIssuers: [config.issuerRef],
    requiredFactors: [...config.requiredFactors],
    ...(nowMs === undefined ? {} : { nowMs })
  });
  return Object.freeze({ surface: config.surface, issuerRef: config.issuerRef, context });
}

// Session revocation registry scoped by (issuerRef, sessionRef).
// Revoking a session on one surface has no effect on the same session
// reference under the other surface's issuer: revocation domains are
// per-tenant, matching the two-tenant architecture.
export function createSessionRevocationRegistry() {
  const revoked = new Set();
  const keyOf = ({ issuerRef, sessionRef } = {}) => {
    if (typeof issuerRef !== "string" || issuerRef.length === 0
      || typeof sessionRef !== "string" || sessionRef.length === 0) {
      throw fail("revocation_scope_invalid");
    }
    return issuerRef + "\0" + sessionRef;
  };
  return Object.freeze({
    revoke(scope) {
      revoked.add(keyOf(scope));
      return true;
    },
    isRevoked(scope) {
      return revoked.has(keyOf(scope));
    },
    size() {
      return revoked.size;
    }
  });
}
