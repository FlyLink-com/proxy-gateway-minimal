import assert from "node:assert/strict";
import test from "node:test";

import {
  createD1IdempotencyEnvelope,
  createD1KeyRing,
  createD1TotpSecretProtector,
  destroyD1KeyRing
} from "../services/platform/d1-t2-security-primitives.mjs";
import {
  D1_CARD4_ARCHIVE_BLOCKED_COLUMNS,
  D1_CARD4_ARCHIVE_TABLE,
  D1_CARD4_DESIGN_ONLY_KEY_FAMILIES,
  D1_CARD4_KEY_FAMILY_CATALOG,
  D1_CARD4_TOTP_EXTERNALIZE,
  assertD1ArchiveWriteAllowed,
  assertD1Card4WriteAllowed,
  assertD1Card4KeyFamilyProductionApproved,
  assertD1LeadListRowHasNoRawEmail,
  assertD1WriteHasNoTotpSecret,
  assertNoD1DesignFamilyKeyMaterialConfigured,
  completeD1KeyFamilyRotation,
  createD1KeyFamilyLifecycle,
  isD1ArchiveBlockedColumn,
  isD1Card4DesignOnlyKeyFamily,
  isD1Card4KeyFamily,
  listD1Card4KeyFamilies,
  maskD1LeadEmail,
  planD1KeyFamilyRotation,
  projectD1LeadListRow,
  resolveD1TotpExternalization,
  retireD1KeyFamily,
  retireD1KeyFamilyKey,
  validateD1Card4StartupKeyConfig
} from "../services/platform/d1-card4-key-families.mjs";

// All key material below is synthetic (fixed test patterns, never real keys).
const SYNTH_A = Buffer.alloc(32, 0x41);
const SYNTH_B = Buffer.alloc(32, 0x42);
const SYNTH_C = Buffer.alloc(32, 0x43);

function syntheticRing(family, keyId = "synth-k-0001") {
  return createD1KeyRing({
    family,
    activeKeyId: keyId,
    readKeyIds: [keyId],
    keys: { [keyId]: SYNTH_A }
  });
}

function syntheticRingSecretJson(family, keyId = "synth-k-0001") {
  return JSON.stringify({
    activeKeyId: keyId,
    readKeyIds: [keyId],
    keys: { [keyId]: SYNTH_B.toString("base64url") }
  });
}

// ---------------------------------------------------------------------------
// Q-7 catalog: 5 approved + 3 design-only, 8 total.
// ---------------------------------------------------------------------------

test("Q-7 catalog holds 5 approved families plus 3 design-only families", () => {
  assert.equal(D1_CARD4_KEY_FAMILY_CATALOG.length, 8);
  assert.deepEqual(D1_CARD4_DESIGN_ONLY_KEY_FAMILIES, [
    "lead-contact-aes",
    "subscription-capability-aes",
    "payment-action-aes"
  ]);
  const approved = D1_CARD4_KEY_FAMILY_CATALOG.filter((entry) => entry.productionApproved);
  assert.deepEqual(approved.map((entry) => entry.family), [
    "idempotency-hmac",
    "provider-event-hmac",
    "pii-hmac",
    "portal-totp-aes",
    "admin-totp-aes"
  ]);
  for (const family of D1_CARD4_DESIGN_ONLY_KEY_FAMILIES) {
    assert.equal(isD1Card4KeyFamily(family), true);
    assert.equal(isD1Card4DesignOnlyKeyFamily(family), true);
    assert.throws(
      () => assertD1Card4KeyFamilyProductionApproved(family),
      (error) => error.code === "key_family_design_only"
    );
  }
  assert.equal(isD1Card4KeyFamily("no-such-family"), false);
  assert.throws(
    () => assertD1Card4KeyFamilyProductionApproved("no-such-family"),
    (error) => error.code === "key_family_invalid"
  );
  const listed = listD1Card4KeyFamilies();
  assert.equal(listed.length, 8);
  listed[0].family = "mutated";
  assert.equal(D1_CARD4_KEY_FAMILY_CATALOG[0].family, "idempotency-hmac");
});

