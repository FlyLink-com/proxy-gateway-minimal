import assert from "node:assert/strict";
import test from "node:test";
import {
  createPortalTotpSecretProtector,
  createPortalTotpVerifier
} from "../services/platform/portal-totp-verifier.mjs";

const PROTECTOR_KEY = Buffer.from("00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff", "hex");
const PROTECTOR_IV = Buffer.from("000102030405060708090a0b", "hex");

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

test("portal TOTP verifier decrypts protected secret material without exposing base32 payloads", () => {
  const secretProtector = createPortalTotpSecretProtector({
    key: PROTECTOR_KEY,
    ivFactory: () => PROTECTOR_IV
  });
  const encryptedTotpSecret = secretProtector.protect("JBSWY3DPEHPK3PXP");

  assert.match(encryptedTotpSecret, /^v2:aes-256-gcm:/);
  assert.equal(encryptedTotpSecret.includes("JBSWY3DPEHPK3PXP"), false);
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
