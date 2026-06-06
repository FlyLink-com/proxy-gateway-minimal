const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function normalizeBase32Secret(secret: string) {
  const normalized = secret.toUpperCase().replace(/[\s=-]/g, "");
  if (!normalized || /[^A-Z2-7]/.test(normalized)) {
    throw new Error("TOTP secret is invalid.");
  }
  return normalized;
}

export function formatBase32Secret(secret: string) {
  return normalizeBase32Secret(secret).match(/.{1,4}/g)?.join(" ") ?? "";
}

export function base32Encode(bytes: Uint8Array) {
  let output = "";
  let bits = 0;
  let value = 0;

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function base32Decode(secret: string) {
  const normalized = normalizeBase32Secret(secret);
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of normalized) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return new Uint8Array(bytes);
}

export function randomBase32Secret(byteLength = 20) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

export function createOtpauthUri({
  accountLabel,
  issuer,
  secret
}: {
  accountLabel: string;
  issuer: string;
  secret: string;
}) {
  const params = new URLSearchParams({
    secret: normalizeBase32Secret(secret),
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30"
  });
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountLabel)}`;
  return `otpauth://totp/${label}?${params.toString()}`;
}

function counterBytes(counter: number) {
  const bytes = new Uint8Array(8);
  let value = BigInt(counter);
  for (let index = 7; index >= 0; index -= 1) {
    bytes[index] = Number(value & 0xffn);
    value >>= 8n;
  }
  return bytes;
}

async function hmacSha1(secret: string, counter: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    base32Decode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytes(counter)));
}

export async function createTotpCode(secret: string, now = new Date()) {
  const counter = Math.floor(now.getTime() / 1000 / 30);
  const digest = await hmacSha1(secret, counter);
  const offset = digest[digest.length - 1] & 0x0f;
  const binaryCode = (
    ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff)
  );
  return String(binaryCode % 1_000_000).padStart(6, "0");
}

export async function verifyTotpCode({
  code,
  now = new Date(),
  secret,
  windowSteps = 1
}: {
  code: string;
  now?: Date;
  secret: string;
  windowSteps?: number;
}) {
  const normalizedCode = code.trim();
  if (!/^\d{6}$/.test(normalizedCode)) {
    return false;
  }

  const currentCounter = Math.floor(now.getTime() / 1000 / 30);
  for (let offset = -windowSteps; offset <= windowSteps; offset += 1) {
    const digest = await hmacSha1(secret, currentCounter + offset);
    const digestOffset = digest[digest.length - 1] & 0x0f;
    const binaryCode = (
      ((digest[digestOffset] & 0x7f) << 24)
      | ((digest[digestOffset + 1] & 0xff) << 16)
      | ((digest[digestOffset + 2] & 0xff) << 8)
      | (digest[digestOffset + 3] & 0xff)
    );
    if (String(binaryCode % 1_000_000).padStart(6, "0") === normalizedCode) {
      return true;
    }
  }
  return false;
}
