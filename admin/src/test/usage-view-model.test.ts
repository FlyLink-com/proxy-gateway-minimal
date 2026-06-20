import { describe, expect, test } from "vitest";
import {
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
