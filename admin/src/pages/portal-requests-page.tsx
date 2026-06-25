import {
  AdminConsolePageFrame,
  type BlueprintPage
} from "./admin-console-page-frame";
import { ADMIN_EVIDENCE_SURFACE_CONTRACTS } from "../app/admin-evidence-contract";
import {
  EvidenceChartPanel,
  EvidenceLogPanel,
  MetricCard,
  type MetricTone,
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

function AccountDirectoryContent() {
  return (
    <PanelCompactRows
      ariaLabel="Account Directory static operator content"
      footer="Directory"
      rows={[
        {
          actionLabel: "Open",
          detail: "Order ord_2048 · Plan standard",
          label: "user_001",
          meta: "Risk Med",
          statusLabel: "Active",
          tone: "info"
        },
        {
          actionLabel: "Open",
          detail: "Order ord_2047 · Plan trial",
          label: "user_002",
          meta: "Risk Low",
          statusLabel: "Active",
          tone: "success"
        }
      ]}
      subtitle="Users and account-level resources"
    />
  );
}

function ResourceOrdersContent() {
  return (
    <PanelCompactRows
      ariaLabel="Resources and Orders static operator content"
      footer="Resource list"
      rows={[
        {
          actionLabel: "Open",
          detail: "Sub sub_8192 · Channel hk-01",
          label: "ord_2048",
          meta: "State Live",
          statusLabel: "Synced",
          tone: "success"
        },
        {
          actionLabel: "Open",
          detail: "Sub sub_8191 · Channel sg-01",
          label: "ord_2047",
          meta: "State Pending",
          statusLabel: "Watch",
          tone: "warning"
        }
      ]}
      subtitle="Order to subscription mapping"
    />
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
    <PanelCompactRows
      ariaLabel="Lifecycle static operator content"
      footer="Lifecycle subpage"
      rows={[
        {
          actionLabel: "Open",
          detail: "Account user_002 · Order ord_2047",
          label: "pause_check",
          meta: "When Now",
          statusLabel: "Review",
          tone: "warning"
        },
        {
          actionLabel: "Open",
          detail: "Account user_003 · Order ord_2046",
          label: "archive_due",
          meta: "When 2d",
          statusLabel: "Due",
          tone: "neutral"
        }
      ]}
      subtitle="Page-local lifecycle status"
    />
  );
}

type CompactPanelRow = {
  actionLabel: string;
  detail: string;
  label: string;
  meta: string;
  statusLabel: string;
  tone: MetricTone;
};

function PanelCompactRows({
  ariaLabel,
  footer,
  rows,
  subtitle
}: {
  ariaLabel: string;
  footer: string;
  rows: CompactPanelRow[];
  subtitle: string;
}) {
  return (
    <div className="admin-operator-content admin-panel-compact-card" aria-label={ariaLabel}>
      <p className="admin-panel-compact-subtitle">{subtitle}</p>
      <div className="admin-compact-row-list" aria-label={`${footer} compact rows`}>
        {rows.map((row) => (
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
            <span className="admin-compact-data-row-action">{row.actionLabel}</span>
          </article>
        ))}
      </div>
      <div className="admin-overview-panel-footer" aria-hidden="true">
        <span>{footer}</span>
        <span>•••</span>
      </div>
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
