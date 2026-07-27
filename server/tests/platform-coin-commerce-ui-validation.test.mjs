import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { request as httpRequest } from "node:http";
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

function ownedRoots(ownerPid = process.pid) {
  const processPrefix = `${OWNED_PREFIX}p${ownerPid}-`;
  return new Set(readdirSync(tmpdir(), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(processPrefix))
    .map((entry) => resolve(tmpdir(), entry.name)));
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

test("UI runner rejects arbitrary runtime arguments without echoing them", async () => {
  const result = await new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [UI_SCRIPT, "--port=1"], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("UI runner argument rejection timed out"));
    }, 5_000);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      resolveResult({
        code,
        signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8")
      });
    });
  });
  assert.notEqual(result.code, 0);
  assert.equal(result.signal, null);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr.includes("--port=1"), false);
  assert.equal(result.stderr.includes(SYNTHETIC_LOGIN), false);
  assert.equal(result.stderr.includes(SYNTHETIC_PASSWORD), false);
});
