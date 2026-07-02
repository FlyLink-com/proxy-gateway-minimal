import {
  useState,
  type ReactNode
} from "react";
import {
  AdminConsolePageFrame,
  type BlueprintPage
} from "./admin-console-page-frame";
import {
  createAccountsResourcesOwnerPageModel,
  type AccountsResourceDetailDrawer,
  type AccountsResourceOwnerSection,
  type AccountsResourceTableRow
} from "../app/accounts-resources-owner-model";
import { ADMIN_EVIDENCE_SURFACE_CONTRACTS } from "../app/admin-evidence-contract";
import {
  DataTable,
  type DataTableColumn,
  EvidenceChartPanel,
  EvidenceLogPanel,
  MetricCard,
  StatusChip
} from "../components/primitives";
import {
  Activity,
  Gauge,
  History,
  Users
} from "lucide-react";

export const accountsResourcesBlueprint: BlueprintPage = {
  page: "portalRequests",
  ariaLabel: "Accounts & Resources page header",
  kicker: "Accounts & Resources / Owner Page",
  title: "Accounts & Resources",
  description: "Decision owner for accounts, resources, orders, quotas, lifecycle, and history.",
  statusLabel: "Decision owner",
  statusTone: "info",
  summary: <AccountsResourcesSummary />,
  evidence: <AccountsResourcesEvidence />,
  overviewModuleIds: ["account-overview", "resource-orders", "lifecycle"],
  modules: [
    {
      navId: "account-overview",
      container: {
        category: "management",
        container: "Account directory workspace",
        dataAdapter: "Static design fields now; later safe account index and portal ownership summaries.",
        layoutPolicy: "Page-owned section with filters and drawer later; not draggable outside this page.",
        performanceBoundary: "Large account lists must use paged or virtualized tables before API connection.",
        interactionModel: "Selection and review planning now; create/disable requires later backend contract."
      },
      content: <AccountDirectoryContent />,
      containmentStrategy: "pagination",
      actions: <StatusChip label="Active" tone="success" />,
      purpose: "Directory of safe account refs, risk state, resource count, and review state.",
      contentFields: [
        "Account ref · safe id",
        "Account state · enabled / disabled",
        "Resources · linked count",
        "Risk · summary chip",
        "Activity · last safe event"
      ],
      states: [
        "Empty directory",
        "Normal account",
        "Needs review",
        "Disabled account"
      ],
      uiSurface: "account-directory",
      ownership: "Owns account create, enable, disable, and review planning.",
      boundaries: [
        "No customer-private contact data",
        "No raw identity provider payload",
        "No channel collector controls"
      ],
      nextStep: "Connect backend account model before enabling create/disable actions."
    },
    {
      navId: "resource-orders",
      container: {
        category: "management",
        container: "Resource and order table workspace",
        dataAdapter: "Static design fields now; later redacted order, entitlement, and artifact summaries.",
        layoutPolicy: "Dense table plus detail drawer; no overview duplication.",
        performanceBoundary: "Rows, filters, and drawers load inside this page container only.",
        interactionModel: "Inspect and plan lifecycle review; no raw subscription output."
      },
      content: <ResourceOrdersContent />,
      containmentStrategy: "pagination",
      actions: <StatusChip label="Synced" tone="success" />,
      purpose: "Group resources, orders, entitlements, and subscription artifact safe refs under the owning account.",
      contentFields: [
        "Order ref · safe id",
        "Plan · entitlement state",
        "Artifact · safe ref presence",
        "Delivery · current state",
        "Channels · safe refs only"
      ],
      states: [
        "Pending review",
        "Pending delivery",
        "Delivered",
        "Expired or revoked"
      ],
      uiSurface: "resource-orders",
      ownership: "Owns resource/order lifecycle and artifact lifecycle review.",
      boundaries: [
        "No subscription URL",
        "No credential material",
        "No runtime apply or collector activation"
      ],
      nextStep: "Rebuild the table from the new object model after ownership terms are frozen."
    },
    {
      navId: "quota-usage",
      container: {
        category: "configuration",
        container: "Quota policy panel",
        dataAdapter: "Static quota fields now; later existing traffic-limit update API plus review-note contract.",
        layoutPolicy: "Config panel with preview and reset controls later; not a monitoring ledger.",
        performanceBoundary: "Quota calculations remain derived from supplied summaries, not repeated polling.",
        interactionModel: "Review policy and prepare edit; save action waits for a reviewed update gate."
      },
      content: <QuotaUsageContent />,
      containmentStrategy: "not-applicable",
      purpose: "Own quota policy decisions while using usage collection only as evidence.",
      contentFields: [
        "Default quota · policy value",
        "Edited quota · review value",
        "Usage · used / total",
        "Measured channels · count",
        "Review note · required gate"
      ],
      states: [
        "Within quota",
        "Near quota",
        "Over limit",
        "Unmetered or collection gap"
      ],
      uiSurface: "quota-usage",
      ownership: "Owns quota policy, over-limit disposition, and quota-change review.",
      boundaries: [
        "No collector trust decision",
        "No channel coverage diagnosis",
        "No order pause/archive without later backend gate"
      ],
      nextStep: "Reconnect quota editor only after review note and backend update contract are reviewed."
    },
    {
      navId: "lifecycle",
      container: {
        category: "management",
        container: "Lifecycle review panel",
        dataAdapter: "Static lifecycle taxonomy now; later account, order, artifact, expiry, and archive summaries.",
        layoutPolicy: "Structured review lanes; execution controls stay disabled until backend gates exist.",
        performanceBoundary: "Lifecycle state is loaded per selected object rather than across every row.",
        interactionModel: "Review and dry-run planning only before approved mutation flows."
      },
      content: <LifecycleContent />,
      containmentStrategy: "route-split",
      actions: <StatusChip label="Watch" tone="warning" />,
      purpose: "Plan account, order, artifact, expiry, revocation, pause, and archive states in one owner page.",
      contentFields: [
        "Account · lifecycle state",
        "Order · pause / expiry candidate",
        "Artifact · revoked state",
        "Archive · candidate state",
        "Evidence · required source"
      ],
      states: [
        "Active",
        "Paused",
        "Expired",
        "Revoked",
        "Archive candidate"
      ],
      uiSurface: "lifecycle-review",
      ownership: "Owns lifecycle decisions, but execution remains gated by backend contracts and runbooks.",
      boundaries: [
        "No direct production mutation",
        "No runtime service control",
        "No durable case closure"
      ],
      nextStep: "Split lifecycle decisions into read-only review, dry-run preview, and approved mutation phases."
    },
    {
      navId: "history-events",
      container: {
        category: "audit-workflow",
        container: "Computed history preview",
        dataAdapter: "Static event slots now; later durable restricted case-history adapter.",
        layoutPolicy: "Preview section until restricted case workflow owns durable history.",
        performanceBoundary: "Timeline content stays lazy and bounded until durable history exists.",
        interactionModel: "Read-only context; no note write or case close actions."
      },
      content: <HistoryEventsContent />,
      containmentStrategy: "pagination",
      purpose: "Show safe computed events and case candidates until durable restricted case history exists.",
      contentFields: [
        "Event · safe label",
        "Object · safe ref",
        "Source · owner page",
        "Case · candidate reason",
        "Restricted event · future entry slot"
      ],
      states: [
        "No computed events",
        "Context available",
        "Case backend locked",
        "Restricted write unavailable"
      ],
      uiSurface: "history-events",
      ownership: "Provides review context for accounts and resources; durable history later moves to the restricted case workflow.",
      boundaries: [
        "No raw logs",
        "No raw SQLite row",
        "No note write until durable case backend exists"
      ],
      nextStep: "Hand durable history to the restricted case workflow after the case/history backend contract lands."
    }
  ]
};

