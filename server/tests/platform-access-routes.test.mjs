import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../app.mjs";
import { createPlatformAccountEntitlementShell } from "../services/platform/account-entitlement-shell.mjs";
import { createPlatformAliyunGateEvidenceShell } from "../services/platform/aliyun-gate-evidence-shell.mjs";
import { createPlatformLeadReviewQueue } from "../services/platform/lead-review-queue.mjs";
import { createPlatformSubscriptionAccessShell } from "../services/platform/subscription-access-shell.mjs";
import { listen } from "./helpers/listen.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));

function fakeState({ leadQueue, accountShell, accessShell, proxyConfig, aliyunGateEvidence, aliyunGateEvidenceShell }) {
  return {
    rootDir: ROOT,
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: "secret",
    proxyConfig: proxyConfig || { servers: [], pingHosts: [], nginx: { host: "127.0.0.1", ports: [] } },
    platform: { leadQueue, accountShell, accessShell, aliyunGateEvidence, aliyunGateEvidenceShell },
    services: {
      ssLocal: {
        start: async () => ({ ok: true }),
        stop: async () => ({ ok: true }),
        status: () => ({ running: false, starting: false })
      },
      httpProxy: {
        start: async () => ({ ok: true }),
        stop: async () => ({ ok: true }),
        status: () => ({ running: false, starting: false })
      }
    },
    isPortListening: async () => false
  };
}

function authHeaders() {
  return { Authorization: "Bearer secret" };
}

function sampleLead() {
  return {
    organization: "Acme Research",
    email: "ops@example.com",
    direction: "API Sandbox",
    stage: "pilot budget approved",
    message: "Need API sandbox access."
  };
}

function createPlatformState() {
  const leadQueue = createPlatformLeadReviewQueue({
    nowFn: () => "2026-05-26T10:00:00.000Z",
    idFactory: () => "lead_1"
  });
  const accountShell = createPlatformAccountEntitlementShell({
    nowFn: () => "2026-05-26T10:05:00.000Z",
    accountIdFactory: () => "acct_1",
    entitlementIdFactory: () => "ent_1"
  });
  const accessShell = createPlatformSubscriptionAccessShell({
    accountShell,
    nowFn: () => "2026-05-26T10:10:00.000Z",
    accessIdFactory: () => "access_1"
  });
  const lead = leadQueue.getLead(leadQueue.enqueueLead(sampleLead()).id);
  accountShell.createAccountFromLead(lead);
  accountShell.createEntitlement("acct_1", {
    plan: "pilot",
    status: "active",
    validUntil: "2026-06-26T00:00:00.000Z"
  });
  return { leadQueue, accountShell, accessShell };
}

test("admin platform access routes issue and list redacted dynamic entry summaries", async () => {
  const { leadQueue, accountShell, accessShell } = createPlatformState();
  const { server, baseUrl } = await listen(createApp(fakeState({ leadQueue, accountShell, accessShell })));
  try {
    const unauthenticated = await fetch(`${baseUrl}/api/admin/platform/access-grants`);
    assert.equal(unauthenticated.status, 401);

    const created = await fetch(`${baseUrl}/api/admin/platform/accounts/acct_1/entitlements/ent_1/dynamic-entry`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        entryRef: "entry_ref_1",
        artifactRef: "artifact_ref_1",
        rawEntryUrl: "https://dynamic-entry.example/use?token=top-secret",
        subscriptionUrl: "https://sub.example/import?token=hidden",
        artifactSecret: "opaque_secret_value"
      })
    });
    assert.equal(created.status, 201);
    const createdBody = await created.json();
    assert.deepEqual(createdBody, {
      access: {
        id: "access_1",
        type: "subscription_access_grant_summary",
        accountId: "acct_1",
        entitlementId: "ent_1",
        status: "issued",
        delivery: "operator_issued",
        hasDynamicEntry: true,
        hasArtifact: true,
        visibleOnce: true,
        issuedAt: "2026-05-26T10:10:00.000Z",
        updatedAt: "2026-05-26T10:10:00.000Z"
      }
    });

    const listed = await fetch(`${baseUrl}/api/admin/platform/access-grants?accountId=acct_1`, {
      headers: authHeaders()
    });
    assert.equal(listed.status, 200);
    const serialized = JSON.stringify(await listed.json());
    assert.equal(serialized.includes("dynamic-entry.example"), false);
    assert.equal(serialized.includes("sub.example"), false);
    assert.equal(serialized.includes("top-secret"), false);
    assert.equal(serialized.includes("opaque_secret_value"), false);
    assert.equal(serialized.includes("token="), false);
    assert.equal(serialized.includes("entry_ref_1"), false);
    assert.equal(serialized.includes("artifact_ref_1"), false);
  } finally {
    server.close();
  }
});

