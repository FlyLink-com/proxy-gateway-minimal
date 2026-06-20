import { useEffect } from "react";
import {
  Activity,
  Bell,
  Gauge,
  HeartPulse,
  Route,
  ShieldAlert
} from "lucide-react";
import { type AdminPage } from "../app/navigation";
import {
  MetricCard,
  RiskQueue,
  StatusChip,
  type RiskQueueItem
} from "../components/primitives";
import {
  AdminConsolePageFrame,
  type BlueprintPage
} from "./admin-console-page-frame";

export function DashboardPage({
  fixturePreviewEnabled = false,
  onNavigate,
  onRiskCountChange
}: {
  fixturePreviewEnabled?: boolean;
  onNavigate?: (page: AdminPage) => void;
  onRiskCountChange?: (count: number) => void;
}) {
  useEffect(() => {
    onRiskCountChange?.(fixturePreviewEnabled ? 2 : 0);
  }, [fixturePreviewEnabled, onRiskCountChange]);

  return (
    <AdminConsolePageFrame
      blueprint={overviewBlueprint(onNavigate)}
      fixturePreviewEnabled={fixturePreviewEnabled}
    />
  );
}

export function overviewBlueprint(onNavigate?: (page: AdminPage) => void): BlueprintPage {
  return {
    page: "dashboard",
    ariaLabel: "Operations Overview page header",
    kicker: "Overview / Operations Overview",
    title: "Operations Overview",
    description: "First-screen operator view for platform health, risk routing, and the next owner page.",
    statusLabel: "Summary and routing",
    statusTone: "info",
    modules: [
      {
        navId: "health-summary",
        container: {
          category: "monitoring",
          container: "Overview metric widget set",
          dataAdapter: "Static design draft now; later safe platform overview and usage freshness summaries.",
          layoutPolicy: "Fixed monitoring panel; operators can hide it and restore it from navigation.",
          performanceBoundary: "Independent widget render; no owner-page table or ledger mount.",
          interactionModel: "Read-only summary with owner-page routing."
        },
        content: <OverviewHealthSummary />,
        purpose: "Summarize platform health without owning the account, quota, channel, or receipt detail collections.",
        contentFields: [
          "Platform health · summary state",
          "Risk counter · severity split",
          "Freshness · P95 / latest age",
          "Coverage · channel availability"
        ],
        states: [
          "Loading summary",
          "Disconnected sources",
          "Ready",
          "Stale or partial data"
        ],
        uiSurface: "operations-health",
        ownership: "Overview summarizes and routes; detailed evidence belongs to owner pages.",
        boundaries: [
          "No account or order ledger",
          "No channel or receipt ledger",
          "No quota edit or lifecycle action"
        ],
        nextStep: "Reconnect redacted summary API after the module layout is accepted."
      },
      {
        navId: "risk-queue",
        container: {
          category: "audit-workflow",
          container: "Review candidate queue widget",
          dataAdapter: "Static candidate taxonomy now; later computed safe risk candidates and durable case handoff.",
          layoutPolicy: "Hideable summary queue; detailed case workflow stays in Audit & Cases.",
          performanceBoundary: "Queue rows stay bounded and do not mount object history by default.",
          interactionModel: "Select and route only; no close, approve, or mutation actions."
        },
        content: <OverviewRiskCandidates />,
        purpose: "Show the highest-priority computed review candidates and the owner page that should handle them.",
        contentFields: [
          "Severity · high / medium / low",
          "Reason · quota / delay / receipt",
          "Affected refs · safe only",
          "Candidates · bounded count",
          "Owner route · page target"
        ],
        states: [
          "Empty queue",
          "Filtered by severity",
          "Warning",
          "Danger"
        ],
        uiSurface: "operations-risk",
        ownership: "Overview owns next review target selection only.",
        boundaries: [
          "No durable case close or false-positive workflow",
          "No object timeline",
          "No write action"
        ],
        nextStep: "Map computed candidates to Audit & Cases after durable case/history facts exist."
      },
      {
        navId: "next-actions",
        container: {
          category: "audit-workflow",
          container: "Operator routing widget",
          dataAdapter: "Static route contract now; later page contract and computed attention signals.",
          layoutPolicy: "Fixed panel surface; operators can hide it from the workbench and restore it from navigation.",
          performanceBoundary: "No backend write path and no owner-page data fetch inside this widget.",
          interactionModel: "Open owner page or future gated workflow entry."
        },
        content: <OverviewRouteCards />,
        purpose: "Route operators to Accounts & Resources or Usage & Channels instead of repeating those collections here.",
        contentFields: [
          "Owner page · action route",
          "Reason · ownership handoff",
          "Gate · review status",
          "Future areas · locked"
        ],
        states: [
          "Ready route",
          "Disabled route",
          "Locked future area"
        ],
        uiSurface: "operations-routing",
        ownership: "Overview decides where the operator should inspect next.",
        boundaries: [
          "No account create/disable",
          "No collector activation",
          "No production execution"
        ],
        nextStep: "Wire panel routes to section-level deep links after page modules are finalized.",
        actions: (
          <div className="admin-blueprint-action-row">
            <button className="primary-button" type="button" onClick={() => onNavigate?.("portalRequests")}>
              Open Accounts & Resources
            </button>
            <button className="ghost-button" type="button" onClick={() => onNavigate?.("usageMonitor")}>
              Open Usage & Channels
            </button>
          </div>
        )
      }
    ]
  };
}

