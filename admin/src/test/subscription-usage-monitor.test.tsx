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
    expect(screen.getByRole("button", { name: "Collection Freshness hide module" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Channel Coverage hide module" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Usage Ledger hide module" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Collection Anomalies hide module" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Receipts & Collectors hide module" })).not.toBeNull();

    expect(screen.getByRole("heading", { name: "Collection Freshness" })).not.toBeNull();
    expect(screen.getAllByLabelText("Monitoring panel").length).toBe(4);
    expect(screen.getByLabelText("Platform Tools panel")).not.toBeNull();
    expect(screen.getAllByText("Safe diagnostics entry panel").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText("Collection Freshness static operator content")).not.toBeNull();
    expect(screen.getByText("Collection state")).not.toBeNull();
    expect(screen.getAllByText("Collector disabled").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Latest usage · observed age")).toBeNull();
    expect(screen.queryByText("Evidence owner for usage collection trust, channel coverage, receipts, collectors, and collection anomalies.")).toBeNull();
    expect(screen.getByRole("heading", { name: "Channel Coverage" })).not.toBeNull();
    expect(screen.getByLabelText("Channel Coverage static table")).not.toBeNull();
    expect(screen.getAllByText("channel_safe_sgp_hy2").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Pending receipt").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Measured channels · count")).toBeNull();
    expect(screen.getByRole("heading", { name: "Usage Ledger" })).not.toBeNull();
    expect(screen.getByLabelText("Usage Ledger static table")).not.toBeNull();
    expect(screen.getByText("Measured zero")).not.toBeNull();
    expect(screen.getByText("Not collected")).not.toBeNull();
    expect(screen.queryByText("Traffic · upload / download / total")).toBeNull();
    expect(screen.getByRole("heading", { name: "Collection Anomalies" })).not.toBeNull();
    expect(screen.getAllByText("Missing receipt").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("heading", { name: "Receipts & Collectors" })).not.toBeNull();
    expect(screen.getByLabelText("Receipts and Collectors static operator content")).not.toBeNull();
    expect(screen.getByText("Receipt gaps stay visible without exposing protected runtime material.")).not.toBeNull();
    expect(screen.queryByText("Collectors · availability")).toBeNull();
    expect(document.querySelectorAll(".admin-blueprint-module-notes")).toHaveLength(0);
    document.querySelectorAll(".admin-blueprint-module-notes").forEach((notes) => {
      expect(notes.hasAttribute("open")).toBe(false);
    });

    const renderedText = document.body.textContent ?? "";
    expect(renderedText).not.toMatch(/subscriptionUrl|token=|secret-value|password|yaml|edgecred_/i);
    expect(screen.getAllByRole("table").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole("img", { name: /usage chart/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Apply filters|Create|Disable|Pause|Archive|Activate|Apply/i })).toBeNull();
  });

  test("renders Usage & Channels fixture preview with receipt and collector states", () => {
    render(<SubscriptionUsageMonitorPage fixturePreviewEnabled />);

    expect(screen.getByLabelText("Collection Freshness fixture preview")).not.toBeNull();
    expect(screen.queryByText("Issued vs measured vs missing receipt blockers.")).toBeNull();
    expect(screen.getAllByText("sgp-hy2 · receipt pending").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Missing receipt").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Pending receipt").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Raw runtime config and logs are excluded.")).toBeNull();

    const renderedText = document.body.textContent ?? "";
    expect(renderedText).not.toMatch(/https?:\/\/|subscriptionUrl|token=|secret-value|password|yaml|edgecred_/i);
    expect(screen.getAllByRole("table").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole("button", { name: /Apply filters|Create|Disable|Pause|Archive|Activate|Apply/i })).toBeNull();
  });
});

function sectionAnchorOrder() {
  return Array.from(document.querySelectorAll(".page-anchor-group"))
    .map((element) => element.id);
}
