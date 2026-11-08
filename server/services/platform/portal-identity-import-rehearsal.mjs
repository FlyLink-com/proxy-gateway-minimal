import { createHash, scryptSync, timingSafeEqual } from "node:crypto";
import { createPortalTotpVerifier } from "./portal-totp-verifier.mjs";

export const PORTAL_SCRYPT_PARAMS = Object.freeze({
  N: 32768,
  r: 8,
  p: 1,
  keyLength: 64,
  maxmem: 64 * 1024 * 1024
});

export const AUTH0_BCRYPT_MAX_PASSWORD_BYTES = 72;

export const SYNTHETIC_PORTAL_IDENTITY_FIXTURE = Object.freeze({
  id: "C1-SYNTHETIC-001",
  plainPassword: "Synthetic-Only-Password-2026!",
  passwordHash: "scrypt$v=1$N=32768$r=8$p=1$ABEiM0RVZneImaq7zN3u_w$-Uv5KBY2WrG63tvD796obiAyr5BqXrt1ggn7OfivUmsga0pomcsHLbdX4MczFGB7Ke-MCr97TzPhN6jTtO86SA",
  expectedHashHex: "f94bf92816365ab1badedbc3efdea86e2032af906a5ebb758209fb39f8af526b206b4a6899cb072db757e0c73314607b29ef8c0abf7b4f33e137a8d3b4ef3a48",
  email: "c1.synthetic@example.test",
  userId: "synthetic-portal-user-001",
  accountRef: "synthetic-account-001",
  emailVerified: true,
  legacyTotpSecret: "enc:JBSWY3DPEHPK3PXP",
  totpNow: "2026-06-06T00:00:00.000Z",
  currentTotpCode: "049557",
  adjacentTotpCode: "186022"
});

function failure(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function decodeCanonicalBase64Url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    return null;
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.length === 0 || decoded.toString("base64url") !== value) {
    return null;
  }
  return decoded;
}

export function parsePortalScryptPasswordHash(encoded) {
  if (typeof encoded !== "string") {
    throw failure("legacy_scrypt_hash_invalid");
  }
  const parts = encoded.split("$");
  if (
    parts.length !== 7
    || parts[0] !== "scrypt"
    || parts[1] !== "v=1"
    || parts[2] !== "N=" + PORTAL_SCRYPT_PARAMS.N
    || parts[3] !== "r=" + PORTAL_SCRYPT_PARAMS.r
    || parts[4] !== "p=" + PORTAL_SCRYPT_PARAMS.p
  ) {
    throw failure("legacy_scrypt_hash_invalid");
  }

  const salt = decodeCanonicalBase64Url(parts[5]);
  const hash = decodeCanonicalBase64Url(parts[6]);
  if (!salt || salt.length < 16 || salt.length > 64 || !hash || hash.length !== PORTAL_SCRYPT_PARAMS.keyLength) {
    throw failure("legacy_scrypt_hash_invalid");
  }

  return { salt, hash };
}

export function verifyPortalScryptPassword({ plainPassword, passwordHash } = {}) {
  const normalizedPassword = String(plainPassword ?? "").trim();
  if (!normalizedPassword) return false;

  let parsed;
  try {
    parsed = parsePortalScryptPasswordHash(passwordHash);
  } catch {
    return false;
  }

  const derived = scryptSync(
    Buffer.from(normalizedPassword, "utf8"),
    parsed.salt,
    PORTAL_SCRYPT_PARAMS.keyLength,
    {
      N: PORTAL_SCRYPT_PARAMS.N,
      r: PORTAL_SCRYPT_PARAMS.r,
      p: PORTAL_SCRYPT_PARAMS.p,
      maxmem: PORTAL_SCRYPT_PARAMS.maxmem
    }
  );
  return derived.length === parsed.hash.length && timingSafeEqual(derived, parsed.hash);
}

function buildAuth0CustomPasswordHash(passwordHash) {
  const parsed = parsePortalScryptPasswordHash(passwordHash);
  return {
    algorithm: "scrypt",
    hash: {
      value: parsed.hash.toString("base64"),
      encoding: "base64"
    },
    salt: {
      value: parsed.salt.toString("base64"),
      encoding: "base64"
    },
    password: {
      encoding: "utf8"
    },
    keylen: PORTAL_SCRYPT_PARAMS.keyLength,
    cost: PORTAL_SCRYPT_PARAMS.N,
    blockSize: PORTAL_SCRYPT_PARAMS.r,
    parallelization: PORTAL_SCRYPT_PARAMS.p
  };
}

function decodeBase32ForLegacyCompatibility(value) {
  let buffer = 0;
  let bits = 0;
  const bytes = [];
  for (const character of value) {
    const code = character.charCodeAt(0);
    const index = code >= 65 && code <= 90
      ? code - 65
      : code >= 50 && code <= 55
        ? code - 24
        : -1;
    if (index < 0) return null;
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
      buffer &= (1 << bits) - 1;
    }
  }
  if (bytes.length === 0) return null;
  return Buffer.from(bytes);
}

