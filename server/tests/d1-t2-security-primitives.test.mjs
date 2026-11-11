import assert from "node:assert/strict";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import test from "node:test";
import {
  assertDistinctD1KeyRingSet,
  assertDistinctKeyRings,
  createD1IdempotencyEnvelope,
  createD1IdempotencyLookupCandidates,
  createD1KeyRing,
  createD1LeaseTokenDigest,
  createD1PiiDigestEnvelope,
  createD1PiiLookupCandidates,
  createD1PiiLookupCandidatesFromDigest,
  createD1ProviderEventEnvelope,
  createD1TotpSecretProtector,
  destroyD1KeyRing,
  isValidD1LeaseTokenForField,
  parseD1HmacEnvelope,
  parseD1KeyRingSecret,
  reencryptLegacyD1TotpV2,
  verifyD1IdempotencyEnvelope,
  verifyD1PiiDigestEnvelope,
  verifyD1PiiDigestEnvelopeFromDigest,
  verifyD1ProviderEventEnvelope
} from "../services/platform/d1-t2-security-primitives.mjs";

const idemKeyId = "test-k-20261107";
const idemKey = Buffer.from("11".repeat(32), "hex");
const providerKeyId = "test-provider-20261107";
const providerKey = Buffer.from("22".repeat(32), "hex");
const piiKeyId = "test-pii-20261107";
const piiKey = Buffer.from("33".repeat(32), "hex");
const rawIdemKey = "idem.synthetic.0001";

const idemRing = createD1KeyRing({
  family: "idempotency-hmac",
  activeKeyId: idemKeyId,
  readKeyIds: [idemKeyId],
  keys: { [idemKeyId]: idemKey }
});
const providerRing = createD1KeyRing({
  family: "provider-event-hmac",
  activeKeyId: providerKeyId,
  readKeyIds: [providerKeyId],
  keys: { [providerKeyId]: providerKey }
});
const piiRing = createD1KeyRing({
  family: "pii-hmac",
  activeKeyId: piiKeyId,
  readKeyIds: [piiKeyId],
  keys: { [piiKeyId]: piiKey }
});

const idemVectors = [
  ["coin-wallet-operation-receipt/v1", "actor:synthetic-01", "credit_coins", "9949784d575e2c3b2ffb2964089bf5250dcbe320d1635bb11a0b9cfdea3c9a7a"],
  ["coin-commerce-operation-receipt/v1", "actor:synthetic-02", "create_quote", "c4ace414789c8ddb08dd7872bee2a5e3f724bb3a88cdd735cba6623cffbdfeb2"],
  ["deferred-transition-operation-receipt/v1", "actor:synthetic-03", "reserve_transition", "312cf0f436e157aa3c109a9dc3522b175d03f778dc7b3b643a8bdb9f1d438517"],
  ["payment-order-create/v1", "acct:synthetic-01", "create_payment_order", "151f169589b5b22eca063bab80fa3ee5b345993c83610af761c69df8454bced5"],
  ["wallet-first-deferred-checkout-reserve/v1", "actor:synthetic-04", "reserve_wallet_first_deferred_checkout_quote", "455e0d595b9fb2006af631313f63c32f8a5fc02fb3e1d3293ff8537c9b92f910"],
  ["portal-registration-welcome-grant/v1", "actor:synthetic-05", "grant_welcome_coins", "d1fa47da47c814b81b41be6c0a6c223d4320aee28a428b0e148f39d00e082ebc"]
];

function totpRing(family, activeKeyId, readKeyIds, keys) {
  return createD1KeyRing({ family, activeKeyId, readKeyIds, keys });
}

function encryptLegacyV2(secret, key, iv) {
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return "v2:aes-256-gcm:" + iv.toString("base64url") + ":"
    + tag.toString("base64url") + ":" + ciphertext.toString("base64url");
}

test("actual helper matches all six idempotency known-answer vectors", async () => {
  for (const [domain, actorScope, operationType, digest] of idemVectors) {
    const envelope = await createD1IdempotencyEnvelope({
      keyRing: idemRing, domain, actorScope, operationType, rawKey: rawIdemKey
    });
    assert.equal(envelope, "hmac-sha256:v1:" + idemKeyId + ":" + digest);
    assert.equal(await verifyD1IdempotencyEnvelope({
      envelope, keyRing: idemRing, domain, actorScope, operationType, rawKey: rawIdemKey
    }), true);
  }
});

