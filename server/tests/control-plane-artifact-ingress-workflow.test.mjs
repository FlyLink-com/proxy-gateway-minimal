import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/control-plane-artifact-ingress.yml"),
  "utf8"
);

test("manual artifact-ingress workflow is inert until a later execution Gate", () => {
  assert.match(workflow, /^name: Control Plane Artifact Ingress$/m);
  assert.match(workflow, /^\s+workflow_dispatch:$/m);
  assert.match(workflow, /^permissions: \{\}$/m);
  assert.match(workflow, /inputs\.confirmation == 'prepare artifact ingress'/);
  assert.match(workflow, /temporary_artifact_ingress_execution_not_granted/);
  assert.doesNotMatch(workflow, /\bsecrets\./);
  assert.doesNotMatch(workflow, /^\s+environment:/m);
  assert.doesNotMatch(workflow, /\bssh\b|\bscp\b|\brsync\b/i);
});
