import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import test from "node:test";

async function startHarness() {
  const module = await import(`../../scripts/start-local-coin-commerce-validation.mjs?e2e=${Date.now()}_${Math.random()}`);
  return module.startLocalCoinCommerceValidation();
}

function request(baseUrl, { method = "GET", path, headers = {}, body } = {}) {
  const target = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const req = httpRequest({
      host: target.hostname,
      port: target.port,
      method,
      path,
      headers: { Connection: "close", ...headers },
      agent: false
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        try {
          const text = Buffer.concat(chunks).toString("utf8");
          finish(resolve, { status: res.statusCode, headers: res.headers, text, json: text ? JSON.parse(text) : null });
        } catch (error) {
          finish(reject, error);
        }
      });
      res.once("aborted", () => finish(reject, new Error(`HTTP response aborted: ${path}`)));
      res.once("error", (error) => finish(reject, error));
    });
    const timer = setTimeout(() => {
      req.destroy(new Error(`HTTP request timed out: ${path}`));
    }, 5_000);
    req.once("error", (error) => {
      finish(reject, error);
    });
    if (body !== undefined) req.end(JSON.stringify(body));
    else req.end();
  });
}

function duplicateHeaderRequest(baseUrl, path, sessionRef) {
  const target = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const req = httpRequest({
      host: target.hostname,
      port: target.port,
      path,
      headers: ["Host", target.host, "Connection", "close", "X-Portal-Session", sessionRef, "X-Portal-Session", sessionRef],
      agent: false
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        try {
          finish(resolve, { status: res.statusCode, json: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
        } catch (error) {
          finish(reject, error);
        }
      });
      res.once("aborted", () => finish(reject, new Error(`duplicate-header HTTP response aborted: ${path}`)));
      res.once("error", (error) => finish(reject, error));
    });
    const timer = setTimeout(() => {
      req.destroy(new Error(`duplicate-header HTTP request timed out: ${path}`));
    }, 5_000);
    req.once("error", (error) => finish(reject, error));
    req.end();
  });
}

function jsonHeaders(session, key) {
  return {
    ...session,
    "Content-Type": "application/json",
    ...(key ? { "Idempotency-Key": key } : {})
  };
}

function assertCommerceError(response, status, code) {
  assert.equal(response.status, status);
  assert.deepEqual(response.json, { error: { code, retryable: false } });
}

