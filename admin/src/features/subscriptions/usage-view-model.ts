import type {
  SubscriptionUsageCollectionStatus,
  SubscriptionUsageMonitorRow
} from "./types";

export type UsageViewTone = "success" | "warning" | "danger" | "info" | "neutral";
export type UsageAnomalyTone = "critical" | "warning" | "muted";

export type UsageAnomalyReason = {
  label: string;
  priority: number;
  tone: UsageAnomalyTone;
};

type CollectionStatusInput = {
  collectionStatus?: SubscriptionUsageCollectionStatus | string | null;
  usageStatus?: string | null;
};

type BindingInput = {
  channelRef: string;
  credentialRefPresent: boolean;
  materialDigestPresent: boolean;
};

type UsageRowInput = CollectionStatusInput & {
  edgeCredentialBindings?: BindingInput[];
  trafficLimitBytes?: number | null;
  usedBytes?: number | null;
  warnings?: string[];
};

export type UsageRuntimeSource = {
  generatedAt: string;
  items: SubscriptionUsageMonitorRow[];
  nowMs?: number;
};

export type UsageRuntimeFreshness = {
  collectorDisabledRows: number;
  disconnectedRows: number;
  latestObservedAtLabel: string;
  staleRows: number;
  state: "Fresh" | "Needs review" | "Unknown";
  tone: UsageViewTone;
  unknownRows: number;
};

export type UsageRuntimeLedgerRow = {
  accountRef: string;
  channelRef: string;
  collectedAt: string;
  collection: "Measured" | "Measured zero" | "Not collected" | "Collector disabled" | "Stale";
  collectionTone: UsageViewTone;
  orderRef: string;
  traffic: string;
};

export type UsageRuntimeAnomalyItem = {
  objectRef: string;
  objectType: string;
  reasonLabel: string;
  ref: string;
  severity: "critical" | "warning" | "info" | "neutral";
  severityLabel: string;
  title: string;
};

export type UsageRuntimeViewModel = {
  anomalyItems: UsageRuntimeAnomalyItem[];
  freshness: UsageRuntimeFreshness;
  generatedAt: string;
  generatedAtLabel: string;
  ledgerRows: UsageRuntimeLedgerRow[];
  safety: {
    mutationAllowed: false;
    rawEdgeCredentialReturned: false;
    rawSecretReturned: false;
    rawSubscriptionUrlReturned: false;
    summaryOnly: true;
  };
};

const COLLECTION_STATUSES = new Set<SubscriptionUsageCollectionStatus>([
  "collector_disabled",
  "not_collected",
  "measured_zero",
  "measured",
  "stale"
]);

const COLLECTION_DISPLAY: Record<SubscriptionUsageCollectionStatus, {
  gap: boolean;
  label: string;
  measured: boolean;
  tone: UsageViewTone;
}> = {
  collector_disabled: {
    gap: true,
    label: "Collector disabled",
    measured: false,
    tone: "warning"
  },
  not_collected: {
    gap: true,
    label: "Not collected",
    measured: false,
    tone: "neutral"
  },
  measured: {
    gap: false,
    label: "Collected",
    measured: true,
    tone: "success"
  },
  measured_zero: {
    gap: false,
    label: "Collected 0B",
    measured: true,
    tone: "neutral"
  },
  stale: {
    gap: false,
    label: "Collection expired",
    measured: false,
    tone: "warning"
  }
};

export function safeNumber(value: number | null | undefined): number {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : 0;
}

export function safeValue(value: string | number | null | undefined): string | number {
  if (value === null || value === undefined || value === "") {
    return "Not recorded";
  }
  return value;
}

