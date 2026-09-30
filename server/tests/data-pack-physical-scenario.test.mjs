import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runDataPackPhysicalScenario } from "../../scripts/lib/data-pack-physical-scenario.mjs";
import { syntheticMeteringContinuation } from "./platform-coin-commerce-data-pack-metering-reset.fixture.mjs";

// This transport models auth and clear-mode counter behavior only. The stores,
// collector, accounting, desired-state and reset gates are the real source.
function transportFixture(fault = "") {
  let active = new Map();
  let counters = {};
  let applies = 0;
  const credentials = [];
  return {
    evidenceMode: "synthetic_transport",
    credentials,
    async applyState(input) {
      applies += 1;
      if (fault === "unsafe_foreign_error") {
        const error = new Error("password=synthetic-secret subscriptionUrl=synthetic-secret");
        error.code = "apply_synthetic_secret";
        throw error;
      }
      active = new Map(input.credentials.map((item) => [item.credentialRef, item.material.password]));
      credentials.push(...input.credentials);
      return {
        status: "applied", desiredStateRef: input.desiredStateRef,
        generation: fault === "wrong_receipt" || fault === "wrong_reset_receipt" && applies === 3
          ? "gen_wrong" : input.generation,
        materialDigests: input.materialDigests.map((item) => item.digest),
        credentialCount: input.credentials.length, configTest: true,
        serviceActive: true, listenerPresent: true, restarted: true
      };
    },
    async probeCredential(input, { slot }) {
      const allowed = active.get(input.credentialRef) === input.material.password;
      return { allowed: fault === "other_resource_disabled" && applies > 1 && slot === 1
        ? false : allowed, transferredBytes: allowed ? 1 : 0 };
    },
    async transferCredential(input, { bytes }) {
      assert.equal(active.get(input.credentialRef), input.material.password);
      counters[input.credentialRef] = { tx: bytes, rx: bytes };
      return { transferredBytes: bytes };
    },
    async readStats({ clear }) {
      assert.equal(clear, true);
      const result = fault === "no_growth" ? {} : counters;
      counters = {};
      if (fault === "unmapped_stats") result.edgecred_unmapped = { tx: 0, rx: 0 };
      if (fault === "scope_bleed" && Object.keys(result).length) {
        const other = [...active.keys()].find((ref) => !Object.hasOwn(result, ref));
        result[other] = { tx: 1, rx: 1 };
      }
      return result;
    },
    async recover() {
      if (fault === "recovery_duplicate_usage") {
        counters[[...active.keys()][0]] = { tx: 1, rx: 1 };
      }
      return { interrupted: true, recovered: true, serviceActive: true, listenerPresent: true };
    }
  };
}

// Explicit control-receipt fixture only: no full-metering journal, counter
// continuation, five-source collection or physical evidence is implemented.
function syntheticMeteringResetProvider(fault, calls) {
  return { evidenceMode: "synthetic_provider",
    async continueReset({ controlStore, resetScope, proof, nowFn }) {
      calls.push(proof.rotationRef);
      assert.equal(controlStore.beginCoinCommerceDataPackCredentialReset({ ...resetScope, now: nowFn() }).status,
        "edge_applied");
      await Promise.resolve();
      if (fault === "missing_metering_receipt") return { status: "complete" };
      if (fault === "unsafe_metering_error") throw new Error("password=synthetic-provider-private-detail");
      controlStore.recordCoinCommerceDataPackMeteringResetReceipt({ proof,
        continuation: syntheticMeteringContinuation(proof, { completedAt: nowFn() }), now: nowFn() });
      if (fault === "invalid_metering_receipt") {
        controlStore.rotateCoinCommerceDataPackEdgeCredential({ requestRef: proof.requestRef,
          entitlementRef: proof.entitlementRef, edgeChannelRef: proof.edgeChannelRef,
          edgeCredentialRef: proof.edgeCredentialRef, oldEdgeMaterialDigest: proof.newEdgeMaterialDigest,
          newEdgeMaterialDigest: `sha256:${"1".repeat(64)}`, now: nowFn() });
      }
    }
  };
}

