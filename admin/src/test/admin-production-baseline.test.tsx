import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  ADMIN_PRODUCTION_BASELINE_EVIDENCE,
  ADMIN_PRODUCTION_BASELINE_GROUPS,
  ADMIN_PRODUCTION_BASELINE_PAGE_IDS,
  ADMIN_PRODUCTION_BASELINE_PAGES,
  formatAdminProductionBaselinePreviewHash,
  isAdminProductionBaselineLoopbackHostname,
  isAdminProductionBaselinePreviewEnabled,
  isAdminProductionBaselinePreviewHash,
  parseAdminProductionBaselinePreviewHash
} from "../app/admin-production-baseline";
import {
  DEFAULT_ADMIN_CAPABILITY_CONTEXT,
  getPluginApps,
  getRegisteredAdminApiHookIds,
  getWorkspacePageApps
} from "../app/admin-app-manifest";
import { isAdminFixturePreviewEnabled } from "../app/admin-fixture-preview";
import { navItems, pageTitles } from "../app/navigation";
import { createAdminSearchResults } from "../app/admin-search-index";
import { AdminProductionBaselinePreview } from "../pages/admin-production-baseline-preview";
import { overviewBlueprint } from "../pages/dashboard-page";
import { accountsResourcesBlueprint } from "../pages/portal-requests-page";
import { usageChannelsBlueprint } from "../pages/subscription-usage-monitor-page";

const BASELINE_PAGE_IDS = [
  "dashboard",
  "portalRequests",
  "usageMonitor",
  "userManagement",
  "orderRecords",
  "nodeHealth",
  "nodeBandwidth",
  "userAccessLogs",
  "userOperationLogs",
  "nodeLogs"
] as const;

const ENABLED_GATE = {
  env: { DEV: true, VITE_ADMIN_BASELINE_PREVIEW: "true" },
  hostname: "localhost",
  hash: "#/admin-baseline"
};

const SEARCH_BLUEPRINTS = [
  overviewBlueprint(),
  accountsResourcesBlueprint,
  usageChannelsBlueprint
];

