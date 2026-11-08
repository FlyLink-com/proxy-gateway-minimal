const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/u;
const LOWER_HEX_64_PATTERN = /^[a-f0-9]{64}$/u;
const KEY_FAMILIES = new Set([
  "idempotency-hmac",
  "provider-event-hmac",
  "pii-hmac",
  "portal-totp-aes",
  "admin-totp-aes"
]);

const IDEMPOTENCY_DOMAINS = new Set([
  "coin-wallet-operation-receipt/v1",
  "coin-commerce-operation-receipt/v1",
  "deferred-transition-operation-receipt/v1",
  "payment-order-create/v1",
  "wallet-first-deferred-checkout-reserve/v1",
  "portal-registration-welcome-grant/v1"
]);

const PII_DOMAINS = new Set([
  "account-email-lookup/v1",
  "registration-source-ip/v1",
  "registration-request-key/v1"
]);

const LEASE_UUID_FIELD = "platform_deferred_resource_transition_reservations.lease_token";
const LEASE_HEX_FIELDS = new Set([
  "platform_coin_commerce_fulfillment_commands.lease_token",
  "platform_deferred_resource_transitions.lease_token",
  "platform_deferred_resource_transition_rebases.lease_token",
  "platform_wallet_first_resource_effect_runtime_claims.lease_token",
  "platform_portal_registration_welcome_coin_grants.lease_token"
]);

const keyRingSecrets = new WeakMap();

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

function cryptoApi() {
  const api = globalThis.crypto;
  if (!api?.subtle || typeof api.getRandomValues !== "function") {
    throw fail("crypto_api_unavailable");
  }
  return api;
}

function requireText(value, code = "security_input_invalid") {
  if (typeof value !== "string" || value.length === 0) throw fail(code);
  return value;
}

function requireKeyId(value) {
  if (typeof value !== "string" || !KEY_ID_PATTERN.test(value)) {
    throw fail("key_id_invalid");
  }
  return value;
}

function toBytes(value, code = "key_material_invalid") {
  if (!(value instanceof Uint8Array)) throw fail(code);
  return new Uint8Array(value);
}

function concatBytes(...parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function utf8(value) {
  return encoder.encode(requireText(value));
}

function lengthPrefix(value) {
  const bytes = utf8(value);
  if (bytes.length > 0xffffffff) throw fail("security_input_too_large");
  const prefix = new Uint8Array(4);
  new DataView(prefix.buffer).setUint32(0, bytes.length, false);
  return concatBytes(prefix, bytes);
}

function bytesToHex(value) {
  let output = "";
  for (const byte of value) output += byte.toString(16).padStart(2, "0");
  return output;
}

function hexToBytes(value) {
  if (typeof value !== "string" || !LOWER_HEX_64_PATTERN.test(value)) return null;
  const output = new Uint8Array(32);
  for (let index = 0; index < 32; index += 1) {
    output[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return output;
}

function bytesToBase64Url(value) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/gu, "");
}

function base64UrlToBytes(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/u.test(value)) return null;
  try {
    const base64 = value.replace(/-/gu, "+").replace(/_/gu, "/")
      + "=".repeat((4 - (value.length % 4)) % 4);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytesToBase64Url(bytes) === value ? bytes : null;
  } catch {
    return null;
  }
}

function requireKeyFamily(keyRing, family) {
  if (!keyRing || keyRing.family !== family || !keyRingSecrets.has(keyRing)) {
    throw fail("key_family_mismatch");
  }
}

function keyBytes(keyRing, keyId) {
  const value = keyRingSecrets.get(keyRing)?.get(keyId);
  return value ? new Uint8Array(value) : null;
}

