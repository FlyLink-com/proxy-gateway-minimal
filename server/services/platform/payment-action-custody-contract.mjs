import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const SCHEMA_VERSION = 1;
const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ACTION_TYPES = new Set(["redirect_url", "qr_payload"]);
const ACTIVE_ORDER_STATES = new Set(["entry_ready", "pending"]);
const TERMINAL_STATES = new Set(["consumed", "expired", "revoked"]);
const MAX_ACTION_BYTES = 4096;
const RECORD_KEYS = Object.freeze([
  "schemaVersion", "orderRef", "accountRef", "actionRef", "actionType", "status",
  "createdAt", "expiresAt", "actionEnvelope", "terminalAt", "purgeAfter"
].sort());
const ACTION_ENVELOPE_KEYS = Object.freeze([
  "schemaVersion", "keyId", "nonce", "ciphertext", "tag"
].sort());

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function requireRef(value, code = "payment_action_reference_invalid") {
  if (typeof value !== "string" || !SAFE_REF.test(value)) throw fail(code);
  return value;
}

function requireTimestamp(value, code = "payment_action_timestamp_invalid") {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw fail(code);
  const normalized = new Date(value).toISOString();
  if (normalized !== value) throw fail(code);
  return value;
}

function requireKey(value) {
  if (!(Buffer.isBuffer(value) || value instanceof Uint8Array)) {
    throw fail("payment_action_key_invalid");
  }
  const key = Buffer.from(value);
  if (key.length !== 32) throw fail("payment_action_key_invalid");
  return key;
}

function requireRawValue(value, actionType) {
  if (typeof value !== "string" || value.length === 0 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw fail("payment_action_value_invalid");
  }
  if (Buffer.byteLength(value, "utf8") > MAX_ACTION_BYTES) {
    throw fail("payment_action_value_too_large");
  }
  if (actionType === "redirect_url") {
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      throw fail("payment_action_url_invalid");
    }
    if (
      parsed.protocol !== "https:"
      || parsed.username !== ""
      || parsed.password !== ""
      || parsed.hash !== ""
    ) {
      throw fail("payment_action_url_invalid");
    }
  }
  return value;
}

function associatedData(record, keyId) {
  return Buffer.from(JSON.stringify([
    SCHEMA_VERSION,
    record.orderRef,
    record.accountRef,
    record.actionRef,
    record.actionType,
    record.expiresAt,
    keyId
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

function requireExactKeys(value, expected, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw fail(code);
  const keys = Object.keys(value).sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw fail(code);
  }
}

function requireRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw fail("payment_action_record_invalid");
  }
  requireExactKeys(record, RECORD_KEYS, "payment_action_record_invalid");
  if (record.schemaVersion !== SCHEMA_VERSION) throw fail("payment_action_schema_version_invalid");
  requireRef(record.orderRef);
  requireRef(record.accountRef);
  requireRef(record.actionRef);
  if (!ACTION_TYPES.has(record.actionType)) throw fail("payment_action_type_invalid");
  requireTimestamp(record.createdAt);
  requireTimestamp(record.expiresAt);
  if (Date.parse(record.expiresAt) <= Date.parse(record.createdAt)) {
    throw fail("payment_action_expiry_invalid");
  }
  if (!["active", ...TERMINAL_STATES].includes(record.status)) {
    throw fail("payment_action_state_invalid");
  }
  if (record.status === "active") {
    if (
      !record.actionEnvelope
      || record.terminalAt !== null
      || record.purgeAfter !== null
    ) {
      throw fail("payment_action_record_invalid");
    }
    requireExactKeys(record.actionEnvelope, ACTION_ENVELOPE_KEYS, "payment_action_envelope_invalid");
    if (record.actionEnvelope.schemaVersion !== SCHEMA_VERSION) {
      throw fail("payment_action_record_invalid");
    }
    requireRef(record.actionEnvelope.keyId, "payment_action_key_id_invalid");
    decodeCanonical(record.actionEnvelope.nonce, 12, "payment_action_envelope_invalid");
    const ciphertext = decodeCanonical(record.actionEnvelope.ciphertext, null, "payment_action_envelope_invalid");
    if (ciphertext.length < 1 || ciphertext.length > MAX_ACTION_BYTES) {
      throw fail("payment_action_envelope_invalid");
    }
    decodeCanonical(record.actionEnvelope.tag, 16, "payment_action_envelope_invalid");
  } else {
    if (record.actionEnvelope !== null) throw fail("payment_action_record_invalid");
    const terminalAt = requireTimestamp(record.terminalAt);
    const purgeAfter = requireTimestamp(record.purgeAfter);
    if (Date.parse(terminalAt) < Date.parse(record.createdAt)) {
      throw fail("payment_action_terminal_time_invalid");
    }
    if (Date.parse(purgeAfter) <= Date.parse(terminalAt)) {
      throw fail("payment_action_purge_time_invalid");
    }
  }
  return record;
}

/**
 * Synthetic-only, provider-neutral AES-256-GCM action custody contract.
 * A production DO adapter must supply its own secret binding and transactional
 * persistence; this module performs no I/O and creates no real keys.
 */
export function createPaymentActionRecord({
  orderRef,
  accountRef,
  actionRef,
  actionType,
  rawValue,
  keyId,
  key,
  createdAt,
  expiresAt,
  nonce = randomBytes(12)
} = {}) {
  requireRef(orderRef);
  requireRef(accountRef);
  requireRef(actionRef);
  requireRef(keyId);
  if (!ACTION_TYPES.has(actionType)) throw fail("payment_action_type_invalid");
  const value = requireRawValue(rawValue, actionType);
  const created = requireTimestamp(createdAt);
  const expiry = requireTimestamp(expiresAt);
  if (Date.parse(expiry) <= Date.parse(created)) throw fail("payment_action_expiry_invalid");
  const keyBytes = requireKey(key);
  const nonceBytes = Buffer.from(nonce);
  if (nonceBytes.length !== 12) throw fail("payment_action_nonce_invalid");

  const recordBase = {
    schemaVersion: SCHEMA_VERSION,
    orderRef,
    accountRef,
    actionRef,
    actionType,
    status: "active",
    createdAt: created,
    expiresAt: expiry
  };
  const cipher = createCipheriv("aes-256-gcm", keyBytes, nonceBytes);
  cipher.setAAD(associatedData(recordBase, keyId));
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(value, "utf8")),
    cipher.final()
  ]);
  const actionEnvelope = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    keyId,
    nonce: encode(nonceBytes),
    ciphertext: encode(ciphertext),
    tag: encode(cipher.getAuthTag())
  });
  return Object.freeze({
    ...recordBase,
    actionEnvelope,
    terminalAt: null,
    purgeAfter: null
  });
}

