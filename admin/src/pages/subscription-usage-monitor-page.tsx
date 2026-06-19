import {
  useCallback,
  useEffect,
  useMemo,
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
import {
  buildUsageMonitorCaseCandidates,
  topCaseCandidates
} from "../features/admin-case-workbench/case-candidates";
import {
  CaseDetailPanel,
  CaseQueue
} from "../features/admin-case-workbench/case-workbench";
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
  { label: "Total records", key: "total" },
  { label: "Recently active", key: "activeRecently" },
  { label: "Never seen", key: "neverSeen" },
  { label: "High refresh", key: "highRefresh" },
  { label: "Blocked", key: "blocked" },
  { label: "Inactive", key: "inactive" },
  { label: "Seen", key: "seen" },
  { label: "With warnings", key: "withWarnings" }
];

const USAGE_METRIC_CARDS: Array<{
  label: string;
  value: (monitor: SubscriptionUsageMonitor | null) => string | number;
}> = [
  { label: "Platform measured traffic", value: (monitor) => formatBytes(monitor?.aggregates.usage?.totalUsedBytes ?? 0) },
  { label: "Upload", value: (monitor) => formatBytes(monitor?.aggregates.usage?.totalUploadBytes ?? 0) },
  { label: "Download", value: (monitor) => formatBytes(monitor?.aggregates.usage?.totalDownloadBytes ?? 0) },
  { label: "Measured orders", value: (monitor) => monitor?.aggregates.usage?.measuredOrders ?? 0 },
  { label: "Not connected to collection", value: (monitor) => monitor?.aggregates.usage?.unmeasuredOrders ?? 0 },
  { label: "Over-limit risk", value: (monitor) => (
    (monitor?.aggregates.usage?.overLimitOrders ?? 0) + (monitor?.aggregates.usage?.nearLimitOrders ?? 0)
  ) }
];

const ACTIVITY_LABELS: Record<SubscriptionUsageActivityLevel, string> = {
  never_seen: "Never seen",
  seen: "Seen",
  active_recently: "Recently active",
  high_refresh: "High refresh",
  inactive: "Inactive",
  blocked: "Blocked"
};

type ChannelHealthSummary = {
  channelRef: string;
  issuedOrderCount: number;
  measuredOrderCount: number;
  pendingOrderCount: number;
  staleOrderCount: number;
  collectorDisabledCount: number;
  zeroUsageOrderCount: number;
  unconfirmedBindingCount: number;
  usedBytes: number;
};

type AnomalyReason = {
  label: string;
  tone: "critical" | "warning" | "muted";
};

type AnomalyItem = {
  row: SubscriptionUsageMonitorRow;
  reason: AnomalyReason;
};

