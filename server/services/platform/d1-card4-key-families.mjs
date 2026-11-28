/**
 * Card #4 (D-6) · sensitive-field key-family contract — SOURCE-ONLY DRAFT.
 *
 * Scope: the 8 sensitive-field tables of decision card #4
 * (`E4_DECISION_CARDS.md` #4) and the Q-1..Q-12 hosted-design decisions.
 * This module is code structure plus synthetic-data validation only:
 *
 * - It creates no Durable Object / namespace, configures no Secret,
 *   generates no real key, migrates no credential, reads no production
 *   row, writes nothing to BWH/E4, and executes no E4 DDL.
 * - The three new AES families are DESIGN IDENTIFIERS ONLY (Q-7):
 *   `lead-contact-aes` (proposal A), `subscription-capability-aes`
 *   (proposal B), `payment-action-aes` (proposal D). They are in the
 *   whitelist so the catalog is complete, but they are NOT approved for
 *   production use and NO real encrypt/decrypt/HMAC path accepts them:
 *   every existing crypto operation hardcodes its own family, and
 *   `assertD1Card4KeyFamilyProductionApproved` rejects the three.
 * - Proposal C reuses the Portal TOTP family (`portal-totp-aes`); proposal
 *   E (archive) loads nothing and pre-generates no key (Q-6 HOLD: archive
 *   checkout URL / QR code must not enter D1 at all).
 * - The final field contract is still HOLD pending Yi's decision; the
 *   GPT-6 PARTIAL TECHNICAL GO quoted in the task brief is a technical
 *   opinion, not Yi's decision. Q-9..Q-12 have no definition in the local
 *   decision files and are recorded as uncovered, not invented here.
 *
 * Rotation / retirement follow the custody ADR
 * (`docs/D1_T2_C2_KEY_CUSTODY_AND_ROTATION_ADR_V1.md` §5): active-write /
 * retained-read rotation, and retirement only with reconciliation proof
 * plus owner approval recorded. The lifecycle functions below operate on
 * plain descriptors (no key material) and are validated with synthetic
 * data only.
 */

import {
  destroyD1KeyRing,
  parseD1KeyRingSecret
} from "./d1-t2-security-primitives.mjs";

const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/u;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireKeyId(value, code = "key_id_invalid") {
  if (typeof value !== "string" || !KEY_ID_PATTERN.test(value)) throw fail(code);
  return value;
}

function requireNonEmptyText(value, code) {
  if (typeof value !== "string" || value.trim().length === 0) throw fail(code);
  return value;
}

/**
 * Q-7 catalog. `productionApproved: false` means design identifier only:
 * whitelisted as a name, never usable for production crypto. The five
 * pre-existing families keep their approved status.
 */
export const D1_CARD4_KEY_FAMILY_CATALOG = Object.freeze([
  Object.freeze({ family: "idempotency-hmac", kind: "hmac-sha256", designDecision: "pre-existing", productionApproved: true }),
  Object.freeze({ family: "provider-event-hmac", kind: "hmac-sha256", designDecision: "pre-existing", productionApproved: true }),
  Object.freeze({ family: "pii-hmac", kind: "hmac-sha256", designDecision: "pre-existing", productionApproved: true }),
  Object.freeze({ family: "portal-totp-aes", kind: "aes-256-gcm", designDecision: "pre-existing; proposal C reuses this family", productionApproved: true }),
  Object.freeze({ family: "admin-totp-aes", kind: "aes-256-gcm", designDecision: "pre-existing", productionApproved: true }),
  Object.freeze({ family: "lead-contact-aes", kind: "aes-256-gcm", designDecision: "Q-7 proposal A", productionApproved: false }),
  Object.freeze({ family: "subscription-capability-aes", kind: "aes-256-gcm", designDecision: "Q-7 proposal B", productionApproved: false }),
  Object.freeze({ family: "payment-action-aes", kind: "aes-256-gcm", designDecision: "Q-7 proposal D", productionApproved: false })
]);

export const D1_CARD4_DESIGN_ONLY_KEY_FAMILIES = Object.freeze([
  "lead-contact-aes",
  "subscription-capability-aes",
  "payment-action-aes"
]);

const CATALOG_BY_FAMILY = new Map(
  D1_CARD4_KEY_FAMILY_CATALOG.map((entry) => [entry.family, entry])
);

