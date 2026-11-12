#!/usr/bin/env node
import { execFileSync, fork } from "node:child_process";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statfsSync,
  statSync,
  writeFileSync
} from "node:fs";
import { Agent as HttpAgent, request as httpRequest } from "node:http";
import {
  arch,
  cpus,
  freemem,
  loadavg,
  platform,
  release,
  tmpdir,
  totalmem
} from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";

import { verifyArtifactGitTree } from "./artifact-git-tree-verifier.mjs";
import { createApp } from "../server/app.mjs";
import { createRateLimitMiddleware } from "../server/middleware/rate-limit.mjs";
import { createPortalPasswordCredentialService } from "../server/services/platform/portal-password-credentials.mjs";
import { createPortalRegistrationService } from "../server/services/platform/portal-registration.mjs";
import { createSqliteSubscriptionControlStore } from "../server/services/platform/subscription-control-db.mjs";
import { createSubscriptionCore } from "../server/services/subscriptions/core.mjs";
import { createSqliteSubscriptionStore } from "../server/services/subscriptions/repository.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SOURCE_ROOT = resolve(dirname(SCRIPT_PATH), "..");
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const DEFAULTS = Object.freeze({
  httpConcurrency: [1, 8, 32],
  httpRepeats: 3,
  httpWarmupMs: 400,
  httpMeasureMs: 10_000,
  httpFixedRates: [10, 100],
  httpFixedRateDurationMs: 10_000,
  httpMaxInFlight: 128,
  httpDrainTimeoutMs: 10_000,
  httpTenants: 1,
  httpArtifactsPerTenant: 1,
  accountScales: [100, 1000, 5000, 10000],
  sqliteWriteOperations: 8000,
  sqliteWriteConcurrency: [1, 2, 4, 8]
});

const LIMITS = Object.freeze({
  httpConcurrency: { min: 1, max: 128, maxItems: 6 },
  httpRepeats: { min: 1, max: 5 },
  httpWarmupMs: { min: 1, max: 60_000 },
  httpMeasureMs: { min: 100, max: 120_000 },
  httpFixedRates: { min: 1, max: 10_000, maxItems: 8 },
  httpFixedRateDurationMs: { min: 100, max: 120_000 },
  httpMaxInFlight: { min: 1, max: 512 },
  httpDrainTimeoutMs: { min: 100, max: 30_000 },
  httpTenants: { min: 1, max: 10_000 },
  httpArtifactsPerTenant: { min: 1, max: 4 },
  accountScales: { min: 1, max: 100_000, maxItems: 8 },
  sqliteWriteOperations: { min: 1, max: 100_000 },
  sqliteWriteConcurrency: { min: 1, max: 16, maxItems: 6 }
});

const MAX_PLANNED_REQUESTS = 1_000_000;
const MAX_CLOSED_LOOP_REQUESTS = 1_000_000;
const MAX_TOTAL_ARTIFACTS = 20_000;
const TAIL_PERCENTILE_MINIMUM = 100;
const MAX_ARTIFACT_MANIFEST_BYTES = 1024 * 1024;
const MAX_SOURCE_ARCHIVE_BYTES = 64 * 1024 * 1024;

function error(code) {
  return new Error(code);
}

function round(value, digits = 3) {
  if (!Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function percentile(sortedValues, percentileValue) {
  if (!sortedValues.length) return null;
  const index = Math.max(
    0,
    Math.min(
      sortedValues.length - 1,
      Math.ceil((percentileValue / 100) * sortedValues.length) - 1
    )
  );
  return sortedValues[index];
}

export function summarizeSamples(values, { tailMinimum = TAIL_PERCENTILE_MINIMUM } = {}) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) {
    return {
      count: 0,
      minMs: null,
      meanMs: null,
      p50Ms: null,
      p95Ms: null,
      p99Ms: null,
      maxMs: null,
      tailPercentilesValid: false
    };
  }
  const tailsValid = sorted.length >= tailMinimum;
  return {
    count: sorted.length,
    minMs: round(sorted[0]),
    meanMs: round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
    p50Ms: round(percentile(sorted, 50)),
    p95Ms: tailsValid ? round(percentile(sorted, 95)) : null,
    p99Ms: tailsValid ? round(percentile(sorted, 99)) : null,
    maxMs: round(sorted.at(-1)),
    tailPercentilesValid: tailsValid
  };
}

export function assertScryptPhaseAccounting({ pressure, server } = {}) {
  const count = server?.scrypt?.count;
  if (!Number.isInteger(count) || count < 0) {
    throw error("performance_scrypt_phase_accounting_invalid");
  }
  if (pressure === "none") {
    if (count !== 0) throw error("performance_scrypt_phase_accounting_invalid");
    return;
  }
  if (pressure !== "scrypt_1hz") {
    throw error("performance_scrypt_phase_accounting_invalid");
  }
}

export function createScryptPhaseTracker() {
  let measurements = [];
  return Object.freeze({
    beginPhase() {
      measurements = [];
    },
    record(value) {
      if (!Number.isFinite(value) || value < 0) {
        throw error("performance_scrypt_measurement_invalid");
      }
      measurements.push(value);
    },
    summarize() {
      return summarizeSamples(measurements);
    }
  });
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function summarizeRepeatMetric(values) {
  const selected = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!selected.length) {
    return { count: 0, min: null, median: null, max: null, rangeOverMedian: null };
  }
  const middle = median(selected);
  return {
    count: selected.length,
    min: round(selected[0]),
    median: round(middle),
    max: round(selected.at(-1)),
    rangeOverMedian: middle === 0 ? null : round((selected.at(-1) - selected[0]) / middle)
  };
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function argValue(argv, name) {
  const inlinePrefix = `${name}=`;
  const inline = argv.find((value) => value.startsWith(inlinePrefix));
  if (inline) return inline.slice(inlinePrefix.length);
  const index = argv.indexOf(name);
  return index >= 0 ? String(argv[index + 1] || "") : "";
}

function integerValue(name, rawValue, fallback, limit) {
  const value = rawValue === undefined || rawValue === "" ? fallback : Number(rawValue);
  if (!Number.isInteger(value)) throw error(`performance_parameter_invalid:${name}`);
  if (value < limit.min || value > limit.max) {
    throw error(`performance_parameter_out_of_range:${name}`);
  }
  return value;
}

function integerList(name, rawValue, fallback, limit) {
  if (rawValue === undefined || rawValue === "") return [...fallback];
  const rawItems = String(rawValue).split(",").map((value) => value.trim());
  if (!rawItems.length || rawItems.some((value) => !value)) {
    throw error(`performance_parameter_invalid:${name}`);
  }
  const values = rawItems.map((value) => Number(value));
  if (values.some((value) => !Number.isInteger(value))) {
    throw error(`performance_parameter_invalid:${name}`);
  }
  const unique = [...new Set(values)];
  if (
    unique.length > limit.maxItems
    || unique.some((value) => value < limit.min || value > limit.max)
  ) {
    throw error(`performance_parameter_out_of_range:${name}`);
  }
  return unique;
}

export function parseBenchmarkConfig({
  argv = process.argv.slice(2),
  env = process.env,
  cwd = process.cwd()
} = {}) {
  const confirmed = argv.includes("--confirm-local-synthetic");
  if (!confirmed) throw error("performance_confirmation_required");
  const outputValue = argValue(argv, "--output");
  if (!outputValue) throw error("performance_output_required");
  const section = argValue(argv, "--section") || "all";
  if (!["all", "http", "sqlite"].includes(section)) {
    throw error("performance_section_invalid");
  }
  if (argv.includes("--allow-overwrite")) {
    throw error("performance_output_overwrite_unsupported");
  }

  const artifactValue = argValue(argv, "--artifact");
  const artifactManifestValue = argValue(argv, "--artifact-manifest");
  const outputPath = resolve(cwd, outputValue);
  const artifactPath = artifactValue ? resolve(cwd, artifactValue) : "";
  const artifactManifestPath = artifactManifestValue
    ? resolve(cwd, artifactManifestValue)
    : "";
  if (outputPath === artifactPath || outputPath === artifactManifestPath) {
    throw error("performance_output_conflicts_with_input");
  }
  const config = {
    confirmed,
    section,
    outputPath,
    allowProvisionalRuntime: argv.includes("--allow-provisional-runtime"),
    expectedCommit: argValue(argv, "--expected-commit").trim().toLowerCase(),
    artifactPath,
    artifactManifestPath,
    httpConcurrency: integerList(
      "PERF_HTTP_CONCURRENCY",
      env.PERF_HTTP_CONCURRENCY,
      DEFAULTS.httpConcurrency,
      LIMITS.httpConcurrency
    ),
    httpRepeats: integerValue(
      "PERF_HTTP_REPEATS",
      env.PERF_HTTP_REPEATS,
      DEFAULTS.httpRepeats,
      LIMITS.httpRepeats
    ),
    httpWarmupMs: integerValue(
      "PERF_HTTP_WARMUP_MS",
      env.PERF_HTTP_WARMUP_MS,
      DEFAULTS.httpWarmupMs,
      LIMITS.httpWarmupMs
    ),
    httpMeasureMs: integerValue(
      "PERF_HTTP_MEASURE_MS",
      env.PERF_HTTP_MEASURE_MS,
      DEFAULTS.httpMeasureMs,
      LIMITS.httpMeasureMs
    ),
    httpFixedRates: integerList(
      "PERF_HTTP_FIXED_RATES",
      env.PERF_HTTP_FIXED_RATES,
      DEFAULTS.httpFixedRates,
      LIMITS.httpFixedRates
    ),
    httpFixedRateDurationMs: integerValue(
      "PERF_HTTP_FIXED_RATE_DURATION_MS",
      env.PERF_HTTP_FIXED_RATE_DURATION_MS,
      DEFAULTS.httpFixedRateDurationMs,
      LIMITS.httpFixedRateDurationMs
    ),
    httpMaxInFlight: integerValue(
      "PERF_HTTP_MAX_IN_FLIGHT",
      env.PERF_HTTP_MAX_IN_FLIGHT,
      DEFAULTS.httpMaxInFlight,
      LIMITS.httpMaxInFlight
    ),
    httpDrainTimeoutMs: integerValue(
      "PERF_HTTP_DRAIN_TIMEOUT_MS",
      env.PERF_HTTP_DRAIN_TIMEOUT_MS,
      DEFAULTS.httpDrainTimeoutMs,
      LIMITS.httpDrainTimeoutMs
    ),
    httpTenants: integerValue(
      "PERF_HTTP_TENANTS",
      env.PERF_HTTP_TENANTS,
      DEFAULTS.httpTenants,
      LIMITS.httpTenants
    ),
    httpArtifactsPerTenant: integerValue(
      "PERF_HTTP_ARTIFACTS_PER_TENANT",
      env.PERF_HTTP_ARTIFACTS_PER_TENANT,
      DEFAULTS.httpArtifactsPerTenant,
      LIMITS.httpArtifactsPerTenant
    ),
    accountScales: integerList(
      "PERF_ACCOUNT_SCALES",
      env.PERF_ACCOUNT_SCALES,
      DEFAULTS.accountScales,
      LIMITS.accountScales
    ),
    sqliteWriteOperations: integerValue(
      "PERF_SQLITE_WRITE_OPERATIONS",
      env.PERF_SQLITE_WRITE_OPERATIONS,
      DEFAULTS.sqliteWriteOperations,
      LIMITS.sqliteWriteOperations
    ),
    sqliteWriteConcurrency: integerList(
      "PERF_SQLITE_WRITE_CONCURRENCY",
      env.PERF_SQLITE_WRITE_CONCURRENCY,
      DEFAULTS.sqliteWriteConcurrency,
      LIMITS.sqliteWriteConcurrency
    ),
    skipScrypt: env.PERF_SKIP_SCRYPT === "true",
    seed: integerValue("PERF_SEED", env.PERF_SEED, 270827, { min: 1, max: 2_147_483_647 })
  };

  if (config.httpTenants * config.httpArtifactsPerTenant > MAX_TOTAL_ARTIFACTS) {
    throw error("performance_parameter_out_of_range:PERF_HTTP_TOTAL_ARTIFACTS");
  }
  for (const rate of config.httpFixedRates) {
    const plannedRequests = Math.floor((rate * config.httpFixedRateDurationMs) / 1000);
    if (plannedRequests < 1 || plannedRequests > MAX_PLANNED_REQUESTS) {
      throw error("performance_parameter_out_of_range:PERF_HTTP_PLANNED_REQUESTS");
    }
  }
  return config;
}

function requireCommit(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!COMMIT_PATTERN.test(normalized)) {
    throw error("performance_expected_commit_invalid");
  }
  return normalized;
}

