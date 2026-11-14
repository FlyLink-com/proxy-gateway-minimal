import Database from "better-sqlite3";
import { applyPaymentStoreMigrations } from "../services/platform/payment-store-migrations.mjs";
import { applyPortalReferralMigration, REFERRAL_MIGRATION_ID, REFERRAL_DDL_CHECKSUM } from "../services/platform/portal-referral-migrations.mjs";
import { createPortalReferralService } from "../services/platform/portal-referral-service.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { request as httpRequest } from "node:http";
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
import {
  applyCoinWalletMigrations,
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID
} from "../services/platform/coin-wallet-migrations.mjs";
import {
  applyPortalRegistrationWelcomeBonusMigrations,
  PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATIONS,
  REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID
} from "../services/platform/portal-registration-welcome-bonus-migrations.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import {
  PORTAL_COMMERCE_MODE_LEGACY,
  resolveWalletFirstCommerceMode
} from "../services/platform/wallet-first-commerce-service.mjs";
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

function registrationEmailHash(email) {
  return createHash("sha256")
    .update(String(email).trim().toLowerCase())
    .digest("hex");
}

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
  const controlDbPath = join(tempDir, "control.sqlite");
  const store = createSqliteSubscriptionControlStore({
    dbPath: controlDbPath
  });
  if (options.registrationWelcomeCoinsEnabled === true) {
    applyCoinWalletMigrations({
      dbPath: controlDbPath,
      expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
      expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
      nowFn: () => new Date(NOW)
    });
    applyPortalRegistrationWelcomeBonusMigrations({
      dbPath: controlDbPath,
      expectedMigrationId: REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID,
    expectedDdlChecksum: PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATIONS.at(-1).ddlChecksum,
      nowFn: () => new Date(NOW)
    });
  }
  let referralDatabase = null, referrals = null;
  if (options.referralsEnabled === true) {
    applyCoinWalletMigrations({dbPath:controlDbPath,expectedMigrationId:REQUIRED_COIN_WALLET_MIGRATION_ID,
      expectedDdlChecksum:COIN_WALLET_MIGRATIONS[0].ddlChecksum,nowFn:()=>new Date(NOW)});
    referralDatabase = new Database(controlDbPath);
    applyPaymentStoreMigrations({database:referralDatabase,nowFn:()=>NOW});
    applyPortalReferralMigration(referralDatabase,{expectedMigrationId:REFERRAL_MIGRATION_ID,expectedDdlChecksum:REFERRAL_DDL_CHECKSUM});
    const rewardsEnabled = options.referralRewardsEnabled ?? true;
    referrals=createPortalReferralService({database:referralDatabase,nowFn:()=>new Date(NOW),
      rewardsEnabled,attributionDays:options.referralAttributionDays});
    if (rewardsEnabled) referrals.publishPolicy({policyRef:'synthetic_referral',version:1,effectiveAt:NOW,rateBps:1000,rounding:'floor',attributionDays:7,confirmationDays:2});
    store.createAccount({id:'test_promoter',ownerRef:'test_owner',status:'active',createdAt:NOW,updatedAt:NOW,metadata:{}});
  }
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
    welcomeCoinGrantRefFactory: () => options.welcomeCoinGrantRefFactory?.()
      || `welcome_grant_registration_${accountIndex || 1}`,
    registrationWelcomeCoinsEnabled: options.registrationWelcomeCoinsEnabled,
    referralsEnabled: options.referralsEnabled,
    ...(options.registrationWelcomeCoinsEnabled === true
      ? {
        registrationWelcomeCoinsCanaryEmailEligibilityReader:
          options.registrationWelcomeCoinsCanaryEmailEligibilityReader
          || (({ emailDigest }) => (
            emailDigest === registrationEmailHash("welcome-coins@example.test")
          ))
      }
      : {}),
    entryExpiresAtFactory: () => ENTRY_EXPIRES,
    maxRegistrationsPerSourceIp: options.maxRegistrationsPerSourceIp,
    registrationRiskWindowMs: options.registrationRiskWindowMs
  });
  const cleanup = () => {
    referrals?.close();referralDatabase?.close();
    store.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  };
  const result = fn({
    referrals, referralDatabase,
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
      assert.equal(registrationBody.registration.userRef, "lo***@example.test");
      assert.equal(registrationBody.registration.status, "registered");
      assert.equal(registrationBody.registration.commercialModel, "legacy");
      assert.equal(registrationBody.registration.trial.durationDays, 7);
      assert.equal(registrationBody.registration.trial.validUntil, TRIAL_UNTIL);
      assert.equal(registrationBody.session.sessionRef, "portal_session_registration_1");
      assert.equal(registrationBody.session.accountId, undefined);
      assert.equal(registrationBody.session.userRef, "lo***@example.test");
      assert.equal(registrationBody.session.displayName, "lo***@example.test");
      assert.equal(registrationBody.session.authMethod, "password");
      assert.equal(registrationBody.handoff, undefined);
      assert.equal(registrationBody.registration.safety.noSubscriptionUrl, true);
      assert.equal(registrationBody.registration.safety.maskedEmailReturnedToAccountOwner, true);
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
      assert.equal(
        store.getEntitlement("ent_registration_trial_1").trafficLimitBytes,
        5 * 1024 ** 3
      );
      assert.equal(store.getPortalAccessRequest("pareq_registration_1").portalUserRef, "acct_registration_1");
      assert.equal(store.getActivePortalPasswordCredential("acct_registration_1").status, "active");

      const serializedRegistration = JSON.stringify(registrationBody);
      assert.equal(serializedRegistration.includes("local-user@example.test"), false);
      assert.equal(serializedRegistration.includes("lo***@example.test"), true);
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
      assert.equal(sessionBody.session.authMethod, "password");
      assert.equal(store.listPortalSessions({ accountId: "acct_registration_1" }).length, 2);

      const serializedLogin = JSON.stringify({ sessionBody });
      assert.equal(serializedLogin.includes(REGISTRATION_PASSWORD), false);
    } finally {
      server.close();
    }
  });
});

