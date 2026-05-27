import assert from "node:assert/strict";
import test from "node:test";
import {
  createAliyunGateDecisionPacket,
  evaluateAliyunGateApprovalPhrase
} from "../services/platform/aliyun-gate-decision-packet.mjs";

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
    "artifact issuance execution",
    "legacy query-token retirement execution",
    "legacy route removal",
    "raw subscription URL or artifact secret recording",
    "user traffic",
    "edge traffic"
  ]);

  const cleanStart = packet.gates.find((gate) => gate.id === "aliyun_clean_start_private_validation");
  assert.equal(cleanStart.status, "ready_for_operator_approval");
  assert.equal(cleanStart.risk, "A");
  assert.equal(cleanStart.approvalRequired, true);
  assert.deepEqual(cleanStart.approvalPolicy, {
    mode: "exact_phrase_for_named_gate",
    phraseBoundToGate: true,
    acceptsShortConfirmation: false,
    approvalSubmissionRoute: null,
    executesGate: false
  });
  assert.equal(
    cleanStart.requiredApprovalPhrase,
    "Approve Aliyun clean-start private validation. Allow candidate-only clean-start state initialization and private rendering checks on Aliyun. No DNS change, no public listener exposure, no public Admin, no edge traffic, no AWS mutation, and no historical state copy."
  );
  assert.deepEqual(cleanStart.blockers, []);

  const firewall = packet.gates.find((gate) => gate.id === "aliyun_provider_firewall_hardening");
  assert.equal(firewall.status, "blocked");
  assert.deepEqual(firewall.approvalPolicy, {
    mode: "exact_phrase_for_named_gate",
    phraseBoundToGate: true,
    acceptsShortConfirmation: false,
    approvalSubmissionRoute: null,
    executesGate: false
  });
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

