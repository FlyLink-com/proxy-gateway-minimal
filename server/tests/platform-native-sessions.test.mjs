import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, isAbsolute } from "node:path";
import { Worker } from "node:worker_threads";
import Database from "better-sqlite3";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createUserPortalAuthService } from "../services/platform/user-portal-auth.mjs";
import { createPortalPasswordCredentialService } from "../services/platform/portal-password-credentials.mjs";
import { applyNativeSessionMigration, inspectNativeSessionSchema, dryRunNativeSessionMigration } from "../services/platform/native-session-store.mjs";

const START = "2026-10-06T12:00:00.000Z";
const ACCOUNT = "acct_native_synthetic";
const FAMILY_END = "2026-10-13T12:00:00.000Z";
const invalid = { code: "invalid_refresh_grant" };
function fixture(run, { migrate = true } = {}) {
  const db = new Database(":memory:");
  const store = createSqliteSubscriptionControlStore({ database: db });
  store.createAccount({ id: ACCOUNT, ownerRef: "owner_native_synthetic", status: "active", createdAt: START, updatedAt: START });
  store.createPortalPasswordCredential({ id: "pwd_native_synthetic", accountId: ACCOUNT, passwordHash: "synthetic-password-hash", createdAt: START, updatedAt: START });
  if (migrate) applyNativeSessionMigration({ database: db });
  let now = START;
  let serial = 0;
  const service = (extra = {}) => createUserPortalAuthService({ controlStore: store, nowFn: () => now,
    nativeSessionsEnabled: true, sessionRefFactory: () => `portal_session_synthetic_${++serial}`,
    secondFactorChallengeRefFactory: () => `portal_mfa_synthetic_${++serial}`,
    passwordCredentialService: { verifyPasswordCredential() {} }, allowPasswordOnlySessionForSetup: true,
    totpVerifier: ({ code }) => code === "123456", ...extra });
  const auth = service();
  const login = (target = auth) => target.verifyPasswordAndMaybeChallenge({ accountId: ACCOUNT, plainPassword: "synthetic-password" });
  const exchange = () => auth.exchangeNativeSession({ sessionRef: login().session.sessionRef });
  try { return run({ db, store, auth, service, login, exchange, setNow(value) { now = value; } }); }
  finally { db.close(); }
}

test("native schema is explicit and inspection is read only", () => fixture(({ db, auth, login }) => {
  const before = db.prepare("select name, sql from sqlite_master order by name").all();
  assert.equal(inspectNativeSessionSchema({ database: db }).ready, false);
  assert.throws(() => auth.exchangeNativeSession({ sessionRef: login().session.sessionRef }), { code: "native_session_unavailable" });
  assert.deepEqual(db.prepare("select name, sql from sqlite_master order by name").all(), before);
  assert.equal(applyNativeSessionMigration({ database: db }).ready, true);
  assert.equal(applyNativeSessionMigration({ database: db }).ready, true);
}, { migrate: false }));

test("disabled native service leaves legacy login and schema unchanged", () => fixture(({ db, service, login }) => {
  const disabled = service({ nativeSessionsEnabled: false });
  const session = login(disabled).session;
  assert.equal(session.expiresAt, "2026-10-06T12:30:00.000Z");
  assert.throws(() => disabled.exchangeNativeSession({ sessionRef: session.sessionRef }), { code: "not_found" });
  assert.equal(inspectNativeSessionSchema({ database: db }).ready, false);
}, { migrate: false }));

test("fresh exchange stores only digest and preserves short access and absolute deadline", () => fixture(({ db, auth, login, setNow }) => {
  const original = login().session;
  setNow("2026-10-06T12:00:30.000Z");
  const result = auth.exchangeNativeSession({ sessionRef: original.sessionRef });
  assert.deepEqual(result.session, original);
  assert.deepEqual(Object.keys(result).sort(), ["refreshGrant", "session"]);
  assert.deepEqual(Object.keys(result.refreshGrant).sort(), ["expiresAt", "issuedAt", "refreshToken"]);
  assert.match(result.refreshGrant.refreshToken, /^pnr1_[A-Za-z0-9_-]{43}$/);
  assert.equal(result.refreshGrant.issuedAt, START);
  assert.equal(result.refreshGrant.expiresAt, FAMILY_END);
  const rows = db.prepare("select * from platform_native_refresh_grants").all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].token_hash, createHash("sha256").update(result.refreshGrant.refreshToken).digest("hex"));
  assert.equal(JSON.stringify(rows).includes(result.refreshGrant.refreshToken), false);
  assert.throws(() => auth.requireSession({ sessionRef: result.refreshGrant.refreshToken }), { code: "invalid_session" });
}));

