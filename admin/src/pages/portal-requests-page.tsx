import {
  AdminConsolePageFrame,
  type BlueprintPage
} from "./admin-console-page-frame";
import {
  DataTable,
  MetricCard,
  QuotaMeter,
  SafeRef,
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
  kicker: "User Operations / Accounts & Resources",
  title: "Accounts & Resources",
  description: "Decision owner for accounts, resources, orders, quotas, lifecycle, and history.",
  statusLabel: "Decision owner",
  statusTone: "info",
  summary: <AccountsResourcesSummary />,
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

function AccountsResourcesSummary() {
  return (
    <div className="ops-metric-grid" aria-label="Accounts & Resources summary metrics">
      <MetricCard
        detail="Enabled 3 · Review 1 · Disabled 1"
        icon={<Users aria-hidden="true" />}
        label="Accounts"
        tone="info"
        value="5"
      />
      <MetricCard
        detail="Delivered 1 · Pending 1 · Expired 1"
        icon={<Activity aria-hidden="true" />}
        label="Orders"
        tone="success"
        value="3"
      />
      <MetricCard
        detail="Measured usage · audit note gate"
        icon={<Gauge aria-hidden="true" />}
        label="Quota"
        tone="warning"
        value="72%"
      />
      <MetricCard
        detail="Active, paused, expired, revoked"
        icon={<History aria-hidden="true" />}
        label="Lifecycle"
        tone="neutral"
        value="4 lanes"
      />
    </div>
  );
}

export function PortalRequestsPage({
  fixturePreviewEnabled = false
}: {
  fixturePreviewEnabled?: boolean;
}) {
  return (
    <AdminConsolePageFrame
      blueprint={accountsResourcesBlueprint}
      fixturePreviewEnabled={fixturePreviewEnabled}
    />
  );
}

type AccountDirectoryRow = {
  accountRef: string;
  state: "Enabled" | "Review" | "Disabled";
  resources: string;
  risk: "Normal" | "Quota review" | "Lifecycle locked";
};

const accountRows: AccountDirectoryRow[] = [
  { accountRef: "acct_safe_001", state: "Enabled", resources: "3 active", risk: "Normal" },
  { accountRef: "acct_safe_014", state: "Review", resources: "2 active", risk: "Quota review" },
  { accountRef: "acct_safe_022", state: "Disabled", resources: "1 expired", risk: "Lifecycle locked" }
];

function AccountDirectoryContent() {
  return (
    <div className="admin-operator-content" aria-label="Account Directory static operator content">
      <div className="admin-overview-pill-row" aria-label="Account Directory filters">
        <StatusChip label="All 5" tone="info" />
        <StatusChip label="Review 1" tone="warning" />
        <StatusChip label="Disabled 1" tone="neutral" />
      </div>
      <div className="admin-static-status-row" aria-label="Account Directory state coverage">
        <StatusChip label="Readonly" tone="neutral" />
        <StatusChip label="Needs review" tone="warning" />
        <StatusChip label="Disabled account" tone="neutral" />
        <StatusChip label="Backend action locked" tone="danger" />
      </div>
      <DataTable
        ariaLabel="Account Directory static table"
        columns={[
          { header: "Account", key: "account", render: (row: AccountDirectoryRow) => <SafeRef value={row.accountRef} /> },
          { header: "State", key: "state", render: (row) => <StatusChip label={row.state} tone={row.state === "Enabled" ? "success" : row.state === "Review" ? "warning" : "neutral"} /> },
          { header: "Resources", key: "resources", render: (row) => row.resources },
          { header: "Risk", key: "risk", render: (row) => row.risk }
        ]}
        getRowKey={(row) => row.accountRef}
        rows={accountRows}
      />
    </div>
  );
}

type ResourceOrderRow = {
  artifactRef: string;
  lifecycle: "Active" | "Pending receipt" | "Expired";
  orderRef: string;
  plan: string;
};

const resourceOrderRows: ResourceOrderRow[] = [
  { orderRef: "ord_safe_101", plan: "standard · 30d", artifactRef: "artifact_safe_101", lifecycle: "Active" },
  { orderRef: "ord_safe_102", plan: "trial · 7d", artifactRef: "artifact_safe_pending", lifecycle: "Pending receipt" },
  { orderRef: "ord_safe_103", plan: "standard · 30d", artifactRef: "artifact_safe_expired", lifecycle: "Expired" }
];

function ResourceOrdersContent() {
  return (
    <div className="admin-operator-content" aria-label="Resources and Orders static operator content">
      <div className="admin-owner-route-list" aria-label="Accounts and Resources owner panel routes">
        <article className="admin-owner-route-card">
          <div className="admin-owner-route-card-head">
            <strong>Resources & Orders</strong>
            <StatusChip label="Owner" tone="info" />
          </div>
          <p>Owns entitlement, artifact lifecycle, and delivery state review.</p>
        </article>
        <article className="admin-owner-route-card">
          <div className="admin-owner-route-card-head">
            <strong>Quota & Lifecycle</strong>
            <StatusChip label="Review gate" tone="warning" />
          </div>
          <p>Quota changes and pause/archive decisions stay locked behind reviewed backend gates.</p>
        </article>
      </div>
      <DataTable
        ariaLabel="Resources and Orders static table"
        columns={[
          { header: "Order", key: "order", render: (row: ResourceOrderRow) => <><SafeRef value={row.orderRef} /> · {row.plan}</> },
          {
            header: "Lifecycle",
            key: "lifecycle",
            render: (row) => (
              <StatusChip
                label={row.lifecycle}
                tone={row.lifecycle === "Active" ? "success" : row.lifecycle === "Pending receipt" ? "warning" : "neutral"}
              />
            )
          }
        ]}
        getRowKey={(row) => row.orderRef}
        rows={resourceOrderRows}
      />
      <div className="admin-static-status-row" aria-label="Resources and Orders safety states">
        <StatusChip label="Subscription output hidden" tone="danger" />
        <StatusChip label="Protected material blocked" tone="danger" />
        <StatusChip label="Empty result preserves table" tone="info" />
      </div>
    </div>
  );
}

function QuotaUsageContent() {
  return (
    <div className="admin-owner-compact-panel" aria-label="Quota and Usage static operator content">
      <div className="admin-owner-compact-head">
        <span>Quota policy</span>
        <strong>82% used</strong>
        <QuotaMeter ariaLabel="ord_safe_101 quota usage 82 percent" value={82} />
      </div>
      <p>Usage evidence is available, but quota decisions remain page-owned and readonly here.</p>
      <div className="admin-static-status-row">
        <StatusChip label="Near quota" tone="warning" />
        <StatusChip label="3 / 3 channels measured" tone="success" />
        <StatusChip label="Planned / locked" tone="neutral" />
      </div>
    </div>
  );
}

function LifecycleContent() {
  return (
    <div className="admin-owner-handoff-list" aria-label="Lifecycle static operator content">
      {[
        ["Account active", "Separate from order and artifact lifecycle.", "success"],
        ["Order paused", "Review state only; no collector decision.", "warning"],
        ["Archive candidate", "Execution waits for a Risk A gate.", "danger"]
      ].map(([title, body, tone]) => (
        <article className="admin-owner-handoff-item" key={title}>
          <span>Lifecycle lane</span>
          <strong>{title}</strong>
          <p>{body}</p>
          <StatusChip label={title} tone={tone as "success" | "warning" | "danger" | "neutral"} />
        </article>
      ))}
    </div>
  );
}

function HistoryEventsContent() {
  return (
    <div className="admin-operator-content" aria-label="History and Events static operator content">
      <div className="admin-owner-handoff-list" aria-label="Safe computed history">
        <article className="admin-owner-handoff-item">
          <span>Safe computed history</span>
          <strong>Quota evidence updated</strong>
          <p><SafeRef value="ord_safe_101" /> moved into quota review from Usage & Channels evidence.</p>
        </article>
        <article className="admin-owner-handoff-item">
          <span>Receipt context</span>
          <strong>Receipt pending</strong>
          <p><SafeRef value="artifact_safe_pending" /> has no durable history write yet.</p>
        </article>
      </div>
      <div className="admin-static-status-row" aria-label="History and Events backend states">
        <StatusChip label="Restricted backend locked" tone="neutral" />
        <StatusChip label="Note write unavailable" tone="warning" />
        <StatusChip label="Evidence redacted" tone="danger" />
      </div>
    </div>
  );
}
