// Local synthetic validator for the C1-D01 route: Auth0 Essentials + Bulk User Import.
//
// SYNTHETIC ONLY. No Auth0 tenant, no production data, no real credentials.
// Every password in this package is a synthetic fixture invented for byte-length
// boundary testing.
//
// What this models, from verified sources:
// - Legacy (production) password hashing, replicated from
//   server/services/platform/portal-password-credentials.mjs:
//   scrypt N=32768, r=8, p=1, keylen=64, envelope
//   "scrypt$v=1$N=32768$r=8$p=1$<salt base64url>$<hash base64url>",
//   and the password is TRIMMED before hashing (requiredText inside deriveHash).
// - Auth0 bulk-import shape, from Auth0's official "User Data JSON Schema for
//   Bulk User Imports": custom_password_hash { algorithm: "scrypt",
//   hash: {value, encoding}, salt: {value, encoding},
//   password: {encoding: "utf8"}, keylen (required for scrypt), cost,
//   blockSize, parallelization }, additionalProperties: false.
// - Auth0 first-login behavior: the presented password (utf8, NOT trimmed) is
//   verified against the imported scrypt hash; on success Auth0 rehashes the
//   presented password with its own bcrypt and stores that instead.
//   The bcrypt stage lives in bcrypt-stage.mjs and uses the real bcrypt
//   primitive inside its documented 72-byte input window.

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const LEGACY_SCRYPT = Object.freeze({ N: 32768, r: 8, p: 1, keyLength: 64, maxmem: 64 * 1024 * 1024 });
export const BCRYPT_INPUT_WINDOW_BYTES = 72;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function utf8ByteLength(value) {
  return Buffer.byteLength(String(value), "utf8");
}

// Production enrollment/verification semantics (portal-password-credentials.mjs):
// the presented password is trimmed FIRST, then scrypt-hashed.
export function legacyEnroll(presentedPassword, salt = randomBytes(16)) {
  const trimmed = String(presentedPassword ?? "").trim();
  if (!trimmed) throw fail("legacy_password_empty_after_trim");
  const derived = scryptSync(trimmed, salt, LEGACY_SCRYPT.keyLength, {
    N: LEGACY_SCRYPT.N, r: LEGACY_SCRYPT.r, p: LEGACY_SCRYPT.p, maxmem: LEGACY_SCRYPT.maxmem
  });
  return [
    "scrypt", "v=1",
    `N=${LEGACY_SCRYPT.N}`, `r=${LEGACY_SCRYPT.r}`, `p=${LEGACY_SCRYPT.p}`,
    Buffer.from(salt).toString("base64url"),
    derived.toString("base64url")
  ].join("$");
}

function decodeCanonicalBase64Url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/u.test(value)) return null;
  const decoded = Buffer.from(value, "base64url");
  if (decoded.length === 0 || decoded.toString("base64url") !== value) return null;
  return decoded;
}

export function parseLegacyEnvelope(envelope) {
  const parts = String(envelope ?? "").split("$");
  if (parts.length !== 7 || parts[0] !== "scrypt" || parts[1] !== "v=1"
    || parts[2] !== "N=" + LEGACY_SCRYPT.N || parts[3] !== "r=" + LEGACY_SCRYPT.r
    || parts[4] !== "p=" + LEGACY_SCRYPT.p) {
    throw fail("legacy_scrypt_hash_invalid");
  }
  const salt = decodeCanonicalBase64Url(parts[5]);
  const hash = decodeCanonicalBase64Url(parts[6]);
  // The legacy service creates a 16-byte random salt and a 64-byte Scrypt result.
  // Reject Node Buffer's permissive base64url decoding of malformed/noncanonical input.
  if (!salt || salt.length !== 16 || !hash || hash.length !== LEGACY_SCRYPT.keyLength) {
    throw fail("legacy_scrypt_hash_invalid");
  }
  return { N: LEGACY_SCRYPT.N, r: LEGACY_SCRYPT.r, p: LEGACY_SCRYPT.p, keylen: hash.length, salt, hash };
}

// Repo envelope (base64url parts) -> Auth0 custom_password_hash object.
// Pure field mapping: salt and hash bytes are preserved exactly, re-encoded
// as standard base64, which the Auth0 schema accepts (encoding: "base64").
export function toAuth0CustomPasswordHash(envelope) {
  const parsed = parseLegacyEnvelope(envelope);
  return {
    algorithm: "scrypt",
    hash: { value: parsed.hash.toString("base64"), encoding: "base64" },
    salt: { value: parsed.salt.toString("base64"), encoding: "base64" },
    password: { encoding: "utf8" },
    keylen: parsed.keylen,
    cost: parsed.N,
    blockSize: parsed.r,
    parallelization: parsed.p
  };
}

