import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const UI_SCRIPT = resolve(
  ROOT,
  "scripts/start-local-coin-commerce-ui-validation.mjs"
);
const PACKAGE_PATH = resolve(ROOT, "package.json");
const OWNED_PREFIX = "coin-commerce-local-validation-";
const SYNTHETIC_LOGIN = "local-ui-validation@example.test";
const SYNTHETIC_PASSWORD =
  "local-only-synthetic-portal-ui-validation-password-v1";
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
const READY_RECORD = {
  type: "coin_commerce_local_ui_validation",
  status: "ready",
  ok: true,
  loopback: true,
  port: 3457,
  temporary: true,
  offerCount: 5,
  spendableUnits: 1000
};
const STOPPED_RECORD = {
  type: "coin_commerce_local_ui_validation",
  status: "stopped",
  ok: true
};
const ERROR_RECORD = {
  type: "coin_commerce_local_ui_validation",
  ok: false,
  error: "local_ui_validation_failed"
};
const SEED_EVIDENCE = {
  coinType: "paid_coins",
  amountUnits: 1000,
  availability: "available",
  sourceRef: "source_local_ui_validation_paid_coins_v1",
  sourceDigest:
    "deace6c9fedc906763a6e35f8b60a1b078aa5d19d8fc9829cd8f426834290216",
  idempotencyKey: "credit_local_ui_validation_paid_coins_v1"
};

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
    code: null,
    signal: null,
    promise: new Promise((resolveReceipt) => {
      resolveClose = resolveReceipt;
    })
  };
  child.once("close", (code, signal) => {
    receipt.closed = true;
    receipt.code = code;
    receipt.signal = signal;
    resolveClose();
  });
  CHILD_CLOSE_RECEIPTS.set(child, receipt);
}

function cleanupKnownChildRoots(child) {
  for (const root of ownedRoots(child.pid)) {
    removeKnownHardKillRoot(root, child.pid);
  }
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
  assert.equal(
    entries.some((entry) => entry.name === "ownership-marker"),
    true
  );
  for (const entry of entries) unlinkSync(resolve(root, entry.name));
  rmdirSync(root);
}

function parseJsonLines(chunks) {
  const text = Buffer.concat(chunks).toString("utf8");
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function startUiCli(env = {}) {
  const child = spawn(process.execPath, [UI_SCRIPT], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"]
  });
  trackChildClose(child);
  const stdout = [];
  const stderr = [];
  const ready = new Promise((resolveReady, rejectReady) => {
    let settled = false;
    let text = "";
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const failAfterClose = (error) => {
      void terminateChildBounded(child).then(
        () => {
          cleanupKnownChildRoots(child);
          finish(rejectReady, error);
        },
        (closeError) => finish(rejectReady, closeError)
      );
    };
    const timer = setTimeout(() => {
      failAfterClose(new Error("UI runner did not emit ready within bound"));
    }, 8_000);
    child.stdout.on("data", (chunk) => {
      stdout.push(chunk);
      text += chunk.toString("utf8");
      const newline = text.indexOf("\n");
      if (newline === -1) return;
      try {
        finish(resolveReady, JSON.parse(text.slice(0, newline)));
      } catch (error) {
        failAfterClose(error);
      }
    });
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", failAfterClose);
    child.once("close", (code) => {
      if (!settled) {
        finish(
          rejectReady,
          new Error(`UI runner exited before ready with code ${code}`)
        );
      }
    });
  });
  return { child, stdout, stderr, ready };
}

function waitForUiCliResult(harness, timeoutMs = 8_000) {
  const { child, stdout, stderr } = harness;
  const receipt = CHILD_CLOSE_RECEIPTS.get(child);
  const result = () => ({
    pid: child.pid,
    code: receipt.code,
    signal: receipt.signal,
    stdout: parseJsonLines(stdout),
    stderr: Buffer.concat(stderr).toString("utf8")
  });
  if (receipt.closed) return Promise.resolve(result());
  return new Promise((resolveResult, rejectResult) => {
    let settled = false;
    let timedOut = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      void terminateChildBounded(child).then(
        () => {
          cleanupKnownChildRoots(child);
          finish(
            rejectResult,
            new Error("UI runner did not close within bound")
          );
        },
        (error) => finish(rejectResult, error)
      );
    }, timeoutMs);
    child.once("error", (error) => {
      void terminateChildBounded(child).then(
        () => {
          cleanupKnownChildRoots(child);
          finish(rejectResult, error);
        },
        (closeError) => finish(rejectResult, closeError)
      );
    });
    child.once("close", () => {
      if (timedOut) return;
      finish(resolveResult, result());
    });
  });
}

