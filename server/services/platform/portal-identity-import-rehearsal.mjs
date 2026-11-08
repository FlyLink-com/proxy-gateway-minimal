import { createHash, scryptSync, timingSafeEqual } from "node:crypto";

export const PORTAL_SCRYPT_PARAMS = Object.freeze({
  N: 32768,
  r: 8,
  p: 1,
  keyLength: 64,
  maxmem: 64 * 1024 * 1024
});

export const AUTH0_BCRYPT_MAX_PASSWORD_BYTES = 72;
export const AUTH0_BCRYPT_OVERFLOW_POLICY = "show_error";

// R4 input bounds: parser/verifier ceilings, not login policy. The canonical
// scrypt hash string is well under 256 chars (fixed parameter header, a
// 16-64 byte salt and a 64 byte digest in base64url); anything longer is
// malformed by construction and is rejected before any decoding or scrypt
// work happens. The password ceiling only stops pathological inputs from
// reaching the synchronous scrypt call; legitimate passwords are orders of
// magnitude shorter, and the 72-byte first-login rule stays a separate
// classification (R2), not an enforcement here.
export const PORTAL_SCRYPT_HASH_MAX_CHARS = 256;
export const PORTAL_PASSWORD_INPUT_MAX_CHARS = 4096;

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
  if (typeof encoded !== "string" || encoded.length > PORTAL_SCRYPT_HASH_MAX_CHARS) {
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

// Preserve the legacy trim-only rule for values that have passed the input
// type boundary. R4 rejects non-string verifier inputs before parsing or scrypt.
export function normalizePortalPasswordForIdentity(value) {
  return String(value ?? "").trim();
}

export function verifyPortalScryptPassword(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const { plainPassword, passwordHash } = input;
  if (typeof plainPassword !== "string" || typeof passwordHash !== "string") return false;
  if (plainPassword.length > PORTAL_PASSWORD_INPUT_MAX_CHARS) return false;
  if (passwordHash.length > PORTAL_SCRYPT_HASH_MAX_CHARS) return false;
  const normalizedPassword = normalizePortalPasswordForIdentity(plainPassword);
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

// R3 disposition only. This rehearsal never decodes, decrypts, normalizes,
// or imports legacy TOTP material. The historical "enc:" prefix identifies
// Base32 text; it is not evidence that the value is encrypted.
export function classifySyntheticLegacyTotpDisposition(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return { outcome: "none", nextAction: "none" };
  }
  const raw = String(value).trim();
  if (raw.startsWith("v2:")) {
    return {
      outcome: "blocked",
      nextAction: "blocked_pending_c2_key_custody"
    };
  }
  if (raw.startsWith("enc:")) {
    return {
      outcome: "re_enroll_required",
      nextAction: "re_enroll",
      legacyEncoding: "base32_not_ciphertext"
    };
  }
  return {
    outcome: "re_enroll_required",
    nextAction: "re_enroll",
    legacyEncoding: "unverified"
  };
}

export function classifyAuth0FirstLoginPassword(plainPassword) {
  const normalizedPassword = normalizePortalPasswordForIdentity(plainPassword);
  if (!normalizedPassword) {
    return { outcome: "invalid", utf8Bytes: 0 };
  }
  const utf8Bytes = Buffer.byteLength(normalizedPassword, "utf8");
  return {
    outcome: utf8Bytes > AUTH0_BCRYPT_MAX_PASSWORD_BYTES ? "targeted_reset_required" : "allow",
    utf8Bytes
  };
}

// Synthetic-only contract: over-limit passwords are rejected with Show error
// before bcrypt re-hash. They are never truncated. A real tenant must still
// prove this behavior in an isolated provider test before production use.
export function evaluateSyntheticAuth0FirstLoginPassword(plainPassword) {
  const classification = classifyAuth0FirstLoginPassword(plainPassword);
  if (classification.outcome === "invalid") {
    return {
      outcome: "reject",
      reason: "invalid_password",
      utf8Bytes: 0,
      rehashAllowed: false
    };
  }
  if (classification.outcome === "targeted_reset_required") {
    return {
      outcome: "reject",
      reason: "bcrypt_72_byte_limit",
      utf8Bytes: classification.utf8Bytes,
      overflowPolicy: AUTH0_BCRYPT_OVERFLOW_POLICY,
      nextAction: "targeted_reset_required",
      rehashAllowed: false
    };
  }
  return {
    outcome: "allow",
    utf8Bytes: classification.utf8Bytes,
    overflowPolicy: AUTH0_BCRYPT_OVERFLOW_POLICY,
    rehashAllowed: true
  };
}

function requireSyntheticIdentifier(value, code) {
  if (typeof value !== "string" || !/^synthetic-[a-z0-9-]{1,80}$/u.test(value)) {
    throw failure(code);
  }
  return value;
}

// R6 metadata contract: a provider bulk-import upsert replaces the whole
// app_metadata object instead of merging it. The import record must
// therefore carry the complete merged object, and the merge happens here,
// locally and deterministically: keys already present on the account are
// preserved, keys carried by the import win on conflict, and neither input
// object is mutated.
export function mergeAuth0AppMetadata(existingAppMetadata, importAppMetadata) {
  const existing = existingAppMetadata && typeof existingAppMetadata === "object" && !Array.isArray(existingAppMetadata)
    ? existingAppMetadata
    : {};
  const incoming = importAppMetadata && typeof importAppMetadata === "object" && !Array.isArray(importAppMetadata)
    ? importAppMetadata
    : {};
  return { ...existing, ...incoming };
}

export function createSyntheticAuth0BulkImportRecord({
  email,
  emailVerified,
  userId,
  accountRef,
  passwordHash,
  legacyTotpSecret,
  existingAppMetadata
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
  const totpDisposition = classifySyntheticLegacyTotpDisposition(legacyTotpSecret);
  if (totpDisposition.outcome === "blocked") {
    throw failure("totp_secret_requires_c2_key_custody");
  }
  if (totpDisposition.outcome === "re_enroll_required") {
    throw failure("totp_secret_requires_reenrollment");
  }
  if (typeof emailVerified !== "boolean") {
    throw failure("email_verified_boolean_required");
  }

  const record = {
    email: normalizedEmail,
    email_verified: emailVerified,
    user_id: normalizedUserId,
    app_metadata: mergeAuth0AppMetadata(existingAppMetadata, {
      legacy_account_ref: normalizedAccountRef
    }),
    custom_password_hash: buildAuth0CustomPasswordHash(passwordHash)
  };

  // TOTP factor material is deliberately omitted from this import record.
  // Legacy users re-enroll; v2 envelopes remain blocked pending C2 approval.
  return record;
}

// R6 import idempotency contract: planning is a pure function of the batch
// and the set of user_ids already imported. Re-running the same batch after
// a partial failure must never re-create a completed record: completed
// user_ids plan as skips, a user_id repeated inside one batch is created at
// most once, and resuming returns exactly the records still outstanding.
export function planSyntheticAuth0BulkImport(records, { alreadyImportedUserIds = [] } = {}) {
  if (!Array.isArray(records)) {
    throw failure("import_plan_records_invalid");
  }
  const alreadyImported = new Set(alreadyImportedUserIds);
  const seenInBatch = new Set();
  return records.map((record, index) => {
    const userId = record?.user_id;
    if (typeof userId !== "string" || !userId) {
      throw failure("import_plan_record_user_id_required");
    }
    let action = "create";
    if (alreadyImported.has(userId)) {
      action = "skip_already_imported";
    } else if (seenInBatch.has(userId)) {
      action = "skip_duplicate_in_batch";
    }
    seenInBatch.add(userId);
    return { index, user_id: userId, action };
  });
}

export function resumeSyntheticAuth0BulkImport(records, { completedUserIds = [] } = {}) {
  const plan = planSyntheticAuth0BulkImport(records, { alreadyImportedUserIds: completedUserIds });
  const outstanding = new Set(
    plan.filter((entry) => entry.action === "create").map((entry) => entry.index)
  );
  return records.filter((record, index) => outstanding.has(index));
}

export function runSyntheticPortalIdentityImportRehearsal() {
  const fixture = SYNTHETIC_PORTAL_IDENTITY_FIXTURE;
  const parsed = parsePortalScryptPasswordHash(fixture.passwordHash);
  const record = createSyntheticAuth0BulkImportRecord({
    email: fixture.email,
    emailVerified: fixture.emailVerified,
    userId: fixture.userId,
    accountRef: fixture.accountRef,
    passwordHash: fixture.passwordHash
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
  const password72 = evaluateSyntheticAuth0FirstLoginPassword("a".repeat(72));
  const password73 = evaluateSyntheticAuth0FirstLoginPassword("a".repeat(73));
  const legacyTotpDisposition = classifySyntheticLegacyTotpDisposition(fixture.legacyTotpSecret);
  const protectedV2Disposition = classifySyntheticLegacyTotpDisposition("v2:aes-256-gcm:synthetic-envelope");
  const totpFactorAbsent = !Object.hasOwn(record, "mfa_factors");

  const expectedKeys = [
    "app_metadata",
    "custom_password_hash",
    "email",
    "email_verified",
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
  const totpSchemaExact = totpFactorAbsent
    && legacyTotpDisposition.outcome === "re_enroll_required"
    && legacyTotpDisposition.nextAction === "re_enroll"
    && protectedV2Disposition.outcome === "blocked"
    && protectedV2Disposition.nextAction === "blocked_pending_c2_key_custody";
  const recordJson = JSON.stringify(record);
  const rawPasswordAbsent = !recordJson.includes(fixture.plainPassword);
  const independentVectorMatches = parsed.hash.toString("hex") === fixture.expectedHashHex;
  const coreChecks = [
    independentVectorMatches,
    passwordAccepted,
    trimmedPasswordAccepted,
    wrongPasswordRejected,
    password72.outcome === "allow" && password72.utf8Bytes === 72 && password72.rehashAllowed,
    password73.outcome === "reject" && password73.utf8Bytes === 73
      && password73.overflowPolicy === AUTH0_BCRYPT_OVERFLOW_POLICY
      && password73.nextAction === "targeted_reset_required"
      && !password73.rehashAllowed,
    passwordHashSchemaExact,
    totpSchemaExact,
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
      importFactorIncluded: false,
      legacyEncDisposition: "RE_ENROLL_REQUIRED",
      legacyEncIsCiphertext: false,
      protectedV2Disposition: "BLOCKED_PENDING_C2_KEY_CUSTODY",
      secretMaterialIncluded: false
    },
    importRecord: {
      generatedInMemory: true,
      emailDomain: "example.test",
      emailVerified: fixture.emailVerified,
      userIdOpaque: true,
      accountRefOpaque: true,
      customPasswordHashIncluded: true,
      totpFactorIncluded: false,
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
      "Auth0 hosted first-login rehash behavior and actual Show error enforcement",
      "provider TOTP re-enrollment and C2 secret custody",
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
