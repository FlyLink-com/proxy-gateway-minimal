import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createApp } from "../app.mjs";
import { createRuntimeState } from "../state.mjs";
import { createPortalHumanChallengeService } from "../services/platform/portal-human-challenge.mjs";
import { createPortalPasswordCredentialService } from "../services/platform/portal-password-credentials.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createUserPortalAuthService } from "../services/platform/user-portal-auth.mjs";
import { listen } from "./helpers/listen.mjs";
import { buildSourceValidationTestEnvironment } from "../../scripts/source-validation-test-runner.mjs";

const NOW = "2026-05-31T00:00:00.000Z";
const FUTURE = "2099-06-04T00:00:00.000Z";
const SESSION_EXPIRES = "2026-05-31T00:30:00.000Z";
const TEST_TOTP_SECRET_PROTECTOR = {
  protect: (secret) => `v2:test-protected:${secret}`
};
const REPOSITORY_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));

function seedAccountAndEntitlement(store) {
  store.createAccount({
    id: "acct_portal_route_1",
    ownerRef: "owner_safe_ref",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
    metadata: {
      loginRef: "Portal.Route@example.test",
      displayRef: "Portal.Route@example.test"
    }
  });
  store.createEntitlement({
    id: "ent_portal_route_1",
    accountId: "acct_portal_route_1",
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

function createHumanChallengeService(options = {}) {
  let index = 0;
  return createPortalHumanChallengeService({
    nowFn: options.nowFn || (() => NOW),
    challengeRefFactory: () => `phc_route_${++index}`,
    challengeFactory: () => ({ prompt: "8 + 5 = ?", answer: "13" })
  });
}

function createPasswordCredentialService(store) {
  return createPortalPasswordCredentialService({
    controlStore: store,
    nowFn: () => NOW,
    saltFactory: () => Buffer.from("route-password-salt-0001", "utf8"),
    credentialRefFactory: () => "pwd_route_1",
    maxFailures: 2
  });
}

async function issueHumanChallenge(baseUrl, scope = "portal_login") {
  const response = await fetch(`${baseUrl}/api/portal/human-challenges`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope })
  });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.challenge.type, "math");
  assert.equal(body.challenge.prompt, "8 + 5 = ?");
  assert.equal(body.challenge.expiresInSeconds, 180);
  const serialized = JSON.stringify(body);
  assert.equal(serialized.includes("13"), false);
  assert.equal(serialized.includes("answer"), false);
  assert.equal(serialized.includes("answerHash"), false);
  return body.challenge;
}

