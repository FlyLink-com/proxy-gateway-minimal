import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { FOUNDATION_TOOLCHAIN_CONTAINER_IMAGE } from "../../scripts/control-plane-foundation-toolchain-inventory.mjs";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOW_PATH = resolve(
  REPOSITORY_ROOT,
  ".github/workflows/control-plane-foundation-toolchain-inventory.yml"
);

test("v2 closure inventory is PR-only, digest-pinned, no-secret, and cannot publish or build", () => {
  const workflow = readFileSync(WORKFLOW_PATH, "utf8");

  assert.match(workflow, /^name: Control Plane Foundation Toolchain Inventory$/m);
  assert.match(workflow, /^on:\r?\n  pull_request:\r?\n    branches:\r?\n      - master$/m);
  assert.doesNotMatch(workflow, /^\s*(?:push|workflow_dispatch|schedule|pull_request_target):/m);
  assert.match(workflow, /^permissions:\r?\n  contents: read$/m);
  assert.match(workflow, /^    runs-on: ubuntu-24\.04$/m);
  assert.match(workflow, new RegExp(`^      image: ${FOUNDATION_TOOLCHAIN_CONTAINER_IMAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
  assert.match(workflow, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.match(workflow, /persist-credentials: false/);
  assert.doesNotMatch(workflow, /actions\/setup-node/);
  assert.match(workflow, /CONTROL_PLANE_FOUNDATION_CONTAINER_IMAGE:/);
  assert.match(workflow, /node --test[\s\S]*server\/tests\/control-plane-foundation-toolchain-inventory\.test\.mjs/);
  assert.match(workflow, /server\/tests\/control-plane-foundation-toolchain-inventory-workflow\.test\.mjs/);
  assert.match(workflow, /node scripts\/control-plane-foundation-toolchain-inventory\.mjs/);
  assert.doesNotMatch(workflow, /(?:secrets\.|environment:|contents: write|id-token: write|actions: write)/i);
  assert.doesNotMatch(workflow, /(?:npm |node-gyp|\bgcc\b|\bclang\b|\bmake\b|\bpython\b|upload-artifact|cache@|docker |podman)/i);
  assert.doesNotMatch(workflow, /(?:ssh|scp|rsync|provider|deploy|release|package|production)/i);
});
