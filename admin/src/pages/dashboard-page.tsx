import { Activity, AlertTriangle, Clock3, RadioTower } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { type AdminPage } from "../app/navigation";
import {
  MetricCard,
  type MetricTone,
  StatusChip
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
    description: "First-screen operator view for platform health, computed risk routing, and next owner page. It summarizes; it does not own account, quota, channel, or receipt ledgers.",
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
        containmentStrategy: "not-applicable",
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
          layoutPolicy: "Hideable summary queue; detailed restricted workflow is not registered for normal operators.",
          performanceBoundary: "Queue rows stay bounded and do not mount object history by default.",
          interactionModel: "Select and route only; no close, approve, or mutation actions."
        },
        content: <OverviewRiskCandidates />,
        containmentStrategy: "pagination",
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
        nextStep: "Map computed candidates to the restricted case workflow after durable case/history facts exist."
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
        content: <OverviewRouteCards onNavigate={onNavigate} />,
        containmentStrategy: "not-applicable",
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
        actions: undefined
      }
    ]
  };
}

function OverviewHealthSummary() {
  return (
    <div className="admin-operator-content" aria-label="Operations Overview static health content">
      <div className="admin-overview-metric-grid" aria-label="Operations Overview metric cards">
        <OverviewMetricCard
          body="Good · reviewable · latest source safe"
          icon={<Activity aria-hidden="true" />}
          title="Platform health"
          tone="success"
          trend={[72, 74, 73, 76, 77, 79, 81]}
          value="Good"
        />
        <OverviewMetricCard
          body="18 total · 5 high · routes only"
          icon={<AlertTriangle aria-hidden="true" />}
          title="Risk candidates"
          tone="danger"
          trend={[6, 8, 7, 10, 12, 15, 18]}
          value="18"
        />
        <OverviewMetricCard
          body="2m 14s · stale threshold visible"
          icon={<Clock3 aria-hidden="true" />}
          title="Freshness P95"
          tone="info"
          trend={[180, 172, 160, 148, 140, 136, 134]}
          value="2m 14s"
        />
        <OverviewMetricCard
          body="98.6% · aggregate only"
          icon={<RadioTower aria-hidden="true" />}
          title="Channel coverage"
          tone="success"
          trend={[96, 97, 97.4, 98, 98.2, 98.5, 98.6]}
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

function OverviewMetricCard({
  body,
  icon,
  title,
  tone,
  trend,
  value
}: {
  body: string;
  icon: ReactNode;
  title: string;
  tone: MetricTone;
  trend: number[];
  value: string;
}) {
  return (
    <MetricCard
      detail={body}
      icon={icon}
      label={title}
      tone={tone}
      trend={{
        ariaLabel: `${title} safe trend`,
        values: trend
      }}
      value={value}
    />
  );
}

const overviewRiskItems = [
  {
    ref: "risk-over-limit",
    title: "Order traffic over limit",
    count: "12 affected",
    owner: "Accounts & Resources"
  },
  {
    ref: "risk-collection-delay",
    title: "Collection delay",
    count: "6 affected",
    owner: "Usage & Channels"
  },
  {
    ref: "risk-receipt-missing",
    title: "Receipt missing",
    count: "3 affected",
    owner: "Usage & Channels"
  },
  {
    ref: "risk-case-locked",
    title: "Future durable case",
    count: "Locked",
    owner: "Audit & Cases"
  }
];

function OverviewRiskCandidates() {
  return (
    <section className="admin-overview-section-card" aria-label="Risk Queue">
      <div className="admin-overview-section-heading">
        <h3>Risk Queue</h3>
        <p>Computed review candidates. No case close, approval, or mutation action here.</p>
      </div>
      <div className="admin-overview-pill-row" aria-label="Risk Queue filters">
        <StatusChip label="All 18" tone="info" />
        <StatusChip label="High 5" tone="danger" />
      </div>
      <div className="admin-overview-table-list" aria-label="Risk Queue rows">
        {overviewRiskItems.map((item) => (
          <article className="admin-overview-table-row" key={item.ref}>
            <span>{item.title}</span>
            <strong>{item.count}</strong>
            <span>{item.owner}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function OverviewRouteCards({ onNavigate }: { onNavigate?: (page: AdminPage) => void }) {
  return (
    <section className="admin-overview-section-card" aria-label="Overview owner page routing content">
      <div className="admin-overview-section-heading">
        <h3>Next Actions</h3>
        <p>Route operators to the page that owns the detailed collection.</p>
      </div>
      <div className="admin-overview-action-list">
        <button className="admin-overview-action-card" type="button" onClick={() => onNavigate?.("portalRequests")}>
          <StatusChip label="INFO" tone="info" />
          <strong>Open Accounts & Resources</strong>
          <span>Account/order/quota/lifecycle decisions are owned there.</span>
        </button>
        <button className="admin-overview-action-card" type="button" onClick={() => onNavigate?.("usageMonitor")}>
          <StatusChip label="INFO" tone="info" />
          <strong>Open Usage & Channels</strong>
          <span>Usage collection trust, channel coverage, receipts, and anomalies are owned there.</span>
        </button>
        <article className="admin-overview-action-card admin-overview-action-card-muted">
          <StatusChip label="LOCKED" tone="neutral" />
          <strong>Audit & Cases locked</strong>
          <span>Future durable case workflow remains gated.</span>
        </article>
      </div>
    </section>
  );
}
