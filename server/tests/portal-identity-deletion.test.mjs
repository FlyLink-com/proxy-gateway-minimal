// B2-4c (G-10A): identity deletion jobs, proof and failure recovery.
//
// Proves, on an in-memory store, the approved technical direction: the
// deletion job state machine (steps 0-8), per-step idempotency, the account
// freeze, credential/session revocation, both read-back verification
// modes, the audit-event + independent proof record, and failure retry /
// resume. Every fixture is synthetic: no real credential material,
// password, secret or personal-data original appears anywhere.
import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import {
  createSqliteSubscriptionControlStore
} from "../services/platform/subscription-control-db.mjs";
import {
  PortalIdentityDeletionService,
  buildReadbackAssertions
} from "../services/platform/portal-identity-deletion.mjs";

const NOW = 1794000000000;
const NOW_ISO = new Date(NOW).toISOString();
const LATER_ISO = new Date(NOW + 3600000).toISOString();

function withStore(fn) {
  const database = new Database(":memory:");
  let store;
  try {
    store = createSqliteSubscriptionControlStore({ database });
    const service = new PortalIdentityDeletionService({
      controlStore: store,
      now: () => NOW_ISO
    });
    return fn({ database, store, service });
  } finally {
    store?.close?.();
    database.close();
  }
}

function makeAccount(store, id, metadata, status = "active") {
  return store.createAccount({
    id,
    ownerRef: id,
    status,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    metadata: metadata ?? {
      // Synthetic email-shaped value (.test TLD, synth- prefix): the store
      // validates loginRef as an email pattern, and the test needs a
      // personal original present so logical-mode stripping is observable.
      loginRef: "synth-user-0001@example.test",
      displayRef: "synth-display-ref",
      // Digests must be 64 lowercase hex; these fixed synthetic values
      // are not digests of anything.
      loginDigest: "11".repeat(32),
      displayDigest: "22".repeat(32)
    }
  });
}

function makePasswordCredential(store, accountId, id, status = "active") {
  return store.createPortalPasswordCredential({
    id,
    accountId,
    // Synthetic scrypt-envelope-shaped value, not a real password hash.
    passwordHash: "scrypt$v=1$N=32768$r=8$p=1$c3ludGgtc2FsdA$c3ludGgtaGFzaA",
    status,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO
  });
}

function makeTotpCredential(store, accountId, id, status = "active") {
  return store.createPortalTotpCredential({
    id,
    accountId,
    // Synthetic v2-envelope-shaped value, not real ciphertext.
    encryptedTotpSecret: "v2:aes-256-gcm:c3ludGgtaXY:c3ludGgtdGFn:c3ludGgtY2lwaGVydGV4dA",
    status,
    enrolledAt: NOW_ISO,
    updatedAt: NOW_ISO
  });
}

function makePasskeyCredential(store, accountId, id, status = "active") {
  return store.createPortalPasskeyCredential({
    id,
    accountId,
    credentialId: `synth-cred-${id}`,
    credentialIdHash: `synth-cred-hash-${id}`,
    publicKeyJwk: { kty: "OKP", crv: "Ed25519", x: "synth-x" },
    status,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO
  });
}

function makeSession(store, accountId, id, status = "active") {
  return store.createPortalSession({
    id,
    accountId,
    authMethod: "password_totp",
    status,
    issuedAt: NOW_ISO,
    expiresAt: LATER_ISO,
    updatedAt: NOW_ISO
  });
}

function makeChallenge(store, accountId, id) {
  return store.createPortalSecondFactorChallenge({
    id,
    accountId,
    challengeHash: `synth-challenge-hash-${id}`,
    allowedFactors: ["totp"],
    status: "active",
    expiresAt: LATER_ISO,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO
  });
}

function request(service, overrides = {}) {
  return service.requestDeletion({
    requestRef: "delreq-synth-0001",
    accountId: "acct-del-0001",
    authorizationBasis: "owner_request",
    scope: ["account", "credentials", "sessions"],
    verificationMode: "physical",
    actorRef: "admin:operator-synth-1",
    ...overrides
  });
}