test("portal refresh route maps subscription cooldown to 429", async () => {
  const cooldownError = new Error("subscription refresh is rate limited");
  cooldownError.code = "subscription_refresh_rate_limited";
  const { server, baseUrl } = await listen(createApp(baseState({
    userPortalRoutesEnabled: true,
    userPortalAuth: {
      requireSession: () => ({ accountId: "acct_portal_route_1" })
    },
    portalAccessRequests: {
      refreshSubscription() {
        throw cooldownError;
      }
    }
  })));
  try {
    const response = await fetch(`${baseUrl}/api/portal/access-requests/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Portal-Session": "portal_session_route_1"
      },
      body: JSON.stringify({ requestRef: "pareq_route_1" })
    });

    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), { error: "subscription_refresh_rate_limited" });
  } finally {
    server.close();
  }
});

function withPortalState(fn, options = {}) {
  const tempDir = mkdtempSync(join(tmpdir(), "user-portal-routes-"));
  let store;
  let shouldCleanup = true;
  const cleanup = () => {
    if (!shouldCleanup) {
      return;
    }
    shouldCleanup = false;
    store?.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  };
  try {
    store = createSqliteSubscriptionControlStore({
      dbPath: join(tempDir, "control.sqlite")
    });
    seedAccountAndEntitlement(store);
    const passwordCredentialService = options.withPasswordCredential
      ? createPasswordCredentialService(store)
      : undefined;
    const auth = createUserPortalAuthService({
      controlStore: store,
      nowFn: () => NOW,
      entryTokenFactory: () => "portal-route-raw-entry-token",
      entryRefFactory: () => "entry_portal_route_1",
      credentialRefFactory: options.credentialRefFactory || (() => "totp_route_1"),
      secondFactorChallengeRefFactory: () => "mfa_challenge_1",
      sessionRefFactory: () => "portal_session_route_1",
      totpEnrollmentRefFactory: options.totpEnrollmentRefFactory || (() => "totp_enroll_route_1"),
      totpSecretFactory: options.totpSecretFactory || (() => "JBSWY3DPEHPK3PXP"),
      totpSecretProtector: options.totpSecretProtector ?? TEST_TOTP_SECRET_PROTECTOR,
      sessionExpiresAtFactory: () => SESSION_EXPIRES,
      totpVerifier: options.totpVerifier || (({ encryptedTotpSecret, code }) => (
        encryptedTotpSecret === "v2:test-protected:route-totp-secret" && code === "123456"
      ) || (
        encryptedTotpSecret === "v2:test-protected:JBSWY3DPEHPK3PXP" && code === "654321"
      )),
      passwordCredentialService,
      allowPasswordOnlySessionForSetup: options.allowPasswordOnlySessionForSetup ?? false,
      totpMaxFailures: options.totpMaxFailures,
      totpLockSeconds: options.totpLockSeconds,
      secondFactorMaxFailures: options.secondFactorMaxFailures
    });
    const issued = auth.issueDynamicEntry({
      accountId: "acct_portal_route_1",
      entitlementId: "ent_portal_route_1",
      approvalRef: "approval_portal_route_1",
      issuedByRef: "operator_safe_ref",
      expiresAt: FUTURE
    });
    const result = fn({
      store,
      auth,
      passwordCredentialService,
      entryToken: issued.handoffMaterial.entryToken
    });
    if (result && typeof result.then === "function") {
      shouldCleanup = false;
      return result.finally(() => {
        shouldCleanup = true;
        cleanup();
      });
    }
    cleanup();
    return result;
  } finally {
    cleanup();
  }
}

test("user portal routes stay unavailable unless explicitly enabled", async () => {
  const { server, baseUrl } = await listen(createApp(baseState()));
  try {
    const response = await fetch(`${baseUrl}/api/portal/entry/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entryToken: "not-used",
        encryptedTotpSecret: "enc:route-totp-secret"
      })
    });

    assert.equal(response.status, 401);

    const challengeResponse = await fetch(`${baseUrl}/api/portal/human-challenges`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "portal_login" })
    });
    assert.equal(challengeResponse.status, 401);
  } finally {
    server.close();
  }
});

test("user portal routes consume dynamic entry and create scoped session without exposing secrets", async () => {
  await withPortalState(async ({ store, auth, entryToken }) => {
    const { server, baseUrl } = await listen(createApp(baseState({
      userPortalAuth: auth,
      userPortalRoutesEnabled: true
    })));
    try {
      const enrollResponse = await fetch(`${baseUrl}/api/portal/entry/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryToken,
          encryptedTotpSecret: "enc:route-totp-secret"
        })
      });
      assert.equal(enrollResponse.status, 200);
      const enrollmentBody = await enrollResponse.json();
      assert.equal(enrollmentBody.enrollment.action, "totp_enrolled");
      assert.equal(enrollmentBody.enrollment.accountId, "acct_portal_route_1");
      assert.equal(store.getPortalEntry("entry_portal_route_1").status, "used");
      const storedCredential = store.getActivePortalTotpCredential("acct_portal_route_1");
      assert.equal(storedCredential.encryptedTotpSecret, "v2:test-protected:route-totp-secret");
      assert.equal(storedCredential.encryptedTotpSecret.startsWith("enc:"), false);

      const sessionResponse = await fetch(`${baseUrl}/api/portal/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: "acct_portal_route_1",
          code: "123456"
        })
      });
      assert.equal(sessionResponse.status, 200);
      const sessionBody = await sessionResponse.json();
      assert.equal(sessionBody.session.sessionRef, "portal_session_route_1");
      assert.equal(sessionBody.session.expiresAt, SESSION_EXPIRES);

      const serialized = JSON.stringify({ enrollmentBody, sessionBody });
      assert.equal(serialized.includes(entryToken), false);
      assert.equal(serialized.includes("enc:route-totp-secret"), false);
      assert.equal(serialized.includes("123456"), false);
      assert.equal(serialized.includes("subscriptionUrl"), false);
      assert.equal(serialized.includes("token="), false);
      assert.equal(store.listPortalSessions({ accountId: "acct_portal_route_1" }).length, 1);
    } finally {
      server.close();
    }
  });
});

