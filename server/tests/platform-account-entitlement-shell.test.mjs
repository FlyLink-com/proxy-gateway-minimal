import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { normalizePlatformLead } from "../services/platform/control-plane-contract.mjs";
import { createPlatformAccountEntitlementShell } from "../services/platform/account-entitlement-shell.mjs";
import { createPortalPasswordCredentialService } from "../services/platform/portal-password-credentials.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";

const NOW = "2026-05-26T10:00:00.000Z";
const LATER = "2026-05-26T10:15:00.000Z";

function withControlStore(fn) {
  const dir = mkdtempSync(join(tmpdir(), "platform-account-shell-control-"));
  let store;
  try {
    store = createSqliteSubscriptionControlStore({
      dbPath: join(dir, "control.sqlite")
    });
    return fn(store);
  } finally {
    store?.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

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

function createPasswordService(store) {
  return createPortalPasswordCredentialService({
    controlStore: store,
    nowFn: () => NOW,
    saltFactory: () => Buffer.from("0123456789abcdef", "utf8"),
    credentialRefFactory: () => "pwd_admin_created_1"
  });
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
    email: "ops@example.com",
    displayName: "Acme Ops",
    entitlementCount: 0,
    usableEntitlementCount: 0,
    createdAt: NOW,
    updatedAt: NOW
  });
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
    quota: { trafficGb: 100 }
  });

  assert.deepEqual(entitlement, {
    id: "ent_1",
    type: "platform_entitlement_summary",
    accountId: "acct_1",
    status: "active",
    plan: "pilot",
    usable: true,
    validUntil: "2026-06-26T00:00:00.000Z",
    quota: { trafficGb: 100 },
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

test("platform account shell credits paid plans as account day balance and traffic quota", () => {
  let currentNow = "2026-07-02T10:05:00.000Z";
  const shell = createPlatformAccountEntitlementShell({
    nowFn: () => currentNow,
    accountIdFactory: () => "acct_paid_plan",
    entitlementIdFactory: () => "ent_paid_plan"
  });
  shell.createAccountFromLead(sampleLead());

  const credited = shell.creditPurchasedPlan("acct_paid_plan", {
    orderRef: "pay_order_credited_001",
    plan: "monthly_plus",
    paidAt: "2026-07-02T10:05:00.000Z"
  });

  assert.equal(credited.account.id, "acct_paid_plan");
  assert.equal(credited.entitlement.plan, "monthly_plus");
  assert.equal(credited.entitlement.validUntil, "2026-08-01T10:05:00.000Z");
  assert.deepEqual(credited.entitlement.quota, { trafficGb: 100 });
  assert.deepEqual(credited.plan, {
    plan: "monthly_plus",
    durationDays: 30,
    trafficGbPerMonth: 100
  });

  const basic = shell.creditPurchasedPlan("acct_paid_plan", {
    orderRef: "pay_order_credited_basic",
    plan: "monthly_basic",
    paidAt: "2026-07-02T10:06:00.000Z"
  });
  assert.deepEqual(basic.entitlement.quota, { trafficGb: 50 });
  assert.deepEqual(basic.plan, {
    plan: "monthly_basic",
    durationDays: 30,
    trafficGbPerMonth: 50
  });

  currentNow = "2026-07-10T10:05:00.000Z";
  const yearly = shell.creditPurchasedPlan("acct_paid_plan", {
    orderRef: "pay_order_credited_002",
    plan: "yearly"
  });
  assert.equal(yearly.entitlement.validUntil, "2027-07-10T10:05:00.000Z");
  assert.equal(yearly.entitlement.quota.trafficGb, 200);
  assert.equal(shell.listEntitlements({ accountId: "acct_paid_plan" }).length, 3);
});

test("platform account shell reports persisted paid plan traffic quota", () => {
  withControlStore((store) => {
    store.createAccount({
      id: "acct_persisted_paid_plan",
      ownerRef: "acct_persisted_paid_plan",
      status: "active",
      createdAt: "2026-07-02T10:00:00.000Z",
      updatedAt: "2026-07-02T10:00:00.000Z",
      metadata: {
        displayRef: "paid@example.test",
        loginRef: "paid@example.test"
      }
    });
    const shell = createPlatformAccountEntitlementShell({
      controlStore: store,
      nowFn: () => "2026-07-02T10:05:00.000Z",
      entitlementIdFactory: () => "ent_persisted_paid_plan"
    });

    shell.creditPurchasedPlan("acct_persisted_paid_plan", {
      orderRef: "pay_order_persisted_001",
      plan: "monthly_plus",
      paidAt: "2026-07-02T10:05:00.000Z"
    });

    assert.deepEqual(shell.listEntitlements({ accountId: "acct_persisted_paid_plan" })[0].quota, { trafficGb: 100 });
  });
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

test("platform account shell can read and mutate persistent control-store accounts safely", () => {
  withControlStore((store) => {
    store.createAccount({
      id: "acct_persisted_1",
      ownerRef: "acct_persisted_1",
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
      metadata: {
        displayRef: "alpha@example.test",
        loginRef: "alpha@example.test",
        loginDigest: "safe_email_digest",
        organizationRef: "User Alpha"
      }
    });
    store.createEntitlement({
      id: "ent_persisted_1",
      accountId: "acct_persisted_1",
      plan: "trial",
      status: "active",
      validFrom: NOW,
      validUntil: "2026-06-26T00:00:00.000Z",
      maxDevices: 2,
      trafficLimitBytes: 1073741824,
      createdAt: NOW,
      updatedAt: NOW
    });
    store.createPortalPasswordCredential({
      id: "pwd_persisted_1",
      accountId: "acct_persisted_1",
      passwordHash: "scrypt$v=1$N=32768$r=8$p=1$saltref$hashref",
      status: "active",
      createdAt: NOW,
      updatedAt: NOW
    });

    let currentNow = LATER;
    const shell = createPlatformAccountEntitlementShell({
      controlStore: store,
      nowFn: () => currentNow
    });

    const listed = shell.listAccounts();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, "acct_persisted_1");
    assert.equal(listed[0].displayName, "alpha@example.test");
    assert.equal(listed[0].email, "alpha@example.test");
    assert.equal(listed[0].entitlementCount, 1);
    assert.equal(listed[0].usableEntitlementCount, 1);
    assert.doesNotMatch(JSON.stringify(listed), /alpha@example\.com|token|secret|password/i);

    currentNow = "2026-05-26T10:30:00.000Z";
    const edited = shell.updateAccount("acct_persisted_1", {
      approvalRef: "approval_edit_persisted",
      displayName: "User Beta",
      operatorRef: "operator_safe_ref",
      reason: "safe correction",
      status: "suspended"
    });
    assert.equal(edited.account.status, "suspended");
    assert.equal(edited.account.displayName, "alpha@example.test");
    assert.equal(edited.account.email, "alpha@example.test");
    assert.equal(store.getAccount("acct_persisted_1").status, "suspended");

    const recreatedShell = createPlatformAccountEntitlementShell({
      controlStore: store,
      nowFn: () => currentNow
    });
    assert.equal(recreatedShell.listAccounts()[0].displayName, "alpha@example.test");

    const disabled = recreatedShell.disableAccount("acct_persisted_1", {
      approvalRef: "approval_disable_persisted",
      operatorRef: "operator_safe_ref",
      reason: "safe disable"
    });
    assert.equal(disabled.account.status, "disabled");
    assert.equal(store.getAccount("acct_persisted_1").status, "disabled");
    assert.equal(store.getAccountControlSummary("acct_persisted_1").auditEvents.length, 2);
  });
});

test("persistent admin entitlement creation stores traffic quota with default artifact compatibility", () => {
  withControlStore((store) => {
    store.createAccount({
      id: "acct_persisted_entitlement_admin",
      ownerRef: "acct_persisted_entitlement_admin",
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
      metadata: {
        displayRef: "admin-entitlement@example.test",
        loginRef: "admin-entitlement@example.test",
        loginDigest: "safe_email_digest",
        organizationRef: "Admin Entitlement"
      }
    });

    const shell = createPlatformAccountEntitlementShell({
      controlStore: store,
      nowFn: () => LATER,
      entitlementIdFactory: () => "ent_admin_created_traffic"
    });

    const entitlement = shell.createEntitlement("acct_persisted_entitlement_admin", {
      plan: "monthly_plus",
      status: "active",
      validUntil: "2026-06-26T00:00:00.000Z",
      quota: { trafficGb: 100 }
    });

    assert.deepEqual(entitlement.quota, { trafficGb: 100 });
    assert.equal(store.getEntitlement("ent_admin_created_traffic").maxArtifacts, 1);
  });
});

test("platform account shell creates a portal-login initial password for admin-created users", () => {
  withControlStore((store) => {
    const passwordService = createPasswordService(store);
    const shell = createPlatformAccountEntitlementShell({
      controlStore: store,
      initialPasswordFactory: () => "AdminCreated-Initial-Password-1",
      nowFn: () => NOW,
      passwordCredentialService: passwordService
    });

    const created = shell.createAccount({
      approvalRef: "approval_create_with_initial_password",
      displayName: "Portal Created User",
      email: "created@example.com",
      operatorRef: "operator_safe_ref",
      organization: "Portal Created User",
      reason: "safe admin create",
      status: "active"
    });

    assert.equal(created.account.id, created.initialCredential.accountId);
    assert.equal(created.initialCredential.type, "portal_initial_password_handoff");
    assert.equal(created.initialCredential.initialPassword, "AdminCreated-Initial-Password-1");
    assert.equal(created.initialCredential.visibleOnce, true);
    assert.equal(created.initialCredential.mustRotate, true);
    assert.equal(created.initialCredential.safety.storedAsHash, true);
    assert.equal(created.initialCredential.safety.returnedInListApis, false);
    assert.equal(created.credential.summary.credentialRef, "pwd_admin_created_1");

    const verified = passwordService.verifyPasswordCredential({
      accountId: created.account.id,
      plainPassword: created.initialCredential.initialPassword
    });
    assert.equal(verified.summary.status, "verified");
    assert.doesNotMatch(JSON.stringify(shell.listAccounts()), /AdminCreated-Initial-Password-1|pwd_admin_created_1|scrypt\$v=1/i);
    assert.doesNotMatch(JSON.stringify(store.getAccountControlSummary(created.account.id)), /AdminCreated-Initial-Password-1|pwd_admin_created_1|scrypt\$v=1/i);
  });
});

test("platform account shell lists portal-backed user accounts instead of internal platform accounts", () => {
  withControlStore((store) => {
    store.createAccount({
      id: "acct_internal_only",
      ownerRef: "internal_safe_ref",
      status: "active",
      createdAt: NOW,
      updatedAt: NOW
    });
    store.createAccount({
      id: "acct_portal_password",
      ownerRef: "acct_portal_password",
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
      metadata: {
        displayRef: "portal-active@example.test",
        loginRef: "portal-active@example.test",
        organizationRef: "Portal Active User"
      }
    });
    store.createPortalPasswordCredential({
      id: "pwd_portal_password",
      accountId: "acct_portal_password",
      passwordHash: "scrypt$v=1$N=32768$r=8$p=1$saltref$hashref",
      status: "active",
      createdAt: NOW,
      updatedAt: NOW
    });

    const shell = createPlatformAccountEntitlementShell({
      controlStore: store,
      nowFn: () => LATER
    });
    const listed = shell.listAccounts();

    assert.deepEqual(listed.map((account) => account.id), ["acct_portal_password"]);
    assert.equal(listed[0].displayName, "portal-active@example.test");
    assert.equal(listed[0].email, "portal-active@example.test");
    assert.doesNotMatch(JSON.stringify(listed), /acct_internal_only|passwordHash|scrypt\$v=1|saltref|hashref/i);
  });
});
