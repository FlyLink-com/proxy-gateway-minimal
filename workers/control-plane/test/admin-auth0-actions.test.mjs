import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

async function loadAction(name) {
  const source = await readFile(new URL(`../auth0-actions/${name}`, import.meta.url), "utf8");
  const sandbox = { exports: {} };
  runInNewContext(source, sandbox, { filename: name });
  assert.equal(typeof sandbox.exports.onExecutePostLogin, "function");
  return sandbox.exports.onExecutePostLogin;
}

const challengeAction = await loadAction("admin-mfa-challenge.js");
const assertionAction = await loadAction("admin-mfa-assert.js");

function makeEvent({ clientId = "admin-client", protocol = "oidc-basic-profile", enrolledFactors = [] } = {}) {
  return {
    secrets: { ADMIN_CLIENT_ID: "admin-client", ADMIN_MFA_CLAIM_URI: "https://flylink.example/mfa" },
    client: { client_id: clientId },
    transaction: { protocol, metadata: {} },
    user: { enrolledFactors },
    authentication: { methods: [] },
  };
}

function makeApi() {
  const calls = [];
  return {
    calls,
    access: { deny: (reason) => calls.push({ method: "deny", reason }) },
    authentication: {
      challengeWith: (factor) => calls.push({ method: "challengeWith", factor }),
      challengeWithAny: (factors) => calls.push({ method: "challengeWithAny", factors }),
      enrollWith: (factor) => calls.push({ method: "enrollWith", factor }),
    },
    transaction: {
      setMetadata: (key, value) => calls.push({ method: "setMetadata", key, value }),
    },
    accessToken: { setCustomClaim: (name, value) => calls.push({ method: "setCustomClaim", name, value }) },
  };
}

function assertCalls(api, expected) {
  assert.equal(JSON.stringify(api.calls), JSON.stringify(expected));
}

test("challenge Action rejects a non-Admin client before MFA operations", async () => {
  const api = makeApi();
  await challengeAction(makeEvent({ clientId: "portal-client" }), api);
  assertCalls(api, [{ method: "deny", reason: "admin_client_not_authorized" }]);
});

test("challenge Action rejects refresh-token grants before MFA operations", async () => {
  const api = makeApi();
  await challengeAction(makeEvent({ protocol: "oauth2-refresh-token" }), api);
  assertCalls(api, [{ method: "deny", reason: "admin_reauthentication_required" }]);
});

test("missing enrolledFactors is a configuration failure, not an empty enrollment", async () => {
  const event = makeEvent();
  delete event.user.enrolledFactors;
  const api = makeApi();
  await challengeAction(event, api);
  assertCalls(api, [{ method: "deny", reason: "admin_mfa_enrollment_state_unavailable" }]);
});

test("malformed enrolled-factor entries fail closed", async () => {
  const api = makeApi();
  await challengeAction(makeEvent({ enrolledFactors: [{}, null] }), api);
  assertCalls(api, [{ method: "deny", reason: "admin_mfa_enrollment_state_unavailable" }]);
});

test("an enrolled OTP user receives only an OTP challenge", async () => {
  const api = makeApi();
  await challengeAction(makeEvent({ enrolledFactors: [{ type: "otp" }] }), api);
  assertCalls(api, [{ method: "challengeWith", factor: { type: "otp" } }]);
});

test("the Management API TOTP label is normalized to the Auth0 Action OTP challenge", async () => {
  const api = makeApi();
  await challengeAction(makeEvent({ enrolledFactors: [{ type: "totp" }] }), api);
  assertCalls(api, [{ method: "challengeWith", factor: { type: "otp" } }]);
});

test("a user with no factor is enrolled without being granted MFA proof", async () => {
  const api = makeApi();
  await challengeAction(makeEvent({ enrolledFactors: [] }), api);
  assertCalls(api, [
    { method: "setMetadata", key: "flylink_admin_otp_enrollment_required", value: true },
    { method: "enrollWith", factor: { type: "otp" } },
  ]);
});