function runUiCliWithArguments(args) {
  return new Promise((resolveResult, rejectResult) => {
    const child = spawn(process.execPath, [UI_SCRIPT, ...args], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"]
    });
    trackChildClose(child);
    const stdout = [];
    const stderr = [];
    let settled = false;
    let timedOut = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const failAfterClose = (error) => {
      void terminateChildBounded(child).then(
        () => {
          cleanupKnownChildRoots(child);
          finish(rejectResult, error);
        },
        (closeError) => finish(rejectResult, closeError)
      );
    };
    const timer = setTimeout(() => {
      timedOut = true;
      failAfterClose(new Error("UI runner argument rejection timed out"));
    }, 5_000);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", failAfterClose);
    child.once("close", (code, signal) => {
      if (timedOut) return;
      finish(resolveResult, {
        pid: child.pid,
        code,
        signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        closeConfirmed: CHILD_CLOSE_RECEIPTS.get(child)?.closed === true
      });
    });
  });
}

function listenOnUiPort(server) {
  return new Promise((resolveListen, rejectListen) => {
    const onError = (error) => {
      server.off("listening", onListening);
      rejectListen(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolveListen();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen({ host: "127.0.0.1", port: 3457, exclusive: true });
  });
}

function closeServer(server) {
  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) rejectClose(error);
      else resolveClose();
    });
  });
}

function localHttp(baseUrl, {
  method = "GET",
  path,
  headers = {},
  body
}) {
  const target = new URL(baseUrl);
  return new Promise((resolveResponse, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const request = httpRequest({
      host: target.hostname,
      port: target.port,
      method,
      path,
      headers: {
        Connection: "close",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers
      },
      agent: false
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        try {
          const text = Buffer.concat(chunks).toString("utf8");
          finish(resolveResponse, {
            status: response.statusCode,
            json: text ? JSON.parse(text) : null
          });
        } catch (error) {
          finish(reject, error);
        }
      });
      response.once("aborted", () => {
        finish(reject, new Error("local UI validation response aborted"));
      });
      response.once("error", (error) => finish(reject, error));
    });
    const timer = setTimeout(() => {
      request.destroy(new Error("local UI validation request timed out"));
    }, 5_000);
    request.once("error", (error) => finish(reject, error));
    if (body === undefined) request.end();
    else request.end(JSON.stringify(body));
  });
}

function solveSyntheticMathPrompt(prompt) {
  const match = /^(\d+) \+ (\d+) = \?$/.exec(String(prompt));
  assert.ok(match);
  return String(Number(match[1]) + Number(match[2]));
}

async function passwordLogin(baseUrl) {
  const challenge = await localHttp(baseUrl, {
    method: "POST",
    path: "/api/portal/human-challenges",
    body: { scope: "portal_login" }
  });
  assert.equal(challenge.status, 201);
  const loggedIn = await localHttp(baseUrl, {
    method: "POST",
    path: "/api/portal/password/session",
    body: {
      accountId: SYNTHETIC_LOGIN,
      plainPassword: SYNTHETIC_PASSWORD,
      humanVerification: {
        challengeRef: challenge.json.challenge.challengeRef,
        answer: solveSyntheticMathPrompt(challenge.json.challenge.prompt)
      }
    }
  });
  assert.equal(loggedIn.status, 200);
  assert.equal(loggedIn.json.session.authMethod, "password");
  assert.match(
    loggedIn.json.session.sessionRef,
    /^portal_session_[a-zA-Z0-9_-]+$/
  );
  assert.equal(JSON.stringify(loggedIn.json).includes(SYNTHETIC_PASSWORD), false);
  return loggedIn.json.session.sessionRef;
}

async function moduleUnderTest() {
  return import(
    `../../scripts/start-local-coin-commerce-validation.mjs?ui=${Date.now()}_${Math.random()}`
  );
}

