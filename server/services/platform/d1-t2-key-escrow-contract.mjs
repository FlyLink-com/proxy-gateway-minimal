import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const SCHEMA_VERSION = 1;
const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ALGORITHMS = new Set(["hmac-sha256", "aes-256-gcm"]);
const ENVELOPE_KEYS = Object.freeze([
  "schemaVersion", "keyId", "family", "algorithm", "wrappedAt", "nonce", "ciphertext", "tag"
].sort());

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function requireRef(value, code) {
  if (typeof value !== "string" || !SAFE_REF.test(value)) throw fail(code);
  return value;
}

function requireKey(value, code) {
  if (!(Buffer.isBuffer(value) || value instanceof Uint8Array)) throw fail(code);
  const key = Buffer.from(value);
  if (key.length !== 32) throw fail(code);
  return key;
}

function requireTimestamp(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw fail("key_escrow_timestamp_invalid");
  }
  if (new Date(value).toISOString() !== value) throw fail("key_escrow_timestamp_invalid");
  return value;
}

function aadFor(envelope) {
  return Buffer.from(JSON.stringify([
    SCHEMA_VERSION,
    envelope.keyId,
    envelope.family,
    envelope.algorithm,
    envelope.wrappedAt
  ]), "utf8");
}

function encode(value) {
  return Buffer.from(value).toString("base64url");
}

function decodeCanonical(value, expectedBytes, code) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/u.test(value)) throw fail(code);
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) throw fail(code);
  if (expectedBytes !== null && decoded.length !== expectedBytes) throw fail(code);
  return decoded;
}

function requireEnvelope(envelope) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    throw fail("key_escrow_envelope_invalid");
  }
  const keys = Object.keys(envelope).sort();
  if (keys.length !== ENVELOPE_KEYS.length || keys.some((key, index) => key !== ENVELOPE_KEYS[index])) {
    throw fail("key_escrow_envelope_invalid");
  }
  if (envelope.schemaVersion !== SCHEMA_VERSION) throw fail("key_escrow_schema_version_invalid");
  requireRef(envelope.keyId, "key_escrow_key_id_invalid");
  requireRef(envelope.family, "key_escrow_family_invalid");
  if (!ALGORITHMS.has(envelope.algorithm)) throw fail("key_escrow_algorithm_invalid");
  requireTimestamp(envelope.wrappedAt);
  decodeCanonical(envelope.nonce, 12, "key_escrow_envelope_invalid");
  decodeCanonical(envelope.ciphertext, 32, "key_escrow_envelope_invalid");
  decodeCanonical(envelope.tag, 16, "key_escrow_envelope_invalid");
  return envelope;
}

/**
 * Synthetic-only envelope for testing independent key escrow.
 * It does not create keys, call a KMS, persist data, or access Cloudflare.
 */
export function wrapKeyForEscrow({
  keyId,
  family,
  algorithm,
  keyMaterial,
  wrappingKey,
  wrappedAt,
  nonce = randomBytes(12)
} = {}) {
  requireRef(keyId, "key_escrow_key_id_invalid");
  requireRef(family, "key_escrow_family_invalid");
  if (!ALGORITHMS.has(algorithm)) throw fail("key_escrow_algorithm_invalid");
  const plaintext = requireKey(keyMaterial, "key_escrow_material_invalid");
  const wrapper = requireKey(wrappingKey, "key_escrow_wrapping_key_invalid");
  const timestamp = requireTimestamp(wrappedAt);
  const nonceBytes = Buffer.from(nonce);
  if (nonceBytes.length !== 12) throw fail("key_escrow_nonce_invalid");

  const envelopeBase = {
    schemaVersion: SCHEMA_VERSION,
    keyId,
    family,
    algorithm,
    wrappedAt: timestamp
  };
  const cipher = createCipheriv("aes-256-gcm", wrapper, nonceBytes);
  cipher.setAAD(aadFor(envelopeBase));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Object.freeze({
    ...envelopeBase,
    nonce: encode(nonceBytes),
    ciphertext: encode(ciphertext),
    tag: encode(cipher.getAuthTag())
  });
}

export function restoreKeyFromEscrow({
  envelope,
  wrappingKey,
  expectedKeyId,
  expectedFamily,
  expectedAlgorithm
} = {}) {
  requireEnvelope(envelope);
  if (envelope.keyId !== expectedKeyId || envelope.family !== expectedFamily) {
    throw fail("key_escrow_binding_mismatch");
  }
  if (expectedAlgorithm !== undefined && envelope.algorithm !== expectedAlgorithm) {
    throw fail("key_escrow_binding_mismatch");
  }

  const wrapper = requireKey(wrappingKey, "key_escrow_wrapping_key_invalid");
  const nonce = decodeCanonical(envelope.nonce, 12, "key_escrow_envelope_invalid");
  const ciphertext = decodeCanonical(envelope.ciphertext, 32, "key_escrow_envelope_invalid");
  const tag = decodeCanonical(envelope.tag, 16, "key_escrow_envelope_invalid");
  try {
    const decipher = createDecipheriv("aes-256-gcm", wrapper, nonce);
    decipher.setAAD(aadFor(envelope));
    decipher.setAuthTag(tag);
    const restored = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    if (restored.length !== 32) throw fail("key_escrow_material_invalid");
    return restored;
  } catch {
    throw fail("key_escrow_authentication_failed");
  }
}

export function assertDistinctKeyFamilies(entries) {
  if (!Array.isArray(entries) || entries.length === 0) throw fail("key_family_inventory_invalid");
  const ids = new Set();
  const families = new Set();
  const fingerprints = new Set();
  for (const entry of entries) {
    requireRef(entry?.keyId, "key_escrow_key_id_invalid");
    requireRef(entry?.family, "key_escrow_family_invalid");
    const material = requireKey(entry?.keyMaterial, "key_escrow_material_invalid");
    if (ids.has(entry.keyId) || families.has(entry.family)) {
      throw fail("key_family_inventory_duplicate");
    }
    ids.add(entry.keyId);
    families.add(entry.family);
    const fingerprint = createHash("sha256").update(material).digest("hex");
    if (fingerprints.has(fingerprint)) throw fail("key_family_material_reused");
    fingerprints.add(fingerprint);
  }
  return true;
}

export function projectKeyEscrowInventory(envelope) {
  requireEnvelope(envelope);
  return Object.freeze({
    schemaVersion: envelope.schemaVersion,
    keyId: envelope.keyId,
    family: envelope.family,
    algorithm: envelope.algorithm,
    wrappedAt: envelope.wrappedAt
  });
}
