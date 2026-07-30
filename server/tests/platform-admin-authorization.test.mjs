import assert from "node:assert/strict";
import test from "node:test";

import * as adminAuth from "../services/platform/admin-auth.mjs";

test("Admin authorization allows a read capability explicitly held by an active principal", () => {
  const decision = adminAuth.authorizeAdmin?.({
    principal: {
      operatorRef: "admin_operator_1",
      sessionRef: "admin_session_1",
      role: "admin",
      capabilities: ["operations.read"],
      authenticatedAt: "2026-07-30T00:00:00.000Z",
      expiresAt: "2026-07-30T01:00:00.000Z",
      authStrength: "session"
    },
    capability: "operations.read"
  });

  assert.deepEqual(decision, {
    allowed: true,
    capability: "operations.read",
    reasonCode: "allowed"
  });
});


test("Admin authorization denies a read capability not held by the principal", () => {
  const decision = adminAuth.authorizeAdmin?.({
    principal: {
      operatorRef: "admin_operator_1",
      sessionRef: "admin_session_1",
      role: "operator",
      capabilities: ["operations.read"],
      authenticatedAt: "2026-07-30T00:00:00.000Z",
      expiresAt: "2026-07-30T01:00:00.000Z",
      authStrength: "session"
    },
    capability: "wallet.read"
  });

  assert.deepEqual(decision, {
    allowed: false,
    capability: "wallet.read",
    reasonCode: "capability_missing"
  });
});
