# Proxy Gateway Minimal Backend Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize and modularize the existing Windows proxy gateway backend while preserving the current ports, scripts, and legacy API paths.

**Architecture:** Keep `server/index.mjs` as the process entry point, but move runtime behavior into small services, route modules, and middleware. Add Node built-in tests before each service change so lifecycle, auth, port, config, and status behavior can be verified without starting real system proxy changes.

**Tech Stack:** Node.js ESM, Express 5, Node built-in test runner, `node:http`, `node:net`, `child_process.spawn`, existing `socks`, `socks-proxy-agent`, `node-fetch`, PowerShell scripts through allowlisted command wrappers.

---

## Scope

This plan covers Phase 1 only:

- Backend test harness.
- Auth, ports, config, command, ss-local, and HTTP proxy services.
- Route modules for existing API compatibility.
- New `/api/status` aggregate.
- Small `server/index.mjs` entry point.

It does not introduce React/Vite, Python agent migration, Tauri, Mac VPN, Linux proxy-stack, LAN gateway, or privileged runtime features.

## File Map

- Modify: `package.json`
  - Add test scripts that use Node's built-in test runner.
- Modify: `.gitignore`
  - Add generated temp, coverage, and local brainstorm artifacts.
- Modify: `server/index.mjs`
  - Reduce to environment loading, app creation, listener startup, and default HTTP proxy startup.
- Create: `server/app.mjs`
  - Build and return the Express app with all routes mounted.
- Create: `server/state.mjs`
  - Construct shared services with project paths and environment values.
- Create: `server/middleware/auth.mjs`
  - Enforce console token auth for control paths while allowing health and PAC.
- Create: `server/services/ports.mjs`
  - TCP port listening checks with timeout.
- Create: `server/services/config.mjs`
  - Load proxy config and redact private fields before API responses.
- Create: `server/services/command.mjs`
  - Run fixed command specs with timeout and output limits.
- Create: `server/services/ss-local.mjs`
  - Manage `sslocal.exe` lifecycle, temp config files, cleanup, and concurrent start protection.
- Create: `server/services/http-proxy.mjs`
  - Manage the HTTP-to-SOCKS5 bridge lifecycle.
- Create: `server/routes/legacy-proxy.mjs`
  - Preserve `/api/ss/*`, `/api/http-proxy/*`, and `/api/proxy/*`.
- Create: `server/routes/system-proxy.mjs`
  - Preserve system proxy, env proxy, and autostart endpoints.
- Create: `server/routes/diagnostics.mjs`
  - Preserve health, servers, nginx, ping, and proxy egress tests.
- Create: `server/routes/status.mjs`
  - Add `/api/status` for future UI.
- Create: `server/tests/*.test.mjs`
  - Cover auth, ports, config, command, ss-local lifecycle, HTTP proxy lifecycle, route compatibility, and status aggregate.

## Task 0: Establish A Local Safety Checkpoint

**Files:**
- Modify: `.gitignore`
- Create: `.git/` through `git init`

- [ ] **Step 1: Confirm the project is not already a git repository**

Run:

```powershell
git status --short
```

Expected before this task runs:

```text
fatal: not a git repository (or any of the parent directories): .git
```

- [ ] **Step 2: Extend `.gitignore`**

Append these lines to `.gitignore` if they are not already present:

```gitignore
coverage/
.nyc_output/
.superpowers/
docs/superpowers/plans/*.tmp
```

- [ ] **Step 3: Initialize local git metadata**

Run:

```powershell
git init
```

Expected:

```text
Initialized empty Git repository
```

- [ ] **Step 4: Commit the current baseline**

Run:

```powershell
git add .gitignore README.md package.json package-lock.json qa-report.md public config scripts server agent docs
git commit -m "chore: baseline proxy gateway minimal"
```

Expected:

```text
[main (root-commit)
```

If the default branch name is not `main`, keep the branch name git created. Do not add `.env`, `node_modules/`, or `bin/*.exe`; the existing `.gitignore` excludes them.

## Task 1: Add Test Scripts And Auth Middleware

**Files:**
- Modify: `package.json`
- Create: `server/middleware/auth.mjs`
- Create: `server/tests/auth.test.mjs`

- [ ] **Step 1: Add test scripts to `package.json`**

Change the `scripts` object to include these entries while keeping existing commands:

```json
{
  "server": "node server/index.mjs",
  "ss": "bin/sslocal.exe -c config/ss-local.json -U",
  "proxy:on": "powershell -ExecutionPolicy Bypass -File scripts/proxy.ps1 on",
  "proxy:off": "powershell -ExecutionPolicy Bypass -File scripts/proxy.ps1 off",
  "proxy:pac": "powershell -ExecutionPolicy Bypass -File scripts/proxy.ps1 pac",
  "proxy:status": "powershell -ExecutionPolicy Bypass -File scripts/proxy.ps1 status",
  "test": "npm run test:server",
  "test:server": "node --test server/tests/*.test.mjs"
}
```

- [ ] **Step 2: Write the auth middleware test**

Create `server/tests/auth.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createServer } from "node:http";
import { createAuthMiddleware } from "../middleware/auth.mjs";

function listen(app) {
  return new Promise((resolve) => {
    const server = createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

test("auth middleware allows public paths", async () => {
  const app = express();
  app.use(createAuthMiddleware({ token: "secret", publicPaths: ["/api/health", "/proxy.pac"] }));
  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  const { server, baseUrl } = await listen(app);
  try {
    const response = await fetch(`${baseUrl}/api/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    server.close();
  }
});

test("auth middleware blocks control paths without token", async () => {
  const app = express();
  app.use(createAuthMiddleware({ token: "secret", publicPaths: ["/api/health"] }));
  app.post("/api/proxy/start", (_req, res) => res.json({ ok: true }));

  const { server, baseUrl } = await listen(app);
  try {
    const response = await fetch(`${baseUrl}/api/proxy/start`, { method: "POST" });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Unauthorized" });
  } finally {
    server.close();
  }
});