test("Aliyun gate decision packet exposes separate artifact issuance and legacy retirement gates", () => {
  const packet = createAliyunGateDecisionPacket({
    cleanStart: readyCleanStartPackage(),
    providerFirewall: {
      hasRollbackSnapshot: true,
      managementSource: "operator-management-source-recorded",
      wgHomeDecision: "scope-recorded"
    },
    now: NOW
  });

  const artifactIssuance = packet.gates.find((gate) => gate.id === "aliyun_opaque_artifact_issuance");
  assert.equal(artifactIssuance.label, "Aliyun opaque artifact issuance");
  assert.equal(artifactIssuance.status, "blocked");
  assert.equal(artifactIssuance.risk, "A");
  assert.equal(artifactIssuance.approvalRequired, true);
  assert.equal(artifactIssuance.approvalPolicy.acceptsShortConfirmation, false);
  assert.equal(artifactIssuance.approvalPolicy.executesGate, false);
  assert.match(artifactIssuance.sourceDoc, /opaque-artifact-issuance-and-legacy-token-retirement-runbook/);
  assert.deepEqual(artifactIssuance.blockers, [
    "live access-model inventory not recorded",
    "approved tenant/device artifact scope not recorded"
  ]);
  assert.match(artifactIssuance.requiredApprovalPhrase, /^Approve broader opaque artifact issuance\./);

  const legacyRetirement = packet.gates.find((gate) => gate.id === "aliyun_legacy_query_token_retirement");
  assert.equal(legacyRetirement.label, "Aliyun legacy query-token retirement");
  assert.equal(legacyRetirement.status, "blocked");
  assert.equal(legacyRetirement.risk, "A");
  assert.equal(legacyRetirement.approvalRequired, true);
  assert.equal(legacyRetirement.approvalPolicy.acceptsShortConfirmation, false);
  assert.equal(legacyRetirement.approvalPolicy.executesGate, false);
  assert.match(legacyRetirement.sourceDoc, /opaque-artifact-issuance-and-legacy-token-retirement-runbook/);
  assert.deepEqual(legacyRetirement.blockers, [
    "broader opaque artifact issuance not completed",
    "artifact refresh observation not recorded",
    "approved legacy retirement scope not recorded"
  ]);
  assert.match(legacyRetirement.requiredApprovalPhrase, /^Approve legacy query-token retirement\./);

  assert.equal(packet.notAuthorized.includes("artifact issuance execution"), true);
  assert.equal(packet.notAuthorized.includes("legacy query-token retirement execution"), true);
  assert.equal(packet.notAuthorized.includes("legacy route removal"), true);
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
    accessMigration: {
      hasLiveAccessModelInventory: true,
      hasApprovedArtifactScope: true,
      rawArtifactUrl: "https://sub.example.com/sub/a/artifact-secret",
      rawSubscriptionUrl: "https://sub.example.com/sub/clash.yaml?token=hidden",
      customerEmail: "customer@example.com"
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
  assert.equal(serialized.includes("artifact-secret"), false);
  assert.equal(serialized.includes("token=hidden"), false);
  assert.equal(serialized.includes("customer@example.com"), false);
});

test("Aliyun gate approval phrase policy accepts only the exact phrase for the named gate", () => {
  const packet = createAliyunGateDecisionPacket({
    cleanStart: readyCleanStartPackage(),
    providerFirewall: {
      hasRollbackSnapshot: true,
      managementSource: "operator-management-source-recorded",
      wgHomeDecision: "scope-recorded"
    },
    now: NOW
  });
  const cleanStart = packet.gates.find((gate) => gate.id === "aliyun_clean_start_private_validation");
  const firewall = packet.gates.find((gate) => gate.id === "aliyun_provider_firewall_hardening");

  assert.deepEqual(
    evaluateAliyunGateApprovalPhrase({
      gateId: cleanStart.id,
      phrase: cleanStart.requiredApprovalPhrase
    }),
    {
      approved: true,
      gateId: cleanStart.id,
      reason: "exact_phrase_matched"
    }
  );

  assert.deepEqual(
    evaluateAliyunGateApprovalPhrase({
      gateId: firewall.id,
      phrase: cleanStart.requiredApprovalPhrase
    }),
    {
      approved: false,
      gateId: firewall.id,
      reason: "phrase_mismatch"
    }
  );
});

test("Aliyun gate approval phrase policy accepts artifact migration phrases only for their named gates", () => {
  const packet = createAliyunGateDecisionPacket({ cleanStart: readyCleanStartPackage(), now: NOW });
  const artifactIssuance = packet.gates.find((gate) => gate.id === "aliyun_opaque_artifact_issuance");
  const legacyRetirement = packet.gates.find((gate) => gate.id === "aliyun_legacy_query_token_retirement");

  assert.deepEqual(
    evaluateAliyunGateApprovalPhrase({
      gateId: artifactIssuance.id,
      phrase: artifactIssuance.requiredApprovalPhrase
    }),
    {
      approved: true,
      gateId: artifactIssuance.id,
      reason: "exact_phrase_matched"
    }
  );

  assert.deepEqual(
    evaluateAliyunGateApprovalPhrase({
      gateId: legacyRetirement.id,
      phrase: artifactIssuance.requiredApprovalPhrase
    }),
    {
      approved: false,
      gateId: legacyRetirement.id,
      reason: "phrase_mismatch"
    }
  );
});

test("Aliyun gate approval phrase policy rejects short confirmations without echoing submitted text", () => {
  for (const phrase of ["同意", "继续", "开始", "ok", "go"]) {
    const result = evaluateAliyunGateApprovalPhrase({
      gateId: "aliyun_clean_start_private_validation",
      phrase
    });

    assert.equal(result.approved, false);
    assert.equal(result.gateId, "aliyun_clean_start_private_validation");
    assert.equal(result.reason, "phrase_mismatch");
    assert.equal(JSON.stringify(result).includes(phrase), false);
  }

  assert.deepEqual(evaluateAliyunGateApprovalPhrase({ gateId: "unknown_gate", phrase: "同意" }), {
    approved: false,
    gateId: "unknown_gate",
    reason: "unknown_gate"
  });
});
