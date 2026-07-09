import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../app.mjs";
import { listen } from "./helpers/listen.mjs";

function state() {
  return {
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

test("/sub credential rate limit keys opaque artifact requests across IPs", async () => {
  let requestIndex = 0;
  const appState = state();
  appState.security.subRateLimit = { windowMs: 1000, max: 100 };
  appState.security.subCredentialRateLimit = { windowMs: 1000, max: 2 };
  const app = createApp(appState, {
    clientIpResolver: () => `198.51.100.${++requestIndex}`,
    rateLimitNowFn: () => 1000
  });
  const { server, baseUrl } = await listen(app);
  try {
    const artifact = "opaque-device-ref";
    assert.equal((await fetch(`${baseUrl}/sub/a/${artifact}/profile.yaml`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/sub/a/${artifact}/provider.yaml`)).status, 404);
    const limited = await fetch(`${baseUrl}/sub/a/${artifact}.yaml`);
    assert.equal(limited.status, 429);
    assert.deepEqual(await limited.json(), { error: "Too Many Requests" });

    assert.equal((await fetch(`${baseUrl}/sub/a/other-device-ref/profile.yaml`)).status, 404);
  } finally {
    server.close();
  }
});
