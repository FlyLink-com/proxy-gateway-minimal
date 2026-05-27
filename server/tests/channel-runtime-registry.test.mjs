import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildChannelRuntimeRegistry } from "../services/channel-runtime-registry.mjs";

function withJsonFiles(files, fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "channel-runtime-registry-"));
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
    generatedAt: "2026-05-27T18:30:00.000Z",
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

test("runtime registry blocks canary candidates when runtime inventory is not deployment-ready", () => {
  const registry = buildChannelRuntimeRegistry({
    dryRunSummary: dryRunSummary(),
    measurementScore: measurementScore(),
    runtimeInventory: {
      mode: "channel-runtime-inventory-summary",
      records: [
        {
          candidateName: "tuic-lab",
          protocol: "tuic",
          targetLabel: "channel-lab-a",
          lifecycleStatus: "inventory_blocked",
          deploymentReady: false,
          blockers: ["ssh_banner_timeout", "udp_443_owned_by_hysteria2"],
          nextGate: "channel_lab_b_selection"
        }
      ]
    },
    generatedAt: "2026-05-27T18:31:00.000Z"
  });

  assert.deepEqual(registry.systemReadiness, {
    selectedBaselineReady: true,
    canaryReadyCount: 0,
    runtimeBlockedCount: 1,
    missingRuntimeInventoryCount: 0,
    requiredNextAction: "resolve_runtime_inventory_blockers"
  });
  assert.deepEqual(registry.runtimeBlockedCandidates, [
    {
      name: "tuic-lab",
      protocol: "tuic",
      qualityClass: "weak-network",
      qualityTier: "healthy",
      channelScore: 94,
      lifecycleStatus: "inventory_blocked",
      targetLabel: "channel-lab-a",
      blockers: ["ssh_banner_timeout", "udp_443_owned_by_hysteria2"],
      nextGate: "channel_lab_b_selection",
      reasonCodes: ["candidate_requires_canary"]
    }
  ]);
  assert.equal(registry.canaryReadyCandidates.length, 0);
  assert.doesNotMatch(JSON.stringify(registry), /secret|"host"|"port"|token=/);
});

test("runtime registry surfaces canary candidates only when runtime inventory is deployment-ready", () => {
  const registry = buildChannelRuntimeRegistry({
    dryRunSummary: dryRunSummary(),
    measurementScore: measurementScore(),
    runtimeInventory: {
      mode: "channel-runtime-inventory-summary",
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
    generatedAt: "2026-05-27T18:32:00.000Z"
  });

  assert.equal(registry.systemReadiness.requiredNextAction, "request_risk_a_runtime_canary_approval");
  assert.deepEqual(registry.canaryReadyCandidates, [
    {
      name: "tuic-lab",
      protocol: "tuic",
      qualityClass: "weak-network",
      qualityTier: "healthy",
      channelScore: 94,
      lifecycleStatus: "inventory_ready",
      targetLabel: "channel-lab-b",
      nextGate: "runtime_deployment_approval",
      reasonCodes: ["candidate_requires_canary"]
    }
  ]);
});

test("runtime registry CLI prints safe channel system state", () => {
  withJsonFiles(
    {
      "dry-run.json": dryRunSummary(),
      "score.json": measurementScore(),
      "inventory.json": {
        mode: "channel-runtime-inventory-summary",
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
      }
    },
    (paths) => {
      const stdout = execFileSync(process.execPath, [
        "scripts/channel-runtime-registry.mjs",
        paths["dry-run.json"],
        paths["score.json"],
        paths["inventory.json"]
      ], {
        cwd: new URL("../../", import.meta.url),
        encoding: "utf8"
      });

      const registry = JSON.parse(stdout);
      assert.equal(registry.ok, true);
      assert.equal(registry.mode, "channel-runtime-registry");
      assert.equal(registry.systemReadiness.requiredNextAction, "resolve_runtime_inventory_blockers");
      assert.doesNotMatch(stdout, /secret|"host"|"port"|token=/);
    }
  );
});
