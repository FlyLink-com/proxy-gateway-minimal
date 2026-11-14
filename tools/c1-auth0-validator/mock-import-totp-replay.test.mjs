// B2-1 (G-11): cross-call import idempotency / conflict rejection and TOTP
// counter-replay rejection in the Auth0-shaped mock. Mock + tests only; no
// production auth code is touched.
import test from "node:test";
import assert from "node:assert/strict";
import { createMockTenant, totpAt } from "./mock-auth0.mjs";
import { legacyEnroll } from "./auth0-scrypt-import-validator.mjs";
import { buildAttestationRecord } from "./login-attestation.mjs";

const NOW = 1794000000000;
const salt = Buffer.alloc(16, 7);
const attest = (accountRef, presentedPassword) =>
  buildAttestationRecord({ accountRef, presentedPassword, attestedAtMs: NOW });
const account = (accountRef, email, password) => ({
  accountRef, email,
  envelope: legacyEnroll(password, salt),
  attestation: attest(accountRef, password)
});
const tenant = () => createMockTenant({
  tenantRef: "b2-1-dev", issuerRef: "flylink-b2-1", nowFn: () => NOW
});

test("B2-1: an identical repeat import is idempotent — same report, no rewrite", () => {
  const provider = tenant();
  const alice = account("alice", "alice@synthetic.test", "alice-portal-pw-1");
  const first = provider.importLegacyAccounts([alice]);
  assert.equal(first[0].action, "imported");
  const before = provider.inspectUser("alice@synthetic.test");
  const second = provider.importLegacyAccounts([alice]);
  assert.equal(second[0].action, "imported");
  assert.deepEqual(second[0].advisories, first[0].advisories);
  assert.deepEqual(provider.inspectUser("alice@synthetic.test"), before);
});

test("B2-1: an identical repeat of a reset-required import stays reset-required", () => {
  const provider = tenant();
  const bob = account("bob", "bob@synthetic.test", "b".repeat(80));
  assert.equal(provider.importLegacyAccounts([bob])[0].action, "reset_required");
  const second = provider.importLegacyAccounts([bob]);
  assert.equal(second[0].action, "reset_required");
  assert.equal(provider.inspectUser("bob@synthetic.test").status, "reset_required");
  assert.equal(provider.inspectUser("bob@synthetic.test").credentialKind, null);
});

test("B2-1: the same email under a different accountRef is rejected and the original is untouched", () => {
  const provider = tenant();
  provider.importLegacyAccounts([account("alice", "alice@synthetic.test", "alice-portal-pw-1")]);
  const before = provider.inspectUser("alice@synthetic.test");
  assert.throws(() => provider.importLegacyAccounts([
    account("mallory", "alice@synthetic.test", "mallory-pw-1")
  ]), /import_duplicate_email/);
  assert.deepEqual(provider.inspectUser("alice@synthetic.test"), before);
});

test("B2-1: the same accountRef with a different import record is rejected as a conflict", () => {
  const provider = tenant();
  provider.importLegacyAccounts([account("alice", "alice@synthetic.test", "alice-portal-pw-1")]);
  const before = provider.inspectUser("alice@synthetic.test");
  assert.throws(() => provider.importLegacyAccounts([
    account("alice", "alice@synthetic.test", "alice-different-pw-1")
  ]), /import_record_conflict/);
  assert.deepEqual(provider.inspectUser("alice@synthetic.test"), before);
});

test("B2-1: a conflicting later item aborts the whole batch before any write", () => {
  const provider = tenant();
  provider.importLegacyAccounts([account("alice", "alice@synthetic.test", "alice-portal-pw-1")]);
  assert.throws(() => provider.importLegacyAccounts([
    account("carol", "carol@synthetic.test", "carol-pw-1"),
    account("mallory", "alice@synthetic.test", "mallory-pw-1")
  ]), /import_duplicate_email/);
  assert.equal(provider.inspectUser("carol@synthetic.test"), undefined,
    "the valid earlier record must not be written before the conflict fails");
});

test("B2-1: a held record writes nothing, so its repeat simply re-holds", () => {
  const provider = tenant();
  const held = {
    accountRef: "carol", email: "carol@synthetic.test",
    envelope: legacyEnroll("carol-pw", salt), attestation: undefined
  };
  assert.equal(provider.importLegacyAccounts([held])[0].action, "held_no_attestation");
  assert.equal(provider.importLegacyAccounts([held])[0].action, "held_no_attestation");
  assert.equal(provider.inspectUser("carol@synthetic.test"), undefined);
});

test("B2-1: a consumed TOTP counter cannot be replayed, even inside the ±30 s window", () => {
  const provider = tenant();
  provider.importLegacyAccounts([account("alice", "alice@synthetic.test", "alice-portal-pw-1")]);
  const login = provider.login("alice@synthetic.test", "alice-portal-pw-1");
  assert.equal(login.outcome, "ok");
  const { secretBase32 } = provider.enrollTotp("alice");
  const code = totpAt(secretBase32, NOW);
  const upgraded = provider.stepUpTotp(login.context, code, NOW);
  assert.deepEqual([...upgraded.factors], ["password", "totp"]);
  assert.throws(() => provider.stepUpTotp(login.context, code, NOW), /totp_code_reused/);
  assert.throws(() => provider.stepUpTotp(login.context, code, NOW + 15000),
    /totp_code_reused/, "the same counter is still in the window 15 s later");
});

test("B2-1: a fresh counter still steps up after an earlier counter was consumed", () => {
  const provider = tenant();
  provider.importLegacyAccounts([account("alice", "alice@synthetic.test", "alice-portal-pw-1")]);
  const login = provider.login("alice@synthetic.test", "alice-portal-pw-1");
  const { secretBase32 } = provider.enrollTotp("alice");
  provider.stepUpTotp(login.context, totpAt(secretBase32, NOW), NOW);
  const next = provider.stepUpTotp(login.context, totpAt(secretBase32, NOW + 30000), NOW + 30000);
  assert.deepEqual([...next.factors], ["password", "totp"]);
});

test("B2-1: re-enrollment issues a new secret, so its codes start from a fresh counter set", () => {
  const provider = tenant();
  provider.importLegacyAccounts([account("alice", "alice@synthetic.test", "alice-portal-pw-1")]);
  const login = provider.login("alice@synthetic.test", "alice-portal-pw-1");
  const first = provider.enrollTotp("alice");
  provider.stepUpTotp(login.context, totpAt(first.secretBase32, NOW), NOW);
  const second = provider.enrollTotp("alice");
  assert.notEqual(second.secretBase32, first.secretBase32);
  const upgraded = provider.stepUpTotp(login.context, totpAt(second.secretBase32, NOW), NOW);
  assert.deepEqual([...upgraded.factors], ["password", "totp"]);
});
