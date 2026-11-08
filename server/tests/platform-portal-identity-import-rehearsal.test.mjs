import assert from "node:assert/strict";
import test from "node:test";
import { createPortalTotpVerifier } from "../services/platform/portal-totp-verifier.mjs";
import {
  AUTH0_BCRYPT_MAX_PASSWORD_BYTES,
  SYNTHETIC_PORTAL_IDENTITY_FIXTURE,
  classifyAuth0FirstLoginPassword,
  createAuth0BulkImportRecord,
  parsePortalScryptPasswordHash,
  runSyntheticPortalIdentityImportRehearsal,
  verifyPortalScryptPassword
} from "../services/platform/portal-identity-import-rehearsal.mjs";

const fixture = SYNTHETIC_PORTAL_IDENTITY_FIXTURE;

function buildRecord(overrides = {}) {
  return createAuth0BulkImportRecord({
    email: fixture.email,
    emailVerified: fixture.emailVerified,
    userId: fixture.userId,
    accountRef: fixture.accountRef,
    passwordHash: fixture.passwordHash,
    legacyTotpSecret: fixture.legacyTotpSecret,
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
  assert.equal(receipt.totp.currentIntervalAccepted, true);
  assert.equal(receipt.totp.adjacentIntervalAccepted, true);
  assert.equal(receipt.totp.protectedV2Envelope, "BLOCKED_PENDING_C2_KEY_CUSTODY");
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

test("Auth0 bulk record uses the documented TOTP schema and only synthetic identifiers", () => {
  const record = buildRecord();
  assert.equal(record.email, "c1.synthetic@example.test");
  assert.equal(record.email_verified, true);
  assert.equal(record.user_id, "synthetic-portal-user-001");
  assert.equal(record.app_metadata.legacy_account_ref, "synthetic-account-001");
  assert.deepEqual(record.mfa_factors, [{ totp: { secret: "JBSWY3DPEHPK3PXP" } }]);
  assert.deepEqual(Object.keys(record).sort(), [
    "app_metadata", "custom_password_hash", "email", "email_verified", "mfa_factors", "user_id"
  ]);
  assert.equal(Object.hasOwn(record, "password"), false);
  assert.equal(Object.hasOwn(record, "password_hash"), false);
  assert.equal(JSON.stringify(record).includes(fixture.plainPassword), false);

  const verifier = createPortalTotpVerifier({ nowFn: () => fixture.totpNow });
  assert.equal(verifier({ encryptedTotpSecret: record.mfa_factors[0].totp.secret, code: fixture.currentTotpCode }), true);
  assert.equal(verifier({ encryptedTotpSecret: record.mfa_factors[0].totp.secret, code: fixture.adjacentTotpCode }), true);
  assert.equal(verifier({ encryptedTotpSecret: record.mfa_factors[0].totp.secret, code: "000000" }), false);
});

test("Auth0 TOTP rehearsal uses the fixed synthetic Base32 fixture and blocks v2 without C2", () => {
  const record = buildRecord();
  assert.equal(record.mfa_factors[0].totp.secret, "JBSWY3DPEHPK3PXP");
  assert.equal(runSyntheticPortalIdentityImportRehearsal().totp.protectedV2Envelope, "BLOCKED_PENDING_C2_KEY_CUSTODY");
  assert.throws(() => buildRecord({ legacyTotpSecret: "v2:aes-256-gcm:synthetic" }), { code: "synthetic_totp_secret_required" });
  assert.throws(() => buildRecord({ legacyTotpSecret: "enc:NOT-BASE32!" }), { code: "synthetic_totp_secret_required" });
});

test("Auth0 first-login password gate uses UTF-8 bytes after trim, not character count", () => {
  assert.equal(AUTH0_BCRYPT_MAX_PASSWORD_BYTES, 72);
  assert.deepEqual(classifyAuth0FirstLoginPassword("a".repeat(72)), { outcome: "allow", utf8Bytes: 72 });
  assert.deepEqual(classifyAuth0FirstLoginPassword("a".repeat(73)), { outcome: "targeted_reset_required", utf8Bytes: 73 });
  assert.deepEqual(classifyAuth0FirstLoginPassword("中".repeat(24)), { outcome: "allow", utf8Bytes: 72 });
  assert.deepEqual(classifyAuth0FirstLoginPassword("中".repeat(25)), { outcome: "targeted_reset_required", utf8Bytes: 75 });
  assert.deepEqual(classifyAuth0FirstLoginPassword("  abc  "), { outcome: "allow", utf8Bytes: 3 });
  assert.deepEqual(classifyAuth0FirstLoginPassword("   "), { outcome: "invalid", utf8Bytes: 0 });
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
