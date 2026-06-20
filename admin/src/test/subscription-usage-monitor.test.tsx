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
    expect(screen.queryByRole("button", { name: "Card settings" })).toBeNull();
    expect(screen.queryByRole("switch", { name: "Edit workspace" })).toBeNull();
    expect(screen.queryByLabelText("Usage & Channels status dashboard")).toBeNull();
    expect(screen.queryByLabelText("Active module count")).toBeNull();
    expect(screen.queryByLabelText("Usage & Channels workspace editor")).toBeNull();
    expect(screen.queryByLabelText("Usage & Channels layout controls")).toBeNull();
    expect(screen.queryByText("Module Library")).toBeNull();
    expect(screen.queryByText("Page design notes")).toBeNull();
    expect(document.querySelector(".admin-blueprint-edit-zone")).toBeNull();
    expect(sectionAnchorOrder()).toEqual([
      "platform-monitoring-freshness",
      "platform-monitoring-channel-coverage",
      "platform-monitoring-usage-ledger",
      "platform-monitoring-anomalies",
      "platform-monitoring-receipts-collectors"
    ]);

    expect(screen.queryByLabelText("Usage & Channels page navigation")).toBeNull();
    expect(screen.queryByLabelText("Usage & Channels card controls")).toBeNull();
    expect(screen.getByRole("button", { name: "Collection Freshness plugin settings" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Channel Coverage plugin settings" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Usage Ledger plugin settings" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Collection Anomalies plugin settings" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Receipts & Collectors plugin settings" })).not.toBeNull();

    expect(screen.getByRole("heading", { name: "Collection Freshness" })).not.toBeNull();
    expect(screen.getAllByLabelText("Monitoring container contract").length).toBe(4);
    expect(screen.getByLabelText("Platform Tools container contract")).not.toBeNull();
    expect(screen.getAllByText("Safe diagnostics entry panel").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Latest observed usage age").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("heading", { name: "Channel Coverage" })).not.toBeNull();
    expect(screen.getAllByText("Measured channel count").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("heading", { name: "Usage Ledger" })).not.toBeNull();
    expect(screen.getAllByText("Upload / download / total").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("heading", { name: "Collection Anomalies" })).not.toBeNull();
    expect(screen.getAllByText("Missing receipt").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("heading", { name: "Receipts & Collectors" })).not.toBeNull();
    expect(screen.getAllByText("Collector availability").length).toBeGreaterThanOrEqual(1);
    expect(document.querySelectorAll(".admin-blueprint-module-notes")).toHaveLength(5);
    document.querySelectorAll(".admin-blueprint-module-notes").forEach((notes) => {
      expect(notes.hasAttribute("open")).toBe(false);
    });

    const renderedText = document.body.textContent ?? "";
    expect(renderedText).not.toMatch(/subscriptionUrl|token=|secret-value|password|yaml|edgecred_/i);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("img", { name: /usage chart/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Apply filters|Create|Disable|Pause|Archive|Activate|Apply/i })).toBeNull();
  });
});

function sectionAnchorOrder() {
  return Array.from(document.querySelectorAll(".page-anchor-group"))
    .map((element) => element.id);
}
