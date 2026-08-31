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
const BOOTSTRAP_PROBE_WORKFLOW_PATH = resolve(
  REPOSITORY_ROOT,
  ".github/workflows/japan-runtime-config-bootstrap-probe.yml"
);
const RUNBOOK_PATH = resolve(REPOSITORY_ROOT, "docs/GITHUB_DEPLOYMENT_RUNBOOK.md");
const CURRENT_RELEASE_STATE_PATH = resolve(
  REPOSITORY_ROOT,
  "docs/CURRENT_RELEASE_STATE.md"
);
const PROJECT_CONTEXT_PATH = resolve(REPOSITORY_ROOT, "docs/PROJECT_CONTEXT.md");
const DESIGN_PATH = resolve(
  REPOSITORY_ROOT,
  "docs/superpowers/specs/2026-07-16-github-japan-additive-repair-cicd-design.md"
);

function workflowText() {
  return readFileSync(WORKFLOW_PATH, "utf8");
}

function bootstrapProbeWorkflowText() {
  return readFileSync(BOOTSTRAP_PROBE_WORKFLOW_PATH, "utf8");
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
  assert.match(
    workflow,
    /^on:\r?\n  workflow_dispatch:\r?\n    inputs:\r?\n      approval_pr:/m
  );
  assert.match(workflow, /approval_pr:[\s\S]*required: true[\s\S]*type: string/);
  assert.doesNotMatch(workflow, /^\s{2}(?:push|pull_request|pull_request_target|schedule|workflow_call):/m);
  assert.match(
    workflow,
    /permissions:\r?\n  actions: read\r?\n  checks: read\r?\n  contents: read\r?\n  pull-requests: read/
  );
  assert.doesNotMatch(
    workflow,
    /id-token: write|contents: write|packages: write|deployments: write|actions: write/
  );
  assert.match(workflow, /group: japan-runtime-config-additive-repair/);
  assert.match(workflow, /cancel-in-progress: false/);
});

