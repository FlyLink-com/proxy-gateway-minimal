import assert from "node:assert/strict";
import test from "node:test";
import { createAliyunGateDecisionPacket } from "../services/platform/aliyun-gate-decision-packet.mjs";

const NOW = "2026-05-27T14:00:00.000Z";

function readyCleanStartPackage() {
  return {
    type: "aliyun_clean_start_control_plane_package",
    authorityMode: "clean_start",
    status: "ready_for_private_validation",
    counts: {
      accounts: 1,
      entitlements: 1,
      usableEntitlements: 1,
      accessGrants: 1,
      dynamicEntries: 1,
      artifacts: 1,
      renderableNodes: 1
    },
    privateRenderingDryRun: {
      status: "ready",
      nodeCount: 1,
      protocols: ["ss"],
      generatedYamlBytes: 512,
      redacted: true
    },
    blockers: []
  };
}

test("Aliyun gate decision packet exposes approval-ready clean-start gate and blocks firewall gate without preflight evidence", () => {
  const packet = createAliyunGateDecisionPacket({
    cleanStart: readyCleanStartPackage(),
    providerFirewall: {},
    now: NOW
  });

  assert.equal(packet.type, "aliyun_gate_decision_packet");
  assert.equal(packet.status, "blocked");
  assert.equal(packet.generatedAt, NOW);
  assert.deepEqual(packet.notAuthorized, [
    "Aliyun runtime mutation",
    "DNS change",
    "provider firewall mutation",
    "public listener exposure",
    "public Admin exposure",
    "AWS mutation",
    "state copy",
    "user traffic",
    "edge traffic"
  ]);

  const cleanStart = packet.gates.find((gate) => gate.id === "aliyun_clean_start_private_validation");
  assert.equal(cleanStart.status, "ready_for_operator_approval");
  assert.equal(cleanStart.risk, "A");
  assert.equal(cleanStart.approvalRequired, true);
  assert.equal(
    cleanStart.requiredApprovalPhrase,
    "Approve Aliyun clean-start private validation. Allow candidate-only clean-start state initialization and private rendering checks on Aliyun. No DNS change, no public listener exposure, no public Admin, no edge traffic, no AWS mutation, and no historical state copy."
  );
  assert.deepEqual(cleanStart.blockers, []);

  const firewall = packet.gates.find((gate) => gate.id === "aliyun_provider_firewall_hardening");
  assert.equal(firewall.status, "blocked");
  assert.deepEqual(firewall.blockers, [
    "missing provider firewall rollback snapshot",
    "missing management source decision",
    "missing wg-home decision"
  ]);

  const publicBoundary = packet.gates.find((gate) => gate.id === "aliyun_public_boundary_dry_run");
  assert.equal(publicBoundary.status, "blocked");
  assert.deepEqual(publicBoundary.blockers, [
    "clean-start private validation not completed",
    "provider firewall hardening not completed"
  ]);
});

test("Aliyun gate decision packet never echoes provider firewall raw rules or sensitive clean-start material", () => {
  const packet = createAliyunGateDecisionPacket({
    cleanStart: {
      ...readyCleanStartPackage(),
      summaries: {
        accounts: [{ id: "acct_1", email: "ops@example.com", organization: "Acme Research" }],
        accessGrants: [{ id: "access_1", rawEntryUrl: "https://secret.example/use?token=hidden" }]
      }
    },
    providerFirewall: {
      hasRollbackSnapshot: true,
      managementSource: "operator-home-secret-label",
      wgHomeDecision: "wg-home-secret-scope-label",
      rawRules: [
        "ALLOW 0.0.0.0/0 tcp 22 token=secret",
        "ALLOW 203.0.113.99/32 udp 51820"
      ]
    },
    now: NOW
  });

  const firewall = packet.gates.find((gate) => gate.id === "aliyun_provider_firewall_hardening");
  assert.equal(firewall.status, "ready_for_operator_approval");
  assert.equal(firewall.preflightSummary.hasRollbackSnapshot, true);
  assert.equal(firewall.preflightSummary.hasManagementSourceDecision, true);
  assert.equal(firewall.preflightSummary.hasWgHomeDecision, true);
  assert.equal(firewall.preflightSummary.wgHomeDecisionEchoed, false);
  assert.equal(firewall.preflightSummary.rawRulesEchoed, false);

  const serialized = JSON.stringify(packet);
  assert.equal(serialized.includes("ops@example.com"), false);
  assert.equal(serialized.includes("Acme Research"), false);
  assert.equal(serialized.includes("secret.example"), false);
  assert.equal(serialized.includes("token=secret"), false);
  assert.equal(serialized.includes("203.0.113.99"), false);
  assert.equal(serialized.includes("operator-home-secret-label"), false);
  assert.equal(serialized.includes("wg-home-secret-scope-label"), false);
});