test("auth middleware accepts bearer token and token query", async () => {
  const app = express();
  app.use(createAuthMiddleware({ token: "secret", publicPaths: [] }));
  app.post("/api/proxy/start", (_req, res) => res.json({ ok: true }));
  app.post("/api/proxy/stop", (_req, res) => res.json({ ok: true }));

  const { server, baseUrl } = await listen(app);
  try {
    const bearer = await fetch(`${baseUrl}/api/proxy/start`, {
      method: "POST",
      headers: { authorization: "Bearer secret" }
    });
    assert.equal(bearer.status, 200);
    assert.deepEqual(await bearer.json(), { ok: true });

    const query = await fetch(`${baseUrl}/api/proxy/stop?token=secret`, { method: "POST" });
    assert.equal(query.status, 200);
    assert.deepEqual(await query.json(), { ok: true });
  } finally {
    server.close();
  }
});
```

- [ ] **Step 3: Run the test and verify it fails**

Run:

```powershell
npm run test:server -- --test-name-pattern "auth middleware"
```

Expected:

```text
ERR_MODULE_NOT_FOUND
```

The failure confirms `server/middleware/auth.mjs` does not exist yet.

- [ ] **Step 4: Create `server/middleware/auth.mjs`**

Create this file:

```js
export function createAuthMiddleware({ token, publicPaths = [] }) {
  return function authMiddleware(req, res, next) {
    if (publicPaths.some((path) => req.path === path || req.path.startsWith(`${path}/`))) {
      next();
      return;
    }

    const authorization = req.headers.authorization || "";
    const bearer = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    const queryToken = typeof req.query.token === "string" ? req.query.token : "";

    if (token && (bearer === token || queryToken === token)) {
      next();
      return;
    }

    res.status(401).json({ error: "Unauthorized" });
  };
}
```

- [ ] **Step 5: Run the auth tests**

Run:

```powershell
npm run test:server -- --test-name-pattern "auth middleware"
```

Expected:

```text
# pass 3
# fail 0
```

- [ ] **Step 6: Commit**

Run:

```powershell
git add package.json server/middleware/auth.mjs server/tests/auth.test.mjs
git commit -m "test: add auth middleware coverage"
```

Expected:

```text
[main
```

## Task 2: Add Port Status Service

**Files:**
- Create: `server/services/ports.mjs`
- Create: `server/tests/ports.test.mjs`

- [ ] **Step 1: Write port service tests**

Create `server/tests/ports.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { isPortListening } from "../services/ports.mjs";

function listenOnRandomPort() {
  return new Promise((resolve) => {
    const server = createServer((_req, res) => res.end("ok"));
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: server.address().port });
    });
  });
}

test("isPortListening returns true for a listening TCP port", async () => {
  const { server, port } = await listenOnRandomPort();
  try {
    assert.equal(await isPortListening(port, "127.0.0.1", 500), true);
  } finally {
    server.close();
  }
});

test("isPortListening returns false for a closed TCP port", async () => {
  const { server, port } = await listenOnRandomPort();
  await new Promise((resolve) => server.close(resolve));
  assert.equal(await isPortListening(port, "127.0.0.1", 500), false);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npm run test:server -- --test-name-pattern "isPortListening"
```

Expected:

```text
ERR_MODULE_NOT_FOUND
```

- [ ] **Step 3: Create `server/services/ports.mjs`**

Create this file:

```js
import { createConnection } from "node:net";

export function isPortListening(port, host = "127.0.0.1", timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port, timeout: timeoutMs });

    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });

    socket.on("error", () => {
      resolve(false);
    });
  });
}