export function resolvePaymentActionRecord({
  record,
  keyring,
  accountRef,
  orderRef,
  actionRef,
  orderStatus,
  now
} = {}) {
  requireRecord(record);
  requireRef(accountRef);
  requireRef(orderRef);
  requireRef(actionRef);
  const checkedAt = requireTimestamp(now);
  if (record.accountRef !== accountRef) throw fail("payment_action_forbidden");
  if (record.orderRef !== orderRef || record.actionRef !== actionRef) {
    throw fail("payment_action_binding_mismatch");
  }
  if (!ACTIVE_ORDER_STATES.has(orderStatus)) throw fail("payment_action_order_not_active");
  if (record.status !== "active" || !record.actionEnvelope) {
    throw fail("payment_action_not_active");
  }
  if (Date.parse(record.expiresAt) <= Date.parse(checkedAt)) {
    throw fail("payment_action_expired");
  }
  if (!(keyring instanceof Map)) throw fail("payment_action_keyring_invalid");
  const key = keyring.get(record.actionEnvelope.keyId);
  if (!key) throw fail("payment_action_key_unavailable");
  const keyBytes = requireKey(key);
  const nonce = decodeCanonical(record.actionEnvelope.nonce, 12, "payment_action_envelope_invalid");
  const ciphertext = decodeCanonical(record.actionEnvelope.ciphertext, null, "payment_action_envelope_invalid");
  const tag = decodeCanonical(record.actionEnvelope.tag, 16, "payment_action_envelope_invalid");
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyBytes, nonce);
    decipher.setAAD(associatedData(record, record.actionEnvelope.keyId));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("utf8");
  } catch {
    throw fail("payment_action_authentication_failed");
  }
}

export function transitionPaymentActionRecord(record, {
  nextStatus,
  at,
  purgeAfter
} = {}) {
  requireRecord(record);
  if (!TERMINAL_STATES.has(nextStatus)) throw fail("payment_action_terminal_state_invalid");
  const terminalAt = requireTimestamp(at);
  const purgeAt = requireTimestamp(purgeAfter);
  if (Date.parse(terminalAt) < Date.parse(record.createdAt)) {
    throw fail("payment_action_terminal_time_invalid");
  }
  if (Date.parse(purgeAt) <= Date.parse(terminalAt)) throw fail("payment_action_purge_time_invalid");
  if (record.status !== "active") {
    if (record.status === nextStatus) return record;
    throw fail("payment_action_terminal_conflict");
  }
  return Object.freeze({
    ...record,
    status: nextStatus,
    actionEnvelope: null,
    terminalAt,
    purgeAfter: purgeAt
  });
}

export function purgePaymentActionTombstone(record, { now } = {}) {
  requireRecord(record);
  const checkedAt = requireTimestamp(now);
  if (record.status === "active") return record;
  if (!record.purgeAfter || Date.parse(checkedAt) < Date.parse(record.purgeAfter)) return record;
  return null;
}

export function projectPaymentActionPointer(record) {
  requireRecord(record);
  return Object.freeze({
    actionRef: record.actionRef,
    actionType: record.actionType,
    expiresAt: record.expiresAt,
    status: record.status
  });
}
