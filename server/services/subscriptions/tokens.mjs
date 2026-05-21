import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_PREFIX = "pgsub_";
const TOKEN_PREFIX_LENGTH = 14;
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i;

export function hashSubscriptionToken(rawToken) {
  return createHash("sha256").update(String(rawToken), "utf8").digest("hex");
}

export function tokenPrefix(rawToken) {
  return String(rawToken).slice(0, TOKEN_PREFIX_LENGTH);
}

export function createSubscriptionToken({ randomBytesFn = randomBytes } = {}) {
  const rawToken = `${TOKEN_PREFIX}${randomBytesFn(32).toString("base64url")}`;
  return {
    rawToken,
    tokenHash: hashSubscriptionToken(rawToken),
    tokenPrefix: tokenPrefix(rawToken)
  };
}

export function verifySubscriptionToken(rawToken, storedHash) {
  if (!SHA256_HEX_PATTERN.test(String(storedHash || ""))) {
    return false;
  }

  const candidate = Buffer.from(hashSubscriptionToken(rawToken), "hex");
  const expected = Buffer.from(String(storedHash), "hex");

  if (candidate.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(candidate, expected);
}
