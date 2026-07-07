import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../app.mjs";
import { createPortalHumanChallengeService } from "../services/platform/portal-human-challenge.mjs";
import { listen } from "./helpers/listen.mjs";

function state(overrides = {}) {
  const base = {
    rootDir: new URL("../../", import.meta.url).pathname,
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: "secret",
    proxyConfig: {
      servers: [
        {
          name: "aws-singapore",
          host: "203.0.113.10",
          port: 18388,
          method: "aes-256-gcm",
          password: "shared-secret"
        }
      ],
      pingHosts: [],
      nginx: {}
    },
    services: {
      ssLocal: { status: () => ({ running: false }) },
      httpProxy: { status: () => ({ running: false }) }
    },
    subscriptions: {
      service: {
        resolveSubscriptionToken: () => ({ ok: false, status: 401, error: "Unauthorized" })
      }
    },
    security: {
      adminAllowedCidrs: ["127.0.0.1/32"],
      subRateLimit: { windowMs: 1000, max: 2 }
    },
    isPortListening: async () => false,
    runCommand: async () => ({ ok: true, stdout: "", stderr: "", code: 0, timedOut: false })
  };
  return {
    ...base,
    ...overrides,
    security: {
      ...base.security,
      ...(overrides.security || {})
    },
    platform: {
      ...(base.platform || {}),
      ...(overrides.platform || {})
    }
  };
}

function leadSubmission(email = "ops@example.com") {
  return {
    organization: "GCC Pilot Team",
    email,
    direction: "GCC WebOS access inquiry",
    stage: "Monthly Basic",
    message: "Need secure multi-device access."
  };
}

function createHumanChallengeService() {
  let index = 0;
  return createPortalHumanChallengeService({
    nowFn: () => "2026-06-30T00:00:00.000Z",
    challengeRefFactory: () => `rate_limit_phc_${++index}`,
    challengeFactory: () => ({ prompt: "2 + 7 = ?", answer: "9" })
  });
}

async function postJson(url, payload) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

test("/sub rate limit returns 429 with Retry-After", async () => {
  let now = 1000;
  const app = createApp(state(), {
    clientIpResolver: () => "198.51.100.10",
    rateLimitNowFn: () => now
  });
  const { server, baseUrl } = await listen(app);
  try {
    const first = await fetch(`${baseUrl}/sub/clash.yaml?token=bad`);
    assert.equal(first.status, 401);
    const second = await fetch(`${baseUrl}/sub/clash.yaml?token=bad`);
    assert.equal(second.status, 401);

    const limited = await fetch(`${baseUrl}/sub/clash.yaml?token=bad`);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "1");
    assert.deepEqual(await limited.json(), { error: "Too Many Requests" });

    now = 2101;
    const afterWindow = await fetch(`${baseUrl}/sub/clash.yaml?token=bad`);
    assert.equal(afterWindow.status, 401);
  } finally {
    server.close();
  }
});

test("/sub rate limit keys by resolved client IP", async () => {
  let ip = "198.51.100.10";
  const app = createApp(state(), {
    clientIpResolver: () => ip,
    rateLimitNowFn: () => 1000
  });
  const { server, baseUrl } = await listen(app);
  try {
    assert.equal((await fetch(`${baseUrl}/sub/clash.yaml?token=bad`)).status, 401);
    assert.equal((await fetch(`${baseUrl}/sub/clash.yaml?token=bad`)).status, 401);
    assert.equal((await fetch(`${baseUrl}/sub/clash.yaml?token=bad`)).status, 429);

    ip = "198.51.100.11";
    assert.equal((await fetch(`${baseUrl}/sub/clash.yaml?token=bad`)).status, 401);
  } finally {
    server.close();
  }
});

test("public lead intake is rate-limited by client IP", async () => {
  let now = 1000;
  const app = createApp(state({
    security: {
      publicLeadRateLimit: { windowMs: 1000, max: 1 },
      publicLeadIdentityRateLimit: { windowMs: 1000, max: 99 }
    }
  }), {
    clientIpResolver: () => "198.51.100.20",
    rateLimitNowFn: () => now
  });
  const { server, baseUrl } = await listen(app);
  try {
    const first = await postJson(`${baseUrl}/api/public/leads`, leadSubmission("one@example.com"));
    assert.equal(first.status, 202);

    const limited = await postJson(`${baseUrl}/api/public/leads`, leadSubmission("two@example.com"));
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "1");
    assert.deepEqual(await limited.json(), { error: "Too Many Requests" });

    now = 2101;
    const afterWindow = await postJson(`${baseUrl}/api/public/leads`, leadSubmission("three@example.com"));
    assert.equal(afterWindow.status, 202);
  } finally {
    server.close();
  }
});

