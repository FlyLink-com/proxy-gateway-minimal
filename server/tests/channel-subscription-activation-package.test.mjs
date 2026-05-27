import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildChannelSubscriptionActivationFlow } from "../services/channel-subscription-activation-flow.mjs";
import { createChannelSubscriptionActivationFlowFixture } from "../services/channel-subscription-activation-flow-fixture.mjs";

const packageModule = await import("../services/channel-subscription-activation-package.mjs").catch(() => ({}));
const { buildChannelSubscriptionActivationPackage } = packageModule;

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
    generatedAt: "2026-05-28T13:00:00.000Z",
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
    generatedAt: "2026-05-28T13:01:00.000Z",
    records: [
      {
        candidateName: "tuic-lab",
        protocol: "tuic",
        targetLabel: "channel-lab-b",
        observedAt: "2026-05-28T13:01:00.000Z",
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
    generatedAt: "2026-05-28T13:03:00.000Z"
  });
  return createChannelSubscriptionActivationFlowFixture(flow, {
    generatedAt: "2026-05-28T13:04:00.000Z"
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
      }
    ]
  };
}

function withTempJson(payload, fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "channel-subscription-activation-package-"));
  try {
    const payloadPath = join(tempDir, "payload.json");
    writeFileSync(payloadPath, JSON.stringify(payload, null, 2));
    return fn(payloadPath);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

test("channel subscription activation package helper is exported", () => {
  assert.equal(typeof buildChannelSubscriptionActivationPackage, "function");
});

test("channel subscription activation package requires render proof before approval request", () => {
  const activationPackage = buildChannelSubscriptionActivationPackage({
    fixture: activationFixture(),
    proxyConfig: proxyConfig(),
    generatedAt: "2026-05-28T13:05:00.000Z"
  });

  assert.equal(activationPackage.ok, true);
  assert.equal(activationPackage.mode, "channel-subscription-activation-package");
  assert.equal(activationPackage.status, "ready_for_risk_a_subscription_output_activation_request");
  assert.equal(activationPackage.generatedAt, "2026-05-28T13:05:00.000Z");
  assert.equal(activationPackage.package.renderProofReady, true);
  assert.equal(activationPackage.package.recordTemplateReady, true);
  assert.equal(activationPackage.package.approvalRequestReady, true);
  assert.equal(activationPackage.package.executionAuthority, "not_granted");
  assert.equal(activationPackage.package.requiredNextAction, "request_risk_a_subscription_output_activation_approval");
  assert.equal(activationPackage.renderProof.internalYamlRenderCompleted, true);
  assert.equal(activationPackage.renderProof.yamlReturned, false);
  assert.deepEqual(activationPackage.renderProof.protocolCounts, { ss: 1, tuic: 1 });
  assert.equal(activationPackage.recordTemplate.markdownReturned, false);
  assert.match(activationPackage.recordTemplate.suggestedPath, /channel-subscription-output-activation\.md$/);
  assert.equal(activationPackage.gate.approvalRequestReady, true);
  assert.equal(activationPackage.gate.executesGate, false);
  assert.equal(activationPackage.safety.noSubscriptionOutputMutation, true);
  assert.equal(activationPackage.safety.noRuntimeMutation, true);
  assert.equal(activationPackage.safety.yamlNotReturned, true);

  assert.doesNotMatch(
    JSON.stringify(activationPackage),
    /secret\.example|ss-secret|tuic-secret|tuic-token|22222222|"host"\s*:|"port"\s*:|https?:\/\//i
  );
});

test("channel subscription activation package blocks approval request when render proof is blocked", () => {
  const config = proxyConfig();
  config.servers = config.servers.filter((server) => server.name !== "tuic-lab");

  const activationPackage = buildChannelSubscriptionActivationPackage({
    fixture: activationFixture(),
    proxyConfig: config
  });

  assert.equal(activationPackage.status, "blocked_before_risk_a_subscription_output_activation_request");
  assert.equal(activationPackage.package.renderProofReady, false);
  assert.equal(activationPackage.package.recordTemplateReady, true);
  assert.equal(activationPackage.package.approvalRequestReady, false);
  assert.deepEqual(activationPackage.blockers, ["missing_subscription_output_config"]);
  assert.equal(activationPackage.renderProof.internalYamlRenderCompleted, false);
  assert.equal(activationPackage.gate.approvalRequestReady, false);
  assert.equal(activationPackage.safety.noSubscriptionOutputMutation, true);
  assert.doesNotMatch(JSON.stringify(activationPackage), /secret\.example|tuic-secret|tuic-token|"host"\s*:|"port"\s*:/i);
});

test("channel subscription activation package rejects unsafe config labels without echoing details", () => {
  const config = proxyConfig();
  config.servers[1].name = "https://tuic.secret.example?token=unsafe";

  assert.throws(
    () => buildChannelSubscriptionActivationPackage({
      fixture: activationFixture(),
      proxyConfig: config
    }),
    (error) => {
      assert.match(error.message, /channel subscription activation package/);
      assert.doesNotMatch(error.message, /tuic\.secret|token=unsafe|https:/);
      return true;
    }
  );
});

test("channel subscription activation package CLI prints safe JSON", () => {
  withTempJson(activationFixture(), (fixturePath) => {
    withTempJson(proxyConfig(), (configPath) => {
      const stdout = execFileSync(process.execPath, ["scripts/channel-subscription-activation-package.mjs", fixturePath, configPath], {
        cwd: new URL("../../", import.meta.url),
        encoding: "utf8"
      });

      const activationPackage = JSON.parse(stdout);
      assert.equal(activationPackage.mode, "channel-subscription-activation-package");
      assert.equal(activationPackage.status, "ready_for_risk_a_subscription_output_activation_request");
      assert.equal(activationPackage.package.renderProofReady, true);
      assert.equal(activationPackage.renderProof.yamlReturned, false);
      assert.doesNotMatch(
        stdout,
        /secret\.example|ss-secret|tuic-secret|tuic-token|22222222|"host"\s*:|"port"\s*:|https?:\/\//i
      );
    });
  });
});
