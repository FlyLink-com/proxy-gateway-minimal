import assert from "node:assert/strict";
import { randomUUID, scryptSync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPortalPasswordCredentialService } from "../services/platform/portal-password-credentials.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";

const NOW = "2026-06-03T00:00:00.000Z";

function buildTestPassword() {
  return randomUUID();
}

function withStore(fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "platform-portal-password-"));
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

function seedAccount(store, input = {}) {
  store.createAccount({
    id: input.id ?? "acct_password_1",
    ownerRef: "owner_safe_ref",
    status: input.status ?? "active",
    createdAt: NOW,
    updatedAt: NOW
  });
}

function createService(store, options = {}) {
  return createPortalPasswordCredentialService({
    controlStore: store,
    nowFn: () => NOW,
    saltFactory: () => Buffer.from("0123456789abcdef", "utf8"),
    credentialRefFactory: () => "pwd_cred_test_1",
    ...options
  });
}

function buildScryptHash(plainPassword) {
  const salt = Buffer.from("0123456789abcdef", "utf8");
  const derived = scryptSync(plainPassword, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
  });
  return [
    "scrypt",
    "v=1",
    "N=32768",
    "r=8",
    "p=1",
    salt.toString("base64url"),
    derived.toString("base64url")
  ].join("$");
}

test("portal password credential service stores only a hash and verifies the password", () => {
  withStore((store) => {
    seedAccount(store);
    const service = createService(store);
    const plainPassword = buildTestPassword();

    const issued = service.issueInitialPasswordCredential({
      accountId: "acct_password_1",
      plainPassword,
      issuedByRef: "operator_safe_ref",
      approvalRef: "approval_safe_ref",
      mustRotate: true
    });
    assert.equal(issued.summary.accountId, "acct_password_1");
    assert.equal(issued.summary.credentialRef, "pwd_cred_test_1");
    assert.equal(issued.summary.hashReturned, false);

    const stored = store.getActivePortalPasswordCredential("acct_password_1");
    assert.notEqual(stored.passwordHash, plainPassword);
    assert.match(stored.passwordHash, /^scrypt\$v=1\$N=32768\$r=8\$p=1\$/);
    assert.equal(stored.mustRotate, true);

    const verified = service.verifyPasswordCredential({
      accountId: "acct_password_1",
      plainPassword
    });
    assert.equal(verified.summary.status, "verified");
    assert.equal(store.getActivePortalPasswordCredential("acct_password_1").failureCount, 0);

    const serialized = JSON.stringify({ issued, verified });
    assert.equal(serialized.includes(plainPassword), false);
    assert.doesNotMatch(serialized, /passwordHash|scrypt\$v=1|0123456789abcdef/);
  });
});

test("portal password credential service fails generically and locks after repeated failures", () => {
  withStore((store) => {
    seedAccount(store);
    const service = createService(store, {
      maxFailures: 2,
      lockSeconds: 600
    });
    service.issueInitialPasswordCredential({
      accountId: "acct_password_1",
      plainPassword: buildTestPassword(),
      issuedByRef: "operator_safe_ref",
      approvalRef: "approval_safe_ref"
    });

    assert.throws(() => service.verifyPasswordCredential({
      accountId: "acct_password_1",
      plainPassword: buildTestPassword()
    }), /invalid_login/);
    assert.equal(store.getActivePortalPasswordCredential("acct_password_1").failureCount, 1);

    assert.throws(() => service.verifyPasswordCredential({
      accountId: "acct_password_1",
      plainPassword: buildTestPassword()
    }), /invalid_login/);
    const locked = store.getPortalPasswordCredential("pwd_cred_test_1");
    assert.equal(locked.status, "locked");
    assert.equal(locked.failureCount, 2);
    assert.equal(locked.lockedUntil, "2026-06-03T00:10:00.000Z");
  });
});

test("portal password credential service rejects inactive accounts", () => {
  withStore((store) => {
    seedAccount(store, { id: "acct_password_disabled", status: "disabled" });
    const service = createService(store);

    assert.throws(() => service.issueInitialPasswordCredential({
      accountId: "acct_password_disabled",
      plainPassword: buildTestPassword(),
      issuedByRef: "operator_safe_ref",
      approvalRef: "approval_safe_ref"
    }), /account is not active/);

    assert.throws(() => service.verifyPasswordCredential({
      accountId: "acct_password_disabled",
      plainPassword: buildTestPassword()
    }), /invalid_login/);
  });
});

test("portal password credential service rejects a revoked credential even with the correct password", () => {
  withStore((store) => {
    seedAccount(store);
    const service = createService(store);
    const plainPassword = buildTestPassword();
    store.createPortalPasswordCredential({
      id: "pwd_cred_test_revoked",
      accountId: "acct_password_1",
      passwordHash: buildScryptHash(plainPassword),
      status: "revoked",
      failureCount: 0,
      createdAt: NOW,
      revokedAt: NOW,
      updatedAt: NOW
    });

    assert.equal(store.getActivePortalPasswordCredential("acct_password_1"), null);
    assert.throws(() => service.verifyPasswordCredential({
      accountId: "acct_password_1",
      plainPassword
    }), /invalid_login/);
  });
});

test("portal password credential service rejects login when no credential row exists", () => {
  withStore((store) => {
    seedAccount(store);
    const service = createService(store);

    assert.equal(store.getActivePortalPasswordCredential("acct_password_1"), null);
    assert.throws(() => service.verifyPasswordCredential({
      accountId: "acct_password_1",
      plainPassword: buildTestPassword()
    }), /invalid_login/);
  });
});

test("portal password credential service fails closed when the credential store is unavailable", () => {
  const service = createPortalPasswordCredentialService({
    controlStore: {
      getAccount: () => {
        throw new Error("control store unavailable");
      }
    },
    nowFn: () => NOW
  });

  assert.throws(() => service.verifyPasswordCredential({
    accountId: "acct_password_1",
    plainPassword: buildTestPassword()
  }), /control store unavailable/);
});
