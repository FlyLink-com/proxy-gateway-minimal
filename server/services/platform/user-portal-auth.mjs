import { createHash, randomBytes } from "node:crypto";

function portalAuthError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requiredText(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw portalAuthError("validation_error", `${field} is required`);
  }
  return normalized;
}

function isoText(value, field) {
  const raw = requiredText(value, field);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw portalAuthError("validation_error", `${field} must be a valid ISO timestamp`);
  }
  return date.toISOString();
}

function ensureFuture(expiresAt, now, field) {
  if (new Date(expiresAt).getTime() <= new Date(now).getTime()) {
    throw portalAuthError("validation_error", `${field} must be in the future`);
  }
}

function hashEntryToken(rawToken) {
  return `portalentryhash_${createHash("sha256").update(requiredText(rawToken, "entryToken")).digest("hex")}`;
}

function defaultEntryTokenFactory() {
  return randomBytes(32).toString("base64url");
}

function defaultRef(prefix) {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function addSeconds(isoTimestamp, seconds) {
  return new Date(new Date(isoTimestamp).getTime() + seconds * 1000).toISOString();
}

function ensureActiveAccountAndEntitlement({ controlStore, accountId, entitlementId, now }) {
  const account = controlStore.getAccount(accountId);
  if (!account || account.status !== "active") {
    throw portalAuthError("validation_error", "account is not active");
  }

  const entitlement = controlStore.getEntitlement(entitlementId);
  if (!entitlement || entitlement.accountId !== account.id || entitlement.status !== "active") {
    throw portalAuthError("validation_error", "entitlement is not active for account");
  }
  if (new Date(entitlement.validUntil).getTime() < new Date(now).getTime()) {
    throw portalAuthError("validation_error", "entitlement is expired");
  }
  return { account, entitlement };
}

function assertUsableEntry(entry, now) {
  if (!entry) {
    throw portalAuthError("not_found", "portal entry not found");
  }
  if (entry.status !== "active") {
    throw portalAuthError("validation_error", "portal entry is not active");
  }
  if (entry.useCount >= entry.maxUses) {
    throw portalAuthError("validation_error", "portal entry usage limit reached");
  }
  if (new Date(entry.expiresAt).getTime() <= new Date(now).getTime()) {
    throw portalAuthError("validation_error", "portal entry is expired");
  }
}

function safeEntrySummary(entry) {
  return {
    action: "portal_entry_issued",
    entryRef: entry.id,
    accountId: entry.accountId,
    entitlementId: entry.entitlementId,
    status: entry.status,
    expiresAt: entry.expiresAt,
    rawTokenReturned: false,
    safety: {
      rawEntryTokenReturned: false,
      rawSubscriptionUrlReturned: false,
      runtimeDbMutated: false
    }
  };
}

function safeEnrollmentSummary(credential) {
  return {
    action: "totp_enrolled",
    accountId: credential.accountId,
    credentialRef: credential.id,
    status: credential.status,
    enrolledAt: credential.enrolledAt,
    safety: {
      encryptedTotpSecretReturned: false,
      rawEntryTokenReturned: false,
      runtimeDbMutated: false
    }
  };
}

function safeSessionSummary(session) {
  return {
    sessionRef: session.sessionRef,
    accountId: session.accountId,
    authMethod: session.authMethod,
    status: session.status,
    issuedAt: session.issuedAt,
    expiresAt: session.expiresAt,
    safety: {
      totpCodeReturned: false,
      encryptedTotpSecretReturned: false,
      rawEntryTokenReturned: false,
      runtimeDbMutated: false
    }
  };
}

export function createUserPortalAuthService({
  controlStore,
  nowFn = () => new Date().toISOString(),
  entryTokenFactory = defaultEntryTokenFactory,
  entryRefFactory = () => defaultRef("portal_entry"),
  credentialRefFactory = () => defaultRef("portal_totp"),
  sessionRefFactory = () => defaultRef("portal_session"),
  sessionExpiresAtFactory,
  totpVerifier
} = {}) {
  if (!controlStore) {
    throw new Error("controlStore is required");
  }
  if (typeof totpVerifier !== "function") {
    throw new Error("totpVerifier is required");
  }

  function now() {
    return isoText(nowFn(), "now");
  }

  function issueDynamicEntry(input) {
    const issuedAt = now();
    const accountId = requiredText(input?.accountId, "accountId");
    const entitlementId = requiredText(input?.entitlementId, "entitlementId");
    const approvalRef = requiredText(input?.approvalRef, "approvalRef");
    const issuedByRef = requiredText(input?.issuedByRef, "issuedByRef");
    const expiresAt = isoText(input?.expiresAt, "expiresAt");
    ensureFuture(expiresAt, issuedAt, "expiresAt");
    ensureActiveAccountAndEntitlement({ controlStore, accountId, entitlementId, now: issuedAt });

    const entryToken = requiredText(entryTokenFactory(), "entryToken");
    const entry = controlStore.createPortalEntry({
      id: requiredText(input?.entryRef || entryRefFactory(), "entryRef"),
      accountId,
      entitlementId,
      tokenHash: hashEntryToken(entryToken),
      status: "active",
      expiresAt,
      maxUses: input?.maxUses ?? 1,
      useCount: 0,
      issuedByRef,
      approvalRef,
      createdAt: issuedAt,
      updatedAt: issuedAt
    });

    return {
      summary: safeEntrySummary(entry),
      handoffMaterial: {
        entryRef: entry.id,
        entryToken,
        expiresAt: entry.expiresAt
      }
    };
  }

  function enrollTotpCredential(input) {
    const enrolledAt = now();
    const entryToken = requiredText(input?.entryToken, "entryToken");
    const encryptedTotpSecret = requiredText(input?.encryptedTotpSecret, "encryptedTotpSecret");
    const entry = controlStore.findPortalEntryByTokenHash(hashEntryToken(entryToken));
    assertUsableEntry(entry, enrolledAt);

    return controlStore.runInTransaction(() => {
      const credential = controlStore.createPortalTotpCredential({
        id: requiredText(input?.credentialRef || credentialRefFactory(), "credentialRef"),
        accountId: entry.accountId,
        encryptedTotpSecret,
        status: "active",
        failureCount: 0,
        enrolledAt,
        updatedAt: enrolledAt
      });
      controlStore.markPortalEntryUsed(entry.id, {
        usedAt: enrolledAt,
        updatedAt: enrolledAt
      });
      return {
        summary: safeEnrollmentSummary(credential)
      };
    });
  }

  function verifyTotpAndCreateSession(input) {
    const verifiedAt = now();
    const accountId = requiredText(input?.accountId, "accountId");
    const code = requiredText(input?.code, "code");
    const credential = controlStore.getActivePortalTotpCredential(accountId);
    if (!credential) {
      throw portalAuthError("not_found", "active portal TOTP credential not found");
    }
    if (credential.lockedUntil && new Date(credential.lockedUntil).getTime() > new Date(verifiedAt).getTime()) {
      throw portalAuthError("validation_error", "portal TOTP credential is locked");
    }

    const verified = totpVerifier({
      encryptedTotpSecret: credential.encryptedTotpSecret,
      code,
      accountId,
      credentialRef: credential.id
    });
    if (!verified) {
      controlStore.recordPortalTotpVerificationFailure(credential.id, {
        updatedAt: verifiedAt
      });
      throw portalAuthError("validation_error", "TOTP verification failed");
    }

    return controlStore.runInTransaction(() => {
      controlStore.markPortalTotpVerified(credential.id, {
        verifiedAt,
        updatedAt: verifiedAt
      });
      const session = controlStore.createPortalSession({
        id: requiredText(input?.sessionRef || sessionRefFactory(), "sessionRef"),
        accountId,
        entryId: input?.entryRef || null,
        authMethod: "totp",
        status: "active",
        issuedAt: verifiedAt,
        expiresAt: isoText(
          input?.expiresAt || (sessionExpiresAtFactory ? sessionExpiresAtFactory({ accountId, verifiedAt }) : addSeconds(verifiedAt, 1800)),
          "sessionExpiresAt"
        ),
        updatedAt: verifiedAt
      });
      return {
        session: safeSessionSummary(session)
      };
    });
  }

  return {
    issueDynamicEntry,
    enrollTotpCredential,
    verifyTotpAndCreateSession
  };
}
