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
    mergeCommit: "a".repeat(40),
    headCommit: "b".repeat(40)
  },
  reviews: [
    { login: "reviewer", state: "APPROVED", commitId: "b".repeat(40) }
  ],
  checks: [
    { name: "Validate", conclusion: "SUCCESS" }
  ],
  current: {
    triggeringActor: "triggering-actor",
    workflowCommit: "a".repeat(40)
  },
  ...overrides
});

function validEnv() {
  return {
    GITHUB_TOKEN: "test-token",
    GITHUB_REPOSITORY: "gccwebos-com/proxy-gateway-minimal",
    GITHUB_SHA: "a".repeat(40),
    GITHUB_TRIGGERING_ACTOR: "triggering-actor"
  };
}

function fixtureFetch(evidence) {
  const bodies = [
    {
      number: evidence.pullRequest.number,
      merged: evidence.pullRequest.merged,
      merge_commit_sha: evidence.pullRequest.mergeCommit,
      head: { sha: evidence.pullRequest.headCommit }
    },
    evidence.reviews.map(({ login, state, commitId }) => ({
      user: { login },
      state,
      commit_id: commitId
    })),
    { check_runs: evidence.checks }
  ];
  const calls = [];
  const fetchFn = async (url, options) => {
    calls.push({ url, options });
    const body = bodies.shift();
    return {
      ok: true,
      headers: { get: () => null },
      json: async () => body
    };
  };
  fetchFn.calls = calls;
  return fetchFn;
}

function capturedStreams() {
  return {
    stdout: { text: "", write(value) { this.text += value; } },
    stderr: { text: "", write(value) { this.text += value; } }
  };
}

function apiResponse(body, { link = null, ok = true } = {}) {
  return {
    ok,
    headers: {
      get(name) {
        return name.toLowerCase() === "link" ? link : null;
      }
    },
    json: async () => body
  };
}

function queuedFetch(responses) {
  const calls = [];
  const fetchFn = async (url, options) => {
    calls.push({ url, options });
    return responses.shift();
  };
  fetchFn.calls = calls;
  return fetchFn;
}

function assertSafeCliFailure({ exitCode, stdout, stderr, sensitive }) {
  assert.equal(exitCode, 1);
  assert.equal(stdout.text, "");
  assert.equal(stderr.text, "merged_pr_approval_mismatch\n");
  assert.equal(`${stdout.text}${stderr.text}`.includes("test-token"), false);
  assert.equal(`${stdout.text}${stderr.text}`.includes(sensitive), false);
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
  assert.equal(stdout.text.includes("reviewer"), false);
  assert.equal(stdout.text.includes("triggering-actor"), false);
  assert.equal(stdout.text.includes("test-token"), false);
  assert.deepEqual(fetchFn.calls.map(({ url }) => url), [
    "https://api.github.com/repos/gccwebos-com/proxy-gateway-minimal/pulls/531",
    "https://api.github.com/repos/gccwebos-com/proxy-gateway-minimal/pulls/531/reviews?per_page=100",
    `https://api.github.com/repos/gccwebos-com/proxy-gateway-minimal/commits/${"a".repeat(40)}/check-runs?per_page=100`
  ]);
});

test("requires the actual triggering actor before making a GitHub request", async () => {
  for (const options of [
    { argv: ["--pr-number", "not-a-number"], env: validEnv() },
    { argv: ["--pr-number", "531"], env: { ...validEnv(), GITHUB_TOKEN: "" } },
    {
      argv: ["--pr-number", "531"],
      env: {
        ...validEnv(),
        GITHUB_TRIGGERING_ACTOR: "",
        GITHUB_ACTOR: "original-dispatcher"
      }
    }
  ]) {
    const { stdout, stderr } = capturedStreams();
    let requests = 0;
    const exitCode = await runMergedPrApprovalCli({
      ...options,
      fetchFn: async () => { requests += 1; },
      stdout,
      stderr
    });

    assertSafeCliFailure({
      exitCode,
      stdout,
      stderr,
      sensitive: "invalid-context-api-body"
    });
    assert.equal(requests, 0);
  }
});