const accountsResourcesOwnerPageModel = createAccountsResourcesOwnerPageModel(accountsResourcesBlueprint);

function AccountsResourcesEvidence() {
  return (
    <>
      <EvidenceChartPanel
        ariaLabel="Account Metrics evidence panel"
        contract={ADMIN_EVIDENCE_SURFACE_CONTRACTS.accountMetrics}
        description="Decision owner evidence for accounts, resources, quota, and lifecycle states."
        series={[
          { label: "Active", tone: "success", values: [11, 12, 12, 12, 12, 12, 12] },
          { label: "Orders", tone: "info", values: [8, 9, 10, 10, 10, 10, 10] },
          { label: "Quota", tone: "warning", values: [1, 3, 4, 4, 4, 4, 4] }
        ]}
        stats={[
          { label: "Accounts", tone: "info", value: "5" },
          { label: "Orders", tone: "success", value: "3" },
          { label: "Quota review", tone: "warning", value: "1" }
        ]}
        title="Account Metrics"
      />
      <EvidenceLogPanel
        ariaLabel="Account Event Log evidence panel"
        contract={ADMIN_EVIDENCE_SURFACE_CONTRACTS.accountEventLog}
        description="Safe account/resource transitions without raw identity, token, or artifact material."
        entries={[
          {
            detail: "Quota review routed from usage evidence; no account mutation is enabled.",
            source: "quota review",
            time: "12:26",
            title: "Quota evidence attached",
            tone: "warning"
          },
          {
            detail: "Resource order delivery state is visible with subscription output hidden.",
            source: "resource order",
            time: "12:10",
            title: "Order state reviewed",
            tone: "info"
          },
          {
            detail: "Lifecycle review lane keeps archive and disable actions gated.",
            source: "lifecycle",
            time: "11:52",
            title: "Lifecycle gate locked",
            tone: "neutral"
          }
        ]}
        title="Account Event Log"
      />
    </>
  );
}

