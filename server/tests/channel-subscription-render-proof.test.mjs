import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildChannelSubscriptionActivationFlow } from "../services/channel-subscription-activation-flow.mjs";
import { createChannelSubscriptionActivationFlowFixture } from "../services/channel-subscription-activation-flow-fixture.mjs";

const renderProofModule = await import("../services/channel-subscription-render-proof.mjs").catch(() => ({}));
const { buildChannelSubscriptionRenderProof } = renderProofModule;

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
    generatedAt: "2026-05-28T12:00:00.000Z",
    candidates: [
      {
        name: "ss-baseline",
        protocol: "ss",
        qualityClass: "stable",
        qualityTier: "healthy",
        channelScore: 99,
        recommendedPool: "stable",
        reasonCodes: ["stable_baseline_healthy"]
      },
      {
        name: "tuic-lab",
        protocol: "tuic",
        qualityClass: "weak-network",
        qualityTier: "healthy",
        channelScore: 96,
        recommendedPool: "canary",
        reasonCodes: ["candidate_requires_canary"]
      }
    ]
  };
}

function runtimeEvidenceInput() {
  return {
    generatedAt: "2026-05-28T12:01:00.000Z",
    records: [
      {
        candidateName: "tuic-lab",
        protocol: "tuic",
        targetLabel: "channel-lab-b",
        observedAt: "2026-05-28T12:01:00.000Z",
        checks: {
          cloudIdentityVerified: true,
          networkPostureVerified: true,
          hostInventoryCompleted: true,
          runtimeSlotAvailable: true,
          runtimeInstalled: true,
          serviceActive: true,
          operatorImportValidated: true,
          cleanupRequired: false
        },
        blockerCodes: [],
        nextGate: "subscription_output_activation_approval"
      }
    ]
  };
}

function activationFixture() {
  const flow = buildChannelSubscriptionActivationFlow({
    dryRunSummary: dryRunSummary(),
    measurementScore: measurementScore(),
    runtimeEvidenceInput: runtimeEvidenceInput(),
    generatedAt: "2026-05-28T12:03:00.000Z"
  });
  return createChannelSubscriptionActivationFlowFixture(flow, {
    generatedAt: "2026-05-28T12:04:00.000Z"
  });
}

function proxyConfig() {
  return {
    servers: [
      {
        id: "node_ss",
        name: "ss-baseline",
        protocol: "ss",
        host: "ss.secret.example",
        port: 18388,
        method: "aes-256-gcm",
        password: "ss-secret",
        qualityClass: "stable"
      },
      {
        id: "node_tuic",
        name: "tuic-lab",
        protocol: "tuic",
        host: "tuic.secret.example",
        port: 10443,
        uuid: "22222222-2222-4222-8222-222222222222",
        password: "tuic-secret",
        token: "tuic-token",
        udpRelayMode: "native",
        congestionController: "bbr",
        qualityClass: "weak-network"
      },
      {
        id: "node_private",
        name: "private-lab",
        protocol: "hysteria2",
        host: "private.secret.example",
        port: 443,
        password: "private-secret",
        channelPool: "private"
      }
    ],
    pingHosts: ["sub.secret.example"],
    nginx: { host: "gateway.secret.example", ports: [443] }
  };
}

