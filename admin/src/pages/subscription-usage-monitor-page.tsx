import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction
} from "react";
import type { AdminApiClient } from "../features/subscriptions/api-client";
import type {
  SubscriptionUsageActivityLevel,
  SubscriptionUsageCollectionStatus,
  SubscriptionUsageMonitor,
  SubscriptionUsageMonitorFilters,
  SubscriptionUsageMonitorRow,
  SubscriptionUsageTimeseriesPoint
} from "../features/subscriptions/types";
import { errorMessage } from "../lib/errors";

type FilterState = Required<SubscriptionUsageMonitorFilters>;

const EMPTY_FILTERS: FilterState = {
  accountId: "",
  plan: "",
  nodeId: "",
  status: "",
  warning: "",
  from: "",
  to: "",
  bucket: "hour"
};

const METRIC_CARDS: Array<{
  label: string;
  key: keyof SubscriptionUsageMonitor["aggregates"];
}> = [
  { label: "总记录", key: "total" },
  { label: "近期活跃", key: "activeRecently" },
  { label: "从未刷新", key: "neverSeen" },
  { label: "高频刷新", key: "highRefresh" },
  { label: "已阻断", key: "blocked" },
  { label: "不活跃", key: "inactive" },
  { label: "已刷新", key: "seen" },
  { label: "存在告警", key: "withWarnings" }
];

const USAGE_METRIC_CARDS: Array<{
  label: string;
  value: (monitor: SubscriptionUsageMonitor | null) => string | number;
}> = [
  { label: "平台已计量流量", value: (monitor) => formatBytes(monitor?.aggregates.usage?.totalUsedBytes ?? 0) },
  { label: "上传", value: (monitor) => formatBytes(monitor?.aggregates.usage?.totalUploadBytes ?? 0) },
  { label: "下载", value: (monitor) => formatBytes(monitor?.aggregates.usage?.totalDownloadBytes ?? 0) },
  { label: "已计量订单", value: (monitor) => monitor?.aggregates.usage?.measuredOrders ?? 0 },
  { label: "未接入采集", value: (monitor) => monitor?.aggregates.usage?.unmeasuredOrders ?? 0 },
  { label: "超额风险", value: (monitor) => (
    (monitor?.aggregates.usage?.overLimitOrders ?? 0) + (monitor?.aggregates.usage?.nearLimitOrders ?? 0)
  ) }
];

const ACTIVITY_LABELS: Record<SubscriptionUsageActivityLevel, string> = {
  never_seen: "从未刷新",
  seen: "已刷新",
  active_recently: "近期活跃",
  high_refresh: "高频刷新",
  inactive: "不活跃",
  blocked: "已阻断"
};

