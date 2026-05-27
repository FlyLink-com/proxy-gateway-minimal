import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildChannelSubscriptionActivationFlow } from "../services/channel-subscription-activation-flow.mjs";

const fixtureModule = await import("../services/channel-subscription-activation-flow-fixture.mjs").catch(() => ({}));
const {
  CHANNEL_SUBSCRIPTION_ACTIVATION_FLOW_FIXTURE_SCHEMA_VERSION,
  createChannelSubscriptionActivationFlowFixture,
  replayChannelSubscriptionActivationFlowFixture
} = fixtureModule;

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
    generatedAt: "2026-05-28T11:00:00.000Z",
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
        channelScore: 95,
        recommendedPool: "canary",
        reasonCodes: ["candidate_requires_canary"]
      }
    ]
  };
}

function runtimeEvidenceInput() {
  return {
    generatedAt: "2026-05-28T11:01:00.000Z",
    records: [
      {
        candidateName: "tuic-lab",
        protocol: "tuic",
        targetLabel: "channel-lab-b",
        observedAt: "2026-05-28T11:01:00.000Z",
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

function activationFlow() {
  return buildChannelSubscriptionActivationFlow({
    dryRunSummary: dryRunSummary(),
    measurementScore: measurementScore(),
    runtimeEvidenceInput: runtimeEvidenceInput(),
    generatedAt: "2026-05-28T11:03:00.000Z"
  });
}

function withTempJson(payload, fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "channel-activation-flow-fixture-"));
  try {
    const payloadPath = join(tempDir, "payload.json");
    writeFileSync(payloadPath, JSON.stringify(payload, null, 2));
    return fn(payloadPath);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

test("channel subscription activation flow fixture helpers are exported", () => {
  assert.equal(CHANNEL_SUBSCRIPTION_ACTIVATION_FLOW_FIXTURE_SCHEMA_VERSION, "channel-subscription-activation-flow-fixture/v1");
  assert.equal(typeof createChannelSubscriptionActivationFlowFixture, "function");
  assert.equal(typeof replayChannelSubscriptionActivationFlowFixture, "function");
});

test("channel subscription activation flow fixture stores a safe replayable packet", () => {
  const flow = activationFlow();
  const fixture = createChannelSubscriptionActivationFlowFixture(flow, {
    generatedAt: "2026-05-28T11:04:00.000Z"
  });

  assert.equal(fixture.schemaVersion, CHANNEL_SUBSCRIPTION_ACTIVATION_FLOW_FIXTURE_SCHEMA_VERSION);
  assert.equal(fixture.generatedAt, "2026-05-28T11:04:00.000Z");
  assert.equal(fixture.sourceGeneratedAt, "2026-05-28T11:03:00.000Z");
  assert.equal(fixture.activationFlow.mode, "channel-subscription-activation-flow");
  assert.equal(fixture.activationFlow.flowStatus, "ready_for_a_tier_subscription_output_activation_request");
  assert.equal(fixture.activationFlow.gate.executionAuthority, "not_granted");
  assert.equal(fixture.activationFlow.gate.approvalSubmissionRoute, null);
  assert.equal(fixture.activationFlow.gate.subscriptionOutputExecutionRoute, null);
  assert.equal(fixture.safety.fixtureOnly, true);
  assert.equal(fixture.safety.noSubscriptionOutputMutation, true);
  assert.equal(fixture.safety.noApprovalSubmission, true);
  assert.doesNotMatch(JSON.stringify(fixture), /secret\.example|token=|"host"\s*:|"port"\s*:|approvalPhrase/i);
});

test("channel subscription activation flow fixture replay returns advisory summary without executing activation", () => {
  const fixture = createChannelSubscriptionActivationFlowFixture(activationFlow(), {
    generatedAt: "2026-05-28T11:04:00.000Z"
  });
  const replay = replayChannelSubscriptionActivationFlowFixture(fixture, {
    generatedAt: "2026-05-28T11:05:00.000Z"
  });

  assert.equal(replay.ok, true);
  assert.equal(replay.mode, "channel-subscription-activation-flow-fixture-replay");
  assert.equal(replay.generatedAt, "2026-05-28T11:05:00.000Z");
  assert.equal(replay.schemaVersion, CHANNEL_SUBSCRIPTION_ACTIVATION_FLOW_FIXTURE_SCHEMA_VERSION);
  assert.equal(replay.fixtureGeneratedAt, "2026-05-28T11:04:00.000Z");
  assert.equal(replay.sourceGeneratedAt, "2026-05-28T11:03:00.000Z");
  assert.equal(replay.flowStatus, "ready_for_a_tier_subscription_output_activation_request");
  assert.equal(replay.requiredNextAction, "request_risk_a_subscription_output_activation_approval");
  assert.equal(replay.gate.executionAuthority, "not_granted");
  assert.equal(replay.gate.approvalSubmissionRoute, null);
  assert.equal(replay.gate.subscriptionOutputExecutionRoute, null);
  assert.equal(replay.gate.executesGate, false);
  assert.equal(replay.activationFlow.mode, "channel-subscription-activation-flow");
  assert.equal(replay.safety.replayOnly, true);
  assert.equal(replay.safety.noRuntimeMutation, true);
  assert.equal(replay.safety.noSubscriptionOutputMutation, true);
  assert.equal(replay.safety.noTrafficMovement, true);
  assert.equal(replay.safety.noApprovalSubmission, true);
  assert.doesNotMatch(JSON.stringify(replay), /secret\.example|token=|"host"\s*:|"port"\s*:|approvalPhrase/i);
});

test("channel subscription activation flow fixture rejects unsupported metadata without echoing it", () => {
  const fixture = createChannelSubscriptionActivationFlowFixture(activationFlow());

  assert.throws(
    () => replayChannelSubscriptionActivationFlowFixture({
      ...fixture,
      rawSecret: "secret-token-value"
    }),
    (error) => {
      assert.match(error.message, /activation flow fixture contains unsupported metadata/);
      assert.doesNotMatch(error.message, /secret-token-value|rawSecret/);
      return true;
    }
  );
});

test("channel subscription activation flow fixture rejects unsafe packets without echoing them", () => {
  const flow = activationFlow();

  assert.throws(
    () => createChannelSubscriptionActivationFlowFixture({
      ...flow,
      host: "secret.example",
      runtimeUrl: "https://secret.example/path?token=unsafe"
    }),
    (error) => {
      assert.match(error.message, /channel subscription activation flow fixture contains unsafe runtime details/);
      assert.doesNotMatch(error.message, /secret\.example|token=unsafe|runtimeUrl/);
      return true;
    }
  );

  assert.throws(
    () => createChannelSubscriptionActivationFlowFixture({
      ...flow,
      runtimeUrl: "redacted"
    }),
    (error) => {
      assert.match(error.message, /channel subscription activation flow fixture contains unsafe runtime details/);
      assert.doesNotMatch(error.message, /runtimeUrl|redacted/);
      return true;
    }
  );
});

test("channel subscription activation flow fixture and replay CLIs print safe JSON", () => {
  const flow = activationFlow();
  withTempJson(
    { channelSubscriptionActivationFlow: flow },
    (flowPath) => {
      const fixtureStdout = execFileSync(process.execPath, ["scripts/channel-subscription-activation-flow-fixture.mjs", flowPath], {
        cwd: new URL("../../", import.meta.url),
        encoding: "utf8"
      });
      const fixture = JSON.parse(fixtureStdout);
      assert.equal(fixture.schemaVersion, CHANNEL_SUBSCRIPTION_ACTIVATION_FLOW_FIXTURE_SCHEMA_VERSION);
      assert.equal(fixture.activationFlow.mode, "channel-subscription-activation-flow");
      assert.doesNotMatch(fixtureStdout, /secret\.example|token=|"host"\s*:|"port"\s*:|approvalPhrase/i);

      withTempJson(fixture, (fixturePath) => {
        const replayStdout = execFileSync(process.execPath, ["scripts/channel-subscription-activation-flow-replay.mjs", fixturePath], {
          cwd: new URL("../../", import.meta.url),
          encoding: "utf8"
        });
        const replay = JSON.parse(replayStdout);
        assert.equal(replay.mode, "channel-subscription-activation-flow-fixture-replay");
        assert.equal(replay.flowStatus, "ready_for_a_tier_subscription_output_activation_request");
        assert.equal(replay.gate.executesGate, false);
        assert.doesNotMatch(replayStdout, /secret\.example|token=|"host"\s*:|"port"\s*:|approvalPhrase/i);
      });
    }
  );
});
