import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createApp } from "../app.mjs";
import { listen } from "./helpers/listen.mjs";

const PATH = "/api/portal/access-requests/reset-link";
const ORIGIN = "https://portal.example.test";
const CONTEXT = `portalctx_${"a".repeat(64)}`;
const COOKIE = Buffer.alloc(32, 7).toString("base64url");
const BODY = Object.freeze({
  requestRef: "pareq_link_reset_route",
  idempotencyKey: "b6f2422b-bf99-4267-9c5d-f93ddcb8ab94",
  confirmed: true
});
const RESULT = Object.freeze({
  id: BODY.requestRef,
  status: "delivered",
  subscriptionUrl: "https://sub.example.test/sub/a/synthetic-new-link.yaml",
  event: { type: "subscription_link_reset", occurredAt: "2026-10-09T01:00:00.000Z" }
});

function failure(code, extra = {}) {
  return Object.assign(new Error("synthetic-private-internal-detail"), { code, ...extra });
}

async function harness(t, { service, enabled = true } = {}) {
  const calls = [];
  const authCalls = [];
  const portalAccessRequests = service ?? {
    resetSubscriptionLink(input) {
      calls.push(input);
      if (input.portalUserRef !== "acct_route_owner") throw failure("not_found");
      return RESULT;
    }
  };
  const auth = {
    requireSession(input) {
      authCalls.push(input);
      const accountId = {
        synthetic_owner_session: "acct_route_owner",
        synthetic_other_session: "acct_route_other"
      }[input.sessionRef];
      if (!accountId) throw failure("invalid_session");
      return { accountId, sessionRef: input.sessionRef };
    },
    requireBrowserSession(input) {
      if (input.cookieValue !== COOKIE || input.sessionContext !== CONTEXT) {
        throw failure("invalid_session");
      }
      return { accountId: "acct_route_owner", sessionRef: CONTEXT };
    }
  };
  const state = {
    rootDir: fileURLToPath(new URL("../../", import.meta.url)),
    consoleToken: "synthetic-route-console-token",
    proxyConfig: { servers: [], pingHosts: [], nginx: {} },
    services: {
      ssLocal: { status: () => ({ running: false }) },
      httpProxy: { status: () => ({ running: false }) }
    },
    platform: { userPortalRoutesEnabled: enabled, userPortalAuth: auth, portalAccessRequests }
  };
  const { server, baseUrl } = await listen(createApp(state, { portalBrowserOrigin: ORIGIN }));
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));

  async function request({ path = PATH, body = BODY, headers = {}, browser = false, session = "synthetic_owner_session" } = {}) {
    const requestHeaders = {
      Host: new URL(ORIGIN).host,
      "Content-Type": "application/json",
      ...(browser ? {
        Origin: ORIGIN,
        "Sec-Fetch-Site": "same-origin",
        "X-Portal-Request": "browser-v1",
        "X-Portal-Session-Context": CONTEXT,
        Cookie: `__Host-PortalSession=${COOKIE}`
      } : session ? { "X-Portal-Session": session } : {}),
      ...headers
    };
    return new Promise((resolve, reject) => {
      const req = httpRequest(`${baseUrl}${path}`, { method: "POST", headers: requestHeaders }, response => {
        const chunks = [];
        response.on("data", chunk => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let parsed;
          try { parsed = JSON.parse(text); } catch { parsed = null; }
          resolve({ status: response.statusCode, headers: new Headers(response.headers), body: parsed, text });
        });
      });
      req.on("error", reject);
      req.setTimeout(10_000, () => req.destroy(new Error("Synthetic route request timed out")));
      req.end(typeof body === "string" ? body : JSON.stringify(body));
    });
  }
  return { request, calls, authCalls };
}

function assertPrivateResponse(response) {
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.text.includes("synthetic-private-internal-detail"), false);
}

test("link reset route returns the new delivery and scopes ownership from the header session", async t => {
  const { request, calls } = await harness(t);
  const response = await request();
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { request: RESULT });
  assertPrivateResponse(response);
  assert.deepEqual(calls, [{ ...BODY, portalUserRef: "acct_route_owner" }]);

  const other = await request({ session: "synthetic_other_session" });
  assert.equal(other.status, 404);
  assert.deepEqual(other.body, { error: "not_found" });
  assertPrivateResponse(other);
  assert.equal(calls[1].portalUserRef, "acct_route_other");
});

test("link reset route accepts valid browser cookie transport without leaking session material", async t => {
  const { request, calls, authCalls } = await harness(t);
  const response = await request({ browser: true });
  assert.equal(response.status, 200);
  assertPrivateResponse(response);
  assert.deepEqual(calls, [{ ...BODY, portalUserRef: "acct_route_owner" }]);
  assert.deepEqual(authCalls, []);
  for (const marker of [COOKIE, CONTEXT, "synthetic_owner_session"]) assert.equal(response.text.includes(marker), false);
});

