import type {
  SubscriptionUsageCollectionStatus,
  SubscriptionUsageMonitor,
  SubscriptionUsageMonitorRow
} from "./types";

export type UsageViewTone = "success" | "warning" | "danger" | "info" | "neutral";
export type UsageAnomalyTone = "critical" | "warning" | "muted";
export type UsageRuntimeSeverity = "critical" | "warning" | "info" | "neutral";
export type UsageRuntimeEntityType = "account" | "order" | "channel";
export type UsageOperationalState = "healthy" | "warning" | "blocked";

export type UsageAnomalyReason = {
  label: string;
  priority: number;
  tone: UsageAnomalyTone;
};

export type UsageDomainEvent = {
  ref: string;
  category: "usage" | "collection" | "anomaly" | "receipt";
  entityRef: string;
  entityType: UsageRuntimeEntityType;
  label: string;
  occurredAt: string | null;
  relatedRefs: string[];
  severity: UsageRuntimeSeverity;
};

export type UsageOperationalEntity = {
  events: UsageDomainEvent[];
  ref: string;
  state: UsageOperationalState;
  type: UsageRuntimeEntityType;
};

export type UsageLedgerViewRow = {
  accountRef: string;
  channelRef: string;
  collectionLabel: string;
  collectionTone: UsageViewTone;
  downloadTraffic: string;
  eventRefs: string[];
  lastObservedLabel: string;
  orderRef: string;
  traffic: string;
  uploadTraffic: string;
};

export type UsageAnomalyCandidate = {
  eventRef: string;
  objectRef: string;
  objectType: "order" | "channel" | "collector";
  priority: number;
  reasonLabel: string;
  ref: string;
  relatedRefs: string[];
  severity: UsageRuntimeSeverity;
  severityLabel: string;
  title: string;
};