test("fixed UI profile uses real password auth, five offers, and reversible 20-Coin hold", async () => {
  const before = ownedRoots();
  const module = await moduleUnderTest();
  assert.equal(typeof module.startLocalCoinCommerceUiValidation, "function");
  const handle = await module.startLocalCoinCommerceUiValidation();
  try {
    assert.equal(Object.isFrozen(handle), true);
    assert.deepEqual(Reflect.ownKeys(handle), [
      "baseUrl",
      "ownedTempRoot",
      "runCoordinatorOnce",
      "inspect",
      "stop"
    ]);
    assert.equal(handle.baseUrl, "http://127.0.0.1:3457");
    assert.deepEqual(handle.inspect().funds, {
      status: "active",
      spendableUnits: 1000,
      heldUnits: 0,
      pendingUnits: 0
    });
    assert.deepEqual(handle.inspect().seed, SEED_EVIDENCE);

    const sessionRef = await passwordLogin(handle.baseUrl);
    const sessionHeaders = { "X-Portal-Session": sessionRef };
    const catalog = await localHttp(handle.baseUrl, {
      path: "/api/portal/catalog/offers",
      headers: sessionHeaders
    });
    assert.equal(catalog.status, 200);
    assert.equal(catalog.json.offers.length, 5);
    const offersWithPrices = await Promise.all(
      catalog.json.offers.map(async (offer) => {
        const quote = await localHttp(handle.baseUrl, {
          method: "POST",
          path: "/api/portal/commerce/checkout-preview",
          headers: sessionHeaders,
          body: { offerRef: offer.offerRef }
        });
        assert.equal(quote.status, 200);
        return { offer, quote: quote.json.quote };
      })
    );
    assert.deepEqual(
      offersWithPrices
        .map(({ offer, quote }) => ({
          baseCoinUnits: quote.amountUnits,
          kind: offer.delivery.kind,
          durationDays: offer.delivery.durationDays,
          monthlyTrafficGb: offer.delivery.monthlyTrafficGb,
          trafficGb: offer.delivery.trafficGb,
          neverExpires: offer.delivery.neverExpires,
          discountBasisPoints: offer.delivery.discountBasisPoints
        }))
        .sort((left, right) => (
          left.kind.localeCompare(right.kind)
          || left.baseCoinUnits - right.baseCoinUnits
        )),
      [
        {
          baseCoinUnits: 30,
          kind: "data_pack",
          durationDays: null,
          monthlyTrafficGb: null,
          trafficGb: 100,
          neverExpires: true,
          discountBasisPoints: null
        },
        {
          baseCoinUnits: 50,
          kind: "data_pack",
          durationDays: null,
          monthlyTrafficGb: null,
          trafficGb: 200,
          neverExpires: true,
          discountBasisPoints: null
        },
        {
          baseCoinUnits: 20,
          kind: "subscription_plan",
          durationDays: 30,
          monthlyTrafficGb: 50,
          trafficGb: null,
          neverExpires: false,
          discountBasisPoints: 500
        },
        {
          baseCoinUnits: 30,
          kind: "subscription_plan",
          durationDays: 30,
          monthlyTrafficGb: 100,
          trafficGb: null,
          neverExpires: false,
          discountBasisPoints: 1000
        },
        {
          baseCoinUnits: 200,
          kind: "subscription_plan",
          durationDays: 365,
          monthlyTrafficGb: 200,
          trafficGb: null,
          neverExpires: false,
          discountBasisPoints: 2000
        }
      ]
    );

    const monthly20 = offersWithPrices.find(
      ({ quote, offer }) => quote.amountUnits === 20
        && offer.delivery.kind === "subscription_plan"
    );
    assert.ok(monthly20);
    const held = await localHttp(handle.baseUrl, {
      method: "POST",
      path: "/api/portal/commerce/orders",
      headers: {
        ...sessionHeaders,
        "Idempotency-Key": "ui_validation_hold_v1"
      },
      body: { quoteRef: monthly20.quote.quoteRef }
    });
    assert.equal(held.status, 201);
    assert.equal(held.json.order.paymentStatus, "held");
    const cancelWindowMs =
      Date.parse(held.json.order.cancelUntil) - Date.parse(held.json.order.createdAt);
    assert.equal(cancelWindowMs, 3000);
    assert.deepEqual(handle.inspect().funds, {
      status: "active",
      spendableUnits: 980,
      heldUnits: 20,
      pendingUnits: 0
    });

    const cancelled = await localHttp(handle.baseUrl, {
      method: "POST",
      path: `/api/portal/commerce/orders/${held.json.order.orderRef}/cancel`,
      headers: {
        ...sessionHeaders,
        "Idempotency-Key": "ui_validation_cancel_v1"
      },
      body: {}
    });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.json.order.paymentStatus, "cancelled");
    assert.deepEqual(handle.inspect().funds, {
      status: "active",
      spendableUnits: 1000,
      heldUnits: 0,
      pendingUnits: 0
    });

    const noCreditEndpoint = await localHttp(handle.baseUrl, {
      method: "POST",
      path: "/api/portal/commerce/credit",
      headers: sessionHeaders,
      body: { amountUnits: 1 }
    });
    assert.equal([401, 404].includes(noCreditEndpoint.status), true);
    assert.deepEqual(handle.inspect().funds, {
      status: "active",
      spendableUnits: 1000,
      heldUnits: 0,
      pendingUnits: 0
    });
  } finally {
    await handle.stop();
  }
  assert.deepEqual(ownedRoots(), before);
});

