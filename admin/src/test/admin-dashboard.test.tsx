import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { AdminApiClient } from "../features/subscriptions/api-client";
import type {
  PortalAccessRequestSummary,
  SubscriptionOverview,
  SubscriptionUsageMonitor,
  SubscriptionUsageMonitorRow
} from "../features/subscriptions/types";
import { DashboardPage } from "../pages/dashboard-page";

afterEach(() => {
  cleanup();
});

describe("admin dashboard page", () => {
  test("renders a summary-only operations dashboard from existing admin APIs", async () => {
    const overview = vi.fn(async () => overviewFixture({
      total: 14,
      active: 12,
      expiring: 2,
      expired: 1,
      disabled: 1,
      distribution: {
        mode: "subscription-v2",
        ready: true,
        eligibleNodes: 1,
        blockedNodes: 1,
        blockers: []
      }
    }));
    const listPortalAccessRequests = vi.fn(async () => [
      portalRequestFixture({ id: "order_7d_ready", planLabel: "7-day trial", status: "delivered" }),
      portalRequestFixture({ id: "order_30d_ready", planLabel: "30-day subscription", status: "delivered" }),
      portalRequestFixture({ id: "order_30d_pending", planLabel: "30-day subscription", status: "pending_admin_review" })
    ]);
    const listSubscriptionUsageMonitor = vi.fn(async () => usageMonitorFixture({
      aggregates: {
        total: 3,
        activeRecently: 2,
        neverSeen: 1,
        highRefresh: 1,
        blocked: 0,
        inactive: 0,
        seen: 2,
        withWarnings: 2,
        byPlan: { trial: 1, monthly: 2 },
        byNode: { "channel-lab-b-tuic": 3 },
        warnings: { high_refresh_count: 1, missing_artifact_ref: 1 },
        usage: usageAggregateFixture({
          totalUsedBytes: 1536,
          totalUploadBytes: 512,
          totalDownloadBytes: 1024,
          measuredOrders: 1,
          unmeasuredOrders: 2,
          byUsageChannel: { "channel-vultr-a-hy2": 1536 }
        })
      },
      items: [
        usageRowFixture({
          accountId: "acct_safe_alpha",
          issuanceRequestId: "order_7d_ready",
          nodeId: "channel-vultr-a-vless-reality-tcp",
          usedBytes: 1536,
          uploadBytes: 512,
          downloadBytes: 1024,
          activityLevel: "active_recently",
          warnings: ["high_refresh_count"]
        })
      ]
    }));

    render(<DashboardPage apiClient={adminClient({ overview, listPortalAccessRequests, listSubscriptionUsageMonitor })} />);

    expect(await screen.findByRole("heading", { name: "今日运营摘要" })).not.toBeNull();
    expect(screen.getByText(/只读运营视图/)).not.toBeNull();
    expect(screen.getByText(/当前展示订单、订阅状态和活动告警/)).not.toBeNull();
    expect(within(screen.getByLabelText("服务健康")).getByText("正常")).not.toBeNull();
    const coreMetrics = within(screen.getByLabelText("Core metrics"));
    expect(within(coreMetrics.getByText("有效订阅").closest(".ops-metric-card") as HTMLElement).getByText("12")).not.toBeNull();
    expect(within(coreMetrics.getByText("已计量订单").closest(".ops-metric-card") as HTMLElement).getByText("1")).not.toBeNull();
    expect(within(coreMetrics.getByText("已计量订单").closest(".ops-metric-card") as HTMLElement).getByText("1.50 KB 平台用量")).not.toBeNull();
    expect(within(coreMetrics.getByText("待处理订单").closest(".ops-metric-card") as HTMLElement).getByText("1")).not.toBeNull();
    expect(within(coreMetrics.getByText("风险信号").closest(".ops-metric-card") as HTMLElement).getByText("3")).not.toBeNull();
    expect(screen.getByRole("img", { name: "订单状态图表" })).not.toBeNull();
    expect(screen.getByRole("img", { name: "活动状态图表" })).not.toBeNull();
    expect(screen.getByRole("img", { name: "实际用量通道图表" })).not.toBeNull();
    expect(screen.getByRole("img", { name: "告警类型图表" })).not.toBeNull();
    expect(screen.getAllByText("channel-vultr-a-hy2").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("channel-vultr-a-vless-reality-tcp")).not.toBeNull();
    expect(screen.getAllByText("1.50 KB").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("刷新频率偏高").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("交付记录缺失").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/\+12%/)).toBeNull();

    await expect.poll(() => overview).toHaveBeenCalledTimes(1);
    expect(listPortalAccessRequests).toHaveBeenCalledTimes(1);
    expect(listSubscriptionUsageMonitor).toHaveBeenCalledWith({});

    const renderedText = document.body.textContent ?? "";
    expect(renderedText).not.toMatch(/subscriptionUrl|Bearer|token=|secret|password|yaml/i);
    expect(renderedText).not.toMatch(/tenant|artifact/i);
    expect(screen.queryByRole("button", { name: /create|delete|disable|approve|issue|renew/i })).toBeNull();
  });

  test("keeps available dashboard sections visible when one source fails", async () => {
    const overview = vi.fn(async () => overviewFixture({ total: 5, active: 4 }));
    const listPortalAccessRequests = vi.fn(async () => {
      throw new Error("orders unavailable");
    });
    const listSubscriptionUsageMonitor = vi.fn(async () => usageMonitorFixture({
      aggregates: {
        total: 2,
        activeRecently: 1,
        neverSeen: 1,
        highRefresh: 0,
        blocked: 0,
        inactive: 0,
        seen: 1,
        withWarnings: 0,
        byPlan: {},
        byNode: {},
        warnings: {},
        usage: usageAggregateFixture({ unmeasuredOrders: 2 })
      },
      items: []
    }));

    render(<DashboardPage apiClient={adminClient({ overview, listPortalAccessRequests, listSubscriptionUsageMonitor })} />);

    expect(await screen.findByRole("heading", { name: "今日运营摘要" })).not.toBeNull();
    const coreMetrics = within(screen.getByLabelText("Core metrics"));
    expect(within(coreMetrics.getByText("有效订阅").closest(".ops-metric-card") as HTMLElement).getByText("4")).not.toBeNull();
    expect(screen.getByText("订单摘要暂不可用。")).not.toBeNull();
    expect(screen.getByText("暂无近期活动记录")).not.toBeNull();
  });
});

