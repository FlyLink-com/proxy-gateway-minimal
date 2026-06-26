import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { SubscriptionUsageMonitorPage } from "../pages/subscription-usage-monitor-page";

afterEach(() => {
  cleanup();
});

describe("subscription usage monitor page", () => {
  test("renders Usage & Channels as a clean platform monitoring structure", () => {
    render(<SubscriptionUsageMonitorPage />);

    expect(screen.getByRole("heading", { name: "Usage & Channels" })).not.toBeNull();
    expect(screen.getByText("Platform Monitoring / Usage & Channels")).not.toBeNull();
    expect(screen.getByLabelText("Usage & Channels page header")).not.toBeNull();
    expect(document.querySelector(".admin-blueprint-page")?.getAttribute("data-page-id")).toBe("usageMonitor");
    expect(document.querySelector(".admin-blueprint-page")?.getAttribute("data-layout")).toBe("dashboard");
    expect(document.querySelector(".admin-blueprint-page")?.getAttribute("data-ui-role")).toBe("workspace");
    expect(document.querySelector(".admin-blueprint-page")?.getAttribute("data-mobile-projection")).toBe("single-column-review-flow");
    expect(document.querySelector(".admin-blueprint-page")?.getAttribute("data-required-blocks")).toContain("evidence-row");
    expect(screen.queryByRole("button", { name: "Card settings" })).toBeNull();
    expect(screen.queryByRole("switch", { name: "Edit workspace" })).toBeNull();
    expect(screen.queryByLabelText("Usage & Channels status dashboard")).toBeNull();
    expect(screen.queryByLabelText("Active module count")).toBeNull();
    expect(screen.queryByLabelText("Usage & Channels workspace editor")).toBeNull();
    expect(screen.queryByLabelText("Usage & Channels layout controls")).toBeNull();
    expect(screen.queryByText("Module Library")).toBeNull();
    expect(screen.queryByText("Page design notes")).toBeNull();
    expect(document.querySelector(".admin-blueprint-edit-zone")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Usage & Channels sections" })).toBeNull();
    expect(sectionAnchorOrder()).toEqual([
      "platform-monitoring-freshness",
      "platform-monitoring-channel-coverage",
      "platform-monitoring-usage-ledger"
    ]);

    expect(screen.queryByLabelText("Usage & Channels page navigation")).toBeNull();
    expect(screen.queryByLabelText("Usage & Channels card controls")).toBeNull();
    expect(screen.queryByRole("button", { name: "Collection Freshness hide module" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Channel Coverage hide module" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Usage Ledger hide module" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Collection Anomalies hide module" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Receipts & Collectors hide module" })).toBeNull();

    expect(screen.getByRole("heading", { name: "Collection Freshness" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Channel Coverage" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Usage Ledger" })).not.toBeNull();
    expect(document.querySelector("#platform-monitoring-freshness")?.getAttribute("data-ui-role")).toBe("panel");
    expect(document.querySelector("#platform-monitoring-channel-coverage")?.getAttribute("data-ui-role")).toBe("panel");
    expect(document.querySelector("#platform-monitoring-usage-ledger")?.getAttribute("data-ui-role")).toBe("panel");
    expect(document.querySelectorAll(".admin-blueprint-module-board > [data-module-nav-id]")).toHaveLength(3);
    expect(screen.getAllByLabelText("Monitoring panel")).toHaveLength(3);
    expect(screen.queryByText("Safe diagnostics entry panel")).toBeNull();
    expect(document.querySelectorAll(".admin-blueprint-panel-field-count")).toHaveLength(0);
    expect(document.querySelectorAll(".admin-blueprint-module-title small")).toHaveLength(0);
    expect(screen.getByLabelText("Collection Freshness owner model content")).not.toBeNull();
    expect(screen.queryByLabelText("Collection Freshness static operator content")).toBeNull();
    expect(screen.getByLabelText("Usage & Channels evidence surfaces")).not.toBeNull();
    expect(screen.getByLabelText("Usage Metrics evidence panel")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Usage Metrics" })).not.toBeNull();
    expect(screen.getByRole("img", { name: "Usage Metrics safe trend" })).not.toBeNull();
    expect(screen.getByLabelText("Usage and Channel Event Log evidence panel")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Usage & Channel Event Log" })).not.toBeNull();
    expect(screen.getByText("Fresh sample observed")).not.toBeNull();
    expect(document.querySelectorAll("[data-figma-component='EvidenceSurface'][data-ui-surface='evidence-row']")).toHaveLength(2);
    expect(screen.getByText("Usage collection age and SLO")).not.toBeNull();
    expect(screen.getByText("Measured channels and gaps")).not.toBeNull();
    expect(screen.getByText("Account/order traffic ledger")).not.toBeNull();
    expect(screen.getAllByText("hk-01")).toHaveLength(2);
    expect(screen.getByText("sg-02")).not.toBeNull();
    expect(screen.getByText("acct_001")).not.toBeNull();
    expect(screen.getByText("acct_002")).not.toBeNull();
    expect(screen.getByText("Freshness lane")).not.toBeNull();
    expect(screen.getByText("Coverage lane")).not.toBeNull();
    expect(screen.getByText("Ledger")).not.toBeNull();
    expect(ownerModelRouteScopes()).toEqual([
      "usageMonitor#platform-monitoring-freshness",
      "usageMonitor#platform-monitoring-channel-coverage",
      "usageMonitor#platform-monitoring-usage-ledger"
    ]);
    expect(ownerModelResultWindows()).toEqual(["1-2/2", "1-2/2", "1-2/2"]);
    expect(screen.queryByText("Latest usage · observed age")).toBeNull();
    expect(screen.queryByText("Evidence owner for usage collection trust, channel coverage, receipts, collectors, and collection anomalies.")).toBeNull();
    expect(screen.queryByText("Measured channels · count")).toBeNull();
    expect(screen.queryByText("Traffic · upload / download / total")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Collection Anomalies" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Receipts & Collectors" })).toBeNull();
    expect(screen.queryByText("3 more candidates are routed to the detail page.")).toBeNull();
    expect(screen.queryByText("Collectors · availability")).toBeNull();
    expect(document.querySelectorAll(".admin-blueprint-module-notes")).toHaveLength(0);
    document.querySelectorAll(".admin-blueprint-module-notes").forEach((notes) => {
      expect(notes.hasAttribute("open")).toBe(false);
    });

    const renderedText = document.body.textContent ?? "";
    expect(renderedText).not.toMatch(/subscriptionUrl|token=|secret-value|password|yaml|edgecred_/i);
    expect(screen.queryByRole("img", { name: /usage chart/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Apply filters|Create|Disable|Pause|Archive|Activate|Apply/i })).toBeNull();
  });

  test("renders Usage & Channels fixture preview with receipt and collector states", () => {
    render(<SubscriptionUsageMonitorPage fixturePreviewEnabled />);

    expect(screen.getByLabelText("Collection Freshness fixture preview")).not.toBeNull();
    expect(screen.getByLabelText("Channel Coverage fixture preview")).not.toBeNull();
    expect(screen.getByLabelText("Usage Ledger fixture preview")).not.toBeNull();
    expect(screen.queryByText("Issued vs measured vs missing receipt blockers.")).toBeNull();
    expect(screen.getAllByText("Route latency").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("route_safe_tuic_recovery").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Pending receipt/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("sgp-hy2 · receipt pending").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByLabelText("Collection Anomalies fixture preview")).toBeNull();
    expect(screen.queryByLabelText("Receipts & Collectors fixture preview")).toBeNull();
    expect(screen.queryByText("Raw runtime config and logs are excluded.")).toBeNull();

    const renderedText = document.body.textContent ?? "";
    expect(renderedText).not.toMatch(/https?:\/\/|subscriptionUrl|token=|secret-value|password|yaml|edgecred_/i);
    expect(screen.queryByRole("button", { name: /Apply filters|Create|Disable|Pause|Archive|Activate|Apply/i })).toBeNull();
  });
});

function sectionAnchorOrder() {
  return Array.from(document.querySelectorAll(".page-anchor-group"))
    .map((element) => element.id);
}

function ownerModelRouteScopes() {
  return Array.from(document.querySelectorAll("[data-query-schema='admin-table-query-state/v1']"))
    .map((element) => element.getAttribute("data-route-scope"));
}

function ownerModelResultWindows() {
  return Array.from(document.querySelectorAll("[data-query-schema='admin-table-query-state/v1']"))
    .map((element) => element.getAttribute("data-result-window"));
}
