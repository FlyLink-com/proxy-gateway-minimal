import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmdirSync, unlinkSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const SCRIPT = resolve(ROOT, "scripts/start-local-coin-commerce-validation.mjs");
const PACKAGE_PATH = resolve(ROOT, "package.json");
const SCHEMA_GATE_PATH = resolve(ROOT, "docs/COINS_COMMERCE_SCHEMA_GATE.md");
const OWNED_PREFIX = "coin-commerce-local-validation-";
const FAILURE_STAGES = [
  "after_base_schema",
  "after_wallet_migration",
  "after_commerce_migration",
  "after_seed",
  "after_listen",
  "after_coordinator_start"
];
const HARD_KILL_FILES = new Set([
  "ownership-marker",
  "proxy-config.json",
  "control.sqlite",
  "control.sqlite-shm",
  "control.sqlite-wal",
  "subscriptions.sqlite",
  "subscriptions.sqlite-shm",
  "subscriptions.sqlite-wal"
]);
const CHILD_CLOSE_RECEIPTS = new WeakMap();

function ownedRoots(ownerPid = process.pid) {
  const processPrefix = `${OWNED_PREFIX}p${ownerPid}-`;
  return new Set(readdirSync(tmpdir(), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(processPrefix))
    .map((entry) => resolve(tmpdir(), entry.name)));
}

function trackChildClose(child) {
  let resolveClose;
  const receipt = {
    closed: false,
    promise: new Promise((resolveReceipt) => {
      resolveClose = resolveReceipt;
    })
  };
  child.once("close", () => {
    receipt.closed = true;
    resolveClose();
  });
  CHILD_CLOSE_RECEIPTS.set(child, receipt);
  return receipt;
}

function waitForChildClose(child, timeoutMs) {
  const receipt = CHILD_CLOSE_RECEIPTS.get(child);
  if (!receipt) throw new Error("child close receipt was not established");
  if (receipt.closed) return Promise.resolve(true);
  return new Promise((resolveClose) => {
    const timer = setTimeout(() => resolveClose(false), timeoutMs);
    receipt.promise.then(() => {
      clearTimeout(timer);
      resolveClose(true);
    });
  });
}

async function terminateChildBounded(child) {
  if (CHILD_CLOSE_RECEIPTS.get(child)?.closed) return;
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
  }
  if (await waitForChildClose(child, 500)) return;
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
  }
  if (!await waitForChildClose(child, 1_000)) {
    throw new Error("child process did not terminate within the hard bound");
  }
}

function removeKnownHardKillRoot(root, ownerPid) {
  assert.equal(resolve(root, ".."), resolve(tmpdir()));
  assert.equal(
    root.split(/[\\/]/).at(-1).startsWith(`${OWNED_PREFIX}p${ownerPid}-`),
    true
  );
  const entries = readdirSync(root, { withFileTypes: true });
  assert.equal(entries.some((entry) => entry.isDirectory()), false);
  for (const entry of entries) {
    assert.equal(HARD_KILL_FILES.has(entry.name), true, entry.name);
    assert.equal(entry.isFile(), true, entry.name);
  }
  assert.equal(entries.some((entry) => entry.name === "ownership-marker"), true);
  for (const entry of entries) unlinkSync(resolve(root, entry.name));
  rmdirSync(root);
}

async function moduleUnderTest() {
  return import(`../../scripts/start-local-coin-commerce-validation.mjs?test=${Date.now()}_${Math.random()}`);
}

async function start(options) {
  const module = await moduleUnderTest();
  assert.equal(typeof module.startLocalCoinCommerceValidation, "function");
  return module.startLocalCoinCommerceValidation(options);
}

function assertSafeHandle(handle) {
  assert.equal(Object.isFrozen(handle), true);
  assert.deepEqual(Reflect.ownKeys(handle), [
    "baseUrl",
    "portalHeaders",
    "ownedTempRoot",
    "runCoordinatorOnce",
    "inspect",
    "stop"
  ]);
  assert.match(handle.baseUrl, /^http:\/\/127\.0\.0\.1:[1-9][0-9]*$/);
  assert.equal(typeof handle.portalHeaders, "object");
  assert.equal(Object.isFrozen(handle.portalHeaders), true);
  assert.deepEqual(Reflect.ownKeys(handle.portalHeaders), ["funded", "emptyWallet"]);
  for (const header of Object.values(handle.portalHeaders)) {
    assert.deepEqual(Reflect.ownKeys(header), ["X-Portal-Session"]);
    assert.match(header["X-Portal-Session"], /^session_[a-zA-Z0-9_-]{16,}$/);
  }
  for (const field of ["runCoordinatorOnce", "inspect", "stop"]) {
    assert.equal(typeof handle[field], "function", field);
  }
  assert.equal("consoleToken" in handle, false);
  assert.equal("state" in handle, false);
  assert.equal("store" in handle, false);
  assert.equal("database" in handle, false);
}

