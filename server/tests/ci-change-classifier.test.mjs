import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  classifyChangedPaths,
  classifyGitChangeSet,
  fullValidationOutputFor,
  runChangeClassifierCli
} from "../../scripts/ci-change-classifier.mjs";

test("classifies only Markdown entrypoint and governance paths as docs-only", () => {
  const docsOnlyCases = [
    ["README.md"],
    ["AGENTS.md", "docs/PROJECT_CONTEXT.md"],
    ["docs/runbooks/nested/ROLLBACK.md", "ops/README.md"],
    [".github/PULL_REQUEST_TEMPLATE/release.md"]
  ];

  for (const paths of docsOnlyCases) {
    assert.deepEqual(classifyChangedPaths(paths), {
      lane: "docs-only",
      reason: "all_changed_paths_are_markdown_docs"
    });
  }
});

test("fails closed to the code lane for state, workflow, non-Markdown, mixed, empty, or invalid paths", () => {
  const codeLaneCases = [
    ["project-state/current.json"],
    [".github/workflows/ci.yml"],
    ["docs/governance.json"],
    ["ops/inventory.ps1"],
    [".github/CODEOWNERS"],
    ["docs/README.md", "server/app.mjs"],
    [],
    ["../README.md"],
    ["docs\\README.md"],
    [""]
  ];

  for (const paths of codeLaneCases) {
    assert.equal(classifyChangedPaths(paths).lane, "code", JSON.stringify(paths));
  }
});

test("full-validation output skips only the exact lowercase docs-only lane", () => {
  assert.equal(fullValidationOutputFor("docs-only"), "0");
  assert.equal(fullValidationOutputFor("DOCS-ONLY"), "1");
  assert.equal(fullValidationOutputFor("Docs-Only"), "1");
  assert.equal(fullValidationOutputFor("code"), "1");
  assert.equal(fullValidationOutputFor(undefined), "1");
});

test("reads changed paths with an argument-only NUL-delimited git diff", () => {
  const calls = [];
  const result = classifyGitChangeSet({
    eventName: "pull_request",
    base: "a".repeat(40),
    head: "b".repeat(40),
    runGit(command, args, options) {
      calls.push({ command, args, options });
      return {
        status: 0,
        stdout: Buffer.from("docs/README.md\0ops/RUNBOOK.md\0"),
        stderr: Buffer.alloc(0)
      };
    }
  });

  assert.deepEqual(result, {
    lane: "docs-only",
    reason: "all_changed_paths_are_markdown_docs"
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "git");
  assert.deepEqual(calls[0].args, [
    "diff",
    "--name-only",
    "--no-renames",
    "-z",
    `${"a".repeat(40)}...${"b".repeat(40)}`
  ]);
  assert.equal(calls[0].options.shell, false);
  assert.equal(calls[0].options.encoding, "buffer");
});

test("forces workflow dispatch and unreadable diffs onto the full code lane", () => {
  let dispatchGitCalls = 0;
  const dispatch = classifyGitChangeSet({
    eventName: "workflow_dispatch",
    base: "a".repeat(40),
    head: "b".repeat(40),
    runGit() {
      dispatchGitCalls += 1;
      throw new Error("must not run");
    }
  });

  assert.deepEqual(dispatch, {
    lane: "code",
    reason: "workflow_dispatch_requires_full_validation"
  });
  assert.equal(dispatchGitCalls, 0);

  const failedDiff = classifyGitChangeSet({
    eventName: "push",
    base: "a".repeat(40),
    head: "b".repeat(40),
    runGit() {
      return {
        status: 128,
        stdout: Buffer.alloc(0),
        stderr: Buffer.from("unreadable revision")
      };
    }
  });
  assert.deepEqual(failedDiff, {
    lane: "code",
    reason: "git_diff_unavailable"
  });
});

test("CLI writes fail-closed workflow outputs without printing changed paths", () => {
  const directory = mkdtempSync(join(tmpdir(), "ci-lane-output-"));
  const githubOutput = join(directory, "github-output.txt");
  let stdout = "";
  let stderr = "";

  try {
    const exitCode = runChangeClassifierCli({
      argv: [
        "--event-name",
        "workflow_dispatch",
        "--base",
        "",
        "--head",
        "",
        "--github-output",
        githubOutput
      ],
      stdout: { write(value) { stdout += value; } },
      stderr: { write(value) { stderr += value; } }
    });

    assert.equal(exitCode, 0);
    assert.equal(stderr, "");
    assert.equal(
      readFileSync(githubOutput, "utf8"),
      "lane=code\nrun_full=1\nreason=workflow_dispatch_requires_full_validation\n"
    );
    assert.deepEqual(JSON.parse(stdout), {
      ok: true,
      lane: "code",
      reason: "workflow_dispatch_requires_full_validation"
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