test("UI stop removes only its exact marker-owned root", async () => {
  const unrelatedRoot = mkdtempSync(join(tmpdir(), "coin-ui-unrelated-"));
  const unrelatedChild = join(unrelatedRoot, "keep");
  mkdirSync(unrelatedChild);
  writeFileSync(join(unrelatedChild, "sentinel"), "keep", "utf8");
  const module = await moduleUnderTest();
  const handle = await module.startLocalCoinCommerceUiValidation();
  try {
    assert.equal(existsSync(handle.ownedTempRoot), true);
    await handle.stop();
    assert.equal(existsSync(handle.ownedTempRoot), false);
    assert.equal(
      readFileSync(join(unrelatedChild, "sentinel"), "utf8"),
      "keep"
    );
  } finally {
    await handle.stop();
    rmSync(unrelatedRoot, { recursive: true, force: true });
  }
});

test("UI runner is a fixed no-argument long-running package command", () => {
  assert.equal(existsSync(UI_SCRIPT), true);
  const packageJson = JSON.parse(readFileSync(PACKAGE_PATH, "utf8"));
  assert.equal(
    packageJson.scripts?.["platform:coin-commerce:local-ui-validation"],
    "node scripts/start-local-coin-commerce-ui-validation.mjs"
  );
});

test("UI start rejects every direct argument without acquiring an owned root", async () => {
  const before = ownedRoots();
  const module = await moduleUnderTest();
  for (const argument of [
    undefined,
    {},
    { port: 3457 },
    { amountUnits: 1000 },
    { accountId: "acct_local_ui_validation" },
    { dbPath: "local.sqlite" }
  ]) {
    await assert.rejects(
      module.startLocalCoinCommerceUiValidation(argument)
    );
    assert.deepEqual(ownedRoots(), before);
  }
});