test("portal password session route verifies human challenge before credential work", async () => {
  await withPortalState(async ({ store, auth, passwordCredentialService }) => {
    const plainPassword = `test-password-${randomUUID()}`;
    passwordCredentialService.issueInitialPasswordCredential({
      accountId: "acct_portal_route_1",
      plainPassword,
      issuedByRef: "operator_safe_ref",
      approvalRef: "approval_password_route_1",
      mustRotate: true
    });
    const humanChallenges = createHumanChallengeService();
    const { server, baseUrl } = await listen(createApp(baseState({
      userPortalAuth: auth,
      portalHumanChallenges: humanChallenges,
      userPortalRoutesEnabled: true
    })));
    try {
      const missingResponse = await fetch(`${baseUrl}/api/portal/password/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: "acct_portal_route_1",
          password: `wrong-${plainPassword}`
        })
      });
      assert.equal(missingResponse.status, 400);
      assert.deepEqual(await missingResponse.json(), { error: "human_verification_failed" });
      assert.equal(store.getActivePortalPasswordCredential("acct_portal_route_1").failureCount, 0);

      const wrongScopeChallenge = await issueHumanChallenge(baseUrl, "portal_setup");
      const wrongScopeResponse = await fetch(`${baseUrl}/api/portal/password/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: "acct_portal_route_1",
          password: `wrong-${plainPassword}`,
          humanVerification: {
            challengeRef: wrongScopeChallenge.challengeRef,
            answer: "13"
          }
        })
      });
      assert.equal(wrongScopeResponse.status, 400);
      assert.deepEqual(await wrongScopeResponse.json(), { error: "human_verification_failed" });
      assert.equal(store.getActivePortalPasswordCredential("acct_portal_route_1").failureCount, 0);

      const wrongAnswerChallenge = await issueHumanChallenge(baseUrl);
      const wrongAnswerResponse = await fetch(`${baseUrl}/api/portal/password/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: "acct_portal_route_1",
          password: `wrong-${plainPassword}`,
          humanVerification: {
            challengeRef: wrongAnswerChallenge.challengeRef,
            answer: "12"
          }
        })
      });
      assert.equal(wrongAnswerResponse.status, 400);
      assert.deepEqual(await wrongAnswerResponse.json(), { error: "human_verification_failed" });
      assert.equal(store.getActivePortalPasswordCredential("acct_portal_route_1").failureCount, 0);

      const challenge = await issueHumanChallenge(baseUrl);
      const response = await fetch(`${baseUrl}/api/portal/password/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: "acct_portal_route_1",
          password: plainPassword,
          humanVerification: {
            challengeRef: challenge.challengeRef,
            answer: "13"
          }
        })
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.session.sessionRef, "portal_session_route_1");
      assert.equal(body.session.authMethod, "password");
      assert.equal(store.listPortalSessions({ accountId: "acct_portal_route_1" }).length, 1);

      const reusedResponse = await fetch(`${baseUrl}/api/portal/password/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: "acct_portal_route_1",
          password: `wrong-${plainPassword}`,
          humanVerification: {
            challengeRef: challenge.challengeRef,
            answer: "13"
          }
        })
      });
      assert.equal(reusedResponse.status, 400);
      assert.deepEqual(await reusedResponse.json(), { error: "human_verification_failed" });
      assert.equal(store.getActivePortalPasswordCredential("acct_portal_route_1").failureCount, 0);

      const serialized = JSON.stringify(body);
      assert.equal(serialized.includes(plainPassword), false);
      assert.equal(serialized.includes("scrypt$v=1"), false);
      assert.equal(serialized.includes("token="), false);
      assert.equal(serialized.includes("subscriptionUrl"), false);
    } finally {
      server.close();
    }
  }, {
    withPasswordCredential: true,
    allowPasswordOnlySessionForSetup: true
  });
});

test("portal password session route returns second-factor challenge after password verification", async () => {
  await withPortalState(async ({ auth, passwordCredentialService, entryToken }) => {
    const plainPassword = `test-password-${randomUUID()}`;
    passwordCredentialService.issueInitialPasswordCredential({
      accountId: "acct_portal_route_1",
      plainPassword,
      issuedByRef: "operator_safe_ref",
      approvalRef: "approval_password_route_2",
      mustRotate: true
    });
    auth.enrollTotpCredential({
      entryToken,
      encryptedTotpSecret: "enc:route-totp-secret"
    });
    const humanChallenges = createHumanChallengeService();
    const { server, baseUrl } = await listen(createApp(baseState({
      userPortalAuth: auth,
      portalHumanChallenges: humanChallenges,
      userPortalRoutesEnabled: true
    })));
    try {
      const challenge = await issueHumanChallenge(baseUrl);
      const response = await fetch(`${baseUrl}/api/portal/password/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: "acct_portal_route_1",
          password: plainPassword,
          humanVerification: {
            challengeRef: challenge.challengeRef,
            answer: "13"
          }
        })
      });
      assert.equal(response.status, 202);
      const body = await response.json();
      assert.equal(body.challenge.status, "second_factor_required");
      assert.deepEqual(body.challenge.availableFactors, ["totp"]);
      assert.equal(body.challenge.challengeRef, "mfa_challenge_1");
      assert.equal(body.challenge.safety.noSessionCreated, true);
      const serialized = JSON.stringify(body);
      assert.equal(serialized.includes(plainPassword), false);
      assert.equal(serialized.includes("scrypt$v=1"), false);
      assert.equal(serialized.includes("enc:route-totp-secret"), false);
      assert.equal(serialized.includes("123456"), false);
    } finally {
      server.close();
    }
  }, {
    withPasswordCredential: true
  });
});

