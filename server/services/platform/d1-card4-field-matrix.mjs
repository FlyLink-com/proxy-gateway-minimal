/**
 * Card #4 (D-6) · eight-table per-column field matrix — SOURCE-ONLY DRAFT.
 *
 * Scope: the per-column disposition of the 8 sensitive-field tables of
 * decision card #4, transcribed verbatim from
 * `docs/D1_CONTROL_FIELD_DISPOSITION_T2_V1.json` (SHA cdaf041b…, 70 tables /
 * 820 fields). This module is code structure plus synthetic-data validation
 * only:
 *
 * - It reads no production row, writes nothing to BWH/E4, executes no E4 DDL,
 *   and uses no real key. All key material in tests is synthetic.
 * - It is NOT the final field contract. The final field contract is HOLD and
 *   its approval belongs to Yi, not to this card. Nothing here is a production
 *   hosting permission. The 8th table (`platform_accounts`) is a CANDIDATE:
 *   decision-card D-6 text (`E4_DECISION_CARDS.md` #4) is not in the repo, so
 *   the table is recorded as candidate, not as confirmed.
 * - Q-8 and Q-9..Q-11 have no local definition and are recorded as HOLD; this
 *   module does not invent them.
 *
 * The verifier checks a T2-shaped object against this matrix and reports every
 * mismatch, so the matrix document (`docs/D1_CARD4_FIELD_MATRIX_2026-11-21.md`
 * §14) is machine-checkable against the T2 JSON.
 */

// The 8 tables, in matrix order (7 confirmed + 1 candidate).
export const D1_CARD4_FIELD_MATRIX_TABLES = Object.freeze([
  "platform_leads",
  "platform_portal_access_requests",
  "platform_portal_totp_credentials",
  "platform_payment_receipts",
  "platform_payment_orders_legacy_archive_20260803",
  "platform_portal_password_credentials",
  "platform_portal_passkey_credentials",
  "platform_accounts",
]);

// The 8th table is a candidate until decision-card D-6 text confirms it.
export const D1_CARD4_FIELD_MATRIX_CANDIDATE_TABLE = "platform_accounts";

