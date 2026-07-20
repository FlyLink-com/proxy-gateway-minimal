import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRechargeCreditDecision,
  buildUsageDebitDecision,
  normalizeBillingPaymentEvent,
  normalizeRechargeOrder
} from "../services/platform/billing-provider-contract.mjs";

const NOW = "2026-05-31T00:00:00.000Z";

test("recharge order contract normalizes multi-provider payment orders without raw customer or payment data", () => {
  const order = normalizeRechargeOrder({
    id: "recharge_001",
    provider: "wechat",
    providerOrderRef: "wx_order_123456789",
    accountRef: "acct_safe_001",
    packageRef: "traffic_50gb",
    amountMinor: 9900,
    currency: "cny",
    creditTrafficMb: 51200,
    status: "pending",
    customerEmail: "owner@sensitive.example",
    cardToken: "tok_secret"
  }, { now: NOW });

  assert.deepEqual(order, {
    id: "recharge_001",
    type: "billing_recharge_order",
    provider: "wechatpay",
    providerOrderRef: "wx_order_123456789",
    accountRef: "acct_safe_001",
    packageRef: "traffic_50gb",
    amountMinor: 9900,
    currency: "CNY",
    creditTrafficMb: 51200,
    status: "pending",
    createdAt: NOW,
    updatedAt: NOW
  });
  assert.doesNotMatch(JSON.stringify(order), /owner@sensitive|tok_secret|cardToken|customerEmail/i);
});

test("recharge order contract recognizes WorldFirst as a provider vocabulary entry", () => {
  const order = normalizeRechargeOrder({
    id: "recharge_worldfirst_001",
    provider: "wanlihui",
    providerOrderRef: "wf_order_001",
    accountRef: "acct_safe_worldfirst",
    packageRef: "monthly",
    amountMinor: 1999,
    currency: "usd",
    creditTrafficMb: 5120,
    status: "pending"
  }, { now: NOW });

  assert.equal(order.provider, "worldfirst");
  assert.equal(order.providerOrderRef, "wf_order_001");
});

test("billing event contract fails closed for unverified paid webhooks and duplicate idempotency keys", () => {
  assert.throws(() => {
    normalizeBillingPaymentEvent({
      id: "evt_untrusted",
      provider: "alipay",
      providerEventRef: "evt_provider_1",
      idempotencyKey: "idem_1",
      orderId: "recharge_001",
      eventType: "payment_succeeded",
      signatureStatus: "unverified"
    }, { now: NOW });
  }, /verified signature/);

  assert.throws(() => {
    normalizeBillingPaymentEvent({
      id: "evt_duplicate",
      provider: "alipay",
      providerEventRef: "evt_provider_2",
      idempotencyKey: "idem_existing",
      orderId: "recharge_001",
      eventType: "payment_succeeded",
      signatureStatus: "verified"
    }, {
      now: NOW,
      seenIdempotencyKeys: new Set(["idem_existing"])
    });
  }, /duplicate billing event/);
});

test("paid billing event credits traffic balance but never creates a subscription", () => {
  const order = normalizeRechargeOrder({
    id: "recharge_002",
    provider: "manual",
    providerOrderRef: "manual_receipt_001",
    accountRef: "acct_safe_002",
    packageRef: "traffic_100gb",
    amountMinor: 19900,
    currency: "usd",
    creditTrafficMb: 102400,
    status: "paid"
  }, { now: NOW });

  const event = normalizeBillingPaymentEvent({
    id: "evt_paid",
    provider: "manual",
    providerEventRef: "manual_evt_001",
    idempotencyKey: "manual_evt_001",
    orderId: order.id,
    eventType: "payment_succeeded",
    signatureStatus: "verified"
  }, { now: NOW });

  const decision = buildRechargeCreditDecision({
    order,
    event,
    balanceBeforeMb: 512,
    actorRef: "billing_provider_manual"
  }, { now: NOW });

  assert.equal(decision.status, "credit_ready");
  assert.equal(decision.balanceAfterMb, 102912);
  assert.equal(decision.ledgerEntry.direction, "credit");
  assert.equal(decision.ledgerEntry.amountTrafficMb, 102400);
  assert.equal(decision.execution.subscriptionCreated, false);
  assert.equal(decision.execution.issuanceRequestCreated, false);
  assert.equal(decision.safety.noSubscriptionUrl, true);
  assert.doesNotMatch(JSON.stringify(decision), /owner@sensitive|tok_secret|https:\/\/example|\/sub\/a\/|raw_artifact/i);
});

test("usage debit decision deducts quota and blocks insufficient balance without issuance mutation", () => {
  const allowed = buildUsageDebitDecision({
    accountRef: "acct_safe_003",
    usageRef: "usage_window_001",
    artifactRef: "artifactref_safe",
    balanceBeforeMb: 2048,
    trafficUsedMb: 512,
    actorRef: "traffic_accounting"
  }, { now: NOW });

  assert.equal(allowed.status, "debit_ready");
  assert.equal(allowed.balanceAfterMb, 1536);
  assert.equal(allowed.ledgerEntry.direction, "debit");
  assert.equal(allowed.execution.subscriptionMutationRequired, false);

  const blocked = buildUsageDebitDecision({
    accountRef: "acct_safe_003",
    usageRef: "usage_window_002",
    artifactRef: "artifactref_safe",
    balanceBeforeMb: 128,
    trafficUsedMb: 512,
    actorRef: "traffic_accounting"
  }, { now: NOW });

  assert.equal(blocked.status, "blocked_insufficient_balance");
  assert.equal(blocked.balanceAfterMb, 128);
  assert.equal(blocked.ledgerEntry, null);
  assert.equal(blocked.nextAction, "disable_or_revoke_through_controlled_gate");
});
