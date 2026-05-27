import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildChannelSubscriptionActivationFlow } from "../services/channel-subscription-activation-flow.mjs";
import { createChannelSubscriptionActivationFlowFixture } from "../services/channel-subscription-activation-flow-fixture.mjs";

const templateModule = await import("../services/channel-subscription-activation-record-template.mjs").catch(() => ({}));
const { buildChannelSubscriptionActivationRecordTemplate } = templateModule;

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

function activationFixture() {
  const flow = buildChannelSubscriptionActivationFlow({
    dryRunSummary: dryRunSummary(),
    measurementScore: measurementScore(),
    runtimeEvidenceInput: runtimeEvidenceInput(),
    generatedAt: "2026-05-28T11:03:00.000Z"
  });
  return createChannelSubscriptionActivationFlowFixture(flow, {
    generatedAt: "2026-05-28T11:04:00.000Z"
  });
}

function withTempJson(payload, fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "channel-activation-record-template-"));
  try {
    const payloadPath = join(tempDir, "payload.json");
    writeFileSync(payloadPath, JSON.stringify(payload, null, 2));
    return fn(payloadPath);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

test("channel subscription activation record template helper is exported", () => {
  assert.equal(typeof buildChannelSubscriptionActivationRecordTemplate, "function");
});

test("channel subscription activation record template turns a fixture into safe Markdown", () => {
  const template = buildChannelSubscriptionActivationRecordTemplate(activationFixture(), {
    generatedAt: "2026-05-28T11:06:00.000Z",
    recordDate: "2026-05-28"
  });

  assert.equal(template.ok, true);
  assert.equal(template.mode, "channel-subscription-activation-record-template");
  assert.equal(template.generatedAt, "2026-05-28T11:06:00.000Z");
  assert.equal(
    template.record.suggestedPath,
    "docs/production-replacement-records/2026-05-28-channel-subscription-output-activation.md"
  );
  assert.equal(template.source.flowStatus, "ready_for_a_tier_subscription_output_activation_request");
  assert.equal(template.source.requiredNextAction, "request_risk_a_subscription_output_activation_approval");
  assert.equal(template.readiness.approvalRequestReady, true);
  assert.equal(template.readiness.executionAuthority, "not_granted");
  assert.deepEqual(template.readiness.blockers, []);
  assert.equal(template.safety.templateOnly, true);
  assert.equal(template.safety.noApprovalSubmission, true);
  assert.equal(template.safety.noSubscriptionOutputMutation, true);
  assert.equal(template.safety.noRuntimeMutation, true);

  assert.match(template.record.markdown, /^# Channel Subscription Output Activation Execution Record/m);
  assert.match(template.record.markdown, /Execution authority: not granted by this template/);
  assert.match(template.record.markdown, /Source fixture generated at: 2026-05-28T11:04:00.000Z/);
  assert.match(template.record.markdown, /Flow status: ready_for_a_tier_subscription_output_activation_request/);
  assert.match(template.record.markdown, /Approval evidence: TODO record operator approval reference; do not paste exact text/);
  assert.match(template.record.markdown, /Validation Evidence/);
  assert.match(template.record.markdown, /Rollback Evidence/);
  assert.match(template.record.markdown, /Not Performed/);
  assert.doesNotMatch(JSON.stringify(template), /secret\.example|token=|"host"\s*:|"port"\s*:|approvalPhrase|https?:\/\//i);
});

test("channel subscription activation record template stays blocked when fixture is not approval ready", () => {
  const fixture = activationFixture();
  fixture.activationFlow.flowStatus = "blocked_before_a_tier_subscription_output_activation_request";
  fixture.activationFlow.requiredNextAction = "resolve_subscription_output_activation_blockers";
  fixture.activationFlow.blockers = ["runtime_canary_not_completed"];
  fixture.activationFlow.gate.approvalRequestReady = false;

  const template = buildChannelSubscriptionActivationRecordTemplate(fixture, {
    generatedAt: "2026-05-28T11:06:00.000Z",
    recordDate: "2026-05-28"
  });

  assert.equal(template.readiness.approvalRequestReady, false);
  assert.deepEqual(template.readiness.blockers, ["runtime_canary_not_completed"]);
  assert.match(template.record.markdown, /Readiness: blocked_before_a_tier_subscription_output_activation_request/);
  assert.match(template.record.markdown, /- runtime_canary_not_completed/);
  assert.match(template.record.markdown, /Required next action: resolve_subscription_output_activation_blockers/);
});

test("channel subscription activation record template rejects unsafe fixtures without echoing details", () => {
  const fixture = activationFixture();

  assert.throws(
    () => buildChannelSubscriptionActivationRecordTemplate({
      ...fixture,
      rawUrl: "https://secret.example/path?token=unsafe"
    }),
    (error) => {
      assert.match(error.message, /activation flow fixture contains unsupported metadata|unsafe runtime details/);
      assert.doesNotMatch(error.message, /secret\.example|token=unsafe|rawUrl/);
      return true;
    }
  );
});

test("channel subscription activation record template CLI prints safe Markdown", () => {
  withTempJson(activationFixture(), (fixturePath) => {
    const stdout = execFileSync(process.execPath, ["scripts/channel-subscription-activation-record-template.mjs", fixturePath], {
      cwd: new URL("../../", import.meta.url),
      encoding: "utf8"
    });

    assert.match(stdout, /^# Channel Subscription Output Activation Execution Record/m);
    assert.match(stdout, /Execution authority: not granted by this template/);
    assert.match(stdout, /No DNS, Nginx, firewall, systemd, cloud, SQLite, artifact, or user-traffic mutation is performed by this template/);
    assert.doesNotMatch(stdout, /secret\.example|token=|"host"\s*:|"port"\s*:|approvalPhrase|https?:\/\//i);
  });
});
