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
  assert.match(workflow, /permissions:\r?\n  contents: read/);
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
});