test("admin platform clean-start route returns protected redacted private rendering summary", async () => {
  const { leadQueue, accountShell, accessShell } = createPlatformState();
  accessShell.issueDynamicEntry("acct_1", "ent_1", {
    entryRef: "entry_ref_secret",
    artifactRef: "artifact_ref_secret",
    rawEntryUrl: "https://portal-secret.example/use?token=dynamic-secret"
  });
  const proxyConfig = {
    servers: [
      {
        name: "clean-edge-a",
        host: "edge-secret.example",
        port: 443,
        type: "ss",
        cipher: "aes-256-gcm",
        password: "node-password-secret",
        qualityClass: "stable"
      }
    ],
    pingHosts: [],
    nginx: { host: "127.0.0.1", ports: [] }
  };
  const { server, baseUrl } = await listen(createApp(fakeState({ leadQueue, accountShell, accessShell, proxyConfig })));
  try {
    const unauthenticated = await fetch(`${baseUrl}/api/admin/platform/clean-start`);
    assert.equal(unauthenticated.status, 401);

    const response = await fetch(`${baseUrl}/api/admin/platform/clean-start`, {
      headers: authHeaders()
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.cleanStart.type, "aliyun_clean_start_control_plane_package");
    assert.equal(body.cleanStart.status, "ready_for_private_validation");
    assert.equal(body.cleanStart.privateRenderingDryRun.status, "ready");
    assert.equal(body.cleanStart.privateRenderingDryRun.nodeCount, 1);
    assert.deepEqual(body.cleanStart.counts, {
      accounts: 1,
      entitlements: 1,
      usableEntitlements: 1,
      accessGrants: 1,
      dynamicEntries: 1,
      artifacts: 1,
      renderableNodes: 1
    });

    const serialized = JSON.stringify(body);
    assert.equal(serialized.includes("edge-secret.example"), false);
    assert.equal(serialized.includes("node-password-secret"), false);
    assert.equal(serialized.includes("portal-secret.example"), false);
    assert.equal(serialized.includes("dynamic-secret"), false);
    assert.equal(serialized.includes("entry_ref_secret"), false);
    assert.equal(serialized.includes("artifact_ref_secret"), false);
    assert.equal(serialized.includes("ops@example.com"), false);
    assert.equal(serialized.includes("Acme Research"), false);
  } finally {
    server.close();
  }
});

test("admin platform Aliyun gate packet route is protected and redacts firewall evidence", async () => {
  const { leadQueue, accountShell, accessShell } = createPlatformState();
  accessShell.issueDynamicEntry("acct_1", "ent_1", {
    entryRef: "entry_ref_secret",
    artifactRef: "artifact_ref_secret",
    rawEntryUrl: "https://portal-secret.example/use?token=dynamic-secret"
  });
  const proxyConfig = {
    servers: [
      {
        name: "clean-edge-a",
        host: "edge-secret.example",
        port: 443,
        type: "ss",
        cipher: "aes-256-gcm",
        password: "node-password-secret",
        qualityClass: "stable"
      }
    ],
    pingHosts: [],
    nginx: { host: "127.0.0.1", ports: [] }
  };
  const aliyunGateEvidence = {
    providerFirewall: {
      hasRollbackSnapshot: true,
      managementSource: "operator-home-secret-label",
      wgHomeDecision: "wg-home-secret-scope-label",
      rawRules: ["ALLOW 203.0.113.99/32 udp 51820 token=secret"]
    }
  };
  const { server, baseUrl } = await listen(createApp(fakeState({
    leadQueue,
    accountShell,
    accessShell,
    proxyConfig,
    aliyunGateEvidence
  })));
  try {
    const unauthenticated = await fetch(`${baseUrl}/api/admin/platform/aliyun-gates`);
    assert.equal(unauthenticated.status, 401);

    const response = await fetch(`${baseUrl}/api/admin/platform/aliyun-gates`, {
      headers: authHeaders()
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.aliyunGates.type, "aliyun_gate_decision_packet");
    assert.equal(body.aliyunGates.status, "blocked");
    assert.equal(body.aliyunGates.gates[0].risk, "A");
    assert.equal(
      body.aliyunGates.gates.some((gate) => gate.status === "ready_for_operator_approval"),
      true
    );

    const serialized = JSON.stringify(body);
    assert.equal(serialized.includes("edge-secret.example"), false);
    assert.equal(serialized.includes("node-password-secret"), false);
    assert.equal(serialized.includes("portal-secret.example"), false);
    assert.equal(serialized.includes("dynamic-secret"), false);
    assert.equal(serialized.includes("entry_ref_secret"), false);
    assert.equal(serialized.includes("artifact_ref_secret"), false);
    assert.equal(serialized.includes("203.0.113.99"), false);
    assert.equal(serialized.includes("operator-home-secret-label"), false);
    assert.equal(serialized.includes("wg-home-secret-scope-label"), false);
    assert.equal(serialized.includes("token=secret"), false);
  } finally {
    server.close();
  }
});

test("admin platform Aliyun gate evidence route records provider-firewall evidence for the gate packet", async () => {
  const { leadQueue, accountShell, accessShell } = createPlatformState();
  accessShell.issueDynamicEntry("acct_1", "ent_1", {
    entryRef: "entry_ref_secret",
    artifactRef: "artifact_ref_secret",
    rawEntryUrl: "https://portal-secret.example/use?token=dynamic-secret"
  });
  const proxyConfig = {
    servers: [
      {
        name: "clean-edge-a",
        host: "edge-secret.example",
        port: 443,
        type: "ss",
        cipher: "aes-256-gcm",
        password: "node-password-secret",
        qualityClass: "stable"
      }
    ],
    pingHosts: [],
    nginx: { host: "127.0.0.1", ports: [] }
  };
  const aliyunGateEvidenceShell = createPlatformAliyunGateEvidenceShell({
    nowFn: () => "2026-05-27T15:00:00.000Z"
  });
  const { server, baseUrl } = await listen(createApp(fakeState({
    leadQueue,
    accountShell,
    accessShell,
    proxyConfig,
    aliyunGateEvidenceShell
  })));
  try {
    const unauthenticated = await fetch(`${baseUrl}/api/admin/platform/aliyun-gate-evidence`);
    assert.equal(unauthenticated.status, 401);

    const created = await fetch(`${baseUrl}/api/admin/platform/aliyun-gate-evidence/provider-firewall`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        hasRollbackSnapshot: true,
        managementSource: "operator-home-secret-label",
        wgHomeDecision: "wg-home-secret-scope-label",
        rawRules: ["ALLOW 203.0.113.99/32 udp 51820 token=secret"],
        note: "private note with customer@example.com"
      })
    });
    assert.equal(created.status, 201);
    const createdBody = await created.json();
    assert.equal(createdBody.evidence.providerFirewall.status, "ready_for_gate_packet");
    assert.equal(createdBody.evidence.providerFirewall.hasRollbackSnapshot, true);
    assert.equal(createdBody.evidence.providerFirewall.hasManagementSourceDecision, true);
    assert.equal(createdBody.evidence.providerFirewall.hasWgHomeDecision, true);
    assert.equal(createdBody.evidence.providerFirewall.rawRulesProvided, true);
    assert.equal(createdBody.evidence.providerFirewall.rawRulesEchoed, false);

    const packet = await fetch(`${baseUrl}/api/admin/platform/aliyun-gates`, {
      headers: authHeaders()
    });
    assert.equal(packet.status, 200);
    const packetBody = await packet.json();
    const firewallGate = packetBody.aliyunGates.gates.find((gate) => gate.id === "aliyun_provider_firewall_hardening");
    assert.equal(firewallGate.status, "ready_for_operator_approval");
    assert.deepEqual(firewallGate.blockers, []);

    const listed = await fetch(`${baseUrl}/api/admin/platform/aliyun-gate-evidence`, {
      headers: authHeaders()
    });
    assert.equal(listed.status, 200);
    const serialized = JSON.stringify({
      created: createdBody,
      listed: await listed.json(),
      packet: packetBody
    });
    assert.equal(serialized.includes("edge-secret.example"), false);
    assert.equal(serialized.includes("node-password-secret"), false);
    assert.equal(serialized.includes("portal-secret.example"), false);
    assert.equal(serialized.includes("dynamic-secret"), false);
    assert.equal(serialized.includes("entry_ref_secret"), false);
    assert.equal(serialized.includes("artifact_ref_secret"), false);
    assert.equal(serialized.includes("203.0.113.99"), false);
    assert.equal(serialized.includes("operator-home-secret-label"), false);
    assert.equal(serialized.includes("wg-home-secret-scope-label"), false);
    assert.equal(serialized.includes("customer@example.com"), false);
    assert.equal(serialized.includes("token=secret"), false);
  } finally {
    server.close();
  }
});