export function createD1KeyRing({ family, activeKeyId, readKeyIds, keys } = {}) {
  if (!KEY_FAMILIES.has(family)) throw fail("key_family_invalid");
  requireKeyId(activeKeyId);
  if (!Array.isArray(readKeyIds) || readKeyIds.length === 0
    || readKeyIds[0] !== activeKeyId || new Set(readKeyIds).size !== readKeyIds.length) {
    throw fail("key_read_ring_invalid");
  }
  for (const keyId of readKeyIds) requireKeyId(keyId);

  let entries = null;
  if (keys instanceof Map) {
    entries = [...keys.entries()];
  } else if (isPlainRecord(keys) && Object.getOwnPropertySymbols(keys).length === 0) {
    const descriptors = Object.getOwnPropertyDescriptors(keys);
    entries = Object.entries(descriptors).map(([keyId, descriptor]) => {
      if (!Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
        throw fail("key_ring_keys_invalid");
      }
      return [keyId, descriptor.value];
    });
  }
  if (!entries || entries.length !== readKeyIds.length) throw fail("key_ring_keys_invalid");

  const supplied = new Map();
  try {
    for (const [keyId, value] of entries) {
      requireKeyId(keyId);
      const key = toBytes(value);
      if (key.length !== 32 || supplied.has(keyId)) {
        key.fill(0);
        throw fail("key_material_invalid");
      }
      supplied.set(keyId, key);
    }
    if (readKeyIds.some((keyId) => !supplied.has(keyId))) throw fail("key_ring_keys_invalid");
  } catch (error) {
    for (const key of supplied.values()) key.fill(0);
    throw error;
  }

  const ring = Object.freeze({
    family,
    activeKeyId,
    readKeyIds: Object.freeze([...readKeyIds])
  });
  keyRingSecrets.set(ring, supplied);
  return ring;
}

export function parseD1KeyRingSecret(secretText, { family } = {}) {
  if (typeof secretText !== "string" || secretText.length > 64 * 1024) {
    throw fail("key_ring_secret_invalid");
  }
  let parsed;
  try {
    parsed = JSON.parse(secretText);
  } catch {
    throw fail("key_ring_secret_invalid");
  }
  if (!isPlainRecord(parsed)
    || Object.keys(parsed).sort().join(",") !== "activeKeyId,keys,readKeyIds"
    || !isPlainRecord(parsed.keys)) {
    throw fail("key_ring_secret_invalid");
  }
  const keys = {};
  try {
    for (const [keyId, encoded] of Object.entries(parsed.keys)) {
      const decoded = base64UrlToBytes(encoded);
      if (!decoded || decoded.length !== 32) throw fail("key_ring_secret_invalid");
      keys[keyId] = decoded;
    }
    return createD1KeyRing({
      family,
      activeKeyId: parsed.activeKeyId,
      readKeyIds: parsed.readKeyIds,
      keys
    });
  } finally {
    for (const key of Object.values(keys)) key.fill(0);
  }
}

export function destroyD1KeyRing(keyRing) {
  const keys = keyRingSecrets.get(keyRing);
  if (!keys) return false;
  for (const value of keys.values()) value.fill(0);
  keys.clear();
  keyRingSecrets.delete(keyRing);
  return true;
}

export function assertDistinctKeyRings(left, right) {
  if (!keyRingSecrets.has(left) || !keyRingSecrets.has(right) || left === right) {
    throw fail("key_ring_separation_invalid");
  }
  for (const leftId of left.readKeyIds) {
    const leftKey = keyBytes(left, leftId);
    try {
      for (const rightId of right.readKeyIds) {
        const rightKey = keyBytes(right, rightId);
        try {
          if (leftKey.length !== rightKey.length) continue;
          let difference = 0;
          for (let index = 0; index < leftKey.length; index += 1) {
            difference |= leftKey[index] ^ rightKey[index];
          }
          if (difference === 0) throw fail("key_family_reuse_detected");
        } finally {
          rightKey?.fill(0);
        }
      }
    } finally {
      leftKey?.fill(0);
    }
  }
  return true;
}

