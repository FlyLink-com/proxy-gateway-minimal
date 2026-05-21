import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../app.mjs";
import { listen } from "./helpers/listen.mjs";

test("ping route blocks hosts outside configured allowlist", async () => {
  const state = {
    rootDir: new URL("../../", import.meta.url).pathname,
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: "secret",
    proxyConfig: { servers: [{ host: "203.0.113.10" }], pingHosts: [], nginx: { host: "203.0.113.11", ports: [443] } },
    services: {
      ssLocal: { status: () => ({ running: false }), start: async () => ({ ok: true }), stop: async () => ({ ok: true }) },
      httpProxy: { status: () => ({ running: false }), start: async () => ({ ok: true }), stop: async () => ({ ok: true }) }
    },
    isPortListening: async () => false,
    runCommand: async () => ({ ok: true, stdout: "", stderr: "", code: 0, timedOut: false })
  };

  const { server, baseUrl } = await listen(createApp(state));
  try {
    const response = await fetch(`${baseUrl}/api/ping/example.com?token=secret`);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "Host not allowed" });
  } finally {
    server.close();
  }
});