/** Env-var names reserved for the three design-only families. No such
 * variable may ever be provisioned with real key material while the
 * families are design-only (fail-closed startup check below). */
export const D1_CARD4_DESIGN_FAMILY_ENV_NAMES = Object.freeze({
  "lead-contact-aes": "LEAD_CONTACT_AES_KEYRING_JSON",
  "subscription-capability-aes": "SUBSCRIPTION_CAPABILITY_AES_KEYRING_JSON",
  "payment-action-aes": "PAYMENT_ACTION_AES_KEYRING_JSON"
});

/** Env-var names of the production-approved families that may be required
 * at startup (subset depends on which routes are enabled; see
 * `server/state.mjs` for the existing TOTP wiring). */
export const D1_CARD4_PRODUCTION_FAMILY_ENV_NAMES = Object.freeze({
  "portal-totp-aes": "PORTAL_TOTP_AES_KEYRING_JSON",
  "admin-totp-aes": "ADMIN_TOTP_AES_KEYRING_JSON"
});

export function listD1Card4KeyFamilies() {
  return D1_CARD4_KEY_FAMILY_CATALOG.map((entry) => ({ ...entry }));
}

export function isD1Card4KeyFamily(family) {
  return typeof family === "string" && CATALOG_BY_FAMILY.has(family);
}

export function isD1Card4DesignOnlyKeyFamily(family) {
  return D1_CARD4_DESIGN_ONLY_KEY_FAMILIES.includes(family);
}

/**
 * Production-use gate (Q-7). Throws `key_family_design_only` for the three
 * new families and `key_family_invalid` for unknown names. Nothing in this
 * module (or in `d1-t2-security-primitives.mjs`) routes a design-only
 * family into a real crypto operation.
 */
export function assertD1Card4KeyFamilyProductionApproved(family) {
  const entry = CATALOG_BY_FAMILY.get(family);
  if (!entry) throw fail("key_family_invalid");
  if (!entry.productionApproved) throw fail("key_family_design_only");
  return entry;
}

/**
 * Fail closed if any design-only family has key material configured.
 * Presence of such a variable is a configuration error, not a fallback:
 * the operator must remove it, never "use it anyway".
 */
export function assertNoD1DesignFamilyKeyMaterialConfigured(env) {
  if (!isPlainRecord(env)) throw fail("d1_startup_key_config_invalid");
  for (const family of D1_CARD4_DESIGN_ONLY_KEY_FAMILIES) {
    const envName = D1_CARD4_DESIGN_FAMILY_ENV_NAMES[family];
    const value = env[envName];
    if (typeof value === "string" && value.length > 0) {
      throw fail("key_family_design_only_configured");
    }
    if (value !== undefined && value !== "") throw fail("d1_startup_key_config_invalid");
  }
  return true;
}

// ---------------------------------------------------------------------------
// Rotation / retirement lifecycle (descriptors only, no key material).
// States: "active" -> "rotating" -> "active"; any non-terminal state can go
// to "retired" (whole family, terminal). Retiring a single retained key
// removes it from the read ring; the active key can never be retired.
// Retirement of a key additionally requires reconciliation proof and owner
// approval references (ADR §5); missing either fails closed.
// ---------------------------------------------------------------------------

const LIFECYCLE_KEYS = ["family", "activeKeyId", "readKeyIds", "lifecycle", "previousActiveKeyId", "retiredKeyIds"];

function cloneLifecycle(descriptor) {
  return {
    family: descriptor.family,
    activeKeyId: descriptor.activeKeyId,
    readKeyIds: [...descriptor.readKeyIds],
    lifecycle: descriptor.lifecycle,
    previousActiveKeyId: descriptor.previousActiveKeyId,
    retiredKeyIds: [...descriptor.retiredKeyIds]
  };
}

