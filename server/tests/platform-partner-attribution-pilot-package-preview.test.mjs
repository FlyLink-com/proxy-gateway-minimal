import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPartnerAttributionPilotPackagePreview
} from "../services/platform/partner-attribution-pilot-package-preview.mjs";

const DRY_RUN_ENV = {
  APPSFLYER_ATTRIBUTION_MODE: "dry_run",
  APPSFLYER_APP_ID: "website-gccwebos.com",
  APPSFLYER_WEB_DEV_KEY: "web_key_should_not_be_returned"
};

test("pilot package preview builds safe partner links and dry-run event plans", () => {
  const preview = buildPartnerAttributionPilotPackagePreview({
    env: DRY_RUN_ENV,
    packageRef: "pilot_package_alpha",
    partnerRef: "partner_alpha",
    campaignRef: "campaign_launch",
    creativeRefs: ["creative_a", "creative_b"],
    landingRoute: "/portal/register",
    visitorRef: "visitor_preview",
    accountRef: "account_preview",
    extraParams: {
      af_sub5: "segment_safe"
    }
  });

  assert.equal(preview.type, "partner_attribution_pilot_package_preview");
  assert.equal(preview.provider, "appsflyer");
  assert.equal(preview.mode, "dry_run");
  assert.equal(preview.status, "ready");
  assert.equal(preview.dryRun, true);
  assert.equal(preview.dispatchBlocked, true);
  assert.equal(preview.productionGateRequired, true);
  assert.equal(preview.packageRef, "pilot_package_alpha");
  assert.equal(preview.partnerRef, "partner_alpha");
  assert.equal(preview.campaignRef, "campaign_launch");
  assert.deepEqual(preview.links.map((link) => link.creativeRef), ["creative_a", "creative_b"]);
  assert.equal(
    preview.links[0].landingPath,
    "/portal/register?pid=partner_alpha&c=campaign_launch&partner_ref=partner_alpha&campaign_ref=campaign_launch&af_channel=partner&af_sub1=partner_alpha&af_sub2=creative_a&utm_source=partner_alpha&utm_medium=partner&utm_campaign=campaign_launch&utm_content=creative_a&af_sub5=segment_safe"
  );
  assert.equal(
    preview.links[1].landingPath,
    "/portal/register?pid=partner_alpha&c=campaign_launch&partner_ref=partner_alpha&campaign_ref=campaign_launch&af_channel=partner&af_sub1=partner_alpha&af_sub2=creative_b&utm_source=partner_alpha&utm_medium=partner&utm_campaign=campaign_launch&utm_content=creative_b&af_sub5=segment_safe"
  );
  assert.deepEqual(preview.eventPlans.webSdk.map((plan) => plan.eventName), [
    "registration_success",
    "checkout_started"
  ]);
  assert.deepEqual(preview.eventPlans.server.map((plan) => plan.eventName), [
    "purchase_confirmed",
    "entitlement_delivered"
  ]);
  assert.equal(preview.eventPlans.webSdk.every((plan) => plan.dispatchBlocked), true);
  assert.equal(preview.eventPlans.server.every((plan) => plan.dispatchBlocked), true);
  assert.deepEqual(preview.adminPreview, {
    packageRef: "pilot_package_alpha",
    provider: "appsflyer",
    partnerRef: "partner_alpha",
    campaignRef: "campaign_launch",
    landingRoute: "/portal/register",
    linkCount: 2,
    webSdkEventCount: 2,
    serverEventCount: 2,
    strippedParamNames: [],
    strippedEventValueKeys: [],
    requiredReviews: [
      "partner_approved",
      "campaign_approved",
      "privacy_boundary_reviewed",
      "production_gate_required"
    ]
  });
  assert.deepEqual(preview.safety, {
    summaryOnly: true,
    redacted: true,
    credentialConfigured: true,
    appIdConfigured: true,
    liveDispatchAllowed: false,
    rawValuesReturned: false,
    mutationAllowed: false
  });
});

test("pilot package preview strips unsafe params and event values without echoing them", () => {
  const preview = buildPartnerAttributionPilotPackagePreview({
    env: DRY_RUN_ENV,
    packageRef: "pilot_package_alpha",
    partnerRef: "partner_alpha",
    campaignRef: "campaign_launch",
    creativeRefs: ["creative_a"],
    extraParams: {
      af_sub5: "segment_safe",
      customer_email: "customer@example.invalid",
      redirect_url: "https://example.invalid/private",
      token: "token_should_not_pass"
    },
    eventValueHints: {
      cohort: "pilot_safe",
      customer_email: "customer@example.invalid",
      subscription_url: "https://portal.example.invalid/sub/token",
      runtime_config: "vless://should_not_pass"
    }
  });

  assert.deepEqual(preview.links[0].strippedParams, ["customer_email", "redirect_url", "token"]);
  assert.deepEqual(preview.adminPreview.strippedParamNames, [
    "customer_email",
    "redirect_url",
    "token"
  ]);
  assert.deepEqual(preview.adminPreview.strippedEventValueKeys, [
    "customer_email",
    "runtime_config",
    "subscription_url"
  ]);
  assert.equal(JSON.stringify(preview).includes("customer@example.invalid"), false);
  assert.equal(JSON.stringify(preview).includes("https://example.invalid/private"), false);
  assert.equal(JSON.stringify(preview).includes("https://portal.example.invalid/sub/token"), false);
  assert.equal(JSON.stringify(preview).includes("token_should_not_pass"), false);
  assert.equal(JSON.stringify(preview).includes("vless://should_not_pass"), false);
  assert.equal(JSON.stringify(preview).includes("web_key_should_not_be_returned"), false);
  assert.equal(JSON.stringify(preview).includes("website-gccwebos.com"), false);
});

test("pilot package preview fails closed for unsafe refs routes and live mode", () => {
  assert.throws(
    () => buildPartnerAttributionPilotPackagePreview({
      env: DRY_RUN_ENV,
      packageRef: "pilot_package_alpha",
      partnerRef: "https://partner.example.invalid",
      campaignRef: "campaign_launch"
    }),
    /partnerRef must be a safe reference/
  );
  assert.throws(
    () => buildPartnerAttributionPilotPackagePreview({
      env: DRY_RUN_ENV,
      packageRef: "pilot_package_alpha",
      partnerRef: "partner_alpha",
      campaignRef: "campaign_launch",
      landingRoute: "/admin"
    }),
    /landingRoute is not approved/
  );
  assert.throws(
    () => buildPartnerAttributionPilotPackagePreview({
      env: {
        APPSFLYER_ATTRIBUTION_MODE: "live",
        APPSFLYER_WEB_DEV_KEY: "web_key_should_not_be_returned"
      },
      packageRef: "pilot_package_alpha",
      partnerRef: "partner_alpha",
      campaignRef: "campaign_launch"
    }),
    /live AppsFlyer dispatch requires an explicit production gate/
  );
});
