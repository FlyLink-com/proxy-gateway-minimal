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
    proxyConfig: { servers: [], pingHosts: [], nginx: {} },
    services: {
      ssLocal: { status: () => ({ running: false }) },
      httpProxy: { status: () => ({ running: false }) }
    },
    subscriptions: {
      service: {
        listTenants: () => [{ id: "tenant_1" }]
      }
    },
    security: {
      adminAllowedCidrs: ["127.0.0.1/32", "10.0.0.0/8"],
      subRateLimit: { windowMs: 60000, max: 30 }
    },
    isPortListening: async () => false,
    runCommand: async () => ({ ok: true, stdout: "", stderr: "", code: 0, timedOut: false })
  };
}

test("admin allowlist blocks public source IP before service handlers run", async () => {
  const app = createApp(state(), { clientIpResolver: () => "203.0.113.10" });
  const { server, baseUrl } = await listen(app);
  try {
    const response = await fetch(`${baseUrl}/api/admin/subscriptions?token=secret`);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "Forbidden" });
  } finally {
    server.close();
  }
});

test("admin allowlist permits configured private source IP and console auth still applies", async () => {
  const app = createApp(state(), { clientIpResolver: () => "10.0.0.8" });
  const { server, baseUrl } = await listen(app);
  try {
    const unauthorized = await fetch(`${baseUrl}/api/admin/subscriptions`);
    assert.equal(unauthorized.status, 401);

    const response = await fetch(`${baseUrl}/api/admin/subscriptions?token=secret`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { items: [{ id: "tenant_1" }] });
  } finally {
    server.close();
  }
});
