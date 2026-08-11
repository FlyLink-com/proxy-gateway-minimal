import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOW_PATH = resolve(
  REPOSITORY_ROOT,
  ".github/workflows/control-plane-foundation-toolchain-inventory.yml"
);
const CHECKOUT_PIN = "df4cb1c069e1874edd31b4311f1884172cec0e10";
const FOUNDATION_TOOLCHAIN_CONTAINER_IMAGE =
  "docker.io/library/node:22.23.1-bookworm@sha256:175215a1f306ed5df592434b99cc2019f70624373fe49cb659240a618a846aed";
const EXPECTED_WORKFLOW_SHA256 = "88236687400c263b979bde3f00e39acf31dd8e7976649618462e852cf8c4cd39";

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function directKeys(block, indentation) {
  const prefix = " ".repeat(indentation);
  return block.split("\n").flatMap((line) => {
    const match = line.match(new RegExp(`^${prefix}([^\\s:][^:]*):(?:\\s.*)?$`));
    return match ? [match[1]] : [];
  });
}

function splitNamedBlocks(source, headerPattern) {
  const headers = [...source.matchAll(headerPattern)];
  return headers.map((match, index) => ({
    name: match[1],
    source: source.slice(
      match.index,
      index + 1 < headers.length ? headers[index + 1].index : source.length
    )
  }));
}

