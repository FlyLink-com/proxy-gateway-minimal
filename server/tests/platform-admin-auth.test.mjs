import assert from "node:assert/strict";
import test from "node:test";
import { createAdminAuthService } from "../services/platform/admin-auth.mjs";

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
