import assert from "node:assert/strict";
import test from "node:test";

import {
  runMergedPrApprovalCli,
  validateMergedPrApproval
} from "../../scripts/japan-tuic-merged-pr-approval.mjs";

const validEvidence = (overrides = {}) => ({
  pullRequest: {
    number: 531,
    merged: true,
    mergeCommit: "a".repeat(40)
  },
  reviews: [
    { login: "reviewer", state: "APPROVED" }
  ],
  checks: [
    { name: "Validate", conclusion: "SUCCESS" }
  ],
  current: {
    dispatcher: "dispatcher",
    workflowCommit: "a".repeat(40)
  },
  ...overrides
});

function validEnv() {
  return {
    GITHUB_TOKEN: "test-token",
    GITHUB_REPOSITORY: "gccwebos-com/proxy-gateway-minimal",
    GITHUB_SHA: "a".repeat(40),
    GITHUB_ACTOR: "dispatcher"
  };
}

function fixtureFetch(evidence) {
  const bodies = [
    {
      number: evidence.pullRequest.number,
      merged: evidence.pullRequest.merged,
      merge_commit_sha: evidence.pullRequest.mergeCommit
    },
    evidence.reviews.map(({ login, state }) => ({ user: { login }, state })),
    { check_runs: evidence.checks }
  ];
  const calls = [];
  const fetchFn = async (url, options) => {
    calls.push({ url, options });
    const body = bodies.shift();
    return {
      ok: true,
      json: async () => body
    };
  };
  fetchFn.calls = calls;
  return fetchFn;
}

test("queries fixed GitHub evidence endpoints and emits approved evidence", async () => {
  const stdout = { text: "", write(value) { this.text += value; } };
  const stderr = { text: "", write(value) { this.text += value; } };
  const fetchFn = fixtureFetch(validEvidence());

  const exitCode = await runMergedPrApprovalCli({
    argv: ["--pr-number", "531"],
    env: validEnv(),
    fetchFn,
    stdout,
    stderr
  });

  assert.equal(exitCode, 0);
  assert.equal(JSON.parse(stdout.text).type, "japan_tuic_merged_pr_approval");
  assert.equal(stderr.text, "");
  assert.deepEqual(fetchFn.calls.map(({ url }) => url), [
    "https://api.github.com/repos/gccwebos-com/proxy-gateway-minimal/pulls/531",
    "https://api.github.com/repos/gccwebos-com/proxy-gateway-minimal/pulls/531/reviews?per_page=100",
    `https://api.github.com/repos/gccwebos-com/proxy-gateway-minimal/commits/${"a".repeat(40)}/check-runs?per_page=100`
  ]);
});

test("accepts a merged PR with independent approval and a successful Validate check", () => {
  assert.deepEqual(validateMergedPrApproval(validEvidence()), {
    ok: true,
    type: "japan_tuic_merged_pr_approval",
    prNumber: 531
  });
});

test("rejects a dispatcher approval", () => {
  assert.throws(
    () => validateMergedPrApproval(validEvidence({
      reviews: [{ login: "dispatcher", state: "APPROVED" }]
    })),
    /merged_pr_approval_mismatch/
  );
});

test("uses each reviewer's latest state", () => {
  assert.throws(
    () => validateMergedPrApproval(validEvidence({
      reviews: [
        { login: "reviewer", state: "APPROVED" },
        { login: "reviewer", state: "CHANGES_REQUESTED" }
      ]
    })),
    /merged_pr_approval_mismatch/
  );
  assert.throws(
    () => validateMergedPrApproval(validEvidence({
      reviews: [
        { login: "reviewer", state: "APPROVED" },
        { login: "reviewer", state: "DISMISSED" }
      ]
    })),
    /merged_pr_approval_mismatch/
  );
});

test("rejects a non-merged PR, commit drift, or absent successful Validate check", () => {
  for (const evidence of [
    validEvidence({ pullRequest: { number: 531, merged: false, mergeCommit: "a".repeat(40) } }),
    validEvidence({ pullRequest: { number: 531, merged: true, mergeCommit: "b".repeat(40) } }),
    validEvidence({ checks: [{ name: "Validate", conclusion: "FAILURE" }] }),
    validEvidence({ checks: [{ name: "Other", conclusion: "SUCCESS" }] })
  ]) {
    assert.throws(() => validateMergedPrApproval(evidence), /merged_pr_approval_mismatch/);
  }
});