export function formatBytes(value: number | null | undefined): string {
  const normalized = safeNumber(value);
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

export function usageRatio(
  usedBytes: number | null | undefined,
  totalBytes: number | null | undefined,
  fallbackRatio?: number
): number {
  const safeTotal = safeNumber(totalBytes);
  if (safeTotal > 0) {
    return Math.max(0, Math.min(999, Math.round((safeNumber(usedBytes) / safeTotal) * 100)));
  }
  if (typeof fallbackRatio === "number" && Number.isFinite(fallbackRatio)) {
    return Math.max(0, Math.min(999, Math.round(fallbackRatio * 100)));
  }
  return 0;
}

export function normalizeCollectionStatus(input: CollectionStatusInput): SubscriptionUsageCollectionStatus {
  const collectionStatus = input.collectionStatus;
  if (typeof collectionStatus === "string" && COLLECTION_STATUSES.has(collectionStatus as SubscriptionUsageCollectionStatus)) {
    return collectionStatus as SubscriptionUsageCollectionStatus;
  }
  if (input.usageStatus === "measured_zero") return "measured_zero";
  if (input.usageStatus === "measured") return "measured";
  return "not_collected";
}

export function collectionStatusDisplay(status: SubscriptionUsageCollectionStatus | string | null | undefined) {
  return COLLECTION_DISPLAY[normalizeCollectionStatus({ collectionStatus: status })];
}

export function hasUnconfirmedBinding(row: Pick<SubscriptionUsageMonitorRow, "edgeCredentialBindings">, channelRef?: string): boolean {
  return row.edgeCredentialBindings.some((binding) => (
    (!channelRef || binding.channelRef === channelRef)
      && (!binding.credentialRefPresent || !binding.materialDigestPresent)
  ));
}

export function isOverLimit(row: Pick<SubscriptionUsageMonitorRow, "trafficLimitBytes" | "usedBytes"> | UsageRowInput): boolean {
  return safeNumber(row.trafficLimitBytes) > 0 && safeNumber(row.usedBytes) >= safeNumber(row.trafficLimitBytes);
}

export function isNearLimit(row: Pick<SubscriptionUsageMonitorRow, "trafficLimitBytes" | "usedBytes"> | UsageRowInput): boolean {
  const limit = safeNumber(row.trafficLimitBytes);
  const used = safeNumber(row.usedBytes);
  return limit > 0 && used >= limit * 0.8 && used < limit;
}

export function isCollectionGap(row: UsageRowInput): boolean {
  const status = normalizeCollectionStatus(row);
  return status === "collector_disabled" || status === "not_collected" || hasUnconfirmedUsageBinding(row);
}

export function usageAnomalyReason(row: UsageRowInput): UsageAnomalyReason | null {
  const status = normalizeCollectionStatus(row);
  if (isOverLimit(row)) return anomaly("Over limit", "critical");
  if (isNearLimit(row)) return anomaly("Near quota", "warning");
  if (status === "measured_zero") return anomaly("True 0 B", "muted");
  if (status === "stale") return anomaly("Collection stale", "warning");
  if (status === "collector_disabled") return anomaly("Collector disabled", "warning");
  if (hasUnconfirmedUsageBinding(row)) return anomaly("Receipt / collection pending", "warning");
  if (status === "not_collected") return anomaly("Collection not connected", "muted");
  if ((row.warnings ?? []).length > 0) return anomaly(warningLabel((row.warnings ?? [])[0]), "warning");
  return null;
}

export function warningLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    blocked: "Access blocked",
    high_refresh: "High refresh rate",
    high_refresh_count: "High refresh rate",
    missing_artifact_ref: "Delivery record missing",
    node_unavailable: "Resource channel unavailable",
    usage_near_limit: "Near quota",
    usage_over_limit: "Over limit"
  };
  return labels[normalized] ?? "Operational warning";
}

export function buildUsageRuntimeViewModel(source: UsageRuntimeSource): UsageRuntimeViewModel {
  const nowMs = source.nowMs ?? Date.now();
  const rows = [...source.items];

  return {
    anomalyItems: anomalyItemsFromRows(rows),
    freshness: buildFreshness(rows, nowMs),
    generatedAt: source.generatedAt,
    generatedAtLabel: relativeAgeLabel(source.generatedAt, nowMs),
    ledgerRows: rows.map((row) => ledgerRow(row, nowMs)),
    safety: {
      mutationAllowed: false,
      rawEdgeCredentialReturned: false,
      rawSecretReturned: false,
      rawSubscriptionUrlReturned: false,
      summaryOnly: true
    }
  };
}

function anomaly(label: string, tone: UsageAnomalyTone): UsageAnomalyReason {
  return {
    label,
    priority: anomalyPriority(label),
    tone
  };
}

function anomalyPriority(label: string): number {
  const priorities: Record<string, number> = {
    "Over limit": 1,
    "Near quota": 2,
    "Collection stale": 3,
    "Collector disabled": 4,
    "Receipt / collection pending": 5,
    "Collection not connected": 6,
    "True 0 B": 7
  };
  return priorities[label] ?? 8;
}

function hasUnconfirmedUsageBinding(row: UsageRowInput): boolean {
  return (row.edgeCredentialBindings ?? []).some((binding) => (
    !binding.credentialRefPresent || !binding.materialDigestPresent
  ));
}

