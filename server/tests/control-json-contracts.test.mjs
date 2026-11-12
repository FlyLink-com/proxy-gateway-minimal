import assert from "node:assert/strict";
import test from "node:test";

import {
  coinCommerceSubscriptionFulfillmentMetadataJson,
  portalAccessEventJson,
  projectAccountMetadataForD1
} from "../services/platform/control-json-contracts.mjs";

const NOW = "2026-11-07T00:00:00.000Z";

function fulfillmentMetadata(overrides = {}) {
  return {
    version: 1,
    commandRef: "coincmd_synthetic_001",
    orderRef: "coinord_synthetic_001",
    accountId: "acct_synthetic_001",
    requestRef: "pareq_synthetic_001",
    entitlementRef: "ent_synthetic_001",
    issuedLinkRef: "issuedlink_synthetic_001",
    tenantRef: "tenantref_synthetic_001",
    artifactRef: "artifactref_synthetic_001",
    offerVersionRef: "offerv_plan_30d_100gb_monthly_v1",
    portalPlan: "monthly",
    durationDays: 30,
    monthlyTrafficGb: 100,
    trafficLimitBytes: 100 * 1024 ** 3,
    validFrom: NOW,
    previousValidUntil: "2026-10-07T00:00:00.000Z",
    targetValidUntil: "2026-12-07T00:00:00.000Z",
    ...overrides
  };
}

