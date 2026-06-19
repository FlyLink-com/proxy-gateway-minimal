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
  test("separates platform channel health from anomalous subscription queue", async () => {
    const listSubscriptionUsageMonitor = vi.fn(async () => monitorFixture({
      items: [
        monitorRowFixture({
          portalUserRef: "portal_user_over_limit",
          accountId: "acct_over_limit",
          issuanceRequestId: "order_over_limit",
          nodeId: "node-alpha",
          issuedChannels: ["node-alpha"],
          usedBytes: 1200,
          uploadBytes: 400,
          downloadBytes: 800,
          usageStatus: "measured",
          collectionStatus: "measured",
          usageMeasured: true,
          trafficLimitBytes: 1000,
          lastUsageObservedAt: "2026-06-05T07:54:00.000Z",
          channelUsages: [
            {
              channelRef: "node-alpha",
              usedBytes: 1200,
              uploadBytes: 400,
              downloadBytes: 800,
              lastObservedAt: "2026-06-05T07:54:00.000Z"
            }
          ],
          warnings: ["usage_over_limit"]
        }),
        monitorRowFixture({
          portalUserRef: "portal_user_zero_usage",
          accountId: "acct_zero_usage",
          issuanceRequestId: "order_zero_usage",
          nodeId: "node-beta",
          issuedChannels: ["node-beta"],
          usageStatus: "measured_zero",
          collectionStatus: "measured_zero",
          usageMeasured: true,
          trafficLimitBytes: 1000,
          lastUsageObservedAt: "2026-06-05T07:55:00.000Z",
          channelUsages: [
            {
              channelRef: "node-beta",
              usedBytes: 0,
              uploadBytes: 0,
              downloadBytes: 0,
              lastObservedAt: "2026-06-05T07:55:00.000Z"
            }
          ]
        }),
        monitorRowFixture({
          portalUserRef: "portal_user_stale",
          accountId: "acct_stale",
          issuanceRequestId: "order_stale",
          nodeId: "node-alpha",
          issuedChannels: ["node-alpha"],
          usageStatus: "not_collected",
          collectionStatus: "stale",
          usageMeasured: false,
          lastUsageObservedAt: "2026-06-01T07:55:00.000Z"
        }),
        monitorRowFixture({
          portalUserRef: "portal_user_collector_off",
          accountId: "acct_collector_off",
          issuanceRequestId: "order_collector_off",
          nodeId: "node-gamma",
          issuedChannels: ["node-gamma"],
          usageStatus: "not_collected",
          collectionStatus: "collector_disabled",
          usageMeasured: false
        }),
        monitorRowFixture({
          portalUserRef: "portal_user_unconfirmed",
          accountId: "acct_unconfirmed",
          issuanceRequestId: "order_unconfirmed",
          nodeId: "node-delta",
          issuedChannels: ["node-delta"],
          edgeCredentialBindings: [
            {
              channelRef: "node-delta",
              credentialRefPresent: false,
              materialDigestPresent: false,
              usageMeasured: false
            }
          ]
        })
      ],
      aggregates: {
        total: 5,
        activeRecently: 1,
        neverSeen: 2,
        highRefresh: 0,
        blocked: 0,
        inactive: 0,
        seen: 2,
        withWarnings: 1,
        byPlan: { monthly: 5 },
        byNode: {
          "node-alpha": 2,
          "node-beta": 1,
          "node-gamma": 1,
          "node-delta": 1
        },
        warnings: { usage_over_limit: 1 },
        usage: usageAggregateFixture({
          totalUsedBytes: 1200,
          totalUploadBytes: 400,
          totalDownloadBytes: 800,
          measuredOrders: 1,
          unmeasuredOrders: 3,
          zeroUsageOrders: 1,
          overLimitOrders: 1,
          nearLimitOrders: 0,
          byUsageChannel: { "node-alpha": 1200 }
        })
      }
    }));

    render(<SubscriptionUsageMonitorPage apiClient={adminClient({ listSubscriptionUsageMonitor })} />);

    expect(await screen.findByRole("heading", { name: "Traffic & Channel Supervision" })).not.toBeNull();
    expect(screen.getByLabelText("Traffic & Channel supervision cases")).not.toBeNull();
    expect(screen.getAllByText("Order traffic over limit").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Receipt / collection pending").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Usage collection stale").length).toBeGreaterThanOrEqual(1);
    const caseDetail = screen.getByLabelText("Case detail");
    expect(within(caseDetail).getByText("Usage & Channels")).not.toBeNull();
    expect(within(caseDetail).getByText("Separate gate required")).not.toBeNull();
    expect(within(caseDetail).queryByRole("button", { name: /disable|archive|create|delete/i })).toBeNull();
    const channelHealth = screen.getByLabelText("Channel collection health");
    expect(within(channelHealth).getByRole("heading", { name: "Platform channel health" })).not.toBeNull();
    const alphaCard = within(channelHealth).getByText("node-alpha").closest(".usage-channel-health-card");
    expect(alphaCard).not.toBeNull();
    const alphaCardScope = within(alphaCard as HTMLElement);
    expect(alphaCardScope.getByText("Coverage 2 orders")).not.toBeNull();
    expect(alphaCardScope.getByText("Measured 1 orders")).not.toBeNull();
    expect(alphaCardScope.getByText("Pending collection 1 orders")).not.toBeNull();
    expect(alphaCardScope.getByText("1.17 KB")).not.toBeNull();

    const anomalyQueue = screen.getByLabelText("Anomalous subscription queue");
    expect(within(anomalyQueue).getByRole("heading", { name: "Anomalous subscription queue" })).not.toBeNull();
    expect(within(anomalyQueue).getByText("Over-limit subscriptions")).not.toBeNull();
    expect(within(anomalyQueue).getByText("Zero usage")).not.toBeNull();
    expect(within(anomalyQueue).getByText("Collection stale")).not.toBeNull();
    expect(within(anomalyQueue).getByText("Collection gaps")).not.toBeNull();
    expect(within(anomalyQueue).getByText("order_over_limit")).not.toBeNull();
    expect(within(anomalyQueue).getByText("Over limit")).not.toBeNull();
    expect(within(anomalyQueue).getByText("1.17 KB / 1000 B")).not.toBeNull();
    expect(within(anomalyQueue).getByText("order_zero_usage")).not.toBeNull();
    expect(within(anomalyQueue).getByText("True 0B")).not.toBeNull();
    expect(within(anomalyQueue).getByText("order_stale")).not.toBeNull();
    expect(within(anomalyQueue).getByText("Collection stale")).not.toBeNull();
    expect(within(anomalyQueue).getByText("order_collector_off")).not.toBeNull();
    expect(within(anomalyQueue).getByText("Collector disabled")).not.toBeNull();
    expect(within(anomalyQueue).getByText("order_unconfirmed")).not.toBeNull();
    expect(within(anomalyQueue).getByText("Receipt / collection pending")).not.toBeNull();
    expect(within(anomalyQueue).queryByText("Not collected")).not.toEqual(within(anomalyQueue).queryByText("True 0B"));

    const renderedText = document.body.textContent ?? "";
    expect(renderedText).not.toMatch(/subscriptionUrl|token|secret|password|yaml|edgecred_/i);
  });

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
          collectionStatus: "measured",
          usageMeasured: true,
          lastUsageObservedAt: "2026-06-05T07:54:00.000Z",
          edgeCredentialBindings: [
            {
              channelRef: "node-alpha",
              credentialRefPresent: true,
              materialDigestPresent: true,
              usageMeasured: true
            }
          ],
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
          collectionStatus: "collector_disabled",
          edgeCredentialBindings: [
            {
              channelRef: "node-beta",
              credentialRefPresent: true,
              materialDigestPresent: true,
              usageMeasured: false
            }
          ],
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

    expect(await screen.findByRole("heading", { name: "Traffic & Channel Supervision" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Historical usage curves" })).not.toBeNull();
    expect(screen.getByText("Select curves by user, order, and actual usage channel; the table remains the full order ledger.")).not.toBeNull();
    expect(screen.getByRole("img", { name: "OrderHistorical usage curves" })).not.toBeNull();
    expect((screen.getByLabelText("User portal_user_demo_1") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Order order_demo_1") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Channel node-alpha") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByLabelText("Curve order_demo_1 node-alpha")).not.toBeNull();

    fireEvent.click(screen.getByLabelText("Order order_demo_1"));

    expect(screen.queryByLabelText("Curve order_demo_1 node-alpha")).toBeNull();
    expect(screen.getByText("No curve data matches the current selection.")).not.toBeNull();
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
          collectionStatus: "measured",
          usageMeasured: true,
          lastUsageObservedAt: "2026-06-05T07:54:00.000Z",
          edgeCredentialBindings: [
            {
              channelRef: "node-alpha",
              credentialRefPresent: true,
              materialDigestPresent: true,
              usageMeasured: true
            },
            {
              channelRef: "node-gamma",
              credentialRefPresent: true,
              materialDigestPresent: true,
              usageMeasured: false
            }
          ],
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
          collectionStatus: "collector_disabled",
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

    expect(await screen.findByRole("heading", { name: "Traffic & Channel Supervision" })).not.toBeNull();
    expect(screen.getByText("Platform summaries are supervision evidence only; quota, warning, pause, and archive decisions follow account, order, and edge credential ownership in the order ledger.")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Platform collection overview" })).not.toBeNull();
    expect(screen.getByText("Platform measured traffic")).not.toBeNull();
    expect(screen.getByText("Upload")).not.toBeNull();
    expect(screen.getByText("Download")).not.toBeNull();
    expect(screen.getByText("Measured orders")).not.toBeNull();
    expect(screen.getAllByText("Not connected to collection").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText("Platform channel usage")).not.toBeNull();
    expect(screen.getAllByText("node-alpha").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Order activity summary")).not.toBeNull();
    expect(screen.getByText("Order usage ledger")).not.toBeNull();
    expect(screen.getByText("Total records")).not.toBeNull();
    expect(screen.getAllByText("Recently active").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Never seen").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("High refresh")).not.toBeNull();
    expect(screen.getByText("Blocked")).not.toBeNull();
    expect(screen.getByText("Inactive")).not.toBeNull();
    expect(screen.getByText("Seen")).not.toBeNull();
    expect(screen.getByText("With warnings")).not.toBeNull();
    expect(await screen.findByText("acct_demo_1")).not.toBeNull();
    const firstRow = screen.getByText("acct_demo_1").closest("tr");
    expect(firstRow).not.toBeNull();
    const firstRowScope = within(firstRow as HTMLElement);
    expect(firstRowScope.getByText("portal_user_demo_1")).not.toBeNull();
    expect(firstRowScope.getByText("order_demo_1")).not.toBeNull();
    expect(firstRowScope.getByText("trial / 1")).not.toBeNull();
    expect(firstRowScope.getAllByText("node-alpha").length).toBeGreaterThanOrEqual(2);
    expect(firstRowScope.getAllByText("node-gamma").length).toBeGreaterThanOrEqual(2);
    expect(firstRowScope.getByText("edge credential")).not.toBeNull();
    expect(firstRowScope.getByText("2 bindings")).not.toBeNull();
    expect(firstRowScope.getByText("300 B / 1000 B")).not.toBeNull();
    expect(firstRowScope.getAllByText("300 B").length).toBeGreaterThanOrEqual(1);
    expect(firstRowScope.getByText(formatExpectedDateTime("2026-06-05T07:54:00.000Z"))).not.toBeNull();
    expect(firstRowScope.getByText("Collected")).not.toBeNull();
    expect(firstRowScope.getByText("Bound")).not.toBeNull();
    expect(firstRowScope.getByText("Recently active")).not.toBeNull();
    expect(screen.getAllByText("Collector disabled").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Not recorded").length).toBeGreaterThanOrEqual(1);

    const renderedText = document.body.textContent ?? "";
    expect(renderedText).not.toMatch(/subscriptionUrl|token|secret|password|yaml/i);
    expect(renderedText).not.toMatch(/tenant-safe-ref|artifact-safe-ref|tenant-|artifact-/i);
  });

  test("submits trimmed monitor filters to the client", async () => {
    const listSubscriptionUsageMonitor = vi.fn(async () => monitorFixture());

    render(<SubscriptionUsageMonitorPage apiClient={adminClient({ listSubscriptionUsageMonitor })} />);

    expect(await screen.findByRole("heading", { name: "Traffic & Channel Supervision" })).not.toBeNull();
    fireEvent.change(screen.getByLabelText("Account ID"), { target: { value: " acct_demo_1 " } });
    fireEvent.change(screen.getByLabelText("Plan"), { target: { value: " trial " } });
    fireEvent.change(screen.getByLabelText("Resource channel"), { target: { value: " node-alpha " } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: " active_recently " } });
    fireEvent.change(screen.getByLabelText("Warnings"), { target: { value: " high_refresh_count " } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));

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

    fireEvent.change(screen.getByLabelText("Account ID"), { target: { value: " acct_latest " } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));

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
    expect(screen.getAllByText("order_strict_latest").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Loading activity records...")).toBeNull();
    expect(screen.queryByText("acct_strict_stale")).toBeNull();
  });

  test("renders an empty state when no monitor rows match the filters", async () => {
    const listSubscriptionUsageMonitor = vi.fn(async () => monitorFixture({ items: [] }));

    render(<SubscriptionUsageMonitorPage apiClient={adminClient({ listSubscriptionUsageMonitor })} />);

    expect(await screen.findByText("No activity records match the current filters.")).not.toBeNull();
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

    expect(await screen.findByText("High refresh frequency")).not.toBeNull();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Link status")).not.toBeNull();
    expect(within(table).getByText("revoked")).not.toBeNull();
    expect(within(table).getByText("High refresh frequency")).not.toBeNull();
    expect(within(table).getByText("Delivery record missing")).not.toBeNull();
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
    collectionStatus: "not_collected",
    edgeCredentialBindings: [
      {
        channelRef: "node-alpha",
        credentialRefPresent: true,
        materialDigestPresent: true,
        usageMeasured: false
      }
    ],
    ...overrides
  };
}

function formatExpectedDateTime(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
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
