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
  getD1Card4FieldDisposition,
  verifyD1Card4FieldMatrixAgainstT2
} from "../services/platform/d1-card4-field-matrix.mjs";

// The T2 JSON is a repo artifact (not production data). The matrix is a verbatim
// transcription of it, so the test loads the repo copy and verifies agreement.
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
// Matrix shape: 8 tables, 129 columns, counts as documented.
// ---------------------------------------------------------------------------

test("matrix covers exactly the 8 tables, 129 columns", () => {
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
  assert.equal(matrixColumnCount(), 129);
  assert.deepEqual(D1_CARD4_FIELD_MATRIX_COUNTS, {
    total: 129,
    KEEP: 67,
    CONDITIONAL: 29,
    EXTERNALIZE: 7,
    TRANSFORM: 3,
    DEFER: 23
  });
  assert.deepEqual(countDispositions(), {
    KEEP: 67,
    CONDITIONAL: 29,
    EXTERNALIZE: 7,
    TRANSFORM: 3,
    DEFER: 23
  });
});

test("the 8th table stays a candidate, not confirmed", () => {
  assert.equal(D1_CARD4_FIELD_MATRIX_CANDIDATE_TABLE, "platform_accounts");
  assert.ok(D1_CARD4_FIELD_MATRIX_TABLES.includes("platform_accounts"));
});

// ---------------------------------------------------------------------------
// Matrix agrees with the repo T2 JSON on every column.
// ---------------------------------------------------------------------------

test("matrix matches the repo T2 JSON on all 129 columns", () => {
  const t2 = loadT2();
  assert.equal(t2.counts.tables, 70);
  assert.equal(t2.counts.fields, 820);
  const mismatches = verifyD1Card4FieldMatrixAgainstT2(t2);
  assert.deepEqual(mismatches, []);
});

test("the 7 EXTERNALIZE and 23 DEFER columns are exactly the sensitive ones", () => {
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
});

// ---------------------------------------------------------------------------
// Sensitive-field dispositions, looked up through the helper.
// ---------------------------------------------------------------------------

test("sensitive fields resolve to their matrix dispositions", () => {
  assert.equal(getD1Card4FieldDisposition("platform_leads", "email").disposition, "EXTERNALIZE");
  assert.equal(getD1Card4FieldDisposition("platform_leads", "message").disposition, "EXTERNALIZE");
  assert.equal(getD1Card4FieldDisposition("platform_leads", "organization").disposition, "CONDITIONAL");
  assert.equal(getD1Card4FieldDisposition("platform_portal_access_requests", "subscription_url").disposition, "EXTERNALIZE");
  assert.equal(getD1Card4FieldDisposition("platform_portal_access_requests", "event_json").disposition, "TRANSFORM");
  assert.equal(getD1Card4FieldDisposition("platform_portal_totp_credentials", "encrypted_totp_secret").disposition, "EXTERNALIZE");
  assert.equal(getD1Card4FieldDisposition("platform_payment_receipts", "next_action_url").disposition, "EXTERNALIZE");
  assert.equal(getD1Card4FieldDisposition("platform_payment_receipts", "event_dedupe_key").disposition, "TRANSFORM");
  assert.equal(getD1Card4FieldDisposition("platform_payment_orders_legacy_archive_20260803", "checkout_url").disposition, "EXTERNALIZE");
  assert.equal(getD1Card4FieldDisposition("platform_payment_orders_legacy_archive_20260803", "checkout_qr_code").disposition, "EXTERNALIZE");
  assert.equal(getD1Card4FieldDisposition("platform_payment_orders_legacy_archive_20260803", "order_ref").disposition, "CONDITIONAL");
  assert.equal(getD1Card4FieldDisposition("platform_portal_password_credentials", "password_hash").disposition, "DEFER");
  assert.equal(getD1Card4FieldDisposition("platform_portal_passkey_credentials", "public_key_jwk_json").disposition, "DEFER");
  assert.equal(getD1Card4FieldDisposition("platform_accounts", "metadata_json").disposition, "TRANSFORM");
  assert.equal(getD1Card4FieldDisposition("platform_accounts", "id").disposition, "KEEP");
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
});
