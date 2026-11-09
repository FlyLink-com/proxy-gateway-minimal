import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import cryptoWorker from "../../workers/crypto/src/index.mjs";

const PATH = "/internal/v1/digests";
const TOKEN = "synthetic-crypto-caller-token-20261108";
const PREVIOUS_TOKEN = "synthetic-crypto-caller-token-previous-20261108";
const URL = "https://crypto.internal" + PATH;

function keyRing(activeKeyId, retainedKeyId, activeByte, retainedByte) {
  return JSON.stringify({
    activeKeyId,
    readKeyIds: [activeKeyId, retainedKeyId],
    keys: {
      [activeKeyId]: Buffer.alloc(32, activeByte).toString("base64url"),
      [retainedKeyId]: Buffer.alloc(32, retainedByte).toString("base64url")
    }
  });
}

function makeEnv(overrides = {}) {
  return {
    CRYPTO_CONTROL_PLANE_CALLER_TOKEN: TOKEN,
    IDEMPOTENCY_HMAC_KEYRING_JSON: keyRing("idem-active-v2", "idem-retained-v1", 0x11, 0x12),
    PROVIDER_EVENT_HMAC_KEYRING_JSON: keyRing("provider-active-v2", "provider-retained-v1", 0x21, 0x22),
    PII_HMAC_KEYRING_JSON: keyRing("pii-active-v2", "pii-retained-v1", 0x31, 0x32),
    ...overrides
  };
}

function request(body, {
  method = "POST",
  path = PATH,
  headers = {},
  rawBody
} = {}) {
  const requestHeaders = new Headers({
    authorization: "Bearer " + TOKEN,
    "x-flylink-internal-caller": "control-plane",
    "content-type": "application/json",
    ...headers
  });
  const init = { method, headers: requestHeaders };
  if (rawBody !== undefined) init.body = rawBody;
  else if (body !== undefined) init.body = JSON.stringify(body);
  return new Request("https://crypto.internal" + path, init);
}

async function call(body, env = makeEnv(), options = {}) {
  return cryptoWorker.fetch(request(body, options), env);
}

test("private caller authentication is mandatory and fails closed", async () => {
  const missing = await call({
    version: 1, operation: "idempotency.create", domain: "payment-order-create/v1",
    actorScope: "account:synthetic", operationType: "payment-order-create", rawKey: "synthetic-idem-key"
  }, { ...makeEnv(), CRYPTO_CONTROL_PLANE_CALLER_TOKEN: undefined });
  assert.equal(missing.status, 401);

  const wrongToken = await call({
    version: 1, operation: "idempotency.create", domain: "payment-order-create/v1",
    actorScope: "account:synthetic", operationType: "payment-order-create", rawKey: "synthetic-idem-key"
  }, makeEnv(), { headers: { authorization: "Bearer synthetic-wrong-token-20261108" } });
  assert.equal(wrongToken.status, 401);

  const wrongCaller = await call({
    version: 1, operation: "idempotency.create", domain: "payment-order-create/v1",
    actorScope: "account:synthetic", operationType: "payment-order-create", rawKey: "synthetic-idem-key"
  }, makeEnv(), { headers: { "x-flylink-internal-caller": "unapproved-worker" } });
  assert.equal(wrongCaller.status, 401);

  const noCallerHeader = await call({
    version: 1, operation: "idempotency.create", domain: "payment-order-create/v1",
    actorScope: "account:synthetic", operationType: "payment-order-create", rawKey: "synthetic-idem-key"
  }, makeEnv(), { headers: { "x-flylink-internal-caller": "" } });
  assert.equal(noCallerHeader.status, 401);
});

