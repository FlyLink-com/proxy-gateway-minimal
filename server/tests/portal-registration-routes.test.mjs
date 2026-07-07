import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createApp } from "../app.mjs";
import { createPortalAccessRequestService } from "../services/platform/portal-access-requests.mjs";
import { createPortalHumanChallengeService } from "../services/platform/portal-human-challenge.mjs";
import { createPortalPasswordCredentialService } from "../services/platform/portal-password-credentials.mjs";
import { createPortalRegistrationEmailVerificationService } from "../services/platform/portal-registration-email-verification.mjs";
import { createPortalRegistrationService } from "../services/platform/portal-registration.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createUserPortalAuthService } from "../services/platform/user-portal-auth.mjs";
import { listen } from "./helpers/listen.mjs";

const NOW = "2026-06-30T09:00:00.000Z";
const SESSION_EXPIRES = "2026-06-30T09:30:00.000Z";
const ENTRY_EXPIRES = "2026-07-01T09:00:00.000Z";
const TRIAL_UNTIL = "2026-07-07T09:00:00.000Z";
const REGISTRATION_EMAIL_CODE = "246810";
const REGISTRATION_PASSWORD = "register-passphrase-1";
const LEGAL_AGREEMENT = {
  termsAccepted: true,
  privacyAccepted: true,
  termsVersion: "2026-07-02",
  privacyVersion: "2026-07-02"
};

function baseState(platform = {}) {
  return {
    rootDir: resolve(fileURLToPath(new URL("../../", import.meta.url))),
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: "secret",
    proxyConfig: { servers: [], pingHosts: [], nginx: { host: "127.0.0.1", ports: [] } },
    platform,
    services: {
      ssLocal: {
        start: async () => ({ ok: true }),
        stop: async () => ({ ok: true }),
        status: () => ({ running: false, starting: false })
      },
      httpProxy: {
        start: async () => ({ ok: true }),
        stop: async () => ({ ok: true }),
        status: () => ({ running: false, starting: false })
      }
    },
    isPortListening: async () => false
  };
}

function createHumanChallengeService() {
  let index = 0;
  return createPortalHumanChallengeService({
    nowFn: () => NOW,
    challengeRefFactory: () => `phc_registration_${++index}`,
    challengeFactory: () => ({ prompt: "8 + 5 = ?", answer: "13" })
  });
}

function createRegistrationEmailVerificationService(sentEmails) {
  let index = 0;
  return createPortalRegistrationEmailVerificationService({
    nowFn: () => NOW,
    codeFactory: () => REGISTRATION_EMAIL_CODE,
    verificationRefFactory: () => `reg_email_${++index}`,
    sender: async (message) => {
      sentEmails.push(message);
    }
  });
}

async function issueChallenge(baseUrl, scope) {
  const response = await fetch(`${baseUrl}/api/portal/human-challenges`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope })
  });
  assert.equal(response.status, 201);
  return (await response.json()).challenge;
}

async function issueRegistrationEmailVerification(baseUrl, email) {
  const response = await fetch(`${baseUrl}/api/portal/registration/email-verification`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email
    })
  });
  assert.equal(response.status, 201);
  return await response.json();
}

