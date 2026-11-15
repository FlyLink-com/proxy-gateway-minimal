// B2-b (path A, B-A4): authority registration.
//
// Creates a platform account from an already-verified authority identity
// (subject + authority-verified email, produced by the B-A1 ID Token path)
// and binds it to that subject in one transaction. The authority owns
// email uniqueness; this service never writes loginRef / displayRef /
// loginDigest / contactDigest, and never scans email. The display value is
// the masked email only (displayEmailMasked, B2-a A1 shape) — returned
// for one-time display, never persisted: the store's
// assertNoUnsafeFields rejects any metadata key containing "email" at
// createAccount, by design, so the control DB keeps no email-derived
// value. The durable masked display is a session/presentation value,
// derived at login from the authority token context (B2-a session layer).
//
// Deliberately NOT written here (gaps, see the Phase 1 preparation doc
// §6): password credentials (the password lives at the authority),
// trial entitlement provisioning, welcome-Coins grant wiring, and
// IP/request digests. The legal agreement record is required input: the
// future callback route must collect it before calling this function.
// displayName / displayDigest are omitted (Q9 undecided): no raw email is
// stored as a display name for authority-registered accounts.

import { randomBytes } from "node:crypto";
import { maskEmail } from "./email-masking.mjs";

const SUBJECT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._|:/-]{0,191}$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function authorityRegistrationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requiredText(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw authorityRegistrationError("validation_error", `${field} is required`);
  }
  return normalized;
}

function normalizeEmail(value) {
  // Mirrors portal-registration.mjs normalizeEmail: lowercase, strict shape.
  const email = requiredText(value, "email").toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    throw authorityRegistrationError("validation_error", "email is invalid");
  }
  return email;
}

function defaultAccountIdFactory() {
  return `acct_${randomBytes(12).toString("hex")}`;
}

export function registerAccountFromAuthority({
  controlStore,
  bindingRepository = null,
  authority,
  legalAgreement,
  accountIdFactory = defaultAccountIdFactory,
  nowFn = () => new Date().toISOString()
} = {}) {
  if (!controlStore || typeof controlStore.createAccount !== "function"
    || typeof controlStore.getAccount !== "function"
    || typeof controlStore.runInTransaction !== "function") {
    throw authorityRegistrationError("validation_error", "controlStore is not configured");
  }
  if (!authority || typeof authority !== "object") {
    throw authorityRegistrationError("validation_error", "authority identity is required");
  }
  if (typeof authority.subjectRef !== "string"
    || !SUBJECT_PATTERN.test(authority.subjectRef)) {
    throw authorityRegistrationError("validation_error", "authority subject is invalid");
  }
  // The email must already be authority-verified (B-A1 ID Token path
  // requires email_verified === true). Re-checked here so a caller cannot
  // register an unverified address by skipping that step.
  if (authority.emailVerified !== true) {
    throw authorityRegistrationError("validation_error", "authority email is not verified");
  }
  const email = normalizeEmail(authority.email);
  if (!legalAgreement || typeof legalAgreement !== "object"
    || typeof legalAgreement.termsVersion !== "string" || !legalAgreement.termsVersion.trim()
    || typeof legalAgreement.privacyVersion !== "string" || !legalAgreement.privacyVersion.trim()) {
    throw authorityRegistrationError("validation_error", "legal agreement is required");
  }
  const now = new Date(requiredText(nowFn(), "now")).toISOString();
  const nowMs = Date.parse(now);
  const repository = bindingRepository
    || (typeof controlStore.identityBindingRepository === "function"
      ? controlStore.identityBindingRepository()
      : null);
  if (!repository || typeof repository.createActive !== "function") {
    throw authorityRegistrationError("validation_error", "identity binding repository is not configured");
  }

  const accountId = requiredText(accountIdFactory({ email, now }), "accountId");
  const created = controlStore.runInTransaction(() => {
    const account = controlStore.createAccount({
      id: accountId,
      ownerRef: accountId,
      status: "active",
      createdAt: now,
      updatedAt: now,
      metadata: {
        initialAccount: false,
        requireSecuritySetup: false,
        registrationSource: "authority_portal",
        singleSubscriptionOnly: true,
        subscriptionLimit: 1,
        // No displayEmailMasked persisted (see the header comment): the
        // store rejects "email" metadata keys at createAccount. The
        // masked value is returned with the result for one-time display.
        legalAgreementAccepted: true,
        legalAgreementAcceptedAt: now,
        termsVersion: legalAgreement.termsVersion.trim(),
        privacyVersion: legalAgreement.privacyVersion.trim()
      }
    });
    const planned = repository.createActive({
      accountRef: accountId,
      issuerRef: "portal",
      subjectRef: authority.subjectRef,
      status: "active",
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
      revokedAtMs: null
    });
    if (!planned || planned.outcome !== "created") {
      // Any non-created outcome means this subject (or this account) is
      // already bound. Throwing inside the transaction rolls the account
      // creation back, so no orphan account is left behind. A thrown
      // identity_binding_write_failed (partial-unique-index race) is a
      // server error, not an existence signal, and propagates as-is.
      throw authorityRegistrationError("account_already_exists", "account already exists");
    }
    return { account, bindingId: planned.id };
  });
  return { ...created, displayEmailMasked: maskEmail(email) };
}
