type SecureCryptoProvider = Partial<Pick<Crypto, "randomUUID" | "getRandomValues">>;

/** Generate an idempotency key using only browser cryptographic randomness. */
export function createSecureIdempotencyKey(
  cryptoProvider: SecureCryptoProvider | undefined = globalThis.crypto
): string {
  const randomUUID = cryptoProvider?.randomUUID;
  if (typeof randomUUID === "function") {
    return randomUUID.call(cryptoProvider);
  }

  const getRandomValues = cryptoProvider?.getRandomValues;
  if (typeof getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    getRandomValues.call(cryptoProvider, bytes);
    const suffix = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
    return `portal-setup-${suffix}`;
  }

  throw new Error("secure_random_unavailable");
}
