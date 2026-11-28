import {
  classifySyntheticLegacyTotpDisposition,
  parsePortalScryptPasswordHash,
  PORTAL_SCRYPT_PARAMS,
  SYNTHETIC_PORTAL_IDENTITY_FIXTURE,
  verifyPortalScryptPassword
} from "./portal-identity-import-rehearsal.mjs";

export const COGNITO_SCRYPT_IMPORT_ALGORITHM = "SCRYPT";
export const COGNITO_SCRYPT_IMPORT_LIMITS = Object.freeze({
  maxN: 65536,
  blockSize: 8,
  parallelization: 1,
  minSaltBytes: 16,
  maxSaltBytes: 64,
  sourceHashBytes: 64
});

const SYNTHETIC_COGNITO_HEADER = Object.freeze([
  "cognito:username",
  "email",
  "email_verified",
  "password_hash"
]);

function failure(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function parseCanonicalInteger(value, code) {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/u.test(value)) {
    throw failure(code);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || String(parsed) !== value) {
    throw failure(code);
  }
  return parsed;
}

function decodeLowerHex(value, minBytes, maxBytes, code) {
  if (typeof value !== "string" || value.length % 2 !== 0
    || !/^(?:[0-9a-f]{2})+$/u.test(value)) {
    throw failure(code);
  }
  const decoded = Buffer.from(value, "hex");
  if (decoded.length < minBytes || decoded.length > maxBytes || decoded.toString("hex") !== value) {
    throw failure(code);
  }
  return decoded;
}

export function parseCognitoScryptImportHash(value) {
  if (typeof value !== "string" || value.length > 512) {
    throw failure("cognito_scrypt_hash_invalid");
  }
  const parts = value.split("$");
  if (parts.length !== 5) throw failure("cognito_scrypt_hash_invalid");

  const N = parseCanonicalInteger(parts[0], "cognito_scrypt_parameters_invalid");
  const r = parseCanonicalInteger(parts[1], "cognito_scrypt_parameters_invalid");
  const p = parseCanonicalInteger(parts[2], "cognito_scrypt_parameters_invalid");
  if (N !== PORTAL_SCRYPT_PARAMS.N || N > COGNITO_SCRYPT_IMPORT_LIMITS.maxN
    || (N & (N - 1)) !== 0
    || r !== PORTAL_SCRYPT_PARAMS.r || r !== COGNITO_SCRYPT_IMPORT_LIMITS.blockSize
    || p !== PORTAL_SCRYPT_PARAMS.p || p !== COGNITO_SCRYPT_IMPORT_LIMITS.parallelization) {
    throw failure("cognito_scrypt_parameters_unsupported");
  }

  const salt = decodeLowerHex(
    parts[3],
    COGNITO_SCRYPT_IMPORT_LIMITS.minSaltBytes,
    COGNITO_SCRYPT_IMPORT_LIMITS.maxSaltBytes,
    "cognito_scrypt_salt_invalid"
  );
  const hash = decodeLowerHex(
    parts[4],
    COGNITO_SCRYPT_IMPORT_LIMITS.sourceHashBytes,
    COGNITO_SCRYPT_IMPORT_LIMITS.sourceHashBytes,
    "cognito_scrypt_hash_value_invalid"
  );

  return Object.freeze({ N, r, p, salt, hash });
}

export function convertPortalScryptEnvelopeToCognitoImportHash(encoded) {
  const parsed = parsePortalScryptPasswordHash(encoded);
  const params = PORTAL_SCRYPT_PARAMS;
  if (params.N > COGNITO_SCRYPT_IMPORT_LIMITS.maxN
    || params.r !== COGNITO_SCRYPT_IMPORT_LIMITS.blockSize
    || params.p !== COGNITO_SCRYPT_IMPORT_LIMITS.parallelization
    || parsed.salt.length < COGNITO_SCRYPT_IMPORT_LIMITS.minSaltBytes
    || parsed.salt.length > COGNITO_SCRYPT_IMPORT_LIMITS.maxSaltBytes
    || parsed.hash.length !== COGNITO_SCRYPT_IMPORT_LIMITS.sourceHashBytes) {
    throw failure("cognito_scrypt_source_parameters_unsupported");
  }

  const result = [
    String(params.N),
    String(params.r),
    String(params.p),
    parsed.salt.toString("hex"),
    parsed.hash.toString("hex")
  ].join("$");

  const roundTrip = parseCognitoScryptImportHash(result);
  if (!roundTrip.salt.equals(parsed.salt) || !roundTrip.hash.equals(parsed.hash)) {
    throw failure("cognito_scrypt_conversion_not_lossless");
  }
  return result;
}

function assertSyntheticFixture() {
  const fixture = SYNTHETIC_PORTAL_IDENTITY_FIXTURE;
  if (typeof fixture.email !== "string"
    || fixture.email !== "c1.synthetic@example.test"
    || typeof fixture.userId !== "string"
    || fixture.userId !== "synthetic-portal-user-001"
    || fixture.emailVerified !== true
    || typeof fixture.passwordHash !== "string") {
    throw failure("cognito_synthetic_fixture_invalid");
  }
  return fixture;
}

