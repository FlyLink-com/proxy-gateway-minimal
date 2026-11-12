// Synthetic tests for the Option A login attestation window (design V1).
// All passwords are synthetic fixtures. No production path is touched.
import test from "node:test";
import assert from "node:assert/strict";
import {
  measurePresentedPassword, buildAttestationRecord, assertAttestationRecordShape,
  assertRecordContainsNoSecrets, classifyAttestationRecord, createAttestationRecorder
} from "./login-attestation.mjs";

const T0 = 1794000000000;
const recorder = () => createAttestationRecorder({ store: new Map(), nowFn: () => T0 });

test("normal password: within_72, no edge flag, importable, exact record shape", () => {
  const rec = recorder();
  const record = rec.recordSuccessfulLogin("acct-001", "synthetic-normal-pw");
  assert.deepEqual(Object.keys(record).sort(), ["accountRef", "attestedAtMs", "bucket", "edgeWhitespace"]);
  assert.equal(record.bucket, "within_72");
  assert.equal(record.edgeWhitespace, false);
  assert.equal(record.attestedAtMs, T0);
  assert.deepEqual(rec.classify("acct-001"), { eligibility: "importable", advisories: [] });
});

test("over-72 effective password: over_72 bucket, targeted reset", () => {
  const rec = recorder();
  rec.recordSuccessfulLogin("acct-002", "x".repeat(90));
  assert.equal(rec.getRecord("acct-002").bucket, "over_72");
  assert.equal(rec.classify("acct-002").eligibility, "targeted_reset");
});

test("edge whitespace with raw over 72 but trimmed within: bucket uses effective bytes, migration holds pending cross-client R1 proof", () => {
  const padded = " ".repeat(40) + "shortpw" + " ".repeat(40); // raw 87 bytes, trimmed 7 bytes
  const measurement = measurePresentedPassword(padded);
  assert.equal(measurement.rawUtf8Bytes, 87);
  assert.equal(measurement.trimmedUtf8Bytes, 7);
  assert.equal(measurement.edgeWhitespace, true);
  const rec = recorder();
  const record = rec.recordSuccessfulLogin("acct-003", padded);
  assert.equal(record.bucket, "within_72");
  assert.deepEqual(rec.classify("acct-003"), {
    eligibility: "r1_implementation_proof_hold",
    advisories: ["edge_whitespace_client_compatibility_proof_required"]
  });
});

test("Chinese password over 72 bytes attests over_72 (byte semantics)", () => {
  const rec = recorder();
  rec.recordSuccessfulLogin("acct-004", "飞".repeat(25)); // 75 bytes
  assert.equal(rec.classify("acct-004").eligibility, "targeted_reset");
});

test("unknown account (no attestation) classifies unknown_hold, never importable", () => {
  const rec = recorder();
  assert.equal(rec.getRecord("acct-never"), undefined);
  assert.deepEqual(rec.classify("acct-never"), { eligibility: "unknown_hold", advisories: [] });
  assert.equal(classifyAttestationRecord(undefined).eligibility, "unknown_hold");
});

test("persisted record contains no password, no fragment, and no exact byte counts", () => {
  const pw = "z".repeat(80) + "-tail-fragment";
  const rec = recorder();
  const record = rec.recordSuccessfulLogin("acct-005", pw);
  assert.equal(assertRecordContainsNoSecrets(record, [pw, pw.trim(), "tail-fragment"]), true);
  const numericValues = Object.values(record).filter((v) => typeof v === "number");
  assert.deepEqual(numericValues, [T0], "the only numeric field is the timestamp — no exact lengths");
});

test("a record smuggling an exact length or any extra key is rejected by the shape gate", () => {
  const good = buildAttestationRecord({ accountRef: "acct-006", presentedPassword: "pw", attestedAtMs: T0 });
  assert.equal(assertAttestationRecordShape(good), true);
  assert.throws(() => assertAttestationRecordShape({ ...good, passwordLength: 42 }), /attestation_record_keys_invalid/);
  assert.throws(() => assertAttestationRecordShape({ ...good, bucket: "exactly_81_bytes" }), /attestation_record_invalid/);
  assert.throws(() => classifyAttestationRecord({ ...good, hash: "deadbeef" }), /attestation_record_keys_invalid/);
});

test("latest successful login wins: password change replaces the record, no history accumulates", () => {
  const store = new Map();
  let now = T0;
  const rec = createAttestationRecorder({ store, nowFn: () => now });
  rec.recordSuccessfulLogin("acct-007", "short-pw");
  assert.equal(rec.getRecord("acct-007").bucket, "within_72");
  now = T0 + 60000;
  rec.recordSuccessfulLogin("acct-007", "y".repeat(100)); // user changed to an over-72 password
  const record = rec.getRecord("acct-007");
  assert.equal(record.bucket, "over_72");
  assert.equal(record.attestedAtMs, T0 + 60000);
  assert.equal(store.size, 1, "still exactly one record for the account");
});

test("empty-after-trim or non-string presentations cannot attest (they could never have verified)", () => {
  const rec = recorder();
  assert.throws(() => rec.recordSuccessfulLogin("acct-008", "   "), /attestation_not_applicable/);
  assert.throws(() => rec.recordSuccessfulLogin("acct-008", 42), /attestation_password_not_string/);
  assert.equal(rec.getRecord("acct-008"), undefined, "no record was written");
});
