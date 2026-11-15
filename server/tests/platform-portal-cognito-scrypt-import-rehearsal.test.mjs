import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import test from "node:test";
import {
  COGNITO_SCRYPT_IMPORT_ALGORITHM,
  COGNITO_SCRYPT_IMPORT_LIMITS,
  buildSyntheticCognitoImportCsv,
  convertPortalScryptEnvelopeToCognitoImportHash,
  createSyntheticCognitoImportRecord,
  parseCognitoScryptImportHash,
  runSyntheticCognitoScryptImportRehearsal
} from "../services/platform/portal-cognito-scrypt-import-rehearsal.mjs";
import {
  PORTAL_SCRYPT_PARAMS,
  SYNTHETIC_PORTAL_IDENTITY_FIXTURE,
  parsePortalScryptPasswordHash,
  verifyPortalScryptPassword
} from "../services/platform/portal-identity-import-rehearsal.mjs";

const fixture = SYNTHETIC_PORTAL_IDENTITY_FIXTURE;

function buildLegacyHash(plainPassword, salt = Buffer.from("0123456789abcdef", "utf8")) {
  const normalized = String(plainPassword).trim();
  const hash = scryptSync(
    Buffer.from(normalized, "utf8"),
    salt,
    PORTAL_SCRYPT_PARAMS.keyLength,
    {
      N: PORTAL_SCRYPT_PARAMS.N,
      r: PORTAL_SCRYPT_PARAMS.r,
      p: PORTAL_SCRYPT_PARAMS.p,
      maxmem: PORTAL_SCRYPT_PARAMS.maxmem
    }
  );
  return "scrypt$v=1$N=" + PORTAL_SCRYPT_PARAMS.N
    + "$r=" + PORTAL_SCRYPT_PARAMS.r
    + "$p=" + PORTAL_SCRYPT_PARAMS.p
    + "$" + salt.toString("base64url")
    + "$" + hash.toString("base64url");
}

test("Cognito synthetic rehearsal passes locally and emits a redacted receipt", () => {
  const receipt = runSyntheticCognitoScryptImportRehearsal();
  assert.equal(receipt.result, "PASS_LOCAL_SYNTHETIC_ONLY");
  assert.equal(receipt.scope, "synthetic-only");
  assert.equal(receipt.provider, "amazon-cognito-user-pools");
  assert.equal(receipt.password.algorithm, "SCRYPT");
  assert.equal(receipt.password.bytePreservingConversion, true);
  assert.equal(receipt.import.syntheticRecordBuilt, true);
  assert.equal(receipt.import.syntheticCsvProjectionBuilt, true);
  assert.equal(receipt.totp.legacyFactorIncluded, false);
  assert.equal(receipt.totp.disposition, "RE_ENROLL_REQUIRED");
  assert.equal(receipt.providerProof, "NOT_RUN");
  assert.equal(receipt.productionAuthority, false);

  const serialized = JSON.stringify(receipt);
  for (const secret of [
    fixture.plainPassword,
    fixture.passwordHash,
    fixture.expectedHashHex,
    "ABEiM0RVZneImaq7zN3u_w",
    fixture.email,
    fixture.legacyTotpSecret
  ]) {
    assert.equal(serialized.includes(secret), false);
  }
});

test("Cognito Scrypt conversion preserves the existing salt and 64-byte derived key", () => {
  const source = parsePortalScryptPasswordHash(fixture.passwordHash);
  const converted = convertPortalScryptEnvelopeToCognitoImportHash(fixture.passwordHash);
  const target = parseCognitoScryptImportHash(converted);

  assert.equal(COGNITO_SCRYPT_IMPORT_ALGORITHM, "SCRYPT");
  assert.equal(converted, "32768$8$1$00112233445566778899aabbccddeeff$" + fixture.expectedHashHex);
  assert.equal(target.N, 32768);
  assert.equal(target.r, 8);
  assert.equal(target.p, 1);
  assert.equal(target.salt.toString("hex"), source.salt.toString("hex"));
  assert.equal(target.hash.toString("hex"), source.hash.toString("hex"));
  assert.equal(target.hash.length, 64);
  assert.equal(verifyPortalScryptPassword({
    plainPassword: fixture.plainPassword,
    passwordHash: fixture.passwordHash
  }), true);
});

