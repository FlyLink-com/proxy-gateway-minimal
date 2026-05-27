import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildChannelRuntimeGatePacket } from "../services/channel-runtime-gate-packet.mjs";

function withJsonFile(payload, fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "channel-runtime-gate-packet-"));
  try {
    const path = join(tempDir, "registry.json");
    writeFileSync(path, JSON.stringify(payload, null, 2));
    return fn(path);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function runtimeRegistry(overrides = {}) {
  return {
    ok: true,
    mode: "channel-runtime-registry",
    generatedAt: "2026-05-27T19:30:00.000Z",
    selectedBaseline: {
      name: "ss-baseline",
      protocol: "ss",
      qualityTier: "healthy",
      channelScore: 99,
      reasonCodes: ["stable_baseline_healthy"]
    },
    canaryReadyCandidates: [
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
    ],
    runtimeBlockedCandidates: [],
    missingRuntimeInventoryCandidates: [],
    systemReadiness: {
      selectedBaselineReady: true,
      canaryReadyCount: 1,
      runtimeBlockedCount: 0,
      missingRuntimeInventoryCount: 0,
      requiredNextAction: "request_risk_a_runtime_canary_approval"
    },
    ...overrides
  };
}

test("runtime gate packet exposes approval-ready candidates without authorizing execution", () => {
  const packet = buildChannelRuntimeGatePacket({
    runtimeRegistry: runtimeRegistry(),
    generatedAt: "2026-05-27T19:31:00.000Z"
  });

  assert.deepEqual(packet, {
    ok: true,
    mode: "channel-runtime-gate-packet",
    generatedAt: "2026-05-27T19:31:00.000Z",
    sourceGeneratedAt: "2026-05-27T19:30:00.000Z",
    gateStatus: "approval_ready",
    requiredNextAction: "request_risk_a_runtime_canary_approval",
    selectedBaseline: {
      name: "ss-baseline",
      protocol: "ss",
      qualityTier: "healthy",
      channelScore: 99,
      reasonCodes: ["stable_baseline_healthy"]
    },
    approvalReadyCandidates: [
      {
        name: "tuic-lab",
        protocol: "tuic",
        qualityClass: "weak-network",
        qualityTier: "healthy",
        channelScore: 94,
        lifecycleStatus: "inventory_ready",
        targetLabel: "channel-lab-b",
        nextGate: "runtime_deployment_approval",
        reasonCodes: ["candidate_requires_canary"],
        approvalGate: "risk_a_channel_runtime_canary",
        approvalRequired: true
      }
    ],
    blockedCandidates: [],
    missingInventoryCandidates: [],
    gateEvidence: {
      selectedBaselineReady: true,
      canaryReadyCount: 1,
      runtimeBlockedCount: 0,
      missingRuntimeInventoryCount: 0
    },
    safety: {
      advisoryOnly: true,
      noRuntimeMutation: true,
      noProductionMutation: true,
      noApprovalSubmission: true,
      noTrafficMovement: true,
      requiresSeparateRiskAApproval: true,
      omittedFields: ["hosts", "ports", "urls", "credentials", "rawLogs", "tokens", "subscriptionUrls"]
    }
  });
  assert.doesNotMatch(JSON.stringify(packet), /secret|"host"\s*:|"port"\s*:|token=|"rawLog"\s*:/);
});

test("runtime gate packet blocks approval when runtime inventory has blockers", () => {
  const packet = buildChannelRuntimeGatePacket({
    runtimeRegistry: runtimeRegistry({
      canaryReadyCandidates: [],
      runtimeBlockedCandidates: [
        {
          name: "tuic-lab",
          protocol: "tuic",
          qualityTier: "healthy",
          channelScore: 94,
          lifecycleStatus: "inventory_blocked",
          targetLabel: "channel-lab-a",
          blockers: ["ssh_banner_timeout", "udp_443_owned_by_hysteria2"],
          nextGate: "channel_lab_b_selection",
          reasonCodes: ["candidate_requires_canary"]
        }
      ],
      systemReadiness: {
        selectedBaselineReady: true,
        canaryReadyCount: 0,
        runtimeBlockedCount: 1,
        missingRuntimeInventoryCount: 0,
        requiredNextAction: "resolve_runtime_inventory_blockers"
      }
    }),
    generatedAt: "2026-05-27T19:32:00.000Z"
  });

  assert.equal(packet.gateStatus, "blocked");
  assert.equal(packet.requiredNextAction, "resolve_runtime_inventory_blockers");
  assert.equal(packet.approvalReadyCandidates.length, 0);
  assert.deepEqual(packet.blockedCandidates, [
    {
      name: "tuic-lab",
      protocol: "tuic",
      qualityTier: "healthy",
      channelScore: 94,
      lifecycleStatus: "inventory_blocked",
      targetLabel: "channel-lab-a",
      blockers: ["ssh_banner_timeout", "udp_443_owned_by_hysteria2"],
      nextGate: "channel_lab_b_selection",
      reasonCodes: ["candidate_requires_canary"]
    }
  ]);
});

test("runtime gate packet CLI prints safe gate status", () => {
  withJsonFile(runtimeRegistry(), (path) => {
    const stdout = execFileSync(process.execPath, [
      "scripts/channel-runtime-gate-packet.mjs",
      path
    ], {
      cwd: new URL("../../", import.meta.url),
      encoding: "utf8"
    });

    const packet = JSON.parse(stdout);
    assert.equal(packet.ok, true);
    assert.equal(packet.mode, "channel-runtime-gate-packet");
    assert.equal(packet.gateStatus, "approval_ready");
    assert.doesNotMatch(stdout, /secret|"host"\s*:|"port"\s*:|token=|"rawLog"\s*:/);
  });
});
