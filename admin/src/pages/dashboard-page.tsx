import { Activity, AlertTriangle, Clock3, RadioTower } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { ADMIN_EVIDENCE_SURFACE_CONTRACTS } from "../app/admin-evidence-contract";
import { type AdminPage } from "../app/navigation";
import {
  EvidenceChartPanel,
  EvidenceLogPanel,
  MetricCard,
  type MetricTone
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
    description: "Health, risk routing, and next action only; detail ledgers stay on owner pages.",
    statusLabel: "Summary and routing",
    statusTone: "info",
    evidence: <OperationsEvidence />,
    modules: [
      {
        navId: "health-summary",
        container: {
          category: "monitoring",
          container: "Overview metric widget set",
          dataAdapter: "Static design draft now; later safe platform overview and usage freshness summaries.",
          layoutPolicy: "Fixed monitoring panel; operators inspect it in the page workspace and recover it through System Search.",
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
          layoutPolicy: "Page-owned summary queue; detailed restricted workflow is not registered for normal operators.",
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
          layoutPolicy: "Fixed panel surface; operators inspect it in the page workspace and recover it through System Search.",
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
      },
      {
        navId: "review-candidates",
        container: {
          category: "audit-workflow",
          container: "Review candidate widget",
          dataAdapter: "Static candidate taxonomy now; later computed review candidates and owner-route signals.",
          layoutPolicy: "Fixed compact panel beside Risk Queue and Next Actions.",
          performanceBoundary: "Candidate rows stay bounded and do not mount object history by default.",
          interactionModel: "Route to owner page only; no close, approve, or mutation actions."
        },
        content: <OverviewReviewCandidates onNavigate={onNavigate} />,
        containmentStrategy: "pagination",
        purpose: "Keep a bounded list of review candidates without turning Overview into the durable case workflow.",
        contentFields: [
          "Candidate · safe ref",
          "Issue · owner signal",
          "Age · review freshness",
          "Route · page target"
        ],
        states: [
          "Review",
          "Watch",
          "Open"
        ],
        uiSurface: "operations-review-candidates",
        ownership: "Overview owns candidate surfacing only; owner pages hold the durable detail.",
        boundaries: [
          "No durable case close workflow",
          "No object timeline",
          "No production execution"
        ],
        nextStep: "Attach computed attention signals after owner pages expose section-level route ids."
      }
    ]
  };
}

function OperationsEvidence() {
  return (
    <>
      <EvidenceChartPanel
        ariaLabel="Platform Metrics evidence panel"
        contract={ADMIN_EVIDENCE_SURFACE_CONTRACTS.operationsMetrics}
        description="Bounded first-screen evidence for health, risk routing, and collection freshness."
        series={[
          { label: "Freshness", tone: "success", values: [58, 54, 62, 49, 46, 38, 36] },
          { label: "Coverage", tone: "info", values: [82, 78, 84, 83, 88, 93, 99] },
          { label: "Risk", tone: "warning", values: [12, 18, 20, 17, 15, 14, 16] }
        ]}
        stats={[
          { label: "Health state", tone: "success", value: "OK" },
          { label: "Risk total", tone: "danger", value: "18 total" },
          { label: "Freshness age", tone: "info", value: "2m p95" }
        ]}
        title="Platform Metrics"
      />
      <EvidenceLogPanel
        ariaLabel="Platform Event Log evidence panel"
        contract={ADMIN_EVIDENCE_SURFACE_CONTRACTS.operationsEventLog}
        description="Safe routing facts only; owner-page ledgers stay outside Operations Overview."
        entries={[
          {
            detail: "Risk candidates refreshed; quota and receipt evidence remains on owner pages.",
            source: "safe summary",
            time: "12:30",
            title: "Risk queue updated",
            tone: "warning"
          },
          {
            detail: "Accounts & Resources remains the decision owner for quota and lifecycle review.",
            source: "route contract",
            time: "12:18",
            title: "Owner route verified",
            tone: "info"
          },
          {
            detail: "Usage & Channels exposes freshness and channel coverage evidence without mutation actions.",
            source: "evidence contract",
            time: "12:04",
            title: "Collection evidence fresh",
            tone: "success"
          }
        ]}
        title="Platform Event Log"
      />
    </>
  );
}

