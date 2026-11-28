import { mkdtemp, open, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawn } from "node:child_process";
import { SOURCE_VALIDATION_EMPTY_ENV_RELATIVE_PATH, sanitizeSourceValidationChildEnvironment } from "../../scripts/source-validation-test-runner.mjs";

const MODULES = {
  server: { label: "Server / SQLite", command: "npm test", tapSections: 2 },
  worker: { label: "Worker / D1 (local Miniflare)", command: "npm --prefix workers/control-plane test", tapSections: 1 },
  agent: { label: "Agent protocol", command: "node --test server/tests/agent-g4-contract.test.mjs", tapSections: 1 },
  migration: { label: "Migration / reconciliation", command: "Run the exact authorized local synthetic suite from its PR or runbook." },
  integration: { label: "BWH / Worker / Agent joint validation", command: "Use the Worker suite or the pinned synthetic rehearsal receipt; do not run a remote rehearsal here." },
};

// These fixed Node invocations mirror the existing npm test scripts, with TAP explicit.
const TAP = ["--test", "--test-reporter=tap"];
const PROFILES = {
  server: { full: { sections: 2, steps: [
    [".", "scripts/source-validation-test-runner.mjs", "--test-reporter=tap"],
    [".", ...TAP, "tools/c2-worker-config-policy/check.test.mjs"],
    [".", "tools/c2-worker-config-policy/check.mjs"],
  ] }, focused: { sections: 1 } },
  worker: { full: { sections: 1, steps: [
    ["workers/control-plane", ...TAP, "test/**/*.test.mjs", "../../server/tests/agent-g4-contract.test.mjs"],
  ] }, focused: { sections: 1 } },
  agent: { focused: { sections: 1, steps: [
    [".", ...TAP, "server/tests/agent-g4-contract.test.mjs"],
  ] } },
  migration: {},
  integration: {},
};
const DEFAULT_PROFILE = { server: "full", worker: "full", agent: "focused" };
const commandReceipt = (steps) => steps.map(([cwd, ...argv]) => ({ cwd, argv: ["node", ...argv] }));
function matchesCommand(command, steps) {
  return Array.isArray(command) && command.length === steps.length && steps.every(([cwd, ...args], index) => {
    const step = command[index];
    const argv = ["node", ...args];
    return step?.cwd === cwd && Array.isArray(step.argv) && step.argv.length === argv.length &&
      argv.every((arg, n) => step.argv[n] === arg);
  });
}

const ENV = ["local", "ci", "isolated", "staging", "production"];
const SERVICES = {
  bwh: ["process", "health", "writer"],
  worker: ["health", "d1Binding"],
  agent: ["process", "mode"],
  d1: ["writer"],
};
const VALUES = {
  process: ["running", "stopped"],
  health: ["ok", "unhealthy"],
  writer: ["BWH_ACTIVE", "FROZEN", "D1_ACTIVE", "RECOVERY"],
  d1Binding: ["matches_expected", "mismatch"],
  mode: ["disabled", "dry_run", "apply"],
};
const SHAS = /^[a-f0-9]{40}$/;
const NODES = /^v?\d{1,3}\.\d{1,3}\.\d{1,4}$/;
const TAP_KEYS = ["tests", "pass", "fail", "cancelled", "skipped", "todo"];
const CI_LANES = ["main", "worker", "codeql", "governance"];
const CI_RESULTS = ["success", "failure", "cancelled", "timed_out", "action_required", "neutral", "skipped", "in_progress", "queued", "not_run"];
const HOUR = 3600000;

function requireValue(condition, code) {
  if (!condition) throw new Error(code);
}

function itemOf(value, object) {
  return typeof value === "string" && Object.hasOwn(object, value);
}

function timestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  const canonical = new Date(ms).toISOString();
  return canonical === value || canonical.replace(".000Z", "Z") === value ? canonical : null;
}

function identity(row, { env, sha }) {
  requireValue(row && ENV.includes(row.environment) && typeof row.sha === "string" && SHAS.test(row.sha), "invalid_evidence_identity");
  return row.environment !== env ? "wrong_environment" : row.sha !== sha ? "wrong_commit" : null;
}

