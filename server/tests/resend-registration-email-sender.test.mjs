import assert from "node:assert/strict";
import test from "node:test";
import { createResendRegistrationEmailSender } from "../services/platform/resend-registration-email-sender.mjs";

const BASE_MESSAGE = {
  email: "New.User@example.test",
  code: "246810",
  purpose: "portal_registration",
  verificationRef: "reg_email_test_ref",
  expiresAt: "2026-07-01T10:00:00.000Z"
};

test("Resend registration sender posts a safe verification email payload", async () => {
  let captured;
  const sender = createResendRegistrationEmailSender({
    apiKey: "synthetic-resend-api-key",
    from: "GCC WebOS <verify@mail.gccwebos.com>",
    replyTo: "support@gccwebos.com",
    fetchFn: async (url, init) => {
      captured = { url, init };
      return {
        ok: true,
        json: async () => ({ id: "email_registration_test_1" })
      };
    }
  });

  const result = await sender.sendRegistrationEmailVerification(BASE_MESSAGE);

  assert.equal(result.provider, "resend");
  assert.equal(result.messageId, "email_registration_test_1");
  assert.equal(captured.url, "https://api.resend.com/emails");
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.headers.Authorization, "Bearer synthetic-resend-api-key");
  assert.equal(captured.init.headers["Content-Type"], "application/json");
  assert.equal(captured.init.headers["User-Agent"], "proxy-gateway-minimal/registration-email");
  assert.equal(captured.init.headers["Idempotency-Key"], "portal-registration-email-reg_email_test_ref");

  const body = JSON.parse(captured.init.body);
  assert.equal(body.from, "GCC WebOS <verify@mail.gccwebos.com>");
  assert.deepEqual(body.to, ["new.user@example.test"]);
  assert.equal(body.reply_to, "support@gccwebos.com");
  assert.equal(body.subject, "GCC WebOS registration verification code");
  assert.match(body.text, /246810/);
  assert.match(body.html, /246810/);
  assert.doesNotMatch(body.text, /reg_email_test_ref|synthetic-resend-api-key/);
  assert.deepEqual(body.tags, [
    { name: "purpose", value: "portal_registration" },
    { name: "kind", value: "registration_verification" }
  ]);
});

test("Resend registration sender fails closed when config is incomplete", async () => {
  let called = false;
  const sender = createResendRegistrationEmailSender({
    apiKey: "",
    from: "GCC WebOS <verify@mail.gccwebos.com>",
    fetchFn: async () => {
      called = true;
    }
  });

  await assert.rejects(
    () => sender.sendRegistrationEmailVerification(BASE_MESSAGE),
    { code: "email_verification_unavailable" }
  );
  assert.equal(called, false);
  assert.equal(sender.isConfigured(), false);
});

test("Resend registration sender maps provider failures to a safe unavailable error", async () => {
  const sender = createResendRegistrationEmailSender({
    apiKey: "synthetic-resend-api-key",
    from: "GCC WebOS <verify@mail.gccwebos.com>",
    fetchFn: async () => ({
      ok: false,
      status: 403,
      json: async () => ({
        message: "provider detail that must not be echoed"
      })
    })
  });

  await assert.rejects(
    () => sender.sendRegistrationEmailVerification(BASE_MESSAGE),
    (error) => {
      assert.equal(error.code, "email_verification_unavailable");
      assert.doesNotMatch(error.message, /403|provider detail|synthetic-resend-api-key|246810/);
      return true;
    }
  );
});

test("Resend registration sender maps network failures to a safe unavailable error", async () => {
  const sender = createResendRegistrationEmailSender({
    apiKey: "synthetic-resend-api-key",
    from: "GCC WebOS <verify@mail.gccwebos.com>",
    fetchFn: async () => {
      throw new Error("network detail that must not be echoed");
    }
  });

  await assert.rejects(
    () => sender.sendRegistrationEmailVerification(BASE_MESSAGE),
    (error) => {
      assert.equal(error.code, "email_verification_unavailable");
      assert.doesNotMatch(error.message, /network detail|synthetic-resend-api-key|246810/);
      return true;
    }
  );
});
