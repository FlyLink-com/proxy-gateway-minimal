import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildChannelCandidateComparisonPlan } from "../services/channel-candidate-comparison.mjs";

function investigationReport(overrides = {}) {
  return {
    ok: true,
    mode: "channel-measurement-investigation-report",
    generatedAt: "2026-05-27T10:00:00.000Z",
    runId: "safe-hy2-run",
    candidateSet: "safe-hy2-set",
    overallStatus: "hold_for_investigation",
    totalSampleCount: 360,
    summary: {
      probeCount: 2,
      readyCount: 0,
      needsExtendedMeasurementCount: 0,
      holdCount: 2,
      holdReasonCodes: ["high_p95_latency", "high_p99_latency", "hold_window_present"]
    },
    decision: {
      rolloutRecommendation: "do_not_roll_out",
      nextAction: "compare_or_investigate_candidate",
      productionImpact: "none",
      requiresRiskAForRuntime: true
    },
    probes: [
      {
        name: "channel-lab-a-hysteria2-operator-device",
        protocol: "hysteria2",
        role: "candidate",
        qualityClass: "extended-operator-device",
        windowCount: 3,
        readyWindowCount: 0,
        holdWindowCount: 3,
        totalSampleCount: 180,
        readiness: "hold_for_investigation",
        issuePattern: "sustained_tail_latency",
        investigationPriority: "high",
        reasonCodes: ["high_p95_latency", "high_p99_latency", "hold_window_present"],
        rawTarget: "https://secret.example/token=raw-secret"
      },
      {
        name: "channel-lab-a-hysteria2-mihomo-import",
        protocol: "hysteria2",
        role: "candidate",
        qualityClass: "extended-mihomo-import",
        windowCount: 3,
        readyWindowCount: 2,
        holdWindowCount: 1,
        totalSampleCount: 180,
        readiness: "hold_for_investigation",
        issuePattern: "isolated_tail_spike",
        investigationPriority: "medium",
        reasonCodes: ["high_p99_latency", "hold_window_present"]
      }
    ],
    ...overrides
  };
}

function dryRunSummary() {
  return {
    ok: true,
    mode: "channel-config-dry-run",
    generatedAt: "2026-05-27T10:05:00.000Z",
    serverCount: 5,
    servers: [
      { name: "ss-baseline", host: "ss.secret.example", port: 18388, protocol: "ss", qualityClass: "stable" },
      {
        name: "hy2-current",
        host: "hy2.secret.example",
        port: 443,
        protocol: "hysteria2",
        qualityClass: "weak-network"
      },
      { name: "tuic-candidate", host: "tuic.secret.example", port: 443, protocol: "tuic", qualityClass: "weak-network" },
      {
        name: "vless-xudp-candidate",
        host: "vless.secret.example",
        port: 443,
        protocol: "vless",
        qualityClass: "long-haul"
      },
      { name: "private-lab", host: "lab.secret.example", port: 8443, protocol: "tuic", qualityClass: "private" }
    ],
    benchmarkPlan: {
      mode: "local-dry-run",
      remoteConnections: false
    }
  };
}

function withJsonFiles(files, fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "channel-candidate-comparison-"));
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