function withTempJson(payload, fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "channel-subscription-render-proof-"));
  try {
    const payloadPath = join(tempDir, "payload.json");
    writeFileSync(payloadPath, JSON.stringify(payload, null, 2));
    return fn(payloadPath);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

test("channel subscription render proof helper is exported", () => {
  assert.equal(typeof buildChannelSubscriptionRenderProof, "function");
});

test("channel subscription render proof internally renders selected output without exposing YAML or secrets", () => {
  const proof = buildChannelSubscriptionRenderProof({
    fixture: activationFixture(),
    proxyConfig: proxyConfig(),
    generatedAt: "2026-05-28T12:05:00.000Z"
  });

  assert.equal(proof.ok, true);
  assert.equal(proof.mode, "channel-subscription-render-proof");
  assert.equal(proof.generatedAt, "2026-05-28T12:05:00.000Z");
  assert.equal(proof.status, "render_proof_ready_for_subscription_output_activation_request");
  assert.equal(proof.flowStatus, "ready_for_a_tier_subscription_output_activation_request");
  assert.deepEqual(proof.renderProof, {
    internalYamlRenderCompleted: true,
    yamlReturned: false,
    renderedProxyCount: 2,
    generatedYamlBytes: proof.renderProof.generatedYamlBytes,
    protocolCounts: { ss: 1, tuic: 1 },
    baseline: [{ name: "ss-baseline", protocol: "ss", qualityClass: "stable" }],
    canary: [{ name: "tuic-lab", protocol: "tuic", qualityClass: "weak-network" }]
  });
  assert.equal(proof.renderProof.generatedYamlBytes > 0, true);
  assert.equal(proof.gate.approvalRequestReady, true);
  assert.equal(proof.gate.executionAuthority, "not_granted");
  assert.equal(proof.safety.noSubscriptionOutputMutation, true);
  assert.equal(proof.safety.noRuntimeMutation, true);
  assert.equal(proof.safety.yamlNotReturned, true);

  assert.doesNotMatch(
    JSON.stringify(proof),
    /secret\.example|ss-secret|tuic-secret|tuic-token|22222222|"host"\s*:|"port"\s*:|https?:\/\//i
  );
});

test("channel subscription render proof blocks when fixture candidates are absent from config", () => {
  const config = proxyConfig();
  config.servers = config.servers.filter((server) => server.name !== "tuic-lab");

  const proof = buildChannelSubscriptionRenderProof({
    fixture: activationFixture(),
    proxyConfig: config
  });

  assert.equal(proof.status, "blocked_before_subscription_render_proof");
  assert.equal(proof.renderProof.internalYamlRenderCompleted, false);
  assert.deepEqual(proof.blockers, ["missing_subscription_output_config"]);
  assert.deepEqual(proof.missingCandidates, [
    { name: "tuic-lab", protocol: "tuic", qualityClass: "weak-network", pool: "canary" }
  ]);
  assert.equal(proof.safety.noSubscriptionOutputMutation, true);
  assert.doesNotMatch(JSON.stringify(proof), /secret\.example|tuic-secret|tuic-token|"host"\s*:|"port"\s*:/i);
});

test("channel subscription render proof blocks remote data-plane candidates without applied receipt", () => {
  const config = proxyConfig();
  config.servers[1].runtimeAdapter = "remote-data-plane-handoff";

  const proof = buildChannelSubscriptionRenderProof({
    fixture: activationFixture(),
    proxyConfig: config,
    remoteRenderGate: ({ servers }) => ({
      servers: servers.filter((server) => server.name !== "tuic-lab"),
      blockers: [{ channelRef: "tuic-lab", reasonCode: "missing_applied_receipt", redacted: true }]
    })
  });

  assert.equal(proof.status, "blocked_before_subscription_render_proof");
  assert.equal(proof.renderProof.internalYamlRenderCompleted, false);
  assert.deepEqual(proof.blockers, ["remote_data_plane_not_ready"]);
  assert.deepEqual(proof.remoteDataPlaneBlockers, [
    { channelRef: "tuic-lab", reasonCode: "missing-applied-receipt", redacted: true }
  ]);
  assert.equal(proof.safety.yamlNotReturned, true);
  assert.doesNotMatch(JSON.stringify(proof), /secret\.example|ss-secret|tuic-secret|tuic-token|22222222|"host"\s*:|"port"\s*:|https?:\/\//i);
});

test("channel subscription render proof rejects unsafe config labels without echoing details", () => {
  const config = proxyConfig();
  config.servers[1].name = "https://tuic.secret.example?token=unsafe";

  assert.throws(
    () => buildChannelSubscriptionRenderProof({
      fixture: activationFixture(),
      proxyConfig: config
    }),
    (error) => {
      assert.match(error.message, /channel subscription render proof contains unsafe config metadata/);
      assert.doesNotMatch(error.message, /tuic\.secret|token=unsafe|https:/);
      return true;
    }
  );
});

test("channel subscription render proof CLI prints safe JSON", () => {
  withTempJson(activationFixture(), (fixturePath) => {
    withTempJson(proxyConfig(), (configPath) => {
      const stdout = execFileSync(process.execPath, ["scripts/channel-subscription-render-proof.mjs", fixturePath, configPath], {
        cwd: new URL("../../", import.meta.url),
        encoding: "utf8"
      });

      const proof = JSON.parse(stdout);
      assert.equal(proof.mode, "channel-subscription-render-proof");
      assert.equal(proof.status, "render_proof_ready_for_subscription_output_activation_request");
      assert.equal(proof.renderProof.internalYamlRenderCompleted, true);
      assert.equal(proof.renderProof.yamlReturned, false);
      assert.doesNotMatch(
        stdout,
        /secret\.example|ss-secret|tuic-secret|tuic-token|22222222|"host"\s*:|"port"\s*:|https?:\/\//i
      );
    });
  });
});