test("length-prefix encoding prevents ambiguous field-boundary collisions", async () => {
  const left = await createD1IdempotencyEnvelope({
    keyRing: idemRing, domain: idemVectors[0][0], actorScope: "ab", operationType: "c", rawKey: "d"
  });
  const right = await createD1IdempotencyEnvelope({
    keyRing: idemRing, domain: idemVectors[0][0], actorScope: "a", operationType: "bc", rawKey: "d"
  });
  assert.notEqual(left, right);
});

test("provider-event HMAC uses a separate key family and known-answer vector", async () => {
  const merchantScopeDigest = "sha256:" + "33".repeat(32);
  const envelope = await createD1ProviderEventEnvelope({
    keyRing: providerRing, merchantScopeDigest, rawEventKey: "evt_synthetic_0001"
  });
  assert.equal(envelope, "hmac-sha256:v1:" + providerKeyId + ":6390a1662aa3347b567edaeca55093d05b925574cbc3492364ccda580b13be06");
  assert.equal(await verifyD1ProviderEventEnvelope({
    envelope, keyRing: providerRing, merchantScopeDigest, rawEventKey: "evt_synthetic_0001"
  }), true);
  assert.equal(await verifyD1ProviderEventEnvelope({
    envelope, keyRing: idemRing, merchantScopeDigest, rawEventKey: "evt_synthetic_0001"
  }), false);
});

test("idempotency rotation reads retained keys and writes only with the active key", async () => {
  const oldId = "test-idem-old";
  const activeId = "test-idem-new";
  const oldKey = Buffer.from("12".repeat(32), "hex");
  const activeKey = Buffer.from("34".repeat(32), "hex");
  const args = {
    domain: "payment-order-create/v1",
    actorScope: "acct:synthetic-rotate",
    operationType: "create_payment_order",
    rawKey: "idem.synthetic.rotation"
  };
  const oldRing = createD1KeyRing({
    family: "idempotency-hmac", activeKeyId: oldId, readKeyIds: [oldId], keys: { [oldId]: oldKey }
  });
  const oldEnvelope = await createD1IdempotencyEnvelope({ keyRing: oldRing, ...args });
  const rotated = createD1KeyRing({
    family: "idempotency-hmac", activeKeyId: activeId, readKeyIds: [activeId, oldId],
    keys: { [activeId]: activeKey, [oldId]: oldKey }
  });
  const candidates = await createD1IdempotencyLookupCandidates({ keyRing: rotated, ...args });
  assert.deepEqual(candidates.map((item) => item.keyId), [activeId, oldId]);
  assert.equal(candidates[1].envelope, oldEnvelope);
  assert.equal(await verifyD1IdempotencyEnvelope({ envelope: oldEnvelope, keyRing: rotated, ...args }), true);
});

test("PII pseudonym known-answer vectors preserve all three approved domains", async () => {
  const vectors = [
    ["account-email-lookup/v1", "synthetic-user@example.test", "f7f6823924555e936175da8ec0ce2d69abf3800ddbf5d4a0ad6e9f97d5629c44", "34abee6aeb0d49ebde0e23fe1ab31a32c867bea313e9ce5a5faa3f9bce6e58ba"],
    ["registration-source-ip/v1", "198.18.0.1", "3ebe27a5987fe4053782dff38d127dd59c717773fc9133fca22bee1a71caf1f3", "7e0168966e458f63199660e912284c064c8ea4c10a909afe638ff78147c2af7e"],
    ["registration-request-key/v1", "198.18.0.1:synthetic-agent/1.0", "8b2d15a03fdfb489033e370cf527ff23773d2f8f4bdf987a9810210eaca0e83f", "a09ccddeb8fead9dbfb234ca71733b773703f746ce897ec33e95d93c6b31e58e"]
  ];
  for (const [domain, rawValue, legacy, expected] of vectors) {
    assert.equal(createHash("sha256").update(rawValue.trim(), "utf8").digest("hex"), legacy);
    const envelope = await createD1PiiDigestEnvelope({ keyRing: piiRing, domain, legacyDigestHex: legacy });
    assert.equal(envelope, "hmac-sha256:v1:" + piiKeyId + ":" + expected);
    assert.equal(await verifyD1PiiDigestEnvelope({ envelope, keyRing: piiRing, domain, rawValue }), true);
    assert.equal(envelope.includes(rawValue), false);
    assert.equal(envelope.includes(legacy), false);
  }
});

