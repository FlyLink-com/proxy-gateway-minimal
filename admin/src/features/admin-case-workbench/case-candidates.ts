import type {
  CaseCandidate,
  CaseObjectType,
  CaseReasonCode,
  CaseSeverity,
  LinkedObject,
  ObjectTimelineEvent,
  PortalRequestCaseInput,
  UsageMonitorCaseInput
} from "./types";
import {
  hasUnconfirmedBinding,
  isNearLimit,
  isOverLimit
} from "../subscriptions/usage-view-model";

const SEVERITY_RANK: Record<CaseSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
  neutral: 3
};

const REASON_TITLES: Record<CaseReasonCode, string> = {
  over_limit: "Order traffic over limit",
  near_limit: "Order traffic near limit",
  usage_zero: "Order usage is zero",
  usage_stale: "Usage collection stale",
  collector_disabled: "Collector disabled",
  not_collected: "Usage not collected",
  receipt_missing: "Receipt / collection pending",
  expiry_candidate: "Resource expiry review",
  archive_candidate: "Resource archive review",
  order_pending_review: "Order pending review",
  order_pending_delivery: "Order pending controlled delivery"
};

type CaseCandidateBuildOptions = {
  nowMs?: number;
};

export function buildPortalRequestCaseCandidates(items: PortalRequestCaseInput[]): CaseCandidate[] {
  return items
    .flatMap((item) => portalRequestReasons(item).map((reasonCode) => portalRequestCase(item, reasonCode)))
    .sort(compareCases);
}

export function buildUsageMonitorCaseCandidates(
  items: UsageMonitorCaseInput[],
  options: CaseCandidateBuildOptions = {}
): CaseCandidate[] {
  const nowMs = options.nowMs ?? Date.now();
  return items
    .flatMap((item) => usageMonitorReasons(item, nowMs).map((reasonCode) => usageMonitorCase(item, reasonCode)))
    .sort(compareCases);
}

export function topCaseCandidates(items: CaseCandidate[], limit: number): CaseCandidate[] {
  return [...items].sort(compareCases).slice(0, Math.max(0, limit));
}

function portalRequestReasons(item: PortalRequestCaseInput): CaseReasonCode[] {
  const reasons: CaseReasonCode[] = [];
  const usage = item.usage;

  if (usage?.status === "over_limit" || isOverLimit({
    trafficLimitBytes: usage?.totalBytes,
    usedBytes: usage?.usedBytes
  })) reasons.push("over_limit");
  if (usage?.collectionStatus === "stale") reasons.push("usage_stale");
  if (usage?.collectionStatus === "collector_disabled") reasons.push("collector_disabled");
  if (usage?.collectionStatus === "not_collected") reasons.push("not_collected");
  if (usage?.collectionStatus === "measured_zero" || usage?.status === "measured_zero") reasons.push("usage_zero");
  if (item.status === "pending_admin_review") reasons.push("order_pending_review");
  if (item.status === "approved_pending_delivery") reasons.push("order_pending_delivery");
  if (item.status === "expired") reasons.push("expiry_candidate");
  if (item.status === "revoked" || item.status === "cancelled" || item.status === "rejected") {
    reasons.push("archive_candidate");
  }

  return uniqueReasons(reasons);
}

function usageMonitorReasons(item: UsageMonitorCaseInput, nowMs: number): CaseReasonCode[] {
  const reasons: CaseReasonCode[] = [];
  const hasReceiptGap = hasUnconfirmedBinding(item);

  if (isOverLimit(item)) reasons.push("over_limit");
  if (isNearLimit(item)) reasons.push("near_limit");
  if (item.collectionStatus === "stale") reasons.push("usage_stale");
  if (item.collectionStatus === "collector_disabled") reasons.push("collector_disabled");
  if (item.collectionStatus === "not_collected" && !hasReceiptGap) reasons.push("not_collected");
  if (item.collectionStatus === "measured_zero" || item.usageStatus === "measured_zero") reasons.push("usage_zero");
  if (hasReceiptGap) reasons.push("receipt_missing");
  if (isExpired(item.validUntil ?? item.tenantExpiresAt, nowMs)) reasons.push("expiry_candidate");

  return uniqueReasons(reasons);
}

function portalRequestCase(item: PortalRequestCaseInput, reasonCode: CaseReasonCode): CaseCandidate {
  return {
    caseRef: `case_candidate:portal:${item.id}:${reasonCode}`,
    title: reasonTitle(reasonCode),
    objectType: "order",
    objectRef: item.id,
    status: "Pending review",
    severity: reasonSeverity(reasonCode),
    reasonCode,
    source: "portal_access_requests",
    gateRequired: gateRequired(reasonCode),
    createdAt: item.submittedAt,
    updatedAt: item.usage?.updatedAt ?? item.updatedAt,
    linkedObjects: portalLinkedObjects(item),
    timeline: portalTimeline(item, reasonCode)
  };
}

function usageMonitorCase(item: UsageMonitorCaseInput, reasonCode: CaseReasonCode): CaseCandidate {
  return {
    caseRef: `case_candidate:usage:${item.issuanceRequestId}:${reasonCode}`,
    title: reasonTitle(reasonCode),
    objectType: "usage",
    objectRef: item.issuanceRequestId,
    status: "Pending review",
    severity: reasonSeverity(reasonCode),
    reasonCode,
    source: "subscription_usage_monitor",
    gateRequired: gateRequired(reasonCode),
    createdAt: item.artifactFirstSeenAt ?? item.lastRefreshAt,
    updatedAt: item.lastUsageObservedAt ?? item.lastRefreshAt,
    linkedObjects: usageLinkedObjects(item),
    timeline: usageTimeline(item, reasonCode)
  };
}