function assertClosedInventoryWorkflow(rawWorkflow, { onAccepted = () => {} } = {}) {
  const workflow = rawWorkflow.replace(/\r\n/g, "\n");
  assert.equal(sha256Hex(workflow), EXPECTED_WORKFLOW_SHA256);
  assert.doesNotMatch(
    workflow,
    /(?:^|\n)\s*(?:[^#\n]+:\s*[&*][A-Za-z0-9_-]+|-\s*\*[A-Za-z0-9_-]+|<<\s*:)/
  );
  const jobsOffset = workflow.indexOf("\njobs:\n");
  assert.notEqual(jobsOffset, -1);
  assert.deepEqual(directKeys(workflow.slice(0, jobsOffset), 0), [
    "name",
    "on",
    "permissions",
    "concurrency"
  ]);
  assert.match(workflow, /^name: Control Plane Foundation Toolchain Inventory$/m);
  assert.match(workflow, /^on:\n  pull_request:\n    branches:\n      - master$/m);
  assert.doesNotMatch(
    workflow,
    /^\s*(?:"(?:push|workflow_dispatch|schedule|pull_request_target|workflow_call)"|'(?:push|workflow_dispatch|schedule|pull_request_target|workflow_call)'|push|workflow_dispatch|schedule|pull_request_target|workflow_call):/m
  );
  assert.match(workflow, /^permissions:\n  contents: read$/m);
  assert.equal((workflow.match(/^  contents: read$/gm) ?? []).length, 1);
  assert.doesNotMatch(workflow, /^  [a-z-]+: write$/m);

  const jobs = splitNamedBlocks(workflow.slice(jobsOffset + 7), /^  ([^\s:][^:\r\n]*):(?:\s.*)?$/gm);
  assert.deepEqual(jobs.map(({ name }) => name), ["toolchain-inventory"]);
  const job = jobs[0].source;
  assert.deepEqual(directKeys(job, 4), [
    "name",
    "runs-on",
    "timeout-minutes",
    "container",
    "steps"
  ]);
  assert.match(job, /^    runs-on: ubuntu-24\.04$/m);
  assert.match(job, /^    timeout-minutes: 10$/m);
  assert.match(
    job,
    new RegExp(`^      image: ${FOUNDATION_TOOLCHAIN_CONTAINER_IMAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m")
  );
  assert.doesNotMatch(job, /^    (?:permissions|environment|env|services|defaults|uses|if|continue-on-error):/m);

  const steps = splitNamedBlocks(job, /^      - name: ([^\r\n]+)$/gm);
  assert.deepEqual(steps.map(({ name }) => name), [
    "Checkout pull-request head",
    "Validate inventory-only contract",
    "Emit non-authoritative inventory evidence"
  ]);
  assert.deepEqual(directKeys(steps[0].source, 8), ["uses", "with"]);
  assert.match(steps[0].source, new RegExp(`^        uses: actions/checkout@${CHECKOUT_PIN} # v6$`, "m"));
  assert.match(steps[0].source, /^          ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}$/m);
  assert.match(steps[0].source, /^          persist-credentials: false$/m);
  assert.doesNotMatch(steps[0].source, /^          token:/m);

  assert.deepEqual(directKeys(steps[1].source, 8), ["run"]);
  assert.match(
    steps[1].source,
    /^        run: >-\n          node --test\n          server\/tests\/control-plane-foundation-toolchain-inventory\.test\.mjs\n          server\/tests\/control-plane-foundation-toolchain-inventory-workflow\.test\.mjs$/m
  );

  assert.deepEqual(directKeys(steps[2].source, 8), ["env", "run"]);
  assert.match(
    steps[2].source,
    /^          CONTROL_PLANE_INVENTORY_SOURCE_COMMIT: \$\{\{ github\.event\.pull_request\.head\.sha \}\}$/m
  );
  assert.match(
    steps[2].source,
    new RegExp(`^          CONTROL_PLANE_FOUNDATION_CONTAINER_IMAGE: ${FOUNDATION_TOOLCHAIN_CONTAINER_IMAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m")
  );
  assert.match(steps[2].source, /^        run: node scripts\/control-plane-foundation-toolchain-inventory\.mjs$/m);

  const actionRows = [...workflow.matchAll(/^\s+uses: ([^\s#]+)(?:\s+#.*)?$/gm)].map((match) => match[1]);
  assert.deepEqual(actionRows, [`actions/checkout@${CHECKOUT_PIN}`]);
  assert.equal(actionRows.every((row) => /@[a-f0-9]{40}$/.test(row)), true);
  assert.doesNotMatch(workflow, /\$\{\{\s*(?:secrets|vars|env|needs|steps)\./);
  assert.doesNotMatch(workflow, /actions\/setup-node|upload-artifact|download-artifact|cache@/);
  assert.doesNotMatch(workflow, /(?:npm |node-gyp|\bgcc\b|\bclang\b|\bmake\b|\bpython\b|curl|wget|gh\s|docker |podman)/i);
  assert.doesNotMatch(workflow, /(?:ssh|scp|rsync|systemctl|provider|deploy|release|package|production)/i);
  onAccepted();
}

test("v2 closure inventory has one exact PR-head, read-only job", () => {
  assertClosedInventoryWorkflow(readFileSync(WORKFLOW_PATH, "utf8"));
});

test("inventory topology faults fail before eligibility", () => {
  const workflow = readFileSync(WORKFLOW_PATH, "utf8").replace(/\r\n/g, "\n");
  const faults = [
    workflow.replace("on:", "\"on\":"),
    workflow.replace("  pull_request:", "  workflow_dispatch:\n  pull_request:"),
    workflow.replace("jobs:\n  toolchain-inventory:", "jobs:\n  _unlisted:\n    runs-on: self-hosted\n  toolchain-inventory:"),
    workflow.replace("    runs-on: ubuntu-24.04", "    runs-on: self-hosted"),
    workflow.replace("  contents: read", "  contents: read\n  pull-requests: write"),
    workflow.replace("  contents: read", "  contents: read\n  id-token: \"write\""),
    workflow.replace(`actions/checkout@${CHECKOUT_PIN}`, "actions/checkout@v6"),
    workflow.replace("ref: ${{ github.event.pull_request.head.sha }}", "ref: ${{ github.sha }}"),
    workflow.replace(
      "CONTROL_PLANE_INVENTORY_SOURCE_COMMIT: ${{ github.event.pull_request.head.sha }}",
      "CONTROL_PLANE_INVENTORY_SOURCE_COMMIT: ${{ github.sha }}"
    ),
    workflow.replace(
      "      - name: Emit non-authoritative inventory evidence",
      "      - name: Hidden network command\n        run: curl https://example.invalid\n\n      - name: Emit non-authoritative inventory evidence"
    ),
    workflow.replace(
      "      - name: Emit non-authoritative inventory evidence",
      "      - run: node hidden-command.mjs\n\n      - name: Emit non-authoritative inventory evidence"
    ),
    workflow.replace("  pull_request:", "  repository_dispatch:\n  pull_request:"),
    workflow.replace(
      "    container:\n      image:",
      "    container:\n      options: --privileged\n      image:"
    ),
    workflow.replace(
      "          persist-credentials: false",
      "          persist-credentials: false\n          \"token\": ${{ github.token }}"
    ),
    workflow.replace(
      "        env:\n          CONTROL_PLANE_INVENTORY_SOURCE_COMMIT:",
      "        env:\n          GITHUB_TOKEN: ${{ github.token }}\n          CONTROL_PLANE_INVENTORY_SOURCE_COMMIT:"
    ),
    workflow.replace("  toolchain-inventory:", "  toolchain-inventory: &inventory"),
    workflow.replace("    steps:", "    defaults:\n      run:\n        shell: pwsh\n    steps:")
  ];
  for (const [index, fault] of faults.entries()) {
    let accepted = 0;
    assert.throws(() => assertClosedInventoryWorkflow(fault, {
      onAccepted() { accepted += 1; }
    }), undefined, `fault ${index} must be rejected`);
    assert.equal(accepted, 0);
  }
});