test("PII digest-only lookup helpers preserve G6's precomputed-digest boundary", async () => {
  const rawValue = "synthetic-user@example.test";
  const legacyDigestHex = createHash("sha256")
    .update(rawValue.trim().toLowerCase(), "utf8")
    .digest("hex");
  const fromDigest = await createD1PiiLookupCandidatesFromDigest({
    keyRing: piiRing, domain: "account-email-lookup/v1", legacyDigestHex
  });
  const fromValue = await createD1PiiLookupCandidates({
    keyRing: piiRing, domain: "account-email-lookup/v1", rawValue
  });
  assert.deepEqual(fromDigest, fromValue);
  assert.equal(await verifyD1PiiDigestEnvelopeFromDigest({
    envelope: fromDigest[0].envelope,
    keyRing: piiRing,
    domain: "account-email-lookup/v1",
    legacyDigestHex
  }), true);
  assert.equal(await verifyD1PiiDigestEnvelopeFromDigest({
    envelope: fromDigest[0].envelope,
    keyRing: piiRing,
    domain: "account-email-lookup/v1",
    legacyDigestHex: rawValue
  }), false);
  await assert.rejects(
    () => createD1PiiLookupCandidatesFromDigest({
      keyRing: piiRing, domain: "account-email-lookup/v1", legacyDigestHex: rawValue
    }),
    { code: "legacy_digest_invalid" }
  );
  assert.equal(fromDigest[0].envelope.includes(rawValue), false);
  assert.equal(fromDigest[0].envelope.includes(legacyDigestHex), false);
});


test("email lookup preserves trim-and-lowercase normalization", async () => {
  const canonical = await createD1PiiLookupCandidates({
    keyRing: piiRing, domain: "account-email-lookup/v1", rawValue: "synthetic-user@example.test"
  });
  const nonCanonical = await createD1PiiLookupCandidates({
    keyRing: piiRing, domain: "account-email-lookup/v1", rawValue: "  Synthetic-User@Example.Test  "
  });
  assert.equal(canonical[0].envelope, nonCanonical[0].envelope);
});

test("PII key rotation retains old lookup and rejects legacy SHA-256 fallback", async () => {
  const rawValue = "synthetic-user@example.test";
  const legacy = createHash("sha256").update(rawValue, "utf8").digest("hex");
  const oldId = "test-pii-old";
  const activeId = "test-pii-new";
  const oldKey = Buffer.from("33".repeat(32), "hex");
  const activeKey = Buffer.from("44".repeat(32), "hex");
  const oldRing = createD1KeyRing({
    family: "pii-hmac", activeKeyId: oldId, readKeyIds: [oldId], keys: { [oldId]: oldKey }
  });
  const oldEnvelope = await createD1PiiDigestEnvelope({
    keyRing: oldRing, domain: "account-email-lookup/v1", legacyDigestHex: legacy
  });
  const rotated = createD1KeyRing({
    family: "pii-hmac", activeKeyId: activeId, readKeyIds: [activeId, oldId],
    keys: { [activeId]: activeKey, [oldId]: oldKey }
  });
  const candidates = await createD1PiiLookupCandidates({
    keyRing: rotated, domain: "account-email-lookup/v1", rawValue
  });
  assert.deepEqual(candidates.map((item) => item.keyId), [activeId, oldId]);
  assert.equal(candidates[1].envelope, oldEnvelope);
  assert.equal(await verifyD1PiiDigestEnvelope({
    envelope: oldEnvelope, keyRing: rotated, domain: "account-email-lookup/v1", rawValue
  }), true);
  assert.equal(await verifyD1PiiDigestEnvelope({
    envelope: legacy, keyRing: rotated, domain: "account-email-lookup/v1", rawValue
  }), false);
});

