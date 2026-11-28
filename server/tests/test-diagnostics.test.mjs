import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { diagnose, formatReport, inspectTap, runModule } from "../../tools/test-diagnostics/diagnose.mjs";

const CLI = fileURLToPath(new URL("../../tools/test-diagnostics/diagnose.mjs", import.meta.url));
const NOW = Date.parse("2026-11-27T12:00:00Z");
const SHA = "a".repeat(40);
const target = { schemaVersion: 1, module: "worker", environment: "local", sha: SHA };
const local = { environment: "local", sha: SHA, module: "worker", profile: "focused", node: "v24.22.3", log: "run.log" };
const tap = (pass, fail = 0, skipped = 0, todo = 0) => {
  const total = pass + fail + skipped + todo;
  const results = [];
  let n = 0;
  for (let i = 0; i < pass; i++) results.push(`ok ${++n} - fixture`);
  for (let i = 0; i < fail; i++) results.push(`not ok ${++n} - fixture`);
  for (let i = 0; i < skipped; i++) results.push(`ok ${++n} - fixture # SKIP`);
  for (let i = 0; i < todo; i++) results.push(`ok ${++n} - fixture # TODO`);
  return [
    "TAP version 13", ...results, `1..${total}`, `# tests ${total}`, "# suites 0", `# pass ${pass}`, `# fail ${fail}`,
    "# cancelled 0", `# skipped ${skipped}`, `# todo ${todo}`, "# duration_ms 10", "",
  ].join("\n");
};

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "gccgw-diagnostics-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test("CLI module inventory does not combine server, worker, Agent or integration validation", () => {
  const r = spawnSync(process.execPath, [CLI, "--list"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const all = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(all), ["server", "worker", "agent", "migration", "integration"]);
  assert.equal(all.server.tapSections, 2);
  assert.match(all.worker.command, /--prefix workers\/control-plane/);
});

test("a pass needs complete TAP and a captured zero exit; skipped-only is not a pass", () => {
  assert.equal(inspectTap(tap(1), 0, 1).status, "passed");
  assert.equal(inspectTap(tap(1), null, 1).reason, "missing_exit_code");
  assert.equal(inspectTap(tap(1), 0, 2).reason, "incomplete_tap");
  assert.equal(inspectTap(tap(0, 0, 1), 0, 1).status, "no_tests_passed");
  assert.equal(inspectTap(tap(0).replace("# tests 0", "# tests 1"), 0, 1).status, "unverified");
  assert.equal(inspectTap(tap(1) + "TAP version 13\n", 0, 1).status, "unverified");
  assert.equal(inspectTap(tap(1) + tap(2), 0, 2).totals.pass, 3);
});

test("a TAP section with no top-level result lines is unverified, not passed", () => {
  const missingDetail = [
    "TAP version 13",
    "1..1",
    "# tests 1",
    "# suites 0",
    "# pass 1",
    "# fail 0",
    "# cancelled 0",
    "# skipped 0",
    "# todo 0",
    "",
  ].join("\n");

  const result = inspectTap(missingDetail, 0, 1);
  assert.equal(result.status, "unverified");
  assert.equal(result.logComplete, false);

  // Positive control: the same section with one top-level result line passes.
  const withResult = inspectTap(missingDetail.replace("1..1", "ok 1 - fixture\n1..1"), 0, 1);
  assert.equal(withResult.status, "passed");
  assert.equal(withResult.logComplete, true);
});

test("top-level TAP result numbers must be consecutive within each section", () => {
  const valid = tap(2);
  for (const numbers of [[1, 1], [1, 3], [2, 1]]) {
    let i = 0;
    const invalid = valid.replace(/^ok \d+(?= )/gm, () => "ok " + numbers[i++]);
    assert.equal(i, numbers.length);
    const result = inspectTap(invalid, 0, 1);
    assert.equal(result.status, "unverified", numbers.join(","));
    assert.equal(result.logComplete, false);
  }
  assert.equal(inspectTap(valid + tap(1), 0, 2).status, "passed");
});

