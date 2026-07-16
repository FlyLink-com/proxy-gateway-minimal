import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function readRepositoryFile(path) {
  return readFileSync(resolve(REPOSITORY_ROOT, path), "utf8");
}

function jobBlock(workflow, jobName, nextJobName) {
  const start = workflow.indexOf(`  ${jobName}:`);
  assert.ok(start >= 0, `missing ${jobName} job`);
  const end = nextJobName ? workflow.indexOf(`  ${nextJobName}:`, start + 1) : -1;
  return workflow.slice(start, end >= 0 ? end : undefined);
}

test("CI keeps one stable Validate job, always checks the exact diff, and skips heavy validation only for docs-only", () => {
  const workflow = readRepositoryFile(".github/workflows/ci.yml");
  const validate = jobBlock(workflow, "validate");

  assert.equal((workflow.match(/^    name: Validate$/gm) ?? []).length, 1);
  assert.match(validate, /node scripts\/ci-change-classifier\.mjs/);
  assert.match(validate, /git diff --check/);
  assert.match(validate, /id: changes/);

  const heavyStepNames = [
    "Install root dependencies",
    "Install admin dependencies",
    "Run server tests",
    "Run admin tests",
    "Build admin app",
    "Build public site",
    "Verify public site boundary",
    "Cloudflare public site dry run"
  ];
  for (const stepName of heavyStepNames) {
    const stepStart = validate.indexOf(`- name: ${stepName}`);
    assert.ok(stepStart >= 0, `missing ${stepName}`);
    const step = validate.slice(stepStart, validate.indexOf("\n      - name:", stepStart + 1));
    assert.match(step, /if: steps\.changes\.outputs\.run_full != '0'/, stepName);
  }

  const diffStepStart = validate.indexOf("- name: Check diff");
  assert.ok(diffStepStart >= 0, "missing diff check");
  const diffStep = validate.slice(diffStepStart, validate.indexOf("\n      - name:", diffStepStart + 1));
  assert.match(diffStep, /^\s*if: always\(\)/m);
  assert.match(diffStep, /\[\[ "\$CI_DIFF_BASE" =~ \^\[0-9a-f\]\{40\}\$ \]\]/);
  assert.match(diffStep, /\[\[ "\$CI_DIFF_HEAD" =~ \^\[0-9a-f\]\{40\}\$ \]\]/);
  assert.match(diffStep, /git cat-file -e "\$CI_DIFF_BASE\^\{commit\}"/);
  assert.match(diffStep, /git cat-file -e "\$CI_DIFF_HEAD\^\{commit\}"/);
  assert.match(diffStep, /git diff --check "\$range"/);

  const authorityStepStart = validate.indexOf("- name: Check document authority");
  assert.ok(authorityStepStart >= 0, "missing document authority check");
  const authorityStep = validate.slice(
    authorityStepStart,
    validate.indexOf("\n      - name:", authorityStepStart + 1)
  );
  assert.match(authorityStep, /^\s*if: always\(\)/m);
  assert.match(authorityStep, /npm run docs:authority:check/);
  assert.match(workflow, /permissions:\r?\n  contents: read/);
});

test("CI separates read-only governance evidence from manual snapshot validation", () => {
  const workflow = readRepositoryFile(".github/workflows/ci.yml");
  const governance = jobBlock(workflow, "governance-evidence", "governance-snapshot");
  const snapshot = jobBlock(workflow, "governance-snapshot", "validate");

  assert.equal((workflow.match(/^    name: Governance evidence$/gm) ?? []).length, 1);
  assert.equal((workflow.match(/^    name: Governance snapshot$/gm) ?? []).length, 1);
  assert.match(governance, /if: github\.event_name != 'workflow_dispatch'/);
  assert.match(governance, /uses: actions\/checkout@v6/);
  assert.match(governance, /fetch-depth: 0/);
  assert.match(governance, /persist-credentials: false/);
  assert.match(governance, /uses: actions\/setup-node@v6/);
  assert.match(governance, /node-version: 22/);
  assert.match(governance, /git show "\$CI_DIFF_BASE:project-state\/gates\.json"/);
  assert.match(governance, /git show "\$CI_DIFF_BASE:project-state\/repair-policy\.json"/);
  assert.match(governance, /--base-gates-file "\$RUNNER_TEMP\/base-gates\.json"/);
  assert.match(governance, /--base-policy-file "\$RUNNER_TEMP\/base-policy\.json"/);
  assert.match(governance, /--base-state-missing/);
  assert.doesNotMatch(governance, /--snapshot/);
  assert.match(snapshot, /if: github\.event_name == 'workflow_dispatch'/);
  assert.match(snapshot, /--snapshot/);
  assert.doesNotMatch(snapshot, /--base-gates-file|--base-state-missing/);
  assert.match(workflow, /permissions:\r?\n  contents: read/);
  assert.doesNotMatch(governance, /npm ci|contents: write|deploy|provider|ssh|scp|rsync|environment:/i);
});