async function importHmacKey(rawKey) {
  return cryptoApi().subtle.importKey(
    "raw",
    rawKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function hmacSign(rawKey, message) {
  try {
    const key = await importHmacKey(rawKey);
    return new Uint8Array(await cryptoApi().subtle.sign("HMAC", key, message));
  } finally {
    rawKey.fill(0);
  }
}

async function hmacVerify(rawKey, signature, message) {
  try {
    const key = await importHmacKey(rawKey);
    return await cryptoApi().subtle.verify("HMAC", key, signature, message);
  } finally {
    rawKey.fill(0);
  }
}

function parseEnvelope(value) {
  if (typeof value !== "string") return null;
  const match = /^hmac-sha256:v1:([A-Za-z0-9][A-Za-z0-9._-]{0,31}):([a-f0-9]{64})$/u.exec(value);
  if (!match) return null;
  return { keyId: match[1], digest: match[2] };
}

export function parseD1HmacEnvelope(value) {
  return parseEnvelope(value);
}

function idempotencyMessage({ keyId, domain, actorScope, operationType, rawKey }) {
  return concatBytes(
    utf8("flylink:d1:idempotency:v1\0"),
    lengthPrefix(keyId),
    lengthPrefix(domain),
    lengthPrefix(actorScope),
    lengthPrefix(operationType),
    lengthPrefix(rawKey)
  );
}

function providerEventMessage({ keyId, merchantScopeDigest, rawEventKey }) {
  return concatBytes(
    utf8("flylink:d1:provider-event:v1\0"),
    lengthPrefix(keyId),
    lengthPrefix(merchantScopeDigest),
    lengthPrefix(rawEventKey)
  );
}

function piiDigestMessage({ keyId, domain, legacyDigestHex }) {
  return concatBytes(
    utf8("flylink:d1:pii-digest:v1\0"),
    lengthPrefix(keyId),
    lengthPrefix(domain),
    lengthPrefix(legacyDigestHex)
  );
}

async function makeEnvelope({ keyRing, keyId, message }) {
  const rawKey = keyBytes(keyRing, keyId);
  if (!rawKey) throw fail("key_id_unknown");
  const signature = await hmacSign(rawKey, message);
  return "hmac-sha256:v1:" + keyId + ":" + bytesToHex(signature);
}

async function verifyEnvelope({ envelope, keyRing, messageForKeyId }) {
  const parsed = parseEnvelope(envelope);
  if (!parsed || !keyRingSecrets.has(keyRing)) return false;
  const rawKey = keyBytes(keyRing, parsed.keyId);
  if (!rawKey) return false;
  const signature = hexToBytes(parsed.digest);
  if (!signature) {
    rawKey.fill(0);
    return false;
  }
  let message;
  try {
    message = messageForKeyId(parsed.keyId);
  } catch {
    rawKey.fill(0);
    return false;
  }
  try {
    return await hmacVerify(rawKey, signature, message);
  } catch {
    return false;
  }
}

function validateIdempotencyInput({ domain, actorScope, operationType, rawKey }) {
  if (!IDEMPOTENCY_DOMAINS.has(domain)) throw fail("idempotency_domain_invalid");
  requireText(actorScope);
  requireText(operationType);
  requireText(rawKey);
}

export async function createD1IdempotencyEnvelope({ keyRing, domain, actorScope, operationType, rawKey } = {}) {
  requireKeyFamily(keyRing, "idempotency-hmac");
  validateIdempotencyInput({ domain, actorScope, operationType, rawKey });
  const keyId = keyRing.activeKeyId;
  return makeEnvelope({
    keyRing,
    keyId,
    message: idempotencyMessage({ keyId, domain, actorScope, operationType, rawKey })
  });
}

export async function createD1IdempotencyLookupCandidates({ keyRing, domain, actorScope, operationType, rawKey } = {}) {
  requireKeyFamily(keyRing, "idempotency-hmac");
  validateIdempotencyInput({ domain, actorScope, operationType, rawKey });
  const candidates = [];
  for (const keyId of keyRing.readKeyIds) {
    candidates.push({
      keyId,
      envelope: await makeEnvelope({
        keyRing,
        keyId,
        message: idempotencyMessage({ keyId, domain, actorScope, operationType, rawKey })
      })
    });
  }
  return candidates;
}

export async function verifyD1IdempotencyEnvelope({ envelope, keyRing, domain, actorScope, operationType, rawKey } = {}) {
  try {
    requireKeyFamily(keyRing, "idempotency-hmac");
    validateIdempotencyInput({ domain, actorScope, operationType, rawKey });
  } catch {
    return false;
  }
  return verifyEnvelope({
    envelope,
    keyRing,
    messageForKeyId: (keyId) => idempotencyMessage({ keyId, domain, actorScope, operationType, rawKey })
  });
}

function validateProviderEventInput({ merchantScopeDigest, rawEventKey }) {
  if (typeof merchantScopeDigest !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(merchantScopeDigest)) {
    throw fail("provider_event_scope_invalid");
  }
  requireText(rawEventKey);
}

export async function createD1ProviderEventEnvelope({ keyRing, merchantScopeDigest, rawEventKey } = {}) {
  requireKeyFamily(keyRing, "provider-event-hmac");
  validateProviderEventInput({ merchantScopeDigest, rawEventKey });
  const keyId = keyRing.activeKeyId;
  return makeEnvelope({
    keyRing,
    keyId,
    message: providerEventMessage({ keyId, merchantScopeDigest, rawEventKey })
  });
}

export async function createD1ProviderEventLookupCandidates({ keyRing, merchantScopeDigest, rawEventKey } = {}) {
  requireKeyFamily(keyRing, "provider-event-hmac");
  validateProviderEventInput({ merchantScopeDigest, rawEventKey });
  const candidates = [];
  for (const keyId of keyRing.readKeyIds) {
    candidates.push({
      keyId,
      envelope: await makeEnvelope({
        keyRing,
        keyId,
        message: providerEventMessage({ keyId, merchantScopeDigest, rawEventKey })
      })
    });
  }
  return candidates;
}

export async function verifyD1ProviderEventEnvelope({ envelope, keyRing, merchantScopeDigest, rawEventKey } = {}) {
  try {
    requireKeyFamily(keyRing, "provider-event-hmac");
    validateProviderEventInput({ merchantScopeDigest, rawEventKey });
  } catch {
    return false;
  }
  return verifyEnvelope({
    envelope,
    keyRing,
    messageForKeyId: (keyId) => providerEventMessage({ keyId, merchantScopeDigest, rawEventKey })
  });
}

function validatePiiDomain(domain) {
  if (!PII_DOMAINS.has(domain)) throw fail("pii_domain_invalid");
}

function normalizePiiSourceValue(rawValue, domain) {
  requireText(rawValue);
  const normalized = domain === "account-email-lookup/v1"
    ? rawValue.trim().toLowerCase()
    : rawValue.trim();
  if (!normalized) throw fail("pii_source_value_invalid");
  return normalized;
}

async function legacyPiiDigest(rawValue, domain) {
  const normalized = normalizePiiSourceValue(rawValue, domain);
  const digest = await cryptoApi().subtle.digest("SHA-256", utf8(normalized));
  return bytesToHex(new Uint8Array(digest));
}

export async function createD1PiiDigestEnvelope({ keyRing, domain, legacyDigestHex } = {}) {
  requireKeyFamily(keyRing, "pii-hmac");
  validatePiiDomain(domain);
  if (!LOWER_HEX_64_PATTERN.test(legacyDigestHex || "")) throw fail("legacy_digest_invalid");
  const keyId = keyRing.activeKeyId;
  return makeEnvelope({
    keyRing,
    keyId,
    message: piiDigestMessage({ keyId, domain, legacyDigestHex })
  });
}

export async function createD1PiiLookupCandidates({ keyRing, domain, rawValue } = {}) {
  requireKeyFamily(keyRing, "pii-hmac");
  validatePiiDomain(domain);
  const legacyDigestHex = await legacyPiiDigest(rawValue, domain);
  const candidates = [];
  for (const keyId of keyRing.readKeyIds) {
    candidates.push({
      keyId,
      envelope: await makeEnvelope({
        keyRing,
        keyId,
        message: piiDigestMessage({ keyId, domain, legacyDigestHex })
      })
    });
  }
  return candidates;
}

export async function verifyD1PiiDigestEnvelope({ envelope, keyRing, domain, rawValue } = {}) {
  try {
    requireKeyFamily(keyRing, "pii-hmac");
    validatePiiDomain(domain);
    const legacyDigestHex = await legacyPiiDigest(rawValue, domain);
    return verifyEnvelope({
      envelope,
      keyRing,
      messageForKeyId: (keyId) => piiDigestMessage({ keyId, domain, legacyDigestHex })
    });
  } catch {
    return false;
  }
}

export async function createD1LeaseTokenDigest(rawToken) {
  requireText(rawToken);
  const digest = await cryptoApi().subtle.digest("SHA-256", concatBytes(
    utf8("flylink:d1:lease-token:v1\0"),
    lengthPrefix(rawToken)
  ));
  return bytesToHex(new Uint8Array(digest));
}

export function isValidD1LeaseTokenForField(field, token) {
  if (typeof field !== "string" || typeof token !== "string") return false;
  if (field === LEASE_UUID_FIELD) {
    return /^deferred_reservation_lease_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(token);
  }
  return LEASE_HEX_FIELDS.has(field) && /^[0-9a-f]{64}$/u.test(token);
}

function requireCredentialRef(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value)) {
    throw fail("credential_ref_invalid");
  }
  return value;
}

