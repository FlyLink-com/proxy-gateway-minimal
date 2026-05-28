import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const selfServiceModule = await import("../services/platform/self-service-registration-flow.mjs").catch(() => ({}));
const { buildPlatformSelfServiceRegistrationPackage } = selfServiceModule;

function registrationFixture(overrides = {}) {
  return {
    mode: "platform-self-service-registration",
    generatedAt: "2026-05-28T20:00:00.000Z",
    registration: {
      organization: "Sensitive Customer Ltd",
      email: "buyer@sensitive.example",
      direction: "subscription access",
      stage: "self service checkout",
      message: "Needs an access package after payment.",
      requestedPlan: "pilot"
    },
    payment: {
      provider: "manual",
      status: "verified",
      externalRef: "payment-secret-001"
    },
    policy: {
      autoProvision: true,
      requirePaymentVerified: true
    },
    entitlement: {
      validUntil: "2026-06-28T20:00:00.000Z",
      quota: {
        trafficGb: 50,
        seats: 2,
        devices: 2
      }
    },
    accessGrant: {
      entryRef: "https://secret-entry.example/customer-alpha?token=raw-token",
      artifactRef: "artifact://secret/customer-alpha",
      visibleOnce: true
    },
    operator: {
      requestedBy: "self-service-engine"
    },
    ...overrides
  };
}

function withTempJson(payload, fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "platform-self-service-registration-"));
  try {
    const payloadPath = join(tempDir, "payload.json");
    writeFileSync(payloadPath, JSON.stringify(payload, null, 2));
    return fn(payloadPath);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

test("self-service registration auto-provisions only after verified payment", () => {
  assert.equal(typeof buildPlatformSelfServiceRegistrationPackage, "function");

  const result = buildPlatformSelfServiceRegistrationPackage(registrationFixture());

  assert.equal(result.ok, true);
  assert.equal(result.mode, "platform-self-service-registration");
  assert.equal(result.status, "ready_for_operator_delivery");
  assert.equal(result.registration.accepted, true);
  assert.equal(result.payment.verified, true);
  assert.equal(result.automation.autoProvisionAttempted, true);
  assert.equal(result.automation.accessIssued, true);
  assert.equal(result.package.accessReady, true);
  assert.equal(result.portal.publicLoginEnabled, false);
  assert.equal(result.safety.noPublicAdmin, true);
  assert.equal(result.safety.noPaymentCapture, true);
  assert.equal(result.safety.noPersistence, true);
  assert.equal(result.safety.noProductionMutation, true);

  assert.doesNotMatch(
    JSON.stringify(result),
    /Sensitive Customer|buyer@sensitive|secret-entry|raw-token|artifact:\/\/secret|payment-secret|https?:\/\//i
  );
});

test("self-service registration blocks auto-provisioning before payment verification", () => {
  const result = buildPlatformSelfServiceRegistrationPackage(registrationFixture({
    registration: {
      ...registrationFixture().registration,
      source: "https://campaign.example/register?token=secret-source"
    },
    payment: {
      provider: "manual",
      status: "pending",
      externalRef: "payment-secret-002"
    }
  }));

  assert.equal(result.ok, true);
  assert.equal(result.status, "pending_payment_verification");
  assert.deepEqual(result.blockers, ["payment_not_verified"]);
  assert.equal(result.payment.verified, false);
  assert.equal(result.registration.source, "public-self-service");
  assert.equal(result.automation.autoProvisionAttempted, false);
  assert.equal(result.automation.accessIssued, false);
  assert.equal(result.package.accessReady, false);
  assert.equal(result.package.requiredNextAction, "verify_payment_before_auto_provision");
  assert.doesNotMatch(JSON.stringify(result), /payment-secret|buyer@sensitive|Sensitive Customer|secret-source|campaign\.example/i);
});

test("self-service registration CLI prints safe JSON", () => {
  withTempJson(registrationFixture(), (payloadPath) => {
    const stdout = execFileSync(process.execPath, ["scripts/platform-self-service-registration.mjs", payloadPath], {
      cwd: new URL("../../", import.meta.url),
      encoding: "utf8"
    });

    const result = JSON.parse(stdout);
    assert.equal(result.mode, "platform-self-service-registration");
    assert.equal(result.status, "ready_for_operator_delivery");
    assert.match(result.package.packageId, /^pkg_[a-f0-9]{16}$/);
    assert.doesNotMatch(
      stdout,
      /Sensitive Customer|buyer@sensitive|secret-entry|raw-token|artifact:\/\/secret|payment-secret|https?:\/\//i
    );
  });
});

test("self-service registration fails closed for unsupported payment providers", () => {
  assert.throws(
    () => buildPlatformSelfServiceRegistrationPackage(registrationFixture({
      payment: {
        provider: "unknown-pay",
        status: "verified"
      }
    })),
    /payment.provider is invalid/
  );
});

test("self-service registration fails closed for invalid email", () => {
  assert.throws(
    () => buildPlatformSelfServiceRegistrationPackage(registrationFixture({
      registration: {
        ...registrationFixture().registration,
        email: "not-an-email"
      }
    })),
    /registration.email is invalid/
  );
});