function requireLifecycle(descriptor) {
  if (!isPlainRecord(descriptor)
    || Object.keys(descriptor).sort().join(",") !== [...LIFECYCLE_KEYS].sort().join(",")
    || !isD1Card4KeyFamily(descriptor.family)
    || typeof descriptor.lifecycle !== "string") {
    throw fail("key_lifecycle_invalid");
  }
  requireKeyId(descriptor.activeKeyId);
  if (!Array.isArray(descriptor.readKeyIds) || descriptor.readKeyIds.length === 0
    || descriptor.readKeyIds[0] !== descriptor.activeKeyId
    || new Set(descriptor.readKeyIds).size !== descriptor.readKeyIds.length) {
    throw fail("key_lifecycle_invalid");
  }
  for (const keyId of descriptor.readKeyIds) requireKeyId(keyId);
  if (!Array.isArray(descriptor.retiredKeyIds)) throw fail("key_lifecycle_invalid");
  for (const keyId of descriptor.retiredKeyIds) requireKeyId(keyId);
  if (descriptor.previousActiveKeyId !== null) requireKeyId(descriptor.previousActiveKeyId);
  return descriptor;
}

export function createD1KeyFamilyLifecycle({ family, activeKeyId, readKeyIds } = {}) {
  if (!isD1Card4KeyFamily(family)) throw fail("key_family_invalid");
  requireKeyId(activeKeyId);
  if (!Array.isArray(readKeyIds) || readKeyIds.length === 0
    || readKeyIds[0] !== activeKeyId || new Set(readKeyIds).size !== readKeyIds.length) {
    throw fail("key_read_ring_invalid");
  }
  for (const keyId of readKeyIds) requireKeyId(keyId);
  return Object.freeze({
    family,
    activeKeyId,
    readKeyIds: Object.freeze([...readKeyIds]),
    lifecycle: "active",
    previousActiveKeyId: null,
    retiredKeyIds: Object.freeze([])
  });
}

/** Begin rotation: the next key becomes the active (write) key, the old
 * active key stays in the read ring (retained-read). Only from "active". */
export function planD1KeyFamilyRotation(descriptor, { nextKeyId } = {}) {
  requireLifecycle(descriptor);
  if (descriptor.lifecycle === "retired") throw fail("key_family_retired");
  if (descriptor.lifecycle !== "active") throw fail("key_rotation_invalid");
  requireKeyId(nextKeyId);
  if (descriptor.readKeyIds.includes(nextKeyId) || descriptor.retiredKeyIds.includes(nextKeyId)) {
    throw fail("key_rotation_invalid");
  }
  const next = cloneLifecycle(descriptor);
  next.previousActiveKeyId = descriptor.activeKeyId;
  next.activeKeyId = nextKeyId;
  next.readKeyIds = [nextKeyId, ...descriptor.readKeyIds];
  next.lifecycle = "rotating";
  return Object.freeze({
    ...next,
    readKeyIds: Object.freeze(next.readKeyIds),
    retiredKeyIds: Object.freeze(next.retiredKeyIds)
  });
}

/** Finish rotation after the new key has proven it can write and the old
 * key can still read (verified by the caller with synthetic or staged
 * traffic). Only from "rotating". */
export function completeD1KeyFamilyRotation(descriptor) {
  requireLifecycle(descriptor);
  if (descriptor.lifecycle === "retired") throw fail("key_family_retired");
  if (descriptor.lifecycle !== "rotating") throw fail("key_rotation_invalid");
  const next = cloneLifecycle(descriptor);
  next.lifecycle = "active";
  next.previousActiveKeyId = null;
  return Object.freeze({
    ...next,
    readKeyIds: Object.freeze(next.readKeyIds),
    retiredKeyIds: Object.freeze(next.retiredKeyIds)
  });
}

/**
 * Retire one retained (non-active) key from the read ring. Requires a
 * reconciliation-proof reference and an owner-approval reference; either
 * missing fails closed. The active key can never be retired this way.
 */
export function retireD1KeyFamilyKey(descriptor, { keyId, reconciliationProofRef, ownerApprovalRef } = {}) {
  requireLifecycle(descriptor);
  if (descriptor.lifecycle === "retired") throw fail("key_family_retired");
  requireKeyId(keyId);
  if (keyId === descriptor.activeKeyId) throw fail("key_retirement_invalid");
  if (!descriptor.readKeyIds.includes(keyId)) throw fail("key_retirement_invalid");
  requireNonEmptyText(reconciliationProofRef, "key_retirement_evidence_missing");
  requireNonEmptyText(ownerApprovalRef, "key_retirement_evidence_missing");
  const next = cloneLifecycle(descriptor);
  next.readKeyIds = descriptor.readKeyIds.filter((candidate) => candidate !== keyId);
  next.retiredKeyIds = [...descriptor.retiredKeyIds, keyId];
  return Object.freeze({
    ...next,
    readKeyIds: Object.freeze(next.readKeyIds),
    retiredKeyIds: Object.freeze(next.retiredKeyIds)
  });
}