function normalizeAuth0TotpSecret(value) {
  const raw = String(value ?? "").trim();
  if (!raw) throw failure("totp_secret_invalid");
  if (raw.startsWith("v2:")) {
    throw failure("totp_secret_requires_c2_key_custody");
  }
  const unwrapped = raw.startsWith("enc:") ? raw.slice("enc:".length) : raw;
  const normalized = unwrapped
    .replace(/[\s-]/gu, "")
    .replace(/=+$/u, "")
    .toUpperCase();
  if (!/^[A-Z2-7]+$/u.test(normalized) || !decodeBase32ForLegacyCompatibility(normalized)) {
    throw failure("totp_secret_invalid");
  }
  return normalized;
}

export function classifyAuth0FirstLoginPassword(plainPassword) {
  const normalizedPassword = String(plainPassword ?? "").trim();
  if (!normalizedPassword) {
    return { outcome: "invalid", utf8Bytes: 0 };
  }
  const utf8Bytes = Buffer.byteLength(normalizedPassword, "utf8");
  return {
    outcome: utf8Bytes > AUTH0_BCRYPT_MAX_PASSWORD_BYTES ? "targeted_reset_required" : "allow",
    utf8Bytes
  };
}

function requireSyntheticIdentifier(value, code) {
  if (typeof value !== "string" || !/^synthetic-[a-z0-9-]{1,80}$/u.test(value)) {
    throw failure(code);
  }
  return value;
}

export function createAuth0BulkImportRecord({
  email,
  emailVerified,
  userId,
  accountRef,
  passwordHash,
  legacyTotpSecret
} = {}) {
  const normalizedEmail = String(email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@example\.test$/u.test(normalizedEmail)) {
    throw failure("synthetic_email_required");
  }
  const normalizedUserId = requireSyntheticIdentifier(userId, "synthetic_user_id_required");
  const normalizedAccountRef = requireSyntheticIdentifier(accountRef, "synthetic_account_ref_required");
  if (passwordHash !== SYNTHETIC_PORTAL_IDENTITY_FIXTURE.passwordHash) {
    throw failure("synthetic_password_hash_required");
  }
  if (legacyTotpSecret !== undefined && legacyTotpSecret !== null
    && legacyTotpSecret !== SYNTHETIC_PORTAL_IDENTITY_FIXTURE.legacyTotpSecret) {
    throw failure("synthetic_totp_secret_required");
  }
  if (typeof emailVerified !== "boolean") {
    throw failure("email_verified_boolean_required");
  }

  const record = {
    email: normalizedEmail,
    email_verified: emailVerified,
    user_id: normalizedUserId,
    app_metadata: {
      legacy_account_ref: normalizedAccountRef
    },
    custom_password_hash: buildAuth0CustomPasswordHash(passwordHash)
  };

  if (legacyTotpSecret !== undefined && legacyTotpSecret !== null) {
    record.mfa_factors = [{
      totp: {
        secret: normalizeAuth0TotpSecret(legacyTotpSecret)
      }
    }];
  }

  return record;
}

