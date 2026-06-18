import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
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
      "dashboard-next-actions"
    ]);

    expect(screen.queryByLabelText("Operations Overview page navigation")).toBeNull();
    expect(screen.queryByLabelText("Operations Overview card controls")).toBeNull();
    expect(screen.getByRole("button", { name: "Health Summary plugin settings" }).getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Risk Queue plugin settings" }));
    expect(screen.getByLabelText("Risk Queue plugin display controls")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Risk Queue Large plugin display" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Risk Queue Medium plugin display" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Risk Queue Small plugin display" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Risk Queue Hide plugin" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Risk Queue resize plugin display" })).not.toBeNull();

    expect(screen.getByRole("heading", { name: "Health Summary" })).not.toBeNull();
    expect(screen.getByLabelText("Monitoring container contract")).not.toBeNull();
    expect(screen.getAllByText("Overview metric widget set").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Platform health label and source note").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("heading", { name: "Risk Queue" })).not.toBeNull();
    expect(screen.getAllByLabelText("Audit / Workflow container contract").length).toBe(2);
    expect(screen.getAllByText("Reason taxonomy").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("heading", { name: "Next Actions" })).not.toBeNull();
    expect(screen.getAllByText("Wire route cards to section-level deep links after page modules are finalized.").length).toBeGreaterThanOrEqual(1);
    expect(document.querySelectorAll(".admin-blueprint-module-notes")).toHaveLength(3);
    expect(document.querySelectorAll(".admin-blueprint-module-card > .admin-blueprint-module-purpose")).toHaveLength(0);
    expect(document.querySelectorAll(".admin-blueprint-module-gate")).toHaveLength(0);
    expect(document.querySelectorAll(".admin-blueprint-library-next")).toHaveLength(0);
    expect(screen.getAllByText("Details")).toHaveLength(3);
    document.querySelectorAll(".admin-blueprint-module-notes").forEach((notes) => {
      expect(notes.hasAttribute("open")).toBe(false);
    });

    fireEvent.click(screen.getByRole("button", { name: "Open Accounts & Resources" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Usage & Channels" }));

    expect(onNavigate).toHaveBeenCalledWith("portalRequests");
    expect(onNavigate).toHaveBeenCalledWith("usageMonitor");
    expect(onRiskCountChange).toHaveBeenCalledWith(0);
    expect(document.body.textContent ?? "").not.toMatch(/subscriptionUrl|Bearer|token=|secret|password|yaml/i);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("Object timeline")).toBeNull();
    expect(screen.queryByText("Generate delivery preview")).toBeNull();
    expect(screen.queryByText("Save quota")).toBeNull();
  });

  test("supports card sizing, hiding, restoring, and drag ordering", () => {
    render(<DashboardPage onNavigate={vi.fn()} onRiskCountChange={vi.fn()} />);

    const riskSettingsButton = screen.getByRole("button", { name: "Risk Queue plugin settings" });
    expect(riskSettingsButton.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("switch", { name: "Edit workspace" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Risk Queue Small plugin display" })).toBeNull();
    fireEvent.click(riskSettingsButton);
    expect(riskSettingsButton.getAttribute("aria-expanded")).toBe("true");
    expect(screen.queryByText("Module Library")).toBeNull();
    expect(screen.queryByRole("button", { name: "Reset layout" })).toBeNull();
    expect(screen.queryByLabelText("Active module count")).toBeNull();
    expect(screen.queryByLabelText("Operations Overview card controls")).toBeNull();
    expect(screen.getByLabelText("Risk Queue plugin display controls")).not.toBeNull();
    expect(document.querySelector("#dashboard-risk-queue .admin-blueprint-card-inline-tools")).not.toBeNull();
    expect(document.querySelector(".admin-blueprint-card-switches")).toBeNull();
    expect(document.querySelector(".admin-blueprint-module-dock")).toBeNull();

    const riskResizeGrip = screen.getByRole("button", { name: "Risk Queue resize plugin display" });
    firePointerEvent(riskResizeGrip, "pointerdown", { button: 0, clientX: 100, clientY: 100, pointerId: 1 });
    firePointerEvent(riskResizeGrip, "pointermove", { clientX: 300, clientY: 100, pointerId: 1 });
    expect(document.querySelector("#dashboard-risk-queue")?.className).toContain("admin-blueprint-module-card-large");
    firePointerEvent(riskResizeGrip, "pointermove", { clientX: -120, clientY: 100, pointerId: 1 });
    expect(document.querySelector("#dashboard-risk-queue")?.className).toContain("admin-blueprint-module-card-small");
    firePointerEvent(riskResizeGrip, "pointerup", { clientX: -120, clientY: 100, pointerId: 1 });

    const riskResizeWest = screen.getByRole("button", { name: "Risk Queue resize w plugin display" });
    firePointerEvent(riskResizeWest, "pointerdown", { button: 0, clientX: 300, clientY: 100, pointerId: 2 });
    firePointerEvent(riskResizeWest, "pointermove", { clientX: -80, clientY: 100, pointerId: 2 });
    expect(document.querySelector("#dashboard-risk-queue")?.className).toContain("admin-blueprint-module-card-large");
    firePointerEvent(riskResizeWest, "pointerup", { clientX: -80, clientY: 100, pointerId: 2 });

    const riskResizeEast = screen.getByRole("button", { name: "Risk Queue resize e plugin display" });
    firePointerEvent(riskResizeEast, "pointerdown", { button: 0, clientX: 300, clientY: 100, pointerId: 3 });
    firePointerEvent(riskResizeEast, "pointermove", { clientX: -80, clientY: 100, pointerId: 3 });
    expect(document.querySelector("#dashboard-risk-queue")?.className).toContain("admin-blueprint-module-card-small");
    firePointerEvent(riskResizeEast, "pointerup", { clientX: -80, clientY: 100, pointerId: 3 });

    const riskResizeSouth = screen.getByRole("button", { name: "Risk Queue resize s plugin display" });
    firePointerEvent(riskResizeSouth, "pointerdown", { button: 0, clientX: 100, clientY: 100, pointerId: 4 });
    firePointerEvent(riskResizeSouth, "pointermove", { clientX: 100, clientY: 240, pointerId: 4 });
    expect(document.querySelector("#dashboard-risk-queue")?.className).toContain("admin-blueprint-module-card-height-tall");
    firePointerEvent(riskResizeSouth, "pointerup", { clientX: 100, clientY: 240, pointerId: 4 });

    const riskResizeNorth = screen.getByRole("button", { name: "Risk Queue resize n plugin display" });
    firePointerEvent(riskResizeNorth, "pointerdown", { button: 0, clientX: 100, clientY: 100, pointerId: 5 });
    firePointerEvent(riskResizeNorth, "pointermove", { clientX: 100, clientY: 340, pointerId: 5 });
    expect(document.querySelector("#dashboard-risk-queue")?.className).toContain("admin-blueprint-module-card-height-short");
    firePointerEvent(riskResizeNorth, "pointerup", { clientX: 100, clientY: 340, pointerId: 5 });

    fireEvent.click(screen.getByRole("button", { name: "Risk Queue Small plugin display" }));
    expect(document.querySelector("#dashboard-risk-queue")?.className).toContain("admin-blueprint-module-card-small");
    fireEvent.click(screen.getByRole("button", { name: "Risk Queue Hide plugin" }));
    expect(document.querySelector("#dashboard-risk-queue")).toBeNull();
    expect(screen.queryByRole("button", { name: "Open Risk Queue module" })).toBeNull();

    fireEvent(window, new CustomEvent("admin-open-module", {
      detail: {
        page: "dashboard",
        targetId: "dashboard-risk-queue"
      }
    }));
    expect(document.querySelector("#dashboard-risk-queue")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Health Summary plugin settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Health Summary Large plugin display" }));
    expect(document.querySelector("#dashboard-health-summary")?.className).toContain("admin-blueprint-module-card-large");
    fireEvent.click(screen.getByRole("button", { name: "Health Summary Hide plugin" }));
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

    const originalElementFromPoint = document.elementFromPoint;
    const healthSummaryCard = document.querySelector("#dashboard-health-summary") as HTMLElement;
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => healthSummaryCard)
    });
    const nextActionsMoveHandle = screen.getByRole("button", { name: "Next Actions move plugin" });
    firePointerEvent(nextActionsMoveHandle, "pointerdown", { button: 0, clientX: 320, clientY: 220, pointerId: 6 });
    firePointerEvent(nextActionsMoveHandle, "pointermove", { clientX: 60, clientY: 120, pointerId: 6 });
    firePointerEvent(nextActionsMoveHandle, "pointerup", { clientX: 60, clientY: 120, pointerId: 6 });
    expect(sectionAnchorOrder()[0]).toBe("dashboard-next-actions");
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: originalElementFromPoint
    });
  });

  test("persists workspace plugin layout locally across remounts", () => {
    render(<DashboardPage onNavigate={vi.fn()} onRiskCountChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Risk Queue plugin settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Risk Queue Large plugin display" }));
    const riskResizeSouth = screen.getByRole("button", { name: "Risk Queue resize s plugin display" });
    firePointerEvent(riskResizeSouth, "pointerdown", { button: 0, clientX: 100, clientY: 100, pointerId: 11 });
    firePointerEvent(riskResizeSouth, "pointermove", { clientX: 100, clientY: 240, pointerId: 11 });
    firePointerEvent(riskResizeSouth, "pointerup", { clientX: 100, clientY: 240, pointerId: 11 });

    fireEvent.click(screen.getByRole("button", { name: "Health Summary plugin settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Health Summary Hide plugin" }));

    const originalElementFromPoint = document.elementFromPoint;
    const riskQueueCard = document.querySelector("#dashboard-risk-queue") as HTMLElement;
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => riskQueueCard)
    });
    const nextActionsMoveHandle = screen.getByRole("button", { name: "Next Actions move plugin" });
    firePointerEvent(nextActionsMoveHandle, "pointerdown", { button: 0, clientX: 320, clientY: 220, pointerId: 12 });
    firePointerEvent(nextActionsMoveHandle, "pointermove", { clientX: 60, clientY: 120, pointerId: 12 });
    firePointerEvent(nextActionsMoveHandle, "pointerup", { clientX: 60, clientY: 120, pointerId: 12 });
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: originalElementFromPoint
    });

    expect(window.localStorage.getItem(WORKSPACE_LAYOUT_STORAGE_KEY)).toContain("risk-queue");
    cleanup();

    render(<DashboardPage onNavigate={vi.fn()} onRiskCountChange={vi.fn()} />);

    expect(sectionAnchorOrder()[0]).toBe("dashboard-next-actions");
    expect(document.querySelector("#dashboard-health-summary")).toBeNull();
    expect(document.querySelector("#dashboard-risk-queue")?.className).toContain("admin-blueprint-module-card-large");
    expect(document.querySelector("#dashboard-risk-queue")?.className).toContain("admin-blueprint-module-card-height-tall");

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
        version: 1,
        moduleOrder: ["missing-module", "risk-queue"],
        moduleLayout: {
          "missing-module": {
            height: "tall",
            size: "large",
            visible: true
          },
          "next-actions": {
            height: "tall",
            size: "large",
            visible: true
          },
          "risk-queue": {
            height: "overgrown",
            size: "wide",
            visible: true
          }
        }
      }
    }));

    render(<DashboardPage onNavigate={vi.fn()} onRiskCountChange={vi.fn()} />);

    expect(sectionAnchorOrder()).toEqual([
      "dashboard-risk-queue",
      "dashboard-health-summary",
      "dashboard-next-actions"
    ]);
    expect(document.querySelector("#dashboard-risk-queue")?.className).toContain("admin-blueprint-module-card-medium");
    expect(document.querySelector("#dashboard-risk-queue")?.className).toContain("admin-blueprint-module-card-height-medium");
    expect(document.querySelector("#dashboard-next-actions")?.className).toContain("admin-blueprint-module-card-large");
    expect(document.querySelector("#dashboard-next-actions")?.className).toContain("admin-blueprint-module-card-height-tall");
  });
});

function sectionAnchorOrder() {
  return Array.from(document.querySelectorAll(".page-anchor-group"))
    .map((element) => element.id);
}

function firePointerEvent(
  element: Element,
  type: string,
  init: Record<string, number>
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, init);
  fireEvent(element, event);
}
