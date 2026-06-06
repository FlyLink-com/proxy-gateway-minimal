import assert from "node:assert/strict";
import test from "node:test";
import { createPortalTotpVerifier } from "../services/platform/portal-totp-verifier.mjs";

test("portal TOTP verifier accepts enc-prefixed base32 secrets and adjacent time windows", () => {
  const verifier = createPortalTotpVerifier({
    nowFn: () => "2026-06-06T00:00:00.000Z"
  });

  assert.equal(verifier({
    encryptedTotpSecret: "enc:JBSWY3DPEHPK3PXP",
    code: "049557"
  }), true);
  assert.equal(verifier({
    encryptedTotpSecret: "enc:JBSWY3DPEHPK3PXP",
    code: "186022"
  }), true);
});

test("portal TOTP verifier fails closed for invalid formats and wrong codes", () => {
  const verifier = createPortalTotpVerifier({
    nowFn: () => "2026-06-06T00:00:00.000Z"
  });

  assert.equal(verifier({
    encryptedTotpSecret: "enc:not-base32!",
    code: "049557"
  }), false);
  assert.equal(verifier({
    encryptedTotpSecret: "enc:JBSWY3DPEHPK3PXP",
    code: "000000"
  }), false);
  assert.equal(verifier({
    encryptedTotpSecret: "enc:JBSWY3DPEHPK3PXP",
    code: "0495571"
  }), false);
});
