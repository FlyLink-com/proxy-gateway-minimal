import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file) => readFileSync(resolve(root, ".github/workflows", file), "utf8").replace(/\r\n?/gu, "\n");
const workflow = read("ci.yml");
const draftGuard = "github.event_name != 'pull_request' || github.event.pull_request.draft == false";
const readyPrGuard = "github.event_name == 'pull_request' && github.event.pull_request.draft == false";
const aggregateGuard = `always() && (${draftGuard})`;

function jobsOf(source) {
  const body = source.slice(source.indexOf("\njobs:\n") + 7);
  const headers = [...body.matchAll(/^  ([\w-]+):\s*$/gmu)];
  return Object.fromEntries(headers.map((header, index) => [header[1],
    body.slice(header.index, headers[index + 1]?.index ?? body.length)]));
}

const jobs = jobsOf(workflow);
const condition = (job) => job.match(/^    if: (.+)$/mu)?.[1];
const needs = (job) => job.match(/^    needs: (.+)$/mu)?.[1];

test("ready PR CI keeps every job behind an explicit guard and stable final Validate", () => {
  assert.match(workflow, /pull_request:\n    types: \[opened, synchronize, reopened, ready_for_review\]\n    branches:\n      - master/u);
  assert.doesNotMatch(workflow.slice(0, workflow.indexOf("\npermissions:")), /paths(?:-ignore)?:/u);
  assert.match(workflow, /  push:\n    branches:\n      - master/u);
  assert.match(workflow, /  workflow_dispatch:/u);
  assert.match(workflow, /cancel-in-progress: true/u);
  assert.deepEqual(Object.keys(jobs), [
    "governance-evidence", "governance-snapshot", "source-checks", "foundation-inventory",
    "checks-passed", "build-assets", "dependency-artifact", "validate"
  ]);
  const expected = {
    "governance-evidence": `github.event_name != 'workflow_dispatch' && (${draftGuard})`,
    "governance-snapshot": "github.event_name == 'workflow_dispatch'",
    "source-checks": draftGuard,
    "foundation-inventory": readyPrGuard,
    "checks-passed": aggregateGuard,
    "build-assets": `(${draftGuard}) && !cancelled() && needs.checks-passed.result == 'success' && needs.source-checks.result == 'success'`,
    "dependency-artifact": `${readyPrGuard} && !cancelled() && needs.checks-passed.result == 'success'`,
    validate: aggregateGuard
  };
  for (const [name, guard] of Object.entries(expected)) assert.equal(condition(jobs[name]), guard, name);
  assert.equal((workflow.match(/^    name: Validate$/gmu) ?? []).length, 1);
  assert.match(jobs.validate, /^    name: Validate$/mu);
  assert.doesNotMatch(workflow, /continue-on-error:|contents: write|checks: write|secrets:|pull_request_target:/u);
});

test("builds need successful applicable checks and required Validate aggregates both build lanes", () => {
  assert.equal(needs(jobs["checks-passed"]), "[governance-evidence, governance-snapshot, source-checks, foundation-inventory]");
  assert.equal(needs(jobs["build-assets"]), "[checks-passed, source-checks]");
  assert.equal(needs(jobs["dependency-artifact"]), "checks-passed");
  assert.equal(needs(jobs.validate), "[checks-passed, build-assets, dependency-artifact]");
  assert.doesNotMatch(jobs["source-checks"], /run: npm run (?:admin(?::portal(?::web)?)?:build|cloudflare:site:build)/u);
  assert.match(jobs["source-checks"], /run: npm test/u);
  assert.match(jobs["source-checks"], /run: npm run admin:test/u);
  assert.match(jobs["source-checks"], /python3 -m unittest discover -s ops\/certificates -p test_runtime_certificate_sync\.py -v/u);
  assert.match(jobs["source-checks"], /python3 -m py_compile ops\/certificates\/runtime_certificate_sync\.py/u);
  assert.match(jobs["source-checks"], /sh -n ops\/certificates\/certbot-deploy-hook\.sh\.in/u);
  assert.match(jobs["source-checks"], /run_full: \$\{\{ steps\.changes\.outputs\.run_full \}\}/u);
  for (const build of ["admin", "admin:portal", "admin:portal:web", "cloudflare:site"]) {
    assert.ok(jobs["build-assets"].includes(`run: npm run ${build}:build`), build);
    assert.ok(jobs["build-assets"].indexOf(`run: npm run ${build}:verify`) > jobs["build-assets"].indexOf(`run: npm run ${build}:build`), build);
  }
  assert.match(jobs["build-assets"], /if: needs\.source-checks\.outputs\.run_full != '0'/u);
});

