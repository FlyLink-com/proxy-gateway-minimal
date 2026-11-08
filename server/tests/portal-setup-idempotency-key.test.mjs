import assert from "node:assert/strict";
import test from "node:test";

import {
  createSecurePortalSetupIdempotencyKey
} from "../../admin/src/features/user-portal/secure-idempotency-key.mjs";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("uses native cryptographic randomUUID when available", () => {
  let calls = 0;
  const value = createSecurePortalSetupIdempotencyKey({
    randomUUID() {
      calls += 1;
      return "123e4567-e89b-42d3-a456-426614174000";
    }
  });
  assert.equal(value, "123e4567-e89b-42d3-a456-426614174000");
  assert.equal(calls, 1);
});

test("uses getRandomValues to construct a canonical UUIDv4 fallback", () => {
  let calls = 0;
  const value = createSecurePortalSetupIdempotencyKey({
    getRandomValues(bytes) {
      calls += 1;
      bytes.fill(0);
      return bytes;
    }
  });
  assert.equal(value, "00000000-0000-4000-8000-000000000000");
  assert.match(value, UUID_V4);
  assert.equal(calls, 1);
});

test("fails closed when secure randomness is unavailable", () => {
  assert.throws(
    () => createSecurePortalSetupIdempotencyKey({}),
    /secure_random_unavailable/
  );
});

test("fails closed when getRandomValues does not return the supplied typed array", () => {
  let supplied;
  assert.throws(
    () => createSecurePortalSetupIdempotencyKey({
      getRandomValues(bytes) {
        supplied = bytes;
        bytes.fill(0);
        return new Uint8Array(16).fill(1);
      }
    }),
    /secure_random_unavailable/
  );
  assert.ok(supplied instanceof Uint8Array);
});

test("fails closed when the secure random provider throws", () => {
  assert.throws(
    () => createSecurePortalSetupIdempotencyKey({
      getRandomValues() {
        throw new Error("synthetic_rng_failure");
      }
    }),
    /secure_random_unavailable/
  );
});

test("rejects a malformed native randomUUID result instead of using a weak fallback", () => {
  assert.throws(
    () => createSecurePortalSetupIdempotencyKey({
      randomUUID: () => "predictable-value",
      getRandomValues(bytes) {
        bytes.fill(0);
        return bytes;
      }
    }),
    /secure_random_unavailable/
  );
});
