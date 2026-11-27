import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, dirname } from "node:path";

const MODULES = {
  server: { label: "Server / SQLite", command: "npm test", tapSections: 2 },
  worker: { label: "Worker / D1 (local Miniflare)", command: "npm --prefix workers/control-plane test", tapSections: 1 },
  agent: { label: "Agent protocol", command: "node --test server/tests/agent-g4-contract.test.mjs", tapSections: 1 },
  migration: { label: "Migration / reconciliation", command: "Run the exact authorized local synthetic suite from its PR or runbook." },
  integration: { label: "BWH / Worker / Agent joint validation", command: "Use the Worker suite or the pinned synthetic rehearsal receipt; do not run a remote rehearsal here." },
};

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
  const lines = log.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\x1b\[[0-9;]*m/g, "");
    if (line.trim()) lastNonempty = true;
    if (!failureHint) {
      if (/heap out of memory/i.test(line)) failureHint = { kind: "node_heap_exhausted", line: i + 1 };
      else if (/ERR_DLOPEN_FAILED|NODE_MODULE_VERSION/i.test(line)) failureHint = { kind: "native_module_load", line: i + 1 };
      else if (/ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND/i.test(line)) failureHint = { kind: "dependency_missing", line: i + 1 };
      else if (/^\s*(?:code: ['"]ETIMEDOUT['"]|npm error signal SIG(?:TERM|KILL))\s*$/i.test(line)) failureHint = { kind: "timeout_or_process_signal", line: i + 1 };
    }
    if (/^TAP version \d+$/.test(line)) {
      if (tap) incomplete = true;
      tap = true;
      pending = null;
    }
    if (!tap) continue;
    if (/^Bail out!/i.test(line)) bailout = true;
    const failed = /^[ \t]*not ok (\d+)\b/.exec(line);
    if (failed && !/\s+#\s+(?:TODO|SKIP)\b/i.test(line) && !firstFailure) {
      firstFailure = { line: i + 1, testNumber: Number(failed[1]) };
    }
    if (/^1\.\.\d+$/.test(line)) pending = {};
    if (!pending) continue;
    const counter = /^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$/.exec(line);
    if (!counter) continue;
    if (Object.hasOwn(pending, counter[1])) incomplete = true;
    pending[counter[1]] = Number(counter[2]);
    if (TAP_KEYS.every((key) => Object.hasOwn(pending, key))) {
      if (TAP_KEYS.every((key) => Number.isSafeInteger(pending[key])) &&
          pending.tests === TAP_KEYS.slice(1).reduce((sum, key) => sum + pending[key], 0)) complete.push(pending);
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
    requireValue(typeof row.node === "string" && NODES.test(row.node), "invalid_node_version");
    const exitCode = row.exitCode ?? null;
    requireValue(exitCode === null || Number.isInteger(exitCode) && exitCode >= 0 && exitCode <= 255, "invalid_exit_code");
    const expected = row.expectedTapSections ?? configuration.tapSections;
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
    tests.push({ source, node: row.node, ...inspectTap(log, exitCode, expected) });
  }
  const ci = [];
  for (const row of asArray(input.ci)) {
    requireValue(CI_LANES.includes(row?.lane) && CI_RESULTS.includes(row.result), "invalid_ci_receipt");
    const issue = identity(row, { env: "ci", sha });
    ci.push(issue ? { lane: row.lane, status: "unverified", reason: issue } :
      { lane: row.lane, environment: "ci", status: row.result, runUrl: repoRunUrl(row.runUrl) });
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
  for (const c of report.ci) summaries.push(`CI${c.lane ? ` [${c.lane}]` : ""}: ${c.status}${c.reason ? ` (${c.reason})` : ""}${c.runUrl ? ` ${c.runUrl}` : ""}`);
  for (const s of report.services) {
    const evidence = Object.entries(s.observed ?? {}).map(([key, value]) => `${key}=${value}`);
    if (s.unknownFields?.length) evidence.push(`unknown: ${s.unknownFields.join(", ")}`);
    if (s.reason) evidence.push(s.reason);
    if (s.observedAt) evidence.push(s.observedAt);
    summaries.push(`Service${s.service ? ` [${s.service}]` : ""}: ${s.status}${evidence.length ? ` (${evidence.join("; ")})` : ""}`);
  }
  return summaries.join("\n");
}

async function main(args) {
  if (args.length === 1 && args[0] === "--list") {
    console.log(JSON.stringify(MODULES, null, 2));
    return;
  }
  if (args[0] !== "--bundle" || !(args.length === 2 || args.length === 3 && args[2] === "--json")) {
    console.error("Usage: node tools/test-diagnostics/diagnose.mjs --list | --bundle <bundle.json> [--json]");
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
