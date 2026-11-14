// Opaque credential references for the D1 credential contract (M1 B2-4a, G-07 / C-07).
//
// Version 1 is the shape production already mints; this module documents and
// validates it, it does not mint a new format and does not change any login,
// enrollment, or credential-store behaviour. A reference is opaque, versioned,
// namespaced, and attributable, and it never carries email, a username, a URL,
// a bearer token, credential material, or an unkeyed low-entropy digest.
//
//   portal_pwd_   + 24 lowercase hex   (portal password credentials)
//   portal_totp_  + 24 lowercase hex   (portal TOTP credentials)
//   admin_totp_   + UUID               (admin TOTP credentials)
//
// The factories are the single minters: `portal_pwd_` in
// portal-password-credentials.mjs, `portal_totp_` via defaultRef() in
// user-portal-auth.mjs, `admin_totp_` via randomUUID() in admin-auth.mjs.
// Passkey credential_id values are authenticator-issued, not platform refs,
// and are out of scope here.
//
// validateD1CredentialRow() is the gate a D1-shaped credential row must pass
// before it may be treated as a D1 record: only the approved non-secret
// lifecycle fields, no secret material under any key, and fail-closed on
// inconsistent state. It does not read or write any store. The production
// credential tables still hold password_hash / encrypted_totp_secret today
// (D-09 DEFER / D-10 EXTERNALIZE are proposals, not approvals), so a raw
// store row must be projected (secret columns stripped) before it can pass
// this gate; the projection mapping is id -> reference, accountId ->
// accountRef. No DDL is created or changed by this module.

export const CREDENTIAL_REF_VERSION = 1;

export const CREDENTIAL_REF_NAMESPACES = Object.freeze({
  PORTAL_PASSWORD: "portal_pwd",
  PORTAL_TOTP: "portal_totp",
  ADMIN_TOTP: "admin_totp"
});

const RANDOM_HEX_24 = /^[0-9a-f]{24}$/u;
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

const NAMESPACE_RANDOM_PATTERN = Object.freeze({
  portal_pwd: RANDOM_HEX_24,
  portal_totp: RANDOM_HEX_24,
  admin_totp: UUID_SHAPE
});

// Keys that must never appear in a D1 credential row. The guard rejects any
// key outside the approved set, but these get their own error so a secret
// leak is named as one instead of looking like a typo.
const SECRET_FIELD_NAMES = Object.freeze(new Set([
  "passwordHash", "password_hash",
  "encryptedTotpSecret", "encrypted_totp_secret",
  "secret", "totpSecret", "totp_secret",
  "bearer", "bearerToken", "bearer_token",
  "token", "accessToken", "access_token",
  "blob", "encryptedBlob", "encrypted_blob",
  "publicKey", "public_key", "publicKeyJwk", "public_key_jwk_json",
  "privateKey", "private_key",
  "jwk", "credentialId", "credential_id",
  "credentialIdHash", "credential_id_hash"
]));

const D1_CREDENTIAL_ROW_FIELDS = Object.freeze([
  "reference", "accountRef", "status", "failureCount",
  "lockedUntil", "enrolledAt", "createdAt",
  "lastVerifiedAt", "revokedAt", "mustRotate", "updatedAt"
]);

const CREDENTIAL_ROW_STATUSES = Object.freeze(new Set(["active", "revoked", "locked"]));

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

// Parse an opaque credential reference. Returns a frozen
// { namespace, version, randomPart }. Any unknown namespace, unknown shape,
// or material that looks like an identifier, URL, token, or secret is
// rejected: a future version must be added here explicitly, never silently
// reinterpreted as v1.
export function parseCredentialRef(ref) {
  if (typeof ref !== "string" || ref.length === 0) throw fail("credential_ref_invalid");
  if (ref.includes("@") || ref.includes("/") || ref.includes(":") || ref.includes(" ")
    || ref.toLowerCase().includes("bearer")) {
    throw fail("credential_ref_invalid");
  }
  const underscore = ref.indexOf("_");
  if (underscore <= 0) throw fail("credential_ref_invalid");
  // Namespaces themselves contain one underscore (portal_pwd, portal_totp,
  // admin_totp), so split on the second underscore.
  const second = ref.indexOf("_", underscore + 1);
  if (second <= 0) throw fail("credential_ref_invalid");
  const namespace = ref.slice(0, second);
  const randomPart = ref.slice(second + 1);
  const pattern = NAMESPACE_RANDOM_PATTERN[namespace];
  if (!pattern || !pattern.test(randomPart)) throw fail("credential_ref_invalid");
  return Object.freeze({ namespace, version: CREDENTIAL_REF_VERSION, randomPart });
}