test("previous caller token is accepted only as an explicit rotation overlap", async () => {
  const env = makeEnv({ CRYPTO_CONTROL_PLANE_CALLER_TOKEN_PREVIOUS: PREVIOUS_TOKEN });
  const response = await cryptoWorker.fetch(request({
    version: 1, operation: "idempotency.create", domain: "payment-order-create/v1",
    actorScope: "account:synthetic", operationType: "payment-order-create", rawKey: "synthetic-idem-key"
  }, { headers: { authorization: "Bearer " + PREVIOUS_TOKEN } }), env);
  assert.equal(response.status, 200);

  const previousOnly = makeEnv({
    CRYPTO_CONTROL_PLANE_CALLER_TOKEN: undefined,
    CRYPTO_CONTROL_PLANE_CALLER_TOKEN_PREVIOUS: PREVIOUS_TOKEN
  });
  const denied = await cryptoWorker.fetch(request({
    version: 1, operation: "idempotency.create", domain: "payment-order-create/v1",
    actorScope: "account:synthetic", operationType: "payment-order-create", rawKey: "synthetic-idem-key"
  }, { headers: { authorization: "Bearer " + PREVIOUS_TOKEN } }), previousOnly);
  assert.equal(denied.status, 401);
});

test("idempotency create, retained-key candidates and verification use the active-write ring", async () => {
  const base = {
    version: 1,
    domain: "payment-order-create/v1",
    actorScope: "account:synthetic-001",
    operationType: "payment-order-create",
    rawKey: "synthetic-idempotency-key-001"
  };
  const createdResponse = await call({ ...base, operation: "idempotency.create" });
  assert.equal(createdResponse.status, 200);
  const created = await createdResponse.json();
  assert.match(created.envelope, /^hmac-sha256:v1:idem-active-v2:[a-f0-9]{64}$/u);

  const candidatesResponse = await call({ ...base, operation: "idempotency.candidates" });
  assert.equal(candidatesResponse.status, 200);
  const candidates = await candidatesResponse.json();
  assert.deepEqual(candidates.candidates.map((entry) => entry.keyId), ["idem-active-v2", "idem-retained-v1"]);

  for (const candidate of candidates.candidates) {
    const verified = await call({ ...base, operation: "idempotency.verify", envelope: candidate.envelope });
    assert.equal(verified.status, 200);
    assert.equal((await verified.json()).valid, true);
  }
  const tampered = await call({ ...base, operation: "idempotency.verify", envelope: created.envelope.slice(0, -1) + "0" });
  assert.equal((await tampered.json()).valid, false);
});

test("provider-event HMAC is isolated from the idempotency key family", async () => {
  const base = {
    version: 1,
    merchantScopeDigest: "sha256:" + "a".repeat(64),
    rawEventKey: "synthetic-provider-event-001"
  };
  const createdResponse = await call({ ...base, operation: "provider-event.create" });
  assert.equal(createdResponse.status, 200);
  const created = await createdResponse.json();
  assert.match(created.envelope, /^hmac-sha256:v1:provider-active-v2:/u);

  const verified = await call({ ...base, operation: "provider-event.verify", envelope: created.envelope });
  assert.equal((await verified.json()).valid, true);
});

test("PII operations accept only a precomputed digest, never raw PII", async () => {
  const rawEmail = "Synthetic.User@Example.test";
  const legacyDigestHex = createHash("sha256")
    .update(rawEmail.trim().toLowerCase(), "utf8")
    .digest("hex");
  const base = {
    version: 1,
    domain: "account-email-lookup/v1",
    legacyDigestHex
  };
  const createdResponse = await call({ ...base, operation: "pii.create" });
  assert.equal(createdResponse.status, 200);
  const created = await createdResponse.json();
  assert.match(created.envelope, /^hmac-sha256:v1:pii-active-v2:/u);
  assert.equal(JSON.stringify(created).includes(rawEmail), false);

  const candidatesResponse = await call({ ...base, operation: "pii.candidates" });
  const candidates = await candidatesResponse.json();
  assert.deepEqual(candidates.candidates.map((entry) => entry.keyId), ["pii-active-v2", "pii-retained-v1"]);

  const verified = await call({ ...base, operation: "pii.verify", envelope: candidates.candidates[1].envelope });
  assert.equal((await verified.json()).valid, true);

  const rawValueAttempt = await call({
    ...base, operation: "pii.create", rawValue: rawEmail
  });
  assert.equal(rawValueAttempt.status, 400);
  assert.equal(JSON.stringify(await rawValueAttempt.json()).includes(rawEmail), false);
});