test("lease digest matches both observed issuer formats and rejects mixed grammars", async () => {
  const hex = "ab".repeat(32);
  const uuid = "deferred_reservation_lease_550e8400-e29b-41d4-a716-446655440000";
  assert.equal(await createD1LeaseTokenDigest(hex), "5d34ae333a5855c0bfca92b54777b8a2f95fec4396368b4f5bb4aac134ba3953");
  assert.equal(await createD1LeaseTokenDigest(uuid), "fa8c68df9a4b3853bc38ef0f478841d868c4211fc06cc82b1906dc306cebeb77");
  assert.equal(isValidD1LeaseTokenForField("platform_coin_commerce_fulfillment_commands.lease_token", hex), true);
  assert.equal(isValidD1LeaseTokenForField("platform_deferred_resource_transition_reservations.lease_token", uuid), true);
  assert.equal(isValidD1LeaseTokenForField("platform_deferred_resource_transition_reservations.lease_token", hex), false);
  assert.equal(isValidD1LeaseTokenForField("platform_coin_commerce_fulfillment_commands.lease_token", uuid), false);
});

test("key ring parsing is strict and does not expose key bytes", () => {
  const ring = parseD1KeyRingSecret(JSON.stringify({
    activeKeyId: "secret-v1",
    readKeyIds: ["secret-v1"],
    keys: { "secret-v1": Buffer.from("66".repeat(32), "hex").toString("base64url") }
  }), { family: "pii-hmac" });
  assert.equal(ring.family, "pii-hmac");
  assert.deepEqual(Object.keys(ring).sort(), ["activeKeyId", "family", "readKeyIds"]);
  assert.equal(JSON.stringify(ring).includes("666666"), false);
  assert.throws(() => createD1KeyRing({
    family: "pii-hmac", activeKeyId: "k1", readKeyIds: ["k1"], keys: { k1: Buffer.alloc(31) }
  }), { code: "key_material_invalid" });
});

test("unapproved domains and cross-family key rings fail closed", async () => {
  await assert.rejects(() => createD1IdempotencyEnvelope({
    keyRing: idemRing, domain: "request-controlled-domain", actorScope: "a", operationType: "b", rawKey: "c"
  }), { code: "idempotency_domain_invalid" });
  await assert.rejects(() => createD1PiiDigestEnvelope({
    keyRing: idemRing, domain: "account-email-lookup/v1", legacyDigestHex: "ab".repeat(32)
  }), { code: "key_family_mismatch" });
  assert.equal(parseD1HmacEnvelope(rawIdemKey), null);
});

test("configured D1 key-ring sets reject duplicate families and pairwise key reuse", () => {
  const idempotency = createD1KeyRing({
    family: "idempotency-hmac", activeKeyId: "set-idem", readKeyIds: ["set-idem"],
    keys: { "set-idem": Buffer.from("10".repeat(32), "hex") }
  });
  const provider = createD1KeyRing({
    family: "provider-event-hmac", activeKeyId: "set-provider", readKeyIds: ["set-provider"],
    keys: { "set-provider": Buffer.from("20".repeat(32), "hex") }
  });
  const pii = createD1KeyRing({
    family: "pii-hmac", activeKeyId: "set-pii", readKeyIds: ["set-pii"],
    keys: { "set-pii": Buffer.from("30".repeat(32), "hex") }
  });
  assert.equal(assertDistinctD1KeyRingSet([idempotency, provider, pii]), true);

  const reusedBytes = createD1KeyRing({
    family: "pii-hmac", activeKeyId: "set-pii-reused", readKeyIds: ["set-pii-reused"],
    keys: { "set-pii-reused": Buffer.from("10".repeat(32), "hex") }
  });
  assert.throws(() => assertDistinctD1KeyRingSet([idempotency, reusedBytes]), {
    code: "key_family_reuse_detected"
  });

  const duplicateFamily = createD1KeyRing({
    family: "idempotency-hmac", activeKeyId: "set-idem-duplicate", readKeyIds: ["set-idem-duplicate"],
    keys: { "set-idem-duplicate": Buffer.from("40".repeat(32), "hex") }
  });
  assert.throws(() => assertDistinctD1KeyRingSet([idempotency, duplicateFamily]), {
    code: "key_ring_set_family_duplicate"
  });
});

