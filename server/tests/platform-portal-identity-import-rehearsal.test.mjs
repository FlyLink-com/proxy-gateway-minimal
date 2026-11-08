import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTH0_BCRYPT_MAX_PASSWORD_BYTES,
  AUTH0_BCRYPT_OVERFLOW_POLICY,
  PORTAL_PASSWORD_INPUT_MAX_CHARS,
  PORTAL_SCRYPT_HASH_MAX_CHARS,
  SYNTHETIC_PORTAL_IDENTITY_FIXTURE,
  classifyAuth0FirstLoginPassword,
  classifySyntheticLegacyTotpDisposition,
  createSyntheticAuth0BulkImportRecord,
  evaluateSyntheticAuth0FirstLoginPassword,
  normalizePortalPasswordForIdentity,
  mergeAuth0AppMetadata,
  parsePortalScryptPasswordHash,
  planSyntheticAuth0BulkImport,
  resumeSyntheticAuth0BulkImport,
  runSyntheticPortalIdentityImportRehearsal,
  verifyPortalScryptPassword
} from "../services/platform/portal-identity-import-rehearsal.mjs";

const fixture = SYNTHETIC_PORTAL_IDENTITY_FIXTURE;

function buildRecord(overrides = {}) {
  return createSyntheticAuth0BulkImportRecord({
    email: fixture.email,
    emailVerified: fixture.emailVerified,
    userId: fixture.userId,
    accountRef: fixture.accountRef,
    passwordHash: fixture.passwordHash,
    ...overrides
  });
}

test("synthetic identity rehearsal passes locally and emits a redacted receipt only", () => {
  const receipt = runSyntheticPortalIdentityImportRehearsal();
  assert.equal(receipt.result, "PASS_LOCAL_SYNTHETIC_ONLY");
  assert.equal(receipt.scope, "synthetic-only");
  assert.equal(receipt.password.independentPythonVectorMatched, true);
  assert.equal(receipt.password.correctPasswordAccepted, true);
  assert.equal(receipt.password.wrongPasswordRejected, true);
  assert.equal(receipt.totp.importFactorIncluded, false);
  assert.equal(receipt.totp.legacyEncDisposition, "RE_ENROLL_REQUIRED");
  assert.equal(receipt.totp.legacyEncIsCiphertext, false);
  assert.equal(receipt.totp.protectedV2Disposition, "BLOCKED_PENDING_C2_KEY_CUSTODY");
  assert.equal(receipt.totp.secretMaterialIncluded, false);
  assert.ok(receipt.notRun.includes("Auth0 tenant or API import acceptance"));

  const serialized = JSON.stringify(receipt);
  for (const secret of [
    fixture.plainPassword,
    fixture.passwordHash,
    fixture.expectedHashHex,
    "ABEiM0RVZneImaq7zN3u_w",
    "JBSWY3DPEHPK3PXP",
    fixture.email
  ]) {
    assert.equal(serialized.includes(secret), false);
  }
});

test("legacy scrypt vector matches Python hashlib.scrypt and verifies current trim semantics", () => {
  const parsed = parsePortalScryptPasswordHash(fixture.passwordHash);
  assert.equal(parsed.salt.toString("hex"), "00112233445566778899aabbccddeeff");
  assert.equal(parsed.hash.toString("hex"), fixture.expectedHashHex);
  assert.equal(verifyPortalScryptPassword({ plainPassword: fixture.plainPassword, passwordHash: fixture.passwordHash }), true);
  assert.equal(verifyPortalScryptPassword({ plainPassword: " " + fixture.plainPassword + " ", passwordHash: fixture.passwordHash }), true);
  assert.equal(verifyPortalScryptPassword({ plainPassword: fixture.plainPassword + "x", passwordHash: fixture.passwordHash }), false);
  assert.equal(verifyPortalScryptPassword({ plainPassword: "   ", passwordHash: fixture.passwordHash }), false);
  for (const badPassword of [null, undefined, 42, {}, []]) {
    assert.equal(verifyPortalScryptPassword({ plainPassword: badPassword, passwordHash: fixture.passwordHash }), false);
  }
  for (const badInput of [null, 42, "not-an-input-object", []]) {
    assert.equal(verifyPortalScryptPassword(badInput), false);
  }
});

