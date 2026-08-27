import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  existsSync,
  linkSync,
  readFileSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createRateSchedule,
  parseBenchmarkConfig,
  performRequest,
  recordResponseBytes,
  runScheduledLoad,
  summarizeOperationCounts,
  summarizeSamples,
  validateScenarioResponse,
  verifyArtifactProvenance,
  verifyBenchmarkProvenance,
  writeReportExclusive
} from "../../scripts/local-performance-baseline.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

const HARNESS_PATH = fileURLToPath(new URL("../../scripts/local-performance-baseline.mjs", import.meta.url));

test("summarizeSamples does not publish unstable tail percentiles", () => {
  assert.deepEqual(summarizeSamples([9, 1, 5]), {
    count: 3,
    minMs: 1,
    meanMs: 5,
    p50Ms: 5,
    p95Ms: null,
    p99Ms: null,
    maxMs: 9,
    tailPercentilesValid: false
  });

  const large = summarizeSamples(Array.from({ length: 100 }, (_, index) => index + 1));
  assert.equal(large.tailPercentilesValid, true);
  assert.equal(large.p95Ms, 95);
  assert.equal(large.p99Ms, 99);
});

test("parseBenchmarkConfig accepts bounded explicit values", () => {
  const config = parseBenchmarkConfig({
    argv: ["--confirm-local-synthetic", "--section", "http", "--output", "result.json"],
    env: {
      PERF_HTTP_CONCURRENCY: "1,8,8",
      PERF_HTTP_REPEATS: "2",
      PERF_HTTP_WARMUP_MS: "100",
      PERF_HTTP_MEASURE_MS: "500",
      PERF_HTTP_FIXED_RATES: "10,50",
      PERF_HTTP_FIXED_RATE_DURATION_MS: "1000",
      PERF_HTTP_MAX_IN_FLIGHT: "32",
      PERF_ACCOUNT_SCALES: "100,1000",
      PERF_SQLITE_WRITE_OPERATIONS: "2000",
      PERF_SQLITE_WRITE_CONCURRENCY: "1,2"
    },
    cwd: "/tmp"
  });

  assert.equal(config.section, "http");
  assert.deepEqual(config.httpConcurrency, [1, 8]);
  assert.deepEqual(config.httpFixedRates, [10, 50]);
  assert.equal(config.confirmed, true);
});

test("parseBenchmarkConfig fails closed on missing confirmation and unsafe values", () => {
  assert.throws(
    () => parseBenchmarkConfig({ argv: ["--output", "result.json"], env: {}, cwd: "/tmp" }),
    /performance_confirmation_required/
  );
  assert.throws(
    () => parseBenchmarkConfig({
      argv: ["--confirm-local-synthetic", "--output", "result.json"],
      env: { PERF_HTTP_CONCURRENCY: "129" },
      cwd: "/tmp"
    }),
    /performance_parameter_out_of_range/
  );
  assert.throws(
    () => parseBenchmarkConfig({
      argv: [
        "--confirm-local-synthetic",
        "--output", "same.zip",
        "--artifact", "same.zip"
      ],
      env: {},
      cwd: "/tmp"
    }),
    /performance_output_conflicts_with_input/
  );
  assert.throws(
    () => parseBenchmarkConfig({
      argv: ["--confirm-local-synthetic", "--output", "result.json", "--allow-overwrite"],
      env: {},
      cwd: "/tmp"
    }),
    /performance_output_overwrite_unsupported/
  );
  assert.throws(
    () => parseBenchmarkConfig({
      argv: ["--confirm-local-synthetic", "--output", "result.json"],
      env: { PERF_ACCOUNT_SCALES: "100001" },
      cwd: "/tmp"
    }),
    /performance_parameter_out_of_range/
  );
});

