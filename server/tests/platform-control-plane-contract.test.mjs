import assert from "node:assert/strict";
import test from "node:test";
import {
  createPlatformControlSummary,
  isEntitlementUsable,
  normalizePlatformAccount,
  normalizePlatformEntitlement,
  normalizePlatformLead,
  normalizeSubscriptionAccessGrant
} from "../services/platform/control-plane-contract.mjs";

const NOW = "2026-05-26T10:00:00.000Z";

test("platform lead contract normalizes public interest without exposing invalid input", () => {
  const lead = normalizePlatformLead({
    id: "lead_1",
    organization: "  Acme   Research  ",
    email: " OPS@EXAMPLE.COM ",
    direction: " API Sandbox ",
    stage: "pilot budget approved",
    message: "Need AI workflow\nintegration."
  }, { now: NOW });

  assert.deepEqual(lead, {
    id: "lead_1",
    type: "platform_lead",
    status: "new",
    organization: "Acme Research",
    email: "ops@example.com",
    direction: "API Sandbox",
    stage: "pilot budget approved",
    message: "Need AI workflow integration.",
    source: "company-site",
    createdAt: NOW,
    updatedAt: NOW
  });

  assert.throws(
    () => normalizePlatformLead({
      id: "lead_bad",
      organization: "Acme Research",
      email: "not-an-email",
      direction: "API Sandbox",
      message: "raw customer requirement"
    }, { now: NOW }),
    (error) => error.code === "validation_error" && !error.message.includes("raw customer requirement")
  );
});

test("platform account and entitlement contracts separate commercial state from access grants", () => {
  const account = normalizePlatformAccount({
    id: "acct_1",
    leadId: "lead_1",
    organization: "Acme Research",
    email: "OPS@EXAMPLE.COM",
    displayName: "Acme Ops",
    status: "pending_review"
  }, { now: NOW });

  const entitlement = normalizePlatformEntitlement({
    id: "ent_1",
    accountId: account.id,
    plan: "pilot",
    status: "active",
    validFrom: "2026-05-26T00:00:00.000Z",
    validUntil: "2026-06-26T00:00:00.000Z",
    quota: { trafficGb: 100 }
  }, { now: NOW });

  assert.equal(account.status, "pending_review");
  assert.equal(entitlement.status, "active");
  assert.equal(entitlement.quota.trafficGb, 100);
  assert.equal(isEntitlementUsable(entitlement, { now: "2026-05-27T00:00:00.000Z" }), true);
  assert.equal(isEntitlementUsable({ ...entitlement, status: "disabled" }, { now: NOW }), false);
  assert.equal(isEntitlementUsable(entitlement, { now: "2026-07-01T00:00:00.000Z" }), false);
});

test("subscription access grant summary keeps dynamic entry metadata operator-safe", () => {
  const grant = normalizeSubscriptionAccessGrant({
    id: "access_1",
    accountId: "acct_1",
    entitlementId: "ent_1",
    status: "issued",
    delivery: "operator_issued",
    entryRef: "entry_ref_1",
    artifactRef: "artifact_ref_1",
    visibleOnce: true,
    rawEntryUrl: "https://hidden.example/use?token=secret",
    artifactSecret: "opaque_secret_value"
  }, { now: NOW });

  assert.deepEqual(grant, {
    id: "access_1",
    type: "subscription_access_grant",
    accountId: "acct_1",
    entitlementId: "ent_1",
    status: "issued",
    delivery: "operator_issued",
    entryRef: "entry_ref_1",
    artifactRef: "artifact_ref_1",
    visibleOnce: true,
    issuedAt: NOW,
    updatedAt: NOW
  });

  const summary = createPlatformControlSummary({
    lead: normalizePlatformLead({
      id: "lead_1",
      organization: "Acme Research",
      email: "ops@example.com",
      direction: "API Sandbox",
      message: "Need AI workflow integration."
    }, { now: NOW }),
    account: normalizePlatformAccount({
      id: "acct_1",
      organization: "Acme Research",
      email: "ops@example.com",
      status: "active"
    }, { now: NOW }),
    entitlement: normalizePlatformEntitlement({
      id: "ent_1",
      accountId: "acct_1",
      plan: "pilot",
      status: "active",
      validUntil: "2026-06-26T00:00:00.000Z"
    }, { now: NOW }),
    accessGrant: grant
  });

  const serialized = JSON.stringify(summary);
  assert.equal(summary.access.hasDynamicEntry, true);
  assert.equal(summary.access.visibleOnce, true);
  assert.equal(serialized.includes("hidden.example"), false);
  assert.equal(serialized.includes("secret"), false);
  assert.equal(serialized.includes("ops@example.com"), true);
});