test("portal password session route resolves a unique loginRef before creating a session", async () => {
  await withPortalState(async ({ store, auth, passwordCredentialService }) => {
    const plainPassword = `test-password-${randomUUID()}`;
    passwordCredentialService.issueInitialPasswordCredential({
      accountId: "acct_portal_route_1",
      plainPassword,
      issuedByRef: "operator_safe_ref",
      approvalRef: "approval_password_route_login_ref",
      mustRotate: true
    });
    const humanChallenges = createHumanChallengeService();
    const { server, baseUrl } = await listen(createApp(baseState({
      userPortalAuth: auth,
      portalHumanChallenges: humanChallenges,
      userPortalRoutesEnabled: true
    })));
    try {
      const challenge = await issueHumanChallenge(baseUrl);
      const response = await fetch(`${baseUrl}/api/portal/password/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: " portal.route@example.test ",
          password: plainPassword,
          humanVerification: {
            challengeRef: challenge.challengeRef,
            answer: "13"
          }
        })
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.session.sessionRef, "portal_session_route_1");
      assert.equal(body.session.accountId, "acct_portal_route_1");
      assert.equal(body.session.authMethod, "password");
      assert.equal(store.listPortalSessions({ accountId: "acct_portal_route_1" }).length, 1);

      const serialized = JSON.stringify(body);
      assert.equal(serialized.includes(plainPassword), false);
      assert.equal(serialized.includes("scrypt$v=1"), false);
      assert.equal(serialized.includes("token="), false);
      assert.equal(serialized.includes("subscriptionUrl"), false);
    } finally {
      server.close();
    }
  }, {
    withPasswordCredential: true,
    allowPasswordOnlySessionForSetup: true
  });
});

test("portal password session route accepts frontend human challenge field aliases", async () => {
  await withPortalState(async ({ auth, passwordCredentialService, entryToken }) => {
    const plainPassword = `test-password-${randomUUID()}`;
    passwordCredentialService.issueInitialPasswordCredential({
      accountId: "acct_portal_route_1",
      plainPassword,
      issuedByRef: "operator_safe_ref",
      approvalRef: "approval_password_route_alias",
      mustRotate: true
    });
    auth.enrollTotpCredential({
      entryToken,
      encryptedTotpSecret: "enc:route-totp-secret"
    });
    const humanChallenges = createHumanChallengeService();
    const { server, baseUrl } = await listen(createApp(baseState({
      userPortalAuth: auth,
      portalHumanChallenges: humanChallenges,
      userPortalRoutesEnabled: true
    })));
    try {
      const challenge = await issueHumanChallenge(baseUrl);
      const response = await fetch(`${baseUrl}/api/portal/password/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: "acct_portal_route_1",
          password: plainPassword,
          humanVerification: {
            challengeId: challenge.challengeRef,
            challengeAnswer: "13"
          }
        })
      });
      assert.equal(response.status, 202);
      const body = await response.json();
      assert.equal(body.challenge.status, "second_factor_required");
      assert.deepEqual(body.challenge.availableFactors, ["totp"]);
      assert.equal(body.challenge.safety.noSessionCreated, true);
    } finally {
      server.close();
    }
  }, {
    withPasswordCredential: true
  });
});