test("trusted governance advisory uses only the base validator and immutable trust root", () => {
  const workflow = readRepositoryFile(".github/workflows/governance-validate.yml");
  const governance = jobBlock(workflow, "governance-validate");

  assert.match(workflow, /pull_request_target:/);
  assert.equal((workflow.match(/^    name: Governance trusted advisory$/gm) ?? []).length, 1);
  assert.match(workflow, /permissions:\r?\n  contents: read\r?\n  pull-requests: read/);
  assert.equal((governance.match(/actions\/checkout@[a-f0-9]{40} # v6/g) ?? []).length, 2);
  assert.equal((governance.match(/actions\/setup-node@[a-f0-9]{40} # v6/g) ?? []).length, 1);
  assert.equal((governance.match(/persist-credentials: false/g) ?? []).length, 2);
  assert.match(governance, /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.match(governance, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.match(governance, /path: candidate/);
  assert.match(governance, /sparse-checkout:\s*\|\s*project-state\/gates\.json\s*project-state\/repair-policy\.json/s);
  assert.match(governance, /sparse-checkout-cone-mode: false/);
  assert.match(governance, /assert_trust_root_unchanged/);
  assert.match(governance, /\[\[ "\$base_mode" == "100644" && "\$candidate_mode" == "100644" \]\]/);
  assert.match(governance, /server\/services\/governance\/gate-governance\.mjs/);
  assert.match(governance, /schemas\/gate-ledger-v1\.schema\.json/);
  assert.match(governance, /schemas\/failure-attribution-v2\.schema\.json/);
  assert.match(governance, /schemas\/repair-policy-v2\.schema\.json/);
  assert.doesNotMatch(governance, /schemas\/(?:failure-attribution|repair-policy)-v1\.schema\.json/);
  assert.match(governance, /project-state\/repair-policy\.json/);
  assert.match(governance, /git -C candidate ls-tree "\$CANDIDATE_HEAD"/);
  assert.match(governance, /\[\[ "\$mode" == "100644" \]\]/);
  assert.match(governance, /git -C candidate cat-file blob "\$object"/);
  assert.match(governance, /node scripts\/check-gate-governance\.mjs/);
  assert.match(governance, /--head-gates-file \$\{\{ runner\.temp \}\}\/head-gates\.json/);
  assert.match(governance, /--head-policy-file \$\{\{ runner\.temp \}\}\/head-policy\.json/);
  assert.doesNotMatch(governance, /--head-(?:gates|policy)-file candidate\//);
  assert.doesNotMatch(governance, /node candidate\/|npm ci|contents: write|secrets\.|deploy|provider|ssh|scp|rsync|environment:/i);
});

test("Release Artifact skips package jobs only for an exact docs-only result and dispatch stays full", () => {
  const workflow = readRepositoryFile(".github/workflows/release-artifact.yml");
  const classify = jobBlock(workflow, "classify", "package");

  assert.match(classify, /node scripts\/ci-change-classifier\.mjs/);
  assert.match(classify, /outputs:/);
  assert.match(classify, /lane: \$\{\{ steps\.changes\.outputs\.lane \}\}/);
  assert.match(classify, /run_full: \$\{\{ steps\.changes\.outputs\.run_full \}\}/);

  const jobs = [
    ["package", "portal-static"],
    ["portal-static", "admin-static"],
    ["admin-static", undefined]
  ];
  for (const [jobName, nextJobName] of jobs) {
    const job = jobBlock(workflow, jobName, nextJobName);
    assert.match(job, /needs: classify/);
    assert.match(job, /if: needs\.classify\.outputs\.run_full != '0'/);
  }

  assert.match(workflow, /GITHUB_EVENT_NAME/);
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /permissions:\r?\n  contents: read/);
  assert.doesNotMatch(workflow, /contents: write|deploy|provider|ssh|scp|rsync/);
});

test("validation baseline documents the fail-closed docs-only lane contract", () => {
  const baseline = readRepositoryFile("docs/VALIDATION_BASELINE.md");

  assert.match(baseline, /docs-only/i);
  assert.match(baseline, /root `\*\.md`/);
  assert.match(baseline, /`docs\/\*\*\/\*\.md`/);
  assert.match(baseline, /`ops\/\*\*\/\*\.md`/);
  assert.match(baseline, /`\.github\/\*\*\/\*\.md`/);
  assert.match(baseline, /workflow_dispatch.*full/i);
  assert.match(baseline, /git diff --check/);
  assert.match(baseline, /project-state.*code lane/i);
  assert.match(
    baseline,
    /missing or\s+unexpected `run_full` value also defaults to full validation/i
  );
  assert.match(
    baseline,
    /exact lowercase docs-only lane to the numeric\s+`run_full` output `0`/i
  );
  assert.match(baseline, /always\(\)/);
  assert.match(baseline, /npm run docs:authority:check/);
  assert.match(baseline, /duplicate active canonical `authority_scope`/i);
});
