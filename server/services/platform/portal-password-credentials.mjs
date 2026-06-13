import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_PARAMS = {
  N: 32768,
  r: 8,
  p: 1,
  keyLength: 64,
  maxmem: 64 * 1024 * 1024
};

function passwordError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requiredText(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw passwordError("validation_error", `${field} is required`);
  }
  return normalized;
}

function isoText(value, field) {
  const raw = requiredText(value, field);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw passwordError("validation_error", `${field} must be a valid ISO timestamp`);
  }
  return date.toISOString();
}

function addSeconds(isoTimestamp, seconds) {
  return new Date(new Date(isoTimestamp).getTime() + seconds * 1000).toISOString();
}

function invalidLogin() {
  return passwordError("invalid_login", "invalid_login");
}

function normalizeSalt(value) {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  return Buffer.from(String(value ?? ""), "utf8");
}

function deriveHash(plainPassword, salt) {
  return scryptSync(requiredText(plainPassword, "plainPassword"), salt, SCRYPT_PARAMS.keyLength, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
    maxmem: SCRYPT_PARAMS.maxmem
  });
}

function encodePasswordHash(plainPassword, salt) {
  const derived = deriveHash(plainPassword, salt);
  return [
    "scrypt",
    "v=1",
    `N=${SCRYPT_PARAMS.N}`,
    `r=${SCRYPT_PARAMS.r}`,
    `p=${SCRYPT_PARAMS.p}`,
    salt.toString("base64url"),
    derived.toString("base64url")
  ].join("$");
}

function parsePasswordHash(encoded) {
  const parts = String(encoded ?? "").split("$");
  if (
    parts.length !== 7
    || parts[0] !== "scrypt"
    || parts[1] !== "v=1"
    || parts[2] !== `N=${SCRYPT_PARAMS.N}`
    || parts[3] !== `r=${SCRYPT_PARAMS.r}`
    || parts[4] !== `p=${SCRYPT_PARAMS.p}`
  ) {
    return null;
  }
  return {
    salt: Buffer.from(parts[5], "base64url"),
    hash: Buffer.from(parts[6], "base64url")
  };
}

function verifyEncodedPassword(plainPassword, encodedHash) {
  const parsed = parsePasswordHash(encodedHash);
  if (!parsed) {
    return false;
  }
  const derived = deriveHash(plainPassword, parsed.salt);
  return derived.length === parsed.hash.length && timingSafeEqual(derived, parsed.hash);
}

function safeCredentialSummary(credential, action, summaryStatus = credential.status) {
  return {
    action,
    accountId: credential.accountId,
    credentialRef: credential.id,
    status: summaryStatus,
    mustRotate: credential.mustRotate,
    hashReturned: false,
    rawPasswordReturned: false,
    safety: {
      hashReturned: false,
      rawPasswordReturned: false,
      rawSubscriptionUrlReturned: false
    }
  };
}

export function createPortalPasswordCredentialService({
  controlStore,
  nowFn = () => new Date().toISOString(),
  saltFactory = () => randomBytes(16),
  credentialRefFactory = () => `portal_pwd_${randomBytes(12).toString("hex")}`,
  maxFailures = 5,
  lockSeconds = 900
} = {}) {
  if (!controlStore) {
    throw new Error("controlStore is required");
  }

  function now() {
    return isoText(nowFn(), "now");
  }

  function issueInitialPasswordCredential(input) {
    const issuedAt = now();
    const accountId = requiredText(input?.accountId, "accountId");
    const account = controlStore.getAccount(accountId);
    if (!account || account.status !== "active") {
      throw passwordError("validation_error", "account is not active");
    }
    requiredText(input?.issuedByRef, "issuedByRef");
    requiredText(input?.approvalRef, "approvalRef");
    const plainPassword = requiredText(input?.plainPassword, "plainPassword");
    const salt = normalizeSalt(saltFactory());
    if (salt.length < 16) {
      throw passwordError("validation_error", "password salt is too short");
    }
    const credential = controlStore.createPortalPasswordCredential({
      id: requiredText(input?.credentialRef || credentialRefFactory(), "credentialRef"),
      accountId,
      passwordHash: encodePasswordHash(plainPassword, salt),
      status: "active",
      failureCount: 0,
      mustRotate: input?.mustRotate ?? true,
      createdAt: issuedAt,
      updatedAt: issuedAt
    });
    return {
      summary: safeCredentialSummary(credential, "portal_password_issued")
    };
  }

  function verifyPasswordCredential(input) {
    const verifiedAt = now();
    const accountId = requiredText(input?.accountId, "accountId");
    const plainPassword = requiredText(input?.plainPassword, "plainPassword");
    const account = controlStore.getAccount(accountId);
    if (!account || account.status !== "active") {
      throw invalidLogin();
    }
    const credential = controlStore.getActivePortalPasswordCredential(accountId);
    if (!credential) {
      throw invalidLogin();
    }
    if (credential.lockedUntil && new Date(credential.lockedUntil).getTime() > new Date(verifiedAt).getTime()) {
      throw invalidLogin();
    }
    if (!verifyEncodedPassword(plainPassword, credential.passwordHash)) {
      const shouldLock = credential.failureCount + 1 >= maxFailures;
      controlStore.recordPortalPasswordVerificationFailure(credential.id, {
        updatedAt: verifiedAt,
        lockedUntil: shouldLock ? addSeconds(verifiedAt, lockSeconds) : null
      });
      throw invalidLogin();
    }
    const verified = controlStore.markPortalPasswordVerified(credential.id, {
      verifiedAt,
      updatedAt: verifiedAt
    });
    return {
      summary: safeCredentialSummary(verified, "portal_password_verified", "verified")
    };
  }

  return {
    issueInitialPasswordCredential,
    verifyPasswordCredential
  };
}
