import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createPartnerAttributionEventLedger
} from "../services/platform/partner-attribution-event-ledger.mjs";

function withLedger(fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "platform-partner-event-ledger-"));
  let ledger;
  try {
    ledger = createPartnerAttributionEventLedger({
      dbPath: join(tempDir, "control.sqlite")
    });
    return fn(ledger);
  } finally {
    ledger?.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

test("partner attribution event ledger records canonical events in occurrence order", () => {
  withLedger((ledger) => {
    const entitlement = ledger.recordEvent({
      eventType: "entitlement_delivered",
      source: "entitlement_service",
      accountRef: "account_alpha",
      orderRef: "order_alpha",
      paymentRef: "payment_alpha",
      entitlementRef: "entitlement_alpha",
      partnerRef: "partner_alpha",
      campaignRef: "campaign_alpha",
      touchRef: "touch_alpha",
      occurredAt: "2026-07-07T03:00:00.000Z",
      recordedAt: "2026-07-07T03:01:00.000Z",
      metadataSummary: {
        deliveryStatus: "active"
      }
    });
    const payment = ledger.recordEvent({
      eventType: "payment_success",
      source: "payment_backend",
      accountRef: "account_alpha",
      orderRef: "order_alpha",
      paymentRef: "payment_alpha",
      partnerRef: "partner_alpha",
      campaignRef: "campaign_alpha",
      touchRef: "touch_alpha",
      occurredAt: "2026-07-07T02:00:00.000Z",
      recordedAt: "2026-07-07T02:01:00.000Z",
      metadataSummary: {
        currency: "USD",
        amountCents: 9900
      }
    });

    assert.equal(entitlement.eventType, "entitlement_delivered");
    assert.equal(payment.eventType, "payment_success");
    assert.equal(payment.status, "recorded");
    assert.deepEqual(payment.metadataSummary, {
      currency: "USD",
      amountCents: 9900
    });

    const events = ledger.listEvents({ orderRef: "order_alpha" });
    assert.deepEqual(events.map((event) => event.eventType), [
      "payment_success",
      "entitlement_delivered"
    ]);
  });
});

test("partner attribution event ledger collapses explicit and deterministic duplicate events", () => {
  withLedger((ledger) => {
    const first = ledger.recordEvent({
      eventType: "payment_success",
      source: "payment_backend",
      accountRef: "account_alpha",
      orderRef: "order_alpha",
      paymentRef: "payment_alpha",
      partnerRef: "partner_alpha",
      campaignRef: "campaign_alpha",
      touchRef: "touch_alpha",
      occurredAt: "2026-07-07T02:00:00.000Z",
      idempotencyKey: "payment_alpha_success_001",
      metadataSummary: {
        amountCents: 9900
      }
    });
    const duplicate = ledger.recordEvent({
      eventType: "payment_success",
      source: "payment_backend",
      accountRef: "account_alpha",
      orderRef: "order_alpha",
      paymentRef: "payment_alpha",
      partnerRef: "partner_alpha",
      campaignRef: "campaign_alpha",
      touchRef: "touch_alpha",
      occurredAt: "2026-07-07T02:00:00.000Z",
      idempotencyKey: "payment_alpha_success_001",
      metadataSummary: {
        amountCents: 19900
      }
    });

    assert.equal(duplicate.eventRef, first.eventRef);
    assert.equal(duplicate.duplicate, true);
    assert.deepEqual(duplicate.metadataSummary, {
      amountCents: 9900
    });

    const refund = ledger.recordEvent({
      eventType: "refund",
      source: "payment_backend",
      accountRef: "account_alpha",
      orderRef: "order_alpha",
      paymentRef: "payment_alpha",
      partnerRef: "partner_alpha",
      campaignRef: "campaign_alpha",
      touchRef: "touch_alpha",
      occurredAt: "2026-07-08T02:00:00.000Z"
    });
    const duplicateRefund = ledger.recordEvent({
      eventType: "refund",
      source: "payment_backend",
      accountRef: "account_alpha",
      orderRef: "order_alpha",
      paymentRef: "payment_alpha",
      partnerRef: "partner_alpha",
      campaignRef: "campaign_alpha",
      touchRef: "touch_alpha",
      occurredAt: "2026-07-08T02:00:00.000Z"
    });

    assert.equal(duplicateRefund.eventRef, refund.eventRef);
    assert.equal(duplicateRefund.duplicate, true);
    assert.match(refund.idempotencyKey, /^idem_/);
  });
});

test("partner attribution event ledger rejects unsupported events and unsafe material", () => {
  withLedger((ledger) => {
    assert.throws(
      () => ledger.recordEvent({
        eventType: "provider_payload",
        source: "provider_adapter",
        accountRef: "account_alpha",
        occurredAt: "2026-07-07T02:00:00.000Z"
      }),
      /eventType is invalid/i
    );

    assert.throws(
      () => ledger.recordEvent({
        eventType: "registration_success",
        source: "portal",
        accountRef: "account_private@example.test",
        occurredAt: "2026-07-07T02:00:00.000Z"
      }),
      /accountRef must be a safe reference/i
    );

    assert.throws(
      () => ledger.recordEvent({
        eventType: "registration_success",
        source: "portal",
        accountRef: "account_alpha",
        occurredAt: "2026-07-07T02:00:00.000Z",
        metadataSummary: {
          email: "private@example.test"
        }
      }),
      /unsafe field/i
    );

    assert.throws(
      () => ledger.recordEvent({
        eventType: "visit",
        source: "provider_adapter",
        partnerRef: "partner_alpha",
        campaignRef: "campaign_alpha",
        touchRef: "touch_alpha",
        occurredAt: "2026-07-07T01:00:00.000Z",
        providerEvidence: {
          rawPayload: {
            token: "not_allowed"
          }
        }
      }),
      /unsafe field/i
    );
  });
});

test("partner attribution event ledger returns settlement-safe summaries", () => {
  withLedger((ledger) => {
    ledger.recordEvent({
      eventType: "registration_success",
      source: "portal",
      accountRef: "account_alpha",
      partnerRef: "partner_alpha",
      campaignRef: "campaign_alpha",
      touchRef: "touch_alpha",
      occurredAt: "2026-07-07T01:00:00.000Z",
      idempotencyKey: "registration_alpha_001",
      metadataSummary: {
        route: "/portal/register"
      },
      providerEvidence: {
        provider: "manual_link",
        providerCampaignRef: "campaign_alpha"
      }
    });

    const summaries = ledger.listSettlementSafeEvents({ accountRef: "account_alpha" });
    assert.equal(summaries.length, 1);
    assert.deepEqual(summaries[0], {
      eventRef: summaries[0].eventRef,
      eventType: "registration_success",
      status: "recorded",
      source: "portal",
      accountRef: "account_alpha",
      orderRef: null,
      paymentRef: null,
      entitlementRef: null,
      partnerRef: "partner_alpha",
      campaignRef: "campaign_alpha",
      touchRef: "touch_alpha",
      occurredAt: "2026-07-07T01:00:00.000Z",
      recordedAt: summaries[0].recordedAt,
      metadataSummary: {
        route: "/portal/register"
      },
      providerEvidenceSummary: {
        provider: "manual_link",
        providerCampaignRef: "campaign_alpha"
      }
    });
    assert.equal("idempotencyKey" in summaries[0], false);
  });
});