const WRITE_OR_EXPORT_CONTROL = /导出|下载|采集|刷新|禁用|创建|退款|删除|export|reload|collect|disable|create|refund/i;
const INVENTED_DATA = /acct_demo|ord_safe|98\.6%|12 affected|All 18|High 5|Good · reviewable|secret-value|subscriptionUrl|token=/i;

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  window.location.hash = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("admin production baseline model", () => {
  test("keeps the ten observed page IDs and Chinese group order as layout inventory", () => {
    expect([...ADMIN_PRODUCTION_BASELINE_PAGE_IDS]).toEqual([...BASELINE_PAGE_IDS]);
    expect(ADMIN_PRODUCTION_BASELINE_GROUPS.map((group) => group.id)).toEqual(["monitor", "manage", "logs"]);
    expect(ADMIN_PRODUCTION_BASELINE_GROUPS.map((group) => group.label)).toEqual(["监测", "管理", "日志"]);
    expect(ADMIN_PRODUCTION_BASELINE_GROUPS.map((group) => [...group.pageIds])).toEqual([
      ["dashboard", "portalRequests", "usageMonitor"],
      ["userManagement", "orderRecords", "nodeHealth", "nodeBandwidth"],
      ["userAccessLogs", "userOperationLogs", "nodeLogs"]
    ]);
    expect(ADMIN_PRODUCTION_BASELINE_GROUPS.flatMap((group) => [...group.pageIds])).toEqual([...BASELINE_PAGE_IDS]);
    expect(ADMIN_PRODUCTION_BASELINE_GROUPS.map((group) => (
      group.pageIds.map((pageId) => ADMIN_PRODUCTION_BASELINE_PAGES[pageId].label)
    ))).toEqual([
      ["运营总览", "账户与资源", "使用情况和渠道"],
      ["用户管理", "订单记录", "节点健康状况", "节点带宽"],
      ["用户访问日志", "用户操作日志", "节点日志"]
    ]);

    expect(ADMIN_PRODUCTION_BASELINE_PAGES.dashboard).toMatchObject({
      dataStatus: "unconnected",
      groupId: "monitor",
      privileged: false,
      summaryAreas: [
        "Platform health",
        "Risk",
        "Freshness",
        "Coverage",
        "Risk Queue",
        "Owner Routing",
        "Review",
        "Platform Metrics",
        "Platform Event Log"
      ]
    });
    expect(ADMIN_PRODUCTION_BASELINE_PAGES.portalRequests.tableFields).toEqual(["账户", "资源", "状态", "套餐", "最近活动"]);
    expect(ADMIN_PRODUCTION_BASELINE_PAGES.usageMonitor.tableFields).toEqual(["账户", "渠道", "用量", "采集新鲜度", "状态"]);
    expect(ADMIN_PRODUCTION_BASELINE_PAGES.userManagement.tableFields).toEqual(["用户", "邮箱", "套餐", "状态", "最近访问"]);
    expect(ADMIN_PRODUCTION_BASELINE_PAGES.orderRecords.tableFields).toEqual(["订单", "账户", "套餐", "状态", "创建时间"]);
    expect(ADMIN_PRODUCTION_BASELINE_PAGES.nodeHealth.tableFields).toEqual(["节点", "区域", "状态", "延迟", "最近心跳"]);
    expect(ADMIN_PRODUCTION_BASELINE_PAGES.nodeBandwidth.tableFields).toEqual(["节点", "入站", "出站", "利用率"]);
    expect(ADMIN_PRODUCTION_BASELINE_PAGES.userAccessLogs.tableFields).toEqual(["时间", "账户", "动作", "结果", "来源"]);
    expect(ADMIN_PRODUCTION_BASELINE_PAGES.userOperationLogs.tableFields).toEqual(["时间", "操作者", "对象", "动作", "结果"]);
    expect(ADMIN_PRODUCTION_BASELINE_PAGES.nodeLogs.tableFields).toEqual(["时间", "节点", "级别", "事件"]);
    expect(ADMIN_PRODUCTION_BASELINE_PAGE_IDS.filter((pageId) => (
      ADMIN_PRODUCTION_BASELINE_PAGES[pageId].dataStatus === "unconnected"
    ))).toEqual([
      "dashboard",
      "portalRequests",
      "usageMonitor",
      "userManagement",
      "orderRecords",
      "nodeHealth",
      "nodeBandwidth"
    ]);
    expect(ADMIN_PRODUCTION_BASELINE_PAGE_IDS.filter((pageId) => (
      ADMIN_PRODUCTION_BASELINE_PAGES[pageId].dataStatus === "privileged-gated"
    ))).toEqual(["userAccessLogs", "userOperationLogs", "nodeLogs"]);
    expect(ADMIN_PRODUCTION_BASELINE_PAGES.userAccessLogs.privileged).toBe(true);
    expect(ADMIN_PRODUCTION_BASELINE_PAGES.userOperationLogs.privileged).toBe(true);
    expect(ADMIN_PRODUCTION_BASELINE_PAGES.nodeLogs.privileged).toBe(true);
    expect(ADMIN_PRODUCTION_BASELINE_PAGES.userManagement.privileged).toBe(false);
  });

  test("records observed public-asset evidence without invented business records", () => {
    expect(ADMIN_PRODUCTION_BASELINE_EVIDENCE.historicalSourceCommit).toBe("UNKNOWN");
    expect(ADMIN_PRODUCTION_BASELINE_EVIDENCE.role).toBe("observed-reference");
    expect(ADMIN_PRODUCTION_BASELINE_EVIDENCE.notNewlyBuiltOutput).toBe(true);
    expect(ADMIN_PRODUCTION_BASELINE_EVIDENCE.notCurrentBackend).toBe(true);
    expect(ADMIN_PRODUCTION_BASELINE_EVIDENCE.publicAssets).toEqual([
      {
        bytes: 582452,
        filename: "index-DBS1EaJC.js",
        sha256: "7FE66A871C8E5F5094F29B7DB09D448BA01C6B2E7A01A168277E8E7273713DCB"
      },
      {
        bytes: 382111,
        filename: "index-C8cV34to.css",
        sha256: "31BF29505A98D2A21285C30A1B8332AFB97A49A1DBB26C933A71D61B59EA4944"
      }
    ]);

    const pageModel = JSON.stringify(ADMIN_PRODUCTION_BASELINE_PAGES);
    expect(pageModel).not.toMatch(INVENTED_DATA);
    expect(pageModel).not.toMatch(/"rows"\s*:/);
    expect(pageModel).not.toMatch(/"value"\s*:\s*"Good"/);
    BASELINE_PAGE_IDS.forEach((pageId) => {
      expect(ADMIN_PRODUCTION_BASELINE_PAGES[pageId]).not.toHaveProperty("rows");
      expect(ADMIN_PRODUCTION_BASELINE_PAGES[pageId]).not.toHaveProperty("records");
      expect(ADMIN_PRODUCTION_BASELINE_PAGES[pageId]).not.toHaveProperty("counts");
    });
  });

  test("formats isolated hashes and safely resolves unknown or malformed child routes", () => {
    BASELINE_PAGE_IDS.forEach((pageId) => {
      const hash = formatAdminProductionBaselinePreviewHash(pageId);
      expect(hash).toBe(`#/admin-baseline/${pageId}`);
      expect(isAdminProductionBaselinePreviewHash(hash)).toBe(true);
      expect(parseAdminProductionBaselinePreviewHash(hash)).toEqual({ page: pageId });
    });

    expect(isAdminProductionBaselinePreviewHash("#/admin-baseline")).toBe(true);
    expect(isAdminProductionBaselinePreviewHash("#/admin-baseline/")).toBe(true);
    expect(isAdminProductionBaselinePreviewHash("#/admin-baseline/unknown")).toBe(true);
    expect(parseAdminProductionBaselinePreviewHash("#/admin-baseline")).toEqual({ page: "dashboard" });
    expect(parseAdminProductionBaselinePreviewHash("#/admin-baseline/")).toEqual({ page: "dashboard" });
    expect(parseAdminProductionBaselinePreviewHash("#/admin-baseline/unknown")).toEqual({ page: "dashboard" });
    expect(() => parseAdminProductionBaselinePreviewHash("#/admin-baseline/%E0%A4%A")).not.toThrow();
    expect(parseAdminProductionBaselinePreviewHash("#/admin-baseline/%E0%A4%A")).toEqual({ page: "dashboard" });
    expect(parseAdminProductionBaselinePreviewHash("#/admin-baseline/%2e%2e")).toEqual({ page: "dashboard" });

    expect(isAdminProductionBaselinePreviewHash("#/admin")).toBe(false);
    expect(isAdminProductionBaselinePreviewHash("#/admin/operations")).toBe(false);
    expect(isAdminProductionBaselinePreviewHash("#/admin-baseline-tools")).toBe(false);
    expect(isAdminProductionBaselinePreviewHash("#/fixture-preview")).toBe(false);
    expect(isAdminProductionBaselinePreviewHash("#/portal-preview")).toBe(false);
    expect(parseAdminProductionBaselinePreviewHash("#/admin")).toBeNull();
    expect(parseAdminProductionBaselinePreviewHash("#/admin/operations")).toBeNull();
    expect(parseAdminProductionBaselinePreviewHash("#/admin-baseline-tools")).toBeNull();
    expect(parseAdminProductionBaselinePreviewHash("#/fixture-preview")).toBeNull();
    expect(parseAdminProductionBaselinePreviewHash("")).toBeNull();
  });
});

