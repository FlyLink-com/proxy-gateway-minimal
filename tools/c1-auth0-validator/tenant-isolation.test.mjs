// Synthetic verification for step 5: Portal/Admin isolation + TOTP compatibility.
// Exercises the approved primitives at PR #842's head (bc3f8c9a) through the
// step-5 surface contract. All identities, keys and secrets are synthetic.
import test from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, randomBytes } from "node:crypto";
import { SURFACES, validateSurfaceActorContext, createSessionRevocationRegistry } from "./tenant-isolation.mjs";
import {
  createD1IdentityBindingRecord, resolveD1IdentityBinding, planD1IdentityBinding
} from "../../server/services/platform/d1-t2-identity-boundary.mjs";
import {
  createD1KeyRing, createD1TotpSecretProtector, reencryptLegacyD1TotpV2, assertDistinctD1KeyRingSet
} from "../../server/services/platform/d1-t2-security-primitives.mjs";

const NOW = 1794000000000;
const PORTAL = SURFACES.portal.issuerRef;
const ADMIN = SURFACES.admin.issuerRef;

function ctx({ issuerRef, factors = ["password"], subjectRef = "auth0|user-1", accountRef = "acct-1", sessionRef = "sess-00000001" }) {
  return {
    accountRef, audience: "flylink-control-plane",
    authTimeMs: NOW - 1000, expiresAtMs: NOW + 60000,
    factors, issuerRef, sessionRef, subjectRef
  };
}

test("portal context validates on the portal surface", () => {
  const result = validateSurfaceActorContext("portal", ctx({ issuerRef: PORTAL }), { nowMs: NOW });
  assert.equal(result.surface, "portal");
  assert.equal(result.context.issuerRef, PORTAL);
});

test("a portal-issued context is rejected on the admin surface even when it carries a totp factor", () => {
  // Factor possession can never compensate for a foreign issuer.
  assert.throws(
    () => validateSurfaceActorContext("admin", ctx({ issuerRef: PORTAL, factors: ["password", "totp"] }), { nowMs: NOW }),
    /identity_issuer_not_allowed/
  );
});

test("admin surface mandates the totp factor; portal surface does not", () => {
  assert.throws(
    () => validateSurfaceActorContext("admin", ctx({ issuerRef: ADMIN, factors: ["password"] }), { nowMs: NOW }),
    /identity_actor_required_factor_missing/
  );
  const ok = validateSurfaceActorContext("admin", ctx({ issuerRef: ADMIN, factors: ["password", "totp"] }), { nowMs: NOW });
  assert.equal(ok.surface, "admin");
});

test("isolation is symmetric: an admin-issued context is rejected on the portal surface", () => {
  assert.throws(
    () => validateSurfaceActorContext("portal", ctx({ issuerRef: ADMIN, factors: ["password", "totp"] }), { nowMs: NOW }),
    /identity_issuer_not_allowed/
  );
  assert.throws(() => validateSurfaceActorContext("sso", ctx({ issuerRef: PORTAL }), { nowMs: NOW }), /surface_unknown/);
});

test("identity bindings are scoped by issuer: a portal binding is invisible to the admin surface", () => {
  const subjectRef = "auth0|shared-subject";
  const portalBinding = createD1IdentityBindingRecord({
    accountRef: "acct-portal-1", issuerRef: PORTAL, subjectRef,
    status: "active", createdAtMs: 1, updatedAtMs: 1, revokedAtMs: null
  });
  assert.deepEqual(
    resolveD1IdentityBinding({ bindings: [portalBinding], issuerRef: PORTAL, subjectRef }),
    { outcome: "resolved", accountRef: "acct-portal-1" }
  );
  assert.deepEqual(
    resolveD1IdentityBinding({ bindings: [portalBinding], issuerRef: ADMIN, subjectRef }),
    { outcome: "not_found" }
  );
  // The same subject can be bound independently on the admin surface;
  // the portal binding neither satisfies nor blocks it.
  const planned = planD1IdentityBinding({
    existingBindings: [portalBinding],
    incomingRecord: {
      accountRef: "acct-admin-1", issuerRef: ADMIN, subjectRef,
      status: "active", createdAtMs: 2, updatedAtMs: 2, revokedAtMs: null
    }
  });
  assert.equal(planned.outcome, "create");
});

