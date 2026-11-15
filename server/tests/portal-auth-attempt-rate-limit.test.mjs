import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { userPortalRoutes } from "../routes/user-portal.mjs";
import { resolveClientIp } from "../services/ip-address.mjs";
import { listen } from "./helpers/listen.mjs";

const SECOND_FACTOR = "/api/portal/password/second-factor";
const ENROLLMENT = "/api/portal/security/totp/enrollment";
const ENROLLMENT_CONFIRM = "/api/portal/security/totp/enrollment/confirm";
const ENTRY_ENROLL = "/api/portal/entry/enroll";
const SESSION = "/api/portal/session";
const ALL_ROUTES = [SECOND_FACTOR, ENROLLMENT, ENROLLMENT_CONFIRM, ENTRY_ENROLL, SESSION];

const trustedLoopbackResolver = (req) => resolveClientIp(req, {
  trustedProxyCidrs: ["127.0.0.1/32", "::1"]
});

function rejectingAuth(calls = []) {
  const fail = (method) => (input) => {
    calls.push({ method, input });
    throw Object.assign(new Error("synthetic rejection"), { code: "invalid_login" });
  };
  return {
    completeSecondFactor: fail("completeSecondFactor"),
    startTotpEnrollment: fail("startTotpEnrollment"),
    confirmTotpEnrollment: fail("confirmTotpEnrollment"),
    enrollTotpCredential: fail("enrollTotpCredential"),
    verifyTotpAndCreateSession: fail("verifyTotpAndCreateSession"),
    requireSession: () => ({ sessionRef: "synthetic-session", accountId: "acct_synthetic" })
  };
}

function stubBrowserSessions() {
  return {
    middleware: (_req, _res, next) => next(),
    session: () => null,
    completeLogin: (_req, _res, session) => session
  };
}

async function serve(t, { resolver, auth = rejectingAuth(), expressTrustProxy = false } = {}) {
  const app = express();
  app.set("trust proxy", expressTrustProxy);
  app.use(express.json());
  app.use(userPortalRoutes({ platform: {
    userPortalAuth: auth
  } }, {
    ...(resolver ? { resolveClientIpFn: resolver } : {}),
    browserSessions: stubBrowserSessions()
  }));
  const { server, baseUrl } = await listen(app);
  t.after(() => { server.closeAllConnections(); server.close(); });
  return async (path, forwardedFor) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(forwardedFor === undefined ? {} : { "X-Forwarded-For": forwardedFor })
      },
      body: "{}"
    });
    return { status: response.status, body: await response.json(), headers: response.headers };
  };
}

for (const route of ALL_ROUTES) {
  test(`${route} gives trusted clients distinct unchanged ten-per-minute buckets`, async (t) => {
    const calls = [];
    const post = await serve(t, { resolver: trustedLoopbackResolver, auth: rejectingAuth(calls) });
    for (let attempt = 0; attempt < 10; attempt += 1) {
      assert.equal((await post(route, "198.51.100.10")).status, 401);
    }
    const limited = await post(route, "198.51.100.10");
    assert.equal(limited.status, 429);
    assert.deepEqual(limited.body, { error: "Too Many Requests" });
    assert.ok(Number(limited.headers.get("retry-after")) > 0);
    assert.ok(Number(limited.headers.get("retry-after")) <= 60);
    assert.equal((await post(route, "198.51.100.11")).status, 401);
    assert.equal(calls.length, 11);
  });
}

test("untrusted XFF cannot bypass the limiter even if Express trust proxy is permissive", async (t) => {
  const calls = [];
  const post = await serve(t, { auth: rejectingAuth(calls), expressTrustProxy: true });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    assert.equal((await post(SESSION, `198.51.100.${attempt + 1}`)).status, 401);
  }
  assert.equal((await post(SESSION, "203.0.113.80")).status, 429);
  assert.equal(calls.length, 10);
});

test("IPv6 addresses within one /56 share a bucket but another /56 does not", async (t) => {
  const post = await serve(t, { resolver: trustedLoopbackResolver });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    assert.equal((await post(SESSION, `2001:db8:1234:${attempt.toString(16)}::1`)).status, 401);
  }
  assert.equal((await post(SESSION, "2001:db8:1234:ff::99")).status, 429);
  assert.equal((await post(SESSION, "2001:db8:1234:100::1")).status, 401);
});

test("IPv4-mapped IPv6 and IPv4 share one source bucket", async (t) => {
  const post = await serve(t, { resolver: trustedLoopbackResolver });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    assert.equal((await post(SESSION, "198.51.100.10")).status, 401);
  }
  for (const spelling of ["::ffff:198.51.100.10", "::ffff:c633:640a", "::FfFf:C633:640A", "0000:0000:0000:0000:0000:ffff:c633:640a"]) {
    assert.equal((await post(SESSION, spelling)).status, 429);
  }
  assert.equal((await post(SESSION, "::ffff:c633:640b")).status, 401);
});

test("all five portal authorization routes have independent ten-attempt buckets", async (t) => {
  const calls = [];
  const post = await serve(t, { resolver: trustedLoopbackResolver, auth: rejectingAuth(calls) });
  for (const route of ALL_ROUTES) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      assert.equal((await post(route, "198.51.100.10")).status, 401);
    }
    assert.equal((await post(route, "198.51.100.10")).status, 429);
  }
  assert.equal(calls.length, ALL_ROUTES.length * 10);
});

test("unknown, malformed and throwing resolvers fail closed before every auth mutation", async (t) => {
  for (const resolver of [() => "", () => null, () => "not-an-ip", () => "198.51.100.1:80", () => { throw new Error("synthetic resolver failure"); }]) {
    const calls = [];
    const post = await serve(t, { resolver, auth: rejectingAuth(calls) });
    for (const route of ALL_ROUTES) {
      const result = await post(route);
      assert.equal(result.status, 403);
      assert.deepEqual(result.body, { error: "forbidden" });
    }
    assert.equal(calls.length, 0);
  }
});

test("a trusted proxy's malformed forwarded chain fails closed", async (t) => {
  const calls = [];
  const post = await serve(t, { resolver: trustedLoopbackResolver, auth: rejectingAuth(calls) });
  const response = await post(SESSION, "not-an-ip, 198.51.100.10");
  assert.equal(response.status, 403);
  assert.equal(calls.length, 0);
});
