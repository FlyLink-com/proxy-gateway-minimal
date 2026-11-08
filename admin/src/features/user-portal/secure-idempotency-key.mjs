const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function secureRandomError() {
  return new Error("secure_random_unavailable");
}

/**
 * Create a canonical UUIDv4 using only browser cryptographic randomness.
 * Prefer the native randomUUID API; use getRandomValues as the secure fallback.
 * Never fall back to Math.random, timestamps, or other predictable sources.
 */
export function createSecurePortalSetupIdempotencyKey(cryptoSource = globalThis.crypto) {
  if (typeof cryptoSource?.randomUUID === "function") {
    let value;
    try {
      value = cryptoSource.randomUUID();
    } catch {
      throw secureRandomError();
    }
    if (typeof value !== "string" || !UUID_V4.test(value)) {
      throw secureRandomError();
    }
    return value;
  }

  if (typeof cryptoSource?.getRandomValues !== "function") {
    throw secureRandomError();
  }

  const bytes = new Uint8Array(16);
  try {
    cryptoSource.getRandomValues(bytes);
  } catch {
    throw secureRandomError();
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const value = [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20)
  ].join("-");
  if (!UUID_V4.test(value)) throw secureRandomError();
  return value;
}
