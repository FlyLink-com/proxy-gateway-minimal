import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";

// Synthetic-only fixtures. These bytes are public test constants, not secrets.
const IDEMPOTENCY_KEY_ID = "test-k-20261107";
const IDEMPOTENCY_KEY = Buffer.from("11".repeat(32), "hex");
const PROVIDER_KEY_ID = "test-provider-20261107";
const PROVIDER_KEY = Buffer.from("22".repeat(32), "hex");
const RAW_IDEMPOTENCY_KEY = "idem.synthetic.0001";

const LEASE_UUID_FIELD =
  "platform_deferred_resource_transition_reservations.lease_token";
const LEASE_HEX_FIELDS = new Set([
  "platform_coin_commerce_fulfillment_commands.lease_token",
  "platform_deferred_resource_transitions.lease_token",
  "platform_deferred_resource_transition_rebases.lease_token",
  "platform_wallet_first_resource_effect_runtime_claims.lease_token",
  "platform_portal_registration_welcome_coin_grants.lease_token"
]);

function lengthPrefix(value) {
  const bytes = Buffer.from(value, "utf8");
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32BE(bytes.length, 0);
  return Buffer.concat([prefix, bytes]);
}

function leaseTokenDigest(rawToken) {
  return createHash("sha256")
    .update(Buffer.concat([
      Buffer.from("flylink:d1:lease-token:v1\0", "utf8"),
      lengthPrefix(rawToken)
    ]))
    .digest("hex");
}

function validLeaseTokenForField(field, token) {
  if (field === LEASE_UUID_FIELD) {
    return /^deferred_reservation_lease_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(token);
  }
  return LEASE_HEX_FIELDS.has(field) && /^[0-9a-f]{64}$/.test(token);
}

function idempotencyEnvelope({ key, keyId, domain, actorScope, operationType, rawKey }) {
  const message = Buffer.concat([
    Buffer.from("flylink:d1:idempotency:v1\0", "utf8"),
    lengthPrefix(keyId),
    lengthPrefix(domain),
    lengthPrefix(actorScope),
    lengthPrefix(operationType),
    lengthPrefix(rawKey)
  ]);
  const digest = createHmac("sha256", key).update(message).digest("hex");
  return `hmac-sha256:v1:${keyId}:${digest}`;
}

function providerEventEnvelope({ key, keyId, merchantScopeDigest, rawEventKey }) {
  const message = Buffer.concat([
    Buffer.from("flylink:d1:provider-event:v1\0", "utf8"),
    lengthPrefix(keyId),
    lengthPrefix(merchantScopeDigest),
    lengthPrefix(rawEventKey)
  ]);
  const digest = createHmac("sha256", key).update(message).digest("hex");
  return `hmac-sha256:v1:${keyId}:${digest}`;
}

function parseEnvelope(value) {
  const match = /^hmac-sha256:v1:([A-Za-z0-9][A-Za-z0-9._-]{0,31}):([a-f0-9]{64})$/.exec(value);
  return match ? { keyId: match[1], digest: match[2] } : null;
}

const IDEMPOTENCY_VECTORS = [
  {
    domain: "coin-wallet-operation-receipt/v1",
    actorScope: "actor:synthetic-01",
    operationType: "credit_coins",
    expected: "hmac-sha256:v1:test-k-20261107:9949784d575e2c3b2ffb2964089bf5250dcbe320d1635bb11a0b9cfdea3c9a7a"
  },
  {
    domain: "coin-commerce-operation-receipt/v1",
    actorScope: "actor:synthetic-02",
    operationType: "create_quote",
    expected: "hmac-sha256:v1:test-k-20261107:c4ace414789c8ddb08dd7872bee2a5e3f724bb3a88cdd735cba6623cffbdfeb2"
  },
  {
    domain: "deferred-transition-operation-receipt/v1",
    actorScope: "actor:synthetic-03",
    operationType: "reserve_transition",
    expected: "hmac-sha256:v1:test-k-20261107:312cf0f436e157aa3c109a9dc3522b175d03f778dc7b3b643a8bdb9f1d438517"
  },
  {
    domain: "payment-order-create/v1",
    actorScope: "acct:synthetic-01",
    operationType: "create_payment_order",
    expected: "hmac-sha256:v1:test-k-20261107:151f169589b5b22eca063bab80fa3ee5b345993c83610af761c69df8454bced5"
  },
  {
    domain: "wallet-first-deferred-checkout-reserve/v1",
    actorScope: "actor:synthetic-04",
    operationType: "reserve_wallet_first_deferred_checkout_quote",
    expected: "hmac-sha256:v1:test-k-20261107:455e0d595b9fb2006af631313f63c32f8a5fc02fb3e1d3293ff8537c9b92f910"
  },
  {
    domain: "portal-registration-welcome-grant/v1",
    actorScope: "actor:synthetic-05",
    operationType: "grant_welcome_coins",
    expected: "hmac-sha256:v1:test-k-20261107:d1fa47da47c814b81b41be6c0a6c223d4320aee28a428b0e148f39d00e082ebc"
  }
];

