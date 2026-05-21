import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createApp,
  createRuntimeState,
  generateClashSubscription,
  startProxyGateway
} from "../../index.mjs";

function fakeState() {
  return {
    rootDir: resolve(fileURLToPath(new URL("../../", import.meta.url))),
    host: "127.0.0.1",
    ports: { console: 0, socks: 1080, httpProxy: 18180 },
    consoleToken: "secret",
    proxyConfig: { servers: [], pingHosts: [], nginx: { host: "127.0.0.1", ports: [] } },
    autoStartHttpProxy: false,
    services: {
      ssLocal: { stop: async () => ({ ok: true }) },
      httpProxy: { start: async () => ({ ok: true }), stop: async () => ({ ok: true }) }
    },
    isPortListening: async () => false
  };
}

test("package root exports stable module APIs", () => {
  assert.equal(typeof createApp, "function");
  assert.equal(typeof createRuntimeState, "function");
  assert.equal(typeof generateClashSubscription, "function");
  assert.equal(typeof startProxyGateway, "function");
});

test("startProxyGateway starts and stops an embedded app", async () => {
  const handle = await startProxyGateway({
    state: fakeState(),
    logger: false
  });

  try {
    const address = handle.server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
  } finally {
    await handle.stop();
  }
});
