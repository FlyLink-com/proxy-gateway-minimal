const INPUT_KEYS = Object.freeze([
  "accountRef",
  "legacyVerifierSucceeded",
  "observedAtMs",
  "submittedPassword"
]);
const OBSERVATION_KEYS = Object.freeze([
  "accountRef",
  "bucket",
  "edgeWhitespace",
  "observedAtMs"
]);
const ACCOUNT_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const PASSWORD_LIMIT_BYTES = 72;

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

function hasExactDataKeys(value, expectedKeys) {
  if (!isPlainRecord(value) || Object.getOwnPropertySymbols(value).length !== 0) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors).sort();
  const expected = [...expectedKeys].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) return false;
  return keys.every((key) => Object.hasOwn(descriptors[key], "value") && descriptors[key].enumerable === true);
}

function requireAccountRef(value) {
  if (typeof value !== "string" || !ACCOUNT_REF_PATTERN.test(value) || value.includes("@")) {
    throw fail("proof_window_account_ref_invalid");
  }
  return value;
}

function requireObservedAtMs(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw fail("proof_window_timestamp_invalid");
  return value;
}

/**
 * Create a data-minimized observation only after the existing legacy verifier succeeds.
 * The byte bucket is calculated from the same trim-only normalized string used by
 * the current Portal password verifier. This helper performs no persistence and
 * must not be wired into production until the Risk A owner decisions are approved.
 */
export function createLegacyLoginProofWindowObservation(input = {}) {
  if (!hasExactDataKeys(input, INPUT_KEYS)) throw fail("proof_window_input_invalid");

  const {
    accountRef,
    legacyVerifierSucceeded,
    observedAtMs,
    submittedPassword
  } = input;

  if (legacyVerifierSucceeded !== true) return null;
  const safeAccountRef = requireAccountRef(accountRef);
  if (typeof submittedPassword !== "string") throw fail("proof_window_password_input_invalid");

  // Match the current source contract: String(password).trim(), with no lowercasing,
  // Unicode normalization, internal-space folding, or truncation.
  const normalizedPassword = submittedPassword.trim();
  if (!normalizedPassword) throw fail("proof_window_password_input_invalid");
  const bucket = Buffer.byteLength(normalizedPassword, "utf8") > PASSWORD_LIMIT_BYTES
    ? "gt_72"
    : "le_72";

  return Object.freeze({
    accountRef: safeAccountRef,
    bucket,
    edgeWhitespace: submittedPassword !== normalizedPassword,
    observedAtMs: requireObservedAtMs(observedAtMs)
  });
}

/** Validate the exact minimal record shape before any future persistence adapter. */
export function validateLegacyLoginProofWindowObservation(value) {
  if (!hasExactDataKeys(value, OBSERVATION_KEYS)) throw fail("proof_window_observation_invalid");
  const accountRef = requireAccountRef(value.accountRef);
  if (value.bucket !== "le_72" && value.bucket !== "gt_72") {
    throw fail("proof_window_bucket_invalid");
  }
  if (typeof value.edgeWhitespace !== "boolean") throw fail("proof_window_edge_whitespace_invalid");
  const observedAtMs = requireObservedAtMs(value.observedAtMs);
  return Object.freeze({ accountRef, bucket: value.bucket, edgeWhitespace: value.edgeWhitespace, observedAtMs });
}

export const LEGACY_LOGIN_PROOF_WINDOW_CONTRACT = Object.freeze({
  passwordLimitBytes: PASSWORD_LIMIT_BYTES,
  normalization: "trim-only",
  buckets: Object.freeze(["le_72", "gt_72"]),
  observationFields: OBSERVATION_KEYS
});