export function SubscriptionUsageMonitorPage({ apiClient }: { apiClient: AdminApiClient }) {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [monitor, setMonitor] = useState<SubscriptionUsageMonitor | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set());
  const [selectedCaseRef, setSelectedCaseRef] = useState<string | null>(null);
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
        setError(errorMessage(requestError, "Usage monitor failed to load."));
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

  const caseCandidates = useMemo(() => buildUsageMonitorCaseCandidates(monitor?.items ?? []), [monitor]);
  const visibleCaseCandidates = useMemo(() => topCaseCandidates(caseCandidates, 8), [caseCandidates]);
  const selectedCase = useMemo(() => (
    visibleCaseCandidates.find((item) => item.caseRef === selectedCaseRef)
      ?? visibleCaseCandidates[0]
      ?? null
  ), [selectedCaseRef, visibleCaseCandidates]);

  useEffect(() => {
    if (visibleCaseCandidates.length === 0) {
      setSelectedCaseRef(null);
      return;
    }
    setSelectedCaseRef((current) => (
      current && visibleCaseCandidates.some((item) => item.caseRef === current)
        ? current
        : visibleCaseCandidates[0].caseRef
    ));
  }, [visibleCaseCandidates]);

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <h2>Traffic & Channel Supervision</h2>
          <p className="muted">Platform collection shows channel health; the order ledger owns account, order, and real channel usage attribution.</p>
        </div>
      </div>

      <div className="alert">Platform summaries are supervision evidence only; quota, warning, pause, and archive decisions follow account, order, and edge credential ownership in the order ledger.</div>
      {error ? <div className="alert alert-error">{error}</div> : null}

      <section className="gate-review-card" aria-labelledby="usage-platform-heading">
        <div>
          <h3 id="usage-platform-heading">Platform collection overview</h3>
          <p className="muted">Groups traffic by actual collection channel; it does not replace the per-order ledger.</p>
        </div>
        <div className="metric-grid">
          {USAGE_METRIC_CARDS.map((metric) => (
            <div className="metric-card" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value(monitor)}</strong>
            </div>
          ))}
        </div>
        <div className="usage-channel-breakdown" aria-label="Platform channel usage">
          {usageChannelEntries(monitor).length > 0 ? (
            usageChannelEntries(monitor).map(([channelRef, bytes]) => (
              <span className="usage-channel-chip" key={channelRef}>
                <span>{channelRef}</span>
                <strong>{formatBytes(bytes)}</strong>
              </span>
            ))
          ) : (
            <span className="muted">No measured channel traffic。</span>
          )}
        </div>
      </section>

      <div className="case-workbench-layout">
        <CaseQueue
          title="Traffic & Channel supervision cases"
          description="Read-only supervision candidates derived from order usage, collection coverage, channel binding, and receipt state."
          cases={visibleCaseCandidates}
          selectedCaseRef={selectedCase?.caseRef ?? null}
          onSelect={setSelectedCaseRef}
        />
        <CaseDetailPanel caseItem={selectedCase} />
      </div>

      <ChannelHealthSection monitor={monitor} />

      <UsageTimeseriesSection
        monitor={monitor}
        selectedUsers={selectedUsers}
        selectedOrders={selectedOrders}
        selectedChannels={selectedChannels}
        onToggleUser={(value) => toggleSetValue(setSelectedUsers, value)}
        onToggleOrder={(value) => toggleSetValue(setSelectedOrders, value)}
        onToggleChannel={(value) => toggleSetValue(setSelectedChannels, value)}
      />

      <AnomalyQueueSection monitor={monitor} />

      <section className="gate-review-card" aria-labelledby="usage-monitor-filters-heading">
        <div>
          <h3 id="usage-monitor-filters-heading">Filters</h3>
        </div>
        <form className="monitor-filter-grid" onSubmit={submitFilters}>
          <label>
            <span>Account ID</span>
            <input
              value={filters.accountId}
              onChange={(event) => updateFilter("accountId", event.target.value)}
            />
          </label>
          <label>
            <span>Plan</span>
            <input
              value={filters.plan}
              onChange={(event) => updateFilter("plan", event.target.value)}
            />
          </label>
          <label>
            <span>Resource channel</span>
            <input
              value={filters.nodeId}
              onChange={(event) => updateFilter("nodeId", event.target.value)}
            />
          </label>
          <label>
            <span>Status</span>
            <input
              value={filters.status}
              onChange={(event) => updateFilter("status", event.target.value)}
            />
          </label>
          <label>
            <span>Warnings</span>
            <input
              value={filters.warning}
              onChange={(event) => updateFilter("warning", event.target.value)}
            />
          </label>
          <label>
            <span>From</span>
            <input
              value={filters.from}
              onChange={(event) => updateFilter("from", event.target.value)}
              placeholder="2026-06-08T00:00"
            />
          </label>
          <label>
            <span>To</span>
            <input
              value={filters.to}
              onChange={(event) => updateFilter("to", event.target.value)}
              placeholder="2026-06-09T00:00"
            />
          </label>
          <label>
            <span>Bucket</span>
            <select
              value={filters.bucket}
              onChange={(event) => updateFilter("bucket", event.target.value)}
            >
              <option value="hour">Hourly</option>
              <option value="day">Daily</option>
            </select>
          </label>
          <div className="monitor-filter-actions">
            <button className="primary-button" type="submit">
              Apply filters
            </button>
          </div>
        </form>
      </section>

      <section className="gate-review-card" aria-labelledby="usage-monitor-aggregates-heading">
        <div>
          <h3 id="usage-monitor-aggregates-heading">Order activity summary</h3>
          <p className="muted">Aggregates refresh, status, and warning counts by order; it does not represent total platform traffic.</p>
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
          <h3 id="usage-monitor-table-heading">Order usage ledger</h3>
          <p className="muted">Each row represents a delivered order; usage is split by actual collection channel and attributed to the order.</p>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>User / Account</th>
                <th>Order</th>
                <th>Plan / quantity</th>
                <th>Issued channels</th>
                <th>Credential anchors</th>
                <th>Order cumulative usage</th>
                <th>Measured usage channels</th>
                <th>Last collected</th>
                <th>Collection status</th>
                <th>Delivery status</th>
                <th>Activity</th>
                <th>Link status</th>
                <th>Last refresh</th>
                <th>Refresh count</th>
                <th>Warnings</th>
              </tr>
            </thead>
            <tbody>
              {loading && !monitor ? (
                <tr>
                  <td className="loading-row" colSpan={15}>Loading activity records...</td>
                </tr>
              ) : null}
              {!loading && monitor?.items.length === 0 ? (
                <tr>
                  <td className="loading-row" colSpan={15}>
                    No activity records match the current filters.
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
          "Not recorded"
        )}
      </td>
    </tr>
  );
}

