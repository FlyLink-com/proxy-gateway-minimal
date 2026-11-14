import { createHash, randomBytes } from "node:crypto";
import { maskEmail } from "./email-masking.mjs";

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

const BROWSER_SESSION_PREFIX = "portalbrowser_";
const BROWSER_CONTEXT_PREFIX = "portalctx_";
const BROWSER_CONVERSION_MAX_AGE_MS = 60_000;
const BROWSER_CONVERSION_MAX_ENTRIES = 1024;

function rememberPreference(value) {
  if (value === undefined) return false;
  if (typeof value !== "boolean") throw portalAuthError("validation_error", "rememberMe must be a boolean");
  return value;
}

function legacySessionReference(value) {
  const sessionRef = String(value ?? "").trim();
  if (!sessionRef || sessionRef.startsWith(BROWSER_SESSION_PREFIX) || sessionRef.startsWith(BROWSER_CONTEXT_PREFIX)) {
    throw portalAuthError("invalid_session", "portal session is invalid");
  }
  return sessionRef;
}

function browserSessionId(cookieValue) {
  if (typeof cookieValue !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(cookieValue)
    || Buffer.from(cookieValue, "base64url").length !== 32
    || Buffer.from(cookieValue, "base64url").toString("base64url") !== cookieValue) {
    throw portalAuthError("invalid_session", "portal browser session is invalid");
  }
  return `${BROWSER_SESSION_PREFIX}${createHash("sha256").update(cookieValue).digest("hex")}`;
}

function browserSessionContext(sessionId) {
  return `${BROWSER_CONTEXT_PREFIX}${createHash("sha256").update(`context:${sessionId}`).digest("hex")}`;
}

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const DEFAULT_TOTP_ISSUER = "GlobalCircle";

function addSeconds(isoTimestamp, seconds) {
  return new Date(new Date(isoTimestamp).getTime() + seconds * 1000).toISOString();
}

function positiveIntegerOrDefault(value, fallback) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
}

function shouldLockAfterFailure(failureCount, maxFailures) {
  return Number(failureCount || 0) + 1 >= maxFailures;
}

function randomBase32Secret(byteLength = 20) {
  const bytes = randomBytes(byteLength);
  let bits = "";
  for (const byte of bytes) {
    bits += byte.toString(2).padStart(8, "0");
  }
  let secret = "";
  for (let offset = 0; offset + 5 <= bits.length; offset += 5) {
    secret += BASE32_ALPHABET[Number.parseInt(bits.slice(offset, offset + 5), 2)];
  }
  return secret;
}