export function SubscriptionUsageMonitorPage({ apiClient }: { apiClient: AdminApiClient }) {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [monitor, setMonitor] = useState<SubscriptionUsageMonitor | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestSequenceRef = useRef(0);
  const mountedRef = useRef(true);

  const loadMonitor = useCallback(async (requestFilters: SubscriptionUsageMonitorFilters) => {
    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;
    const isCurrentRequest = () => mountedRef.current && requestSequenceRef.current === requestId;
    setLoading(true);
    setError("");
    try {
      const result = await apiClient.listSubscriptionUsageMonitor(requestFilters);
      if (isCurrentRequest()) {
        setMonitor(result);
        const options = timeseriesOptions(result.series?.points ?? []);
        setSelectedUsers(new Set(options.users));
        setSelectedOrders(new Set(options.orders));
        setSelectedChannels(new Set(options.channels));
      }
    } catch (requestError) {
      if (isCurrentRequest()) {
        setError(errorMessage(requestError, "用量监护加载失败。"));
      }
    } finally {
      if (isCurrentRequest()) {
        setLoading(false);
      }
    }
  }, [apiClient]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestSequenceRef.current += 1;
    };
  }, []);

  useEffect(() => {
    void loadMonitor({});
  }, [loadMonitor]);

  async function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextFilters = trimFilters(filters);
    setFilters(nextFilters);
    await loadMonitor(requestFilters(nextFilters));
  }

  function updateFilter(key: keyof FilterState, value: string) {
    setFilters((current) => ({
      ...current,
      [key]: value
    }));
  }

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <h2>活动明细监护</h2>
          <p className="muted">平台采集看通道健康，订单账本看账号、订单和真实通道用量归属。</p>
        </div>
      </div>

      <div className="alert">平台摘要只做运营观测；额度、告警和禁用判断以订单账本的账号、订单和 edge credential 归属为准。</div>
      {error ? <div className="alert alert-error">{error}</div> : null}

      <section className="gate-review-card" aria-labelledby="usage-platform-heading">
        <div>
          <h3 id="usage-platform-heading">平台采集概览</h3>
          <p className="muted">按实际采集通道汇总流量，不替代单个订单账本。</p>
        </div>
        <div className="metric-grid">
          {USAGE_METRIC_CARDS.map((metric) => (
            <div className="metric-card" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value(monitor)}</strong>
            </div>
          ))}
        </div>
        <div className="usage-channel-breakdown" aria-label="平台通道用量">
          {usageChannelEntries(monitor).length > 0 ? (
            usageChannelEntries(monitor).map(([channelRef, bytes]) => (
              <span className="usage-channel-chip" key={channelRef}>
                <span>{channelRef}</span>
                <strong>{formatBytes(bytes)}</strong>
              </span>
            ))
          ) : (
            <span className="muted">暂无已计量通道流量。</span>
          )}
        </div>
      </section>

      <UsageTimeseriesSection
        monitor={monitor}
        selectedUsers={selectedUsers}
        selectedOrders={selectedOrders}
        selectedChannels={selectedChannels}
        onToggleUser={(value) => toggleSetValue(setSelectedUsers, value)}
        onToggleOrder={(value) => toggleSetValue(setSelectedOrders, value)}
        onToggleChannel={(value) => toggleSetValue(setSelectedChannels, value)}
      />

      <section className="gate-review-card" aria-labelledby="usage-monitor-filters-heading">
        <div>
          <h3 id="usage-monitor-filters-heading">筛选器</h3>
        </div>
        <form className="monitor-filter-grid" onSubmit={submitFilters}>
          <label>
            <span>账号 ID</span>
            <input
              value={filters.accountId}
              onChange={(event) => updateFilter("accountId", event.target.value)}
            />
          </label>
          <label>
            <span>套餐</span>
            <input
              value={filters.plan}
              onChange={(event) => updateFilter("plan", event.target.value)}
            />
          </label>
          <label>
            <span>资源通道</span>
            <input
              value={filters.nodeId}
              onChange={(event) => updateFilter("nodeId", event.target.value)}
            />
          </label>
          <label>
            <span>状态</span>
            <input
              value={filters.status}
              onChange={(event) => updateFilter("status", event.target.value)}
            />
          </label>
          <label>
            <span>告警</span>
            <input
              value={filters.warning}
              onChange={(event) => updateFilter("warning", event.target.value)}
            />
          </label>
          <label>
            <span>起始时间</span>
            <input
              value={filters.from}
              onChange={(event) => updateFilter("from", event.target.value)}
              placeholder="2026-06-08T00:00"
            />
          </label>
          <label>
            <span>结束时间</span>
            <input
              value={filters.to}
              onChange={(event) => updateFilter("to", event.target.value)}
              placeholder="2026-06-09T00:00"
            />
          </label>
          <label>
            <span>时间粒度</span>
            <select
              value={filters.bucket}
              onChange={(event) => updateFilter("bucket", event.target.value)}
            >
              <option value="hour">按小时</option>
              <option value="day">按天</option>
            </select>
          </label>
          <div className="monitor-filter-actions">
            <button className="primary-button" type="submit">
              应用筛选
            </button>
          </div>
        </form>
      </section>

      <section className="gate-review-card" aria-labelledby="usage-monitor-aggregates-heading">
        <div>
          <h3 id="usage-monitor-aggregates-heading">订单活动摘要</h3>
          <p className="muted">按订单刷新、状态和告警数量聚合，不表示平台总流量。</p>
        </div>
        <div className="metric-grid">
          {METRIC_CARDS.map((metric) => (
            <div className="metric-card" key={metric.key}>
              <span>{metric.label}</span>
              <strong>{metricValue(monitor, metric.key)}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="gate-review-card" aria-labelledby="usage-monitor-table-heading">
        <div>
          <h3 id="usage-monitor-table-heading">订单用量账本</h3>
          <p className="muted">每行对应一个已发放订单；用量按实际采集通道拆分并归属到订单。</p>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>用户 / 账号</th>
                <th>订单</th>
                <th>套餐 / 数量</th>
                <th>下发通道</th>
                <th>Credential 锚点</th>
                <th>订单累计用量</th>
                <th>实际用量通道</th>
                <th>最近采集</th>
                <th>采集状态</th>
                <th>交付状态</th>
                <th>活动</th>
                <th>链接状态</th>
                <th>最近刷新</th>
                <th>刷新次数</th>
                <th>告警</th>
              </tr>
            </thead>
            <tbody>
              {loading && !monitor ? (
                <tr>
                  <td className="loading-row" colSpan={15}>正在加载活动记录...</td>
                </tr>
              ) : null}
              {!loading && monitor?.items.length === 0 ? (
                <tr>
                  <td className="loading-row" colSpan={15}>
                    当前筛选条件下没有活动记录。
                  </td>
                </tr>
              ) : null}
              {monitor?.items.map((row) => (
                <MonitorRow key={`${row.accountId}:${row.issuanceRequestId}:${row.entitlementId}`} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function MonitorRow({ row }: { row: SubscriptionUsageMonitorRow }) {
  return (
    <tr>
      <td>
        <div>{safeValue(row.portalUserRef)}</div>
        <small className="muted">{safeValue(row.accountId)}</small>
      </td>
      <td>{safeValue(row.issuanceRequestId)}</td>
      <td>{safeValue(row.plan)} / {row.quantity || 1}</td>
      <td>{issuedChannelList(row)}</td>
      <td>{edgeCredentialBindingList(row)}</td>
      <td>
        <div>{formatTrafficBytes(row)}</div>
      </td>
      <td>{channelUsageList(row)}</td>
      <td>{safeValue(formatDateTime(row.lastUsageObservedAt))}</td>
      <td>{usageStatusBadge(row)}</td>
      <td>{deliveryBindingLabel(row)}</td>
      <td>
        <span className="status-badge">{activityLabel(row.activityLevel)}</span>
      </td>
      <td>{safeValue(row.linkStatus)}</td>
      <td>{safeValue(formatDateTime(row.lastRefreshAt))}</td>
      <td>{row.refreshCount}</td>
      <td>
        {row.warnings.length > 0 ? (
          <span className="warning-chip-list">
            {row.warnings.map((warning) => (
              <span className="warning-chip" key={warning}>{warningLabel(warning)}</span>
            ))}
          </span>
        ) : (
          "未记录"
        )}
      </td>
    </tr>
  );
}

function trimFilters(filters: FilterState): FilterState {
  return {
    accountId: filters.accountId.trim(),
    plan: filters.plan.trim(),
    nodeId: filters.nodeId.trim(),
    status: filters.status.trim(),
    warning: filters.warning.trim(),
    from: filters.from.trim(),
    to: filters.to.trim(),
    bucket: filters.bucket.trim() || "hour"
  };
}

function requestFilters(filters: FilterState): SubscriptionUsageMonitorFilters {
  const request: SubscriptionUsageMonitorFilters = {};
  if (filters.accountId) request.accountId = filters.accountId;
  if (filters.plan) request.plan = filters.plan;
  if (filters.nodeId) request.nodeId = filters.nodeId;
  if (filters.status) request.status = filters.status;
  if (filters.warning) request.warning = filters.warning;
  if (filters.from) request.from = filters.from;
  if (filters.to) request.to = filters.to;
  if (filters.bucket && filters.bucket !== "hour") request.bucket = filters.bucket;
  return request;
}

function UsageTimeseriesSection({
  monitor,
  selectedUsers,
  selectedOrders,
  selectedChannels,
  onToggleUser,
  onToggleOrder,
  onToggleChannel
}: {
  monitor: SubscriptionUsageMonitor | null;
  selectedUsers: Set<string>;
  selectedOrders: Set<string>;
  selectedChannels: Set<string>;
  onToggleUser: (value: string) => void;
  onToggleOrder: (value: string) => void;
  onToggleChannel: (value: string) => void;
}) {
  const points = monitor?.series?.points ?? [];
  const options = timeseriesOptions(points);
  const visiblePoints = points.filter((point) => (
    selectedUsers.has(point.portalUserRef)
      && selectedOrders.has(point.issuanceRequestId)
      && selectedChannels.has(point.channelRef)
  ));
  const series = groupTimeseriesPoints(visiblePoints);

  return (
    <section className="gate-review-card usage-timeseries-card" aria-labelledby="usage-timeseries-heading">
      <div>
        <h3 id="usage-timeseries-heading">历史用量曲线</h3>
        <p className="muted">按用户、订单和实际用量通道勾选曲线；表格仍保留完整订单账本。</p>
      </div>

      <div className="usage-timeseries-layout">
        <div className="usage-chart-controls" aria-label="用量曲线筛选">
          <CheckboxGroup
            title="用户"
            values={options.users}
            selected={selectedUsers}
            onToggle={onToggleUser}
          />
          <CheckboxGroup
            title="订单"
            values={options.orders}
            selected={selectedOrders}
            onToggle={onToggleOrder}
          />
          <CheckboxGroup
            title="通道"
            values={options.channels}
            selected={selectedChannels}
            onToggle={onToggleChannel}
          />
        </div>

        <div className="usage-chart-panel">
          <UsageTimeseriesChart series={series} points={visiblePoints} />
          {visiblePoints.length === 0 ? (
            <p className="usage-chart-empty">当前勾选条件下暂无曲线数据。</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function CheckboxGroup({
  title,
  values,
  selected,
  onToggle
}: {
  title: string;
  values: string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
}) {
  return (
    <div className="usage-check-group">
      <strong>{title}</strong>
      <div className="usage-check-list">
        {values.length > 0 ? values.map((value) => (
          <label key={value}>
            <input
              type="checkbox"
              checked={selected.has(value)}
              onChange={() => onToggle(value)}
            />
            <span>{title} {value}</span>
          </label>
        )) : (
          <span className="muted">暂无{title}</span>
        )}
      </div>
    </div>
  );
}

function UsageTimeseriesChart({
  series,
  points
}: {
  series: Array<{
    key: string;
    label: string;
    order: string;
    channel: string;
    points: SubscriptionUsageTimeseriesPoint[];
  }>;
  points: SubscriptionUsageTimeseriesPoint[];
}) {
  const width = 720;
  const height = 240;
  const padding = { top: 20, right: 24, bottom: 34, left: 56 };
  const xValues = points.map((point) => new Date(point.bucketStart).getTime()).filter(Number.isFinite);
  const minX = xValues.length > 0 ? Math.min(...xValues) : Date.now();
  const maxX = xValues.length > 0 ? Math.max(...xValues) : minX + 1;
  const maxY = Math.max(1, ...points.map((point) => safeNumber(point.usedBytes)));

  return (
    <svg
      className="usage-chart-svg"
      role="img"
      aria-label="订单历史用量曲线"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      <line
        className="usage-chart-axis"
        x1={padding.left}
        y1={height - padding.bottom}
        x2={width - padding.right}
        y2={height - padding.bottom}
      />
      <line
        className="usage-chart-axis"
        x1={padding.left}
        y1={padding.top}
        x2={padding.left}
        y2={height - padding.bottom}
      />
      <text className="usage-chart-label" x={padding.left} y={16}>
        {formatBytes(maxY)}
      </text>
      {series.map((entry, index) => (
        <polyline
          key={entry.key}
          aria-label={entry.label}
          className={`usage-chart-line usage-chart-line-${index % 6}`}
          points={[...entry.points]
            .sort((left, right) => left.bucketStart.localeCompare(right.bucketStart))
            .map((point) => {
              const x = scaleTime(new Date(point.bucketStart).getTime(), minX, maxX, padding.left, width - padding.right);
              const y = scaleNumber(point.usedBytes, 0, maxY, height - padding.bottom, padding.top);
              return `${x},${y}`;
            })
            .join(" ")}
          fill="none"
        />
      ))}
    </svg>
  );
}

function timeseriesOptions(points: SubscriptionUsageTimeseriesPoint[]) {
  return {
    users: uniqueSorted(points.map((point) => point.portalUserRef)),
    orders: uniqueSorted(points.map((point) => point.issuanceRequestId)),
    channels: uniqueSorted(points.map((point) => point.channelRef))
  };
}

function groupTimeseriesPoints(points: SubscriptionUsageTimeseriesPoint[]) {
  const groups = new Map<string, {
    key: string;
    label: string;
    order: string;
    channel: string;
    points: SubscriptionUsageTimeseriesPoint[];
  }>();
  for (const point of points) {
    const key = `${point.issuanceRequestId}:${point.channelRef}`;
    const existing = groups.get(key);
    if (existing) {
      existing.points.push(point);
    } else {
      groups.set(key, {
        key,
        label: `曲线 ${point.issuanceRequestId} ${point.channelRef}`,
        order: point.issuanceRequestId,
        channel: point.channelRef,
        points: [point]
      });
    }
  }
  return Array.from(groups.values());
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function toggleSetValue(
  setter: Dispatch<SetStateAction<Set<string>>>,
  value: string
) {
  setter((current) => {
    const next = new Set(current);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    return next;
  });
}

function scaleTime(value: number, min: number, max: number, low: number, high: number) {
  if (!Number.isFinite(value) || max <= min) {
    return (low + high) / 2;
  }
  return low + ((value - min) / (max - min)) * (high - low);
}

function scaleNumber(value: number, min: number, max: number, low: number, high: number) {
  const normalized = safeNumber(value);
  if (max <= min) {
    return low;
  }
  return low - ((normalized - min) / (max - min)) * (low - high);
}

function safeNumber(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function safeValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "未记录";
  }
  return value;
}

function resourceChannelLabel(value: string | null | undefined) {
  if (!value) return "未记录";
  return value;
}

function issuedChannelList(row: SubscriptionUsageMonitorRow) {
  const channels = Array.isArray(row.issuedChannels) && row.issuedChannels.length > 0
    ? row.issuedChannels
    : (row.nodeId ? [row.nodeId] : []);
  if (channels.length === 0) {
    return <span className="muted">未记录</span>;
  }
  return (
    <span className="usage-channel-list">
      {channels.map((channelRef) => (
        <span className="usage-channel-chip" key={channelRef}>
          <span>{resourceChannelLabel(channelRef)}</span>
        </span>
      ))}
    </span>
  );
}

function formatTrafficBytes(row: SubscriptionUsageMonitorRow) {
  const collectionStatus = normalizedCollectionStatus(row);
  if (collectionStatus === "collector_disabled") {
    return "采集器未启用";
  }
  if (collectionStatus === "not_collected") {
    return "未采集";
  }
  const used = formatBytes(row.usedBytes);
  if (!row.trafficLimitBytes) {
    return used;
  }
  return `${used} / ${formatBytes(row.trafficLimitBytes)}`;
}

function channelUsageList(row: SubscriptionUsageMonitorRow) {
  if (row.channelUsages.length === 0) {
    return <span className="muted">未记录</span>;
  }
  return (
    <span className="usage-channel-list">
      {row.channelUsages.map((usage) => (
        <span className="usage-channel-chip" key={usage.channelRef || "unknown"}>
          <span>{usage.channelRef || "unknown"}</span>
          <strong>{formatBytes(usage.usedBytes)}</strong>
        </span>
      ))}
    </span>
  );
}

function edgeCredentialBindingList(row: SubscriptionUsageMonitorRow) {
  const bindings = Array.isArray(row.edgeCredentialBindings) ? row.edgeCredentialBindings : [];
  if (bindings.length === 0) {
    return <span className="muted">未绑定</span>;
  }
  return (
    <span className="usage-channel-list" aria-label="edge credential 绑定">
      <span className="usage-channel-chip">
        <span>edge credential</span>
        <strong>{bindings.length} 个绑定</strong>
      </span>
      {bindings.map((binding) => (
        <span className="usage-channel-chip" key={binding.channelRef || "unknown"}>
          <span>{binding.channelRef || "unknown"}</span>
          <strong>{binding.usageMeasured ? "已计量" : "待采集"}</strong>
        </span>
      ))}
    </span>
  );
}

function usageStatusBadge(row: SubscriptionUsageMonitorRow) {
  const collectionStatus = normalizedCollectionStatus(row);
  const label = usageStatusLabel(collectionStatus);
  const className = collectionStatus === "not_collected" || collectionStatus === "collector_disabled"
    ? "status-badge status-badge-muted"
    : "status-badge";
  return <span className={className}>{label}</span>;
}

function normalizedCollectionStatus(row: SubscriptionUsageMonitorRow): SubscriptionUsageCollectionStatus {
  return row.collectionStatus || row.usageStatus || "not_collected";
}

function usageStatusLabel(status: SubscriptionUsageCollectionStatus) {
  if (status === "measured") return "已采集";
  if (status === "measured_zero") return "已采集 0B";
  if (status === "collector_disabled") return "采集器未启用";
  if (status === "stale") return "采集已过期";
  return "未采集";
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

function usageChannelEntries(monitor: SubscriptionUsageMonitor | null) {
  return Object.entries(monitor?.aggregates.usage?.byUsageChannel ?? {})
    .filter(([, bytes]) => bytes > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
}

function deliveryBindingLabel(row: SubscriptionUsageMonitorRow) {
  if (row.tenantRef || row.artifactRef) {
    return "已绑定";
  }
  return "未绑定";
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

function formatDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
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

function metricValue(
  monitor: SubscriptionUsageMonitor | null,
  key: keyof SubscriptionUsageMonitor["aggregates"]
) {
  const value = monitor?.aggregates[key];
  return typeof value === "number" ? value : 0;
}
