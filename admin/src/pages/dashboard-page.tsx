import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, AlertTriangle, BarChart3, CheckCircle2, Clock, Gauge, ShieldCheck } from "lucide-react";
import type { AdminApiClient } from "../features/subscriptions/api-client";
import type {
  PortalAccessRequestStatus,
  PortalAccessRequestSummary,
  SubscriptionOverview,
  SubscriptionUsageActivityLevel,
  SubscriptionUsageMonitor,
  SubscriptionUsageMonitorRow
} from "../features/subscriptions/types";
import {
  buildPortalRequestCaseCandidates,
  buildUsageMonitorCaseCandidates,
  topCaseCandidates
} from "../features/admin-case-workbench/case-candidates";
import { CaseQueue } from "../features/admin-case-workbench/case-workbench";

type DashboardErrors = {
  overview?: string;
  orders?: string;
  usage?: string;
};

type OrderSummary = {
  total: number;
  delivered: number;
  pendingReview: number;
  pendingDelivery: number;
  rejectedOrCancelled: number;
  byDuration: Record<string, number>;
};

type MetricTone = "success" | "warning" | "danger" | "info" | "neutral";

type ChartSegment = {
  label: string;
  value: number;
  color: string;
};

const ACTIVITY_LABELS: Record<SubscriptionUsageActivityLevel, string> = {
  never_seen: "Never seen",
  seen: "Seen",
  active_recently: "Recently active",
  high_refresh: "High refresh",
  inactive: "Inactive",
  blocked: "Blocked"
};

const ACTIVITY_TONES: Record<SubscriptionUsageActivityLevel, MetricTone> = {
  never_seen: "warning",
  seen: "info",
  active_recently: "success",
  high_refresh: "danger",
  inactive: "warning",
  blocked: "danger"
};

const ORDER_TERMINAL_STATUSES = new Set<PortalAccessRequestStatus>(["rejected", "cancelled", "expired", "revoked"]);

