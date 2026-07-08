import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const DEFAULT_PERIOD_SECONDS = 30;
const DEFAULT_DIGITS = 6;
const DEFAULT_WINDOW = 1;
const PROTECTED_SECRET_PREFIX = "v2:aes-256-gcm:";

function normalizeProtectorKey(value) {
  if (Buffer.isBuffer(value)) {
    if (value.length === 32) {
      return Buffer.from(value);
    }
    throw new Error("must be 32 bytes");
  }
  if (value instanceof Uint8Array) {
    const key = Buffer.from(value);
    if (key.length === 32) {
      return key;
    }
    throw new Error("must be 32 bytes");
  }
  const text = String(value || "").trim();
  if (!text) {
    throw new Error("is required");
  }
  const candidates = [];
  if (/^[0-9a-f]{64}$/i.test(text)) {
    candidates.push(Buffer.from(text, "hex"));
  }
  for (const encoding of ["base64url", "base64"]) {
    try {
      candidates.push(Buffer.from(text, encoding));
    } catch {
      // Ignore invalid encodings and report a single validation error below.
    }
  }
  const key = candidates.find((candidate) => candidate.length === 32);
  if (!key) {
    throw new Error("must decode to 32 bytes");
  }
  return Buffer.from(key);
}

function encodeBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function decodeBase64Url(value) {
  const text = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]+$/.test(text)) {
    return null;
  }
  try {
    return Buffer.from(text, "base64url");
  } catch {
    return null;
  }
}

export function createPortalTotpSecretProtector({ key, ivFactory = () => randomBytes(12) } = {}) {
  const normalizedKey = normalizeProtectorKey(key);

  function protect(secret) {
    const plaintext = String(secret || "").trim();
    if (!plaintext) {
      throw new Error("portal TOTP secret is required");
    }
    const iv = Buffer.from(ivFactory());
    if (iv.length !== 12) {
      throw new Error("portal TOTP secret IV must be 12 bytes");
    }
    const cipher = createCipheriv("aes-256-gcm", normalizedKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final()
    ]);
    const tag = cipher.getAuthTag();
    return `${PROTECTED_SECRET_PREFIX}${encodeBase64Url(iv)}:${encodeBase64Url(tag)}:${encodeBase64Url(ciphertext)}`;
  }

  function unprotect(value) {
    const raw = String(value || "").trim();
    if (!raw.startsWith(PROTECTED_SECRET_PREFIX)) {
      return raw;
    }
    const parts = raw.split(":");
    if (parts.length !== 5 || parts[0] !== "v2" || parts[1] !== "aes-256-gcm") {
      return null;
    }
    const iv = decodeBase64Url(parts[2]);
    const tag = decodeBase64Url(parts[3]);
    const ciphertext = decodeBase64Url(parts[4]);
    if (!iv || iv.length !== 12 || !tag || tag.length !== 16 || !ciphertext) {
      return null;
    }
    try {
      const decipher = createDecipheriv("aes-256-gcm", normalizedKey, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final()
      ]).toString("utf8");
    } catch {
      return null;
    }
  }

  return { protect, unprotect };
}

function unwrapTotpSecret(value, secretProtector) {
  const raw = String(value || "").trim();
  if (raw.startsWith(PROTECTED_SECRET_PREFIX)) {
    if (!secretProtector || typeof secretProtector.unprotect !== "function") {
      return null;
    }
    return secretProtector.unprotect(raw);
  }
  return raw.startsWith("enc:") ? raw.slice("enc:".length) : raw;
}

function normalizeBase32Secret(value, secretProtector) {
  const secret = unwrapTotpSecret(value, secretProtector);
  if (!secret) {
    return "";
  }
  return secret.replace(/[\s-]/g, "").replace(/=+$/g, "").toUpperCase();
}

function decodeBase32(value, secretProtector) {
  const normalized = normalizeBase32Secret(value, secretProtector);
  if (!/^[A-Z2-7]+$/.test(normalized)) {
    return null;
  }

  let bits = "";
  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) {
      return null;
    }
    bits += index.toString(2).padStart(5, "0");
  }

  const bytes = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

function hotp({ key, counter, digits }) {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", key).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | (digest[offset + 1] << 16)
    | (digest[offset + 2] << 8)
    | digest[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, "0");
}

function safeCodeEquals(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function createPortalTotpVerifier(options = {}) {
  const nowFn = options.nowFn || (() => new Date().toISOString());
  const periodSeconds = options.periodSeconds ?? DEFAULT_PERIOD_SECONDS;
  const digits = options.digits ?? DEFAULT_DIGITS;
  const window = options.window ?? DEFAULT_WINDOW;
  const secretProtector = options.secretProtector || null;

  return function verifyPortalTotp({ encryptedTotpSecret, code }) {
    const normalizedCode = String(code || "").trim();
    if (!new RegExp(`^\\d{${digits}}$`).test(normalizedCode)) {
      return false;
    }
    const key = decodeBase32(encryptedTotpSecret, secretProtector);
    if (!key || key.length === 0) {
      return false;
    }
    const nowMs = new Date(nowFn()).getTime();
    if (!Number.isFinite(nowMs)) {
      return false;
    }
    const currentCounter = Math.floor(nowMs / 1000 / periodSeconds);
    for (let drift = -window; drift <= window; drift += 1) {
      if (safeCodeEquals(hotp({
        key,
        counter: currentCounter + drift,
        digits
      }), normalizedCode)) {
        return true;
      }
    }
    return false;
  };
}
