import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  DataTable,
  DataSourceBadge,
  EmptyState,
  MetricCard,
  ObjectChain,
  ObjectTimeline,
  PageHeader,
  PanelFrame,
  PluginContainer,
  QuotaMeter,
  PrivilegedGate,
  RiskQueue,
  SafeRef,
  SectionPanel,
  StateFeedback,
  StatusChip,
  NavigationLibrary,
  WorkspaceSidebar
} from "../components/primitives";

afterEach(() => {
  cleanup();
});

describe("admin ui primitives", () => {
  test("renders metric cards with the existing dashboard card contract", () => {
    render(
      <MetricCard
        detail="1 eligible channels"
        icon={<span aria-hidden="true">i</span>}
        label="Platform health"
        tone="success"
        value="Good"
      />
    );

    const card = screen.getByText("Platform health").closest(".ops-metric-card");
    expect(card).not.toBeNull();
    expect(card?.className).toContain("ops-metric-success");
    expect(card?.getAttribute("data-figma-component")).toBe("MetricCard");
    expect(card?.getAttribute("data-state-tone")).toBe("success");
    expect(card?.getAttribute("data-ui-surface")).toBe("metric-card");
    expect(screen.getByText("Good")).not.toBeNull();
    expect(screen.getByText("1 eligible channels")).not.toBeNull();
  });

  test("renders status chips through the dashboard status badge classes", () => {
    render(<StatusChip label="Stale" tone="warning" />);

    const chip = screen.getByText("Stale");
    expect(chip.className).toContain("dashboard-status-badge");
    expect(chip.className).toContain("dashboard-status-warning");
    expect(chip.getAttribute("data-figma-component")).toBe("StatusChip");
    expect(chip.getAttribute("data-state-tone")).toBe("warning");
    expect(chip.getAttribute("data-ui-surface")).toBe("status-chip");
  });

  test("clamps quota meter width while preserving the visible ratio", () => {
    render(<QuotaMeter ariaLabel="Order quota utilization" value={150} />);

    const meter = screen.getByRole("meter", { name: "Order quota utilization" });
    expect(meter.getAttribute("aria-valuenow")).toBe("100");
    expect(screen.getByText("150%")).not.toBeNull();
    expect((meter.querySelector(".quota-track span") as HTMLElement).style.width).toBe("100%");
  });

  test("renders a reusable section panel with action and status slots", () => {
    render(
      <SectionPanel
        action={<button type="button">View all</button>}
        className="new-console-panel"
        description="Accounts, orders, and quotas show safe refs and supervision states only."
        status={<StatusChip label="Normal" tone="success" />}
        title="Accounts & Resources"
      >
        <p>Panel content</p>
      </SectionPanel>
    );

    const panel = screen.getByLabelText("Accounts & Resources");
    expect(panel.className).toContain("dashboard-panel");
    expect(panel.className).toContain("new-console-panel");
    expect(screen.getByRole("heading", { name: "Accounts & Resources" })).not.toBeNull();
    expect(screen.getByText("Accounts, orders, and quotas show safe refs and supervision states only.")).not.toBeNull();
    expect(screen.getByRole("button", { name: "View all" })).not.toBeNull();
    expect(screen.getByText("Normal")).not.toBeNull();
  });

  test("renders a reusable page header with status content", () => {
    render(
      <PageHeader
        ariaLabel="Operations summary"
        description="Organized around users, resources, orders, usage, and channels."
        kicker="New Admin Console rebuild"
        status={<span className="dashboard-health dashboard-health-ready">Service normal</span>}
        title="Operator Control Center"
      />
    );

    const header = screen.getByLabelText("Operations summary");
    expect(header.className).toContain("dashboard-hero");
    expect(screen.getByText("New Admin Console rebuild").className).toContain("dashboard-kicker");
    expect(screen.getByRole("heading", { name: "Operator Control Center" })).not.toBeNull();
    expect(screen.getByText("Organized around users, resources, orders, usage, and channels.")).not.toBeNull();
    expect(screen.getByText("Service normal")).not.toBeNull();
  });


  test("renders fixed panel frame chrome with status and hide control", () => {
    const onHide = vi.fn();
    const onSizePresetChange = vi.fn();

    render(
      <PanelFrame
        ariaLabel="Monitoring container contract"
        allowedSizePresets={["compact", "standard", "wide", "full"]}
        category="monitoring"
        className="custom-panel"
        containerLabel="Overview metric widget set"
        dataContainmentStrategy="pagination"
        dataPaginationStandardNodeId="157:2"
        fieldLabels={["Platform health label", "Risk counter"]}
        onHide={onHide}
        onSizePresetChange={onSizePresetChange}
        sizePreset="standard"
        title="Health Summary"
        ownerMode="preview"
      >
        <p>Panel content</p>
      </PanelFrame>
    );

    const panel = screen.getByLabelText("Monitoring container contract");
    expect(panel.className).toContain("admin-blueprint-module-panel");
    expect(panel.className).toContain("custom-panel");
    expect(panel.getAttribute("data-figma-component")).toBe("PanelFrame");
    expect(panel.getAttribute("data-containment-strategy")).toBe("pagination");
    expect(panel.getAttribute("data-pagination-standard-node-id")).toBe("157:2");
    expect(panel.getAttribute("data-ui-contract")).toBe("panel-frame");
    expect(panel.getAttribute("data-ui-surface")).toBe("panel-frame");
    expect(panel.getAttribute("data-owner-mode")).toBe("preview");
    expect(panel.getAttribute("data-workbench-category")).toBe("monitoring");
    expect(panel.getAttribute("data-density")).toBe("normal");
    expect(panel.getAttribute("data-size")).toBeNull();
    expect(panel.getAttribute("data-size-preset")).toBe("standard");
    expect(panel.getAttribute("data-height")).toBeNull();
    expect(screen.queryByLabelText("Health Summary plugin display controls")).toBeNull();
    expect(screen.queryByRole("button", { name: "Health Summary Large plugin display" })).toBeNull();
    expect(screen.getByLabelText("Health Summary layout preset controls")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Health Summary compact layout" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Health Summary standard layout" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Health Summary wide layout" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Health Summary full layout" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Health Summary hide module" })).not.toBeNull();
    expect(screen.getByLabelText("2 primary fields")).not.toBeNull();
    expect(screen.queryByText("Platform health label")).toBeNull();
    expect(screen.queryByText("Risk counter")).toBeNull();
    expect(screen.getByText("Preview")).not.toBeNull();
    expect(screen.getByText("Panel content")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Health Summary wide layout" }));
    expect(onSizePresetChange).toHaveBeenCalledWith("wide");

    fireEvent.click(screen.getByRole("button", { name: "Health Summary hide module" }));
    expect(onHide).toHaveBeenCalled();
  });

  test("renders privileged gate as a reusable shell safety surface", () => {
    render(
      <PrivilegedGate
        capability="super-admin"
        description="Fresh MFA is required before restricted data is displayed."
        detail="Production actions require an approved runbook."
        state="fresh-mfa-required"
        title="Risk A gated"
      />
    );

    const summary = screen.getByLabelText("Production action guard");
    const gate = summary.closest("[data-ui-surface='privileged-gate']");
    expect(gate).not.toBeNull();
    expect(gate?.className).toContain("sidebar-safety-footer");
    expect(gate?.getAttribute("data-figma-component")).toBe("PrivilegedGate");
    expect(gate?.getAttribute("data-gate-state")).toBe("fresh-mfa-required");
    expect(gate?.getAttribute("data-capability")).toBe("super-admin");
    expect(summary.className).toContain("sidebar-safety-summary");
    expect(screen.getByText("Risk A gated")).not.toBeNull();
    expect(screen.getByText("Fresh MFA is required before restricted data is displayed.")).not.toBeNull();
    expect(screen.getByText("Production actions require an approved runbook.")).not.toBeNull();
  });

  test("renders fixture preview content inside the fixed panel frame", () => {
    render(
      <PanelFrame
        ariaLabel="Risk queue preview contract"
        category="audit-workflow"
        containerLabel="Review candidate queue widget"
        fieldLabels={["Severity", "Affected refs"]}
        fixturePreview={{
          summary: "Review queue previews routing decisions without durable case closure.",
          chips: [
            { label: "2 candidates", tone: "warning" },
            { label: "No write action", tone: "neutral" }
          ],
          rows: [
            { label: "High", value: "acct_demo_02", meta: "missing receipt evidence", tone: "danger" }
          ],
          safetyNotes: ["Candidate refs are synthetic."]
        }}
        title="Risk Queue"
        ownerMode="preview"
      />
    );

    const fixturePreview = screen.getByLabelText("Risk Queue fixture preview");
    expect(fixturePreview.getAttribute("data-fixture-schema")).toBe("admin-fixture-preview/v1");
    expect(within(fixturePreview).getByText("2 candidates")).not.toBeNull();
    expect(within(fixturePreview).getByText("acct_demo_02")).not.toBeNull();
    expect(within(fixturePreview).queryByText("Review queue previews routing decisions without durable case closure.")).toBeNull();
    expect(within(fixturePreview).queryByText("Candidate refs are synthetic.")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(/https?:\/\/|subscriptionUrl|token=|secret-value|password|edgecred_/i);
  });

  test("keeps plugin container as a compatibility mount wrapper over fixed panels", () => {
    render(
      <PluginContainer
        ariaLabel="Management container contract"
        category="management"
        containerLabel="Account directory workspace"
        fieldLabels={["Safe account ref"]}
        title="Account Directory"
        ownerMode="owner"
      />
    );

    const panel = screen.getByLabelText("Management container contract");
    expect(panel.getAttribute("data-ui-contract")).toBe("panel-frame");
    expect(panel.className).toContain("admin-blueprint-module-panel");
    expect(screen.getByText("Account Directory")).not.toBeNull();
  });

  test("renders workspace sidebar chrome with primary routes and navigation library slot", () => {
    const onNavigate = vi.fn();

    render(
      <WorkspaceSidebar
        brand={{
          mark: "GC",
          name: "GlobalCircle AI",
          subtitle: "Proxy Gateway"
        }}
        navigationLibrary={<button type="button">Navigation library</button>}
        pinnedApps={[
          {
            active: true,
            icon: <span aria-hidden="true">O</span>,
            id: "overview",
            label: "Operations Overview",
            onClick: () => onNavigate("overview"),
            tone: "nav-app-tone-blue"
          },
          {
            active: false,
            icon: <span aria-hidden="true">U</span>,
            id: "users",
            label: "Accounts & Resources",
            onClick: () => onNavigate("users"),
            tone: "nav-app-tone-green"
          }
        ]}
        safetyGate={<button type="button">Risk A gated</button>}
      />
    );

    const sidebar = screen.getByLabelText("Workspace sidebar");
    expect(sidebar.className).toContain("workspace-sidebar");
    expect(sidebar.getAttribute("data-ui-contract")).toBe("app-shell");
    expect(sidebar.getAttribute("data-figma-component")).toBe("SidebarNavigation");
    expect(sidebar.getAttribute("data-ui-surface")).toBe("workspace-sidebar");
    expect(sidebar.getAttribute("data-density")).toBe("normal");
    expect(within(sidebar).getByText("GlobalCircle AI")).not.toBeNull();
    expect(within(sidebar).getByLabelText("Primary workspace routes")).not.toBeNull();
    expect(within(sidebar).getByRole("button", { name: "Operations Overview" }).getAttribute("aria-current")).toBe("page");
    expect(within(sidebar).getByRole("button", { name: "Navigation library" })).not.toBeNull();
    expect(within(sidebar).getByRole("button", { name: "Risk A gated" })).not.toBeNull();

    fireEvent.click(within(sidebar).getByRole("button", { name: "Accounts & Resources" }));

    expect(onNavigate).toHaveBeenCalledWith("users");
  });

  test("renders navigation library chrome with search, grouped routes, and empty state", () => {
    const onSearchChange = vi.fn();

    render(
      <NavigationLibrary
        emptyState={<span>No matching routes, panels, or settings.</span>}
        open
        plannedApps={<div>System Settings</div>}
        panels={<button type="button">Health Summary</button>}
        resultCount={4}
        search="health"
        totalCount={24}
        utilities={<button type="button">Risk notifications</button>}
        workspacePages={<button type="button">Operations Overview</button>}
        onSearchChange={onSearchChange}
      />
    );

    const trigger = screen.getByLabelText("Open navigation library");
    expect(trigger.closest("details")?.getAttribute("data-ui-contract")).toBe("app-shell");
    expect(trigger.closest("details")?.getAttribute("data-figma-component")).toBe("SidebarNavigation");
    expect(trigger.closest("details")?.getAttribute("data-ui-surface")).toBe("navigation-library");
    expect(trigger.closest("details")?.getAttribute("data-density")).toBe("normal");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByLabelText("24 navigation library entries")).not.toBeNull();
    expect(screen.getByLabelText("4 navigation library results")).not.toBeNull();
    expect(screen.getByLabelText("Console settings")).not.toBeNull();
    expect(screen.getByLabelText("Workspace pages")).not.toBeNull();
    expect(screen.getByLabelText("Panels")).not.toBeNull();
    expect(screen.getByLabelText("Planned routes")).not.toBeNull();

    fireEvent.change(screen.getByLabelText("Search navigation library"), { target: { value: "quota" } });

    expect(onSearchChange).toHaveBeenCalledWith("quota");
  });

  test("renders data source badges with explicit source state", () => {
    render(
      <DataSourceBadge
        detail="overview / orders / usage monitor"
        label="Data sources connected"
        state="ready"
      />
    );

    const badge = screen.getByLabelText("Data sources connected: overview / orders / usage monitor");
    expect(badge.className).toContain("data-source-badge");
    expect(badge.className).toContain("data-source-success");
    expect(screen.getByText("Data sources connected")).not.toBeNull();
    expect(screen.getByText("overview / orders / usage monitor")).not.toBeNull();
  });

  test("renders safe references with an explicit fallback", () => {
    render(
      <>
        <SafeRef value="order_2048" />
        <SafeRef value={null} />
      </>
    );

    expect(screen.getByText("order_2048").className).toContain("mono-ref");
    expect(screen.getByText("Not recorded").className).toContain("mono-ref");
  });

  test("renders div-based data tables with stable rows and cells", () => {
    render(
      <DataTable
        ariaLabel="Accounts and resources supervision table"
        columns={[
          { key: "account", header: "User account", render: (row) => <SafeRef value={row.account} /> },
          { key: "order", header: "Linked order", render: (row) => <SafeRef value={row.order} /> },
          { key: "risk", header: "Risk state", render: (row) => <StatusChip label={row.risk} tone="success" /> }
        ]}
        getRowKey={(row) => row.order}
        rows={[{ account: "user_001", order: "order_2048", risk: "Normal" }]}
      />
    );

    const table = screen.getByRole("table", { name: "Accounts and resources supervision table" });
    expect(table.className).toContain("new-console-table");
    expect(screen.getByRole("columnheader", { name: "User account" })).not.toBeNull();
    expect(screen.getByRole("cell", { name: "user_001" })).not.toBeNull();
    expect(screen.getByRole("cell", { name: "order_2048" })).not.toBeNull();
    expect(screen.getAllByRole("row")).toHaveLength(2);
  });

  test("renders data table state rows without dropping headers", () => {
    type ChannelRow = { channel: string; freshness: string };

    render(
      <DataTable<ChannelRow>
        ariaLabel="Usage and channels supervision table"
        columns={[
          { key: "channel", header: "Channel ID", render: (row) => row.channel },
          { key: "freshness", header: "Collection freshness", render: (row) => row.freshness }
        ]}
        getRowKey={(row) => row.channel}
        rows={[]}
        state={{
          description: "Keep the current filters while waiting for the collector to return a safe summary.",
          title: "Loading channel collection samples",
          tone: "loading"
        }}
      />
    );

    const table = screen.getByRole("table", { name: "Usage and channels supervision table" });
    expect(table.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("columnheader", { name: "Channel ID" })).not.toBeNull();
    const stateCell = screen.getByRole("cell", { name: /Loading channel collection samples/ });
    expect(stateCell.tagName).toBe("DIV");
    expect(stateCell.className).toContain("new-console-state-cell");
    expect(within(stateCell).getByRole("status").getAttribute("data-ui-surface")).toBe("state-feedback");
    expect(within(stateCell).getByRole("status").getAttribute("data-state-feedback")).toBe("loading");
    expect(screen.getByText("Keep the current filters while waiting for the collector to return a safe summary.")).not.toBeNull();
    expect(screen.getAllByRole("row")).toHaveLength(2);
  });

  test("renders table stale and error states through shared state feedback semantics", () => {
    const { rerender } = render(
      <DataTable<{ ref: string }>
        ariaLabel="Case evidence table"
        columns={[{ key: "ref", header: "Reference", render: (row) => row.ref }]}
        getRowKey={(row) => row.ref}
        rows={[]}
        state={{
          description: "Evidence age exceeds the current review window.",
          title: "Evidence may be stale",
          tone: "stale"
        }}
      />
    );

    const staleState = screen.getByRole("status", { name: /Evidence may be stale/ });
    expect(staleState.getAttribute("data-state-feedback")).toBe("stale");
    expect(staleState.getAttribute("data-ui-surface")).toBe("state-feedback");

    rerender(
      <DataTable<{ ref: string }>
        ariaLabel="Case evidence table"
        columns={[{ key: "ref", header: "Reference", render: (row) => row.ref }]}
        getRowKey={(row) => row.ref}
        rows={[]}
        state={{
          description: "The unavailable detail is redacted.",
          title: "Evidence source unavailable",
          tone: "error"
        }}
      />
    );

    const errorState = screen.getByRole("alert", { name: /Evidence source unavailable/ });
    expect(errorState.getAttribute("data-state-feedback")).toBe("error");
    expect(errorState.getAttribute("data-ui-surface")).toBe("state-feedback");
  });

  test("renders shared empty states with checklist guidance", () => {
    render(
      <EmptyState
        checklist={["Account safe ref", "Order safe ref"]}
        description="After Admin API connects, this view shows supervisable objects by account, order, and quota."
        title="Waiting for account and resource facts"
      />
    );

    const emptyState = screen.getByText("Waiting for account and resource facts").closest(".workstream-empty-state");
    expect(emptyState).not.toBeNull();
    expect(emptyState?.getAttribute("data-ui-surface")).toBe("state-feedback");
    expect(emptyState?.getAttribute("data-state-feedback")).toBe("empty");
    expect(screen.getByText("After Admin API connects, this view shows supervisable objects by account, order, and quota.")).not.toBeNull();
    expect(screen.getByText("Account safe ref")).not.toBeNull();
    expect(screen.getByText("Order safe ref")).not.toBeNull();
  });

  test("renders first-class state feedback with chrome and role variants", () => {
    render(
      <StateFeedback
        chrome="none"
        description="No raw runtime detail is rendered."
        role="alert"
        title="Review state blocked"
        tone="error"
      />
    );

    const feedback = screen.getByRole("alert", { name: /Review state blocked/ });
    expect(feedback.className).toContain("state-feedback");
    expect(feedback.className).toContain("state-feedback-error");
    expect(feedback.getAttribute("data-chrome")).toBe("none");
    expect(feedback.getAttribute("data-ui-surface")).toBe("state-feedback");
  });

  test("renders empty states through shared chrome variants", () => {
    render(
      <>
        <EmptyState
          chrome="case"
          description="Select a queue candidate to inspect evidence and object history."
          descriptionClassName="muted"
          title="Select a supervision case"
        />
        <EmptyState
          chrome="none"
          className="case-state case-error-state"
          description="Case history is unavailable."
          descriptionClassName="muted"
          role="alert"
          title="Case source unavailable"
        />
      </>
    );

    const caseState = screen.getByText("Select a supervision case").closest(".case-empty-state");
    expect(caseState).not.toBeNull();
    expect(caseState?.className).toContain("case-state");
    expect(caseState?.getAttribute("data-ui-surface")).toBe("state-feedback");
    expect(screen.getByText("Select a queue candidate to inspect evidence and object history.").className).toContain("muted");

    const errorState = screen.getByRole("alert");
    expect(errorState.className).toContain("case-error-state");
    expect(errorState.className).not.toContain("workstream-empty-state");
    expect(screen.getByText("Case history is unavailable.").className).toContain("muted");
  });

  test("renders reusable risk queues with filtering and selection", () => {
    const onSelect = vi.fn();

    render(
      <RiskQueue
        title="Cases"
        description="Ordered by severity and update time."
        items={[
          {
            ref: "case:critical",
            title: "Order traffic over limit",
            severity: "critical",
            severityLabel: "High",
            objectType: "usage",
            objectRef: "order_safe_1",
            reasonLabel: "Over limit"
          },
          {
            ref: "case:low",
            title: "Subscription expiring soon",
            severity: "neutral",
            severityLabel: "Low",
            objectType: "order",
            objectRef: "order_safe_2",
            reasonLabel: "Archive review"
          }
        ]}
        selectedRef="case:critical"
        onSelect={onSelect}
      />
    );

    const queue = screen.getByLabelText("Cases");
    expect(screen.getByLabelText("Cases count 2")).not.toBeNull();
    expect(screen.getByRole("button", { name: "All 2" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "High risk 1" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Low risk 1" })).not.toBeNull();
    expect(within(queue).getByRole("button", { name: /Order traffic over limit/ }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: /Subscription expiring soon/ }));

    expect(onSelect).toHaveBeenCalledWith("case:low");
  });

  test("renders reusable object chains and object timelines", () => {
    render(
      <>
        <ObjectChain
          objects={[
            {
              ref: "account:portal_user_safe",
              label: "User account",
              objectRef: "portal_user_safe",
              objectType: "account",
              relationType: "owns"
            }
          ]}
        />
        <ObjectTimeline
          events={[
            {
              ref: "event:usage:order_safe_1",
              actionLabel: "Over limit",
              objectRef: "order_safe_1",
              objectType: "usage",
              occurredAtLabel: "2026/06/05 09:00",
              severity: "critical",
              sourceLabel: "Usage & Channels",
              summary: "Usage collection fact recorded"
            }
          ]}
        />
      </>
    );

    const chain = screen.getByLabelText("Linked objects");
    expect(within(chain).getByRole("heading", { name: "Linked objects" })).not.toBeNull();
    expect(within(chain).getByText("portal_user_safe")).not.toBeNull();
    expect(within(chain).getByText("owns · account")).not.toBeNull();

    const timeline = screen.getByLabelText("Object timeline");
    expect(within(timeline).getByRole("heading", { name: "Object timeline" })).not.toBeNull();
    expect(within(timeline).getByText("Usage collection fact recorded")).not.toBeNull();
    expect(within(timeline).getByText("Over limit · usage · order_safe_1")).not.toBeNull();
    expect(within(timeline).getByText("Usage & Channels · 2026/06/05 09:00")).not.toBeNull();
  });
});
