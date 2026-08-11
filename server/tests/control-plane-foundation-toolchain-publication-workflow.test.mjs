import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOW = resolve(ROOT, ".github/workflows/control-plane-foundation-toolchain-publish.yml");
const STOP = "full_sigstore_owner_topology_unapproved";
const EXPECTED_WORKFLOW_SHA256 = "509dcc2defb83a961a79f689aced7de52e5bd3a6973978b740f0c676fb0e7d8a";

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function directKeys(block, indentation) {
  const prefix = " ".repeat(indentation);
  return block.split(/\r?\n/).flatMap((line) => {
    const match = line.match(new RegExp(`^${prefix}([a-z][a-z0-9-]*):(?:\\s.*)?$`));
    return match ? [match[1]] : [];
  });
}

function splitJobs(workflow) {
  assert.doesNotMatch(
    workflow,
    /(?:^|\n)\s*(?:[^#\n]+:\s*[&*][A-Za-z0-9_-]+|-\s*\*[A-Za-z0-9_-]+|<<\s*:)/
  );
  const jobsOffset = workflow.indexOf("\njobs:\n");
  assert.notEqual(jobsOffset, -1, "jobs root must be an unquoted mapping key");
  const jobsSource = workflow.slice(jobsOffset + 7);
  const headers = [...jobsSource.matchAll(/^  ([^\s:][^:\r\n]*):(?:\s.*)?$/gm)];
  assert.deepEqual(headers.map((match) => match[1]), [
    "topology-preflight",
    "publish",
    "verify-publication"
  ]);
  return Object.fromEntries(headers.map((match, index) => {
    const start = match.index;
    const end = index + 1 < headers.length ? headers[index + 1].index : jobsSource.length;
    return [match[1], jobsSource.slice(start, end)];
  }));
}

function assertClosedPublicationWorkflow(workflow, { onAccepted = () => {} } = {}) {
  workflow = workflow.replace(/\r\n/g, "\n");
  assert.equal(sha256Hex(workflow), EXPECTED_WORKFLOW_SHA256);
  assert.deepEqual(directKeys(workflow.slice(0, workflow.indexOf("\njobs:\n")), 0), [
    "name",
    "on",
    "permissions",
    "concurrency"
  ]);
  assert.match(workflow, /^name: Control Plane Foundation Toolchain Publication$/m);
  assert.match(workflow, /^on:\r?\n  workflow_dispatch:/m);
  assert.doesNotMatch(
    workflow,
    /^\s*(?:"(?:push|pull_request|pull_request_target|schedule|repository_dispatch|workflow_call)"|'(?:push|pull_request|pull_request_target|schedule|repository_dispatch|workflow_call)'|push|pull_request|pull_request_target|schedule|repository_dispatch|workflow_call):/m
  );
  assert.equal((workflow.match(/^permissions: \{\}$/gm) ?? []).length, 1);
  for (const input of ["source_commit", "inventory_run_id", "candidate_closure_sha256", "confirmation"]) {
    assert.equal((workflow.match(new RegExp(`^      ${input}:$`, "gm")) ?? []).length, 1);
  }

  const jobs = splitJobs(workflow);
  assert.deepEqual(directKeys(jobs["topology-preflight"], 4), [
    "name",
    "runs-on",
    "timeout-minutes",
    "permissions",
    "steps"
  ]);
  assert.deepEqual(directKeys(jobs.publish, 4), [
    "name",
    "needs",
    "runs-on",
    "timeout-minutes",
    "permissions",
    "steps"
  ]);
  assert.deepEqual(directKeys(jobs["verify-publication"], 4), [
    "name",
    "needs",
    "runs-on",
    "timeout-minutes",
    "permissions",
    "steps"
  ]);

  assert.match(jobs["topology-preflight"], /^    runs-on: ubuntu-24\.04$/m);
  assert.match(jobs["topology-preflight"], /^    timeout-minutes: 1$/m);
  assert.match(jobs["topology-preflight"], /^    permissions: \{\}$/m);
  assert.doesNotMatch(
    jobs["topology-preflight"],
    /\$\{\{|(?:^|\s)(?:env|environment|outputs?|if|continue-on-error):|uses:|github\.token|GITHUB_TOKEN|actions\/|gh\s|curl|wget|api|checkout|download|upload/i
  );
  assert.match(
    jobs["topology-preflight"],
    /run: \|\r?\n\s+printf '%s\\n' 'full_sigstore_owner_topology_unapproved' >&2\r?\n\s+exit 2/
  );

  assert.match(jobs.publish, /^    needs: topology-preflight$/m);
  assert.match(jobs.publish, /^    runs-on: ubuntu-24\.04$/m);
  assert.match(jobs.publish, /^    permissions: \{\}$/m);
  assert.doesNotMatch(jobs.publish, /^    (?:if|continue-on-error):/m);
  assert.doesNotMatch(jobs.publish, /always\(|failure\(|cancelled\(/);
  assert.match(jobs.publish, /full_sigstore_owner_unavailable[\s\S]*exit 2/);

  assert.match(jobs["verify-publication"], /^    needs: publish$/m);
  assert.match(jobs["verify-publication"], /^    runs-on: ubuntu-24\.04$/m);
  assert.doesNotMatch(jobs["verify-publication"], /^    (?:if|continue-on-error|environment):/m);
  assert.doesNotMatch(jobs["verify-publication"], /always\(|failure\(|cancelled\(/);
  assert.match(jobs["verify-publication"], /^    permissions: \{\}$/m);
  assert.match(jobs["verify-publication"], /full_sigstore_owner_unavailable[\s\S]*exit 2/);

  assert.doesNotMatch(workflow, /gh release|api\/v3\/repos|releases\/|attest-build-provenance/);
  assert.doesNotMatch(workflow, /^\s+uses:|github\.token|GITHUB_TOKEN|GITHUB_OUTPUT|completion[_-]digest/im);
  assert.doesNotMatch(workflow, /--clobber|gh release delete|gh api.*-X DELETE/);
  assert.doesNotMatch(workflow, /(?:ssh|scp|rsync|systemctl|provider|vultr|deploy)/i);
  onAccepted();
  return jobs;
}

function simulateDispatch(workflow) {
  const calls = {
    createRelease: [],
    uploadReleaseAsset: [],
    publishRelease: [],
    deleteRelease: [],
    attest: [],
    completionDigest: []
  };
  const jobs = assertClosedPublicationWorkflow(workflow);
  const states = {};
  for (const name of ["topology-preflight", "publish", "verify-publication"]) {
    const block = jobs[name];
    const need = block.match(/^    needs: ([a-z][a-z0-9-]*)$/m)?.[1] ?? null;
    if (need !== null && states[need] !== "success") {
      states[name] = "skipped";
      continue;
    }
    if (name === "topology-preflight") {
      const stopped = block.includes(STOP) && /\n\s+exit 2(?:\n|$)/.test(block);
      states[name] = stopped ? "failure" : "success";
      continue;
    }
    if (name === "publish") {
      calls.createRelease.push(name);
      calls.uploadReleaseAsset.push(name);
      calls.publishRelease.push(name);
      calls.deleteRelease.push(name);
      calls.attest.push(name);
    } else {
      calls.completionDigest.push(name);
    }
    states[name] = "success";
  }
  return Object.freeze({
    jobs: Object.freeze(states),
    writes: Object.freeze(Object.fromEntries(
      Object.entries(calls).map(([name, entries]) => [name, entries.length])
    ))
  });
}

test("Foundation publication is manual-only with one absolute-first no-token STOP and two default-success skips", () => {
  const workflow = readFileSync(WORKFLOW, "utf8").replace(/\r\n/g, "\n");
  const result = simulateDispatch(workflow);
  assert.deepEqual(result.jobs, {
    "topology-preflight": "failure",
    publish: "skipped",
    "verify-publication": "skipped"
  });
  assert.deepEqual(result.writes, {
    createRelease: 0,
    uploadReleaseAsset: 0,
    publishRelease: 0,
    deleteRelease: 0,
    attest: 0,
    completionDigest: 0
  });
});

test("raw topology faults fail before publication eligibility", () => {
  const workflow = readFileSync(WORKFLOW, "utf8").replace(/\r\n/g, "\n");
  const faults = [
    workflow.replace("on:", "\"on\":"),
    workflow.replace("  workflow_dispatch:", "  \"push\":\n  workflow_dispatch:"),
    workflow.replace("  workflow_dispatch:", "  repository_dispatch:\n  workflow_dispatch:"),
    workflow.replace("jobs:\n  topology-preflight:", "jobs:\n  _unlisted:\n    runs-on: ubuntu-24.04\n  topology-preflight:"),
    workflow.replace("  topology-preflight:", "  topology-preflight: &guard"),
    workflow.replace("  publish:", "  publish:\n    <<: *guard"),
    workflow.replace("    needs: topology-preflight", "    needs: publish"),
    workflow.replace("    needs: topology-preflight", "    if: always()\n    needs: topology-preflight"),
    workflow.replace("    needs: topology-preflight", "    continue-on-error: true\n    needs: topology-preflight"),
    workflow.replace("    needs: topology-preflight", "    \"if\": ${{ ! success() }}\n    needs: topology-preflight"),
    workflow.replace("    needs: topology-preflight", "    \"continue-on-error\": true\n    needs: topology-preflight"),
    workflow.replace("    permissions: {}\n    steps:", "    permissions: {}\n    outputs:\n      bypass: value\n    steps:"),
    workflow.replace("      - name: Stop before any authority", "      - uses: actions/checkout@0000000000000000000000000000000000000000\n      - name: Stop before any authority"),
    workflow.replace(
      "      - name: Stop before any authority",
      "      - name: Hidden command before stop\n        run: node hidden-command.mjs\n\n      - name: Stop before any authority"
    ),
    workflow.replace(STOP, "owner_available")
  ];
  for (const [index, fault] of faults.entries()) {
    let accepted = 0;
    assert.throws(() => assertClosedPublicationWorkflow(fault, {
      onAccepted() { accepted += 1; }
    }), undefined, `fault ${index} must be rejected`);
    assert.equal(accepted, 0);
  }
});
