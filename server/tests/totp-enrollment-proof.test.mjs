import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { createHmac, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createPortalPasswordCredentialService } from "../services/platform/portal-password-credentials.mjs";
import { createUserPortalAuthService } from "../services/platform/user-portal-auth.mjs";
import { createPortalAccountAdminAuthService } from "../services/platform/admin-auth.mjs";
import {
  createPortalTotpSecretProtector,
  createPortalTotpVerifier
} from "../services/platform/portal-totp-verifier.mjs";

// B2-9 (G-08): TOTP enrollment lifecycle proof. Every test asserts the
// audit evidence by querying platform_audit_events directly (the
// coin-commerce tests' established pattern), never by trusting a return
// value alone. All data is synthetic; the TOTP secret below is a fixed
// test vector, never a real credential.
const NOW = "2026-05-31T00:00:00.000Z";
const LATER = "2026-05-31T00:05:01.000Z";
const FUTURE = "2099-06-04T00:00:00.000Z";
const SESSION_EXPIRES = "2026-05-31T00:30:00.000Z";
const TEST_SECRET = "JBSWY3DPEHPK3PXP";
const STUB_CODE = "654321";
const WRONG_CODE = "000000";
const TEST_PROTECTOR = { protect: (secret) => `v2:test-protected:${secret}` };
const REAL_KEY_HEX = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function withStore(fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "totp-enrollment-proof-"));
  const dbPath = join(tempDir, "control.sqlite");
  const store = createSqliteSubscriptionControlStore({ dbPath });
  const database = new Database(dbPath);
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 2000");
  const clock = { value: NOW };
  try {
    for (const accountId of ["acct_portal_1", "acct_portal_2", "acct_admin_1"]) {
      store.createAccount({
        id: accountId,
        ownerRef: `owner_${accountId}`,
        status: "active",
        createdAt: NOW,
        updatedAt: NOW,
        metadata: {
          loginRef: `${accountId}@example.test`,
          displayRef: `${accountId}@example.test`
        }
      });
      store.createEntitlement({
        id: `ent_${accountId}`,
        accountId,
        plan: "pilot",
        status: "active",
        validFrom: NOW,
        validUntil: FUTURE,
        maxArtifacts: 1,
        maxDevices: 1,
        trafficLimitBytes: 1024,
        createdAt: NOW,
        updatedAt: NOW
      });
    }
    return fn({ store, database, clock });
  } finally {
    store.close();
    database.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

function createPasswordService(store, clock) {
  return createPortalPasswordCredentialService({
    controlStore: store,
    nowFn: () => clock.value,
    saltFactory: () => Buffer.from("0123456789abcdef", "utf8"),
    credentialRefFactory: () => `pwd_cred_${randomUUID()}`
  });
}

function issuePassword(passwordService, accountId) {
  const plainPassword = `test-password-${randomUUID()}`;
  passwordService.issueInitialPasswordCredential({
    accountId,
    plainPassword,
    issuedByRef: "operator_safe_ref",
    approvalRef: "approval_password_setup"
  });
  return plainPassword;
}

function createPortalService(store, clock, overrides = {}) {
  let credentialCounter = 0;
  let sessionCounter = 0;
  return createUserPortalAuthService({
    controlStore: store,
    nowFn: () => clock.value,
    entryTokenFactory: () => "portal-entry-raw-secret",
    entryRefFactory: () => "entry_portal_1",
    credentialRefFactory: () => `totp_cred_${++credentialCounter}`,
    secondFactorChallengeRefFactory: () => "mfa_challenge_1",
    sessionRefFactory: () => `portal_session_${++sessionCounter}`,
    sessionExpiresAtFactory: () => SESSION_EXPIRES,
    totpSecretFactory: () => TEST_SECRET,
    totpSecretProtector: TEST_PROTECTOR,
    totpVerifier: ({ encryptedTotpSecret, code }) =>
      encryptedTotpSecret === `v2:test-protected:${TEST_SECRET}` && code === STUB_CODE,
    ...overrides
  });
}

function setupSession(service, passwordService, accountId) {
  const plainPassword = issuePassword(passwordService, accountId);
  const result = service.verifyPasswordAndMaybeChallenge({ accountId, plainPassword });
  assert.equal(result.session.authMethod, "password");
  return result.session.sessionRef;
}

function createAdminService(store, clock, passwordService, overrides = {}) {
  return createPortalAccountAdminAuthService({
    controlStore: store,
    passwordCredentialService: passwordService,
    nowFn: () => clock.value,
    sessionSecret: "synthetic-admin-session-secret",
    accountId: "acct_admin_1",
    totpVerifier: ({ code }) => code === STUB_CODE,
    ...overrides
  });
}

function auditEvents(database, action) {
  const rows = action
    ? database.prepare("select * from platform_audit_events where entity_type = 'totp_enrollment' and action = ? order by rowid").all(action)
    : database.prepare("select * from platform_audit_events where entity_type = 'totp_enrollment' order by rowid").all();
  return rows.map((row) => ({
    id: row.id,
    entityType: row.entity_type,
    entityRef: row.entity_ref,
    action: row.action,
    actorRef: row.actor_ref,
    createdAt: row.created_at,
    metadata: JSON.parse(row.metadata_json)
  }));
}

function assertNoSecretMaterial(events) {
  const serialized = JSON.stringify(events);
  assert.equal(serialized.includes(TEST_SECRET), false);
  assert.equal(serialized.includes(STUB_CODE), false);
  assert.equal(serialized.includes("enc:"), false);
  assert.equal(serialized.includes("v2:test-protected"), false);
}

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(value) {
  const normalized = value.replace(/=+$/g, "").toUpperCase();
  let bits = "";
  for (const char of normalized) {
    bits += BASE32_ALPHABET.indexOf(char).toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

function hotpCode(secretBytes, counter) {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", secretBytes).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | (digest[offset + 1] << 16)
    | (digest[offset + 2] << 8)
    | digest[offset + 3];
  return String(binary % 10 ** 6).padStart(6, "0");
}

function currentTotpCode(secret, isoTime) {
  const counter = Math.floor(new Date(isoTime).getTime() / 1000 / 30);
  return hotpCode(base32Decode(secret), counter);
}

test("portal enrollment writes started, verified and bound audit events and then logs in with TOTP", () => {
  withStore(({ store, database, clock }) => {
    const passwordService = createPasswordService(store, clock);
    const service = createPortalService(store, clock, {
      passwordCredentialService: passwordService,
      allowPasswordOnlySessionForSetup: true
    });
    const sessionRef = setupSession(service, passwordService, "acct_portal_1");

    const started = service.startTotpEnrollment({ sessionRef });
    assert.equal(started.enrollment.enrollmentRef.startsWith("portal_totp_enroll_"), true);

    const startedEvents = auditEvents(database, "totp_enrollment_started");
    assert.equal(startedEvents.length, 1);
    assert.equal(startedEvents[0].entityRef, "acct_portal_1");
    assert.equal(startedEvents[0].actorRef, "acct_portal_1");
    assert.deepEqual(startedEvents[0].metadata, {
      enrollmentRef: started.enrollment.enrollmentRef,
      accountRef: "acct_portal_1",
      channel: "portal",
      issuedAt: NOW,
      expiresAt: "2026-05-31T00:05:00.000Z"
    });

    const confirmed = service.confirmTotpEnrollment({
      sessionRef,
      enrollmentRef: started.enrollment.enrollmentRef,
      code: STUB_CODE
    });
    assert.equal(confirmed.binding.status, "bound");

    const verified = auditEvents(database, "totp_enrollment_code_verified");
    assert.equal(verified.length, 1);
    assert.deepEqual(verified[0].metadata, {
      enrollmentRef: started.enrollment.enrollmentRef,
      accountRef: "acct_portal_1",
      channel: "portal",
      result: "verified",
      verifiedAt: NOW
    });

    const credential = store.getActivePortalTotpCredential("acct_portal_1");
    assert.equal(credential.status, "active");
    const bound = auditEvents(database, "totp_enrollment_bound");
    assert.equal(bound.length, 1);
    assert.deepEqual(bound[0].metadata, {
      enrollmentRef: started.enrollment.enrollmentRef,
      totpRef: credential.id,
      accountRef: "acct_portal_1",
      channel: "portal",
      enrolledAt: NOW,
      envelopeFormat: "v2",
      accountMatches: true
    });

    const loggedIn = service.verifyTotpAndCreateSession({ accountId: "acct_portal_1", code: STUB_CODE });
    assert.equal(loggedIn.session.authMethod, "totp");

    assertNoSecretMaterial(auditEvents(database));
  });
});

test("portal enrollment verifies a real TOTP code through the real protector and verifier", () => {
  withStore(({ store, database, clock }) => {
    const passwordService = createPasswordService(store, clock);
    const protector = createPortalTotpSecretProtector({ key: REAL_KEY_HEX });
    const verifier = createPortalTotpVerifier({ nowFn: () => clock.value, secretProtector: protector });
    const service = createPortalService(store, clock, {
      passwordCredentialService: passwordService,
      allowPasswordOnlySessionForSetup: true,
      totpSecretProtector: protector,
      totpVerifier: verifier
    });
    const sessionRef = setupSession(service, passwordService, "acct_portal_1");
    const started = service.startTotpEnrollment({ sessionRef });
    const code = currentTotpCode(TEST_SECRET, NOW);
    const confirmed = service.confirmTotpEnrollment({
      sessionRef,
      enrollmentRef: started.enrollment.enrollmentRef,
      code
    });
    assert.equal(confirmed.binding.status, "bound");
    const bound = auditEvents(database, "totp_enrollment_bound");
    assert.equal(bound.length, 1);
    assert.equal(bound[0].metadata.envelopeFormat, "v2");
    assert.equal(store.getActivePortalTotpCredential("acct_portal_1").status, "active");
    assertNoSecretMaterial(auditEvents(database));
  });
});

test("entry-path enrollment writes only a bound audit event with the consumed entry reference", () => {
  withStore(({ store, database, clock }) => {
    const service = createPortalService(store, clock);
    const issued = service.issueDynamicEntry({
      accountId: "acct_portal_1",
      entitlementId: "ent_acct_portal_1",
      approvalRef: "approval_portal_1",
      issuedByRef: "operator_safe_ref",
      expiresAt: FUTURE
    });
    const enrolled = service.enrollTotpCredential({
      entryToken: issued.handoffMaterial.entryToken,
      encryptedTotpSecret: `enc:${TEST_SECRET}`
    });
    assert.equal(enrolled.summary.action, "totp_enrolled");
    assert.equal(auditEvents(database, "totp_enrollment_started").length, 0);
    assert.equal(auditEvents(database, "totp_enrollment_code_verified").length, 0);
    const bound = auditEvents(database, "totp_enrollment_bound");
    assert.equal(bound.length, 1);
    assert.deepEqual(bound[0].metadata, {
      entryRef: "entry_portal_1",
      totpRef: enrolled.summary.credentialRef,
      accountRef: "acct_portal_1",
      channel: "entry",
      enrolledAt: NOW,
      envelopeFormat: "v2",
      accountMatches: true
    });
    assert.equal(store.getPortalEntry("entry_portal_1").status, "used");
    const loggedIn = service.verifyTotpAndCreateSession({ accountId: "acct_portal_1", code: STUB_CODE });
    assert.equal(loggedIn.session.authMethod, "totp");
    assertNoSecretMaterial(auditEvents(database));
  });
});

test("admin first enrollment writes started, verified and bound audit events with the enc envelope format", () => {
  withStore(({ store, database, clock }) => {
    const passwordService = createPasswordService(store, clock);
    const plainPassword = issuePassword(passwordService, "acct_admin_1");
    const auth = createAdminService(store, clock, passwordService);
    const started = auth.startBootstrap({ bootstrapToken: plainPassword });
    const enrollmentRef = started.enrollment.enrollmentRef;

    const startedEvents = auditEvents(database, "totp_enrollment_started");
    assert.equal(startedEvents.length, 1);
    assert.deepEqual(startedEvents[0].metadata, {
      enrollmentRef,
      accountRef: "acct_admin_1",
      channel: "admin",
      issuedAt: NOW,
      expiresAt: "2026-05-31T00:05:00.000Z"
    });

    const session = auth.confirmTotpEnrollment({ enrollmentRef, code: STUB_CODE });
    assert.equal(session.session.authMethod, "totp");

    const verified = auditEvents(database, "totp_enrollment_code_verified");
    assert.equal(verified.length, 1);
    assert.equal(verified[0].metadata.result, "verified");
    const bound = auditEvents(database, "totp_enrollment_bound");
    assert.equal(bound.length, 1);
    assert.equal(bound[0].metadata.envelopeFormat, "enc");
    assert.equal(bound[0].metadata.channel, "admin");
    assert.equal(bound[0].metadata.totpRef, store.getActivePortalTotpCredential("acct_admin_1").id);
    assertNoSecretMaterial(auditEvents(database));
  });
});

test("admin enrollment records a failed verification event and binds nothing on a wrong code", () => {
  withStore(({ store, database, clock }) => {
    const passwordService = createPasswordService(store, clock);
    const plainPassword = issuePassword(passwordService, "acct_admin_1");
    const auth = createAdminService(store, clock, passwordService);
    const started = auth.startBootstrap({ bootstrapToken: plainPassword });
    assert.throws(() => auth.confirmTotpEnrollment({
      enrollmentRef: started.enrollment.enrollmentRef,
      code: WRONG_CODE
    }), { code: "invalid_totp" });
    const verified = auditEvents(database, "totp_enrollment_code_verified");
    assert.equal(verified.length, 1);
    assert.equal(verified[0].metadata.result, "failed");
    assert.equal(auditEvents(database, "totp_enrollment_bound").length, 0);
    assert.equal(store.getActivePortalTotpCredential("acct_admin_1"), null);
  });
});

test("repeating a portal confirmation for the same enrollment is rejected and writes no second bound event", () => {
  withStore(({ store, database, clock }) => {
    const passwordService = createPasswordService(store, clock);
    const service = createPortalService(store, clock, {
      passwordCredentialService: passwordService,
      allowPasswordOnlySessionForSetup: true
    });
    const sessionRef = setupSession(service, passwordService, "acct_portal_1");
    const started = service.startTotpEnrollment({ sessionRef });
    service.confirmTotpEnrollment({
      sessionRef,
      enrollmentRef: started.enrollment.enrollmentRef,
      code: STUB_CODE
    });
    assert.throws(() => service.confirmTotpEnrollment({
      sessionRef,
      enrollmentRef: started.enrollment.enrollmentRef,
      code: STUB_CODE
    }), /portal TOTP enrollment is not active/);
    assert.equal(auditEvents(database, "totp_enrollment_bound").length, 1);
    assert.equal(auditEvents(database, "totp_enrollment_code_verified").length, 1);
  });
});

test("re-enrollment binds a new credential and leaves a complete proof trail for each enrollment", () => {
  withStore(({ store, database, clock }) => {
    const passwordService = createPasswordService(store, clock);
    const service = createPortalService(store, clock, {
      passwordCredentialService: passwordService,
      allowPasswordOnlySessionForSetup: true
    });
    const firstSession = setupSession(service, passwordService, "acct_portal_1");
    const first = service.startTotpEnrollment({ sessionRef: firstSession });
    service.confirmTotpEnrollment({
      sessionRef: firstSession,
      enrollmentRef: first.enrollment.enrollmentRef,
      code: STUB_CODE
    });
    const firstCredentialId = store.getActivePortalTotpCredential("acct_portal_1").id;

    const loggedIn = service.verifyTotpAndCreateSession({ accountId: "acct_portal_1", code: STUB_CODE });
    const second = service.startTotpEnrollment({ sessionRef: loggedIn.session.sessionRef });
    service.confirmTotpEnrollment({
      sessionRef: loggedIn.session.sessionRef,
      enrollmentRef: second.enrollment.enrollmentRef,
      code: STUB_CODE
    });
    const secondCredentialId = store.getActivePortalTotpCredential("acct_portal_1").id;

    assert.notEqual(secondCredentialId, firstCredentialId);
    assert.equal(auditEvents(database, "totp_enrollment_started").length, 2);
    assert.equal(auditEvents(database, "totp_enrollment_code_verified").length, 2);
    assert.equal(auditEvents(database, "totp_enrollment_bound").length, 2);
    // The disposition of the superseded credential (revoked vs left active)
    // is an open decision (P-4-1 in the B2-9 specification): this test
    // deliberately asserts nothing about the first credential's status.
    assert.equal(
      database.prepare("select count(*) from platform_portal_totp_credentials where account_id = 'acct_portal_1'").pluck().get(),
      2
    );
  });
});

test("confirming another account's enrollment is rejected and writes no binding evidence", () => {
  withStore(({ store, database, clock }) => {
    const passwordService = createPasswordService(store, clock);
    const service = createPortalService(store, clock, {
      passwordCredentialService: passwordService,
      allowPasswordOnlySessionForSetup: true
    });
    const sessionA = setupSession(service, passwordService, "acct_portal_1");
    const sessionB = setupSession(service, passwordService, "acct_portal_2");
    const started = service.startTotpEnrollment({ sessionRef: sessionA });
    assert.throws(() => service.confirmTotpEnrollment({
      sessionRef: sessionB,
      enrollmentRef: started.enrollment.enrollmentRef,
      code: STUB_CODE
    }), /portal TOTP enrollment is not active/);
    assert.equal(auditEvents(database, "totp_enrollment_started").length, 1);
    assert.equal(auditEvents(database, "totp_enrollment_code_verified").length, 0);
    assert.equal(auditEvents(database, "totp_enrollment_bound").length, 0);
    assert.equal(store.getActivePortalTotpCredential("acct_portal_1"), null);
    assert.equal(store.getActivePortalTotpCredential("acct_portal_2"), null);
  });
});

test("confirming an expired enrollment is rejected and writes no binding evidence", () => {
  withStore(({ store, database, clock }) => {
    const passwordService = createPasswordService(store, clock);
    const service = createPortalService(store, clock, {
      passwordCredentialService: passwordService,
      allowPasswordOnlySessionForSetup: true
    });
    const sessionRef = setupSession(service, passwordService, "acct_portal_1");
    const started = service.startTotpEnrollment({ sessionRef });
    clock.value = LATER; // 301 seconds later: past the 300-second enrollment TTL.
    assert.throws(() => service.confirmTotpEnrollment({
      sessionRef,
      enrollmentRef: started.enrollment.enrollmentRef,
      code: STUB_CODE
    }), /portal TOTP enrollment is expired/);
    assert.equal(auditEvents(database, "totp_enrollment_started").length, 1);
    assert.equal(auditEvents(database, "totp_enrollment_bound").length, 0);
  });
});

test("a failed confirmation is recorded, and a retry within the window binds with both verification events", () => {
  withStore(({ store, database, clock }) => {
    const passwordService = createPasswordService(store, clock);
    const service = createPortalService(store, clock, {
      passwordCredentialService: passwordService,
      allowPasswordOnlySessionForSetup: true
    });
    const sessionRef = setupSession(service, passwordService, "acct_portal_1");
    const started = service.startTotpEnrollment({ sessionRef });
    assert.throws(() => service.confirmTotpEnrollment({
      sessionRef,
      enrollmentRef: started.enrollment.enrollmentRef,
      code: WRONG_CODE
    }), /TOTP verification failed/);
    assert.equal(store.getActivePortalTotpCredential("acct_portal_1"), null);
    const confirmed = service.confirmTotpEnrollment({
      sessionRef,
      enrollmentRef: started.enrollment.enrollmentRef,
      code: STUB_CODE
    });
    assert.equal(confirmed.binding.status, "bound");
    const verified = auditEvents(database, "totp_enrollment_code_verified");
    assert.equal(verified.length, 2);
    assert.deepEqual(verified.map((event) => event.metadata.result), ["failed", "verified"]);
    assert.equal(auditEvents(database, "totp_enrollment_bound").length, 1);
    assertNoSecretMaterial(auditEvents(database));
  });
});

test("starting an enrollment without a protector fails and writes no audit event", () => {
  withStore(({ store, database, clock }) => {
    const passwordService = createPasswordService(store, clock);
    const service = createPortalService(store, clock, {
      passwordCredentialService: passwordService,
      allowPasswordOnlySessionForSetup: true,
      totpSecretProtector: null
    });
    const sessionRef = setupSession(service, passwordService, "acct_portal_1");
    assert.throws(() => service.startTotpEnrollment({ sessionRef }), /portal TOTP secret protector is required/);
    assert.equal(auditEvents(database).length, 0);
    assert.equal(store.getActivePortalTotpCredential("acct_portal_1"), null);
  });
});

test("a damaged v2 envelope fails verification and records only a failed verification event", () => {
  withStore(({ store, database, clock }) => {
    const passwordService = createPasswordService(store, clock);
    const realProtector = createPortalTotpSecretProtector({ key: REAL_KEY_HEX });
    const realVerifier = createPortalTotpVerifier({ nowFn: () => clock.value, secretProtector: realProtector });
    const service = createPortalService(store, clock, {
      passwordCredentialService: passwordService,
      allowPasswordOnlySessionForSetup: true,
      totpSecretProtector: { protect: () => "v2:aes-256-gcm:bad" },
      totpVerifier: realVerifier
    });
    const sessionRef = setupSession(service, passwordService, "acct_portal_1");
    const started = service.startTotpEnrollment({ sessionRef });
    assert.throws(() => service.confirmTotpEnrollment({
      sessionRef,
      enrollmentRef: started.enrollment.enrollmentRef,
      code: STUB_CODE
    }), /TOTP verification failed/);
    const verified = auditEvents(database, "totp_enrollment_code_verified");
    assert.equal(verified.length, 1);
    assert.equal(verified[0].metadata.result, "failed");
    assert.equal(auditEvents(database, "totp_enrollment_bound").length, 0);
    assert.equal(store.getActivePortalTotpCredential("acct_portal_1"), null);
  });
});

test("a protector returning an unrecognized envelope still binds, and the bound event records envelopeFormat unknown", () => {
  // Regression lock for portal-browser-session-routes: that suite's stub
  // protector returns a bare string with neither a v2: nor an enc: prefix.
  // Evidence must not become a second gate — the enrollment binds and the
  // bound event records the format as unknown instead of failing.
  withStore(({ store, database, clock }) => {
    const passwordService = createPasswordService(store, clock);
    const service = createPortalService(store, clock, {
      passwordCredentialService: passwordService,
      allowPasswordOnlySessionForSetup: true,
      totpSecretProtector: { protect: () => "synthetic-protected-totp" },
      totpVerifier: ({ code }) => code === STUB_CODE
    });
    const sessionRef = setupSession(service, passwordService, "acct_portal_1");
    const started = service.startTotpEnrollment({ sessionRef });
    const completed = service.confirmTotpEnrollment({
      sessionRef,
      enrollmentRef: started.enrollment.enrollmentRef,
      code: STUB_CODE
    });
    assert.equal(completed.binding.status, "bound");
    const credential = store.getActivePortalTotpCredential("acct_portal_1");
    assert.equal(credential.status, "active");
    const bound = auditEvents(database, "totp_enrollment_bound");
    assert.equal(bound.length, 1);
    assert.equal(bound[0].metadata.envelopeFormat, "unknown");
    assert.equal(bound[0].metadata.totpRef, credential.id);
    assert.equal(bound[0].metadata.accountMatches, true);
    assertNoSecretMaterial(bound);
  });
});

test("reusing a consumed entry is rejected and adds no second bound event", () => {
  // P2-1 (review fix): the entry-reuse rejection itself was covered by an
  // existing test elsewhere, but no test locked the audit invariant that
  // the bound event count stays at 1 after a reuse attempt.
  withStore(({ store, database, clock }) => {
    const service = createPortalService(store, clock);
    const issued = service.issueDynamicEntry({
      accountId: "acct_portal_1",
      entitlementId: "ent_acct_portal_1",
      approvalRef: "approval_portal_1",
      issuedByRef: "operator_safe_ref",
      expiresAt: FUTURE
    });
    service.enrollTotpCredential({
      entryToken: issued.handoffMaterial.entryToken,
      encryptedTotpSecret: `enc:${TEST_SECRET}`
    });
    assert.equal(auditEvents(database, "totp_enrollment_bound").length, 1);
    assert.throws(() => service.enrollTotpCredential({
      entryToken: issued.handoffMaterial.entryToken,
      encryptedTotpSecret: `enc:${TEST_SECRET}`
    }), /portal entry is not active/);
    assert.equal(auditEvents(database, "totp_enrollment_bound").length, 1);
    assert.equal(auditEvents(database, "totp_enrollment_started").length, 0);
    assert.equal(auditEvents(database, "totp_enrollment_code_verified").length, 0);
    assert.equal(
      database.prepare("select count(*) from platform_portal_totp_credentials where account_id = 'acct_portal_1'").pluck().get(),
      1
    );
    assertNoSecretMaterial(auditEvents(database));
  });
});

test("retrying after expiry is rejected again and writes no binding evidence", () => {
  // P2-1 (review fix): distinct from the single expired-confirm test —
  // the first expired attempt deletes the pending enrollment, so a second
  // attempt must fail differently and still write no bound event.
  withStore(({ store, database, clock }) => {
    const passwordService = createPasswordService(store, clock);
    const service = createPortalService(store, clock, {
      passwordCredentialService: passwordService,
      allowPasswordOnlySessionForSetup: true
    });
    const sessionRef = setupSession(service, passwordService, "acct_portal_1");
    const started = service.startTotpEnrollment({ sessionRef });
    clock.value = LATER; // 301 seconds later: past the 300-second enrollment TTL.
    assert.throws(() => service.confirmTotpEnrollment({
      sessionRef,
      enrollmentRef: started.enrollment.enrollmentRef,
      code: STUB_CODE
    }), /portal TOTP enrollment is expired/);
    assert.throws(() => service.confirmTotpEnrollment({
      sessionRef,
      enrollmentRef: started.enrollment.enrollmentRef,
      code: STUB_CODE
    }), /portal TOTP enrollment is not active/);
    assert.equal(auditEvents(database, "totp_enrollment_started").length, 1);
    assert.equal(auditEvents(database, "totp_enrollment_code_verified").length, 0);
    assert.equal(auditEvents(database, "totp_enrollment_bound").length, 0);
    assert.equal(store.getActivePortalTotpCredential("acct_portal_1"), null);
  });
});

test("a failing failed-verification audit write preserves the original verification error", () => {
  // P3-5 (review fix): the failed event is best-effort evidence. If its
  // write fails, the caller must still see the verification failure (so it
  // can retry with a correct code), not an audit error. The enrollment
  // stays pending and the retry's verified event still records the outcome.
  withStore(({ store, database, clock }) => {
    const passwordService = createPasswordService(store, clock);
    const service = createPortalService(store, clock, {
      passwordCredentialService: passwordService,
      allowPasswordOnlySessionForSetup: true
    });
    const originalRecordAuditEvent = store.recordAuditEvent.bind(store);
    store.recordAuditEvent = (input) => {
      if (input.action === "totp_enrollment_code_verified" && input.metadata?.result === "failed") {
        throw new Error("synthetic audit storage failure");
      }
      return originalRecordAuditEvent(input);
    };
    const sessionRef = setupSession(service, passwordService, "acct_portal_1");
    const started = service.startTotpEnrollment({ sessionRef });
    assert.throws(() => service.confirmTotpEnrollment({
      sessionRef,
      enrollmentRef: started.enrollment.enrollmentRef,
      code: "000000"
    }), /TOTP verification failed/);
    assert.equal(auditEvents(database, "totp_enrollment_code_verified").length, 0);
    assert.equal(store.getActivePortalTotpCredential("acct_portal_1"), null);
    const completed = service.confirmTotpEnrollment({
      sessionRef,
      enrollmentRef: started.enrollment.enrollmentRef,
      code: STUB_CODE
    });
    assert.equal(completed.binding.status, "bound");
    assert.equal(auditEvents(database, "totp_enrollment_code_verified").length, 1);
    assert.equal(auditEvents(database, "totp_enrollment_code_verified")[0].metadata.result, "verified");
    assert.equal(auditEvents(database, "totp_enrollment_bound").length, 1);
    assertNoSecretMaterial(auditEvents(database));
  });
});
