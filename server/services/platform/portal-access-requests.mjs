import { createHash } from "node:crypto";
import { executeSubscriptionIssuance } from "./subscription-issuance.mjs";
import {
  TRIAL_DURATION_DAYS,
  TRIAL_TRAFFIC_LIMIT_BYTES
} from "./subscription-package-policy.mjs";
import {
  summarizeUsageSamples,
  usageCycleFiltersForBinding
} from "./usage-billing-cycle.mjs";

const PLANS = {
  trial: { durationDays: TRIAL_DURATION_DAYS, label: "7-day trial" },
  monthly: { durationDays: 30, label: "monthly" },
  yearly: { durationDays: 365, label: "yearly" }
};
const CLIENT_TARGETS = new Set(["clash", "karing"]);
const SAFE_SUMMARY_EVENT_TYPES = new Set([
  "delivery_generation_reissued",
  "old_link_invalidated",
  "subscription_disabled",
  "traffic_supply_suspended"
]);
const SAFE_REASON_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_:-]{0,79}$/;
const UNSAFE_REASON_CODE_PATTERN = /https?:|token|secret|credential|password|private|customer|@|\//i;

function platformError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function text(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw platformError("validation_error", `${field} is required`);
  }
  return normalized;
}

function optionalText(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function isoNow(nowFn) {
  const value = nowFn();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw platformError("validation_error", "now must be a valid date");
  }
  return date.toISOString();
}

function isoText(value, field) {
  const normalized = text(value, field);
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw platformError("validation_error", `${field} is invalid`);
  }
  return date.toISOString();
}

function expiresAtFromDuration(baseIso, durationDays) {
  const base = new Date(baseIso);
  if (Number.isNaN(base.getTime())) {
    throw platformError("validation_error", "base date is invalid");
  }
  return new Date(base.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();
}

function limitNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

function requireNonNegativeInteger(value, field) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw platformError("validation_error", `${field} must be an integer >= 0`);
  }
  return parsed;
}

function safeReasonCode(value, field) {
  const normalized = text(value, field);
  if (!SAFE_REASON_CODE_PATTERN.test(normalized) || UNSAFE_REASON_CODE_PATTERN.test(normalized)) {
    throw platformError("validation_error", `${field} must be a safe reason code`);
  }
  return normalized;
}

function auditIdForTrafficLimit({ requestRef, reviewedByRef, reasonCode, previousTrafficLimitBytes, trafficLimitBytes, now }) {
  const digest = createHash("sha256")
    .update([
      requestRef,
      reviewedByRef,
      reasonCode,
      String(previousTrafficLimitBytes),
      String(trafficLimitBytes),
      now
    ].join("|"))
    .digest("hex")
    .slice(0, 16);
  return `audit_${digest}`;
}

function normalizeChannelRefs(value) {
  const rawRefs = Array.isArray(value)
    ? value
    : String(value || "").split(",");
  const refs = [];
  const seen = new Set();
  for (const rawRef of rawRefs) {
    const ref = String(rawRef || "").trim();
    if (ref && !seen.has(ref)) {
      seen.add(ref);
      refs.push(ref);
    }
  }
  return refs;
}

function periodFor(iso) {
  return String(iso || "").slice(0, 7);
}

function normalizePlan(plan) {
  const normalized = text(plan, "plan");
  if (!Object.hasOwn(PLANS, normalized)) {
    throw platformError("validation_error", "plan is invalid");
  }
  return normalized;
}

function normalizeClientTarget(clientTarget) {
  const normalized = String(clientTarget || "clash").trim();
  if (!CLIENT_TARGETS.has(normalized)) {
    throw platformError("validation_error", "clientTarget is invalid");
  }
  return normalized;
}

function normalizeQuantity(quantity) {
  const normalized = Number(quantity ?? 1);
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > 12) {
    throw platformError("validation_error", "quantity is invalid");
  }
  return normalized;
}

function nextRequestId(now, sequence) {
  return `pareq_${new Date(now).getTime().toString(36)}_${sequence.toString(36)}`;
}

function nonNegativeInteger(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0;
}

function usageRatio(usedBytes, totalBytes) {
  if (!totalBytes) return 0;
  return Number((usedBytes / totalBytes).toFixed(3));
}

function edgeCredentialRefsFor(record) {
  const refs = [];
  const seen = new Set();
  const pushRef = (value) => {
    const ref = String(value || "").trim();
    if (ref && !seen.has(ref)) {
      seen.add(ref);
      refs.push(ref);
    }
  };
  if (Array.isArray(record.edgeCredentials)) {
    for (const credential of record.edgeCredentials) {
      pushRef(credential?.edgeCredentialRef);
    }
  }
  pushRef(record.edgeCredentialRef);
  return refs;
}

function issuedChannelRefsFor(record, rollups = []) {
  const refs = [];
  const seen = new Set();
  const pushRef = (value) => {
    const ref = String(value || "").trim();
    if (ref && !seen.has(ref)) {
      seen.add(ref);
      refs.push(ref);
    }
  };
  const credentialCount = Array.isArray(record.edgeCredentials) ? record.edgeCredentials.length : 0;
  const hasRollupChannelRefs = rollups.some((rollup) => String(rollup?.channelRef || "").trim());
  if (credentialCount > 1 || (credentialCount === 1 && !hasRollupChannelRefs)) {
    for (const credential of record.edgeCredentials) {
      pushRef(credential?.edgeChannelRef);
    }
  } else if (credentialCount === 0 && !hasRollupChannelRefs) {
    pushRef(record.edgeChannelRef);
  }
  for (const rollup of rollups) {
    pushRef(rollup?.channelRef);
  }
  return refs;
}

function measuredChannelCountFor(rollups) {
  const channelRefs = new Set();
  for (const rollup of rollups) {
    const channelRef = String(rollup?.channelRef || "").trim();
    if (channelRef) {
      channelRefs.add(channelRef);
    }
  }
  return channelRefs.size > 0 ? channelRefs.size : rollups.length;
}