test("buildChannelCandidateComparisonPlan recommends non-Hysteria2 protocol comparisons after latency hold", () => {
  const plan = buildChannelCandidateComparisonPlan({
    investigationReport: investigationReport(),
    dryRunSummary: dryRunSummary(),
    generatedAt: "2026-05-27T10:10:00.000Z"
  });

  assert.deepEqual(plan, {
    ok: true,
    mode: "channel-candidate-comparison-plan",
    generatedAt: "2026-05-27T10:10:00.000Z",
    sourceGeneratedAt: "2026-05-27T10:00:00.000Z",
    currentStatus: {
      overallStatus: "hold_for_investigation",
      rolloutRecommendation: "do_not_roll_out",
      totalSampleCount: 360,
      heldProtocols: ["hysteria2"],
      issuePatterns: ["isolated_tail_spike", "sustained_tail_latency"],
      holdReasonCodes: ["high_p95_latency", "high_p99_latency", "hold_window_present"]
    },
    baselineCandidates: [
      {
        name: "ss-baseline",
        protocol: "ss",
        qualityClass: "stable",
        role: "baseline_reference",
        reasonCodes: ["baseline_reference_only"]
      }
    ],
    comparisonCandidates: [
      {
        name: "tuic-candidate",
        protocol: "tuic",
        qualityClass: "weak-network",
        comparisonPriority: "primary",
        reasonCodes: ["compare_against_latency_hold", "different_protocol_family", "needs_measurement"]
      },
      {
        name: "vless-xudp-candidate",
        protocol: "vless",
        qualityClass: "long-haul",
        comparisonPriority: "secondary",
        reasonCodes: [
          "compare_against_latency_hold",
          "different_protocol_family",
          "needs_measurement",
          "xudp_candidate_family"
        ]
      }
    ],
    heldCandidates: [
      {
        name: "hy2-current",
        protocol: "hysteria2",
        qualityClass: "weak-network",
        reasonCodes: ["matches_held_protocol", "do_not_roll_out"]
      }
    ],
    privateCandidates: [
      {
        name: "private-lab",
        protocol: "tuic",
        qualityClass: "private",
        reasonCodes: ["private_capacity_not_default_comparison"]
      }
    ],
    requiredNextAction: "prepare_risk_a_comparison_canary_for_primary_candidate",
    advisoryEvidence: {
      advisoryOnly: true,
      noProductionMutation: true,
      requiresRiskAForRuntime: true,
      omittedFields: ["hosts", "ports", "credentials", "rawErrors", "tokens", "subscriptionUrls"]
    }
  });
  assert.doesNotMatch(JSON.stringify(plan), /secret|rawTarget|token=|"host"|"port"/);
});

test("buildChannelCandidateComparisonPlan holds when no non-held comparison candidate exists", () => {
  const plan = buildChannelCandidateComparisonPlan({
    investigationReport: investigationReport(),
    dryRunSummary: {
      ...dryRunSummary(),
      servers: [
        { name: "ss-baseline", host: "ss.secret.example", port: 18388, protocol: "ss", qualityClass: "stable" },
        { name: "hy2-current", host: "hy2.secret.example", port: 443, protocol: "hysteria2", qualityClass: "weak-network" }
      ]
    }
  });

  assert.equal(plan.requiredNextAction, "add_or_select_comparison_candidate");
  assert.deepEqual(plan.comparisonCandidates, []);
});

test("buildChannelCandidateComparisonPlan rejects unsafe input shapes without echoing raw fields", () => {
  assert.throws(
    () =>
      buildChannelCandidateComparisonPlan({
        investigationReport: {
          mode: "runtime-result",
          rawSecret: "secret-token-value"
        },
        dryRunSummary: dryRunSummary()
      }),
    (error) => {
      assert.match(error.message, /requires a channel measurement investigation report/);
      assert.doesNotMatch(error.message, /secret-token-value|rawSecret/);
      return true;
    }
  );
});

test("channel candidate comparison CLI prints safe JSON", () => {
  withJsonFiles(
    {
      "investigation.json": investigationReport({
        rawSecret: "secret-token-value"
      }),
      "dry-run.json": dryRunSummary()
    },
    (paths) => {
      const stdout = execFileSync(process.execPath, [
        "scripts/channel-candidate-comparison.mjs",
        paths["investigation.json"],
        paths["dry-run.json"]
      ], {
        cwd: new URL("../../", import.meta.url),
        encoding: "utf8"
      });

      const plan = JSON.parse(stdout);
      assert.equal(plan.ok, true);
      assert.equal(plan.mode, "channel-candidate-comparison-plan");
      assert.equal(plan.comparisonCandidates[0].protocol, "tuic");
      assert.equal(plan.requiredNextAction, "prepare_risk_a_comparison_canary_for_primary_candidate");
      assert.doesNotMatch(stdout, /secret|rawSecret|token=|"host"|"port"/);
    }
  );
});