test("design-only families are whitelisted for rings but rejected by every real crypto path", async () => {
  for (const family of D1_CARD4_DESIGN_ONLY_KEY_FAMILIES) {
    const ring = syntheticRing(family);
    try {
      // Whitelist acceptance (ring creation with synthetic material only).
      assert.equal(ring.family, family);
      // No HMAC path accepts a design-only ring.
      await assert.rejects(
        createD1IdempotencyEnvelope({
          keyRing: ring,
          domain: "payment-order-create/v1",
          actorScope: "actor:synthetic-01",
          operationType: "create_payment_order",
          rawKey: "synthetic-raw-key"
        }),
        (error) => error.code === "key_family_mismatch"
      );
      // No TOTP path accepts a design-only ring (scope mapping has no entry).
      assert.throws(
        () => createD1TotpSecretProtector({ keyRing: ring, scope: "portal" }),
        (error) => error.code === "key_family_mismatch"
      );
    } finally {
      destroyD1KeyRing(ring);
    }
  }
  // The existing families are untouched: a synthetic idempotency ring still works.
  const idemRing = syntheticRing("idempotency-hmac");
  try {
    const envelope = await createD1IdempotencyEnvelope({
      keyRing: idemRing,
      domain: "payment-order-create/v1",
      actorScope: "actor:synthetic-01",
      operationType: "create_payment_order",
      rawKey: "synthetic-raw-key"
    });
    assert.match(envelope, /^hmac-sha256:v1:synth-k-0001:[a-f0-9]{64}$/u);
  } finally {
    destroyD1KeyRing(idemRing);
  }
});

// ---------------------------------------------------------------------------
// Rotation / retirement lifecycle (descriptors only, no key material).
// ---------------------------------------------------------------------------

test("rotation moves active-write to the new key and retains the old key for reads", () => {
  const start = createD1KeyFamilyLifecycle({
    family: "lead-contact-aes",
    activeKeyId: "synth-k-0001",
    readKeyIds: ["synth-k-0001"]
  });
  assert.equal(start.lifecycle, "active");
  const rotating = planD1KeyFamilyRotation(start, { nextKeyId: "synth-k-0002" });
  assert.equal(rotating.lifecycle, "rotating");
  assert.equal(rotating.activeKeyId, "synth-k-0002");
  assert.deepEqual(rotating.readKeyIds, ["synth-k-0002", "synth-k-0001"]);
  assert.equal(rotating.previousActiveKeyId, "synth-k-0001");
  const done = completeD1KeyFamilyRotation(rotating);
  assert.equal(done.lifecycle, "active");
  assert.equal(done.activeKeyId, "synth-k-0002");
  assert.deepEqual(done.readKeyIds, ["synth-k-0002", "synth-k-0001"]);
  assert.equal(done.previousActiveKeyId, null);
});

test("rotation rejects a second rotation while rotating and rejects reused key ids", () => {
  const start = createD1KeyFamilyLifecycle({
    family: "subscription-capability-aes",
    activeKeyId: "synth-k-0001",
    readKeyIds: ["synth-k-0001"]
  });
  const rotating = planD1KeyFamilyRotation(start, { nextKeyId: "synth-k-0002" });
  assert.throws(
    () => planD1KeyFamilyRotation(rotating, { nextKeyId: "synth-k-0003" }),
    (error) => error.code === "key_rotation_invalid"
  );
  assert.throws(
    () => planD1KeyFamilyRotation(start, { nextKeyId: "synth-k-0001" }),
    (error) => error.code === "key_rotation_invalid"
  );
  assert.throws(
    () => completeD1KeyFamilyRotation(start),
    (error) => error.code === "key_rotation_invalid"
  );
  assert.throws(
    () => createD1KeyFamilyLifecycle({
      family: "no-such-family",
      activeKeyId: "synth-k-0001",
      readKeyIds: ["synth-k-0001"]
    }),
    (error) => error.code === "key_family_invalid"
  );
});