test("Portal and Admin TOTP key families reject identical key bytes", () => {
  const shared = Buffer.from("77".repeat(32), "hex");
  const portal = totpRing("portal-totp-aes", "portal-v1", ["portal-v1"], { "portal-v1": shared });
  const admin = totpRing("admin-totp-aes", "admin-v1", ["admin-v1"], { "admin-v1": shared });
  assert.throws(() => assertDistinctKeyRings(portal, admin), { code: "key_family_reuse_detected" });
});

test("TOTP v3 envelope binds key ID, credential scope and opaque credential reference", async () => {
  const portalKey = Buffer.from("99".repeat(32), "hex");
  const portalRing = totpRing("portal-totp-aes", "portal-v1", ["portal-v1"], { "portal-v1": portalKey });
  const protector = createD1TotpSecretProtector({
    keyRing: portalRing, scope: "portal",
    ivFactory: () => Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  });
  const secret = "JBSWY3DPEHPK3PXP";
  const envelope = await protector.protect(secret, { credentialRef: "totp_credential_001" });
  assert.match(envelope, /^v3:aes-256-gcm:portal-v1:/u);
  assert.equal(await protector.unprotect(envelope, { credentialRef: "totp_credential_001" }), secret);
  assert.equal(await protector.unprotect(envelope, { credentialRef: "totp_credential_002" }), null);
  const adminRing = totpRing("admin-totp-aes", "admin-v1", ["admin-v1"], {
    "admin-v1": Buffer.from("aa".repeat(32), "hex")
  });
  const adminProtector = createD1TotpSecretProtector({ keyRing: adminRing, scope: "admin" });
  assert.equal(await adminProtector.unprotect(envelope, { credentialRef: "totp_credential_001" }), null);
});

test("TOTP Base32 validation rejects impossible encodings and oversized inputs", async () => {
  const ring = totpRing("portal-totp-aes", "portal-bounds", ["portal-bounds"], {
    "portal-bounds": Buffer.from("91".repeat(32), "hex")
  });
  const protector = createD1TotpSecretProtector({ keyRing: ring, scope: "portal" });
  for (const invalid of [
    "A", "AAA", "AB", "AAAB", "MZ======", "MZXW7===",
    "JBSWY3DPEHPK3PXP=",
    "JBSWY3DPEHPK3PXAAA=",
    "A".repeat(4097)
  ]) {
    await assert.rejects(
      () => protector.protect(invalid, { credentialRef: "totp_credential_bounds" }),
      { code: "totp_secret_invalid" }
    );
  }
  const valid = await protector.protect("JBSWY3DPEHPK3PXP", {
    credentialRef: "totp_credential_bounds"
  });
  assert.match(valid, /^v3:aes-256-gcm:portal-bounds:/u);
  const validPadded = await protector.protect("MY======", {
    credentialRef: "totp_credential_bounds"
  });
  assert.match(validPadded, /^v3:aes-256-gcm:portal-bounds:/u);

  const validWhitespace = await protector.protect("M Y======", {
    credentialRef: "totp_credential_bounds"
  });
  assert.match(validWhitespace, /^v3:aes-256-gcm:portal-bounds:/u);
  const validHyphen = await protector.protect("M-Y======", {
    credentialRef: "totp_credential_bounds"
  });
  assert.match(validHyphen, /^v3:aes-256-gcm:portal-bounds:/u);
  assert.equal(await protector.unprotect("x".repeat(8193), {
    credentialRef: "totp_credential_bounds"
  }), null);

  const oversizedLegacy = await reencryptLegacyD1TotpV2({
    value: "v2:aes-256-gcm:" + "A".repeat(8193),
    legacyKey: Buffer.alloc(32),
    keyRing: ring,
    scope: "portal",
    credentialRef: "totp_credential_bounds"
  });
  assert.deepEqual(oversizedLegacy, { status: "quarantine" });
});