test("triggering actor cannot manufacture the merged PR approval", () => {
  const workflow = workflowText();
  const trigger = workflow.slice(workflow.indexOf("on:"), workflow.indexOf("permissions:"));
  const preflight = jobBlock(workflow, "preflight", "execute");
  const execute = jobBlock(workflow, "execute");
  assert.match(trigger, /inputs:\r?\n      approval_pr:/);
  assert.doesNotMatch(trigger, /\b(?:host|port|user|key|known_hosts|gate_id|confirmation):/);
  assert.doesNotMatch(workflow, /inputs\.(?:gate_id|expected_workflow_commit|confirmation)/);
  assert.doesNotMatch(preflight, /JAPAN_CI_APPROVAL_BUNDLE|secrets\./);
  assert.doesNotMatch(workflow, /JAPAN_CI_APPROVAL_BUNDLE/);
  assert.match(execute, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(execute, /GITHUB_REPOSITORY: \$\{\{ github\.repository \}\}/);
  assert.match(execute, /GITHUB_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(
    execute,
    /GITHUB_TRIGGERING_ACTOR: \$\{\{ github\.triggering_actor \}\}/
  );
  assert.doesNotMatch(execute, /GITHUB_ACTOR:/);
  assert.match(execute, /APPROVAL_PR: \$\{\{ inputs\.approval_pr \}\}/);
  assert.match(execute, /japan-tuic-merged-pr-approval\.mjs --pr-number "\$APPROVAL_PR"/);
  const approval = execute.indexOf("- name: Validate merged PR production approval");
  const triggeringActor = execute.indexOf("${{ github.triggering_actor }}");
  const download = execute.indexOf("- name: Download frozen dry-run artifact");
  const firstJapanSecret = execute.indexOf("JAPAN_CI_");
  const credentials = execute.indexOf("- name: Prepare restricted SSH material");
  assert.ok(
    approval >= 0
      && triggeringActor > approval
      && triggeringActor < download
      && download > approval
      && firstJapanSecret > approval
      && credentials > approval
  );
});

test("secretless preflight is isolated from the protected execute job", () => {
  const workflow = workflowText();
  const preflight = jobBlock(workflow, "preflight", "execute");
  const execute = jobBlock(workflow, "execute");
  assert.match(preflight, /github\.ref == 'refs\/heads\/master'/);
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
    (workflow.match(/actions\/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6/g) ?? []).length,
    3
  );
  assert.equal(
    (workflow.match(/actions\/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6/g) ?? []).length,
    2
  );
  assert.equal(
    (workflow.match(/actions\/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8\.0\.1/g) ?? []).length,
    2
  );
  assert.equal((workflow.match(/run-id: 30092196734/g) ?? []).length, 2);
  assert.equal(
    (workflow.match(/name: proxy-gateway-japan-tuic-additive-repair-20260724-001/g) ?? []).length,
    2
  );
  assert.equal(
    (workflow.match(/node scripts\/japan-tuic-additive-repair-contract\.mjs artifact/g) ?? []).length,
    2
  );
  assert.equal(
    (workflow.match(/proxy-gateway-japan-tuic-additive-repair-20260724-001\.zip/g) ?? []).length >= 3,
    true
  );
});

test("secretless preflight independently binds the artifact to the declared Git tree", () => {
  const workflow = workflowText();
  const preflight = jobBlock(workflow, "preflight", "execute");
  assert.match(preflight, /- name: Checkout frozen artifact source/);
  assert.match(preflight, /ref: 70880d83761b165e91e9c521ec480fcc840375fb/);
  assert.match(preflight, /path: \.japan-repair-trusted-source/);
  assert.match(preflight, /persist-credentials: false/);
  assert.match(preflight, /node scripts\/artifact-git-tree-verifier\.mjs/);
  assert.match(preflight, /--commit 70880d83761b165e91e9c521ec480fcc840375fb/);
  assert.doesNotMatch(preflight, /--source-only-boundary/);
  const treeCheckout = preflight.indexOf("- name: Checkout frozen artifact source");
  const treeVerification = preflight.indexOf("node scripts/artifact-git-tree-verifier.mjs");
  const ready = preflight.indexOf("- name: Mark secretless preflight ready");
  assert.ok(treeCheckout >= 0 && treeVerification > treeCheckout && ready > treeVerification);
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
  assert.match(execute, /receipt_validation_failed_without_production_claim/);
  assert.match(
    execute,
    /if ! node scripts\/japan-tuic-additive-repair-contract\.mjs receipt[\s\S]*receipt_validation_failed_without_production_claim/
  );
  assert.match(execute, /GITHUB_STEP_SUMMARY/);
  assert.match(cleanup >= 0 ? execute.slice(cleanup) : "", /if: always\(\)/);
  assert.doesNotMatch(
    execute,
    /ssh\s+-v|set\s+-x|cat\s+.*(?:key|known|receipt)|tee\s+.*receipt|\bscp\b|\brsync\b/i
  );
});

test("bootstrap probe proves restricted transport and cleanup without map mutation", () => {
  const workflow = bootstrapProbeWorkflowText();
  assert.match(workflow, /^name: Japan Runtime Config Bootstrap Probe$/m);
  assert.match(
    workflow,
    /^on:\r?\n  workflow_dispatch:\r?\n    inputs:\r?\n      approval_pr:/m
  );
  assert.doesNotMatch(workflow, /^\s{2}(?:push|pull_request|pull_request_target|schedule|workflow_call):/m);
  assert.match(workflow, /environment: vultr-japan-production/);
  assert.equal((workflow.match(/environment: vultr-japan-production/g) ?? []).length, 1);
  assert.match(workflow, /japan-tuic-merged-pr-approval\.mjs --pr-number "\$APPROVAL_PR"/);
  assert.match(workflow, /< \/dev\/null > "\$RECEIPT_FILE" 2> "\$SSH_ERROR_FILE"/);
  assert.match(workflow, /productionResult === "stopped_pre_apply"/);
  assert.match(workflow, /receipt\.error === "artifact_identity_mismatch"/);
  assert.match(workflow, /receipt\.hostCredentialCleanup === "verified"/);
  assert.match(workflow, /receipt\.closeout === "github_cleanup_pending"/);
  assert.match(workflow, /process\.env\.SSH_STATUS === "2"/);
  assert.match(workflow, /Remove runner-side temporary material/);
  assert.doesNotMatch(
    workflow,
    /download-artifact|artifact-git-tree-verifier|systemctl|map\s+apply|restart|enable|disable|sqlite|nginx|firewall|scp|rsync/i
  );
  assert.doesNotMatch(workflow, /ssh\s+-v|set\s+-x|cat\s+.*(?:key|known|receipt)|tee\s+.*receipt/i);
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

test("deployment runbook closes the restricted Japan repair lifecycle", () => {
  const runbook = readFileSync(RUNBOOK_PATH, "utf8");
  for (const requiredBoundary of [
    "japan-runtime-config",
    "vultr-japan-production",
    "additive_missing_only",
    "CI Identity Bootstrap Gate",
    "Quantitative Production Execution Gate",
    "approval_pr",
    "exact merge commit",
    "final\\s+head",
    "Validate",
    "triggering\\s+actor",
    "reusable",
    "not a one-time or consumed\\s+credential",
    "source authorization only",
    "production success",
    "JAPAN_CI_PRIVATE_KEY",
    "artifact Git tree",
    "host authorization revocation",
    "GitHub secret deletion",
    "all five temporary",
    "Bootstrap Probe",
    "receipt_validation_failed_without_production_claim",
    "control-plane-app is not authorized"
  ]) {
    assert.match(runbook, new RegExp(requiredBoundary));
  }
  assert.doesNotMatch(runbook, /JAPAN_CI_APPROVAL_BUNDLE/);
  assert.doesNotMatch(runbook, /fresh approval evidence|final approval from a non-dispatcher/);
});

test("active operating documents record reusable merged-PR authorization", () => {
  for (const documentPath of [
    CURRENT_RELEASE_STATE_PATH,
    PROJECT_CONTEXT_PATH
  ]) {
    const document = readFileSync(documentPath, "utf8");
    for (const requiredBoundary of [
      "reusable",
      "not a one-time or consumed\\s+credential",
      "final\\s+head",
      "triggering\\s+actor",
      "Validate",
      "source-only"
    ]) {
      assert.match(document, new RegExp(requiredBoundary));
    }
    assert.doesNotMatch(
      document,
      /final approval from a non-dispatcher|requires fresh approval evidence/
    );
  }
});

test("approved design records independent approval and source-tree binding", () => {
  const design = readFileSync(DESIGN_PATH, "utf8");
  for (const requiredBoundary of [
    "JAPAN_CI_APPROVAL_BUNDLE",
    "required reviewer",
    "prevent self-review",
    "runId",
    "runAttempt",
    "issuedAt",
    "artifact Git tree",
    "30 minutes",
    "six temporary Environment secrets"
  ]) {
    assert.match(design, new RegExp(requiredBoundary));
  }
});
