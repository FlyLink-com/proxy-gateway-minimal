import {
  AdminConsolePageFrame,
  type BlueprintPage
} from "./admin-console-page-frame";
import {
  DataCardPagination,
  DataTable,
  MetricCard,
  RiskQueue,
  SafeRef,
  StatusChip
} from "../components/primitives";
import {
  Activity,
  Gauge,
  RadioTower,
  ReceiptText
} from "lucide-react";
import { usageRuntimeProjectionFixture } from "../features/subscriptions/usage-runtime-fixture";
import {
  buildUsageRuntimeViewModel,
  type UsageRuntimeLedgerRow
} from "../features/subscriptions/usage-view-model";

const usageRuntimeViewModel = buildUsageRuntimeViewModel(usageRuntimeProjectionFixture);

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
        dataAdapter: "Runtime projection fixture now; later safe usage monitor generatedAt and collector summaries.",
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
        dataAdapter: "Runtime projection fixture now; later redacted usage monitor rows and pagination.",
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
        dataAdapter: "Runtime projection fixture now; later safe computed anomaly candidates.",
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
  const freshness = usageRuntimeViewModel.freshness;
  return (
    <div className="admin-operator-content" aria-label="Collection Freshness runtime projection content">
      <div className="ops-metric-grid ops-metric-grid-compact">
        <MetricCard
          detail={`Generated ${usageRuntimeViewModel.generatedAtLabel}`}
          icon={<Activity aria-hidden="true" />}
          label="Collection state"
          tone={freshness.tone}
          value={freshness.state}
        />
        <MetricCard
          detail="Stale threshold 5m"
          icon={<Gauge aria-hidden="true" />}
          label="Observed age"
          tone="info"
          value={freshness.latestObservedAtLabel}
        />
        <MetricCard
          detail="Kept distinct from true zero"
          icon={<RadioTower aria-hidden="true" />}
          label="Unknown rows"
          tone="warning"
          value={freshness.unknownRows}
        />
        <MetricCard
          detail="Layout remains stable"
          icon={<ReceiptText aria-hidden="true" />}
          label="Disconnected"
          tone={freshness.collectorDisabledRows > 0 || freshness.disconnectedRows > 0 ? "danger" : "neutral"}
          value={freshness.collectorDisabledRows + freshness.disconnectedRows}
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
        pagination={{
          ariaLabel: "Channel Coverage pagination",
          itemLabel: "rows",
          pageSize: 3
        }}
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
        pagination={{
          ariaLabel: "Route Latency pagination",
          itemLabel: "routes",
          pageSize: 3
        }}
        rows={routeLatencyRows}
      />
    </div>
  );
}

const usageLedgerRows = usageRuntimeViewModel.ledgerRows;
const anomalyItems = usageRuntimeViewModel.anomalyItems;

function UsageLedgerContent() {
  return (
    <div className="admin-operator-content" aria-label="Usage Ledger runtime projection content">
      <DataTable
        ariaLabel="Usage Ledger runtime projection table"
        columns={[
          { header: "Account / order", key: "account", render: (row: UsageRuntimeLedgerRow) => <><SafeRef value={row.accountRef} /> · <SafeRef value={row.orderRef} /></> },
          { header: "Channel", key: "channel", render: (row) => <SafeRef value={row.channelRef} /> },
          { header: "Traffic · upload / download / total", key: "traffic", render: (row) => row.traffic },
          { header: "Collected", key: "collectedAt", render: (row) => row.collectedAt },
          {
            header: "Collection",
            key: "collection",
            render: (row) => (
              <StatusChip
                label={row.collection}
                tone={row.collectionTone}
              />
            )
          }
        ]}
        getRowKey={(row) => `${row.accountRef}:${row.orderRef}:${row.channelRef}`}
        pagination={{
          ariaLabel: "Usage Ledger pagination",
          itemLabel: "rows",
          pageSize: 6
        }}
        rows={usageLedgerRows}
      />
    </div>
  );
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
      footer={
        <>
          <span className="panel-link panel-link-disabled">Durable case close workflow locked</span>
          <DataCardPagination
            ariaLabel="Collection Anomalies pagination"
            itemLabel="items"
            pageSize={6}
            totalItems={anomalyItems.length}
          />
        </>
      }
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
        pagination={{
          ariaLabel: "Agent Status pagination",
          itemLabel: "agents",
          pageSize: 3
        }}
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
        pagination={{
          ariaLabel: "Inspection Runs pagination",
          itemLabel: "checks",
          pageSize: 3
        }}
        rows={inspectionRunRows}
      />
    </div>
  );
}
