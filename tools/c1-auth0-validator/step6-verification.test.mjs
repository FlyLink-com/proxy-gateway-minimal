// Step 6 local verification (VM-internal, per Yi's 2026-11-08 direction).
// End-to-end scenarios against the Auth0-shaped mock tenants. Everything is
// synthetic; no real tenant exists. The record file lists what only a real
// tenant can prove.
import test from "node:test";
import assert from "node:assert/strict";
import { createMockTenant, totpAt } from "./mock-auth0.mjs";
import { legacyEnroll, toAuth0CustomPasswordHash, simulateAuth0ScryptVerify } from "./auth0-scrypt-import-validator.mjs";
import { buildAttestationRecord } from "./login-attestation.mjs";
import { validateSurfaceActorContext, SURFACES } from "./tenant-isolation.mjs";

const NOW = 1794000000000;
const salt = Buffer.alloc(16, 7);
const portal = createMockTenant({ tenantRef: "portal-dev", issuerRef: SURFACES.portal.issuerRef, nowFn: () => NOW });
const admin = createMockTenant({ tenantRef: "admin-dev", issuerRef: SURFACES.admin.issuerRef, nowFn: () => NOW });

const ALICE_PW = "alice-portal-pw-1";
const BOB_PW = "b".repeat(80);
const DAVE_TYPED = "  dave-pw  ";
const attest = (accountRef, presentedPassword) =>
  buildAttestationRecord({ accountRef, presentedPassword, attestedAtMs: NOW });

const importReport = portal.importLegacyAccounts([
  { accountRef: "alice", email: "alice@synthetic.test", envelope: legacyEnroll(ALICE_PW, salt), attestation: attest("alice", ALICE_PW) },
  { accountRef: "bob", email: "bob@synthetic.test", envelope: legacyEnroll(BOB_PW, salt), attestation: attest("bob", BOB_PW) },
  { accountRef: "carol", email: "carol@synthetic.test", envelope: legacyEnroll("carol-pw", salt), attestation: undefined },
  { accountRef: "dave", email: "dave@synthetic.test", envelope: legacyEnroll(DAVE_TYPED, salt), attestation: attest("dave", DAVE_TYPED) }
]);
admin.importLegacyAccounts([
  { accountRef: "root", email: "root@synthetic.test", envelope: legacyEnroll("admin-pw-strong", salt), attestation: attest("root", "admin-pw-strong") }
]);

