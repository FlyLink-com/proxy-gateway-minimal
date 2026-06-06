import { createHmac, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const DEFAULT_PERIOD_SECONDS = 30;
const DEFAULT_DIGITS = 6;
const DEFAULT_WINDOW = 1;

function normalizeBase32Secret(value) {
  const raw = String(value || "").trim();
  const secret = raw.startsWith("enc:") ? raw.slice("enc:".length) : raw;
  return secret.replace(/[\s-]/g, "").replace(/=+$/g, "").toUpperCase();
}

function decodeBase32(value) {
  const normalized = normalizeBase32Secret(value);
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

  return function verifyPortalTotp({ encryptedTotpSecret, code }) {
    const normalizedCode = String(code || "").trim();
    if (!new RegExp(`^\\d{${digits}}$`).test(normalizedCode)) {
      return false;
    }
    const key = decodeBase32(encryptedTotpSecret);
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
