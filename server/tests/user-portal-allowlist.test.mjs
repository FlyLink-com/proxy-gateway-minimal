import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../app.mjs";
import { listen } from "./helpers/listen.mjs";

function portalState(overrides = {}) {
  return {
    rootDir: new URL("../../", import.meta.url).pathname,
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: "secret",
    proxyConfig: { servers: [], pingHosts: [], nginx: {} },
    services: {
      ssLocal: { status: () => ({ running: false }) },
      httpProxy: { status: () => ({ running: false }) }
    },
    subscriptions: {},
    platform: {
      userPortalRoutesEnabled: true,
      userPortalAuth: {},
      portalHumanChallenges: {
        issueChallenge: () => ({
          challenge: {
            challengeRef: "challenge_safe_ref",
            prompt: "1 + 1",
            scope: "portal_login",
            expiresAt: "2026-06-30T00:05:00.000Z"
          }
        })
      }
    },
    security: {
      userPortalAllowedCidrs: [],
      subRateLimit: { windowMs: 60000, max: 30 },
      ...overrides.security
    },
    isPortListening: async () => false,
    runCommand: async () => ({ ok: true, stdout: "", stderr: "", code: 0, timedOut: false })
  };
}

async function postHumanChallenge(baseUrl, headers = {}) {
  return fetch(`${baseUrl}/api/portal/human-challenges`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers
    },
    body: JSON.stringify({ scope: "portal_login" })
  });
}

test("portal allowlist blocks unapproved source IP before public portal handlers run", async () => {
  const app = createApp(portalState({
    security: { userPortalAllowedCidrs: ["198.51.100.4/32"] }
  }), { clientIpResolver: () => "203.0.113.10" });
  const { server, baseUrl } = await listen(app);
  try {
    const response = await postHumanChallenge(baseUrl);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "Forbidden" });
  } finally {
    server.close();
  }
});

test("portal allowlist permits configured source IP without console auth", async () => {
  const app = createApp(portalState({
    security: { userPortalAllowedCidrs: ["198.51.100.4/32"] }
  }), { clientIpResolver: () => "198.51.100.4" });
  const { server, baseUrl } = await listen(app);
  try {
    const response = await postHumanChallenge(baseUrl);
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.challenge.challengeRef, "challenge_safe_ref");
  } finally {
    server.close();
  }
});

test("portal allowlist ignores spoofed forwarded IP unless proxy is trusted", async () => {
  const app = createApp(portalState({
    security: { userPortalAllowedCidrs: ["127.0.0.1/32"] }
  }));
  const { server, baseUrl } = await listen(app);
  try {
    const response = await postHumanChallenge(baseUrl, {
      "x-forwarded-for": "203.0.113.10"
    });
    assert.equal(response.status, 201);
  } finally {
    server.close();
  }
});

test("portal allowlist uses forwarded IP only for configured trusted proxies", async () => {
  const app = createApp(portalState({
    security: {
      trustedProxyCidrs: ["127.0.0.1/32"],
      userPortalAllowedCidrs: ["198.51.100.4/32"]
    }
  }));
  const { server, baseUrl } = await listen(app);
  try {
    const allowed = await postHumanChallenge(baseUrl, {
      "x-forwarded-for": "198.51.100.4"
    });
    assert.equal(allowed.status, 201);

    const blocked = await postHumanChallenge(baseUrl, {
      "x-forwarded-for": "203.0.113.10"
    });
    assert.equal(blocked.status, 403);
  } finally {
    server.close();
  }
});