test("lease digest known-answer: 64-lowercase-hex issuer", () => {
  const raw = "ab".repeat(32);
  assert.equal(
    validLeaseTokenForField("platform_coin_commerce_fulfillment_commands.lease_token", raw),
    true
  );
  assert.equal(
    leaseTokenDigest(raw),
    "5d34ae333a5855c0bfca92b54777b8a2f95fec4396368b4f5bb4aac134ba3953"
  );
  assert.equal(leaseTokenDigest(raw).includes(raw), false);
});

test("lease digest known-answer: UUID-prefixed reservation issuer", () => {
  const raw = "deferred_reservation_lease_550e8400-e29b-41d4-a716-446655440000";
  assert.equal(validLeaseTokenForField(LEASE_UUID_FIELD, raw), true);
  assert.equal(
    leaseTokenDigest(raw),
    "fa8c68df9a4b3853bc38ef0f478841d868c4211fc06cc82b1906dc306cebeb77"
  );
});

test("lease issuer grammar is field-specific and rejects mixed formats", () => {
  const hex = "cd".repeat(32);
  const uuid = "deferred_reservation_lease_550e8400-e29b-41d4-a716-446655440000";
  for (const field of LEASE_HEX_FIELDS) assert.equal(validLeaseTokenForField(field, hex), true);
  assert.equal(validLeaseTokenForField(LEASE_UUID_FIELD, uuid), true);
  assert.equal(validLeaseTokenForField(LEASE_UUID_FIELD, hex), false);
  assert.equal(validLeaseTokenForField([...LEASE_HEX_FIELDS][0], uuid), false);
  assert.equal(validLeaseTokenForField([...LEASE_HEX_FIELDS][0], hex.toUpperCase()), false);
});

test("all six idempotency column families match synthetic HMAC known-answer vectors", () => {
  for (const vector of IDEMPOTENCY_VECTORS) {
    assert.equal(idempotencyEnvelope({
      key: IDEMPOTENCY_KEY,
      keyId: IDEMPOTENCY_KEY_ID,
      domain: vector.domain,
      actorScope: vector.actorScope,
      operationType: vector.operationType,
      rawKey: RAW_IDEMPOTENCY_KEY
    }), vector.expected);
  }
});

test("length-prefix encoding separates ambiguous field boundaries", () => {
  const left = idempotencyEnvelope({
    key: IDEMPOTENCY_KEY, keyId: IDEMPOTENCY_KEY_ID, domain: "x",
    actorScope: "ab", operationType: "c", rawKey: "d"
  });
  const right = idempotencyEnvelope({
    key: IDEMPOTENCY_KEY, keyId: IDEMPOTENCY_KEY_ID, domain: "x",
    actorScope: "a", operationType: "bc", rawKey: "d"
  });
  assert.notEqual(left, right);
});

test("provider event dedupe uses its own key and domain", () => {
  const envelope = providerEventEnvelope({
    key: PROVIDER_KEY,
    keyId: PROVIDER_KEY_ID,
    merchantScopeDigest: `sha256:${"33".repeat(32)}`,
    rawEventKey: "evt_synthetic_0001"
  });
  assert.equal(
    envelope,
    "hmac-sha256:v1:test-provider-20261107:6390a1662aa3347b567edaeca55093d05b925574cbc3492364ccda580b13be06"
  );
  assert.notEqual(envelope, idempotencyEnvelope({
    key: IDEMPOTENCY_KEY,
    keyId: IDEMPOTENCY_KEY_ID,
    domain: "payment-provider-event/v1",
    actorScope: `sha256:${"33".repeat(32)}`,
    operationType: "payment_succeeded",
    rawKey: "evt_synthetic_0001"
  }));
});

test("versioned envelope carries a public key ID and unknown IDs fail closed", () => {
  const envelope = IDEMPOTENCY_VECTORS[0].expected;
  const parsed = parseEnvelope(envelope);
  assert.deepEqual(parsed, {
    keyId: IDEMPOTENCY_KEY_ID,
    digest: "9949784d575e2c3b2ffb2964089bf5250dcbe320d1635bb11a0b9cfdea3c9a7a"
  });
  const keyRing = new Map([[IDEMPOTENCY_KEY_ID, IDEMPOTENCY_KEY]]);
  assert.equal(keyRing.has(parsed.keyId), true);
  assert.equal(keyRing.has("unknown-key-20261107"), false);
  assert.equal(parseEnvelope(RAW_IDEMPOTENCY_KEY), null);
});