function adminClient(overrides: Partial<AdminApiClient>): AdminApiClient {
  return overrides as AdminApiClient;
}

function overviewFixture(overrides: Partial<SubscriptionOverview> = {}): SubscriptionOverview {
  return {
    ok: true,
    total: 0,
    active: 0,
    expiring: 0,
    expired: 0,
    disabled: 0,
    nodes: [],
    distribution: {
      mode: "subscription-v2",
      ready: false,
      eligibleNodes: 0,
      blockedNodes: 0,
      blockers: ["no_subscription_eligible_nodes"]
    },
    ...overrides
  };
}

function portalRequestFixture(overrides: Partial<PortalAccessRequestSummary> = {}): PortalAccessRequestSummary {
  return {
    id: "order_demo",
    type: "portal_access_request_summary",
    portalUserRef: "portal_user_demo",
    plan: "trial",
    planLabel: "7-day trial",
    durationDays: 7,
    status: "delivered",
    nextAction: "none",
    submittedAt: "2026-06-05T08:00:00.000Z",
    updatedAt: "2026-06-05T08:00:00.000Z",
    reviewedAt: null,
    reviewedByRef: null,
    safeReasonCode: null,
    priorTrialState: "not_seen",
    entitlementRef: null,
    accessGrantRef: null,
    safety: {
      noSubscriptionUrl: true,
      noRawCustomerData: true,
      noRawHandoffMaterial: true,
      noEntitlementCreated: false,
      noRuntimeMutation: false,
      noProductionMutation: true
    },
    ...overrides
  };
}