test("all key families must be configured and key material must not be reused", async () => {
  const missing = await call({
    version: 1, operation: "idempotency.create", domain: "payment-order-create/v1",
    actorScope: "account:synthetic", operationType: "payment-order-create", rawKey: "synthetic-idem-key"
  }, { ...makeEnv(), PII_HMAC_KEYRING_JSON: undefined });
  assert.equal(missing.status, 503);

  const reused = await call({
    version: 1, operation: "idempotency.create", domain: "payment-order-create/v1",
    actorScope: "account:synthetic", operationType: "payment-order-create", rawKey: "synthetic-idem-key"
  }, {
    ...makeEnv(),
    PROVIDER_EVENT_HMAC_KEYRING_JSON: keyRing("provider-active-v2", "provider-retained-v1", 0x11, 0x22)
  });
  assert.equal(reused.status, 503);
});

test("invalid domains and extra request fields fail closed", async () => {
  const invalidDomain = await call({
    version: 1, operation: "idempotency.create", domain: "caller-controlled/v1",
    actorScope: "account:synthetic", operationType: "payment-order-create", rawKey: "synthetic-idem-key"
  });
  assert.equal(invalidDomain.status, 400);

  const extraField = await call({
    version: 1, operation: "idempotency.create", domain: "payment-order-create/v1",
    actorScope: "account:synthetic", operationType: "payment-order-create",
    rawKey: "synthetic-idem-key", keyMaterial: "must-not-be-accepted"
  });
  assert.equal(extraField.status, 400);
});

test("unknown routes, health probes and wrong methods are not exposed", async () => {
  const health = await cryptoWorker.fetch(request(undefined, { path: "/healthz", method: "GET" }), makeEnv());
  assert.equal(health.status, 404);
  const unknown = await cryptoWorker.fetch(request(undefined, { path: "/public/v1/digests", method: "GET" }), makeEnv());
  assert.equal(unknown.status, 404);
  const wrongMethod = await cryptoWorker.fetch(request(undefined, { method: "GET" }), makeEnv());
  assert.equal(wrongMethod.status, 405);
});

test("content type, malformed JSON and bounded body size are enforced", async () => {
  const body = {
    version: 1, operation: "idempotency.create", domain: "payment-order-create/v1",
    actorScope: "account:synthetic", operationType: "payment-order-create", rawKey: "synthetic-idem-key"
  };
  const wrongType = await cryptoWorker.fetch(request(body, { headers: { "content-type": "text/plain" } }), makeEnv());
  assert.equal(wrongType.status, 415);

  const malformed = await cryptoWorker.fetch(request(undefined, { rawBody: "{" }), makeEnv());
  assert.equal(malformed.status, 400);

  const oversized = await cryptoWorker.fetch(request(undefined, { rawBody: "x".repeat(16 * 1024 + 1) }), makeEnv());
  assert.equal(oversized.status, 413);
});

test("responses never expose raw key material or caller credentials", async () => {
  const response = await call({
    version: 1, operation: "idempotency.create", domain: "payment-order-create/v1",
    actorScope: "account:synthetic", operationType: "payment-order-create", rawKey: "synthetic-idem-key"
  });
  const serialized = await response.text();
  assert.equal(serialized.includes(Buffer.alloc(32, 0x11).toString("base64url")), false);
  assert.equal(serialized.includes(TOKEN), false);
  assert.equal(serialized.includes("keyMaterial"), false);
});
