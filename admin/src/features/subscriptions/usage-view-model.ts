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
