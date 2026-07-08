const RESEND_EMAILS_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_USER_AGENT = "proxy-gateway-minimal/registration-email";

function senderError(message) {
  const error = new Error(message);
  error.code = "email_verification_unavailable";
  return error;
}

function optionalText(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  const email = optionalText(value).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw senderError("registration email verification payload is invalid");
  }
  return email;
}

function normalizePurpose(value) {
  const purpose = optionalText(value) || "portal_registration";
  return purpose.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 256) || "portal_registration";
}

function normalizeVerificationRef(value) {
  const ref = optionalText(value).replace(/[^a-zA-Z0-9_.:-]/g, "_");
  return ref.slice(0, 220) || "registration_email";
}

function htmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildVerificationText({ code, expiresAt }) {
  return [
    `Your GCC WebOS registration verification code is ${code}.`,
    `This code expires at ${expiresAt}.`,
    "If you did not request this code, you can ignore this email."
  ].join("\n");
}

function buildVerificationHtml({ code, expiresAt }) {
  const safeCode = htmlEscape(code);
  const safeExpiresAt = htmlEscape(expiresAt);
  return [
    "<p>Your GCC WebOS registration verification code is:</p>",
    `<p style="font-size:24px;font-weight:700;letter-spacing:4px">${safeCode}</p>`,
    `<p>This code expires at ${safeExpiresAt}.</p>`,
    "<p>If you did not request this code, you can ignore this email.</p>"
  ].join("");
}

export function createResendRegistrationEmailSender(options = {}) {
  const apiKey = optionalText(options.apiKey);
  const from = optionalText(options.from);
  const replyTo = optionalText(options.replyTo);
  const endpoint = optionalText(options.endpoint) || RESEND_EMAILS_ENDPOINT;
  const userAgent = optionalText(options.userAgent) || DEFAULT_USER_AGENT;
  const fetchFn = options.fetchFn || globalThis.fetch;

  function isConfigured() {
    return Boolean(apiKey && from && typeof fetchFn === "function");
  }

  async function sendRegistrationEmailVerification(message = {}) {
    if (!isConfigured()) {
      throw senderError("registration email verification sender is not configured");
    }

    const email = normalizeEmail(message.email);
    const code = optionalText(message.code);
    const expiresAt = optionalText(message.expiresAt);
    const verificationRef = normalizeVerificationRef(message.verificationRef);
    const purpose = normalizePurpose(message.purpose);

    if (!/^\d{6}$/.test(code) || !expiresAt) {
      throw senderError("registration email verification payload is invalid");
    }

    const payload = {
      from,
      to: [email],
      subject: "GCC WebOS registration verification code",
      text: buildVerificationText({ code, expiresAt }),
      html: buildVerificationHtml({ code, expiresAt }),
      tags: [
        { name: "purpose", value: purpose },
        { name: "kind", value: "registration_verification" }
      ]
    };

    if (replyTo) {
      payload.reply_to = replyTo;
    }

    let response;
    try {
      response = await fetchFn(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `portal-registration-email-${verificationRef}`,
          "User-Agent": userAgent
        },
        body: JSON.stringify(payload)
      });
    } catch {
      throw senderError("registration email verification sender failed");
    }

    if (!response?.ok) {
      throw senderError("registration email verification sender failed");
    }

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    return {
      provider: "resend",
      messageId: optionalText(data?.id) || null
    };
  }

  return {
    provider: "resend",
    isConfigured,
    sendRegistrationEmailVerification
  };
}