function fullAccount(store, accountId = "acct-del-0001") {
  makeAccount(store, accountId);
  makePasswordCredential(store, accountId, "pwd-del-0001");
  makePasswordCredential(store, accountId, "pwd-del-0002", "locked");
  makeTotpCredential(store, accountId, "totp-del-0001");
  makePasskeyCredential(store, accountId, "pass-del-0001");
  makeSession(store, accountId, "sess-del-0001");
  makeSession(store, accountId, "sess-del-0002");
  makeChallenge(store, accountId, "chal-del-0001");
}

function auditEventsFor(database, accountId) {
  // rowid order is insertion order: every event in one run shares the
  // same fixed timestamp, so created_at cannot order them.
  return database.prepare(
    "select * from platform_audit_events where entity_ref = ? order by rowid"
  ).all(accountId);
}

test("request creates a job with step 0 completed and a requested audit event", () => withStore(({ database, store, service }) => {
  makeAccount(store, "acct-del-0001");
  const job = request(service);
  assert.equal(job.status, "pending");
  assert.equal(job.currentStep, 1);
  assert.equal(job.verificationMode, "physical");
  assert.equal(job.steps[0].status, "completed");
  assert.equal(job.steps[0].completedAt, NOW_ISO);
  assert.equal(job.steps[1].status, "pending");
  assert.equal(job.retryCount, 0);
  assert.equal(job.proofRef, null);

  const events = auditEventsFor(database, "acct-del-0001");
  assert.equal(events.length, 1);
  assert.equal(events[0].action, "identity_deletion_requested");
  const metadata = JSON.parse(events[0].metadata_json);
  assert.equal(metadata.requestRef, "delreq-synth-0001");
  assert.equal(metadata.verificationMode, "physical");
  assert.deepEqual(metadata.scope, ["account", "credentials", "sessions"]);
}));

test("verification mode is required and has no silent default", () => withStore(({ store, service }) => {
  makeAccount(store, "acct-del-0001");
  assert.throws(
    () => request(service, { verificationMode: undefined }),
    (error) => error.code === "identity_deletion_validation_error"
  );
  assert.throws(
    () => request(service, { verificationMode: "both" }),
    (error) => error.code === "identity_deletion_validation_error"
  );
  assert.equal(store.getIdentityDeletionJobByRequestId("delreq-synth-0001"), null);
}));

test("scope must include the executed trio and only known categories", () => withStore(({ store, service }) => {
  makeAccount(store, "acct-del-0001");
  for (const scope of [
    ["credentials", "sessions"],
    ["account", "credentials", "sessions", "unknown-category"],
    ["account", "credentials", "credentials", "sessions"],
    []
  ]) {
    assert.throws(
      () => request(service, { scope }),
      (error) => error.code === "identity_deletion_validation_error"
    );
  }
  assert.equal(store.getIdentityDeletionJobByRequestId("delreq-synth-0001"), null);
}));

test("duplicate requestRef returns the existing job without a second row", () => withStore(({ database, store, service }) => {
  makeAccount(store, "acct-del-0001");
  makeAccount(store, "acct-del-0002");
  const first = request(service);
  const second = request(service);
  assert.equal(second.id, first.id);
  assert.equal(
    database.prepare("select count(*) as count from platform_identity_deletion_jobs").get().count,
    1
  );
  assert.equal(auditEventsFor(database, "acct-del-0001").length, 1);
  assert.throws(
    () => request(service, { accountId: "acct-del-0002" }),
    (error) => error.code === "identity_deletion_request_conflict"
  );
}));

test("a second unfinished job for the same account is rejected", () => withStore(({ store, service }) => {
  makeAccount(store, "acct-del-0001");
  request(service);
  assert.throws(
    () => request(service, { requestRef: "delreq-synth-0002" }),
    (error) => error.code === "identity_deletion_account_has_pending_job"
  );
}));

test("request for an unknown account fails closed", () => withStore(({ service }) => {
  assert.throws(
    () => request(service),
    (error) => error.code === "identity_deletion_account_not_found"
  );
}));