function OverviewHealthSummary() {
  return (
    <div className="admin-operator-content" aria-label="Operations Overview static health content">
      <div className="admin-overview-metric-grid" aria-label="Operations Overview metric cards">
        <OverviewMetricCard
          body="Ready for review"
          icon={<Activity aria-hidden="true" />}
          statusLabel="Good"
          statusTone="success"
          title="Platform health"
          tone="success"
          trend={[72, 74, 73, 76, 77, 79, 81]}
          value="Good"
        />
        <OverviewMetricCard
          body="High 4 · Med 9"
          icon={<AlertTriangle aria-hidden="true" />}
          statusLabel="Review"
          statusTone="danger"
          title="Risk cases"
          tone="danger"
          trend={[6, 8, 7, 10, 12, 15, 18]}
          value="18"
        />
        <OverviewMetricCard
          body="P95 sample age"
          icon={<Clock3 aria-hidden="true" />}
          statusLabel="Good"
          statusTone="info"
          title="Freshness"
          tone="info"
          trend={[180, 172, 160, 148, 140, 136, 134]}
          value="2m 14s"
        />
        <OverviewMetricCard
          body="Available share"
          icon={<RadioTower aria-hidden="true" />}
          statusLabel="Good"
          statusTone="success"
          title="Coverage"
          tone="success"
          trend={[96, 97, 97.4, 98, 98.2, 98.5, 98.6]}
          value="98.6%"
        />
      </div>
    </div>
  );
}

function OverviewMetricCard({
  body,
  icon,
  statusLabel,
  statusTone,
  title,
  tone,
  trend,
  value
}: {
  body: string;
  icon: ReactNode;
  statusLabel: string;
  statusTone: MetricTone;
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
      status={{
        label: statusLabel,
        tone: statusTone
      }}
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
    actionLabel: "Open",
    detail: "Order ord_2048 · Owner Usage",
    meta: "SLA 4m",
    ref: "case_012",
    statusLabel: "Open",
    title: "case_012",
    tone: "info"
  },
  {
    actionLabel: "Open",
    detail: "Order ord_2047 · Owner Accounts",
    meta: "SLA 12m",
    ref: "case_017",
    statusLabel: "Review",
    title: "case_017",
    tone: "warning"
  }
] satisfies Array<{
  actionLabel: string;
  detail: string;
  meta: string;
  ref: string;
  statusLabel: string;
  title: string;
  tone: MetricTone;
}>;

const overviewNextActionItems = [
  {
    actionLabel: "Open",
    detail: "Route Accounts · Owner Operator",
    meta: "Due Now",
    ref: "handoff",
    statusLabel: "Ready",
    title: "handoff",
    tone: "success",
    target: "portalRequests"
  },
  {
    actionLabel: "Open",
    detail: "Route Usage · Owner Collector",
    meta: "Due 8m",
    ref: "refresh",
    statusLabel: "Queued",
    title: "refresh",
    tone: "info",
    target: "usageMonitor"
  }
] satisfies Array<{
  actionLabel: string;
  detail: string;
  meta: string;
  ref: string;
  statusLabel: string;
  title: string;
  tone: MetricTone;
  target: AdminPage;
}>;

const overviewReviewCandidateItems = [
  {
    actionLabel: "Open",
    detail: "Issue delay · Signal P95",
    meta: "Age 14m",
    ref: "ord_2048",
    statusLabel: "Review",
    title: "ord_2048",
    tone: "warning",
    target: "usageMonitor"
  },
  {
    actionLabel: "Open",
    detail: "Issue quota · Signal 90%",
    meta: "Age 1h",
    ref: "acct_002",
    statusLabel: "Watch",
    title: "acct_002",
    tone: "warning",
    target: "portalRequests"
  }
] satisfies Array<{
  actionLabel: string;
  detail: string;
  meta: string;
  ref: string;
  statusLabel: string;
  title: string;
  tone: MetricTone;
  target: AdminPage;
}>;

