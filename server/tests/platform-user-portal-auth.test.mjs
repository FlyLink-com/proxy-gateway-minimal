import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createUserPortalAuthService } from "../services/platform/user-portal-auth.mjs";

const NOW = "2026-05-31T00:00:00.000Z";
const FUTURE = "2099-06-04T00:00:00.000Z";
const SESSION_EXPIRES = "2026-05-31T00:30:00.000Z";

function withStore(fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "platform-user-portal-auth-"));
  let store;
  try {
    store = createSqliteSubscriptionControlStore({
      dbPath: join(tempDir, "control.sqlite")
    });
    seedAccountAndEntitlement(store);
    return fn(store);
  } finally {
    store?.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

function seedAccountAndEntitlement(store) {
  store.createAccount({
    id: "acct_portal_1",
    ownerRef: "owner_safe_ref",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW
  });
  store.createEntitlement({
    id: "ent_portal_1",
    accountId: "acct_portal_1",
    plan: "pilot",
    status: "active",
    validFrom: NOW,
    validUntil: FUTURE,
    maxArtifacts: 1,
    maxDevices: 1,
    trafficLimitBytes: 1024,
    createdAt: NOW,
    updatedAt: NOW
  });
}

function createService(store, overrides = {}) {
  return createUserPortalAuthService({
    controlStore: store,
    nowFn: () => NOW,
    entryTokenFactory: () => "portal-entry-raw-secret",
    entryRefFactory: () => "entry_portal_1",
    credentialRefFactory: () => "totp_cred_1",
    sessionRefFactory: () => "portal_session_1",
    sessionExpiresAtFactory: () => SESSION_EXPIRES,
    totpVerifier: ({ encryptedTotpSecret, code }) => encryptedTotpSecret === "enc:totp-secret" && code === "123456",
    ...overrides
  });
}

test("user portal auth issues dynamic entry with hash-only storage and visible-once handoff", () => {
  withStore((store) => {
    const service = createService(store);
    const result = service.issueDynamicEntry({
      accountId: "acct_portal_1",
      entitlementId: "ent_portal_1",
      approvalRef: "approval_portal_1",
      issuedByRef: "operator_safe_ref",
      expiresAt: FUTURE
    });

    assert.equal(result.summary.action, "portal_entry_issued");
    assert.equal(result.summary.entryRef, "entry_portal_1");
    assert.equal(result.summary.rawTokenReturned, false);
    assert.equal(result.handoffMaterial.entryToken, "portal-entry-raw-secret");

    const stored = store.getPortalEntry("entry_portal_1");
    assert.notEqual(stored.tokenHash, "portal-entry-raw-secret");
    assert.match(stored.tokenHash, /^portalentryhash_[a-f0-9]{64}$/);
    assert.equal(stored.status, "active");
    assert.equal(stored.useCount, 0);

    const serialized = JSON.stringify(result.summary);
    assert.equal(serialized.includes("portal-entry-raw-secret"), false);
    assert.equal(serialized.includes("subscriptionUrl"), false);
    assert.equal(serialized.includes("token="), false);
  });
});

test("user portal auth consumes entry, enrolls TOTP, and creates a scoped session", () => {
  withStore((store) => {
    const service = createService(store);
    const issued = service.issueDynamicEntry({
      accountId: "acct_portal_1",
      entitlementId: "ent_portal_1",
      approvalRef: "approval_portal_1",
      issuedByRef: "operator_safe_ref",
      expiresAt: FUTURE
    });

    const enrollment = service.enrollTotpCredential({
      entryToken: issued.handoffMaterial.entryToken,
      encryptedTotpSecret: "enc:totp-secret"
    });
    assert.equal(enrollment.summary.action, "totp_enrolled");
    assert.equal(enrollment.summary.accountId, "acct_portal_1");
    assert.equal(enrollment.summary.credentialRef, "totp_cred_1");
    assert.equal(store.getPortalEntry("entry_portal_1").status, "used");

    const verified = service.verifyTotpAndCreateSession({
      accountId: "acct_portal_1",
      code: "123456"
    });
    assert.equal(verified.session.sessionRef, "portal_session_1");
    assert.equal(verified.session.authMethod, "totp");
    assert.equal(verified.session.expiresAt, SESSION_EXPIRES);

    const serialized = JSON.stringify({ enrollment, verified });
    assert.equal(serialized.includes("enc:totp-secret"), false);
    assert.equal(serialized.includes("123456"), false);
    assert.equal(serialized.includes("portal-entry-raw-secret"), false);
  });
});

test("user portal auth rejects reused entries and failed TOTP without creating sessions", () => {
  withStore((store) => {
    const service = createService(store);
    const issued = service.issueDynamicEntry({
      accountId: "acct_portal_1",
      entitlementId: "ent_portal_1",
      approvalRef: "approval_portal_1",
      issuedByRef: "operator_safe_ref",
      expiresAt: FUTURE
    });

    service.enrollTotpCredential({
      entryToken: issued.handoffMaterial.entryToken,
      encryptedTotpSecret: "enc:totp-secret"
    });

    assert.throws(() => service.enrollTotpCredential({
      entryToken: issued.handoffMaterial.entryToken,
      encryptedTotpSecret: "enc:totp-secret-2"
    }), /portal entry is not active/);

    assert.throws(() => service.verifyTotpAndCreateSession({
      accountId: "acct_portal_1",
      code: "000000"
    }), /TOTP verification failed/);

    const credential = store.getActivePortalTotpCredential("acct_portal_1");
    assert.equal(credential.failureCount, 1);
    assert.equal(store.listPortalSessions({ accountId: "acct_portal_1" }).length, 0);
  });
});
