export class JapanTuicMergedPrApprovalError extends Error {
  constructor() {
    super("merged_pr_approval_mismatch");
    this.name = "JapanTuicMergedPrApprovalError";
    this.code = "merged_pr_approval_mismatch";
  }
}

function safeError() {
  return new JapanTuicMergedPrApprovalError();
}

function exactKeys(value, keys) {
  return value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).sort().join("\n") === [...keys].sort().join("\n");
}

function validCommit(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
}

function validateInput(input) {
  if (!exactKeys(input, ["pullRequest", "reviews", "checks", "current"])) throw safeError();
  const { pullRequest, reviews, checks, current } = input;
  if (!exactKeys(pullRequest, ["number", "merged", "mergeCommit"])
    || !Number.isSafeInteger(pullRequest.number)
    || pullRequest.number < 1
    || typeof pullRequest.merged !== "boolean"
    || !validCommit(pullRequest.mergeCommit)
    || !Array.isArray(reviews)
    || !Array.isArray(checks)
    || !exactKeys(current, ["dispatcher", "workflowCommit"])
    || typeof current.dispatcher !== "string"
    || current.dispatcher.length === 0
    || !validCommit(current.workflowCommit)) {
    throw safeError();
  }
  for (const review of reviews) {
    if (!exactKeys(review, ["login", "state"])
      || typeof review.login !== "string"
      || review.login.length === 0
      || typeof review.state !== "string") {
      throw safeError();
    }
  }
  for (const check of checks) {
    if (!exactKeys(check, ["name", "conclusion"])
      || typeof check.name !== "string"
      || typeof check.conclusion !== "string") {
      throw safeError();
    }
  }
  return { pullRequest, reviews, checks, current };
}

function latestReviewerStates(reviews) {
  const latest = new Map();
  for (const review of reviews) latest.set(review.login, review.state);
  return [...latest].map(([login, state]) => ({ login, state }));
}

export function validateMergedPrApproval(input = {}) {
  const { pullRequest, reviews, checks, current } = validateInput(input);
  const approved = latestReviewerStates(reviews).some(({ login, state }) =>
    login !== current.dispatcher && state === "APPROVED"
  );
  const validatePassed = checks.some(({ name, conclusion }) =>
    name === "Validate" && conclusion === "SUCCESS"
  );
  if (!pullRequest.merged
    || pullRequest.mergeCommit !== current.workflowCommit
    || !approved
    || !validatePassed) {
    throw safeError();
  }
  return {
    ok: true,
    type: "japan_tuic_merged_pr_approval",
    prNumber: pullRequest.number
  };
}
