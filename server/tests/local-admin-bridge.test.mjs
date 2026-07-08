import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

function repoPath(path) {
  return new URL(`../../${path}`, import.meta.url);
}

function readText(path) {
  return readFileSync(repoPath(path), "utf8");
}

test("local Admin bridge scripts are tracked with the operator bundle", () => {
  for (const path of [
    "ops/local-admin-bridge/start-admin-panel-local-proxy.ps1",
    "ops/local-admin-bridge/stop-admin-panel-local-proxy.ps1",
    "ops/local-admin-bridge/admin-panel-local-proxy.mjs"
  ]) {
    assert.equal(existsSync(repoPath(path)), true, `${path} should exist`);
  }
});

test("package scripts expose the local Admin bridge entrypoints", () => {
  const packageJson = JSON.parse(readText("package.json"));

  assert.equal(
    packageJson.scripts["admin:local-proxy:start"],
    "powershell -ExecutionPolicy Bypass -File ops/local-admin-bridge/start-admin-panel-local-proxy.ps1"
  );
  assert.equal(
    packageJson.scripts["admin:local-proxy:stop"],
    "powershell -ExecutionPolicy Bypass -File ops/local-admin-bridge/stop-admin-panel-local-proxy.ps1"
  );
});

test("start script keeps PowerShell 5.1 compatible session secret generation", () => {
  const script = readText("ops/local-admin-bridge/start-admin-panel-local-proxy.ps1");

  assert.match(script, /RandomNumberGenerator\]::Create\(\)/);
  assert.match(script, /\.GetBytes\(\$bytes\)/);
  assert.doesNotMatch(script, /RandomNumberGenerator\]::Fill\(/);
});

test("start script warns on Mihomo routed SSH without mutating host routes by default", () => {
  const script = readText("ops/local-admin-bridge/start-admin-panel-local-proxy.ps1");

  assert.match(script, /\[switch\]\$AllowDirectRoute/);
  assert.match(script, /Leaving routing to Clash\/Mihomo/);
  assert.match(script, /-not \$AllowDirectRoute/s);
  assert.match(script, /route\.exe ADD/);
});

test("start script reports an executable recovery command for invalid local sessions", () => {
  const script = readText("ops/local-admin-bridge/start-admin-panel-local-proxy.ps1");

  assert.match(script, /Run the recovery command/);
  assert.match(script, /stop-admin-panel-local-proxy\.ps1/);
  assert.match(script, /Local admin proxy port 127\.0\.0\.1:\$ProxyPort is already in use/);
});

test("stop script does not kill unknown listeners unless explicitly forced", () => {
  const script = readText("ops/local-admin-bridge/stop-admin-panel-local-proxy.ps1");

  assert.match(script, /\[switch\]\$ForceUnknownListeners/);
  assert.match(script, /Skipping unknown listener/);
  assert.match(script, /Stop-Process/);
});

test("local Admin proxy keeps console token on loopback targets only", () => {
  const script = readText("ops/local-admin-bridge/admin-panel-local-proxy.mjs");

  assert.match(script, /ADMIN_API_TARGET must be a loopback http\(s\) origin/);
  assert.match(script, /isLoopbackHostname\(targetBase\.hostname\)/);
  assert.match(script, /authorization: `Bearer \$\{consoleToken\}`/);
});

test("local Admin proxy rejects malformed static paths without throwing", () => {
  const script = readText("ops/local-admin-bridge/admin-panel-local-proxy.mjs");

  assert.match(script, /decodeURIComponent\(urlPath\.split\("\?"\)\[0\] \|\| "\/"\)/);
  assert.match(script, /catch \{\s*return null;\s*\}/);
  assert.match(script, /"x-content-type-options": "nosniff"/);
  assert.match(script, /"referrer-policy": "no-referrer"/);
});
