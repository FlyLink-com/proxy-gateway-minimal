import {
  AdminConsolePageFrame,
  type BlueprintPage
} from "./admin-console-page-frame";
import {
  createUsageChannelsOwnerPageModel,
  type UsageOwnerRow,
  type UsageOwnerSection
} from "../app/usage-channels-owner-model";
import { type SubscriptionUsageMonitor } from "../features/subscriptions/types";
import { ADMIN_EVIDENCE_SURFACE_CONTRACTS } from "../app/admin-evidence-contract";
import {
  EvidenceChartPanel,
  EvidenceLogPanel,
  MetricCard,
  RiskQueue,
  SafeRef,
  StatusChip,
  type RiskQueueItem
} from "../components/primitives";
import {
  Activity,
  AlertTriangle,
  Database,
  RadioTower,
} from "lucide-react";

export const usageChannelsBlueprint: BlueprintPage = {
  page: "usageMonitor",
  ariaLabel: "Usage & Channels page header",
  kicker: "Usage & Channels / Evidence Owner",
  title: "Usage & Channels",
  description: "Evidence owner for freshness, coverage, usage ledger, receipts, and anomalies.",
  statusLabel: "Evidence owner",
  statusTone: "info",
  summary: <UsageChannelsSummary />,
  evidence: <UsageChannelsEvidence />,
  overviewModuleIds: ["freshness", "channel-coverage", "usage-ledger"],
  modules: [
    {
      navId: "freshness",
      container: {
        category: "monitoring",
        container: "Collection freshness monitor",
        dataAdapter: "Static freshness fields now; later safe usage monitor generatedAt and collector summaries.",
        layoutPolicy: "Monitoring strip with collapsible detail; no quota ownership controls.",
        performanceBoundary: "Freshness can refresh independently from ledgers and account workspaces.",
        interactionModel: "Inspect trust state and route evidence to owner pages."
      },
      content: <FreshnessContent />,
      containmentStrategy: "not-applicable",
      actions: <StatusChip label="Fresh" tone="success" />,
      purpose: "Inspect whether usage collection is fresh enough to trust downstream quota and risk decisions.",
      contentFields: [
        "Generated · monitor time",
        "Latest usage · observed age",
        "Unknown · count",
        "Stale · count",
        "Delay · threshold"
      ],
      states: [
        "Fresh",
        "Stale",
        "Unknown",
        "Disconnected"
      ],
      uiSurface: "usage-freshness",
      ownership: "Owns collection trust and stale/unknown diagnosis.",
      boundaries: [
        "No quota edit",
        "No account disable",
        "No artifact lifecycle decision"
      ],
      nextStep: "Reconnect freshness metrics after collector contracts and section layout are approved."
    },
    {
      navId: "channel-coverage",
      container: {
        category: "monitoring",
        container: "Channel coverage monitor",
        dataAdapter: "Static channel and route fields now; later issued/measured channel, latency, and receipt blocker summaries.",
        layoutPolicy: "Coverage panels and safe ledger; no node provisioning or runtime apply controls.",
        performanceBoundary: "Channel aggregates load separately from order usage rows.",
        interactionModel: "Inspect missing coverage and prepare evidence handoff."
      },
      content: <ChannelCoverageContent />,
      containmentStrategy: "pagination",
      actions: <StatusChip label="Covered" tone="success" />,
      purpose: "Compare issued channels, measured channels, missing channels, and receipt blockers.",
      contentFields: [
        "Channel safe ref · health state",
        "Issued / measured channel coverage",
        "Utilization and error rate",
        "Receipt blocker state",
        "Route latency · p50 / p95 / p99"
      ],
      states: [
        "Fully measured",
        "Partially measured",
        "Missing receipt",
        "Route stale",
        "No issued channel"
      ],
      uiSurface: "channel-coverage",
      ownership: "Owns channel coverage evidence and receipt blocker classification.",
      boundaries: [
        "No channel runtime apply",
        "No node provisioning",
        "No credentials or material digests"
      ],
      nextStep: "Rebuild channel coverage and route latency ledgers from redacted usage monitor rows."
    },
    {
      navId: "usage-ledger",
      container: {
        category: "monitoring",
        container: "Usage ledger table",
        dataAdapter: "Static ledger fields now; later redacted usage monitor rows and pagination.",
        layoutPolicy: "Dense table inside Platform Monitoring; never duplicated in Overview.",
        performanceBoundary: "Virtualization or pagination required before large production datasets.",
        interactionModel: "Read-only measurement evidence with safe refs."
      },
      content: <UsageLedgerContent />,
      containmentStrategy: "pagination",
      actions: <StatusChip label="Locked" tone="success" />,
      purpose: "Provide evidence rows for account, order, channel, and measured traffic correlation.",
      contentFields: [
        "User/account · safe ref",
        "Order count · measured / pending",
        "Channel · safe ref",
        "Traffic · upload / download / total",
        "Collected · timestamp"
      ],
      states: [
        "Measured",
        "Measured zero",
        "Not collected",
        "Collector disabled"
      ],
      uiSurface: "usage-ledger",
      ownership: "Owns measurement evidence only; Accounts & Resources owns quota and lifecycle decisions.",
      boundaries: [
        "No order pause/archive action",
        "No quota policy controls",
        "No subscription artifact lifecycle"
      ],
      nextStep: "Reconnect read-only ledger after column taxonomy and privacy filters are finalized."
    },
    {
      navId: "collection-anomalies",
      container: {
        category: "monitoring",
        container: "Collection anomaly queue",
        dataAdapter: "Static anomaly taxonomy now; later safe computed anomaly candidates.",
        layoutPolicy: "Queue with filters later; durable case workflow is restricted and not registered for normal operators.",
        performanceBoundary: "Bounded candidate list, no mounted object history by default.",
        interactionModel: "Classify and route evidence; no false-positive close yet."
      },
      content: <CollectionAnomaliesContent />,
      containmentStrategy: "pagination",
      purpose: "Classify delayed collection, true zero usage, not collected, disabled collector, and missing receipt candidates.",
      contentFields: [
        "Reason · anomaly type",
        "Severity · queue level",
        "Affected refs · safe only",
        "Evidence · source",
        "Owner page · handoff"
      ],
      states: [
        "No anomalies",
        "Delay warning",
        "Zero usage",
        "Collection gap",
        "Missing receipt"
      ],
      uiSurface: "collection-anomalies",
      ownership: "Owns anomaly classification; durable case workflow is a future restricted responsibility.",
      boundaries: [
        "No false-positive close",
        "No durable case note write",
        "No account or order mutation"
      ],
      nextStep: "Map anomaly taxonomy to future case candidates after usage rows are reconnected."
    },
    {
      navId: "receipts-collectors",
      container: {
        category: "platform-tools",
        container: "Safe diagnostics entry panel",
        dataAdapter: "Static receipt, collector, agent, and inspection slots now; later no-secret diagnostics adapter.",
        layoutPolicy: "Read-only diagnostics entry, not a collector activation or log console.",
        performanceBoundary: "Diagnostics mount only when expanded or opened in the future tools page.",
        interactionModel: "Show evidence availability; no raw logs, config, or runtime apply."
      },
      content: <ReceiptsCollectorsContent />,
      containmentStrategy: "pagination",
      purpose: "Show whether receipt and collector evidence is available for safe operator decisions.",
      contentFields: [
        "Receipt freshness",
        "Pending / missing receipt counts",
        "Agent heartbeat and version",
        "Collector pull / push state",
        "Inspection run result"
      ],
      states: [
        "Receipts healthy",
        "Pending receipt",
        "Collector disabled",
        "Agent degraded",
        "Inspection warning",
        "Diagnostics locked"
      ],
      uiSurface: "receipts-collectors",
      ownership: "Owns receipt and collector evidence availability.",
      boundaries: [
        "No raw logs",
        "No audit trail",
        "No raw config",
        "No credential or edge material output"
      ],
      nextStep: "Connect safe agent, receipt, and inspection diagnostics only after no-secret data contracts and tests exist."
    }
  ]
};