function AccountsResourcesSummary() {
  return (
    <div className="ops-metric-grid" aria-label="Accounts & Resources summary metrics">
      <MetricCard
        detail="Enabled accounts"
        icon={<Users aria-hidden="true" />}
        label="Active accounts"
        status={{
          label: "Good",
          tone: "success"
        }}
        tone="success"
        value="5"
      />
      <MetricCard
        detail="Open orders"
        icon={<Activity aria-hidden="true" />}
        label="Resource orders"
        status={{
          label: "Good",
          tone: "success"
        }}
        tone="success"
        value="12"
      />
      <MetricCard
        detail="Review required"
        icon={<Gauge aria-hidden="true" />}
        label="Quota pressure"
        status={{
          label: "Review",
          tone: "warning"
        }}
        tone="warning"
        value="3"
      />
      <MetricCard
        detail="Expiring / locked"
        icon={<History aria-hidden="true" />}
        label="Lifecycle warnings"
        status={{
          label: "Review",
          tone: "warning"
        }}
        tone="warning"
        value="4"
      />
    </div>
  );
}

export function PortalRequestsPage({
  activeModuleNavId,
  fixturePreviewEnabled = false,
  onActiveModuleNavIdChange
}: {
  activeModuleNavId?: string;
  fixturePreviewEnabled?: boolean;
  onActiveModuleNavIdChange?: (navId: string) => void;
}) {
  return (
    <AdminConsolePageFrame
      activeModuleNavId={activeModuleNavId}
      blueprint={accountsResourcesBlueprint}
      fixturePreviewEnabled={fixturePreviewEnabled}
      onActiveModuleNavIdChange={onActiveModuleNavIdChange}
    />
  );
}

function AccountDirectoryContent() {
  const section = getAccountsResourceOwnerSection("account-overview");
  return (
    <div className="admin-operator-content" aria-label="Account Directory owner model content">
      <PanelCompactRows section={section} />
    </div>
  );
}

function ResourceOrdersContent() {
  const section = getAccountsResourceOwnerSection("resource-orders");
  return (
    <div className="admin-operator-content" aria-label="Resources and Orders owner model content">
      <PanelCompactRows section={section} />
    </div>
  );
}

function QuotaUsageContent() {
  const section = getAccountsResourceOwnerSection("quota-usage");
  return (
    <div className="admin-operator-content" aria-label="Quota and Usage owner model content">
      {section.table && section.detailDrawer ? (
        <AccountsResourceTableWorkspace section={section} />
      ) : (
        <PanelCompactRows section={section} />
      )}
    </div>
  );
}

function LifecycleContent() {
  const section = getAccountsResourceOwnerSection("lifecycle");
  return (
    <div className="admin-operator-content" aria-label="Lifecycle owner model content">
      <PanelCompactRows section={section} />
    </div>
  );
}