test("portal access event JSON accepts only registered discriminated variants", () => {
  assert.equal(portalAccessEventJson(null), "{}");
  assert.equal(portalAccessEventJson({}), "{}");

  const events = [
    {
      type: "traffic_supply_suspended",
      occurredAt: NOW,
      previousStatus: "delivered",
      lifecycleRevisionRef: "lifecycle_ref_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    },
    {
      type: "subscription_disabled",
      occurredAt: NOW,
      previousStatus: "issued"
    },
    {
      type: "subscription_disabled",
      occurredAt: NOW,
      previousStatus: "disabled"
    },
    {
      type: "subscription_expired",
      occurredAt: NOW,
      previousStatus: "delivered",
      lifecycleRevisionRef: "lifecycle_ref_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    },
    {
      type: "traffic_supply_resumed",
      occurredAt: NOW,
      lifecycleRevisionRef: "lifecycle_ref_cccccccccccccccccccccccccccccccc"
    },
    { type: "delivery_generation_reissued", occurredAt: NOW },
    { type: "subscription_link_reset", occurredAt: NOW },
    {
      type: "wallet_first_resource_effect_applied",
      transitionRef: "wfxtransition_synthetic_001",
      effectRef: "wfxeffect_synthetic_001",
      occurredAt: NOW
    }
  ];
  for (const event of events) {
    assert.deepEqual(JSON.parse(portalAccessEventJson(event)), event);
  }
});

test("portal access event JSON rejects unknown types, fields, timestamps and unsafe refs", () => {
  const invalid = [
    { type: "old_link_invalidated", occurredAt: NOW },
    { type: "delivery_generation_reissued", occurredAt: NOW, rawArtifactMaterial: "not-allowed" },
    { type: "traffic_supply_suspended", occurredAt: NOW, previousStatus: "pending" },
    { type: "traffic_supply_resumed", occurredAt: NOW, lifecycleRevisionRef: "https://example.invalid" },
    {
      type: "wallet_first_resource_effect_applied",
      transitionRef: "wfxtransition_synthetic_001",
      effectRef: "effect https://example.invalid",
      occurredAt: NOW
    },
    { type: "subscription_link_reset", occurredAt: "2026-02-30T00:00:00.000Z" }
  ];
  for (const event of invalid) {
    assert.throws(() => portalAccessEventJson(event), { code: "validation_error" });
  }
});

test("portal access event JSON rejects accessors, symbols and non-enumerable fields", () => {
  const accessor = { type: "delivery_generation_reissued", occurredAt: NOW };
  Object.defineProperty(accessor, "extra", { enumerable: true, get: () => "not-allowed" });
  assert.throws(() => portalAccessEventJson(accessor), { code: "validation_error" });

  const symbol = { type: "delivery_generation_reissued", occurredAt: NOW };
  symbol[Symbol("extra")] = true;
  assert.throws(() => portalAccessEventJson(symbol), { code: "validation_error" });

  const hidden = { type: "delivery_generation_reissued", occurredAt: NOW };
  Object.defineProperty(hidden, "extra", { enumerable: false, value: true });
  assert.throws(() => portalAccessEventJson(hidden), { code: "validation_error" });
});

test("shared JSON contracts reject hostile proxy traps without leaking details", () => {
  const marker = "RAW_PROXY_TRAP_MARKER";
  const eventProxy = new Proxy(
    { type: "delivery_generation_reissued", occurredAt: NOW },
    { ownKeys() { throw new Error(marker); } }
  );
  assert.throws(
    () => portalAccessEventJson(eventProxy),
    (error) => error?.code === "validation_error" && !error.message.includes(marker)
  );

  const metadataProxy = new Proxy(fulfillmentMetadata(), {
    getPrototypeOf() { throw new Error(marker); }
  });
  assert.throws(
    () => coinCommerceSubscriptionFulfillmentMetadataJson(metadataProxy),
    (error) => error?.code === "validation_error" && !error.message.includes(marker)
  );
});

test("subscription fulfillment audit JSON accepts the exact base and switch variants", () => {
  const base = fulfillmentMetadata();
  assert.deepEqual(JSON.parse(coinCommerceSubscriptionFulfillmentMetadataJson(base)), base);

  const switchMetadata = fulfillmentMetadata({
    previousValidUntil: "2026-12-07T00:00:00.000Z",
    targetValidUntil: "2026-12-07T00:00:00.000Z",
    switchKind: "upgrade_inplace"
  });
  assert.deepEqual(JSON.parse(coinCommerceSubscriptionFulfillmentMetadataJson(switchMetadata)), switchMetadata);

  const restartMetadata = fulfillmentMetadata({
    switchKind: "upgrade_restart"
  });
  assert.deepEqual(JSON.parse(coinCommerceSubscriptionFulfillmentMetadataJson(restartMetadata)), restartMetadata);
});

test("subscription fulfillment audit JSON rejects extra keys, invalid refs, units and dates", () => {
  const invalid = [
    fulfillmentMetadata({ extra: "not-allowed" }),
    fulfillmentMetadata({ version: 2 }),
    fulfillmentMetadata({ accountId: "person@example.invalid" }),
    fulfillmentMetadata({ requestRef: "https://example.invalid" }),
    fulfillmentMetadata({ portalPlan: "weekly" }),
    fulfillmentMetadata({ trafficLimitBytes: 1 }),
    fulfillmentMetadata({ durationDays: "30" }),
    fulfillmentMetadata({ validFrom: "2026-02-30T00:00:00.000Z" }),
    fulfillmentMetadata({ switchKind: "unknown" }),
    fulfillmentMetadata({
      previousValidUntil: "2026-12-07T00:00:00.000Z",
      targetValidUntil: "2026-12-07T00:00:00.000Z"
    })
  ];
  for (const metadata of invalid) {
    assert.throws(
      () => coinCommerceSubscriptionFulfillmentMetadataJson(metadata),
      { code: "validation_error" }
    );
  }
});

test("subscription fulfillment audit JSON rejects accessors and non-plain objects", () => {
  const accessor = fulfillmentMetadata();
  Object.defineProperty(accessor, "accountId", {
    enumerable: true,
    get: () => "acct_synthetic_001"
  });
  assert.throws(() => coinCommerceSubscriptionFulfillmentMetadataJson(accessor), {
    code: "validation_error"
  });
  assert.throws(() => coinCommerceSubscriptionFulfillmentMetadataJson([]), {
    code: "validation_error"
  });
});

test("D1 account metadata projection emits only the versioned safe business/legal allowlist", () => {
  const result = projectAccountMetadataForD1({
    initialAccount: false,
    requireSecuritySetup: true,
    registrationSource: "self_service_portal",
    singleSubscriptionOnly: true,
    subscriptionLimit: 1,
    intentPlan: "trial",
    requestedDeviceCount: 2,
    primaryRegion: "japan",
    legalAgreementAccepted: true,
    legalAgreementAcceptedAt: NOW,
    termsVersion: "2026-07-02",
    privacyVersion: "2026-07-02"
  });
  assert.equal(result.status, "ready");
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(result.sourceOnlyFields, []);
  assert.deepEqual(JSON.parse(result.metadataJson), {
    version: 1,
    initialAccount: false,
    requireSecuritySetup: true,
    registrationSource: "self_service_portal",
    singleSubscriptionOnly: true,
    subscriptionLimit: 1,
    intentPlan: "trial",
    requestedDeviceCount: 2,
    primaryRegion: "japan",
    legalAgreementAccepted: true,
    legalAgreementAcceptedAt: NOW,
    termsVersion: "2026-07-02",
    privacyVersion: "2026-07-02"
  });
});

test("D1 account metadata projection drops only explicitly source-only markers", () => {
  const result = projectAccountMetadataForD1({
    source: "operator_provisioning_form",
    channel: "manual",
    synthetic: true
  });
  assert.equal(result.status, "ready");
  assert.equal(result.metadataJson, '{"version":1}');
  assert.deepEqual(result.sourceOnlyFields, ["channel", "source", "synthetic"]);
});

test("D1 account metadata projection blocks raw identity fields without echoing values", () => {
  const result = projectAccountMetadataForD1({
    loginRef: "member@example.test",
    displayRef: "Member Example",
    displayName: "Member Example"
  });
  assert.equal(result.status, "blocked");
  assert.equal(result.metadataJson, null);
  assert.deepEqual(result.blockers, [{
    code: "identity_externalization_required",
    fields: ["displayName", "displayRef", "loginRef"]
  }]);
  assert.doesNotMatch(JSON.stringify(result), /member@example\.test|Member Example/);
});

test("D1 account metadata projection blocks legacy unkeyed SHA-256 digests", () => {
  const digest = "a".repeat(64);
  const result = projectAccountMetadataForD1({
    loginDigest: digest,
    contactDigest: digest,
    registrationSourceIpDigest: digest,
    registrationRequestKeyDigest: digest
  });
  assert.equal(result.status, "blocked");
  assert.equal(result.metadataJson, null);
  assert.deepEqual(result.blockers, [{
    code: "keyed_digest_replacement_required",
    fields: [
      "contactDigest",
      "loginDigest",
      "registrationRequestKeyDigest",
      "registrationSourceIpDigest"
    ]
  }]);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(digest));
});

test("D1 account metadata projection reports identity and digest blockers together", () => {
  const result = projectAccountMetadataForD1({
    loginRef: "private@example.test",
    loginDigest: "b".repeat(64)
  });
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.blockers.map((item) => item.code), [
    "identity_externalization_required",
    "keyed_digest_replacement_required"
  ]);
});