function usageSummaryFor(record, controlStore, now = null) {
  if (!controlStore || !record?.id) {
    return null;
  }
  const rollups = [];
  const seen = new Set();
  const pushRollup = (rollup) => {
    if (!rollup?.edgeCredentialRef || seen.has(rollup.edgeCredentialRef)) {
      return;
    }
    seen.add(rollup.edgeCredentialRef);
    rollups.push(rollup);
  };

  if (typeof controlStore.listUsageRollupsByRequestId === "function") {
    for (const rollup of controlStore.listUsageRollupsByRequestId(record.id) || []) {
      pushRollup(rollup);
    }
  }
  if (rollups.length === 0 && typeof controlStore.getUsageRollupByEdgeCredentialRef === "function") {
    for (const edgeCredentialRef of edgeCredentialRefsFor(record)) {
      pushRollup(controlStore.getUsageRollupByEdgeCredentialRef(edgeCredentialRef));
    }
  }
  if (rollups.length === 0) {
    return null;
  }

  let trafficLimitBytes = 0;
  let cycleBinding = null;
  if (typeof controlStore.findIssuedSubscriptionBindingByEdgeCredentialRef === "function") {
    const refs = rollups.map((rollup) => rollup.edgeCredentialRef);
    for (const edgeCredentialRef of refs) {
      const binding = controlStore.findIssuedSubscriptionBindingByEdgeCredentialRef(edgeCredentialRef);
      trafficLimitBytes = Math.max(trafficLimitBytes, nonNegativeInteger(binding?.trafficLimitBytes));
      cycleBinding ||= binding || null;
    }
  }

  const currentUsage = currentCycleUsageRowsFor({ record, controlStore, binding: cycleBinding, at: now, rollups });
  const uploadBytes = currentUsage.summary.uploadBytes;
  const downloadBytes = currentUsage.summary.downloadBytes;
  const usedBytes = currentUsage.summary.totalBytes;
  const measuredChannelCount = measuredChannelCountFor(currentUsage.rows);
  const channelCount = Math.max(issuedChannelRefsFor(record, currentUsage.rows).length, measuredChannelCount);
  const updatedAt = currentUsage.summary.updatedAt;

  return {
    uploadBytes,
    downloadBytes,
    usedBytes,
    totalBytes: trafficLimitBytes,
    usageRatio: usageRatio(usedBytes, trafficLimitBytes),
    status: trafficLimitBytes > 0 && usedBytes >= trafficLimitBytes ? "over_limit" : "within_limit",
    collectionStatus: usedBytes > 0 || uploadBytes > 0 || downloadBytes > 0 ? "measured" : "measured_zero",
    channelCount,
    measuredChannelCount,
    ...(updatedAt ? { updatedAt } : {})
  };
}

function trafficLimitBytesFor(record, controlStore, usage = null) {
  if (usage) {
    return nonNegativeInteger(usage.totalBytes);
  }
  if (!record?.entitlementRef || !controlStore || typeof controlStore.getEntitlement !== "function") {
    return null;
  }
  const entitlement = controlStore.getEntitlement(record.entitlementRef);
  if (!entitlement) {
    return null;
  }
  return nonNegativeInteger(entitlement.trafficLimitBytes);
}

function safeEventFor(event) {
  if (!event || typeof event !== "object") {
    return null;
  }
  const type = String(event.type || "").trim();
  const occurredAt = String(event.occurredAt || "").trim();
  const safeEvent = {};
  if (SAFE_SUMMARY_EVENT_TYPES.has(type)) {
    safeEvent.type = type;
  }
  if (occurredAt) {
    const date = new Date(occurredAt);
    if (!Number.isNaN(date.getTime())) {
      safeEvent.occurredAt = date.toISOString();
    }
  }
  return Object.keys(safeEvent).length > 0 ? safeEvent : null;
}

function deliveryStateFor(record) {
  const status = String(record?.status || "").trim();
  if (["delivered", "issued"].includes(status)) {
    return "current";
  }
  if (status === "approved_pending_delivery") {
    return "pending_delivery";
  }
  if (status === "disabled") {
    return "disabled";
  }
  if (status === "expired") {
    return "expired";
  }
  return "not_issued";
}

function safeDeliveryFor(record, event) {
  const artifactPresent = Boolean(String(record?.artifactId || "").trim());
  const runtimeMaterialPresent = Boolean(
    String(record?.edgeCredentialRef || "").trim()
    && String(record?.edgeMaterialDigest || "").trim()
  );
  return {
    model: "account_resource_delivery_generation",
    state: deliveryStateFor(record),
    artifactPresent,
    runtimeMaterialPresent,
    ...(event?.type ? { lastEventType: event.type } : {}),
    ...((event?.type === "old_link_invalidated" || event?.type === "delivery_generation_reissued") && event.occurredAt
      ? { lastReissuedAt: event.occurredAt }
      : {})
  };
}

function safeSummaryFor(record, usage = null, trafficLimitBytes = null) {
  const event = safeEventFor(record.event);
  const summary = {
    id: record.id,
    type: "portal_access_request_summary",
    portalUserRef: record.portalUserRef,
    plan: record.plan,
    planLabel: PLANS[record.plan].label,
    clientTarget: record.clientTarget,
    durationDays: record.durationDays,
    quantity: record.quantity,
    status: record.status,
    nextAction: record.status === "pending_admin_review" ? "admin_review_required" : record.nextAction,
    submittedAt: record.submittedAt,
    updatedAt: record.updatedAt,
    reviewedAt: record.reviewedAt,
    reviewedByRef: record.reviewedByRef,
    safeReasonCode: record.safeReasonCode,
    priorTrialState: record.priorTrialState,
    expiresAt: record.expiresAt,
    validUntil: record.validUntil,
    ...(trafficLimitBytes === null ? {} : { trafficLimitBytes }),
    entitlementRef: record.entitlementRef,
    accessGrantRef: record.accessGrantRef,
    event,
    delivery: safeDeliveryFor(record, event),
    safety: {
      noSubscriptionUrl: true,
      noRawCustomerData: true,
      noRawHandoffMaterial: true,
      noEntitlementCreated: !record.entitlementRef,
      noRuntimeMutation: record.edgeLifecycleMutation !== true,
      noProductionMutation: record.edgeLifecycleMutation !== true
    }
  };
  if (usage) {
    summary.usage = usage;
  }
  return summary;
}

function visibleOnceSummaryFor(record, usage = null, trafficLimitBytes = null) {
  const summary = safeSummaryFor(record, usage, trafficLimitBytes);
  if (record.status === "disabled" || !record.subscriptionUrl) {
    return summary;
  }
  return {
    ...summary,
    subscriptionUrl: record.subscriptionUrl,
    safety: {
      ...summary.safety,
      noSubscriptionUrl: false
    }
  };
}

