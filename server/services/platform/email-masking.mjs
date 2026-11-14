// Masked email display identifiers (M1 B2-6, G-03 / C-03).
//
// A masked email is a display-only label. It is never a unique account
// identifier, never an authentication basis, and never a dedup key: login
// resolution keeps using the raw email inside the server (v0.4 G-02), and
// the masked value is only what sessions, registration responses, and admin
// lists show.
//
// Algorithm (v0.5 example wording, survey P-1 option A): keep the first two
// characters of the local part, then `***`, then `@`, then the full domain
// (`li***@gmail.com`). A local part shorter than two characters keeps all of
// its visible characters (`a***@gmail.com`). The value is trimmed and
// lowercased first, matching the existing email normalization. A subaddress
// tag (`user+tag@`) is dropped before masking (`us***@example.com`).
// A `*` in the local part is stripped before taking visible characters
// (`a*b@` masks to `ab***@`); a local part made only of `*` has no
// visible character and returns the fallback.
// Non-ASCII local parts and domains are kept as-is; the domain is never
// converted to punycode. An overlong local part is masked the same way, never
// an error. Any input that is not a well-formed email returns the fallback
// `user_account` and never throws.
//
// The function is idempotent on its own output: masking an already masked
// value returns the same value, so applying it at more than one display
// layer cannot double-mask.

export const EMAIL_DISPLAY_FALLBACK = "user_account";

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

const MASKED_EMAIL_SHAPE = /^[^@\s*]{1,2}\*\*\*@[^@\s]+\.[^@\s]+$/u;

function normalizeEmailCandidate(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return EMAIL_SHAPE.test(email) ? email : null;
}

// Mask an email for display. Invalid input returns the fallback.
export function maskEmail(value) {
  const email = normalizeEmailCandidate(value);
  if (email === null) return EMAIL_DISPLAY_FALLBACK;
  const atIndex = email.indexOf("@");
  const domain = email.slice(atIndex + 1);
  let local = email.slice(0, atIndex);
  const plusIndex = local.indexOf("+");
  if (plusIndex >= 0) {
    const base = local.slice(0, plusIndex);
    if (base.length > 0) local = base;
  }
  // `*` never belongs to a visible segment: strip every `*` from the
  // local part before taking visible characters, so a raw local part
  // such as `a*b` masks to `ab***` (which passes the projection-gate
  // shape check) instead of `a****`. This also keeps masking
  // idempotent on its own output (`a***` strips back to `a`).
  // A local part made only of `*` leaves no visible character: there
  // is nothing to display, so fall back (the gate accepts the
  // fallback, so the result still passes isMaskedEmailDisplay).
  local = local.replace(/\*/gu, "");
  const visible = Array.from(local).slice(0, 2).join("");
  if (visible === "") return EMAIL_DISPLAY_FALLBACK;
  return `${visible}***@${domain}`;
}

// Mask the value only when it looks like an email; otherwise return it
// unchanged. For display-name chains where the value may be a user-managed
// label or an account id instead of an email.
export function maskEmailOrKeep(value) {
  if (typeof value !== "string") return value;
  return normalizeEmailCandidate(value) === null ? value : maskEmail(value);
}

// True when the value is a masked email display produced by maskEmail, or
// the fallback. A raw email never passes: the D1 projection gate uses this
// to reject a raw email smuggled in as a masked display field.
export function isMaskedEmailDisplay(value) {
  return value === EMAIL_DISPLAY_FALLBACK
    || (typeof value === "string" && MASKED_EMAIL_SHAPE.test(value));
}
