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

function awsCliCalls(source) {
  const lines = source.split(/\r?\n/);
  const calls = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s*(?:[A-Za-z_][A-Za-z0-9_]*="\$\()?\s*aws\s+([a-z0-9-]+)(?:\s+([a-z0-9-]+))?\s*(?:\\)?\s*$/);
    if (!match) continue;
    const args = [];
    while (/\\\s*$/.test(lines[index])) {
      index += 1;
      if (index >= lines.length) break;
      args.push(lines[index].trim().replace(/\\\s*$/, ""));
    }
    calls.push({ command: match[1], subcommand: match[2] ?? "", args: args.join(" ") });
  }
  return calls;
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

test("workflow uses an exact S3 read allowlist and never downloads the full image", () => {
  const awsCalls = awsCliCalls(workflow);
  assert.deepEqual(awsCalls.map(({ command, subcommand }) => [command, subcommand]), [
    ["--version", ""],
    ["s3api", "head-object"],
    ["s3api", "head-object"],
    ["s3api", "get-object"]
  ]);

  const s3Calls = awsCalls.filter(({ command }) => command === "s3api");
  assert.deepEqual(s3Calls.map(({ subcommand }) => subcommand), ["head-object", "head-object", "get-object"]);
  assert.ok(s3Calls.every(({ args }) => /--bucket "\$R2_BUCKET"/.test(args)));
  assert.ok(s3Calls.every(({ args }) => /--endpoint-url "\$R2_ENDPOINT"/.test(args)));
  assert.ok(s3Calls.every(({ args }) => /--region "\$R2_REGION"/.test(args)));
  assert.match(s3Calls[0].args, /--key "\$image_key"/);
  assert.match(s3Calls[1].args, /--key "\$sidecar_key"/);
  assert.match(s3Calls[2].args, /--key "\$sidecar_key"/);
  assert.doesNotMatch(s3Calls[2].args, /--key "\$image_key"/);

  assert.doesNotMatch(workflow, /^\s*(?:ssh|scp|rsync)(?:\s|$)/im);
  assert.match("ssh user@host", /^\s*(?:ssh|scp|rsync)(?:\s|$)/im);
  assert.doesNotMatch(workflow, /VULTR_API_KEY|vultr-cli|dd if=|systemctl|wg-quick|wireguard private|agent token/i);
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
