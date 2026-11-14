import assert from "node:assert/strict";
import test from "node:test";
import {
  EMAIL_DISPLAY_FALLBACK,
  isMaskedEmailDisplay,
  maskEmail,
  maskEmailOrKeep
} from "../services/platform/email-masking.mjs";

test("maskEmail keeps the first two local characters and the full domain", () => {
  assert.equal(maskEmail("li@example.com"), "li***@example.com");
  assert.equal(maskEmail("local-user@example.test"), "lo***@example.test");
  assert.equal(maskEmail("longlocalpart@sub.example.co.uk"), "lo***@sub.example.co.uk");
});

test("maskEmail keeps a short local part whole before the mask", () => {
  assert.equal(maskEmail("a@example.com"), "a***@example.com");
  assert.equal(maskEmail("ab@example.com"), "ab***@example.com");
});

test("maskEmail trims and lowercases before masking", () => {
  assert.equal(maskEmail("  LI@GMAIL.COM  "), "li***@gmail.com");
  assert.equal(maskEmail("MixedCase@Example.Test"), "mi***@example.test");
});

test("maskEmail drops a subaddress tag before masking", () => {
  assert.equal(maskEmail("user+tag@example.com"), "us***@example.com");
  assert.equal(maskEmail("user+@example.com"), "us***@example.com");
  assert.equal(maskEmail("a+b@example.com"), "a***@example.com");
});

test("maskEmail keeps non-ASCII characters and never converts the domain", () => {
  assert.equal(maskEmail("müller@münchen.de"), "mü***@münchen.de");
  assert.equal(maskEmail("用户@例子.中国"), "用户***@例子.中国");
});

test("maskEmail masks an overlong local part instead of failing", () => {
  assert.equal(maskEmail(`${"a".repeat(100)}@example.com`), "aa***@example.com");
});

test("maskEmail returns the fallback for invalid input and never throws", () => {
  for (const invalid of [
    null,
    undefined,
    "",
    "   ",
    42,
    true,
    {},
    [],
    "not-an-email",
    "a@b",
    "a@b.",
    "@example.com",
    "a b@example.com",
    "a@@example.com"
  ]) {
    assert.equal(maskEmail(invalid), EMAIL_DISPLAY_FALLBACK, JSON.stringify(invalid));
  }
  assert.equal(EMAIL_DISPLAY_FALLBACK, "user_account");
});

test("maskEmail is idempotent on its own output", () => {
  for (const email of [
    "li@example.com",
    "a@example.com",
    "user+tag@example.com",
    "müller@münchen.de"
  ]) {
    const masked = maskEmail(email);
    assert.equal(maskEmail(masked), masked, email);
  }
  assert.equal(maskEmail(EMAIL_DISPLAY_FALLBACK), EMAIL_DISPLAY_FALLBACK);
  // A raw local part ending in `*` masks the same as its stripped form.
  assert.equal(maskEmail("a*@example.com"), "a***@example.com");
});

test("maskEmail strips `*` from visible characters so the result passes the projection-gate shape", () => {
  // B2-6 P3-1: a `*` inside the local part must never land in the
  // visible segment, or the masked value fails isMaskedEmailDisplay.
  assert.equal(maskEmail("a*b@example.com"), "ab***@example.com");
  assert.equal(isMaskedEmailDisplay(maskEmail("a*b@example.com")), true);
  // A local part made only of `*` has no visible character: the
  // fallback is returned, and the gate accepts the fallback.
  assert.equal(maskEmail("*@example.com"), EMAIL_DISPLAY_FALLBACK);
  assert.equal(isMaskedEmailDisplay(maskEmail("*@example.com")), true);
  assert.equal(maskEmail(maskEmail("a*b@example.com")), "ab***@example.com");
  assert.equal(maskEmail(maskEmail("*@example.com")), EMAIL_DISPLAY_FALLBACK);
});

test("maskEmail is deterministic for the same input", () => {
  assert.equal(maskEmail("li@example.com"), maskEmail("li@example.com"));
  assert.equal(maskEmail("LI@Example.COM"), maskEmail("li@example.com"));
});

test("maskEmailOrKeep masks emails and passes other labels through", () => {
  assert.equal(maskEmailOrKeep("li@example.com"), "li***@example.com");
  assert.equal(maskEmailOrKeep("Portal User 001"), "Portal User 001");
  assert.equal(maskEmailOrKeep("user_safe_ref"), "user_safe_ref");
  assert.equal(maskEmailOrKeep("acct_123"), "acct_123");
  assert.equal(maskEmailOrKeep(""), "");
  assert.equal(maskEmailOrKeep(null), null);
  assert.equal(maskEmailOrKeep(undefined), undefined);
});

test("isMaskedEmailDisplay accepts masked values and the fallback only", () => {
  assert.equal(isMaskedEmailDisplay("li***@example.com"), true);
  assert.equal(isMaskedEmailDisplay("a***@example.com"), true);
  assert.equal(isMaskedEmailDisplay("user_account"), true);
  assert.equal(isMaskedEmailDisplay("li@example.com"), false);
  assert.equal(isMaskedEmailDisplay("***@example.com"), false);
  assert.equal(isMaskedEmailDisplay("li***@example"), false);
  assert.equal(isMaskedEmailDisplay(""), false);
  assert.equal(isMaskedEmailDisplay(null), false);
});
