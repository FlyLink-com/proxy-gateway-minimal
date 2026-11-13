/**
 * Auth0 Post-Login Action 1 — Admin MFA enrollment/challenge.
 *
 * SOURCE TEMPLATE ONLY. Bind only in the Admin tenant, after verifying that
 * "Customize MFA Factors using Actions" is enabled and this Action uses the
 * post-login trigger v3 (or newer). Missing enrollment state is a tenant
 * configuration failure, never evidence that the user has no MFA factors.
 */
const ADMIN_MFA_EXISTING_FACTOR_TYPES = new Set([
  "phone",
  "push-notification",
  "webauthn-platform",
  "webauthn-roaming",
]);

exports.onExecutePostLogin = async (event, api) => {
  const adminClientId = event.secrets.ADMIN_CLIENT_ID;
  if (!adminClientId || event.client.client_id !== adminClientId) {
    api.access.deny("admin_client_not_authorized");
    return;
  }

  // No refresh-token grant may create or renew Admin assurance.
  if (event.transaction?.protocol === "oauth2-refresh-token") {
    api.access.deny("admin_reauthentication_required");
    return;
  }

  // Auth0 only populates this field when "Customize MFA Factors using Actions"
  // is enabled. Do not collapse an unavailable field into an empty enrollment
  // list: that would misclassify a tenant configuration error as user state.
  const enrolledFactors = event.user?.enrolledFactors;
  if (!Array.isArray(enrolledFactors)
    || enrolledFactors.some((factor) => !factor || typeof factor.type !== "string" || !factor.type)) {
    api.access.deny("admin_mfa_enrollment_state_unavailable");
    return;
  }

  const factorTypes = [...new Set(enrolledFactors.map((factor) => factor.type))];
  const hasOtp = factorTypes.includes("otp") || factorTypes.includes("totp");
  if (hasOtp) {
    // The following Assertion Action runs only after this OTP challenge succeeds.
    api.authentication.challengeWith({ type: "otp" });
    return;
  }

  // Auth0 treats email as an implicit factor and does not require it to be
  // challenged before enrolling a stronger factor. Any other existing factor
  // must be challenged before adding OTP; only explicitly supported factor
  // types are forwarded to the provider API.
  const existingFactors = [...new Set(factorTypes.filter((type) => type !== "email"))].sort();
  if (existingFactors.some((type) => !ADMIN_MFA_EXISTING_FACTOR_TYPES.has(type))) {
    api.access.deny("admin_mfa_existing_factor_unsupported");
    return;
  }

  if (existingFactors.length > 0) {
    api.authentication.challengeWithAny(existingFactors.map((type) => ({ type })));
  }

  // Enrollment and authentication are distinct Auth0 operations. Enrolling
  // OTP does not itself prove an MFA challenge; the Assertion Action must deny
  // this transaction unless a completed OTP MFA method is observed. The user
  // then starts a fresh login and completes the OTP challenge.
  api.transaction?.setMetadata?.("flylink_admin_otp_enrollment_required", true);
  api.authentication.enrollWith({ type: "otp" });
};