test("exchange and browser conversion share a fresh one-use capability", () => fixture(({ auth, login, service, setNow }) => {
  const a = login().session;
  assert.throws(() => service().exchangeNativeSession({ sessionRef: a.sessionRef }), { code: "invalid_session" });
  auth.exchangeNativeSession({ sessionRef: a.sessionRef });
  assert.throws(() => auth.exchangeNativeSession({ sessionRef: a.sessionRef }), { code: "invalid_session" });
  assert.throws(() => auth.createBrowserSession({ sessionRef: a.sessionRef }), { code: "invalid_session" });
  const b = login().session;
  auth.createBrowserSession({ sessionRef: b.sessionRef });
  assert.throws(() => auth.exchangeNativeSession({ sessionRef: b.sessionRef }), { code: "invalid_session" });
  const c = login().session;
  setNow("2026-10-06T12:01:00.001Z");
  assert.throws(() => auth.exchangeNativeSession({ sessionRef: c.sessionRef }), { code: "invalid_session" });
}));

test("registration setup cannot acquire a native refresh grant", () => fixture(({ auth }) => {
  const created = auth.createPasswordSetupSession({ accountId: ACCOUNT, loginRef: "synthetic@example.test" });
  assert.throws(() => auth.exchangeNativeSession({ sessionRef: created.session.sessionRef }), { code: "invalid_session" });
}));

test("MFA creates no grant before completion and permits fresh exchange after completion", () => fixture(({ auth, store, login, db }) => {
  store.createPortalTotpCredential({ id: "totp_native_synthetic", accountId: ACCOUNT, encryptedTotpSecret: "synthetic-totp", enrolledAt: START, updatedAt: START });
  const result = login();
  assert.equal(result.session, undefined);
  assert.equal(db.prepare("select count(*) n from platform_native_refresh_grants").get().n, 0);
  assert.throws(() => auth.completeSecondFactor({ challengeRef: result.result.challengeRef, factor: "totp", code: "wrong" }));
  const completed = auth.completeSecondFactor({ challengeRef: result.result.challengeRef, factor: "totp", code: "123456" });
  assert.equal(auth.exchangeNativeSession({ sessionRef: completed.session.sessionRef }).refreshGrant.expiresAt, FAMILY_END);
}));

test("rotation survives service restart without extending family expiry or conversion eligibility", () => fixture(({ exchange, service, setNow, auth }) => {
  const first = exchange();
  setNow("2026-10-06T12:31:00.000Z");
  const restarted = service();
  const next = restarted.refreshNativeSession({ refreshToken: first.refreshGrant.refreshToken });
  assert.notEqual(next.session.sessionRef, first.session.sessionRef);
  assert.notEqual(next.refreshGrant.refreshToken, first.refreshGrant.refreshToken);
  assert.equal(next.session.issuedAt, "2026-10-06T12:31:00.000Z");
  assert.equal(next.session.expiresAt, "2026-10-06T13:01:00.000Z");
  assert.equal(next.session.accountId, ACCOUNT);
  assert.equal(next.refreshGrant.issuedAt, START);
  assert.equal(next.refreshGrant.expiresAt, FAMILY_END);
  assert.throws(() => restarted.exchangeNativeSession({ sessionRef: next.session.sessionRef }), { code: "invalid_session" });
  assert.throws(() => restarted.createBrowserSession({ sessionRef: next.session.sessionRef }), { code: "invalid_session" });
  assert.throws(() => auth.requireSession({ sessionRef: first.session.sessionRef }), { code: "invalid_session" });
}));