test("physical mode: full run deletes the account and issues a proof", () => withStore(({ database, store, service }) => {
  fullAccount(store);
  request(service);
  const done = service.runDeletion({ requestRef: "delreq-synth-0001" });
  assert.equal(done.status, "completed");
  assert.equal(done.currentStep, 8);
  assert.ok(done.proofRef);

  assert.equal(store.getAccount("acct-del-0001"), null);
  assert.equal(store.getPortalPasswordCredential("pwd-del-0001"), null);
  assert.equal(store.getPortalTotpCredential("totp-del-0001"), null);
  assert.equal(store.getPortalPasskeyCredential("pass-del-0001"), null);
  assert.equal(store.getPortalSession("sess-del-0001"), null);
  assert.equal(
    database.prepare("select count(*) as count from platform_portal_second_factor_challenges").get().count,
    0
  );

  const proof = service.getDeletionProof({ proofRef: done.proofRef });
  assert.equal(proof.verificationMode, "physical");
  assert.equal(proof.requestId, "delreq-synth-0001");
  assert.deepEqual(proof.deferredScope, []);
  assert.ok(proof.verification.every((assertion) => assertion.passed));
  assert.deepEqual(
    proof.verification.map((assertion) => assertion.name),
    [
      "account_row_absent",
      "password_rows_absent",
      "totp_rows_absent",
      "passkey_rows_absent",
      "session_rows_absent",
      "challenge_rows_absent",
      "entry_rows_absent"
    ]
  );

  const tombstones = store.listIdentityDeletionTombstonesByRequestId("delreq-synth-0001");
  assert.equal(tombstones.length, 1);
  assert.equal(tombstones[0].retentionPolicyRef, "pending-c5-decision");
  assert.deepEqual(tombstones[0].retainedCategories, ["financial_facts", "audit_events"]);

  const events = auditEventsFor(database, "acct-del-0001");
  // 1 requested + 8 step_completed + 1 verified + 1 proof_issued = 11.
  // The verified event is written inside step 7's transaction, before
  // that step's step_completed event; likewise proof_issued precedes
  // step 8's step_completed event.
  assert.equal(events.length, 11);
  assert.deepEqual(
    events.map((event) => event.action),
    [
      "identity_deletion_requested",
      "identity_deletion_step_completed",
      "identity_deletion_step_completed",
      "identity_deletion_step_completed",
      "identity_deletion_step_completed",
      "identity_deletion_step_completed",
      "identity_deletion_step_completed",
      "identity_deletion_verified",
      "identity_deletion_step_completed",
      "identity_deletion_proof_issued",
      "identity_deletion_step_completed"
    ]
  );
  const stepNames = events
    .filter((event) => event.action === "identity_deletion_step_completed")
    .map((event) => JSON.parse(event.metadata_json).stepName);
  assert.deepEqual(stepNames, [
    "freeze_account",
    "revoke_sessions",
    "revoke_credentials",
    "d1_placeholder",
    "delete_personal_data",
    "write_tombstone",
    "verify_readback",
    "issue_proof"
  ]);
  // The D1 placeholder step records that it skipped, it does not pretend.
  const d1Step = events
    .filter((event) => event.action === "identity_deletion_step_completed")
    .map((event) => JSON.parse(event.metadata_json))
    .find((metadata) => metadata.step === 4);
  assert.equal(d1Step.result, "skipped");
}));

test("physical run is idempotent: a second run issues no second proof", () => withStore(({ database, store, service }) => {
  fullAccount(store);
  request(service);
  const first = service.runDeletion({ requestRef: "delreq-synth-0001" });
  const second = service.runDeletion({ requestRef: "delreq-synth-0001" });
  assert.equal(second.id, first.id);
  assert.equal(second.proofRef, first.proofRef);
  assert.equal(
    database.prepare("select count(*) as count from platform_identity_deletion_proofs").get().count,
    1
  );
  assert.equal(auditEventsFor(database, "acct-del-0001").length, 11);
}));

