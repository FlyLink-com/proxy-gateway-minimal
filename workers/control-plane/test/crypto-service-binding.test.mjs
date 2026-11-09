import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Miniflare } from "miniflare";

const USER_TOKEN = "synthetic-authorized-user-token-20261108";
const SERVICE_TOKEN = "synthetic-control-plane-to-crypto-token-20261108";
const cryptoEntrypoint = fileURLToPath(new URL("../../crypto/src/index.mjs", import.meta.url));
const callerEntrypoint = fileURLToPath(new URL("../../crypto/test/fixtures/authorized-caller.mjs", import.meta.url));

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

function cryptoBindings(overrides = {}) {
  return {
    CRYPTO_CONTROL_PLANE_CALLER_TOKEN: SERVICE_TOKEN,
    IDEMPOTENCY_HMAC_KEYRING_JSON: keyRing("idem-active-v2", "idem-retained-v1", 0x11, 0x12),
    PROVIDER_EVENT_HMAC_KEYRING_JSON: keyRing("provider-active-v2", "provider-retained-v1", 0x21, 0x22),
    PII_HMAC_KEYRING_JSON: keyRing("pii-active-v2", "pii-retained-v1", 0x31, 0x32),
    ...overrides
  };
}

async function createPair({
  callerServiceToken = SERVICE_TOKEN,
  cryptoSecretOverrides = {},
  omitServiceBinding = false
} = {}) {
  const cryptoMf = new Miniflare({
    modules: true,
    scriptPath: cryptoEntrypoint,
    compatibilityDate: "2025-06-01",
    bindings: cryptoBindings(cryptoSecretOverrides)
  });

  let serviceCalls = 0;
  let observedAuthorization = null;
  let observedCaller = null;
  const serviceBindings = omitServiceBinding ? {} : {
    CRYPTO_SERVICE: async (request) => {
      serviceCalls += 1;
      observedAuthorization = request.headers.get("authorization");
      observedCaller = request.headers.get("x-flylink-internal-caller");
      return cryptoMf.dispatchFetch(request);
    }
  };

  const callerMf = new Miniflare({
    modules: true,
    scriptPath: callerEntrypoint,
    compatibilityDate: "2025-06-01",
    bindings: {
      SYNTHETIC_USER_TOKEN: USER_TOKEN,
      CONTROL_PLANE_CRYPTO_CALLER_TOKEN: callerServiceToken
    },
    serviceBindings
  });

  return {
    callerMf,
    cryptoMf,
    get serviceCalls() { return serviceCalls; },
    get observedAuthorization() { return observedAuthorization; },
    get observedCaller() { return observedCaller; },
    async dispose() {
      await callerMf.dispose();
      await cryptoMf.dispose();
    }
  };
}

function authorizedRequest(body, token = USER_TOKEN) {
  return {
    method: "POST",
    headers: {
      authorization: "Bearer " + token,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  };
}

test("Miniflare private Service Binding rejects an unauthorized user before invoking Crypto Worker", async (t) => {
  const pair = await createPair();
  t.after(() => pair.dispose());

  const response = await pair.callerMf.dispatchFetch(
    "http://caller.local/__test/crypto",
    authorizedRequest({
      version: 1, operation: "idempotency.create", domain: "payment-order-create/v1",
      actorScope: "account:synthetic", operationType: "payment-order-create", rawKey: "synthetic-idem-key"
    }, "synthetic-wrong-user-token-20261108")
  );
  assert.equal(response.status, 401);
  assert.equal(pair.serviceCalls, 0);
});

test("authorized synthetic caller reaches Crypto Worker through Service Binding with a separate internal token", async (t) => {
  const pair = await createPair();
  t.after(() => pair.dispose());

  const response = await pair.callerMf.dispatchFetch(
    "http://caller.local/__test/crypto",
    authorizedRequest({
      version: 1, operation: "idempotency.create", domain: "payment-order-create/v1",
      actorScope: "account:synthetic-001", operationType: "payment-order-create", rawKey: "synthetic-idem-key-001"
    })
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.match(body.envelope, /^hmac-sha256:v1:idem-active-v2:/u);
  assert.equal(pair.serviceCalls, 1);
  assert.equal(pair.observedAuthorization, "Bearer " + SERVICE_TOKEN);
  assert.equal(pair.observedCaller, "control-plane");
  assert.notEqual(pair.observedAuthorization, "Bearer " + USER_TOKEN);
  assert.equal(JSON.stringify(body).includes(SERVICE_TOKEN), false);
});

test("wrong internal service token is rejected by Crypto Worker", async (t) => {
  const pair = await createPair({ callerServiceToken: "synthetic-wrong-service-token-20261108" });
  t.after(() => pair.dispose());

  const response = await pair.callerMf.dispatchFetch(
    "http://caller.local/__test/crypto",
    authorizedRequest({
      version: 1, operation: "idempotency.create", domain: "payment-order-create/v1",
      actorScope: "account:synthetic-002", operationType: "payment-order-create", rawKey: "synthetic-idem-key-002"
    })
  );
  assert.equal(response.status, 401);
  assert.equal(pair.serviceCalls, 1);
});

test("missing Service Binding or incomplete key custody fails closed", async (t) => {
  const noBinding = await createPair({ omitServiceBinding: true });
  t.after(() => noBinding.dispose());
  const request = authorizedRequest({
    version: 1, operation: "idempotency.create", domain: "payment-order-create/v1",
    actorScope: "account:synthetic-003", operationType: "payment-order-create", rawKey: "synthetic-idem-key-003"
  });
  const unavailable = await noBinding.callerMf.dispatchFetch("http://caller.local/__test/crypto", request);
  assert.equal(unavailable.status, 503);
  assert.equal(noBinding.serviceCalls, 0);

  const missingRing = await createPair({ cryptoSecretOverrides: { PII_HMAC_KEYRING_JSON: "" } });
  t.after(() => missingRing.dispose());
  const failed = await missingRing.callerMf.dispatchFetch(
    "http://caller.local/__test/crypto",
    authorizedRequest({
      version: 1, operation: "idempotency.create", domain: "payment-order-create/v1",
      actorScope: "account:synthetic-004", operationType: "payment-order-create", rawKey: "synthetic-idem-key-004"
    })
  );
  assert.equal(failed.status, 503);
});

test("PII digest crosses Service Binding without raw PII and extra raw-value fields are rejected", async (t) => {
  const pair = await createPair();
  t.after(() => pair.dispose());

  const rawEmail = "Synthetic.Service.Binding@Example.test";
  const legacyDigestHex = createHash("sha256")
    .update(rawEmail.trim().toLowerCase(), "utf8")
    .digest("hex");
  const good = await pair.callerMf.dispatchFetch(
    "http://caller.local/__test/crypto",
    authorizedRequest({
      version: 1, operation: "pii.create", domain: "account-email-lookup/v1", legacyDigestHex
    })
  );
  assert.equal(good.status, 200);
  const result = await good.json();
  assert.match(result.envelope, /^hmac-sha256:v1:pii-active-v2:/u);
  assert.equal(JSON.stringify(result).includes(rawEmail), false);

  const bad = await pair.callerMf.dispatchFetch(
    "http://caller.local/__test/crypto",
    authorizedRequest({
      version: 1, operation: "pii.create", domain: "account-email-lookup/v1",
      legacyDigestHex, rawValue: rawEmail
    })
  );
  assert.equal(bad.status, 400);
  assert.equal(JSON.stringify(await bad.json()).includes(rawEmail), false);
});
