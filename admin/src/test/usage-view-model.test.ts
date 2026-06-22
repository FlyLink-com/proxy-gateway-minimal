import { describe, expect, test } from "vitest";
import {
  buildUsageRuntimeViewModel,
  collectionStatusDisplay,
  formatBytes,
  hasUnconfirmedBinding,
  normalizeCollectionStatus,
  usageAnomalyReason,
  usageRatio
} from "../features/subscriptions/usage-view-model";
import type { SubscriptionUsageMonitorRow } from "../features/subscriptions/types";

describe("usage view model", () => {
  test("normalizes collection status and keeps collector disabled semantics stable", () => {
    expect(normalizeCollectionStatus({ collectionStatus: "collector_disabled", usageStatus: "measured" }))
      .toBe("collector_disabled");
    expect(normalizeCollectionStatus({ collectionStatus: null, usageStatus: "measured_zero" }))
      .toBe("measured_zero");
    expect(collectionStatusDisplay("collector_disabled")).toEqual({
      gap: true,
      label: "Collector disabled",
      measured: false,
      tone: "warning"
    });
    expect(collectionStatusDisplay("unexpected_collector_state")).toEqual({
      gap: true,
      label: "Not collected",
      measured: false,
      tone: "neutral"
    });
  });

  test("detects quota and collection anomaly reasons in shared priority order", () => {
    expect(usageAnomalyReason(rowFixture({ usedBytes: 1200, trafficLimitBytes: 1000 }))).toEqual({
      label: "Over limit",
      priority: 1,
      tone: "critical"
    });
    expect(usageAnomalyReason(rowFixture({ usedBytes: 850, trafficLimitBytes: 1000 }))).toEqual({
      label: "Near quota",
      priority: 2,
      tone: "warning"
    });
    expect(usageAnomalyReason(rowFixture({ collectionStatus: "measured_zero", usageStatus: "measured_zero" }))).toEqual({
      label: "True 0 B",
      priority: 7,
      tone: "muted"
    });
    expect(usageAnomalyReason(rowFixture({
      edgeCredentialBindings: [{
        channelRef: "node-a",
        credentialRefPresent: false,
        materialDigestPresent: false,
        usageMeasured: false
      }]
    }))).toEqual({
      label: "Receipt / collection pending",
      priority: 5,
      tone: "warning"
    });
  });

  test("formats shared bytes and ratios without leaking invalid numbers", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1200)).toBe("1.17 KB");
    expect(formatBytes(Number.NaN)).toBe("0 B");
    expect(usageRatio(1200, 1000)).toBe(120);
    expect(usageRatio(0, 0, 0.42)).toBe(42);
    expect(usageRatio(0, 0)).toBe(0);
  });

  test("detects missing receipt bindings by channel", () => {
    const row = rowFixture({
      edgeCredentialBindings: [
        {
          channelRef: "node-a",
          credentialRefPresent: true,
          materialDigestPresent: true,
          usageMeasured: true
        },
        {
          channelRef: "node-b",
          credentialRefPresent: true,
          materialDigestPresent: false,
          usageMeasured: false
        }
      ]
    });

    expect(hasUnconfirmedBinding(row)).toBe(true);
    expect(hasUnconfirmedBinding(row, "node-a")).toBe(false);
    expect(hasUnconfirmedBinding(row, "node-b")).toBe(true);
  });

  test("projects redacted runtime rows into freshness, ledger, and anomaly queues", () => {
    const model = buildUsageRuntimeViewModel({
      generatedAt: "2026-06-22T05:40:00.000Z",
      items: [
        rowFixture({
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
        rowFixture({
          accountId: "acct_safe_014",
          collectionStatus: "measured_zero",
          downloadBytes: 0,
          issuanceRequestId: "ord_safe_102",
          issuedChannels: ["channel_safe_sgp_hy2"],
          lastUsageObservedAt: "2026-06-22T05:33:00.000Z",
          usageStatus: "measured_zero",
          usedBytes: 0
        }),
        rowFixture({
          accountId: "acct_safe_022",
          collectionStatus: "collector_disabled",
          issuanceRequestId: "ord_safe_103",
          issuedChannels: ["channel_safe_sgp_tuic"],
          lastUsageObservedAt: null,
          trafficLimitBytes: 1000,
          usedBytes: 1200
        }),
        rowFixture({
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
      ],
      nowMs: Date.parse("2026-06-22T05:40:00.000Z")
    });

    expect(model.freshness).toEqual({
      collectorDisabledRows: 1,
      disconnectedRows: 1,
      latestObservedAtLabel: "2m ago",
      staleRows: 0,
      state: "Needs review",
      tone: "warning",
      unknownRows: 1
    });
    expect(model.ledgerRows.map((row) => ({
      accountRef: row.accountRef,
      channelRef: row.channelRef,
      collection: row.collection,
      collectionTone: row.collectionTone,
      orderRef: row.orderRef,
      traffic: row.traffic
    }))).toEqual([
      {
        accountRef: "acct_safe_001",
        channelRef: "channel_safe_jp_vless",
        collection: "Measured",
        collectionTone: "success",
        orderRef: "ord_safe_101",
        traffic: "1 KB up / 2 KB down / 3 KB total"
      },
      {
        accountRef: "acct_safe_014",
        channelRef: "channel_safe_sgp_hy2",
        collection: "Measured zero",
        collectionTone: "info",
        orderRef: "ord_safe_102",
        traffic: "0 B up / 0 B down / 0 B total"
      },
      {
        accountRef: "acct_safe_022",
        channelRef: "channel_safe_sgp_tuic",
        collection: "Collector disabled",
        collectionTone: "danger",
        orderRef: "ord_safe_103",
        traffic: "0 B up / 0 B down / 1.17 KB total"
      },
      {
        accountRef: "acct_safe_030",
        channelRef: "channel_safe_pending",
        collection: "Not collected",
        collectionTone: "warning",
        orderRef: "ord_safe_104",
        traffic: "0 B up / 0 B down / 0 B total"
      }
    ]);
    expect(model.anomalyItems.map((item) => ({
      objectRef: item.objectRef,
      reasonLabel: item.reasonLabel,
      severity: item.severity,
      title: item.title
    }))).toEqual([
      {
        objectRef: "ord_safe_103",
        reasonLabel: "Over limit",
        severity: "critical",
        title: "Usage evidence needs review"
      },
      {
        objectRef: "ord_safe_104",
        reasonLabel: "Receipt / collection pending",
        severity: "warning",
        title: "Usage evidence needs review"
      },
      {
        objectRef: "ord_safe_102",
        reasonLabel: "True 0 B",
        severity: "info",
        title: "Usage evidence needs review"
      }
    ]);
    expect(model.safety).toEqual({
      mutationAllowed: false,
      rawEdgeCredentialReturned: false,
      rawSecretReturned: false,
      rawSubscriptionUrlReturned: false,
      summaryOnly: true
    });
  });
});

function rowFixture(overrides: Partial<SubscriptionUsageMonitorRow> = {}): SubscriptionUsageMonitorRow {
  return {
    accountId: "acct_demo",
    activityLevel: "seen",
    artifactFirstSeenAt: null,
    artifactLastSeenAt: null,
    artifactRef: null,
    artifactStatus: "not_recorded",
    channelUsages: [],
    collectionStatus: "measured",
    downloadBytes: 0,
    edgeCredentialBindings: [],
    entitlementId: "entitlement_demo",
    issuanceRequestId: "order_demo",
    issuedChannels: ["node-a"],
    lastRefreshAt: null,
    lastUsageObservedAt: null,
    linkStatus: "linked",
    nodeId: "node-a",
    plan: "monthly",
    portalUserRef: "portal_user_demo",
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
