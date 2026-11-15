import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { buildSourceValidationTestEnvironment } from "../../scripts/source-validation-test-runner.mjs";
import { createRuntimeState } from "../state.mjs";
import {
  assertDistinctKeyRings,
  createD1TotpSecretProtector,
  destroyD1KeyRing,
  parseD1KeyRingSecret
} from "../services/platform/d1-t2-security-primitives.mjs";
import {
  createPortalTotpSecretProtector,
  createVersionedTotpVerifier
} from "../services/platform/portal-totp-verifier.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createPortalPasswordCredentialService } from "../services/platform/portal-password-credentials.mjs";
import { createUserPortalAuthService } from "../services/platform/user-portal-auth.mjs";
import { createPortalAccountAdminAuthService } from "../services/platform/admin-auth.mjs";

// M3-a (C2-01/C2-02, S-01~S-07): the Portal/Admin TOTP protector split.
// All key material below is synthetic test-only material, never a
// production key. The two rings use the M3 naming proposal
// `<family>-<yyyy>-<nn>` and must never share key material.
const NOW = "2026-05-31T00:00:00.000Z";
const SESSION_EXPIRES = "2026-05-31T00:30:00.000Z";
const FUTURE = "2099-06-04T00:00:00.000Z";
const TEST_SECRET = "JBSWY3DPEHPK3PXP";
const PORTAL_KEY_ID = "portal-totp-aes-2026-01";
const ADMIN_KEY_ID = "admin-totp-aes-2026-01";
const PORTAL_RING_JSON = JSON.stringify({
  activeKeyId: PORTAL_KEY_ID,
  keys: { [PORTAL_KEY_ID]: "FVILbmjdQDbe5cq59trYrcIYWtt3PuESqwS9fv9xiOM" },
  readKeyIds: [PORTAL_KEY_ID]
});
const ADMIN_RING_JSON = JSON.stringify({
  activeKeyId: ADMIN_KEY_ID,
  keys: { [ADMIN_KEY_ID]: "4fnvXfxS9LQ2N8Ds5EqxzkWRWacxQj1bs7IiNMDqNQU" },
  readKeyIds: [ADMIN_KEY_ID]
});
const REAL_V2_KEY_HEX = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const REPOSITORY_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));

function portalRing() {
  return parseD1KeyRingSecret(PORTAL_RING_JSON, { family: "portal-totp-aes" });
}

function adminRing() {
  return parseD1KeyRingSecret(ADMIN_RING_JSON, { family: "admin-totp-aes" });
}

function portalProtector(ring) {
  return createD1TotpSecretProtector({ keyRing: ring, scope: "portal" });
}

