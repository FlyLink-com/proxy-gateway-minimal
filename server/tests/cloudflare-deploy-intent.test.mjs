import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  resolveCloudflareDeployIntent,
  runCloudflareDeployIntentCli
} from "../../scripts/resolve-cloudflare-deploy-intent.mjs";

test("accepts only an explicit Cloudflare company-site deploy manifest", () => {
  assert.deepEqual(resolveCloudflareDeployIntent({
    schemaVersion: "1",
    releaseUnit: "company-site-static",
    provider: "cloudflare",
    environment: "cloudflare-production",
    deploy: true,
    confirmation: "deploy cloudflare site"
  }), {
    manifestDeploy: true,
    releaseUnit: "company-site-static",
    provider: "cloudflare",
    environment: "cloudflare-production"
  });
});

test("rejects inactive, wrong-surface, or sensitive deploy manifests", () => {
  assert.deepEqual(resolveCloudflareDeployIntent({
    schemaVersion: "1",
    releaseUnit: "company-site-static",
    provider: "cloudflare",
    environment: "cloudflare-production",
    deploy: false,
    confirmation: "deploy cloudflare site"
  }).manifestDeploy, false);

  assert.throws(
    () => resolveCloudflareDeployIntent({
      schemaVersion: "1",
      releaseUnit: "control-plane-app",
      provider: "cloudflare",
      environment: "cloudflare-production",
      deploy: true,
      confirmation: "deploy cloudflare site"
    }),
    /cloudflare_deploy_intent_release_unit_invalid/
  );

  assert.throws(
    () => resolveCloudflareDeployIntent({
      schemaVersion: "1",
      releaseUnit: "company-site-static",
      provider: "cloudflare",
      environment: "cloudflare-production",
      deploy: true,
      confirmation: "deploy cloudflare site",
      note: "https://sub.example/sub/clash.yaml?token=secret"
    }),
    /cloudflare_deploy_intent_sensitive_metadata/
  );
});

test("deploy intent CLI writes GitHub output values", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "gccgw-cloudflare-deploy-intent-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const manifestPath = join(directory, "company-site-cloudflare.json");
  const githubOutputPath = join(directory, "github-output.txt");
  writeFileSync(manifestPath, `${JSON.stringify({
    schemaVersion: "1",
    releaseUnit: "company-site-static",
    provider: "cloudflare",
    environment: "cloudflare-production",
    deploy: true,
    confirmation: "deploy cloudflare site"
  })}\n`);
  let stdout = "";
  let stderr = "";

  const exitCode = runCloudflareDeployIntentCli({
    argv: [
      "--manifest", manifestPath,
      "--github-output", githubOutputPath
    ],
    stdout: { write: (value) => { stdout += value; } },
    stderr: { write: (value) => { stderr += value; } }
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr, "");
  assert.match(readFileSync(githubOutputPath, "utf8"), /manifest_deploy=true/);
  assert.match(stdout, /"manifestDeploy":true/);
});
