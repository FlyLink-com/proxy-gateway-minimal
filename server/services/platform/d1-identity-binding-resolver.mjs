// Server-side binding resolver (B2-2, scope S). Resolves a verified actor
// context to a platform account through the identity-binding store only.
// It never scans email, never consults a digest index, and never falls back
// to the legacy email login resolver. Unbound, ambiguous, mismatched or
// inactive accounts all fail closed. No production caller yet: the live
// portal login still uses resolvePortalLoginAccount, and switching traffic
// to this resolver needs separate authorization.

import {
  parseTrustedIdentityActorContext
} from "./d1-t2-identity-boundary.mjs";

function resolverError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function resolveAccountByVerifiedActorContext({
  controlStore,
  bindingRepository,
  actorContext,
  allowedIssuers,
  nowMs = Date.now()
} = {}) {
  if (!controlStore || typeof controlStore.getAccount !== "function") {
    throw resolverError("identity_binding_resolver_store_invalid");
  }
  if (!bindingRepository || typeof bindingRepository.resolve !== "function") {
    throw resolverError("identity_binding_resolver_repository_invalid");
  }
  const verified = parseTrustedIdentityActorContext(actorContext, {
    allowedIssuers,
    nowMs,
    requiredFactors: []
  });
  const resolved = bindingRepository.resolve({
    issuerRef: verified.issuerRef,
    subjectRef: verified.subjectRef
  });
  if (resolved.outcome !== "resolved") {
    throw resolverError(`identity_binding_${resolved.outcome}`);
  }
  const account = controlStore.getAccount(resolved.accountRef);
  if (!account || account.status !== "active") {
    throw resolverError("identity_binding_account_unavailable");
  }
  return { account, bindingId: resolved.bindingId };
}