test("access is capped by the original family deadline and exactly expired grants fail", () => fixture(({ exchange, auth, setNow }) => {
  const first = exchange();
  setNow("2026-10-13T11:59:00.000Z");
  const last = auth.refreshNativeSession({ refreshToken: first.refreshGrant.refreshToken });
  assert.equal(last.session.expiresAt, FAMILY_END);
  setNow(FAMILY_END);
  assert.throws(() => auth.refreshNativeSession({ refreshToken: last.refreshGrant.refreshToken }), invalid);
}));

test("clock rollback cannot mint or refresh a future-dated family", () => fixture(({ auth, login, setNow, exchange }) => {
  const pending = login().session;
  setNow("2026-10-06T11:59:59.999Z");
  assert.throws(() => auth.exchangeNativeSession({ sessionRef: pending.sessionRef }), { code: "invalid_session" });
  setNow(START);
  const first = exchange();
  setNow("2026-10-06T11:59:59.999Z");
  assert.throws(() => auth.refreshNativeSession({ refreshToken: first.refreshGrant.refreshToken }), invalid);
}));

test("consumed token replay commits family and access revocation before throwing", () => fixture(({ auth, exchange, store }) => {
  const first = exchange();
  const next = auth.refreshNativeSession({ refreshToken: first.refreshGrant.refreshToken });
  assert.throws(() => auth.refreshNativeSession({ refreshToken: first.refreshGrant.refreshToken }), invalid);
  assert.throws(() => auth.refreshNativeSession({ refreshToken: next.refreshGrant.refreshToken }), invalid);
  assert.equal(store.getPortalSession(first.session.sessionRef).status, "revoked");
  assert.equal(store.getPortalSession(next.session.sessionRef).status, "revoked");
}));

test("failed rotation rolls back consume and session creation", () => fixture(({ auth, exchange, store, db }) => {
  const first = exchange();
  const before = db.prepare("select * from platform_native_refresh_grants order by token_hash").all();
  const original = store.createPortalSession;
  store.createPortalSession = () => { throw new Error("synthetic storage failure"); };
  assert.throws(() => auth.refreshNativeSession({ refreshToken: first.refreshGrant.refreshToken }), { code: "native_session_unavailable" });
  store.createPortalSession = original;
  assert.deepEqual(db.prepare("select * from platform_native_refresh_grants order by token_hash").all(), before);
  assert.equal(store.listPortalSessions({ accountId: ACCOUNT }).length, 1);
  assert.equal(auth.refreshNativeSession({ refreshToken: first.refreshGrant.refreshToken }).session.accountId, ACCOUNT);
}));

test("logout is idempotent, recognizes consumed generations and does not revoke another login", () => fixture(({ auth, exchange }) => {
  const first = exchange();
  const other = exchange();
  const next = auth.refreshNativeSession({ refreshToken: first.refreshGrant.refreshToken });
  const request = { refreshToken: first.refreshGrant.refreshToken };
  assert.deepEqual(auth.logoutNativeSession(request), { loggedOut: true });
  assert.deepEqual(auth.logoutNativeSession(request), { loggedOut: true });
  assert.deepEqual(auth.logoutNativeSession({ refreshToken: `pnr1_${Buffer.alloc(32, 4).toString("base64url")}` }), { loggedOut: true });
  assert.throws(() => auth.refreshNativeSession({ refreshToken: next.refreshGrant.refreshToken }), invalid);
  assert.equal(auth.refreshNativeSession({ refreshToken: other.refreshGrant.refreshToken }).session.accountId, ACCOUNT);
}));

test("explicit access revoke invalidates the associated family", () => fixture(({ auth, exchange }) => {
  const first = exchange();
  const next = auth.refreshNativeSession({ refreshToken: first.refreshGrant.refreshToken });
  auth.revokeSession({ sessionRef: first.session.sessionRef });
  assert.throws(() => auth.refreshNativeSession({ refreshToken: next.refreshGrant.refreshToken }), invalid);
}));

