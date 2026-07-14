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

test("CI keeps one stable Validate job, always checks the diff, and gates heavy validation by lane", () => {
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
    assert.match(step, /if: steps\.changes\.outputs\.lane == 'code'/, stepName);
  }

  const diffStepStart = validate.indexOf("- name: Check diff");
  assert.ok(diffStepStart >= 0, "missing unconditional diff check");
  const diffStep = validate.slice(diffStepStart, validate.indexOf("\n      - name:", diffStepStart + 1));
  assert.doesNotMatch(diffStep, /^\s*if:/m);
  assert.match(workflow, /permissions:\r?\n  contents: read/);
});

test("Release Artifact skips all package jobs only for docs-only pushes and dispatch stays full", () => {
  const workflow = readRepositoryFile(".github/workflows/release-artifact.yml");
  const classify = jobBlock(workflow, "classify", "package");

  assert.match(classify, /node scripts\/ci-change-classifier\.mjs/);
  assert.match(classify, /outputs:/);
  assert.match(classify, /lane: \$\{\{ steps\.changes\.outputs\.lane \}\}/);

  const jobs = [
    ["package", "portal-static"],
    ["portal-static", "admin-static"],
    ["admin-static", undefined]
  ];
  for (const [jobName, nextJobName] of jobs) {
    const job = jobBlock(workflow, jobName, nextJobName);
    assert.match(job, /needs: classify/);
    assert.match(job, /if: needs\.classify\.outputs\.lane == 'code'/);
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
});
