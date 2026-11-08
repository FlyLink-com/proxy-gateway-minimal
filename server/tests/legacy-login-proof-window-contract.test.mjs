import assert from "node:assert/strict";
import test from "node:test";
import {
  createLegacyLoginProofWindowObservation,
  LEGACY_LOGIN_PROOF_WINDOW_CONTRACT,
  validateLegacyLoginProofWindowObservation
} from "../services/platform/legacy-login-proof-window-contract.mjs";

const NOW = 1_798_000_000_000;

function observe(submittedPassword, overrides = {}) {
  return createLegacyLoginProofWindowObservation({
    accountRef: "acct_synthetic_001",
    legacyVerifierSucceeded: true,
    observedAtMs: NOW,
    submittedPassword,
    ...overrides
  });
}

test("only a successful legacy password verification creates an observation", () => {
  assert.equal(createLegacyLoginProofWindowObservation({
    accountRef: "acct_synthetic_001",
    legacyVerifierSucceeded: false,
    observedAtMs: NOW,
    submittedPassword: 12345
  }), null);
});

test("72 and 73 ASCII UTF-8 bytes fall on opposite sides of the approved bucket boundary", () => {
  assert.equal(observe("a".repeat(72)).bucket, "le_72");
  assert.equal(observe("a".repeat(73)).bucket, "gt_72");
});

test("multibyte UTF-8 passwords are bucketed by bytes rather than character count", () => {
  assert.equal(observe("中".repeat(24)).bucket, "le_72");
  assert.equal(observe("中".repeat(25)).bucket, "gt_72");
});

test("normalization is trim-only and records only an edge-whitespace boolean", () => {
  const record = observe("  Alpha Beta  ");
  assert.equal(record.bucket, "le_72");
  assert.equal(record.edgeWhitespace, true);
  assert.deepEqual(Object.keys(record).sort(), [
    "accountRef", "bucket", "edgeWhitespace", "observedAtMs"
  ]);
  assert.equal(JSON.stringify(record).includes("Alpha"), false);
  assert.equal(JSON.stringify(record).includes("Alpha Beta"), false);
});

test("no Unicode normalization or internal whitespace folding is applied", () => {
  const composed = observe("é".repeat(36));
  const decomposed = observe("e\\u0301".repeat(36));
  assert.equal(composed.bucket, "le_72");
  assert.equal(decomposed.bucket, "gt_72");
  assert.equal(observe("a".repeat(36) + " " + "a".repeat(35)).bucket, "le_72");
});

test("observation contains no password, exact byte length, hash or email field", () => {
  const raw = "Synthetic-Only-Password-For-Test";
  const record = observe(raw);
  assert.equal(Object.hasOwn(record, "password"), false);
  assert.equal(Object.hasOwn(record, "passwordHash"), false);
  assert.equal(Object.hasOwn(record, "utf8Bytes"), false);
  assert.equal(Object.hasOwn(record, "email"), false);
  assert.equal(JSON.stringify(record).includes(raw), false);
  assert.equal(Object.isFrozen(record), true);
});

test("input shape rejects accidental PII, credential and unknown fields", () => {
  assert.throws(() => createLegacyLoginProofWindowObservation({
    accountRef: "acct_synthetic_001",
    legacyVerifierSucceeded: true,
    observedAtMs: NOW,
    submittedPassword: "Synthetic-Only-Password",
    email: "person@example.test"
  }), /proof_window_input_invalid/);
  assert.throws(() => createLegacyLoginProofWindowObservation({
    accountRef: "acct_synthetic_001",
    legacyVerifierSucceeded: true,
    observedAtMs: NOW,
    submittedPassword: "Synthetic-Only-Password",
    passwordHash: "synthetic-hash"
  }), /proof_window_input_invalid/);
});

test("email-shaped account references are rejected", () => {
  assert.throws(() => observe("synthetic", { accountRef: "person@example.test" }), /proof_window_account_ref_invalid/);
});

test("non-string and empty passwords fail closed after successful verification", () => {
  assert.throws(() => observe(12345), /proof_window_password_input_invalid/);
  assert.throws(() => observe("  \t  "), /proof_window_password_input_invalid/);
});

test("timestamps must be non-negative safe integer milliseconds", () => {
  assert.throws(() => observe("synthetic", { observedAtMs: -1 }), /proof_window_timestamp_invalid/);
  assert.throws(() => observe("synthetic", { observedAtMs: 1.5 }), /proof_window_timestamp_invalid/);
  assert.throws(() => observe("synthetic", { observedAtMs: Number.MAX_SAFE_INTEGER + 1 }), /proof_window_timestamp_invalid/);
});

test("observation validator accepts only the four-field minimal record", () => {
  const record = observe("synthetic");
  const validated = validateLegacyLoginProofWindowObservation(record);
  assert.deepEqual(validated, record);
  assert.equal(Object.isFrozen(validated), true);
  assert.throws(() => validateLegacyLoginProofWindowObservation({ ...record, password: "leak" }), /proof_window_observation_invalid/);
  assert.throws(() => validateLegacyLoginProofWindowObservation({ ...record, bucket: "72" }), /proof_window_bucket_invalid/);
  assert.throws(() => validateLegacyLoginProofWindowObservation({ ...record, edgeWhitespace: 1 }), /proof_window_edge_whitespace_invalid/);
});

test("contract advertises only coarse buckets and trim-only normalization", () => {
  assert.equal(LEGACY_LOGIN_PROOF_WINDOW_CONTRACT.passwordLimitBytes, 72);
  assert.equal(LEGACY_LOGIN_PROOF_WINDOW_CONTRACT.normalization, "trim-only");
  assert.deepEqual(LEGACY_LOGIN_PROOF_WINDOW_CONTRACT.buckets, ["le_72", "gt_72"]);
  assert.deepEqual(LEGACY_LOGIN_PROOF_WINDOW_CONTRACT.observationFields, [
    "accountRef", "bucket", "edgeWhitespace", "observedAtMs"
  ]);
});
