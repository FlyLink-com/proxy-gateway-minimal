import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    expect(document.querySelector(".admin-blueprint-page")?.getAttribute("data-mobile-standard-status")).toBe("pending-dedicated-standard");
    expect(document.querySelector(".admin-blueprint-page")?.getAttribute("data-responsive-standard")).toBe("desktop-tablet");
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
    expect(screen.getByLabelText("Usage & Channels subpages")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Open Collection Trust subpage" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Open Channel Evidence subpage" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Open Usage Ledger subpage" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getAllByText(/Platform Monitoring/).length).toBeGreaterThanOrEqual(1);
    expect(sectionAnchorOrder()).toEqual([
      "platform-monitoring-freshness",
      "platform-monitoring-anomalies"
    ]);

    expect(screen.queryByLabelText("Usage & Channels page navigation")).toBeNull();
    expect(screen.queryByLabelText("Usage & Channels card controls")).toBeNull();
    expect(screen.getByRole("button", { name: "Collection Freshness hide module" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Collection Anomalies hide module" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Channel Coverage hide module" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Usage Ledger hide module" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Receipts & Collectors hide module" })).toBeNull();

    expect(screen.getByRole("heading", { name: "Collection Freshness" })).not.toBeNull();
    expect(document.querySelector("#platform-monitoring-freshness")?.getAttribute("data-ui-role")).toBe("panel");
    expect(screen.getAllByLabelText("Monitoring panel").length).toBe(2);
    expect(screen.queryByLabelText("Platform Tools panel")).toBeNull();
    expect(screen.queryByText("Safe diagnostics entry panel")).toBeNull();
    expect(screen.getByLabelText("Collection Freshness runtime projection content")).not.toBeNull();
    expect(screen.getByText("Collection state")).not.toBeNull();
    expect(screen.getAllByText("Collector disabled").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Latest usage · observed age")).toBeNull();
    expect(screen.queryByText("Evidence owner for usage collection trust, channel coverage, receipts, collectors, and collection anomalies.")).toBeNull();
    expect(screen.getByRole("heading", { name: "Collection Anomalies" })).not.toBeNull();
    expect(screen.getByRole("navigation", { name: "Collection Anomalies pagination" })).not.toBeNull();
    expect(screen.getByText("1-3 of 3 items")).not.toBeNull();
    expect(screen.getAllByText("Receipt / collection pending").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole("heading", { name: "Channel Coverage" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Usage Ledger" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Receipts & Collectors" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open Channel Evidence subpage" }));

    expect(sectionAnchorOrder()).toEqual([
      "platform-monitoring-channel-coverage",
      "platform-monitoring-receipts-collectors"
    ]);
    expect(screen.getByRole("heading", { name: "Channel Coverage" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Channel Coverage hide module" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Receipts & Collectors hide module" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Collection Freshness hide module" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Usage Ledger hide module" })).toBeNull();
    expect(screen.getByLabelText("Channel Coverage static table")).not.toBeNull();
    expect(screen.getByRole("navigation", { name: "Channel Coverage pagination" })).not.toBeNull();
    expect(screen.getByText("1-3 of 3 rows")).not.toBeNull();
    expect(screen.getAllByText("channel_safe_sgp_hy2").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Degraded")).not.toBeNull();
    expect(screen.getByText("51%")).not.toBeNull();
    expect(screen.getAllByText("Pending receipt").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText("Route Latency static table")).not.toBeNull();
    expect(screen.getByRole("navigation", { name: "Route Latency pagination" })).not.toBeNull();
    expect(screen.getByText("route_safe_sgp_backup")).not.toBeNull();
    expect(screen.getByText("146 ms")).not.toBeNull();
    expect(screen.getAllByText("Stale").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Measured channels · count")).toBeNull();
    expect(screen.getByRole("heading", { name: "Receipts & Collectors" })).not.toBeNull();
    expect(screen.queryByText("Safe diagnostics entry panel")).toBeNull();
    expect(screen.getByLabelText("Receipts and Collectors static operator content")).not.toBeNull();
    expect(screen.getByText("Receipt gaps stay visible without exposing protected runtime material.")).not.toBeNull();
    expect(screen.getByLabelText("Agent Status static table")).not.toBeNull();
    expect(screen.getByRole("navigation", { name: "Agent Status pagination" })).not.toBeNull();
    expect(screen.getByText("agent_safe_sgp_02")).not.toBeNull();
    expect(screen.getAllByText("4m ago").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText("Inspection Runs static table")).not.toBeNull();
    expect(screen.getByText("route-latency-sample")).not.toBeNull();
    expect(screen.getByRole("navigation", { name: "Inspection Runs pagination" })).not.toBeNull();
    expect(screen.getAllByText("route_safe_tuic_recovery").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Collectors · availability")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open Usage Ledger subpage" }));

    expect(sectionAnchorOrder()).toEqual(["platform-monitoring-usage-ledger"]);
    expect(screen.getByRole("heading", { name: "Usage Ledger" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Usage Ledger hide module" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Channel Coverage hide module" })).toBeNull();
    expect(screen.queryByLabelText("Usage Ledger static table")).toBeNull();
    expect(screen.getByLabelText("Usage Ledger runtime projection table")).not.toBeNull();
    expect(screen.getByRole("navigation", { name: "Usage Ledger pagination" })).not.toBeNull();
    expect(screen.getByText("1-4 of 4 rows")).not.toBeNull();
    expect(screen.getAllByText("Measured zero").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Not collected").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Traffic · upload / download / total")).not.toBeNull();
    expect(screen.getByText("1 KB up / 2 KB down / 3 KB total")).not.toBeNull();

    expect(document.querySelectorAll(".admin-blueprint-module-notes")).toHaveLength(0);
    document.querySelectorAll(".admin-blueprint-module-notes").forEach((notes) => {
      expect(notes.hasAttribute("open")).toBe(false);
    });

    const renderedText = document.body.textContent ?? "";
    expect(renderedText).not.toMatch(/subscriptionUrl|token=|secret-value|password|yaml|edgecred_/i);
    expect(screen.getAllByRole("table").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole("img", { name: /usage chart/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Apply filters|Create|Disable|Pause|Archive|Activate|Apply/i })).toBeNull();
  });

  test("projects usage ledger and anomaly states from the shared usage view model", () => {
    render(<SubscriptionUsageMonitorPage />);

    fireEvent.click(screen.getByRole("button", { name: "Open Usage Ledger subpage" }));

    expect(screen.getByText("1 KB up / 2 KB down / 3 KB total")).not.toBeNull();
    expect(screen.getByText("0 B up / 0 B down / 1.17 KB total")).not.toBeNull();
    expect(screen.getAllByText("Measured").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Measured zero").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Collector disabled").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Not collected").length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole("button", { name: "Open Collection Trust subpage" }));

    expect(screen.getByLabelText("Collection anomaly candidates count 3")).not.toBeNull();
    expect(screen.getByText("1-3 of 3 items")).not.toBeNull();
    expect(screen.getAllByText("Over limit").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Receipt / collection pending").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("True 0 B").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Usage evidence needs review").length).toBeGreaterThanOrEqual(1);

    const renderedText = document.body.textContent ?? "";
    expect(renderedText).not.toMatch(/https?:\/\/|subscriptionUrl|token=|secret-value|password|yaml|edgecred_/i);
    expect(screen.queryByRole("button", { name: /Apply filters|Create|Disable|Pause|Archive|Activate|Apply/i })).toBeNull();
  });

  test("renders Usage & Channels fixture preview with receipt and collector states", () => {
    render(<SubscriptionUsageMonitorPage fixturePreviewEnabled />);

    expect(screen.getByLabelText("Collection Freshness fixture preview")).not.toBeNull();
    expect(screen.queryByText("Issued vs measured vs missing receipt blockers.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open Channel Evidence subpage" }));

    expect(screen.getAllByText("channel_safe_sgp_hy2").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Route latency").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("route_safe_tuic_recovery").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("agent_safe_sgp_02").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("route-latency-sample").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Missing receipt").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Pending receipt").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("table").length).toBeGreaterThanOrEqual(2);

    fireEvent.click(screen.getByRole("button", { name: "Open Usage Ledger subpage" }));

    expect(screen.getAllByText("sgp-hy2 · receipt pending").length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole("button", { name: "Open Collection Trust subpage" }));

    expect(screen.getAllByText("Receipt / collection pending").length).toBeGreaterThanOrEqual(1);
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
