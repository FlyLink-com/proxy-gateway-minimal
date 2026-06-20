import {
  AdminConsolePageFrame,
  type BlueprintPage
} from "./admin-console-page-frame";
import {
  DataTable,
  ObjectTimeline,
  QuotaMeter,
  SafeRef,
  StatusChip
} from "../components/primitives";

export const accountsResourcesBlueprint: BlueprintPage = {
  page: "portalRequests",
  ariaLabel: "Accounts & Resources page header",
  kicker: "User Operations / Accounts & Resources",
  title: "Accounts & Resources",
  description: "Decision owner for user accounts, resources, orders, subscription artifacts, quota, lifecycle, and safe history context.",
  statusLabel: "Decision owner",
  statusTone: "info",
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
        dataAdapter: "Static quota fields now; later existing traffic-limit update API plus audit-note contract.",
        layoutPolicy: "Config panel with preview and reset controls later; not a monitoring ledger.",
        performanceBoundary: "Quota calculations remain derived from supplied summaries, not repeated polling.",
        interactionModel: "Review policy and prepare edit; save action waits for audit gate."
      },
      content: <QuotaUsageContent />,
      purpose: "Own quota policy decisions while using usage collection only as evidence.",
      contentFields: [
        "Default quota · policy value",
        "Edited quota · review value",
        "Usage · used / total",
        "Measured channels · count",
        "Audit note · required gate"
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
      nextStep: "Reconnect quota editor only after audit note and backend update contract are reviewed."
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
        dataAdapter: "Static event slots now; later durable audit and case-history adapter.",
        layoutPolicy: "Preview section until Audit & Cases owns durable history.",
        performanceBoundary: "Timeline content stays lazy and bounded until durable history exists.",
        interactionModel: "Read-only context; no note write or case close actions."
      },
      content: <HistoryEventsContent />,
      purpose: "Show safe computed events and case candidates until durable audit and case history exists.",
      contentFields: [
        "Event · safe label",
        "Object · safe ref",
        "Source · owner page",
        "Case · candidate reason",
        "Audit · future entry slot"
      ],
      states: [
        "No computed events",
        "Context available",
        "Case backend locked",
        "Audit write unavailable"
      ],
      uiSurface: "history-events",
      ownership: "Provides review context for accounts and resources; durable history later moves to Audit & Cases.",
      boundaries: [
        "No raw logs",
        "No raw SQLite row",
        "No note write until durable case backend exists"
      ],
      nextStep: "Hand durable history to Audit & Cases after the case/history backend contract lands."
    }
  ]
};

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
      <DataTable
        ariaLabel="Resources and Orders static table"
        columns={[
          { header: "Order", key: "order", render: (row: ResourceOrderRow) => <SafeRef value={row.orderRef} /> },
          { header: "Plan", key: "plan", render: (row) => row.plan },
          { header: "Artifact", key: "artifact", render: (row) => <SafeRef value={row.artifactRef} /> },
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
    <div className="admin-static-card-grid admin-static-card-grid-compact" aria-label="Quota and Usage static operator content">
      <article className="admin-static-card">
        <span>Quota policy</span>
        <strong>82% used</strong>
        <QuotaMeter ariaLabel="ord_safe_101 quota usage 82 percent" value={82} />
        <StatusChip label="Near quota" tone="warning" />
      </article>
      <article className="admin-static-card">
        <span>Collection source</span>
        <strong>3 / 3 channels</strong>
        <p>Usage evidence is available, but quota decisions remain page-owned and readonly here.</p>
        <StatusChip label="Measured" tone="success" />
      </article>
      <article className="admin-static-card admin-static-card-muted">
        <span>Audit gate</span>
        <strong>Quota edits locked</strong>
        <p>Future edits require an audit note and reviewed backend update contract.</p>
        <StatusChip label="Planned / locked" tone="neutral" />
      </article>
    </div>
  );
}

function LifecycleContent() {
  return (
    <div className="admin-static-card-grid" aria-label="Lifecycle static operator content">
      {[
        ["Account active", "Account state is separate from order and artifact lifecycle.", "success"],
        ["Order paused", "Pause is a lifecycle review state, not a collector state.", "warning"],
        ["Artifact revoked", "Revocation is separate from runtime credential availability.", "neutral"],
        ["Archive candidate", "Archive remains a review target until a Risk A gate approves execution.", "danger"]
      ].map(([title, body, tone]) => (
        <article className="admin-static-card" key={title}>
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
      <ObjectTimeline
        events={[
          {
            ref: "event-safe-001",
            actionLabel: "Quota evidence updated",
            objectRef: "ord_safe_101",
            objectType: "order",
            occurredAtLabel: "12m ago",
            severity: "warning",
            sourceLabel: "Usage & Channels",
            summary: "Order moved into quota review"
          },
          {
            ref: "event-safe-002",
            actionLabel: "Receipt pending",
            objectRef: "artifact_safe_pending",
            objectType: "artifact",
            occurredAtLabel: "18m ago",
            severity: "info",
            sourceLabel: "Receipt collector",
            summary: "Receipt evidence is not durable yet"
          }
        ]}
        title="Safe computed history"
      />
      <div className="admin-static-status-row" aria-label="History and Events backend states">
        <StatusChip label="Audit backend locked" tone="neutral" />
        <StatusChip label="Note write unavailable" tone="warning" />
        <StatusChip label="Evidence redacted" tone="danger" />
      </div>
    </div>
  );
}