test("UI start ignores hostile ambient runtime and storage settings", async () => {
  const original = {
    HOST: process.env.HOST,
    PORT: process.env.PORT,
    CONSOLE_PORT: process.env.CONSOLE_PORT,
    SUBSCRIPTION_CONTROL_DB_PATH: process.env.SUBSCRIPTION_CONTROL_DB_PATH,
    COINS_COMMERCE_ENABLED: process.env.COINS_COMMERCE_ENABLED,
    USER_PORTAL_ALLOW_PASSWORD_ONLY_SETUP_SESSION:
      process.env.USER_PORTAL_ALLOW_PASSWORD_ONLY_SETUP_SESSION
  };
  Object.assign(process.env, {
    HOST: "0.0.0.0",
    PORT: "1",
    CONSOLE_PORT: "1",
    SUBSCRIPTION_CONTROL_DB_PATH: "ambient-ui-canary.sqlite",
    COINS_COMMERCE_ENABLED: "false",
    USER_PORTAL_ALLOW_PASSWORD_ONLY_SETUP_SESSION: "false"
  });
  let handle;
  try {
    const module = await moduleUnderTest();
    handle = await module.startLocalCoinCommerceUiValidation();
    assert.equal(handle.baseUrl, "http://127.0.0.1:3457");
    assert.deepEqual(handle.inspect().funds, {
      status: "active",
      spendableUnits: 1000,
      heldUnits: 0,
      pendingUnits: 0
    });
    assert.deepEqual(handle.inspect().seed, SEED_EVIDENCE);
  } finally {
    await handle?.stop();
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("POSIX UI CLI signals emit one safe stopped record after exact cleanup", {
  skip: process.platform === "win32"
}, async (context) => {
  for (const signal of ["SIGINT", "SIGTERM"]) {
    await context.test(signal, async () => {
      const harness = startUiCli();
      try {
        assert.deepEqual(await harness.ready, READY_RECORD);
        assert.equal(ownedRoots(harness.child.pid).size, 1);
        harness.child.kill(signal);
        const result = await waitForUiCliResult(harness);
        assert.equal(result.code, 0);
        assert.equal(result.signal, null);
        assert.equal(result.stderr, "");
        assert.deepEqual(result.stdout, [READY_RECORD, STOPPED_RECORD]);
        assert.equal(ownedRoots(result.pid).size, 0);
      } finally {
        await terminateChildBounded(harness.child);
      }
    });
  }
});

test("Windows UI CLI hard termination proves containment, not graceful cleanup", {
  skip: process.platform !== "win32"
}, async () => {
  const harness = startUiCli({
    HOST: "0.0.0.0",
    PORT: "1",
    SUBSCRIPTION_CONTROL_DB_PATH: "ambient-ui-child-canary.sqlite"
  });
  let ownedRoot;
  try {
    assert.deepEqual(await harness.ready, READY_RECORD);
    const roots = [...ownedRoots(harness.child.pid)];
    assert.equal(roots.length, 1);
    [ownedRoot] = roots;
    harness.child.kill("SIGKILL");
    assert.equal(await waitForChildClose(harness.child, 1_000), true);
    assert.equal(CHILD_CLOSE_RECEIPTS.get(harness.child)?.closed, true);
    assert.equal(existsSync(ownedRoot), true);
    assert.deepEqual(parseJsonLines(harness.stdout), [READY_RECORD]);
    assert.equal(Buffer.concat(harness.stderr).toString("utf8"), "");
  } finally {
    await terminateChildBounded(harness.child);
    if (ownedRoot && existsSync(ownedRoot)) {
      removeKnownHardKillRoot(ownedRoot, harness.child.pid);
    }
  }
  assert.equal(existsSync(ownedRoot), false);
});

test("UI runner rejects arbitrary runtime arguments without echoing them", async () => {
  const result = await runUiCliWithArguments(["--port=1"]);
  assert.notEqual(result.code, 0);
  assert.equal(result.signal, null);
  assert.equal(result.closeConfirmed, true);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr.includes("--port=1"), false);
  assert.equal(result.stderr.includes(SYNTHETIC_LOGIN), false);
  assert.equal(result.stderr.includes(SYNTHETIC_PASSWORD), false);
  assert.equal(ownedRoots(result.pid).size, 0);
});

test("UI runner startup error closes its real child and owned root safely", async () => {
  const blocker = createServer((_request, response) => {
    response.statusCode = 503;
    response.end();
  });
  await listenOnUiPort(blocker);
  try {
    const result = await runUiCliWithArguments([]);
    assert.notEqual(result.code, 0);
    assert.equal(result.signal, null);
    assert.equal(result.closeConfirmed, true);
    assert.equal(result.stdout, "");
    assert.deepEqual(
      result.stderr
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
      [ERROR_RECORD]
    );
    assert.equal(ownedRoots(result.pid).size, 0);
  } finally {
    await closeServer(blocker);
  }
});

test("UI runner timeout harness awaits child close and exact root cleanup", async () => {
  const harness = startUiCli();
  assert.deepEqual(await harness.ready, READY_RECORD);
  assert.equal(ownedRoots(harness.child.pid).size, 1);
  await assert.rejects(
    waitForUiCliResult(harness, 25),
    /did not close within bound/
  );
  assert.equal(CHILD_CLOSE_RECEIPTS.get(harness.child)?.closed, true);
  assert.equal(ownedRoots(harness.child.pid).size, 0);
});