// Per-column matrix: table -> column -> { disposition, ruleId, dataClass }.
// Transcribed verbatim from the T2 JSON (ordinal order preserved in the doc).
export const D1_CARD4_FIELD_MATRIX = Object.freeze({
  "platform_leads": Object.freeze({
    "id": Object.freeze({ disposition: "KEEP", ruleId: "R-OPAQUE-REF-KEEP", dataClass: "OPAQUE_REFERENCE" }),
    "status": Object.freeze({ disposition: "KEEP", ruleId: "R-ENUM-KEEP", dataClass: "INTERNAL_CONTROL_DATA" }),
    "organization": Object.freeze({ disposition: "CONDITIONAL", ruleId: "R-ORGANIZATION-CONDITIONAL", dataClass: "POTENTIAL_FREE_TEXT_OR_IDENTIFIER" }),
    "email": Object.freeze({ disposition: "EXTERNALIZE", ruleId: "R-EMAIL-EXT", dataClass: "DIRECT_PII" }),
    "direction": Object.freeze({ disposition: "KEEP", ruleId: "R-ENUM-KEEP", dataClass: "INTERNAL_CONTROL_DATA" }),
    "stage": Object.freeze({ disposition: "KEEP", ruleId: "R-ENUM-KEEP", dataClass: "INTERNAL_CONTROL_DATA" }),
    "message": Object.freeze({ disposition: "EXTERNALIZE", ruleId: "R-MESSAGE-EXT", dataClass: "DIRECT_PII" }),
    "source": Object.freeze({ disposition: "KEEP", ruleId: "R-ENUM-KEEP", dataClass: "INTERNAL_CONTROL_DATA" }),
    "created_at": Object.freeze({ disposition: "KEEP", ruleId: "R-TIME-KEEP", dataClass: "TIMESTAMP" }),
    "updated_at": Object.freeze({ disposition: "KEEP", ruleId: "R-TIME-KEEP", dataClass: "TIMESTAMP" }),
    "expires_at": Object.freeze({ disposition: "KEEP", ruleId: "R-TIME-KEEP", dataClass: "TIMESTAMP" }),
  }),
  "platform_portal_access_requests": Object.freeze({
    "id": Object.freeze({ disposition: "KEEP", ruleId: "R-OPAQUE-REF-KEEP", dataClass: "OPAQUE_REFERENCE" }),
    "portal_user_ref": Object.freeze({ disposition: "KEEP", ruleId: "R-OPAQUE-REF-KEEP", dataClass: "OPAQUE_REFERENCE" }),
    "plan": Object.freeze({ disposition: "KEEP", ruleId: "R-ENUM-KEEP", dataClass: "INTERNAL_CONTROL_DATA" }),
    "client_target": Object.freeze({ disposition: "KEEP", ruleId: "R-ENUM-KEEP", dataClass: "INTERNAL_CONTROL_DATA" }),
    "duration_days": Object.freeze({ disposition: "KEEP", ruleId: "R-INTEGER-KEEP", dataClass: "INTERNAL_CONTROL_DATA" }),
    "quantity": Object.freeze({ disposition: "KEEP", ruleId: "R-INTEGER-KEEP", dataClass: "INTERNAL_CONTROL_DATA" }),
    "status": Object.freeze({ disposition: "KEEP", ruleId: "R-ENUM-KEEP", dataClass: "INTERNAL_CONTROL_DATA" }),
    "next_action": Object.freeze({ disposition: "KEEP", ruleId: "R-ENUM-KEEP", dataClass: "INTERNAL_CONTROL_DATA" }),
    "note_provided": Object.freeze({ disposition: "KEEP", ruleId: "R-BOOL-KEEP", dataClass: "BOOLEAN_FLAG" }),
    "prior_trial_state": Object.freeze({ disposition: "KEEP", ruleId: "R-ENUM-KEEP", dataClass: "INTERNAL_CONTROL_DATA" }),
    "submitted_at": Object.freeze({ disposition: "KEEP", ruleId: "R-TIME-KEEP", dataClass: "TIMESTAMP" }),
    "updated_at": Object.freeze({ disposition: "KEEP", ruleId: "R-TIME-KEEP", dataClass: "TIMESTAMP" }),
    "reviewed_at": Object.freeze({ disposition: "KEEP", ruleId: "R-TIME-KEEP", dataClass: "TIMESTAMP" }),
    "reviewed_by_ref": Object.freeze({ disposition: "KEEP", ruleId: "R-OPAQUE-REF-KEEP", dataClass: "OPAQUE_REFERENCE" }),
    "safe_reason_code": Object.freeze({ disposition: "KEEP", ruleId: "R-ENUM-KEEP", dataClass: "INTERNAL_CONTROL_DATA" }),
    "expires_at": Object.freeze({ disposition: "KEEP", ruleId: "R-TIME-KEEP", dataClass: "TIMESTAMP" }),
    "valid_until": Object.freeze({ disposition: "KEEP", ruleId: "R-TIME-KEEP", dataClass: "TIMESTAMP" }),
    "entitlement_ref": Object.freeze({ disposition: "KEEP", ruleId: "R-OPAQUE-REF-KEEP", dataClass: "OPAQUE_REFERENCE" }),
    "access_grant_ref": Object.freeze({ disposition: "KEEP", ruleId: "R-OPAQUE-REF-KEEP", dataClass: "OPAQUE_REFERENCE" }),
    "tenant_id": Object.freeze({ disposition: "KEEP", ruleId: "R-OPAQUE-REF-KEEP", dataClass: "OPAQUE_REFERENCE" }),
    "artifact_id": Object.freeze({ disposition: "KEEP", ruleId: "R-OPAQUE-REF-KEEP", dataClass: "OPAQUE_REFERENCE" }),
    "subscription_url": Object.freeze({ disposition: "EXTERNALIZE", ruleId: "R-SUBSCRIPTION-URL-EXT", dataClass: "SECRET_OR_ACTION_CAPABILITY" }),
    "edge_channel_ref": Object.freeze({ disposition: "KEEP", ruleId: "R-OPAQUE-REF-KEEP", dataClass: "OPAQUE_REFERENCE" }),
    "edge_credential_ref": Object.freeze({ disposition: "KEEP", ruleId: "R-OPAQUE-REF-KEEP", dataClass: "OPAQUE_REFERENCE" }),
    "edge_material_digest": Object.freeze({ disposition: "KEEP", ruleId: "R-DIGEST-KEEP", dataClass: "ONE_WAY_DIGEST" }),
    "edge_lifecycle_mutation": Object.freeze({ disposition: "KEEP", ruleId: "R-BOOL-KEEP", dataClass: "BOOLEAN_FLAG" }),
    "event_json": Object.freeze({ disposition: "TRANSFORM", ruleId: "R-METADATA-JSON", dataClass: "CONTROLLED_JSON" }),
  }),
  "platform_portal_totp_credentials": Object.freeze({
    "id": Object.freeze({ disposition: "KEEP", ruleId: "R-OPAQUE-REF-KEEP", dataClass: "OPAQUE_REFERENCE" }),
    "account_id": Object.freeze({ disposition: "KEEP", ruleId: "R-OPAQUE-REF-KEEP", dataClass: "OPAQUE_REFERENCE" }),
    "encrypted_totp_secret": Object.freeze({ disposition: "EXTERNALIZE", ruleId: "R-TOTP-EXT", dataClass: "SECRET_OR_ACTION_CAPABILITY" }),
    "status": Object.freeze({ disposition: "KEEP", ruleId: "R-ENUM-KEEP", dataClass: "INTERNAL_CONTROL_DATA" }),
    "failure_count": Object.freeze({ disposition: "KEEP", ruleId: "R-INTEGER-KEEP", dataClass: "INTERNAL_CONTROL_DATA" }),
    "locked_until": Object.freeze({ disposition: "KEEP", ruleId: "R-TIME-KEEP", dataClass: "TIMESTAMP" }),
    "enrolled_at": Object.freeze({ disposition: "KEEP", ruleId: "R-TIME-KEEP", dataClass: "TIMESTAMP" }),
    "last_verified_at": Object.freeze({ disposition: "KEEP", ruleId: "R-TIME-KEEP", dataClass: "TIMESTAMP" }),
    "revoked_at": Object.freeze({ disposition: "KEEP", ruleId: "R-TIME-KEEP", dataClass: "TIMESTAMP" }),
    "updated_at": Object.freeze({ disposition: "KEEP", ruleId: "R-TIME-KEEP", dataClass: "TIMESTAMP" }),
  }),
  "platform_payment_receipts": Object.freeze({
    "receipt_ref": Object.freeze({ disposition: "KEEP", ruleId: "R-OPAQUE-REF-KEEP", dataClass: "OPAQUE_REFERENCE" }),
    "payment_order_ref": Object.freeze({ disposition: "KEEP", ruleId: "R-OPAQUE-REF-KEEP", dataClass: "OPAQUE_REFERENCE" }),
    "attempt_ref": Object.freeze({ disposition: "KEEP", ruleId: "R-OPAQUE-REF-KEEP", dataClass: "OPAQUE_REFERENCE" }),
    "provider_request_ref": Object.freeze({ disposition: "KEEP", ruleId: "R-OPAQUE-REF-KEEP", dataClass: "OPAQUE_REFERENCE" }),
    "receipt_type": Object.freeze({ disposition: "KEEP", ruleId: "R-ENUM-KEEP", dataClass: "FINANCIAL_OR_REWARD_CONTROL_FACT" }),
    "canonical_state": Object.freeze({ disposition: "KEEP", ruleId: "R-ENUM-KEEP", dataClass: "FINANCIAL_OR_REWARD_CONTROL_FACT" }),
    "charge_certainty": Object.freeze({ disposition: "KEEP", ruleId: "R-ENUM-KEEP", dataClass: "FINANCIAL_OR_REWARD_CONTROL_FACT" }),
    "provider_order_ref": Object.freeze({ disposition: "KEEP", ruleId: "R-OPAQUE-REF-KEEP", dataClass: "OPAQUE_REFERENCE" }),
    "provider_capture_ref": Object.freeze({ disposition: "KEEP", ruleId: "R-OPAQUE-REF-KEEP", dataClass: "OPAQUE_REFERENCE" }),
    "provider_event_ref": Object.freeze({ disposition: "KEEP", ruleId: "R-OPAQUE-REF-KEEP", dataClass: "OPAQUE_REFERENCE" }),
    "event_dedupe_key": Object.freeze({ disposition: "TRANSFORM", ruleId: "R-PROVIDER-EVENT-HMAC", dataClass: "PROVIDER_EVENT_DEDUPE" }),
    "merchant_scope_digest": Object.freeze({ disposition: "KEEP", ruleId: "R-DIGEST-KEEP", dataClass: "ONE_WAY_DIGEST" }),
    "payload_digest": Object.freeze({ disposition: "KEEP", ruleId: "R-DIGEST-KEEP", dataClass: "ONE_WAY_DIGEST" }),
    "next_action_type": Object.freeze({ disposition: "KEEP", ruleId: "R-ENUM-KEEP", dataClass: "FINANCIAL_OR_REWARD_CONTROL_FACT" }),
    "next_action_url": Object.freeze({ disposition: "EXTERNALIZE", ruleId: "R-PAYMENT-ACTION-EXT", dataClass: "SECRET_OR_ACTION_CAPABILITY" }),
    "next_action_expires_at": Object.freeze({ disposition: "KEEP", ruleId: "R-TIME-KEEP", dataClass: "TIMESTAMP" }),
    "verification_result": Object.freeze({ disposition: "KEEP", ruleId: "R-ENUM-KEEP", dataClass: "FINANCIAL_OR_REWARD_CONTROL_FACT" }),
    "amount_minor": Object.freeze({ disposition: "KEEP", ruleId: "R-INTEGER-KEEP", dataClass: "FINANCIAL_OR_REWARD_CONTROL_FACT" }),
    "currency": Object.freeze({ disposition: "KEEP", ruleId: "R-ENUM-KEEP", dataClass: "FINANCIAL_OR_REWARD_CONTROL_FACT" }),
    "currency_exponent": Object.freeze({ disposition: "KEEP", ruleId: "R-INTEGER-KEEP", dataClass: "FINANCIAL_OR_REWARD_CONTROL_FACT" }),
    "expected_paid_coin_units": Object.freeze({ disposition: "KEEP", ruleId: "R-INTEGER-KEEP", dataClass: "FINANCIAL_OR_REWARD_CONTROL_FACT" }),
    "accepted_at": Object.freeze({ disposition: "KEEP", ruleId: "R-TIME-KEEP", dataClass: "TIMESTAMP" }),
  }),
  "platform_payment_orders_legacy_archive_20260803": Object.freeze({
    "order_ref": Object.freeze({ disposition: "CONDITIONAL", ruleId: "R-ARCHIVE-CONDITIONAL", dataClass: "OPAQUE_REFERENCE" }),
    "portal_user_ref": Object.freeze({ disposition: "CONDITIONAL", ruleId: "R-ARCHIVE-CONDITIONAL", dataClass: "OPAQUE_REFERENCE" }),
    "plan": Object.freeze({ disposition: "CONDITIONAL", ruleId: "R-ARCHIVE-CONDITIONAL", dataClass: "FINANCIAL_OR_REWARD_CONTROL_FACT" }),
    "plan_label": Object.freeze({ disposition: "CONDITIONAL", ruleId: "R-ARCHIVE-CONDITIONAL", dataClass: "FINANCIAL_OR_REWARD_CONTROL_FACT" }),
    "amount_minor": Object.freeze({ disposition: "CONDITIONAL", ruleId: "R-ARCHIVE-CONDITIONAL", dataClass: "FINANCIAL_OR_REWARD_CONTROL_FACT" }),
    "money": Object.freeze({ disposition: "CONDITIONAL", ruleId: "R-ARCHIVE-CONDITIONAL", dataClass: "FINANCIAL_OR_REWARD_CONTROL_FACT" }),
    "currency": Object.freeze({ disposition: "CONDITIONAL", ruleId: "R-ARCHIVE-CONDITIONAL", dataClass: "FINANCIAL_OR_REWARD_CONTROL_FACT" }),
    "duration_days": Object.freeze({ disposition: "CONDITIONAL", ruleId: "R-ARCHIVE-CONDITIONAL", dataClass: "FINANCIAL_OR_REWARD_CONTROL_FACT" }),
    "client_target": Object.freeze({ disposition: "CONDITIONAL", ruleId: "R-ARCHIVE-CONDITIONAL", dataClass: "FINANCIAL_OR_REWARD_CONTROL_FACT" }),
    "channel": Object.freeze({ disposition: "CONDITIONAL", ruleId: "R-ARCHIVE-CONDITIONAL", dataClass: "FINANCIAL_OR_REWARD_CONTROL_FACT" }),
    "status": Object.freeze({ disposition: "CONDITIONAL", ruleId: "R-ARCHIVE-CONDITIONAL", dataClass: "FINANCIAL_OR_REWARD_CONTROL_FACT" }),
    "provider": Object.freeze({ disposition: "CONDITIONAL", ruleId: "R-ARCHIVE-CONDITIONAL", dataClass: "FINANCIAL_OR_REWARD_CONTROL_FACT" }),
    "provider_order_ref": Object.freeze({ disposition: "CONDITIONAL", ruleId: "R-ARCHIVE-CONDITIONAL", dataClass: "OPAQUE_REFERENCE" }),
    "checkout_url": Object.freeze({ disposition: "EXTERNALIZE", ruleId: "R-LEGACY-CHECKOUT-EXT", dataClass: "SECRET_OR_ACTION_CAPABILITY" }),
    "access_request_ref": Object.freeze({ disposition: "CONDITIONAL", ruleId: "R-ARCHIVE-CONDITIONAL", dataClass: "OPAQUE_REFERENCE" }),
    "access_request_status": Object.freeze({ disposition: "CONDITIONAL", ruleId: "R-ARCHIVE-CONDITIONAL", dataClass: "FINANCIAL_OR_REWARD_CONTROL_FACT" }),
    "paid_at": Object.freeze({ disposition: "CONDITIONAL", ruleId: "R-ARCHIVE-CONDITIONAL", dataClass: "TIMESTAMP" }),
    "created_at": Object.freeze({ disposition: "CONDITIONAL", ruleId: "R-ARCHIVE-CONDITIONAL", dataClass: "TIMESTAMP" }),
    "updated_at": Object.freeze({ disposition: "CONDITIONAL", ruleId: "R-ARCHIVE-CONDITIONAL", dataClass: "TIMESTAMP" }),
    "checkout_expires_at": Object.freeze({ disposition: "CONDITIONAL", ruleId: "R-ARCHIVE-CONDITIONAL", dataClass: "TIMESTAMP" }),
    "checkout_url_scheme": Object.freeze({ disposition: "CONDITIONAL", ruleId: "R-ARCHIVE-CONDITIONAL", dataClass: "FINANCIAL_OR_REWARD_CONTROL_FACT" }),
    "checkout_qr_code": Object.freeze({ disposition: "EXTERNALIZE", ruleId: "R-LEGACY-QR-EXT", dataClass: "SECRET_OR_ACTION_CAPABILITY" }),
    "refund_status": Object.freeze({ disposition: "CONDITIONAL", ruleId: "R-ARCHIVE-CONDITIONAL", dataClass: "FINANCIAL_OR_REWARD_CONTROL_FACT" }),
    "refund_requested_at": Object.freeze({ disposition: "CONDITIONAL", ruleId: "R-ARCHIVE-CONDITIONAL", dataClass: "TIMESTAMP" }),
    "refund_approved_at": Object.freeze({ disposition: "CONDITIONAL", ruleId: "R-ARCHIVE-CONDITIONAL", dataClass: "TIMESTAMP" }),
    "refund_amount_minor": Object.freeze({ disposition: "CONDITIONAL", ruleId: "R-ARCHIVE-CONDITIONAL", dataClass: "FINANCIAL_OR_REWARD_CONTROL_FACT" }),
    "refund_remaining_days": Object.freeze({ disposition: "CONDITIONAL", ruleId: "R-ARCHIVE-CONDITIONAL", dataClass: "FINANCIAL_OR_REWARD_CONTROL_FACT" }),
    "refund_reason_code": Object.freeze({ disposition: "CONDITIONAL", ruleId: "R-ARCHIVE-CONDITIONAL", dataClass: "FINANCIAL_OR_REWARD_CONTROL_FACT" }),
    "refund_provider_ref": Object.freeze({ disposition: "CONDITIONAL", ruleId: "R-ARCHIVE-CONDITIONAL", dataClass: "OPAQUE_REFERENCE" }),
    "refund_failed_reason": Object.freeze({ disposition: "CONDITIONAL", ruleId: "R-ARCHIVE-CONDITIONAL", dataClass: "FINANCIAL_OR_REWARD_CONTROL_FACT" }),
  }),
  "platform_portal_password_credentials": Object.freeze({
    "id": Object.freeze({ disposition: "DEFER", ruleId: "R-PASSWORD-DEFER", dataClass: "FUTURE_AUTH_CREDENTIAL" }),
    "account_id": Object.freeze({ disposition: "DEFER", ruleId: "R-PASSWORD-DEFER", dataClass: "FUTURE_AUTH_CREDENTIAL" }),
    "password_hash": Object.freeze({ disposition: "DEFER", ruleId: "R-PASSWORD-DEFER", dataClass: "FUTURE_AUTH_CREDENTIAL" }),
    "status": Object.freeze({ disposition: "DEFER", ruleId: "R-PASSWORD-DEFER", dataClass: "FUTURE_AUTH_CREDENTIAL" }),
    "failure_count": Object.freeze({ disposition: "DEFER", ruleId: "R-PASSWORD-DEFER", dataClass: "FUTURE_AUTH_CREDENTIAL" }),
    "locked_until": Object.freeze({ disposition: "DEFER", ruleId: "R-PASSWORD-DEFER", dataClass: "FUTURE_AUTH_CREDENTIAL" }),
    "must_rotate": Object.freeze({ disposition: "DEFER", ruleId: "R-PASSWORD-DEFER", dataClass: "FUTURE_AUTH_CREDENTIAL" }),
    "created_at": Object.freeze({ disposition: "DEFER", ruleId: "R-PASSWORD-DEFER", dataClass: "FUTURE_AUTH_CREDENTIAL" }),
    "last_verified_at": Object.freeze({ disposition: "DEFER", ruleId: "R-PASSWORD-DEFER", dataClass: "FUTURE_AUTH_CREDENTIAL" }),
    "revoked_at": Object.freeze({ disposition: "DEFER", ruleId: "R-PASSWORD-DEFER", dataClass: "FUTURE_AUTH_CREDENTIAL" }),
    "updated_at": Object.freeze({ disposition: "DEFER", ruleId: "R-PASSWORD-DEFER", dataClass: "FUTURE_AUTH_CREDENTIAL" }),
  }),
  "platform_portal_passkey_credentials": Object.freeze({
    "id": Object.freeze({ disposition: "DEFER", ruleId: "R-PASSKEY-DEFER", dataClass: "FUTURE_AUTH_CREDENTIAL" }),
    "account_id": Object.freeze({ disposition: "DEFER", ruleId: "R-PASSKEY-DEFER", dataClass: "FUTURE_AUTH_CREDENTIAL" }),
    "credential_id": Object.freeze({ disposition: "DEFER", ruleId: "R-PASSKEY-DEFER", dataClass: "FUTURE_AUTH_CREDENTIAL" }),
    "credential_id_hash": Object.freeze({ disposition: "DEFER", ruleId: "R-PASSKEY-DEFER", dataClass: "FUTURE_AUTH_CREDENTIAL" }),
    "public_key_jwk_json": Object.freeze({ disposition: "DEFER", ruleId: "R-PASSKEY-DEFER", dataClass: "FUTURE_AUTH_CREDENTIAL" }),
    "sign_count": Object.freeze({ disposition: "DEFER", ruleId: "R-PASSKEY-DEFER", dataClass: "FUTURE_AUTH_CREDENTIAL" }),
    "transports_json": Object.freeze({ disposition: "DEFER", ruleId: "R-PASSKEY-DEFER", dataClass: "FUTURE_AUTH_CREDENTIAL" }),
    "status": Object.freeze({ disposition: "DEFER", ruleId: "R-PASSKEY-DEFER", dataClass: "FUTURE_AUTH_CREDENTIAL" }),
    "created_at": Object.freeze({ disposition: "DEFER", ruleId: "R-PASSKEY-DEFER", dataClass: "FUTURE_AUTH_CREDENTIAL" }),
    "last_verified_at": Object.freeze({ disposition: "DEFER", ruleId: "R-PASSKEY-DEFER", dataClass: "FUTURE_AUTH_CREDENTIAL" }),
    "revoked_at": Object.freeze({ disposition: "DEFER", ruleId: "R-PASSKEY-DEFER", dataClass: "FUTURE_AUTH_CREDENTIAL" }),
    "updated_at": Object.freeze({ disposition: "DEFER", ruleId: "R-PASSKEY-DEFER", dataClass: "FUTURE_AUTH_CREDENTIAL" }),
  }),
  "platform_accounts": Object.freeze({
    "id": Object.freeze({ disposition: "KEEP", ruleId: "R-OPAQUE-REF-KEEP", dataClass: "OPAQUE_REFERENCE" }),
    "owner_ref": Object.freeze({ disposition: "KEEP", ruleId: "R-OPAQUE-REF-KEEP", dataClass: "OPAQUE_REFERENCE" }),
    "status": Object.freeze({ disposition: "KEEP", ruleId: "R-ENUM-KEEP", dataClass: "INTERNAL_CONTROL_DATA" }),
    "created_at": Object.freeze({ disposition: "KEEP", ruleId: "R-TIME-KEEP", dataClass: "TIMESTAMP" }),
    "updated_at": Object.freeze({ disposition: "KEEP", ruleId: "R-TIME-KEEP", dataClass: "TIMESTAMP" }),
    "metadata_json": Object.freeze({ disposition: "TRANSFORM", ruleId: "R-METADATA-JSON", dataClass: "CONTROLLED_JSON" }),
  }),
});