test("legacy scrypt parser fails closed for altered algorithm, parameters, encoding and digest length", () => {
  const invalid = [
    fixture.passwordHash.replace("scrypt$", "sha256$"),
    fixture.passwordHash.replace("v=1", "v=2"),
    fixture.passwordHash.replace("N=32768", "N=16384"),
    fixture.passwordHash.replace("ABEiM0RVZneImaq7zN3u_w", "ABEiM0RVZneImaq7zN3u_w="),
    fixture.passwordHash.slice(0, -1),
    fixture.passwordHash + "$extra"
  ];
  for (const candidate of invalid) {
    assert.throws(() => parsePortalScryptPasswordHash(candidate), { code: "legacy_scrypt_hash_invalid" });
    assert.equal(verifyPortalScryptPassword({ plainPassword: fixture.plainPassword, passwordHash: candidate }), false);
  }
});

test("Auth0 scrypt object preserves raw salt/hash bytes with explicit Base64 and UTF-8 encodings", () => {
  const result = buildRecord().custom_password_hash;
  assert.equal(result.algorithm, "scrypt");
  assert.equal(result.hash.encoding, "base64");
  assert.equal(result.salt.encoding, "base64");
  assert.equal(result.password.encoding, "utf8");
  assert.equal(Buffer.from(result.hash.value, "base64").toString("hex"), fixture.expectedHashHex);
  assert.equal(Buffer.from(result.salt.value, "base64").toString("hex"), "00112233445566778899aabbccddeeff");
  assert.equal(result.keylen, 64);
  assert.equal(result.cost, 32768);
  assert.equal(result.blockSize, 8);
  assert.equal(result.parallelization, 1);
});

test("R3: provider import record never contains TOTP factor material", () => {
  const record = buildRecord();
  assert.equal(record.email, "c1.synthetic@example.test");
  assert.equal(record.email_verified, true);
  assert.equal(record.user_id, "synthetic-portal-user-001");
  assert.equal(record.app_metadata.legacy_account_ref, "synthetic-account-001");
  assert.equal(Object.hasOwn(record, "mfa_factors"), false);
  assert.deepEqual(Object.keys(record).sort(), [
    "app_metadata", "custom_password_hash", "email", "email_verified", "user_id"
  ]);
  assert.equal(Object.hasOwn(record, "password"), false);
  assert.equal(Object.hasOwn(record, "password_hash"), false);
  assert.equal(JSON.stringify(record).includes(fixture.plainPassword), false);
  assert.equal(JSON.stringify(record).includes(fixture.legacyTotpSecret), false);
});

test("R3: legacy enc values require re-enrollment and v2 envelopes remain blocked pending C2", () => {
  assert.deepEqual(classifySyntheticLegacyTotpDisposition(null), { outcome: "none", nextAction: "none" });
  assert.deepEqual(classifySyntheticLegacyTotpDisposition(fixture.legacyTotpSecret), {
    outcome: "re_enroll_required",
    nextAction: "re_enroll",
    legacyEncoding: "base32_not_ciphertext"
  });
  assert.deepEqual(classifySyntheticLegacyTotpDisposition("v2:aes-256-gcm:synthetic-envelope"), {
    outcome: "blocked",
    nextAction: "blocked_pending_c2_key_custody"
  });
  assert.throws(() => buildRecord({ legacyTotpSecret: fixture.legacyTotpSecret }), {
    code: "totp_secret_requires_reenrollment"
  });
  assert.throws(() => buildRecord({ legacyTotpSecret: "v2:aes-256-gcm:synthetic-envelope" }), {
    code: "totp_secret_requires_c2_key_custody"
  });
});

test("R1: password normalization preserves the legacy trim-only rule", () => {
  assert.equal(normalizePortalPasswordForIdentity("  abc  "), "abc");
  assert.equal(normalizePortalPasswordForIdentity("  A b  "), "A b");
  assert.equal(normalizePortalPasswordForIdentity("  ABC  "), "ABC");
  assert.equal(normalizePortalPasswordForIdentity("e\u0301"), "e\u0301");
  assert.notEqual(normalizePortalPasswordForIdentity("\u00e9"), normalizePortalPasswordForIdentity("e\u0301"));
  assert.equal(normalizePortalPasswordForIdentity(42), "42");
  assert.equal(normalizePortalPasswordForIdentity(null), "");
});