const usageChannelsOwnerPageModel = createUsageChannelsOwnerPageModel(usageChannelsBlueprint);

function UsageChannelsEvidence() {
  return (
    <>
      <EvidenceChartPanel
        ariaLabel="Usage Metrics evidence panel"
        contract={ADMIN_EVIDENCE_SURFACE_CONTRACTS.usageMetrics}
        description="Safe collection evidence for freshness, coverage, measured usage, and anomalies."
        series={[
          { label: "Freshness", tone: "success", values: [93, 94, 95, 96, 98, 98, 99] },
          { label: "Coverage", tone: "info", values: [27, 27, 28, 28, 29, 29, 29] },
          { label: "Anomalies", tone: "warning", values: [1, 1, 1, 2, 2, 2, 3] }
        ]}
        stats={[
          { label: "Observed age", tone: "success", value: "2m" },
          { label: "Coverage", tone: "info", value: "24/25" },
          { label: "Anomalies", tone: "warning", value: "4" }
        ]}
        title="Usage Metrics"
      />
      <EvidenceLogPanel
        ariaLabel="Usage and Channel Event Log evidence panel"
        contract={ADMIN_EVIDENCE_SURFACE_CONTRACTS.usageChannelEventLog}
        description="Collector and channel facts remain read-only and redacted at this layer."
        entries={[
          {
            detail: "Measured usage sample is inside the freshness threshold for the primary channel.",
            source: "collection freshness",
            time: "12:24",
            title: "Fresh sample observed",
            tone: "success"
          },
          {
            detail: "One route remains delayed; owner page keeps the anomaly visible without runtime apply.",
            source: "channel coverage",
            time: "12:08",
            title: "Delayed route retained",
            tone: "warning"
          },
          {
            detail: "Receipt gap is recorded as evidence only; no raw logs or runtime material is exposed.",
            source: "receipt collector",
            time: "11:48",
            title: "Receipt evidence pending",
            tone: "danger"
          }
        ]}
        title="Usage & Channel Event Log"
      />
    </>
  );
}

