import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeState } from "../state.mjs";

test("createRuntimeState exposes expected ports and services", () => {
  const state = createRuntimeState({
    rootDir: new URL("../../", import.meta.url),
    env: { CONSOLE_TOKEN: "secret", SS_PASSWORD: "pw" },
    autoStartHttpProxy: false
  });

  assert.equal(state.host, "127.0.0.1");
  assert.equal(state.ports.console, 4077);
  assert.equal(state.ports.socks, 1080);
  assert.equal(state.ports.httpProxy, 18180);
  assert.equal(typeof state.services.ssLocal.start, "function");
  assert.equal(typeof state.services.httpProxy.start, "function");
  assert.equal(typeof state.proxyConfig, "object");
  assert.equal(state.consoleToken, "secret");
});
