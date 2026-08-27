#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const INSTANCE_PATTERN = /^[0-9a-f]{16}$/;
const REPORT_LIMIT_BYTES = 16 * 1024 * 1024;
const RUNNER_CLASS = "github_hosted_clean_ephemeral_same_job";
const EXPECTED_SEEDS = Object.freeze([270827, 270828, 270829]);
const EXPECTED_ACCOUNT_SCALES = Object.freeze([100, 1000, 5000, 10000]);
const EXPECTED_HTTP_CONCURRENCY = Object.freeze([1, 8, 32]);
const EXPECTED_HTTP_RATES = Object.freeze([10, 100]);
const EXPECTED_SQLITE_CONCURRENCY = Object.freeze([1, 2, 4, 8]);
const HISTOGRAM_KEYS = Object.freeze([
  "le_0.25",
  "le_0.5",
  "le_1",
  "le_2",
  "le_5",
  "le_10",
  "le_20",
  "le_50",
  "le_100",
  "le_200",
  "le_500",
  "le_1000",
  "le_2000",
  "le_5000",
  "gt_5000"
]);

export class PerformanceReportSetError extends Error {
  constructor(code) {
    super(code);
    this.name = "PerformanceReportSetError";
    this.code = code;
  }
}

function fail(code) {
  throw new PerformanceReportSetError(code);
}