function totpAad({ keyId, scope, credentialRef }) {
  return concatBytes(
    utf8("flylink:d1:totp-secret:v3\0"),
    lengthPrefix(keyId),
    lengthPrefix(scope),
    lengthPrefix(credentialRef)
  );
}

function parseTotpEnvelope(value) {
  if (typeof value !== "string") return null;
  const parts = value.split(":");
  if (parts.length !== 6 || parts[0] !== "v3" || parts[1] !== "aes-256-gcm"
    || !KEY_ID_PATTERN.test(parts[2])) return null;
  const iv = base64UrlToBytes(parts[3]);
  const tag = base64UrlToBytes(parts[4]);
  const ciphertext = base64UrlToBytes(parts[5]);
  if (!iv || iv.length !== 12 || !tag || tag.length !== 16 || !ciphertext || ciphertext.length === 0) {
    return null;
  }
  return { keyId: parts[2], iv, tag, ciphertext };
}

async function importAesKey(rawKey, usages) {
  try {
    return await cryptoApi().subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, usages);
  } finally {
    rawKey.fill(0);
  }
}

function normalizeLegacyBase32(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/^enc:/u, "").replace(/[\s-]/gu, "")
    .replace(/=+$/gu, "").toUpperCase();
  return /^[A-Z2-7]+$/u.test(normalized) ? normalized : null;
}

