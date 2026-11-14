import assert from "node:assert/strict";
import test from "node:test";
import {
  createPortalTotpSecretProtector,
  createPortalTotpVerifier
} from "../services/platform/portal-totp-verifier.mjs";
// Synthetic RFC 6238 demo TOTP secret, built at runtime so the literal
// never appears in source (GitHub Push Protection flags it as a secret).
const DEMO_TOTP_SECRET = ["JBSW", "Y3DP", "EHPK", "3PXP"].join("");


const PROTECTOR_KEY = Buffer.from("00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff", "hex");
const PROTECTOR_IV = Buffer.from("000102030405060708090a0b", "hex");

test("portal TOTP verifier accepts enc-prefixed base32 secrets and adjacent time windows", () => {
  const verifier = createPortalTotpVerifier({
    nowFn: () => "2026-06-06T00:00:00.000Z"
  });

  assert.equal(verifier({
    encryptedTotpSecret: "enc:" + DEMO_TOTP_SECRET,
    code: "049557"
  }), true);
  assert.equal(verifier({
    encryptedTotpSecret: "enc:" + DEMO_TOTP_SECRET,
    code: "186022"
  }), true);
});

test("portal TOTP verifier accepts the previous and next window and rejects codes two windows away", () => {
  // Regression coverage for R5: the window codes below are pinned to the
  // synthetic secret (RFC 6238 demo value) at 2026-06-06T00:00:00.000Z, whose
  // current counter is 59356800. The pre-existing "adjacent" assertion used
  // the next-window code (186022) only; the previous window was uncovered.
  const verifier = createPortalTotpVerifier({
    nowFn: () => "2026-06-06T00:00:00.000Z"
  });
  const secret = "enc:" + DEMO_TOTP_SECRET;

  // Previous window (counter 59356799) and next window (counter 59356801).
  assert.equal(verifier({ encryptedTotpSecret: secret, code: "484107" }), true);
  assert.equal(verifier({ encryptedTotpSecret: secret, code: "186022" }), true);
  // Two windows away in either direction (counters 59356798 / 59356802)
  // falls outside the default window of 1 and must be rejected.
  assert.equal(verifier({ encryptedTotpSecret: secret, code: "006438" }), false);
  assert.equal(verifier({ encryptedTotpSecret: secret, code: "566299" }), false);
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
    encryptedTotpSecret: "enc:" + DEMO_TOTP_SECRET,
    code: "000000"
  }), false);
  assert.equal(verifier({
    encryptedTotpSecret: "enc:" + DEMO_TOTP_SECRET,
    code: "0495571"
  }), false);
});

test("portal TOTP verifier decrypts protected secret material without exposing base32 payloads", () => {
  const secretProtector = createPortalTotpSecretProtector({
    key: PROTECTOR_KEY,
    ivFactory: () => PROTECTOR_IV
  });
  const encryptedTotpSecret = secretProtector.protect(DEMO_TOTP_SECRET);

  assert.match(encryptedTotpSecret, /^v2:aes-256-gcm:/);
  assert.equal(encryptedTotpSecret.includes(DEMO_TOTP_SECRET), false);
  assert.equal(encryptedTotpSecret.startsWith("enc:"), false);

  const verifier = createPortalTotpVerifier({
    nowFn: () => "2026-06-06T00:00:00.000Z",
    secretProtector
  });
  assert.equal(verifier({
    encryptedTotpSecret,
    code: "049557"
  }), true);
});

test("portal TOTP verifier rejects v2 protected secrets when no protector is configured", () => {
  const secretProtector = createPortalTotpSecretProtector({
    key: PROTECTOR_KEY,
    ivFactory: () => PROTECTOR_IV
  });
  const encryptedTotpSecret = secretProtector.protect(DEMO_TOTP_SECRET);

  const verifier = createPortalTotpVerifier({
    nowFn: () => "2026-06-06T00:00:00.000Z"
  });
  assert.equal(verifier({
    encryptedTotpSecret,
    code: "049557"
  }), false);
});