function assertSafeDto(value) {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const forbidden of ["wallet", "ledger", "lot", "accountid", "sessionref", "command", "effectref", "sqlite", "sql", "temp", "path", "stack", "message"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
}

function assertExactKeys(value, keys, label) {
  assert.deepEqual(Reflect.ownKeys(value).sort(), [...keys].sort(), label);
}

function assertOffer(offer) {
  assertExactKeys(offer, ["offerRef", "offerVersionRef", "category", "title", "summary", "importantNotices", "referencePrice", "acceptedCoinTypes", "delivery"], "offer");
  assertExactKeys(offer.title, ["zh", "en"], "offer.title");
  assertExactKeys(offer.summary, ["zh", "en"], "offer.summary");
  assertExactKeys(offer.importantNotices, ["zh", "en"], "offer.importantNotices");
  assertExactKeys(offer.referencePrice, ["currency", "amountMinor"], "offer.referencePrice");
  assertExactKeys(offer.delivery, ["kind", "durationDays", "monthlyTrafficGb", "trafficGb", "neverExpires", "discountBasisPoints"], "offer.delivery");
}

function assertAllocation(allocation) {
  assert.equal(Array.isArray(allocation), true);
  for (const item of allocation) assertExactKeys(item, ["coinType", "amountUnits"], "allocation item");
}

function assertBalances(balances) {
  assertExactKeys(balances, ["before", "after"], "balances");
  for (const value of [balances.before, balances.after]) {
    assertExactKeys(value, ["bonusCoins", "paidCoins", "rewardCoins", "heldCoins"], "balance");
  }
}

function assertQuoteEnvelope(response) {
  assertExactKeys(response.json, ["quote"], "quote envelope");
  const { quote } = response.json;
  assertExactKeys(quote, ["quoteRef", "offer", "amountUnits", "appliedDiscountBasisPoints", "purchaseAvailability", "shortfallUnits", "allocation", "balances", "expiresAt"], "quote");
  assertOffer(quote.offer);
  assertAllocation(quote.allocation);
  assertBalances(quote.balances);
}

function assertOrderEnvelope(response) {
  assertExactKeys(response.json, ["order"], "order envelope");
  const { order } = response.json;
  assertExactKeys(order, ["orderRef", "offer", "amountUnits", "allocation", "paymentStatus", "cancelUntil", "fulfillment", "createdAt", "updatedAt"], "order");
  assertOffer(order.offer);
  assertAllocation(order.allocation);
  assertExactKeys(order.fulfillment, ["status", "safeCode"], "fulfillment");
}

function assertInspect(inspection) {
  assertExactKeys(inspection, ["effectCount", "fulfillmentInFlight", "funds"], "inspect");
  assertExactKeys(inspection.funds, ["status", "spendableUnits", "heldUnits", "pendingUnits"], "inspect.funds");
}

async function waitThroughCancelUntil(cancelUntil) {
  assert.match(cancelUntil, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  const deadline = Date.now() + 3_000;
  const target = Date.parse(cancelUntil);
  assert.equal(Number.isFinite(target), true);
  while (Date.now() <= target) {
    assert.equal(Date.now() < deadline, true, "cancel window did not elapse within bound");
    await new Promise((resolve) => setTimeout(resolve, Math.min(25, target - Date.now() + 1)));
  }
}

async function pollDelivered(handle, orderRef) {
  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    const response = await request(handle.baseUrl, {
      path: `/api/portal/commerce/orders/${orderRef}`,
      headers: handle.portalHeaders.funded
    });
    if (response.status === 200 && response.json.order.paymentStatus === "captured" && response.json.order.fulfillment.status === "delivered") return response;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("captured/delivered order did not settle within bounded cancel window");
}

test("real loopback Portal Commerce completes held, cancelled, insufficient, owned, and safe DTO paths", async () => {
  const handle = await startHarness();
  try {
    const catalog = await request(handle.baseUrl, {
      path: "/api/portal/catalog/offers",
      headers: handle.portalHeaders.funded
    });
    assert.equal(catalog.status, 200);
    assertExactKeys(catalog.json, ["offers"], "catalog envelope");
    assert.equal(Array.isArray(catalog.json.offers), true);
    assert.equal(catalog.json.offers.length, 1);
    catalog.json.offers.forEach(assertOffer);
    assertSafeDto(catalog.json);
    const offerRef = catalog.json.offers[0].offerRef;

    const detail = await request(handle.baseUrl, {
      path: `/api/portal/catalog/offers/${offerRef}`,
      headers: handle.portalHeaders.funded
    });
    assert.equal(detail.status, 200);
    assertExactKeys(detail.json, ["offer"], "detail envelope");
    assertOffer(detail.json.offer);
    assert.deepEqual(detail.json, { offer: catalog.json.offers[0] });
    assertSafeDto(detail.json);

    const preview = await request(handle.baseUrl, {
      method: "POST",
      path: "/api/portal/commerce/checkout-preview",
      headers: jsonHeaders(handle.portalHeaders.funded),
      body: { offerRef }
    });
    assert.equal(preview.status, 200);
    assertQuoteEnvelope(preview);
    assert.equal(preview.json.quote.purchaseAvailability, "available");
    assert.equal(preview.json.quote.shortfallUnits, 0);
    assertSafeDto(preview.json);

    const held = await request(handle.baseUrl, {
      method: "POST",
      path: "/api/portal/commerce/orders",
      headers: jsonHeaders(handle.portalHeaders.funded, "capture-order-1"),
      body: { quoteRef: preview.json.quote.quoteRef }
    });
    assert.equal(held.status, 201);
    assertOrderEnvelope(held);
    assert.equal(held.json.order.paymentStatus, "held");
    assertSafeDto(held.json);
    const replay = await request(handle.baseUrl, {
      method: "POST",
      path: "/api/portal/commerce/orders",
      headers: jsonHeaders(handle.portalHeaders.funded, "capture-order-1"),
      body: { quoteRef: preview.json.quote.quoteRef }
    });
    assert.equal(replay.status, 201);
    assertOrderEnvelope(replay);
    assert.deepEqual(replay.json, held.json);
    assertSafeDto(replay.json);

    const cancelPreview = await request(handle.baseUrl, {
      method: "POST",
      path: "/api/portal/commerce/checkout-preview",
      headers: jsonHeaders(handle.portalHeaders.funded),
      body: { offerRef }
    });
    assert.equal(cancelPreview.status, 200);
    assertQuoteEnvelope(cancelPreview);
    assert.equal(cancelPreview.json.quote.purchaseAvailability, "available");
    assertSafeDto(cancelPreview.json);
    const cancelHeld = await request(handle.baseUrl, {
      method: "POST",
      path: "/api/portal/commerce/orders",
      headers: jsonHeaders(handle.portalHeaders.funded, "cancel-order-create-1"),
      body: { quoteRef: cancelPreview.json.quote.quoteRef }
    });
    assert.equal(cancelHeld.status, 201);
    assertOrderEnvelope(cancelHeld);
    assert.equal(cancelHeld.json.order.paymentStatus, "held");
    assertSafeDto(cancelHeld.json);
    const cancelled = await request(handle.baseUrl, {
      method: "POST",
      path: `/api/portal/commerce/orders/${cancelHeld.json.order.orderRef}/cancel`,
      headers: jsonHeaders(handle.portalHeaders.funded, "cancel-order-1"),
      body: {}
    });
    assert.equal(cancelled.status, 200);
    assertOrderEnvelope(cancelled);
    assert.equal(cancelled.json.order.paymentStatus, "cancelled");
    assertSafeDto(cancelled.json);
    const cancelReplay = await request(handle.baseUrl, {
      method: "POST",
      path: `/api/portal/commerce/orders/${cancelHeld.json.order.orderRef}/cancel`,
      headers: jsonHeaders(handle.portalHeaders.funded, "cancel-order-1"),
      body: {}
    });
    assert.equal(cancelReplay.status, 200);
    assertOrderEnvelope(cancelReplay);
    assert.deepEqual(cancelReplay.json, cancelled.json);
    assertSafeDto(cancelReplay.json);

    const emptyPreview = await request(handle.baseUrl, {
      method: "POST",
      path: "/api/portal/commerce/checkout-preview",
      headers: jsonHeaders(handle.portalHeaders.emptyWallet),
      body: { offerRef }
    });
    assert.equal(emptyPreview.status, 200);
    assertQuoteEnvelope(emptyPreview);
    assert.equal(emptyPreview.json.quote.purchaseAvailability, "insufficient_balance");
    assertSafeDto(emptyPreview.json);
    const insufficientConfirm = await request(handle.baseUrl, {
      method: "POST",
      path: "/api/portal/commerce/orders",
      headers: jsonHeaders(handle.portalHeaders.emptyWallet, "empty-wallet-confirm-1"),
      body: { quoteRef: emptyPreview.json.quote.quoteRef }
    });
    assertCommerceError(insufficientConfirm, 423, "insufficient_coins");

    const foreign = await request(handle.baseUrl, {
      path: `/api/portal/commerce/orders/${held.json.order.orderRef}`,
      headers: handle.portalHeaders.emptyWallet
    });
    assertCommerceError(foreign, 404, "commerce_not_found");
    assertCommerceError(await request(handle.baseUrl, { path: "/api/portal/catalog/offers" }), 401, "commerce_session_invalid");
    assertCommerceError(await request(handle.baseUrl, { path: "/api/portal/catalog/offers", headers: { "X-Portal-Session": "session_unknown_000000000000" } }), 401, "commerce_session_invalid");
    assertCommerceError(await duplicateHeaderRequest(handle.baseUrl, "/api/portal/catalog/offers", handle.portalHeaders.funded["X-Portal-Session"]), 401, "commerce_session_invalid");
    const consoleSubstitute = await request(handle.baseUrl, { path: "/api/portal/catalog/offers", headers: { Authorization: "Bearer synthetic-console-substitute" } });
    assertCommerceError(consoleSubstitute, 401, "commerce_session_invalid");
    assert.equal((await request(handle.baseUrl, { path: "/api/status" })).status, 401);

    await waitThroughCancelUntil(held.json.order.cancelUntil);
    await handle.runCoordinatorOnce();
    const delivered = await pollDelivered(handle, held.json.order.orderRef);
    assertOrderEnvelope(delivered);
    assert.equal(delivered.json.order.paymentStatus, "captured");
    assert.equal(delivered.json.order.fulfillment.status, "delivered");
    assertSafeDto(delivered.json);
    const inspection = handle.inspect();
    assertInspect(inspection);
    assert.equal(inspection.effectCount, 1);
    assert.equal(inspection.fulfillmentInFlight, 0);
    assert.deepEqual(inspection.funds, {
      status: "active",
      spendableUnits: 40,
      heldUnits: 0,
      pendingUnits: 0
    });
    assertSafeDto(inspection);
  } finally {
    await handle.stop();
  }
});