test("scenario response validation rejects semantically wrong HTTP 200", () => {
  assert.equal(validateScenarioResponse("health_json", {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: Buffer.from('{"ok":true,"authRequired":true,"ts":1}')
  }).ok, true);
  assert.deepEqual(validateScenarioResponse("health_json", {
    status: 200,
    headers: { "content-type": "text/html" },
    body: Buffer.from("<html>wrong service</html>")
  }), { ok: false, error: "unexpected_content_type" });
  assert.equal(validateScenarioResponse("subscription_yaml", {
    status: 200,
    headers: {
      "content-type": "application/x-yaml; charset=utf-8",
      "cache-control": "no-cache, no-store, must-revalidate",
      "x-subscription-expires-at": "2099-01-01T00:00:00.000Z"
    },
    body: Buffer.from("proxies:\n  - name: synthetic-vless\n")
  }).ok, true);
});

test("HTTP sampling bounds oversized bodies and settles truncated responses", async (t) => {
  const server = createServer((request, response) => {
    if (request.url === "/oversized") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(Buffer.alloc(300 * 1024, 97));
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.write('{"ok":true');
    setImmediate(() => response.destroy());
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  t.after(() => {
    server.closeAllConnections?.();
    server.close();
  });
  const port = server.address().port;

  const oversized = await performRequest({
    port,
    path: "/oversized",
    scenario: "health_json"
  });
  assert.equal(oversized.ok, true);
  assert.deepEqual(oversized.validation, { ok: false, error: "response_body_too_large" });

  const truncated = await performRequest({
    port,
    path: "/truncated",
    scenario: "health_json"
  });
  assert.equal(truncated.ok, false);
  assert.ok(["response_aborted", "response_error", "request_error"].includes(truncated.error));
});

test("artifact provenance binds manifest, archive bytes, size, and expected source", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "gccgw-perf-provenance-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const archivePath = join(directory, "source.zip");
  const manifestPath = join(directory, "artifact.json");
  const bytes = Buffer.from("synthetic-archive");
  const sourceCommit = "a".repeat(40);
  writeFileSync(archivePath, bytes);
  writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: "1",
    releaseUnit: "control-plane-app",
    sourceCommit,
    release: "test-release",
    artifact: {
      fileName: "source.zip",
      sha256: sha256(bytes),
      sizeBytes: bytes.length,
      createdAt: "2026-08-27T00:00:00.000Z"
    }
  }));

  const result = verifyArtifactProvenance({ manifestPath, archivePath, expectedSourceCommit: sourceCommit });
  assert.deepEqual(result, {
    mode: "artifact",
    commit: sourceCommit,
    releaseUnit: "control-plane-app",
    artifactFileName: "source.zip",
    artifactSha256: sha256(bytes),
    artifactSizeBytes: bytes.length
  });

  writeFileSync(archivePath, "tampered-archive!");
  assert.throws(
    () => verifyArtifactProvenance({ manifestPath, archivePath, expectedSourceCommit: sourceCommit }),
    /performance_artifact_sha256_mismatch/
  );

  truncateSync(archivePath, 65 * 1024 * 1024);
  assert.throws(
    () => verifyArtifactProvenance({ manifestPath, archivePath, expectedSourceCommit: sourceCommit }),
    /performance_artifact_archive_file_invalid/
  );
});

