import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const controlledOpenModule = await import("../services/platform/controlled-open-flow.mjs").catch(() => ({}));
const { buildPlatformControlledOpenPackage } = controlledOpenModule;

function inputFixture(overrides = {}) {
  return {
    mode: "platform-controlled-open",
    generatedAt: "2026-05-28T18:30:00.000Z",
    lead: {
      organization: "Sensitive Customer Ltd",
      email: "owner@sensitive.example",
      direction: "controlled subscription delivery",
      stage: "operator approved pilot",
      message: "Needs a subscription package with a private dynamic entry."
    },
    account: {
      status: "active",
      displayName: "Sensitive Customer"
    },
    entitlement: {
      plan: "pilot",
      status: "active",
      validUntil: "2026-06-28T18:30:00.000Z",
      quota: {
        trafficGb: 50
      }
    },
    accessGrant: {
      entryRef: "https://secret-entry.example/customer-alpha?token=raw-token",
      artifactRef: "artifact://secret/customer-alpha",
      visibleOnce: true
    },
    operator: {
      requestedBy: "operator-local"
    },
    ...overrides
  };
}

function withTempJson(payload, fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "platform-controlled-open-"));
  try {
    const payloadPath = join(tempDir, "payload.json");
    writeFileSync(payloadPath, JSON.stringify(payload, null, 2));
    return fn(payloadPath);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

test("platform controlled-open helper creates a safe operator delivery package", () => {
  assert.equal(typeof buildPlatformControlledOpenPackage, "function");

  const result = buildPlatformControlledOpenPackage(inputFixture());

  assert.equal(result.ok, true);
  assert.equal(result.mode, "platform-controlled-open");
  assert.equal(result.status, "ready_for_operator_delivery");
  assert.equal(result.flow.leadAccepted, true);
  assert.equal(result.flow.accountProvisioned, true);
  assert.equal(result.flow.entitlementCreated, true);
  assert.equal(result.flow.accessIssued, true);
  assert.equal(result.package.accessReady, true);
  assert.equal(result.package.requiredNextAction, "deliver_visible_once_resource_package");
  assert.equal(result.identity.rawCustomerDataReturned, false);
  assert.equal(result.access.hasDynamicEntry, true);
  assert.equal(result.access.hasArtifact, true);
  assert.equal(result.safety.noPublicAdmin, true);
  assert.equal(result.safety.noPersistence, true);
  assert.equal(result.safety.noPaymentActivation, true);
  assert.equal(result.safety.noProductionMutation, true);

  assert.doesNotMatch(
    JSON.stringify(result),
    /Sensitive Customer|owner@sensitive|secret-entry|raw-token|artifact:\/\/secret|https?:\/\//i
  );
});

test("platform controlled-open CLI prints safe JSON without customer secrets", () => {
  withTempJson(inputFixture(), (payloadPath) => {
    const stdout = execFileSync(process.execPath, ["scripts/platform-controlled-open.mjs", payloadPath], {
      cwd: new URL("../../", import.meta.url),
      encoding: "utf8"
    });

    const result = JSON.parse(stdout);
    assert.equal(result.mode, "platform-controlled-open");
    assert.equal(result.status, "ready_for_operator_delivery");
    assert.equal(result.package.accessReady, true);
    assert.match(result.package.accountRef, /^acct_[a-f0-9]{16}$/);
    assert.match(result.package.entitlementRef, /^ent_[a-f0-9]{16}$/);
    assert.match(result.package.accessRef, /^access_[a-f0-9]{16}$/);
    assert.doesNotMatch(
      stdout,
      /Sensitive Customer|owner@sensitive|secret-entry|raw-token|artifact:\/\/secret|https?:\/\//i
    );
  });
});

test("platform controlled-open tracked example stays compatible with the contract", () => {
  const payload = JSON.parse(readFileSync(new URL("../../scripts/mock-controlled-open-input.example.json", import.meta.url), "utf8"));
  const result = buildPlatformControlledOpenPackage(payload);

  assert.equal(result.mode, "platform-controlled-open");
  assert.equal(result.status, "ready_for_operator_delivery");
  assert.equal(result.package.plan, "pilot");
  assert.equal(result.safety.noProductionMutation, true);
});

test("platform controlled-open fails closed without an access reference", () => {
  assert.throws(
    () => buildPlatformControlledOpenPackage(inputFixture({
      accessGrant: {
        visibleOnce: true
      }
    })),
    /accessGrant requires entryRef or artifactRef/
  );
});