export type UsageRuntimeViewModel = {
  anomalyItems: UsageAnomalyCandidate[];
  entities: UsageOperationalEntity[];
  events: UsageDomainEvent[];
  generatedAt: string;
  ledgerRows: UsageLedgerViewRow[];
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
    label: "Measured zero",
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

export function buildUsageRuntimeViewModel(
  monitor: Pick<SubscriptionUsageMonitor, "generatedAt" | "items">
): UsageRuntimeViewModel {
  const events = monitor.items.flatMap((row) => usageDomainEvents(row));
  return {
    anomalyItems: buildUsageAnomalyCandidates(monitor.items),
    entities: buildUsageOperationalEntities(monitor.items, events),
    events,
    generatedAt: monitor.generatedAt,
    ledgerRows: buildUsageLedgerRows(monitor.items, events)
  };
}

export function buildUsageLedgerRows(
  rows: SubscriptionUsageMonitorRow[],
  events: UsageDomainEvent[] = rows.flatMap((row) => usageDomainEvents(row))
): UsageLedgerViewRow[] {
  return rows.flatMap((row) => {
    const collection = collectionStatusDisplay(row.collectionStatus);
    const rowEvents = events.filter((event) => (
      event.entityRef === row.issuanceRequestId || event.relatedRefs.includes(row.issuanceRequestId)
    ));
    return usageChannelRefs(row).map((channelRef) => {
      const channelUsage = row.channelUsages.find((usage) => usage.channelRef === channelRef);
      return {
        accountRef: safeAccountRef(row),
        channelRef,
        collectionLabel: collection.label,
        collectionTone: collection.tone,
        downloadTraffic: trafficLabel(row, channelUsage?.downloadBytes ?? row.downloadBytes),
        eventRefs: rowEvents
          .filter((event) => event.entityRef === channelRef || event.relatedRefs.includes(channelRef) || event.relatedRefs.includes(row.issuanceRequestId))
          .map((event) => event.ref),
        lastObservedLabel: safeDateTime(row.lastUsageObservedAt ?? channelUsage?.lastObservedAt ?? row.lastRefreshAt),
        orderRef: row.issuanceRequestId,
        traffic: trafficLabel(row, channelUsage?.usedBytes ?? row.usedBytes),
        uploadTraffic: trafficLabel(row, channelUsage?.uploadBytes ?? row.uploadBytes)
      };
    });
  });
}

export function buildUsageAnomalyCandidates(rows: SubscriptionUsageMonitorRow[]): UsageAnomalyCandidate[] {
  return rows
    .flatMap((row) => usageAnomalyCandidatesForRow(row))
    .sort(compareAnomalyCandidates);
}

export function usageDomainEvents(row: SubscriptionUsageMonitorRow): UsageDomainEvent[] {
  const orderRef = row.issuanceRequestId;
  const collectionStatus = normalizeCollectionStatus(row);
  const collection = collectionStatusDisplay(collectionStatus);
  const observedAt = row.lastUsageObservedAt ?? row.lastRefreshAt;
  const relatedRefs = uniqueRefs([safeAccountRef(row), orderRef, ...usageChannelRefs(row)]);
  const events: UsageDomainEvent[] = [
    {
      category: "collection",
      entityRef: orderRef,
      entityType: "order",
      label: collection.label,
      occurredAt: observedAt,
      ref: `event:usage:${orderRef}:collection:${collectionStatus}`,
      relatedRefs,
      severity: severityForCollectionStatus(collectionStatus)
    }
  ];

  if (collection.measured) {
    events.push({
      category: "usage",
      entityRef: orderRef,
      entityType: "order",
      label: `Usage ${formatBytes(row.usedBytes)}`,
      occurredAt: observedAt,
      ref: `event:usage:${orderRef}:measured`,
      relatedRefs,
      severity: collectionStatus === "measured_zero" ? "info" : "neutral"
    });
  }

  for (const binding of row.edgeCredentialBindings) {
    if (!binding.credentialRefPresent || !binding.materialDigestPresent) {
      events.push({
        category: "receipt",
        entityRef: binding.channelRef,
        entityType: "channel",
        label: "Receipt / collection pending",
        occurredAt: row.artifactLastSeenAt ?? row.lastRefreshAt,
        ref: `event:usage:${orderRef}:receipt:${binding.channelRef}`,
        relatedRefs: uniqueRefs([safeAccountRef(row), orderRef, binding.channelRef]),
        severity: "warning"
      });
    }
  }

  for (const candidate of usageAnomalyCandidatesForRow(row)) {
    events.push({
      category: "anomaly",
      entityRef: candidate.objectRef,
      entityType: candidate.objectType === "collector" ? "channel" : candidate.objectType,
      label: candidate.title,
      occurredAt: row.lastUsageObservedAt ?? row.lastRefreshAt,
      ref: candidate.eventRef,
      relatedRefs: candidate.relatedRefs,
      severity: candidate.severity
    });
  }

  return events;
}

function usageAnomalyCandidatesForRow(row: SubscriptionUsageMonitorRow): UsageAnomalyCandidate[] {
  const candidates: UsageAnomalyCandidate[] = [];
  const status = normalizeCollectionStatus(row);
  const orderRef = row.issuanceRequestId;
  const accountRef = safeAccountRef(row);
  const relatedRefs = uniqueRefs([accountRef, orderRef, ...usageChannelRefs(row)]);

  if (isOverLimit(row)) {
    candidates.push(anomalyCandidate(row, {
      objectRef: orderRef,
      objectType: "order",
      priority: 1,
      reasonLabel: "Over limit",
      relatedRefs,
      severity: "critical",
      title: "Order traffic over limit"
    }));
  } else if (isNearLimit(row)) {
    candidates.push(anomalyCandidate(row, {
      objectRef: orderRef,
      objectType: "order",
      priority: 2,
      reasonLabel: "Near quota",
      relatedRefs,
      severity: "warning",
      title: "Order traffic near quota"
    }));
  }

  if (status === "stale") {
    candidates.push(anomalyCandidate(row, {
      objectRef: orderRef,
      objectType: "order",
      priority: 3,
      reasonLabel: "Last sample beyond threshold",
      relatedRefs,
      severity: "warning",
      title: "Stale usage collection"
    }));
  }

  if (status === "collector_disabled") {
    candidates.push(anomalyCandidate(row, {
      objectRef: row.nodeId,
      objectType: "collector",
      priority: 4,
      reasonLabel: "No trusted samples",
      relatedRefs,
      severity: "critical",
      title: "Collector disabled"
    }));
  }

  const missingBinding = row.edgeCredentialBindings.find((binding) => (
    !binding.credentialRefPresent || !binding.materialDigestPresent
  ));
  if (missingBinding) {
    candidates.push(anomalyCandidate(row, {
      objectRef: missingBinding.channelRef,
      objectType: "channel",
      priority: 5,
      reasonLabel: "Missing receipt",
      relatedRefs: uniqueRefs([accountRef, orderRef, missingBinding.channelRef]),
      severity: "critical",
      title: "Receipt missing"
    }));
  } else if (status === "not_collected") {
    candidates.push(anomalyCandidate(row, {
      objectRef: orderRef,
      objectType: "order",
      priority: 6,
      reasonLabel: "Collection not connected",
      relatedRefs,
      severity: "warning",
      title: "Usage not collected"
    }));
  }

  if (status === "measured_zero") {
    candidates.push(anomalyCandidate(row, {
      objectRef: orderRef,
      objectType: "order",
      priority: 7,
      reasonLabel: "Measured 0 B",
      relatedRefs,
      severity: "info",
      title: "True zero usage"
    }));
  }

  for (const warning of row.warnings) {
    candidates.push(anomalyCandidate(row, {
      objectRef: orderRef,
      objectType: "order",
      priority: 8,
      reasonLabel: warningLabel(warning),
      relatedRefs,
      severity: "warning",
      title: "Operational warning"
    }));
  }

  return candidates.sort(compareAnomalyCandidates);
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

function buildUsageOperationalEntities(
  rows: SubscriptionUsageMonitorRow[],
  events: UsageDomainEvent[]
): UsageOperationalEntity[] {
  const entities = new Map<string, UsageOperationalEntity>();
  for (const row of rows) {
    upsertOperationalEntity(entities, "account", safeAccountRef(row), events);
    upsertOperationalEntity(entities, "order", row.issuanceRequestId, events);
    for (const channelRef of usageChannelRefs(row)) {
      upsertOperationalEntity(entities, "channel", channelRef, events);
    }
  }
  return [...entities.values()].sort((left, right) => (
    left.type.localeCompare(right.type) || left.ref.localeCompare(right.ref)
  ));
}

function upsertOperationalEntity(
  entities: Map<string, UsageOperationalEntity>,
  type: UsageRuntimeEntityType,
  ref: string,
  events: UsageDomainEvent[]
) {
  const key = `${type}:${ref}`;
  if (entities.has(key)) return;
  const linkedEvents = events.filter((event) => event.entityRef === ref || event.relatedRefs.includes(ref));
  entities.set(key, {
    events: linkedEvents,
    ref,
    state: operationalStateForEvents(linkedEvents),
    type
  });
}

function operationalStateForEvents(events: UsageDomainEvent[]): UsageOperationalState {
  let state: UsageOperationalState = "healthy";
  for (const event of events) {
    state = mergeOperationalState(state, operationalStateForSeverity(event.severity));
  }
  return state;
}

function anomalyCandidate(
  row: SubscriptionUsageMonitorRow,
  input: Omit<UsageAnomalyCandidate, "eventRef" | "ref" | "severityLabel">
): UsageAnomalyCandidate {
  const slug = input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    ...input,
    eventRef: `event:usage:${row.issuanceRequestId}:anomaly:${slug}`,
    ref: `anomaly:${row.issuanceRequestId}:${slug}`,
    severityLabel: severityLabel(input.severity)
  };
}

function compareAnomalyCandidates(left: UsageAnomalyCandidate, right: UsageAnomalyCandidate): number {
  const priorityDelta = left.priority - right.priority;
  if (priorityDelta !== 0) return priorityDelta;
  return left.ref.localeCompare(right.ref);
}

function trafficLabel(row: SubscriptionUsageMonitorRow, value: number | null | undefined): string {
  const status = normalizeCollectionStatus(row);
  if (status === "collector_disabled" || status === "not_collected") {
    return "Unknown";
  }
  return formatBytes(value);
}

function safeAccountRef(row: SubscriptionUsageMonitorRow): string {
  return row.portalUserRef || row.accountId;
}

function usageChannelRefs(row: SubscriptionUsageMonitorRow): string[] {
  const channelRefs = uniqueRefs([
    ...row.issuedChannels,
    ...row.channelUsages.map((usage) => usage.channelRef),
    ...row.edgeCredentialBindings.map((binding) => binding.channelRef)
  ]);
  return channelRefs.length > 0 ? channelRefs : uniqueRefs([row.nodeId]);
}

function uniqueRefs(refs: Array<string | null | undefined>): string[] {
  return [...new Set(refs.filter((ref): ref is string => Boolean(ref)))];
}

function safeDateTime(value: string | null | undefined): string {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not recorded";
  return value.slice(0, 16).replace("T", " ").replaceAll("-", "/");
}

function severityForCollectionStatus(status: SubscriptionUsageCollectionStatus): UsageRuntimeSeverity {
  if (status === "collector_disabled") return "critical";
  if (status === "stale" || status === "not_collected") return "warning";
  if (status === "measured_zero") return "info";
  return "neutral";
}

function operationalStateForSeverity(severity: UsageRuntimeSeverity): UsageOperationalState {
  if (severity === "critical") return "blocked";
  if (severity === "warning") return "warning";
  return "healthy";
}

function mergeOperationalState(left: UsageOperationalState, right: UsageOperationalState): UsageOperationalState {
  if (left === "blocked" || right === "blocked") return "blocked";
  if (left === "warning" || right === "warning") return "warning";
  return "healthy";
}

function severityLabel(severity: UsageRuntimeSeverity): string {
  const labels: Record<UsageRuntimeSeverity, string> = {
    critical: "High",
    info: "Low",
    neutral: "Low",
    warning: "Medium"
  };
  return labels[severity];
}