test("public lead intake is rate-limited by submitted identity across IPs", async () => {
  let ip = "198.51.100.21";
  const app = createApp(state({
    security: {
      publicLeadRateLimit: { windowMs: 1000, max: 99 },
      publicLeadIdentityRateLimit: { windowMs: 1000, max: 1 }
    }
  }), {
    clientIpResolver: () => ip,
    rateLimitNowFn: () => 1000
  });
  const { server, baseUrl } = await listen(app);
  try {
    const first = await postJson(`${baseUrl}/api/public/leads`, leadSubmission("same@example.com"));
    assert.equal(first.status, 202);

    ip = "198.51.100.22";
    const limited = await postJson(`${baseUrl}/api/public/leads`, leadSubmission("same@example.com"));
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "1");

    const differentIdentity = await postJson(`${baseUrl}/api/public/leads`, leadSubmission("other@example.com"));
    assert.equal(differentIdentity.status, 202);
  } finally {
    server.close();
  }
});

test("portal human challenge issuance is rate-limited before generating new prompts", async () => {
  let now = 1000;
  const app = createApp(state({
    platform: {
      userPortalAuth: {},
      portalHumanChallenges: createHumanChallengeService(),
      userPortalRoutesEnabled: true
    },
    security: {
      portalChallengeRateLimit: { windowMs: 1000, max: 1 }
    }
  }), {
    clientIpResolver: () => "198.51.100.23",
    rateLimitNowFn: () => now
  });
  const { server, baseUrl } = await listen(app);
  try {
    const first = await postJson(`${baseUrl}/api/portal/human-challenges`, { scope: "portal_login" });
    assert.equal(first.status, 201);

    const limited = await postJson(`${baseUrl}/api/portal/human-challenges`, { scope: "portal_login" });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "1");
    assert.deepEqual(await limited.json(), { error: "Too Many Requests" });

    now = 2101;
    const afterWindow = await postJson(`${baseUrl}/api/portal/human-challenges`, { scope: "portal_login" });
    assert.equal(afterWindow.status, 201);
  } finally {
    server.close();
  }
});

test("portal registration email verification send is rate-limited by client IP", async () => {
  let now = 1000;
  const app = createApp(state({
    platform: {
      userPortalAuth: {},
      userPortalRoutesEnabled: true
    },
    security: {
      portalRegistrationEmailRateLimit: { windowMs: 1000, max: 1 },
      portalRegistrationEmailIdentityRateLimit: { windowMs: 1000, max: 99 },
      portalRegistrationRateLimit: { windowMs: 1000, max: 99 },
      portalRegistrationIdentityRateLimit: { windowMs: 1000, max: 99 }
    }
  }), {
    clientIpResolver: () => "198.51.100.24",
    rateLimitNowFn: () => now
  });
  const { server, baseUrl } = await listen(app);
  try {
    const first = await postJson(`${baseUrl}/api/portal/registration/email-verification`, {
      email: "one@example.test"
    });
    assert.notEqual(first.status, 429);

    const limited = await postJson(`${baseUrl}/api/portal/registration/email-verification`, {
      email: "two@example.test"
    });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "1");
    assert.deepEqual(await limited.json(), { error: "Too Many Requests" });

    now = 2101;
    const afterWindow = await postJson(`${baseUrl}/api/portal/registration/email-verification`, {
      email: "three@example.test"
    });
    assert.notEqual(afterWindow.status, 429);
  } finally {
    server.close();
  }
});

test("portal registration email verification send is rate-limited by submitted email across IPs", async () => {
  let ip = "198.51.100.25";
  const app = createApp(state({
    platform: {
      userPortalAuth: {},
      userPortalRoutesEnabled: true
    },
    security: {
      portalRegistrationEmailRateLimit: { windowMs: 1000, max: 99 },
      portalRegistrationEmailIdentityRateLimit: { windowMs: 1000, max: 1 },
      portalRegistrationRateLimit: { windowMs: 1000, max: 99 },
      portalRegistrationIdentityRateLimit: { windowMs: 1000, max: 99 }
    }
  }), {
    clientIpResolver: () => ip,
    rateLimitNowFn: () => 1000
  });
  const { server, baseUrl } = await listen(app);
  try {
    const first = await postJson(`${baseUrl}/api/portal/registration/email-verification`, {
      email: "same@example.test"
    });
    assert.notEqual(first.status, 429);

    ip = "198.51.100.26";
    const limited = await postJson(`${baseUrl}/api/portal/registration/email-verification`, {
      email: "same@example.test"
    });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "1");

    const differentIdentity = await postJson(`${baseUrl}/api/portal/registration/email-verification`, {
      email: "other@example.test"
    });
    assert.notEqual(differentIdentity.status, 429);
  } finally {
    server.close();
  }
});
