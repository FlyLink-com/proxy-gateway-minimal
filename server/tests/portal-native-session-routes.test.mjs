import assert from "node:assert/strict";
import test from "node:test";
import { request } from "node:http";
import Database from "better-sqlite3";
import express from "express";
import { userPortalRoutes } from "../routes/user-portal.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createUserPortalAuthService } from "../services/platform/user-portal-auth.mjs";
import { applyNativeSessionMigration } from "../services/platform/native-session-store.mjs";
import { listen } from "./helpers/listen.mjs";

const NOW = "2026-10-06T12:00:00.000Z";
async function fixture(run, { enabled = true, migrate = true } = {}) {
  const db = new Database(":memory:");
  const store = createSqliteSubscriptionControlStore({ database: db });
  store.createAccount({ id: "acct_native_route", ownerRef: "owner_native_route", status: "active", createdAt: NOW, updatedAt: NOW });
  store.createPortalPasswordCredential({ id: "pwd_native_route", accountId: "acct_native_route", passwordHash: "synthetic-hash", createdAt: NOW, updatedAt: NOW });
  if (migrate) applyNativeSessionMigration({ database: db });
  const auth = createUserPortalAuthService({ controlStore: store, nowFn: () => NOW, nativeSessionsEnabled: enabled,
    passwordCredentialService: { verifyPasswordCredential() {} }, allowPasswordOnlySessionForSetup: true, totpVerifier: () => false });
  const app = express();
  app.use(express.json());
  app.use(userPortalRoutes({ platform: { userPortalAuth: auth } }));
  const { server } = await listen(app);
  const post = (path, body, headers = {}) => new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = request({ hostname: "127.0.0.1", port: server.address().port, method: "POST", path,
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(data), ...headers } }, res => {
      let raw = "";
      res.setEncoding("utf8"); res.on("data", part => { raw += part; });
      res.on("end", () => { let body = null; try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
        resolve({ status: res.statusCode, headers: res.headers, body }); });
    });
    req.on("error", reject); req.end(data);
  });
  const login = () => auth.verifyPasswordAndMaybeChallenge({ accountId: "acct_native_route", plainPassword: "synthetic-password" }).session;
  try { await run({ db, store, auth, post, login }); }
  finally { await new Promise(resolve => server.close(resolve)); db.close(); }
}

test("native exchange, rotation and logout expose only the frozen DTO and no-store", () => fixture(async ({ post, login }) => {
  const access = login();
  const first = await post("/api/portal/native-session", {}, { "x-portal-session": access.sessionRef });
  assert.equal(first.status, 200);
  assert.deepEqual(first.body.session, access);
  assert.equal(first.headers["cache-control"], "no-store");
  assert.equal(first.headers["set-cookie"], undefined);
  const next = await post("/api/portal/native-session/refresh", { refreshToken: first.body.refreshGrant.refreshToken });
  assert.equal(next.status, 200);
  assert.equal(next.body.session.accountId, access.accountId);
  assert.notEqual(next.body.session.sessionRef, access.sessionRef);
  assert.equal(next.headers["cache-control"], "no-store");
  const logout = await post("/api/portal/native-session/logout", { refreshToken: next.body.refreshGrant.refreshToken });
  assert.equal(logout.status, 200);
  assert.deepEqual(logout.body, { loggedOut: true });
  assert.equal(logout.headers["cache-control"], "no-store");
  const revoked = await post("/api/portal/native-session/refresh", { refreshToken: next.body.refreshGrant.refreshToken });
  assert.equal(revoked.status, 401);
  assert.deepEqual(revoked.body, { error: "invalid_refresh_grant" });
  assert.equal(revoked.headers["cache-control"], "no-store");
}));

test("disabled endpoints return 404 without migration or changing short login", () => fixture(async ({ post, login }) => {
  const access = login();
  assert.equal(access.expiresAt, "2026-10-06T12:30:00.000Z");
  for (const path of ["", "/refresh", "/logout"]) {
    const response = await post(`/api/portal/native-session${path}`, {});
    assert.equal(response.status, 404);
    assert.deepEqual(response.body, { error: "not_found" });
    assert.equal(response.headers["cache-control"], "no-store");
  }
}, { enabled: false, migrate: false }));

test("enabled but missing schema is 503 rather than silent old-server fallback", () => fixture(async ({ post, login }) => {
  const response = await post("/api/portal/native-session", {}, { "x-portal-session": login().sessionRef });
  assert.equal(response.status, 503);
  assert.deepEqual(response.body, { error: "native_session_unavailable" });
}, { migrate: false }));

test("exchange rejects query and body session references or missing/duplicate access headers", () => fixture(async ({ post, login }) => {
  const access = login();
  for (const [path, body, headers] of [
    ["/api/portal/native-session", {}, {}],
    ["/api/portal/native-session", { sessionRef: access.sessionRef }, {}],
    ["/api/portal/native-session?sessionRef=synthetic", {}, { "x-portal-session": access.sessionRef }],
    ["/api/portal/native-session", { rememberMe: true }, { "x-portal-session": access.sessionRef }],
    ["/api/portal/native-session", {}, { "x-portal-session": [access.sessionRef, access.sessionRef] }],
  ]) assert.ok((await post(path, body, headers)).status >= 400);
  assert.equal((await post("/api/portal/native-session", {}, { "x-portal-session": access.sessionRef })).status, 200);
}));

for (const suffix of ["/refresh", "/logout"]) test(`native ${suffix} rejects mixed credentials and extra fields before consuming`, () => fixture(async ({ post, login }) => {
  const access = login();
  const first = await post("/api/portal/native-session", {}, { "x-portal-session": access.sessionRef });
  const body = { refreshToken: first.body.refreshGrant.refreshToken };
  const path = `/api/portal/native-session${suffix}`;
  for (const [badBody, headers, badPath] of [
    [body, { "x-portal-session": access.sessionRef }, path],
    [body, { authorization: "Bearer synthetic" }, path],
    [body, { cookie: "Unrelated=synthetic" }, path],
    [body, { "x-portal-request": "browser-v1" }, path],
    [body, { "x-portal-session-context": "portalctx_synthetic" }, path],
    [{ ...body, accountId: "acct_other" }, {}, path],
    [{ ...body, sessionRef: access.sessionRef }, {}, path],
    [body, {}, `${path}?unexpected=1`],
    [[], {}, path],
  ]) assert.ok((await post(badPath, badBody, headers)).status >= 400);
  assert.equal((await post(path, body)).status, 200);
}));

test("stale exchange, malformed grant and unknown grant have bounded errors without reflection", () => fixture(async ({ post, login, auth }) => {
  const access = login();
  auth.exchangeNativeSession({ sessionRef: access.sessionRef });
  assert.deepEqual((await post("/api/portal/native-session", {}, { "x-portal-session": access.sessionRef })).body, { error: "invalid_session" });
  const malformed = await post("/api/portal/native-session/refresh", { refreshToken: "synthetic-do-not-reflect" });
  assert.equal(malformed.status, 400);
  assert.deepEqual(malformed.body, { error: "validation_error" });
  const unknown = await post("/api/portal/native-session/refresh", { refreshToken: `pnr1_${Buffer.alloc(32, 8).toString("base64url")}` });
  assert.equal(unknown.status, 401);
  assert.deepEqual(unknown.body, { error: "invalid_refresh_grant" });
}));