test("edge notification generation matches the two observed production builder forms", () => {
  const generationPattern = /^(?:gen_[0-9a-f]{24}|gen_scoped_[0-9a-f]{32})$/;
  assert.equal(generationPattern.test(`gen_${"ab".repeat(12)}`), true);
  assert.equal(generationPattern.test(`gen_scoped_${"cd".repeat(16)}`), true);
  assert.equal(generationPattern.test("gen_current"), false);
  assert.equal(generationPattern.test(`gen_${"AB".repeat(12)}`), false);
});

test("PII lookup pseudonym uses a separate keyed domain over the legacy digest", () => {
  const piiKeyId = "test-pii-20261107";
  const piiKey = Buffer.from("33".repeat(32), "hex");
  const legacyDigestHex = createHash("sha256")
    .update("synthetic-user@example.test", "utf8")
    .digest("hex");
  const message = Buffer.concat([
    Buffer.from("flylink:d1:pii-digest:v1\0", "utf8"),
    lengthPrefix(piiKeyId),
    lengthPrefix("account-email-lookup/v1"),
    lengthPrefix(legacyDigestHex)
  ]);
  const digest = createHmac("sha256", piiKey).update(message).digest("hex");
  assert.equal(legacyDigestHex, "f7f6823924555e936175da8ec0ce2d69abf3800ddbf5d4a0ad6e9f97d5629c44");
  assert.equal(
    `hmac-sha256:v1:${piiKeyId}:${digest}`,
    "hmac-sha256:v1:test-pii-20261107:34abee6aeb0d49ebde0e23fe1ab31a32c867bea313e9ce5a5faa3f9bce6e58ba"
  );
});

const PII_TEST_KEY_ID = "test-pii-20261107";
const PII_TEST_KEY = Buffer.from("33".repeat(32), "hex");

function piiDigestEnvelope({ key, keyId, domain, legacyDigestHex }) {
  const message = Buffer.concat([
    Buffer.from("flylink:d1:pii-digest:v1\0", "utf8"),
    lengthPrefix(keyId),
    lengthPrefix(domain),
    lengthPrefix(legacyDigestHex)
  ]);
  const digest = createHmac("sha256", key).update(message).digest("hex");
  return `hmac-sha256:v1:${keyId}:${digest}`;
}

function piiLookupCandidates({ rawValue, domain, keyRing }) {
  const sourceValue = domain === "account-email-lookup/v1"
    ? String(rawValue).trim().toLowerCase()
    : String(rawValue);
  const legacyDigestHex = createHash("sha256")
    .update(sourceValue, "utf8")
    .digest("hex");
  return [...keyRing.entries()].map(([keyId, key]) => ({
    keyId,
    envelope: piiDigestEnvelope({ key, keyId, domain, legacyDigestHex })
  }));
}

function verifyPiiEnvelope({ envelope, keyRing, domain, legacyDigestHex }) {
  const parsed = parseEnvelope(envelope);
  if (!parsed) return false;
  const key = keyRing.get(parsed.keyId);
  if (!key) return false;
  return piiDigestEnvelope({
    key,
    keyId: parsed.keyId,
    domain,
    legacyDigestHex
  }) === envelope;
}

test("PII pseudonym known-answer vectors cover email, source IP and request context domains", () => {
  const vectors = [
    {
      domain: "account-email-lookup/v1",
      raw: "synthetic-user@example.test",
      legacy: "f7f6823924555e936175da8ec0ce2d69abf3800ddbf5d4a0ad6e9f97d5629c44",
      expected: "hmac-sha256:v1:test-pii-20261107:34abee6aeb0d49ebde0e23fe1ab31a32c867bea313e9ce5a5faa3f9bce6e58ba"
    },
    {
      domain: "registration-source-ip/v1",
      raw: "198.18.0.1",
      legacy: "3ebe27a5987fe4053782dff38d127dd59c717773fc9133fca22bee1a71caf1f3",
      expected: "hmac-sha256:v1:test-pii-20261107:7e0168966e458f63199660e912284c064c8ea4c10a909afe638ff78147c2af7e"
    },
    {
      domain: "registration-request-key/v1",
      raw: "198.18.0.1:synthetic-agent/1.0",
      legacy: "8b2d15a03fdfb489033e370cf527ff23773d2f8f4bdf987a9810210eaca0e83f",
      expected: "hmac-sha256:v1:test-pii-20261107:a09ccddeb8fead9dbfb234ca71733b773703f746ce897ec33e95d93c6b31e58e"
    }
  ];
  for (const vector of vectors) {
    const legacyDigestHex = createHash("sha256").update(vector.raw, "utf8").digest("hex");
    assert.equal(legacyDigestHex, vector.legacy);
    assert.equal(piiDigestEnvelope({
      key: PII_TEST_KEY,
      keyId: PII_TEST_KEY_ID,
      domain: vector.domain,
      legacyDigestHex
    }), vector.expected);
    assert.equal(vector.expected.includes(vector.raw), false);
    assert.equal(vector.expected.includes(vector.legacy), false);
  }
});

