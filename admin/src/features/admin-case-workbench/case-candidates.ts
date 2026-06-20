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

const SEVERITY_RANK: Record<CaseSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
  neutral: 3
};

const REASON_TITLES: Record<CaseReasonCode, string> = {
  over_limit: "订单流量已超额",
  near_limit: "订单流量接近上限",
  usage_zero: "订单用量为零",
  usage_stale: "用量采集延迟",
  collector_disabled: "采集器未启用",
  not_collected: "用量尚未采集",
  receipt_missing: "回执/采集待确认",
  expiry_candidate: "资源到期待复核",
  archive_candidate: "资源待归档",
  order_pending_review: "订单等待复核",
  order_pending_delivery: "订单等待受控发放"
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

  if (usage?.status === "over_limit" || isOverLimit(usage?.usedBytes, usage?.totalBytes)) reasons.push("over_limit");
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

  if (item.trafficLimitBytes > 0 && item.usedBytes >= item.trafficLimitBytes) reasons.push("over_limit");
  if (item.trafficLimitBytes > 0 && item.usedBytes >= item.trafficLimitBytes * 0.8 && item.usedBytes < item.trafficLimitBytes) {
    reasons.push("near_limit");
  }
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
    status: "待复核",
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
    status: "待复核",
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
    linkedObject("owns", "account", item.portalUserRef, "用户账号"),
    linkedObject("about", "order", item.id, "资源订单")
  ]);
}

function usageLinkedObjects(item: UsageMonitorCaseInput): LinkedObject[] {
  return compactLinkedObjects([
    linkedObject("owns", "account", item.portalUserRef || item.accountId, "用户账号"),
    linkedObject("about", "order", item.issuanceRequestId, "资源订单"),
    ...item.issuedChannels.map((channelRef) => linkedObject("uses", "channel", channelRef, "流量通道"))
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
      summary: reasonCode === "receipt_missing" ? "通道回执或采集证据待确认" : "通道绑定为安全摘要",
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

function hasUnconfirmedBinding(item: UsageMonitorCaseInput): boolean {
  return item.edgeCredentialBindings.some((binding) => (
    !binding.credentialRefPresent || !binding.materialDigestPresent
  ));
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

function isOverLimit(usedBytes: number | undefined, totalBytes: number | undefined): boolean {
  return typeof usedBytes === "number" && typeof totalBytes === "number" && usedBytes > totalBytes;
}

function usageSummary(usedBytes: number | undefined, totalBytes: number | undefined): string {
  if (typeof usedBytes !== "number" || typeof totalBytes !== "number" || totalBytes <= 0) {
    return "用量采集安全摘要";
  }
  return `已用 ${usedBytes} / ${totalBytes} 字节`;
}
