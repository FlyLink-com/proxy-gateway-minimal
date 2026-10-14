import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import * as harness from "../../../scripts/start-local-coin-commerce-validation.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const ENTRY = resolve(ROOT, "scripts/start-local-coin-commerce-ui-validation.mjs");
const PREFIX = `coin-commerce-local-validation-p${process.pid}-`;
// Synthetic fixture credentials only; never log them or session responses.
const LOGIN = "local-ui-validation@example.test";
const PASSWORD = "local-only-synthetic-portal-ui-validation-password-v1";

function roots() {
  return readdirSync(tmpdir()).filter((name) => name.startsWith(PREFIX)).sort();
}

async function request(handle, path, { session, body, key } = {}) {
  const response = await fetch(`${handle.baseUrl}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Connection: "close",
      ...(session ? { "X-Portal-Session": session } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(key ? { "Idempotency-Key": key } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(5000)
  });
  return { status: response.status, body: await response.json() };
}

async function login(handle) {
  const challenge = await request(handle, "/api/portal/human-challenges", {
    body: { scope: "portal_login" }
  });
  assert.equal(challenge.status, 201);
  const numbers = /^(\d+) \+ (\d+) = \?$/.exec(challenge.body.challenge.prompt);
  assert.ok(numbers, "real local challenge must be present");
  const result = await request(handle, "/api/portal/password/session", {
    body: {
      accountId: LOGIN,
      plainPassword: PASSWORD,
      humanVerification: {
        challengeRef: challenge.body.challenge.challengeRef,
        answer: String(Number(numbers[1]) + Number(numbers[2]))
      }
    }
  });
  assert.equal(result.status, 200);
  return result.body.session.sessionRef;
}

async function settle(handle, session, order) {
  const wait = Math.max(0, Date.parse(order.cancelUntil) - Date.now()) + 100;
  await new Promise((done) => setTimeout(done, wait));
  await handle.runCoordinatorOnce();
  const result = await request(handle, `/api/portal/commerce/orders/${order.orderRef}`, { session });
  assert.equal(result.status, 200);
  assert.equal(result.body.order.paymentStatus, "captured");
  assert.equal(result.body.order.fulfillment.status, "delivered");
}

test("plan-switch UI profile rejects arguments and the CLI rejects unknown profiles before startup", async () => {
  const before = roots();
  assert.equal(typeof harness.startLocalCoinCommercePlanSwitchUiValidation, "function");
  for (const argument of [undefined, {}, { dbPath: "not-allowed" }, "plan-switch"]) {
    await assert.rejects(harness.startLocalCoinCommercePlanSwitchUiValidation(argument));
  }
  for (const args of [["--profile=unknown"], ["--profile=plan-switch", "--db-path=ignored"]]) {
    const child = spawnSync(process.execPath, [ENTRY, ...args], {
      cwd: ROOT, encoding: "utf8", timeout: 10000
    });
    assert.equal(child.status, 1);
    assert.equal(child.stdout, "");
    assert.equal(JSON.parse(child.stderr).error, "local_ui_validation_failed");
  }
  assert.deepEqual(roots(), before);
});

test("default UI profile remains feature-off with its existing five-offer catalog", async () => {
  const before = roots();
  const handle = await harness.startLocalCoinCommerceUiValidation();
  const root = handle.ownedTempRoot;
  try {
    const session = await login(handle);
    const state = await request(handle, "/api/portal/commerce/plan-switch/state", { session });
    // Not registered when off; the full app's protected fallback returns 401.
    assert.equal(state.status, 401);
    const catalog = await request(handle, "/api/portal/catalog/offers", { session });
    assert.equal(catalog.status, 200);
    assert.equal(catalog.body.offers.length, 5);
    assert.equal(Object.hasOwn(handle.inspect(), "planSwitch"), false);
  } finally {
    await handle.stop();
  }
  assert.equal(existsSync(root), false);
  assert.deepEqual(roots(), before);
});

test("occupied loopback port refuses the new profile and removes only its attempted root", async () => {
  const handle = await harness.startLocalCoinCommerceUiValidation();
  const before = roots();
  try {
    await assert.rejects(harness.startLocalCoinCommercePlanSwitchUiValidation());
    assert.deepEqual(roots(), before);
    assert.equal(existsSync(handle.ownedTempRoot), true);
    assert.equal((await request(handle, "/api/portal/human-challenges", {
      body: { scope: "portal_login" }
    })).status, 201);
  } finally {
    await handle.stop();
  }
});

test("fixed plan-switch CLI emits safe readiness and removes its marker root on SIGTERM", {
  skip: process.platform === "win32"
}, async () => {
  const child = spawn(process.execPath, [ENTRY, "--profile=plan-switch"], {
    cwd: ROOT, stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  let timeout;
  const closed = new Promise((done) => child.once("close", (code) => done(code)));
  const ready = new Promise((done, reject) => {
    timeout = setTimeout(() => reject(new Error("profile CLI did not become ready")), 10000);
    child.once("error", reject);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.includes("\n")) done();
    });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
  });
  const childRoots = () => readdirSync(tmpdir()).filter((name) => (
    name.startsWith(`coin-commerce-local-validation-p${child.pid}-`)
  ));
  try {
    await ready;
    clearTimeout(timeout);
    const record = JSON.parse(stdout.trim());
    assert.equal(record.status, "ready");
    assert.equal(record.planSwitch, true);
    assert.equal(record.offerCount, 3);
    assert.equal(record.loopback, true);
    assert.equal(childRoots().length, 1);
    child.kill("SIGTERM");
    const forceStop = setTimeout(() => child.kill("SIGKILL"), 10000);
    try { assert.equal(await closed, 0); } finally { clearTimeout(forceStop); }
    assert.equal(stderr, "");
    assert.equal(JSON.parse(stdout.trim().split("\n").at(-1)).status, "stopped");
    assert.equal(childRoots().length, 0);
  } finally {
    clearTimeout(timeout);
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await closed;
  }
});

test("closed profile serves authenticated real HTTP and settles upgrade, cancellation, downgrade and renewal", async () => {
  const before = roots();
  assert.equal(typeof harness.startLocalCoinCommercePlanSwitchUiValidation, "function");
  const handle = await harness.startLocalCoinCommercePlanSwitchUiValidation();
  const root = handle.ownedTempRoot;
  try {
    assert.equal(handle.baseUrl, "http://127.0.0.1:3457");
    const unauthenticated = await request(handle, "/api/portal/commerce/plan-switch/state");
    assert.equal(unauthenticated.status, 401);
    const missingChallenge = await request(handle, "/api/portal/password/session", {
      body: { accountId: LOGIN, plainPassword: PASSWORD }
    });
    assert.equal(missingChallenge.status, 400);
    const session = await login(handle);
    const readState = () => request(handle, "/api/portal/commerce/plan-switch/state", { session });
    const preview = (offerRef) => request(handle, "/api/portal/commerce/checkout-preview", {
      session, body: { offerRef }
    });
    const confirm = (quoteRef, key) => request(handle, "/api/portal/commerce/orders", {
      session, body: { quoteRef }, key
    });
    const state = await readState();
    assert.equal(state.status, 200);
    const catalog = await request(handle, "/api/portal/catalog/offers", { session });
    assert.equal(catalog.status, 200);
    const basic = catalog.body.offers.find((offer) => offer.delivery.monthlyTrafficGb === 50);
    const plus = catalog.body.offers.find((offer) => offer.delivery.monthlyTrafficGb === 100);
    assert.ok(basic && plus);
    assert.equal(state.body.current.offerRef === basic.offerRef, true);
    const initial = handle.inspect();
    assert.equal(initial.planSwitch.runtimeMatchesEntitlement, true);
    assert.equal(initial.planSwitch.monthlyTrafficGb, 50);
    assert.equal(initial.planSwitch.usedBytes, 1234);

    const upgrade = await preview(plus.offerRef);
    assert.equal(upgrade.status, 200);
    assert.equal(upgrade.body.quote.planSwitch.kind, "upgrade_inplace");
    assert.equal(upgrade.body.quote.amountUnits, 5);
    const held = await confirm(upgrade.body.quote.quoteRef, "ui_plan_switch_upgrade_v1");
    assert.equal(held.status, 201);
    assert.equal(held.body.order.paymentStatus, "held");
    await settle(handle, session, held.body.order);
    const upgraded = handle.inspect();
    assert.equal(upgraded.planSwitch.monthlyTrafficGb, 100);
    assert.equal(upgraded.planSwitch.validFrom, initial.planSwitch.validFrom);
    assert.equal(upgraded.planSwitch.validUntil, initial.planSwitch.validUntil);
    assert.equal(upgraded.planSwitch.usedBytes, 1234);
    assert.equal(upgraded.planSwitch.runtimeMatchesEntitlement, true);
    assert.equal(upgraded.funds.spendableUnits, 995);
    assert.equal(upgraded.funds.heldUnits, 0);

    const downQuote = await preview(basic.offerRef);
    assert.equal(downQuote.status, 200);
    const cancelOrder = await confirm(downQuote.body.quote.quoteRef, "ui_plan_switch_cancel_v1");
    assert.equal(cancelOrder.status, 201);
    const cancelled = await request(handle, `/api/portal/commerce/orders/${cancelOrder.body.order.orderRef}/cancel`, {
      session, body: {}, key: "ui_plan_switch_cancel_action_v1"
    });
    assert.equal(cancelled.status, 200);
    assert.equal(handle.inspect().funds.spendableUnits, 995);
    assert.equal((await readState()).body.pendingSwitch, null);

    const downAgain = await preview(basic.offerRef);
    const scheduledOrder = await confirm(downAgain.body.quote.quoteRef, "ui_plan_switch_schedule_v1");
    assert.equal(scheduledOrder.status, 201);
    await settle(handle, session, scheduledOrder.body.order);
    assert.equal((await readState()).body.pendingSwitch.toOfferRef === basic.offerRef, true);
    assert.equal(handle.inspect().planSwitch.monthlyTrafficGb, 100);
    const renewQuote = await preview(plus.offerRef);
    assert.equal(renewQuote.status, 200);
    assert.equal(renewQuote.body.quote.planSwitch.cancelsPendingDowngrade, true);
    assert.equal(renewQuote.body.quote.amountUnits, 10);
    const renewal = await confirm(renewQuote.body.quote.quoteRef, "ui_plan_switch_renew_v1");
    assert.equal(renewal.status, 201);
    await settle(handle, session, renewal.body.order);
    const final = handle.inspect();
    assert.equal((await readState()).body.pendingSwitch, null);
    assert.equal(final.planSwitch.monthlyTrafficGb, 100);
    assert.equal(final.planSwitch.runtimeMatchesEntitlement, true);
    assert.equal(final.planSwitch.usedBytes, 1234);
    assert.equal(Date.parse(final.planSwitch.validUntil) - Date.parse(initial.planSwitch.validUntil), 30 * 86400000);
    assert.equal(final.funds.spendableUnits, 965);
    assert.equal(final.funds.heldUnits, 0);
  } finally {
    await handle.stop();
  }
  assert.equal(existsSync(root), false);
  assert.deepEqual(roots(), before);
});
