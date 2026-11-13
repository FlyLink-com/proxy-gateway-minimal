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
    const payload = raw.slice(4).replace(/[\s-]/gu, "").replace(/=+$/u, "").toUpperCase();
    return {
      outcome: "re_enroll_required",
      nextAction: "re_enroll",
      legacyEncoding: /^[A-Z2-7]+$/u.test(payload)
        ? "base32_syntax_not_ciphertext"
        : "unverified_enc_prefix"
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
const SYNTHETIC_AUTH0_APP_METADATA_ALLOWLIST = Object.freeze({
  plan_tier: "label",
  legacy_account_ref: "synthetic_identifier"
});

function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateSyntheticAuth0AppMetadata(value) {
  if (value === undefined || value === null) return {};
  if (!isPlainRecord(value)) throw failure("app_metadata_object_required");

  const validated = {};
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value")) {
      throw failure("app_metadata_accessor_not_allowed");
    }
    const entry = descriptor.value;
    if (!Object.hasOwn(SYNTHETIC_AUTH0_APP_METADATA_ALLOWLIST, key)) {
      throw failure("app_metadata_key_not_allowlisted");
    }
    const fieldPolicy = SYNTHETIC_AUTH0_APP_METADATA_ALLOWLIST[key];
    if (typeof entry !== "string" || !entry || entry.length > 64) {
      throw failure("app_metadata_value_invalid");
    }
    if (fieldPolicy === "synthetic_identifier"
      && !/^synthetic-[a-z0-9-]{1,80}$/u.test(entry)) {
      throw failure("app_metadata_synthetic_identifier_invalid");
    }
    if (fieldPolicy === "label" && !/^[a-z0-9][a-z0-9_-]{0,31}$/iu.test(entry)) {
      throw failure("app_metadata_label_invalid");
    }
    validated[key] = entry;
  }
  return validated;
}

// This is a fixture-only allowlist, not an approved production metadata schema.
// Production import requires a separately reviewed field list and provider readback.
export function mergeAuth0AppMetadata(existingAppMetadata, importAppMetadata) {
  const existing = validateSyntheticAuth0AppMetadata(existingAppMetadata);
  const incoming = validateSyntheticAuth0AppMetadata(importAppMetadata);
  return { ...existing, ...incoming };
}

function canonicalizeSyntheticJson(value, ancestors = new WeakSet()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw failure("import_plan_record_circular");
    ancestors.add(value);
    const result = value.map((entry) => canonicalizeSyntheticJson(entry, ancestors));
    ancestors.delete(value);
    return result;
  }
  if (isPlainRecord(value)) {
    if (ancestors.has(value)) throw failure("import_plan_record_circular");
    ancestors.add(value);
    const result = {};
    for (const key of Object.keys(value).sort()) {
      if (["__proto__", "constructor", "prototype"].includes(key)) {
        throw failure("import_plan_record_key_invalid");
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.hasOwn(descriptor, "value")) {
        throw failure("import_plan_record_accessor_not_allowed");
      }
      result[key] = canonicalizeSyntheticJson(descriptor.value, ancestors);
    }
    ancestors.delete(value);
    return result;
  }
  throw failure("import_plan_record_not_json_safe");
}

