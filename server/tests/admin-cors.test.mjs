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
      adminAllowedCidrs: ["127.0.0.1/32"],
      subRateLimit: { windowMs: 60000, max: 30 }
    },
    isPortListening: async () => false,
    runCommand: async () => ({ ok: true, stdout: "", stderr: "", code: 0, timedOut: false })
  };
}

test("admin API permits loopback browser preflight before console auth", async () => {
  const app = createApp(state());
  const { server, baseUrl } = await listen(app);
  try {
    const response = await fetch(`${baseUrl}/api/admin/subscriptions`, {
      method: "OPTIONS",
      headers: {
        "Access-Control-Request-Headers": "authorization",
        "Access-Control-Request-Method": "GET",
        Origin: "http://127.0.0.1:5175"
      }
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "http://127.0.0.1:5175");
    assert.match(response.headers.get("access-control-allow-headers") || "", /authorization/i);
  } finally {
    server.close();
  }
});

test("admin API includes loopback CORS headers on authenticated responses", async () => {
  const app = createApp(state());
  const { server, baseUrl } = await listen(app);
  try {
    const response = await fetch(`${baseUrl}/api/admin/subscriptions`, {
      headers: {
        Authorization: "Bearer secret",
        Origin: "http://127.0.0.1:5175"
      }
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "http://127.0.0.1:5175");
    assert.deepEqual(await response.json(), { items: [{ id: "tenant_1" }] });
  } finally {
    server.close();
  }
});
