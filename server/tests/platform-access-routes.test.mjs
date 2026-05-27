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
  } finally {
    server.close();
  }
});
