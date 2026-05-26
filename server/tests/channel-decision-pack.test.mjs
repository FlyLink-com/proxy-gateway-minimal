import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildChannelDecisionPack } from "../services/channel-decision-pack.mjs";

function withJsonFiles(files, fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "channel-decision-pack-"));
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
    serverCount: 4,
    protocolCounts: {
      ss: 1,
      hysteria2: 1,
      tuic: 1,
      vless: 1
    },
    servers: [
      { name: "ss-baseline", host: "ss.secret.example", port: 18388, protocol: "ss", qualityClass: "stable" },
      { name: "hy2-candidate", host: "hy2.secret.example", port: 443, protocol: "hysteria2", qualityClass: "weak-network" },
      { name: "tuic-blocked", host: "tuic.secret.example", port: 10443, protocol: "tuic", qualityClass: "weak-network" },
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
    generatedAt: "2026-05-26T20:15:00.000Z",
    sourceGeneratedAt: "2026-05-26T20:14:00.000Z",
    candidates: [
      {
        name: "ss-baseline",
        protocol: "ss",
        qualityClass: "stable",
        channelScore: 99,
        qualityTier: "healthy",
        recommendedPool: "stable",
        reasonCodes: ["stable_baseline_healthy"]
      },
      {
        name: "hy2-candidate",
        protocol: "hysteria2",
        qualityClass: "weak-network",
        channelScore: 97,
        qualityTier: "healthy",
        recommendedPool: "canary",
        reasonCodes: ["candidate_requires_canary"]
      },
      {
        name: "tuic-blocked",
        protocol: "tuic",
        qualityClass: "weak-network",
        channelScore: 0,
        qualityTier: "blocked",
        recommendedPool: "hold",
        reasonCodes: ["timeout_failures"]
      }
    ]
  };
}

test("buildChannelDecisionPack creates a safe operator decision artifact", () => {
  const pack = buildChannelDecisionPack({
    dryRunSummary: dryRunSummary(),
    measurementScore: measurementScore(),
    generatedAt: "2026-05-26T20:16:00.000Z"
  });

  assert.deepEqual(pack, {
    ok: true,
    mode: "channel-decision-pack",
    generatedAt: "2026-05-26T20:16:00.000Z",
    sourceGeneratedAt: "2026-05-26T20:15:00.000Z",
    selectedBaseline: {
      name: "ss-baseline",
      protocol: "ss",
      qualityClass: "stable",
      qualityTier: "healthy",
      channelScore: 99,
      reasonCodes: ["stable_baseline_healthy"]
    },
    canaryCandidates: [
      {
        name: "hy2-candidate",
        protocol: "hysteria2",
        qualityClass: "weak-network",
        qualityTier: "healthy",
        channelScore: 97,
        reasonCodes: ["candidate_requires_canary"]
      }
    ],
    privateCandidates: [],
    holdBlockers: [
      {
        name: "tuic-blocked",
        protocol: "tuic",
        qualityClass: "weak-network",
        qualityTier: "blocked",
        channelScore: 0,
        reasonCodes: ["timeout_failures"]
      },
      {
        name: "vless-unmeasured",
        protocol: "vless",
        qualityClass: "",
        qualityTier: "unmeasured",
        channelScore: null,
        reasonCodes: ["missing_measurement"]
      }
    ],
    requiredNextAction: "request_risk_a_canary_approval",
    decisionEvidence: {
      advisoryOnly: true,
      noProductionMutation: true,
      requiresRiskAForRuntime: true,
      omittedFields: ["hosts", "ports", "credentials", "rawErrors", "tokens", "subscriptionUrls"]
    },
    candidateReport: {
      mode: "channel-candidate-report",
      serverCount: 4,
      measuredCount: 3,
      missingMeasurementCount: 1
    }
  });

  assert.doesNotMatch(JSON.stringify(pack), /secret|"host"|"port"|token=/);
});

test("channel decision pack CLI prints safe decision evidence", () => {
  withJsonFiles(
    {
      "dry-run.json": dryRunSummary(),
      "score.json": measurementScore()
    },
    (paths) => {
      const stdout = execFileSync(process.execPath, [
        "scripts/channel-decision-pack.mjs",
        paths["dry-run.json"],
        paths["score.json"]
      ], {
        cwd: new URL("../../", import.meta.url),
        encoding: "utf8"
      });

      const pack = JSON.parse(stdout);
      assert.equal(pack.ok, true);
      assert.equal(pack.mode, "channel-decision-pack");
      assert.equal(pack.selectedBaseline.name, "ss-baseline");
      assert.equal(pack.canaryCandidates[0].name, "hy2-candidate");
      assert.equal(pack.requiredNextAction, "request_risk_a_canary_approval");
      assert.doesNotMatch(stdout, /secret|"host"|"port"|token=/);
    }
  );
});