test("explicit revoke also invalidates a family after access is marked expired", () => fixture(({ auth, exchange, db }) => {
  const first = exchange();
  db.prepare("update platform_portal_sessions set status='expired' where id=?").run(first.session.sessionRef);
  auth.revokeSession({ sessionRef: first.session.sessionRef });
  assert.throws(() => auth.refreshNativeSession({ refreshToken: first.refreshGrant.refreshToken }), invalid);
}));

test("migration dry run applies only to an isolated in-memory copy", () => fixture(({ db }) => {
  const before = db.serialize();
  const result = dryRunNativeSessionMigration({ database: db });
  assert.equal(result.ready, true);
  assert.equal(result.sourceChanged, false);
  assert.equal(result.mode, "dry-run");
  assert.equal(inspectNativeSessionSchema({ database: db }).ready, false);
  assert.deepEqual(db.serialize(), before);
}, { migrate: false }));

test("deleting access, replacing or deleting a credential cannot revive refresh", () => {
  for (const operation of [
    "delete from platform_portal_sessions",
    "delete from platform_portal_password_credentials",
    `insert into platform_portal_password_credentials(id,account_id,password_hash,status,created_at,updated_at) values('replacement_pwd','${ACCOUNT}','synthetic-replacement','active','${START}','${START}')`,
  ]) fixture(({ auth, exchange, db }) => {
    const first = exchange();
    const next = auth.refreshNativeSession({ refreshToken: first.refreshGrant.refreshToken });
    db.exec(operation);
    assert.throws(() => auth.refreshNativeSession({ refreshToken: next.refreshGrant.refreshToken }), invalid);
  });
});

test("account deletion cascades without recreating epoch rows or blocking the delete", () => fixture(({ auth, exchange, db }) => {
  const first = exchange();
  db.prepare("delete from platform_accounts where id=?").run(ACCOUNT);
  assert.equal(db.prepare("select count(*) n from platform_native_auth_epochs").get().n, 0);
  assert.equal(db.prepare("select count(*) n from platform_native_refresh_grants").get().n, 0);
  assert.throws(() => auth.refreshNativeSession({ refreshToken: first.refreshGrant.refreshToken }), invalid);
}));

test("standalone TOTP authentication is not a password-complete native exchange", () => fixture(({ auth, store }) => {
  store.createPortalTotpCredential({ id: "totp_native_synthetic", accountId: ACCOUNT, encryptedTotpSecret: "synthetic-totp", enrolledAt: START, updatedAt: START });
  const session = auth.verifyTotpAndCreateSession({ accountId: ACCOUNT, code: "123456" }).session;
  assert.throws(() => auth.exchangeNativeSession({ sessionRef: session.sessionRef }), { code: "invalid_session" });
}));

for (const [name, sql] of [
  ["account disable and reenable", "update platform_accounts set status='disabled'; update platform_accounts set status='active'"],
  ["password material replacement", "update platform_portal_password_credentials set password_hash='changed-synthetic'"],
  ["password revoke and restore", "update platform_portal_password_credentials set status='revoked'; update platform_portal_password_credentials set status='active'"],
  ["MFA material replacement", "update platform_portal_totp_credentials set encrypted_totp_secret='changed-synthetic'"],
]) test(`${name} revokes all native families without revival`, () => fixture(({ auth, db, store, login }) => {
  store.createPortalTotpCredential({ id: "totp_native_synthetic", accountId: ACCOUNT, encryptedTotpSecret: "synthetic-totp", enrolledAt: START, updatedAt: START });
  const make = () => { const challenge = login(); const session = auth.completeSecondFactor({ challengeRef: challenge.result.challengeRef, factor: "totp", code: "123456" }).session; return auth.exchangeNativeSession({ sessionRef: session.sessionRef }); };
  const a = make(); const b = make();
  db.exec(sql);
  for (const current of [a, b]) {
    assert.throws(() => auth.refreshNativeSession({ refreshToken: current.refreshGrant.refreshToken }), invalid);
    assert.throws(() => auth.requireSession({ sessionRef: current.session.sessionRef }), { code: "invalid_session" });
  }
}));

test("ordinary password verification timestamps do not revoke a native login", () => fixture(({ auth, exchange, store }) => {
  const first = exchange();
  store.markPortalPasswordVerified("pwd_native_synthetic", { verifiedAt: START, updatedAt: START });
  assert.equal(auth.refreshNativeSession({ refreshToken: first.refreshGrant.refreshToken }).session.accountId, ACCOUNT);
}));