/** Retire a whole family (terminal). Requires owner approval; after this,
 * every lifecycle transition for the family throws `key_family_retired`. */
export function retireD1KeyFamily(descriptor, { ownerApprovalRef } = {}) {
  requireLifecycle(descriptor);
  if (descriptor.lifecycle === "retired") throw fail("key_family_retired");
  requireNonEmptyText(ownerApprovalRef, "key_retirement_evidence_missing");
  const next = cloneLifecycle(descriptor);
  next.lifecycle = "retired";
  return Object.freeze({
    ...next,
    readKeyIds: Object.freeze(next.readKeyIds),
    retiredKeyIds: Object.freeze(next.retiredKeyIds)
  });
}

// ---------------------------------------------------------------------------
// Startup fail-closed check (pure function over an env-like record).
// Not yet wired into `server/state.mjs` startup: wiring changes production
// startup behavior and needs its own approval. The validator itself is
// complete and covered by synthetic tests here.
// ---------------------------------------------------------------------------

/**
 * Validate the key-ring configuration a deployment requires at startup.
 * `requiredFamilies` maps family -> env var name and may only name
 * production-approved families. For each: the variable must be present and
 * non-empty, and its JSON must parse as a valid key ring
 * (`parseD1KeyRingSecret` shape). Anything missing or malformed throws
 * `d1_startup_key_config_invalid` — the process must refuse to start, never
 * fall back to a weak default or an empty ring. Rings are destroyed after
 * validation; the returned summary carries key IDs only, never key
 * material.
 */
export function validateD1Card4StartupKeyConfig({ env, requiredFamilies } = {}) {
  if (!isPlainRecord(env)) throw fail("d1_startup_key_config_invalid");
  if (!isPlainRecord(requiredFamilies) || Object.keys(requiredFamilies).length === 0) {
    throw fail("d1_startup_key_config_invalid");
  }
  assertNoD1DesignFamilyKeyMaterialConfigured(env);
  const summary = [];
  for (const [family, envName] of Object.entries(requiredFamilies)) {
    assertD1Card4KeyFamilyProductionApproved(family);
    if (typeof envName !== "string" || envName.length === 0) {
      throw fail("d1_startup_key_config_invalid");
    }
    const secretText = env[envName];
    if (typeof secretText !== "string" || secretText.length === 0) {
      throw fail("d1_startup_key_config_invalid");
    }
    let ring = null;
    try {
      ring = parseD1KeyRingSecret(secretText, { family });
    } catch {
      throw fail("d1_startup_key_config_invalid");
    }
    try {
      summary.push(Object.freeze({
        family,
        envName,
        activeKeyId: ring.activeKeyId,
        readKeyIds: Object.freeze([...ring.readKeyIds])
      }));
    } finally {
      destroyD1KeyRing(ring);
    }
  }
  return Object.freeze({ families: Object.freeze(summary) });
}

// ---------------------------------------------------------------------------
// Q-2 · Leads list masking (limited GO).
// The raw email must never be returned by a Leads list response. The mask
// is generated on the spot at read time; it is not written to D1 and not
// persistently cached (this function is pure and keeps no state).
// ---------------------------------------------------------------------------

export function maskD1LeadEmail(email) {
  if (typeof email !== "string") throw fail("lead_email_invalid");
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  if (at <= 0 || at !== trimmed.lastIndexOf("@") || at === trimmed.length - 1) {
    throw fail("lead_email_invalid");
  }
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (/\s/u.test(trimmed) || !domain.includes(".")) throw fail("lead_email_invalid");
  const maskedLocal = local.length === 1 ? "*" : local[0] + "***";
  return maskedLocal + "@" + domain;
}

/** Project one Leads list row: only the lead reference and the masked
 * email leave this function. The raw email is masked on the spot and never
 * appears in the returned row (nor in D1, nor in any cache). */
export function projectD1LeadListRow({ leadRef, email } = {}) {
  if (typeof leadRef !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(leadRef)) {
    throw fail("lead_list_row_invalid");
  }
  return Object.freeze({ leadRef, maskedEmail: maskD1LeadEmail(email) });
}