function createTotpUri({ issuer, accountLabel, secret }) {
  const safeIssuer = requiredText(issuer, "issuer");
  const safeAccountLabel = requiredText(accountLabel, "accountLabel");
  const label = `${safeIssuer}:${safeAccountLabel}`;
  const params = new URLSearchParams({
    secret,
    issuer: safeIssuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30"
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
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

function safeSecondFactorChallenge(challenge) {
  return {
    status: "second_factor_required",
    challengeRef: challenge.id,
    accountId: challenge.accountId,
    availableFactors: challenge.allowedFactors,
    expiresAt: challenge.expiresAt,
    safety: {
      noSessionCreated: true,
      hashReturned: false,
      rawPasswordReturned: false,
      rawSubscriptionUrlReturned: false
    }
  };
}

function safeSecurityState({ account, authenticatorBound, passkeyExported }) {
  const metadata = account?.metadata && typeof account.metadata === "object" ? account.metadata : {};
  const initialAccount = Boolean(metadata.initialAccount || metadata.requireSecuritySetup);
  return {
    authenticatorBound,
    initialAccount,
    passkeyEnabled: false,
    passkeyExported,
    setupRequired: initialAccount && !authenticatorBound,
    safety: {
      noAdminApi: true,
      noPublicAdmin: true,
      noRawSecretReturned: true
    }
  };
}

function normalizeEmailLogin(value) {
  const email = String(value ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function safeTotpEnrollment(enrollment) {
  return {
    enrollmentRef: enrollment.enrollmentRef,
    issuer: enrollment.issuer,
    accountLabel: enrollment.accountLabel,
    manualKey: enrollment.secret,
    otpauthUri: enrollment.otpauthUri,
    expiresAt: enrollment.expiresAt,
    expiresInSeconds: Math.max(0, Math.ceil((new Date(enrollment.expiresAt).getTime() - new Date(enrollment.issuedAt).getTime()) / 1000)),
    issuedAt: enrollment.issuedAt,
    safety: {
      noAdminApi: true,
      noPublicAdmin: true,
      noDbMutationBeforeConfirm: true
    }
  };
}

export function createUserPortalAuthService({
  controlStore,
  nowFn = () => new Date().toISOString(),
  entryTokenFactory = defaultEntryTokenFactory,
  entryRefFactory = () => defaultRef("portal_entry"),
  credentialRefFactory = () => defaultRef("portal_totp"),
  secondFactorChallengeRefFactory = () => defaultRef("portal_mfa"),
  sessionRefFactory = () => defaultRef("portal_session"),
  totpEnrollmentRefFactory = () => defaultRef("portal_totp_enroll"),
  totpSecretFactory = () => randomBase32Secret(),
  totpIssuer = DEFAULT_TOTP_ISSUER,
  sessionExpiresAtFactory,
  totpVerifier,
  totpSecretProtector = null,
  passwordCredentialService,
  allowPasswordOnlySessionForSetup = false,
  totpMaxFailures = 5,
  totpLockSeconds = 900,
  secondFactorMaxFailures = 5
} = {}) {
  if (!controlStore) {
    throw new Error("controlStore is required");
  }
  if (typeof totpVerifier !== "function") {
    throw new Error("totpVerifier is required");
  }
  const maxTotpFailures = positiveIntegerOrDefault(totpMaxFailures, 5);
  const totpLockDurationSeconds = positiveIntegerOrDefault(totpLockSeconds, 900);
  const maxSecondFactorFailures = positiveIntegerOrDefault(secondFactorMaxFailures, 5);

  function now() {
    return isoText(nowFn(), "now");
  }

  const browserConversions = new Map();

  function pruneBrowserConversions(checkedAt) {
    const checkedMs = Date.parse(checkedAt);
    for (const [key, value] of browserConversions) {
      const age = checkedMs - Date.parse(value.issuedAt);
      if (age < 0 || age > BROWSER_CONVERSION_MAX_AGE_MS) browserConversions.delete(key);
    }
  }

  function createSession({ accountId, entryId = null, authMethod, issuedAt, expiresAt, rememberMe = false }) {
    const remembered = rememberPreference(rememberMe);
    const session = controlStore.createPortalSession({
      id: legacySessionReference(requiredText(sessionRefFactory(), "sessionRef")),
      accountId,
      entryId,
      authMethod,
      status: "active",
      issuedAt,
      expiresAt: isoText(
        expiresAt || (sessionExpiresAtFactory ? sessionExpiresAtFactory({ accountId, verifiedAt: issuedAt }) : addSeconds(issuedAt, 1800)),
        "sessionExpiresAt"
      ),
      updatedAt: issuedAt
    });
    // Only this service's freshly completed authentication may be converted.
    // This is transient one-use authorization, not session persistence storage.
    pruneBrowserConversions(issuedAt);
    while (browserConversions.size >= BROWSER_CONVERSION_MAX_ENTRIES) {
      browserConversions.delete(browserConversions.keys().next().value);
    }
    browserConversions.set(session.sessionRef, { accountId, issuedAt, rememberMe: remembered });
    return {
      session: safeSessionSummary(session),
      rememberMe: remembered
    };
  }

  const pendingTotpEnrollments = new Map();

  function getActiveSessionContext(sessionRef) {
    const checkedAt = now();
    const normalizedSessionRef = String(sessionRef ?? "").trim();
    if (!normalizedSessionRef) {
      throw portalAuthError("invalid_session", "portal session is required");
    }
    const session = controlStore.getPortalSession(normalizedSessionRef);
    if (!session || session.status !== "active" || session.revokedAt) {
      throw portalAuthError("invalid_session", "portal session is not active");
    }
    if (new Date(session.expiresAt).getTime() <= new Date(checkedAt).getTime()) {
      throw portalAuthError("invalid_session", "portal session is expired");
    }
    const account = controlStore.getAccount(session.accountId);
    if (!account || account.status !== "active") {
      throw portalAuthError("invalid_session", "portal account is not active");
    }
    return { session, account, checkedAt };
  }

  function publicBrowserSession({ session, account }) {
    const metadata = account.metadata && typeof account.metadata === "object" ? account.metadata : {};
    // Display only: the session summary carries the masked email, never the
    // raw login reference. Login resolution keeps using the raw email inside
    // the server (G-02); the masked value is not an identifier.
    const userRef = maskEmail(normalizeEmailLogin(metadata.loginRef));
    return {
      sessionRef: browserSessionContext(session.sessionRef),
      transport: "cookie",
      authMethod: session.authMethod,
      status: "active",
      issuedAt: session.issuedAt,
      expiresAt: session.expiresAt,
      userRef,
      displayName: userRef
    };
  }

  function requireBrowserContext(cookieValue, sessionContext) {
    const sessionId = browserSessionId(cookieValue);
    if (typeof sessionContext !== "string" || sessionContext !== browserSessionContext(sessionId)) {
      throw portalAuthError("invalid_session", "portal browser session is invalid");
    }
    return sessionId;
  }

  function createBrowserSession(input = {}) {
    const sessionRef = legacySessionReference(input.sessionRef);
    const remembered = rememberPreference(input.rememberMe);
    const checkedAt = now();
    pruneBrowserConversions(checkedAt);
    const eligible = browserConversions.get(sessionRef);
    if (!eligible || eligible.rememberMe !== remembered) {
      throw portalAuthError("invalid_session", "fresh portal session conversion is required");
    }
    const source = getActiveSessionContext(sessionRef);
    if (source.session.issuedAt !== eligible.issuedAt || source.account.id !== eligible.accountId) {
      throw portalAuthError("invalid_session", "fresh portal session conversion is required");
    }
    const previousId = input.previousCookieValue === undefined || input.previousCookieValue === null
      ? null : browserSessionId(input.previousCookieValue);
    const cookieValue = randomBytes(32).toString("base64url");
    const id = browserSessionId(cookieValue);
    // Consume before attempting persistence. A failed conversion must not turn
    // a previous login response into a retryable long-lived credential mint.
    browserConversions.delete(sessionRef);
    return controlStore.runInTransaction(() => {
      const current = getActiveSessionContext(sessionRef);
      const session = controlStore.createPortalSession({
        id, accountId: current.account.id, entryId: current.session.entryId,
        authMethod: current.session.authMethod, status: "active", issuedAt: eligible.issuedAt,
        expiresAt: addSeconds(eligible.issuedAt, remembered ? 604800 : 1800), updatedAt: checkedAt
      });
      controlStore.revokePortalSession(sessionRef, { revokedAt: checkedAt, updatedAt: checkedAt });
      if (previousId) controlStore.revokePortalSession(previousId, { revokedAt: checkedAt, updatedAt: checkedAt });
      return { cookieValue, session: publicBrowserSession({ session, account: current.account }) };
    });
  }

  function enabledSecondFactors(accountId) {
    const factors = [];
    if (controlStore.getActivePortalTotpCredential(accountId)) {
      factors.push("totp");
    }
    if (
      typeof controlStore.listActivePortalPasskeyCredentials === "function"
      && controlStore.listActivePortalPasskeyCredentials(accountId).length > 0
    ) {
      factors.push("passkey");
    }
    return factors;
  }

  function resolvePasswordLoginAccount(loginRef) {
    const normalizedLoginRef = requiredText(loginRef, "accountId");
    if (typeof controlStore.resolvePortalLoginAccount === "function") {
      const resolved = controlStore.resolvePortalLoginAccount(normalizedLoginRef);
      if (!resolved || resolved.status !== "resolved" || !resolved.account) {
        throw portalAuthError("invalid_login", "invalid_login");
      }
      return resolved.account;
    }
    const account = controlStore.getAccount(normalizedLoginRef);
    if (!account) {
      throw portalAuthError("invalid_login", "invalid_login");
    }
    return account;
  }

  function getSecurityState(input) {
    const { account } = getActiveSessionContext(input?.sessionRef);
    return {
      security: safeSecurityState({
        account,
        authenticatorBound: Boolean(controlStore.getActivePortalTotpCredential(account.id)),
        passkeyExported: false
      })
    };
  }

  function protectTotpSecret(secret) {
    if (!totpSecretProtector || typeof totpSecretProtector.protect !== "function") {
      throw portalAuthError("validation_error", "portal TOTP secret protector is required");
    }
    return requiredText(totpSecretProtector.protect(secret), "encryptedTotpSecret");
  }

  function protectIncomingTotpSecret(value) {
    const encryptedTotpSecret = requiredText(value, "encryptedTotpSecret");
    if (!encryptedTotpSecret.startsWith("enc:")) {
      throw portalAuthError("validation_error", "portal TOTP enrollment secret must use enc format before server-side protection");
    }
    return protectTotpSecret(requiredText(encryptedTotpSecret.slice(4), "totpSecret"));
  }

  function totpEnrollmentAuditId() {
    return defaultRef("totpaudit");
  }

  function totpEnrollmentEnvelopeFormat(encryptedTotpSecret) {
    if (encryptedTotpSecret.startsWith("v2:")) return "v2";
    if (encryptedTotpSecret.startsWith("enc:")) return "enc";
    // B2-9 (G-08): the bound event is evidence, not a second gate. The
    // production Portal protector always yields a v2 envelope, but an
    // injected protector may return a value with neither prefix (an
    // existing browser-session test does exactly this). Failing the
    // enrollment here would turn evidence into a behavior change, so an
    // unrecognized envelope is recorded as "unknown" instead of throwing.
    return "unknown";
  }

  function recordTotpEnrollmentAuditEvent(input) {
    // B2-9 (G-08): TOTP enrollment lifecycle proof. The production control
    // store always exposes recordAuditEvent; minimal test doubles may not.
    // In that case no persistent evidence is recorded for the enrollment,
    // which the B2-9 specification records. The event carries only
    // references, channels, results and timestamps — never secret material,
    // verification codes or ciphertext.
    if (!controlStore || typeof controlStore.recordAuditEvent !== "function") return null;
    return controlStore.recordAuditEvent(input);
  }

  function startTotpEnrollment(input) {
    const { account, checkedAt } = getActiveSessionContext(input?.sessionRef);
    const enrollmentRef = requiredText(input?.enrollmentRef || totpEnrollmentRefFactory(), "enrollmentRef");
    const secret = requiredText(totpSecretFactory(), "totpSecret");
    const expiresAt = addSeconds(checkedAt, 300);
    const issuer = requiredText(input?.issuer || totpIssuer, "issuer");
    const accountLabel = requiredText(input?.accountLabel || account.id, "accountLabel");
    const enrollment = {
      enrollmentRef,
      accountId: account.id,
      issuer,
      accountLabel,
      secret,
      encryptedTotpSecret: protectTotpSecret(secret),
      otpauthUri: createTotpUri({ issuer, accountLabel, secret }),
      issuedAt: checkedAt,
      expiresAt
    };
    pendingTotpEnrollments.set(enrollmentRef, enrollment);
    try {
      recordTotpEnrollmentAuditEvent({
        id: totpEnrollmentAuditId(),
        entityType: "totp_enrollment",
        entityRef: account.id,
        action: "totp_enrollment_started",
        actorRef: account.id,
        createdAt: checkedAt,
        metadata: {
          enrollmentRef,
          accountRef: account.id,
          channel: "portal",
          issuedAt: checkedAt,
          expiresAt
        }
      });
    } catch (error) {
      // Fail closed: an enrollment without its initiation evidence must not
      // stay pending.
      pendingTotpEnrollments.delete(enrollmentRef);
      throw error;
    }
    return {
      enrollment: safeTotpEnrollment(enrollment)
    };
  }

  function confirmTotpEnrollment(input) {
    const { account, checkedAt } = getActiveSessionContext(input?.sessionRef);
    const enrollmentRef = requiredText(input?.enrollmentRef, "enrollmentRef");
    const enrollment = pendingTotpEnrollments.get(enrollmentRef);
    if (!enrollment || enrollment.accountId !== account.id) {
      throw portalAuthError("validation_error", "portal TOTP enrollment is not active");
    }
    if (new Date(enrollment.expiresAt).getTime() <= new Date(checkedAt).getTime()) {
      pendingTotpEnrollments.delete(enrollmentRef);
      throw portalAuthError("validation_error", "portal TOTP enrollment is expired");
    }
    const verified = totpVerifier({
      encryptedTotpSecret: enrollment.encryptedTotpSecret,
      code: requiredText(input?.code, "code"),
      accountId: account.id,
      credentialRef: enrollmentRef
    });
    if (!verified) {
      // B2-9 (G-08): a failed confirmation code is itself lifecycle
      // evidence — recorded without the code value. The enrollment stays
      // pending so the user may retry within its validity window.
      recordTotpEnrollmentAuditEvent({
        id: totpEnrollmentAuditId(),
        entityType: "totp_enrollment",
        entityRef: account.id,
        action: "totp_enrollment_code_verified",
        actorRef: account.id,
        createdAt: checkedAt,
        metadata: {
          enrollmentRef,
          accountRef: account.id,
          channel: "portal",
          result: "failed",
          verifiedAt: checkedAt
        }
      });
      throw portalAuthError("validation_error", "TOTP verification failed");
    }
    return controlStore.runInTransaction(() => {
      const credential = controlStore.createPortalTotpCredential({
        id: requiredText(input?.credentialRef || credentialRefFactory(), "credentialRef"),
        accountId: account.id,
        encryptedTotpSecret: enrollment.encryptedTotpSecret,
        status: "active",
        failureCount: 0,
        enrolledAt: checkedAt,
        updatedAt: checkedAt
      });
      if (typeof controlStore.markPortalTotpVerified === "function") {
        controlStore.markPortalTotpVerified(credential.id, {
          verifiedAt: checkedAt,
          updatedAt: checkedAt
        });
      }
      // B2-9 (G-08): the verification and binding evidence is written in
      // the same transaction as the credential row, so a bound credential
      // never exists without its proof. The pending enrollment is deleted
      // only after the evidence is recorded, so an audit failure leaves the
      // enrollment retryable and the transaction rolls back.
      recordTotpEnrollmentAuditEvent({
        id: totpEnrollmentAuditId(),
        entityType: "totp_enrollment",
        entityRef: account.id,
        action: "totp_enrollment_code_verified",
        actorRef: account.id,
        createdAt: checkedAt,
        metadata: {
          enrollmentRef,
          accountRef: account.id,
          channel: "portal",
          result: "verified",
          verifiedAt: checkedAt
        }
      });
      recordTotpEnrollmentAuditEvent({
        id: totpEnrollmentAuditId(),
        entityType: "totp_enrollment",
        entityRef: account.id,
        action: "totp_enrollment_bound",
        actorRef: account.id,
        createdAt: checkedAt,
        metadata: {
          enrollmentRef,
          totpRef: credential.id,
          accountRef: account.id,
          channel: "portal",
          enrolledAt: checkedAt,
          envelopeFormat: totpEnrollmentEnvelopeFormat(enrollment.encryptedTotpSecret),
          accountMatches: true
        }
      });
      pendingTotpEnrollments.delete(enrollmentRef);
      return {
        binding: {
          status: "bound",
          accountId: account.id,
          method: "totp",
          boundAt: checkedAt,
          safety: {
            noAdminApi: true,
            noPublicAdmin: true,
            noRawSecretReturned: true
          }
        }
      };
    });
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
    const encryptedTotpSecret = protectIncomingTotpSecret(input?.encryptedTotpSecret);
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
      // B2-9 (G-08): the entry path has no start step and performs no code
      // verification — it trusts the entry token itself. Its lifecycle
      // evidence is the binding event alone, carrying the consumed entry
      // reference and the account-consistency result.
      recordTotpEnrollmentAuditEvent({
        id: totpEnrollmentAuditId(),
        entityType: "totp_enrollment",
        entityRef: entry.accountId,
        action: "totp_enrollment_bound",
        actorRef: entry.accountId,
        createdAt: enrolledAt,
        metadata: {
          entryRef: entry.id,
          totpRef: credential.id,
          accountRef: entry.accountId,
          channel: "entry",
          enrolledAt,
          envelopeFormat: totpEnrollmentEnvelopeFormat(encryptedTotpSecret),
          accountMatches: true
        }
      });
      return {
        summary: safeEnrollmentSummary(credential)
      };
    });
  }

  function verifyTotpAndCreateSession(input) {
    const verifiedAt = now();
    const rememberMe = rememberPreference(input?.rememberMe);
    const accountId = requiredText(input?.accountId, "accountId");
    const code = requiredText(input?.code, "code");
    // Re-check account status before verifying the code (same source and
    // same fail-closed error as the password-login check): the deletion
    // freeze writes status='suspended' to the account row, and a frozen
    // account must not complete the second factor even while its TOTP
    // credential is still active (steps 1-3 window). Checked before any
    // credential work so a frozen account neither verifies a code nor
    // burns a failure count.
    const account = controlStore.getAccount(accountId);
    if (!account || account.status !== "active") {
      throw portalAuthError("invalid_login", "invalid_login");
    }
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
      const shouldLockTotp = shouldLockAfterFailure(credential.failureCount, maxTotpFailures);
      controlStore.recordPortalTotpVerificationFailure(credential.id, {
        lockedUntil: shouldLockTotp ? addSeconds(verifiedAt, totpLockDurationSeconds) : null,
        updatedAt: verifiedAt
      });
      throw portalAuthError("validation_error", "TOTP verification failed");
    }

    return controlStore.runInTransaction(() => {
      controlStore.markPortalTotpVerified(credential.id, {
        verifiedAt,
        updatedAt: verifiedAt
      });
      return createSession({
        accountId,
        entryId: input?.entryRef || null,
        authMethod: "totp",
        issuedAt: verifiedAt,
        expiresAt: input?.expiresAt,
        rememberMe
      });
    });
  }

  function verifyPasswordAndMaybeChallenge(input) {
    const verifiedAt = now();
    const rememberMe = rememberPreference(input?.rememberMe);
    if (!passwordCredentialService) {
      throw portalAuthError("validation_error", "password credential service is not configured");
    }
    const account = resolvePasswordLoginAccount(input?.accountId);
    if (!account || account.status !== "active") {
      throw portalAuthError("invalid_login", "invalid_login");
    }
    const accountId = account.id;
    passwordCredentialService.verifyPasswordCredential({
      accountId,
      plainPassword: requiredText(input?.plainPassword, "plainPassword"),
      requestContext: input?.requestContext
    });

    const availableFactors = enabledSecondFactors(accountId);
    if (availableFactors.length > 0) {
      const expiresAt = addSeconds(verifiedAt, 300);
      const challenge = controlStore.createPortalSecondFactorChallenge({
        id: requiredText(input?.challengeRef || secondFactorChallengeRefFactory(), "challengeRef"),
        accountId,
        challengeHash: `portalmfahash_${createHash("sha256").update(`${accountId}|${verifiedAt}|${availableFactors.join(",")}`).digest("hex")}`,
        allowedFactors: availableFactors,
        rememberMe,
        status: "active",
        expiresAt,
        createdAt: verifiedAt,
        updatedAt: verifiedAt
      });
      return {
        result: safeSecondFactorChallenge(challenge)
      };
    }

    if (!allowPasswordOnlySessionForSetup) {
      throw portalAuthError("validation_error", "second factor is required");
    }
    return createSession({
      accountId,
      authMethod: "password",
      issuedAt: verifiedAt,
      expiresAt: input?.expiresAt,
      rememberMe
    });
  }

  function completeSecondFactor(input) {
    const verifiedAt = now();
    const challengeRef = requiredText(input?.challengeRef, "challengeRef");
    const factor = requiredText(input?.factor, "factor");
    const challenge = controlStore.getPortalSecondFactorChallenge(challengeRef);
    if (!challenge || challenge.status !== "active") {
      throw portalAuthError("validation_error", "portal second-factor challenge is not active");
    }
    const rememberMe = rememberPreference(challenge.rememberMe);
    if (input?.rememberMe !== undefined && rememberPreference(input.rememberMe) !== rememberMe) {
      throw portalAuthError("validation_error", "rememberMe must match the password challenge");
    }
    if (new Date(challenge.expiresAt).getTime() <= new Date(verifiedAt).getTime()) {
      throw portalAuthError("validation_error", "portal second-factor challenge is expired");
    }
    if (!challenge.allowedFactors.includes(factor)) {
      throw portalAuthError("validation_error", "portal second-factor method is not available");
    }
    if (factor !== "totp") {
      throw portalAuthError("validation_error", "passkey second factor is not configured");
    }

    // Same account-status re-check as verifyTotpAndCreateSession: a
    // challenge issued before the freeze must not complete once the
    // account is suspended. Checked before any credential work; the
    // challenge is left active (it expires on its own TTL) and no
    // session is created. Fail closed.
    const account = controlStore.getAccount(challenge.accountId);
    if (!account || account.status !== "active") {
      throw portalAuthError("invalid_login", "invalid_login");
    }

    const credential = controlStore.getActivePortalTotpCredential(challenge.accountId);
    if (!credential) {
      throw portalAuthError("not_found", "active portal TOTP credential not found");
    }
    if (credential.lockedUntil && new Date(credential.lockedUntil).getTime() > new Date(verifiedAt).getTime()) {
      throw portalAuthError("validation_error", "portal TOTP credential is locked");
    }

    const verified = totpVerifier({
      encryptedTotpSecret: credential.encryptedTotpSecret,
      code: requiredText(input?.code, "code"),
      accountId: challenge.accountId,
      credentialRef: credential.id
    });
    if (!verified) {
      const shouldLockTotp = shouldLockAfterFailure(credential.failureCount, maxTotpFailures);
      const shouldLockChallenge = shouldLockAfterFailure(challenge.failureCount, maxSecondFactorFailures);
      controlStore.runInTransaction(() => {
        controlStore.recordPortalTotpVerificationFailure(credential.id, {
          lockedUntil: shouldLockTotp ? addSeconds(verifiedAt, totpLockDurationSeconds) : null,
          updatedAt: verifiedAt
        });
        controlStore.recordPortalSecondFactorChallengeFailure(challenge.id, {
          locked: shouldLockChallenge,
          updatedAt: verifiedAt
        });
      });
      throw portalAuthError("validation_error", "TOTP verification failed");
    }

    return controlStore.runInTransaction(() => {
      controlStore.markPortalTotpVerified(credential.id, {
        verifiedAt,
        updatedAt: verifiedAt
      });
      controlStore.markPortalSecondFactorChallengeUsed(challenge.id, {
        usedAt: verifiedAt,
        updatedAt: verifiedAt
      });
      return createSession({
        accountId: challenge.accountId,
        authMethod: "totp",
        issuedAt: verifiedAt,
        expiresAt: input?.expiresAt,
        rememberMe
      });
    });
  }

  return {
    issueDynamicEntry,
    enrollTotpCredential,
    verifyTotpAndCreateSession,
    verifyPasswordAndMaybeChallenge,
    createPasswordSetupSession(input = {}) {
      const issuedAt = now();
      const accountId = requiredText(input.accountId, "accountId");
      const account = controlStore.getAccount(accountId);
      if (!account || account.status !== "active") {
        throw portalAuthError("invalid_login", "invalid_login");
      }
      const publicRef = maskEmail(normalizeEmailLogin(input.loginRef));
      const { session } = createSession({
        accountId,
        authMethod: "password",
        issuedAt,
        expiresAt: input.expiresAt
      });
      return {
        session: {
          ...session,
          accountId: undefined,
          userRef: publicRef,
          displayName: publicRef
        }
      };
    },
    completeSecondFactor,
    createBrowserSession,
    getBrowserSession(input = {}) {
      return publicBrowserSession(getActiveSessionContext(browserSessionId(input.cookieValue)));
    },
    requireBrowserSession(input = {}) {
      const sessionId = requireBrowserContext(input.cookieValue, input.sessionContext);
      const { session, account } = getActiveSessionContext(sessionId);
      return { sessionRef: session.sessionRef, accountId: account.id };
    },
    revokeBrowserSession(input = {}) {
      const sessionId = requireBrowserContext(input.cookieValue, input.sessionContext);
      const checkedAt = now();
      controlStore.revokePortalSession(sessionId, { revokedAt: checkedAt, updatedAt: checkedAt });
      return { loggedOut: true };
    },
    revokeSession(input = {}) {
      const sessionRef = legacySessionReference(input.sessionRef);
      browserConversions.delete(sessionRef);
      const checkedAt = now();
      controlStore.revokePortalSession(sessionRef, { revokedAt: checkedAt, updatedAt: checkedAt });
      return { loggedOut: true };
    },
    requireSession(input = {}) {
      const { session, account } = getActiveSessionContext(legacySessionReference(input.sessionRef));
      return {
        sessionRef: session.sessionRef,
        accountId: account.id
      };
    },
    getSecurityState,
    startTotpEnrollment,
    confirmTotpEnrollment
  };
}
