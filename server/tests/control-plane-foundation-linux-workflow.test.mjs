import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOW_PATH = resolve(
  REPOSITORY_ROOT,
  ".github/workflows/control-plane-foundation-linux.yml"
);

function readWorkflow() {
  return readFileSync(WORKFLOW_PATH, "utf8");
}

test("Foundation Linux gate is a pinned, PR-only, no-secret Ubuntu 24.04 check", () => {
  const workflow = readWorkflow();

  assert.match(workflow, /^name: Control Plane Foundation Linux Feasibility$/m);
  assert.match(workflow, /^on:\r?\n  pull_request:\r?\n    branches:\r?\n      - master$/m);
  assert.doesNotMatch(workflow, /^\s*(?:push|workflow_dispatch|schedule|pull_request_target):/m);
  assert.match(workflow, /^permissions:\r?\n  contents: read$/m);
  assert.match(workflow, /^    runs-on: ubuntu-24\.04$/m);
  assert.doesNotMatch(workflow, /(?:self-hosted|ubuntu-latest|ubuntu-slim)/i);

  assert.match(
    workflow,
    /uses: actions\/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6/
  );
  assert.match(
    workflow,
    /uses: actions\/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6/
  );
  assert.match(workflow, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /node-version: 22/);
  assert.match(workflow, /npm ci --ignore-scripts/);
  assert.match(workflow, /npm run control-plane:foundation:linux/);

  const timeout = workflow.match(/^    timeout-minutes: (\d+)$/m);
  assert.ok(timeout, "Foundation Linux job needs a bounded timeout");
  assert.ok(Number(timeout[1]) > 0 && Number(timeout[1]) <= 30);

  assert.doesNotMatch(
    workflow,
    /(?:secrets\.|environment:|contents: write|id-token: write|actions: write|upload-artifact|ssh|scp|rsync|provider|deploy|release)/i
  );
});
