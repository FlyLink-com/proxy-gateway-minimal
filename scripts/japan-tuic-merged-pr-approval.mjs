const safeErrors = new WeakSet();
const GITHUB_API_ORIGIN = "https://api.github.com";

export class JapanTuicMergedPrApprovalError extends Error {
  constructor() {
    super("merged_pr_approval_mismatch");
    this.name = "JapanTuicMergedPrApprovalError";
    this.code = "merged_pr_approval_mismatch";
  }
}

function safeError() {
  const error = new JapanTuicMergedPrApprovalError();
  safeErrors.add(error);
  return error;
}

function exactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Reflect.ownKeys(value);
  return actual.length === keys.length
    && actual.every((key) => {
      if (typeof key !== "string" || !keys.includes(key)) return false;
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      return descriptor && "value" in descriptor;
    });
}

function strictEvidenceArray(value) {
  if (!Array.isArray(value)) return false;
  const actual = Reflect.ownKeys(value);
  const lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, "length");
  if (!lengthDescriptor
    || !("value" in lengthDescriptor)
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
    || actual.length !== lengthDescriptor.value + 1) {
    return false;
  }
  return actual.every((key) => {
    if (key === "length") return true;
    if (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key)) return false;
    const index = Number(key);
    if (!Number.isSafeInteger(index) || index >= lengthDescriptor.value) return false;
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    return descriptor && "value" in descriptor;
  });
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
    || !strictEvidenceArray(reviews)
    || !strictEvidenceArray(checks)
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
  try {
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
  } catch (error) {
    if (safeErrors.has(error)) throw error;
    throw safeError();
  }
}

function parseRunnerContext(argv, env) {
  if (!Array.isArray(argv)
    || argv.length !== 2
    || argv[0] !== "--pr-number"
    || typeof argv[1] !== "string"
    || !/^[1-9][0-9]*$/.test(argv[1])) {
    throw safeError();
  }
  const prNumber = Number(argv[1]);
  const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repository, GITHUB_SHA: workflowCommit,
    GITHUB_ACTOR: dispatcher } = env || {};
  if (!Number.isSafeInteger(prNumber)
    || typeof token !== "string"
    || token.length === 0
    || typeof repository !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(repository)
    || !validCommit(workflowCommit)
    || typeof dispatcher !== "string"
    || dispatcher.length === 0) {
    throw safeError();
  }
  return { prNumber, token, repository, workflowCommit, dispatcher };
}

async function getJson(fetchFn, path, token) {
  const response = await fetchFn(`${GITHUB_API_ORIGIN}${path}`, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`
    }
  });
  if (!response || response.ok !== true || typeof response.json !== "function") throw safeError();
  return response.json();
}

function apiEvidence(pullRequest, reviews, checks, current) {
  return {
    pullRequest: {
      number: pullRequest.number,
      merged: pullRequest.merged,
      mergeCommit: pullRequest.merge_commit_sha
    },
    reviews: reviews.map((review) => ({
      login: review.user?.login,
      state: review.state
    })),
    checks: checks.check_runs.map((check) => ({
      name: check.name,
      conclusion: check.conclusion
    })),
    current
  };
}

export async function runMergedPrApprovalCli({
  argv = process.argv.slice(2),
  env = process.env,
  fetchFn = globalThis.fetch,
  stdout = process.stdout,
  stderr = process.stderr
} = {}) {
  try {
    const { prNumber, token, repository, workflowCommit, dispatcher } = parseRunnerContext(argv, env);
    if (typeof fetchFn !== "function" || !stdout || typeof stdout.write !== "function") throw safeError();
    const paths = [
      `/repos/${repository}/pulls/${prNumber}`,
      `/repos/${repository}/pulls/${prNumber}/reviews?per_page=100`,
      `/repos/${repository}/commits/${workflowCommit}/check-runs?per_page=100`
    ];
    const pullRequest = await getJson(fetchFn, paths[0], token);
    const reviews = await getJson(fetchFn, paths[1], token);
    const checks = await getJson(fetchFn, paths[2], token);
    const result = validateMergedPrApproval(apiEvidence(
      pullRequest,
      reviews,
      checks,
      { dispatcher, workflowCommit }
    ));
    stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  } catch {
    if (stderr && typeof stderr.write === "function") stderr.write("merged_pr_approval_mismatch\n");
    return 1;
  }
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  process.exitCode = await runMergedPrApprovalCli();
}
