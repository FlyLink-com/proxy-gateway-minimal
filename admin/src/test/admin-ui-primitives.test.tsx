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
  PluginContainer,
  PluginFrame,
  QuotaMeter,
  RiskQueue,
  SafeRef,
  SectionPanel,
  StatusChip,
  AppLibrary,
  WorkbenchContainerCard,
  WorkbenchLayerMap,
  WorkspaceAppbar
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
    expect(screen.getByText("Good")).not.toBeNull();
    expect(screen.getByText("1 eligible channels")).not.toBeNull();
  });

  test("renders status chips through the dashboard status badge classes", () => {
    render(<StatusChip label="Stale" tone="warning" />);

    const chip = screen.getByText("Stale");
    expect(chip.className).toContain("dashboard-status-badge");
    expect(chip.className).toContain("dashboard-status-warning");
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

  test("renders frontend workbench layers and container contracts", () => {
    render(
      <>
        <WorkbenchLayerMap
          layers={[
            {
              label: "Shell Container",
              description: "Sidebar, top bar, search, environment, and operator context."
            },
            {
              label: "Data Adapter",
              description: "Static design data now; safe backend API adapters later."
            }
          ]}
        />
        <WorkbenchContainerCard
          spec={{
            category: "monitoring",
            container: "Collection freshness monitor",
            dataAdapter: "Static design fields now; later safe usage summaries.",
            layoutPolicy: "Collapsible monitoring section.",
            performanceBoundary: "Refreshes independently from account tables.",
            interactionModel: "Read-only inspection and owner-page routing."
          }}
        />
      </>
    );

    expect(screen.getByText("Shell Container")).not.toBeNull();
    expect(screen.getByText("Data Adapter")).not.toBeNull();
    const contract = screen.getByLabelText("Monitoring container contract");
    expect(contract.className).toContain("workbench-container-card");
    expect(contract.className).toContain("workbench-category-monitoring");
    expect(screen.getByText("Design adapter")).not.toBeNull();
    expect(screen.getByText("Read-only health, freshness, usage, channel, and anomaly evidence.")).not.toBeNull();
    expect(screen.getByText("Collection freshness monitor")).not.toBeNull();
    expect(screen.getByText("Container contract").closest("details")?.hasAttribute("open")).toBe(false);
    expect(screen.getByText("Performance boundary")).not.toBeNull();
    expect(screen.getByText("Refreshes independently from account tables.")).not.toBeNull();
  });

  test("renders plugin frame chrome with inline settings and status slots", () => {
    const onHide = vi.fn();
    const onLayoutChange = vi.fn();

    render(
      <PluginFrame
        ariaLabel="Monitoring container contract"
        category="monitoring"
        className="custom-plugin"
        containerLabel="Overview metric widget set"
        fieldLabels={["Platform health label", "Risk counter"]}
        height="medium"
        onHide={onHide}
        onLayoutChange={onLayoutChange}
        settingsOpen
        size="medium"
        title="Health Summary"
        ownerMode="preview"
      >
        <p>Plugin content</p>
      </PluginFrame>
    );

    const plugin = screen.getByLabelText("Monitoring container contract");
    expect(plugin.className).toContain("admin-blueprint-module-card");
    expect(plugin.className).toContain("custom-plugin");
    expect(plugin.getAttribute("data-ui-contract")).toBe("plugin-frame");
    expect(plugin.getAttribute("data-density")).toBe("normal");
    expect(plugin.getAttribute("data-size")).toBe("medium");
    expect(plugin.getAttribute("data-height")).toBe("medium");
    expect(screen.getByRole("button", { name: "Health Summary plugin settings" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByLabelText("Health Summary plugin display controls")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Health Summary Large plugin display" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Health Summary Hide plugin" })).not.toBeNull();
    expect(screen.getByText("Preview")).not.toBeNull();
    expect(screen.getByText("Plugin content")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Health Summary Hide plugin" }));
    expect(onHide).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Health Summary Large plugin display" }));
    expect(onLayoutChange).toHaveBeenCalledWith({ height: "tall", size: "large", visible: true });
  });

  test("keeps plugin container as a compatibility mount wrapper over PluginFrame", () => {
    render(
      <PluginContainer
        ariaLabel="Management container contract"
        category="management"
        containerLabel="Account directory workspace"
        fieldLabels={["Safe account ref"]}
        height="short"
        settingsOpen={false}
        size="small"
        title="Account Directory"
        ownerMode="owner"
      />
    );

    const plugin = screen.getByLabelText("Management container contract");
    expect(plugin.getAttribute("data-ui-contract")).toBe("plugin-frame");
    expect(plugin.className).toContain("admin-blueprint-module-card-small");
    expect(screen.getByText("Account Directory")).not.toBeNull();
  });

  test("renders workspace appbar chrome with pinned apps and library slot", () => {
    const onNavigate = vi.fn();

    render(
      <WorkspaceAppbar
        brand={{
          mark: "GC",
          name: "GlobalCircle AI",
          subtitle: "Proxy Gateway"
        }}
        appLibrary={<button type="button">App library</button>}
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

    const appbar = screen.getByLabelText("Workspace appbar");
    expect(appbar.className).toContain("workspace-appbar");
    expect(appbar.getAttribute("data-ui-contract")).toBe("app-shell");
    expect(appbar.getAttribute("data-ui-surface")).toBe("workspace-appbar");
    expect(appbar.getAttribute("data-density")).toBe("normal");
    expect(within(appbar).getByText("GlobalCircle AI")).not.toBeNull();
    expect(within(appbar).getByLabelText("Pinned workspace apps")).not.toBeNull();
    expect(within(appbar).getByRole("button", { name: "Operations Overview" }).getAttribute("aria-current")).toBe("page");
    expect(within(appbar).getByRole("button", { name: "App library" })).not.toBeNull();
    expect(within(appbar).getByRole("button", { name: "Risk A gated" })).not.toBeNull();

    fireEvent.click(within(appbar).getByRole("button", { name: "Accounts & Resources" }));

    expect(onNavigate).toHaveBeenCalledWith("users");
  });

  test("renders app library chrome with search, grouped apps, and empty state", () => {
    const onSearchChange = vi.fn();

    render(
      <AppLibrary
        emptyState={<span>No matching apps, plugins, or settings.</span>}
        open
        plannedApps={<div>System Settings</div>}
        plugins={<button type="button">Health Summary</button>}
        resultCount={4}
        search="health"
        totalCount={24}
        utilities={<button type="button">Risk notifications</button>}
        workspacePages={<button type="button">Operations Overview</button>}
        onSearchChange={onSearchChange}
      />
    );

    const trigger = screen.getByLabelText("Open app library");
    expect(trigger.closest("details")?.getAttribute("data-ui-contract")).toBe("app-shell");
    expect(trigger.closest("details")?.getAttribute("data-ui-surface")).toBe("app-library");
    expect(trigger.closest("details")?.getAttribute("data-density")).toBe("normal");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByLabelText("24 app library entries")).not.toBeNull();
    expect(screen.getByLabelText("4 app library results")).not.toBeNull();
    expect(screen.getByLabelText("Console settings")).not.toBeNull();
    expect(screen.getByLabelText("Workspace pages")).not.toBeNull();
    expect(screen.getByLabelText("Plugins")).not.toBeNull();
    expect(screen.getByLabelText("Planned apps")).not.toBeNull();

    fireEvent.change(screen.getByLabelText("Search app library"), { target: { value: "quota" } });

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
    expect(stateCell.className).toContain("new-console-state-cell");
    expect(screen.getByText("Keep the current filters while waiting for the collector to return a safe summary.")).not.toBeNull();
    expect(screen.getAllByRole("row")).toHaveLength(2);
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
    expect(screen.getByText("After Admin API connects, this view shows supervisable objects by account, order, and quota.")).not.toBeNull();
    expect(screen.getByText("Account safe ref")).not.toBeNull();
    expect(screen.getByText("Order safe ref")).not.toBeNull();
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