function UsageChannelsSummary({ monitor }: { monitor?: SubscriptionUsageMonitor }) {
  if (monitor) {
    const usage = monitor.aggregates.usage;
    const userAggregates = monitor.userAggregates ?? [];
    const hasUserAggregates = userAggregates.length > 0;
    const measuredUsers = userAggregates.filter((aggregate) => aggregate.usageMeasured).length;
    const pendingUsers = userAggregates.length - measuredUsers;
    const pending = hasUserAggregates ? pendingUsers : usage.unmeasuredOrders + usage.zeroUsageOrders;
    return (
      <div className="ops-metric-grid" aria-label="Usage & Channels summary metrics">
        <MetricCard
          detail="Generated"
          icon={<Activity aria-hidden="true" />}
          label="Freshness"
          status={{
            label: monitor.safety.usageCollectorConfigured === false ? "Locked" : "Live",
            tone: monitor.safety.usageCollectorConfigured === false ? "warning" : "success"
          }}
          tone={monitor.safety.usageCollectorConfigured === false ? "warning" : "success"}
          value={formatUsageDateTime(monitor.generatedAt)}
        />
        <MetricCard
          detail={hasUserAggregates ? "Measured users" : "Measured orders"}
          icon={<RadioTower aria-hidden="true" />}
          label="Coverage"
          status={{
            label: pending > 0 ? "Review" : "Covered",
            tone: pending > 0 ? "warning" : "success"
          }}
          tone={pending > 0 ? "warning" : "success"}
          value={hasUserAggregates ? `${measuredUsers}/${userAggregates.length}` : `${usage.measuredOrders}/${monitor.aggregates.total}`}
        />
        <MetricCard
          detail="Measured traffic"
          icon={<Database aria-hidden="true" />}
          label="Usage ledger"
          status={{
            label: monitor.safety.realByteUsageMeasured ? "Measured" : "Summary",
            tone: "info"
          }}
          tone="info"
          value={formatUsageBytes(usage.totalUsedBytes)}
        />
        <MetricCard
          detail="Warnings or pending"
          icon={<AlertTriangle aria-hidden="true" />}
          label="Anomalies"
          status={{
            label: monitor.aggregates.withWarnings > 0 ? "Review" : "Clear",
            tone: monitor.aggregates.withWarnings > 0 ? "warning" : "success"
          }}
          tone={monitor.aggregates.withWarnings > 0 ? "warning" : "success"}
          value={String(monitor.aggregates.withWarnings + usage.unmeasuredOrders)}
        />
      </div>
    );
  }

  return (
    <div className="ops-metric-grid" aria-label="Usage & Channels summary metrics">
      <MetricCard
        detail="SLO 5m"
        icon={<Activity aria-hidden="true" />}
        label="Freshness"
        status={{
          label: "Good",
          tone: "success"
        }}
        tone="success"
        value="2m 14s"
      />
      <MetricCard
        detail="Available share"
        icon={<RadioTower aria-hidden="true" />}
        label="Coverage"
        status={{
          label: "Good",
          tone: "success"
        }}
        tone="success"
        value="98.6%"
      />
      <MetricCard
        detail="Measured traffic"
        icon={<Database aria-hidden="true" />}
        label="Usage ledger"
        status={{
          label: "Measured",
          tone: "info"
        }}
        tone="info"
        value="42.8GB"
      />
      <MetricCard
        detail="Delay or missing"
        icon={<AlertTriangle aria-hidden="true" />}
        label="Anomalies"
        status={{
          label: "Review",
          tone: "warning"
        }}
        tone="warning"
        value="4"
      />
    </div>
  );
}