test("rejects unknown or malformed evidence fields", () => {
  const unknownPullRequest = validEvidence();
  unknownPullRequest.pullRequest.extra = "not-allowed";
  const unknownReview = validEvidence();
  unknownReview.reviews[0].extra = "not-allowed";
  const unknownCheck = validEvidence();
  unknownCheck.checks[0].extra = "not-allowed";
  const unknownCurrent = validEvidence();
  unknownCurrent.current.extra = "not-allowed";

  for (const evidence of [
    { ...validEvidence(), extra: "not-allowed" },
    unknownPullRequest,
    unknownReview,
    unknownCheck,
    unknownCurrent,
    validEvidence({ reviews: [{ login: "reviewer", state: 1 }] }),
    validEvidence({ checks: "not-an-array" }),
    validEvidence({ current: { dispatcher: "dispatcher", workflowCommit: "invalid" } })
  ]) {
    assert.throws(() => validateMergedPrApproval(evidence), /merged_pr_approval_mismatch/);
  }
});

test("rejects non-enumerable and Symbol own properties", () => {
  const nonEnumerable = validEvidence();
  Object.defineProperty(nonEnumerable, "extra", { value: "not-allowed" });
  const symbolProperty = validEvidence();
  symbolProperty[Symbol("extra")] = "not-allowed";

  for (const evidence of [nonEnumerable, symbolProperty]) {
    assert.throws(() => validateMergedPrApproval(evidence), /merged_pr_approval_mismatch/);
  }
});

test("rejects accessor properties without invoking their getters", () => {
  const evidence = validEvidence();
  Object.defineProperty(evidence, "pullRequest", {
    enumerable: true,
    get() {
      throw new Error("protected getter value");
    }
  });

  assert.throws(
    () => validateMergedPrApproval(evidence),
    (error) => error.code === "merged_pr_approval_mismatch"
      && error.message === "merged_pr_approval_mismatch"
  );
});

test("maps hostile Proxy ownKeys failures to the safe error", () => {
  const evidence = new Proxy(validEvidence(), {
    ownKeys() {
      throw new Error("protected ownKeys failure");
    }
  });

  assert.throws(
    () => validateMergedPrApproval(evidence),
    (error) => error.code === "merged_pr_approval_mismatch"
      && error.message === "merged_pr_approval_mismatch"
  );
});

test("maps a hostile Proxy object thrown by ownKeys to the safe error", () => {
  const hostileError = new Proxy({}, {
    getPrototypeOf() {
      throw new Error("protected catch-path failure");
    }
  });
  const evidence = new Proxy(validEvidence(), {
    ownKeys() {
      throw hostileError;
    }
  });

  assert.throws(
    () => validateMergedPrApproval(evidence),
    (error) => error.code === "merged_pr_approval_mismatch"
      && error.message === "merged_pr_approval_mismatch"
  );
});

test("rejects extra own properties on review and check arrays", () => {
  const reviewEnumerable = validEvidence();
  reviewEnumerable.reviews.extra = "not-allowed";
  const reviewNonEnumerable = validEvidence();
  Object.defineProperty(reviewNonEnumerable.reviews, "extra", { value: "not-allowed" });
  const reviewSymbol = validEvidence();
  reviewSymbol.reviews[Symbol("extra")] = "not-allowed";
  const checkEnumerable = validEvidence();
  checkEnumerable.checks.extra = "not-allowed";
  const checkNonEnumerable = validEvidence();
  Object.defineProperty(checkNonEnumerable.checks, "extra", { value: "not-allowed" });
  const checkSymbol = validEvidence();
  checkSymbol.checks[Symbol("extra")] = "not-allowed";

  for (const evidence of [
    reviewEnumerable,
    reviewNonEnumerable,
    reviewSymbol,
    checkEnumerable,
    checkNonEnumerable,
    checkSymbol
  ]) {
    assert.throws(() => validateMergedPrApproval(evidence), /merged_pr_approval_mismatch/);
  }
});