function PanelCompactRows({ section }: { section: AccountsResourceOwnerSection }) {
  return (
    <div
      className="admin-operator-content admin-panel-compact-card"
      aria-label={`${section.footer} preview rows`}
      data-query-page={section.query.page}
      data-query-schema={section.query.schemaVersion}
      data-result-window={`${section.resultWindow.firstItem}-${section.resultWindow.lastItem}/${section.resultWindow.totalItems}`}
      data-route-scope={section.query.routeScope}
    >
      <p className="admin-panel-compact-subtitle">{section.subtitle}</p>
      <div className="admin-compact-row-list" aria-label={`${section.footer} compact rows`}>
        {section.rows.map((row) => (
          <article
            className={`admin-compact-data-row admin-compact-data-row-${row.tone}`}
            data-figma-component="DataRowCompact"
            data-state-tone={row.tone}
            data-ui-surface="compact-row"
            key={row.label}
          >
            <span className="admin-compact-data-row-main">
              <strong>{row.label}</strong>
              <span className="admin-compact-data-row-detail">{row.detail}</span>
            </span>
            <span className="admin-compact-data-row-meta">{row.meta}</span>
            <span className="admin-compact-data-row-status">{row.statusLabel}</span>
          </article>
        ))}
      </div>
      <div className="admin-overview-panel-footer" aria-hidden="true">
        <span>{section.footer}</span>
        <span>•••</span>
      </div>
    </div>
  );
}

function AccountsResourceTableWorkspace({ section }: { section: AccountsResourceOwnerSection }) {
  const table = section.table;
  const initialRow = table?.rows[0];
  const [selectedRow, setSelectedRow] = useState<AccountsResourceTableRow | undefined>(initialRow);

  if (!table || !selectedRow) {
    return <PanelCompactRows section={section} />;
  }

  return (
    <div
      className="admin-account-directory-workspace admin-owner-table-workspace"
      data-owner-model-schema={accountsResourcesOwnerPageModel.schemaVersion}
      data-query-page={section.query.page}
      data-query-schema={section.query.schemaVersion}
      data-result-window={`${section.resultWindow.firstItem}-${section.resultWindow.lastItem}/${section.resultWindow.totalItems}`}
      data-route-scope={section.query.routeScope}
      data-ui-surface="account-directory-workspace"
    >
      <DataTable<AccountsResourceTableRow>
        ariaLabel={table.ariaLabel}
        columns={createAccountsResourceTableColumns(table.columns)}
        density="compact"
        getRowKey={(row) => row.label}
        getRowLabel={(row) => `${row.label} ${getAccountsResourceRowKind(section.navId)} row`}
        onRowSelect={setSelectedRow}
        pagination={{
          label: `${table.ariaLabel} pagination`,
          pageSize: table.pageSize,
          showWhenSinglePage: true
        }}
        rows={table.rows}
        selectedRowKey={selectedRow.label}
      />
      <AccountsResourceDetailDrawer
        drawer={section.detailDrawer}
        section={section}
        selectedRow={selectedRow}
      />
    </div>
  );
}

function createAccountsResourceTableColumns(
  columns: readonly string[]
): Array<DataTableColumn<AccountsResourceTableRow>> {
  return columns.map((column) => ({
    header: column,
    key: column.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    render: (row) => renderAccountsResourceTableCell(column, row)
  }));
}

function renderAccountsResourceTableCell(column: string, row: AccountsResourceTableRow): ReactNode {
  if (column === "Event") {
    return <strong>{row.label}</strong>;
  }
  if (column === "Policy") {
    return <strong>{row.label}</strong>;
  }
  if (column === "Decision") {
    return <strong>{row.label}</strong>;
  }
  if (column === "Account") {
    return <strong>{row.account ?? row.label}</strong>;
  }
  if (column === "Order") {
    return <strong>{row.order ?? row.label}</strong>;
  }
  if (column === "Object") {
    return row.objectRef ?? "—";
  }
  if (column === "Source") {
    return row.source ?? "—";
  }
  if (column === "Case") {
    return row.caseLabel ?? "—";
  }
  if (column === "State") {
    return <StatusChip label={row.state} tone={row.tone} />;
  }
  if (column === "Resources") {
    return row.resourceCount ?? "—";
  }
  if (column === "Risk") {
    return row.risk ?? "—";
  }
  if (column === "Subscription") {
    return row.subscription ?? "—";
  }
  if (column === "Channel") {
    return row.channel ?? "—";
  }
  if (column === "Window") {
    return row.window ?? "—";
  }
  if (column === "Activity") {
    return row.activity;
  }
  if (column === "Usage") {
    return row.usage ?? "—";
  }
  return "—";
}