export function SubscriptionUsageMonitorPage({
  activeModuleNavId,
  fixturePreviewEnabled = false,
  monitor,
  onActiveModuleNavIdChange
}: {
  activeModuleNavId?: string;
  fixturePreviewEnabled?: boolean;
  monitor?: SubscriptionUsageMonitor;
  onActiveModuleNavIdChange?: (navId: string) => void;
}) {
  return (
    <AdminConsolePageFrame
      activeModuleNavId={activeModuleNavId}
      blueprint={usageChannelsBlueprintForMonitor(monitor)}
      fixturePreviewEnabled={fixturePreviewEnabled}
      onActiveModuleNavIdChange={onActiveModuleNavIdChange}
    />
  );
}

function FreshnessContent({ monitor }: { monitor?: SubscriptionUsageMonitor }) {
  return (
    <div className="admin-operator-content" aria-label="Collection Freshness owner model content">
      <UsageOwnerRows
        section={getUsageOwnerSection("freshness")}
        rows={monitor ? usageFreshnessRows(monitor) : undefined}
        subtitle={monitor ? "Live collection status from Admin usage monitor" : undefined}
      />
    </div>
  );
}

function ChannelCoverageContent({ monitor }: { monitor?: SubscriptionUsageMonitor }) {
  return (
    <div className="admin-operator-content" aria-label="Channel Coverage owner model content">
      <UsageOwnerRows
        section={getUsageOwnerSection("channel-coverage")}
        rows={monitor ? usageCoverageRows(monitor) : undefined}
        subtitle={monitor ? "Live issued and measured channel coverage" : undefined}
      />
    </div>
  );
}

function UsageLedgerContent({ monitor }: { monitor?: SubscriptionUsageMonitor }) {
  return (
    <div className="admin-operator-content" aria-label="Usage Ledger owner model content">
      <UsageOwnerRows
        section={getUsageOwnerSection("usage-ledger")}
        rows={monitor ? usageLedgerRows(monitor) : undefined}
        subtitle={monitor ? "Live user traffic ledger aggregated from order measurements" : undefined}
      />
    </div>
  );
}