test("reusable PR lanes inherit caller source, stay read-only, and preserve non-PR artifact entrypoints", () => {
  const dependency = read("control-plane-dependency-artifact.yml");
  const foundation = read("control-plane-foundation-toolchain-inventory.yml");
  assert.equal(jobs["dependency-artifact"].match(/^    uses: (.+)$/mu)?.[1], "./.github/workflows/control-plane-dependency-artifact.yml");
  assert.equal(jobs["foundation-inventory"].match(/^    uses: (.+)$/mu)?.[1], "./.github/workflows/control-plane-foundation-toolchain-inventory.yml");
  assert.equal((workflow.match(/^    uses: \.\/\.github\/workflows\//gmu) ?? []).length, 2);
  for (const source of [dependency, foundation]) {
    assert.match(source, /^  workflow_call:/mu);
    assert.doesNotMatch(source, /^  pull_request:|pull_request_target:|workflow_run:/mu);
    assert.match(source, /permissions:\n  contents: read/u);
    assert.doesNotMatch(source, /\b(?:contents|checks|actions|id-token): write|secrets:/u);
    assert.match(source, /github\.event\.pull_request\.head\.sha/u);
    assert.doesNotMatch(source, /group: ci-/u);
  }
  assert.equal(condition(jobsOf(dependency).build), draftGuard);
  assert.equal(condition(jobsOf(foundation)["toolchain-inventory"]), readyPrGuard);
  assert.match(dependency, /  push:\n    branches:\n      - master/u);
  assert.match(dependency, /  workflow_dispatch:/u);
  assert.match(dependency, /name: Upload dependency artifact on non-PR refs\n        if: github\.event_name != 'pull_request'/u);
  const certificates = read("runtime-certificate-sync.yml");
  assert.match(certificates, /types: \[opened, synchronize, reopened, ready_for_review, converted_to_draft\]/u);
  assert.equal(condition(jobsOf(certificates)["synthetic-linux"]), draftGuard);
});

function scriptOf(job) {
  const match = job.match(/        run: \|\n([\s\S]*)/u);
  assert.ok(match);
  return match[1].split("\n").map((line) => line.startsWith("          ") ? line.slice(10) : line).join("\n").trim();
}

const bashAvailable = spawnSync("bash", ["--version"], { encoding: "utf8" }).status === 0;
function assertStatus(script, env, expected, label) {
  // Legacy Windows bash.exe neither forwards arbitrary env vars into WSL nor
  // preserves -c quoting. Supply fixture values as arguments and source via stdin.
  for (const key of Object.keys(env)) assert.match(key, /^[A-Z_]+$/u);
  const entered = "__ci_ready_shell_entered__";
  const exited = "__ci_ready_shell_exit__";
  const result = spawnSync("bash", ["--noprofile", "--norc", "-s", "--",
    ...Object.entries(env).map(([key, value]) => `${key}=${value}`)], {
    encoding: "utf8", timeout: 5000,
    env: { PATH: process.env.PATH },
    input: `export "$@" || exit 98\nprintf '%s\\n' '${entered}'\ntrap 'code=$?; printf "${exited}:%s\\n" "$code"' EXIT\n${script}\n`
  });
  const bounded = (value) => String(value ?? "").replaceAll("\0", "").slice(0, 1024);
  const diagnostic = `${label}: ${JSON.stringify({
    status: result.status, signal: result.signal, error: result.error?.code,
    stdout: bounded(result.stdout), stderr: bounded(result.stderr)
  })}`;
  assert.equal(result.error, undefined, diagnostic);
  assert.equal(result.signal, null, diagnostic);
  assert.ok(result.stdout.startsWith(`${entered}\n`), diagnostic);
  assert.ok(result.stdout.endsWith(`${exited}:${expected}\n`), diagnostic);
  assert.equal(result.status, expected, diagnostic);
}

test("actual prerequisite shell rejects every failure, cancellation, missing result, or unexpected skip", { skip: !bashAvailable }, () => {
  const script = scriptOf(jobs["checks-passed"]);
  const accepted = [
    { EVENT_NAME: "pull_request", SOURCE_RESULT: "success", GOVERNANCE_RESULT: "success", SNAPSHOT_RESULT: "skipped", FOUNDATION_RESULT: "success" },
    { EVENT_NAME: "push", SOURCE_RESULT: "success", GOVERNANCE_RESULT: "success", SNAPSHOT_RESULT: "skipped", FOUNDATION_RESULT: "skipped" },
    { EVENT_NAME: "workflow_dispatch", SOURCE_RESULT: "success", GOVERNANCE_RESULT: "skipped", SNAPSHOT_RESULT: "success", FOUNDATION_RESULT: "skipped" }
  ];
  for (const env of accepted) {
    assertStatus(script, env, 0, env.EVENT_NAME);
    for (const field of Object.keys(env).filter((key) => key !== "EVENT_NAME")) {
      for (const value of ["success", "failure", "cancelled", "skipped", ""]) {
        if (value !== env[field]) assertStatus(script, { ...env, [field]: value }, 1, `${env.EVENT_NAME}/${field}/${value}`);
      }
    }
  }
  assertStatus(script, { ...accepted[0], EVENT_NAME: "workflow_run" }, 1, "workflow_run");
});

test("actual final Validate shell cannot hide failed or skipped checks and builds", { skip: !bashAvailable }, () => {
  const script = scriptOf(jobs.validate);
  for (const event of ["pull_request", "push", "workflow_dispatch"]) {
    const env = { EVENT_NAME: event, CHECKS_RESULT: "success", ASSETS_RESULT: "success", DEPENDENCY_RESULT: event === "pull_request" ? "success" : "skipped" };
    assertStatus(script, env, 0, event);
    for (const field of ["CHECKS_RESULT", "ASSETS_RESULT", "DEPENDENCY_RESULT"]) {
      for (const value of ["success", "failure", "cancelled", "skipped", ""]) {
        if (value !== env[field]) assertStatus(script, { ...env, [field]: value }, 1, `${event}/${field}/${value}`);
      }
    }
  }
});