describe("admin production baseline local gate", () => {
  test("enables only when DEV, explicit opt-in, loopback, and preview hash are all present", () => {
    expect(isAdminProductionBaselinePreviewEnabled(ENABLED_GATE)).toBe(true);
    expect(isAdminProductionBaselinePreviewEnabled({
      ...ENABLED_GATE,
      env: { DEV: true, VITE_ADMIN_BASELINE_PREVIEW: true },
      hash: "#/admin-baseline/userManagement"
    })).toBe(true);
    expect(isAdminProductionBaselinePreviewEnabled({
      ...ENABLED_GATE,
      env: { DEV: true, VITE_ADMIN_BASELINE_PREVIEW: "1" },
      hostname: "127.0.0.1",
      hash: "#/admin-baseline/"
    })).toBe(true);
    expect(isAdminProductionBaselinePreviewEnabled({
      ...ENABLED_GATE,
      env: { DEV: true, VITE_ADMIN_BASELINE_PREVIEW: "yes" },
      hostname: "::1"
    })).toBe(true);
    expect(isAdminProductionBaselinePreviewEnabled({
      ...ENABLED_GATE,
      env: { DEV: true, VITE_ADMIN_BASELINE_PREVIEW: "on" },
      hostname: "[::1]"
    })).toBe(true);
  });

  test("rejects production builds, remote hosts, missing opt-in, and hash misuse", () => {
    expect(isAdminProductionBaselinePreviewEnabled({
      env: { DEV: false, PROD: true, MODE: "production", VITE_ADMIN_BASELINE_PREVIEW: "true" },
      hostname: "localhost",
      hash: "#/admin-baseline"
    })).toBe(false);
    expect(isAdminProductionBaselinePreviewEnabled({
      env: { MODE: "development", VITE_ADMIN_BASELINE_PREVIEW: "true" },
      hostname: "localhost",
      hash: "#/admin-baseline"
    })).toBe(false);
    expect(isAdminProductionBaselinePreviewEnabled({
      env: { DEV: "true", VITE_ADMIN_BASELINE_PREVIEW: "true" },
      hostname: "localhost",
      hash: "#/admin-baseline"
    })).toBe(false);
    expect(isAdminProductionBaselinePreviewEnabled({
      ...ENABLED_GATE,
      env: { DEV: true }
    })).toBe(false);
    expect(isAdminProductionBaselinePreviewEnabled({
      ...ENABLED_GATE,
      env: { DEV: true, VITE_ADMIN_BASELINE_PREVIEW: "false" }
    })).toBe(false);
    expect(isAdminProductionBaselinePreviewEnabled({
      ...ENABLED_GATE,
      hostname: "admin.gccwebos.com"
    })).toBe(false);
    expect(isAdminProductionBaselinePreviewEnabled({
      ...ENABLED_GATE,
      hostname: "192.168.1.10"
    })).toBe(false);
    expect(isAdminProductionBaselinePreviewEnabled({
      ...ENABLED_GATE,
      hostname: "0.0.0.0"
    })).toBe(false);
    expect(isAdminProductionBaselinePreviewEnabled({
      ...ENABLED_GATE,
      hash: "#/fixture-preview"
    })).toBe(false);
    expect(isAdminProductionBaselinePreviewEnabled({
      ...ENABLED_GATE,
      hash: "#/admin/operations"
    })).toBe(false);
    expect(isAdminProductionBaselinePreviewEnabled({
      ...ENABLED_GATE,
      hash: "#/admin-baseline-tools"
    })).toBe(false);
    expect(isAdminProductionBaselinePreviewEnabled({
      ...ENABLED_GATE,
      hash: ""
    })).toBe(false);
    expect(isAdminProductionBaselinePreviewEnabled({
      env: { DEV: false, VITE_ADMIN_BASELINE_PREVIEW: "true" },
      hostname: "admin.gccwebos.com",
      hash: "#/admin-baseline/dashboard"
    })).toBe(false);
  });

  test("accepts only the stated IPv4 and IPv6 loopback hostnames", () => {
    expect(isAdminProductionBaselineLoopbackHostname("localhost")).toBe(true);
    expect(isAdminProductionBaselineLoopbackHostname("LOCALHOST")).toBe(true);
    expect(isAdminProductionBaselineLoopbackHostname("127.0.0.1")).toBe(true);
    expect(isAdminProductionBaselineLoopbackHostname("::1")).toBe(true);
    expect(isAdminProductionBaselineLoopbackHostname("[::1]")).toBe(true);
    expect(isAdminProductionBaselineLoopbackHostname("127.0.0.2")).toBe(false);
    expect(isAdminProductionBaselineLoopbackHostname("0.0.0.0")).toBe(false);
    expect(isAdminProductionBaselineLoopbackHostname("admin.gccwebos.com")).toBe(false);
    expect(isAdminProductionBaselineLoopbackHostname("localhost.example.com")).toBe(false);
    expect(isAdminProductionBaselineLoopbackHostname("::2")).toBe(false);
  });
});

