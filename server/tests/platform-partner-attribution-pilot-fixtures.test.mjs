import assert from "node:assert/strict";
import test from "node:test";
import {
  createPartnerAttributionPilotFixture
} from "../services/platform/partner-attribution-pilot-fixtures.mjs";

function withPilotFixture(fn) {
  const fixture = createPartnerAttributionPilotFixture({
    env: {
      APPSFLYER_ATTRIBUTION_MODE: "dry_run",
      APPSFLYER_APP_ID: "website-gccwebos.com",
      APPSFLYER_WEB_DEV_KEY: "web_key_should_not_be_returned"
    },
    now: "2026-07-07T00:00:00.000Z"
  });
  try {
    return fn(fixture);
  } finally {
    fixture.close();
  }
}

test("partner attribution pilot fixture proves the local AppsFlyer to settlement loop", () => {
  withPilotFixture((fixture) => {
    const proof = fixture.runClosedLoopProof({
      partnerRef: "partner_alpha",
      campaignRef: "campaign_launch",
      creativeRef: "creative_a",
      visitorRef: "visitor_alpha",
      sessionRef: "session_alpha",
      accountRef: "account_alpha",
      orderRef: "order_alpha",
      paymentRef: "payment_alpha",
      entitlementRef: "entitlement_alpha",
      amountCents: 9900,
      currency: "USD"
    });

    assert.equal(proof.provider, "appsflyer");
    assert.equal(proof.mode, "dry_run");
    assert.equal(proof.dryRun, true);
    assert.equal(proof.dispatchBlocked, true);
    assert.equal(proof.productionGateRequired, true);
    assert.equal(proof.link.landingRoute, "/portal/register");
    assert.equal(proof.link.partnerRef, "partner_alpha");
    assert.equal(proof.link.campaignRef, "campaign_launch");
    assert.equal(proof.partner.riskTier, "standard");
    assert.equal(proof.campaign.provider, "appsflyer");
    assert.deepEqual(proof.flow.eventTypes, [
      "visit",
      "registration_success",
      "checkout_started",
      "payment_success",
      "entitlement_delivered",
      "settlement_candidate_created"
    ]);
    assert.equal(proof.flow.touchCount, 1);
    assert.equal(proof.flow.eventCount, 7);
    assert.equal(proof.flow.candidateCount, 1);
    assert.equal(proof.settlement.status, "frozen");
    assert.equal(proof.settlement.amountCents, 2500);
    assert.equal(proof.settlement.reconciliationStatus, "payable_review_allowed");
    assert.deepEqual(proof.settlement.reconciliationBlockers, []);
    assert.equal(proof.adminReport.status, "ready");
    assert.deepEqual(proof.adminReport.summary, {
      partnerCount: 1,
      campaignCount: 1,
      touchCount: 1,
      eventCount: 7,
      settlementCandidateCount: 1,
      payableReviewCount: 0,
      reversedCount: 0
    });
    assert.equal(proof.adminReport.guardrails.privacyBoundaryOk, true);
    assert.equal(proof.adminReport.guardrails.reconciliation.payableReviewAllowedCount, 1);
    assert.equal(proof.safety.summaryOnly, true);
    assert.equal(proof.safety.liveDispatchAllowed, false);
  });
});

test("partner attribution pilot fixture strips unsafe link params and never echoes private values", () => {
  withPilotFixture((fixture) => {
    const proof = fixture.runClosedLoopProof({
      partnerRef: "partner_alpha",
      campaignRef: "campaign_launch",
      extraParams: {
        af_sub5: "segment_safe",
        customer_email: "customer@example.invalid",
        redirect_url: "https://example.invalid/private",
        token: "token_should_not_pass"
      }
    });

    assert.deepEqual(proof.link.strippedParams, ["customer_email", "redirect_url", "token"]);
    assert.equal(proof.link.queryParams.af_sub5, "segment_safe");
    assert.equal(JSON.stringify(proof).includes("customer@example.invalid"), false);
    assert.equal(JSON.stringify(proof).includes("https://example.invalid/private"), false);
    assert.equal(JSON.stringify(proof).includes("token_should_not_pass"), false);
    assert.equal(JSON.stringify(proof).includes("web_key_should_not_be_returned"), false);
  });
});

test("partner attribution pilot fixture exposes a default seed hook for future extensions", () => {
  withPilotFixture((fixture) => {
    const { partner, campaign } = fixture.seedPilotPartnerCampaign();

    assert.equal(partner.partnerRef, "partner_alpha");
    assert.equal(partner.status, "active");
    assert.equal(partner.riskTier, "standard");
    assert.equal(campaign.campaignRef, "campaign_launch");
    assert.equal(campaign.provider, "appsflyer");
    assert.deepEqual(campaign.allowedParams.slice(0, 4), [
      "partner_ref",
      "campaign_ref",
      "pid",
      "c"
    ]);
    assert.equal(fixture.settlementEngine.getSettlementPolicy("policy_first_payment_cpa").status, "active");
  });
});

test("partner attribution pilot fixture rejects unsafe pilot refs and unapproved routes", () => {
  withPilotFixture((fixture) => {
    assert.throws(
      () => fixture.runClosedLoopProof({
        partnerRef: "https://partner.example.invalid",
        campaignRef: "campaign_launch"
      }),
      /partnerRef must be a safe reference/
    );
    assert.throws(
      () => fixture.runClosedLoopProof({
        partnerRef: "partner_alpha",
        campaignRef: "campaign_launch",
        landingRoute: "/admin"
      }),
      /landingRoute is not approved/
    );
  });
});
