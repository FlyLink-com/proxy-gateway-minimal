import assert from "node:assert/strict";
import test from "node:test";
import { createPackHttpFixture, materialDigest } from "./platform-coin-commerce-data-pack-http-acceptance.fixture.mjs";

const ORDERS = "/api/portal/commerce/orders";

function assertNoStore(response) {
  assert.match(response.headers["cache-control"], /(?:^|[, ])no-store(?:$|[, ])/);
  assert.equal(response.headers["referrer-policy"], "no-referrer");
}

function assertHidden(response, status = 404) {
  assert.equal(response.status, status);
  assertNoStore(response);
  assert.equal(Object.hasOwn(response.json, "usage"), false);
  assert.equal(JSON.stringify(response.json).includes("subscriptionUrl"), false);
}

async function purchase(fixture, { trafficGb, coins, key }) {
  const preview = await fixture.request("/api/portal/commerce/checkout-preview", {
    method: "POST", body: { offerRef: `offer_pack_${trafficGb}gb` }
  });
  assert.equal(preview.status, 200);
  assert.equal(preview.json.quote.amountUnits, coins);
  assert.equal(preview.json.quote.offer.delivery.trafficGb, trafficGb);
  assert.equal(preview.json.quote.offer.delivery.neverExpires, true);
  const input = { method: "POST", idempotencyKey: key,
    body: { quoteRef: preview.json.quote.quoteRef } };
  const held = await fixture.request(ORDERS, input);
  assert.equal(held.status, 201);
  assert.equal(held.json.order.paymentStatus, "held");
  const retry = await fixture.request(ORDERS, input);
  assert.equal(retry.status, 201);
  assert.deepEqual(retry.json, held.json);
  return { order: held.json.order, input };
}

async function getDelivery(fixture, orderRef, trafficGb) {
  const response = await fixture.request(`${ORDERS}/${orderRef}/subscription`);
  assert.equal(response.status, 200, "a delivered order must resolve its real protected material");
  assertNoStore(response);
  const delivery = response.json;
  assert.equal(delivery.orderRef, orderRef);
  assert.equal(typeof delivery.subscriptionUrl, "string");
  assert.equal(new URL(delivery.subscriptionUrl).protocol, "https:");
  assert.deepEqual(delivery.usage, { totalBytes: trafficGb * 1024 ** 3,
    usedBytes: null, remainingBytes: null, collectionStatus: "pending",
    updatedAt: null, exhausted: null });
  assert.deepEqual(Object.keys(delivery).sort(), ["orderRef", "subscriptionUrl", "usage"]);
  // Assertion failures never print the protected URL.
  return materialDigest(delivery.subscriptionUrl);
}