export function DashboardPage({ apiClient }: { apiClient: AdminApiClient }) {
  const [overview, setOverview] = useState<SubscriptionOverview | null>(null);
  const [orders, setOrders] = useState<PortalAccessRequestSummary[]>([]);
  const [usageMonitor, setUsageMonitor] = useState<SubscriptionUsageMonitor | null>(null);
  const [errors, setErrors] = useState<DashboardErrors>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrors({});

    void Promise.allSettled([
      apiClient.overview(),
      apiClient.listPortalAccessRequests(),
      apiClient.listSubscriptionUsageMonitor({})
    ]).then(([overviewResult, ordersResult, usageResult]) => {
      if (cancelled) return;

      const nextErrors: DashboardErrors = {};
      if (overviewResult.status === "fulfilled") {
        setOverview(overviewResult.value);
      } else {
        setOverview(null);
        nextErrors.overview = "Overview is unavailable.";
      }

      if (ordersResult.status === "fulfilled") {
        setOrders(ordersResult.value);
      } else {
        setOrders([]);
        nextErrors.orders = "Order summary is unavailable.";
      }

      if (usageResult.status === "fulfilled") {
        setUsageMonitor(usageResult.value);
      } else {
        setUsageMonitor(null);
        nextErrors.usage = "Usage monitor is unavailable.";
      }

      setErrors(nextErrors);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [apiClient]);

  const orderSummary = useMemo(() => summarizeOrders(orders), [orders]);
  const warningEntries = useMemo(() => displayWarningEntries(sortedEntries(usageMonitor?.aggregates.warnings ?? {})), [usageMonitor]);
  const usageChannelEntries = useMemo(() => sortedEntries(usageMonitor?.aggregates.usage?.byUsageChannel ?? {}), [usageMonitor]);
  const recentRows = useMemo(() => (usageMonitor?.items ?? []).slice(0, 6), [usageMonitor]);
  const dashboardCaseCandidates = useMemo(() => topCaseCandidates([
    ...buildPortalRequestCaseCandidates(orders),
    ...buildUsageMonitorCaseCandidates(usageMonitor?.items ?? [])
  ], 5), [orders, usageMonitor]);
  const healthReady = Boolean(overview?.ok && overview.distribution.ready);
  const blockedSignals = (overview?.distribution.blockedNodes ?? 0) + (usageMonitor?.aggregates.blocked ?? 0);

  const orderSegments = useMemo<ChartSegment[]>(() => [
    { label: "Delivered", value: orderSummary.delivered, color: "#059669" },
    { label: "Pending review", value: orderSummary.pendingReview, color: "#d97706" },
    { label: "Pending delivery", value: orderSummary.pendingDelivery, color: "#2563eb" },
    { label: "Stopped", value: orderSummary.rejectedOrCancelled, color: "#dc2626" }
  ], [orderSummary]);

  const activitySeries = useMemo(() => [
    usageMonitor?.aggregates.neverSeen ?? 0,
    usageMonitor?.aggregates.seen ?? 0,
    usageMonitor?.aggregates.activeRecently ?? 0,
    usageMonitor?.aggregates.highRefresh ?? 0,
    usageMonitor?.aggregates.inactive ?? 0,
    usageMonitor?.aggregates.blocked ?? 0
  ], [usageMonitor]);

  return (
    <div className="dashboard-shell">
      <div className="dashboard-hero" aria-label="Operations summary">
        <div>
          <p className="dashboard-kicker">Private Operator Console</p>
          <h2>Operations Summary</h2>
          <p className="muted">
            Summarizes orders, subscription state, resource channel health, and activity alerts so operators can triage anomalies first.
          </p>
        </div>
        <div className={healthReady ? "dashboard-health dashboard-health-ready" : "dashboard-health dashboard-health-blocked"}>
          <ShieldCheck aria-hidden="true" />
          <span>{healthReady ? "Service healthy" : "Service blocked"}</span>
        </div>
      </div>

      <div className="alert dashboard-safety-note">
        Read-only operations view. Shows orders, subscription state, and activity alerts without changing orders, credentials, or runtime state.
      </div>
      {loading ? <div className="alert">Loading operations overview...</div> : null}

      <section className="ops-metric-grid" aria-label="Core metrics">
        <OpsMetric
          label="Active subscriptions"
          value={overview?.active ?? 0}
          detail={`${overview?.expiring ?? 0} expiring soon`}
          tone="success"
          icon={<CheckCircle2 aria-hidden="true" />}
        />
        <OpsMetric
          label="Measured orders"
          value={usageMonitor?.aggregates.usage?.measuredOrders ?? 0}
          detail={`${formatBytes(usageMonitor?.aggregates.usage?.totalUsedBytes ?? 0)} platform usage`}
          tone="info"
          icon={<Activity aria-hidden="true" />}
        />
        <OpsMetric
          label="Pending orders"
          value={orderSummary.pendingReview + orderSummary.pendingDelivery}
          detail={`${orderSummary.delivered} delivered`}
          tone={orderSummary.pendingReview > 0 ? "warning" : "neutral"}
          icon={<Clock aria-hidden="true" />}
        />
        <OpsMetric
          label="Risk signals"
          value={(usageMonitor?.aggregates.withWarnings ?? 0) + blockedSignals}
          detail={`${usageMonitor?.aggregates.usage?.unmeasuredOrders ?? 0} not connected to collection`}
          tone={(usageMonitor?.aggregates.withWarnings ?? 0) + blockedSignals > 0 ? "danger" : "success"}
          icon={<AlertTriangle aria-hidden="true" />}
        />
      </section>

      <CaseQueue
        title="Supervision case summary"
        description="Read-only highest-priority supervision candidates."
        cases={dashboardCaseCandidates}
      />

      <section className="dashboard-grid dashboard-grid-primary">
        <Panel
          title="Service health"
          description="Read-only subscription control and resource distribution state."
          status={healthReady ? "Normal" : "Blocked"}
          statusTone={healthReady ? "success" : "danger"}
        >
          {errors.overview ? <div className="alert alert-error">{errors.overview}</div> : null}
          <div className="dashboard-mini-metrics">
            <MiniMetric label="Total" value={overview?.total ?? 0} />
            <MiniMetric label="Expired" value={overview?.expired ?? 0} tone={(overview?.expired ?? 0) > 0 ? "warning" : "neutral"} />
            <MiniMetric label="Disabled" value={overview?.disabled ?? 0} tone={(overview?.disabled ?? 0) > 0 ? "danger" : "neutral"} />
            <MiniMetric label="Available channels" value={overview?.distribution.eligibleNodes ?? 0} tone={healthReady ? "success" : "danger"} />
          </div>
          {overview?.distribution.blockers.length ? (
            <div className="alert alert-error">{overview.distribution.blockers.join(", ")}</div>
          ) : (
            <div className="dashboard-inline-ok">
              <CheckCircle2 aria-hidden="true" />
              <span>No resource distribution blockers found.</span>
            </div>
          )}
        </Panel>

        <Panel
          title="Order status"
          description="User portal order lifecycle summary; counts only."
          icon={<BarChart3 aria-hidden="true" />}
        >
          {errors.orders ? <div className="alert alert-error">{errors.orders}</div> : null}
          <div className="chart-split">
            <DonutChart ariaLabel="Order status chart" segments={orderSegments} total={orderSummary.total} />
            <ChartLegend segments={orderSegments} />
          </div>
          <div className="dashboard-mini-metrics dashboard-mini-metrics-compact">
            <MiniMetric label="7 days" value={orderSummary.byDuration["7"] ?? 0} />
            <MiniMetric label="30 days" value={orderSummary.byDuration["30"] ?? 0} />
            <MiniMetric label="Stopped" value={orderSummary.rejectedOrCancelled} tone={orderSummary.rejectedOrCancelled > 0 ? "danger" : "neutral"} />
          </div>
        </Panel>
      </section>

      <section className="dashboard-grid dashboard-grid-secondary">
        <Panel
          title="Activity profile"
          description="Current refresh activity and collection-state profile; actual traffic remains owned by the order ledger."
          icon={<Gauge aria-hidden="true" />}
        >
          {errors.usage ? <div className="alert alert-error">{errors.usage}</div> : null}
          <SparklineChart
            ariaLabel="Activity status chart"
            values={activitySeries}
            labels={["Never", "Seen", "Recent", "High", "Inactive", "Blocked"]}
          />
          <div className="activity-pill-row">
            <ActivityPill label="High refresh" value={usageMonitor?.aggregates.highRefresh ?? 0} tone="danger" />
            <ActivityPill label="Never seen" value={usageMonitor?.aggregates.neverSeen ?? 0} tone="warning" />
            <ActivityPill label="With warnings" value={usageMonitor?.aggregates.withWarnings ?? 0} tone="danger" />
          </div>
        </Panel>

        <Panel title="Measured usage channels" description="Platform traffic grouped by runtime collection channel; not a single-order quota.">
          <HorizontalBars
            ariaLabel="Measured usage channel chart"
            entries={usageChannelEntries.slice(0, 5)}
            emptyLabel="No measured channel traffic"
            formatValue={formatBytes}
          />
        </Panel>

        <Panel title="Warning types" description="Operational warning groups returned by the usage monitor.">
          <HorizontalBars ariaLabel="Warning type chart" entries={warningEntries.slice(0, 5)} emptyLabel="No warning types" tone="danger" />
        </Panel>
      </section>

      <section className="dashboard-panel" aria-label="Recent safe activity">
        <div className="dashboard-panel-heading">
          <div>
            <h3>Recent safe activity</h3>
            <p className="muted">Shows safe account and order refs only; raw delivery material is hidden.</p>
          </div>
        </div>
        {recentRows.length === 0 ? (
          <EmptyActivityState />
        ) : (
          <div className="table-wrapper dashboard-table-wrapper">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Order</th>
                  <th>Plan</th>
                  <th>Resource channel</th>
                  <th>Usage</th>
                  <th>Activity</th>
                  <th className="align-right">Last refresh</th>
                  <th>Warnings</th>
                </tr>
              </thead>
              <tbody>
                {recentRows.map((row) => (
                  <RecentActivityRow key={`${row.accountId}:${row.issuanceRequestId}:${row.entitlementId}`} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function summarizeOrders(items: PortalAccessRequestSummary[]): OrderSummary {
  const summary: OrderSummary = {
    total: items.length,
    delivered: 0,
    pendingReview: 0,
    pendingDelivery: 0,
    rejectedOrCancelled: 0,
    byDuration: {}
  };

  for (const item of items) {
    if (item.status === "delivered") summary.delivered += 1;
    if (item.status === "pending_admin_review") summary.pendingReview += 1;
    if (item.status === "approved_pending_delivery") summary.pendingDelivery += 1;
    if (ORDER_TERMINAL_STATUSES.has(item.status)) summary.rejectedOrCancelled += 1;
    const durationKey = String(item.durationDays);
    summary.byDuration[durationKey] = (summary.byDuration[durationKey] ?? 0) + 1;
  }

  return summary;
}

function sortedEntries(source: Record<string, number>) {
  return Object.entries(source)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
}

function displayWarningEntries(entries: Array<[string, number]>) {
  return entries.map(([label, count]) => [warningLabel(label), count] as [string, number]);
}

function resourceChannelLabel(value: string | null | undefined) {
  if (!value) return "Not recorded";
  return value;
}

function warningLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    high_refresh: "High refresh frequency",
    high_refresh_count: "High refresh frequency",
    missing_artifact_ref: "Delivery record missing",
    node_unavailable: "Resource channel unavailable",
    blocked: "Access blocked"
  };
  return labels[normalized] ?? "Operational warning";
}

function OpsMetric({
  label,
  value,
  detail,
  tone,
  icon
}: {
  label: string;
  value: number;
  detail: string;
  tone: MetricTone;
  icon: ReactNode;
}) {
  return (
    <article className={`ops-metric-card ops-metric-${tone}`}>
      <div className="ops-metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function Panel({
  title,
  description,
  icon,
  status,
  statusTone = "neutral",
  children
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  status?: string;
  statusTone?: MetricTone;
  children: ReactNode;
}) {
  return (
    <section className="dashboard-panel" aria-label={title}>
      <div className="dashboard-panel-heading">
        <div>
          <h3>{title}</h3>
          <p className="muted">{description}</p>
        </div>
        {status ? <StatusBadge label={status} tone={statusTone} /> : <span className="dashboard-panel-icon">{icon}</span>}
      </div>
      {children}
    </section>
  );
}

function MiniMetric({ label, value, tone = "neutral" }: { label: string; value: number; tone?: MetricTone }) {
  return (
    <div className={`dashboard-mini-metric dashboard-mini-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ActivityPill({ label, value, tone }: { label: string; value: number; tone: MetricTone }) {
  return (
    <span className={`activity-pill activity-pill-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </span>
  );
}

function DonutChart({ segments, total, ariaLabel }: { segments: ChartSegment[]; total: number; ariaLabel: string }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  if (total <= 0) {
    return (
      <div className="donut-chart" role="img" aria-label={ariaLabel}>
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="14" />
        </svg>
        <strong>0</strong>
      </div>
    );
  }

  return (
    <div className="donut-chart" role="img" aria-label={ariaLabel}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="14" />
        {segments.map((segment) => {
          const length = (segment.value / total) * circumference;
          const dashOffset = -offset;
          offset += length;
          return (
            <circle
              key={segment.label}
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              strokeWidth="14"
              transform="rotate(-90 60 60)"
            />
          );
        })}
      </svg>
      <strong>{total}</strong>
    </div>
  );
}

function ChartLegend({ segments }: { segments: ChartSegment[] }) {
  return (
    <ul className="chart-legend">
      {segments.map((segment) => (
        <li key={segment.label}>
          <span className="chart-legend-dot" style={{ backgroundColor: segment.color }} aria-hidden="true" />
          <span>{segment.label}</span>
          <strong>{segment.value}</strong>
        </li>
      ))}
    </ul>
  );
}

function SparklineChart({ values, labels, ariaLabel }: { values: number[]; labels: string[]; ariaLabel: string }) {
  const max = Math.max(1, ...values);
  const points = values.map((value, index) => {
    const x = 10 + index * (180 / Math.max(1, values.length - 1));
    const y = 64 - (value / max) * 44;
    return `${x},${y}`;
  }).join(" ");

  return (
    <div className="sparkline-chart" role="img" aria-label={ariaLabel}>
      <svg viewBox="0 0 200 78" aria-hidden="true">
        <polyline className="sparkline-grid" points="10,64 190,64" />
        <polyline className="sparkline-line" points={points} />
        {values.map((value, index) => {
          const [x, y] = points.split(" ")[index].split(",");
          return <circle key={`${labels[index]}:${index}`} cx={x} cy={y} r="3.5" />;
        })}
      </svg>
      <div className="sparkline-axis">
        {labels.map((label) => <span key={label}>{label}</span>)}
      </div>
    </div>
  );
}

function HorizontalBars({
  entries,
  emptyLabel,
  ariaLabel,
  tone = "info",
  formatValue = (value) => String(value)
}: {
  entries: Array<[string, number]>;
  emptyLabel: string;
  ariaLabel: string;
  tone?: MetricTone;
  formatValue?: (value: number) => string;
}) {
  if (entries.length === 0) {
    return <div className="dashboard-empty-compact">{emptyLabel}</div>;
  }
  const max = Math.max(...entries.map(([, count]) => count), 1);
  return (
    <div className="horizontal-bars" role="img" aria-label={ariaLabel}>
      {entries.map(([label, count]) => (
        <div className="horizontal-bar-row" key={label}>
          <div className="horizontal-bar-label">
            <span>{label}</span>
            <strong>{formatValue(count)}</strong>
          </div>
          <div className="horizontal-bar-track">
            <span className={`horizontal-bar-fill horizontal-bar-${tone}`} style={{ width: `${Math.max(8, (count / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function RecentActivityRow({ row }: { row: SubscriptionUsageMonitorRow }) {
  return (
    <tr>
      <td>{safeValue(row.accountId)}</td>
      <td>{safeValue(row.issuanceRequestId)}</td>
      <td>{safeValue(row.plan)}</td>
      <td>{resourceChannelLabel(row.nodeId)}</td>
      <td>{formatBytes(row.usedBytes)}</td>
      <td>
        <StatusBadge label={activityLabel(row.activityLevel)} tone={ACTIVITY_TONES[row.activityLevel]} />
      </td>
      <td className="align-right">{formatDateTime(row.lastRefreshAt)}</td>
      <td>
        {row.warnings.length > 0 ? (
          <span className="warning-chip-list">
            {row.warnings.map((warning) => (
              <span className="warning-chip warning-chip-critical" key={warning}>{warningLabel(warning)}</span>
            ))}
          </span>
        ) : (
          <StatusBadge label="No warnings" tone="success" />
        )}
      </td>
    </tr>
  );
}

function EmptyActivityState() {
  return (
    <div className="dashboard-empty-state">
      <Activity aria-hidden="true" />
      <strong>No recent activity records</strong>
      <span>Safe activity appears here when users refresh subscriptions or resource state changes.</span>
    </div>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: MetricTone }) {
  return <span className={`dashboard-status-badge dashboard-status-${tone}`}>{label}</span>;
}

function safeValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "Not recorded";
  }
  return value;
}

function formatBytes(value: number) {
  const normalized = Number.isFinite(value) && value > 0 ? value : 0;
  if (normalized < 1024) {
    return `${normalized} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let amount = normalized / 1024;
  let unitIndex = 0;
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }
  const digits = amount >= 10 ? 1 : 2;
  return `${amount.toFixed(digits).replace(/\.0+$/, "")} ${units[unitIndex]}`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not recorded";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function activityLabel(activityLevel: SubscriptionUsageActivityLevel) {
  return ACTIVITY_LABELS[activityLevel] ?? activityLevel;
}