test("admin platform Aliyun gate evidence route records access-migration evidence for artifact gates", async () => {
  const { leadQueue, accountShell, accessShell } = createPlatformState();
  const aliyunGateEvidenceShell = createPlatformAliyunGateEvidenceShell({
    nowFn: () => "2026-05-27T15:30:00.000Z"
  });
  const { server, baseUrl } = await listen(createApp(fakeState({
    leadQueue,
    accountShell,
    accessShell,
    aliyunGateEvidenceShell
  })));
  try {
    const created = await fetch(`${baseUrl}/api/admin/platform/aliyun-gate-evidence/access-migration`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        hasLiveAccessModelInventory: true,
        hasApprovedArtifactScope: true,
        artifactIssuanceCompleted: false,
        artifactRefreshObservationRecorded: false,
        hasApprovedLegacyRetirementScope: false,
        rawSubscriptionUrls: ["https://sub.example/sub/clash.yaml?token=secret-token"],
        rawArtifactUrls: ["https://sub.example/sub/a/artifact-secret.yaml"],
        rawTokens: ["pgsub_secret"],
        note: "private note with customer@example.com"
      })
    });
    assert.equal(created.status, 201);
    const createdBody = await created.json();
    assert.equal(createdBody.evidence.accessMigration.status, "ready_for_artifact_issuance_gate");
    assert.equal(createdBody.evidence.accessMigration.hasLiveAccessModelInventory, true);
    assert.equal(createdBody.evidence.accessMigration.hasApprovedArtifactScope, true);
    assert.equal(createdBody.evidence.accessMigration.rawUrlsProvided, true);
    assert.equal(createdBody.evidence.accessMigration.rawUrlsEchoed, false);
    assert.equal(createdBody.evidence.accessMigration.rawTokensProvided, true);
    assert.equal(createdBody.evidence.accessMigration.rawTokensEchoed, false);
    assert.equal(createdBody.evidence.accessMigration.rawArtifactsProvided, true);
    assert.equal(createdBody.evidence.accessMigration.rawArtifactsEchoed, false);

    const packet = await fetch(`${baseUrl}/api/admin/platform/aliyun-gates`, {
      headers: authHeaders()
    });
    assert.equal(packet.status, 200);
    const packetBody = await packet.json();
    const artifactGate = packetBody.aliyunGates.gates.find((gate) => gate.id === "aliyun_opaque_artifact_issuance");
    const legacyGate = packetBody.aliyunGates.gates.find((gate) => gate.id === "aliyun_legacy_query_token_retirement");
    assert.equal(artifactGate.status, "ready_for_operator_approval");
    assert.deepEqual(artifactGate.blockers, []);
    assert.equal(legacyGate.status, "blocked");
    assert.deepEqual(legacyGate.blockers, [
      "broader opaque artifact issuance not completed",
      "artifact refresh observation not recorded",
      "approved legacy retirement scope not recorded"
    ]);

    const listed = await fetch(`${baseUrl}/api/admin/platform/aliyun-gate-evidence`, {
      headers: authHeaders()
    });
    assert.equal(listed.status, 200);
    const serialized = JSON.stringify({
      created: createdBody,
      listed: await listed.json(),
      packet: packetBody
    });
    assert.equal(serialized.includes("sub.example"), false);
    assert.equal(serialized.includes("secret-token"), false);
    assert.equal(serialized.includes("artifact-secret"), false);
    assert.equal(serialized.includes("pgsub_secret"), false);
    assert.equal(serialized.includes("customer@example.com"), false);
  } finally {
    server.close();
  }
});

