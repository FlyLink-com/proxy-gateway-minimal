import assert from "node:assert/strict";
import test from "node:test";
import { normalizePlatformLead } from "../services/platform/control-plane-contract.mjs";
import { createPlatformAccountEntitlementShell } from "../services/platform/account-entitlement-shell.mjs";
import { createPlatformSubscriptionAccessShell } from "../services/platform/subscription-access-shell.mjs";

const NOW = "2026-05-26T10:00:00.000Z";
const LATER = "2026-05-26T10:15:00.000Z";

function sampleLead(id = "lead_1") {
  return normalizePlatformLead({
    id,
    organization: "Acme Research",
    email: "ops@example.com",
    direction: "API Sandbox",
    stage: "pilot budget approved",
    message: "Need private AI workflow automation details."
  }, { now: NOW });
}

function createReadyAccountShell() {
  let accountSequence = 0;
  let entitlementSequence = 0;
  const shell = createPlatformAccountEntitlementShell({
    nowFn: () => LATER,
    accountIdFactory: () => {
      accountSequence += 1;
      return `acct_${accountSequence}`;
    },
    entitlementIdFactory: () => {
      entitlementSequence += 1;
      return `ent_${entitlementSequence}`;
    }
  });
  return shell;
}

function createActiveEntitlement(accountShell, accountId) {
  return accountShell.createEntitlement(accountId, {
    plan: "pilot",
    status: "active",
    validFrom: "2026-05-26T00:00:00.000Z",
    validUntil: "2026-06-26T00:00:00.000Z",
    quota: { trafficGb: 100 }
  });
}

test("subscription access shell issues operator-safe dynamic entry summaries", () => {
  const accountShell = createReadyAccountShell();
  const account = accountShell.createAccountFromLead(sampleLead());
  const entitlement = createActiveEntitlement(accountShell, account.id);
  const accessShell = createPlatformSubscriptionAccessShell({
    accountShell,
    nowFn: () => LATER,
    accessIdFactory: () => "access_1"
  });

  const access = accessShell.issueDynamicEntry(account.id, entitlement.id, {
    entryRef: "entry_ref_1",
    artifactRef: "artifact_ref_1",
    rawEntryUrl: "https://dynamic-entry.example/use?token=top-secret",
    subscriptionUrl: "https://sub.example/import?token=hidden",
    artifactSecret: "opaque_secret_value"
  });

  assert.deepEqual(access, {
    id: "access_1",
    type: "subscription_access_grant_summary",
    accountId: "acct_1",
    entitlementId: "ent_1",
    status: "issued",
    delivery: "operator_issued",
    hasDynamicEntry: true,
    hasArtifact: true,
    visibleOnce: true,
    issuedAt: LATER,
    updatedAt: LATER
  });

  const serialized = JSON.stringify({
    access,
    listed: accessShell.listAccessGrants({ accountId: account.id })
  });
  assert.equal(serialized.includes("dynamic-entry.example"), false);
  assert.equal(serialized.includes("sub.example"), false);
  assert.equal(serialized.includes("top-secret"), false);
  assert.equal(serialized.includes("opaque_secret_value"), false);
  assert.equal(serialized.includes("token="), false);
  assert.deepEqual(accessShell.listAccessGrants({ entitlementId: entitlement.id }), [access]);
});

test("subscription access shell rejects unusable or mismatched entitlement state", () => {
  const accountShell = createReadyAccountShell();
  const account = accountShell.createAccountFromLead(sampleLead("lead_1"));
  const otherAccount = accountShell.createAccountFromLead(sampleLead("lead_2"));
  const otherEntitlement = createActiveEntitlement(accountShell, otherAccount.id);
  const pendingEntitlement = accountShell.createEntitlement(account.id, {
    plan: "pilot",
    status: "pending",
    validUntil: "2026-06-26T00:00:00.000Z"
  });
  const accessShell = createPlatformSubscriptionAccessShell({
    accountShell,
    nowFn: () => LATER,
    accessIdFactory: () => "access_1"
  });

  assert.throws(
    () => accessShell.issueDynamicEntry(account.id, otherEntitlement.id, { entryRef: "entry_ref_1" }),
    (error) => error.code === "validation_error" && error.message === "entitlement does not belong to account"
  );

  assert.throws(
    () => accessShell.issueDynamicEntry(account.id, pendingEntitlement.id, { entryRef: "entry_ref_1" }),
    (error) => error.code === "validation_error" && error.message === "entitlement is not usable"
  );

  assert.throws(
    () => accessShell.issueDynamicEntry(account.id, pendingEntitlement.id, {}),
    (error) => error.code === "validation_error" && !error.message.includes("entry_ref_1")
  );
});
