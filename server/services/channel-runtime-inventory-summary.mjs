const ALLOWED_TOP_LEVEL_KEYS = new Set(["generatedAt", "records"]);
const ALLOWED_RECORD_KEYS = new Set([
  "candidateName",
  "protocol",
  "targetLabel",
  "lifecycleStatus",
  "deploymentReady",
  "blockers",
  "nextGate"
]);
const ALLOWED_LIFECYCLE_STATUSES = new Set([
  "inventory_ready",
  "inventory_blocked",
  "runtime_deployed",
  "runtime_blocked",
  "cleanup_required"
]);

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return String(value ?? "").trim();
}

function safeSummaryError() {
  return new Error("safe runtime inventory summary requires only supported summary fields");
}

function assertExactKeys(value, allowedKeys) {
  if (!isObject(value)) {
    throw safeSummaryError();
  }

  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw safeSummaryError();
    }
  }
}

function uniqueText(values) {
  const result = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = text(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function safeRecord(record) {
  assertExactKeys(record, ALLOWED_RECORD_KEYS);

  const candidateName = text(record.candidateName);
  const protocol = text(record.protocol);
  const targetLabel = text(record.targetLabel);
  const lifecycleStatus = text(record.lifecycleStatus);
  const deploymentReady = record.deploymentReady === true;
  const nextGate = text(record.nextGate);

  if (!candidateName || !protocol || !targetLabel || !nextGate) {
    throw safeSummaryError();
  }
  if (!ALLOWED_LIFECYCLE_STATUSES.has(lifecycleStatus)) {
    throw safeSummaryError();
  }
  if (typeof record.deploymentReady !== "boolean") {
    throw safeSummaryError();
  }
  if (record.blockers !== undefined && !Array.isArray(record.blockers)) {
    throw safeSummaryError();
  }

  return {
    candidateName,
    protocol,
    targetLabel,
    lifecycleStatus,
    deploymentReady,
    blockers: uniqueText(record.blockers),
    nextGate
  };
}

export function buildChannelRuntimeInventorySummary(input = {}) {
  assertExactKeys(input, ALLOWED_TOP_LEVEL_KEYS);
  if (!Array.isArray(input.records)) {
    throw safeSummaryError();
  }

  const records = input.records.map(safeRecord);
  const deploymentReadyCount = records.filter((record) => record.deploymentReady).length;
  const blockedCount = records.length - deploymentReadyCount;

  return {
    ok: true,
    mode: "channel-runtime-inventory-summary",
    generatedAt: text(input.generatedAt) || new Date().toISOString(),
    recordCount: records.length,
    deploymentReadyCount,
    blockedCount,
    records,
    safety: {
      summaryOnly: true,
      noRuntimeMutation: true,
      noProductionMutation: true,
      omittedFields: ["hosts", "ports", "urls", "credentials", "rawLogs", "tokens", "subscriptionUrls"]
    }
  };
}