function OverviewHealthSummary() {
  return (
    <div className="admin-operator-content" aria-label="Operations Overview static health content">
      <div className="ops-metric-grid">
        <MetricCard
          detail="Ready for review · no execution path"
          icon={<HeartPulse aria-hidden="true" />}
          label="Platform health"
          tone="success"
          trend={{ values: [86, 88, 91, 90, 92, 94] }}
          value="Good"
        />
        <MetricCard
          detail="5 high · 9 medium · 4 low"
          icon={<ShieldAlert aria-hidden="true" />}
          label="Risk candidates"
          tone="danger"
          trend={{ values: [8, 9, 12, 13, 16, 18] }}
          value="18"
        />
        <MetricCard
          detail="P95 collection age"
          icon={<Activity aria-hidden="true" />}
          label="Freshness"
          tone="info"
          trend={{ values: [4, 3, 3, 2, 2, 2] }}
          value="2m 14s"
        />
        <MetricCard
          detail="Measured channel coverage"
          icon={<Gauge aria-hidden="true" />}
          label="Channel coverage"
          tone="success"
          trend={{ values: [92, 94, 96, 97, 98, 99] }}
          value="98.6%"
        />
      </div>
      <div className="admin-static-status-row" aria-label="Overview source states">
        <StatusChip label="Readonly" tone="neutral" />
        <StatusChip label="Stale guard visible" tone="warning" />
        <StatusChip label="Disconnected keeps layout" tone="info" />
        <StatusChip label="No production action" tone="danger" />
      </div>
    </div>
  );
}

const overviewRiskItems: RiskQueueItem[] = [
  {
    ref: "risk-over-limit",
    title: "Order traffic over limit",
    severity: "critical",
    severityLabel: "High",
    objectType: "order",
    objectRef: "ord_safe_2048",
    reasonLabel: "Quota evidence"
  },
  {
    ref: "risk-collection-delay",
    title: "Collection delay",
    severity: "warning",
    severityLabel: "Medium",
    objectType: "collector",
    objectRef: "collector_safe_sgp",
    reasonLabel: "Stale usage"
  },
  {
    ref: "risk-receipt-missing",
    title: "Receipt missing",
    severity: "critical",
    severityLabel: "High",
    objectType: "channel",
    objectRef: "channel_safe_hy2",
    reasonLabel: "Receipt gap"
  },
  {
    ref: "risk-case-locked",
    title: "Durable case backend locked",
    severity: "neutral",
    severityLabel: "Locked",
    objectType: "case",
    objectRef: "case_backend_pending",
    reasonLabel: "Future Audit & Cases"
  }
];

function OverviewRiskCandidates() {
  return (
    <RiskQueue
      countLabel="Overview risk candidates"
      description="Computed safe candidates route to the owning page; closure and approval workflows stay locked."
      footer={<span className="panel-link panel-link-disabled">Audit & Cases locked until durable history exists</span>}
      items={overviewRiskItems}
      title="Review candidates"
    />
  );
}

function OverviewRouteCards() {
  return (
    <div className="admin-static-card-grid" aria-label="Overview owner page routing content">
      <article className="admin-static-card">
        <span><Route aria-hidden="true" /> Owner route</span>
        <strong>Accounts & Resources</strong>
        <p>Review account state, order lifecycle, quota policy, and subscription artifact status there.</p>
        <StatusChip label="Decision owner" tone="info" />
      </article>
      <article className="admin-static-card">
        <span><Activity aria-hidden="true" /> Evidence route</span>
        <strong>Usage & Channels</strong>
        <p>Inspect freshness, channel coverage, usage ledger rows, anomalies, receipts, and collectors there.</p>
        <StatusChip label="Evidence owner" tone="success" />
      </article>
      <article className="admin-static-card admin-static-card-muted">
        <span><Bell aria-hidden="true" /> Future queue</span>
        <strong>Audit & Cases</strong>
        <p>Planned durable case inbox, notes, close/reopen review, and object history remain locked.</p>
        <StatusChip label="Planned / locked" tone="neutral" />
      </article>
    </div>
  );
}
