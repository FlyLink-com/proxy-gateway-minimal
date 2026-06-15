import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildPrecommitCheckPlan
} from "../../scripts/precommit-check.mjs";

function commandNames(plan) {
  return plan.commands.map((command) => command.command);
}

test("precommit check keeps docs-only validation light", () => {
  const plan = buildPrecommitCheckPlan({
    changedFiles: [
      "docs/PROJECT_CONTEXT.md",
      ".github/pull_request_template.md"
    ]
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.riskTier, "C");
  assert.deepEqual(commandNames(plan), ["git diff --check"]);
  assert.equal(plan.productionAwsImpact, "None");
});

test("precommit check adds project-state validation for state files", () => {
  const plan = buildPrecommitCheckPlan({
    changedFiles: [
      "project-state/current.json",
      "docs/PROJECT_CONTEXT.md"
    ]
  });

  assert.equal(plan.riskTier, "C/B");
  assert.deepEqual(commandNames(plan), [
    "git diff --check",
    "npm run project-state:check"
  ]);
});

test("precommit check selects server tests for shared code and scripts", () => {
  const plan = buildPrecommitCheckPlan({
    changedFiles: [
      "scripts/check-project-state.mjs",
      "server/tests/project-state-check.test.mjs"
    ]
  });

  assert.equal(plan.riskTier, "B");
  assert.deepEqual(commandNames(plan), [
    "git diff --check",
    "npm run project-state:check",
    "npm test"
  ]);
});

test("precommit check selects admin validation only when admin changes", () => {
  const plan = buildPrecommitCheckPlan({
    changedFiles: [
      "admin/src/pages/overview-page.tsx"
    ]
  });

  assert.equal(plan.riskTier, "B");
  assert.deepEqual(commandNames(plan), [
    "git diff --check",
    "npm run admin:test",
    "npm run admin:build",
    "npm test"
  ]);
});

test("precommit check commands remain local repository validation only", () => {
  const plan = buildPrecommitCheckPlan({
    changedFiles: [
      "ops/edge-node/README.md"
    ]
  });

  assert.equal(plan.redacted, true);
  assert.doesNotMatch(JSON.stringify(plan), /\b(aws|aliyun|vultr|ssh|scp|curl|nginx|systemctl)\b/i);
});

test("package scripts expose the opt-in precommit check command", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

  assert.equal(packageJson.scripts["precommit:check"], "node scripts/precommit-check.mjs");
});
