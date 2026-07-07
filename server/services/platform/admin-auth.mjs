import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const DEFAULT_ISSUER = "GlobalCircle Admin";
const DEFAULT_COOKIE_NAME = "gcc_admin_session";
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60;

function authError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requiredText(value, name) {
  const text = String(value || "").trim();
  if (!text) {
    throw authError("validation_error", `${name} is required`);
  }
  return text;
}

function addSeconds(isoTimestamp, seconds) {
  return new Date(new Date(isoTimestamp).getTime() + seconds * 1000).toISOString();
}

function safeCompare(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function randomBase32Secret(length = 20) {
  let secret = "";
  for (let index = 0; index < length; index += 1) {
    secret += BASE32_ALPHABET[Math.floor(Math.random() * BASE32_ALPHABET.length)];
  }
  return secret;
}

function createTotpUri({ issuer, operatorRef, secret }) {
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30"
  });
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${operatorRef}`)}?${params.toString()}`;
}

function parseCookies(cookieHeader) {
  const cookies = new Map();
  for (const part of String(cookieHeader || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    cookies.set(part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim()));
  }
  return cookies;
}

function safeSessionSummary(session) {
  return {
    sessionRef: session.sessionRef,
    operatorRef: session.operatorRef,
    authMethod: session.authMethod,
    status: session.status,
    issuedAt: session.issuedAt,
    expiresAt: session.expiresAt
  };
}

function safeEnrollmentSummary(enrollment) {
  return {
    enrollmentRef: enrollment.enrollmentRef,
    issuer: enrollment.issuer,
    operatorRef: enrollment.operatorRef,
    manualKey: enrollment.secret,
    otpauthUri: enrollment.otpauthUri,
    issuedAt: enrollment.issuedAt,
    expiresAt: enrollment.expiresAt
  };
}