test("retiring a retained key needs reconciliation proof and owner approval; the active key can never retire", () => {
  const active = completeD1KeyFamilyRotation(planD1KeyFamilyRotation(
    createD1KeyFamilyLifecycle({
      family: "payment-action-aes",
      activeKeyId: "synth-k-0001",
      readKeyIds: ["synth-k-0001"]
    }),
    { nextKeyId: "synth-k-0002" }
  ));
  assert.throws(
    () => retireD1KeyFamilyKey(active, { keyId: "synth-k-0001" }),
    (error) => error.code === "key_retirement_evidence_missing"
  );
  assert.throws(
    () => retireD1KeyFamilyKey(active, {
      keyId: "synth-k-0001",
      reconciliationProofRef: "synthetic-proof-001",
      ownerApprovalRef: ""
    }),
    (error) => error.code === "key_retirement_evidence_missing"
  );
  assert.throws(
    () => retireD1KeyFamilyKey(active, {
      keyId: "synth-k-0002",
      reconciliationProofRef: "synthetic-proof-001",
      ownerApprovalRef: "synthetic-approval-001"
    }),
    (error) => error.code === "key_retirement_invalid"
  );
  const retired = retireD1KeyFamilyKey(active, {
    keyId: "synth-k-0001",
    reconciliationProofRef: "synthetic-proof-001",
    ownerApprovalRef: "synthetic-approval-001"
  });
  assert.deepEqual(retired.readKeyIds, ["synth-k-0002"]);
  assert.deepEqual(retired.retiredKeyIds, ["synth-k-0001"]);
  assert.throws(
    () => retireD1KeyFamilyKey(retired, {
      keyId: "synth-k-0001",
      reconciliationProofRef: "synthetic-proof-001",
      ownerApprovalRef: "synthetic-approval-001"
    }),
    (error) => error.code === "key_retirement_invalid"
  );
});

test("whole-family retirement is terminal and needs owner approval", () => {
  const start = createD1KeyFamilyLifecycle({
    family: "pii-hmac",
    activeKeyId: "synth-k-0001",
    readKeyIds: ["synth-k-0001"]
  });
  assert.throws(
    () => retireD1KeyFamily(start, {}),
    (error) => error.code === "key_retirement_evidence_missing"
  );
  const retired = retireD1KeyFamily(start, { ownerApprovalRef: "synthetic-approval-001" });
  assert.equal(retired.lifecycle, "retired");
  assert.throws(
    () => planD1KeyFamilyRotation(retired, { nextKeyId: "synth-k-0002" }),
    (error) => error.code === "key_family_retired"
  );
  assert.throws(
    () => retireD1KeyFamily(retired, { ownerApprovalRef: "synthetic-approval-001" }),
    (error) => error.code === "key_family_retired"
  );
});

// ---------------------------------------------------------------------------
// Startup fail-closed check.
// ---------------------------------------------------------------------------

test("startup refuses to start when a required key ring is missing or malformed", () => {
  const required = { "portal-totp-aes": "PORTAL_TOTP_AES_KEYRING_JSON" };
  assert.throws(
    () => validateD1Card4StartupKeyConfig({ env: {}, requiredFamilies: required }),
    (error) => error.code === "d1_startup_key_config_invalid"
  );
  assert.throws(
    () => validateD1Card4StartupKeyConfig({
      env: { PORTAL_TOTP_AES_KEYRING_JSON: "not-json" },
      requiredFamilies: required
    }),
    (error) => error.code === "d1_startup_key_config_invalid"
  );
  assert.throws(
    () => validateD1Card4StartupKeyConfig({
      env: { PORTAL_TOTP_AES_KEYRING_JSON: JSON.stringify({ activeKeyId: "x" }) },
      requiredFamilies: required
    }),
    (error) => error.code === "d1_startup_key_config_invalid"
  );
  assert.throws(
    () => validateD1Card4StartupKeyConfig({ env: {}, requiredFamilies: {} }),
    (error) => error.code === "d1_startup_key_config_invalid"
  );
});

test("startup rejects design-only families as required and rejects their configured key material", () => {
  assert.throws(
    () => validateD1Card4StartupKeyConfig({
      env: { LEAD_CONTACT_AES_KEYRING_JSON: syntheticRingSecretJson("lead-contact-aes") },
      requiredFamilies: { "lead-contact-aes": "LEAD_CONTACT_AES_KEYRING_JSON" }
    }),
    (error) => error.code === "key_family_design_only_configured"
  );
  assert.throws(
    () => assertNoD1DesignFamilyKeyMaterialConfigured({
      PAYMENT_ACTION_AES_KEYRING_JSON: syntheticRingSecretJson("payment-action-aes")
    }),
    (error) => error.code === "key_family_design_only_configured"
  );
  assert.equal(assertNoD1DesignFamilyKeyMaterialConfigured({}), true);
});