test("admin platform Aliyun gate evidence route fails closed when evidence shell is unavailable", async () => {
  const { leadQueue, accountShell, accessShell } = createPlatformState();
  const { server, baseUrl } = await listen(createApp(fakeState({
    leadQueue,
    accountShell,
    accessShell
  })));
  try {
    const response = await fetch(`${baseUrl}/api/admin/platform/aliyun-gate-evidence/provider-firewall`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ hasRollbackSnapshot: true })
    });

    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "validation_error");

    const accessMigrationResponse = await fetch(`${baseUrl}/api/admin/platform/aliyun-gate-evidence/access-migration`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ hasLiveAccessModelInventory: true })
    });

    assert.equal(accessMigrationResponse.status, 400);
    assert.equal((await accessMigrationResponse.json()).error, "validation_error");
  } finally {
    server.close();
  }
});

function channelDryRunSummary() {
  return {
    ok: true,
    servers: [
      { name: "ss-baseline", host: "ss.secret.example", port: 18388, protocol: "ss", qualityClass: "stable" },
      { name: "tuic-lab", host: "tuic.secret.example", port: 10443, protocol: "tuic", qualityClass: "weak-network" }
    ]
  };
}

function channelSafeDryRunSummary() {
  return {
    ok: true,
    servers: [
      { name: "ss-baseline", protocol: "ss", qualityClass: "stable" },
      { name: "tuic-lab", protocol: "tuic", qualityClass: "weak-network" }
    ]
  };
}

