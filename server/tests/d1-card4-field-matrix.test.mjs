import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  D1_CARD4_FIELD_MATRIX,
  D1_CARD4_FIELD_MATRIX_CANDIDATE_TABLE,
  D1_CARD4_FIELD_MATRIX_COUNTS,
  D1_CARD4_FIELD_MATRIX_TABLES,
  D1_CARD4_PASSKEY_CONDITIONS,
  getD1Card4FieldDisposition,
  verifyD1Card4FieldMatrixAgainstT2
} from "../services/platform/d1-card4-field-matrix.mjs";

// The T2 JSON is a repo artifact (not production data). The matrix was
// transcribed from it, then corrected per the matrix document §13/§14, so
// the matrix now deliberately diverges from the unchanged T2 JSON on the
// leads, password and passkey tables (see the divergence test below). The T2
// assertions in this file are scoped to T2 facts unless marked "matrix".
// All key material elsewhere in card #4 tests is synthetic; this file uses none.
const T2_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/D1_CONTROL_FIELD_DISPOSITION_T2_V1.json"
);

function loadT2() {
  return JSON.parse(readFileSync(T2_PATH, "utf8"));
}

function matrixColumnCount() {
  let n = 0;
  for (const table of D1_CARD4_FIELD_MATRIX_TABLES) {
    n += Object.keys(D1_CARD4_FIELD_MATRIX[table]).length;
  }
  return n;
}

