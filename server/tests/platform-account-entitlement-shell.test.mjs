import assert from "node:assert/strict";
import test from "node:test";
import { normalizePlatformLead } from "../services/platform/control-plane-contract.mjs";
import { createPlatformAccountEntitlementShell } from "../services/platform/account-entitlement-shell.mjs";

const NOW = "2026-05-26T10:00:00.000Z";
const LATER = "2026-05-26T10:15:00.000Z";

function sampleLead() {
  return normalizePlatformLead({
    id: "lead_1",
    organization: "Acme Research",
    email: "ops@example.com",
    direction: "API Sandbox",
    stage: "pilot budget approved",
    message: "Need private AI workflow automation details."
  }, { now: NOW });
}

test("platform account shell converts a reviewed lead into an operator-safe account summary", () => {
  const shell = createPlatformAccountEntitlementShell({
    nowFn: () => NOW,
    accountIdFactory: () => "acct_1"
  });

  const account = shell.createAccountFromLead(sampleLead(), {
    displayName: "Acme Ops"
  });

  assert.deepEqual(account, {
    id: "acct_1",
    type: "platform_account_summary",
    leadId: "lead_1",
    status: "pending_review",
    organization: "Acme Research",
    email: "op***@example.com",
    displayName: "Acme Ops",
    entitlementCount: 0,
    usableEntitlementCount: 0,
    createdAt: NOW,
    updatedAt: NOW
  });
  assert.equal(JSON.stringify(account).includes("ops@example.com"), false);
  assert.equal(JSON.stringify(shell.listAccounts()).includes("workflow automation details"), false);
});

test("platform entitlement shell creates validated entitlement summaries for an account", () => {
  let currentNow = NOW;
  const shell = createPlatformAccountEntitlementShell({
    nowFn: () => currentNow,
    accountIdFactory: () => "acct_1",
    entitlementIdFactory: () => "ent_1"
  });
  shell.createAccountFromLead(sampleLead());
  currentNow = LATER;

  const entitlement = shell.createEntitlement("acct_1", {
    plan: "pilot",
    status: "active",
    validFrom: "2026-05-26T00:00:00.000Z",
    validUntil: "2026-06-26T00:00:00.000Z",
    quota: { trafficGb: 100, seats: 3 }
  });

  assert.deepEqual(entitlement, {
    id: "ent_1",
    type: "platform_entitlement_summary",
    accountId: "acct_1",
    status: "active",
    plan: "pilot",
    usable: true,
    validUntil: "2026-06-26T00:00:00.000Z",
    quota: { trafficGb: 100, seats: 3 },
    createdAt: LATER,
    updatedAt: LATER
  });
  assert.deepEqual(shell.listEntitlements({ accountId: "acct_1" }), [entitlement]);
  assert.equal(shell.listAccounts()[0].entitlementCount, 1);
  assert.equal(shell.listAccounts()[0].usableEntitlementCount, 1);

  shell.createEntitlement("acct_1", {
    id: "ent_pending",
    plan: "pilot",
    status: "pending",
    validUntil: "2026-06-26T00:00:00.000Z"
  });
  assert.equal(shell.listEntitlements({ accountId: "acct_1" })[1].usable, false);
});

test("platform account shell reports missing accounts and rejects invalid entitlements safely", () => {
  const shell = createPlatformAccountEntitlementShell({
    nowFn: () => NOW,
    accountIdFactory: () => "acct_1",
    entitlementIdFactory: () => "ent_1"
  });

  assert.throws(
    () => shell.createEntitlement("missing", { plan: "pilot" }),
    (error) => error.code === "not_found" && error.message === "account not found"
  );

  shell.createAccountFromLead(sampleLead());
  assert.throws(
    () => shell.createEntitlement("acct_1", {
      plan: "raw secret plan should not echo"
    }),
    (error) => error.code === "validation_error" && !error.message.includes("raw secret")
  );
});
