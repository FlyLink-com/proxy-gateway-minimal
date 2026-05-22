import assert from "node:assert/strict";
import test from "node:test";
import {
  createSubscriptionToken,
  hashSubscriptionToken,
  tokenPrefix,
  verifySubscriptionToken
} from "../services/subscriptions/tokens.mjs";
import { computeSubscriptionStatus, normalizeStoredStatus } from "../services/subscriptions/status.mjs";

test("subscription tokens are visible once and stored as hashes", () => {
  const bytes = Buffer.alloc(32, 1);
  const created = createSubscriptionToken({ randomBytesFn: () => bytes });
  const expectedRaw = `pgsub_${bytes.toString("base64url")}`;

  assert.equal(created.rawToken, expectedRaw);
  assert.equal(created.tokenPrefix, expectedRaw.slice(0, 14));
  assert.equal(created.tokenHash, hashSubscriptionToken(expectedRaw));
  assert.notEqual(created.tokenHash, expectedRaw);
  assert.equal(verifySubscriptionToken(expectedRaw, created.tokenHash), true);
  assert.equal(verifySubscriptionToken(expectedRaw, `${created.tokenHash}zz`), false);
  assert.equal(verifySubscriptionToken(expectedRaw, created.tokenHash.slice(0, 63)), false);
  assert.equal(verifySubscriptionToken("pgsub_wrong", created.tokenHash), false);
});

test("tokenPrefix returns a short operator-safe prefix", () => {
  assert.equal(tokenPrefix("pgsub_abcdefghijklmnopqrstuvwxyz"), "pgsub_abcdefgh");
});

test("stored status validation accepts only active and disabled", () => {
  assert.equal(normalizeStoredStatus("active"), "active");
  assert.equal(normalizeStoredStatus("disabled"), "disabled");
  assert.throws(() => normalizeStoredStatus("expired"), /Invalid stored status/);
});

test("computed status distinguishes active, expiring, expired, and disabled", () => {
  const now = new Date("2026-05-21T00:00:00.000Z");

  assert.equal(computeSubscriptionStatus({
    storedStatus: "active",
    expiresAt: "2026-06-21T00:00:00.000Z",
    now
  }), "active");

  assert.equal(computeSubscriptionStatus({
    storedStatus: "active",
    expiresAt: "2026-05-25T00:00:00.000Z",
    now,
    expiringDays: 7
  }), "expiring");

  assert.equal(computeSubscriptionStatus({
    storedStatus: "active",
    expiresAt: "2026-05-20T23:59:59.000Z",
    now
  }), "expired");

  assert.equal(computeSubscriptionStatus({
    storedStatus: "disabled",
    expiresAt: "2026-06-21T00:00:00.000Z",
    now
  }), "disabled");
});
