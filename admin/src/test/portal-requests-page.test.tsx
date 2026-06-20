import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { PortalRequestsPage } from "../pages/portal-requests-page";

afterEach(() => {
  cleanup();
});

describe("portal requests page", () => {
  test("renders Accounts & Resources as a clean user operations structure", () => {
    render(<PortalRequestsPage />);

    expect(screen.getByRole("heading", { name: "Accounts & Resources" })).not.toBeNull();
    expect(screen.getByText("User Operations / Accounts & Resources")).not.toBeNull();
    expect(screen.getByLabelText("Accounts & Resources page header")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Card settings" })).toBeNull();
    expect(screen.queryByRole("switch", { name: "Edit workspace" })).toBeNull();
    expect(screen.queryByLabelText("Accounts & Resources status dashboard")).toBeNull();
    expect(screen.queryByLabelText("Active module count")).toBeNull();
    expect(screen.queryByLabelText("Accounts & Resources workspace editor")).toBeNull();
    expect(screen.queryByLabelText("Accounts & Resources layout controls")).toBeNull();
    expect(screen.queryByText("Module Library")).toBeNull();
    expect(screen.queryByText("Page design notes")).toBeNull();
    expect(document.querySelector(".admin-blueprint-edit-zone")).toBeNull();
    expect(sectionAnchorOrder()).toEqual([
      "user-supervision-account-overview",
      "user-supervision-resource-orders",
      "user-supervision-quota-usage",
      "user-supervision-lifecycle",
      "user-supervision-history-events"
    ]);

    expect(screen.queryByLabelText("Accounts & Resources page navigation")).toBeNull();
    expect(screen.queryByLabelText("Accounts & Resources card controls")).toBeNull();
    expect(screen.getByRole("button", { name: "Account Directory hide module" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Resources & Orders hide module" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Quota & Usage hide module" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Lifecycle hide module" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "History & Events hide module" })).not.toBeNull();

    expect(screen.getByRole("heading", { name: "Account Directory" })).not.toBeNull();
    expect(screen.getAllByLabelText("Management panel").length).toBe(3);
    expect(screen.getByLabelText("Configuration panel")).not.toBeNull();
    expect(screen.getByLabelText("Audit / Workflow panel")).not.toBeNull();
    expect(screen.getAllByText("Quota policy panel").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Account ref · safe id").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("heading", { name: "Resources & Orders" })).not.toBeNull();
    expect(screen.getAllByText("Artifact · safe ref presence").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("heading", { name: "Quota & Usage" })).not.toBeNull();
    expect(screen.getAllByText("Default quota · policy value").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Over limit")).toBeNull();
    expect(screen.getByRole("heading", { name: "Lifecycle" })).not.toBeNull();
    expect(screen.getAllByText("Order · pause / expiry candidate").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("heading", { name: "History & Events" })).not.toBeNull();
    expect(screen.getAllByText("Audit · future entry slot").length).toBeGreaterThanOrEqual(1);
    expect(document.querySelectorAll(".admin-blueprint-module-notes")).toHaveLength(0);
    document.querySelectorAll(".admin-blueprint-module-notes").forEach((notes) => {
      expect(notes.hasAttribute("open")).toBe(false);
    });

    const renderedText = document.body.textContent ?? "";
    expect(renderedText).not.toMatch(/https?:\/\/|subscriptionUrl|token=|raw token|raw credential|password|secret-value|sqlite-row-value/i);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("button", { name: /Generate delivery preview|Save quota|Approve|Disable|Archive/i })).toBeNull();
    expect(screen.queryByLabelText("Controlled delivery preview")).toBeNull();
    expect(screen.queryByLabelText("Traffic quota")).toBeNull();
  });
});

function sectionAnchorOrder() {
  return Array.from(document.querySelectorAll(".page-anchor-group"))
    .map((element) => element.id);
}
