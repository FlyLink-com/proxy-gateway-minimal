import { describe, expect, test } from "vitest";
import { EMAIL_DISPLAY_FALLBACK, maskEmail, maskEmailOrKeep } from "../features/user-portal/email-masking";
import { createTotpCode } from "../features/user-portal/totp-preview";
import { createLocalUserPortalClient } from "../features/user-portal/user-portal-preview-client";

// Mirror of server/tests/email-masking.test.mjs: the local preview client
// uses this module where there is no server to mask for it. The vectors
// must stay identical to the server module's.
describe("maskEmail", () => {
  test("keeps the first two local characters and the full domain", () => {
    expect(maskEmail("li@example.com")).toBe("li***@example.com");
    expect(maskEmail("local-user@example.test")).toBe("lo***@example.test");
  });

  test("keeps a short local part whole before the mask", () => {
    expect(maskEmail("a@example.com")).toBe("a***@example.com");
    expect(maskEmail("ab@example.com")).toBe("ab***@example.com");
  });

  test("trims and lowercases before masking", () => {
    expect(maskEmail("  LI@GMAIL.COM  ")).toBe("li***@gmail.com");
  });

  test("drops a subaddress tag before masking", () => {
    expect(maskEmail("user+tag@example.com")).toBe("us***@example.com");
    expect(maskEmail("a+b@example.com")).toBe("a***@example.com");
  });

  test("keeps non-ASCII characters and never converts the domain", () => {
    expect(maskEmail("müller@münchen.de")).toBe("mü***@münchen.de");
  });

  test("masks an overlong local part instead of failing", () => {
    expect(maskEmail(`${"a".repeat(100)}@example.com`)).toBe("aa***@example.com");
  });

  test("returns the fallback for invalid input and never throws", () => {
    for (const invalid of [null, undefined, "", "   ", 42, true, {}, [], "not-an-email", "a@b", "@example.com"]) {
      expect(maskEmail(invalid)).toBe(EMAIL_DISPLAY_FALLBACK);
    }
    expect(EMAIL_DISPLAY_FALLBACK).toBe("user_account");
  });

  test("is idempotent on its own output", () => {
    for (const email of ["li@example.com", "a@example.com", "user+tag@example.com", "müller@münchen.de"]) {
      const masked = maskEmail(email);
      expect(maskEmail(masked)).toBe(masked);
    }
    expect(maskEmail(EMAIL_DISPLAY_FALLBACK)).toBe(EMAIL_DISPLAY_FALLBACK);
    expect(maskEmail("a*@example.com")).toBe("a***@example.com");
  });

  test("strips `*` from visible characters so no `*` lands in the visible segment", () => {
    // B2-6 P3-1 mirror of server/tests/email-masking.test.mjs: the
    // visible segment must never contain `*`, or the masked value
    // fails the projection-gate shape check.
    expect(maskEmail("a*b@example.com")).toBe("ab***@example.com");
    expect(maskEmail("a*@example.com")).toBe("a***@example.com");
    // A local part made only of `*` has no visible character: fall back.
    expect(maskEmail("*@example.com")).toBe(EMAIL_DISPLAY_FALLBACK);
    expect(maskEmail(maskEmail("a*b@example.com"))).toBe("ab***@example.com");
    expect(maskEmail(maskEmail("*@example.com"))).toBe(EMAIL_DISPLAY_FALLBACK);
  });
});

describe("maskEmailOrKeep", () => {
  test("masks emails and passes other labels through", () => {
    expect(maskEmailOrKeep("li@example.com")).toBe("li***@example.com");
    expect(maskEmailOrKeep("Portal User 001")).toBe("Portal User 001");
    expect(maskEmailOrKeep("portal_user_001")).toBe("portal_user_001");
    expect(maskEmailOrKeep("")).toBe("");
    expect(maskEmailOrKeep(null)).toBe(null);
    expect(maskEmailOrKeep(undefined)).toBe(undefined);
  });
});

describe("local preview second-factor completion", () => {
  test("masks the session displayName after authenticator second-factor completion", async () => {
    // B2-6 P2-1: completeSecondFactor must not fall back to the raw
    // email as displayName; the raw email stays the internal userRef.
    const now = new Date("2026-06-03T00:00:00.000Z");
    const secret = ["JBSW", "Y3DP", "EHPK", "3PXP"].join("");
    const client = createLocalUserPortalClient({
      now: () => now,
      totpSecretFactory: () => secret,
      initialAccounts: [{
        userRef: "local-user@example.test",
        displayName: "local-user@example.test",
        issuedAt: "2026-06-03T00:00:00.000Z",
        requireSecuritySetup: false
      }]
    });
    const enrollment = await client.startAuthenticatorEnrollment({ userRef: "local-user@example.test" });
    await client.confirmAuthenticatorEnrollment({
      userRef: "local-user@example.test",
      enrollmentRef: enrollment.enrollmentRef,
      totpCode: await createTotpCode(secret, now)
    });
    const challenge = await client.authenticate({
      mode: "password",
      accountId: "local-user@example.test",
      password: "user-password",
      humanVerification: { challengeId: "local-math-v1:4+6", challengeAnswer: "10", honeypot: "" }
    });
    if (challenge.status !== "second_factor_required") {
      throw new Error("expected second-factor challenge");
    }
    const session = await client.completeSecondFactor({
      challengeRef: challenge.challengeRef,
      factor: "authenticator",
      totpCode: await createTotpCode(secret, now)
    });
    // The display value is masked; userRef stays the raw email on
    // purpose (internal session key, never rendered — the page shows
    // displayName), so no whole-object raw-email check applies here.
    expect(session.displayName).toBe("lo***@example.test");
    expect(session.userRef).toBe("local-user@example.test");
  });
});