export function verifyArtifactProvenance({
  manifestPath,
  archivePath,
  expectedSourceCommit
} = {}) {
  const expectedCommit = requireCommit(expectedSourceCommit);
  let manifest;
  let archiveBytes;
  let archiveStats;
  try {
    const manifestStats = lstatSync(manifestPath);
    archiveStats = lstatSync(archivePath);
    if (
      manifestStats.isSymbolicLink()
      || !manifestStats.isFile()
      || manifestStats.size < 1
      || manifestStats.size > MAX_ARTIFACT_MANIFEST_BYTES
    ) {
      throw error("performance_artifact_manifest_file_invalid");
    }
    if (
      archiveStats.isSymbolicLink()
      || !archiveStats.isFile()
      || archiveStats.size < 1
      || archiveStats.size > MAX_SOURCE_ARCHIVE_BYTES
    ) {
      throw error("performance_artifact_archive_file_invalid");
    }
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    archiveBytes = readFileSync(archivePath);
  } catch (caught) {
    if (String(caught?.message || "").startsWith("performance_artifact_")) throw caught;
    throw error("performance_artifact_read_failed");
  }
  if (manifest?.schemaVersion !== "1") {
    throw error("performance_artifact_schema_invalid");
  }
  if (manifest?.releaseUnit !== "control-plane-app") {
    throw error("performance_artifact_release_unit_invalid");
  }
  if (String(manifest?.sourceCommit || "").toLowerCase() !== expectedCommit) {
    throw error("performance_artifact_source_mismatch");
  }
  if (manifest?.artifact?.fileName !== basename(archivePath)) {
    throw error("performance_artifact_filename_mismatch");
  }
  if (manifest?.artifact?.sizeBytes !== archiveStats.size) {
    throw error("performance_artifact_size_mismatch");
  }
  const artifactSha256 = sha256Bytes(archiveBytes);
  if (manifest?.artifact?.sha256 !== artifactSha256) {
    throw error("performance_artifact_sha256_mismatch");
  }
  return {
    mode: "artifact",
    commit: expectedCommit,
    releaseUnit: manifest.releaseUnit,
    artifactFileName: manifest.artifact.fileName,
    artifactSha256,
    artifactSizeBytes: archiveStats.size
  };
}

function runGit(repositoryPath, args) {
  try {
    return execFileSync("git", ["-C", repositoryPath, ...args], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    throw error("performance_git_provenance_failed");
  }
}

function runGitBuffer(repositoryPath, args) {
  try {
    return execFileSync("git", ["-C", repositoryPath, ...args], {
      encoding: null,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    throw error("performance_git_provenance_failed");
  }
}

function gitBlobOid(bytes, objectFormat) {
  return createHash(objectFormat)
    .update(Buffer.from(`blob ${bytes.length}\0`))
    .update(bytes)
    .digest("hex");
}

function nulRecords(buffer) {
  const records = [];
  let start = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] !== 0) continue;
    if (index > start) records.push(buffer.subarray(start, index).toString("utf8"));
    start = index + 1;
  }
  if (start !== buffer.length) throw error("performance_git_record_invalid");
  return records;
}

function verifyExactWorktree({ repositoryPath, commit }) {
  const indexTags = nulRecords(runGitBuffer(repositoryPath, ["ls-files", "-v", "-z"]));
  if (!indexTags.length || indexTags.some((record) => !record.startsWith("H "))) {
    throw error("performance_git_index_flag_invalid");
  }
  try {
    execFileSync("git", ["-C", repositoryPath, "diff", "--cached", "--quiet", commit, "--"], {
      stdio: "ignore"
    });
  } catch {
    throw error("performance_git_index_dirty");
  }
  const objectFormat = runGit(repositoryPath, ["rev-parse", "--show-object-format"]);
  if (!new Set(["sha1", "sha256"]).has(objectFormat)) {
    throw error("performance_git_object_format_invalid");
  }
  const treeRecords = nulRecords(runGitBuffer(repositoryPath, [
    "ls-tree", "-r", "-z", "--full-tree", commit
  ]));
  for (const record of treeRecords) {
    const match = /^(100644|100755) blob ([0-9a-f]+)\t([\s\S]+)$/.exec(record);
    if (!match) throw error("performance_git_tree_entry_invalid");
    const [, mode, oid, path] = match;
    const worktreePath = resolve(repositoryPath, path);
    let stats;
    let bytes;
    try {
      stats = lstatSync(worktreePath);
      bytes = readFileSync(worktreePath);
    } catch {
      throw error("performance_git_worktree_missing");
    }
    if (stats.isSymbolicLink() || !stats.isFile() || stats.nlink < 1) {
      throw error("performance_git_worktree_type_mismatch");
    }
    if (process.platform !== "win32") {
      const executable = (stats.mode & 0o111) !== 0;
      if (executable !== (mode === "100755")) {
        throw error("performance_git_worktree_mode_mismatch");
      }
    }
    if (gitBlobOid(bytes, objectFormat) !== oid) {
      throw error("performance_git_worktree_content_mismatch");
    }
  }
  return { trackedFileCount: treeRecords.length, objectFormat };
}

export function verifyBenchmarkProvenance({
  sourceRoot = SOURCE_ROOT,
  expectedCommit,
  manifestPath,
  archivePath
} = {}) {
  const commit = requireCommit(expectedCommit);
  let root;
  try {
    root = realpathSync(sourceRoot);
  } catch {
    throw error("performance_git_root_invalid");
  }
  let gitRoot;
  try {
    gitRoot = realpathSync(runGit(root, ["rev-parse", "--show-toplevel"]));
  } catch {
    throw error("performance_git_root_invalid");
  }
  if (gitRoot !== root) throw error("performance_git_root_mismatch");
  if (runGit(root, ["rev-parse", "HEAD"]) !== commit) {
    throw error("performance_git_head_mismatch");
  }
  const worktree = verifyExactWorktree({ repositoryPath: root, commit });
  const artifact = verifyArtifactProvenance({
    manifestPath,
    archivePath,
    expectedSourceCommit: commit
  });
  let treeIdentity;
  try {
    treeIdentity = verifyArtifactGitTree({
      artifactPath: archivePath,
      repositoryPath: root,
      expectedCommit: commit,
      excludedPaths: ["config/proxy-servers.json"],
      sourceOnlyBoundary: true
    });
  } catch {
    throw error("performance_artifact_git_tree_mismatch");
  }
  return {
    mode: "git_and_artifact",
    commit,
    tree: runGit(root, ["rev-parse", `${commit}^{tree}`]),
    packageLockSha256: sha256Bytes(readFileSync(resolve(root, "package-lock.json"))),
    harnessSha256: sha256Bytes(readFileSync(resolve(root, "scripts/local-performance-baseline.mjs"))),
    artifactFileName: artifact.artifactFileName,
    artifactSha256: artifact.artifactSha256,
    artifactSizeBytes: artifact.artifactSizeBytes,
    artifactFileCount: treeIdentity.fileCount,
    worktreeFileCount: worktree.trackedFileCount,
    gitObjectFormat: worktree.objectFormat
  };
}

function headerValue(headers, name) {
  const value = headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value.join(",") : String(value || "");
}

export function validateScenarioResponse(scenario, response, { expectedBodySha256 } = {}) {
  if (response?.status !== 200) return { ok: false, error: "unexpected_status" };
  const contentType = headerValue(response.headers, "content-type").toLowerCase();
  const body = Buffer.isBuffer(response.body) ? response.body : Buffer.from(response.body || "");
  if (response.bodyTooLarge) return { ok: false, error: "response_body_too_large" };

  if (scenario === "health_json") {
    if (!contentType.includes("application/json")) {
      return { ok: false, error: "unexpected_content_type" };
    }
    try {
      const parsed = JSON.parse(body.toString("utf8"));
      if (parsed?.ok !== true || parsed?.authRequired !== true || !Number.isFinite(parsed?.ts)) {
        return { ok: false, error: "unexpected_health_body" };
      }
    } catch {
      return { ok: false, error: "unexpected_health_body" };
    }
    return { ok: true };
  }

  if (
    scenario === "subscription_yaml"
    || scenario === "subscription_token_read_yaml"
    || scenario === "subscription_artifact_refresh_write_yaml"
  ) {
    if (!contentType.includes("application/x-yaml")) {
      return { ok: false, error: "unexpected_content_type" };
    }
    if (!headerValue(response.headers, "cache-control").toLowerCase().includes("no-cache")) {
      return { ok: false, error: "unexpected_cache_header" };
    }
    if (!headerValue(response.headers, "x-subscription-expires-at")) {
      return { ok: false, error: "missing_lifecycle_header" };
    }
    if (!body.toString("utf8").includes("proxies:")) {
      return { ok: false, error: "unexpected_subscription_body" };
    }
    if (expectedBodySha256 && sha256Bytes(body) !== expectedBodySha256) {
      return { ok: false, error: "subscription_body_changed" };
    }
    return { ok: true };
  }

  return { ok: false, error: "unknown_scenario" };
}

export function createRateSchedule({ requestsPerSecond, durationMs }) {
  if (!Number.isInteger(requestsPerSecond) || requestsPerSecond <= 0) {
    throw error("performance_rate_invalid");
  }
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw error("performance_duration_invalid");
  }
  const count = Math.floor((requestsPerSecond * durationMs) / 1000);
  if (count < 1) throw error("performance_planned_requests_empty");
  if (count > MAX_PLANNED_REQUESTS) throw error("performance_planned_requests_exceeded");
  const intervalMs = 1000 / requestsPerSecond;
  return Array.from({ length: count }, (_, index) => index * intervalMs);
}

function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw error("performance_interrupted");
}