test("startup accepts a valid synthetic required ring and returns key ids only, never key material", () => {
  const summary = validateD1Card4StartupKeyConfig({
    env: {
      PORTAL_TOTP_AES_KEYRING_JSON: syntheticRingSecretJson("portal-totp-aes"),
      ADMIN_TOTP_AES_KEYRING_JSON: syntheticRingSecretJson("admin-totp-aes")
    },
    requiredFamilies: {
      "portal-totp-aes": "PORTAL_TOTP_AES_KEYRING_JSON",
      "admin-totp-aes": "ADMIN_TOTP_AES_KEYRING_JSON"
    }
  });
  assert.deepEqual(summary, {
    families: [
      {
        family: "portal-totp-aes",
        envName: "PORTAL_TOTP_AES_KEYRING_JSON",
        activeKeyId: "synth-k-0001",
        readKeyIds: ["synth-k-0001"]
      },
      {
        family: "admin-totp-aes",
        envName: "ADMIN_TOTP_AES_KEYRING_JSON",
        activeKeyId: "synth-k-0001",
        readKeyIds: ["synth-k-0001"]
      }
    ]
  });
  const serialized = JSON.stringify(summary);
  assert.equal(serialized.includes(SYNTH_B.toString("base64url")), false);
  assert.equal(serialized.includes(SYNTH_B.toString("hex")), false);
});

// ---------------------------------------------------------------------------
// Q-2 masking: raw email never leaves the list row.
// ---------------------------------------------------------------------------

test("Q-2 lead email is masked on the spot; the list row carries no raw email", () => {
  assert.equal(maskD1LeadEmail("alice@example.com"), "a***@example.com");
  assert.equal(maskD1LeadEmail("x@example.com"), "*@example.com");
  assert.equal(maskD1LeadEmail("  bob@sub.example.org "), "b***@sub.example.org");
  assert.throws(() => maskD1LeadEmail("not-an-email"), (error) => error.code === "lead_email_invalid");
  assert.throws(() => maskD1LeadEmail("a@@example.com"), (error) => error.code === "lead_email_invalid");
  assert.throws(() => maskD1LeadEmail(""), (error) => error.code === "lead_email_invalid");

  const rawEmail = "carol@example.com";
  const row = projectD1LeadListRow({ leadRef: "lead-synthetic-01", email: rawEmail });
  assert.deepEqual(row, { leadRef: "lead-synthetic-01", maskedEmail: "c***@example.com" });
  assert.equal(JSON.stringify(row).includes(rawEmail), false);
  assert.equal(assertD1LeadListRowHasNoRawEmail(row, rawEmail), true);
  assert.throws(
    () => assertD1LeadListRowHasNoRawEmail(
      { leadRef: "lead-synthetic-01", email: rawEmail },
      rawEmail
    ),
    (error) => error.code === "lead_raw_email_leak"
  );
  assert.throws(
    () => projectD1LeadListRow({ leadRef: "lead-synthetic-01", email: "bad" }),
    (error) => error.code === "lead_email_invalid"
  );
  // The synthetic key bytes used elsewhere in this file must not leak either.
  assert.equal(JSON.stringify(row).includes(SYNTH_C.toString("hex")), false);
});

// ---------------------------------------------------------------------------
// Q-4 EXTERNALIZE: TOTP secret never enters D1; custody stays with the
// Crypto Worker v3 envelope. No function here reads or migrates a real key.
// ---------------------------------------------------------------------------

