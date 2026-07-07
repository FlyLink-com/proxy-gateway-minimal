import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const resourcePackageModule = await import("../services/platform/resource-package.mjs").catch(() => ({}));
const { buildPlatformResourcePackage } = resourcePackageModule;

function baseInput(overrides = {}) {
  return {
    generatedAt: "2026-05-28T16:00:00.000Z",
    account: {
      id: "acct_customer_alpha",
      status: "active",
      organization: "Sensitive Customer Ltd",
      email: "owner@sensitive.example",
      displayName: "Sensitive Customer"
    },
    entitlement: {
      id: "ent_customer_alpha",
      accountId: "acct_customer_alpha",
      plan: "pilot",
      status: "active",
      validFrom: "2026-05-28T00:00:00.000Z",
      validUntil: "2026-06-28T00:00:00.000Z",
      quota: {
        trafficGb: 50
      },
      createdAt: "2026-05-28T00:00:00.000Z",
      updatedAt: "2026-05-28T00:00:00.000Z"
    },
    accessGrant: {
      id: "access_customer_alpha",
      accountId: "acct_customer_alpha",
      entitlementId: "ent_customer_alpha",
      status: "issued",
      delivery: "operator_issued",
      entryRef: "https://secret-entry.example/customer-alpha?token=raw-token",
      artifactRef: "artifact://secret/customer-alpha",
      visibleOnce: true,
      issuedAt: "2026-05-28T16:00:00.000Z",
      updatedAt: "2026-05-28T16:00:00.000Z"
    },
    activationPackage: {
      mode: "channel-subscription-activation-package",
      status: "ready_for_risk_a_subscription_output_activation_request",
      package: {
        approvalRequestReady: true,
        executionAuthority: "not_granted",
        requiredNextAction: "request_risk_a_subscription_output_activation_approval"
      },
      renderProof: {
        renderedProxyCount: 2,
        protocolCounts: {
          ss: 1,
          tuic: 1
        }
      },
      gate: {
        risk: "A",
        gate: "subscription_output_activation",
        approvalRequestReady: true,
        executionAuthority: "not_granted"
      },
      safety: {
        noRuntimeMutation: true,
        noProductionMutation: true,
        noSubscriptionOutputMutation: true,
        yamlReturned: false
      }
    },
    operator: {
      source: "cli",
      requestedBy: "operator-local"
    },
    ...overrides
  };
}

function withTempJson(payload, fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "platform-resource-package-"));
  try {
    const payloadPath = join(tempDir, "payload.json");
    writeFileSync(payloadPath, JSON.stringify(payload, null, 2));
    return fn(payloadPath);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

test("platform resource package helper is exported", () => {
  assert.equal(typeof buildPlatformResourcePackage, "function");
});

test("platform resource package creates a safe operator delivery bundle", () => {
  const resourcePackage = buildPlatformResourcePackage(baseInput());

  assert.equal(resourcePackage.ok, true);
  assert.equal(resourcePackage.mode, "platform-resource-package");
  assert.equal(resourcePackage.status, "ready_for_operator_delivery");
  assert.equal(resourcePackage.generatedAt, "2026-05-28T16:00:00.000Z");
  assert.equal(resourcePackage.package.plan, "pilot");
  assert.equal(resourcePackage.package.accessReady, true);
  assert.equal(resourcePackage.package.activationPackageReady, true);
  assert.equal(resourcePackage.package.requiredNextAction, "deliver_visible_once_resource_package");
  assert.match(resourcePackage.package.accountRef, /^acct_[a-f0-9]{16}$/);
  assert.match(resourcePackage.package.entitlementRef, /^ent_[a-f0-9]{16}$/);
  assert.match(resourcePackage.package.accessRef, /^access_[a-f0-9]{16}$/);
  assert.match(resourcePackage.identity.accountRef, /^acct_[a-f0-9]{16}$/);
  assert.match(resourcePackage.identity.customerRef, /^cust_[a-f0-9]{16}$/);
  assert.equal(resourcePackage.identity.hasEmail, true);
  assert.equal(resourcePackage.identity.rawCustomerDataReturned, false);
  assert.equal(resourcePackage.entitlement.accountRef, resourcePackage.package.accountRef);
  assert.equal(resourcePackage.entitlement.entitlementRef, resourcePackage.package.entitlementRef);
  assert.equal(resourcePackage.access.accessRef, resourcePackage.package.accessRef);
  assert.equal(resourcePackage.access.entitlementRef, resourcePackage.package.entitlementRef);
  assert.equal(resourcePackage.access.hasDynamicEntry, true);
  assert.equal(resourcePackage.access.hasArtifact, true);
  assert.equal(resourcePackage.activation.included, true);
  assert.equal(resourcePackage.activation.approvalRequestReady, true);
  assert.deepEqual(resourcePackage.activation.protocolCounts, { ss: 1, tuic: 1 });
  assert.equal(resourcePackage.safety.noRawCustomerData, true);
  assert.equal(resourcePackage.safety.noSubscriptionUrls, true);
  assert.equal(resourcePackage.safety.noRuntimeMutation, true);
  assert.equal(resourcePackage.safety.noProductionMutation, true);

  assert.doesNotMatch(
    JSON.stringify(resourcePackage),
    /acct_customer_alpha|ent_customer_alpha|access_customer_alpha|Sensitive Customer|owner@sensitive|secret-entry|raw-token|artifact:\/\/secret|https?:\/\//i
  );
});

test("platform resource package fails closed when entitlement is not usable", () => {
  const resourcePackage = buildPlatformResourcePackage(baseInput({
    entitlement: {
      ...baseInput().entitlement,
      status: "expired",
      validUntil: "2026-05-27T00:00:00.000Z"
    }
  }));

  assert.equal(resourcePackage.status, "blocked_before_operator_delivery");
  assert.equal(resourcePackage.package.accessReady, false);
  assert.deepEqual(resourcePackage.blockers, ["entitlement_not_usable"]);
  assert.equal(resourcePackage.safety.noRuntimeMutation, true);
});

test("platform resource package fails closed when issued access has no safe reference", () => {
  const resourcePackage = buildPlatformResourcePackage(baseInput({
    accessGrant: {
      ...baseInput().accessGrant,
      entryRef: "",
      artifactRef: ""
    }
  }));

  assert.equal(resourcePackage.status, "blocked_before_operator_delivery");
  assert.equal(resourcePackage.package.accessReady, false);
  assert.deepEqual(resourcePackage.blockers, ["access_reference_missing"]);
});

test("platform resource package CLI prints safe JSON", () => {
  withTempJson(baseInput(), (payloadPath) => {
    const stdout = execFileSync(process.execPath, ["scripts/platform-resource-package.mjs", payloadPath], {
      cwd: new URL("../../", import.meta.url),
      encoding: "utf8"
    });

    const resourcePackage = JSON.parse(stdout);
    assert.equal(resourcePackage.mode, "platform-resource-package");
    assert.equal(resourcePackage.status, "ready_for_operator_delivery");
    assert.equal(resourcePackage.package.accessReady, true);
    assert.match(resourcePackage.package.accountRef, /^acct_[a-f0-9]{16}$/);
    assert.match(resourcePackage.package.entitlementRef, /^ent_[a-f0-9]{16}$/);
    assert.match(resourcePackage.package.accessRef, /^access_[a-f0-9]{16}$/);
    assert.doesNotMatch(
      stdout,
      /acct_customer_alpha|ent_customer_alpha|access_customer_alpha|Sensitive Customer|owner@sensitive|secret-entry|raw-token|artifact:\/\/secret|https?:\/\//i
    );
  });
});
