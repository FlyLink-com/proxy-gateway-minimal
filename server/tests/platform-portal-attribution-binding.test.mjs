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
  createPartnerAttributionStore
} from "../services/platform/partner-attribution-store.mjs";
import {
  createPortalAttributionBindingService
} from "../services/platform/portal-attribution-binding.mjs";

function withBindingService(fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "platform-portal-attribution-binding-"));
  const db = new Database(join(tempDir, "control.sqlite"));
  const attributionStore = createPartnerAttributionStore({ database: db });
  const eventLedger = createPartnerAttributionEventLedger({ database: db });
  const service = createPortalAttributionBindingService({
    database: db,
    attributionStore,
    eventLedger
  });
  try {
    seedPartnerCampaign(attributionStore);
    return fn({ service, attributionStore, eventLedger });
  } finally {
    service.close();
    db.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

function seedPartnerCampaign(attributionStore) {
  const now = "2026-07-07T00:00:00.000Z";
  attributionStore.upsertPartner({
    partnerRef: "partner_alpha",
    status: "active",
    riskTier: "standard",
    payoutPolicyRef: "policy_first_payment_cpa",
    defaultAttributionWindowDays: 30,
    safeDisplayName: "Partner Alpha",
    createdAt: now,
    updatedAt: now
  });
  attributionStore.upsertCampaign({
    campaignRef: "campaign_alpha",
    partnerRef: "partner_alpha",
    status: "active",
    provider: "manual_link",
    landingRoute: "/portal/register",
    allowedParams: [
      "partner_ref",
      "campaign_ref",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "pid",
      "c",
      "af_sub1"
    ],
    attributionWindowDays: 14,
    createdAt: now,
    updatedAt: now
  });
}

test("portal attribution binding captures safe landing params and strips client-only claims", () => {
  withBindingService(({ service, eventLedger }) => {
    const result = service.captureLandingAttribution({
      landingRoute: "/portal/register",
      visitorRef: "visitor_alpha",
      sessionRef: "session_alpha_1",
      observedAt: "2026-07-07T01:00:00.000Z",
      params: {
        partner_ref: "partner_alpha",
        campaign_ref: "campaign_alpha",
        utm_source: "creator",
        utm_campaign: "launch",
        entitlement_ref: "entitlement_client_claim",
        settlement_candidate_ref: "candidate_client_claim",
        redirect_url: "https://example.test/steal"
      }
    });

    assert.equal(result.touch.partnerRef, "partner_alpha");
    assert.equal(result.touch.campaignRef, "campaign_alpha");
    assert.deepEqual(result.touch.normalizedParams, {
      partner_ref: "partner_alpha",
      campaign_ref: "campaign_alpha",
      utm_source: "creator",
      utm_campaign: "launch"
    });
    assert.deepEqual(result.strippedParams.sort(), [
      "entitlement_ref",
      "redirect_url",
      "settlement_candidate_ref"
    ]);

    const visits = eventLedger.listSettlementSafeEvents({ eventType: "visit" });
    assert.equal(visits.length, 1);
    assert.equal(visits[0].source, "portal");
    assert.equal(visits[0].touchRef, result.touch.touchRef);
    assert.equal("idempotencyKey" in visits[0], false);
  });
});

test("portal attribution binding attaches first last and session touches to registration and orders", () => {
  withBindingService(({ service, eventLedger }) => {
    const first = service.captureLandingAttribution({
      landingRoute: "/portal/register",
      visitorRef: "visitor_alpha",
      sessionRef: "session_alpha_1",
      observedAt: "2026-07-07T01:00:00.000Z",
      params: {
        partner_ref: "partner_alpha",
        campaign_ref: "campaign_alpha",
        utm_source: "creator_first"
      }
    });
    const last = service.captureLandingAttribution({
      landingRoute: "/portal/register",
      visitorRef: "visitor_alpha",
      sessionRef: "session_alpha_2",
      observedAt: "2026-07-07T02:00:00.000Z",
      params: {
        partner_ref: "partner_alpha",
        campaign_ref: "campaign_alpha",
        utm_source: "creator_last"
      }
    });

    const registration = service.bindRegistration({
      accountRef: "account_alpha",
      visitorRef: "visitor_alpha",
      sessionRef: "session_alpha_2",
      occurredAt: "2026-07-07T03:00:00.000Z",
      clientSubmitted: {
        settlementCandidateRef: "candidate_client_claim"
      }
    });

    assert.equal(registration.accountRef, "account_alpha");
    assert.equal(registration.firstTouchRef, first.touch.touchRef);
    assert.equal(registration.lastTouchRef, last.touch.touchRef);
    assert.equal(registration.sessionTouchRef, last.touch.touchRef);
    assert.equal(registration.selectedTouchRef, last.touch.touchRef);

    const order = service.bindOrder({
      accountRef: "account_alpha",
      orderRef: "order_alpha",
      occurredAt: "2026-07-07T03:05:00.000Z",
      clientSubmitted: {
        paymentRef: "payment_client_claim",
        entitlementRef: "entitlement_client_claim"
      }
    });

    assert.equal(order.orderRef, "order_alpha");
    assert.equal(order.accountRef, "account_alpha");
    assert.equal(order.selectedTouchRef, last.touch.touchRef);
    assert.equal(order.partnerRef, "partner_alpha");

    assert.deepEqual(
      eventLedger.listSettlementSafeEvents({ accountRef: "account_alpha" }).map((event) => event.eventType),
      ["registration_success", "checkout_started"]
    );
  });
});

test("portal attribution binding emits backend payment and entitlement facts without trusting client claims", () => {
  withBindingService(({ service, eventLedger }) => {
    service.captureLandingAttribution({
      landingRoute: "/portal/register",
      visitorRef: "visitor_alpha",
      sessionRef: "session_alpha_1",
      observedAt: "2026-07-07T01:00:00.000Z",
      params: {
        partner_ref: "partner_alpha",
        campaign_ref: "campaign_alpha",
        utm_source: "creator"
      }
    });
    service.bindRegistration({
      accountRef: "account_alpha",
      visitorRef: "visitor_alpha",
      sessionRef: "session_alpha_1",
      occurredAt: "2026-07-07T02:00:00.000Z"
    });
    service.bindOrder({
      accountRef: "account_alpha",
      orderRef: "order_alpha",
      occurredAt: "2026-07-07T02:05:00.000Z"
    });

    const payment = service.recordBackendPaymentSuccess({
      orderRef: "order_alpha",
      paymentRef: "payment_alpha",
      occurredAt: "2026-07-07T02:10:00.000Z",
      metadataSummary: {
        currency: "USD",
        amountCents: 9900
      },
      clientSubmitted: {
        partnerRef: "partner_attacker",
        entitlementRef: "entitlement_client_claim",
        settlementCandidateRef: "candidate_client_claim"
      }
    });
    const entitlement = service.recordBackendEntitlementDelivered({
      orderRef: "order_alpha",
      paymentRef: "payment_alpha",
      entitlementRef: "entitlement_alpha",
      occurredAt: "2026-07-07T02:20:00.000Z",
      clientSubmitted: {
        settlementCandidateRef: "candidate_client_claim"
      }
    });

    assert.equal(payment.partnerRef, "partner_alpha");
    assert.equal(payment.entitlementRef, null);
    assert.equal(entitlement.entitlementRef, "entitlement_alpha");
    assert.equal(entitlement.partnerRef, "partner_alpha");

    const events = eventLedger.listSettlementSafeEvents({ orderRef: "order_alpha" });
    assert.deepEqual(events.map((event) => event.eventType), [
      "checkout_started",
      "payment_success",
      "entitlement_delivered"
    ]);
    assert.deepEqual(events[1].metadataSummary, {
      currency: "USD",
      amountCents: 9900
    });
    assert.equal(events.some((event) => JSON.stringify(event).includes("partner_attacker")), false);
    assert.equal(events.some((event) => JSON.stringify(event).includes("candidate_client_claim")), false);
  });
});

test("portal attribution binding rejects disallowed routes and unsafe refs", () => {
  withBindingService(({ service }) => {
    assert.throws(
      () => service.captureLandingAttribution({
        landingRoute: "/admin",
        visitorRef: "visitor_alpha",
        sessionRef: "session_alpha_1",
        params: {
          partner_ref: "partner_alpha",
          campaign_ref: "campaign_alpha"
        }
      }),
      /landingRoute is not approved/i
    );

    assert.throws(
      () => service.bindRegistration({
        accountRef: "private@example.test",
        visitorRef: "visitor_alpha",
        sessionRef: "session_alpha_1"
      }),
      /accountRef must be a safe reference/i
    );
  });
});