function withRegistrationState(fn, options = {}) {
  const tempDir = mkdtempSync(join(tmpdir(), "portal-registration-routes-"));
  const store = createSqliteSubscriptionControlStore({
    dbPath: join(tempDir, "control.sqlite")
  });
  const humanChallenges = createHumanChallengeService();
  const sentEmails = [];
  const registrationEmailVerifications = createRegistrationEmailVerificationService(sentEmails);
  let sessionIndex = 0;
  let passwordCredentialIndex = 0;
  const passwordCredentialService = createPortalPasswordCredentialService({
    controlStore: store,
    nowFn: () => NOW,
    credentialRefFactory: () => `pwd_registration_${++passwordCredentialIndex}`
  });
  const auth = createUserPortalAuthService({
    controlStore: store,
    nowFn: () => NOW,
    entryTokenFactory: () => "visible-once-registration-entry",
    entryRefFactory: () => "entry_registration_1",
    credentialRefFactory: () => "totp_registration_1",
    sessionRefFactory: () => `portal_session_registration_${++sessionIndex}`,
    sessionExpiresAtFactory: () => SESSION_EXPIRES,
    totpVerifier: ({ encryptedTotpSecret, code }) => encryptedTotpSecret === "enc:registration-totp" && code === "123456",
    passwordCredentialService,
    allowPasswordOnlySessionForSetup: true
  });
  let accountIndex = 0;
  let entitlementIndex = 0;
  let approvalIndex = 0;
  const accessRequests = createPortalAccessRequestService({
    controlStore: store,
    nowFn: () => NOW,
    requestIdFactory: () => options.requestIdFactory?.() || `pareq_registration_${accountIndex || 1}`
  });
  const registrations = createPortalRegistrationService({
    controlStore: store,
    userPortalAuth: auth,
    passwordCredentialService,
    portalAccessRequests: accessRequests,
    nowFn: () => NOW,
    accountIdFactory: () => options.accountIdFactory?.() || `acct_registration_${++accountIndex}`,
    entitlementIdFactory: () => options.entitlementIdFactory?.() || `ent_registration_trial_${++entitlementIndex}`,
    approvalRefFactory: () => options.approvalRefFactory?.() || `approval_registration_${++approvalIndex}`,
    entryExpiresAtFactory: () => ENTRY_EXPIRES,
    maxRegistrationsPerSourceIp: options.maxRegistrationsPerSourceIp,
    registrationRiskWindowMs: options.registrationRiskWindowMs
  });
  const cleanup = () => {
    store.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  };
  const result = fn({
    store,
    auth,
    accessRequests,
    registrations,
    humanChallenges,
    passwordCredentialService,
    registrationEmailVerifications,
    sentEmails
  });
  if (result && typeof result.then === "function") {
    return result.finally(cleanup);
  }
  cleanup();
  return result;
}