async function withHandle(fn, options) {
  const handle = await start(options);
  try {
    return await fn(handle);
  } finally {
    await handle.stop();
  }
}

function startHardKillHarness() {
  const source = [
    `import { startLocalCoinCommerceValidation } from ${JSON.stringify(new URL("../../scripts/start-local-coin-commerce-validation.mjs", import.meta.url).href)};`,
    "const handle = await startLocalCoinCommerceValidation();",
    "process.stdout.write(`${handle.ownedTempRoot}\\n`);",
    "setInterval(() => {}, 1_000);"
  ].join(" ");
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "--eval", source], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"]
    });
    trackChildClose(child);
    let stdout = "";
    let settled = false;
    let timedOut = false;
    let timer;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    timer = setTimeout(() => {
      timedOut = true;
      void terminateChildBounded(child).then(
        () => finish(reject, new Error("hard-kill containment harness did not start")),
        (error) => finish(reject, error)
      );
    }, 8_000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (!stdout.includes("\n")) return;
      finish(resolveResult, {
        child,
        ownerPid: child.pid,
        ownedTempRoot: resolve(stdout.split("\n")[0])
      });
    });
    child.stderr.on("data", () => {});
    child.once("error", (error) => finish(reject, error));
    child.once("close", (code) => {
      if (timedOut) return;
      if (!stdout.includes("\n")) {
        finish(reject, new Error(`hard-kill containment harness exited before readiness: ${code}`));
      }
    });
  });
}

function runCli(args = [], env = {}) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    trackChildClose(child);
    const stdout = [];
    const stderr = [];
    let settled = false;
    let timedOut = false;
    let timer;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    timer = setTimeout(() => {
      timedOut = true;
      void terminateChildBounded(child).then(
        () => finish(reject, new Error("local validation CLI timed out")),
        (error) => finish(reject, error)
      );
    }, 12_000);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", (error) => finish(reject, error));
    child.once("close", (code, signal) => {
      if (timedOut) return;
      finish(resolveResult, {
        pid: child.pid,
        code,
        signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8")
      });
    });
  });
}

function runCatchableSignalCli(signal) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [SCRIPT], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"]
    });
    trackChildClose(child);
    const stdout = [];
    const stderr = [];
    let settled = false;
    let timedOut = false;
    let rootPoll;
    let timeout;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearInterval(rootPoll);
      clearTimeout(timeout);
      fn(value);
    };
    rootPoll = setInterval(() => {
      if (ownedRoots(child.pid).size !== 1) return;
      clearInterval(rootPoll);
      child.kill(signal);
    }, 15);
    timeout = setTimeout(() => {
      timedOut = true;
      void terminateChildBounded(child).then(
        () => finish(reject, new Error("catchable-signal CLI did not settle")),
        (error) => finish(reject, error)
      );
    }, 8_000);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", (error) => finish(reject, error));
    child.once("close", (code, receivedSignal) => {
      if (timedOut) return;
      finish(resolveResult, {
        pid: child.pid,
        code,
        signal: receivedSignal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8")
      });
    });
  });
}

function localHttp(baseUrl, { method = "GET", path, headers = {}, body } = {}) {
  const target = new URL(baseUrl);
  return new Promise((resolveResponse, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const request = httpRequest({
      host: target.hostname,
      port: target.port,
      method,
      path,
      headers: { Connection: "close", ...headers },
      agent: false
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        try {
          const text = Buffer.concat(chunks).toString("utf8");
          finish(resolveResponse, { status: response.statusCode, json: text ? JSON.parse(text) : null });
        } catch (error) {
          finish(reject, error);
        }
      });
      response.once("aborted", () => finish(reject, new Error(`local HTTP response aborted: ${path}`)));
      response.once("error", (error) => finish(reject, error));
    });
    const timer = setTimeout(() => {
      request.destroy(new Error(`local HTTP request timed out: ${path}`));
    }, 5_000);
    request.once("error", (error) => finish(reject, error));
    if (body === undefined) request.end();
    else request.end(JSON.stringify(body));
  });
}

async function waitThroughCancelWindow(handle, orderRef) {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const response = await localHttp(handle.baseUrl, {
      path: `/api/portal/commerce/orders/${orderRef}`,
      headers: handle.portalHeaders.funded
    });
    const cancelUntil = Date.parse(response.json?.order?.cancelUntil || "");
    if (Number.isFinite(cancelUntil) && Date.now() >= cancelUntil) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 20));
  }
  throw new Error("synthetic cancel window did not elapse within bound");
}

test("importing the local validation module has no temporary-root or listener side effect", async () => {
  const before = ownedRoots();
  const module = await moduleUnderTest();
  assert.equal(typeof module.startLocalCoinCommerceValidation, "function");
  assert.deepEqual(ownedRoots(), before);
});