// Strictly validate the Auth0 custom_password_hash object used by this route.
// The outer and nested objects have exact key sets; required salt/password
// properties and their encodings must be present before a test can claim
// that the generated object matches the import contract.
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
  return isRecord(value)
    && Object.keys(value).sort().join(",") === [...expected].sort().join(",");
}

function decodeAuth0Bytes(field) {
  if (!isRecord(field) || typeof field.value !== "string" || field.value.length === 0) return null;
  if (field.encoding === "base64") {
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(field.value)) return null;
    const bytes = Buffer.from(field.value, "base64");
    return bytes.length > 0 && bytes.toString("base64") === field.value ? bytes : null;
  }
  if (field.encoding === "hex") {
    if (!/^(?:[0-9a-fA-F]{2})+$/u.test(field.value)) return null;
    return Buffer.from(field.value, "hex");
  }
  if (field.encoding === "utf8") return Buffer.from(field.value, "utf8");
  return null;
}

export function validateAuth0ScryptObject(obj) {
  const required = ["algorithm", "hash", "salt", "password", "keylen", "cost", "blockSize", "parallelization"];
  if (!hasExactKeys(obj, required)) throw fail("auth0_object_shape_invalid");
  if (obj.algorithm !== "scrypt") throw fail("auth0_object_algorithm_invalid");
  if (!hasExactKeys(obj.hash, ["value", "encoding"])) throw fail("auth0_object_hash_invalid");
  if (!hasExactKeys(obj.salt, ["value", "encoding"])) throw fail("auth0_object_salt_invalid");
  if (!hasExactKeys(obj.password, ["encoding"]) || obj.password.encoding !== "utf8") {
    throw fail("auth0_object_password_encoding_invalid");
  }
  if (!Number.isInteger(obj.keylen) || obj.keylen <= 0) throw fail("auth0_object_keylen_required");
  if (!Number.isInteger(obj.cost) || obj.cost <= 1 || (obj.cost & (obj.cost - 1)) !== 0) throw fail("auth0_object_cost_invalid");
  if (!Number.isInteger(obj.blockSize) || obj.blockSize <= 0) throw fail("auth0_object_block_size_invalid");
  if (!Number.isInteger(obj.parallelization) || obj.parallelization <= 0) throw fail("auth0_object_parallelization_invalid");
  const hash = decodeAuth0Bytes(obj.hash);
  const salt = decodeAuth0Bytes(obj.salt);
  if (!hash || hash.length !== obj.keylen || !salt) throw fail("auth0_object_material_invalid");
  return true;
}

// Auth0-side first-login verification against the imported scrypt hash.
// Auth0 does NOT trim: the presented password is used exactly as typed
// (transcoded from utf8 per password.encoding).
export function simulateAuth0ScryptVerify(auth0Object, presentedPassword) {
  validateAuth0ScryptObject(auth0Object);
  const salt = decodeAuth0Bytes(auth0Object.salt);
  const expected = decodeAuth0Bytes(auth0Object.hash);
  const derived = scryptSync(String(presentedPassword ?? ""), salt, auth0Object.keylen, {
    N: auth0Object.cost, r: auth0Object.blockSize, p: auth0Object.parallelization, maxmem: LEGACY_SCRYPT.maxmem
  });
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

// Classification with an ATTESTED byte length (known only in synthetic
// fixtures, or in production solely via a future approved attestation flow).
export function classifyByAttestedUtf8Bytes(attestedBytes) {
  if (attestedBytes === null || attestedBytes === undefined) return "unknown_length_unattested";
  if (!Number.isSafeInteger(attestedBytes) || attestedBytes < 0) throw fail("attested_length_invalid");
  return attestedBytes > BCRYPT_INPUT_WINDOW_BYTES ? "reset_required" : "importable";
}

// Yi's key constraint, encoded: from the stored envelope ALONE, the original
// password's byte length is unknowable. The envelope exposes only the fixed
// parameters, the salt, and the fixed-length derived hash. This function
// therefore can never return a length-based verdict.
export function classifyFromEnvelopeOnly(envelope) {
  parseLegacyEnvelope(envelope); // well-formedness only; reveals nothing about length
  return "unknown_length_unattested";
}

// The import gate. Fail-closed on both over-72 (would be silently re-semantified
// or hard-fail at Auth0's bcrypt rehash) and unattested length (cannot prove
// the account is safe to import). Producing an Auth0 object requires an
// attested length of at most 72 bytes.
export function planImport({ envelope, attestedUtf8Bytes = null } = {}) {
  const classification = classifyByAttestedUtf8Bytes(attestedUtf8Bytes);
  if (classification === "reset_required") {
    return Object.freeze({ action: "targeted_reset", classification });
  }
  if (classification === "unknown_length_unattested") {
    return Object.freeze({ action: "hold_no_attestation", classification });
  }
  return Object.freeze({ action: "import", classification, auth0: toAuth0CustomPasswordHash(envelope) });
}