test("benchmark provenance binds a clean exact Git tree to the source archive", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "gccgw-perf-git-provenance-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, "scripts"));
  writeFileSync(join(directory, "package-lock.json"), "{}\n");
  writeFileSync(join(directory, "scripts", "local-performance-baseline.mjs"), "export {};\n");
  const git = (...args) => execFileSync("git", ["-C", directory, ...args], { encoding: "utf8" }).trim();
  git("init", "--initial-branch=master");
  git("config", "user.name", "Performance Test");
  git("config", "user.email", "performance@example.test");
  git("add", ".");
  git("commit", "-m", "synthetic provenance fixture");
  const sourceCommit = git("rev-parse", "HEAD");
  const archivePath = join(directory, "source.zip");
  const manifestPath = join(directory, "artifact.json");
  execFileSync("git", [
    "-C", directory,
    "archive", "--format=zip", "--output", archivePath, sourceCommit, "--", "."
  ]);
  const archiveBytes = readFileSync(archivePath);
  writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: "1",
    releaseUnit: "control-plane-app",
    sourceCommit,
    release: "synthetic-provenance-fixture",
    artifact: {
      fileName: "source.zip",
      sha256: sha256(archiveBytes),
      sizeBytes: archiveBytes.length,
      createdAt: "2026-08-27T00:00:00.000Z"
    }
  }));

  const provenance = verifyBenchmarkProvenance({
    sourceRoot: directory,
    expectedCommit: sourceCommit,
    manifestPath,
    archivePath
  });
  assert.equal(provenance.mode, "git_and_artifact");
  assert.equal(provenance.commit, sourceCommit);
  assert.equal(provenance.artifactFileCount, 2);

  writeFileSync(join(directory, "scripts", "local-performance-baseline.mjs"), "export const dirty = true;\n");
  assert.throws(
    () => verifyBenchmarkProvenance({
      sourceRoot: directory,
      expectedCommit: sourceCommit,
      manifestPath,
      archivePath
    }),
    /performance_git_worktree_content_mismatch/
  );

  const harnessPath = join(directory, "scripts", "local-performance-baseline.mjs");
  writeFileSync(harnessPath, "export {};\n");
  git("update-index", "--assume-unchanged", "scripts/local-performance-baseline.mjs");
  writeFileSync(harnessPath, "export const hiddenDirty = true;\n");
  assert.throws(
    () => verifyBenchmarkProvenance({
      sourceRoot: directory,
      expectedCommit: sourceCommit,
      manifestPath,
      archivePath
    }),
    /performance_git_index_flag_invalid/
  );

  git("update-index", "--no-assume-unchanged", "scripts/local-performance-baseline.mjs");
  writeFileSync(harnessPath, "export {};\n");
  git("update-index", "--skip-worktree", "scripts/local-performance-baseline.mjs");
  writeFileSync(harnessPath, "export const skippedDirty = true;\n");
  assert.throws(
    () => verifyBenchmarkProvenance({
      sourceRoot: directory,
      expectedCommit: sourceCommit,
      manifestPath,
      archivePath
    }),
    /performance_git_index_flag_invalid/
  );
});

test("rate schedule is fixed independently of request completion", () => {
  assert.deepEqual(createRateSchedule({ requestsPerSecond: 4, durationMs: 1000 }), [0, 250, 500, 750]);
  assert.throws(
    () => createRateSchedule({ requestsPerSecond: 1, durationMs: 100 }),
    /performance_planned_requests_empty/
  );
});

test("scheduled load uses the full offered window as its throughput denominator", async () => {
  let now = 0;
  const result = await runScheduledLoad({
    requestsPerSecond: 2,
    durationMs: 1000,
    maxInFlight: 4,
    nowFn: () => now,
    sleepFn: async (milliseconds) => { now += Math.max(0, milliseconds); },
    requestFn: async () => ({
      ok: true,
      status: 200,
      validation: { ok: true },
      serviceLatencyMs: 0
    })
  });

  assert.equal(result.scheduled, 2);
  assert.equal(result.validatedSuccess, 2);
  assert.equal(result.offeredWindowMs, 1000);
  assert.equal(result.totalElapsedMs, 1000);
  assert.equal(result.successfulOperationsPerSecond, 2);
});

test("scheduled load separates offered rate from completion throughput", async () => {
  let now = 0;
  const result = await runScheduledLoad({
    requestsPerSecond: 1,
    durationMs: 1000,
    maxInFlight: 1,
    nowFn: () => now,
    sleepFn: async (milliseconds) => { now += Math.max(0, milliseconds); },
    requestFn: () => new Promise((resolve) => {
      setImmediate(() => {
        now = 5000;
        resolve({
          ok: true,
          status: 200,
          validation: { ok: true },
          serviceLatencyMs: 5000
        });
      });
    })
  });

  assert.equal(result.scheduled, 1);
  assert.equal(result.validatedSuccess, 1);
  assert.equal(result.offeredWindowMs, 1000);
  assert.equal(result.totalElapsedMs, 5000);
  assert.equal(result.validatedSuccessPerOfferedSecond, 1);
  assert.equal(result.completionThroughputPerTotalSecond, 0.2);
  assert.equal(result.successfulOperationsPerSecond, 0.2);
});

