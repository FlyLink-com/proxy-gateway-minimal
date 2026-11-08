// Step 6 local verification (VM-internal, per Yi's 2026-11-08 direction).
// End-to-end scenarios against the Auth0-shaped mock tenants. Everything is
// synthetic; no real tenant exists. The record file lists what only a real
// tenant can prove.
import test from "node:test";
import assert from "node:assert/strict";
import { createMockTenant, totpAt } from "./mock-auth0.mjs";
import { legacyEnroll } from "./auth0-scrypt-import-validator.mjs";
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

test("S1: import pipeline applies the gate per account (import / reset / hold / advisory)", () => {
  const byRef = Object.fromEntries(importReport.map((r) => [r.accountRef, r]));
  assert.equal(byRef.alice.action, "imported");
  assert.equal(byRef.bob.action, "reset_required");
  assert.equal(byRef.carol.action, "held_no_attestation");
  assert.equal(byRef.dave.action, "imported");
  assert.deepEqual(byRef.dave.advisories, ["edge_whitespace_r1_notice"]);
  assert.equal(portal.inspectUser("alice@synthetic.test").storedForm, "custom_password_hash:scrypt");
  assert.equal(portal.inspectUser("bob@synthetic.test").credentialKind, null, "no credential was imported for bob");
  assert.equal(portal.inspectUser("carol@synthetic.test"), undefined, "held accounts are not imported at all");
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

test("S3: R1 in-tenant reality — the spaced form fails, the trimmed form the hash was built from succeeds", () => {
  assert.equal(portal.login("dave@synthetic.test", DAVE_TYPED).outcome, "invalid_credentials");
  assert.equal(portal.login("dave@synthetic.test", "dave-pw").outcome, "ok");
});

test("S4: reset-required flow — old password never logs in; an over-72 replacement is refused; a valid reset restores access", () => {
  assert.equal(portal.login("bob@synthetic.test", BOB_PW).outcome, "reset_required");
  assert.throws(() => portal.completeReset("bob@synthetic.test", "n".repeat(73)), /reset_password_over_72_bytes/);
  assert.equal(portal.completeReset("bob@synthetic.test", "bob-new-pw"), true);
  assert.equal(portal.login("bob@synthetic.test", "bob-new-pw").outcome, "ok");
  assert.equal(portal.login("bob@synthetic.test", BOB_PW).outcome, "invalid_credentials");
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
  const { context } = portal.login("alice@synthetic.test", ALICE_PW);
  portal.revokeSession(context.sessionRef);
  assert.equal(portal.isSessionRevoked(context.sessionRef), true);
  assert.equal(admin.isSessionRevoked(context.sessionRef), false);
});
