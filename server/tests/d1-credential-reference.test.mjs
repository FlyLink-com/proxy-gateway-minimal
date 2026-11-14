import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  CREDENTIAL_REF_VERSION,
  isValidCredentialRef,
  parseCredentialRef,
  validateD1CredentialRow
} from "../services/platform/d1-credential-reference.mjs";
import { createPortalPasswordCredentialService } from "../services/platform/portal-password-credentials.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";

const NOW = "2026-06-03T00:00:00.000Z";
const HEX24 = () => randomBytes(12).toString("hex");

function withStore(fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "platform-credential-ref-"));
  let store;
  try {
    store = createSqliteSubscriptionControlStore({ dbPath: join(tempDir, "control.sqlite") });
    return fn(store);
  } finally {
    store?.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

function totpRow(reference, overrides = {}) {
  return {
    reference,
    accountRef: "acct_ref_1",
    status: "active",
    failureCount: 0,
    lockedUntil: null,
    enrolledAt: NOW,
    lastVerifiedAt: null,
    revokedAt: null,
    updatedAt: NOW,
    ...overrides
  };
}

test("parses the three production reference shapes as v1", () => {
  const password = parseCredentialRef(`portal_pwd_${HEX24()}`);
  assert.equal(password.namespace, "portal_pwd");
  assert.equal(password.version, CREDENTIAL_REF_VERSION);
  assert.match(password.randomPart, /^[0-9a-f]{24}$/u);

  const portalTotp = parseCredentialRef(`portal_totp_${HEX24()}`);
  assert.equal(portalTotp.namespace, "portal_totp");
  assert.equal(portalTotp.version, CREDENTIAL_REF_VERSION);

  const adminTotp = parseCredentialRef(`admin_totp_${randomUUID()}`);
  assert.equal(adminTotp.namespace, "admin_totp");
  assert.equal(adminTotp.version, CREDENTIAL_REF_VERSION);

  assert.equal(isValidCredentialRef(`portal_pwd_${HEX24()}`), true);
});

test("rejects refs carrying identity, URL, or token material", () => {
  for (const ref of [
    `portal_pwd_user@example.com`,
    `portal_pwd_https://example.invalid/x`,
    `portal_pwd_Bearer abc`,
    `portal_pwd_${HEX24()} extra`,
    `portal_pwd_${HEX24()}/x`,
    `portal_pwd_${HEX24()}:x`,
    "",
    null,
    42
  ]) {
    assert.throws(() => parseCredentialRef(ref), /credential_ref_invalid/u, String(ref));
    assert.equal(isValidCredentialRef(ref), false);
  }
});

test("rejects unknown namespaces, wrong shapes, and version-looking refs", () => {
  for (const ref of [
    `portal_xxx_${HEX24()}`,
    `portal_pwd_${randomUUID()}`,
    `admin_totp_${HEX24()}`,
    `portal_totp_${HEX24().slice(0, 12)}`,
    `portal_pwd_${HEX24().toUpperCase()}`,
    `portal_pwd_v2_${HEX24()}`,
    `portal_pwd_`,
    `portalpwd_${HEX24()}`
  ]) {
    assert.throws(() => parseCredentialRef(ref), /credential_ref_invalid/u, ref);
    assert.equal(isValidCredentialRef(ref), false);
  }
});

test("row guard accepts the approved D1 shapes", () => {
  const totp = validateD1CredentialRow(totpRow(`portal_totp_${HEX24()}`));
  assert.equal(totp.status, "active");
  assert.equal(totp.failureCount, 0);

  const password = validateD1CredentialRow({
    reference: `portal_pwd_${HEX24()}`,
    accountRef: "acct_ref_1",
    status: "active",
    failureCount: 2,
    lockedUntil: null,
    mustRotate: 1,
    createdAt: NOW,
    lastVerifiedAt: NOW,
    revokedAt: null,
    updatedAt: NOW
  });
  assert.equal(password.mustRotate, true);
});

test("row guard accepts revoked and locked rows", () => {
  const revoked = validateD1CredentialRow(totpRow(`portal_totp_${HEX24()}`, {
    status: "revoked",
    revokedAt: NOW
  }));
  assert.equal(revoked.status, "revoked");

  const locked = validateD1CredentialRow(totpRow(`portal_totp_${HEX24()}`, {
    status: "locked",
    lockedUntil: NOW
  }));
  assert.equal(locked.status, "locked");
});

test("row guard rejects secret-material keys", () => {
  for (const key of [
    "passwordHash", "password_hash",
    "encryptedTotpSecret", "encrypted_totp_secret",
    "secret", "bearer", "token", "blob",
    "publicKeyJwk", "credentialId", "credentialIdHash"
  ]) {
    assert.throws(
      () => validateD1CredentialRow({ ...totpRow(`portal_totp_${HEX24()}`), [key]: "x" }),
      /credential_row_secret_field/u,
      key
    );
  }
});

test("row guard rejects unknown keys and bad values", () => {
  assert.throws(
    () => validateD1CredentialRow({ ...totpRow(`portal_totp_${HEX24()}`), nickname: "x" }),
    /credential_row_unknown_field/u
  );
  assert.throws(
    () => validateD1CredentialRow(totpRow(`portal_totp_${HEX24()}`, { status: "deleted" })),
    /credential_row_invalid/u
  );
  assert.throws(
    () => validateD1CredentialRow(totpRow(`portal_totp_${HEX24()}`, { failureCount: -1 })),
    /credential_row_invalid/u
  );
  assert.throws(
    () => validateD1CredentialRow(totpRow(`portal_totp_${HEX24()}`, { enrolledAt: "not-a-date" })),
    /credential_row_invalid/u
  );
  assert.throws(
    () => validateD1CredentialRow(totpRow(`portal_pwd_user@example.com`)),
    /credential_ref_invalid/u
  );
  assert.throws(
    () => validateD1CredentialRow(totpRow(`portal_totp_${HEX24()}`, { accountRef: "a@b" })),
    /credential_row_invalid/u
  );
  assert.throws(() => validateD1CredentialRow(null), /credential_row_invalid/u);
  assert.throws(() => validateD1CredentialRow([]), /credential_row_invalid/u);
});

test("row guard fails closed on inconsistent state", () => {
  assert.throws(
    () => validateD1CredentialRow(totpRow(`portal_totp_${HEX24()}`, { revokedAt: NOW })),
    /credential_row_state_inconsistent/u
  );
});

test("production-minted refs parse and projected rows pass the guard", () => {
  withStore((store) => {
    store.createAccount({
      id: "acct_ref_conform",
      ownerRef: "owner_safe_ref",
      status: "active",
      createdAt: NOW,
      updatedAt: NOW
    });

    // Password credential minted by the real service with its default
    // factory: portal_pwd_ + 24 lowercase hex.
    const service = createPortalPasswordCredentialService({
      controlStore: store,
      nowFn: () => NOW,
      saltFactory: () => Buffer.from("0123456789abcdef", "utf8")
    });
    const issued = service.issueInitialPasswordCredential({
      accountId: "acct_ref_conform",
      plainPassword: randomUUID(),
      issuedByRef: "operator_safe_ref",
      approvalRef: "approval_safe_ref",
      mustRotate: true
    });
    const passwordRow = store.getPortalPasswordCredential(issued.summary.credentialRef);
    assert.equal(isValidCredentialRef(passwordRow.id), true);
    // The raw row still carries its hash: it must NOT pass the D1 gate.
    assert.throws(
      () => validateD1CredentialRow({
        reference: passwordRow.id,
        accountRef: passwordRow.accountId,
        status: passwordRow.status,
        failureCount: passwordRow.failureCount,
        passwordHash: passwordRow.passwordHash
      }),
      /credential_row_secret_field/u
    );
    // The D1 projection (secret column stripped) passes.
    const projectedPassword = validateD1CredentialRow({
      reference: passwordRow.id,
      accountRef: passwordRow.accountId,
      status: passwordRow.status,
      failureCount: passwordRow.failureCount,
      lockedUntil: passwordRow.lockedUntil,
      mustRotate: passwordRow.mustRotate,
      createdAt: passwordRow.createdAt,
      lastVerifiedAt: passwordRow.lastVerifiedAt,
      revokedAt: passwordRow.revokedAt,
      updatedAt: passwordRow.updatedAt
    });
    assert.equal(projectedPassword.reference, passwordRow.id);

    // TOTP credential minted with the same factory shape the portal auth
    // service uses by default: portal_totp_ + 24 lowercase hex.
    const totpRef = `portal_totp_${HEX24()}`;
    store.createPortalTotpCredential({
      id: totpRef,
      accountId: "acct_ref_conform",
      encryptedTotpSecret: "v2:test-protected:totp-secret",
      status: "active",
      failureCount: 0,
      enrolledAt: NOW,
      updatedAt: NOW
    });
    const totpRowStored = store.getPortalTotpCredential(totpRef);
    assert.equal(isValidCredentialRef(totpRowStored.id), true);
    assert.throws(
      () => validateD1CredentialRow({
        reference: totpRowStored.id,
        accountRef: totpRowStored.accountId,
        status: totpRowStored.status,
        failureCount: totpRowStored.failureCount,
        encryptedTotpSecret: totpRowStored.encryptedTotpSecret
      }),
      /credential_row_secret_field/u
    );
    const projectedTotp = validateD1CredentialRow({
      reference: totpRowStored.id,
      accountRef: totpRowStored.accountId,
      status: totpRowStored.status,
      failureCount: totpRowStored.failureCount,
      lockedUntil: totpRowStored.lockedUntil,
      enrolledAt: totpRowStored.enrolledAt,
      lastVerifiedAt: totpRowStored.lastVerifiedAt,
      revokedAt: totpRowStored.revokedAt,
      updatedAt: totpRowStored.updatedAt
    });
    assert.equal(projectedTotp.reference, totpRef);
  });
});
