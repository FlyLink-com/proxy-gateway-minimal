import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOW_PATH = resolve(ROOT, ".github/workflows/node-provisioning-dry-run.yml");
const PROVIDER_ADAPTER_PATH = resolve(ROOT, "ops/node-provisioning/providers/vultr/adapter.mjs");
const workflow = readFileSync(WORKFLOW_PATH, "utf8").replace(/\r\n/g, "\n");

function actionPins(source) {
  return [...source.matchAll(/^\s+uses: ([^\s#]+)(?:\s+#.*)?$/gm)].map((match) => match[1]);
}

test("node provisioning workflow is manual, master-only, read-only, and dry-run-only", () => {
  assert.match(workflow, /^name: Node Provisioning Dry Run$/m);
  assert.match(workflow, /^on:\n  workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^\s*(?:push|pull_request|pull_request_target|schedule|repository_dispatch|workflow_call):/m);
  assert.match(workflow, /^permissions:\n  contents: read$/m);
  assert.match(workflow, /^    if: github\.ref == 'refs\/heads\/master'$/m);
  assert.match(workflow, /^    timeout-minutes: 10$/m);
  assert.match(workflow, /^          node-version: 22\.23\.1$/m);
  assert.match(workflow, /node scripts\/node-provisioning-dry-run\.mjs --profile/);
  assert.doesNotMatch(workflow, /node-image-provisioning-readiness-summary/);
  assert.match(workflow, /retention-days: 7/);
});

test("workflow has no provider credential, Environment, OIDC, or write permission surface", () => {
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./i);
  assert.doesNotMatch(workflow, /^\s*environment:/m);
  assert.doesNotMatch(workflow, /id-token:\s*write/i);
  assert.doesNotMatch(workflow, /^\s*[a-z-]+:\s*write\s*$/m);
  assert.doesNotMatch(workflow, /VULTR_API_KEY|NODE_DEPLOY_SSH_KEY|GITHUB_TOKEN/);
  assert.doesNotMatch(workflow, /vultr-cli|vultr-cli|vultr api|ssh |scp |rsync |curl |wget |\bdd\s+if=|systemctl|wg-quick|wireguard private/i);
});

test("Vultr dry-run adapter contains no provider or process credential access", () => {
  const adapter = readFileSync(PROVIDER_ADAPTER_PATH, "utf8");
  assert.doesNotMatch(adapter, /fetch\s*\(|https?:|child_process|spawnSync|execFile|process\.env|VULTR_API_KEY|ssh\s/);
});

test("workflow actions are immutable SHA-pinned references and checkout credentials are not persisted", () => {
  const pins = actionPins(workflow);
  assert.deepEqual(pins, [
    "actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803",
    "actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38",
    "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a"
  ]);
  assert.ok(pins.every((value) => /@[a-f0-9]{40}$/.test(value)));
  assert.match(workflow, /^          persist-credentials: false$/m);
});
