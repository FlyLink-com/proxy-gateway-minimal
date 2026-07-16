import {
  usageCycleFiltersForBinding
} from "./usage-billing-cycle.mjs";

const ACTIVITY_LEVELS = new Set([
  "never_seen",
  "seen",
  "active_recently",
  "high_refresh",
  "inactive",
  "blocked"
]);

const COLLECTION_STATUSES = new Set([
  "collector_disabled",
  "not_collected",
  "measured_zero",
  "measured",
  "stale"
]);

function normalizeFilter(value) {
  return String(value ?? "").trim();
}

function normalizeFilters(filters = {}) {
  return {
    accountId: normalizeFilter(filters.accountId),
    plan: normalizeFilter(filters.plan),
    nodeId: normalizeFilter(filters.nodeId),
    status: normalizeFilter(filters.status),
    warning: normalizeFilter(filters.warning),
    from: normalizeFilter(filters.from),
    to: normalizeFilter(filters.to),
    bucket: normalizeBucket(filters.bucket)
  };
}

function normalizeBucket(value) {
  const normalized = normalizeFilter(value).toLowerCase();
  return normalized === "day" ? "day" : "hour";
}

function safeText(value) {
  return String(value ?? "").trim();
}

function safeNumber(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : 0;
}

function safeIso(value) {
  const raw = safeText(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toISOString();
}

function parsedRangeMs(value) {
  const normalized = normalizeFilter(value);
  if (!normalized) return null;
  const ms = new Date(normalized).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function dateMs(value) {
  const raw = safeText(value);
  if (!raw) return 0;
  const ms = new Date(raw).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function callSafe(fn) {
  try {
    return fn();
  } catch {
    return null;
  }
}

function listPortalOrders(controlStore) {
  if (!controlStore?.listPortalAccessRequests) {
    return [];
  }
  return controlStore.listPortalAccessRequests({})
    .filter((request) => request && (request.status === "delivered" || request.tenantId || request.artifactId));
}

function listIssuedBindings(controlStore) {
  if (!controlStore?.listIssuedSubscriptionBindings) {
    return [];
  }
  return controlStore.listIssuedSubscriptionBindings({});
}

function usageRollupsForRequest(controlStore, requestId, edgeCredentialRef) {
  const requestRollups = controlStore?.listUsageRollupsByRequestId
    ? controlStore.listUsageRollupsByRequestId(requestId)
    : [];
  if (requestRollups.length > 0) {
    return requestRollups;
  }
  if (!edgeCredentialRef || !controlStore?.getUsageRollupByEdgeCredentialRef) {
    return [];
  }
  const rollup = controlStore.getUsageRollupByEdgeCredentialRef(edgeCredentialRef);
  return rollup ? [rollup] : [];
}

function usageSamples(controlStore) {
  if (!controlStore?.listUsageSamples) {
    return [];
  }
  return controlStore.listUsageSamples({});
}

function sumRollups(rollups) {
  return rollups.reduce((totals, rollup) => ({
    uploadBytes: totals.uploadBytes + safeNumber(rollup.uploadBytes),
    downloadBytes: totals.downloadBytes + safeNumber(rollup.downloadBytes),
    usedBytes: totals.usedBytes + safeNumber(rollup.totalBytes ?? (
      safeNumber(rollup.uploadBytes) + safeNumber(rollup.downloadBytes)
    )),
    lastObservedAt: dateMs(rollup.lastObservedAt) > dateMs(totals.lastObservedAt)
      ? rollup.lastObservedAt
      : totals.lastObservedAt
  }), {
    uploadBytes: 0,
    downloadBytes: 0,
    usedBytes: 0,
    lastObservedAt: null
  });
}

function rollupChannelUsage(rollup) {
  const uploadBytes = safeNumber(rollup.uploadBytes);
  const downloadBytes = safeNumber(rollup.downloadBytes);
  return {
    channelRef: safeText(rollup.channelRef),
    usedBytes: safeNumber(rollup.totalBytes ?? (uploadBytes + downloadBytes)),
    uploadBytes,
    downloadBytes,
    lastObservedAt: safeIso(rollup.lastObservedAt || null)
  };
}

function usageStatusFor({ rollups, usage }) {
  if (!rollups.length) {
    return "not_collected";
  }
  if (usage.usedBytes > 0 || usage.uploadBytes > 0 || usage.downloadBytes > 0) {
    return "measured";
  }
  return "measured_zero";
}

function tenantSummary(subscriptionCore, tenantRef) {
  if (!tenantRef || !subscriptionCore?.getTenant) {
    return null;
  }
  return callSafe(() => subscriptionCore.getTenant(tenantRef));
}

function artifactSummary(subscriptionCore, tenantRef, artifactRef) {
  if (!tenantRef || !artifactRef || !subscriptionCore?.listSubscriptionArtifacts) {
    return null;
  }
  const artifacts = callSafe(() => subscriptionCore.listSubscriptionArtifacts(tenantRef));
  return Array.isArray(artifacts) ? artifacts.find((artifact) => artifact.id === artifactRef) || null : null;
}

function classifyActivity({ linkStatus, tenantStatus, artifactStatus, refreshCount, lastRefreshAt, usedBytes, nowMs }) {
  const blockedStatuses = new Set(["disabled", "revoked", "rotated", "blocked", "expired"]);
  if ([linkStatus, tenantStatus, artifactStatus].some((status) => blockedStatuses.has(safeText(status)))) {
    return "blocked";
  }
  if (refreshCount >= 20) {
    return "high_refresh";
  }
  if (!lastRefreshAt && usedBytes === 0) {
    return "never_seen";
  }
  const lastSeenMs = dateMs(lastRefreshAt);
  if (lastSeenMs > 0 && nowMs - lastSeenMs <= 48 * 60 * 60 * 1000) {
    return "active_recently";
  }
  if (lastSeenMs > 0 && nowMs - lastSeenMs > 14 * 24 * 60 * 60 * 1000) {
    return "inactive";
  }
  return "seen";
}

function warningCodes(row) {
  const warnings = new Set();
  if (!row.artifactRef || !row.tenantRef) {
    warnings.add("missing_artifact_ref");
  }
  if (row.refreshCount >= 20) {
    warnings.add("high_refresh_count");
  }
  if (row.activityLevel === "blocked") {
    warnings.add("blocked");
  }
  if (row.trafficLimitBytes > 0 && row.usedBytes >= row.trafficLimitBytes) {
    warnings.add("usage_over_limit");
  }
  if (row.trafficLimitBytes > 0 && row.usedBytes >= row.trafficLimitBytes * 0.8 && row.usedBytes < row.trafficLimitBytes) {
    warnings.add("usage_near_limit");
  }
  return [...warnings].sort();
}

function rowMatchesFilters(row, filters) {
  const accountFilter = filters.accountId.toLowerCase();
  if (accountFilter) {
    const accountCandidates = [row.accountId, row.portalUserRef, row.issuanceRequestId]
      .map((value) => safeText(value).toLowerCase());
    if (!accountCandidates.some((value) => value.includes(accountFilter))) {
      return false;
    }
  }
  if (filters.plan && safeText(row.plan).toLowerCase() !== filters.plan.toLowerCase()) {
    return false;
  }
  if (filters.nodeId) {
    const normalizedNode = filters.nodeId.toLowerCase();
    const channelCandidates = [
      row.nodeId,
      ...(Array.isArray(row.issuedChannels) ? row.issuedChannels : []),
      ...row.channelUsages.map((usage) => usage.channelRef)
    ].map((value) => safeText(value).toLowerCase());
    if (!channelCandidates.some((value) => value.includes(normalizedNode))) {
      return false;
    }
  }
  if (filters.status) {
    const normalizedStatus = filters.status.toLowerCase();
    const statusCandidates = [
      row.activityLevel,
      row.linkStatus,
      row.tenantStatus,
      row.artifactStatus
    ].map((value) => safeText(value).toLowerCase());
    if (!statusCandidates.some((value) => value.includes(normalizedStatus))) {
      return false;
    }
  }
  if (filters.warning) {
    const normalizedWarning = filters.warning.toLowerCase();
    if (!row.warnings.some((warning) => warning.toLowerCase().includes(normalizedWarning))) {
      return false;
    }
  }
  return true;
}

function increment(map, key) {
  const normalized = safeText(key) || "unknown";
  map[normalized] = (map[normalized] || 0) + 1;
}

function uniqueSafeTexts(values = []) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const normalized = safeText(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function issuedChannelsFor({ request = {}, binding = {} } = {}) {
  const credentialChannels = Array.isArray(request.edgeCredentials)
    ? request.edgeCredentials.map((credential) => credential?.edgeChannelRef)
    : [];
  return uniqueSafeTexts([
    ...credentialChannels,
    request.edgeChannelRef,
    binding?.nodeId
  ]);
}

function edgeCredentialBindingsFor({ request = {}, binding = {}, rollups = [] } = {}) {
  const rawCredentials = Array.isArray(request.edgeCredentials) ? request.edgeCredentials : [];
  const fallbackCredentials = rawCredentials.length > 0 ? [] : [{
    edgeChannelRef: request.edgeChannelRef || binding?.nodeId,
    edgeCredentialRef: request.edgeCredentialRef || binding?.edgeCredentialRef,
    edgeMaterialDigest: request.edgeMaterialDigest || binding?.edgeMaterialDigest
  }];
  const rollupChannels = new Set(rollups.map((rollup) => safeText(rollup.channelRef)).filter(Boolean));
  const seen = new Set();
  const bindings = [];
  for (const credential of [...rawCredentials, ...fallbackCredentials]) {
    const channelRef = safeText(credential?.edgeChannelRef);
    if (!channelRef || seen.has(channelRef)) {
      continue;
    }
    seen.add(channelRef);
    bindings.push({
      channelRef,
      credentialRefPresent: Boolean(safeText(credential?.edgeCredentialRef)),
      materialDigestPresent: Boolean(safeText(credential?.edgeMaterialDigest)),
      usageMeasured: rollupChannels.has(channelRef)
    });
  }
  return bindings;
}

function collectionStatusFor({ usageStatus, usageCollectorConfigured }) {
  if (usageStatus === "measured" || usageStatus === "measured_zero") {
    return usageStatus;
  }
  return usageCollectorConfigured ? "not_collected" : "collector_disabled";
}

function buildAggregates(items) {
  const aggregates = {
    total: items.length,
    activeRecently: 0,
    neverSeen: 0,
    highRefresh: 0,
    blocked: 0,
    inactive: 0,
    seen: 0,
    withWarnings: 0,
    byPlan: {},
    byNode: {},
    warnings: {},
    usage: {
      totalUsedBytes: 0,
      totalUploadBytes: 0,
      totalDownloadBytes: 0,
      measuredOrders: 0,
      unmeasuredOrders: 0,
      zeroUsageOrders: 0,
      overLimitOrders: 0,
      nearLimitOrders: 0,
      byUsageChannel: {}
    }
  };
  for (const item of items) {
    if (item.activityLevel === "active_recently") aggregates.activeRecently += 1;
    if (item.activityLevel === "never_seen") aggregates.neverSeen += 1;
    if (item.activityLevel === "high_refresh") aggregates.highRefresh += 1;
    if (item.activityLevel === "blocked") aggregates.blocked += 1;
    if (item.activityLevel === "inactive") aggregates.inactive += 1;
    if (item.activityLevel === "seen") aggregates.seen += 1;
    if (item.warnings.length > 0) aggregates.withWarnings += 1;
    increment(aggregates.byPlan, item.plan);
    const issuedChannels = Array.isArray(item.issuedChannels) && item.issuedChannels.length > 0
      ? item.issuedChannels
      : [item.nodeId];
    for (const channelRef of issuedChannels) {
      increment(aggregates.byNode, channelRef);
    }
    aggregates.usage.totalUsedBytes += safeNumber(item.usedBytes);
    aggregates.usage.totalUploadBytes += safeNumber(item.uploadBytes);
    aggregates.usage.totalDownloadBytes += safeNumber(item.downloadBytes);
    if (item.usageStatus === "measured") {
      aggregates.usage.measuredOrders += 1;
    } else if (item.usageStatus === "measured_zero") {
      aggregates.usage.zeroUsageOrders += 1;
    } else {
      aggregates.usage.unmeasuredOrders += 1;
    }
    if (item.trafficLimitBytes > 0 && item.usedBytes >= item.trafficLimitBytes) {
      aggregates.usage.overLimitOrders += 1;
    } else if (item.trafficLimitBytes > 0 && item.usedBytes >= item.trafficLimitBytes * 0.8) {
      aggregates.usage.nearLimitOrders += 1;
    }
    for (const channelUsage of item.channelUsages) {
      const channelRef = safeText(channelUsage.channelRef) || "unknown";
      aggregates.usage.byUsageChannel[channelRef] = (
        aggregates.usage.byUsageChannel[channelRef] || 0
      ) + safeNumber(channelUsage.usedBytes);
    }
    for (const warning of item.warnings) {
      increment(aggregates.warnings, warning);
    }
  }
  return aggregates;
}

function bucketStartIso(value, bucket) {
  const ms = dateMs(value);
  if (!ms) return null;
  const date = new Date(ms);
  if (bucket === "day") {
    date.setUTCHours(0, 0, 0, 0);
  } else {
    date.setUTCMinutes(0, 0, 0);
  }
  return date.toISOString();
}

function addBytes(map, key, amount) {
  const normalized = safeText(key) || "unknown";
  map[normalized] = (map[normalized] || 0) + safeNumber(amount);
}

function currentCycleUsageRowsForRequest({ controlStore, requestId, edgeCredentialRef, binding, nowIso, fallbackRollups }) {
  if (!binding || typeof controlStore?.listUsageSamples !== "function") {
    return fallbackRollups;
  }
  const samples = controlStore.listUsageSamples({
    requestId,
    ...usageCycleFiltersForBinding(binding, nowIso)
  });
  if (!samples.length) {
    return [];
  }
  const rowsByCredential = new Map();
  for (const sample of samples) {
    const key = safeText(sample.edgeCredentialRef) || edgeCredentialRef || `edgecred_${requestId}`;
    const current = rowsByCredential.get(key) || {
      edgeCredentialRef: key,
      accountId: sample.accountId,
      entitlementId: sample.entitlementId,
      requestId: sample.requestId,
      channelRef: sample.channelRef,
      uploadBytes: 0,
      downloadBytes: 0,
      totalBytes: 0,
      lastObservedAt: null,
      updatedAt: null
    };
    const uploadBytes = safeNumber(sample.uploadBytes);
    const downloadBytes = safeNumber(sample.downloadBytes);
    current.channelRef = safeText(sample.channelRef) || current.channelRef;
    current.uploadBytes += uploadBytes;
    current.downloadBytes += downloadBytes;
    current.totalBytes += safeNumber(sample.totalBytes ?? (uploadBytes + downloadBytes));
    current.lastObservedAt = latestIso(current.lastObservedAt, sample.observedAt);
    current.updatedAt = latestIso(current.updatedAt, sample.createdAt || sample.observedAt);
    rowsByCredential.set(key, current);
  }
  return [...rowsByCredential.values()];
}

function latestIso(left, right) {
  return dateMs(right) > dateMs(left) ? safeIso(right) : safeIso(left);
}

function buildUsageTimeseries({ controlStore, items, filters }) {
  const fromMs = parsedRangeMs(filters.from);
  const toMs = parsedRangeMs(filters.to);
  const rowsByRequestId = new Map(items.map((item) => [item.issuanceRequestId, item]));
  const pointsByKey = new Map();

  for (const sample of usageSamples(controlStore)) {
    const row = rowsByRequestId.get(sample.requestId);
    if (!row) {
      continue;
    }
    const observedMs = dateMs(sample.observedAt);
    if (!observedMs) {
      continue;
    }
    if (fromMs !== null && observedMs < fromMs) {
      continue;
    }
    if (toMs !== null && observedMs > toMs) {
      continue;
    }
    const bucketStart = bucketStartIso(sample.observedAt, filters.bucket);
    if (!bucketStart) {
      continue;
    }
    const channelRef = safeText(sample.channelRef) || "unknown";
    const key = [
      bucketStart,
      row.portalUserRef || row.accountId,
      row.issuanceRequestId,
      channelRef
    ].join("\u0000");
    const current = pointsByKey.get(key) || {
      bucketStart,
      accountId: row.accountId,
      portalUserRef: row.portalUserRef,
      issuanceRequestId: row.issuanceRequestId,
      plan: row.plan,
      channelRef,
      uploadBytes: 0,
      downloadBytes: 0,
      usedBytes: 0
    };
    const uploadBytes = safeNumber(sample.uploadBytes);
    const downloadBytes = safeNumber(sample.downloadBytes);
    current.uploadBytes += uploadBytes;
    current.downloadBytes += downloadBytes;
    current.usedBytes += safeNumber(sample.totalBytes ?? (uploadBytes + downloadBytes));
    pointsByKey.set(key, current);
  }

  const points = [...pointsByKey.values()]
    .sort((left, right) => (
      dateMs(left.bucketStart) - dateMs(right.bucketStart)
      || left.portalUserRef.localeCompare(right.portalUserRef)
      || left.issuanceRequestId.localeCompare(right.issuanceRequestId)
      || left.channelRef.localeCompare(right.channelRef)
    ));
  const aggregates = {
    totalUsedBytes: 0,
    totalUploadBytes: 0,
    totalDownloadBytes: 0,
    pointCount: points.length,
    seriesCount: new Set(points.map((point) => `${point.portalUserRef}:${point.issuanceRequestId}:${point.channelRef}`)).size,
    byOrder: {},
    byAccount: {},
    byChannel: {}
  };
  for (const point of points) {
    aggregates.totalUsedBytes += safeNumber(point.usedBytes);
    aggregates.totalUploadBytes += safeNumber(point.uploadBytes);
    aggregates.totalDownloadBytes += safeNumber(point.downloadBytes);
    addBytes(aggregates.byOrder, point.issuanceRequestId, point.usedBytes);
    addBytes(aggregates.byAccount, point.portalUserRef || point.accountId, point.usedBytes);
    addBytes(aggregates.byChannel, point.channelRef, point.usedBytes);
  }

  return {
    type: "subscription_usage_timeseries",
    range: {
      from: filters.from ? safeIso(filters.from) : null,
      to: filters.to ? safeIso(filters.to) : null,
      bucket: filters.bucket
    },
    points,
    aggregates,
    safety: {
      summaryOnly: true,
      orderScoped: true,
      channelBreakdownIncluded: true,
      rawEdgeCredentialReturned: false,
      rawSubscriptionUrlReturned: false,
      rawSecretReturned: false,
      mutationAllowed: false
    }
  };
}

function requestRow({ request, binding, controlStore, subscriptionCore, nowMs, nowIso, usageCollectorConfigured }) {
  const tenantRef = request.tenantId || binding?.tenantRef || null;
  const artifactRef = request.artifactId || binding?.artifactRef || null;
  const usageBinding = tenantRef && controlStore?.findUsageBindingByTenantRef
    ? controlStore.findUsageBindingByTenantRef(tenantRef)
    : null;
  const resolvedBinding = {
    ...(binding || {}),
    ...(usageBinding || {})
  };
  const tenant = tenantSummary(subscriptionCore, tenantRef);
  const artifact = artifactSummary(subscriptionCore, tenantRef, artifactRef);
  const cumulativeRollups = usageRollupsForRequest(
    controlStore,
    request.id,
    request.edgeCredentialRef || resolvedBinding.edgeCredentialRef || `edgecred_${request.id}`
  );
  const rollups = currentCycleUsageRowsForRequest({
    controlStore,
    requestId: request.id,
    edgeCredentialRef: request.edgeCredentialRef || resolvedBinding.edgeCredentialRef || `edgecred_${request.id}`,
    binding: resolvedBinding,
    nowIso,
    fallbackRollups: cumulativeRollups
  });
  const usage = sumRollups(rollups);
  const usageStatus = usageStatusFor({ rollups, usage });
  const issuedChannels = issuedChannelsFor({ request, binding: resolvedBinding });
  const lastRefreshAt = artifact?.lastSeenAt || usage.lastObservedAt || tenant?.lastUsedAt || null;
  const collectionStatus = collectionStatusFor({ usageStatus, usageCollectorConfigured });
  const row = {
    accountId: resolvedBinding.accountId || request.portalUserRef,
    portalUserRef: request.portalUserRef,
    issuanceRequestId: request.id,
    entitlementId: request.entitlementRef || resolvedBinding.entitlementId || "",
    plan: request.plan || resolvedBinding.plan || "",
    quantity: safeNumber(request.quantity || resolvedBinding.quantity || 1),
    nodeId: request.edgeChannelRef || resolvedBinding.nodeId || "",
    issuedChannels,
    tenantRef,
    artifactRef,
    linkStatus: resolvedBinding.status || request.status || "unknown",
    tenantStatus: tenant?.status || "unknown",
    artifactStatus: artifact?.status || (artifactRef ? "unknown" : "missing"),
    validUntil: safeIso(request.validUntil || resolvedBinding.validUntil || null),
    tenantExpiresAt: safeIso(tenant?.expiresAt || request.validUntil || resolvedBinding.validUntil || null),
    lastRefreshAt: safeIso(lastRefreshAt),
    artifactFirstSeenAt: safeIso(artifact?.firstSeenAt || null),
    artifactLastSeenAt: safeIso(artifact?.lastSeenAt || null),
    refreshCount: safeNumber(artifact?.refreshCount),
    trafficLimitBytes: safeNumber(resolvedBinding.trafficLimitBytes || request.trafficLimitBytes),
    usedBytes: usage.usedBytes,
    uploadBytes: usage.uploadBytes,
    downloadBytes: usage.downloadBytes,
    usageStatus,
    collectionStatus: COLLECTION_STATUSES.has(collectionStatus) ? collectionStatus : "not_collected",
    usageMeasured: rollups.length > 0,
    lastUsageObservedAt: safeIso(usage.lastObservedAt || null),
    edgeCredentialBindings: edgeCredentialBindingsFor({ request, binding: resolvedBinding, rollups }),
    channelUsages: rollups.map(rollupChannelUsage)
      .sort((a, b) => a.channelRef.localeCompare(b.channelRef)),
    activityLevel: "seen",
    warnings: []
  };
  row.activityLevel = classifyActivity({
    linkStatus: row.linkStatus,
    tenantStatus: row.tenantStatus,
    artifactStatus: row.artifactStatus,
    refreshCount: row.refreshCount,
    lastRefreshAt: row.lastRefreshAt,
    usedBytes: row.usedBytes,
    nowMs
  });
  if (!ACTIVITY_LEVELS.has(row.activityLevel)) {
    row.activityLevel = "seen";
  }
  row.warnings = warningCodes(row);
  return row;
}

function bindingRow({ binding, controlStore, subscriptionCore, nowMs, nowIso, usageCollectorConfigured }) {
  const request = {
    id: binding.requestId,
    portalUserRef: binding.portalUserRef || binding.accountId,
    plan: binding.plan,
    quantity: 1,
    status: binding.status,
    validUntil: binding.validUntil,
    entitlementRef: binding.entitlementId,
    tenantId: binding.tenantRef,
    artifactId: binding.artifactRef,
    edgeChannelRef: binding.nodeId,
    edgeCredentialRef: binding.edgeCredentialRef
  };
  return requestRow({ request, binding, controlStore, subscriptionCore, nowMs, nowIso, usageCollectorConfigured });
}

export function buildSubscriptionUsageMonitor({
  controlStore,
  subscriptionCore,
  filters = {},
  now = new Date(),
  usageCollectorConfigured = true
} = {}) {
  const normalizedFilters = normalizeFilters(filters);
  const generatedAt = new Date(now).toISOString();
  if (!controlStore) {
    return emptyMonitor({ generatedAt, filters: normalizedFilters });
  }

  const nowMs = new Date(generatedAt).getTime();
  const bindings = listIssuedBindings(controlStore);
  const bindingsByRequestId = new Map(bindings.map((binding) => [binding.requestId, binding]));
  const seenRequestIds = new Set();
  const rows = [];

  for (const request of listPortalOrders(controlStore)) {
    seenRequestIds.add(request.id);
    rows.push(requestRow({
      request,
      binding: bindingsByRequestId.get(request.id) || null,
      controlStore,
      subscriptionCore,
      nowMs,
      nowIso: generatedAt,
      usageCollectorConfigured: Boolean(usageCollectorConfigured)
    }));
  }

  for (const binding of bindings) {
    if (seenRequestIds.has(binding.requestId)) {
      continue;
    }
    rows.push(bindingRow({
      binding,
      controlStore,
      subscriptionCore,
      nowMs,
      nowIso: generatedAt,
      usageCollectorConfigured: Boolean(usageCollectorConfigured)
    }));
  }

  const items = rows
    .filter((row) => rowMatchesFilters(row, normalizedFilters))
    .sort((a, b) => a.issuanceRequestId.localeCompare(b.issuanceRequestId));

  return {
    type: "subscription_usage_monitor",
    generatedAt,
    filters: normalizedFilters,
    aggregates: buildAggregates(items),
    items,
    series: buildUsageTimeseries({ controlStore, items, filters: normalizedFilters }),
    safety: {
      summaryOnly: true,
      realByteUsageMeasured: items.some((item) => item.usedBytes > 0),
      orderLevelRows: true,
      channelUsageBreakdownIncluded: true,
      rawSubscriptionUrlReturned: false,
      rawSecretReturned: false,
      rawCustomerNetworkDataReturned: false,
      rawEdgeCredentialReturned: false,
      usageCollectorConfigured: Boolean(usageCollectorConfigured),
      mutationAllowed: false
    }
  };
}

function emptyMonitor({ generatedAt, filters }) {
  return {
    type: "subscription_usage_monitor",
    generatedAt,
    filters,
    aggregates: buildAggregates([]),
    items: [],
    series: buildUsageTimeseries({ controlStore: null, items: [], filters }),
    safety: {
      summaryOnly: true,
      realByteUsageMeasured: false,
      orderLevelRows: true,
      channelUsageBreakdownIncluded: true,
      rawSubscriptionUrlReturned: false,
      rawSecretReturned: false,
      rawCustomerNetworkDataReturned: false,
      rawEdgeCredentialReturned: false,
      usageCollectorConfigured: false,
      mutationAllowed: false
    }
  };
}
