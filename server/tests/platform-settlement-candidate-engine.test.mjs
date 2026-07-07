import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createPartnerAttributionEventLedger
} from "../services/platform/partner-attribution-event-ledger.mjs";
import {
  createPartnerSettlementCandidateEngine
} from "../services/platform/partner-settlement-candidate-engine.mjs";

function withSettlementEngine(fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "platform-settlement-candidate-engine-"));
  const db = new Database(join(tempDir, "control.sqlite"));
  const eventLedger = createPartnerAttributionEventLedger({ database: db });
  const engine = createPartnerSettlementCandidateEngine({
    database: db,
    eventLedger
  });
  try {
    seedPolicies(engine);
    return fn({ engine, eventLedger });
  } finally {
    engine.close();
    db.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

function seedPolicies(engine) {
  engine.upsertSettlementPolicy({
    policyRef: "policy_first_payment_cpa",
    status: "active",
    model: "first_payment_cpa",
    freezeDays: 7,
    currency: "USD",
    amountCents: 2500,
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:00:00.000Z"
  });
  engine.upsertSettlementPolicy({
    policyRef: "policy_first_purchase_share",
    status: "active",
    model: "order_percentage",
    freezeDays: 3,
    currency: "USD",
    rateBps: 2000,
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:00:00.000Z"
  });
}

function recordEligibleOrderFacts(eventLedger, {
  orderRef = "order_alpha",
  accountRef = "account_alpha",
  paymentRef = "payment_alpha",
  entitlementRef = "entitlement_alpha",
  partnerRef = "partner_alpha",
  campaignRef = "campaign_alpha",
  touchRef = "touch_alpha",
  amountCents = 9900,
  currency = "USD"
} = {}) {
  const payment = eventLedger.recordEvent({
    eventType: "payment_success",
    source: "payment_backend",
    accountRef,
    orderRef,
    paymentRef,
    partnerRef,
    campaignRef,
    touchRef,
    occurredAt: "2026-07-07T02:10:00.000Z",
    metadataSummary: {
      amountCents,
      currency
    }
  });
  const entitlement = eventLedger.recordEvent({
    eventType: "entitlement_delivered",
    source: "entitlement_service",
    accountRef,
    orderRef,
    paymentRef,
    entitlementRef,
    partnerRef,
    campaignRef,
    touchRef,
    occurredAt: "2026-07-07T02:20:00.000Z"
  });
  return { payment, entitlement };
}

test("settlement candidate engine creates frozen cpa candidate from backend facts", () => {
  withSettlementEngine(({ engine, eventLedger }) => {
    const facts = recordEligibleOrderFacts(eventLedger);

    const result = engine.evaluateOrderSettlement({
      orderRef: "order_alpha",
      policyRef: "policy_first_payment_cpa",
      evaluatedAt: "2026-07-07T02:30:00.000Z"
    });

    assert.equal(result.created, true);
    assert.deepEqual(result.blockedReasons, []);
    assert.equal(result.candidate.status, "frozen");
    assert.equal(result.candidate.policyRef, "policy_first_payment_cpa");
    assert.equal(result.candidate.model, "first_payment_cpa");
    assert.equal(result.candidate.partnerRef, "partner_alpha");
    assert.equal(result.candidate.campaignRef, "campaign_alpha");
    assert.equal(result.candidate.paymentRef, "payment_alpha");
    assert.equal(result.candidate.entitlementRef, "entitlement_alpha");
    assert.equal(result.candidate.amountCents, 2500);
    assert.equal(result.candidate.basisAmountCents, 9900);
    assert.equal(result.candidate.currency, "USD");
    assert.equal(result.candidate.freezeUntil, "2026-07-14T02:20:00.000Z");
    assert.deepEqual(result.candidate.sourceEventRefs, [
      facts.payment.eventRef,
      facts.entitlement.eventRef
    ]);

    const candidateEvents = eventLedger.listSettlementSafeEvents({
      eventType: "settlement_candidate_created"
    });
    assert.equal(candidateEvents.length, 1);
    assert.equal(candidateEvents[0].orderRef, "order_alpha");
    assert.equal(candidateEvents[0].metadataSummary.candidateRef, result.candidate.candidateRef);

    const audit = engine.listCandidateAudit({ candidateRef: result.candidate.candidateRef });
    assert.deepEqual(audit.map((entry) => entry.action), ["candidate_created"]);
  });
});

test("settlement candidate engine returns existing candidate for duplicate evaluation", () => {
  withSettlementEngine(({ engine, eventLedger }) => {
    recordEligibleOrderFacts(eventLedger);

    const first = engine.evaluateOrderSettlement({
      orderRef: "order_alpha",
      policyRef: "policy_first_payment_cpa",
      evaluatedAt: "2026-07-07T02:30:00.000Z"
    });
    const second = engine.evaluateOrderSettlement({
      orderRef: "order_alpha",
      policyRef: "policy_first_payment_cpa",
      evaluatedAt: "2026-07-07T02:31:00.000Z"
    });

    assert.equal(second.created, false);
    assert.equal(second.duplicate, true);
    assert.equal(second.candidate.candidateRef, first.candidate.candidateRef);
    assert.equal(engine.listSettlementCandidates({ orderRef: "order_alpha" }).length, 1);
    assert.equal(
      eventLedger.listSettlementSafeEvents({ eventType: "settlement_candidate_created" }).length,
      1
    );
  });
});

test("settlement candidate engine promotes candidates after freeze period", () => {
  withSettlementEngine(({ engine, eventLedger }) => {
    recordEligibleOrderFacts(eventLedger);
    const result = engine.evaluateOrderSettlement({
      orderRef: "order_alpha",
      policyRef: "policy_first_payment_cpa",
      evaluatedAt: "2026-07-07T02:30:00.000Z"
    });

    const early = engine.promotePayableCandidates({
      evaluatedAt: "2026-07-13T23:59:59.000Z"
    });
    assert.deepEqual(early.promoted, []);
    assert.equal(engine.getSettlementCandidate(result.candidate.candidateRef).status, "frozen");

    const ready = engine.promotePayableCandidates({
      evaluatedAt: "2026-07-14T02:20:00.000Z"
    });
    assert.deepEqual(ready.promoted.map((candidate) => candidate.candidateRef), [
      result.candidate.candidateRef
    ]);
    const promoted = engine.getSettlementCandidate(result.candidate.candidateRef);
    assert.equal(promoted.status, "payable_review");
    assert.equal(promoted.payableAt, "2026-07-14T02:20:00.000Z");
    assert.deepEqual(engine.listCandidateAudit({ candidateRef: promoted.candidateRef }).map((entry) => entry.action), [
      "candidate_created",
      "candidate_payable"
    ]);
  });
});

test("settlement candidate engine supports percentage policy data", () => {
  withSettlementEngine(({ engine, eventLedger }) => {
    recordEligibleOrderFacts(eventLedger, {
      orderRef: "order_share",
      paymentRef: "payment_share",
      entitlementRef: "entitlement_share",
      amountCents: 12500
    });

    const result = engine.evaluateOrderSettlement({
      orderRef: "order_share",
      policyRef: "policy_first_purchase_share",
      evaluatedAt: "2026-07-07T02:30:00.000Z"
    });

    assert.equal(result.candidate.model, "order_percentage");
    assert.equal(result.candidate.basisAmountCents, 12500);
    assert.equal(result.candidate.rateBps, 2000);
    assert.equal(result.candidate.amountCents, 2500);
    assert.equal(result.candidate.freezeUntil, "2026-07-10T02:20:00.000Z");
  });
});

test("settlement candidate engine blocks candidates when reversal facts already exist", () => {
  withSettlementEngine(({ engine, eventLedger }) => {
    recordEligibleOrderFacts(eventLedger, { orderRef: "order_refunded" });
    eventLedger.recordEvent({
      eventType: "refund",
      source: "payment_backend",
      orderRef: "order_refunded",
      paymentRef: "payment_alpha",
      partnerRef: "partner_alpha",
      campaignRef: "campaign_alpha",
      occurredAt: "2026-07-07T03:00:00.000Z"
    });
    const refunded = engine.evaluateOrderSettlement({
      orderRef: "order_refunded",
      policyRef: "policy_first_payment_cpa",
      evaluatedAt: "2026-07-07T03:05:00.000Z"
    });
    assert.equal(refunded.candidate, null);
    assert.deepEqual(refunded.blockedReasons, ["refund"]);

    recordEligibleOrderFacts(eventLedger, {
      orderRef: "order_risk",
      paymentRef: "payment_risk",
      entitlementRef: "entitlement_risk"
    });
    eventLedger.recordEvent({
      eventType: "risk_rejected",
      source: "risk_backend",
      orderRef: "order_risk",
      partnerRef: "partner_alpha",
      campaignRef: "campaign_alpha",
      occurredAt: "2026-07-07T03:10:00.000Z"
    });
    const risk = engine.evaluateOrderSettlement({
      orderRef: "order_risk",
      policyRef: "policy_first_payment_cpa",
      evaluatedAt: "2026-07-07T03:15:00.000Z"
    });
    assert.equal(risk.candidate, null);
    assert.deepEqual(risk.blockedReasons, ["risk_rejected"]);

    recordEligibleOrderFacts(eventLedger, {
      orderRef: "order_duplicate_payment",
      paymentRef: "payment_first",
      entitlementRef: "entitlement_duplicate_payment"
    });
    eventLedger.recordEvent({
      eventType: "payment_success",
      source: "payment_backend",
      orderRef: "order_duplicate_payment",
      paymentRef: "payment_second",
      partnerRef: "partner_alpha",
      campaignRef: "campaign_alpha",
      occurredAt: "2026-07-07T03:20:00.000Z",
      metadataSummary: {
        amountCents: 9900,
        currency: "USD"
      }
    });
    const duplicatePayment = engine.evaluateOrderSettlement({
      orderRef: "order_duplicate_payment",
      policyRef: "policy_first_payment_cpa",
      evaluatedAt: "2026-07-07T03:25:00.000Z"
    });
    assert.equal(duplicatePayment.candidate, null);
    assert.deepEqual(duplicatePayment.blockedReasons, ["duplicate_payment"]);
  });
});

test("settlement candidate engine reverses existing candidates from refund events", () => {
  withSettlementEngine(({ engine, eventLedger }) => {
    recordEligibleOrderFacts(eventLedger);
    const result = engine.evaluateOrderSettlement({
      orderRef: "order_alpha",
      policyRef: "policy_first_payment_cpa",
      evaluatedAt: "2026-07-07T02:30:00.000Z"
    });
    const refund = eventLedger.recordEvent({
      eventType: "refund",
      source: "payment_backend",
      orderRef: "order_alpha",
      paymentRef: "payment_alpha",
      partnerRef: "partner_alpha",
      campaignRef: "campaign_alpha",
      occurredAt: "2026-07-08T02:30:00.000Z"
    });

    const reversed = engine.applyReversalEvents({
      evaluatedAt: "2026-07-08T02:31:00.000Z"
    });

    assert.deepEqual(reversed.reversed.map((candidate) => candidate.candidateRef), [
      result.candidate.candidateRef
    ]);
    const candidate = engine.getSettlementCandidate(result.candidate.candidateRef);
    assert.equal(candidate.status, "reversed");
    assert.equal(candidate.reasonCode, "refund");
    assert.equal(candidate.reversedAt, "2026-07-08T02:30:00.000Z");
    assert.equal(candidate.reversalEventRef, refund.eventRef);

    const events = eventLedger.listSettlementSafeEvents({
      eventType: "settlement_reversed"
    });
    assert.equal(events.length, 1);
    assert.equal(events[0].metadataSummary.reasonCode, "refund");
  });
});

test("settlement candidate engine records manual entitlement rollback reversals", () => {
  withSettlementEngine(({ engine, eventLedger }) => {
    recordEligibleOrderFacts(eventLedger);
    const result = engine.evaluateOrderSettlement({
      orderRef: "order_alpha",
      policyRef: "policy_first_payment_cpa",
      evaluatedAt: "2026-07-07T02:30:00.000Z"
    });

    const reversed = engine.recordSettlementReversal({
      candidateRef: result.candidate.candidateRef,
      reasonCode: "entitlement_rollback",
      source: "entitlement_service",
      occurredAt: "2026-07-09T02:30:00.000Z"
    });

    assert.equal(reversed.status, "reversed");
    assert.equal(reversed.reasonCode, "entitlement_rollback");
    assert.equal(reversed.reversedAt, "2026-07-09T02:30:00.000Z");
    assert.deepEqual(engine.listCandidateAudit({ candidateRef: result.candidate.candidateRef }).map((entry) => entry.action), [
      "candidate_created",
      "candidate_reversed"
    ]);

    const events = eventLedger.listSettlementSafeEvents({
      eventType: "settlement_reversed"
    });
    assert.equal(events.length, 1);
    assert.equal(events[0].source, "entitlement_service");
    assert.equal(events[0].metadataSummary.reasonCode, "entitlement_rollback");
  });
});