export function runSyntheticPortalIdentityImportRehearsal() {
  const fixture = SYNTHETIC_PORTAL_IDENTITY_FIXTURE;
  const parsed = parsePortalScryptPasswordHash(fixture.passwordHash);
  const record = createAuth0BulkImportRecord({
    email: fixture.email,
    emailVerified: fixture.emailVerified,
    userId: fixture.userId,
    accountRef: fixture.accountRef,
    passwordHash: fixture.passwordHash,
    legacyTotpSecret: fixture.legacyTotpSecret
  });
  const passwordAccepted = verifyPortalScryptPassword({
    plainPassword: fixture.plainPassword,
    passwordHash: fixture.passwordHash
  });
  const trimmedPasswordAccepted = verifyPortalScryptPassword({
    plainPassword: "  " + fixture.plainPassword + "  ",
    passwordHash: fixture.passwordHash
  });
  const wrongPasswordRejected = !verifyPortalScryptPassword({
    plainPassword: fixture.plainPassword + "x",
    passwordHash: fixture.passwordHash
  });
  const password72 = classifyAuth0FirstLoginPassword("a".repeat(72));
  const password73 = classifyAuth0FirstLoginPassword("a".repeat(73));
  const totpVerifier = createPortalTotpVerifier({ nowFn: () => fixture.totpNow });
  const importedTotpSecret = record.mfa_factors?.[0]?.totp?.secret;
  const currentTotpAccepted = totpVerifier({
    encryptedTotpSecret: importedTotpSecret,
    code: fixture.currentTotpCode
  });
  const adjacentTotpAccepted = totpVerifier({
    encryptedTotpSecret: importedTotpSecret,
    code: fixture.adjacentTotpCode
  });
  const wrongTotpRejected = !totpVerifier({
    encryptedTotpSecret: importedTotpSecret,
    code: "000000"
  });

  let protectedV2Rejected = false;
  try {
    normalizeAuth0TotpSecret("v2:aes-256-gcm:synthetic-envelope");
  } catch (error) {
    protectedV2Rejected = error?.code === "totp_secret_requires_c2_key_custody";
  }

  const expectedKeys = [
    "app_metadata",
    "custom_password_hash",
    "email",
    "email_verified",
    "mfa_factors",
    "user_id"
  ];
  const schemaKeysExact = JSON.stringify(Object.keys(record).sort()) === JSON.stringify(expectedKeys);
  const passwordHashSchemaExact = record.custom_password_hash.algorithm === "scrypt"
    && record.custom_password_hash.hash.encoding === "base64"
    && record.custom_password_hash.salt.encoding === "base64"
    && record.custom_password_hash.password.encoding === "utf8"
    && record.custom_password_hash.keylen === 64
    && record.custom_password_hash.cost === 32768
    && record.custom_password_hash.blockSize === 8
    && record.custom_password_hash.parallelization === 1;
  const totpSchemaExact = record.mfa_factors?.length === 1
    && record.mfa_factors[0]?.totp?.secret === "JBSWY3DPEHPK3PXP"
    && Object.keys(record.mfa_factors[0]).length === 1;
  const recordJson = JSON.stringify(record);
  const rawPasswordAbsent = !recordJson.includes(fixture.plainPassword);
  const independentVectorMatches = parsed.hash.toString("hex") === fixture.expectedHashHex;
  const coreChecks = [
    independentVectorMatches,
    passwordAccepted,
    trimmedPasswordAccepted,
    wrongPasswordRejected,
    password72.outcome === "allow" && password72.utf8Bytes === 72,
    password73.outcome === "targeted_reset_required" && password73.utf8Bytes === 73,
    passwordHashSchemaExact,
    totpSchemaExact,
    currentTotpAccepted,
    adjacentTotpAccepted,
    wrongTotpRejected,
    protectedV2Rejected,
    schemaKeysExact,
    rawPasswordAbsent
  ];
  const passed = coreChecks.every(Boolean);
  if (!passed) throw failure("identity_import_rehearsal_failed");

  const receipt = {
    fixture_id: fixture.id,
    scope: "synthetic-only",
    result: "PASS_LOCAL_SYNTHETIC_ONLY",
    password: {
      algorithm: "scrypt",
      parameters: {
        cost: PORTAL_SCRYPT_PARAMS.N,
        blockSize: PORTAL_SCRYPT_PARAMS.r,
        parallelization: PORTAL_SCRYPT_PARAMS.p,
        keyLengthBytes: PORTAL_SCRYPT_PARAMS.keyLength
      },
      saltBytes: parsed.salt.length,
      derivedHashBytes: parsed.hash.length,
      independentPythonVectorMatched: independentVectorMatches,
      correctPasswordAccepted: passwordAccepted,
      wrongPasswordRejected,
      trimNormalizationPreserved: trimmedPasswordAccepted,
      firstLoginUtf8Boundary: {
        maxBytes: AUTH0_BCRYPT_MAX_PASSWORD_BYTES,
        at72Bytes: password72.outcome,
        at73Bytes: password73.outcome
      },
      auth0SchemaEncoding: "base64-hash-and-salt; utf8-password"
    },
    totp: {
      importPath: "mfa_factors[].totp.secret",
      currentIntervalAccepted: currentTotpAccepted,
      adjacentIntervalAccepted: adjacentTotpAccepted,
      wrongCodeRejected: wrongTotpRejected,
      protectedV2Envelope: "BLOCKED_PENDING_C2_KEY_CUSTODY"
    },
    importRecord: {
      generatedInMemory: true,
      emailDomain: "example.test",
      emailVerified: fixture.emailVerified,
      userIdOpaque: true,
      accountRefOpaque: true,
      customPasswordHashIncluded: true,
      totpFactorIncluded: true,
      rawPasswordIncluded: false
    },
    integrity: {
      importRecordSha256: createHash("sha256").update(recordJson, "utf8").digest("hex"),
      importRecordWrittenToDisk: false,
      importRecordEmittedToStdout: false
    },
    outputSafety: {
      receiptContainsRawPassword: false,
      receiptContainsPasswordHash: false,
      receiptContainsSalt: false,
      receiptContainsTotpSecret: false,
      realAccountInputAccepted: false
    },
    notRun: [
      "Auth0 tenant or API import acceptance",
      "Auth0 hosted first-login rehash behavior",
      "provider lockout and email OTP policy",
      "Portal/Admin tenant isolation",
      "Admin directory search and audit",
      "Worker token projection and gateway bypass",
      "real-account duplicate and partial-import reconciliation",
      "provider outage and revocation behavior",
      "Android/browser parity"
    ]
  };

  return receipt;
}