function portalLinkedObjects(item: PortalRequestCaseInput): LinkedObject[] {
  return compactLinkedObjects([
    linkedObject("owns", "account", item.portalUserRef, "User account"),
    linkedObject("about", "order", item.id, "Resource order")
  ]);
}

function usageLinkedObjects(item: UsageMonitorCaseInput): LinkedObject[] {
  return compactLinkedObjects([
    linkedObject("owns", "account", item.portalUserRef || item.accountId, "User account"),
    linkedObject("about", "order", item.issuanceRequestId, "Resource order"),
    ...item.issuedChannels.map((channelRef) => linkedObject("uses", "channel", channelRef, "Usage channel"))
  ]);
}

function portalTimeline(item: PortalRequestCaseInput, reasonCode: CaseReasonCode): ObjectTimelineEvent[] {
  return [
    timelineEvent({
      eventRef: `timeline:portal:${item.id}:order`,
      category: "order_lifecycle",
      action: item.status,
      objectType: "order",
      objectRef: item.id,
      occurredAt: item.updatedAt,
      source: "portal_access_requests",
      summary: reasonTitle(reasonCode),
      severity: reasonSeverity(reasonCode),
      reasonCode,
      relatedRefs: [item.portalUserRef]
    }),
    timelineEvent({
      eventRef: `timeline:portal:${item.id}:usage`,
      category: "usage_collection",
      action: item.usage?.collectionStatus ?? "unknown",
      objectType: "usage",
      objectRef: item.id,
      occurredAt: item.usage?.updatedAt ?? item.updatedAt,
      source: "portal_access_requests",
      summary: usageSummary(item.usage?.usedBytes, item.usage?.totalBytes),
      severity: reasonSeverity(reasonCode),
      reasonCode,
      relatedRefs: [item.id]
    })
  ];
}

function usageTimeline(item: UsageMonitorCaseInput, reasonCode: CaseReasonCode): ObjectTimelineEvent[] {
  return [
    timelineEvent({
      eventRef: `timeline:usage:${item.issuanceRequestId}:collection`,
      category: "usage_collection",
      action: item.collectionStatus,
      objectType: "usage",
      objectRef: item.issuanceRequestId,
      occurredAt: item.lastUsageObservedAt ?? item.lastRefreshAt,
      source: "subscription_usage_monitor",
      summary: usageSummary(item.usedBytes, item.trafficLimitBytes),
      severity: reasonSeverity(reasonCode),
      reasonCode,
      relatedRefs: [item.portalUserRef || item.accountId, ...item.issuedChannels]
    }),
    timelineEvent({
      eventRef: `timeline:usage:${item.issuanceRequestId}:channel`,
      category: "channel_desired_state",
      action: hasUnconfirmedBinding(item) ? "receipt_missing" : "binding_present",
      objectType: "channel",
      objectRef: item.nodeId,
      occurredAt: item.artifactLastSeenAt ?? item.lastRefreshAt,
      source: "subscription_usage_monitor",
      summary: reasonCode === "receipt_missing" ? "Channel receipt or collection evidence pending" : "Channel binding recorded as safe summary",
      severity: reasonSeverity(reasonCode),
      reasonCode,
      relatedRefs: [item.issuanceRequestId]
    })
  ];
}

function compareCases(left: CaseCandidate, right: CaseCandidate): number {
  const severityDelta = SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity];
  if (severityDelta !== 0) return severityDelta;

  const updatedDelta = timestamp(right.updatedAt) - timestamp(left.updatedAt);
  if (updatedDelta !== 0) return updatedDelta;

  return left.caseRef.localeCompare(right.caseRef);
}

function reasonSeverity(reasonCode: CaseReasonCode): CaseSeverity {
  if (reasonCode === "over_limit") return "critical";
  if (
    reasonCode === "near_limit"
    || reasonCode === "usage_stale"
    || reasonCode === "collector_disabled"
    || reasonCode === "not_collected"
    || reasonCode === "order_pending_delivery"
  ) {
    return "warning";
  }
  if (
    reasonCode === "receipt_missing"
    || reasonCode === "usage_zero"
    || reasonCode === "order_pending_review"
    || reasonCode === "expiry_candidate"
  ) {
    return "info";
  }
  return "neutral";
}

function reasonTitle(reasonCode: CaseReasonCode): string {
  return REASON_TITLES[reasonCode];
}

function gateRequired(reasonCode: CaseReasonCode): boolean {
  return reasonCode === "over_limit" || reasonCode === "receipt_missing" || reasonCode === "order_pending_delivery";
}

function uniqueReasons(reasons: CaseReasonCode[]): CaseReasonCode[] {
  return [...new Set(reasons)];
}

function linkedObject(
  relationType: string,
  objectType: CaseObjectType,
  objectRef: string | null | undefined,
  label: string
): LinkedObject | null {
  if (!objectRef) return null;
  return { relationType, objectType, objectRef, label };
}

function compactLinkedObjects(items: Array<LinkedObject | null>): LinkedObject[] {
  return items.filter((item): item is LinkedObject => item !== null);
}

function timelineEvent(event: ObjectTimelineEvent): ObjectTimelineEvent {
  return event;
}

function timestamp(value: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isExpired(value: string | null, nowMs: number): boolean {
  return value !== null && timestamp(value) > 0 && timestamp(value) <= nowMs;
}

function usageSummary(usedBytes: number | undefined, totalBytes: number | undefined): string {
  if (typeof usedBytes !== "number" || typeof totalBytes !== "number" || totalBytes <= 0) {
    return "Usage collection safe summary";
  }
  return `Used ${usedBytes} / ${totalBytes} bytes`;
}
