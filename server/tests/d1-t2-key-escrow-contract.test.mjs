import assert from "node:assert/strict";
import test from "node:test";

import {
  assertDistinctKeyFamilies,
  projectKeyEscrowInventory,
  restoreKeyFromEscrow,
  wrapKeyForEscrow
} from "../services/platform/d1-t2-key-escrow-contract.mjs";

const WRAPPING_KEY = Buffer.alloc(32, 0x71);
const KEY_MATERIAL = Buffer.alloc(32, 0x23);
const WRAPPED_AT = "2026-11-08T12:00:00.000Z";

function makeEnvelope(overrides = {}) {
  return wrapKeyForEscrow({
    keyId: "pii-hmac-key-v1",
    family: "pii-hmac",
    algorithm: "hmac-sha256",
    keyMaterial: KEY_MATERIAL,
    wrappingKey: WRAPPING_KEY,
    wrappedAt: WRAPPED_AT,
    nonce: Buffer.alloc(12, 0x19),
    ...overrides
  });
}

test("wraps and restores the exact synthetic key under the expected family and key id", () => {
  const envelope = makeEnvelope();
  const restored = restoreKeyFromEscrow({
    envelope,
    wrappingKey: WRAPPING_KEY,
    expectedKeyId: "pii-hmac-key-v1",
    expectedFamily: "pii-hmac",
    expectedAlgorithm: "hmac-sha256"
  });
  assert.deepEqual(restored, KEY_MATERIAL);
});

test("escrow envelope and inventory projection do not expose raw key material", () => {
  const envelope = makeEnvelope();
  const serialized = JSON.stringify(envelope);
  assert.equal(serialized.includes(KEY_MATERIAL.toString("hex")), false);
  assert.equal(serialized.includes(KEY_MATERIAL.toString("base64")), false);
  const inventory = projectKeyEscrowInventory(envelope);
  assert.deepEqual(inventory, {
    schemaVersion: 1,
    keyId: "pii-hmac-key-v1",
    family: "pii-hmac",
    algorithm: "hmac-sha256",
    wrappedAt: WRAPPED_AT
  });
  assert.equal("ciphertext" in inventory, false);
});

test("wrong wrapping key fails authentication", () => {
  assert.throws(() => restoreKeyFromEscrow({
    envelope: makeEnvelope(),
    wrappingKey: Buffer.alloc(32, 0x72),
    expectedKeyId: "pii-hmac-key-v1",
    expectedFamily: "pii-hmac"
  }), /key_escrow_authentication_failed/);
});

test("wrong key id or family cannot restore an envelope", () => {
  const envelope = makeEnvelope();
  assert.throws(() => restoreKeyFromEscrow({
    envelope, wrappingKey: WRAPPING_KEY,
    expectedKeyId: "provider-event-key-v1", expectedFamily: "pii-hmac"
  }), /key_escrow_binding_mismatch/);
  assert.throws(() => restoreKeyFromEscrow({
    envelope, wrappingKey: WRAPPING_KEY,
    expectedKeyId: "pii-hmac-key-v1", expectedFamily: "provider-event-hmac"
  }), /key_escrow_binding_mismatch/);
});

test("authenticated metadata prevents family and algorithm tampering", () => {
  const envelope = makeEnvelope();
  assert.throws(() => restoreKeyFromEscrow({
    envelope: { ...envelope, family: "provider-event-hmac" },
    wrappingKey: WRAPPING_KEY,
    expectedKeyId: "pii-hmac-key-v1",
    expectedFamily: "provider-event-hmac"
  }), /key_escrow_authentication_failed/);
  assert.throws(() => restoreKeyFromEscrow({
    envelope: { ...envelope, algorithm: "aes-256-gcm" },
    wrappingKey: WRAPPING_KEY,
    expectedKeyId: "pii-hmac-key-v1",
    expectedFamily: "pii-hmac",
    expectedAlgorithm: "aes-256-gcm"
  }), /key_escrow_authentication_failed/);
});

test("rejects malformed envelope and unsupported schema versions", () => {
  const envelope = makeEnvelope();
  assert.throws(() => restoreKeyFromEscrow({
    envelope: { ...envelope, schemaVersion: 2 },
    wrappingKey: WRAPPING_KEY,
    expectedKeyId: "pii-hmac-key-v1",
    expectedFamily: "pii-hmac"
  }), /key_escrow_schema_version_invalid/);
  assert.throws(() => restoreKeyFromEscrow({
    envelope: { ...envelope, nonce: "not-base64url" },
    wrappingKey: WRAPPING_KEY,
    expectedKeyId: "pii-hmac-key-v1",
    expectedFamily: "pii-hmac"
  }), /key_escrow_envelope_invalid/);
});

test("requires 32-byte key and wrapping material", () => {
  assert.throws(() => makeEnvelope({ keyMaterial: Buffer.alloc(16) }), /key_escrow_material_invalid/);
  assert.throws(() => makeEnvelope({ wrappingKey: Buffer.alloc(16) }), /key_escrow_wrapping_key_invalid/);
});

test("rejects reused key material across distinct families", () => {
  assert.throws(() => assertDistinctKeyFamilies([
    { keyId: "pii-key-v1", family: "pii-hmac", keyMaterial: Buffer.alloc(32, 0x01) },
    { keyId: "provider-key-v1", family: "provider-event-hmac", keyMaterial: Buffer.alloc(32, 0x01) }
  ]), /key_family_material_reused/);
});

test("accepts distinct key material and unique family/key identifiers", () => {
  assert.equal(assertDistinctKeyFamilies([
    { keyId: "pii-key-v1", family: "pii-hmac", keyMaterial: Buffer.alloc(32, 0x01) },
    { keyId: "provider-key-v1", family: "provider-event-hmac", keyMaterial: Buffer.alloc(32, 0x02) }
  ]), true);
});

test("rejects duplicate family or key id in the key inventory", () => {
  assert.throws(() => assertDistinctKeyFamilies([
    { keyId: "pii-key-v1", family: "pii-hmac", keyMaterial: Buffer.alloc(32, 0x01) },
    { keyId: "pii-key-v2", family: "pii-hmac", keyMaterial: Buffer.alloc(32, 0x02) }
  ]), /key_family_inventory_duplicate/);
});