test("session revocation is scoped per issuer: revoking on portal does not touch admin", () => {
  const registry = createSessionRevocationRegistry();
  registry.revoke({ issuerRef: PORTAL, sessionRef: "sess-shared-name" });
  assert.equal(registry.isRevoked({ issuerRef: PORTAL, sessionRef: "sess-shared-name" }), true);
  assert.equal(registry.isRevoked({ issuerRef: ADMIN, sessionRef: "sess-shared-name" }), false);
  assert.equal(registry.size(), 1);
});

const SECRET = "JBSWY3DPEHPK3PXP";
const portalRing = () => createD1KeyRing({
  family: "portal-totp-aes", activeKeyId: "portal-k1", readKeyIds: ["portal-k1"],
  keys: { "portal-k1": Buffer.alloc(32, 11) }
});
const adminRing = () => createD1KeyRing({
  family: "admin-totp-aes", activeKeyId: "admin-k1", readKeyIds: ["admin-k1"],
  keys: { "admin-k1": Buffer.alloc(32, 22) }
});

test("TOTP key families are distinct, scope-bound, and cross-surface unprotect fails", async () => {
  const portal = portalRing();
  const admin = adminRing();
  assert.equal(assertDistinctD1KeyRingSet([portal, admin]), true);
  // Same key material reused across families is detected and rejected.
  const reused = createD1KeyRing({
    family: "admin-totp-aes", activeKeyId: "admin-k2", readKeyIds: ["admin-k2"],
    keys: { "admin-k2": Buffer.alloc(32, 11) }
  });
  assert.throws(() => assertDistinctD1KeyRingSet([portal, reused]), /key_family_reuse_detected/);
  // A protector cannot be constructed across scope/family lines.
  assert.throws(() => createD1TotpSecretProtector({ keyRing: admin, scope: "portal" }), /key_family_mismatch/);

  const portalProtector = createD1TotpSecretProtector({ keyRing: portal, scope: "portal" });
  const adminProtector = createD1TotpSecretProtector({ keyRing: admin, scope: "admin" });
  const envelope = await portalProtector.protect(SECRET, { credentialRef: "cred-1" });
  assert.equal(await portalProtector.unprotect(envelope, { credentialRef: "cred-1" }), SECRET);
  assert.equal(await adminProtector.unprotect(envelope, { credentialRef: "cred-1" }), null,
    "an admin-side protector cannot open a portal TOTP envelope");
});

function legacyV2Encrypt(base32Secret, keyBytes) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyBytes), iv);
  const ct = Buffer.concat([cipher.update(base32Secret, "utf8"), cipher.final()]);
  const b64u = (b) => Buffer.from(b).toString("base64url");
  return `v2:aes-256-gcm:${b64u(iv)}:${b64u(cipher.getAuthTag())}:${b64u(ct)}`;
}

test("legacy TOTP disposition under T1: enc: and well-formed v2: re-enroll (material never transferred), structurally broken v2 quarantines", async () => {
  const encResult = await reencryptLegacyD1TotpV2({ value: "enc:" + SECRET });
  assert.deepEqual(encResult, { status: "re_enroll_required" });

  // T1 (owner decision 2026-11-08): a well-formed legacy v2 envelope is a
  // re-enrollment candidate only. The classifier must not decrypt it or hand
  // back re-protected material — the earlier re-protect contract is void.
  const v2 = legacyV2Encrypt(SECRET, Buffer.alloc(32, 33));
  const v2Result = await reencryptLegacyD1TotpV2({ value: v2 });
  assert.deepEqual(v2Result, { status: "re_enroll_required" });
  assert.equal("envelope" in v2Result, false, "no re-protected envelope may be produced under T1");

  // A structure-preserving ciphertext flip stays "well-formed" to a
  // classifier that never decrypts — and that is safe under T1: the value
  // is discarded either way and the user re-enrolls a fresh factor. Nothing
  // is imported, trusted, or verified against the legacy material.
  const flipped = v2.slice(0, -2) + (v2.endsWith("AA") ? "BB" : "AA");
  assert.deepEqual(await reencryptLegacyD1TotpV2({ value: flipped }), { status: "re_enroll_required" });

  // Quarantine is for values that are not even structurally recognizable:
  // wrong segment count, illegal characters, or truncated segments.
  const broken = v2.split(":").slice(0, 4).join(":");
  assert.deepEqual(await reencryptLegacyD1TotpV2({ value: broken }), { status: "quarantine" });
  const illegal = "v2:aes-256-gcm:!!!:AAAA:AAAA";
  assert.deepEqual(await reencryptLegacyD1TotpV2({ value: illegal }), { status: "quarantine" });
});