test("portal password second-factor route consumes a challenge and returns a scoped session", async () => {
  await withPortalState(async ({ store, auth, passwordCredentialService, entryToken }) => {
    const plainPassword = `test-password-${randomUUID()}`;
    passwordCredentialService.issueInitialPasswordCredential({
      accountId: "acct_portal_route_1",
      plainPassword,
      issuedByRef: "operator_safe_ref",
      approvalRef: "approval_password_route_3",
      mustRotate: true
    });
    auth.enrollTotpCredential({
      entryToken,
      encryptedTotpSecret: "enc:route-totp-secret"
    });
    const humanChallenges = createHumanChallengeService();
    const { server, baseUrl } = await listen(createApp(baseState({
      userPortalAuth: auth,
      portalHumanChallenges: humanChallenges,
      userPortalRoutesEnabled: true
    })));
    try {
      const humanChallenge = await issueHumanChallenge(baseUrl);
      const passwordResponse = await fetch(`${baseUrl}/api/portal/password/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: "acct_portal_route_1",
          password: plainPassword,
          humanVerification: {
            challengeRef: humanChallenge.challengeRef,
            answer: "13"
          }
        })
      });
      assert.equal(passwordResponse.status, 202);
      const passwordBody = await passwordResponse.json();

      const factorResponse = await fetch(`${baseUrl}/api/portal/password/second-factor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeRef: passwordBody.challenge.challengeRef,
          factor: "totp",
          code: "123456"
        })
      });
      assert.equal(factorResponse.status, 200);
      const factorBody = await factorResponse.json();
      assert.equal(factorBody.session.sessionRef, "portal_session_route_1");
      assert.equal(factorBody.session.accountId, "acct_portal_route_1");
      assert.equal(factorBody.session.authMethod, "totp");
      assert.equal(store.getPortalSecondFactorChallenge("mfa_challenge_1").status, "used");
      assert.equal(store.listPortalSessions({ accountId: "acct_portal_route_1" }).length, 1);

      const replayResponse = await fetch(`${baseUrl}/api/portal/password/second-factor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeRef: passwordBody.challenge.challengeRef,
          factor: "totp",
          code: "123456"
        })
      });
      assert.equal(replayResponse.status, 400);

      const serialized = JSON.stringify({ passwordBody, factorBody });
      assert.equal(serialized.includes(plainPassword), false);
      assert.equal(serialized.includes("enc:route-totp-secret"), false);
      assert.equal(serialized.includes("123456"), false);
      assert.equal(serialized.includes("subscriptionUrl"), false);
    } finally {
      server.close();
    }
  }, {
    withPasswordCredential: true
  });
});

test("portal password second-factor route locks TOTP after repeated failures", async () => {
  await withPortalState(async ({ store, auth, passwordCredentialService, entryToken }) => {
    const plainPassword = `test-password-${randomUUID()}`;
    passwordCredentialService.issueInitialPasswordCredential({
      accountId: "acct_portal_route_1",
      plainPassword,
      issuedByRef: "operator_safe_ref",
      approvalRef: "approval_password_route_4",
      mustRotate: true
    });
    auth.enrollTotpCredential({
      entryToken,
      encryptedTotpSecret: "enc:route-totp-secret"
    });
    const humanChallenges = createHumanChallengeService();
    const { server, baseUrl } = await listen(createApp(baseState({
      userPortalAuth: auth,
      portalHumanChallenges: humanChallenges,
      userPortalRoutesEnabled: true
    })));
    try {
      const humanChallenge = await issueHumanChallenge(baseUrl);
      const passwordResponse = await fetch(`${baseUrl}/api/portal/password/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: "acct_portal_route_1",
          password: plainPassword,
          humanVerification: {
            challengeRef: humanChallenge.challengeRef,
            answer: "13"
          }
        })
      });
      assert.equal(passwordResponse.status, 202);
      const passwordBody = await passwordResponse.json();

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const factorResponse = await fetch(`${baseUrl}/api/portal/password/second-factor`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            challengeRef: passwordBody.challenge.challengeRef,
            factor: "totp",
            code: "000000"
          })
        });
        assert.equal(factorResponse.status, 400);
        assert.equal((await factorResponse.json()).error, "validation_error");
      }

      const credential = store.getPortalTotpCredential("totp_route_1");
      assert.equal(credential.status, "active");
      assert.equal(credential.failureCount, 2);
      assert.equal(credential.lockedUntil, "2026-05-31T00:15:00.000Z");
      const challenge = store.getPortalSecondFactorChallenge("mfa_challenge_1");
      assert.equal(challenge.status, "locked");
      assert.equal(challenge.failureCount, 2);
      assert.equal(store.listPortalSessions({ accountId: "acct_portal_route_1" }).length, 0);

      const lockedResponse = await fetch(`${baseUrl}/api/portal/password/second-factor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeRef: passwordBody.challenge.challengeRef,
          factor: "totp",
          code: "123456"
        })
      });
      assert.equal(lockedResponse.status, 400);
      assert.equal((await lockedResponse.json()).error, "validation_error");
      assert.equal(store.listPortalSessions({ accountId: "acct_portal_route_1" }).length, 0);
    } finally {
      server.close();
    }
  }, {
    withPasswordCredential: true,
    totpMaxFailures: 2,
    totpLockSeconds: 900,
    secondFactorMaxFailures: 2
  });
});

test("portal security routes expose session-scoped authenticator state and confirm TOTP enrollment", async () => {
  await withPortalState(async ({ store, auth, passwordCredentialService }) => {
    const plainPassword = `test-password-${randomUUID()}`;
    passwordCredentialService.issueInitialPasswordCredential({
      accountId: "acct_portal_route_1",
      plainPassword,
      issuedByRef: "operator_safe_ref",
      approvalRef: "approval_password_route_security",
      mustRotate: true
    });
    const humanChallenges = createHumanChallengeService();
    const { server, baseUrl } = await listen(createApp(baseState({
      userPortalAuth: auth,
      portalHumanChallenges: humanChallenges,
      userPortalRoutesEnabled: true
    })));
    try {
      const missingSessionResponse = await fetch(`${baseUrl}/api/portal/security/current`);
      assert.equal(missingSessionResponse.status, 401);
      assert.equal((await missingSessionResponse.json()).error, "invalid_session");

      const humanChallenge = await issueHumanChallenge(baseUrl);
      const passwordResponse = await fetch(`${baseUrl}/api/portal/password/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: "acct_portal_route_1",
          password: plainPassword,
          humanVerification: {
            challengeRef: humanChallenge.challengeRef,
            answer: "13"
          }
        })
      });
      assert.equal(passwordResponse.status, 200);
      const sessionRef = (await passwordResponse.json()).session.sessionRef;

      const currentResponse = await fetch(`${baseUrl}/api/portal/security/current`, {
        headers: { "X-Portal-Session": sessionRef }
      });
      assert.equal(currentResponse.status, 200);
      const currentBody = await currentResponse.json();
      assert.equal(currentBody.security.authenticatorBound, false);
      assert.equal(currentBody.security.passkeyEnabled, false);
      assert.equal(currentBody.security.noRawSecretReturned, undefined);

      const enrollmentResponse = await fetch(`${baseUrl}/api/portal/security/totp/enrollment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Portal-Session": sessionRef },
        body: JSON.stringify({})
      });
      assert.equal(enrollmentResponse.status, 201);
      const enrollmentBody = await enrollmentResponse.json();
      assert.equal(enrollmentBody.enrollment.enrollmentRef, "totp_enroll_route_1");
      assert.equal(enrollmentBody.enrollment.issuer, "GlobalCircle");
      assert.equal(enrollmentBody.enrollment.accountLabel, "acct_portal_route_1");
      assert.equal(enrollmentBody.enrollment.manualKey, "JBSWY3DPEHPK3PXP");
      assert.match(enrollmentBody.enrollment.otpauthUri, /^otpauth:\/\/totp\//);

      const confirmResponse = await fetch(`${baseUrl}/api/portal/security/totp/enrollment/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Portal-Session": sessionRef },
        body: JSON.stringify({
          enrollmentRef: enrollmentBody.enrollment.enrollmentRef,
          code: "654321"
        })
      });
      assert.equal(confirmResponse.status, 200);
      const confirmBody = await confirmResponse.json();
      assert.equal(confirmBody.binding.method, "totp");
      assert.equal(store.getActivePortalTotpCredential("acct_portal_route_1").status, "active");

      const boundResponse = await fetch(`${baseUrl}/api/portal/security/current`, {
        headers: { "X-Portal-Session": sessionRef }
      });
      assert.equal(boundResponse.status, 200);
      assert.equal((await boundResponse.json()).security.authenticatorBound, true);

      const serialized = JSON.stringify({ currentBody, confirmBody });
      assert.equal(serialized.includes(plainPassword), false);
      assert.equal(serialized.includes("enc:JBSWY3DPEHPK3PXP"), false);
      assert.equal(serialized.includes("654321"), false);
    } finally {
      server.close();
    }
  }, {
    withPasswordCredential: true,
    allowPasswordOnlySessionForSetup: true,
    credentialRefFactory: () => "totp_bound_route_1",
    totpVerifier: ({ encryptedTotpSecret, code }) => encryptedTotpSecret === "v2:test-protected:JBSWY3DPEHPK3PXP" && code === "654321"
  });
});

