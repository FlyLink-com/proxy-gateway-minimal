const DEFAULT_FILTERS = {
  nodeId: "",
  from: "",
  to: "",
  bucket: "minute"
};

function text(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function safeNumber(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : 0;
}

function safeInteger(value) {
  return Math.trunc(safeNumber(value));
}

function safeIso(value) {
  const raw = text(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toISOString();
}

function dateMs(value) {
  const raw = text(value);
  if (!raw) return 0;
  const ms = new Date(raw).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function rangeMs(value) {
  const raw = text(value);
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function normalizeBucket(value) {
  const normalized = lower(value);
  if (normalized === "day" || normalized === "hour") {
    return normalized;
  }
  return "minute";
}

function normalizeFilters(filters = {}) {
  return {
    nodeId: text(filters.nodeId),
    from: text(filters.from),
    to: text(filters.to),
    bucket: normalizeBucket(filters.bucket)
  };
}

function bucketStartIso(value, bucket) {
  const ms = dateMs(value);
  if (!ms) return null;
  const date = new Date(ms);
  if (bucket === "day") {
    date.setUTCHours(0, 0, 0, 0);
  } else if (bucket === "hour") {
    date.setUTCMinutes(0, 0, 0);
  } else {
    date.setUTCSeconds(0, 0);
  }
  return date.toISOString();
}

function intervalSeconds(sample = {}) {
  const started = dateMs(sample.intervalStartedAt);
  const ended = dateMs(sample.intervalEndedAt);
  const seconds = (ended - started) / 1000;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

function bpsFor(bytes, seconds) {
  if (!seconds) return 0;
  return safeInteger((safeNumber(bytes) * 8) / seconds);
}

function sampleRates(sample = {}) {
  const seconds = intervalSeconds(sample);
  const uploadBytes = safeNumber(sample.uploadBytes);
  const downloadBytes = safeNumber(sample.downloadBytes);
  const totalBytes = safeNumber(sample.totalBytes ?? uploadBytes + downloadBytes);
  return {
    uploadBps: bpsFor(uploadBytes, seconds),
    downloadBps: bpsFor(downloadBytes, seconds),
    totalBps: bpsFor(totalBytes, seconds)
  };
}

function parseBandwidthBps(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "number") {
    return safeInteger(value);
  }
  const normalized = lower(value).replace(/\s+/g, "");
  const match = /^(\d+(?:\.\d+)?)(bps|kbps|mbps|gbps|tbps)?$/.exec(normalized);
  if (!match) return 0;
  const amount = Number(match[1]);
  const unit = match[2] || "bps";
  const multiplier = {
    bps: 1,
    kbps: 1_000,
    mbps: 1_000_000,
    gbps: 1_000_000_000,
    tbps: 1_000_000_000_000
  }[unit] || 1;
  return safeInteger(amount * multiplier);
}

function capacityBpsFromServer(server = {}) {
  return parseBandwidthBps(
    server.capacityBps
    ?? server.bandwidthBps
    ?? server.maxBandwidthBps
    ?? server.bandwidthLimitBps
    ?? server.bandwidth?.capacityBps
    ?? server.bandwidth?.limitBps
    ?? server.provider?.bandwidthBps
  );
}

function serverRef(server = {}) {
  return text(server.name || server.id || server.channelRef || server.ref);
}

function protocolFrom(server = {}) {
  return text(server.protocol || server.type || server.clashType || "unknown") || "unknown";
}

function physicalNodeRefFrom(server = {}, channelRef) {
  return text(server.physicalNodeRef || server.nodeRef || server.providerNodeRef) || channelRef;
}

function configuredChannels(proxyConfig = {}) {
  return (Array.isArray(proxyConfig.servers) ? proxyConfig.servers : [])
    .map((server) => {
      const channelRef = serverRef(server);
      if (!channelRef) return null;
      return {
        nodeId: channelRef,
        channelRef,
        physicalNodeRef: physicalNodeRefFrom(server, channelRef),
        providerRef: text(server.providerRef || server.provider || ""),
        region: text(server.region || server.regionRef || ""),
        protocol: protocolFrom(server),
        runtimeAdapter: text(server.runtimeAdapter || server.edgeRuntimeAdapter || ""),
        lifecycle: text(server.lifecycle || ""),
        status: text(server.status || (server.lifecycle === "disabled" ? "disabled" : "configured")),
        subscriptionEligible: server.subscriptionEligible !== false && server.autoEligible !== false,
        capacityBps: capacityBpsFromServer(server),
        configured: true
      };
    })
    .filter(Boolean);
}

function listSafe(fn) {
  try {
    const result = typeof fn === "function" ? fn() : [];
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
}

function channelRefsForRequest(request = {}, binding = {}) {
  const refs = [];
  if (Array.isArray(request.edgeCredentials)) {
    refs.push(...request.edgeCredentials.map((credential) => credential?.edgeChannelRef));
  }
  refs.push(request.edgeChannelRef, binding?.nodeId);
  return [...new Set(refs.map(text).filter(Boolean))];
}

function buildOrderIndex(controlStore) {
  const requests = listSafe(() => controlStore?.listPortalAccessRequests?.({}))
    .filter((request) => request && (request.status === "delivered" || request.tenantId || request.artifactId));
  const bindings = listSafe(() => controlStore?.listIssuedSubscriptionBindings?.({}));
  const bindingsByRequest = new Map(bindings.map((binding) => [binding.requestId, binding]));
  const activeOrdersByChannel = new Map();

  for (const request of requests) {
    const binding = bindingsByRequest.get(request.id) || null;
    for (const channelRef of channelRefsForRequest(request, binding)) {
      const set = activeOrdersByChannel.get(channelRef) || new Set();
      set.add(request.id);
      activeOrdersByChannel.set(channelRef, set);
    }
  }
  for (const binding of bindings) {
    if (requests.some((request) => request.id === binding.requestId)) {
      continue;
    }
    const channelRef = text(binding.nodeId);
    if (!channelRef) continue;
    const set = activeOrdersByChannel.get(channelRef) || new Set();
    set.add(binding.requestId);
    activeOrdersByChannel.set(channelRef, set);
  }

  return activeOrdersByChannel;
}

function samplesInRange(controlStore, filters) {
  const fromMs = rangeMs(filters.from);
  const toMs = rangeMs(filters.to);
  return listSafe(() => controlStore?.listUsageSamples?.({}))
    .filter((sample) => {
      const observedMs = dateMs(sample.observedAt);
      if (!observedMs) return false;
      if (fromMs !== null && observedMs < fromMs) return false;
      if (toMs !== null && observedMs > toMs) return false;
      return true;
    });
}

function groupSamplesByChannel(samples) {
  const grouped = new Map();
  for (const sample of samples) {
    const channelRef = text(sample.channelRef) || "unknown";
    const list = grouped.get(channelRef) || [];
    list.push(sample);
    grouped.set(channelRef, list);
  }
  for (const list of grouped.values()) {
    list.sort((left, right) => dateMs(left.observedAt) - dateMs(right.observedAt) || text(left.id).localeCompare(text(right.id)));
  }
  return grouped;
}

function collectionStatusFor({ samples, usageCollectorConfigured, latestObservedAt, generatedAt }) {
  if (samples.length === 0) {
    return usageCollectorConfigured ? "not_collected" : "collector_disabled";
  }
  const latestMs = dateMs(latestObservedAt);
  const generatedMs = dateMs(generatedAt);
  if (latestMs && generatedMs && generatedMs - latestMs > 24 * 60 * 60 * 1000) {
    return "stale";
  }
  const totalBytes = samples.reduce((sum, sample) => sum + safeNumber(sample.totalBytes), 0);
  return totalBytes > 0 ? "measured" : "measured_zero";
}

function utilizationState(utilizationPercent, capacityBps) {
  if (!capacityBps) return "unknown";
  if (utilizationPercent >= 90) return "critical";
  if (utilizationPercent >= 75) return "warning";
  return "normal";
}

function warningsFor({ configured, collectionStatus, utilizationState }) {
  const warnings = [];
  if (!configured) warnings.push("unconfigured_usage_channel");
  if (collectionStatus === "collector_disabled") warnings.push("collector_disabled");
  if (collectionStatus === "not_collected") warnings.push("no_usage_samples");
  if (collectionStatus === "stale") warnings.push("usage_stale");
  if (utilizationState === "warning") warnings.push("utilization_high");
  if (utilizationState === "critical") warnings.push("utilization_critical");
  return warnings;
}

function nodeItem({ channel, samples, activeOrders, generatedAt, usageCollectorConfigured }) {
  const latestSample = samples.at(-1) || null;
  const latestRates = latestSample ? sampleRates(latestSample) : { uploadBps: 0, downloadBps: 0, totalBps: 0 };
  const totals = samples.reduce((sum, sample) => ({
    uploadBytes: sum.uploadBytes + safeNumber(sample.uploadBytes),
    downloadBytes: sum.downloadBytes + safeNumber(sample.downloadBytes),
    totalBytes: sum.totalBytes + safeNumber(sample.totalBytes ?? safeNumber(sample.uploadBytes) + safeNumber(sample.downloadBytes)),
    peakUploadBps: Math.max(sum.peakUploadBps, sampleRates(sample).uploadBps),
    peakDownloadBps: Math.max(sum.peakDownloadBps, sampleRates(sample).downloadBps),
    peakTotalBps: Math.max(sum.peakTotalBps, sampleRates(sample).totalBps)
  }), {
    uploadBytes: 0,
    downloadBytes: 0,
    totalBytes: 0,
    peakUploadBps: 0,
    peakDownloadBps: 0,
    peakTotalBps: 0
  });
  const measuredOrderCount = new Set(samples.map((sample) => text(sample.requestId)).filter(Boolean)).size;
  const latestObservedAt = safeIso(latestSample?.observedAt || null);
  const collectionStatus = collectionStatusFor({
    samples,
    usageCollectorConfigured,
    latestObservedAt,
    generatedAt
  });
  const capacityBps = safeInteger(channel.capacityBps);
  const utilizationPercent = capacityBps ? Math.min(999, safeInteger((latestRates.totalBps / capacityBps) * 100)) : 0;
  const state = utilizationState(utilizationPercent, capacityBps);
  const activeOrderSet = activeOrders.get(channel.channelRef) || new Set();

  return {
    nodeId: channel.nodeId,
    channelRef: channel.channelRef,
    physicalNodeRef: channel.physicalNodeRef,
    providerRef: channel.providerRef,
    region: channel.region,
    protocol: channel.protocol,
    runtimeAdapter: channel.runtimeAdapter,
    lifecycle: channel.lifecycle,
    status: channel.status,
    subscriptionEligible: channel.subscriptionEligible,
    configured: channel.configured === true,
    capacityBps,
    utilizationPercent,
    utilizationState: state,
    activeOrderCount: activeOrderSet.size,
    measuredOrderCount,
    sampleCount: samples.length,
    uploadBytes: safeInteger(totals.uploadBytes),
    downloadBytes: safeInteger(totals.downloadBytes),
    totalBytes: safeInteger(totals.totalBytes),
    currentUploadBps: latestRates.uploadBps,
    currentDownloadBps: latestRates.downloadBps,
    currentTotalBps: latestRates.totalBps,
    peakUploadBps: safeInteger(totals.peakUploadBps),
    peakDownloadBps: safeInteger(totals.peakDownloadBps),
    peakTotalBps: safeInteger(totals.peakTotalBps),
    lastObservedAt: latestObservedAt,
    collectionStatus,
    warnings: warningsFor({
      configured: channel.configured === true,
      collectionStatus,
      utilizationState: state
    })
  };
}

function buildSeries({ samples, filters }) {
  const pointsByKey = new Map();
  for (const sample of samples) {
    const bucketStart = bucketStartIso(sample.observedAt, filters.bucket);
    if (!bucketStart) continue;
    const channelRef = text(sample.channelRef) || "unknown";
    const key = `${bucketStart}\u0000${channelRef}`;
    const rates = sampleRates(sample);
    const current = pointsByKey.get(key) || {
      bucketStart,
      nodeId: channelRef,
      channelRef,
      uploadBytes: 0,
      downloadBytes: 0,
      totalBytes: 0,
      peakTotalBps: 0,
      sampleCount: 0
    };
    const uploadBytes = safeNumber(sample.uploadBytes);
    const downloadBytes = safeNumber(sample.downloadBytes);
    current.uploadBytes += uploadBytes;
    current.downloadBytes += downloadBytes;
    current.totalBytes += safeNumber(sample.totalBytes ?? uploadBytes + downloadBytes);
    current.peakTotalBps = Math.max(current.peakTotalBps, rates.totalBps);
    current.sampleCount += 1;
    pointsByKey.set(key, current);
  }
  return {
    type: "node_bandwidth_timeseries",
    range: {
      from: filters.from ? safeIso(filters.from) : null,
      to: filters.to ? safeIso(filters.to) : null,
      bucket: filters.bucket
    },
    points: [...pointsByKey.values()]
      .map((point) => ({
        ...point,
        uploadBytes: safeInteger(point.uploadBytes),
        downloadBytes: safeInteger(point.downloadBytes),
        totalBytes: safeInteger(point.totalBytes),
        peakTotalBps: safeInteger(point.peakTotalBps)
      }))
      .sort((left, right) =>
        dateMs(left.bucketStart) - dateMs(right.bucketStart)
        || left.nodeId.localeCompare(right.nodeId)
      ),
    safety: {
      summaryOnly: true,
      rawEdgeCredentialReturned: false,
      rawRuntimePayloadReturned: false,
      rawSecretReturned: false,
      mutationAllowed: false
    }
  };
}

function buildAggregates(items) {
  const byNode = {};
  const byPhysicalNode = {};
  let totalBytes = 0;
  let uploadBytes = 0;
  let downloadBytes = 0;
  let measuredNodes = 0;
  let unmeasuredNodes = 0;
  let warningNodes = 0;
  let peakTotalBps = 0;
  for (const item of items) {
    byNode[item.nodeId] = item.totalBytes;
    byPhysicalNode[item.physicalNodeRef || item.nodeId] = (
      byPhysicalNode[item.physicalNodeRef || item.nodeId] || 0
    ) + item.totalBytes;
    totalBytes += item.totalBytes;
    uploadBytes += item.uploadBytes;
    downloadBytes += item.downloadBytes;
    peakTotalBps = Math.max(peakTotalBps, item.peakTotalBps);
    if (item.sampleCount > 0) {
      measuredNodes += 1;
    } else {
      unmeasuredNodes += 1;
    }
    if (item.warnings.length > 0) {
      warningNodes += 1;
    }
  }
  return {
    totalNodes: items.length,
    measuredNodes,
    unmeasuredNodes,
    warningNodes,
    totalBytes: safeInteger(totalBytes),
    uploadBytes: safeInteger(uploadBytes),
    downloadBytes: safeInteger(downloadBytes),
    peakTotalBps: safeInteger(peakTotalBps),
    byNode,
    byPhysicalNode
  };
}

export function buildNodeBandwidthSummary({
  controlStore,
  proxyConfig = {},
  filters = {},
  usageCollectorConfigured = false,
  now = new Date()
} = {}) {
  const normalizedFilters = normalizeFilters(filters);
  const generatedAt = new Date(now).toISOString();
  const activeOrders = buildOrderIndex(controlStore);
  const samples = samplesInRange(controlStore, normalizedFilters);
  const groupedSamples = groupSamplesByChannel(samples);
  const configured = configuredChannels(proxyConfig);
  const channelsByRef = new Map(configured.map((channel) => [channel.channelRef, channel]));

  for (const channelRef of groupedSamples.keys()) {
    if (!channelsByRef.has(channelRef)) {
      channelsByRef.set(channelRef, {
        nodeId: channelRef,
        channelRef,
        physicalNodeRef: channelRef,
        providerRef: "",
        region: "",
        protocol: "unknown",
        runtimeAdapter: "",
        lifecycle: "",
        status: "unconfigured",
        subscriptionEligible: false,
        capacityBps: 0,
        configured: false
      });
    }
  }

  const items = [...channelsByRef.values()]
    .filter((channel) => {
      if (!normalizedFilters.nodeId) return true;
      const needle = lower(normalizedFilters.nodeId);
      return [
        channel.nodeId,
        channel.channelRef,
        channel.physicalNodeRef,
        channel.region,
        channel.protocol
      ].some((value) => lower(value).includes(needle));
    })
    .map((channel) => nodeItem({
      channel,
      samples: groupedSamples.get(channel.channelRef) || [],
      activeOrders,
      generatedAt,
      usageCollectorConfigured: Boolean(usageCollectorConfigured)
    }))
    .sort((left, right) =>
      right.totalBytes - left.totalBytes
      || right.currentTotalBps - left.currentTotalBps
      || left.nodeId.localeCompare(right.nodeId)
    );

  return {
    type: "node_bandwidth_summary",
    generatedAt,
    filters: normalizedFilters,
    aggregates: buildAggregates(items),
    items,
    series: buildSeries({
      samples: samples.filter((sample) => items.some((item) => item.channelRef === text(sample.channelRef))),
      filters: normalizedFilters
    }),
    safety: {
      summaryOnly: true,
      adminOnly: true,
      nodeLevelRows: true,
      rawEdgeCredentialReturned: false,
      rawRuntimePayloadReturned: false,
      rawSecretReturned: false,
      rawSubscriptionUrlReturned: false,
      mutationAllowed: false,
      usageCollectorConfigured: Boolean(usageCollectorConfigured)
    }
  };
}