test("a zero TAP plan cannot claim nonzero test totals", () => {
  const empty = tap(0);
  for (const category of ["pass", "skipped", "todo"]) {
    const invalid = empty.replace("# tests 0", "# tests 1").replace("# " + category + " 0", "# " + category + " 1");
    const result = inspectTap(invalid, 0, 1);
    assert.equal(result.status, "unverified", category);
    assert.equal(result.logComplete, false);
  }
  const result = inspectTap(empty, 0, 1);
  assert.equal(result.status, "no_tests_passed");
  assert.equal(result.logComplete, true);
});

test("real nested Node TAP passes when top-level results match the plan even though the summary counts subtests", async (t) => {
  const dir = await fixture(t);
  const name = join(dir, "nested.test.mjs");
  await writeFile(name, [
    'import { test } from "node:test";',
    'test("outer", async (t) => { await t.test("inner", () => {}); });',
    "",
  ].join("\n"));
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const run = spawnSync(process.execPath, ["--test", "--test-reporter=tap", name], { encoding: "utf8", env });
  assert.equal(run.status, 0, run.stderr);
  // Top-level plan is 1; the summary counts the outer test and its subtest.
  assert.match(run.stdout, /^1\.\.1$/m);
  assert.match(run.stdout, /^# tests 2$/m);
  const result = inspectTap(run.stdout, run.status, 1);
  assert.equal(result.status, "passed");
  assert.equal(result.logComplete, true);
  assert.deepEqual(result.totals, { tests: 2, pass: 2, fail: 0, cancelled: 0, skipped: 0, todo: 0 });
});

test("a second TAP plan cannot replace a contradictory first plan", () => {
  const invalid = tap(1).replace("1..1", "1..2\n1..1");
  const result = inspectTap(invalid, 0, 1);
  assert.equal(result.status, "unverified");
  assert.equal(result.logComplete, false);
});

test("a TAP summary cannot turn a SKIP or TODO result into a pass", () => {
  for (const input of [tap(0, 0, 1), tap(0, 0, 0, 1)]) {
    const invalid = input.replace("# pass 0", "# pass 1").replace(/# (skipped|todo) 1/, "# $1 0");
    const result = inspectTap(invalid, 0, 1);
    assert.equal(result.status, "unverified");
    assert.equal(result.logComplete, false);
  }
});

test("real Node suite TAP with a missing nested result cannot pass", async (t) => {
  const dir = await fixture(t);
  const name = join(dir, "nested-suite.test.mjs");
  await writeFile(name, [
    'import { describe, it, test } from "node:test";',
    'describe("suite", () => {',
    '  it("skipped", { skip: true }, () => {});',
    '  it("expected", { todo: true }, () => { throw new Error("expected"); });',
    '  it("empty wrapper control", () => {});',
    '});',
    'describe("empty suite", () => {});',
    'test("parent", async (t) => {',
    '  await t.test("A", () => {}); await t.test("B", () => {});',
    '});',
    "",
  ].join("\n"));
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const run = spawnSync(process.execPath, ["--test", "--test-reporter=tap", name], { encoding: "utf8", env });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^# suites 2$/m);
  assert.equal(inspectTap(run.stdout, 0, 1).status, "passed");
  for (const invalid of [
    run.stdout.replace(/^    ok 2 - B\r?\n/m, ""),
    run.stdout.replace(/^    1\.\.2\r?\n/m, ""),
    run.stdout.replace(/^    1\.\.2\r?$/m, "    1..2\n    1..2"),
  ]) {
    assert.notEqual(invalid, run.stdout);
    const result = inspectTap(invalid, 0, 1);
    assert.equal(result.status, "unverified");
    assert.equal(result.logComplete, false);
  }
});

test("a missing native binding is hinted without changing the failure verdict", () => {
  const r = inspectTap("TAP version 13\n  not ok 2 - sensitive-value\n  Could not locate the bindings file\n", 1, 1);
  assert.equal(r.status, "failed");
  assert.equal(r.logComplete, false);
  assert.deepEqual(r.firstFailure, { line: 2, testNumber: 2 });
  assert.deepEqual(r.failureHint, { kind: "native_module_load", line: 3 });
});

test("a nonzero exit or observed failure stays failed even when output was cut", () => {
  const r = inspectTap("TAP version 13\n  not ok 2 - sensitive-value\n  ERR_DLOPEN_FAILED\n", 1, 1);
  assert.equal(r.status, "failed");
  assert.equal(r.logComplete, false);
  assert.deepEqual(r.firstFailure, { line: 2, testNumber: 2 });
  assert.deepEqual(r.failureHint, { kind: "native_module_load", line: 3 });
  assert.doesNotMatch(JSON.stringify(r), /sensitive-value/);
  assert.equal(inspectTap(tap(1), 1, 1).status, "failed");
  assert.equal(inspectTap("TAP version 13\nBail out! secret\n", null, 1).status, "failed");
  assert.equal(inspectTap("TAP version 13\nnot ok 1 - expected # TODO fix\n", 0, 1).status, "unverified");
  // A TODO-marked failure is not a real failure: the run still passes when a
  // real test passes alongside it. The log must be realistic: two top-level
  // result lines against a 1..2 plan, with the summary counting the TODO test.
  assert.equal(inspectTap([
    "TAP version 13",
    "not ok 1 - expected # TODO fix",
    "ok 2 - fixture",
    "1..2",
    "# tests 2",
    "# suites 0",
    "# pass 1",
    "# fail 0",
    "# cancelled 0",
    "# skipped 0",
    "# todo 1",
    "# duration_ms 10",
    "",
  ].join("\n"), 0, 1).status, "passed");
});

test("CLI consumes real Node TAP and locates the failed case without echoing its data", async (t) => {
  const dir = await fixture(t);
  const name = join(dir, "fixture.test.mjs");
  await writeFile(name, 'import { test } from "node:test"; test("sensitive-value", () => { throw Error("secret-example"); });');
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const run = spawnSync(process.execPath, ["--test", "--test-reporter=tap", name], { encoding: "utf8", env });
  assert.equal(run.status, 1);
  await writeFile(join(dir, "run.log"), run.stdout);
  const bundle = join(dir, "bundle.json");
  await writeFile(bundle, JSON.stringify({ ...target, tests: [{ ...local, exitCode: run.status }] }));
  const r = spawnSync(process.execPath, [CLI, "--bundle", bundle], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Test \[1\]: failed/);
  assert.match(r.stdout, /first failure at log line \d+/);
  assert.doesNotMatch(r.stdout, /secret-example|sensitive-value|fixture\.test|incomplete log/);
  const json = spawnSync(process.execPath, [CLI, "--bundle", bundle, "--json"], { encoding: "utf8" });
  assert.deepEqual(JSON.parse(json.stdout).tests[0].totals,
    { tests: 1, pass: 0, fail: 1, cancelled: 0, skipped: 0, todo: 0 });
});

test("wrong environment or SHA remains unverified, while CI and service history never imply a live check", async (t) => {
  const dir = await fixture(t);
  const base = { sha: SHA, environment: "local" };
  const r = await diagnose({ ...target,
    tests: [{ ...local, sha: "b".repeat(40), exitCode: 0 }],
    ci: [
      { sha: SHA, environment: "ci", lane: "main", result: "skipped", runUrl: "https://github.com/FlyLink-com/proxy-gateway-minimal/actions/runs/42" },
      { sha: "b".repeat(40), environment: "ci", lane: "worker", result: "success" },
    ],
    services: [
      { ...base, service: "bwh", observedAt: "2026-11-26T11:59:00Z", observed: { writer: "BWH_ACTIVE" } },
      { ...base, environment: "staging", service: "worker", observedAt: "2026-11-27T11:59:00Z", observed: { health: "ok" } },
      { ...base, service: "worker", observedAt: "2026-11-27T11:59:00Z", observed: { health: "ok", d1Binding: "secret-binding" } },
      { ...base, service: "agent", observedAt: "2026-11-31T00:00:00Z", observed: { mode: "dry_run" } },
    ],
  }, dir, NOW);
  assert.equal(r.tests[0].reason, "wrong_commit");
  assert.equal(r.ci[0].status, "unverified");
  assert.equal(r.ci[0].claimedResult, "skipped");
  assert.match(r.ci[0].runUrl, /\/42$/);
  assert.equal(r.ci[1].reason, "wrong_commit");
  assert.equal(r.services[0].reason, "stale");
  assert.equal(r.services[1].reason, "wrong_environment");
  assert.deepEqual(r.services[2].unknownFields, ["d1Binding"]);
  assert.equal(r.services[3].reason, "invalid_observed_time");
  assert.doesNotMatch(formatReport(r), /BWH_ACTIVE|secret-binding|dry_run/);
});

test("untrusted links and evidence extras are not emitted; missing source is not a pass", async (t) => {
  const dir = await fixture(t);
  const r = await diagnose({ ...target,
    tests: [{ ...local, exitCode: 0 }],
    ci: [{ environment: "ci", sha: SHA, lane: "worker", result: "success", runUrl: "https://example.org/?token=secret" }],
    services: [{ environment: "local", sha: SHA, service: "agent", observedAt: "2026-11-27T11:59:00Z", observed: { mode: "dry_run", token: "secret" } }],
  }, dir, NOW);
  assert.equal(r.tests[0].reason, "missing_log");
  assert.equal(r.ci[0].runUrl, null);
  assert.doesNotMatch(JSON.stringify(r), /secret|example.org/);
  const empty = await diagnose(target, dir, NOW);
  assert.equal(empty.tests[0].reason, "no_test_receipt");
  assert.equal(empty.services[0].status, "unverified");
});

test("rejects arbitrary file extensions, path escapes and symlinks outside the bundle", async (t) => {
  const dir = await fixture(t);
  await assert.rejects(diagnose({ ...target, tests: [{ ...local, log: "../outside.log" }] }, dir), /invalid_log_path/);
  await assert.rejects(diagnose({ ...target, tests: [{ ...local, log: ".env" }] }, dir), /invalid_log_path/);
  const outside = await fixture(t);
  const actual = join(outside, "outside.log");
  await writeFile(actual, tap(1));
  try {
    await symlink(actual, join(dir, "run.log"));
  } catch (e) {
    if (process.platform === "win32" && e.code === "EPERM") return;
    throw e;
  }
  await assert.rejects(diagnose({ ...target, tests: [local] }, dir), /invalid_log_path/);
});

test("accepts a UTF-8 BOM manifest and Windows PowerShell UTF-16LE logs", async (t) => {
  const dir = await fixture(t);
  await writeFile(join(dir, "run.log"), Buffer.from("\uFEFF" + tap(1).replaceAll("\n", "\r\n"), "utf16le"));
  const bundle = join(dir, "bundle.json");
  await writeFile(bundle, "\uFEFF" + JSON.stringify({ ...target, tests: [{ ...local, exitCode: 0 }] }));
  const r = spawnSync(process.execPath, [CLI, "--bundle", bundle, "--json"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).tests[0].status, "passed");
});

test("same-SHA evidence from another lane or without a full command cannot pass", async (t) => {
  const dir = await fixture(t);
  await writeFile(join(dir, "run.log"), tap(1));
  const r = await diagnose({ ...target, tests: [
    { ...local, exitCode: 0, module: "agent" },
    { ...local, exitCode: 0, profile: "full" },
    { ...local, exitCode: 0, profile: undefined },
    { ...local, exitCode: 0 },
  ], ci: [{ sha: SHA, environment: "ci", lane: "worker", result: "success",
    runUrl: "https://github.com/FlyLink-com/proxy-gateway-minimal/actions/runs/42" }] }, dir);
  assert.deepEqual(r.tests.map(x => x.reason), [
    "wrong_module", "missing_full_run_provenance", "missing_or_invalid_test_profile", null,
  ]);
  assert.equal(r.tests[3].profile, "focused");
  assert.equal(r.tests[3].status, "passed");
  assert.equal(r.ci[0].status, "unverified");
  assert.equal(r.ci[0].reason, "ci_provenance_unverified");
});

test("offline full Server pass requires the non-TAP policy step too", async (t) => {
  const dir = await fixture(t);
  const bundle = join(dir, "bundle.json");
  await writeFile(join(dir, "run.log"), tap(1) + tap(2));
  const row = { ...local, module: "server", profile: "full", worktreeClean: true, exitCode: 0, command: [
    { cwd: ".", argv: ["node", "scripts/source-validation-test-runner.mjs", "--test-reporter=tap"] },
    { cwd: ".", argv: ["node", "--test", "--test-reporter=tap", "tools/c2-worker-config-policy/check.test.mjs"] },
    { cwd: ".", argv: ["node", "tools/c2-worker-config-policy/check.mjs"] },
  ] };
  await writeFile(bundle, JSON.stringify({ ...target, module: "server", tests: [
    { ...row, attemptedSteps: 2 },
    row,
    { ...row, attemptedSteps: 4 },
    { ...row, attemptedSteps: 3 },
    { ...row, attemptedSteps: 2, exitCode: 1 },
    { ...row, attemptedSteps: 2, signal: "SIGTERM" },
    { ...row, attemptedSteps: 2, launchFailed: true },
  ] }));
  const result = spawnSync(process.execPath, [CLI, "--bundle", bundle, "--json"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const { tests } = JSON.parse(result.stdout);
  assert.deepEqual(tests.map(({ status }) => status),
    ["unverified", "unverified", "unverified", "passed", "failed", "interrupted", "not_run"]);
  assert.ok(tests.slice(0, 3).every((test) => test.reason === "incomplete_step_evidence" && test.logComplete));
});

test("module CLI rejects manual, unknown and extra arguments", () => {
  for (const args of [["migration"], ["integration"], ["toString"], ["--help"], ["agent", "--test"]]) {
    const result = spawnSync(process.execPath, [CLI, "--module", ...args], { encoding: "utf8" });
    assert.equal(result.status, 2);
  }
});

test("module runner isolates subprocess environment and keeps raw output, exit, and first failure", async (t) => {
  const root = await fixture(t);
  const results = await fixture(t);
  const git = (...args) => {
    const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  git("init", "--quiet");
  await mkdir(join(root, "server", "tests"), { recursive: true });
  const path = join(root, "server", "tests", "agent-g4-contract.test.mjs");
  const fixtureSource = [
    'import { test } from "node:test";',
    'import assert from "node:assert/strict";',
    'test("fixture subprocess", () => { assert.equal(process.env.DIAGNOSTICS_PRIVATE_SENTINEL, undefined); console.error("stderr fixture"); });',
  ].join("\n");
  await writeFile(path, fixtureSource);
  git("add", ".");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "Fixture");
  process.env.DIAGNOSTICS_PRIVATE_SENTINEL = "must-not-reach-child";
  t.after(() => { delete process.env.DIAGNOSTICS_PRIVATE_SENTINEL; });
  const ok = await runModule("agent", { root, temporaryRoot: results });
  assert.equal(ok.receipt.status, "passed");
  assert.equal(ok.receipt.sha, git("rev-parse", "HEAD"));
  assert.equal(ok.receipt.worktreeClean, true);
  assert.equal(ok.receipt.profile, "focused");
  assert.equal(ok.receipt.exitCode, 0);
  assert.equal(ok.receipt.attemptedSteps, 1);
  const log = await readFile(join(ok.dir, "run.log"), "utf8");
  assert.match(log, /stderr fixture/);
  assert.match(log, /^TAP version /m);
  assert.doesNotMatch(log, /must-not-reach-child/);
  const saved = JSON.parse(await readFile(join(ok.dir, "bundle.json"), "utf8"));
  assert.deepEqual(saved.tests[0], ok.receipt);
  const viewed = await diagnose(saved, ok.dir);
  assert.equal(viewed.tests[0].status, "passed");

  await writeFile(path, fixtureSource + '\ntest("private fixture failure", () => { throw Error("private detail"); });');
  const bad = await runModule("agent", { root, temporaryRoot: results });
  assert.notEqual(bad.dir, ok.dir);
  assert.equal(bad.receipt.status, "failed");
  assert.equal(bad.receipt.worktreeClean, false);
  assert.equal(bad.receipt.exitCode, 1);
  assert.ok(bad.receipt.firstFailure?.line);
  assert.doesNotMatch(JSON.stringify(bad.receipt), /private fixture failure|private detail/);
});
