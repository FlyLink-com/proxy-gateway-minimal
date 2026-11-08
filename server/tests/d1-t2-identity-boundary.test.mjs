import assert from "node:assert/strict";
import test from "node:test";
import {
  IDENTITY_ACTOR_CONTEXT_AUDIENCE,
  createD1IdentityBindingRecord,
  parseTrustedIdentityActorContext,
  planD1IdentityBinding,
  resolveD1IdentityBinding
} from "../services/platform/d1-t2-identity-boundary.mjs";

const NOW = 1_798_000_000_000;
const issuerRef = "portal-auth-primary";
const actor = {
  issuerRef,
  subjectRef: "auth0|synthetic-subject-001",
  accountRef: "acct_synthetic_001",
  sessionRef: "session_synthetic_0001",
  authTimeMs: NOW - 10_000,
  expiresAtMs: NOW + 60_000,
  factors: ["password", "totp"],
  audience: IDENTITY_ACTOR_CONTEXT_AUDIENCE
};

function binding(overrides = {}) {
  return createD1IdentityBindingRecord({
    accountRef: actor.accountRef,
    issuerRef,
    subjectRef: actor.subjectRef,
    status: "active",
    createdAtMs: NOW - 100_000,
    updatedAtMs: NOW - 100_000,
    revokedAtMs: null,
    ...overrides
  });
}

test("trusted actor context accepts only opaque, short-lived, gateway-projected identity", () => {
  const parsed = parseTrustedIdentityActorContext(actor, { allowedIssuers: [issuerRef], nowMs: NOW });
  assert.equal(parsed.accountRef, actor.accountRef);
  assert.equal(parsed.subjectRef, actor.subjectRef);
  assert.deepEqual(parsed.factors, ["password", "totp"]);
  assert.equal(Object.hasOwn(parsed, "email"), false);
});

test("actor context rejects raw PII, credentials and unknown fields", () => {
  for (const extra of [
    { email: "user@example.test" },
    { displayName: "Synthetic User" },
    { password: "not-a-secret" },
    { accessToken: "synthetic-token" },
    { refreshToken: "synthetic-refresh" },
    { authorizationCode: "synthetic-code" },
    { totpCode: "123456" }
  ]) {
    assert.throws(() => parseTrustedIdentityActorContext({ ...actor, ...extra }, {
      allowedIssuers: [issuerRef], nowMs: NOW
    }), { code: "identity_actor_context_schema_invalid" });
  }
});

test("actor context rejects unapproved issuer and email-shaped subject", () => {
  assert.throws(() => parseTrustedIdentityActorContext(actor, {
    allowedIssuers: ["other-issuer"], nowMs: NOW
  }), { code: "identity_issuer_not_allowed" });
  assert.throws(() => parseTrustedIdentityActorContext({ ...actor, subjectRef: "user@example.test" }, {
    allowedIssuers: [issuerRef], nowMs: NOW
  }), { code: "identity_subject_invalid" });
});

test("actor context rejects expiry, excessive lifetime and future authentication time", () => {
  assert.throws(() => parseTrustedIdentityActorContext({ ...actor, expiresAtMs: NOW }, {
    allowedIssuers: [issuerRef], nowMs: NOW
  }), { code: "identity_actor_context_time_invalid" });
  assert.throws(() => parseTrustedIdentityActorContext({ ...actor, expiresAtMs: NOW + 600_001 }, {
    allowedIssuers: [issuerRef], nowMs: NOW
  }), { code: "identity_actor_context_time_invalid" });
  assert.throws(() => parseTrustedIdentityActorContext({ ...actor, authTimeMs: NOW + 60_000 }, {
    allowedIssuers: [issuerRef], nowMs: NOW
  }), { code: "identity_actor_context_time_invalid" });
});

test("actor context requires a known authentication factor and password or passkey", () => {
  assert.throws(() => parseTrustedIdentityActorContext({ ...actor, factors: ["sms"] }, {
    allowedIssuers: [issuerRef], nowMs: NOW
  }), { code: "identity_actor_factors_invalid" });
  assert.throws(() => parseTrustedIdentityActorContext({ ...actor, factors: ["totp"] }, {
    allowedIssuers: [issuerRef], nowMs: NOW
  }), { code: "identity_actor_factors_invalid" });
});

test("D1 identity binding stores only opaque subject/account references", () => {
  const record = binding();
  assert.deepEqual(Object.keys(record).sort(), [
    "accountRef", "createdAtMs", "issuerRef", "revokedAtMs", "status", "subjectRef", "updatedAtMs"
  ]);
  assert.equal(Object.hasOwn(record, "email"), false);
  assert.throws(() => createD1IdentityBindingRecord({ ...record, email: "user@example.test" }), {
    code: "identity_binding_schema_invalid"
  });
  assert.throws(() => createD1IdentityBindingRecord({ ...record, subjectRef: "user@example.test" }), {
    code: "identity_subject_invalid"
  });
});

test("identity binding resolves one exact issuer/subject pair and preserves account compatibility", () => {
  const record = binding();
  assert.deepEqual(resolveD1IdentityBinding({
    bindings: [record], issuerRef, subjectRef: actor.subjectRef
  }), { outcome: "resolved", accountRef: actor.accountRef });
  assert.deepEqual(resolveD1IdentityBinding({
    bindings: [record], issuerRef, subjectRef: actor.subjectRef, expectedAccountRef: actor.accountRef
  }), { outcome: "resolved", accountRef: actor.accountRef });
  assert.deepEqual(resolveD1IdentityBinding({
    bindings: [record], issuerRef, subjectRef: actor.subjectRef, expectedAccountRef: "acct_other_002"
  }), { outcome: "account_mismatch" });
});

test("unknown, revoked and duplicate identity bindings fail closed", () => {
  const active = binding();
  const revoked = binding({ status: "revoked", updatedAtMs: NOW, revokedAtMs: NOW });
  assert.deepEqual(resolveD1IdentityBinding({
    bindings: [active], issuerRef, subjectRef: "auth0|unknown-subject"
  }), { outcome: "not_found" });
  assert.deepEqual(resolveD1IdentityBinding({
    bindings: [revoked], issuerRef, subjectRef: actor.subjectRef
  }), { outcome: "not_found" });
  assert.deepEqual(resolveD1IdentityBinding({
    bindings: [active, binding({ accountRef: "acct_synthetic_002" })], issuerRef, subjectRef: actor.subjectRef
  }), { outcome: "ambiguous" });
});

test("binding planner is idempotent and rejects subject/account collisions", () => {
  const existing = binding();
  assert.deepEqual(planD1IdentityBinding({ existingBindings: [existing], incomingRecord: existing }), {
    outcome: "already_bound", accountRef: actor.accountRef
  });
  assert.deepEqual(planD1IdentityBinding({
    existingBindings: [existing], incomingRecord: binding({ accountRef: "acct_other_003" })
  }), { outcome: "subject_bound_to_other_account" });
  assert.deepEqual(planD1IdentityBinding({
    existingBindings: [existing], incomingRecord: binding({ subjectRef: "auth0|different-subject" })
  }), { outcome: "account_already_bound" });
  assert.equal(planD1IdentityBinding({ existingBindings: [], incomingRecord: existing }).outcome, "create");
});
