import { describe, expect, test } from "vitest";
import {
  buildUsageAnomalyCandidates,
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

  test("projects runtime usage rows into ledger, anomaly, event, and entity models", () => {
    const monitor = {
      generatedAt: "2026-06-05T08:00:00.000Z",
      items: [
        rowFixture({
          collectionStatus: "stale",
          issuanceRequestId: "ord_safe_stale",
          issuedChannels: ["channel_safe_stale"],
          lastUsageObservedAt: "2026-06-05T07:48:00.000Z",
          usedBytes: 1200
        }),
        rowFixture({
          collectionStatus: "measured_zero",
          issuanceRequestId: "ord_safe_zero",
          issuedChannels: ["channel_safe_zero"],
          usageStatus: "measured_zero",
          usedBytes: 0
        }),
        rowFixture({
          collectionStatus: "not_collected",
          edgeCredentialBindings: [{
            channelRef: "channel_safe_pending",
            credentialRefPresent: true,
            materialDigestPresent: false,
            usageMeasured: false
          }],
          issuanceRequestId: "ord_safe_pending",
          issuedChannels: ["channel_safe_pending"],
          usageMeasured: false,
          usageStatus: "not_collected"
        })
      ]
    };

    const viewModel = buildUsageRuntimeViewModel(monitor);

    expect(viewModel.generatedAt).toBe("2026-06-05T08:00:00.000Z");
    expect(viewModel.ledgerRows.map((row) => ({
      channelRef: row.channelRef,
      collectionLabel: row.collectionLabel,
      traffic: row.traffic
    }))).toEqual([
      {
        channelRef: "channel_safe_stale",
        collectionLabel: "Collection expired",
        traffic: "1.17 KB"
      },
      {
        channelRef: "channel_safe_zero",
        collectionLabel: "Measured zero",
        traffic: "0 B"
      },
      {
        channelRef: "channel_safe_pending",
        collectionLabel: "Not collected",
        traffic: "Unknown"
      }
    ]);
    expect(viewModel.anomalyItems.map((item) => item.title)).toEqual([
      "Order traffic over limit",
      "Stale usage collection",
      "Receipt missing",
      "True zero usage"
    ]);
    expect(viewModel.events.map((event) => event.category)).toEqual(expect.arrayContaining([
      "usage",
      "collection",
      "receipt",
      "anomaly"
    ]));
    expect(viewModel.entities.find((entity) => entity.ref === "portal_user_demo")?.type).toBe("account");
    expect(viewModel.entities.find((entity) => entity.ref === "channel_safe_pending")?.state).toBe("blocked");
    expect(JSON.stringify(viewModel)).not.toMatch(/subscriptionUrl|token=|secret-value|password|yaml|edgecred_/i);
  });

  test("builds anomaly candidates outside the page layer in priority order", () => {
    const candidates = buildUsageAnomalyCandidates([
      rowFixture({
        collectionStatus: "measured_zero",
        issuanceRequestId: "ord_safe_zero",
        usageStatus: "measured_zero"
      }),
      rowFixture({
        collectionStatus: "collector_disabled",
        issuanceRequestId: "ord_safe_disabled",
        nodeId: "collector_safe_sgp",
        usageStatus: "not_collected"
      })
    ]);

    expect(candidates.map((candidate) => ({
      objectRef: candidate.objectRef,
      priority: candidate.priority,
      severity: candidate.severity,
      title: candidate.title
    }))).toEqual([
      {
        objectRef: "collector_safe_sgp",
        priority: 4,
        severity: "critical",
        title: "Collector disabled"
      },
      {
        objectRef: "ord_safe_zero",
        priority: 7,
        severity: "info",
        title: "True zero usage"
      }
    ]);
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
