import { createHash, randomInt, randomUUID, timingSafeEqual } from "node:crypto";

const DEFAULT_SCOPE = "portal_login";
const DEFAULT_TTL_SECONDS = 180;
const DEFAULT_MAX_ATTEMPTS = 3;

function challengeError() {
  const error = new Error("human verification failed");
  error.code = "human_verification_failed";
  return error;
}

function validationError(message) {
  const error = new Error(message);
  error.code = "validation_error";
  return error;
}

function normalizeScope(scope) {
  const value = String(scope || DEFAULT_SCOPE).trim();
  if (!/^[a-z][a-z0-9_-]{2,63}$/.test(value)) {
    throw validationError("challenge scope is invalid");
  }
  return value;
}

function normalizeAnswer(answer) {
  return String(answer ?? "").trim();
}

function hashValue(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function hashAnswer({ challengeRef, scope, answer }) {
  return hashValue(`${challengeRef}:${scope}:${normalizeAnswer(answer)}`);
}

function safeCompareHex(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "hex");
  const rightBuffer = Buffer.from(String(right || ""), "hex");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function defaultChallengeFactory() {
  const left = randomInt(2, 10);
  const right = randomInt(2, 10);
  return {
    prompt: `${left} + ${right} = ?`,
    answer: String(left + right)
  };
}

function safeChallenge(record, nowMs, ttlSeconds) {
  const expiresInSeconds = Math.max(0, Math.ceil((record.expiresAtMs - nowMs) / 1000));
  return {
    challengeRef: record.challengeRef,
    type: record.type,
    prompt: record.prompt,
    expiresInSeconds: Math.min(ttlSeconds, expiresInSeconds)
  };
}

export function createPortalHumanChallengeService(options = {}) {
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const nowFn = options.nowFn || (() => new Date().toISOString());
  const challengeRefFactory = options.challengeRefFactory || (() => `phc_${randomUUID()}`);
  const challengeFactory = options.challengeFactory || defaultChallengeFactory;
  const challenges = new Map();

  function nowMs() {
    const value = Date.parse(nowFn());
    if (!Number.isFinite(value)) {
      throw validationError("challenge clock is invalid");
    }
    return value;
  }

  function issueChallenge(input = {}) {
    const issuedAtMs = nowMs();
    const scope = normalizeScope(input.scope);
    const challengeRef = String(challengeRefFactory()).trim();
    if (!challengeRef) {
      throw validationError("challenge reference is required");
    }
    const challenge = challengeFactory({ scope });
    const prompt = String(challenge?.prompt || "").trim();
    const answer = normalizeAnswer(challenge?.answer);
    if (!prompt || !answer) {
      throw validationError("challenge prompt and answer are required");
    }
    const record = {
      challengeRef,
      scope,
      type: "math",
      prompt,
      answerHash: hashAnswer({ challengeRef, scope, answer }),
      attempts: 0,
      issuedAtMs,
      expiresAtMs: issuedAtMs + ttlSeconds * 1000,
      usedAtMs: null,
      lockedAtMs: null,
      requestKeyHash: input.requestContext
        ? hashValue(`${input.requestContext.sourceIp || ""}:${input.requestContext.userAgent || ""}`)
        : null
    };
    challenges.set(challengeRef, record);
    return {
      challenge: safeChallenge(record, issuedAtMs, ttlSeconds)
    };
  }

  function verifyChallenge(input = {}) {
    const currentMs = nowMs();
    const challengeRef = String(input.challengeRef || "").trim();
    const scope = normalizeScope(input.scope);
    const record = challenges.get(challengeRef);
    if (
      !record
      || record.scope !== scope
      || record.usedAtMs
      || record.lockedAtMs
      || currentMs > record.expiresAtMs
    ) {
      throw challengeError();
    }
    const submittedHash = hashAnswer({
      challengeRef,
      scope,
      answer: input.answer
    });
    if (!safeCompareHex(record.answerHash, submittedHash)) {
      record.attempts += 1;
      if (record.attempts >= maxAttempts) {
        record.lockedAtMs = currentMs;
      }
      throw challengeError();
    }
    record.usedAtMs = currentMs;
    return {
      verified: true,
      challengeRef,
      scope,
      usedAt: new Date(currentMs).toISOString()
    };
  }

  function purgeExpired() {
    const currentMs = nowMs();
    let purged = 0;
    for (const [challengeRef, record] of challenges.entries()) {
      if (currentMs > record.expiresAtMs) {
        challenges.delete(challengeRef);
        purged += 1;
      }
    }
    return purged;
  }

  return {
    issueChallenge,
    verifyChallenge,
    purgeExpired
  };
}