// Expected per-disposition counts across the 8 tables (129 columns).
export const D1_CARD4_FIELD_MATRIX_COUNTS = Object.freeze({
  total: 129,
  KEEP: 67,
  CONDITIONAL: 29,
  EXTERNALIZE: 7,
  TRANSFORM: 3,
  DEFER: 23,
});

/**
 * Look up one column's matrix entry. Returns null when the table or the column
 * is not in the matrix (callers treat null as "not covered", never as KEEP).
 */
export function getD1Card4FieldDisposition(table, column) {
  const row = D1_CARD4_FIELD_MATRIX[table];
  if (!row) return null;
  return row[column] ?? null;
}

/**
 * Verify a T2-shaped object against the matrix.
 *
 * `t2` is expected to have the T2 shape: `{ counts, tables, fields }` where
 * `fields` is an array of `{ table, column, disposition, ruleId, dataClass }`.
 * Returns an array of mismatch strings; an empty array means the T2 object
 * agrees with the matrix on every one of the 129 columns (plus the global
 * counts). Mismatches cover: a matrix column missing from T2, a T2 column
 * whose disposition / ruleId / dataClass differs from the matrix, a matrix
 * table missing from T2, and global count drift.
 */
export function verifyD1Card4FieldMatrixAgainstT2(t2) {
  const mismatches = [];
  if (!t2 || typeof t2 !== "object") return ["t2 is not an object"];
  const fields = Array.isArray(t2.fields) ? t2.fields : [];
  const byKey = new Map();
  for (const f of fields) {
    if (f && typeof f.table === "string" && typeof f.column === "string") {
      byKey.set(`${f.table}\u0000${f.column}`, f);
    }
  }
  for (const table of D1_CARD4_FIELD_MATRIX_TABLES) {
    const row = D1_CARD4_FIELD_MATRIX[table];
    for (const [column, want] of Object.entries(row)) {
      const got = byKey.get(`${table}\u0000${column}`);
      if (!got) {
        mismatches.push(`missing column: ${table}.${column}`);
        continue;
      }
      if (got.disposition !== want.disposition) {
        mismatches.push(`${table}.${column}: disposition ${got.disposition} != matrix ${want.disposition}`);
      }
      if (got.ruleId !== want.ruleId) {
        mismatches.push(`${table}.${column}: ruleId ${got.ruleId} != matrix ${want.ruleId}`);
      }
      if (got.dataClass !== want.dataClass) {
        mismatches.push(`${table}.${column}: dataClass ${got.dataClass} != matrix ${want.dataClass}`);
      }
    }
  }
  const counts = t2.counts && t2.counts.fieldDispositions;
  if (counts) {
    if (counts.EXTERNALIZE !== 7) mismatches.push(`global EXTERNALIZE ${counts.EXTERNALIZE} != 7`);
    if (counts.DEFER !== 23) mismatches.push(`global DEFER ${counts.DEFER} != 23`);
  }
  if (typeof t2.counts?.fields === "number" && t2.counts.fields !== 820) {
    mismatches.push(`global fields ${t2.counts.fields} != 820`);
  }
  return mismatches;
}