test("package command and schema gate document the closed local synthetic validation boundary", () => {
  const packageJson = JSON.parse(readFileSync(PACKAGE_PATH, "utf8"));
  assert.equal(
    packageJson.scripts?.["platform:coin-commerce:local-validation"],
    "node scripts/start-local-coin-commerce-validation.mjs"
  );
  const schemaGate = readFileSync(SCHEMA_GATE_PATH, "utf8");
  assert.match(schemaGate, /^## Local synthetic validation$/m);
  assert.match(schemaGate, /npm run platform:coin-commerce:local-validation/);
  for (const marker of [/temporary/i, /loopback/i, /synthetic/i, /not production/i]) {
    assert.match(schemaGate, marker);
  }
});

test("start factory accepts only an exact empty object or the closed failure-stage enum", async () => {
  for (const invalid of [null, [], { host: "127.0.0.1" }, { port: 1 }, { env: {} }, { failureStage: "listen" }, { failureStage: FAILURE_STAGES[0], extra: true }]) {
    await assert.rejects(start(invalid));
  }
  await withHandle(async (handle) => assertSafeHandle(handle), {});
});

test("owned harness has an immediate temp child, marker-contained paths, IPv4 listener, and unique CSPRNG sessions", async () => {
  const before = ownedRoots();
  let firstHeaders;
  await withHandle(async (handle) => {
    assertSafeHandle(handle);
    assert.equal(resolve(handle.ownedTempRoot), handle.ownedTempRoot);
    assert.equal(resolve(handle.ownedTempRoot, ".."), resolve(tmpdir()));
    assert.equal(handle.ownedTempRoot.startsWith(`${resolve(tmpdir())}\\`) || handle.ownedTempRoot.startsWith(`${resolve(tmpdir())}/`), true);
    assert.equal(handle.ownedTempRoot.split(/[\\/]/).at(-1).startsWith(OWNED_PREFIX), true);
    assert.deepEqual([...ownedRoots()].filter((root) => !before.has(root)), [handle.ownedTempRoot]);
    assert.equal(readdirSync(handle.ownedTempRoot).some((name) => /ownership|marker/i.test(name)), true);
    firstHeaders = structuredClone(handle.portalHeaders);
  });
  assert.equal([...ownedRoots()].some((root) => !before.has(root)), false);
  await withHandle(async (handle) => {
    assert.notEqual(handle.portalHeaders.funded["X-Portal-Session"], firstHeaders.funded["X-Portal-Session"]);
    assert.notEqual(handle.portalHeaders.emptyWallet["X-Portal-Session"], firstHeaders.emptyWallet["X-Portal-Session"]);
  });
});

test("Windows hard termination asserts only exact owned-root containment, never successful cleanup", { skip: process.platform !== "win32" }, async () => {
  const { child, ownerPid, ownedTempRoot } = await startHardKillHarness();
  try {
    assert.equal(resolve(ownedTempRoot, ".."), resolve(tmpdir()));
    assert.equal(
      ownedTempRoot.split(/[\\/]/).at(-1).startsWith(
        `${OWNED_PREFIX}p${ownerPid}-`
      ),
      true
    );
    child.kill("SIGKILL");
    if (!await waitForChildClose(child, 1_000)) {
      await terminateChildBounded(child);
    }
    assert.equal(CHILD_CLOSE_RECEIPTS.get(child)?.closed, true);
    assert.equal(existsSync(ownedTempRoot), true);
  } finally {
    if (existsSync(ownedTempRoot)) {
      removeKnownHardKillRoot(ownedTempRoot, ownerPid);
    }
  }
});

test("ambient hostile runtime settings are ignored rather than inherited", async () => {
  const original = {
    HOST: process.env.HOST,
    PORT: process.env.PORT,
    CONSOLE_PORT: process.env.CONSOLE_PORT,
    SUBSCRIPTION_CONTROL_DB_PATH: process.env.SUBSCRIPTION_CONTROL_DB_PATH,
    COINS_COMMERCE_ENABLED: process.env.COINS_COMMERCE_ENABLED
  };
  Object.assign(process.env, {
    HOST: "0.0.0.0",
    PORT: "1",
    CONSOLE_PORT: "1",
    SUBSCRIPTION_CONTROL_DB_PATH: "ambient-canary.sqlite",
    COINS_COMMERCE_ENABLED: "false"
  });
  try {
    await withHandle(async (handle) => assertSafeHandle(handle));
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("each closed startup failure stage removes only its owned temporary root", async () => {
  const module = await moduleUnderTest();
  assert.equal(typeof module.startLocalCoinCommerceValidation, "function");
  for (const failureStage of FAILURE_STAGES) {
    const before = ownedRoots();
    await assert.rejects(start({ failureStage }));
    assert.deepEqual(ownedRoots(), before, failureStage);
  }
});

test("concurrent stop shares cleanup and closes an owned stalled socket within a bound", async () => {
  const before = ownedRoots();
  const handle = await start();
  const target = new URL(handle.baseUrl);
  const socket = connect({ host: target.hostname, port: Number(target.port) });
  try {
    await new Promise((resolveConnect, reject) => {
      socket.once("connect", resolveConnect);
      socket.once("error", reject);
    });
    await Promise.race([
      Promise.all([handle.stop(), handle.stop(), handle.stop()]),
      new Promise((_, reject) => setTimeout(() => reject(new Error("stop did not settle")), 5_000))
    ]);
    assert.equal(existsSync(handle.ownedTempRoot), false);
    assert.deepEqual(ownedRoots(), before);
  } finally {
    socket.destroy();
    await handle.stop();
  }
});

test("stop waits for the safe aggregate fulfillment-in-flight count before deleting its owned root", async () => {
  const handle = await start();
  try {
    const catalog = await localHttp(handle.baseUrl, {
      path: "/api/portal/catalog/offers",
      headers: handle.portalHeaders.funded
    });
    assert.equal(catalog.status, 200);
    const offerRef = catalog.json.offers[0].offerRef;
    const quote = await localHttp(handle.baseUrl, {
      method: "POST",
      path: "/api/portal/commerce/checkout-preview",
      headers: { ...handle.portalHeaders.funded, "Content-Type": "application/json" },
      body: { offerRef }
    });
    const held = await localHttp(handle.baseUrl, {
      method: "POST",
      path: "/api/portal/commerce/orders",
      headers: {
        ...handle.portalHeaders.funded,
        "Content-Type": "application/json",
        "Idempotency-Key": "stop-while-fulfilling-1"
      },
      body: { quoteRef: quote.json.quote.quoteRef }
    });
    assert.equal(held.status, 201);
    await waitThroughCancelWindow(handle, held.json.order.orderRef);
    const runOnce = handle.runCoordinatorOnce();
    const deadline = Date.now() + 2_000;
    while (handle.inspect().fulfillmentInFlight !== 1 && Date.now() < deadline) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
    }
    assert.equal(handle.inspect().fulfillmentInFlight, 1);
    let stopSettled = false;
    const stopping = handle.stop().then(() => { stopSettled = true; });
    await Promise.resolve();
    assert.equal(existsSync(handle.ownedTempRoot), true);
    assert.equal(stopSettled, false);
    await Promise.all([runOnce, stopping]);
    assert.equal(existsSync(handle.ownedTempRoot), false);
  } finally {
    await handle.stop();
  }
});

test("one-shot CLI emits only the closed aggregate after cleanup and rejects all runtime arguments safely", async () => {
  const success = await runCli([], {
    HOST: "0.0.0.0",
    PORT: "1",
    CONSOLE_PORT: "1",
    SUBSCRIPTION_CONTROL_DB_PATH: "ambient-control-canary.sqlite"
  });
  assert.equal(success.code, 0);
  assert.equal(success.signal, null);
  assert.equal(success.stderr, "");
  assert.deepEqual(JSON.parse(success.stdout), {
    type: "coin_commerce_local_validation",
    ok: true,
    loopback: true,
    temporary: true,
    checks: {
      catalog: true,
      quote: true,
      hold: true,
      capture: true,
      fulfillment: true,
      cancellation: true,
      insufficientBalance: true,
      cleanup: true
    }
  });
  assert.equal(ownedRoots(success.pid).size, 0);
  for (const argument of ["--host=0.0.0.0", "--port=1", "--session=canary", "--provider=canary", "--db=canary.sqlite", "--failure-stage=after_seed"]) {
    const result = await runCli([argument]);
    assert.notEqual(result.code, 0, argument);
    assert.equal(result.stdout.includes("canary"), false, argument);
    assert.equal(result.stderr.includes("canary"), false, argument);
    assert.equal(ownedRoots(result.pid).size, 0, argument);
  }
});

test("catchable POSIX signals follow the one-shot cleanup path", { skip: process.platform === "win32" }, async () => {
  assert.equal(existsSync(SCRIPT), true);
  for (const signal of ["SIGINT", "SIGTERM"]) {
    const result = await runCatchableSignalCli(signal);
    assert.equal(result.signal, null, signal);
    assert.notEqual(result.code, 0, signal);
    assert.equal(result.stdout, "", signal);
    assert.equal(result.stderr, `${JSON.stringify({
      type: "coin_commerce_local_validation",
      ok: false,
      error: "local_validation_failed"
    })}\n`, signal);
    assert.equal(ownedRoots(result.pid).size, 0, signal);
  }
});
