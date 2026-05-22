import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createDaemonLauncher } from "../services/daemon-launcher.mjs";

test("daemon launcher provides a token to the child process without logging it", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "proxy-gateway-daemon-"));
  const calls = [];
  const logs = [];

  try {
    const launcher = createDaemonLauncher({
      rootDir,
      nodePath: "node.exe",
      env: {},
      spawnFn: (command, args, options) => {
        calls.push({ command, args, options });
        return { pid: 1234, unref() {} };
      },
      log: (...parts) => logs.push(parts.join(" "))
    });

    const result = launcher.start();

    assert.equal(result.pid, 1234);
    assert.equal(calls[0].command, "node.exe");
    assert.equal(calls[0].options.detached, true);
    assert.equal(calls[0].options.env.CONSOLE_TOKEN, result.token);
    assert.match(result.token, /^[0-9a-f-]{36}$/i);
    assert.doesNotMatch(logs.join("\n"), new RegExp(result.token));
    assert.doesNotMatch(logs.join("\n"), /Console Token:/);
    assert.match(logs.join("\n"), /Token stored in:/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("daemon launcher reuses persisted generated token across starts", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "proxy-gateway-daemon-"));
  const tokenStorePath = join(rootDir, ".proxy-gateway", "console-token");
  const calls = [];

  try {
    let generated = 0;
    const launcher = createDaemonLauncher({
      rootDir,
      nodePath: "node.exe",
      env: {},
      tokenFactory: () => `daemon-token-${++generated}`,
      spawnFn: (command, args, options) => {
        calls.push({ command, args, options });
        return { pid: 1234 + calls.length, unref() {} };
      },
      log: () => {}
    });

    const first = launcher.start();
    const second = launcher.start();

    assert.equal(first.token, "daemon-token-1");
    assert.equal(second.token, "daemon-token-1");
    assert.equal(generated, 1);
    assert.equal(calls[1].options.env.CONSOLE_TOKEN, "daemon-token-1");
    assert.equal(readFileSync(tokenStorePath, "utf8"), "daemon-token-1\n");
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