test("portal TOTP setup stores protected secret material after enrollment confirmation", async () => {
  const protector = {
    protect: (secret) => `v2:test-protected:${secret.split("").reverse().join("")}`
  };

  await withPortalState(async ({ store, auth, passwordCredentialService }) => {
    const plainPassword = `test-password-${randomUUID()}`;
    passwordCredentialService.issueInitialPasswordCredential({
      accountId: "acct_portal_route_1",
      plainPassword,
      issuedByRef: "operator_safe_ref",
      approvalRef: "approval_password_route_secret_protection",
      mustRotate: true
    });

    const passwordResult = auth.verifyPasswordAndMaybeChallenge({
      accountId: "acct_portal_route_1",
      plainPassword
    });
    const sessionRef = passwordResult.session.sessionRef;

    const started = auth.startTotpEnrollment({ sessionRef });
    const confirmed = auth.confirmTotpEnrollment({
      sessionRef,
      enrollmentRef: started.enrollment.enrollmentRef,
      code: "654321"
    });

    assert.equal(confirmed.binding.method, "totp");
    const stored = store.getActivePortalTotpCredential("acct_portal_route_1");
    assert.equal(stored.id, "totp_bound_route_1");
    assert.match(stored.encryptedTotpSecret, /^v2:test-protected:/);
    assert.equal(stored.encryptedTotpSecret.includes("JBSWY3DPEHPK3PXP"), false);
    assert.equal(stored.encryptedTotpSecret.startsWith("enc:"), false);
  }, {
    withPasswordCredential: true,
    allowPasswordOnlySessionForSetup: true,
    credentialRefFactory: () => "totp_bound_route_1",
    totpSecretProtector: protector,
    totpVerifier: ({ encryptedTotpSecret, code }) => encryptedTotpSecret.startsWith("v2:test-protected:") && code === "654321"
  });
});

