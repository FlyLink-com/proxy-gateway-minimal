import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildChannelRuntimeEvidenceBridge } from "../services/channel-runtime-evidence-bridge.mjs";

function withJsonFiles(files, fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "channel-runtime-evidence-bridge-"));
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
      { name: "ss-baseline", protocol: "ss", qualityClass: "stable" },
      { name: "tuic-lab", protocol: "tuic", qualityClass: "weak-network" }
    ]
  };
}

function measurementScore() {
  return {
    ok: true,
    mode: "channel-measurement-score",
    generatedAt: "2026-05-27T21:00:00.000Z",
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

test("runtime evidence bridge builds channel system readiness from safe evidence", () => {
  const bridge = buildChannelRuntimeEvidenceBridge({
    dryRunSummary: dryRunSummary(),
    measurementScore: measurementScore(),
    runtimeEvidenceInput: {
      generatedAt: "2026-05-27T21:01:00.000Z",
      records: [
        {
          candidateName: "tuic-lab",
          protocol: "tuic",
          targetLabel: "channel-lab-b",
          observedAt: "2026-05-27T21:02:00.000Z",
          checks: {
            cloudIdentityVerified: true,
            networkPostureVerified: true,
            hostInventoryCompleted: true,
            runtimeSlotAvailable: true,
            runtimeInstalled: false,
            serviceActive: false,
            operatorImportValidated: false,
            cleanupRequired: false
          },
          blockerCodes: [],
          nextGate: "runtime_deployment_approval"
        }
      ]
    },
    generatedAt: "2026-05-27T21:03:00.000Z"
  });

  assert.equal(bridge.ok, true);
  assert.equal(bridge.mode, "channel-runtime-evidence-bridge");
  assert.deepEqual(bridge.runtimeInventoryInput.records, [
    {
      candidateName: "tuic-lab",
      protocol: "tuic",
      targetLabel: "channel-lab-b",
      lifecycleStatus: "inventory_ready",
      deploymentReady: true,
      blockers: [],
      nextGate: "runtime_deployment_approval"
    }
  ]);
  assert.equal(bridge.channelSystem.mode, "channel-system-decision-flow");
  assert.equal(bridge.channelSystem.flowStatus, "approval_ready");
  assert.equal(bridge.channelSystem.requiredNextAction, "request_risk_a_runtime_canary_approval");
  assert.equal(bridge.safety.noRuntimeMutation, true);
  assert.equal(bridge.safety.noProductionMutation, true);
  assert.equal(bridge.safety.requiresSeparateRiskAApproval, true);
  assert.doesNotMatch(JSON.stringify(bridge), /secret\.example|"host"\s*:|"port"\s*:|token=|"subscriptionUrl"\s*:|"rawLog"\s*:/);
});

test("runtime evidence bridge reports blocked inventory from safe blocker evidence", () => {
  const bridge = buildChannelRuntimeEvidenceBridge({
    dryRunSummary: dryRunSummary(),
    measurementScore: measurementScore(),
    runtimeEvidenceInput: {
      records: [
        {
          candidateName: "tuic-lab",
          protocol: "tuic",
          targetLabel: "channel-lab-a",
          checks: {
            cloudIdentityVerified: true,
            networkPostureVerified: true,
            hostInventoryCompleted: false,
            runtimeSlotAvailable: false,
            runtimeInstalled: false,
            serviceActive: false,
            operatorImportValidated: false,
            cleanupRequired: false
          },
          blockerCodes: ["ssh_banner_timeout", "ssh_banner_timeout", ""],
          nextGate: "channel_lab_b_selection"
        }
      ]
    },
    generatedAt: "2026-05-27T21:04:00.000Z"
  });

  assert.equal(bridge.runtimeInventoryInput.records[0].lifecycleStatus, "inventory_blocked");
  assert.equal(bridge.runtimeInventoryInput.records[0].deploymentReady, false);
  assert.deepEqual(bridge.runtimeInventoryInput.records[0].blockers, [
    "ssh_banner_timeout",
    "host_inventory_incomplete",
    "runtime_slot_unavailable"
  ]);
  assert.equal(bridge.channelSystem.flowStatus, "blocked");
  assert.equal(bridge.channelSystem.requiredNextAction, "resolve_runtime_inventory_blockers");
});

test("runtime evidence bridge rejects unsafe runtime details without echoing raw values", () => {
  assert.throws(
    () => buildChannelRuntimeEvidenceBridge({
      dryRunSummary: dryRunSummary(),
      measurementScore: measurementScore(),
      runtimeEvidenceInput: {
        records: [
          {
            candidateName: "tuic-lab",
            protocol: "tuic",
            targetLabel: "channel-lab-b",
            checks: {
              cloudIdentityVerified: true,
              networkPostureVerified: true,
              hostInventoryCompleted: true,
              runtimeSlotAvailable: true,
              runtimeInstalled: false,
              serviceActive: false,
              operatorImportValidated: false,
              cleanupRequired: false
            },
            host: "runtime-secret.example",
            port: 443,
            token: "token=runtime-secret",
            subscriptionUrl: "https://secret.example/sub/a/raw.yaml",
            nextGate: "runtime_deployment_approval"
          }
        ]
      }
    }),
    (error) => {
      assert.match(error.message, /safe runtime evidence bridge/);
      assert.doesNotMatch(error.message, /runtime-secret|443|token|secret\.example/);
      return true;
    }
  );
});

test("runtime evidence bridge rejects unsafe summary details without echoing raw values", () => {
  assert.throws(
    () => buildChannelRuntimeEvidenceBridge({
      dryRunSummary: {
        ok: true,
        servers: [
          { name: "198.51.100.7:443", protocol: "tuic", qualityClass: "weak-network" }
        ]
      },
      measurementScore: {
        ...measurementScore(),
        candidates: [
          {
            ...measurementScore().candidates[0],
            name: "https://runtime-secret.example?token=unsafe"
          }
        ]
      },
      runtimeEvidenceInput: {
        records: []
      }
    }),
    (error) => {
      assert.match(error.message, /safe runtime evidence bridge/);
      assert.doesNotMatch(error.message, /runtime-secret|198\.51\.100\.7|443|token/);
      return true;
    }
  );
});

test("runtime evidence bridge CLI prints safe JSON", () => {
  withJsonFiles(
    {
      "dry-run.json": dryRunSummary(),
      "score.json": measurementScore(),
      "runtime-evidence.json": {
        generatedAt: "2026-05-27T21:05:00.000Z",
        records: [
          {
            candidateName: "tuic-lab",
            protocol: "tuic",
            targetLabel: "channel-lab-b",
            checks: {
              cloudIdentityVerified: true,
              networkPostureVerified: true,
              hostInventoryCompleted: true,
              runtimeSlotAvailable: true,
              runtimeInstalled: false,
              serviceActive: false,
              operatorImportValidated: false,
              cleanupRequired: false
            },
            blockerCodes: [],
            nextGate: "runtime_deployment_approval"
          }
        ]
      }
    },
    (paths) => {
      const stdout = execFileSync(process.execPath, [
        "scripts/channel-runtime-evidence-bridge.mjs",
        paths["dry-run.json"],
        paths["score.json"],
        paths["runtime-evidence.json"]
      ], {
        cwd: new URL("../../", import.meta.url),
        encoding: "utf8"
      });

      const bridge = JSON.parse(stdout);
      assert.equal(bridge.ok, true);
      assert.equal(bridge.mode, "channel-runtime-evidence-bridge");
      assert.equal(bridge.channelSystem.flowStatus, "approval_ready");
      assert.doesNotMatch(stdout, /secret\.example|"host"\s*:|"port"\s*:|token=|"subscriptionUrl"\s*:|"rawLog"\s*:/);
    }
  );
});
