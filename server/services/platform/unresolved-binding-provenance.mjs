const UNRESOLVED_REASONS = new Set([
  "binding_missing",
  "channel_mismatch"
]);

function nonNegativeInteger(value) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized >= 0 ? normalized : 0;
}

export function safeUnresolvedReason(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return UNRESOLVED_REASONS.has(normalized) ? normalized : "";
}

export function normalizeUnresolvedReasonCounts(value, unresolvedCount = 0) {
  const total = nonNegativeInteger(unresolvedCount);
  const bindingMissing = nonNegativeInteger(value?.bindingMissing);
  const channelMismatch = nonNegativeInteger(value?.channelMismatch);
  if (bindingMissing + channelMismatch > total) {
    return { bindingMissing: 0, channelMismatch: 0, unknown: total };
  }
  return {
    bindingMissing,
    channelMismatch,
    unknown: total - bindingMissing - channelMismatch
  };
}

export function unresolvedReasonCountsForRecords(records = [], unresolvedCount = 0) {
  let bindingMissing = 0;
  let channelMismatch = 0;
  for (const record of Array.isArray(records) ? records : []) {
    if (record?.ok === true || record?.status !== "unresolved_binding") continue;
    const reason = safeUnresolvedReason(record.unresolvedReason);
    if (reason === "binding_missing") bindingMissing += 1;
    if (reason === "channel_mismatch") channelMismatch += 1;
  }
  return normalizeUnresolvedReasonCounts({ bindingMissing, channelMismatch }, unresolvedCount);
}

export function aggregateUnresolvedReasonCounts(entries = [], unresolvedCount = 0) {
  const known = (Array.isArray(entries) ? entries : []).reduce((counts, entry) => {
    const normalized = normalizeUnresolvedReasonCounts(
      entry?.unresolvedReasonCounts,
      entry?.unresolvedCount
    );
    return {
      bindingMissing: counts.bindingMissing + normalized.bindingMissing,
      channelMismatch: counts.channelMismatch + normalized.channelMismatch
    };
  }, { bindingMissing: 0, channelMismatch: 0 });
  return normalizeUnresolvedReasonCounts(known, unresolvedCount);
}
