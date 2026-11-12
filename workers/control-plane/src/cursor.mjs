// Keyset cursor codec for the account directory.
//
// Mirrors the cursor contract verified in the G2 pagination spike
// (admin-user-monitor.mjs: encodeCursor / decodeCursor /
// requireCanonicalIso / requireAccountId, MAX_CURSOR_LENGTH = 512,
// REF_PATTERN for ids). A cursor is the base64url encoding of a JSON
// object with exactly the keys { createdAt, id }; both fields are
// strictly validated on decode. Any malformed cursor raises
// InvalidCursorError, which the API layer maps to HTTP 400.

export const MAX_CURSOR_LENGTH = 512;
export const REF_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export class InvalidCursorError extends Error {
  constructor(message = "cursor is invalid") {
    super(message);
    this.name = "InvalidCursorError";
    this.code = "invalid_query";
  }
}

const BASE64URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function base64UrlEncode(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += BASE64URL_ALPHABET[a >> 2];
    out += BASE64URL_ALPHABET[((a & 0x03) << 4) | (b >> 4)];
    if (i + 1 < bytes.length) out += BASE64URL_ALPHABET[((b & 0x0f) << 2) | (c >> 6)];
    if (i + 2 < bytes.length) out += BASE64URL_ALPHABET[c & 0x3f];
  }
  return out;
}

function base64UrlDecode(text) {
  const bytes = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of text) {
    const value = BASE64URL_ALPHABET.indexOf(ch);
    if (value < 0) throw new InvalidCursorError();
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

export function encodeCursor(payload) {
  const text = JSON.stringify({ createdAt: payload.createdAt, id: payload.id });
  return base64UrlEncode(new TextEncoder().encode(text));
}

export function requireCanonicalIso(value) {
  if (typeof value !== "string") throw new InvalidCursorError();
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    throw new InvalidCursorError();
  }
  return value;
}

export function requireRef(value) {
  if (typeof value !== "string" || !REF_PATTERN.test(value)) {
    throw new InvalidCursorError();
  }
  return value;
}

export function decodeCursor(raw) {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_CURSOR_LENGTH) {
    throw new InvalidCursorError();
  }
  if (!BASE64URL_PATTERN.test(raw)) throw new InvalidCursorError();
  let parsed;
  try {
    const bytes = base64UrlDecode(raw);
    // Canonical form check: re-encoding must reproduce the input exactly.
    if (base64UrlEncode(bytes) !== raw) throw new InvalidCursorError();
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    if (error instanceof InvalidCursorError) throw error;
    throw new InvalidCursorError();
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new InvalidCursorError();
  }
  const keys = Object.keys(parsed);
  if (keys.length !== 2 || !("createdAt" in parsed) || !("id" in parsed)) {
    throw new InvalidCursorError();
  }
  return {
    createdAt: requireCanonicalIso(parsed.createdAt),
    id: requireRef(parsed.id),
  };
}
