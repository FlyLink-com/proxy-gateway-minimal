import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { createApp } from "../app.mjs";

function listen(app) {
  return new Promise((resolve) => {
    const server = createServer(app);
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

function fakeState(runCommand) {
  return {
    rootDir: new URL("../../", import.meta.url).pathname,
    host: "127.0.0.1",
    ports: { console: 4077, socks: 1080, httpProxy: 18180 },
    consoleToken: "secret",
    proxyConfig: { servers: [], pingHosts: [], nginx: { host: "127.0.0.1", ports: [] } },
    services: {
      ssLocal: { status: () => ({ running: false }), start: async () => ({ ok: true }), stop: async () => ({ ok: true }) },
      httpProxy: { status: () => ({ running: false }), start: async () => ({ ok: true }), stop: async () => ({ ok: true }) }
    },
    isPortListening: async () => false,
    runCommand
  };
}

test("system proxy route preserves legacy output field", async () => {
  const state = fakeState(async () => ({ ok: true, stdout: "[ON] Proxy: 127.0.0.1:18180", stderr: "", code: 0, timedOut: false }));
  const { server, baseUrl } = await listen(createApp(state));
  try {
    const response = await fetch(`${baseUrl}/api/system-proxy/status?token=secret`, { method: "POST" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, output: "[ON] Proxy: 127.0.0.1:18180" });
  } finally {
    server.close();
  }
});

test("environment proxy status returns enabled flag and vars for legacy UI", async () => {
  const state = fakeState(async () => ({
    ok: true,
    stdout: "HTTP_PROXY=http://127.0.0.1:18180\nHTTPS_PROXY=http://127.0.0.1:18180\nALL_PROXY=socks5://127.0.0.1:1080",
    stderr: "",
    code: 0,
    timedOut: false
  }));
  const { server, baseUrl } = await listen(createApp(state));
  try {
    const response = await fetch(`${baseUrl}/api/env-proxy/status?token=secret`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      enabled: true,
      vars: {
        HTTP_PROXY: "http://127.0.0.1:18180",
        HTTPS_PROXY: "http://127.0.0.1:18180",
        ALL_PROXY: "socks5://127.0.0.1:1080"
      }
    });
  } finally {
    server.close();
  }
});