function ChannelHealthSection({ monitor }: { monitor: SubscriptionUsageMonitor | null }) {
  const channels = channelHealthSummaries(monitor);

  return (
    <section className="gate-review-card" aria-label="Channel collection health" aria-labelledby="usage-channel-health-heading">
      <div>
        <h3 id="usage-channel-health-heading">Platform channel health</h3>
        <p className="muted">Shows collection coverage by issued channel; platform channel totals are not single-user order usage.</p>
      </div>
      {channels.length > 0 ? (
        <div className="usage-channel-health-grid">
          {channels.map((channel) => (
            <article className="usage-channel-health-card" key={channel.channelRef}>
              <div className="usage-card-header">
                <strong>{channel.channelRef}</strong>
                <span className={channelHealthBadgeClass(channel)}>{channelHealthLabel(channel)}</span>
              </div>
              <div className="usage-channel-health-stats">
                <span>Coverage {channel.issuedOrderCount} orders</span>
                <span>Measured {channel.measuredOrderCount} orders</span>
                <span>Pending collection {channel.pendingOrderCount} orders</span>
                <strong>{formatBytes(channel.usedBytes)}</strong>
              </div>
              {channel.unconfirmedBindingCount > 0 ? (
                <span className="warning-chip">Receipt / collection pending {channel.unconfirmedBindingCount}</span>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="muted">No channels are available for supervision.</p>
      )}
    </section>
  );
}

function AnomalyQueueSection({ monitor }: { monitor: SubscriptionUsageMonitor | null }) {
  const anomalies = anomalyItems(monitor);
  const stats = anomalyStats(monitor);

  return (
    <section className="gate-review-card" aria-label="Anomalous subscription queue" aria-labelledby="usage-anomaly-heading">
      <div>
        <h3 id="usage-anomaly-heading">Anomalous subscription queue</h3>
        <p className="muted">Provides visual supervision and anomaly triage only; subscriptions are not created, disabled, or archived here.</p>
      </div>
      <div className="usage-anomaly-summary-grid">
        {stats.map((stat) => (
          <div className="metric-card usage-anomaly-summary-card" key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </div>
        ))}
      </div>
      {anomalies.length > 0 ? (
        <div className="usage-anomaly-list">
          {anomalies.map((item) => (
            <article className="usage-anomaly-row" key={item.row.issuanceRequestId}>
              <div>
                <strong>{safeValue(item.row.issuanceRequestId)}</strong>
                <span className="muted">{safeValue(item.row.portalUserRef)}</span>
              </div>
              <span className={anomalyBadgeClass(item.reason)}>{item.reason.label}</span>
              <span>{anomalyUsageDetail(item.row)}</span>
              <span>{anomalyChannelSummary(item.row)}</span>
            </article>
          ))}
        </div>
      ) : (
        <p className="muted">No anomalous subscriptions require manual review.</p>
      )}
    </section>
  );
}

function channelHealthSummaries(monitor: SubscriptionUsageMonitor | null): ChannelHealthSummary[] {
  const summaries = new Map<string, {
    channelRef: string;
    issuedOrders: Set<string>;
    measuredOrders: Set<string>;
    pendingOrders: Set<string>;
    staleOrders: Set<string>;
    collectorDisabledOrders: Set<string>;
    zeroUsageOrders: Set<string>;
    unconfirmedBindings: Set<string>;
    usedBytes: number;
  }>();

  for (const row of monitor?.items ?? []) {
    const channels = channelsForRow(row);
    for (const channelRef of channels) {
      const summary = summaries.get(channelRef) ?? {
        channelRef,
        issuedOrders: new Set<string>(),
        measuredOrders: new Set<string>(),
        pendingOrders: new Set<string>(),
        staleOrders: new Set<string>(),
        collectorDisabledOrders: new Set<string>(),
        zeroUsageOrders: new Set<string>(),
        unconfirmedBindings: new Set<string>(),
        usedBytes: 0
      };
      const orderId = row.issuanceRequestId;
      const status = normalizedCollectionStatus(row);
      const measured = isMeasuredChannel(row, channelRef) && (status === "measured" || status === "measured_zero");

      summary.issuedOrders.add(orderId);
      if (measured) {
        summary.measuredOrders.add(orderId);
      } else {
        summary.pendingOrders.add(orderId);
      }
      if (status === "stale") {
        summary.staleOrders.add(orderId);
      }
      if (status === "collector_disabled") {
        summary.collectorDisabledOrders.add(orderId);
      }
      if (status === "measured_zero") {
        summary.zeroUsageOrders.add(orderId);
      }
      if (hasUnconfirmedBinding(row, channelRef)) {
        summary.unconfirmedBindings.add(orderId);
      }
      summary.usedBytes += channelUsedBytes(row, channelRef, channels.length);
      summaries.set(channelRef, summary);
    }
  }

  return [...summaries.values()]
    .map((summary) => ({
      channelRef: summary.channelRef,
      issuedOrderCount: summary.issuedOrders.size,
      measuredOrderCount: summary.measuredOrders.size,
      pendingOrderCount: summary.pendingOrders.size,
      staleOrderCount: summary.staleOrders.size,
      collectorDisabledCount: summary.collectorDisabledOrders.size,
      zeroUsageOrderCount: summary.zeroUsageOrders.size,
      unconfirmedBindingCount: summary.unconfirmedBindings.size,
      usedBytes: summary.usedBytes
    }))
    .sort((left, right) => right.usedBytes - left.usedBytes || left.channelRef.localeCompare(right.channelRef));
}

function channelsForRow(row: SubscriptionUsageMonitorRow) {
  const channels = Array.isArray(row.issuedChannels) && row.issuedChannels.length > 0
    ? row.issuedChannels
    : (row.nodeId ? [row.nodeId] : []);
  return uniqueSorted(channels);
}

function isMeasuredChannel(row: SubscriptionUsageMonitorRow, channelRef: string) {
  if (row.channelUsages.some((usage) => usage.channelRef === channelRef)) {
    return true;
  }
  if (row.edgeCredentialBindings.some((binding) => binding.channelRef === channelRef && binding.usageMeasured)) {
    return true;
  }
  return channelsForRow(row).length <= 1 && row.usageMeasured;
}

function channelUsedBytes(row: SubscriptionUsageMonitorRow, channelRef: string, channelCount: number) {
  const channelUsage = row.channelUsages.find((usage) => usage.channelRef === channelRef);
  if (channelUsage) {
    return safeNumber(channelUsage.usedBytes);
  }
  if (channelCount === 1 && (normalizedCollectionStatus(row) === "measured" || normalizedCollectionStatus(row) === "measured_zero")) {
    return safeNumber(row.usedBytes);
  }
  return 0;
}

function hasUnconfirmedBinding(row: SubscriptionUsageMonitorRow, channelRef?: string) {
  return row.edgeCredentialBindings.some((binding) => (
    (!channelRef || binding.channelRef === channelRef)
      && (!binding.credentialRefPresent || !binding.materialDigestPresent)
  ));
}

function channelHealthLabel(channel: ChannelHealthSummary) {
  if (channel.unconfirmedBindingCount > 0) return "Receipt pending";
  if (channel.collectorDisabledCount > 0) return "Collector disabled";
  if (channel.staleOrderCount > 0) return "Collection stale";
  if (channel.pendingOrderCount > 0) return "Pending collection";
  if (channel.zeroUsageOrderCount > 0) return "True 0B";
  return "Collection normal";
}

function channelHealthBadgeClass(channel: ChannelHealthSummary) {
  if (channel.unconfirmedBindingCount > 0 || channel.collectorDisabledCount > 0 || channel.staleOrderCount > 0) {
    return "warning-chip";
  }
  if (channel.pendingOrderCount > 0 || channel.zeroUsageOrderCount > 0) {
    return "status-badge status-badge-muted";
  }
  return "status-badge";
}

function anomalyStats(monitor: SubscriptionUsageMonitor | null) {
  const rows = monitor?.items ?? [];
  return [
    { label: "Over-limit subscriptions", value: rows.filter(isOverLimitRow).length },
    { label: "Zero usage", value: rows.filter((row) => normalizedCollectionStatus(row) === "measured_zero").length },
    { label: "Stale orders", value: rows.filter((row) => normalizedCollectionStatus(row) === "stale").length },
    { label: "Collection gaps", value: rows.filter(isCollectionGapRow).length }
  ];
}

function anomalyItems(monitor: SubscriptionUsageMonitor | null): AnomalyItem[] {
  return (monitor?.items ?? [])
    .map((row) => {
      const reason = anomalyReason(row);
      return reason ? { row, reason } : null;
    })
    .filter((item): item is AnomalyItem => Boolean(item))
    .sort((left, right) => (
      anomalyPriority(left.reason) - anomalyPriority(right.reason)
      || left.row.issuanceRequestId.localeCompare(right.row.issuanceRequestId)
    ));
}

function anomalyReason(row: SubscriptionUsageMonitorRow): AnomalyReason | null {
  const status = normalizedCollectionStatus(row);
  if (isOverLimitRow(row)) {
    return { label: "Over limit", tone: "critical" };
  }
  if (isNearLimitRow(row)) {
    return { label: "Near limit", tone: "warning" };
  }
  if (status === "measured_zero") {
    return { label: "True 0B", tone: "muted" };
  }
  if (status === "stale") {
    return { label: "Collection stale", tone: "warning" };
  }
  if (status === "collector_disabled") {
    return { label: "Collector disabled", tone: "warning" };
  }
  if (hasUnconfirmedBinding(row)) {
    return { label: "Receipt / collection pending", tone: "warning" };
  }
  if (status === "not_collected") {
    return { label: "Not connected to collection", tone: "muted" };
  }
  if (row.warnings.length > 0) {
    return { label: warningLabel(row.warnings[0]), tone: "warning" };
  }
  return null;
}

function anomalyPriority(reason: AnomalyReason) {
  const priorities: Record<string, number> = {
    "Over limit": 1,
    "Near limit": 2,
    "Collection stale": 3,
    "Collector disabled": 4,
    "Receipt / collection pending": 5,
    "Not connected to collection": 6,
    "True 0B": 7
  };
  return priorities[reason.label] ?? 8;
}

function isOverLimitRow(row: SubscriptionUsageMonitorRow) {
  return row.trafficLimitBytes > 0 && row.usedBytes >= row.trafficLimitBytes;
}

function isNearLimitRow(row: SubscriptionUsageMonitorRow) {
  return row.trafficLimitBytes > 0
    && row.usedBytes >= row.trafficLimitBytes * 0.8
    && row.usedBytes < row.trafficLimitBytes;
}

function isCollectionGapRow(row: SubscriptionUsageMonitorRow) {
  const status = normalizedCollectionStatus(row);
  return status === "collector_disabled" || status === "not_collected" || hasUnconfirmedBinding(row);
}

function anomalyBadgeClass(reason: AnomalyReason) {
  if (reason.tone === "critical") {
    return "warning-chip warning-chip-critical";
  }
  if (reason.tone === "muted") {
    return "status-badge status-badge-muted";
  }
  return "warning-chip";
}

function anomalyUsageDetail(row: SubscriptionUsageMonitorRow) {
  const status = normalizedCollectionStatus(row);
  if (status === "collector_disabled") {
    return "No measurement data";
  }
  if (status === "not_collected") {
    return hasUnconfirmedBinding(row) ? "Waiting for receipt / collection" : "Waiting for collection";
  }
  return formatTrafficBytes(row);
}

function anomalyChannelSummary(row: SubscriptionUsageMonitorRow) {
  const channels = channelsForRow(row);
  const measured = channels.filter((channelRef) => (
    isMeasuredChannel(row, channelRef)
      && (normalizedCollectionStatus(row) === "measured" || normalizedCollectionStatus(row) === "measured_zero")
  )).length;
  if (channels.length === 0) {
    return "No recorded channels";
  }
  return `${measured}/${channels.length} channels measured`;
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
        <h3 id="usage-timeseries-heading">Historical usage curves</h3>
        <p className="muted">Select curves by user, order, and actual usage channel; the table remains the full order ledger.</p>
      </div>

      <div className="usage-timeseries-layout">
        <div className="usage-chart-controls" aria-label="Usage curve filters">
          <CheckboxGroup
            title="User"
            values={options.users}
            selected={selectedUsers}
            onToggle={onToggleUser}
          />
          <CheckboxGroup
            title="Order"
            values={options.orders}
            selected={selectedOrders}
            onToggle={onToggleOrder}
          />
          <CheckboxGroup
            title="Channel"
            values={options.channels}
            selected={selectedChannels}
            onToggle={onToggleChannel}
          />
        </div>

        <div className="usage-chart-panel">
          <UsageTimeseriesChart series={series} points={visiblePoints} />
          {visiblePoints.length === 0 ? (
            <p className="usage-chart-empty">No curve data matches the current selection.</p>
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
          <span className="muted">No {title}</span>
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
      aria-label="OrderHistorical usage curves"
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
        label: `Curve ${point.issuanceRequestId} ${point.channelRef}`,
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
    return "Not recorded";
  }
  return value;
}

function resourceChannelLabel(value: string | null | undefined) {
  if (!value) return "Not recorded";
  return value;
}

function issuedChannelList(row: SubscriptionUsageMonitorRow) {
  const channels = Array.isArray(row.issuedChannels) && row.issuedChannels.length > 0
    ? row.issuedChannels
    : (row.nodeId ? [row.nodeId] : []);
  if (channels.length === 0) {
    return <span className="muted">Not recorded</span>;
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
    return "Collector disabled";
  }
  if (collectionStatus === "not_collected") {
    return "Not collected";
  }
  const used = formatBytes(row.usedBytes);
  if (!row.trafficLimitBytes) {
    return used;
  }
  return `${used} / ${formatBytes(row.trafficLimitBytes)}`;
}

function channelUsageList(row: SubscriptionUsageMonitorRow) {
  if (row.channelUsages.length === 0) {
    return <span className="muted">Not recorded</span>;
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
    return <span className="muted">Unbound</span>;
  }
  return (
    <span className="usage-channel-list" aria-label="edge credential bindings">
      <span className="usage-channel-chip">
        <span>edge credential</span>
        <strong>{bindings.length} bindings</strong>
      </span>
      {bindings.map((binding) => (
        <span className="usage-channel-chip" key={binding.channelRef || "unknown"}>
          <span>{binding.channelRef || "unknown"}</span>
          <strong>{binding.usageMeasured ? "Measured" : "Pending collection"}</strong>
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
  if (status === "measured") return "Collected";
  if (status === "measured_zero") return "Collected 0B";
  if (status === "collector_disabled") return "Collector disabled";
  if (status === "stale") return "Collection stale";
  return "Not collected";
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
    return "Bound";
  }
  return "Unbound";
}

function warningLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    high_refresh: "High refresh frequency",
    high_refresh_count: "High refresh frequency",
    missing_artifact_ref: "Delivery record missing",
    node_unavailable: "Resource channel unavailable",
    blocked: "Access blocked",
    usage_over_limit: "Over limit",
    usage_near_limit: "Near limit"
  };
  return labels[normalized] ?? "Operational warning";
}

function formatDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
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

function metricValue(
  monitor: SubscriptionUsageMonitor | null,
  key: keyof SubscriptionUsageMonitor["aggregates"]
) {
  const value = monitor?.aggregates[key];
  return typeof value === "number" ? value : 0;
}