function UsageOwnerRows({
  rows,
  section,
  subtitle
}: {
  rows?: UsageOwnerRow[];
  section: UsageOwnerSection;
  subtitle?: string;
}) {
  const visibleRows = rows ?? section.rows;
  return (
    <div
      className="admin-operator-content admin-panel-compact-card"
      aria-label={`${section.footer} preview rows`}
      data-query-page={section.query.page}
      data-query-schema={section.query.schemaVersion}
      data-result-window={`1-${visibleRows.length}/${visibleRows.length}`}
      data-route-scope={section.query.routeScope}
    >
      <p className="admin-panel-compact-subtitle">{subtitle ?? section.subtitle}</p>
      <div className="admin-compact-row-list">
        {visibleRows.map((row) => (
          <article
            className={`admin-compact-data-row admin-compact-data-row-${row.tone}`}
            data-figma-component="DataRowCompact"
            data-state-tone={row.tone}
            data-ui-surface="compact-row"
            key={row.label}
          >
            <span className="admin-compact-data-row-main">
              <strong>{row.label}</strong>
              <span className="admin-compact-data-row-detail">{row.meta}</span>
            </span>
            <span className="admin-compact-data-row-meta">{row.rightMeta}</span>
            <span className="admin-compact-data-row-status">{row.statusLabel}</span>
          </article>
        ))}
      </div>
      <div className="admin-overview-panel-footer">
        <span>{section.footer}</span>
        <span aria-hidden="true">•••</span>
      </div>
    </div>
  );
}

function usageChannelsBlueprintForMonitor(monitor?: SubscriptionUsageMonitor): BlueprintPage {
  if (!monitor) {
    return usageChannelsBlueprint;
  }

  return {
    ...usageChannelsBlueprint,
    summary: <UsageChannelsSummary monitor={monitor} />,
    modules: usageChannelsBlueprint.modules.map((module) => {
      if (module.navId === "freshness") {
        return { ...module, content: <FreshnessContent monitor={monitor} /> };
      }
      if (module.navId === "channel-coverage") {
        return { ...module, content: <ChannelCoverageContent monitor={monitor} /> };
      }
      if (module.navId === "usage-ledger") {
        return { ...module, content: <UsageLedgerContent monitor={monitor} /> };
      }
      return module;
    })
  };
}

function usageFreshnessRows(monitor: SubscriptionUsageMonitor): UsageOwnerRow[] {
  const usage = monitor.aggregates.usage;
  return [
    {
      actionLabel: "Open",
      label: "Generated",
      meta: formatUsageDateTime(monitor.generatedAt),
      rightMeta: `${usage.measuredOrders} measured / ${usage.unmeasuredOrders} pending`,
      statusLabel: monitor.safety.usageCollectorConfigured === false ? "Collector locked" : "Live",
      tone: monitor.safety.usageCollectorConfigured === false ? "warning" : "success"
    },
    {
      actionLabel: "Open",
      label: "Warnings",
      meta: `${monitor.aggregates.withWarnings} rows with warnings`,
      rightMeta: `${usage.zeroUsageOrders} zero usage`,
      statusLabel: monitor.aggregates.withWarnings > 0 ? "Review" : "Clear",
      tone: monitor.aggregates.withWarnings > 0 ? "warning" : "success"
    }
  ];
}

function usageCoverageRows(monitor: SubscriptionUsageMonitor): UsageOwnerRow[] {
  const rows = monitor.items.flatMap((item) => (
    item.issuedChannels.map((channelRef) => {
      const measured = item.channelUsages.some((usage) => usage.channelRef === channelRef && usage.lastObservedAt);
      return {
        actionLabel: "Open",
        label: channelRef,
        meta: `${item.accountId} · ${measured ? "measured" : "pending"}`,
        rightMeta: item.nodeId,
        statusLabel: measured ? "Covered" : "Pending",
        tone: measured ? "success" : "warning"
      } satisfies UsageOwnerRow;
    })
  ));
  return rows.length > 0 ? rows.slice(0, 3) : [{
    actionLabel: "Open",
    label: "No issued channels",
    meta: "No safe channel summaries returned",
    rightMeta: "",
    statusLabel: "Empty",
    tone: "neutral"
  }];
}