describe("admin production baseline preview page", () => {
  test("renders the isolated comparison shell, empty overview, and all ten headings and fields", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    window.location.hash = "#/admin-baseline/dashboard";

    render(<AdminProductionBaselinePreview />);

    expect(screen.getByRole("heading", { name: "GlobalCircle AI - Operator Console" })).not.toBeNull();
    expect(screen.getByLabelText("Admin production baseline preview status").textContent).toMatch(/本地候选/);
    expect(screen.getByLabelText("Admin production baseline preview status").textContent).toMatch(/未连接实时数据/);
    expect(screen.getByText("监测")).not.toBeNull();
    expect(screen.getByText("管理")).not.toBeNull();
    expect(screen.getByText("日志")).not.toBeNull();

    BASELINE_PAGE_IDS.forEach((pageId) => {
      const page = ADMIN_PRODUCTION_BASELINE_PAGES[pageId];
      fireEvent.click(screen.getByRole("button", { name: page.label }));
      expect(window.location.hash).toBe(`#/admin-baseline/${pageId}`);
      expect(screen.getByRole("button", { name: page.label }).getAttribute("aria-current")).toBe("page");
      const region = screen.getByRole("region", { name: page.label });
      expect(within(region).getByRole("heading", { name: page.label })).not.toBeNull();
      expect(within(region).queryByRole("button", { name: WRITE_OR_EXPORT_CONTROL })).toBeNull();
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(document.body.textContent ?? "").not.toMatch(INVENTED_DATA);
    expect(document.body.textContent ?? "").not.toContain(JSON.stringify(ADMIN_PRODUCTION_BASELINE_PAGES));
    expect(document.body.textContent ?? "").not.toContain("7FE66A871C8E5F5094F29B7DB09D448BA01C6B2E7A01A168277E8E7273713DCB");
    expect(document.body.textContent ?? "").not.toMatch(/raw log|日志原文|grep|tail/i);
  });

  test("keeps unknown and malformed hashes on the safe overview without throwing", () => {
    window.location.hash = "#/admin-baseline/not-a-page";
    expect(() => render(<AdminProductionBaselinePreview />)).not.toThrow();
    expect(screen.getByRole("heading", { name: "运营总览" })).not.toBeNull();
    cleanup();

    window.location.hash = "#/admin-baseline/%E0%A4%A";
    expect(() => render(<AdminProductionBaselinePreview />)).not.toThrow();
    expect(screen.getByRole("heading", { name: "运营总览" })).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "用户管理" })).toBeNull();
  });

  test("updates only isolated baseline hashes and follows back and forward", async () => {
    window.location.hash = "#/admin-baseline/dashboard";
    render(<AdminProductionBaselinePreview />);

    fireEvent.click(screen.getByRole("button", { name: "用户管理" }));
    expect(window.location.hash).toBe("#/admin-baseline/userManagement");
    expect(screen.getByRole("heading", { name: "用户管理" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "节点日志" }));
    expect(window.location.hash).toBe("#/admin-baseline/nodeLogs");
    expect(screen.getByRole("heading", { name: "节点日志" })).not.toBeNull();
    expect(screen.getByText("采集诊断摘要，不是原始运行日志")).not.toBeNull();

    await act(async () => {
      window.history.back();
    });
    await waitFor(() => {
      expect(window.location.hash).toBe("#/admin-baseline/userManagement");
      expect(screen.getByRole("heading", { name: "用户管理" })).not.toBeNull();
    });

    await act(async () => {
      window.history.forward();
    });
    await waitFor(() => {
      expect(window.location.hash).toBe("#/admin-baseline/nodeLogs");
      expect(screen.getByRole("heading", { name: "节点日志" })).not.toBeNull();
    });
    expect(screen.getByText("采集诊断摘要，不是原始运行日志")).not.toBeNull();
    expect(window.location.hash).not.toMatch(/#\/admin\/|#\/fixture-preview/);
  });
});

