import { describe, expect, test, vi } from "vitest";

import { createSecureIdempotencyKey } from "../features/user-portal/secure-idempotency-key";

describe("secure Portal idempotency key generation", () => {
  test("prefers the platform randomUUID implementation", () => {
    const randomUUID = vi.fn(() => "8b2c9f14-91a7-4c6d-a3b1-2c4d5e6f7081");
    const getRandomValues = vi.fn((bytes: Uint8Array) => bytes);
    const cryptoProvider = { randomUUID, getRandomValues } as unknown as Partial<Crypto>;

    expect(createSecureIdempotencyKey(cryptoProvider)).toBe("8b2c9f14-91a7-4c6d-a3b1-2c4d5e6f7081");
    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(getRandomValues).not.toHaveBeenCalled();
  });

  test("uses 128 bits from getRandomValues when randomUUID is unavailable", () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.set(Uint8Array.from({ length: 16 }, (_, index) => index));
      return bytes;
    });
    const cryptoProvider = { getRandomValues } as unknown as Partial<Crypto>;

    const key = createSecureIdempotencyKey(cryptoProvider);
    expect(key).toBe("portal-setup-000102030405060708090a0b0c0d0e0f");
    expect(key).toMatch(/^[A-Za-z0-9][A-Za-z0-9._~-]{15,127}$/u);
    expect(getRandomValues).toHaveBeenCalledTimes(1);
    expect(getRandomValues.mock.calls[0][0]).toHaveLength(16);
  });

  test("fails closed when no cryptographic random source is available", () => {
    expect(() => createSecureIdempotencyKey(null)).toThrow("secure_random_unavailable");
    expect(() => createSecureIdempotencyKey({})).toThrow("secure_random_unavailable");
  });

  test("does not silently replace a failed secure random call", () => {
    const getRandomValues = vi.fn(() => {
      throw new Error("crypto_unavailable");
    });
    const cryptoProvider = { getRandomValues } as unknown as Partial<Crypto>;

    expect(() => createSecureIdempotencyKey(cryptoProvider)).toThrow("crypto_unavailable");
  });
});