function usageLedgerRows(monitor: SubscriptionUsageMonitor): UsageOwnerRow[] {
  if (monitor.userAggregates?.length) {
    return monitor.userAggregates.slice(0, 3).map((aggregate) => ({
      actionLabel: "Open",
      label: aggregate.portalUserRef || aggregate.accountId,
      meta: `${aggregate.orderCount} ${aggregate.orderCount === 1 ? "order" : "orders"} · ${formatUsageBytes(aggregate.usedBytes)} / ${formatUsageBytes(aggregate.trafficLimitBytes)}`,
      rightMeta: aggregate.plans.join(", "),
      statusLabel: usageStatusLabel(aggregate.collectionStatus),
      tone: aggregate.collectionStatus === "measured" ? "info" : "warning"
    }));
  }

  const rows = monitor.items.map((item) => ({
    actionLabel: "Open",
    label: item.accountId,
    meta: `${item.issuanceRequestId} · ${formatUsageBytes(item.usedBytes)} / ${formatUsageBytes(item.trafficLimitBytes)}`,
    rightMeta: item.plan,
    statusLabel: usageStatusLabel(item.collectionStatus),
    tone: item.collectionStatus === "measured" ? "info" : "warning"
  } satisfies UsageOwnerRow));
  return rows.length > 0 ? rows.slice(0, 3) : [{
    actionLabel: "Open",
    label: "No usage rows",
    meta: "No safe order usage summaries returned",
    rightMeta: "",
    statusLabel: "Empty",
    tone: "neutral"
  }];
}

function usageStatusLabel(status: string) {
  if (status === "measured") return "Measured";
  if (status === "measured_zero") return "Zero";
  if (status === "stale") return "Stale";
  if (status === "collector_disabled") return "Collector off";
  return "Pending";
}

function formatUsageDateTime(value: string | null | undefined) {
  if (!value) return "No sample";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return date.toISOString().slice(0, 16).replace("T", " ");
}

function formatUsageBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0GB";
  }
  const gib = value / (1024 ** 3);
  return `${gib.toFixed(gib >= 10 ? 0 : 1)}GB`;
}

function getUsageOwnerSection(navId: string): UsageOwnerSection {
  const section = usageChannelsOwnerPageModel.visibleSections.find((candidate) => candidate.navId === navId);
  if (!section) {
    throw new Error(`Usage owner section is not registered: ${navId}`);
  }
  return section;
}

const anomalyItems: RiskQueueItem[] = [
  {
    ref: "anomaly-stale",
    title: "Stale usage collection",
    severity: "warning",
    severityLabel: "Medium",
    objectType: "order",
    objectRef: "ord_safe_104",
    reasonLabel: "Last sample beyond threshold"
  },
  {
    ref: "anomaly-zero",
    title: "True zero usage",
    severity: "info",
    severityLabel: "Low",
    objectType: "order",
    objectRef: "ord_safe_102",
    reasonLabel: "Measured 0 B"
  },
  {
    ref: "anomaly-collector-disabled",
    title: "Collector disabled",
    severity: "critical",
    severityLabel: "High",
    objectType: "collector",
    objectRef: "collector_safe_sgp",
    reasonLabel: "No trusted samples"
  },
  {
    ref: "anomaly-receipt-missing",
    title: "Receipt missing",
    severity: "critical",
    severityLabel: "High",
    objectType: "channel",
    objectRef: "channel_safe_sgp_tuic",
    reasonLabel: "Missing receipt"
  }
];

type AgentStatusRow = {
  agentRef: string;
  collectorState: "Ready" | "Delayed" | "Disabled";
  desiredStatePull: "Current" | "Delayed" | "Unavailable";
  heartbeat: string;
  nodeRef: string;
  receiptPush: "Ready" | "Pending" | "Unavailable";
  version: string;
};