test("portal registration creates an email-login account, seven-day trial, and password session", async () => {
  await withRegistrationState(async ({
    store,
    auth,
    accessRequests,
    registrations,
    humanChallenges,
    registrationEmailVerifications,
    sentEmails
  }) => {
    const { server, baseUrl } = await listen(createApp(baseState({
      userPortalAuth: auth,
      portalAccessRequests: accessRequests,
      portalRegistrations: registrations,
      portalRegistrationEmailVerifications: registrationEmailVerifications,
      portalHumanChallenges: humanChallenges,
      userPortalRoutesEnabled: true
    })));
    try {
      const emailVerification = await issueRegistrationEmailVerification(baseUrl, "local-user@example.test");
      assert.equal(emailVerification.verification.status, "requested");
      assert.equal(emailVerification.verification.verificationRef, "reg_email_1");
      assert.equal(emailVerification.verification.safety.noRawCodeReturned, true);
      assert.equal(emailVerification.verification.safety.noRawEmailReturned, true);
      assert.equal(sentEmails.length, 1);
      assert.equal(sentEmails[0].email, "local-user@example.test");
      assert.equal(sentEmails[0].code, REGISTRATION_EMAIL_CODE);
      assert.equal(JSON.stringify(emailVerification).includes(REGISTRATION_EMAIL_CODE), false);
      assert.equal(JSON.stringify(emailVerification).includes("local-user@example.test"), false);

      const registrationResponse = await fetch(`${baseUrl}/api/portal/registration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "local-user@example.test",
          password: REGISTRATION_PASSWORD,
          legalAgreement: LEGAL_AGREEMENT,
          emailVerification: {
            verificationRef: emailVerification.verification.verificationRef,
            code: REGISTRATION_EMAIL_CODE
          }
        })
      });
      assert.equal(registrationResponse.status, 201);
      const registrationBody = await registrationResponse.json();

      assert.equal(registrationBody.registration.accountId, undefined);
      assert.equal(registrationBody.registration.userRef, "local-user@example.test");
      assert.equal(registrationBody.registration.status, "registered");
      assert.equal(registrationBody.registration.trial.durationDays, 7);
      assert.equal(registrationBody.registration.trial.validUntil, TRIAL_UNTIL);
      assert.equal(registrationBody.session.sessionRef, "portal_session_registration_1");
      assert.equal(registrationBody.session.accountId, undefined);
      assert.equal(registrationBody.session.userRef, "local-user@example.test");
      assert.equal(registrationBody.session.displayName, "local-user@example.test");
      assert.equal(registrationBody.session.authMethod, "password");
      assert.equal(registrationBody.handoff, undefined);
      assert.equal(registrationBody.registration.safety.noSubscriptionUrl, true);
      assert.equal(registrationBody.registration.safety.emailReturnedToAccountOwner, true);
      assert.equal(registrationBody.registration.safety.noInternalAccountIdReturned, true);
      assert.equal(registrationBody.registration.safety.rawPasswordReturned, false);

      const account = store.getAccount("acct_registration_1");
      assert.equal(account.id, "acct_registration_1");
      assert.equal(account.ownerRef, "acct_registration_1");
      assert.equal(account.status, "active");
      assert.equal(account.metadata.initialAccount, false);
      assert.equal(account.metadata.requireSecuritySetup, false);
      assert.equal(account.metadata.singleSubscriptionOnly, true);
      assert.equal(account.metadata.subscriptionLimit, 1);
      assert.equal(account.metadata.intentPlan, "trial");
      assert.equal(account.metadata.requestedDeviceCount, 1);
      assert.equal(account.metadata.primaryRegion, "japan");
      assert.equal(account.metadata.legalAgreementAccepted, true);
      assert.equal(account.metadata.legalAgreementAcceptedAt, NOW);
      assert.equal(account.metadata.termsVersion, "2026-07-02");
      assert.equal(account.metadata.privacyVersion, "2026-07-02");
      assert.equal(typeof account.metadata.legalAgreementSourceIpDigest, "string");
      assert.equal(typeof account.metadata.loginDigest, "string");
      assert.equal(account.metadata.loginRef, "local-user@example.test");
      assert.equal(account.metadata.displayRef, "local-user@example.test");
      assert.equal(typeof account.metadata.registrationSourceIpDigest, "string");
      assert.equal(store.getEntitlement("ent_registration_trial_1").validUntil, TRIAL_UNTIL);
      assert.equal(store.getPortalAccessRequest("pareq_registration_1").portalUserRef, "acct_registration_1");
      assert.equal(store.getActivePortalPasswordCredential("acct_registration_1").status, "active");

      const serializedRegistration = JSON.stringify(registrationBody);
      assert.equal(serializedRegistration.includes("local-user@example.test"), true);
      assert.equal(serializedRegistration.includes("acct_registration_1"), false);
      assert.equal(serializedRegistration.includes(REGISTRATION_PASSWORD), false);
      assert.equal(serializedRegistration.includes(REGISTRATION_EMAIL_CODE), false);
      assert.equal(serializedRegistration.includes("subscriptionUrl"), false);

      const passwordChallenge = await issueChallenge(baseUrl, "portal_login");
      const passwordResponse = await fetch(`${baseUrl}/api/portal/password/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: "local-user@example.test",
          password: REGISTRATION_PASSWORD,
          humanVerification: {
            challengeRef: passwordChallenge.challengeRef,
            answer: "13"
          }
        })
      });
      assert.equal(passwordResponse.status, 200);
      const sessionBody = await passwordResponse.json();
      assert.equal(sessionBody.session.sessionRef, "portal_session_registration_2");
      assert.equal(sessionBody.session.accountId, undefined);
      assert.equal(sessionBody.session.userRef, "local-user@example.test");
      assert.equal(sessionBody.session.displayName, "local-user@example.test");
      assert.equal(sessionBody.session.authMethod, "password");
      assert.equal(store.listPortalSessions({ accountId: "acct_registration_1" }).length, 2);

      const serializedLogin = JSON.stringify({ sessionBody });
      assert.equal(serializedLogin.includes(REGISTRATION_PASSWORD), false);
      assert.equal(serializedLogin.includes("local-user@example.test"), true);
      assert.equal(serializedLogin.includes("acct_registration_1"), false);
    } finally {
      server.close();
    }
  });
});

