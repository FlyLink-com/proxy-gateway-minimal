import { createHash, randomInt, randomUUID, timingSafeEqual } from "node:crypto";

const DEFAULT_PURPOSE = "portal_registration";
const DEFAULT_TTL_SECONDS = 10 * 60;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX_ISSUES_PER_EMAIL_WINDOW = 3;
const DEFAULT_MAX_ISSUES_PER_REQUEST_KEY_WINDOW = 5;

function verificationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizeEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw verificationError("validation_error", "email is invalid");
  }
  return email;
}

function normalizePurpose(value) {
  const purpose = String(value || DEFAULT_PURPOSE).trim();
  if (!/^[a-z][a-z0-9_-]{2,63}$/.test(purpose)) {
    throw verificationError("validation_error", "email verification purpose is invalid");
  }
  return purpose;
}

function normalizeCode(value) {
  return String(value ?? "").trim();
}

function hashValue(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function hashCode({ verificationRef, email, purpose, code }) {
  return hashValue(`${verificationRef}:${email}:${purpose}:${normalizeCode(code)}`);
}

function safeCompareHex(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "hex");
  const rightBuffer = Buffer.from(String(right || ""), "hex");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function defaultCodeFactory() {
  return String(randomInt(100000, 1000000));
}

function defaultVerificationRefFactory() {
  return `reg_email_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
}

function nowMsFrom(nowFn) {
  const value = nowFn();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw verificationError("validation_error", "email verification clock is invalid");
  }
  return date.getTime();
}

function safeIssuedVerification(record, nowMs, ttlSeconds) {
  return {
    status: "requested",
    verificationRef: record.verificationRef,
    expiresInSeconds: Math.max(0, Math.min(
      ttlSeconds,
      Math.ceil((record.expiresAtMs - nowMs) / 1000)
    )),
    safety: {
      noAdminApi: true,
      noAccountCreated: true,
      noPublicAuthActivated: true,
      noRawCodeReturned: true,
      noRawEmailReturned: true
    }
  };
}

export function createPortalRegistrationEmailVerificationService(options = {}) {
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const nowFn = options.nowFn || (() => new Date());
  const codeFactory = options.codeFactory || defaultCodeFactory;
  const verificationRefFactory = options.verificationRefFactory || defaultVerificationRefFactory;
  const sender = options.sender;
  const verifications = new Map();
  const issueEvents = [];
  const rateLimitWindowMs = options.rateLimitWindowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS;
  const maxIssuesPerEmailWindow = options.maxIssuesPerEmailWindow ?? DEFAULT_MAX_ISSUES_PER_EMAIL_WINDOW;
  const maxIssuesPerRequestKeyWindow = options.maxIssuesPerRequestKeyWindow ?? DEFAULT_MAX_ISSUES_PER_REQUEST_KEY_WINDOW;

  async function sendVerificationEmail(message) {
    if (!sender) {
      throw verificationError("email_verification_unavailable", "registration email verification sender is not configured");
    }
    if (typeof sender === "function") {
      await sender(message);
      return;
    }
    if (typeof sender.sendRegistrationEmailVerification === "function") {
      await sender.sendRegistrationEmailVerification(message);
      return;
    }
    throw verificationError("email_verification_unavailable", "registration email verification sender is invalid");
  }

  function purgeIssueEvents(currentMs) {
    if (!Number.isFinite(rateLimitWindowMs) || rateLimitWindowMs <= 0) {
      issueEvents.length = 0;
      return;
    }
    const windowStartMs = currentMs - rateLimitWindowMs;
    while (issueEvents.length > 0 && issueEvents[0].issuedAtMs < windowStartMs) {
      issueEvents.shift();
    }
  }

  function enforceIssueRateLimit({ emailHash, requestKeyHash, issuedAtMs }) {
    purgeIssueEvents(issuedAtMs);
    const emailIssueCount = issueEvents.filter((event) => event.emailHash === emailHash).length;
    if (
      Number.isFinite(maxIssuesPerEmailWindow)
      && maxIssuesPerEmailWindow >= 0
      && emailIssueCount >= maxIssuesPerEmailWindow
    ) {
      throw verificationError("email_verification_rate_limited", "email verification rate limited");
    }
    if (requestKeyHash) {
      const requestKeyIssueCount = issueEvents.filter((event) => event.requestKeyHash === requestKeyHash).length;
      if (
        Number.isFinite(maxIssuesPerRequestKeyWindow)
        && maxIssuesPerRequestKeyWindow >= 0
        && requestKeyIssueCount >= maxIssuesPerRequestKeyWindow
      ) {
        throw verificationError("email_verification_rate_limited", "email verification rate limited");
      }
    }
  }

  async function issueVerification(input = {}) {
    const issuedAtMs = nowMsFrom(nowFn);
    const email = normalizeEmail(input.email);
    const purpose = normalizePurpose(input.purpose);
    const emailHash = hashValue(email);
    const requestKeyHash = input.requestContext
      ? hashValue(`${input.requestContext.sourceIp || ""}:${input.requestContext.userAgent || ""}`)
      : null;
    enforceIssueRateLimit({ emailHash, requestKeyHash, issuedAtMs });
    const code = normalizeCode(codeFactory({ email, purpose }));
    if (!/^\d{6}$/.test(code)) {
      throw verificationError("validation_error", "email verification code must be six digits");
    }
    const verificationRef = String(verificationRefFactory({ email, purpose })).trim();
    if (!verificationRef) {
      throw verificationError("validation_error", "email verification reference is required");
    }
    const record = {
      verificationRef,
      purpose,
      emailHash,
      codeHash: hashCode({ verificationRef, email, purpose, code }),
      attempts: 0,
      issuedAtMs,
      expiresAtMs: issuedAtMs + ttlSeconds * 1000,
      usedAtMs: null,
      lockedAtMs: null,
      requestKeyHash
    };
    await sendVerificationEmail({
      email,
      code,
      purpose,
      verificationRef,
      expiresAt: new Date(record.expiresAtMs).toISOString()
    });
    verifications.set(verificationRef, record);
    issueEvents.push({ emailHash, requestKeyHash, issuedAtMs });
    return {
      verification: safeIssuedVerification(record, issuedAtMs, ttlSeconds)
    };
  }

  function verifyVerification(input = {}) {
    const currentMs = nowMsFrom(nowFn);
    const verificationRef = String(input.verificationRef || input.emailVerification?.verificationRef || "").trim();
    const email = normalizeEmail(input.email);
    const purpose = normalizePurpose(input.purpose);
    const code = normalizeCode(input.code ?? input.emailVerification?.code);
    if (!verificationRef || !code) {
      throw verificationError("email_verification_required", "registration email verification is required");
    }
    const record = verifications.get(verificationRef);
    if (
      !record
      || record.purpose !== purpose
      || record.emailHash !== hashValue(email)
      || record.usedAtMs
      || record.lockedAtMs
      || currentMs > record.expiresAtMs
    ) {
      throw verificationError("email_verification_failed", "registration email verification failed");
    }
    const submittedHash = hashCode({ verificationRef, email, purpose, code });
    if (!safeCompareHex(record.codeHash, submittedHash)) {
      record.attempts += 1;
      if (record.attempts >= maxAttempts) {
        record.lockedAtMs = currentMs;
      }
      throw verificationError("email_verification_failed", "registration email verification failed");
    }
    record.usedAtMs = currentMs;
    return {
      verified: true,
      verificationRef,
      purpose,
      usedAt: new Date(currentMs).toISOString()
    };
  }

  function purgeExpired() {
    const currentMs = nowMsFrom(nowFn);
    let purged = 0;
    for (const [verificationRef, record] of verifications.entries()) {
      if (currentMs > record.expiresAtMs) {
        verifications.delete(verificationRef);
        purged += 1;
      }
    }
    return purged;
  }

  return {
    issueVerification,
    purgeExpired,
    verifyVerification
  };
}