function requireCondition(condition, code) {
  if (!condition) fail(code);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isEmptyObject(value) {
  return isObject(value) && Object.keys(value).length === 0;
}

function isFiniteNonnegative(value) {
  return Number.isFinite(value) && value >= 0;
}

function isFinitePositive(value) {
  return Number.isFinite(value) && value > 0;
}

function isNonnegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function exact(value, expected) {
  return isDeepStrictEqual(value, expected);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function validateSampleSummary(value, { expectedCount = null, requireSamples = false } = {}) {
  requireCondition(isObject(value), "performance_series_sample_summary_invalid");
  requireCondition(isNonnegativeInteger(value.count), "performance_series_sample_summary_invalid");
  if (expectedCount !== null) {
    requireCondition(value.count === expectedCount, "performance_series_sample_count_invalid");
  }
  if (requireSamples) {
    requireCondition(value.count > 0, "performance_series_sample_count_invalid");
  }
  if (value.count === 0) {
    requireCondition(
      value.minMs === null
        && value.meanMs === null
        && value.p50Ms === null
        && value.p95Ms === null
        && value.p99Ms === null
        && value.maxMs === null
        && value.tailPercentilesValid === false,
      "performance_series_empty_sample_summary_invalid"
    );
    return;
  }
  requireCondition(
    isFiniteNonnegative(value.minMs)
      && isFiniteNonnegative(value.meanMs)
      && isFiniteNonnegative(value.p50Ms)
      && isFiniteNonnegative(value.maxMs)
      && value.minMs <= value.p50Ms
      && value.p50Ms <= value.maxMs
      && value.minMs <= value.meanMs
      && value.meanMs <= value.maxMs,
    "performance_series_sample_summary_invalid"
  );
  const tailsExpected = value.count >= 100;
  requireCondition(
    value.tailPercentilesValid === tailsExpected,
    "performance_series_sample_tail_invalid"
  );
  if (tailsExpected) {
    requireCondition(
      isFiniteNonnegative(value.p95Ms)
        && isFiniteNonnegative(value.p99Ms)
        && value.p50Ms <= value.p95Ms
        && value.p95Ms <= value.p99Ms
        && value.p99Ms <= value.maxMs,
      "performance_series_sample_tail_invalid"
    );
  } else {
    requireCondition(
      value.p95Ms === null && value.p99Ms === null,
      "performance_series_sample_tail_invalid"
    );
  }
}

function validateLatencyHistogram(value, expectedCount) {
  requireCondition(isObject(value), "performance_series_latency_histogram_invalid");
  requireCondition(
    exact(Object.keys(value).sort(), [...HISTOGRAM_KEYS].sort()),
    "performance_series_latency_histogram_invalid"
  );
  let total = 0;
  for (const key of HISTOGRAM_KEYS) {
    requireCondition(
      isNonnegativeInteger(value[key]),
      "performance_series_latency_histogram_invalid"
    );
    total += value[key];
  }
  requireCondition(total === expectedCount, "performance_series_latency_histogram_invalid");
}

function validateOperation(value, { attempted, expectedOutcomes = {} } = {}) {
  requireCondition(isObject(value), "performance_series_operation_invalid");
  requireCondition(
    value.attempted === attempted
      && value.succeeded === attempted
      && value.failed === 0
      && isFinitePositive(value.elapsedMs)
      && isFinitePositive(value.attemptedOperationsPerSecond)
      && isFinitePositive(value.successfulOperationsPerSecond)
      && isFiniteNonnegative(value.cpuPercentOfOneCore)
      && exact(value.expectedOutcomes, expectedOutcomes)
      && isEmptyObject(value.unexpectedErrors),
    "performance_series_operation_invalid"
  );
  validateSampleSummary(value.latency, { expectedCount: attempted, requireSamples: true });
  validateLatencyHistogram(value.latencyHistogramMs, attempted);
}

function validateServerEvidence(server, pressure) {
  requireCondition(isObject(server), "performance_series_http_server_invalid");
  requireCondition(
    isFinitePositive(server.wallMs)
      && server.wallMs >= 9_000
      && isFiniteNonnegative(server.cpuPercentOfOneCore)
      && isFiniteNonnegative(server.cpuUserMs)
      && isFiniteNonnegative(server.cpuSystemMs)
      && isFinitePositive(server.rssStartMiB)
      && isFinitePositive(server.rssEndMiB)
      && isFinitePositive(server.rssPeakMiB)
      && server.rssPeakMiB >= server.rssStartMiB
      && server.rssPeakMiB >= server.rssEndMiB
      && isNonnegativeInteger(server.sqliteDbBytesStart)
      && isNonnegativeInteger(server.sqliteDbBytesEnd)
      && isNonnegativeInteger(server.sqliteWalBytesStart)
      && isNonnegativeInteger(server.sqliteWalBytesEnd)
      && isNonnegativeInteger(server.sqliteWalBytesPeak)
      && server.sqliteWalBytesPeak >= server.sqliteWalBytesStart
      && server.sqliteWalBytesPeak >= server.sqliteWalBytesEnd
      && isNonnegativeInteger(server.peakSockets),
    "performance_series_http_server_invalid"
  );
  validateSampleSummary(server.eventLoopDelay, { requireSamples: true });
  validateSampleSummary(server.scrypt, {
    expectedCount: pressure === "none" ? 0 : null,
    requireSamples: pressure === "scrypt_1hz"
  });
}

function validateHttpCommon(run, instanceIds) {
  requireCondition(isObject(run), "performance_series_http_run_invalid");
  requireCondition(
    run.repeat === 1
      && Number.isInteger(run.order)
      && run.order >= 0
      && run.order < 13
      && INSTANCE_PATTERN.test(run.instanceId || "")
      && run.tenantCount === 1
      && run.artifactCount === 1
      && run.transportFailed === 0
      && run.contentFailed === 0
      && isEmptyObject(run.transportErrors)
      && isEmptyObject(run.contentErrors)
      && run.uniqueTargetsHit === 1,
    "performance_series_http_run_invalid"
  );
  instanceIds.add(run.instanceId);
  validateServerEvidence(run.server, run.pressure);
}

function validateClosedLoop(run) {
  requireCondition(
    run.model === "closed_loop"
      && run.pressure === "none"
      && EXPECTED_HTTP_CONCURRENCY.includes(run.concurrency)
      && run.requestCap === 1_000_000
      && run.requestCapReached === false
      && isFinitePositive(run.elapsedMs)
      && run.elapsedMs >= 9_000
      && isPositiveInteger(run.attempted)
      && run.attempted === run.succeeded
      && run.failed === 0
      && isFinitePositive(run.attemptedOperationsPerSecond)
      && isFinitePositive(run.successfulOperationsPerSecond)
      && isFiniteNonnegative(run.validatedResponseMiBPerSecond)
      && isFiniteNonnegative(run.receivedResponseMiBPerSecond)
      && exact(run.statusCodes, { "200": run.attempted }),
    "performance_series_http_closed_loop_invalid"
  );
  validateSampleSummary(run.serviceLatency, {
    expectedCount: run.attempted,
    requireSamples: true
  });
  validateLatencyHistogram(run.serviceLatencyHistogramMs, run.attempted);
}

function validateScheduledOpenLoop(run) {
  const scheduled = run.scheduledRequestsPerSecond * 10;
  requireCondition(
    run.model === "scheduled_open_loop"
      && run.scenario === "health_json"
      && new Set(["none", "scrypt_1hz"]).has(run.pressure)
      && EXPECTED_HTTP_RATES.includes(run.scheduledRequestsPerSecond)
      && run.scheduled === scheduled
      && run.dispatched === scheduled
      && run.completed === scheduled
      && run.validatedSuccess === scheduled
      && run.droppedAtClient === 0
      && run.drainAborted === 0
      && run.offeredWindowMs === 10_000
      && isFinitePositive(run.totalElapsedMs)
      && run.totalElapsedMs >= 9_000
      && isFinitePositive(run.validatedSuccessPerOfferedSecond)
      && isFinitePositive(run.completionThroughputPerTotalSecond)
      && isFinitePositive(run.successfulOperationsPerSecond)
      && isFiniteNonnegative(run.validatedResponseMiBPerOfferedSecond)
      && isFiniteNonnegative(run.validatedResponseMiBPerSecond)
      && isFiniteNonnegative(run.receivedResponseMiBPerSecond)
      && exact(run.statusCodes, { "200": scheduled }),
    "performance_series_http_schedule_invalid"
  );
  validateSampleSummary(run.dispatchLag, { expectedCount: scheduled, requireSamples: true });
  validateSampleSummary(run.serviceLatency, { expectedCount: scheduled, requireSamples: true });
  validateSampleSummary(run.endToEndLatency, { expectedCount: scheduled, requireSamples: true });
}

function httpCaseKey(run) {
  const load = run.model === "closed_loop"
    ? run.concurrency
    : run.scheduledRequestsPerSecond;
  return `${run.model}:${run.scenario}:${load}:${run.pressure}`;
}

function expectedHttpCaseKeys() {
  const keys = [];
  for (const scenario of [
    "health_json",
    "subscription_token_read_yaml",
    "subscription_artifact_refresh_write_yaml"
  ]) {
    for (const concurrency of EXPECTED_HTTP_CONCURRENCY) {
      keys.push(`closed_loop:${scenario}:${concurrency}:none`);
    }
  }
  for (const rate of EXPECTED_HTTP_RATES) {
    keys.push(`scheduled_open_loop:health_json:${rate}:none`);
    keys.push(`scheduled_open_loop:health_json:${rate}:scrypt_1hz`);
  }
  return keys;
}

function repeatMetric(value) {
  return {
    count: 1,
    min: value,
    median: value,
    max: value,
    rangeOverMedian: value === 0 ? null : 0
  };
}

function validateHttpSummary(summary, run) {
  const expected = {
    key: httpCaseKey(run),
    repeats: 1,
    throughput: repeatMetric(run.successfulOperationsPerSecond),
    serviceP50Ms: repeatMetric(run.serviceLatency.p50Ms),
    serviceMaxMs: repeatMetric(run.serviceLatency.maxMs),
    totalTransportFailed: 0,
    totalContentFailed: 0,
    totalDroppedAtClient: 0,
    totalDrainAborted: 0
  };
  requireCondition(exact(summary, expected), "performance_series_http_summary_invalid");
}

function validateHttp(reportHttp) {
  requireCondition(
    isObject(reportHttp)
      && reportHttp.isolationUnit === "fresh_child_and_sqlite_per_repeat"
      && reportHttp.caseStateWithinRepeat === "shared_runtime_jit_rate_limit_and_sqlite_state"
      && reportHttp.caseOrder === "deterministically_shuffled_per_repeat"
      && Array.isArray(reportHttp.runs)
      && reportHttp.runs.length === 13
      && Array.isArray(reportHttp.summaries)
      && reportHttp.summaries.length === 13,
    "performance_series_http_matrix_invalid"
  );
  const expectedKeys = expectedHttpCaseKeys();
  const expectedSet = new Set(expectedKeys);
  const seenKeys = new Set();
  const seenOrders = new Set();
  const instanceIds = new Set();
  const runsByKey = new Map();
  for (const run of reportHttp.runs) {
    validateHttpCommon(run, instanceIds);
    if (run.model === "closed_loop") validateClosedLoop(run);
    else if (run.model === "scheduled_open_loop") validateScheduledOpenLoop(run);
    else fail("performance_series_http_model_invalid");
    const key = httpCaseKey(run);
    requireCondition(expectedSet.has(key) && !seenKeys.has(key), "performance_series_http_matrix_invalid");
    requireCondition(!seenOrders.has(run.order), "performance_series_http_order_invalid");
    seenKeys.add(key);
    seenOrders.add(run.order);
    runsByKey.set(key, run);
  }
  requireCondition(
    exact([...seenKeys].sort(), [...expectedKeys].sort())
      && exact([...seenOrders].sort((left, right) => left - right), Array.from({ length: 13 }, (_, index) => index))
      && instanceIds.size === 1,
    "performance_series_http_matrix_invalid"
  );
  const seenSummaries = new Set();
  for (const summary of reportHttp.summaries) {
    requireCondition(isObject(summary) && expectedSet.has(summary.key), "performance_series_http_summary_invalid");
    requireCondition(!seenSummaries.has(summary.key), "performance_series_http_summary_invalid");
    seenSummaries.add(summary.key);
    validateHttpSummary(summary, runsByKey.get(summary.key));
  }
  requireCondition(
    exact([...seenSummaries].sort(), [...expectedKeys].sort()),
    "performance_series_http_summary_invalid"
  );
  return [...instanceIds][0];
}

function validateSqliteScale(rows) {
  requireCondition(
    Array.isArray(rows)
      && exact(rows.map((row) => row?.accountScale), EXPECTED_ACCOUNT_SCALES),
    "performance_series_sqlite_scale_matrix_invalid"
  );
  for (const row of rows) {
    const longScale = row.accountScale >= 5_000;
    requireCondition(
      isFiniteNonnegative(row.schemaInitMs)
        && isFinitePositive(row.seedMs)
        && isPositiveInteger(row.databaseBytes)
        && isNonnegativeInteger(row.walBytes),
      "performance_series_sqlite_scale_invalid"
    );
    validateOperation(row.getAccount, { attempted: 2_000 });
    validateOperation(row.listAccounts, { attempted: longScale ? 20 : 40 });
    validateOperation(row.duplicateRegistration, {
      attempted: 20,
      expectedOutcomes: { account_already_exists: 20 }
    });
    validateOperation(row.registrationMissWithSourcePreflight, {
      attempted: 20,
      expectedOutcomes: { registration_rate_limited: 20 }
    });
    validateOperation(row.loginResolutionTail, { attempted: 20 });
    validateOperation(row.loginResolutionMiss, { attempted: 20 });
    validateOperation(row.adminAccountProjection, { attempted: longScale ? 3 : 5 });
    validateOperation(row.endToEndRegistration, { attempted: 5 });
  }
}

function validateSqliteContention(rows) {
  requireCondition(
    Array.isArray(rows)
      && exact(rows.map((row) => row?.concurrency), EXPECTED_SQLITE_CONCURRENCY),
    "performance_series_sqlite_contention_matrix_invalid"
  );
  for (const row of rows) {
    requireCondition(
      isFinitePositive(row.elapsedMs)
        && row.attempted === 8_000
        && row.succeeded === 8_000
        && row.failed === 0
        && isFinitePositive(row.attemptedOperationsPerSecond)
        && isFinitePositive(row.successfulOperationsPerSecond)
        && row.failedOperationsPerSecond === 0
        && row.persistedAccounts === 8_000
        && row.storageInvariantOk === true
        && row.correctnessOk === true
        && isEmptyObject(row.errors)
        && isPositiveInteger(row.databaseBytes)
        && isNonnegativeInteger(row.walBytes),
      "performance_series_sqlite_contention_invalid"
    );
    validateSampleSummary(row.latency, { expectedCount: 8_000, requireSamples: true });
    validateLatencyHistogram(row.latencyHistogramMs, 8_000);
  }
}

function validateRateLimiter(rows) {
  const buckets = [1, 1_000, 5_000, 10_000];
  requireCondition(
    Array.isArray(rows) && exact(rows.map((row) => row?.bucketCount), buckets),
    "performance_series_rate_limiter_matrix_invalid"
  );
  for (const row of rows) validateOperation(row, { attempted: 2_000 });
}

function validateSource(source, expectedCommit) {
  requireCondition(
    isObject(source)
      && source.repository === "gccwebos-com/proxy-gateway-minimal"
      && source.releaseUnit === "control-plane-app"
      && source.mode === "git_and_artifact"
      && source.commit === expectedCommit
      && source.gitObjectFormat === "sha1"
      && /^[0-9a-f]{40}$/.test(source.tree || "")
      && SHA256_PATTERN.test(source.packageLockSha256 || "")
      && SHA256_PATTERN.test(source.harnessSha256 || "")
      && source.artifactFileName === `proxy-gateway-${expectedCommit.slice(0, 12)}.zip`
      && SHA256_PATTERN.test(source.artifactSha256 || "")
      && isPositiveInteger(source.artifactSizeBytes)
      && isPositiveInteger(source.artifactFileCount)
      && isPositiveInteger(source.worktreeFileCount),
    "performance_series_source_invalid"
  );
}

function validateRuntime(runtime) {
  requireCondition(
    isObject(runtime)
      && runtime.qualification === "node22_observed_dependency_tree"
      && runtime.nodeMajor === 22
      && runtime.nodeModulesSymlink === false
      && runtime.dependencyTreeValid === true
      && SHA256_PATTERN.test(runtime.npmDependencyTreeSha256 || "")
      && SHA256_PATTERN.test(runtime.hiddenPackageLockSha256 || "")
      && runtime.cleanInstallEvidence === "external_execution_record_required",
    "performance_series_runtime_invalid"
  );
}

function validateFilesystem(value) {
  return isObject(value)
    && /^0x[0-9a-f]+$/.test(value.type || "")
    && isPositiveInteger(value.blockSize)
    && isPositiveInteger(value.blocks)
    && isNonnegativeInteger(value.blocksAvailable)
    && value.blocksAvailable <= value.blocks;
}

function validateEnvironment(environment) {
  requireCondition(
    isObject(environment)
      && environment.node === "v22.23.1"
      && /^[1-9][0-9]*$/.test(environment.modulesAbi || "")
      && environment.platform === "linux"
      && typeof environment.release === "string"
      && environment.release.length > 0
      && environment.arch === "x64"
      && isPositiveInteger(environment.logicalCpuCount)
      && typeof environment.cpuModel === "string"
      && environment.cpuModel.length > 0
      && environment.cpuModel !== "unknown"
      && isPositiveInteger(environment.totalMemoryMiB)
      && isNonnegativeInteger(environment.freeMemoryAtStartMiB)
      && Array.isArray(environment.loadAverageAtStart)
      && environment.loadAverageAtStart.length === 3
      && environment.loadAverageAtStart.every(isFiniteNonnegative)
      && typeof environment.timezone === "string"
      && environment.timezone.length > 0
      && isObject(environment.cgroup)
      && typeof environment.cgroup.cpuMax === "string"
      && environment.cgroup.cpuMax.length > 0
      && typeof environment.cgroup.memoryMax === "string"
      && environment.cgroup.memoryMax.length > 0
      && isObject(environment.filesystems)
      && validateFilesystem(environment.filesystems.source)
      && validateFilesystem(environment.filesystems.temporary),
    "performance_series_environment_invalid"
  );
}

function stableEnvironment(environment) {
  return {
    node: environment.node,
    modulesAbi: environment.modulesAbi,
    platform: environment.platform,
    release: environment.release,
    arch: environment.arch,
    logicalCpuCount: environment.logicalCpuCount,
    cpuModel: environment.cpuModel,
    totalMemoryMiB: environment.totalMemoryMiB,
    timezone: environment.timezone,
    cgroup: environment.cgroup,
    sourceFilesystem: {
      type: environment.filesystems.source.type,
      blockSize: environment.filesystems.source.blockSize,
      blocks: environment.filesystems.source.blocks
    },
    temporaryFilesystem: {
      type: environment.filesystems.temporary.type,
      blockSize: environment.filesystems.temporary.blockSize,
      blocks: environment.filesystems.temporary.blocks
    }
  };
}

function validateParameters(parameters, expectedSeed) {
  requireCondition(
    isObject(parameters)
      && parameters.section === "all"
      && parameters.seed === expectedSeed
      && exact(parameters.httpConcurrency, EXPECTED_HTTP_CONCURRENCY)
      && parameters.httpRepeats === 1
      && parameters.httpWarmupMs === 400
      && parameters.httpMeasureMs === 10_000
      && exact(parameters.httpFixedRates, EXPECTED_HTTP_RATES)
      && parameters.httpFixedRateDurationMs === 10_000
      && parameters.httpMaxInFlight === 128
      && parameters.httpDrainTimeoutMs === 10_000
      && parameters.httpTenants === 1
      && parameters.httpArtifactsPerTenant === 1
      && exact(parameters.accountScales, EXPECTED_ACCOUNT_SCALES)
      && parameters.sqliteWriteOperations === 8_000
      && exact(parameters.sqliteWriteConcurrency, EXPECTED_SQLITE_CONCURRENCY)
      && parameters.scryptPressureIncluded === true,
    "performance_series_parameters_invalid"
  );
}

function validateSafety(report) {
  requireCondition(
    exact(report.safety, {
      loopbackOnly: true,
      temporarySqliteOnly: true,
      syntheticDataOnly: true,
      responseBodiesRetained: false,
      rawSubscriptionCredentialsRetained: false,
      externalNetworkUsed: false,
      productionMutation: false,
      productionCapacityClaim: false,
      dataPlaneProtocolsMeasured: false
    })
      && exact(report.interpretation, {
        capacityStatus: "not_established",
        benchmarkClass: "control_plane_local_synthetic",
        dedicatedRunnerRequiredForComparableNumbers: true
      }),
    "performance_series_safety_invalid"
  );
}

function parseIsoTime(value) {
  if (typeof value !== "string") return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) return null;
  return milliseconds;
}

function normalizeExecution(execution, reports) {
  requireCondition(isObject(execution), "performance_series_execution_invalid");
  requireCondition(
    execution.node === "v22.23.1"
      && execution.node === reports[0].environment.node
      && execution.modulesAbi === reports[0].environment.modulesAbi
      && typeof execution.npm === "string"
      && execution.npm.length > 0
      && execution.githubActions === true
      && execution.runnerOs === "Linux"
      && execution.runnerArch === "X64"
      && isPositiveInteger(execution.workflowRunId)
      && isPositiveInteger(execution.workflowRunAttempt),
    "performance_series_execution_invalid"
  );
  return execution;
}

export function validatePerformanceReportSet({
  expectedCommit,
  releaseRunId,
  reportInputs,
  execution
} = {}) {
  const commit = String(expectedCommit || "").trim().toLowerCase();
  requireCondition(COMMIT_PATTERN.test(commit), "performance_series_commit_invalid");
  requireCondition(isPositiveInteger(releaseRunId), "performance_series_release_run_id_invalid");
  requireCondition(
    Array.isArray(reportInputs) && reportInputs.length === 3,
    "performance_series_report_count_invalid"
  );
  const fileNames = new Set();
  const reports = [];
  const digests = [];
  for (const input of reportInputs) {
    requireCondition(
      isObject(input)
        && typeof input.fileName === "string"
        && input.fileName.length > 0
        && Buffer.isBuffer(input.bytes)
        && input.bytes.length > 0
        && input.bytes.length <= REPORT_LIMIT_BYTES,
      "performance_series_report_input_invalid"
    );
    requireCondition(!fileNames.has(input.fileName), "performance_series_report_input_invalid");
    fileNames.add(input.fileName);
    let parsed;
    try {
      parsed = JSON.parse(input.bytes);
    } catch {
      fail("performance_series_report_json_invalid");
    }
    requireCondition(isObject(parsed), "performance_series_report_json_invalid");
    if (input.report !== undefined) {
      requireCondition(
        isObject(input.report) && exact(input.report, parsed),
        "performance_series_report_bytes_mismatch"
      );
    }
    reports.push(parsed);
    digests.push({ fileName: input.fileName, sha256: sha256(input.bytes) });
  }

  let sourceIdentity = null;
  let runtimeIdentity = null;
  let environmentIdentity = null;
  const instanceIds = new Set();
  let previousFinish = null;
  for (const [index, report] of reports.entries()) {
    requireCondition(
      report.schemaVersion === 2
        && report.scope === "local_synthetic_performance_baseline"
        && report.riskTier === "B",
      "performance_series_schema_invalid"
    );
    validateSource(report.source, commit);
    validateRuntime(report.runtimeQualification);
    validateEnvironment(report.environment);
    validateParameters(report.parameters, EXPECTED_SEEDS[index]);
    validateSafety(report);
    if (sourceIdentity === null) sourceIdentity = report.source;
    else requireCondition(exact(report.source, sourceIdentity), "performance_series_source_identity_mismatch");
    if (runtimeIdentity === null) runtimeIdentity = report.runtimeQualification;
    else requireCondition(
      exact(report.runtimeQualification, runtimeIdentity),
      "performance_series_runtime_identity_mismatch"
    );
    const currentEnvironment = stableEnvironment(report.environment);
    if (environmentIdentity === null) environmentIdentity = currentEnvironment;
    else requireCondition(
      exact(currentEnvironment, environmentIdentity),
      "performance_series_environment_identity_mismatch"
    );

    const start = parseIsoTime(report.startedAt);
    const finish = parseIsoTime(report.finishedAt);
    requireCondition(
      start !== null
        && finish !== null
        && finish > start
        && (previousFinish === null || start >= previousFinish),
      "performance_series_time_invalid"
    );
    previousFinish = finish;

    instanceIds.add(validateHttp(report.http));
    validateSqliteScale(report.sqliteScale);
    validateSqliteContention(report.sqliteContention);
    validateRateLimiter(report.rateLimiter);
  }
  requireCondition(instanceIds.size === 3, "performance_series_http_isolation_invalid");
  const runtime = normalizeExecution(execution, reports);
  return {
    schemaVersion: 1,
    type: "synthetic_performance_baseline_receipt",
    sourceCommit: commit,
    releaseArtifactRunId: releaseRunId,
    workflowRunId: runtime.workflowRunId,
    workflowRunAttempt: runtime.workflowRunAttempt,
    runtime: {
      node: runtime.node,
      modulesAbi: runtime.modulesAbi,
      npm: runtime.npm,
      qualification: "node22_observed_dependency_tree",
      cleanInstallCommand: "npm ci --no-audit --no-fund",
      nodeModulesSymlink: false,
      runnerClass: RUNNER_CLASS
    },
    reports: digests,
    hardGatesPassed: true,
    stagingDecisionStatus: "awaiting_policy_and_report_analysis",
    productionCapacityEstablished: false,
    productionTouched: false
  };
}

function parsePositiveInteger(value, code) {
  const normalized = String(value || "");
  requireCondition(/^[1-9][0-9]{0,15}$/.test(normalized), code);
  const parsed = Number(normalized);
  requireCondition(isPositiveInteger(parsed), code);
  return parsed;
}

export function parsePerformanceReportSetArgs(argv = []) {
  requireCondition(Array.isArray(argv), "performance_series_cli_invalid");
  const values = { reports: [] };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    requireCondition(typeof value === "string" && value.length > 0, "performance_series_cli_invalid");
    if (flag === "--report") {
      values.reports.push(value);
      continue;
    }
    const key = new Map([
      ["--expected-commit", "expectedCommit"],
      ["--release-run-id", "releaseRunId"],
      ["--output", "output"]
    ]).get(flag);
    requireCondition(key && values[key] === undefined, "performance_series_cli_invalid");
    values[key] = value;
  }
  requireCondition(
    values.expectedCommit
      && values.releaseRunId
      && values.output
      && values.reports.length === 3,
    "performance_series_cli_invalid"
  );
  return {
    expectedCommit: String(values.expectedCommit).trim().toLowerCase(),
    releaseRunId: parsePositiveInteger(
      values.releaseRunId,
      "performance_series_release_run_id_invalid"
    ),
    reportPaths: values.reports,
    outputPath: values.output
  };
}

