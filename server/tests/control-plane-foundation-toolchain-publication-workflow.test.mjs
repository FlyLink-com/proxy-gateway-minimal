import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOW = resolve(ROOT, ".github/workflows/control-plane-foundation-toolchain-publish.yml");

test("Foundation publication is manual-only, master-only, protected, and immutable-readback gated", () => {
  const workflow = readFileSync(WORKFLOW, "utf8");
  assert.match(workflow, /^name: Control Plane Foundation Toolchain Publication$/m);
  assert.match(workflow, /^on:\r?\n  workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^\s*(?:push|pull_request|pull_request_target|schedule|repository_dispatch|workflow_call):/m);
  for (const input of ["source_commit", "inventory_run_id", "candidate_closure_sha256", "confirmation"]) {
    assert.match(workflow, new RegExp(`^      ${input}:$`, "m"));
  }
  assert.match(workflow, /github\.ref == 'refs\/heads\/master'/);
  assert.match(workflow, /^    environment: artifact-publication$/m);
  assert.match(workflow, /actions: read/);
  assert.match(workflow, /contents: write/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /attestations: write/);
  assert.match(workflow, /immutable-releases/);
  assert.doesNotMatch(workflow, /(?:-X PUT|-X DELETE).*immutable-releases/);
  assert.match(workflow, /gh release create[\s\S]*--draft/);
  assert.match(workflow, /target_commit: \$\{\{ steps\.lock\.outputs\.target_commit \}\}/);
  assert.match(workflow, /--target "\$TARGET_COMMIT"/);
  assert.doesNotMatch(workflow, /--target "\$GITHUB_SHA"/);
  assert.match(workflow, /actions\/attest-build-provenance@[0-9a-f]{40}/);
  assert.match(workflow, /gh release upload/);
  assert.match(workflow, /gh release edit[\s\S]*--draft=false/);
  assert.match(workflow, /\.immutable == true/);
  assert.match(workflow, /\.target_commitish == \$commit/);
  assert.match(workflow, /\.assets \| length == 1/);
  assert.doesNotMatch(workflow, /--clobber|gh release delete|gh api.*-X DELETE/);
  assert.doesNotMatch(workflow, /(?:ssh|scp|rsync|systemctl|provider|vultr|deploy)/i);
});

test("write-capability job has no checkout, setup-node, package manager, or repository script", () => {
  const workflow = readFileSync(WORKFLOW, "utf8");
  const publisher = workflow.slice(workflow.indexOf("  publish:"));
  assert.notEqual(publisher.length, workflow.length);
  assert.doesNotMatch(publisher, /actions\/checkout|actions\/setup-node/);
  assert.doesNotMatch(publisher, /(?:npm|npx|yarn|pnpm|node-gyp|scripts\/|\.mjs)/);
});