export async function buildPortStatus({ consolePort, socksPort, httpProxyPort, host = "127.0.0.1" }) {
  const [socks5, httpProxy] = await Promise.all([
    isPortListening(socksPort, host),
    isPortListening(httpProxyPort, host)
  ]);

  return {
    consolePort: { port: consolePort, ok: true, desc: "Console" },
    socks5: { port: socksPort, ok: socks5, desc: "SOCKS5" },
    httpProxy: { port: httpProxyPort, ok: httpProxy, desc: "HTTP Proxy" }
  };
}
```

- [ ] **Step 4: Run the port tests**

Run:

```powershell
npm run test:server -- --test-name-pattern "isPortListening"
```

Expected:

```text
# pass 2
# fail 0
```

- [ ] **Step 5: Commit**

Run:

```powershell
git add server/services/ports.mjs server/tests/ports.test.mjs
git commit -m "test: add port status service"
```

Expected:

```text
[main
```

## Task 3: Add Config Service With Redaction And Host Allowlist

**Files:**
- Create: `server/services/config.mjs`
- Create: `server/tests/config.test.mjs`

- [ ] **Step 1: Write config service tests**

Create `server/tests/config.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { loadProxyConfig, publicProxyConfig, allowedDiagnosticHosts } from "../services/config.mjs";

test("loadProxyConfig substitutes SS_PASSWORD only in memory", () => {
  const config = loadProxyConfig({
    configPath: new URL("../../config/proxy-servers.json", import.meta.url),
    env: { SS_PASSWORD: "secret-password" }
  });

  assert.equal(config.servers[0].password, "secret-password");
});

test("publicProxyConfig redacts server passwords", () => {
  const config = {
    servers: [
      { name: "primary", host: "203.0.113.10", port: 18388, method: "aes-256-gcm", password: "secret", type: "shadowsocks-rust", note: "primary" }
    ],
    pingHosts: ["203.0.113.10"],
    nginx: { host: "203.0.113.10", ports: [443] }
  };

  assert.deepEqual(publicProxyConfig(config), {
    servers: [
      { name: "primary", host: "203.0.113.10", port: 18388, method: "aes-256-gcm", type: "shadowsocks-rust", note: "primary" }
    ],
    pingHosts: ["203.0.113.10"],
    nginx: { host: "203.0.113.10", ports: [443] }
  });
});

test("allowedDiagnosticHosts includes server, nginx, and ping hosts once", () => {
  const config = {
    servers: [{ host: "203.0.113.10" }, { host: "203.0.113.11" }],
    pingHosts: ["203.0.113.10", "198.51.100.8"],
    nginx: { host: "203.0.113.12" }
  };

  assert.deepEqual(allowedDiagnosticHosts(config), [
    "203.0.113.10",
    "203.0.113.11",
    "203.0.113.12",
    "198.51.100.8"
  ]);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npm run test:server -- --test-name-pattern "Config|allowedDiagnosticHosts|publicProxyConfig"
```

Expected:

```text
ERR_MODULE_NOT_FOUND
```

- [ ] **Step 3: Create `server/services/config.mjs`**

Create this file:

```js
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function pathFrom(input) {
  return input instanceof URL ? fileURLToPath(input) : input;
}

export function loadProxyConfig({ configPath, env = process.env }) {
  const raw = readFileSync(pathFrom(configPath), "utf8");
  return JSON.parse(raw.replace(/\$\{SS_PASSWORD\}/g, env.SS_PASSWORD || ""));
}

export function publicProxyConfig(config) {
  return {
    servers: (config.servers || []).map(({ password, ...server }) => server),
    pingHosts: config.pingHosts || [],
    nginx: config.nginx || {}
  };
}

export function allowedDiagnosticHosts(config) {
  return [
    ...(config.servers || []).map((server) => server.host),
    config.nginx?.host,
    ...(config.pingHosts || [])
  ].filter((host, index, hosts) => host && hosts.indexOf(host) === index);
}
```

- [ ] **Step 4: Run config tests**

Run:

```powershell
npm run test:server -- --test-name-pattern "loadProxyConfig|allowedDiagnosticHosts|publicProxyConfig"
```

Expected:

```text
# pass 3
# fail 0
```

- [ ] **Step 5: Commit**

Run:

```powershell
git add server/services/config.mjs server/tests/config.test.mjs
git commit -m "test: add proxy config service"
```

Expected:

```text
[main
```

## Task 4: Add Command Service

**Files:**
- Create: `server/services/command.mjs`
- Create: `server/tests/command.test.mjs`

- [ ] **Step 1: Write command service tests**

Create `server/tests/command.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { runCommand, createCommandRunner } from "../services/command.mjs";

test("runCommand captures stdout and exit code", async () => {
  const result = await runCommand(process.execPath, ["-e", "console.log('ok')"], { timeoutMs: 2000 });

  assert.equal(result.ok, true);
  assert.equal(result.code, 0);
  assert.equal(result.stdout, "ok");
  assert.equal(result.stderr, "");
  assert.equal(result.timedOut, false);
});

test("runCommand reports timeout", async () => {
  const result = await runCommand(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], { timeoutMs: 100 });

  assert.equal(result.ok, false);
  assert.equal(result.timedOut, true);
});

test("createCommandRunner blocks unknown commands", async () => {
  const runner = createCommandRunner({
    known: { command: process.execPath, args: ["-e", "console.log('known')"], timeoutMs: 2000 }
  });

  assert.deepEqual(await runner("missing"), {
    ok: false,
    code: -1,
    stdout: "",
    stderr: "Command not allowed: missing",
    timedOut: false
  });
});

test("createCommandRunner runs known command specs", async () => {
  const runner = createCommandRunner({
    known: { command: process.execPath, args: ["-e", "console.log('known')"], timeoutMs: 2000 }
  });

  const result = await runner("known");
  assert.equal(result.ok, true);
  assert.equal(result.stdout, "known");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npm run test:server -- --test-name-pattern "runCommand|createCommandRunner"
```

Expected:

```text
ERR_MODULE_NOT_FOUND
```

- [ ] **Step 3: Create `server/services/command.mjs`**

Create this file:

```js
import { spawn } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_OUTPUT = 16_000;

export function runCommand(command, args = [], options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutput = options.maxOutput ?? DEFAULT_MAX_OUTPUT;
  const env = options.env ?? process.env;

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env,
      shell: false,
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1500).unref();
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout = (stdout + chunk.toString()).slice(-maxOutput);
    });

    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-maxOutput);
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        code: -1,
        stdout: stdout.trim(),
        stderr: `${stderr.trim()}${stderr.trim() ? "\n" : ""}${error.message}`,
        timedOut
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0 && !timedOut,
        code: code ?? -1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        timedOut
      });
    });
  });
}

export function createCommandRunner(commandSpecs) {
  return async function runKnownCommand(name, overrides = {}) {
    const spec = commandSpecs[name];
    if (!spec) {
      return {
        ok: false,
        code: -1,
        stdout: "",
        stderr: `Command not allowed: ${name}`,
        timedOut: false
      };
    }

    return runCommand(spec.command, spec.args, {
      timeoutMs: spec.timeoutMs,
      maxOutput: spec.maxOutput,
      env: spec.env,
      ...overrides
    });
  };
}
```

- [ ] **Step 4: Run command tests**

Run:

```powershell
npm run test:server -- --test-name-pattern "runCommand|createCommandRunner"
```

Expected:

```text
# pass 4
# fail 0
```

- [ ] **Step 5: Commit**

Run:

```powershell
git add server/services/command.mjs server/tests/command.test.mjs
git commit -m "test: add allowlisted command service"
```

Expected:

```text
[main
```

## Task 5: Add `sslocal.exe` Lifecycle Service

**Files:**
- Create: `server/services/ss-local.mjs`
- Create: `server/tests/ss-local.test.mjs`

- [ ] **Step 1: Write ss-local lifecycle tests**

Create `server/tests/ss-local.test.mjs`:

```js
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSsLocalService } from "../services/ss-local.mjs";

class FakeChild extends EventEmitter {
  constructor(pid = 1234) {
    super();
    this.pid = pid;
    this.killed = false;
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
  }

  kill() {
    this.killed = true;
    this.emit("exit", 0);
  }
}