test("portal registration requires verified email before creating account records", async () => {
  await withRegistrationState(async ({
    store,
    auth,
    accessRequests,
    registrations,
    humanChallenges,
    registrationEmailVerifications
  }) => {
    const { server, baseUrl } = await listen(createApp(baseState({
      userPortalAuth: auth,
      portalAccessRequests: accessRequests,
      portalRegistrations: registrations,
      portalRegistrationEmailVerifications: registrationEmailVerifications,
      portalHumanChallenges: humanChallenges,
      userPortalRoutesEnabled: true
    })));
    try {
      const response = await fetch(`${baseUrl}/api/portal/registration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "local-user@example.test",
          password: REGISTRATION_PASSWORD
        })
      });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: "email_verification_required" });
      assert.equal(store.getAccount("acct_registration_1"), null);
      assert.equal(store.getPortalAccessRequest("pareq_registration_1"), null);
    } finally {
      server.close();
    }
  });
});

test("portal registration requires explicit legal agreement before creating account records", async () => {
  await withRegistrationState(async ({
    store,
    auth,
    accessRequests,
    registrations,
    humanChallenges,
    registrationEmailVerifications
  }) => {
    const { server, baseUrl } = await listen(createApp(baseState({
      userPortalAuth: auth,
      portalAccessRequests: accessRequests,
      portalRegistrations: registrations,
      portalRegistrationEmailVerifications: registrationEmailVerifications,
      portalHumanChallenges: humanChallenges,
      userPortalRoutesEnabled: true
    })));
    try {
      const emailVerification = await issueRegistrationEmailVerification(baseUrl, "local-user@example.test");
      const response = await fetch(`${baseUrl}/api/portal/registration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "local-user@example.test",
          password: REGISTRATION_PASSWORD,
          emailVerification: {
            verificationRef: emailVerification.verification.verificationRef,
            code: REGISTRATION_EMAIL_CODE
          }
        })
      });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: "legal_agreement_required" });
      assert.equal(store.getAccount("acct_registration_1"), null);
      assert.equal(store.getPortalAccessRequest("pareq_registration_1"), null);
    } finally {
      server.close();
    }
  });
});

