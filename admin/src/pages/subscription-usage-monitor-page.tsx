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
  type RiskQueueItem
} from "../components/primitives";
import {
  Activity,
  Gauge,
  RadioTower,
  ReceiptText
} from "lucide-react";
import { USAGE_RUNTIME_FIXTURE } from "../features/subscriptions/usage-runtime-fixture";
import {
  buildUsageRuntimeViewModel,
  type AgentStatusViewRow,
  type ChannelCoverageViewRow,
  type InspectionRunViewRow,
  type ReceiptCollectorSummaryCard,
  type RouteLatencyViewRow,
  type UsageAnomalyCandidate,
  type UsageLedgerViewRow
} from "../features/subscriptions/usage-view-model";

const usageRuntimeViewModel = buildUsageRuntimeViewModel(USAGE_RUNTIME_FIXTURE);

export const usageChannelsBlueprint: BlueprintPage = {
  page: "usageMonitor",
  ariaLabel: "Usage & Channels page header",
  kicker: "Platform Monitoring / Usage & Channels",
  title: "Usage & Channels",
  description: "Evidence owner for usage collection trust, channel coverage, receipts, collectors, and collection anomalies.",
  statusLabel: "Evidence owner",
  statusTone: "info",
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
    <div className="admin-operator-content" aria-label="Collection Freshness runtime operator content">
      <div className="ops-metric-grid ops-metric-grid-compact">
        <MetricCard
          detail={freshness.collectionStateDetail}
          icon={<Activity aria-hidden="true" />}
          label="Collection state"
          tone={freshness.collectionStateTone}
          value={freshness.collectionStateLabel}
        />
        <MetricCard
          detail={freshness.observedAgeDetail}
          icon={<Gauge aria-hidden="true" />}
          label="Observed age"
          tone="info"
          value={freshness.observedAgeLabel}
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
          tone="neutral"
          value={freshness.disconnectedRows}
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

function ChannelCoverageContent() {
  return (
    <div className="admin-operator-content" aria-label="Channel Coverage runtime operator content">
      <DataTable
        ariaLabel="Channel Coverage runtime table"
        columns={[
          { header: "Channel", key: "channel", render: (row: ChannelCoverageViewRow) => <SafeRef value={row.channelRef} /> },
          {
            header: "Health",
            key: "state",
            render: (row) => (
              <StatusChip
                label={row.state}
                tone={row.stateTone}
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
                tone={row.receiptTone}
              />
            )
          },
          { header: "Last measured", key: "lastMeasured", render: (row) => row.lastMeasured }
        ]}
        getRowKey={(row) => row.channelRef}
        rows={usageRuntimeViewModel.channelCoverageRows}
      />
      <DataTable
        ariaLabel="Route Latency runtime table"
        columns={[
          { header: "Route", key: "route", render: (row: RouteLatencyViewRow) => <><SafeRef value={row.routeRef} /> · {row.routeType}</> },
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
                tone={row.stateTone}
              />
            )
          }
        ]}
        getRowKey={(row) => row.routeRef}
        rows={usageRuntimeViewModel.routeLatencyRows}
      />
    </div>
  );
}

function UsageLedgerContent() {
  return (
    <div className="admin-operator-content" aria-label="Usage Ledger runtime operator content">
      <DataTable
        ariaLabel="Usage Ledger runtime table"
        columns={[
          { header: "Account / order", key: "account", render: (row: UsageLedgerViewRow) => <><SafeRef value={row.accountRef} /> · <SafeRef value={row.orderRef} /></> },
          { header: "Channel", key: "channel", render: (row) => <SafeRef value={row.channelRef} /> },
          { header: "Traffic", key: "traffic", render: (row) => row.traffic },
          {
            header: "Collection",
            key: "collection",
            render: (row) => (
              <StatusChip
                label={row.collectionLabel}
                tone={row.collectionTone}
              />
            )
          }
        ]}
        getRowKey={(row) => `${row.accountRef}:${row.orderRef}:${row.channelRef}`}
        rows={usageRuntimeViewModel.ledgerRows}
      />
    </div>
  );
}

function CollectionAnomaliesContent() {
  return (
    <RiskQueue
      countLabel="Collection anomaly candidates"
      description="Classifies evidence only; quota and lifecycle decisions remain on Accounts & Resources."
      footer={<span className="panel-link panel-link-disabled">Durable case close workflow locked</span>}
      items={usageRuntimeViewModel.anomalyItems.map(toRiskQueueItem)}
      title="Anomaly candidates"
    />
  );
}

function toRiskQueueItem(item: UsageAnomalyCandidate): RiskQueueItem {
  return {
    objectRef: item.objectRef,
    objectType: item.objectType,
    reasonLabel: item.reasonLabel,
    ref: item.ref,
    severity: item.severity,
    severityLabel: item.severityLabel,
    title: item.title
  };
}

function ReceiptsCollectorsContent() {
  return (
    <div className="admin-operator-content" aria-label="Receipts and Collectors runtime operator content">
      <div className="admin-static-card-grid">
        {usageRuntimeViewModel.receiptCollectorCards.map((card) => (
          <ReceiptCollectorCard card={card} key={card.label} />
        ))}
      </div>
      <DataTable
        ariaLabel="Agent Status runtime table"
        columns={[
          { header: "Agent / node", key: "agent", render: (row: AgentStatusViewRow) => <><SafeRef value={row.agentRef} /> · <SafeRef value={row.nodeRef} /></> },
          { header: "Version", key: "version", render: (row) => row.version },
          { header: "Heartbeat", key: "heartbeat", render: (row) => row.heartbeat },
          {
            header: "Desired state",
            key: "desired",
            render: (row) => (
              <StatusChip
                label={row.desiredStatePull}
                tone={row.desiredStateTone}
              />
            )
          },
          {
            header: "Receipt push",
            key: "receiptPush",
            render: (row) => (
              <StatusChip
                label={row.receiptPush}
                tone={row.receiptPushTone}
              />
            )
          },
          {
            header: "Collector",
            key: "collector",
            render: (row) => (
              <StatusChip
                label={row.collectorState}
                tone={row.collectorTone}
              />
            )
          }
        ]}
        getRowKey={(row) => row.agentRef}
        rows={usageRuntimeViewModel.agentStatusRows}
      />
      <DataTable
        ariaLabel="Inspection Runs runtime table"
        columns={[
          { header: "Check", key: "check", render: (row: InspectionRunViewRow) => row.checkName },
          {
            header: "Result",
            key: "result",
            render: (row) => (
              <StatusChip
                label={row.latestResult}
                tone={row.resultTone}
              />
            )
          },
          { header: "Duration", key: "duration", render: (row) => row.duration },
          { header: "Next run", key: "nextRun", render: (row) => row.nextRun },
          { header: "Owner object", key: "owner", render: (row) => <SafeRef value={row.ownerObject} /> }
        ]}
        getRowKey={(row) => `${row.checkName}:${row.ownerObject}`}
        rows={usageRuntimeViewModel.inspectionRunRows}
      />
    </div>
  );
}

function ReceiptCollectorCard({ card }: { card: ReceiptCollectorSummaryCard }) {
  return (
    <article className={card.statusTone === "neutral" ? "admin-static-card admin-static-card-muted" : "admin-static-card"}>
      <span>{card.label}</span>
      <strong>{card.value}</strong>
      <p>{card.detail}</p>
      <StatusChip label={card.statusLabel} tone={card.statusTone} />
    </article>
  );
}