function countDispositions() {
  const counts = { KEEP: 0, CONDITIONAL: 0, EXTERNALIZE: 0, TRANSFORM: 0, DEFER: 0 };
  for (const table of D1_CARD4_FIELD_MATRIX_TABLES) {
    for (const entry of Object.values(D1_CARD4_FIELD_MATRIX[table])) {
      counts[entry.disposition] += 1;
    }
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Matrix shape: 8 tables, 128 columns, counts as documented.
// ---------------------------------------------------------------------------

test("matrix covers exactly the 8 tables, 128 columns", () => {
  assert.deepEqual([...D1_CARD4_FIELD_MATRIX_TABLES], [
    "platform_leads",
    "platform_portal_access_requests",
    "platform_portal_totp_credentials",
    "platform_payment_receipts",
    "platform_payment_orders_legacy_archive_20260803",
    "platform_portal_password_credentials",
    "platform_portal_passkey_credentials",
    "platform_accounts"
  ]);
  assert.equal(matrixColumnCount(), 128);
  assert.deepEqual(D1_CARD4_FIELD_MATRIX_COUNTS, {
    total: 128,
    KEEP: 70,
    CONDITIONAL: 40,
    EXTERNALIZE: 7,
    TRANSFORM: 2,
    DEFER: 9
  });
  assert.deepEqual(countDispositions(), {
    KEEP: 70,
    CONDITIONAL: 40,
    EXTERNALIZE: 7,
    TRANSFORM: 2,
    DEFER: 9
  });
});

test("the 8th table stays a candidate, not confirmed", () => {
  assert.equal(D1_CARD4_FIELD_MATRIX_CANDIDATE_TABLE, "platform_accounts");
  assert.ok(D1_CARD4_FIELD_MATRIX_TABLES.includes("platform_accounts"));
});

// ---------------------------------------------------------------------------
// Matrix vs the repo T2 JSON: exactly the four corrected-matrix
// divergences, nothing else.
// ---------------------------------------------------------------------------

test("matrix differs from the repo T2 JSON only by the four corrected-matrix divergences", () => {
  const t2 = loadT2();
  assert.equal(t2.counts.tables, 70);
  assert.equal(t2.counts.fields, 820);
  // The corrected matrix (docs/D1_CARD4_FIELD_MATRIX_2026-11-21.md §13/§14)
  // deliberately diverges from the unchanged T2 JSON in exactly four ways:
  // (1) platform_leads' 9 non-EXTERNALIZE columns are DEFER in the matrix
  // (T2: 8 KEEP + 1 CONDITIONAL); (2) all 11
  // platform_portal_password_credentials columns are KEEP in the matrix
  // (T2: DEFER); (3) all 12 platform_portal_passkey_credentials columns
  // are CONDITIONAL in the matrix (T2: DEFER; decision package §6, Yi
  // 2026-11-22 00:07 agreed, 00:46 ordered item-by-item confirmation);
  // (4) platform_accounts.metadata_json is removed from the
  // matrix (T2 still lists it as TRANSFORM — the verifier only checks
  // matrix columns against T2, so an extra T2 column produces no mismatch).
  // The global T2 DEFER count (23) therefore also differs from the matrix
  // DEFER count (9). Any mismatch outside this list is real drift.
  assert.deepEqual(verifyD1Card4FieldMatrixAgainstT2(t2), [
    "platform_leads.id: disposition KEEP != matrix DEFER",
    "platform_leads.status: disposition KEEP != matrix DEFER",
    "platform_leads.organization: disposition CONDITIONAL != matrix DEFER",
    "platform_leads.direction: disposition KEEP != matrix DEFER",
    "platform_leads.stage: disposition KEEP != matrix DEFER",
    "platform_leads.source: disposition KEEP != matrix DEFER",
    "platform_leads.created_at: disposition KEEP != matrix DEFER",
    "platform_leads.updated_at: disposition KEEP != matrix DEFER",
    "platform_leads.expires_at: disposition KEEP != matrix DEFER",
    "platform_portal_password_credentials.id: disposition DEFER != matrix KEEP",
    "platform_portal_password_credentials.account_id: disposition DEFER != matrix KEEP",
    "platform_portal_password_credentials.password_hash: disposition DEFER != matrix KEEP",
    "platform_portal_password_credentials.status: disposition DEFER != matrix KEEP",
    "platform_portal_password_credentials.failure_count: disposition DEFER != matrix KEEP",
    "platform_portal_password_credentials.locked_until: disposition DEFER != matrix KEEP",
    "platform_portal_password_credentials.must_rotate: disposition DEFER != matrix KEEP",
    "platform_portal_password_credentials.created_at: disposition DEFER != matrix KEEP",
    "platform_portal_password_credentials.last_verified_at: disposition DEFER != matrix KEEP",
    "platform_portal_password_credentials.revoked_at: disposition DEFER != matrix KEEP",
    "platform_portal_password_credentials.updated_at: disposition DEFER != matrix KEEP",
    "platform_portal_passkey_credentials.id: disposition DEFER != matrix CONDITIONAL",
    "platform_portal_passkey_credentials.account_id: disposition DEFER != matrix CONDITIONAL",
    "platform_portal_passkey_credentials.credential_id: disposition DEFER != matrix CONDITIONAL",
    "platform_portal_passkey_credentials.credential_id_hash: disposition DEFER != matrix CONDITIONAL",
    "platform_portal_passkey_credentials.public_key_jwk_json: disposition DEFER != matrix CONDITIONAL",
    "platform_portal_passkey_credentials.sign_count: disposition DEFER != matrix CONDITIONAL",
    "platform_portal_passkey_credentials.transports_json: disposition DEFER != matrix CONDITIONAL",
    "platform_portal_passkey_credentials.status: disposition DEFER != matrix CONDITIONAL",
    "platform_portal_passkey_credentials.created_at: disposition DEFER != matrix CONDITIONAL",
    "platform_portal_passkey_credentials.last_verified_at: disposition DEFER != matrix CONDITIONAL",
    "platform_portal_passkey_credentials.revoked_at: disposition DEFER != matrix CONDITIONAL",
    "platform_portal_passkey_credentials.updated_at: disposition DEFER != matrix CONDITIONAL",
    "global DEFER 23 != 9"
  ]);
});

test("T2 JSON holds 7 EXTERNALIZE and 23 DEFER columns (matrix: 7 EXTERNALIZE, 9 DEFER)", () => {
  const t2 = loadT2();
  const ext = [];
  const defer = [];
  for (const f of t2.fields) {
    if (f.disposition === "EXTERNALIZE") ext.push(`${f.table}.${f.column}`);
    if (f.disposition === "DEFER") defer.push(`${f.table}.${f.column}`);
  }
  assert.deepEqual(ext.sort(), [
    "platform_leads.email",
    "platform_leads.message",
    "platform_payment_orders_legacy_archive_20260803.checkout_qr_code",
    "platform_payment_orders_legacy_archive_20260803.checkout_url",
    "platform_payment_receipts.next_action_url",
    "platform_portal_access_requests.subscription_url",
    "platform_portal_totp_credentials.encrypted_totp_secret"
  ]);
  assert.equal(defer.length, 23);
  assert.ok(defer.every((k) => k.startsWith("platform_portal_password_credentials.")
    || k.startsWith("platform_portal_passkey_credentials.")));
  // Matrix-side composition (totals already pinned by the shape test):
  // DEFER 9 = leads 9 only; the password 11 are KEEP in the matrix and
  // the passkey 12 are CONDITIONAL in the matrix, not DEFER.
  const matrixDefer = [];
  for (const table of D1_CARD4_FIELD_MATRIX_TABLES) {
    for (const [column, entry] of Object.entries(D1_CARD4_FIELD_MATRIX[table])) {
      if (entry.disposition === "DEFER") matrixDefer.push(`${table}.${column}`);
    }
  }
  assert.equal(matrixDefer.length, 9);
  assert.ok(matrixDefer.every((k) => k.startsWith("platform_leads.")));
});

// ---------------------------------------------------------------------------
// Sensitive-field dispositions, looked up through the helper.
// ---------------------------------------------------------------------------

test("sensitive fields resolve to their matrix dispositions", () => {
  assert.equal(getD1Card4FieldDisposition("platform_leads", "email").disposition, "EXTERNALIZE");
  assert.equal(getD1Card4FieldDisposition("platform_leads", "message").disposition, "EXTERNALIZE");
  assert.equal(getD1Card4FieldDisposition("platform_leads", "organization").disposition, "DEFER");
  assert.equal(getD1Card4FieldDisposition("platform_leads", "id").disposition, "DEFER");
  assert.equal(getD1Card4FieldDisposition("platform_portal_access_requests", "subscription_url").disposition, "EXTERNALIZE");
  assert.equal(getD1Card4FieldDisposition("platform_portal_access_requests", "event_json").disposition, "TRANSFORM");
  assert.equal(getD1Card4FieldDisposition("platform_portal_totp_credentials", "encrypted_totp_secret").disposition, "EXTERNALIZE");
  assert.equal(getD1Card4FieldDisposition("platform_payment_receipts", "next_action_url").disposition, "EXTERNALIZE");
  assert.equal(getD1Card4FieldDisposition("platform_payment_receipts", "event_dedupe_key").disposition, "TRANSFORM");
  assert.equal(getD1Card4FieldDisposition("platform_payment_orders_legacy_archive_20260803", "checkout_url").disposition, "EXTERNALIZE");
  assert.equal(getD1Card4FieldDisposition("platform_payment_orders_legacy_archive_20260803", "checkout_qr_code").disposition, "EXTERNALIZE");
  assert.equal(getD1Card4FieldDisposition("platform_payment_orders_legacy_archive_20260803", "order_ref").disposition, "CONDITIONAL");
  assert.equal(getD1Card4FieldDisposition("platform_portal_password_credentials", "password_hash").disposition, "KEEP");
  assert.equal(getD1Card4FieldDisposition("platform_portal_passkey_credentials", "public_key_jwk_json").disposition, "CONDITIONAL");
  // platform_accounts.metadata_json was removed from the matrix (M1-02 (a));
  // the lookup therefore returns null ("not covered"), never a default.
  assert.equal(getD1Card4FieldDisposition("platform_accounts", "metadata_json"), null);
  assert.equal(getD1Card4FieldDisposition("platform_accounts", "id").disposition, "KEEP");
});

test("passkey columns are CONDITIONAL with all five conditions, C1 met and C2-C5 pending", () => {
  // Matrix doc §7/§14.7 (decision package §6): 12 passkey columns are
  // CONDITIONAL — in scope, no data load; all five conditions must hold
  // before any row loads. Only C1 is met; C2–C5 are pending.
  assert.deepEqual(
    D1_CARD4_PASSKEY_CONDITIONS.map((c) => [c.id, c.status]),
    [["C1", "MET"], ["C2", "PENDING"], ["C3", "PENDING"], ["C4", "PENDING"], ["C5", "PENDING"]]
  );
  const passkey = D1_CARD4_FIELD_MATRIX.platform_portal_passkey_credentials;
  assert.equal(Object.keys(passkey).length, 12);
  for (const [column, entry] of Object.entries(passkey)) {
    assert.equal(entry.disposition, "CONDITIONAL", column);
    assert.equal(entry.ruleId, "R-PASSKEY-DEFER", column);
    assert.equal(entry.dataClass, "FUTURE_AUTH_CREDENTIAL", column);
    assert.deepEqual([...entry.conditions], ["C1", "C2", "C3", "C4", "C5"], column);
  }
  // C3 names its per-column items (matrix §14.7 note).
  const c3 = D1_CARD4_PASSKEY_CONDITIONS.find((c) => c.id === "C3");
  assert.ok(c3.text.includes("public_key_jwk_json"));
  assert.ok(c3.text.includes("credential_id"));
  assert.ok(c3.text.includes("sign_count"));
  assert.ok(c3.text.includes("transports_json"));
});

test("lookup returns null for unknown table or column, never a default", () => {
  assert.equal(getD1Card4FieldDisposition("platform_nope", "id"), null);
  assert.equal(getD1Card4FieldDisposition("platform_leads", "nope"), null);
  assert.equal(getD1Card4FieldDisposition("platform_leads", "email").ruleId, "R-EMAIL-EXT");
  assert.equal(getD1Card4FieldDisposition("platform_leads", "email").dataClass, "DIRECT_PII");
});

// ---------------------------------------------------------------------------
// Verifier detects tampering (synthetic T2 objects, no production data).
// ---------------------------------------------------------------------------

test("verifier flags a flipped disposition", () => {
  const t2 = loadT2();
  const tampered = JSON.parse(JSON.stringify(t2));
  const email = tampered.fields.find((f) => f.table === "platform_leads" && f.column === "email");
  email.disposition = "KEEP";
  const mismatches = verifyD1Card4FieldMatrixAgainstT2(tampered);
  assert.ok(mismatches.some((m) => m.includes("platform_leads.email") && m.includes("KEEP") && m.includes("EXTERNALIZE")));
});

test("verifier flags a changed ruleId and a changed dataClass", () => {
  const t2 = loadT2();
  const tampered = JSON.parse(JSON.stringify(t2));
  const totp = tampered.fields.find((f) => f.table === "platform_portal_totp_credentials" && f.column === "encrypted_totp_secret");
  totp.ruleId = "R-ENUM-KEEP";
  totp.dataClass = "INTERNAL_CONTROL_DATA";
  const mismatches = verifyD1Card4FieldMatrixAgainstT2(tampered);
  assert.ok(mismatches.some((m) => m.includes("ruleId")));
  assert.ok(mismatches.some((m) => m.includes("dataClass")));
});

test("verifier flags a missing column and a missing table", () => {
  const t2 = loadT2();
  const tampered = JSON.parse(JSON.stringify(t2));
  tampered.fields = tampered.fields.filter(
    (f) => !(f.table === "platform_leads" && f.column === "message")
  );
  let mismatches = verifyD1Card4FieldMatrixAgainstT2(tampered);
  assert.ok(mismatches.some((m) => m.includes("missing column: platform_leads.message")));

  const noTable = JSON.parse(JSON.stringify(t2));
  noTable.fields = noTable.fields.filter((f) => f.table !== "platform_portal_passkey_credentials");
  mismatches = verifyD1Card4FieldMatrixAgainstT2(noTable);
  assert.ok(mismatches.filter((m) => m.includes("platform_portal_passkey_credentials")).length >= 12);
});

test("verifier handles a non-object input without throwing", () => {
  assert.deepEqual(verifyD1Card4FieldMatrixAgainstT2(null), ["t2 is not an object"]);
  assert.deepEqual(verifyD1Card4FieldMatrixAgainstT2("nope"), ["t2 is not an object"]);
  assert.ok(verifyD1Card4FieldMatrixAgainstT2({}).some((m) => m.includes("missing column")));
});

test("matrix data is frozen", () => {
  assert.ok(Object.isFrozen(D1_CARD4_FIELD_MATRIX));
  assert.ok(Object.isFrozen(D1_CARD4_FIELD_MATRIX_TABLES));
  assert.ok(Object.isFrozen(D1_CARD4_FIELD_MATRIX_COUNTS));
  assert.ok(Object.isFrozen(D1_CARD4_FIELD_MATRIX.platform_leads));
  assert.ok(Object.isFrozen(D1_CARD4_FIELD_MATRIX.platform_portal_passkey_credentials));
  assert.ok(Object.isFrozen(D1_CARD4_PASSKEY_CONDITIONS));
  assert.ok(Object.isFrozen(D1_CARD4_FIELD_MATRIX.platform_portal_passkey_credentials.id.conditions));
});