test("portal registration rejects invalid email verification without creating account records", async () => {
  await withRegistrationState(async ({
    store,
    auth,
    accessRequests,
    registrations,
    humanChallenges,
    registrationEmailVerifications
  }) => {
    const { server, baseUrl } = await listen(createApp(baseState({
      userPortalAuth: auth,
      portalAccessRequests: accessRequests,
      portalRegistrations: registrations,
      portalRegistrationEmailVerifications: registrationEmailVerifications,
      portalHumanChallenges: humanChallenges,
      userPortalRoutesEnabled: true
    })));
    try {
      const emailVerification = await issueRegistrationEmailVerification(baseUrl, "local-user@example.test");
      const response = await fetch(`${baseUrl}/api/portal/registration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "local-user@example.test",
          password: REGISTRATION_PASSWORD,
          legalAgreement: LEGAL_AGREEMENT,
          emailVerification: {
            verificationRef: emailVerification.verification.verificationRef,
            code: "000000"
          }
        })
      });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: "email_verification_failed" });
      assert.equal(store.getAccount("acct_registration_1"), null);
      assert.equal(store.getPortalAccessRequest("pareq_registration_1"), null);
    } finally {
      server.close();
    }
  });
});

test("portal registration email verification is single-use", async () => {
  await withRegistrationState(async ({
    store,
    auth,
    accessRequests,
    registrations,
    humanChallenges,
    registrationEmailVerifications
  }) => {
    const { server, baseUrl } = await listen(createApp(baseState({
      userPortalAuth: auth,
      portalAccessRequests: accessRequests,
      portalRegistrations: registrations,
      portalRegistrationEmailVerifications: registrationEmailVerifications,
      portalHumanChallenges: humanChallenges,
      userPortalRoutesEnabled: true
    })));
    try {
      const emailVerification = await issueRegistrationEmailVerification(baseUrl, "local-user@example.test");
      const basePayload = {
        email: "local-user@example.test",
        password: REGISTRATION_PASSWORD,
        legalAgreement: LEGAL_AGREEMENT,
        emailVerification: {
          verificationRef: emailVerification.verification.verificationRef,
          code: REGISTRATION_EMAIL_CODE
        }
      };
      const firstResponse = await fetch(`${baseUrl}/api/portal/registration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(basePayload)
      });
      assert.equal(firstResponse.status, 201);
      assert.equal(store.getAccount("acct_registration_1").id, "acct_registration_1");

      const replayResponse = await fetch(`${baseUrl}/api/portal/registration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...basePayload,
          accountId: "acct_registration_replay"
        })
      });
      assert.equal(replayResponse.status, 400);
      assert.deepEqual(await replayResponse.json(), { error: "email_verification_failed" });
      assert.equal(store.getAccount("acct_registration_replay"), null);
    } finally {
      server.close();
    }
  });
});

test("portal registration blocks duplicate email from receiving another trial", async () => {
  await withRegistrationState(async ({
    store,
    auth,
    accessRequests,
    registrations,
    humanChallenges,
    registrationEmailVerifications
  }) => {
    const { server, baseUrl } = await listen(createApp(baseState({
      userPortalAuth: auth,
      portalAccessRequests: accessRequests,
      portalRegistrations: registrations,
      portalRegistrationEmailVerifications: registrationEmailVerifications,
      portalHumanChallenges: humanChallenges,
      userPortalRoutesEnabled: true
    })));
    try {
      const firstVerification = await issueRegistrationEmailVerification(baseUrl, "local-user@example.test");
      const firstResponse = await fetch(`${baseUrl}/api/portal/registration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "local-user@example.test",
          password: REGISTRATION_PASSWORD,
          legalAgreement: LEGAL_AGREEMENT,
          emailVerification: {
            verificationRef: firstVerification.verification.verificationRef,
            code: REGISTRATION_EMAIL_CODE
          }
        })
      });
      assert.equal(firstResponse.status, 201);

      const duplicateVerification = await issueRegistrationEmailVerification(baseUrl, "local-user@example.test");
      const duplicateResponse = await fetch(`${baseUrl}/api/portal/registration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "local-user@example.test",
          password: "another-register-passphrase-1",
          legalAgreement: LEGAL_AGREEMENT,
          emailVerification: {
            verificationRef: duplicateVerification.verification.verificationRef,
            code: REGISTRATION_EMAIL_CODE
          }
        })
      });
      assert.equal(duplicateResponse.status, 409);
      assert.deepEqual(await duplicateResponse.json(), { error: "account_already_exists" });
      assert.equal(store.getAccount("acct_registration_2"), null);
    } finally {
      server.close();
    }
  });
});

test("portal registration rate-limits repeated trial registrations from the same source IP", async () => {
  await withRegistrationState(async ({
    store,
    auth,
    accessRequests,
    registrations,
    humanChallenges,
    registrationEmailVerifications
  }) => {
    const { server, baseUrl } = await listen(createApp(baseState({
      userPortalAuth: auth,
      portalAccessRequests: accessRequests,
      portalRegistrations: registrations,
      portalRegistrationEmailVerifications: registrationEmailVerifications,
      portalHumanChallenges: humanChallenges,
      userPortalRoutesEnabled: true
    })));
    try {
      const firstVerification = await issueRegistrationEmailVerification(baseUrl, "first-user@example.test");
      const firstResponse = await fetch(`${baseUrl}/api/portal/registration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "first-user@example.test",
          password: REGISTRATION_PASSWORD,
          legalAgreement: LEGAL_AGREEMENT,
          emailVerification: {
            verificationRef: firstVerification.verification.verificationRef,
            code: REGISTRATION_EMAIL_CODE
          }
        })
      });
      assert.equal(firstResponse.status, 201);

      const secondVerification = await issueRegistrationEmailVerification(baseUrl, "second-user@example.test");
      const secondResponse = await fetch(`${baseUrl}/api/portal/registration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "second-user@example.test",
          password: "second-register-passphrase-1",
          legalAgreement: LEGAL_AGREEMENT,
          emailVerification: {
            verificationRef: secondVerification.verification.verificationRef,
            code: REGISTRATION_EMAIL_CODE
          }
        })
      });
      assert.equal(secondResponse.status, 429);
      assert.deepEqual(await secondResponse.json(), { error: "registration_rate_limited" });
      assert.equal(store.getAccount("acct_registration_2"), null);
    } finally {
      server.close();
    }
  }, {
    maxRegistrationsPerSourceIp: 1
  });
});
