import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DOCS_ONLY_LANE = "docs-only";
const CODE_LANE = "code";
const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/;

function codeLane(reason) {
  return { lane: CODE_LANE, reason };
}

function isValidRepositoryPath(path) {
  if (typeof path !== "string" || path.length === 0) {
    return false;
  }
  if (path.includes("\0") || path.includes("\\") || path.startsWith("/")) {
    return false;
  }
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function isDocsOnlyPath(path) {
  if (!path.endsWith(".md")) {
    return false;
  }
  if (!path.includes("/")) {
    return true;
  }
  return path.startsWith("docs/") || path.startsWith("ops/") || path.startsWith(".github/");
}

export function classifyChangedPaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0) {
    return codeLane("changed_paths_empty");
  }
  if (!paths.every(isValidRepositoryPath)) {
    return codeLane("changed_paths_invalid");
  }
  if (!paths.every(isDocsOnlyPath)) {
    return codeLane("code_or_mixed_paths_present");
  }
  return {
    lane: DOCS_ONLY_LANE,
    reason: "all_changed_paths_are_markdown_docs"
  };
}

function parseNulSeparatedPaths(output) {
  if (!Buffer.isBuffer(output)) {
    return null;
  }
  const decoded = output.toString("utf8");
  if (decoded.includes("\uFFFD")) {
    return null;
  }
  const paths = decoded.split("\0");
  if (paths.at(-1) === "") {
    paths.pop();
  }
  return paths;
}

export function classifyGitChangeSet({
  eventName,
  base,
  head,
  runGit = spawnSync
} = {}) {
  if (eventName === "workflow_dispatch") {
    return codeLane("workflow_dispatch_requires_full_validation");
  }
  if (eventName !== "pull_request" && eventName !== "push") {
    return codeLane("event_requires_full_validation");
  }
  if (
    !COMMIT_SHA_PATTERN.test(base ?? "")
    || !COMMIT_SHA_PATTERN.test(head ?? "")
    || /^0+$/.test(base)
  ) {
    return codeLane("diff_identity_invalid");
  }

  let diff;
  try {
    diff = runGit(
      "git",
      ["diff", "--name-only", "--no-renames", "-z", `${base}...${head}`],
      {
        encoding: "buffer",
        maxBuffer: 16 * 1024 * 1024,
        shell: false,
        windowsHide: true
      }
    );
  } catch {
    return codeLane("git_diff_unavailable");
  }

  if (diff?.error || diff?.status !== 0) {
    return codeLane("git_diff_unavailable");
  }
  const paths = parseNulSeparatedPaths(diff.stdout);
  if (paths === null) {
    return codeLane("git_diff_output_invalid");
  }
  return classifyChangedPaths(paths);
}

function parseCliArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (typeof value !== "string") {
      return null;
    }
    if (key === "--event-name") {
      options.eventName = value;
    } else if (key === "--base") {
      options.base = value;
    } else if (key === "--head") {
      options.head = value;
    } else if (key === "--github-output") {
      options.githubOutput = value;
    } else {
      return null;
    }
  }
  return options;
}

export function runChangeClassifierCli({
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr
} = {}) {
  const options = parseCliArguments(argv);
  const result = options
    ? classifyGitChangeSet(options)
    : codeLane("arguments_invalid");

  if (options?.githubOutput) {
    try {
      appendFileSync(
        options.githubOutput,
        `lane=${result.lane}\nreason=${result.reason}\n`,
        "utf8"
      );
    } catch {
      stderr.write(`${JSON.stringify({ ok: false, error: "github_output_unavailable" })}\n`);
      return 1;
    }
  }

  stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
  return 0;
}

const isDirectExecution = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  process.exitCode = runChangeClassifierCli();
}