test("Q-4 TOTP externalization resolves only the exact E-04 field to Crypto Worker v3", () => {
  assert.deepEqual(resolveD1TotpExternalization({
    table: "platform_portal_totp_credentials",
    column: "encrypted_totp_secret"
  }), D1_CARD4_TOTP_EXTERNALIZE);
  assert.equal(D1_CARD4_TOTP_EXTERNALIZE.disposition, "externalize");
  assert.equal(D1_CARD4_TOTP_EXTERNALIZE.handler, "crypto-worker-v3");
  assert.deepEqual(D1_CARD4_TOTP_EXTERNALIZE.operations, [
    "totp.protect",
    "totp.unprotect",
    "totp.reencrypt"
  ]);
  assert.throws(
    () => resolveD1TotpExternalization({ table: "platform_accounts", column: "metadata_json" }),
    (error) => error.code === "totp_externalize_unknown_field"
  );
  assert.throws(
    () => resolveD1TotpExternalization({
      table: "platform_portal_totp_credentials",
      column: "totp_secret"
    }),
    (error) => error.code === "totp_externalize_unknown_field"
  );
});

test("Q-4 D1 write guard rejects any payload carrying encrypted_totp_secret", () => {
  assert.equal(assertD1WriteHasNoTotpSecret({ credential_ref: "cred-synthetic-01" }), true);
  assert.throws(
    () => assertD1WriteHasNoTotpSecret({
      credential_ref: "cred-synthetic-01",
      encrypted_totp_secret: "v3:aes-256-gcm:synthetic"
    }),
    (error) => error.code === "totp_secret_must_not_enter_d1"
  );
  // Even an empty value is rejected: the column must not be part of a D1 write.
  assert.throws(
    () => assertD1WriteHasNoTotpSecret({ encrypted_totp_secret: null }),
    (error) => error.code === "totp_secret_must_not_enter_d1"
  );
});

// ---------------------------------------------------------------------------
// Q-6 HOLD: archive checkout URL / QR code never enter D1.
// ---------------------------------------------------------------------------

test("Q-6 archive guard rejects checkout_url and checkout_qr_code for the archive table", () => {
  assert.deepEqual(D1_CARD4_ARCHIVE_BLOCKED_COLUMNS, ["checkout_url", "checkout_qr_code"]);
  assert.equal(D1_CARD4_ARCHIVE_TABLE, "platform_payment_orders_legacy_archive_20260803");
  assert.equal(isD1ArchiveBlockedColumn(D1_CARD4_ARCHIVE_TABLE, "checkout_url"), true);
  assert.equal(isD1ArchiveBlockedColumn(D1_CARD4_ARCHIVE_TABLE, "checkout_qr_code"), true);
  assert.equal(isD1ArchiveBlockedColumn(D1_CARD4_ARCHIVE_TABLE, "order_ref"), false);
  assert.equal(isD1ArchiveBlockedColumn("platform_payment_orders", "checkout_url"), false);

  assert.equal(assertD1ArchiveWriteAllowed({
    table: D1_CARD4_ARCHIVE_TABLE,
    payload: { order_ref: "order-synthetic-01", amount_units: 10 }
  }), true);
  for (const column of D1_CARD4_ARCHIVE_BLOCKED_COLUMNS) {
    assert.throws(
      () => assertD1ArchiveWriteAllowed({
        table: D1_CARD4_ARCHIVE_TABLE,
        payload: { order_ref: "order-synthetic-01", [column]: "https://example.invalid/synthetic" }
      }),
      (error) => error.code === "d1_archive_capability_column_rejected"
    );
    // Null value is still rejected: the column must not be in the write.
    assert.throws(
      () => assertD1ArchiveWriteAllowed({
        table: D1_CARD4_ARCHIVE_TABLE,
        payload: { [column]: null }
      }),
      (error) => error.code === "d1_archive_capability_column_rejected"
    );
  }
});

test("combined #4 write guard enforces Q-4 and Q-6 together", () => {
  assert.equal(assertD1Card4WriteAllowed({
    table: D1_CARD4_ARCHIVE_TABLE,
    payload: { order_ref: "order-synthetic-01" }
  }), true);
  assert.throws(
    () => assertD1Card4WriteAllowed({
      table: "platform_portal_totp_credentials",
      payload: { encrypted_totp_secret: "synthetic" }
    }),
    (error) => error.code === "totp_secret_must_not_enter_d1"
  );
  assert.throws(
    () => assertD1Card4WriteAllowed({
      table: D1_CARD4_ARCHIVE_TABLE,
      payload: { checkout_qr_code: "synthetic-qr" }
    }),
    (error) => error.code === "d1_archive_capability_column_rejected"
  );
});