function channelMeasurementScore() {
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

function channelRuntimeInventoryInput(overrides = {}) {
  return {
    generatedAt: "2026-05-27T20:01:00.000Z",
    records: [
      {
        candidateName: "tuic-lab",
        protocol: "tuic",
        targetLabel: "channel-lab-b",
        lifecycleStatus: "inventory_ready",
        deploymentReady: true,
        blockers: [],
        nextGate: "runtime_deployment_approval",
        ...overrides
      }
    ]
  };
}

function channelRuntimeEvidenceInput(overrides = {}) {
  return {
    generatedAt: "2026-05-27T20:01:00.000Z",
    records: [
      {
        candidateName: "tuic-lab",
        protocol: "tuic",
        targetLabel: "channel-lab-b",
        observedAt: "2026-05-27T20:01:30.000Z",
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
        nextGate: "runtime_deployment_approval",
        ...overrides
      }
    ]
  };
}

test("admin platform channel system decision route is protected and returns safe readiness evidence", async () => {
  const { leadQueue, accountShell, accessShell } = createPlatformState();
  const { server, baseUrl } = await listen(createApp(fakeState({
    leadQueue,
    accountShell,
    accessShell
  })));
  try {
    const unauthenticated = await fetch(`${baseUrl}/api/admin/platform/channel-system-decision-flow`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(unauthenticated.status, 401);

    const response = await fetch(`${baseUrl}/api/admin/platform/channel-system-decision-flow`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        dryRunSummary: channelDryRunSummary(),
        measurementScore: channelMeasurementScore(),
        runtimeInventoryInput: channelRuntimeInventoryInput()
      })
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.channelSystem.mode, "channel-system-decision-flow");
    assert.equal(body.channelSystem.flowStatus, "approval_ready");
    assert.equal(body.channelSystem.requiredNextAction, "request_risk_a_runtime_canary_approval");
    assert.equal(body.channelSystem.systemReadiness.canaryReadyCount, 1);
    assert.equal(body.channelSystem.safety.noRuntimeMutation, true);
    assert.equal(body.channelSystem.safety.noApprovalSubmission, true);
    assert.equal(body.channelSystem.safety.noTrafficMovement, true);

    const serialized = JSON.stringify(body);
    assert.equal(serialized.includes("ss.secret.example"), false);
    assert.equal(serialized.includes("tuic.secret.example"), false);
    assert.equal(serialized.includes("\"host\""), false);
    assert.equal(serialized.includes("\"port\""), false);
    assert.equal(serialized.includes("token="), false);
  } finally {
    server.close();
  }
});

