import { Activity, AlertTriangle, Clock3, RadioTower } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import {
  OperationsDashboardReadError,
  readOperationsDashboardSummary,
  type OperationsDashboardSummary
} from "../app/operations-dashboard-client";
import { type AdminPage } from "../app/navigation";
import {
  DataCardPagination,
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
      blueprint={overviewBlueprint(onNavigate, { fixturePreviewEnabled })}
      fixturePreviewEnabled={fixturePreviewEnabled}
    />
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- blueprint factory imported by ~8 test files and the search-results page; extraction would churn test imports
export function overviewBlueprint(
  onNavigate?: (page: AdminPage) => void,
  options: { fixturePreviewEnabled?: boolean } = {}
): BlueprintPage {
  const fixturePreviewEnabled = options.fixturePreviewEnabled === true;
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
        content: fixturePreviewEnabled ? <OverviewHealthSummary /> : <OperationsDashboardLive />,
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
        content: fixturePreviewEnabled ? <OverviewRiskCandidates /> : <OverviewLiveRisk />,
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

const SUBSCRIPTION_CARDS = [
  { key: "total", title: "Subscription tenants", detail: "Subscription tenants, not online users." },
  { key: "active", title: "Active subscriptions", detail: "Enabled tenants whose computed status is active." },
  { key: "expiring", title: "Expiring subscriptions", detail: "Enabled tenants inside the expiring window." },
  { key: "disabledOrExpired", title: "Disabled or expired", detail: "Tenants computed as disabled or expired." }
] as const;

function summaryProblem(error: OperationsDashboardReadError) {
  if (error.code === "session") return "Sign-in is required.";
  if (error.code === "permission") return "operations.read is required.";
  if (error.code === "not_mounted") return "The summary route is not available.";
  if (error.code === "invalid") return "The summary did not match the read contract.";
  return "The summary could not be read.";
}

const DAY_MS = 86400000;
const MAX_RANGE_MS = 31 * DAY_MS;

function lastUtcRange(days: number) {
  const to = new Date();
  return {
    from: new Date(to.getTime() - days * DAY_MS).toISOString(),
    to: to.toISOString()
  };
}

export function OperationsDashboardLive({
  onSessionExpired
}: {
  onSessionExpired?: () => void;
} = {}) {
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [summary, setSummary] = useState<OperationsDashboardSummary | null>(null);
  const [problem, setProblem] = useState("Reading the summary.");
  const [attempt, setAttempt] = useState(0);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [rangeError, setRangeError] = useState("");
  const [fromDay, setFromDay] = useState("");
  const [toDay, setToDay] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setPhase("loading");
    setProblem("Reading the summary.");
    readOperationsDashboardSummary({
      signal: controller.signal,
      from: range?.from,
      to: range?.to
    }).then((next) => {
      if (controller.signal.aborted) return;
      setSummary(next);
      setPhase("ready");
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      const readError = error instanceof OperationsDashboardReadError
        ? error
        : new OperationsDashboardReadError("unavailable");
      if (readError.code === "session") onSessionExpired?.();
      setSummary(null);
      setProblem(summaryProblem(readError));
      setPhase("error");
    });
    return () => controller.abort();
  }, [attempt, onSessionExpired, range]);

  const subscriptions = phase === "ready" ? summary?.subscriptions : null;
  const growth = phase === "ready" ? summary?.registrationGrowth : null;
  const collector = phase === "ready" ? summary?.trafficCollector : null;
  return (
    <div className="admin-operator-content" aria-label="Operations Overview summary">
      <div className="admin-overview-metric-grid" aria-label="Operations Overview metric cards">
        {SUBSCRIPTION_CARDS.map((card) => (
          <OverviewMetricCard
            body={phase === "error" ? problem : card.detail}
            icon={<Activity aria-hidden="true" />}
            key={card.key}
            title={card.title}
            tone={phase === "error" ? "warning" : "info"}
            value={subscriptions ? String(subscriptions[card.key]) : phase === "loading" ? "Reading" : "—"}
          />
        ))}
      </div>
      {summary ? <p><time dateTime={summary.generatedAt}>Updated {summary.generatedAt}</time></p> : null}
      {phase === "error" ? <button type="button" onClick={() => setAttempt((current) => current + 1)}>Retry summary</button> : null}
      <div className="admin-static-status-row" aria-label="Overview source states">
        <StatusChip label="Platform health not connected" tone="neutral" />
        <StatusChip label="Channel coverage not connected" tone="neutral" />
        <StatusChip label="Freshness P95 not connected" tone="neutral" />
        <StatusChip label="No production action" tone="danger" />
      </div>
      <section aria-label="Registration trend">
        <h3>Registration trend</h3>
        <p>UTC calendar days. Portal registrations count self-service portal accounts. Other created accounts are every other new account. These counts are not subscription tenants.</p>
        <div>
          <button type="button" aria-pressed={range === null} onClick={() => { setRangeError(""); setRange(null); }}>Last 30 days</button>
          <button type="button" aria-pressed={range !== null && fromDay === "" && toDay === ""} onClick={() => { setRangeError(""); setFromDay(""); setToDay(""); setRange(lastUtcRange(7)); }}>Last 7 days</button>
        </div>
        <form aria-label="UTC registration range" onSubmit={(event) => {
          event.preventDefault();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDay) || !/^\d{4}-\d{2}-\d{2}$/.test(toDay)) {
            setRangeError("Use UTC dates.");
            return;
          }
          const fromMs = Date.parse(`${fromDay}T00:00:00.000Z`);
          const toMs = Date.parse(`${toDay}T00:00:00.000Z`) + DAY_MS;
          if (!Number.isFinite(fromMs) || !(fromMs < toMs) || toMs - fromMs > MAX_RANGE_MS) {
            setRangeError("The UTC range must be within 31 days.");
            return;
          }
          setRangeError("");
          setRange({ from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() });
        }}>
          <label>UTC from<input value={fromDay} onChange={(event) => setFromDay(event.target.value)} /></label>
          <label>UTC to<input value={toDay} onChange={(event) => setToDay(event.target.value)} /></label>
          <button type="submit">Apply UTC range</button>
        </form>
        {rangeError ? <p>{rangeError}</p> : null}
        {phase === "loading" ? <p>Reading registration counts.</p> : null}
        {phase === "error" ? <p>{problem}</p> : null}
        {growth?.availability === "ready" ? (
          <>
            {growth.points.every((point) => point.registeredCount === 0 && point.otherCreatedCount === 0)
              ? <p>No accounts were created in this UTC window.</p>
              : null}
            <div aria-label="Registration days">
              {growth.points.map((point) => (
                <p key={point.at}>{point.at} Portal registrations {point.registeredCount} Other created accounts {point.otherCreatedCount}</p>
              ))}
            </div>
          </>
        ) : null}
        {growth?.availability === "not_authorized" ? <p>users.read is required for registration counts.</p> : null}
        {growth?.availability === "unavailable" ? <p>Registration counts could not be read.</p> : null}
      </section>
      <section aria-label="Traffic collector observation">
        <h3>Traffic collector</h3>
        {phase === "loading" ? <p>Reading collector observation.</p> : null}
        {collector?.availability === "ready" ? <p><time dateTime={collector.observedAt}>Observed {collector.observedAt}</time></p> : null}
        {collector?.availability === "partial" ? (
          <>
            <p>A collector observation exists, and the last run was not ok.</p>
            <p><time dateTime={collector.observedAt}>Observed {collector.observedAt}</time></p>
          </>
        ) : null}
        {collector?.availability === "not_connected" ? <p>Traffic collector is not connected.</p> : null}
        {collector?.availability === "unknown" ? <p>Traffic collector observation is unknown.</p> : null}
      </section>
    </div>
  );
}

function OverviewLiveRisk() {
  return (
    <section className="admin-overview-section-card" aria-label="Risk Queue">
      <div className="admin-overview-section-heading">
        <h3>Risk Queue</h3>
        <p>Not connected. There is no computed risk source.</p>
      </div>
    </section>
  );
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
  trend?: number[];
  value: string;
}) {
  return (
    <MetricCard
      detail={body}
      icon={icon}
      label={title}
      tone={tone}
      trend={trend ? {
        ariaLabel: `${title} safe trend`,
        values: trend
      } : undefined}
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
      <DataCardPagination
        ariaLabel="Risk Queue pagination"
        itemLabel="items"
        pageSize={4}
        totalItems={overviewRiskItems.length}
      />
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