export function createD1TotpSecretProtector({ keyRing, scope, ivFactory } = {}) {
  const expectedFamily = scope === "portal" ? "portal-totp-aes"
    : (scope === "admin" ? "admin-totp-aes" : null);
  if (!expectedFamily) throw fail("totp_scope_invalid");
  requireKeyFamily(keyRing, expectedFamily);

  async function protect(secret, { credentialRef } = {}) {
    const plaintext = normalizeLegacyBase32(requireText(secret, "totp_secret_invalid"));
    if (!plaintext) throw fail("totp_secret_invalid");
    const ref = requireCredentialRef(credentialRef);
    const keyId = keyRing.activeKeyId;
    const crypto = cryptoApi();
    const iv = ivFactory
      ? toBytes(ivFactory(), "totp_iv_invalid")
      : crypto.getRandomValues(new Uint8Array(12));
    if (iv.length !== 12) throw fail("totp_iv_invalid");
    const rawKey = keyBytes(keyRing, keyId);
    const key = await importAesKey(rawKey, ["encrypt"]);
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({
      name: "AES-GCM",
      iv,
      additionalData: totpAad({ keyId, scope, credentialRef: ref }),
      tagLength: 128
    }, key, utf8(plaintext)));
    if (encrypted.length <= 16) throw fail("totp_encryption_failed");
    const ciphertext = encrypted.slice(0, -16);
    const tag = encrypted.slice(-16);
    return "v3:aes-256-gcm:" + keyId + ":" + bytesToBase64Url(iv) + ":"
      + bytesToBase64Url(tag) + ":" + bytesToBase64Url(ciphertext);
  }

  async function unprotect(envelope, { credentialRef } = {}) {
    const parsed = parseTotpEnvelope(envelope);
    if (!parsed || !keyRing.readKeyIds.includes(parsed.keyId)) return null;
    let ref;
    try {
      ref = requireCredentialRef(credentialRef);
    } catch {
      return null;
    }
    const rawKey = keyBytes(keyRing, parsed.keyId);
    if (!rawKey) return null;
    try {
      const key = await importAesKey(rawKey, ["decrypt"]);
      const plaintext = await cryptoApi().subtle.decrypt({
        name: "AES-GCM",
        iv: parsed.iv,
        additionalData: totpAad({ keyId: parsed.keyId, scope, credentialRef: ref }),
        tagLength: 128
      }, key, concatBytes(parsed.ciphertext, parsed.tag));
      return decoder.decode(plaintext);
    } catch {
      return null;
    }
  }

  async function reencrypt(envelope, { credentialRef } = {}) {
    const plaintext = await unprotect(envelope, { credentialRef });
    if (plaintext === null) return null;
    return protect(plaintext, { credentialRef });
  }

  return Object.freeze({ protect, unprotect, reencrypt });
}

