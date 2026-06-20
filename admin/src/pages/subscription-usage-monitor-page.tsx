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
        dataAdapter: "Static channel fields now; later issued/measured channel and receipt blocker summaries.",
        layoutPolicy: "Coverage panels and safe ledger; no node provisioning or runtime apply controls.",
        performanceBoundary: "Channel aggregates load separately from order usage rows.",
        interactionModel: "Inspect missing coverage and prepare evidence handoff."
      },
      content: <ChannelCoverageContent />,
      purpose: "Compare issued channels, measured channels, missing channels, and receipt blockers.",
      contentFields: [
        "Issued channels · count",
        "Measured channels · count",
        "Missing channels · count",
        "Receipt blockers · count",
        "Channels · safe refs"
      ],
      states: [
        "Fully measured",
        "Partially measured",
        "Missing receipt",
        "No issued channel"
      ],
      uiSurface: "channel-coverage",
      ownership: "Owns channel coverage evidence and receipt blocker classification.",
      boundaries: [
        "No channel runtime apply",
        "No node provisioning",
        "No credentials or material digests"
      ],
      nextStep: "Rebuild channel coverage ledger from redacted usage monitor rows."
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
        dataAdapter: "Static receipt and collector slots now; later no-secret diagnostics adapter.",
        layoutPolicy: "Read-only diagnostics entry, not a collector activation console.",
        performanceBoundary: "Diagnostics mount only when expanded or opened in the future tools page.",
        interactionModel: "Show evidence availability; no raw logs, config, or runtime apply."
      },
      content: <ReceiptsCollectorsContent />,
      purpose: "Show whether receipt and collector evidence is available for safe operator decisions.",
      contentFields: [
        "Receipts · freshness",
        "Collectors · availability",
        "Pending receipts · count",
        "Disabled collectors · count",
        "Diagnostics · future entry"
      ],
      states: [
        "Receipts healthy",
        "Pending receipt",
        "Collector disabled",
        "Diagnostics locked"
      ],
      uiSurface: "receipts-collectors",
      ownership: "Owns receipt and collector evidence availability.",
      boundaries: [
        "No raw logs",
        "No raw config",
        "No credential or edge material output"
      ],
      nextStep: "Connect safe diagnostics only after no-secret data contracts and tests exist."
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
  issued: string;
  measured: string;
  receipt: "Healthy" | "Pending receipt" | "Missing receipt";
};

const channelCoverageRows: ChannelCoverageRow[] = [
  { channelRef: "channel_safe_jp_vless", issued: "12 orders", measured: "12 measured", receipt: "Healthy" },
  { channelRef: "channel_safe_sgp_hy2", issued: "6 orders", measured: "4 measured", receipt: "Pending receipt" },
  { channelRef: "channel_safe_sgp_tuic", issued: "3 orders", measured: "0 measured", receipt: "Missing receipt" }
];

function ChannelCoverageContent() {
  return (
    <div className="admin-operator-content" aria-label="Channel Coverage static operator content">
      <DataTable
        ariaLabel="Channel Coverage static table"
        columns={[
          { header: "Channel", key: "channel", render: (row: ChannelCoverageRow) => <SafeRef value={row.channelRef} /> },
          { header: "Issued", key: "issued", render: (row) => row.issued },
          { header: "Measured", key: "measured", render: (row) => row.measured },
          {
            header: "Receipt",
            key: "receipt",
            render: (row) => (
              <StatusChip
                label={row.receipt}
                tone={row.receipt === "Healthy" ? "success" : row.receipt === "Pending receipt" ? "warning" : "danger"}
              />
            )
          }
        ]}
        getRowKey={(row) => row.channelRef}
        rows={channelCoverageRows}
      />
    </div>
  );
}

type UsageLedgerRow = {
  accountRef: string;
  channelRef: string;
  collection: "Measured" | "Measured zero" | "Not collected" | "Collector disabled";
  orderRef: string;
  traffic: string;
};

const usageLedgerRows: UsageLedgerRow[] = [
  { accountRef: "acct_safe_001", orderRef: "ord_safe_101", channelRef: "channel_safe_jp_vless", traffic: "42.8 GB", collection: "Measured" },
  { accountRef: "acct_safe_014", orderRef: "ord_safe_102", channelRef: "channel_safe_sgp_hy2", traffic: "0 B", collection: "Measured zero" },
  { accountRef: "acct_safe_022", orderRef: "ord_safe_103", channelRef: "channel_safe_sgp_tuic", traffic: "Unknown", collection: "Collector disabled" },
  { accountRef: "acct_safe_030", orderRef: "ord_safe_104", channelRef: "channel_safe_pending", traffic: "Unknown", collection: "Not collected" }
];

function UsageLedgerContent() {
  return (
    <div className="admin-operator-content" aria-label="Usage Ledger static operator content">
      <DataTable
        ariaLabel="Usage Ledger static table"
        columns={[
          { header: "Account / order", key: "account", render: (row: UsageLedgerRow) => <><SafeRef value={row.accountRef} /> · <SafeRef value={row.orderRef} /></> },
          { header: "Channel", key: "channel", render: (row) => <SafeRef value={row.channelRef} /> },
          { header: "Traffic", key: "traffic", render: (row) => row.traffic },
          {
            header: "Collection",
            key: "collection",
            render: (row) => (
              <StatusChip
                label={row.collection}
                tone={row.collection === "Measured" ? "success" : row.collection === "Measured zero" ? "info" : row.collection === "Not collected" ? "warning" : "danger"}
              />
            )
          }
        ]}
        getRowKey={(row) => `${row.accountRef}:${row.orderRef}:${row.channelRef}`}
        rows={usageLedgerRows}
      />
    </div>
  );
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
    <div className="admin-static-card-grid" aria-label="Receipts and Collectors static operator content">
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
  );
}