function sleepWithSignal(milliseconds, signal) {
  throwIfAborted(signal);
  return new Promise((resolveSleep, rejectSleep) => {
    const timer = setTimeout(() => {
      cleanup();
      resolveSleep();
    }, milliseconds);
    const onAbort = () => {
      cleanup();
      rejectSleep(error("performance_interrupted"));
    };
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function incrementCounter(target, key) {
  target[key] = (target[key] || 0) + 1;
}

export async function runScheduledLoad({
  requestsPerSecond,
  durationMs,
  maxInFlight,
  requestFn,
  drainTimeoutMs = 30_000,
  nowFn = () => performance.now(),
  sleepFn = sleep,
  onDispatch = () => {},
  signal = null
} = {}) {
  const schedule = createRateSchedule({ requestsPerSecond, durationMs });
  if (!Number.isInteger(maxInFlight) || maxInFlight <= 0) {
    throw error("performance_max_in_flight_invalid");
  }
  if (typeof requestFn !== "function") throw error("performance_request_function_required");
  const startedAt = nowFn();
  const pending = new Map();
  const dispatchLags = [];
  const serviceLatencies = [];
  const endToEndLatencies = [];
  const statusCodes = {};
  const transportErrors = {};
  const contentErrors = {};
  let nextId = 0;
  let dispatched = 0;
  let completed = 0;
  let validatedSuccess = 0;
  let transportFailed = 0;
  let contentFailed = 0;
  let droppedAtClient = 0;

  for (const offsetMs of schedule) {
    throwIfAborted(signal);
    const scheduledAtMs = startedAt + offsetMs;
    const waitMs = scheduledAtMs - nowFn();
    if (waitMs > 0) {
      if (signal) await sleepWithSignal(waitMs, signal);
      else await sleepFn(waitMs);
    }
    onDispatch({ scheduledAtMs, index: dispatched + droppedAtClient });
    if (pending.size >= maxInFlight) {
      droppedAtClient += 1;
      continue;
    }
    const dispatchAtMs = nowFn();
    dispatchLags.push(Math.max(0, dispatchAtMs - scheduledAtMs));
    dispatched += 1;
    const id = nextId++;
    const state = { aborted: false };
    let dispatchedRequest;
    try {
      dispatchedRequest = requestFn({ scheduledAtMs, dispatchAtMs });
    } catch (caught) {
      dispatchedRequest = Promise.reject(caught);
    }
    const requestPromise = Promise.resolve(dispatchedRequest)
      .then((result) => {
        if (state.aborted) return;
        completed += 1;
        endToEndLatencies.push(Math.max(0, nowFn() - scheduledAtMs));
        if (Number.isFinite(result?.serviceLatencyMs)) {
          serviceLatencies.push(result.serviceLatencyMs);
        }
        if (!result?.ok) {
          transportFailed += 1;
          incrementCounter(transportErrors, result?.error || "transport_error");
          return;
        }
        incrementCounter(statusCodes, String(result.status));
        if (result.validation?.ok !== true) {
          contentFailed += 1;
          incrementCounter(contentErrors, result.validation?.error || "content_validation_failed");
          return;
        }
        validatedSuccess += 1;
      })
      .catch(() => {
        if (state.aborted) return;
        completed += 1;
        transportFailed += 1;
        endToEndLatencies.push(Math.max(0, nowFn() - scheduledAtMs));
        incrementCounter(transportErrors, "request_rejected");
      })
      .finally(() => pending.delete(id));
    state.promise = requestPromise;
    pending.set(id, state);
  }

  const offeredDeadlineMs = startedAt + durationMs;
  const offeredWaitMs = offeredDeadlineMs - nowFn();
  if (offeredWaitMs > 0) {
    if (signal) await sleepWithSignal(offeredWaitMs, signal);
    else await sleepFn(offeredWaitMs);
  }
  throwIfAborted(signal);

  if (pending.size) {
    let drainTimer;
    let abortListener;
    const drainTimeout = new Promise((resolveTimeout) => {
      drainTimer = setTimeout(resolveTimeout, drainTimeoutMs);
    });
    const aborted = new Promise((_, rejectAbort) => {
      if (!signal) return;
      abortListener = () => rejectAbort(error("performance_interrupted"));
      signal.addEventListener("abort", abortListener, { once: true });
    });
    try {
      await Promise.race([
        Promise.allSettled([...pending.values()].map((state) => state.promise)),
        drainTimeout,
        aborted
      ]);
    } finally {
      clearTimeout(drainTimer);
      if (abortListener) signal.removeEventListener("abort", abortListener);
    }
  }
  const drainAborted = pending.size;
  for (const state of pending.values()) state.aborted = true;
  const totalElapsedMs = Math.max(0, nowFn() - startedAt);

  if (schedule.length !== dispatched + droppedAtClient) {
    throw error("performance_scheduled_accounting_invalid");
  }
  if (dispatched !== completed + drainAborted) {
    throw error("performance_completion_accounting_invalid");
  }
  return {
    scheduledRequestsPerSecond: requestsPerSecond,
    scheduled: schedule.length,
    dispatched,
    completed,
    validatedSuccess,
    transportFailed,
    contentFailed,
    droppedAtClient,
    drainAborted,
    offeredWindowMs: durationMs,
    totalElapsedMs: round(totalElapsedMs),
    validatedSuccessPerOfferedSecond: durationMs > 0
      ? round(validatedSuccess / (durationMs / 1000))
      : null,
    completionThroughputPerTotalSecond: totalElapsedMs > 0
      ? round(validatedSuccess / (totalElapsedMs / 1000))
      : null,
    successfulOperationsPerSecond: totalElapsedMs > 0
      ? round(validatedSuccess / (totalElapsedMs / 1000))
      : null,
    statusCodes,
    transportErrors,
    contentErrors,
    dispatchLag: summarizeSamples(dispatchLags),
    serviceLatency: summarizeSamples(serviceLatencies),
    endToEndLatency: summarizeSamples(endToEndLatencies)
  };
}

export function summarizeOperationCounts({ attempted, succeeded, failed, elapsedMs }) {
  if (
    !Number.isInteger(attempted)
    || !Number.isInteger(succeeded)
    || !Number.isInteger(failed)
    || attempted < 0
    || succeeded < 0
    || failed < 0
    || attempted !== succeeded + failed
    || !Number.isFinite(elapsedMs)
    || elapsedMs <= 0
  ) {
    throw error("performance_operation_accounting_invalid");
  }
  return {
    attempted,
    succeeded,
    failed,
    attemptedOperationsPerSecond: round(attempted / (elapsedMs / 1000)),
    successfulOperationsPerSecond: round(succeeded / (elapsedMs / 1000))
  };
}

export function writeReportExclusive(outputPath, report) {
  const resolvedPath = resolve(outputPath);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  if (existsSync(resolvedPath)) {
    if (lstatSync(resolvedPath).isSymbolicLink()) {
      throw error("performance_output_symlink_rejected");
    }
    throw error("performance_output_exists");
  }
  try {
    writeFileSync(
      resolvedPath,
      `${JSON.stringify(report, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" }
    );
  } catch (caught) {
    if (caught?.code === "EEXIST") throw error("performance_output_exists");
    throw caught;
  }
}

function assertOutputPathAvailable(outputPath) {
  if (!existsSync(outputPath)) return;
  if (lstatSync(outputPath).isSymbolicLink()) {
    throw error("performance_output_symlink_rejected");
  }
  throw error("performance_output_exists");
}

export function isDirectInvocation({ argv = process.argv } = {}) {
  if (!argv[1]) return false;
  try {
    return realpathSync(resolve(argv[1])) === realpathSync(SCRIPT_PATH);
  } catch {
    return false;
  }
}

const NOW = "2026-08-27T00:00:00.000Z";
const FUTURE = "2099-01-01T00:00:00.000Z";
const MAX_RESPONSE_BODY_BYTES = 256 * 1024;
const INTERNAL_CHILD_ARG = "--internal-performance-child";
const ACTIVE_CHILDREN = new Set();
const ACTIVE_TEMP_DIRS = new Set();

function removeOwnedTempDirectory(directory) {
  rmSync(directory, { recursive: true, force: true });
  if (existsSync(directory)) throw error("performance_temp_cleanup_failed");
}

async function finalizeOwnedTempDirectories() {
  const directories = [...ACTIVE_TEMP_DIRS];
  if (!directories.length) return;
  for (const directory of directories) removeOwnedTempDirectory(directory);
  await sleep(1000);
  for (const directory of directories) removeOwnedTempDirectory(directory);
  await sleep(100);
  for (const directory of directories) {
    if (existsSync(directory)) throw error("performance_temp_cleanup_failed");
    ACTIVE_TEMP_DIRS.delete(directory);
  }
}

function comparablePath(value) {
  const path = resolve(value);
  return process.platform === "win32" ? path.toLowerCase() : path;
}

function createChildMarker(tempDir) {
  const nonce = randomBytes(24).toString("hex");
  const markerPath = join(tempDir, `.performance-child-${nonce}`);
  writeFileSync(markerPath, nonce, { encoding: "utf8", flag: "wx", mode: 0o600 });
  return nonce;
}

function createChildEnvironment(extra) {
  const environment = { NODE_ENV: "test" };
  for (const name of [
    "PATH",
    "HOME",
    "TMPDIR",
    "TMP",
    "TEMP",
    "LANG",
    "LC_ALL",
    "TZ",
    "SYSTEMROOT",
    "WINDIR",
    "COMSPEC",
    "PATHEXT"
  ]) {
    if (process.env[name]) environment[name] = process.env[name];
  }
  return { ...environment, ...extra };
}

function consumeChildMarker({ tempDir, nonce, prefix }) {
  if (!/^[0-9a-f]{48}$/.test(String(nonce || ""))) {
    throw error("performance_child_nonce_invalid");
  }
  let resolvedTempRoot;
  let resolvedTempDir;
  let directoryStats;
  let unresolvedStats;
  try {
    resolvedTempRoot = realpathSync(tmpdir());
    unresolvedStats = lstatSync(tempDir);
    resolvedTempDir = realpathSync(tempDir);
    directoryStats = statSync(resolvedTempDir);
  } catch {
    throw error("performance_child_temp_invalid");
  }
  if (
    unresolvedStats.isSymbolicLink()
    || !directoryStats.isDirectory()
    || comparablePath(dirname(resolvedTempDir)) !== comparablePath(resolvedTempRoot)
    || !basename(resolvedTempDir).startsWith(prefix)
  ) {
    throw error("performance_child_temp_invalid");
  }
  if (process.platform !== "win32") {
    if ((directoryStats.mode & 0o077) !== 0) throw error("performance_child_temp_not_private");
    if (typeof process.getuid === "function" && directoryStats.uid !== process.getuid()) {
      throw error("performance_child_temp_owner_mismatch");
    }
  }
  const markerPath = join(resolvedTempDir, `.performance-child-${nonce}`);
  let markerStats;
  let markerValue;
  try {
    markerStats = lstatSync(markerPath);
    markerValue = readFileSync(markerPath, "utf8");
  } catch {
    throw error("performance_child_marker_invalid");
  }
  if (
    markerStats.isSymbolicLink()
    || !markerStats.isFile()
    || markerStats.nlink !== 1
    || markerValue !== nonce
  ) {
    throw error("performance_child_marker_invalid");
  }
  if (
    process.platform !== "win32"
    && typeof process.getuid === "function"
    && markerStats.uid !== process.getuid()
  ) {
    throw error("performance_child_marker_owner_mismatch");
  }
  rmSync(markerPath, { force: true });
  return resolvedTempDir;
}

function validateChildDatabasePath(tempDir, databasePath) {
  const expectedPath = resolve(tempDir, "control.sqlite");
  if (comparablePath(databasePath) !== comparablePath(expectedPath)) {
    throw error("performance_child_database_path_invalid");
  }
  let unresolvedStats;
  let resolvedPath;
  try {
    unresolvedStats = lstatSync(expectedPath);
    resolvedPath = realpathSync(expectedPath);
  } catch {
    throw error("performance_child_database_path_invalid");
  }
  if (
    unresolvedStats.isSymbolicLink()
    || !unresolvedStats.isFile()
    || unresolvedStats.nlink !== 1
    || comparablePath(resolvedPath) !== comparablePath(expectedPath)
  ) {
    throw error("performance_child_database_path_invalid");
  }
  if (
    process.platform !== "win32"
    && typeof process.getuid === "function"
    && unresolvedStats.uid !== process.getuid()
  ) {
    throw error("performance_child_database_owner_mismatch");
  }
  return resolvedPath;
}

function safeFileSize(path) {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

function createSyntheticProxyConfig() {
  return {
    servers: [
      {
        name: "synthetic-ss",
        host: "192.0.2.10",
        port: 18388,
        protocol: "ss",
        method: "aes-256-gcm",
        password: "synthetic-ss-secret",
        qualityClass: "stable"
      },
      {
        name: "synthetic-vless",
        host: "192.0.2.11",
        port: 443,
        protocol: "vless",
        uuid: "11111111-1111-4111-8111-111111111111",
        udp: true,
        tls: true,
        serverName: "front.example.test",
        network: "tcp",
        flow: "xtls-rprx-vision",
        realityOpts: {
          publicKey: "synthetic-public-key",
          shortId: "synthetic-short-id"
        },
        qualityClass: "stable"
      },
      {
        name: "synthetic-hy2",
        host: "192.0.2.12",
        port: 10443,
        protocol: "hysteria2",
        password: "synthetic-hy2-secret",
        sni: "hy2.example.test",
        alpn: ["h3"],
        qualityClass: "weak-network"
      },
      {
        name: "synthetic-tuic",
        host: "192.0.2.13",
        port: 10443,
        protocol: "tuic",
        uuid: "22222222-2222-4222-8222-222222222222",
        password: "synthetic-tuic-secret",
        sni: "tuic.example.test",
        alpn: ["h3"],
        qualityClass: "weak-network"
      }
    ],
    pingHosts: [],
    nginx: {}
  };
}

function baseState({ proxyConfig, core }) {
  return {
    rootDir: SOURCE_ROOT,
    host: "127.0.0.1",
    ports: { console: 0, socks: 1080, httpProxy: 18180 },
    consoleToken: "synthetic-console-token",
    proxyConfig,
    subscriptions: {
      core,
      publicSubscriptionBaseUrl: "http://127.0.0.1"
    },
    security: {
      adminAllowedCidrs: ["127.0.0.1/32"],
      trustedProxyCidrs: [],
      subRateLimit: { windowMs: 60 * 60 * 1000, max: 1_000_000_000 },
      subCredentialRateLimit: { windowMs: 60 * 60 * 1000, max: 1_000_000_000 }
    },
    services: {
      ssLocal: { status: () => ({ running: false }) },
      httpProxy: { status: () => ({ running: false }) }
    },
    isPortListening: async () => false,
    runCommand: async () => ({ ok: true, stdout: "", stderr: "", code: 0, timedOut: false })
  };
}

function summarizeEventLoopHistogram(histogram) {
  const count = Number(histogram.count || 0);
  if (!count) {
    return {
      count: 0,
      minMs: null,
      meanMs: null,
      p50Ms: null,
      p95Ms: null,
      p99Ms: null,
      maxMs: null,
      tailPercentilesValid: false
    };
  }
  const tailsValid = count >= TAIL_PERCENTILE_MINIMUM;
  return {
    count,
    minMs: round(histogram.min / 1e6),
    meanMs: round(histogram.mean / 1e6),
    p50Ms: round(histogram.percentile(50) / 1e6),
    p95Ms: tailsValid ? round(histogram.percentile(95) / 1e6) : null,
    p99Ms: tailsValid ? round(histogram.percentile(99) / 1e6) : null,
    maxMs: round(histogram.max / 1e6),
    tailPercentilesValid: tailsValid
  };
}

async function runHttpServerChild() {
  const requestedTempDir = String(process.env.PERF_HTTP_TEMP_DIR || "");
  const tenantCount = Number(process.env.PERF_HTTP_TENANTS);
  const artifactsPerTenant = Number(process.env.PERF_HTTP_ARTIFACTS_PER_TENANT);
  if (
    !requestedTempDir
    || !Number.isInteger(tenantCount)
    || tenantCount < 1
    || tenantCount > LIMITS.httpTenants.max
    || !Number.isInteger(artifactsPerTenant)
    || artifactsPerTenant < 1
    || artifactsPerTenant > LIMITS.httpArtifactsPerTenant.max
    || tenantCount * artifactsPerTenant > MAX_TOTAL_ARTIFACTS
  ) {
    throw error("performance_http_child_configuration_invalid");
  }
  const tempDir = consumeChildMarker({
    tempDir: requestedTempDir,
    nonce: process.env.PERF_CHILD_NONCE,
    prefix: "gccgw-perf-http-r"
  });
  const subscriptionDbPath = join(tempDir, "subscriptions.sqlite");
  const subscriptionStore = createSqliteSubscriptionStore({ dbPath: subscriptionDbPath });
  const proxyConfig = createSyntheticProxyConfig();
  let tenantSequence = 0;
  let artifactSequence = 0;
  const core = createSubscriptionCore({
    store: subscriptionStore,
    proxyConfig,
    publicSubscriptionBaseUrl: "http://127.0.0.1",
    nowFn: () => new Date(NOW),
    idFactory: () => `tenant_synthetic_perf_${++tenantSequence}`,
    artifactIdFactory: () => `artifact_synthetic_perf_${++artifactSequence}`,
    artifactSecretFactory: () => `synthetic-artifact-secret-${artifactSequence + 1}`,
    lastUsedWriteIntervalMs: 60 * 60 * 1000
  });
  const tokenPaths = [];
  const artifactPaths = [];
  for (let tenantIndex = 0; tenantIndex < tenantCount; tenantIndex += 1) {
    const created = core.createTenant({
      displayName: `synthetic-performance-tenant-${tenantIndex + 1}`,
      expiresAt: FUTURE,
      nodeId: "synthetic-ss"
    });
    const subscriptionUrl = new URL(created.subscriptionUrl);
    tokenPaths.push(`${subscriptionUrl.pathname}${subscriptionUrl.search}`);
    for (let artifactIndex = 0; artifactIndex < artifactsPerTenant; artifactIndex += 1) {
      const artifact = core.createSubscriptionArtifact(created.tenant.id);
      artifactPaths.push(new URL(artifact.subscriptionUrl).pathname);
    }
  }

  const app = createApp(baseState({ proxyConfig, core }), {
    clientIpResolver: (request) => request.get("x-perf-client-ip") || "198.51.100.10"
  });
  const histogram = monitorEventLoopDelay({ resolution: 10 });
  histogram.enable();
  let activeSockets = 0;
  let phase = null;
  let scryptTimer = null;
  let scryptInitialTimer = null;
  const scryptPhaseTracker = createScryptPhaseTracker();
  let closing = false;

  const server = app.listen(0, "127.0.0.1", () => {
    const instanceId = sha256Bytes(`${process.pid}:${basename(tempDir)}`).slice(0, 16);
    process.send?.({
      type: "ready",
      port: server.address().port,
      tokenPaths,
      artifactPaths,
      instanceId
    });
  });
  server.on("connection", (socket) => {
    activeSockets += 1;
    if (phase) phase.peakSockets = Math.max(phase.peakSockets, activeSockets);
    socket.on("close", () => {
      activeSockets = Math.max(0, activeSockets - 1);
    });
  });

  function stopScryptPressure() {
    if (scryptTimer) clearInterval(scryptTimer);
    if (scryptInitialTimer) clearTimeout(scryptInitialTimer);
    scryptTimer = null;
    scryptInitialTimer = null;
  }

  function startScryptPressure(intervalMs = 1000) {
    stopScryptPressure();
    scryptPhaseTracker.beginPhase();
    const runOne = () => {
      const started = performance.now();
      scryptSync(
        "synthetic-registration-password",
        Buffer.from("synthetic-salt-0001", "utf8"),
        64,
        { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
      );
      scryptPhaseTracker.record(performance.now() - started);
    };
    scryptInitialTimer = setTimeout(runOne, Math.min(500, Math.max(10, intervalMs / 2)));
    scryptInitialTimer.unref();
    scryptTimer = setInterval(runOne, intervalMs);
    scryptTimer.unref();
  }

  async function closeChild(requestId = null, sendReceipt = false) {
    if (closing) return;
    closing = true;
    stopScryptPressure();
    if (phase?.sampler) clearInterval(phase.sampler);
    phase = null;
    histogram.disable();
    server.closeAllConnections?.();
    await new Promise((resolveClose) => server.close(resolveClose));
    subscriptionStore.close();
    if (sendReceipt && process.connected) {
      await new Promise((resolveSend) => {
        process.send?.({ type: "closed", requestId }, resolveSend);
      });
    }
    if (process.connected) process.disconnect();
  }

  process.on("message", async (message) => {
    if (message?.type === "begin-phase") {
      histogram.reset();
      scryptPhaseTracker.beginPhase();
      const rss = process.memoryUsage().rss;
      phase = {
        requestId: message.requestId,
        startedAt: process.hrtime.bigint(),
        cpuStart: process.cpuUsage(),
        rssStart: rss,
        rssPeak: rss,
        sqliteDbBytesStart: safeFileSize(subscriptionDbPath),
        sqliteWalBytesStart: safeFileSize(`${subscriptionDbPath}-wal`),
        sqliteWalBytesPeak: safeFileSize(`${subscriptionDbPath}-wal`),
        peakSockets: activeSockets,
        sampler: setInterval(() => {
          phase.rssPeak = Math.max(phase.rssPeak, process.memoryUsage().rss);
          phase.sqliteWalBytesPeak = Math.max(
            phase.sqliteWalBytesPeak,
            safeFileSize(`${subscriptionDbPath}-wal`)
          );
          phase.peakSockets = Math.max(phase.peakSockets, activeSockets);
        }, 25)
      };
      phase.sampler.unref();
      process.send?.({ type: "phase-begun", requestId: message.requestId });
      return;
    }
    if (message?.type === "scrypt-start") {
      startScryptPressure(message.intervalMs);
      process.send?.({ type: "scrypt-started", requestId: message.requestId });
      return;
    }
    if (message?.type === "scrypt-stop") {
      stopScryptPressure();
      process.send?.({ type: "scrypt-stopped", requestId: message.requestId });
      return;
    }
    if (message?.type === "end-phase") {
      if (!phase) return;
      clearInterval(phase.sampler);
      const endedAt = process.hrtime.bigint();
      const cpu = process.cpuUsage(phase.cpuStart);
      const wallMicros = Number(endedAt - phase.startedAt) / 1000;
      const rssEnd = process.memoryUsage().rss;
      const sqliteWalBytesEnd = safeFileSize(`${subscriptionDbPath}-wal`);
      const result = {
        wallMs: round(wallMicros / 1000),
        cpuPercentOfOneCore: round(((cpu.user + cpu.system) / wallMicros) * 100),
        cpuUserMs: round(cpu.user / 1000),
        cpuSystemMs: round(cpu.system / 1000),
        rssStartMiB: round(phase.rssStart / 1024 / 1024),
        rssEndMiB: round(rssEnd / 1024 / 1024),
        rssPeakMiB: round(Math.max(phase.rssPeak, rssEnd) / 1024 / 1024),
        sqliteDbBytesStart: phase.sqliteDbBytesStart,
        sqliteDbBytesEnd: safeFileSize(subscriptionDbPath),
        sqliteWalBytesStart: phase.sqliteWalBytesStart,
        sqliteWalBytesEnd,
        sqliteWalBytesPeak: Math.max(phase.sqliteWalBytesPeak, sqliteWalBytesEnd),
        peakSockets: phase.peakSockets,
        eventLoopDelay: summarizeEventLoopHistogram(histogram),
        scrypt: scryptPhaseTracker.summarize()
      };
      phase = null;
      process.send?.({ type: "phase-result", requestId: message.requestId, result });
      return;
    }
    if (message?.type === "close") {
      await closeChild(message.requestId, true);
    }
  });
  process.once("SIGTERM", () => { void closeChild(); });
  process.once("SIGINT", () => { void closeChild(); });
  process.once("disconnect", () => { void closeChild(); });
}

function waitForMessage(child, predicate, timeoutMs = 15_000, signal = null) {
  return new Promise((resolveMessage, rejectMessage) => {
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      child.off("message", onMessage);
      child.off("error", onError);
      child.off("exit", onExit);
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      rejectMessage(error("performance_interrupted"));
    };
    if (signal?.aborted) {
      rejectMessage(error("performance_interrupted"));
      return;
    }
    timer = setTimeout(() => {
      cleanup();
      rejectMessage(error("performance_child_message_timeout"));
    }, timeoutMs);
    const onMessage = (message) => {
      if (!predicate(message)) return;
      cleanup();
      resolveMessage(message);
    };
    const onError = () => {
      cleanup();
      rejectMessage(error("performance_child_error"));
    };
    const onExit = () => {
      cleanup();
      rejectMessage(error("performance_child_early_exit"));
    };
    child.on("message", onMessage);
    child.on("error", onError);
    child.on("exit", onExit);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function childCommand(child, type, extra = {}, timeoutMs = 15_000, signal = null) {
  if (!child.connected) throw error("performance_child_not_connected");
  const requestId = `${type}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const expectedType = {
    "begin-phase": "phase-begun",
    "end-phase": "phase-result",
    "scrypt-start": "scrypt-started",
    "scrypt-stop": "scrypt-stopped",
    close: "closed"
  }[type];
  const pending = waitForMessage(
    child,
    (message) => message?.type === expectedType && message?.requestId === requestId,
    timeoutMs,
    signal
  );
  child.send({ type, requestId, ...extra });
  return pending;
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolveExit) => {
    const timer = setTimeout(() => {
      cleanup();
      resolveExit(false);
    }, timeoutMs);
    const onExit = () => {
      cleanup();
      resolveExit(true);
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.off("exit", onExit);
    };
    child.once("exit", onExit);
  });
}

async function terminateChild(child, { graceful = true } = {}) {
  if (!child) return true;
  if (graceful && child.connected && child.exitCode === null && child.signalCode === null) {
    try {
      await childCommand(child, "close", {}, 5000);
    } catch {
      // Continue through the bounded termination ladder.
    }
  }
  if (await waitForExit(child, 2000)) {
    ACTIVE_CHILDREN.delete(child);
    return true;
  }
  child.kill("SIGTERM");
  if (!(await waitForExit(child, 2000))) {
    child.kill("SIGKILL");
    if (!(await waitForExit(child, 2000))) {
      throw error("performance_child_termination_failed");
    }
  }
  ACTIVE_CHILDREN.delete(child);
  return true;
}

export function performRequest({
  port,
  path,
  scenario,
  agent,
  expectedBodySha256 = null,
  headers = {}
}) {
  return new Promise((resolveRequest) => {
    const startedAt = performance.now();
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolveRequest({
        ...result,
        serviceLatencyMs: performance.now() - startedAt
      });
    };
    const request = httpRequest({
      hostname: "127.0.0.1",
      port,
      path,
      method: "GET",
      agent,
      headers
    }, (response) => {
      const chunks = [];
      let bytes = 0;
      let bodyTooLarge = false;
      const finishResponseFailure = (stableError) => {
        finish({
          ok: false,
          error: stableError,
          status: response.statusCode,
          bytes,
          validation: { ok: false, error: stableError }
        });
      };
      response.on("data", (chunk) => {
        bytes += chunk.length;
        if (!bodyTooLarge && bytes <= MAX_RESPONSE_BODY_BYTES) chunks.push(chunk);
        if (bytes > MAX_RESPONSE_BODY_BYTES && !bodyTooLarge) {
          bodyTooLarge = true;
          finish({
            ok: true,
            status: response.statusCode,
            bytes,
            bodySha256: null,
            validation: { ok: false, error: "response_body_too_large" }
          });
          response.destroy(error("response_body_too_large"));
        }
      });
      response.once("aborted", () => finishResponseFailure("response_aborted"));
      response.once("error", () => {
        if (!bodyTooLarge) finishResponseFailure("response_error");
      });
      response.on("end", () => {
        if (bodyTooLarge) return;
        const body = Buffer.concat(chunks);
        const validation = validateScenarioResponse(scenario, {
          status: response.statusCode,
          headers: response.headers,
          body,
          bodyTooLarge
        }, { expectedBodySha256 });
        finish({
          ok: true,
          status: response.statusCode,
          bytes,
          bodySha256: sha256Bytes(body),
          validation
        });
      });
    });
    request.setTimeout(5000, () => request.destroy(error("request_timeout")));
    request.on("error", (caught) => {
      const stableError = caught?.message === "request_timeout" ? "request_timeout" : "request_error";
      finish({ ok: false, error: stableError, bytes: 0, validation: { ok: false, error: stableError } });
    });
    request.end();
  });
}

function latencyHistogram(values) {
  const boundaries = [0.25, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
  const counts = Object.fromEntries(boundaries.map((boundary) => [`le_${boundary}`, 0]));
  counts.gt_5000 = 0;
  for (const value of values.filter(Number.isFinite)) {
    const boundary = boundaries.find((candidate) => value <= candidate);
    if (boundary === undefined) counts.gt_5000 += 1;
    else counts[`le_${boundary}`] += 1;
  }
  return counts;
}

function createLoadCounters() {
  return {
    attempted: 0,
    validatedSuccess: 0,
    transportFailed: 0,
    contentFailed: 0,
    receivedBytes: 0,
    validatedBytes: 0,
    statusCodes: {},
    transportErrors: {},
    contentErrors: {},
    latencies: [],
    hitTargets: new Set()
  };
}

export function recordResponseBytes(counters, result) {
  const bytes = Number(result?.bytes || 0);
  counters.receivedBytes += bytes;
  if (result?.ok && result.validation?.ok === true) {
    counters.validatedBytes += bytes;
  }
}

function recordLoadResult(counters, result, targetIndex) {
  counters.attempted += 1;
  recordResponseBytes(counters, result);
  counters.hitTargets.add(targetIndex);
  if (Number.isFinite(result?.serviceLatencyMs)) counters.latencies.push(result.serviceLatencyMs);
  if (!result?.ok) {
    counters.transportFailed += 1;
    incrementCounter(counters.transportErrors, result?.error || "transport_error");
    return;
  }
  incrementCounter(counters.statusCodes, String(result.status));
  if (result.validation?.ok !== true) {
    counters.contentFailed += 1;
    incrementCounter(counters.contentErrors, result.validation?.error || "content_validation_failed");
    return;
  }
  counters.validatedSuccess += 1;
}

async function runClosedLoop({
  port,
  paths,
  scenario,
  concurrency,
  durationMs,
  expectedBodySha256 = null,
  signal = null
}) {
  const agent = new HttpAgent({ keepAlive: true, maxSockets: concurrency });
  const counters = createLoadCounters();
  let targetSequence = 0;
  let issued = 0;
  const startedAt = performance.now();
  const deadline = startedAt + durationMs;
  async function lane() {
    while (performance.now() < deadline && issued < MAX_CLOSED_LOOP_REQUESTS) {
      throwIfAborted(signal);
      issued += 1;
      const targetIndex = targetSequence++ % paths.length;
      const result = await performRequest({
        port,
        path: paths[targetIndex],
        scenario,
        agent,
        expectedBodySha256
      });
      recordLoadResult(counters, result, targetIndex);
      throwIfAborted(signal);
    }
  }
  try {
    await Promise.all(Array.from({ length: concurrency }, () => lane()));
  } finally {
    agent.destroy();
  }
  const elapsedMs = performance.now() - startedAt;
  const failed = counters.transportFailed + counters.contentFailed;
  if (issued !== counters.attempted || counters.attempted !== counters.validatedSuccess + failed) {
    throw error("performance_http_accounting_invalid");
  }
  return {
    model: "closed_loop",
    concurrency,
    requestCap: MAX_CLOSED_LOOP_REQUESTS,
    requestCapReached: issued >= MAX_CLOSED_LOOP_REQUESTS,
    elapsedMs: round(elapsedMs),
    ...summarizeOperationCounts({
      attempted: counters.attempted,
      succeeded: counters.validatedSuccess,
      failed,
      elapsedMs
    }),
    transportFailed: counters.transportFailed,
    contentFailed: counters.contentFailed,
    validatedResponseMiBPerSecond: round(
      (counters.validatedBytes / 1024 / 1024) / (elapsedMs / 1000)
    ),
    receivedResponseMiBPerSecond: round(
      (counters.receivedBytes / 1024 / 1024) / (elapsedMs / 1000)
    ),
    uniqueTargetsHit: counters.hitTargets.size,
    statusCodes: counters.statusCodes,
    transportErrors: counters.transportErrors,
    contentErrors: counters.contentErrors,
    serviceLatency: summarizeSamples(counters.latencies),
    serviceLatencyHistogramMs: latencyHistogram(counters.latencies)
  };
}

async function runScheduledHttpLoad({
  port,
  paths,
  scenario,
  requestsPerSecond,
  durationMs,
  maxInFlight,
  drainTimeoutMs,
  expectedBodySha256 = null,
  signal = null
}) {
  const agent = new HttpAgent({ keepAlive: true, maxSockets: maxInFlight });
  let targetSequence = 0;
  const responseBytes = { receivedBytes: 0, validatedBytes: 0 };
  const hitTargets = new Set();
  try {
    const result = await runScheduledLoad({
      requestsPerSecond,
      durationMs,
      maxInFlight,
      drainTimeoutMs,
      signal,
      requestFn: async () => {
        const targetIndex = targetSequence++ % paths.length;
        hitTargets.add(targetIndex);
        const response = await performRequest({
          port,
          path: paths[targetIndex],
          scenario,
          agent,
          expectedBodySha256
        });
        recordResponseBytes(responseBytes, response);
        return response;
      }
    });
    return {
      model: "scheduled_open_loop",
      ...result,
      validatedResponseMiBPerOfferedSecond: result.offeredWindowMs > 0
        ? round(
          (responseBytes.validatedBytes / 1024 / 1024) / (result.offeredWindowMs / 1000)
        )
        : null,
      validatedResponseMiBPerSecond: result.totalElapsedMs > 0
        ? round(
          (responseBytes.validatedBytes / 1024 / 1024) / (result.totalElapsedMs / 1000)
        )
        : null,
      receivedResponseMiBPerSecond: result.totalElapsedMs > 0
        ? round(
          (responseBytes.receivedBytes / 1024 / 1024) / (result.totalElapsedMs / 1000)
        )
        : null,
      uniqueTargetsHit: hitTargets.size
    };
  } finally {
    agent.destroy();
  }
}

function shuffled(values, seed) {
  const output = [...values];
  let state = seed >>> 0;
  for (let index = output.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swapIndex = state % (index + 1);
    [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
  }
  return output;
}

function scenarioPaths(ready) {
  return {
    health_json: ["/api/health"],
    subscription_token_read_yaml: ready.tokenPaths,
    subscription_artifact_refresh_write_yaml: ready.artifactPaths
  };
}

async function calibrateScenarios(ready) {
  const pathsByScenario = scenarioPaths(ready);
  const expectedBodySha256 = {};
  const agent = new HttpAgent({ keepAlive: true, maxSockets: 1 });
  try {
    for (const [scenario, paths] of Object.entries(pathsByScenario)) {
      const result = await performRequest({
        port: ready.port,
        path: paths[0],
        scenario,
        agent
      });
      if (!result.ok || result.validation?.ok !== true || !result.bodySha256) {
        throw error("performance_http_calibration_failed");
      }
      expectedBodySha256[scenario] = result.bodySha256;
    }
  } finally {
    agent.destroy();
  }
  return { pathsByScenario, expectedBodySha256 };
}

function httpCases(config) {
  const cases = [];
  for (const scenario of [
    "health_json",
    "subscription_token_read_yaml",
    "subscription_artifact_refresh_write_yaml"
  ]) {
    for (const concurrency of config.httpConcurrency) {
      cases.push({ model: "closed_loop", scenario, concurrency, pressure: false });
    }
  }
  for (const requestsPerSecond of config.httpFixedRates) {
    cases.push({
      model: "scheduled_open_loop",
      scenario: "health_json",
      requestsPerSecond,
      pressure: false
    });
    if (!config.skipScrypt) {
      cases.push({
        model: "scheduled_open_loop",
        scenario: "health_json",
        requestsPerSecond,
        pressure: true
      });
    }
  }
  return cases;
}

async function runHttpRepeat(config, repeat) {
  const tempDir = mkdtempSync(join(tmpdir(), `gccgw-perf-http-r${repeat}-`));
  ACTIVE_TEMP_DIRS.add(tempDir);
  let child;
  try {
    const childNonce = createChildMarker(tempDir);
    child = fork(SCRIPT_PATH, [INTERNAL_CHILD_ARG], {
      env: createChildEnvironment({
        PERF_CHILD_MODE: "http-server",
        PERF_CHILD_NONCE: childNonce,
        PERF_HTTP_TEMP_DIR: tempDir,
        PERF_HTTP_TENANTS: String(config.httpTenants),
        PERF_HTTP_ARTIFACTS_PER_TENANT: String(config.httpArtifactsPerTenant)
      }),
      stdio: ["ignore", "inherit", "inherit", "ipc"]
    });
    ACTIVE_CHILDREN.add(child);
    const ready = await waitForMessage(
      child,
      (message) => message?.type === "ready",
      60_000,
      config.signal
    );
    const calibration = await calibrateScenarios(ready);
    const cases = shuffled(httpCases(config), config.seed + repeat);
    const runs = [];

    for (let order = 0; order < cases.length; order += 1) {
      throwIfAborted(config.signal);
      const benchmarkCase = cases[order];
      const paths = calibration.pathsByScenario[benchmarkCase.scenario];
      const expectedBodySha256 = calibration.expectedBodySha256[benchmarkCase.scenario];
      const warmup = await runClosedLoop({
        port: ready.port,
        paths,
        scenario: benchmarkCase.scenario,
        concurrency: benchmarkCase.concurrency || 1,
        durationMs: config.httpWarmupMs,
        expectedBodySha256,
        signal: config.signal
      });
      if (warmup.transportFailed || warmup.contentFailed) {
        throw error("performance_http_warmup_failed");
      }

      await childCommand(child, "begin-phase", {}, 15_000, config.signal);
      let pressureStarted = false;
      try {
        if (benchmarkCase.pressure) {
          await childCommand(
            child,
            "scrypt-start",
            { intervalMs: 1000 },
            15_000,
            config.signal
          );
          pressureStarted = true;
        }
        const load = benchmarkCase.model === "closed_loop"
          ? await runClosedLoop({
            port: ready.port,
            paths,
            scenario: benchmarkCase.scenario,
            concurrency: benchmarkCase.concurrency,
            durationMs: config.httpMeasureMs,
            expectedBodySha256,
            signal: config.signal
          })
          : await runScheduledHttpLoad({
            port: ready.port,
            paths,
            scenario: benchmarkCase.scenario,
            requestsPerSecond: benchmarkCase.requestsPerSecond,
            durationMs: config.httpFixedRateDurationMs,
            maxInFlight: config.httpMaxInFlight,
            drainTimeoutMs: config.httpDrainTimeoutMs,
            expectedBodySha256,
            signal: config.signal
          });
        if (pressureStarted) {
          await childCommand(child, "scrypt-stop", {}, 15_000, config.signal);
          pressureStarted = false;
        }
        const server = (
          await childCommand(child, "end-phase", {}, 15_000, config.signal)
        ).result;
        const pressure = benchmarkCase.pressure ? "scrypt_1hz" : "none";
        assertScryptPhaseAccounting({ pressure, server });
        runs.push({
          repeat,
          order,
          instanceId: ready.instanceId,
          tenantCount: config.httpTenants,
          artifactCount: config.httpTenants * config.httpArtifactsPerTenant,
          scenario: benchmarkCase.scenario,
          pressure,
          ...load,
          server
        });
      } finally {
        if (pressureStarted) {
          try {
            await childCommand(child, "scrypt-stop");
          } catch {
            // Child cleanup below is authoritative.
          }
        }
      }
    }
    return runs;
  } finally {
    await terminateChild(child);
    removeOwnedTempDirectory(tempDir);
  }
}

function summarizeHttpRuns(runs) {
  const groups = new Map();
  for (const run of runs) {
    const key = [
      run.model,
      run.scenario,
      run.concurrency || run.scheduledRequestsPerSecond,
      run.pressure
    ].join(":");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(run);
  }
  return [...groups.entries()].map(([key, selected]) => ({
    key,
    repeats: selected.length,
    throughput: summarizeRepeatMetric(selected.map((run) => run.successfulOperationsPerSecond)),
    serviceP50Ms: summarizeRepeatMetric(selected.map((run) => run.serviceLatency?.p50Ms)),
    serviceMaxMs: summarizeRepeatMetric(selected.map((run) => run.serviceLatency?.maxMs)),
    totalTransportFailed: selected.reduce((sum, run) => sum + run.transportFailed, 0),
    totalContentFailed: selected.reduce((sum, run) => sum + run.contentFailed, 0),
    totalDroppedAtClient: selected.reduce((sum, run) => sum + (run.droppedAtClient || 0), 0),
    totalDrainAborted: selected.reduce((sum, run) => sum + (run.drainAborted || 0), 0)
  }));
}

async function runHttpBenchmarks(config) {
  const runs = [];
  for (let repeat = 1; repeat <= config.httpRepeats; repeat += 1) {
    throwIfAborted(config.signal);
    runs.push(...await runHttpRepeat(config, repeat));
  }
  const instanceIds = new Set(runs.map((run) => run.instanceId));
  if (instanceIds.size !== config.httpRepeats) {
    throw error("performance_http_repeat_isolation_failed");
  }
  return {
    isolationUnit: "fresh_child_and_sqlite_per_repeat",
    caseStateWithinRepeat: "shared_runtime_jit_rate_limit_and_sqlite_state",
    caseOrder: "deterministically_shuffled_per_repeat",
    runs,
    summaries: summarizeHttpRuns(runs)
  };
}

function seedAccounts(store, count, signal = null) {
  const startedAt = performance.now();
  store.runInTransaction(() => {
    for (let index = 0; index < count; index += 1) {
      if (index % 100 === 0) throwIfAborted(signal);
      const email = index === count - 1
        ? `duplicate-${count}@example.test`
        : `synthetic-${count}-${index}@example.test`;
      store.createAccount({
        id: `acct_seed_${count}_${String(index).padStart(6, "0")}`,
        ownerRef: `owner_seed_${count}_${String(index).padStart(6, "0")}`,
        status: "active",
        createdAt: NOW,
        updatedAt: NOW,
        metadata: {
          synthetic: true,
          loginRef: email,
          displayRef: email,
          loginDigest: sha256Bytes(email),
          contactDigest: sha256Bytes(email),
          registrationSourceIpDigest: sha256Bytes(
            `198.18.${index % 255}.${Math.floor(index / 255) % 255}`
          )
        }
      });
    }
  });
  return performance.now() - startedAt;
}

function stableErrorCode(caught) {
  return String(caught?.code || caught?.message || "unknown_error")
    .replace(/[^A-Za-z0-9_.:-]/g, "_")
    .slice(0, 100);
}

function measureSync(callback, {
  iterations,
  warmup = 2,
  expectedErrorCode = null,
  signal = null
}) {
  for (let index = 0; index < warmup; index += 1) {
    throwIfAborted(signal);
    try {
      callback(index, true);
      if (expectedErrorCode) throw error("performance_expected_error_missing");
    } catch (caught) {
      if (!expectedErrorCode || caught?.code !== expectedErrorCode) throw caught;
    }
  }
  const latencies = [];
  const expectedOutcomes = {};
  const unexpectedErrors = {};
  let succeeded = 0;
  let failed = 0;
  const cpuStart = process.cpuUsage();
  const startedAt = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    throwIfAborted(signal);
    const operationStarted = performance.now();
    try {
      callback(index, false);
      if (expectedErrorCode) throw error("performance_expected_error_missing");
      succeeded += 1;
    } catch (caught) {
      if (expectedErrorCode && caught?.code === expectedErrorCode) {
        succeeded += 1;
        incrementCounter(expectedOutcomes, expectedErrorCode);
      } else {
        failed += 1;
        incrementCounter(unexpectedErrors, stableErrorCode(caught));
      }
    }
    latencies.push(performance.now() - operationStarted);
  }
  const elapsedMs = performance.now() - startedAt;
  const cpu = process.cpuUsage(cpuStart);
  return {
    elapsedMs: round(elapsedMs),
    ...summarizeOperationCounts({ attempted: iterations, succeeded, failed, elapsedMs }),
    cpuPercentOfOneCore: round(((cpu.user + cpu.system) / 1000 / elapsedMs) * 100),
    expectedOutcomes,
    unexpectedErrors,
    latency: summarizeSamples(latencies),
    latencyHistogramMs: latencyHistogram(latencies)
  };
}

function createRegistrationHarness(store, scale) {
  let accountIndex = 0;
  let credentialIndex = 0;
  const passwordCredentialService = createPortalPasswordCredentialService({
    controlStore: store,
    nowFn: () => NOW,
    saltFactory: () => Buffer.from("synthetic-salt-0001", "utf8"),
    credentialRefFactory: () => `pwd_perf_${scale}_${++credentialIndex}`
  });
  return createPortalRegistrationService({
    controlStore: store,
    userPortalAuth: {
      createPasswordSetupSession: ({ accountId }) => ({
        session: {
          sessionRef: `session_perf_${accountId}`,
          accountId,
          expiresAt: FUTURE
        }
      })
    },
    passwordCredentialService,
    portalAccessRequests: {
      submitRequest: ({ portalUserRef }) => ({
        id: `request_perf_${portalUserRef}`,
        status: "pending"
      })
    },
    nowFn: () => NOW,
    accountIdFactory: () => `acct_registration_perf_${scale}_${++accountIndex}`,
    entitlementIdFactory: ({ accountId }) => `ent_${accountId}`,
    approvalRefFactory: ({ accountId }) => `approval_${accountId}`,
    registrationRiskWindowMs: 24 * 60 * 60 * 1000,
    maxRegistrationsPerSourceIp: 1_000_000
  });
}

function createRegistrationPreflightHarness(store, scale) {
  return createPortalRegistrationService({
    controlStore: store,
    userPortalAuth: {
      createPasswordSetupSession: () => ({ session: { sessionRef: "unreachable" } })
    },
    passwordCredentialService: {
      issueInitialPasswordCredential: () => ({ summary: { status: "unreachable" } })
    },
    portalAccessRequests: {
      submitRequest: () => ({ id: "unreachable", status: "unreachable" })
    },
    nowFn: () => NOW,
    accountIdFactory: () => `acct_preflight_unreachable_${scale}`,
    entitlementIdFactory: () => `ent_preflight_unreachable_${scale}`,
    approvalRefFactory: () => `approval_preflight_unreachable_${scale}`,
    registrationRiskWindowMs: 24 * 60 * 60 * 1000,
    maxRegistrationsPerSourceIp: 0
  });
}

function buildAdminAccountProjection(store) {
  const items = store.listAccounts().map((account) => {
    const summary = store.getAccountControlSummary(account.id);
    return {
      id: account.id,
      status: account.status,
      entitlementCount: summary.entitlements.length,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt
    };
  });
  return JSON.stringify({ items }).length;
}

function registrationInput(scale, index, { duplicate = false } = {}) {
  return {
    email: duplicate
      ? `duplicate-${scale}@example.test`
      : `new-${scale}-${index}@example.test`,
    password: "synthetic-registration-password",
    legalAgreement: {
      termsAccepted: true,
      privacyAccepted: true,
      termsVersion: "2026-07-02",
      privacyVersion: "2026-07-02"
    },
    requestContext: {
      sourceIp: `203.0.113.${(index % 240) + 1}`,
      userAgent: "Synthetic-Performance-Harness/2"
    }
  };
}

function assertNoUnexpectedErrors(results) {
  for (const result of Object.values(results)) {
    if (result?.failed > 0) throw error("performance_sqlite_unexpected_error");
  }
}

function runSqliteScaleBenchmarks(config) {
  const results = [];
  for (const scale of config.accountScales) {
    throwIfAborted(config.signal);
    const tempDir = mkdtempSync(join(tmpdir(), `gccgw-perf-scale-${scale}-`));
    ACTIVE_TEMP_DIRS.add(tempDir);
    const dbPath = join(tempDir, "control.sqlite");
    const initStarted = performance.now();
    const store = createSqliteSubscriptionControlStore({ dbPath });
    const schemaInitMs = performance.now() - initStarted;
    try {
      const seedMs = seedAccounts(store, scale, config.signal);
      const registrations = createRegistrationHarness(store, scale);
      const preflightRegistrations = createRegistrationPreflightHarness(store, scale);
      const measurements = {
        getAccount: measureSync(
          (index) => store.getAccount(
            `acct_seed_${scale}_${String(index % scale).padStart(6, "0")}`
          ),
          { iterations: 2000, warmup: 20, signal: config.signal }
        ),
        listAccounts: measureSync(
          () => store.listAccounts(),
          { iterations: scale >= 5000 ? 20 : 40, warmup: 2, signal: config.signal }
        ),
        duplicateRegistration: measureSync(
          () => registrations.submitRegistration(registrationInput(scale, 0, { duplicate: true })),
          {
            iterations: 20,
            warmup: 2,
            expectedErrorCode: "account_already_exists",
            signal: config.signal
          }
        ),
        registrationMissWithSourcePreflight: measureSync(
          (index) => preflightRegistrations.submitRegistration(
            registrationInput(scale, index + 300000)
          ),
          {
            iterations: 20,
            warmup: 2,
            expectedErrorCode: "registration_rate_limited",
            signal: config.signal
          }
        ),
        loginResolutionTail: measureSync(
          () => store.resolvePortalLoginAccount(`duplicate-${scale}@example.test`),
          { iterations: 20, warmup: 2, signal: config.signal }
        ),
        loginResolutionMiss: measureSync(
          () => store.resolvePortalLoginAccount(`missing-${scale}@example.test`),
          { iterations: 20, warmup: 2, signal: config.signal }
        ),
        adminAccountProjection: measureSync(
          () => buildAdminAccountProjection(store),
          { iterations: scale >= 5000 ? 3 : 5, warmup: 1, signal: config.signal }
        ),
        endToEndRegistration: measureSync(
          (index, warmup) => registrations.submitRegistration(
            registrationInput(scale, index + (warmup ? 100000 : 200000))
          ),
          { iterations: 5, warmup: 1, signal: config.signal }
        )
      };
      assertNoUnexpectedErrors(measurements);
      results.push({
        accountScale: scale,
        schemaInitMs: round(schemaInitMs),
        seedMs: round(seedMs),
        databaseBytes: safeFileSize(dbPath),
        walBytes: safeFileSize(`${dbPath}-wal`),
        ...measurements
      });
    } finally {
      store.close();
      removeOwnedTempDirectory(tempDir);
    }
  }
  return results;
}

async function runDbWriterChild() {
  const requestedTempDir = String(process.env.PERF_CHILD_TEMP_DIR || "");
  const requestedDbPath = String(process.env.PERF_DB_PATH || "");
  const writerId = Number(process.env.PERF_WRITER_ID);
  const operations = Number(process.env.PERF_WRITER_OPERATIONS);
  if (
    !requestedTempDir
    || !requestedDbPath
    || !Number.isInteger(writerId)
    || writerId < 0
    || !Number.isInteger(operations)
    || operations < 0
    || operations > LIMITS.sqliteWriteOperations.max
  ) {
    throw error("performance_db_writer_configuration_invalid");
  }
  const tempDir = consumeChildMarker({
    tempDir: requestedTempDir,
    nonce: process.env.PERF_CHILD_NONCE,
    prefix: "gccgw-perf-contention-"
  });
  const dbPath = validateChildDatabasePath(tempDir, requestedDbPath);
  const store = createSqliteSubscriptionControlStore({ dbPath, initializeSchema: false });
  process.send?.({ type: "ready", writerId });
  process.once("message", (message) => {
    if (message?.type !== "start") return;
    const latencies = [];
    const errors = {};
    let succeeded = 0;
    let failed = 0;
    const startedAt = performance.now();
    for (let index = 0; index < operations; index += 1) {
      const operationStarted = performance.now();
      try {
        const suffix = `${writerId}_${index}`;
        store.createAccount({
          id: `acct_writer_${suffix}`,
          ownerRef: `owner_writer_${suffix}`,
          status: "active",
          createdAt: NOW,
          updatedAt: NOW,
          metadata: { synthetic: true }
        });
        succeeded += 1;
      } catch (caught) {
        failed += 1;
        incrementCounter(errors, stableErrorCode(caught));
      }
      latencies.push(performance.now() - operationStarted);
    }
    const elapsedMs = performance.now() - startedAt;
    store.close();
    const result = {
      type: "result",
      writerId,
      operations,
      succeeded,
      failed,
      elapsedMs,
      latencies,
      errors
    };
    if (process.connected) {
      process.send?.(result, () => process.disconnect());
    }
  });
  process.once("disconnect", () => {
    try {
      store.close();
    } catch {
      // The normal result path already closed it.
    }
  });
}

async function runSqliteContentionBenchmarks(config) {
  const results = [];
  for (const concurrency of config.sqliteWriteConcurrency) {
    throwIfAborted(config.signal);
    const tempDir = mkdtempSync(join(tmpdir(), `gccgw-perf-contention-${concurrency}-`));
    ACTIVE_TEMP_DIRS.add(tempDir);
    const dbPath = join(tempDir, "control.sqlite");
    const initializer = createSqliteSubscriptionControlStore({ dbPath });
    initializer.close();
    const operationsByWriter = Array.from({ length: concurrency }, (_, index) => (
      Math.floor(config.sqliteWriteOperations / concurrency)
      + (index < config.sqliteWriteOperations % concurrency ? 1 : 0)
    ));
    const children = operationsByWriter.map((operations, writerId) => {
      const childNonce = createChildMarker(tempDir);
      const child = fork(SCRIPT_PATH, [INTERNAL_CHILD_ARG], {
        env: createChildEnvironment({
          PERF_CHILD_MODE: "db-writer",
          PERF_CHILD_NONCE: childNonce,
          PERF_CHILD_TEMP_DIR: tempDir,
          PERF_DB_PATH: dbPath,
          PERF_WRITER_ID: String(writerId),
          PERF_WRITER_OPERATIONS: String(operations)
        }),
        stdio: ["ignore", "inherit", "inherit", "ipc"]
      });
      ACTIVE_CHILDREN.add(child);
      return child;
    });
    try {
      await Promise.all(children.map((child) => (
        waitForMessage(child, (message) => message?.type === "ready", 30_000, config.signal)
      )));
      const pendingResults = children.map((child) => (
        waitForMessage(child, (message) => message?.type === "result", 120_000, config.signal)
      ));
      const startedAt = performance.now();
      for (const child of children) child.send({ type: "start" });
      const writerResults = await Promise.all(pendingResults);
      const elapsedMs = performance.now() - startedAt;
      const attempted = writerResults.reduce((sum, result) => sum + result.operations, 0);
      const succeeded = writerResults.reduce((sum, result) => sum + result.succeeded, 0);
      const failed = writerResults.reduce((sum, result) => sum + result.failed, 0);
      const latencies = writerResults.flatMap((result) => result.latencies);
      const errors = {};
      for (const writer of writerResults) {
        for (const [key, count] of Object.entries(writer.errors)) {
          errors[key] = (errors[key] || 0) + count;
        }
      }
      await Promise.all(children.map((child) => terminateChild(child, { graceful: false })));
      const verifier = createSqliteSubscriptionControlStore({ dbPath, initializeSchema: false });
      const persistedAccounts = verifier.listAccounts().length;
      verifier.close();
      const storageInvariantOk = persistedAccounts === succeeded;
      const correctnessOk = storageInvariantOk && failed === 0;
      if (!storageInvariantOk) throw error("performance_sqlite_storage_invariant_failed");
      results.push({
        concurrency,
        elapsedMs: round(elapsedMs),
        ...summarizeOperationCounts({ attempted, succeeded, failed, elapsedMs }),
        failedOperationsPerSecond: round(failed / (elapsedMs / 1000)),
        persistedAccounts,
        storageInvariantOk,
        correctnessOk,
        latency: summarizeSamples(latencies),
        latencyHistogramMs: latencyHistogram(latencies),
        errors,
        databaseBytes: safeFileSize(dbPath),
        walBytes: safeFileSize(`${dbPath}-wal`)
      });
    } finally {
      await Promise.all(children.map((child) => terminateChild(child, { graceful: false })));
      removeOwnedTempDirectory(tempDir);
    }
  }
  return results;
}

function runRateLimiterBenchmarks(config) {
  const results = [];
  for (const bucketCount of [1, 1000, 5000, 10000]) {
    throwIfAborted(config.signal);
    const middleware = createRateLimitMiddleware({
      windowMs: 60 * 60 * 1000,
      max: 1_000_000_000,
      nowFn: () => 1000,
      keyFn: (request) => request.syntheticKey
    });
    const response = {
      set() { return this; },
      status() { return this; },
      json() { return this; }
    };
    for (let index = 0; index < bucketCount; index += 1) {
      if (index % 100 === 0) throwIfAborted(config.signal);
      middleware({ syntheticKey: `bucket_${index}` }, response, () => {});
    }
    results.push({
      bucketCount,
      ...measureSync(
        () => middleware({ syntheticKey: "bucket_0" }, response, () => {}),
        { iterations: 2000, warmup: 20, signal: config.signal }
      )
    });
  }
  return results;
}

function safeReadText(path) {
  try {
    return readFileSync(path, "utf8").trim() || null;
  } catch {
    return null;
  }
}

function filesystemFingerprint(path) {
  try {
    const value = statfsSync(path);
    return {
      type: `0x${Number(value.type).toString(16)}`,
      blockSize: Number(value.bsize),
      blocks: Number(value.blocks),
      blocksAvailable: Number(value.bavail)
    };
  } catch {
    return null;
  }
}

function environmentFingerprint() {
  const cpuInventory = cpus();
  return {
    node: process.version,
    modulesAbi: process.versions.modules,
    platform: platform(),
    release: release(),
    arch: arch(),
    logicalCpuCount: cpuInventory.length,
    cpuModel: cpuInventory[0]?.model || "unknown",
    totalMemoryMiB: Math.round(totalmem() / 1024 / 1024),
    freeMemoryAtStartMiB: Math.round(freemem() / 1024 / 1024),
    loadAverageAtStart: loadavg().map((value) => round(value)),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    cgroup: {
      cpuMax: safeReadText("/sys/fs/cgroup/cpu.max"),
      memoryMax: safeReadText("/sys/fs/cgroup/memory.max")
    },
    filesystems: {
      source: filesystemFingerprint(SOURCE_ROOT),
      temporary: filesystemFingerprint(tmpdir())
    }
  };
}

function verifyRuntimeEnvironment({ allowProvisionalRuntime }) {
  if (process.env.NODE_OPTIONS || process.env.NODE_PATH) {
    throw error("performance_runtime_injection_environment_rejected");
  }
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor !== 22 && !allowProvisionalRuntime) {
    throw error("performance_node22_required");
  }
  const nodeModulesPath = resolve(SOURCE_ROOT, "node_modules");
  let nodeModulesStats;
  try {
    nodeModulesStats = lstatSync(nodeModulesPath);
  } catch {
    throw error("performance_dependencies_missing");
  }
  const nodeModulesSymlink = nodeModulesStats.isSymbolicLink();
  if ((!nodeModulesStats.isDirectory() && !nodeModulesSymlink) || (
    nodeModulesSymlink && !allowProvisionalRuntime
  )) {
    throw error("performance_dependencies_not_clean_tree");
  }
  let dependencyTree;
  let dependencyTreeValid = true;
  try {
    dependencyTree = execFileSync(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["ls", "--all", "--json"],
      {
        cwd: SOURCE_ROOT,
        env: createChildEnvironment({ NODE_ENV: "test" }),
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"]
      }
    );
  } catch (caught) {
    if (!allowProvisionalRuntime) throw error("performance_dependency_tree_invalid");
    dependencyTreeValid = false;
    dependencyTree = String(caught?.stdout || "");
  }
  const hiddenLockPath = resolve(nodeModulesPath, ".package-lock.json");
  return {
    qualification: nodeMajor === 22 && !nodeModulesSymlink && dependencyTreeValid
      ? "node22_observed_dependency_tree"
      : "provisional_nonproduction_runtime",
    nodeMajor,
    nodeModulesSymlink,
    dependencyTreeValid,
    npmDependencyTreeSha256: sha256Bytes(dependencyTree),
    hiddenPackageLockSha256: existsSync(hiddenLockPath)
      ? sha256Bytes(readFileSync(hiddenLockPath))
      : null,
    cleanInstallEvidence: "external_execution_record_required"
  };
}

let INTERRUPTED_EXIT_CODE = null;

function installInterruptHandler(abortController) {
  let interruptedSignal = null;
  const handler = (signal) => {
    if (interruptedSignal) return;
    interruptedSignal = signal;
    INTERRUPTED_EXIT_CODE = signal === "SIGINT" ? 130 : 143;
    abortController.abort(error("performance_interrupted"));
    for (const child of ACTIVE_CHILDREN) {
      try {
        child.kill("SIGTERM");
      } catch {
        // The awaited cleanup ladder in runMain remains authoritative.
      }
    }
  };
  process.once("SIGINT", handler);
  process.once("SIGTERM", handler);
  return {
    get interruptedSignal() { return interruptedSignal; },
    uninstall() {
      process.off("SIGINT", handler);
      process.off("SIGTERM", handler);
    }
  };
}

async function runMain(config) {
  const abortController = new AbortController();
  const interrupt = installInterruptHandler(abortController);
  const executionConfig = { ...config, signal: abortController.signal };
  try {
    assertOutputPathAvailable(config.outputPath);
    const provenance = verifyBenchmarkProvenance({
      sourceRoot: SOURCE_ROOT,
      expectedCommit: config.expectedCommit,
      manifestPath: config.artifactManifestPath,
      archivePath: config.artifactPath
    });
    throwIfAborted(abortController.signal);
    const runtimeQualification = verifyRuntimeEnvironment(config);
    throwIfAborted(abortController.signal);
    const startedAt = new Date().toISOString();
    const report = {
      schemaVersion: 2,
      scope: "local_synthetic_performance_baseline",
      riskTier: "B",
      source: {
        repository: "gccwebos-com/proxy-gateway-minimal",
        releaseUnit: "control-plane-app",
        ...provenance
      },
      environment: environmentFingerprint(),
      runtimeQualification,
      parameters: {
        section: config.section,
        seed: config.seed,
        httpConcurrency: config.httpConcurrency,
        httpRepeats: config.httpRepeats,
        httpWarmupMs: config.httpWarmupMs,
        httpMeasureMs: config.httpMeasureMs,
        httpFixedRates: config.httpFixedRates,
        httpFixedRateDurationMs: config.httpFixedRateDurationMs,
        httpMaxInFlight: config.httpMaxInFlight,
        httpDrainTimeoutMs: config.httpDrainTimeoutMs,
        httpTenants: config.httpTenants,
        httpArtifactsPerTenant: config.httpArtifactsPerTenant,
        accountScales: config.accountScales,
        sqliteWriteOperations: config.sqliteWriteOperations,
        sqliteWriteConcurrency: config.sqliteWriteConcurrency,
        scryptPressureIncluded: !config.skipScrypt
      },
      startedAt,
      http: ["all", "http"].includes(config.section)
        ? await runHttpBenchmarks(executionConfig)
        : null,
      sqliteScale: ["all", "sqlite"].includes(config.section)
        ? runSqliteScaleBenchmarks(executionConfig)
        : null,
      sqliteContention: ["all", "sqlite"].includes(config.section)
        ? await runSqliteContentionBenchmarks(executionConfig)
        : null,
      rateLimiter: ["all", "sqlite"].includes(config.section)
        ? runRateLimiterBenchmarks(executionConfig)
        : null,
      finishedAt: new Date().toISOString(),
      safety: {
        loopbackOnly: true,
        temporarySqliteOnly: true,
        syntheticDataOnly: true,
        responseBodiesRetained: false,
        rawSubscriptionCredentialsRetained: false,
        externalNetworkUsed: false,
        productionMutation: false,
        productionCapacityClaim: false,
        dataPlaneProtocolsMeasured: false
      },
      interpretation: {
        capacityStatus: "not_established",
        benchmarkClass: "control_plane_local_synthetic",
        dedicatedRunnerRequiredForComparableNumbers: true
      }
    };
    throwIfAborted(abortController.signal);
    if (ACTIVE_CHILDREN.size) {
      throw error("performance_resource_cleanup_incomplete");
    }
    await finalizeOwnedTempDirectories();
    throwIfAborted(abortController.signal);
    if (ACTIVE_TEMP_DIRS.size) throw error("performance_resource_cleanup_incomplete");
    writeReportExclusive(config.outputPath, report);
    process.stdout.write(`${JSON.stringify({
      type: "local_performance_baseline",
      ok: true,
      schemaVersion: report.schemaVersion,
      sourceCommit: provenance.commit,
      outputFile: basename(config.outputPath),
      capacityStatus: report.interpretation.capacityStatus
    })}\n`);
    return 0;
  } finally {
    interrupt.uninstall();
    let childCleanupFailed = false;
    for (const child of [...ACTIVE_CHILDREN]) {
      try {
        await terminateChild(child);
      } catch {
        childCleanupFailed = true;
      }
    }
    if (childCleanupFailed || ACTIVE_CHILDREN.size) {
      throw error("performance_child_termination_failed");
    }
    await finalizeOwnedTempDirectories();
  }
}

async function runCli() {
  INTERRUPTED_EXIT_CODE = null;
  try {
    const config = parseBenchmarkConfig();
    return await runMain(config);
  } catch (caught) {
    const stableCode = String(caught?.message || "performance_baseline_failed").startsWith("performance_")
      ? String(caught.message)
      : "performance_baseline_failed";
    process.stderr.write(`${JSON.stringify({
      type: "local_performance_baseline",
      ok: false,
      error: stableCode
    })}\n`);
    return INTERRUPTED_EXIT_CODE || 1;
  }
}

if (isDirectInvocation()) {
  const internalChild = process.argv.includes(INTERNAL_CHILD_ARG)
    && process.connected === true
    && typeof process.send === "function";
  if (internalChild && process.env.PERF_CHILD_MODE === "http-server") {
    await runHttpServerChild();
  } else if (internalChild && process.env.PERF_CHILD_MODE === "db-writer") {
    await runDbWriterChild();
  } else {
    process.exitCode = await runCli();
  }
}