async function withScenario(fault, check) {
  const directory = mkdtempSync(join(tmpdir(), "data-pack-scenario-"));
  const transport = transportFixture(fault);
  const meteringCalls = [];
  const meteringResetContinuation = fault === "missing_metering_provider" || fault === "physical_missing_metering_provider"
    ? undefined : syntheticMeteringResetProvider(fault, meteringCalls);
  if (fault === "invalid_metering_provider") meteringResetContinuation.continueReset = null;
  // This label is used only to test the contract rejection. The transport is
  // still injected and this test never claims that a physical process ran.
  if (["physical_missing_metering_provider", "physical_synthetic_metering_provider"].includes(fault)) {
    transport.evidenceMode = "physical_process";
  }
  try {
    await check(() => runDataPackPhysicalScenario({ runDir: directory, transport,
      meteringResetContinuation }), transport, meteringCalls);
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 30 });
  }
}

test("source scenario distinguishes seeded quota from injected collector evidence and rotates real artifacts", async () => {
  await withScenario("", async (run, transport, meteringCalls) => {
    const result = await run();
    assert.equal(result.ok, true);
    assert.equal(result.evidenceMode, "synthetic_transport");
    assert.equal(result.acceptanceScope.authenticatedPurchaseToDelivery, false);
    assert.equal(result.acceptanceScope.realSubscriptionArtifactRotation, true);
    assert.equal(result.acceptanceScope.fullMeteringMaterialContinuation, false);
    assert.equal(result.acceptanceScope.meteringResetReceiptValidated, true);
    assert.equal(meteringCalls.length, 1);
    assert.equal(result.resources.packA.quotaBytes, 100 * 1024 ** 3);
    assert.equal(result.resources.packB.quotaBytes, 200 * 1024 ** 3);
    assert.ok(result.resources.packA.seededBaselineBytes > 99 * 1024 ** 3);
    assert.equal(result.resources.packA.physicallyCollectedBytes, 0);
    assert.ok(result.resources.packA.collectorObservedBytes > 0);
    assert.equal(result.exhaustion.crossedByCollectorDelta, true);
    assert.deepEqual(result.exhaustion.newConnections,
      { packA: false, packB: true, timedPlan: true });
    assert.equal(result.rotation.usedBytesBefore, result.rotation.usedBytesAfter);
    assert.equal(result.rotation.meteringIdentityPreserved, true);
    assert.equal(result.rotation.oldCredentialAllowed, false);
    assert.equal(result.rotation.newCredentialAllowed, true);
    assert.equal(result.rotation.oldArtifactRevoked, true);
    assert.equal(result.recovery.usageUnchanged, true);
    assert.equal(result.recovery.resourceCountUnchanged, true);
    const serialized = JSON.stringify(result);
    for (const item of transport.credentials) {
      assert.equal(serialized.includes(item.credentialRef), false);
      assert.equal(serialized.includes(item.material.password), false);
      assert.equal(serialized.includes(item.material.uuid), false);
    }
    assert.doesNotMatch(serialized, /subscriptionUrl|desiredStateRef|materialDigest|tenantref_|artifactref_|rotationRef|proofDigest|activationId/);
  });
});

for (const [fault, code] of [
  ["no_growth", "collector_no_growth"],
  ["unmapped_stats", "collector_unmapped_stats"],
  ["wrong_receipt", "apply_receipt_mismatch"],
  ["wrong_reset_receipt", "apply_receipt_mismatch"],
  ["scope_bleed", "collector_scope_mismatch"],
  ["unsafe_foreign_error", "scenario_component_failed"],
  ["missing_metering_provider", "metering_resume_required"],
  ["physical_missing_metering_provider", "metering_resume_required"],
  ["physical_synthetic_metering_provider", "metering_resume_required"],
  ["missing_metering_receipt", "metering_resume_receipt_invalid"],
  ["invalid_metering_receipt", "metering_resume_receipt_invalid"],
  ["invalid_metering_provider", "metering_resume_provider_invalid"],
  ["unsafe_metering_error", "metering_resume_failed"],
  ["recovery_duplicate_usage", "recovery_duplicate_usage"],
  ["other_resource_disabled", "credential_probe_mismatch"]
]) {
  test(`source scenario fails closed for ${fault}`, async () => {
    await withScenario(fault, async (run) => {
      await assert.rejects(run, (error) => error.code === code
        && !/edgecred_|password|sqlite|subscription/.test(error.message));
    });
  });
}

test("scenario rejects an unclassified injected transport before creating resources", async () => {
  const directory = mkdtempSync(join(tmpdir(), "data-pack-contract-"));
  try {
    const transport = transportFixture();
    delete transport.evidenceMode;
    await assert.rejects(() => runDataPackPhysicalScenario({ runDir: directory, transport }),
      (error) => error.code === "transport_contract_invalid");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
