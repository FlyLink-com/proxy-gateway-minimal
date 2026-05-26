import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildChannelCandidateReport } from "../services/channel-candidate-report.mjs";

function withJsonFiles(files, fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "channel-candidate-report-"));
  try {
    const paths = {};
    for (const [name, payload] of Object.entries(files)) {
      const path = join(tempDir, name);
      writeFileSync(path, JSON.stringify(payload, null, 2));
      paths[name] = path;
    }
    return fn(paths);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function dryRunSummary() {
  return {
    ok: true,
    serverCount: 5,
    protocolCounts: {
      ss: 1,
      hysteria2: 1,
      tuic: 2,
      vless: 1
    },
    servers: [
      { name: "ss-baseline", host: "ss.secret.example", port: 18388, protocol: "ss", qualityClass: "stable" },
      { name: "hy2-candidate", host: "hy2.secret.example", port: 443, protocol: "hysteria2", qualityClass: "weak-network" },
      { name: "private-candidate", host: "private.secret.example", port: 10444, protocol: "tuic", qualityClass: "private" },
      { name: "tuic-candidate", host: "tuic.secret.example", port: 10443, protocol: "tuic", qualityClass: "weak-network" },
      { name: "vless-unmeasured", host: "vless.secret.example", port: 443, protocol: "vless", qualityClass: "" }
    ],
    benchmarkPlan: {
      mode: "local-dry-run",
      remoteConnections: false,
      probes: []
    }
  };
}

function measurementScore() {
  return {
    ok: true,
    mode: "channel-measurement-score",
    generatedAt: "2026-05-26T19:40:00.000Z",
    sourceGeneratedAt: "2026-05-26T19:39:00.000Z",
    probeCount: 3,
    candidates: [
      {
        name: "ss-baseline",
        protocol: "ss",
        role: "baseline",
        qualityClass: "stable",
        sampleCount: 4,
        successRate: 1,
        timeoutRate: 0,
        p95DurationMs: 120,
        channelScore: 99,
        qualityTier: "healthy",
        recommendedPool: "stable",
        reasonCodes: ["stable_baseline_healthy"]
      },
      {
        name: "hy2-candidate",
        protocol: "hysteria2",
        role: "candidate",
        qualityClass: "weak-network",
        sampleCount: 4,
        successRate: 1,
        timeoutRate: 0,
        p95DurationMs: 240,
        channelScore: 98,
        qualityTier: "healthy",
        recommendedPool: "canary",
        reasonCodes: ["candidate_requires_canary"]
      },
      {
        name: "private-candidate",
        protocol: "tuic",
        role: "candidate",
        qualityClass: "private",
        sampleCount: 4,
        successRate: 1,
        timeoutRate: 0,
        p95DurationMs: 220,
        channelScore: 96,
        qualityTier: "healthy",
        recommendedPool: "private",
        reasonCodes: ["private_operator_channel"]
      },
      {
        name: "tuic-candidate",
        protocol: "tuic",
        role: "candidate",
        qualityClass: "weak-network",
        sampleCount: 4,
        successRate: 0.25,
        timeoutRate: 0.75,
        p95DurationMs: 2500,
        channelScore: 0,
        qualityTier: "blocked",
        recommendedPool: "hold",
        reasonCodes: ["low_success_rate", "timeout_failures", "high_p95_latency"]
      }
    ]
  };
}

test("buildChannelCandidateReport joins dry-run config and measurement scores without secrets", () => {
  const report = buildChannelCandidateReport({
    dryRunSummary: dryRunSummary(),
    measurementScore: measurementScore(),
    generatedAt: "2026-05-26T19:41:00.000Z"
  });

  assert.deepEqual(report, {
    ok: true,
    mode: "channel-candidate-report",
    generatedAt: "2026-05-26T19:41:00.000Z",
    sourceGeneratedAt: "2026-05-26T19:40:00.000Z",
    serverCount: 5,
    measuredCount: 4,
    missingMeasurementCount: 1,
    groups: {
      stable: [
        {
          name: "ss-baseline",
          protocol: "ss",
          qualityClass: "stable",
          qualityTier: "healthy",
          channelScore: 99,
          recommendedPool: "stable",
          reasonCodes: ["stable_baseline_healthy"]
        }
      ],
      canary: [
        {
          name: "hy2-candidate",
          protocol: "hysteria2",
          qualityClass: "weak-network",
          qualityTier: "healthy",
          channelScore: 98,
          recommendedPool: "canary",
          reasonCodes: ["candidate_requires_canary"]
        }
      ],
      private: [
        {
          name: "private-candidate",
          protocol: "tuic",
          qualityClass: "private",
          qualityTier: "healthy",
          channelScore: 96,
          recommendedPool: "private",
          reasonCodes: ["private_operator_channel"]
        }
      ],
      hold: [
        {
          name: "tuic-candidate",
          protocol: "tuic",
          qualityClass: "weak-network",
          qualityTier: "blocked",
          channelScore: 0,
          recommendedPool: "hold",
          reasonCodes: ["low_success_rate", "timeout_failures", "high_p95_latency"]
        }
      ],
      missingMeasurement: [
        {
          name: "vless-unmeasured",
          protocol: "vless",
          qualityClass: "",
          reasonCodes: ["missing_measurement"]
        }
      ]
    }
  });

  assert.doesNotMatch(JSON.stringify(report), /secret|"host"|"port"|token=/);
});

test("channel candidate report CLI prints safe grouped recommendations", () => {
  withJsonFiles(
    {
      "dry-run.json": dryRunSummary(),
      "score.json": measurementScore()
    },
    (paths) => {
      const stdout = execFileSync(process.execPath, [
        "scripts/channel-candidate-report.mjs",
        paths["dry-run.json"],
        paths["score.json"]
      ], {
        cwd: new URL("../../", import.meta.url),
        encoding: "utf8"
      });

      const report = JSON.parse(stdout);
      assert.equal(report.ok, true);
      assert.equal(report.mode, "channel-candidate-report");
      assert.equal(report.groups.canary[0].name, "hy2-candidate");
      assert.equal(report.groups.missingMeasurement[0].name, "vless-unmeasured");
      assert.doesNotMatch(stdout, /secret|"host"|"port"|token=/);
    }
  );
});
