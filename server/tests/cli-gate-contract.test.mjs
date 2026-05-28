import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  CLI_GATE_CONTRACT_SCHEMA_VERSION,
  buildCliCommandManifest,
  evaluateCliGateRequest
} from "../services/cli-gate-contract.mjs";

test("CLI command manifest is closed, typed, and contains no shell passthrough", () => {
  const manifest = buildCliCommandManifest();

  assert.equal(manifest.schemaVersion, CLI_GATE_CONTRACT_SCHEMA_VERSION);
  assert.equal(manifest.defaultMode, "dry-run");
  assert.equal(manifest.allowsShellPassthrough, false);
  assert.equal(manifest.commands["shell.exec"], undefined);
  assert.equal(manifest.commands["platform.resource-package"].riskTier, "B");
  assert.equal(manifest.commands["platform.resource-package"].executionAuthority, "local_only");
  assert.equal(manifest.commands["platform.access-inventory.summary"].riskTier, "B");
  assert.equal(manifest.commands["channel.subscription.activation-package"].executionAuthority, "not_granted");
  assert.equal(
    manifest.commands["channel.subscription.activation-package"].requiredNextAction,
    "request_risk_a_subscription_output_activation_approval"
  );
});

test("CLI gate fails closed for unknown commands and customer access to operator commands", () => {
  assert.deepEqual(evaluateCliGateRequest({ commandId: "missing.command" }), {
    ok: false,
    commandId: "missing.command",
    status: "blocked",
    reason: "unknown_command",
    executionAuthority: "not_granted",
    safety: { noSideEffects: true, redacted: true }
  });

  const customerResult = evaluateCliGateRequest({
    commandId: "platform.clean-edge.readiness",
    actorType: "customer",
    mode: "dry-run"
  });

  assert.equal(customerResult.ok, false);
  assert.equal(customerResult.reason, "actor_not_allowed");
  assert.equal(customerResult.executionAuthority, "not_granted");
});

test("CLI gate allows B/C dry-runs but blocks apply for A-tier handoff commands", () => {
  const localSummary = evaluateCliGateRequest({
    commandId: "platform.resource-package",
    actorType: "operator",
    mode: "dry-run",
    input: { generatedAt: "2026-05-28T10:00:00.000Z", aggregateOnly: true }
  });

  assert.equal(localSummary.ok, true);
  assert.equal(localSummary.status, "allowed");
  assert.equal(localSummary.executionAuthority, "local_only");
  assert.equal(localSummary.sideEffectClass, "local_artifact");
  assert.equal(localSummary.requiredNextAction, "build_operator_safe_resource_package_or_fix_blockers");

  const activationApply = evaluateCliGateRequest({
    commandId: "channel.subscription.activation-package",
    actorType: "operator",
    mode: "apply",
    input: { generatedAt: "2026-05-28T10:00:00.000Z" }
  });

  assert.equal(activationApply.ok, false);
  assert.equal(activationApply.status, "blocked");
  assert.equal(activationApply.reason, "a_tier_handoff_only");
  assert.equal(activationApply.executionAuthority, "not_granted");
  assert.equal(activationApply.requiredNextAction, "request_risk_a_subscription_output_activation_approval");
});

test("CLI gate rejects sensitive input fields without echoing submitted values", () => {
  const result = evaluateCliGateRequest({
    commandId: "platform.access-inventory.summary",
    actorType: "operator",
    mode: "dry-run",
    input: {
      token: "pgsub_visible_once_secret",
      subscriptionUrl: "https://gateway.example/sub/clash.yaml?token=secret",
      nested: { apiSecret: "hidden" }
    }
  });

  const serialized = JSON.stringify(result);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "forbidden_input_field");
  assert.equal(serialized.includes("pgsub_visible_once_secret"), false);
  assert.equal(serialized.includes("https://gateway.example"), false);
  assert.equal(serialized.includes("hidden"), false);
});

test("CLI gate contract script prints safe manifest or evaluation JSON", () => {
  const manifest = JSON.parse(execFileSync(process.execPath, [
    "scripts/cli-gate-contract.mjs",
    "manifest"
  ], { encoding: "utf8" }));

  assert.equal(manifest.allowsShellPassthrough, false);
  assert.equal(manifest.commands["platform.clean-edge.readiness"].riskTier, "A");

  const dir = mkdtempSync(join(tmpdir(), "cli-gate-contract-"));
  const requestPath = join(dir, "request.json");
  writeFileSync(requestPath, JSON.stringify({
    commandId: "customer.network.diagnose",
    actorType: "customer",
    mode: "dry-run",
    input: { clientProfile: "mihomo", includeRawLogs: false }
  }));

  const evaluated = JSON.parse(execFileSync(process.execPath, [
    "scripts/cli-gate-contract.mjs",
    "evaluate",
    requestPath
  ], { encoding: "utf8" }));

  assert.equal(evaluated.ok, true);
  assert.equal(evaluated.commandId, "customer.network.diagnose");
  assert.equal(evaluated.executionAuthority, "local_only");
});
