import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const module = await import("../services/channel-production-module.mjs").catch(() => ({}));
const { buildChannelProductionModule } = module;

function activationPackage(overrides = {}) {
  return {
    ok: true,
    mode: "channel-subscription-activation-package",
    status: "ready_for_risk_a_subscription_output_activation_request",
    package: {
      renderProofReady: true,
      recordTemplateReady: true,
      approvalRequestReady: true
    },
    renderProof: {
      protocolCounts: { ss: 1, tuic: 1 },
      canary: [
        {
          name: "tuic-lab",
          protocol: "tuic",
          qualityClass: "weak-network"
        }
      ]
    },
    gate: {
      risk: "A",
      gate: "risk_a_subscription_output_activation",
      approvalRequestReady: true,
      executesGate: false
    },
    safety: {
      noProductionMutation: true,
      noRuntimeMutation: true,
      noSubscriptionOutputMutation: true,
      yamlNotReturned: true
    },
    ...overrides
  };
}

function canaryEvidence(overrides = {}) {
  return {
    mode: "operator-device-channel-canary-summary",
    candidateName: "tuic-lab",
    protocol: "tuic",
    targetLabel: "channel-lab-b",
    sampleCount: 20,
    successCount: 20,
    failedCount: 0,
    p50TotalSec: 0.8287,
    p95TotalSec: 0.8371,
    maxTotalSec: 2.1476,
    logErrorCount: 0,
    runtimeActive: true,
    ...overrides
  };
}

function withTempJson(payload, fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "channel-production-module-"));
  try {
    const payloadPath = join(tempDir, "payload.json");
    writeFileSync(payloadPath, JSON.stringify(payload, null, 2));
    return fn(payloadPath);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

test("channel production module helper is exported", () => {
  assert.equal(typeof buildChannelProductionModule, "function");
});

test("channel production module prepares a safe TUIC production branch artifact without activation", () => {
  const productionModule = buildChannelProductionModule({
    activationPackage: activationPackage(),
    canaryEvidence: canaryEvidence(),
    generatedAt: "2026-05-28T14:00:00.000Z"
  });

  assert.equal(productionModule.ok, true);
  assert.equal(productionModule.mode, "channel-production-module");
  assert.equal(productionModule.generatedAt, "2026-05-28T14:00:00.000Z");
  assert.equal(productionModule.status, "ready_for_production_module_branch_review");
  assert.equal(productionModule.productionModule.protocol, "tuic");
  assert.equal(productionModule.productionModule.targetLabel, "channel-lab-b");
  assert.equal(productionModule.productionModule.shortCanaryPassed, true);
  assert.equal(productionModule.productionModule.activationPackageReady, true);
  assert.equal(productionModule.productionModule.productionActivationReady, false);
  assert.equal(productionModule.nextGate.risk, "A");
  assert.equal(productionModule.nextGate.executesGate, false);
  assert.equal(productionModule.safety.noProductionMutation, true);
  assert.equal(productionModule.safety.noSubscriptionOutputMutation, true);
  assert.equal(productionModule.safety.yamlReturned, false);

  assert.doesNotMatch(
    JSON.stringify(productionModule),
    /secret\.example|https?:\/\/|token=|password|uuid|privateKey|13\.114\.23\.32|"host"\s*:|"port"\s*:/i
  );
});

test("channel production module blocks when TUIC canary is not cleanly successful", () => {
  const productionModule = buildChannelProductionModule({
    activationPackage: activationPackage(),
    canaryEvidence: canaryEvidence({ successCount: 19, failedCount: 1 })
  });

  assert.equal(productionModule.status, "blocked_before_production_module_branch_review");
  assert.equal(productionModule.productionModule.shortCanaryPassed, false);
  assert.deepEqual(productionModule.blockers, ["short_canary_not_clean"]);
  assert.equal(productionModule.nextGate.requiredNextAction, "resolve_channel_production_module_blockers");
});

test("channel production module rejects sensitive canary evidence without echoing values", () => {
  assert.throws(
    () => buildChannelProductionModule({
      activationPackage: activationPackage(),
      canaryEvidence: canaryEvidence({
        host: "13.114.23.32",
        password: "secret-password",
        subscriptionUrl: "https://secret.example/sub/a/unsafe"
      })
    }),
    (error) => {
      assert.match(error.message, /channel production module/);
      assert.doesNotMatch(error.message, /13\.114\.23\.32|secret-password|secret\.example/);
      return true;
    }
  );
});

test("channel production module CLI prints safe JSON", () => {
  withTempJson(activationPackage(), (activationPath) => {
    withTempJson(canaryEvidence(), (canaryPath) => {
      const stdout = execFileSync(process.execPath, ["scripts/channel-production-module.mjs", activationPath, canaryPath], {
        cwd: new URL("../../", import.meta.url),
        encoding: "utf8"
      });

      const productionModule = JSON.parse(stdout);
      assert.equal(productionModule.mode, "channel-production-module");
      assert.equal(productionModule.status, "ready_for_production_module_branch_review");
      assert.doesNotMatch(
        stdout,
        /secret\.example|https?:\/\/|token=|password|uuid|privateKey|13\.114\.23\.32|"host"\s*:|"port"\s*:/i
      );
    });
  });
});