test("D1 account metadata projection rejects unknown fields and malformed safe values", () => {
  assert.throws(() => projectAccountMetadataForD1({ arbitrary: "not-allowed" }), {
    code: "validation_error"
  });
  assert.throws(() => projectAccountMetadataForD1({ registrationSource: "admin" }), {
    code: "validation_error"
  });
  assert.throws(() => projectAccountMetadataForD1({ requestedDeviceCount: 0 }), {
    code: "validation_error"
  });
  assert.throws(() => projectAccountMetadataForD1({ legalAgreementAcceptedAt: "2026-02-30T00:00:00.000Z" }), {
    code: "validation_error"
  });
  assert.throws(() => projectAccountMetadataForD1({ source: "https://example.invalid" }), {
    code: "validation_error"
  });
});

test("D1 account metadata projection rejects accessors, proxies and non-plain objects", () => {
  const accessor = {};
  Object.defineProperty(accessor, "registrationSource", {
    enumerable: true,
    get: () => "self_service_portal"
  });
  assert.throws(() => projectAccountMetadataForD1(accessor), { code: "validation_error" });
  const proxy = new Proxy({}, { ownKeys() { throw new Error("raw trap marker"); } });
  assert.throws(
    () => projectAccountMetadataForD1(proxy),
    (error) => error?.code === "validation_error" && !error.message.includes("raw trap marker")
  );
  assert.throws(() => projectAccountMetadataForD1([]), { code: "validation_error" });
});
