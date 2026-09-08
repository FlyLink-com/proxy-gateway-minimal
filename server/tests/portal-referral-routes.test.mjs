import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import http from "node:http";
import { createPortalBrowserSessionTransport } from "../services/platform/portal-browser-session-transport.mjs";
import {
  createPortalReferralRouter,
  readReferralCookie,
} from "../routes/portal-referral.mjs";
import { listen } from "./helpers/listen.mjs";
const ORIGIN = "https://portal.example.test",
  LANDING = "https://gccwebos.com/#new-user",
  CODE = "A".repeat(32),
  TOKEN = "B".repeat(32);
async function fixture(t) {
  const calls = [];
  const app = express();
  const browserAuth = {
    requireBrowserSession(input) {
      if (input.cookieValue !== "A".repeat(43))
        throw Object.assign(new Error("invalid"), { code: "invalid_session" });
      return { accountId: "browser_account" };
    },
  };
  const browserSessions = createPortalBrowserSessionTransport({
    auth: browserAuth,
    origin: ORIGIN,
  });
  app.use(browserSessions.middleware);
  app.use(
    createPortalReferralRouter({
      browserSessions,
      origin: ORIGIN,
      auth: {
        requireSession({ sessionRef }) {
          if (sessionRef !== "portal_session_test")
            throw Object.assign(new Error("private auth details"), {
              code: "invalid_session",
            });
          return { accountId: "own_account" };
        },
      },
      service: {
        capture(code) {
          calls.push(["capture", code]);
          return code === CODE ? { token: TOKEN, maxAge: 86400 } : null;
        },
        profile(id) {
          calls.push(["profile", id]);
          return { eligible: true, linkPath: null, policy: null };
        },
        createLink(id) {
          calls.push(["create", id]);
          return { eligible: true, linkPath: `/r/${CODE}` };
        },
        performance(id) {
          calls.push(["performance", id]);
          return { registrations: 0 };
        },
      },
    }),
  );
  const { server } = await listen(app);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  function request(path, { method = "GET", headers = {}, body } = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port: server.address().port,
          path,
          method,
          headers: { Host: "portal.example.test", ...headers },
        },
        (res) => {
          let text = "";
          res.setEncoding("utf8");
          res.on("data", (s) => (text += s));
          res.on("end", () =>
            resolve({ status: res.statusCode, headers: res.headers, text }),
          );
        },
      );
      req.on("error", reject);
      req.end(body);
    });
  }
  return { request, calls };
}
const SESSION = { "x-portal-session": "portal_session_test" };

test("landing keeps attribution on Portal and redirects only to the fixed company-site welcome section", async (t) => {
  const f = await fixture(t);
  const r = await f.request(`/r/${CODE}?next=https://evil.test`);
  assert.equal(r.status, 303);
  assert.equal(r.headers.location, LANDING);
  assert.equal(r.text.includes(CODE), false);
  assert.equal(r.text.includes(TOKEN), false);
  assert.match(
    r.headers["set-cookie"][0],
    /^__Host-PortalReferral=[A-Za-z0-9_-]{32}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400$/,
  );
  assert.equal(r.headers["cache-control"], "no-store");
  assert.equal(r.headers["referrer-policy"], "no-referrer");
  const invalid = await f.request("/r/invalid");
  assert.equal(invalid.status, 303);
  assert.equal(invalid.headers.location, LANDING);
  assert.equal(invalid.headers["set-cookie"], undefined);
  for (const options of [
    { method: "HEAD" },
    { headers: { Purpose: "prefetch" } },
    { headers: { "Sec-Purpose": "prefetch;prerender" } },
  ]) {
    const scanner = await f.request(`/r/${CODE}?next=https://evil.test`, options);
    assert.equal(scanner.status, 303);
    assert.equal(scanner.headers.location, LANDING);
    assert.equal(scanner.headers["set-cookie"], undefined);
    assert.equal(scanner.headers["cache-control"], "no-store");
    assert.equal(scanner.headers["referrer-policy"], "no-referrer");
  }
  const wrongHost = await f.request(`/r/${CODE}`, {
    headers: { Host: "attacker.example" },
  });
  assert.equal(wrongHost.status, 503);
  assert.equal(wrongHost.headers.location, undefined);
  assert.equal(wrongHost.headers["set-cookie"], undefined);
  assert.equal(f.calls.filter((x) => x[0] === "capture").length, 2);
});

