import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { AdminApiClient } from "../features/subscriptions/api-client";
import type {
  SubscriptionUsageMonitor,
  SubscriptionUsageMonitorRow
} from "../features/subscriptions/types";
import { SubscriptionUsageMonitorPage } from "../pages/subscription-usage-monitor-page";

afterEach(() => {
  cleanup();
});

describe("subscription usage monitor page", () => {
  test("renders selectable historical usage curves without mixing table ownership", async () => {
    const listSubscriptionUsageMonitor = vi.fn(async () => monitorFixture({
      items: [
        monitorRowFixture({
          portalUserRef: "portal_user_demo_1",
          accountId: "acct_demo_1",
          issuanceRequestId: "order_demo_1",
          plan: "trial",
          nodeId: "node-alpha",
          issuedChannels: ["node-alpha", "node-gamma"],
          tenantRef: "tenant-safe-ref",
          artifactRef: "artifact-safe-ref",
          usedBytes: 300,
          uploadBytes: 100,
          downloadBytes: 200,
          usageStatus: "measured",
          usageMeasured: true,
          lastUsageObservedAt: "2026-06-05T07:54:00.000Z",
          channelUsages: [
            {
              channelRef: "node-alpha",
              usedBytes: 300,
              uploadBytes: 100,
              downloadBytes: 200,
              lastObservedAt: "2026-06-05T07:54:00.000Z"
            }
          ],
          trafficLimitBytes: 1000,
          activityLevel: "active_recently",
          warnings: ["high_refresh_count"]
        } as SubscriptionUsageMonitorRow),
        monitorRowFixture({
          portalUserRef: "portal_user_demo_2",
          accountId: "acct_demo_2",
          issuanceRequestId: "order_demo_2",
          nodeId: "node-beta",
          tenantRef: null,
          artifactRef: null,
          activityLevel: "never_seen",
          warnings: []
        })
      ],
      aggregates: {
        total: 2,
        activeRecently: 1,
        neverSeen: 1,
        highRefresh: 1,
        blocked: 0,
        inactive: 0,
        seen: 1,
        withWarnings: 1,
        byPlan: { trial: 1, monthly: 1 },
        byNode: { "node-alpha": 1, "node-beta": 1 },
        warnings: { high_refresh_count: 1 },
        usage: usageAggregateFixture({
          totalUsedBytes: 300,
          totalUploadBytes: 100,
          totalDownloadBytes: 200,
          measuredOrders: 1,
          unmeasuredOrders: 1,
          byUsageChannel: { "node-alpha": 300 }
        })
      },
      series: usageSeriesFixture({
        points: [
          {
            bucketStart: "2026-06-05T07:00:00.000Z",
            accountId: "acct_demo_1",
            portalUserRef: "portal_user_demo_1",
            issuanceRequestId: "order_demo_1",
            plan: "trial",
            channelRef: "node-alpha",
            uploadBytes: 100,
            downloadBytes: 200,
            usedBytes: 300
          }
        ],
        aggregates: {
          totalUsedBytes: 300,
          totalUploadBytes: 100,
          totalDownloadBytes: 200,
          pointCount: 1,
          seriesCount: 1,
          byOrder: { order_demo_1: 300 },
          byAccount: { portal_user_demo_1: 300 },
          byChannel: { "node-alpha": 300 }
        }
      })
    }));

    render(<SubscriptionUsageMonitorPage apiClient={adminClient({ listSubscriptionUsageMonitor })} />);

    expect(await screen.findByRole("heading", { name: "活动明细监护" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "历史用量曲线" })).not.toBeNull();
    expect(screen.getByText("按用户、订单和实际用量通道勾选曲线；表格仍保留完整订单账本。")).not.toBeNull();
    expect(screen.getByRole("img", { name: "订单历史用量曲线" })).not.toBeNull();
    expect((screen.getByLabelText("用户 portal_user_demo_1") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("订单 order_demo_1") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("通道 node-alpha") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByLabelText("曲线 order_demo_1 node-alpha")).not.toBeNull();

    fireEvent.click(screen.getByLabelText("订单 order_demo_1"));

    expect(screen.queryByLabelText("曲线 order_demo_1 node-alpha")).toBeNull();
    expect(screen.getByText("当前勾选条件下暂无曲线数据。")).not.toBeNull();
    expect(screen.getByText("acct_demo_1")).not.toBeNull();
  });

  test("renders monitor heading, aggregate cards, row details, and safety notice", async () => {
    const listSubscriptionUsageMonitor = vi.fn(async () => monitorFixture({
      items: [
        monitorRowFixture({
          portalUserRef: "portal_user_demo_1",
          accountId: "acct_demo_1",
          issuanceRequestId: "order_demo_1",
          plan: "trial",
          nodeId: "node-alpha",
          issuedChannels: ["node-alpha", "node-gamma"],
          tenantRef: "tenant-safe-ref",
          artifactRef: "artifact-safe-ref",
          usedBytes: 300,
          uploadBytes: 100,
          downloadBytes: 200,
          usageStatus: "measured",
          usageMeasured: true,
          lastUsageObservedAt: "2026-06-05T07:54:00.000Z",
          channelUsages: [
            {
              channelRef: "node-alpha",
              usedBytes: 300,
              uploadBytes: 100,
              downloadBytes: 200,
              lastObservedAt: "2026-06-05T07:54:00.000Z"
            }
          ],
          trafficLimitBytes: 1000,
          activityLevel: "active_recently",
          warnings: ["high_refresh_count"]
        } as SubscriptionUsageMonitorRow),
        monitorRowFixture({
          portalUserRef: "portal_user_demo_2",
          accountId: "acct_demo_2",
          issuanceRequestId: "order_demo_2",
          nodeId: "node-beta",
          tenantRef: null,
          artifactRef: null,
          activityLevel: "never_seen",
          warnings: []
        })
      ],
      aggregates: {
        total: 2,
        activeRecently: 1,
        neverSeen: 1,
        highRefresh: 1,
        blocked: 0,
        inactive: 0,
        seen: 1,
        withWarnings: 1,
        byPlan: { trial: 1, monthly: 1 },
        byNode: { "node-alpha": 1, "node-beta": 1 },
        warnings: { high_refresh_count: 1 },
        usage: usageAggregateFixture({
          totalUsedBytes: 300,
          totalUploadBytes: 100,
          totalDownloadBytes: 200,
          measuredOrders: 1,
          unmeasuredOrders: 1,
          byUsageChannel: { "node-alpha": 300 }
        })
      }
    }));

    render(<SubscriptionUsageMonitorPage apiClient={adminClient({ listSubscriptionUsageMonitor })} />);

    expect(await screen.findByRole("heading", { name: "活动明细监护" })).not.toBeNull();
    expect(screen.getByText("平台摘要只做运营观测；额度、告警和禁用判断以订单账本的账号、订单和 edge credential 归属为准。")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "平台采集概览" })).not.toBeNull();
    expect(screen.getByText("平台已计量流量")).not.toBeNull();
    expect(screen.getByText("上传")).not.toBeNull();
    expect(screen.getByText("下载")).not.toBeNull();
    expect(screen.getByText("已计量订单")).not.toBeNull();
    expect(screen.getAllByText("未接入采集").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText("平台通道用量")).not.toBeNull();
    expect(screen.getAllByText("node-alpha").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("订单活动摘要")).not.toBeNull();
    expect(screen.getByText("订单用量账本")).not.toBeNull();
    expect(screen.getByText("总记录")).not.toBeNull();
    expect(screen.getAllByText("近期活跃").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("从未刷新").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("高频刷新")).not.toBeNull();
    expect(screen.getByText("已阻断")).not.toBeNull();
    expect(screen.getByText("不活跃")).not.toBeNull();
    expect(screen.getByText("已刷新")).not.toBeNull();
    expect(screen.getByText("存在告警")).not.toBeNull();
    expect(await screen.findByText("acct_demo_1")).not.toBeNull();
    const firstRow = screen.getByText("acct_demo_1").closest("tr");
    expect(firstRow).not.toBeNull();
    const firstRowScope = within(firstRow as HTMLElement);
    expect(firstRowScope.getByText("portal_user_demo_1")).not.toBeNull();
    expect(firstRowScope.getByText("order_demo_1")).not.toBeNull();
    expect(firstRowScope.getByText("trial / 1")).not.toBeNull();
    expect(firstRowScope.getAllByText("node-alpha").length).toBeGreaterThanOrEqual(2);
    expect(firstRowScope.getByText("node-gamma")).not.toBeNull();
    expect(firstRowScope.getByText("300 B / 1000 B")).not.toBeNull();
    expect(firstRowScope.getAllByText("300 B").length).toBeGreaterThanOrEqual(1);
    expect(firstRowScope.getByText(/00:54|07:54/)).not.toBeNull();
    expect(firstRowScope.getByText("已采集")).not.toBeNull();
    expect(firstRowScope.getByText("已绑定")).not.toBeNull();
    expect(firstRowScope.getByText("近期活跃")).not.toBeNull();
    expect(screen.getAllByText("未接入采集").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("未记录").length).toBeGreaterThanOrEqual(1);

    const renderedText = document.body.textContent ?? "";
    expect(renderedText).not.toMatch(/subscriptionUrl|token|secret|password|yaml/i);
    expect(renderedText).not.toMatch(/tenant-safe-ref|artifact-safe-ref|tenant-|artifact-/i);
  });

  test("submits trimmed monitor filters to the client", async () => {
    const listSubscriptionUsageMonitor = vi.fn(async () => monitorFixture());

    render(<SubscriptionUsageMonitorPage apiClient={adminClient({ listSubscriptionUsageMonitor })} />);

    expect(await screen.findByRole("heading", { name: "活动明细监护" })).not.toBeNull();
    fireEvent.change(screen.getByLabelText("账号 ID"), { target: { value: " acct_demo_1 " } });
    fireEvent.change(screen.getByLabelText("套餐"), { target: { value: " trial " } });
    fireEvent.change(screen.getByLabelText("资源通道"), { target: { value: " node-alpha " } });
    fireEvent.change(screen.getByLabelText("状态"), { target: { value: " active_recently " } });
    fireEvent.change(screen.getByLabelText("告警"), { target: { value: " high_refresh_count " } });
    fireEvent.click(screen.getByRole("button", { name: "应用筛选" }));

    await waitFor(() => {
      expect(listSubscriptionUsageMonitor).toHaveBeenLastCalledWith({
        accountId: "acct_demo_1",
        plan: "trial",
        nodeId: "node-alpha",
        status: "active_recently",
        warning: "high_refresh_count"
      });
    });
  });

  test("keeps the latest filtered response when the initial load resolves later", async () => {
    const initialLoad = deferred<SubscriptionUsageMonitor>();
    const filteredLoad = deferred<SubscriptionUsageMonitor>();
    const listSubscriptionUsageMonitor = vi
      .fn()
      .mockReturnValueOnce(initialLoad.promise)
      .mockReturnValueOnce(filteredLoad.promise);

    render(<SubscriptionUsageMonitorPage apiClient={adminClient({ listSubscriptionUsageMonitor })} />);

    fireEvent.change(screen.getByLabelText("账号 ID"), { target: { value: " acct_latest " } });
    fireEvent.click(screen.getByRole("button", { name: "应用筛选" }));

    await waitFor(() => {
      expect(listSubscriptionUsageMonitor).toHaveBeenCalledTimes(2);
    });
    filteredLoad.resolve(monitorFixture({
      items: [
        monitorRowFixture({
          accountId: "acct_latest",
          issuanceRequestId: "order_latest",
          activityLevel: "active_recently"
        })
      ]
    }));

    expect(await screen.findByText("acct_latest")).not.toBeNull();
    expect(screen.queryByText("acct_stale_initial")).toBeNull();

    initialLoad.resolve(monitorFixture({
      items: [
        monitorRowFixture({
          accountId: "acct_stale_initial",
          issuanceRequestId: "order_stale_initial",
          activityLevel: "never_seen"
        })
      ]
    }));

    await waitFor(() => {
      expect(screen.getByText("acct_latest")).not.toBeNull();
      expect(screen.queryByText("acct_stale_initial")).toBeNull();
    });
  });

  test("loads monitor rows when rendered inside React StrictMode", async () => {
    const firstStrictLoad = deferred<SubscriptionUsageMonitor>();
    const secondStrictLoad = deferred<SubscriptionUsageMonitor>();
    const listSubscriptionUsageMonitor = vi
      .fn()
      .mockReturnValueOnce(firstStrictLoad.promise)
      .mockReturnValueOnce(secondStrictLoad.promise);

    render(
      <StrictMode>
        <SubscriptionUsageMonitorPage apiClient={adminClient({ listSubscriptionUsageMonitor })} />
      </StrictMode>
    );

    await waitFor(() => {
      expect(listSubscriptionUsageMonitor).toHaveBeenCalledTimes(2);
    });
    firstStrictLoad.resolve(monitorFixture({
      items: [
        monitorRowFixture({
          accountId: "acct_strict_stale",
          issuanceRequestId: "order_strict_stale"
        })
      ]
    }));
    secondStrictLoad.resolve(monitorFixture({
      items: [
        monitorRowFixture({
          accountId: "acct_strict_latest",
          issuanceRequestId: "order_strict_latest",
          activityLevel: "active_recently"
        })
      ]
    }));

    expect(await screen.findByText("acct_strict_latest")).not.toBeNull();
    expect(screen.getByText("order_strict_latest")).not.toBeNull();
    expect(screen.queryByText("正在加载活动记录...")).toBeNull();
    expect(screen.queryByText("acct_strict_stale")).toBeNull();
  });

  test("renders an empty state when no monitor rows match the filters", async () => {
    const listSubscriptionUsageMonitor = vi.fn(async () => monitorFixture({ items: [] }));

    render(<SubscriptionUsageMonitorPage apiClient={adminClient({ listSubscriptionUsageMonitor })} />);

    expect(await screen.findByText("当前筛选条件下没有活动记录。")).not.toBeNull();
  });

  test("renders warning chips while keeping the monitor table read-only", async () => {
    const listSubscriptionUsageMonitor = vi.fn(async () => monitorFixture({
      items: [
        monitorRowFixture({
          linkStatus: "revoked",
          activityLevel: "blocked",
          warnings: ["high_refresh_count", "missing_artifact_ref"]
        })
      ],
      aggregates: {
        total: 1,
        activeRecently: 0,
        neverSeen: 0,
        highRefresh: 1,
        blocked: 0,
        inactive: 0,
        seen: 1,
        withWarnings: 1,
        byPlan: { monthly: 1 },
        byNode: { "node-alpha": 1 },
        warnings: { high_refresh_count: 1, missing_artifact_ref: 1 },
        usage: usageAggregateFixture({ unmeasuredOrders: 1 })
      }
    }));

    render(<SubscriptionUsageMonitorPage apiClient={adminClient({ listSubscriptionUsageMonitor })} />);

    expect(await screen.findByText("刷新频率偏高")).not.toBeNull();
    const table = screen.getByRole("table");
    expect(within(table).getByText("链接状态")).not.toBeNull();
    expect(within(table).getByText("revoked")).not.toBeNull();
    expect(within(table).getByText("刷新频率偏高")).not.toBeNull();
    expect(within(table).getByText("交付记录缺失")).not.toBeNull();
    expect(within(table).queryAllByRole("button")).toHaveLength(0);
    expect(within(table).queryAllByRole("button", { name: /delete|disable|renew|revoke|refresh/i })).toHaveLength(0);
  });
});