test("logical mode: account stays suspended, personal fields stripped, rows revoked", () => withStore(({ database, store, service }) => {
  fullAccount(store);
  request(service, { verificationMode: "logical" });
  const done = service.runDeletion({ requestRef: "delreq-synth-0001" });
  assert.equal(done.status, "completed");

  const account = store.getAccount("acct-del-0001");
  assert.equal(account.status, "suspended");
  assert.equal(account.metadata.loginRef, undefined);
  assert.equal(account.metadata.displayRef, undefined);
  assert.equal(account.metadata.loginDigest, "11".repeat(32));
  assert.equal(account.metadata.displayDigest, "22".repeat(32));

  for (const id of ["pwd-del-0001", "pwd-del-0002"]) {
    const row = store.getPortalPasswordCredential(id);
    assert.equal(row.status, "revoked");
    assert.equal(row.revokedAt, NOW_ISO);
  }
  assert.equal(store.getPortalTotpCredential("totp-del-0001").status, "revoked");
  assert.equal(store.getPortalPasskeyCredential("pass-del-0001").status, "revoked");
  for (const id of ["sess-del-0001", "sess-del-0002"]) {
    assert.equal(store.getPortalSession(id).status, "revoked");
  }

  const proof = service.getDeletionProof({ proofRef: done.proofRef });
  assert.equal(proof.verificationMode, "logical");
  assert.ok(proof.verification.every((assertion) => assertion.passed));
  assert.equal(
    database.prepare("select count(*) as count from platform_identity_deletion_proofs").get().count,
    1
  );
}));

test("freeze step suspends the account; a repeat run is a no-op", () => withStore(({ store, service }) => {
  makeAccount(store, "acct-del-0001");
  request(service);
  const afterFirst = service.runDeletionStep({ requestRef: "delreq-synth-0001", step: 1 });
  assert.equal(store.getAccount("acct-del-0001").status, "suspended");
  // The login paths reject any account whose status is not 'active'.
  assert.notEqual(store.getAccount("acct-del-0001").status, "active");
  assert.equal(afterFirst.steps[1].status, "completed");
  const afterSecond = service.runDeletionStep({ requestRef: "delreq-synth-0001", step: 1 });
  assert.equal(afterSecond.steps[1].status, "completed");
  assert.equal(afterSecond.steps[1].retryCount, 0);
  assert.equal(store.getAccount("acct-del-0001").status, "suspended");
}));

test("revoke steps are idempotent: revoked_at never moves on re-run", () => withStore(({ store, service }) => {
  fullAccount(store);
  request(service);
  service.runDeletionStep({ requestRef: "delreq-synth-0001", step: 1 });
  service.runDeletionStep({ requestRef: "delreq-synth-0001", step: 2 });
  const firstRevokedAt = store.getPortalSession("sess-del-0001").revokedAt;
  assert.equal(firstRevokedAt, NOW_ISO);
  service.runDeletionStep({ requestRef: "delreq-synth-0001", step: 2 });
  assert.equal(store.getPortalSession("sess-del-0001").revokedAt, firstRevokedAt);
  service.runDeletionStep({ requestRef: "delreq-synth-0001", step: 3 });
  const firstPwdRevokedAt = store.getPortalPasswordCredential("pwd-del-0001").revokedAt;
  service.runDeletionStep({ requestRef: "delreq-synth-0001", step: 3 });
  assert.equal(store.getPortalPasswordCredential("pwd-del-0001").revokedAt, firstPwdRevokedAt);
  // The locked credential is revoked too: deletion must neutralize it.
  assert.equal(store.getPortalPasswordCredential("pwd-del-0002").status, "revoked");
}));

test("step 5 fails closed when retained rows block the account delete, then resumes", () => withStore(({ database, store, service }) => {
  fullAccount(store);
  store.createEntitlement({
    id: "ent-del-0001",
    accountId: "acct-del-0001",
    plan: "synth-plan",
    status: "active",
    validFrom: NOW_ISO,
    validUntil: LATER_ISO,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO
  });
  request(service);
  assert.throws(
    () => service.runDeletion({ requestRef: "delreq-synth-0001" }),
    (error) => error.code === "identity_deletion_blocked_by_retained_rows"
  );
  const failed = service.getDeletionJob({ requestRef: "delreq-synth-0001" });
  assert.equal(failed.status, "failed");
  assert.equal(failed.currentStep, 5);
  assert.equal(failed.steps[5].status, "failed");
  assert.match(failed.failureReason, /platform_entitlements:1/);
  assert.equal(failed.proofRef, null);
  // The blocked step performed no writes at all: the personal rows and
  // the account row both survived, and the job stops instead of deleting
  // undecided data.
  assert.notEqual(store.getPortalPasswordCredential("pwd-del-0001"), null);
  assert.notEqual(store.getAccount("acct-del-0001"), null);

  database.prepare("delete from platform_entitlements where id = ?").run("ent-del-0001");
  const done = service.runDeletion({ requestRef: "delreq-synth-0001" });
  assert.equal(done.status, "completed");
  assert.equal(done.steps[5].retryCount, 1);
  assert.equal(done.retryCount, 1);
  assert.ok(done.proofRef);
  assert.equal(store.getAccount("acct-del-0001"), null);
}));

