/**
 * Auth0 Post-Login Action 1 — Admin MFA challenge.
 *
 * SOURCE TEMPLATE ONLY. Do not deploy/bind until the hosted Universal Login
 * behavior has been reviewed and the non-production tenant change is separately
 * authorized. Bind only in the Admin tenant.
 */
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

  const enrolled = Array.isArray(event.user.enrolledFactors)
    ? event.user.enrolledFactors
    : [];
  if (!enrolled.some((factor) => factor && factor.type === "otp")) {
    // Enrollment/recovery is a separate owner-controlled onboarding process.
    api.access.deny("admin_mfa_enrollment_required");
    return;
  }

  // New Action API pauses this login transaction. A later Post-Login Action
  // can observe the completed MFA method in event.authentication.methods.
  api.authentication.challengeWith({ type: "otp" });
};