test("account email lookup applies the source trim-and-lowercase normalization", () => {
  const keyRing = new Map([[PII_TEST_KEY_ID, PII_TEST_KEY]]);
  const canonical = piiLookupCandidates({
    rawValue: "synthetic-user@example.test",
    domain: "account-email-lookup/v1",
    keyRing
  })[0].envelope;
  const nonCanonical = piiLookupCandidates({
    rawValue: "  Synthetic-User@Example.Test  ",
    domain: "account-email-lookup/v1",
    keyRing
  })[0].envelope;
  assert.equal(nonCanonical, canonical);
});

test("PII pseudonyms are separated by domain and key ID", () => {
  const legacyDigestHex = createHash("sha256")
    .update("synthetic-user@example.test", "utf8")
    .digest("hex");
  const email = piiDigestEnvelope({
    key: PII_TEST_KEY, keyId: PII_TEST_KEY_ID,
    domain: "account-email-lookup/v1", legacyDigestHex
  });
  const otherDomain = piiDigestEnvelope({
    key: PII_TEST_KEY, keyId: PII_TEST_KEY_ID,
    domain: "registration-source-ip/v1", legacyDigestHex
  });
  const otherKeyId = piiDigestEnvelope({
    key: PII_TEST_KEY, keyId: "test-pii-alias-20261107",
    domain: "account-email-lookup/v1", legacyDigestHex
  });
  assert.notEqual(email, otherDomain);
  assert.notEqual(email, otherKeyId);
});

test("PII key rotation reads retained old envelopes and writes only with the active key", () => {
  const rawEmail = "synthetic-user@example.test";
  const legacyDigestHex = createHash("sha256").update(rawEmail, "utf8").digest("hex");
  const oldKeyId = "test-pii-20261107";
  const oldKey = Buffer.from("33".repeat(32), "hex");
  const activeKeyId = "test-pii-20261108";
  const activeKey = Buffer.from("44".repeat(32), "hex");
  const keyRing = new Map([[oldKeyId, oldKey], [activeKeyId, activeKey]]);
  const oldEnvelope = piiDigestEnvelope({
    key: oldKey, keyId: oldKeyId,
    domain: "account-email-lookup/v1", legacyDigestHex
  });
  const activeEnvelope = piiDigestEnvelope({
    key: activeKey, keyId: activeKeyId,
    domain: "account-email-lookup/v1", legacyDigestHex
  });
  const candidates = piiLookupCandidates({
    rawValue: rawEmail, domain: "account-email-lookup/v1", keyRing
  });
  assert.equal(candidates.some(candidate => candidate.envelope === oldEnvelope), true);
  assert.equal(candidates.some(candidate => candidate.envelope === activeEnvelope), true);
  assert.equal(activeEnvelope, "hmac-sha256:v1:test-pii-20261108:0e8117b96f15b2726b08e2f3fd5ed59913c4f93fe3bc9f1973b068e71e0f2d48");
  assert.equal(verifyPiiEnvelope({
    envelope: oldEnvelope, keyRing, domain: "account-email-lookup/v1", legacyDigestHex
  }), true);
  assert.equal(verifyPiiEnvelope({
    envelope: oldEnvelope, keyRing: new Map([[activeKeyId, activeKey]]),
    domain: "account-email-lookup/v1", legacyDigestHex
  }), false);
  assert.equal(verifyPiiEnvelope({
    envelope: createHash("sha256").update(rawEmail).digest("hex"),
    keyRing, domain: "account-email-lookup/v1", legacyDigestHex
  }), false);
});

test("PII rotation never treats a legacy SHA-256 digest as a runtime fallback", () => {
  const rawEmail = "synthetic-user@example.test";
  const legacyDigestHex = createHash("sha256").update(rawEmail, "utf8").digest("hex");
  const keyRing = new Map([[PII_TEST_KEY_ID, PII_TEST_KEY]]);
  const candidates = piiLookupCandidates({
    rawValue: rawEmail, domain: "account-email-lookup/v1", keyRing
  });
  assert.equal(candidates.length, 1);
  assert.notEqual(candidates[0].envelope, legacyDigestHex);
  assert.equal(verifyPiiEnvelope({
    envelope: legacyDigestHex, keyRing,
    domain: "account-email-lookup/v1", legacyDigestHex
  }), false);
});
