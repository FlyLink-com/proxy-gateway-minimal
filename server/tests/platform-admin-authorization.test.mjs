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


test("Admin principal derives the fixed admin read-capability set from an active session", () => {
  const principal = adminAuth.createAdminPrincipal?.({
    session: {
      sessionRef: "admin_session_1",
      operatorRef: "admin_operator_1",
      authMethod: "totp",
      status: "active",
      issuedAt: "2026-07-30T00:00:00.000Z",
      expiresAt: "2026-07-30T01:00:00.000Z"
    },
    role: "admin"
  });

  assert.deepEqual(principal, {
    operatorRef: "admin_operator_1",
    sessionRef: "admin_session_1",
    role: "admin",
    capabilities: [
      "operations.read",
      "users.read",
      "commerce.read",
      "payments.read",
      "wallet.read",
      "catalog.read",
      "runtime.read"
    ],
    authenticatedAt: "2026-07-30T00:00:00.000Z",
    expiresAt: "2026-07-30T01:00:00.000Z",
    authStrength: "session"
  });
});

test("Super Admin principal adds audit read without activating mutation capabilities", () => {
  const principal = adminAuth.createAdminPrincipal?.({
    session: {
      sessionRef: "admin_session_2",
      operatorRef: "admin_operator_2",
      authMethod: "totp",
      status: "active",
      issuedAt: "2026-07-30T00:00:00.000Z",
      expiresAt: "2026-07-30T01:00:00.000Z"
    },
    role: "super_admin"
  });

  assert.deepEqual(principal?.capabilities, [
    "operations.read",
    "users.read",
    "commerce.read",
    "payments.read",
    "wallet.read",
    "catalog.read",
    "runtime.read",
    "audit.read"
  ]);
  assert.equal(
    principal?.capabilities.some((capability) => !capability.endsWith(".read")),
    false
  );
});

test("Admin authorization fails closed with an explicit reason when no principal exists", () => {
  assert.deepEqual(
    adminAuth.authorizeAdmin({
      principal: null,
      capability: "wallet.read"
    }),
    {
      allowed: false,
      capability: "wallet.read",
      reasonCode: "principal_missing"
    }
  );
});

test("Admin principal rejects inactive, unknown-role, and incomplete session inputs", () => {
  const activeSession = {
    sessionRef: "admin_session_3",
    operatorRef: "admin_operator_3",
    authMethod: "totp",
    status: "active",
    issuedAt: "2026-07-30T00:00:00.000Z",
    expiresAt: "2026-07-30T01:00:00.000Z"
  };

  const rejectedInputs = [
    { session: { ...activeSession, status: "expired" }, role: "admin" },
    { session: { ...activeSession, status: "revoked" }, role: "admin" },
    { session: activeSession, role: "unknown" },
    {
      session: { ...activeSession, operatorRef: "" },
      role: "admin"
    }
  ];

  for (const input of rejectedInputs) {
    assert.equal(adminAuth.createAdminPrincipal(input), null);
  }
});

test("Admin authorization fails closed for a null input envelope", () => {
  assert.equal(adminAuth.createAdminPrincipal(null), null);
  assert.deepEqual(adminAuth.authorizeAdmin(null), {
    allowed: false,
    capability: "",
    reasonCode: "principal_missing"
  });
});
