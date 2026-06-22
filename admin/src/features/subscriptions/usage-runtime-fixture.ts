import type { SubscriptionUsageMonitorRow } from "./types";
import type { UsageRuntimeSource } from "./usage-view-model";

export const usageRuntimeProjectionFixture: UsageRuntimeSource = {
  generatedAt: "2026-06-22T05:40:00.000Z",
  nowMs: Date.parse("2026-06-22T05:40:00.000Z"),
  items: [
    monitorRowFixture({
      accountId: "acct_safe_001",
      collectionStatus: "measured",
      downloadBytes: 2048,
      issuanceRequestId: "ord_safe_101",
      issuedChannels: ["channel_safe_jp_vless"],
      lastUsageObservedAt: "2026-06-22T05:38:00.000Z",
      trafficLimitBytes: 10000,
      uploadBytes: 1024,
      usedBytes: 3072
    }),
    monitorRowFixture({
      accountId: "acct_safe_014",
      collectionStatus: "measured_zero",
      downloadBytes: 0,
      issuanceRequestId: "ord_safe_102",
      issuedChannels: ["channel_safe_sgp_hy2"],
      lastUsageObservedAt: "2026-06-22T05:33:00.000Z",
      usageStatus: "measured_zero",
      usedBytes: 0
    }),
    monitorRowFixture({
      accountId: "acct_safe_022",
      collectionStatus: "collector_disabled",
      issuanceRequestId: "ord_safe_103",
      issuedChannels: ["channel_safe_sgp_tuic"],
      lastUsageObservedAt: null,
      trafficLimitBytes: 1000,
      usedBytes: 1200
    }),
    monitorRowFixture({
      accountId: "acct_safe_030",
      collectionStatus: "not_collected",
      edgeCredentialBindings: [{
        channelRef: "channel_safe_pending",
        credentialRefPresent: true,
        materialDigestPresent: false,
        usageMeasured: false
      }],
      issuanceRequestId: "ord_safe_104",
      issuedChannels: ["channel_safe_pending"],
      lastUsageObservedAt: null,
      usageMeasured: false
    })
  ]
};

function monitorRowFixture(overrides: Partial<SubscriptionUsageMonitorRow>): SubscriptionUsageMonitorRow {
  return {
    accountId: "acct_safe_default",
    activityLevel: "seen",
    artifactFirstSeenAt: null,
    artifactLastSeenAt: null,
    artifactRef: null,
    artifactStatus: "not_recorded",
    channelUsages: [],
    collectionStatus: "measured",
    downloadBytes: 0,
    edgeCredentialBindings: [],
    entitlementId: "entitlement_safe_default",
    issuanceRequestId: "ord_safe_default",
    issuedChannels: ["channel_safe_default"],
    lastRefreshAt: null,
    lastUsageObservedAt: null,
    linkStatus: "linked",
    nodeId: "node_safe_default",
    plan: "monthly",
    portalUserRef: "portal_user_safe_default",
    quantity: 1,
    refreshCount: 0,
    tenantExpiresAt: null,
    tenantRef: null,
    tenantStatus: "not_recorded",
    trafficLimitBytes: 1000,
    uploadBytes: 0,
    usageMeasured: true,
    usageStatus: "measured",
    usedBytes: 0,
    validUntil: null,
    warnings: [],
    ...overrides
  };
}