test("email-only enrollment does not block OTP enrollment", async () => {
  const api = makeApi();
  await challengeAction(makeEvent({ enrolledFactors: [{ type: "email" }] }), api);
  assertCalls(api, [
    { method: "setMetadata", key: "flylink_admin_otp_enrollment_required", value: true },
    { method: "enrollWith", factor: { type: "otp" } },
  ]);
});

test("another supported factor must be challenged before OTP enrollment", async () => {
  const api = makeApi();
  await challengeAction(makeEvent({ enrolledFactors: [{ type: "phone" }, { type: "phone" }] }), api);
  assertCalls(api, [
    { method: "challengeWithAny", factors: [{ type: "phone" }] },
    { method: "setMetadata", key: "flylink_admin_otp_enrollment_required", value: true },
    { method: "enrollWith", factor: { type: "otp" } },
  ]);
});

test("unsupported existing factors fail closed instead of being silently ignored", async () => {
  const api = makeApi();
  await challengeAction(makeEvent({ enrolledFactors: [{ type: "unknown-factor" }] }), api);
  assertCalls(api, [{ method: "deny", reason: "admin_mfa_existing_factor_unsupported" }]);
});

test("Assertion Action explicitly denies after enrollment until a fresh login proves OTP", async () => {
  const event = makeEvent();
  event.transaction.metadata.flylink_admin_otp_enrollment_required = true;
  const api = makeApi();
  await assertionAction(event, api);
  assertCalls(api, [{ method: "deny", reason: "admin_mfa_enrollment_completed_reauthenticate" }]);
});

test("Assertion Action does not issue proof when no MFA challenge was completed", async () => {
  const api = makeApi();
  await assertionAction(makeEvent(), api);
  assertCalls(api, [{ method: "deny", reason: "admin_mfa_completion_not_proven" }]);
});

test("Assertion Action issues proof only for a fresh completed OTP MFA method", async () => {
  const timestamp = new Date().toISOString();
  const event = makeEvent();
  event.authentication.methods = [{ name: "pwd", timestamp }, { name: "mfa", type: "otp", timestamp }];
  const api = makeApi();
  await assertionAction(event, api);
  assert.equal(api.calls.length, 1);
  assert.equal(api.calls[0].method, "setCustomClaim");
  assert.equal(api.calls[0].name, "https://flylink.example/mfa");
  assert.equal(api.calls[0].value.method, "otp");
  assert.equal(Date.parse(api.calls[0].value.completed_at), Date.parse(timestamp));
});

test("Assertion Action rejects a non-OTP MFA method", async () => {
  const timestamp = new Date().toISOString();
  const event = makeEvent();
  event.authentication.methods = [{ name: "mfa", type: "phone", timestamp }];
  const api = makeApi();
  await assertionAction(event, api);
  assertCalls(api, [{ method: "deny", reason: "admin_mfa_completion_not_proven" }]);
});


test("Assertion Action rejects stale and implausibly future OTP timestamps", async () => {
  for (const timestamp of [
    new Date(Date.now() - 6 * 60 * 1000).toISOString(),
    new Date(Date.now() + 60 * 1000).toISOString(),
  ]) {
    const event = makeEvent();
    event.authentication.methods = [{ name: "mfa", type: "otp", timestamp }];
    const api = makeApi();
    await assertionAction(event, api);
    assertCalls(api, [{ method: "deny", reason: "admin_mfa_completion_not_proven" }]);
  }
});

test("Assertion Action rejects refresh-token grants even when an OTP method is present", async () => {
  const timestamp = new Date().toISOString();
  const event = makeEvent({ protocol: "oauth2-refresh-token" });
  event.authentication.methods = [{ name: "mfa", type: "otp", timestamp }];
  const api = makeApi();
  await assertionAction(event, api);
  assertCalls(api, [{ method: "deny", reason: "admin_reauthentication_required" }]);
});

test("Assertion Action rejects an invalid claim namespace", async () => {
  const event = makeEvent();
  event.secrets.ADMIN_MFA_CLAIM_URI="http://flylink.example/mfa";
  const api = makeApi();
  await assertionAction(event, api);
  assertCalls(api, [{ method: "deny", reason: "admin_authentication_policy_unavailable" }]);
});
