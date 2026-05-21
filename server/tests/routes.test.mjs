import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../app.mjs";

function listen(app) {
  return new Promise((resolve) => {
    const server = createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

function fakeState() {
  return {
    rootDir: resolve(fileURLToPath(new URL("../../", import.meta.url))),
    host: "127.0.0.1",
    ports: { console: 4077, socks: 1080, httpProxy: 18180 },
    consoleToken: "secret",
    proxyConfig: { servers: [], pingHosts: [], nginx: { host: "127.0.0.1", ports: [] } },
    services: {
      ssLocal: {
        start: async () => ({ ok: true, msg: "ss-local starting...", pid: 111 }),
        stop: async () => ({ ok: true }),
        status: () => ({ running: true, starting: false, pid: 111 })
      },
      httpProxy: {
        start: async () => ({ ok: true, msg: "http-proxy starting..." }),
        stop: async () => ({ ok: true }),
        status: () => ({ running: true, starting: false, port: 18180, host: "127.0.0.1" })
      }
    },
    isPortListening: async (port) => port === 1080 || port === 18180
  };
}

test("static console loads without token while control routes stay protected", async () => {
  const { server, baseUrl } = await listen(createApp(fakeState()));
  try {
    const page = await fetch(`${baseUrl}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Proxy Gateway/);

    const control = await fetch(`${baseUrl}/api/status`);
    assert.equal(control.status, 401);
    assert.deepEqual(await control.json(), { error: "Unauthorized" });
  } finally {
    server.close();
  }
});

test("legacy proxy routes keep existing paths", async () => {
  const { server, baseUrl } = await listen(createApp(fakeState()));
  try {
    const start = await fetch(`${baseUrl}/api/proxy/start?token=secret`, { method: "POST" });
    assert.equal(start.status, 200);
    assert.deepEqual(await start.json(), { socks5: true, http: true, ok: true });

    const overview = await fetch(`${baseUrl}/api/proxy/overview?token=secret`);
    assert.equal(overview.status, 200);
    const body = await overview.json();
    assert.equal(body.socks5.port, 1080);
    assert.equal(body.httpProxy.port, 18180);
    assert.equal(body.ssRunning, true);
  } finally {
    server.close();
  }
});

test("/api/status returns aggregate state for new UI", async () => {
  const { server, baseUrl } = await listen(createApp(fakeState()));
  try {
    const response = await fetch(`${baseUrl}/api/status?token=secret`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.ports.socks5.ok, true);
    assert.equal(body.runtime.ssLocal.running, true);
    assert.equal(body.runtime.httpProxy.running, true);
  } finally {
    server.close();
  }
});