export function inspectTap(log, exitCode, expected) {
  const complete = [];
  let tap = false;
  let pending = null;
  let incomplete = false;
  let firstFailure = null;
  let bailout = false;
  let failureHint = null;
  let lastNonempty = null;
  // Per-section TAP evidence. A section is only complete when its top-level
  // result lines match its plan: Node counts nested subtests in the `# tests`
  // summary, so the plan must never be compared against that summary total.
  // Top-level result lines start at column 0; indented `ok`/`not ok` lines
  // are subtests and are not counted here.
  let plan = null;
  let topLevelResults = 0;
  const lines = log.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\x1b\[[0-9;]*m/g, "");
    if (line.trim()) lastNonempty = true;
    if (!failureHint) {
      if (/heap out of memory/i.test(line)) failureHint = { kind: "node_heap_exhausted", line: i + 1 };
      else if (/ERR_DLOPEN_FAILED|NODE_MODULE_VERSION/i.test(line)) failureHint = { kind: "native_module_load", line: i + 1 };
      // better-sqlite3 reports a missing native binding with this message
      // (seen on Lucky); same native-module-load failure, only worded differently.
      else if (/Could not locate the bindings file/i.test(line)) failureHint = { kind: "native_module_load", line: i + 1 };
      else if (/ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND/i.test(line)) failureHint = { kind: "dependency_missing", line: i + 1 };
      else if (/^\s*(?:code: ['"]ETIMEDOUT['"]|npm error signal SIG(?:TERM|KILL))\s*$/i.test(line)) failureHint = { kind: "timeout_or_process_signal", line: i + 1 };
    }
    if (/^TAP version \d+$/.test(line)) {
      if (tap) incomplete = true;
      tap = true;
      pending = null;
      plan = null;
      topLevelResults = 0;
    }
    if (!tap) continue;
    if (/^Bail out!/i.test(line)) bailout = true;
    const failed = /^[ \t]*not ok (\d+)\b/.exec(line);
    if (failed && !/\s+#\s+(?:TODO|SKIP)\b/i.test(line) && !firstFailure) {
      firstFailure = { line: i + 1, testNumber: Number(failed[1]) };
    }
    const topLevelResult = /^(?:ok|not ok) (\d+)(?=\s|$)/.exec(line);
    if (topLevelResult && Number(topLevelResult[1]) !== ++topLevelResults) incomplete = true;
    const planLine = /^1\.\.(\d+)$/.exec(line);
    if (planLine) { pending = {}; plan = Number(planLine[1]); }
    if (!pending) continue;
    const counter = /^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$/.exec(line);
    if (!counter) continue;
    if (Object.hasOwn(pending, counter[1])) incomplete = true;
    pending[counter[1]] = Number(counter[2]);
    if (TAP_KEYS.every((key) => Object.hasOwn(pending, key))) {
      if (TAP_KEYS.every((key) => Number.isSafeInteger(pending[key])) &&
          pending.tests === TAP_KEYS.slice(1).reduce((sum, key) => sum + pending[key], 0) &&
          topLevelResults === plan &&
          (plan !== 0 || pending.tests === 0)) complete.push(pending);
      else incomplete = true;
      tap = false;
      pending = null;
    }
  }
  const totals = Object.fromEntries(TAP_KEYS.map((key) => [key, complete.reduce((n, section) => n + section[key], 0)]));
  // Node emits its duration after the counters. Another command may append
  // successful policy output; do not infer an interrupted run from that output.
  const logComplete = !tap && !incomplete && !bailout && complete.length === expected;
  let status = "unverified";
  if ((exitCode !== null && exitCode !== 0) || totals.fail || totals.cancelled || bailout || firstFailure) status = "failed";
  else if (exitCode === 0 && logComplete && complete.every((section) => section.pass > 0)) status = "passed";
  else if (exitCode === 0 && logComplete) status = "no_tests_passed";
  return { status, exitCode, logComplete, sections: complete.length, expectedSections: expected,
    totals: complete.length ? totals : null, firstFailure, failureHint,
    reason: status === "unverified" ? (exitCode === null ? "missing_exit_code" : lastNonempty ? "incomplete_tap" : "empty_log") : null };
}

async function boundedFile(path, limit) {
  const info = await stat(path);
  requireValue(info.isFile() && info.size <= limit, "invalid_input_file");
  const bytes = await readFile(path);
  requireValue(bytes.length <= limit, "invalid_input_file");
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf16le" : "utf8";
  return bytes.toString(encoding).replace(/^\uFEFF/, "");
}

function repoRunUrl(url) {
  return typeof url === "string" && /^https:\/\/github\.com\/FlyLink-com\/proxy-gateway-minimal\/actions\/runs\/[0-9]+(?:\/job\/[0-9]+)?$/i.test(url) ? url : null;
}

function asArray(value) {
  requireValue(value === undefined || Array.isArray(value) && value.length <= 64, "invalid_evidence_list");
  return value ?? [];
}

export async function diagnose(input, directory, now = Date.now()) {
  requireValue(input?.schemaVersion === 1 && itemOf(input.module, MODULES) &&
    ENV.includes(input.environment) && typeof input.sha === "string" && SHAS.test(input.sha), "invalid_bundle");
  const { module, environment: env, sha } = input;
  const target = { env, sha };
  const configuration = MODULES[module];
  const tests = [];
  for (const [index, row] of asArray(input.tests).entries()) {
    const issue = identity(row, target);
    const source = index + 1;
    if (issue) { tests.push({ source, status: "unverified", reason: issue }); continue; }
    if (row.module !== module) {
      tests.push({ source, status: "unverified", reason: row.module === undefined ? "missing_test_module" : "wrong_module" }); continue;
    }
    const profile = typeof row.profile === "string" && Object.hasOwn(PROFILES[module], row.profile) ?
      PROFILES[module][row.profile] : null;
    if (!profile && (row.profile !== "manual" || !["migration", "integration"].includes(module))) {
      tests.push({ source, status: "unverified", reason: "missing_or_invalid_test_profile" }); continue;
    }
    if (row.profile === "full" && (!matchesCommand(row.command, profile.steps) || row.worktreeClean !== true)) {
      tests.push({ source, profile: row.profile, status: "unverified", reason: "missing_full_run_provenance" }); continue;
    }
    if (row.worktreeClean === false) {
      tests.push({ source, profile: row.profile, status: "unverified", reason: "dirty_or_changed_worktree" }); continue;
    }
    if (row.signal) {
      tests.push({ source, profile: row.profile, status: "interrupted", reason: "child_signal" }); continue;
    }
    if (row.launchFailed === true) {
      tests.push({ source, profile: row.profile, status: "not_run", reason: "child_launch_failed" }); continue;
    }
    requireValue(typeof row.node === "string" && NODES.test(row.node), "invalid_node_version");
    const exitCode = row.exitCode ?? null;
    requireValue(exitCode === null || Number.isInteger(exitCode) && exitCode >= 0 && exitCode <= 255, "invalid_exit_code");
    const expected = profile?.sections ?? row.expectedTapSections;
    requireValue(row.expectedTapSections === undefined || expected === row.expectedTapSections, "invalid_expected_tap_sections");
    requireValue(Number.isInteger(expected) && expected >= 1 && expected <= 16, "invalid_expected_tap_sections");
    requireValue(typeof row.log === "string" && /\.(log|tap)$/i.test(row.log) && !isAbsolute(row.log), "invalid_log_path");
    const base = await realpath(directory);
    const requested = resolve(base, row.log);
    const inside = (p) => { const rel = relative(base, p); return rel && !rel.startsWith("..") && !isAbsolute(rel); };
    requireValue(inside(requested), "invalid_log_path");
    let log;
    try {
      const path = await realpath(requested);
      requireValue(inside(path), "invalid_log_path");
      log = await boundedFile(path, 64 * 1024 * 1024);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      tests.push({ source, node: row.node, status: exitCode !== null && exitCode !== 0 ? "failed" : "unverified", exitCode, reason: "missing_log" });
      continue;
    }
    const parsed = inspectTap(log, exitCode, expected);
    // TAP summaries do not cover non-TAP commands, such as the final Server policy check.
    if (parsed.status === "passed" && row.profile === "full" && row.attemptedSteps !== profile.steps.length) {
      parsed.status = "unverified";
      parsed.reason = "incomplete_step_evidence";
    }
    tests.push({ source, profile: row.profile, node: row.node, ...parsed });
  }
  const ci = [];
  for (const row of asArray(input.ci)) {
    requireValue(CI_LANES.includes(row?.lane) && CI_RESULTS.includes(row.result), "invalid_ci_receipt");
    const issue = identity(row, { env: "ci", sha });
    ci.push(issue ? { lane: row.lane, status: "unverified", reason: issue } :
      { lane: row.lane, environment: "ci", status: "unverified", claimedResult: row.result,
        reason: "ci_provenance_unverified", runUrl: repoRunUrl(row.runUrl) });
  }
  const services = [];
  for (const row of asArray(input.services)) {
    requireValue(itemOf(row?.service, SERVICES), "invalid_service_receipt");
    const issue = identity(row, target);
    const observedAt = timestamp(row.observedAt);
    const dated = observedAt === null ? null : Date.parse(observedAt);
    const reason = issue ?? (dated === null || dated > now ? "invalid_observed_time" : now - dated > 24 * HOUR ? "stale" : null);
    if (reason) { services.push({ service: row.service, status: "unverified", reason, observedAt }); continue; }
    const observed = {};
    for (const key of SERVICES[row.service]) {
      if (VALUES[key].includes(row.observed?.[key])) observed[key] = row.observed[key];
    }
    services.push({ service: row.service, status: Object.keys(observed).length ? "recorded" : "unverified",
      observedAt, observed, unknownFields: SERVICES[row.service].filter((key) => !Object.hasOwn(observed, key)) });
  }
  return { module, label: configuration.label, environment: env, sha,
    tests: tests.length ? tests : [{ status: "unverified", reason: "no_test_receipt" }],
    ci: ci.length ? ci : [{ status: "unverified", reason: "no_ci_receipt" }],
    services: services.length ? services : [{ status: "unverified", reason: "no_service_receipt" }] };
}

const ERROR_CODES = new Set([
  "invalid_input_file", "invalid_evidence_identity", "invalid_evidence_list",
  "invalid_bundle", "invalid_node_version", "invalid_exit_code", "invalid_expected_tap_sections",
  "invalid_log_path", "invalid_ci_receipt", "invalid_service_receipt",
]);

export function formatReport(report) {
  const summaries = [`${report.label} | ${report.environment} | ${report.sha}`];
  for (const t of report.tests) {
    const details = [
      t.profile,
      t.node && `Node ${t.node}`,
      Number.isInteger(t.exitCode) && `exit ${t.exitCode}`,
      t.logComplete === false && "incomplete log",
      t.reason,
      t.totals && `pass ${t.totals.pass}, fail ${t.totals.fail}, skipped ${t.totals.skipped}`,
      t.firstFailure && `first failure at log line ${t.firstFailure.line} (TAP #${t.firstFailure.testNumber})`,
      t.failureHint && `${t.failureHint.kind} at log line ${t.failureHint.line}`,
    ].filter(Boolean);
    summaries.push(`Test${t.source ? ` [${t.source}]` : ""}: ${t.status}${details.length ? ` (${details.join("; ")})` : ""}`);
  }
  for (const c of report.ci) summaries.push(`CI${c.lane ? ` [${c.lane}]` : ""}: ${c.status}${c.claimedResult ? ` (reported: ${c.claimedResult})` : ""}${c.reason ? ` (${c.reason})` : ""}${c.runUrl ? ` ${c.runUrl}` : ""}`);
  for (const s of report.services) {
    const evidence = Object.entries(s.observed ?? {}).map(([key, value]) => `${key}=${value}`);
    if (s.unknownFields?.length) evidence.push(`unknown: ${s.unknownFields.join(", ")}`);
    if (s.reason) evidence.push(s.reason);
    if (s.observedAt) evidence.push(s.observedAt);
    summaries.push(`Service${s.service ? ` [${s.service}]` : ""}: ${s.status}${evidence.length ? ` (${evidence.join("; ")})` : ""}`);
  }
  return summaries.join("\n");
}

function runStep(args, options, onChild) {
  return new Promise((done) => {
    const child = spawn(process.execPath, args, options);
    let launchFailed = false;
    onChild(child);
    child.once("error", () => { launchFailed = true; });
    child.once("close", (exitCode, signal) => {
      onChild(null);
      done({ exitCode, signal, launchFailed });
    });
  });
}

function readGit(root, env, args) {
  return execFileSync("git", args, {
    cwd: root, env, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", timeout: 10000,
  }).trim();
}

export async function runModule(module, {
  root = resolve(dirname(import.meta.filename), "../.."), temporaryRoot = tmpdir(),
} = {}) {
  requireValue(itemOf(module, DEFAULT_PROFILE), "module_not_runnable");
  const profile = DEFAULT_PROFILE[module];
  const { steps, sections } = PROFILES[module][profile];
  const dir = await mkdtemp(join(temporaryRoot, `flylink-diagnostics-${module}-`));
  const logName = "run.log";
  const env = {
    ...sanitizeSourceValidationChildEnvironment(),
    HOME: dir, USERPROFILE: dir, TEMP: dir, TMP: dir, TMPDIR: dir, NODE_ENV: "test",
    GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0",
    DOTENV_CONFIG_PATH: resolve(root, SOURCE_VALIDATION_EMPTY_ENV_RELATIVE_PATH),
    DOTENV_CONFIG_QUIET: "true", NO_COLOR: "1",
  };
  const sha = readGit(root, env, ["rev-parse", "HEAD"]);
  requireValue(SHAS.test(sha), "module_checkout_unavailable");
  const clean = readGit(root, env, ["status", "--porcelain", "--untracked-files=normal"]) === "";
  const startedAt = new Date().toISOString();
  const log = await open(join(dir, logName), "wx", 0o600);
  let child = null;
  let interrupted = null;
  const interrupt = (signal) => { interrupted ??= signal; child?.kill(signal); };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  let result = { exitCode: null, signal: null, launchFailed: false };
  let attemptedSteps = 0;
  try {
    for (const [cwd, ...args] of steps) {
      if (interrupted) break;
      attemptedSteps++;
      result = await runStep(args, {
        cwd: resolve(root, cwd), env, stdio: ["ignore", log.fd, log.fd], windowsHide: true,
      }, (value) => { child = value; });
      if (result.exitCode !== 0 || result.signal || result.launchFailed) break;
    }
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
    await log.close();
  }
  const signal = interrupted ?? result.signal;
  let worktreeClean = false;
  try {
    worktreeClean = clean && readGit(root, env, ["rev-parse", "HEAD"]) === sha &&
      readGit(root, env, ["status", "--porcelain", "--untracked-files=normal"]) === "";
  } catch { /* checkout identity could not be verified after the run */ }
  let parsed;
  try { parsed = inspectTap(await boundedFile(join(dir, logName), 64 * 1024 * 1024), result.exitCode, sections); }
  catch { parsed = { status: "unverified", logComplete: false, reason: "log_not_parsed" }; }
  const status = signal ? "interrupted" : result.launchFailed ? "not_run" : result.exitCode !== null && result.exitCode !== 0 ? "failed" : parsed.status;
  const receipt = { ...parsed, status, module, profile, environment: "local", sha, worktreeClean,
    node: process.version, startedAt, endedAt: new Date().toISOString(),
    exitCode: result.exitCode, signal, log: logName, expectedTapSections: sections,
    command: commandReceipt(steps), launchFailed: result.launchFailed, attemptedSteps,
  };
  await writeFile(join(dir, "bundle.json"), JSON.stringify({
    schemaVersion: 1, module, environment: "local", sha, tests: [receipt],
  }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  return { dir, receipt };
}

async function main(args) {
  if (args.length === 1 && args[0] === "--list") {
    console.log(JSON.stringify(MODULES, null, 2));
    return;
  }
  if (args[0] === "--module" && args.length === 2) {
    if (!itemOf(args[1], DEFAULT_PROFILE)) {
      console.error("Module not runnable here. Use server, worker, or agent; migration and integration require a pinned runbook.");
      process.exitCode = 2;
      return;
    }
    try {
      const { dir, receipt: r } = await runModule(args[1]);
      console.log(formatReport({
        label: MODULES[r.module].label, environment: "local", sha: r.sha, tests: [r], ci: [], services: [],
      }));
      if (!r.worktreeClean) console.log("Worktree not verified clean; this result is not exact-commit evidence.");
      console.log(`Log: ${join(dir, "run.log")}\nReceipt: ${join(dir, "bundle.json")}`);
      process.exitCode = r.signal ? 1 : r.exitCode || (r.status === "passed" ? 0 : 1);
    } catch {
      console.error("Module runner could not record the run.");
      process.exitCode = 2;
    }
    return;
  }
  if (args[0] !== "--bundle" || !(args.length === 2 || args.length === 3 && args[2] === "--json")) {
    console.error("Usage: node tools/test-diagnostics/diagnose.mjs --list | --module <server|worker|agent> | --bundle <bundle.json> [--json]");
    process.exitCode = 2;
    return;
  }
  try {
    const path = resolve(args[1]);
    const input = JSON.parse(await boundedFile(path, 128 * 1024));
    const report = await diagnose(input, dirname(path));
    console.log(args[2] === "--json" ? JSON.stringify(report, null, 2) : formatReport(report));
  } catch (error) {
    console.error(ERROR_CODES.has(error?.message) ? error.message : "diagnostic_input_unreadable");
    process.exitCode = 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) await main(process.argv.slice(2));
