// Option A (selected by Yi, 2026-11-08): pre-migration login attestation window.
//
// LOCAL SYNTHETIC IMPLEMENTATION of the design in ATTESTATION_WINDOW_DESIGN_V1.md.
// Not wired to any production login path. The production change is Risk A and
// requires a separate gate package.
//
// Core invariants implemented here:
// - Measurement happens only on a password the user has just presented AND
//   that has already verified successfully (the recorder is invoked strictly
//   after verification by the caller; this module never verifies anything).
// - Only a coarse bucket is persisted. Exact byte counts exist only in the
//   transient measurement result and are never written to the store.
// - The persisted record has an exact key set. Passwords, password hashes,
//   exact lengths, and password fragments are structurally unable to enter it.
// - A missing record classifies as unknown_hold — never as importable.

import { BCRYPT_INPUT_WINDOW_BYTES, utf8ByteLength } from "./auth0-scrypt-import-validator.mjs";

const ACCOUNT_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const RECORD_KEYS = Object.freeze(["accountRef", "attestedAtMs", "bucket", "edgeWhitespace"]);
export const ATTESTATION_BUCKETS = Object.freeze(["within_72", "over_72"]);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

// Transient measurement of a just-presented password. The returned exact
// counts are for the caller's immediate decision-making ONLY and must never
// be persisted; buildAttestationRecord below is the only persistence shape.
export function measurePresentedPassword(presentedPassword) {
  if (typeof presentedPassword !== "string") throw fail("attestation_password_not_string");
  const trimmed = presentedPassword.trim();
  return Object.freeze({
    rawUtf8Bytes: utf8ByteLength(presentedPassword),
    trimmedUtf8Bytes: utf8ByteLength(trimmed),
    edgeWhitespace: trimmed !== presentedPassword
  });
}

export function bucketForTrimmedBytes(trimmedUtf8Bytes) {
  return trimmedUtf8Bytes > BCRYPT_INPUT_WINDOW_BYTES ? "over_72" : "within_72";
}

export function buildAttestationRecord({ accountRef, presentedPassword, attestedAtMs } = {}) {
  if (typeof accountRef !== "string" || !ACCOUNT_REF_PATTERN.test(accountRef)) {
    throw fail("attestation_account_ref_invalid");
  }
  if (!Number.isSafeInteger(attestedAtMs) || attestedAtMs < 0) throw fail("attestation_timestamp_invalid");
  const measurement = measurePresentedPassword(presentedPassword);
  if (measurement.trimmedUtf8Bytes === 0) {
    // A successful legacy login cannot have an empty-after-trim password:
    // enrollment and verification both reject it. Attestation is not applicable.
    throw fail("attestation_not_applicable");
  }
  const record = Object.freeze({
    accountRef,
    bucket: bucketForTrimmedBytes(measurement.trimmedUtf8Bytes),
    edgeWhitespace: measurement.edgeWhitespace,
    attestedAtMs
  });
  assertAttestationRecordShape(record);
  return record;
}

// Exact-shape enforcement: the record may contain ONLY the four allowed keys,
// with the bucket restricted to its enum and no numeric field other than the
// timestamp. Anything else — an exact length, a hash, a fragment — fails.
export function assertAttestationRecordShape(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) throw fail("attestation_record_invalid");
  const keys = Object.keys(record).sort();
  const expected = [...RECORD_KEYS].sort();
  if (keys.length !== expected.length || keys.some((key, i) => key !== expected[i])) {
    throw fail("attestation_record_keys_invalid");
  }
  if (typeof record.accountRef !== "string" || !ACCOUNT_REF_PATTERN.test(record.accountRef)) {
    throw fail("attestation_record_invalid");
  }
  if (!ATTESTATION_BUCKETS.includes(record.bucket)) throw fail("attestation_record_invalid");
  if (typeof record.edgeWhitespace !== "boolean") throw fail("attestation_record_invalid");
  if (!Number.isSafeInteger(record.attestedAtMs) || record.attestedAtMs < 0) throw fail("attestation_record_invalid");
  return true;
}

// Test/audit helper: prove a persisted record carries none of the forbidden
// material. Scans the serialized record for any supplied secret string.
export function assertRecordContainsNoSecrets(record, secrets) {
  assertAttestationRecordShape(record);
  const serialized = JSON.stringify(record);
  for (const secret of secrets) {
    if (typeof secret === "string" && secret.length > 0 && serialized.includes(secret)) {
      throw fail("attestation_record_contains_secret");
    }
  }
  return true;
}

// Migration classification for one account, from its attestation record.
export function classifyAttestationRecord(record) {
  if (record === undefined || record === null) {
    return Object.freeze({ eligibility: "unknown_hold", advisories: Object.freeze([]) });
  }
  assertAttestationRecordShape(record);
  if (record.bucket === "over_72") {
    return Object.freeze({ eligibility: "targeted_reset", advisories: Object.freeze([]) });
  }
  if (record.edgeWhitespace) {
    // R1 trim-only policy is approved. Keep this cohort fail-closed until
    // Browser/Android/Admin prove that normalization happens before Auth0.
    return Object.freeze({
      eligibility: "r1_implementation_proof_hold",
      advisories: Object.freeze(["edge_whitespace_client_compatibility_proof_required"])
    });
  }
  return Object.freeze({ eligibility: "importable", advisories: Object.freeze([]) });
}

// Recorder over a caller-supplied store (Map-like). Latest successful login
// wins: a new record replaces the previous one wholesale, so no length
// history accumulates. A failed attestation write must never fail the login
// itself — callers wrap recordSuccessfulLogin accordingly; classification
// then simply stays unknown_hold (fail-closed for migration, open for login).
export function createAttestationRecorder({ store, nowFn = () => Date.now() } = {}) {
  if (!store || typeof store.get !== "function" || typeof store.set !== "function") {
    throw fail("attestation_store_invalid");
  }
  return Object.freeze({
    recordSuccessfulLogin(accountRef, presentedPassword) {
      const record = buildAttestationRecord({ accountRef, presentedPassword, attestedAtMs: nowFn() });
      store.set(accountRef, record);
      return record;
    },
    getRecord(accountRef) {
      return store.get(accountRef);
    },
    classify(accountRef) {
      return classifyAttestationRecord(store.get(accountRef));
    }
  });
}
