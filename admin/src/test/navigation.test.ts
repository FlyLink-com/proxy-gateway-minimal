import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { App } from "../App";
import { consoleSections, navItems, navSections, pageContexts, pageTitles } from "../app/navigation";
import { saveAdminSession } from "../features/subscriptions/admin-session";

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  window.location.hash = "";
  vi.unstubAllGlobals();
});

describe("admin navigation", () => {
  test("groups product-facing admin surfaces by responsibility", () => {
    const activePages = ["dashboard", "portalRequests", "usageMonitor"];
    const navPageIds = navItems.map((item) => item.id);

    expect(navPageIds).toEqual(activePages);
    expect(Object.keys(pageTitles)).toEqual(activePages);
    expect(navSections.map((section) => section.label)).toEqual(["总览", "用户监管", "平台监控"]);
    expect(navSections.map((section) => section.description)).toEqual([
      "平台健康与风险",
      "账号、资源与额度",
      "用量采集与通道"
    ]);
    expect(navSections.map((section) => section.items.map((item) => item.label))).toEqual([
      ["运营总览"],
      ["账号与资源"],
      ["流量与通道"]
    ]);
    expect(pageTitles.dashboard).toBe("运营总览");
    expect(pageTitles.portalRequests).toBe("账号与资源");
    expect(pageTitles.usageMonitor).toBe("流量与通道");
    expect(pageContexts.dashboard).toEqual({
      eyebrow: "总览",
      description: "平台健康、风险摘要和近期活动"
    });
    expect(pageContexts.portalRequests).toEqual({
      eyebrow: "用户监管",
      description: "账号、资源、订单和流量额度"
    });
    expect(pageContexts.usageMonitor).toEqual({
      eyebrow: "平台监控",
      description: "用量采集、通道健康和异常订阅"
    });
  });

  test("reserves future console sections without rendering empty navigation groups", () => {
    const activeSections = consoleSections.filter((section) => section.status === "active");
    const plannedSections = consoleSections.filter((section) => section.status === "planned");

    expect(consoleSections.map((section) => section.label)).toEqual([
      "总览",
      "用户监管",
      "平台监控",
      "审计与工单",
      "平台开发",
      "系统设置"
    ]);
    expect(activeSections.map((section) => section.id)).toEqual(navSections.map((section) => section.id));
    expect(plannedSections.map((section) => section.label)).toEqual(["审计与工单", "平台开发", "系统设置"]);
    expect(plannedSections.map((section) => section.items)).toEqual([[], [], []]);
    expect(navSections.map((section) => section.label)).not.toContain("审计与工单");
    expect(navSections.map((section) => section.label)).not.toContain("平台开发");
    expect(navSections.map((section) => section.label)).not.toContain("系统设置");
    expect(navItems.map((item) => item.label)).toEqual(["运营总览", "账号与资源", "流量与通道"]);
  });

  test("gates the admin shell behind API configuration before rendering business pages", () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => dashboardJsonResponse(String(input)));
    vi.stubGlobal("fetch", fetcher);

    render(createElement(App));

    expect(screen.getByRole("heading", { name: "连接管理员 API" })).not.toBeNull();
    expect(screen.getByText("运营与平台控制台")).not.toBeNull();
    expect(screen.getByText("保存控制台令牌后才能进入总览、用户监管和平台监控。")).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "运营总览" })).toBeNull();
    expect(screen.queryByRole("button", { name: "运营总览" })).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("defaults the admin shell to the operations dashboard", async () => {
    saveAdminSession({
      baseUrl: "http://127.0.0.1:3456",
      consoleToken: "admin_console_ref"
    });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => dashboardJsonResponse(String(input))));

    render(createElement(App));

    expect(await screen.findByRole("heading", { name: "运营总览" })).not.toBeNull();
    expect(screen.getByText("平台健康与风险")).not.toBeNull();
    expect(screen.getByText("账号、资源与额度")).not.toBeNull();
    expect(screen.getByText("用量采集与通道")).not.toBeNull();
    expect(screen.getByText("运营与平台控制台")).not.toBeNull();
    expect(screen.getByText("平台健康、风险摘要和近期活动")).not.toBeNull();
    expect(screen.getByRole("button", { name: "运营总览" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByLabelText("Admin API connection settings")).not.toBeNull();
    expect(document.querySelector(".admin-content")?.textContent).not.toContain("Admin API connection");
  });

  test("routes platform monitoring navigation to the usage and channel monitor page", async () => {
    saveAdminSession({
      baseUrl: "http://127.0.0.1:3456",
      consoleToken: "admin_console_ref"
    });
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/admin/platform/subscription-usage-monitor")) {
        return jsonResponse({ monitor: usageMonitorResponse() });
      }
      if (url.includes("/api/admin/overview")) {
        return jsonResponse(overviewResponse());
      }
      if (url.includes("/api/admin/platform/portal-access-requests")) {
        return jsonResponse({ items: [] });
      }
      if (url.includes("/api/admin/subscriptions")) {
        return jsonResponse({ items: [] });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetcher);

    render(createElement(App));

    fireEvent.click(screen.getByRole("button", { name: "流量与通道" }));

    expect(await screen.findByRole("heading", { name: "流量与通道" })).not.toBeNull();
    expect(screen.getByText("用量采集、通道健康和异常订阅")).not.toBeNull();
    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledWith(
        expect.stringContaining("/api/admin/platform/subscription-usage-monitor"),
        expect.any(Object)
      );
    });
  });

  test("keeps retired engineering tools out of the main navigation", async () => {
    saveAdminSession({
      baseUrl: "http://127.0.0.1:3456",
      consoleToken: "admin_console_ref"
    });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => dashboardJsonResponse(String(input))));

    render(createElement(App));

    expect(await screen.findByRole("heading", { name: "运营总览" })).not.toBeNull();
    const navigation = screen.getByLabelText("Admin navigation");
    expect(navigation.textContent).toContain("用户监管");
    expect(navigation.textContent).toContain("平台监控");
    expect(navigation.textContent).not.toMatch(/Overview|Provisioning|Subscriptions|Nodes/);
    expect(screen.queryByRole("button", { name: /Overview|Provisioning|Subscriptions|Nodes/ })).toBeNull();
  });
});