test("ordinary MFA verification and passkey counters preserve grants but key replacement revokes", () => fixture(({ auth, store, login, db }) => {
  store.createPortalTotpCredential({ id: "totp_native_synthetic", accountId: ACCOUNT, encryptedTotpSecret: "synthetic-totp", enrolledAt: START, updatedAt: START });
  store.createPortalPasskeyCredential({ id: "passkey_native_synthetic", accountId: ACCOUNT, credentialId: "synthetic-id",
    credentialIdHash: "synthetic-id-hash", publicKeyJwk: { kty: "EC", synthetic: true }, createdAt: START, updatedAt: START });
  const challenge = login();
  const completed = auth.completeSecondFactor({ challengeRef: challenge.result.challengeRef, factor: "totp", code: "123456" });
  const first = auth.exchangeNativeSession({ sessionRef: completed.session.sessionRef });
  store.markPortalTotpVerified("totp_native_synthetic", { verifiedAt: START, updatedAt: START });
  store.markPortalPasskeyVerified("passkey_native_synthetic", { signCount: 2, verifiedAt: START, updatedAt: START });
  const next = auth.refreshNativeSession({ refreshToken: first.refreshGrant.refreshToken });
  assert.equal(next.session.authMethod, "totp");
  db.exec("update platform_portal_passkey_credentials set public_key_jwk_json='{}'");
  assert.throws(() => auth.refreshNativeSession({ refreshToken: next.refreshGrant.refreshToken }), invalid);
}));

test("successful MFA can clear an expired lock without invalidating its own native challenge", () => fixture(({ auth, store, login, db }) => {
  store.createPortalTotpCredential({ id: "totp_native_synthetic", accountId: ACCOUNT, encryptedTotpSecret: "synthetic-totp", enrolledAt: START, updatedAt: START });
  db.exec("update platform_portal_totp_credentials set locked_until='2026-10-06T11:59:00.000Z'");
  const challenge = login();
  const completed = auth.completeSecondFactor({ challengeRef: challenge.result.challengeRef, factor: "totp", code: "123456" });
  assert.equal(auth.exchangeNativeSession({ sessionRef: completed.session.sessionRef }).refreshGrant.expiresAt, FAMILY_END);
  assert.equal(store.getActivePortalTotpCredential(ACCOUNT).lockedUntil, null);
}));

test("successful password verification can clear an expired lock without invalidating fresh auth", () => fixture(({ store, service, login, db }) => {
  const passwordCredentialService = createPortalPasswordCredentialService({ controlStore: store, nowFn: () => START,
    credentialRefFactory: () => "pwd_native_z_real" });
  passwordCredentialService.issueInitialPasswordCredential({ accountId: ACCOUNT, plainPassword: "synthetic-password",
    issuedByRef: "synthetic_operator", approvalRef: "synthetic_approval" });
  db.exec("update platform_portal_password_credentials set locked_until='2026-10-06T11:59:00.000Z'");
  const auth = service({ passwordCredentialService });
  const completed = login(auth);
  assert.equal(auth.exchangeNativeSession({ sessionRef: completed.session.sessionRef }).refreshGrant.expiresAt, FAMILY_END);
  assert.equal(store.getActivePortalPasswordCredential(ACCOUNT).lockedUntil, null);
}));

test("a new future credential lock still revokes existing native grants", () => fixture(({ auth, exchange, db }) => {
  const first = exchange();
  db.exec("update platform_portal_password_credentials set locked_until='2026-10-06T12:15:00.000Z'");
  assert.throws(() => auth.refreshNativeSession({ refreshToken: first.refreshGrant.refreshToken }), invalid);
  db.exec("update platform_portal_password_credentials set locked_until=null");
  assert.throws(() => auth.refreshNativeSession({ refreshToken: first.refreshGrant.refreshToken }), invalid);
}));

