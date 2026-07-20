import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createDeployReceipt,
  runDeployReceiptCli
} from "../../scripts/create-deploy-receipt.mjs";

test("creates a redacted Cloudflare company-site deploy receipt", () => {
  const receipt = createDeployReceipt({
    releaseUnit: "company-site-static",
    provider: "cloudflare",
    environment: "cloudflare-production",
    target: "cloudflare-workers:proxy-gateway-minimal",
    sourceCommit: "a".repeat(40),
    githubDeploymentId: 123456,
    githubDeploymentStatus: "success",
    workflowRunId: 29725118486,
    workflowRunAttempt: 1,
    workflowRunUrl: "https://github.com/gccwebos-com/proxy-gateway-minimal/actions/runs/29725118486",
    deployStartedAt: "2026-07-20T07:36:00Z",
    deployCompletedAt: "2026-07-20T07:36:48Z",
    wranglerExitCode: 0
  });

  assert.deepEqual(receipt, {
    schemaVersion: "1",
    type: "cloudflare_company_site_deploy_receipt",
    releaseUnit: "company-site-static",
    provider: "cloudflare",
    environment: "cloudflare-production",
    target: "cloudflare-workers:proxy-gateway-minimal",
    sourceCommit: "a".repeat(40),
    githubDeployment: {
      id: 123456,
      status: "success"
    },
    workflow: {
      runId: 29725118486,
      runAttempt: 1,
      runUrl: "https://github.com/gccwebos-com/proxy-gateway-minimal/actions/runs/29725118486"
    },
    validation: {
      build: "passed",
      staticVerify: "passed",
      wranglerDeploy: "passed",
      wranglerExitCode: 0
    },
    timestamps: {
      startedAt: "2026-07-20T07:36:00.000Z",
      completedAt: "2026-07-20T07:36:48.000Z"
    }
  });
  assert.doesNotMatch(JSON.stringify(receipt), /token|secret|password|private_key|subscriptionUrl/i);
});

test("deploy receipt rejects non-portable or secret-bearing metadata", () => {
  const base = {
    releaseUnit: "company-site-static",
    provider: "cloudflare",
    environment: "cloudflare-production",
    target: "cloudflare-workers:proxy-gateway-minimal",
    sourceCommit: "a".repeat(40),
    githubDeploymentId: 123456,
    githubDeploymentStatus: "success",
    workflowRunId: 29725118486,
    workflowRunAttempt: 1,
    workflowRunUrl: "https://github.com/gccwebos-com/proxy-gateway-minimal/actions/runs/29725118486",
    deployStartedAt: "2026-07-20T07:36:00Z",
    deployCompletedAt: "2026-07-20T07:36:48Z",
    wranglerExitCode: 0
  };

  assert.throws(
    () => createDeployReceipt({ ...base, releaseUnit: "control-plane-app" }),
    /deploy_receipt_release_unit_invalid/
  );
  assert.throws(
    () => createDeployReceipt({ ...base, sourceCommit: "not-a-sha" }),
    /deploy_receipt_source_commit_invalid/
  );
  assert.throws(
    () => createDeployReceipt({ ...base, target: "https://sub.example/sub/clash.yaml?token=secret" }),
    /deploy_receipt_sensitive_metadata/
  );
});

test("deploy receipt CLI writes one portable receipt file", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "gccgw-deploy-receipt-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const outputPath = join(directory, "deploy-receipt.json");
  let stdout = "";
  let stderr = "";

  const exitCode = runDeployReceiptCli({
    argv: [
      "--release-unit", "company-site-static",
      "--provider", "cloudflare",
      "--environment", "cloudflare-production",
      "--target", "cloudflare-workers:proxy-gateway-minimal",
      "--source-commit", "b".repeat(40),
      "--github-deployment-id", "987654",
      "--github-deployment-status", "failure",
      "--workflow-run-id", "29725118486",
      "--workflow-run-attempt", "2",
      "--workflow-run-url", "https://github.com/gccwebos-com/proxy-gateway-minimal/actions/runs/29725118486",
      "--deploy-started-at", "2026-07-20T08:00:00Z",
      "--deploy-completed-at", "2026-07-20T08:01:00Z",
      "--wrangler-exit-code", "1",
      "--output", outputPath
    ],
    stdout: { write: (value) => { stdout += value; } },
    stderr: { write: (value) => { stderr += value; } }
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr, "");
  const receipt = JSON.parse(readFileSync(outputPath, "utf8"));
  assert.equal(receipt.githubDeployment.status, "failure");
  assert.equal(receipt.validation.wranglerDeploy, "failed");
  assert.equal(receipt.validation.wranglerExitCode, 1);
  assert.equal(JSON.stringify(receipt).includes(directory), false);
  assert.match(stdout, /"ok":true/);
});
