// Masked email display identifiers (M1 B2-6, G-03 / C-03).
//
// TypeScript mirror of server/services/platform/email-masking.mjs: same
// algorithm, same fallback. Used by the local preview client, which has no
// server to mask for it. The HTTP client never masks here: it displays the
// values the server already masked (masking is idempotent, so a masked value
// passed through here is unchanged).
//
// A masked email is display-only. It is never a unique account identifier,
// never an authentication basis, and never a dedup key. The local preview
// keeps the raw email as its internal map key; only displayed values are
// masked.
//
// Algorithm: keep the first two characters of the local part, then `***`,
// then `@`, then the full domain (`li***@gmail.com`). A local part shorter
// than two characters keeps all of its visible characters
// (`a***@gmail.com`). The value is trimmed and lowercased first. A
// subaddress tag (`user+tag@`) is dropped before masking. A `*` in the
// local part is stripped before taking visible characters (`a*b@` masks
// to `ab***@`); a local part made only of `*` has no visible character
// and returns the fallback. Non-ASCII
// characters are kept as-is; the domain is never converted to punycode.
// Invalid input returns the fallback `user_account` and never throws.

export const EMAIL_DISPLAY_FALLBACK = "user_account";

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmailCandidate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return EMAIL_SHAPE.test(email) ? email : null;
}

// Mask an email for display. Invalid input returns the fallback.
export function maskEmail(value: unknown): string {
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
  local = local.replace(/\*/g, "");
  const visible = Array.from(local).slice(0, 2).join("");
  if (visible === "") return EMAIL_DISPLAY_FALLBACK;
  return `${visible}***@${domain}`;
}

// Mask the value only when it looks like an email; otherwise return it
// unchanged. For display-name chains where the value may be a user-managed
// label or an account id instead of an email.
export function maskEmailOrKeep<T>(value: T): T | string {
  if (typeof value !== "string") return value;
  return normalizeEmailCandidate(value) === null ? value : maskEmail(value);
}