function usageMonitorFixture(overrides: Partial<SubscriptionUsageMonitor> = {}): SubscriptionUsageMonitor {
  return {
    type: "subscription_usage_monitor",
    generatedAt: "2026-06-05T08:00:00.000Z",
    filters: {
      accountId: "",
      plan: "",
      nodeId: "",
      status: "",
      warning: "",
      from: "",
      to: "",
      bucket: "hour"
    },
    aggregates: {
      total: 0,
      activeRecently: 0,
      neverSeen: 0,
      highRefresh: 0,
      blocked: 0,
      inactive: 0,
      seen: 0,
      withWarnings: 0,
      byPlan: {},
      byNode: {},
      warnings: {},
      usage: usageAggregateFixture(),
      ...overrides.aggregates
    },
    items: [],
    series: usageSeriesFixture(),
    safety: {
      summaryOnly: true,
      realByteUsageMeasured: false,
      orderLevelRows: true,
      channelUsageBreakdownIncluded: true,
      rawSubscriptionUrlReturned: false,
      rawSecretReturned: false,
      rawCustomerNetworkDataReturned: false,
      mutationAllowed: false
    },
    ...overrides
  };
}

function usageSeriesFixture(overrides: Partial<SubscriptionUsageMonitor["series"]> = {}): SubscriptionUsageMonitor["series"] {
  return {
    type: "subscription_usage_timeseries",
    range: {
      from: null,
      to: null,
      bucket: "hour"
    },
    points: [],
    aggregates: {
      totalUsedBytes: 0,
      totalUploadBytes: 0,
      totalDownloadBytes: 0,
      pointCount: 0,
      seriesCount: 0,
      byOrder: {},
      byAccount: {},
      byChannel: {}
    },
    safety: {
      summaryOnly: true,
      orderScoped: true,
      channelBreakdownIncluded: true,
      rawEdgeCredentialReturned: false,
      rawSubscriptionUrlReturned: false,
      rawSecretReturned: false,
      mutationAllowed: false
    },
    ...overrides
  };
}

function usageAggregateFixture(overrides: Partial<SubscriptionUsageMonitor["aggregates"]["usage"]> = {}) {
  return {
    totalUsedBytes: 0,
    totalUploadBytes: 0,
    totalDownloadBytes: 0,
    measuredOrders: 0,
    unmeasuredOrders: 0,
    zeroUsageOrders: 0,
    overLimitOrders: 0,
    nearLimitOrders: 0,
    byUsageChannel: {},
    ...overrides
  };
}

function usageRowFixture(overrides: Partial<SubscriptionUsageMonitorRow> = {}): SubscriptionUsageMonitorRow {
  const row: SubscriptionUsageMonitorRow = {
    accountId: "acct_demo",
    portalUserRef: "portal_user_demo",
    issuanceRequestId: "order_demo",
    entitlementId: "entitlement_demo",
    plan: "trial",
    quantity: 1,
    nodeId: "channel-lab-b-tuic",
    issuedChannels: ["channel-lab-b-tuic"],
    tenantRef: "tenant-safe-ref",
    artifactRef: "artifact-safe-ref",
    linkStatus: "active",
    tenantStatus: "active",
    artifactStatus: "seen",
    validUntil: "2026-06-12T08:00:00.000Z",
    tenantExpiresAt: "2026-06-12T08:00:00.000Z",
    lastRefreshAt: "2026-06-05T07:55:00.000Z",
    artifactFirstSeenAt: "2026-06-05T07:00:00.000Z",
    artifactLastSeenAt: "2026-06-05T07:55:00.000Z",
    refreshCount: 3,
    trafficLimitBytes: 0,
    usedBytes: 0,
    uploadBytes: 0,
    downloadBytes: 0,
    usageStatus: "not_collected",
    collectionStatus: "not_collected",
    usageMeasured: false,
    lastUsageObservedAt: null,
    edgeCredentialBindings: [
      {
        channelRef: "channel-lab-b-tuic",
        credentialRefPresent: true,
        materialDigestPresent: true,
        usageMeasured: false
      }
    ],
    channelUsages: [],
    activityLevel: "seen",
    warnings: [],
    ...overrides
  };
  return {
    ...row,
    issuedChannels: row.issuedChannels ?? []
  };
}