test("registration welcome-Coins canary replaces the trial without marking a normal Commerce account", async () => {
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
      const emailVerification = await issueRegistrationEmailVerification(
        baseUrl,
        "  WELCOME-COINS@EXAMPLE.TEST  "
      );
      const registrationResponse = await fetch(`${baseUrl}/api/portal/registration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "welcome-coins@example.test",
          password: REGISTRATION_PASSWORD,
          legalAgreement: LEGAL_AGREEMENT,
          emailVerification: {
            verificationRef: emailVerification.verification.verificationRef,
            code: REGISTRATION_EMAIL_CODE
          }
        })
      });
      assert.equal(registrationResponse.status, 201);
      const body = await registrationResponse.json();
      assert.equal(body.registration.trial, undefined);
      assert.equal(body.registration.commercialModel, "legacy");
      assert.deepEqual(body.registration.welcomeBonus, {
        status: "pending",
        coinType: "bonus_coins",
        amountUnits: 10,
        expiresAt: "2026-07-07T09:00:00.000Z"
      });
      assert.equal(JSON.stringify(body).includes("acct_registration_1"), false);

      const account = store.getAccount("acct_registration_1");
      assert.equal(account.metadata.commercialModel, undefined);
      assert.equal(
        resolveWalletFirstCommerceMode({
          controlStore: store,
          accountId: "acct_registration_1"
        }),
        PORTAL_COMMERCE_MODE_LEGACY
      );
      assert.equal(store.getEntitlement("ent_registration_trial_1"), null);
      assert.equal(store.getPortalAccessRequest("pareq_registration_1"), null);
      assert.deepEqual(
        store.getPortalRegistrationWelcomeCoinGrant({
          accountId: "acct_registration_1"
        }),
        {
          grantRef: "welcome_grant_registration_1",
          accountId: "acct_registration_1",
          coinType: "bonus_coins",
          amountUnits: 10,
          sourceType: "portal_registration_welcome_bonus",
          sourceRef: "portal_registration_welcome_acct_registration_1",
          sourceDigest: store.getPortalRegistrationWelcomeCoinGrant({
            accountId: "acct_registration_1"
          }).sourceDigest,
          actorScope: "portal_registration_welcome_bonus",
          idempotencyKey: "portal_registration_welcome_acct_registration_1",
          expiresAt: "2026-07-07T09:00:00.000Z",
          status: "pending",
          nextAttemptAt: NOW,
          attemptCount: 0,
          leaseGeneration: 0,
          leaseUntil: null,
          lastSafeCode: null,
          creditedLotRef: null,
          createdAt: NOW,
          updatedAt: NOW,
          creditedAt: null
        }
      );
    } finally {
      await new Promise((resolvePromise) => server.close(resolvePromise));
    }
  }, { registrationWelcomeCoinsEnabled: true });
});

test("registration welcome-Coins canary retains non-matching verified registrations on the legacy trial path", async () => {
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
      const emailVerification = await issueRegistrationEmailVerification(
        baseUrl,
        "legacy-canary-miss@example.test"
      );
      const registrationResponse = await fetch(`${baseUrl}/api/portal/registration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "legacy-canary-miss@example.test",
          password: REGISTRATION_PASSWORD,
          legalAgreement: LEGAL_AGREEMENT,
          emailVerification: {
            verificationRef: emailVerification.verification.verificationRef,
            code: REGISTRATION_EMAIL_CODE
          }
        })
      });
      assert.equal(registrationResponse.status, 201);
      const body = await registrationResponse.json();
      assert.equal(body.registration.commercialModel, "legacy");
      assert.equal(body.registration.welcomeBonus, undefined);
      assert.equal(body.registration.trial.durationDays, 7);

      const account = store.getAccount("acct_registration_1");
      assert.equal(account.metadata.commercialModel, undefined);
      assert.notEqual(store.getEntitlement("ent_registration_trial_1"), null);
      assert.notEqual(store.getPortalAccessRequest("pareq_registration_1"), null);
      assert.equal(
        store.getPortalRegistrationWelcomeCoinGrant({
          accountId: "acct_registration_1"
        }),
        null
      );
    } finally {
      await new Promise((resolvePromise) => server.close(resolvePromise));
    }
  }, { registrationWelcomeCoinsEnabled: true });
});

