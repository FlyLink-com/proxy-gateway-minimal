import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { adminAuthRoutes } from "../routes/admin-auth.mjs";
import { resolveClientIp } from "../services/ip-address.mjs";
import { listen } from "./helpers/listen.mjs";

const LOGIN = "/api/admin-auth/login";
const VERIFY = "/api/admin-auth/totp/verify";
const BOOTSTRAP = "/api/admin-auth/bootstrap/start";
const ENROLLMENT = "/api/admin-auth/totp/enrollment/confirm";
const trustedLoopbackResolver = (req) => resolveClientIp(req, {
  trustedProxyCidrs: ["127.0.0.1/32", "::1"]
});

function rejectingAuth(calls = []) {
  const fail = (method, code) => (input) => {
    calls.push({ method, input });
    throw Object.assign(new Error("synthetic rejection"), { code });
  };
  return {
    login: fail("login", "invalid_admin_login"),
    verifyTotp: fail("verifyTotp", "invalid_totp"),
    startBootstrap: fail("startBootstrap", "invalid_admin_login"),
    confirmTotpEnrollment: fail("confirmTotpEnrollment", "invalid_totp")
  };
}

async function serve(t, { resolver, auth = rejectingAuth(), publicLogin = false, expressTrustProxy = false } = {}) {
  const app = express();
  app.set("trust proxy", expressTrustProxy);
  app.use(express.json());
  app.use(adminAuthRoutes({ platform: {
    adminAuth: auth,
    adminPublicLoginEnabled: publicLogin
  } }, resolver ? { resolveClientIpFn: resolver } : {}));
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

for (const route of [LOGIN, VERIFY]) {
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
    assert.equal((await post(LOGIN, `198.51.100.${attempt + 1}`)).status, 401);
  }
  assert.equal((await post(LOGIN, "203.0.113.80")).status, 429);
  assert.equal(calls.length, 10);
});

test("trusted proxy chain ignores forged leftmost XFF claims", async (t) => {
  const post = await serve(t, { resolver: trustedLoopbackResolver });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    assert.equal((await post(LOGIN, `203.0.113.${attempt + 1}, 198.51.100.10`)).status, 401);
  }
  assert.equal((await post(LOGIN, "203.0.113.99, 198.51.100.10")).status, 429);
  assert.equal((await post(LOGIN, "203.0.113.99, 198.51.100.11")).status, 401);
});

test("IPv6 addresses within one /56 share a bucket but another /56 does not", async (t) => {
  const post = await serve(t, { resolver: trustedLoopbackResolver });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    assert.equal((await post(LOGIN, `2001:db8:1234:${attempt.toString(16)}::1`)).status, 401);
  }
  assert.equal((await post(LOGIN, "2001:db8:1234:ff::99")).status, 429);
  assert.equal((await post(LOGIN, "2001:db8:1234:100::1")).status, 401);
});

test("IPv4-mapped IPv6 and IPv4 share one source bucket", async (t) => {
  const post = await serve(t, { resolver: trustedLoopbackResolver });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    assert.equal((await post(LOGIN, "198.51.100.10")).status, 401);
  }
  for (const spelling of ["::ffff:198.51.100.10", "::ffff:c633:640a", "::FfFf:C633:640A", "0000:0000:0000:0000:0000:ffff:c633:640a"]) {
    assert.equal((await post(LOGIN, spelling)).status, 429);
  }
  assert.equal((await post(LOGIN, "::ffff:c633:640b")).status, 401);
});

test("login and TOTP have independent ten-attempt buckets", async (t) => {
  const post = await serve(t, { resolver: trustedLoopbackResolver });
  for (const route of [LOGIN, VERIFY]) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      assert.equal((await post(route, "198.51.100.10")).status, 401);
    }
    assert.equal((await post(route, "198.51.100.10")).status, 429);
  }
});

test("unknown, malformed and throwing resolvers fail closed before every auth mutation", async (t) => {
  for (const resolver of [() => "", () => null, () => "not-an-ip", () => "198.51.100.1:80", () => { throw new Error("synthetic resolver failure"); }]) {
    const calls = [];
    const post = await serve(t, { resolver, auth: rejectingAuth(calls) });
    for (const route of [LOGIN, VERIFY, BOOTSTRAP, ENROLLMENT]) {
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
  const response = await post(LOGIN, "not-an-ip, 198.51.100.10");
  assert.equal(response.status, 403);
  assert.equal(calls.length, 0);
});

for (const route of [BOOTSTRAP, ENROLLMENT]) {
  test(`${route} limits private setup attempts without sharing other source buckets`, async (t) => {
    const calls = [];
    const post = await serve(t, { resolver: trustedLoopbackResolver, auth: rejectingAuth(calls) });
    for (let attempt = 0; attempt < 10; attempt += 1) {
      assert.equal((await post(route, "198.51.100.10")).status, 401);
    }
    assert.equal((await post(route, "198.51.100.10")).status, 429);
    assert.equal((await post(route, "198.51.100.11")).status, 401);
    assert.equal(calls.length, 11);
  });
}

test("public mode always returns 404 for setup without invoking auth or the resolver", async (t) => {
  const calls = [];
  let resolverCalls = 0;
  const post = await serve(t, {
    publicLogin: true,
    auth: rejectingAuth(calls),
    resolver: () => { resolverCalls += 1; return ""; }
  });
  for (const route of [BOOTSTRAP, ENROLLMENT]) {
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await post(route);
      assert.equal(response.status, 404);
      assert.deepEqual(response.body, { error: "not_found" });
    }
  }
  assert.equal(calls.length, 0);
  assert.equal(resolverCalls, 0);
});

test("TOTP audit references use the same trusted resolver as rate limiting", async (t) => {
  const calls = [];
  const post = await serve(t, { resolver: trustedLoopbackResolver, auth: rejectingAuth(calls) });
  for (const route of [VERIFY, ENROLLMENT]) {
    assert.equal((await post(route, "203.0.113.99, 198.51.100.10")).status, 401);
  }
  assert.equal(calls.length, 2);
  for (const call of calls) assert.equal(call.input.sourceIpSafeRef, "ip:198.51.100.10");
});

test("public anonymous session discloses only unauthenticated portal-account mode", async (t) => {
  const app = express();
  app.use(adminAuthRoutes({ platform: {
    adminPublicLoginEnabled: true,
    adminAuth: { sessionStatus: () => ({ authenticated: false, mode: "bootstrap", setupRequired: true, operatorRef: "synthetic-operator" }) }
  } }));
  const { server, baseUrl } = await listen(app);
  t.after(() => { server.closeAllConnections(); server.close(); });
  const response = await fetch(`${baseUrl}/api/admin-auth/session`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { authenticated: false, mode: "portalAccount" });
});