test("R2: first-login password policy rejects over-72-byte inputs before re-hash and never truncates", () => {
  assert.equal(AUTH0_BCRYPT_MAX_PASSWORD_BYTES, 72);
  assert.equal(AUTH0_BCRYPT_OVERFLOW_POLICY, "show_error");
  assert.deepEqual(classifyAuth0FirstLoginPassword("a".repeat(72)), { outcome: "allow", utf8Bytes: 72 });
  assert.deepEqual(classifyAuth0FirstLoginPassword("a".repeat(73)), { outcome: "targeted_reset_required", utf8Bytes: 73 });
  assert.deepEqual(classifyAuth0FirstLoginPassword("中".repeat(24)), { outcome: "allow", utf8Bytes: 72 });
  assert.deepEqual(classifyAuth0FirstLoginPassword("中".repeat(25)), { outcome: "targeted_reset_required", utf8Bytes: 75 });
  assert.deepEqual(classifyAuth0FirstLoginPassword("  abc  "), { outcome: "allow", utf8Bytes: 3 });
  assert.deepEqual(classifyAuth0FirstLoginPassword("   "), { outcome: "invalid", utf8Bytes: 0 });

  assert.deepEqual(evaluateSyntheticAuth0FirstLoginPassword("a".repeat(72)), {
    outcome: "allow",
    utf8Bytes: 72,
    overflowPolicy: "show_error",
    rehashAllowed: true
  });
  assert.deepEqual(evaluateSyntheticAuth0FirstLoginPassword("a".repeat(73)), {
    outcome: "reject",
    reason: "bcrypt_72_byte_limit",
    utf8Bytes: 73,
    overflowPolicy: "show_error",
    nextAction: "targeted_reset_required",
    rehashAllowed: false
  });
  assert.equal(evaluateSyntheticAuth0FirstLoginPassword("中".repeat(24)).rehashAllowed, true);
  assert.equal(evaluateSyntheticAuth0FirstLoginPassword("中".repeat(25)).rehashAllowed, false);
  assert.equal(evaluateSyntheticAuth0FirstLoginPassword("a".repeat(72) + " ").outcome, "allow");
});

test("Auth0 record builder rejects non-synthetic identities and missing verification state", () => {
  assert.throws(() => buildRecord({ email: "customer@example.com" }), { code: "synthetic_email_required" });
  assert.throws(() => buildRecord({ userId: "acct_real_001" }), { code: "synthetic_user_id_required" });
  assert.throws(() => buildRecord({ accountRef: "acct_real_001" }), { code: "synthetic_account_ref_required" });
  assert.throws(() => buildRecord({ emailVerified: "true" }), { code: "email_verified_boolean_required" });
});

test("Auth0 import record can omit TOTP when no synthetic factor is present", () => {
  const record = buildRecord({ legacyTotpSecret: undefined });
  assert.equal(Object.hasOwn(record, "mfa_factors"), false);
});

test("R4: scrypt hash parser rejects oversized encodings before decoding", () => {
  assert.equal(PORTAL_SCRYPT_HASH_MAX_CHARS, 256);
  assert.ok(fixture.passwordHash.length <= PORTAL_SCRYPT_HASH_MAX_CHARS);
  const oversized = "scrypt$v=1$N=32768$r=8$p=1$" + "A".repeat(160) + "$" + "A".repeat(120);
  assert.ok(oversized.length > PORTAL_SCRYPT_HASH_MAX_CHARS);
  assert.throws(() => parsePortalScryptPasswordHash(oversized), { code: "legacy_scrypt_hash_invalid" });
  assert.throws(() => parsePortalScryptPasswordHash("x".repeat(PORTAL_SCRYPT_HASH_MAX_CHARS + 1)), { code: "legacy_scrypt_hash_invalid" });
  assert.equal(verifyPortalScryptPassword({ plainPassword: fixture.plainPassword, passwordHash: oversized }), false);
});

test("R4: scrypt verifier fails closed for oversized and non-string inputs without running scrypt on them", () => {
  assert.equal(PORTAL_PASSWORD_INPUT_MAX_CHARS, 4096);
  const oversizedPassword = fixture.plainPassword + " ".repeat(PORTAL_PASSWORD_INPUT_MAX_CHARS);
  assert.ok(oversizedPassword.length > PORTAL_PASSWORD_INPUT_MAX_CHARS);
  assert.equal(verifyPortalScryptPassword({ plainPassword: oversizedPassword, passwordHash: fixture.passwordHash }), false);
  for (const badHash of [null, undefined, 42, {}, []]) {
    assert.throws(() => parsePortalScryptPasswordHash(badHash), { code: "legacy_scrypt_hash_invalid" });
    assert.equal(verifyPortalScryptPassword({ plainPassword: fixture.plainPassword, passwordHash: badHash }), false);
  }
  // A within-bounds wrong password still goes through the normal path.
  assert.equal(verifyPortalScryptPassword({ plainPassword: "x".repeat(512), passwordHash: fixture.passwordHash }), false);
});