describe("admin production baseline ordinary surface preservation", () => {
  test("does not add baseline pages to the ordinary manifest, search, API hooks, or AdminPage union", () => {
    expect(navItems.map((item) => item.id)).toEqual(["dashboard", "portalRequests", "usageMonitor"]);
    expect(Object.keys(pageTitles)).toEqual(["dashboard", "portalRequests", "usageMonitor"]);
    expect(getWorkspacePageApps().map((app) => app.id)).toEqual([
      "operations-overview",
      "accounts-resources",
      "usage-channels"
    ]);
    expect(getWorkspacePageApps().map((app) => app.route.page)).toEqual([
      "dashboard",
      "portalRequests",
      "usageMonitor"
    ]);
    expect(getPluginApps().some((app) => /userManagement|orderRecords|nodeHealth|nodeBandwidth|userAccessLogs|userOperationLogs|nodeLogs/.test(app.id))).toBe(false);
    expect(getRegisteredAdminApiHookIds(DEFAULT_ADMIN_CAPABILITY_CONTEXT).some((hookId) => /userManagement|orderRecords|nodeHealth|nodeBandwidth|userAccessLogs|userOperationLogs|nodeLogs/.test(hookId))).toBe(false);

    const logSearch = createAdminSearchResults({ blueprints: SEARCH_BLUEPRINTS, query: "节点日志" });
    const userManagementSearch = createAdminSearchResults({ blueprints: SEARCH_BLUEPRINTS, query: "userManagement" });
    expect(logSearch.map((result) => result.id).join(" ")).not.toMatch(/userAccessLogs|userOperationLogs|nodeLogs|userManagement/);
    expect(userManagementSearch.map((result) => result.id).join(" ")).not.toMatch(/userManagement|orderRecords|nodeHealth/);
  });

  test("keeps the App preview hook compile-time DEV-only and leaves fixture preview unchanged", () => {
    const source = readFileSync("src/App.tsx", "utf8");
    expect(source).toContain("import.meta.env.DEV");
    expect(source).toContain("./pages/admin-production-baseline-preview");
    expect(source).toContain("isAdminProductionBaselinePreviewEnabled");
    expect(source).not.toMatch(/import\s+\{[^}]*\bAdminProductionBaselinePreview\b/);
    expect(source).toContain("isAdminFixturePreviewEnabled");
    expect(isAdminFixturePreviewEnabled({ VITE_ADMIN_FIXTURE_PREVIEW: "true" }, "")).toBe(true);
    expect(isAdminFixturePreviewEnabled({ VITE_ADMIN_FIXTURE_PREVIEW: "1" }, "")).toBe(true);
    expect(isAdminFixturePreviewEnabled({ VITE_ADMIN_FIXTURE_PREVIEW: true }, "")).toBe(true);
    expect(isAdminFixturePreviewEnabled({ VITE_ADMIN_FIXTURE_PREVIEW: "false" }, "")).toBe(false);
    expect(isAdminFixturePreviewEnabled({}, "#/fixture-preview")).toBe(true);
    expect(isAdminFixturePreviewEnabled({}, "#/fixture-preview/usage")).toBe(true);
    expect(isAdminFixturePreviewEnabled({}, "#/admin-baseline")).toBe(false);
  });
});
