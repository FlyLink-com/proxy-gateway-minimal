#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SENSITIVE_PATTERN = /token=|secret|password|private[_-]?key|subscriptionUrl|\/sub\//i;

function assertNoSensitiveMetadata(value) {
  if (SENSITIVE_PATTERN.test(JSON.stringify(value))) {
    throw new Error("cloudflare_deploy_intent_sensitive_metadata");
  }
}

export function resolveCloudflareDeployIntent(manifest = {}) {
  assertNoSensitiveMetadata(manifest);
  if (manifest.schemaVersion !== "1") {
    throw new Error("cloudflare_deploy_intent_schema_invalid");
  }
  if (manifest.releaseUnit !== "company-site-static") {
    throw new Error("cloudflare_deploy_intent_release_unit_invalid");
  }
  if (manifest.provider !== "cloudflare") {
    throw new Error("cloudflare_deploy_intent_provider_invalid");
  }
  if (manifest.environment !== "cloudflare-production") {
    throw new Error("cloudflare_deploy_intent_environment_invalid");
  }
  const manifestDeploy = manifest.deploy === true
    && manifest.confirmation === "deploy cloudflare site";
  return {
    manifestDeploy,
    releaseUnit: "company-site-static",
    provider: "cloudflare",
    environment: "cloudflare-production"
  };
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
    throw new Error("cloudflare_deploy_intent_argument_missing");
  }
  return value;
}

function appendGithubOutput(path, result) {
  if (!path) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `manifest_deploy=${result.manifestDeploy ? "true" : "false"}\n`, { flag: "a" });
}

export function runCloudflareDeployIntentCli({
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr
} = {}) {
  try {
    const manifestPath = requiredArg(argv, "--manifest");
    const githubOutputPath = argValue(argv, "--github-output");
    const manifest = existsSync(manifestPath)
      ? JSON.parse(readFileSync(manifestPath, "utf8"))
      : {
          schemaVersion: "1",
          releaseUnit: "company-site-static",
          provider: "cloudflare",
          environment: "cloudflare-production",
          deploy: false,
          confirmation: "not requested"
        };
    const result = resolveCloudflareDeployIntent(manifest);
    appendGithubOutput(githubOutputPath, result);
    stdout.write(`${JSON.stringify({
      type: "cloudflare_deploy_intent",
      ok: true,
      manifestDeploy: result.manifestDeploy,
      releaseUnit: result.releaseUnit,
      provider: result.provider,
      environment: result.environment
    })}\n`);
    return 0;
  } catch {
    stderr.write(`${JSON.stringify({
      type: "cloudflare_deploy_intent",
      ok: false,
      error: "cloudflare_deploy_intent_failed"
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
  process.exitCode = runCloudflareDeployIntentCli();
}