function edgeOrderSummaryFor(record) {
  return {
    id: record.id,
    portalUserRef: record.portalUserRef,
    plan: record.plan,
    clientTarget: record.clientTarget,
    durationDays: record.durationDays,
    quantity: record.quantity,
    status: record.status,
    submittedAt: record.submittedAt,
    updatedAt: record.updatedAt,
    expiresAt: record.expiresAt,
    validUntil: record.validUntil,
    entitlementRef: record.entitlementRef,
    accessGrantRef: record.accessGrantRef,
    edgeChannelRef: record.edgeChannelRef,
    edgeCredentialRef: record.edgeCredentialRef,
    edgeMaterialDigest: record.edgeMaterialDigest
  };
}

function edgeNotificationOrderFor(record) {
  return {
    ...edgeOrderSummaryFor(record),
    edgeCredentials: Array.isArray(record.edgeCredentials)
      ? record.edgeCredentials.map((credential) => ({
        edgeChannelRef: credential.edgeChannelRef,
        edgeCredentialRef: credential.edgeCredentialRef,
        edgeMaterialDigest: credential.edgeMaterialDigest
      }))
      : []
  };
}

function edgeCredentialOrderSummariesFor(record) {
  const credentials = Array.isArray(record.edgeCredentials) && record.edgeCredentials.length > 0
    ? record.edgeCredentials
    : (
      record.edgeCredentialRef && record.edgeMaterialDigest
        ? [{
          edgeChannelRef: record.edgeChannelRef,
          edgeCredentialRef: record.edgeCredentialRef,
          edgeMaterialDigest: record.edgeMaterialDigest
        }]
        : []
    );
  return credentials.map((credential) => ({
    ...edgeOrderSummaryFor(record),
    edgeChannelRef: credential.edgeChannelRef,
    edgeCredentialRef: credential.edgeCredentialRef,
    edgeMaterialDigest: credential.edgeMaterialDigest
  }));
}

function cloneRecord(record) {
  if (!record) return null;
  return {
    ...record,
    edgeCredentials: Array.isArray(record.edgeCredentials)
      ? record.edgeCredentials.map((credential) => ({ ...credential }))
      : undefined,
    event: record.event ? { ...record.event } : null
  };
}

function currentCycleUsageRowsFor({ record, controlStore, binding, at, rollups }) {
  if (!binding || typeof controlStore?.listUsageSamples !== "function") {
    return {
      rows: rollups,
      summary: {
        uploadBytes: rollups.reduce((sum, rollup) => sum + nonNegativeInteger(rollup.uploadBytes), 0),
        downloadBytes: rollups.reduce((sum, rollup) => sum + nonNegativeInteger(rollup.downloadBytes), 0),
        totalBytes: rollups.reduce((sum, rollup) => sum + nonNegativeInteger(rollup.totalBytes), 0),
        updatedAt: rollups
          .map((rollup) => rollup.updatedAt || rollup.lastObservedAt)
          .filter(Boolean)
          .sort()
          .at(-1) || null
      }
    };
  }
  const samples = controlStore.listUsageSamples({
    requestId: record.id,
    ...usageCycleFiltersForBinding(binding, at || new Date().toISOString())
  });
  const summary = summarizeUsageSamples(samples);
  return {
    rows: samples.map((sample) => ({
      edgeCredentialRef: sample.edgeCredentialRef,
      channelRef: sample.channelRef,
      uploadBytes: sample.uploadBytes,
      downloadBytes: sample.downloadBytes,
      totalBytes: sample.totalBytes,
      lastObservedAt: sample.observedAt,
      updatedAt: sample.createdAt
    })),
    summary
  };
}

function objectMetadata(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function createMemoryPortalAccessRequestStore() {
  const records = [];
  return {
    upsertPortalAccessRequest(record) {
      const cloned = cloneRecord(record);
      const index = records.findIndex((item) => item.id === cloned.id);
      if (index >= 0) {
        records[index] = cloned;
      } else {
        records.push(cloned);
      }
      return cloneRecord(cloned);
    },
    getPortalAccessRequest(id) {
      return cloneRecord(records.find((record) => record.id === id));
    },
    listPortalAccessRequests(filters = {}) {
      const status = String(filters.status || "").trim();
      const portalUserRef = String(filters.portalUserRef || "").trim();
      const plan = String(filters.plan || "").trim();
      return records
        .filter((record) => !status || record.status === status)
        .filter((record) => !portalUserRef || record.portalUserRef === portalUserRef)
        .filter((record) => !plan || record.plan === plan)
        .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt) || a.id.localeCompare(b.id))
        .map(cloneRecord);
    }
  };
}

function portalAccessRequestStoreFrom(options, controlStore) {
  const explicitStore = options.portalAccessRequestStore || options.requestStore;
  if (explicitStore) {
    return explicitStore;
  }
  if (
    controlStore
    && typeof controlStore.upsertPortalAccessRequest === "function"
    && typeof controlStore.getPortalAccessRequest === "function"
    && typeof controlStore.listPortalAccessRequests === "function"
  ) {
    return controlStore;
  }
  return createMemoryPortalAccessRequestStore();
}