test("future password and MFA locks still reject authentication before any native grant", () => fixture(({ auth, store, service, login, db }) => {
  const passwordCredentialService = createPortalPasswordCredentialService({ controlStore: store, nowFn: () => START,
    credentialRefFactory: () => "pwd_native_z_real" });
  passwordCredentialService.issueInitialPasswordCredential({ accountId: ACCOUNT, plainPassword: "synthetic-password",
    issuedByRef: "synthetic_operator", approvalRef: "synthetic_approval" });
  db.exec("update platform_portal_password_credentials set locked_until='2026-10-06T12:15:00.000Z'");
  assert.throws(() => login(service({ passwordCredentialService })));
  db.exec("update platform_portal_password_credentials set locked_until=null");
  store.createPortalTotpCredential({ id: "totp_native_synthetic", accountId: ACCOUNT, encryptedTotpSecret: "synthetic-totp", enrolledAt: START, updatedAt: START });
  db.exec("update platform_portal_totp_credentials set locked_until='2026-10-06T12:15:00.000Z'");
  const challenge = login();
  assert.throws(() => auth.completeSecondFactor({ challengeRef: challenge.result.challengeRef, factor: "totp", code: "123456" }));
  assert.equal(db.prepare("select count(*) n from platform_native_refresh_grants").get().n, 0);
}));

test("failed exchange consumes only the one-use permission and leaves the valid short access", () => fixture(({ auth, store, login, db }) => {
  const session = login().session;
  const original = store.nativeSessions;
  store.nativeSessions = { ...original, create() { throw new Error("synthetic storage failure"); } };
  assert.throws(() => auth.exchangeNativeSession({ sessionRef: session.sessionRef }), { code: "native_session_unavailable" });
  store.nativeSessions = original;
  assert.throws(() => auth.exchangeNativeSession({ sessionRef: session.sessionRef }), { code: "invalid_session" });
  assert.equal(auth.requireSession({ sessionRef: session.sessionRef }).accountId, ACCOUNT);
  assert.equal(db.prepare("select count(*) n from platform_native_refresh_grants").get().n, 0);
}));

test("credential change between fresh authentication and exchange is rejected", () => fixture(({ auth, db, login }) => {
  const session = login().session;
  db.exec("update platform_portal_password_credentials set password_hash='changed-synthetic'");
  assert.throws(() => auth.exchangeNativeSession({ sessionRef: session.sessionRef }), { code: "invalid_session" });
}));

for (const [label, sql] of [
  ["credential restored to original bytes", "update platform_portal_password_credentials set password_hash='changed-synthetic'; update platform_portal_password_credentials set password_hash='synthetic-password-hash'"],
  ["account reenabled", "update platform_accounts set status='disabled'; update platform_accounts set status='active'"],
]) test(`fresh one-use native permission cannot revive after ${label}`, () => fixture(({ auth, db, login, store }) => {
  const session = login().session;
  db.exec(sql);
  assert.throws(() => auth.exchangeNativeSession({ sessionRef: session.sessionRef }), { code: "invalid_session" });
  assert.equal(store.getPortalSession(session.sessionRef).status, "active"); // No broader legacy/browser revoke.
}));

for (const operation of [
  "update platform_portal_password_credentials set password_hash='changed-synthetic'",
  "update platform_portal_password_credentials set status='revoked'",
  "update platform_portal_password_credentials set password_hash='changed-synthetic'; update platform_portal_password_credentials set password_hash='synthetic-password-hash'",
  "update platform_accounts set status='disabled'; update platform_accounts set status='active'",
]) test(`native MFA refuses intervening credential/account changes (${operation.split(' ')[1]})`, () => fixture(({ auth, db, store, login }) => {
  store.createPortalTotpCredential({ id: "totp_native_synthetic", accountId: ACCOUNT, encryptedTotpSecret: "synthetic-totp", enrolledAt: START, updatedAt: START });
  const challenge = login();
  db.exec(operation);
  assert.throws(() => auth.completeSecondFactor({ challengeRef: challenge.result.challengeRef, factor: "totp", code: "123456" }));
  assert.equal(db.prepare("select count(*) n from platform_native_refresh_grants").get().n, 0);
  assert.equal(store.listPortalSessions({ accountId: ACCOUNT }).length, 0);
}));

