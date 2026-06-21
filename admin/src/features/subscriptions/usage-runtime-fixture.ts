import type {
  SubscriptionUsageMonitor,
  SubscriptionUsageMonitorRow
} from "./types";

export const USAGE_RUNTIME_FIXTURE = {
  generatedAt: "2026-06-05T08:00:00.000Z",
  items: [
    usageRowFixture({
      accountId: "acct_safe_001",
      collectionStatus: "stale",
      downloadBytes: 45_956_150_067,
      issuanceRequestId: "ord_safe_101",
      issuedChannels: ["channel_safe_jp_vless"],
      lastRefreshAt: "2026-06-05T07:53:00.000Z",
      lastUsageObservedAt: "2026-06-05T07:48:00.000Z",
      nodeId: "channel_safe_jp_vless",
      portalUserRef: "acct_safe_001",
      trafficLimitBytes: 107_374_182_400,
      usedBytes: 45_956_150_067,
      usageStatus: "measured",
      uploadBytes: 0
    }),
    usageRowFixture({
      accountId: "acct_safe_014",
      collectionStatus: "measured_zero",
      issuanceRequestId: "ord_safe_102",
      issuedChannels: ["channel_safe_sgp_hy2"],
      lastRefreshAt: "2026-06-05T07:59:00.000Z",
      lastUsageObservedAt: "2026-06-05T07:58:00.000Z",
      nodeId: "channel_safe_sgp_hy2",
      portalUserRef: "acct_safe_014",
      trafficLimitBytes: 53_687_091_200,
      usageStatus: "measured_zero"
    }),
    usageRowFixture({
      accountId: "acct_safe_022",
      collectionStatus: "collector_disabled",
      issuanceRequestId: "ord_safe_103",
      issuedChannels: ["channel_safe_sgp_tuic"],
      lastRefreshAt: "2026-06-05T07:40:00.000Z",
      nodeId: "collector_safe_sgp",
      portalUserRef: "acct_safe_022",
      trafficLimitBytes: 53_687_091_200,
      usageMeasured: false,
      usageStatus: "not_collected"
    }),
    usageRowFixture({
      accountId: "acct_safe_030",
      collectionStatus: "not_collected",
      edgeCredentialBindings: [
        {
          channelRef: "channel_safe_pending",
          credentialRefPresent: true,
          materialDigestPresent: false,
          usageMeasured: false
        }
      ],
      issuanceRequestId: "ord_safe_104",
      issuedChannels: ["channel_safe_pending"],
      lastRefreshAt: "2026-06-05T07:45:00.000Z",
      nodeId: "channel_safe_pending",
      portalUserRef: "acct_safe_030",
      trafficLimitBytes: 53_687_091_200,
      usageMeasured: false,
      usageStatus: "not_collected"
    })
  ]
} satisfies Pick<SubscriptionUsageMonitor, "generatedAt" | "items">;

function usageRowFixture(overrides: Partial<SubscriptionUsageMonitorRow>): SubscriptionUsageMonitorRow {
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
    edgeCredentialBindings: [
      {
        channelRef: overrides.issuedChannels?.[0] ?? overrides.nodeId ?? "channel_safe_default",
        credentialRefPresent: true,
        materialDigestPresent: true,
        usageMeasured: true
      }
    ],
    entitlementId: "entitlement_safe_default",
    issuanceRequestId: "ord_safe_default",
    issuedChannels: ["channel_safe_default"],
    lastRefreshAt: "2026-06-05T08:00:00.000Z",
    lastUsageObservedAt: null,
    linkStatus: "linked",
    nodeId: "channel_safe_default",
    plan: "monthly",
    portalUserRef: "acct_safe_default",
    quantity: 1,
    refreshCount: 0,
    tenantExpiresAt: null,
    tenantRef: null,
    tenantStatus: "not_recorded",
    trafficLimitBytes: 0,
    uploadBytes: 0,
    usageMeasured: true,
    usageStatus: "measured",
    usedBytes: 0,
    validUntil: null,
    warnings: [],
    ...overrides
  };
}
