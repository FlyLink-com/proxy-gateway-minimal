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
  never_seen: "从未刷新",
  seen: "已刷新",
  active_recently: "近期活跃",
  high_refresh: "高频刷新",
  inactive: "不活跃",
  blocked: "已阻断"
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
        nextErrors.overview = "服务概览暂不可用。";
      }

      if (ordersResult.status === "fulfilled") {
        setOrders(ordersResult.value);
      } else {
        setOrders([]);
        nextErrors.orders = "订单摘要暂不可用。";
      }

      if (usageResult.status === "fulfilled") {
        setUsageMonitor(usageResult.value);
      } else {
        setUsageMonitor(null);
        nextErrors.usage = "用量监护暂不可用。";
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
    { label: "已交付", value: orderSummary.delivered, color: "#059669" },
    { label: "待处理", value: orderSummary.pendingReview, color: "#d97706" },
    { label: "待交付", value: orderSummary.pendingDelivery, color: "#2563eb" },
    { label: "已停止", value: orderSummary.rejectedOrCancelled, color: "#dc2626" }
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
          <p className="dashboard-kicker">私有运营控制台</p>
          <h2>今日运营摘要</h2>
          <p className="muted">
            汇总订单、订阅状态、资源通道健康和活动告警，帮助运营先判断今天是否需要处理异常。
          </p>
        </div>
        <div className={healthReady ? "dashboard-health dashboard-health-ready" : "dashboard-health dashboard-health-blocked"}>
          <ShieldCheck aria-hidden="true" />
          <span>{healthReady ? "服务正常" : "服务阻断"}</span>
        </div>
      </div>

      <div className="alert dashboard-safety-note">
        只读运营视图。当前展示订单、订阅状态和活动告警，不修改订单、凭据或运行状态。
      </div>
      {loading ? <div className="alert">正在加载运营总览...</div> : null}

      <section className="ops-metric-grid" aria-label="Core metrics">
        <OpsMetric
          label="有效订阅"
          value={overview?.active ?? 0}
          detail={`${overview?.expiring ?? 0} 个即将到期`}
          tone="success"
          icon={<CheckCircle2 aria-hidden="true" />}
        />
        <OpsMetric
          label="已计量订单"
          value={usageMonitor?.aggregates.usage?.measuredOrders ?? 0}
          detail={`${formatBytes(usageMonitor?.aggregates.usage?.totalUsedBytes ?? 0)} 平台用量`}
          tone="info"
          icon={<Activity aria-hidden="true" />}
        />
        <OpsMetric
          label="待处理订单"
          value={orderSummary.pendingReview + orderSummary.pendingDelivery}
          detail={`${orderSummary.delivered} 个已交付`}
          tone={orderSummary.pendingReview > 0 ? "warning" : "neutral"}
          icon={<Clock aria-hidden="true" />}
        />
        <OpsMetric
          label="风险信号"
          value={(usageMonitor?.aggregates.withWarnings ?? 0) + blockedSignals}
          detail={`${usageMonitor?.aggregates.usage?.unmeasuredOrders ?? 0} 个未接入采集`}
          tone={(usageMonitor?.aggregates.withWarnings ?? 0) + blockedSignals > 0 ? "danger" : "success"}
          icon={<AlertTriangle aria-hidden="true" />}
        />
      </section>

      <CaseQueue
        title="监管案件摘要"
        description="只读展示最高优先级监管候选。"
        cases={dashboardCaseCandidates}
      />

      <section className="dashboard-grid dashboard-grid-primary">
        <Panel
          title="服务健康"
          description="只读展示订阅控制和资源分配状态。"
          status={healthReady ? "正常" : "阻断"}
          statusTone={healthReady ? "success" : "danger"}
        >
          {errors.overview ? <div className="alert alert-error">{errors.overview}</div> : null}
          <div className="dashboard-mini-metrics">
            <MiniMetric label="总数" value={overview?.total ?? 0} />
            <MiniMetric label="已过期" value={overview?.expired ?? 0} tone={(overview?.expired ?? 0) > 0 ? "warning" : "neutral"} />
            <MiniMetric label="已停用" value={overview?.disabled ?? 0} tone={(overview?.disabled ?? 0) > 0 ? "danger" : "neutral"} />
            <MiniMetric label="可用通道" value={overview?.distribution.eligibleNodes ?? 0} tone={healthReady ? "success" : "danger"} />
          </div>
          {overview?.distribution.blockers.length ? (
            <div className="alert alert-error">{overview.distribution.blockers.join(", ")}</div>
          ) : (
            <div className="dashboard-inline-ok">
              <CheckCircle2 aria-hidden="true" />
              <span>未发现资源分配阻断。</span>
            </div>
          )}
        </Panel>

        <Panel
          title="订单状态"
          description="用户面板订单生命周期汇总，仅展示统计数量。"
          icon={<BarChart3 aria-hidden="true" />}
        >
          {errors.orders ? <div className="alert alert-error">{errors.orders}</div> : null}
          <div className="chart-split">
            <DonutChart ariaLabel="订单状态图表" segments={orderSegments} total={orderSummary.total} />
            <ChartLegend segments={orderSegments} />
          </div>
          <div className="dashboard-mini-metrics dashboard-mini-metrics-compact">
            <MiniMetric label="7天" value={orderSummary.byDuration["7"] ?? 0} />
            <MiniMetric label="30天" value={orderSummary.byDuration["30"] ?? 0} />
            <MiniMetric label="已停止" value={orderSummary.rejectedOrCancelled} tone={orderSummary.rejectedOrCancelled > 0 ? "danger" : "neutral"} />
          </div>
        </Panel>
      </section>

      <section className="dashboard-grid dashboard-grid-secondary">
        <Panel
          title="活动画像"
          description="当前刷新活动和采集状态画像；真实流量以订单账本为准。"
          icon={<Gauge aria-hidden="true" />}
        >
          {errors.usage ? <div className="alert alert-error">{errors.usage}</div> : null}
          <SparklineChart
            ariaLabel="活动状态图表"
            values={activitySeries}
            labels={["从未", "已刷", "近期", "高频", "不活跃", "阻断"]}
          />
          <div className="activity-pill-row">
            <ActivityPill label="高频刷新" value={usageMonitor?.aggregates.highRefresh ?? 0} tone="danger" />
            <ActivityPill label="从未刷新" value={usageMonitor?.aggregates.neverSeen ?? 0} tone="warning" />
            <ActivityPill label="存在告警" value={usageMonitor?.aggregates.withWarnings ?? 0} tone="danger" />
          </div>
        </Panel>

        <Panel title="实际用量通道" description="按运行时采集通道汇总的平台流量，不代表单个订单额度。">
          <HorizontalBars
            ariaLabel="实际用量通道图表"
            entries={usageChannelEntries.slice(0, 5)}
            emptyLabel="暂无已计量通道流量"
            formatValue={formatBytes}
          />
        </Panel>

        <Panel title="告警类型" description="用量监护返回的运营告警分组。">
          <HorizontalBars ariaLabel="告警类型图表" entries={warningEntries.slice(0, 5)} emptyLabel="暂无告警类型" tone="danger" />
        </Panel>
      </section>

      <section className="dashboard-panel" aria-label="近期安全活动">
        <div className="dashboard-panel-heading">
          <div>
            <h3>近期安全活动</h3>
            <p className="muted">仅展示安全账号和订单引用，隐藏原始交付材料。</p>
          </div>
        </div>
        {recentRows.length === 0 ? (
          <EmptyActivityState />
        ) : (
          <div className="table-wrapper dashboard-table-wrapper">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>账号</th>
                  <th>订单</th>
                  <th>套餐</th>
                  <th>资源通道</th>
                  <th>用量</th>
                  <th>活动</th>
                  <th className="align-right">最近刷新</th>
                  <th>告警</th>
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
  if (!value) return "未记录";
  return value;
}

function warningLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    high_refresh: "刷新频率偏高",
    high_refresh_count: "刷新频率偏高",
    missing_artifact_ref: "交付记录缺失",
    node_unavailable: "资源通道不可用",
    blocked: "访问已阻断"
  };
  return labels[normalized] ?? "运营告警";
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
          <StatusBadge label="无告警" tone="success" />
        )}
      </td>
    </tr>
  );
}

function EmptyActivityState() {
  return (
    <div className="dashboard-empty-state">
      <Activity aria-hidden="true" />
      <strong>暂无近期活动记录</strong>
      <span>当用户刷新订阅或资源状态变化时，这里会显示安全活动记录。</span>
    </div>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: MetricTone }) {
  return <span className={`dashboard-status-badge dashboard-status-${tone}`}>{label}</span>;
}

function safeValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "未记录";
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
    return "未记录";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function activityLabel(activityLevel: SubscriptionUsageActivityLevel) {
  return ACTIVITY_LABELS[activityLevel] ?? activityLevel;
}
