import {
  AdminConsolePageFrame,
  type BlueprintPage
} from "./admin-console-page-frame";
import {
  DataTable,
  MetricCard,
  RiskQueue,
  SafeRef,
  StatusChip,
  type RiskQueueItem,
  type RiskSeverity
} from "../components/primitives";
import {
  Activity,
  Gauge,
  RadioTower,
  ReceiptText
} from "lucide-react";
import {
  collectionStatusDisplay,
  formatBytes,
  usageAnomalyReason,
  usageRatio,
  type UsageAnomalyReason,
  type UsageAnomalyTone
} from "../features/subscriptions/usage-view-model";
import type { MetricTone } from "../components/primitives";
import type { SubscriptionUsageCollectionStatus } from "../features/subscriptions/types";

export const usageChannelsBlueprint: BlueprintPage = {
  page: "usageMonitor",
  ariaLabel: "Usage & Channels page header",
  kicker: "Platform Monitoring / Usage & Channels",
  title: "Usage & Channels",
  description: "Evidence owner for usage collection trust, channel coverage, receipts, collectors, and collection anomalies.",
  statusLabel: "Evidence owner",
  statusTone: "info",
  subPages: [
    {
      id: "collection-trust",
      label: "Collection Trust",
      owner: "Platform Monitoring",
      description: "Freshness and anomaly classification for collection trust.",
      moduleNavIds: [
        "freshness",
        "collection-anomalies"
      ]
    },
    {
      id: "channel-evidence",
      label: "Channel Evidence",
      owner: "Platform Monitoring",
      description: "Channel coverage, route latency, receipt evidence, and collector diagnostics.",
      moduleNavIds: [
        "channel-coverage",
        "receipts-collectors"
      ]
    },
    {
      id: "usage-ledger",
      label: "Usage Ledger",
      owner: "Platform Monitoring",
      description: "Read-only account, order, channel, and traffic evidence.",
      moduleNavIds: [
        "usage-ledger"
      ]
    }
  ],
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
      purpose: "Provide evidence rows for account, order, channel, and measured traffic correlation.",
      contentFields: [
        "Account · safe ref",
        "Order · safe ref",
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

export function SubscriptionUsageMonitorPage({
  fixturePreviewEnabled = false
}: {
  fixturePreviewEnabled?: boolean;
}) {
  return (
    <AdminConsolePageFrame
      blueprint={usageChannelsBlueprint}
      fixturePreviewEnabled={fixturePreviewEnabled}
    />
  );
}

function FreshnessContent() {
  return (
    <div className="admin-operator-content" aria-label="Collection Freshness static operator content">
      <div className="ops-metric-grid ops-metric-grid-compact">
        <MetricCard
          detail="Latest safe monitor sample"
          icon={<Activity aria-hidden="true" />}
          label="Collection state"
          tone="success"
          value="Fresh"
        />
        <MetricCard
          detail="Stale threshold 5m"
          icon={<Gauge aria-hidden="true" />}
          label="Observed age"
          tone="info"
          value="2m"
        />
        <MetricCard
          detail="Kept distinct from true zero"
          icon={<RadioTower aria-hidden="true" />}
          label="Unknown rows"
          tone="warning"
          value="2"
        />
        <MetricCard
          detail="Layout remains stable"
          icon={<ReceiptText aria-hidden="true" />}
          label="Disconnected"
          tone="neutral"
          value="0"
        />
      </div>
      <div className="admin-static-status-row" aria-label="Freshness state taxonomy">
        <StatusChip label="Fresh" tone="success" />
        <StatusChip label="Stale" tone="warning" />
        <StatusChip label="Unknown" tone="neutral" />
        <StatusChip label="Collector disabled" tone="danger" />
      </div>
    </div>
  );
}

type ChannelCoverageRow = {
  channelRef: string;
  errorRate: string;
  issued: string;
  lastMeasured: string;
  measured: string;
  state: "Healthy" | "Degraded" | "Blocked";
  receipt: "Healthy" | "Pending receipt" | "Missing receipt";
  utilization: string;
};

const channelCoverageRows: ChannelCoverageRow[] = [
  {
    channelRef: "channel_safe_jp_vless",
    errorRate: "0.2%",
    issued: "12 orders",
    lastMeasured: "2m ago",
    measured: "12 measured",
    receipt: "Healthy",
    state: "Healthy",
    utilization: "64%"
  },
  {
    channelRef: "channel_safe_sgp_hy2",
    errorRate: "1.8%",
    issued: "6 orders",
    lastMeasured: "7m ago",
    measured: "4 measured",
    receipt: "Pending receipt",
    state: "Degraded",
    utilization: "51%"
  },
  {
    channelRef: "channel_safe_sgp_tuic",
    errorRate: "N/A",
    issued: "3 orders",
    lastMeasured: "No trusted sample",
    measured: "0 measured",
    receipt: "Missing receipt",
    state: "Blocked",
    utilization: "Unknown"
  }
];

type RouteLatencyRow = {
  p50: string;
  p95: string;
  p99: string;
  routeRef: string;
  routeType: "Primary" | "Fallback" | "Recovery";
  samples: string;
  source: string;
  state: "Fresh" | "Stale" | "No sample";
  target: string;
};

const routeLatencyRows: RouteLatencyRow[] = [
  {
    p50: "42 ms",
    p95: "88 ms",
    p99: "131 ms",
    routeRef: "route_safe_jp_primary",
    routeType: "Primary",
    samples: "820",
    source: "ingress_jp",
    state: "Fresh",
    target: "egress_jp"
  },
  {
    p50: "67 ms",
    p95: "146 ms",
    p99: "212 ms",
    routeRef: "route_safe_sgp_backup",
    routeType: "Fallback",
    samples: "240",
    source: "ingress_sgp",
    state: "Stale",
    target: "egress_sgp"
  },
  {
    p50: "N/A",
    p95: "N/A",
    p99: "N/A",
    routeRef: "route_safe_tuic_recovery",
    routeType: "Recovery",
    samples: "0",
    source: "ingress_tuic",
    state: "No sample",
    target: "egress_pending"
  }
];

function ChannelCoverageContent() {
  return (
    <div className="admin-operator-content" aria-label="Channel Coverage static operator content">
      <DataTable
        ariaLabel="Channel Coverage static table"
        columns={[
          { header: "Channel", key: "channel", render: (row: ChannelCoverageRow) => <SafeRef value={row.channelRef} /> },
          {
            header: "Health",
            key: "state",
            render: (row) => (
              <StatusChip
                label={row.state}
                tone={row.state === "Healthy" ? "success" : row.state === "Degraded" ? "warning" : "danger"}
              />
            )
          },
          { header: "Issued", key: "issued", render: (row) => row.issued },
          { header: "Measured", key: "measured", render: (row) => row.measured },
          { header: "Utilization", key: "utilization", render: (row) => row.utilization },
          { header: "Error rate", key: "errorRate", render: (row) => row.errorRate },
          {
            header: "Receipt",
            key: "receipt",
            render: (row) => (
              <StatusChip
                label={row.receipt}
                tone={row.receipt === "Healthy" ? "success" : row.receipt === "Pending receipt" ? "warning" : "danger"}
              />
            )
          },
          { header: "Last measured", key: "lastMeasured", render: (row) => row.lastMeasured }
        ]}
        getRowKey={(row) => row.channelRef}
        rows={channelCoverageRows}
      />
      <DataTable
        ariaLabel="Route Latency static table"
        columns={[
          { header: "Route", key: "route", render: (row: RouteLatencyRow) => <><SafeRef value={row.routeRef} /> · {row.routeType}</> },
          { header: "Path", key: "path", render: (row) => `${row.source} -> ${row.target}` },
          { header: "p50", key: "p50", render: (row) => row.p50 },
          { header: "p95", key: "p95", render: (row) => row.p95 },
          { header: "p99", key: "p99", render: (row) => row.p99 },
          { header: "Samples", key: "samples", render: (row) => row.samples },
          {
            header: "State",
            key: "state",
            render: (row) => (
              <StatusChip
                label={row.state}
                tone={row.state === "Fresh" ? "success" : row.state === "Stale" ? "warning" : "neutral"}
              />
            )
          }
        ]}
        getRowKey={(row) => row.routeRef}
        rows={routeLatencyRows}
      />
    </div>
  );
}

type UsageLedgerRow = {
  accountRef: string;
  channelRef: string;
  collectionStatus: SubscriptionUsageCollectionStatus;
  downloadBytes: number;
  edgeCredentialBindings: Array<{
    channelRef: string;
    credentialRefPresent: boolean;
    materialDigestPresent: boolean;
  }>;
  lastObservedLabel: string;
  orderRef: string;
  trafficLimitBytes: number;
  uploadBytes: number;
  usageStatus: "not_collected" | "measured_zero" | "measured";
  usedBytes: number;
  warnings?: string[];
};

const GB = 1024 ** 3;

const usageLedgerRows: UsageLedgerRow[] = [
  {
    accountRef: "acct_safe_over",
    channelRef: "channel_safe_jp_vless",
    collectionStatus: "measured",
    downloadBytes: 38 * GB,
    edgeCredentialBindings: [confirmedBinding("channel_safe_jp_vless")],
    lastObservedLabel: "2m ago",
    orderRef: "ord_safe_over",
    trafficLimitBytes: 50 * GB,
    uploadBytes: 16 * GB,
    usageStatus: "measured",
    usedBytes: 54 * GB
  },
  {
    accountRef: "acct_safe_near",
    channelRef: "channel_safe_sgp_hy2",
    collectionStatus: "measured",
    downloadBytes: 31 * GB,
    edgeCredentialBindings: [confirmedBinding("channel_safe_sgp_hy2")],
    lastObservedLabel: "4m ago",
    orderRef: "ord_safe_near",
    trafficLimitBytes: 50 * GB,
    uploadBytes: 11.5 * GB,
    usageStatus: "measured",
    usedBytes: 42.5 * GB
  },
  {
    accountRef: "acct_safe_zero",
    channelRef: "channel_safe_jp_vless",
    collectionStatus: "measured_zero",
    downloadBytes: 0,
    edgeCredentialBindings: [confirmedBinding("channel_safe_jp_vless")],
    lastObservedLabel: "Fresh sample",
    orderRef: "ord_safe_zero",
    trafficLimitBytes: 50 * GB,
    uploadBytes: 0,
    usageStatus: "measured_zero",
    usedBytes: 0
  },
  {
    accountRef: "acct_safe_stale",
    channelRef: "channel_safe_sgp_hy2",
    collectionStatus: "stale",
    downloadBytes: 12 * GB,
    edgeCredentialBindings: [confirmedBinding("channel_safe_sgp_hy2")],
    lastObservedLabel: "18m ago",
    orderRef: "ord_safe_stale",
    trafficLimitBytes: 50 * GB,
    uploadBytes: 5 * GB,
    usageStatus: "measured",
    usedBytes: 17 * GB
  },
  {
    accountRef: "acct_safe_disabled",
    channelRef: "channel_safe_sgp_tuic",
    collectionStatus: "collector_disabled",
    downloadBytes: 0,
    edgeCredentialBindings: [confirmedBinding("channel_safe_sgp_tuic")],
    lastObservedLabel: "No trusted sample",
    orderRef: "ord_safe_disabled",
    trafficLimitBytes: 50 * GB,
    uploadBytes: 0,
    usageStatus: "not_collected",
    usedBytes: 0
  },
  {
    accountRef: "acct_safe_pending",
    channelRef: "channel_safe_pending",
    collectionStatus: "not_collected",
    downloadBytes: 0,
    edgeCredentialBindings: [{
      channelRef: "channel_safe_pending",
      credentialRefPresent: true,
      materialDigestPresent: false
    }],
    lastObservedLabel: "Receipt pending",
    orderRef: "ord_safe_pending",
    trafficLimitBytes: 50 * GB,
    uploadBytes: 0,
    usageStatus: "not_collected",
    usedBytes: 0
  }
];

function UsageLedgerContent() {
  return (
    <div className="admin-operator-content" aria-label="Usage Ledger static operator content">
      <DataTable
        ariaLabel="Usage Ledger static table"
        columns={[
          { header: "Account / order", key: "account", render: (row: UsageLedgerRow) => <><SafeRef value={row.accountRef} /> · <SafeRef value={row.orderRef} /></> },
          { header: "Channel", key: "channel", render: (row) => <SafeRef value={row.channelRef} /> },
          {
            header: "Usage evidence",
            key: "usageEvidence",
            render: (row) => (
              <span className="admin-usage-ledger-evidence">
                <span>{usageTrafficLabel(row)}</span>
                <small>{usageRatioLabel(row)} · {row.lastObservedLabel}</small>
              </span>
            )
          },
          {
            header: "Collection / risk",
            key: "collectionRisk",
            render: (row) => {
              const collection = collectionStatusDisplay(row.collectionStatus);
              const anomaly = usageAnomalyReason(row);
              return (
                <span className="admin-usage-ledger-state">
                  <StatusChip
                    label={collection.label}
                    tone={collection.tone}
                  />
                  {anomaly?.label !== collection.label ? (
                    <StatusChip
                      label={anomaly?.label ?? "No anomaly"}
                      tone={anomalyStatusTone(anomaly?.tone)}
                    />
                  ) : null}
                </span>
              );
            }
          }
        ]}
        getRowKey={(row) => `${row.accountRef}:${row.orderRef}:${row.channelRef}`}
        rows={usageLedgerRows}
      />
    </div>
  );
}

const anomalyItems: RiskQueueItem[] = usageLedgerRows
  .map((row) => usageAnomalyItem(row))
  .filter((item): item is RiskQueueItem => item !== null);

function confirmedBinding(channelRef: string) {
  return {
    channelRef,
    credentialRefPresent: true,
    materialDigestPresent: true
  };
}

function usageTrafficLabel(row: UsageLedgerRow): string {
  const collection = collectionStatusDisplay(row.collectionStatus);
  if (!collection.measured && row.collectionStatus !== "stale") {
    return "Not recorded";
  }
  return `${formatBytes(row.usedBytes)} / ${formatBytes(row.trafficLimitBytes)}`;
}

function usageRatioLabel(row: UsageLedgerRow): string {
  const collection = collectionStatusDisplay(row.collectionStatus);
  if (!collection.measured && row.collectionStatus !== "stale") {
    return "No trusted sample";
  }
  return `${usageRatio(row.usedBytes, row.trafficLimitBytes)}% used`;
}

function anomalyStatusTone(tone?: UsageAnomalyTone): MetricTone {
  if (tone === "critical") return "danger";
  if (tone === "warning") return "warning";
  if (tone === "muted") return "info";
  return "success";
}

function usageAnomalyItem(row: UsageLedgerRow): RiskQueueItem | null {
  const reason = usageAnomalyReason(row);
  if (!reason) return null;

  return {
    ref: `anomaly-${row.orderRef}`,
    title: reason.label,
    severity: anomalySeverity(reason.tone),
    severityLabel: anomalySeverityLabel(reason.tone),
    objectType: anomalyObjectType(reason),
    objectRef: anomalyObjectRef(row, reason),
    reasonLabel: anomalyReasonLabel(row, reason)
  };
}

function anomalySeverity(tone: UsageAnomalyTone): RiskSeverity {
  if (tone === "critical") return "critical";
  if (tone === "warning") return "warning";
  return "info";
}

function anomalySeverityLabel(tone: UsageAnomalyTone): string {
  if (tone === "critical") return "High";
  if (tone === "warning") return "Medium";
  return "Low";
}

function anomalyObjectType(reason: UsageAnomalyReason): string {
  if (reason.label === "Collector disabled") return "collector";
  if (reason.label === "Receipt / collection pending") return "channel";
  return "order";
}

function anomalyObjectRef(row: UsageLedgerRow, reason: UsageAnomalyReason): string {
  if (reason.label === "Collector disabled" || reason.label === "Receipt / collection pending") {
    return row.channelRef;
  }
  return row.orderRef;
}

function anomalyReasonLabel(row: UsageLedgerRow, reason: UsageAnomalyReason): string {
  if (reason.label === "Over limit" || reason.label === "Near quota") {
    return usageRatioLabel(row);
  }
  if (reason.label === "Receipt / collection pending") {
    return "Receipt not confirmed";
  }
  return collectionStatusDisplay(row.collectionStatus).label;
}

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
      title="Anomaly candidates"
    />
  );
}