test("profile/performance derive account from session and reject query or body tampering", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.request("/api/portal/referral/profile")).status, 401);
  assert.equal(
    (await f.request("/api/portal/referral/profile", { headers: SESSION }))
      .status,
    200,
  );
  assert.equal(
    (await f.request("/api/portal/referral/performance", { headers: SESSION }))
      .status,
    200,
  );
  assert.deepEqual(f.calls, [
    ["profile", "own_account"],
    ["performance", "own_account"],
  ]);
  for (const path of [
    "/api/portal/referral/profile?accountId=someone",
    "/api/portal/referral/performance?rewardUnits=100",
  ]) {
    assert.equal((await f.request(path, { headers: SESSION })).status, 403);
  }
  const body = await f.request("/api/portal/referral/link", {
    method: "POST",
    headers: { ...SESSION, Origin: ORIGIN, "Content-Type": "application/json" },
    body: JSON.stringify({ accountId: "someone", rewardUnits: 100 }),
  });
  assert.equal(body.status, 403);
  assert.equal(f.calls.length, 2);
});

test("link mutation requires same-origin host and Origin, denies malformed and unexpected endpoints", async (t) => {
  const f = await fixture(t);
  const post = (headers) =>
    f.request("/api/portal/referral/link", {
      method: "POST",
      headers: { ...SESSION, ...headers },
    });
  assert.equal((await post({})).status, 403);
  assert.equal((await post({ Origin: "https://evil.example" })).status, 403);
  assert.equal((await post({ Origin: new URL(LANDING).origin })).status, 403);
  assert.equal(
    (await post({ Origin: ORIGIN, Host: "evil.example" })).status,
    403,
  );
  assert.equal((await post({ Origin: ORIGIN })).status, 200);
  assert.deepEqual(f.calls, [["create", "own_account"]]);
  const malformed = await f.request("/api/portal/referral/link", {
    method: "POST",
    headers: { ...SESSION, Origin: ORIGIN, "Content-Type": "application/json" },
    body: "{broken",
  });
  assert.equal(malformed.status, 400);
  assert.equal(malformed.text.includes("SyntaxError"), false);
  assert.equal(
    (
      await f.request("/api/portal/referral/confirm", {
        method: "POST",
        headers: { ...SESSION, Origin: ORIGIN },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await f.request("/api/portal/referral/profile", {
        headers: { ...SESSION, Origin: "https://evil.example" },
      })
    ).status,
    403,
  );
});

test("ambiguous, malformed and oversized referral cookies are ignored", () => {
  const read = (cookie) => readReferralCookie({ headers: { cookie } });
  assert.equal(read(`a=1; __Host-PortalReferral=${TOKEN}`), TOKEN);
  for (const cookie of [
    `__Host-PortalReferral=${TOKEN}; __Host-PortalReferral=${CODE}`,
    `__Host-PortalReferral=${TOKEN}%00`,
    "x".repeat(9000),
    undefined,
  ])
    assert.equal(read(cookie), null);
});

test("browser credentials and context use the existing session transport, including case aliases", async (t) => {
  const f = await fixture(t);
  const headers = {
    Cookie: `__Host-PortalSession=${"A".repeat(43)}`,
    "x-portal-request": "browser-v1",
    "x-portal-session-context": `portalctx_${"b".repeat(64)}`,
    Origin: ORIGIN,
  };
  const response = await f.request("/API/PORTAL/REFERRAL/profile", { headers });
  assert.equal(response.status, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.deepEqual(f.calls, [["profile", "browser_account"]]);
  assert.equal(
    (
      await f.request("/api/portal/referral/profile", {
        headers: { ...headers, ...SESSION },
      })
    ).status,
    403,
  );
  const missing = { ...headers };
  delete missing["x-portal-session-context"];
  assert.equal(
    (await f.request("/api/portal/referral/profile", { headers: missing }))
      .status,
    401,
  );
});
