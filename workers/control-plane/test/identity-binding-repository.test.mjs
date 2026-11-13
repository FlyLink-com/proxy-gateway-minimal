import assert from "node:assert/strict";
import test from "node:test";
import { IdentityBindingRepository } from "../src/repositories/identity-binding-repository.mjs";
import { createWorker } from "./helpers.mjs";

function record({ accountRef = "acct-pg-101", subjectRef = "auth0|portal-synth-101", now = Date.now() } = {}) {
  return {
    accountRef,
    issuerRef: "portal",
    subjectRef,
    status: "active",
    createdAtMs: now - 1000,
    updatedAtMs: now - 1000,
    revokedAtMs: null,
  };
}

test("identity binding repository stores only opaque references and resolves one active subject", async (t) => {
  const { mf, db } = await createWorker();
  t.after(() => mf.dispose());
  const repository = new IdentityBindingRepository(db);
  const created = await repository.createActive(record());
  assert.equal(created.outcome, "created");
  assert.match(created.id, /^idb_[A-Za-z0-9_-]{32}$/);
  assert.deepEqual(await repository.resolve({ issuerRef: "portal", subjectRef: "auth0|portal-synth-101" }), {
    outcome: "resolved",
    accountRef: "acct-pg-101",
    bindingId: created.id,
  });

  const { results } = await db.prepare("SELECT * FROM platform_identity_bindings").all();
  assert.equal(results.length, 1);
  assert.deepEqual(Object.keys(results[0]).sort(), [
    "account_id", "created_at_ms", "id", "issuer_ref", "revoked_at_ms", "status", "subject_ref", "updated_at_ms",
  ]);
  assert.equal(JSON.stringify(results[0]).includes("@"), false);
  assert.equal(JSON.stringify(results[0]).includes("email"), false);
});

test("identity binding planner rejects subject and account collisions; revocation permits a later controlled rebind", async (t) => {
  const { mf, db } = await createWorker();
  t.after(() => mf.dispose());
  const repository = new IdentityBindingRepository(db);
  const first = await repository.createActive(record());
  assert.equal(first.outcome, "created");

  assert.deepEqual(await repository.createActive(record()), {
    outcome: "already_bound",
    accountRef: "acct-pg-101",
  });
  assert.deepEqual(await repository.createActive(record({ accountRef: "acct-pg-102" })), {
    outcome: "subject_bound_to_other_account",
  });
  assert.deepEqual(await repository.createActive(record({ subjectRef: "auth0|portal-synth-102" })), {
    outcome: "account_already_bound",
  });

  assert.equal(await repository.revoke({ id: first.id, revokedAtMs: Date.now() }), true);
  assert.deepEqual(await repository.resolve({ issuerRef: "portal", subjectRef: "auth0|portal-synth-101" }), {
    outcome: "not_found",
  });
  const rebound = await repository.createActive(record({ now: Date.now() + 10 }));
  assert.equal(rebound.outcome, "created");
});


test("concurrent binding attempts cannot create duplicate active subject/account rows", async (t) => {
  const { mf, db } = await createWorker();
  t.after(() => mf.dispose());
  const repository = new IdentityBindingRepository(db);
  const attempts = await Promise.all([
    repository.createActive(record()),
    repository.createActive(record()),
  ]);
  assert.deepEqual(attempts.map((result) => result.outcome).sort(), ["already_bound", "created"]);
  const count = await db.prepare(
    "SELECT COUNT(*) AS n FROM platform_identity_bindings WHERE issuer_ref = 'portal' AND subject_ref = 'auth0|portal-synth-101' AND status = 'active'",
  ).first();
  assert.equal(count.n, 1);
});

test("an identity binding row blocks account deletion pending the explicit deletion-proof workflow", async (t) => {
  const { mf, db } = await createWorker();
  t.after(() => mf.dispose());
  const repository = new IdentityBindingRepository(db);
  await repository.createActive(record());
  await assert.rejects(
    db.prepare("DELETE FROM platform_accounts WHERE id = 'acct-pg-101'").run(),
  );
});


test("issuer_ref keeps identical subject strings isolated across the approved Portal and Admin tenants", async (t) => {
  const { mf, db } = await createWorker();
  t.after(() => mf.dispose());
  const repository = new IdentityBindingRepository(db);
  const portal = await repository.createActive(record({ accountRef: "acct-pg-101", subjectRef: "auth0|same-subject" }));
  const admin = await repository.createActive({
    ...record({ accountRef: "acct-pg-102", subjectRef: "auth0|same-subject" }),
    issuerRef: "admin",
  });
  assert.equal(portal.outcome, "created");
  assert.equal(admin.outcome, "created");
  assert.equal((await repository.resolve({ issuerRef: "portal", subjectRef: "auth0|same-subject" })).accountRef, "acct-pg-101");
  assert.equal((await repository.resolve({ issuerRef: "admin", subjectRef: "auth0|same-subject" })).accountRef, "acct-pg-102");
  assert.deepEqual(await repository.resolve({
    issuerRef: "portal", subjectRef: "auth0|same-subject", expectedAccountRef: "acct-pg-102",
  }), { outcome: "account_mismatch" });
});


test("identity binding repository accepts only the two approved tenant aliases", async (t) => {
  const { mf, db } = await createWorker();
  t.after(() => mf.dispose());
  const repository = new IdentityBindingRepository(db);
  await assert.rejects(repository.createActive({ ...record(), issuerRef: "support" }), {
    code: "identity_binding_issuer_invalid",
  });
  await assert.rejects(repository.resolve({ issuerRef: "support", subjectRef: "auth0|unknown" }), {
    code: "identity_binding_issuer_invalid",
  });
});