export function createPortalAccessRequestService(options = {}) {
  const nowFn = options.nowFn || (() => new Date());
  const requestIdFactory = options.requestIdFactory;
  const runtimeCore = options.runtimeCore;
  const controlStore = options.controlStore;
  const requestStore = portalAccessRequestStoreFrom(options, controlStore);
  const edgeLifecycleService = options.edgeLifecycleService;
  const edgeCredentialIssuer = options.edgeCredentialIssuer;
  const edgeDesiredStateNotifier = options.edgeDesiredStateNotifier;
  const refreshCooldownMs = limitNumber(options.refreshCooldownMs) || 0;
  const autoIssuance = {
    enabled: options.autoIssuance?.enabled === true,
    nodeId: String(options.autoIssuance?.nodeId || "").trim(),
    channelRefs: normalizeChannelRefs(options.autoIssuance?.channelRefs),
    reviewedByRef: String(options.autoIssuance?.reviewedByRef || "portal_auto_issuer").trim(),
    monthlyLimits: {
      trial: limitNumber(options.autoIssuance?.monthlyLimits?.trial),
      monthly: limitNumber(options.autoIssuance?.monthlyLimits?.monthly)
    }
  };
  const deferEdgeLifecycle = options.deferEdgeLifecycle === true;
  const edgeLifecycleScheduler = typeof options.edgeLifecycleScheduler === "function"
    ? options.edgeLifecycleScheduler
    : (task) => setImmediate(task);
  let sequence = 0;

  function getRecord(id) {
    const request = requestStore.getPortalAccessRequest(text(id, "requestRef"));
    if (!request) {
      throw platformError("not_found", "portal access request not found");
    }
    return request;
  }

  function saveRecord(record) {
    return requestStore.upsertPortalAccessRequest(record);
  }

  function listRecords(filters = {}) {
    return requestStore.listPortalAccessRequests(filters);
  }

  function summarize(record) {
    const usage = usageSummaryFor(record, controlStore, isoNow(nowFn));
    return safeSummaryFor(record, usage, trafficLimitBytesFor(record, controlStore, usage));
  }

  function summarizeVisibleOnce(record) {
    const usage = usageSummaryFor(record, controlStore, isoNow(nowFn));
    return visibleOnceSummaryFor(record, usage, trafficLimitBytesFor(record, controlStore, usage));
  }

  function requireRuntimeMethod(method) {
    if (!runtimeCore || typeof runtimeCore[method] !== "function") {
      throw platformError("validation_error", "portal order lifecycle service is not configured");
    }
    return runtimeCore[method].bind(runtimeCore);
  }

  function reconcileEdgeLifecycle(reason, request) {
    if (!edgeLifecycleService) {
      return null;
    }
    if (typeof edgeLifecycleService.reconcileOrderLifecycle !== "function") {
      throw platformError("validation_error", "edge lifecycle service is not configured");
    }
    return edgeLifecycleService.reconcileOrderLifecycle({
      reason,
      order: edgeOrderSummaryFor(request),
      orders: edgeCredentialOrderSummariesFor(request)
    });
  }

  function runEdgeLifecycle(reason, request) {
    const result = reconcileEdgeLifecycle(reason, request);
    if (result?.ok === false) {
      throw platformError("edge_lifecycle_failed", "edge lifecycle reconciliation failed");
    }
    return result;
  }

  function notifyEdgeLifecycle(reason, request) {
    if (!deferEdgeLifecycle) {
      return runEdgeLifecycle(reason, request);
    }
    if (!edgeLifecycleService) {
      return null;
    }
    edgeLifecycleScheduler(() => {
      try {
        const latest = getRecord(request.id);
        const result = runEdgeLifecycle(reason, latest);
        recordEdgeLifecycleResult(latest, result);
        saveRecord(latest);
      } catch {
        // Lifecycle failures stay out of the user request path. Operator
        // validation and receipt checks remain the source of truth.
      }
    });
    return {
      ok: true,
      deferred: true,
      mutation: false,
      redacted: true,
      nextAction: "edge_lifecycle_deferred"
    };
  }

  function notifyEdgeDesiredState(reason, request) {
    if (!edgeDesiredStateNotifier) {
      return null;
    }
    if (typeof edgeDesiredStateNotifier.notifyOrderLifecycle !== "function") {
      throw platformError("validation_error", "edge desired-state notifier is not configured");
    }
    const result = edgeDesiredStateNotifier.notifyOrderLifecycle({
      reason,
      order: edgeNotificationOrderFor(request)
    });
    if (result?.ok === false) {
      throw platformError("edge_desired_state_notification_failed", "edge desired-state notification failed");
    }
    return result;
  }

  function recordEdgeLifecycleResult(request, result) {
    if (result?.mutation === true) {
      request.edgeLifecycleMutation = true;
    }
  }

  function edgeRuntimeEnforcementState(lifecycleResult, desiredStateResult) {
    const reports = Array.isArray(lifecycleResult?.reports) ? lifecycleResult.reports : [];
    const explicitStatuses = reports
      .map((report) => String(report?.runtimeStatus || "").trim())
      .filter(Boolean);
    const directStatus = String(lifecycleResult?.runtimeReceipt?.status || "").trim();
    if (lifecycleResult?.ok === false || explicitStatuses.includes("failed") || directStatus === "failed") {
      return "failed";
    }
    if (
      lifecycleResult?.mutation === true
      && (
        directStatus === "applied"
        || (
          reports.length > 0
          && explicitStatuses.length === reports.length
          && explicitStatuses.every((status) => status === "applied")
        )
      )
    ) {
      return "applied";
    }
    if (desiredStateResult?.notificationCount > 0) {
      return "pending";
    }
    if (lifecycleResult || desiredStateResult) {
      return "pending";
    }
    return "unavailable";
  }

  function refreshLifecycleDisposition(lifecycleResult) {
    const reports = Array.isArray(lifecycleResult?.reports) ? lifecycleResult.reports : [];
    const directStatus = String(lifecycleResult?.runtimeReceipt?.status || "").trim();
    const runtimeMayHaveMutated = lifecycleResult?.mutation === true
      || reports.some((report) => report?.mutation === true);
    const classifiedReports = reports.map((report) => {
      const status = String(report?.runtimeStatus || "").trim();
      const channelRef = String(report?.channelRef || "").trim();
      if (report?.ok === false || status === "failed") return "failed";
      if (report?.ok === true && channelRef && status === "applied" && report?.mutation === true) {
        return "applied";
      }
      if (
        report?.ok === true
        && channelRef
        && status === "pending"
        && report?.mutation === false
        && report?.nextAction === "complete_data_plane_handoff"
      ) {
        return "remote_pending";
      }
      return "unavailable";
    });
    const classifiedPendingChannelRefs = reports
      .filter((_, index) => classifiedReports[index] === "remote_pending")
      .map((report) => String(report.channelRef).trim());
    const evidence = (disposition, pendingChannelRefs = []) => ({
      disposition,
      pendingChannelRefs: [...new Set(pendingChannelRefs)],
      runtimeMayHaveMutated,
      compensationRequired: runtimeMayHaveMutated || pendingChannelRefs.length > 0
    });
    if (
      lifecycleResult?.ok === false
      || directStatus === "failed"
      || classifiedReports.includes("failed")
    ) {
      return evidence("failed", classifiedPendingChannelRefs);
    }
    if (
      lifecycleResult?.ok !== true
      || (reports.length > 0 && directStatus)
    ) {
      return evidence("unavailable");
    }
    if (
      reports.length === 0
      && lifecycleResult?.mutation === true
      && directStatus === "applied"
    ) {
      return evidence("applied");
    }
    const directChannelRef = String(lifecycleResult?.channelRef || "").trim();
    if (
      reports.length === 0
      && directStatus === "pending"
      && lifecycleResult?.mutation === false
      && directChannelRef
      && lifecycleResult?.nextAction === "complete_data_plane_handoff"
    ) {
      return evidence("remote_pending", [directChannelRef]);
    }
    if (reports.length > 0) {
      const reportChannelRefs = reports.map((report) => String(report?.channelRef || "").trim());
      if (
        reportChannelRefs.some((channelRef) => !channelRef)
        || new Set(reportChannelRefs).size !== reportChannelRefs.length
      ) {
        return evidence("unavailable");
      }
      const childMutation = reports.some((report) => report?.mutation === true);
      if (typeof lifecycleResult?.mutation !== "boolean" || lifecycleResult.mutation !== childMutation) {
        return evidence("unavailable");
      }
      if (classifiedReports.every((disposition) => disposition === "applied")) {
        return evidence("applied");
      }
      if (
        classifiedReports.includes("remote_pending")
        && classifiedReports.every((disposition) => ["applied", "remote_pending"].includes(disposition))
      ) {
        return evidence("remote_pending", reports
          .filter((_, index) => classifiedReports[index] === "remote_pending")
          .map((report) => String(report.channelRef).trim()));
      }
    }
    return evidence("unavailable");
  }

  function hasRemotePendingNotificationCoverage(desiredStateResult, pendingChannelRefs) {
    const expectedChannelRefs = [...new Set(pendingChannelRefs)];
    const notifications = Array.isArray(desiredStateResult?.notifications)
      ? desiredStateResult.notifications
      : [];
    const notifiedChannelRefs = notifications
      .map((notification) => String(notification?.channelRef || "").trim());
    return (
      desiredStateResult?.ok === true
      && expectedChannelRefs.length > 0
      && Number.isInteger(desiredStateResult?.notificationCount)
      && desiredStateResult.notificationCount === notifications.length
      && notifications.length === expectedChannelRefs.length
      && notifiedChannelRefs.every(Boolean)
      && new Set(notifiedChannelRefs).size === notifiedChannelRefs.length
      && notifications.every((notification) => notification?.status === "pending")
      && expectedChannelRefs.every((channelRef) => notifiedChannelRefs.includes(channelRef))
    );
  }

  function withRuntimeEnforcement(summary, lifecycleResult, desiredStateResult) {
    return {
      ...summary,
      runtimeEnforcement: {
        state: edgeRuntimeEnforcementState(lifecycleResult, desiredStateResult),
        redacted: true
      }
    };
  }

  function assertRefreshCooldown(request, now) {
    if (refreshCooldownMs <= 0) {
      return;
    }
    if (!["delivery_generation_reissued", "old_link_invalidated"].includes(request.event?.type)) {
      return;
    }
    const lastReissuedAt = new Date(request.event.occurredAt || 0).getTime();
    const requestedAt = new Date(now).getTime();
    if (
      Number.isFinite(lastReissuedAt)
      && Number.isFinite(requestedAt)
      && requestedAt - lastReissuedAt < refreshCooldownMs
    ) {
      throw platformError("subscription_refresh_rate_limited", "subscription refresh is rate limited");
    }
  }

  function normalizeAndAttachEdgeCredentials(request, credentials = []) {
    const normalized = credentials.map((credential) => ({
      edgeChannelRef: text(credential.edgeChannelRef, "edgeChannelRef"),
      edgeCredentialRef: text(credential.edgeCredentialRef, "edgeCredentialRef"),
      edgeMaterialDigest: text(credential.edgeMaterialDigest, "edgeMaterialDigest"),
      edgeCredentialMaterial: credential.edgeCredentialMaterial
    }));
    const [primary] = normalized;
    if (primary) {
      request.edgeChannelRef = primary.edgeChannelRef;
      request.edgeCredentialRef = primary.edgeCredentialRef;
      request.edgeMaterialDigest = primary.edgeMaterialDigest;
      request.edgeCredentials = normalized.map((credential) => ({
        edgeChannelRef: credential.edgeChannelRef,
        edgeCredentialRef: credential.edgeCredentialRef,
        edgeMaterialDigest: credential.edgeMaterialDigest
      }));
    }
    return normalized;
  }

  function attachEdgeCredentials(request, { forceRotateCredential = false } = {}) {
    if (!edgeCredentialIssuer) {
      return [];
    }
    if (
      typeof edgeCredentialIssuer.ensureCredentialsForOrder !== "function" &&
      typeof edgeCredentialIssuer.ensureCredentialForOrder !== "function"
    ) {
      throw platformError("validation_error", "edge credential issuer is not configured");
    }
    const order = edgeOrderSummaryFor(request);
    const credentials = typeof edgeCredentialIssuer.ensureCredentialsForOrder === "function"
      ? edgeCredentialIssuer.ensureCredentialsForOrder({
        ...order,
        channelRefs: autoIssuance.channelRefs,
        forceRotateCredential
      })
      : [edgeCredentialIssuer.ensureCredentialForOrder({
        ...order,
        forceRotateCredential
      })];
    return normalizeAndAttachEdgeCredentials(request, credentials);
  }

  function beginEdgeCredentialRotation(request) {
    if (!edgeCredentialIssuer || typeof edgeCredentialIssuer.beginCredentialRotationForOrder !== "function") {
      throw platformError(
        "subscription_refresh_runtime_credential_unavailable",
        "transactional runtime credential rotation is unavailable"
      );
    }
    const rotation = edgeCredentialIssuer.beginCredentialRotationForOrder({
      ...edgeOrderSummaryFor(request),
      channelRefs: autoIssuance.channelRefs
    });
    if (
      !rotation
      || !Array.isArray(rotation.credentials)
      || typeof rotation.commit !== "function"
      || typeof rotation.rollback !== "function"
      || typeof rotation.restore !== "function"
    ) {
      throw platformError("validation_error", "credential rotation transaction is invalid");
    }
    return {
      ...rotation,
      credentials: normalizeAndAttachEdgeCredentials(request, rotation.credentials)
    };
  }

  function bindTenantCredentialMaterial(request, credential) {
    if (
      !credential?.edgeCredentialMaterial ||
      !request.tenantId ||
      !runtimeCore ||
      typeof runtimeCore.bindTenantCredentialMaterial !== "function"
    ) {
      return null;
    }
    return runtimeCore.bindTenantCredentialMaterial({
      tenantId: request.tenantId,
      nodeId: credential.edgeChannelRef,
      credentialRef: credential.edgeCredentialRef,
      material: credential.edgeCredentialMaterial
    });
  }

  function getOwnedDeliveredRecord(input = {}) {
    const request = getRecord(input.requestRef);
    const portalUserRef = text(input.portalUserRef, "portalUserRef");
    if (request.portalUserRef !== portalUserRef) {
      throw platformError("not_found", "portal access request not found");
    }
    if (!["delivered", "issued"].includes(request.status)) {
      throw platformError("validation_error", "subscription order is not active");
    }
    return request;
  }

  function revokeDeliveredTrafficSupply(input = {}, {
    nextAction,
    eventType,
    edgeReason
  } = {}) {
    const now = isoNow(nowFn);
    const request = getOwnedDeliveredRecord(input);

    if (request.artifactId) {
      requireRuntimeMethod("revokeSubscriptionArtifact")(request.artifactId);
    }
    if (request.tenantId) {
      requireRuntimeMethod("disableTenant")(request.tenantId);
    }

    request.status = "disabled";
    request.nextAction = nextAction;
    request.subscriptionUrl = null;
    request.event = {
      type: eventType,
      occurredAt: now
    };
    request.updatedAt = now;
    saveRecord(request);
    const lifecycleResult = notifyEdgeLifecycle(edgeReason, request);
    recordEdgeLifecycleResult(request, lifecycleResult);
    const desiredStateResult = notifyEdgeDesiredState(edgeReason, request);
    return withRuntimeEnforcement(
      summarize(saveRecord(request)),
      lifecycleResult,
      desiredStateResult
    );
  }

  function hasPriorTrial(portalUserRef) {
    return listRecords({ portalUserRef, plan: "trial" }).some((request) =>
      request.portalUserRef === portalUserRef
      && request.plan === "trial"
    );
  }

  function assertAutoIssuanceReady() {
    if (!runtimeCore) {
      throw platformError("validation_error", "portal auto issuance runtime is not configured");
    }
    if (!controlStore) {
      throw platformError("validation_error", "portal auto issuance control store is not configured");
    }
    if (!autoIssuance.nodeId) {
      throw platformError("validation_error", "portal auto issuance node is not configured");
    }
  }

  function assertAutoIssuanceLimit({ id, portalUserRef, plan, submittedAt }) {
    const limit = autoIssuance.monthlyLimits[plan];
    if (!limit) return;
    const period = periodFor(submittedAt);
    const used = listRecords({ portalUserRef, plan }).filter((request) =>
      request.id !== id
      && request.portalUserRef === portalUserRef
      && request.plan === plan
      && periodFor(request.submittedAt) === period
    ).length;
    if (used >= limit) {
      throw platformError("validation_error", "portal auto issuance monthly limit exceeded");
    }
  }

  function autoDeliver(record) {
    assertAutoIssuanceReady();
    assertAutoIssuanceLimit(record);
    const expiresAt = expiresAtFromDuration(record.submittedAt, record.durationDays);
    const entitlementRef = `ent_${record.id}`;
    const accessGrantRef = `grant_${record.id}`;
    const approvalRef = `auto_${record.id}`;
    const issued = executeSubscriptionIssuance({
      controlStore,
      runtimeCore,
      approvalRef,
      now: record.submittedAt,
      input: {
        displayName: record.portalUserRef,
        expiresInDays: record.durationDays,
        expiresAt,
        validUntil: expiresAt,
        plan: record.plan,
        nodeId: autoIssuance.nodeId,
        note: `portal-auto-issuance:${record.id}`,
        artifact: { create: true },
        control: {
          accountId: record.portalUserRef,
          ownerRef: record.portalUserRef,
          entitlementId: entitlementRef,
          requestId: record.id,
          requestedByRef: autoIssuance.reviewedByRef,
          purpose: "portal_auto_issuance",
          plan: record.plan,
          ...(record.plan === "trial"
            ? { trafficLimitBytes: TRIAL_TRAFFIC_LIMIT_BYTES }
            : {})
        }
      }
    });
    return this.markDelivered(record.id, {
      reviewedByRef: autoIssuance.reviewedByRef,
      entitlementRef,
      accessGrantRef,
      tenantId: issued.handoffMaterial.tenantId,
      artifactId: issued.handoffMaterial.artifactId,
      subscriptionUrl: issued.handoffMaterial.subscriptionUrl,
      expiresAt
    });
  }

  return {
    submitRequest(input = {}) {
      const now = isoNow(nowFn);
      const plan = normalizePlan(input.plan);
      const portalUserRef = text(input.portalUserRef, "portalUserRef");
      if (plan === "trial" && hasPriorTrial(portalUserRef)) {
        throw platformError("validation_error", "trial request already exists for this account");
      }
      sequence += 1;
      const record = {
        id: text(input.requestRef || requestIdFactory?.() || nextRequestId(now, sequence), "requestRef"),
        portalUserRef,
        plan,
        clientTarget: normalizeClientTarget(input.clientTarget),
        durationDays: PLANS[plan].durationDays,
        quantity: normalizeQuantity(input.quantity),
        status: "pending_admin_review",
        nextAction: "admin_review_required",
        noteProvided: Boolean(String(input.note || "").trim()),
        priorTrialState: plan === "trial" ? "none" : "not_applicable",
        submittedAt: now,
        updatedAt: now,
        reviewedAt: null,
        reviewedByRef: null,
        safeReasonCode: null,
        expiresAt: null,
        validUntil: null,
        entitlementRef: null,
        accessGrantRef: null,
        tenantId: null,
        artifactId: null,
        subscriptionUrl: null,
        event: null
      };
      saveRecord(record);
      if (autoIssuance.enabled) {
        return autoDeliver.call(this, record);
      }
      return summarize(record);
    },

    listRequests(filters = {}) {
      const status = String(filters.status || "").trim();
      const portalUserRef = String(filters.portalUserRef || "").trim();
      return listRecords({ ...filters, status, portalUserRef })
        .filter((request) => !status || request.status === status)
        .filter((request) => !portalUserRef || request.portalUserRef === portalUserRef)
        .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt) || a.id.localeCompare(b.id))
        .map(summarize);
    },

    listEdgeCredentialOrders(filters = {}) {
      const status = String(filters.status || "").trim();
      return listRecords({ ...filters, status })
        .filter((request) => !status || request.status === status)
        .flatMap(edgeCredentialOrderSummariesFor)
        .sort((a, b) =>
          a.submittedAt.localeCompare(b.submittedAt) ||
          a.id.localeCompare(b.id)
        );
    },

    getRequest(id) {
      return summarize(getRecord(id));
    },

    rejectRequest(id, input = {}) {
      const now = isoNow(nowFn);
      const request = getRecord(id);
      request.status = "rejected";
      request.nextAction = "request_closed";
      request.reviewedAt = now;
      request.reviewedByRef = text(input.reviewedByRef, "reviewedByRef");
      request.safeReasonCode = text(input.reasonCode, "reasonCode");
      request.updatedAt = now;
      return summarize(saveRecord(request));
    },

    previewApproval(id, input = {}) {
      const request = getRecord(id);
      const reviewedByRef = text(input.reviewedByRef, "reviewedByRef");
      const approvalRef = text(input.approvalRef, "approvalRef");
      const nodeId = text(input.nodeId, "nodeId");
      const reviewedAt = isoNow(nowFn);
      const expiresAt = expiresAtFromDuration(reviewedAt, request.durationDays);
      return {
        ok: true,
        mode: "portal-access-request-approval-preview",
        status: "approved_pending_delivery",
        request: summarize({
          ...request,
          status: "approved_pending_delivery",
          nextAction: "admin_delivery_required",
          reviewedAt,
          reviewedByRef,
          expiresAt,
          validUntil: expiresAt
        }),
        issuanceInput: {
          displayName: request.portalUserRef,
          expiresInDays: request.durationDays,
          expiresAt,
          validUntil: expiresAt,
          plan: request.plan,
          nodeId,
          note: `portal-access-request:${request.id}`,
          artifact: { create: true },
          control: {
            accountId: request.portalUserRef,
            ownerRef: request.portalUserRef,
            entitlementId: `ent_${request.id}`,
            requestId: request.id,
            requestedByRef: reviewedByRef,
            purpose: "portal_access_request",
            plan: request.plan,
            ...(request.plan === "trial"
              ? { trafficLimitBytes: TRIAL_TRAFFIC_LIMIT_BYTES }
              : {})
          }
        },
        approvalRef,
        safety: {
          previewOnly: true,
          noSubscriptionUrl: true,
          noRawHandoffMaterial: true,
          noRuntimeMutation: true,
          noProductionMutation: true,
          requiresSeparateIssuanceExecution: true
        }
      };
    },

    markDelivered(id, input = {}) {
      const now = isoNow(nowFn);
      const request = getRecord(id);
      const expiresAt = input.expiresAt || input.validUntil
        ? isoText(input.expiresAt || input.validUntil, "expiresAt")
        : expiresAtFromDuration(now, request.durationDays);
      request.status = "delivered";
      request.nextAction = "user_can_use_access";
      request.reviewedByRef = request.reviewedByRef || text(input.reviewedByRef, "reviewedByRef");
      request.reviewedAt = request.reviewedAt || now;
      request.expiresAt = expiresAt;
      request.validUntil = expiresAt;
      request.entitlementRef = text(input.entitlementRef, "entitlementRef");
      request.accessGrantRef = text(input.accessGrantRef, "accessGrantRef");
      request.tenantId = optionalText(input.tenantId);
      request.artifactId = optionalText(input.artifactId);
      request.subscriptionUrl = optionalText(input.subscriptionUrl);
      request.event = null;
      request.updatedAt = now;
      const credentials = attachEdgeCredentials(request);
      if (credentials.length > 0) {
        for (const credential of credentials) {
          bindTenantCredentialMaterial(request, credential);
        }
        saveRecord(request);
        recordEdgeLifecycleResult(request, notifyEdgeLifecycle("order_delivered", request));
        notifyEdgeDesiredState("order_delivered", request);
      }
      return summarizeVisibleOnce(saveRecord(request));
    },

    updateTrafficLimit(id, input = {}) {
      const now = isoNow(nowFn);
      const request = getRecord(id);
      if (request.status !== "delivered") {
        throw platformError("validation_error", "traffic limit can only be edited after delivery");
      }
      if (!request.entitlementRef) {
        throw platformError("validation_error", "order entitlement is not available");
      }
      if (
        !controlStore
        || typeof controlStore.getEntitlement !== "function"
        || typeof controlStore.updateEntitlementTrafficLimit !== "function"
        || typeof controlStore.recordAuditEvent !== "function"
      ) {
        throw platformError("validation_error", "traffic limit editing is not configured");
      }

      const trafficLimitBytes = requireNonNegativeInteger(input.trafficLimitBytes, "trafficLimitBytes");
      const reviewedByRef = text(input.reviewedByRef || input.actorRef, "reviewedByRef");
      const reasonCode = safeReasonCode(input.reasonCode, "reasonCode");
      const currentEntitlement = controlStore.getEntitlement(request.entitlementRef);
      if (!currentEntitlement) {
        throw platformError("not_found", "order entitlement not found");
      }
      const previousTrafficLimitBytes = requireNonNegativeInteger(
        currentEntitlement.trafficLimitBytes ?? 0,
        "previousTrafficLimitBytes"
      );

      const write = () => {
        const entitlement = controlStore.updateEntitlementTrafficLimit(request.entitlementRef, {
          trafficLimitBytes,
          updatedAt: now
        });
        const audit = controlStore.recordAuditEvent({
          id: auditIdForTrafficLimit({
            requestRef: request.id,
            reviewedByRef,
            reasonCode,
            previousTrafficLimitBytes,
            trafficLimitBytes,
            now
          }),
          entityType: "entitlement",
          entityRef: request.entitlementRef,
          action: "traffic_limit_updated",
          actorRef: reviewedByRef,
          createdAt: now,
          metadata: {
            requestRef: request.id,
            reasonCode,
            previousTrafficLimitBytes,
            trafficLimitBytes
          }
        });
        return { entitlement, audit };
      };
      const { entitlement, audit } = typeof controlStore.runInTransaction === "function"
        ? controlStore.runInTransaction(write)
        : write();
      const requestSummary = summarize(request);
      delete requestSummary.subscriptionUrl;
      requestSummary.safety = {
        ...requestSummary.safety,
        noSubscriptionUrl: true
      };

      return {
        ok: true,
        type: "portal_access_request_traffic_limit_update",
        request: requestSummary,
        quota: {
          entitlementRef: "recorded",
          previousTrafficLimitBytes,
          trafficLimitBytes: entitlement.trafficLimitBytes,
          updatedAt: entitlement.updatedAt
        },
        audit: {
          action: audit.action,
          recordedAt: audit.createdAt
        },
        safety: {
          noSubscriptionUrl: true,
          noRawCustomerData: true,
          noRawHandoffMaterial: true,
          noRuntimeMutation: true,
          noProductionMutation: true
        }
      };
    },

    refreshSubscription(input = {}) {
      const now = isoNow(nowFn);
      const request = getOwnedDeliveredRecord(input);
      const previousRequest = cloneRecord(request);
      if (!request.artifactId) {
        throw platformError("validation_error", "subscription artifact is not available");
      }
      assertRefreshCooldown(request, now);

      const previousDigests = new Map(
        edgeCredentialOrderSummariesFor(request)
          .map((credential) => [credential.edgeCredentialRef, credential.edgeMaterialDigest])
      );
      request.clientTarget = normalizeClientTarget(input.clientTarget || request.clientTarget);
      request.event = {
        type: "delivery_generation_reissued",
        occurredAt: now
      };
      request.updatedAt = now;
      const rotation = beginEdgeCredentialRotation(request);
      let committed = false;
      let runtimeMayHaveMutated = false;
      let runtimeCompensationRequired = false;
      let tenantBindingMayHaveChanged = false;
      let orderMayHaveChanged = false;
      let desiredStateMayHaveChanged = false;
      try {
        const { credentials } = rotation;
        if (credentials.length === 0) {
          throw platformError(
            "subscription_refresh_runtime_credential_unavailable",
            "runtime credential rotation is unavailable"
          );
        }
        const rotationApplied = credentials.every((credential) => (
          previousDigests.get(credential.edgeCredentialRef) !== credential.edgeMaterialDigest
        ));
        if (!rotationApplied) {
          throw platformError(
            "subscription_refresh_runtime_credential_unchanged",
            "runtime credential rotation did not change material"
          );
        }

        runtimeCompensationRequired = true;
        const lifecycleResult = reconcileEdgeLifecycle("order_refreshed", request);
        const lifecycleEvidence = refreshLifecycleDisposition(lifecycleResult);
        runtimeMayHaveMutated = lifecycleEvidence.runtimeMayHaveMutated;
        const lifecycleDisposition = lifecycleEvidence.disposition;
        runtimeCompensationRequired = lifecycleEvidence.compensationRequired;
        if (lifecycleDisposition === "failed") {
          throw platformError("edge_lifecycle_failed", "edge lifecycle reconciliation failed");
        }
        if (lifecycleDisposition === "unavailable") {
          throw platformError(
            "subscription_refresh_runtime_enforcement_pending",
            "runtime credential rotation is pending an applied receipt"
          );
        }

        rotation.commit();
        committed = true;
        tenantBindingMayHaveChanged = true;
        for (const credential of credentials) {
          bindTenantCredentialMaterial(request, credential);
        }
        recordEdgeLifecycleResult(request, lifecycleResult);
        orderMayHaveChanged = true;
        saveRecord(request);
        desiredStateMayHaveChanged = true;
        const desiredStateResult = notifyEdgeDesiredState("order_refreshed", request);
        if (
          lifecycleDisposition === "remote_pending"
          && !hasRemotePendingNotificationCoverage(
            desiredStateResult,
            lifecycleEvidence.pendingChannelRefs
          )
        ) {
          throw platformError(
            "subscription_refresh_runtime_enforcement_pending",
            "runtime credential rotation is pending an applied receipt"
          );
        }
        return withRuntimeEnforcement(
          summarizeVisibleOnce(saveRecord(request)),
          lifecycleResult,
          desiredStateResult
        );
      } catch (error) {
        try {
          if (committed) {
            rotation.restore();
          } else {
            rotation.rollback();
          }
          if (tenantBindingMayHaveChanged) {
            for (const credential of rotation.previousCredentials || []) {
              bindTenantCredentialMaterial(previousRequest, credential);
            }
          }
          if (orderMayHaveChanged) {
            saveRecord(previousRequest);
          }
          let rollbackLifecycleEvidence = null;
          let rollbackPendingChannelRefs = [];
          if (runtimeCompensationRequired) {
            const rollbackResult = reconcileEdgeLifecycle("order_refresh_rolled_back", previousRequest);
            rollbackLifecycleEvidence = refreshLifecycleDisposition(rollbackResult);
            rollbackPendingChannelRefs = rollbackLifecycleEvidence.pendingChannelRefs;
          }
          const rollbackDesiredStateResult = (
            desiredStateMayHaveChanged
            || rollbackPendingChannelRefs.length > 0
          )
            ? notifyEdgeDesiredState("order_refresh_rolled_back", previousRequest)
            : null;
          if (
            rollbackPendingChannelRefs.length > 0
            && !hasRemotePendingNotificationCoverage(
              rollbackDesiredStateResult,
              rollbackPendingChannelRefs
            )
          ) {
            throw platformError("subscription_refresh_rollback_failed", "runtime credential rollback notification is incomplete");
          }
          if (
            rollbackLifecycleEvidence
            && !["applied", "remote_pending"].includes(rollbackLifecycleEvidence.disposition)
          ) {
            throw platformError("subscription_refresh_rollback_failed", "runtime credential rollback was not applied");
          }
        } catch (rollbackError) {
          throw platformError("subscription_refresh_rollback_failed", "runtime credential rollback failed");
        }
        throw error;
      }
    },

    revealSubscription(input = {}) {
      return summarizeVisibleOnce(getOwnedDeliveredRecord(input));
    },

    suspendTrafficSupply(input = {}) {
      return revokeDeliveredTrafficSupply(input, {
        nextAction: "traffic_supply_suspended_quota",
        eventType: "traffic_supply_suspended",
        edgeReason: "traffic_supply_suspended"
      });
    },

    disableSubscription(input = {}) {
      return revokeDeliveredTrafficSupply(input, {
        nextAction: "subscription_disabled",
        eventType: "subscription_disabled",
        edgeReason: "order_disabled"
      });
    }
  };
}