function dashboardJsonResponse(url: string) {
  if (url.includes("/api/admin/overview")) {
    return jsonResponse(overviewResponse());
  }
  if (url.includes("/api/admin/platform/portal-access-requests")) {
    return jsonResponse({ items: [] });
  }
  if (url.includes("/api/admin/platform/subscription-usage-monitor")) {
    return jsonResponse({ monitor: usageMonitorResponse() });
  }
  return jsonResponse({}, 404);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function overviewResponse() {
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
      ready: true,
      eligibleNodes: 1,
      blockedNodes: 0,
      blockers: []
    }
  };
}

function usageMonitorResponse() {
  return {
    type: "subscription_usage_monitor",
    generatedAt: "2026-06-05T08:00:00.000Z",
    filters: {
      accountId: "",
      plan: "",
      nodeId: "",
      status: "",
      warning: ""
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
      usage: {
        totalUsedBytes: 0,
        totalUploadBytes: 0,
        totalDownloadBytes: 0,
        measuredOrders: 0,
        unmeasuredOrders: 0,
        zeroUsageOrders: 0,
        overLimitOrders: 0,
        nearLimitOrders: 0,
        byUsageChannel: {}
      }
    },
    items: [],
    safety: {
      summaryOnly: true,
      realByteUsageMeasured: false,
      orderLevelRows: true,
      channelUsageBreakdownIncluded: true,
      rawSubscriptionUrlReturned: false,
      rawSecretReturned: false,
      rawCustomerNetworkDataReturned: false,
      mutationAllowed: false
    }
  };
}
