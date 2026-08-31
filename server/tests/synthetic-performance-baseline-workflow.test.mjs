import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOW_PATH = resolve(
  REPOSITORY_ROOT,
  ".github/workflows/synthetic-performance-baseline.yml"
);
const ACTION_PINS = [
  "actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803",
  "actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38",
  "actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c",
  "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a"
];

function directKeys(block, indentation) {
  const prefix = " ".repeat(indentation);
  return block.split("\n").flatMap((line) => {
    const match = line.match(new RegExp(`^${prefix}([^\\s:][^:]*):(?:\\s.*)?$`));
    return match ? [match[1]] : [];
  });
}

test("synthetic performance workflow is manual, read-only, and exact-master bound", () => {
  const workflow = readFileSync(WORKFLOW_PATH, "utf8").replace(/\r\n/g, "\n");
  const permissionsOffset = workflow.indexOf("\npermissions:\n");
  const concurrencyOffset = workflow.indexOf("\nconcurrency:\n");
  const jobsOffset = workflow.indexOf("\njobs:\n");

  assert.notEqual(permissionsOffset, -1);
  assert.notEqual(concurrencyOffset, -1);
  assert.notEqual(jobsOffset, -1);
  assert.deepEqual(directKeys(workflow.slice(0, jobsOffset), 0), [
    "name",
    "on",
    "permissions",
    "concurrency"
  ]);
  assert.deepEqual(
    directKeys(workflow.slice(workflow.indexOf("\non:\n") + 1, permissionsOffset), 2),
    ["workflow_dispatch"]
  );
  assert.deepEqual(
    directKeys(workflow.slice(permissionsOffset + 1, concurrencyOffset), 2),
    ["actions", "contents"]
  );

  assert.match(workflow, /^name: Synthetic Performance Baseline$/m);
  assert.match(workflow, /^  workflow_dispatch:$/m);
  assert.match(workflow, /release_run_id:/);
  assert.doesNotMatch(
    workflow,
    /^  (?:push|pull_request|pull_request_target|schedule|workflow_run):$/m
  );
  assert.match(workflow, /permissions:\r?\n  actions: read\r?\n  contents: read/);
  assert.doesNotMatch(
    workflow,
    /actions: write|contents: write|id-token: write|packages: write|secrets\.|environment:/
  );
  assert.doesNotMatch(workflow, /^    if:/m);
  assert.match(workflow, /test "\$GITHUB_EVENT_NAME" = "workflow_dispatch"/);
  assert.match(workflow, /test "\$GITHUB_REF" = "refs\/heads\/master"/);
  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.match(workflow, /timeout-minutes: 90/);
  assert.match(workflow, /cancel-in-progress: false/);

  assert.match(workflow, /run\.name === "Release Artifact"/);
  assert.match(workflow, /run\.path === "\.github\/workflows\/release-artifact\.yml"/);
  assert.match(workflow, /run\.event === "push"/);
  assert.match(workflow, /run\.head_branch === "master"/);
  assert.match(workflow, /run\.head_sha === expectedCommit/);
  assert.match(workflow, /run\.conclusion === "success"/);
  assert.match(workflow, /run-id: \$\{\{ inputs\.release_run_id \}\}/);
  assert.match(workflow, /name: proxy-gateway-\$\{\{ steps\.release\.outputs\.short_sha \}\}/);

  const actions = [...workflow.matchAll(/^\s+uses: (actions\/[a-z-]+@[0-9a-f]{40})(?: # v[0-9.]+)?$/gm)]
    .map((match) => match[1]);
  assert.deepEqual(actions, ACTION_PINS);
  assert.match(workflow, /node-version: 22\.23\.1/);
  assert.match(workflow, /npm ci --no-audit --no-fund/);
  assert.match(workflow, /npm ls --all --json/);
  assert.match(workflow, /test ! -L node_modules/);
  assert.doesNotMatch(workflow, /--omit=dev|--allow-provisional-runtime|PERF_SKIP_SCRYPT/);

  assert.match(workflow, /PERF_ACCOUNT_SCALES: 100,1000,5000,10000/);
  assert.match(workflow, /PERF_HTTP_CONCURRENCY: 1,8,32/);
  assert.match(workflow, /PERF_HTTP_FIXED_RATES: 10,100/);
  assert.match(workflow, /PERF_HTTP_REPEATS: "1"/);
  assert.match(workflow, /PERF_SQLITE_WRITE_CONCURRENCY: 1,2,4,8/);
  assert.match(workflow, /PERF_SQLITE_WRITE_OPERATIONS: "8000"/);
  assert.match(workflow, /TZ: UTC/);
  assert.match(workflow, /LANG: C\.UTF-8/);
  assert.match(workflow, /LC_ALL: C\.UTF-8/);
  assert.match(workflow, /for run_number in 1 2 3/);
  assert.match(workflow, /seed=\$\(\(270826 \+ run_number\)\)/);
  assert.equal((workflow.match(/--confirm-local-synthetic/g) ?? []).length, 1);
  assert.match(workflow, /--section all/);
  assert.match(workflow, /--expected-commit "\$EXPECTED_SOURCE_COMMIT"/);

  assert.match(workflow, /node scripts\/local-performance-baseline-report-set\.mjs/);
  assert.match(workflow, /--release-run-id "\$RELEASE_RUN_ID"/);
  assert.equal((workflow.match(/--report "\$REPORT_DIR\/baseline-run-0[123]\.json"/g) ?? []).length, 3);
  assert.match(workflow, /--output "\$REPORT_DIR\/baseline-receipt\.json"/);
  assert.match(
    workflow,
    /name: synthetic-performance-\$\{\{ github\.sha \}\}-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/
  );
  assert.match(workflow, /retention-days: 14/);

  assert.doesNotMatch(workflow, /\bdeploy\b|\bprovider\b|\bssh\b|\bscp\b|\brsync\b/i);
});
