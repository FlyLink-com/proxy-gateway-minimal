import assert from "node:assert/strict";
import test from "node:test";
import { createPortalHumanChallengeService } from "../services/platform/portal-human-challenge.mjs";

const NOW = "2026-06-03T00:00:00.000Z";
const EXPIRED_NOW = "2026-06-03T00:04:00.000Z";

function createService(overrides = {}) {
  return createPortalHumanChallengeService({
    nowFn: () => NOW,
    challengeRefFactory: () => "phc_test_1",
    challengeFactory: () => ({ prompt: "8 + 5 = ?", answer: "13" }),
    ...overrides
  });
}

test("portal human challenge service issues a safe one-time challenge", () => {
  const service = createService();

  const issued = service.issueChallenge({ scope: "portal_login" });
  assert.equal(issued.challenge.challengeRef, "phc_test_1");
  assert.equal(issued.challenge.type, "math");
  assert.equal(issued.challenge.prompt, "8 + 5 = ?");
  assert.equal(issued.challenge.expiresInSeconds, 180);

  const serializedIssue = JSON.stringify(issued);
  assert.equal(serializedIssue.includes("13"), false);
  assert.equal(serializedIssue.includes("answer"), false);
  assert.equal(serializedIssue.includes("answerHash"), false);
  assert.equal(serializedIssue.includes("token="), false);
  assert.equal(serializedIssue.includes("subscriptionUrl"), false);

  const verified = service.verifyChallenge({
    challengeRef: "phc_test_1",
    answer: "13",
    scope: "portal_login"
  });
  assert.equal(verified.verified, true);
  assert.equal(verified.challengeRef, "phc_test_1");

  assert.throws(
    () => service.verifyChallenge({
      challengeRef: "phc_test_1",
      answer: "13",
      scope: "portal_login"
    }),
    (error) => error.code === "human_verification_failed"
  );
});

test("portal human challenge service rejects expired, wrong scope, and locked challenges", () => {
  const service = createService({
    maxAttempts: 2,
    challengeRefFactory: (() => {
      let index = 0;
      return () => `phc_test_${++index}`;
    })()
  });

  service.issueChallenge({ scope: "portal_login" });
  assert.throws(
    () => service.verifyChallenge({
      challengeRef: "phc_test_1",
      answer: "13",
      scope: "portal_setup"
    }),
    (error) => error.code === "human_verification_failed"
  );

  service.issueChallenge({ scope: "portal_login" });
  assert.throws(
    () => service.verifyChallenge({
      challengeRef: "phc_test_2",
      answer: "12",
      scope: "portal_login"
    }),
    (error) => error.code === "human_verification_failed"
  );
  assert.throws(
    () => service.verifyChallenge({
      challengeRef: "phc_test_2",
      answer: "12",
      scope: "portal_login"
    }),
    (error) => error.code === "human_verification_failed"
  );
  assert.throws(
    () => service.verifyChallenge({
      challengeRef: "phc_test_2",
      answer: "13",
      scope: "portal_login"
    }),
    (error) => error.code === "human_verification_failed"
  );

  let currentNow = NOW;
  const expiringService = createService({
    nowFn: () => currentNow,
    challengeRefFactory: () => "phc_expired_1"
  });
  expiringService.issueChallenge({ scope: "portal_login" });
  currentNow = EXPIRED_NOW;
  assert.throws(
    () => expiringService.verifyChallenge({
      challengeRef: "phc_expired_1",
      answer: "13",
      scope: "portal_login"
    }),
    (error) => error.code === "human_verification_failed"
  );
  assert.equal(expiringService.purgeExpired(), 1);
});