test("native MFA credential binding survives service restart and stays private", () => fixture(({ store, login, service }) => {
  store.createPortalTotpCredential({ id: "totp_native_synthetic", accountId: ACCOUNT, encryptedTotpSecret: "synthetic-totp", enrolledAt: START, updatedAt: START });
  const challenge = login();
  const saved = store.getPortalSecondFactorChallenge(challenge.result.challengeRef);
  assert.match(saved.challengeHash, /^portalnative_mfa_v1_[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(challenge).includes(saved.challengeHash), false);
  const restarted = service();
  const completed = restarted.completeSecondFactor({ challengeRef: challenge.result.challengeRef, factor: "totp", code: "123456" });
  assert.equal(restarted.exchangeNativeSession({ sessionRef: completed.session.sessionRef }).refreshGrant.expiresAt, FAMILY_END);
}));

test("historical MFA challenge retains short login but cannot acquire a native grant", () => fixture(({ auth, store, service, login }) => {
  store.createPortalTotpCredential({ id: "totp_native_synthetic", accountId: ACCOUNT, encryptedTotpSecret: "synthetic-totp", enrolledAt: START, updatedAt: START });
  const challenge = login(service({ nativeSessionsEnabled: false }));
  const completed = auth.completeSecondFactor({ challengeRef: challenge.result.challengeRef, factor: "totp", code: "123456" });
  assert.equal(completed.session.expiresAt, "2026-10-06T12:30:00.000Z");
  assert.throws(() => auth.exchangeNativeSession({ sessionRef: completed.session.sessionRef }), { code: "invalid_session" });
}));

test("malformed or unsupported native MFA binding cannot fall back to short login", () => fixture(({ auth, store, login, db }) => {
  store.createPortalTotpCredential({ id: "totp_native_synthetic", accountId: ACCOUNT, encryptedTotpSecret: "synthetic-totp", enrolledAt: START, updatedAt: START });
  const challenge = login();
  for (const changed of ["portalnative_mfa_v1_bad", `portalnative_mfa_v2_${"a".repeat(64)}`, `portalnative_mfa_v1_${"a".repeat(64)}`]) {
    db.prepare("update platform_portal_second_factor_challenges set challenge_hash=? where id=?").run(changed, challenge.result.challengeRef);
    assert.throws(() => auth.completeSecondFactor({ challengeRef: challenge.result.challengeRef, factor: "totp", code: "123456" }));
  }
}));

test("missing schema and disabled feature produce only historical short MFA challenges", () => {
  for (const migrate of [false, true]) fixture(({ auth, store, login, service }) => {
    store.createPortalTotpCredential({ id: "totp_native_synthetic", accountId: ACCOUNT, encryptedTotpSecret: "synthetic-totp", enrolledAt: START, updatedAt: START });
    const target = migrate ? service({ nativeSessionsEnabled: false }) : auth;
    const challenge = login(target);
    assert.match(store.getPortalSecondFactorChallenge(challenge.result.challengeRef).challengeHash, /^portalmfahash_/);
    assert.equal(target.completeSecondFactor({ challengeRef: challenge.result.challengeRef, factor: "totp", code: "123456" }).session.expiresAt, "2026-10-06T12:30:00.000Z");
  }, { migrate });
});

test("native revocation triggers do not change a historical browser MFA challenge", () => fixture(({ db, store, login, service }) => {
  store.createPortalTotpCredential({ id: "totp_native_synthetic", accountId: ACCOUNT, encryptedTotpSecret: "synthetic-totp", enrolledAt: START, updatedAt: START });
  const challenge = login(service({ nativeSessionsEnabled: false }));
  const before = store.getPortalSecondFactorChallenge(challenge.result.challengeRef);
  db.exec("update platform_accounts set status='disabled'; update platform_accounts set status='active'");
  assert.deepEqual(store.getPortalSecondFactorChallenge(challenge.result.challengeRef), before);
}));

test("schema comparison preserves the case and whitespace of SQL string literals", () => fixture(({ db }) => {
  const original = db.prepare("select sql from sqlite_master where name='native_sessions_password_insert'").get().sql;
  db.exec("drop trigger native_sessions_password_insert");
  db.exec(original.replace("'active'", "'ACTIVE'"));
  assert.equal(inspectNativeSessionSchema({ database: db }).ready, false);
}));

test("malformed, noncanonical and foreign credential kinds cannot be used as refresh tokens", () => fixture(({ auth, exchange }) => {
  const first = exchange();
  for (const refreshToken of [null, "", "a".repeat(48), first.session.sessionRef, `${first.refreshGrant.refreshToken}=`, ` ${first.refreshGrant.refreshToken}`, `pnr1_${"a".repeat(43)}`, { value: first.refreshGrant.refreshToken }]) {
    assert.throws(() => auth.refreshNativeSession({ refreshToken }), { code: "validation_error" });
  }
  assert.equal(auth.refreshNativeSession({ refreshToken: first.refreshGrant.refreshToken }).session.accountId, ACCOUNT);
}));

test("altered migration trigger definitions fail closed rather than being repaired at runtime", () => fixture(({ db, auth, exchange }) => {
  const first = exchange();
  db.exec("drop trigger native_sessions_account_state_revoke");
  assert.equal(inspectNativeSessionSchema({ database: db }).ready, false);
  assert.throws(() => auth.refreshNativeSession({ refreshToken: first.refreshGrant.refreshToken }), { code: "native_session_unavailable" });
  assert.throws(() => applyNativeSessionMigration({ database: db }), { code: "native_session_schema_conflict" });
}));

test("two independent SQLite connections serialize same-token rotation and commit replay revocation", async () => {
  const root = tmpdir();
  const directory = mkdtempSync(join(root, "native-session-race-"));
  const dbPath = join(directory, "synthetic.sqlite");
  const db = new Database(dbPath);
  const store = createSqliteSubscriptionControlStore({ database: db });
  const workers = [];
  try {
    store.createAccount({ id: ACCOUNT, ownerRef: "synthetic_owner", status: "active", createdAt: START, updatedAt: START });
    store.createPortalPasswordCredential({ id: "pwd_race_synthetic", accountId: ACCOUNT, passwordHash: "synthetic", createdAt: START, updatedAt: START });
    applyNativeSessionMigration({ database: db });
    const auth = createUserPortalAuthService({ controlStore: store, nowFn: () => START, nativeSessionsEnabled: true,
      passwordCredentialService: { verifyPasswordCredential() {} }, allowPasswordOnlySessionForSetup: true, totpVerifier: () => false });
    const fresh = auth.verifyPasswordAndMaybeChallenge({ accountId: ACCOUNT, plainPassword: "synthetic" }).session;
    const grant = auth.exchangeNativeSession({ sessionRef: fresh.sessionRef }).refreshGrant;
    const results = [];
    await Promise.all([0, 1].map(async () => {
      const worker = new Worker(new URL("./helpers/native-session-race-worker.mjs", import.meta.url), {
        workerData: { dbPath, refreshToken: grant.refreshToken, now: START },
      });
      workers.push(worker);
      await new Promise((resolve, reject) => { worker.once("error", reject); worker.once("message", value => value === "ready" ? resolve() : reject(new Error("synthetic worker startup failure"))); });
    }));
    const completions = workers.map(worker => new Promise((resolve, reject) => {
      worker.once("error", reject); worker.once("message", value => { results.push(value); resolve(); });
    }));
    for (const worker of workers) worker.postMessage("rotate");
    await Promise.all(completions);
    assert.deepEqual(results.sort(), ["invalid_refresh_grant", "success"]);
    assert.equal(db.prepare("select count(*) n from platform_native_refresh_grants").get().n, 2);
    assert.equal(db.prepare("select count(*) n from platform_native_refresh_grants where revoked_at is null").get().n, 0);
    assert.equal(db.prepare("select count(*) n from platform_portal_sessions where status='active'").get().n, 0);
  } finally {
    await Promise.all(workers.map(worker => worker.terminate()));
    db.close();
    const child = relative(root, directory);
    assert.ok(child.startsWith("native-session-race-") && !child.includes("..") && !isAbsolute(child));
    rmSync(directory, { recursive: true, force: true });
  }
});
