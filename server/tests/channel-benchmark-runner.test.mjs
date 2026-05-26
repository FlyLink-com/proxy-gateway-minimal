import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runChannelBenchmarkPlan } from "../services/channel-benchmark-runner.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

function localPlan() {
  return {
    mode: "local-dry-run",
    remoteConnections: false,
    probes: [
      {
        name: "ss-baseline",
        protocol: "ss",
        role: "baseline",
        qualityClass: "stable",
        host: "ss.secret.example",
        port: 18388,
        checks: ["tcp-connect"],
        udpProbe: false
      },
      {
        name: "hy2-long-haul",
        protocol: "hysteria2",
        role: "candidate",
        qualityClass: "weak-network",
        host: "hy2.secret.example",
        port: 443,
        checks: ["tcp-connect", "sustained-session"],
        udpProbe: true
      }
    ]
  };
}

function withLocalPlanFiles(fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "channel-benchmark-runner-"));
  try {
    const planPath = join(tempDir, "plan.json");
    const runnerPath = join(tempDir, "runner.mjs");
    writeFileSync(planPath, JSON.stringify(localPlan(), null, 2));
    writeFileSync(
      runnerPath,
      `export async function runProbe(probe) {
  if (probe.protocol === "ss") {
    return {
      ok: true,
      durationMs: 88,
      connectTimeMs: 24,
      timeToFirstByteMs: 56,
      rawTarget: "https://secret.example/token=raw"
    };
  }
  return {
    ok: false,
    durationMs: 233,
    connectTimeMs: 101,
    errorClass: "timeout",
    rawError: "hy2.secret.example timed out"
  };
}
`
    );
    return fn({ planPath, runnerPath });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

test("runChannelBenchmarkPlan requires an injected probe runner", async () => {
  await assert.rejects(
    runChannelBenchmarkPlan(localPlan(), { generatedAt: "2026-05-26T16:20:00.000Z" }),
    /requires an injected local probe runner/
  );
});

test("runChannelBenchmarkPlan rejects remote benchmark plans", async () => {
  await assert.rejects(
    runChannelBenchmarkPlan(
      {
        mode: "runtime-canary",
        remoteConnections: true,
        probes: [{ name: "unsafe", protocol: "ss", role: "baseline" }]
      },
      {
        runProbe: async () => ({ ok: true, durationMs: 1 })
      }
    ),
    /requires a local dry-run plan/
  );
});

test("runChannelBenchmarkPlan produces safe samples from an injected local runner", async () => {
  const seen = [];
  const fixture = await runChannelBenchmarkPlan(localPlan(), {
    generatedAt: "2026-05-26T16:20:00.000Z",
    runProbe: async (probe, index) => {
      seen.push({ index, name: probe.name, host: probe.host, port: probe.port });
      if (probe.protocol === "ss") {
        return {
          ok: true,
          durationMs: 91,
          connectTimeMs: 31,
          timeToFirstByteMs: 61,
          rawTarget: "https://secret.example/token=raw"
        };
      }
      return {
        ok: false,
        durationMs: 250,
        connectTimeMs: 120,
        errorClass: "timeout",
        rawError: "hy2.secret.example timed out"
      };
    }
  });

  assert.deepEqual(seen, [
    { index: 0, name: "ss-baseline", host: "ss.secret.example", port: 18388 },
    { index: 1, name: "hy2-long-haul", host: "hy2.secret.example", port: 443 }
  ]);
  assert.deepEqual(fixture, {
    schemaVersion: "channel-benchmark-samples/v1",
    generatedAt: "2026-05-26T16:20:00.000Z",
    samples: [
      {
        probeName: "ss-baseline",
        protocol: "ss",
        role: "baseline",
        qualityClass: "stable",
        ok: true,
        durationMs: 91,
        connectTimeMs: 31,
        timeToFirstByteMs: 61
      },
      {
        probeName: "hy2-long-haul",
        protocol: "hysteria2",
        role: "candidate",
        qualityClass: "weak-network",
        ok: false,
        durationMs: 250,
        connectTimeMs: 120,
        timeToFirstByteMs: 0,
        errorClass: "timeout"
      }
    ]
  });
  assert.doesNotMatch(JSON.stringify(fixture), /secret\.example|rawTarget|rawError|token=raw|host|port|checks|udpProbe/);
});

test("runChannelBenchmarkPlan normalizes injected probe failures without leaking raw errors", async () => {
  const fixture = await runChannelBenchmarkPlan(localPlan(), {
    generatedAt: "2026-05-26T16:21:00.000Z",
    runProbe: async () => {
      throw new Error("connect to hy2.secret.example with token=raw failed");
    }
  });

  assert.equal(fixture.samples.length, 2);
  for (const sample of fixture.samples) {
    assert.equal(sample.ok, false);
    assert.equal(sample.errorClass, "unknown_failure");
    assert.equal(sample.durationMs, 0);
  }
  assert.doesNotMatch(JSON.stringify(fixture), /secret\.example|token=raw|connect to/);
});

test("channel benchmark runner CLI requires an explicit local runner module", () => {
  withLocalPlanFiles(({ planPath }) => {
    assert.throws(
      () =>
        execFileSync(process.execPath, ["scripts/channel-benchmark-runner.mjs", planPath], {
          cwd: repoRoot,
          encoding: "utf8",
          stdio: "pipe"
        }),
      (error) => {
        const stderr = String(error.stderr ?? "");
        assert.match(stderr, /--runner local module path is required/);
        assert.doesNotMatch(stderr, /secret\.example|token=raw|host|port/);
        return true;
      }
    );
  });
});

test("channel benchmark runner CLI rejects URL runner modules", () => {
  withLocalPlanFiles(({ planPath }) => {
    assert.throws(
      () =>
        execFileSync(process.execPath, ["scripts/channel-benchmark-runner.mjs", planPath, "--runner", "https://secret.example/runner.mjs"], {
          cwd: repoRoot,
          encoding: "utf8",
          stdio: "pipe"
        }),
      (error) => {
        const stderr = String(error.stderr ?? "");
        assert.match(stderr, /--runner must be a local module path/);
        assert.doesNotMatch(stderr, /secret\.example|runner\.mjs|host|port/);
        return true;
      }
    );
  });
});

test("channel benchmark runner CLI prints safe samples from an explicit local runner", () => {
  withLocalPlanFiles(({ planPath, runnerPath }) => {
    const stdout = execFileSync(
      process.execPath,
      [
        "scripts/channel-benchmark-runner.mjs",
        planPath,
        "--runner",
        runnerPath,
        "--generated-at",
        "2026-05-26T16:30:00.000Z"
      ],
      {
        cwd: repoRoot,
        encoding: "utf8"
      }
    );

    const fixture = JSON.parse(stdout);
    assert.deepEqual(fixture, {
      schemaVersion: "channel-benchmark-samples/v1",
      generatedAt: "2026-05-26T16:30:00.000Z",
      samples: [
        {
          probeName: "ss-baseline",
          protocol: "ss",
          role: "baseline",
          qualityClass: "stable",
          ok: true,
          durationMs: 88,
          connectTimeMs: 24,
          timeToFirstByteMs: 56
        },
        {
          probeName: "hy2-long-haul",
          protocol: "hysteria2",
          role: "candidate",
          qualityClass: "weak-network",
          ok: false,
          durationMs: 233,
          connectTimeMs: 101,
          timeToFirstByteMs: 0,
          errorClass: "timeout"
        }
      ]
    });
    assert.doesNotMatch(stdout, /secret\.example|rawTarget|rawError|token=raw|host|port|checks|udpProbe/);
  });
});

test("synthetic local runner template produces deterministic safe samples through the CLI", () => {
  withLocalPlanFiles(({ planPath }) => {
    const runnerPath = join(repoRoot, "scripts", "channel-benchmark-synthetic-runner.example.mjs");
    const runnerSource = readFileSync(runnerPath, "utf8");
    assert.doesNotMatch(runnerSource, /node:(net|http|https|dgram|tls|child_process)|fetch|WebSocket/);

    const stdout = execFileSync(
      process.execPath,
      [
        "scripts/channel-benchmark-runner.mjs",
        planPath,
        "--runner",
        runnerPath,
        "--generated-at",
        "2026-05-26T16:45:00.000Z"
      ],
      {
        cwd: repoRoot,
        encoding: "utf8"
      }
    );

    const fixture = JSON.parse(stdout);
    assert.deepEqual(fixture, {
      schemaVersion: "channel-benchmark-samples/v1",
      generatedAt: "2026-05-26T16:45:00.000Z",
      samples: [
        {
          probeName: "ss-baseline",
          protocol: "ss",
          role: "baseline",
          qualityClass: "stable",
          ok: true,
          durationMs: 80,
          connectTimeMs: 20,
          timeToFirstByteMs: 50
        },
        {
          probeName: "hy2-long-haul",
          protocol: "hysteria2",
          role: "candidate",
          qualityClass: "weak-network",
          ok: true,
          durationMs: 144,
          connectTimeMs: 48,
          timeToFirstByteMs: 96
        }
      ]
    });
    assert.doesNotMatch(stdout, /secret\.example|rawTarget|rawError|token=raw|host|port|checks|udpProbe/);
  });
});