function AccountsResourceDetailDrawer({
  drawer,
  section,
  selectedRow
}: {
  drawer?: AccountsResourceDetailDrawer;
  section: AccountsResourceOwnerSection;
  selectedRow: AccountsResourceTableRow;
}) {
  const fields = createAccountsResourceDetailFields(section.navId, selectedRow);

  return (
    <aside
      aria-label={drawer?.ariaLabel ?? "Account Directory detail drawer"}
      className={`admin-account-detail-drawer admin-account-detail-drawer-${selectedRow.tone}`}
      data-figma-component="DetailDrawer"
      data-state-tone={selectedRow.tone}
      data-ui-surface="account-detail-drawer"
    >
      <div className="admin-account-detail-drawer-head">
        <span>Readonly detail</span>
        <strong>{selectedRow.label}</strong>
      </div>
      <p>{drawer?.description ?? "Read-only account context for safe review planning."}</p>
      <dl>
        {fields.map((field) => (
          <DetailField key={field.label} label={field.label} value={field.value} />
        ))}
      </dl>
    </aside>
  );
}

function createAccountsResourceDetailFields(navId: string, selectedRow: AccountsResourceTableRow) {
  if (navId === "resource-orders") {
    return [
      { label: "Order", value: selectedRow.label },
      { label: "Subscription", value: selectedRow.subscription ?? "Unknown" },
      { label: "Channel", value: selectedRow.channel ?? "Unknown" },
      { label: "State", value: selectedRow.state }
    ];
  }

  if (navId === "lifecycle") {
    return [
      { label: "Decision", value: selectedRow.label },
      { label: "Account", value: selectedRow.account ?? "Unknown" },
      { label: "Order", value: selectedRow.order ?? "Unknown" },
      { label: "State", value: selectedRow.state }
    ];
  }

  if (navId === "quota-usage") {
    return [
      { label: "Policy", value: selectedRow.label },
      { label: "Account", value: selectedRow.account ?? "Unknown" },
      { label: "Order", value: selectedRow.order ?? "Unknown" },
      { label: "State", value: selectedRow.state }
    ];
  }

  if (navId === "history-events") {
    return [
      { label: "Event", value: selectedRow.label },
      { label: "Object", value: selectedRow.objectRef ?? "Unknown" },
      { label: "Source", value: selectedRow.source ?? "Unknown" },
      { label: "State", value: selectedRow.state }
    ];
  }

  return [
    { label: "Account", value: selectedRow.label },
    { label: "State", value: selectedRow.state },
    { label: "Resources", value: selectedRow.resourceCount ?? "Unknown" },
    { label: "Risk", value: selectedRow.risk ?? "Unknown" }
  ];
}

function getAccountsResourceRowKind(navId: string) {
  if (navId === "resource-orders") {
    return "resource order";
  }
  if (navId === "lifecycle") {
    return "lifecycle";
  }
  if (navId === "quota-usage") {
    return "quota policy";
  }
  if (navId === "history-events") {
    return "history event";
  }
  return "account";
}

function DetailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="admin-account-detail-field">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function getAccountsResourceOwnerSection(navId: string): AccountsResourceOwnerSection {
  const section = accountsResourcesOwnerPageModel.allSections.find((candidate) => candidate.navId === navId);
  if (!section) {
    throw new Error(`Accounts resource owner section is not registered: ${navId}`);
  }
  return section;
}

function HistoryEventsContent() {
  const section = getAccountsResourceOwnerSection("history-events");
  return (
    <div className="admin-operator-content" aria-label="History and Events owner model content">
      {section.table && section.detailDrawer ? (
        <AccountsResourceTableWorkspace section={section} />
      ) : (
        <PanelCompactRows section={section} />
      )}
    </div>
  );
}