test("response byte accounting excludes content failures from validated throughput", () => {
  const counters = { receivedBytes: 0, validatedBytes: 0 };
  recordResponseBytes(counters, {
    ok: true,
    bytes: 1024,
    validation: { ok: false, error: "content_validation_failed" }
  });
  recordResponseBytes(counters, {
    ok: true,
    bytes: 2048,
    validation: { ok: true }
  });

  assert.deepEqual(counters, {
    receivedBytes: 3072,
    validatedBytes: 2048
  });
});

test("scheduled load reports dispatch lag, end-to-end latency, and overload drops", async () => {
  let now = 0;
  const result = await runScheduledLoad({
    requestsPerSecond: 4,
    durationMs: 1000,
    maxInFlight: 1,
    nowFn: () => now,
    sleepFn: async (milliseconds) => {
      if (milliseconds >= 10_000) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return;
      }
      now += Math.max(0, milliseconds);
    },
    drainTimeoutMs: 10_000,
    requestFn: ({ scheduledAtMs }) => new Promise((resolve) => {
      setImmediate(() => {
        now = Math.max(now, scheduledAtMs + 400);
        resolve({
          ok: true,
          status: 200,
          bytes: 1,
          validation: { ok: true },
          serviceLatencyMs: 400
        });
      });
    })
  });

  assert.equal(result.scheduled, 4);
  assert.equal(result.completed + result.droppedAtClient + result.drainAborted, 4);
  assert.ok(result.droppedAtClient > 0);
  assert.equal(result.dispatchLag.count, result.dispatched);
  assert.equal(result.endToEndLatency.count, result.completed);
});

test("scheduled load aborts promptly without waiting for the offered window", async () => {
  const controller = new AbortController();
  const startedAt = Date.now();
  const pending = runScheduledLoad({
    requestsPerSecond: 1,
    durationMs: 10_000,
    maxInFlight: 1,
    signal: controller.signal,
    requestFn: () => new Promise(() => {})
  });
  setImmediate(() => controller.abort());

  await assert.rejects(pending, /performance_interrupted/);
  assert.ok(Date.now() - startedAt < 1000);
});

test("operation rates distinguish attempted, successful, and failed writes", () => {
  assert.deepEqual(summarizeOperationCounts({
    attempted: 100,
    succeeded: 80,
    failed: 20,
    elapsedMs: 2000
  }), {
    attempted: 100,
    succeeded: 80,
    failed: 20,
    attemptedOperationsPerSecond: 50,
    successfulOperationsPerSecond: 40
  });
});

test("report writing never overwrites regular, symlink, or hardlink targets", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "gccgw-perf-output-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const outputPath = join(directory, "result.json");

  writeReportExclusive(outputPath, { first: true });
  assert.throws(
    () => writeReportExclusive(outputPath, { second: true }),
    /performance_output_exists/
  );
  assert.deepEqual(JSON.parse(readFileSync(outputPath, "utf8")), { first: true });

  const symlinkPath = join(directory, "result-link.json");
  symlinkSync(outputPath, symlinkPath);
  assert.throws(
    () => writeReportExclusive(symlinkPath, { changed: true }),
    /performance_output_symlink_rejected/
  );
  const hardlinkPath = join(directory, "result-hardlink.json");
  linkSync(outputPath, hardlinkPath);
  assert.throws(
    () => writeReportExclusive(hardlinkPath, { changed: true }),
    /performance_output_exists/
  );
  assert.deepEqual(JSON.parse(readFileSync(outputPath, "utf8")), { first: true });
});

test("ordinary CLI execution cannot enter an internal child mode", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "gccgw-perf-child-boundary-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [HARNESS_PATH, "--internal-performance-child"], {
    encoding: "utf8",
    env: {
      ...process.env,
      PERF_CHILD_MODE: "http-server",
      PERF_HTTP_TEMP_DIR: directory,
      PERF_HTTP_TENANTS: "1",
      PERF_HTTP_ARTIFACTS_PER_TENANT: "1"
    }
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /performance_confirmation_required/);
  assert.equal(existsSync(join(directory, "subscriptions.sqlite")), false);
});