test("admin platform channel runtime evidence bridge route is protected and returns safe readiness evidence", async () => {
  const { leadQueue, accountShell, accessShell } = createPlatformState();
  const { server, baseUrl } = await listen(createApp(fakeState({
    leadQueue,
    accountShell,
    accessShell
  })));
  try {
    const unauthenticated = await fetch(`${baseUrl}/api/admin/platform/channel-runtime-evidence-bridge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(unauthenticated.status, 401);

    const response = await fetch(`${baseUrl}/api/admin/platform/channel-runtime-evidence-bridge`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        dryRunSummary: channelSafeDryRunSummary(),
        measurementScore: channelMeasurementScore(),
        runtimeEvidenceInput: channelRuntimeEvidenceInput()
      })
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.channelRuntimeEvidence.mode, "channel-runtime-evidence-bridge");
    assert.equal(body.channelRuntimeEvidence.channelSystem.mode, "channel-system-decision-flow");
    assert.equal(body.channelRuntimeEvidence.channelSystem.flowStatus, "approval_ready");
    assert.equal(body.channelRuntimeEvidence.channelSystem.systemReadiness.canaryReadyCount, 1);
    assert.equal(body.channelRuntimeEvidence.safety.noRuntimeMutation, true);
    assert.equal(body.channelRuntimeEvidence.safety.noApprovalSubmission, true);
    assert.equal(body.channelRuntimeEvidence.safety.noTrafficMovement, true);

    const serialized = JSON.stringify(body);
    assert.equal(serialized.includes("ss.secret.example"), false);
    assert.equal(serialized.includes("tuic.secret.example"), false);
    assert.equal(serialized.includes("\"host\""), false);
    assert.equal(serialized.includes("\"port\""), false);
    assert.equal(serialized.includes("token="), false);
  } finally {
    server.close();
  }
});

test("admin platform channel runtime evidence bridge route rejects unsafe evidence without echoing it", async () => {
  const { leadQueue, accountShell, accessShell } = createPlatformState();
  const { server, baseUrl } = await listen(createApp(fakeState({
    leadQueue,
    accountShell,
    accessShell
  })));
  try {
    const response = await fetch(`${baseUrl}/api/admin/platform/channel-runtime-evidence-bridge`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        dryRunSummary: channelSafeDryRunSummary(),
        measurementScore: channelMeasurementScore(),
        runtimeEvidenceInput: channelRuntimeEvidenceInput({
          host: "runtime-secret.example",
          port: 443,
          token: "token=runtime-secret"
        })
      })
    });

    assert.equal(response.status, 400);
    const serialized = JSON.stringify(await response.json());
    assert.equal(serialized.includes("runtime-secret.example"), false);
    assert.equal(serialized.includes("443"), false);
    assert.equal(serialized.includes("token=runtime-secret"), false);
    assert.equal(serialized.includes("validation_error"), true);
  } finally {
    server.close();
  }
});

test("admin platform channel runtime evidence bridge route rejects unsafe allowed runtime labels without echoing them", async () => {
  const { leadQueue, accountShell, accessShell } = createPlatformState();
  const { server, baseUrl } = await listen(createApp(fakeState({
    leadQueue,
    accountShell,
    accessShell
  })));
  try {
    const response = await fetch(`${baseUrl}/api/admin/platform/channel-runtime-evidence-bridge`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        dryRunSummary: channelSafeDryRunSummary(),
        measurementScore: channelMeasurementScore(),
        runtimeEvidenceInput: channelRuntimeEvidenceInput({
          candidateName: "203.0.113.10:443",
          targetLabel: "198.51.100.7:443"
        })
      })
    });

    assert.equal(response.status, 400);
    const serialized = JSON.stringify(await response.json());
    assert.equal(serialized.includes("203.0.113.10"), false);
    assert.equal(serialized.includes("198.51.100.7"), false);
    assert.equal(serialized.includes("443"), false);
    assert.equal(serialized.includes("validation_error"), true);
  } finally {
    server.close();
  }
});

test("admin platform channel runtime evidence bridge route rejects unsafe summary inputs without echoing them", async () => {
  const { leadQueue, accountShell, accessShell } = createPlatformState();
  const { server, baseUrl } = await listen(createApp(fakeState({
    leadQueue,
    accountShell,
    accessShell
  })));
  try {
    const response = await fetch(`${baseUrl}/api/admin/platform/channel-runtime-evidence-bridge`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        dryRunSummary: {
          ok: true,
          servers: [
            { name: "https://runtime-secret.example?token=unsafe", protocol: "tuic", qualityClass: "weak-network" }
          ]
        },
        measurementScore: {
          ...channelMeasurementScore(),
          candidates: [
            {
              ...channelMeasurementScore().candidates[0],
              name: "198.51.100.7:443"
            }
          ]
        },
        runtimeEvidenceInput: channelRuntimeEvidenceInput()
      })
    });

    assert.equal(response.status, 400);
    const serialized = JSON.stringify(await response.json());
    assert.equal(serialized.includes("runtime-secret.example"), false);
    assert.equal(serialized.includes("198.51.100.7"), false);
    assert.equal(serialized.includes("token=unsafe"), false);
    assert.equal(serialized.includes("validation_error"), true);
  } finally {
    server.close();
  }
});

test("admin platform channel runtime gate workbench route is protected and returns gate-ready evidence", async () => {
  const { leadQueue, accountShell, accessShell } = createPlatformState();
  const { server, baseUrl } = await listen(createApp(fakeState({
    leadQueue,
    accountShell,
    accessShell
  })));
  try {
    const unauthenticated = await fetch(`${baseUrl}/api/admin/platform/channel-runtime-gate-workbench`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(unauthenticated.status, 401);

    const response = await fetch(`${baseUrl}/api/admin/platform/channel-runtime-gate-workbench`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        dryRunSummary: channelSafeDryRunSummary(),
        measurementScore: channelMeasurementScore(),
        runtimeEvidenceInput: channelRuntimeEvidenceInput()
      })
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.channelRuntimeGateWorkbench.mode, "channel-runtime-gate-workbench");
    assert.equal(body.channelRuntimeGateWorkbench.gate.status, "approval_ready");
    assert.equal(body.channelRuntimeGateWorkbench.gate.approvalRequestReady, true);
    assert.equal(body.channelRuntimeGateWorkbench.gate.approvalPolicy.approvalPhraseEchoed, false);
    assert.equal(body.channelRuntimeGateWorkbench.safety.noRuntimeMutation, true);
    assert.equal(body.channelRuntimeGateWorkbench.safety.noApprovalSubmission, true);
    assert.equal(body.channelRuntimeGateWorkbench.safety.noTrafficMovement, true);

    const serialized = JSON.stringify(body);
    assert.equal(serialized.includes("ss.secret.example"), false);
    assert.equal(serialized.includes("tuic.secret.example"), false);
    assert.equal(serialized.includes("\"host\""), false);
    assert.equal(serialized.includes("\"port\""), false);
    assert.doesNotMatch(serialized, /"approvalPhrase"\s*:/);
    assert.equal(serialized.includes("token="), false);
  } finally {
    server.close();
  }
});

test("admin platform channel runtime gate workbench route rejects unsafe input without echoing it", async () => {
  const { leadQueue, accountShell, accessShell } = createPlatformState();
  const { server, baseUrl } = await listen(createApp(fakeState({
    leadQueue,
    accountShell,
    accessShell
  })));
  try {
    const response = await fetch(`${baseUrl}/api/admin/platform/channel-runtime-gate-workbench`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        dryRunSummary: channelSafeDryRunSummary(),
        measurementScore: channelMeasurementScore(),
        runtimeEvidenceInput: channelRuntimeEvidenceInput({
          candidateName: "203.0.113.10:443",
          targetLabel: "runtime-secret.example"
        })
      })
    });

    assert.equal(response.status, 400);
    const serialized = JSON.stringify(await response.json());
    assert.equal(serialized.includes("203.0.113.10"), false);
    assert.equal(serialized.includes("runtime-secret.example"), false);
    assert.equal(serialized.includes("443"), false);
    assert.equal(serialized.includes("validation_error"), true);
  } finally {
    server.close();
  }
});

test("admin platform channel runtime execution handoff route is protected and returns advisory packet", async () => {
  const { leadQueue, accountShell, accessShell } = createPlatformState();
  const { server, baseUrl } = await listen(createApp(fakeState({
    leadQueue,
    accountShell,
    accessShell
  })));
  try {
    const unauthenticated = await fetch(`${baseUrl}/api/admin/platform/channel-runtime-execution-handoff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(unauthenticated.status, 401);

    const response = await fetch(`${baseUrl}/api/admin/platform/channel-runtime-execution-handoff`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        dryRunSummary: channelSafeDryRunSummary(),
        measurementScore: channelMeasurementScore(),
        runtimeEvidenceInput: channelRuntimeEvidenceInput()
      })
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.channelRuntimeExecutionHandoff.mode, "channel-runtime-execution-handoff-packet");
    assert.equal(body.channelRuntimeExecutionHandoff.handoff.status, "ready_for_operator_approval_request");
    assert.equal(body.channelRuntimeExecutionHandoff.handoff.executionAuthority, "not_granted");
    assert.equal(body.channelRuntimeExecutionHandoff.handoff.nextGate.approvalRequestReady, true);
    assert.equal(body.channelRuntimeExecutionHandoff.handoff.nextGate.approvalSubmissionRoute, null);
    assert.equal(body.channelRuntimeExecutionHandoff.handoff.nextGate.runtimeExecutionRoute, null);
    assert.equal(body.channelRuntimeExecutionHandoff.safety.noRuntimeMutation, true);
    assert.equal(body.channelRuntimeExecutionHandoff.safety.noApprovalSubmission, true);
    assert.equal(body.channelRuntimeExecutionHandoff.safety.noTrafficMovement, true);

    const serialized = JSON.stringify(body);
    assert.equal(serialized.includes("ss.secret.example"), false);
    assert.equal(serialized.includes("tuic.secret.example"), false);
    assert.equal(serialized.includes("\"host\""), false);
    assert.equal(serialized.includes("\"port\""), false);
    assert.doesNotMatch(serialized, /"approvalPhrase"\s*:/);
    assert.equal(serialized.includes("token="), false);
  } finally {
    server.close();
  }
});