test("S0: TOTP implementation matches the RFC 6238 known-answer vector", () => {
  // Seed "12345678901234567890" (SHA-1 suite), T = 59s -> 94287082 (8 digits).
  assert.equal(totpAt("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59000), "287082");
});

test("S1: import pipeline applies the gate per account (import / reset / no-proof hold / R1 implementation-proof hold)", () => {
  const byRef = Object.fromEntries(importReport.map((r) => [r.accountRef, r]));
  assert.equal(byRef.alice.action, "imported");
  assert.equal(byRef.bob.action, "reset_required");
  assert.equal(byRef.carol.action, "held_no_attestation");
  assert.equal(byRef.dave.action, "held_r1_implementation_proof");
  assert.deepEqual(byRef.dave.advisories, ["edge_whitespace_client_compatibility_proof_required"]);
  assert.equal(portal.inspectUser("alice@synthetic.test").storedForm, "custom_password_hash:scrypt");
  assert.equal(portal.inspectUser("bob@synthetic.test").credentialKind, null, "no credential was imported for bob");
  assert.equal(portal.inspectUser("carol@synthetic.test"), undefined, "held accounts are not imported at all");
  assert.equal(portal.inspectUser("dave@synthetic.test"), undefined, "R1 cohort is not imported before an owner decision");
});

test("attestation must belong to the target account; a cross-account record fails before any import", () => {
  const isolated = createMockTenant({
    tenantRef: "attestation-binding-dev",
    issuerRef: "flylink-portal-attestation-binding",
    nowFn: () => NOW
  });
  const mismatched = attest("source-account", "short-safe-password");
  assert.throws(() => isolated.importLegacyAccounts([{
    accountRef: "target-account",
    email: "target@synthetic.test",
    envelope: legacyEnroll("z".repeat(73), salt),
    attestation: mismatched
  }]), /attestation_account_ref_mismatch/);
  assert.equal(isolated.inspectUser("target@synthetic.test"), undefined);
});

test("S2: first login verifies against scrypt, then the stored form becomes bcrypt; token + context are sound", () => {
  assert.equal(portal.login("alice@synthetic.test", "wrong-pw").outcome, "invalid_credentials");
  assert.equal(portal.inspectUser("alice@synthetic.test").storedForm, "custom_password_hash:scrypt",
    "a failed login must not trigger the rehash");
  const first = portal.login("alice@synthetic.test", ALICE_PW);
  assert.equal(first.outcome, "ok");
  assert.equal(portal.inspectUser("alice@synthetic.test").storedForm, "bcrypt:$2b$",
    "after the first successful login the credential is stored as bcrypt");
  assert.equal(portal.login("alice@synthetic.test", ALICE_PW).outcome, "ok", "second login runs on the bcrypt form");
  assert.equal(portal.login("alice@synthetic.test", "wrong-pw").outcome, "invalid_credentials");
  const claims = portal.verifyToken(first.token, NOW);
  assert.equal(claims.iss, SURFACES.portal.issuerRef);
  assert.equal(claims.sub, "auth0|alice");
  assert.equal(validateSurfaceActorContext("portal", first.context, { nowMs: NOW }).surface, "portal");
});

test("S3: Auth0-shaped simulation confirms raw spaced form fails while the legacy-trimmed form matches", () => {
  const importedShape = toAuth0CustomPasswordHash(legacyEnroll(DAVE_TYPED, salt));
  assert.equal(simulateAuth0ScryptVerify(importedShape, DAVE_TYPED), false);
  assert.equal(simulateAuth0ScryptVerify(importedShape, DAVE_TYPED.trim()), true);
});

test("S4: reset-required flow — old password never logs in; over-72 is refused; R1 trim is applied before Auth0", () => {
  assert.equal(portal.login("bob@synthetic.test", BOB_PW).outcome, "reset_required");
  assert.throws(() => portal.completeReset("bob@synthetic.test", "n".repeat(73)), /reset_password_over_72_bytes/);
  const typedResetPassword = " \t bob-new-pw \u3000";
  const normalizedResetPassword = String(typedResetPassword ?? "").trim();
  assert.equal(normalizedResetPassword, "bob-new-pw");
  assert.equal(portal.completeReset("bob@synthetic.test", normalizedResetPassword), true);
  assert.equal(portal.login("bob@synthetic.test", normalizedResetPassword).outcome, "ok");
  assert.equal(portal.login("bob@synthetic.test", typedResetPassword).outcome, "invalid_credentials",
    "the provider mock preserves the exact value received; first-party trim must happen before Auth0");
  assert.equal(portal.login("bob@synthetic.test", BOB_PW).outcome, "invalid_credentials");
});

test("batch preflight validates every import plan before the first user write", () => {
  const isolated = createMockTenant({
    tenantRef: "batch-preflight-dev",
    issuerRef: "flylink-batch-preflight",
    nowFn: () => NOW
  });
  assert.throws(() => isolated.importLegacyAccounts([
    {
      accountRef: "first",
      email: "first@synthetic.test",
      envelope: legacyEnroll("first-safe-password", salt),
      attestation: attest("first", "first-safe-password")
    },
    {
      accountRef: "second",
      email: "second@synthetic.test",
      envelope: "malformed-scrypt-envelope",
      attestation: attest("second", "second-safe-password")
    }
  ]), /legacy_scrypt_hash_invalid/);
  assert.equal(isolated.inspectUser("first@synthetic.test"), undefined,
    "a valid earlier record must not be written before a later record fails preflight");
  assert.equal(isolated.inspectUser("second@synthetic.test"), undefined);
});

test("batch preflight rejects duplicate email and accountRef keys before any user write", () => {
  const duplicateEmailTenant = createMockTenant({
    tenantRef: "batch-duplicate-email-dev",
    issuerRef: "flylink-batch-duplicate-email",
    nowFn: () => NOW
  });
  assert.throws(() => duplicateEmailTenant.importLegacyAccounts([
    {
      accountRef: "email-first",
      email: "same@synthetic.test",
      envelope: legacyEnroll("first-safe-password", salt),
      attestation: attest("email-first", "first-safe-password")
    },
    {
      accountRef: "email-second",
      email: "same@synthetic.test",
      envelope: legacyEnroll("second-safe-password", salt),
      attestation: attest("email-second", "second-safe-password")
    }
  ]), /import_batch_duplicate_email/);
  assert.equal(duplicateEmailTenant.inspectUser("same@synthetic.test"), undefined);

  const duplicateRefTenant = createMockTenant({
    tenantRef: "batch-duplicate-ref-dev",
    issuerRef: "flylink-batch-duplicate-ref",
    nowFn: () => NOW
  });
  assert.throws(() => duplicateRefTenant.importLegacyAccounts([
    {
      accountRef: "same-ref",
      email: "first@synthetic.test",
      envelope: legacyEnroll("first-safe-password", salt),
      attestation: attest("same-ref", "first-safe-password")
    },
    {
      accountRef: "same-ref",
      email: "second@synthetic.test",
      envelope: legacyEnroll("second-safe-password", salt),
      attestation: attest("same-ref", "second-safe-password")
    }
  ]), /import_batch_duplicate_account_ref/);
  assert.equal(duplicateRefTenant.inspectUser("first@synthetic.test"), undefined);
  assert.equal(duplicateRefTenant.inspectUser("second@synthetic.test"), undefined);
});

test("Auth0-side reset mock stores exactly the received value; it does not perform R1 trimming", () => {
  const provider = createMockTenant({
    tenantRef: "provider-reset-boundary-dev",
    issuerRef: "flylink-provider-reset-boundary",
    nowFn: () => NOW
  });
  provider.importLegacyAccounts([{
    accountRef: "provider-reset",
    email: "provider-reset@synthetic.test",
    envelope: legacyEnroll("p".repeat(80), salt),
    attestation: attest("provider-reset", "p".repeat(80))
  }]);
  const typedPassword = " \t provider-reset-pw \u3000";
  const normalizedPassword = String(typedPassword ?? "").trim();
  assert.equal(provider.completeReset("provider-reset@synthetic.test", typedPassword), true);
  assert.equal(provider.login("provider-reset@synthetic.test", typedPassword).outcome, "ok");
  assert.equal(provider.login("provider-reset@synthetic.test", normalizedPassword).outcome, "invalid_credentials",
    "the first-party client must normalize before the password reaches Auth0");
});

test("S5: Portal TOTP is voluntary — login works without it; enrollment in settings adds the factor only with a valid code", () => {
  const login = portal.login("alice@synthetic.test", ALICE_PW);
  assert.equal(login.outcome, "ok");
  assert.deepEqual([...login.context.factors], ["password"], "no totp factor, and Portal does not require one");
  assert.throws(() => portal.stepUpTotp(login.context, "123456", NOW), /totp_not_enrolled/);
  const { secretBase32 } = portal.enrollTotp("alice");
  assert.throws(() => portal.stepUpTotp(login.context, "000000", NOW), /totp_code_invalid/);
  const upgraded = portal.stepUpTotp(login.context, totpAt(secretBase32, NOW), NOW);
  assert.deepEqual([...upgraded.factors], ["password", "totp"]);
});

test("S6: Admin is mandatory — password alone never yields an admin context; enrollment is per-tenant", () => {
  const login = admin.login("root@synthetic.test", "admin-pw-strong");
  assert.equal(login.outcome, "ok");
  assert.throws(() => validateSurfaceActorContext("admin", login.context, { nowMs: NOW }),
    /identity_actor_required_factor_missing/);
  // Enrolling the same person in the PORTAL tenant does not help here.
  portal.enrollTotp("root");
  assert.equal(admin.hasTotp("root"), false);
  assert.throws(() => admin.stepUpTotp(login.context, "123456", NOW), /totp_not_enrolled/);
  const { secretBase32 } = admin.enrollTotp("root");
  const upgraded = admin.stepUpTotp(login.context, totpAt(secretBase32, NOW), NOW);
  assert.equal(validateSurfaceActorContext("admin", upgraded, { nowMs: NOW }).surface, "admin");
});

test("S7: tenant isolation — users, tokens and issuers do not cross", () => {
  assert.equal(admin.login("alice@synthetic.test", ALICE_PW).outcome, "invalid_credentials",
    "a portal user does not exist in the admin tenant");
  const portalLogin = portal.login("alice@synthetic.test", ALICE_PW);
  assert.throws(() => admin.verifyToken(portalLogin.token, NOW), /token_issuer_mismatch/);
  assert.throws(() => validateSurfaceActorContext("admin", portalLogin.context, { nowMs: NOW }),
    /identity_issuer_not_allowed/);
});

test("S8: token integrity — a re-encoded payload with the original signature is rejected; expiry is enforced", () => {
  const { token } = portal.login("alice@synthetic.test", ALICE_PW);
  const [header, , signature] = token.split(".");
  const forgedPayload = Buffer.from(JSON.stringify({
    iss: SURFACES.portal.issuerRef, aud: "flylink-control-plane", sub: "auth0|mallory",
    iat: Math.floor(NOW / 1000), exp: Math.floor(NOW / 1000) + 600, sid: "sess-forged", amr: ["password", "totp"]
  })).toString("base64url");
  assert.throws(() => portal.verifyToken(`${header}.${forgedPayload}.${signature}`, NOW), /token_signature_invalid/);
  assert.throws(() => portal.verifyToken(token, NOW + 601000), /token_expired/);
});

test("S9: session revocation is scoped to the issuing tenant", () => {
  const { context, token } = portal.login("alice@synthetic.test", ALICE_PW);
  assert.equal(portal.verifyToken(token, NOW).sid, context.sessionRef,
    "the token is valid before its session is revoked");
  portal.revokeSession(context.sessionRef);
  assert.equal(portal.isSessionRevoked(context.sessionRef), true);
  assert.equal(admin.isSessionRevoked(context.sessionRef), false);
  assert.throws(() => portal.verifyToken(token, NOW), /token_revoked/,
    "the issuing tenant verifier must reject a token after its session is revoked");
});