test("portal human challenge route issues safe prompts only when portal is enabled", async () => {
  await withPortalState(async ({ auth }) => {
    const humanChallenges = createHumanChallengeService();
    const { server, baseUrl } = await listen(createApp(baseState({
      userPortalAuth: auth,
      portalHumanChallenges: humanChallenges,
      userPortalRoutesEnabled: true
    })));
    try {
      const challenge = await issueHumanChallenge(baseUrl);
      assert.equal(challenge.challengeRef, "phc_route_1");
    } finally {
      server.close();
    }
  });
});

test("runtime-wired portal login preflight routes bypass console auth without exposing secrets", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "user-portal-runtime-routes-"));
  let state;
  let server;
  let baseUrl;

  try {
    state = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env: {
        ...buildSourceValidationTestEnvironment({}, { repositoryRoot: REPOSITORY_ROOT }),
        CONSOLE_TOKEN: "secret",
        SS_PASSWORD: "pw",
        USER_PORTAL_ROUTES_ENABLED: "true",
        USER_PORTAL_ALLOW_PASSWORD_ONLY_SETUP_SESSION: "true"
      },
      subscriptionDbPath: join(tempDir, "subscriptions.sqlite"),
      controlDbPath: join(tempDir, "control.sqlite"),
      autoStartHttpProxy: false
    });
    ({ server, baseUrl } = await listen(createApp(state)));

    const challengeResponse = await fetch(`${baseUrl}/api/portal/human-challenges`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "portal_login" })
    });
    assert.equal(challengeResponse.status, 201);
    const challengeBody = await challengeResponse.json();
    assert.equal(challengeBody.challenge.type, "math");
    assert.equal(typeof challengeBody.challenge.prompt, "string");

    const passwordResponse = await fetch(`${baseUrl}/api/portal/password/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(passwordResponse.status, 400);
    assert.deepEqual(await passwordResponse.json(), { error: "human_verification_failed" });

    const securityResponse = await fetch(`${baseUrl}/api/portal/security/current`);
    assert.equal(securityResponse.status, 401);
    assert.deepEqual(await securityResponse.json(), { error: "invalid_session" });

    const enrollmentResponse = await fetch(`${baseUrl}/api/portal/security/totp/enrollment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(enrollmentResponse.status, 401);
    assert.deepEqual(await enrollmentResponse.json(), { error: "invalid_session" });
  } finally {
    if (server) {
      await new Promise((resolveClose) => {
        server.close(resolveClose);
        server.closeAllConnections?.();
      });
    }
    state?.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("portal auth routes verify human challenge before enrollment or session work", async () => {
  await withPortalState(async ({ store, auth, entryToken }) => {
    const humanChallenges = createHumanChallengeService();
    const { server, baseUrl } = await listen(createApp(baseState({
      userPortalAuth: auth,
      portalHumanChallenges: humanChallenges,
      userPortalRoutesEnabled: true
    })));
    try {
      const failedEnrollmentChallenge = await issueHumanChallenge(baseUrl);
      const failedEnrollResponse = await fetch(`${baseUrl}/api/portal/entry/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryToken,
          encryptedTotpSecret: "enc:route-totp-secret",
          humanVerification: {
            challengeRef: failedEnrollmentChallenge.challengeRef,
            answer: "12"
          }
        })
      });
      assert.equal(failedEnrollResponse.status, 400);
      assert.deepEqual(await failedEnrollResponse.json(), { error: "human_verification_failed" });
      assert.equal(store.getPortalEntry("entry_portal_route_1").status, "active");

      const enrollmentChallenge = await issueHumanChallenge(baseUrl);
      const enrollResponse = await fetch(`${baseUrl}/api/portal/entry/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryToken,
          encryptedTotpSecret: "enc:route-totp-secret",
          humanVerification: {
            challengeRef: enrollmentChallenge.challengeRef,
            answer: "13"
          }
        })
      });
      assert.equal(enrollResponse.status, 200);
      assert.equal(store.getPortalEntry("entry_portal_route_1").status, "used");

      const failedSessionChallenge = await issueHumanChallenge(baseUrl);
      const failedSessionResponse = await fetch(`${baseUrl}/api/portal/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: "acct_portal_route_1",
          code: "123456",
          humanVerification: {
            challengeRef: failedSessionChallenge.challengeRef,
            answer: "12"
          }
        })
      });
      assert.equal(failedSessionResponse.status, 400);
      assert.deepEqual(await failedSessionResponse.json(), { error: "human_verification_failed" });
      assert.equal(store.listPortalSessions({ accountId: "acct_portal_route_1" }).length, 0);

      const sessionChallenge = await issueHumanChallenge(baseUrl);
      const sessionResponse = await fetch(`${baseUrl}/api/portal/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: "acct_portal_route_1",
          code: "123456",
          humanVerification: {
            challengeRef: sessionChallenge.challengeRef,
            answer: "13"
          }
        })
      });
      assert.equal(sessionResponse.status, 200);
      const sessionBody = await sessionResponse.json();
      assert.equal(sessionBody.session.sessionRef, "portal_session_route_1");
      assert.equal(store.listPortalSessions({ accountId: "acct_portal_route_1" }).length, 1);

      const serialized = JSON.stringify(sessionBody);
      assert.equal(serialized.includes("13"), false);
      assert.equal(serialized.includes("enc:route-totp-secret"), false);
      assert.equal(serialized.includes("123456"), false);
      assert.equal(serialized.includes("subscriptionUrl"), false);
    } finally {
      server.close();
    }
  });
});