/** Guard for list responses: throws `lead_raw_email_leak` if any string
 * value anywhere in the row contains the raw email. */
export function assertD1LeadListRowHasNoRawEmail(row, rawEmail) {
  if (!isPlainRecord(row) || typeof rawEmail !== "string" || rawEmail.length === 0) {
    throw fail("lead_list_row_invalid");
  }
  const stack = [row];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const value of Object.values(current)) {
      if (typeof value === "string" && value.includes(rawEmail)) {
        throw fail("lead_raw_email_leak");
      }
      if (isPlainRecord(value)) stack.push(value);
      if (Array.isArray(value)) stack.push(...value.filter((item) => isPlainRecord(item) || Array.isArray(item)));
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Q-4 · TOTP EXTERNALIZE (limited GO).
// `encrypted_totp_secret` (E-04, `platform_portal_totp_credentials`) must
// NOT be stored in D1. Custody stays with Crypto Worker v3 envelope
// operations totp.protect / totp.unprotect / totp.reencrypt. This module
// classifies the field and guards the D1 write path; it does NOT authorize
// a production format inventory and it never reads, generates, copies, or
// migrates any real TOTP key — no such function exists here.
// ---------------------------------------------------------------------------

export const D1_CARD4_TOTP_EXTERNALIZE = Object.freeze({
  table: "platform_portal_totp_credentials",
  column: "encrypted_totp_secret",
  externalizeId: "E-04",
  disposition: "externalize",
  handler: "crypto-worker-v3",
  operations: Object.freeze(["totp.protect", "totp.unprotect", "totp.reencrypt"])
});

export function resolveD1TotpExternalization({ table, column } = {}) {
  if (table === D1_CARD4_TOTP_EXTERNALIZE.table
    && column === D1_CARD4_TOTP_EXTERNALIZE.column) {
    return D1_CARD4_TOTP_EXTERNALIZE;
  }
  throw fail("totp_externalize_unknown_field");
}

/** D1 write-path guard: any payload carrying `encrypted_totp_secret` is
 * rejected before it can reach D1, whatever table it claims. */
export function assertD1WriteHasNoTotpSecret(payload) {
  if (!isPlainRecord(payload)) throw fail("d1_write_payload_invalid");
  if (Object.hasOwn(payload, "encrypted_totp_secret")) {
    throw fail("totp_secret_must_not_enter_d1");
  }
  return true;
}

// ---------------------------------------------------------------------------
// Q-6 · Archive HOLD / NO-GO.
// Archive checkout URL / QR code (E-06/E-07,
// `platform_payment_orders_legacy_archive_20260803`) do NOT enter D1.
// Any write payload for the archive table carrying either column is
// rejected. The archive table has no key family: proposal E loads nothing
// and pre-generates no key.
// ---------------------------------------------------------------------------

export const D1_CARD4_ARCHIVE_TABLE = "platform_payment_orders_legacy_archive_20260803";

export const D1_CARD4_ARCHIVE_BLOCKED_COLUMNS = Object.freeze([
  "checkout_url",
  "checkout_qr_code"
]);

export function isD1ArchiveBlockedColumn(table, column) {
  return table === D1_CARD4_ARCHIVE_TABLE
    && D1_CARD4_ARCHIVE_BLOCKED_COLUMNS.includes(column);
}

/** Archive write-path guard (Q-6 HOLD). Presence of either blocked column
 * — even with a null/empty value — rejects the write: the column must not
 * be part of a D1 write at all, not merely "empty". */
export function assertD1ArchiveWriteAllowed({ table, payload } = {}) {
  if (typeof table !== "string" || !isPlainRecord(payload)) {
    throw fail("d1_write_payload_invalid");
  }
  if (table !== D1_CARD4_ARCHIVE_TABLE) return true;
  for (const column of D1_CARD4_ARCHIVE_BLOCKED_COLUMNS) {
    if (Object.hasOwn(payload, column)) {
      throw fail("d1_archive_capability_column_rejected");
    }
  }
  return true;
}

/** Combined #4 write-path guard for a D1 write: TOTP secret never enters
 * D1 (Q-4) and archive capability columns never enter D1 (Q-6). */
export function assertD1Card4WriteAllowed({ table, payload } = {}) {
  assertD1WriteHasNoTotpSecret(payload);
  assertD1ArchiveWriteAllowed({ table, payload });
  return true;
}
