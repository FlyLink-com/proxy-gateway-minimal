import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOW_PATH = resolve(
  REPOSITORY_ROOT,
  ".github/workflows/japan-runtime-config-additive-repair.yml"
);

function workflowText() {
  return readFileSync(WORKFLOW_PATH, "utf8");
}

function jobBlock(workflow, jobName, nextJobName) {
  const start = workflow.indexOf(`  ${jobName}:`);
  assert.ok(start >= 0, `missing ${jobName} job`);
  const end = nextJobName ? workflow.indexOf(`  ${nextJobName}:`, start + 1) : -1;
  return workflow.slice(start, end >= 0 ? end : undefined);
}

test("Japan repair workflow is manual-only with minimal read permissions", () => {
  const workflow = workflowText();
  assert.match(workflow, /^name: Japan Runtime Config Additive Repair$/m);
  assert.match(workflow, /^on:\r?\n  workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^\s{2}(?:push|pull_request|pull_request_target|schedule|workflow_call):/m);
  assert.match(workflow, /permissions:\r?\n  actions: read\r?\n  contents: read/);
  assert.doesNotMatch(
    workflow,
    /id-token: write|contents: write|packages: write|deployments: write|actions: write/
  );
  assert.match(workflow, /group: japan-runtime-config-additive-repair/);
  assert.match(workflow, /cancel-in-progress: false/);
});

test("secretless preflight is isolated from the protected execute job", () => {
  const workflow = workflowText();
  const preflight = jobBlock(workflow, "preflight", "execute");
  const execute = jobBlock(workflow, "execute");
  assert.match(preflight, /github\.ref == 'refs\/heads\/master'/);
  assert.match(preflight, /EXPECTED_WORKFLOW_COMMIT_INPUT: \$\{\{ inputs\.expected_workflow_commit \}\}/);
  assert.match(preflight, /CURRENT_WORKFLOW_COMMIT: \$\{\{ github\.sha \}\}/);
  assert.match(preflight, /"\$EXPECTED_WORKFLOW_COMMIT_INPUT" != "\$CURRENT_WORKFLOW_COMMIT"/);
  assert.match(preflight, /github-actions-japan-tuic-additive-repair-20260716-001/);
  assert.doesNotMatch(preflight, /environment:|secrets\.|\bssh\b|\bscp\b|\brsync\b/);
  assert.match(preflight, /outputs:\r?\n      ready:/);
  assert.match(execute, /needs: preflight/);
  assert.match(execute, /needs\.preflight\.outputs\.ready == 'true'/);
  assert.match(execute, /environment: vultr-japan-production/);
  assert.equal((workflow.match(/environment: vultr-japan-production/g) ?? []).length, 1);
  for (const secret of [
    "JAPAN_CI_HOST",
    "JAPAN_CI_PORT",
    "JAPAN_CI_USER",
    "JAPAN_CI_PRIVATE_KEY",
    "JAPAN_CI_KNOWN_HOSTS"
  ]) {
    assert.match(execute, new RegExp(`secrets\\.${secret}`));
    assert.doesNotMatch(preflight, new RegExp(secret));
  }
});

test("both jobs use immutable Actions and verify the frozen artifact", () => {
  const workflow = workflowText();
  assert.equal(
    (workflow.match(/actions\/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6/g) ?? []).length,
    2
  );
  assert.equal(
    (workflow.match(/actions\/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6/g) ?? []).length,
    2
  );
  assert.equal(
    (workflow.match(/actions\/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8\.0\.1/g) ?? []).length,
    2
  );
  assert.equal((workflow.match(/run-id: 29495150692/g) ?? []).length, 2);
  assert.equal(
    (workflow.match(/production-dry-run-japan-control-plane-control-plane-cumulative-20260716-003/g) ?? []).length,
    2
  );
  assert.equal(
    (workflow.match(/node scripts\/japan-tuic-additive-repair-contract\.mjs artifact/g) ?? []).length,
    2
  );
  assert.equal(
    (workflow.match(/proxy-gateway-control-plane-cumulative-20260716-003\.zip/g) ?? []).length >= 2,
    true
  );
});

test("execute job uses only restricted SSH transport and validates before summary", () => {
  const workflow = workflowText();
  const execute = jobBlock(workflow, "execute");
  const verifyArtifact = execute.indexOf("- name: Verify frozen artifact");
  const prepareCredential = execute.indexOf("- name: Prepare restricted SSH material");
  const runRepair = execute.indexOf("- name: Execute forced-command repair");
  const validateReceipt = execute.indexOf("- name: Validate aggregate receipt");
  const cleanup = execute.indexOf("- name: Remove runner-side temporary material");
  assert.ok(verifyArtifact >= 0);
  assert.ok(prepareCredential > verifyArtifact);
  assert.ok(runRepair > prepareCredential);
  assert.ok(validateReceipt > runRepair);
  assert.ok(cleanup > validateReceipt);
  for (const option of [
    "BatchMode=yes",
    "IdentitiesOnly=yes",
    "StrictHostKeyChecking=yes",
    "PasswordAuthentication=no",
    "KbdInteractiveAuthentication=no",
    "LogLevel=ERROR",
    "ClearAllForwardings=yes",
    "RequestTTY=no"
  ]) {
    assert.match(execute, new RegExp(option));
  }
  assert.match(execute, /< "\$ARTIFACT_FILE"/);
  assert.match(execute, /> "\$RECEIPT_FILE" 2> "\$SSH_ERROR_FILE"/);
  assert.match(execute, /japan-tuic-additive-repair-contract\.mjs receipt/);
  assert.match(execute, /GITHUB_STEP_SUMMARY/);
  assert.match(cleanup >= 0 ? execute.slice(cleanup) : "", /if: always\(\)/);
  assert.doesNotMatch(
    execute,
    /ssh\s+-v|set\s+-x|cat\s+.*(?:key|known|receipt)|tee\s+.*receipt|\bscp\b|\brsync\b/i
  );
});

test("workflow cannot deploy an application or mutate adjacent production surfaces", () => {
  const workflow = workflowText();
  assert.doesNotMatch(
    workflow,
    /systemctl\s+(?:start|restart|enable|disable)|npm\s+(?:ci|install)|sqlite|nginx|firewall|wrangler\s+deploy|release.*(?:switch|pointer)|stale.*delete/i
  );
  assert.doesNotMatch(workflow, /actions\/upload-artifact|include-hidden-files|repository_dispatch/);
  assert.doesNotMatch(workflow, /BEGIN (?:RSA|OPENSSH|EC) PRIVATE KEY/);
});