// This projection contains only stable identity fields available to provider readback.
// It deliberately excludes custom_password_hash: ordinary user readback does not return
// imported password hashes. A matching fingerprint proves identity projection only,
// never password-credential acceptance. SHA-256 here is only for the synthetic fixture;
// production PII fingerprints require an approved keyed construction and authenticated adapter.
export function fingerprintSyntheticAuth0ImportRecord(record) {
  if (!isPlainRecord(record)) throw failure("import_plan_record_invalid");
  const projection = {};
  for (const key of ["user_id", "email", "email_verified", "app_metadata"]) {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value")) {
      throw failure("import_plan_readback_projection_incomplete");
    }
    projection[key] = descriptor.value;
  }
  if (typeof projection.user_id !== "string" || !/^synthetic-[a-z0-9-]{1,80}$/u.test(projection.user_id)
    || typeof projection.email !== "string"
    || !/^[^@\s]+@example\.test$/u.test(projection.email)
    || projection.email !== projection.email.trim().toLowerCase()
    || typeof projection.email_verified !== "boolean") {
    throw failure("import_plan_readback_projection_invalid");
  }
  projection.app_metadata = validateSyntheticAuth0AppMetadata(projection.app_metadata);
  if (!Object.hasOwn(projection.app_metadata, "legacy_account_ref")) {
    throw failure("import_plan_readback_projection_incomplete");
  }
  const canonical = JSON.stringify(canonicalizeSyntheticJson(projection));
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function assertSyntheticAuth0ImportRecord(record) {
  const expectedKeys = [
    "app_metadata",
    "custom_password_hash",
    "email",
    "email_verified",
    "user_id"
  ];
  if (JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(expectedKeys)) {
    throw failure("import_plan_record_schema_invalid");
  }
  if (typeof record.email !== "string"
    || !/^[^@\s]+@example\.test$/u.test(record.email)
    || record.email !== record.email.trim().toLowerCase()) {
    throw failure("import_plan_record_email_invalid");
  }
  if (typeof record.email_verified !== "boolean") {
    throw failure("import_plan_record_email_verified_invalid");
  }
  requireSyntheticIdentifier(record.user_id, "import_plan_record_user_id_invalid");

  const metadata = validateSyntheticAuth0AppMetadata(record.app_metadata);
  if (!Object.hasOwn(metadata, "legacy_account_ref")) {
    throw failure("import_plan_record_account_ref_required");
  }
  const metadataMatches = JSON.stringify(canonicalizeSyntheticJson(metadata))
    === JSON.stringify(canonicalizeSyntheticJson(record.app_metadata));
  if (!metadataMatches) throw failure("import_plan_record_metadata_invalid");

  const expectedHash = buildAuth0CustomPasswordHash(SYNTHETIC_PORTAL_IDENTITY_FIXTURE.passwordHash);
  const hashMatches = JSON.stringify(canonicalizeSyntheticJson(record.custom_password_hash))
    === JSON.stringify(canonicalizeSyntheticJson(expectedHash));
  if (!hashMatches) throw failure("import_plan_record_password_hash_invalid");
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

// R6 synthetic idempotency contract. A provider "already imported" identity is
// accepted only when a separately obtained readback fingerprint matches the
// canonical identity-readback projection. This does not verify password credentials.
export function planSyntheticAuth0BulkImport(records, options = {}) {
  if (!Array.isArray(records)) throw failure("import_plan_records_invalid");
  if (!isPlainRecord(options)) throw failure("import_plan_options_invalid");
  if (Object.hasOwn(options, "alreadyImportedUserIds")) {
    throw failure("import_plan_provider_readback_fingerprint_required");
  }

  const readbackFingerprints = options.providerReadbackFingerprints ?? {};
  if (!isPlainRecord(readbackFingerprints)) {
    throw failure("import_plan_provider_readback_invalid");
  }

  const entries = records.map((record, index) => {
    if (!isPlainRecord(record)) throw failure("import_plan_record_invalid");
    const userId = record.user_id;
    if (typeof userId !== "string" || !userId) {
      throw failure("import_plan_record_user_id_required");
    }
    requireSyntheticIdentifier(userId, "import_plan_record_user_id_invalid");
    assertSyntheticAuth0ImportRecord(record);
    return {
      index,
      userId,
      fingerprint: fingerprintSyntheticAuth0ImportRecord(record)
    };
  });

  const batchUserIds = new Set(entries.map((entry) => entry.userId));
  const readback = new Map();
  for (const [userId, fingerprint] of Object.entries(readbackFingerprints)) {
    if (!batchUserIds.has(userId)) {
      throw failure("import_plan_provider_readback_unknown_user_id");
    }
    if (typeof fingerprint !== "string" || !/^[a-f0-9]{64}$/u.test(fingerprint)) {
      throw failure("import_plan_provider_readback_fingerprint_invalid");
    }
    readback.set(userId, fingerprint);
  }

  const seenInBatch = new Map();
  return entries.map((entry) => {
    const previous = seenInBatch.get(entry.userId);
    if (previous) {
      if (previous !== entry.fingerprint) {
        throw failure("import_plan_duplicate_user_id_conflict");
      }
      return { index: entry.index, user_id: entry.userId, action: "skip_duplicate_in_batch" };
    }

    seenInBatch.set(entry.userId, entry.fingerprint);
    if (readback.has(entry.userId)) {
      if (readback.get(entry.userId) !== entry.fingerprint) {
        throw failure("import_plan_provider_readback_mismatch");
      }
      return {
        index: entry.index,
        user_id: entry.userId,
        action: "verify_existing_password_credential",
        identityReadback: "verified",
        passwordCredential: "unverified"
      };
    }
    return { index: entry.index, user_id: entry.userId, action: "create" };
  });
}

// Returns only records that still need provider identity creation. An empty result
// does not establish password-credential acceptance for existing provider identities.
export function resumeSyntheticAuth0BulkImport(records, options = {}) {
  const plan = planSyntheticAuth0BulkImport(records, options);
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
      "provider readback acquisition/authentication and production keyed fingerprinting",
      "real-account duplicate and partial-import reconciliation",
      "provider outage and revocation behavior",
      "Android/browser parity"
    ]
  };

  return receipt;
}
