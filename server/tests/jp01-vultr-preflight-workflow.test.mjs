import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOW_PATH = resolve(ROOT, ".github/workflows/jp01-vultr-preflight.yml");
const SCHEMA_PATH = resolve(
  ROOT,
  "ops/node-provisioning/schemas/jp01-vultr-preflight-report.schema.json"
);
const workflow = readFileSync(WORKFLOW_PATH, "utf8").replace(/\r\n/g, "\n");
const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));

function actionPins(source) {
  return [...source.matchAll(/^\s+uses: ([^\s#]+)(?:\s+#.*)?$/gm)].map((match) => match[1]);
}

function curlInvocations(source) {
  return (source.match(/\bcurl\b/g) ?? []).length;
}

test("JP-01 Vultr preflight is manual, master-only, and bound to its production Environment", () => {
  assert.match(workflow, /^name: JP01 Vultr API Preflight$/m);
  assert.match(workflow, /^on:\n  workflow_dispatch:\s*$/m);
  assert.doesNotMatch(workflow, /^\s*(?:push|pull_request|pull_request_target|schedule|repository_dispatch|workflow_call):/m);
  assert.match(workflow, /^permissions:\n  contents: read$/m);
  assert.match(workflow, /^    if: github\.ref == 'refs\/heads\/master'$/m);
  assert.match(workflow, /^      name: jp01-c1-production$/m);
  assert.match(workflow, /^    timeout-minutes: 5$/m);
  assert.match(workflow, /^    runs-on: ubuntu-24\.04$/m);
});

test("the only secret the workflow can read is the Environment VULTR_API_KEY", () => {
  assert.match(workflow, /secrets\.VULTR_API_KEY/);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\.(?!VULTR_API_KEY\b)[A-Z0-9_]+\s*\}\}/);
  assert.doesNotMatch(workflow, /\$\{\{\s*vars\.[A-Z0-9_]+\s*\}\}/);
  // The key may only be masked, tested for presence, sent as the Bearer
  // header, or unset; it is never printed or written to a file.
  const keyLines = workflow.split("\n").filter((line) => line.includes("VULTR_API_KEY"));
  assert.ok(keyLines.length > 0);
  for (const line of keyLines) {
    assert.match(
      line,
      /secrets\.VULTR_API_KEY|::add-mask::\$VULTR_API_KEY|\[ -n "\$VULTR_API_KEY" \]|Authorization: Bearer \$VULTR_API_KEY|unset VULTR_API_KEY|name: Check VULTR_API_KEY presence/
    );
  }
  assert.doesNotMatch(workflow, /echo[^"\n]*\$VULTR_API_KEY(?!")/);
});

test("the workflow performs exactly one GET request and no write call of any kind", () => {
  assert.equal(curlInvocations(workflow), 1);
  assert.match(workflow, /--request GET/);
  assert.match(workflow, /https:\/\/api\.vultr\.com\/v2\/account/);
  assert.equal((workflow.match(/api\.vultr\.com/g) ?? []).length, 3);
  assert.doesNotMatch(workflow, /--request (?:POST|PUT|PATCH|DELETE)|-X\s*(?:POST|PUT|PATCH|DELETE)\b/);
  assert.doesNotMatch(workflow, /--data\b|--data-raw|--data-binary|--form\b/);
  assert.doesNotMatch(workflow, /\/v2\/(?:instances|firewall|ssh-keys|snapshots|startup-scripts)/);
  assert.doesNotMatch(workflow, /\bvultr-cli\b|\bssh\b|\bscp\b|\brsync\b/);
  assert.doesNotMatch(workflow, /method:\s*(?:POST|PUT|PATCH|DELETE)/i);
});

test("the report is redacted by construction and bound to the published schema", () => {
  assert.match(workflow, /jp01-vultr-preflight-report\.json/);
  assert.match(workflow, /"schema": "jp01-vultr-preflight-report\/v1"/);
  assert.match(workflow, /GITHUB_RUN_ID/);
  assert.match(workflow, /GITHUB_SHA/);
  assert.match(workflow, /sha256sum/);
  // The raw API response is held only in a temp file that is always removed,
  // and it is never the uploaded artifact.
  assert.match(workflow, /mktemp "\$RUNNER_TEMP\/vultr-account\.XXXXXX"/);
  assert.match(workflow, /trap 'rm -f "\$response_file"' EXIT/);
  assert.match(workflow, /path: jp01-vultr-preflight-report\.json/);
  // Sensitive account fields are never referenced anywhere in the workflow.
  assert.doesNotMatch(workflow, /"email"|"balance"|"name":\s*payload|payload\.get\("account", \{\}\)\.get\("(?!acls)/);

  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schema.const, "jp01-vultr-preflight-report/v1");
  assert.equal(schema.properties.environment.const, "jp01-c1-production");
  assert.equal(schema.properties.endpoint.const, "GET https://api.vultr.com/v2/account");
  for (const forbidden of ["email", "balance", "api_key", "apiKey", "token", "name"]) {
    assert.ok(!(forbidden in schema.properties), `schema must not allow ${forbidden}`);
  }
  assert.deepEqual(
    schema.properties.checks.items.properties.id.enum,
    ["secret_present", "http_status_200", "provisioning_acl_present"]
  );
  for (const required of [
    "run_id",
    "commit_sha",
    "tested_at",
    "secret_present",
    "http_status",
    "account_acls",
    "checks",
    "verdict",
    "side_effects"
  ]) {
    assert.ok(schema.required.includes(required), `schema must require ${required}`);
  }
});

test("workflow action references are immutable and checkout credentials are not persisted", () => {
  const pins = actionPins(workflow);
  assert.deepEqual(pins, [
    "actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803",
    "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a"
  ]);
  assert.ok(pins.every((value) => /@[a-f0-9]{40}$/.test(value)));
  assert.match(workflow, /^          persist-credentials: false$/m);
  assert.doesNotMatch(workflow, /id-token:\s*write/i);
  assert.doesNotMatch(workflow, /^\s+[a-z-]+:\s+write\s*$/m);
});

test("a failing preflight fails the run while the report is still uploaded", () => {
  assert.match(workflow, /^        if: always\(\)$/m);
  assert.match(workflow, /if: steps\.preflight\.outputs\.verdict != 'pass'/);
  assert.match(workflow, /id: preflight/);
  assert.match(workflow, /id: secret_presence/);
});