test("admin platform channel runtime execution handoff route rejects unsafe input without echoing it", async () => {
  const { leadQueue, accountShell, accessShell } = createPlatformState();
  const { server, baseUrl } = await listen(createApp(fakeState({
    leadQueue,
    accountShell,
    accessShell
  })));
  try {
    const response = await fetch(`${baseUrl}/api/admin/platform/channel-runtime-execution-handoff`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        dryRunSummary: channelSafeDryRunSummary(),
        measurementScore: channelMeasurementScore(),
        runtimeEvidenceInput: channelRuntimeEvidenceInput({
          candidateName: "203.0.113.10:443",
          targetLabel: "runtime-secret.example"
        })
      })
    });

    assert.equal(response.status, 400);
    const serialized = JSON.stringify(await response.json());
    assert.equal(serialized.includes("203.0.113.10"), false);
    assert.equal(serialized.includes("runtime-secret.example"), false);
    assert.equal(serialized.includes("443"), false);
    assert.equal(serialized.includes("validation_error"), true);
  } finally {
    server.close();
  }
});

test("admin platform channel lab target decision route is protected and returns advisory target gate", async () => {
  const { leadQueue, accountShell, accessShell } = createPlatformState();
  const { server, baseUrl } = await listen(createApp(fakeState({
    leadQueue,
    accountShell,
    accessShell
  })));
  try {
    const unauthenticated = await fetch(`${baseUrl}/api/admin/platform/channel-lab-target-decision`, {
      method: "POST"
    });
    assert.equal(unauthenticated.status, 401);

    const response = await fetch(`${baseUrl}/api/admin/platform/channel-lab-target-decision`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        inventory: {
          targetLabel: "channel-lab-a",
          protocol: "tuic",
          lifecycleStatus: "running",
          checks: {
            cloudIdentityVerified: true,
            networkPostureVerified: true,
            sshBannerReachable: false,
            ssmRegistered: false,
            hostInventoryCompleted: false,
            incumbentRuntimePresent: true,
            incumbentRuntimeProtocol: "hysteria2",
            candidatePortPlanRecorded: false,
            cleanupDecisionRecorded: false
          },
          blockerCodes: ["ssh_banner_timeout", "ssm_unavailable"],
          nextGate: "channel_lab_b_selection_gate"
        }
      })
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.channelLabTargetDecision.mode, "channel-lab-target-decision");
    assert.equal(body.channelLabTargetDecision.status, "fresh_target_recommended");
    assert.equal(body.channelLabTargetDecision.requiredNextAction, "request_channel_lab_b_selection_gate");
    assert.equal(body.channelLabTargetDecision.nextGate.gate, "risk_a_channel_lab_b_selection");
    assert.equal(body.channelLabTargetDecision.nextGate.approvalSubmissionRoute, null);
    assert.equal(body.channelLabTargetDecision.nextGate.runtimeExecutionRoute, null);
    assert.equal(body.channelLabTargetDecision.safety.noRuntimeMutation, true);
    assert.equal(body.channelLabTargetDecision.safety.noApprovalSubmission, true);
  } finally {
    server.close();
  }
});