function adminClient(overrides: Partial<AdminApiClient>): AdminApiClient {
  return overrides as AdminApiClient;
}

function monitorFixture(overrides: Partial<SubscriptionUsageMonitor> = {}): SubscriptionUsageMonitor {
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
      total: 1,
      activeRecently: 0,
      neverSeen: 0,
      highRefresh: 0,
      blocked: 0,
      inactive: 0,
      seen: 1,
      withWarnings: 0,
      byPlan: { monthly: 1 },
      byNode: { "node-alpha": 1 },
      warnings: {},
      usage: usageAggregateFixture(),
      ...overrides.aggregates
    },
    items: [monitorRowFixture()],
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

function monitorRowFixture(overrides: Partial<SubscriptionUsageMonitorRow> = {}): SubscriptionUsageMonitorRow {
  return {
    accountId: "acct_demo_default",
    issuanceRequestId: "order_demo_default",
    entitlementId: "entitlement_demo_default",
    plan: "monthly",
    quantity: 1,
    nodeId: "node-alpha",
    issuedChannels: ["node-alpha"],
    tenantRef: "tenant-demo-ref",
    artifactRef: "artifact-demo-ref",
    linkStatus: "active",
    tenantStatus: "active",
    artifactStatus: "seen",
    validUntil: "2026-07-05T08:00:00.000Z",
    tenantExpiresAt: "2026-07-05T08:00:00.000Z",
    lastRefreshAt: "2026-06-05T07:55:00.000Z",
    artifactFirstSeenAt: "2026-06-01T08:00:00.000Z",
    artifactLastSeenAt: "2026-06-05T07:55:00.000Z",
    refreshCount: 3,
    trafficLimitBytes: 0,
    portalUserRef: "portal_user_demo_default",
    usedBytes: 0,
    uploadBytes: 0,
    downloadBytes: 0,
    usageStatus: "not_collected",
    usageMeasured: false,
    lastUsageObservedAt: null,
    channelUsages: [],
    activityLevel: "seen",
    warnings: [],
    ...overrides
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