function ReceiptsCollectorsContent() {
  return (
    <div className="admin-operator-content" aria-label="Receipts and Collectors static operator content">
      <div className="admin-static-card-grid">
        <article className="admin-static-card">
          <span>Receipt state</span>
          <strong>2 pending</strong>
          <p>Receipt gaps stay visible without exposing protected runtime material.</p>
          <StatusChip label="Pending receipt" tone="warning" />
        </article>
        <article className="admin-static-card">
          <span>Collector state</span>
          <strong>1 disabled</strong>
          <p>Collector availability is evidence, not an account or order lifecycle decision.</p>
          <StatusChip label="Collector disabled" tone="danger" />
        </article>
        <article className="admin-static-card admin-static-card-muted">
          <span>Diagnostics</span>
          <strong>Locked</strong>
          <p>Future diagnostics require no-secret contracts and redaction tests before activation.</p>
          <StatusChip label="Readonly" tone="neutral" />
        </article>
      </div>
      <DataTable
        ariaLabel="Agent Status static table"
        columns={[
          { header: "Agent / node", key: "agent", render: (row: AgentStatusRow) => <><SafeRef value={row.agentRef} /> · <SafeRef value={row.nodeRef} /></> },
          { header: "Version", key: "version", render: (row) => row.version },
          { header: "Heartbeat", key: "heartbeat", render: (row) => row.heartbeat },
          {
            header: "Desired state",
            key: "desired",
            render: (row) => (
              <StatusChip
                label={row.desiredStatePull}
                tone={row.desiredStatePull === "Current" ? "success" : row.desiredStatePull === "Delayed" ? "warning" : "neutral"}
              />
            )
          },
          {
            header: "Receipt push",
            key: "receiptPush",
            render: (row) => (
              <StatusChip
                label={row.receiptPush}
                tone={row.receiptPush === "Ready" ? "success" : row.receiptPush === "Pending" ? "warning" : "neutral"}
              />
            )
          },
          {
            header: "Collector",
            key: "collector",
            render: (row) => (
              <StatusChip
                label={row.collectorState}
                tone={row.collectorState === "Ready" ? "success" : row.collectorState === "Delayed" ? "warning" : "danger"}
              />
            )
          }
        ]}
        getRowKey={(row) => row.agentRef}
        rows={agentStatusRows}
      />
      <DataTable
        ariaLabel="Inspection Runs static table"
        columns={[
          { header: "Check", key: "check", render: (row: InspectionRunRow) => row.checkName },
          {
            header: "Result",
            key: "result",
            render: (row) => (
              <StatusChip
                label={row.latestResult}
                tone={row.latestResult === "Pass" ? "success" : row.latestResult === "Warning" ? "warning" : "danger"}
              />
            )
          },
          { header: "Duration", key: "duration", render: (row) => row.duration },
          { header: "Next run", key: "nextRun", render: (row) => row.nextRun },
          { header: "Owner object", key: "owner", render: (row) => <SafeRef value={row.ownerObject} /> }
        ]}
        getRowKey={(row) => `${row.checkName}:${row.ownerObject}`}
        rows={inspectionRunRows}
      />
    </div>
  );
}