test("admin platform channel lab target decision route rejects unsafe inventory without echoing it", async () => {
  const { leadQueue, accountShell, accessShell } = createPlatformState();
  const { server, baseUrl } = await listen(createApp(fakeState({
    leadQueue,
    accountShell,
    accessShell
  })));
  try {
    const response = await fetch(`${baseUrl}/api/admin/platform/channel-lab-target-decision`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        inventory: {
          targetLabel: "channel-lab-a",
          protocol: "tuic",
          host: "203.0.113.10",
          port: 443,
          note: "runtime-secret.example token=hidden"
        }
      })
    });
    assert.equal(response.status, 400);
    const serialized = JSON.stringify(await response.json());
    assert.equal(serialized.includes("203.0.113.10"), false);
    assert.equal(serialized.includes("443"), false);
    assert.equal(serialized.includes("runtime-secret.example"), false);
    assert.equal(serialized.includes("token=hidden"), false);
  } finally {
    server.close();
  }
});

test("admin platform channel system decision route rejects unsafe runtime evidence without echoing it", async () => {
  const { leadQueue, accountShell, accessShell } = createPlatformState();
  const { server, baseUrl } = await listen(createApp(fakeState({
    leadQueue,
    accountShell,
    accessShell
  })));
  try {
    const response = await fetch(`${baseUrl}/api/admin/platform/channel-system-decision-flow`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        dryRunSummary: channelDryRunSummary(),
        measurementScore: channelMeasurementScore(),
        runtimeInventoryInput: channelRuntimeInventoryInput({
          host: "runtime-secret.example",
          port: 443,
          token: "token=runtime-secret"
        })
      })
    });

    assert.equal(response.status, 400);
    const serialized = JSON.stringify(await response.json());
    assert.equal(serialized.includes("runtime-secret.example"), false);
    assert.equal(serialized.includes("443"), false);
    assert.equal(serialized.includes("token=runtime-secret"), false);
    assert.equal(serialized.includes("validation_error"), true);
  } finally {
    server.close();
  }
});