test("registration welcome-Coins canary rejects a non-boolean eligibility result before any registration write", () => {
  for (const eligibility of [undefined, "true"]) {
    withRegistrationState(({
      store,
      registrations
    }) => {
      assert.throws(
        () => registrations.submitRegistration({
          email: "canary-contract-error@example.test",
          password: REGISTRATION_PASSWORD,
          legalAgreement: LEGAL_AGREEMENT
        }),
        (error) => error?.code === "registration_welcome_coins_prerequisite_missing"
      );

      assert.equal(store.getAccount("acct_registration_1"), null);
      assert.equal(store.getEntitlement("ent_registration_trial_1"), null);
      assert.equal(store.getPortalAccessRequest("pareq_registration_1"), null);
      assert.equal(
        store.getPortalRegistrationWelcomeCoinGrant({
          accountId: "acct_registration_1"
        }),
        null
      );
    }, {
      registrationWelcomeCoinsEnabled: true,
      registrationWelcomeCoinsCanaryEmailEligibilityReader: () => eligibility
    });
  }
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


test("company-site landing preserves the Portal cookie for later registration without reward policy or financial writes", async () => {
  await withRegistrationState(async ({store,auth,accessRequests,registrations,humanChallenges,registrationEmailVerifications,referrals,referralDatabase}) => {
    const origin = "https://portal.example.test";
    const link = referrals.createLink("test_promoter");
    assert.equal(link.attributionDays, 3);
    assert.equal(link.policy, null);
    store.createAccount({id:"body_promoter",ownerRef:"body_owner",status:"active",createdAt:NOW,updatedAt:NOW,metadata:{}});
    const bodyTouch = referrals.capture(referrals.createLink("body_promoter").linkPath.split("/").at(-1));
    const financialTables = ["platform_referral_policies", "platform_referral_origins", "platform_referral_accruals",
      "platform_coin_wallets", "platform_coin_lots", "platform_coin_ledger_entries"];
    const financialCounts = () => financialTables.map(table => referralDatabase.prepare(`select count(*) n from ${table}`).get().n);
    const before = financialCounts();
    assert.deepEqual(before, financialTables.map(() => 0));
    const {server,baseUrl} = await listen(createApp(baseState({
      userPortalAuth:auth,portalAccessRequests:accessRequests,portalRegistrations:registrations,
      portalRegistrationEmailVerifications:registrationEmailVerifications,portalHumanChallenges:humanChallenges,
      userPortalRoutesEnabled:true,portalReferralsEnabled:true,portalReferrals:referrals,portalBrowserOrigin:origin
    })));
    try {
      const landing = await new Promise((resolve, reject) => {
        const request = httpRequest(`${baseUrl}${link.linkPath}`, {headers:{Host:"portal.example.test"}}, response => {
          response.resume();
          response.once("end", () => resolve({status:response.statusCode,headers:response.headers}));
          response.once("error", reject);
        });
        request.once("error", reject);
        request.end();
      });
      assert.equal(landing.status,303);
      assert.equal(landing.headers.location,"https://gccwebos.com/#new-user");
      const [cookie] = landing.headers["set-cookie"];
      assert.match(cookie, /^__Host-PortalReferral=[A-Za-z0-9_-]{32}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=259200$/);
      const verification = await issueRegistrationEmailVerification(baseUrl,"distribution-user@example.test");
      const response = await fetch(`${baseUrl}/api/portal/registration`, {
        method:"POST",headers:{"Content-Type":"application/json",Cookie:cookie.split(";")[0]},
        body:JSON.stringify({email:"distribution-user@example.test",password:REGISTRATION_PASSWORD,
          legalAgreement:LEGAL_AGREEMENT,referrerId:"body_promoter",referralToken:bodyTouch.token,
          emailVerification:{verificationRef:verification.verification.verificationRef,code:REGISTRATION_EMAIL_CODE}})
      });
      assert.equal(response.status,201);
      assert.equal((await response.json()).registration.status,"registered");
      assert.equal(referrals.performance("test_promoter").registrations,1);
      assert.equal(referrals.performance("body_promoter").registrations,0);
      const binding = referralDatabase.prepare("select referrer_id from platform_referral_bindings where account_id=?").get("acct_registration_1");
      assert.equal(binding.referrer_id,"test_promoter");
      assert.deepEqual(financialCounts(),before);
    } finally { await new Promise(resolve => server.close(resolve)); }
  },{referralsEnabled:true,referralRewardsEnabled:false,referralAttributionDays:3});
});

test("registration HTTP binds only its server cookie and rolls back attribution with account on credential failure", async () => {
  await withRegistrationState(async ({store,auth,accessRequests,registrations,humanChallenges,registrationEmailVerifications,referrals,referralDatabase,passwordCredentialService}) => {
    const code=referrals.createLink('test_promoter').linkPath.split('/').at(-1);
    const touch=referrals.capture(code);
    const {server,baseUrl}=await listen(createApp(baseState({userPortalAuth:auth,portalAccessRequests:accessRequests,
      portalRegistrations:registrations,portalRegistrationEmailVerifications:registrationEmailVerifications,
      portalHumanChallenges:humanChallenges,userPortalRoutesEnabled:true})));
    try {
      const verification=await issueRegistrationEmailVerification(baseUrl,'referral-user@example.test');
      const response=await fetch(`${baseUrl}/api/portal/registration`,{method:'POST',headers:{'Content-Type':'application/json',Cookie:`__Host-PortalReferral=${touch.token}`},
        body:JSON.stringify({email:'referral-user@example.test',password:REGISTRATION_PASSWORD,legalAgreement:LEGAL_AGREEMENT,
          referrerId:'attacker',referralToken:'C'.repeat(32),emailVerification:{verificationRef:verification.verification.verificationRef,code:REGISTRATION_EMAIL_CODE}})});
      assert.equal(response.status,201);
      const binding=referralDatabase.prepare('select * from platform_referral_bindings').get();
      assert.equal(binding.account_id,'acct_registration_1');assert.equal(binding.referrer_id,'test_promoter');
      const broken=createPortalRegistrationService({controlStore:store,userPortalAuth:auth,portalAccessRequests:accessRequests,
        passwordCredentialService:{issueInitialPasswordCredential(){throw new Error('synthetic_credential_failure');}},
        nowFn:()=>NOW,accountIdFactory:()=> 'failed_account',entitlementIdFactory:()=> 'failed_entitlement',referralsEnabled:true});
      assert.throws(()=>broken.submitRegistration({email:'rollback@example.test',password:REGISTRATION_PASSWORD,legalAgreement:LEGAL_AGREEMENT},
        {referralToken:touch.token}),/synthetic_credential_failure/);
      assert.equal(store.getAccount('failed_account'),null);
      assert.equal(referralDatabase.prepare('select 1 from platform_referral_bindings where account_id=?').get('failed_account'),undefined);
    } finally {await new Promise(resolve=>server.close(resolve));}
  },{referralsEnabled:true});
});