function buildSecondRecord() {
  return buildRecord({
    email: "c1.synthetic2@example.test",
    userId: "synthetic-portal-user-002",
    accountRef: "synthetic-account-002"
  });
}

test("R6: app_metadata merge preserves existing keys, import wins conflicts, inputs stay unmutated", () => {
  const existing = Object.freeze({ plan_tier: "synthetic", legacy_account_ref: "synthetic-stale-ref", nested: { keep: true } });
  const incoming = Object.freeze({ legacy_account_ref: "synthetic-account-001" });
  const merged = mergeAuth0AppMetadata(existing, incoming);
  assert.deepEqual(merged, { plan_tier: "synthetic", legacy_account_ref: "synthetic-account-001", nested: { keep: true } });
  assert.deepEqual(mergeAuth0AppMetadata(null, incoming), { legacy_account_ref: "synthetic-account-001" });
  assert.deepEqual(mergeAuth0AppMetadata(existing, null), { plan_tier: "synthetic", legacy_account_ref: "synthetic-stale-ref", nested: { keep: true } });
});

test("R6: record builder carries the fully merged app_metadata instead of delegating the merge to the provider", () => {
  const record = buildRecord({
    existingAppMetadata: { plan_tier: "synthetic", legacy_account_ref: "synthetic-stale-ref" }
  });
  assert.deepEqual(record.app_metadata, { plan_tier: "synthetic", legacy_account_ref: "synthetic-account-001" });
  // Without pre-existing metadata the record is unchanged from the base contract.
  assert.deepEqual(buildRecord().app_metadata, { legacy_account_ref: "synthetic-account-001" });
});

test("R6: import plan is idempotent across reruns and flags duplicates inside one batch", () => {
  const first = buildRecord();
  const second = buildSecondRecord();

  assert.deepEqual(planSyntheticAuth0BulkImport([first, second]), [
    { index: 0, user_id: "synthetic-portal-user-001", action: "create" },
    { index: 1, user_id: "synthetic-portal-user-002", action: "create" }
  ]);
  assert.deepEqual(planSyntheticAuth0BulkImport([first, second], {
    alreadyImportedUserIds: ["synthetic-portal-user-001", "synthetic-portal-user-002"]
  }), [
    { index: 0, user_id: "synthetic-portal-user-001", action: "skip_already_imported" },
    { index: 1, user_id: "synthetic-portal-user-002", action: "skip_already_imported" }
  ]);
  assert.deepEqual(planSyntheticAuth0BulkImport([first, first]), [
    { index: 0, user_id: "synthetic-portal-user-001", action: "create" },
    { index: 1, user_id: "synthetic-portal-user-001", action: "skip_duplicate_in_batch" }
  ]);
  assert.throws(() => planSyntheticAuth0BulkImport("nope"), { code: "import_plan_records_invalid" });
  assert.throws(() => planSyntheticAuth0BulkImport([{ email: "x@example.test" }]), { code: "import_plan_record_user_id_required" });
});

test("R6: resume after a partial import returns exactly the outstanding records and converges to empty", () => {
  const first = buildRecord();
  const second = buildSecondRecord();
  const batch = [first, second];

  const remaining = resumeSyntheticAuth0BulkImport(batch, { completedUserIds: ["synthetic-portal-user-001"] });
  assert.deepEqual(remaining, [second]);
  // Resuming the resumed set with the same completions is a no-op (idempotent).
  assert.deepEqual(resumeSyntheticAuth0BulkImport(remaining, { completedUserIds: ["synthetic-portal-user-001"] }), [second]);
  // Once every record is completed, a full-batch rerun has nothing left to do.
  assert.deepEqual(resumeSyntheticAuth0BulkImport(batch, {
    completedUserIds: ["synthetic-portal-user-001", "synthetic-portal-user-002"]
  }), []);
});