for (const [trafficGb, coins] of [[100, 30], [200, 50], [500, 100]]) {
  test(`authenticated HTTP ${trafficGb} GB pack: real fulfillment, one debit and restart handoff; simulated edge receipt`, async () => {
    const fixture = await createPackHttpFixture();
    try {
      const { order, input } = await purchase(fixture, { trafficGb, coins, key: "purchase_http_first" });
      const handoffPath = `${ORDERS}/${order.orderRef}/subscription`;
      assertHidden(await fixture.request(handoffPath));
      assertHidden(await fixture.request(handoffPath, { account: "other" }));
      assertHidden(await fixture.request(handoffPath, { account: null }), 401);
      fixture.advanceTo(order.cancelUntil);
      const completed = await fixture.runOnce();
      assert.equal(completed.commandsDelivered, 1);
      const firstDigest = await getDelivery(fixture, order.orderRef, trafficGb);
      const fetched = await fixture.request(`${ORDERS}/${order.orderRef}`);
      assert.equal(fetched.status, 200);
      assert.equal(fetched.json.order.paymentStatus, "captured");
      assert.equal(fetched.json.order.fulfillment.status, "delivered");
      assert.equal(JSON.stringify(fetched.json).includes("subscriptionUrl"), false);
      assert.equal((await fixture.request(`${ORDERS}/${order.orderRef}`, { account: "other" })).status, 404);
      assertHidden(await fixture.request(handoffPath, { account: "other" }));
      assertHidden(await fixture.request(handoffPath, { account: null }), 401);
      const after = fixture.inspect();
      assert.deepEqual(after, { spendableUnits: 500 - coins, heldUnits: 0,
        debits: 1, debitUnits: coins, orders: 1, receipts: 1, resources: 1,
        tenants: 1, artifacts: 1, edgeCredentials: 1 });
      assert.equal((await fixture.request(ORDERS, input)).status, 201);
      assert.equal((await fixture.runOnce()).commandsClaimed, 0);
      assert.deepEqual(fixture.inspect(), after);

      // Close HTTP, coordinator, both SQLite DBs and escrow, then reconstruct
      // the real resolver/auth/fulfillment stack from only the persisted files.
      await fixture.reopen();
      assert.equal(await getDelivery(fixture, order.orderRef, trafficGb), firstDigest);
      assert.equal((await fixture.request(ORDERS, input)).status, 201);
      assert.equal((await fixture.runOnce()).commandsClaimed, 0);
      assert.deepEqual(fixture.inspect(), after);
      assertHidden(await fixture.request(handoffPath, { account: "other" }));

      // A deliberate second purchase is a new pack; retrying its own operation
      // still has exactly one debit and never reuses the first pack's material.
      if (trafficGb === 100) {
        const second = await purchase(fixture, { trafficGb, coins, key: "purchase_http_second" });
        fixture.advanceTo(second.order.cancelUntil);
        assert.equal((await fixture.runOnce()).commandsDelivered, 1);
        assert.notEqual(second.order.orderRef, order.orderRef);
        assert.notEqual(await getDelivery(fixture, second.order.orderRef, trafficGb), firstDigest);
        assert.equal(await getDelivery(fixture, order.orderRef, trafficGb), firstDigest);
        assert.deepEqual(fixture.inspect(), { spendableUnits: 500 - 2 * coins, heldUnits: 0,
          debits: 2, debitUnits: 2 * coins, orders: 2, receipts: 2, resources: 2,
          tenants: 2, artifacts: 2, edgeCredentials: 2 });
      }
    } finally { await fixture.close(); }
  });
}

test("HTTP pack handoff stays unavailable until a simulated apply receipt; restart/retry does not debit or issue twice", async () => {
  const fixture = await createPackHttpFixture();
  try {
    fixture.allowSimulatedApply(false);
    const { order, input } = await purchase(fixture, { trafficGb: 100, coins: 30, key: "purchase_http_pending" });
    fixture.advanceTo(order.cancelUntil);
    const pending = await fixture.runOnce();
    assert.equal(pending.commandsDeferred, 1);
    assert.equal(pending.commandsDelivered, 0);
    const handoffPath = `${ORDERS}/${order.orderRef}/subscription`;
    assertHidden(await fixture.request(handoffPath));
    const pendingState = fixture.inspect();
    assert.deepEqual(pendingState, { spendableUnits: 470, heldUnits: 0,
      debits: 1, debitUnits: 30, orders: 1, receipts: 0, resources: 1,
      tenants: 1, artifacts: 1, edgeCredentials: 1 });
    await fixture.reopen();
    assertHidden(await fixture.request(handoffPath));
    assert.equal((await fixture.request(ORDERS, input)).status, 201);
    fixture.advancePastLease();
    fixture.allowSimulatedApply(true);
    assert.equal((await fixture.runOnce()).commandsDelivered, 1);
    await getDelivery(fixture, order.orderRef, 100);
    assert.deepEqual(fixture.inspect(), { ...pendingState, receipts: 1 });
    assert.equal((await fixture.runOnce()).commandsClaimed, 0);
  } finally { await fixture.close(); }
});
