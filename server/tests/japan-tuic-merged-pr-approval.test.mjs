import assert from "node:assert/strict";
import test from "node:test";

import { validateMergedPrApproval } from "../../scripts/japan-tuic-merged-pr-approval.mjs";

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