test("stops at the non-OK GitHub response without leaking API data", async () => {
  const { stdout, stderr } = capturedStreams();
  let requests = 0;
  const apiBody = "non-ok-api-body";
  const responses = [
    {
      ok: true,
      json: async () => ({
        number: 531,
        merged: true,
        merge_commit_sha: "a".repeat(40)
      })
    },
    { ok: false, json: async () => ({ message: apiBody }) }
  ];
  const exitCode = await runMergedPrApprovalCli({
    argv: ["--pr-number", "531"],
    env: validEnv(),
    fetchFn: async () => {
      requests += 1;
      return responses.shift();
    },
    stdout,
    stderr
  });

  assertSafeCliFailure({ exitCode, stdout, stderr, sensitive: apiBody });
  assert.equal(requests, 2);
});

test("rejects malformed GitHub evidence without leaking its response body", async () => {
  const { stdout, stderr } = capturedStreams();
  const apiBody = "malformed-api-body";
  const fetchFn = fixtureFetch(validEvidence());
  fetchFn.calls.length = 0;
  const originalFetch = fetchFn;
  let responseIndex = 0;
  const malformedFetch = async (...args) => {
    const response = await originalFetch(...args);
    responseIndex += 1;
    if (responseIndex === 2) return { ok: true, json: async () => ({ message: apiBody }) };
    return response;
  };
  const exitCode = await runMergedPrApprovalCli({
    argv: ["--pr-number", "531"],
    env: validEnv(),
    fetchFn: malformedFetch,
    stdout,
    stderr
  });

  assertSafeCliFailure({ exitCode, stdout, stderr, sensitive: apiBody });
  assert.equal(fetchFn.calls.length, 2);
});

