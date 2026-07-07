import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createPartnerAttributionStore
} from "../services/platform/partner-attribution-store.mjs";

function withStore(fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "platform-partner-attribution-"));
  let store;
  try {
    store = createPartnerAttributionStore({
      dbPath: join(tempDir, "control.sqlite")
    });
    return fn(store);
  } finally {
    store?.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

test("partner attribution store persists safe partner and campaign records", () => {
  withStore((store) => {
    const now = "2026-07-07T00:00:00.000Z";
    const partner = store.upsertPartner({
      partnerRef: "partner_affiliate_alpha",
      status: "active",
      riskTier: "standard",
      payoutPolicyRef: "policy_first_payment_cpa",
      defaultAttributionWindowDays: 30,
      safeDisplayName: "Affiliate Alpha",
      metadataSummary: {
        channel: "creator",
        region: "jp"
      },
      createdAt: now,
      updatedAt: now
    });

    assert.equal(partner.partnerRef, "partner_affiliate_alpha");
    assert.equal(partner.status, "active");
    assert.equal(partner.defaultAttributionWindowDays, 30);
    assert.deepEqual(partner.metadataSummary, {
      channel: "creator",
      region: "jp"
    });

    const campaign = store.upsertCampaign({
      campaignRef: "campaign_alpha_launch",
      partnerRef: partner.partnerRef,
      status: "active",
      provider: "manual_link",
      providerCampaignId: "alpha_launch",
      landingRoute: "/portal/register",
      allowedParams: ["utm_source", "utm_medium", "campaign_ref", "utm_source"],
      attributionWindowDays: 14,
      createdAt: now,
      updatedAt: now
    });

    assert.equal(campaign.campaignRef, "campaign_alpha_launch");
    assert.equal(campaign.partnerRef, partner.partnerRef);
    assert.deepEqual(campaign.allowedParams, ["utm_source", "utm_medium", "campaign_ref"]);
    assert.equal(campaign.attributionWindowDays, 14);
  });
});

test("partner attribution store normalizes touches and applies idempotency", () => {
  withStore((store) => {
    const now = "2026-07-07T00:00:00.000Z";
    store.upsertPartner({
      partnerRef: "partner_affiliate_alpha",
      status: "active",
      riskTier: "standard",
      payoutPolicyRef: "policy_first_payment_cpa",
      defaultAttributionWindowDays: 30,
      safeDisplayName: "Affiliate Alpha",
      createdAt: now,
      updatedAt: now
    });
    store.upsertCampaign({
      campaignRef: "campaign_alpha_launch",
      partnerRef: "partner_affiliate_alpha",
      status: "active",
      provider: "manual_link",
      landingRoute: "/portal/register",
      allowedParams: ["utm_source", "utm_campaign", "campaign_ref"],
      createdAt: now,
      updatedAt: now
    });

    const first = store.recordAttributionTouch({
      provider: "manual_link",
      partnerRef: "partner_affiliate_alpha",
      campaignRef: "campaign_alpha_launch",
      visitorRef: "visitor_safe_001",
      sessionRef: "session_safe_001",
      providerClickRef: "click_safe_001",
      landingRoute: "/portal/register",
      touchType: "session_touch",
      observedAt: "2026-07-07T01:00:00.000Z",
      idempotencyKey: "touch_alpha_001",
      params: {
        utm_source: "partner_alpha",
        utm_campaign: "launch",
        ignored_param: "not_persisted"
      },
      metadataSummary: {
        adapter: "manual"
      }
    });
    const duplicate = store.recordAttributionTouch({
      provider: "manual_link",
      partnerRef: "partner_affiliate_alpha",
      campaignRef: "campaign_alpha_launch",
      visitorRef: "visitor_safe_001",
      sessionRef: "session_safe_001",
      landingRoute: "/portal/register",
      touchType: "session_touch",
      observedAt: "2026-07-07T01:05:00.000Z",
      idempotencyKey: "touch_alpha_001",
      params: {
        utm_source: "partner_alpha_changed"
      }
    });

    assert.equal(duplicate.touchRef, first.touchRef);
    assert.equal(duplicate.duplicate, true);
    assert.deepEqual(first.normalizedParams, {
      utm_source: "partner_alpha",
      utm_campaign: "launch"
    });

    const second = store.recordAttributionTouch({
      provider: "manual_link",
      partnerRef: "partner_affiliate_alpha",
      campaignRef: "campaign_alpha_launch",
      visitorRef: "visitor_safe_001",
      sessionRef: "session_safe_002",
      providerClickRef: "click_safe_002",
      landingRoute: "/portal/register",
      touchType: "last_touch",
      observedAt: "2026-07-07T02:00:00.000Z",
      idempotencyKey: "touch_alpha_002",
      params: {
        utm_source: "partner_alpha",
        campaign_ref: "campaign_alpha_launch"
      }
    });

    assert.equal(second.isFirstTouch, false);
    assert.equal(second.isLastTouch, true);

    const touches = store.listAttributionTouches({ visitorRef: "visitor_safe_001" });
    assert.equal(touches.length, 2);
    assert.deepEqual(touches.map((touch) => [touch.idempotencyKey, touch.isFirstTouch, touch.isLastTouch]), [
      ["touch_alpha_001", true, false],
      ["touch_alpha_002", false, true]
    ]);
  });
});

test("partner attribution store rejects unsafe private fields and values", () => {
  withStore((store) => {
    assert.throws(
      () => store.upsertPartner({
        partnerRef: "partner_unsafe",
        status: "active",
        riskTier: "standard",
        payoutPolicyRef: "policy_manual_review",
        defaultAttributionWindowDays: 30,
        safeDisplayName: "Unsafe",
        metadataSummary: {
          email: "private@example.test"
        }
      }),
      /unsafe field/i
    );

    assert.throws(
      () => store.upsertCampaign({
        campaignRef: "campaign_unsafe",
        partnerRef: "partner_missing",
        status: "active",
        provider: "manual_link",
        landingRoute: "https://example.test/portal",
        allowedParams: ["utm_source"]
      }),
      /landingRoute must be a safe route/i
    );
  });
});