function readReportInputs(paths) {
  const identities = new Set();
  return paths.map((path) => {
    let stats;
    let resolved;
    let bytes;
    try {
      stats = lstatSync(resolve(path));
      requireCondition(
        stats.isFile()
          && !stats.isSymbolicLink()
          && stats.nlink === 1
          && stats.size > 0
          && stats.size <= REPORT_LIMIT_BYTES,
        "performance_series_report_file_invalid"
      );
      resolved = realpathSync(resolve(path));
      const identity = `${stats.dev}:${stats.ino}`;
      requireCondition(!identities.has(identity), "performance_series_report_file_invalid");
      identities.add(identity);
      bytes = readFileSync(resolved);
      requireCondition(bytes.length === stats.size, "performance_series_report_file_invalid");
    } catch (caught) {
      if (caught instanceof PerformanceReportSetError) throw caught;
      fail("performance_series_report_file_invalid");
    }
    return { fileName: basename(resolved), bytes };
  });
}

function executionFromRuntime({ env, runtime }) {
  let npm;
  try {
    npm = execFileSync("npm", ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    fail("performance_series_execution_invalid");
  }
  return {
    node: runtime.node,
    modulesAbi: runtime.modulesAbi,
    npm,
    githubActions: env.GITHUB_ACTIONS === "true",
    runnerOs: env.RUNNER_OS,
    runnerArch: env.RUNNER_ARCH,
    workflowRunId: parsePositiveInteger(
      env.GITHUB_RUN_ID,
      "performance_series_execution_invalid"
    ),
    workflowRunAttempt: parsePositiveInteger(
      env.GITHUB_RUN_ATTEMPT,
      "performance_series_execution_invalid"
    )
  };
}

export function runPerformanceReportSetCli({
  argv = process.argv.slice(2),
  env = process.env,
  runtime = { node: process.version, modulesAbi: process.versions.modules },
  stdout = process.stdout,
  stderr = process.stderr,
  execution = null
} = {}) {
  try {
    const options = parsePerformanceReportSetArgs(argv);
    const reportInputs = readReportInputs(options.reportPaths);
    const receipt = validatePerformanceReportSet({
      expectedCommit: options.expectedCommit,
      releaseRunId: options.releaseRunId,
      reportInputs,
      execution: execution || executionFromRuntime({ env, runtime })
    });
    try {
      writeFileSync(
        resolve(options.outputPath),
        `${JSON.stringify(receipt, null, 2)}\n`,
        { flag: "wx", mode: 0o600 }
      );
    } catch {
      fail("performance_series_receipt_write_failed");
    }
    stdout.write(`${JSON.stringify({
      type: receipt.type,
      ok: true,
      sourceCommit: receipt.sourceCommit,
      reportCount: receipt.reports.length,
      productionCapacityEstablished: false
    })}\n`);
    return 0;
  } catch (caught) {
    const code = caught instanceof PerformanceReportSetError
      ? caught.code
      : "performance_report_set_failed";
    stderr.write(`${JSON.stringify({
      type: "synthetic_performance_baseline_receipt",
      ok: false,
      error: code
    })}\n`);
    return 1;
  }
}

const direct = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (direct) process.exitCode = runPerformanceReportSetCli();
