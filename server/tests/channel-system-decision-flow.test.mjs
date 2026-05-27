import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildChannelSystemDecisionFlow } from "../services/channel-system-decision-flow.mjs";

function withJsonFiles(files, fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "channel-system-decision-flow-"));
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
    servers: [
      { name: "ss-baseline", host: "ss.secret.example", port: 18388, protocol: "ss", qualityClass: "stable" },
      { name: "tuic-lab", host: "tuic.secret.example", port: 10443, protocol: "tuic", qualityClass: "weak-network" }
    ]
  };
}

function measurementScore() {
  return {
    ok: true,
    mode: "channel-measurement-score",
    generatedAt: "2026-05-27T20:00:00.000Z",
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
        name: "tuic-lab",
        protocol: "tuic",
        qualityClass: "weak-network",
        channelScore: 94,
        qualityTier: "healthy",
        recommendedPool: "canary",
        reasonCodes: ["candidate_requires_canary"]
      }
    ]
  };
}

test("system decision flow links measurement, runtime inventory, registry, and gate packet", () => {
  const flow = buildChannelSystemDecisionFlow({
    dryRunSummary: dryRunSummary(),
    measurementScore: measurementScore(),
    runtimeInventoryInput: {
      generatedAt: "2026-05-27T20:01:00.000Z",
      records: [
        {
          candidateName: "tuic-lab",
          protocol: "tuic",
          targetLabel: "channel-lab-b",
          lifecycleStatus: "inventory_ready",
          deploymentReady: true,
          blockers: [],
          nextGate: "runtime_deployment_approval"
        }
      ]
    },
    generatedAt: "2026-05-27T20:02:00.000Z"
  });

  assert.equal(flow.ok, true);
  assert.equal(flow.mode, "channel-system-decision-flow");
  assert.equal(flow.flowStatus, "approval_ready");
  assert.equal(flow.requiredNextAction, "request_risk_a_runtime_canary_approval");
  assert.equal(flow.outputs.runtimeInventorySummary.mode, "channel-runtime-inventory-summary");
  assert.equal(flow.outputs.runtimeRegistry.mode, "channel-runtime-registry");
  assert.equal(flow.outputs.runtimeGatePacket.mode, "channel-runtime-gate-packet");
  assert.equal(flow.systemReadiness.runtimeGateStatus, "approval_ready");
  assert.equal(flow.systemReadiness.canaryReadyCount, 1);
  assert.equal(flow.systemReadiness.runtimeBlockedCount, 0);
  assert.equal(flow.systemReadiness.missingRuntimeInventoryCount, 0);
  assert.equal(flow.safety.advisoryOnly, true);
  assert.equal(flow.safety.noRuntimeMutation, true);
  assert.equal(flow.safety.noProductionMutation, true);
  assert.equal(flow.safety.noApprovalSubmission, true);
  assert.equal(flow.safety.noTrafficMovement, true);
  assert.equal(flow.safety.requiresSeparateRiskAApproval, true);
  assert.doesNotMatch(JSON.stringify(flow), /secret|"host"\s*:|"port"\s*:|token=|"rawLog"\s*:/);
});

test("system decision flow blocks when runtime inventory reports blockers", () => {
  const flow = buildChannelSystemDecisionFlow({
    dryRunSummary: dryRunSummary(),
    measurementScore: measurementScore(),
    runtimeInventoryInput: {
      records: [
        {
          candidateName: "tuic-lab",
          protocol: "tuic",
          targetLabel: "channel-lab-a",
          lifecycleStatus: "inventory_blocked",
          deploymentReady: false,
          blockers: ["ssh_banner_timeout"],
          nextGate: "channel_lab_b_selection"
        }
      ]
    },
    generatedAt: "2026-05-27T20:03:00.000Z"
  });

  assert.equal(flow.flowStatus, "blocked");
  assert.equal(flow.requiredNextAction, "resolve_runtime_inventory_blockers");
  assert.equal(flow.systemReadiness.runtimeBlockedCount, 1);
  assert.equal(flow.systemReadiness.canaryReadyCount, 0);
  assert.equal(flow.outputs.runtimeGatePacket.blockedCandidates[0].nextGate, "channel_lab_b_selection");
});

test("system decision flow CLI prints safe end-to-end evidence", () => {
  withJsonFiles(
    {
      "dry-run.json": dryRunSummary(),
      "score.json": measurementScore(),
      "inventory-input.json": {
        generatedAt: "2026-05-27T20:04:00.000Z",
        records: [
          {
            candidateName: "tuic-lab",
            protocol: "tuic",
            targetLabel: "channel-lab-b",
            lifecycleStatus: "inventory_ready",
            deploymentReady: true,
            blockers: [],
            nextGate: "runtime_deployment_approval"
          }
        ]
      }
    },
    (paths) => {
      const stdout = execFileSync(process.execPath, [
        "scripts/channel-system-decision-flow.mjs",
        paths["dry-run.json"],
        paths["score.json"],
        paths["inventory-input.json"]
      ], {
        cwd: new URL("../../", import.meta.url),
        encoding: "utf8"
      });

      const flow = JSON.parse(stdout);
      assert.equal(flow.ok, true);
      assert.equal(flow.mode, "channel-system-decision-flow");
      assert.equal(flow.flowStatus, "approval_ready");
      assert.equal(flow.requiredNextAction, "request_risk_a_runtime_canary_approval");
      assert.doesNotMatch(stdout, /secret|"host"\s*:|"port"\s*:|token=|"rawLog"\s*:/);
    }
  );
});