export function createAdminAuthService(options = {}) {
  const nowFn = options.nowFn || (() => new Date().toISOString());
  const bootstrapToken = requiredText(options.bootstrapToken, "bootstrapToken");
  const sessionSecret = requiredText(options.sessionSecret, "sessionSecret");
  const operatorRef = requiredText(options.operatorRef || "admin_operator_1", "operatorRef");
  const issuer = requiredText(options.issuer || DEFAULT_ISSUER, "issuer");
  const cookieName = options.cookieName || DEFAULT_COOKIE_NAME;
  const sessionTtlSeconds = options.sessionTtlSeconds ?? DEFAULT_SESSION_TTL_SECONDS;
  const enrollmentTtlSeconds = options.enrollmentTtlSeconds ?? 300;
  const enrollmentRefFactory = options.enrollmentRefFactory || (() => `admin_totp_enroll_${randomUUID()}`);
  const credentialRefFactory = options.credentialRefFactory || (() => `admin_totp_${randomUUID()}`);
  const challengeRefFactory = options.challengeRefFactory || (() => `admin_totp_challenge_${randomUUID()}`);
  const sessionRefFactory = options.sessionRefFactory || (() => `admin_session_${randomUUID()}`);
  const totpSecretFactory = options.totpSecretFactory || randomBase32Secret;
  const totpVerifier = options.totpVerifier;

  if (typeof totpVerifier !== "function") {
    throw authError("validation_error", "totpVerifier is required");
  }

  let activeOperator = null;
  const pendingEnrollments = new Map();
  const pendingChallenges = new Map();
  const sessions = new Map();

  function now() {
    const value = nowFn();
    if (!Number.isFinite(new Date(value).getTime())) {
      throw authError("validation_error", "admin auth clock is invalid");
    }
    return value;
  }

  function signSession(session) {
    return createHmac("sha256", sessionSecret)
      .update(`${session.sessionRef}:${session.operatorRef}:${session.expiresAt}`)
      .digest("hex");
  }

  function sessionCookieValue(session) {
    return `${session.sessionRef}.${signSession(session)}`;
  }

  function createSessionCookie(session) {
    return `${cookieName}=${encodeURIComponent(sessionCookieValue(session))}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${sessionTtlSeconds}`;
  }

  function clearSessionCookie() {
    return `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
  }

  function readSession(cookieHeader) {
    const cookieValue = parseCookies(cookieHeader).get(cookieName);
    if (!cookieValue) return null;
    const [sessionRef, signature] = String(cookieValue).split(".");
    const session = sessions.get(sessionRef);
    if (!session || session.status !== "active" || session.revokedAt) {
      return null;
    }
    if (new Date(session.expiresAt).getTime() <= new Date(now()).getTime()) {
      session.status = "expired";
      return null;
    }
    if (!safeCompare(signature, signSession(session))) {
      return null;
    }
    return session;
  }

  function createSession({ sourceIpSafeRef = null } = {}) {
    const issuedAt = now();
    const session = {
      sessionRef: requiredText(sessionRefFactory(), "sessionRef"),
      operatorRef,
      authMethod: "totp",
      status: "active",
      issuedAt,
      expiresAt: addSeconds(issuedAt, sessionTtlSeconds),
      sourceIpSafeRef,
      revokedAt: null
    };
    sessions.set(session.sessionRef, session);
    return {
      session: safeSessionSummary(session),
      sessionCookie: createSessionCookie(session)
    };
  }

  function assertNoActiveOperator() {
    if (activeOperator?.status === "active") {
      throw authError("admin_operator_already_configured");
    }
  }

  function startBootstrap(input = {}) {
    assertNoActiveOperator();
    if (!safeCompare(input.bootstrapToken, bootstrapToken)) {
      throw authError("invalid_admin_login");
    }
    const issuedAt = now();
    const secret = requiredText(totpSecretFactory(), "totpSecret");
    const enrollment = {
      enrollmentRef: requiredText(enrollmentRefFactory(), "enrollmentRef"),
      operatorRef,
      issuer,
      secret,
      encryptedTotpSecret: `enc:${secret}`,
      otpauthUri: createTotpUri({ issuer, operatorRef, secret }),
      issuedAt,
      expiresAt: addSeconds(issuedAt, enrollmentTtlSeconds)
    };
    pendingEnrollments.set(enrollment.enrollmentRef, enrollment);
    return { enrollment: safeEnrollmentSummary(enrollment) };
  }

  function confirmTotpEnrollment(input = {}) {
    assertNoActiveOperator();
    const checkedAt = now();
    const enrollmentRef = requiredText(input.enrollmentRef, "enrollmentRef");
    const enrollment = pendingEnrollments.get(enrollmentRef);
    if (!enrollment || new Date(enrollment.expiresAt).getTime() <= new Date(checkedAt).getTime()) {
      pendingEnrollments.delete(enrollmentRef);
      throw authError("invalid_totp");
    }
    if (!totpVerifier({ encryptedTotpSecret: enrollment.encryptedTotpSecret, code: input.code })) {
      throw authError("invalid_totp");
    }
    activeOperator = {
      operatorRef,
      status: "active",
      createdAt: checkedAt,
      credential: {
        credentialRef: requiredText(credentialRefFactory(), "credentialRef"),
        encryptedTotpSecret: enrollment.encryptedTotpSecret,
        status: "active",
        enrolledAt: checkedAt
      }
    };
    pendingEnrollments.delete(enrollmentRef);
    return createSession({ sourceIpSafeRef: input.sourceIpSafeRef });
  }

  function login(input = {}) {
    const checkedAt = now();
    if (
      activeOperator?.status !== "active"
      || input.operatorRef !== activeOperator.operatorRef
      || !safeCompare(input.bootstrapToken, bootstrapToken)
    ) {
      throw authError("invalid_admin_login");
    }
    const challenge = {
      challengeRef: requiredText(challengeRefFactory(), "challengeRef"),
      operatorRef,
      methods: ["totp"],
      issuedAt: checkedAt,
      expiresAt: addSeconds(checkedAt, 300)
    };
    pendingChallenges.set(challenge.challengeRef, challenge);
    return { challenge };
  }

  function verifyTotp(input = {}) {
    const checkedAt = now();
    const challengeRef = requiredText(input.challengeRef, "challengeRef");
    const challenge = pendingChallenges.get(challengeRef);
    if (
      activeOperator?.status !== "active"
      || !challenge
      || challenge.operatorRef !== activeOperator.operatorRef
      || new Date(challenge.expiresAt).getTime() <= new Date(checkedAt).getTime()
    ) {
      pendingChallenges.delete(challengeRef);
      throw authError("invalid_totp");
    }
    if (!totpVerifier({
      encryptedTotpSecret: activeOperator.credential.encryptedTotpSecret,
      code: input.code
    })) {
      throw authError("invalid_totp");
    }
    pendingChallenges.delete(challengeRef);
    return createSession({ sourceIpSafeRef: input.sourceIpSafeRef });
  }

  function sessionStatus(input = {}) {
    const session = readSession(input.cookieHeader);
    if (!session) {
      return { authenticated: false };
    }
    return { authenticated: true, session: safeSessionSummary(session) };
  }

  function authenticateCookie(input = {}) {
    const session = readSession(input.cookieHeader);
    return session ? safeSessionSummary(session) : null;
  }

  function logout(input = {}) {
    const session = readSession(input.cookieHeader);
    if (session) {
      session.status = "revoked";
      session.revokedAt = now();
    }
    return {
      loggedOut: true,
      clearCookie: clearSessionCookie()
    };
  }

  return {
    cookieName,
    startBootstrap,
    confirmTotpEnrollment,
    login,
    verifyTotp,
    sessionStatus,
    authenticateCookie,
    logout
  };
}

export function createPortalAccountAdminAuthService(options = {}) {
  const nowFn = options.nowFn || (() => new Date().toISOString());
  const controlStore = options.controlStore;
  const passwordCredentialService = options.passwordCredentialService;
  const sessionSecret = requiredText(options.sessionSecret, "sessionSecret");
  const accountId = requiredText(options.accountId, "accountId");
  const issuer = requiredText(options.issuer || DEFAULT_ISSUER, "issuer");
  const cookieName = options.cookieName || DEFAULT_COOKIE_NAME;
  const sessionTtlSeconds = options.sessionTtlSeconds ?? DEFAULT_SESSION_TTL_SECONDS;
  const enrollmentTtlSeconds = options.enrollmentTtlSeconds ?? 300;
  const enrollmentRefFactory = options.enrollmentRefFactory || (() => `admin_totp_enroll_${randomUUID()}`);
  const credentialRefFactory = options.credentialRefFactory || (() => `admin_totp_${randomUUID()}`);
  const challengeRefFactory = options.challengeRefFactory || (() => `admin_totp_challenge_${randomUUID()}`);
  const sessionRefFactory = options.sessionRefFactory || (() => `admin_session_${randomUUID()}`);
  const totpSecretFactory = options.totpSecretFactory || randomBase32Secret;
  const totpVerifier = options.totpVerifier;

  if (!controlStore) {
    throw authError("validation_error", "controlStore is required");
  }
  if (!passwordCredentialService) {
    throw authError("validation_error", "passwordCredentialService is required");
  }
  if (typeof totpVerifier !== "function") {
    throw authError("validation_error", "totpVerifier is required");
  }

  const pendingEnrollments = new Map();
  const pendingChallenges = new Map();
  const sessions = new Map();

  function now() {
    const value = nowFn();
    if (!Number.isFinite(new Date(value).getTime())) {
      throw authError("validation_error", "admin auth clock is invalid");
    }
    return value;
  }

  function signSession(session) {
    return createHmac("sha256", sessionSecret)
      .update(`${session.sessionRef}:${session.operatorRef}:${session.expiresAt}`)
      .digest("hex");
  }

  function sessionCookieValue(session) {
    return `${session.sessionRef}.${signSession(session)}`;
  }

  function createSessionCookie(session) {
    return `${cookieName}=${encodeURIComponent(sessionCookieValue(session))}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${sessionTtlSeconds}`;
  }

  function clearSessionCookie() {
    return `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
  }

  function readSession(cookieHeader) {
    const cookieValue = parseCookies(cookieHeader).get(cookieName);
    if (!cookieValue) return null;
    const [sessionRef, signature] = String(cookieValue).split(".");
    const session = sessions.get(sessionRef);
    if (!session || session.status !== "active" || session.revokedAt) {
      return null;
    }
    if (new Date(session.expiresAt).getTime() <= new Date(now()).getTime()) {
      session.status = "expired";
      return null;
    }
    if (!safeCompare(signature, signSession(session))) {
      return null;
    }
    return session;
  }

  function createSession({ sourceIpSafeRef = null } = {}) {
    const issuedAt = now();
    const session = {
      sessionRef: requiredText(sessionRefFactory(), "sessionRef"),
      operatorRef: accountId,
      authMethod: "totp",
      status: "active",
      issuedAt,
      expiresAt: addSeconds(issuedAt, sessionTtlSeconds),
      sourceIpSafeRef,
      revokedAt: null
    };
    sessions.set(session.sessionRef, session);
    return {
      session: safeSessionSummary(session),
      sessionCookie: createSessionCookie(session)
    };
  }

  function getActiveAccount() {
    const account = controlStore.getAccount(accountId);
    if (!account || account.status !== "active") {
      throw authError("invalid_admin_login");
    }
    return account;
  }

  function getActiveTotpCredential() {
    return controlStore.getActivePortalTotpCredential(accountId);
  }

  function verifyPassword(plainPassword) {
    getActiveAccount();
    try {
      passwordCredentialService.verifyPasswordCredential({
        accountId,
        plainPassword
      });
    } catch {
      throw authError("invalid_admin_login");
    }
  }

  function assertNoActiveOperator() {
    if (getActiveTotpCredential()) {
      throw authError("admin_operator_already_configured");
    }
  }

  function startBootstrap(input = {}) {
    assertNoActiveOperator();
    verifyPassword(input.bootstrapToken);
    const issuedAt = now();
    const secret = requiredText(totpSecretFactory(), "totpSecret");
    const enrollment = {
      enrollmentRef: requiredText(enrollmentRefFactory(), "enrollmentRef"),
      operatorRef: accountId,
      issuer,
      secret,
      encryptedTotpSecret: `enc:${secret}`,
      otpauthUri: createTotpUri({ issuer, operatorRef: accountId, secret }),
      issuedAt,
      expiresAt: addSeconds(issuedAt, enrollmentTtlSeconds)
    };
    pendingEnrollments.set(enrollment.enrollmentRef, enrollment);
    return { enrollment: safeEnrollmentSummary(enrollment) };
  }

  function confirmTotpEnrollment(input = {}) {
    assertNoActiveOperator();
    const checkedAt = now();
    const enrollmentRef = requiredText(input.enrollmentRef, "enrollmentRef");
    const enrollment = pendingEnrollments.get(enrollmentRef);
    if (!enrollment || new Date(enrollment.expiresAt).getTime() <= new Date(checkedAt).getTime()) {
      pendingEnrollments.delete(enrollmentRef);
      throw authError("invalid_totp");
    }
    if (!totpVerifier({ encryptedTotpSecret: enrollment.encryptedTotpSecret, code: input.code })) {
      throw authError("invalid_totp");
    }
    const credentialRef = requiredText(credentialRefFactory(), "credentialRef");
    controlStore.createPortalTotpCredential({
      id: credentialRef,
      accountId,
      encryptedTotpSecret: enrollment.encryptedTotpSecret,
      status: "active",
      failureCount: 0,
      enrolledAt: checkedAt,
      updatedAt: checkedAt
    });
    if (typeof controlStore.markPortalTotpVerified === "function") {
      controlStore.markPortalTotpVerified(credentialRef, {
        verifiedAt: checkedAt,
        updatedAt: checkedAt
      });
    }
    pendingEnrollments.delete(enrollmentRef);
    return createSession({ sourceIpSafeRef: input.sourceIpSafeRef });
  }

  function login(input = {}) {
    const checkedAt = now();
    if (input.operatorRef !== accountId) {
      throw authError("invalid_admin_login");
    }
    verifyPassword(input.bootstrapToken);
    const credential = getActiveTotpCredential();
    if (!credential) {
      throw authError("invalid_admin_login");
    }
    const challenge = {
      challengeRef: requiredText(challengeRefFactory(), "challengeRef"),
      operatorRef: accountId,
      methods: ["totp"],
      issuedAt: checkedAt,
      expiresAt: addSeconds(checkedAt, 300)
    };
    pendingChallenges.set(challenge.challengeRef, challenge);
    return { challenge };
  }

  function verifyTotp(input = {}) {
    const checkedAt = now();
    const challengeRef = requiredText(input.challengeRef, "challengeRef");
    const challenge = pendingChallenges.get(challengeRef);
    const credential = getActiveTotpCredential();
    if (
      !credential
      || !challenge
      || challenge.operatorRef !== accountId
      || new Date(challenge.expiresAt).getTime() <= new Date(checkedAt).getTime()
    ) {
      pendingChallenges.delete(challengeRef);
      throw authError("invalid_totp");
    }
    if (!totpVerifier({
      encryptedTotpSecret: credential.encryptedTotpSecret,
      code: input.code,
      accountId,
      credentialRef: credential.id
    })) {
      if (typeof controlStore.recordPortalTotpVerificationFailure === "function") {
        controlStore.recordPortalTotpVerificationFailure(credential.id, {
          updatedAt: checkedAt
        });
      }
      throw authError("invalid_totp");
    }
    if (typeof controlStore.markPortalTotpVerified === "function") {
      controlStore.markPortalTotpVerified(credential.id, {
        verifiedAt: checkedAt,
        updatedAt: checkedAt
      });
    }
    pendingChallenges.delete(challengeRef);
    return createSession({ sourceIpSafeRef: input.sourceIpSafeRef });
  }

  function sessionStatus(input = {}) {
    const session = readSession(input.cookieHeader);
    if (!session) {
      return {
        authenticated: false,
        mode: "portalAccount",
        operatorRef: accountId,
        setupRequired: !getActiveTotpCredential()
      };
    }
    return { authenticated: true, session: safeSessionSummary(session) };
  }

  function authenticateCookie(input = {}) {
    const session = readSession(input.cookieHeader);
    return session ? safeSessionSummary(session) : null;
  }

  function logout(input = {}) {
    const session = readSession(input.cookieHeader);
    if (session) {
      session.status = "revoked";
      session.revokedAt = now();
    }
    return {
      loggedOut: true,
      clearCookie: clearSessionCookie()
    };
  }

  return {
    cookieName,
    startBootstrap,
    confirmTotpEnrollment,
    login,
    verifyTotp,
    sessionStatus,
    authenticateCookie,
    logout
  };
}
