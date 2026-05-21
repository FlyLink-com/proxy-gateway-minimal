import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createRuntimeState } from "../state.mjs";

test("createRuntimeState exposes expected ports and services", () => {
  const state = createRuntimeState({
    rootDir: new URL("../../", import.meta.url),
    env: { CONSOLE_TOKEN: "secret", SS_PASSWORD: "pw" },
    autoStartHttpProxy: false
  });

  assert.equal(state.host, "127.0.0.1");
  assert.equal(state.ports.console, 3456);
  assert.equal(state.ports.socks, 1080);
  assert.equal(state.ports.httpProxy, 18180);
  assert.equal(typeof state.services.ssLocal.start, "function");
  assert.equal(typeof state.services.httpProxy.start, "function");
  assert.equal(typeof state.proxyConfig, "object");
  assert.equal(state.consoleToken, "secret");
});

test("createRuntimeState reuses a generated console token across restarts", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-gateway-token-"));
  const tokenStorePath = join(dir, "console-token");

  try {
    let generated = 0;
    const options = {
      rootDir: new URL("../../", import.meta.url),
      env: { SS_PASSWORD: "pw" },
      autoStartHttpProxy: false,
      consoleTokenStorePath: tokenStorePath,
      tokenFactory: () => `generated-token-${++generated}`
    };

    const first = createRuntimeState(options);
    const second = createRuntimeState(options);

    assert.equal(first.consoleToken, "generated-token-1");
    assert.equal(second.consoleToken, "generated-token-1");
    assert.equal(generated, 1);
    assert.equal(readFileSync(tokenStorePath, "utf8"), "generated-token-1\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
