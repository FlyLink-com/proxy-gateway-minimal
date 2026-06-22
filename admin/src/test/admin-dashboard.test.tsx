import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { WORKSPACE_LAYOUT_VERSION } from "../app/plugin-layout-store";
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
    expect(screen.getByText("Overview / Operations Overview")).not.toBeNull();
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
      "dashboard-owner-handoff"
    ]);

    expect(screen.queryByLabelText("Operations Overview page navigation")).toBeNull();
    expect(screen.queryByLabelText("Operations Overview card controls")).toBeNull();
    expect(screen.getByRole("button", { name: "Health Summary hide module" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Risk Queue hide module" })).not.toBeNull();
    expect(screen.queryByLabelText("Risk Queue plugin display controls")).toBeNull();
    expect(screen.queryByRole("button", { name: "Risk Queue Large plugin display" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Risk Queue Medium plugin display" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Risk Queue Small plugin display" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Risk Queue resize plugin display" })).toBeNull();

    expect(screen.getByLabelText("Monitoring panel")).not.toBeNull();
    expect(document.querySelector("#dashboard-health-summary")?.getAttribute("data-ui-role")).toBe("panel");
    expect(document.querySelector("#dashboard-health-summary")?.getAttribute("data-chrome")).toBe("operator");
    expect(document.querySelector("#dashboard-health-summary")?.getAttribute("data-figma-component")).toBe("PanelFrame");
    expect(document.querySelector("#dashboard-health-summary")?.getAttribute("data-ui-surface")).toBe("panel-frame");
    expect(document.querySelector("#dashboard-health-summary")?.getAttribute("data-owner-mode")).toBe("preview");
    expect(screen.queryByText("Overview metric widget set")).toBeNull();
    expect(screen.getByLabelText("Operations Overview static health content")).not.toBeNull();
    expect(document.querySelectorAll("#dashboard-health-summary [data-figma-component='MetricCard'][data-ui-surface='metric-card']")).toHaveLength(4);
    expect(document.querySelectorAll("#dashboard-health-summary .admin-overview-metric-card")).toHaveLength(0);
    expect(screen.getByText("Platform health")).not.toBeNull();
    expect(screen.getByText("Good")).not.toBeNull();
    expect(screen.getByText("Good · reviewable · latest source safe")).not.toBeNull();
    expect(screen.getByText("Channel coverage")).not.toBeNull();
    expect(screen.getByText("98.6%")).not.toBeNull();
    expect(screen.getByText("Disconnected keeps layout")).not.toBeNull();
    expect(screen.queryByText("Platform health · summary state")).toBeNull();
    expect(screen.queryByText("First-screen operator view for platform health, risk routing, and the next owner page.")).toBeNull();
    expect(screen.getByRole("heading", { name: "Risk Queue" })).not.toBeNull();
    expect(screen.getAllByLabelText("Audit / Workflow panel").length).toBe(3);
    expect(screen.getByText("Computed review candidates. No case close, approval, or mutation action here.")).not.toBeNull();
    expect(screen.getByText("All 18")).not.toBeNull();
    expect(screen.getByText("High 5")).not.toBeNull();
    expect(screen.getByText("Order traffic over limit")).not.toBeNull();
    expect(screen.getByText("12 affected")).not.toBeNull();
    expect(screen.queryByText("Reason · quota / delay / receipt")).toBeNull();
    expect(screen.getByRole("heading", { name: "Next Actions" })).not.toBeNull();
    expect(screen.getByLabelText("Overview owner page routing content")).not.toBeNull();
    expect(screen.getByText("Audit & Cases locked")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Owner Page Handoff" })).not.toBeNull();
    expect(screen.getByLabelText("Overview owner handoff")).not.toBeNull();
    expect(screen.getByText("Decision owner for accounts, orders, quotas, and lifecycle.")).not.toBeNull();
    expect(screen.getByText("Evidence owner for collection freshness, coverage, receipts, and anomalies.")).not.toBeNull();
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

    fireEvent.click(screen.getByRole("button", { name: /Open Accounts & Resources/ }));
    fireEvent.click(screen.getByRole("button", { name: /Open Usage & Channels/ }));

    expect(onNavigate).toHaveBeenCalledWith("portalRequests");
    expect(onNavigate).toHaveBeenCalledWith("usageMonitor");
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
    expect(document.querySelector("#dashboard-health-summary")?.getAttribute("data-chrome")).toBe("operator");
    expect(screen.queryByText("Metric cards for platform health, risk candidates, freshness, and channel coverage.")).toBeNull();
    expect(screen.getByText("2m 14s · stale threshold visible")).not.toBeNull();
    expect(screen.getByText("Order traffic over limit")).not.toBeNull();
    expect(screen.getAllByText("Accounts & Resources").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText("Overview owner handoff")).not.toBeNull();
    expect(screen.queryByText("Overview summarizes and routes; owner pages hold detailed collections.")).toBeNull();
    expect(onRiskCountChange).toHaveBeenCalledWith(2);

    const renderedText = document.body.textContent ?? "";
    expect(renderedText).not.toMatch(/https?:\/\/|subscriptionUrl|token=|secret-value|password|yaml|edgecred_/i);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("button", { name: /Approve|Disable|Archive|Apply/i })).toBeNull();
  });

  test("supports fixed panel hiding and restoring without sizing or drag controls", () => {
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
    expect(document.querySelector("#dashboard-risk-queue")?.className).toContain("admin-blueprint-module-panel");

    fireEvent.click(screen.getByRole("button", { name: "Risk Queue hide module" }));
    expect(document.querySelector("#dashboard-risk-queue")).toBeNull();
    expect(screen.queryByRole("button", { name: "Open Risk Queue module" })).toBeNull();

    fireEvent(window, new CustomEvent("admin-open-module", {
      detail: {
        page: "dashboard",
        targetId: "dashboard-risk-queue"
      }
    }));
    expect(document.querySelector("#dashboard-risk-queue")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Health Summary hide module" }));
    expect(document.querySelector("#dashboard-health-summary")).toBeNull();
    expect(screen.queryByRole("button", { name: "Open Health Summary module" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Show Health Summary in workspace" })).toBeNull();

    fireEvent(window, new CustomEvent("admin-open-module", {
      detail: {
        page: "dashboard",
        targetId: "dashboard-health-summary"
      }
    }));
    expect(document.querySelector("#dashboard-health-summary")).not.toBeNull();
  });

  test("persists fixed panel visibility locally across remounts", () => {
    render(<DashboardPage onNavigate={vi.fn()} onRiskCountChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Health Summary hide module" }));

    expect(window.localStorage.getItem(WORKSPACE_LAYOUT_STORAGE_KEY)).toContain("health-summary");
    const storedLayout = JSON.parse(window.localStorage.getItem(WORKSPACE_LAYOUT_STORAGE_KEY) ?? "{}");
    expect(storedLayout.dashboard.moduleOrder).toBeUndefined();
    expect(storedLayout.dashboard.moduleLayout["health-summary"]).toEqual({
      visible: false
    });
    cleanup();

    render(<DashboardPage onNavigate={vi.fn()} onRiskCountChange={vi.fn()} />);

    expect(sectionAnchorOrder()).toEqual([
      "dashboard-risk-queue",
      "dashboard-next-actions",
      "dashboard-owner-handoff"
    ]);
    expect(document.querySelector("#dashboard-health-summary")).toBeNull();
    expect(document.querySelector("#dashboard-risk-queue")?.className).toContain("admin-blueprint-module-panel");

    fireEvent(window, new CustomEvent("admin-open-module", {
      detail: {
        page: "dashboard",
        targetId: "dashboard-health-summary"
      }
    }));
    expect(document.querySelector("#dashboard-health-summary")).not.toBeNull();
  });

  test("merges stored workspace layout with the current module list", () => {
    window.localStorage.setItem(WORKSPACE_LAYOUT_STORAGE_KEY, JSON.stringify({
      dashboard: {
        version: WORKSPACE_LAYOUT_VERSION,
        moduleOrder: ["missing-module", "risk-queue"],
        moduleLayout: {
          "missing-module": {
            visible: true
          },
          "next-actions": {
            visible: true
          },
          "risk-queue": {
            visible: true
          }
        }
      }
    }));

    render(<DashboardPage onNavigate={vi.fn()} onRiskCountChange={vi.fn()} />);

    expect(sectionAnchorOrder()).toEqual([
      "dashboard-health-summary",
      "dashboard-risk-queue",
      "dashboard-next-actions",
      "dashboard-owner-handoff"
    ]);
    expect(document.querySelector("#dashboard-risk-queue")?.className).toContain("admin-blueprint-module-panel");
    expect(document.querySelector("#dashboard-next-actions")?.className).toContain("admin-blueprint-module-panel");
    expect(document.querySelector("#dashboard-owner-handoff")?.className).toContain("admin-blueprint-module-panel");
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
      "dashboard-owner-handoff"
    ]);
    expect(document.querySelector("#dashboard-health-summary")?.getAttribute("data-size")).toBeNull();
    expect(document.querySelector("#dashboard-health-summary")?.getAttribute("data-height")).toBeNull();
    expect(document.querySelector("#dashboard-health-summary")?.getAttribute("data-ui-surface")).toBe("panel-frame");
    expect(document.querySelector("#dashboard-risk-queue")?.getAttribute("data-size")).toBeNull();
    expect(document.querySelector("#dashboard-risk-queue")?.getAttribute("data-height")).toBeNull();
    expect(document.querySelector("#dashboard-next-actions")).not.toBeNull();
    expect(document.querySelector("#dashboard-owner-handoff")).not.toBeNull();
  });
});

function sectionAnchorOrder() {
  return Array.from(document.querySelectorAll(".page-anchor-group"))
    .map((element) => element.id);
}