test("link reset requires a session, explicit confirmation and exact bounded input", async t => {
  const { request, calls } = await harness(t);
  const cases = [
    [{ session: null }, 401],
    [{ body: { ...BODY, confirmed: false } }, 400],
    [{ body: { ...BODY, confirmed: "true" } }, 400],
    [{ body: { ...BODY, confirmed: null } }, 400],
    [{ body: { requestRef: BODY.requestRef, idempotencyKey: BODY.idempotencyKey } }, 400],
    [{ body: { ...BODY, requestRef: "" } }, 400],
    [{ body: { ...BODY, requestRef: "x".repeat(129) } }, 400],
    [{ body: { ...BODY, requestRef: " request " } }, 400],
    [{ body: { ...BODY, requestRef: "bad\nrequest" } }, 400],
    [{ body: { ...BODY, requestRef: `${BODY.requestRef}\n` } }, 400],
    [{ body: { ...BODY, idempotencyKey: "short" } }, 400],
    [{ body: { ...BODY, idempotencyKey: "x".repeat(129) } }, 400],
    [{ body: { ...BODY, idempotencyKey: "key-with?unsafe=field" } }, 400],
    [{ body: { ...BODY, idempotencyKey: `${BODY.idempotencyKey}\n` } }, 400],
    [{ body: { ...BODY, portalUserRef: "acct_route_other" } }, 400],
    [{ body: { ...BODY, clientTarget: "clash" } }, 400],
    [{ body: { ...BODY, subscriptionUrl: "https://sub.example.test/forged" } }, 400],
    [{ body: { ...BODY, sessionRef: "synthetic_owner_session" } }, 400],
    [{ body: [] }, 400],
    [{ path: `${PATH}?portalUserRef=acct_route_other` }, 400],
    [{ path: `${PATH}?sessionRef=synthetic_owner_session`, session: null }, 400]
  ];
  for (const [input, status] of cases) {
    const response = await request(input);
    assert.equal(response.status, status, JSON.stringify(input));
    assertPrivateResponse(response);
    assert.deepEqual(response.body, { error: status === 401 ? "invalid_session" : "validation_error" });
  }
  assert.deepEqual(calls, []);
});

test("link reset browser CSRF and credential-conflict denials retain private headers", async t => {
  const { request, calls } = await harness(t);
  for (const headers of [
    { Origin: "https://other.example.test" },
    { "Sec-Fetch-Site": "cross-site" },
    { "X-Portal-Request": "invalid-marker" },
    { "X-Portal-Session": "synthetic_owner_session" },
    { "X-Portal-Session-Context": `portalctx_${"b".repeat(64)}` }
  ]) {
    const response = await request({ browser: true, headers });
    assert.ok([401, 403].includes(response.status));
    assertPrivateResponse(response);
    assert.deepEqual(Object.keys(response.body), ["error"]);
  }
  assert.deepEqual(calls, []);
});

test("link reset unavailable service fails closed without touching another lifecycle method", async t => {
  let unrelatedCalls = 0;
  const { request } = await harness(t, { service: { refreshSubscription() { unrelatedCalls += 1; } } });
  const response = await request();
  assert.equal(response.status, 503);
  assertPrivateResponse(response);
  assert.deepEqual(response.body, { error: "subscription_link_reset_unavailable" });
  assert.equal(unrelatedCalls, 0);
});

test("link reset exposes only allowlisted domain error codes and safe retry delay", async t => {
  let raised;
  const { request } = await harness(t, { service: { resetSubscriptionLink() { throw raised; } } });
  for (const [code, status] of [
    ["subscription_link_reset_conflict", 409],
    ["subscription_link_reset_state_changed", 409],
    ["subscription_link_reset_unavailable", 503],
    ["subscription_link_reset_reconciliation_required", 503],
    ["subscription_link_reset_rate_limited", 429],
    ["not_found", 404],
    ["validation_error", 400],
    ["unexpected_private_code", 500]
  ]) {
    raised = failure(code, { retryAfterSeconds: 60, details: "synthetic-private-internal-detail" });
    const response = await request();
    assert.equal(response.status, status, code);
    assertPrivateResponse(response);
    assert.deepEqual(response.body, { error: status === 500 ? "internal_error" : code });
    assert.equal(response.headers.get("retry-after"), status === 429 ? "60" : null);
  }
  for (const value of [undefined, 0, -1, 0.5, "60", 86401, Number.NaN, Number.POSITIVE_INFINITY]) {
    raised = failure("subscription_link_reset_rate_limited", { retryAfterSeconds: value });
    const response = await request();
    assert.equal(response.status, 429);
    assertPrivateResponse(response);
    assert.equal(response.headers.get("retry-after"), null);
  }
});

test("link reset malformed JSON is non-cacheable and does not execute a mutation", async t => {
  const { request, calls } = await harness(t);
  const response = await request({ body: '{"requestRef":' });
  assert.equal(response.status, 400);
  assertPrivateResponse(response);
  assert.deepEqual(response.body, { error: "validation_error" });
  assert.equal(response.text.includes("SyntaxError"), false);
  assert.deepEqual(calls, []);
});

test("link reset path is not opened when portal routes are disabled", async t => {
  const { request, calls } = await harness(t, { enabled: false });
  const response = await request();
  assert.equal(response.status, 401);
  assertPrivateResponse(response);
  assert.deepEqual(calls, []);
});