test("Cognito parser enforces canonical Scrypt parameters and lowercase hex", () => {
  const valid = convertPortalScryptEnvelopeToCognitoImportHash(fixture.passwordHash);
  assert.equal(parseCognitoScryptImportHash(valid).salt.length, 16);
  assert.equal(COGNITO_SCRYPT_IMPORT_LIMITS.maxN, 65536);
  assert.equal(COGNITO_SCRYPT_IMPORT_LIMITS.blockSize, 8);
  assert.equal(COGNITO_SCRYPT_IMPORT_LIMITS.parallelization, 1);

  const invalid = [
    valid.replace("32768$", "65536$"),
    valid.replace("32768$", "131072$"),
    valid.replace("$8$1$", "$16$1$"),
    valid.replace("$8$1$", "$8$2$"),
    valid.replace("001122", "00112Z"),
    valid.replace(fixture.expectedHashHex.slice(0, 4), fixture.expectedHashHex.slice(0, 4).toUpperCase()),
    valid.slice(0, valid.lastIndexOf("$") + 1),
    valid + "$extra",
    "32768$8$1$" + "ab".repeat(15) + "$" + fixture.expectedHashHex,
    "32768$8$1$" + "ab".repeat(65) + "$" + fixture.expectedHashHex,
    "32768$8$1$" + "ab".repeat(16) + "$" + "cd".repeat(63)
  ];
  for (const candidate of invalid) {
    assert.throws(() => parseCognitoScryptImportHash(candidate));
  }
});

test("Cognito conversion preserves 71, 72 and 73 UTF-8-byte Scrypt passwords without a bcrypt truncation rule", () => {
  const cases = [
    { password: "a".repeat(71), bytes: 71 },
    { password: "a".repeat(72), bytes: 72 },
    { password: "a".repeat(73), bytes: 73 },
    { password: "中".repeat(24), bytes: 72 },
    { password: "中".repeat(25), bytes: 75 }
  ];

  for (const item of cases) {
    assert.equal(Buffer.byteLength(item.password, "utf8"), item.bytes);
    const sourceHash = buildLegacyHash(item.password);
    const converted = convertPortalScryptEnvelopeToCognitoImportHash(sourceHash);
    const parsed = parseCognitoScryptImportHash(converted);
    assert.equal(parsed.hash.length, 64);
    assert.equal(verifyPortalScryptPassword({
      plainPassword: item.password,
      passwordHash: sourceHash
    }), true);
  }
});

test("Cognito synthetic record uses a verified test email and never imports TOTP or plaintext", () => {
  const record = createSyntheticCognitoImportRecord();
  assert.deepEqual(Object.keys(record).sort(), [
    "cognito:username",
    "email",
    "email_verified",
    "password_hash"
  ]);
  assert.equal(record["cognito:username"], "synthetic-portal-user-001");
  assert.equal(record.email, "c1.synthetic@example.test");
  assert.equal(record.email_verified, true);
  assert.equal(record.password_hash, convertPortalScryptEnvelopeToCognitoImportHash(fixture.passwordHash));
  assert.equal(Object.hasOwn(record, "mfa_factors"), false);
  assert.equal(Object.hasOwn(record, "cognito:mfa_enabled"), false);
  assert.equal(Object.hasOwn(record, "password"), false);
  assert.equal(JSON.stringify(record).includes(fixture.plainPassword), false);
  assert.equal(JSON.stringify(record).includes(fixture.legacyTotpSecret), false);
});

test("Cognito CSV projection follows the supplied pool template and leaves unconfigured attributes blank", () => {
  const header = [
    "cognito:username",
    "email",
    "email_verified",
    "phone_number",
    "phone_number_verified",
    "cognito:mfa_enabled",
    "password_hash"
  ];
  const csv = buildSyntheticCognitoImportCsv(header);
  const lines = csv.trimEnd().split("\n");
  assert.equal(lines[0], header.join(","));
  assert.equal(lines.length, 2);
  assert.equal(lines[1].split(",").length, header.length);
  assert.equal(lines[1].split(",")[0], "synthetic-portal-user-001");
  assert.equal(lines[1].split(",")[1], "c1.synthetic@example.test");
  assert.equal(lines[1].split(",")[2], "TRUE");
  assert.equal(lines[1].split(",")[5], "");
  assert.equal(lines[1].split(",")[6], createSyntheticCognitoImportRecord().password_hash);
  assert.equal(csv.charCodeAt(0) === 0xfeff, false);
});

test("Cognito CSV projection rejects missing, duplicate and malformed template columns", () => {
  assert.throws(() => buildSyntheticCognitoImportCsv(["email", "email_verified", "password_hash"]), {
    code: "cognito_csv_required_column_missing"
  });
  assert.throws(() => buildSyntheticCognitoImportCsv([
    "cognito:username", "email", "email_verified", "password_hash", "password_hash"
  ]), { code: "cognito_csv_header_invalid" });
  assert.throws(() => buildSyntheticCognitoImportCsv([
    "cognito:username", "email", "email_verified", "password_hash", "bad,column"
  ]), { code: "cognito_csv_header_invalid" });
  assert.throws(() => buildSyntheticCognitoImportCsv("not-an-array"), {
    code: "cognito_csv_header_invalid"
  });
});

test("local legacy verifier still preserves trim-only semantics; Cognito must prove client pre-normalization separately", () => {
  assert.equal(verifyPortalScryptPassword({
    plainPassword: " " + fixture.plainPassword + " ",
    passwordHash: fixture.passwordHash
  }), true);
  assert.equal(verifyPortalScryptPassword({
    plainPassword: fixture.plainPassword + "x",
    passwordHash: fixture.passwordHash
  }), false);
});