async function decryptLegacyV2Totp(value, legacyKey) {
  if (typeof value !== "string") return null;
  const parts = value.split(":");
  if (parts.length !== 5 || parts[0] !== "v2" || parts[1] !== "aes-256-gcm") return null;
  const iv = base64UrlToBytes(parts[2]);
  const tag = base64UrlToBytes(parts[3]);
  const ciphertext = base64UrlToBytes(parts[4]);
  if (!iv || iv.length !== 12 || !tag || tag.length !== 16 || !ciphertext || ciphertext.length === 0) return null;
  const rawKey = toBytes(legacyKey, "legacy_totp_key_invalid");
  if (rawKey.length !== 32) {
    rawKey.fill(0);
    throw fail("legacy_totp_key_invalid");
  }
  try {
    const key = await importAesKey(rawKey, ["decrypt"]);
    const plaintext = await cryptoApi().subtle.decrypt({
      name: "AES-GCM", iv, tagLength: 128
    }, key, concatBytes(ciphertext, tag));
    return decoder.decode(plaintext);
  } catch {
    return null;
  }
}

export async function reencryptLegacyD1TotpV2({ value, legacyKey, keyRing, scope, credentialRef, ivFactory } = {}) {
  const protector = createD1TotpSecretProtector({ keyRing, scope, ivFactory });
  if (typeof value !== "string") return { status: "quarantine" };
  if (value.startsWith("enc:") || !value.startsWith("v2:aes-256-gcm:")) {
    return { status: "re_enroll_required" };
  }
  let plaintext;
  try {
    plaintext = await decryptLegacyV2Totp(value, legacyKey);
  } catch {
    return { status: "quarantine" };
  }
  const normalized = normalizeLegacyBase32(plaintext);
  if (!normalized) return { status: "quarantine" };
  try {
    const envelope = await protector.protect(normalized, { credentialRef });
    return { status: "reencrypted", envelope };
  } catch {
    return { status: "quarantine" };
  }
}