const agentStatusRows: AgentStatusRow[] = [
  {
    agentRef: "agent_safe_jp_01",
    collectorState: "Ready",
    desiredStatePull: "Current",
    heartbeat: "31s ago",
    nodeRef: "node_safe_jp",
    receiptPush: "Ready",
    version: "v0.8.4"
  },
  {
    agentRef: "agent_safe_sgp_02",
    collectorState: "Delayed",
    desiredStatePull: "Delayed",
    heartbeat: "4m ago",
    nodeRef: "node_safe_sgp",
    receiptPush: "Pending",
    version: "v0.8.4"
  },
  {
    agentRef: "agent_safe_tuic_03",
    collectorState: "Disabled",
    desiredStatePull: "Unavailable",
    heartbeat: "No heartbeat",
    nodeRef: "node_safe_tuic",
    receiptPush: "Unavailable",
    version: "v0.8.1"
  }
];

type InspectionRunRow = {
  checkName: string;
  duration: string;
  latestResult: "Pass" | "Warning" | "Blocked";
  nextRun: string;
  ownerObject: string;
};

const inspectionRunRows: InspectionRunRow[] = [
  {
    checkName: "receipt-freshness",
    duration: "1.2s",
    latestResult: "Warning",
    nextRun: "3m",
    ownerObject: "channel_safe_sgp_hy2"
  },
  {
    checkName: "collector-heartbeat",
    duration: "0.8s",
    latestResult: "Pass",
    nextRun: "1m",
    ownerObject: "agent_safe_jp_01"
  },
  {
    checkName: "route-latency-sample",
    duration: "2.4s",
    latestResult: "Blocked",
    nextRun: "manual review",
    ownerObject: "route_safe_tuic_recovery"
  }
];

function CollectionAnomaliesContent() {
  return (
    <RiskQueue
      countLabel="Collection anomaly candidates"
      description="Classifies evidence only; quota and lifecycle decisions remain on Accounts & Resources."
      footer={<span className="panel-link panel-link-disabled">Durable case close workflow locked</span>}
      items={anomalyItems}
      previewLimit={1}
      title="Anomaly candidates"
    />
  );
}

function ReceiptsCollectorsContent() {
  return (
    <div className="admin-operator-content" aria-label="Receipts and Collectors static operator content">
      <div className="admin-owner-handoff-list">
        <article className="admin-owner-handoff-item">
          <span>Receipt state</span>
          <strong>2 pending</strong>
          <p>Receipt gaps stay visible without exposing protected runtime material.</p>
          <StatusChip label="Pending receipt" tone="warning" />
        </article>
        <article className="admin-owner-handoff-item">
          <span>Collector state</span>
          <strong>1 disabled</strong>
          <p>Collector availability is evidence, not an account or order lifecycle decision.</p>
          <StatusChip label="Collector disabled" tone="danger" />
        </article>
      </div>
      <div className="admin-owner-mini-list" aria-label="Receipt and collector compact diagnostics">
        {agentStatusRows.slice(0, 1).map((row) => (
          <article className="admin-owner-mini-row" key={row.agentRef}>
            <span><SafeRef value={row.agentRef} /> · <SafeRef value={row.nodeRef} /></span>
            <strong>{row.heartbeat}</strong>
            <StatusChip label={row.collectorState} tone={row.collectorState === "Ready" ? "success" : row.collectorState === "Delayed" ? "warning" : "danger"} />
          </article>
        ))}
        {inspectionRunRows.slice(-1).map((row) => (
          <article className="admin-owner-mini-row" key={`${row.checkName}:${row.ownerObject}`}>
            <span>{row.checkName} · <SafeRef value={row.ownerObject} /></span>
            <strong>{row.duration}</strong>
            <StatusChip label={row.latestResult} tone={row.latestResult === "Pass" ? "success" : row.latestResult === "Warning" ? "warning" : "danger"} />
          </article>
        ))}
      </div>
    </div>
  );
}
