import assert from "node:assert/strict";
import test from "node:test";
import { createAdminAuthService, createPortalAccountAdminAuthService } from "../services/platform/admin-auth.mjs";

test("default Admin TOTP secret generation does not depend on Math.random", (t) => {
  t.mock.method(Math, "random", () => {
    throw new Error("Math.random must not generate authentication secrets");
  });
  const auth = createAdminAuthService({
    bootstrapToken: "synthetic-bootstrap-token",
    sessionSecret: "synthetic-session-secret",
    nowFn: () => "2026-07-15T00:00:00.000Z",
    enrollmentRefFactory: () => "admin_totp_enroll_test_1",
    totpVerifier: () => true
  });

  const result = auth.startBootstrap({
    bootstrapToken: "synthetic-bootstrap-token"
  });

  assert.match(result.enrollment.manualKey, /^[A-Z2-7]{20}$/);
});

function fixedPortalAdminFixture({ setupRequired = false } = {}) {
  const accountId = "synthetic_fixed_admin";
  const passwordCalls = [];
  const auth = createPortalAccountAdminAuthService({
    accountId,
    sessionSecret: "synthetic-session-secret",
    nowFn: () => "2026-07-15T00:00:00.000Z",
    controlStore: {
      getAccount: (id) => id === accountId ? { id, status: "active" } : null,
      getActivePortalTotpCredential: () => setupRequired ? null : {
        id: "synthetic_totp", encryptedTotpSecret: "enc:synthetic-totp"
      }
    },
    passwordCredentialService: {
      verifyPasswordCredential(input) {
        passwordCalls.push(input.accountId);
        if (input.plainPassword !== "synthetic-password") throw new Error("invalid password");
      }
    },
    totpVerifier: ({ code }) => code === "654321"
  });
  return { auth, accountId, passwordCalls };
}

test("anonymous fixed-account status never reveals the configured account", () => {
  for (const setupRequired of [false, true]) {
    const { auth, accountId } = fixedPortalAdminFixture({ setupRequired });
    const status = auth.sessionStatus();
    assert.deepEqual(status, { authenticated: false, mode: "portalAccount", setupRequired });
    assert.equal(Object.hasOwn(status, "operatorRef"), false);
    assert.equal(JSON.stringify(status).includes(accountId), false);
  }
});

test("omitted operator selects the fixed account but still requires its password and TOTP", () => {
  const { auth, accountId, passwordCalls } = fixedPortalAdminFixture();
  assert.throws(() => auth.login({ bootstrapToken: "wrong" }), { code: "invalid_admin_login" });
  const { challenge } = auth.login({ bootstrapToken: "synthetic-password" });
  assert.equal(challenge.operatorRef, accountId);
  assert.deepEqual(passwordCalls, [accountId, accountId]);
  assert.equal(auth.authenticateCookie({ cookieHeader: "" }), null);
  assert.throws(() => auth.verifyTotp({ challengeRef: challenge.challengeRef, code: "000000" }), {
    code: "invalid_totp"
  });
  const result = auth.verifyTotp({ challengeRef: challenge.challengeRef, code: "654321" });
  assert.equal(result.session.operatorRef, accountId);
  assert.match(result.sessionCookie, /HttpOnly; Secure; SameSite=Strict/);
  assert.equal(auth.sessionStatus({ cookieHeader: result.sessionCookie }).authenticated, true);
});

test("explicit mismatched or malformed operator never falls back to the fixed administrator", () => {
  const { auth, accountId, passwordCalls } = fixedPortalAdminFixture();
  for (const operatorRef of ["another_admin", "", null, 0, false, [], {}]) {
    assert.throws(() => auth.login({ operatorRef, bootstrapToken: "synthetic-password" }), {
      code: "invalid_admin_login"
    });
  }
  assert.deepEqual(passwordCalls, []);
  assert.equal(auth.login({ operatorRef: accountId, bootstrapToken: "synthetic-password" }).challenge.operatorRef, accountId);
});

test("fixed-account omission does not bypass required private MFA setup", () => {
  const { auth } = fixedPortalAdminFixture({ setupRequired: true });
  assert.throws(() => auth.login({ bootstrapToken: "synthetic-password" }), { code: "invalid_admin_login" });
});

test("malformed or duplicate cookies fail closed without URI errors in both Admin auth services", () => {
  for (const auth of [fixedPortalAdminFixture().auth, createAdminAuthService({
    bootstrapToken: "synthetic-bootstrap", sessionSecret: "synthetic-secret", totpVerifier: () => false
  })]) {
    for (const cookieHeader of ["unrelated=%", "gcc_admin_session=%", "gcc_admin_session=%E0%A4%A", "gcc_admin_session=a; gcc_admin_session=b"]) {
      assert.equal(auth.authenticateCookie({ cookieHeader }), null);
      assert.equal(auth.sessionStatus({ cookieHeader }).authenticated, false);
      assert.ok(auth.logout({ cookieHeader }).clearCookie);
    }
  }
});
