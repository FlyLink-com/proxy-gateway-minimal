import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { App, resolveUserManagementReadModel } from "../App";
import {
  consoleSections,
  formatAdminRouteHash,
  navItems,
  navSections,
  pageContexts,
  parseAdminRouteHash,
  pageSubNavigation,
  pageTitles,
  type AdminPage,
  usesAdminShellTopBar,
  pageWorkbenchContracts
} from "../app/navigation";
import { saveAdminSession } from "../features/subscriptions/admin-session";

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  window.history.pushState(null, "", "/");
  window.location.hash = "";
  vi.unstubAllGlobals();
});

describe("admin navigation", () => {
  test("routes portal register paths to the user registration surface instead of Admin", async () => {
    window.history.pushState(null, "", "/portal/register/");
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
      challenge: {
        challengeId: "challenge_safe_ref",
        expiresAt: "2026-06-30T10:00:00.000Z",
        prompt: "2 + 3 = ?"
      }
    })));

    render(createElement(App));

    expect(await screen.findByRole("heading", { name: "注册领取 7 天试用" }, { timeout: 5000 })).not.toBeNull();
    expect(screen.getByRole("region", { name: "用户注册" })).not.toBeNull();
    expect(screen.queryByText("运营总览")).toBeNull();
    expect(screen.queryByText("User Management")).toBeNull();
  });

  test("routes portal login paths to the user portal surface instead of Admin", async () => {
    window.history.pushState(null, "", "/portal/");

    render(createElement(App));

    expect(await screen.findByRole("heading", { name: "账号登录" }, { timeout: 5000 })).not.toBeNull();
    expect(screen.getByRole("region", { name: "用户登录" })).not.toBeNull();
    expect(screen.queryByText("运营总览")).toBeNull();
    expect(screen.queryByText("User Management")).toBeNull();
  });

  test("groups product-facing admin surfaces by responsibility", () => {
    const activePages: AdminPage[] = [
      "dashboard",
      "portalRequests",
      "usageMonitor",
      "userManagement",
      "orderManagement",
      "nodeHealth",
      "nodeBandwidth",
      "userAccessLogs",
      "userOperationLogs",
      "nodeLogs"
    ];
    const navPageIds = navItems.map((item) => item.id);

    expect(navPageIds).toEqual(activePages);
    expect(Object.keys(pageTitles)).toEqual(activePages);
    expect(navSections.map((section) => section.label)).toEqual([
      "Monitoring",
      "Management",
      "Logs & Audit"
    ]);
    expect(navSections.map((section) => section.description)).toEqual([
      "Overview, accounts, usage, and channels",
      "Users, orders, nodes, and bandwidth",
      "User and node evidence logs"
    ]);
    expect(navSections.map((section) => section.items.map((item) => item.label))).toEqual([
      ["Operations Overview", "Accounts & Resources", "Usage & Channels"],
      ["User Management", "Order Management", "Node Health", "Node Bandwidth"],
      ["User Access Logs", "User Operation Logs", "Node Logs"]
    ]);
    expect(pageTitles.dashboard).toBe("Operations Overview");
    expect(pageTitles.portalRequests).toBe("Accounts & Resources");
    expect(pageTitles.usageMonitor).toBe("Usage & Channels");
    expect(pageTitles.userManagement).toBe("User Management");
    expect(pageTitles.orderManagement).toBe("Order Management");
    expect(pageTitles.nodeHealth).toBe("Node Health");
    expect(pageContexts.dashboard).toEqual({
      eyebrow: "Monitoring",
      description: "Platform health, risk summary, and recent activity"
    });
    expect(pageContexts.portalRequests).toEqual({
      eyebrow: "Monitoring",
      description: "Accounts, resources, orders, and traffic quotas"
    });
    expect(pageContexts.usageMonitor).toEqual({
      eyebrow: "Monitoring",
      description: "Collection trust, channel health, and data anomalies"
    });
    expect(pageContexts.userManagement.eyebrow).toBe("Management");
    expect(pageContexts.orderManagement.eyebrow).toBe("Management");
    expect(pageContexts.nodeHealth.eyebrow).toBe("Management");
    expect(pageContexts.nodeBandwidth.eyebrow).toBe("Management");
    expect(pageContexts.userAccessLogs.eyebrow).toBe("Logs & Audit");
    expect(pageContexts.userOperationLogs.eyebrow).toBe("Logs & Audit");
    expect(pageContexts.nodeLogs.eyebrow).toBe("Logs & Audit");
    expect(activePages.filter(usesAdminShellTopBar)).toEqual([
      "dashboard",
      "portalRequests",
      "usageMonitor"
    ]);
    expect(activePages.filter((page) => !usesAdminShellTopBar(page))).toEqual([
      "userManagement",
      "orderManagement",
      "nodeHealth",
      "nodeBandwidth",
      "userAccessLogs",
      "userOperationLogs",
      "nodeLogs"
    ]);
  });

  test("orders Figma safe-read pages under active owner groups", () => {
    const activeSections = consoleSections.filter((section) => section.status === "active");
    const plannedSections = consoleSections.filter((section) => section.status === "planned");
    const reservedSections = consoleSections.filter((section) => section.status === "reserved");

    expect(consoleSections.map((section) => section.label)).toEqual([
      "Monitoring",
      "Management",
      "Logs & Audit",
      "System Settings"
    ]);
    expect(activeSections.map((section) => section.id)).toEqual(navSections.map((section) => section.id));
    expect(plannedSections).toEqual([]);
    expect(reservedSections.map((section) => section.id)).toEqual(["system-settings"]);
    expect(navSections.map((section) => section.label)).toContain("Monitoring");
    expect(navSections.map((section) => section.label)).toContain("Management");
    expect(navSections.map((section) => section.label)).toContain("Logs & Audit");
    expect(navSections.map((section) => section.label)).not.toContain("Audit & Cases");
    expect(navSections.map((section) => section.label)).not.toContain("Platform Development");
    expect(navSections.map((section) => section.label)).not.toContain("System Settings");
    expect(navItems.map((item) => item.label)).toEqual([
      "Operations Overview",
      "Accounts & Resources",
      "Usage & Channels",
      "User Management",
      "Order Management",
      "Node Health",
      "Node Bandwidth",
      "User Access Logs",
      "User Operation Logs",
      "Node Logs"
    ]);
  });

  test("defines page-local subnavigation from the Admin domain dictionary", () => {
    expect(Object.keys(pageSubNavigation)).toEqual([
      "dashboard",
      "portalRequests",
      "userManagement",
      "orderManagement",
      "usageMonitor",
      "userAccessLogs",
      "userOperationLogs",
      "nodeHealth",
      "nodeLogs",
      "nodeBandwidth"
    ]);
    expect(pageSubNavigation.dashboard.map((item) => item.label)).toEqual([
      "Health Summary",
      "Risk Queue",
      "Next Actions",
      "Review Candidates"
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
    expect(pageSubNavigation.portalRequests.every((item) => item.owner === "Accounts & Resources")).toBe(true);
    expect(pageSubNavigation.usageMonitor.every((item) => item.owner === "Usage & Channels")).toBe(true);
    expect(pageSubNavigation.portalRequests.find((item) => item.id === "quota-usage")?.description)
      .toContain("quota risk");
    expect(pageSubNavigation.portalRequests.find((item) => item.id === "lifecycle")?.description)
      .toContain("order pause");
    expect(pageSubNavigation.usageMonitor.find((item) => item.id === "collection-anomalies")?.description)
      .toMatch(/collection delay/i);
    expect(pageSubNavigation.usageMonitor.map((item) => item.description).join(" "))
      .not.toMatch(/subscription lifecycle|order pause|archive candidate|quota ownership/i);
    expect(pageSubNavigation.userManagement).toEqual([]);
    expect(pageSubNavigation.orderManagement).toEqual([]);
    expect(pageSubNavigation.nodeHealth).toEqual([]);
  });

  test("formats and parses page-owner routes while downgrading legacy section deep links", () => {
    expect(formatAdminRouteHash("portalRequests", "quota-usage")).toBe("#/admin/accounts");
    expect(formatAdminRouteHash("portalRequests", "history-events")).toBe("#/admin/accounts");
    expect(formatAdminRouteHash("usageMonitor", "collection-anomalies")).toBe("#/admin/usage");
    expect(formatAdminRouteHash("dashboard")).toBe("#/admin/operations");

    expect(parseAdminRouteHash("#/admin/accounts/quota-usage")).toEqual({
      page: "portalRequests"
    });
    expect(parseAdminRouteHash("#/admin/accounts/history-events")).toEqual({
      page: "portalRequests"
    });
    expect(parseAdminRouteHash("#/admin/usage/collection-anomalies")).toEqual({
      page: "usageMonitor"
    });
    expect(parseAdminRouteHash("#/admin/operations")).toEqual({
      page: "dashboard"
    });
    expect(parseAdminRouteHash("#/admin/accounts/not-a-section")).toEqual({
      page: "portalRequests"
    });
    expect(parseAdminRouteHash("#/portal")).toBeNull();
  });

  test("defines page contracts for front-end ownership and decision boundaries", () => {
    expect(Object.keys(pageWorkbenchContracts)).toEqual([
      "dashboard",
      "portalRequests",
      "userManagement",
      "orderManagement",
      "usageMonitor",
      "userAccessLogs",
      "userOperationLogs",
      "nodeHealth",
      "nodeLogs",
      "nodeBandwidth"
    ]);

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
    expect(pageWorkbenchContracts.userManagement.role).toBe("decision-owner");
    expect(pageWorkbenchContracts.orderManagement.ownsDecisions).toEqual(expect.arrayContaining([
      "resource_order_lifecycle",
      "order_pause_archive"
    ]));
    expect(pageWorkbenchContracts.userAccessLogs.role).toBe("evidence-owner");
    expect(pageWorkbenchContracts.nodeHealth.forbiddenDecisions).toEqual(expect.arrayContaining([
      "account_create_disable",
      "order_pause_archive"
    ]));
  });

  test("gates the admin shell behind API configuration before rendering business pages", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => dashboardJsonResponse(String(input)));
    vi.stubGlobal("fetch", fetcher);

    render(createElement(App));

    expect(screen.getByRole("heading", { name: "Admin Login" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Portal account login" })).not.toBeNull();
    expect(screen.getByText("Operator Console")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Preview public site" })).not.toBeNull();
    expect(screen.queryByText("Sign in with the approved account password, then verify the one-time code from Google Authenticator before opening Admin.")).toBeNull();
    expect(screen.queryByRole("list", { name: "Admin login security checks" })).toBeNull();
    expect(screen.queryByText("Password first")).toBeNull();
    expect(screen.queryByRole("list", { name: "Protected Admin login steps" })).toBeNull();
    expect(screen.queryByText(/Console token/i)).toBeNull();
    expect(screen.queryByRole("heading", { name: "Operations Overview" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Operations Overview" })).toBeNull();
    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledWith(
        "/api/admin-auth/session",
        expect.objectContaining({ credentials: "same-origin" })
      );
    });
    expect(fetcher.mock.calls.some(([input]) => String(input).startsWith("/api/admin/"))).toBe(false);
  });

  test("allows the fixture preview route to render Admin pages without a configured API", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => dashboardJsonResponse(String(input)));
    vi.stubGlobal("fetch", fetcher);
    window.location.hash = "#/fixture-preview";

    render(createElement(App));

    expect(await screen.findByRole("heading", { name: "Operations Overview" })).not.toBeNull();
    expect(screen.getByLabelText("Admin fixture preview status")).not.toBeNull();
    expect(screen.getByText("GCC-104 safe fixture preview")).not.toBeNull();
    expect(screen.queryByLabelText("Risk Queue fixture preview")).toBeNull();
    expect(document.querySelector("#dashboard-risk-queue")?.getAttribute("data-chrome")).toBe("operator");
    expect(screen.getAllByText("case_012").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole("heading", { name: "Connect Admin API" })).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    expect(document.body.textContent ?? "").not.toMatch(/https?:\/\/|subscriptionUrl|token=|secret-value|password|edgecred_/i);
  });

  test("keeps backend query pages on page-local headers without the shell topbar", async () => {
    saveAdminSession({
      authMode: "protectedSession",
      baseUrl: "http://127.0.0.1:3456"
    });
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({})));
    window.location.hash = "#/admin/user-access-logs";

    render(createElement(App));

    expect(await screen.findByRole("table", { name: "User Access Logs redacted table" })).not.toBeNull();
    expect(document.querySelector(".admin-shell")?.getAttribute("data-shell-topbar")).toBe("disabled");
    expect(document.querySelector("[data-ui-surface='top-bar']")).toBeNull();
    expect(screen.queryByRole("search", { name: "Search Admin Console" })).toBeNull();
    expect(screen.getByLabelText("User Access Logs breadcrumb")).not.toBeNull();
    expect(screen.getByText("Showing 1-8 of 8")).not.toBeNull();
  });

  test("loads Node Bandwidth from the protected platform summary endpoint", async () => {
    saveAdminSession({
      authMode: "protectedSession",
      baseUrl: "http://127.0.0.1:3456"
    });
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/admin/platform/node-bandwidth")) {
        return jsonResponse({ nodeBandwidth: nodeBandwidthResponse() });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetcher);
    window.location.hash = "#/admin/node-bandwidth";

    render(createElement(App));

    expect((await screen.findAllByText("channel-live-1")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Tokyo").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("2.4 Gbps").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("1.1 Gbps").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("3.2 Gbps").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("68%").length).toBeGreaterThanOrEqual(1);
    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledWith(
        "http://127.0.0.1:3456/api/admin/platform/node-bandwidth",
        expect.objectContaining({ headers: expect.any(Headers) })
      );
    });
    const nodeBandwidthCall = fetcher.mock.calls.find(([input]) => String(input).endsWith("/api/admin/platform/node-bandwidth")) as
      | [RequestInfo | URL, RequestInit]
      | undefined;
    expect((nodeBandwidthCall?.[1].headers as Headers).get("authorization")).toBeNull();
    expect(nodeBandwidthCall?.[1].credentials).toBe("same-origin");
    expect(document.body.textContent ?? "").not.toMatch(/subscriptionUrl|token=|secret-value|password|edgecred_|bearer|raw log|sqlite|runtimePayload/i);
  });

  test("defaults the admin shell to the operations dashboard", async () => {
    saveAdminSession({
      authMode: "protectedSession",
      baseUrl: "http://127.0.0.1:3456"
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
    expect(within(workspaceSidebar).queryByLabelText("Open navigation library")).toBeNull();
    expect(within(workspaceSidebar).queryByLabelText("Search navigation library")).toBeNull();
    expect(workspaceSidebar.textContent).not.toContain("Navigation library");
    expect(within(workspaceSidebar).getByRole("button", { name: "User Access Logs" })).not.toBeNull();
    expect(within(workspaceSidebar).getByRole("button", { name: "User Operation Logs" })).not.toBeNull();
    expect(workspaceSidebar.textContent).not.toContain("Console settings");
    expect(workspaceSidebar.textContent).not.toContain("Panels");
    expect(workspaceSidebar.textContent).not.toContain("Preview site");
    expect(workspaceSidebar.textContent).not.toContain("Open user portal");
    expect(within(workspaceSidebar).getByRole("button", { name: "Node Health" })).not.toBeNull();
    expect(within(workspaceSidebar).getByRole("button", { name: "Node Logs" })).not.toBeNull();
    expect(within(workspaceSidebar).getByRole("button", { name: "Node Bandwidth" })).not.toBeNull();
    expect(within(workspaceSidebar).getByLabelText("Monitoring routes")).not.toBeNull();
    expect(within(workspaceSidebar).getByLabelText("Management routes")).not.toBeNull();
    expect(within(workspaceSidebar).getByLabelText("Logs & Audit routes")).not.toBeNull();
    expect(within(workspaceSidebar).queryByLabelText("Audit & Cases routes")).toBeNull();
    expect(within(workspaceSidebar).queryByLabelText("Platform Development routes")).toBeNull();
    expect(within(workspaceSidebar).queryByLabelText("System Settings routes")).toBeNull();
    expect(within(workspaceSidebar).getByRole("button", { name: "User Management" })).not.toBeNull();
    expect(within(workspaceSidebar).getByRole("button", { name: "Order Management" })).not.toBeNull();
    expect(within(workspaceSidebar).queryByLabelText("System Settings planned gate")).toBeNull();
    expect(within(workspaceSidebar).queryByLabelText("About planned gate")).toBeNull();
    expect(workspaceSidebar.textContent).not.toMatch(/Key Management|Audit Center|Log Access/);
    expect(within(workspaceSidebar).getByText("Risk A gated").closest("details")?.hasAttribute("open")).toBe(false);
    expect(workspaceSidebar.textContent).not.toContain("Platform health and risk");
    expect(workspaceSidebar.textContent).not.toContain("Accounts, resources, and quotas");
    expect(workspaceSidebar.textContent).not.toContain("Usage collection and channels");
    expect(workspaceSidebar.textContent).not.toContain("Waiting for the GCC-55 durable Case/history backend contract.");
    expect(screen.getByText("Proxy Gateway")).not.toBeNull();
    expect(screen.queryByText("Platform health, risk summary, and recent activity")).toBeNull();
    expect(screen.getByRole("button", { name: "Operations Overview" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByLabelText("Operator account")).not.toBeNull();
    const topSearch = screen.getByRole("search", { name: "Search Admin Console" });
    fireEvent.change(within(topSearch).getByLabelText("Search users, orders, channels, cases, or events"), { target: { value: "account" } });
    expect(within(topSearch).getByDisplayValue("account")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Search Results" })).not.toBeNull();
    expect(screen.getByRole("status", { name: "Admin system search results" }).textContent).toContain("results");
    expect(screen.queryByLabelText("Search navigation library")).toBeNull();
    expect(screen.getByRole("heading", { name: "Account Directory" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Usage Ledger" })).not.toBeNull();
    expect(screen.queryByLabelText("Console status bar")).toBeNull();
    expect(document.querySelector(".admin-content")?.textContent).not.toContain("Admin API connection");
  });

  test("routes platform monitoring navigation to the usage and channel monitor page", async () => {
    saveAdminSession({
      authMode: "protectedSession",
      baseUrl: "http://127.0.0.1:3456"
    });
    const fetcher = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal("fetch", fetcher);

    render(createElement(App));

    fireEvent.click(screen.getByRole("button", { name: "Usage & Channels" }));

    expect(await screen.findByRole("heading", { name: "Usage & Channels" })).not.toBeNull();
    expect(screen.queryByText("Collection trust, channel health, and data anomalies")).toBeNull();
    expect(screen.queryByLabelText("Usage & Channels page navigation")).toBeNull();
    expect(screen.queryByLabelText("Usage & Channels card controls")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Usage & Channels sections" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Collection Freshness" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Channel Coverage" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Usage Ledger" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Collection Freshness hide module" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Channel Coverage hide module" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Usage Ledger hide module" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Collection Anomalies" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Receipts & Collectors" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Collection Anomalies hide module" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Receipts & Collectors hide module" })).toBeNull();
    expect(screen.getByLabelText("Usage & Channels module layout").textContent).not.toContain("Generated time, delay threshold");
    const topSearch = screen.getByRole("search", { name: "Search Admin Console" });
    const topSearchInput = within(topSearch).getByLabelText("Search users, orders, channels, cases, or events");
    fireEvent.change(topSearchInput, { target: { value: "账户" } });
    expect(within(topSearch).getByDisplayValue("账户")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Search Results" })).not.toBeNull();
    expect(screen.getByRole("status", { name: "Admin system search results" }).textContent).toContain("results");
    expect(screen.getByRole("heading", { name: "Accounts & Resources" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Account Directory" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Usage Ledger" })).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Collection Freshness" })).toBeNull();
    expect(screen.queryByLabelText("Search navigation library")).toBeNull();
    expect(screen.queryByLabelText("Open navigation library")).toBeNull();
    fireEvent.change(topSearchInput, { target: { value: "" } });
    expect(screen.getByRole("heading", { name: "Collection Freshness" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Channel Coverage" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Usage Ledger" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Collection Freshness hide module" })).toBeNull();
    expect(screen.queryByLabelText("Open navigation library")).toBeNull();
    expect(screen.getByRole("heading", { name: "Usage & Channels" })).not.toBeNull();
    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:3456/api/admin/platform/subscription-usage-monitor",
      expect.objectContaining({ headers: expect.any(Headers) })
    );
  });

  test("normalizes legacy Quota section deep links back to the Accounts owner page", async () => {
    saveAdminSession({
      authMode: "protectedSession",
      baseUrl: "http://127.0.0.1:3456"
    });
    const fetcher = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal("fetch", fetcher);
    window.location.hash = "#/admin/accounts/quota-usage";

    render(createElement(App));

    expect(await screen.findByRole("heading", { name: "Accounts & Resources" })).not.toBeNull();
    await waitFor(() => expect(window.location.hash).toBe("#/admin/accounts"));
    expect(screen.getByRole("region", { name: "Accounts & Resources summary metrics" })).not.toBeNull();
    expect(screen.queryByRole("navigation", { name: "Accounts & Resources sections" })).toBeNull();
    expect(screen.getByRole("region", { name: "Accounts & Resources evidence surfaces" })).not.toBeNull();
    expect(screen.getByRole("region", { name: "Account Metrics evidence panel" })).not.toBeNull();
    expect(screen.getByRole("region", { name: "Account Event Log evidence panel" })).not.toBeNull();
    expect(screen.queryByRole("table", { name: "Quota & Usage table" })).toBeNull();
    expect(screen.queryByLabelText("Quota & Usage detail drawer")).toBeNull();
    expect(screen.getByRole("heading", { name: "Account Directory" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Resources & Orders" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Lifecycle" })).not.toBeNull();
    expect(screen.queryByLabelText("Quota and Usage static operator content")).toBeNull();
    expect(screen.queryByLabelText("Open navigation library")).toBeNull();
    expect(screen.queryByText("Module Library")).toBeNull();

    window.location.hash = "#/admin/accounts/account-overview";
    window.dispatchEvent(new HashChangeEvent("hashchange"));

    await waitFor(() => expect(window.location.hash).toBe("#/admin/accounts"));
    expect(screen.getByRole("region", { name: "Accounts & Resources summary metrics" })).not.toBeNull();
    expect(screen.queryByRole("navigation", { name: "Accounts & Resources sections" })).toBeNull();
    expect(screen.getByRole("region", { name: "Accounts & Resources evidence surfaces" })).not.toBeNull();
    expect(screen.getByRole("region", { name: "Account Metrics evidence panel" })).not.toBeNull();
    expect(screen.getByRole("region", { name: "Account Event Log evidence panel" })).not.toBeNull();
    expect(await screen.findByRole("heading", { name: "Account Directory" })).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Quota & Usage" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Resources & Orders" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Lifecycle" })).not.toBeNull();

    fireEvent.click(within(screen.getByLabelText("Workspace sidebar")).getByRole("button", {
      name: "Accounts & Resources"
    }));

    expect(window.location.hash).toBe("#/admin/accounts");
    expect(screen.queryByRole("navigation", { name: "Accounts & Resources sections" })).toBeNull();
    expect(screen.getByRole("region", { name: "Accounts & Resources summary metrics" })).not.toBeNull();
    expect(screen.getByRole("region", { name: "Accounts & Resources evidence surfaces" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Account Directory" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Resources & Orders" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Lifecycle" })).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Quota & Usage" })).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("normalizes legacy History section deep links back to the Accounts owner page", async () => {
    saveAdminSession({
      authMode: "protectedSession",
      baseUrl: "http://127.0.0.1:3456"
    });
    const fetcher = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal("fetch", fetcher);
    window.location.hash = "#/admin/accounts/history-events";

    render(createElement(App));

    expect(await screen.findByRole("heading", { name: "Accounts & Resources" })).not.toBeNull();
    await waitFor(() => expect(window.location.hash).toBe("#/admin/accounts"));
    expect(screen.getByRole("region", { name: "Accounts & Resources summary metrics" })).not.toBeNull();
    expect(screen.queryByRole("navigation", { name: "Accounts & Resources sections" })).toBeNull();
    expect(screen.getByRole("region", { name: "Accounts & Resources evidence surfaces" })).not.toBeNull();
    expect(screen.queryByRole("table", { name: "History & Events table" })).toBeNull();
    expect(screen.queryByLabelText("History & Events detail drawer")).toBeNull();
    expect(screen.getByRole("heading", { name: "Account Directory" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Resources & Orders" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Lifecycle" })).not.toBeNull();
    expect(screen.queryByLabelText("History and Events static operator content")).toBeNull();
    expect(screen.queryByText("Restricted backend locked")).toBeNull();
    expect(screen.queryByLabelText("Open navigation library")).toBeNull();
    expect(screen.queryByText("Module Library")).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("opens system search results at the owning page without restoring section routes", async () => {
    saveAdminSession({
      authMode: "protectedSession",
      baseUrl: "http://127.0.0.1:3456"
    });
    const fetcher = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal("fetch", fetcher);

    render(createElement(App));

    expect(await screen.findByRole("heading", { name: "Operations Overview" })).not.toBeNull();
    const topSearch = screen.getByRole("search", { name: "Search Admin Console" });
    fireEvent.change(within(topSearch).getByLabelText("Search users, orders, channels, cases, or events"), {
      target: { value: "quota" }
    });

    expect(screen.getByRole("heading", { name: "Search Results" })).not.toBeNull();
    fireEvent.click(screen.getByRole("heading", { name: "Quota & Usage" }));

    expect(await screen.findByRole("heading", { name: "Accounts & Resources" })).not.toBeNull();
    expect(window.location.hash).toBe("#/admin/accounts");
    expect(screen.getByRole("region", { name: "Accounts & Resources summary metrics" })).not.toBeNull();
    expect(screen.queryByRole("navigation", { name: "Accounts & Resources sections" })).toBeNull();
    expect(screen.getByRole("region", { name: "Accounts & Resources evidence surfaces" })).not.toBeNull();
    expect(screen.queryByRole("table", { name: "Quota & Usage table" })).toBeNull();
    expect(screen.queryByLabelText("Quota & Usage detail drawer")).toBeNull();
    expect(screen.getByRole("heading", { name: "Account Directory" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Resources & Orders" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Lifecycle" })).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Search Results" })).toBeNull();
    expect(screen.queryByLabelText("Open navigation library")).toBeNull();
    expect(screen.queryByText("Module Library")).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("opens History & Events from system search at the Accounts owner page", async () => {
    saveAdminSession({
      authMode: "protectedSession",
      baseUrl: "http://127.0.0.1:3456"
    });
    const fetcher = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal("fetch", fetcher);

    render(createElement(App));

    expect(await screen.findByRole("heading", { name: "Operations Overview" })).not.toBeNull();
    const topSearch = screen.getByRole("search", { name: "Search Admin Console" });
    fireEvent.change(within(topSearch).getByLabelText("Search users, orders, channels, cases, or events"), {
      target: { value: "history" }
    });

    expect(screen.getByRole("heading", { name: "Search Results" })).not.toBeNull();
    fireEvent.click(screen.getByRole("heading", { name: "History & Events" }));

    expect(await screen.findByRole("heading", { name: "Accounts & Resources" })).not.toBeNull();
    expect(window.location.hash).toBe("#/admin/accounts");
    expect(screen.getByRole("region", { name: "Accounts & Resources summary metrics" })).not.toBeNull();
    expect(screen.getByRole("region", { name: "Accounts & Resources evidence surfaces" })).not.toBeNull();
    expect(screen.queryByRole("table", { name: "History & Events table" })).toBeNull();
    expect(screen.queryByLabelText("History & Events detail drawer")).toBeNull();
    expect(screen.getByRole("heading", { name: "Account Directory" })).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Search Results" })).toBeNull();
    expect(screen.queryByLabelText("Open navigation library")).toBeNull();
    expect(screen.queryByText("Module Library")).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("ignores retired module-open events so old module routing cannot bypass page ownership", async () => {
    saveAdminSession({
      authMode: "protectedSession",
      baseUrl: "http://127.0.0.1:3456"
    });
    const fetcher = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal("fetch", fetcher);
    window.location.hash = "#/admin/accounts";

    render(createElement(App));

    expect(await screen.findByRole("heading", { name: "Accounts & Resources" })).not.toBeNull();
    window.dispatchEvent(new CustomEvent("admin-open-module", {
      detail: {
        navId: "quota-usage",
        page: "portalRequests",
        targetId: "user-supervision-quota-usage"
      }
    }));

    expect(window.location.hash).toBe("#/admin/accounts");
    expect(screen.getByRole("region", { name: "Accounts & Resources summary metrics" })).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Quota & Usage" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Account Directory" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Resources & Orders" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Lifecycle" })).not.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("keeps retired engineering tools out of the main navigation", async () => {
    saveAdminSession({
      authMode: "protectedSession",
      baseUrl: "http://127.0.0.1:3456"
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

  test("renders Accounts & Resources as the Visual Polish three-panel owner page", async () => {
    saveAdminSession({
      authMode: "protectedSession",
      baseUrl: "http://127.0.0.1:3456"
    });
    const fetcher = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal("fetch", fetcher);

    render(createElement(App));

    fireEvent.click(await screen.findByRole("button", { name: "Accounts & Resources" }));

    expect(await screen.findByRole("heading", { name: "Accounts & Resources" })).not.toBeNull();
    expect(screen.queryByLabelText("Accounts & Resources page navigation")).toBeNull();
    expect(screen.queryByLabelText("Accounts & Resources card controls")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Accounts & Resources sections" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Account Directory" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Resources & Orders" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Lifecycle" })).not.toBeNull();
    expect(screen.queryByRole("table", { name: "Account Directory table" })).toBeNull();
    expect(screen.queryByLabelText("Account Directory detail drawer")).toBeNull();
    expect(screen.queryByRole("table", { name: "Resources & Orders table" })).toBeNull();
    expect(screen.queryByLabelText("Resources & Orders detail drawer")).toBeNull();
    expect(screen.queryByRole("table", { name: "Lifecycle table" })).toBeNull();
    expect(screen.queryByLabelText("Lifecycle detail drawer")).toBeNull();
    expect(document.querySelectorAll("[data-figma-component='DataRowCompact'][data-ui-surface='compact-row']")).toHaveLength(6);
    expect(screen.getAllByText("acct_001").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("ord_2048").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("sub_8192").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole("button", { name: "Account Directory hide module" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Resources & Orders hide module" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Quota & Usage hide module" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Lifecycle hide module" })).toBeNull();
    expect(screen.queryByRole("button", { name: "History & Events hide module" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Quota & Usage" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "History & Events" })).toBeNull();
    expect(screen.getByLabelText("Accounts & Resources module layout").textContent).not.toContain("Safe account refs");
    expect(screen.getByRole("heading", { name: "Accounts & Resources" })).not.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("loads User Management from protected platform account summaries", async () => {
    saveAdminSession({
      authMode: "protectedSession",
      baseUrl: "http://127.0.0.1:3456"
    });
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/admin/overview")) {
        return jsonResponse(overviewResponse());
      }
      if (url.endsWith("/api/admin/platform/accounts")) {
        return jsonResponse({
          items: [
            {
              createdAt: "2026-05-26T10:00:00.000Z",
              displayName: "Acme Ops",
              email: "ops@example.com",
              entitlementCount: 1,
              id: "acct_001",
              organization: "Acme Research",
              status: "active",
              type: "platform_account_summary",
              updatedAt: "2026-05-26T10:15:00.000Z",
              usableEntitlementCount: 1
            }
          ]
        });
      }
      if (url.endsWith("/api/admin/platform/entitlements")) {
        return jsonResponse({
          items: [
            {
              accountId: "acct_001",
              id: "ent_001",
              plan: "Pilot",
              status: "active",
              type: "platform_entitlement_summary",
              usable: true
            }
          ]
        });
      }
      if (url.endsWith("/api/admin/platform/subscription-usage-monitor")) {
        return jsonResponse({
          monitor: {
            ...usageMonitorResponse(),
            items: [
              {
                accountId: "acct_001",
                activityLevel: "active_recently",
                artifactRef: "artifact_hidden_001",
                artifactStatus: "active",
                channelUsages: [{ channelRef: "chan_hidden_001", downloadBytes: 0, lastObservedAt: null, uploadBytes: 0, usedBytes: 0 }],
                collectionStatus: "measured",
                downloadBytes: 1024 ** 3 * 2,
                edgeCredentialBindings: [{
                  channelRef: "chan_hidden_001",
                  credentialRefPresent: true,
                  materialDigestPresent: true,
                  usageMeasured: true
                }],
                entitlementId: "ent_001",
                issuedChannels: ["chan_hidden_001"],
                issuanceRequestId: "ord_hidden_001",
                lastRefreshAt: "2026-05-26T10:30:00.000Z",
                lastUsageObservedAt: "2026-05-26T10:20:00.000Z",
                linkStatus: "active",
                nodeId: "node_hidden_001",
                plan: "Pilot",
                portalUserRef: "acct_001",
                quantity: 1,
                refreshCount: 1,
                tenantRef: "tenant_hidden_001",
                tenantStatus: "active",
                trafficLimitBytes: 1024 ** 3 * 10,
                uploadBytes: 1024 ** 3,
                usageMeasured: true,
                usageStatus: "measured",
                usedBytes: 1024 ** 3 * 3,
                validUntil: "2026-06-26T00:00:00.000Z",
                warnings: []
              }
            ]
          }
        });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetcher);

    render(createElement(App));

    fireEvent.click(await screen.findByRole("button", { name: "User Management" }));

    expect(await screen.findByRole("row", { name: /user_management_acct_001 acct_001 Acme Ops Active Low/ })).not.toBeNull();
    expect(screen.getByText("Showing 1-1 of 1")).not.toBeNull();
    expect(screen.getAllByText("[REDACTED_EMAIL]").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Pilot").length).toBeGreaterThanOrEqual(1);
    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledWith(
        "http://127.0.0.1:3456/api/admin/platform/accounts",
        expect.objectContaining({ headers: expect.any(Headers) })
      );
      expect(fetcher).toHaveBeenCalledWith(
        "http://127.0.0.1:3456/api/admin/platform/entitlements",
        expect.objectContaining({ headers: expect.any(Headers) })
      );
      expect(fetcher).toHaveBeenCalledWith(
        "http://127.0.0.1:3456/api/admin/platform/subscription-usage-monitor",
        expect.objectContaining({ headers: expect.any(Headers) })
      );
    });
    expect(screen.getByText("1 total / 1 active")).not.toBeNull();
    expect(screen.getByText("3.0 GB used")).not.toBeNull();
    expect(screen.getByText("3.0 / 10.0 GB")).not.toBeNull();
    expect(screen.getByText("1 measured / 0 pending")).not.toBeNull();
    const accountCall = fetcher.mock.calls.find(([input]) => String(input).endsWith("/api/admin/platform/accounts")) as
      | [RequestInfo | URL, RequestInit]
      | undefined;
    expect((accountCall?.[1].headers as Headers).get("authorization")).toBeNull();
    expect(accountCall?.[1].credentials).toBe("same-origin");
    expect(document.body.textContent ?? "").not.toMatch(/ops@example\.com|ord_hidden|tenant_hidden|node_hidden|chan_hidden|subscriptionUrl|token=|secret-value|password|edgecred_|bearer|raw log|sqlite/i);
  });

  test("loads Usage & Channels from protected usage monitor summaries", async () => {
    saveAdminSession({
      authMode: "protectedSession",
      baseUrl: "http://127.0.0.1:3456"
    });
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/admin/platform/subscription-usage-monitor")) {
        return jsonResponse({
          monitor: {
            ...usageMonitorResponse(),
            aggregates: {
              ...usageMonitorResponse().aggregates,
              activeRecently: 1,
              total: 1,
              usage: {
                ...usageMonitorResponse().aggregates.usage,
                measuredOrders: 1,
                totalDownloadBytes: 2147483648,
                totalUploadBytes: 1073741824,
                totalUsedBytes: 3221225472
              }
            },
            items: [
              {
                accountId: "acct_usage_live",
                activityLevel: "active_recently",
                artifactFirstSeenAt: null,
                artifactLastSeenAt: null,
                artifactRef: "artifact_usage_safe",
                artifactStatus: "active",
                channelUsages: [{
                  channelRef: "chan_usage_live",
                  downloadBytes: 2147483648,
                  lastObservedAt: "2026-06-05T07:58:00.000Z",
                  uploadBytes: 1073741824,
                  usedBytes: 3221225472
                }],
                collectionStatus: "measured",
                downloadBytes: 2147483648,
                edgeCredentialBindings: [{
                  channelRef: "chan_usage_live",
                  credentialRefPresent: true,
                  materialDigestPresent: true,
                  usageMeasured: true
                }],
                entitlementId: "ent_usage_safe",
                issuedChannels: ["chan_usage_live"],
                issuanceRequestId: "ord_usage_live",
                lastRefreshAt: "2026-06-05T07:55:00.000Z",
                lastUsageObservedAt: "2026-06-05T07:58:00.000Z",
                linkStatus: "active",
                nodeId: "node_usage_safe",
                plan: "Pilot",
                portalUserRef: "acct_usage_live",
                quantity: 1,
                refreshCount: 2,
                tenantExpiresAt: "2026-06-26T00:00:00.000Z",
                tenantRef: "tenant_usage_safe",
                tenantStatus: "active",
                trafficLimitBytes: 10737418240,
                uploadBytes: 1073741824,
                usageMeasured: true,
                usageStatus: "measured",
                usedBytes: 3221225472,
                validUntil: "2026-06-26T00:00:00.000Z",
                warnings: []
              }
            ]
          }
        });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetcher);

    render(createElement(App));

    fireEvent.click(await screen.findByRole("button", { name: "Usage & Channels" }));

    expect((await screen.findAllByText("2026-06-05 08:00")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("chan_usage_live")).not.toBeNull();
    expect(screen.getByText("acct_usage_live")).not.toBeNull();
    expect(screen.getByText("ord_usage_live · 3.0GB / 10GB")).not.toBeNull();
    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:3456/api/admin/platform/subscription-usage-monitor",
      expect.objectContaining({ headers: expect.any(Headers) })
    );
    const usageCall = fetcher.mock.calls.find(([input]) => String(input).endsWith("/api/admin/platform/subscription-usage-monitor")) as
      | [RequestInfo | URL, RequestInit]
      | undefined;
    expect((usageCall?.[1].headers as Headers).get("authorization")).toBeNull();
    expect(usageCall?.[1].credentials).toBe("same-origin");
    expect(document.body.textContent ?? "").not.toMatch(/subscriptionUrl|token=|secret-value|password|edgecred_|bearer\s+[a-z0-9._-]+/i);
  });

  test("loads Order Management from protected portal access request summaries", async () => {
    saveAdminSession({
      authMode: "protectedSession",
      baseUrl: "http://127.0.0.1:3456"
    });
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/admin/platform/portal-access-requests?limit=20&offset=0")) {
        return jsonResponse({
          items: [
            {
              accessGrantRef: null,
              durationDays: 30,
              entitlementRef: null,
              id: "pareq_nav_001",
              nextAction: "admin_review_required",
              plan: "monthly",
              planLabel: "Monthly",
              portalUserRef: "acct_nav_001",
              priorTrialState: "not_used",
              reviewedAt: null,
              reviewedByRef: null,
              safeReasonCode: null,
              safety: {
                noEntitlementCreated: true,
                noProductionMutation: true,
                noRawCustomerData: true,
                noRawHandoffMaterial: true,
                noRuntimeMutation: true,
                noSubscriptionUrl: true
              },
              status: "pending_admin_review",
              submittedAt: "2026-06-30T08:30:00.000Z",
              trafficLimitBytes: 21474836480,
              type: "portal_access_request_summary",
              updatedAt: "2026-06-30T08:30:00.000Z"
            }
          ],
          pageInfo: {
            limit: 20,
            nextOffset: null,
            offset: 0,
            previousOffset: null,
            returnedRows: 1,
            totalRows: 1
          }
        });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetcher);

    render(createElement(App));

    fireEvent.click(await screen.findByRole("button", { name: "Order Management" }));

    expect(await screen.findByRole("row", { name: /pareq_nav_001 pareq_nav_001 acct_nav_001 Pending Admin Review Not Delivered/ })).not.toBeNull();
    expect(screen.getByText("Showing 1-1 of 1")).not.toBeNull();
    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledWith(
        "http://127.0.0.1:3456/api/admin/platform/portal-access-requests?limit=20&offset=0",
        expect.objectContaining({ headers: expect.any(Headers) })
      );
    });
    const orderCall = fetcher.mock.calls.find(([input]) => String(input).endsWith("/api/admin/platform/portal-access-requests?limit=20&offset=0")) as
      | [RequestInfo | URL, RequestInit]
      | undefined;
    expect((orderCall?.[1].headers as Headers).get("authorization")).toBeNull();
    expect(orderCall?.[1].credentials).toBe("same-origin");
    expect(document.body.textContent ?? "").not.toMatch(/subscriptionUrl|token=|secret-value|password|edgecred_|bearer|raw log|sqlite|handoffMaterial/i);
  });

  test("loads next Order Management page from the protected Admin API", async () => {
    saveAdminSession({
      authMode: "protectedSession",
      baseUrl: "http://127.0.0.1:3456"
    });
    function orderSummary(index: number) {
      const id = `pareq_page_${String(index).padStart(2, "0")}`;
      return {
        accessGrantRef: null,
        durationDays: 30,
        entitlementRef: null,
        id,
        nextAction: "admin_review_required",
        plan: "monthly",
        planLabel: "Monthly",
        portalUserRef: `acct_page_${String(index).padStart(2, "0")}`,
        priorTrialState: "not_used",
        reviewedAt: null,
        reviewedByRef: null,
        safeReasonCode: null,
        safety: {
          noEntitlementCreated: true,
          noProductionMutation: true,
          noRawCustomerData: true,
          noRawHandoffMaterial: true,
          noRuntimeMutation: true,
          noSubscriptionUrl: true
        },
        status: "pending_admin_review",
        submittedAt: "2026-06-30T08:30:00.000Z",
        trafficLimitBytes: 21474836480,
        type: "portal_access_request_summary",
        updatedAt: "2026-06-30T08:30:00.000Z"
      };
    }
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/admin/platform/portal-access-requests?limit=20&offset=0")) {
        return jsonResponse({
          items: Array.from({ length: 20 }, (_unused, index) => orderSummary(index + 1)),
          pageInfo: {
            limit: 20,
            nextOffset: 20,
            offset: 0,
            previousOffset: null,
            returnedRows: 20,
            totalRows: 21
          }
        });
      }
      if (url.endsWith("/api/admin/platform/portal-access-requests?limit=20&offset=20")) {
        return jsonResponse({
          items: [orderSummary(21)],
          pageInfo: {
            limit: 20,
            nextOffset: null,
            offset: 20,
            previousOffset: 0,
            returnedRows: 1,
            totalRows: 21
          }
        });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetcher);

    render(createElement(App));

    fireEvent.click(await screen.findByRole("button", { name: "Order Management" }));
    expect(await screen.findByRole("row", { name: /pareq_page_01 pareq_page_01 acct_page_01 Pending Admin Review Not Delivered/ })).not.toBeNull();
    expect(screen.getByText("Showing 1-20 of 21")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByRole("row", { name: /pareq_page_21 pareq_page_21 acct_page_21 Pending Admin Review Not Delivered/ })).not.toBeNull();
    expect(screen.getByText("Showing 21-21 of 21")).not.toBeNull();
    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledWith(
        "http://127.0.0.1:3456/api/admin/platform/portal-access-requests?limit=20&offset=20",
        expect.objectContaining({ headers: expect.any(Headers) })
      );
    });
    expect(document.body.textContent ?? "").not.toMatch(/subscriptionUrl|token=|secret-value|password|edgecred_|bearer|raw log|sqlite|handoffMaterial/i);
  });

  test("submits Order Management operation previews through protected Admin APIs", async () => {
    saveAdminSession({
      authMode: "protectedSession",
      baseUrl: "http://127.0.0.1:3456"
    });
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/api/admin/platform/portal-access-requests?limit=20&offset=0") && method === "GET") {
        return jsonResponse({
          items: [
            {
              accessGrantRef: null,
              durationDays: 30,
              entitlementRef: null,
              id: "pareq_nav_001",
              nextAction: "admin_review_required",
              plan: "monthly",
              planLabel: "Monthly",
              portalUserRef: "acct_nav_001",
              priorTrialState: "not_used",
              reviewedAt: null,
              reviewedByRef: null,
              safeReasonCode: null,
              safety: {
                noEntitlementCreated: true,
                noProductionMutation: true,
                noRawCustomerData: true,
                noRawHandoffMaterial: true,
                noRuntimeMutation: true,
                noSubscriptionUrl: true
              },
              status: "pending_admin_review",
              submittedAt: "2026-06-30T08:30:00.000Z",
              trafficLimitBytes: 21474836480,
              type: "portal_access_request_summary",
              updatedAt: "2026-06-30T08:30:00.000Z"
            },
            {
              accessGrantRef: "grant_safe_ref_002",
              durationDays: 365,
              entitlementRef: "ent_safe_ref_002",
              id: "pareq_nav_002",
              nextAction: "user_can_use_access",
              plan: "yearly",
              planLabel: "Yearly",
              portalUserRef: "acct_nav_002",
              priorTrialState: "consumed",
              reviewedAt: "2026-06-30T09:00:00.000Z",
              reviewedByRef: "operator_safe_ref",
              safeReasonCode: "approved_safe_ref",
              safety: {
                noEntitlementCreated: false,
                noProductionMutation: true,
                noRawCustomerData: true,
                noRawHandoffMaterial: true,
                noRuntimeMutation: true,
                noSubscriptionUrl: true
              },
              status: "delivered",
              submittedAt: "2026-06-30T08:45:00.000Z",
              trafficLimitBytes: 107374182400,
              type: "portal_access_request_summary",
              updatedAt: "2026-06-30T09:05:00.000Z"
            }
          ],
          pageInfo: {
            limit: 20,
            nextOffset: null,
            offset: 0,
            previousOffset: null,
            returnedRows: 2,
            totalRows: 2
          }
        });
      }
      if (url.endsWith("/api/admin/platform/portal-access-requests/pareq_nav_001/approve-preview") && method === "POST") {
        return jsonResponse({
          preview: {
            approvalRef: "approval_local_order_lifecycle",
            issuanceInput: {},
            mode: "portal-access-request-approval-preview",
            ok: true,
            request: { id: "pareq_nav_001", status: "approved_pending_delivery" },
            safety: {
              noProductionMutation: true,
              noRawHandoffMaterial: true,
              noRuntimeMutation: true,
              noSubscriptionUrl: true,
              previewOnly: true,
              requiresSeparateIssuanceExecution: true
            },
            status: "approved_pending_delivery"
          }
        });
      }
      if (url.endsWith("/api/admin/platform/portal-access-requests/pareq_nav_002/traffic-limit") && method === "POST") {
        return jsonResponse({
          quotaUpdate: {
            audit: {
              action: "traffic_limit_updated",
              recordedAt: "2026-06-30T10:00:00.000Z"
            },
            ok: true,
            quota: {
              previousTrafficLimitBytes: 107374182400,
              trafficLimitBytes: 32212254720,
              updatedAt: "2026-06-30T10:00:00.000Z"
            },
            request: { id: "pareq_nav_002" },
            safety: {
              noProductionMutation: true,
              noRawCustomerData: true,
              noRawHandoffMaterial: true,
              noRuntimeMutation: true,
              noSubscriptionUrl: true
            },
            type: "portal_access_request_traffic_limit_update"
          }
        });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetcher);

    render(createElement(App));

    fireEvent.click(await screen.findByRole("button", { name: "Order Management" }));
    expect(await screen.findByRole("row", { name: /pareq_nav_001 pareq_nav_001 acct_nav_001 Pending Admin Review Not Delivered/ })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Approve Preview" }));
    fireEvent.click(screen.getByRole("button", { name: "Run approval preview" }));
    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledWith(
        "http://127.0.0.1:3456/api/admin/platform/portal-access-requests/pareq_nav_001/approve-preview",
        expect.objectContaining({
          body: JSON.stringify({
            approvalRef: "approval_local_order_lifecycle",
            nodeId: "channel-lab-b-tuic",
            reviewedByRef: "operator_local_admin"
          }),
          method: "POST"
        })
      );
    });
    expect(screen.getByText("Approval preview ready.")).not.toBeNull();

    fireEvent.click(screen.getByRole("row", { name: /pareq_nav_002 pareq_nav_002 acct_nav_002 Delivered Active Delivered/ }));
    fireEvent.click(screen.getByRole("button", { name: "Set Traffic Limit" }));
    fireEvent.change(screen.getByLabelText("Traffic Limit GB"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit traffic limit" }));

    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledWith(
        "http://127.0.0.1:3456/api/admin/platform/portal-access-requests/pareq_nav_002/traffic-limit",
        expect.objectContaining({
          body: JSON.stringify({
            reasonCode: "local_order_quota_review",
            reviewedByRef: "operator_local_admin",
            trafficLimitBytes: 32212254720
          }),
          method: "POST"
        })
      );
    });
    expect(screen.getByText("Traffic limit submitted.")).not.toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(/subscriptionUrl|token=|secret-value|password|edgecred_|bearer|raw log|sqlite|handoffMaterial/i);
  });

  test("uses loading state instead of fixture fallback while live User Management data is unresolved", () => {
    const readModel = resolveUserManagementReadModel({
      data: null,
      dataState: null,
      liveMode: true
    });

    expect(readModel.accounts).toEqual([]);
    expect(readModel.entitlements).toEqual([]);
    expect(readModel.usageRows).toEqual([]);
    expect(readModel.state).toEqual({
      description: "Loading protected account summaries from the Admin API.",
      title: "Loading user accounts",
      tone: "loading"
    });
  });

  test("submits User Management create through the local admin lifecycle API", async () => {
    saveAdminSession({
      authMode: "protectedSession",
      baseUrl: "http://127.0.0.1:3456"
    });
    let accounts = [
      {
        createdAt: "2026-05-26T10:00:00.000Z",
        displayName: "Acme Ops",
        email: "ops@example.com",
        entitlementCount: 1,
        id: "acct_001",
        organization: "Acme Research",
        status: "active",
        type: "platform_account_summary",
        updatedAt: "2026-05-26T10:15:00.000Z",
        usableEntitlementCount: 1
      }
    ];
    let accountListCalls = 0;
    let resolveRefreshAccounts: () => void = () => {
      throw new Error("refresh account request was not started");
    };
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/api/admin/platform/accounts") && method === "GET") {
        accountListCalls += 1;
        if (accountListCalls > 1) {
          await new Promise<void>((resolve) => {
            resolveRefreshAccounts = resolve;
          });
        }
        return jsonResponse({ items: accounts });
      }
      if (url.endsWith("/api/admin/platform/accounts") && method === "POST") {
        accounts = [
          ...accounts,
          {
            createdAt: "2026-05-26T10:20:00.000Z",
            displayName: "Beta Ops",
            email: "beta@example.com",
            entitlementCount: 0,
            id: "acct_002",
            organization: "Beta Account",
            status: "active",
            type: "platform_account_summary",
            updatedAt: "2026-05-26T10:20:00.000Z",
            usableEntitlementCount: 0
          }
        ];
        return jsonResponse({
          account: accounts[1],
          initialCredential: {
            accountId: "acct_002",
            delivery: "operator_handoff_only",
            initialPassword: "gcctemp-nav-create-001",
            mustRotate: true,
            safety: {
              auditLogMaterial: "redacted",
              returnedInListApis: false,
              storedAsHash: true
            },
            type: "portal_initial_password_handoff",
            visibleOnce: true
          },
          mutation: { action: "account_created", auditRequired: true }
        });
      }
      if (url.endsWith("/api/admin/platform/entitlements")) {
        return jsonResponse({ items: [] });
      }
      if (url.endsWith("/api/admin/platform/subscription-usage-monitor")) {
        return jsonResponse({ monitor: usageMonitorResponse() });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetcher);

    render(createElement(App));

    fireEvent.click(await screen.findByRole("button", { name: "User Management" }));
    expect(await screen.findByRole("row", { name: /user_management_acct_001 acct_001 Acme Ops Active Low/ })).not.toBeNull();

    fireEvent.click(within(screen.getByLabelText("User Management gated actions")).getByRole("button", { name: "Create User" }));
    const panel = screen.getByLabelText("User Management lifecycle panel");
    fireEvent.change(within(panel).getByLabelText("Organization"), { target: { value: "Beta Account" } });
    fireEvent.change(within(panel).getByLabelText("Email"), { target: { value: "beta@example.com" } });
    fireEvent.change(within(panel).getByLabelText("Display Name"), { target: { value: "Beta Ops" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Submit create" }));

    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledWith(
        "http://127.0.0.1:3456/api/admin/platform/accounts",
        expect.objectContaining({
          body: JSON.stringify({
            approvalRef: "approval_local_user_lifecycle",
            displayName: "Beta Ops",
            email: "beta@example.com",
            operatorRef: "operator_local_admin",
            organization: "Beta Account",
            reason: "local_admin_user_lifecycle",
            status: "active"
          }),
          method: "POST"
        })
      );
    });
    expect(await screen.findByText("Initial password")).not.toBeNull();
    expect(screen.getByText("gcctemp-nav-create-001")).not.toBeNull();
    expect(await screen.findByText("Loading protected account summaries from the Admin API.")).not.toBeNull();
    expect(screen.getByText("gcctemp-nav-create-001")).not.toBeNull();
    resolveRefreshAccounts?.();
    expect(await screen.findByRole("row", { name: /user_management_acct_002 acct_002 Beta Ops Active Medium/ })).not.toBeNull();
    expect(screen.getByText("gcctemp-nav-create-001")).not.toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(/ops@example\.com|beta@example\.com|subscriptionUrl|token=|secret-value|edgecred_|bearer|raw log|sqlite/i);
  });

  test("keeps Create User available when optional user-management evidence requests fail", async () => {
    saveAdminSession({
      authMode: "protectedSession",
      baseUrl: "http://127.0.0.1:3456"
    });
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/admin/platform/accounts")) {
        return jsonResponse({
          items: [
            {
              createdAt: "2026-05-26T10:00:00.000Z",
              displayName: "Acme Ops",
              email: "ops@example.com",
              entitlementCount: 1,
              id: "acct_001",
              organization: "Acme Research",
              status: "active",
              type: "platform_account_summary",
              updatedAt: "2026-05-26T10:15:00.000Z",
              usableEntitlementCount: 1
            }
          ]
        });
      }
      if (url.endsWith("/api/admin/platform/entitlements")) {
        return jsonResponse({}, 503);
      }
      if (url.endsWith("/api/admin/platform/subscription-usage-monitor")) {
        return jsonResponse({}, 503);
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetcher);

    render(createElement(App));

    fireEvent.click(await screen.findByRole("button", { name: "User Management" }));

    expect(await screen.findByRole("row", { name: /user_management_acct_001 acct_001 Acme Ops Active Low/ })).not.toBeNull();
    const createButton = within(screen.getByLabelText("User Management gated actions"))
      .getByRole<HTMLButtonElement>("button", { name: "Create User" });
    expect(createButton.disabled).toBe(false);
    expect(screen.queryByText("Create User · Gated")).toBeNull();
  });

  test("keeps User Management lifecycle gated when protected account summaries fail to load", async () => {
    saveAdminSession({
      authMode: "protectedSession",
      baseUrl: "http://127.0.0.1:3456"
    });
    const fetcher = vi.fn(async () => jsonResponse({}, 503));
    vi.stubGlobal("fetch", fetcher);

    render(createElement(App));

    fireEvent.click(await screen.findByRole("button", { name: "User Management" }));

    const gatedActions = await screen.findByLabelText("User Management gated actions");
    const createButton = within(gatedActions).getByRole<HTMLButtonElement>("button", { name: "Create User · Gated" });
    expect(createButton.disabled).toBe(true);
    expect(await screen.findByText("User Management API unavailable")).not.toBeNull();
    expect(screen.queryByText("No user accounts available")).toBeNull();
    expect(screen.queryByLabelText("User Management lifecycle panel")).toBeNull();
  });

  test("returns to protected Admin login when User Management account summaries are unauthorized", async () => {
    saveAdminSession({
      authMode: "protectedSession",
      baseUrl: "http://127.0.0.1:3456"
    });
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/admin/platform/accounts")) {
        return jsonResponse({}, 401);
      }
      if (url.endsWith("/api/admin-auth/session")) {
        return jsonResponse({
          authenticated: false,
          mode: "portalAccount",
          operatorRef: "portal_user_20260604_001"
        });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetcher);

    render(createElement(App));

    fireEvent.click(await screen.findByRole("button", { name: "User Management" }));

    expect(await screen.findByRole("heading", { name: "Portal account login" })).not.toBeNull();
    expect(screen.queryByText("No user accounts available")).toBeNull();
    expect(screen.queryByText("Loading user accounts")).toBeNull();
  });

  test("keeps account menu in the top bar without a navigation library utility layer", async () => {
    saveAdminSession({
      authMode: "protectedSession",
      baseUrl: "http://127.0.0.1:3456"
    });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => dashboardJsonResponse(String(input))));

    render(createElement(App));

    expect(await screen.findByRole("heading", { name: "Operations Overview" })).not.toBeNull();
    expect(screen.queryByLabelText("Open navigation library")).toBeNull();
    expect(screen.queryByLabelText("Environment status")).toBeNull();

    fireEvent.click(screen.getByLabelText("Operator account"));
    expect(screen.getAllByText("Operator").length).toBeGreaterThanOrEqual(1);
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

function nodeBandwidthResponse() {
  return {
    type: "node_bandwidth_summary",
    generatedAt: "2026-06-30T10:06:00.000Z",
    filters: {
      nodeId: "",
      from: "",
      to: "",
      bucket: "minute"
    },
    aggregates: {
      totalNodes: 1,
      measuredNodes: 1,
      unmeasuredNodes: 0,
      warningNodes: 0,
      totalBytes: 2147483648,
      uploadBytes: 805306368,
      downloadBytes: 1342177280,
      peakTotalBps: 3200000000,
      byNode: {
        "channel-live-1": 2147483648
      },
      byPhysicalNode: {
        "node-live-1": 2147483648
      }
    },
    items: [
      {
        nodeId: "channel-live-1",
        channelRef: "channel-live-1",
        physicalNodeRef: "node-live-1",
        providerRef: "vultr",
        region: "Tokyo",
        protocol: "hysteria2",
        runtimeAdapter: "remote-data-plane-handoff",
        lifecycle: "active",
        status: "configured",
        subscriptionEligible: true,
        configured: true,
        capacityBps: 5000000000,
        utilizationPercent: 68,
        utilizationState: "normal",
        activeOrderCount: 3,
        measuredOrderCount: 3,
        sampleCount: 4,
        uploadBytes: 805306368,
        downloadBytes: 1342177280,
        totalBytes: 2147483648,
        currentUploadBps: 1100000000,
        currentDownloadBps: 2400000000,
        currentTotalBps: 3500000000,
        peakUploadBps: 1000000000,
        peakDownloadBps: 2200000000,
        peakTotalBps: 3200000000,
        lastObservedAt: "2026-06-30T10:05:10.000Z",
        collectionStatus: "measured",
        warnings: []
      }
    ],
    series: {
      type: "node_bandwidth_timeseries",
      range: {
        from: null,
        to: null,
        bucket: "minute"
      },
      points: [],
      safety: {
        summaryOnly: true,
        rawEdgeCredentialReturned: false,
        rawRuntimePayloadReturned: false,
        rawSecretReturned: false,
        mutationAllowed: false
      }
    },
    safety: {
      summaryOnly: true,
      adminOnly: true,
      nodeLevelRows: true,
      rawEdgeCredentialReturned: false,
      rawRuntimePayloadReturned: false,
      rawSecretReturned: false,
      rawSubscriptionUrlReturned: false,
      mutationAllowed: false,
      usageCollectorConfigured: true
    }
  };
}