export function isValidCredentialRef(ref) {
  try {
    parseCredentialRef(ref);
    return true;
  } catch {
    return false;
  }
}

const CANONICAL_ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function requireIsoText(value, code) {
  if (value === null || value === undefined) return null;
  if (
    typeof value !== "string"
    || !CANONICAL_ISO_TIMESTAMP_PATTERN.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value
  ) {
    throw fail(code);
  }
  return value;
}

const ACCOUNT_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const ACCOUNT_REF_SECRET_LIKE_PATTERN =
  /(?:^|[_-])(?:bearer|token|secret|credential|password|private|customer)(?:[_-]|$)|^sk[-_]|^eyj[a-z0-9_-]{10,}$/iu;

function requireOpaqueAccountRef(value, code) {
  if (
    typeof value !== "string"
    || value.trim() !== value
    || !ACCOUNT_REF_PATTERN.test(value)
    || ACCOUNT_REF_SECRET_LIKE_PATTERN.test(value)
  ) {
    throw fail(code);
  }
  return value;
}

function requireFailureCount(value, code) {
  if (!Number.isSafeInteger(value) || value < 0) throw fail(code);
  return value;
}

// Validate a D1-shaped credential row (projection, not a raw store row).
// Required: reference (a v1 opaque ref), accountRef (opaque, no email),
// status (active | revoked | locked), failureCount (integer >= 0).
// Optional lifecycle facts: lockedUntil, enrolledAt, createdAt,
// lastVerifiedAt, revokedAt, mustRotate (boolean, or 0 | 1), updatedAt.
// Rejects: any secret-material key, any unknown key, a bad timestamp, and
// an active row carrying revokedAt. A revoked row without revokedAt is
// allowed: status is authoritative and the store API permits it.
export function validateD1CredentialRow(input) {
  if (!isPlainRecord(input)) throw fail("credential_row_invalid");
  for (const key of Object.keys(input)) {
    if (SECRET_FIELD_NAMES.has(key)) throw fail("credential_row_secret_field");
    if (!D1_CREDENTIAL_ROW_FIELDS.includes(key)) throw fail("credential_row_unknown_field");
  }
  const reference = parseCredentialRef(input.reference);
  const accountRef = requireOpaqueAccountRef(input.accountRef, "credential_row_invalid");
  if (!CREDENTIAL_ROW_STATUSES.has(input.status)) throw fail("credential_row_invalid");
  const failureCount = requireFailureCount(input.failureCount, "credential_row_invalid");
  const lockedUntil = requireIsoText(input.lockedUntil ?? null, "credential_row_invalid");
  const enrolledAt = requireIsoText(input.enrolledAt ?? null, "credential_row_invalid");
  const createdAt = requireIsoText(input.createdAt ?? null, "credential_row_invalid");
  const lastVerifiedAt = requireIsoText(input.lastVerifiedAt ?? null, "credential_row_invalid");
  const revokedAt = requireIsoText(input.revokedAt ?? null, "credential_row_invalid");
  const updatedAt = requireIsoText(input.updatedAt ?? null, "credential_row_invalid");
  let mustRotate = null;
  if (input.mustRotate !== undefined && input.mustRotate !== null) {
    // The store maps must_rotate to a boolean; the raw integer form is
    // accepted too. Anything else is not a rotation flag.
    if (input.mustRotate === 0 || input.mustRotate === false) mustRotate = false;
    else if (input.mustRotate === 1 || input.mustRotate === true) mustRotate = true;
    else throw fail("credential_row_invalid");
  }
  if (input.status === "active" && revokedAt !== null) {
    throw fail("credential_row_state_inconsistent");
  }
  return Object.freeze({
    reference: reference.namespace + "_" + reference.randomPart,
    accountRef,
    status: input.status,
    failureCount,
    lockedUntil,
    enrolledAt,
    createdAt,
    lastVerifiedAt,
    revokedAt,
    mustRotate,
    updatedAt
  });
}
