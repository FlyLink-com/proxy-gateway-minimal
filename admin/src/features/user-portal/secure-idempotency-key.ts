type SecureCryptoProvider = Partial<Pick<Crypto, "randomUUID" | "getRandomValues">>;

/** Generate an idempotency key using only browser cryptographic randomness. */
export function createSecureIdempotencyKey(
  cryptoProvider: SecureCryptoProvider | null = globalThis.crypto
): string {
  const randomUUID = cryptoProvider?.randomUUID;
  if (typeof randomUUID === "function") {
    return cryptoProvider.randomUUID();
  }

  const getRandomValues = cryptoProvider?.getRandomValues;
  if (typeof getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    cryptoProvider.getRandomValues(bytes);
    const suffix = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
    return `portal-setup-${suffix}`;
  }

  throw new Error("secure_random_unavailable");
}
