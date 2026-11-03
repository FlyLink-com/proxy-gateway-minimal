import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOW_PATH = resolve(ROOT, ".github/workflows/jp01-image-verify.yml");
const PROFILE_PATH = resolve(ROOT, "ops/node-provisioning/profiles/jp-01.json");
const workflow = readFileSync(WORKFLOW_PATH, "utf8").replace(/\r\n/g, "\n");
const profile = JSON.parse(readFileSync(PROFILE_PATH, "utf8"));

function actionPins(source) {
  return [...source.matchAll(/^\s+uses: ([^\s#]+)(?:\s+#.*)?$/gm)].map((match) => match[1]);
}

test("JP-01 R2 verification is manual, master-only, and bound to its dedicated Environment", () => {
  assert.match(workflow, /^name: JP01 R2 Image Verify$/m);
  assert.match(workflow, /^on:\n  workflow_dispatch:\s*$/m);
  assert.doesNotMatch(workflow, /^\s*(?:push|pull_request|pull_request_target|schedule|repository_dispatch|workflow_call):/m);
  assert.match(workflow, /^permissions:\n  contents: read$/m);
  assert.match(workflow, /^    if: github\.ref == 'refs\/heads\/master'$/m);
  assert.match(workflow, /^      name: jp01-image-verify$/m);
  assert.match(workflow, /^    timeout-minutes: 5$/m);
});

test("R2 secrets and non-sensitive variables use the exact Environment names", () => {
  assert.match(workflow, /secrets\.R2_READ_ACCESS_KEY_ID/);
  assert.match(workflow, /secrets\.R2_READ_SECRET_ACCESS_KEY/);
  assert.match(workflow, /vars\.R2_ACCOUNT_ID/);
  assert.match(workflow, /vars\.R2_BUCKET/);
  assert.match(workflow, /vars\.R2_ENDPOINT/);
  assert.match(workflow, /vars\.R2_REGION/);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\.(?!R2_READ_)[A-Z0-9_]+\s*\}\}/);
});

test("workflow performs only exact-object read operations and never downloads the full image", () => {
  assert.match(workflow, /aws s3api head-object/);
  assert.match(workflow, /aws s3api get-object/);
  assert.match(workflow, /--key "\$sidecar_key"/);
  assert.doesNotMatch(workflow, /aws s3api (?:put-object|delete-object|list-objects|list-buckets|delete-bucket|create-bucket)/i);
  assert.doesNotMatch(workflow, /aws s3 (?:cp|sync)\b/i);
  assert.doesNotMatch(workflow, /--key "\$image_key"[\s\S]{0,200}get-object/);
  assert.doesNotMatch(workflow, /VULTR_API_KEY|vultr-cli|ssh |scp |rsync |dd if=|systemctl|wg-quick|wireguard private|agent token/i);
});

test("workflow binds object identity to the JP-01 profile and exact uploaded sizes", () => {
  assert.match(workflow, /ops\/node-provisioning\/profiles\/jp-01\.json/);
  assert.match(workflow, /artifactFileName/);
  assert.match(workflow, /artifactSha256/);
  assert.match(workflow, /expected_image_size=2269994633/);
  assert.match(workflow, /expected_sidecar_size=92/);
  assert.equal(profile.image.artifactFileName, "jp01-candidate-1.img.zst");
  assert.equal(profile.image.artifactSha256, "693d9f5afdfbc440870ecb7ec84bee8cc2af644574496f564f2c92ab59946442");
});

test("workflow action references are immutable and checkout credentials are not persisted", () => {
  const pins = actionPins(workflow);
  assert.deepEqual(pins, ["actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803"]);
  assert.ok(pins.every((value) => /@[a-f0-9]{40}$/.test(value)));
  assert.match(workflow, /^          persist-credentials: false$/m);
  assert.doesNotMatch(workflow, /id-token:\s*write/i);
  assert.doesNotMatch(workflow, /^\s+[a-z-]+:\s+write\s*$/m);
});
