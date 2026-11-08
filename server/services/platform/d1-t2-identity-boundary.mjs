export const IDENTITY_ACTOR_CONTEXT_AUDIENCE = "flylink-control-plane";

const ACTOR_CONTEXT_KEYS = Object.freeze([
  "accountRef", "audience", "authTimeMs", "expiresAtMs", "factors", "issuerRef", "sessionRef", "subjectRef"
]);
const IDENTITY_BINDING_KEYS = Object.freeze([
  "accountRef", "createdAtMs", "issuerRef", "revokedAtMs", "status", "subjectRef", "updatedAtMs"
]);
const ALLOWED_FACTORS = new Set(["password", "totp", "passkey", "email_otp"]);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, expected) {
  if (!isPlainRecord(value) || Object.getOwnPropertySymbols(value).length !== 0) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors).sort();
  const expectedKeys = [...expected].sort();
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) return false;
  return keys.every((key) => Object.hasOwn(descriptors[key], "value") && descriptors[key].enumerable === true);
}

function requireOpaque(value, pattern, code) {
  if (typeof value !== "string" || !pattern.test(value) || value.includes("@")) throw fail(code);
  return value;
}

function requireTimestamp(value, code) {
  if (!Number.isSafeInteger(value) || value < 0) throw fail(code);
  return value;
}

export function parseTrustedIdentityActorContext(input, {
  allowedIssuers,
  nowMs = Date.now(),
  maxLifetimeMs = 300_000,
  clockSkewMs = 30_000
} = {}) {
  if (!hasExactKeys(input, ACTOR_CONTEXT_KEYS)) throw fail("identity_actor_context_schema_invalid");
  if (!(Array.isArray(allowedIssuers) || allowedIssuers instanceof Set)
    || (allowedIssuers instanceof Set && allowedIssuers.size === 0)
    || (Array.isArray(allowedIssuers) && allowedIssuers.length === 0)) {
    throw fail("identity_issuer_allowlist_invalid");
  }
  const issuerSet = new Set(allowedIssuers);
  const issuerRef = requireOpaque(input.issuerRef, /^[a-z][a-z0-9._-]{0,63}$/u, "identity_issuer_invalid");
  if (!issuerSet.has(issuerRef)) throw fail("identity_issuer_not_allowed");
  const subjectRef = requireOpaque(input.subjectRef, /^[A-Za-z0-9][A-Za-z0-9._|:/-]{0,191}$/u, "identity_subject_invalid");
  const accountRef = requireOpaque(input.accountRef, /^[A-Za-z0-9][A-Za-z0-9_:/-]{0,127}$/u, "identity_account_ref_invalid");
  const sessionRef = requireOpaque(input.sessionRef, /^[A-Za-z0-9][A-Za-z0-9._-]{7,191}$/u, "identity_session_ref_invalid");
  if (input.audience !== IDENTITY_ACTOR_CONTEXT_AUDIENCE) throw fail("identity_actor_audience_invalid");

  const authTimeMs = requireTimestamp(input.authTimeMs, "identity_auth_time_invalid");
  const expiresAtMs = requireTimestamp(input.expiresAtMs, "identity_context_expiry_invalid");
  if (!Number.isSafeInteger(nowMs) || !Number.isSafeInteger(maxLifetimeMs) || maxLifetimeMs <= 0
    || !Number.isSafeInteger(clockSkewMs) || clockSkewMs < 0) {
    throw fail("identity_context_clock_invalid");
  }
  if (expiresAtMs <= nowMs || expiresAtMs - nowMs > maxLifetimeMs
    || authTimeMs > nowMs + clockSkewMs || authTimeMs > expiresAtMs) {
    throw fail("identity_actor_context_time_invalid");
  }
  if (!Array.isArray(input.factors) || input.factors.length === 0
    || new Set(input.factors).size !== input.factors.length
    || input.factors.some((factor) => typeof factor !== "string" || !ALLOWED_FACTORS.has(factor))
    || !input.factors.some((factor) => factor === "password" || factor === "passkey")) {
    throw fail("identity_actor_factors_invalid");
  }

  return Object.freeze({
    issuerRef,
    subjectRef,
    accountRef,
    sessionRef,
    authTimeMs,
    expiresAtMs,
    factors: Object.freeze([...input.factors]),
    audience: IDENTITY_ACTOR_CONTEXT_AUDIENCE
  });
}

