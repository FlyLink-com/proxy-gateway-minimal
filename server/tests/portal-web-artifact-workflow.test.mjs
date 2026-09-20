import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const WORKFLOW = resolve(process.cwd(), ".github/workflows/release-artifact.yml");
const CI_WORKFLOW = resolve(process.cwd(), ".github/workflows/ci.yml");

function normalizedWorkflow() {
  return readFileSync(WORKFLOW, "utf8").replaceAll("\r\n", "\n");
}

function jobBlock(workflow, jobName, nextJobName) {
  const start = workflow.indexOf(`  ${jobName}:`);
  assert.notEqual(start, -1, `workflow must define ${jobName}`);
  const end = nextJobName
    ? workflow.indexOf(`  ${nextJobName}:`, start + 1)
    : workflow.length;
  assert.notEqual(end, -1, `workflow must define ${nextJobName} after ${jobName}`);
  return workflow.slice(start, end);
}

test("Release Artifact packages the Portal desktop artifact independently", () => {
  const workflow = normalizedWorkflow();
  const job = jobBlock(workflow, "portal-web-static", "admin-static");

  assert.match(job, /needs: classify/);
  assert.match(job, /if: needs\.classify\.outputs\.run_full != '0'/);
  assert.match(job, /npm ci --prefix admin/);
  assert.match(job, /VITE_PORTAL_RECHARGE_TRUSTED_ACTION_ORIGINS_JSON: \$\{\{ inputs\.portal_recharge_trusted_action_origins_json \|\| '' \}\}/);

  const build = job.indexOf("- name: Build Portal desktop static");
  const verify = job.indexOf("- name: Verify Portal desktop static");
  const zip = job.indexOf("- name: Create Portal desktop static zip");
  const replay = job.indexOf("- name: Re-extract and verify Portal desktop static zip");
  const checksum = job.indexOf("- name: Write Portal desktop static checksum");
  const manifest = job.indexOf("- name: Create Portal desktop artifact manifest");
  const upload = job.indexOf("- name: Upload Portal desktop artifact");
  assert.ok(build >= 0 && verify > build && zip > verify && replay > zip);
  assert.ok(checksum > replay && manifest > checksum && upload > manifest);

  assert.match(job, /npm run admin:portal:web:build/);
  assert.match(job, /npm run admin:portal:web:verify/);
  assert.match(job, /globalcircle-portal-web-\$\{\{ steps\.release\.outputs\.release \}\}\.zip/);
  assert.match(job, /--expected admin\/dist-portal-web/);
  assert.match(job, /--release-unit portal-static/);
  assert.match(job, /actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a/);
  assert.match(job, /retention-days: 14/);
  assert.match(job, /portal-web-static-\$\{\{ steps\.release\.outputs\.release \}\}/);
  assert.match(job, /\.release-artifacts\/artifact\.json/);
});

test("CI builds and verifies the Portal desktop bundle", () => {
  const workflow = readFileSync(CI_WORKFLOW, "utf8").replaceAll("\r\n", "\n");
  const build = workflow.indexOf("run: npm run admin:portal:web:build");
  const verify = workflow.indexOf("run: npm run admin:portal:web:verify");
  assert.ok(build >= 0 && verify > build);
  assert.match(workflow.slice(build - 120, verify + 120), /if: steps\.changes\.outputs\.run_full != '0'/g);
});
