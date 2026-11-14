import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createPortalPasswordCredentialService } from "../services/platform/portal-password-credentials.mjs";
import { createUserPortalAuthService } from "../services/platform/user-portal-auth.mjs";

const NOW = "2026-05-31T00:00:00.000Z";
const FUTURE = "2099-06-04T00:00:00.000Z";
const SESSION_EXPIRES = "2026-05-31T00:30:00.000Z";
const TEST_TOTP_SECRET_PROTECTOR = {
  protect: (secret) => `v2:test-protected:${secret}`
};

function withStore(fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "platform-user-portal-auth-"));
  let store;
  try {
    store = createSqliteSubscriptionControlStore({
      dbPath: join(tempDir, "control.sqlite")
    });
    seedAccountAndEntitlement(store);
    return fn(store);
  } finally {
    store?.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

function seedAccountAndEntitlement(store) {
  store.createAccount({
    id: "acct_portal_1",
    ownerRef: "owner_safe_ref",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
    metadata: {
      loginRef: "Portal.User@example.test",
      displayRef: "Portal.User@example.test"
    }
  });
  store.createEntitlement({
    id: "ent_portal_1",
    accountId: "acct_portal_1",
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

function createService(store, overrides = {}) {
  return createUserPortalAuthService({
    controlStore: store,
    nowFn: () => NOW,
    entryTokenFactory: () => "portal-entry-raw-secret",
    entryRefFactory: () => "entry_portal_1",
    credentialRefFactory: () => "totp_cred_1",
    secondFactorChallengeRefFactory: () => "mfa_challenge_1",
    sessionRefFactory: () => "portal_session_1",
    sessionExpiresAtFactory: () => SESSION_EXPIRES,
    totpSecretProtector: TEST_TOTP_SECRET_PROTECTOR,
    totpVerifier: ({ encryptedTotpSecret, code }) => encryptedTotpSecret === "v2:test-protected:totp-secret" && code === "123456",
    ...overrides
  });
}

function createPasswordService(store) {
  return createPortalPasswordCredentialService({
    controlStore: store,
    nowFn: () => NOW,
    saltFactory: () => Buffer.from("0123456789abcdef", "utf8"),
    credentialRefFactory: () => "pwd_cred_auth_1"
  });
}

function buildTestPassword() {
  return randomUUID();
}

test("user portal auth issues dynamic entry with hash-only storage and visible-once handoff", () => {
  withStore((store) => {
    const service = createService(store);
    const result = service.issueDynamicEntry({
      accountId: "acct_portal_1",
      entitlementId: "ent_portal_1",
      approvalRef: "approval_portal_1",
      issuedByRef: "operator_safe_ref",
      expiresAt: FUTURE
    });

    assert.equal(result.summary.action, "portal_entry_issued");
    assert.equal(result.summary.entryRef, "entry_portal_1");
    assert.equal(result.summary.rawTokenReturned, false);
    assert.equal(result.handoffMaterial.entryToken, "portal-entry-raw-secret");

    const stored = store.getPortalEntry("entry_portal_1");
    assert.notEqual(stored.tokenHash, "portal-entry-raw-secret");
    assert.match(stored.tokenHash, /^portalentryhash_[a-f0-9]{64}$/);
    assert.equal(stored.status, "active");
    assert.equal(stored.useCount, 0);

    const serialized = JSON.stringify(result.summary);
    assert.equal(serialized.includes("portal-entry-raw-secret"), false);
    assert.equal(serialized.includes("subscriptionUrl"), false);
    assert.equal(serialized.includes("token="), false);
  });
});

test("user portal auth consumes entry, enrolls TOTP, and creates a scoped session", () => {
  withStore((store) => {
    const service = createService(store);
    const issued = service.issueDynamicEntry({
      accountId: "acct_portal_1",
      entitlementId: "ent_portal_1",
      approvalRef: "approval_portal_1",
      issuedByRef: "operator_safe_ref",
      expiresAt: FUTURE
    });

    const enrollment = service.enrollTotpCredential({
      entryToken: issued.handoffMaterial.entryToken,
      encryptedTotpSecret: "enc:totp-secret"
    });
    assert.equal(enrollment.summary.action, "totp_enrolled");
    assert.equal(enrollment.summary.accountId, "acct_portal_1");
    assert.equal(enrollment.summary.credentialRef, "totp_cred_1");
    assert.equal(store.getPortalEntry("entry_portal_1").status, "used");

    const verified = service.verifyTotpAndCreateSession({
      accountId: "acct_portal_1",
      code: "123456"
    });
    assert.equal(verified.session.sessionRef, "portal_session_1");
    assert.equal(verified.session.authMethod, "totp");
    assert.equal(verified.session.expiresAt, SESSION_EXPIRES);

    const serialized = JSON.stringify({ enrollment, verified });
    assert.equal(serialized.includes("enc:totp-secret"), false);
    assert.equal(serialized.includes("123456"), false);
    assert.equal(serialized.includes("portal-entry-raw-secret"), false);
  });
});

test("user portal auth rejects reused entries and failed TOTP without creating sessions", () => {
  withStore((store) => {
    const service = createService(store);
    const issued = service.issueDynamicEntry({
      accountId: "acct_portal_1",
      entitlementId: "ent_portal_1",
      approvalRef: "approval_portal_1",
      issuedByRef: "operator_safe_ref",
      expiresAt: FUTURE
    });

    service.enrollTotpCredential({
      entryToken: issued.handoffMaterial.entryToken,
      encryptedTotpSecret: "enc:totp-secret"
    });

    assert.throws(() => service.enrollTotpCredential({
      entryToken: issued.handoffMaterial.entryToken,
      encryptedTotpSecret: "enc:totp-secret-2"
    }), /portal entry is not active/);

    assert.throws(() => service.verifyTotpAndCreateSession({
      accountId: "acct_portal_1",
      code: "000000"
    }), /TOTP verification failed/);

    const credential = store.getActivePortalTotpCredential("acct_portal_1");
    assert.equal(credential.failureCount, 1);
    assert.equal(store.listPortalSessions({ accountId: "acct_portal_1" }).length, 0);
  });
});

test("user portal auth creates first-login setup session from password when policy allows no factor", () => {
  withStore((store) => {
    const passwordService = createPasswordService(store);
    const plainPassword = buildTestPassword();
    passwordService.issueInitialPasswordCredential({
      accountId: "acct_portal_1",
      plainPassword,
      issuedByRef: "operator_safe_ref",
      approvalRef: "approval_portal_password"
    });
    const service = createService(store, {
      passwordCredentialService: passwordService,
      allowPasswordOnlySessionForSetup: true
    });

    const verified = service.verifyPasswordAndMaybeChallenge({
      accountId: "acct_portal_1",
      plainPassword
    });
    assert.equal(verified.session.sessionRef, "portal_session_1");
    assert.equal(verified.session.authMethod, "password");
    assert.equal(verified.session.expiresAt, SESSION_EXPIRES);

    const serialized = JSON.stringify(verified);
    assert.equal(serialized.includes(plainPassword), false);
    assert.doesNotMatch(serialized, /passwordHash|scrypt\$v=1/);
  });
});

test("user portal auth accepts a unique loginRef for password login", () => {
  withStore((store) => {
    const passwordService = createPasswordService(store);
    const plainPassword = buildTestPassword();
    passwordService.issueInitialPasswordCredential({
      accountId: "acct_portal_1",
      plainPassword,
      issuedByRef: "operator_safe_ref",
      approvalRef: "approval_portal_password"
    });
    const service = createService(store, {
      passwordCredentialService: passwordService,
      allowPasswordOnlySessionForSetup: true
    });

    const verified = service.verifyPasswordAndMaybeChallenge({
      accountId: " portal.user@example.test ",
      plainPassword
    });
    assert.equal(verified.session.sessionRef, "portal_session_1");
    assert.equal(verified.session.accountId, "acct_portal_1");
    assert.equal(verified.session.authMethod, "password");
    assert.equal(store.listPortalSessions({ accountId: "acct_portal_1" }).length, 1);

    const serialized = JSON.stringify(verified);
    assert.equal(serialized.includes(plainPassword), false);
    assert.doesNotMatch(serialized, /passwordHash|scrypt\$v=1/);
  });
});

test("user portal auth requires second factor after password when TOTP is enabled", () => {
  withStore((store) => {
    const passwordService = createPasswordService(store);
    const plainPassword = buildTestPassword();
    passwordService.issueInitialPasswordCredential({
      accountId: "acct_portal_1",
      plainPassword,
      issuedByRef: "operator_safe_ref",
      approvalRef: "approval_portal_password"
    });
    const service = createService(store, {
      passwordCredentialService: passwordService
    });
    const issued = service.issueDynamicEntry({
      accountId: "acct_portal_1",
      entitlementId: "ent_portal_1",
      approvalRef: "approval_portal_1",
      issuedByRef: "operator_safe_ref",
      expiresAt: FUTURE
    });
    service.enrollTotpCredential({
      entryToken: issued.handoffMaterial.entryToken,
      encryptedTotpSecret: "enc:totp-secret"
    });

    const challenge = service.verifyPasswordAndMaybeChallenge({
      accountId: "acct_portal_1",
      plainPassword
    });
    assert.equal(challenge.result.status, "second_factor_required");
    assert.equal(challenge.result.challengeRef, "mfa_challenge_1");
    assert.deepEqual(challenge.result.availableFactors, ["totp"]);
    assert.equal(store.listPortalSessions({ accountId: "acct_portal_1" }).length, 0);

    assert.throws(() => service.completeSecondFactor({
      challengeRef: "mfa_challenge_1",
      factor: "totp",
      code: "000000"
    }), /TOTP verification failed/);
    assert.equal(store.listPortalSessions({ accountId: "acct_portal_1" }).length, 0);

    const completed = service.completeSecondFactor({
      challengeRef: "mfa_challenge_1",
      factor: "totp",
      code: "123456"
    });
    assert.equal(completed.session.sessionRef, "portal_session_1");
    assert.equal(completed.session.authMethod, "totp");
    assert.equal(store.getPortalSecondFactorChallenge("mfa_challenge_1").status, "used");

    const serialized = JSON.stringify({ challenge, completed });
    assert.equal(serialized.includes(plainPassword), false);
    assert.doesNotMatch(serialized, /passwordHash|scrypt\$v=1|enc:totp-secret|123456/);
  });
});

test("user portal auth keeps locked TOTP as a required second factor for password login", () => {
  withStore((store) => {
    const passwordService = createPasswordService(store);
    const plainPassword = buildTestPassword();
    passwordService.issueInitialPasswordCredential({
      accountId: "acct_portal_1",
      plainPassword,
      issuedByRef: "operator_safe_ref",
      approvalRef: "approval_portal_password_locked_totp"
    });
    const service = createService(store, {
      passwordCredentialService: passwordService,
      allowPasswordOnlySessionForSetup: true,
      totpVerifier: () => false,
      totpMaxFailures: 2,
      totpLockSeconds: 900
    });
    const issued = service.issueDynamicEntry({
      accountId: "acct_portal_1",
      entitlementId: "ent_portal_1",
      approvalRef: "approval_portal_1",
      issuedByRef: "operator_safe_ref",
      expiresAt: FUTURE
    });
    service.enrollTotpCredential({
      entryToken: issued.handoffMaterial.entryToken,
      encryptedTotpSecret: "enc:totp-secret"
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      assert.throws(() => service.verifyTotpAndCreateSession({
        accountId: "acct_portal_1",
        code: "000000"
      }), /TOTP verification failed/);
    }

    const credential = store.getPortalTotpCredential("totp_cred_1");
    assert.equal(credential.lockedUntil, "2026-05-31T00:15:00.000Z");

    const challenge = service.verifyPasswordAndMaybeChallenge({
      accountId: "acct_portal_1",
      plainPassword
    });
    assert.equal(Object.hasOwn(challenge, "session"), false);
    assert.equal(Object.hasOwn(challenge, "result"), true);
    assert.equal(challenge.result.status, "second_factor_required");
    assert.deepEqual(challenge.result.availableFactors, ["totp"]);
    assert.equal(store.listPortalSessions({ accountId: "acct_portal_1" }).length, 0);
  });
});

test("user portal auth requires a TOTP secret protector before setup enrollment", () => {
  withStore((store) => {
    const passwordService = createPasswordService(store);
    const plainPassword = buildTestPassword();
    passwordService.issueInitialPasswordCredential({
      accountId: "acct_portal_1",
      plainPassword,
      issuedByRef: "operator_safe_ref",
      approvalRef: "approval_portal_password_totp_setup"
    });
    const service = createService(store, {
      passwordCredentialService: passwordService,
      allowPasswordOnlySessionForSetup: true,
      totpSecretProtector: null
    });
    const session = service.verifyPasswordAndMaybeChallenge({
      accountId: "acct_portal_1",
      plainPassword
    });

    assert.throws(() => service.startTotpEnrollment({
      sessionRef: session.session.sessionRef
    }), /portal TOTP secret protector is required/);
    assert.equal(store.getActivePortalTotpCredential("acct_portal_1"), null);
  });
});

test("user portal auth protects dynamic entry TOTP enrollment before persistence", () => {
  withStore((store) => {
    const service = createService(store, {
      totpSecretProtector: {
        protect: (secret) => `v2:test-protected:${secret}`
      },
      totpVerifier: ({ encryptedTotpSecret, code }) => encryptedTotpSecret === "v2:test-protected:totp-secret" && code === "123456"
    });
    const issued = service.issueDynamicEntry({
      accountId: "acct_portal_1",
      entitlementId: "ent_portal_1",
      approvalRef: "approval_portal_1",
      issuedByRef: "operator_safe_ref",
      expiresAt: FUTURE
    });

    service.enrollTotpCredential({
      entryToken: issued.handoffMaterial.entryToken,
      encryptedTotpSecret: "enc:totp-secret"
    });

    const stored = store.getActivePortalTotpCredential("acct_portal_1");
    assert.equal(stored.encryptedTotpSecret, "v2:test-protected:totp-secret");
    assert.equal(stored.encryptedTotpSecret.startsWith("enc:"), false);
  });
});

test("user portal auth rejects TOTP verification when the credential is revoked", () => {
  withStore((store) => {
    const service = createService(store);
    store.createPortalTotpCredential({
      id: "totp_cred_revoked",
      accountId: "acct_portal_1",
      encryptedTotpSecret: "v2:test-protected:totp-secret",
      status: "revoked",
      failureCount: 0,
      enrolledAt: NOW,
      revokedAt: NOW,
      updatedAt: NOW
    });

    assert.equal(store.getActivePortalTotpCredential("acct_portal_1"), null);
    assert.throws(() => service.verifyTotpAndCreateSession({
      accountId: "acct_portal_1",
      code: "123456"
    }), /active portal TOTP credential not found/);
    assert.equal(store.listPortalSessions({ accountId: "acct_portal_1" }).length, 0);
  });
});

test("user portal auth rejects TOTP verification when no credential row exists", () => {
  withStore((store) => {
    const service = createService(store);

    assert.equal(store.getActivePortalTotpCredential("acct_portal_1"), null);
    assert.throws(() => service.verifyTotpAndCreateSession({
      accountId: "acct_portal_1",
      code: "123456"
    }), /active portal TOTP credential not found/);
    assert.equal(store.listPortalSessions({ accountId: "acct_portal_1" }).length, 0);
  });
});

test("user portal auth fails closed when the TOTP credential store is unavailable", () => {
  const service = createUserPortalAuthService({
    controlStore: {
      getActivePortalTotpCredential: () => {
        throw new Error("control store unavailable");
      }
    },
    nowFn: () => NOW,
    totpVerifier: () => true
  });

  assert.throws(() => service.verifyTotpAndCreateSession({
    accountId: "acct_portal_1",
    code: "123456"
  }), /control store unavailable/);
});