test("consumes every review page before accepting a final-head approval", async () => {
  const { stdout, stderr } = capturedStreams();
  const nextReviewsUrl =
    "https://api.github.com/repos/gccwebos-com/proxy-gateway-minimal/pulls/531/reviews"
    + "?per_page=100&page=2";
  const fetchFn = queuedFetch([
    apiResponse({
      number: 531,
      merged: true,
      merge_commit_sha: "a".repeat(40),
      head: { sha: "b".repeat(40) }
    }),
    apiResponse([
      {
        user: { login: "first-page-reviewer-private" },
        state: "COMMENTED",
        commit_id: "b".repeat(40)
      }
    ], { link: `<${nextReviewsUrl}>; rel="next"` }),
    apiResponse([
      {
        user: { login: "page-two-reviewer-private" },
        state: "APPROVED",
        commit_id: "b".repeat(40)
      }
    ]),
    apiResponse({ check_runs: [{ name: "Validate", conclusion: "SUCCESS" }] })
  ]);

  const exitCode = await runMergedPrApprovalCli({
    argv: ["--pr-number", "531"],
    env: validEnv(),
    fetchFn,
    stdout,
    stderr
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.text, "");
  assert.equal(stdout.text.includes("first-page-reviewer-private"), false);
  assert.equal(stdout.text.includes("page-two-reviewer-private"), false);
  assert.equal(stdout.text.includes(nextReviewsUrl), false);
  assert.deepEqual(fetchFn.calls.map(({ url }) => url), [
    "https://api.github.com/repos/gccwebos-com/proxy-gateway-minimal/pulls/531",
    "https://api.github.com/repos/gccwebos-com/proxy-gateway-minimal/pulls/531/reviews?per_page=100",
    nextReviewsUrl,
    `https://api.github.com/repos/gccwebos-com/proxy-gateway-minimal/commits/${"a".repeat(40)}/check-runs?per_page=100`
  ]);
});

test("rejects a second-page dismissal and consumes the complete review history", async () => {
  const { stdout, stderr } = capturedStreams();
  const nextReviewsUrl =
    "https://api.github.com/repos/gccwebos-com/proxy-gateway-minimal/pulls/531/reviews"
    + "?per_page=100&page=2";
  const fetchFn = queuedFetch([
    apiResponse({
      number: 531,
      merged: true,
      merge_commit_sha: "a".repeat(40),
      head: { sha: "b".repeat(40) }
    }),
    apiResponse([
      {
        user: { login: "reviewer" },
        state: "APPROVED",
        commit_id: "b".repeat(40)
      }
    ], { link: `<${nextReviewsUrl}>; rel="next"` }),
    apiResponse([
      {
        user: { login: "reviewer" },
        state: "DISMISSED",
        commit_id: "b".repeat(40)
      }
    ]),
    apiResponse({ check_runs: [{ name: "Validate", conclusion: "SUCCESS" }] })
  ]);

  const exitCode = await runMergedPrApprovalCli({
    argv: ["--pr-number", "531"],
    env: validEnv(),
    fetchFn,
    stdout,
    stderr
  });

  assertSafeCliFailure({
    exitCode,
    stdout,
    stderr,
    sensitive: nextReviewsUrl
  });
  assert.equal(fetchFn.calls.length, 4);
});

test("fails safely when review pagination cannot be parsed", async () => {
  for (const malformedLink of [
    "malformed-pagination-private-value",
    '<https://pagination-private.example/reviews?per_page=100&page=2>; rel="next"',
    '<https://api.github.com/repos/other/repository/pulls/531/reviews?per_page=100&page=2>; rel="next"',
    '<https://api.github.com/repos/gccwebos-com/proxy-gateway-minimal/pulls/531/reviews?per_page=100&page=99999999999999999999>; rel="next"'
  ]) {
    const { stdout, stderr } = capturedStreams();
    const fetchFn = queuedFetch([
      apiResponse({
        number: 531,
        merged: true,
        merge_commit_sha: "a".repeat(40),
        head: { sha: "b".repeat(40) }
      }),
      apiResponse([
        {
          user: { login: "reviewer" },
          state: "APPROVED",
          commit_id: "b".repeat(40)
        }
      ], { link: malformedLink }),
      apiResponse({ check_runs: [{ name: "Validate", conclusion: "SUCCESS" }] })
    ]);

    const exitCode = await runMergedPrApprovalCli({
      argv: ["--pr-number", "531"],
      env: validEnv(),
      fetchFn,
      stdout,
      stderr
    });

    assertSafeCliFailure({
      exitCode,
      stdout,
      stderr,
      sensitive: malformedLink
    });
    assert.equal(fetchFn.calls.length, 2);
  }
});

test("accepts a final-head approval with a successful Validate check", () => {
  assert.deepEqual(validateMergedPrApproval(validEvidence()), {
    ok: true,
    type: "japan_tuic_merged_pr_approval",
    prNumber: 531
  });
});

test("rejects approval by the workflow triggering actor", () => {
  for (const login of ["triggering-actor", "TRIGGERING-ACTOR"]) {
    assert.throws(
      () => validateMergedPrApproval(validEvidence({
        reviews: [{
          login,
          state: "APPROVED",
          commitId: "b".repeat(40)
        }]
      })),
      /merged_pr_approval_mismatch/
    );
  }
});

test("rejects an approval from an earlier PR head commit", () => {
  assert.throws(
    () => validateMergedPrApproval(validEvidence({
      reviews: [{
        login: "reviewer",
        state: "APPROVED",
        commitId: "c".repeat(40)
      }]
    })),
    /merged_pr_approval_mismatch/
  );
});

test("uses each reviewer's latest state", () => {
  assert.throws(
    () => validateMergedPrApproval(validEvidence({
      reviews: [
        { login: "reviewer", state: "APPROVED", commitId: "b".repeat(40) },
        { login: "reviewer", state: "CHANGES_REQUESTED", commitId: "b".repeat(40) }
      ]
    })),
    /merged_pr_approval_mismatch/
  );
  assert.throws(
    () => validateMergedPrApproval(validEvidence({
      reviews: [
        { login: "reviewer", state: "APPROVED", commitId: "b".repeat(40) },
        { login: "reviewer", state: "DISMISSED", commitId: "b".repeat(40) }
      ]
    })),
    /merged_pr_approval_mismatch/
  );
});

test("rejects a non-merged PR, commit drift, or absent successful Validate check", () => {
  for (const evidence of [
    validEvidence({
      pullRequest: {
        number: 531,
        merged: false,
        mergeCommit: "a".repeat(40),
        headCommit: "b".repeat(40)
      }
    }),
    validEvidence({
      pullRequest: {
        number: 531,
        merged: true,
        mergeCommit: "c".repeat(40),
        headCommit: "b".repeat(40)
      }
    }),
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
    validEvidence({
      reviews: [{ login: "reviewer", state: 1, commitId: "b".repeat(40) }]
    }),
    validEvidence({ checks: "not-an-array" }),
    validEvidence({
      current: { triggeringActor: "triggering-actor", workflowCommit: "invalid" }
    })
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