function adminProtector(ring) {
  return createD1TotpSecretProtector({ keyRing: ring, scope: "admin" });
}

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(value) {
  const normalized = value.replace(/=+$/g, "").toUpperCase();
  let bits = "";
  for (const char of normalized) {
    bits += BASE32_ALPHABET.indexOf(char).toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

function hotpCode(secretBytes, counter) {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", secretBytes).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | (digest[offset + 1] << 16)
    | (digest[offset + 2] << 8)
    | digest[offset + 3];
  return String(binary % 10 ** 6).padStart(6, "0");
}

function currentTotpCode(secret, isoTime) {
  const counter = Math.floor(new Date(isoTime).getTime() / 1000 / 30);
  return hotpCode(base32Decode(secret), counter);
}

async function withStore(fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "m3-a-protector-split-"));
  const dbPath = join(tempDir, "control.sqlite");
  const store = createSqliteSubscriptionControlStore({ dbPath });
  try {
    for (const accountId of ["acct_portal_1", "acct_admin_1"]) {
      store.createAccount({
        id: accountId,
        ownerRef: `owner_${accountId}`,
        status: "active",
        createdAt: NOW,
        updatedAt: NOW,
        metadata: {
          loginRef: `${accountId}@example.test`,
          displayRef: `${accountId}@example.test`
        }
      });
      store.createEntitlement({
        id: `ent_${accountId}`,
        accountId,
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
    return await fn({ store, dbPath });
  } finally {
    store.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

function createPasswordService(store) {
  return createPortalPasswordCredentialService({
    controlStore: store,
    nowFn: () => NOW,
    saltFactory: () => Buffer.from("0123456789abcdef", "utf8"),
    credentialRefFactory: () => `pwd_cred_${randomUUID()}`
  });
}

function issuePassword(passwordService, accountId) {
  const plainPassword = `test-password-${randomUUID()}`;
  passwordService.issueInitialPasswordCredential({
    accountId,
    plainPassword,
    issuedByRef: "operator_safe_ref",
    approvalRef: "approval_password_setup"
  });
  return plainPassword;
}

function auditEvents(dbPath, action) {
  const database = new Database(dbPath);
  try {
    const rows = database.prepare(
      "select metadata_json from platform_audit_events where entity_type = 'totp_enrollment' and action = ? order by rowid"
    ).all(action);
    return rows.map((row) => JSON.parse(row.metadata_json));
  } finally {
    database.close();
  }
}

// (a) Independence: each ring decrypts only its own envelopes.
test("portal and admin rings decrypt only their own envelopes", async () => {
  const portal = portalRing();
  const admin = adminRing();
  try {
    assert.equal(portal.activeKeyId, PORTAL_KEY_ID);
    assert.equal(admin.activeKeyId, ADMIN_KEY_ID);
    assert.equal(assertDistinctKeyRings(portal, admin), true);

    const portalProtectorInstance = portalProtector(portal);
    const adminProtectorInstance = adminProtector(admin);
    const credentialRef = "totp_cred_m3a_1";
    const portalEnvelope = await portalProtectorInstance.protect(TEST_SECRET, { credentialRef });
    const adminEnvelope = await adminProtectorInstance.protect(TEST_SECRET, { credentialRef });
    assert.match(portalEnvelope, new RegExp(`^v3:aes-256-gcm:${PORTAL_KEY_ID}:`));
    assert.match(adminEnvelope, new RegExp(`^v3:aes-256-gcm:${ADMIN_KEY_ID}:`));

    assert.equal(await portalProtectorInstance.unprotect(portalEnvelope, { credentialRef }), TEST_SECRET);
    assert.equal(await adminProtectorInstance.unprotect(adminEnvelope, { credentialRef }), TEST_SECRET);
    assert.equal(await portalProtectorInstance.unprotect(adminEnvelope, { credentialRef }), null);
    assert.equal(await adminProtectorInstance.unprotect(portalEnvelope, { credentialRef }), null);
  } finally {
    destroyD1KeyRing(portal);
    destroyD1KeyRing(admin);
  }
});

test("rings built from the same key material fail the separation check", () => {
  const first = portalRing();
  const second = parseD1KeyRingSecret(PORTAL_RING_JSON, { family: "admin-totp-aes" });
  try {
    assert.throws(() => assertDistinctKeyRings(first, second), /key_family_reuse_detected/);
  } finally {
    destroyD1KeyRing(first);
    destroyD1KeyRing(second);
  }
});

// (b) Fail-fast startup.
function runtimeEnv(overrides = {}) {
  return {
    ...buildSourceValidationTestEnvironment({}, { repositoryRoot: REPOSITORY_ROOT }),
    ...overrides
  };
}

function createStateForStartupTest(env) {
  const dir = mkdtempSync(join(tmpdir(), "m3-a-startup-"));
  let state;
  try {
    state = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env,
      subscriptionDbPath: join(dir, "subscriptions.sqlite"),
      controlDbPath: join(dir, "control.sqlite"),
      autoStartHttpProxy: false
    });
    return { dir, state };
  } catch (error) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    throw error;
  }
}

async function closeState(result) {
  if (result?.state) await result.state.close();
  if (result?.dir) rmSync(result.dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
}

test("startup fails closed when the portal ring is unconfigured", () => {
  const { PORTAL_TOTP_AES_KEYRING_JSON: _omit, ...env } = runtimeEnv({
    USER_PORTAL_ROUTES_ENABLED: "true",
    ADMIN_AUTH_ROUTES_ENABLED: "true",
    ADMIN_AUTH_PORTAL_ACCOUNT_ID: "synthetic-admin",
    ADMIN_AUTH_SESSION_SECRET: "synthetic-session-secret"
  });
  assert.throws(
    () => createStateForStartupTest(env),
    (error) => error.code === "validation_error"
      && /PORTAL_TOTP_AES_KEYRING_JSON is required/.test(error.message)
  );
});

test("startup fails closed when the admin ring is unconfigured", () => {
  const { ADMIN_TOTP_AES_KEYRING_JSON: _omit, ...env } = runtimeEnv({
    USER_PORTAL_ROUTES_ENABLED: "true",
    ADMIN_AUTH_ROUTES_ENABLED: "true",
    ADMIN_AUTH_PORTAL_ACCOUNT_ID: "synthetic-admin",
    ADMIN_AUTH_SESSION_SECRET: "synthetic-session-secret"
  });
  assert.throws(
    () => createStateForStartupTest(env),
    (error) => error.code === "validation_error"
      && /ADMIN_TOTP_AES_KEYRING_JSON is required/.test(error.message)
  );
});

test("startup fails closed when a ring is malformed", () => {
  const env = runtimeEnv({
    USER_PORTAL_ROUTES_ENABLED: "true",
    PORTAL_TOTP_AES_KEYRING_JSON: "not-json"
  });
  assert.throws(
    () => createStateForStartupTest(env),
    (error) => error.code === "validation_error"
      && /PORTAL_TOTP_AES_KEYRING_JSON/.test(error.message)
  );
});

test("startup fails closed when the two rings share key material", () => {
  const env = runtimeEnv({
    USER_PORTAL_ROUTES_ENABLED: "true",
    ADMIN_AUTH_ROUTES_ENABLED: "true",
    ADMIN_AUTH_PORTAL_ACCOUNT_ID: "synthetic-admin",
    ADMIN_AUTH_SESSION_SECRET: "synthetic-session-secret",
    ADMIN_TOTP_AES_KEYRING_JSON: PORTAL_RING_JSON
  });
  assert.throws(
    () => createStateForStartupTest(env),
    (error) => error.code === "validation_error"
      && /must not share key material/.test(error.message)
  );
});

test("startup succeeds with both rings configured and routes disabled needs neither", async () => {
  const enabled = createStateForStartupTest(runtimeEnv({
    USER_PORTAL_ROUTES_ENABLED: "true",
    ADMIN_AUTH_ROUTES_ENABLED: "true",
    ADMIN_AUTH_PORTAL_ACCOUNT_ID: "synthetic-admin",
    ADMIN_AUTH_SESSION_SECRET: "synthetic-session-secret"
  }));
  await closeState(enabled);
  const { PORTAL_TOTP_AES_KEYRING_JSON: _omitPortal, ADMIN_TOTP_AES_KEYRING_JSON: _omitAdmin, ...disabledEnv } = runtimeEnv();
  const disabled = createStateForStartupTest(disabledEnv);
  await closeState(disabled);
});

// (c) v3 distribution + scheme A (mint the row id at initiation).
test("portal enrollment writes a v3 envelope bound to the minted credential row id", async () => {
  await withStore(async ({ store, dbPath }) => {
    const portal = portalRing();
    const v3Protector = portalProtector(portal);
    const v2Protector = createPortalTotpSecretProtector({ key: REAL_V2_KEY_HEX });
    const verifier = createVersionedTotpVerifier({
      nowFn: () => NOW,
      v2Protector,
      v3Protector
    });
    try {
      const passwordService = createPasswordService(store);
      let sessionCounter = 0;
      const service = createUserPortalAuthService({
        controlStore: store,
        nowFn: () => NOW,
        entryTokenFactory: () => "portal-entry-raw-secret",
        entryRefFactory: () => "entry_portal_1",
        credentialRefFactory: () => "totp_cred_m3a_1",
        secondFactorChallengeRefFactory: () => "mfa_challenge_1",
        sessionRefFactory: () => `portal_session_m3a_${++sessionCounter}`,
        sessionExpiresAtFactory: () => SESSION_EXPIRES,
        totpSecretFactory: () => TEST_SECRET,
        totpSecretProtector: v3Protector,
        totpVerifier: verifier,
        passwordCredentialService: passwordService,
        allowPasswordOnlySessionForSetup: true
      });
      const plainPassword = issuePassword(passwordService, "acct_portal_1");
      const session = service.verifyPasswordAndMaybeChallenge({
        accountId: "acct_portal_1",
        plainPassword
      });
      const sessionRef = session.session.sessionRef;

      const started = await service.startTotpEnrollment({ sessionRef });
      const code = currentTotpCode(TEST_SECRET, NOW);
      const confirmed = await service.confirmTotpEnrollment({
        sessionRef,
        enrollmentRef: started.enrollment.enrollmentRef,
        code
      });
      assert.equal(confirmed.binding.status, "bound");

      const credential = store.getActivePortalTotpCredential("acct_portal_1");
      assert.equal(credential.id, "totp_cred_m3a_1");
      assert.match(credential.encryptedTotpSecret, new RegExp(`^v3:aes-256-gcm:${PORTAL_KEY_ID}:`));

      const loggedIn = await service.verifyTotpAndCreateSession({ accountId: "acct_portal_1", code });
      assert.equal(loggedIn.session.authMethod, "totp");
    } finally {
      destroyD1KeyRing(portal);
    }
  });
});

test("portal confirm fails closed when the caller supplies a different credentialRef", async () => {
  await withStore(async ({ store, dbPath }) => {
    const portal = portalRing();
    const v3Protector = portalProtector(portal);
    const verifier = createVersionedTotpVerifier({
      nowFn: () => NOW,
      v3Protector
    });
    try {
      const passwordService = createPasswordService(store);
      const service = createUserPortalAuthService({
        controlStore: store,
        nowFn: () => NOW,
        entryTokenFactory: () => "portal-entry-raw-secret",
        entryRefFactory: () => "entry_portal_1",
        credentialRefFactory: () => "totp_cred_m3a_1",
        secondFactorChallengeRefFactory: () => "mfa_challenge_1",
        sessionRefFactory: () => "portal_session_1",
        sessionExpiresAtFactory: () => SESSION_EXPIRES,
        totpSecretFactory: () => TEST_SECRET,
        totpSecretProtector: v3Protector,
        totpVerifier: verifier,
        passwordCredentialService: passwordService,
        allowPasswordOnlySessionForSetup: true
      });
      const plainPassword = issuePassword(passwordService, "acct_portal_1");
      const session = service.verifyPasswordAndMaybeChallenge({
        accountId: "acct_portal_1",
        plainPassword
      });
      const started = await service.startTotpEnrollment({ sessionRef: session.session.sessionRef });
      await assert.rejects(
        service.confirmTotpEnrollment({
          sessionRef: session.session.sessionRef,
          enrollmentRef: started.enrollment.enrollmentRef,
          credentialRef: "totp_cred_other",
          code: currentTotpCode(TEST_SECRET, NOW)
        }),
        /credentialRef does not match/
      );
      assert.equal(store.getActivePortalTotpCredential("acct_portal_1"), null);
    } finally {
      destroyD1KeyRing(portal);
    }
  });
});

test("admin enrollment writes a v3 envelope and the bound event records format v3", async () => {
  await withStore(async ({ store, dbPath }) => {
    const admin = adminRing();
    const v3Protector = adminProtector(admin);
    const verifier = createVersionedTotpVerifier({
      nowFn: () => NOW,
      v3Protector
    });
    try {
      const passwordService = createPasswordService(store);
      const plainPassword = issuePassword(passwordService, "acct_admin_1");
      const auth = createPortalAccountAdminAuthService({
        controlStore: store,
        passwordCredentialService: passwordService,
        nowFn: () => NOW,
        sessionSecret: "synthetic-admin-session-secret",
        accountId: "acct_admin_1",
        totpSecretFactory: () => TEST_SECRET,
        totpSecretProtector: v3Protector,
        totpVerifier: verifier,
        credentialRefFactory: () => "admin_totp_m3a_1"
      });
      const started = await auth.startBootstrap({ bootstrapToken: plainPassword });
      const session = await auth.confirmTotpEnrollment({
        enrollmentRef: started.enrollment.enrollmentRef,
        code: currentTotpCode(TEST_SECRET, NOW)
      });
      assert.equal(session.session.authMethod, "totp");
      const credential = store.getActivePortalTotpCredential("acct_admin_1");
      assert.equal(credential.id, "admin_totp_m3a_1");
      assert.match(credential.encryptedTotpSecret, new RegExp(`^v3:aes-256-gcm:${ADMIN_KEY_ID}:`));
      const bound = auditEvents(dbPath, "totp_enrollment_bound");
      assert.equal(bound.length, 1);
      assert.equal(bound[0].envelopeFormat, "v3");
    } finally {
      destroyD1KeyRing(admin);
    }
  });
});

test("versioned verifier: wrong credentialRef, wrong scope and tampered envelopes fail; legacy legs still verify", async () => {
  const portal = portalRing();
  const admin = adminRing();
  try {
    const portalProtectorInstance = portalProtector(portal);
    const adminProtectorInstance = adminProtector(admin);
    const v2Protector = createPortalTotpSecretProtector({ key: REAL_V2_KEY_HEX });
    const portalVerifier = createVersionedTotpVerifier({
      nowFn: () => NOW,
      v2Protector,
      v3Protector: portalProtectorInstance
    });
    const adminVerifier = createVersionedTotpVerifier({
      nowFn: () => NOW,
      v2Protector,
      v3Protector: adminProtectorInstance
    });
    const code = currentTotpCode(TEST_SECRET, NOW);
    const credentialRef = "totp_cred_m3a_1";
    const portalEnvelope = await portalProtectorInstance.protect(TEST_SECRET, { credentialRef });

    assert.equal(await portalVerifier({ encryptedTotpSecret: portalEnvelope, code, credentialRef }), true);
    assert.equal(await portalVerifier({ encryptedTotpSecret: portalEnvelope, code, credentialRef: "totp_cred_other" }), false);
    assert.equal(await portalVerifier({ encryptedTotpSecret: portalEnvelope, code }), false);
    assert.equal(await adminVerifier({ encryptedTotpSecret: portalEnvelope, code, credentialRef }), false);

    const tampered = portalEnvelope.slice(0, -1) + (portalEnvelope.endsWith("A") ? "B" : "A");
    assert.equal(await portalVerifier({ encryptedTotpSecret: tampered, code, credentialRef }), false);
    assert.equal(await portalVerifier({ encryptedTotpSecret: portalEnvelope, code: "000000", credentialRef }), false);

    const v2Envelope = v2Protector.protect(TEST_SECRET);
    assert.match(v2Envelope, /^v2:aes-256-gcm:/);
    assert.equal(await portalVerifier({ encryptedTotpSecret: v2Envelope, code, credentialRef }), true);
    assert.equal(await portalVerifier({ encryptedTotpSecret: `enc:${TEST_SECRET}`, code, credentialRef }), true);
  } finally {
    destroyD1KeyRing(portal);
    destroyD1KeyRing(admin);
  }
});
