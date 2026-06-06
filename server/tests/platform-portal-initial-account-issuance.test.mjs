import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPortalInitialAccountIssuanceService } from "../services/platform/portal-initial-account-issuance.mjs";
import { createPortalPasswordCredentialService } from "../services/platform/portal-password-credentials.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";

const NOW = "2026-06-03T00:00:00.000Z";
const INITIAL_PASSWORD = "test-only-generated-initial-password";

function withStore(fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "platform-portal-initial-account-"));
  let store;
  try {
    store = createSqliteSubscriptionControlStore({
      dbPath: join(tempDir, "control.sqlite")
    });
    return fn(store);
  } finally {
    store?.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

function createPasswordService(store) {
  return createPortalPasswordCredentialService({
    controlStore: store,
    nowFn: () => NOW,
    saltFactory: () => Buffer.from("initial-account-salt-0001", "utf8"),
    credentialRefFactory: () => "pwd_initial_1"
  });
}

function createService(store) {
  return createPortalInitialAccountIssuanceService({
    controlStore: store,
    passwordCredentialService: createPasswordService(store),
    nowFn: () => NOW,
    accountIdFactory: () => "acct_initial_1",
    passwordFactory: () => INITIAL_PASSWORD
  });
}

test("portal initial account issuance creates a durable account and stores only a password hash", () => {
  withStore((store) => {
    const service = createService(store);

    const result = service.issuePortalInitialAccount({
      ownerRef: "owner_initial_safe_ref",
      displayName: "Initial Account",
      issuedByRef: "operator_safe_ref",
      approvalRef: "approval_initial_account_1"
    });

    assert.equal(result.summary.action, "portal_initial_account_issued");
    assert.equal(result.summary.accountId, "acct_initial_1");
    assert.equal(result.summary.accountCreated, true);
    assert.equal(result.summary.mustRotate, true);
    assert.equal(result.summary.rawPasswordReturned, false);
    assert.equal(result.handoffMaterial.accountId, "acct_initial_1");
    assert.equal(result.handoffMaterial.initialPassword, INITIAL_PASSWORD);
    assert.equal(result.handoffMaterial.mustRotate, true);

    const account = store.getAccount("acct_initial_1");
    assert.equal(account.ownerRef, "owner_initial_safe_ref");
    assert.equal(account.status, "active");
    assert.equal(account.metadata.displayName, "Initial Account");

    const credential = store.getActivePortalPasswordCredential("acct_initial_1");
    assert.equal(credential.mustRotate, true);
    assert.notEqual(credential.passwordHash, INITIAL_PASSWORD);
    assert.match(credential.passwordHash, /^scrypt\$v=1\$N=32768\$r=8\$p=1\$/);

    const serializedSummary = JSON.stringify(result.summary);
    assert.equal(serializedSummary.includes(INITIAL_PASSWORD), false);
    assert.doesNotMatch(serializedSummary, /passwordHash|scrypt\$v=1|initial-account-salt/);
  });
});

test("portal initial account issuance validates existing active accounts and rejects inactive accounts", () => {
  withStore((store) => {
    store.createAccount({
      id: "acct_existing_active",
      ownerRef: "owner_existing_safe_ref",
      status: "active",
      createdAt: NOW,
      updatedAt: NOW
    });
    store.createAccount({
      id: "acct_existing_disabled",
      ownerRef: "owner_disabled_safe_ref",
      status: "disabled",
      createdAt: NOW,
      updatedAt: NOW
    });
    const service = createService(store);

    const result = service.issuePortalInitialAccount({
      accountId: "acct_existing_active",
      ownerRef: "owner_existing_safe_ref",
      displayName: "Existing Active",
      issuedByRef: "operator_safe_ref",
      approvalRef: "approval_initial_account_2"
    });
    assert.equal(result.summary.accountId, "acct_existing_active");
    assert.equal(result.summary.accountCreated, false);
    assert.equal(store.getActivePortalPasswordCredential("acct_existing_active").mustRotate, true);

    assert.throws(() => service.issuePortalInitialAccount({
      accountId: "acct_existing_disabled",
      ownerRef: "owner_disabled_safe_ref",
      displayName: "Disabled",
      issuedByRef: "operator_safe_ref",
      approvalRef: "approval_initial_account_3"
    }), /account is not active/);
  });
});