function DashboardCompactRow({
  actionLabel = "Open",
  detail,
  label,
  meta,
  muted = false,
  onClick,
  statusLabel,
  tone
}: {
  actionLabel?: string;
  detail: string;
  label: string;
  meta?: string;
  muted?: boolean;
  onClick?: () => void;
  statusLabel: string;
  tone: MetricTone;
}) {
  const className = [
    "admin-compact-data-row",
    `admin-compact-data-row-${tone}`,
    muted ? "admin-compact-data-row-muted" : ""
  ].filter(Boolean).join(" ");

  const rowContent = (
    <>
      <span className="admin-compact-data-row-main">
        <strong>{label}</strong>
        <span className="admin-compact-data-row-detail">{detail}</span>
      </span>
      {meta ? <span className="admin-compact-data-row-meta">{meta}</span> : null}
      <span className="admin-compact-data-row-status">{statusLabel}</span>
      <span className="admin-compact-data-row-action">{actionLabel}</span>
    </>
  );

  if (onClick) {
    return (
      <button
        className={className}
        data-clickable="true"
        data-figma-component="DataRowCompact"
        data-state-tone={tone}
        data-ui-surface="compact-row"
        type="button"
        onClick={onClick}
      >
        {rowContent}
      </button>
    );
  }

  return (
    <article
      className={className}
      data-figma-component="DataRowCompact"
      data-state-tone={tone}
      data-ui-surface="compact-row"
    >
      {rowContent}
    </article>
  );
}

function OverviewRiskCandidates() {
  return (
    <section className="admin-overview-compact-stack" aria-label="Risk Queue">
      <div className="admin-overview-section-heading">
        <h3>Risk queue</h3>
        <p>Cases ranked by owner route</p>
      </div>
      <div className="admin-compact-row-list" aria-label="Risk Queue rows">
        {overviewRiskItems.map((item) => (
          <DashboardCompactRow
            actionLabel={item.actionLabel}
            detail={item.detail}
            key={item.ref}
            label={item.title}
            meta={item.meta}
            statusLabel={item.statusLabel}
            tone={item.tone}
          />
        ))}
      </div>
      <div className="admin-overview-panel-footer" aria-hidden="true">
        <span>Queue actions</span>
        <span>•••</span>
      </div>
    </section>
  );
}

function OverviewRouteCards({ onNavigate }: { onNavigate?: (page: AdminPage) => void }) {
  return (
    <section className="admin-overview-compact-stack" aria-label="Overview owner page routing content">
      <div className="admin-overview-section-heading">
        <h3>Next actions</h3>
        <p>Route handoff for reviewers</p>
      </div>
      <div className="admin-compact-row-list" aria-label="Overview routing rows">
        {overviewNextActionItems.map((item) => (
          <DashboardCompactRow
            actionLabel={item.actionLabel}
            detail={item.detail}
            key={item.ref}
            label={item.title}
            meta={item.meta}
            onClick={() => onNavigate?.(item.target)}
            statusLabel={item.statusLabel}
            tone={item.tone}
          />
        ))}
      </div>
      <div className="admin-overview-panel-footer" aria-hidden="true">
        <span>Action lane</span>
        <span>•••</span>
      </div>
    </section>
  );
}

function OverviewReviewCandidates({ onNavigate }: { onNavigate?: (page: AdminPage) => void }) {
  return (
    <section className="admin-overview-compact-stack" aria-label="Overview review candidates">
      <div className="admin-overview-section-heading">
        <h3>Review candidates</h3>
        <p>Items requiring operator check</p>
      </div>
      <div className="admin-compact-row-list" aria-label="Overview review candidate rows">
        {overviewReviewCandidateItems.map((item) => (
          <DashboardCompactRow
            actionLabel={item.actionLabel}
            detail={item.detail}
            key={item.ref}
            label={item.title}
            meta={item.meta}
            onClick={() => onNavigate?.(item.target)}
            statusLabel={item.statusLabel}
            tone={item.tone}
          />
        ))}
      </div>
      <div className="admin-overview-panel-footer" aria-hidden="true">
        <span>Candidate list</span>
        <span>•••</span>
      </div>
    </section>
  );
}