function makeService(overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ss-local-test-"));
  const templatePath = join(dir, "ss-local.json");
  writeFileSync(templatePath, JSON.stringify({ password: "${SS_PASSWORD}", local_port: 1080 }));

  const child = new FakeChild();
  const calls = { spawn: 0 };
  const service = createSsLocalService({
    ssPath: join(dir, "sslocal.exe"),
    templatePath,
    tempDir: dir,
    env: { SS_PASSWORD: "secret" },
    startupDelayMs: 1,
    spawnFn: () => {
      calls.spawn += 1;
      return child;
    },
    isPortListeningFn: async () => false,
    logger: { log() {}, warn() {}, error() {} },
    ...overrides
  });

  return { service, child, calls, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("ss-local start spawns one child and reports running", async () => {
  const { service, calls, cleanup } = makeService();
  try {
    const result = await service.start();
    assert.equal(result.ok, true);
    assert.equal(result.pid, 1234);
    assert.equal(calls.spawn, 1);
    assert.equal(service.status().running, true);
  } finally {
    cleanup();
  }
});

test("ss-local concurrent start is protected by mutex", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { service, calls, cleanup } = makeService({ startupDelayMs: 1 });

  const originalStart = service.start;
  service.start = async () => {
    const result = originalStart();
    await gate;
    return result;
  };

  try {
    const first = originalStart();
    const second = originalStart();
    release();
    const results = await Promise.all([first, second]);
    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.equal(results.some((result) => result.msg === "already starting"), true);
    assert.equal(calls.spawn, 1);
  } finally {
    cleanup();
  }
});

test("ss-local start rejects occupied SOCKS port", async () => {
  const { service, calls, cleanup } = makeService({ isPortListeningFn: async () => true });
  try {
    const result = await service.start();
    assert.equal(result.ok, false);
    assert.equal(result.msg, "Port 1080 already in use by another process");
    assert.equal(calls.spawn, 0);
  } finally {
    cleanup();
  }
});

test("ss-local stop is idempotent", async () => {
  const { service, cleanup } = makeService();
  try {
    assert.deepEqual(await service.stop(), { ok: true });
    assert.deepEqual(await service.stop(), { ok: true });
  } finally {
    cleanup();
  }
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npm run test:server -- --test-name-pattern "ss-local"
```

Expected:

```text
ERR_MODULE_NOT_FOUND
```

- [ ] **Step 3: Create `server/services/ss-local.mjs`**

Create this file:

```js
import { spawn } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export function createSsLocalService({
  ssPath,
  templatePath,
  tempDir = tmpdir(),
  env = process.env,
  socksPort = 1080,
  spawnFn = spawn,
  isPortListeningFn,
  startupDelayMs = 2000,
  logger = console
}) {
  let child = null;
  let starting = false;
  const tempFiles = new Set();

  function cleanupTempFile(path) {
    try {
      unlinkSync(path);
    } catch {
      return;
    } finally {
      tempFiles.delete(path);
    }
  }

  function generateConfig() {
    const raw = readFileSync(templatePath, "utf8");
    const config = JSON.parse(raw.replace(/\$\{SS_PASSWORD\}/g, env.SS_PASSWORD || ""));
    const path = join(tempDir, `ss-local-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
    writeFileSync(path, JSON.stringify(config));
    tempFiles.add(path);
    return path;
  }

  async function start() {
    if (child && !child.killed) {
      return { ok: false, msg: "already running" };
    }
    if (starting) {
      return { ok: false, msg: "already starting" };
    }

    starting = true;
    try {
      if (await isPortListeningFn(socksPort)) {
        return { ok: false, msg: `Port ${socksPort} already in use by another process` };
      }

      const configPath = generateConfig();
      child = spawnFn(ssPath, ["-c", configPath, "-U"], {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      });

      child.stdout?.on("data", (data) => logger.log("[sslocal]", data.toString().trim()));
      child.stderr?.on("data", (data) => logger.log("[sslocal]", data.toString().trim()));
      child.on("exit", (code) => {
        logger.log(`[sslocal] exit ${code}`);
        cleanupTempFile(configPath);
        child = null;
        starting = false;
      });

      setTimeout(() => cleanupTempFile(configPath), 3000).unref?.();
      await new Promise((resolve) => setTimeout(resolve, startupDelayMs));

      if (!child || child.killed) {
        return { ok: false, msg: "ss-local process exited unexpectedly" };
      }

      return { ok: true, msg: "ss-local starting...", pid: child.pid };
    } finally {
      starting = false;
    }
  }

  async function stop() {
    if (child && !child.killed) {
      child.kill("SIGTERM");
      try {
        child.kill("SIGKILL");
      } catch {
        return { ok: true };
      }
    }
    child = null;
    return { ok: true };
  }

  function status() {
    return {
      running: Boolean(child && !child.killed),
      starting,
      pid: child && !child.killed ? child.pid : null
    };
  }

  function cleanupAllTempFiles() {
    for (const file of tempFiles) {
      cleanupTempFile(file);
    }
  }

  return { start, stop, status, cleanupAllTempFiles };
}
```

- [ ] **Step 4: Run ss-local tests**

Run:

```powershell
npm run test:server -- --test-name-pattern "ss-local"
```

Expected:

```text
# pass 4
# fail 0
```

- [ ] **Step 5: Commit**

Run:

```powershell
git add server/services/ss-local.mjs server/tests/ss-local.test.mjs
git commit -m "test: add ss-local lifecycle service"
```

Expected:

```text
[main
```

## Task 6: Add HTTP Proxy Lifecycle Service

**Files:**
- Create: `server/services/http-proxy.mjs`
- Create: `server/tests/http-proxy.test.mjs`

- [ ] **Step 1: Write HTTP proxy lifecycle tests**

Create `server/tests/http-proxy.test.mjs`:

```js
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createHttpProxyService } from "../services/http-proxy.mjs";

class FakeServer extends EventEmitter {
  constructor() {
    super();
    this.listening = false;
    this.listenCalls = 0;
    this.closeCalls = 0;
  }

  listen(_port, _host, callback) {
    this.listenCalls += 1;
    this.listening = true;
    callback?.();
  }

  close(callback) {
    this.closeCalls += 1;
    this.listening = false;
    callback?.();
  }
}

test("http proxy start listens once", async () => {
  const server = new FakeServer();
  const service = createHttpProxyService({
    server,
    port: 18180,
    host: "127.0.0.1",
    isPortListeningFn: async () => false,
    logger: { log() {} }
  });

  assert.deepEqual(await service.start(), { ok: true, msg: "http-proxy starting..." });
  assert.equal(server.listenCalls, 1);
  assert.equal(service.status().running, true);
});

test("http proxy start reports already running when port listens", async () => {
  const server = new FakeServer();
  const service = createHttpProxyService({
    server,
    port: 18180,
    host: "127.0.0.1",
    isPortListeningFn: async () => true,
    logger: { log() {} }
  });

  assert.deepEqual(await service.start(), { ok: false, msg: "already running" });
  assert.equal(server.listenCalls, 0);
});

test("http proxy stop is idempotent", async () => {
  const server = new FakeServer();
  const service = createHttpProxyService({
    server,
    port: 18180,
    host: "127.0.0.1",
    isPortListeningFn: async () => false,
    logger: { log() {} }
  });

  assert.deepEqual(await service.stop(), { ok: true });
  assert.deepEqual(await service.stop(), { ok: true });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npm run test:server -- --test-name-pattern "http proxy"
```

Expected:

```text
ERR_MODULE_NOT_FOUND
```

- [ ] **Step 3: Create `server/services/http-proxy.mjs`**

Create this file:

```js
export function createHttpProxyService({
  server,
  port = 18180,
  host = "127.0.0.1",
  isPortListeningFn,
  logger = console
}) {
  let starting = false;
  let running = false;

  async function start() {
    if (starting) {
      return { ok: false, msg: "already starting" };
    }
    if (running || await isPortListeningFn(port, host)) {
      running = true;
      return { ok: false, msg: "already running" };
    }

    starting = true;
    try {
      await new Promise((resolve, reject) => {
        server.once?.("error", reject);
        server.listen(port, host, () => {
          logger.log(`[http-proxy] listening :${port}`);
          resolve();
        });
      });
      running = true;
      return { ok: true, msg: "http-proxy starting..." };
    } finally {
      starting = false;
    }
  }

  async function stop() {
    if (!running) {
      return { ok: true };
    }

    await new Promise((resolve) => {
      server.close(() => {
        logger.log("[http-proxy] stopped");
        resolve();
      });
    });
    running = false;
    return { ok: true };
  }

  function status() {
    return { running, starting, port, host };
  }

  return { start, stop, status };
}
```

- [ ] **Step 4: Run HTTP proxy tests**

Run:

```powershell
npm run test:server -- --test-name-pattern "http proxy"
```

Expected:

```text
# pass 3
# fail 0
```

- [ ] **Step 5: Commit**

Run:

```powershell
git add server/services/http-proxy.mjs server/tests/http-proxy.test.mjs
git commit -m "test: add http proxy lifecycle service"
```

Expected:

```text
[main
```

## Task 7: Assemble Shared Runtime State

**Files:**
- Create: `server/state.mjs`
- Create: `server/tests/state.test.mjs`

- [ ] **Step 1: Write state construction test**

Create `server/tests/state.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeState } from "../state.mjs";

test("createRuntimeState exposes expected ports and services", () => {
  const state = createRuntimeState({
    rootDir: new URL("..", import.meta.url),
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
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npm run test:server -- --test-name-pattern "createRuntimeState"
```

Expected:

```text
ERR_MODULE_NOT_FOUND
```

- [ ] **Step 3: Create `server/state.mjs`**

Create this file:

```js
import http from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import crypto from "node:crypto";
import { SocksClient } from "socks";
import { SocksProxyAgent } from "socks-proxy-agent";
import nodeFetch from "node-fetch";
import { createSsLocalService } from "./services/ss-local.mjs";
import { createHttpProxyService } from "./services/http-proxy.mjs";
import { isPortListening } from "./services/ports.mjs";
import { loadProxyConfig } from "./services/config.mjs";

function rootPathFrom(rootDir) {
  if (rootDir instanceof URL) {
    return resolve(fileURLToPath(rootDir));
  }
  return resolve(rootDir);
}

function createBridgeServer({ socksPort }) {
  const socksAgent = new SocksProxyAgent(`socks5://127.0.0.1:${socksPort}`);
  const server = http.createServer(async (req, res) => {
    const targetUrl = req.url || "";
    if (!targetUrl.startsWith("http")) {
      res.writeHead(400);
      res.end("Bad Request");
      return;
    }

    try {
      const proxyRes = await nodeFetch(targetUrl, {
        method: req.method,
        headers: req.headers,
        body: req.method !== "GET" && req.method !== "HEAD" ? req : undefined,
        timeout: 15000,
        agent: socksAgent
      });
      const headers = {};
      proxyRes.headers.forEach((value, key) => {
        headers[key] = value;
      });
      res.writeHead(proxyRes.status, headers);
      proxyRes.body.pipe(res);
    } catch (error) {
      if (!res.headersSent) {
        res.writeHead(502);
      }
      res.end(`Proxy Error: ${error.message}`);
    }
  });

  server.on("connect", (req, clientSocket, head) => {
    const [hostname, portText] = (req.url || "").split(":");
    const port = Number.parseInt(portText, 10) || 443;
    SocksClient.createConnection({
      proxy: { host: "127.0.0.1", port: socksPort, type: 5 },
      destination: { host: hostname, port },
      command: "connect"
    }).then(({ socket }) => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head?.length) {
        socket.write(head);
      }
      socket.pipe(clientSocket);
      clientSocket.pipe(socket);
      socket.on("error", () => clientSocket.destroy());
      clientSocket.on("error", () => socket.destroy());
    }).catch((error) => {
      clientSocket.end(`HTTP/1.1 502 Proxy Error\r\n\r\n${error.message}`);
    });
  });

  return server;
}

export function createRuntimeState(options = {}) {
  const rootDir = rootPathFrom(options.rootDir || new URL("..", import.meta.url));
  const env = options.env || process.env;
  const host = "127.0.0.1";
  const ports = { console: 4077, socks: 1080, httpProxy: 18180 };
  const proxyConfig = loadProxyConfig({
    configPath: join(rootDir, "config", "proxy-servers.json"),
    env
  });

  const bridgeServer = options.httpProxyServer || createBridgeServer({ socksPort: ports.socks });
  const ssLocal = createSsLocalService({
    ssPath: join(rootDir, "bin", "sslocal.exe"),
    templatePath: join(rootDir, "config", "ss-local.json"),
    env,
    socksPort: ports.socks,
    isPortListeningFn: isPortListening
  });
  const httpProxy = createHttpProxyService({
    server: bridgeServer,
    port: ports.httpProxy,
    host,
    isPortListeningFn: isPortListening
  });

  return {
    rootDir,
    host,
    ports,
    proxyConfig,
    consoleToken: env.CONSOLE_TOKEN || crypto.randomUUID(),
    services: { ssLocal, httpProxy },
    autoStartHttpProxy: options.autoStartHttpProxy ?? true
  };
}
```

- [ ] **Step 4: Run state test**

Run:

```powershell
npm run test:server -- --test-name-pattern "createRuntimeState"
```

Expected:

```text
# pass 1
# fail 0
```

- [ ] **Step 5: Commit**

Run:

```powershell
git add server/state.mjs server/tests/state.test.mjs
git commit -m "test: add runtime state factory"
```

Expected:

```text
[main
```

## Task 8: Add Route Modules And `/api/status`

**Files:**
- Create: `server/app.mjs`
- Create: `server/routes/legacy-proxy.mjs`
- Create: `server/routes/status.mjs`
- Create: `server/tests/routes.test.mjs`

- [ ] **Step 1: Write route compatibility tests**

Create `server/tests/routes.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
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
    rootDir: new URL("..", import.meta.url).pathname,
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
```

- [ ] **Step 2: Run the route tests and verify they fail**

Run:

```powershell
npm run test:server -- --test-name-pattern "legacy proxy routes|/api/status"
```

Expected:

```text
ERR_MODULE_NOT_FOUND
```

- [ ] **Step 3: Create `server/routes/legacy-proxy.mjs`**

Create this file:

```js
import { Router } from "express";

export function legacyProxyRoutes(state) {
  const router = Router();

  router.post("/api/ss/start", async (_req, res) => {
    res.json(await state.services.ssLocal.start());
  });

  router.post("/api/ss/stop", async (_req, res) => {
    res.json(await state.services.ssLocal.stop());
  });

  router.post("/api/http-proxy/start", async (_req, res) => {
    res.json(await state.services.httpProxy.start());
  });

  router.post("/api/http-proxy/stop", async (_req, res) => {
    res.json(await state.services.httpProxy.stop());
  });

  router.post("/api/proxy/start", async (_req, res) => {
    const socks = await state.services.ssLocal.start();
    const http = await state.services.httpProxy.start();
    if (!socks.ok && socks.msg !== "already running") {
      res.json({ ok: false, msg: socks.msg, socks5: false, http: state.services.httpProxy.status().running });
      return;
    }
    if (!http.ok && http.msg !== "already running") {
      res.json({ ok: false, msg: http.msg, socks5: state.services.ssLocal.status().running, http: false });
      return;
    }
    res.json({
      socks5: await state.isPortListening(state.ports.socks, state.host),
      http: await state.isPortListening(state.ports.httpProxy, state.host),
      ok: true
    });
  });

  router.post("/api/proxy/stop", async (_req, res) => {
    await state.services.ssLocal.stop();
    await state.services.httpProxy.stop();
    res.json({ ok: true });
  });

  router.get("/api/proxy/overview", async (_req, res) => {
    res.json({
      consolePort: { port: state.ports.console, ok: true, desc: "Console" },
      socks5: { port: state.ports.socks, ok: await state.isPortListening(state.ports.socks, state.host), desc: "SOCKS5" },
      httpProxy: { port: state.ports.httpProxy, ok: await state.isPortListening(state.ports.httpProxy, state.host), desc: "HTTP Proxy" },
      ssRunning: state.services.ssLocal.status().running
    });
  });

  return router;
}
```

- [ ] **Step 4: Create `server/routes/status.mjs`**

Create this file:

```js
export function statusRoutes(state) {
  return async function statusHandler(_req, res) {
    const [socks5, httpProxy] = await Promise.all([
      state.isPortListening(state.ports.socks, state.host),
      state.isPortListening(state.ports.httpProxy, state.host)
    ]);

    res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      ports: {
        console: { port: state.ports.console, ok: true },
        socks5: { port: state.ports.socks, ok: socks5 },
        httpProxy: { port: state.ports.httpProxy, ok: httpProxy }
      },
      runtime: {
        ssLocal: state.services.ssLocal.status(),
        httpProxy: state.services.httpProxy.status()
      }
    });
  };
}
```

- [ ] **Step 5: Create `server/app.mjs`**

Create this file:

```js
import express from "express";
import { join } from "node:path";
import { createAuthMiddleware } from "./middleware/auth.mjs";
import { legacyProxyRoutes } from "./routes/legacy-proxy.mjs";
import { statusRoutes } from "./routes/status.mjs";

const PUBLIC_PATHS = ["/api/health", "/proxy.pac"];

export function createApp(state) {
  const app = express();
  app.use(express.json());
  app.use(createAuthMiddleware({ token: state.consoleToken, publicPaths: PUBLIC_PATHS }));
  app.use(express.static(join(state.rootDir, "public")));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, ts: Date.now(), authRequired: true });
  });
  app.get("/api/status", statusRoutes(state));
  app.use(legacyProxyRoutes(state));

  return app;
}
```

- [ ] **Step 6: Run route tests**

Run:

```powershell
npm run test:server -- --test-name-pattern "legacy proxy routes|/api/status"
```

Expected:

```text
# pass 2
# fail 0
```

- [ ] **Step 7: Commit**

Run:

```powershell
git add server/app.mjs server/routes/legacy-proxy.mjs server/routes/status.mjs server/tests/routes.test.mjs
git commit -m "test: add compatible proxy routes"
```

Expected:

```text
[main
```

## Task 9: Add Diagnostics And System Proxy Routes

**Files:**
- Create: `server/routes/diagnostics.mjs`
- Create: `server/routes/system-proxy.mjs`
- Modify: `server/app.mjs`
- Create: `server/tests/diagnostics.test.mjs`

- [ ] **Step 1: Write diagnostics allowlist test**

Create `server/tests/diagnostics.test.mjs`:

```js
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

test("ping route blocks hosts outside configured allowlist", async () => {
  const state = {
    rootDir: new URL("..", import.meta.url).pathname,
    host: "127.0.0.1",
    ports: { console: 4077, socks: 1080, httpProxy: 18180 },
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
```

- [ ] **Step 2: Create `server/routes/diagnostics.mjs`**

Create this file:

```js
import { Router } from "express";
import nodeFetch from "node-fetch";
import { SocksProxyAgent } from "socks-proxy-agent";
import { allowedDiagnosticHosts, publicProxyConfig } from "../services/config.mjs";

export function diagnosticsRoutes(state) {
  const router = Router();

  router.get("/api/proxy/servers", (_req, res) => {
    res.json(publicProxyConfig(state.proxyConfig));
  });

  router.get("/api/nginx/status", async (_req, res) => {
    const host = state.proxyConfig.nginx?.host || "127.0.0.1";
    const ports = state.proxyConfig.nginx?.ports || [];
    const results = await Promise.all(ports.map(async (port) => ({
      port,
      host,
      ok: await state.isPortListening(port, host),
      ts: Date.now()
    })));
    res.json({ host, results, ts: Date.now() });
  });

  router.get("/api/ping/:host", async (req, res) => {
    if (!allowedDiagnosticHosts(state.proxyConfig).includes(req.params.host)) {
      res.status(403).json({ error: "Host not allowed" });
      return;
    }
    const result = await state.runCommand("ping", { host: req.params.host });
    const output = result.stdout || "";
    const avg = output.match(/Average = (\d+)ms/i);
    res.json({
      host: req.params.host,
      reachable: result.ok && output.includes("Received ="),
      avgMs: avg ? Number.parseInt(avg[1], 10) : null
    });
  });

  router.get("/api/proxy/test", async (_req, res) => {
    try {
      const agent = new SocksProxyAgent(`socks5://127.0.0.1:${state.ports.socks}`);
      const response = await nodeFetch("https://httpbin.org/ip", { agent, timeout: 10000 });
      const body = await response.json();
      res.json({ ok: true, origin: body.origin });
    } catch (error) {
      res.json({ ok: false, error: error.message });
    }
  });

  return router;
}
```

- [ ] **Step 3: Create `server/routes/system-proxy.mjs`**

Create this file:

```js
import { Router } from "express";

export function systemProxyRoutes(state) {
  const router = Router();

  router.post("/api/system-proxy/:action", async (req, res) => {
    res.json(await state.runCommand("system-proxy", { action: req.params.action }));
  });

  router.post("/api/env-proxy/on", async (_req, res) => {
    res.json(await state.runCommand("env-proxy-on"));
  });

  router.post("/api/env-proxy/off", async (_req, res) => {
    res.json(await state.runCommand("env-proxy-off"));
  });

  router.get("/api/env-proxy/status", async (_req, res) => {
    const result = await state.runCommand("env-proxy-status");
    res.json({ ok: result.ok, output: result.stdout, error: result.stderr || undefined });
  });

  router.post("/api/autostart/on", async (_req, res) => {
    res.json(await state.runCommand("autostart-on"));
  });

  router.post("/api/autostart/off", async (_req, res) => {
    res.json(await state.runCommand("autostart-off"));
  });

  router.get("/api/autostart/status", async (_req, res) => {
    const result = await state.runCommand("autostart-status");
    res.json({ ok: true, enabled: result.ok });
  });

  return router;
}
```

- [ ] **Step 4: Mount new routes in `server/app.mjs`**

Add imports:

```js
import { diagnosticsRoutes } from "./routes/diagnostics.mjs";
import { systemProxyRoutes } from "./routes/system-proxy.mjs";
```

Mount routes after `legacyProxyRoutes(state)`:

```js
  app.use(legacyProxyRoutes(state));
  app.use(systemProxyRoutes(state));
  app.use(diagnosticsRoutes(state));
```

- [ ] **Step 5: Run diagnostics tests**

Run:

```powershell
npm run test:server -- --test-name-pattern "ping route"
```

Expected:

```text
# pass 1
# fail 0
```

- [ ] **Step 6: Commit**

Run:

```powershell
git add server/routes/diagnostics.mjs server/routes/system-proxy.mjs server/app.mjs server/tests/diagnostics.test.mjs
git commit -m "test: add diagnostics and system proxy routes"
```

Expected:

```text
[main
```

## Task 10: Wire `server/index.mjs` To The Modular App

**Files:**
- Modify: `server/index.mjs`
- Modify: `server/state.mjs`
- Create: `server/tests/index-contract.test.mjs`

- [ ] **Step 1: Add command runner wiring in `server/state.mjs`**

Add imports:

```js
import { createCommandRunner } from "./services/command.mjs";
```

Add this inside `createRuntimeState` before the return:

```js
  const runKnownCommand = createCommandRunner({
    "system-proxy": {
      command: "powershell",
      args: ["-ExecutionPolicy", "Bypass", "-File", join(rootDir, "scripts", "proxy.ps1"), "status"],
      timeoutMs: 10000
    },
    "env-proxy-on": {
      command: "powershell",
      args: ["-ExecutionPolicy", "Bypass", "-File", join(rootDir, "scripts", "proxy.ps1"), "env"],
      timeoutMs: 10000
    },
    "env-proxy-off": {
      command: "powershell",
      args: ["-ExecutionPolicy", "Bypass", "-File", join(rootDir, "scripts", "proxy.ps1"), "env-off"],
      timeoutMs: 10000
    },
    "env-proxy-status": {
      command: "powershell",
      args: ["-ExecutionPolicy", "Bypass", "-Command", "$h=[Environment]::GetEnvironmentVariable('HTTP_PROXY','User');$s=[Environment]::GetEnvironmentVariable('HTTPS_PROXY','User');$a=[Environment]::GetEnvironmentVariable('ALL_PROXY','User');Write-Output \"HTTP_PROXY=$h\";Write-Output \"HTTPS_PROXY=$s\";Write-Output \"ALL_PROXY=$a\""],
      timeoutMs: 10000
    },
    "autostart-on": {
      command: "schtasks",
      args: ["/Create", "/SC", "ONLOGON", "/TN", "ProxyGatewayConsole", "/TR", `"${process.execPath}" "${join(rootDir, "server", "index.mjs")}"`, "/RL", "LIMITED", "/F"],
      timeoutMs: 10000
    },
    "autostart-off": {
      command: "schtasks",
      args: ["/Delete", "/TN", "ProxyGatewayConsole", "/F"],
      timeoutMs: 10000
    },
    "autostart-status": {
      command: "schtasks",
      args: ["/Query", "/TN", "ProxyGatewayConsole"],
      timeoutMs: 5000
    },
    "ping": {
      command: "ping",
      args: ["-n", "3", "127.0.0.1"],
      timeoutMs: 15000
    }
  });

  function runCommand(name, data = {}) {
    if (name === "system-proxy") {
      const action = ["on", "off", "pac", "status"].includes(data.action) ? data.action : "status";
      return createCommandRunner({
        "system-proxy": {
          command: "powershell",
          args: ["-ExecutionPolicy", "Bypass", "-File", join(rootDir, "scripts", "proxy.ps1"), action],
          timeoutMs: 10000
        }
      })("system-proxy");
    }
    if (name === "ping") {
      return createCommandRunner({
        ping: {
          command: "ping",
          args: ["-n", "3", data.host],
          timeoutMs: 15000
        }
      })("ping");
    }
    return runKnownCommand(name);
  }
```

Include `runCommand` in the returned object:

```js
    runCommand,
    isPortListening,
```

- [ ] **Step 2: Replace `server/index.mjs` with the small entry point**

Replace the file content with:

```js
import "dotenv/config";
import { createApp } from "./app.mjs";
import { createRuntimeState } from "./state.mjs";

const state = createRuntimeState();
const app = createApp(state);

const server = app.listen(state.ports.console, state.host, async () => {
  if (state.autoStartHttpProxy) {
    await state.services.httpProxy.start();
  }
  console.log("Proxy Gateway Console");
  console.log(`  Console:   http://${state.host}:${state.ports.console}/`);
  console.log(`  SOCKS5:    ${state.host}:${state.ports.socks} (when ss-local running)`);
  console.log(`  HTTP Proxy: ${state.host}:${state.ports.httpProxy}`);
  console.log(`  Console Token: ${state.consoleToken}`);
});

process.on("SIGINT", async () => {
  await state.services.ssLocal.stop();
  await state.services.httpProxy.stop();
  server.close(() => process.exit(0));
});

process.on("SIGTERM", async () => {
  await state.services.ssLocal.stop();
  await state.services.httpProxy.stop();
  server.close(() => process.exit(0));
});
```

- [ ] **Step 3: Run full server tests**

Run:

```powershell
npm run test:server
```

Expected:

```text
# fail 0
```

- [ ] **Step 4: Start the server for compatibility smoke check**

Run:

```powershell
npm run server
```

Expected console output includes:

```text
Proxy Gateway Console
Console:   http://127.0.0.1:4077/
HTTP Proxy: 127.0.0.1:18180
Console Token:
```

- [ ] **Step 5: Verify health and auth behavior in a second terminal**

Run:

```powershell
Invoke-RestMethod http://127.0.0.1:4077/api/health
```

Expected:

```text
ok ts authRequired
-- -- ------------
True ... True
```

Run without token:

```powershell
try { Invoke-RestMethod -Method Post http://127.0.0.1:4077/api/proxy/overview } catch { $_.Exception.Response.StatusCode.value__ }
```

Expected:

```text
401
```

- [ ] **Step 6: Commit**

Run:

```powershell
git add server/index.mjs server/state.mjs
git commit -m "refactor: wire modular backend entry point"
```

Expected:

```text
[main
```

## Task 11: Final Phase 1 Verification

**Files:**
- Modify: `docs/API_COMPATIBILITY.md`
- Modify: `docs/MIGRATION.md`

- [ ] **Step 1: Create API compatibility doc**

Create `docs/API_COMPATIBILITY.md`:

```markdown
# API Compatibility

Phase 1 keeps the existing `proxy-gateway-minimal` API surface stable.

Still supported:

- `GET /api/health`
- `POST /api/ss/start`
- `POST /api/ss/stop`
- `POST /api/http-proxy/start`
- `POST /api/http-proxy/stop`
- `POST /api/proxy/start`
- `POST /api/proxy/stop`
- `GET /api/proxy/overview`
- `GET /api/proxy/status`
- `GET /api/proxy/test`
- `GET /api/proxy/servers`
- `GET /api/nginx/status`
- `GET /api/ping/:host`
- `POST /api/system-proxy/:action`
- `POST /api/env-proxy/on`
- `POST /api/env-proxy/off`
- `GET /api/env-proxy/status`
- `POST /api/autostart/on`
- `POST /api/autostart/off`
- `GET /api/autostart/status`

New:

- `GET /api/status`

Control routes require the console token. `GET /api/health` and `GET /proxy.pac` remain public.
```

- [ ] **Step 2: Create migration doc**

Create `docs/MIGRATION.md`:

```markdown
# Migration Notes

Phase 1 modularizes the backend without changing the Windows proxy chain.

Preserved runtime contract:

- Console: `127.0.0.1:4077`
- SOCKS5: `127.0.0.1:1080`
- HTTP proxy: `127.0.0.1:18180`
- Startup command: `npm run server`
- Windows system proxy script: `scripts/proxy.ps1`

The old static UI stays under `public/`. Phase 2 will add a React/Vite UI that consumes `GET /api/status` and reuses the existing control endpoints.
```

- [ ] **Step 3: Run full tests**

Run:

```powershell
npm test
```

Expected:

```text
# fail 0
```

- [ ] **Step 4: Check repository state**

Run:

```powershell
git status --short
```

Expected:

```text
 M docs/API_COMPATIBILITY.md
 M docs/MIGRATION.md
```

- [ ] **Step 5: Commit docs**

Run:

```powershell
git add docs/API_COMPATIBILITY.md docs/MIGRATION.md
git commit -m "docs: document phase one backend compatibility"
```

Expected:

```text
[main
```

- [ ] **Step 6: Final status check**

Run:

```powershell
git status --short
```

Expected:

```text

```

## Self-Review

Spec coverage:

- Current entry points and ports are preserved by Tasks 7, 8, 10, and 11.
- Backend modularization is covered by Tasks 1 through 10.
- Existing API compatibility is covered by Tasks 8, 9, and 11.
- Testing is covered by Tasks 1 through 11.
- Security boundaries are covered by Tasks 1, 3, 4, 9, and 11.
- Out-of-scope platform features remain excluded in the Scope section.

No scan terms from the plan anti-pattern list are intentionally used as unfinished work markers. Type names and function names are consistent across tasks: `createAuthMiddleware`, `isPortListening`, `loadProxyConfig`, `publicProxyConfig`, `allowedDiagnosticHosts`, `runCommand`, `createCommandRunner`, `createSsLocalService`, `createHttpProxyService`, `createRuntimeState`, `createApp`, `legacyProxyRoutes`, `statusRoutes`, `diagnosticsRoutes`, and `systemProxyRoutes`.