test("TOTP rotation decrypts retained old key and writes only with the active key", async () => {
  const oldKey = Buffer.from("ab".repeat(32), "hex");
  const newKey = Buffer.from("bc".repeat(32), "hex");
  const oldRing = totpRing("portal-totp-aes", "portal-old", ["portal-old"], { "portal-old": oldKey });
  const oldProtector = createD1TotpSecretProtector({
    keyRing: oldRing, scope: "portal",
    ivFactory: () => Uint8Array.from([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1])
  });
  const oldEnvelope = await oldProtector.protect("JBSWY3DPEHPK3PXP", { credentialRef: "totp_credential_002" });
  const rotatedRing = totpRing("portal-totp-aes", "portal-new", ["portal-new", "portal-old"], {
    "portal-new": newKey, "portal-old": oldKey
  });
  const rotatedProtector = createD1TotpSecretProtector({
    keyRing: rotatedRing, scope: "portal",
    ivFactory: () => Uint8Array.from([2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2])
  });
  assert.equal(await rotatedProtector.unprotect(oldEnvelope, { credentialRef: "totp_credential_002" }), "JBSWY3DPEHPK3PXP");
  const newEnvelope = await rotatedProtector.reencrypt(oldEnvelope, { credentialRef: "totp_credential_002" });
  assert.match(newEnvelope, /^v3:aes-256-gcm:portal-new:/u);
});

test("TOTP tampering, unknown keys, malformed envelopes and legacy raw Base32 fail closed", async () => {
  const ring = totpRing("portal-totp-aes", "portal-v3", ["portal-v3"], {
    "portal-v3": Buffer.from("cd".repeat(32), "hex")
  });
  const protector = createD1TotpSecretProtector({ keyRing: ring, scope: "portal" });
  const envelope = await protector.protect("JBSWY3DPEHPK3PXP", { credentialRef: "totp_credential_003" });
  const parts = envelope.split(":");
  parts[4] = parts[4].slice(0, -1) + (parts[4].endsWith("A") ? "B" : "A");
  assert.equal(await protector.unprotect(parts.join(":"), { credentialRef: "totp_credential_003" }), null);
  assert.equal(await protector.unprotect(envelope.replace(":portal-v3:", ":unknown-key:"), { credentialRef: "totp_credential_003" }), null);
  const legacy = await reencryptLegacyD1TotpV2({
    value: "enc:JBSWY3DPEHPK3PXP", legacyKey: Buffer.alloc(32),
    keyRing: ring, scope: "portal", credentialRef: "totp_credential_003"
  });
  assert.deepEqual(legacy, { status: "re_enroll_required" });
});

test("legacy keyless v2 TOTP can be re-encrypted without returning plaintext", async () => {
  const legacyKey = Buffer.from("de".repeat(32), "hex");
  const legacyEnvelope = encryptLegacyV2("JBSWY3DPEHPK3PXP", legacyKey, randomBytes(12));
  const newRing = totpRing("portal-totp-aes", "portal-v3", ["portal-v3"], {
    "portal-v3": Buffer.from("ef".repeat(32), "hex")
  });
  const migrated = await reencryptLegacyD1TotpV2({
    value: legacyEnvelope, legacyKey, keyRing: newRing, scope: "portal",
    credentialRef: "totp_credential_005",
    ivFactory: () => Uint8Array.from([3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3])
  });
  assert.equal(migrated.status, "reencrypted");
  assert.match(migrated.envelope, /^v3:aes-256-gcm:portal-v3:/u);
  assert.equal(Object.hasOwn(migrated, "plaintext"), false);
  const protector = createD1TotpSecretProtector({ keyRing: newRing, scope: "portal" });
  assert.equal(await protector.unprotect(migrated.envelope, { credentialRef: "totp_credential_005" }), "JBSWY3DPEHPK3PXP");
});

test("destroying a key ring zeroizes and disables its key material", async () => {
  const ring = createD1KeyRing({
    family: "pii-hmac", activeKeyId: "destroy-me", readKeyIds: ["destroy-me"],
    keys: { "destroy-me": Buffer.from("aa".repeat(32), "hex") }
  });
  assert.equal(destroyD1KeyRing(ring), true);
  assert.equal(destroyD1KeyRing(ring), false);
  assert.equal(await verifyD1PiiDigestEnvelope({
    envelope: "hmac-sha256:v1:destroy-me:" + "00".repeat(32),
    keyRing: ring, domain: "account-email-lookup/v1", rawValue: "synthetic-user@example.test"
  }), false);
});