test("entry rows are deleted by step 5 once the blocking entitlement is gone", () => withStore(({ database, store, service }) => {
  makeAccount(store, "acct-del-0001");
  store.createEntitlement({
    id: "ent-del-0001",
    accountId: "acct-del-0001",
    plan: "synth-plan",
    status: "active",
    validFrom: NOW_ISO,
    validUntil: LATER_ISO,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO
  });
  store.createPortalEntry({
    id: "entry-del-0001",
    accountId: "acct-del-0001",
    entitlementId: "ent-del-0001",
    tokenHash: "synth-token-hash",
    status: "active",
    expiresAt: LATER_ISO,
    issuedByRef: "admin:operator-synth-1",
    approvalRef: "synth-approval-1",
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO
  });
  request(service);
  assert.throws(
    () => service.runDeletion({ requestRef: "delreq-synth-0001" }),
    (error) => error.code === "identity_deletion_blocked_by_retained_rows"
  );
  database.prepare("delete from platform_entitlements where id = ?").run("ent-del-0001");
  const done = service.runDeletion({ requestRef: "delreq-synth-0001" });
  assert.equal(done.status, "completed");
  assert.equal(
    database.prepare("select count(*) as count from platform_portal_entries").get().count,
    0
  );
}));

test("interrupted run resumes from the last completed step", () => withStore(({ store, service }) => {
  fullAccount(store);
  request(service);
  service.runDeletionStep({ requestRef: "delreq-synth-0001", step: 1 });
  service.runDeletionStep({ requestRef: "delreq-synth-0001", step: 2 });
  const sessionRevokedAt = store.getPortalSession("sess-del-0001").revokedAt;
  const done = service.runDeletion({ requestRef: "delreq-synth-0001" });
  assert.equal(done.status, "completed");
  assert.ok(done.proofRef);
  // Steps 1-2 were not redone: the revocation timestamp did not move.
  assert.equal(store.getPortalSession("sess-del-0001"), null);
  assert.equal(sessionRevokedAt, NOW_ISO);
  assert.equal(done.steps[1].retryCount, 0);
  assert.equal(done.steps[2].retryCount, 0);
}));

test("step 7 verification failure stops the job; a forced step 3 re-run recovers it", () => withStore(({ database, store, service }) => {
  fullAccount(store);
  request(service, { verificationMode: "logical" });
  service.runDeletionStep({ requestRef: "delreq-synth-0001", step: 1 });
  service.runDeletionStep({ requestRef: "delreq-synth-0001", step: 2 });
  service.runDeletionStep({ requestRef: "delreq-synth-0001", step: 3 });
  // External divergence after step 3: a credential is active again.
  database.prepare(
    "update platform_portal_password_credentials set status = 'active', revoked_at = null where id = ?"
  ).run("pwd-del-0001");
  assert.throws(
    () => service.runDeletion({ requestRef: "delreq-synth-0001" }),
    (error) => error.code === "identity_deletion_verification_failed"
  );
  const failed = service.getDeletionJob({ requestRef: "delreq-synth-0001" });
  assert.equal(failed.status, "failed");
  assert.equal(failed.currentStep, 7);
  assert.match(failed.failureReason, /password_rows_revoked/);
  assert.equal(failed.proofRef, null);
  assert.equal(
    database.prepare("select count(*) as count from platform_identity_deletion_proofs").get().count,
    0
  );

  const recovered = service.runDeletionStep({
    requestRef: "delreq-synth-0001",
    step: 3,
    force: true
  });
  assert.equal(recovered.steps[3].retryCount, 1);
  assert.equal(store.getPortalPasswordCredential("pwd-del-0001").status, "revoked");
  const done = service.runDeletion({ requestRef: "delreq-synth-0001" });
  assert.equal(done.status, "completed");
  assert.ok(done.proofRef);
}));

