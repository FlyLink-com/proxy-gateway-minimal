/**
 * Auth0 Post-Login Action 2 — assert completed Admin MFA and issue proof claim.
 *
 * SOURCE TEMPLATE ONLY. It must be a separate Action ordered AFTER
 * admin-mfa-challenge.js. Do not deploy/bind without separate authorization.
 */
exports.onExecutePostLogin = async (event, api) => {
  const adminClientId = event.secrets.ADMIN_CLIENT_ID;
  const claimUri = event.secrets.ADMIN_MFA_CLAIM_URI;
  if (!adminClientId || event.client.client_id !== adminClientId
    || typeof claimUri !== "string" || !claimUri.startsWith("https://")) {
    api.access.deny("admin_authentication_policy_unavailable");
    return;
  }

  if (event.transaction?.protocol === "oauth2-refresh-token") {
    api.access.deny("admin_reauthentication_required");
    return;
  }

  const methods = Array.isArray(event.authentication?.methods)
    ? event.authentication.methods
    : [];
  const completed = methods
    .filter((method) => method && method.name === "mfa" && method.type === "otp"
      && typeof method.timestamp === "string")
    .map((method) => ({ ...method, at: Date.parse(method.timestamp) }))
    .filter((method) => Number.isSafeInteger(method.at)
      && method.at <= Date.now() + 30000
      && Date.now() - method.at <= 5 * 60 * 1000)
    .sort((a, b) => b.at - a.at)[0];

  if (!completed) {
    api.access.deny("admin_mfa_completion_not_proven");
    return;
  }

  // This signed Access Token claim is emitted only after the preceding
  // challengeWith Action completed. The Worker still verifies JWT/JWKS,
  // audience, client, scope, subject binding and freshness independently.
  api.accessToken.setCustomClaim(claimUri, {
    method: "otp",
    completed_at: new Date(completed.at).toISOString(),
  });
};