export function createSyntheticCognitoImportRecord() {
  const fixture = assertSyntheticFixture();
  const passwordHash = convertPortalScryptEnvelopeToCognitoImportHash(fixture.passwordHash);
  return Object.freeze({
    "cognito:username": fixture.userId,
    email: fixture.email,
    email_verified: true,
    password_hash: passwordHash
  });
}

function validateCognitoCsvHeader(header) {
  if (!Array.isArray(header) || header.length > 128) {
    throw failure("cognito_csv_header_invalid");
  }
  const seen = new Set();
  for (const field of header) {
    if (typeof field !== "string" || field.length > 128
      || !/^(?:cognito:[a-z][a-z0-9_]*|custom:[a-z][a-z0-9_]*|[a-z][a-z0-9_]*)$/iu.test(field)
      || seen.has(field)) {
      throw failure("cognito_csv_header_invalid");
    }
    seen.add(field);
  }
  for (const required of SYNTHETIC_COGNITO_HEADER) {
    if (!seen.has(required)) throw failure("cognito_csv_required_column_missing");
  }
  return header;
}

function csvCell(value) {
  if (value === undefined || value === null || value === "") return "";
  if (value === true) return "TRUE";
  if (value === false) return "FALSE";
  if (typeof value !== "string" || /[,\r\n"\t]/u.test(value)) {
    throw failure("cognito_synthetic_csv_cell_invalid");
  }
  return value;
}

export function buildSyntheticCognitoImportCsv(header) {
  const validatedHeader = validateCognitoCsvHeader(header);
  const record = createSyntheticCognitoImportRecord();
  const row = validatedHeader.map((field) => csvCell(record[field]));
  return validatedHeader.join(",") + "\n" + row.join(",") + "\n";
}

export function runSyntheticCognitoScryptImportRehearsal() {
  const fixture = assertSyntheticFixture();
  const parsedSource = parsePortalScryptPasswordHash(fixture.passwordHash);
  const converted = convertPortalScryptEnvelopeToCognitoImportHash(fixture.passwordHash);
  const parsedTarget = parseCognitoScryptImportHash(converted);
  const correctPasswordAccepted = verifyPortalScryptPassword({
    plainPassword: fixture.plainPassword,
    passwordHash: fixture.passwordHash
  });
  const wrongPasswordRejected = !verifyPortalScryptPassword({
    plainPassword: fixture.plainPassword + "-wrong",
    passwordHash: fixture.passwordHash
  });
  const record = createSyntheticCognitoImportRecord();
  const csv = buildSyntheticCognitoImportCsv(SYNTHETIC_COGNITO_HEADER);
  const totpDisposition = classifySyntheticLegacyTotpDisposition(fixture.legacyTotpSecret);

  if (!correctPasswordAccepted || !wrongPasswordRejected
    || !parsedTarget.salt.equals(parsedSource.salt)
    || !parsedTarget.hash.equals(parsedSource.hash)
    || !csv.endsWith("\n") || csv.charCodeAt(0) === 0xfeff
    || totpDisposition.outcome !== "re_enroll_required"
    || Object.hasOwn(record, "cognito:mfa_enabled")
    || Object.hasOwn(record, "mfa_factors")) {
    throw failure("cognito_synthetic_rehearsal_failed");
  }

  return Object.freeze({
    result: "PASS_LOCAL_SYNTHETIC_ONLY",
    scope: "synthetic-only",
    provider: "amazon-cognito-user-pools",
    password: Object.freeze({
      algorithm: COGNITO_SCRYPT_IMPORT_ALGORITHM,
      sourceParameters: Object.freeze({
        N: PORTAL_SCRYPT_PARAMS.N,
        r: PORTAL_SCRYPT_PARAMS.r,
        p: PORTAL_SCRYPT_PARAMS.p,
        saltBytes: parsedSource.salt.length,
        derivedKeyBytes: parsedSource.hash.length
      }),
      targetFormat: "N$r$p$hexSalt$hexHash",
      bytePreservingConversion: true,
      correctPasswordAcceptedByLocalVerifier: true,
      wrongPasswordRejectedByLocalVerifier: true
    }),
    import: Object.freeze({
      syntheticRecordBuilt: true,
      syntheticCsvProjectionBuilt: true,
      requiresVerifiedEmailAttribute: true,
      algorithmSelectedAtImportJobLevel: COGNITO_SCRYPT_IMPORT_ALGORITHM
    }),
    totp: Object.freeze({
      legacyFactorIncluded: false,
      disposition: "RE_ENROLL_REQUIRED",
      secretMaterialIncluded: false
    }),
    providerProof: "NOT_RUN",
    notRun: Object.freeze([
      "AWS user-pool password-hash import job acceptance",
      "Cognito first sign-in verification of the imported 64-byte Scrypt digest",
      "automatic migration to Cognito SRP credentials",
      "71/72/73 UTF-8-byte first-login behavior in Cognito",
      "Portal optional and Admin required TOTP setup and challenge",
      "Cognito AMR/ACR claim validation after TOTP",
      "OIDC Authorization Code + PKCE and Worker JWKS verification",
      "real AWS billing, region and account quota validation"
    ]),
    productionAuthority: false
  });
}