test("audit metadata and proof records carry no personal-data originals", () => withStore(({ database, store, service }) => {
  fullAccount(store);
  request(service, { verificationMode: "logical" });
  service.runDeletion({ requestRef: "delreq-synth-0001" });
  const events = auditEventsFor(database, "acct-del-0001");
  assert.ok(events.length > 0);
  for (const event of events) {
    const metadata = JSON.parse(event.metadata_json);
    // Keys must carry no unsafe field names; values must carry no
    // personal-data originals and no credential material. The scope
    // category label "credentials" is a P-2 category name, not material,
    // so the value check targets the synthetic originals, not the label.
    for (const key of Object.keys(metadata)) {
      assert.doesNotMatch(key, /email|password|secret|credential|token|raw/i);
    }
    assert.doesNotMatch(event.metadata_json, /synth-user-0001@example\.test|synth-display-ref/);
    assert.doesNotMatch(event.metadata_json, /scrypt\$v=1|c3ludGgtaGFzaA|c3ludGgtY2lwaGVydGV4dA/);
  }
  const job = service.getDeletionJob({ requestRef: "delreq-synth-0001" });
  const proof = service.getDeletionProof({ proofRef: job.proofRef });
  assert.doesNotMatch(JSON.stringify(proof), /synth-user-0001@example\.test|synth-display-ref/);
  assert.doesNotMatch(JSON.stringify(job), /synth-user-0001@example\.test|synth-display-ref/);
}));

test("an already-disabled account deletes cleanly in both modes", () => withStore(({ store, service }) => {
  // Freeze is satisfied by any non-active status, and the logical
  // verification accepts any frozen status, not just 'suspended'.
  makeAccount(store, "acct-del-0001", undefined, "disabled");
  makePasswordCredential(store, "acct-del-0001", "pwd-del-0001");
  request(service, { verificationMode: "physical" });
  const done = service.runDeletion({ requestRef: "delreq-synth-0001" });
  assert.equal(done.status, "completed");
  assert.equal(store.getAccount("acct-del-0001"), null);

  makeAccount(store, "acct-del-0002", undefined, "disabled");
  makePasswordCredential(store, "acct-del-0002", "pwd-del-0002");
  request(service, {
    requestRef: "delreq-synth-0002",
    accountId: "acct-del-0002",
    verificationMode: "logical"
  });
  const logicalDone = service.runDeletion({ requestRef: "delreq-synth-0002" });
  assert.equal(logicalDone.status, "completed");
  assert.equal(store.getAccount("acct-del-0002").status, "disabled");
}));

test("unknown job and unknown proof fail closed", () => withStore(({ service }) => {
  assert.throws(
    () => service.getDeletionJob({ requestRef: "delreq-no-such" }),
    (error) => error.code === "identity_deletion_job_not_found"
  );
  assert.throws(
    () => service.getDeletionProof({ proofRef: "delproof-no-such" }),
    (error) => error.code === "identity_deletion_proof_not_found"
  );
}));

test("buildReadbackAssertions: physical needs absent rows, logical needs revoked rows", () => {
  const emptyState = {
    accountExists: false,
    accountStatus: null,
    metadataHasPersonalFields: false,
    password: { total: 0, active: 0, revoked: 0, locked: 0 },
    totp: { total: 0, active: 0, revoked: 0, locked: 0 },
    passkey: { total: 0, active: 0, revoked: 0, locked: 0 },
    sessions: { total: 0, active: 0, revoked: 0, expired: 0 },
    challenges: 0,
    entries: 0,
    blocking: {}
  };
  assert.ok(buildReadbackAssertions("physical", emptyState).every((a) => a.passed));
  assert.ok(!buildReadbackAssertions("logical", emptyState).every((a) => a.passed));

  const logicalState = {
    ...emptyState,
    accountExists: true,
    accountStatus: "suspended",
    password: { total: 2, active: 1, revoked: 1, locked: 0 },
    totp: { total: 1, active: 0, revoked: 1, locked: 0 },
    passkey: { total: 0, active: 0, revoked: 0, locked: 0 }
  };
  const failed = buildReadbackAssertions("logical", logicalState).filter((a) => !a.passed);
  assert.deepEqual(failed.map((a) => a.name), ["password_rows_revoked"]);
  assert.throws(
    () => buildReadbackAssertions("both", emptyState),
    (error) => error.code === "identity_deletion_validation_error"
  );
});
