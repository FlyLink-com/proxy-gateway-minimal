#!/usr/bin/env node
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const SAFE_TEXT_PATTERN = /^[A-Za-z0-9._:/-]{1,240}$/;
const SENSITIVE_PATTERN = /token=|secret|password|private[_-]?key|subscriptionUrl|\/sub\//i;
const VALID_STATUS = new Set(["success", "failure"]);

function safeText(value, name) {
  const normalized = String(value ?? "").trim();
  if (SENSITIVE_PATTERN.test(normalized)) {
    throw new Error("deploy_receipt_sensitive_metadata");
  }
  if (!SAFE_TEXT_PATTERN.test(normalized)) {
    throw new Error(`deploy_receipt_${name}_invalid`);
  }
  return normalized;
}

function nonNegativeInteger(value, name) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 0) {
    throw new Error(`deploy_receipt_${name}_invalid`);
  }
  return normalized;
}

function positiveInteger(value, name) {
  const normalized = nonNegativeInteger(value, name);
  if (normalized === 0) {
    throw new Error(`deploy_receipt_${name}_invalid`);
  }
  return normalized;
}

function timestamp(value, name) {
  const parsed = new Date(String(value ?? ""));
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`deploy_receipt_${name}_invalid`);
  }
  return parsed.toISOString();
}

function validateGithubActionsUrl(value) {
  const normalized = String(value ?? "").trim();
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("deploy_receipt_workflow_run_url_invalid");
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "github.com") {
    throw new Error("deploy_receipt_workflow_run_url_invalid");
  }
  if (SENSITIVE_PATTERN.test(normalized)) {
    throw new Error("deploy_receipt_sensitive_metadata");
  }
  return normalized;
}

function optionalEnvironmentUrl(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return undefined;
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("deploy_receipt_environment_url_invalid");
  }
  if (parsed.protocol !== "https:" || SENSITIVE_PATTERN.test(normalized)) {
    throw new Error("deploy_receipt_environment_url_invalid");
  }
  return normalized;
}

export function createDeployReceipt({
  releaseUnit,
  provider,
  environment,
  target,
  sourceCommit,
  githubDeploymentId,
  githubDeploymentStatus,
  workflowRunId,
  workflowRunAttempt,
  workflowRunUrl,
  deployStartedAt,
  deployCompletedAt,
  wranglerExitCode,
  environmentUrl = ""
} = {}) {
  if (releaseUnit !== "company-site-static") {
    throw new Error("deploy_receipt_release_unit_invalid");
  }
  if (provider !== "cloudflare") {
    throw new Error("deploy_receipt_provider_invalid");
  }
  const normalizedSourceCommit = String(sourceCommit ?? "").trim().toLowerCase();
  if (!SOURCE_COMMIT_PATTERN.test(normalizedSourceCommit)) {
    throw new Error("deploy_receipt_source_commit_invalid");
  }
  const normalizedStatus = String(githubDeploymentStatus ?? "").trim();
  if (!VALID_STATUS.has(normalizedStatus)) {
    throw new Error("deploy_receipt_github_deployment_status_invalid");
  }
  const normalizedWranglerExitCode = nonNegativeInteger(wranglerExitCode, "wrangler_exit_code");
  if (normalizedStatus === "success" && normalizedWranglerExitCode !== 0) {
    throw new Error("deploy_receipt_success_exit_code_invalid");
  }
  const startedAt = timestamp(deployStartedAt, "started_at");
  const completedAt = timestamp(deployCompletedAt, "completed_at");
  if (Date.parse(completedAt) < Date.parse(startedAt)) {
    throw new Error("deploy_receipt_timestamp_order_invalid");
  }
  const parsedEnvironmentUrl = optionalEnvironmentUrl(environmentUrl);

  const receipt = {
    schemaVersion: "1",
    type: "cloudflare_company_site_deploy_receipt",
    releaseUnit,
    provider,
    environment: safeText(environment, "environment"),
    target: safeText(target, "target"),
    sourceCommit: normalizedSourceCommit,
    githubDeployment: {
      id: positiveInteger(githubDeploymentId, "github_deployment_id"),
      status: normalizedStatus
    },
    workflow: {
      runId: positiveInteger(workflowRunId, "workflow_run_id"),
      runAttempt: positiveInteger(workflowRunAttempt, "workflow_run_attempt"),
      runUrl: validateGithubActionsUrl(workflowRunUrl)
    },
    validation: {
      build: "passed",
      staticVerify: "passed",
      wranglerDeploy: normalizedWranglerExitCode === 0 ? "passed" : "failed",
      wranglerExitCode: normalizedWranglerExitCode
    },
    timestamps: {
      startedAt,
      completedAt
    }
  };
  if (parsedEnvironmentUrl) {
    receipt.environmentUrl = parsedEnvironmentUrl;
  }
  return receipt;
}

function argValue(argv, name) {
  const prefix = `${name}=`;
  const inline = argv.find((item) => item.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : "";
}

function requiredArg(argv, name) {
  const value = argValue(argv, name).trim();
  if (!value) {
    throw new Error("deploy_receipt_argument_missing");
  }
  return value;
}

function comparablePath(path) {
  const absolutePath = resolve(path);
  return process.platform === "win32" ? absolutePath.toLowerCase() : absolutePath;
}

export function runDeployReceiptCli({
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr
} = {}) {
  try {
    const outputPath = requiredArg(argv, "--output");
    if (SENSITIVE_PATTERN.test(outputPath)) {
      throw new Error("deploy_receipt_sensitive_metadata");
    }
    const receipt = createDeployReceipt({
      releaseUnit: requiredArg(argv, "--release-unit"),
      provider: requiredArg(argv, "--provider"),
      environment: requiredArg(argv, "--environment"),
      target: requiredArg(argv, "--target"),
      sourceCommit: requiredArg(argv, "--source-commit"),
      githubDeploymentId: requiredArg(argv, "--github-deployment-id"),
      githubDeploymentStatus: requiredArg(argv, "--github-deployment-status"),
      workflowRunId: requiredArg(argv, "--workflow-run-id"),
      workflowRunAttempt: requiredArg(argv, "--workflow-run-attempt"),
      workflowRunUrl: requiredArg(argv, "--workflow-run-url"),
      deployStartedAt: requiredArg(argv, "--deploy-started-at"),
      deployCompletedAt: requiredArg(argv, "--deploy-completed-at"),
      wranglerExitCode: requiredArg(argv, "--wrangler-exit-code"),
      environmentUrl: argValue(argv, "--environment-url")
    });

    if (comparablePath(outputPath) === comparablePath(dirname(outputPath))) {
      throw new Error("deploy_receipt_output_invalid");
    }
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
    stdout.write(`${JSON.stringify({
      type: "deploy_receipt_generation",
      ok: true,
      releaseUnit: receipt.releaseUnit,
      provider: receipt.provider,
      status: receipt.githubDeployment.status,
      outputFile: basename(outputPath)
    })}\n`);
    return 0;
  } catch {
    stderr.write(`${JSON.stringify({
      type: "deploy_receipt_generation",
      ok: false,
      error: "deploy_receipt_generation_failed"
    })}\n`);
    return 1;
  }
}

function isDirectInvocation() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectInvocation()) {
  process.exitCode = runDeployReceiptCli();
}
