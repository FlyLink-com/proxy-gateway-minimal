import { Activity, AlertTriangle, Clock3, RadioTower } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { ADMIN_EVIDENCE_SURFACE_CONTRACTS } from "../app/admin-evidence-contract";
import { ADMIN_TABLE_QUERY_STATE_SCHEMA } from "../app/admin-table-query-state";
import { type AdminPage } from "../app/navigation";
import {
  createOperationsOverviewOwnerPageModel,
  OPERATIONS_OVERVIEW_OWNER_MODEL_SCHEMA,
  type OperationsOverviewMetric,
  type OperationsOverviewOwnerPageModel,
  type OperationsOverviewSection
} from "../app/operations-overview-owner-model";
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
  onNavigate?: (page: AdminPage, navId?: string) => void;
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

export function overviewBlueprint(onNavigate?: (page: AdminPage, navId?: string) => void): BlueprintPage {
  const blueprint: BlueprintPage = {
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
        content: null,
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
        content: null,
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
        content: null,
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
        content: null,
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
  const ownerModel = createOperationsOverviewOwnerPageModel(blueprint);

  return {
    ...blueprint,
    modules: blueprint.modules.map((module) => ({
      ...module,
      content: renderOperationsOverviewModule(module.navId, ownerModel, onNavigate)
    }))
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

function renderOperationsOverviewModule(
  navId: string,
  ownerModel: OperationsOverviewOwnerPageModel,
  onNavigate?: (page: AdminPage, navId?: string) => void
) {
  const section = ownerModel.visibleSections.find((candidate) => candidate.navId === navId);
  if (!section) {
    return null;
  }

  switch (navId) {
    case "health-summary":
      return <OverviewHealthSummary section={section} />;
    case "risk-queue":
      return <OverviewRiskCandidates section={section} />;
    case "next-actions":
      return <OverviewRouteCards onNavigate={onNavigate} section={section} />;
    case "review-candidates":
      return <OverviewReviewCandidates onNavigate={onNavigate} section={section} />;
    default:
      return null;
  }
}

function OverviewHealthSummary({ section }: { section: OperationsOverviewSection }) {
  return (
    <div
      className="admin-operator-content"
      aria-label="Operations Overview owner model content"
      {...ownerModelDataAttributes(section)}
    >
      <div className="admin-overview-metric-grid" aria-label="Operations Overview metric cards">
        {section.metrics.map((metric) => (
          <OverviewMetricCard
            icon={iconForOperationsMetric(metric)}
            key={metric.title}
            metric={metric}
          />
        ))}
      </div>
    </div>
  );
}

function OverviewMetricCard({
  icon,
  metric
}: {
  icon: ReactNode;
  metric: OperationsOverviewMetric;
}) {
  return (
    <MetricCard
      detail={metric.body}
      icon={icon}
      label={metric.title}
      status={{
        label: metric.statusLabel,
        tone: metric.statusTone
      }}
      tone={metric.tone}
      trend={{
        ariaLabel: `${metric.title} safe trend`,
        values: metric.trend
      }}
      value={metric.value}
    />
  );
}

function iconForOperationsMetric(metric: OperationsOverviewMetric) {
  switch (metric.title) {
    case "Platform health":
      return <Activity aria-hidden="true" />;
    case "Risk cases":
      return <AlertTriangle aria-hidden="true" />;
    case "Freshness":
      return <Clock3 aria-hidden="true" />;
    case "Coverage":
      return <RadioTower aria-hidden="true" />;
    default:
      return <Activity aria-hidden="true" />;
  }
}

function ownerModelDataAttributes(section: OperationsOverviewSection): Record<string, string> {
  const attributes: Record<string, string> = {
    "data-owner-model-schema": OPERATIONS_OVERVIEW_OWNER_MODEL_SCHEMA,
    "data-section-nav-id": section.navId
  };

  if (section.query && section.resultWindow) {
    attributes["data-query-schema"] = ADMIN_TABLE_QUERY_STATE_SCHEMA;
    attributes["data-result-window"] = formatResultWindow(section.resultWindow);
    attributes["data-route-scope"] = section.query.routeScope;
  }

  return attributes;
}

function formatResultWindow(resultWindow: NonNullable<OperationsOverviewSection["resultWindow"]>) {
  return `${resultWindow.firstItem}-${resultWindow.lastItem}/${resultWindow.totalItems}`;
}

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

function OverviewRiskCandidates({ section }: { section: OperationsOverviewSection }) {
  return (
    <section
      className="admin-overview-compact-stack"
      aria-label="Risk Queue"
      {...ownerModelDataAttributes(section)}
    >
      <div className="admin-overview-section-heading">
        <h3>Risk queue</h3>
        <p>{section.subtitle}</p>
      </div>
      <div className="admin-compact-row-list" aria-label="Risk Queue rows">
        {section.rows.map((item) => (
          <DashboardCompactRow
            actionLabel={item.actionLabel}
            detail={item.detail}
            key={item.label}
            label={item.label}
            meta={item.meta}
            statusLabel={item.statusLabel}
            tone={item.tone}
          />
        ))}
      </div>
      <div className="admin-overview-panel-footer" aria-hidden="true">
        <span>{section.footer}</span>
        <span>•••</span>
      </div>
    </section>
  );
}

function OverviewRouteCards({
  onNavigate,
  section
}: {
  onNavigate?: (page: AdminPage, navId?: string) => void;
  section: OperationsOverviewSection;
}) {
  return (
    <section
      className="admin-overview-compact-stack"
      aria-label="Overview owner page routing content"
      {...ownerModelDataAttributes(section)}
    >
      <div className="admin-overview-section-heading">
        <h3>Next actions</h3>
        <p>{section.subtitle}</p>
      </div>
      <div className="admin-compact-row-list" aria-label="Overview routing rows">
        {section.rows.map((item) => (
          <DashboardCompactRow
            actionLabel={item.actionLabel}
            detail={item.detail}
            key={item.label}
            label={item.label}
            meta={item.meta}
            onClick={item.target ? () => onNavigate?.(item.target as AdminPage, item.targetNavId) : undefined}
            statusLabel={item.statusLabel}
            tone={item.tone}
          />
        ))}
      </div>
      <div className="admin-overview-panel-footer" aria-hidden="true">
        <span>{section.footer}</span>
        <span>•••</span>
      </div>
    </section>
  );
}

function OverviewReviewCandidates({
  onNavigate,
  section
}: {
  onNavigate?: (page: AdminPage, navId?: string) => void;
  section: OperationsOverviewSection;
}) {
  return (
    <section
      className="admin-overview-compact-stack"
      aria-label="Overview review candidates"
      {...ownerModelDataAttributes(section)}
    >
      <div className="admin-overview-section-heading">
        <h3>Review candidates</h3>
        <p>{section.subtitle}</p>
      </div>
      <div className="admin-compact-row-list" aria-label="Overview review candidate rows">
        {section.rows.map((item) => (
          <DashboardCompactRow
            actionLabel={item.actionLabel}
            detail={item.detail}
            key={item.label}
            label={item.label}
            meta={item.meta}
            onClick={item.target ? () => onNavigate?.(item.target as AdminPage, item.targetNavId) : undefined}
            statusLabel={item.statusLabel}
            tone={item.tone}
          />
        ))}
      </div>
      <div className="admin-overview-panel-footer" aria-hidden="true">
        <span>{section.footer}</span>
        <span>•••</span>
      </div>
    </section>
  );
}
