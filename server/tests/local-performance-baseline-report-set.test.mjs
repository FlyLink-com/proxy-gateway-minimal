import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  parsePerformanceReportSetArgs,
  runPerformanceReportSetCli,
  validatePerformanceReportSet
} from "../../scripts/local-performance-baseline-report-set.mjs";

const COMMIT = "a".repeat(40);
const HASH = "b".repeat(64);
const HISTOGRAM_KEYS = [
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
];

function sampleSummary(count, milliseconds = 1) {
  if (count === 0) {
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
  return {
    count,
    minMs: milliseconds,
    meanMs: milliseconds,
    p50Ms: milliseconds,
    p95Ms: count >= 100 ? milliseconds : null,
    p99Ms: count >= 100 ? milliseconds : null,
    maxMs: milliseconds,
    tailPercentilesValid: count >= 100
  };
}

function histogram(count) {
  return Object.fromEntries(
    HISTOGRAM_KEYS.map((key) => [key, key === "le_1" ? count : 0])
  );
}

function operation(attempted, expectedOutcomes = {}) {
  return {
    elapsedMs: 10,
    attempted,
    succeeded: attempted,
    failed: 0,
    attemptedOperationsPerSecond: attempted / 0.01,
    successfulOperationsPerSecond: attempted / 0.01,
    cpuPercentOfOneCore: 50,
    expectedOutcomes,
    unexpectedErrors: {},
    latency: sampleSummary(attempted),
    latencyHistogramMs: histogram(attempted)
  };
}

function serverEvidence(pressure) {
  return {
    wallMs: 10_001,
    cpuPercentOfOneCore: 80,
    cpuUserMs: 8_000,
    cpuSystemMs: 100,
    rssStartMiB: 100,
    rssEndMiB: 105,
    rssPeakMiB: 106,
    sqliteDbBytesStart: 4_096,
    sqliteDbBytesEnd: 4_096,
    sqliteWalBytesStart: 0,
    sqliteWalBytesEnd: 0,
    sqliteWalBytesPeak: 0,
    peakSockets: 32,
    eventLoopDelay: sampleSummary(900, 10),
    scrypt: sampleSummary(pressure === "scrypt_1hz" ? 10 : 0, 50)
  };
}

function closedLoopRun({ scenario, concurrency, order, instanceId }) {
  const attempted = 1_000 + concurrency;
  return {
    repeat: 1,
    order,
    instanceId,
    tenantCount: 1,
    artifactCount: 1,
    scenario,
    pressure: "none",
    model: "closed_loop",
    concurrency,
    requestCap: 1_000_000,
    requestCapReached: false,
    elapsedMs: 10_001,
    attempted,
    succeeded: attempted,
    failed: 0,
    attemptedOperationsPerSecond: 100,
    successfulOperationsPerSecond: 100,
    transportFailed: 0,
    contentFailed: 0,
    validatedResponseMiBPerSecond: 0.1,
    receivedResponseMiBPerSecond: 0.1,
    uniqueTargetsHit: 1,
    statusCodes: { "200": attempted },
    transportErrors: {},
    contentErrors: {},
    serviceLatency: sampleSummary(attempted),
    serviceLatencyHistogramMs: histogram(attempted),
    server: serverEvidence("none")
  };
}

function scheduledRun({ rate, pressure, order, instanceId }) {
  const scheduled = rate * 10;
  return {
    repeat: 1,
    order,
    instanceId,
    tenantCount: 1,
    artifactCount: 1,
    scenario: "health_json",
    pressure,
    model: "scheduled_open_loop",
    scheduledRequestsPerSecond: rate,
    scheduled,
    dispatched: scheduled,
    completed: scheduled,
    validatedSuccess: scheduled,
    transportFailed: 0,
    contentFailed: 0,
    droppedAtClient: 0,
    drainAborted: 0,
    offeredWindowMs: 10_000,
    totalElapsedMs: 10_001,
    validatedSuccessPerOfferedSecond: rate,
    completionThroughputPerTotalSecond: rate,
    successfulOperationsPerSecond: rate,
    statusCodes: { "200": scheduled },
    transportErrors: {},
    contentErrors: {},
    dispatchLag: sampleSummary(scheduled),
    serviceLatency: sampleSummary(scheduled),
    endToEndLatency: sampleSummary(scheduled),
    validatedResponseMiBPerOfferedSecond: 0.01,
    validatedResponseMiBPerSecond: 0.01,
    receivedResponseMiBPerSecond: 0.01,
    uniqueTargetsHit: 1,
    server: serverEvidence(pressure)
  };
}

function caseKey(run) {
  return `${run.model}:${run.scenario}:${run.concurrency || run.scheduledRequestsPerSecond}:${run.pressure}`;
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

function httpEvidence(instanceId) {
  const runs = [];
  let order = 0;
  for (const scenario of [
    "health_json",
    "subscription_token_read_yaml",
    "subscription_artifact_refresh_write_yaml"
  ]) {
    for (const concurrency of [1, 8, 32]) {
      runs.push(closedLoopRun({ scenario, concurrency, order: order++, instanceId }));
    }
  }
  for (const rate of [10, 100]) {
    runs.push(scheduledRun({ rate, pressure: "none", order: order++, instanceId }));
    runs.push(scheduledRun({ rate, pressure: "scrypt_1hz", order: order++, instanceId }));
  }
  return {
    isolationUnit: "fresh_child_and_sqlite_per_repeat",
    caseStateWithinRepeat: "shared_runtime_jit_rate_limit_and_sqlite_state",
    caseOrder: "deterministically_shuffled_per_repeat",
    runs,
    summaries: runs.map((run) => ({
      key: caseKey(run),
      repeats: 1,
      throughput: repeatMetric(run.successfulOperationsPerSecond),
      serviceP50Ms: repeatMetric(run.serviceLatency.p50Ms),
      serviceMaxMs: repeatMetric(run.serviceLatency.maxMs),
      totalTransportFailed: 0,
      totalContentFailed: 0,
      totalDroppedAtClient: 0,
      totalDrainAborted: 0
    }))
  };
}

function sqliteScale() {
  return [100, 1_000, 5_000, 10_000].map((accountScale) => {
    const longScale = accountScale >= 5_000;
    return {
      accountScale,
      schemaInitMs: 1,
      seedMs: 10,
      databaseBytes: 4_096,
      walBytes: 0,
      getAccount: operation(2_000),
      listAccounts: operation(longScale ? 20 : 40),
      duplicateRegistration: operation(20, { account_already_exists: 20 }),
      registrationMissWithSourcePreflight: operation(20, { registration_rate_limited: 20 }),
      loginResolutionTail: operation(20),
      loginResolutionMiss: operation(20),
      adminAccountProjection: operation(longScale ? 3 : 5),
      endToEndRegistration: operation(5)
    };
  });
}

function sqliteContention() {
  return [1, 2, 4, 8].map((concurrency) => ({
    concurrency,
    elapsedMs: 1_000,
    attempted: 8_000,
    succeeded: 8_000,
    failed: 0,
    attemptedOperationsPerSecond: 8_000,
    successfulOperationsPerSecond: 8_000,
    failedOperationsPerSecond: 0,
    persistedAccounts: 8_000,
    storageInvariantOk: true,
    correctnessOk: true,
    latency: sampleSummary(8_000),
    latencyHistogramMs: histogram(8_000),
    errors: {},
    databaseBytes: 4_096,
    walBytes: 0
  }));
}

function rateLimiter() {
  return [1, 1_000, 5_000, 10_000].map((bucketCount) => ({
    bucketCount,
    ...operation(2_000)
  }));
}

function report(index) {
  const started = new Date(Date.UTC(2026, 7, 27, 0, index * 20, 0));
  const finished = new Date(started.getTime() + 15 * 60 * 1_000);
  return {
    schemaVersion: 2,
    scope: "local_synthetic_performance_baseline",
    riskTier: "B",
    source: {
      repository: "gccwebos-com/proxy-gateway-minimal",
      releaseUnit: "control-plane-app",
      mode: "git_and_artifact",
      commit: COMMIT,
      tree: "c".repeat(40),
      packageLockSha256: HASH,
      harnessSha256: "d".repeat(64),
      artifactFileName: `proxy-gateway-${COMMIT.slice(0, 12)}.zip`,
      artifactSha256: "e".repeat(64),
      artifactSizeBytes: 1_024,
      artifactFileCount: 100,
      worktreeFileCount: 100,
      gitObjectFormat: "sha1"
    },
    environment: {
      node: "v22.23.1",
      modulesAbi: "127",
      platform: "linux",
      release: "6.11.0-github",
      arch: "x64",
      logicalCpuCount: 4,
      cpuModel: "Synthetic CPU",
      totalMemoryMiB: 16_384,
      freeMemoryAtStartMiB: 12_000 - index,
      loadAverageAtStart: [index, index, index],
      timezone: "UTC",
      cgroup: { cpuMax: "400000 100000", memoryMax: "17179869184" },
      filesystems: {
        source: {
          type: "0x794c7630",
          blockSize: 4_096,
          blocks: 1_000_000,
          blocksAvailable: 900_000 - index
        },
        temporary: {
          type: "0x794c7630",
          blockSize: 4_096,
          blocks: 1_000_000,
          blocksAvailable: 800_000 - index
        }
      }
    },
    runtimeQualification: {
      qualification: "node22_observed_dependency_tree",
      nodeMajor: 22,
      nodeModulesSymlink: false,
      dependencyTreeValid: true,
      npmDependencyTreeSha256: "f".repeat(64),
      hiddenPackageLockSha256: "1".repeat(64),
      cleanInstallEvidence: "external_execution_record_required"
    },
    parameters: {
      section: "all",
      seed: 270827 + index,
      httpConcurrency: [1, 8, 32],
      httpRepeats: 1,
      httpWarmupMs: 400,
      httpMeasureMs: 10_000,
      httpFixedRates: [10, 100],
      httpFixedRateDurationMs: 10_000,
      httpMaxInFlight: 128,
      httpDrainTimeoutMs: 10_000,
      httpTenants: 1,
      httpArtifactsPerTenant: 1,
      accountScales: [100, 1_000, 5_000, 10_000],
      sqliteWriteOperations: 8_000,
      sqliteWriteConcurrency: [1, 2, 4, 8],
      scryptPressureIncluded: true
    },
    startedAt: started.toISOString(),
    http: httpEvidence(String(index + 1).repeat(16)),
    sqliteScale: sqliteScale(),
    sqliteContention: sqliteContention(),
    rateLimiter: rateLimiter(),
    finishedAt: finished.toISOString(),
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
}

function execution() {
  return {
    node: "v22.23.1",
    modulesAbi: "127",
    npm: "10.9.2",
    githubActions: true,
    runnerOs: "Linux",
    runnerArch: "X64",
    workflowRunId: 123_456,
    workflowRunAttempt: 1
  };
}

function inputs(reports) {
  return reports.map((value, index) => {
    const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
    return { fileName: `baseline-run-0${index + 1}.json`, bytes, report: value };
  });
}

function validate(reports = [report(0), report(1), report(2)]) {
  return validatePerformanceReportSet({
    expectedCommit: COMMIT,
    releaseRunId: 987_654,
    reportInputs: inputs(reports),
    execution: execution()
  });
}

test("strict report-set validator accepts the complete three-round matrix", () => {
  const reports = [report(0), report(1), report(2)];
  const reportInputs = inputs(reports);
  const receipt = validatePerformanceReportSet({
    expectedCommit: COMMIT,
    releaseRunId: 987_654,
    reportInputs,
    execution: execution()
  });

  assert.equal(receipt.hardGatesPassed, true);
  assert.equal(receipt.runtime.runnerClass, "github_hosted_clean_ephemeral_same_job");
  assert.equal(receipt.productionCapacityEstablished, false);
  assert.deepEqual(receipt.reports, reportInputs.map((input) => ({
    fileName: input.fileName,
    sha256: createHash("sha256").update(input.bytes).digest("hex")
  })));
});

test("validator accepts a stable unavailable cgroup v2 fingerprint", () => {
  const reports = [report(0), report(1), report(2)];
  for (const value of reports) {
    value.environment.cgroup.cpuMax = null;
    value.environment.cgroup.memoryMax = null;
  }

  const receipt = validate(reports);
  assert.equal(receipt.hardGatesPassed, true);
});

test("receipt digests cannot be detached from the validated report bytes", () => {
  const reports = [report(0), report(1), report(2)];
  const reportInputs = inputs(reports);
  reportInputs[0].bytes = Buffer.from("{}\n");
  assert.throws(
    () => validatePerformanceReportSet({
      expectedCommit: COMMIT,
      releaseRunId: 987_654,
      reportInputs,
      execution: execution()
    }),
    /performance_series_report_bytes_mismatch/
  );
});

test("validator rejects parameter, exact HTTP matrix, latency, and isolation drift", async (t) => {
  await t.test("fixed parameter drift", () => {
    const reports = [report(0), report(1), report(2)];
    reports[1].parameters.httpMeasureMs = 9_999;
    assert.throws(() => validate(reports), /performance_series_parameters_invalid/);
  });

  await t.test("matrix substitution", () => {
    const reports = [report(0), report(1), report(2)];
    reports[0].http.runs[0].scenario = "unexpected";
    assert.throws(() => validate(reports), /performance_series_http_matrix_invalid/);
  });

  await t.test("open-loop latency undercount", () => {
    const reports = [report(0), report(1), report(2)];
    const open = reports[0].http.runs.find((run) => run.model === "scheduled_open_loop");
    open.serviceLatency.count -= 1;
    assert.throws(() => validate(reports), /performance_series_sample_count_invalid/);
  });

  await t.test("more than one runtime instance inside a report", () => {
    const reports = [report(0), report(1), report(2)];
    reports[0].http.runs[0].instanceId = "9".repeat(16);
    assert.throws(() => validate(reports), /performance_series_http_matrix_invalid/);
  });
});

test("validator rejects provenance, environment, SQLite, and safety gaps", async (t) => {
  await t.test("runtime digest missing", () => {
    const reports = [report(0), report(1), report(2)];
    reports[0].runtimeQualification.hiddenPackageLockSha256 = null;
    assert.throws(() => validate(reports), /performance_series_runtime_invalid/);
  });

  await t.test("stable environment differs between rounds", () => {
    const reports = [report(0), report(1), report(2)];
    reports[2].environment.cpuModel = "Different CPU";
    assert.throws(() => validate(reports), /performance_series_environment_identity_mismatch/);
  });

  await t.test("cgroup availability differs between rounds", () => {
    const reports = [report(0), report(1), report(2)];
    reports[2].environment.cgroup.cpuMax = null;
    assert.throws(() => validate(reports), /performance_series_environment_identity_mismatch/);
  });

  await t.test("cgroup empty value is invalid", () => {
    const reports = [report(0), report(1), report(2)];
    reports[0].environment.cgroup.memoryMax = "";
    assert.throws(() => validate(reports), /performance_series_environment_invalid/);
  });

  await t.test("SQLite unexpected error map is nonempty", () => {
    const reports = [report(0), report(1), report(2)];
    reports[1].sqliteScale[0].getAccount.unexpectedErrors = { unexpected: 1 };
    assert.throws(() => validate(reports), /performance_series_operation_invalid/);
  });

  await t.test("safety retention boundary changes", () => {
    const reports = [report(0), report(1), report(2)];
    reports[0].safety.rawSubscriptionCredentialsRetained = true;
    assert.throws(() => validate(reports), /performance_series_safety_invalid/);
  });
});

test("CLI accepts three report arguments and writes one exclusive terminal receipt", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "gccgw-perf-report-set-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const reports = [report(0), report(1), report(2)];
  const reportPaths = reports.map((value, index) => {
    const path = join(directory, `baseline-run-0${index + 1}.json`);
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    return path;
  });
  const outputPath = join(directory, "baseline-receipt.json");
  const argv = [
    "--expected-commit", COMMIT,
    "--release-run-id", "987654",
    "--report", reportPaths[0],
    "--report", reportPaths[1],
    "--report", reportPaths[2],
    "--output", outputPath
  ];
  const parsed = parsePerformanceReportSetArgs(argv);
  assert.deepEqual(parsed.reportPaths, reportPaths);

  let stdout = "";
  let stderr = "";
  const first = runPerformanceReportSetCli({
    argv,
    execution: execution(),
    stdout: { write: (value) => { stdout += value; } },
    stderr: { write: (value) => { stderr += value; } }
  });
  assert.equal(first, 0);
  assert.equal(stderr, "");
  assert.match(stdout, /"ok":true/);
  const receipt = JSON.parse(readFileSync(outputPath, "utf8"));
  assert.equal(receipt.productionTouched, false);
  assert.equal(receipt.reports.length, 3);

  const original = readFileSync(outputPath, "utf8");
  const second = runPerformanceReportSetCli({
    argv,
    execution: execution(),
    stdout: { write() {} },
    stderr: { write: (value) => { stderr += value; } }
  });
  assert.equal(second, 1);
  assert.match(stderr, /performance_series_receipt_write_failed/);
  assert.equal(readFileSync(outputPath, "utf8"), original);
});
