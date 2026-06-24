import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
    const sectionNav = screen.getByRole("navigation", { name: "Usage & Channels sections" });
    expect(within(sectionNav).getByRole("button", { name: "Collection Freshness" }).getAttribute("aria-current")).toBe("page");
    expect(within(sectionNav).getByRole("button", { name: "Channel Coverage" })).not.toBeNull();
    expect(within(sectionNav).getByRole("button", { name: "Usage Ledger" })).not.toBeNull();
    expect(within(sectionNav).getByRole("button", { name: "Collection Anomalies" })).not.toBeNull();
    expect(within(sectionNav).getByRole("button", { name: "Receipts & Collectors" })).not.toBeNull();
    expect(sectionAnchorOrder()).toEqual(["platform-monitoring-freshness"]);

    expect(screen.queryByLabelText("Usage & Channels page navigation")).toBeNull();
    expect(screen.queryByLabelText("Usage & Channels card controls")).toBeNull();
    expect(screen.getByRole("button", { name: "Collection Freshness hide module" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Channel Coverage hide module" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Usage Ledger hide module" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Collection Anomalies hide module" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Receipts & Collectors hide module" })).toBeNull();

    expect(screen.getByRole("heading", { name: "Collection Freshness" })).not.toBeNull();
    expect(document.querySelector("#platform-monitoring-freshness")?.getAttribute("data-ui-role")).toBe("panel");
    expect(screen.getByLabelText("Monitoring panel")).not.toBeNull();
    expect(screen.queryByText("Safe diagnostics entry panel")).toBeNull();
    expect(document.querySelectorAll(".admin-blueprint-panel-field-count")).toHaveLength(0);
    expect(document.querySelectorAll(".admin-blueprint-module-title small")).toHaveLength(0);
    expect(screen.getByLabelText("Collection Freshness static operator content")).not.toBeNull();
    expect(screen.getByText("Collection state")).not.toBeNull();
    expect(screen.getAllByText("Collector disabled").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Latest usage · observed age")).toBeNull();
    expect(screen.queryByText("Evidence owner for usage collection trust, channel coverage, receipts, collectors, and collection anomalies.")).toBeNull();

    fireEvent.click(within(sectionNav).getByRole("button", { name: "Channel Coverage" }));
    expect(within(sectionNav).getByRole("button", { name: "Channel Coverage" }).getAttribute("aria-current")).toBe("page");
    expect(sectionAnchorOrder()).toEqual(["platform-monitoring-channel-coverage"]);
    expect(screen.getByRole("heading", { name: "Channel Coverage" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Channel Coverage hide module" })).not.toBeNull();
    expect(screen.getByLabelText("Channel Coverage static table").className).toContain("new-console-table-compact");
    expect(screen.getAllByText("channel_safe_sgp_hy2").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Degraded")).not.toBeNull();
    expect(screen.getByText("51%")).not.toBeNull();
    expect(screen.getAllByText("Pending receipt").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText("Route latency compact rows")).not.toBeNull();
    expect(screen.getByText("route_safe_jp_primary")).not.toBeNull();
    expect(screen.getByText("88 ms")).not.toBeNull();
    expect(screen.getAllByText("Fresh").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Measured channels · count")).toBeNull();

    fireEvent.click(within(sectionNav).getByRole("button", { name: "Usage Ledger" }));
    expect(within(sectionNav).getByRole("button", { name: "Usage Ledger" }).getAttribute("aria-current")).toBe("page");
    expect(sectionAnchorOrder()).toEqual(["platform-monitoring-usage-ledger"]);
    expect(screen.getByRole("heading", { name: "Usage Ledger" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Usage Ledger hide module" })).not.toBeNull();
    expect(screen.getByLabelText("Usage Ledger static table").className).toContain("new-console-table-compact");
    expect(screen.getByText("Measured zero")).not.toBeNull();
    const usageLedgerPagination = screen.getByRole("navigation", { name: "Usage Ledger table pagination" });
    expect(within(usageLedgerPagination).getByText("Showing 1-2 of 4")).not.toBeNull();
    expect(screen.queryByText("Not collected")).toBeNull();
    fireEvent.click(within(usageLedgerPagination).getByRole("button", { name: "Next" }));
    expect(within(usageLedgerPagination).getByText("Showing 3-4 of 4")).not.toBeNull();
    expect(screen.getByText("Not collected")).not.toBeNull();
    expect(screen.queryByText("Traffic · upload / download / total")).toBeNull();

    fireEvent.click(within(sectionNav).getByRole("button", { name: "Collection Anomalies" }));
    expect(within(sectionNav).getByRole("button", { name: "Collection Anomalies" }).getAttribute("aria-current")).toBe("page");
    expect(sectionAnchorOrder()).toEqual(["platform-monitoring-anomalies"]);
    expect(screen.getByRole("heading", { name: "Collection Anomalies" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Collection Anomalies hide module" })).not.toBeNull();
    expect(screen.getByText("3 more candidates are routed to the detail page.")).not.toBeNull();

    fireEvent.click(within(sectionNav).getByRole("button", { name: "Receipts & Collectors" }));
    expect(within(sectionNav).getByRole("button", { name: "Receipts & Collectors" }).getAttribute("aria-current")).toBe("page");
    expect(sectionAnchorOrder()).toEqual(["platform-monitoring-receipts-collectors"]);
    expect(screen.getByRole("heading", { name: "Receipts & Collectors" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Receipts & Collectors hide module" })).not.toBeNull();
    expect(screen.getByLabelText("Platform Tools panel")).not.toBeNull();
    expect(screen.getByLabelText("Receipts and Collectors static operator content")).not.toBeNull();
    expect(screen.getByText("Receipt gaps stay visible without exposing protected runtime material.")).not.toBeNull();
    expect(screen.getByLabelText("Receipt and collector compact diagnostics")).not.toBeNull();
    expect(screen.getByText("agent_safe_jp_01")).not.toBeNull();
    expect(screen.getByText("31s ago")).not.toBeNull();
    expect(document.body.textContent ?? "").toContain("route-latency-sample");
    expect(screen.getAllByText("route_safe_tuic_recovery").length).toBeGreaterThanOrEqual(1);
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
    expect(screen.queryByText("Issued vs measured vs missing receipt blockers.")).toBeNull();
    const sectionNav = screen.getByRole("navigation", { name: "Usage & Channels sections" });

    fireEvent.click(within(sectionNav).getByRole("button", { name: "Channel Coverage" }));
    expect(screen.getAllByText("Route latency").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("route_safe_tuic_recovery").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Pending receipt").length).toBeGreaterThanOrEqual(1);

    fireEvent.click(within(sectionNav).getByRole("button", { name: "Usage Ledger" }));
    expect(screen.getAllByText("sgp-hy2 · receipt pending").length).toBeGreaterThanOrEqual(1);

    fireEvent.click(within(sectionNav).getByRole("button", { name: "Collection Anomalies" }));
    expect(screen.getAllByText("Missing receipt").length).toBeGreaterThanOrEqual(1);

    fireEvent.click(within(sectionNav).getByRole("button", { name: "Receipts & Collectors" }));
    expect(screen.getAllByText("agent_safe_sgp_02").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("route-latency-sample").length).toBeGreaterThanOrEqual(1);
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
