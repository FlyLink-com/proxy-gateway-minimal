import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../app.mjs";
import { listen } from "./helpers/listen.mjs";

function fakeState(runCommand) {
  return {
    rootDir: fileURLToPath(new URL("../../", import.meta.url)),
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
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

function rootDir() {
  return fileURLToPath(new URL("../../", import.meta.url));
}

test("network status route parses Windows doctor JSON", async () => {
  const payload = {
    ok: false,
    action: "status",
    summary: {
      consoleListening: true,
      socksListening: false,
      httpProxyListening: true,
      systemProxyTargetOk: true,
      envProxyTargetOk: false,
      clashPotentialConflict: true
    },
    issues: [
      { code: "socks-port-down", severity: "error", message: "SOCKS5 port 1080 is not listening" }
    ]
  };
  const state = fakeState(async (name) => {
    assert.equal(name, "network-status");
    return { ok: true, stdout: JSON.stringify(payload), stderr: "", code: 0, timedOut: false };
  });
  const { server, baseUrl } = await listen(createApp(state));
  try {
    const response = await fetch(`${baseUrl}/api/network/status`, {
      headers: { authorization: "Bearer secret" }
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), payload);
  } finally {
    server.close();
  }
});

test("network repair route returns repair actions from Windows doctor", async () => {
  const payload = {
    ok: true,
    action: "repair",
    actions: ["start-daemon", "apply-system-proxy", "apply-env-proxy"],
    issues: []
  };
  const state = fakeState(async (name) => {
    assert.equal(name, "network-repair");
    return { ok: true, stdout: JSON.stringify(payload), stderr: "", code: 0, timedOut: false };
  });
  const { server, baseUrl } = await listen(createApp(state));
  try {
    const response = await fetch(`${baseUrl}/api/network/repair`, {
      method: "POST",
      headers: { authorization: "Bearer secret" }
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), payload);
  } finally {
    server.close();
  }
});

test("Windows network doctor script covers expected proxy layers", () => {
  const scriptPath = join(rootDir(), "scripts", "network-doctor.ps1");
  assert.equal(existsSync(scriptPath), true);
  const script = readFileSync(scriptPath, "utf8");

  assert.match(script, /Get-NetTCPConnection|netstat/);
  assert.match(script, /InternetSetOption/);
  assert.match(script, /WM_SETTINGCHANGE/);
  assert.match(script, /netsh winhttp show proxy/);
  assert.match(script, /Clash|mihomo/i);
  assert.match(script, /3456/);
  assert.match(script, /1080/);
  assert.match(script, /18180/);
});

test("Windows network doctor does not recreate the Internet Settings key during repair", () => {
  const scriptPath = join(rootDir(), "scripts", "network-doctor.ps1");
  const script = readFileSync(scriptPath, "utf8");

  assert.match(script, /function Ensure-InternetSettingsKey/);
  assert.doesNotMatch(script, /New-Item\s+-Path\s+\$RegPath\s+-Force/);
});

test("legacy proxy script notifies Windows proxy and environment subscribers", () => {
  const scriptPath = join(rootDir(), "scripts", "proxy.ps1");
  const script = readFileSync(scriptPath, "utf8");

  assert.match(script, /InternetSetOption/);
  assert.match(script, /WM_SETTINGCHANGE/);
  assert.match(script, /Environment/);
});
