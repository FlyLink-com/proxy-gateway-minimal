import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { App } from "../App";
import {
  consoleSections,
  navItems,
  navSections,
  pageContexts,
  pageSubNavigation,
  pageTitles,
  pageWorkbenchContracts
} from "../app/navigation";
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
    expect(navSections.map((section) => section.label)).toEqual(["Overview", "User Operations", "Platform Monitoring"]);
    expect(navSections.map((section) => section.description)).toEqual([
      "Platform health and risk",
      "Accounts, resources, and quotas",
      "Usage collection and channels"
    ]);
    expect(navSections.map((section) => section.items.map((item) => item.label))).toEqual([
      ["Operations Overview"],
      ["Accounts & Resources"],
      ["Usage & Channels"]
    ]);
    expect(pageTitles.dashboard).toBe("Operations Overview");
    expect(pageTitles.portalRequests).toBe("Accounts & Resources");
    expect(pageTitles.usageMonitor).toBe("Usage & Channels");
    expect(pageContexts.dashboard).toEqual({
      eyebrow: "Overview",
      description: "Platform health, risk summary, and recent activity"
    });
    expect(pageContexts.portalRequests).toEqual({
      eyebrow: "User Operations",
      description: "Accounts, resources, orders, and traffic quotas"
    });
    expect(pageContexts.usageMonitor).toEqual({
      eyebrow: "Platform Monitoring",
      description: "Collection trust, channel health, and data anomalies"
    });
  });

  test("reserves future console sections without promoting them to active pages", () => {
    const activeSections = consoleSections.filter((section) => section.status === "active");
    const plannedSections = consoleSections.filter((section) => section.status === "planned");

    expect(consoleSections.map((section) => section.label)).toEqual([
      "Overview",
      "User Operations",
      "Platform Monitoring",
      "Audit & Cases",
      "Platform Development",
      "System Settings"
    ]);
    expect(activeSections.map((section) => section.id)).toEqual(navSections.map((section) => section.id));
    expect(plannedSections.map((section) => section.label)).toEqual(["Audit & Cases", "Platform Development", "System Settings"]);
    expect(plannedSections.map((section) => section.items)).toEqual([[], [], []]);
    expect(navSections.map((section) => section.label)).not.toContain("Audit & Cases");
    expect(navSections.map((section) => section.label)).not.toContain("Platform Development");
    expect(navSections.map((section) => section.label)).not.toContain("System Settings");
    expect(navItems.map((item) => item.label)).toEqual(["Operations Overview", "Accounts & Resources", "Usage & Channels"]);
  });

  test("defines page-local subnavigation from the Admin domain dictionary", () => {
    expect(Object.keys(pageSubNavigation)).toEqual(["dashboard", "portalRequests", "usageMonitor"]);
    expect(pageSubNavigation.dashboard.map((item) => item.label)).toEqual([
      "Health Summary",
      "Risk Queue",
      "Next Actions"
    ]);
    expect(pageSubNavigation.portalRequests.map((item) => item.label)).toEqual([
      "Account Directory",
      "Resources & Orders",
      "Quota & Usage",
      "Lifecycle",
      "History & Events"
    ]);
    expect(pageSubNavigation.usageMonitor.map((item) => item.label)).toEqual([
      "Collection Freshness",
      "Channel Coverage",
      "Usage Ledger",
      "Collection Anomalies",
      "Receipts & Collectors"
    ]);
    expect(pageSubNavigation.dashboard.every((item) => item.mode === "preview")).toBe(true);
    expect(pageSubNavigation.portalRequests.every((item) => item.owner === "User Operations")).toBe(true);
    expect(pageSubNavigation.usageMonitor.every((item) => item.owner === "Platform Monitoring")).toBe(true);
    expect(pageSubNavigation.portalRequests.find((item) => item.id === "quota-usage")?.description)
      .toContain("quota risk");
    expect(pageSubNavigation.portalRequests.find((item) => item.id === "lifecycle")?.description)
      .toContain("order pause");
    expect(pageSubNavigation.usageMonitor.find((item) => item.id === "collection-anomalies")?.description)
      .toMatch(/collection delay/i);
    expect(pageSubNavigation.usageMonitor.map((item) => item.description).join(" "))
      .not.toMatch(/subscription lifecycle|order pause|archive candidate|quota ownership/i);
  });

  test("defines page contracts for front-end ownership and decision boundaries", () => {
    expect(Object.keys(pageWorkbenchContracts)).toEqual(["dashboard", "portalRequests", "usageMonitor"]);

    expect(pageWorkbenchContracts.dashboard.role).toBe("overview");
    expect(pageWorkbenchContracts.dashboard.primaryQuestion).toBe("What needs attention, and where should the operator go next?");
    expect(pageWorkbenchContracts.dashboard.ownsDecisions).toEqual(["next_review_target"]);
    expect(pageWorkbenchContracts.dashboard.previewOnly).toEqual(expect.arrayContaining([
      "account_lifecycle",
      "quota_policy",
      "usage_collection_trust",
      "collection_anomalies"
    ]));
    expect(pageWorkbenchContracts.dashboard.forbiddenDecisions).toEqual(expect.arrayContaining([
      "account_create_disable",
      "order_pause_archive",
      "runtime_apply"
    ]));

    expect(pageWorkbenchContracts.portalRequests.role).toBe("decision-owner");
    expect(pageWorkbenchContracts.portalRequests.ownsDecisions).toEqual(expect.arrayContaining([
      "account_create_disable",
      "account_lifecycle",
      "resource_order_lifecycle",
      "subscription_artifact_lifecycle",
      "quota_policy",
      "order_pause_archive"
    ]));
    expect(pageWorkbenchContracts.portalRequests.evidenceOnly).toEqual(expect.arrayContaining([
      "usage_collection_trust",
      "channel_coverage",
      "receipt_coverage",
      "collection_anomalies"
    ]));
    expect(pageWorkbenchContracts.portalRequests.forbiddenDecisions).toEqual(expect.arrayContaining([
      "runtime_apply",
      "platform_tooling"
    ]));

    expect(pageWorkbenchContracts.usageMonitor.role).toBe("evidence-owner");
    expect(pageWorkbenchContracts.usageMonitor.ownsDecisions).toEqual(expect.arrayContaining([
      "usage_collection_trust",
      "channel_coverage",
      "receipt_coverage",
      "collection_anomalies"
    ]));
    expect(pageWorkbenchContracts.usageMonitor.evidenceOnly).toEqual(expect.arrayContaining([
      "account_lifecycle",
      "resource_order_lifecycle",
      "quota_policy"
    ]));
    expect(pageWorkbenchContracts.usageMonitor.forbiddenDecisions).toEqual(expect.arrayContaining([
      "account_create_disable",
      "order_pause_archive",
      "subscription_artifact_lifecycle",
      "runtime_apply"
    ]));

    expect(pageWorkbenchContracts.dashboard.sectionIds).toEqual(
      pageSubNavigation.dashboard.map((item) => item.id)
    );
    expect(pageWorkbenchContracts.portalRequests.sectionIds).toEqual(
      pageSubNavigation.portalRequests.map((item) => item.id)
    );
    expect(pageWorkbenchContracts.usageMonitor.sectionIds).toEqual(
      pageSubNavigation.usageMonitor.map((item) => item.id)
    );
  });

  test("gates the admin shell behind API configuration before rendering business pages", () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => dashboardJsonResponse(String(input)));
    vi.stubGlobal("fetch", fetcher);

    render(createElement(App));

    expect(screen.getByRole("heading", { name: "Connect Admin API" })).not.toBeNull();
    expect(screen.getByText("Operator Console")).not.toBeNull();
    expect(screen.getByText("Save a console token before opening Overview, User Operations, or Platform Monitoring.")).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Operations Overview" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Operations Overview" })).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("defaults the admin shell to the operations dashboard", async () => {
    saveAdminSession({
      baseUrl: "http://127.0.0.1:3456",
      consoleToken: "admin_console_ref"
    });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => dashboardJsonResponse(String(input))));

    render(createElement(App));

    expect(await screen.findByRole("heading", { name: "Operations Overview" })).not.toBeNull();
    expect(screen.queryByLabelText("Admin navigation")).toBeNull();
    const workspaceSidebar = screen.getByLabelText("Workspace sidebar");
    expect(within(workspaceSidebar).getByLabelText("Primary workspace routes")).not.toBeNull();
    expect(within(workspaceSidebar).getByRole("button", { name: "Operations Overview" })).not.toBeNull();
    expect(within(workspaceSidebar).getByRole("button", { name: "Accounts & Resources" })).not.toBeNull();
    expect(within(workspaceSidebar).getByRole("button", { name: "Usage & Channels" })).not.toBeNull();
    expect(within(workspaceSidebar).getByLabelText("Open navigation library").closest("details")?.hasAttribute("open")).toBe(false);
    fireEvent.click(within(workspaceSidebar).getByLabelText("Open navigation library"));
    const navigationLibraryMenu = within(workspaceSidebar).getByLabelText("Open navigation library").closest("details");
    expect(navigationLibraryMenu?.hasAttribute("open")).toBe(true);
    const navigationLibrarySearch = within(workspaceSidebar).getByLabelText("Search navigation library");
    expect(navigationLibrarySearch).not.toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(navigationLibrarySearch));
    fireEvent.change(navigationLibrarySearch, { target: { value: "quota" } });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(navigationLibraryMenu?.hasAttribute("open")).toBe(false);
    expect((navigationLibrarySearch as HTMLInputElement).value).toBe("");
    fireEvent.click(within(workspaceSidebar).getByLabelText("Open navigation library"));
    await waitFor(() => expect(navigationLibraryMenu?.hasAttribute("open")).toBe(true));
    await waitFor(() => expect(document.activeElement).toBe(navigationLibrarySearch));
    fireEvent.change(navigationLibrarySearch, { target: { value: "admin api" } });
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(navigationLibraryMenu?.hasAttribute("open")).toBe(false));
    expect((navigationLibrarySearch as HTMLInputElement).value).toBe("");
    fireEvent.click(within(workspaceSidebar).getByLabelText("Open navigation library"));
    expect(navigationLibraryMenu?.hasAttribute("open")).toBe(true);
    expect(within(workspaceSidebar).getByLabelText("Console settings")).not.toBeNull();
    expect(within(workspaceSidebar).getByLabelText("Admin API connection settings")).not.toBeNull();
    expect(within(workspaceSidebar).queryByText("Admin API connection")).toBeNull();
    expect(within(workspaceSidebar).getByRole("button", { name: "Preview site Public shell" })).not.toBeNull();
    expect(within(workspaceSidebar).getByRole("button", { name: "Open user portal User view" })).not.toBeNull();
    expect(within(workspaceSidebar).getByLabelText("Panels")).not.toBeNull();
    expect(within(workspaceSidebar).getByRole("button", { name: /Health Summary/ })).not.toBeNull();
    expect(within(workspaceSidebar).getByRole("button", { name: /Quota & Usage/ })).not.toBeNull();
    expect(within(workspaceSidebar).getByRole("button", { name: /Usage Ledger/ })).not.toBeNull();
    expect(within(workspaceSidebar).getByLabelText("Audit & Cases planned")).not.toBeNull();
    expect(within(workspaceSidebar).getByLabelText("Platform Development planned")).not.toBeNull();
    expect(within(workspaceSidebar).getByLabelText("System Settings planned")).not.toBeNull();
    expect(within(workspaceSidebar).getByText("Risk A gated").closest("details")?.hasAttribute("open")).toBe(false);
    expect(workspaceSidebar.textContent).not.toContain("Platform health and risk");
    expect(workspaceSidebar.textContent).not.toContain("Accounts, resources, and quotas");
    expect(workspaceSidebar.textContent).not.toContain("Usage collection and channels");
    expect(workspaceSidebar.textContent).not.toContain("Waiting for the GCC-55 durable Case/history backend contract.");
    expect(screen.getByText("Proxy Gateway")).not.toBeNull();
    expect(screen.queryByText("Platform health, risk summary, and recent activity")).toBeNull();
    expect(screen.getByRole("button", { name: "Operations Overview" }).getAttribute("aria-current")).toBe("page");
    expect(screen.queryByRole("button", { name: "Audit & Cases" })).toBeNull();
    expect(screen.getByLabelText("Operator account")).not.toBeNull();
    expect(screen.queryByLabelText("Console status bar")).toBeNull();
    expect(document.querySelector(".admin-content")?.textContent).not.toContain("Admin API connection");
  });

  test("routes platform monitoring navigation to the usage and channel monitor page", async () => {
    saveAdminSession({
      baseUrl: "http://127.0.0.1:3456",
      consoleToken: "admin_console_ref"
    });
    const fetcher = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal("fetch", fetcher);

    render(createElement(App));

    fireEvent.click(screen.getByRole("button", { name: "Usage & Channels" }));

    expect(await screen.findByRole("heading", { name: "Usage & Channels" })).not.toBeNull();
    expect(screen.queryByText("Collection trust, channel health, and data anomalies")).toBeNull();
    expect(screen.queryByLabelText("Usage & Channels page navigation")).toBeNull();
    expect(screen.queryByLabelText("Usage & Channels card controls")).toBeNull();
    expect(screen.getByRole("button", { name: "Collection Freshness hide module" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Channel Coverage hide module" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Usage Ledger hide module" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Collection Anomalies hide module" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Receipts & Collectors hide module" })).not.toBeNull();
    expect(screen.getByLabelText("Usage & Channels module layout").textContent).not.toContain("Generated time, delay threshold");
    fireEvent.click(screen.getByRole("button", { name: "Collection Freshness hide module" }));
    expect(screen.queryByRole("heading", { name: "Collection Freshness" })).toBeNull();
    const usageWorkspaceSidebar = screen.getByLabelText("Workspace sidebar");
    fireEvent.click(within(usageWorkspaceSidebar).getByLabelText("Open navigation library"));
    fireEvent.click(within(usageWorkspaceSidebar).getByRole("button", { name: /Collection Freshness/ }));
    expect(screen.getByRole("heading", { name: "Collection Freshness" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Usage & Channels" })).not.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("keeps retired engineering tools out of the main navigation", async () => {
    saveAdminSession({
      baseUrl: "http://127.0.0.1:3456",
      consoleToken: "admin_console_ref"
    });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => dashboardJsonResponse(String(input))));

    render(createElement(App));

    expect(await screen.findByRole("heading", { name: "Operations Overview" })).not.toBeNull();
    const workspaceSidebar = screen.getByLabelText("Workspace sidebar");
    expect(workspaceSidebar.textContent).toContain("Accounts & Resources");
    expect(workspaceSidebar.textContent).toContain("Usage & Channels");
    expect(workspaceSidebar.textContent).not.toMatch(/Provisioning|Subscriptions|Nodes/);
    expect(screen.queryByRole("button", { name: /Provisioning|Subscriptions|Nodes/ })).toBeNull();
  });

  test("renders user supervision subnavigation before account resource sections", async () => {
    saveAdminSession({
      baseUrl: "http://127.0.0.1:3456",
      consoleToken: "admin_console_ref"
    });
    const fetcher = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal("fetch", fetcher);

    render(createElement(App));

    fireEvent.click(await screen.findByRole("button", { name: "Accounts & Resources" }));

    expect(await screen.findByRole("heading", { name: "Accounts & Resources" })).not.toBeNull();
    expect(screen.queryByLabelText("Accounts & Resources page navigation")).toBeNull();
    expect(screen.queryByLabelText("Accounts & Resources card controls")).toBeNull();
    expect(screen.getByRole("button", { name: "Account Directory hide module" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Resources & Orders hide module" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Quota & Usage hide module" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Lifecycle hide module" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "History & Events hide module" })).not.toBeNull();
    expect(screen.getByLabelText("Accounts & Resources module layout").textContent).not.toContain("Safe account refs");
    expect(screen.getByRole("heading", { name: "Accounts & Resources" })).not.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("uses navigation library search as a command palette for pages, panels, and settings", async () => {
    saveAdminSession({
      baseUrl: "http://127.0.0.1:3456",
      consoleToken: "admin_console_ref"
    });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => dashboardJsonResponse(String(input))));

    render(createElement(App));

    expect(await screen.findByRole("heading", { name: "Operations Overview" })).not.toBeNull();
    const workspaceSidebar = screen.getByLabelText("Workspace sidebar");
    fireEvent.click(within(workspaceSidebar).getByLabelText("Open navigation library"));
    const librarySearch = within(workspaceSidebar).getByLabelText("Search navigation library");
    fireEvent.change(librarySearch, { target: { value: "channel" } });

    const workspacePages = within(workspaceSidebar).getByLabelText("Workspace pages");
    const panelApps = within(workspaceSidebar).getByLabelText("Panels");
    expect(within(workspacePages).getByText("Usage & Channels")).not.toBeNull();
    expect(panelApps.textContent).toContain("Channel Coverage");
    expect(panelApps.textContent).toContain("Usage Ledger");
    expect(within(workspaceSidebar).queryByText("Risk notifications")).toBeNull();
    expect(within(workspaceSidebar).getByLabelText(/navigation library results/)).not.toBeNull();

    fireEvent.change(librarySearch, { target: { value: "admin api" } });
    expect(within(workspaceSidebar).getByLabelText("Console settings").textContent).toContain("Admin API");
    expect(within(workspaceSidebar).queryByText("Risk notifications")).toBeNull();
    expect(within(workspaceSidebar).queryByText("Usage Ledger")).toBeNull();

    fireEvent.change(librarySearch, { target: { value: "channel" } });

    fireEvent.click(within(workspacePages).getByRole("button", { name: /Usage & Channels/ }));

    expect(await screen.findByRole("heading", { name: "Usage & Channels" })).not.toBeNull();
    expect((within(workspaceSidebar).getByLabelText("Search navigation library") as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("button", { name: "Usage & Channels" }).getAttribute("aria-current")).toBe("page");
  });

  test("opens cross-page modules from the navigation map route", async () => {
    saveAdminSession({
      baseUrl: "http://127.0.0.1:3456",
      consoleToken: "admin_console_ref"
    });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => dashboardJsonResponse(String(input))));

    render(createElement(App));

    expect(await screen.findByRole("heading", { name: "Operations Overview" })).not.toBeNull();
    const workspaceSidebar = screen.getByLabelText("Workspace sidebar");
    fireEvent.click(within(workspaceSidebar).getByLabelText("Open navigation library"));
    const librarySearch = within(workspaceSidebar).getByLabelText("Search navigation library");
    fireEvent.change(librarySearch, { target: { value: "quota" } });

    const panelApps = within(workspaceSidebar).getByLabelText("Panels");
    fireEvent.click(within(panelApps).getByRole("button", { name: /Quota & Usage/ }));

    expect(await screen.findByRole("heading", { name: "Accounts & Resources" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Quota & Usage" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Accounts & Resources" }).getAttribute("aria-current")).toBe("page");
    expect((within(workspaceSidebar).getByLabelText("Search navigation library") as HTMLInputElement).value).toBe("");
  });

  test("routes the risk notification badge back to the operations dashboard", async () => {
    saveAdminSession({
      baseUrl: "http://127.0.0.1:3456",
      consoleToken: "admin_console_ref"
    });
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({})));

    render(createElement(App));

    expect(await screen.findByLabelText("Operator account")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Usage & Channels" }));
    expect(await screen.findByRole("heading", { name: "Usage & Channels" })).not.toBeNull();

    const workspaceSidebar = screen.getByLabelText("Workspace sidebar");
    fireEvent.click(within(workspaceSidebar).getByLabelText("Open navigation library"));
    fireEvent.click(within(workspaceSidebar).getByRole("button", { name: "Risk notifications 0" }));

    expect(await screen.findByRole("heading", { name: "Operations Overview" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Operations Overview" }).getAttribute("aria-current")).toBe("page");
  });

  test("opens read-only environment from navigation library and account menu from the top bar", async () => {
    saveAdminSession({
      baseUrl: "http://127.0.0.1:3456",
      consoleToken: "admin_console_ref"
    });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => dashboardJsonResponse(String(input))));

    render(createElement(App));

    expect(await screen.findByRole("heading", { name: "Operations Overview" })).not.toBeNull();
    const workspaceSidebar = screen.getByLabelText("Workspace sidebar");
    fireEvent.click(within(workspaceSidebar).getByLabelText("Open navigation library"));
    fireEvent.click(within(workspaceSidebar).getByLabelText("Environment status"));
    expect(screen.getByText("Production read-only supervision")).not.toBeNull();
    expect(screen.getByText(/Production actions require a Risk A gate/)).not.toBeNull();

    fireEvent.click(screen.getByLabelText("Operator account"));
    expect(screen.getAllByText("operator").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Production supervision only.")).not.toBeNull();
    expect(screen.getByText("Runtime changes require a Risk A gate.")).not.toBeNull();
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
