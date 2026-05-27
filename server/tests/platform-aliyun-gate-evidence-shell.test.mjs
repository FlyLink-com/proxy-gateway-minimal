import assert from "node:assert/strict";
import test from "node:test";
import { createPlatformAliyunGateEvidenceShell } from "../services/platform/aliyun-gate-evidence-shell.mjs";

test("Aliyun gate evidence shell records provider-firewall evidence without echoing sensitive fields", () => {
  const shell = createPlatformAliyunGateEvidenceShell({
    nowFn: () => "2026-05-27T15:00:00.000Z"
  });

  const evidence = shell.recordProviderFirewallEvidence({
    hasRollbackSnapshot: true,
    managementSource: "operator-home-secret-label",
    wgHomeDecision: "wg-home-secret-scope-label",
    rawRules: [
      "ALLOW 203.0.113.99/32 tcp 22 token=secret",
      "ALLOW 198.51.100.5/32 udp 51820"
    ],
    note: "private approval note with customer@example.com"
  });

  assert.deepEqual(evidence, {
    type: "aliyun_gate_evidence_summary",
    providerFirewall: {
      type: "provider_firewall_evidence_summary",
      status: "ready_for_gate_packet",
      hasRollbackSnapshot: true,
      hasManagementSourceDecision: true,
      hasWgHomeDecision: true,
      rawRulesProvided: true,
      rawRulesEchoed: false,
      noteProvided: true,
      recordedAt: "2026-05-27T15:00:00.000Z",
      updatedAt: "2026-05-27T15:00:00.000Z"
    },
    accessMigration: null
  });

  const decisionEvidence = shell.providerFirewallEvidenceForDecisionPacket();
  assert.deepEqual(decisionEvidence, {
    hasRollbackSnapshot: true,
    managementSource: true,
    wgHomeDecision: true
  });

  const serialized = JSON.stringify(evidence);
  assert.equal(serialized.includes("203.0.113.99"), false);
  assert.equal(serialized.includes("198.51.100.5"), false);
  assert.equal(serialized.includes("operator-home-secret-label"), false);
  assert.equal(serialized.includes("wg-home-secret-scope-label"), false);
  assert.equal(serialized.includes("token=secret"), false);
  assert.equal(serialized.includes("customer@example.com"), false);
});

test("Aliyun gate evidence shell fails closed for incomplete provider-firewall evidence", () => {
  const shell = createPlatformAliyunGateEvidenceShell({
    nowFn: () => "2026-05-27T15:00:00.000Z"
  });

  const evidence = shell.recordProviderFirewallEvidence({
    hasRollbackSnapshot: false,
    rawRules: []
  });

  assert.equal(evidence.providerFirewall.status, "incomplete");
  assert.equal(evidence.providerFirewall.hasRollbackSnapshot, false);
  assert.equal(evidence.providerFirewall.hasManagementSourceDecision, false);
  assert.equal(evidence.providerFirewall.hasWgHomeDecision, false);
  assert.equal(evidence.providerFirewall.rawRulesProvided, false);
  assert.equal(evidence.accessMigration, null);
  assert.deepEqual(shell.providerFirewallEvidenceForDecisionPacket(), {
    hasRollbackSnapshot: false
  });
});

test("Aliyun gate evidence shell records access-migration evidence without echoing sensitive fields", () => {
  const shell = createPlatformAliyunGateEvidenceShell({
    nowFn: () => "2026-05-27T15:30:00.000Z"
  });

  const evidence = shell.recordAccessMigrationEvidence({
    hasLiveAccessModelInventory: true,
    hasApprovedArtifactScope: true,
    artifactIssuanceCompleted: true,
    artifactRefreshObservationRecorded: true,
    hasApprovedLegacyRetirementScope: false,
    rawSubscriptionUrls: ["https://sub.example/sub/clash.yaml?token=secret-token"],
    rawArtifactUrls: ["https://sub.example/sub/a/artifact-secret.yaml"],
    rawTokens: ["pgsub_secret"],
    note: "private customer note with customer@example.com"
  });

  assert.deepEqual(evidence, {
    type: "aliyun_gate_evidence_summary",
    providerFirewall: null,
    accessMigration: {
      type: "access_migration_evidence_summary",
      status: "ready_for_artifact_issuance_gate",
      hasLiveAccessModelInventory: true,
      hasApprovedArtifactScope: true,
      artifactIssuanceCompleted: true,
      artifactRefreshObservationRecorded: true,
      hasApprovedLegacyRetirementScope: false,
      rawUrlsProvided: true,
      rawUrlsEchoed: false,
      rawTokensProvided: true,
      rawTokensEchoed: false,
      rawArtifactsProvided: true,
      rawArtifactsEchoed: false,
      noteProvided: true,
      recordedAt: "2026-05-27T15:30:00.000Z",
      updatedAt: "2026-05-27T15:30:00.000Z"
    }
  });

  assert.deepEqual(shell.accessMigrationEvidenceForDecisionPacket(), {
    hasLiveAccessModelInventory: true,
    hasApprovedArtifactScope: true,
    artifactIssuanceCompleted: true,
    artifactRefreshObservationRecorded: true,
    hasApprovedLegacyRetirementScope: false
  });

  const serialized = JSON.stringify(evidence);
  assert.equal(serialized.includes("sub.example"), false);
  assert.equal(serialized.includes("secret-token"), false);
  assert.equal(serialized.includes("artifact-secret"), false);
  assert.equal(serialized.includes("pgsub_secret"), false);
  assert.equal(serialized.includes("customer@example.com"), false);
});

test("Aliyun gate evidence shell fails closed for incomplete access-migration evidence", () => {
  const shell = createPlatformAliyunGateEvidenceShell({
    nowFn: () => "2026-05-27T15:30:00.000Z"
  });

  const evidence = shell.recordAccessMigrationEvidence({
    hasLiveAccessModelInventory: true,
    hasApprovedArtifactScope: false,
    artifactIssuanceCompleted: false,
    artifactRefreshObservationRecorded: false,
    hasApprovedLegacyRetirementScope: false
  });

  assert.equal(evidence.providerFirewall, null);
  assert.equal(evidence.accessMigration.status, "incomplete");
  assert.equal(evidence.accessMigration.hasLiveAccessModelInventory, true);
  assert.equal(evidence.accessMigration.hasApprovedArtifactScope, false);
  assert.equal(evidence.accessMigration.rawUrlsProvided, false);
  assert.equal(evidence.accessMigration.rawTokensProvided, false);
  assert.equal(evidence.accessMigration.rawArtifactsProvided, false);
  assert.deepEqual(shell.accessMigrationEvidenceForDecisionPacket(), {
    hasLiveAccessModelInventory: true,
    hasApprovedArtifactScope: false,
    artifactIssuanceCompleted: false,
    artifactRefreshObservationRecorded: false,
    hasApprovedLegacyRetirementScope: false
  });
});