export function createD1IdentityBindingRecord(input) {
  if (!hasExactKeys(input, IDENTITY_BINDING_KEYS)) throw fail("identity_binding_schema_invalid");
  const accountRef = requireOpaque(input.accountRef, /^[A-Za-z0-9][A-Za-z0-9_:/-]{0,127}$/u, "identity_account_ref_invalid");
  const issuerRef = requireOpaque(input.issuerRef, /^[a-z][a-z0-9._-]{0,63}$/u, "identity_issuer_invalid");
  const subjectRef = requireOpaque(input.subjectRef, /^[A-Za-z0-9][A-Za-z0-9._|:/-]{0,191}$/u, "identity_subject_invalid");
  if (input.status !== "active" && input.status !== "revoked") throw fail("identity_binding_status_invalid");
  const createdAtMs = requireTimestamp(input.createdAtMs, "identity_binding_timestamp_invalid");
  const updatedAtMs = requireTimestamp(input.updatedAtMs, "identity_binding_timestamp_invalid");
  if (updatedAtMs < createdAtMs) throw fail("identity_binding_timestamp_invalid");
  let revokedAtMs = null;
  if (input.revokedAtMs !== null) revokedAtMs = requireTimestamp(input.revokedAtMs, "identity_binding_timestamp_invalid");
  if ((input.status === "active" && revokedAtMs !== null)
    || (input.status === "revoked" && (revokedAtMs === null || revokedAtMs < createdAtMs || revokedAtMs > updatedAtMs))) {
    throw fail("identity_binding_lifecycle_invalid");
  }
  return Object.freeze({ accountRef, issuerRef, subjectRef, status: input.status, createdAtMs, updatedAtMs, revokedAtMs });
}

export function resolveD1IdentityBinding({ bindings, issuerRef, subjectRef, expectedAccountRef } = {}) {
  if (!Array.isArray(bindings)) throw fail("identity_bindings_invalid");
  const issuer = requireOpaque(issuerRef, /^[a-z][a-z0-9._-]{0,63}$/u, "identity_issuer_invalid");
  const subject = requireOpaque(subjectRef, /^[A-Za-z0-9][A-Za-z0-9._|:/-]{0,191}$/u, "identity_subject_invalid");
  if (expectedAccountRef !== undefined) {
    requireOpaque(expectedAccountRef, /^[A-Za-z0-9][A-Za-z0-9_:/-]{0,127}$/u, "identity_account_ref_invalid");
  }
  const valid = bindings.map((record) => createD1IdentityBindingRecord(record));
  const matches = valid.filter((record) => record.status === "active"
    && record.issuerRef === issuer && record.subjectRef === subject);
  if (matches.length === 0) return Object.freeze({ outcome: "not_found" });
  if (matches.length !== 1) return Object.freeze({ outcome: "ambiguous" });
  if (expectedAccountRef !== undefined && matches[0].accountRef !== expectedAccountRef) {
    return Object.freeze({ outcome: "account_mismatch" });
  }
  return Object.freeze({ outcome: "resolved", accountRef: matches[0].accountRef });
}

export function planD1IdentityBinding({ existingBindings, incomingRecord } = {}) {
  if (!Array.isArray(existingBindings)) throw fail("identity_bindings_invalid");
  const incoming = createD1IdentityBindingRecord(incomingRecord);
  if (incoming.status !== "active") throw fail("identity_binding_new_record_must_be_active");
  const existing = existingBindings.map((record) => createD1IdentityBindingRecord(record))
    .filter((record) => record.status === "active");
  const sameSubject = existing.filter((record) => record.issuerRef === incoming.issuerRef
    && record.subjectRef === incoming.subjectRef);
  if (sameSubject.length > 1) return Object.freeze({ outcome: "ambiguous_existing_subject" });
  if (sameSubject.length === 1) {
    return sameSubject[0].accountRef === incoming.accountRef
      ? Object.freeze({ outcome: "already_bound", accountRef: incoming.accountRef })
      : Object.freeze({ outcome: "subject_bound_to_other_account" });
  }
  const sameAccount = existing.filter((record) => record.accountRef === incoming.accountRef);
  if (sameAccount.length > 0) return Object.freeze({ outcome: "account_already_bound" });
  return Object.freeze({ outcome: "create", record: incoming });
}
