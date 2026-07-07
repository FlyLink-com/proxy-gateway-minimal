import test from "node:test";
import assert from "node:assert/strict";
import {
  createAppsFlyerAttributionAdapter
} from "../services/platform/appsflyer-attribution-adapter.mjs";

test("AppsFlyer adapter defaults to disabled and redacts credential state", () => {
  const adapter = createAppsFlyerAttributionAdapter({
    env: {
      APPSFLYER_DEV_KEY: "dev_key_should_not_be_returned",
      APPSFLYER_APP_ID: "app_safe_001",
      APPSFLYER_ATTRIBUTION_MODE: "disabled"
    }
  });

  assert.deepEqual(adapter.getConfigSummary(), {
    provider: "appsflyer",
    mode: "disabled",
    enabled: false,
    credentialConfigured: true,
    appIdConfigured: true,
    liveDispatchAllowed: false,
    redacted: true
  });
});

test("AppsFlyer adapter normalizes safe OneLink params and strips unsafe client claims", () => {
  const adapter = createAppsFlyerAttributionAdapter();

  const evidence = adapter.normalizeLandingParams({
    landingRoute: "/portal/register",
    params: {
      pid: "partner_alpha",
      c: "campaign_launch",
      af_channel: "creator",
      af_sub1: "creative_a",
      af_web_dp: "https://example.invalid/private",
      email: "customer@example.invalid",
      token: "token_should_not_pass",
      ignored: "plain_ignored"
    }
  });

  assert.equal(evidence.provider, "appsflyer");
  assert.equal(evidence.partnerRef, "partner_alpha");
  assert.equal(evidence.campaignRef, "campaign_launch");
  assert.equal(evidence.landingRoute, "/portal/register");
  assert.deepEqual(evidence.metadata, {
    pid: "partner_alpha",
    c: "campaign_launch",
    af_channel: "creator",
    af_sub1: "creative_a"
  });
  assert.deepEqual(evidence.strippedParams.sort(), ["af_web_dp", "email", "ignored", "token"]);
  assert.equal(JSON.stringify(evidence).includes("customer@example.invalid"), false);
  assert.equal(JSON.stringify(evidence).includes("https://example.invalid"), false);
});

test("AppsFlyer adapter builds dry-run S2S event plans without raw private payloads", () => {
  const adapter = createAppsFlyerAttributionAdapter({
    env: {
      APPSFLYER_ATTRIBUTION_MODE: "dry_run",
      APPSFLYER_WEB_DEV_KEY: "web_key_should_not_be_returned",
      APPSFLYER_APP_ID: "website-safe-app"
    }
  });

  const plan = adapter.planServerEvent({
    eventName: "purchase_confirmed",
    timestamp: 1790000000123,
    eventValue: {
      order_ref: "order_safe_001",
      amount_cents: 1200,
      customer_email: "customer@example.invalid",
      subscription_url: "https://portal.example.invalid/sub/token"
    },
    accountRef: "account_safe_001"
  });

  assert.deepEqual(plan, {
    provider: "appsflyer",
    mode: "dry_run",
    dryRun: true,
    dispatchBlocked: true,
    transport: {
      method: "POST",
      endpointTemplate: "https://webs2s.appsflyer.com/v1/{bundleId}/event",
      bundleIdConfigured: true,
      credentialFields: ["webDevKey"],
      requiredIdentifiers: ["customerUserId", "afUserId"]
    },
    payloadPreview: {
      customerUserId: "account_safe_001",
      eventType: "EVENT",
      eventName: "purchase_confirmed",
      timestamp: 1790000000123,
      eventValueKeys: ["amount_cents", "order_ref"],
      redactedCredentialFields: ["webDevKey"]
    },
    eventName: "purchase_confirmed",
    accountRef: "account_safe_001",
    eventValueKeys: ["amount_cents", "order_ref"],
    strippedEventValueKeys: ["customer_email", "subscription_url"],
    redacted: true
  });
  assert.equal(JSON.stringify(plan).includes("customer@example.invalid"), false);
  assert.equal(JSON.stringify(plan).includes("/sub/token"), false);
  assert.equal(JSON.stringify(plan).includes("web_key_should_not_be_returned"), false);
  assert.equal(JSON.stringify(plan).includes("website-safe-app"), false);
});

test("AppsFlyer adapter fails closed when S2S event plans have no safe user identifier", () => {
  const adapter = createAppsFlyerAttributionAdapter({
    env: {
      APPSFLYER_ATTRIBUTION_MODE: "dry_run"
    }
  });

  assert.throws(
    () => adapter.planServerEvent({
      eventName: "purchase_confirmed",
      eventValue: {
        order_ref: "order_safe_001"
      }
    }),
    /customerUserId or afUserId is required/
  );
});

test("AppsFlyer adapter builds dry-run Web SDK event plans without provider credentials", () => {
  const adapter = createAppsFlyerAttributionAdapter({
    env: {
      APPSFLYER_ATTRIBUTION_MODE: "dry_run",
      APPSFLYER_WEB_DEV_KEY: "web_key_should_not_be_returned"
    }
  });

  const plan = adapter.planWebSdkEvent({
    eventName: "registration_success",
    visitorRef: "visitor_safe_001",
    eventValue: {
      landing_route: "/portal/register",
      phone: "+15555550123"
    }
  });

  assert.deepEqual(plan, {
    provider: "appsflyer",
    mode: "dry_run",
    dryRun: true,
    dispatchBlocked: true,
    eventName: "registration_success",
    visitorRef: "visitor_safe_001",
    eventValueKeys: ["landing_route"],
    strippedEventValueKeys: ["phone"],
    redacted: true
  });
  assert.equal(JSON.stringify(plan).includes("web_key_should_not_be_returned"), false);
  assert.equal(JSON.stringify(plan).includes("+15555550123"), false);
});

test("AppsFlyer adapter rejects live dispatch without an explicit production gate", () => {
  assert.throws(
    () => createAppsFlyerAttributionAdapter({
      env: {
        APPSFLYER_ATTRIBUTION_MODE: "live",
        APPSFLYER_DEV_KEY: "dev_key_should_not_be_returned"
      }
    }),
    /live AppsFlyer dispatch requires an explicit production gate/
  );
});