function buildFreshness(rows: SubscriptionUsageMonitorRow[], nowMs: number): UsageRuntimeFreshness {
  const normalizedRows = rows.map((row) => normalizeCollectionStatus(row));
  const staleRows = normalizedRows.filter((status) => status === "stale").length;
  const unknownRows = normalizedRows.filter((status) => status === "not_collected").length;
  const collectorDisabledRows = normalizedRows.filter((status) => status === "collector_disabled").length;
  const disconnectedRows = rows.filter((row) => hasUnconfirmedBinding(row)).length;
  const latestObservedAt = latestTimestamp(rows.map((row) => row.lastUsageObservedAt));
  const needsReview = staleRows > 0 || unknownRows > 0 || collectorDisabledRows > 0 || disconnectedRows > 0;

  return {
    collectorDisabledRows,
    disconnectedRows,
    latestObservedAtLabel: relativeAgeLabel(latestObservedAt, nowMs),
    staleRows,
    state: rows.length === 0 ? "Unknown" : needsReview ? "Needs review" : "Fresh",
    tone: rows.length === 0 ? "neutral" : needsReview ? "warning" : "success",
    unknownRows
  };
}

function ledgerRow(row: SubscriptionUsageMonitorRow, nowMs: number): UsageRuntimeLedgerRow {
  const collection = ledgerCollection(row);
  return {
    accountRef: safeRef(row.accountId || row.portalUserRef),
    channelRef: safeRef(firstChannelRef(row)),
    collectedAt: relativeAgeLabel(row.lastUsageObservedAt, nowMs),
    collection: collection.label,
    collectionTone: collection.tone,
    orderRef: safeRef(row.issuanceRequestId),
    traffic: `${formatBytes(row.uploadBytes)} up / ${formatBytes(row.downloadBytes)} down / ${formatBytes(row.usedBytes)} total`
  };
}

function anomalyItemsFromRows(rows: SubscriptionUsageMonitorRow[]): UsageRuntimeAnomalyItem[] {
  return rows
    .map((row) => {
      const reason = usageAnomalyReason(row);
      return reason ? anomalyItem(row, reason) : null;
    })
    .filter((item): item is UsageRuntimeAnomalyItem => item !== null)
    .sort((left, right) => {
      const leftRank = anomalyPriority(left.reasonLabel);
      const rightRank = anomalyPriority(right.reasonLabel);
      if (leftRank !== rightRank) return leftRank - rightRank;
      return left.objectRef.localeCompare(right.objectRef);
    });
}

function anomalyItem(row: SubscriptionUsageMonitorRow, reason: UsageAnomalyReason): UsageRuntimeAnomalyItem {
  const severity = anomalySeverity(reason.tone);
  return {
    objectRef: safeRef(row.issuanceRequestId),
    objectType: "order",
    reasonLabel: reason.label,
    ref: `usage-anomaly:${safeRef(row.issuanceRequestId)}:${reason.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    severity,
    severityLabel: severityLabel(severity),
    title: "Usage evidence needs review"
  };
}

function ledgerCollection(row: CollectionStatusInput): {
  label: UsageRuntimeLedgerRow["collection"];
  tone: UsageViewTone;
} {
  const status = normalizeCollectionStatus(row);
  if (status === "collector_disabled") return { label: "Collector disabled", tone: "danger" };
  if (status === "measured") return { label: "Measured", tone: "success" };
  if (status === "measured_zero") return { label: "Measured zero", tone: "info" };
  if (status === "stale") return { label: "Stale", tone: "warning" };
  return { label: "Not collected", tone: "warning" };
}

function anomalySeverity(tone: UsageAnomalyTone): UsageRuntimeAnomalyItem["severity"] {
  if (tone === "critical") return "critical";
  if (tone === "warning") return "warning";
  return "info";
}

function severityLabel(severity: UsageRuntimeAnomalyItem["severity"]): string {
  if (severity === "critical") return "High";
  if (severity === "warning") return "Medium";
  if (severity === "info") return "Low";
  return "Info";
}

function firstChannelRef(row: SubscriptionUsageMonitorRow): string {
  return row.issuedChannels[0]
    ?? row.channelUsages[0]?.channelRef
    ?? row.edgeCredentialBindings[0]?.channelRef
    ?? row.nodeId
    ?? "channel_not_recorded";
}

function latestTimestamp(values: Array<string | null | undefined>): string | null {
  const timestamps = values
    .map((value) => timestamp(value))
    .filter((value) => value > 0);
  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

function relativeAgeLabel(value: string | null | undefined, nowMs: number): string {
  const valueMs = timestamp(value);
  if (valueMs <= 0) return "No trusted sample";
  const diffMs = Math.max(0, nowMs - valueMs);
  if (diffMs < 60_000) return "just now";
  const minutes = Math.max(1, Math.round(diffMs / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function safeRef(value: string | null | undefined): string {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : "Not recorded";
}

function timestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
