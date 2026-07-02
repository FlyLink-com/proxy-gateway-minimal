import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ADMIN_TABLE_QUERY_STATE_SCHEMA } from "../app/admin-table-query-state";
import { OPERATIONS_OVERVIEW_OWNER_MODEL_SCHEMA } from "../app/operations-overview-owner-model";
import { DashboardPage } from "../pages/dashboard-page";

const WORKSPACE_LAYOUT_STORAGE_KEY = "globalcircle-admin-workspace-layout-v1";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("admin dashboard page", () => {
  test("renders a clean operations overview structure without old detail collections", () => {
    const onNavigate = vi.fn();
    const onRiskCountChange = vi.fn();

    render(<DashboardPage onNavigate={onNavigate} onRiskCountChange={onRiskCountChange} />);

    expect(screen.getByRole("heading", { name: "Operations Overview" })).not.toBeNull();
    expect(screen.getByText("Operations Overview / Operator Control Surface")).not.toBeNull();
    expect(screen.getByLabelText("Operations Overview page header")).not.toBeNull();
    expect(document.querySelector(".admin-blueprint-page")?.getAttribute("data-ui-contract")).toBe("page-frame");
    expect(document.querySelector(".admin-blueprint-page")?.getAttribute("data-density")).toBe("normal");
    expect(document.querySelector(".admin-blueprint-page")?.getAttribute("data-page-id")).toBe("dashboard");
    expect(document.querySelector(".admin-blueprint-page")?.getAttribute("data-layout")).toBe("dashboard");
    expect(document.querySelector(".admin-blueprint-page")?.getAttribute("data-ui-role")).toBe("workspace");
    expect(document.querySelector(".admin-blueprint-page")?.getAttribute("data-mobile-projection")).toBe("single-column-review-flow");
    expect(document.querySelector(".admin-blueprint-page")?.getAttribute("data-required-blocks")).toContain("owner-action");
    expect(screen.queryByRole("button", { name: "Card settings" })).toBeNull();
    expect(screen.queryByRole("switch", { name: "Edit workspace" })).toBeNull();
    expect(screen.queryByLabelText("Operations Overview status dashboard")).toBeNull();
    expect(screen.queryByLabelText("Active module count")).toBeNull();
    expect(screen.queryByLabelText("Operations Overview workspace editor")).toBeNull();
    expect(screen.queryByLabelText("Operations Overview layout controls")).toBeNull();
    expect(screen.queryByText("Module Library")).toBeNull();
    expect(screen.queryByText("Page design notes")).toBeNull();
    expect(screen.queryByText("Frontend Container System")).toBeNull();
    expect(document.querySelector(".admin-blueprint-edit-zone")).toBeNull();
    expect(sectionAnchorOrder()).toEqual([
      "dashboard-health-summary",
      "dashboard-risk-queue",
      "dashboard-next-actions",
      "dashboard-review-candidates"
    ]);

    expect(screen.queryByLabelText("Operations Overview page navigation")).toBeNull();
    expect(screen.queryByLabelText("Operations Overview card controls")).toBeNull();
    expect(screen.queryByRole("button", { name: "Health Summary hide module" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Risk Queue hide module" })).toBeNull();
    expect(screen.queryByLabelText("Risk Queue plugin display controls")).toBeNull();
    expect(screen.queryByRole("button", { name: "Risk Queue Large plugin display" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Risk Queue Medium plugin display" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Risk Queue Small plugin display" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Risk Queue resize plugin display" })).toBeNull();

    expect(screen.getByLabelText("Operations Overview summary metrics")).not.toBeNull();
    expect(document.querySelector("#dashboard-health-summary")?.getAttribute("data-ui-role")).toBe("summary");
    expect(document.querySelector("#dashboard-health-summary")?.getAttribute("data-chrome")).toBeNull();
    expect(document.querySelector("#dashboard-health-summary")?.getAttribute("data-figma-component")).toBe("MetricGroup");
    expect(document.querySelector("#dashboard-health-summary")?.getAttribute("data-ui-surface")).toBe("summary-metrics");
    expect(document.querySelector("#dashboard-health-summary")?.getAttribute("data-owner-mode")).toBeNull();
    expect(screen.queryByText("Overview metric widget set")).toBeNull();
    expect(screen.getByLabelText("Operations Overview owner model content")).not.toBeNull();
    expect(screen.getByLabelText("Operations Overview evidence surfaces")).not.toBeNull();
    expect(screen.getByLabelText("Platform Metrics evidence panel")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Platform Metrics" })).not.toBeNull();
    expect(screen.getByRole("img", { name: "Platform Metrics safe trend" })).not.toBeNull();
    expect(screen.getByLabelText("Platform Event Log evidence panel")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Platform Event Log" })).not.toBeNull();
    expect(screen.getByText("Risk queue updated")).not.toBeNull();
    expect(screen.getByText("Owner route verified")).not.toBeNull();
    expect(screen.getByText("Collection evidence fresh")).not.toBeNull();
    expect(screen.queryByText("Design static")).toBeNull();
    expect(screen.queryByText("7-point design placeholder")).toBeNull();
    expect(screen.queryByText("safe-summary-only")).toBeNull();
    expect(screen.queryByText("safe-events-only")).toBeNull();
    expect(document.querySelectorAll("[data-figma-component='EvidenceSurface'][data-ui-surface='evidence-row']")).toHaveLength(2);
    expect(document.querySelectorAll("#dashboard-health-summary [data-figma-component='MetricCard'][data-ui-surface='metric-card']")).toHaveLength(4);
    expect(document.querySelectorAll("#dashboard-health-summary [data-figma-component='MetricCard'] > [data-figma-component='StatusChip'][data-ui-surface='status-chip']")).toHaveLength(4);
    expect(document.querySelector("#dashboard-health-summary .admin-static-status-row")).toBeNull();
    expect(screen.queryByLabelText("Overview source states")).toBeNull();
    expect(document.querySelectorAll("#dashboard-health-summary .admin-overview-metric-card")).toHaveLength(0);
    expect(document.querySelectorAll(".admin-overview-section-card")).toHaveLength(0);
    expect(document.querySelectorAll(".admin-overview-table-row")).toHaveLength(0);
    expect(document.querySelectorAll(".admin-overview-action-card")).toHaveLength(0);
    expect(document.querySelectorAll(".admin-overview-handoff")).toHaveLength(0);
    expect(document.querySelectorAll(".admin-overview-handoff-card")).toHaveLength(0);
    expect(document.querySelectorAll("[data-figma-component='DataRowCompact'][data-ui-surface='compact-row']")).toHaveLength(6);
    expect(document.querySelectorAll(".admin-overview-compact-stack .admin-compact-data-row-action")).toHaveLength(0);
    expect(screen.getByText("Platform health")).not.toBeNull();
    expect(screen.getAllByText("Good").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Ready for review")).not.toBeNull();
    expect(screen.getAllByText("Coverage").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("98.6%")).not.toBeNull();
    expect(screen.queryByText("Readonly")).toBeNull();
    expect(screen.queryByText("Stale guard visible")).toBeNull();
    expect(screen.queryByText("Disconnected keeps layout")).toBeNull();
    expect(screen.queryByText("No production action")).toBeNull();
    expect(screen.queryByText("Platform health · summary state")).toBeNull();
    expect(screen.queryByText("First-screen operator view for platform health, risk routing, and the next owner page.")).toBeNull();
    expect(screen.getByRole("heading", { name: "Risk queue" })).not.toBeNull();
    expect(screen.getAllByLabelText("Audit / Workflow panel").length).toBe(3);
    expect(screen.getByText("Cases ranked by owner route")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "All 18" })).toBeNull();
    expect(screen.getByText("case_012")).not.toBeNull();
    expect(screen.getByText("SLA 4m")).not.toBeNull();
    expect(screen.getByText("case_017")).not.toBeNull();
    expect(screen.queryByText("Reason · quota / delay / receipt")).toBeNull();
    expect(screen.getByRole("heading", { name: "Next actions" })).not.toBeNull();
    expect(screen.getByLabelText("Overview owner page routing content")).not.toBeNull();
    expect(screen.getByText("Route handoff for reviewers")).not.toBeNull();
    expect(screen.getByText("handoff")).not.toBeNull();
    expect(screen.getByText("refresh")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Review candidates" })).not.toBeNull();
    expect(screen.getByLabelText("Overview review candidates")).not.toBeNull();
    expect(screen.getByText("Items requiring operator check")).not.toBeNull();
    expect(screen.getByText("ord_2048")).not.toBeNull();
    expect(screen.getByText("acct_002")).not.toBeNull();
    expect(screen.queryByText("Owner Page Handoff")).toBeNull();
    expect(screen.queryByText("Audit Center")).toBeNull();
    expect(screen.queryByText("Log Access")).toBeNull();
    expect(screen.queryByText("Key Management")).toBeNull();
    expect(screen.queryByText("Wire panel routes to section-level deep links after page modules are finalized.")).toBeNull();
    expect(document.querySelectorAll(".admin-blueprint-module-notes")).toHaveLength(0);
    expect(document.querySelectorAll(".admin-blueprint-module-panel > .admin-blueprint-module-purpose")).toHaveLength(0);
    expect(document.querySelectorAll(".admin-blueprint-module-gate")).toHaveLength(0);
    expect(document.querySelectorAll(".admin-blueprint-library-next")).toHaveLength(0);
    expect(screen.queryByText("Details")).toBeNull();
    document.querySelectorAll(".admin-blueprint-module-notes").forEach((notes) => {
      expect(notes.hasAttribute("open")).toBe(false);
    });

    fireEvent.click(screen.getByRole("button", { name: /handoff/ }));
    fireEvent.click(screen.getByRole("button", { name: /refresh/ }));

    expect(onNavigate).toHaveBeenCalledWith("portalRequests", "account-overview");
    expect(onNavigate).toHaveBeenCalledWith("usageMonitor", "freshness");
    expect(onRiskCountChange).toHaveBeenCalledWith(0);
    expect(document.body.textContent ?? "").not.toMatch(/subscriptionUrl|Bearer|token=|secret|password|yaml/i);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("Object timeline")).toBeNull();
    expect(screen.queryByText("Generate delivery preview")).toBeNull();
    expect(screen.queryByText("Save quota")).toBeNull();
  });

  test("keeps fixture preview route in operator chrome without nested preview rows", () => {
    const onRiskCountChange = vi.fn();

    render(<DashboardPage fixturePreviewEnabled onNavigate={vi.fn()} onRiskCountChange={onRiskCountChange} />);

    expect(screen.queryByLabelText("Health Summary fixture preview")).toBeNull();
    expect(document.querySelector("#dashboard-health-summary")?.getAttribute("data-ui-role")).toBe("summary");
    expect(document.querySelector("#dashboard-health-summary")?.getAttribute("data-ui-surface")).toBe("summary-metrics");
    expect(screen.queryByText("Metric cards for platform health, risk candidates, freshness, and channel coverage.")).toBeNull();
    expect(screen.getByText("P95 sample age")).not.toBeNull();
    expect(screen.getByText("case_012")).not.toBeNull();
    expect(screen.getByText("handoff")).not.toBeNull();
    expect(screen.getByLabelText("Overview review candidates")).not.toBeNull();
    expect(screen.queryByText("Overview summarizes and routes; owner pages hold detailed collections.")).toBeNull();
    expect(onRiskCountChange).toHaveBeenCalledWith(2);

    const renderedText = document.body.textContent ?? "";
    expect(renderedText).not.toMatch(/https?:\/\/|subscriptionUrl|token=|secret-value|password|yaml|edgecred_/i);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("button", { name: /Approve|Disable|Archive|Apply/i })).toBeNull();
  });

  test("renders visible Operations modules from the unified owner/query model", () => {
    render(<DashboardPage onNavigate={vi.fn()} onRiskCountChange={vi.fn()} />);

    expect(document.querySelectorAll(
      `[data-owner-model-schema='${OPERATIONS_OVERVIEW_OWNER_MODEL_SCHEMA}']`
    )).toHaveLength(4);
    expect(screen.getByLabelText("Operations Overview owner model content")).not.toBeNull();
    expect(screen.queryByLabelText("Operations Overview static health content")).toBeNull();

    const riskQueue = document.querySelector("#dashboard-risk-queue [data-owner-model-schema]");
    const reviewCandidates = document.querySelector("#dashboard-review-candidates [data-owner-model-schema]");
    const healthSummary = document.querySelector("#dashboard-health-summary");
    const nextActions = document.querySelector("#dashboard-next-actions [data-owner-model-schema]");

    expect(healthSummary?.getAttribute("data-section-nav-id")).toBe("health-summary");
    expect(nextActions?.getAttribute("data-section-nav-id")).toBe("next-actions");
    expect(healthSummary?.hasAttribute("data-query-schema")).toBe(false);
    expect(nextActions?.hasAttribute("data-query-schema")).toBe(false);
    expect(riskQueue?.getAttribute("data-query-schema")).toBe(ADMIN_TABLE_QUERY_STATE_SCHEMA);
    expect(riskQueue?.getAttribute("data-route-scope")).toBe("dashboard#dashboard-risk-queue");
    expect(riskQueue?.getAttribute("data-result-window")).toBe("1-2/2");
    expect(reviewCandidates?.getAttribute("data-query-schema")).toBe(ADMIN_TABLE_QUERY_STATE_SCHEMA);
    expect(reviewCandidates?.getAttribute("data-route-scope")).toBe("dashboard#dashboard-review-candidates");
    expect(reviewCandidates?.getAttribute("data-result-window")).toBe("1-2/2");
  });

  test("does not render legacy panel hiding, sizing, or drag controls", () => {
    render(<DashboardPage onNavigate={vi.fn()} onRiskCountChange={vi.fn()} />);

    expect(screen.queryByRole("switch", { name: "Edit workspace" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Risk Queue Small plugin display" })).toBeNull();
    expect(screen.queryByText("Module Library")).toBeNull();
    expect(screen.queryByRole("button", { name: "Reset layout" })).toBeNull();
    expect(screen.queryByLabelText("Active module count")).toBeNull();
    expect(screen.queryByLabelText("Operations Overview card controls")).toBeNull();
    expect(screen.queryByLabelText("Risk Queue plugin display controls")).toBeNull();
    expect(document.querySelector("#dashboard-risk-queue .admin-blueprint-module-panel-meta")).toBeNull();
    expect(document.querySelector("#dashboard-risk-queue")?.getAttribute("data-chrome")).toBe("operator");
    expect(document.querySelector(".admin-blueprint-panel-display-controls")).toBeNull();
    expect(document.querySelector(".admin-blueprint-module-dock")).toBeNull();
    expect(screen.queryByRole("button", { name: "Next Actions move plugin" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Risk Queue hide module" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Health Summary hide module" })).toBeNull();
    expect(document.querySelector("#dashboard-risk-queue")?.className).toContain("admin-blueprint-module-panel");
    expect(document.querySelector("#dashboard-health-summary")).not.toBeNull();
    expect(document.querySelector("#dashboard-risk-queue")).not.toBeNull();
  });

  test("ignores stale workspace visibility cache from the retired hide-module UI", () => {
    window.localStorage.setItem(WORKSPACE_LAYOUT_STORAGE_KEY, JSON.stringify({
      dashboard: {
        version: 4,
        moduleOrder: ["missing-module", "risk-queue"],
        moduleLayout: {
          "missing-module": {
            visible: true
          },
          "next-actions": {
            visible: false
          },
          "risk-queue": {
            visible: false
          }
        }
      }
    }));

    render(<DashboardPage onNavigate={vi.fn()} onRiskCountChange={vi.fn()} />);

    expect(sectionAnchorOrder()).toEqual([
      "dashboard-health-summary",
      "dashboard-risk-queue",
      "dashboard-next-actions",
      "dashboard-review-candidates"
    ]);
    expect(document.querySelector("#dashboard-risk-queue")?.className).toContain("admin-blueprint-module-panel");
    expect(document.querySelector("#dashboard-next-actions")?.className).toContain("admin-blueprint-module-panel");
    expect(document.querySelector("#dashboard-review-candidates")?.className).toContain("admin-blueprint-module-panel");
  });

  test("resets pre-visual-foundation layout cache to the current default modules", () => {
    window.localStorage.setItem(WORKSPACE_LAYOUT_STORAGE_KEY, JSON.stringify({
      dashboard: {
        version: 1,
        moduleOrder: ["health-summary", "risk-queue"],
        moduleLayout: {
          "health-summary": {
            visible: true
          },
          "risk-queue": {
            visible: true
          },
          "next-actions": {
            visible: false
          }
        }
      }
    }));

    render(<DashboardPage onNavigate={vi.fn()} onRiskCountChange={vi.fn()} />);

    expect(sectionAnchorOrder()).toEqual([
      "dashboard-health-summary",
      "dashboard-risk-queue",
      "dashboard-next-actions",
      "dashboard-review-candidates"
    ]);
    expect(document.querySelector("#dashboard-health-summary")?.getAttribute("data-size")).toBeNull();
    expect(document.querySelector("#dashboard-health-summary")?.getAttribute("data-height")).toBeNull();
    expect(document.querySelector("#dashboard-health-summary")?.getAttribute("data-ui-surface")).toBe("summary-metrics");
    expect(document.querySelector("#dashboard-risk-queue")?.getAttribute("data-size")).toBeNull();
    expect(document.querySelector("#dashboard-risk-queue")?.getAttribute("data-height")).toBeNull();
    expect(document.querySelector("#dashboard-next-actions")).not.toBeNull();
    expect(document.querySelector("#dashboard-review-candidates")).not.toBeNull();
  });
});

function sectionAnchorOrder() {
  return Array.from(document.querySelectorAll(".page-anchor-group"))
    .map((element) => element.id);
}
